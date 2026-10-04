// Fight AI: reads only what a fighter can see (distance, the opponent's strike
// starting, its own stamina) and issues the same commands a player would,
// choosing from its style's moves those that reach from where it stands.

import { P } from './body.js';
import { MOVES, STRATEGIES, STYLES, moveRange } from './moves.js';
import { chinNow, dropWeapon, nearestOpponent, perform, point, reachOf, staggerShare, startPickup, strikeThreat, throwPunch, toLocal, WORLD } from './physics.js';
import { vec } from './pose.js';
import { WEAPONS } from './weapons.js';

export const AI = {
  // Against a gun: close in (to `within` m, then fight), weaving (rad/s),
  // and charge from `chargeFrom` m, this often a second.
  gunRush: { within: 1.1, weave: 5, chargeFrom: 3, chargePerSecond: 1.5 },
  // Held in a collar tie, how soon a brawler ties up back (per second).
  tieBackPerSecond: 3,
  // A gunman running for room: points `stride` m away in `directions`
  // directions, scored by distance from him, room to the edge (weighted)
  // and not running past him (weighted); a fresh choice every `rethink` s.
  gunKite: { stride: 2.5, directions: 16, wallMargin: 0.7, roomWeight: 0.8, pastWeight: 2.5, rethink: 0.4 },
  bodyShotShare: 0.2,
  // Seconds between attacks; pros throw ~40–60 strikes a round, in bursts.
  restMin: 0.9,
  restRange: 2.0,
  rangeSlack: 0.12,
  // Pelvis-to-pelvis distance beyond arm reach the AI stands at: the lead
  // hand then lands near full extension, when it is fastest.
  rangeExtra: 0.2,
  // Kickers hold a little further out than punchers.
  kickerExtra: 0.15,
  // Charges per second at range, per unit of the style's rush weight: at
  // 0.006 about one every two minutes, more for the charging styles.
  rushPerWeight: 1.5,
  // Pressure spells: how long one lasts, and how often they start per
  // second per unit of the style's pressure share.
  pressureSeconds: 4,
  pressureSpellsPerShare: 0.25,
  // Seeing a strike start and moving: ~0.2 s for an untrained man, ~0.1 s
  // for an elite boxer, who reads the shoulder before the glove moves.
  reactionSeconds: 0.15,
  reactionTrained: 0.08,
  reactionJitter: 0.04,
  // How much more often a straight punch to the head is slipped than the
  // style's overall mix says (the mix includes body shots, which cannot be).
  slipPreference: 3,
  // A game plan lasts this long (s, plus up to `strategyRange`) before a rethink.
  strategySeconds: 20,
  strategyRange: 20,
  strategyMinimum: 6, // s a new plan is kept before hurt or finishing may change it
  // Heavy attacks: extra share when the opponent is hurt and there to be finished.
  finishingHeavy: 0.15,
  neutralDistance: 1.8, // m kept from an opponent who is down or rising
  // The longer weapon: hold this far (m) inside my reach and outside his;
  // he is coming in when the gap closes faster than `closingSpeed` (m/s);
  // then a burst of `burstMin` + up to `burstRange` × burstiness attacks.
  range: { inside: 0.12, outside: 0.25, closingSpeed: 0.4, burstMin: 2, burstRange: 2 },
  // Picking a weapon up: as far as he will go for one (m); it must be this
  // much nearer him than any of them (unless it is at his feet), and not
  // with a blow coming at him; he stoops for it this near (hips to weapon, m).
  // `eagerness`: chance per second, when one is there for the taking, that he goes for it.
  pickup: { enabled: true, maxDistance: 3.5, margin: 0.3, atFeet: 0.7, stoopAt: 0.55, eagerness: 1.5 },
  // A mixed fighter's spells in one style (s, give or take half).
  mix: { seconds: 10 },
  // Holding the last man down: how near his chest (m, hips to chest) to kneel, and how many hold at once.
  pin: { reach: 0.55, pinners: 2 },
  // Fear and confidence: how much stronger one side's shots are than the
  // other's (ratio of threats) makes for full confidence or full fear;
  // how many clean shots felt before experience weighs as much as the look
  // of the man; and what confidence (+1) or fear (−1) does to the fight.
  confidenceRatio: 2.5,
  // Fear per metre of reach the other has on me.
  reachFear: 0.6,
  // His weapon is out of line when it points this far off me (cosine).
  openingAngle: 0.5,
  experienceShots: 3,
  // `cadence`: a confident man works longer and moves less between, fear the reverse.
  confidence: { closer: 0.15, pressure: 1.0, tempo: 0.45, defend: 0.45, heavy: 0.08, cadence: 0.5 },
  // Team fights: a fighter facing an opponent already taken on by this many
  // team-mates looks for another, all else near equal (m of extra distance each).
  crowdPenalty: 0.7,
  // Team-mates keep this far apart (m), and treat one within this far of
  // the line to their man as in the line of fire.
  mateSpacing: 1.0,
  lineOfFire: 0.4,
  pastTarget: 0.45, // m: a team-mate this close behind my man is in the line too
  kickClearance: 1.3, // m: no kicks or knees with a team-mate this close, beside or ahead
  // Facing a longer reach (a sword, a baton, a spear) or a blade: keep out of
  // it, then surge. Outreached by this much (m) or facing an edge or a point
  // with nothing as long in hand, a fighter holds `margin` beyond the other's
  // reach, circling; after a wait (shorter when confident, at once when the
  // other has just thrown and is recovering) he surges in at `surgeSpeed`
  // × footwork, throws a burst of a few quick attacks, and retreats.
  blade: {
    outreachedBy: 0.25, margin: 0.3, slack: 0.12,
    surgeSpeed: 1.8, retreatSpeed: 1.4, surgeSeconds: 1.4,
    stepBackChance: 0.65,
  },
  // Cadence: every fighter alternates spells of moving (circling, nothing
  // thrown but into an opening) and of working (attacking, much of it in
  // quick bursts). Mean spell lengths (s) before the style, plan, temper
  // and nerve stretch them; how widely each fighter's temperament varies
  // (e^±spread on each trait); the gap between attacks in a burst (s); and
  // how readily a moving fighter jumps on an opponent recovering from a miss.
  cadence: { workSeconds: 4.5, moveSeconds: 1.6, spread: 0.45, burstGap: 0.1, openingChance: 0.7 },
  // Numbers: confidence gained per doubling of my side's standing fighters
  // over theirs (lost when outnumbered).
  numbersConfidence: 0.45,
  // A gang: at most this many take on one man at once; the rest hold this
  // far outside their range and circle until a place or another man frees up.
  engageSlots: 3,
  waitingDistance: 0.5,
  // How often (per second) a waiting fighter looks for a less crowded man.
  refocusRate: 0.6,
};

/**
 * The game plan for now: survive when hurt, finish when the opponent is,
 * otherwise a weighted pick that holds for a while.
 */
function chooseStrategy(world, fighter, opponent, dt) {
  // Hurt means after a knockdown, not a passing stun: a plan is held, not flipped.
  const hurt = fighter.hurt > 0;
  const finishing = opponent.hurt > 0 || opponent.state === 'rising';
  fighter.aiStrategyFor = (fighter.aiStrategyFor ?? 0) - dt;
  const held = fighter.aiStrategyFor > AI.strategySeconds + AI.strategyRange - AI.strategyMinimum;
  let next = null;
  if (hurt && fighter.aiStrategy !== 'outboxer' && !held) next = 'outboxer';
  else if (!hurt && finishing && !['pressure', 'brawler'].includes(fighter.aiStrategy) && !held) next = world.random() < 0.5 ? 'pressure' : 'brawler';
  else if (!fighter.aiStrategy || fighter.aiStrategyFor <= 0) next = pick(Object.fromEntries(Object.entries(STRATEGIES).map(([key, plan]) => [key, plan.weight * (STYLES[fighter.style].plans?.[key] ?? 1)])), world.random);
  if (next) {
    if (next !== fighter.aiStrategy) world.events.push({ time: world.time, kind: 'strategy', fighter: fighter.id, strategy: next, effects: [] });
    fighter.aiStrategy = next;
    fighter.aiStrategyFor = AI.strategySeconds + world.random() * AI.strategyRange;
  }
  return STRATEGIES[fighter.aiStrategy];
}

function pick(weights, random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] ?? null;
}

/** One AI decision tick for every fighter not driven by the player. */
export function thinkAll(world, dt, playerIds = new Set()) {
  for (const fighter of world.fighters) {
    if (!playerIds.has(fighter.id)) think(world, fighter, dt);
  }
}

/**
 * The defence that answers this incoming strike, and which way to move:
 * off a straight punch's line, under a hook in the direction it travels,
 * back from an uppercut. Returns { name, side } (side +1 = to the left).
 */
function chooseDefence(fighter, attacker, style, incoming, random) {
  const spec = incoming.spec;
  // The strike comes from its shoulder (or hip): the head goes to the other
  // side of that line, outside the arm. The glove itself starts too near the
  // attacker's chin to say which side it is on.
  const head = toLocal(fighter, point(fighter.x, P.head));
  const root = spec.limb.replace(/Hand|Elbow/, 'Shoulder').replace(/Foot|Knee/, 'Hip');
  const lateral = toLocal(fighter, point(attacker.x, P[root]))[2] - head[2];
  const away = Math.abs(lateral) > 0.02 ? -Math.sign(lateral) : random() < 0.5 ? 1 : -1;
  const name = pickDefence(style, incoming, random);
  // A roll starts on the side the hook comes from and ducks across with it.
  return { name, side: name === 'roll' ? -away : away };
}

function pickDefence(style, incoming, random) {
  const answers = { ...style.defences };
  const spec = incoming.spec;
  if (incoming.zone === 'legs') return answers.check ? 'check' : answers.stepBack ? 'stepBack' : 'guard';
  if (incoming.zone !== 'head') {
    // Head movement does not take a body shot away: elbows and distance do.
    delete answers.slip;
    delete answers.roll;
  } else if (spec.path === 'hook' && answers.roll && random() < 0.8) return 'roll';
  else if (spec.path === 'straight' || spec.path === 'upper') {
    // A straight punch at the head: first choice is to take the head away.
    delete answers.roll;
    if (answers.slip) answers.slip *= AI.slipPreference;
  }
  if (spec.limb.endsWith('Foot')) {
    // Kicks are answered by distance or a high guard; nobody slips a shin.
    delete answers.slip;
    delete answers.roll;
    delete answers.parry;
    delete answers.check;
  } else {
    delete answers.check;
    if (!spec.limb.endsWith('Hand')) delete answers.parry;
  }
  return pick(answers, random) ?? 'guard';
}

/**
 * Who to fight. Whoever just hit me, if it is not the man I am on; a new man
 * when mine is down; otherwise the one I am on. A new man is the nearest one
 * standing, passing over those my team-mates already have in hand.
 */
function chooseFocus(world, fighter) {
  const events = world.events;
  if ((fighter.aiEventCursor ?? 0) > events.length) fighter.aiEventCursor = events.length;
  let hitBy = null;
  for (let index = fighter.aiEventCursor ?? 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== 'landed' && event.kind !== 'blocked' && event.kind !== 'shot') continue;
    feel(world, fighter, event);
    if (event.defender === fighter.id && world.fighters[event.attacker]?.corner !== fighter.corner) {
      hitBy = event.attacker;
      if (event.kind !== 'blocked') fighter.aiLastHit = event.time;
    }
  }
  fighter.aiEventCursor = events.length;
  const current = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (hitBy !== null && hitBy !== fighter.focus && world.fighters[hitBy].state === 'up') {
    fighter.focus = hitBy;
    return world.fighters[hitBy];
  }
  if (current && current.state === 'up') return current;
  const standing = world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up');
  if (!standing.length) {
    fighter.focus = undefined;
    return nearestOpponent(world, fighter);
  }
  const at = point(fighter.x, P.pelvis);
  const score = (other) => {
    const crowd = world.fighters.filter((mate) => mate !== fighter && mate.corner === fighter.corner && mate.focus === other.id && mate.state === 'up').length;
    return vec.length(vec.sub(point(other.x, P.pelvis), at)) + AI.crowdPenalty * crowd;
  };
  const next = standing.reduce((best, other) => (score(other) < score(best) ? other : best));
  if (next.id !== fighter.focus) world.events.push({ time: world.time, kind: 'focus', fighter: fighter.id, target: next.id, effects: [] });
  fighter.focus = next.id;
  return next;
}

/**
 * Team-mates: where to sidestep (+ left) to stay apart and keep the line to
 * my man clear, and whether one stands in that line now.
 */
function teamSpacing(world, fighter, opponent) {
  const at = point(fighter.x, P.pelvis);
  const to = point(opponent.x, P.pelvis);
  const line = vec.sub(to, at);
  const length = vec.length(line) || 1e-6;
  const ahead = vec.scale(line, 1 / length);
  const left = [-ahead[2], 0, ahead[0]];
  let strafe = 0;
  let blocked = false;
  // A kick or knee sweeps wide: it needs a team-mate-free arc beside me too.
  let kickRoom = true;
  for (const mate of world.fighters) {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') continue;
    const offset = vec.sub(point(mate.x, P.pelvis), at);
    const along = vec.dot(offset, ahead);
    const across = vec.dot(offset, left);
    const apart = Math.hypot(offset[0], offset[2]);
    // In the way: between me and him, or crowding him, near the line.
    if (along > 0.1 && along < length + AI.pastTarget && Math.abs(across) < AI.lineOfFire) {
      blocked = true;
      strafe += across >= 0 ? -1 : 1;
    } else if (apart < AI.mateSpacing) strafe += (across >= 0 ? -1 : 1) * (1 - apart / AI.mateSpacing);
    if (apart < AI.kickClearance && along > -0.2) kickRoom = false;
  }
  // Facing turns the line: the fighter's own left is the line's left.
  return { strafe: Math.max(-1, Math.min(1, strafe)), blocked, kickRoom };
}

/** Whether team-mates nearer my man already fill the places to take him on. */
function waitingTurn(world, fighter, opponent) {
  const at = point(opponent.x, P.pelvis);
  const away = (other) => Math.hypot(...[0, 2].map((axis) => point(other.x, P.pelvis)[axis] - at[axis]));
  const mine = away(fighter);
  const closer = world.fighters.filter((mate) => mate !== fighter && mate.corner === fighter.corner && mate.state === 'up' && mate.focus === opponent.id && away(mate) < mine).length;
  return closer >= AI.engageSlots;
}

/** Clean head shots exchanged, as each side's felt threat: what one blow really did, over the chin. */
function feel(world, fighter, event) {
  if (event.kind !== 'landed' || event.target !== 'head' || !event.headDeltaV) return;
  const blend = (memory, value) => ({ sum: (memory?.sum ?? 0) + value, count: (memory?.count ?? 0) + 1 });
  if (event.defender === fighter.id) fighter.aiFelt = blend(fighter.aiFelt, event.headDeltaV / chinNow(fighter));
  if (event.attacker === fighter.id) fighter.aiDealt = blend(fighter.aiDealt, event.headDeltaV / chinNow(world.fighters[event.defender]));
}

/**
 * Confidence, −1 (afraid) to +1 (sure of himself): his best shot against
 * mine, sized up from the look of the man and corrected by what the shots
 * landed so far have actually done. A man whose punches feel weak is pressed;
 * a man who could end it with one is respected.
 */
export function confidence(fighter, opponent, world = null) {
  const judged = (looks, memory) => {
    if (!memory?.count) return looks;
    const weight = memory.count / (memory.count + AI.experienceShots);
    // A clean shot's average, scaled up to a power shot: the jabs are not the threat.
    return looks * (1 - weight) + Math.max(looks * 0.25, 1.6 * (memory.sum / memory.count)) * weight;
  };
  const mine = judged(strikeThreat(fighter, opponent), fighter.aiDealt);
  const theirs = judged(strikeThreat(opponent, fighter), fighter.aiFelt);
  let nerve = Math.log(mine / theirs) / Math.log(AI.confidenceRatio);
  // A longer reach is frightening in itself: he can hit me before I can hit him.
  nerve -= AI.reachFear * Math.max(0, reachOf(opponent) - reachOf(fighter));
  if (world) {
    // Outnumbering is courage; being outnumbered, fear.
    const standing = (corner) => world.fighters.filter((other) => other.corner === corner && other.state !== 'out').length;
    nerve += AI.numbersConfidence * Math.log2(Math.max(1, standing(fighter.corner)) / Math.max(1, standing(opponent.corner)));
  }
  return Math.max(-1, Math.min(1, nerve));
}

/**
 * Whether this fighter must keep out of his opponent's reach: outreached
 * (a sword against fists, a spear against a sword) or facing an edge or a
 * point with nothing as long in his own hands.
 */
export function outreached(fighter, opponent) {
  const theirs = opponent.weapon?.held ? opponent.weapon.spec : null;
  const mine = fighter.weapon?.held ? fighter.weapon.spec : null;
  if (reachOf(opponent) - reachOf(fighter) > AI.blade.outreachedBy) return true;
  const sharp = theirs && Object.values(theirs.harm).some((mix) => (mix.cut ?? 0) + (mix.pierce ?? 0) > 0.3);
  return Boolean(sharp && !(mine && mine.length >= theirs.length - 0.1));
}

/**
 * A weapon lying loose, and nothing in my hands: go and get it, if it is
 * nearer me than any of them and no one stands close enough to hit me
 * while I stoop (or it is at my feet). Walk to it, stoop, take it.
 * Returns whether this fighter is on it.
 */
function goForWeapon(world, fighter, opponent) {
  if (fighter.pickup) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  // Nothing loose on the floor (the usual case): no thought, and no draw on the bout's randomness.
  const loose = world.debris?.some((debris) => debris.kind === 'weapon' && !debris.taken && debris.resting);
  if (!loose || fighter.weapon?.held || fighter.clinch || fighter.pin || fighter.punch || !AI.pickup.enabled) {
    fighter.aiPickupFor = null;
    return false;
  }
  const at = point(fighter.x, P.pelvis);
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const enemies = world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up');
  const attackingMe = enemies.some((other) => other.punch?.target === fighter.id);
  // Still worth it: loose, on the floor, and nearer me than any of them.
  const worth = (debris) => {
    if (!debris || debris.kind !== 'weapon' || debris.taken || !debris.resting) return null;
    const mine = flat(debris.x, at);
    const theirs = enemies.reduce((least, other) => Math.min(least, flat(debris.x, point(other.x, P.pelvis))), Infinity);
    if (mine > AI.pickup.maxDistance || (mine > AI.pickup.atFeet && mine > theirs - AI.pickup.margin)) return null;
    // A gun is no use with him on top of you: only with room to raise it.
    const nearest = enemies.reduce((least, other) => Math.min(least, flat(at, point(other.x, P.pelvis))), Infinity);
    if (WEAPONS[debris.weapon]?.ranged && nearest < (STYLES.handgun.ranged.flee ?? 2.4)) return null;
    return mine;
  };
  let target = world.debris?.[fighter.aiPickupFor];
  let mine = worth(target);
  if (mine === null) {
    fighter.aiPickupFor = null;
    target = null;
    // Not while a blow is coming at me; then, now and then, when one is there for the taking.
    if (attackingMe || world.random() > AI.pickup.eagerness * world.lastDt) return false;
    for (const debris of world.debris ?? []) {
      const distance = worth(debris);
      if (distance !== null && (mine === null || distance < mine)) {
        mine = distance;
        target = debris;
      }
    }
    if (!target) return false;
    fighter.aiPickupFor = target.id;
  }
  fighter.goTo = target.x;
  fighter.strafe = 0;
  fighter.aiCombo = null;
  if (mine > AI.pickup.stoopAt) {
    fighter.move = Math.min(1.4, 0.6 + mine);
    return true;
  }
  fighter.move = 0;
  startPickup(world, fighter, target);
  return true;
}

/**
 * A mixed fighter changes style now and then, between strikes, never to a
 * weapon style: a spell of boxing, then of kicking, of clinching, of pushing.
 */
function switchMix(world, fighter, dt) {
  const mix = STYLES[fighter.mixed]?.mix;
  if (!mix || fighter.punch || fighter.clinch || fighter.weapon?.held) return;
  fighter.mixFor = (fighter.mixFor ?? AI.mix.seconds * (0.5 + world.random())) - dt;
  if (fighter.mixFor > 0) return;
  const others = mix.filter((key) => key !== fighter.style);
  const next = others[Math.floor(world.random() * others.length)];
  fighter.style = next;
  fighter.mixFor = AI.mix.seconds * (0.5 + world.random());
  fighter.aiCombo = null;
  world.events.push({ time: world.time, kind: 'styleSwitch', fighter: fighter.id, style: next, effects: [`switches to ${STYLES[next].label}`] });
}

/** Spread of one temperament trait round 1: e^(±spread). */
function trait(random) {
  return Math.exp((random() * 2 - 1) * AI.cadence.spread);
}

/**
 * A fighter's own cadence for now: how long he moves and how long he works,
 * how much of his work comes in bursts and how far he circles. From his
 * style, his game plan, his own temperament (drawn once, his for the
 * bout) and his nerve: confidence works longer and waits less.
 */
function cadenceOf(world, fighter, style, plan, nerve) {
  fighter.temperament ??= { work: trait(world.random), move: trait(world.random), burst: trait(world.random), mobility: trait(world.random) };
  const own = fighter.temperament;
  const base = { work: 1, move: 1, burst: 0.5, mobility: 0.5, ...style.cadence };
  const tilt = plan.cadence ?? {};
  return {
    work: AI.cadence.workSeconds * base.work * (tilt.work ?? 1) * own.work * Math.exp(AI.confidence.cadence * nerve),
    move: AI.cadence.moveSeconds * base.move * (tilt.move ?? 1) * own.move * Math.exp(-AI.confidence.cadence * nerve),
    burst: Math.min(1, base.burst * (tilt.burst ?? 1) * own.burst),
    mobility: Math.min(1, base.mobility * (tilt.mobility ?? 1) * own.mobility),
    opening: AI.cadence.openingChance * (tilt.opening ?? 1),
    nerve,
  };
}

/** Draw how long a phase lasts: around its mean, never instant. */
function phaseLength(random, mean) {
  return mean * (0.4 + 1.2 * random());
}

/**
 * Move or work. Moving, a fighter circles at his distance and throws
 * nothing unless an opening shows; working, he attacks, much of it in
 * bursts. Facing a longer reach or a blade (`wary`), moving means holding
 * outside that reach, working means a surge in for one burst, and a
 * retreat follows. Sets the fighter's footwork; returns whether he may
 * start an attack now.
 */
function cadenceStep(world, fighter, opponent, { distance, range, wary, cadence, dt }) {
  const random = world.random;
  const blade = AI.blade;
  const safe = reachOf(opponent) + fighter.body.lengths.headRadius + blade.margin;
  const myRange = reachOf(fighter) + opponent.body.lengths.headRadius;
  let phase = fighter.aiCadence;
  // The longer weapon: hold at the edge of his reach, inside mine; answer
  // whoever steps in with a burst; step back when pressed.
  const outreaching = !wary && fighter.weapon?.held && reachOf(fighter) - reachOf(opponent) > blade.outreachedBy;
  if (outreaching) return holdTheRange(world, fighter, opponent, distance, cadence, dt);
  const start = (name, length) => {
    phase = fighter.aiCadence = { name, t: 0, length, thrownAtStart: fighter.stats.thrown, burstLeft: 0 };
    if (name === 'work' && wary) world.events.push({ time: world.time, kind: 'surge', fighter: fighter.id, effects: [] });
  };
  if (!phase) start('work', phaseLength(random, cadence.work));
  phase.t += dt;
  // Openings: he is recovering from a blow, committed, giving ground, or
  // his weapon's point is off the line to me.
  const offLine = opponent.weapon?.held && (() => {
    const toMe = vec.normalize(vec.sub(point(fighter.x, P.pelvis), point(opponent.x, P.pelvis)));
    const d = opponent.weapon.dir;
    return (d[0] * toMe[0] + d[2] * toMe[2]) / (Math.hypot(d[0], d[2]) || 1) < AI.openingAngle;
  })();
  const recovering = (opponent.punch && opponent.punch.t > opponent.punch.spec.extendUntil) || opponent.committed > 0 || opponent.defence?.name === 'stepBack' || offLine;
  // Afraid, he lets the distance open rather than walk back into range.
  const approach = Math.max(0.3, 1 + Math.min(0, cadence.nerve) * AI.confidence.pressure * 0.5);
  if (phase.name === 'move') {
    // Circle at my distance (out of his reach if he outreaches me).
    const hold = wary ? safe : range;
    if (distance < hold - blade.slack) fighter.move = wary ? -1 : -0.7;
    else if (distance > hold + blade.slack) fighter.move = (wary ? 0.6 : 1) * approach;
    else fighter.move *= Math.exp(-dt * 4);
    fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 1 : -1) * cadence.mobility));
    const opening = recovering && random() < cadence.opening * dt * 10;
    if ((phase.t > phase.length || opening) && fighter.stamina > (wary ? 0.3 : 0.15)) start('work', wary ? blade.surgeSeconds : phaseLength(random, cadence.work));
    return false;
  }
  if (phase.name === 'retreat') {
    fighter.move = -blade.retreatSpeed;
    if (distance > safe || !wary) start('move', phaseLength(random, cadence.move));
    return false;
  }
  // Working.
  if (wary) {
    fighter.move = distance > myRange * 0.85 ? blade.surgeSpeed : 0.4;
    fighter.strafe = 0;
    const thrown = fighter.stats.thrown - phase.thrownAtStart;
    const hit = (fighter.aiLastHit ?? -Infinity) > world.time - phase.t;
    if (!phase.burstSize) phase.burstSize = 1 + Math.floor(random() * (1 + 3 * cadence.burst));
    if ((thrown >= phase.burstSize && !fighter.punch) || phase.t > phase.length || hit) start('retreat', 0);
    fighter.cooldown = Math.min(fighter.cooldown, AI.cadence.burstGap);
    return true;
  }
  // Sure of himself, he works from closer still: he walks his man down.
  const workRange = range - AI.confidence.closer * Math.max(0, cadence.nerve);
  if (distance > workRange + AI.rangeSlack) fighter.move = approach;
  else if (distance < workRange - AI.rangeSlack * 2 && !fighter.clinch) fighter.move = -0.7;
  else fighter.move *= Math.exp(-dt * 4);
  if (fighter.stamina < 0.25 && distance < range + 0.4) fighter.move = -0.6;
  if (phase.t > phase.length && !fighter.punch && !fighter.aiCombo?.length) start('move', phaseLength(random, cadence.move));
  return true;
}

/**
 * Footwork with the longer weapon: stand just outside his reach and well
 * inside my own, so he must come through my range to reach me. When he
 * steps in (or surges), meet him with a quick burst; when he is inside
 * his own range, give ground. Attacks are thrown whenever he is in reach.
 */
function holdTheRange(world, fighter, opponent, distance, cadence, dt) {
  const spec = AI.range;
  const mine = reachOf(fighter) + opponent.body.lengths.headRadius;
  const his = reachOf(opponent) + fighter.body.lengths.headRadius;
  const hold = Math.min(mine - (STYLES[fighter.style]?.rangeInside ?? spec.inside), Math.max(his + spec.outside, mine * 0.6));
  if (distance < his) fighter.move = -1;
  else if (distance < hold - AI.blade.slack) fighter.move = -0.6;
  else if (distance > hold + AI.blade.slack) fighter.move = 0.8;
  else fighter.move *= Math.exp(-dt * 4);
  fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 1 : -1) * cadence.mobility * 0.5));
  // Coming in: the moment to strike, and to keep striking.
  const closing = (fighter.aiLastGap ?? distance) - distance;
  fighter.aiLastGap = distance;
  const comingIn = distance < mine && (closing > spec.closingSpeed * dt || opponent.aiCadence?.name === 'work');
  if (comingIn && !fighter.punch && !fighter.aiBurst) {
    fighter.aiBurst = { left: spec.burstMin + Math.floor(world.random() * (1 + spec.burstRange * cadence.burst)) };
  }
  if (fighter.aiBurst) {
    fighter.cooldown = Math.min(fighter.cooldown, AI.cadence.burstGap);
    if (fighter.aiBurst.thrown === undefined) fighter.aiBurst.thrown = fighter.stats.thrown;
    if (fighter.stats.thrown - fighter.aiBurst.thrown >= fighter.aiBurst.left || distance > mine + 0.3) fighter.aiBurst = null;
  }
  return true;
}

/**
 * The rest after an attack: in a burst, hardly any; between bursts the
 * style's rest, stretched so that a bursty fighter throws about as much
 * over a round as an even one, only bunched.
 */
function nextGap(world, fighter, style, plan, cadence) {
  const random = world.random;
  const phase = fighter.aiCadence;
  if (phase?.burstLeft > 0) {
    phase.burstLeft -= 1;
    return AI.cadence.burstGap;
  }
  const size = random() < cadence.burst ? 1 + Math.floor(random() * (1 + 3 * cadence.burst)) : 0;
  if (phase) phase.burstLeft = size;
  return restAfterAttack(fighter, style, random) * plan.tempo * (1 + size * 0.6);
}

/**
 * The last man of his side is down: kneel over him and hold him there. Go
 * to his side, level with his chest, and take hold once there. Returns
 * whether this fighter is on it (false: stand off as usual).
 */
function holdDown(world, fighter, opponent) {
  if (fighter.pin) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  if (world.rules?.noPins) return false;
  const lastOfSide = world.fighters.filter((other) => other.corner === opponent.corner && other.state !== 'out').length === 1;
  if (!lastOfSide || (opponent.state !== 'down' && opponent.state !== 'rising')) return false;
  const holding = world.fighters.filter((other) => other.pin?.target === opponent.id).length;
  if (holding >= AI.pin.pinners) return false;
  // Beside his chest, a forearm's length off the line of his body.
  const chest = vec.lerp(point(opponent.x, P.pelvis), point(opponent.x, P.neck), 0.6);
  const at = point(fighter.x, P.pelvis);
  const apart = Math.hypot(chest[0] - at[0], chest[2] - at[2]);
  fighter.strafe = 0;
  if (apart > AI.pin.reach) {
    fighter.move = Math.min(1, (apart - AI.pin.reach) * 2 + 0.3);
    return true;
  }
  fighter.move = 0;
  perform(world, fighter, 'pin');
  return true;
}

/**
 * A gun keeps away. Closer than `flee` (m), he turns and runs for the most
 * open ground, round him and never into a corner, until he has `flee` plus
 * `rest` again; then he turns, takes the stance, gun up on him in both
 * hands, and fires as he backs away.
 */
function gunfight(world, fighter, opponent, distance, gun, dt) {
  // Shoot while there is time for a shot before he arrives; run when there
  // is not. Not for ever: a man as fast as you is never outrun, so after a
  // spell of running, turn and shoot.
  const me = point(fighter.x, P.pelvis);
  const toMe = vec.normalize([me[0] - opponent.x[P.pelvis * 3], 0, me[2] - opponent.x[P.pelvis * 3 + 2]]);
  const theirs = [opponent.rootVelocity[0], 0, opponent.rootVelocity[1]];
  const mine = [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]];
  const closing = Math.max(0.3, vec.dot(vec.sub(theirs, mine), toMe));
  const timeLeft = (distance - gun.close) / closing;
  const standing = world.time < (fighter.aiStandUntil ?? -1);
  if (distance < gun.flee && timeLeft < gun.shotSeconds && !standing && !fighter.aiFleeing) {
    fighter.aiFleeing = true;
    fighter.aiFleeSince = world.time;
  } else if (fighter.aiFleeing && (distance > gun.flee + gun.rest || world.time - fighter.aiFleeSince > gun.runFor)) {
    fighter.aiFleeing = false;
    fighter.aiStandUntil = world.time + gun.standFor;
  }
  if (fighter.aiFleeing && !fighter.punch) {
    fighter.aimAt = undefined;
    fighter.aiEscapeAge = (fighter.aiEscapeAge ?? Infinity) + dt;
    if (!fighter.aiEscape || fighter.aiEscapeAge > AI.gunKite.rethink) {
      fighter.aiEscape = escapePoint(world, fighter, opponent);
      fighter.aiEscapeAge = 0;
    }
    fighter.goTo = fighter.aiEscape;
    fighter.move = 1;
    fighter.running = true;
    return;
  }
  // Stood off: the stance, the gun on him, backing away while he can.
  fighter.aimAt = opponent.id;
  const back = point(fighter.x, P.pelvis);
  const away = [back[0] - opponent.x[P.pelvis * 3], back[2] - opponent.x[P.pelvis * 3 + 2]];
  const roomBehind = room(world, [back[0] + away[0] / distance, back[2] + away[1] / distance]);
  fighter.move = roomBehind > AI.gunKite.wallMargin ? -0.6 : 0;
  fighter.strafe = Math.sin(world.time * 0.8 + fighter.id * 1.7) * 0.4;
  if (fighter.punch || fighter.cooldown > 0) return;
  if (teamSpacing(world, fighter, opponent).blocked) return;
  const zone = world.random() < gun.headShare ? 'head' : 'body';
  if (throwPunch(world, fighter, 'shoot', zone)) {
    // From the stance the gun is already up: the shot goes as soon as the sights settle.
    fighter.punch.quick = true;
    fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
  }
}

/** How far a floor point is from the nearest edge of the arena (m). */
function room(world, at) {
  return Math.min(world.arena.halfX - Math.abs(at[0]), world.arena.halfZ - Math.abs(at[1]));
}

/**
 * Where to run: of the points a stride away all round, the one farthest
 * from him, with room behind it, and not past him.
 */
function escapePoint(world, fighter, opponent) {
  const kite = AI.gunKite;
  const me = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const him = [opponent.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2]];
  const toHim = vec.normalize([him[0] - me[0], 0, him[1] - me[1]]);
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < kite.directions; index += 1) {
    const angle = (index / kite.directions) * Math.PI * 2;
    const way = [Math.cos(angle), Math.sin(angle)];
    const limitX = world.arena.halfX - kite.wallMargin;
    const limitZ = world.arena.halfZ - kite.wallMargin;
    const at = [Math.max(-limitX, Math.min(limitX, me[0] + way[0] * kite.stride)), Math.max(-limitZ, Math.min(limitZ, me[1] + way[1] * kite.stride))];
    const fromHim = Math.hypot(at[0] - him[0], at[1] - him[1]);
    const toward = way[0] * toHim[0] + way[1] * toHim[2];
    const score = fromHim + kite.roomWeight * Math.min(room(world, at), 2) - kite.pastWeight * Math.max(0, toward);
    if (score > bestScore) {
      bestScore = score;
      best = [at[0], 0, at[1]];
    }
  }
  return best;
}

export function think(world, fighter, dt) {
  const random = world.random;
  fighter.strafe = 0;
  fighter.running = false;
  fighter.aimAt = undefined;
  if (fighter.state !== 'up') {
    fighter.move = 0;
    return;
  }
  const opponent = chooseFocus(world, fighter);
  if (!opponent) {
    fighter.move = 0;
    return;
  }
  switchMix(world, fighter, dt);
  // A weapon on the floor, and the chance to get it.
  fighter.goTo = null;
  if (goForWeapon(world, fighter, opponent)) return;
  let style = STYLES[fighter.style];
  const nerve = confidence(fighter, opponent, world);
  fighter.aiConfidence = nerve;
  const bold = AI.confidence;
  const basePlan = chooseStrategy(world, fighter, opponent, dt);
  // Confidence presses: closer, more often inside, quicker to throw, slower
  // to cover up, readier to load up. Fear is the reverse.
  const plan = {
    ...basePlan,
    range: basePlan.range - bold.closer * nerve,
    pressure: basePlan.pressure * Math.exp(bold.pressure * nerve),
    tempo: basePlan.tempo * Math.exp(-bold.tempo * nerve),
    defend: basePlan.defend * Math.exp(-bold.defend * nerve),
    heavy: Math.max(0, basePlan.heavy + bold.heavy * nerve),
  };
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  // A man down or getting up is not hit. The last man of his side, down,
  // is held down; anyone else is given room.
  if (opponent.state !== 'up') {
    fighter.aiCombo = null;
    if (holdDown(world, fighter, opponent)) return;
    fighter.move = distance < AI.neutralDistance ? -0.8 : 0;
    return;
  }
  // A gun: keep away and shoot; once he is in close, drop it and fight mixed.
  const gun = style.ranged && fighter.weapon?.held ? style.ranged : null;
  if (gun && distance > gun.close) {
    gunfight(world, fighter, opponent, distance, gun, dt);
    return;
  }
  if (gun) {
    dropWeapon(world, fighter, 'dropped');
    style = STYLES[fighter.style] ?? STYLES.mix;
  }
  // Grabbed by the neck, a brawler grabs back: the mutual tie, trading.
  if (style.attacks.collarTie && !fighter.clinch && !fighter.punch && opponent.clinch?.target === fighter.id && world.random() < AI.tieBackPerSecond * dt) perform(world, fighter, 'collarTie');
  // Facing a gun at a distance, standing off is death: close in, weaving,
  // and charge when near enough.
  const facingGun = !gun && opponent.weapon?.held && opponent.weapon.spec.ranged && opponent.state === 'up';
  if (facingGun && distance > AI.gunRush.within) {
    fighter.move = 1;
    // Flat out all the way in: every stride slower is another shot.
    fighter.running = true;
    fighter.strafe = Math.sin(world.time * AI.gunRush.weave + fighter.id) * 0.8;
    if (!fighter.punch && !fighter.rush && distance < AI.gunRush.chargeFrom && world.random() < AI.gunRush.chargePerSecond * dt) perform(world, fighter, 'rush');
    return;
  }
  const spacing = teamSpacing(world, fighter, opponent);
  fighter.strafe = spacing.strafe;
  // In a gang, wait my turn: only the nearest few take him on.
  const waiting = waitingTurn(world, fighter, opponent);
  if (waiting && random() < AI.refocusRate * dt) fighter.focus = undefined;
  const kicker = (style.attacks.roundhouse ?? 0) + (style.attacks.teep ?? 0) > 0.15;
  // Spells of pressure: for a few seconds the fighter works inside.
  fighter.aiPressure = Math.max(0, (fighter.aiPressure ?? 0) - dt);
  if (fighter.aiPressure === 0 && random() < (style.pressure ?? 0) * plan.pressure * AI.pressureSpellsPerShare * dt) fighter.aiPressure = AI.pressureSeconds;
  const inside = fighter.aiPressure > 0;
  const reach = reachOf(fighter);
  const range = (inside ? reach * 0.75 : reach + opponent.body.lengths.headRadius + AI.rangeExtra + plan.range + (kicker ? AI.kickerExtra : 0)) + (waiting ? AI.waitingDistance : 0);
  // Circling while waiting: round him, a way chosen by who I am.
  if (waiting) fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 0.6 : -0.6)));
  // His own cadence: spells of moving and of working, in bursts; against a
  // longer reach or a blade, held off out of reach between surges.
  const wary = !waiting && !fighter.clinch && outreached(fighter, opponent);
  const cadence = cadenceOf(world, fighter, style, plan, nerve);
  let mayAttack = true;
  if (fighter.clinch && style.clinchDrive) fighter.move = 1;
  else if (waiting || fighter.clinch) {
    if (distance > range + AI.rangeSlack) fighter.move = 1;
    else if (distance < range - AI.rangeSlack * 2 && !fighter.clinch) fighter.move = -0.7;
    else fighter.move *= Math.exp(-dt * 4);
  } else if (!fighter.defence || fighter.defence.name !== 'stepBack') {
    mayAttack = cadenceStep(world, fighter, opponent, { distance, range, wary, cadence, dt });
  }

  // React to a strike once it can be seen coming: after a reaction time
  // that training shortens, and only if not busy throwing one.
  // In a crowd, the strike to answer is whichever is coming at me.
  const striker = world.fighters.find((other) => other.corner !== fighter.corner && other.punch?.target === fighter.id) ?? opponent;
  const incoming = striker.punch;
  if (incoming && fighter.seenPunch !== incoming) {
    fighter.seenPunch = incoming;
    const skill = fighter.body.inputs.exercise;
    fighter.reactAt = AI.reactionSeconds - AI.reactionTrained * skill + (random() - 0.5) * 2 * AI.reactionJitter + (style.reactionSlow ?? 0);
    fighter.reacted = false;
  }
  // Seen from when it starts to move, loading included; not while committed.
  if (incoming && !fighter.reacted && !fighter.punch && !(fighter.committed > 0) && (incoming.age ?? incoming.t) >= fighter.reactAt) {
    fighter.reacted = true;
    // Reeling from a blow, he is slow to cover up.
    const reeling = staggerShare(fighter, WORLD.stagger.defend);
    if (random() < Math.min(0.97, style.defendChance * plan.defend * (0.6 + 0.6 * fighter.body.inputs.exercise) * reeling)) {
      let { name, side } = chooseDefence(fighter, striker, style, incoming, random);
      // A blade coming is got away from, not blocked with an arm.
      if (incoming.spec.path === 'blade' && wary && random() < AI.blade.stepBackChance) name = 'stepBack';
      perform(world, fighter, name, { side, from: striker.id });
      // Slip and fire back: the counter comes while the attacker's hand is out.
      if ((name === 'slip' || name === 'roll') && random() < Math.min(0.9, (style.counter ?? 0) + plan.counter)) {
        fighter.cooldown = Math.min(fighter.cooldown, 0.12);
        fighter.aiCombo = null;
      }
    }
  }

  if (fighter.punch || fighter.rush || !mayAttack) return;
  // Never through a team-mate, and not while waiting a turn.
  if (spacing.blocked || waiting) {
    fighter.aiCombo = null;
    return;
  }
  // The rest of a combination follows as soon as the last hand is back.
  if (fighter.aiCombo?.length) {
    const next = fighter.aiCombo.shift();
    fighter.aiComboStep += 1;
    if (!throwPunch(world, fighter, next, fighter.aiComboZone)) fighter.aiCombo = null;
    else if (!fighter.aiCombo.length) fighter.cooldown = nextGap(world, fighter, style, plan, cadence);
    return;
  }
  fighter.aiComboStep = 0;
  if (fighter.cooldown > 0) return;
  // Choose among the moves that reach from here; in the clinch, knees.
  const choices = {};
  for (const [name, weight] of Object.entries(style.attacks)) {
    const spec = MOVES[name];
    if (fighter.clinch) {
      if (name === 'knee' && spacing.kickRoom) choices[name] = 1;
      continue;
    }
    if (spec.kind === 'rush') {
      // A charge is its own decision, not a fallback when nothing else reaches.
      if (distance > range - 0.1 && distance < range + 1.2 && random() < weight * AI.rushPerWeight * dt) {
        if (throwPunch(world, fighter, name)) fighter.cooldown = AI.restMin + random() * AI.restRange;
        return;
      }
      continue;
    }
    if (spec.kind === 'clinch') {
      // Held by the neck, a brawler grabs back: the mutual tie.
      const heldByHim = opponent.clinch?.target === fighter.id && spec.hands;
      if (distance < fighter.body.reach * 1.05) choices[name] = weight * (heldByHim ? 12 : 2);
      continue;
    }
    if (!spacing.kickRoom && spec.limb.match(/Foot|Knee/)) continue;
    const held = fighter.weapon?.held ? fighter.weapon.spec : null;
    if (spec.reach === 'weapon' && !held) continue;
    const reach = moveRange(spec, fighter.body, held) + opponent.body.lengths.headRadius;
    // Close-range moves only when close; long ones only when there is room.
    if (distance <= reach && (spec.reach !== 'leg' || distance > fighter.body.reach * 0.9)) choices[name] = weight;
  }
  // Holding him by the neck with one hand, the other hammers.
  if (fighter.clinch && style.clinchStrikes) {
    const free = (fighter.clinch.hands ?? ['l', 'r']).length < 2;
    if (free) for (const [name, weight] of Object.entries(style.clinchStrikes)) if (!fighter.clinch.hands.includes(MOVES[name].limb[0])) choices[name] = weight;
  }
  let move = pick(choices, random);
  if (!move) return;
  // Open a combination that starts with a punch that reaches from here.
  let combo = null;
  if (style.combos && !fighter.clinch && random() < (style.comboChance ?? 0)) {
    const openers = Object.fromEntries(Object.entries(style.combos).filter(([sequence]) => choices[sequence.split(' ')[0]]));
    const sequence = pick(openers, random);
    if (sequence) [move, ...combo] = sequence.split(' ');
  }
  // Now and then, one big shot instead: a power strike loaded up and thrown alone.
  const finishing = opponent.hurt > 0 || opponent.stagger > 0;
  const heavy = !fighter.clinch && random() < plan.heavy + (finishing ? AI.finishingHeavy : 0);
  if (heavy) {
    combo = null;
    if (move === 'jab' && choices.cross) move = 'cross';
    if (move === 'teep' && choices.roundhouse) move = 'roundhouse';
  }
  const spec = MOVES[move];
  const zone = spec.zones ? (random() < AI.bodyShotShare ? spec.zones.at(-1) : spec.zones[0]) : null;
  if (throwPunch(world, fighter, move, zone, { heavy })) {
    fighter.aiCombo = combo;
    fighter.aiComboZone = zone;
    fighter.cooldown = combo ? 0 : nextGap(world, fighter, style, plan, cadence);
  }
}

/** Seconds before the next attack: the style's tempo, slower when tired, quicker in the clinch. */
function restAfterAttack(fighter, style, random) {
  const tired = 1.6 - fighter.stamina * 0.6;
  return (AI.restMin + random() * AI.restRange) * tired * (style.tempo ?? 1) * (fighter.clinch ? 0.4 : 1);
}
