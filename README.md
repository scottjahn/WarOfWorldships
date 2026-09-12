# War of Worldships

A 3D naval combat game in the style of World of Warships. You command one real
warship from a camera over its stern, against a fleet of bot-controlled ships,
earning XP and credits to research your way up a tech tree of 145 real hulls —
destroyers, cruisers, battleships and submarines from five navies.

The 3D view is drawn by a small perspective renderer written from scratch onto a
plain 2D canvas: no WebGL, no libraries, nothing to install.

## Playing

Double-click `index.html`. That's it — no install, no build step.

If a browser ever objects to running it straight from disk, serve it instead:

```bash
node server.js
```

then open <http://localhost:8123>.

Progress is saved in the browser's local storage, so keep using the same
browser on the same computer. "reset progress" at the bottom of the port screen
wipes the save and starts over.

## Controls

**Click the sea once when the battle starts** — that captures the mouse so it
steers the camera. `Esc` gives the mouse back.

| Key | Action |
| --- | --- |
| Mouse | Look around. The guns follow the crosshair |
| Left click | Fire the selected weapon |
| `W` / `S` | Engine ahead / astern — six notches from full reverse to full ahead |
| `A` / `D` | Rudder to port / starboard (hold it) |
| `1` | Main guns — press again to switch between **HE** and **AP** shells |
| `2` | Torpedoes |
| `3` | Depth charges (destroyers and cruisers) |
| `X` / right click | Lock the target under the crosshair |
| `Shift` | Binocular view — zooms right in for long-range gunnery |
| `M` | Look straight down at the whole battle |
| Mouse wheel | Zoom in and out |
| `R` | Damage control — puts out fires and stops flooding |
| `T` | Repair party — heals back part of the damage you have taken |
| `Y` | Smoke screen / hydroacoustic search / radar, whichever your ship carries |
| `U` | Engine boost |
| `F` | Sonar ping (submarines) — marks a target so your torpedoes home on it |
| `C` / `V` | Dive deeper / surface (submarines) |
| `]` or `+` | Speed time up — 1x, 2x, 4x, 8x |
| `[` or `-` | Slow time down, all the way to half speed |
| `0` | Back to normal speed |
| `Enter` | After you are sunk: skip to the end of the battle |

There are also ◀ ▶ buttons beside the speed readout at the bottom left, though
they can only be clicked when the mouse is not captured — the keys always work.

**Half speed is worth knowing about.** It is the easiest way to see what leading
a target actually means: the shells crawl and you can watch them fall ahead of
the enemy. The fast settings are for the long run out to the middle of the map;
every battle starts back at normal speed.

### Aiming

Put the crosshair on an enemy and the gunnery computer takes the range from that
ship, so all you have to judge is **lead** — how far ahead of a moving target to
shoot. The gold marker labelled *aim here* shows the answer and how many seconds
the shells will be in the air; ignore it once you have the knack. Press `X` to
lock a target so the range stays on it even while you swing off to lead.

Torpedoes are different: they aim at the actual patch of water under the
crosshair, so you lead them yourself.

## Difficulty

Pick this in the port, next to the BATTLE button. New players start on **Cabin
Boy**.

| | Cabin Boy | Sailor | Admiral |
| --- | --- | --- | --- |
| Guns work out the lead for you | yes | yes | no |
| Salvo spread | very tight | tight | full |
| Damage you take | 40% | 55% | 100% |
| Enemy gunnery | poor | fair | good |
| How often the enemy picks on you | rarely | sometimes | always |
| Fires and flooding | crew handles it | you press `R` | you press `R` |
| Battle length | 8 min | 11 min | 15 min |

**Cabin Boy exists because leading a target is genuinely hard.** A shell is in
the air for seven seconds and the enemy has moved by the time it lands, so you
have to shoot at where a ship *will be*. On Cabin Boy and Sailor the gunners do
that for you: keep the crosshair near an enemy and hold the left button. The
crosshair slides ahead of the target on its own, which is also the clearest way
to *learn* what leading means before switching to Admiral.

Measured over 14 simulated battles in a tier V destroyer, a player who simply
points at the nearest enemy and holds fire gets:

| | damage a battle | survived | won |
| --- | --- | --- | --- |
| Cabin Boy | ~61,000 | 100% | 100% |
| Sailor | ~44,000 | 50% | 50% |
| Admiral | ~10,000 | 21% | 29% |

## The shipyard

The **SHIPYARD** button in the port opens a builder where you design a ship of
your own and then take it to sea like any other.

Pick a hull, a navy, a tier and a coat of paint, then spend your points across
ten things: guns, rate of fire, range, armour, hull, engine, handling, stealth,
torpedoes and anti-aircraft. Carriers get an air group instead of torpedoes, and
navies that never put torpedoes on cruisers do not offer them.

**The points are the whole idea.** There are only so many, so every point that
goes into speed is one that cannot go into armour. A design with every stat at
five comes out exactly equal to a real ship of that tier — that is what makes
the budget a fair currency — and you get six spare points on top to make her
special. A fast, stealthy ship with enormous guns will be made of paper, and
that is the correct answer rather than a bug.

The ship on screen is the ship you are building: push the Hull pips up and she
visibly grows. Click the picture to stop or start it turning.

Building costs the normal credits for that tier, so a new account can afford a
tier IV design straight away, and tier I designs are free to experiment with.
Ships you made are marked **yours** in the fleet list and can be taken back to
the yard from their card — changing tier charges only the difference, and
scrapping one refunds every credit.

Your own designs never crew the other side: the enemy fleet is always real ships.

## How a battle works

Two fleets of equal size start at opposite ends of a 12 km × 12 km sea with
three capture zones down the middle. First team to the points target wins (1000
on Admiral, less on the easier settings), and you also win by sinking every
enemy ship. Points come from holding zones and from
kills. The clock runs for 15 minutes; whoever leads on points when it expires
takes the win.

### The things that will kill you

- **Concealment.** Every ship has a detection range. Inside it, enemies see you.
  Firing your guns reveals you far beyond that range for a few seconds, so a
  destroyer that keeps shooting is a dead destroyer.
- **Shell type.** **AP** punches through armour and can hit a citadel for
  enormous damage — but only if the target is showing you its side. Angle your
  bow toward a battleship and its AP will bounce off. **HE** does less damage
  but starts fires, and fires burn ships that AP cannot penetrate.
- **Angling.** Point your bow at whoever is shooting at you. It is the single
  most useful habit in the game.
- **Torpedoes.** They travel slowly and you only see enemy ones when they get
  close. Turn *into* them and comb the spread; turning away shows them your
  whole side.
- **Aircraft.** A carrier will find you wherever you hide. Staying near a
  cruiser puts you inside its flak umbrella, which is the only real answer.
- **Fires and flooding.** Both tick away your health. Damage control clears
  them, but it has a cooldown — using it on one small fire means having nothing
  left when you are burning in four places.

### Aircraft carriers

A carrier fights entirely through its aircraft. Its own guns are the small
dual-purpose mounts real carriers carried for self defence — do not go looking
for a gunfight in one.

Press `1`, `2` or `3` to send up a squadron and the camera goes with it:

| | good against | how it attacks |
| --- | --- | --- |
| `1` Rocket attack | destroyers, submarines, cruisers | fires forward on the run; shatters on battleship armour |
| `2` Dive bombers | anything | drops on the crosshair, and starts fires |
| `3` Torpedo bombers | battleships and carriers | torpedoes run on in the direction of flight, so you must line up the drop |

While you are in the air the mouse flies the squadron — it turns toward
wherever you are looking — `W` boosts, left click starts the attack run, and
`F` sends the survivors home. Your ship steers itself on autopilot until you
land. Each squadron carries enough aircraft for two attacks; once its planes are
gone the strike is over and the deck needs time to spot another.

**Flak is the whole game as a carrier.** Ships throw up very little at long
range and a great deal once you commit to an attack run, so a strike on a lone
destroyer is nearly free while one flown into the middle of the enemy fleet will
lose most of its aircraft. Cruisers are the flak platforms; American ships shoot
best, Japanese ships worst. `Y` launches a fighter patrol that circles your ship
and tears into enemy squadrons.

Aircraft are also the best scouts in the game — anything they fly near is
spotted for your whole team.

Only the navies that actually operated fleet carriers have a carrier line: the
United States, Japan and the Royal Navy. Germany never finished Graf Zeppelin
and the Soviet Union built none, so their carrier tabs say so.

### Submarines

Submarines run on the surface (fast, visible, can use the deck gun), at
periscope depth (slower, hard to see, can fire torpedoes), or deep (invisible to
guns, but blind and burning oxygen). Ping a target with `F` and your next
torpedoes will home in on it. Destroyers and cruisers hear you when you are
close, and their depth charges hurt.

## Progression

You start with the tier I ships of all five navies plus the American destroyer
*Sampson*. After each battle you earn XP (spend it to **research** the next ship
in a line) and credits (spend them to **buy** a researched ship). A ship unlocks
only once you own the one before it in the same line; submarine lines branch off
the tier V destroyer of the same navy.

Damage, kills and captures all pay, and winning multiplies the lot. Higher tier
ships earn more per battle.

## Layout

| File | What is in it |
| --- | --- |
| `js/data.js` | The 145-ship roster and the formulas that turn tier and class into statistics |
| `js/entities.js` | Ships, shells, torpedoes, depth charges, fires, flooding, consumables |
| `js/battle.js` | Teams, spotting, capture zones, scoring, match end |
| `js/ai.js` | Bot captains — one behaviour per class |
| `js/world.js` | Island and map generation, line-of-sight |
| `js/render.js` | The 3D renderer: projection, camera, sea, effects, minimap |
| `js/mesh.js` | Builds a ship model out of each hull's real length and beam |
| `js/ui.js` | Port screens, tech tree, battle HUD |
| `js/main.js` | Input, camera, main loop |
| `js/progression.js` | The save file: owned ships, credits, XP |
| `js/difficulty.js` | The three difficulty settings and everything they change |
| `js/aircraft.js` | Squadrons, bombs and rockets, flak, fighter patrols |
| `js/shipyard.js` | Turns a design into a playable ship, and the 3D preview |
| `js/yard-ui.js` | The builder screen |

Time control works by sub-stepping rather than by scaling the frame delta:
`Battle.advance()` splits the requested span into steps of at most 0.05 s, so
the physics integrates the same way at 8x as it does at 1x (measured drift after
a minute of hard turning: about two metres, which is the same order as ordinary
frame-rate jitter). At 8x on a 60 Hz screen that is three simulation steps per
frame, costing well under a millisecond.

Balance lives in two places: `buildShip()` in `js/data.js` for ship statistics,
and `Shell.hitShip()` in `js/entities.js` for the armour and penetration rules.

The renderer is a painter's-algorithm pipeline: every visible surface is
transformed into camera space, back faces are dropped, the rest are sorted far
to near and filled as flat polygons. `Render.project()` and `Render.rayDir()`
are the two bits of maths everything else is built on — one turns a point in the
world into a pixel, the other turns a pixel back into a ray.
