// Depth precision: what keeps two surfaces a hair apart from flickering as the camera moves.
//
// A 24-bit depth buffer cannot tell two faces apart that are closer than one step of it, and the step grows with the square of the distance and
// shrinks with the camera's near plane: z * z / (near * 2^24). At a near plane of 5 cm a step is 1 mm at 30 m and 1 cm at 100 m, so every pair of faces a
// millimetre apart (a path laid on its hillside, a wall piece and its neighbour's) crawled and flashed in the middle distance. Two measures fix it: a
// near plane out where no wall can be (the follow camera keeps a ball of 32 cm clear of every wall: levelmode/kit.js stageCameraRoom), and no two faces
// of the castle's geometry on one plane (`KIT_LIFT`: each piece is lifted a different hair along its faces' normals, so one of every two overlapping
// faces always wins, the same one in every frame).
//
// Pure arithmetic, so that it can be tested in Node.

/** The camera's near plane (m). The nearest the watching camera comes to a man is 1.1 m, the follow camera's ball keeps 0.32 m clear of the walls. */
export const CAMERA_NEAR = 0.2;

/** Depth bits of the buffer (WebGL gives 24 where it gives a choice). */
export const DEPTH_BITS = 24;

/** The smallest difference in distance (m) the depth buffer can still tell apart at `distance` m from a camera of near plane `near`. */
export function depthStep(distance, near = CAMERA_NEAR, bits = DEPTH_BITS) {
  return (distance * distance) / (near * 2 ** bits);
}

/** How far out (m) two faces `gap` m apart stay apart: beyond it they flicker. */
export function resolvedUpTo(gap, near = CAMERA_NEAR, bits = DEPTH_BITS) {
  return Math.sqrt(gap * near * 2 ** bits);
}

/**
 * The kit's lifts: a piece number n (counted as pieces are added to a batch) lifts its faces by `LIFT_STEP` metres times one of `LIFT_LEVELS` levels; the
 * levels run through a stride, so that neighbours in the build order (the pieces that overlap are mostly neighbours) are far apart in level, and
 * two pieces collide only if they are `LIFT_LEVELS` apart. The most a face is lifted is under 4 mm: less than the 2 cm the wear decals lie off the stone.
 */
export const KIT_LIFT = { step: 0.0003, levels: 13, stride: 5 };

/** The lift (m) of piece number `n` (0, 1, 2 ... in the order of adding). */
export function kitLift(n, config = KIT_LIFT) {
  return config.step * ((n * config.stride) % config.levels);
}

/** The most any piece is lifted (m). */
export const kitLiftMost = (config = KIT_LIFT) => config.step * (config.levels - 1);

/**
 * Which layer of the floor a surface is, for the depth offset that settles a tie between faces on one plane in favour of the floor's dressing (the
 * paving over the earth, the boards over the stone): polygonOffset factor and units (negative: toward the camera), by the kit material's name.
 */
export const KIT_FLOOR_OFFSET = {
  path: { factor: -1, units: -2 },
  grass: { factor: 0, units: 0 },
  flags: { factor: -1, units: -3 },
  cobble: { factor: -1, units: -4 },
  boards: { factor: -1, units: -5 },
};

// ---- no two faces on one plane ----------------------------------------------------------------------------------------------------------------

/** The least distance (m) two overlapping faces of the same facing must stand apart after their lifts: a hair above the depth buffer's step at the range they are seen in detail. */
export const KIT_SEPARATION = 0.00025;

/**
 * The lift (m) for a piece whose faces would lie on the same plane as faces already placed: `offsets` are, for each such face, how far (m) the other stands
 * out from this piece's own (unlifted) plane; the lift must keep at least `separation` from every one. Tries the level the build order gives (`preferred`,
 * 0..levels - 1) first, then the others; if every level is taken (a crowd of faces on one plane) the preferred one stands.
 */
export function chooseLift(offsets, preferred, config = KIT_LIFT, separation = KIT_SEPARATION) {
  for (let k = 0; k < config.levels; k += 1) {
    const lift = config.step * ((preferred + k) % config.levels);
    if (offsets.every((offset) => Math.abs(lift - offset) >= separation)) return lift;
  }
  return config.step * preferred;
}

/**
 * The big flat faces placed so far, to find where a new one would lie on the same plane (and the same facing) and overlap. A face is
 * { axis (0 x, 1 y, 2 z), sign (+1 or -1: which way it faces), height (m along its normal: sign * the plane's coordinate, with the lift), rect: [a0, a1, b0, b1]
 * (its extent along the other two axes, in order) }.
 */
export class FaceRegistry {
  constructor(cell = 0.004) {
    this.cell = cell;
    this.cells = new Map();
  }

  add(axis, sign, height, rect) {
    const key = `${axis}${sign > 0 ? '+' : '-'}${Math.round(height / this.cell)}`;
    let list = this.cells.get(key);
    if (!list) this.cells.set(key, (list = []));
    list.push({ height, rect });
  }

  /** The heights of the faces within `reach` m of `height` that overlap `rect` (positively: a shared edge is not an overlap). */
  near(axis, sign, height, rect, reach = 0.0045) {
    const found = [];
    const steps = Math.ceil(reach / this.cell);
    const centre = Math.round(height / this.cell);
    for (let d = -steps; d <= steps; d += 1) {
      for (const face of this.cells.get(`${axis}${sign > 0 ? '+' : '-'}${centre + d}`) ?? []) {
        if (Math.abs(face.height - height) > reach) continue;
        const r = face.rect;
        if (Math.min(r[1], rect[1]) - Math.max(r[0], rect[0]) > 1e-4 && Math.min(r[3], rect[3]) - Math.max(r[2], rect[2]) > 1e-4) found.push(face.height);
      }
    }
    return found;
  }
}
