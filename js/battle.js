// ---- battle: teams, spotting, capture zones, scoring -----------------------

const MATCH_TIME = 15 * 60;    // the Admiral setting; see js/difficulty.js

const Battle = {
  ships: [], bots: [], shells: [], torps: [], charges: [],
  squads: [], bombs: [], fighters: [],
  smokes: [], fx: [], tracers: [], pings: [],
  score: { 1: 0, 2: 0 },
  time: MATCH_TIME,
  running: false,
  over: false,
  player: null,
  camTarget: null,
  killfeed: [],

  // ------------------------------------------------------------------- setup
  start(playerShipId, perTeam) {
    World.generate();
    this.ships = []; this.bots = []; this.shells = []; this.torps = [];
    this.charges = []; this.smokes = []; this.fx = []; this.tracers = []; this.pings = [];
    this.squads = []; this.bombs = []; this.fighters = [];
    this.playerSquad = null;
    this.score = { 1: 0, 2: 0 };
    this.time = D().matchTime;
    this.over = false; this.running = true;
    this.killfeed = [];
    this.usedNames = {};

    const pDef = SHIPS[playerShipId];
    const tier = pDef.tier;

    const green = [pDef].concat(this.pickOpponents(perTeam - 1, tier, pDef.cls));
    const red = this.pickOpponents(perTeam, tier, null);

    const gs = World.spawnPoints(1, green.length);
    const rs = World.spawnPoints(2, red.length);

    green.forEach((def, i) => {
      const s = new Ship(def, 1, gs[i].x, gs[i].y, -Math.PI / 2, i === 0);
      s.name = this.uniqueName(def.name);
      this.ships.push(s);
      if (i === 0) { this.player = s; this.camTarget = s; }
      else this.bots.push(new Bot(s, rand(D().botSkill[1], D().botSkill[0])));
    });
    red.forEach((def, i) => {
      const s = new Ship(def, 2, rs[i].x, rs[i].y, Math.PI / 2, false);
      s.name = this.uniqueName(def.name);
      this.ships.push(s);
      this.bots.push(new Bot(s, rand(D().botSkill[1], D().botSkill[0])));
    });
  },

  uniqueName(n) {
    this.usedNames[n] = (this.usedNames[n] || 0) + 1;
    return this.usedNames[n] > 1 ? n + ' ' + this.usedNames[n] : n;
  },

  // a balanced spread of hulls within one tier of the player
  pickOpponents(n, tier, avoidCls) {
    // only real hulls crew the other ships; your own designs stay yours
    const pool = cls => Object.values(SHIPS).filter(s =>
      s.cls === cls && !s.custom && Math.abs(s.tier - tier) <= 1 && s.tier >= 1);
    const out = [];
    const plan = [];
    plan.push('DD');
    if (tier >= 4) plan.push('CV');
    if (tier >= 6) plan.push('SS');
    plan.push('BB', 'CA', 'CA', 'BB', 'DD', 'CA');
    for (let i = 0; i < n; i++) {
      let cls = plan[i % plan.length];
      let p = pool(cls);
      if (!p.length) p = pool('CA');
      if (!p.length) p = Object.values(SHIPS).filter(s => !s.custom && Math.abs(s.tier - tier) <= 1);
      out.push(choice(p));
    }
    return out;
  },

  // Advance the battle by `totalDt` seconds of game time, in steps no larger
  // than a frame's worth. Multiplying dt directly would hand the simulation a
  // 0.4-second step at 8x, and ships would skip straight through islands.
  advance(totalDt) {
    if (!this.running) return;
    const MAX_STEP = 0.05;
    let left = Math.min(totalDt, 1.2);          // never chew more than this per frame
    let guard = 0;
    while (left > 1e-4 && guard++ < 64) {
      const step = Math.min(MAX_STEP, left);
      this.update(step);
      left -= step;
    }
  },

  // ------------------------------------------------------------------ update
  update(dt) {
    if (!this.running) return;
    if (!this.over) this.time -= dt;

    for (const s of this.ships) s.update(dt, this);
    for (const b of this.bots) b.update(dt, this);
    for (let i = this.squads.length - 1; i >= 0; i--) {
      const sq = this.squads[i];
      if (!sq.update(dt, this)) {
        if (this.playerSquad === sq) this.playerSquad = null;
        if (sq.owner) sq.owner.squadOut = null;
        this.squads.splice(i, 1);
      }
    }
    for (let i = this.fighters.length - 1; i >= 0; i--)
      if (!this.fighters[i].update(dt, this)) this.fighters.splice(i, 1);

    this.shipCollisions(dt);
    this.updateProjectiles(dt);
    this.spot(dt);
    this.capture(dt);
    this.updateFx(dt);

    if (!this.over) this.checkEnd();
  },

  updateProjectiles(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--)
      if (!this.shells[i].update(dt, this)) this.shells.splice(i, 1);
    for (let i = this.torps.length - 1; i >= 0; i--)
      if (!this.torps[i].update(dt, this)) this.torps.splice(i, 1);
    for (let i = this.charges.length - 1; i >= 0; i--)
      if (!this.charges[i].update(dt, this)) this.charges.splice(i, 1);
    for (let i = this.bombs.length - 1; i >= 0; i--)
      if (!this.bombs[i].update(dt, this)) this.bombs.splice(i, 1);
  },

  shipCollisions(dt) {
    for (let i = 0; i < this.ships.length; i++) {
      const a = this.ships[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.ships.length; j++) {
        const b = this.ships[j];
        if (!b.alive) continue;
        if (a.cls === 'SS' && a.depth === 2) continue;
        if (b.cls === 'SS' && b.depth === 2) continue;
        const rr = (a.len + b.len) * 0.28;
        const d = dist(a, b);
        if (d > rr || d < 1) continue;
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        const push = (rr - d) * 0.5;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const impact = Math.abs(a.speed) + Math.abs(b.speed);
        if (impact > 4 && a.team !== b.team) {
          a.damage(impact * 22 * dt * 60 * 0.02, b, 'RAM', this);
          b.damage(impact * 22 * dt * 60 * 0.02, a, 'RAM', this);
        }
        a.speed *= 0.985; b.speed *= 0.985;
      }
    }
  },

  // ---------------------------------------------------------------- spotting
  spot(dt) {
    this.spotT = (this.spotT || 0) - dt;
    if (this.spotT > 0) {
      // credit spotting damage continuously
      return;
    }
    this.spotT = 0.2;

    for (const s of this.ships) {
      if (!s.alive) { s.spotted = false; continue; }
      const foes = this.ships.filter(o => o.alive && o.team !== s.team);
      let seen = false, spotter = null;

      const inSmoke = this.smokes.some(sm => dist(s, sm) < sm.r);

      for (const o of foes) {
        const d = dist(s, o);
        const los = !World.blocked(s.x, s.y, o.x, o.y);

        // radar sees through everything
        if (o.consActive('radar') && d < 9000) { seen = true; spotter = o; break; }
        if (o.consActive('hydro') && d < 4200) { seen = true; spotter = o; break; }

        // escorts carry listening gear: a submerged boat close by is a contact
        if (s.cls === 'SS' && s.depth > 0 && (o.cls === 'DD' || o.cls === 'CA') &&
            d < (s.depth === 1 ? 3000 : 1300)) { seen = true; spotter = o; break; }
        if (s.cls === 'SS' && s.depth === 2) continue;   // otherwise only radar/hydro find a deep boat

        if (los && d < s.concealment && !(inSmoke && d > 2000)) { seen = true; spotter = o; break; }
        // muzzle flashes give you away
        if (s.lastFired < 3 && los && d < s.def.guns.range * 1.3 && s.depth === 0) {
          seen = true; spotter = o; break;
        }
      }
      // aircraft are superb spotters — this is most of what a carrier does
      if (!seen && !(s.cls === 'SS' && s.depth > 0)) {
        for (const sq of this.squads) {
          if (sq.team === s.team) continue;
          if (Math.hypot(sq.x - s.x, sq.y - s.y) < 4000) { seen = true; break; }
        }
      }
      const was = s.spotted;
      s.spotted = seen;
      s.spotter = spotter;
      if (seen && !was) s.spotSince = 0;
    }

    // spotting-damage credit for the player
    const p = this.player;
    if (p && p.alive) {
      for (const s of this.ships) {
        if (s.team === p.team || !s.spotted) continue;
        if (s.spotter === p) p.spotDmg += (s.dmgTakenTick || 0);
      }
    }
    for (const s of this.ships) s.dmgTakenTick = 0;
  },

  planeDown(squad, killer) {
    if (killer && killer.isPlayer) this.ribbon('Aircraft shot down');
    if (squad.isPlayer && squad.planes.length === 0)
      this.bigMsg('SQUADRON WIPED OUT', '#ff5a5a');
  },

  addFlak(x, y, z) { this.fx.push({ k: 'flak', x, y, z, t: 1 }); },

  launch(carrier, type) {
    if (!carrier.alive || carrier.cls !== 'CV') return null;
    if (carrier.squadOut) return carrier.squadOut;
    if ((carrier.airT && carrier.airT[type] || 0) > 0) return null;
    const sq = new Squadron(carrier, type);
    this.squads.push(sq);
    carrier.squadOut = sq;
    carrier.airT = carrier.airT || {};
    carrier.airT[type] = carrier.def.air[type].reload;
    return sq;
  },

  visibleTo(ship, team) {
    if (ship.team === team) return true;
    return ship.spotted;
  },

  // ---------------------------------------------------------------- capture
  capture(dt) {
    for (const z of World.zones) {
      let n1 = 0, n2 = 0;
      for (const s of this.ships) {
        if (!s.alive) continue;
        if (s.cls === 'SS' && s.depth === 2) continue;
        if (dist(s, z) > z.r) continue;
        if (s.team === 1) n1++; else n2++;
      }
      z.contest = n1 > 0 && n2 > 0;
      const cap = n1 > 0 && n2 === 0 ? 1 : n2 > 0 && n1 === 0 ? 2 : 0;

      if (cap && cap !== z.owner) {
        const rate = (12 + (cap === 1 ? n1 : n2) * 4);
        z.progress += rate * dt;
        z.capBy = cap;
        if (z.progress >= 100) {
          z.progress = 0;
          const prev = z.owner;
          z.owner = cap;
          this.ribbonTeam(cap, 'Base ' + z.key + ' captured');
          if (cap === 1) {
            for (const s of this.ships)
              if (s.alive && s.team === 1 && dist(s, z) < z.r) s.caps++;
          }
          if (prev) this.bigMsg((prev === 1 ? 'We lost ' : 'We captured ') + 'Base ' + z.key,
                                prev === 1 ? '#ff5a5a' : '#4ad07a');
        }
      } else if (!cap) {
        z.progress = Math.max(0, z.progress - 14 * dt);
      }

      if (z.owner) this.score[z.owner] += 1.3 * dt;
    }
  },

  onSink(ship, killer, kind) {
    this.addExplosion(ship.x, ship.y, ship.len * 1.6);
    this.score[ship.team === 1 ? 2 : 1] += 45;
    this.killfeed.unshift({
      t: 6, killer: killer ? killer.name : 'the sea', victim: ship.name,
      team: ship.team, kind,
    });
    if (killer && killer.isPlayer) {
      this.ribbon('☠ ' + ship.name + ' sunk!');
      this.bigMsg(ship.name + ' DESTROYED', '#f2c14e');
    }
    if (ship.isPlayer) {
      this.bigMsg('YOUR SHIP HAS BEEN SUNK', '#ff5a5a');
      this.camTarget = this.ships.find(s => s.alive && s.team === 1) || ship;
    }
    if (ship === this.camTarget && !ship.isPlayer)
      this.camTarget = this.ships.find(s => s.alive && s.team === 1) || this.player;
  },

  checkEnd() {
    const alive1 = this.ships.some(s => s.alive && s.team === 1);
    const alive2 = this.ships.some(s => s.alive && s.team === 2);
    if (!alive2)                 return this.end(true, 'Enemy fleet destroyed');
    if (!alive1)                 return this.end(false, 'Your fleet was destroyed');
    if (this.score[1] >= D().winScore) return this.end(true, 'Points victory');
    if (this.score[2] >= D().winScore) return this.end(false, 'The enemy reached ' + D().winScore + ' points');
    if (this.time <= 0)
      return this.end(this.score[1] >= this.score[2],
        this.score[1] >= this.score[2] ? 'Ahead on points at time' : 'Behind on points at time');
  },

  end(win, why) {
    this.over = true;
    this.result = { win, why };
    setTimeout(() => UI.showResults(win, why), 1400);
  },

  // ------------------------------------------------------------------ sonar
  sonarPing(sub) {
    const dir = Math.atan2(sub.aim.y - sub.y, sub.aim.x - sub.x);
    this.pings.push({ x: sub.x, y: sub.y, dir, r: 0, t: 1.6, team: sub.team });
    for (const s of this.ships) {
      if (!s.alive || s.team === sub.team) continue;
      const d = dist(sub, s);
      if (d > 3600) continue;
      if (Math.abs(angleDiff(dir, Math.atan2(s.y - sub.y, s.x - sub.x))) > 22 * DEG) continue;
      s.pinged = 18;
      if (sub.isPlayer) this.ribbon('Sonar lock: ' + s.name);
    }
  },

  // ----------------------------------------------------------------- effects
  addSplash(x, y, cal)   { this.fx.push({ k: 'splash', x, y, t: 1, r: 12 + cal / 8 }); },
  addHit(x, y, type)     { this.fx.push({ k: 'hit', x, y, t: 0.5, type }); },
  addExplosion(x, y, r)  { this.fx.push({ k: 'boom', x, y, t: 1.2, r }); },
  addFlash(x, y, a, s)   { this.fx.push({ k: 'flash', x, y, a, s, t: 0.18 }); },
  addSmoke(x, y) {
    if (this.smokes.length > 90) return;
    this.smokes.push({ x, y, r: 0, rMax: rand(340, 280), t: 62 });
  },

  updateFx(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      this.fx[i].t -= dt * (this.fx[i].k === 'boom' ? 0.9 : 1.6);
      if (this.fx[i].t <= 0) this.fx.splice(i, 1);
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].t -= dt * 3;
      if (this.tracers[i].t <= 0) this.tracers.splice(i, 1);
    }
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t -= dt;
      s.r = lerp(s.r, s.t < 6 ? 0 : s.rMax, Math.min(1, dt * 1.4));
      if (s.t <= 0) this.smokes.splice(i, 1);
    }
    for (let i = this.pings.length - 1; i >= 0; i--) {
      const p = this.pings[i];
      p.t -= dt; p.r += 2400 * dt;
      if (p.t <= 0) this.pings.splice(i, 1);
    }
    for (let i = this.killfeed.length - 1; i >= 0; i--) {
      this.killfeed[i].t -= dt;
      if (this.killfeed[i].t <= 0) this.killfeed.splice(i, 1);
    }
    for (const s of this.ships) if (!s.alive && s.sinkT !== undefined) s.sinkT += dt;
  },

  // --------------------------------------------------------------- messaging
  ribbon(text) { UI.ribbon(text); },
  ribbonTeam(team, text) { if (team === 1) UI.ribbon(text); },
  warn(text) { UI.ribbon('⚠ ' + text); },
  bigMsg(text, color) { UI.bigMsg(text, color); },
};
