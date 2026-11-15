// The town kit's buildings and street furniture, each made from a description: a house (its plan, storeys, what
// each bay of its front is, its roof), the paving, rolling ground from a grid of heights, a tree, a boat, a lantern,
// a jar, a signboard, a guardian lion. Each maker lays its pieces with the makers of townkit/geo.js; where a thing
// stands in the way of a walker there is a second function giving its solids (physics/terrain.js), from the same
// description, so that what is drawn and what blocks cannot drift apart. No three.js here.

import { fieldHeight, slabOf, stairsOf, wallLine, wallOf } from '../physics/terrain.js';
import { tkRandom } from './tex.js';
import { tkgArchCurve, tkgBalustrade, tkgBay, tkgFrame, tkgRoof, tkgVault, tkgVoussoirs, tkgWall } from './geo.js';

/** A house's make-up where its description says nothing. Typical figures for a Jiangnan shop-house, read off the reference photographs. */
export const TK_HOUSE = {
  // Storey heights (m): the shop floor, the upper floor; the stone plinth; a bay's width between posts; a post's radius.
  storeys: [3.0, 2.5], plinth: 0.32, bay: 2.3, post: 0.1,
  // The roof: its rise as a share of its run (about 27 degrees), the eave's overhang front and back, how hollow the slope is.
  // `plate`: how much of the roof's rise over the wall's line is closed under it (tkHouse: the wall plate and its boards).
  pitch: 0.52, overhang: 0.8, sag: 0.18, plate: 0.6,
  // Finishes (multiplied into the sheets): dark oiled timber, limewashed plaster, grey brick, grey tile.
  timber: [0.42, 0.3, 0.23], plaster: [0.93, 0.92, 0.88], brick: [0.78, 0.8, 0.8], tile: [0.8, 0.82, 0.84],
  // A fire wall (the stepped gable wall standing above the roof between houses): its thickness and how far it stands above the tiles.
  firewall: { thick: 0.3, above: 0.55, steps: 3 },
};

const tkbScale = (colour, by) => colour.map((value) => value * by);

/**
 * A house. `spec`:
 *   at [x, z], yaw     the middle of its plan; its front faces local +z (yaw 0: world +z)
 *   width, depth       its plan (m); storeys 1 or 2
 *   wall               'plaster' | 'brick' | 'rubble': its side and back walls
 *   ground, upper      what each bay of the front is, in turn (repeated to fill): 'open' | 'boards' | 'door' | 'lattice' | 'wall'
 *   pent               a pent roof over the shopfront (two storeys only)
 *   transom            m: a band of lattice over each open or boarded bay of the ground floor (geo.js tkgBay)
 *   firewall           stepped gable walls standing above the roof at its ends ('both' | 'left' | 'right' | null)
 *   roof               { kind, rise, overhang, sag, lift, tint } over tkgRoof's defaults
 *   base               the ground's height under it (default 0)
 *   seed               varies its tones a little
 * Returns its eave height.
 */
export function tkHouse(builder, spec) {
  const { width: w, depth: d, storeys = 2, wall = 'plaster', ground = ['lattice'], upper = ['lattice'], pent = false, firewall = null, base = 0, seed = 1 } = spec;
  const random = tkRandom(seed * 7919 + 13);
  const frame = tkgFrame(spec.at[0], base, spec.at[1], spec.yaw ?? 0);
  const h0 = spec.heights?.[0] ?? TK_HOUSE.storeys[0];
  const eave = storeys > 1 ? h0 + (spec.heights?.[1] ?? TK_HOUSE.storeys[1]) : h0;
  const timber = tkbScale(spec.timber ?? TK_HOUSE.timber, 0.85 + 0.3 * random());
  const paint = tkbScale(TK_HOUSE[wall] ?? TK_HOUSE.plaster, 0.9 + 0.1 * random());
  const roof = { kind: 'gable', overhang: TK_HOUSE.overhang, sag: TK_HOUSE.sag, verge: firewall ? 0 : 0.22, tint: tkbScale(TK_HOUSE.tile, 0.85 + 0.25 * random()), timber, ...spec.roof };
  const rise = roof.rise ?? (d / 2 + roof.overhang) * TK_HOUSE.pitch;
  const front = frame.child(0, 0, d / 2);
  const windows = (count, span, sill, head) => Array.from({ length: count }, (_, k) => ({ x: -span / 2 + ((k + 0.5) * span) / count, width: 0.8, sill, head }));
  const dark = { material: 'timber', colour: [0.06, 0.055, 0.05] };
  // The back and the two ends: wall to the eave, the ends on up to the roof's line; small windows high in the back.
  tkgWall(builder, frame.child(0, 0, -d / 2, Math.PI), { material: wall, x0: -w / 2, x1: w / 2, y0: 0, y1: eave, colour: paint, shade: [0.9, 1], openings: spec.blindBack ? [] : windows(Math.max(1, Math.round(w / 3.2)), w, eave - 1.7, eave - 0.8), inside: dark, reveal: 0.14 });
  for (const side of [-1, 1]) {
    const end = frame.child((side * w) / 2, 0, 0, (side * Math.PI) / 2);
    tkgWall(builder, end, { material: wall, x0: -d / 2, x1: d / 2, y0: 0, y1: eave, colour: paint, shade: [0.9, 1] });
    if (roof.kind !== 'gable') continue;
    // The gable: under the roof's line (a little below the tiles), in upright strips.
    const cuts = 6;
    const line = (x) => eave + (rise - 0.1) * (1 - Math.abs(x) / (d / 2 + roof.overhang));
    for (let k = 0; k < cuts; k += 1) {
      const xa = -d / 2 + (d * k) / cuts;
      const xb = -d / 2 + (d * (k + 1)) / cuts;
      builder.quad(wall, end(xa, eave, 0), end(xb, eave, 0), end(xb, line(xb), 0), end(xa, line(xa), 0), { uvs: [[xa, eave], [xb, eave], [xb, line(xb)], [xa, line(xa)]], colour: paint });
    }
    const stepped = firewall === 'both' || firewall === (side < 0 ? 'left' : 'right');
    if (!stepped) continue;
    // The fire wall: stepped down from the ridge to each eave, each step coped with a little tiled roof of its own.
    const { thick, above, steps } = TK_HOUSE.firewall;
    const reach = d / 2 + 0.25;
    for (const way of [-1, 1]) {
      for (let k = 0; k < steps; k += 1) {
        const za = (reach * k) / steps;
        const zb = (reach * (k + 1)) / steps;
        const top = eave + (rise - 0.1) * (1 - za / (d / 2 + roof.overhang)) + above;
        const z0 = Math.min(way * za, way * zb);
        const z1 = Math.max(way * za, way * zb);
        const x0 = (side * w) / 2 - thick / 2;
        builder.box(wall, frame, x0, x0 + thick, eave - 0.3, top, z0, z1, { colour: paint, skip: 'bottom' });
        builder.box('rooftile', frame, x0 - 0.1, x0 + thick + 0.1, top, top + 0.09, z0 - (k === steps - 1 || way < 0 ? 0.12 : 0), z1 + (k === steps - 1 || way > 0 ? 0.12 : 0), { colour: tkbScale(roof.tint, 0.8) });
        builder.box('rooftile', frame, x0 + thick / 2 - 0.05, x0 + thick / 2 + 0.05, top + 0.09, top + 0.17, z0, z1, { colour: tkbScale(roof.tint, 0.7), skip: 'bottom' });
      }
    }
  }
  // The plinth, a course of dressed stone standing a little proud all round.
  const plinth = TK_HOUSE.plinth;
  builder.box('ashlar', frame, -w / 2 - 0.04, w / 2 + 0.04, 0, plinth, -d / 2 - 0.04, d / 2 + 0.06, { colour: [0.82, 0.82, 0.8], skip: 'bottom', shade: [0.8, 1] });
  // The front: posts, and between them each storey's bays; a beam over each storey.
  const bays = Math.max(1, Math.round(w / (spec.bay ?? TK_HOUSE.bay)));
  const each = w / bays;
  const post = TK_HOUSE.post;
  const storey = (kinds, y0, y1, offset) => {
    for (let k = 0; k < bays; k += 1) {
      const kind = kinds[(k + offset) % kinds.length];
      const x0 = -w / 2 + k * each + post;
      const x1 = -w / 2 + (k + 1) * each - post;
      if (kind === 'wall') tkgWall(builder, front, { material: wall, x0: x0 - post, x1: x1 + post, y0, y1, colour: paint, openings: [{ x: (x0 + x1) / 2, width: 0.9, sill: y0 + 1.0, head: y1 - 0.5 }], inside: dark, reveal: 0.14 });
      else tkgBay(builder, front, { kind, x0, x1, y0, y1, finish: timber, sill: kind === 'open' ? 0.95 : y0 > plinth + 0.1 ? 0.8 : 0.9, transom: y0 < plinth + 0.1 ? spec.transom ?? 0 : 0 });
    }
  };
  storey(ground, plinth, h0 - 0.24, seed);
  if (storeys > 1) storey(upper, h0 + 0.02, eave - 0.2, seed + 1);
  for (let k = 0; k <= bays; k += 1) {
    const x = -w / 2 + k * each + (k === 0 ? post : k === bays ? -post : 0);
    builder.round('timber', front, x, -0.02, plinth, eave, post * 1.1, post, { colour: tkbScale(timber, 0.9), caps: '', sides: 8 });
    builder.at('near', () => builder.round('ashlar', front, x, -0.02, plinth - 0.02, plinth + 0.12, post * 1.7, post * 1.5, { colour: [0.8, 0.8, 0.78], sides: 8 }));
  }
  const beam = (y, high, proud) => builder.box('timber', front, -w / 2, w / 2, y, y + high, -0.12, proud, { colour: tkbScale(timber, 0.95), skip: 'back' });
  beam(h0 - 0.24, 0.26, 0.05);
  beam(eave - 0.2, 0.2, 0.05);
  // Between the wall's head and the roof above it (the roof stands `eave` up at its edge and has risen by the wall's
  // line): closed, as a house's is by its wall plate and the boards between the rafters. `TK_HOUSE.plate` of the
  // straight slope's rise there, the rest being the slope's own hollow (its sag), so the block stays under the tiles.
  builder.box('timber', frame, -w / 2 + 0.02, w / 2 - 0.02, eave - 0.02, eave + TK_HOUSE.plate * rise * (roof.overhang / (d / 2 + roof.overhang)), -d / 2 + 0.02, d / 2 - 0.02, { colour: tkbScale(timber, 0.55), skip: 'top bottom' });
  if (storeys > 1 && pent) tkgRoof(builder, front, { kind: 'lean', width: w, depth: 0.45, overhang: 0.5, verge: 0, eave: h0 - 0.34, rise: 0.46, sag: 0, tint: roof.tint, timber, ridge: { high: 0.1, wide: 0.12, lift: 0 }, soffit: true });
  tkgRoof(builder, frame, { ...roof, width: w, depth: d, eave, rise, ridge: { lift: firewall ? 0 : 0.14, ...roof.ridge } });
  return eave;
}

/** A house's solid: its plan, as one block no one walks through (`grow`: a margin, m). */
export const tkHouseSolid = (spec, grow = 0) => wallOf(spec.at, [spec.width + 2 * grow, spec.depth + 2 * grow], (spec.base ?? 0) - 1, (spec.base ?? 0) + 6, { yaw: spec.yaw ?? 0 });

/**
 * A row of houses from a description of the row: `from`, `to` ([x, z]: the ends of the line their fronts stand on, walked
 * with the houses on the LEFT hand, so their fronts face right), `depth`, and how each is chosen: `widths` [min, max],
 * `two` (the share with two storeys), `vary` (how much their depths differ, as a share), and the bay kinds to draw from. Returns the houses' specs (tkHouse's), the same for
 * the same seed: the drawing and the solids are both made from them.
 */
export function tkRow({ from, to, depth = 7, widths = [5.2, 7.6], two = 0.8, seed = 1, grounds = [['open', 'boards'], ['lattice', 'door', 'lattice'], ['boards', 'door'], ['open', 'open', 'door']], uppers = [['lattice'], ['lattice', 'wall'], ['wall']], walls = ['plaster', 'plaster', 'brick'], firewalls = 0.45, base = 0, vary = 0.16, extra = {} }) {
  const random = tkRandom(seed);
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  const ux = (to[0] - from[0]) / length;
  const uz = (to[1] - from[1]) / length;
  // The left hand of the walk, seen on a map with +x right and +z down; a house's front (its local +z) faces the other way.
  const out = [uz, -ux];
  const yaw = Math.atan2(-out[0], -out[1]);
  const houses = [];
  let at = 0;
  while (length - at > 0.5) {
    const left = length - at;
    // (The last two share what is left, so that none is a sliver and none a hall.)
    const width = left <= widths[1] ? left : left - widths[1] < widths[0] ? left / 2 : widths[0] + (widths[1] - widths[0]) * random();
    const deep = depth * (1 + vary * (random() - 0.5));
    const mid = at + width / 2;
    const pick = (list) => list[Math.floor(random() * list.length)];
    const storeys = random() < two ? 2 : 1;
    houses.push({
      at: [from[0] + ux * mid + out[0] * (deep / 2), from[1] + uz * mid + out[1] * (deep / 2)], yaw, width: width - 0.04, depth: deep, storeys,
      wall: pick(walls), ground: pick(grounds), upper: pick(uppers), pent: storeys > 1 && random() < 0.55, firewall: random() < firewalls ? 'both' : null,
      heights: [TK_HOUSE.storeys[0] * (0.94 + 0.14 * random()), TK_HOUSE.storeys[1] * (0.9 + 0.2 * random())], seed: Math.floor(random() * 1e6), base, ...extra,
    });
    at += width;
  }
  return houses;
}

/** Paving: a level rectangle of `material` (world x0..x1, z0..z1 at height y), its sheet laid from the world's own axes so that pieces meet. */
export function tkPaving(builder, material, x0, x1, z0, z1, y = 0, colour = [1, 1, 1]) {
  builder.level(material, tkgFrame(), x0, x1, z0, z1, y, { colour });
}

/**
 * Rolling ground drawn from the very grid a field solid stands on (physics/terrain.js fieldOf: `at`, `size`, `cells`,
 * `heights`), split on the same diagonals, so feet land where the ground is drawn. `colourAt(x, z, height, slope)` tints it;
 * `skip(x, z)` leaves a cell out (where a pavement or a building's floor covers it).
 */
export function tkFieldMesh(builder, material, field, { colourAt = null, skip = null, uv = 1 } = {}) {
  const [nu, nv] = field.cells;
  const [x0, z0] = [field.at[0] - field.size[0] / 2, field.at[1] - field.size[1] / 2];
  const du = field.size[0] / nu;
  const dv = field.size[1] / nv;
  const row = nu + 1;
  const h = (i, j) => field.heights[Math.max(0, Math.min(nu, i)) + Math.max(0, Math.min(nv, j)) * row];
  const corner = (i, j) => {
    const normal = [(h(i - 1, j) - h(i + 1, j)) / (2 * du), 1, (h(i, j - 1) - h(i, j + 1)) / (2 * dv)];
    const length = Math.hypot(normal[0], 1, normal[2]);
    const x = x0 + i * du;
    const z = z0 + j * dv;
    const y = h(i, j);
    return { p: [x, y, z], n: normal.map((value) => value / length), uv: [x * uv, -z * uv], c: colourAt ? colourAt(x, z, y, 1 - 1 / length) : [1, 1, 1] };
  };
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      if (skip?.(x0 + (i + 0.5) * du, z0 + (j + 0.5) * dv)) continue;
      const [a, b, c, e] = [corner(i, j), corner(i + 1, j), corner(i + 1, j + 1), corner(i, j + 1)];
      // (Two triangles on the diagonal a-c, anticlockwise seen from above: +z is toward the viewer of a map with +x right.)
      builder.tri(material, a.p, c.p, b.p, [a.uv, c.uv, b.uv], [a.c, c.c, b.c], [a.n, c.n, b.n]);
      builder.tri(material, a.p, e.p, c.p, [a.uv, e.uv, c.uv], [a.c, e.c, c.c], [a.n, e.n, c.n]);
    }
  }
}

/** The height of a field description at world (x, z): fieldHeight (physics/terrain.js) over its rectangle. */
export const tkFieldAt = (field, x, z) => fieldHeight(field.heights, field.cells[0], field.cells[1], (x - field.at[0] + field.size[0] / 2) / field.size[0], (z - field.at[1] + field.size[1] / 2) / field.size[1]);

// ---- trees --------------------------------------------------------------------------------------------------------

/**
 * How each kind of tree is made (tkTree), as shares of its height unless said: `trunk` where the crown's boughs
 * begin and how far up the trunk runs; `lean` how far it bends; `boughs` how many, between which heights of the trunk
 * they leave it, how far they `reach` and `rise`; `forks` side boughs off each; `cards` sprays of leaf on each bough
 * and fork, their half size, and `flat` how level they lie (1: a pad, as a pine's tiers; 0: any way up, as a round
 * crown). Shapes by eye from the references: a camphor's broad dome on a short bole, a willow's curtains, a Korean
 * red pine's bent trunk with a few flat pads and a flat top.
 */
export const TK_TREES = {
  broad: { bark: [0.56, 0.5, 0.43], lean: 0.06, top: 0.5, boughs: [7, 0.55, 1], reach: [0.55, 1], rise: [0.2, 0.5], forks: 2, cards: [5, 0.11], flat: 0.25, sheet: 'foliage' },
  willow: { bark: [0.5, 0.46, 0.4], lean: 0.08, top: 0.55, boughs: [7, 0.6, 1], reach: [0.5, 0.9], rise: [0.25, 0.45], forks: 1, cards: [4, 0.1], flat: 0.2, sheet: 'foliage', curtain: [0.3, 0.5] },
  bare: { bark: [0.5, 0.45, 0.4], lean: 0.06, top: 0.5, boughs: [7, 0.5, 1], reach: [0.5, 1], rise: [0.25, 0.55], forks: 3, cards: [0, 0], flat: 0, sheet: null },
  pine: { bark: [0.78, 0.5, 0.38], lean: 0.2, top: 0.86, boughs: [8, 0.45, 1], reach: [0.5, 0.9], rise: [0.02, 0.1], forks: 2, cards: [4, 0.085], flat: 0.9, sheet: 'needles' },
};

/**
 * A tree at world (x, y, z). `kind`: 'broad' (a round crown: camphor, elm), 'willow' (curtains hanging from the crown),
 * 'bare' (winter: branches only), 'pine' (a bent red pine with flat pads of needles). `high`: its height (m). The trunk
 * and boughs are swept bars of bark; the crown is sprays of the leaf sheets (tex.js: each sheet one ragged spray),
 * many and small, lit as one mass.
 */
export function tkTree(builder, x, y, z, { kind = 'broad', high = 7, seed = 1, spread = 0.5, tint = [1, 1, 1] } = {}) {
  const random = tkRandom(seed * 31 + 7);
  const form = TK_TREES[kind];
  const frame = tkgFrame(x, y, z, random() * Math.PI * 2);
  const trunkTop = high * form.top;
  const girth = high * 0.028 + 0.06;
  const bend = (t) => [Math.sin(t * 2.2) * form.lean * high * 0.4, t * trunkTop, Math.cos(t * 1.7) * form.lean * high * 0.25 - form.lean * high * 0.25];
  const cuts = 6;
  for (let k = 0; k < cuts; k += 1) {
    const ra = girth * (1 - (0.6 * k) / cuts);
    builder.tube('bark', [frame(...bend(k / cuts)), frame(...bend((k + 1) / cuts))], ra * (k ? 1 : 1.3), girth * (1 - (0.6 * (k + 1)) / cuts), { colour: form.bark });
  }
  const spray = (centre, size, colour) => {
    // A spray of leaves: a card of the whole sheet, turned and flipped at random, level by the kind's `flat`.
    const yaw = random() * Math.PI * 2;
    const tilt = (1 - form.flat) * (random() - 0.5) * 2.4 + form.flat * (Math.PI / 2 + (random() - 0.5) * 0.5);
    const ex = [Math.cos(yaw) * size, 0, Math.sin(yaw) * size];
    const ey = [-Math.sin(yaw) * Math.sin(tilt) * size, Math.cos(tilt) * size, Math.cos(yaw) * Math.sin(tilt) * size];
    const at = (sx, sy) => [centre[0] + ex[0] * sx + ey[0] * sy, centre[1] + ex[1] * sx + ey[1] * sy, centre[2] + ex[2] * sx + ey[2] * sy];
    const [u0, u1] = random() < 0.5 ? [0, 1] : [1, 0];
    // (Lit as if facing up and outward, so the crown shades as one mass and not card by card.)
    const out = [centre[0] - x, (centre[1] - y - trunkTop) * 1.5 + size, centre[2] - z];
    const length = Math.hypot(...out) || 1;
    const normal = out.map((value) => value / length);
    builder.quad(form.sheet, at(-1, -1), at(1, -1), at(1, 1), at(-1, 1), { uvs: [[u0, 0], [u1, 0], [u1, 1], [u0, 1]], colour, normals: [normal, normal, normal, normal] });
  };
  const leafed = (from, to, count) => {
    for (let c = 0; c < count; c += 1) {
      const share = 0.35 + 0.75 * random();
      const size = high * form.cards[1] * (0.75 + 0.5 * random());
      const wander = size * (form.flat > 0.5 ? 0.5 : 1.3);
      const centre = frame(from[0] + (to[0] - from[0]) * share + (random() - 0.5) * size * 1.6, from[1] + (to[1] - from[1]) * share + (random() - 0.3) * wander, from[2] + (to[2] - from[2]) * share + (random() - 0.5) * size * 1.6);
      const shade = tkbScale(tint, 0.68 + 0.5 * random());
      if (form.curtain) {
        // A curtain: a tall card hanging from the bough, its leaves drawn long by the stretch.
        const drop = high * (form.curtain[0] + (form.curtain[1] - form.curtain[0]) * random());
        const yaw = random() * Math.PI;
        const half = [Math.cos(yaw) * size * 0.8, Math.sin(yaw) * size * 0.8];
        builder.quad('foliage', [centre[0] - half[0], centre[1] - drop, centre[2] - half[1]], [centre[0] + half[0], centre[1] - drop, centre[2] + half[1]], [centre[0] + half[0], centre[1] + size * 0.4, centre[2] + half[1]], [centre[0] - half[0], centre[1] + size * 0.4, centre[2] - half[1]], {
          uvs: [[0, 0], [1, 0], [1, 1], [0, 1]], colour: tkbScale(shade, 1.15), normals: [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]],
        });
      }
      spray(centre, size, shade);
    }
  };
  const [boughs, low, top] = form.boughs;
  for (let k = 0; k < boughs; k += 1) {
    const from = bend(low + ((top - low) * (k + random() * 0.6)) / boughs);
    const angle = k * 2.4 + random();
    // (Boughs shorten up the tree: the lowest reach furthest.)
    const reach = high * spread * (form.reach[0] + (form.reach[1] - form.reach[0]) * random()) * (1 - 0.45 * (k / boughs));
    const up = high * (form.rise[0] + (form.rise[1] - form.rise[0]) * random());
    const to = [from[0] + Math.cos(angle) * reach, from[1] + up, from[2] + Math.sin(angle) * reach];
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + up * 0.25, (from[2] + to[2]) / 2];
    builder.tube('bark', [frame(...from), frame(...mid), frame(...to)], girth * 0.42, girth * 0.14, { colour: form.bark, sides: 5 });
    leafed(from, to, form.cards[0]);
    for (let fork = 0; fork < form.forks; fork += 1) {
      const root = fork % 2 ? mid : to;
      const tip = [root[0] + (random() - 0.5) * reach * 0.9, root[1] + (random() - 0.2) * Math.max(up, high * 0.06) * 0.9, root[2] + (random() - 0.5) * reach * 0.9];
      builder.tube('bark', [frame(...root), frame(...tip)], girth * 0.14, girth * 0.04, { colour: form.bark, sides: 4 });
      if (!form.sheet) {
        // Winter: each fork ends in twigs.
        for (let twig = 0; twig < 3; twig += 1) builder.tube('bark', [frame(...tip), frame(tip[0] + (random() - 0.5) * reach * 0.5, tip[1] + random() * high * 0.12, tip[2] + (random() - 0.5) * reach * 0.5)], girth * 0.05, girth * 0.02, { colour: form.bark, sides: 3 });
      } else leafed(root, tip, Math.ceil(form.cards[0] / 2));
    }
  }
  // The leader: the crown's own top.
  if (form.sheet) leafed(bend(0.92), [bend(1)[0], bend(1)[1] + high * (form.flat > 0.5 ? 0.04 : 0.22), bend(1)[2]], form.cards[0]);
}

// ---- street furniture -----------------------------------------------------------------------------------------------

/** A round paper lantern hung at world (x, y, z): its red body, its caps and tassel. Lit only by the day (no lamp inside). */
export function tkLantern(builder, x, y, z, { size = 0.2, colour = [0.82, 0.16, 0.12] } = {}) {
  const frame = tkgFrame(x, y, z);
  builder.lathe('ware', frame, 0, 0, [[size * 0.35, -size], [size * 0.85, -size * 0.6], [size, 0], [size * 0.85, size * 0.6], [size * 0.35, size]], { colour, sides: 8 });
  builder.round('timber', frame, 0, 0, size, size * 1.15, size * 0.38, size * 0.38, { colour: [0.2, 0.16, 0.12], sides: 6 });
  builder.round('timber', frame, 0, 0, -size * 1.6, -size, size * 0.06, size * 0.3, { colour: [0.75, 0.6, 0.2], sides: 5, caps: '' });
}

/**
 * A storage jar's turning: `sides` round and `rings` up its body. At 10 and 4 a jar a pace from the eye was a
 * ten-sided lantern with a dark stripe down every side; 18 and 8 read as round at that distance (by eye, the canal
 * town's quay). A jar is then 18 x 11 x 2 = about 400 triangles, and a place stands a few dozen.
 */
export const TK_JAR = { sides: 18, rings: 8 };

/** A glazed storage jar standing at world (x, y, z): `high` m, with a lid or open. */
export function tkJar(builder, x, y, z, { high = 0.75, colour = [0.42, 0.3, 0.22], lid = true } = {}) {
  const r = high * 0.42;
  // (Turned on a wheel: `TK_JAR.sides` round, and a profile of enough rings that the belly and shoulder are curves.)
  const ring = (t) => [r * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t / 0.62) / 2) - 0.42 * Math.max(0, (t - 0.62) / 0.38) ** 1.6), high * t];
  const body = Array.from({ length: TK_JAR.rings + 1 }, (_, k) => ring(k / TK_JAR.rings));
  builder.lathe('ware', tkgFrame(x, y, z), 0, 0, [...body, [r * 0.64, high * 1.0], ...(lid ? [[r * 0.68, high * 1.02], [r * 0.4, high * 1.07], [r * 0.1, high * 1.1]] : [[r * 0.5, high * 0.97]])], { colour, sides: TK_JAR.sides });
}

/** A hanging shop signboard, edge on to the street: a board `high` m tall hung from a bracket on the wall at `frame` (z out from the wall). */
export function tkSign(builder, frame, { high = 1.3, wide = 0.34, out = 0.75, y = 2.5, colour = [0.16, 0.12, 0.1], edge = [0.72, 0.56, 0.2] } = {}) {
  builder.box('timber', frame, -0.03, 0.03, y + high + 0.08, y + high + 0.14, 0, out + wide / 2, { colour: [0.3, 0.24, 0.2] });
  builder.box('timber', frame, -0.025, 0.025, y, y + high, out - wide / 2, out + wide / 2, { colour });
  // (A gilt border: four slips standing proud of each face.)
  builder.at('near', () => {
    for (const side of [-1, 1]) {
      const x = side * 0.03;
      for (const [z0, z1, y0, y1] of [[out - wide / 2, out + wide / 2, y, y + 0.03], [out - wide / 2, out + wide / 2, y + high - 0.03, y + high], [out - wide / 2, out - wide / 2 + 0.03, y, y + high], [out + wide / 2 - 0.03, out + wide / 2, y, y + high]]) {
        builder.box('timber', frame, Math.min(x, x - side * 0.004), Math.max(x, x - side * 0.004), y0, y1, z0, z1, { colour: edge });
      }
    }
  });
}

/** A flat-bottomed canal boat (a sampan, with a mat awning amidships if `awning`) afloat at world (x, z), water level y, heading `yaw`. */
export function tkBoat(builder, x, y, z, yaw, { long = 6.2, beam = 1.5, awning = true, colour = [0.36, 0.28, 0.22] } = {}) {
  const frame = tkgFrame(x, y, z, yaw);
  const stations = 8;
  const half = (t) => (beam / 2) * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.88)) ** 0.6 * (t > 0.86 ? 1 - (t - 0.86) * 3 : 1);
  const sheer = (t) => 0.34 + 0.3 * (2 * t - 1) ** 2;
  for (let k = 0; k < stations; k += 1) {
    const ta = k / stations;
    const tb = (k + 1) / stations;
    const xa = (ta - 0.5) * long;
    const xb = (tb - 0.5) * long;
    for (const side of [-1, 1]) {
      // A side's plank: from the chine at the water to the gunwale; and the half of the bottom boards inside it.
      const a0 = frame(xa, -0.12, side * half(ta) * 0.7);
      const b0 = frame(xb, -0.12, side * half(tb) * 0.7);
      const a1 = frame(xa, sheer(ta), side * half(ta));
      const b1 = frame(xb, sheer(tb), side * half(tb));
      const order = side > 0 ? [a0, b0, b1, a1] : [b0, a0, a1, b1];
      builder.quad('timber', ...order, { colour });
      builder.quad('timber', ...[...order].reverse(), { colour: tkbScale(colour, 0.7) });
      const c0 = frame(xa, 0.06, 0);
      const c1 = frame(xb, 0.06, 0);
      const inner = side > 0 ? [c0, c1, frame(xb, 0.06, side * half(tb) * 0.75), frame(xa, 0.06, side * half(ta) * 0.75)] : [c1, c0, frame(xa, 0.06, side * half(ta) * 0.75), frame(xb, 0.06, side * half(tb) * 0.75)];
      builder.quad('timber', ...inner, { colour: tkbScale(colour, 1.2) });
    }
  }
  if (!awning) return;
  // The awning: a barrel of matting on hoops.
  const hoops = 6;
  for (let k = 0; k < hoops; k += 1) {
    const a = (k / hoops) * Math.PI;
    const b = ((k + 1) / hoops) * Math.PI;
    const r = beam * 0.46;
    const p = (angle, lx) => frame(lx, 0.42 + Math.sin(angle) * r, Math.cos(angle) * r);
    builder.quad('ware', p(a, -long * 0.2), p(a, long * 0.16), p(b, long * 0.16), p(b, -long * 0.2), { colour: [0.5, 0.42, 0.28] });
    builder.quad('ware', p(b, -long * 0.2), p(b, long * 0.16), p(a, long * 0.16), p(a, -long * 0.2), { colour: [0.3, 0.25, 0.18] });
  }
}

/** A guardian lion on its pedestal at `frame` (facing +z), about `high` m with the pedestal: a seated mass of dressed stone, blocked out. */
export function tkLion(builder, frame, { high = 1.7, colour = [0.82, 0.82, 0.8] } = {}) {
  const s = high / 1.7;
  builder.box('ashlar', frame, -0.36 * s, 0.36 * s, 0, 0.62 * s, -0.5 * s, 0.5 * s, { colour, skip: 'bottom', shade: [0.8, 1] });
  builder.box('ashlar', frame, -0.42 * s, 0.42 * s, 0.62 * s, 0.7 * s, -0.56 * s, 0.56 * s, { colour });
  // Haunches, chest, head and mane, as turned and tapered masses.
  builder.lathe('ashlar', frame, 0, -0.14 * s, [[0.3 * s, 0.7 * s], [0.34 * s, 0.95 * s], [0.24 * s, 1.2 * s]], { colour, sides: 8 });
  builder.lathe('ashlar', frame, 0, 0.12 * s, [[0.2 * s, 0.7 * s], [0.25 * s, 1.1 * s], [0.22 * s, 1.32 * s], [0.27 * s, 1.45 * s], [0.25 * s, 1.6 * s], [0.12 * s, 1.72 * s]], { colour, sides: 8 });
  builder.box('ashlar', frame, -0.11 * s, 0.11 * s, 1.4 * s, 1.54 * s, 0.3 * s, 0.46 * s, { colour: tkbScale(colour, 0.95) });
  for (const side of [-1, 1]) builder.round('ashlar', frame, side * 0.14 * s, 0.3 * s, 0.7 * s, 1.1 * s, 0.07 * s, 0.08 * s, { colour, sides: 6 });
}

// ---- walls, quays and bridges ---------------------------------------------------------------------------------------

/** A garden wall's make-up: its height and thickness (m), the stone footing under it, the tiled coping on it. Typical of the region's yard walls. */
export const TK_YARD = { high: 2.7, thick: 0.34, footing: 0.3, coping: 0.14 };

/**
 * A garden wall from world `a` to `b` ([x, z]): limewashed (or `material`) on a stone footing, coped with tiles.
 * `gate`: a shut pair of plank doors under a lintel at its middle (where a lane ends, or a yard opens on a street).
 */
export function tkYardWall(builder, a, b, { material = 'plaster', high = TK_YARD.high, thick = TK_YARD.thick, base = 0, colour = TK_HOUSE.plaster, gate = false, tint = TK_HOUSE.tile } = {}) {
  const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const frame = tkgFrame((a[0] + b[0]) / 2, base, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  const foot = TK_YARD.footing;
  builder.box('ashlar', frame, -half, half, 0, foot, -thick / 2 - 0.03, thick / 2 + 0.03, { colour: [0.8, 0.8, 0.78], skip: 'bottom' });
  for (const side of [1, -1]) {
    const face = frame.child(0, 0, (side * thick) / 2, side > 0 ? 0 : Math.PI);
    tkgWall(builder, face, { material, x0: -half, x1: half, y0: foot, y1: high, colour, shade: [0.88, 1], openings: gate ? [{ x: 0, width: 2.0, sill: foot, head: 2.2 }] : [], reveal: 0.08, revealMaterial: 'timber' });
    if (gate) tkgBay(builder, face, { kind: 'door', x0: -1, x1: 1, y0: foot, y1: 2.2, z: -0.08, finish: [0.3, 0.2, 0.15] });
  }
  builder.upright(material, frame, [half, thick / 2], [half, -thick / 2], foot, high, { colour });
  builder.upright(material, frame, [-half, -thick / 2], [-half, thick / 2], foot, high, { colour });
  // The coping: two courses of tile, the upper narrower, and a ridge roll.
  const dark = tkbScale(tint, 0.8);
  builder.box('rooftile', frame, -half - 0.04, half + 0.04, high, high + TK_YARD.coping / 2, -thick / 2 - 0.14, thick / 2 + 0.14, { colour: dark });
  builder.box('rooftile', frame, -half - 0.02, half + 0.02, high + TK_YARD.coping / 2, high + TK_YARD.coping, -thick / 2 - 0.04, thick / 2 + 0.04, { colour: dark, skip: 'bottom' });
  builder.box('rooftile', frame, -half, half, high + TK_YARD.coping, high + TK_YARD.coping + 0.08, -0.05, 0.05, { colour: tkbScale(tint, 0.7), skip: 'bottom' });
}

/** A garden wall's solid. */
export const tkYardWallSolid = (a, b, { thick = TK_YARD.thick, base = 0 } = {}) => wallLine(a, b, thick, base - 1, base + 6);

/**
 * A quay's face along a canal: a wall of `material` from world `a` to `b` ([x, z]), from the bed up to the bank's level, seen from
 * the right of one walking a -> b (the water's side), with a coping course on the bank's edge. `edge`: what stands on the edge:
 * 'rail' (a stone balustrade), 'kerb' (a low kerb stone), or null.
 */
export function tkQuay(builder, a, b, { material = 'quay', bed = -2.2, top = 0, edge = 'kerb', colour = [0.8, 0.8, 0.78] } = {}) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  // (A frame at `a` whose +x runs to `b`: the water is on its +z side, the bank on its -z.)
  const frame = tkgFrame(a[0], 0, a[1], Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  builder.upright(material, frame, [0, 0], [length, 0], bed, top - 0.18, { colour, shade: [0.7, 1] });
  // The coping: a course of long stones standing 6 cm proud of the face.
  builder.box('ashlar', frame, 0, length, top - 0.18, top + 0.02, -0.5, 0.06, { colour: [0.86, 0.86, 0.84], skip: 'bottom,back' });
  if (edge === 'rail') tkgBalustrade(builder, [frame(0.12, top, -0.2), frame(length - 0.12, top, -0.2)], {});
  else if (edge === 'kerb') builder.box('ashlar', frame, 0, length, top, top + 0.36, -0.42, -0.1, { colour: [0.84, 0.84, 0.82], skip: 'bottom', shade: [0.85, 1] });
}

/** A stone bridge's make-up: its width; a stair's tread and rise (m); the deck's thickness over the arch's crown; how wide the arch is as a share of the water. */
export const TK_BRIDGE = { wide: 3.2, tread: 0.4, rise: 0.17, deck: 0.45, arch: 0.82 };

/** An arch bridge's measures from its description (see tkArchBridge): the risers each side, each one's height, the half length. */
function tkbBridgePlan({ high = 1.9, flat = 2.6 }) {
  const risers = Math.max(2, Math.round(high / TK_BRIDGE.rise));
  return { risers, rise: high / risers, flat, half: flat / 2 + (risers - 1) * TK_BRIDGE.tread, high };
}

/**
 * A humped stone bridge of one arch with stepped approaches. `spec`: `at` [x, z] (the middle of the water), `yaw` (it crosses
 * along its local x), `span` (the water's width, quay to quay), `wide`, `high` (the crest above the banks), `flat` (the
 * crest's level length), `water` (its level), `base` (the banks' level).
 */
export function tkArchBridge(builder, spec) {
  const { at, yaw = 0, span, wide = TK_BRIDGE.wide, water = -1.25, base = 0, colour = [0.84, 0.84, 0.82] } = spec;
  const { risers, rise, flat, half, high } = tkbBridgePlan(spec);
  const frame = tkgFrame(at[0], base, at[1], yaw);
  const tread = TK_BRIDGE.tread;
  const arch = { width: span * TK_BRIDGE.arch, spring: water - base, rise: high - TK_BRIDGE.deck - (water - base) };
  // The deck's top at s along the bridge, and the flank's foot there (the arch over the water, the ground on the banks).
  const top = (s) => {
    const out = Math.abs(s) - flat / 2;
    return out <= 0 ? high : high - (Math.min(risers - 2, Math.floor(out / tread - 1e-6)) + 1) * rise;
  };
  const curve = tkgArchCurve(arch);
  const foot = (s) => {
    const a = Math.abs(s);
    if (a >= span / 2) return -0.05;
    if (a >= arch.width / 2) return water - base - 1;
    const radius = (arch.width ** 2 / 4 + arch.rise ** 2) / (2 * arch.rise);
    return arch.spring + arch.rise - radius + Math.sqrt(Math.max(0, radius * radius - s * s));
  };
  const cuts = new Set([-half, half, -span / 2, span / 2]);
  for (let k = 0; k < risers; k += 1) for (const side of [-1, 1]) cuts.add(side * (flat / 2 + k * tread));
  for (const point of curve) cuts.add(point[0]);
  const stations = [...cuts].filter((s) => Math.abs(s) <= half + 1e-6).sort((p, q) => p - q);
  for (let k = 0; k + 1 < stations.length; k += 1) {
    const [s0, s1] = [stations[k], stations[k + 1]];
    if (s1 - s0 < 1e-6) continue;
    const y = top((s0 + s1) / 2);
    const [f0, f1] = [Math.min(y, foot(s0 + 1e-6)), Math.min(y, foot(s1 - 1e-6))];
    // The two flanks (each anticlockwise seen from outside), and the tread between them.
    builder.quad('ashlar', frame(s0, f0, wide / 2), frame(s1, f1, wide / 2), frame(s1, y, wide / 2), frame(s0, y, wide / 2), { uvs: [[s0, f0], [s1, f1], [s1, y], [s0, y]], colour });
    builder.quad('ashlar', frame(s1, f1, -wide / 2), frame(s0, f0, -wide / 2), frame(s0, y, -wide / 2), frame(s1, y, -wide / 2), { uvs: [[-s1, f1], [-s0, f0], [-s0, y], [-s1, y]], colour });
    builder.level('flags', frame, s0, s1, -wide / 2, wide / 2, y, { colour: [0.92, 0.92, 0.9] });
  }
  // The risers, each facing down its own approach; the foot of each approach is the first.
  for (const side of [-1, 1]) {
    for (let k = 0; k < risers; k += 1) {
      const s = side * (flat / 2 + k * tread);
      const [y1, y0] = [k === 0 ? high : high - k * rise, high - (k + 1) * rise];
      const [p, q] = side > 0 ? [[s, wide / 2], [s, -wide / 2]] : [[s, -wide / 2], [s, wide / 2]];
      builder.upright('ashlar', frame, p, q, y0, y1, { colour: tkbScale(colour, 0.9) });
    }
  }
  // Under it: the arch's soffit, and its ring of dressed stones on each face.
  tkgVault(builder, frame, { material: 'ashlar', ...arch, z0: -wide / 2, z1: wide / 2, y0: arch.spring - 1, colour: tkbScale(colour, 0.75) });
  for (const side of [1, -1]) tkgVoussoirs(builder, frame.child(0, 0, (side * wide) / 2, side > 0 ? 0 : Math.PI), { material: 'ashlar', ...arch, deep: 0.36, proud: 0.05, count: 17, colour: tkbScale(colour, 1.06), back: 0.2 });
  // The balustrades, stepping down with the stairs.
  for (const side of [-1, 1]) {
    const z = side * (wide / 2 - 0.14);
    tkgBalustrade(builder, [frame(-half, 0, z), frame(-flat / 2, high, z), frame(flat / 2, high, z), frame(half, 0, z)], { spacing: 1.5, high: 0.85 });
  }
}

/** An arch bridge's solids: the two flights, the crest between them, and a wall along each side that no one steps or vaults over. */
export function tkArchBridgeSolids(spec) {
  const { at, yaw = 0, wide = TK_BRIDGE.wide, base = 0 } = spec;
  const { risers, rise, flat, half, high } = tkbBridgePlan(spec);
  const frame = tkgFrame(at[0], base, at[1], yaw);
  const flight = (risers - 1) * TK_BRIDGE.tread;
  const point = (s, z) => {
    const [x, , wz] = frame(s, 0, z);
    return [x, wz];
  };
  const solids = [slabOf(point(0, 0), [flat, wide], base + high, { yaw, bottom: base + high - TK_BRIDGE.deck })];
  // (A flight's treads run up its u axis: the far flight is turned half round.)
  solids.push(stairsOf(point(-flat / 2 - flight / 2, 0), [flight, wide], risers - 1, base, rise, { yaw, bottom: base - 3 }));
  solids.push(stairsOf(point(flat / 2 + flight / 2, 0), [flight, wide], risers - 1, base, rise, { yaw: yaw + Math.PI, bottom: base - 3 }));
  for (const side of [-1, 1]) solids.push(wallLine(point(-half, side * (wide / 2 - 0.1)), point(half, side * (wide / 2 - 0.1)), 0.2, base - 3, base + high + 2.2));
  return solids;
}

/** A flat bridge of stone slabs on piers: `at` [x, z], `yaw` (it crosses along local x), `span`, `wide`, level with the banks. */
export function tkSlabBridge(builder, { at, yaw = 0, span, wide = TK_BRIDGE.wide, water = -1.25, base = 0, colour = [0.84, 0.84, 0.82] }) {
  const frame = tkgFrame(at[0], base, at[1], yaw);
  builder.box('ashlar', frame, -span / 2 - 0.3, span / 2 + 0.3, -0.34, 0.02, -wide / 2, wide / 2, { colour, top: 'flags' });
  for (const s of [-span / 6, span / 6]) builder.box('ashlar', frame, s - 0.28, s + 0.28, water - base - 1, -0.34, -wide / 2 + 0.2, wide / 2 - 0.2, { colour: tkbScale(colour, 0.85), skip: 'top,bottom', shade: [0.6, 1] });
  for (const side of [-1, 1]) tkgBalustrade(builder, [frame(-span / 2 - 0.2, 0.02, side * (wide / 2 - 0.14)), frame(span / 2 + 0.2, 0.02, side * (wide / 2 - 0.14))], { spacing: 1.5, high: 0.85 });
}

/** A flat bridge's solids: its deck and a wall along each side. */
export function tkSlabBridgeSolids({ at, yaw = 0, span, wide = TK_BRIDGE.wide, base = 0 }) {
  const frame = tkgFrame(at[0], base, at[1], yaw);
  const point = (s, z) => {
    const [x, , wz] = frame(s, 0, z);
    return [x, wz];
  };
  return [slabOf(at, [span + 0.6, wide], base + 0.02, { yaw, bottom: base - 0.34 }), ...[-1, 1].map((side) => wallLine(point(-span / 2, side * (wide / 2 - 0.1)), point(span / 2, side * (wide / 2 - 0.1)), 0.2, base - 3, base + 3))];
}

/**
 * Water steps: a flight let down from a quay's edge to a landing at the water. `at` [x, z]: the middle of the top step's
 * edge on the quay; `yaw`: it goes down along local +x; `wide`; `water`; `base`. The landing stands a hand above the water.
 */
export function tkWaterSteps(builder, { at, yaw = 0, wide = 3, water = -1.25, base = 0, landing = 1.0, colour = [0.82, 0.82, 0.8] }) {
  const frame = tkgFrame(at[0], base, at[1], yaw);
  const { steps, rise, run } = tkbStepsPlan({ water, base });
  // The top riser, under the quay's edge; then each tread a block down to the bed, whose far face is the next riser.
  builder.upright('ashlar', frame, [0, wide / 2], [0, -wide / 2], -rise, 0.02, { colour: tkbScale(colour, 0.88) });
  for (let k = 0; k <= steps; k += 1) {
    const y = -(k + 1) * rise;
    const [s0, s1] = [k * TK_BRIDGE.tread, k === steps ? run + landing : (k + 1) * TK_BRIDGE.tread];
    builder.box('ashlar', frame, s0, s1, water - base - 1, y, -wide / 2, wide / 2, { colour: tkbScale(colour, k === steps ? 0.92 : 1), skip: 'bottom,left', top: 'flags', shade: [0.55, 1] });
  }
}

function tkbStepsPlan({ water = -1.25, base = 0 }) {
  const drop = base - water - 0.14;
  const steps = Math.max(1, Math.round(drop / TK_BRIDGE.rise) - 1);
  return { steps, rise: drop / (steps + 1), run: steps * TK_BRIDGE.tread };
}

/** Water steps' solids: the flight, the landing, and walls round the three sides over the water. */
export function tkWaterStepsSolids({ at, yaw = 0, wide = 3, water = -1.25, base = 0, landing = 1.0 }) {
  const frame = tkgFrame(at[0], base, at[1], yaw);
  const { steps, rise, run } = tkbStepsPlan({ water, base });
  const point = (s, z) => {
    const [x, , wz] = frame(s, 0, z);
    return [x, wz];
  };
  const low = base - (steps + 1) * rise;
  return [
    // (The flight climbs back toward the quay: its u axis is turned half round. Its foot is the landing.)
    stairsOf(point(run / 2, 0), [run, wide], steps, low, rise, { yaw: yaw + Math.PI, bottom: water - 1.5 }),
    slabOf(point(run + landing / 2, 0), [landing, wide], low, { yaw, bottom: water - 1.5 }),
    wallLine(point(0, -wide / 2), point(run + landing, -wide / 2), 0.16, water - 1.5, base + 3),
    wallLine(point(0, wide / 2), point(run + landing, wide / 2), 0.16, water - 1.5, base + 3),
    wallLine(point(run + landing, -wide / 2), point(run + landing, wide / 2), 0.16, water - 1.5, base + 3),
  ];
}

/**
 * A brick gate across a lane: a wall from world `a` to `b` with a round-headed way through its middle, coped with tiles
 * (the lane gates of the region's towns). `way`: the opening's width; `high`: the wall's height. Seen from both sides.
 */
export function tkLaneGate(builder, a, b, { way = 2.3, high = 4.6, thick = 0.5, base = 0, material = 'brick', colour = TK_HOUSE.brick, tint = TK_HOUSE.tile } = {}) {
  const half = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2;
  const frame = tkgFrame((a[0] + b[0]) / 2, base, (a[1] + b[1]) / 2, Math.atan2(-(b[1] - a[1]), b[0] - a[0]));
  const arch = { width: way, spring: 2.0, rise: way / 2 };
  for (const side of [1, -1]) {
    const face = frame.child(0, 0, (side * thick) / 2, side > 0 ? 0 : Math.PI);
    tkgWall(builder, face, { material, x0: -half, x1: half, y0: 0, y1: high, colour, shade: [0.85, 1], openings: [{ x: 0, width: way, sill: 0, head: arch.spring, arch: arch.rise }], reveal: 0 });
    tkgVoussoirs(builder, face, { material, ...arch, deep: 0.3, proud: 0.03, count: 15, tooth: 0.05, colour: tkbScale(colour, 0.92), back: 0.1 });
    // A stone tablet over the way, and a brick string course under the coping.
    builder.box('ashlar', face, -0.7, 0.7, arch.spring + arch.rise + 0.45, arch.spring + arch.rise + 0.9, 0, 0.04, { colour: [0.8, 0.8, 0.77], skip: 'back' });
    builder.box(material, face, -half, half, high - 0.34, high - 0.2, 0, 0.06, { colour: tkbScale(colour, 0.9), skip: 'back' });
  }
  tkgVault(builder, frame, { material, ...arch, z0: -thick / 2, z1: thick / 2, y0: 0, colour: tkbScale(colour, 0.85) });
  const dark = tkbScale(tint, 0.8);
  builder.box('rooftile', frame, -half, half, high, high + 0.1, -thick / 2 - 0.16, thick / 2 + 0.16, { colour: dark });
  builder.box('rooftile', frame, -half, half, high + 0.1, high + 0.2, -thick / 2 - 0.04, thick / 2 + 0.04, { colour: dark, skip: 'bottom' });
  builder.box('rooftile', frame, -half, half, high + 0.2, high + 0.3, -0.06, 0.06, { colour: tkbScale(tint, 0.7), skip: 'bottom' });
}

/** A lane gate's solids: the wall each side of its way. */
export function tkLaneGateSolids(a, b, { way = 2.3, thick = 0.5, base = 0 } = {}) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const along = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const share = (length - way) / 2 / length;
  return share > 0.01 ? [wallLine(a, along(share), thick, base - 1, base + 6), wallLine(along(1 - share), b, thick, base - 1, base + 6)] : [];
}
