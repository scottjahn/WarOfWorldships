// ---- the ocean: islands, capture zones, spawn lines ------------------------
const MAP = 12000;              // metres, square

// An island is a cluster of overlapping circles. Cheap to draw, cheap to test
// against for collision, torpedo blocking and line of sight.
function makeIsland(cx, cy, size) {
  const blobs = [];
  const n = randInt(4, 8);
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), d = rand(size * 0.8);
    blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: size * rand(0.75, 0.4),
                 seedA: rand(TAU), hMul: rand(1.35, 0.55) });
  }
  blobs.push({ x: cx, y: cy, r: size * 0.6, seedA: rand(TAU), hMul: rand(1.5, 1.0) });
  let rMax = 0;
  for (const b of blobs) rMax = Math.max(rMax, Math.hypot(b.x - cx, b.y - cy) + b.r);
  return { x: cx, y: cy, blobs, r: rMax, seed: rand(1000) };
}

const World = {
  islands: [],
  zones: [],

  generate() {
    this.islands = [];
    this.zones = [
      { key: 'A', x: MAP * 0.22, y: MAP * 0.5, r: 700, owner: 0, progress: 0, contest: false },
      { key: 'B', x: MAP * 0.50, y: MAP * 0.5, r: 700, owner: 0, progress: 0, contest: false },
      { key: 'C', x: MAP * 0.78, y: MAP * 0.5, r: 700, owner: 0, progress: 0, contest: false },
    ];

    const keepClear = p => {
      for (const z of this.zones) if (dist(p, z) < z.r + 550) return false;
      if (p.y < MAP * 0.14 || p.y > MAP * 0.86) return false;   // spawn lanes
      for (const i of this.islands) if (dist(p, i) < i.r + p.size + 500) return false;
      return true;
    };

    let tries = 0;
    while (this.islands.length < 13 && tries++ < 700) {
      const size = rand(900, 320);
      const p = { x: rand(MAP - 1200, 1200), y: rand(MAP - 1600, 1600), size };
      if (!keepClear(p)) continue;
      this.islands.push(makeIsland(p.x, p.y, size));
    }
  },

  // ---- queries ----
  landAt(x, y, pad = 0) {
    for (const isl of this.islands) {
      if ((x - isl.x) ** 2 + (y - isl.y) ** 2 > (isl.r + pad) ** 2) continue;
      for (const b of isl.blobs) {
        if ((x - b.x) ** 2 + (y - b.y) ** 2 < (b.r + pad) ** 2) return isl;
      }
    }
    return null;
  },

  // does the straight line a->b cross land? used for spotting and torpedoes
  blocked(ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len < 1) return false;
    for (const isl of this.islands) {
      // quick reject: distance from island centre to the segment
      const t = clamp(((isl.x - ax) * dx + (isl.y - ay) * dy) / (len * len), 0, 1);
      const px = ax + dx * t, py = ay + dy * t;
      if ((px - isl.x) ** 2 + (py - isl.y) ** 2 > isl.r ** 2) continue;
      for (const b of isl.blobs) {
        const tb = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / (len * len), 0, 1);
        const qx = ax + dx * tb, qy = ay + dy * tb;
        if ((qx - b.x) ** 2 + (qy - b.y) ** 2 < b.r ** 2) return true;
      }
    }
    return false;
  },

  // push a point out of land — used to keep ships and bots off the rocks
  clearanceDir(x, y, pad) {
    let nx = 0, ny = 0, hit = false;
    for (const isl of this.islands) {
      if ((x - isl.x) ** 2 + (y - isl.y) ** 2 > (isl.r + pad) ** 2) continue;
      for (const b of isl.blobs) {
        const d = Math.hypot(x - b.x, y - b.y);
        if (d < b.r + pad) {
          hit = true;
          const w = (b.r + pad - d) / (b.r + pad);
          nx += (x - b.x) / (d || 1) * w;
          ny += (y - b.y) / (d || 1) * w;
        }
      }
    }
    return hit ? { x: nx, y: ny } : null;
  },

  spawnPoints(team, count) {
    const y = team === 1 ? MAP * 0.90 : MAP * 0.10;
    const pts = [];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      pts.push({ x: lerp(MAP * 0.22, MAP * 0.78, t), y: y + rand(400, -400) });
    }
    return pts;
  },
};
