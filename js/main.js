// ---- input, camera and the main loop ---------------------------------------

const Keys = {};
const Mouse = { x: 0, y: 0, down: false, locked: false };
let inBattle = false;

const LOOK_SENS = 0.0022;
const PITCH_MIN = -0.10, PITCH_MAX = 1.35;

// Time control. Half speed is for learning to lead a target; the fast settings
// are for the long run out to the middle of the map.
const TIME_SCALES = [0.5, 1, 2, 4, 8];
let timeIdx = 1;
const timeScale = () => TIME_SCALES[timeIdx];

function setTimeScale(i) {
  // no ribbon: the colour-coded readout by the throttle is always on screen,
  // and tapping the key three times should not bury the team list
  timeIdx = clamp(i, 0, TIME_SCALES.length - 1);
}

function startBattle() {
  const per = parseInt(el('team-size').value, 10);
  el('port').classList.add('hidden');
  el('battle').classList.remove('hidden');
  el('results').classList.add('hidden');
  el('roster-green').innerHTML = ''; el('roster-red').innerHTML = '';
  el('ribbons').innerHTML = '';
  inBattle = true;
  Battle.fastForward = false;
  timeIdx = 1;                         // every battle starts at normal speed
  Battle.start(Account.data.selected, per);
  Render.resize();

  const p = Battle.player;
  Cam.mode = 'chase';
  Cam.yaw = p.hd;                      // start looking over the bow
  Cam.pitch = 0.13;
  Cam.fov = Cam.wantFov = 58 * DEG;
  Render.chaseOffsets(p);
  Render.updateCamera(p, 0.016);
  UI.bigMsg('BATTLE STATIONS', '#f2c14e');
  requestLock();
}

function toPort() {
  inBattle = false;
  Battle.running = false;
  releaseLock();
  el('battle').classList.add('hidden');
  el('results').classList.add('hidden');
  el('port').classList.remove('hidden');
  UI.initPort();
}

// ---------------------------------------------------------------- pointer lock
const cv = el('cv');

function requestLock() {
  if (!cv.requestPointerLock || Mouse.lockUnavailable) return;
  // In modern browsers this returns a promise, so a refusal (embedded frame, a
  // request without a user gesture, a user who said no) has to be caught there
  // rather than by try/catch. When it is refused we simply steer with the
  // cursor instead.
  let p;
  try { p = cv.requestPointerLock(); } catch (e) { return lockRefused(); }
  if (p && typeof p.catch === 'function') p.catch(lockRefused);
}

function lockRefused() {
  if (Mouse.lockUnavailable) return;
  Mouse.lockUnavailable = true;
  Mouse.locked = false;
  el('lockhint').classList.add('hidden');
  UI.ribbon('Mouse capture unavailable — aim with the cursor');
}
function releaseLock() {
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
}
document.addEventListener('pointerlockchange', () => {
  Mouse.locked = document.pointerLockElement === cv;
  el('lockhint').classList.toggle('hidden',
    Mouse.locked || !inBattle || Mouse.lockUnavailable);
});
document.addEventListener('pointerlockerror', lockRefused);

// ------------------------------------------------------------------- input
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (Keys[k]) return;                       // ignore auto-repeat
  Keys[k] = true;
  if (!inBattle || !Battle.running) return;
  const p = Battle.player;
  if (k === 'enter' && p && !p.alive && !Battle.over) {
    Battle.fastForward = true;
    UI.bigMsg('SKIPPING TO THE END…', '#f2c14e');
    return;
  }
  if (k === ']' || k === '=' || k === '+') { setTimeScale(timeIdx + 1); return; }
  if (k === '[' || k === '-' || k === '_') { setTimeScale(timeIdx - 1); return; }
  if (k === '0') { setTimeScale(1); return; }
  if (!p || !p.alive) return;

  // ---- carrier: the number keys send a squadron up, F calls it home ----
  if (p.cls === 'CV') {
    const deck = { '1': 'rk', '2': 'db', '3': 'tb' }[k];
    if (deck) {
      if (Battle.playerSquad) { UI.ribbon('Already flying — press F to come home'); return; }
      const sq = Battle.launch(p, deck);
      if (sq) {
        Battle.playerSquad = sq;
        Cam.mode = 'chase';
        Cam.yaw = sq.hd; Cam.pitch = 0.18;
        UI.ribbon(sq.def.name + ' launched');
      } else {
        UI.ribbon('Flight deck not ready');
      }
      return;
    }
    if (k === 'f') {
      if (Battle.playerSquad) { Battle.playerSquad.recall(); UI.ribbon('Returning to the ship'); }
      return;
    }
  }

  switch (k) {
    case 'w': p.notch = Math.min(5, p.notch + 1); break;
    case 's': p.notch = Math.max(0, p.notch - 1); break;
    case '1':
      if (p.weapon === 1) p.ammo = p.ammo === 'HE' ? 'AP' : 'HE';
      p.weapon = 1; break;
    case '2': if (p.def.torps) p.weapon = 2; break;
    case '3': if (p.cls === 'DD' || p.cls === 'CA') p.weapon = 3; break;
    case 'r': p.useCons('dcp', Battle); break;
    case 't': p.useCons('heal', Battle); break;
    case 'y': p.useCons('smoke', Battle) || p.useCons('hydro', Battle) || p.useCons('radar', Battle); break;
    case 'u': p.useCons('boost', Battle); break;
    case 'f': p.useCons('ping', Battle); break;
    case 'c': if (p.cls === 'SS' && p.oxygen > 5) p.depth = Math.min(2, p.depth + 1); break;
    case 'v': if (p.cls === 'SS') p.depth = Math.max(0, p.depth - 1); break;
    case 'x': lockTarget(); break;
    case 'm': setCamMode(Cam.mode === 'overhead' ? 'chase' : 'overhead'); break;
    case 'shift': setCamMode(Cam.mode === 'sniper' ? 'chase' : 'sniper'); break;
  }
  if (k === ' ') e.preventDefault();
});
window.addEventListener('keyup', e => { Keys[e.key.toLowerCase()] = false; });

function setCamMode(mode) {
  Cam.mode = mode;
  if (mode === 'sniper')        Cam.wantFov = 14 * DEG;
  else if (mode === 'overhead') { Cam.wantFov = 58 * DEG; Cam.pitch = 1.45; }
  else                          { Cam.wantFov = 58 * DEG; Cam.pitch = clamp(Cam.pitch, PITCH_MIN, 0.45); }
}

cv.addEventListener('mousemove', e => {
  const r = cv.getBoundingClientRect();
  Mouse.x = e.clientX - r.left; Mouse.y = e.clientY - r.top;
  if (!inBattle) return;
  if (Mouse.locked) {
    // free look, scaled by zoom so the sniper view stays steady
    const s = LOOK_SENS * (Cam.fov / (58 * DEG));
    Cam.yaw = normAngle(Cam.yaw + e.movementX * s);
    if (Cam.mode !== 'overhead') Cam.pitch = clamp(Cam.pitch + e.movementY * s, PITCH_MIN, PITCH_MAX);
  }
});

cv.addEventListener('mousedown', e => {
  if (!Mouse.locked && !Mouse.lockUnavailable && inBattle && Battle.running) {
    requestLock();
    return;
  }
  if (e.button === 0) Mouse.down = true;
  if (e.button === 2) lockTarget();
});
window.addEventListener('mouseup', () => Mouse.down = false);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  const lo = Cam.mode === 'sniper' ? 5 * DEG : 26 * DEG;
  const hi = Cam.mode === 'sniper' ? 22 * DEG : 78 * DEG;
  Cam.wantFov = clamp(Cam.wantFov * (e.deltaY > 0 ? 1.12 : 0.89), lo, hi);
  e.preventDefault();
}, { passive: false });

function lockTarget() {
  const p = Battle.player;
  if (!p || !p.alive) return;
  let best = null, bd = 3000;
  for (const s of Battle.ships) {
    if (!s.alive || s.team === p.team || !s.spotted) continue;
    const d = Math.hypot(s.x - p.aim.x, s.y - p.aim.y);
    if (d < bd) { bd = d; best = s; }
  }
  p.locked = best;
  p.target = best;
  if (best) UI.ribbon('Target: ' + best.name);
}

// ------------------------------------------------------------------- loop
let last = performance.now();

function loop(now) {
  const raw = (now - last) / 1000;
  last = now;
  // Never hand the simulation a negative or enormous step: the first animation
  // frame can carry a timestamp from a different clock origin than
  // performance.now(), and a backgrounded tab returns with a huge gap.
  const dt = clamp(raw, 0, 0.05);
  requestAnimationFrame(loop);
  if (!inBattle) return;

  const B = Battle;
  const p = B.player;

  const flying = B.playerSquad && B.playerSquad.alive;

  if (flying && p && p.alive && B.running) {
    flySquadron(B, B.playerSquad, dt);
    carrierAutopilot(p, dt);
  } else if (p && p.alive && B.running) {
    p.rudderIn = (Keys['a'] ? -1 : 0) + (Keys['d'] ? 1 : 0);

    // With the pointer captured you aim by pointing the ship's camera; without
    // it, fall back to the cursor so the game is still playable.
    const ax = Mouse.locked ? Render.w / 2 : Mouse.x;
    const ay = Mouse.locked ? Render.h / 2 : Mouse.y;
    const sp = Render.aimPoint(B, ax, ay, p.weapon === 1);
    p.aim.x = clamp(sp.x, 0, MAP); p.aim.y = clamp(sp.y, 0, MAP);
    if (!Mouse.locked) {
      const off = (Mouse.x - Render.w / 2) / (Render.w / 2);
      if (Math.abs(off) > 0.45) Cam.yaw = normAngle(Cam.yaw + (off - Math.sign(off) * 0.45) * dt * 2.2);
    }
    // never aim further than the guns can throw
    const rng = Math.hypot(p.aim.x - p.x, p.aim.y - p.y);
    const maxR = (p.weapon === 2 && p.def.torps ? p.def.torps.range : p.def.guns.range) * 1.02;
    if (rng > maxR) {
      const a = Math.atan2(p.aim.y - p.y, p.aim.x - p.x);
      p.aim.x = p.x + Math.cos(a) * maxR;
      p.aim.y = p.y + Math.sin(a) * maxR;
    }

    // soft target acquisition for the lead marker
    if (!p.locked || !p.locked.alive || !p.locked.spotted) {
      p.locked = null;
      let best = null, bd = 2600;
      for (const s of B.ships) {
        if (!s.alive || s.team === p.team || !s.spotted) continue;
        const d = Math.hypot(s.x - p.aim.x, s.y - p.aim.y);
        if (d < bd) { bd = d; best = s; }
      }
      p.target = best;
    } else p.target = p.locked;

    // On the gentler settings the gunners work out the lead themselves: keep
    // the crosshair near an enemy and the crosshair slides ahead to where the
    // shells need to go. That is the single hardest skill in the game removed.
    if (D().autoLead && p.target && p.target.alive &&
        (p.target.spotted || p.target.team === p.team) && p.weapon !== 3) {
      const spd = (p.weapon === 2 && p.def.torps) ? p.def.torps.speed : p.def.guns.shellSpeed;
      const lead = p.target.leadPoint(p, spd);
      p.aim.x = clamp(lead.x, 0, MAP);
      p.aim.y = clamp(lead.y, 0, MAP);
    }

    // and the damage-control party works without being told
    if (D().autoDamageControl) {
      if (p.fires.length || p.flood) p.useCons('dcp', B);
      if (p.hp / p.maxHp < 0.7 && p.potential > p.maxHp * 0.05) p.useCons('heal', B);
      p.useCons('boost', B);
    }

    if (Mouse.down) {
      if (p.weapon === 1) {
        if (p.fireGuns(B)) Cam.shake = p.cls === 'BB' ? 0.85 : p.cls === 'CA' ? 0.5 : 0.3;
      } else if (p.weapon === 2) p.fireTorps(B);
      else if (p.weapon === 3) p.dropDepthCharges(B);
    }
  }

  // once you are sunk the rest of the battle plays at double speed, and ENTER
  // fast-forwards it to the finish
  if (B.fastForward && !B.over) {
    const budget = performance.now() + 9;
    while (!B.over && performance.now() < budget) B.update(0.05);
    if (B.over) B.fastForward = false;
  } else {
    // once you are sunk the rest of the battle plays at least at 4x
    const scale = (p && !p.alive && !B.over) ? Math.max(timeScale(), 4) : timeScale();
    B.advance(dt * scale);
  }

  Render.frame(B, now / 1000, dt);
  if (p) UI.hud(B);
}

// ---------------------------------------------------------------- aviation
// The squadron turns toward wherever the camera is looking, which is how it
// works in the real game: you fly by looking.
function flySquadron(B, sq, dt) {
  sq.steerTo(Cam.yaw, dt, 1);
  sq.boost = Keys['w'] ? 1 : 0;

  const ax = Mouse.locked ? Render.w / 2 : Mouse.x;
  const ay = Mouse.locked ? Render.h / 2 : Mouse.y;
  const sp = Render.aimPoint(B, ax, ay, true);
  sq.aim = { x: clamp(sp.x, 0, MAP), y: clamp(sp.y, 0, MAP) };

  // what are we pointing at? used for the marker and for the easy-mode assist
  let best = null, bd = 2600;
  for (const s of B.ships) {
    if (!s.alive || s.team === sq.team || !s.spotted) continue;
    if (s.cls === 'SS' && s.depth > 0) continue;
    const d = Math.hypot(s.x - sq.aim.x, s.y - sq.aim.y);
    if (d < bd) { bd = d; best = s; }
  }
  sq.target = best;
  B.player.target = best;

  if (Mouse.down && sq.canAttack()) {
    if (sq.beginRun(sq.aim)) {
      // On the gentler settings, swing the torpedo bombers onto the right drop
      // bearing themselves — judging a torpedo lead from a moving aeroplane is
      // a lot to ask of an eight-year-old.
      if (D().autoLead && best && sq.type === 'tb') {
        const lead = best.leadPoint({ x: sq.x, y: sq.y }, sq.def.torpSpeed);
        sq.lockHd = Math.atan2(lead.y - sq.y, lead.x - sq.x);
      } else sq.lockHd = null;
    }
  }
  if (sq.state === 'run' && sq.lockHd != null) sq.steerTo(sq.lockHd, dt, 1.6);
}

// While you are in the air the ship looks after itself: it keeps its head
// down on our own side of the map.
function carrierAutopilot(cv, dt) {
  const home = cv.team === 1 ? MAP * 0.86 : MAP * 0.14;
  const want = Math.atan2(home - cv.y, clamp(cv.x, 1600, MAP - 1600) - cv.x);
  const look = clamp(cv.len * 4 + cv.speed * 9, 600, 2400);
  let avoid = 0;
  for (const off of [-0.5, 0, 0.5]) {
    const a = cv.hd + off;
    if (World.landAt(cv.x + Math.cos(a) * look, cv.y + Math.sin(a) * look, cv.beam * 2))
      avoid -= Math.sign(off || 1) * (1 - Math.abs(off));
  }
  const target = avoid !== 0 ? cv.hd + clamp(avoid, -1, 1) * 1.2 : want;
  cv.rudderIn = clamp(angleDiff(cv.hd, target) * 2.4, -1, 1);
  cv.notch = 4;
}

// ------------------------------------------------------------------- boot
Account.load();
Render.init(el('cv'), el('minimap'));
UI.initPort();
el('btn-battle').onclick = startBattle;
el('btn-port').onclick = toPort;
el('t-slower').onclick = () => setTimeScale(timeIdx - 1);
el('t-faster').onclick = () => setTimeScale(timeIdx + 1);
el('btn-yard').onclick = () => Yard.open(null);
el('yard-back').onclick = () => Yard.close();
el('yard-build').onclick = () => Yard.build();
el('yard-scrap').onclick = () => Yard.scrap();
el('yard-cv').onmousedown = () => { Yard.spinning = !Yard.spinning; };
el('yard-name').oninput = () => Yard.nameChanged();
el('btn-reset').onclick = () => {
  if (confirm('Start again from scratch? Every ship, credit and XP is lost.')) {
    Account.reset();
    UI.initPort();
  }
};
requestAnimationFrame(loop);
