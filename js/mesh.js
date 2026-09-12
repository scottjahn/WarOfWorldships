// ---- procedural ship models ------------------------------------------------
// Every hull is built from its own length and beam, so a Shimakaze really is
// long and thin and a Yamato really is a slab. Faces are stored in ship-local
// coordinates: +X toward the bow, +Y to port, +Z up, origin at the waterline.

function face(pts, col) {
  // outward normal from the first three points
  const [a, b, c] = pts;
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const m = Math.hypot(nx, ny, nz) || 1;
  let cx = 0, cy = 0, cz = 0;
  for (const q of pts) { cx += q[0]; cy += q[1]; cz += q[2]; }
  const k = pts.length;
  return { p: pts, c: col, n: [nx / m, ny / m, nz / m], cen: [cx / k, cy / k, cz / k] };
}

// Winding is not consistent across the primitives above, so point every normal
// away from a reference point inside the object. That makes flat shading right
// and lets the renderer cull back faces safely.
function orientFaces(faces, ref) {
  for (const f of faces) {
    const dx = f.cen[0] - ref[0], dy = f.cen[1] - ref[1], dz = f.cen[2] - ref[2];
    if (f.n[0] * dx + f.n[1] * dy + f.n[2] * dz < 0) {
      f.n[0] = -f.n[0]; f.n[1] = -f.n[1]; f.n[2] = -f.n[2];
    }
  }
  return faces;
}

function box(cx, cy, cz, sx, sy, sz, col) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2;
  const y0 = cy - sy / 2, y1 = cy + sy / 2;
  const z0 = cz, z1 = cz + sz;
  return [
    face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], col),   // bow face
    face([[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], col),   // stern face
    face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], col),   // starboard
    face([[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], col),   // port
    face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], col),   // top
  ];
}

// half-beam profile along the hull, 0 at the very bow
function hullWidth(t) {          // t: -1 stern .. +1 bow
  if (t > 0.55) return lerp(1, 0.12, (t - 0.55) / 0.45) ** 0.85;
  if (t < -0.72) return lerp(1, 0.62, (-t - 0.72) / 0.28);
  return 1;
}

const HULL   = '#4d5a63';
const DECK   = '#6c7883';
const DECK_W = '#8b7a5e';
const SUPER  = '#8d99a3';
const STEEL  = '#aab6bf';
const DARK   = '#39434b';

function buildHull(len, beam, free, col, deckCol) {
  const faces = [];
  const N = 9;
  const hb = beam / 2;
  let prev = null;
  for (let i = 0; i <= N; i++) {
    const t = -1 + 2 * i / N;
    const x = t * len / 2;
    const w = hb * hullWidth(t);
    // sheer: the deck rises toward the bow
    const z = free * (1 + 0.35 * Math.max(0, t) ** 2);
    const st = { x, w, z };
    if (prev) {
      faces.push(face([[prev.x, -prev.w, 0], [st.x, -st.w, 0],
                       [st.x, -st.w, st.z], [prev.x, -prev.w, prev.z]], col));
      faces.push(face([[st.x, prev.w, 0], [prev.x, prev.w, 0],
                       [prev.x, prev.w, prev.z], [st.x, st.w, st.z]], col));
      faces.push(face([[prev.x, -prev.w, prev.z], [st.x, -st.w, st.z],
                       [st.x, st.w, st.z], [prev.x, prev.w, prev.z]], deckCol));
    }
    prev = st;
  }
  // transom
  faces.push(face([[-len / 2, -hb * hullWidth(-1), 0], [-len / 2, hb * hullWidth(-1), 0],
                   [-len / 2, hb * hullWidth(-1), free], [-len / 2, -hb * hullWidth(-1), free]], DARK));
  return faces;
}

// one turret, built at the origin so it can be spun to its own bearing
function buildTurret(size, barrels, barrelLen) {
  const f = box(0, 0, 0, size * 1.5, size * 1.7, size * 0.85, STEEL);
  f.push(...box(size * 0.35, 0, size * 0.85, size * 0.7, size * 1.1, size * 0.45, STEEL));
  for (let b = 0; b < barrels; b++) {
    const off = (b - (barrels - 1) / 2) * size * 0.42;
    f.push(...box(size * 0.75 + barrelLen / 2, off, size * 0.95,
                  barrelLen, size * 0.16, size * 0.16, DARK));
  }
  return f;
}

const MESH_CACHE = {};

function shipMesh(def) {
  if (MESH_CACHE[def.id]) return MESH_CACHE[def.id];
  const L = def.len, B = def.beam, cls = def.cls;
  const m = { faces: [], turret: null, deck: 0 };

  if (cls === 'SS') {
    const free = B * 0.30;
    m.faces = buildHull(L, B, free, def.paint || '#333b42', def.paintDeck || '#414a52');
    // conning tower and periscopes
    m.faces.push(...box(L * 0.04, 0, free, L * 0.13, B * 0.55, B * 0.75, '#3d464e'));
    m.faces.push(...box(L * 0.02, 0, free + B * 0.75, L * 0.012, B * 0.09, B * 0.5, DARK));
    m.faces.push(...box(L * 0.30, 0, free, L * 0.09, B * 0.30, B * 0.22, '#3d464e'));
    m.deck = free;
    m.turret = null;
    orientFaces(m.faces, [0, 0, free * 0.4]);
    MESH_CACHE[def.id] = m;
    return m;
  }

  if (cls === 'CV') {
    // flat deck the full length of the ship, island offset to starboard
    const free = B * 0.62;
    m.faces = buildHull(L, B * 0.82, free, def.paint || HULL, def.paintDeck || '#4a5058');
    const dw = B * 1.02;                       // the deck overhangs the hull
    m.faces.push(...box(0, 0, free, L * 0.98, dw, B * 0.05, '#3e444b'));
    // deck markings: a pale centre line and the landing area
    m.faces.push(...box(-L * 0.06, 0, free + B * 0.05, L * 0.5, dw * 0.10, 0.6, '#9aa4ac'));
    m.faces.push(...box(L * 0.34, 0, free + B * 0.05, L * 0.16, dw * 0.5, 0.6, '#5c646c'));
    // island: bridge, funnel and mast, all to starboard
    const iy = -dw * 0.40;
    m.faces.push(...box(-L * 0.02, iy, free + B * 0.05, L * 0.13, B * 0.20, B * 0.42, SUPER));
    m.faces.push(...box(-L * 0.02, iy, free + B * 0.47, L * 0.07, B * 0.14, B * 0.26, STEEL));
    m.faces.push(...box(-L * 0.08, iy, free + B * 0.05, L * 0.05, B * 0.17, B * 0.55, '#5a656e'));
    m.faces.push(...box(-L * 0.02, iy, free + B * 0.73, L * 0.006, B * 0.04, B * 0.4, DARK));
    m.deck = free + B * 0.05;
    m.tSize = B * 0.12;
    orientFaces(m.faces, [0, 0, free * 0.5]);
    MESH_CACHE[def.id] = m;
    return m;
  }

  const free = B * (cls === 'BB' ? 0.42 : cls === 'CA' ? 0.46 : 0.5);
  m.faces = buildHull(L, B, free, def.paint || HULL,
                      def.paintDeck || (cls === 'DD' ? DECK : DECK_W));
  m.deck = free;

  // superstructure: a stepped block amidships, taller on the big ships
  const supW = B * 0.55, supH = B * (cls === 'BB' ? 0.85 : 0.7);
  m.faces.push(...box(L * 0.02, 0, free, L * 0.30, supW, supH, SUPER));
  m.faces.push(...box(L * 0.06, 0, free + supH, L * 0.15, supW * 0.72, supH * 0.75, SUPER));
  m.faces.push(...box(L * 0.07, 0, free + supH * 1.75, L * 0.06, supW * 0.42, supH * 0.6, STEEL));
  // mast
  m.faces.push(...box(L * 0.02, 0, free + supH * 2.35, L * 0.008, B * 0.05, B * 0.55, DARK));

  // funnels
  const funnels = cls === 'DD' ? 2 : cls === 'CA' ? 2 : 1;
  for (let i = 0; i < funnels; i++) {
    const fx = L * (funnels === 1 ? -0.06 : -0.04 - i * 0.13);
    m.faces.push(...box(fx, 0, free + supH * 0.35, L * 0.045, B * 0.34, B * 0.62, '#5a656e'));
    m.faces.push(...box(fx, 0, free + supH * 0.35 + B * 0.62, L * 0.045, B * 0.34, B * 0.04, DARK));
  }

  // secondary battery blisters on battleships
  if (cls === 'BB') {
    for (const sx of [0.16, 0.02, -0.12]) {
      for (const sy of [1, -1]) {
        m.faces.push(...box(L * sx, sy * B * 0.36, free + B * 0.1,
                            L * 0.04, B * 0.12, B * 0.16, STEEL));
      }
    }
  }

  m.tSize = B * (cls === 'BB' ? 0.30 : cls === 'CA' ? 0.24 : 0.20);
  orientFaces(m.faces, [0, 0, free * 0.5]);
  MESH_CACHE[def.id] = m;
  return m;
}

// turret meshes depend on barrel count, so cache them separately
const TURRET_CACHE = {};
function turretMesh(def) {
  const key = def.id;
  if (TURRET_CACHE[key]) return TURRET_CACHE[key];
  const B = def.beam, cls = def.cls;
  const size = B * (cls === 'BB' ? 0.30 : cls === 'CA' ? 0.24 : 0.20);
  const barrels = Math.max(1, Math.round(def.guns.n /
    (cls === 'SS' ? 1 : def.guns.n <= 4 ? def.guns.n : def.guns.n <= 9 ? 3 : 4)));
  TURRET_CACHE[key] = orientFaces(buildTurret(size, Math.min(barrels, 4), def.len * 0.055),
                                  [0, 0, size * 0.4]);
  return TURRET_CACHE[key];
}

// ---- a carrier plane, about 12 m of it -------------------------------------
const PLANE_MESH = (() => {
  const body = '#6b7681', wing = '#7e8b96', dark = '#3a424a';
  const f = [];
  f.push(...box(0, 0, 0, 12, 2.0, 2.0, body));          // fuselage
  f.push(...box(1.5, 0, 0.6, 3.4, 13.5, 0.7, wing));    // main wing
  f.push(...box(-5.0, 0, 0.6, 2.0, 5.2, 0.6, wing));    // tailplane
  f.push(...box(-5.2, 0, 1.0, 1.8, 0.5, 2.4, dark));    // fin
  f.push(...box(5.6, 0, 0.2, 1.0, 2.4, 2.4, dark));     // engine
  return orientFaces(f, [0, 0, 0.6]);
})();
