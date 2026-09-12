// ---- small math / helper library -------------------------------------------
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const KN = 0.514444;                       // knots -> metres per second

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp  = (a, b, t) => a + (b - a) * t;

function normAngle(a) {                    // wrap into (-PI, PI]
  while (a > Math.PI) a -= TAU;
  while (a <= -Math.PI) a += TAU;
  return a;
}
const angleDiff = (a, b) => normAngle(b - a);

// move `a` toward `b` by at most `step` radians
function turnToward(a, b, step) {
  const d = angleDiff(a, b);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

const dist  = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
const dist2 = (a, b) => (b.x - a.x) ** 2 + (b.y - a.y) ** 2;

const rand      = (a = 1, b = 0) => b + Math.random() * (a - b);
const randInt   = (a, b) => Math.floor(rand(b + 1, a));
const choice    = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffled  = arr => arr.map(v => [Math.random(), v]).sort((p, q) => p[0] - q[0]).map(p => p[1]);

// approximate normal distribution, roughly within +-1
function gauss() {
  return (Math.random() + Math.random() + Math.random() + Math.random() +
          Math.random() + Math.random() - 3) / 3;
}

// is point p inside the oriented box of ship-like object s (len x beam, heading hd)
function inHull(p, s) {
  const dx = p.x - s.x, dy = p.y - s.y;
  const c = Math.cos(-s.hd), si = Math.sin(-s.hd);
  const lx = dx * c - dy * si;             // along the keel
  const ly = dx * si + dy * c;             // across the beam
  const hl = s.len / 2, hb = s.beam / 2;
  if (Math.abs(ly) > hb) return false;
  if (Math.abs(lx) > hl) return false;
  // taper the bow so long ships are not brick-shaped
  const taper = lx > hl * 0.55 ? 1 - (lx - hl * 0.55) / (hl * 0.45) * 0.75 : 1;
  return Math.abs(ly) <= hb * taper;
}

function fmt(n) { return Math.round(n).toLocaleString('en-US'); }

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

// Ballistic flight time: shells arc, so the further away the longer the hang
// time. Real 16-inch shells take the better part of half a minute to reach the
// horizon; that is unlearnable, so the arc penalty here is deliberately mild.
function flightTime(range, shellSpeed) {
  return range / shellSpeed * (1 + range / 60000);
}

const el = id => document.getElementById(id);
function mk(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}
