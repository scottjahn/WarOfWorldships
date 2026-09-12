// ---- ship roster -----------------------------------------------------------
// Every hull below is a real warship. Statistics are scaled for arcade play:
// ranges and speeds are compressed so a battle fits on one screen-sized ocean.

// Windows has no country-flag glyphs, so emoji flags degrade to bare letters
// ("US", "JP"). Draw them instead — tiny inline SVG renders everywhere.
const FLAGS = {
  usa: '<svg viewBox="0 0 18 12" class="fl"><rect width="18" height="12" fill="#b22234"/>' +
       '<g fill="#fff"><rect y="1.85" width="18" height="1.84"/><rect y="5.54" width="18" height="1.84"/>' +
       '<rect y="9.23" width="18" height="1.84"/></g><rect width="8" height="6.46" fill="#3c3b6e"/></svg>',
  ijn: '<svg viewBox="0 0 18 12" class="fl"><rect width="18" height="12" fill="#fff"/>' +
       '<circle cx="9" cy="6" r="3.6" fill="#bc002d"/></svg>',
  ger: '<svg viewBox="0 0 18 12" class="fl"><rect width="18" height="4" fill="#000"/>' +
       '<rect y="4" width="18" height="4" fill="#dd0000"/><rect y="8" width="18" height="4" fill="#ffce00"/></svg>',
  uk:  '<svg viewBox="0 0 18 12" class="fl"><rect width="18" height="12" fill="#012169"/>' +
       '<path d="M0,0 18,12 M18,0 0,12" stroke="#fff" stroke-width="2.6"/>' +
       '<path d="M0,0 18,12 M18,0 0,12" stroke="#c8102e" stroke-width="1.3"/>' +
       '<path d="M9,0 V12 M0,6 H18" stroke="#fff" stroke-width="4"/>' +
       '<path d="M9,0 V12 M0,6 H18" stroke="#c8102e" stroke-width="2.3"/></svg>',
  ussr: '<svg viewBox="0 0 18 12" class="fl"><rect width="18" height="12" fill="#cc0000"/>' +
       '<polygon fill="#ffd700" points="4.6,1.6 5.22,3.35 7.07,3.4 5.6,4.52 6.13,6.3 4.6,5.25 ' +
       '3.07,6.3 3.6,4.52 2.13,3.4 3.98,3.35"/></svg>',
};

const NATIONS = {
  usa:  { name: 'United States', flag: FLAGS.usa,  color: '#5fa8e0' },
  ijn:  { name: 'Japan',         flag: FLAGS.ijn,  color: '#e07a7a' },
  ger:  { name: 'Germany',       flag: FLAGS.ger,  color: '#c9c9c9' },
  uk:   { name: 'Royal Navy',    flag: FLAGS.uk,   color: '#7fd3c0' },
  ussr: { name: 'Soviet Union',  flag: FLAGS.ussr, color: '#e0a45f' },
};

const CLASSES = {
  DD: { name: 'Destroyer',   long: 'Destroyer' },
  CA: { name: 'Cruiser',     long: 'Cruiser' },
  BB: { name: 'Battleship',  long: 'Battleship' },
  SS: { name: 'Submarine',   long: 'Submarine' },
  CV: { name: 'Carrier',     long: 'Aircraft Carrier' },
};

// tier 1 starter ships (free for every nation)
const STARTERS = [
  ['usa', 'Erie'], ['ijn', 'Hashidate'], ['ger', 'Hermelin'],
  ['uk', 'Black Swan'], ['ussr', 'Orlan'],
];

// [tier, name] per line, lowest tier first
const LINES = [
  { nation: 'usa', cls: 'DD', ships: [[2,'Sampson'],[3,'Wickes'],[4,'Clemson'],[5,'Nicholas'],[6,'Farragut'],[7,'Mahan'],[8,'Benson'],[9,'Fletcher'],[10,'Gearing']] },
  { nation: 'usa', cls: 'CA', ships: [[3,'St. Louis'],[4,'Phoenix'],[5,'Omaha'],[6,'Pensacola'],[7,'New Orleans'],[8,'Baltimore'],[9,'Oregon City'],[10,'Des Moines']] },
  { nation: 'usa', cls: 'BB', ships: [[3,'South Carolina'],[4,'Wyoming'],[5,'New York'],[6,'New Mexico'],[7,'Colorado'],[8,'North Carolina'],[9,'Iowa'],[10,'Montana']] },
  { nation: 'usa', cls: 'SS', ships: [[6,'Cachalot'],[8,'Salmon'],[10,'Balao']] },

  { nation: 'ijn', cls: 'DD', ships: [[2,'Umikaze'],[3,'Wakatake'],[4,'Isokaze'],[5,'Minekaze'],[6,'Fubuki'],[7,'Akatsuki'],[8,'Kagero'],[9,'Yugumo'],[10,'Shimakaze']] },
  { nation: 'ijn', cls: 'CA', ships: [[3,'Tenryu'],[4,'Kuma'],[5,'Furutaka'],[6,'Aoba'],[7,'Myoko'],[8,'Mogami'],[9,'Tone'],[10,'Zao']] },
  { nation: 'ijn', cls: 'BB', ships: [[3,'Kawachi'],[4,'Ise'],[5,'Kongo'],[6,'Fuso'],[7,'Nagato'],[8,'Amagi'],[9,'Izumo'],[10,'Yamato']] },
  { nation: 'ijn', cls: 'SS', ships: [[6,'I-168'],[8,'I-56'],[10,'I-400']] },

  { nation: 'ger', cls: 'DD', ships: [[2,'V-25'],[3,'G-101'],[4,'V-170'],[5,'T-22'],[6,'Ernst Gaede'],[7,'Leberecht Maass'],[8,'Z-23'],[9,'Z-39'],[10,'Z-52']] },
  { nation: 'ger', cls: 'CA', ships: [[3,'Kolberg'],[4,'Karlsruhe'],[5,'Königsberg'],[6,'Nürnberg'],[7,'Admiral Graf Spee'],[8,'Admiral Hipper'],[9,'Prinz Eugen'],[10,'Hindenburg']] },
  { nation: 'ger', cls: 'BB', ships: [[3,'Nassau'],[4,'Kaiser'],[5,'König'],[6,'Bayern'],[7,'Gneisenau'],[8,'Bismarck'],[9,'Tirpitz'],[10,'Scharnhorst']] },
  { nation: 'ger', cls: 'SS', ships: [[6,'U-69'],[8,'U-190'],[10,'U-2501']] },

  { nation: 'uk', cls: 'DD', ships: [[2,'Medea'],[3,'Valkyrie'],[4,'Acasta'],[5,'Acheron'],[6,'Icarus'],[7,'Jervis'],[8,'Cossack'],[9,'Jutland'],[10,'Daring']] },
  { nation: 'uk', cls: 'CA', ships: [[3,'Caledon'],[4,'Danae'],[5,'Emerald'],[6,'Leander'],[7,'Fiji'],[8,'Edinburgh'],[9,'Belfast'],[10,'Minotaur']] },
  { nation: 'uk', cls: 'BB', ships: [[3,'Bellerophon'],[4,'Orion'],[5,'Iron Duke'],[6,'Queen Elizabeth'],[7,'King George V'],[8,'Nelson'],[9,'Vanguard'],[10,'Hood']] },
  { nation: 'uk', cls: 'SS', ships: [[6,'Unbroken'],[8,'Tally-Ho'],[10,'Amphion']] },

  { nation: 'ussr', cls: 'DD', ships: [[2,'Storozhevoi'],[3,'Derzki'],[4,'Izyaslav'],[5,'Gnevny'],[6,'Ognevoi'],[7,'Kiev'],[8,'Tashkent'],[9,'Udaloi'],[10,'Grozovoi']] },
  { nation: 'ussr', cls: 'CA', ships: [[3,'Bogatyr'],[4,'Svietlana'],[5,'Kirov'],[6,'Budyonny'],[7,'Shchors'],[8,'Chapayev'],[9,'Dmitri Donskoi'],[10,'Moskva']] },
  { nation: 'ussr', cls: 'BB', ships: [[3,'Knyaz Suvorov'],[4,'Imperator Nikolai I'],[5,'Gangut'],[6,'Izmail'],[7,'Sinop'],[8,'Vladivostok'],[9,'Sovetsky Soyuz'],[10,'Kremlin']] },
  { nation: 'ussr', cls: 'SS', ships: [[6,'Shch-303'],[8,'K-21'],[10,'S-189'] ] },
];

// Carriers, tiers IV/VI/VIII/X. Germany and the USSR are deliberately absent:
// Graf Zeppelin was never completed and the Soviet Union operated no fleet
// carrier in this era, so their tech trees say so instead of inventing one.
const CV_LINES = [
  { nation: 'usa', cls: 'CV', ships: [[4,'Langley'],[6,'Bogue'],[8,'Lexington'],[10,'Midway']] },
  { nation: 'ijn', cls: 'CV', ships: [[4,'Hosho'],[6,'Ryujo'],[8,'Shokaku'],[10,'Taiho']] },
  { nation: 'uk',  cls: 'CV', ships: [[4,'Hermes'],[6,'Furious'],[8,'Implacable'],[10,'Audacious']] },
];
for (const l of CV_LINES) LINES.push(l);

const NO_CARRIERS = {
  ger:  'Germany laid down Graf Zeppelin but never finished her — the Kriegsmarine ' +
        'went to war without a single aircraft carrier.',
  ussr: 'The Soviet Navy operated no fleet aircraft carriers in this era.',
};

// research cost (XP) and purchase price (credits) by tier
const TIER_XP     = [0, 0, 1200, 2600, 5200, 9000, 15000, 23000, 34000, 50000, 72000];
const TIER_CREDIT = [0, 0, 6000, 22000, 60000, 150000, 330000, 700000, 1500000, 2900000, 5200000];

// short histories for the ships worth telling a story about
const BLURBS = {
  usa_iowa: 'Fastest battleship America ever built — 33 knots on 212,000 shaft horsepower. Served at Leyte Gulf, Korea, and was still firing 16-inch guns in 1991.',
  usa_montana: 'The battleship that was never laid down. Twelve 16-inch guns and no Panama Canal limit — cancelled in 1943 so the yards could build carriers.',
  usa_fletcher: 'The most successful destroyer design of the war: 175 built, five 5-inch guns and ten torpedo tubes on a hull that could take a frightening beating.',
  usa_des_moines: 'Her 8-inch guns loaded automatically — ten rounds a minute per barrel, a rate of fire no other heavy cruiser has ever matched.',
  usa_balao: 'Thick-skinned fleet boat that could dive to 400 feet. Balao-class submarines sank more Japanese tonnage than every other weapon combined.',
  ijn_yamato: 'The largest battleship ever built. Nine 18.1-inch guns, 64,000 tons, sunk by air attack in April 1945 while steaming to Okinawa on a one-way voyage.',
  ijn_shimakaze: 'One of a kind: fifteen torpedo tubes and 39 knots, the fastest Japanese destroyer ever completed.',
  ijn_kongo: 'Built in Britain in 1913, rebuilt twice, and fast enough to escort carriers. She fought from the Solomons to the Philippines.',
  ijn_zao: 'A postwar Japanese heavy-cruiser design study — long-range torpedoes and a very slim silhouette.',
  ijn_myoko: 'Ten 8-inch guns and sixteen Long Lance torpedo tubes; she fought in almost every major surface action of the Pacific war.',
  ijn_i_400: 'The biggest submarine of the war — a submersible aircraft carrier, 400 feet long, with a hangar for three floatplanes.',
  ger_bismarck: 'Sank HMS Hood in eight minutes, then was hunted down by the entire Home Fleet three days later after a torpedo jammed her rudder.',
  ger_tirpitz: 'The lone queen of the north — she spent the war hiding in Norwegian fjords, tying down the Royal Navy without firing at a warship.',
  ger_scharnhorst: 'Fast, well armoured and under-gunned. Sunk at the North Cape in December 1943 by HMS Duke of York in an Arctic night action.',
  ger_admiral_graf_spee: 'A "pocket battleship" raider — cornered at the River Plate by three smaller cruisers and scuttled by her own crew.',
  ger_hindenburg: 'The final German heavy cruiser design — twelve 8-inch guns, excellent hydrophones, and armour heavier than her rivals.',
  ger_u_2501: 'Type XXI — the first true submarine, built to run submerged rather than to dive. Every postwar sub descends from her.',
  uk_hood: 'The Mighty Hood: for twenty years the largest warship in the world, and lost in minutes to a magazine hit from Bismarck.',
  uk_vanguard: 'Britain’s last battleship, finished in 1946 using spare 15-inch turrets from the First World War.',
  uk_belfast: 'Helped sink Scharnhorst and shelled the Normandy beaches. She is still afloat today as a museum on the Thames.',
  uk_cossack: 'Famous for the Altmark boarding — "The Navy’s here!" — and for the hunt for Bismarck.',
  uk_minotaur: 'Rapid-firing automatic 6-inch guns and the best radar afloat, designed as an air-defence cruiser.',
  ussr_kremlin: 'A Soviet super-battleship design of enormous displacement — never built, but drawn in detail.',
  ussr_tashkent: 'The "Blue Cruiser" — an Italian-built destroyer leader that ran at 42 knots supplying besieged Sevastopol.',
  ussr_moskva: 'A late Soviet heavy-cruiser project: nine 220mm guns with unusually good shell velocity.',
  ussr_k_21: 'The Soviet boat that claimed a torpedo attack on Tirpitz in 1942 — still argued about today.',
};

Object.assign(BLURBS, {
  usa_langley: "The Covered Wagon: a converted collier that became America's first aircraft carrier in 1922, and taught the US Navy how to fly from a deck.",
  usa_bogue: "An escort carrier built on a merchant hull. Bogue's hunter-killer group sank more U-boats than any other American formation.",
  usa_lexington: "Converted from an unfinished battlecruiser, so large she once supplied a city with electricity. Lost at the Coral Sea in 1942 to petrol vapour.",
  usa_midway: "An armoured flight deck on a 45,000-ton hull, commissioned eight days after the war she was designed for had ended. She served until 1992.",
  ijn_hosho: "The first ship in the world completed from the keel up as an aircraft carrier, in 1922. She survived the entire war.",
  ijn_ryujo: "A light carrier built small to slip under treaty limits, and top-heavy because of it. Sunk by aircraft at the Eastern Solomons in 1942.",
  ijn_shokaku: "Pearl Harbor, the Coral Sea, Santa Cruz: she fought in nearly every carrier battle of the Pacific war before a submarine caught her in 1944.",
  ijn_taiho: "Japan's first armoured flight deck, lost in her first battle to a single torpedo. The hit split a fuel tank and the petrol vapour did the rest.",
  uk_hermes: "The first ship in the world designed from the outset as a carrier, though Hosho was finished first. Sunk by Japanese aircraft off Ceylon in 1942.",
  uk_furious: "Began life as a battlecruiser carrying an 18-inch gun. In 1917 a Sopwith Pup landed on her deck under way, the first landing on a moving ship.",
  uk_implacable: "An armoured carrier built to survive bombs in the narrow seas, and later sent east with the British Pacific Fleet.",
  uk_audacious: "Lead ship of the last British fleet carrier design of the war, completed afterwards and renamed Eagle.",
});

const GENERIC_BLURB = {
  DD: 'Small, fast and almost invisible. Destroyers scout, capture zones, hide behind smoke and put torpedoes into anything bigger than them.',
  CA: 'The all-rounder. Fast-firing guns that start fires, enough armour to bully destroyers, and enough speed to run from battleships.',
  BB: 'Slow, enormous and heavily armoured. One accurate salvo can end a cruiser — but it takes half a minute to reload.',
  SS: 'Dives beneath the battle and stalks big targets with homing torpedoes. Deadly, until a destroyer finds you with depth charges.',
  CV: 'Fights entirely through its aircraft. Send up rockets, dive bombers or torpedo bombers and fly them yourself while the ship sails on without you.',
};

function shipId(nation, name) {
  return nation + '_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

// ---- statistic generation --------------------------------------------------
function buildShip(nation, cls, tier, name) {
  const T = tier;
  const s = {
    id: shipId(nation, name), name, nation, cls, tier,
    flag: NATIONS[nation].flag,
  };

  if (cls === 'DD') {
    s.hp = Math.round(5200 + 1500 * T);
    s.speed = 32.5 + 0.65 * T;
    s.len = 88 + 7 * T;  s.beam = 8.5 + 0.45 * T;
    s.conceal = 5.1 + 0.14 * T;
    s.turnR = 480 + 22 * T; s.rudder = 2.8 + 0.05 * T;
    s.armor = 16 + T; s.citArmor = 16 + T;
    s.guns = {
      n: T < 5 ? 4 : T < 8 ? 5 : 6, cal: 98 + 3.2 * T,
      reload: 6.4 - 0.28 * T, range: (6.2 + 0.42 * T) * 1000,
      shellSpeed: 1000 + 20 * T, traverse: 24 * DEG,
    };
    s.torps = {
      tubes: T < 4 ? 3 : T < 7 ? 4 : 5, dmg: 5600 + 1350 * T,
      range: (4.2 + 0.32 * T) * 1000, speed: (54 + 0.9 * T) * KN,
      reload: 64 - 1.8 * T, detect: 1100, arc: 60 * DEG,
    };
    s.cons = ['dcp', 'smoke', 'boost'];
  } else if (cls === 'CA') {
    s.hp = Math.round(8600 + 2500 * T);
    s.speed = 30 + 0.45 * T;
    s.len = 118 + 11 * T; s.beam = 12.5 + 0.9 * T;
    s.conceal = 8.2 + 0.32 * T;
    s.turnR = 640 + 34 * T; s.rudder = 4.6 + 0.22 * T;
    s.armor = 22 + 2.4 * T; s.citArmor = 60 + 11 * T;
    s.guns = {
      n: T < 5 ? 6 : T < 8 ? 8 : 9, cal: 118 + 8.6 * T,
      reload: 12.6 - 0.45 * T, range: (8.4 + 0.52 * T) * 1000,
      shellSpeed: 1050 + 22 * T, traverse: 16 * DEG,
    };
    if (T >= 4 && nation !== 'usa') {
      s.torps = {
        tubes: 3, dmg: 7600 + 1150 * T, range: (4.8 + 0.3 * T) * 1000,
        speed: (57 + 0.5 * T) * KN, reload: 96 - 2.4 * T, detect: 1300, arc: 45 * DEG,
      };
    }
    s.cons = ['dcp'];
    if (T >= 8) s.cons.push('heal');
    if (T >= 6) s.cons.push((nation === 'usa' || nation === 'ussr') && T >= 8 ? 'radar' : 'hydro');
  } else if (cls === 'BB') {
    s.hp = Math.round(30000 + 4300 * T);
    s.speed = 21.5 + 0.6 * T;
    s.len = 155 + 11.5 * T; s.beam = 23 + 1.2 * T;
    s.conceal = 12.4 + 0.46 * T;
    s.turnR = 740 + 40 * T; s.rudder = 12.5 - 0.2 * T;
    s.armor = 30 + 3 * T; s.citArmor = 180 + 16 * T;
    s.guns = {
      n: T < 6 ? 10 : T < 9 ? 8 : 9, cal: 278 + 13 * T,
      reload: 34 - 0.55 * T, range: (10.5 + 0.55 * T) * 1000,
      shellSpeed: 1000 + 20 * T, traverse: 5.2 * DEG,
    };
    s.secondary = { dmg: 900 + 90 * T, reload: 5, range: (3.6 + 0.14 * T) * 1000, fire: 0.07 };
    s.cons = ['dcp', 'heal'];
  } else if (cls === 'CV') {
    s.hp = Math.round(26000 + 3900 * T);
    s.speed = 26 + 0.7 * T;
    s.len = 168 + 12.5 * T; s.beam = 21 + 1.5 * T;
    s.conceal = 12.5 + 0.45 * T;
    s.turnR = 900 + 46 * T; s.rudder = 13 - 0.2 * T;
    s.armor = 20 + 1.8 * T; s.citArmor = 40 + 7 * T;
    // real carriers carried dual-purpose guns for self defence, nothing more
    s.guns = {
      n: 8, cal: 100 + 3 * T, reload: 6.5,
      range: (4.4 + 0.2 * T) * 1000, shellSpeed: 950 + 12 * T, traverse: 22 * DEG,
    };
    s.air = {
      rk: { key: 'rk', name: 'Rocket attack', planes: 4, perAttack: 2,
            hp: 1100 + 180 * T, speed: (148 + 4 * T) * KN, turn: 0.85,
            dmg: 1600 + 280 * T, fire: 0.10, reload: 45, spread: 90 },
      db: { key: 'db', name: 'Dive bombers', planes: 4, perAttack: 2,
            hp: 1250 + 200 * T, speed: (138 + 4 * T) * KN, turn: 0.72,
            dmg: 4200 + 700 * T, fire: 0.34, reload: 60, spread: 130 },
      tb: { key: 'tb', name: 'Torpedo bombers', planes: 4, perAttack: 2,
            hp: 1400 + 215 * T, speed: (128 + 4 * T) * KN, turn: 0.62,
            dmg: 3400 + 620 * T, fire: 0, reload: 75, spread: 0,
            torpSpeed: (70 + 1.5 * T) * KN, torpRange: 1400 + 50 * T },
    };
    s.cons = ['dcp', 'heal', 'fighters'];
  } else { // SS
    s.hp = Math.round(5800 + 1200 * T);
    s.speed = 17 + 0.35 * T;
    s.subSpeedMul = 0.72;
    s.len = 68 + 6.5 * T; s.beam = 6.5 + 0.35 * T;
    s.conceal = 4.2 + 0.1 * T;
    s.turnR = 420 + 16 * T; s.rudder = 3.2;
    s.armor = 14 + T; s.citArmor = 14 + T;
    s.guns = {
      n: 1, cal: 88 + 4 * T, reload: 7.5, range: (5 + 0.2 * T) * 1000,
      shellSpeed: 950 + 15 * T, traverse: 20 * DEG, deckGun: true,
    };
    s.torps = {
      tubes: 4, dmg: 4200 + 620 * T, range: (6 + 0.25 * T) * 1000,
      speed: (46 + 0.6 * T) * KN, reload: 42 - 0.8 * T, detect: 900,
      arc: 25 * DEG, homing: true,
    };
    s.oxygen = 150 + 8 * T;
    s.cons = ['dcp', 'ping', 'boost'];
  }

  // ---- anti-aircraft armament ----
  // Cruisers are the flak platforms; submarines have essentially nothing.
  // Close-in these numbers are lethal; the gentle outer envelope in
  // Squadron.takeFlak is what stops a strike dying before it arrives.
  s.aa = {
    DD: { dps: 30 + 6 * T,  range: 3000 },
    CA: { dps: 70 + 21 * T, range: 4600 },
    BB: { dps: 55 + 16 * T, range: 4300 },
    CV: { dps: 60 + 17 * T, range: 4200 },
    SS: { dps: 4,           range: 900 },
  }[cls];

  // ---- national flavour ----
  if (nation === 'ijn') {
    s.conceal *= 0.92;
    if (s.torps) { s.torps.range *= 1.18; s.torps.dmg = Math.round(s.torps.dmg * 1.1); }
  } else if (nation === 'ger') {
    s.hp = Math.round(s.hp * 1.06);
    if (cls === 'CA' || cls === 'BB') { if (!s.cons.includes('hydro')) s.cons.push('hydro'); }
    if (s.torps) s.torps.range *= 0.82;
  } else if (nation === 'uk') {
    s.heFireBonus = 1.35;
    if (cls === 'CA' && !s.cons.includes('smoke')) s.cons.push('smoke');
  } else if (nation === 'ussr') {
    s.guns.shellSpeed *= 1.14;
    s.speed += 1.2;
    s.conceal *= 1.06;
  } else if (nation === 'usa') {
    s.hp = Math.round(s.hp * 1.03);
    if (cls === 'BB') s.guns.reload *= 0.97;
    s.aa.dps *= 1.30;            // proximity fuses and a forest of Bofors
  }
  if (nation === 'ijn') s.aa.dps *= 0.78;
  if (nation === 'uk') s.aa.dps *= 1.12;

  // ---- iconic hulls get their real character ----
  const tweak = {
    ijn_yamato:    sh => { sh.guns.cal = 460; sh.guns.n = 9; sh.hp = 97000; sh.speed = 27; },
    ijn_shimakaze: sh => { sh.torps.tubes = 5; sh.torps.reload = 40; sh.speed = 39; },
    ijn_i_400:     sh => { sh.torps.tubes = 6; sh.len = 122; },
    usa_iowa:      sh => { sh.speed = 33; sh.guns.cal = 406; },
    usa_montana:   sh => { sh.guns.n = 12; sh.guns.cal = 406; sh.hp = 96300; },
    usa_des_moines:sh => { sh.guns.reload = 5.5; sh.guns.cal = 203; },
    usa_fletcher:  sh => { sh.torps.tubes = 5; sh.guns.n = 5; },
    ger_bismarck:  sh => { sh.secondary.range *= 1.5; sh.secondary.reload = 3.4; },
    ger_tirpitz:   sh => { sh.secondary.range *= 1.5; sh.torps = { tubes: 2, dmg: 13700, range: 6000, speed: 65 * KN, reload: 70, detect: 1300, arc: 40 * DEG }; },
    ger_scharnhorst:sh=> { sh.guns.cal = 283; sh.guns.n = 9; sh.guns.reload = 17; sh.speed = 32; },
    uk_hood:       sh => { sh.speed = 31; sh.citArmor *= 0.8; },
    uk_minotaur:   sh => { sh.guns.reload = 3.2; sh.guns.n = 10; sh.guns.cal = 152; },
    uk_belfast:    sh => { sh.cons.push('radar'); },
    ussr_tashkent: sh => { sh.speed = 42; },
    ussr_kremlin:  sh => { sh.hp = 105000; sh.armor = 60; },
    ger_admiral_graf_spee: sh => { sh.guns.cal = 283; sh.guns.n = 6; sh.guns.reload = 15; sh.hp *= 1.1; },
  }[s.id];
  if (tweak) tweak(s);

  // ---- derived combat numbers ----
  const g = s.guns;
  g.dmgHE = Math.round(g.cal * 16.5);
  g.dmgAP = Math.round(g.cal * 33);
  g.pen   = g.cal * 0.62;                       // AP penetration, mm at battle range
  g.hePen = g.cal / 5.5;
  g.fire  = clamp(g.cal * 0.00085, 0.05, 0.38) * (s.heFireBonus || 1);
  g.sigma = cls === 'BB' ? 1.7 : cls === 'CA' ? 2.0 : 2.2;
  s.hp = Math.round(s.hp);
  s.speedMS = s.speed * KN;
  s.concealM = s.conceal * 1000;
  s.xpCost = TIER_XP[tier];
  s.price  = TIER_CREDIT[tier];
  s.blurb = BLURBS[s.id] || GENERIC_BLURB[cls];
  return s;
}

// ---- assemble the full roster ---------------------------------------------
const SHIPS = {};     // id -> ship
const TREE  = [];     // {id, nation, cls, tier, prereq}

(function buildRoster() {
  for (const [nation, name] of STARTERS) {
    const sh = buildShip(nation, 'CA', 1, name);
    sh.starter = true; sh.xpCost = 0; sh.price = 0;
    SHIPS[sh.id] = sh;
    TREE.push({ id: sh.id, nation, cls: 'CA', tier: 1, prereq: null, starter: true });
  }
  for (const line of LINES) {
    let prev = shipId(line.nation, STARTERS.find(s => s[0] === line.nation)[1]);
    // submarines branch off the tier 5 destroyer of the same navy
    if (line.cls === 'SS') {
      const dd = LINES.find(l => l.nation === line.nation && l.cls === 'DD');
      prev = shipId(line.nation, dd.ships.find(s => s[0] === 5)[1]);
    }
    for (const [tier, name] of line.ships) {
      const sh = buildShip(line.nation, line.cls, tier, name);
      SHIPS[sh.id] = sh;
      TREE.push({ id: sh.id, nation: line.nation, cls: line.cls, tier, prereq: prev });
      prev = sh.id;
    }
  }
})();

const treeEntry = id => TREE.find(t => t.id === id);
