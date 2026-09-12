// ---- 3D renderer -----------------------------------------------------------
// Perspective projection painted onto a plain 2D canvas: no WebGL, no library,
// so the game still opens by double-clicking index.html. Geometry is sorted
// back-to-front and flat shaded, which suits the stylised look.

const Cam = {
  yaw: -Math.PI / 2,          // where the camera looks, world radians
  pitch: 0.20,                // radians below the horizon
  fov: 58 * DEG, wantFov: 58 * DEG,
  dist: 320, height: 130,     // chase offsets, recomputed from the ship
  x: 0, y: 0, z: 100,         // camera position
  mode: 'chase',              // chase · sniper · overhead
  shake: 0,
};

const SKY_TOP  = [26, 58, 84];
const SKY_HAZE = [128, 165, 186];
const SEA_NEAR = [10, 42, 60];
const SEA_FAR  = [84, 122, 145];
const LIGHT = (() => {                     // sun direction, normalised
  const v = [0.42, -0.55, 0.72];
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
})();

const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const RGB_CACHE = {};
function rgbOf(hex) { return RGB_CACHE[hex] || (RGB_CACHE[hex] = hex2rgb(hex)); }

const Render = {
  init(cv, mini) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.mini = mini; this.mctx = mini.getContext('2d');
    this.buf = [];                 // reusable face list, avoids per-frame garbage
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  resize() {
    const d = window.devicePixelRatio || 1;
    this.w = this.cv.clientWidth || 1280;
    this.h = this.cv.clientHeight || 720;
    this.cv.width = this.w * d; this.cv.height = this.h * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.mini.width = 250 * d; this.mini.height = 250 * d;
    this.mctx.setTransform(d, 0, 0, d, 0, 0);
  },

  // ------------------------------------------------------------------ camera
  updateCamera(ship, dt) {
    Cam.fov = lerp(Cam.fov, Cam.wantFov, Math.min(1, dt * 9));
    this.haze = Cam.mode === 'overhead' ? 0 : 1;
    this.focal = (this.h / 2) / Math.tan(Cam.fov / 2);
    this.cy = Math.cos(Cam.yaw); this.sy = Math.sin(Cam.yaw);
    this.cp = Math.cos(Cam.pitch); this.sp = Math.sin(Cam.pitch);

    if (!ship) return;
    const tx = ship.x, ty = ship.y;
    const tz = ship.airZ !== undefined ? ship.airZ
             : ship.cls === 'SS' ? -ship.depthF * 14 : 0;

    if (Cam.mode === 'overhead') {
      Cam.x = tx; Cam.y = ty; Cam.z = 11000;
    } else if (Cam.mode === 'sniper' && ship.airZ === undefined) {
      // from the bridge, so the ship's own bow frames the shot
      const m = shipMesh(ship.def);
      Cam.x = tx + Math.cos(ship.hd) * ship.len * 0.05;
      Cam.y = ty + Math.sin(ship.hd) * ship.len * 0.05;
      Cam.z = tz + m.deck + ship.beam * 1.5;
    } else {
      const back = Cam.dist, up = Cam.height;
      Cam.x = tx - this.cy * back;
      Cam.y = ty - this.sy * back;
      Cam.z = tz + up;
    }
    if (Cam.shake > 0) {
      Cam.shake -= dt * 2.4;
      const s = Math.max(0, Cam.shake) * 9;
      Cam.x += gauss() * s; Cam.y += gauss() * s; Cam.z += gauss() * s;
    }
  },

  chaseOffsets(ship) {
    Cam.dist = ship.len * 1.9 + 210;
    Cam.height = ship.len * 0.55 + 95;
  },

  // world point -> {sx, sy, depth}; depth <= 0 means behind the camera
  project(x, y, z) {
    const dx = x - Cam.x, dy = y - Cam.y, dz = z - Cam.z;
    const hf = dx * this.cy + dy * this.sy;        // horizontal, forward
    const rd = dx * this.sy - dy * this.cy;        // horizontal, right
    const depth = hf * this.cp - dz * this.sp;
    if (depth < 1) return { depth };
    const vup = hf * this.sp + dz * this.cp;
    const k = this.focal / depth;
    return { sx: this.w / 2 + rd * k, sy: this.h / 2 - vup * k, depth };
  },

  // unit ray from the camera through a screen pixel
  rayDir(px, py) {
    const rx = (px - this.w / 2) / this.focal;
    const ry = -(py - this.h / 2) / this.focal;
    const fx = this.cy * this.cp, fy = this.sy * this.cp, fz = -this.sp;
    const ux = this.cy * this.sp, uy = this.sy * this.sp, uz = this.cp;
    const sx_ = this.sy, sy_ = -this.cy;
    let dx = fx + sx_ * rx + ux * ry;
    let dy = fy + sy_ * rx + uy * ry;
    let dz = fz + uz * ry;
    const m = Math.hypot(dx, dy, dz) || 1;
    return { dx: dx / m, dy: dy / m, dz: dz / m };
  },

  // screen point -> the spot on the sea it is pointing at
  seaPoint(px, py) {
    const r = this.rayDir(px, py);
    if (r.dz > -0.0035) {                          // aimed at or above the horizon
      const hm = Math.hypot(r.dx, r.dy) || 1;
      return { x: Cam.x + r.dx / hm * 26000, y: Cam.y + r.dy / hm * 26000, far: true };
    }
    const t = -Cam.z / r.dz;
    return { x: Cam.x + r.dx * t, y: Cam.y + r.dy * t, far: false };
  },

  // A point on the sea is a hopeless way to set gun range: at ten kilometres a
  // couple of pixels of mouse is a kilometre of error. So when the sights are
  // near an enemy — or a target is locked — take the range from that ship and
  // let the player concentrate on lead, which is what the real game does.
  aimPoint(B, px, py, snap) {
    const r = this.rayDir(px, py);
    const hm = Math.hypot(r.dx, r.dy) || 1;
    const atRange = R => ({ x: Cam.x + r.dx / hm * R, y: Cam.y + r.dy / hm * R, ranged: true });

    if (snap) {
      const p = B.player;
      let pick = (p.locked && p.locked.alive && p.locked.spotted) ? p.locked : null;
      if (!pick) {
        let bestPx = 220;
        for (const s of B.ships) {
          if (!s.alive || s.team === p.team || !s.spotted) continue;
          if (s.cls === 'SS' && s.depth > 0) continue;
          const q = this.project(s.x, s.y, 0);
          if (q.depth < 1) continue;
          const d = Math.hypot(q.sx - px, q.sy - py);
          if (d < bestPx) { bestPx = d; pick = s; }
        }
      }
      if (pick) return atRange(Math.hypot(pick.x - Cam.x, pick.y - Cam.y));
      // Nothing under the sights: the water the camera happens to point at can
      // be a few hundred metres away, which would drop the salvo on our own
      // bow. Keep the fall of shot out at a useful distance instead.
      const sea = this.seaPoint(px, py);
      const d = Math.hypot(sea.x - Cam.x, sea.y - Cam.y);
      const maxR = B.player.def.guns.range;
      if (d < 1500 || sea.far) return atRange(clamp(sea.far ? maxR : 1500, 1500, maxR));
      return atRange(Math.min(d, maxR));
    }
    return this.seaPoint(px, py);
  },

  // ------------------------------------------------------------------- frame
  frame(B, t, dt) {
    const c = this.ctx;
    const sq = B.playerSquad;
    if (sq && sq.alive) {
      // ride with the strike instead of the ship
      Cam.dist = 300; Cam.height = 115;
      this.updateCamera({ x: sq.x, y: sq.y, airZ: sq.z }, dt || 0.016);
    } else {
      const cam = (B.player && B.player.alive) ? B.player
                : (B.camTarget && B.camTarget.alive ? B.camTarget : B.player);
      if (cam) this.chaseOffsets(cam);
      this.updateCamera(cam, dt || 0.016);
    }

    this.drawSky();
    this.drawSea(t);
    this.buf.length = 0;
    this.collectIslands();
    this.collectWakes(B);
    this.collectShips(B, t);
    this.collectAircraft(B, t);
    this.collectEffects(B, t);
    this.paint();
    this.drawOverlays(B, t);
    this.drawMinimap(B);
  },

  // ------------------------------------------------------------- sky and sea
  // Where the sea plane vanishes: let the forward distance run to infinity and
  // the projection collapses to h/2 - focal * tan(pitch).
  horizonY() { return this.h / 2 - this.focal * Math.tan(Cam.pitch); },

  drawSky() {
    const c = this.ctx;
    const hy = this.horizonY();
    const g = c.createLinearGradient(0, hy - this.h * 0.85, 0, hy);
    g.addColorStop(0, `rgb(${SKY_TOP})`);
    g.addColorStop(0.75, 'rgb(72,116,146)');
    g.addColorStop(1, `rgb(${SKY_HAZE})`);
    c.fillStyle = g;
    c.fillRect(0, 0, this.w, Math.max(0, Math.min(this.h, hy)));
  },

  drawSea(t) {
    const c = this.ctx;
    const hy = clamp(this.horizonY(), -this.h, this.h);
    if (hy >= this.h) { c.fillStyle = `rgb(${SEA_NEAR})`; c.fillRect(0, 0, this.w, this.h); }
    else {
      const g = c.createLinearGradient(0, Math.max(0, hy), 0, this.h);
      g.addColorStop(0, `rgb(${SEA_FAR})`);
      g.addColorStop(0.35, 'rgb(20,60,82)');
      g.addColorStop(1, `rgb(${SEA_NEAR})`);
      c.fillStyle = g;
      c.fillRect(0, Math.max(0, hy), this.w, this.h - Math.max(0, hy));
    }

    // wave crests on a world grid, so the sea slides past as you steam
    const step = Cam.mode === 'overhead' ? 1000 : 205;
    const reach = Cam.mode === 'overhead' ? 9000 : 2500;
    const gx0 = Math.floor((Cam.x - reach) / step) * step;
    const gy0 = Math.floor((Cam.y - reach) / step) * step;
    c.lineCap = 'round';
    c.beginPath();
    let strokes = 0;
    for (let gy = gy0; gy <= Cam.y + reach; gy += step) {
      for (let gx = gx0; gx <= Cam.x + reach; gx += step) {
        const ph = Math.sin(gx * 0.013 + gy * 0.008 + t * 1.6);
        const wx = gx + ph * 26, wy = gy + Math.cos(gx * 0.01 - t * 1.2) * 18;
        const d = Math.hypot(wx - Cam.x, wy - Cam.y);
        if (d > reach) continue;
        const a = this.project(wx, wy, 0);
        if (!a.sx) continue;
        const bpt = this.project(wx + step * 0.42, wy, 0);
        if (!bpt.sx) continue;
        if (a.sy < hy) continue;
        c.moveTo(a.sx, a.sy); c.lineTo(bpt.sx, bpt.sy);
        strokes++;
        if (strokes > 900) break;
      }
    }
    c.strokeStyle = 'rgba(180,220,240,.13)';
    c.lineWidth = 1.4;
    c.stroke();
  },

  // ----------------------------------------------------------------- geometry
  push(pts, col, depth, alpha) {
    this.buf.push({ pts, col, depth, alpha: alpha === undefined ? 1 : alpha });
  },

  // project a local-space face of an object placed at (ox,oy,oz) with heading hd
  // and roll r, shading it by its normal
  emitFace(f, ox, oy, oz, ch, sh, cr, sr, tint, hazeK) {
    // normal into world space (yaw + roll), used for culling and shading
    const nyr = f.n[1] * cr - f.n[2] * sr;
    const nz = f.n[1] * sr + f.n[2] * cr;
    const nx = f.n[0] * ch - nyr * sh;
    const nyw = f.n[0] * sh + nyr * ch;
    // face centroid in world space
    const cyl = f.cen[1] * cr - f.cen[2] * sr;
    const czl = f.cen[1] * sr + f.cen[2] * cr;
    const wcx = ox + f.cen[0] * ch - cyl * sh;
    const wcy = oy + f.cen[0] * sh + cyl * ch;
    const wcz = oz + czl;
    if (nx * (Cam.x - wcx) + nyw * (Cam.y - wcy) + nz * (Cam.z - wcz) <= 0) return;

    const pts = [];
    let depth = 0;
    for (const p of f.p) {
      const ly = p[1] * cr - p[2] * sr;
      const lz = p[1] * sr + p[2] * cr;
      const wx = ox + p[0] * ch - ly * sh;
      const wy = oy + p[0] * sh + ly * ch;
      const q = this.project(wx, wy, oz + lz);
      if (q.depth < 1) return;                       // clip anything behind us
      pts.push(q.sx, q.sy);
      depth += q.depth;
    }
    depth /= f.p.length;
    const lam = clamp(nx * LIGHT[0] + nyw * LIGHT[1] + nz * LIGHT[2], -1, 1);
    const sha = 0.55 + 0.45 * Math.max(0, lam) + 0.10 * Math.max(0, nz);
    const base = rgbOf(f.c);
    let r = base[0] * sha, g = base[1] * sha, b = base[2] * sha;
    if (tint) { r = r * 0.93 + tint[0] * 0.07; g = g * 0.93 + tint[1] * 0.07; b = b * 0.93 + tint[2] * 0.07; }
    const hz = clamp((depth - 1400) / 12000, 0, 0.82) * hazeK * this.haze;
    r = lerp(r, SKY_HAZE[0], hz); g = lerp(g, SKY_HAZE[1], hz); b = lerp(b, SKY_HAZE[2], hz);
    this.push(pts, `rgb(${r | 0},${g | 0},${b | 0})`, depth);
  },

  collectIslands() {
    const reach = Cam.mode === 'overhead' ? 20000 : 13000;
    for (const isl of World.islands) {
      const away = Math.hypot(isl.x - Cam.x, isl.y - Cam.y);
      if (away > reach + isl.r) continue;
      const SEG = away < 5000 ? 12 : away < 9000 ? 8 : 6;
      for (const b of isl.blobs) {
        const hgt = (b.r * 0.36 + 35) * (b.hMul || 1);
        // three rings make a dome: sand at the waterline, scrub, then a cap
        const rings = [
          { r: b.r,        z: 0,          col: [206, 190, 146] },
          { r: b.r * 0.90, z: hgt * 0.11, col: [196, 179, 135] },
          { r: b.r * 0.74, z: hgt * 0.34, col: [112, 144, 86] },
          { r: b.r * 0.50, z: hgt * 0.70, col: [92, 126, 74] },
          { r: b.r * 0.20, z: hgt,        col: [78, 108, 64] },
        ];
        const pts = rings.map(ring => {
          const out = [];
          for (let i = 0; i < SEG; i++) {
            const a = i / SEG * TAU + b.seedA;
            out.push([b.x + Math.cos(a) * ring.r, b.y + Math.sin(a) * ring.r, ring.z]);
          }
          return out;
        });
        for (let k = 0; k < rings.length - 1; k++) {
          const lo = pts[k], hi = pts[k + 1], col = rings[k + 1].col;
          for (let i = 0; i < SEG; i++) {
            const j = (i + 1) % SEG;
            const q = [this.project(lo[i][0], lo[i][1], lo[i][2]),
                       this.project(lo[j][0], lo[j][1], lo[j][2]),
                       this.project(hi[j][0], hi[j][1], hi[j][2]),
                       this.project(hi[i][0], hi[i][1], hi[i][2])];
            if (q.some(v => v.depth < 1)) continue;
            const dep = (q[0].depth + q[2].depth) / 2;
            const mx = (lo[i][0] + lo[j][0]) / 2 - b.x, my = (lo[i][1] + lo[j][1]) / 2 - b.y;
            const m = Math.hypot(mx, my) || 1;
            const lam = clamp((mx / m) * LIGHT[0] + (my / m) * LIGHT[1] + 0.62 * LIGHT[2], -1, 1);
            const sha = 0.52 + 0.48 * Math.max(0, lam);
            const hz = clamp((dep - 1400) / 12000, 0, 0.82) * this.haze;
            const r = lerp(col[0] * sha, SKY_HAZE[0], hz);
            const g = lerp(col[1] * sha, SKY_HAZE[1], hz);
            const bl = lerp(col[2] * sha, SKY_HAZE[2], hz);
            this.push([q[0].sx, q[0].sy, q[1].sx, q[1].sy, q[2].sx, q[2].sy, q[3].sx, q[3].sy],
                      `rgb(${r | 0},${g | 0},${bl | 0})`, dep);
          }
        }
        // cap
        const cap = []; let dep = 0, ok = true;
        for (const q of pts[pts.length - 1]) {
          const v = this.project(q[0], q[1], q[2]);
          if (v.depth < 1) { ok = false; break; }
          cap.push(v.sx, v.sy); dep += v.depth;
        }
        if (ok) {
          dep /= SEG;
          const hz = clamp((dep - 1400) / 12000, 0, 0.82) * this.haze;
          this.push(cap, `rgb(${lerp(84, SKY_HAZE[0], hz) | 0},${lerp(116, SKY_HAZE[1], hz) | 0},${lerp(70, SKY_HAZE[2], hz) | 0})`, dep - 4);
        }
      }
    }
  },

  collectWakes(B) {
    for (const s of B.ships) {
      if (s.wake.length < 3) continue;
      if (s.team !== B.player.team && !s.spotted) continue;
      if (s.cls === 'SS' && s.depth > 0) continue;
      for (let i = 2; i < s.wake.length; i += 2) {
        const a = s.wake[i - 2], b = s.wake[i];
        if (Math.hypot(a.x - Cam.x, a.y - Cam.y) > 4200) continue;
        const age = 1 - i / s.wake.length;
        const w0 = s.beam * (0.6 + age * 2.6), w1 = s.beam * (0.6 + (age - 0.06) * 2.6);
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        const ox = Math.cos(ang), oy = Math.sin(ang);
        const q = [
          this.project(a.x + ox * w0, a.y + oy * w0, 0),
          this.project(b.x + ox * w1, b.y + oy * w1, 0),
          this.project(b.x - ox * w1, b.y - oy * w1, 0),
          this.project(a.x - ox * w0, a.y - oy * w0, 0),
        ];
        if (q.some(p => p.depth < 1)) continue;
        const dep = (q[0].depth + q[2].depth) / 2;
        this.push([q[0].sx, q[0].sy, q[1].sx, q[1].sy, q[2].sx, q[2].sy, q[3].sx, q[3].sy],
                  'rgba(210,240,255,' + (0.16 * clamp(a.t, 0, 1)).toFixed(3) + ')', dep - 2);
      }
    }
    // torpedo wakes
    const p = B.player;
    for (const tp of B.torps) {
      const mine = tp.team === p.team;
      if (!mine) {
        let seen = false;
        for (const s of B.ships) {
          if (!s.alive || s.team !== p.team) continue;
          const dd = dist(tp, s);
          if (dd < tp.detect || (s.consActive('hydro') && dd < 4200)) { seen = true; break; }
        }
        if (!seen) continue;
      }
      for (let i = 2; i < tp.trail.length; i += 2) {
        const a = tp.trail[i - 2], b = tp.trail[i];
        if (a.t <= 0) continue;
        const ang = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
        const wdt = 11;
        const ox = Math.cos(ang) * wdt, oy = Math.sin(ang) * wdt;
        const q = [
          this.project(a.x + ox, a.y + oy, 0), this.project(b.x + ox, b.y + oy, 0),
          this.project(b.x - ox, b.y - oy, 0), this.project(a.x - ox, a.y - oy, 0),
        ];
        if (q.some(v => v.depth < 1)) continue;
        this.push([q[0].sx, q[0].sy, q[1].sx, q[1].sy, q[2].sx, q[2].sy, q[3].sx, q[3].sy],
          (mine ? 'rgba(190,235,255,' : 'rgba(255,150,150,') + (0.5 * clamp(a.t, 0, 1)).toFixed(3) + ')',
          (q[0].depth + q[2].depth) / 2 - 3);
      }
      const head = this.project(tp.x, tp.y, 1);
      if (head.depth > 1) {
        const r = Math.max(1.5, this.focal * 9 / head.depth);
        this.push(null, mine ? '#dff2ff' : '#ff9c9c', head.depth - 4, 1);
        this.buf[this.buf.length - 1].circle = [head.sx, head.sy, r];
      }
    }
  },

  collectShips(B, t) {
    for (const s of B.ships) {
      const mine = s.team === B.player.team;
      if (!mine && !s.spotted && s.alive) continue;
      const d = Math.hypot(s.x - Cam.x, s.y - Cam.y);
      if (d > 22000) continue;

      const mesh = shipMesh(s.def);
      let roll = -s.rudder * 0.10 * clamp(Math.abs(s.speed) / 8, 0, 1);
      roll += Math.sin(t * 0.9 + s.uid) * 0.018;
      let z = 0, pitchDown = 0;
      if (s.cls === 'SS') z = -s.depthF * 13;
      if (!s.alive) {
        const k = clamp(s.sinkT / 5, 0, 1);
        z = -k * (s.beam * 1.2 + 26);
        roll += k * 0.9;
        pitchDown = k * 0.35;
      }
      const hd = s.hd + pitchDown * 0;             // sinking handled by roll and z
      const ch = Math.cos(hd), sh = Math.sin(hd);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const tint = mine ? [70, 190, 120] : [225, 90, 90];
      const hazeK = 1;

      for (const f of mesh.faces) this.emitFace(f, s.x, s.y, z, ch, sh, cr, sr, tint, hazeK);

      // turrets, each spun to its own bearing
      if (s.cls !== 'SS' && s.turrets) {
        const tm = turretMesh(s.def);
        for (const tr of s.turrets) {
          const rel = angleDiff(hd, tr.ang);
          const tch = Math.cos(rel), tsh = Math.sin(rel);
          const bx = tr.ox * s.len, bz = mesh.deck + (tr.isFore ? s.beam * 0.06 : s.beam * 0.04);
          // place the turret in hull space, then rotate the turret itself
          for (const f of tm) {
            const nx0 = f.n[0] * tch - f.n[1] * tsh, ny0 = f.n[0] * tsh + f.n[1] * tch;
            const nyr = ny0 * cr - f.n[2] * sr, nzr = ny0 * sr + f.n[2] * cr;
            const nxw = nx0 * ch - nyr * sh, nyw = nx0 * sh + nyr * ch;
            const clx = f.cen[0] * tch - f.cen[1] * tsh + bx;
            const cly = f.cen[0] * tsh + f.cen[1] * tch;
            const clz = f.cen[2] + bz;
            const cry = cly * cr - clz * sr, crz = cly * sr + clz * cr;
            const wcx = s.x + clx * ch - cry * sh, wcy = s.y + clx * sh + cry * ch;
            if (nxw * (Cam.x - wcx) + nyw * (Cam.y - wcy) + nzr * (Cam.z - z - crz) <= 0) continue;

            const pts = [];
            let depth = 0; let bad = false;
            for (const p of f.p) {
              // spin around the turret's own axis
              const lx = p[0] * tch - p[1] * tsh + bx;
              const ly = p[0] * tsh + p[1] * tch;
              const lz = p[2] + bz;
              const ry = ly * cr - lz * sr, rz = ly * sr + lz * cr;
              const wx = s.x + lx * ch - ry * sh;
              const wy = s.y + lx * sh + ry * ch;
              const q = this.project(wx, wy, z + rz);
              if (q.depth < 1) { bad = true; break; }
              pts.push(q.sx, q.sy); depth += q.depth;
            }
            if (bad) continue;
            depth /= f.p.length;
            const lam = clamp(nxw * LIGHT[0] + nyw * LIGHT[1] + nzr * LIGHT[2], -1, 1);
            const sha = 0.55 + 0.45 * Math.max(0, lam);
            const base = rgbOf(f.c);
            const hz = clamp((depth - 1400) / 12000, 0, 0.82) * this.haze;
            const r = lerp(base[0] * sha, SKY_HAZE[0], hz);
            const g = lerp(base[1] * sha, SKY_HAZE[1], hz);
            const b = lerp(base[2] * sha, SKY_HAZE[2], hz);
            this.push(pts, `rgb(${r | 0},${g | 0},${b | 0})`, depth);
          }
        }
      }
    }
  },

  // squadrons, their shadows on the water, and anything they have dropped
  collectAircraft(B, t) {
    for (const sq of B.squads) {
      const mine = sq.team === B.player.team;
      // enemy aircraft are visible once they are near our fleet
      if (!mine) {
        let seen = false;
        for (const s of B.ships) {
          if (s.alive && s.team === B.player.team &&
              Math.hypot(s.x - sq.x, s.y - sq.y) < 7000) { seen = true; break; }
        }
        if (!seen) continue;
      }
      if (Math.hypot(sq.x - Cam.x, sq.y - Cam.y) > 16000) continue;

      const tint = mine ? [70, 190, 120] : [225, 90, 90];
      for (const pl of sq.planes) {
        const wob = Math.sin(t * 2.6 + pl.wob) * 6;
        const ch = Math.cos(sq.hd), sh = Math.sin(sq.hd);
        const px = sq.x + pl.ox * ch - pl.oy * sh;
        const py = sq.y + pl.ox * sh + pl.oy * ch;
        const pz = sq.z + wob;
        const roll = Math.sin(t * 1.7 + pl.wob) * 0.10;
        for (const f of PLANE_MESH)
          this.emitFace(f, px, py, pz, ch, sh, Math.cos(roll), Math.sin(roll), tint, 1);
        // shadow, so you can tell how high they are
        const sq0 = this.project(px, py, 0);
        if (sq0.depth > 1) {
          const r = this.focal * 9 / sq0.depth;
          if (r > 0.5) this.buf.push({ pts: null, col: 'rgba(0,0,0,.16)',
            depth: sq0.depth + 1, circle: [sq0.sx, sq0.sy, r, r * 0.5], alpha: 1 });
        }
      }
    }
    for (const b of B.bombs) {
      const q = this.project(b.x, b.y, b.z);
      if (q.depth < 1) continue;
      const r = Math.min(6, this.focal * (b.rocket ? 1.6 : 2.6) / q.depth);
      if (r < 0.5) continue;
      this.buf.push({ pts: null, col: b.rocket ? '#ffd08a' : '#d8dee4',
                      depth: q.depth - 4, circle: [q.sx, q.sy, r, r], alpha: 1 });
    }
    for (const fp of B.fighters) {
      const mine = fp.team === B.player.team;
      const ch = Math.cos(fp.a + Math.PI / 2), sh = Math.sin(fp.a + Math.PI / 2);
      for (const f of PLANE_MESH)
        this.emitFace(f, fp.x, fp.y, fp.z, ch, sh, 1, 0,
                      mine ? [70, 190, 120] : [225, 90, 90], 1);
    }
  },

  collectEffects(B, t) {
    // aspect > 1 makes a tall column (a shell splash), soft adds a glow falloff
    const bill = (x, y, z, r, col, dOff, aspect, soft, maxPx) => {
      const q = this.project(x, y, z);
      if (q.depth < 1) return;
      let pr = this.focal * r / q.depth;
      if (pr < 0.6) return;
      if (maxPx) pr = Math.min(pr, maxPx);
      const o = { pts: null, col, depth: q.depth + (dOff || 0),
                  circle: [q.sx, q.sy, pr, pr * (aspect || 1)], soft, alpha: 1 };
      this.buf.push(o);
      return o;
    };

    for (const sh of B.shells) {
      // a shell is a speck; near the muzzle its true size would fill the screen
      bill(sh.x, sh.y, sh.z || 0, sh.cal * 0.012 + 1.2,
           sh.type === 'AP' ? '#ffe9a8' : '#ffc06a', -6, 1, false, 6);
    }
    for (const f of B.fx) {
      if (f.k === 'splash') {
        const rise = 1 - f.t;                       // 0 at the moment of impact
        const hgt = f.r * 2.6 * Math.min(1, rise * 2.2);
        bill(f.x, f.y, hgt * 0.5, f.r * 0.5,
             'rgba(226,246,255,' + (f.t * 0.8).toFixed(2) + ')', -8, hgt / (f.r || 1), true);
        bill(f.x, f.y, 2, f.r * (0.55 + rise * 0.8),
             'rgba(210,238,252,' + (f.t * 0.35).toFixed(2) + ')', -7, 0.34, true);
      } else if (f.k === 'boom') {
        bill(f.x, f.y, f.r * 0.30 * (1.2 - f.t), f.r * (1.25 - f.t) * 0.8,
             'rgba(255,150,52,' + (f.t * 0.9).toFixed(2) + ')', -10, 1, true);
        bill(f.x, f.y, f.r * 0.44 * (1.2 - f.t), f.r * (1.25 - f.t) * 0.42,
             'rgba(255,246,208,' + f.t.toFixed(2) + ')', -11, 1, true);
      } else if (f.k === 'hit') {
        bill(f.x, f.y, 14, f.type === 'cit' ? 40 : 16,
             f.type === 'cit' ? 'rgba(255,110,60,' + f.t + ')'
             : f.type === 'AP' ? 'rgba(255,238,170,' + f.t + ')' : 'rgba(255,180,90,' + f.t + ')', -9);
      } else if (f.k === 'flak') {
        bill(f.x, f.y, f.z, 20 * (1.3 - f.t),
             'rgba(64,66,70,' + (f.t * 0.42).toFixed(2) + ')', -4, 1, true, 46);
        bill(f.x, f.y, f.z, 9 * (1.3 - f.t),
             'rgba(255,222,150,' + (f.t * 0.85).toFixed(2) + ')', -5, 1, true, 22);
      } else if (f.k === 'flash') {
        bill(f.x, f.y, 16, 22 * f.s * (f.t * 5),
             'rgba(255,231,170,' + clamp(f.t * 4, 0, 1).toFixed(2) + ')', -9, 1, true, 90);
      }
    }
    // fires burning on deck
    for (const s of B.ships) {
      if (!s.alive || !s.fires.length) continue;
      if (s.team !== B.player.team && !s.spotted) continue;
      const m = shipMesh(s.def);
      for (const f of s.fires) {
        const fx = s.x + Math.cos(s.hd) * s.len * f.off;
        const fy = s.y + Math.sin(s.hd) * s.len * f.off;
        const flick = 1 + Math.sin(t * 17 + f.off * 11) * 0.22;
        bill(fx, fy, m.deck + s.beam * 0.34 * flick, s.beam * 0.26 * flick, 'rgba(255,140,40,.7)', -7);
        bill(fx, fy, m.deck + s.beam * 0.52 * flick, s.beam * 0.14 * flick, 'rgba(255,240,170,.85)', -8);
        bill(fx, fy, m.deck + s.beam * 1.7, s.beam * 0.55, 'rgba(70,72,78,.22)', -6);
      }
    }
    for (const sm of B.smokes) {
      if (sm.r < 5) continue;
      const puffs = 3;
      for (let i = 0; i < puffs; i++) {
        const a = i / puffs * TAU + sm.x * 0.01;
        bill(sm.x + Math.cos(a) * sm.r * 0.35, sm.y + Math.sin(a) * sm.r * 0.35,
             sm.r * 0.42, sm.r * 0.8,
             'rgba(228,236,242,' + (clamp(sm.t / 8, 0, 1) * 0.42).toFixed(2) + ')', -5);
      }
    }
    for (const tr of B.tracers) {
      const a = this.project(tr.x1, tr.y1, 16), b = this.project(tr.x2, tr.y2, 8);
      if (a.depth < 1 || b.depth < 1) continue;
      this.buf.push({ pts: null, line: [a.sx, a.sy, b.sx, b.sy],
                      col: 'rgba(255,220,150,' + tr.t.toFixed(2) + ')', depth: a.depth - 5, alpha: 1 });
    }
  },

  paint() {
    const c = this.ctx;
    this.buf.sort((a, b) => b.depth - a.depth);
    for (const f of this.buf) {
      c.fillStyle = f.col;
      if (f.circle) {
        const [cx, cy, rx, ry] = f.circle;
        if (f.soft) {
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
          g.addColorStop(0, f.col);
          g.addColorStop(0.55, f.col);
          g.addColorStop(1, f.col.replace(/[\d.]+\)$/, '0)'));
          c.fillStyle = g;
        }
        c.beginPath();
        c.ellipse(cx, cy, Math.max(0.4, rx), Math.max(0.4, ry), 0, 0, TAU);
        c.fill();
      } else if (f.line) {
        c.strokeStyle = f.col; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(f.line[0], f.line[1]); c.lineTo(f.line[2], f.line[3]); c.stroke();
      } else {
        const p = f.pts;
        c.beginPath();
        c.moveTo(p[0], p[1]);
        for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
        c.closePath();
        c.fill();
      }
    }
  },

  // --------------------------------------------------------------- overlays
  drawOverlays(B, t) {
    const c = this.ctx;
    const p = B.player;

    // name plates
    c.textAlign = 'center';
    for (const s of B.ships) {
      if (!s.alive) continue;
      const mine = s.team === B.player.team;
      if (!mine && !s.spotted) continue;
      if (s === p && Cam.mode !== 'overhead') continue;
      const m = shipMesh(s.def);
      const q = this.project(s.x, s.y, m.deck + s.beam * 2.2);
      if (q.depth < 1 || q.sx < -80 || q.sx > this.w + 80) continue;
      const d = q.depth;
      const scale = clamp(1400 / d, 0.55, 1.15);
      const w = 52 * scale;
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.fillRect(q.sx - w / 2, q.sy, w, 4 * scale);
      c.fillStyle = mine ? (s.isPlayer ? '#f2c14e' : '#4ad07a') : '#ff5a5a';
      c.fillRect(q.sx - w / 2, q.sy, w * (s.hp / s.maxHp), 4 * scale);
      if (d < 13000) {
        c.font = (10 * scale).toFixed(1) + 'px Segoe UI';
        c.fillStyle = mine ? 'rgba(196,240,212,.92)' : 'rgba(255,196,196,.92)';
        let tag = s.cls + ' ' + s.name;
        if (s.cls === 'SS' && s.depth > 0) tag += s.depth === 2 ? ' ▼▼' : ' ▼';
        c.fillText(tag, q.sx, q.sy - 5 * scale);
        c.font = (9 * scale).toFixed(1) + 'px Segoe UI';
        c.fillStyle = 'rgba(200,225,240,.6)';
        c.fillText((dist(p, s) / 1000).toFixed(1) + ' km', q.sx, q.sy + 14 * scale);
      }
      if (s === p.target) {
        c.strokeStyle = '#f2c14e'; c.lineWidth = 1.4;
        const r = clamp(this.focal * s.len * 0.55 / d, 8, 400);
        c.beginPath(); c.arc(q.sx, this.project(s.x, s.y, 0).sy, r, 0, TAU); c.stroke();
      }
      if (s.pinged > 0 && !mine) {
        const g = this.project(s.x, s.y, 0);
        c.strokeStyle = 'rgba(255,120,255,.85)'; c.lineWidth = 1.6;
        const r = clamp(this.focal * s.len * 0.6 / d, 7, 400);
        c.beginPath(); c.arc(g.sx, g.sy, r, 0, TAU); c.stroke();
      }
    }

    if (!p || !p.alive) return;

    // maximum range ring drawn on the water
    const maxR = p.weapon === 2 && p.def.torps ? p.def.torps.range : p.def.guns.range;
    this.seaCircle(p.x, p.y, maxR, 'rgba(150,200,230,.18)');
    if (p.weapon === 2 && p.def.torps) this.torpArc(p);

    // the aiming reticle sits where the camera is pointing
    const aim = p.aim;
    const q = this.project(aim.x, aim.y, 0);
    const rng = Math.hypot(aim.x - p.x, aim.y - p.y);
    const inRange = rng <= maxR;
    if (q.depth > 1) {
      const col = inRange ? 'rgba(255,255,255,.9)' : 'rgba(255,110,110,.9)';
      c.strokeStyle = col; c.lineWidth = 1.6;
      c.beginPath(); c.arc(q.sx, q.sy, 10, 0, TAU); c.stroke();
      c.beginPath();
      c.moveTo(q.sx - 19, q.sy); c.lineTo(q.sx - 5, q.sy);
      c.moveTo(q.sx + 5, q.sy); c.lineTo(q.sx + 19, q.sy);
      c.moveTo(q.sx, q.sy - 19); c.lineTo(q.sx, q.sy - 5);
      c.moveTo(q.sx, q.sy + 5); c.lineTo(q.sx, q.sy + 19);
      c.stroke();
      c.font = '11px Segoe UI'; c.textAlign = 'left';
      c.fillStyle = col;
      c.fillText((rng / 1000).toFixed(1) + ' km', q.sx + 16, q.sy - 13);
    }

    // lead marker on the locked target
    const tgt = p.target;
    if (tgt && tgt.alive && (tgt.spotted || tgt.team === p.team)) {
      const speed = p.weapon === 2 && p.def.torps ? p.def.torps.speed : p.def.guns.shellSpeed;
      const lead = tgt.leadPoint(p, speed);
      const lq = this.project(lead.x, lead.y, 0);
      const tq = this.project(tgt.x, tgt.y, 0);
      if (lq.depth > 1 && tq.depth > 1) {
        c.strokeStyle = 'rgba(242,193,78,.9)'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(lq.sx, lq.sy, 7, 0, TAU); c.stroke();
        c.setLineDash([4, 4]);
        c.strokeStyle = 'rgba(242,193,78,.4)';
        c.beginPath(); c.moveTo(tq.sx, tq.sy); c.lineTo(lq.sx, lq.sy); c.stroke();
        c.setLineDash([]);
        c.textAlign = 'left';
        c.fillStyle = 'rgba(242,193,78,.9)'; c.font = '10px Segoe UI';
        c.fillText('aim here · ' + lead.t.toFixed(1) + 's', lq.sx + 10, lq.sy + 4);
      }
    }

    // capture zones, painted as rings on the sea
    for (const z of World.zones) {
      const col = z.owner === 1 ? 'rgba(74,208,122,' : z.owner === 2 ? 'rgba(255,90,90,' : 'rgba(235,235,235,';
      this.seaCircle(z.x, z.y, z.r, col + (z.contest ? '.85)' : '.4)'), z.contest ? 3 : 2);
      const zq = this.project(z.x, z.y, 35);
      if (zq.depth > 1) {
        c.textAlign = 'center';
        c.font = 'bold ' + clamp(this.focal * 160 / zq.depth, 11, 30).toFixed(0) + 'px Segoe UI';
        c.fillStyle = col + '.55)';
        c.fillText(z.key, zq.sx, zq.sy);
      }
    }

    if (Cam.mode === 'sniper') {
      // a soft vignette so the zoomed view reads as optics
      const g = c.createRadialGradient(this.w / 2, this.h / 2, this.h * 0.28,
                                       this.w / 2, this.h / 2, this.h * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.38)');
      c.fillStyle = g; c.fillRect(0, 0, this.w, this.h);
    }
  },

  seaCircle(cx, cy, r, style, width) {
    const c = this.ctx;
    const SEG = 64;
    c.beginPath();
    let started = false, drew = false;
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * TAU;
      const q = this.project(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0);
      if (q.depth < 1) { started = false; continue; }
      if (!started) { c.moveTo(q.sx, q.sy); started = true; }
      else { c.lineTo(q.sx, q.sy); drew = true; }
    }
    if (!drew) return;
    c.strokeStyle = style; c.lineWidth = width || 1.5;
    c.stroke();
  },

  torpArc(p) {
    const c = this.ctx;
    const t = p.def.torps;
    for (const side of [1, -1]) {
      c.beginPath();
      let started = false;
      for (let i = 0; i <= 24; i++) {
        const a = p.hd + side * lerp(t.arc, Math.PI - t.arc, i / 24);
        const q = this.project(p.x + Math.cos(a) * t.range, p.y + Math.sin(a) * t.range, 0);
        if (q.depth < 1) { started = false; continue; }
        if (!started) { c.moveTo(q.sx, q.sy); started = true; } else c.lineTo(q.sx, q.sy);
      }
      c.strokeStyle = 'rgba(160,230,255,.3)'; c.lineWidth = 2; c.stroke();
    }
  },

  // ---------------------------------------------------------------- minimap
  drawMinimap(B) {
    const c = this.mctx, S = 250, k = S / MAP;
    c.clearRect(0, 0, S, S);
    c.fillStyle = 'rgba(8,32,46,.9)'; c.fillRect(0, 0, S, S);

    c.fillStyle = '#3e6b41';
    for (const isl of World.islands)
      for (const b of isl.blobs) {
        c.beginPath(); c.arc(b.x * k, b.y * k, b.r * k, 0, TAU); c.fill();
      }

    for (const z of World.zones) {
      c.strokeStyle = z.owner === 1 ? '#4ad07a' : z.owner === 2 ? '#ff5a5a' : 'rgba(255,255,255,.5)';
      c.lineWidth = z.contest ? 2 : 1;
      c.beginPath(); c.arc(z.x * k, z.y * k, z.r * k, 0, TAU); c.stroke();
      c.fillStyle = c.strokeStyle; c.font = '9px Segoe UI'; c.textAlign = 'center';
      c.fillText(z.key, z.x * k, z.y * k + 3);
    }

    for (const tp of B.torps) {
      if (tp.team !== B.player.team) continue;
      c.fillStyle = 'rgba(160,230,255,.6)';
      c.fillRect(tp.x * k - 1, tp.y * k - 1, 2, 2);
    }

    for (const s of B.ships) {
      if (!s.alive) continue;
      const mine = s.team === B.player.team;
      if (!mine && !s.spotted) continue;
      c.save();
      c.translate(s.x * k, s.y * k);
      c.rotate(s.hd);
      c.fillStyle = s.isPlayer ? '#f2c14e' : mine ? '#4ad07a' : '#ff5a5a';
      const sz = s.cls === 'BB' ? 5 : s.cls === 'CA' ? 4 : 3;
      c.beginPath();
      c.moveTo(sz, 0); c.lineTo(-sz * 0.7, -sz * 0.6); c.lineTo(-sz * 0.7, sz * 0.6);
      c.closePath(); c.fill();
      c.restore();
    }

    // which way the camera is looking
    const p = B.player;
    if (p) {
      c.save();
      c.translate(p.x * k, p.y * k);
      c.rotate(Cam.yaw);
      c.fillStyle = 'rgba(255,255,255,.14)';
      c.beginPath();
      c.moveTo(0, 0);
      c.arc(0, 0, 42, -Cam.fov / 2, Cam.fov / 2);
      c.closePath(); c.fill();
      c.restore();
    }
  },
};
