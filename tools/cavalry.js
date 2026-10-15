// Cavalry collisions, measured: a horse at the gallop (its rider on it, no
// blow struck) ridden straight into a man on foot, a line of men, or another
// horse. For each: the horse's speed before and after, how fast and how far
// the man was thrown, who went down, what harm the impact did, and which
// horses fell and threw their riders.
// Usage: node tools/cavalry.js [seeds] [case ...]
//   cases: lone bare plate line pikes head glance angle

import { BODY, P, PRESETS } from '../src/body.js';
import { think } from '../src/ai.js';
import { advance, closestBetween, createWorld, placeFighter, point, WORLD } from '../src/physics.js';
import { vec } from '../src/pose.js';

const [seedsArg = '5', ...named] = process.argv.slice(2);
const seeds = Number(seedsArg);
const FIELD = { halfX: 30, halfZ: 20 };
const rider = (key, extra = {}) => ({ ...structuredClone(PRESETS[key]), mounted: true, ...extra });
const footman = (key, extra = {}) => ({ ...structuredClone(PRESETS[key]), ...extra });
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : NaN;
};
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const fmt = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '-');

/** A block of men: `files` abreast `across` m apart, `ranks` deep `deep` m apart, the first rank at x = 12. */
const block = (files, ranks, across = 0.7, deep = 0.8) => Array.from({ length: files * ranks }, (_, index) => [12 + Math.floor(index / files) * deep, ((index % files) - (files - 1) / 2) * across]);
const men = (key, count, extra = {}) => Array.from({ length: count }, () => footman(key, extra));

// Cases: the riders (corner red unless said), who stands where (still, unless `think`), and where each rider heads.
const CASES = {
  bare: { label: 'destrier v a bare man standing', riders: [rider('knight')], foot: men('street', 1, { style: 'unskilled' }), footAt: [[12, 0]] },
  plate: { label: 'destrier v a man in plate standing', riders: [rider('knight')], foot: men('knight', 1, { style: 'unskilled' }), footAt: [[12, 0]] },
  lone: { label: 'steppe horse v a bare man standing', riders: [rider('kheshig')], foot: men('street', 1, { style: 'unskilled' }), footAt: [[12, 0]] },
  loose: { label: 'destrier v 3 shield-and-spear men 1.8 m apart, standing', riders: [rider('knight')], foot: men('hoplomachus', 3), footAt: block(3, 1, 1.8) },
  wall3: { label: 'destrier v 3 shield-and-spear men abreast in close order, standing', riders: [rider('knight')], foot: men('hoplomachus', 3), footAt: block(3, 1) },
  wall6: { label: 'destrier v 6 shield-and-spear men, 3 abreast 2 deep, standing', riders: [rider('knight')], foot: men('hoplomachus', 6), footAt: block(3, 2) },
  wall9: { label: 'destrier v 9 shield-and-spear men, 3 abreast 3 deep, standing', riders: [rider('knight')], foot: men('hoplomachus', 9), footAt: block(3, 3) },
  plates: { label: 'destrier v 6 men in plate, 3 abreast 2 deep, standing', riders: [rider('knight')], foot: men('knight', 6, { style: 'unskilled' }), footAt: block(3, 2, 0.8) },
  pikes: { label: 'destrier v 6 yari men, 3 abreast 2 deep, braced (they fight)', riders: [rider('knight')], foot: men('yari', 6), footAt: block(3, 2), think: true },
  pikes1: { label: 'destrier v 1 yari man, braced (he fights)', riders: [rider('knight')], foot: men('yari', 1), footAt: [[12, 0]], think: true },
  head: { label: 'destrier v destrier head-on', riders: [rider('knight'), rider('knight')], mountedBlue: true },
  glance: { label: 'destrier v destrier, passing 0.45 m abreast', riders: [rider('knight'), rider('knight')], mountedBlue: true, offset: 0.45 },
  pass55: { label: 'destrier v destrier, passing 0.55 m abreast', riders: [rider('knight'), rider('knight')], mountedBlue: true, offset: 0.55 },
  pass65: { label: 'destrier v destrier, passing 0.65 m abreast (barrels brushing)', riders: [rider('knight'), rider('knight')], mountedBlue: true, offset: 0.65 },
  angle: { label: 'destrier v destrier crossing at 40 degrees', riders: [rider('knight'), rider('knight')], mountedBlue: true, angle: 0.7 },
  light: { label: 'steppe v steppe horse head-on', riders: [rider('kheshig'), rider('kheshig')], mountedBlue: true },
  mixed: { label: 'steppe horse v destrier head-on', riders: [rider('kheshig'), rider('knight')], mountedBlue: true },
};
const wanted = named.length ? named : Object.keys(CASES);

/** A horse's barrel, neck or head touching a man's trunk, or another horse's. */
function touching(horses, men) {
  return horses.some((horse) => horse.capsules.some((one) => {
    if (one.part === 'legs') return false;
    for (const man of men) {
      if (man.mount) continue;
      const closest = closestBetween(one.a, one.b, point(man.x, P.pelvis), point(man.x, P.neck));
      if (vec.length(vec.sub(closest.onFirst, closest.onSecond)) < one.radius + man.body.segments.trunk.skinRadius) return true;
    }
    for (const other of horses) {
      if (other === horse) continue;
      for (const two of other.capsules) {
        if (two.part === 'legs') continue;
        const closest = closestBetween(one.a, one.b, two.a, two.b);
        if (vec.length(vec.sub(closest.onFirst, closest.onSecond)) < one.radius + two.radius) return true;
      }
    }
    return false;
  }));
}

function run(spec, seed) {
  const sides = spec.mountedBlue
    ? [{ inputs: spec.riders[0], corner: 'red' }, { inputs: spec.riders[1], corner: 'blue' }]
    : [{ inputs: spec.riders[0], corner: 'red' }, ...spec.foot.map((inputs) => ({ inputs, corner: 'blue' }))];
  const world = createWorld(sides, { seed, arena: FIELD, formation: {} });
  const men = world.fighters.slice(1);
  const knight = world.fighters[0];
  // The men on foot where the case puts them.
  if (spec.footAt) {
    spec.footAt.forEach(([x, z], index) => placeFighter(men[index], x, z));
  }
  const horses = world.horses;
  // Mounted v mounted: the blue horse put on its own line, meeting red's at the middle (or passing it `offset` m to the side).
  if (spec.mountedBlue) {
    const [, blue] = horses;
    const angle = spec.angle ?? 0;
    const dist = 12;
    const at = [dist * Math.cos(angle), -dist * Math.sin(angle) - (spec.offset ?? 0)];
    const man = world.fighters[blue.rider];
    placeFighter(man, at[0], at[1]);
    blue.at = at;
    blue.yaw = Math.PI + angle;
    man.yaw = blue.yaw;
  }
  const samples = [];
  let contactAt = null;
  const start = new Map(men.map((man) => [man.id, point(man.x, P.pelvis)]));
  const speeds = () => ({ horse: horses.map((horse) => horse.speed), men: men.map((man) => Math.hypot(...point(man.v, P.pelvis))) });
  const pre = { horse: 0 };
  let low = horses.map(() => Infinity);
  for (let t = 0; t < 9; t += 1 / 60) {
    // The riders ride straight at the gallop (no blow struck); men on foot stand, or fight if the case says.
    for (const horse of horses) {
      const mine = world.fighters[horse.rider];
      if (!mine) continue;
      const toward = spec.mountedBlue ? (mine.corner === 'red' ? 0 : Math.PI + (spec.angle ?? 0)) : 0;
      horse.goal = { heading: toward, speed: horse.paces.gallop };
      horse.goalAt = world.time + 1;
      mine.cooldown = 1;
    }
    advance(world, 1 / 60, (current, dt) => {
      if (spec.think) for (const man of men) think(current, man, dt);
      else for (const man of men) man.move = 0;
    });
    const now = speeds();
    samples.push({ t: world.time, ...now });
    if (contactAt === null) {
      if (touching(horses, men) || world.events.some((event) => event.kind === 'trampled' || event.kind === 'horseCrash')) contactAt = world.time;
      else pre.horse = Math.max(pre.horse, ...now.horse);
    }
    // (The speed it is brought to in the half second after: its legs soon gather it up again.)
    if (contactAt !== null && world.time - contactAt < 0.5) low = low.map((value, index) => Math.min(value, now.horse[index]));
    if (contactAt !== null && world.time - contactAt > 4) break;
  }
  const window = (s) => contactAt !== null && s.t >= contactAt - 0.1 && s.t <= contactAt + 1.5;
  const fellMen = men.filter((man) => world.events.some((event) => event.fighter === man.id && event.kind === 'fell'));
  return {
    contacted: contactAt !== null,
    horseBefore: pre.horse,
    horseLow: low,
    manPeak: men.map((man, index) => Math.max(0, ...samples.filter(window).map((s) => s.men[index]))),
    thrown: men.map((man) => Math.hypot(...[0, 2].map((axis) => point(man.x, P.pelvis)[axis] - start.get(man.id)[axis]))),
    fell: fellMen.length,
    men: men.length,
    out: men.filter((man) => man.state === 'out').length,
    dead: men.filter((man) => (man.trauma?.trunk ?? 0) >= WORLD.injury.trunkFatal || world.events.some((event) => event.kind === 'killed' && event.fighter === man.id)).length,
    ribs: men.filter((man) => man.injuries.some((injury) => injury.kind === 'rib')).length,
    horsesKilled: world.events.filter((event) => event.kind === 'horseDown' && /killed by the blows|heap of the men/.test(event.effects[0] ?? '')).length,
    trunk: men.map((man) => man.trauma?.trunk ?? 0),
    horsesDown: world.events.filter((event) => event.kind === 'horseDown').length,
    riderThrown: world.events.filter((event) => event.kind === 'unhorsed').length,
    horseHurt: horses.map((horse) => horse.trauma / (WORLD.mount.horse.trunkFatal * BODY.toughness)),
  };
}

for (const key of wanted) {
  const spec = CASES[key];
  const rows = [];
  for (let seed = 0; seed < seeds; seed += 1) rows.push(run(spec, 4000 + seed));
  console.log(`\n${spec.label} (${seeds} seeds)`);
  const horses = rows[0].horseLow.length;
  console.log(`  contact ${rows.filter((r) => r.contacted).length}/${seeds}; horse speed ${fmt(median(rows.map((r) => r.horseBefore)))} -> low within 0.5 s ${Array.from({ length: horses }, (_, i) => fmt(median(rows.map((r) => r.horseLow[i])))).join(' / ')} m/s; horses down ${rows.reduce((s, r) => s + r.horsesDown, 0)}/${seeds * horses}; riders thrown ${rows.reduce((s, r) => s + r.riderThrown, 0)}/${seeds * horses}; horse blunt harm, 1 kills ${Array.from({ length: horses }, (_, i) => fmt(median(rows.map((r) => r.horseHurt[i])), 2)).join(' / ')} (killed ${rows.reduce((s, r) => s + r.horsesKilled, 0)})`);
  if (!spec.mountedBlue) {
    const all = (pick) => rows.flatMap(pick);
    console.log(`  ${rows[0].men} man(men): fell ${rows.reduce((s, r) => s + r.fell, 0)}/${rows.reduce((s, r) => s + r.men, 0)}, out ${rows.reduce((s, r) => s + r.out, 0)}; peak speed ${fmt(median(all((r) => r.manPeak)))} m/s (max ${fmt(Math.max(...all((r) => r.manPeak)))}), thrown ${fmt(median(all((r) => r.thrown)))} m (max ${fmt(Math.max(...all((r) => r.thrown)))}), ribs broken ${rows.reduce((s, r) => s + r.ribs, 0)}, dead ${rows.reduce((s, r) => s + r.dead, 0)}; trunk trauma ${fmt(median(all((r) => r.trunk)), 2)} (max ${fmt(Math.max(...all((r) => r.trunk)), 2)}; fatal 2.5)`);
  } else {
    console.log(`  rider trunk trauma ${fmt(mean(rows.flatMap((r) => r.trunk)), 2)}`);
  }
}
