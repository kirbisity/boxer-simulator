// The Last Gate: hold a castle gate against a horde of starving rebels, as long as you can.
// The player is one hero (a samurai with the ōdachi, an Iron Pagoda with the guandao, a knight in
// plate with the mace) with up to five men of his own kind, in the gateway of a short stone wall;
// the rebels come out of a thick dawn mist, wave on wave, and every one that gets past the gate's
// line is a breach: the gate falls at LAST_GATE.breachesToFall, or when the defenders are all down.
//
// Nothing here makes a rebel weak or a hero strong but their bodies and kit: the rebels are cast.js
// starvedRebel's men (starved to a BMI of 14–15.5, which takes their strength and wind: body.js,
// physiology.js), most with bare hands, some with a staff, a few with a spear and a quilted jack;
// the heroes their presets, trained to a hero's skill. The rebels never break: they have nothing left
// to lose (their kit's `courage` set to 1, the same path as a machine's fearlessness: ai.js fearTarget).
//
// The horde is shown without its cost: a fixed pool of rebels (the world's fighter list never grows),
// a capped number of them awake near the gate, the rest dormant (as a level's sleeping men are) and
// woken one by one just inside the mist, fresh (physics.js reviveFighter) as others fall; the fallen
// are cleared after a while. The mist hides that the horde behind them is not there.
//
// The world's own AI fights; this module only walks each rebel at the gate until a defender is near
// enough to fight (`driven`, as level mode's awareness walks its men), and keeps the player's men
// near their posts while no rebel is near and no order of his stands (command.js orders govern otherwise).
// No DOM here: main.js and lastgateview.js draw it.

import { normaliseInputs, P, PRESETS } from './body.js';
import { englishManAtArms, footSoldier, sengokuWarrior, starvedRebel, steppeWarrior } from './cast.js';
import { createWorld, inFight, placeOnFloor, reviveFighter, seededRandom } from './physics.js';

export const LAST_GATE = {
  title: 'The Last Gate',
  // The place drawn round it (render.js `lastgate`, ground/painted.js): trodden wet earth, the gate's worn cobbles, puddles; closed in by woods (the works below).
  place: 'lastgate',
  // The floor: the field before the gate from x = gate.x to +halfX, a courtyard behind it.
  arena: { halfX: 18, halfZ: 10.5 },
  // A grey dawn mist (render.js applyWeather): clear to 3 m from the camera, gone by 26, cold blue-grey (`colour`); the sky the fog's, the sun weak through it.
  // Set against the spawn line: a rebel is woken some 28–32 m from a camera behind the gate, past the fog's far edge.
  weather: { fog: [3, 26], sky: 0.85, colour: 0x8e99a3, sun: 0.7 },
  // The gate: its line at x (the wall along z), open |z| < halfWidth (a gateway a cart goes through, ~5 m).
  // A rebel whose hips are `breachBehind` m inside the line is through: a breach.
  gate: { x: -12, halfWidth: 2.5, wallHeight: 3.2, towerHeight: 5.2, breachBehind: 1 },
  // Breaches the gate stands: at this many it falls and the run is over.
  breachesToFall: 5,
  // The men the hero brings (the most; the menu's run has all five).
  companionsMax: 5,
  // Every hero trained to this (body.js skill: a kit's men 0.2–0.5, the legends 1): the higher tier the player starts as.
  heroSkill: 0.9,
  // Posts, [m in front of the gate's line, m across]: the hero in the middle of the gateway, his men either side of him and
  // along the wall's foot (none behind him: the camera looks over his shoulder from there).
  posts: { hero: [2.4, 0], companions: [[2.2, -1.5], [2.2, 1.5], [1.7, -3.1], [1.7, 3.1], [1.2, -4.5]] },
  // The pool of rebels (the fighter list's fixed share) and the most of them awake and on their feet at once: set against a
  // phone's frame (Battle Mode's armies are ~70 men in all; 6 defenders and 18 rebels on their feet is a third of that).
  pool: 24,
  liveCap: 18,
  // Where rebels are woken: x (the mist's far side for the camera), z within ±spread; the dormant are parked behind it.
  spawn: { x: 13, spread: 8, parkX: 16.5 },
  // s a fallen rebel lies before he is cleared (his slot free to wake again); at least `clearSoonest` s when the pool is short.
  clearAfter: 8,
  clearSoonest: 2,
  // A rebel walking at the gate turns to fight a defender within `engage` m, and walks on when none is within `release` m.
  engage: 2.8,
  release: 4.5,
  // The defenders' posts: a man goes to fight a rebel within `guard` m of his post; with none, back to it (`home` m is there).
  guard: 5.5,
  home: 0.8,
  // Waves: one every `seconds`. Wave w keeps alive `alive(w)` rebels (at most liveCap), wakes one every `every(w)` s while
  // short, has `staff(w)` of them with a staff and `spear(w)` with a spear and a jack, and walks at `pace(w)` of a full
  // walk, `run(w)` of them running. The first minute and more is a few unarmed men at a shamble: a newcomer learns on them.
  waves: {
    seconds: 40,
    alive: (wave) => Math.round(2 + 1.6 * (wave - 1)),
    every: (wave) => Math.max(0.8, 5 - 0.5 * (wave - 1)),
    staff: (wave) => Math.min(0.3, 0.08 * (wave - 1)),
    spear: (wave) => Math.min(0.12, wave < 3 ? 0 : 0.03 * (wave - 2)),
    pace: (wave) => Math.min(1, 0.6 + 0.07 * (wave - 1)),
    run: (wave) => Math.min(0.6, wave < 3 ? 0 : 0.1 * (wave - 2)),
  },
  // The first rebels are already coming out of the mist: this many, this far (m) in front of the gate.
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
};

// The rebel pool: how many of each kit (most bare-handed, some with a staff, a few with a spear and a quilted jack).
export const LAST_GATE_POOL = { unarmed: 13, staff: 7, spear: 4 };

// The colours of the samurai's men (a lord's red lacing, his banner).
const LG_SAMURAI_SIDE = { tint: { armor: '#24242a', lace: '#8a1418' }, banner: '#8a1418' };
// Jurchen names for the Iron Pagoda's men.
const LG_JIN_NAMES = [['Wanyan', 'Puxian', 'Heshilie', 'Tushan', 'Jiagu', 'Wugulun', 'Nianhan', 'Pucha'], ['Ali', 'Bosu', 'Hela', 'Dage', 'Sahe', 'Wolu', 'Hushi', 'Yinshu']];
const lgPick = (list, random) => list[Math.floor(random() * list.length)];

/**
 * The three heroes: the card's words, the hero (his preset in his weapon, trained to LAST_GATE.heroSkill), and his men
 * (`companion(random, index)`: the first two his own kind's best, the rest their foot).
 */
export const LAST_GATE_HEROES = {
  samurai: {
    label: 'Samurai', glyph: '⛩️', weapon: 'Ōdachi', strength: 'The longest blade: cuts men down before they close.',
    hero: () => ({ ...structuredClone(PRESETS.odachi), skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? sengokuWarrior(random, LG_SAMURAI_SIDE, 'katana', 'samurai') : sengokuWarrior(random, LG_SAMURAI_SIDE, 'spear', 'ashigaru')),
  },
  ironPagoda: {
    label: 'Iron Pagoda', glyph: '🏯', weapon: 'Guandao', strength: 'Iron from head to knee: hands and staves cannot hurt him.',
    hero: () => ({ ...structuredClone(PRESETS.ironPagoda), style: 'guandao', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => {
      const man = steppeWarrior(random, index < 2 ? 'saber' : 'spear', 'medium');
      return { ...man, name: `${lgPick(LG_JIN_NAMES[0], random)} ${lgPick(LG_JIN_NAMES[1], random)}` };
    },
  },
  knight: {
    label: 'Knight', glyph: '🛡️', weapon: 'Mace', strength: 'Full plate: no edge finds him; the mace breaks bones.',
    hero: () => ({ ...structuredClone(PRESETS.knight), style: 'mace', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? englishManAtArms(random, index === 0 ? 'longsword' : 'warhammer') : footSoldier(random, 'spear')),
  },
};
export const LAST_GATE_HERO_KEYS = Object.keys(LAST_GATE_HEROES);

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

/** The pool's kits, in order (unarmed first). */
function lgPoolKinds() {
  return Object.entries(LAST_GATE_POOL).flatMap(([kind, count]) => Array(count).fill(kind));
}

const lgHips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const lgApart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * A run of The Last Gate: the world (the hero id 0, his men, then the rebel pool, all dormant but the opening's few) with
 * its run state in `world.lastGate`. `companions` 0–5; `seed` makes it the same run again.
 */
export function createLastGate(heroKey, { companions = LAST_GATE.companionsMax, seed = 1 } = {}) {
  const spec = LAST_GATE_HEROES[heroKey] ?? LAST_GATE_HEROES.samurai;
  const random = seededRandom(seed * 7919 + 17);
  const men = Math.max(0, Math.min(LAST_GATE.companionsMax, companions));
  const defenders = [normaliseInputs(spec.hero()), ...Array.from({ length: men }, (_, index) => normaliseInputs(spec.companion(random, index)))];
  const kinds = lgPoolKinds();
  const rebels = kinds.map((kind) => lastGateRebel(random, kind));
  const entries = [...defenders.map((inputs) => ({ inputs, corner: 'red' })), ...rebels.map((inputs) => ({ inputs, corner: 'blue' }))];
  const world = createWorld(entries, { seed, arena: lastGateArena(), rules: { noStandards: true } });
  const gate = LAST_GATE.gate;
  const posts = new Map();
  world.fighters.forEach((fighter, index) => {
    if (fighter.corner !== 'red') return;
    const [ahead, across] = index === 0 ? LAST_GATE.posts.hero : LAST_GATE.posts.companions[index - 1];
    const post = [gate.x + ahead, across];
    posts.set(fighter.id, post);
    placeOnFloor(fighter, post[0], post[1], 0, 0);
  });
  const pool = world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter, index) => ({ id: fighter.id, kind: kinds[index], inputs: rebels[index] }));
  pool.forEach((slot, index) => {
    const fighter = world.fighters[slot.id];
    fighter.dormant = true;
    placeOnFloor(fighter, LAST_GATE.spawn.parkX, ((index % 12) - 5.5) * 1.4, 0, Math.PI);
  });
  world.lastGate = {
    hero: heroKey in LAST_GATE_HEROES ? heroKey : 'samurai', heroId: 0, companions: men,
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
  for (let index = 0; index < LAST_GATE.opening.count; index += 1) lgWakeRebel(world, 'unarmed', LAST_GATE.opening.x + index * 1.5);
  lgCountAwake(world);
  return world;
}

/** The floor with its works: the gate's stone wall across it (open at the gateway), woods closing the field in on either hand. */
export function lastGateArena() {
  const { halfX, halfZ } = LAST_GATE.arena;
  const gate = LAST_GATE.gate;
  return {
    halfX, halfZ,
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

/** The wave now (from 1), by the run's time. */
export function lastGateWave(time) {
  return 1 + Math.floor(time / LAST_GATE.waves.seconds);
}

/** The kit of the next rebel woken in wave `wave`: a staff or a spear by the wave's shares, else bare hands. */
export function lastGateRebelKind(wave, roll) {
  const waves = LAST_GATE.waves;
  const spear = waves.spear(wave);
  if (roll < spear) return 'spear';
  if (roll < spear + waves.staff(wave)) return 'staff';
  return 'unarmed';
}

/** Rebels awake and not down for good. */
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

/** Wake a dormant rebel of this kit (else of any kit) just inside the mist, fresh; returns him, or null if the pool is spent. */
function lgWakeRebel(world, kind, x = LAST_GATE.spawn.x) {
  const run = world.lastGate;
  const free = run.pool.filter((slot) => world.fighters[slot.id].dormant);
  const slot = free.find((entry) => entry.kind === kind) ?? free[0];
  if (!slot) return null;
  const fighter = world.fighters[slot.id];
  const z = (run.random() * 2 - 1) * LAST_GATE.spawn.spread;
  reviveFighter(world, fighter, slot.inputs, { at: [x + run.random() * 2, 0, z], yaw: Math.PI });
  fighter.dormant = undefined;
  run.lastHitBy.delete(fighter.id);
  run.downAt.delete(fighter.id);
  const wave = lastGateWave(run.time);
  run.drive.set(fighter.id, { pace: LAST_GATE.waves.pace(wave) * (0.85 + 0.3 * run.random()), running: run.random() < LAST_GATE.waves.run(wave) });
  lgDrive(world, fighter);
  run.rebuilds.push(fighter.id);
  return fighter;
}

/** Put a rebel to sleep (cleared from the field, or through the gate): not simulated, thought for or drawn. */
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
  const way = world.lastGate.drive.get(fighter.id) ?? { pace: LAST_GATE.waves.pace(1), running: false };
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
    const d = lgApart(lgHips(man), at);
    if (d < distance) {
      best = man;
      distance = d;
    }
  }
  return { man: best, distance };
}

/** Who struck each rebel last (the events since the last look), to credit his fall to. */
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
    const wave = lastGateWave(run.time);
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
  const target = Math.min(LAST_GATE.liveCap, LAST_GATE.waves.alive(run.wave));
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
    const kind = lastGateRebelKind(run.wave, run.random());
    if (lgWakeRebel(world, kind)) run.nextWake = run.time + LAST_GATE.waves.every(run.wave);
  }
  // The rebels: at the gate, or at the man in their way.
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
  // The defenders: near their posts while no rebel is near them and no order of the player's stands.
  const rebels = run.pool.map((slot) => world.fighters[slot.id]).filter((fighter) => !fighter.dormant && fighter.state === 'up');
  const command = world.commands?.red;
  for (const fighter of defenders) {
    if (fighter.id === playerId || fighter.state !== 'up' || fighter.panicked || (command && command.by !== fighter.id)) {
      if (fighter.id !== playerId && fighter.driven) lgRelease(fighter);
      continue;
    }
    const post = run.posts.get(fighter.id);
    const near = lgNearestOf(rebels, post).distance;
    if (near < LAST_GATE.guard) {
      lgRelease(fighter);
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

/** What a run came to: the hero, how long the gate held, his kills and the defenders', the wave reached. */
export function lastGateResult(world) {
  const run = world.lastGate;
  return {
    hero: run.hero, seconds: Math.round(run.over?.time ?? run.time), kills: run.kills.hero, total: run.kills.total,
    waves: run.wave, breaches: run.breaches, how: run.over?.how ?? null, companions: run.companions,
  };
}

// ---- The leaderboard ----------------------------------------------------------------------------------------------------
// The best runs in this browser, behind a small interface (list, add) so that a server's board can stand in for it later.

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

/**
 * The board kept in `storage` (a localStorage, or anything with getItem and setItem; null or one that throws: a board
 * that keeps nothing beyond the page). `list()` the runs best first; `add(run)` puts a run in and says its place.
 */
export function createLastGateBoard(storage) {
  let memory = [];
  const read = () => {
    try {
      const raw = storage?.getItem(LAST_GATE_BOARD.key);
      const runs = raw ? JSON.parse(raw) : memory;
      return Array.isArray(runs) ? runs.filter((run) => run && Number.isFinite(run.kills) && Number.isFinite(run.seconds)) : [];
    } catch {
      return memory;
    }
  };
  return {
    list: () => read().sort(lastGateCompare).slice(0, LAST_GATE_BOARD.keep),
    add(run) {
      const entry = { hero: run.hero, kills: run.kills, total: run.total, seconds: run.seconds, waves: run.waves, date: run.date ?? new Date().toISOString() };
      const ranked = lastGateRank(read(), entry);
      memory = ranked.runs;
      try {
        storage?.setItem(LAST_GATE_BOARD.key, JSON.stringify(ranked.runs));
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
  const hero = LAST_GATE_HEROES[result.hero]?.label ?? 'Samurai';
  return `I held ${LAST_GATE.title} for ${lastGateClock(result.seconds)} as the ${hero} — ${result.kills} rebel${result.kills === 1 ? '' : 's'} cut down. Gladiator`;
}

/**
 * The words on a run's poster: the line over the time, the time the gate held, the rebels he cut down ("57 FELL"), the hero's
 * name and what he is ("THE SAMURAI · ŌDACHI"), and the mark. Two numbers only: the time and his kills.
 */
export function lastGatePosterWords(result, name = null) {
  const hero = LAST_GATE_HEROES[result.hero] ?? LAST_GATE_HEROES.samurai;
  return {
    over: 'THE GATE HELD',
    held: lastGateClock(result.seconds),
    fell: `${result.kills} FELL`,
    by: 'BY HIS HAND',
    name: (name ?? hero.label).toUpperCase(),
    title: `THE ${hero.label.toUpperCase()} · ${hero.weapon.toUpperCase()}`,
    mark: 'GLADIATOR · THE LAST GATE',
  };
}
