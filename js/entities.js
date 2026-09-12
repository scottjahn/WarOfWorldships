// ---- ships, shells, torpedoes, depth charges -------------------------------

const NOTCH = [-0.25, 0, 0.25, 0.5, 0.75, 1];      // index 0 == reverse
const NOTCH_NAME = ['REVERSE', 'STOP', '1/4', '1/2', '3/4', 'FULL'];

const CONSUMABLES = {
  dcp:   { name: 'Damage Ctrl', key: 'R', dur: 5,  cd: 70,  charges: 5 },
  heal:  { name: 'Repair',      key: 'T', dur: 20, cd: 90,  charges: 4 },
  smoke: { name: 'Smoke',       key: 'Y', dur: 18, cd: 110, charges: 4 },
  hydro: { name: 'Hydro',       key: 'Y', dur: 90, cd: 110, charges: 4 },
  radar: { name: 'Radar',       key: 'Y', dur: 30, cd: 120, charges: 3 },
  boost: { name: 'Engine',      key: 'U', dur: 60, cd: 90,  charges: 4 },
  ping:  { name: 'Sonar Ping',  key: 'F', dur: 0,  cd: 14,  charges: 40 },
  fighters: { name: 'Fighters', key: 'Y', dur: 0, cd: 80, charges: 4 },
};

let _uid = 1;

class Ship {
  constructor(def, team, x, y, hd, isPlayer) {
    this.uid = _uid++;
    this.def = def;
    this.team = team;
    this.isPlayer = !!isPlayer;
    this.name = def.name;
    this.cls = def.cls;
    this.tier = def.tier;

    this.x = x; this.y = y; this.hd = hd;
    this.len = def.len; this.beam = def.beam;
    this.aa = def.aa;                         // anti-aircraft battery
    this.speed = 0; this.notch = 2; this.rudder = 0; this.rudderIn = 0;

    this.maxHp = def.hp; this.hp = def.hp;
    this.alive = true;
    this.fires = []; this.flood = 0; this.floodT = 0;
    this.potential = 0;                       // damage a repair party could undo
    this.dcpImmune = 0;

    this.ammo = def.cls === 'BB' ? 'AP' : 'HE';
    this.weapon = 1;                          // 1 guns · 2 torpedoes · 3 depth charges
    this.gunT = 0; this.torpT = 0; this.secT = 0; this.dcT = 0;
    this.lastFired = 99;                      // gun bloom timer
    this.spotted = false; this.spottedT = 0;
    this.aim = { x: x + Math.cos(hd) * 4000, y: y + Math.sin(hd) * 4000 };
    this.target = null;

    // submarine state
    this.depth = 0;                           // 0 surface · 1 periscope · 2 deep
    this.depthF = 0;                          // smoothed for rendering
    this.oxygen = def.oxygen || 0;
    this.pinged = 0;                          // homing lock left on THIS ship

    this.dmgDone = 0; this.kills = 0; this.caps = 0; this.spotDmg = 0;
    this.wake = [];

    this.buildTurrets();
    this.cons = (def.cons || []).map(k => ({
      k, ...CONSUMABLES[k], left: CONSUMABLES[k].charges, active: 0, cool: 0,
    }));
  }

  buildTurrets() {
    const g = this.def.guns, n = g.n;
    let count = (this.cls === 'SS' || this.cls === 'CV') ? 1
              : n <= 4 ? n : n <= 6 ? 3 : n <= 9 ? 3 : 4;
    const per = Math.max(1, Math.round(n / count));
    // fore/aft split: roughly 60% of turrets forward
    const fore = Math.ceil(count / 2);
    this.turrets = [];
    for (let i = 0; i < count; i++) {
      const isFore = i < fore;
      const k = isFore ? i : i - fore;
      const slots = isFore ? fore : count - fore;
      const ox = isFore
        ? lerp(0.34, 0.12, slots === 1 ? 0 : k / (slots - 1))
        : lerp(-0.34, -0.14, slots === 1 ? 0 : k / (slots - 1));
      this.turrets.push({
        ox, barrels: per, isFore,
        arcC: isFore ? 0 : Math.PI,
        arcH: (this.cls === 'DD' || this.cls === 'SS' ? 150 : 145) * DEG,
        ang: this.hd + (isFore ? 0 : Math.PI),
      });
    }
  }

  get maxSpeed() {
    let s = this.def.speedMS;
    if (this.cls === 'SS' && this.depth > 0) s *= this.def.subSpeedMul;
    if (this.consActive('boost')) s *= 1.18;
    return s;
  }

  get concealment() {
    let c = this.def.concealM;
    if (this.cls === 'SS') c *= this.depth === 1 ? 0.55 : this.depth === 2 ? 0.2 : 1;
    if (this.speed < this.def.speedMS * 0.3) c *= 0.9;
    return c;
  }

  consActive(k) { const c = this.cons.find(c => c.k === k); return c && c.active > 0; }
  consumable(k) { return this.cons.find(c => c.k === k); }

  useCons(k, B) {
    const c = this.consumable(k);
    if (!c || c.left <= 0 || c.cool > 0 || c.active > 0) return false;
    c.left--; c.cool = c.cd;
    c.active = Math.max(c.dur, 0.001);
    if (k === 'dcp') { this.fires = []; this.flood = 0; this.dcpImmune = c.dur; }
    if (k === 'smoke') this.smokeT = 15;
    if (k === 'ping') B.sonarPing(this);
    if (k === 'fighters') B.fighters.push(new FighterPatrol(this));
    if (this.isPlayer) B.ribbon(CONSUMABLES[k].name + ' activated');
    return true;
  }

  // ---------------------------------------------------------------- movement
  update(dt, B) {
    if (!this.alive) return;

    // consumable timers
    for (const c of this.cons) {
      if (c.active > 0) { c.active -= dt; if (c.active <= 0 && c.k === 'heal') c.active = 0; }
      else if (c.cool > 0) c.cool -= dt;
    }
    if (this.dcpImmune > 0) this.dcpImmune -= dt;
    if (this.smokeT > 0) {
      this.smokeT -= dt;
      this.puffT = (this.puffT || 0) - dt;
      if (this.puffT <= 0) { this.puffT = 0.45; B.addSmoke(this.x, this.y); }
    }
    if (this.pinged > 0) this.pinged -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt * 3;
    if (this.airT) for (const k in this.airT) if (this.airT[k] > 0) this.airT[k] -= dt;
    this.lastFired += dt;

    // repair party
    const heal = this.consumable('heal');
    if (heal && heal.active > 0) {
      const amt = Math.min(this.potential, this.maxHp * 0.006 * dt);
      this.hp = Math.min(this.maxHp, this.hp + amt);
      this.potential -= amt;
    }

    // fires and flooding
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      this.applyDot(this.maxHp * 0.0028 * dt * (this.isPlayer ? D().burnMul : 1), B, f.owner, 'fire');
      if (f.t <= 0) this.fires.splice(i, 1);
    }
    if (this.flood > 0) {
      this.floodT -= dt;
      this.applyDot(this.maxHp * 0.0048 * dt * (this.isPlayer ? D().burnMul : 1), B, this.floodOwner, 'flood');
      if (this.floodT <= 0) this.flood = 0;
    }
    if (!this.alive) return;

    // submarine depth + oxygen
    if (this.cls === 'SS') {
      this.depthF = lerp(this.depthF, this.depth, Math.min(1, dt * 1.1));
      if (this.depth > 0) {
        this.oxygen -= dt * (this.depth === 2 ? 1.6 : 1);
        if (this.oxygen <= 0) { this.oxygen = 0; this.depth = 0; }
      } else {
        this.oxygen = Math.min(this.def.oxygen, this.oxygen + dt * 12);
      }
    }

    // engine
    const target = this.maxSpeed * NOTCH[this.notch];
    const accel = (this.cls === 'BB' ? 0.9 : this.cls === 'CA' ? 1.5 : 2.2);
    this.speed += clamp(target - this.speed, -accel * dt * 1.6, accel * dt);

    // rudder
    const shift = 1 / this.def.rudder;
    this.rudder = clamp(this.rudder + clamp(this.rudderIn - this.rudder, -shift * dt, shift * dt), -1, 1);
    const turnRate = (Math.abs(this.speed) / this.def.turnR) * this.rudder * Math.sign(this.speed || 1);
    this.hd = normAngle(this.hd + turnRate * dt);
    const drag = 1 - Math.abs(this.rudder) * 0.22;

    const v = this.speed * drag;
    let nx = this.x + Math.cos(this.hd) * v * dt;
    let ny = this.y + Math.sin(this.hd) * v * dt;

    // land collision — submerged boats can slide under nothing, everyone grounds
    const push = World.clearanceDir(nx, ny, this.beam * 0.6);
    if (push) {
      const m = Math.hypot(push.x, push.y) || 1;
      nx += push.x / m * 40 * dt * 10;
      ny += push.y / m * 40 * dt * 10;
      if (Math.abs(this.speed) > 2) {
        this.speed *= 0.965;
        if (this.isPlayer && Math.random() < dt * 2) B.ribbon('Running aground!');
      }
    }
    this.x = clamp(nx, 60, MAP - 60);
    this.y = clamp(ny, 60, MAP - 60);

    // wake trail
    this.wakeT = (this.wakeT || 0) - dt;
    if (this.wakeT <= 0 && Math.abs(this.speed) > 1 && this.depth < 2) {
      this.wakeT = 0.14;
      this.wake.push({ x: this.x, y: this.y, t: 1 });
      if (this.wake.length > 46) this.wake.shift();
    }
    for (const w of this.wake) w.t -= dt * 0.16;
    while (this.wake.length && this.wake[0].t <= 0) this.wake.shift();

    // guns
    if (this.gunT > 0) this.gunT -= dt;
    if (this.torpT > 0) this.torpT -= dt;
    if (this.dcT > 0) this.dcT -= dt;
    this.aimTurrets(dt);
    if (this.def.secondary) this.secondaries(dt, B);
  }

  aimTurrets(dt) {
    const g = this.def.guns;
    const want = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
    for (const t of this.turrets) {
      const rel = angleDiff(this.hd, want);
      const off = normAngle(rel - t.arcC);
      const clamped = Math.abs(off) <= t.arcH ? rel : t.arcC + Math.sign(off) * t.arcH;
      const abs = normAngle(this.hd + clamped);
      t.want = abs;
      t.inArc = Math.abs(off) <= t.arcH;
      t.ang = turnToward(t.ang, abs, g.traverse * dt);
      t.ready = t.inArc && Math.abs(angleDiff(t.ang, abs)) < 2.5 * DEG;
    }
  }

  // ------------------------------------------------------------------ firing
  canShootGuns() {
    if (this.cls === 'SS' && this.depth > 0) return false;
    return this.gunT <= 0;
  }

  fireGuns(B) {
    if (!this.canShootGuns()) return false;
    const g = this.def.guns;
    const range = Math.hypot(this.aim.x - this.x, this.aim.y - this.y);
    if (range > g.range) return false;
    let fired = 0;
    for (const t of this.turrets) {
      if (!t.ready) continue;
      const gx = this.x + Math.cos(this.hd) * this.len * t.ox;
      const gy = this.y + Math.sin(this.hd) * this.len * t.ox;
      for (let b = 0; b < t.barrels; b++) {
        // dispersion: an ellipse stretched along the line of fire
        let spread = range * (this.cls === 'BB' ? 0.0125 : this.cls === 'CA' ? 0.010 : 0.009);
        if (this.isPlayer) spread *= D().spread;
        const along = gauss() * spread / (g.sigma * 0.55);
        const side  = gauss() * spread * 0.42 / (g.sigma * 0.55);
        const dir = Math.atan2(this.aim.y - gy, this.aim.x - gx);
        const tx = this.aim.x + Math.cos(dir) * along - Math.sin(dir) * side;
        const ty = this.aim.y + Math.sin(dir) * along + Math.cos(dir) * side;
        B.shells.push(new Shell(this, gx, gy, tx, ty, g, this.ammo));
        fired++;
      }
      B.addFlash(gx, gy, t.ang, this.cls === 'BB' ? 3 : 1.6);
    }
    if (!fired) return false;
    this.gunT = g.reload * (this.isPlayer ? D().reload : 1);
    this.lastFired = 0;
    return true;
  }

  torpArcOk(bearing) {
    const t = this.def.torps;
    const rel = Math.abs(angleDiff(this.hd, bearing));
    // tubes fire to either beam: blocked dead ahead and dead astern
    return rel > t.arc && rel < Math.PI - t.arc;
  }

  fireTorps(B) {
    const t = this.def.torps;
    if (!t || this.torpT > 0) return false;
    if (this.cls === 'SS' && this.depth === 2) return false;
    const bearing = Math.atan2(this.aim.y - this.y, this.aim.x - this.x);
    if (!this.torpArcOk(bearing) && this.cls !== 'SS') return false;
    const spread = (t.tubes > 1 ? 3.2 : 0) * DEG;
    for (let i = 0; i < t.tubes; i++) {
      const off = (i - (t.tubes - 1) / 2) * spread;
      B.torps.push(new Torpedo(this, bearing + off, t));
    }
    this.torpT = t.reload;
    this.lastFired = Math.min(this.lastFired, 0.5);
    return true;
  }

  dropDepthCharges(B) {
    if (this.cls !== 'DD' && this.cls !== 'CA') return false;
    if (this.dcT > 0) return false;
    for (let i = 0; i < 4; i++) {
      const a = this.hd + Math.PI + rand(0.5, -0.5);
      B.charges.push(new DepthCharge(this,
        this.x + Math.cos(a) * rand(160, 40), this.y + Math.sin(a) * rand(160, 40)));
    }
    this.dcT = 22;
    return true;
  }

  secondaries(dt, B) {
    this.secT -= dt;
    if (this.secT > 0) return;
    const s = this.def.secondary;
    let best = null, bd = s.range;
    for (const e of B.ships) {
      if (!e.alive || e.team === this.team || !e.spotted) continue;
      if (e.cls === 'SS' && e.depth > 0) continue;
      const d = dist(this, e);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { this.secT = 1; return; }
    this.secT = s.reload;
    if (Math.random() < 0.55) {
      best.damage(s.dmg * rand(1.15, 0.85), this, 'HE', B, false);
      if (Math.random() < s.fire) best.startFire(this, B);
      B.tracers.push({ x1: this.x, y1: this.y, x2: best.x, y2: best.y, t: 0.35 });
    }
  }

  // ------------------------------------------------------------------ damage
  applyDot(amount, B, owner, kind) {
    this.hp -= amount;
    this.potential += amount;
    if (owner && owner.alive !== undefined) owner.dmgDone += amount;
    if (this.hp <= 0) this.sink(B, owner, kind);
  }

  damage(amount, from, kind, B, recoverable = true) {
    if (!this.alive) return 0;
    if (this.isPlayer) amount *= D().incoming;
    amount = Math.min(amount, this.hp);
    this.hp -= amount;
    if (recoverable) this.potential += amount * (kind === 'AP' ? 0.1 : 0.55);
    this.dmgTakenTick = (this.dmgTakenTick || 0) + amount;
    if (from) { from.dmgDone += amount; this.lastAttacker = from; }
    this.hitFlash = 0.35;
    if (this.hp <= 0) this.sink(B, from, kind);
    return amount;
  }

  startFire(from, B) {
    if (this.dcpImmune > 0 || this.fires.length >= 4) return;
    this.fires.push({ t: 32, owner: from, off: rand(0.4, -0.4) });
    if (from && from.isPlayer) B.ribbon('Set on fire!');
    if (this.isPlayer) B.warn('FIRE');
  }

  startFlood(from, B) {
    if (this.dcpImmune > 0 || this.flood) return;
    this.flood = 1; this.floodT = 42; this.floodOwner = from;
    if (from && from.isPlayer) B.ribbon('Flooding!');
    if (this.isPlayer) B.warn('FLOODING');
  }

  sink(B, killer, kind) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.sinkT = 0;
    if (killer && killer.alive !== undefined) killer.kills++;
    B.onSink(this, killer, kind);
  }

  // helper: where a shell must be aimed to hit this ship after `t` seconds
  leadPoint(from, shellSpeed) {
    let t = 0;
    for (let i = 0; i < 4; i++) {
      const px = this.x + Math.cos(this.hd) * this.speed * t;
      const py = this.y + Math.sin(this.hd) * this.speed * t;
      t = flightTime(Math.hypot(px - from.x, py - from.y), shellSpeed);
    }
    return { x: this.x + Math.cos(this.hd) * this.speed * t,
             y: this.y + Math.sin(this.hd) * this.speed * t, t };
  }
}

// ---------------------------------------------------------------------- shell
class Shell {
  constructor(owner, x, y, tx, ty, g, type) {
    this.owner = owner; this.team = owner.team;
    this.x0 = x; this.y0 = y; this.tx = tx; this.ty = ty;
    this.x = x; this.y = y;
    this.range = Math.hypot(tx - x, ty - y);
    this.ttl = flightTime(this.range, g.shellSpeed);
    this.t = 0;
    this.type = type;
    this.dmg = type === 'AP' ? g.dmgAP : g.dmgHE;
    this.pen = type === 'AP' ? g.pen : g.hePen;
    this.fire = g.fire;
    this.cal = g.cal;
    this.dir = Math.atan2(ty - y, tx - x);
    this.z = 0;
    // exaggerated ballistic arc: high enough to watch the shells travel
    this.apex = clamp(this.range * 0.075, 25, 1500);
  }

  update(dt, B) {
    this.t += dt;
    const k = Math.min(1, this.t / this.ttl);
    this.x = lerp(this.x0, this.tx, k);
    this.y = lerp(this.y0, this.ty, k);
    this.z = Math.sin(k * Math.PI) * this.apex;     // height above the sea
    if (k < 1) return true;
    this.impact(B);
    return false;
  }

  impact(B) {
    for (const s of B.ships) {
      if (!s.alive || s.team === this.team) continue;
      if (s.cls === 'SS' && s.depth > 0) continue;      // shells cannot touch a dived boat
      if (!inHull(this, s)) continue;
      this.hitShip(s, B);
      return;
    }
    B.addSplash(this.x, this.y, this.cal);
  }

  hitShip(s, B) {
    const player = this.owner.isPlayer;
    // impact angle measured against the target's side
    const rel = Math.abs(angleDiff(this.dir, s.hd + Math.PI / 2));
    const normal = Math.min(Math.abs(normAngle(rel)), Math.abs(normAngle(Math.PI - rel)));
    const broadside = Math.cos(normal);              // 1 = perfect broadside, 0 = bow on
    B.addHit(this.x, this.y, this.type);

    if (this.type === 'AP') {
      if (broadside < 0.32) {
        if (player) B.ribbon('Ricochet');
        return;
      }
      const effPen = this.pen * broadside;
      // small hulls: big shells punch straight through
      if (s.cls === 'DD' || s.cls === 'SS') {
        if (this.cal >= 240) {
          s.damage(this.dmg * 0.1, this.owner, 'AP', B);
          if (player) B.ribbon('Overpenetration');
        } else {
          s.damage(this.dmg / 3, this.owner, 'AP', B);
          if (player) B.ribbon('Penetration');
        }
        return;
      }
      if (effPen < s.def.armor) {
        if (player) B.ribbon('Shatter');
        return;
      }
      // citadel: amidships, broadside on, and enough penetration
      const lx = (this.x - s.x) * Math.cos(-s.hd) - (this.y - s.y) * Math.sin(-s.hd);
      const mid = Math.abs(lx) < s.len * 0.28;
      if (mid && broadside > 0.72 && effPen > s.def.citArmor) {
        s.damage(this.dmg, this.owner, 'AP', B);
        if (player) B.ribbon('CITADEL HIT!');
        B.addHit(this.x, this.y, 'cit');
      } else {
        s.damage(this.dmg / 3, this.owner, 'AP', B);
        if (player) B.ribbon('Penetration');
      }
    } else {
      if (this.pen < s.def.armor * 0.85) {
        if (Math.random() < this.fire * 0.6) s.startFire(this.owner, B);
        if (player) B.ribbon('Shatter');
        return;
      }
      s.damage(this.dmg / 3, this.owner, 'HE', B);
      if (player) B.ribbon('Penetration');
      if (Math.random() < this.fire) s.startFire(this.owner, B);
    }
  }
}

// ------------------------------------------------------------------- torpedo
class Torpedo {
  // `origin` lets a torpedo bomber drop one well away from its carrier
  constructor(owner, hd, t, origin) {
    this.owner = owner; this.team = owner.team;
    const from = origin || { x: owner.x + Math.cos(hd) * owner.beam * 0.8,
                             y: owner.y + Math.sin(hd) * owner.beam * 0.8 };
    this.x = from.x;
    this.y = from.y;
    this.hd = hd;
    this.speed = t.speed;
    this.left = t.range;
    this.dmg = t.dmg;
    this.detect = t.detect;
    this.homing = !!t.homing;
    this.trail = [];
    this.arm = 0.6;
  }

  update(dt, B) {
    this.arm -= dt;
    if (this.homing) {
      // run toward the nearest sonar-marked enemy
      let best = null, bd = 3000;
      for (const s of B.ships) {
        if (!s.alive || s.team === this.team || s.pinged <= 0) continue;
        const d = dist(this, s);
        if (d < bd) { bd = d; best = s; }
      }
      if (best) this.hd = turnToward(this.hd, Math.atan2(best.y - this.y, best.x - this.x), 0.35 * dt);
    }
    const step = this.speed * dt;
    this.x += Math.cos(this.hd) * step;
    this.y += Math.sin(this.hd) * step;
    this.left -= step;

    this.tT = (this.tT || 0) - dt;
    if (this.tT <= 0) {
      this.tT = 0.1;
      this.trail.push({ x: this.x, y: this.y, t: 1 });
      if (this.trail.length > 60) this.trail.shift();
    }
    for (const p of this.trail) p.t -= dt * 0.22;

    if (this.left <= 0) return false;
    if (this.x < 0 || this.y < 0 || this.x > MAP || this.y > MAP) return false;
    if (World.landAt(this.x, this.y, 0)) { B.addSplash(this.x, this.y, 300); return false; }

    if (this.arm <= 0) {
      for (const s of B.ships) {
        if (!s.alive || s.team === this.team) continue;
        if (s.cls === 'SS' && s.depth === 2) continue;
        if (!inHull(this, s)) continue;
        const mul = s.cls === 'DD' || s.cls === 'SS' ? 0.55 : 1;
        s.damage(this.dmg * mul, this.owner, 'TORP', B);
        s.startFlood(this.owner, B);
        B.addExplosion(this.x, this.y, 260);
        if (this.owner.isPlayer) B.ribbon('Torpedo hit!');
        return false;
      }
    }
    return true;
  }
}

// --------------------------------------------------------------- depth charge
class DepthCharge {
  constructor(owner, x, y) {
    this.owner = owner; this.team = owner.team;
    this.x = x; this.y = y; this.fuse = rand(3.4, 2.2);
  }
  update(dt, B) {
    this.fuse -= dt;
    if (this.fuse > 0) return true;
    B.addExplosion(this.x, this.y, 420);
    for (const s of B.ships) {
      if (!s.alive || s.team === this.team) continue;
      const d = dist(this, s);
      if (d > 430) continue;
      const falloff = 1 - d / 430;
      const mul = s.cls === 'SS' ? (s.depth > 0 ? 1 : 0.6) : 0.35;
      s.damage(5400 * falloff * mul, this.owner, 'DC', B);
      if (s.cls === 'SS' && Math.random() < 0.5) s.startFlood(this.owner, B);
      if (this.owner.isPlayer) B.ribbon('Depth charge hit!');
    }
    return false;
  }
}
