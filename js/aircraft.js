// ---- carrier aviation ------------------------------------------------------
// A squadron flies as one object with a formation of individual planes hung off
// it. Anti-aircraft fire kills the planes one at a time, so a squadron bleeds
// strength on the way in rather than dying all at once.

const CRUISE_ALT = 620;          // metres
const ATTACK_ALT = 190;
const RETURN_ALT = 780;

class Squadron {
  constructor(carrier, type) {
    this.owner = carrier;
    this.team = carrier.team;
    this.type = type;
    this.def = carrier.def.air[type];
    this.isPlayer = carrier.isPlayer;

    // launched over the bow, already climbing
    this.hd = carrier.hd;
    this.x = carrier.x + Math.cos(this.hd) * carrier.len * 0.6;
    this.y = carrier.y + Math.sin(this.hd) * carrier.len * 0.6;
    this.z = 120;
    this.speed = this.def.speed;
    this.boost = 0;

    this.planes = [];
    for (let i = 0; i < this.def.planes; i++) {
      this.planes.push({
        hp: this.def.hp,
        ox: (i % 2 ? 1 : -1) * (26 + Math.floor(i / 2) * 20),   // vee formation
        oy: -Math.floor(i / 2) * 34 - (i % 2 ? 14 : 0),
        wob: rand(TAU),
      });
    }
    this.attacksLeft = Math.max(1, Math.floor(this.def.planes / this.def.perAttack));
    this.state = 'out';          // out · run · back
    this.runT = 0;
    this.aim = { x: this.x, y: this.y };
    this.life = 0;
    this.dropCooldown = 0;
  }

  get alive() { return this.planes.length > 0; }
  get count() { return this.planes.length; }

  // ------------------------------------------------------------------ update
  update(dt, B) {
    this.life += dt;
    if (this.dropCooldown > 0) this.dropCooldown -= dt;

    // altitude by state: dive for the attack run, climb away afterwards
    const wantZ = this.state === 'run' ? ATTACK_ALT
                : this.state === 'back' ? RETURN_ALT : CRUISE_ALT;
    this.z += clamp(wantZ - this.z, -190 * dt, 150 * dt);

    if (this.state === 'run') {
      this.runT -= dt;
      if (this.runT <= 0) this.release(B);
    }

    if (this.state === 'back') {
      // fly home; the planes land when they get there
      const c = this.owner;
      if (c.alive) {
        this.steerTo(Math.atan2(c.y - this.y, c.x - this.x), dt, 1.4);
        if (Math.hypot(c.x - this.x, c.y - this.y) < 420) return false;   // recovered
      } else if (this.life > 200) {
        return false;
      }
    }

    const spd = this.speed * (1 + this.boost * 0.35) *
                (this.state === 'run' ? 0.82 : this.state === 'back' ? 1.5 : 1);
    this.x += Math.cos(this.hd) * spd * dt;
    this.y += Math.sin(this.hd) * spd * dt;

    if (this.x < 30 || this.y < 30 || this.x > MAP - 30 || this.y > MAP - 30) {
      this.x = clamp(this.x, 30, MAP - 30);
      this.y = clamp(this.y, 30, MAP - 30);
      this.state = 'back';
    }

    this.takeFlak(dt, B);
    return this.planes.length > 0;
  }

  steerTo(wantHd, dt, rateMul) {
    this.hd = turnToward(this.hd, wantHd, this.def.turn * (rateMul || 1) * dt);
  }

  // -------------------------------------------------------------------- flak
  takeFlak(dt, B) {
    if (this.state === 'back' && this.z > RETURN_ALT - 40) return;  // out of reach
    let incoming = 0, nearest = null, nd = 1e9;
    for (const s of B.ships) {
      if (!s.alive || s.team === this.team || !s.aa) continue;
      if (s.cls === 'SS' && s.depth > 0) continue;
      const d = Math.hypot(s.x - this.x, s.y - this.y);
      if (d > s.aa.range) continue;
      // Fire is heaviest close in, and a committed attack run is far more
      // dangerous than a high transit. Without this the squadron is shot to
      // pieces long before it reaches anything.
      const closeness = 1 - d / s.aa.range;
      const envelope = 0.15 + 0.85 * closeness * closeness;
      incoming += s.aa.dps * envelope * (this.state === 'run' ? 1.25 : 0.55);
      if (d < nd) { nd = d; nearest = s; }
    }
    if (this.isPlayer) incoming *= D().incoming;
    if (incoming <= 0) return;

    this.flakT = (this.flakT || 0) - dt;
    if (this.flakT <= 0 && nearest) {
      this.flakT = 0.18;
      // scatter the bursts around and ahead of the formation: spawning them on
      // the squadron itself puts them straight into the chase camera
      const ahead = rand(520, 120);
      B.addFlak(this.x + Math.cos(this.hd) * ahead + gauss() * 300,
                this.y + Math.sin(this.hd) * ahead + gauss() * 300,
                this.z + gauss() * 130);
    }

    // damage lands on the trailing plane so the formation thins from the back
    let pool = incoming * dt;
    while (pool > 0 && this.planes.length) {
      const p = this.planes[this.planes.length - 1];
      const take = Math.min(pool, p.hp);
      p.hp -= take; pool -= take;
      if (p.hp <= 0) {
        this.planes.pop();
        B.addExplosion(this.x + p.ox, this.y + p.oy, 90);
        B.planeDown(this, nearest);
        if (this.attacksLeft > Math.floor(this.planes.length / this.def.perAttack)) {
          this.attacksLeft = Math.floor(this.planes.length / this.def.perAttack);
        }
      }
    }
  }

  // ------------------------------------------------------------------ attack
  canAttack() {
    // Must be 'out', not merely "not returning": while an attack run is already
    // under way a held mouse button would otherwise restart the dive every
    // frame and nothing would ever be released.
    return this.state === 'out' && this.attacksLeft > 0 &&
           this.planes.length >= 1 && this.dropCooldown <= 0;
  }

  beginRun(aim) {
    if (!this.canAttack()) return false;
    this.aim = { x: aim.x, y: aim.y };
    this.state = 'run';
    this.runT = 1.3;                 // the dive, before anything is released
    return true;
  }

  release(B) {
    const d = this.def;
    const n = Math.min(this.def.perAttack, this.planes.length);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2);
      if (this.type === 'tb') {
        // torpedoes run on in the direction of flight — you must lead the target
        const spreadHd = this.hd + off * 3.5 * DEG;
        const t = { speed: d.torpSpeed, range: d.torpRange, dmg: d.dmg,
                    detect: 900, arc: 0 };
        B.torps.push(new Torpedo(this.owner, spreadHd, t,
          { x: this.x + off * 45, y: this.y + off * 45 }));
      } else {
        const sx = this.aim.x + gauss() * d.spread + off * 26;
        const sy = this.aim.y + gauss() * d.spread + off * 26;
        B.bombs.push(new Bomb(this, sx, sy, this.type === 'rk'));
      }
    }
    this.attacksLeft--;
    this.dropCooldown = 3.5;
    this.state = this.attacksLeft > 0 ? 'out' : 'back';
    // once they are on the way home the deck is free for the next strike
    if (this.state === 'back' && this.owner.squadOut === this) this.owner.squadOut = null;
    if (this.isPlayer) B.ribbon(d.name + ' away');
  }

  recall() { this.state = 'back'; }
}

// --------------------------------------------------------------------- bombs
// Covers both bombs and rockets: something released from a plane that arrives
// at a point on the sea a moment later.
class Bomb {
  constructor(squad, tx, ty, isRocket) {
    this.owner = squad.owner;
    this.team = squad.team;
    this.squad = squad;
    this.x0 = squad.x; this.y0 = squad.y; this.z0 = squad.z;
    this.tx = tx; this.ty = ty;
    this.x = this.x0; this.y = this.y0; this.z = this.z0;
    this.rocket = isRocket;
    const dist2d = Math.hypot(tx - this.x0, ty - this.y0);
    this.ttl = isRocket ? clamp(dist2d / 340, 0.25, 2.2)
                        : clamp(Math.sqrt(2 * this.z0 / 9.81) * 0.62, 0.8, 3.2);
    this.t = 0;
    this.dmg = squad.def.dmg;
    this.fire = squad.def.fire;
    // rockets are light weapons — fine against destroyers and cruisers, but
    // they will not trouble a battleship's deck. Bombs will.
    this.pen = isRocket ? 50 : 95;
    this.isPlayerShot = squad.isPlayer;
  }

  update(dt, B) {
    this.t += dt;
    const k = Math.min(1, this.t / this.ttl);
    this.x = lerp(this.x0, this.tx, k);
    this.y = lerp(this.y0, this.ty, k);
    this.z = this.rocket ? lerp(this.z0, 12, k) : lerp(this.z0, 0, k * k);
    if (k < 1) return true;

    for (const s of B.ships) {
      if (!s.alive || s.team === this.team) continue;
      if (s.cls === 'SS' && s.depth > 0) continue;
      if (!inHull(this, s)) continue;
      // bombs and rockets behave like HE: they must beat the deck armour
      if (this.pen >= s.def.armor) {
        s.damage(this.dmg / 3, this.owner, 'HE', B);
        if (this.isPlayerShot) B.ribbon(this.rocket ? 'Rocket hit!' : 'Bomb hit!');
      } else if (this.isPlayerShot) {
        B.ribbon('Shatter');
      }
      if (Math.random() < this.fire) s.startFire(this.owner, B);
      B.addExplosion(this.x, this.y, this.rocket ? 90 : 210);
      return false;
    }
    B.addSplash(this.x, this.y, this.rocket ? 90 : 260);
    return false;
  }
}

// ------------------------------------------------------------------ fighters
// The fighter consumable: a standing patrol that shreds any squadron that comes
// near the ship that launched it.
class FighterPatrol {
  constructor(ship) {
    this.owner = ship; this.team = ship.team;
    this.x = ship.x; this.y = ship.y; this.z = 540;
    this.t = 70; this.a = 0; this.r = 900;
    this.dps = 320 + ship.tier * 55;
  }
  update(dt, B) {
    this.t -= dt;
    this.a += dt * 0.5;
    // drift with the ship that launched it
    if (this.owner.alive) { this.cx = this.owner.x; this.cy = this.owner.y; }
    this.cx = this.cx === undefined ? this.x : this.cx;
    this.cy = this.cy === undefined ? this.y : this.cy;
    this.x = this.cx + Math.cos(this.a) * this.r;
    this.y = this.cy + Math.sin(this.a) * this.r;
    for (const sq of B.squads) {
      if (sq.team === this.team) continue;
      if (Math.hypot(sq.x - this.cx, sq.y - this.cy) > 2600) continue;
      let pool = this.dps * dt;
      while (pool > 0 && sq.planes.length) {
        const p = sq.planes[sq.planes.length - 1];
        const take = Math.min(pool, p.hp);
        p.hp -= take; pool -= take;
        if (p.hp <= 0) {
          sq.planes.pop();
          B.addExplosion(sq.x, sq.y, 90);
          B.planeDown(sq, this.owner);
        }
      }
    }
    return this.t > 0;
  }
}
