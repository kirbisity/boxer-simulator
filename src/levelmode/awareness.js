// Level mode, awareness: who has noticed whom, and what the men of a stage do about it.
//
// The fight AI (ai.js) knows every enemy always. In a stage nobody does: a man fights only once he has
// seen the player (or been hit), and until then he stands his post or walks his round, relaxed, guard
// down. Awake men of a stage each have a "mind" (world.stage.aware.minds[fighterId]):
//
//   guard (role enemy | boss, corner 'blue')
//     lurk     buried where he lies (`spawn.lurk`: the cesspool's Noname in his heap of filth), on his knees under it, unseen and seeing
//              nothing, until the player comes within `radius` m or into `wake` (a region), or strikes him, or a scene sends him: then
//     rise     he comes up out of it, slowly (`seconds`), the filth sliding off him (world.stage.lurk[spawn id].risen, 0..1, for the drawing),
//              a groan as he starts and a roar as he stands (audio/cries.js `roar`), a `rise` event (drama.js: the camera's moment); then aggro
//     idle     at his post, facing as the spawn says (one with a `torment` lays his whip on his victim meanwhile: below)
//     patrol   walks spawn.patrol (to and fro), a pause at each end
//     aggro    the fight AI has him (ai.js think): targets the player and his followers
//     search   lost sight for AWARE.loseSeconds: goes to where he last saw them, looks about
//     return   walks back to his post (the way he came if the straight line is walled), then idle or patrol
//   civilian (role civilian, corner 'grey')    idle | patrol | flee | cower | return
//   captive (role prisoner, corner 'grey')     idle | flee | cower | return; freePrisoner() makes him an ally
//     A prisoner who `kneel`s (on his knees at his post: hands to his face, or chained up at the given points) or `mourn`s (weeps: a sob every
//     few seconds, now and then a wail: audio/cries.js `grief`) neither runs nor cowers: he stays as he is, whatever is fought round him.
//   A guard's `torment` ({ victim: spawn id, moves, zone, every, burst, pause, spare }): while he is unaware he lays a whip on his victim (a
//     kneeling prisoner): a burst of `burst` strokes (from..to), `every` s apart (from..to), then `pause` s (from..to); real strokes, at the victim
//     (physics/whip.js lashes him), until the victim is hurt past `spare` (hurtShare). The lashes are no alarm to anyone. Aware of the player,
//     he stops and fights.
//   ally (role ally, corner 'red')             follow (2-4 m behind the player, along his route) | stayed | aggro
//
// Seeing (the user's algorithm, run from the player outward, about 5 times a second, each man on his own beat):
//   1. Candidates: the men awake within R of the player (a sweep of the sight lines in a circle is
//      a ray to each man in it: the same thing, and cheaper than casting at every angle). R is the
//      section's `vision` (m), else AWARE.radius dimmed by its `light` (0 dark .. 1 bright): 20 to 30 m.
//   2. Mutual visibility, cheapest test first: in range; the player inside the man's forward cone
//      (AWARE.cone, full angle, from his yaw; narrower in a helm with a slit); no wall or ledge between
//      the two heads (physics/terrain.js rayBlocked). Only then he is aggro.
//   3. Facing away: only within AWARE.nearSense (2.5 m, all round, no wall between) does he notice him.
//      Farther off he may hear him (AWARE.hear: by his pace and his harness, less through a wall) and
//      turn to look (search): the player can creep up behind him, not run.
//   4. A man the player has not seen (off screen, behind a corner) whose cone holds the player with
//      no wall between is the same test: he is aggro too (the "rear threat": the test is mutual).
// Besides sight: a blow that lands on or is blocked by an unaware man makes him aggro; a clash of arms
// within AWARE.noiseRadius sends an idle man to search where it was; an aggro man shouts, and any
// unaware man within AWARE.shoutRadius with a clear sight line to him is aggro too.
//
// The hooks: ai.js thinkAll does not think for a man with `fighter.driven` (this module drives him with
// the same intents a player has: goTo, move, running); `fighter.mayTarget` limits whom a follower fights;
// `world.stage.rout` and `world.stage.escape` make a frightened man run along walkable ground.

import { particleAt, soundEvent, soundVoice } from '../audio/log.js';
import { hurtShare } from '../ai.js';
import { P } from '../body.js';
import { placeOnFloor, startCrawl, throwPunch } from '../physics.js';
import { floorAt, rayBlocked } from '../physics/terrain.js';
import { regionContains, sealedOut, sectionById, stageTerrain } from './stage.js';

export const AWARE = {
  // How far a man sees (m) ahead of him in full light; at light 0 this share of it. A section's own `vision` overrides; a post's (`spawn.vision`) caps it
  // until he is roused (an archer set to watch a bridge, not the cliff beside it: once he fights he follows his man as far as the light lets him).
  // (The user's numbers: a man facing the player makes him out at 20 to 30 m. 30 x (0.66 + 0.34 x light): 22 m in the drain's dark (light 0.18),
  // 25 m in the cellars and the court (0.3 to 0.55), 27.5 m on the cliff (0.75). It was 25 x (0.35 + 0.65 x light): 12 m in the drain, 21 on the cliff.)
  radius: 30,
  darkest: 0.66,
  // m: all round, at his back too, a man notices a man this close (a footfall on the flags, a breath, a shadow beside him) if no wall is between
  // them: the user's 2 to 3 m behind. (A player crawling is noticed at `crawlSight` of it.)
  nearSense: 2.5,
  // Hearing (heardPlayer): the player's own noise carries `pace` m for each m/s he moves (a walk, 1.2 m/s, 2.6 m: about the near sense, so that
  // walking up behind a man is heard as he is felt; a run, 3.5 m/s, 8 m; a sprint, 6 m/s, 13 m), none under `quiet` m/s (a creep, a man turning
  // on the spot), and at most `most` m. His harness rattles: x(1 + `armour` x its weight as a share of his body's: plate, about 0.35, x1.7; a
  // gambeson, 0.1, x1.2). On his knees (`crawl`) a share of it. A hard landing (a jump down, a fall) is heard `fall` m off for `seconds`. Through
  // a wall or a shut door the sound carries `through` of the way. What is heard is not seen: the man turns and goes to look (search), and with his
  // wider searching cone he sees him, or does not.
  hear: { pace: 2.2, quiet: 0.9, most: 16, armour: 2, crawl: 0.5, fall: 12, seconds: 1.5, through: 0.4 },
  // The cone of sight (full angle, degrees) from his yaw; in a helm with a slit; while searching (he is looking about).
  cone: 120,
  slitCone: 50,
  searchCone: 170,
  // Seconds between a man's looks.
  every: 0.2,
  // The player's sprint (run mode, `fighter.runMode`) is not noticed: while he sprints, and for `sprintGrace` s after, no man not
  // already aggro turns aggro from seeing him, from a clash of arms or from being bumped, and a man searching goes on
  // searching without converting. A man glimpses a sprinter late (he is past before the eye has made him out). Men already aggro keep
  // fighting as he passes, a blow that lands on an unaware man still alarms him, and an aggro man's shout still reaches his friends.
  // The grace is 0.6 s (three of a guard's looks, `every`): long enough that stopping dead beside a guard is not seen as a man
  // appearing out of the air at that instant (he was running a moment ago), short enough that standing there is soon seen.
  sprintUnseen: true,
  sprintGrace: 0.6,
  // The player crawling (his own crawl: control.js toggleCrawl) is low and slow: a man not yet aware of him makes him out only within
  // `crawlSight` of his usual range (and his head is low: a parapet or a cart hides him the sooner, as the sight line says).
  crawlSight: 0.5,
  // An aggro man who has not seen a foe for this long (s) searches; within `meleeSense` m he sees (hears) one regardless.
  loseSeconds: 8,
  meleeSense: 2.5,
  // Searching: seconds spent looking about at the place, how fast he goes (share of a walk), the longest he looks for the place (s).
  lookSeconds: 4,
  searchSpeed: 0.9,
  searchGiveUp: 12,
  // Walking round and home (share of a full walk); the pause at each end of a round (s, from..to); arrival (m).
  patrolSpeed: 0.7,
  patrolPause: [2, 4],
  returnSpeed: 0.8,
  returnGiveUp: 45,
  arrive: 0.7,
  // A shout reaches allies within this (m) that have a clear sight line to the shouter.
  shoutRadius: 15,
  // Noise: a blow struck or blocked within this (m) of an unaware man, for this long (s), draws him to look: steel on steel and a man's cry carry
  // (it was 6 m; a fight is the loudest thing in a castle). Through a wall, `hear.through` of it.
  noiseRadius: 12,
  noiseSeconds: 1.5,
  // Civilians and prisoners: a fight, or an aggro enemy in sight, within these (m) makes them run.
  fleeRadius: 8,
  seeRadius: 10,
  // How far they run at most (m) and for how long (s) before they crouch where they are; the pause before they get up (s with no fight within calmRadius m).
  fleeMax: 14,
  // A man a scene sends at the player (`rouse`, the hunt) runs at him while he is farther than `chargeTo` m (the fight AI closes at a guarded
  // walk, under a metre a second: a crowd 25 m off would take half a minute to come), then fights; the run is `chargeSpeed` of a full walk.
  chargeTo: 6,
  chargeSpeed: 1.8,
  fleeSeconds: 8,
  calmRadius: 15,
  calmSeconds: 12,
  // Followers: stay this far (m) behind the player along his route, a further `spacing` for each one more; run if farther than runFrom;
  // fight those aggro within allyReach (m) of the player or of him; re-home with the player if within rehome m.
  follow: { min: 2.5, max: 4, spacing: 1.3, runFrom: 9 },
  allyReach: 16,
  rehome: 30,
  // A follower within this many m (less than rehome) who would be left standing on a floor that goes with a section is set down on the route behind the player.
  catchUp: 30,
  // The player's route, remembered for the followers: a point each 0.7 m, so many of them.
  trailStep: 0.7,
  trailMax: 160,
  // A man buried (`spawn.lurk`) by default: he comes up when the player is within `radius` m on about his floor (`floor` m), over `seconds` s,
  // bowed `lean` rad at the start of it (a man getting up off his knees under a weight).
  lurk: { radius: 4, floor: 2, seconds: 2.6, lean: 0.9 },
  // A weeping prisoner (`spawn.mourn`) by default: a sob every `every` s (from..to), a wail `wail` of the time.
  mourn: { every: [3.5, 7], wail: 0.25 },
  // A whipping (`spawn.torment`) by default: the strokes (moves.js), where on him, the gap between strokes in a burst (s), the burst, the pause
  // after it (s), and how hurt (hurtShare) the victim may be before he is spared.
  torment: { moves: ['overhand', 'forehand'], zone: 'body', every: [1.3, 2.0], burst: [2, 4], pause: [5, 9], spare: 0.55 },
};

/** A share 0..1 from a man and a count, the same every run (a cadence that must not draw on world.random: a sound heard or not must not change the fight). */
const awSteady = (id, n) => {
  const v = Math.sin(id * 12.9898 + n * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const awBetween = ([low, high], share) => low + (high - low) * share;

const TWO_PI = Math.PI * 2;
const GUARDS = new Set(['enemy', 'boss']);

// ---- Small things ----------------------------------------------------------------

const hipX = (fighter) => fighter.x[P.pelvis * 3];
const hipZ = (fighter) => fighter.x[P.pelvis * 3 + 2];
const eyeY = (fighter) => fighter.x[P.head * 3 + 1];
const flatApart = (a, b) => Math.hypot(hipX(a) - hipX(b), hipZ(a) - hipZ(b));
const upright = (fighter) => fighter.state === 'up' && !fighter.dormant;
const yawToward = (dx, dz) => Math.atan2(-dz, dx);

/** Stand where he is, facing `yaw` (the physics turns a man toward his goTo). */
function stand(fighter, yaw) {
  fighter.goTo = [hipX(fighter) + Math.cos(yaw) * 3, 0, hipZ(fighter) - Math.sin(yaw) * 3];
  fighter.move = 0;
  fighter.running = false;
  fighter.strafe = 0;
}

/** Head for (x, z) at `speed` (share of a full walk), running if asked. */
function head(fighter, x, z, speed, running = false) {
  fighter.goTo = [x, 0, z];
  fighter.move = speed;
  fighter.running = running;
  fighter.strafe = 0;
}

/** Whether a man could walk the straight line between two floor points: no wall or ledge at waist height. */
function walkable(terrain, ax, az, ay, bx, bz, by) {
  return !rayBlocked(terrain, [ax, az], [bx, bz], ay + 0.9, by + 0.9);
}

const floorOf = (fighter) => fighter.lift ?? 0;

// ---- The minds ---------------------------------------------------------------------------

/**
 * Give a stage world its awareness: a mind for every man of a spawn, the player's route, the hooks.
 * (createStageWorld does this; the world keeps it in world.stage.aware.)
 */
export function createAwareness(world, config = {}) {
  const run = world.stage;
  const aware = {
    config: { ...AWARE, ...config },
    minds: [],
    time: world.time,
    cursor: world.events.length,
    clashes: [],
    trail: [],
    trailAt: 0,
    log: [],
    targetsAt: -1,
    targets: [],
    looks: 0,
    sprintAt: -Infinity,
  };
  run.aware = aware;
  run.civiliansHarmed = false;
  run.rout = (current, fighter, opponent) => routed(current, fighter, opponent);
  run.escape = (current, fighter, opponent) => escapeFrom(current, fighter, opponent);
  world.fighters.forEach((fighter, index) => {
    const spawn = fighter.spawn;
    if (!spawn) {
      aware.minds.push(null);
      return;
    }
    const post = world.stage.def.sections.flatMap((section) => section.spawns ?? []).find((each) => each.id === spawn.id);
    const kind = GUARDS.has(spawn.role) ? 'guard' : spawn.role === 'civilian' ? 'civilian' : spawn.role === 'prisoner' ? 'captive' : 'ally';
    const mind = {
      id: index,
      kind,
      state: 'idle',
      since: world.time,
      post: [...post.post],
      facing: post.facing ?? 0,
      patrol: post.patrol?.length ? post.patrol : null,
      refuge: post.refuge ?? null,
      // The post's alarm (raiseAlarm), and how far he looks from it (m) if not as far as his section lets him (an archer watching a bridge, not the cliff beside it).
      alarm: post.alarm ?? null,
      vision: post.vision ?? null,
      // A region he lies in wait for (`spawn.ambush`): the player in it, he has him, seen or not (lookGuard).
      ambush: post.ambush ?? null,
      // A prisoner who, freed, goes his own way and not with the player (`spawn.follows: false`: freePrisoner).
      follows: post.follows ?? null,
      // Buried where he lies (`spawn.lurk`), on his knees where he is kept (`kneel`), weeping (`mourn`), whipping a prisoner (`torment`).
      lurk: post.lurk ? { ...aware.config.lurk, ...(post.lurk === true ? {} : post.lurk) } : null,
      kneel: post.kneel ?? null,
      mourn: post.mourn ? { ...aware.config.mourn, ...(post.mourn === true ? {} : post.mourn) } : null,
      torment: post.torment ? { ...aware.config.torment, ...post.torment } : null,
      beats: 0,
      nextAt: 0,
      leg: 0,
      step: 1,
      pauseUntil: 0,
      next: (index % 5) * (aware.config.every / 5),
      lastSeen: null,
      seenAt: -Infinity,
      trail: [],
      go: null,
      slept: false,
    };
    aware.minds.push(mind);
    if (kind === 'ally') setState(world, aware, mind, fighter, 'follow');
    else if (mind.lurk && kind === 'guard' && fighter.state !== 'out') bury(world, aware, mind, fighter);
    else setState(world, aware, mind, fighter, mind.patrol && kind !== 'captive' ? 'patrol' : 'idle');
  });
  return aware;
}

// ---- Buried, and rising -------------------------------------------------------------------------------

/** What the drawing reads of a buried man: world.stage.lurk[spawn id] = { at: [x, y, z], risen: 0..1, size }. */
function lurkState(world, fighter, mind) {
  world.stage.lurk ??= {};
  return (world.stage.lurk[fighter.spawn.id] ??= { at: [...mind.post], size: mind.lurk.size ?? 1, risen: 0 });
}

/** Down on his knees under the heap (keeping his weapon), not walking (so he is no one's to fight: physics inFight), drawn hidden (`buried`). */
function bury(world, aware, mind, fighter) {
  setState(world, aware, mind, fighter, 'lurk', 'buried');
  startCrawl(world, fighter, 'lies buried', { keep: true });
  fighter.walking = false;
  fighter.buried = true;
  lurkState(world, fighter, mind).risen = 0;
}

/** He comes up out of it at the player (or at whoever struck him): the rise begins. */
function startRise(world, aware, mind, fighter, why) {
  setState(world, aware, mind, fighter, 'rise', why);
  fighter.crawling = false;
  fighter.buried = false;
  fighter.walking = false;
  fighter.kneel = { share: 1, lean: mind.lurk.lean };
  mind.rose = world.time;
  world.events.push({ time: world.time, kind: 'rise', fighter: fighter.id, effects: ['rises out of the filth'] });
  // (Heard: a groan as he starts; the roar is as he stands.)
  soundVoice(world, fighter, 'roar', 0.5);
}

/** Each step of the rise: the knees' share eased off, facing the player; at its end the roar and the fight. */
function stepRise(world, aware, mind, fighter) {
  const me = world.fighters[0];
  const u = Math.min(1, (world.time - mind.rose) / mind.lurk.seconds);
  const eased = u * u * (3 - 2 * u);
  lurkState(world, fighter, mind).risen = eased;
  stand(fighter, yawToward(hipX(me) - hipX(fighter), hipZ(me) - hipZ(fighter)));
  fighter.walking = false;
  if (fighter.state !== 'up') return;
  if (u < 1) {
    fighter.kneel = { share: 1 - eased, lean: mind.lurk.lean * (1 - eased) };
    return;
  }
  fighter.kneel = undefined;
  soundVoice(world, fighter, 'roar', 1);
  mind.state = 'risen';
  alarm(world, aware, mind, fighter, 'rose', me);
}

/** Buried: whether the player has come to him (near, or into his `wake` region). */
function lookLurk(world, aware, mind, fighter) {
  const me = world.fighters[0];
  if (me.state === 'out' || me.dormant || world.stage.ghost) return;
  const lurk = mind.lurk;
  const near = flatApart(fighter, me) <= lurk.radius && Math.abs(floorOf(me) - floorOf(fighter)) <= lurk.floor;
  if (near || (lurk.wake && regionContains(lurk.wake, hipX(me), hipZ(me), floorOf(me)))) startRise(world, aware, mind, fighter, near ? 'near' : 'passing');
}

/** What each man is up to, for a look: [{ id, name, kind, state, since, at, aware: the letter }]. */
export function awarenessReport(world) {
  const aware = world.stage?.aware;
  if (!aware) return [];
  return aware.minds.filter(Boolean).map((mind) => {
    const fighter = world.fighters[mind.id];
    return { id: mind.id, spawn: fighter.spawn.id, name: fighter.body.inputs.name, kind: mind.kind, state: mind.state, since: Number(mind.since.toFixed(2)), dormant: Boolean(fighter.dormant), at: [Number(hipX(fighter).toFixed(2)), Number(hipZ(fighter).toFixed(2))] };
  });
}

/** The state of one man, by fighter id. */
export const mindState = (world, id) => world.stage?.aware?.minds[id]?.state;

const LETTER = { lurk: 'L', rise: 'U', idle: 'I', patrol: 'P', aggro: 'A', charge: 'H', search: 'S', return: 'R', flee: 'F', cower: 'C', follow: 'f', stayed: 's', down: 'x' };
/** The letter for a state, for an overlay. */
export const stateLetter = (state) => LETTER[state] ?? '?';

/** Put a man in a state, and his body to match: driven (relaxed, the awareness steering) or the fight AI's. */
function setState(world, aware, mind, fighter, state, why = '') {
  if (mind.state === state && mind.set) return;
  const before = mind.state;
  mind.state = state;
  mind.since = world.time;
  mind.go = null;
  mind.set = true;
  if (aware.log.length >= 200) aware.log.shift();
  aware.log.push({ time: Number(world.time.toFixed(2)), id: mind.id, from: before, to: state, why });
  // (A whipping's mark is let go: focusAny, set on the victim, is the player's lock's otherwise.)
  if (mind.torment) fighter.focusAny = undefined;
  if (state === 'aggro') {
    fighter.driven = false;
    fighter.walking = false;
    fighter.goTo = null;
    fighter.move = 0;
    fighter.running = false;
    fighter.focus = undefined;
    return;
  }
  fighter.driven = true;
  fighter.walking = true;
  fighter.focus = undefined;
  if (state !== 'cower' && fighter.crawling && fighter.state === 'up' && mind.kind !== 'guard') fighter.crawling = false;
}

// ---- Seeing --------------------------------------------------------------------------------

/** How far this man sees (m) ahead: his post's `vision` (until he is `roused`), his section's, or the radius dimmed by its light. */
function rangeOf(aware, world, fighter, roused = false) {
  const own = aware.minds[fighter.id]?.vision;
  if (own && !roused) return own;
  const section = fighter.spawn ? sectionById(world.stage.def, fighter.spawn.section) : null;
  if (section?.vision !== undefined) return section.vision;
  const light = section?.light ?? 1;
  const config = aware.config;
  return config.radius * (config.darkest + (1 - config.darkest) * Math.max(0, Math.min(1, light)));
}

/**
 * Whether `fighter` sees `target` now: in range, the target inside the cone of his sight (full angle
 * `cone` degrees about his yaw), and no wall or ledge between the two heads. `cone` 360 is all round.
 */
export function sees(world, fighter, target, range, cone) {
  const dx = hipX(target) - hipX(fighter);
  const dz = hipZ(target) - hipZ(fighter);
  const apart = Math.hypot(dx, dz);
  if (apart > range) return false;
  if (apart > 0.05 && cone < 360) {
    const ahead = (Math.cos(fighter.yaw) * dx - Math.sin(fighter.yaw) * dz) / apart;
    if (ahead < Math.cos((cone * Math.PI) / 360)) return false;
  }
  return !rayBlocked(world.arena.terrain, [hipX(fighter), hipZ(fighter)], [hipX(target), hipZ(target)], eyeY(fighter), eyeY(target));
}

/** Whether two men have a clear line between their heads, whichever way they face. */
function lineBetween(world, first, second) {
  return !rayBlocked(world.arena.terrain, [hipX(first), hipZ(first)], [hipX(second), hipZ(second)], eyeY(first), eyeY(second));
}

/** The cone (full angle) a guard sees by now. */
function coneOf(aware, fighter, mind) {
  if (mind.state === 'search') return aware.config.searchCone;
  return fighter.body.gear.headLocked ? aware.config.slitCone : aware.config.cone;
}

/** Whom the unaware may notice: the player, and any follower who is fighting. Cached for the step. */
function targetsOf(world, aware) {
  if (aware.targetsAt === world.time) return aware.targets;
  aware.targetsAt = world.time;
  const player = world.fighters[0];
  aware.targets = world.fighters.filter((fighter) => (fighter === player ? fighter.state !== 'out' : upright(fighter) && aware.minds[fighter.id]?.kind === 'ally' && aware.minds[fighter.id].state === 'aggro'));
  return aware.targets;
}

/** Whether the player is sprinting past unnoticed now: in run mode, or within AWARE.sprintGrace s of it (AWARE.sprintUnseen). */
export function sprintUnseen(world, aware = world.stage?.aware) {
  return Boolean(aware?.config.sprintUnseen) && world.time - aware.sprintAt < aware.config.sprintGrace + 1e-9;
}

/** The first of the targets this man sees ahead of him or notices close by (any way he faces), or null. A sprinting player is not one of them. */
function spot(world, aware, fighter, mind) {
  const range = rangeOf(aware, world, fighter);
  const cone = coneOf(aware, fighter, mind);
  const me = world.fighters[0];
  const player = sprintUnseen(world, aware) ? me : null;
  for (const target of targetsOf(world, aware)) {
    if (target === fighter || target === player) continue;
    const low = target === me && me.crawling ? aware.config.crawlSight : 1;
    if (sees(world, fighter, target, range * low, cone)) return target;
    if (Math.abs(floorOf(target) - floorOf(fighter)) < 1.5 && sees(world, fighter, target, aware.config.nearSense * low, 360)) return target;
  }
  return null;
}

/**
 * How far the player's noise carries now (m, before walls): his pace (AWARE.hear.pace m for each m/s over `quiet`), his harness, his knees; a hard
 * landing a moment ago is louder. Worked out once a step.
 */
function playerNoise(world, aware) {
  if (aware.noiseAt === world.time) return aware.noise;
  aware.noiseAt = world.time;
  const me = world.fighters[0];
  const hear = aware.config.hear;
  let noise = 0;
  if (me && me.state !== 'out' && !me.dormant) {
    const pace = Math.hypot(me.rootVelocity?.[0] ?? 0, me.rootVelocity?.[1] ?? 0);
    const body = me.body;
    const harness = body.bodyMassKg > 0 ? (body.gearKg ?? 0) / body.bodyMassKg : 0;
    if (pace > hear.quiet) noise = Math.min(hear.most, pace * hear.pace * (1 + hear.armour * harness) * (me.crawling ? hear.crawl : 1));
    if (me.landedAt !== undefined && world.time - me.landedAt < hear.seconds) noise = Math.max(noise, hear.fall);
  }
  aware.noise = noise;
  return noise;
}

/** Whether this man hears the player now: within his noise's reach on about the same floor, a wall between cutting it to `hear.through`. */
function heardPlayer(world, aware, fighter) {
  const me = world.fighters[0];
  const noise = playerNoise(world, aware);
  if (!noise || Math.abs(floorOf(me) - floorOf(fighter)) > 3) return false;
  const apart = flatApart(fighter, me);
  if (apart > noise) return false;
  return apart <= noise * aware.config.hear.through || lineBetween(world, fighter, me);
}

// ---- Alarm ----------------------------------------------------------------------------------

/** A guard turns aggro: the fight AI has him; he shouts (unless he was himself called, `why` shout). */
function alarm(world, aware, mind, fighter, why, target = null) {
  if (mind.state === 'aggro' || mind.state === 'down' || mind.state === 'rise') return;
  // Buried: he comes up first (stepRise alarms him as he stands).
  if (mind.state === 'lurk') {
    startRise(world, aware, mind, fighter, why);
    return;
  }
  const at = target ?? world.fighters[0];
  setState(world, aware, mind, fighter, 'aggro', why);
  mind.seenAt = world.time;
  mind.lastSeen = { x: hipX(at), z: hipZ(at), y: floorOf(at) };
  mind.trail = [[hipX(fighter), hipZ(fighter), floorOf(fighter)]];
  if (why !== 'shout') shout(world, aware, mind, fighter);
  if (mind.alarm) raiseAlarm(world, aware, mind);
}

/**
 * A post's alarm (`spawn.alarm`, a name shared by the men of one post: the drawbridge's archers, its guards and the knight on the ledge): one of them
 * aggro makes every awake man of it aggro, wherever he stands (a horn, a shout from the walls), and they know where he was seen.
 */
function raiseAlarm(world, aware, mind) {
  for (const other of aware.minds) {
    if (!other || other === mind || other.alarm !== mind.alarm || other.state === 'aggro' || other.state === 'down') continue;
    const friend = world.fighters[other.id];
    if (friend.dormant || !upright(friend)) continue;
    alarm(world, aware, other, friend, 'shout', null);
    other.lastSeen = mind.lastSeen;
  }
}

/**
 * A scene sends a man at the player (levelmode/ending.js: the horde in the chapel, the epilogue's men in the drain, Noname as the player drops in): aggro
 * now, and he hunts (`mind.hunt`: he always knows where the player is, in the ghost walk too, and never gives the chase up). `post`: his post from now on
 * (a man let out of a holding place has none of his own). `way`: points [x, z] he may run by when the straight line to the player is walled (round an
 * altar, through a door), as he may by the player's own route. False for a man who is not a guard or is out.
 */
export function rouse(world, id, { post = null, way = null } = {}) {
  const aware = world.stage?.aware;
  const mind = aware?.minds[id];
  const fighter = world.fighters[id];
  if (!mind || mind.kind !== 'guard' || fighter.state === 'out') return false;
  mind.hunt = true;
  mind.way = way;
  mind.slept = false;
  if (post) mind.post = [...post];
  if (mind.state !== 'aggro') alarm(world, aware, mind, fighter, 'roused');
  return true;
}

/** The shout: unaware men within reach with a clear line to the shouter turn aggro. */
function shout(world, aware, mind, fighter) {
  const config = aware.config;
  for (const other of aware.minds) {
    if (!other || other === mind || other.kind !== 'guard' || other.state === 'aggro' || other.state === 'down') continue;
    const friend = world.fighters[other.id];
    if (!upright(friend) || flatApart(friend, fighter) > config.shoutRadius || Math.abs(floorOf(friend) - floorOf(fighter)) > 4) continue;
    if (lineBetween(world, friend, fighter)) {
      alarm(world, aware, other, friend, 'shout', null);
      other.lastSeen = mind.lastSeen;
    }
  }
}

// ---- The events: blows, harm, noise -------------------------------------------------------------

function readEvents(world, aware) {
  const events = world.events;
  if (aware.cursor > events.length) aware.cursor = events.length;
  const time = world.time;
  for (; aware.cursor < events.length; aware.cursor += 1) {
    const event = events[aware.cursor];
    // Two bodies that run into each other: each knows, if the other is a foe.
    if (event.kind === 'bump' || event.kind === 'crash') {
      for (const [one, two] of [[event.attacker, event.defender], [event.defender, event.attacker]]) {
        const mind = aware.minds[one];
        const other = world.fighters[two];
        if (mind && other && mind.kind === 'guard' && other.corner === 'red' && !world.stage.ghost && !(other === world.fighters[0] && sprintUnseen(world, aware))) alarm(world, aware, mind, world.fighters[one], 'bump', other);
      }
      continue;
    }
    if (event.kind !== 'landed' && event.kind !== 'blocked' && event.kind !== 'shot' && event.kind !== 'arrow') continue;
    const defender = world.fighters[event.defender];
    if (!defender) continue;
    const attacker = world.fighters[event.attacker];
    const mind = aware.minds[defender.id];
    // A whipping (a guard's `torment`) is no alarm to anyone: the place is used to it.
    const tormentor = aware.minds[event.attacker];
    if (tormentor?.torment && tormentor.state !== 'aggro' && tormentor.victim === defender.id) continue;
    // A civilian or prisoner the player's side wounded.
    if (event.kind === 'landed' && defender.corner === 'grey' && attacker?.corner === 'red') world.stage.civiliansHarmed = true;
    if (!mind) {
      aware.clashes.push({ x: hipX(defender), z: hipZ(defender), y: floorOf(defender), time, by: event.attacker });
      continue;
    }
    // Hit, or blocked: the man knows. A guard fights; an ally answers; a civilian runs.
    if (mind.kind === 'guard') alarm(world, aware, mind, defender, 'hit', attacker);
    else if (mind.kind === 'ally') {
      // A comrade struck by the player (friendly fire is real: a blow, a stray arrow) does not turn on him: he flinches as the blow
      // makes him (the physics), is not brought into a fight he has none in, goes on following, and says so (team.js 'Watch it!').
      if (attacker === world.fighters[0]) aware.struckAlly = { id: defender.id, time };
      else engage(world, aware, mind, defender, 'hit');
    }
    else mind.hurtAt = time;
    aware.clashes.push({ x: hipX(defender), z: hipZ(defender), y: floorOf(defender), time, by: event.attacker });
  }
  const keep = time - aware.config.noiseSeconds - 1;
  if (aware.clashes.length && aware.clashes[0].time < keep) aware.clashes = aware.clashes.filter((clash) => clash.time >= keep);
}

/** The latest clash within `radius` m of a man (same floor), no older than `seconds`, or null. */
function clashNear(aware, world, fighter, radius, seconds) {
  const x = hipX(fighter);
  const z = hipZ(fighter);
  const y = floorOf(fighter);
  for (let index = aware.clashes.length - 1; index >= 0; index -= 1) {
    const clash = aware.clashes[index];
    if (world.time - clash.time > seconds) return null;
    const apart = Math.hypot(clash.x - x, clash.z - z);
    if (Math.abs(clash.y - y) >= 3 || apart >= radius) continue;
    // (Through a wall the noise carries a share of the way: AWARE.hear.through.)
    if (apart < radius * aware.config.hear.through || !rayBlocked(world.arena.terrain, [x, z], [clash.x, clash.z], eyeY(fighter), clash.y + 1.5)) return clash;
  }
  return null;
}

// ---- The player's route ----------------------------------------------------------------------------

function keepTrail(world, aware) {
  const player = world.fighters[0];
  if (world.time < aware.trailAt) return;
  aware.trailAt = world.time + 0.1;
  const x = hipX(player);
  const z = hipZ(player);
  const trail = aware.trail;
  const last = trail[trail.length - 1];
  if (last && Math.hypot(x - last.x, z - last.z) < aware.config.trailStep) return;
  // A jump (a respawn at a rest): the old route leads nowhere.
  if (last && Math.hypot(x - last.x, z - last.z) > 8) trail.length = 0;
  const from = trail[trail.length - 1];
  trail.push({ x, z, y: floorOf(player), s: from ? from.s + Math.hypot(x - from.x, z - from.z) : 0 });
  if (trail.length > aware.config.trailMax) trail.shift();
}

// ---- The step -------------------------------------------------------------------------------------------

/**
 * Call every step (updateStage does): reads the new events, keeps the player's route, and lets each man
 * whose turn it is (about 5 times a second, on his own beat) look and decide. Cheap between looks.
 */
export function updateAwareness(world) {
  const aware = world.stage?.aware;
  if (!aware) return;
  const time = world.time;
  if (world.fighters[0]?.runMode) aware.sprintAt = time;
  readEvents(world, aware);
  keepTrail(world, aware);
  for (const mind of aware.minds) {
    if (mind?.state === 'rise' && !world.fighters[mind.id].dormant) stepRise(world, aware, mind, world.fighters[mind.id]);
    if (!mind || time < mind.next) continue;
    mind.next = time + aware.config.every;
    look(world, aware, mind, world.fighters[mind.id]);
  }
}

function look(world, aware, mind, fighter) {
  if (fighter.dormant) {
    mind.slept = true;
    return;
  }
  if (mind.slept) {
    mind.slept = false;
    // Left in the middle of a chase, a fright or a hunt: that is over.
    if (mind.state === 'aggro' || mind.state === 'search') setState(world, aware, mind, fighter, 'return', 'woke');
    else if (mind.state === 'flee' || mind.state === 'cower') setState(world, aware, mind, fighter, 'return', 'woke');
  }
  aware.looks += 1;
  if (fighter.state === 'out') {
    if (mind.state !== 'down') {
      mind.state = 'down';
      mind.since = world.time;
      fighter.driven = false;
    }
    return;
  }
  if (fighter.state !== 'up') return;
  if (mind.kind === 'guard') lookGuard(world, aware, mind, fighter);
  else if (mind.kind === 'ally') lookAlly(world, aware, mind, fighter);
  else lookNeutral(world, aware, mind, fighter);
}

// ---- Walking about --------------------------------------------------------------------------------------

/**
 * Go toward (x, z): 'arrived' within `arrive` m, 'stuck' if three seconds have not brought him 0.3 m nearer, else 'going'.
 */
function goStep(world, mind, fighter, x, z, speed, running = false) {
  const aim = mind.go;
  const distance = Math.hypot(x - hipX(fighter), z - hipZ(fighter));
  if (!aim || Math.hypot(aim.x - x, aim.z - z) > 0.5) mind.go = { x, z, best: distance, time: world.time };
  else if (distance < aim.best - 0.3) {
    aim.best = distance;
    aim.time = world.time;
  }
  if (distance < AWARE.arrive) return 'arrived';
  if (world.time - mind.go.time > 3) return 'stuck';
  head(fighter, x, z, speed, running);
  return 'going';
}

/** Back to his post, then to his round or to standing. */
function settle(world, aware, mind, fighter) {
  setState(world, aware, mind, fighter, mind.patrol && mind.kind !== 'captive' ? 'patrol' : 'idle', 'home');
  mind.leg = 0;
  mind.step = 1;
  mind.pauseUntil = 0;
}

function doIdle(world, aware, mind, fighter) {
  // Shoved from his post: back to it.
  if (Math.hypot(mind.post[0] - hipX(fighter), mind.post[2] - hipZ(fighter)) > 2) {
    setState(world, aware, mind, fighter, 'return', 'displaced');
    return;
  }
  stand(fighter, mind.facing);
}

function doPatrol(world, aware, mind, fighter) {
  const path = mind.patrol;
  const [x, z] = path[mind.leg];
  if (world.time < mind.pauseUntil) {
    stand(fighter, mind.heading ?? mind.facing);
    return;
  }
  const result = goStep(world, mind, fighter, x, z, aware.config.patrolSpeed);
  if (result === 'going') return;
  // At the end of a leg (or given it up): stand a while, looking the way he was going; then the next.
  mind.heading = yawToward(x - hipX(fighter), z - hipZ(fighter));
  if (path.length === 1) {
    mind.heading = mind.facing;
  } else {
    if (mind.leg + mind.step < 0 || mind.leg + mind.step >= path.length) mind.step = -mind.step;
    mind.leg += mind.step;
  }
  const [low, high] = aware.config.patrolPause;
  mind.pauseUntil = world.time + low + world.random() * (high - low);
  mind.go = null;
  stand(fighter, mind.heading);
}

/** Walk to a post by the straight line if it is open, else back along the way he came (`mind.trail`). Returns 'arrived' | 'going' | 'stuck'. */
function walkHome(world, mind, fighter, speed) {
  const terrain = world.arena.terrain;
  const [px, py, pz] = mind.post;
  const fx = hipX(fighter);
  const fz = hipZ(fighter);
  const floor = floorOf(fighter);
  // The way back: the latest point he passed that he can walk to; points reached are forgotten.
  while (mind.trail.length && Math.hypot(mind.trail.at(-1)[0] - fx, mind.trail.at(-1)[1] - fz) < 1.2) mind.trail.pop();
  if (mind.trail.length && !walkable(terrain, fx, fz, floor, px, pz, py)) {
    // The farthest back of the last few that is open.
    let pick = mind.trail.length - 1;
    for (let index = Math.max(0, mind.trail.length - 6); index < mind.trail.length; index += 1) {
      const [tx, tz, ty] = mind.trail[index];
      if (walkable(terrain, fx, fz, floor, tx, tz, ty)) {
        pick = index;
        break;
      }
    }
    mind.trail.length = pick + 1;
    const [tx, tz] = mind.trail[pick];
    const result = goStep(world, mind, fighter, tx, tz, speed);
    // Reached it, or could not: on to the next point back.
    if (result !== 'going') mind.trail.pop();
    return 'going';
  }
  return goStep(world, mind, fighter, px, pz, speed);
}

function doReturn(world, aware, mind, fighter) {
  const result = walkHome(world, mind, fighter, aware.config.returnSpeed);
  if (result === 'arrived') settle(world, aware, mind, fighter);
  else if (result === 'stuck' || world.time - mind.since > aware.config.returnGiveUp) {
    // Cannot get home: this is his post now.
    mind.post = [hipX(fighter), floorOf(fighter), hipZ(fighter)];
    mind.trail = [];
    settle(world, aware, mind, fighter);
  }
}

// ---- Guards ------------------------------------------------------------------------------------------------

function lookGuard(world, aware, mind, fighter) {
  const config = aware.config;
  // Ghost walk (a designer's debug, the sandbox): the garrison neither sees nor hears him; a hunt already on is given up.
  if (world.stage.ghost && !mind.hunt) {
    if (mind.state === 'aggro' || mind.state === 'search') setState(world, aware, mind, fighter, 'return', 'ghost');
    if (mind.state === 'idle') (mind.torment ? doTorment : doIdle)(world, aware, mind, fighter);
    else if (mind.state === 'patrol') doPatrol(world, aware, mind, fighter);
    else if (mind.state === 'return') doReturn(world, aware, mind, fighter);
    return;
  }
  if (mind.state === 'lurk') {
    lookLurk(world, aware, mind, fighter);
    return;
  }
  if (mind.state === 'rise') return;
  if (mind.hunt) {
    lookHunt(world, aware, mind, fighter);
    return;
  }
  if (mind.state === 'aggro') {
    lookAggro(world, aware, mind, fighter);
    return;
  }
  // Lying in wait (`ambush`): the player has stepped into his ground (the cesspool's Noname, as he comes over the pit's edge).
  const me = world.fighters[0];
  if (mind.ambush && me.state !== 'out' && !me.dormant && regionContains(mind.ambush, hipX(me), hipZ(me), floorOf(me))) {
    alarm(world, aware, mind, fighter, 'ambush', me);
    return;
  }
  const seen = spot(world, aware, fighter, mind);
  if (seen) {
    alarm(world, aware, mind, fighter, 'saw', seen);
    return;
  }
  // A clash of arms near, or the player himself heard (his steps, his harness, a fall): he goes to see (unless he is already looking for trouble).
  // (A sprint is heard: it is not seen, sprintUnseen, but a man turns to the sound of it.)
  let noise = mind.state === 'search' ? null : clashNear(aware, world, fighter, config.noiseRadius, config.noiseSeconds);
  if (mind.state !== 'search' && !noise && heardPlayer(world, aware, fighter)) {
    noise = { x: hipX(me), z: hipZ(me), y: floorOf(me), time: world.time };
  }
  if (noise && (mind.heardAt ?? -Infinity) < noise.time) {
    mind.heardAt = noise.time;
    mind.lastSeen = { x: noise.x, z: noise.z, y: noise.y };
    mind.trail = [[hipX(fighter), hipZ(fighter), floorOf(fighter)]];
    setState(world, aware, mind, fighter, 'search', 'noise');
    return;
  }
  if (mind.state === 'idle') (mind.torment ? doTorment : doIdle)(world, aware, mind, fighter);
  else if (mind.state === 'patrol') doPatrol(world, aware, mind, fighter);
  else if (mind.state === 'return') doReturn(world, aware, mind, fighter);
  else if (mind.state === 'search') doSearch(world, aware, mind, fighter);
}

/**
 * A whipping (`torment`): at his post, facing his victim, he lays the whip on him in bursts (real strokes: throwPunch at the victim, the thong
 * lashing him, physics/whip.js) until the victim is spared (hurt past `spare`, out, or gone); then he only stands his post.
 */
function doTorment(world, aware, mind, fighter) {
  const torment = mind.torment;
  const victim = world.fighters.find((other) => other.spawn?.id === torment.victim);
  if (!victim || victim.state === 'out' || victim.dormant || hurtShare(victim) >= torment.spare || Math.hypot(mind.post[0] - hipX(fighter), mind.post[2] - hipZ(fighter)) > 2) {
    mind.victim = undefined;
    fighter.focusAny = undefined;
    doIdle(world, aware, mind, fighter);
    return;
  }
  mind.victim = victim.id;
  stand(fighter, yawToward(hipX(victim) - hipX(fighter), hipZ(victim) - hipZ(fighter)));
  // (In his stance, the whip in hand: not the walk's guardless carry.)
  fighter.walking = false;
  if (fighter.punch || world.time < mind.nextAt) return;
  fighter.focus = victim.id;
  fighter.focusAny = true;
  const n = (mind.beats += 1);
  const move = torment.moves[Math.floor(awSteady(fighter.id, n) * torment.moves.length) % torment.moves.length];
  if (!throwPunch(world, fighter, move, torment.zone)) {
    mind.nextAt = world.time + 0.5;
    return;
  }
  // (The first stroke begins a burst.)
  mind.left = (mind.left ?? Math.round(awBetween(torment.burst, awSteady(fighter.id, 0.3)))) - 1;
  if (mind.left > 0) mind.nextAt = world.time + awBetween(torment.every, awSteady(fighter.id, n + 0.5));
  else {
    mind.left = Math.round(awBetween(torment.burst, awSteady(fighter.id, n + 0.25)));
    mind.nextAt = world.time + awBetween(torment.pause, awSteady(fighter.id, n + 0.75));
  }
}

/** A man sent at the player (`rouse`): at a run while he is far (`charge`, driven), the fight AI's once he is near (aggro, and knowing where the player is). */
function lookHunt(world, aware, mind, fighter) {
  const me = world.fighters[0];
  const far = flatApart(fighter, me) > aware.config.chargeTo && Math.abs(floorOf(me) - floorOf(fighter)) < 3;
  if (far && !me.dormant) {
    if (mind.state !== 'charge') setState(world, aware, mind, fighter, 'charge', 'sent');
    const [x, z] = huntAim(world, aware, mind, fighter, me);
    head(fighter, x, z, aware.config.chargeSpeed, true);
    return;
  }
  if (mind.state !== 'aggro') setState(world, aware, mind, fighter, 'aggro', 'near');
  lookAggro(world, aware, mind, fighter);
}

/**
 * Where a man running at the player aims: the player if the straight line is open; else, of his `way` points and the player's own route, the one nearest
 * the player that he can run to straight (the nearest first, so a look costs a ray or a few); else the player all the same.
 */
function huntAim(world, aware, mind, fighter, me) {
  const terrain = world.arena.terrain;
  const fx = hipX(fighter);
  const fz = hipZ(fighter);
  const floor = floorOf(fighter);
  const mx = hipX(me);
  const mz = hipZ(me);
  if (walkable(terrain, fx, fz, floor, mx, mz, floorOf(me))) return [mx, mz];
  const candidates = [];
  for (const [x, z] of mind.way ?? []) candidates.push([x, z, floor]);
  const trail = aware.trail;
  for (let k = trail.length - 1, n = 0; k >= 0 && n < 12; k -= 3, n += 1) candidates.push([trail[k].x, trail[k].z, trail[k].y]);
  candidates.sort((a, b) => Math.hypot(a[0] - mx, a[1] - mz) - Math.hypot(b[0] - mx, b[1] - mz));
  for (const [x, z, y] of candidates) {
    if (Math.hypot(x - fx, z - fz) < 0.8) continue;
    if (walkable(terrain, fx, fz, floor, x, z, y)) return [x, z];
  }
  return [mx, mz];
}

/** The foes an aggro man may know of: the player and the allies, awake and on their feet or down. */
function foesOf(world) {
  return world.fighters.filter((other) => other.corner === 'red' && !other.dormant && other.state !== 'out');
}

function lookAggro(world, aware, mind, fighter) {
  const config = aware.config;
  const terrain = world.arena.terrain;
  // His trail, for the way home.
  const last = mind.trail.at(-1);
  if (!last || Math.hypot(last[0] - hipX(fighter), last[1] - hipZ(fighter)) > 1.4) {
    mind.trail.push([hipX(fighter), hipZ(fighter), floorOf(fighter)]);
    if (mind.trail.length > 90) mind.trail = mind.trail.filter((_, index) => index % 2 === 0 || index === mind.trail.length - 1);
  }
  // Sent at him by a scene: he knows where the man is.
  if (mind.hunt) {
    const me = world.fighters[0];
    mind.seenAt = world.time;
    mind.lastSeen = { x: hipX(me), z: hipZ(me), y: floorOf(me) };
    return;
  }
  const range = rangeOf(aware, world, fighter, true);
  let nearest = null;
  let nearestApart = Infinity;
  for (const foe of foesOf(world)) {
    const apart = flatApart(fighter, foe);
    if (apart > range || apart >= nearestApart) continue;
    // Close enough, he knows where the man is, if there is no wall; else a clear line.
    if (!rayBlocked(terrain, [hipX(fighter), hipZ(fighter)], [hipX(foe), hipZ(foe)], eyeY(fighter), eyeY(foe))) {
      nearest = foe;
      nearestApart = apart;
    } else if (apart < config.meleeSense && Math.abs(floorOf(foe) - floorOf(fighter)) < 1.5) {
      nearest = foe;
      nearestApart = apart;
    }
  }
  if (nearest) {
    mind.seenAt = world.time;
    mind.lastSeen = { x: hipX(nearest), z: hipZ(nearest), y: floorOf(nearest) };
    return;
  }
  // Hurt and broken men are the fight's (fear, crawling); a man is not sent searching on his knees.
  if (fighter.panicked || fighter.crawling || fighter.pain) return;
  if (world.time - mind.seenAt > config.loseSeconds) setState(world, aware, mind, fighter, 'search', 'lost');
}

function doSearch(world, aware, mind, fighter) {
  const config = aware.config;
  const spot = mind.lastSeen ?? { x: hipX(fighter), z: hipZ(fighter) };
  if (!mind.looking) {
    const result = goStep(world, mind, fighter, spot.x, spot.z, config.searchSpeed);
    if (result === 'going' && world.time - mind.since < config.searchGiveUp) return;
    mind.looking = { from: world.time, yaw: fighter.yaw };
  }
  const t = world.time - mind.looking.from;
  if (t > config.lookSeconds) {
    mind.looking = null;
    setState(world, aware, mind, fighter, 'return', 'gave up');
    return;
  }
  // Looks about: a slow sweep either side of the way he was facing.
  stand(fighter, mind.looking.yaw + 1.5 * Math.sin((t / config.lookSeconds) * TWO_PI * 1.25));
}

// ---- Neutral men: civilians and prisoners -----------------------------------------------------------------

/** The flight picked from a point: of the headings round, the free one that goes farthest from `threat`, toward `refuge` or `rear` if given. */
function flight(world, fighter, threat, { refuge = null, rear = null } = {}) {
  const terrain = world.arena.terrain;
  const x = hipX(fighter);
  const z = hipZ(fighter);
  const floor = floorOf(fighter);
  const away = Math.hypot(x - threat[0], z - threat[1]) || 1;
  const awayX = (x - threat[0]) / away;
  const awayZ = (z - threat[1]) / away;
  let best = null;
  let bestScore = -Infinity;
  const toward = (point) => {
    const length = Math.hypot(point[0] - x, point[1] - z) || 1;
    return [(point[0] - x) / length, (point[1] - z) / length];
  };
  const goal = refuge ?? rear;
  const goalWay = goal ? toward(goal) : null;
  for (let index = 0; index < 16; index += 1) {
    const angle = (index / 16) * TWO_PI;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let run = 0;
    let level = floor;
    let edge = false;
    for (let step = 0.5; step <= 6; step += 0.5) {
      const under = floorAt(terrain, x + dx * step, z + dz * step, level + 0.45);
      if (under === -Infinity || under < level - 0.45) {
        edge = true;
        break;
      }
      level = under;
      run = step;
    }
    // He keeps a stride back from an edge.
    if (edge) run = Math.max(0, run - 1);
    // A wall: shorten the run until the line is clear.
    for (let tries = 0; tries < 4 && run > 0 && rayBlocked(terrain, [x, z], [x + dx * run, z + dz * run], floor + 0.6, level + 0.6); tries += 1) run = Math.floor(run / 2 / 0.5) * 0.5;
    const score = Math.min(run, 5) * 0.6 + (dx * awayX + dz * awayZ) * 4 + (goalWay ? (dx * goalWay[0] + dz * goalWay[1]) * (refuge ? 6 : 3) : 0);
    if (run >= 0.5 && score > bestScore) {
      bestScore = score;
      best = { to: [x + dx * run, z + dz * run], run, score };
    }
  }
  return best;
}

/**
 * A prisoner who kneels or weeps where he is kept: no fight sends him running or cowering. On his knees (`kneel`: physics.js's scene kneel), his
 * hands to his face (`hands: 'face'`) or held up where he is chained (`hands`: two world points), bowed `lean`; a sob or a wail now and then.
 */
function lookStill(world, aware, mind, fighter) {
  if (fighter.crawling) fighter.crawling = false;
  stand(fighter, mind.facing);
  fighter.walking = false;
  const kneel = mind.kneel;
  if (kneel) {
    let hands = Array.isArray(kneel.hands) ? kneel.hands : null;
    if (kneel.hands === 'face') {
      // Before his face, a hand either side of it.
      const x = fighter.x;
      const yaw = fighter.yaw;
      const ahead = [Math.cos(yaw), -Math.sin(yaw)];
      const side = [Math.sin(yaw), Math.cos(yaw)];
      const head = [x[P.head * 3], x[P.head * 3 + 1], x[P.head * 3 + 2]];
      hands = [-1, 1].map((sign) => [head[0] + ahead[0] * 0.13 + side[0] * 0.06 * sign, head[1] - 0.04, head[2] + ahead[1] * 0.13 + side[1] * 0.06 * sign]);
    }
    // (Chained: held up at the rings, or `chained` though his hands are at his face: his shackles are heard.)
    const chained = Array.isArray(kneel.hands) || Boolean(kneel.chained);
    fighter.kneel = { share: 1, lean: kneel.lean ?? 0.35, ...(hands ? { hands } : {}), ...(chained ? { chained } : {}) };
  }
  const mourn = mind.mourn;
  if (!mourn || fighter.state !== 'up') return;
  if (!mind.nextAt) mind.nextAt = world.time + awBetween(mourn.every, awSteady(fighter.id, 0));
  if (world.time < mind.nextAt) return;
  const n = (mind.beats += 1);
  mind.nextAt = world.time + awBetween(mourn.every, awSteady(fighter.id, n));
  const strength = awSteady(fighter.id, n + 0.5) < mourn.wail ? 0.85 : 0.45;
  soundVoice(world, fighter, 'grief', strength);
  // His chains shaken as he sobs.
  if (fighter.kneel?.chained && world.ear) soundEvent(world, 'mech', { at: particleAt(fighter, P.neck), kind: 'shackles', state: 'open', strength, id: `shackles${fighter.id}` });
}

function lookNeutral(world, aware, mind, fighter) {
  if (mind.kneel || mind.mourn) {
    lookStill(world, aware, mind, fighter);
    return;
  }
  const config = aware.config;
  // What frightens him: a fight near, an aggro enemy in sight, a blow on himself.
  let threat = null;
  const clash = clashNear(aware, world, fighter, config.fleeRadius, 2);
  if (clash) threat = [clash.x, clash.z];
  if (!threat) {
    for (const other of aware.minds) {
      if (!other || other.kind !== 'guard' || other.state !== 'aggro') continue;
      const guard = world.fighters[other.id];
      if (upright(guard) && flatApart(guard, fighter) < config.seeRadius && Math.abs(floorOf(guard) - floorOf(fighter)) < 3 && lineBetween(world, fighter, guard)) {
        threat = [hipX(guard), hipZ(guard)];
        break;
      }
    }
  }
  if (!threat && mind.hurtAt !== undefined && world.time - mind.hurtAt < 2) {
    const foe = world.fighters.find((other) => other.corner !== 'grey' && other.punch?.target === fighter.id);
    if (foe) threat = [hipX(foe), hipZ(foe)];
  }
  if (threat) mind.threatAt = world.time;
  mind.threat = threat ?? mind.threat;
  if (threat && mind.state !== 'flee' && mind.state !== 'cower') {
    mind.fled = { from: [hipX(fighter), hipZ(fighter)], time: world.time };
    setState(world, aware, mind, fighter, 'flee', 'fight near');
  }
  switch (mind.state) {
    case 'flee': return doFlee(world, aware, mind, fighter, threat);
    case 'cower': return doCower(world, aware, mind, fighter);
    case 'idle': return doIdle(world, aware, mind, fighter);
    case 'patrol': return doPatrol(world, aware, mind, fighter);
    case 'return': return doReturn(world, aware, mind, fighter);
    default: return undefined;
  }
}

function doFlee(world, aware, mind, fighter, threat) {
  const config = aware.config;
  const from = threat ?? mind.threat ?? [hipX(fighter) - Math.cos(fighter.yaw), hipZ(fighter) + Math.sin(fighter.yaw)];
  const refuge = mind.refuge ? [mind.refuge[0], mind.refuge.at(-1)] : null;
  // At the refuge, or run far enough, or out of breath: down where he is.
  const gone = Math.hypot(hipX(fighter) - mind.fled.from[0], hipZ(fighter) - mind.fled.from[1]);
  const arrived = refuge && Math.hypot(refuge[0] - hipX(fighter), refuge[1] - hipZ(fighter)) < 1.5;
  const way = arrived ? null : flight(world, fighter, from, { refuge });
  if (arrived || !way || way.run < 1.2 || gone > config.fleeMax || world.time - mind.fled.time > config.fleeSeconds) {
    setState(world, aware, mind, fighter, 'cower', arrived ? 'refuge' : !way || way.run < 1.2 ? 'cornered' : 'far enough');
    fighter.crawling || startCrawl(world, fighter, 'cowers');
    stand(fighter, fighter.yaw);
    return;
  }
  head(fighter, way.to[0], way.to[1], 1, true);
}

function doCower(world, aware, mind, fighter) {
  const config = aware.config;
  if (!fighter.crawling) startCrawl(world, fighter, 'cowers');
  stand(fighter, fighter.yaw);
  const fight = clashNear(aware, world, fighter, config.calmRadius, config.calmSeconds) || aware.minds.some((other) => other && other.kind === 'guard' && other.state === 'aggro' && flatApart(world.fighters[other.id], fighter) < config.calmRadius && !world.fighters[other.id].dormant);
  if (fight) mind.threatAt = world.time;
  if (world.time - (mind.threatAt ?? mind.since) > config.calmSeconds) {
    fighter.crawling = false;
    setState(world, aware, mind, fighter, 'return', 'calm');
  }
}

// ---- Followers -------------------------------------------------------------------------------------------------

/**
 * A prisoner freed: he is an ally from now on (corner 'red'), and follows the player. `id`: his spawn id
 * ('captive') or his fighter id. Returns false if there is no such man or he is not a prisoner.
 * One whose spawn says `follows: false` is let out and no more: he stays a neutral (grey), keeps to his cell and hides from a fight (the
 * player who goes alone: Dunnottar's). True all the same: he is freed.
 */
export function freePrisoner(world, id) {
  const aware = world.stage?.aware;
  if (!aware) return false;
  const fighter = typeof id === 'number' ? world.fighters[id] : world.fighters.find((each) => each.spawn?.id === id);
  const mind = fighter && aware.minds[fighter.id];
  if (!mind || mind.kind !== 'captive') return false;
  if (mind.follows === false) {
    if (mind.freed) return false;
    mind.freed = true;
    world.events.push({ time: world.time, kind: 'freed', fighter: fighter.id, effects: ['is freed'] });
    return true;
  }
  fighter.corner = 'red';
  fighter.spawn.role = 'ally';
  if (fighter.crawling) fighter.crawling = false;
  mind.kind = 'ally';
  mind.freed = true;
  mind.set = false;
  fighter.mayTarget = (other) => mayFight(world, aware, mind, fighter, other);
  setState(world, aware, mind, fighter, 'follow', 'freed');
  world.events.push({ time: world.time, kind: 'freed', fighter: fighter.id, effects: ['is freed'] });
  return true;
}

/** Followers, in order. */
const followers = (world, aware) => aware.minds.filter((mind) => mind && mind.kind === 'ally' && !world.fighters[mind.id].dormant && world.fighters[mind.id].state !== 'out');

/** Whom a follower may fight: aggro enemies, and anyone who is striking at him. */
function mayFight(world, aware, mind, fighter, other) {
  const theirs = aware.minds[other.id];
  // The boss is the player's alone: the freed stay out of that fight (the duel with Lord Vaelen is one to one).
  if (other.spawn?.role === 'boss') return false;
  if (theirs) return theirs.state === 'aggro';
  return other.punch?.target === fighter.id;
}

/** Fight, or stop fighting: aggro enemies near the player or near him bring a follower in. */
function engage(world, aware, mind, fighter, why) {
  if (mind.state === 'aggro') return;
  mind.back = mind.state === 'stayed' ? 'stayed' : 'follow';
  setState(world, aware, mind, fighter, 'aggro', why);
  mind.engagedAt = world.time;
}

function lookAlly(world, aware, mind, fighter) {
  const config = aware.config;
  const player = world.fighters[0];
  if (!fighter.mayTarget) fighter.mayTarget = (other) => mayFight(world, aware, mind, fighter, other);
  // Shut out of a boss room as it was sealed (stage.js seals): he waits where he is, at its door, until it opens.
  if (sealedOut(world, fighter)) {
    if (mind.state === 'aggro') setState(world, aware, mind, fighter, 'follow', 'sealed out');
    stand(fighter, fighter.yaw);
    return;
  }
  // Is there a fight to join?
  let fight = false;
  for (const other of aware.minds) {
    if (!other || other.kind !== 'guard' || other.state !== 'aggro') continue;
    const guard = world.fighters[other.id];
    if (!upright(guard) || guard.spawn.role === 'boss') continue;
    if (flatApart(guard, fighter) < config.allyReach || (mind.state !== 'stayed' && flatApart(guard, player) < config.allyReach)) {
      fight = true;
      break;
    }
  }
  if (mind.state === 'aggro') {
    // Not the whole of a fight: he stays in it a moment past the last foe, then goes back to following.
    if (fight || world.time - mind.engagedAt < 1.5 || fighter.panicked || fighter.crawling || fighter.pain) {
      if (fight) mind.engagedAt = world.time;
      return;
    }
    setState(world, aware, mind, fighter, mind.back ?? 'follow', 'quiet');
  } else if (fight) {
    engage(world, aware, mind, fighter, 'fight');
    return;
  }
  // Past the chapel gate (the stage's `followStopsAt`) he stays.
  const stops = world.stage.def.followStopsAt;
  if (mind.state !== 'stayed' && stops && regionContains(stops, hipX(fighter), hipZ(fighter), floorOf(fighter))) {
    setState(world, aware, mind, fighter, 'stayed', 'the gate');
  }
  if (mind.state === 'stayed') {
    stand(fighter, mind.stayYaw ?? (mind.stayYaw = fighter.yaw));
    return;
  }
  follow(world, aware, mind, fighter);
}

/** Keep 2.5 to 4 m behind the player along his route, a little more for each follower after the first. */
function follow(world, aware, mind, fighter) {
  const config = aware.config.follow;
  const player = world.fighters[0];
  const terrain = world.arena.terrain;
  const rank = followers(world, aware).findIndex((each) => each === mind);
  const behind = config.min + Math.max(0, rank) * config.spacing;
  const apart = flatApart(fighter, player);
  const px = hipX(player);
  const pz = hipZ(player);
  const fx = hipX(fighter);
  const fz = hipZ(fighter);
  const floor = floorOf(fighter);
  const open = walkable(terrain, fx, fz, floor, px, pz, floorOf(player));
  // Near enough with the way clear: he stands, looking at the player.
  if (open && apart < behind + (config.max - config.min) && Math.abs(floorOf(player) - floor) < 1.5) {
    if (apart < behind - 0.6) {
      // Too close: a step back from him, so as not to stand in his way.
      const length = apart || 1;
      head(fighter, fx + ((fx - px) / length) * 1.5, fz + ((fz - pz) / length) * 1.5, 0.5);
    } else stand(fighter, yawToward(px - fx, pz - fz));
    return;
  }
  const route = aware.trail;
  if (!route.length) {
    head(fighter, px, pz, 1, apart > config.runFrom);
    return;
  }
  // The route: the point `behind` back from the player's end of it; he walks to the farthest of the next few points he can walk to.
  const goal = route[route.length - 1].s - behind;
  let nearest = 0;
  let best = Infinity;
  for (let index = 0; index < route.length; index += 1) {
    const distance = Math.hypot(route[index].x - fx, route[index].z - fz) + Math.abs(route[index].y - floor) * 2;
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  }
  let target = Math.min(route.length - 1, nearest + 1);
  for (let index = Math.min(route.length - 1, nearest + 8); index > nearest; index -= 1) {
    if (route[index].s <= goal + 1 && walkable(terrain, fx, fz, floor, route[index].x, route[index].z, route[index].y)) {
      target = index;
      break;
    }
  }
  if (open && route[target].s > goal + 1) target = route.length - 1;
  head(fighter, route[target].x, route[target].z, 1, apart > config.runFrom);
}

/**
 * Put the followers beside the player (a respawn at a rest, a gate passed): each a little behind him, on his floor.
 * Returns how many were moved.
 */
export function gatherFollowers(world) {
  const aware = world.stage?.aware;
  if (!aware) return 0;
  const player = world.fighters[0];
  const list = aware.minds.filter((mind) => mind && mind.kind === 'ally' && world.fighters[mind.id].state !== 'out');
  list.forEach((mind, index) => {
    const fighter = world.fighters[mind.id];
    const way = player.yaw + Math.PI + (index % 2 ? 0.5 : -0.5);
    placeOnFloor(fighter, hipX(player) + Math.cos(way) * (2.5 + index), hipZ(player) - Math.sin(way) * (2.5 + index), floorOf(player), player.yaw);
    fighter.dormant = undefined;
    mind.state = 'follow';
    mind.set = false;
    setState(world, aware, mind, fighter, 'follow', 'gathered');
  });
  return list.length;
}

/**
 * Before the sections swap (stage.js apply): followers near the player go with him into whichever section is
 * now active, so that none is left dormant behind. One who stands where the swap takes the floor away (the
 * ledge he was crossing belongs to a section that is going quiet) is set down on the player's route a few
 * metres behind him, as a comrade who ran to catch up (`catchUp`): he would fall into the sea else.
 */
export function rehomeFollowers(world, ids) {
  const aware = world.stage?.aware;
  if (!aware || !ids.length) return;
  const player = world.fighters[0];
  const def = world.stage.def;
  let moved = 0;
  let after = null;
  for (const mind of aware.minds) {
    if (!mind || mind.kind !== 'ally') continue;
    const fighter = world.fighters[mind.id];
    // (One who has stayed at the gate stays in his section: he sleeps with it, and wakes standing, rather than be woken over a floor that is gone.)
    if (fighter.state === 'out' || mind.state === 'stayed' || ids.includes(fighter.spawn.section)) continue;
    const apart = flatApart(fighter, player);
    if (apart >= aware.config.rehome) continue;
    fighter.spawn.section = ids[0];
    // (The terrain the swap will leave: is there still a floor under his feet?)
    after ??= stageTerrain(def, ids, world.stage.mechanisms);
    const standing = floorAt(after, hipX(fighter), hipZ(fighter), floorOf(fighter) + 0.6) > floorOf(fighter) - 0.8;
    if (standing || apart >= aware.config.catchUp) continue;
    const spot = aware.trail.length ? trailBehind(aware, aware.config.follow.min + moved * aware.config.follow.spacing) : null;
    if (!spot) continue;
    placeOnFloor(fighter, spot.x, spot.z, spot.y, player.yaw);
    mind.go = null;
    moved += 1;
  }
}

/** The point on the player's route `behind` m back from where he is: { x, z, y }. */
function trailBehind(aware, behind) {
  const route = aware.trail;
  const goal = route[route.length - 1].s - behind;
  for (let index = route.length - 1; index >= 0; index -= 1) if (route[index].s <= goal) return route[index];
  return route[0];
}

// ---- Fear: the garrison runs for its rear, not off the field -----------------------------------------------------

/** The point an enemy of a section runs toward when broken: its `rear` if the section has one. */
function rearOf(world, fighter) {
  const section = sectionById(world.stage.def, fighter.spawn?.section);
  return section?.rear ? [section.rear[0], section.rear.at(-1)] : null;
}

/** ai.js rout, in a stage: a broken man runs along walkable ground, away from the nearest foe and toward his section's rear. True while it has him. */
function routed(world, fighter, opponent) {
  if (!fighter.spawn || !opponent) return false;
  const apart = flatApart(fighter, opponent);
  if (apart > 14) {
    fighter.move = 0;
    fighter.running = false;
    fighter.goTo = null;
    return true;
  }
  const way = flight(world, fighter, [hipX(opponent), hipZ(opponent)], { rear: rearOf(world, fighter) });
  // Cornered: he fights from where he is (the fight AI's cover-up).
  if (!way || way.run < 1) return false;
  head(fighter, way.to[0], way.to[1], 1, fighter.stamina > 0.15);
  return true;
}

/** ai.js escapePoint, in a stage: [x, 0, z] a stride away from `opponent` along walkable ground, or null. */
function escapeFrom(world, fighter, opponent) {
  const way = flight(world, fighter, [hipX(opponent), hipZ(opponent)], { rear: rearOf(world, fighter) });
  return way ? [way.to[0], 0, way.to[1]] : null;
}
