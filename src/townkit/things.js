// The town kit's small things: what lies and stands about a lived-in or fought-over place (baskets, tubs, firewood,
// carts, poles, sacks; braziers, stacked stone and timber, ladders, shields, spent arrows), what grows and gathers
// where nobody tidies (tufts of grass and weed, stones, straw and fallen leaves), and what winter hangs on an eave.
// Each maker lays one thing through a builder (townkit/geo.js); tkScatter places the growing and gathering things by
// rule from the place's lie (townkit/lay.js), never by hand.
//
// Sizes are those of the ordinary things themselves (a carrying basket half a metre across, a billet of firewood
// a forearm long, a two-wheeled handcart a man can push), by eye and approximate; none is taken from a source.

import { tkgFrame } from './geo.js';
import { tkFbm, tkRandom } from './tex.js';

/** Colours of the common stuffs, multiplied into the sheets they are drawn with. */
export const TK_THINGS = {
  // How many sides a turned thing has: a jar, basket, tub or heap (`vessel`), a wheel's rim (`wheel`). A person
  // stands beside these and looks down at them: at 7 to 12 sides their rims were plainly polygons from a metre off.
  sides: { vessel: 16, wheel: 20 },
  wicker: [0.62, 0.5, 0.32], bamboo: [0.66, 0.6, 0.36], oldWood: [0.42, 0.36, 0.3], splitWood: [0.72, 0.6, 0.42], barkWood: [0.34, 0.28, 0.22],
  hemp: [0.62, 0.56, 0.44], iron: [0.16, 0.15, 0.15], ash: [0.3, 0.29, 0.28], stone: [0.74, 0.73, 0.7], straw: [0.78, 0.68, 0.4],
  // Grass and weeds: in leaf, and winter-dead.
  green: [0.5, 0.62, 0.3], dead: [0.8, 0.7, 0.46],
  // Fallen leaves and trodden straw lying on the ground.
  leafLitter: [[0.5, 0.36, 0.18], [0.42, 0.4, 0.2], [0.58, 0.46, 0.22]],
};

// A slow unevenness along a run or over the ground: fractal noise 0..1 with a grain of about one unit of (x, z)
// (the kit's tiling noise, tex.js tkFbm, over a repeat of 256 units: far wider than anything it is used along).
const tktRough = (x, z) => tkFbm(x / 256 + 0.5, z / 256 + 0.5, 256, 3, 7);

const tktTone = (colour, random, spread = 0.25) => colour.map((value) => value * (1 - spread / 2 + spread * random()));

/** A wicker basket standing at world (x, y, z): `wide` m across its mouth, `high` m; `full`: heaped with something of that colour. */
export function tkBasket(builder, x, y, z, { wide = 0.5, high = 0.36, colour = TK_THINGS.wicker, full = null } = {}) {
  const r = wide / 2;
  const frame = tkgFrame(x, y, z);
  builder.lathe('timber', frame, 0, 0, [[r * 0.7, 0], [r * 0.84, high * 0.2], [r * 0.94, high * 0.5], [r * 0.99, high * 0.8], [r, high], [r * 0.9, high]], { colour, sides: TK_THINGS.sides.vessel });
  builder.round('ware', frame, 0, 0, high * (full ? 0.8 : 0.12), high * (full ? 1.12 : 0.14), r * 0.9, full ? r * 0.35 : r * 0.7, { colour: full ?? colour.map((value) => value * 0.5), sides: TK_THINGS.sides.vessel });
}

/** A coopered tub or bucket standing at world (x, y, z). */
export function tkTub(builder, x, y, z, { wide = 0.42, high = 0.32, colour = TK_THINGS.oldWood } = {}) {
  const r = wide / 2;
  const frame = tkgFrame(x, y, z);
  builder.lathe('timber', frame, 0, 0, [[r * 0.82, 0], [r, high], [r * 0.9, high]], { colour, sides: TK_THINGS.sides.vessel });
  builder.round('timber', frame, 0, 0, high * 0.2, high * 0.22, r * 0.86, r * 0.86, { colour: colour.map((value) => value * 0.45), sides: TK_THINGS.sides.vessel });
}

/** A stack of split firewood against a wall: `long` m along `frame`'s x, `high` m, the billets `deep` m long lying along its z. */
export function tkFirewood(builder, frame, { long = 1.6, high = 0.8, deep = 0.42, seed = 1 } = {}) {
  const random = tkRandom(seed * 131 + 7);
  let y = 0;
  while (y < high) {
    const r = 0.045 + 0.03 * random();
    let x = -long / 2 + r + random() * 0.05;
    // (The top rows are short of the ends: a stack is drawn down where it was last taken from.)
    const short = y > high * 0.6 ? long * 0.25 * random() : 0;
    while (x < long / 2 - r - short) {
      const rr = r * (0.8 + 0.4 * random());
      const lean = (random() - 0.5) * 0.04;
      const end = random() < 0.5;
      builder.tube('timber', [frame(x, y + rr, (random() - 0.5) * 0.05), frame(x + lean, y + rr, deep + (random() - 0.5) * 0.06)], rr, rr, { sides: 5, colour: tktTone(end ? TK_THINGS.splitWood : TK_THINGS.barkWood, random) });
      // (The end grain facing out.)
      const face = frame(x + lean, y + rr, deep);
      const tint = tktTone(TK_THINGS.splitWood, random);
      for (let k = 0; k < 5; k += 1) {
        const [a0, a1] = [(k / 5) * Math.PI * 2, ((k + 1) / 5) * Math.PI * 2];
        builder.tri('timber', face, frame(x + lean + Math.cos(a0) * rr, y + rr + Math.sin(a0) * rr, deep), frame(x + lean + Math.cos(a1) * rr, y + rr + Math.sin(a1) * rr, deep), [[0, 0], [rr, 0], [rr, rr]], tint);
      }
      x += rr * 2 + 0.005;
    }
    y += r * 1.8;
  }
}

/** A wheel standing in the plane across `frame`'s x at (x, y, z) in it: a felloe, a nave and spokes. */
function tktWheel(builder, frame, x, y, z, r, colour) {
  const cuts = TK_THINGS.sides.wheel;
  const ring = (k, radius, off) => frame(x + off, y + Math.sin((k / cuts) * Math.PI * 2) * radius, z + Math.cos((k / cuts) * Math.PI * 2) * radius);
  for (let k = 0; k < cuts; k += 1) {
    for (const side of [-1, 1]) {
      const off = side * 0.03;
      const quad = [ring(k, r * 0.84, off), ring(k + 1, r * 0.84, off), ring(k + 1, r, off), ring(k, r, off)];
      builder.quad('timber', ...(side > 0 ? quad : [...quad].reverse()), { colour });
    }
    builder.quad('timber', ring(k, r, -0.03), ring(k, r, 0.03), ring(k + 1, r, 0.03), ring(k + 1, r, -0.03), { colour: colour.map((value) => value * 0.7) });
    if (k % Math.round(cuts / 6) === 0) builder.tube('timber', [frame(x, y, z), ring(k, r * 0.86, 0)], 0.018, 0.018, { sides: 4, colour });
  }
  builder.tube('timber', [frame(x - 0.07, y, z), frame(x + 0.07, y, z)], 0.07, 0.07, { sides: 6, colour });
}

/** A two-wheeled handcart standing at `frame` (its shafts toward +z), resting on its legs or tipped onto its shafts (`tipped`). */
export function tkCart(builder, frame, { long = 1.7, wide = 0.95, wheel = 0.42, colour = TK_THINGS.oldWood, tipped = false, load = null } = {}) {
  const tilt = tipped ? -0.3 : 0;
  // (The bed's frame turns about the axle.)
  const bed = (x, y, z) => frame(x, wheel + y * Math.cos(tilt) - z * Math.sin(tilt), z * Math.cos(tilt) + y * Math.sin(tilt));
  const plank = (x0, x1, y0, y1, z0, z1, tint) => {
    const p = (x, y, z) => bed(x, y, z);
    builder.quad('timber', p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), p(x0, y1, z0), { colour: tint });
    builder.quad('timber', p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1), { colour: tint.map((value) => value * 0.6) });
    builder.quad('timber', p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), { colour: tint.map((value) => value * 0.8) });
    builder.quad('timber', p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), { colour: tint.map((value) => value * 0.8) });
    builder.quad('timber', p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), { colour: tint.map((value) => value * 0.7) });
    builder.quad('timber', p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), { colour: tint.map((value) => value * 0.7) });
  };
  plank(-wide / 2, wide / 2, 0.06, 0.1, -long / 2, long / 2, colour);
  for (const side of [-1, 1]) {
    plank(side * wide / 2 - 0.02, side * wide / 2 + 0.02, 0.1, 0.34, -long / 2, long / 2, colour.map((value) => value * 0.9));
    // The shaft, running on forward of the bed.
    builder.tube('timber', [bed(side * (wide / 2 - 0.05), 0.03, -long / 2), bed(side * (wide / 2 - 0.05), 0.03, long / 2 + 1.0)], 0.028, 0.024, { sides: 5, colour });
    tktWheel(builder, frame, side * (wide / 2 + 0.07), wheel, 0, wheel, colour.map((value) => value * 0.85));
    if (!tipped) builder.tube('timber', [bed(side * (wide / 2 - 0.08), 0.06, long / 2 - 0.1), frame(side * (wide / 2 - 0.08), 0, long / 2 - 0.1)], 0.022, 0.022, { sides: 4, colour });
  }
  plank(-wide / 2, wide / 2, 0.1, 0.34, -long / 2 - 0.02, -long / 2 + 0.02, colour.map((value) => value * 0.9));
  if (load) {
    // A heap on the bed (sacks, straw).
    const at = bed(0, 0.1, -0.1);
    builder.lathe('ware', tkgFrame(at[0], at[1], at[2]), 0, 0, [[wide * 0.44, 0], [wide * 0.43, 0.12], [wide * 0.38, 0.24], [wide * 0.26, 0.33], [wide * 0.12, 0.385], [0.02, 0.4]], { colour: load, sides: TK_THINGS.sides.vessel });
  }
}

/** Poles leaning against a wall: at `frame`, the wall along its x behind z = 0, their feet out in front; `count` of them about `long` m. */
export function tkPoles(builder, frame, { count = 4, long = 3.4, colour = TK_THINGS.bamboo, seed = 1 } = {}) {
  const random = tkRandom(seed * 53 + 3);
  for (let k = 0; k < count; k += 1) {
    const x = (k - (count - 1) / 2) * 0.09 + (random() - 0.5) * 0.05;
    const out = 0.5 + 0.35 * random();
    const l = long * (0.8 + 0.3 * random());
    const up = Math.sqrt(Math.max(0.1, l * l - out * out));
    builder.tube('timber', [frame(x, 0, out), frame(x + (random() - 0.5) * 0.3, up, 0.04)], 0.024, 0.016, { sides: 5, colour: tktTone(colour, random) });
  }
}

/** Sacks heaped at world (x, y, z): `count` of them, about 0.7 m long each. */
export function tkSacks(builder, x, y, z, { count = 3, colour = TK_THINGS.hemp, seed = 1 } = {}) {
  const random = tkRandom(seed * 71 + 5);
  for (let k = 0; k < count; k += 1) {
    const upper = k >= 2 && k % 3 === 2;
    const at = tkgFrame(x + (upper ? 0.2 : (k % 3) * 0.42) + (random() - 0.5) * 0.08, y + (upper ? 0.26 : 0), z + Math.floor(k / 3) * 0.5 + (random() - 0.5) * 0.1, random() * 0.6);
    builder.lathe('ware', at, 0, 0, [[0.2, 0], [0.27, 0.05], [0.3, 0.11], [0.3, 0.18], [0.27, 0.24], [0.2, 0.29], [0.12, 0.32], [0.01, 0.33]], { colour: tktTone(colour, random), sides: TK_THINGS.sides.vessel });
  }
}

/** An iron fire basket on three legs at world (x, y, z). Returns where its fire burns ([x, y, z]). */
export function tkBrazier(builder, x, y, z, { high = 0.75, wide = 0.5 } = {}) {
  const frame = tkgFrame(x, y, z);
  const r = wide / 2;
  builder.lathe('timber', frame, 0, 0, [[r * 0.5, high * 0.62], [r, high], [r * 0.9, high], [r * 0.45, high * 0.7]], { colour: TK_THINGS.iron, sides: 8 });
  for (let k = 0; k < 3; k += 1) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    builder.tube('timber', [frame(Math.cos(a) * r * 0.9, 0, Math.sin(a) * r * 0.9), frame(Math.cos(a) * r * 0.45, high * 0.66, Math.sin(a) * r * 0.45)], 0.016, 0.016, { sides: 4, colour: TK_THINGS.iron });
  }
  // (The coals: dark, heaped; the flames are townkit/stir.js's.)
  builder.round('ware', frame, 0, 0, high * 0.86, high * 1.0, r * 0.8, r * 0.3, { colour: [0.12, 0.07, 0.05], sides: 7 });
  return [x, y + high * 0.98, z];
}

/** A fire on the ground at world (x, y, z): a ring of stones, charred billets, ash. Returns where it burns. */
export function tkCampfire(builder, x, y, z, { wide = 0.9, seed = 1 } = {}) {
  const random = tkRandom(seed * 17 + 9);
  const frame = tkgFrame(x, y, z);
  builder.round('ware', frame, 0, 0, 0, 0.03, wide * 0.62, wide * 0.5, { colour: TK_THINGS.ash, sides: 9 });
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 + random() * 0.3;
    const s = 0.07 + 0.05 * random();
    builder.lathe('rock', tkgFrame(x + Math.cos(a) * wide * 0.5, y, z + Math.sin(a) * wide * 0.5, random() * 3), 0, 0, [[s, 0], [s * 0.9, s * 0.6], [s * 0.3, s * 0.9]], { colour: tktTone([0.4, 0.38, 0.36], random), sides: 5 });
  }
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * Math.PI + random() * 0.5;
    builder.tube('timber', [frame(Math.cos(a) * wide * 0.32, 0.05, Math.sin(a) * wide * 0.32), frame(-Math.cos(a) * wide * 0.2, 0.16 + 0.1 * random(), -Math.sin(a) * wide * 0.2)], 0.045, 0.04, { sides: 5, colour: [0.1, 0.08, 0.07] });
  }
  return [x, y + 0.2, z];
}

/**
 * A stack at `frame`: `kind` 'stone' (dressed blocks, some fallen beside it), 'timber' (squared baulks laid along its
 * x) or 'shot' (a heap of stones for throwing down from a wall).
 */
export function tkStack(builder, frame, { kind = 'stone', long = 1.8, high = 0.8, deep = 0.9, seed = 1 } = {}) {
  const random = tkRandom(seed * 37 + 1);
  if (kind === 'shot') {
    const count = Math.round(long * deep * 14);
    for (let k = 0; k < count; k += 1) {
      const [a, d] = [random() * Math.PI * 2, Math.sqrt(random())];
      const s = 0.07 + 0.07 * random();
      const lift = Math.max(0, (1 - d) * high - s * 0.5) * random();
      const at = frame(Math.cos(a) * d * long * 0.5, lift, Math.sin(a) * d * deep * 0.5);
      builder.lathe('rock', tkgFrame(at[0], at[1], at[2], random() * 3), 0, 0, [[s * 0.8, 0], [s, s * 0.5], [s * 0.5, s]], { colour: tktTone(TK_THINGS.stone, random), sides: 5 });
    }
    return;
  }
  if (kind === 'timber') {
    const side = 0.2;
    for (let row = 0; row * side < high; row += 1) {
      const across = row % 2 === 1;
      const count = Math.max(1, Math.floor((across ? long : deep) / (side + 0.03)) - (row > 1 ? Math.floor(random() * 2) : 0));
      for (let k = 0; k < count; k += 1) {
        const off = -(across ? long : deep) / 2 + (k + 0.5) * (side + 0.03) + (random() - 0.5) * 0.03;
        const reach = (across ? deep : long) / 2 + random() * 0.15;
        const tint = tktTone(TK_THINGS.splitWood.map((value) => value * 0.8), random);
        if (across) builder.box('timber', frame, off - side / 2, off + side / 2, row * side, (row + 1) * side - 0.01, -reach, reach, { colour: tint, shade: [0.75, 1] });
        else builder.box('timber', frame, -reach, reach, row * side, (row + 1) * side - 0.01, off - side / 2, off + side / 2, { colour: tint, shade: [0.75, 1] });
      }
    }
    return;
  }
  const [bl, bh, bd] = [0.6, 0.3, 0.42];
  for (let row = 0; row * bh < high; row += 1) {
    const count = Math.max(1, Math.floor(long / (bl + 0.02)) - Math.floor(row * 0.7 + random()));
    for (let k = 0; k < count; k += 1) {
      for (let back = 0; back * bd < deep - 0.2; back += 1) {
        const x0 = -long / 2 + k * (bl + 0.02) + (row % 2) * bl * 0.4 + (random() - 0.5) * 0.04;
        const z0 = -deep / 2 + back * (bd + 0.02) + (random() - 0.5) * 0.03;
        builder.box('ashlar', frame, x0, x0 + bl * (0.85 + 0.25 * random()), row * bh, (row + 1) * bh - 0.012, z0, z0 + bd, { colour: tktTone(TK_THINGS.stone, random, 0.2), shade: [0.75, 1] });
      }
    }
  }
  // (One or two lying where they were dropped.)
  for (let k = 0; k < 2; k += 1) {
    const at = frame(long / 2 + 0.4 + random() * 0.8, 0, (random() - 0.5) * deep * 1.4);
    builder.box('ashlar', tkgFrame(at[0], at[1], at[2], random() * 3), -bl / 2, bl / 2, -0.04, bh * 0.8, -bd / 2, bd / 2, { colour: tktTone(TK_THINGS.stone, random, 0.2), shade: [0.75, 1] });
  }
}

/** A ladder from world point `a` to `b` (its foot and its head), `wide` m, a rung every 0.3 m. */
export function tkLadder(builder, a, b, { wide = 0.5, colour = TK_THINGS.splitWood.map((value) => value * 0.75) } = {}) {
  const long = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const level = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
  // (Across it: level, square to its run; a ladder lying flat along x takes z.)
  const across = level > 0.05 ? [-(b[2] - a[2]) / level, 0, (b[0] - a[0]) / level] : [1, 0, 0];
  const at = (s, side) => [a[0] + (b[0] - a[0]) * s + across[0] * side * wide * 0.5, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s + across[2] * side * wide * 0.5];
  for (const side of [-1, 1]) builder.tube('timber', [at(0, side), at(1, side)], 0.032, 0.028, { sides: 5, colour });
  for (let d = 0.3; d < long - 0.1; d += 0.3) builder.tube('timber', [at(d / long, -1), at(d / long, 1)], 0.016, 0.016, { sides: 4, colour });
}

/** A siege shield (a mantlet) standing at `frame`, its face toward -z, leaning back on its prop: boards `wide` x `high` m. */
export function tkMantlet(builder, frame, { wide = 1.5, high = 1.7, seed = 1, fallen = false } = {}) {
  const random = tkRandom(seed * 91 + 2);
  const lean = fallen ? 1.45 : 0.22;
  const p = (x, up, proud = 0) => frame(x, up * Math.cos(lean) + proud * Math.sin(lean), up * Math.sin(lean) - proud * Math.cos(lean));
  const boards = 5;
  for (let k = 0; k < boards; k += 1) {
    const [x0, x1] = [-wide / 2 + (k * wide) / boards + 0.008, -wide / 2 + ((k + 1) * wide) / boards - 0.008];
    const top = high - 0.12 * random();
    const tint = tktTone(TK_THINGS.oldWood, random);
    builder.quad('timber', p(x1, 0), p(x0, 0), p(x0, top), p(x1, top), { colour: tint });
    builder.quad('timber', p(x0, 0, -0.04), p(x1, 0, -0.04), p(x1, top, -0.04), p(x0, top, -0.04), { colour: tint.map((value) => value * 0.7) });
  }
  for (const up of [0.3, high - 0.35]) builder.tube('timber', [p(-wide / 2, up, -0.07), p(wide / 2, up, -0.07)], 0.03, 0.03, { sides: 4, colour: TK_THINGS.oldWood });
  if (!fallen) builder.tube('timber', [p(0, high * 0.8, -0.07), frame(0, 0, high * 0.75)], 0.03, 0.03, { sides: 4, colour: TK_THINGS.oldWood });
}

/** Spent arrows standing in the ground round world (x, y, z): `count` within `spread` m, flown from the way `from` (rad: the yaw they came from). */
export function tkArrows(builder, x, y, z, { count = 6, spread = 1.5, from = 0, seed = 1 } = {}) {
  const random = tkRandom(seed * 29 + 4);
  for (let k = 0; k < count; k += 1) {
    const [px, pz] = [x + (random() - 0.5) * 2 * spread, z + (random() - 0.5) * 2 * spread];
    const yaw = from + (random() - 0.5) * 0.5;
    const pitch = 0.9 + 0.5 * random();
    const long = 0.35 + 0.35 * random();
    const tip = [px - Math.cos(yaw) * Math.cos(pitch) * long, y + Math.sin(pitch) * long, pz + Math.sin(yaw) * Math.cos(pitch) * long];
    builder.tube('timber', [[px, y - 0.03, pz], tip], 0.006, 0.006, { sides: 3, colour: [0.7, 0.62, 0.44] });
    // (The fletching: two crossed slips at the nock.)
    const back = [(tip[0] - px) * 0.3, (tip[1] - y) * 0.3, (tip[2] - pz) * 0.3];
    for (const [ox, oz] of [[0.025, 0], [0, 0.025]]) {
      builder.quad('scrap', [tip[0] - back[0] - ox, tip[1] - back[1], tip[2] - back[2] - oz], [tip[0] - back[0] + ox, tip[1] - back[1], tip[2] - back[2] + oz], [tip[0] + ox, tip[1], tip[2] + oz], [tip[0] - ox, tip[1], tip[2] - oz], { colour: [0.85, 0.84, 0.8] });
    }
  }
}

/**
 * Icicles along an eave from world point `a` to `b`: one about every `every` m, up to `long` m, longest in the
 * middle of a run where the melt gathers; `material`: the place's ice.
 */
export function tkIcicles(builder, a, b, { every = 0.22, long = 0.55, material = 'icicle', seed = 1, share = 0.7 } = {}) {
  const random = tkRandom(seed * 43 + 6);
  const run = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const count = Math.floor(run / every);
  for (let k = 0; k < count; k += 1) {
    if (random() > share) continue;
    const s = (k + random()) / count;
    // (Runs of long ones and gaps: a slow unevenness along the eave.)
    const l = long * (0.15 + 0.85 * Math.pow(random(), 1.6)) * (0.35 + 0.65 * tktRough(s * run * 0.35 + seed, seed * 0.7));
    const at = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
    builder.round(material, tkgFrame(at[0], at[1] - l, at[2]), 0, 0, 0, l, 0.002, 0.012 + 0.03 * l, { sides: 4, colour: [1, 1, 1], caps: '' });
  }
}

/**
 * A drift of snow laid by the wind against the foot of what stands in its way: along the foot from world [x, z]
 * `a` to `b`, lying out to the left of that walk (the windward side) `run` m, its head `high` [least, most] m up
 * the face (uneven along the foot: a slow noise), none where `share(x, z)` says the ground is trodden or swept
 * (0..1). `heightAt(x, z)`: the ground. A concave bank in three strips, on the material 'drift' (snow at any
 * depth of fall; bare ground's colour without it).
 */
export function tkDrift(builder, a, b, { run = 2.4, high = [0.25, 0.8], heightAt = () => 0, share = () => 1, seed = 1, every = 1.25, taper = true } = {}) {
  const long = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const along = [(b[0] - a[0]) / long, (b[1] - a[1]) / long];
  const out = [along[1], -along[0]];
  const count = Math.max(1, Math.round(long / every));
  // (The bank's section: its height at each share of its run, falling fast from the face and running out thin.)
  const section = [[0, 1], [0.3, 0.52], [0.65, 0.16], [1, -0.04]];
  const ring = (k) => {
    const s = k / count;
    const [x, z] = [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s];
    // (Run out at its two ends where `taper`; its unevenness is the ground's own, so two lengths laid end to end meet.)
    const lies = share(x, z) * (taper ? Math.min(1, Math.min(s, 1 - s) * long * 0.8 + 0.15) : 1);
    const h = (high[0] + (high[1] - high[0]) * tktRough((x + z) * 0.11 + seed * 3.1, (x - z) * 0.11)) * lies;
    const reach = run * (0.6 + 0.8 * tktRough((x + z) * 0.07 + 9 + seed, (x - z) * 0.07)) * (0.4 + 0.6 * lies);
    return section.map(([d, up]) => {
      const [px, pz] = [x + out[0] * (d * reach - 0.06), z + out[1] * (d * reach - 0.06)];
      return [px, heightAt(px, pz) + h * up, pz];
    });
  };
  let before = ring(0);
  for (let k = 1; k <= count; k += 1) {
    const here = ring(k);
    for (let j = 0; j + 1 < section.length; j += 1) {
      const [p0, p1, p2, p3] = [before[j], before[j + 1], here[j + 1], here[j]];
      // (Each strip's own slope for its light: up, and out from the face.)
      const slope = (p0[1] - p1[1]) / (Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) || 1);
      const n = [out[0] * slope, 1, out[1] * slope];
      const length = Math.hypot(...n);
      const normal = n.map((value) => value / length);
      builder.quad('drift', p0, p1, p2, p3, { uvs: [p0, p1, p2, p3].map((point) => [point[0] / 3, point[2] / 3]), normals: [normal, normal, normal, normal] });
    }
    before = here;
  }
}

/** A tuft of grass or weed at world (x, y, z): `size` m high, two crossed cards (three where `full`). */
export function tkTuft(builder, x, y, z, { size = 0.35, wide = 1, colour = TK_THINGS.green, yaw = 0, full = false } = {}) {
  const cards = full ? 3 : 2;
  const half = size * 0.55 * wide;
  // (Lit as the ground it stands on: its normals point up, so a card does not go dark edge on to the sun.)
  const up = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]];
  for (let k = 0; k < cards; k += 1) {
    const a = yaw + (k / cards) * Math.PI;
    const [cx, cz] = [Math.cos(a) * half, Math.sin(a) * half];
    builder.quad('tuft', [x - cx, y - 0.02, z - cz], [x + cx, y - 0.02, z + cz], [x + cx, y + size, z + cz], [x - cx, y + size, z - cz], { uvs: [[0.02, 0.015], [0.98, 0.015], [0.98, 0.985], [0.02, 0.985]], colour: [colour.map((value) => value * 0.6), colour.map((value) => value * 0.6), colour, colour], normals: up });
  }
}

/** What tkScatter lays, as shares of a square metre of the most favoured ground, and their sizes (m). */
export const TK_SCATTER = {
  // The points tried: one to a `cell` m square, jittered within it.
  cell: 0.6,
  // Tufts: they stand where the ground is not trodden (their chance falls to nothing as the wear passes `wearTo`),
  // thickest within reach of a wall's foot (`wall`: the chance there against `open` ground's), more where water
  // gathers (`hollow`), fewer in deep shade (`shade`: the chance under a sky share of 0) and none under cover.
  // On paving (`paved`: the open ground's chance there against bare earth's) they keep to the wall's foot and the
  // kerb, where no foot falls and the joints hold soil: a weed standing alone in the middle of a square's flags
  // reads as a mistake, not as neglect.
  tuft: { chance: 0.55, open: 0.16, wall: 1, hollow: 0.5, shade: 0.35, wearTo: 0.3, size: [0.14, 0.5], paved: 0.12 },
  // Stones: loose ones at wall feet (fallen from the wall) and scattered thinly over open earth.
  stone: { chance: 0.05, open: 0.3, wall: 1, size: [0.05, 0.16] },
  // Litter (fallen leaves, straw): gathers in corners and at wall feet out of the wind and the way, under cover too.
  // (`count` scraps to a patch, each `long` m from middle to tip: a fallen leaf is a hand's length at most, and
  // five scraps of twice that read as cut paper on the canal town's quay. `tone`: lying leaves are darker than
  // their colour on the tree, damp and half rotted.)
  litter: { chance: 0.45, open: 0.04, wall: 1, size: [0.25, 0.7], count: 9, long: [0.025, 0.06], tone: 0.7 },
};

/**
 * Scatter what grows and gathers over a place, by rule from its lie. `blocks`: tkBlocks; `lay`: the baked lie
 * (lay.js, its `at`); `box`: { x, z } ranges; `grows(x, z)`: 0..1 how well plants take there (0: water, a floor;
 * about 0.3: paving, in its joints; 1: earth), or null to leave the point bare; `heightAt(x, z)`: the ground's
 * height where the lay's own is too coarse; `colour`: the tufts' (TK_THINGS.green or .dead); `litter`: the
 * colours of what lies (null: none); `stones`: whether loose stones lie about; `thick`: a multiple of the tufts'
 * chance; `paved(x, z)`: whether the ground there is paved (TK_SCATTER.tuft.paved); `cover`: what stands this far over the ground is a roof (m). All of it is fine detail, drawn near the
 * camera only. Returns the counts laid.
 */
export function tkScatter(blocks, lay, { box, grows, heightAt = null, colour = TK_THINGS.green, litter = TK_THINGS.leafLitter, stones = true, seed = 1, cover = 0.5, thick = 1, paved = null }) {
  const random = tkRandom(seed * 977 + 31);
  const s = TK_SCATTER;
  const laid = { tuft: 0, stone: 0, litter: 0 };
  for (let z = box.z[0]; z < box.z[1]; z += s.cell) {
    for (let x = box.x[0]; x < box.x[1]; x += s.cell) {
      const [px, pz] = [x + random() * s.cell, z + random() * s.cell];
      const [r1, r2, r3, r4] = [random(), random(), random(), random()];
      const grow = grows(px, pz);
      if (grow === null || grow === undefined) continue;
      const here = lay.at(px, pz);
      const covered = here.top - here.ground > cover;
      const y = heightAt ? heightAt(px, pz) : here.ground;
      const builder = blocks.at(px, pz);
      const wallShare = (rule, open = 1) => rule.open * open + (rule.wall - rule.open * open) * here.wall * here.wall;
      const clump = 0.35 + 1.3 * tktRough(px * 0.21 + seed, pz * 0.21 - seed);
      const quiet = Math.max(0, 1 - here.wear / s.tuft.wearTo);
      if (!covered && grow > 0) {
        const chance = s.tuft.chance * thick * grow * wallShare(s.tuft, paved?.(px, pz) ? s.tuft.paved : 1) * quiet * (1 + s.tuft.hollow * here.hollow) * (s.tuft.shade + (1 - s.tuft.shade) * here.sky) * clump;
        if (r1 < chance * s.cell * s.cell) {
          const size = s.tuft.size[0] + (s.tuft.size[1] - s.tuft.size[0]) * r2 * r2 * (0.5 + 0.5 * here.wall);
          builder.at('near', () => tkTuft(builder, px, y, pz, { size, wide: 0.8 + 0.8 * r3, colour: colour.map((value) => value * (0.75 + 0.5 * r4)), yaw: r3 * Math.PI }));
          laid.tuft += 1;
        }
      }
      if (stones && grow > 0.5 && r2 < s.stone.chance * wallShare(s.stone) * quiet * s.cell * s.cell * 4) {
        const size = s.stone.size[0] + (s.stone.size[1] - s.stone.size[0]) * r3 * r3;
        builder.at('near', () => builder.lathe('rock', tkgFrame(px, y - size * 0.25, pz, r4 * 6), 0, 0, [[size * 0.9, 0], [size, size * 0.45], [size * 0.55, size * 0.8]], { colour: tktTone(TK_THINGS.stone, random, 0.3), sides: 5 }));
        laid.stone += 1;
      }
      if (litter && r4 < s.litter.chance * wallShare(s.litter) * quiet * (covered ? (here.sky > 0.08 ? 1.3 : 0) : 1) * clump * s.cell * s.cell) {
        // A patch of what the wind leaves: a few flat scraps lying just over the ground.
        const size = s.litter.size[0] + (s.litter.size[1] - s.litter.size[0]) * r1;
        const tint = litter[Math.floor(r3 * litter.length)];
        builder.at('near', () => {
          for (let k = 0; k < s.litter.count; k += 1) {
            const [ox, oz, turn, long] = [(random() - 0.5) * size, (random() - 0.5) * size, random() * Math.PI, s.litter.long[0] + (s.litter.long[1] - s.litter.long[0]) * random()];
            const [cx, cz] = [Math.cos(turn) * long, Math.sin(turn) * long];
            const lift = y + 0.012 + 0.003 * k;
            builder.quad('scrap', [px + ox - cx - cz * 0.4, lift, pz + oz - cz + cx * 0.4], [px + ox + cx - cz * 0.4, lift, pz + oz + cz + cx * 0.4], [px + ox + cx + cz * 0.4, lift, pz + oz + cz - cx * 0.4], [px + ox - cx + cz * 0.4, lift, pz + oz - cz - cx * 0.4], { colour: tktTone(tint, random, 0.4).map((value) => value * s.litter.tone), normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]] });
          }
        });
        laid.litter += 1;
      }
    }
  }
  return laid;
}
