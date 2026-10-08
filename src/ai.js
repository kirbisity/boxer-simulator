// Fight AI: reads only what a fighter can see (distance, the opponent's strike
// starting, its own stamina) and issues the same commands a player would,
// choosing from its style's moves those that reach from where it stands.

import { aheadOfSlot, DRILL, fromSlot, moveFormations, walkToSlot } from './formation.js';
import { P } from './body.js';
import { MOVES, STRATEGIES, STYLES, moveRange } from './moves.js';
import { chinNow, collapseAt, concussionCapacity, dropWeapon, fightTier, inFight, legShare, nearestOpponent, perform, point, reachOf, shedStandard, staggerShare, startCrawl, startPickup, strikeThreat, throwPunch, toLocal, WORLD } from './physics.js';
import { vec } from './pose.js';
import { WEAPONS } from './weapons.js';
import { castNet } from './physics/net.js';

export const AI = {
  // Against a gun: close in (to `within` m, then fight), weaving (rad/s),
  // and charge from `chargeFrom` m, this often a second.
  gunRush: { within: 1.1, weave: 5, chargeFrom: 3, chargePerSecond: 1.5 },
  // Held in a collar tie, how soon a brawler ties up back (per second).
  tieBackPerSecond: 3,
  // In a big fight, how often (s) a fighter with nothing happening near him thinks.
  idleThinkEvery: 0.1,
  // Cohesion in a group fight (a side of WORLD.standard.minSide or more):
  // each fighter, deciding for himself as ever, leans slightly towards his
  // side's standard (see keepLeaders). Within `radius` m, plus `radiusPerSqrt`
  // × √(men standing), no pull; beyond it a pull growing to full over `ramp`
  // m: a sideways lean towards him (`strafe`, of a full sidestep) and, run
  // out ahead of him, an easing of the advance (`holdBack`, share of the
  // forward step given up). Never within `engaged` m of reach of his man:
  // the exchange decides then. Choosing whom to fight, a man near my leader
  // counts as `focus` m nearer for each m he is nearer him. A shooter running
  // for room weighs each m a spot lies beyond that ground as `escape` m less
  // distance from his pursuer: the run away still wins, but bends homeward.
  // The retiarius's net: thrown from `from` to `to` m, at `rate` a second while there.
  net: { from: 1.3, to: 3.2, rate: 1.2 },
  // A man going to take up his fallen standard runs to it from further than `runFor` m.
  cohesion: { radius: 2, radiusPerSqrt: 0.75, ramp: 4, strafe: 0.55, holdBack: 0.7, engaged: 1.2, focus: 0.3, escape: 0.3, runFor: 1.5 },
  // Passive: runs from anyone nearer than `safeDistance` m, at a run while stamina is over `runWhile`.
  passive: { safeDistance: 3.5, runWhile: 0.2 },
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
  // A heavy blow (a weapon of `heavyMass` kg or more counts as fully heavy;
  // a loaded heavy strike as `loaded`) is seen and got out of the way of:
  // up to `defend` more likely to be answered, and answered by moving (slip,
  // lean back, step back; weighted up to `move` times, and open to anyone)
  // rather than by blocking (weighted down to `block` of itself).
  evadeHeavy: { heavyMass: 4, loaded: 0.6, defend: 0.6, move: 3, block: 0.4 },
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
  pickup: { enabled: true, maxDistance: 3.5, margin: 0.3, atFeet: 0.7, stoopAt: 0.55, eagerness: 1.5, shieldClear: 2.5 },
  // A mixed fighter's spells in one style (s, give or take half).
  mix: { seconds: 10 },
  // Holding the last man down: how near his chest (m, hips to chest) to kneel, and how many hold at once.
  pin: { reach: 0.55, pinners: 2 },
  // Fear and confidence: how much stronger one side's shots are than the
  // other's (ratio of threats) makes for full confidence or full fear;
  // how many clean shots felt before experience weighs as much as the look
  // of the man; and what confidence (+1) or fear (−1) does to the fight.
  confidenceRatio: 2.5,
  // Fear, panic and adrenaline. `fear` 0..1 follows (over `settle` s) a
  // target made of feeling outmatched (`outmatched` × fear from nerve) and
  // of being hurt (`hurt` × the worst of brain strain, blood lost, gunshot
  // harm and knockdowns, `perKnockdown` each), less the armour's courage.
  // Past `breakAt` he may break (`rate`/s at full fear) into the passive
  // style — unless adrenaline is over `adrenalineHolds`. He comes out once
  // fear is under `calmAt` for `calmSeconds`, or adrenaline surges.
  // Crawling away: a panicked man hurt past `from` (his worst of hurtShare
  // and his legs' damage) goes down on his knees at up to `rate` a second
  // (scaled by how far past), much less with adrenaline in him (`adrenaline`:
  // the share it takes away at full). Crawling, he keeps going away from the
  // nearest enemy, `away` m at a time.
  // He keeps the way he chose for `rethink` s, or till within `arrived` m of it.
  // At a wall he crawls along it only with an enemy within `pressed` m.
  crawl: { from: 0.55, rate: 0.5, adrenaline: 0.9, away: 3, rethink: 1.5, arrived: 0.6, pressed: 2 },
  // `standardDown`: fear, for every man of a side, while its standard lies
  // fallen (or, without one, for `leaderLostFor` s after its leader falls).
  panic: { settle: 1.5, outmatched: 0.5, hurt: 0.85, perKnockdown: 0.22, breakAt: 0.7, rate: 0.6, adrenalineHolds: 0.55, calmAt: 0.4, calmSeconds: 3, standardDown: 0.35, leaderLostFor: 6 },
  // Adrenaline 0..1: a surge on knocking a man down (`knockdown`) or on a
  // very hard blow survived (`hardHit` per unit of severity over `hardFrom`),
  // fading with `halfLife` s; how much a body surges depends on age, size
  // and sex (see adrenalineGain), and it takes away `nerve` of his fear.
  adrenaline: { knockdown: 0.45, hardHit: 0.35, hardFrom: 0.6, halfLife: 35, nerve: 0.6 },
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
  // m: a heavy gun holds its shot at a man with a comrade this near him.
  gunCrowd: 1.2,
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
  // A new plan is kept at least `strategyMinimum` s before it can be flipped.
  const held = world.time - (fighter.aiStrategySince ?? -Infinity) < AI.strategyMinimum;
  let next = null;
  if (hurt && fighter.aiStrategy !== 'outboxer' && !held) next = 'outboxer';
  else if (!hurt && finishing && !['pressure', 'brawler'].includes(fighter.aiStrategy) && !held) next = world.random() < 0.5 ? 'pressure' : 'brawler';
  else if (!fighter.aiStrategy || fighter.aiStrategyFor <= 0) next = pick(Object.fromEntries(Object.entries(STRATEGIES).map(([key, plan]) => [key, plan.weight * (STYLES[fighter.style].plans?.[key] ?? 1)])), world.random);
  if (next) {
    if (next !== fighter.aiStrategy) world.events.push({ time: world.time, kind: 'strategy', fighter: fighter.id, strategy: next, effects: [] });
    fighter.aiStrategy = next;
    fighter.aiStrategyFor = AI.strategySeconds + world.random() * AI.strategyRange;
    fighter.aiStrategySince = world.time;
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
  keepLeaders(world);
  moveFormations(world, dt);
  // In a big fight, a fighter with nothing happening near him thinks ten
  // times a second (each on his own beat) rather than every step.
  const staggered = fightTier(world) >= 3;
  for (const fighter of world.fighters) {
    if (playerIds.has(fighter.id)) continue;
    if (!staggered || fighter.detail === 'full' || fighter.detail === undefined) {
      // Cleared, so that once he is staggered he takes up his own beat.
      fighter.aiOwed = undefined;
      think(world, fighter, dt);
      keepPlace(world, fighter);
      continue;
    }
    // Each on his own beat (offset by his id), so the thinking is spread over the steps.
    fighter.aiOwed = (fighter.aiOwed ?? (fighter.id % 6) * dt) + dt;
    if (fighter.aiOwed < AI.idleThinkEvery - 1e-9) continue;
    think(world, fighter, fighter.aiOwed);
    keepPlace(world, fighter);
    fighter.aiOwed = 0;
  }
}

/**
 * Each side's rallying point (world.leaders), from its standard: the man
 * bearing it (in his hands or on his back), or, fallen, the standard where
 * it lies, and the man nearest it, whose first care is to take it up. A
 * side without a standard follows a leader; when he is out, the man nearest
 * where he fell takes over. Only sides big enough have one (world.standards).
 */
function keepLeaders(world) {
  world.leaders = {};
  for (const [corner, standard] of Object.entries(world.standards ?? {})) {
    const side = world.fighters.filter((fighter) => fighter.corner === corner && inFight(fighter));
    if (!side.length) continue;
    const leader = world.fighters[standard.leader];
    let bearer = null;
    let lying = null;
    if (standard.kind) {
      // A fallen leader lets the standard go: from his hands, or off his back.
      if (leader.state === 'out' && leader.weapon?.held && leader.weapon.spec.flag) dropWeapon(world, leader, 'dropped');
      if (leader.state === 'out' && leader.wornStandard && !leader.wornStandard.shed) shedStandard(world, leader);
      bearer = side.find((fighter) => (fighter.weapon?.held && fighter.weapon.kind === standard.kind) || (fighter.wornStandard && !fighter.wornStandard.shed)) ?? null;
      if (!bearer) {
        lying = world.debris.find((debris) => debris.weapon === standard.kind && !debris.taken && world.fighters[debris.owner]?.corner === corner) ?? null;
        // Lost altogether (it never is, but): the leader as without one.
        if (!lying) standard.kind = null;
      }
    }
    if (!standard.kind) {
      bearer = leader.state === 'out' ? nearestTo(side.filter((fighter) => fighter.state === 'up'), point(leader.x, P.pelvis)) ?? leader : leader;
      if (bearer !== leader) standard.lostAt = world.time;
    }
    if (bearer) standard.leader = bearer.id;
    const at = bearer ? point(bearer.x, P.pelvis) : lying.x;
    // The man going for it keeps going while he can, rather than two turning back and forth.
    const able = side.filter((fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.clinch && !fighter.pin);
    const going = lying && able.find((fighter) => fighter.id === standard.taker);
    const taker = lying ? going ?? nearestTo(able, at) : null;
    standard.taker = taker?.id;
    const shaken = Boolean(lying) || world.time - (standard.lostAt ?? -Infinity) < AI.panic.leaderLostFor;
    world.leaders[corner] = { leader: bearer, at: [at[0], at[2]], standing: side.length, lying, taker, shaken };
  }
}

/** Of these fighters, the one nearest a point. */
function nearestTo(fighters, at) {
  let nearest = null;
  let least = Infinity;
  for (const fighter of fighters) {
    const distance = Math.hypot(fighter.x[P.pelvis * 3] - at[0], fighter.x[P.pelvis * 3 + 2] - at[2]);
    if (distance < least) {
      least = distance;
      nearest = fighter;
    }
  }
  return nearest;
}

/**
 * The standard is down and he is nearest: before anything else, he goes to
 * it and takes it up, his own weapon let fall. Returns whether he is on it.
 */
function takeUpStandard(world, fighter) {
  const side = world.leaders?.[fighter.corner];
  if (!side?.lying || side.taker !== fighter) return false;
  if (fighter.pickup) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  // A blow already on its way is finished first.
  if (fighter.punch) return false;
  const debris = side.lying;
  const distance = Math.hypot(debris.x[0] - fighter.x[P.pelvis * 3], debris.x[2] - fighter.x[P.pelvis * 3 + 2]);
  fighter.goTo = debris.x;
  fighter.strafe = 0;
  fighter.aiCombo = null;
  fighter.aimAt = undefined;
  if (distance > AI.pickup.stoopAt) {
    fighter.move = 1;
    fighter.running = distance > AI.cohesion.runFor;
    return true;
  }
  fighter.move = 0;
  // Still tumbling: he waits over it.
  if (debris.resting) startPickup(world, fighter, debris);
  return true;
}

/**
 * After his own decision: a man in the ranks keeps to his slot (not out
 * past his leash after a blow); anyone else keeps near his side's standard.
 */
function keepPlace(world, fighter) {
  const formation = fighter.slot ? world.formations?.[fighter.formation] : null;
  if (!formation) {
    keepWithLeader(world, fighter);
    return;
  }
  if (fighter.state !== 'up' || fighter.clinch || fighter.pin || fighter.pickup || fighter.panicked || fighter.crawling) return;
  // Out past his leash (after a man, or carried on by a blow): back to his place,
  // still facing them and free to strike and guard as he goes.
  if (aheadOfSlot(fighter, formation) > DRILL.leash) {
    const opponent = fighter.focus === undefined ? null : world.fighters[fighter.focus];
    walkToSlot(fighter, formation, opponent);
    fighter.running = false;
  }
}

/**
 * In the ranks: unless the enemy is on his slot (the front rank's to fight,
 * or anyone's once they are through), he stands in his place facing them.
 * A loaded shooter in the front rank shoots from it; one who has loosed
 * spans again in his place. Returns whether that is what he does.
 */
function holdRank(world, fighter, opponent, style, dt) {
  const formation = fighter.slot ? world.formations?.[fighter.formation] : null;
  if (!formation) return false;
  const distance = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  const weapon = fighter.weapon;
  const gun = style.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent ? style.ranged : null;
  if (gun) {
    // Close enough to need the sword: the ordinary way (the crossbow let fall, the sidearm drawn).
    if (distance <= gun.close) return false;
    const away = walkToSlot(fighter, formation, opponent);
    if (weapon.spec.shot && !weapon.loaded) {
      fighter.reloading = true;
      return true;
    }
    if (!fighter.inFront || fighter.punch || fighter.cooldown > 0 || away > DRILL.leash) return true;
    const zone = world.random() < gun.headShare ? 'head' : 'body';
    if (throwPunch(world, fighter, gun.move ?? 'shoot', zone)) {
      fighter.punch.quick = true;
      fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
    }
    return true;
  }
  const reach = reachOf(fighter) + reachOf(opponent);
  const onHim = opponent.state === 'up' && distance < reach + 0.3;
  const onSlot = opponent.state === 'up' && fromSlot(fighter, formation, opponent) < reach + DRILL.engage;
  if (onHim || (fighter.inFront && onSlot)) return false;
  walkToSlot(fighter, formation, opponent);
  return true;
}

/**
 * Cohesion: after his own decision, a fighter far from his side's standard
 * (or leader) leans a little towards it: a sideways lean, and an easier
 * advance if he has run out ahead of it. Each man decides alone; together a
 * side tends to hold together, its rear not drawn into the front's fight.
 */
function keepWithLeader(world, fighter) {
  const spec = AI.cohesion;
  const side = world.leaders?.[fighter.corner];
  if (!side || side.leader === fighter || side.taker === fighter || fighter.state !== 'up') return;
  // Busy with something of his own: a hold, a blow, a weapon to pick up, a gun's room to find.
  if (fighter.clinch || fighter.pin || fighter.punch || fighter.pickup || fighter.goTo || fighter.panicked) return;
  const foe = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (!foe) return;
  const at = point(fighter.x, P.pelvis);
  const line = [foe.x[P.pelvis * 3] - at[0], 0, foe.x[P.pelvis * 3 + 2] - at[2]];
  const apart = Math.hypot(line[0], line[2]) || 1e-6;
  if (foe.state === 'up' && apart < reachOf(fighter) + reachOf(foe) + spec.engaged) return;
  const offset = [side.at[0] - at[0], 0, side.at[1] - at[2]];
  const distance = Math.hypot(offset[0], offset[2]);
  const pull = Math.min(1, Math.max(0, (distance - spec.radius - spec.radiusPerSqrt * Math.sqrt(side.standing)) / spec.ramp));
  if (pull <= 0) return;
  // His own frame, as he faces his man: the move is along the line, the strafe to its left.
  const forward = [line[0] / apart, 0, line[2] / apart];
  const left = [-forward[2], 0, forward[0]];
  const across = vec.dot(offset, left);
  fighter.strafe = Math.max(-1, Math.min(1, (fighter.strafe ?? 0) + Math.sign(across) * spec.strafe * pull * Math.min(1, Math.abs(across) / distance + 0.2)));
  // Out ahead of the standard, going further: he eases off.
  if (vec.dot(offset, forward) < 0 && fighter.move > 0) fighter.move *= 1 - spec.holdBack * pull;
}

/** How far (m) a spot ([x, z]) lies beyond the ground a fighter keeps near his standard; 0 within it, or out of a group fight. */
function strayFromLeader(world, fighter, at) {
  const spec = AI.cohesion;
  const side = world.leaders?.[fighter.corner];
  if (!side || side.leader === fighter) return 0;
  const distance = Math.hypot(side.at[0] - at[0], side.at[1] - at[1]);
  return Math.max(0, distance - spec.radius - spec.radiusPerSqrt * Math.sqrt(side.standing));
}

/** How far a target is from my side's standard (m), in a group fight; 0 otherwise. */
function fromMyLeader(world, fighter, other) {
  const side = world.leaders?.[fighter.corner];
  if (!side || side.leader === fighter) return 0;
  return Math.hypot(other.x[P.pelvis * 3] - side.at[0], other.x[P.pelvis * 3 + 2] - side.at[1]);
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
  const name = pickDefence(style, incoming, random, heaviness(attacker, incoming));
  // A roll starts on the side the hook comes from and ducks across with it.
  return { name, side: name === 'roll' ? -away : away };
}

/** How heavy an incoming blow is, 0 (a jab) to 1 (a great club, or a strike loaded up). */
function heaviness(striker, incoming) {
  const spec = AI.evadeHeavy;
  const weapon = incoming.spec.path === 'blade' && striker.weapon?.held ? striker.weapon.spec.mass / spec.heavyMass : 0;
  return Math.min(1, Math.max(weapon, incoming.heavy ? spec.loaded : 0));
}

function pickDefence(style, incoming, random, heavy = 0) {
  const answers = { ...style.defences };
  const spec = incoming.spec;
  if (heavy > 0) {
    // A heavy blow: anyone takes his body out of its way rather than meet it.
    const evade = AI.evadeHeavy;
    answers.stepBack = (answers.stepBack ?? 0.25) * (1 + (evade.move - 1) * heavy);
    if (incoming.zone === 'head') {
      answers.slip = (answers.slip ?? 0.25) * (1 + (evade.move - 1) * heavy);
      answers.leanBack = (answers.leanBack ?? 0.2) * (1 + (evade.move - 1) * heavy);
    }
    for (const block of ['guard', 'weaponBlock', 'parry']) if (answers[block]) answers[block] *= 1 - (1 - evade.block) * heavy;
  }
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
    surge(fighter, event);
    if (event.kind !== 'landed' && event.kind !== 'blocked' && event.kind !== 'shot' && event.kind !== 'arrow') continue;
    feel(world, fighter, event);
    if (event.defender === fighter.id && world.fighters[event.attacker]?.corner !== fighter.corner) {
      hitBy = event.attacker;
      if (event.kind !== 'blocked') fighter.aiLastHit = event.time;
    }
  }
  fighter.aiEventCursor = events.length;
  const current = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  // A man crawling away is left to go.
  if (hitBy !== null && hitBy !== fighter.focus && world.fighters[hitBy].state === 'up' && !world.fighters[hitBy].crawling) {
    fighter.focus = hitBy;
    return world.fighters[hitBy];
  }
  if (current && current.state === 'up' && !current.crawling) return current;
  const standing = world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up' && !other.crawling);
  if (!standing.length) {
    fighter.focus = undefined;
    return nearestOpponent(world, fighter);
  }
  const at = point(fighter.x, P.pelvis);
  // How many of his side already go for each man: counted once, not per comparison.
  const crowds = new Map();
  for (const mate of world.fighters) {
    if (mate !== fighter && mate.corner === fighter.corner && mate.state === 'up' && mate.focus !== undefined) crowds.set(mate.focus, (crowds.get(mate.focus) ?? 0) + 1);
  }
  // Nearest, least crowded, and (in a group fight) nearer my side's leader.
  const score = (other) => vec.length(vec.sub(point(other.x, P.pelvis), at)) + AI.crowdPenalty * (crowds.get(other.id) ?? 0) + AI.cohesion.focus * fromMyLeader(world, fighter, other);
  // The nearest, least crowded: each scored once (the first of equals kept, as before).
  let next = standing[0];
  let best = score(next);
  for (let index = 1; index < standing.length; index += 1) {
    const value = score(standing[index]);
    if (value < best) {
      next = standing[index];
      best = value;
    }
  }
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
  // Good armour is courage.
  nerve += fighter.body.gear.courage;
  // A longer reach is frightening in itself: he can hit me before I can hit him.
  nerve -= AI.reachFear * Math.max(0, reachOf(opponent) - reachOf(fighter));
  if (world) {
    // Outnumbering is courage; being outnumbered, fear.
    const standing = (corner) => world.fighters.filter((other) => other.corner === corner && inFight(other)).length;
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
function goForWeapon(world, fighter, opponent, dt) {
  if (fighter.pickup) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  // A man of a shield style who has lost his wants it back, whatever is in his hand.
  const wantsShield = Boolean(STYLES[fighter.style]?.shield) && !fighter.shield;
  const wantsWeapon = !fighter.weapon?.held;
  // Nothing loose on the floor he wants (the usual case): no thought, and no draw on the bout's randomness.
  const loose = world.debris?.some((debris) => !debris.taken && debris.resting && ((debris.kind === 'weapon' && wantsWeapon) || (debris.kind === 'shield' && wantsShield)));
  if (!loose || fighter.clinch || fighter.pin || fighter.punch || !AI.pickup.enabled) {
    fighter.aiPickupFor = null;
    return false;
  }
  const at = point(fighter.x, P.pelvis);
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const enemies = world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up');
  const attackingMe = enemies.some((other) => other.punch?.target === fighter.id);
  // Still worth it: loose, on the floor, and nearer me than any of them.
  const worth = (debris) => {
    // A standard is taken up only by its own side's chosen man (takeUpStandard).
    if (!debris || debris.taken || !debris.resting) return null;
    if (debris.kind === 'shield' ? !wantsShield : debris.kind !== 'weapon' || !wantsWeapon || WEAPONS[debris.weapon]?.flag) return null;
    const mine = flat(debris.x, at);
    const theirs = enemies.reduce((least, other) => Math.min(least, flat(debris.x, point(other.x, P.pelvis))), Infinity);
    if (mine > AI.pickup.maxDistance || (mine > AI.pickup.atFeet && mine > theirs - AI.pickup.margin)) return null;
    // A gun is no use with him on top of you: only with room to raise it.
    const nearest = enemies.reduce((least, other) => Math.min(least, flat(at, point(other.x, P.pelvis))), Infinity);
    if (WEAPONS[debris.weapon]?.ranged && nearest < (STYLES.handgun.ranged.flee ?? 2.4)) return null;
    // A shield only when there is time for it: nobody within `shieldClear` m,
    // no blow coming, and a weapon in his hand (a weapon on the floor first).
    if (debris.kind === 'shield' && (nearest < AI.pickup.shieldClear || attackingMe || wantsWeapon)) return null;
    return mine;
  };
  let target = world.debris?.[fighter.aiPickupFor];
  let mine = worth(target);
  if (mine === null) {
    fighter.aiPickupFor = null;
    target = null;
    // Not while a blow is coming at me; then, now and then, when one is there for the taking.
    if (attackingMe || world.random() > AI.pickup.eagerness * dt) return false;
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
  const lastOfSide = world.fighters.filter((other) => other.corner === opponent.corner && inFight(other)).length === 1;
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

// ---- Fear, panic and adrenaline -------------------------------------------------

/** How much a body surges with adrenaline: young, big and male more; old less. */
export function adrenalineGain(fighter) {
  const inputs = fighter.body.inputs;
  const age = Math.max(0.45, Math.min(1.2, 1.15 - 0.013 * (inputs.age - 25)));
  const size = ((fighter.body.bodyMassKg ?? fighter.body.massKg) / 75) ** 0.25;
  return age * size * (inputs.sex === 'female' ? 0.8 : 1);
}

/** Adrenaline from what just happened to him: a man put down, or a hard blow survived. */
function surge(fighter, event) {
  const spec = AI.adrenaline;
  let rise = 0;
  const putDown = event.kind === 'knockout' || ((event.kind === 'landed' || event.kind === 'blocked') && event.effects?.some((effect) => effect.startsWith('knockdown')));
  if (putDown && event.attacker === fighter.id) rise = spec.knockdown;
  if (event.defender === fighter.id && fighter.state === 'up') {
    const severity = event.kind === 'shot' || event.kind === 'arrow' ? (event.harm ?? 0) * 2 : event.kind === 'landed' && event.target === 'head' ? (event.harmDeltaV ?? event.headDeltaV ?? 0) / chinNow(fighter) : 0;
    if (severity > spec.hardFrom) rise = Math.max(rise, spec.hardHit * Math.min(2, severity - spec.hardFrom + 0.5));
  }
  if (event.kind === 'staggered' && event.fighter === fighter.id) rise = Math.max(rise, spec.hardHit);
  if (rise > 0) fighter.adrenaline = Math.min(1, (fighter.adrenaline ?? 0) + rise * adrenalineGain(fighter));
}

/** How hurt he is, 0 (fresh) to 1 (about to drop): the worst of everything that puts a man down. */
export function hurtShare(fighter) {
  return Math.min(1, Math.max(
    fighter.concussion / concussionCapacity(fighter),
    (fighter.bloodLost ?? 0) / collapseAt(),
    fighter.gunshot ?? 0,
    AI.panic.perKnockdown * fighter.knockdowns,
  ));
}

/**
 * Fear, settling towards what he feels now; past breaking point he may
 * break (unless adrenaline holds him), and once calm again he recovers.
 */
function feelFear(world, fighter, nerve, dt) {
  const spec = AI.panic;
  fighter.adrenaline = (fighter.adrenaline ?? 0) * 0.5 ** (dt / AI.adrenaline.halfLife);
  // Adrenaline drowns fear out (`AI.adrenaline.nerve` of it, at full adrenaline).
  // The standard down (or the leader fallen): every man of the side sees it.
  const shaken = world.leaders?.[fighter.corner]?.shaken ? spec.standardDown : 0;
  const target = Math.max(0, Math.min(1, (spec.outmatched * Math.max(0, -nerve) + spec.hurt * hurtShare(fighter) + shaken) * (1 - fighter.body.gear.courage) * (1 - AI.adrenaline.nerve * fighter.adrenaline)));
  fighter.fear = (fighter.fear ?? 0) + (target - (fighter.fear ?? 0)) * Math.min(1, dt / spec.settle);
  const held = fighter.adrenaline > spec.adrenalineHolds;
  if (!fighter.panicked) {
    if (fighter.fear > spec.breakAt && !held && world.random() < spec.rate * ((fighter.fear - spec.breakAt) / (1 - spec.breakAt)) * dt) {
      fighter.panicked = true;
      fighter.calmFor = 0;
      fighter.punch = null;
      fighter.clinch = null;
      // Whatever is in his hands goes: he runs.
      if (fighter.weapon?.held) dropWeapon(world, fighter, 'dropped');
      world.events.push({ time: world.time, kind: 'panic', fighter: fighter.id, effects: ['breaks and runs'] });
    }
    return;
  }
  // Badly hurt as well as broken: down on his knees, crawling for safety.
  const crawl = AI.crawl;
  const severity = Math.max(hurtShare(fighter), legShare(fighter));
  if (fighter.state === 'up' && !fighter.crawling && severity > crawl.from) {
    const rate = crawl.rate * ((severity - crawl.from) / (1 - crawl.from)) * (1 - crawl.adrenaline * fighter.adrenaline);
    if (world.random() < rate * dt) startCrawl(world, fighter, 'crawls away');
  }
  fighter.calmFor = fighter.fear < spec.calmAt ? (fighter.calmFor ?? 0) + dt : 0;
  if (held || fighter.calmFor > spec.calmSeconds) {
    fighter.panicked = false;
    world.events.push({ time: world.time, kind: 'rally', fighter: fighter.id, effects: [held ? 'adrenaline: fights on' : 'steadies'] });
  }
}

/** Passive: get away from whoever is nearest, covering up when one swings. */
function keepAway(world, fighter, opponent, dt) {
  const at = point(fighter.x, P.pelvis);
  const enemies = world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up');
  let nearest = opponent;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x[P.pelvis * 3] - at[0], enemy.x[P.pelvis * 3 + 2] - at[2]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  if (nearestDistance < AI.passive.safeDistance) {
    fighter.aiEscapeAge = (fighter.aiEscapeAge ?? Infinity) + dt;
    if (!fighter.aiEscape || fighter.aiEscapeAge > AI.gunKite.rethink) {
      fighter.aiEscape = escapePoint(world, fighter, nearest);
      fighter.aiEscapeAge = 0;
    }
    fighter.goTo = fighter.aiEscape;
    fighter.move = 1;
    fighter.running = fighter.stamina > AI.passive.runWhile;
  } else fighter.move = 0;
  // Hands up whenever someone swings at him.
  if (!fighter.defence && enemies.some((enemy) => enemy.punch?.target === fighter.id)) perform(world, fighter, 'guard');
}

/**
 * A gun keeps away. Closer than `flee` (m), he turns and runs for the most
 * open ground, round him and never into a corner, until he has `flee` plus
 * `rest` again; then he turns, takes the stance, gun up on him in both
 * hands, and fires as he backs away.
 */
function gunfight(world, fighter, opponent, distance, gun, dt) {
  // A fired matchlock: loaded only with nobody near; with someone coming,
  // away from him for room to load.
  const weapon = fighter.weapon;
  if (weapon.spec.shot && !weapon.loaded) {
    fighter.aimAt = undefined;
    const nearest = Math.min(...world.fighters.filter((other) => other.corner !== fighter.corner && other.state === 'up').map((other) => vec.length(vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis)))));
    if (nearest > gun.reloadSafe) {
      fighter.reloading = true;
      fighter.goTo = null;
      fighter.move = 0;
      fighter.strafe = 0;
      fighter.running = false;
      return;
    }
    fighter.reloading = false;
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
  fighter.reloading = false;
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
  // One slow, heavy shot is not fired into a man with comrades round him.
  if (weapon.spec.shot && world.fighters.some((mate) => mate !== fighter && mate.corner === fighter.corner && mate.state !== 'out' && vec.length(vec.sub(point(mate.x, P.pelvis), point(opponent.x, P.pelvis))) < AI.gunCrowd)) {
    if (world.random() < AI.refocusRate * dt) fighter.focus = undefined;
    return;
  }
  const zone = world.random() < gun.headShare ? 'head' : 'body';
  if (throwPunch(world, fighter, gun.move ?? 'shoot', zone)) {
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
    const score = fromHim + kite.roomWeight * Math.min(room(world, at), 2) - kite.pastWeight * Math.max(0, toward) - AI.cohesion.escape * strayFromLeader(world, fighter, at);
    if (score > bestScore) {
      bestScore = score;
      best = [at[0], 0, at[1]];
    }
  }
  return best;
}

/** Crawling: away from the nearest of them, on his knees, as long as he can. */
function crawlAway(world, fighter, dt) {
  fighter.focus = undefined;
  fighter.strafe = 0;
  const at = point(fighter.x, P.pelvis);
  const enemy = nearestOpponent(world, fighter);
  if (!enemy) {
    fighter.goTo = null;
    fighter.move = 0;
    return;
  }
  // A way chosen is kept a while: a crawl is no place for second thoughts.
  fighter.aiCrawlAge = (fighter.aiCrawlAge ?? Infinity) + dt;
  if (!fighter.aiCrawlTo || fighter.aiCrawlAge > AI.crawl.rethink || Math.hypot(fighter.aiCrawlTo[0] - at[0], fighter.aiCrawlTo[2] - at[2]) < AI.crawl.arrived) {
    const away = [at[0] - enemy.x[P.pelvis * 3], at[2] - enemy.x[P.pelvis * 3 + 2]];
    fighter.aiCrawlTo = crawlTarget(world, at, away, Math.hypot(away[0], away[1]) < AI.crawl.pressed);
    fighter.aiCrawlAge = 0;
  }
  if (!fighter.aiCrawlTo) {
    // At the wall with nobody on him, or cornered: he stays as he is, facing the way he was going.
    fighter.goTo = [at[0] + Math.cos(fighter.yaw) * 2, 0, at[2] - Math.sin(fighter.yaw) * 2];
    fighter.move = 0;
    return;
  }
  fighter.goTo = fighter.aiCrawlTo;
  fighter.move = 1;
}

/**
 * Where to crawl: straight away from him; with a wall in the way and him
 * close (`pressed`), along the wall (whichever way has more room); else, or
 * cornered, nowhere (null): he stays at the wall.
 */
function crawlTarget(world, at, away, pressed) {
  const { halfX, halfZ } = world.arena;
  const margin = AI.gunKite.wallMargin;
  const length = Math.hypot(away[0], away[1]) || 1;
  const ahead = [away[0] / length, away[1] / length];
  const clamp = (way) => [Math.max(-(halfX - margin), Math.min(halfX - margin, at[0] + way[0] * AI.crawl.away)), 0, Math.max(-(halfZ - margin), Math.min(halfZ - margin, at[2] + way[1] * AI.crawl.away))];
  const room = (point) => Math.hypot(point[0] - at[0], point[2] - at[2]);
  const straight = clamp(ahead);
  if (room(straight) > AI.crawl.away * 0.5) return straight;
  if (!pressed) return null;
  // Along the wall, whichever way has more room.
  let best = null;
  for (const way of [[-ahead[1], ahead[0]], [ahead[1], -ahead[0]]]) {
    const along = clamp([way[0] * 0.8 + ahead[0] * 0.2, way[1] * 0.8 + ahead[1] * 0.2]);
    if (room(along) > AI.crawl.away * 0.5 && (!best || room(along) > room(best))) best = along;
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
  if (fighter.crawling) {
    crawlAway(world, fighter, dt);
    return;
  }
  // On his knees with the pain: nothing until he is up.
  if (fighter.pain) {
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
  // The side's standard down, and he nearest it: that first.
  if (takeUpStandard(world, fighter)) return;
  // The net: thrown once he is in range of a man not already in one.
  if (fighter.net?.held && opponent.state === 'up' && !opponent.netted) {
    const apart = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
    if (apart > AI.net.from && apart < AI.net.to && random() < AI.net.rate * dt) castNet(world, fighter, opponent);
  }
  if (goForWeapon(world, fighter, opponent, dt)) return;
  let style = STYLES[fighter.style];
  const nerve = confidence(fighter, opponent, world);
  fighter.aiConfidence = nerve;
  // Fear builds and may break him; broken, or passive by choice, he only covers up and gets away.
  feelFear(world, fighter, nerve, dt);
  if (style.passive || fighter.panicked) {
    keepAway(world, fighter, opponent, dt);
    return;
  }
  // In the ranks: his place first.
  if (holdRank(world, fighter, opponent, style, dt)) return;
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
  const gun = style.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  if (gun && distance > gun.close) {
    gunfight(world, fighter, opponent, distance, gun, dt);
    return;
  }
  if (gun && style.emptyStyle) {
    // A gun that is also a club (the three-eyed gun): a man on him, it is a club now.
    fighter.weapon.spent = true;
    fighter.style = style.emptyStyle;
    fighter.aimAt = undefined;
    style = STYLES[fighter.style];
  } else if (gun) {
    dropWeapon(world, fighter, 'dropped');
    style = STYLES[fighter.style] ?? STYLES.mix;
  }
  // Grabbed by the neck, a brawler grabs back: the mutual tie, trading.
  if (style.attacks.collarTie && !fighter.clinch && !fighter.punch && opponent.clinch?.target === fighter.id && world.random() < AI.tieBackPerSecond * dt) perform(world, fighter, 'collarTie');
  // Facing a gun at a distance, standing off is death: close in, weaving,
  // and charge when near enough.
  // (A man in the ranks keeps his place under their shooting: no charge.)
  const facingGun = !gun && !fighter.slot && opponent.weapon?.held && opponent.weapon.spec.ranged && !opponent.weapon.spent && opponent.state === 'up';
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
  // Only a blow aimed at him: one at a team-mate is not his to answer.
  const striker = world.fighters.find((other) => other.corner !== fighter.corner && other.punch?.target === fighter.id);
  const incoming = striker?.punch;
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
    // A heavy blow is watched for, and got out of the way of, more than a light one.
    const heavy = 1 + AI.evadeHeavy.defend * heaviness(striker, incoming);
    if (random() < Math.min(0.97, style.defendChance * plan.defend * (0.6 + 0.6 * fighter.body.inputs.exercise) * reeling * heavy)) {
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
      if (distance > range - 0.1 && distance < range + 1.2 && random() < weight * AI.rushPerWeight * (1 + 3 * fighter.body.gear.courage) * dt) {
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
