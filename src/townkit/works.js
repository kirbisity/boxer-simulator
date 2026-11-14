// The town kit's defensive works: a rampart along a line (its battered stone face, its walk and crenellated parapet), a
// gatehouse block with an arched passage through it, a timber pavilion in storeys (columns, painted beams, bracket sets,
// tiled roofs) to stand on a gate or a corner, and boulders. Each is driven by a description, as the houses are
// (build.js); the same description gives the solids a walker meets.
//
// The forms are typical of a Joseon town wall and its gate pavilions as two reference photographs show them (a stone
// gate with a two-storey pavilion; palace timberwork under an eave): dimensions here are choices for the game's
// ground, said where they are set, not a survey of any standing building.

import { rampOf, slabOf, stairsOf, wallLine, wallOf } from '../physics/terrain.js';
import { tkgBalustrade, tkgBay, tkgBracket, tkgFrame, tkgRoof, tkgVault, tkgVoussoirs, tkgWall } from './geo.js';
import { tkRandom } from './tex.js';

export const TK_WORKS = {
  // A merlon's length and the crenel between two (m): a Korean parapet's long merlons (yeojang), each a few metres, with
  // narrow gaps; here shorter, so a 20 m stretch reads as crenellated from the ground. Approximate.
  merlon: [1.7, 0.5],
  // The parapet's low course under the crenels, as a share of its height.
  low: 0.45,
  // Finishes: weathered granite for the wall and the gate's dressed blocks (multiplied into the sheets).
  stone: [0.8, 0.78, 0.74], dressed: [0.86, 0.84, 0.8],
  // The gate pavilion's paint (dancheong, as the reference shows it: dull red columns, green-blue beams, white rafter
  // ends), dulled as paint a winter old.
  paint: { column: [0.5, 0.17, 0.13], beam: [0.2, 0.4, 0.36], rafter: [0.44, 0.2, 0.15], rafterEnd: [0.8, 0.78, 0.7], block: [0.2, 0.38, 0.4], board: [0.07, 0.06, 0.06], gilt: [0.75, 0.6, 0.25] },
};

/**
 * A rampart along `nodes` ([x, z, foot, top] each: the outer foot's place, the ground's height there and the walk's), its
 * outer side on the left of one walking the nodes in order... as tkgFrame has it: a segment's local +z is outward.
 * `face`: the batter's run from foot to walk; `walk`: the walk's width; `parapet`, `thick`: the parapet over the walk's
 * outer edge; `gaps`: [[from, to]] along the whole line's length (m) where the parapet is left out (a ladder's head);
 * `inner`: an upright inner face down to `innerFoot(node)` (a free-standing wall), else none (an earth bank stands
 * against it, drawn by the ground).
 */
export function tkRampart(builder, nodes, { face = 0.3, walk = 3.5, parapet = 1.1, thick = 0.6, gaps = [], inner = null, material = 'rubble', paving = 'cobble', colour = TK_WORKS.stone } = {}) {
  const [long, crenel] = TK_WORKS.merlon;
  let run = 0;
  for (let k = 0; k + 1 < nodes.length; k += 1) {
    const [ax, az, footA, topA] = nodes[k];
    const [bx, bz, footB, topB] = nodes[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const frame = tkgFrame(ax, 0, az, Math.atan2(-(bz - az), bx - ax));
    const top = (x) => topA + ((topB - topA) * x) / length;
    const dark = colour.map((value) => value * 0.82);
    // The outer face, battered; laid in metres along the whole line so that the courses run on from piece to piece.
    builder.quad(material, frame(0, footA, 0), frame(length, footB, 0), frame(length, topB, -face), frame(0, topA, -face), { uvs: [[run, footA], [run + length, footB], [run + length, topB], [run, topA]], colour: [dark, dark, colour, colour] });
    builder.quad(paving, frame(0, topA, -face - walk), frame(0, topA, -face), frame(length, topB, -face), frame(length, topB, -face - walk), { uvs: [[run, 0], [run, walk], [run + length, walk], [run + length, 0]] });
    if (inner) {
      const [fa, fb] = [inner(nodes[k]), inner(nodes[k + 1])];
      builder.quad(material, frame(length, fb, -face - walk), frame(0, fa, -face - walk), frame(0, topA, -face - walk), frame(length, topB, -face - walk), { uvs: [[run + length, fb], [run, fa], [run, topA], [run + length, topB]], colour: [dark, dark, colour, colour] });
    }
    // The parapet: a low course, and merlons on it, each standing level at its own middle's height (stepped up a slope).
    const pieces = Math.max(1, Math.round(length / (long + crenel)));
    const step = length / pieces;
    for (let n = 0; n < pieces; n += 1) {
      const [x0, x1] = [n * step, (n + 1) * step];
      if (gaps.some(([from, to]) => run + x1 > from && run + x0 < to)) continue;
      const y = top((x0 + x1) / 2);
      builder.box(material, frame, x0, x1, Math.min(top(x0), top(x1)) - 0.05, y + parapet * TK_WORKS.low, -face - thick, -face, { colour, skip: 'bottom' });
      builder.box(material, frame, x0 + crenel / 2, x1 - crenel / 2, y + parapet * TK_WORKS.low, y + parapet, -face - thick, -face, { colour, skip: 'bottom' });
    }
    run += length;
  }
}

/** The solids of tkRampart's wall: its face (to the parapet's top), its walk (a slab, or a ramp where it climbs). `ends`: walls across the walk at its two ends. */
export function tkRampartSolids(nodes, { face = 0.3, walk = 3.5, parapet = 1.1, thick = 0.6, ends = true } = {}) {
  const solids = [];
  for (let k = 0; k + 1 < nodes.length; k += 1) {
    const [ax, az, footA, topA] = nodes[k];
    const [bx, bz, footB, topB] = nodes[k + 1];
    const length = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(-(bz - az), bx - ax);
    const frame = tkgFrame(ax, 0, az, yaw);
    const at = (x, z) => {
      const [wx, , wz] = frame(x, 0, z);
      return [wx, wz];
    };
    // The parapet and the face under it, one upright block (its head a little over the higher end's parapet).
    solids.push(wallOf(at(length / 2, -face - thick / 2 + 0.15), [length + 0.05, thick + 0.3], Math.min(footA, footB) - 2, Math.max(topA, topB) + parapet, { yaw }));
    const mid = at(length / 2, -face - thick - (walk - thick) / 2);
    solids.push(topA === topB ? slabOf(mid, [length, walk - thick], topA, { yaw, bottom: Math.min(footA, footB) - 2 }) : rampOf(mid, [length, walk - thick], topA, topB, { yaw, bottom: Math.min(footA, footB) - 2 }));
  }
  if (ends) {
    for (const [node, next] of [[nodes[0], nodes[1]], [nodes[nodes.length - 1], nodes[nodes.length - 2]]]) {
      const frame = tkgFrame(node[0], 0, node[1], Math.atan2(-(next[1] - node[1]), next[0] - node[0]));
      const [p, q] = [frame(0, 0, 0.3), frame(0, 0, -face - walk - 0.3)];
      solids.push(wallLine([p[0], p[2]], [q[0], q[2]], 0.4, node[2] - 2, node[3] + 3));
    }
  }
  return solids;
}

/**
 * A gatehouse block: dressed stone `wide` along the wall by `deep` through it and `high` to its terrace, an arched
 * passage (`way` wide, springing at `spring`, a round head rising `rise`) through its middle, a crenellated parapet round
 * the terrace. `frame`: at the middle of its outer face's foot, facing outward (+z).
 */
export function tkGatehouse(builder, frame, { wide, deep, high, way = 4.2, spring = 2.6, rise = 2.1, parapet = 1.0, thick = 0.5, colour = TK_WORKS.dressed, material = 'ashlar' }) {
  const arch = [{ x: 0, width: way, sill: 0, head: spring, arch: rise }];
  const back = frame.child(0, 0, -deep, Math.PI);
  for (const side of [frame, back]) {
    tkgWall(builder, side, { material, x0: -wide / 2, x1: wide / 2, y0: 0, y1: high, openings: arch, reveal: 0.05, colour, shade: [0.84, 1] });
    tkgVoussoirs(builder, side, { material, width: way, spring, rise, deep: 0.55, proud: 0.05, count: 15, colour: colour.map((value) => value * 1.04) });
  }
  tkgVault(builder, frame, { material, width: way, spring, rise, z0: -deep, z1: 0, colour: colour.map((value) => value * 0.92) });
  for (const side of [-1, 1]) tkgWall(builder, frame.child((side * wide) / 2, 0, -deep / 2, (side * Math.PI) / 2), { material, x0: -deep / 2, x1: deep / 2, y0: 0, y1: high, colour, shade: [0.84, 1] });
  builder.level('flags', frame, -wide / 2, wide / 2, -deep, 0, high, { colour: [0.9, 0.9, 0.88] });
  // The passage's floor: worn flags.
  builder.level('flags', frame, -way / 2, way / 2, -deep - 0.5, 0.5, 0.02, { colour: [0.8, 0.8, 0.78] });
  // The terrace's parapet, front and back: a low course and merlons.
  const [long, crenel] = TK_WORKS.merlon;
  const count = Math.max(1, Math.round(wide / (long + crenel)));
  for (const [z0, z1] of [[-thick, 0], [-deep, -deep + thick]]) {
    builder.box(material, frame, -wide / 2, wide / 2, high, high + parapet * TK_WORKS.low, z0, z1, { colour, skip: 'bottom' });
    for (let n = 0; n < count; n += 1) builder.box(material, frame, -wide / 2 + (n * wide) / count + crenel / 2, -wide / 2 + ((n + 1) * wide) / count - crenel / 2, high + parapet * TK_WORKS.low, high + parapet, z0, z1, { colour, skip: 'bottom' });
  }
}

/** The solids of tkGatehouse: its two piers and the block over the passage (each a floor at the terrace's height), its parapets, front and back. `base`: its foot's height. */
export function tkGatehouseSolids(frame, { wide, deep, high, way = 4.2, spring = 2.6, rise = 2.1, parapet = 1.0, thick = 0.5, base = 0 }) {
  const at = (x, z) => {
    const [wx, , wz] = frame(x, 0, z);
    return [wx, wz];
  };
  const { yaw } = frame;
  const pier = (wide - way) / 2;
  const solids = [];
  for (const side of [-1, 1]) solids.push(slabOf(at(side * (way / 2 + pier / 2), -deep / 2), [pier, deep], base + high, { yaw, bottom: base - 2 }));
  solids.push(slabOf(at(0, -deep / 2), [way, deep], base + high, { yaw, bottom: base + spring + rise }));
  for (const z of [-thick / 2, -deep + thick / 2]) solids.push(wallOf(at(0, z), [wide, thick], base + high - 0.5, base + high + parapet + 1.5, { yaw }));
  return solids;
}

/** A straight stair of the works (stone treads between two levels) along `from` -> `to` ([x, z]), `wide` across: drawn, and its solid. */
export function tkWorksStair(builder, from, to, y0, y1, { wide = 2.6, material = 'ashlar', colour = TK_WORKS.dressed } = {}) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(2, Math.round((y1 - y0) / 0.2));
  const frame = tkgFrame(from[0], 0, from[1], Math.atan2(-(to[1] - from[1]), to[0] - from[0]));
  for (let n = 0; n < steps; n += 1) builder.box(material, frame, (n * length) / steps, length, y0 + (n * (y1 - y0)) / steps, y0 + ((n + 1) * (y1 - y0)) / steps, -wide / 2, wide / 2, { colour, skip: 'bottom' });
}

export function tkWorksStairSolid(from, to, y0, y1, { wide = 2.6 } = {}) {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const steps = Math.max(2, Math.round((y1 - y0) / 0.2));
  return stairsOf([(from[0] + to[0]) / 2, (from[1] + to[1]) / 2], [length, wide], steps, y0, (y1 - y0) / steps, { yaw: Math.atan2(-(to[1] - from[1]), to[0] - from[0]), bottom: y0 - 1 });
}

/**
 * A timber pavilion in `frame` (at its floor's middle, its front +z): `storeys` from the ground up, each
 * `{ width, depth, high, fill }` (`fill`: 'open', columns only, or 'lattice', leaves between them); every storey but the
 * last has a skirt roof round the one above, the last a hip-and-gable roof. Columns stand `bay` m apart on stone bases,
 * a painted beam ties their heads, and a bracket set on each carries the eave. `board`: a name board under the top
 * eave at the front. Returns the top eave's height (local).
 */
export function tkPavilion(builder, frame, { storeys, bay = 2.7, column = 0.19, paint = TK_WORKS.paint, tint = [0.74, 0.76, 0.78], overhang = 1.5, lift = 0.5, board = true }) {
  let y = 0;
  storeys.forEach((storey, index) => {
    const { width: w, depth: d, high, fill = 'open' } = storey;
    const above = storeys[index + 1];
    const head = y + high;
    const [nx, nz] = [Math.max(1, Math.round(w / bay)), Math.max(1, Math.round(d / bay))];
    // The columns round the storey, each with the way its bracket faces.
    const posts = [];
    for (let i = 0; i <= nx; i += 1) posts.push([-w / 2 + (w * i) / nx, d / 2, 0], [-w / 2 + (w * i) / nx, -d / 2, Math.PI]);
    for (let k = 1; k < nz; k += 1) posts.push([w / 2, -d / 2 + (d * k) / nz, Math.PI / 2], [-w / 2, -d / 2 + (d * k) / nz, -Math.PI / 2]);
    const floor = y;
    for (const [px, pz, turn] of posts) {
      builder.round('ashlar', frame, px, pz, floor, floor + 0.14, column * 1.7, column * 1.35, { sides: 8, colour: TK_WORKS.dressed });
      builder.round('timber', frame, px, pz, floor + 0.14, head - 0.28, column, column * 0.88, { sides: 8, colour: paint.column, caps: '' });
      builder.at('near', () => tkgBracket(builder, frame.child(px, head - 0.28, pz, turn), { colour: paint.rafter, block: paint.block }));
    }
    // The beams that tie the columns' heads (two, a painted band between them), on the four sides.
    for (const [turn, half, out] of [[0, w / 2, d / 2], [Math.PI, w / 2, d / 2], [Math.PI / 2, d / 2, w / 2], [-Math.PI / 2, d / 2, w / 2]]) {
      const side = frame.child(0, 0, 0, turn);
      builder.box('timber', side, -half - 0.12, half + 0.12, head - 0.62, head - 0.4, out - 0.1, out + 0.1, { colour: paint.beam });
      builder.box('timber', side, -half - 0.12, half + 0.12, head - 0.28, head - 0.1, out - 0.12, out + 0.12, { colour: paint.beam.map((value) => value * 0.85) });
      builder.box('timber', side, -half, half, head - 0.4, head - 0.28, out - 0.04, out + 0.04, { colour: paint.rafterEnd, skip: 'topbottom' });
      if (fill === 'lattice') {
        const count = Math.max(1, Math.round((2 * half) / bay));
        for (let n = 0; n < count; n += 1) tkgBay(builder, side, { kind: 'lattice', x0: -half + (n * 2 * half) / count + column, x1: -half + ((n + 1) * 2 * half) / count - column, y0: floor, y1: head - 0.62, z: out - 0.04, sill: 0.7, finish: paint.column, paint: paint.beam });
      }
    }
    if (above) {
      tkgRoof(builder, frame, { kind: 'skirt', width: w, depth: d, eave: head, rise: (w - above.width) / 2 * 0.5 + 0.35, overhang, inner: [above.width, above.depth], sag: 0.35, lift, tint, timber: paint.rafter, rafterEnd: paint.rafterEnd });
      // The floor above, and its rail round the upper storey.
      const up = head + (w - above.width) / 2 * 0.5 + 0.35;
      builder.box('timber', frame, -above.width / 2 - 0.2, above.width / 2 + 0.2, up - 0.22, up, -above.depth / 2 - 0.2, above.depth / 2 + 0.2, { colour: paint.rafter });
      const [rw, rd] = [above.width / 2 + 0.16, above.depth / 2 + 0.16];
      builder.at('near', () => tkgBalustrade(builder, [[-rw, up, rd], [rw, up, rd], [rw, up, -rd], [-rw, up, -rd], [-rw, up, rd]].map((p) => frame(...p)), { material: 'timber', high: 0.75, spacing: 1.35, post: 0.09, colour: paint.column, panel: false }));
      y = up;
    } else {
      tkgRoof(builder, frame, { kind: 'hipgable', width: w, depth: d, eave: head, rise: (d / 2 + overhang) * 0.72, overhang, sag: 0.42, lift: lift * 1.3, breakAt: 0.5, tint, timber: paint.rafter, rafterEnd: paint.rafterEnd, ridge: { high: 0.42, wide: 0.3, lift: 0.3 } });
      if (board) {
        builder.box('timber', frame, -1.25, 1.25, head - 1.42, head - 0.66, d / 2 + 0.3, d / 2 + 0.38, { colour: paint.gilt });
        builder.box('timber', frame, -1.17, 1.17, head - 1.35, head - 0.73, d / 2 + 0.36, d / 2 + 0.4, { colour: paint.board });
      }
      y = head;
    }
  });
  return y;
}

/** The columns of tkPavilion's first storey as solids (each a small upright block). */
export function tkPavilionSolids(frame, { storeys, bay = 2.7 }, base = 0) {
  const { width: w, depth: d, high } = storeys[0];
  const [nx, nz] = [Math.max(1, Math.round(w / bay)), Math.max(1, Math.round(d / bay))];
  const posts = [];
  for (let i = 0; i <= nx; i += 1) posts.push([-w / 2 + (w * i) / nx, d / 2], [-w / 2 + (w * i) / nx, -d / 2]);
  for (let k = 1; k < nz; k += 1) posts.push([w / 2, -d / 2 + (d * k) / nz], [-w / 2, -d / 2 + (d * k) / nz]);
  return posts.map(([px, pz]) => {
    const [x, , z] = frame(px, 0, pz);
    return wallOf([x, z], [0.42, 0.42], base - 0.5, base + high, { yaw: frame.yaw });
  });
}

/** A boulder at world (x, y, z): a squat irregular lump of the rock sheet, `size` m across, sunk a little in the ground. */
export function tkRock(builder, x, y, z, { size = 1.6, seed = 1, colour = [0.72, 0.7, 0.66] } = {}) {
  const random = tkRandom(seed * 131 + 17);
  const frame = tkgFrame(x, y - size * 0.18, z, random() * Math.PI);
  const r = size / 2;
  const tall = 0.55 + 0.5 * random();
  const profile = [[r * (0.95 + 0.1 * random()), 0], [r * (1.0 + 0.12 * random()), r * tall * 0.45], [r * (0.72 + 0.2 * random()), r * tall * 0.95], [r * (0.3 + 0.2 * random()), r * tall * 1.3], [0.001, r * tall * 1.36]];
  builder.lathe('rock', frame, (random() - 0.5) * r * 0.3, (random() - 0.5) * r * 0.3, profile, { colour: colour.map((value) => value * (0.88 + 0.2 * random())), sides: 5 + Math.floor(random() * 3) });
}
