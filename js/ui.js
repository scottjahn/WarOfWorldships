// ---- port screens and battle HUD -------------------------------------------

const UI = {
  nation: 'usa',
  cls: 'DD',

  // =========================================================== PORT
  initPort() {
    const a = Account.data;
    registerCustoms();
    // a design that was scrapped should not linger in the fleet list
    a.owned = a.owned.filter(id => SHIPS[id]);
    if (!SHIPS[a.selected]) a.selected = a.owned[a.owned.length - 1];
    el('w-credits').textContent = fmt(a.credits);
    el('w-xp').textContent = fmt(a.freeXp);
    el('w-battles').textContent = a.battles;
    el('w-wins').textContent = a.wins + (a.battles ? ' (' + Math.round(a.wins / a.battles * 100) + '%)' : '');

    this.renderFleet();
    this.renderTabs();
    this.renderTree();
    this.renderCard();
    this.renderDifficulty();
  },

  renderDifficulty() {
    const sel = el('difficulty');
    if (!sel.childElementCount) {
      for (const k of DIFF_ORDER) {
        const d = DIFFICULTY[k];
        sel.appendChild(mk('option', null, d.name + ' — ' + d.age)).value = k;
      }
      sel.onchange = () => {
        Account.data.difficulty = sel.value;
        Account.save();
        this.renderDifficulty();
      };
    }
    sel.value = Account.data.difficulty;
    el('diff-blurb').textContent = D().blurb;
  },

  renderFleet() {
    const box = el('fleet-list');
    box.innerHTML = '';
    const owned = Account.data.owned.map(id => SHIPS[id]).filter(Boolean)
      .sort((x, y) => y.tier - x.tier || x.name.localeCompare(y.name));
    for (const s of owned) {
      const row = mk('div', 'ship-row' + (s.id === Account.data.selected ? ' sel' : ''));
      row.innerHTML = `<span class="tier">${roman(s.tier)}</span><span class="flag">${s.flag}</span>
        <span class="nm">${s.name}${s.custom ? ' <em class="ownmark">yours</em>' : ''}</span>
        <span class="cl">${s.cls}</span>`;
      row.onclick = () => { Account.data.selected = s.id; Account.save(); this.initPort(); };
      box.appendChild(row);
    }
  },

  renderTabs() {
    const nt = el('nation-tabs'); nt.innerHTML = '';
    for (const k in NATIONS) {
      const t = mk('div', 'tab nat' + (k === this.nation ? ' on' : ''),
        NATIONS[k].flag + '<span>' + NATIONS[k].name + '</span>');
      t.onclick = () => { this.nation = k; this.renderTabs(); this.renderTree(); };
      nt.appendChild(t);
    }
    const ct = el('class-tabs'); ct.innerHTML = '';
    for (const k in CLASSES) {
      const t = mk('div', 'tab' + (k === this.cls ? ' on' : ''), CLASSES[k].name);
      t.onclick = () => { this.cls = k; this.renderTabs(); this.renderTree(); };
      ct.appendChild(t);
    }
  },

  renderTree() {
    const box = el('tree-list'); box.innerHTML = '';
    // Only this nation's ships of this class, plus whichever ship actually
    // unlocks the line — for destroyers and cruisers that is the tier I
    // starter, but a submarine line branches off the tier V destroyer.
    const line = TREE.filter(t => t.nation === this.nation && t.cls === this.cls && !t.starter)
      .sort((a, b) => a.tier - b.tier);
    const rows = [];
    const rootId = line.length ? line[0].prereq : null;
    if (rootId && !line.some(t => t.id === rootId)) {
      rows.push(Object.assign({}, treeEntry(rootId), { isRoot: true }));
    }
    rows.push(...line);
    if (!rows.length) {
      const why = this.cls === 'CV' && NO_CARRIERS[this.nation];
      box.appendChild(mk('div', 'empty-line', why ||
        'No ships of this type in this navy.'));
      return;
    }

    for (const t of rows) {
      const s = SHIPS[t.id];
      const owned = Account.owns(t.id);
      const res = Account.researched(t.id);
      const can = Account.canResearch(t.id);
      const state = owned ? 'owned' : res || can ? 'avail' : 'locked';
      const row = mk('div', 'tree-row ' + state);
      row.innerHTML = `<span class="tier">${roman(s.tier)}</span>
        <span class="nm">${s.name}</span>
        <span class="cl">${s.cls}</span>`;
      if (t.isRoot) row.classList.add('root');

      if (t.isRoot && owned) {
        row.appendChild(mk('span', 'cost', 'unlocks this line'));
      } else if (owned) {
        row.appendChild(mk('span', 'cost', 'in port'));
      } else if (res) {
        const b = mk('button', 'buy', 'Buy ' + fmt(s.price));
        b.disabled = Account.data.credits < s.price;
        b.onclick = () => { if (Account.buy(t.id)) this.initPort(); };
        row.appendChild(b);
      } else if (can) {
        const b = mk('button', '', 'Research ' + fmt(s.xpCost) + ' XP');
        b.disabled = Account.data.freeXp < s.xpCost;
        b.onclick = () => { if (Account.research(t.id)) this.initPort(); };
        row.appendChild(b);
      } else {
        const need = t.prereq ? SHIPS[t.prereq].name : '';
        row.appendChild(mk('span', 'cost', 'needs ' + need));
      }
      box.appendChild(row);
    }
  },

  renderCard() {
    const s = SHIPS[Account.data.selected];
    const g = s.guns;
    // quote the shell the ship actually loads by default
    const shell = s.cls === 'BB' ? g.dmgAP : g.dmgHE;
    const dpm = Math.round(g.n * shell * (60 / g.reload));
    const bar = (v, max) => `<span class="bar"><i style="width:${clamp(v / max * 100, 2, 100)}%"></i></span>`;
    const row = (k, v, val, max) => `<div class="stat"><span class="k">${k}</span>
        <span class="v">${v}</span>${bar(val, max)}</div>`;

    let torpRow = '';
    if (s.torps) {
      torpRow = row('Torpedo damage', fmt(s.torps.dmg), s.torps.dmg, 24000) +
                row('Torpedo range', (s.torps.range / 1000).toFixed(1) + ' km', s.torps.range, 12000) +
                row('Torpedo tubes', s.torps.tubes + ' per side', s.torps.tubes, 5);
    }
    const subRow = s.cls === 'SS'
      ? row('Oxygen', Math.round(s.oxygen) + ' s', s.oxygen, 240) : '';
    let airRows = '';
    if (s.cls === 'CV') {
      for (const k of ['rk', 'db', 'tb']) {
        const a = s.air[k];
        airRows += row(a.name, a.planes + ' × ' + fmt(a.dmg), a.dmg, 12000);
      }
    }
    const aaRow = s.aa ? row('Anti-aircraft', Math.round(s.aa.dps) + ' dps',
                             s.aa.dps, 420) : '';

    el('ship-card').innerHTML = `
      <h1><span class="bigflag">${s.flag}</span>${s.name}</h1>
      <div class="sub">Tier ${roman(s.tier)} · ${NATIONS[s.nation].name} · ${CLASSES[s.cls].long}</div>
      <div class="silo"><canvas id="silo-cv" width="640" height="170"></canvas></div>
      <div class="stats">
        ${row('Hit points', fmt(s.hp), s.hp, 105000)}
        ${row('Top speed', s.speed.toFixed(1) + ' kn', s.speed, 44)}
        ${row('Main battery', s.guns.n + ' × ' + Math.round(g.cal) + 'mm', g.cal, 460)}
        ${row('Reload', g.reload.toFixed(1) + ' s', 40 - g.reload, 40)}
        ${row('Damage / minute', fmt(dpm), dpm, 220000)}
        ${row('Gun range', (g.range / 1000).toFixed(1) + ' km', g.range, 16000)}
        ${row('Detectability', s.conceal.toFixed(1) + ' km', 18 - s.conceal, 18)}
        ${row('Turning circle', Math.round(s.turnR) + ' m', 1200 - s.turnR, 1000)}
        ${torpRow}${subRow}${airRows}${aaRow}
      </div>
      <div class="blurb">${s.blurb}</div>
      ${s.custom ? '<button id="card-edit">Take her back to the shipyard</button>' : ''}`;
    drawSilhouette(el('silo-cv'), s);
    if (s.custom) el('card-edit').onclick = () => Yard.open(s.id);
  },

  // =========================================================== HUD
  hud(B) {
    const p = B.player;
    el('score-green').textContent = Math.floor(B.score[1]);
    el('score-red').textContent = Math.floor(B.score[2]);
    el('timer').textContent = fmtTime(B.time);

    // rosters
    for (const team of [1, 2]) {
      const box = el(team === 1 ? 'roster-green' : 'roster-red');
      const list = B.ships.filter(s => s.team === team);
      if (box.childElementCount !== list.length) {
        box.innerHTML = '';
        list.forEach(s => {
          const d = mk('div', 'rline' + (s.isPlayer ? ' me' : ''));
          d.innerHTML = `<span class="rn">${s.cls} ${s.name}</span><span class="rhp"><i></i></span>`;
          box.appendChild(d);
          s._row = d;
        });
      }
      list.forEach(s => {
        if (!s._row) return;
        s._row.classList.toggle('dead', !s.alive);
        const i = s._row.querySelector('i');
        i.style.width = (s.alive ? s.hp / s.maxHp * 100 : 0) + '%';
        i.style.background = team === 1 ? '#4ad07a' : '#ff5a5a';
      });
    }

    // hp + status
    el('hp-fill').style.width = (p.hp / p.maxHp * 100) + '%';
    el('hp-text').textContent = fmt(Math.max(0, p.hp)) + ' / ' + fmt(p.maxHp);
    const si = [];
    if (p.fires.length) si.push('<span class="si fire">🔥 ' + p.fires.length + '</span>');
    if (p.flood) si.push('<span class="si flood">🌊 flooding</span>');
    if (p.potential > 100) si.push('<span class="si">repairable ' + fmt(p.potential) + '</span>');
    if (p.cls === 'SS') si.push('<span class="si">O₂ ' + Math.round(p.oxygen) + 's</span>');
    if (p.spotted) si.push('<span class="si" style="color:#ffd35c">👁 detected</span>');
    if (!p.alive) si.push('<span class="si" style="color:#ffd35c">sunk — watching the battle · press ENTER to skip to the end</span>');
    this.setHTML('status-icons', si.join(''));

    // weapons — a carrier's are its three squadrons
    const g = p.def.guns;
    const wp = [];
    if (p.cls === 'CV') {
      const sq = B.playerSquad;
      for (const k of ['rk', 'db', 'tb']) {
        const a = p.def.air[k];
        const cool = (p.airT && p.airT[k]) || 0;
        const flying = sq && sq.alive && sq.type === k;
        const label = flying ? a.name + ' — ' + sq.count + ' planes'
                             : a.name + ' ×' + a.planes;
        const amt = flying ? (sq.state === 'back' ? 'RETURNING' : sq.attacksLeft + ' attacks')
                  : cool > 0 ? Math.ceil(cool) + 's' : 'READY';
        wp.push(weaponBox({ rk: 1, db: 2, tb: 3 }[k], flying, label, amt,
                          flying ? 1 : 1 - clamp(cool / a.reload, 0, 1)));
      }
      this.setHTML('weapons', wp.join(''));
      this.carrierExtras(p, B, si);
    } else {
    wp.push(weaponBox(1, p.weapon === 1, (p.ammo) + ' · ' + Math.round(g.cal) + 'mm',
      p.gunT <= 0 ? 'READY' : p.gunT.toFixed(1) + 's', 1 - clamp(p.gunT / g.reload, 0, 1)));
    if (p.def.torps)
      wp.push(weaponBox(2, p.weapon === 2, 'Torpedoes',
        p.torpT <= 0 ? 'READY' : p.torpT.toFixed(0) + 's',
        1 - clamp(p.torpT / p.def.torps.reload, 0, 1)));
    if (p.cls === 'DD' || p.cls === 'CA')
      wp.push(weaponBox(3, p.weapon === 3, 'Depth charges',
        p.dcT <= 0 ? 'READY' : p.dcT.toFixed(0) + 's', 1 - clamp(p.dcT / 22, 0, 1)));
    this.setHTML('weapons', wp.join(''));
    }

    // consumables
    this.setHTML('consumables', p.cons.map(c => {
      const cls = c.active > 0 ? 'cons active' : c.cool > 0 ? 'cons cooling' : 'cons';
      const t = c.active > 0 ? Math.ceil(c.active) + 's'
              : c.cool > 0 ? Math.ceil(c.cool) + 's' : 'ready';
      return `<div class="${cls}"><div class="key">${c.key}</div>${c.name}
              <div class="n">${t} · ×${c.left}</div></div>`;
    }).join(''));

    el('tl-speed').textContent = (p.speed / KN).toFixed(0) + ' kn';
    el('tl-notch').textContent = NOTCH_NAME[p.notch];
    el('tl-rudder').textContent = 'RUDDER ' +
      (p.rudder < -0.05 ? '◀ port' : p.rudder > 0.05 ? 'stbd ▶' : 'amidships');
    el('tl-depth').textContent = p.cls === 'SS'
      ? ['SURFACED', 'PERISCOPE', 'DEEP'][p.depth] : '';
    el('tl-depth').classList.toggle('hidden', p.cls !== 'SS');

    const ts = timeScale();
    const lab = el('t-label');
    lab.textContent = 'TIME ×' + ts;
    lab.classList.toggle('fast', ts > 1);
    lab.classList.toggle('slow', ts < 1);
  },

  // extra status the carrier captain needs
  carrierExtras(p, B, si) {
    const sq = B.playerSquad;
    const extra = si.slice();
    if (sq && sq.alive) {
      extra.push('<span class="si" style="color:#9fd8ff">✈ ' + sq.count + ' aircraft · ' +
                 Math.round(sq.z) + ' m</span>');
      extra.push('<span class="si">' +
        (sq.state === 'run' ? 'ATTACKING' : sq.state === 'back' ? 'returning' : 'outbound') +
        ' · F to come home</span>');
    } else {
      extra.push('<span class="si" style="color:#9fd8ff">1 · 2 · 3 to launch a squadron</span>');
    }
    this.setHTML('status-icons', extra.join(''));
  },

  // innerHTML is expensive; only touch the DOM when the markup actually changed
  setHTML(id, html) {
    this._cache = this._cache || {};
    if (this._cache[id] === html) return;
    this._cache[id] = html;
    el(id).innerHTML = html;
  },

  ribbon(text) {
    const box = el('ribbons');
    const r = mk('div', 'rib', text);
    box.appendChild(r);
    while (box.childElementCount > 8) box.removeChild(box.firstChild);
    setTimeout(() => r.remove(), 3400);
  },

  bigMsg(text, color) {
    const b = el('bigmsg');
    b.textContent = text;
    b.style.color = color || '#fff';
    b.style.opacity = 1;
    clearTimeout(this._bt);
    this._bt = setTimeout(() => b.style.opacity = 0, 2200);
  },

  // =========================================================== RESULTS
  showResults(win, why) {
    if (typeof releaseLock === 'function') releaseLock();
    const p = Battle.player;
    const res = {
      shipId: p.def.id, damage: p.dmgDone, kills: p.kills,
      caps: p.caps, spotDamage: p.spotDmg, win,
    };
    const pay = Account.reward(res);
    el('res-title').textContent = win ? 'VICTORY' : 'DEFEAT';
    el('res-title').className = win ? 'win' : 'lose';
    el('res-lines').innerHTML = [
      ['', why],
      ['Damage dealt', fmt(p.dmgDone)],
      ['Ships destroyed', p.kills],
      ['Bases captured', p.caps],
      ['Spotting damage', fmt(p.spotDmg)],
      ['XP earned', '<b>' + fmt(pay.xp) + '</b>'],
      ['Credits earned', '<b>' + fmt(pay.cr) + '</b>'],
    ].map(r => `<div><span class="k">${r[0]}</span><span>${r[1]}</span></div>`).join('');
    el('results').classList.remove('hidden');
  },
};

function weaponBox(n, on, name, amt, frac) {
  return `<div class="wpn ${on ? 'on' : ''} ${frac >= 1 ? 'ready' : ''}">
    <i style="width:${frac * 100}%"></i>
    <span class="nm">${n}. ${name}</span><span class="amt">${amt}</span></div>`;
}

function roman(n) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || n;
}

// port silhouette
function drawSilhouette(cv, s) {
  const c = cv.getContext('2d');
  c.clearRect(0, 0, cv.width, cv.height);
  const scale = Math.min(560 / s.len, 1.9);
  const L = s.len * scale, W = Math.max(10, s.beam * scale * 1.6);
  const cx = cv.width / 2, cy = cv.height / 2;
  c.save(); c.translate(cx, cy);

  const hl = L / 2, hb = W / 2;
  c.beginPath();
  c.moveTo(hl, 0);
  c.lineTo(hl * 0.45, -hb); c.lineTo(-hl * 0.92, -hb);
  c.lineTo(-hl, -hb * 0.6); c.lineTo(-hl, hb * 0.6);
  c.lineTo(-hl * 0.92, hb); c.lineTo(hl * 0.45, hb);
  c.closePath();
  c.fillStyle = s.paint || '#55636e'; c.fill();
  c.strokeStyle = '#9fb6c4'; c.lineWidth = 1.5; c.stroke();

  c.fillStyle = s.paintDeck || 'rgba(255,255,255,.12)';
  c.fillRect(-hl * 0.55, -hb * 0.55, hl * 0.85, hb * 1.1);
  c.fillStyle = 'rgba(235,245,250,.35)';
  c.fillRect(-hl * 0.1, -hb * 0.45, hl * 0.3, hb * 0.9);

  const dummy = { def: s, cls: s.cls, len: s.len, beam: s.beam, hd: 0 };
  Ship.prototype.buildTurrets.call(dummy);
  if (s.cls !== 'SS') {
    for (const t of dummy.turrets) {
      c.save();
      c.translate(L * t.ox, 0);
      c.fillStyle = '#93a7b4';
      const tw = W * 0.4, tl = L * 0.02 + 3;
      c.fillRect(-tl, -tw / 2, tl * 2, tw);
      c.strokeStyle = '#cddae2'; c.lineWidth = 2;
      const nb = Math.min(t.barrels, 4);
      for (let b = 0; b < nb; b++) {
        const off = (b - (nb - 1) / 2) * tw * 0.3;
        c.beginPath();
        c.moveTo(tl * 0.5, off);
        c.lineTo(tl + L * 0.05 * (t.isFore ? 1 : -1) * (t.isFore ? 1 : 1), off);
        c.stroke();
      }
      c.restore();
    }
  } else {
    c.fillStyle = '#93a7b4';
    c.fillRect(-L * 0.03, -hb, L * 0.12, hb * 2);
  }
  c.restore();

  c.fillStyle = 'rgba(180,210,230,.5)';
  c.font = '11px Segoe UI'; c.textAlign = 'center';
  c.fillText(Math.round(s.len) + ' m', cx, cy + W / 2 + 22);
}
