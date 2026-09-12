// ---- player account: owned ships, credits, XP. Stored in localStorage. -----
const SAVE_KEY = 'worldships.save.v1';

const Account = {
  data: null,

  load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { d = null; }
    if (!d || !d.owned || !d.owned.length) d = this.fresh();
    d.shipXp = d.shipXp || {};
    if (!d.difficulty) d.difficulty = 'cabinboy';
    d.custom = d.custom || [];
    this.data = d;
    return d;
  },

  fresh() {
    return {
      credits: 120000,
      freeXp: 0,
      battles: 0, wins: 0, kills: 0, damage: 0,
      owned: STARTERS.map(s => shipId(s[0], s[1])).concat([shipId('usa', 'Sampson')]),
      researched: STARTERS.map(s => shipId(s[0], s[1])).concat([shipId('usa', 'Sampson')]),
      shipXp: {},
      selected: shipId('usa', 'Sampson'),
      difficulty: 'cabinboy',
      custom: [],
    };
  },

  save() { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); },

  owns(id)       { return this.data.owned.includes(id); },
  researched(id) { return this.data.researched.includes(id); },

  // a hull can be researched once its predecessor is owned
  canResearch(id) {
    if (this.researched(id)) return false;
    const t = treeEntry(id);
    if (!t) return false;
    return t.prereq ? this.owns(t.prereq) : true;
  },

  research(id) {
    const sh = SHIPS[id];
    if (!this.canResearch(id) || this.data.freeXp < sh.xpCost) return false;
    this.data.freeXp -= sh.xpCost;
    this.data.researched.push(id);
    this.save();
    return true;
  },

  buy(id) {
    const sh = SHIPS[id];
    if (!this.researched(id) || this.owns(id) || this.data.credits < sh.price) return false;
    this.data.credits -= sh.price;
    this.data.owned.push(id);
    this.data.selected = id;
    this.save();
    return true;
  },

  // battle payout
  reward(res) {
    const d = this.data;
    const tierMul = 0.6 + SHIPS[res.shipId].tier * 0.16;
    let xp = 140 + res.damage / 90 + res.kills * 380 + res.caps * 130 + res.spotDamage / 240;
    let cr = 5000 + res.damage * 1.9 + res.kills * 4200 + res.caps * 1600;
    if (res.win) { xp *= 1.55; cr *= 1.5; }
    xp = Math.round(xp * tierMul);
    cr = Math.round(cr * tierMul);

    d.freeXp  += xp;
    d.credits += cr;
    d.battles += 1;
    d.kills   += res.kills;
    d.damage  += Math.round(res.damage);
    if (res.win) d.wins += 1;
    d.shipXp[res.shipId] = (d.shipXp[res.shipId] || 0) + xp;
    this.save();
    return { xp, cr };
  },

  reset() { this.data = this.fresh(); this.save(); },
};
