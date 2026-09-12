// ---- the builder screen ----------------------------------------------------

const Yard = {
  recipe: null,
  editing: null,
  angle: 0.7,
  spinning: true,

  open(existingId) {
    if (existingId && SHIPS[existingId] && SHIPS[existingId].recipe) {
      this.recipe = JSON.parse(JSON.stringify(SHIPS[existingId].recipe));
      this.editing = existingId;
    } else {
      this.recipe = defaultRecipe('DD', 3, 'usa');
      this.editing = null;
    }
    el('port').classList.add('hidden');
    el('shipyard').classList.remove('hidden');
    this.render();
    if (!this._raf) this.spin();
  },

  close() {
    el('shipyard').classList.add('hidden');
    el('port').classList.remove('hidden');
    UI.initPort();
  },

  spin() {
    this._raf = requestAnimationFrame(() => this.spin());
    if (el('shipyard').classList.contains('hidden')) return;
    if (this.spinning) this.angle += 0.006;
    this.drawShip();
  },

  // the design as it stands, compiled so the readouts show real numbers
  preview() {
    const tmp = JSON.parse(JSON.stringify(this.recipe));
    tmp.id = '__preview__';
    delete MESH_CACHE.__preview__;
    delete TURRET_CACHE.__preview__;
    return compileCustom(tmp);
  },

  drawShip() {
    const cv = el('yard-cv');
    if (!cv) return;
    const w = Math.max(320, cv.clientWidth), h = Math.max(200, cv.clientHeight);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    try { drawPreview(cv, this.preview(), this.angle); } catch (e) { /* mid-edit */ }
  },

  setStat(k, v) {
    const r = this.recipe;
    const next = clamp(v, STAT_MIN, STAT_MAX);
    const delta = next - r.stats[k];
    if (delta > 0 && pointsSpent(r) + delta > pointsCap(r.cls, r.nation)) return;
    r.stats[k] = next;
    this.render();
  },

  setClass(cls) { this.reshape(cls, this.recipe.nation); },
  setNation(nation) { this.reshape(this.recipe.cls, nation); },

  // A change of hull or navy changes which stats exist, and can leave the
  // design over budget. Keep what carries over and trim the biggest first.
  reshape(cls, nation) {
    const old = this.recipe.stats;
    this.recipe.cls = cls;
    this.recipe.nation = nation;
    this.recipe.stats = {};
    for (const d of statsFor(cls, nation)) {
      this.recipe.stats[d.k] = old[d.k] === undefined ? 5 : old[d.k];
    }
    let guard = 0;
    while (pointsSpent(this.recipe) > pointsCap(cls, nation) && guard++ < 400) {
      const list = statsFor(cls, nation).slice()
        .sort((a, b) => this.recipe.stats[b.k] - this.recipe.stats[a.k]);
      if (this.recipe.stats[list[0].k] <= STAT_MIN) break;
      this.recipe.stats[list[0].k]--;
    }
    this.render();
  },

  render() {
    const r = this.recipe;
    const def = this.preview();
    const cap = pointsCap(r.cls, r.nation), spent = pointsSpent(r), left = cap - spent;

    // Only push the name into the field when it is not being typed in:
    // re-rendering on every button press would otherwise wipe what he typed.
    const nameBox = el('yard-name');
    if (document.activeElement !== nameBox && nameBox.value !== r.name) nameBox.value = r.name;
    el('yard-points').innerHTML = '<b>' + left + '</b> point' + (left === 1 ? '' : 's') + ' left';
    el('yard-points').className = left === 0 ? 'spent' : '';

    el('yard-class').innerHTML = Object.keys(CLASSES).map(k =>
      '<div class="tab ' + (k === r.cls ? 'on' : '') + '" data-cls="' + k + '">' +
      CLASSES[k].name + '</div>').join('');
    el('yard-class').querySelectorAll('[data-cls]').forEach(n => {
      n.onclick = () => this.setClass(n.dataset.cls);
    });

    el('yard-nation').innerHTML = Object.keys(NATIONS).map(k =>
      '<div class="tab nat ' + (k === r.nation ? 'on' : '') + '" data-nat="' + k + '">' +
      NATIONS[k].flag + '<span>' + NATIONS[k].name + '</span></div>').join('');
    el('yard-nation').querySelectorAll('[data-nat]').forEach(n => {
      n.onclick = () => this.setNation(n.dataset.nat);
    });

    let tiers = '';
    for (let t = 1; t <= 10; t++) {
      tiers += '<div class="tab ' + (t === r.tier ? 'on' : '') + '" data-tier="' + t + '">' +
               roman(t) + '</div>';
    }
    el('yard-tier').innerHTML = tiers;
    el('yard-tier').querySelectorAll('[data-tier]').forEach(n => {
      n.onclick = () => { r.tier = +n.dataset.tier; this.render(); };
    });

    el('yard-paint').innerHTML = PAINTS.map(p =>
      '<div class="swatch ' + (p.k === r.paint ? 'on' : '') + '" data-paint="' + p.k +
      '" style="background:' + p.hull + '" title="' + p.name + '"></div>').join('');
    el('yard-paint').querySelectorAll('[data-paint]').forEach(n => {
      n.onclick = () => { r.paint = n.dataset.paint; this.render(); };
    });

    const full = spent >= cap;
    el('yard-stats').innerHTML = statsFor(r.cls, r.nation).map(d => {
      const v = r.stats[d.k];
      let pips = '';
      for (let i = 1; i <= STAT_MAX; i++) {
        pips += '<i class="' + (i <= v ? 'on' : (full ? 'locked' : '')) + '"></i>';
      }
      return '<div class="yrow" title="' + d.hint + '">' +
        '<span class="yname">' + d.name + '</span>' +
        '<button class="ybtn" data-dec="' + d.k + '">−</button>' +
        '<span class="pips">' + pips + '</span>' +
        '<button class="ybtn" data-inc="' + d.k + '">+</button>' +
        '<span class="yval">' + this.readout(d.k, def) + '</span></div>';
    }).join('');
    el('yard-stats').querySelectorAll('[data-inc]').forEach(n => {
      n.onclick = () => this.setStat(n.dataset.inc, r.stats[n.dataset.inc] + 1);
    });
    el('yard-stats').querySelectorAll('[data-dec]').forEach(n => {
      n.onclick = () => this.setStat(n.dataset.dec, r.stats[n.dataset.dec] - 1);
    });

    const price = TIER_CREDIT[r.tier];
    const refund = this.editing ? TIER_CREDIT[SHIPS[this.editing].recipe.tier] : 0;
    const net = price - refund;
    const owned = Account.data.credits;
    const build = el('yard-build');
    build.textContent = this.editing
      ? (net > 0 ? 'SAVE CHANGES (' + fmt(net) + ')' : 'SAVE CHANGES')
      : 'BUILD HER (' + fmt(price) + ')';
    build.disabled = net > owned;
    el('yard-cost').textContent = build.disabled
      ? 'You need ' + fmt(net - owned) + ' more credits'
      : 'You have ' + fmt(owned) + ' credits';
    el('yard-scrap').classList.toggle('hidden', !this.editing);
    this.drawShip();
  },

  // show the real number each stat buys, not just a pip count
  readout(k, def) {
    switch (k) {
      case 'guns':     return Math.round(def.guns.cal) + 'mm';
      case 'reload':   return def.guns.reload.toFixed(1) + 's';
      case 'range':    return (def.guns.range / 1000).toFixed(1) + 'km';
      case 'armour':   return Math.round(def.armor) + 'mm';
      case 'hull':     return fmt(def.hp) + ' hp';
      case 'engine':   return def.speed.toFixed(1) + 'kn';
      case 'handling': return Math.round(def.turnR) + 'm';
      case 'stealth':  return def.conceal.toFixed(1) + 'km';
      case 'torps':    return def.torps ? fmt(def.torps.dmg) : '—';
      case 'aa':       return def.aa ? Math.round(def.aa.dps) + 'dps' : '—';
      case 'air':      return def.air ? fmt(def.air.tb.dmg) : '—';
    }
    return '';
  },

  // keep the recipe in step with the text box as he types
  nameChanged() { this.recipe.name = (el('yard-name').value || '').slice(0, 24); },

  build() {
    const r = this.recipe;
    r.name = (r.name || el('yard-name').value || '').trim().slice(0, 24) || 'Nameless';
    const price = TIER_CREDIT[r.tier];
    const a = Account.data;
    a.custom = a.custom || [];

    if (this.editing) {
      const net = price - TIER_CREDIT[SHIPS[this.editing].recipe.tier];
      if (net > a.credits) return;
      a.credits -= net;
      r.id = this.editing;
      const i = a.custom.findIndex(c => c.id === this.editing);
      if (i >= 0) a.custom[i] = r; else a.custom.push(r);
    } else {
      if (price > a.credits) return;
      a.credits -= price;
      r.id = 'custom_' + Date.now().toString(36) + Math.floor(Math.random() * 1000);
      a.custom.push(r);
      a.owned.push(r.id);
      a.researched.push(r.id);
    }
    registerCustoms();
    a.selected = r.id;
    Account.save();
    this.close();
  },

  scrap() {
    if (!this.editing) return;
    const a = Account.data;
    const def = SHIPS[this.editing];
    if (!confirm('Break up ' + def.name + ' for scrap? You get all the credits back.')) return;
    a.credits += TIER_CREDIT[def.recipe.tier];
    a.custom = (a.custom || []).filter(c => c.id !== this.editing);
    a.owned = a.owned.filter(id => id !== this.editing);
    a.researched = a.researched.filter(id => id !== this.editing);
    delete SHIPS[this.editing];
    if (a.selected === this.editing) a.selected = a.owned[a.owned.length - 1];
    Account.save();
    this.close();
  },
};
