// Pressed ground (src/env/): one record of how near the ground a body has come, kept round the player and carried
// with him. Bodies write to it once a frame (their bones as the physics has them, so a walk, a run, a stumble, a fall
// or a dragged foot marks the ground with nothing scripted); grass reads it as the height its blades are held under
// (grass.js), lying snow as the depth it is trodden to (terrain.js), and a place that draws itself reads the same
// record through ENV_GLSL_PRESS (envPressLayer tells a stacked surface, a wall walk over a street, from the floor
// the marks were made on).
//
// The record is a square of texels fixed to the ground and wrapped (a texel of world x, z is floor(x / texel) mod
// size), so carrying it moves nothing: the texels left behind are wiped as they come round to the ground ahead.
// A mark is stored with the reading of a healing clock added, and the shader subtracts the clock now, so healing
// costs no pass over the record; a clock past 1 is brought back by 1 with one pass over the bytes (every
// 1 / rate seconds). Physics does not know any of this: only the few centimetres of a print are drawn.

/* global THREE */

import { P, SEGMENTS } from '../body.js';
import { floorUnder } from '../physics.js';

export const ENV_PRESS = {
  // The record: `size` texels a side, each `texel` m. A boot's sole is about 0.1 by 0.28 m (by eye): 0.07 draws a
  // print two texels wide and four long, the coarsest that still reads as a foot and not a round hole (by eye on
  // the strip sheets). It reaches size x texel / 2 = 17.9 m from the player each way, about what a camera behind
  // him shows of the ground in any detail; past `edge` of that reach (a share) marks fade out.
  size: 512,
  texel: 0.07,
  edge: 0.9,
  // Whatever comes nearer the ground than `tall` m is kept for grass (rank grass stands to about 1 m; a knee
  // passing at half a metre parts only what is taller), and nearer than `deep` m for snow (the deepest lying snow
  // the places draw, kept apart from `tall` so a print's depth has 2.4 mm steps in a byte).
  tall: 1,
  deep: 0.3,
  // A pressed blade's tip comes back up at `rise` m/s. Trodden grass takes hours to a day to stand again
  // (approximate: how long a path across a lawn shows; not a measured figure). Shortened to seconds so the trail
  // behind a man is short: a 0.3 m sward is up in about 8 s, rank grass 0.8 m tall in 20.
  rise: 0.04,
  // Lying snow is `snow` m deep where a weather whitens the ground fully (uEnvWet.y = 1): ankle deep, a new fall of
  // a few hours (by eye, deep enough for a print to have walls). A print fills at `fill` m/s, [in still air, while
  // snow falls at a weather's full share]: real snowfall fills at centimetres an hour (approximate); the second
  // figure is that hurried about two hundred times so healing is seen within a fight, the first is nothing: an
  // old print stays until the record leaves it behind.
  snow: 0.14,
  fill: [0, 0.002],
  // A boot packs new snow under it to `packed` of its depth (approximate: new snow is several times lighter than
  // trodden snow; by eye against photographs of prints, whose beds stand a little over the ground).
  packed: 0.3,
  // The snow a foot pushes out stands in a lip round the print, `lip` of the print's depth high; the packed bed
  // is `packedColour` of the fresh snow's colour (display values, by eye against photographs of prints in new
  // snow: the bed is denser, scatters less and takes the sky's colour).
  lip: 0.22,
  // A sole's width (m), for the sky a print's bed sees (by eye, as `texel` above).
  sole: 0.1,
  packedColour: [0.78, 0.86, 0.97],
  // A moving limb disturbs more than a still one: beside it grass within `brush` m is knocked down too when it
  // passes at `quick` m/s or more, and in proportion below that (a slow leg lets the blades slide round it and
  // stand again; a fast one creases them before they can: by eye).
  brush: 0.14,
  quick: 3,
  // A limb moving at `quick` m/s through lying snow packs none of it: the loose snow it cuts falls back into
  // `plough` of its trench (by eye: a swinging foot leaves at most a scuff between the prints of the planted ones,
  // as photographs of tracks in new snow show), and in proportion below that speed.
  plough: 0.7,
  // The foot: a sole from `heel` m behind the ankle to `toe` m ahead of it, the way the man faces (a sole of
  // 0.26 m on a man of 1.75 m, the ankle over its back quarter: by eye).
  heel: 0.06,
  toe: 0.2,
  // How many bodies write, the player first and then the nearest to him, per quality tier (config.js
  // ENV.quality). A standing man touches about 2 x 6 x 6 texels a frame, a fallen one about 30 x 10: the writing is
  // well under a tenth of a millisecond for all of them; the upload is the cost (measured: see the handover log).
  bodies: { high: 8, medium: 4, low: 2 },
  // A body writes only when the floor it stands on is within `layer` m of the player's (a man on a wall walk
  // 4.5 m over the street does not mark the street), and a reader on a stacked surface discards marks the same way.
  layer: 0.5,
};

// The bones a body presses with, as pairs of particle indices: body.js SEGMENTS (trunk, head, arms, legs), and
// across the shoulders and across the hips.
const ENV_PRESS_BONES = [
  ...Object.values(SEGMENTS).map(({ from, to }) => [P[from], P[to]]),
  [P.lShoulder, P.rShoulder],
  [P.lHip, P.rHip],
];
const ENV_PRESS_ANKLES = [P.lFoot, P.rFoot];

let envPressed = null;
let envPressOn = true;

/** The record's uniforms, one object for every material that reads it (spread them into a material's own). */
export function envPressUniforms() {
  return envPressRecord().uniforms;
}

/**
 * The record, one for the page: { bytes, texture (null without three), uniforms, column, row (its middle texel),
 * clocks, time, world, bodies (how many wrote last frame), wrote (texels written last frame) }.
 */
export function envPressRecord() {
  if (envPressed) return envPressed;
  const { size } = ENV_PRESS;
  const bytes = new Uint8Array(size * size * 4);
  const three = typeof THREE !== 'undefined';
  let texture = null;
  if (three) {
    texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
    texture.magFilter = texture.minFilter = THREE.LinearFilter;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.generateMipmaps = false;
    texture.flipY = false;
  }
  const vector = (x, y, z, w) => (three ? new THREE.Vector4(x, y, z, w) : { x, y, z, w, set(a, b, c, d) { Object.assign(this, { x: a, y: b, z: c, w: d }); return this; } });
  envPressed = {
    bytes, texture, column: null, row: null, clocks: [0, 0], time: null, world: null, lead: null, bodies: 0, wrote: 0,
    uniforms: {
      // r, g: how near the ground a body came (1 - clearance / tall for grass, / deep for snow), with the healing
      // clock's reading when it was written added, in 127ths; b, a: the way the blades were pushed (0..255, 128 none).
      uEnvPress: { value: texture },
      // xy: the record's middle (m); z: how far it reaches each way (m); w: 1 / its width (m).
      uEnvPressAt: { value: vector(0, 0, 1, 1) },
      // x, y: the healing clocks now (grass, snow, in the record's 127ths over 127); z: the floor height the marks
      // were made on (m); w: 1 while the record is kept, 0 otherwise.
      uEnvPressClock: { value: vector(0, 0, 0, 0) },
    },
  };
  envPressWipe(envPressed);
  return envPressed;
}

function envPressWipe(press) {
  const { bytes } = press;
  bytes.fill(0);
  for (let at = 2; at < bytes.length; at += 4) bytes[at] = bytes[at + 1] = 128;
  press.clocks[0] = press.clocks[1] = 0;
  press.column = null;
  press.row = null;
  if (press.texture) press.texture.needsUpdate = true;
}

/** Keep the record (true) or not (false: grass and snow read nothing, nothing is written or uploaded). */
export function envPressSet(on) {
  envPressOn = !!on;
  const press = envPressRecord();
  if (!envPressOn) {
    press.uniforms.uEnvPressClock.value.w = 0;
    envPressWipe(press);
  }
  return envPressOn;
}

/** Forget every mark (a place left or put up again: index.js envApply / envLeave). */
export function envPressForget() {
  const press = envPressRecord();
  envPressWipe(press);
  press.time = null;
  press.world = null;
  press.uniforms.uEnvPressClock.value.w = 0;
}

/**
 * Once a frame: carry the record with the lead and let the bodies near him write to it. `world` the physics world
 * (fighters: x particle places, v velocities, radius radii, yaw; arena.terrain the floors, if any); `lead` the body
 * the record follows (the player; without one, the body nearest `eye`); `tier` the quality tier's name; `snowing`
 * 0..1 how hard snow falls now.
 */
export function envPressStep({ world, lead = null, eye = null, tier = 'high', snowing = 0 }) {
  const press = envPressRecord();
  const u = press.uniforms;
  const tune = ENV_PRESS;
  const { size, texel, tall, deep } = tune;
  const bytes = press.bytes;
  const count = envPressOn ? tune.bodies[tier] ?? tune.bodies.high : 0;
  press.bodies = 0;
  press.wrote = 0;
  const fighters = (world?.fighters ?? []).filter((fighter) => fighter?.x?.length >= 45 && !fighter.dormant && !fighter.fled);
  if (!lead || !fighters.includes(lead)) {
    lead = null;
    if (eye) {
      let best = Infinity;
      for (const fighter of fighters) {
        const far = Math.hypot(fighter.x[24] - eye.x, fighter.x[26] - eye.z);
        if (far < best) [best, lead] = [far, fighter];
      }
    }
  }
  const time = world?.time ?? 0;
  if (!count || !lead) {
    u.uEnvPressClock.value.w = 0;
    return press;
  }
  let dirty = false;
  // A fight begun again or another put on: the ground is unmarked.
  if (press.world !== world || press.time === null || time < press.time) {
    envPressWipe(press);
    press.world = world;
    dirty = true;
  }
  const dt = Math.min(0.1, Math.max(0, time - (press.time ?? time)));
  press.time = time;
  // The clocks: grass rises at `rise`, snow fills at `fill`, each as a share of the height its channel spans.
  const rates = [tune.rise / tall, (tune.fill[0] + (tune.fill[1] - tune.fill[0]) * snowing) / deep];
  for (let channel = 0; channel < 2; channel += 1) {
    press.clocks[channel] += rates[channel] * dt;
    if (press.clocks[channel] >= 1) {
      press.clocks[channel] -= 1;
      for (let at = channel; at < bytes.length; at += 4) bytes[at] = Math.max(0, bytes[at] - 127);
      dirty = true;
    }
  }
  // Carry it: the middle texel follows the lead's hips; the columns and rows that come round ahead are wiped.
  const cx = lead.x[24];
  const cz = lead.x[26];
  const column = Math.floor(cx / texel);
  const row = Math.floor(cz / texel);
  const wrap = (index) => ((index % size) + size) % size;
  const half = size / 2;
  if (press.column === null || Math.abs(column - press.column) >= half || Math.abs(row - press.row) >= half) {
    if (press.column !== null) envPressWipe(press);
    dirty = true;
  } else {
    for (let step = press.column; step !== column; step += Math.sign(column - press.column)) {
      const gone = wrap(column > press.column ? step + half : step - half);
      for (let at = gone * 4, line = 0; line < size; line += 1, at += size * 4) {
        bytes[at] = bytes[at + 1] = 0;
        bytes[at + 2] = bytes[at + 3] = 128;
      }
      dirty = true;
    }
    for (let step = press.row; step !== row; step += Math.sign(row - press.row)) {
      const gone = wrap(row > press.row ? step + half : step - half);
      for (let at = gone * size * 4, end = at + size * 4; at < end; at += 4) {
        bytes[at] = bytes[at + 1] = 0;
        bytes[at + 2] = bytes[at + 3] = 128;
      }
      dirty = true;
    }
  }
  press.column = column;
  press.row = row;
  const reach = (size * texel) / 2;

  // The floor each body stands on: the physics's own (a place's floors, the lie of the land, else the level plane).
  const arena = world?.arena ?? null;
  const floorOf = (fighter) => {
    const x = fighter.x;
    let low = Infinity;
    for (let at = 0; at < 15; at += 1) low = Math.min(low, x[at * 3 + 1] - (fighter.radius?.[at] ?? 0.05));
    return floorUnder(arena, x[26], x[24], low + tune.layer);
  };
  const leadFloor = floorOf(lead);
  u.uEnvPressAt.value.set((column + 0.5) * texel, (row + 0.5) * texel, reach, 1 / (size * texel));
  u.uEnvPressClock.value.set(press.clocks[0], press.clocks[1], leadFloor, 1);

  // Who writes: the lead, then the nearest to him inside the record, as many as the tier allows.
  let near = [];
  if (count > 1) {
    const within = reach * tune.edge;
    for (const fighter of fighters) {
      if (fighter === lead) continue;
      const far = Math.max(Math.abs(fighter.x[24] - cx), Math.abs(fighter.x[26] - cz));
      if (far <= within) near.push({ fighter, far });
    }
    if (near.length > count - 1) near = near.sort((a, b) => a.far - b.far).slice(0, count - 1);
  }
  const clock0 = press.clocks[0];
  const clock1 = press.clocks[1];
  let wrote = 0;
  // One bone: a capsule from a to b, radii ar and br, moving at (vx, vz), over a floor at `ground`.
  const bone = (ax, ay, az, ar, bx, by, bz, br, vx, vz, ground) => {
    const lowA = Math.max(0, ay - ar - ground);
    const lowB = Math.max(0, by - br - ground);
    if (Math.min(lowA, lowB) >= tall) return;
    const speed = Math.hypot(vx, vz);
    const quick = Math.min(1, speed / tune.quick);
    // (What it passed over since the last frame is under it too.)
    const brush = tune.brush * quick + 0.5 * speed * dt;
    const most = Math.max(ar, br) + brush;
    const dx = bx - ax;
    const dz = bz - az;
    const long = dx * dx + dz * dz;
    const c0 = Math.floor((Math.min(ax, bx) - most) / texel);
    const c1 = Math.floor((Math.max(ax, bx) + most) / texel);
    const r0 = Math.floor((Math.min(az, bz) - most) / texel);
    const r1 = Math.floor((Math.max(az, bz) + most) / texel);
    for (let line = r0; line <= r1; line += 1) {
      const pz = (line + 0.5) * texel - az;
      for (let cell = c0; cell <= c1; cell += 1) {
        const px = (cell + 0.5) * texel - ax;
        const along = long > 1e-8 ? Math.min(1, Math.max(0, (px * dx + pz * dz) / long)) : 0.5;
        const ox = px - dx * along;
        const oz = pz - dz * along;
        const off = Math.hypot(ox, oz);
        const round = ar + (br - ar) * along;
        if (off > round + brush) continue;
        const low = lowA + (lowB - lowA) * along;
        // Under the bone: its round underside. Beside a moving one: knocked down less the further off.
        const edge = off < round ? 0 : (off - round) / Math.max(brush, 1e-6);
        const clear = off < round ? low + round - Math.sqrt(round * round - off * off) : low + round + (tall - low - round) * edge * edge;
        if (clear >= tall) continue;
        const at = (wrap(line) * size + wrap(cell)) * 4;
        const grass = Math.min(255, Math.round((1 - clear / tall + clock0) * 127));
        if (grass > bytes[at]) {
          // The blades go the way the limb went when it was quick, else out from under it.
          const outX = off > 1e-4 ? ox / off : 0;
          const outZ = off > 1e-4 ? oz / off : 0;
          const wayX = quick * (vx / Math.max(speed, 1e-6)) + (1 - quick) * outX;
          const wayZ = quick * (vz / Math.max(speed, 1e-6)) + (1 - quick) * outZ;
          bytes[at] = grass;
          bytes[at + 2] = Math.round(128 + 127 * Math.max(-1, Math.min(1, wayX)));
          bytes[at + 3] = Math.round(128 + 127 * Math.max(-1, Math.min(1, wayZ)));
          wrote += 1;
        }
        // Snow is packed by a limb that bears on it; one sweeping through cuts a trench the loose snow falls back into.
        const settle = clear + (deep - clear) * tune.plough * quick;
        if (settle < deep && off < round) {
          const snow = Math.min(255, Math.round((1 - settle / deep + clock1) * 127));
          if (snow > bytes[at + 1]) {
            bytes[at + 1] = snow;
            wrote += 1;
          }
        }
      }
    }
  };
  const body = (fighter, ground) => {
    const { x, v, radius } = fighter;
    for (const [from, to] of ENV_PRESS_BONES) {
      const a = from * 3;
      const b = to * 3;
      bone(x[a], x[a + 1], x[a + 2], radius?.[from] ?? 0.06, x[b], x[b + 1], x[b + 2], radius?.[to] ?? 0.06, (v[a] + v[b]) / 2, (v[a + 2] + v[b + 2]) / 2, ground);
    }
    // The sole, heel to toe, the way he faces (body.js: facing is (cos yaw, -sin yaw) on the floor).
    const cos = Math.cos(fighter.yaw ?? 0);
    const sin = -Math.sin(fighter.yaw ?? 0);
    for (const ankle of ENV_PRESS_ANKLES) {
      const a = ankle * 3;
      const round = radius?.[ankle] ?? 0.045;
      bone(x[a] - cos * tune.heel, x[a + 1], x[a + 2] - sin * tune.heel, round, x[a] + cos * tune.toe, x[a + 1], x[a + 2] + sin * tune.toe, round, v[a], v[a + 2], ground);
    }
  };
  body(lead, leadFloor);
  for (const { fighter } of near) {
    const ground = floorOf(fighter);
    if (Math.abs(ground - leadFloor) <= tune.layer) body(fighter, ground);
  }
  press.bodies = 1 + near.length;
  press.wrote = wrote;
  if ((dirty || wrote) && press.texture) press.texture.needsUpdate = true;
  return press;
}

/**
 * GLSL for anything that reads the record (uniforms: envPressUniforms()).
 * envPress(xz) -> x: the height over the ground grass there is held under (m; ENV_PRESS.tall where nothing has
 * been), y: the height lying snow is trodden down to (m; ENV_PRESS.deep where nothing has), zw: the way the blades
 * were pushed (level; zero where nothing pushed them).
 * envPressLayer(y) -> 1 where a surface at height y is the floor the marks were made on, 0 on a surface stacked
 * over or under it (a place with floors at several heights multiplies what it reads by this).
 * envSnowPrint(xz, lying) -> x: how far below fresh snow lying `lying` m deep its surface is there (m; under 0 on
 * the lip of snow pushed out round a print), yz: that surface's slope along x and z, w: 0..1 how packed it is.
 */
export const ENV_GLSL_PRESS = /* glsl */ `
uniform sampler2D uEnvPress;
uniform vec4 uEnvPressAt;
uniform vec4 uEnvPressClock;
vec4 envPress(vec2 xz) {
  vec2 off = abs(xz - uEnvPressAt.xy);
  float inside = (1.0 - smoothstep(uEnvPressAt.z * ${ENV_PRESS.edge.toFixed(2)}, uEnvPressAt.z, max(off.x, off.y))) * uEnvPressClock.w;
  if (inside <= 0.0) return vec4(${ENV_PRESS.tall.toFixed(2)}, ${ENV_PRESS.deep.toFixed(2)}, 0.0, 0.0);
  vec4 mark = texture2D(uEnvPress, xz * uEnvPressAt.w);
  // (The record holds the mark with the clock's reading added: what is left of it is that less the clock now.)
  vec2 held = clamp(mark.rg * ${(255 / 127).toFixed(5)} - uEnvPressClock.xy, 0.0, 1.0) * inside;
  return vec4((1.0 - held.x) * ${ENV_PRESS.tall.toFixed(2)}, (1.0 - held.y) * ${ENV_PRESS.deep.toFixed(2)}, (mark.ba * 255.0 - 128.0) / 127.0 * step(0.004, held.x));
}
float envPressLayer(float y) {
  return 1.0 - smoothstep(${(ENV_PRESS.layer * 0.6).toFixed(2)}, ${ENV_PRESS.layer.toFixed(2)}, abs(y - uEnvPressClock.z));
}
float envSnowLevel(vec2 xz, float lying) {
  // Trodden down to the body's underside, but no lower than the bed it packs the snow into.
  float bed = max(envPress(xz).y, lying * ${ENV_PRESS.packed.toFixed(2)});
  float dent = clamp(lying - bed, 0.0, lying) / max(lying, 1e-4);
  return lying * (${ENV_PRESS.lip.toFixed(2)} * smoothstep(0.0, 0.12, dent) * (1.0 - smoothstep(0.12, 0.45, dent)) - dent);
}
vec4 envSnowPrint(vec2 xz, float lying) {
  vec2 off = abs(xz - uEnvPressAt.xy);
  if (lying <= 0.002 || uEnvPressClock.w < 0.5 || max(off.x, off.y) > uEnvPressAt.z) return vec4(0.0);
  float here = envSnowLevel(xz, lying);
  float step_ = ${(ENV_PRESS.texel * 0.75).toFixed(4)};
  vec2 slope = vec2(envSnowLevel(xz + vec2(step_, 0.0), lying) - envSnowLevel(xz - vec2(step_, 0.0), lying), envSnowLevel(xz + vec2(0.0, step_), lying) - envSnowLevel(xz - vec2(0.0, step_), lying)) / (2.0 * step_);
  return vec4(-here, slope, clamp(-here / (lying * ${(1 - ENV_PRESS.packed).toFixed(2)}), 0.0, 1.0));
}
`;
