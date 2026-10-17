// A New York subway station at 1:40 a.m., as such a station is: a concrete
// platform gone grey-black with grime and spotted with old gum, the yellow
// tactile strip at the edge worn through to grey where people stand, cream
// wall tile streaked with soot, rust and seepage, steel I-beam columns and
// ceiling girders painted green and chipped to the primer, fluorescent tubes
// in wire cages behind yellowed diffusers, the dark wet track bed (ties,
// ballast, the running rails and the covered third rail), and a train of
// R160-type cars standing at the platform: stainless steel, fluted, with
// paired sliding doors. Water seeps through the ceiling joints: drops fall,
// ring where they land, and leave puddles on the platform (the puddles are
// in src/ground/living.js, in the realistic look) and wet streaks down a
// column and the wall.
//
// Built with the kit in src/props/arena.js: one merged geometry per
// material, colours per vertex (grime, light pools, rust), surfaces painted
// on canvas with normal maps. Real sizes throughout: the fighters are 1.8 m.

/* global THREE */
import { arenaAt, arenaBuilder, arenaFinish, arenaMaterial, arenaPainted, arenaRandom, arenaSmooth, arenaSheet } from './arena.js';

// ---- sizes ---------------------------------------------------------------------

/**
 * An R160 car (B Division, the cars on the N, Q, R and W through Canal St):
 * 18.35 m over the body, 3.05 m wide, 3.7 m from rail top to the roof, the
 * floor 1.1 m above the rail top (so level with the platform), four pairs
 * of 1.27 m doors a side, 1.93 m high. The gap between platform edge and
 * the car side is a hand's breadth.
 */
export const SUBWAY_CAR = { length: 18.35, width: 3.05, height: 3.7, floor: 1.1, gap: 0.1, doorWidth: 1.27, doorHeight: 1.93, doorsAt: [-7.15, -2.4, 2.4, 7.15], couple: 0.8 };

/** Standard gauge (m) and how high the rail head stands over the ties. */
const SUBWAY_GAUGE = 1.435;
/** The ceiling (underside of the slab) and the girders' depth below it. NYC cut-and-cover stations are low: about 3.7 m clear. */
const SUBWAY_CEILING = 3.75;
const SUBWAY_GIRDER = 0.36;
/** Column spacing along the platform (15 ft bays) and the tube fixtures, two to a bay. */
const SUBWAY_BAY = 4.6;

/**
 * Where water comes through the ceiling. Each leak drips every `period` s
 * (`phase` offsets it) from a joint in the slab onto the platform or the
 * track bed, and leaves a puddle of half-axes rx, rz there. Some lie on the
 * fighting floor (|x| ≤ 4.2, |z| ≤ 1.35) so a fight goes through water.
 */
export const SUBWAY_LEAKS = [
  { x: -1.7, z: -0.55, period: 2.3, phase: 0.0, rx: 0.55, rz: 0.36, turn: 0.4 },
  { x: 2.6, z: 0.55, period: 3.1, phase: 1.2, rx: 0.42, rz: 0.3, turn: 2.0 },
  { x: 6.1, z: -1.55, period: 1.7, phase: 0.6, rx: 0.65, rz: 0.4, turn: 0.1 },
  { x: -6.0, z: 0.9, period: 4.2, phase: 2.0, rx: 0.36, rz: 0.26, turn: 1.1 },
  { x: -10.2, z: -1.2, period: 2.8, phase: 0.3, rx: 0.5, rz: 0.32, turn: 2.6 },
  // Over the track bed: a dark pool between the ties.
  { x: 0.9, z: 'track', period: 1.9, phase: 0.9, rx: 0.9, rz: 0.5, turn: 0.05 },
];

const SUBWAY_G = 9.8;
/** s a ring lasts on the water where a drop lands. */
export const SUBWAY_RING_LIFE = 0.55;

/**
 * Where a leak's drop is at time t (s): its height above the floor it falls
 * to (null between drops), its speed, and how long since the last one
 * landed (the ring's age). `fall` is the height it falls (m).
 */
export function subwayDrip(leak, t, fall) {
  const falling = Math.sqrt((2 * fall) / SUBWAY_G);
  const period = Math.max(leak.period, falling + 0.1);
  const local = (((t + leak.phase) % period) + period) % period;
  const dropY = local < falling ? fall - 0.5 * SUBWAY_G * local * local : null;
  const sinceLanding = local >= falling ? local - falling : local - falling + period;
  return { dropY, speed: dropY === null ? 0 : SUBWAY_G * local, ringAge: sinceLanding < SUBWAY_RING_LIFE ? sinceLanding : null };
}

/** The station's layout from the fighting floor: the wall, the edge, the track, the fixtures. */
export function subwayLayout(arena) {
  const wallZ = -(arena.halfZ + 0.9);
  const edgeZ = arena.halfZ + 0.75;
  const trackZ = edgeZ + SUBWAY_CAR.gap + SUBWAY_CAR.width / 2;
  const railTop = -SUBWAY_CAR.floor;
  const fixtures = [];
  for (let x = -SUBWAY_BAY * 4.5; x <= SUBWAY_BAY * 4.5 + 0.01; x += SUBWAY_BAY / 2) fixtures.push({ x: x + SUBWAY_BAY / 4, y: SUBWAY_CEILING - SUBWAY_GIRDER - 0.12, z: (wallZ + edgeZ) / 2 - 0.15 });
  const leaks = SUBWAY_LEAKS.map((leak) => (leak.z === 'track' ? { ...leak, z: trackZ - 0.2, floor: railTop - 0.195 } : { ...leak, floor: 0 }));
  return { length: 46, wallZ, edgeZ, trackZ, railTop, farZ: trackZ + 2.4, ceiling: SUBWAY_CEILING, fixtures, leaks };
}

// ---- small helpers -----------------------------------------------------------------

const subwayHash = (a, b) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Smooth value noise in the plane, 0..1, a feature every `cell` m. */
function subwayNoise(x, z, cell, seed = 0) {
  const fx = x / cell + seed * 17.3;
  const fz = z / cell - seed * 9.1;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = fx - ix;
  const tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = subwayHash(ix, iz);
  const b = subwayHash(ix + 1, iz);
  const c = subwayHash(ix, iz + 1);
  const d = subwayHash(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}
const subwayScale = (rgb, k) => [rgb[0] * k, rgb[1] * k, rgb[2] * k];
const subwayMix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const subwayBox = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** How much of the tubes' light falls at (x, z) on the platform: a pool under each fixture, dimmer between. */
function subwayPool(fixtures, x, z) {
  let sum = 0;
  for (const fixture of fixtures) {
    const dx = x - fixture.x;
    const dz = z - fixture.z;
    if (Math.abs(dx) > 4) continue;
    sum += Math.exp(-(dx * dx) / (2 * 0.9 * 0.9) - (dz * dz) / (2 * 1.7 * 1.7));
  }
  return Math.min(1, sum);
}

// ---- surfaces ------------------------------------------------------------------------

/**
 * Platform concrete, 2 m a repeat: a warm grey trowelled slab, aggregate
 * specks, scuffs, coffee and soda stains, and gum: a station platform
 * carries thousands of flattened black and grey spots of it.
 */
function subwayConcrete() {
  return arenaPainted('subway-concrete', () => {
    const s = arenaSheet(512, '#8a8577', 0.5, 501);
    const { rr } = s;
    for (let index = 0; index < 2600; index += 1) {
      const v = rr(70, 150);
      s.blob(rr(0, 512), rr(0, 512), rr(0.6, 2.2), rr(0.6, 2.2), 0, `rgba(${v},${v * 0.97},${v * 0.9},${rr(0.15, 0.4)})`, rr(0.45, 0.56), 0.5);
    }
    // Grime trodden in: broad soft dark patches, and spilt drinks dried to blots.
    const soft = (x, y, r, rgb, alpha) => s.wrap(x, y, r, (X, Y) => {
      const gradient = s.colour.createRadialGradient(X, Y, 0, X, Y, r);
      gradient.addColorStop(0, `rgba(${rgb},${alpha})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      s.colour.fillStyle = gradient;
      s.colour.fillRect(X - r, Y - r, r * 2, r * 2);
    });
    for (let index = 0; index < 70; index += 1) soft(rr(0, 512), rr(0, 512), rr(25, 90), '38,34,28', rr(0.08, 0.2));
    for (let index = 0; index < 10; index += 1) soft(rr(0, 512), rr(0, 512), rr(8, 22), '70,48,25', rr(0.15, 0.3));
    // Gum, flattened: 1–3 cm discs, black, grey and the odd pale one.
    for (let index = 0; index < 150; index += 1) {
      const tone = rr(0, 1);
      const fill = tone < 0.6 ? `rgba(${rr(20, 40)},${rr(20, 38)},${rr(18, 34)},${rr(0.75, 0.95)})` : tone < 0.92 ? `rgba(${rr(70, 95)},${rr(70, 92)},${rr(66, 86)},0.85)` : 'rgba(150,140,128,0.8)';
      s.blob(rr(0, 512), rr(0, 512), rr(1.6, 4.2), rr(1.4, 3.6), rr(0, 3), fill, 0.53);
    }
    // Score lines of the slab's panels.
    s.rect(0, 0, 512, 2, 'rgba(30,28,24,0.55)', 0.3);
    s.rect(0, 0, 2, 512, 'rgba(30,28,24,0.55)', 0.3);
    return arenaFinish(s, { relief: 3, blur: 1 });
  });
}

/**
 * The tactile warning strip, 0.6 m a repeat: truncated domes on a 5 cm grid
 * in safety yellow, grime packed round their feet, the yellow scuffed off
 * the dome tops.
 */
function subwayTactile() {
  return arenaPainted('subway-tactile', () => {
    const s = arenaSheet(256, '#c8a019', 0.45, 503);
    const { rr } = s;
    for (let index = 0; index < 900; index += 1) s.blob(rr(0, 256), rr(0, 256), rr(0.8, 2.5), rr(0.8, 2.5), 0, `rgba(60,50,25,${rr(0.1, 0.3)})`, null);
    const pitch = 256 / 12;
    for (let row = 0; row < 12; row += 1) for (let col = 0; col < 12; col += 1) {
      const x = (col + 0.5) * pitch;
      const y = (row + 0.5) * pitch;
      s.blob(x, y, pitch * 0.42, pitch * 0.42, 0, `rgba(45,38,22,${rr(0.25, 0.45)})`, 0.62);
      s.blob(x, y, pitch * 0.33, pitch * 0.33, 0, `rgba(${rr(195, 225)},${rr(160, 185)},${rr(30, 60)},1)`, 0.8);
      if (rr(0, 1) < 0.5) s.blob(x - 1, y - 1, pitch * 0.14, pitch * 0.12, 0, `rgba(150,140,110,${rr(0.4, 0.8)})`, 0.85);
    }
    return arenaFinish(s, { relief: 6, blur: 1 });
  });
}

/**
 * The wall, 4 m by the wall's full 3.75 m height a repeat: cream glazed
 * 3-by-6-inch subway tile in running bond (greenish where it is older),
 * dark grout, and what the years did: soot thick under the ceiling, rust
 * bleeding down from the girders, tan and white seepage stains where water
 * comes through, a few tiles lost to grey mortar, and black grime along the
 * foot where mops and shoes reach.
 */
function subwayTiles() {
  return arenaPainted('subway-tiles', () => {
    const size = 1024;
    const s = arenaSheet(size, '#ddd6bd', 0.62, 505);
    const { rr } = s;
    const tileW = size / 4 * 0.152;
    const tileH = size / 3.75 * 0.076;
    for (let row = 0; row * tileH < size; row += 1) {
      const shift = row % 2 ? tileW / 2 : 0;
      for (let col = -1; col * tileW < size; col += 1) {
        const x = col * tileW + shift;
        const y = row * tileH;
        const tone = rr(-12, 8);
        const green = rr(0, 1) < 0.18 ? 10 : 0;
        s.rect(x + 1, y + 1, tileW - 2, tileH - 2, `rgba(${221 + tone - green},${214 + tone},${189 + tone - green * 0.5},1)`, 0.66);
      }
      // Grout lines.
      s.rect(0, row * tileH - 0.7, size, 1.4, 'rgba(70,64,52,0.75)', 0.45);
    }
    for (let row = 0; row * tileH < size; row += 1) {
      const shift = row % 2 ? tileW / 2 : 0;
      for (let col = 0; col * tileW < size + tileW; col += 1) s.rect(col * tileW + shift - 0.7, row * tileH, 1.4, tileH, 'rgba(70,64,52,0.75)', 0.45);
    }
    // Lost tiles patched in grey mortar.
    for (let index = 0; index < 7; index += 1) {
      const x = Math.floor(rr(0, size / tileW)) * tileW;
      const y = Math.floor(rr(size * 0.3, size * 0.95) / tileH) * tileH;
      s.rect(x, y, tileW * (1 + Math.floor(rr(0, 2))), tileH, 'rgba(118,114,104,1)', 0.5);
    }
    // Soot: thickest under the ceiling, smeared down.
    for (let index = 0; index < 90; index += 1) s.blob(rr(0, size), rr(-30, 120), rr(30, 120), rr(20, 90), 0, `rgba(30,26,20,${rr(0.06, 0.14)})`, null);
    // Seepage: tan and white stains running down from the joints, and the wet dark streaks.
    for (let index = 0; index < 40; index += 1) {
      const x = rr(0, size);
      const top = rr(-20, 200);
      const length = rr(200, 760);
      const colour = rr(0, 1) < 0.55 ? `rgba(${rr(120, 150)},${rr(95, 115)},${rr(55, 70)},${rr(0.1, 0.22)})` : `rgba(240,236,220,${rr(0.15, 0.3)})`;
      const points = [];
      for (let step = 0; step <= 8; step += 1) points.push([x + rr(-5, 5), top + (length * step) / 8]);
      s.line(points, rr(6, 26), colour, null);
      s.line(points.slice(0, 5), rr(3, 8), colour, null);
    }
    // Rust bleeding from the girder seats under the ceiling.
    for (let index = 0; index < 18; index += 1) {
      const x = rr(0, size);
      const length = rr(60, 360);
      s.line([[x, 0], [x + rr(-3, 3), length * 0.5], [x + rr(-5, 5), length]], rr(2, 9), `rgba(${rr(115, 150)},${rr(55, 75)},${rr(25, 40)},${rr(0.2, 0.45)})`, null);
    }
    // The foot: black grime where the mop water dries, kicked marks above it.
    for (let index = 0; index < 160; index += 1) s.blob(rr(0, size), rr(size - 70, size + 10), rr(10, 50), rr(6, 30), 0, `rgba(28,25,20,${rr(0.12, 0.3)})`, null);
    for (let index = 0; index < 40; index += 1) s.blob(rr(0, size), rr(size - 200, size - 40), rr(3, 14), rr(2, 6), rr(0, 3), `rgba(35,32,28,${rr(0.15, 0.4)})`, null);
    return arenaFinish(s, { relief: 3, blur: 1 });
  });
}

/**
 * Painted steel, 1 m a repeat: the columns and girders' dark green enamel,
 * many coats thick, chipped through to red-brown primer and rust at the
 * knocks, scratched, and dull with grime.
 */
function subwayPaint() {
  return arenaPainted('subway-paint', () => {
    const s = arenaSheet(512, '#2f4a3c', 0.6, 507);
    const { rr } = s;
    for (let index = 0; index < 120; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(20, 80), rr(20, 80), 0, `rgba(${rr(20, 60)},${rr(30, 60)},${rr(25, 45)},${rr(0.08, 0.2)})`, null);
    for (let index = 0; index < 70; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      const r = rr(2, 12);
      s.blob(x, y, r * 1.2, r, rr(0, 3), `rgba(${rr(95, 130)},${rr(50, 70)},${rr(30, 40)},0.95)`, 0.5);
      if (rr(0, 1) < 0.6) s.blob(x, y, r * 0.6, r * 0.5, rr(0, 3), `rgba(${rr(70, 100)},${rr(38, 50)},${rr(20, 30)},0.9)`, 0.45);
    }
    for (let index = 0; index < 40; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-50, 50), y + rr(-12, 12)]], rr(0.8, 2), `rgba(${rr(130, 170)},${rr(130, 160)},${rr(120, 140)},${rr(0.3, 0.6)})`, 0.55);
    }
    // Rust weeping down from the chips.
    for (let index = 0; index < 30; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-2, 2), y + rr(30, 120)]], rr(1.5, 5), `rgba(${rr(110, 140)},${rr(55, 70)},${rr(25, 35)},${rr(0.15, 0.35)})`, null);
    }
    return arenaFinish(s, { relief: 3, blur: 1 });
  });
}

/**
 * The car's stainless sides, 1 m a repeat: vertical fluting at 5 cm pitch
 * (the fluted panels of the older R-cars, and what the eye takes for an NYC
 * car), brushed grain, and dull grime tracks down from the window corners.
 */
function subwayFluting() {
  return arenaPainted('subway-fluting', () => {
    const s = arenaSheet(512, '#c4c6c6', 0.5, 509);
    const { rr } = s;
    const pitch = 512 / 20;
    for (let flute = 0; flute < 20; flute += 1) {
      const x = flute * pitch;
      s.rect(x, 0, pitch * 0.55, 512, null, 0.78);
      s.rect(x + pitch * 0.55, 0, pitch * 0.15, 512, 'rgba(0,0,0,0.06)', 0.5);
      s.rect(x + pitch * 0.7, 0, pitch * 0.3, 512, 'rgba(0,0,0,0.09)', 0.25);
    }
    for (let index = 0; index < 500; index += 1) {
      const y = rr(0, 512);
      s.line([[rr(0, 512), y], [rr(0, 512), y + rr(-1, 1)]], rr(0.5, 1.2), `rgba(${rr(0, 1) < 0.5 ? '255,255,255' : '0,0,0'},${rr(0.03, 0.07)})`, null);
    }
    for (let index = 0; index < 30; index += 1) {
      const x = rr(0, 512);
      s.line([[x, rr(0, 300)], [x + rr(-2, 2), 512]], rr(3, 14), `rgba(60,55,45,${rr(0.05, 0.14)})`, null);
    }
    return arenaFinish(s, { relief: 5, blur: 1 });
  });
}

/**
 * The track bed, 1.5 m a repeat: dark crushed stone and concrete, black
 * with brake dust and oil, wet in the low places, rubbish thrown down:
 * paper, cups, a rat's worth of crumbs.
 */
function subwayBallast() {
  return arenaPainted('subway-ballast', () => {
    const s = arenaSheet(512, '#2b2925', 0.4, 511);
    const { rr } = s;
    for (let index = 0; index < 1800; index += 1) {
      const v = rr(30, 85);
      s.blob(rr(0, 512), rr(0, 512), rr(3, 9), rr(2.5, 7), rr(0, 3), `rgba(${v},${v * 0.95},${v * 0.88},1)`, rr(0.45, 0.85));
    }
    for (let index = 0; index < 30; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(20, 70), rr(15, 50), rr(0, 3), `rgba(10,10,9,${rr(0.25, 0.5)})`, null);
    for (let index = 0; index < 14; index += 1) {
      const v = rr(160, 220);
      s.blob(rr(0, 512), rr(0, 512), rr(5, 14), rr(3, 8), rr(0, 3), `rgba(${v},${v * 0.96},${v * 0.86},0.85)`, 0.8);
    }
    return arenaFinish(s, { relief: 5, blur: 1 });
  });
}

/** The station name in the mosaic band: maroon and green tesserae round a cream panel. */
function subwayNameCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#5e1d20';
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = '#2b5038';
  for (let x = 0; x < 1024; x += 24) g.fillRect(x, 0, 12, 14), g.fillRect(x + 12, 114, 12, 14);
  g.fillStyle = '#ddd2b4';
  g.fillRect(140, 26, 744, 76);
  g.fillStyle = '#1d1a17';
  g.font = 'bold 64px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CANAL  ST', 512, 67);
  // Grime and seepage over the mosaic.
  const random = arenaRandom(77);
  for (let index = 0; index < 60; index += 1) {
    g.fillStyle = `rgba(40,32,22,${0.04 + random() * 0.1})`;
    g.beginPath();
    g.ellipse(random() * 1024, random() * 128, 10 + random() * 60, 6 + random() * 30, 0, 0, Math.PI * 2);
    g.fill();
  }
  for (let index = 0; index < 6; index += 1) {
    g.fillStyle = `rgba(130,100,60,${0.15 + random() * 0.2})`;
    g.fillRect(random() * 1024, 0, 4 + random() * 10, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/** The lead car's front: the lit route bullet (Q, yellow) and the destination sign in amber. */
function subwaySignCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#0c0d0e';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#fccc0a';
  g.beginPath();
  g.arc(64, 64, 46, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#111';
  g.font = 'bold 66px Helvetica, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Q', 64, 68);
  g.fillStyle = '#ffae2a';
  g.font = 'bold 44px Helvetica, Arial, sans-serif';
  g.textAlign = 'left';
  g.fillText('96 ST', 150, 50);
  g.font = '28px Helvetica, Arial, sans-serif';
  g.fillText('2 AV LCL', 150, 95);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// ---- the station ------------------------------------------------------------------------

/** Mark a merged mesh as never in the way (see-through leaves it be) and add it. */
function subwayAdd(group, mesh, { seeThrough = false } = {}) {
  if (!mesh) return null;
  if (!seeThrough) mesh.userData.seeThrough = false;
  group.add(mesh);
  return mesh;
}

/**
 * The whole station round the fighting floor. Returns the group, the leaks
 * (for the puddles) and the tube fixtures (for the puddles' glints).
 */
export function subwayStation(arena) {
  const layout = subwayLayout(arena);
  const { length, wallZ, edgeZ, trackZ, railTop, farZ, ceiling, fixtures } = layout;
  const group = new THREE.Group();
  const random = arenaRandom(4242);
  const rr = (a, b) => a + (b - a) * random();
  const x0 = -length / 2;
  const stripWidth = 0.61;
  const dark = arenaBuilder();

  // Platform: the slab's top (light pools and grime in its vertex colours), its face down to the track bed, the ceiling.
  const concrete = arenaBuilder();
  const top = new THREE.PlaneGeometry(length, edgeZ - stripWidth - wallZ, 92, 12);
  top.rotateX(-Math.PI / 2);
  const warm = [1.0, 0.96, 0.9];
  concrete.add(top, arenaAt(0, 0, (wallZ + edgeZ - stripWidth) / 2), {
    tile: 2,
    colour: (p) => {
      const pool = subwayPool(fixtures, p.x, p.z);
      const foot = 1 - 0.55 * (1 - arenaSmooth(0, 0.45, p.z - wallZ));
      const nearEdge = 1 - 0.3 * arenaSmooth(edgeZ - stripWidth - 0.5, edgeZ - stripWidth, p.z);
      const blot = 0.78 + 0.32 * subwayNoise(p.x, p.z, 1.3, 1) - 0.18 * arenaSmooth(0.6, 0.85, subwayNoise(p.x, p.z, 0.7, 2));
      const trodden = 1 - 0.12 * Math.exp(-((p.z + 0.1) ** 2) / 0.8);
      return subwayScale(warm, (0.5 + 0.6 * pool) * foot * nearEdge * blot * trodden);
    },
  });
  const face = new THREE.PlaneGeometry(length, -railTop + 0.25, 92, 4);
  concrete.add(face, arenaAt(0, (railTop - 0.25) / 2, edgeZ), { tile: 2, colour: (p) => subwayScale([0.42, 0.38, 0.32], 0.6 + 0.4 * subwayNoise(p.x, p.y, 0.8, 3)) });
  const roof = new THREE.PlaneGeometry(length, farZ - wallZ, 46, 6);
  roof.rotateX(Math.PI / 2);
  concrete.add(roof, arenaAt(0, ceiling, (wallZ + farZ) / 2), { tile: 2, colour: (p) => subwayScale([0.3, 0.27, 0.23], 0.6 + 0.5 * subwayNoise(p.x, p.z, 1.5, 4)) });
  subwayAdd(group, concrete.mesh(arenaMaterial(subwayConcrete(), { roughness: 0.92 }), { cast: false }));

  // The tactile strip at the edge: worn grey where people wait, black at the lip.
  const tactile = arenaBuilder();
  const strip = new THREE.PlaneGeometry(length, stripWidth, 92, 2);
  strip.rotateX(-Math.PI / 2);
  tactile.add(strip, arenaAt(0, 0.002, edgeZ - stripWidth / 2), {
    tile: stripWidth,
    colour: (p) => {
      const pool = subwayPool(fixtures, p.x, p.z);
      const worn = arenaSmooth(0.5, 0.8, subwayNoise(p.x, p.z, 0.9, 5));
      const lip = 1 - 0.45 * arenaSmooth(edgeZ - 0.1, edgeZ, p.z);
      return subwayScale(subwayMix([1, 0.97, 0.85], [0.62, 0.62, 0.66], worn * 0.7), (0.55 + 0.55 * pool) * lip * (0.85 + 0.2 * subwayNoise(p.x, p.z, 0.4, 6)));
    },
  });
  subwayAdd(group, tactile.mesh(arenaMaterial(subwayTactile(), { roughness: 0.7 }), { cast: false }));

  // The tiled wall, and the far wall over the track (mostly behind the train).
  const tiles = arenaBuilder();
  const wall = new THREE.PlaneGeometry(length, ceiling, 92, 6);
  tiles.add(wall, arenaAt(0, ceiling / 2, wallZ), {
    tile: [4, ceiling],
    colour: (p) => {
      const pool = subwayPool(fixtures, p.x, wallZ + 1.1);
      return subwayScale([1, 0.98, 0.93], (0.55 + 0.5 * pool) * (0.82 + 0.25 * subwayNoise(p.x, p.y, 2.2, 7)));
    },
  });
  tiles.add(new THREE.PlaneGeometry(length, ceiling - railTop, 46, 4), arenaAt(0, (ceiling + railTop) / 2, farZ, 0, Math.PI), { tile: [4, ceiling], colour: (p) => subwayScale([0.5, 0.47, 0.4], 0.5 + 0.4 * subwayNoise(p.x, p.y, 2, 8)) });
  subwayAdd(group, tiles.mesh(arenaMaterial(subwayTiles(), { roughness: 0.35 }), { cast: false }));

  // The mosaic name band, twice along the wall.
  const band = arenaBuilder();
  for (const x of [-7.6, 7.6]) band.add(new THREE.PlaneGeometry(4.2, 0.52), arenaAt(x, 2.25, wallZ + 0.008), { uv: 'keep', colour: [0.9, 0.86, 0.76] });
  const bandMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, map: subwayNameCanvas() });
  subwayAdd(group, band.mesh(bandMaterial, { cast: false }));

  // Painted steel: the columns (I-beams), the
  // longitudinal girder over them, the cross girders to the wall and over the
  // track, the trim line along the wall. Grime at their feet, rust on the
  // girders' bottom flanges where the water runs.
  const paint = arenaBuilder();
  const columnZ = edgeZ - 1.0;
  const columns = [];
  for (let x = x0 + SUBWAY_BAY / 2; x < length / 2; x += SUBWAY_BAY) columns.push(x);
  const columnHeight = ceiling - SUBWAY_GIRDER;
  const footGrime = (p) => {
    const foot = 0.5 + 0.5 * arenaSmooth(0, 0.5, p.y);
    const chip = 0.85 + 0.25 * subwayNoise(p.x * 3, p.y * 2, 0.6, 9);
    return subwayScale([1, 1, 1], foot * chip);
  };
  for (const x of columns) {
    paint.add(subwayBox(0.02, columnHeight, 0.27), arenaAt(x, columnHeight / 2, columnZ), { tile: 1, colour: footGrime });
    for (const side of [-1, 1]) paint.add(subwayBox(0.3, columnHeight, 0.025), arenaAt(x, columnHeight / 2, columnZ + side * 0.135), { tile: 1, colour: footGrime });
    // The white band at eye level (a station's columns are banded so people see them).
    dark.add(subwayBox(0.31, 0.12, 0.31), arenaAt(x, 1.65, columnZ), { colour: [0.8, 0.79, 0.74] });
  }
  // Girders: the longitudinal over the columns, cross girders from wall to far wall at each column.
  const girder = (geometryLength, matrix, along) => {
    const rust = (p) => {
      const low = arenaSmooth(ceiling - SUBWAY_GIRDER + 0.06, ceiling - SUBWAY_GIRDER, p.y);
      const n = subwayNoise(along ? p.x : p.z, p.y, 0.5, 10);
      return subwayMix([0.85, 0.85, 0.85], [1.9, 1.2, 0.8], low * arenaSmooth(0.4, 0.75, n));
    };
    paint.add(subwayBox(geometryLength, SUBWAY_GIRDER, 0.02), matrix.clone().multiply(arenaAt(0, -SUBWAY_GIRDER / 2, 0)), { tile: 1, colour: rust });
    for (const y of [-SUBWAY_GIRDER + 0.012, -0.012]) paint.add(subwayBox(geometryLength, 0.025, 0.26), matrix.clone().multiply(arenaAt(0, y, 0)), { tile: 1, colour: rust });
  };
  girder(length, arenaAt(0, ceiling, columnZ), true);
  for (const x of columns) girder(farZ - wallZ, arenaAt(x, ceiling, (wallZ + farZ) / 2, 0, Math.PI / 2), false);
  // The trim along the top of the tile.
  paint.add(subwayBox(length, 0.14, 0.03), arenaAt(0, 2.95, wallZ + 0.015), { tile: 1, colour: [0.9, 0.9, 0.9] });
  subwayAdd(group, paint.mesh(arenaMaterial(subwayPaint(), { roughness: 0.6, metalness: 0.15 }), { cast: true }));

  // The track bed: wet black ballast, the ties, the running rails, the third rail under its cover board.
  const bedY = railTop - 0.2;
  const ballast = arenaBuilder();
  const bed = new THREE.PlaneGeometry(length, farZ - edgeZ, 46, 6);
  bed.rotateX(-Math.PI / 2);
  ballast.add(bed, arenaAt(0, bedY, (edgeZ + farZ) / 2), { tile: 1.5, colour: (p) => subwayScale([1, 1, 1], 0.55 + 0.4 * subwayNoise(p.x, p.z, 1.2, 11)) });
  const ballastMaterial = arenaMaterial(subwayBallast(), { roughness: 0.55, metalness: 0.1 });
  ballastMaterial.userData.reflects = 0.35;
  subwayAdd(group, ballast.mesh(ballastMaterial, { cast: false }));

  for (let x = x0; x < length / 2; x += 0.62) {
    const tone = rr(0.6, 1);
    dark.add(subwayBox(0.23, 0.14, 2.5), arenaAt(x + rr(-0.03, 0.03), bedY - 0.03, trackZ, 0, rr(-0.03, 0.03)), { colour: [0.2 * tone, 0.16 * tone, 0.12 * tone] });
  }
  const metal = arenaBuilder();
  for (const side of [-1, 1]) {
    const z = trackZ + (side * SUBWAY_GAUGE) / 2;
    metal.add(subwayBox(length, 0.03, 0.07), arenaAt(0, railTop - 0.015, z), { colour: [0.95, 0.93, 0.9] });
    metal.add(subwayBox(length, 0.1, 0.02), arenaAt(0, railTop - 0.08, z), { colour: [0.42, 0.26, 0.16] });
    metal.add(subwayBox(length, 0.03, 0.14), arenaAt(0, railTop - 0.145, z), { colour: [0.36, 0.22, 0.14] });
  }
  // The third rail, 0.7 m outside the far running rail, its cover board above on brackets.
  const thirdZ = trackZ + SUBWAY_GAUGE / 2 + 0.7;
  metal.add(subwayBox(length, 0.15, 0.08), arenaAt(0, railTop + 0.06, thirdZ), { colour: [0.5, 0.36, 0.24] });
  dark.add(subwayBox(length, 0.04, 0.32), arenaAt(0, railTop + 0.25, thirdZ - 0.02), { colour: [0.42, 0.34, 0.2] });
  for (let x = x0; x < length / 2; x += 3.1) dark.add(subwayBox(0.08, 0.3, 0.06), arenaAt(x, railTop + 0.1, thirdZ + 0.2), { colour: [0.18, 0.17, 0.16] });

  // The fixtures: a steel housing on two drop rods, two 4 ft tubes behind a yellowed diffuser, a wire cage round it.
  const tubes = arenaBuilder();
  for (const fixture of fixtures) {
    const { x, y, z } = fixture;
    dark.add(subwayBox(1.3, 0.07, 0.3), arenaAt(x, y + 0.08, z), { colour: [0.3, 0.29, 0.26] });
    for (const end of [-0.5, 0.5]) dark.add(subwayBox(0.015, ceiling - SUBWAY_GIRDER - y + 0.24, 0.015), arenaAt(x + end, (ceiling + y) / 2, z), { colour: [0.2, 0.2, 0.2] });
    tubes.add(subwayBox(1.22, 0.05, 0.22), arenaAt(x, y + 0.02, z), { colour: [1.0, 0.92, 0.66] });
    // The cage: longitudinal wires and hoops.
    for (const across of [-0.15, 0, 0.15]) metal.add(subwayBox(1.3, 0.008, 0.008), arenaAt(x, y - 0.05 + Math.abs(across) * 0.2, z + across), { colour: [0.3, 0.3, 0.3] });
    for (let k = -0.6; k <= 0.61; k += 0.2) metal.add(subwayBox(0.008, 0.008, 0.32), arenaAt(x + k, y - 0.04, z), { colour: [0.3, 0.3, 0.3] });
  }
  const tubeMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
  const tubeMesh = subwayAdd(group, tubes.mesh(tubeMaterial, { cast: false }));
  tubeMesh.receiveShadow = false;

  // A bench against the wall and a trash can by a column (they may stand in the way: see-through may fade them).
  const furniture = arenaBuilder();
  furniture.add(subwayBox(2.2, 0.06, 0.42), arenaAt(-2.8, 0.46, wallZ + 0.3), { colour: [0.36, 0.25, 0.15] });
  furniture.add(subwayBox(2.2, 0.4, 0.04), arenaAt(-2.8, 0.7, wallZ + 0.1), { colour: [0.36, 0.25, 0.15] });
  for (const leg of [-0.95, 0.95]) furniture.add(subwayBox(0.06, 0.46, 0.38), arenaAt(-2.8 + leg, 0.23, wallZ + 0.3), { colour: [0.15, 0.15, 0.16] });
  furniture.add(new THREE.CylinderGeometry(0.26, 0.24, 0.85, 14), arenaAt(4.4, 0.43, wallZ + 0.4), { colour: [0.2, 0.32, 0.24] });
  furniture.add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 14), arenaAt(4.4, 0.86, wallZ + 0.4), { colour: [0.08, 0.08, 0.08] });
  const furnitureMesh = subwayAdd(group, furniture.mesh(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0.2 }), { cast: true }), { seeThrough: true });
  furnitureMesh.userData.subwayFurniture = true;

  // Wet streaks: where a leak runs down a column flange and down the wall.
  group.add(subwayWetStreaks(layout, columns, columnZ));
  // Falling drops and the rings they make.
  group.add(subwayDrips(layout));

  // Not shadow casters: the fixtures would print their boxes on the platform under a key that stands in for all the tubes at once.
  subwayAdd(group, dark.mesh(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8, metalness: 0.1 }), { cast: false }));
  const metalMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.35, metalness: 0.75 });
  metalMaterial.userData.reflects = 0.8;
  subwayAdd(group, metal.mesh(metalMaterial, { cast: false }));

  return { group, layout };
}

/** Dark glossy films where water runs: down the face of a column and the tiles, a wet stain spreading at the foot. */
function subwayWetStreaks(layout, columns, columnZ) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const random = arenaRandom(91);
  for (let index = 0; index < 7; index += 1) {
    const x = 18 + random() * 28;
    const width = 3 + random() * 9;
    const gradient = g.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, 'rgba(255,255,255,0.0)');
    gradient.addColorStop(0.08, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(0.85, 'rgba(255,255,255,0.65)');
    gradient.addColorStop(1, 'rgba(255,255,255,0.0)');
    g.fillStyle = gradient;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= 256; y += 32) g.lineTo(x + Math.sin(y * 0.05 + index) * 2 - width / 2, y);
    for (let y = 256; y >= 0; y -= 32) g.lineTo(x + Math.sin(y * 0.05 + index) * 2 + width / 2, y);
    g.fill();
  }
  const alpha = new THREE.CanvasTexture(canvas);
  const builder = arenaBuilder();
  const column = columns.reduce((best, x) => (Math.abs(x - 2.3) < Math.abs(best - 2.3) ? x : best), columns[0]);
  const height = layout.ceiling - SUBWAY_GIRDER;
  // On the column's flange facing the wall, and on the tile under a ceiling joint.
  builder.add(new THREE.PlaneGeometry(0.26, height), arenaAt(column, height / 2, columnZ - 0.15, 0, Math.PI), { uv: 'keep', colour: [1, 1, 1] });
  builder.add(new THREE.PlaneGeometry(0.26, height), arenaAt(column, height / 2, columnZ + 0.15), { uv: 'keep', colour: [1, 1, 1] });
  for (const [x, width] of [[-4.1, 0.7], [9.3, 0.5], [-12.6, 0.9]]) builder.add(new THREE.PlaneGeometry(width, layout.ceiling), arenaAt(x, layout.ceiling / 2, layout.wallZ + 0.006), { uv: 'keep', colour: [1, 1, 1] });
  const material = new THREE.MeshStandardMaterial({ color: 0x15130f, vertexColors: true, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.55, alphaMap: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.userData.reflects = 1;
  const mesh = builder.mesh(material, { cast: false });
  mesh.userData.seeThrough = false;
  return mesh;
}

/**
 * The leaks' drops, falling and ringing on the water, as two instanced
 * meshes moved each frame (a dozen matrices: nothing). A drop is drawn as a
 * streak as long as it falls in a frame's exposure.
 */
function subwayDrips(layout) {
  const group = new THREE.Group();
  const { leaks, ceiling } = layout;
  const dropGeometry = new THREE.SphereGeometry(1, 6, 4);
  const drops = new THREE.InstancedMesh(dropGeometry, new THREE.MeshBasicMaterial({ color: 0xd8dccc, transparent: true, opacity: 0.6, depthWrite: false }), leaks.length);
  const ringGeometry = new THREE.RingGeometry(0.82, 1, 20);
  ringGeometry.rotateX(-Math.PI / 2);
  const rings = new THREE.InstancedMesh(ringGeometry, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), leaks.length);
  const matrix = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const colour = new THREE.Color();
  const update = () => {
    const t = performance.now() / 1000;
    leaks.forEach((leak, index) => {
      const fall = ceiling - leak.floor;
      const drip = subwayDrip(leak, t, fall);
      if (drip.dropY === null) drops.setMatrixAt(index, hidden);
      else {
        const stretch = Math.max(0.006, Math.min(0.09, drip.speed / 60));
        drops.setMatrixAt(index, matrix.makeScale(0.006, stretch, 0.006).setPosition(leak.x, leak.floor + drip.dropY + stretch, leak.z));
      }
      if (drip.ringAge === null) rings.setMatrixAt(index, hidden);
      else {
        const age = drip.ringAge / SUBWAY_RING_LIFE;
        const r = 0.015 + age * 0.13;
        rings.setMatrixAt(index, matrix.makeScale(r, 1, r).setPosition(leak.x, leak.floor + 0.008, leak.z));
        rings.setColorAt(index, colour.setRGB(1, 0.9, 0.7).multiplyScalar(0.28 * (1 - age) * (1 - age)));
      }
    });
    drops.instanceMatrix.needsUpdate = true;
    rings.instanceMatrix.needsUpdate = true;
    if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
  };
  for (let index = 0; index < leaks.length; index += 1) rings.setColorAt(index, colour.setRGB(0, 0, 0));
  update();
  for (const mesh of [drops, rings]) {
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    mesh.userData.seeThrough = false;
    group.add(mesh);
  }
  drops.onBeforeRender = update;
  return group;
}

/** A flat dark film for each puddle, for the cartoon look (the realistic look draws real water: src/ground/living.js and hides this). */
export function subwayPuddleFilm(layout) {
  const builder = arenaBuilder();
  for (const leak of layout.leaks) builder.add(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), arenaAt(leak.x, leak.floor + 0.004, leak.z, 0, leak.turn, 0, leak.rx, 1, leak.rz), { colour: [1, 1, 1] });
  const material = new THREE.MeshStandardMaterial({ color: 0x23211c, vertexColors: true, roughness: 0.1, metalness: 0.5, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  material.userData.reflects = 1;
  const mesh = builder.mesh(material, { cast: false });
  mesh.userData.scenery = 'ground';
  mesh.userData.seeThrough = false;
  return mesh;
}

// ---- the train --------------------------------------------------------------------------

/**
 * Two R160 cars standing at the platform, the lead car's cab end toward +x
 * at `frontX`. Stainless steel on the look's reflection map, the doors and
 * windows on the platform side, lit inside; under the floor the trucks and
 * the equipment boxes, black with brake dust.
 */
export function subwayTrain(layout, { frontX = 12.4 } = {}) {
  const { trackZ, railTop } = layout;
  const car = SUBWAY_CAR;
  const half = car.width / 2;
  const sill = railTop + 0.95;
  const eave = railTop + car.height - 0.25;
  const steel = arenaBuilder();
  const glass = arenaBuilder();
  const dark = arenaBuilder();
  const side = trackZ - half;
  const grime = (cx) => (p) => {
    const low = 1 - 0.4 * arenaSmooth(sill + 0.7, sill, p.y);
    const roof = p.y > eave - 0.02 ? 0.55 : 1;
    const n = 0.88 + 0.16 * subwayNoise(p.x + cx, p.y, 1.1, 12);
    return subwayScale([0.98, 0.97, 0.94], low * roof * n);
  };
  const centres = [frontX - car.length / 2, frontX - car.length * 1.5 - car.couple];
  centres.forEach((cx, number) => {
    const lead = number === 0;
    const colour = grime(cx);
    steel.add(subwayBox(car.length, eave - sill, car.width), arenaAt(cx, (sill + eave) / 2, trackZ), { tile: 1, colour });
    steel.add(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, 0, Math.PI), arenaAt(cx, eave, trackZ, 0, 0, Math.PI / 2, 0.25, car.length, half), { tile: 1, colour: () => [0.5, 0.48, 0.45] });
    // The ends: the cab's rounded nose on the lead car, a flat end with its door and diaphragm at the coupled ends.
    for (const end of [-1, 1]) {
      const x = cx + (end * car.length) / 2;
      if (lead && end === 1) {
        steel.add(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true, 0, Math.PI), arenaAt(x, (sill + eave) / 2, trackZ, 0, 0, 0, 0.22, eave - sill, half), { tile: 1, colour });
        steel.add(new THREE.SphereGeometry(1, 18, 5, 0, Math.PI, 0, Math.PI / 2), arenaAt(x, eave, trackZ, 0, Math.PI / 2, 0, half, 0.25, 0.22), { tile: 1, colour: () => [0.5, 0.48, 0.45] });
        // Storm door window and the cab windows, the sign over them, headlights and markers.
        for (const [z, w] of [[0, 0.55], [-0.95, 0.6], [0.95, 0.6]]) dark.add(subwayBox(0.06, 0.9, w + 0.08), arenaAt(x + 0.2 - Math.abs(z) * 0.05, sill + 1.55, trackZ + z, 0, (z / half) * 0.45), { colour: [0.05, 0.05, 0.05] });
        for (const [z, w] of [[0, 0.55], [-0.95, 0.6], [0.95, 0.6]]) glass.add(subwayBox(0.04, 0.82, w), arenaAt(x + 0.22 - Math.abs(z) * 0.05, sill + 1.55, trackZ + z, 0, (z / half) * 0.45), { colour: [0.45, 0.42, 0.36] });
        for (const z of [-0.85, 0.85]) glass.add(subwayBox(0.04, 0.09, 0.2), arenaAt(x + 0.18, sill + 0.55, trackZ + z, 0, (z / half) * 0.45), { colour: [1.0, 0.98, 0.9] });
        for (const z of [-1.1, 1.1]) glass.add(subwayBox(0.04, 0.07, 0.1), arenaAt(x + 0.15, sill + 2.45, trackZ + z, 0, (z / half) * 0.45), { colour: [1.0, 0.7, 0.25] });
      } else {
        dark.add(subwayBox(0.08, eave - sill - 0.2, car.width - 0.4), arenaAt(x + end * 0.01, (sill + eave) / 2, trackZ), { colour: [0.12, 0.12, 0.12] });
        dark.add(subwayBox(0.4, 2.1, 1.2), arenaAt(x + end * 0.2, sill + 1.25, trackZ), { colour: [0.06, 0.06, 0.06] });
      }
    }
    // Platform side: the door pairs (leaves, black gaskets, their windows) and the fixed windows between them.
    const pane = (x, y, w, h, outside = side - 0.006) => {
      dark.add(subwayBox(w + 0.07, h + 0.07, 0.012), arenaAt(x, y, outside), { colour: [0.04, 0.04, 0.04] });
      // The lit car seen through the glass: the ceiling's light strip bright at the top, seat backs and riders' shoulders dark below.
      glass.add(new THREE.BoxGeometry(w, h, 0.012, 1, 8, 1), arenaAt(x, y, outside - 0.004), { colour: (p) => subwayScale([1.0, 0.95, 0.82], p.y < y - h * 0.15 ? 0.22 : 0.4 + 0.45 * arenaSmooth(y - h * 0.15, y + h * 0.5, p.y)) });
    };
    for (const at of car.doorsAt) {
      const dx = cx + at;
      for (const leaf of [-1, 1]) {
        const lx = dx + (leaf * car.doorWidth) / 4;
        steel.add(subwayBox(car.doorWidth / 2 - 0.01, car.doorHeight, 0.02), arenaAt(lx, car.doorHeight / 2, side - 0.01), { tile: 1, colour: (p) => subwayScale(colour(p), 0.92) });
        pane(lx, 1.38, 0.4, 0.72, side - 0.026);
      }
      dark.add(subwayBox(0.03, car.doorHeight, 0.03), arenaAt(dx, car.doorHeight / 2, side - 0.02), { colour: [0.03, 0.03, 0.03] });
      dark.add(subwayBox(car.doorWidth + 0.08, 0.04, 0.03), arenaAt(dx, car.doorHeight + 0.02, side - 0.012), { colour: [0.05, 0.05, 0.05] });
    }
    for (let k = 0; k < car.doorsAt.length - 1; k += 1) {
      const mid = cx + (car.doorsAt[k] + car.doorsAt[k + 1]) / 2;
      for (const offset of [-0.85, 0.85]) pane(mid + offset, 1.4, 1.25, 0.8);
    }
    for (const end of [-1, 1]) pane(cx + end * (car.length / 2 - 0.55), 1.4, 0.55, 0.8);
    // A grey car-number plate and the blue line under the windows? R160s have neither on the side: plain steel. A thin rub rail along the sill.
    steel.add(subwayBox(car.length, 0.06, 0.04), arenaAt(cx, sill + 0.35, side - 0.01), { tile: 1, colour: (p) => subwayScale(colour(p), 0.8) });
    // Under the floor: the equipment boxes between the trucks, the trucks over each pair of axles.
    for (let x = -car.length / 2 + 4.2; x < car.length / 2 - 4.2; x += 1.6) {
      const w = 0.9 + subwayHash(x, number) * 0.6;
      dark.add(subwayBox(w, 0.5, car.width - 0.5), arenaAt(cx + x, sill - 0.25, trackZ), { colour: [0.09, 0.085, 0.08] });
    }
    for (const truck of [-1, 1]) {
      const tx = cx + truck * (car.length / 2 - 2.6);
      dark.add(subwayBox(2.6, 0.32, 2.1), arenaAt(tx, railTop + 0.62, trackZ), { colour: [0.1, 0.09, 0.08] });
      for (const axle of [-1.05, 1.05]) for (const rail of [-1, 1]) dark.add(new THREE.CylinderGeometry(0.43, 0.43, 0.12, 14), arenaAt(tx + axle, railTop + 0.43, trackZ + (rail * SUBWAY_GAUGE) / 2, Math.PI / 2), { colour: [0.16, 0.13, 0.11] });
    }
  });
  const group = new THREE.Group();
  const steelMaterial = arenaMaterial(subwayFluting(), { roughness: 0.32, metalness: 0.4 });
  steelMaterial.userData.reflects = 1.3;
  for (const [builder, material, cast] of [
    [steel, steelMaterial, false],
    [glass, new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true }), false],
    [dark, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0.2 }), false],
  ]) {
    const mesh = builder.mesh(material, { cast });
    mesh.userData.seeThrough = false;
    group.add(mesh);
  }
  // The route sign over the cab windows.
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: subwaySignCanvas() }));
  sign.position.set(frontX + 0.232, sill + 2.25, trackZ);
  sign.rotation.y = Math.PI / 2;
  sign.userData.seeThrough = false;
  group.add(sign);
  return group;
}
