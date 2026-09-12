// ---- bot captains ----------------------------------------------------------
// Each class fights the way it does in the real game: destroyers cap and
// torpedo, cruisers kite at medium range, battleships close and angle,
// submarines dive, ping and shoot homing fish.

const PREFERRED = { DD: 0.55, CA: 0.78, BB: 0.72, SS: 0.5, CV: 2.6 };   // fraction of gun range

class Bot {
  constructor(ship, skill) {
    this.s = ship;
    this.skill = skill;                 // 0..1 — aim quality and reaction time
    this.goal = null;
    this.think = 0;
    this.retreat = false;
    this.torpT = rand(6, 1);
  }

  update(dt, B) {
    const s = this.s;
    if (!s.alive) return;
    this.think -= dt;
    if (this.think <= 0) { this.think = rand(1.1, 0.5); this.plan(B); }

    this.steer(dt, B);
    this.fight(dt, B);
    this.useKit(dt, B);
  }

  // ------------------------------------------------------------------ target
  plan(B) {
    const s = this.s;
    let best = null, score = -1e9;
    for (const e of B.ships) {
      if (!e.alive || e.team === s.team) continue;
      if (!B.visibleTo(e, s.team)) continue;
      if (e.cls === 'SS' && e.depth > 0 && s.cls !== 'DD') continue;
      const d = dist(s, e);
      if (d > s.def.guns.range * 1.35 && !(s.cls === 'SS' && d < s.def.torps.range)) continue;
      let v = 1000 - d / 12;
      v += (1 - e.hp / e.maxHp) * 500;                     // finish wounded ships
      if (e.cls === 'DD' && s.cls !== 'BB') v += 300;
      if (e.cls === 'BB' && s.cls === 'SS') v += 700;
      if (e === s.lastAttacker) v += 250;
      if (e.isPlayer) v *= D().playerFocus;      // ease off the eight-year-old
      if (v > score) { score = v; best = e; }
    }
    s.target = best;
    this.retreat = s.hp / s.maxHp < 0.28 && s.cls !== 'BB';

    // destroyers exist to take the bases: unless something is shooting at them
    // from close range, they go and sit on the nearest zone we do not own
    // a detected submarine nearby outranks everything else for an escort
    this.hunt = null;
    if (s.cls === 'DD' || s.cls === 'CA') {
      for (const e of B.ships) {
        if (e.alive && e.team !== s.team && e.cls === 'SS' && e.spotted && dist(s, e) < 4500) {
          this.hunt = e; s.target = e; break;
        }
      }
    }

    let capRun = null;
    if (s.cls === 'DD' && !this.retreat && !this.hunt) {
      const free = World.zones.filter(z => z.owner !== s.team)
        .sort((a, b) => dist(s, a) - dist(s, b))[0];
      if (free && (!best || dist(s, best) > 5200)) capRun = free;
    }

    // where to sail
    if (this.hunt) {
      this.goal = { x: this.hunt.x, y: this.hunt.y };     // run right over the top of it
    } else if (capRun) {
      this.zone = capRun;
      this.goal = { x: capRun.x + rand(360, -360), y: capRun.y + rand(360, -360) };
    } else if (best && !this.retreat) {
      const want = s.def.guns.range * PREFERRED[s.cls];
      const a = Math.atan2(s.y - best.y, s.x - best.x);
      this.goal = { x: best.x + Math.cos(a) * want, y: best.y + Math.sin(a) * want };
    } else if (s.cls === 'CV') {
      // hold station well back, on our own side of the map
      const home = s.team === 1 ? MAP * 0.84 : MAP * 0.16;
      this.goal = { x: clamp(s.x + rand(900, -900), 1200, MAP - 1200), y: home };
    } else if (this.retreat) {
      const home = s.team === 1 ? MAP * 0.88 : MAP * 0.12;
      this.goal = { x: s.x + rand(1200, -1200), y: home };
    } else {
      if (!this.zone || Math.random() < 0.15) {
        const zones = World.zones.slice().sort((a, b) => dist(s, a) - dist(s, b));
        this.zone = s.cls === 'DD' ? zones[0] : choice(zones.slice(0, 2));
      }
      this.goal = { x: this.zone.x + rand(500, -500), y: this.zone.y + rand(500, -500) };
    }
  }

  // ------------------------------------------------------------------- steer
  steer(dt, B) {
    const s = this.s;
    if (!this.goal) return;
    let want = Math.atan2(this.goal.y - s.y, this.goal.x - s.x);

    // angle the bow toward a battleship that is shooting at us
    if (s.target && s.cls !== 'DD' && !this.retreat && dist(s, s.target) < s.def.guns.range) {
      const toE = Math.atan2(s.target.y - s.y, s.target.x - s.x);
      const off = angleDiff(toE, want);
      const ideal = s.cls === 'BB' ? 35 * DEG : 55 * DEG;   // keep guns bearing but stay angled
      if (Math.abs(off) > 100 * DEG) want = toE + Math.sign(off || 1) * ideal;
    }

    // island avoidance: probe ahead and to both bows
    const look = clamp(s.len * 4 + s.speed * 9, 500, 2400);
    let avoid = 0;
    for (const off of [-0.6, -0.28, 0, 0.28, 0.6]) {
      const a = s.hd + off;
      const px = s.x + Math.cos(a) * look, py = s.y + Math.sin(a) * look;
      const near = World.landAt(px, py, s.beam * 2) ||
                   px < 250 || py < 250 || px > MAP - 250 || py > MAP - 250;
      if (near) avoid -= Math.sign(off || (Math.random() < 0.5 ? 1 : -1)) * (1.1 - Math.abs(off));
    }
    if (avoid !== 0) want = s.hd + clamp(avoid, -1, 1) * 1.3;

    const err = angleDiff(s.hd, want);
    s.rudderIn = clamp(err * 2.6, -1, 1);

    let notch = 5;
    if (s.target && !this.retreat) {
      const d = dist(s, s.target);
      const wantD = s.def.guns.range * PREFERRED[s.cls];
      if (d < wantD * 0.55) notch = 5;                 // run out of a knife fight
      else if (Math.abs(err) > 1.9) notch = 3;
    }
    if (avoid !== 0) notch = 3;
    s.notch = notch;
  }

  // ------------------------------------------------------------------- fight
  fight(dt, B) {
    const s = this.s, t = s.target;
    if (!t || !t.alive) return;
    const d = dist(s, t);

    // aim with an error that shrinks with skill
    const g = s.def.guns;
    const lead = t.leadPoint(s, g.shellSpeed);
    const err = (1 - this.skill) * clamp(d * 0.03, 20, 420);
    s.aim = { x: lead.x + gauss() * err * 2, y: lead.y + gauss() * err * 2 };

    // ammo choice
    if (s.cls === 'BB') s.ammo = (t.cls === 'DD' || t.cls === 'SS') ? 'HE' : 'AP';
    else if (s.cls === 'CA') s.ammo = (t.cls === 'BB' && Math.random() < 0.5) ? 'AP' :
                                     (t.cls === 'CA' && d < g.range * 0.5) ? 'AP' : 'HE';

    if (s.cls === 'CV' && d > g.range * 0.8) return;   // do not go hunting
    if (d < g.range && s.canShootGuns() && B.visibleTo(t, s.team)) {
      if (s.turrets.some(tt => tt.ready)) s.fireGuns(B);
    }

    // torpedoes
    this.torpT -= dt;
    const tp = s.def.torps;
    if (tp && s.torpT <= 0 && this.torpT <= 0) {
      const tLead = t.leadPoint(s, tp.speed);
      const bearing = Math.atan2(tLead.y - s.y, tLead.x - s.x);
      const flight = dist(s, tLead) / tp.speed;
      if (dist(s, tLead) < tp.range * 0.92 &&
          (s.cls === 'SS' || s.torpArcOk(bearing)) &&
          !World.blocked(s.x, s.y, tLead.x, tLead.y)) {
        const save = s.aim;
        s.aim = { x: tLead.x + gauss() * flight * 8, y: tLead.y + gauss() * flight * 8 };
        if (s.fireTorps(B)) this.torpT = rand(9, 4);
        s.aim = save;
      }
    }

    // depth charges when a submarine is close
    if ((s.cls === 'DD' || s.cls === 'CA') && s.dcT <= 0) {
      for (const e of B.ships) {
        if (e.alive && e.team !== s.team && e.cls === 'SS' && dist(s, e) < 700) {
          s.dropDepthCharges(B); break;
        }
      }
    }
  }

  // -------------------------------------------------------------- consumables
  useKit(dt, B) {
    const s = this.s;
    if ((s.fires.length >= 2 || (s.flood && s.hp / s.maxHp < 0.7)) && this.skill > 0.3)
      s.useCons('dcp', B);
    if (s.hp / s.maxHp < 0.62 && s.potential > s.maxHp * 0.08) s.useCons('heal', B);
    if (s.cls === 'DD' && s.hp / s.maxHp < 0.55 && s.spotted) s.useCons('smoke', B);
    if (s.speed > 1) s.useCons('boost', B);

    const near = B.ships.some(e => e.alive && e.team !== s.team && dist(s, e) < 4000);
    if (near) { s.useCons('hydro', B); s.useCons('radar', B); }

    if (s.cls === 'SS') this.subLogic(B);
    if (s.cls === 'CV') this.carrierLogic(dt, B);
  }

  // A carrier keeps its distance and fights entirely through its air group.
  carrierLogic(dt, B) {
    const s = this.s;
    // pick something worth a strike: big, visible, and away from the flak
    let best = null, score = -1e9;
    for (const e of B.ships) {
      if (!e.alive || e.team === s.team || !e.spotted) continue;
      if (e.cls === 'SS' && e.depth > 0) continue;
      const d = dist(s, e);
      if (d > 11000) continue;
      let v = 900 - d / 20 + (1 - e.hp / e.maxHp) * 400;
      if (e.cls === 'BB') v += 350;              // fat, slow, worth the trip
      if (e.cls === 'CV') v += 500;
      v -= e.aa ? e.aa.dps * 0.5 : 0;
      if (v > score) { score = v; best = e; }
    }
    this.airTarget = best;

    const sq = s.squadOut;
    if (!sq) {
      if (!best) return;
      // rockets against destroyers, torpedoes against the big stuff
      const want = best.cls === 'DD' || best.cls === 'SS' ? 'rk'
                 : best.cls === 'BB' ? 'tb' : (Math.random() < 0.5 ? 'db' : 'tb');
      B.launch(s, want);
      return;
    }

    if (!best || !best.alive) { sq.recall(); return; }
    if (sq.state === 'back') return;

    const lead = sq.type === 'tb'
      ? best.leadPoint({ x: sq.x, y: sq.y }, sq.def.torpSpeed)
      : { x: best.x, y: best.y };
    sq.steerTo(Math.atan2(lead.y - sq.y, lead.x - sq.x), dt, 1);

    const d = Math.hypot(best.x - sq.x, best.y - sq.y);
    const releaseAt = sq.type === 'tb' ? sq.def.torpRange * 0.55 : 700;
    if (sq.state !== 'run' && sq.canAttack() && d < releaseAt && this.skill > 0.15) {
      sq.beginRun(lead);
    }
  }

  subLogic(B) {
    const s = this.s;
    const hunted = B.ships.some(e => e.alive && e.team !== s.team &&
      (e.cls === 'DD' || e.cls === 'CA') && dist(s, e) < 2600);
    const t = s.target;
    let far = 1e9;
    for (const e of B.ships) if (e.alive && e.team !== s.team) far = Math.min(far, dist(s, e));
    if (s.oxygen < 25) s.depth = 0;
    else if (hunted) s.depth = 2;
    else if (far > 5000) s.depth = 0;                     // transit on the surface, it is faster
    else if (t && dist(s, t) < s.def.torps.range * 1.1) s.depth = 1;
    else s.depth = s.oxygen > s.def.oxygen * 0.7 ? 1 : 0;

    if (t && s.depth <= 1 && dist(s, t) < 3200) s.useCons('ping', B);
  }
}
