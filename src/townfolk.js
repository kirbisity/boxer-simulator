// The canal town's own people on an ordinary day (places/canaltown.js): about ten of the game's plain men, women and
// children (story/scenes/sets.js setCivilian: the commoner's tunic) about the square and the quay, standing, sitting on
// their heels, washing at the water steps, two strolling; when a fight starts in the square they turn and walk to the
// nearest door and go in, and a few stop in their doorways to watch it.
//
// Drawing only. Their movement is the game's own: each one's standing sway and walk are recorded once, when the town is
// first shown, from a world of their own that nothing else touches (story/scenes/stage.js poses them as a story set's
// figures: at ease, on the heels, walking), and played back from then on as recorded poses moved over the ground. They
// have no bodies in any fight's world, nothing there sees or meets them, and they take nothing from it but where its
// fighters stand (townfolkUpdate). The whole crowd is drawn as two skinned meshes, a near body and a far one
// (townfolkview.js).

import { advance, createWorld, seededRandom } from './physics.js';
import { P, PARTICLES } from './body.js';
import { stageSetFigures, poseSetFigures } from './story/scenes/stage.js';
import { setCivilian, setYaw, STORY_SET, storyChildHeight } from './story/scenes/sets.js';

const FOLK_POINTS = PARTICLES.length;

// Who they are (age, height cm, hair, clothes): the town's people as the story's sets make them; a man of the south
// ~163 cm (as the sets' men), a woman ~150 cm (STORY_SET.womanHeight), children by age (STORY_SET.childHeight).
const FOLK_WHO = {
  man: { sex: 'male', age: 34, heightCm: 163, hair: 'topknot' },
  woman: { sex: 'female', age: 30, heightCm: STORY_SET.womanHeight, hair: 'bun' },
  old: { sex: 'male', age: 62, heightCm: 160, hair: 'topknot' },
  boy: { sex: 'male', age: 10, hair: 'topknot' },
  girl: { sex: 'female', age: 9, hair: 'bun' },
};
// The men's clothes: undyed and indigo hemp, faded (STORY_SET.clothes, and two more of the same cloth).
const FOLK_CLOTHES = [STORY_SET.clothes.old, { top: '#5e5648', bottom: '#2f2c28' }, { top: '#3e4a5c', bottom: '#4a4034' }];

/**
 * The town on an ordinary day (m, the town's axes: +x east, +z south; places/canaltown.js CANAL_TOWN: the square x -26..22,
 * z -11..11.5, its shopfronts at z -11 with their jars and baskets within 0.8 m of the wall, the quay's rail at z 11.5, the
 * water steps at x 9, the lane north out of the square at x 4..7.5 between two stone lions; the battle's court x ±18,
 * z ±9 is left to the fighters, so everyone stands about the square's edges). Each: who, where, his pose (a STORY_SET
 * pose, else standing at ease), what he faces; `stroll`: he walks to `to` and back, resting `rest` s at each end. Choices
 * for a working morning on a quay, by eye.
 */
export const TOWNFOLK = {
  people: [
    // A shopkeeper before his open front, and a woman at the next one's counter.
    { who: 'man', at: [-14.2, -9.8], face: [-14.2, 0] },
    { who: 'woman', at: [-11.6, -9.7], face: [-11.6, -12] },
    // An old man on his heels by a shopfront, watching the square.
    { who: 'old', at: [-6.4, -9.8], pose: 'sit', face: [-6.4, 0] },
    // Two men talking under the shops on the west side.
    { who: 'man', at: [-23.4, -6.4], face: [-22.4, -6.1] },
    { who: 'man', at: [-22.4, -6.1], face: [-23.4, -6.4] },
    // A woman washing at the water steps, a boy at the rail looking at the boats.
    { who: 'woman', at: [9.0, 11.0], pose: 'crouch', face: [9.0, 14] },
    { who: 'boy', at: [13.4, 10.6], face: [13.6, 14] },
    // A man walking the quay, a woman the shopfronts.
    { who: 'man', at: [-15, 10.0], stroll: { to: [4, 10.1], rest: 4 } },
    { who: 'woman', at: [9, -9.6], stroll: { to: [15.6, -9.6], rest: 6 } },
    // A girl on the east side, and a porter resting by the east shops.
    { who: 'girl', at: [20.4, -3.5], face: [10, -2] },
    { who: 'man', at: [20.8, -6.8], face: [0, -4] },
  ],
  seed: 7,
  // The walk (physics walk `move`, STORY_SET.walk: 0.5 its walk, over 0.7 a run): a brisk one, under a run. Leaving
  // the street it is played `hurry` times faster (cadence and ground both: the feet still keep their place); a
  // stroll on an ordinary day `stroll` times.
  pace: 0.62,
  hurry: 1.3,
  stroll: 0.8,
  // The recording (s): how long each is let settle into his pose or his gait, how long is kept, how often (Hz). The
  // standing sway is ~0.1-0.3 Hz (STORY_SET.ease.sway), so its clip is played forward and back (no seam); a walk's
  // stride is ~1.1 s (physics/config.js WORLD.walk.strideHz), so its clip is the one stride that best closes on itself.
  settle: 1.4,
  idle: 4,
  gait: 2,
  walk: 2.4,
  rate: 30,
  stride: [0.7, 1.6],
  // How they take a fight: each turns `notice` s after it starts (from the first look up to deciding to go: a few tenths
  // to a second and a half, seeded), comes round at `turn` rad/s (a walker turns a quarter in half a second), takes
  // `blend` s to get going or to stop (`rise` from the heels); `watchers` stop in their doorways to watch (grown people
  // whose door is at least `watchFrom` m from every fighter: a sword's swing and a step or two, and a little more), and
  // step in as soon as a fighter comes within `flee` m of them (a lunge and a step); a fight counts within `near` m of
  // the square's middle; the way to a door keeps `clear` m from every fighter where it can (a way inside that costs `intrude` m
  // for each metre it comes in), and `margin` m off a house's corner.
  notice: [0.3, 1.5],
  turn: 3.2,
  blend: 0.45,
  rise: 1.0,
  watchers: 3,
  watchFrom: 5,
  flee: 3.5,
  near: 45,
  clear: 2.5,
  intrude: 40,
  margin: 0.7,
  // At most this many go in at one door (a household and a neighbour or two); the rest look further.
  household: 3,
  // Going in: the doorway opened (the room's dark in it) when he is `open` m off, he steps up onto the sill over the last
  // `step` m, and is gone `inside` m past the leaves; the door is shut again `shut` s after. A watcher waits `aside` m
  // to the side of the doorstep while others go in, then stands `stand` m out from the leaves, on the sill. The lane north out of the square (`lane`, its way up past the gate): those who go
  // that way are gone round the gate's arch at its end.
  open: 1.5,
  step: 0.45,
  inside: 0.6,
  shut: 1.2,
  stand: 0.12,
  aside: 0.8,
  lane: [[5.75, -9.6], [5.75, -21.5]],
};

/** One of them made: a plain man, woman or child (sets.js setCivilian), seeded by his place in the list. */
export function townfolkInputs(person, index, seed = TOWNFOLK.seed) {
  const random = seededRandom(seed * 1009 + index * 7919);
  const kind = FOLK_WHO[person.who];
  const heightCm = (kind.heightCm ?? storyChildHeight(kind.age)) + Math.round((random() - 0.5) * 8);
  const clothes = person.who === 'woman' ? STORY_SET.clothes.woman : person.who === 'girl' ? STORY_SET.clothes.girl : person.who === 'boy' ? STORY_SET.clothes.boy : FOLK_CLOTHES[Math.floor(random() * FOLK_CLOTHES.length)];
  return setCivilian(random, { sex: kind.sex, age: kind.age + Math.round((random() - 0.5) * 10), heightCm, clothes, hair: kind.hair });
}

/** The 15 points of `fighter` now, in his own frame (x ahead, y up, z to his left) about `origin` [x, z] facing `yaw`. */
function folkLocalPoints(fighter, origin, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const out = new Float32Array(FOLK_POINTS * 3);
  for (let index = 0; index < FOLK_POINTS; index += 1) {
    const dx = fighter.x[index * 3] - origin[0];
    const dz = fighter.x[index * 3 + 2] - origin[1];
    // (Yaw turns +x toward -z: sets.js setYaw.)
    out[index * 3] = dx * cos - dz * sin;
    out[index * 3 + 1] = fighter.x[index * 3 + 1];
    out[index * 3 + 2] = -(dx * sin + dz * cos);
  }
  return out;
}

const folkPelvisOf = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];

/**
 * Each one's two clips, recorded on a world of their own: `idle` (his day pose held, swaying) and `walk` (one stride at his
 * pace, the ground moving under him at `speed` m/s), each a list of frames of local points (folkLocalPoints), and the man
 * they were recorded on (`fighter`, whose body the drawing is made from; his world is not stepped again). Returns
 * [{ fighter, idle, walk, speed }] in the order of `people`.
 */
export function recordTownfolk(people = TOWNFOLK.people, seed = TOWNFOLK.seed) {
  const spec = TOWNFOLK;
  const inputs = people.map((person, index) => townfolkInputs(person, index, seed));
  // (Five metres apart in a row, facing +x: nobody near anyone.)
  const spot = (index) => [0, index * 5];
  const world = createWorld(inputs.map((each) => ({ inputs: each, corner: 'red' })), { seed, arena: { halfX: 80, halfZ: 80 }, rules: { noStandards: true } });
  const record = (figures, seconds, kept, sample) => {
    const frames = people.map(() => []);
    const since = world.time;
    const each = 1 / spec.rate;
    advance(world, seconds - kept, () => poseSetFigures(world, figures, world.time - since));
    for (let k = 0; k * each < kept - 1e-9; k += 1) {
      advance(world, each, () => poseSetFigures(world, figures, world.time - since));
      world.fighters.forEach((fighter, index) => frames[index].push(sample(fighter, index)));
    }
    return frames;
  };
  // Standing (or on the heels) where he is, facing +x.
  const idleFigures = stageSetFigures(world, people.map((person, index) => ({ index, who: `folk-${index}`, at: spot(index), yaw: 0, pose: person.pose ?? 'stand', walk: null, hands: null })));
  const idle = record(idleFigures, spec.settle + spec.idle, spec.idle, (fighter, index) => folkLocalPoints(fighter, spot(index), 0));
  // Walking along +x at his pace, from where he stood.
  const walkFigures = stageSetFigures(world, people.map((person, index) => ({ index, who: `folk-${index}`, at: spot(index), yaw: 0, pose: 'walk', walk: { to: [70, spot(index)[1]], pace: spec.pace }, hands: null })));
  const walked = record(walkFigures, spec.gait + spec.walk, spec.walk, (fighter) => Float32Array.from(fighter.x.subarray(0, FOLK_POINTS * 3)));
  return people.map((person, index) => {
    const raw = walked[index];
    const hip = (k) => [raw[k][P.pelvis * 3], raw[k][P.pelvis * 3 + 2]];
    // His mean speed over the kept stretch, and the walk in his own frame about a point moving at it (what is left is
    // the stride's own sway and bob).
    const last = raw.length - 1;
    const speed = (hip(last)[0] - hip(0)[0]) / (last / spec.rate);
    const along = raw.map((x, k) => folkLocalPoints({ x }, [hip(0)[0] + (speed * k) / spec.rate, hip(0)[1]], 0));
    return { fighter: world.fighters[index], idle: idle[index], walk: townfolkStride(along), speed };
  });
}

/** The stride in `frames` (spec.rate Hz) that best closes on itself: the frames of one period, from the first. */
function townfolkStride(frames) {
  const spec = TOWNFOLK;
  const gap = (a, b) => {
    let sum = 0;
    for (let i = 0; i < a.length; i += 1) sum += (a[i] - b[i]) ** 2;
    return sum;
  };
  let best = Math.round(spec.stride[0] * spec.rate);
  let least = Infinity;
  for (let period = Math.round(spec.stride[0] * spec.rate); period <= Math.round(spec.stride[1] * spec.rate) && period < frames.length; period += 1) {
    let sum = 0;
    for (let k = 0; k + period < frames.length; k += 1) sum += gap(frames[k], frames[k + period]);
    const mean = sum / (frames.length - period);
    if (mean < least) {
      least = mean;
      best = period;
    }
  }
  return frames.slice(0, best);
}

// ---- On the day: where each is and what he does ---------------------------------------------------------------------------

const FOLK_GROWN = ['man', 'woman', 'old'];
const folkSmooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const folkTurn = (from, to, most) => {
  const gap = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return from + Math.max(-most, Math.min(most, gap));
};

/** Whether [x, z] stands within `grow` m of a house's plan (each { at, yaw, width, depth }, townkit's tkHouse spec). */
function folkInHouse(house, x, z, grow) {
  const cos = Math.cos(house.yaw ?? 0);
  const sin = Math.sin(house.yaw ?? 0);
  const dx = x - house.at[0];
  const dz = z - house.at[1];
  return Math.abs(dx * cos - dz * sin) < house.width / 2 + grow && Math.abs(dx * sin + dz * cos) < house.depth / 2 + grow;
}

/** The first house the straight way from `a` to `b` passes through (sampled every 0.2 m), or null. */
function folkHouseBetween(houses, a, b, grow) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / 0.2));
  for (let k = 0; k <= steps; k += 1) {
    const x = a[0] + ((b[0] - a[0]) * k) / steps;
    const z = a[1] + ((b[1] - a[1]) * k) / steps;
    const house = houses.find((each) => folkInHouse(each, x, z, grow));
    if (house) return house;
  }
  return null;
}

/** The way from `a` to `b` round the houses: straight, else by the corner of the house in the way that is shortest. */
function folkWayRound(houses, a, b) {
  const spec = TOWNFOLK;
  const grow = 0.3;
  const house = folkHouseBetween(houses, a, b, grow);
  if (!house) return [b];
  const cos = Math.cos(house.yaw ?? 0);
  const sin = Math.sin(house.yaw ?? 0);
  const corners = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([u, v]) => {
    const lx = u * (house.width / 2 + spec.margin + grow);
    const lz = v * (house.depth / 2 + spec.margin + grow);
    return [house.at[0] + lx * cos + lz * sin, house.at[1] - lx * sin + lz * cos];
  });
  const ways = corners.filter((corner) => !folkHouseBetween(houses, a, corner, grow) && !folkHouseBetween(houses, corner, b, grow));
  if (!ways.length) return [b];
  const length = (corner) => Math.hypot(corner[0] - a[0], corner[1] - a[1]) + Math.hypot(b[0] - corner[0], b[1] - corner[1]);
  return [ways.reduce((best, corner) => (length(corner) < length(best) ? corner : best)), b];
}

const folkRouteLength = (from, route) => route.reduce((sum, point, k) => sum + Math.hypot(point[0] - (k ? route[k - 1] : from)[0], point[1] - (k ? route[k - 1] : from)[1]), 0);

/** How near the way `route` from `from` comes to any of `men` ([x, z]). */
function folkRouteClearance(from, route, men) {
  let least = Infinity;
  let at = from;
  for (const point of route) {
    const length = Math.hypot(point[0] - at[0], point[1] - at[1]);
    const steps = Math.max(1, Math.ceil(length / 0.5));
    for (let k = 0; k <= steps; k += 1) {
      const x = at[0] + ((point[0] - at[0]) * k) / steps;
      const z = at[1] + ((point[1] - at[1]) * k) / steps;
      for (const man of men) least = Math.min(least, Math.hypot(man[0] - x, man[1] - z));
    }
    at = point;
  }
  return least;
}

/**
 * The town's people as they are now: made from the clips (recordTownfolk) where TOWNFOLK puts them on an ordinary day.
 * `doors` (places/canaltown.js canalTownDoors), `houses` (the plan's houses near the square, to walk round),
 * `floor(x, z)` the ground's height.
 */
export function createTownfolk(clips, { doors = [], houses = [], floor = () => 0, people = TOWNFOLK.people, seed = TOWNFOLK.seed } = {}) {
  const random = seededRandom(seed * 31 + 5);
  const folk = people.map((person, index) => {
    const clip = clips[index];
    const toward = person.face ?? person.stroll?.to ?? [person.at[0] + 1, person.at[1]];
    return {
      index, person, clip, at: [...person.at], yaw: setYaw(person.at, toward), mix: 0, rising: person.pose && person.pose !== 'stand',
      // (Each sways on his own: started at his own point of the clip.)
      idleTime: random() * TOWNFOLK.idle, phase: 0, pace: TOWNFOLK.stroll, route: [], resting: person.stroll ? random() * person.stroll.rest : 0, leg: 0,
      exit: null, watching: false, gone: false, noticeAt: null, lift: 0, frames: null,
    };
  });
  return { folk, doors: doors.map((door) => ({ ...door, openUntil: -Infinity })), houses, floor, fight: null, time: 0, random };
}

/** The fight now among `fighters` (a world's): where its men are, if two sides are up and it is near enough the square; else null. */
export function townfolkFight(fighters) {
  const men = [];
  const corners = new Set();
  for (const fighter of fighters) {
    if (fighter.state !== 'up' || fighter.fled || fighter.dormant) continue;
    men.push([fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]]);
    corners.add(fighter.corner);
  }
  if (corners.size < 2) return null;
  const at = [men.reduce((sum, man) => sum + man[0], 0) / men.length, men.reduce((sum, man) => sum + man[1], 0) / men.length];
  return Math.hypot(at[0], at[1]) < TOWNFOLK.near ? { at, men } : null;
}

/** Each one's way off the street once the fight is on: to a door (in, or to watch from it) or up the lane. */
function folkChooseExits(town, fight) {
  const spec = TOWNFOLK;
  const { doors, houses } = town;
  // (A watcher comes up beside the doorstep, `aside` m along the front, and steps into the doorway once the others are in.)
  const doorWay = (one, door, watch) => {
    const side = watch ? spec.aside : 0;
    const step = [door.at[0] + door.out[0] * 0.8 + door.out[1] * side, door.at[1] + door.out[1] * 0.8 - door.out[0] * side];
    const end = watch ? spec.stand : -(door.leaf + spec.inside);
    return [...folkWayRound(houses, one.at, step), [door.at[0] + door.out[0] * end, door.at[1] + door.out[1] * end]];
  };
  // (A way that passes a fighter closer than `clear` m costs `intrude` m more for every metre it comes inside that.)
  const cost = (one, route) => folkRouteLength(one.at, route) + spec.intrude * Math.max(0, spec.clear - folkRouteClearance(one.at, route, fight.men));
  const left = town.folk.filter((one) => !one.gone && !one.exit);
  // Each to the cheapest way: a door not yet full, or up the lane out of the square. (Those nearest a door first: the
  // man by it gets in, the one across the square looks further.)
  const going = new Map();
  const nearest = new Map(left.map((one) => [one, Math.min(...doors.map((door) => Math.hypot(door.at[0] - one.at[0], door.at[1] - one.at[1])))]));
  for (const one of [...left].sort((p, q) => nearest.get(p) - nearest.get(q))) {
    const options = doors.map((door, index) => ({ exit: { door: index, watch: false }, route: doorWay(one, door, false) })).filter((option) => (going.get(option.exit.door) ?? []).length < spec.household);
    options.push({ exit: { lane: true }, route: [...folkWayRound(houses, one.at, spec.lane[0]), spec.lane[1]] });
    const best = options.map((option) => ({ ...option, cost: cost(one, option.route) })).reduce((p, q) => (q.cost < p.cost ? q : p));
    Object.assign(one, { exit: best.exit, route: best.route });
    if (best.exit.door !== undefined) going.set(best.exit.door, [...(going.get(best.exit.door) ?? []), one]);
  }
  // At each door far enough from every fighter, the last grown one to reach it stops in the doorway to watch (the others
  // are in before him), up to `watchers` doors, the safest first.
  const safest = [...going.keys()].map((index) => ({ index, apart: Math.min(...fight.men.map((man) => Math.hypot(doors[index].at[0] - man[0], doors[index].at[1] - man[1]))) }))
    .filter(({ apart }) => apart >= spec.watchFrom).sort((p, q) => q.apart - p.apart).slice(0, spec.watchers);
  for (const { index } of safest) {
    const grown = going.get(index).filter((one) => FOLK_GROWN.includes(one.person.who));
    if (!grown.length) continue;
    const last = grown.reduce((p, q) => (folkRouteLength(q.at, q.route) > folkRouteLength(p.at, p.route) ? q : p));
    Object.assign(last, { exit: { door: index, watch: true }, route: doorWay(last, doors[index], true) });
  }
}

/** One step of `dt` s: everyone's day, or their going once a fight is on (`fight`: townfolkFight). */
export function townfolkStep(town, dt, fight) {
  const spec = TOWNFOLK;
  town.time += dt;
  // The fight begins: each chooses his way now (where its men stand now), and sets off once he has taken it in.
  if (fight && !town.fight) {
    folkChooseExits(town, fight);
    for (const one of town.folk) {
      if (one.gone) continue;
      Object.assign(one, { noticeAt: town.time + spec.notice[0] + (spec.notice[1] - spec.notice[0]) * town.random(), pace: spec.hurry, resting: 0 });
    }
  }
  if (fight) town.fight = fight;
  for (const one of town.folk) {
    if (one.gone) continue;
    one.idleTime += dt;
    const waiting = one.exit?.watch && one.route.length === 1 && town.folk.some((other) => other !== one && !other.gone && other.exit?.door === one.exit.door && !other.exit.watch);
    const moving = one.route.length > 0 && !(one.resting > 0) && !(one.exit && town.time < one.noticeAt) && !waiting;
    if (moving) {
      const target = one.route[0];
      const want = setYaw(one.at, target);
      one.yaw = folkTurn(one.yaw, want, spec.turn * dt);
      const blend = one.rising ? spec.rise : spec.blend;
      one.mix = Math.min(1, one.mix + dt / blend);
      if (one.mix >= 1) one.rising = false;
      const align = Math.max(0, Math.cos(want - one.yaw));
      const speed = one.clip.speed * one.pace * one.mix * align;
      const distance = Math.hypot(target[0] - one.at[0], target[1] - one.at[1]);
      const travel = Math.min(distance, speed * dt);
      if (distance < 0.05 || distance <= speed * dt) {
        one.at = [...target];
        one.route.shift();
      } else {
        one.at[0] += Math.cos(one.yaw) * travel;
        one.at[1] -= Math.sin(one.yaw) * travel;
      }
      one.phase += dt * spec.rate * one.pace * one.mix;
    } else {
      one.mix = Math.max(0, one.mix - dt / spec.blend);
      if (one.mix > 0) one.phase += dt * spec.rate * one.pace * one.mix;
    }
    // At a door: the room's dark shown as he comes near; on the sill as he steps in; gone past the leaves.
    const door = one.exit?.door !== undefined ? town.doors[one.exit.door] : null;
    if (door) {
      const out = (one.at[0] - door.at[0]) * door.out[0] + (one.at[1] - door.at[1]) * door.out[1];
      const along = Math.abs((one.at[0] - door.at[0]) * door.out[1] - (one.at[1] - door.at[1]) * door.out[0]);
      if (out < spec.open + 0.8 && along < 1.5) door.openUntil = Math.max(door.openUntil, town.time + spec.shut);
      one.lift = along < door.wide / 2 && out > -1 ? door.sill * folkSmooth((spec.step - out) / (spec.step - spec.stand)) : 0;
      if (!one.exit.watch && !one.route.length) one.gone = true;
      // (A watcher steps in when the fighting comes to his door.)
      if (one.exit.watch && fight?.men.some((man) => Math.hypot(man[0] - one.at[0], man[1] - one.at[1]) < spec.flee)) {
        Object.assign(one, { exit: { door: one.exit.door, watch: false }, watching: false, route: [[door.at[0] - door.out[0] * (door.leaf + spec.inside), door.at[1] - door.out[1] * (door.leaf + spec.inside)]] });
        door.openUntil = town.time + spec.shut;
      }
      if (one.exit.watch && !one.route.length) {
        one.watching = true;
        door.openUntil = Infinity;
      }
      // (Waiting beside the door or in it, he turns to the fight.)
      if (one.exit.watch && (waiting || !one.route.length) && town.fight) one.yaw = folkTurn(one.yaw, setYaw(one.at, town.fight.at), spec.turn * 0.5 * dt);
    }
    if (one.exit?.lane && !one.route.length) one.gone = true;
    // An ordinary day: the strollers walk their beat and rest at each end.
    if (!town.fight && one.person.stroll && !one.route.length) {
      if (one.resting > 0) one.resting -= dt;
      else if (one.walked) Object.assign(one, { resting: one.person.stroll.rest, walked: false });
      else {
        one.leg = 1 - one.leg;
        Object.assign(one, { route: [one.leg ? one.person.stroll.to : one.person.at], walked: true });
      }
    }
  }
}

/** A clip's frame at `time` (frames, fractional), looped (`loop`) or played forward and back. */
function folkClipAt(frames, time, loop, out) {
  const count = frames.length;
  let at;
  if (loop) at = ((time % count) + count) % count;
  else {
    const span = 2 * (count - 1);
    const t = ((time % span) + span) % span;
    at = t <= count - 1 ? t : span - t;
  }
  const k = Math.floor(at);
  const f = at - k;
  const a = frames[k];
  const b = frames[loop ? (k + 1) % count : Math.min(count - 1, k + 1)];
  for (let i = 0; i < a.length; i += 1) out[i] = a[i] + (b[i] - a[i]) * f;
  return out;
}

const folkIdleNow = new Float32Array(FOLK_POINTS * 3);
const folkWalkNow = new Float32Array(FOLK_POINTS * 3);

/** One person's 15 points in the town now ([x, y, z] each, as physics.js lays a fighter's): his clips blended, set where he stands. */
export function townfolkPoints(town, one) {
  folkClipAt(one.clip.idle, one.idleTime * TOWNFOLK.rate, false, folkIdleNow);
  if (one.mix > 0) folkClipAt(one.clip.walk, one.phase, true, folkWalkNow);
  const cos = Math.cos(one.yaw);
  const sin = Math.sin(one.yaw);
  const ground = town.floor(one.at[0], one.at[1]) + one.lift;
  const points = [];
  for (let index = 0; index < FOLK_POINTS; index += 1) {
    const at = index * 3;
    const lx = one.mix > 0 ? folkIdleNow[at] + (folkWalkNow[at] - folkIdleNow[at]) * one.mix : folkIdleNow[at];
    const ly = one.mix > 0 ? folkIdleNow[at + 1] + (folkWalkNow[at + 1] - folkIdleNow[at + 1]) * one.mix : folkIdleNow[at + 1];
    const lz = one.mix > 0 ? folkIdleNow[at + 2] + (folkWalkNow[at + 2] - folkIdleNow[at + 2]) * one.mix : folkIdleNow[at + 2];
    points.push([one.at[0] + lx * cos - lz * sin, ground + ly, one.at[1] - lx * sin - lz * cos]);
  }
  return points;
}
