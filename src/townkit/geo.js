// The town kit's geometry: a builder that gathers many pieces into one geometry per material, and the makers every
// building is put together from: a tiled roof (its tiles in rows, with eave ends, a ridge and hips), a wall with
// openings, an arch (its ring of voussoirs, its vault), a timber bay with lattice, a balustrade, a bracket set.
// A maker is given a description (plain numbers in metres) and a frame (where the building stands, which way it
// faces); it lays UVs in metres, so the painted sheets (townkit/tex.js) come out at their real size, and shades by
// vertex colour (the finish of timber, the dark under an eave). Nothing here needs three.js: the builder holds plain
// arrays (townkit/place.js makes the meshes), so the makers can be checked in the tests.
//
// Each piece is laid at a level of detail: 'all' (always drawn), 'near' (only close to the camera: the tiles' real
// rolls, rafters, lattice bars) or 'far' (only when distant: what stands in for the near pieces).

/** Tuning shared by the makers. Each is a typical figure for the thing, read off the reference photographs. */
export const TK_GEO = {
  // A roof's tile rows: the pitch between cover-tile rolls (m) and a cover tile's radius; a tile's exposed length down the slope.
  tile: { pitch: 0.21, roll: 0.048, lap: 0.21 },
  // An eave's make-up: the thickness of tile and bedding at its edge, the rafters under it (section across and deep, spacing).
  eave: { edge: 0.07, rafter: [0.07, 0.09], spacing: 0.36, board: 0.02 },
  // How many pieces a curved slope is cut into down its length, and a round thing round its girth.
  cuts: { slope: 5, round: 10, arch: 16 },
};

/** A frame: local (x, y, z) -> world, turned `yaw` about the vertical and set at (x, y, z). Local +x is along a building's front, +z out of its front. */
export function tkgFrame(x = 0, y = 0, z = 0, yaw = 0) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const frame = (lx, ly, lz) => [x + lx * cos + lz * sin, y + ly, z - lx * sin + lz * cos];
  frame.at = [x, y, z];
  frame.yaw = yaw;
  /** A frame set at a local point of this one, turned `turn` more. */
  frame.child = (lx, ly, lz, turn = 0) => tkgFrame(...frame(lx, ly, lz), yaw + turn);
  return frame;
}

const tkgSub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const tkgAdd = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const tkgCross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const tkgUnit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
const TKG_WHITE = [1, 1, 1];

/**
 * The builder. `quad`, `tri` and the shapes below add to the batch named `${material}|${level}`; `batches()` gives each
 * as `{ material, level, position, normal, uv, colour }` (plain arrays; UVs in metres).
 */
export function tkgBuilder() {
  const batches = new Map();
  const batch = (material, level = 'all') => {
    const key = `${material}|${level}`;
    let made = batches.get(key);
    if (!made) batches.set(key, (made = { material, level, position: [], normal: [], uv: [], colour: [] }));
    return made;
  };
  const builder = {
    // The level of detail pieces are being laid at.
    lod: 'all',
    /** Lay what `work` adds at `level`. */
    at(level, work) {
      const before = builder.lod;
      builder.lod = level;
      work();
      builder.lod = before;
    },
    /** A triangle a, b, c (anticlockwise seen from its face), with UVs (metres) and colours per corner (or one colour). */
    tri(material, a, b, c, uvs, colour = TKG_WHITE, normals = null) {
      const into = batch(material, builder.lod);
      const flat = normals ? null : tkgUnit(tkgCross(tkgSub(b, a), tkgSub(c, a)));
      const corners = [a, b, c];
      for (let k = 0; k < 3; k += 1) {
        into.position.push(corners[k][0], corners[k][1], corners[k][2]);
        const normal = normals ? normals[k] : flat;
        into.normal.push(normal[0], normal[1], normal[2]);
        into.uv.push(uvs[k][0], uvs[k][1]);
        const tint = Array.isArray(colour[0]) ? colour[k] : colour;
        into.colour.push(tint[0], tint[1], tint[2]);
      }
    },
    /**
     * A quad a, b, c, d (anticlockwise seen from its face). `uvs`: four [u, v] in metres; left out, u runs along a->b and
     * v along a->d from `uv0`. `colour`: one, or four.
     */
    quad(material, a, b, c, d, { uvs = null, uv0 = [0, 0], colour = TKG_WHITE, normals = null } = {}) {
      if (!uvs) {
        const along = Math.hypot(...tkgSub(b, a));
        const up = Math.hypot(...tkgSub(d, a));
        uvs = [uv0, [uv0[0] + along, uv0[1]], [uv0[0] + along, uv0[1] + up], [uv0[0], uv0[1] + up]];
      }
      const tints = Array.isArray(colour[0]) ? colour : [colour, colour, colour, colour];
      builder.tri(material, a, b, c, [uvs[0], uvs[1], uvs[2]], [tints[0], tints[1], tints[2]], normals && [normals[0], normals[1], normals[2]]);
      builder.tri(material, a, c, d, [uvs[0], uvs[2], uvs[3]], [tints[0], tints[2], tints[3]], normals && [normals[0], normals[2], normals[3]]);
    },
    /**
     * An upright rectangle from floor point p0 to p1 ([x, z] in `frame`), y0 to y1: its face looks to the right of one walking
     * p0 -> p1. u runs along it from `u0`, v is the height (so courses meet round a corner). `shade`: [foot, head] multipliers.
     */
    upright(material, frame, p0, p1, y0, y1, { u0 = 0, colour = TKG_WHITE, shade = null } = {}) {
      const length = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const low = shade ? colour.map((value) => value * shade[0]) : colour;
      const high = shade ? colour.map((value) => value * shade[1]) : colour;
      builder.quad(material, frame(p0[0], y0, p0[1]), frame(p1[0], y0, p1[1]), frame(p1[0], y1, p1[1]), frame(p0[0], y1, p0[1]), {
        uvs: [[u0, y0], [u0 + length, y0], [u0 + length, y1], [u0, y1]], colour: [low, low, high, high],
      });
    },
    /** A level rectangle x0..x1, z0..z1 (in `frame`) at height y, facing up (or down: `under`); UVs are the frame's x and z. */
    level(material, frame, x0, x1, z0, z1, y, { colour = TKG_WHITE, under = false } = {}) {
      const corners = under ? [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] : [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];
      builder.quad(material, ...corners.map(([x, z]) => frame(x, y, z)), { uvs: corners.map(([x, z]) => [x, -z]), colour });
    },
    /**
     * A box: x0..x1, y0..y1, z0..z1 in `frame`. `skip`: faces left out, of 'top', 'bottom', 'front' (+z), 'back', 'left' (-x),
     * 'right'. `shade`: [foot, head] multipliers on the upright faces.
     */
    box(material, frame, x0, x1, y0, y1, z0, z1, { colour = TKG_WHITE, skip = '', shade = null, top = null } = {}) {
      const options = { colour, shade };
      if (!skip.includes('front')) builder.upright(material, frame, [x0, z1], [x1, z1], y0, y1, { ...options, u0: x0 });
      if (!skip.includes('back')) builder.upright(material, frame, [x1, z0], [x0, z0], y0, y1, { ...options, u0: -x1 });
      if (!skip.includes('right')) builder.upright(material, frame, [x1, z1], [x1, z0], y0, y1, { ...options, u0: -z1 });
      if (!skip.includes('left')) builder.upright(material, frame, [x0, z0], [x0, z1], y0, y1, { ...options, u0: z0 });
      const head = shade ? colour.map((value) => value * shade[1]) : colour;
      if (!skip.includes('top')) builder.level(top ?? material, frame, x0, x1, z0, z1, y1, { colour: head });
      if (!skip.includes('bottom')) builder.level(material, frame, x0, x1, z0, z1, y0, { colour: shade ? colour.map((value) => value * shade[0]) : colour, under: true });
    },
    /**
     * A round post or drum about the vertical through local (x, z), y0 to y1, radius r0 at its foot and r1 at its head
     * (`sides` round). u runs round it, v is the height. `caps`: 'top', 'bottom' or both.
     */
    round(material, frame, x, z, y0, y1, r0, r1 = r0, { sides = TK_GEO.cuts.round, colour = TKG_WHITE, caps = 'top' } = {}) {
      const ring = (radius, y, k) => {
        const angle = (k / sides) * Math.PI * 2;
        return frame(x + Math.cos(angle) * radius, y, z - Math.sin(angle) * radius);
      };
      const out = (k) => {
        const angle = (k / sides) * Math.PI * 2;
        const lean = (r0 - r1) / Math.max(1e-6, y1 - y0);
        return tkgUnit(tkgSub(frame(Math.cos(angle), lean, -Math.sin(angle)), frame(0, 0, 0)));
      };
      const girth = Math.PI * (r0 + r1);
      for (let k = 0; k < sides; k += 1) {
        const u0 = (k / sides) * girth;
        const u1 = ((k + 1) / sides) * girth;
        builder.quad(material, ring(r0, y0, k), ring(r0, y0, k + 1), ring(r1, y1, k + 1), ring(r1, y1, k), {
          uvs: [[u0, y0], [u1, y0], [u1, y1], [u0, y1]], colour, normals: [out(k), out(k + 1), out(k + 1), out(k)],
        });
        if (caps.includes('top') && r1 > 1e-4) builder.tri(material, frame(x, y1, z), ring(r1, y1, k), ring(r1, y1, k + 1), [[0, 0], [r1, 0], [r1, r1]], colour);
        if (caps.includes('bottom')) builder.tri(material, frame(x, y0, z), ring(r0, y0, k + 1), ring(r0, y0, k), [[0, 0], [r0, 0], [r0, r0]], colour);
      }
    },
    /** A turned shape (a jar, a lantern, a finial) about the vertical through local (x, z): `profile` [[radius, y], …] from foot to head. */
    lathe(material, frame, x, z, profile, options = {}) {
      for (let k = 0; k + 1 < profile.length; k += 1) {
        const caps = (k === 0 ? 'bottom' : '') + (k + 2 === profile.length ? 'top' : '');
        builder.round(material, frame, x, z, profile[k][1], profile[k + 1][1], profile[k][0], profile[k + 1][0], { ...options, caps });
      }
    },
    /**
     * A bar of rectangular section (`wide` across, `high` up from the path) swept along world points. The ends are closed.
     * u runs along it. Used for ridges, hips, rails and beams that are not square to anything.
     */
    /** A round limb (a trunk, a bough, a pole) along `points`: its radius from `r0` at the first to `r1` at the last, lit round. */
    tube(material, points, r0, r1 = r0, { sides = 7, colour = TKG_WHITE } = {}) {
      // (One reference across for the whole limb, so its rings do not twist against each other.)
      const whole = tkgUnit(tkgSub(points[points.length - 1], points[0]));
      const ref = Math.abs(whole[1]) > 0.75 ? [1, 0, 0] : [0, 1, 0];
      const rings = points.map((point, index) => {
        const along = tkgUnit(tkgSub(points[Math.min(points.length - 1, index + 1)], points[Math.max(0, index - 1)]));
        const ux = tkgUnit(tkgCross(ref, along));
        const uy = tkgCross(along, ux);
        const radius = r0 + ((r1 - r0) * index) / (points.length - 1);
        return Array.from({ length: sides + 1 }, (_, side) => {
          const angle = (side / sides) * Math.PI * 2;
          const out = tkgAdd([ux[0] * Math.cos(angle), ux[1] * Math.cos(angle), ux[2] * Math.cos(angle)], uy, Math.sin(angle));
          return { at: tkgAdd(point, out, radius), out, u: (side / sides) * Math.PI * (r0 + r1) };
        });
      });
      let run = 0;
      for (let k = 0; k + 1 < rings.length; k += 1) {
        const next = run + Math.hypot(...tkgSub(points[k + 1], points[k]));
        for (let side = 0; side < sides; side += 1) {
          const [a, b, c, d] = [rings[k][side], rings[k][side + 1], rings[k + 1][side + 1], rings[k + 1][side]];
          builder.quad(material, a.at, b.at, c.at, d.at, { uvs: [[a.u, run], [b.u, run], [c.u, next], [d.u, next]], colour, normals: [a.out, b.out, c.out, d.out] });
        }
        run = next;
      }
    },
    sweep(material, points, wide, high, { colour = TKG_WHITE, sink = 0, under = true } = {}) {
      const rings = points.map((point, index) => {
        const ahead = tkgUnit(tkgSub(points[Math.min(points.length - 1, index + 1)], points[Math.max(0, index - 1)]));
        let side = tkgCross(ahead, [0, 1, 0]);
        if (Math.hypot(...side) < 1e-6) side = [1, 0, 0];
        side = tkgUnit(side);
        const up = tkgUnit(tkgCross(side, ahead));
        const foot = tkgAdd(point, up, -sink);
        return [tkgAdd(foot, side, -wide / 2), tkgAdd(foot, side, wide / 2), tkgAdd(tkgAdd(foot, side, wide / 2), up, high), tkgAdd(tkgAdd(foot, side, -wide / 2), up, high)];
      });
      let run = 0;
      for (let k = 0; k + 1 < rings.length; k += 1) {
        const a = rings[k];
        const b = rings[k + 1];
        const next = run + Math.hypot(...tkgSub(points[k + 1], points[k]));
        // Right side, top, left side, underside: each anticlockwise from outside.
        builder.quad(material, a[1], b[1], b[2], a[2], { uvs: [[run, 0], [next, 0], [next, high], [run, high]], colour });
        builder.quad(material, a[2], b[2], b[3], a[3], { uvs: [[run, high], [next, high], [next, high + wide], [run, high + wide]], colour });
        builder.quad(material, a[3], b[3], b[0], a[0], { uvs: [[run, high], [next, high], [next, 0], [run, 0]], colour });
        if (under) builder.quad(material, a[0], b[0], b[1], a[1], { uvs: [[run, 0], [next, 0], [next, wide], [run, wide]], colour });
        run = next;
      }
      const first = rings[0];
      const last = rings[rings.length - 1];
      builder.quad(material, first[1], first[2], first[3], first[0], { uvs: [[0, 0], [0, high], [wide, high], [wide, 0]], colour });
      builder.quad(material, last[0], last[3], last[2], last[1], { uvs: [[0, 0], [0, high], [wide, high], [wide, 0]], colour });
    },
    batches: () => [...batches.values()],
  };
  return builder;
}

// ---- a wall with openings ---------------------------------------------------------------------------------------

/**
 * An upright wall face from local x0 to x1 at depth z (facing +z of `frame`), y0 to y1, with openings cut in it:
 * `openings` [{ x, width, sill, head, arch? }] (`x` the opening's middle; `arch`: the rise of a round or segmental head
 * above `head`). The face is laid in upright strips between the openings' edges, so no piece crosses a hole; each opening's
 * reveal (its sides, soffit and sill, `reveal` m deep into the wall) is laid in `revealMaterial`.
 */
export function tkgWall(builder, frame, { material, x0, x1, y0, y1, z = 0, openings = [], reveal = 0.2, revealMaterial = material, colour = TKG_WHITE, shade = null, inside = null }) {
  const holes = openings.map((o) => ({ ...o, from: o.x - o.width / 2, to: o.x + o.width / 2, sill: o.sill ?? y0, arch: o.arch ?? 0 })).sort((a, b) => a.from - b.from);
  const tint = (y) => (shade ? colour.map((value) => value * (shade[0] + ((shade[1] - shade[0]) * (y - y0)) / Math.max(1e-6, y1 - y0))) : colour);
  const piece = (xa, xb, ya, yb) => {
    if (xb - xa < 1e-5 || yb - ya < 1e-5) return;
    builder.quad(material, frame(xa, ya, z), frame(xb, ya, z), frame(xb, yb, z), frame(xa, yb, z), { uvs: [[xa, ya], [xb, ya], [xb, yb], [xa, yb]], colour: [tint(ya), tint(ya), tint(yb), tint(yb)] });
  };
  let at = x0;
  for (const hole of holes) {
    piece(at, hole.from, y0, y1);
    piece(hole.from, hole.to, y0, hole.sill);
    const dark = colour.map((value) => value * 0.55);
    if (hole.arch > 0) {
      // A round head: the face above it in upright strips down to the curve, the soffit following the curve.
      const cuts = TK_GEO.cuts.arch;
      const half = hole.width / 2;
      // (A segmental arch of the given rise: the circle through the springing points and the crown.)
      const radius = (half * half + hole.arch * hole.arch) / (2 * hole.arch);
      const curve = (x) => hole.head + hole.arch - radius + Math.sqrt(Math.max(0, radius * radius - (x - hole.x) ** 2));
      for (let k = 0; k < cuts; k += 1) {
        const xa = hole.from + (hole.width * k) / cuts;
        const xb = hole.from + (hole.width * (k + 1)) / cuts;
        const ya = curve(xa);
        const yb = curve(xb);
        builder.quad(material, frame(xa, ya, z), frame(xb, yb, z), frame(xb, y1, z), frame(xa, y1, z), { uvs: [[xa, ya], [xb, yb], [xb, y1], [xa, y1]], colour: [tint(ya), tint(yb), tint(y1), tint(y1)] });
        if (reveal > 0) builder.quad(revealMaterial, frame(xa, ya, z - reveal), frame(xb, yb, z - reveal), frame(xb, yb, z), frame(xa, ya, z), { uvs: [[xa, 0], [xb, 0], [xb, reveal], [xa, reveal]], colour: [dark, dark, colour, colour] });
      }
    } else {
      piece(hole.from, hole.to, hole.head, y1);
      if (reveal > 0) builder.quad(revealMaterial, frame(hole.from, hole.head, z - reveal), frame(hole.to, hole.head, z - reveal), frame(hole.to, hole.head, z), frame(hole.from, hole.head, z), { colour: [dark, dark, colour, colour] });
    }
    if (reveal > 0) {
      builder.quad(revealMaterial, frame(hole.from, hole.sill, z - reveal), frame(hole.from, hole.sill, z), frame(hole.from, hole.head, z), frame(hole.from, hole.head, z - reveal), { uvs: [[0, hole.sill], [reveal, hole.sill], [reveal, hole.head], [0, hole.head]], colour: [dark, colour, colour, dark] });
      builder.quad(revealMaterial, frame(hole.to, hole.sill, z), frame(hole.to, hole.sill, z - reveal), frame(hole.to, hole.head, z - reveal), frame(hole.to, hole.head, z), { uvs: [[0, hole.sill], [reveal, hole.sill], [reveal, hole.head], [0, hole.head]], colour: [colour, dark, dark, colour] });
      if (hole.sill > y0) builder.quad(revealMaterial, frame(hole.from, hole.sill, z), frame(hole.to, hole.sill, z), frame(hole.to, hole.sill, z - reveal), frame(hole.from, hole.sill, z - reveal), { colour });
      // What is seen through it: `inside` (a material) closes the opening at the back of the reveal.
      if (inside) builder.quad(inside.material, frame(hole.from, hole.sill, z - reveal), frame(hole.to, hole.sill, z - reveal), frame(hole.to, hole.head + hole.arch, z - reveal), frame(hole.from, hole.head + hole.arch, z - reveal), { uvs: [[hole.from, hole.sill], [hole.to, hole.sill], [hole.to, hole.head + hole.arch], [hole.from, hole.head + hole.arch]], colour: inside.colour ?? TKG_WHITE });
    }
    at = hole.to;
  }
  piece(at, x1, y0, y1);
}

// ---- an arch ----------------------------------------------------------------------------------------------------

/** The points of an arch's curve: a round or segmental head of `rise` over a `width` springing at height `spring`, about local x = `x`; `count` pieces. */
export function tkgArchCurve({ x = 0, width, spring, rise }, count = TK_GEO.cuts.arch) {
  const half = width / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const sweep = Math.asin(Math.min(1, half / radius));
  return Array.from({ length: count + 1 }, (_, k) => {
    const angle = -sweep + (2 * sweep * k) / count;
    return [x + Math.sin(angle) * radius, spring + rise - radius + Math.cos(angle) * radius, angle];
  });
}

/**
 * An arch's ring: `count` voussoirs, each a block `deep` m from intrados to extrados, standing `proud` of the face at
 * depth z (facing +z), every other one a little longer (`tooth`), as dressed arch stones are cut. Closed blocks.
 */
export function tkgVoussoirs(builder, frame, { material, x = 0, width, spring, rise, z = 0, deep = 0.45, proud = 0.04, count = 13, tooth = 0.08, colour = TKG_WHITE, back = 0.3 }) {
  const half = width / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const sweep = Math.asin(Math.min(1, half / radius));
  const centreY = spring + rise - radius;
  const point = (angle, r, depth) => frame(x + Math.sin(angle) * r, centreY + Math.cos(angle) * r, depth);
  for (let k = 0; k < count; k += 1) {
    const a0 = -sweep + (2 * sweep * k) / count + 0.004;
    const a1 = -sweep + (2 * sweep * (k + 1)) / count - 0.004;
    const outer = radius + deep + (k % 2 ? tooth : 0);
    const tone = 0.92 + 0.16 * (((k * 7919) % 13) / 13);
    const tint = colour.map((value) => value * tone);
    const front = z + proud;
    const corners = [point(a0, radius, front), point(a1, radius, front), point(a1, outer, front), point(a0, outer, front)];
    const behind = [point(a0, radius, z - back), point(a1, radius, z - back), point(a1, outer, z - back), point(a0, outer, z - back)];
    const arc = radius * (a1 - a0);
    // The face (the arc's sense runs +x, so a0 is on the left seen from the front, local +z): anticlockwise from outside, inner left to inner right to outer.
    builder.quad(material, corners[0], corners[1], corners[2], corners[3], { uvs: [[0, 0], [arc, 0], [arc, outer - radius], [0, outer - radius]], colour: tint });
    builder.quad(material, behind[1], behind[0], behind[3], behind[2], { colour: tint });
    // Intrados (looking down into the opening), extrados, and the two joints.
    builder.quad(material, behind[0], behind[1], corners[1], corners[0], { colour: tint.map((value) => value * 0.8) });
    builder.quad(material, behind[2], behind[3], corners[3], corners[2], { colour: tint });
    builder.quad(material, behind[3], behind[0], corners[0], corners[3], { colour: tint });
    builder.quad(material, behind[1], behind[2], corners[2], corners[1], { colour: tint });
  }
}

/** A barrel vault's soffit and its two jamb walls: the passage under an arch, from depth z0 (back) to z1 (front). Seen from inside. */
export function tkgVault(builder, frame, { material, x = 0, width, spring, rise, z0, z1, y0 = 0, colour = TKG_WHITE }) {
  const curve = tkgArchCurve({ x, width, spring, rise });
  const half = width / 2;
  const radius = (half * half + rise * rise) / (2 * rise);
  const dim = colour.map((value) => value * 0.6);
  let run = 0;
  for (let k = 0; k + 1 < curve.length; k += 1) {
    const [xa, ya] = curve[k];
    const [xb, yb] = curve[k + 1];
    const next = run + radius * (curve[k + 1][2] - curve[k][2]);
    builder.quad(material, frame(xb, yb, z0), frame(xa, ya, z0), frame(xa, ya, z1), frame(xb, yb, z1), { uvs: [[z0, next], [z0, run], [z1, run], [z1, next]], colour: [dim, dim, colour, colour] });
    run = next;
  }
  builder.quad(material, frame(x - half, y0, z0), frame(x - half, y0, z1), frame(x - half, spring, z1), frame(x - half, spring, z0), { uvs: [[z0, y0], [z1, y0], [z1, spring], [z0, spring]], colour: [dim, colour, colour, dim] });
  builder.quad(material, frame(x + half, y0, z1), frame(x + half, y0, z0), frame(x + half, spring, z0), frame(x + half, spring, z1), { uvs: [[z1, y0], [z0, y0], [z0, spring], [z1, spring]], colour: [colour, dim, dim, colour] });
}

// ---- a tiled roof -----------------------------------------------------------------------------------------------

/**
 * The slopes of a roof over a plan `width` (along the ridge, local x) by `depth` (local z), its eaves `overhang` m beyond
 * the plan and `eave` m up, its ridge `rise` m above them. `kind`:
 *   'gable'     two slopes; the roof runs `verge` m past each end wall.
 *   'hip'       four slopes meeting at hips.
 *   'hipgable'  a hip roof below `break` (0..1 of the way down from the ridge) with a gable above it: the East Asian
 *               hip-and-gable (歇山, 팔작) of the gate pavilion.
 *   'skirt'     the lower roof round a storey: a hip roof cut off where it meets the body `inner` [width, depth] above it.
 *   'lean'      one slope falling toward +z from a wall at z = 0: a pent roof over a shopfront.
 * `sag` (0..1) is how hollow the slope is (0: straight; East Asian roofs are steeper at the ridge than at the eave), and
 * `lift` (m) how far the eave turns up toward each corner, over `liftRun` m of eave.
 * Returns the slopes: each `{ point(u, v), start(u), half, length, hips }` with u along the eave from its middle and v
 * 0 at the top to 1 at the eave; `point` gives local [x, y, z].
 */
export function tkgRoofSlopes({ kind = 'gable', width, depth, eave, rise, overhang = 0.6, verge = 0.3, sag = 0.3, lift = 0, liftRun = 2.5, breakAt = 0.45, inner = null }) {
  const curve = (t) => (1 - sag) * t + sag * (1 - (1 - t) * (1 - t));
  const slopes = [];
  const add = ({ origin, dir, side, half, run, from = 0, start = () => 0 }) => {
    const top = eave + rise;
    const lifted = (u, t) => (lift ? lift * t * t * Math.max(0, 1 - (half - Math.abs(u)) / liftRun) ** 2 : 0);
    slopes.push({
      half, run, from, dir, side,
      start: (u) => Math.max(from, start(u)),
      point(u, v) {
        const t = from < 1 ? Math.max(0, (v - from) / (1 - from)) : 0;
        const out = v * run;
        return [origin[0] + side[0] * u + dir[0] * out, top - rise * curve(t) + lifted(u, t), origin[1] + side[1] * u + dir[1] * out];
      },
      length: Math.hypot(run * (1 - from), rise),
    });
  };
  const runZ = depth / 2 + overhang;
  if (kind === 'gable') {
    const half = width / 2 + verge;
    add({ origin: [0, 0], dir: [0, 1], side: [1, 0], half, run: runZ });
    add({ origin: [0, 0], dir: [0, -1], side: [-1, 0], half, run: runZ });
  } else if (kind === 'lean') {
    add({ origin: [0, 0], dir: [0, 1], side: [1, 0], half: width / 2 + verge, run: depth + overhang });
  } else {
    const half = width / 2 + overhang;
    // (A skirt is the hip roof's foot: everything above where it meets the body is left out.)
    const from = kind === 'skirt' ? Math.max(0, 1 - (runZ - inner[1] / 2) / runZ) : 0;
    const knee = kind === 'hipgable' ? breakAt : 0;
    const gable = half - runZ * (1 - knee);
    const hip = (reach) => (u) => (Math.abs(u) <= (kind === 'hipgable' ? reach - runZ * (1 - knee) : -1) ? 0 : 1 - (reach - Math.abs(u)) / runZ);
    add({ origin: [0, 0], dir: [0, 1], side: [1, 0], half, run: runZ, from, start: hip(half) });
    add({ origin: [0, 0], dir: [0, -1], side: [-1, 0], half, run: runZ, from, start: hip(half) });
    const ends = (u) => Math.max(knee, Math.abs(u) / runZ);
    add({ origin: [half - runZ, 0], dir: [1, 0], side: [0, -1], half: runZ, run: runZ, from, start: ends });
    add({ origin: [-(half - runZ), 0], dir: [-1, 0], side: [0, 1], half: runZ, run: runZ, from, start: ends });
    slopes.gable = kind === 'hipgable' ? { half: gable, knee, run: runZ } : null;
  }
  slopes.kind = kind;
  slopes.ridge = kind === 'gable' ? width / 2 + verge : kind === 'lean' || kind === 'skirt' ? 0 : slopes.gable ? slopes.gable.half : width / 2 + overhang - runZ;
  return slopes;
}

/**
 * A tiled roof in `frame`: the slopes of tkgRoofSlopes laid with tile rows (the painted sheet everywhere; near the camera a real
 * half-round roll over every row, each ending in a round eave tile, and a pointed drip tile under every pan), the eave's
 * edge and the boards and rafters under it, the ridge (`ridge`: { high, wide, lift: how far its ends turn up, material })
 * and the hips. `tint`: the tiles' colour; `timber`: the rafters' and boards' finish; `rafterEnd`: their ends' paint.
 */
export function tkgRoof(builder, frame, spec) {
  const { tint = TKG_WHITE, timber = [0.3, 0.22, 0.17], rafterEnd = null, ridge = {}, tiles = 'rooftile', soffit = true, metres = 0.84, rolls = 4, laps = 4 } = spec;
  const slopes = tkgRoofSlopes(spec);
  const { pitch, roll, lap } = TK_GEO.tile;
  const world = (p) => frame(p[0], p[1], p[2]);
  const rows = spec.sag || spec.lift ? TK_GEO.cuts.slope : 1;
  for (const slope of slopes) {
    const count = Math.max(1, Math.round((2 * slope.half) / pitch));
    const step = (2 * slope.half) / count;
    // A row's UV: u so that one painted row is one real row, v up the slope from the eave in laps.
    const tileU = (u) => ((u + slope.half) / step / rolls) * metres;
    const tileV = (v) => (((1 - v) * slope.length) / lap / laps) * metres;
    const normalAt = (u, v) => {
      const e = 0.01;
      const along = tkgSub(slope.point(u + e, v), slope.point(u - e, v));
      const down = tkgSub(slope.point(u, Math.min(1, v + e)), slope.point(u, Math.max(0, v - e)));
      const normal = tkgUnit(tkgCross(down, along));
      return normal[1] < 0 ? normal.map((value) => -value) : normal;
    };
    const turned = (normal) => tkgUnit(tkgSub(frame(normal[0], normal[1], normal[2]), frame(0, 0, 0)));
    // The sheet of tiles: strips two rows wide, each cut down its length, its head following the hip.
    const strips = Math.max(1, Math.round(count / 2));
    for (let k = 0; k < strips; k += 1) {
      const ua = -slope.half + (2 * slope.half * k) / strips;
      const ub = -slope.half + (2 * slope.half * (k + 1)) / strips;
      const va0 = Math.min(1, slope.start(ua));
      const vb0 = Math.min(1, slope.start(ub));
      if (va0 >= 1 && vb0 >= 1) continue;
      for (let r = 0; r < rows; r += 1) {
        const va = [va0 + ((1 - va0) * r) / rows, va0 + ((1 - va0) * (r + 1)) / rows];
        const vb = [vb0 + ((1 - vb0) * r) / rows, vb0 + ((1 - vb0) * (r + 1)) / rows];
        // Anticlockwise from above: eave side a, eave side b, head b, head a (which way round depends on the slope's hand; the normals say).
        const corners = [[ua, va[1]], [ub, vb[1]], [ub, vb[0]], [ua, va[0]]];
        const points = corners.map(([u, v]) => world(slope.point(u, v)));
        const normals = corners.map(([u, v]) => turned(normalAt(u, v)));
        const uvs = corners.map(([u, v]) => [tileU(u), tileV(v)]);
        const facing = tkgCross(tkgSub(points[1], points[0]), tkgSub(points[3], points[0]))[1] >= 0;
        const order = facing ? [0, 1, 2, 3] : [1, 0, 3, 2];
        builder.quad(tiles, ...order.map((index) => points[index]), { uvs: order.map((index) => uvs[index]), colour: tint, normals: order.map((index) => normals[index]) });
      }
    }
    // The eave's edge: the tiles' thickness, seen from the street.
    const edge = TK_GEO.eave.edge;
    const dark = tint.map((value) => value * 0.6);
    for (let k = 0; k < strips; k += 1) {
      const ua = -slope.half + (2 * slope.half * k) / strips;
      const ub = -slope.half + (2 * slope.half * (k + 1)) / strips;
      const a = world(slope.point(ua, 1));
      const b = world(slope.point(ub, 1));
      const corners = [[a[0], a[1] - edge, a[2]], [b[0], b[1] - edge, b[2]], b, a];
      const out = tkgCross(tkgSub(corners[1], corners[0]), [0, 1, 0]);
      const outward = tkgSub(world(slope.point(0, 1)), world(slope.point(0, 0.5)));
      const order = out[0] * outward[0] + out[2] * outward[2] >= 0 ? [0, 1, 2, 3] : [1, 0, 3, 2];
      builder.quad(tiles, ...order.map((index) => corners[index]), { uvs: order.map((index) => [tileU(index === 0 || index === 3 ? ua : ub), index < 2 ? 0 : edge]), colour: dark });
    }
    builder.at('near', () => {
      for (let k = 0; k < count; k += 1) {
        const u = -slope.half + (k + 0.5) * step;
        const v0 = Math.min(1, slope.start(u));
        if (v0 >= 0.995) continue;
        // The roll: a half pipe over the row, cut down the slope with the sheet under it.
        const cuts = 3;
        const section = (v) => {
          const centre = slope.point(u, v);
          const normal = normalAt(u, v);
          return Array.from({ length: cuts + 1 }, (_, j) => {
            const angle = (j / cuts) * Math.PI;
            const offset = [slope.side[0] * Math.cos(angle) * roll, 0, slope.side[1] * Math.cos(angle) * roll];
            const point = [centre[0] + offset[0] + normal[0] * Math.sin(angle) * roll, centre[1] + normal[1] * Math.sin(angle) * roll + 0.012, centre[2] + offset[2] + normal[2] * Math.sin(angle) * roll];
            const out = tkgUnit([offset[0] / roll + normal[0] * Math.sin(angle), normal[1] * Math.sin(angle), offset[2] / roll + normal[2] * Math.sin(angle)]);
            // (The painted roll spans 0.28..0.72 of its row.)
            return { point: world(point), normal: turned(out), u: ((k + 0.5 - 0.22 * Math.cos(angle)) / rolls) * metres };
          });
        };
        let upper = section(v0);
        for (let r = 0; r < rows; r += 1) {
          const va = v0 + ((1 - v0) * r) / rows;
          const vb = v0 + ((1 - v0) * (r + 1)) / rows;
          const lower = section(vb);
          for (let j = 0; j < cuts; j += 1) {
            const corners = [lower[j], lower[j + 1], upper[j + 1], upper[j]];
            const facing = tkgCross(tkgSub(corners[1].point, corners[0].point), tkgSub(corners[3].point, corners[0].point));
            const outward = corners[0].normal[0] * facing[0] + corners[0].normal[1] * facing[1] + corners[0].normal[2] * facing[2] >= 0;
            const order = outward ? [0, 1, 2, 3] : [1, 0, 3, 2];
            builder.quad(tiles, ...order.map((index) => corners[index].point), {
              uvs: order.map((index) => [corners[index].u, tileV(index === 0 || index === 1 ? vb : va)]), colour: tint, normals: order.map((index) => corners[index].normal),
            });
          }
          upper = lower;
        }
        // The round eave tile closing the roll, and the pointed drip tile under the pan beside it.
        const mid = world(tkgAdd(slope.point(u, 1), [0, 0.012 + roll * 0.4, 0]));
        const facingOut = (a, b, c) => {
          const outward = tkgSub(world(slope.point(u, 1)), world(slope.point(u, 0.6)));
          const normal = tkgCross(tkgSub(b, a), tkgSub(c, a));
          return normal[0] * outward[0] + normal[2] * outward[2] >= 0 ? [a, b, c] : [a, c, b];
        };
        for (let j = 0; j < cuts; j += 1) builder.tri(tiles, ...facingOut(mid, upper[j].point, upper[j + 1].point), [[0.1, 0.1], [0.12, 0.1], [0.12, 0.12]], dark.map((value) => value * 1.25));
        if (k + 1 < count) {
          const a = world(slope.point(u + step * 0.22, 1));
          const b = world(slope.point(u + step * 0.78, 1));
          const tip = world(tkgAdd(slope.point(u + step * 0.5, 1), [0, -0.085, 0]));
          builder.tri(tiles, ...facingOut(a, b, tip), [[0.1, 0.1], [0.14, 0.1], [0.12, 0.06]], dark.map((value) => value * 1.1));
        }
      }
    });
    if (!soffit) continue;
    // Under the eave: boards on rafters, from the eave back `tuck` m of plan (to the wall plate and a little past it).
    const tuck = Math.min(slope.run * (1 - slope.from) - 0.02, (spec.overhang ?? 0.6) + 0.35);
    const vIn = 1 - tuck / slope.run;
    const under = (u, v, drop) => {
      const point = slope.point(u, v);
      return world([point[0], point[1] - drop, point[2]]);
    };
    const board = timber.map((value) => value * 0.8);
    const boards = Math.max(1, Math.round(count / 4));
    for (let k = 0; k < boards; k += 1) {
      const ua = -slope.half + (2 * slope.half * k) / boards;
      const ub = -slope.half + (2 * slope.half * (k + 1)) / boards;
      if (slope.start(ua) > vIn && slope.start(ub) > vIn) continue;
      const corners = [under(ua, 1, edge), under(ub, 1, edge), under(ub, Math.max(vIn, slope.start(ub)), edge), under(ua, Math.max(vIn, slope.start(ua)), edge)];
      const facing = tkgCross(tkgSub(corners[1], corners[0]), tkgSub(corners[3], corners[0]))[1] <= 0;
      const order = facing ? [0, 1, 2, 3] : [1, 0, 3, 2];
      builder.quad('timber', ...order.map((index) => corners[index]), { uvs: order.map((index) => [[0, ua], [0, ub], [tuck, ub], [tuck, ua]][index]), colour: [board, board, board.map((value) => value * 0.6), board.map((value) => value * 0.6)].map((_, index, list) => list[order[index]]) });
    }
    builder.at('near', () => {
      const [wide, deep] = TK_GEO.eave.rafter;
      const rafters = Math.max(1, Math.round((2 * slope.half) / TK_GEO.eave.spacing));
      for (let k = 0; k < rafters; k += 1) {
        const u = -slope.half + ((k + 0.5) * 2 * slope.half) / rafters;
        const from = Math.max(vIn, slope.start(u));
        if (from >= 0.98) continue;
        const points = [under(u, from, edge + deep), under(u, 1 - 0.06 / slope.run, edge + deep)];
        builder.sweep('timber', points, wide, deep, { colour: timber, under: true });
        if (rafterEnd) {
          const end = points[1];
          const ahead = tkgUnit(tkgSub(points[1], points[0]));
          const side = tkgUnit(tkgCross(ahead, [0, 1, 0]));
          const up = tkgCross(side, ahead);
          const corner = (s, h) => tkgAdd(tkgAdd(tkgAdd(end, ahead, 0.004), side, s * wide * 0.5), up, h * deep);
          builder.quad('timber', corner(-1, 0), corner(-1, 1), corner(1, 1), corner(1, 0), { colour: rafterEnd });
        }
      }
    });
  }
  // The ridge, its ends turned up; a hip-and-gable's gables; the hips.
  const ridgeSpec = { high: 0.24, wide: 0.2, lift: 0.18, material: tiles, colour: tint.map((value) => value * 0.85), ...ridge };
  const top = spec.eave + spec.rise;
  if (slopes.ridge > 0) {
    const cuts = 12;
    const line = Array.from({ length: cuts + 1 }, (_, k) => {
      const x = -slopes.ridge + (2 * slopes.ridge * k) / cuts;
      return world([x, top - 0.02 + ridgeSpec.lift * Math.abs(x / slopes.ridge) ** 4, 0]);
    });
    builder.sweep(ridgeSpec.material, line, ridgeSpec.wide, ridgeSpec.high, { colour: ridgeSpec.colour });
  }
  if (slopes.kind !== 'gable' && slopes.kind !== 'lean') {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const front = slopes[sz > 0 ? 0 : 1];
        const cuts = 6;
        const from = slopes.gable ? slopes.gable.knee : front.from;
        // The hip's line on the front (or back) slope: where start(u) = v.
        const line = Array.from({ length: cuts + 1 }, (_, k) => {
          const v = from + ((1 - from) * k) / cuts;
          const u = (front.half - front.run * (1 - v)) * sx * (sz > 0 ? 1 : -1);
          return world(front.point(u, v));
        });
        builder.sweep(ridgeSpec.material, line, ridgeSpec.wide * 0.85, ridgeSpec.high * 0.8, { colour: ridgeSpec.colour, sink: 0.02 });
      }
    }
  }
  if (slopes.gable) {
    const { half, knee, run } = slopes.gable;
    const cuts = 5;
    for (const sx of [-1, 1]) {
      // The gable: an upright face from the ridge down to the knee, following the slopes' hollow; then its two descending ridges.
      const profile = Array.from({ length: cuts + 1 }, (_, k) => slopes[0].point(0, (knee * k) / cuts));
      const face = spec.gableMaterial ?? 'plaster';
      const paint = spec.gableColour ?? TKG_WHITE;
      const low = profile[cuts][1];
      for (let k = 0; k < cuts; k += 1) {
        for (const sz of [-1, 1]) {
          const a = [sx * half, profile[k][1], sz * profile[k][2]];
          const b = [sx * half, profile[k + 1][1], sz * profile[k + 1][2]];
          const corners = [[sx * half, low, a[2]], [sx * half, low, b[2]], b, a].map(world);
          const order = sx * sz > 0 ? [1, 0, 3, 2] : [0, 1, 2, 3];
          builder.quad(face, ...order.map((index) => corners[index]), { uvs: order.map((index) => [[a[2], low], [b[2], low], [b[2], b[1]], [a[2], a[1]]][index]), colour: paint });
        }
      }
      for (const sz of [-1, 1]) {
        const line = profile.map((point) => world([sx * (half + 0.02), point[1], sz * point[2]]));
        builder.sweep(ridgeSpec.material, line, ridgeSpec.wide * 0.8, ridgeSpec.high * 0.8, { colour: ridgeSpec.colour, sink: 0.03 });
      }
      void run;
    }
  }
  return slopes;
}

// ---- timber -----------------------------------------------------------------------------------------------------

/**
 * A timber bay in `frame`, from local x0 to x1 at depth z (facing +z), y0 to y1: what stands between two posts of a
 * shopfront or an upper storey. `kind`:
 *   'lattice'  a boarded panel to `sill`, lattice leaves above it (each `leaf` m wide, framed), the room dark behind;
 *   'boards'   shop boards the whole height (a shut shop);
 *   'door'     two plank leaves, a threshold;
 *   'open'     an open shopfront: a counter to `sill`, the dark of the shop behind.
 * `finish`: the timber's colour; `paint`: the lattice's colour if not the timber's.
 */
export function tkgBay(builder, frame, { kind = 'lattice', x0, x1, y0, y1, z = 0, sill = 0.9, leaf = 0.62, finish = [0.3, 0.22, 0.17], paint = null, back = 0.5, latticeMaterial = 'lattice' }) {
  const wide = x1 - x0;
  const dark = [0.05, 0.045, 0.04];
  const frameSize = 0.055;
  const face = z - 0.05;
  const lattice = paint ?? finish.map((value) => Math.min(1, value * 1.15));
  const boards = (xa, xb, ya, yb, depth, tint = finish) => builder.quad('timber', frame(xa, ya, depth), frame(xb, ya, depth), frame(xb, yb, depth), frame(xa, yb, depth), {
    // (Boards stand upright: the sheet's grain, which runs along u, is turned to run up.)
    uvs: [[ya, xa], [ya, xb], [yb, xb], [yb, xa]], colour: [tint.map((value) => value * 0.82), tint.map((value) => value * 0.82), tint, tint],
  });
  if (kind === 'boards') {
    boards(x0, x1, y0, y1, face);
    builder.at('near', () => builder.box('timber', frame, x0, x1, y0 + (y1 - y0) * 0.55, y0 + (y1 - y0) * 0.55 + 0.07, face, face + 0.03, { colour: finish.map((value) => value * 0.85), skip: 'back' }));
    return;
  }
  if (kind === 'door') {
    const gap = 0.012;
    boards(x0, x0 + wide / 2 - gap, y0 + 0.06, y1, face);
    boards(x0 + wide / 2 + gap, x1, y0 + 0.06, y1, face);
    builder.quad('timber', frame(x0 + wide / 2 - gap, y0, face - 0.02), frame(x0 + wide / 2 + gap, y0, face - 0.02), frame(x0 + wide / 2 + gap, y1, face - 0.02), frame(x0 + wide / 2 - gap, y1, face - 0.02), { colour: dark });
    builder.box('ashlar', frame, x0, x1, y0, y0 + 0.07, z - 0.12, z + 0.1, { colour: [0.8, 0.8, 0.78], skip: 'bottom,back' });
    builder.at('near', () => {
      for (const side of [-1, 1]) for (const high of [0.3, 0.7]) builder.box('timber', frame, x0 + wide / 2 + side * (wide / 2 - 0.04) - 0.03, x0 + wide / 2 + side * (wide / 2 - 0.04) + 0.03, y0 + (y1 - y0) * high, y0 + (y1 - y0) * high + 0.06, face, face + 0.025, { colour: finish.map((value) => value * 0.7), skip: 'back' });
    });
    return;
  }
  // The dark of the room behind, and for an open shop its counter.
  const top = kind === 'open' ? y1 : y1;
  builder.quad('timber', frame(x0, y0 + sill, z - back), frame(x1, y0 + sill, z - back), frame(x1, top, z - back), frame(x0, top, z - back), { colour: dark });
  if (kind === 'open') {
    builder.box('timber', frame, x0, x1, y0, y0 + sill, face - 0.3, face, { colour: finish, skip: 'bottom,back', shade: [0.75, 1] });
    builder.quad('timber', frame(x0, y0 + sill, z - back), frame(x0, y0 + sill, face), frame(x0, y1, face), frame(x0, y1, z - back), { colour: [dark, finish.map((value) => value * 0.5), finish.map((value) => value * 0.5), dark] });
    builder.quad('timber', frame(x1, y0 + sill, face), frame(x1, y0 + sill, z - back), frame(x1, y1, z - back), frame(x1, y1, face), { colour: [finish.map((value) => value * 0.5), dark, dark, finish.map((value) => value * 0.5)] });
    return;
  }
  // The boarded panel under the sill, with its rail.
  boards(x0, x1, y0, y0 + sill, face);
  builder.box('timber', frame, x0, x1, y0 + sill - 0.03, y0 + sill + 0.05, face, face + 0.035, { colour: finish.map((value) => value * 0.9), skip: 'back' });
  // The lattice leaves: each a frame of stiles and rails round a sheet of bars, standing a little proud of the dark.
  const leaves = Math.max(1, Math.round(wide / leaf));
  const each = wide / leaves;
  const head = y1 - 0.02;
  const foot = y0 + sill + 0.05;
  for (let k = 0; k < leaves; k += 1) {
    const xa = x0 + k * each + 0.012;
    const xb = x0 + (k + 1) * each - 0.012;
    builder.quad(latticeMaterial, frame(xa + frameSize, foot + frameSize, face), frame(xb - frameSize, foot + frameSize, face), frame(xb - frameSize, head - frameSize, face), frame(xa + frameSize, head - frameSize, face), {
      uvs: [[xa, foot], [xb - 2 * frameSize, foot], [xb - 2 * frameSize, head - 2 * frameSize], [xa, head - 2 * frameSize]], colour: lattice,
    });
    const stile = (xs, xe, ys, ye) => builder.box('timber', frame, xs, xe, ys, ye, face - 0.01, face + 0.022, { colour: lattice.map((value) => value * 0.92), skip: 'back,bottom' });
    stile(xa, xa + frameSize, foot, head);
    stile(xb - frameSize, xb, foot, head);
    stile(xa + frameSize, xb - frameSize, foot, foot + frameSize);
    stile(xa + frameSize, xb - frameSize, head - frameSize, head);
  }
}

/**
 * A balustrade along world floor points `path` ([x, y, z] each, the walk's level): stone posts every `spacing` m with a
 * turned cap, a rail and pierced panel between (the canal bank's, the bridge's). `high`: the rail's top above the walk.
 */
export function tkgBalustrade(builder, path, { material = 'ashlar', high = 0.95, spacing = 1.7, post = 0.17, colour = [0.9, 0.9, 0.88], panel = true } = {}) {
  const origin = tkgFrame();
  for (let k = 0; k + 1 < path.length; k += 1) {
    const a = path[k];
    const b = path[k + 1];
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const count = Math.max(1, Math.round(length / spacing));
    const at = (share) => [a[0] + (b[0] - a[0]) * share, a[1] + (b[1] - a[1]) * share, a[2] + (b[2] - a[2]) * share];
    const yaw = Math.atan2(-(b[2] - a[2]), b[0] - a[0]);
    for (let n = 0; n <= count; n += 1) {
      if (n === count && k + 2 < path.length) continue;
      const p = at(n / count);
      const frame = tkgFrame(p[0], p[1], p[2], yaw);
      builder.box(material, frame, -post / 2, post / 2, 0, high + 0.08, -post / 2, post / 2, { colour, skip: 'bottom', shade: [0.8, 1] });
      builder.at('near', () => builder.lathe(material, frame, 0, 0, [[post * 0.42, high + 0.08], [post * 0.62, high + 0.14], [post * 0.5, high + 0.22], [post * 0.2, high + 0.3], [0.001, high + 0.31]], { colour, sides: 8 }));
    }
    for (let n = 0; n < count; n += 1) {
      const p = at(n / count);
      const q = at((n + 1) / count);
      const lift = (point, y) => [point[0], point[1] + y, point[2]];
      // The rail (a sloped bar between the posts' sides) and the slab under it, with a gap at the foot.
      builder.sweep(material, [lift(p, high - 0.14), lift(q, high - 0.14)], post * 0.7, 0.14, { colour });
      if (panel) builder.sweep(material, [lift(p, 0.16), lift(q, 0.16)], post * 0.42, high - 0.42, { colour: colour.map((value) => value * 0.92) });
    }
  }
  void origin;
}

/**
 * A bracket set on a column head in `frame` (at the column's top, facing +z): a bearing block, bracket arms out to the
 * front and along the wall in `tiers`, each carrying small blocks, as under the eaves of the gate pavilion. Stacked boxes.
 */
export function tkgBracket(builder, frame, { tiers = 2, reach = 0.26, colour = [0.55, 0.16, 0.12], block = [0.2, 0.42, 0.33], arm = 0.11 } = {}) {
  builder.box('timber', frame, -0.15, 0.15, 0, 0.12, -0.15, 0.15, { colour: block, skip: 'bottom' });
  for (let tier = 0; tier < tiers; tier += 1) {
    const y = 0.12 + tier * 0.2;
    const out = reach * (tier + 1);
    // The arm out toward the eave (its nose cut to a slope), and the arm along the wall.
    builder.box('timber', frame, -arm / 2, arm / 2, y, y + 0.13, -0.12, out, { colour, skip: 'back' });
    builder.box('timber', frame, -out - 0.12, out + 0.12, y, y + 0.13, -arm / 2, arm / 2, { colour });
    for (const [bx, bz] of [[0, out - 0.08], [-out, 0], [out, 0]]) builder.box('timber', frame, bx - 0.08, bx + 0.08, y + 0.13, y + 0.2, bz - 0.08, bz + 0.08, { colour: block });
  }
  return 0.12 + tiers * 0.2;
}

/** How many triangles a builder holds, by level: for budgets and tests. */
export function tkgCount(builder) {
  const counts = { all: 0, near: 0, far: 0 };
  for (const batch of builder.batches()) counts[batch.level] += batch.position.length / 9;
  return counts;
}
