// ---- the shipyard ----------------------------------------------------------
// Design your own ship. Everything is paid for out of one pool of points, so
// making her faster costs armour and a bigger gun costs rate of fire — which is
// the actual job of a naval architect, and the reason the thing stays balanced.

const STAT_DEFS = [
  { k: 'guns',     name: 'Main guns',     hint: 'Bigger shells, more damage per hit' },
  { k: 'reload',   name: 'Rate of fire',  hint: 'How quickly the guns reload' },
  { k: 'range',    name: 'Gun range',     hint: 'How far the shells will carry' },
  { k: 'armour',   name: 'Armour',        hint: 'Bounces enemy shells instead of letting them through' },
  { k: 'hull',     name: 'Hull',          hint: 'Hit points — and how big she is' },
  { k: 'engine',   name: 'Engine',        hint: 'Top speed' },
  { k: 'handling', name: 'Handling',      hint: 'How tightly she turns' },
  { k: 'stealth',  name: 'Stealth',       hint: 'How close the enemy must get before they see you' },
  { k: 'torps',    name: 'Torpedoes',     hint: 'Torpedo damage and range', needs: 'torps' },
  { k: 'aa',       name: 'Anti-aircraft', hint: 'Shoots down enemy aircraft' },
  { k: 'air',      name: 'Air group',     hint: 'How hard your bombers hit', needs: 'air' },
];

const PAINTS = [
  { k: 'navy',    name: 'Navy grey',   hull: '#4d5a63', deck: '#6c7883' },
  { k: 'atlantic',name: 'Atlantic',    hull: '#39505f', deck: '#5a6b78' },
  { k: 'pacific', name: 'Pacific blue',hull: '#2f4d63', deck: '#4a6578' },
  { k: 'sand',    name: 'Desert',      hull: '#7a7259', deck: '#9a8f70' },
  { k: 'green',   name: 'Sea green',   hull: '#3f5a4e', deck: '#5d7a68' },
  { k: 'black',   name: 'Midnight',    hull: '#33383e', deck: '#474d55' },
  { k: 'red',     name: 'Red lead',    hull: '#6b3f3a', deck: '#87554c' },
];

const STAT_MIN = 1, STAT_MAX = 10;

// 1..10 -> a multiplier centred on 1.0 at 5
const statMul = v => 0.6 + v * 0.08;

// Which stats apply to this hull. The navy matters: American cruisers carry no
// torpedoes, so probing with a fixed nation would hide the option from a
// British or Japanese design that really does have them.
function statsFor(cls, nation) {
  const probe = buildShip(nation || 'usa', cls, 5, 'probe');
  return STAT_DEFS.filter(d => !d.needs || probe[d.needs]);
}

function pointsCap(cls, nation) { return statsFor(cls, nation).length * 5 + 6; }

function pointsSpent(recipe) {
  return statsFor(recipe.cls, recipe.nation)
    .reduce((sum, d) => sum + (recipe.stats[d.k] || STAT_MIN), 0);
}

function defaultRecipe(cls, tier, nation) {
  const stats = {};
  for (const d of statsFor(cls, nation)) stats[d.k] = 5;
  return { name: '', nation, cls, tier, stats, paint: 'navy', id: null };
}

// ---- turn a recipe into a ship the game can sail ---------------------------
function compileCustom(recipe) {
  const s = buildShip(recipe.nation, recipe.cls, recipe.tier, recipe.name || 'Unnamed');
  const v = k => recipe.stats[k] === undefined ? 5 : recipe.stats[k];
  const m = k => statMul(v(k));

  s.id = recipe.id;
  s.custom = true;
  s.recipe = recipe;
  // the name is written into innerHTML in the port, so keep markup out of it
  s.name = String(s.name).replace(/[<>&]/g, '').trim().slice(0, 24) || 'Unnamed';

  const paint = PAINTS.find(p => p.k === recipe.paint) || PAINTS[0];
  s.paint = paint.hull;
  s.paintDeck = paint.deck;

  // a bigger hull is tougher but easier to see and slower to turn
  s.hp = Math.round(s.hp * (0.55 + m('hull') * 0.45));
  s.len = Math.round(s.len * (0.82 + m('hull') * 0.18));
  s.beam = +(s.beam * (0.86 + m('hull') * 0.14)).toFixed(1);

  s.guns.cal = Math.round(s.guns.cal * m('guns'));
  s.guns.reload = +(s.guns.reload / m('reload')).toFixed(2);
  s.guns.range = Math.round(s.guns.range * m('range'));

  s.armor = Math.round(s.armor * m('armour'));
  s.citArmor = Math.round(s.citArmor * m('armour'));

  s.speed = +(s.speed * m('engine')).toFixed(1);
  s.turnR = Math.round(s.turnR / m('handling'));
  s.rudder = +(s.rudder / m('handling')).toFixed(2);
  s.conceal = +(s.conceal / m('stealth')).toFixed(2);

  if (s.torps) {
    s.torps.dmg = Math.round(s.torps.dmg * m('torps'));
    s.torps.range = Math.round(s.torps.range * m('torps'));
  }
  if (s.aa) s.aa.dps = Math.round(s.aa.dps * m('aa'));
  if (s.air) {
    for (const k of ['rk', 'db', 'tb']) {
      s.air[k].dmg = Math.round(s.air[k].dmg * m('air'));
      s.air[k].hp = Math.round(s.air[k].hp * (0.8 + m('air') * 0.2));
    }
  }

  // everything derived from the numbers above has to be recomputed
  const g = s.guns;
  g.dmgHE = Math.round(g.cal * 16.5);
  g.dmgAP = Math.round(g.cal * 33);
  g.pen = g.cal * 0.62;
  g.hePen = g.cal / 5.5;
  g.fire = clamp(g.cal * 0.00085, 0.05, 0.38) * (s.heFireBonus || 1);
  s.speedMS = s.speed * KN;
  s.concealM = s.conceal * 1000;
  s.xpCost = 0;
  s.price = TIER_CREDIT[recipe.tier];
  s.blurb = 'Designed in your own shipyard.';
  return s;
}

// rebuild every saved design into the roster
function registerCustoms() {
  for (const r of (Account.data.custom || [])) {
    delete MESH_CACHE[r.id];
    delete TURRET_CACHE[r.id];
    SHIPS[r.id] = compileCustom(r);
  }
}

// ---- live 3D preview -------------------------------------------------------
// Its own little projector so the builder does not have to borrow the battle
// camera. Camera orbits the ship looking at the waterline amidships.
function drawPreview(canvas, def, angle) {
  const c = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#123b52'); sky.addColorStop(0.62, '#2b6580'); sky.addColorStop(0.62, '#0d3348');
  sky.addColorStop(1, '#07202f');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);

  const dist = def.len * 1.75;
  const cam = [Math.cos(angle) * dist, Math.sin(angle) * dist, def.len * 0.34 + def.beam];
  const tgt = [0, 0, def.beam * 0.35];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = a => { const m = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / m, a[1] / m, a[2] / m]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const fwd = norm(sub(tgt, cam));
  const right = norm(cross(fwd, [0, 0, 1]));
  const up = cross(right, fwd);
  const focal = H * 1.15;

  const project = p => {
    const d = sub(p, cam);
    const depth = dot(d, fwd);
    if (depth < 1) return null;
    return { x: W / 2 + dot(d, right) * focal / depth, y: H / 2 - dot(d, up) * focal / depth, depth };
  };

  const LIGHT = norm([0.45, -0.5, 0.74]);
  const items = [];
  const emit = (faces, ox, oy, oz, ang) => {
    const ch = Math.cos(ang || 0), sh = Math.sin(ang || 0);
    for (const f of faces) {
      const pts = [];
      let depth = 0, bad = false;
      for (const p of f.p) {
        const wx = ox + p[0] * ch - p[1] * sh;
        const wy = oy + p[0] * sh + p[1] * ch;
        const q = project([wx, wy, oz + p[2]]);
        if (!q) { bad = true; break; }
        pts.push(q.x, q.y); depth += q.depth;
      }
      if (bad) continue;
      depth /= f.p.length;
      const nx = f.n[0] * ch - f.n[1] * sh, ny = f.n[0] * sh + f.n[1] * ch;
      const lam = clamp(nx * LIGHT[0] + ny * LIGHT[1] + f.n[2] * LIGHT[2], -1, 1);
      const sha = 0.5 + 0.5 * Math.max(0, lam) + 0.12 * Math.max(0, f.n[2]);
      const base = rgbOf(f.c);
      items.push({ pts, depth,
        col: `rgb(${(base[0] * sha) | 0},${(base[1] * sha) | 0},${(base[2] * sha) | 0})` });
    }
  };

  const mesh = shipMesh(def);
  emit(mesh.faces, 0, 0, 0, 0);
  if (def.cls !== 'SS') {
    const dummy = { def, cls: def.cls, len: def.len, beam: def.beam, hd: 0 };
    Ship.prototype.buildTurrets.call(dummy);
    const tm = turretMesh(def);
    for (const tr of dummy.turrets) {
      emit(tm, tr.ox * def.len, 0,
           mesh.deck + (tr.isFore ? def.beam * 0.06 : def.beam * 0.04),
           tr.isFore ? 0 : Math.PI);
    }
  }

  items.sort((a, b) => b.depth - a.depth);
  for (const it of items) {
    c.fillStyle = it.col;
    c.beginPath();
    c.moveTo(it.pts[0], it.pts[1]);
    for (let i = 2; i < it.pts.length; i += 2) c.lineTo(it.pts[i], it.pts[i + 1]);
    c.closePath(); c.fill();
  }

  c.fillStyle = 'rgba(190,220,238,.65)';
  c.font = '12px Segoe UI'; c.textAlign = 'center';
  c.fillText(Math.round(def.len) + ' m long · ' + def.beam.toFixed(1) + ' m across', W / 2, H - 10);
}
