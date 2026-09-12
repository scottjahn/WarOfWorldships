// ---- difficulty ------------------------------------------------------------
// The hard part of a naval game is not the shooting, it is the *leading*: a
// shell is in the air for seven seconds and the target has moved by the time it
// lands. On the gentler settings the gunners work that out for you, the salvo
// groups far more tightly, and the enemy is slower to gang up on you.

const DIFFICULTY = {
  cabinboy: {
    key: 'cabinboy', name: 'Cabin Boy', age: 'easiest',
    blurb: 'Your gunners aim for you — just keep the crosshair on an enemy and hold fire. ' +
           'Salvoes land tightly, the enemy shoots badly, and your crew fights fires by themselves.',
    autoLead: true,          // the guns solve the lead themselves
    spread: 0.35,            // salvo dispersion multiplier
    incoming: 0.40,          // damage the player takes
    botSkill: [0.10, 0.40],  // enemy gunnery
    playerFocus: 0.30,       // how much bots prefer shooting at the player
    autoDamageControl: true, // fires and flooding handled by the crew
    burnMul: 0.45,           // fires and flooding tick more slowly
    reload: 0.70,
    matchTime: 8 * 60,
    winScore: 600,
  },
  sailor: {
    key: 'sailor', name: 'Sailor', age: 'in between',
    blurb: 'The guns still work out the lead for you, but the enemy shoots straighter ' +
           'and you have to put your own fires out.',
    autoLead: true,
    spread: 0.65,
    incoming: 0.55,
    botSkill: [0.28, 0.58],
    playerFocus: 0.50,
    autoDamageControl: false,
    burnMul: 0.75,
    reload: 0.85,
    matchTime: 11 * 60,
    winScore: 800,
  },
  admiral: {
    key: 'admiral', name: 'Admiral', age: 'the real thing',
    blurb: 'Lead your own targets, full dispersion, and the enemy fights properly. ' +
           'This is the game as World of Warships plays it.',
    autoLead: false,
    spread: 1,
    incoming: 1,
    botSkill: [0.50, 0.85],
    playerFocus: 1,
    autoDamageControl: false,
    burnMul: 1,
    reload: 1,
    matchTime: 15 * 60,
    winScore: 1000,
  },
};

const DIFF_ORDER = ['cabinboy', 'sailor', 'admiral'];

// the setting in force right now
function D() {
  return DIFFICULTY[(Account.data && Account.data.difficulty) || 'cabinboy'] || DIFFICULTY.cabinboy;
}
