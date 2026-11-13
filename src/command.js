// Orders: in a battle, the man the player plays commands the rest of his
// side. An order is world state (`world.commands[corner]`), given by one man
// (`by`) and kept until another is given; the AI reads it (ai.js: the
// focus, then what he does, before his place in the ranks).
//   To me (`rally`): his men break off and gather round him in loose rings,
//     following as he goes; there they stand on guard, facing the nearest
//     enemy, and fight only a man who comes within reach of them (never
//     far from their place round him); shooters shoot from where they stand.
//   Charge (`charge`): his men go at a run for the enemy in the way he
//     gave (where he looked, or at the man he was locked on), each the
//     nearest man in that way, and fight him; with nobody left in that way,
//     each halts where he got to and holds there.
//   Hold (`hold`): they stand their ground: a man in his place in the
//     ranks keeps it (the formation's advance halted), anyone else holds the
//     spot where the order found him; each fights only a man within reach.
//   As you were (`free`): the order taken back, the side's own way again
//     (its formation, its standard). Every battle begins so.
//   Formation (`form`), where the side has places of its own to keep
//     (`world.formPlaces[corner]`: Last Stand Squad's, placed before the
//     run): every man back to his place, at a run from afar, and held
//     there, fighting only a man who comes within reach of him.
// A man broken (panicked), crawling away, fled, on horseback or down hears
// nothing; once up he obeys whatever order stands. The giver out of the
// fight, his order lapses.
// Who hears him (`world.commandMen[corner]`, where it is set: story mode, by his rank): only those men (a squad
// leader's squad), or nobody (a private soldier commands no one, and has no orders to give). Unset, his whole side.
// Arms (COMMAND_GROUPS): a general parts his field as commanders always have, into
// his foot, his shot and his horse, and may order each apart (`world.groupCommands[corner][group]`):
// the shot told to hold while the foot comes to him and the horse charges. An order
// to all (`world.commands[corner]`) takes back every order to an arm. Which arm a man
// is in is read from him (groupOf), never listed. The horse are not walked about by
// orders (a rider's footwork is his horse's): Charge lets them go from their wing, Hold
// reins them in where they are (holding as a wing does, formation.js moveWings, till an enemy is on them), Free gives them
// back to their wing's own time to go.

import { P } from './body.js';
import { slotAt } from './formation.js';
import { reachOf, throwPunch, WORLD } from './physics.js';

export const COMMAND = {
  // A side this big (the player among them) takes orders: as many as have a standard, so a few men round him.
  minSide: WORLD.standard.minSide,
  // To me: rings round him, the first `first` m out and each further one `gap` m beyond, a man every `spacing` m round each: loose, so each has room to swing.
  rally: { first: 1.6, gap: 1.1, spacing: 1.15 },
  // A place this near (m) is reached; from further than `turnFrom` he turns and walks to it (else he steps there facing the enemy), from `runFrom` at a run.
  arrive: 0.25,
  turnFrom: 1.5,
  runFrom: 3,
  steer: 0.4,
  // An enemy within reach of both, plus this (m), is close enough to fight where he stands.
  engage: 0.6,
  // ... while he is no further than this (m) from his place; beyond it he goes back to it first.
  leash: 1.5,
  // Charge: the enemy in the way given are those ahead of where it was given (or no more than `behind` m back), within `width` m of its line, widening by `spread` m a m out (about 30° each side).
  charge: { behind: 1, width: 3, spread: 0.58, retargetEvery: 0.5, runFrom: 2.5 },
  // Hold: a man this near (m) his place in the ranks keeps it; anyone further holds where he stands.
  ranksWithin: 2,
};

// The arms, in the order the player steps through them ([ and ]): `orders`, where given, the only ones an arm takes.
export const COMMAND_GROUPS = [
  { key: 'all' },
  { key: 'foot' },
  { key: 'shot' },
  { key: 'horse', orders: ['charge', 'hold', 'free'] },
];

// The orders in the order of their buttons: icon, word, key.
export const COMMAND_ORDERS = [
  { kind: 'rally', label: 'To me', key: '7' },
  { kind: 'charge', label: 'Charge', key: '8' },
  { kind: 'hold', label: 'Hold', key: '9' },
  { kind: 'free', label: 'Free', key: '0' },
  // Back to the places set before the fight: only where the side has them (formPlaces).
  { kind: 'form', label: 'Formation', key: '-', places: true },
];

/** The orders this side (or one arm of it, `group`) may be given: all but Formation where it has no places of its own, and the horse's own few. */
export function ordersFor(world, corner, group = 'all') {
  const allowed = COMMAND_GROUPS.find((entry) => entry.key === group)?.orders;
  return COMMAND_ORDERS.filter((entry) => (!entry.places || Boolean(world?.formPlaces?.[corner])) && (!allowed || allowed.includes(entry.kind)));
}

/** The arm a man fights in: the horse while mounted, the shot if he went out with a bow or gun (kept: a gunner with his sword out is still of the shot), else the foot. */
export function groupOf(fighter) {
  if (fighter.mount) return 'horse';
  fighter.commandArm ??= fighter.weapon?.held && (fighter.weapon.spec.shot || fighter.weapon.spec.ranged) ? 'shot' : 'foot';
  return fighter.commandArm;
}

/** The arms of his side he can order apart: 'all', then each arm with anyone in it who hears him; just 'all' where there is only one arm. */
export function groupsFor(world, by) {
  if (!world || !by) return ['all'];
  const present = new Set();
  for (const fighter of world.fighters) {
    if (fighter !== by && fighter.corner === by.corner && fighter.state !== 'out' && hearsOrders(world, fighter)) present.add(groupOf(fighter));
  }
  const arms = COMMAND_GROUPS.filter((entry) => entry.key !== 'all' && present.has(entry.key)).map((entry) => entry.key);
  return arms.length > 1 ? ['all', ...arms] : ['all'];
}

/** The arm his orders go to now ('all' unless he chose one: chooseGroup). */
export function chosenGroup(world, by) {
  const chosen = world?.orderGroups?.[by?.corner] ?? 'all';
  return groupsFor(world, by).includes(chosen) ? chosen : 'all';
}

/** Choose the arm his orders go to: `step` +1 or -1 through those he has, or a key of COMMAND_GROUPS. */
export function chooseGroup(world, by, step) {
  const groups = groupsFor(world, by);
  const now = groups.indexOf(chosenGroup(world, by));
  const next = typeof step === 'number' ? groups[(now + step + groups.length) % groups.length] : (groups.includes(step) ? step : 'all');
  world.orderGroups ??= {};
  world.orderGroups[by.corner] = next;
  return next;
}

const commandAt = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const commandApart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** Whether this man can command his side: in a fight his side has enough men for it, and not out of it himself. */
export function canCommand(world, fighter) {
  if (!world || !fighter || fighter.state === 'out') return false;
  // (A squad with places of its own takes orders however small: two men are enough to be told back to them.)
  const least = world.formPlaces?.[fighter.corner] ? 2 : COMMAND.minSide;
  const heard = world.commandMen?.[fighter.corner];
  if (heard) return heard.some((id) => id !== fighter.id && world.fighters[id]?.state !== 'out');
  return world.fighters.filter((other) => other.corner === fighter.corner).length >= least;
}

/** Whether this man hears his side's orders: everyone, unless the side's orders reach only some (`world.commandMen`). */
const hearsOrders = (world, fighter) => !world.commandMen?.[fighter.corner] || world.commandMen[fighter.corner].includes(fighter.id);

/** The order his side (or one arm of it) is under ('rally', 'charge', 'hold', 'form'), or 'free': an arm's own order over the side's. */
export function standingOrder(world, corner, group = 'all') {
  const own = group === 'all' ? null : world?.groupCommands?.[corner]?.[group];
  return (own ?? world?.commands?.[corner])?.kind ?? 'free';
}

/** The order standing over this arm (its own, else the side's), or null: what a new call is told by. */
export function orderOver(world, corner, group = 'all') {
  return (group === 'all' ? null : world?.groupCommands?.[corner]?.[group]) ?? world?.commands?.[corner] ?? null;
}

/**
 * Give his side an order: `kind` one of COMMAND_ORDERS, `by` the man giving
 * it, `dir` ([x, z], for a charge) the way to go, `group` the arm it goes to
 * (COMMAND_GROUPS: 'all', the default, his whole side). 'free' takes the order back.
 */
export function giveOrder(world, by, kind, { dir = null, group = 'all' } = {}) {
  world.commands ??= {};
  world.groupCommands ??= {};
  if (kind === 'form' && !world.formPlaces?.[by.corner]) return null;
  if (!ordersFor(world, by.corner, group).some((entry) => entry.kind === kind)) return null;
  const arms = (world.groupCommands[by.corner] ??= {});
  if (group === 'horse') orderHorse(world, by.corner, kind);
  if (kind === 'free') {
    if (group === 'all') {
      delete world.commands[by.corner];
      for (const arm of Object.keys(arms)) delete arms[arm];
    } else delete arms[group];
    return null;
  }
  const at = commandAt(by);
  const length = dir ? Math.hypot(dir[0], dir[1]) : 0;
  const way = length > 1e-6 ? [dir[0] / length, dir[1] / length] : [Math.cos(by.yaw), -Math.sin(by.yaw)];
  world.orderCount = (world.orderCount ?? 0) + 1;
  const command = { kind, by: by.id, at, dir: way, since: world.time, serial: world.orderCount, group };
  // Hold to all or to the foot: the formation's anchor (the foot's ranks) stays where it is now.
  const formation = world.formations?.[by.corner];
  if (kind === 'hold' && formation && (group === 'all' || group === 'foot')) command.anchor = [...formation.anchor];
  if (kind === 'rally') command.places = rallyPlaces(world, by, group);
  // Formation: each man's own place, fixed in the world ([x, z] by his id).
  if (kind === 'form') command.places = structuredClone(world.formPlaces[by.corner]);
  if (group === 'all') {
    world.commands[by.corner] = command;
    for (const arm of Object.keys(arms)) delete arms[arm];
  } else arms[group] = command;
  return command;
}

/**
 * An order to the horse, on the riders themselves (their `wing`, formation.js):
 * Charge lets every held rider go; Hold reins in every rider up where he is,
 * held as a wing is (marked `byOrder`); Free hands those back to their wing's
 * own time to go if the side still has one waiting (`world.wings`), else lets them go.
 */
function orderHorse(world, corner, kind) {
  // A side with no wing waiting is given one held only by the order (`ordered`: it goes at no time of its own), so an enemy upon a reined-in man still lets him go (moveWings).
  if (kind === 'hold') world.wings ??= { release: 0, by: Infinity, review: 0, ordered: true };
  for (const fighter of world.fighters) {
    if (fighter.corner !== corner || !fighter.mount || fighter.state !== 'up' || !hearsOrders(world, fighter)) continue;
    if (kind === 'charge' && fighter.wing) fighter.wing.held = false;
    else if (kind === 'hold') fighter.wing = { side: fighter.wing?.side ?? (Math.sign(fighter.mount.at[1]) || 1), held: true, byOrder: true };
    else if (kind === 'free' && fighter.wing?.byOrder) {
      fighter.wing.byOrder = false;
      fighter.wing.held = Boolean(world.wings) && !world.wings.ordered;
    }
  }
}


/** Every order taken back (leaving play: the side goes its own way). */
export function clearOrders(world) {
  if (!world) return;
  world.commands = {};
  world.groupCommands = {};
  world.orderGroups = {};
}

/**
 * The places round him, for every other man of his side, as offsets from
 * him ([x, z], fixed in the world, so they do not swing as he turns): the
 * nearest men in the nearest ring, each ring's men in the order they stand
 * round him, so nobody crosses another to get to his place.
 */
function rallyPlaces(world, by, group = 'all') {
  const spec = COMMAND.rally;
  const centre = commandAt(by);
  const men = world.fighters.filter((fighter) => fighter.corner === by.corner && fighter !== by && hearsOrders(world, fighter) && (group === 'all' || groupOf(fighter) === group))
    .map((fighter) => ({ fighter, at: commandAt(fighter) }))
    .sort((a, b) => commandApart(a.at, centre) - commandApart(b.at, centre));
  const places = {};
  let ring = 0;
  while (men.length) {
    const radius = spec.first + ring * spec.gap;
    const room = Math.max(4, Math.floor((2 * Math.PI * radius) / spec.spacing));
    const these = men.splice(0, room);
    const angleOf = (entry) => Math.atan2(entry.at[1] - centre[1], entry.at[0] - centre[0]);
    these.sort((a, b) => angleOf(a) - angleOf(b));
    // Spread evenly round the ring, starting from the first man's own bearing.
    const start = angleOf(these[0]);
    these.forEach((entry, index) => {
      const angle = start + (index / these.length) * 2 * Math.PI;
      places[entry.fighter.id] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
    });
    ring += 1;
  }
  return places;
}

/** The order this man is to obey now, or null: none, or he is in no state to hear it. His own record of it is fresh for a new order. */
function orderFor(world, fighter) {
  const command = world.groupCommands?.[fighter.corner]?.[groupOf(fighter)] ?? world.commands?.[fighter.corner];
  if (!command || command.by === fighter.id || !hearsOrders(world, fighter)) return null;
  if (fighter.state !== 'up' || fighter.panicked || fighter.crawling || fighter.fled || fighter.mount) return null;
  if (fighter.order?.serial !== command.serial) {
    const formation = fighter.slot ? world.formations?.[fighter.formation] : null;
    const slot = formation ? slotAt(formation, fighter.slot) : null;
    fighter.order = {
      serial: command.serial,
      // Where the order found him: his ground for a Hold.
      spot: commandAt(fighter),
      ranks: command.kind === 'hold' && Boolean(slot) && commandApart(slot, commandAt(fighter)) < COMMAND.ranksWithin,
      target: null,
      retargetAt: -Infinity,
      halted: false,
    };
  }
  return command;
}

/**
 * Once a step, after the formations have moved: an order whose giver is
 * out of the fight lapses; a held formation's anchor stays put; and a man
 * in the ranks out of them on an order is in the fight, not a pose behind it.
 */
export function keepOrders(world) {
  for (const arms of Object.values(world.groupCommands ?? {})) {
    for (const [group, command] of Object.entries(arms)) {
      const giver = world.fighters[command.by];
      if (!giver || giver.state === 'out') delete arms[group];
    }
  }
  for (const [corner, command] of Object.entries(world.commands ?? {})) {
    const giver = world.fighters[command.by];
    if (!giver || giver.state === 'out') delete world.commands[corner];
  }
  for (const corner of ['red', 'blue']) {
    const formation = world.formations?.[corner];
    if (!formation) continue;
    const command = world.groupCommands?.[corner]?.foot ?? world.commands?.[corner];
    if (command?.anchor) formation.anchor = [...command.anchor];
    for (const id of formation.members) {
      const fighter = world.fighters[id];
      if (!orderFor(world, fighter) || fighter.order.ranks) continue;
      fighter.inFront = true;
      fighter.shieldPose = null;
    }
  }
}

/** Whether a man is close enough to fight where he stands: within both men's reach, and a little. */
function withinReach(fighter, other) {
  return other.state === 'up' && commandApart(commandAt(fighter), commandAt(other)) < reachOf(fighter) + reachOf(other) + COMMAND.engage;
}

/** Whether an enemy stands in the way a charge was given. */
function inTheWay(command, other) {
  const spec = COMMAND.charge;
  const offset = [other.x[P.pelvis * 3] - command.at[0], other.x[P.pelvis * 3 + 2] - command.at[1]];
  const along = offset[0] * command.dir[0] + offset[1] * command.dir[1];
  const across = Math.abs(offset[0] * -command.dir[1] + offset[1] * command.dir[0]);
  return along > -spec.behind && across < spec.width + Math.max(0, along) * spec.spread;
}

/**
 * The man to fight under the order (ai.js, after his own choice, `chosen`):
 * on a charge, the man already on him if one is, else the nearest enemy in
 * the way given (fewest of his side on him first); otherwise his own choice.
 */
export function orderedFocus(world, fighter, chosen) {
  const command = orderFor(world, fighter);
  if (!command || command.kind !== 'charge' || !chosen) return chosen;
  const record = fighter.order;
  if (withinReach(fighter, chosen)) return chosen;
  const kept = record.target === null ? null : world.fighters[record.target];
  const fresh = kept && kept.state === 'up' && !kept.crawling;
  if (!fresh || world.time >= record.retargetAt) {
    record.retargetAt = world.time + COMMAND.charge.retargetEvery;
    const crowds = new Map();
    for (const mate of world.fighters) if (mate !== fighter && mate.corner === fighter.corner && mate.order?.serial === record.serial && mate.order.target !== null) crowds.set(mate.order.target, (crowds.get(mate.order.target) ?? 0) + 1);
    const me = commandAt(fighter);
    let best = null;
    let bestScore = Infinity;
    for (const other of world.fighters) {
      if (other.corner === fighter.corner || other.state !== 'up' || other.crawling || !inTheWay(command, other)) continue;
      const score = commandApart(me, commandAt(other)) + 0.7 * (crowds.get(other.id) ?? 0);
      if (score < bestScore) {
        best = other;
        bestScore = score;
      }
    }
    record.target = best?.id ?? null;
  }
  const target = record.target === null ? null : world.fighters[record.target];
  // Nobody left in the way: he halts where he got to and holds there.
  if (!target) {
    if (!record.halted) record.spot = commandAt(fighter);
    record.halted = true;
    return chosen;
  }
  record.halted = false;
  fighter.focus = target.id;
  return target;
}

/**
 * What the order has him do this tick (ai.js, before his place in the
 * ranks): 'obeyed' (it has set his footwork: nothing more to decide),
 * 'fight' (fight the man before him in the ordinary way, out of the ranks)
 * or null (no order he hears, or one that leaves him to his ranks).
 */
export function obeyOrder(world, fighter, opponent, style, dt) {
  const command = orderFor(world, fighter);
  if (!command || !opponent) return null;
  const record = fighter.order;
  if (fighter.clinch || fighter.pin || fighter.pickup) return 'fight';
  if (command.kind === 'hold' && record.ranks) return null;
  if (command.kind === 'charge' && !record.halted) {
    // A loaded shooter shoots his way in (the ordinary gunfight); anyone else runs at his man, then fights him.
    const weapon = fighter.weapon;
    if (style.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent) return 'fight';
    const apart = commandApart(commandAt(fighter), commandAt(opponent));
    if (opponent.state !== 'up' || apart < reachOf(fighter) + reachOf(opponent) + COMMAND.charge.runFrom) return 'fight';
    fighter.goTo = null;
    fighter.move = 1;
    fighter.running = true;
    fighter.strafe = 0;
    return 'obeyed';
  }
  // A place to keep: round him (To me), or his own ground (Hold, or a charge run out of men).
  const place = placeFor(world, command, fighter);
  if (!place) return null;
  const away = commandApart(place, commandAt(fighter));
  if (withinReach(fighter, opponent) && away < COMMAND.leash) return 'fight';
  goToPlace(fighter, place, opponent);
  if (away < COMMAND.turnFrom) shootFromPlace(world, fighter, opponent, style);
  return 'obeyed';
}

/** Whether the order, not his place in the ranks or his standard, decides where he stands (ai.js keepPlace). */
export function orderKeepsPlace(world, fighter) {
  const command = orderFor(world, fighter);
  return Boolean(command) && !(command.kind === 'hold' && fighter.order.ranks);
}

/** His place under the order ([x, z]): his ring's place round the giver, his place in the formation, or his own ground. */
function placeFor(world, command, fighter) {
  if (command.kind === 'form') return command.places[fighter.id] ?? null;
  if (command.kind === 'rally') {
    const offset = command.places[fighter.id];
    if (!offset) return null;
    const centre = commandAt(world.fighters[command.by]);
    return [centre[0] + offset[0], centre[1] + offset[1]];
  }
  return fighter.order.spot;
}

/**
 * Footwork to a place: from far, turned to it and walking (running from
 * further); near, stepping there still facing his man; there, standing.
 */
function goToPlace(fighter, place, opponent) {
  const me = commandAt(fighter);
  const offset = [place[0] - me[0], place[1] - me[1]];
  const distance = Math.hypot(offset[0], offset[1]);
  fighter.running = false;
  if (distance < COMMAND.arrive) {
    fighter.goTo = null;
    fighter.move = 0;
    fighter.strafe = 0;
    return;
  }
  if (distance > COMMAND.turnFrom || !opponent) {
    fighter.goTo = [place[0], 0, place[1]];
    fighter.move = 1;
    fighter.strafe = 0;
    fighter.running = distance > COMMAND.runFrom;
    return;
  }
  fighter.goTo = null;
  const him = commandAt(opponent);
  const line = [him[0] - me[0], him[1] - me[1]];
  const length = Math.hypot(line[0], line[1]) || 1;
  const forward = [line[0] / length, line[1] / length];
  const left = [-forward[1], forward[0]];
  const clamp = (value) => Math.max(-1, Math.min(1, value));
  fighter.move = clamp((offset[0] * forward[0] + offset[1] * forward[1]) / COMMAND.steer);
  fighter.strafe = clamp((offset[0] * left[0] + offset[1] * left[1]) / COMMAND.steer);
}

/** A shooter at his place shoots from it (or spans again), as a man in the ranks does; nobody near him yet. */
function shootFromPlace(world, fighter, opponent, style) {
  const weapon = fighter.weapon;
  const gun = style.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent ? style.ranged : null;
  if (!gun || opponent.state !== 'up') return;
  if (weapon.spec.shot && !weapon.loaded) {
    fighter.reloading = true;
    return;
  }
  fighter.reloading = false;
  if (fighter.punch || fighter.cooldown > 0) return;
  fighter.aimAt = opponent.id;
  const zone = world.random() < gun.headShare ? 'head' : 'body';
  if (throwPunch(world, fighter, gun.move ?? 'shoot', zone)) {
    fighter.punch.quick = true;
    fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
  }
}
