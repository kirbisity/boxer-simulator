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
// Nothing here knows a unit: it is all slots, files and the kit's `drill`
// (or a side's, given by its level: Qi Jiguang's army drilled as a whole).
// A squad's drill (`drill.squad`) is fought as Qi Jiguang taught his
// mandarin-duck squads: every man of it goes for the enemy at his place, its
// guns fall back through it as the enemy comes on, its wounded are relieved.
//
// Wings: a side's horsemen (a level's `formation.wings`) are not in the ranks.
// They stand on the flanks of the foot line, held, and are released to charge
// when the two foot lines have closed (or the enemy's horse comes at them, or
// their patience runs out): placeWings puts them there, moveWings lets them go.

import { P } from './body.js';
import { walkingDistance } from './physics/fieldworks.js';

export const DRILL = {
  // Drilled men on a side before it forms up.
  minMembers: 4,
  // The anchor's pace up to the enemy (m/s: a steady walk), and the gap
  // (m, between our front rank and theirs) at which it halts.
  pace: 0.8,
  contact: 1.1,
  // Inside the kit's `charge` distance (m of gap) the line goes in at a run.
  chargePace: 3,
  // The testudo (a kit's `drill.testudo`): advancing under their missiles, out
  // beyond the charge, the ranks close to `close` of their spacing (eased in
  // at `ease` a second), the front rank's shields square before it, the
  // rest raised overhead as a roof; it walks at `pace`.
  testudo: { close: 0.7, ease: 1.2, pace: 0.7 },
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
  // A squad (a drill with `squad`): every man of it goes for an enemy this near (m, beyond both reaches) his place.
  squadEngage: 0.6,
  // Slots within this (m) of the foremost are the front rank.
  frontDepth: 0.6,
  // Slots within this (m) across are one file.
  file: 0.45,
  // Places are reviewed this often (s): gaps filled, shooters relieved.
  reviewEvery: 0.25,
  // A shooter changes places at most this often (s).
  swapEvery: 1.5,
  // The guns before a squad (a drill with `squad`) fire once and fall back
  // through it (retireAt), so each holds his one shot until the man he has
  // laid on is within `holdFire` m (ai.js holdsFire), unless he is far
  // enough off that it can be loaded again before he arrives at a run of
  // `runIn` m/s. The Jixiao xinshu has the fowling pieces fire only when
  // the enemy is close, then by ranks; a volley at long range is mostly
  // thrown away (MATCHLOCK spread: ~0.27 m off at 19 m, about a man's
  // half-width; ~0.17 m at 12 m), and with the pieces empty the rush
  // arrives unhurt. Held to 12 m, the shot goes off with the man some 8-9 m
  // away (the aim takes its moment), early enough for the guns to fall back
  // through the squad (retireAt) before he is on them.
  holdFire: 12,
  runIn: 5,
  // Fire by ranks (the countermarch: the Spanish arquebusiers, the Han crossbows): the front rank
  // of a formation's guns and crossbows fires together in a window `volleyWindow` s long, then holds while the ranks
  // change, the next volley due a reload's time over the number of ranks after it (volleyDue): so with three ranks of
  // matchlocks (15 s to load) a volley every five seconds, the fire never stopping. A bow is shot at will.
  volleyWindow: 1.2,
  // A squad's drill (a drill with `squad`, Qi Jiguang's):
  // shooters before a formation of other arms (the fowling pieces before
  // his squads): with the enemy within `retireAt` m of the front
  // they have fired from, they fall back through the files to stand
  // `retireBehind` m behind its rearmost man, and the hand-to-hand men are its front.
  retireAt: 5,
  retireBehind: 1,
  // The wounded, in a squad: a man of the front rank hurt past `woundedAt` (ai.js
  // hurtShare) changes places with the first man behind him in his file
  // hurt less than `freshBelow`, and for `relief` s goes back to his new
  // place whatever is in front of him (ai.js holdRank), guarding as he goes.
  woundedAt: 0.3,
  freshBelow: 0.15,
  relief: 2.5,
};

/**
 * Where a side's horse waits and when it goes. A wing stands `out` m beyond the
 * end of the foot line (so the charge never crosses its own ranks), on one flank
 * (`side`: +1 or -1 across the field; the two sides take opposite flanks, so the
 * wings ride past each other rather than into each other), `back` m behind the
 * front rank, `abreast` horses to a rank across, `spacing` m apart (a horse's
 * width and a gap: the lane-keeping needs room to steer), the ranks `rankBack` m
 * behind each other. It is released when the foot lines are within
 * `release` m of each other (the flank is then the enemy's soft side, and a
 * gallop from standing needs ~15 m to get up to speed), or an enemy horseman
 * comes within `alarm` m of one of the wing, or `by` s have passed (a foot
 * battle that does not close must not leave the horse standing). A rider of
 * a wing rides at the enemy's shooters before others (`shooters`, m taken off
 * their distance when he picks his man).
 */
export const WINGS = { out: 2.5, back: 10, abreast: 3, spacing: 3.2, rankBack: 4, release: 9, alarm: 16, by: 25, shooters: 8, reviewEvery: 0.25 };

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
export function formUp(world, leaderOf = () => null, orders = {}) {
  world.formations = {};
  for (const corner of ['red', 'blue']) {
    // Drilled by his kit (the legion's), or his whole side by its level's order (`orders[corner].drill`).
    const sideDrill = orders[corner]?.drill ?? null;
    const drillOf = (fighter) => fighter.body.gear.drill ?? sideDrill;
    const members = world.fighters.filter((fighter) => fighter.corner === corner && drillOf(fighter) && !fighter.mount);
    if (members.length < DRILL.minMembers) continue;
    const enemies = world.fighters.filter((fighter) => fighter.corner !== corner);
    if (!enemies.length) continue;
    const mean = (list) => list.reduce((sum, fighter) => [sum[0] + at(fighter)[0] / list.length, sum[1] + at(fighter)[1] / list.length], [0, 0]);
    const middle = mean(members);
    const theirs = mean(enemies);
    // A line drawn up facing straight down the field (a level's order `facing: 'ahead'`: a line of several bodies side
    // by side, its middle not across from the enemy's) faces that way, from its own end toward the other; else toward them.
    const toward = orders[corner]?.facing === 'ahead' ? [corner === 'red' ? 1 : -1, 0] : [theirs[0] - middle[0], theirs[1] - middle[1]];
    const length = Math.hypot(toward[0], toward[1]) || 1;
    const forward = [toward[0] / length, toward[1] / length];
    // Left of forward on the floor (x, z), the way the AI's strafe leans.
    const left = [-forward[1], forward[0]];
    let leader = leaderOf(corner);
    if (!leader || !drillOf(leader)) {
      leader = members.reduce((best, fighter) => (Math.hypot(at(fighter)[0] - middle[0], at(fighter)[1] - middle[1]) < Math.hypot(at(best)[0] - middle[0], at(best)[1] - middle[1]) ? fighter : best));
    }
    const anchor = at(leader);
    for (const fighter of members) {
      const offset = [at(fighter)[0] - anchor[0], at(fighter)[1] - anchor[1]];
      fighter.slot = { ahead: dot(offset, forward), across: dot(offset, left) };
      fighter.formation = corner;
    }
    // (The level's order for the side over its kit's drill: Crassus's legion, drilled to advance, stood in its square.)
    world.formations[corner] = { anchor, forward, left, leader: leader.id, drill: { ...drillOf(leader), ...sideDrill }, members: members.map((fighter) => fighter.id), review: 0 };
  }
}

/** Where a slot is on the floor ([x, z]): closed up toward the anchor as the formation is (`close`). */
export function slotAt(formation, slot) {
  const close = formation.close ?? 1;
  return [
    formation.anchor[0] + (formation.forward[0] * slot.ahead + formation.left[0] * slot.across) * close,
    formation.anchor[1] + (formation.forward[1] * slot.ahead + formation.left[1] * slot.across) * close,
  ];
}

/**
 * Each formation, once a step: the anchor up toward the enemy (or held),
 * the front rank marked, and now and then the places reviewed.
 */
export function moveFormations(world, dt, hurt = () => 0) {
  for (const [corner, formation] of Object.entries(world.formations ?? {})) {
    const members = formation.members.map((id) => world.fighters[id]);
    const standing = members.filter(holding);
    if (!standing.length) continue;
    let front = -Infinity;
    for (const fighter of standing) front = Math.max(front, fighter.slot.ahead);
    // Their nearest man on foot, along our way forward from the anchor (their horse is not the line we are closing on);
    // an army all of horse (the Xiongnu, the Parthians), their nearest rider: that is the enemy the ranks face.
    let theirs = Infinity;
    let nearest = Infinity;
    const middle = formation.drill.square ? slotsMiddle(formation, standing) : null;
    for (const mounted of [false, true]) {
      for (const other of world.fighters) {
        if (other.corner === corner || Boolean(other.mount) !== mounted || !fighting(other)) continue;
        const position = at(other);
        theirs = Math.min(theirs, dot([position[0] - formation.anchor[0], position[1] - formation.anchor[1]], formation.forward));
        if (middle) nearest = Math.min(nearest, Math.hypot(position[0] - middle.at[0], position[1] - middle.at[1]) - middle.radius);
      }
      if (theirs < Infinity) break;
    }
    if (theirs === Infinity) continue;
    // A square (`drill.square`) has no front: the gap is from its outer ring to the nearest of them, whichever way.
    const gap = middle ? nearest : theirs - front;
    // How near the enemy could come to our front on his feet: across open ground the gap; behind a palisade or a ditch
    // (an arena's works: physics/fieldworks.js walkingDistance), the way round it or over it. The shooters change places
    // while he cannot be on them (relieveShooters).
    formation.reachGap = world.arena?.works ? walkingGap(world, corner, formation, front) : gap;
    let lag = 0;
    for (const fighter of standing) {
      const slot = slotAt(formation, fighter.slot);
      const position = at(fighter);
      lag += Math.hypot(position[0] - slot[0], position[1] - slot[1]) / standing.length;
    }
    formation.lag = lag;
    const charging = formation.drill.charge && gap < formation.drill.charge;
    // The testudo while they come on under the missiles, opened for the charge (or at contact).
    formation.testudo = Boolean(formation.drill.testudo) && !charging && gap > DRILL.contact;
    const closeTo = formation.testudo ? DRILL.testudo.close : 1;
    formation.close = (formation.close ?? 1) + (closeTo - (formation.close ?? 1)) * Math.min(1, DRILL.testudo.ease * dt);
    if (formation.drill.advance && gap > DRILL.contact && (charging || lag < DRILL.dressed)) {
      const pace = charging ? DRILL.chargePace : formation.testudo ? DRILL.testudo.pace : DRILL.pace;
      const step = Math.min(pace * dt, gap - DRILL.contact);
      formation.anchor = [formation.anchor[0] + formation.forward[0] * step, formation.anchor[1] + formation.forward[1] * step];
    }
    formation.gap = gap;
    for (const fighter of members) {
      // A square's front rank is its outer ring, facing out every way.
      fighter.inFront = holding(fighter) && (middle ? ringOf(formation, fighter.slot) >= middle.ring - DRILL.frontDepth : fighter.slot.ahead >= front - DRILL.frontDepth);
      // In the testudo: the front rank's shields a wall, the rest a roof.
      fighter.shieldPose = formation.testudo && fighter.shield ? (fighter.inFront ? 'wall' : 'roof') : null;
    }
    formation.review -= dt;
    if (formation.review > 0) continue;
    formation.review = DRILL.reviewEvery;
    closeRanks(world, members);
    // A squad's drill (`drill.squad`, Qi Jiguang's) has its guns fall back through it and its wounded relieved.
    if (formation.drill.squad) retireShooters(members, formation);
    relieveShooters(world, members, formation);
    if (formation.drill.squad) relieveWounded(world, members, hurt);
  }
}

/**
 * The middle of a square's slots on the floor, the half-width of its outer ring
 * from there (`ring`: the furthest a slot stands off the middle, along or
 * across: a square's rings), and the radius on the floor its outermost men stand
 * at (`radius`).
 */
function slotsMiddle(formation, standing) {
  const slots = standing.length ? standing.map((fighter) => fighter.slot) : [{ ahead: 0, across: 0 }];
  const ahead = (Math.max(...slots.map((slot) => slot.ahead)) + Math.min(...slots.map((slot) => slot.ahead))) / 2;
  const across = (Math.max(...slots.map((slot) => slot.across)) + Math.min(...slots.map((slot) => slot.across))) / 2;
  formation.middle = { ahead, across };
  const centre = slotAt(formation, formation.middle);
  const ring = Math.max(...slots.map((slot) => ringOf(formation, slot)));
  return { at: centre, ring, radius: ring * (formation.close ?? 1) };
}

/** How far a slot stands off its square's middle: the larger of along and across (its ring). */
function ringOf(formation, slot) {
  const middle = formation.middle ?? { ahead: 0, across: 0 };
  return Math.max(Math.abs(slot.ahead - middle.ahead), Math.abs(slot.across - middle.across));
}

/** The walking distance (m) from the nearest enemy on foot to the point of our front line before him. */
function walkingGap(world, corner, formation, front) {
  let nearest = Infinity;
  for (const other of world.fighters) {
    if (other.corner === corner || other.mount || !fighting(other)) continue;
    const position = at(other);
    const along = dot([position[0] - formation.anchor[0], position[1] - formation.anchor[1]], formation.forward);
    const toFront = along - front;
    if (toFront > nearest + 4) continue;
    const onLine = [position[0] - formation.forward[0] * toFront, position[1] - formation.forward[1] * toFront];
    nearest = Math.min(nearest, walkingDistance(world, position, onLine) * Math.sign(toFront || 1));
  }
  return nearest;
}

/** A man with a bow or gun (his weapon shoots). */
const shoots = (fighter) => Boolean(fighter.weapon?.held && (fighter.weapon.spec.shot || fighter.weapon.spec.ranged));

/**
 * Whether a drilled man in the front rank may fire his gun or crossbow now: in the window of his formation's
 * volley, which opens a reload's time over the ranks of its shooters after the last one opened (DRILL.volleyWindow).
 */
export function volleyDue(world, formation, fighter) {
  const shot = fighter.weapon?.spec.shot;
  if (!shot || formation.drill.squad) return true;
  const volley = (formation.volley ??= { opened: -Infinity, ranks: null });
  if (world.time < volley.opened + DRILL.volleyWindow) return true;
  if (volley.ranks === null) {
    const ahead = new Set(formation.members.map((id) => world.fighters[id]).filter((man) => man.weapon?.spec.shot).map((man) => Math.round(man.slot.ahead * 4)));
    volley.ranks = Math.max(1, ahead.size);
  }
  if (world.time < volley.opened + (shot.reloadSeconds ?? 0) / volley.ranks) return false;
  volley.opened = world.time;
  return true;
}

/**
 * Shooters standing before a formation's hand-to-hand men fall back through
 * the files once the enemy is near (DRILL.retireAt): each to the rear, in
 * his own file. A formation all of shooters (the Han crossbowmen) has no one
 * to fall back behind, and keeps its ranks.
 */
function retireShooters(members, formation) {
  if (formation.gap >= DRILL.retireAt) return;
  const standing = members.filter(holding);
  const fighters = standing.filter((fighter) => !shoots(fighter));
  if (!fighters.length) return;
  const foremost = Math.max(...fighters.map((fighter) => fighter.slot.ahead));
  const rearmost = Math.min(...fighters.map((fighter) => fighter.slot.ahead));
  for (const fighter of standing) {
    if (shoots(fighter) && fighter.slot.ahead > foremost - DRILL.frontDepth) fighter.slot = { ...fighter.slot, ahead: rearmost - DRILL.retireBehind };
  }
}

/**
 * A man of the front rank badly hurt changes places with a fresh man
 * behind him in his file, and goes back (DRILL.woundedAt, relief).
 */
function relieveWounded(world, members, hurt) {
  for (const fighter of members) {
    if (!fighter.inFront || !fighting(fighter) || fighter.panicked || hurt(fighter) < DRILL.woundedAt) continue;
    const fresh = behindInFile(members, fighter.slot, (other) => fighting(other) && !other.panicked && other.weapon?.held && !shoots(other) && hurt(other) < DRILL.freshBelow);
    if (!fresh) continue;
    swapSlots(fighter, fresh);
    fighter.relievedAt = world.time;
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
 * the enemy on the line (then the front rank fights with what it has), unless
 * a palisade or a ditch keeps him off it (moveFormations' `reachGap`).
 */
function relieveShooters(world, members, formation) {
  if ((formation.reachGap ?? formation.gap) < DRILL.contact + 2) return;
  for (const fighter of members) {
    const weapon = fighter.weapon;
    if (!fighter.inFront || !fighting(fighter) || fighter.punch || !weapon?.held || !weapon.spec.shot || weapon.loaded) continue;
    if (world.time - (fighter.swappedAt ?? -Infinity) < DRILL.swapEvery) continue;
    // In a squad, another shooter: its spearmen do not come forward into the guns' place.
    const loaded = behindInFile(members, fighter.slot, (other) => fighting(other) && other.weapon?.held && other.weapon.loaded && !other.punch && (!formation.drill.squad || shoots(other)));
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

/**
 * Put a side's horsemen on the wings of its foot line (`order.wings` of a level's
 * formation, over WINGS): alternately left and right, the inner places first, in
 * ranks of `abreast`, and mark each as held (`wing`, see moveWings). `foot` is the
 * line they flank: { front, width } (m from the middle to its first rank, and across
 * its widest row); `sign` is -1 for red, 1 for blue. `place(fighter, x, z)` puts a man.
 */
export function placeWings(riders, sign, order, foot, arena, place) {
  const wings = { ...WINGS, ...order.wings };
  const edge = foot.width / 2 + wings.out;
  const room = arena.halfZ - 1.2;
  // One wing on the flank `side` names (+1 or -1 across the field), or half and half.
  const both = wings.side === undefined;
  riders.forEach((fighter, index) => {
    const side = both ? (index % 2 === 0 ? 1 : -1) : wings.side;
    const nth = both ? Math.floor(index / 2) : index;
    const across = Math.min(room, edge + (nth % wings.abreast) * wings.spacing) * side;
    const back = foot.front + wings.back + Math.floor(nth / wings.abreast) * wings.rankBack;
    place(fighter, sign * Math.min(arena.halfX - 1, back), across);
    fighter.wing = { held: true, side };
  });
}

/**
 * Release the wings that are due: the held riders go when the foot lines have
 * closed or time is up, and any one of them at once if an enemy horseman is near
 * him or he is struck. Checked every WINGS.reviewEvery s.
 */
export function moveWings(world, dt) {
  const wings = world.wings;
  if (!wings) return;
  wings.review -= dt;
  if (wings.review > 0) return;
  wings.review = WINGS.reviewEvery;
  const held = world.fighters.filter((fighter) => fighter.wing?.held && fighter.mount && fighter.state === 'up');
  if (!held.length) {
    world.wings = null;
    return;
  }
  // The foot lines' fronts, along x (red stands at -x): how far apart their first men are.
  let red = -Infinity;
  let blue = Infinity;
  for (const fighter of world.fighters) {
    if (fighter.mount || !fighting(fighter)) continue;
    const x = at(fighter)[0];
    if (fighter.corner === 'red') red = Math.max(red, x);
    else if (fighter.corner === 'blue') blue = Math.min(blue, x);
  }
  const closed = blue - red <= wings.release;
  const late = world.time >= wings.by;
  for (const fighter of held) {
    const horse = fighter.mount;
    const near = world.fighters.some((other) => other.mount && other.corner !== fighter.corner && other.state === 'up' && Math.hypot(other.mount.at[0] - horse.at[0], other.mount.at[1] - horse.at[1]) < WINGS.alarm);
    const struck = fighter.hitAt.some((time) => time > world.time - 1);
    if (closed || late || near || struck) fighter.wing.held = false;
  }
}
