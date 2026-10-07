// Drill: men who fight in ranks (any kit with `drill`: Roman legionaries,
// Han crossbowmen) keep a place in their side's formation. Each remembers
// where he stood from his leader when the battle began (his slot: so far
// ahead, so far across, in the side's frame). The formation's anchor (the
// leader's place) moves up toward the enemy, or holds, and every man walks to
// his slot as it goes; the last stretch (the kit's `charge`) at a run. The front rank fights; a man may step out after a
// blow but not run on into their lines (his leash); those behind stand in
// their places, so they need no physics beyond a pose (see chooseDetail).
// A fallen man's place is taken by the man behind him in his file, and a
// shooter who has loosed changes places with a loaded man behind him.
// Nothing here knows a unit: it is all slots, files and the kit's `drill`.

import { P } from './body.js';

export const DRILL = {
  // Drilled men on a side before it forms up.
  minMembers: 4,
  // The anchor's pace up to the enemy (m/s: a steady walk), and the gap
  // (m, between our front rank and theirs) at which it halts.
  pace: 0.8,
  contact: 1.1,
  // Inside the kit's `charge` distance (m of gap) the line goes in at a run.
  chargePace: 3,
  // The line dresses as it goes: the anchor waits while its men are on
  // average further than this (m) from their slots.
  dressed: 0.8,
  // A man's slot this close is reached; he walks straight there from this far.
  arrive: 0.15,
  steer: 0.4,
  runFrom: 3,
  // How far (m) a man may be out ahead of his slot before he steps back.
  leash: 0.9,
  // An enemy this near (m) his slot, beyond his own reach, is the front rank's to fight.
  engage: 1.2,
  // Slots within this (m) of the foremost are the front rank.
  frontDepth: 0.6,
  // Slots within this (m) across are one file.
  file: 0.45,
  // Places are reviewed this often (s): gaps filled, shooters relieved.
  reviewEvery: 0.25,
  // A shooter changes places at most this often (s).
  swapEvery: 1.5,
};

const at = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
/** Still in his place in the ranks: on his feet or down for a moment, not out, crawling or broken. */
const holding = (fighter) => fighter.state !== 'out' && !fighter.crawling && !fighter.panicked;
/** Of the fighting: standing and not crawling away. */
const fighting = (fighter) => fighter.state === 'up' && !fighter.crawling;

/**
 * Form up every side with enough drilled men: the anchor at its leader
 * (`leaderOf(corner)`: a fighter, or null for the man nearest its middle),
 * facing the enemy; each drilled man's slot his offset from it.
 */
export function formUp(world, leaderOf = () => null) {
  world.formations = {};
  for (const corner of ['red', 'blue']) {
    const members = world.fighters.filter((fighter) => fighter.corner === corner && fighter.body.gear.drill);
    if (members.length < DRILL.minMembers) continue;
    const enemies = world.fighters.filter((fighter) => fighter.corner !== corner);
    if (!enemies.length) continue;
    const mean = (list) => list.reduce((sum, fighter) => [sum[0] + at(fighter)[0] / list.length, sum[1] + at(fighter)[1] / list.length], [0, 0]);
    const middle = mean(members);
    const theirs = mean(enemies);
    const toward = [theirs[0] - middle[0], theirs[1] - middle[1]];
    const length = Math.hypot(toward[0], toward[1]) || 1;
    const forward = [toward[0] / length, toward[1] / length];
    // Left of forward on the floor (x, z), the way the AI's strafe leans.
    const left = [-forward[1], forward[0]];
    let leader = leaderOf(corner);
    if (!leader || !leader.body.gear.drill) {
      leader = members.reduce((best, fighter) => (Math.hypot(at(fighter)[0] - middle[0], at(fighter)[1] - middle[1]) < Math.hypot(at(best)[0] - middle[0], at(best)[1] - middle[1]) ? fighter : best));
    }
    const anchor = at(leader);
    for (const fighter of members) {
      const offset = [at(fighter)[0] - anchor[0], at(fighter)[1] - anchor[1]];
      fighter.slot = { ahead: dot(offset, forward), across: dot(offset, left) };
      fighter.formation = corner;
    }
    world.formations[corner] = { anchor, forward, left, leader: leader.id, drill: leader.body.gear.drill, members: members.map((fighter) => fighter.id), review: 0 };
  }
}

/** Where a slot is on the floor ([x, z]). */
export function slotAt(formation, slot) {
  return [
    formation.anchor[0] + formation.forward[0] * slot.ahead + formation.left[0] * slot.across,
    formation.anchor[1] + formation.forward[1] * slot.ahead + formation.left[1] * slot.across,
  ];
}

/**
 * Each formation, once a step: the anchor up toward the enemy (or held),
 * the front rank marked, and now and then the places reviewed.
 */
export function moveFormations(world, dt) {
  for (const [corner, formation] of Object.entries(world.formations ?? {})) {
    const members = formation.members.map((id) => world.fighters[id]);
    const standing = members.filter(holding);
    if (!standing.length) continue;
    let front = -Infinity;
    for (const fighter of standing) front = Math.max(front, fighter.slot.ahead);
    // Their nearest man, along our way forward from the anchor.
    let theirs = Infinity;
    for (const other of world.fighters) {
      if (other.corner === corner || !fighting(other)) continue;
      const position = at(other);
      theirs = Math.min(theirs, dot([position[0] - formation.anchor[0], position[1] - formation.anchor[1]], formation.forward));
    }
    if (theirs === Infinity) continue;
    const gap = theirs - front;
    let lag = 0;
    for (const fighter of standing) {
      const slot = slotAt(formation, fighter.slot);
      const position = at(fighter);
      lag += Math.hypot(position[0] - slot[0], position[1] - slot[1]) / standing.length;
    }
    formation.lag = lag;
    const charging = formation.drill.charge && gap < formation.drill.charge;
    if (formation.drill.advance && gap > DRILL.contact && (charging || lag < DRILL.dressed)) {
      const step = Math.min((charging ? DRILL.chargePace : DRILL.pace) * dt, gap - DRILL.contact);
      formation.anchor = [formation.anchor[0] + formation.forward[0] * step, formation.anchor[1] + formation.forward[1] * step];
    }
    formation.gap = gap;
    for (const fighter of members) fighter.inFront = holding(fighter) && fighter.slot.ahead >= front - DRILL.frontDepth;
    formation.review -= dt;
    if (formation.review > 0) continue;
    formation.review = DRILL.reviewEvery;
    closeRanks(world, members);
    relieveShooters(world, members, formation);
  }
}

/** The nearest man holding his place behind this slot in its file, or null. */
function behindInFile(members, slot, accept = () => true) {
  let best = null;
  for (const fighter of members) {
    if (!holding(fighter) || fighter.slot.ahead >= slot.ahead - 1e-6) continue;
    if (Math.abs(fighter.slot.across - slot.across) > DRILL.file || !accept(fighter)) continue;
    if (!best || fighter.slot.ahead > best.slot.ahead) best = fighter;
  }
  return best;
}

/** Swap two men's places. */
function swapSlots(a, b) {
  const slot = a.slot;
  a.slot = b.slot;
  b.slot = slot;
}

/**
 * A fallen man's place is taken by the man behind him in his file (who
 * leaves his own to the fallen, so the gap moves back a rank at a time).
 */
function closeRanks(world, members) {
  const fallen = members.filter((fighter) => !holding(fighter)).sort((a, b) => b.slot.ahead - a.slot.ahead);
  for (const gone of fallen) {
    const next = behindInFile(members, gone.slot);
    if (next) swapSlots(gone, next);
  }
}

/**
 * A shooter in the front rank who has loosed changes places with the first
 * loaded man behind him in his file, and goes back to span again; not with
 * the enemy on the line (then the front rank fights with what it has).
 */
function relieveShooters(world, members, formation) {
  if (formation.gap < DRILL.contact + 2) return;
  for (const fighter of members) {
    const weapon = fighter.weapon;
    if (!fighter.inFront || !fighting(fighter) || fighter.punch || !weapon?.held || !weapon.spec.shot || weapon.loaded) continue;
    if (world.time - (fighter.swappedAt ?? -Infinity) < DRILL.swapEvery) continue;
    const loaded = behindInFile(members, fighter.slot, (other) => fighting(other) && other.weapon?.held && other.weapon.loaded && !other.punch);
    if (!loaded) continue;
    swapSlots(fighter, loaded);
    fighter.swappedAt = world.time;
    loaded.swappedAt = world.time;
  }
}

/**
 * Walk to his slot, facing his man: the move along the line to him, the
 * strafe across it. Returns how far the slot still is (m).
 */
export function walkToSlot(fighter, formation, opponent) {
  const slot = slotAt(formation, fighter.slot);
  const me = at(fighter);
  const offset = [slot[0] - me[0], slot[1] - me[1]];
  const distance = Math.hypot(offset[0], offset[1]);
  if (distance < DRILL.arrive) {
    fighter.move = 0;
    fighter.strafe = 0;
    return distance;
  }
  const him = opponent ? at(opponent) : [me[0] + formation.forward[0], me[1] + formation.forward[1]];
  const line = [him[0] - me[0], him[1] - me[1]];
  const length = Math.hypot(line[0], line[1]) || 1;
  const forward = [line[0] / length, line[1] / length];
  const left = [-forward[1], forward[0]];
  const clamp = (value) => Math.max(-1, Math.min(1, value));
  fighter.move = clamp(dot(offset, forward) / DRILL.steer);
  fighter.strafe = clamp(dot(offset, left) / DRILL.steer);
  fighter.running = distance > DRILL.runFrom;
  return distance;
}

/** How far (m) a man is out ahead of his slot, toward the enemy. */
export function aheadOfSlot(fighter, formation) {
  const slot = slotAt(formation, fighter.slot);
  const me = at(fighter);
  return dot([me[0] - slot[0], me[1] - slot[1]], formation.forward);
}

/** How far (m) an enemy is from a man's slot. */
export function fromSlot(fighter, formation, other) {
  const slot = slotAt(formation, fighter.slot);
  const position = at(other);
  return Math.hypot(position[0] - slot[0], position[1] - slot[1]);
}
