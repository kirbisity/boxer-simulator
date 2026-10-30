// The Last Gate: hold a gate against a horde out of the fog, as long as you can. Four scenarios (LAST_GATE_MODES), each a
// hero with up to five men of his own kind in the gateway of a short stone wall, and a horde of its own:
// - The Rice Riot: a samurai in ō-yoroi with the ōdachi, against starving peasants;
// - The Jacquerie: a knight in full plate on his destrier with the lance (it breaks only on heavy armour: weapons.js
//   `shatters`; here it is kept, couched again and again), against starving peasants with more staves and spears;
// - The Red Turbans: a Mongol horse archer in iron lamellar with the composite bow and a quiver of arrows (out of them, the
//   mace), against starving rebels who run at him sooner;
// - Night Shift: a special police officer (SWAT) with the AR-15 and its magazines (empty, the baton), against an army of
//   service androids (the humanoid robot, not the combat bot) that never tire, never bleed and never fear.
// Out of the mist they come, wave on wave, and every one that gets past the gate's line is a breach: the gate falls at
// LAST_GATE.breachesToFall, or when the defenders are all down.
//
// Nothing here makes a foe weak or a hero strong but their bodies and kit: the rebels are cast.js starvedRebel's men
// (starved to a BMI of 14–15.5, which takes their strength and wind: body.js, physiology.js), most with bare hands, some with
// a staff, a few with a spear and a quilted jack; the androids the humanoid robot (body.js PRESETS.humanoid); the heroes their
// presets, trained to a hero's skill. The rebels never break: they have nothing left to lose (their kit's `courage` set to 1,
// the same path as a machine's fearlessness: ai.js fearTarget). A mode's difficulty is all in its foes (`waves`): how many
// at once, how fast they come, what they carry, how fast they walk and run, how well they fight; intense from the start and
// steeply harder from `steepFrom` (two minutes in), so a run is over in some three or four minutes.
//
// The horde is shown without its cost: a fixed pool of foes (the world's fighter list never grows), a capped number of them
// awake near the gate, the rest dormant (as a level's sleeping men are) and woken one by one just inside the mist, fresh
// (physics.js reviveFighter) as others fall; the fallen are cleared after a while. The mist hides that the horde behind them
// is not there.
//
// The world's own AI fights; this module only walks each foe at the gate until a defender is near enough to fight (`driven`,
// as level mode's awareness walks its men), and keeps the player's men near their posts while no foe is near and no order of
// his stands (command.js orders govern otherwise); a rider is kept at his by his horse's reins (its goal).
// No DOM here: main.js and lastgateview.js draw it.

import { FRAMES, normaliseInputs, P, PRESETS } from './body.js';
import { englishManAtArms, footSoldier, sengokuWarrior, starvedRebel, steppeWarrior, swatOfficer } from './cast.js';
import { STYLES } from './moves.js';
import { createWorld, inFight, placeOnFloor, reviveFighter, seededRandom } from './physics.js';
import { caloriesForWeight } from './physiology.js';
import { placeMounted } from './physics/mounted.js';

export const LAST_GATE = {
  title: 'The Last Gate',
  // The place drawn round it (render.js `lastgate`, ground/painted.js): trodden wet earth, the gate's worn cobbles, puddles; closed in by woods (the works below).
  place: 'lastgate',
  // The floor: the field before the gate from x = gate.x to +halfX, a courtyard behind it.
  arena: { halfX: 18, halfZ: 10.5 },
  // A grey dawn mist (render.js applyWeather): clear to 3 m from the camera, gone by 26, cold blue-grey (`colour`); the sky the fog's, the sun weak through it.
  // Set against the spawn line: a foe is woken some 28–32 m from a camera behind the gate, past the fog's far edge.
  weather: { fog: [3, 26], sky: 0.85, colour: 0x8e99a3, sun: 0.7 },
  // The gate: its line at x (the wall along z), open |z| < halfWidth (a gateway a cart goes through, ~5 m).
  // A foe whose hips are `breachBehind` m inside the line is through: a breach.
  gate: { x: -12, halfWidth: 2.5, wallHeight: 3.2, towerHeight: 5.2, breachBehind: 1 },
  // Breaches the gate stands: at this many it falls and the run is over.
  breachesToFall: 5,
  // The men the hero brings (the most; the menu's run has all five).
  companionsMax: 5,
  // Every hero trained to this (body.js skill: a kit's men 0.2–0.5, the legends 1): the higher tier the player starts as.
  heroSkill: 0.9,
  // Posts, [m in front of the gate's line, m across]: the hero in the middle of the gateway, his men either side of him and
  // along the wall's foot (none behind him: the camera looks over his shoulder from there). A rider's post further out
  // (`rider`): out before his men, room to turn his horse, and the camera behind him still in front of the wall (it sits higher over a rider).
  posts: { hero: [2.4, 0], rider: [8, 0], companions: [[2.2, -1.5], [2.2, 1.5], [1.7, -3.1], [1.7, 3.1], [1.2, -4.5]] },
  // The pool of foes (the fighter list's fixed share) and the most of them awake and on their feet at once: set against a
  // phone's frame (Battle Mode's armies are ~70 men in all; 6 defenders and 18 foes on their feet is a third of that).
  pool: 24,
  liveCap: 18,
  // Where foes are woken: x (the mist's far side for the camera), z within ±spread; the dormant are parked behind it.
  spawn: { x: 13, spread: 8, parkX: 16.5 },
  // s a fallen foe lies before he is cleared (his slot free to wake again); at least `clearSoonest` s when the pool is short.
  clearAfter: 8,
  clearSoonest: 2,
  // A foe walking at the gate turns to fight a defender within `engage` m, and walks on when none is within `release` m.
  engage: 2.8,
  release: 4.5,
  // The defenders' posts: a man goes to fight a foe within `guard` m of his post; with none, back to it (`home` m is there).
  // A rider goes out to one within `rideGuard` m (his charge needs its run-up); a bow or a gun shoots at one within
  // `shootGuard` m (out to the mist's edge: what he can see to hit).
  guard: 5.5,
  rideGuard: 9,
  shootGuard: 20,
  home: 0.8,
  // A rider rides at the foe nearest to getting through (lgGateThreat): his distance from the gate's line, and `across` m for
  // every metre he is out beyond the gateway's side; his man kept unless another is `switch` m nearer to getting through.
  // Those within `room` m of it are left to his men on foot (no run-up for a horse against the wall).
  threat: { across: 0.5, switch: 4, room: 6 },
  // A rider back to his post at his horse's trot, there within `within` m (a horse is not stopped on a coin), and stood facing the mist.
  rideHome: { within: 2 },
  // The first foes are already coming out of the mist: this many, this far (m) in front of the gate.
  opening: { count: 2, x: 9 },
  // Rain standing in the field's hollows, [x, z, half-length, half-width] (m): shallow puddles (soft ground with water over it: physics/fieldworks.js),
  // drawn as Dunnottar's water is (levelmode/kitwater.js 'puddle', rung by feet and splashed), heard as a splash, reddened by the blood that falls in.
  // A few in the gateway's mouth, where the fighting is; more out across the field.
  puddles: [
    [-8.6, 0.7, 1.6, 0.9], [-9.8, -4.6, 1.3, 0.75], [-9.4, 5.6, 1.2, 0.7], [-6.0, -2.6, 1.1, 0.7], [-4.2, 2.2, 1.8, 1.0], [-1.6, -0.9, 1.3, 0.8],
    [-3.2, -6.6, 1.6, 0.9], [1.2, 3.8, 1.5, 0.9], [2.8, -4.3, 2.0, 1.1], [5.4, 0.5, 1.4, 0.8], [4.4, 7.1, 1.8, 0.9], [8.2, -1.9, 1.7, 1.0], [10.6, 4.6, 2.2, 1.2],
  ],
  // A puddle's ground: a few cm of rain over a firm bed (sinkage `depth`, firm `firm`, m), water's viscosity, wet clay's grip (`footing`, of a dry foot's).
  puddleGround: { depth: 0.02, firm: 0.05, viscosity: 1, footing: 0.8, water: 0.035 },
  // A rebel has nothing left to lose: his kit's courage (outfits.js gearTraits `outfit.courage`; 1 is a machine's: no fear at all).
  desperate: 1,
  // A fed man among the later waves (a mode's `fed` share: a deserter, a soldier gone over to the rising): fed to a BMI of
  // `bmi` (a fit working man's, against the starving 14–15.5) at `exercise` (a working man's), his strength and wind with it.
  fed: { bmi: 21.5, exercise: 0.5 },
};

/**
 * A wave's figure: [at wave 1, more each wave up to `steepFrom`, more each wave after it, least, most]. The early slope makes
 * the first two minutes intense; the late one, steeper, makes the next minute or two the end of most runs.
 */
export function lgRamp([first, early, late, low = -Infinity, high = Infinity], wave, steepFrom) {
  const value = first + early * (Math.min(wave, steepFrom) - 1) + late * Math.max(0, wave - steepFrom);
  return Math.max(low, Math.min(high, value));
}

// The colours of the samurai's men (a lord's red lacing, his banner).
const LG_SAMURAI_SIDE = { tint: { armor: '#24242a', lace: '#8a1418' }, banner: '#8a1418' };
// The police hero's team, by place: a breacher with the shotgun, a man with the pistol, three with the baton.
const LG_TEAM = ['shotgun', 'handgun', 'baton', 'baton', 'baton'];

/**
 * The four scenarios. The card's words: `title` (the scenario), `label` (the hero), his `weapon` and `strength`, `blurb`,
 * and his foes (`foe`, `foes`, how they go down: `felled`). The hero (`hero()`: his preset in his kit, trained to
 * LAST_GATE.heroSkill) and his men (`companion(random, index)`). The horde: `enemy(random, kind)` makes a foe of a kind,
 * `pool` how many of each kind the pool holds, `kinds` the kit of each one woken ([kind, share ramp] in order, the last
 * the rest), and `waves`: a wave every `seconds`; wave w keeps `alive` foes on the field (at most LAST_GATE.liveCap), wakes
 * one every `every` s while short, walks them at `pace` of a full walk, `run` of them running, trained to `skill`, `fed` of
 * them fed men (LAST_GATE.fed); each an lgRamp, steep from wave `steepFrom` on (wave 5 is 2:00–2:30 at 30 s a wave).
 */
export const LAST_GATE_MODES = {
  samurai: {
    title: 'The Rice Riot', label: 'Samurai', glyph: '⛩️', weapon: 'Ōdachi', foe: 'rebel', foes: 'rebels', felled: 'cut down',
    strength: 'Ō-yoroi and the longest blade: cuts them down before they close.',
    blurb: 'A famine ikki: starving peasants at the castle gate.',
    // Makara Naotaka in the great armour (outfits.js oyoroi: the detailed ō-yoroi, its kuwagata crest), the ōdachi in both hands.
    hero: () => ({ ...structuredClone(PRESETS.odachi), outfit: { kind: 'oyoroi', design: 0 }, accessories: ['crest'], skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? sengokuWarrior(random, LG_SAMURAI_SIDE, 'katana', 'samurai') : sengokuWarrior(random, LG_SAMURAI_SIDE, 'spear', 'ashigaru')),
    enemy: (random, kind) => lastGateRebel(random, kind),
    pool: { unarmed: 11, staff: 7, spear: 6 },
    // Bare hands at first; staves from the second wave, spears from the third, more of both after two minutes.
    kinds: [['spear', [-0.02, 0.02, 0.08, 0, 0.3]], ['staff', [0, 0.05, 0.08, 0, 0.35]], ['unarmed']],
    waves: {
      seconds: 30, steepFrom: 4,
      // On the field: 3 at first, 7–8 by 1:30; then four more each half-minute, to the cap by 3:00.
      alive: [3, 1.5, 4, 1, 18],
      // One woken every 3 s at first, every 1.8 s by 1:30; then every second and less.
      every: [3, -0.4, -0.5, 0.6, 5],
      // A shamble at first, a full walk by 3:00; none run in the first half-minute, half by 2:30.
      pace: [0.65, 0.05, 0.1, 0, 1],
      run: [0, 0.07, 0.25, 0, 0.9],
      // The hungriest first (a starving peasant's 0.1–0.2); after two minutes the men who had fought (a levy's drill, then a soldier's by 4:00).
      skill: [0.15, 0.02, 0.15, 0, 0.8],
      // None fed in the first two minutes; then the men who had eaten (deserters, soldiers gone over), a third by 3:00.
      fed: [0, 0, 0.15, 0, 0.6],
    },
  },
  knight: {
    title: 'The Jacquerie', label: 'Knight', glyph: '🛡️', weapon: 'Lance', foe: 'rebel', foes: 'rebels', felled: 'ridden down',
    strength: 'Full plate on a destrier: the lance runs them through and is couched again.',
    blurb: '1358: the peasants of the Beauvaisis rise against their lords.',
    // On his destrier in its steel bard (his kit's), the lance couched; were it broken (on heavy armour only), the mace.
    hero: () => ({ ...structuredClone(PRESETS.knight), style: 'lance', mounted: true, sidearm: 'mace', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? englishManAtArms(random, index === 0 ? 'longsword' : 'warhammer') : footSoldier(random, 'spear')),
    enemy: (random, kind) => lastGateRebel(random, kind),
    // The Jacques took up what they had: more staves and spears (and the levy's jacks) than the famine rebels elsewhere.
    pool: { unarmed: 10, staff: 8, spear: 6 },
    kinds: [['spear', [0.05, 0.04, 0.07, 0, 0.35]], ['staff', [0.15, 0.05, 0.07, 0, 0.4]], ['unarmed']],
    waves: {
      seconds: 30, steepFrom: 4,
      // More of them sooner (a rider cannot be everywhere): 4 at first, 8–9 by 1:30, the cap by 2:30.
      alive: [4, 1.6, 4.5, 1, 18],
      every: [2.6, -0.35, -0.5, 0.55, 5],
      pace: [0.7, 0.05, 0.1, 0, 1],
      run: [0.05, 0.07, 0.18, 0, 0.85],
      skill: [0.15, 0.02, 0.15, 0, 0.8],
      // None fed in the first two minutes; then the men who had eaten (deserters, soldiers gone over), a third by 3:00.
      fed: [0, 0, 0.15, 0, 0.6],
    },
  },
  mongol: {
    title: 'The Red Turbans', label: 'Mongol archer', glyph: '🏹', weapon: 'Composite bow', foe: 'rebel', foes: 'rebels', felled: 'shot down',
    strength: 'Iron lamellar on a steppe horse: arrows from the saddle; the quiver empty, the mace.',
    blurb: '1351: famine and the Yellow River\'s flood raise the Red Turbans against the Yuan.',
    // A horse archer of the Yuan's guard in iron lamellar to the knees, cut as the Mongols wore it (outfits.js
    // mingIronLamellar: the mongolIron coat, the spiked helmet with its lamellar aventail), on his steppe horse; the composite
    // bow and his kit's quiver, then the mace (STYLES.kheshigBow's fallback).
    hero: () => ({ ...structuredClone(PRESETS.kheshig), name: 'Jebe', style: 'kheshigBow', outfit: { kind: 'mingIronLamellar', design: 0 }, mounted: true, sidearm: 'mace', skill: LAST_GATE.heroSkill }),
    // His men on foot at the gate: two archers (shooting over him, then the sabre), one with sabre and shield, two with the mace.
    companion: (random, index) => steppeWarrior(random, index < 2 ? 'steppeBow' : index === 2 ? 'saberShield' : 'maceShield', 'medium'),
    enemy: (random, kind) => lastGateRebel(random, kind),
    // Rebels who come on fast at men who shoot them: more running, fewer staves, as many spears as the Jacquerie's.
    pool: { unarmed: 12, staff: 6, spear: 6 },
    kinds: [['spear', [0.03, 0.03, 0.08, 0, 0.3]], ['staff', [0.08, 0.04, 0.06, 0, 0.3]], ['unarmed']],
    waves: {
      seconds: 30, steepFrom: 4,
      alive: [2.5, 1.4, 4.5, 1, 18],
      every: [2.8, -0.4, -0.5, 0.55, 5],
      pace: [0.75, 0.05, 0.1, 0, 1],
      // Running at him from the start (a man shot at runs), most of them by 2:30.
      run: [0.05, 0.1, 0.25, 0, 0.95],
      skill: [0.15, 0.02, 0.15, 0, 0.8],
      // None fed in the first two minutes; then the men who had eaten (deserters, soldiers gone over), a third by 3:00.
      fed: [0, 0, 0.15, 0, 0.6],
    },
  },
  police: {
    title: 'Night Shift', label: 'SWAT officer', glyph: '🚓', weapon: 'AR-15', foe: 'android', foes: 'androids', felled: 'taken down',
    strength: 'A SWAT harness and the rifle\'s magazines; then the baton.',
    blurb: 'Special police at the depot gate: its service androids walk out of the fog, and keep coming.',
    // A SWAT officer (the team's heavy riot kit) with the AR-15 and its magazines (weapons.js RIFLE ammo), the baton at his belt.
    hero: () => ({ ...structuredClone(PRESETS.handgun), style: 'rifle', sidearm: 'baton', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => ({ ...swatOfficer(random, LG_TEAM[index] ?? 'baton'), sidearm: 'baton' }),
    enemy: (random) => lastGateAndroid(random),
    pool: { android: 24 },
    kinds: [['android']],
    waves: {
      seconds: 30, steepFrom: 4,
      // Machines that never tire: fewer at first (each takes several rounds), then the depot empties.
      alive: [2, 0.8, 4, 1, 18],
      every: [4, -0.5, -0.7, 0.6, 5],
      // A steady walk from the first (no hunger in them); they run (a machine's sprint) from two minutes.
      pace: [0.8, 0.05, 0.1, 0, 1],
      run: [0, 0.05, 0.22, 0, 0.9],
      // Their fighting routines (the kickboxing they were shown) better each wave after two minutes: they learn.
      skill: [0.4, 0, 0.08, 0, 0.8],
    },
  },
};
export const LAST_GATE_MODE_KEYS = Object.keys(LAST_GATE_MODES);
// (The modes by their heroes, as the menu and the board name them.)
export const LAST_GATE_HEROES = LAST_GATE_MODES;
export const LAST_GATE_HERO_KEYS = LAST_GATE_MODE_KEYS;

const lgMode = (key) => LAST_GATE_MODES[key] ?? LAST_GATE_MODES.samurai;

/** A mode's figure for this wave (`knob`: alive, every, pace, run, skill; null if the mode leaves it to its foes). */
export function lastGateWaveValue(mode, knob, wave) {
  const waves = lgMode(mode).waves;
  return waves[knob] ? lgRamp(waves[knob], wave, waves.steepFrom) : null;
}

/**
 * A rebel of the horde: a starving man (cast.js starvedRebel) with bare hands (`unarmed`), a staff, or a spear in a quilted
 * jack and kettle hat (`spear`, the levy's kit: a little armour); whatever he wears, his courage is a desperate man's.
 */
export function lastGateRebel(random, kind = 'unarmed') {
  const man = starvedRebel(random);
  if (kind === 'spear') {
    return normaliseInputs({ ...man, style: 'spear', outfit: { kind: 'levy', design: random() < 0.5 ? 0 : 1, courage: LAST_GATE.desperate }, accessories: [] });
  }
  return normaliseInputs({ ...man, style: kind === 'staff' ? 'staff' : 'unskilled', outfit: { ...man.outfit, courage: LAST_GATE.desperate } });
}

/** The same man fed (LAST_GATE.fed): a fit working man's weight on his frame, a working man's exercise; his kit and arms as they were. */
export function lastGateFed(inputs) {
  const spec = LAST_GATE.fed;
  const man = { ...inputs, exercise: Math.max(inputs.exercise ?? 0, spec.exercise) };
  man.calories = Math.round(caloriesForWeight(man, spec.bmi * (man.heightCm / 100) ** 2, (FRAMES[man.frame] ?? FRAMES.medium).lean));
  return man;
}

/** An android of the depot: the humanoid robot (body.js PRESETS.humanoid, not the combat bot), a unit number of its own. */
export function lastGateAndroid(random) {
  return normaliseInputs({ ...structuredClone(PRESETS.humanoid), name: `H-1 Unit ${100 + Math.floor(random() * 900)}` });
}

/** A mode's pool of kits, in order. */
function lgPoolKinds(mode) {
  return Object.entries(lgMode(mode).pool).flatMap(([kind, count]) => Array(count).fill(kind));
}

const lgHips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const lgApart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Where a man stands on the field: his horse's place if he rides, else his hips.
const lgAt = (fighter) => (fighter.mount ? [fighter.mount.at[0], fighter.mount.at[1]] : lgHips(fighter));

/**
 * A run of The Last Gate: the world (the hero id 0, his men, then the foes' pool, all dormant but the opening's few) with
 * its run state in `world.lastGate`. `mode` one of LAST_GATE_MODE_KEYS; `companions` 0–5; `seed` makes it the same run again.
 */
export function createLastGate(mode, { companions = LAST_GATE.companionsMax, seed = 1 } = {}) {
  const key = mode in LAST_GATE_MODES ? mode : 'samurai';
  const spec = lgMode(key);
  const random = seededRandom(seed * 7919 + 17);
  const men = Math.max(0, Math.min(LAST_GATE.companionsMax, companions));
  const defenders = [normaliseInputs(spec.hero()), ...Array.from({ length: men }, (_, index) => normaliseInputs(spec.companion(random, index)))];
  const kinds = lgPoolKinds(key);
  const foes = kinds.map((kind) => spec.enemy(random, kind));
  const entries = [...defenders.map((inputs) => ({ inputs, corner: 'red' })), ...foes.map((inputs) => ({ inputs, corner: 'blue' }))];
  const world = createWorld(entries, { seed, arena: lastGateArena(), rules: { noStandards: true } });
  const gate = LAST_GATE.gate;
  const posts = new Map();
  world.fighters.forEach((fighter, index) => {
    if (fighter.corner !== 'red') return;
    const [ahead, across] = index === 0 ? (fighter.mount ? LAST_GATE.posts.rider : LAST_GATE.posts.hero) : LAST_GATE.posts.companions[index - 1];
    const post = [gate.x + ahead, across];
    posts.set(fighter.id, post);
    placeOnFloor(fighter, post[0], post[1], 0, 0);
    if (fighter.mount) placeMounted(fighter, post[0], post[1], 0);
  });
  const pool = world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter, index) => ({ id: fighter.id, kind: kinds[index], inputs: foes[index] }));
  pool.forEach((slot, index) => {
    const fighter = world.fighters[slot.id];
    fighter.dormant = true;
    placeOnFloor(fighter, LAST_GATE.spawn.parkX, ((index % 12) - 5.5) * 1.4, 0, Math.PI);
  });
  world.lastGate = {
    mode: key, hero: key, heroId: 0, companions: men,
    time: 0, wave: 1, breaches: 0, over: null,
    kills: { hero: 0, total: 0 },
    pool, posts, random,
    nextWake: 0, eventCursor: 0,
    lastHitBy: new Map(), downAt: new Map(), drive: new Map(),
    peak: { awake: 0, rebels: 0 },
    // For the page: fighters whose bodies were made new (their models to build again), and what to tell the player.
    rebuilds: [], news: [],
  };
  // The first few are already coming out of the mist.
  const first = spec.kinds[spec.kinds.length - 1][0];
  for (let index = 0; index < LAST_GATE.opening.count; index += 1) lgWakeRebel(world, first, LAST_GATE.opening.x + index * 1.5);
  lgCountAwake(world);
  return world;
}

/** The floor with its works: the gate's stone wall across it (open at the gateway), woods closing the field in on either hand. */
export function lastGateArena() {
  const { halfX, halfZ } = LAST_GATE.arena;
  const gate = LAST_GATE.gate;
  return {
    halfX, halfZ,
    // A rider's field (physics/mounted.js steerInside): before the wall, between the woods; not the courtyard behind it.
    // Turned off its edges `edge` m ahead (the open field's 6 is most of this one): the wall and the woods are seen in time.
    ride: { x: [gate.x, halfX], z: [-(halfZ - 0.3), halfZ - 0.3], edge: 3 },
    works: {
      walls: [
        { points: [[gate.x, -halfZ - 0.5], [gate.x, halfZ + 0.5]], height: gate.wallHeight, kind: 'stone', gaps: [[halfZ + 0.5 - gate.halfWidth, halfZ + 0.5 + gate.halfWidth]] },
        ...[1, -1].map((sign) => ({ points: [[gate.x + 0.5, sign * (halfZ - 0.3)], [halfX + 6, sign * (halfZ - 0.3)]], height: 6, kind: 'wood' })),
      ],
      // The puddles: soft ground under rain water, ellipses (`bare`: the painted ground draws the earth round them; only the water is drawn here).
      soft: LAST_GATE.puddles.map(([x, z, rx, rz]) => ({ ...LAST_GATE.puddleGround, x: [x - rx, x + rx], z: [z - rz, z + rz], shape: 'ellipse', murk: 'puddle', bare: true, surface: 'mud', edge: Math.min(rx, rz) * 0.5 })),
      // Drawn only (worksview.js): the gatehouse's towers either side of the gateway, its arch and its doors standing open.
      gatehouse: { x: gate.x, halfWidth: gate.halfWidth, height: gate.towerHeight, wall: gate.wallHeight },
    },
  };
}

/** The wave now (from 1), by the run's time, in this mode. */
export function lastGateWave(time, mode = 'samurai') {
  return 1 + Math.floor(time / lgMode(mode).waves.seconds);
}

/** The kit of the next foe woken in wave `wave` of this mode: by the kits' shares in order (`roll` 0–1), else the last. */
export function lastGateRebelKind(wave, roll, mode = 'samurai') {
  const spec = lgMode(mode);
  let below = 0;
  for (const [kind, share] of spec.kinds) {
    if (!share) return kind;
    below += lgRamp(share, wave, spec.waves.steepFrom);
    if (roll < below) return kind;
  }
  return spec.kinds[spec.kinds.length - 1][0];
}

/** Foes awake and not down for good. */
function lgLiveRebels(world) {
  return world.lastGate.pool.filter((slot) => {
    const fighter = world.fighters[slot.id];
    return !fighter.dormant && fighter.state !== 'out';
  });
}

function lgCountAwake(world) {
  let awake = 0;
  let rebels = 0;
  for (const fighter of world.fighters) {
    if (fighter.dormant || fighter.state === 'out') continue;
    awake += 1;
    if (fighter.corner === 'blue') rebels += 1;
  }
  // (physics.js counts only the men awake for the fight's tier, as in a level.)
  world.awake = world.fighters.filter((fighter) => !fighter.dormant).length;
  const run = world.lastGate;
  run.peak.awake = Math.max(run.peak.awake, awake);
  run.peak.rebels = Math.max(run.peak.rebels, rebels);
  return { awake, rebels };
}

/** Wake a dormant foe of this kit (else of any kit) just inside the mist, fresh, trained to the wave's skill (fed, by its share); returns him, or null if the pool is spent. */
function lgWakeRebel(world, kind, x = LAST_GATE.spawn.x) {
  const run = world.lastGate;
  const free = run.pool.filter((slot) => world.fighters[slot.id].dormant);
  const slot = free.find((entry) => entry.kind === kind) ?? free[0];
  if (!slot) return null;
  const fighter = world.fighters[slot.id];
  const z = (run.random() * 2 - 1) * LAST_GATE.spawn.spread;
  const wave = lastGateWave(run.time, run.mode);
  const skill = lastGateWaveValue(run.mode, 'skill', wave);
  const fed = lastGateWaveValue(run.mode, 'fed', wave);
  let inputs = skill === null ? slot.inputs : { ...slot.inputs, skill };
  if (fed && run.random() < fed) inputs = lastGateFed(inputs);
  reviveFighter(world, fighter, inputs, { at: [x + run.random() * 2, 0, z], yaw: Math.PI });
  fighter.dormant = undefined;
  run.lastHitBy.delete(fighter.id);
  run.downAt.delete(fighter.id);
  run.drive.set(fighter.id, { pace: lastGateWaveValue(run.mode, 'pace', wave) * (0.85 + 0.3 * run.random()), running: run.random() < lastGateWaveValue(run.mode, 'run', wave) });
  lgDrive(world, fighter);
  run.rebuilds.push(fighter.id);
  return fighter;
}

/** Put a foe to sleep (cleared from the field, or through the gate): not simulated, thought for or drawn. */
function lgSleepRebel(world, fighter) {
  fighter.dormant = true;
  fighter.driven = false;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.running = false;
}

/** Walk him at the gate: through the gateway (aimed inside it, where his line crosses it) and on into the courtyard. */
function lgDrive(world, fighter) {
  const gate = LAST_GATE.gate;
  const way = world.lastGate.drive.get(fighter.id) ?? { pace: lastGateWaveValue(world.lastGate.mode, 'pace', 1), running: false };
  const [x, z] = lgHips(fighter);
  const inside = Math.max(-(gate.halfWidth - 0.7), Math.min(gate.halfWidth - 0.7, z * 0.35));
  fighter.driven = true;
  fighter.walking = true;
  fighter.goTo = x > gate.x + 0.6 ? [gate.x - 4, 0, inside] : [gate.x - 6, 0, z];
  fighter.move = way.pace;
  fighter.running = way.running;
  fighter.strafe = 0;
}

/** Let the fight AI have him (a defender near). */
function lgRelease(fighter) {
  if (!fighter.driven) return;
  fighter.driven = false;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.running = false;
}

/** The nearest of `men` to a point, and how far. */
function lgNearestOf(men, at) {
  let best = null;
  let distance = Infinity;
  for (const man of men) {
    const d = lgApart(lgAt(man), at);
    if (d < distance) {
      best = man;
      distance = d;
    }
  }
  return { man: best, distance };
}

/** How far from his post a defender goes out to a foe: a rider further (his run-up), a bow or a gun as far as he can see to hit. */
function lgGuardOf(fighter) {
  const style = STYLES[fighter.style];
  const weapon = fighter.weapon;
  if (style?.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent) return LAST_GATE.shootGuard;
  return fighter.mount ? LAST_GATE.rideGuard : LAST_GATE.guard;
}

/**
 * The foe a rider rides at: the one nearest to getting through, the least far from the gate's line (m) plus `across` for
 * every metre he is out beyond the gateway's side (he has the wall to go round first). Kept while he is up, unless another
 * is `switch` m nearer to it (a rider who changes his man every moment never runs one down). Null if none is up.
 */
function lgGateThreat(world, fighter, foes) {
  const gate = LAST_GATE.gate;
  const spec = LAST_GATE.threat;
  const far = (foe) => {
    const [x, z] = lgHips(foe);
    return (x - gate.x) + spec.across * Math.max(0, Math.abs(z) - gate.halfWidth);
  };
  let best = null;
  let least = Infinity;
  for (const foe of foes) {
    const d = far(foe);
    // (Those already at the gate are his men's: a horse has no run-up against the wall.)
    if (d < spec.room) continue;
    if (d < least) {
      best = foe;
      least = d;
    }
  }
  const kept = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (kept && foes.includes(kept) && far(kept) >= spec.room && far(kept) - least < spec.switch) return kept;
  return best;
}

/** A rider kept at his post by the reins: walked back to it at a trot, then stood facing the mist. */
function lgRideHome(world, fighter, post) {
  const horse = fighter.mount;
  fighter.driven = true;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.strafe = 0;
  fighter.running = false;
  const dx = post[0] - horse.at[0];
  const dz = post[1] - horse.at[1];
  const far = Math.hypot(dx, dz);
  horse.goalAt = world.time;
  horse.goal = far > LAST_GATE.rideHome.within ? { heading: Math.atan2(-dz, dx), speed: Math.min(horse.paces.trot, far) } : { heading: 0, speed: 0 };
}

/** Who struck each foe last (the events since the last look), to credit his fall to. */
function lgReadEvents(world) {
  const run = world.lastGate;
  const events = world.events;
  for (; run.eventCursor < events.length; run.eventCursor += 1) {
    const event = events[run.eventCursor];
    const struck = world.fighters[event.fighter ?? event.defender];
    const by = world.fighters[event.attacker];
    if (struck && by && struck.corner === 'blue' && by.corner === 'red' && event.attacker !== struck.id) run.lastHitBy.set(struck.id, by.id);
  }
}

/**
 * One step of the run, before the AI thinks (main.js thinkForBout; a headless run's think). `playerId`: the man played (his
 * own control, never steered), or null.
 */
export function stepLastGate(world, dt, { playerId = null } = {}) {
  const run = world.lastGate;
  if (!run) return;
  lgReadEvents(world);
  const gate = LAST_GATE.gate;
  const waves = lgMode(run.mode).waves;
  const defenders = world.fighters.filter((fighter) => fighter.corner === 'red');
  const standing = defenders.filter((fighter) => inFight(fighter) && fighter.state === 'up');
  // The fallen: credited, and cleared after a while.
  for (const slot of run.pool) {
    const fighter = world.fighters[slot.id];
    if (fighter.dormant) continue;
    if (fighter.state === 'out' && !run.downAt.has(fighter.id)) {
      run.downAt.set(fighter.id, run.time);
      if (!run.over) {
        run.kills.total += 1;
        if (run.lastHitBy.get(fighter.id) === run.heroId) run.kills.hero += 1;
      }
      lgRelease(fighter);
    }
  }
  if (!run.over) {
    run.time += dt;
    const wave = lastGateWave(run.time, run.mode);
    if (wave > run.wave) {
      run.wave = wave;
      run.news.push({ kind: 'wave', wave });
    }
    // Through the gate: a breach, and he is gone into the castle.
    for (const slot of lgLiveRebels(world)) {
      const man = world.fighters[slot.id];
      if (lgHips(man)[0] < gate.x - gate.breachBehind) {
        run.breaches += 1;
        run.news.push({ kind: 'breach', breaches: run.breaches });
        lgSleepRebel(world, man);
      }
    }
    if (run.breaches >= LAST_GATE.breachesToFall) run.over = { how: 'fallen', time: run.time };
    else if (!defenders.some((fighter) => inFight(fighter))) run.over = { how: 'overrun', time: run.time };
    if (run.over) run.news.push({ kind: 'over', how: run.over.how });
  }
  // Cleared: the long fallen, and (the pool short) the longest fallen sooner.
  const live = lgLiveRebels(world).length;
  const target = Math.min(LAST_GATE.liveCap, Math.round(lgRamp(waves.alive, run.wave, waves.steepFrom)));
  const short = !run.pool.some((slot) => world.fighters[slot.id].dormant);
  let oldest = null;
  for (const [id, at] of run.downAt) {
    const fighter = world.fighters[id];
    if (fighter.dormant) continue;
    if (run.time - at >= LAST_GATE.clearAfter) lgSleepRebel(world, fighter);
    else if (short && run.time - at >= LAST_GATE.clearSoonest && (!oldest || at < run.downAt.get(oldest.id))) oldest = fighter;
  }
  if (oldest && live < target) lgSleepRebel(world, oldest);
  // Woken, one at a time, while the wave is short of men (none once the gate has fallen).
  if (!run.over && live < target && run.time >= run.nextWake) {
    const kind = lastGateRebelKind(run.wave, run.random(), run.mode);
    if (lgWakeRebel(world, kind)) run.nextWake = run.time + lgRamp(waves.every, run.wave, waves.steepFrom);
  }
  // The foes: at the gate, or at the man in their way.
  for (const slot of run.pool) {
    const fighter = world.fighters[slot.id];
    if (fighter.dormant || fighter.state === 'out') continue;
    if (fighter.state !== 'up') {
      lgRelease(fighter);
      continue;
    }
    const { distance } = lgNearestOf(standing, lgHips(fighter));
    if (distance < LAST_GATE.engage) lgRelease(fighter);
    else if (fighter.driven || distance > LAST_GATE.release) lgDrive(world, fighter);
  }
  // The defenders: near their posts while no foe is near them and no order of the player's stands.
  const rebels = run.pool.map((slot) => world.fighters[slot.id]).filter((fighter) => !fighter.dormant && fighter.state === 'up');
  const command = world.commands?.red;
  for (const fighter of defenders) {
    if (fighter.id === playerId || fighter.state !== 'up' || fighter.panicked || (command && command.by !== fighter.id)) {
      if (fighter.id !== playerId && fighter.driven) lgRelease(fighter);
      continue;
    }
    const post = run.posts.get(fighter.id);
    const near = lgNearestOf(rebels, post).distance;
    // A rider (not the player's own) rides at the foe nearest to getting through, not merely the nearest to him (LAST_GATE.threat).
    fighter.focus = fighter.mount ? lgGateThreat(world, fighter, rebels)?.id : undefined;
    if (near < lgGuardOf(fighter)) {
      lgRelease(fighter);
      continue;
    }
    if (fighter.mount) {
      lgRideHome(world, fighter, post);
      continue;
    }
    fighter.driven = true;
    fighter.strafe = 0;
    fighter.running = false;
    if (lgApart(lgHips(fighter), post) > LAST_GATE.home) {
      fighter.walking = true;
      fighter.goTo = [post[0], 0, post[1]];
      fighter.move = 0.8;
    } else {
      // At his post: on guard, facing the mist.
      fighter.walking = false;
      fighter.goTo = null;
      fighter.move = 0;
    }
  }
  lgCountAwake(world);
}

/** The page's share of the run's news and rebuilt men since it last asked. */
export function drainLastGate(world) {
  const run = world.lastGate;
  if (!run) return { rebuilds: [], news: [] };
  const out = { rebuilds: run.rebuilds, news: run.news };
  run.rebuilds = [];
  run.news = [];
  return out;
}

/** What a run came to: the mode (its hero), how long the gate held, his kills and the defenders', the wave reached. */
export function lastGateResult(world) {
  const run = world.lastGate;
  return {
    hero: run.mode, seconds: Math.round(run.over?.time ?? run.time), kills: run.kills.hero, total: run.kills.total,
    waves: run.wave, breaches: run.breaches, how: run.over?.how ?? null, companions: run.companions,
  };
}

// ---- The leaderboard ----------------------------------------------------------------------------------------------------
// The best runs in this browser, a board for each mode, behind a small interface (list, add) so that a server's board can
// stand in for it later.

export const LAST_GATE_BOARD = { key: 'gladiator/lastgate-board', keep: 10 };

/** Better first: more of the hero's own kills, then longer held, then earlier. */
export function lastGateCompare(a, b) {
  return (b.kills - a.kills) || (b.seconds - a.seconds) || String(a.date).localeCompare(String(b.date));
}

/** The board with this run in it, best first, `keep` long; and where the run stands in it (null: not on it). */
export function lastGateRank(runs, entry, keep = LAST_GATE_BOARD.keep) {
  const all = [...runs, entry].sort(lastGateCompare);
  const kept = all.slice(0, keep);
  const at = kept.indexOf(entry);
  return { runs: kept, rank: at < 0 ? null : at + 1 };
}

/** A mode's board's key in storage. */
export function lastGateBoardKey(mode) {
  return `${LAST_GATE_BOARD.key}/${mode in LAST_GATE_MODES ? mode : 'samurai'}`;
}

/**
 * The boards kept in `storage` (a localStorage, or anything with getItem and setItem; null or one that throws: boards that
 * keep nothing beyond the page), one for each mode. `list(mode)` its runs best first; `add(run)` puts a run on its mode's
 * board (`run.hero`, the mode) and says its place.
 */
export function createLastGateBoard(storage) {
  const memory = new Map();
  const read = (mode) => {
    const key = lastGateBoardKey(mode);
    try {
      const raw = storage?.getItem(key);
      const runs = raw ? JSON.parse(raw) : memory.get(key) ?? [];
      return Array.isArray(runs) ? runs.filter((run) => run && Number.isFinite(run.kills) && Number.isFinite(run.seconds)) : [];
    } catch {
      return memory.get(key) ?? [];
    }
  };
  return {
    list: (mode = 'samurai') => read(mode).sort(lastGateCompare).slice(0, LAST_GATE_BOARD.keep),
    add(run) {
      const mode = run.hero in LAST_GATE_MODES ? run.hero : 'samurai';
      const entry = { hero: mode, kills: run.kills, total: run.total, seconds: run.seconds, waves: run.waves, date: run.date ?? new Date().toISOString() };
      const ranked = lastGateRank(read(mode), entry);
      const key = lastGateBoardKey(mode);
      memory.set(key, ranked.runs);
      try {
        storage?.setItem(key, JSON.stringify(ranked.runs));
      } catch {
        // (Storage denied or full: the board lasts as long as the page.)
      }
      return ranked;
    },
  };
}

/** A run's time as m:ss. */
export function lastGateClock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The line a player shares: "I held The Last Gate for 3:42 as the Samurai — 57 rebels cut down. Gladiator". */
export function lastGateShareText(result) {
  const mode = lgMode(result.hero);
  const foes = result.kills === 1 ? mode.foe : mode.foes;
  return `I held ${LAST_GATE.title} for ${lastGateClock(result.seconds)} as the ${mode.label} — ${result.kills} ${foes} ${mode.felled}. Gladiator`;
}

/**
 * The words on a run's poster: the line over the time, the time the gate held, the foes he felled ("57 FELL"), the hero's
 * name and what he is ("THE SAMURAI · ŌDACHI"), and the mark. Two numbers only: the time and his kills.
 */
export function lastGatePosterWords(result, name = null) {
  const mode = lgMode(result.hero);
  return {
    over: 'THE GATE HELD',
    held: lastGateClock(result.seconds),
    fell: `${result.kills} FELL`,
    by: 'BY HIS HAND',
    name: (name ?? mode.label).toUpperCase(),
    title: `THE ${mode.label.toUpperCase()} · ${mode.weapon.toUpperCase()}`,
    mark: 'GLADIATOR · THE LAST GATE',
  };
}
