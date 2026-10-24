// The castle kit's furniture and litter: barrels, tables, a well, siege engines, lying weapons, bones in chains, banners,
// braziers and torches. Each is built from boxes, cylinders and lumps appended to the section's batch, so a room of them is
// a few draw calls. What moves or glows is not built here but noted for the kit (`dyn`): flames, lights, ravens, drips,
// puddles, light shafts. A prop is the stage's `{ kind: 'prop', what, at: [x, y, z], yaw, ...}` decor.

import { kgBox, kgCylinder, kgLump, kgTube } from './kitgeo.js';
import { ktRandom } from './kittex.js';
import { kcProp } from './kitchapel.js';

/** Where a prop's local (lx, lz) is in the world, for a prop at [x, z] turned `yaw`. */
function kpAt(at, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, lz) => [at[0] + lx * c + lz * s, at[2] - lx * s + lz * c];
}

const KP_FLAME = { brazier: 0.5, torch: 0.28, hearth: 0.6 };

/**
 * Build a prop into `ctx.batch`. `ctx.dyn` collects what moves: { flames: [{ at, size }], lights: [{ at, color, power }], ravens: [...],
 * drips: [...], puddles: [...], shafts: [...] }.
 */
export function kpBuild(prop, ctx) {
  const { batch, dyn } = ctx;
  const at = prop.at;
  const yaw = prop.yaw ?? 0;
  const here = kpAt(at, yaw);
  const y = at[1];
  const scale = prop.scale ?? 1;
  const random = ktRandom(Math.floor(Math.abs(at[0] * 131 + at[2] * 71 + y * 17)) + 3);
  const box = (material, lx, ly, lz, w, h, d, turn = 0, options = {}) => {
    const [x, z] = here(lx, lz);
    kgBox(batch, material, x, y + ly, z, w, h, d, yaw + turn, { faces: ['top', 'ends', 'sides'], ...options });
  };
  switch (prop.what) {
    case 'barrel': {
      const [x, z] = here(0, 0);
      if (prop.tipped) {
        kgCylinder(batch, 'wood', x, y + 0.46, z, 0.42, 0.42, 0.95, { tiltZ: Math.PI / 2, tiltX: 0.2, sides: 10, aoFrom: y });
      } else {
        kgCylinder(batch, 'wood', x, y, z, 0.43, 0.38, 0.95, { sides: 10, aoFrom: y });
        kgCylinder(batch, 'iron', x, y + 0.18, z, 0.435, 0.435, 0.05, { sides: 10 });
        kgCylinder(batch, 'iron', x, y + 0.72, z, 0.435, 0.435, 0.05, { sides: 10 });
      }
      break;
    }
    case 'powderkeg': {
      const [x, z] = here(0, 0);
      kgCylinder(batch, 'wood', x, y, z, 0.3, 0.27, 0.6, { sides: 9, tint: [0.9, 0.7, 0.6], aoFrom: y });
      kgCylinder(batch, 'iron', x, y + 0.14, z, 0.305, 0.305, 0.04, { sides: 9 });
      break;
    }
    case 'crate':
      box('wood', 0, 0.35, 0, 0.8, 0.7, 0.8, 0, { aoFrom: y });
      box('iron', 0, 0.35, 0, 0.82, 0.05, 0.82);
      break;
    case 'table':
      box('wood', 0, 0.78, 0, 1.7, 0.08, 0.85);
      for (const [lx, lz] of [[-0.75, -0.35], [0.75, -0.35], [-0.75, 0.35], [0.75, 0.35]]) box('wood', lx, 0.39, lz, 0.09, 0.78, 0.09);
      break;
    case 'bench':
      box('wood', 0, 0.46, 0, 1.5, 0.07, 0.34);
      box('wood', -0.62, 0.23, 0, 0.08, 0.46, 0.3);
      box('wood', 0.62, 0.23, 0, 0.08, 0.46, 0.3);
      break;
    case 'stool':
      box('wood', 0, 0.44, 0, 0.36, 0.06, 0.36);
      for (const [lx, lz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) box('wood', lx, 0.22, lz, 0.05, 0.44, 0.05);
      break;
    case 'bed':
      box('wood', 0, 0.28, 0, 2.0, 0.12, 0.95);
      box('straw', 0, 0.4, 0, 1.9, 0.14, 0.85);
      box('cloth', 0.1, 0.5, 0, 1.4, 0.06, 0.8, 0.05);
      box('wood', -1.0, 0.5, 0, 0.08, 0.5, 0.95);
      break;
    case 'hearth': {
      box('rubble', 0, 0.6, 0, 2.4, 1.2, 0.7, 0, { aoFrom: y });
      box('black', 0, 0.55, 0.06, 1.5, 0.9, 0.5);
      box('rubble', 0, 1.9, -0.05, 2.0, 1.4, 0.5);
      const [x, z] = here(0, 0.12);
      dyn.flames.push({ at: [x, y + 0.25, z], size: KP_FLAME.hearth });
      dyn.lights.push({ at: [x, y + 1.0, z], color: 0xff9a50, power: 1.0, range: 11 });
      break;
    }
    case 'well': {
      const [x, z] = here(0, 0);
      kgCylinder(batch, 'rubble', x, y, z, 1.25, 1.35, 1.0, { sides: 14, aoFrom: y });
      kgCylinder(batch, 'black', x, y + 0.98, z, 0.92, 0.92, 0.04, { sides: 14 });
      for (const side of [-1, 1]) {
        const [px, pz] = here(side * 1.0, 0);
        kgBox(batch, 'wood', px, y + 1.7, pz, 0.14, 1.5, 0.14, yaw);
      }
      kgBox(batch, 'wood', x, y + 2.45, z, 2.3, 0.14, 0.16, yaw);
      kgCylinder(batch, 'wood', x, y + 2.3, z, 0.07, 0.07, 1.0, { sides: 6, tiltZ: Math.PI / 2 });
      kgTube(batch, 'cloth', [[x, y + 2.25, z], [x + 0.05, y + 1.7, z], [x, y + 1.2, z]], 0.02, { segments: 4, sides: 4 });
      kgCylinder(batch, 'wood', x, y + 1.0, z, 0.2, 0.17, 0.26, { sides: 8 });
      break;
    }
    case 'cart': {
      box('wood', 0, 0.7, 0, 2.4, 0.1, 1.3, prop.broken ? 0.1 : 0);
      box('wood', 0, 1.0, 0.62, 2.4, 0.5, 0.06);
      box('wood', 0, 1.0, -0.62, 2.4, 0.5, 0.06);
      for (const side of [-1, 1]) {
        const [px, pz] = here(0, side * 0.72);
        kgCylinder(batch, 'wood', px, y + 0.5 - (prop.broken && side > 0 ? 0.3 : 0), pz, 0.52, 0.52, 0.1, { sides: 12, tiltX: Math.PI / 2 + yaw * 0 });
      }
      if (prop.broken) box('wood', 1.55, 0.25, 0.4, 1.2, 0.08, 0.1, 0.5);
      break;
    }
    case 'trebuchet': {
      const k = scale;
      box('wood', 0, 0.2 * k, 1.1 * k, 7 * k, 0.4 * k, 0.4 * k);
      box('wood', 0, 0.2 * k, -1.1 * k, 7 * k, 0.4 * k, 0.4 * k);
      for (const lx of [-1.8, 1.2]) {
        box('wood', lx * k, 2.2 * k, 1.0 * k, 0.35 * k, 4.6 * k, 0.35 * k, 0, { aoFrom: y });
        box('wood', lx * k, 2.2 * k, -1.0 * k, 0.35 * k, 4.6 * k, 0.35 * k);
        box('wood', (lx + 0.8) * k, 1.9 * k, 1.05 * k, 0.3 * k, 4.8 * k, 0.3 * k, 0.45);
      }
      box('wood', -0.3 * k, 4.4 * k, 0, 0.3 * k, 0.3 * k, 2.4 * k);
      // The arm, thrown up and broken at the sling end, the counterweight box hanging off the short end.
      const [ax, az] = here(-0.3 * k, 0);
      kgBox(batch, 'wood', ax + Math.cos(yaw) * 2.2 * k, y + 5.4 * k, az - Math.sin(yaw) * 2.2 * k, 7.5 * k, 0.28 * k, 0.28 * k, yaw, { faces: ['top', 'ends', 'sides'], tint: 0.9 });
      box('rubble', -3.2 * k, 3.4 * k, 0, 1.3 * k, 1.4 * k, 1.1 * k, 0.2);
      box('wood', 3.2 * k, 0.3 * k, 0.3 * k, 1.6 * k, 0.2 * k, 0.3 * k, 0.7);
      break;
    }
    case 'ram':
    case 'siegeram': {
      box('wood', 0, 1.2, 0.95, 0.2, 2.0, 0.2);
      box('wood', 0, 1.2, -0.95, 0.2, 2.0, 0.2);
      box('wood', 0, 2.2, 0, 5.2, 0.2, 2.2, 0, { faces: ['top', 'ends', 'sides'] });
      const [x, z] = here(0, 0);
      kgCylinder(batch, 'wood', x, y + 1.35, z, 0.33, 0.33, 5.0, { sides: 8, tiltZ: Math.PI / 2 });
      const [hx, hz] = here(2.5, 0);
      kgCylinder(batch, 'iron', hx, y + 1.35, hz, 0.36, 0.28, 0.5, { sides: 8, tiltZ: -Math.PI / 2 });
      for (const lx of [-2.2, 2.2]) for (const lz of [-1.1, 1.1]) {
        const [wx, wz] = here(lx, lz);
        kgCylinder(batch, 'wood', wx, y + 0.45, wz, 0.45, 0.45, 0.12, { sides: 10, tiltX: Math.PI / 2 });
      }
      break;
    }
    case 'weapon': {
      const tilt = 0.05;
      const [x, z] = here(0, 0);
      const lay = (material, lx, lz, w, h, d, turn = 0, up = 0.04) => {
        const [px, pz] = here(lx, lz);
        kgBox(batch, material, px, y + up, pz, w, h, d, yaw + turn);
      };
      if (prop.what2 === 'spear') {
        lay('wood', 0, 0, 2.6, 0.05, 0.05);
        lay('iron', 1.4, 0, 0.3, 0.03, 0.08);
      } else if (prop.what2 === 'halberd') {
        lay('wood', 0, 0, 2.2, 0.05, 0.05);
        lay('iron', 1.1, 0.1, 0.4, 0.03, 0.3);
      } else if (prop.what2 === 'shield') {
        kgCylinder(batch, 'wood', x, y + 0.02, z, 0.42, 0.42, 0.05, { sides: 10, tiltX: tilt });
        kgCylinder(batch, 'iron', x, y + 0.07, z, 0.1, 0.1, 0.04, { sides: 8 });
      } else {
        lay('iron', 0, 0, 0.95, 0.025, 0.07);
        lay('iron', -0.5, 0, 0.06, 0.04, 0.3);
        lay('wood', -0.62, 0, 0.18, 0.05, 0.05);
      }
      break;
    }
    case 'bones': {
      for (let k = 0; k < 7; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.6, (random() - 0.5) * 1.2);
        kgBox(batch, 'bone', px, y + 0.03, pz, 0.3 + random() * 0.4, 0.05, 0.06, random() * 6);
      }
      const [sx, sz] = here(0.2, 0.1);
      kgLump(batch, 'bone', sx, y + 0.1, sz, 0.11, 0.1, 0.12, { seed: 4, detail: 0 });
      break;
    }
    case 'skeleton': {
      // Sat against the wall in chains: hips, spine, ribs, skull, arms up to the rings, legs out along the floor.
      const out = prop.yaw === Math.PI ? 1 : 0;
      void out;
      box('bone', 0, 0.12, 0, 0.34, 0.1, 0.22);
      box('bone', -0.08, 0.5, 0, 0.1, 0.8, 0.1, 0, {});
      for (let k = 0; k < 4; k += 1) box('bone', -0.1, 0.5 + k * 0.1, 0, 0.14, 0.03, 0.4 - k * 0.05);
      const [hx, hz] = here(-0.12, 0);
      kgLump(batch, 'bone', hx, y + 1.0, hz, 0.1, 0.12, 0.1, { seed: 9, detail: 0 });
      box('bone', -0.15, 1.0, 0.24, 0.05, 0.8, 0.05, 0, {});
      box('bone', -0.15, 1.0, -0.24, 0.05, 0.8, 0.05, 0, {});
      box('bone', 0.5, 0.06, 0.1, 0.9, 0.06, 0.07, 0.2);
      box('bone', 0.5, 0.06, -0.1, 0.9, 0.06, 0.07, -0.25);
      box('iron', -0.2, 1.5, 0.24, 0.04, 0.04, 0.04);
      kgTube(batch, 'iron', [...Array(5).keys()].map((k) => { const [px, pz] = here(-0.22, 0.24 + k * 0.02); return [px, y + 1.4 + k * 0.12, pz]; }), 0.012, { segments: 8, sides: 4 });
      break;
    }
    case 'chains': {
      for (const lx of [-0.6, 0.6]) {
        const points = [0, 0.25, 0.5, 0.75, 1].map((t) => { const [px, pz] = here(lx + (random() - 0.5) * 0.05, 0.15 * Math.sin(t * Math.PI)); return [px, y - t * 1.4, pz]; });
        kgTube(batch, 'iron', points, 0.018, { segments: 8, sides: 4 });
      }
      break;
    }
    case 'straw':
      for (let k = 0; k < 3; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.2, (random() - 0.5) * 1.0);
        kgLump(batch, 'straw', px, y + 0.06, pz, 0.6, 0.1, 0.5, { seed: k + 2, detail: 1 });
      }
      break;
    case 'keys': {
      box('iron', 0, 0, 0, 0.04, 0.04, 0.5);
      for (let k = 0; k < 5; k += 1) box('iron', 0, -0.12, -0.2 + k * 0.1, 0.03, 0.22, 0.03);
      break;
    }
    case 'grating': {
      const [w, d] = prop.size ?? [1.6, 1.6];
      const [x, z] = here(0, 0);
      kgBox(batch, 'black', x, y - 0.04, z, w, 0.06, d, yaw, { faces: ['bottom', 'sides', 'ends'] });
      dyn.shafts.push({ at: [x, y, z], size: [w, d], yaw });
      break;
    }
    case 'drip':
      dyn.drips.push({ at: [...here(0, 0).slice(0, 1), y, here(0, 0)[1]], fall: 4.1 });
      break;
    case 'puddle': {
      const [x, z] = here(0, 0);
      dyn.puddles.push({ at: [x, y + 0.02, z], radius: prop.radius ?? 1.2, seed: Math.floor(random() * 99) });
      break;
    }
    case 'banner': {
      const long = prop.torn ? 1.7 : 2.6;
      box('wood', 0, 0.1 + long, 0, 1.2, 0.08, 0.08);
      box('cloth', 0, 0.1 + long / 2, 0.04, 1.0, long, 0.02, 0, { tint: [0.8, 0.55, 0.5] });
      if (prop.torn) box('cloth', 0.3, 0.05, 0.04, 0.4, 0.5, 0.02, 0.3);
      break;
    }
    case 'raven':
      dyn.ravens.push({ at: [at[0], at[1], at[2]], yaw, size: prop.size ?? 1, seed: Math.floor(random() * 1000) });
      break;
    case 'gunrest': {
      box('wood', 0, 0.55, 0, 0.1, 1.1, 0.1);
      box('wood', 0.06, 1.05, 0.12, 0.08, 0.3, 0.06, 0.4);
      box('iron', 0.04, 0.7, 0, 0.14, 0.06, 0.14);
      break;
    }
    case 'weaponrack': {
      box('wood', 0, 1.0, 0, 2.2, 0.08, 0.1);
      box('wood', 0, 0.2, 0, 2.2, 0.08, 0.1);
      box('wood', -1.05, 0.7, 0, 0.1, 1.6, 0.14);
      box('wood', 1.05, 0.7, 0, 0.1, 1.6, 0.14);
      for (let k = 0; k < 6; k += 1) {
        box('wood', -0.85 + k * 0.34, 1.0, 0.1, 0.045, 2.4, 0.045, 0, { jitter: 0 });
        box('iron', -0.85 + k * 0.34, 2.28, 0.1, 0.05, 0.22, 0.015);
      }
      break;
    }
    case 'altar': {
      box('ashlar', 0, 0.55, 0, 1.2, 1.1, 2.6, 0, { aoFrom: y });
      box('cloth', 0, 1.12, 0, 1.3, 0.04, 1.7, 0, { tint: [0.7, 0.7, 0.75] });
      box('ashlar', 0, 0.07, 0, 1.8, 0.14, 3.2);
      box('iron', 0.1, 1.35, 0.2, 0.08, 0.5, 0.08);
      break;
    }
    case 'pew': {
      const tilt = prop.broken ? 0.12 : 0;
      box('wood', 0, 0.45, 0, 0.45, 0.07, 2.8, tilt);
      box('wood', -0.22, 0.85, 0, 0.06, 0.8, 2.8, tilt);
      box('wood', 0, 0.22, 1.35, 0.4, 0.44, 0.08);
      box('wood', 0, 0.22, -1.35, 0.4, 0.44, 0.08);
      if (prop.broken) box('wood', 0.2, 0.1, 0.8, 0.9, 0.06, 0.2, 0.8);
      break;
    }
    case 'rubble':
      for (let k = 0; k < 5; k += 1) {
        const [px, pz] = here((random() - 0.5) * 2.2 * (prop.size ?? 1), (random() - 0.5) * 2.0 * (prop.size ?? 1));
        const r = (0.25 + random() * 0.4) * (prop.size ?? 1);
        kgLump(batch, 'ruin', px, y + r * 0.5, pz, r, r * 0.7, r * 0.9, { seed: k + 7, detail: 1, aoFrom: y });
      }
      break;
    case 'gravestone':
      box('ashlar', 0, 0.6, 0, 0.12, 1.2, 0.7, 0.12, { aoFrom: y });
      break;
    case 'bucket': {
      const [x, z] = here(0, 0);
      kgCylinder(batch, 'wood', x, y, z, 0.2, 0.16, 0.3, { sides: 8 });
      break;
    }
    case 'chalice': {
      for (let k = 0; k < 6; k += 1) {
        const [px, pz] = here((random() - 0.5) * 0.5, (random() - 0.5) * 0.4);
        kgBox(batch, 'iron', px, y + 0.03, pz, 0.08 + random() * 0.08, 0.02, 0.06 + random() * 0.05, random() * 6, { tint: [1.9, 1.6, 0.9] });
      }
      break;
    }
    case 'brazier': {
      const [x, z] = here(0, 0);
      const big = prop.rest ? 1.25 : 1;
      kgCylinder(batch, 'iron', x, y + 0.7 * big, z, 0.5 * big, 0.28 * big, 0.3 * big, { sides: 10 });
      for (let k = 0; k < 3; k += 1) {
        const [lx, lz] = [Math.cos(k * 2.09) * 0.3 * big, Math.sin(k * 2.09) * 0.3 * big];
        kgCylinder(batch, 'iron', x + lx, y, z + lz, 0.03, 0.04, 0.75 * big, { sides: 5, tiltX: lz * 0.25, tiltZ: -lx * 0.25 });
      }
      kgCylinder(batch, 'black', x, y + 0.98 * big, z, 0.42 * big, 0.42 * big, 0.04, { sides: 10, tint: [1.6, 0.6, 0.3] });
      dyn.flames.push({ at: [x, y + 1.0 * big, z], size: KP_FLAME.brazier * big });
      dyn.lights.push({ at: [x, y + 1.6 * big, z], color: 0xff8f45, power: prop.rest ? 1.6 : 1.1, range: prop.rest ? 15 : 12, rest: Boolean(prop.rest) });
      break;
    }
    case 'torch': {
      // A bracket in the wall: `face` is the way it looks out from the wall.
      const dir = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[prop.face ?? 'N'];
      const sx = at[0] - dir[0] * 0.08;
      const sz = at[2] - dir[1] * 0.08;
      kgBox(batch, 'iron', sx + dir[0] * 0.12, y + at[1] * 0, sz + dir[1] * 0.12, Math.abs(dir[0]) * 0.28 + 0.05, 0.05, Math.abs(dir[1]) * 0.28 + 0.05, 0);
      kgCylinder(batch, 'wood', sx + dir[0] * 0.28, y - 0.05, sz + dir[1] * 0.28, 0.035, 0.03, 0.55, { sides: 5 });
      dyn.flames.push({ at: [sx + dir[0] * 0.28, y + 0.55, sz + dir[1] * 0.28], size: prop.dim ? 0.12 : KP_FLAME.torch });
      dyn.lights.push({ at: [sx + dir[0] * 0.6, y + 0.7, sz + dir[1] * 0.6], color: 0xffa05a, power: prop.dim ? 0.3 : 0.8, range: 9 });
      break;
    }
    case 'lantern': {
      // An iron lantern hung on an arm from a post: a small cage of iron and horn, lit. `at` is the foot of the post.
      const [x, z] = here(0, 0);
      const [lx, lz] = here(0.32, 0);
      kgCylinder(batch, 'iron', x, y, z, 0.035, 0.05, 1.9, { sides: 6 });
      kgBox(batch, 'iron', (x + lx) / 2, y + 1.88, (z + lz) / 2, 0.36, 0.035, 0.035, yaw);
      kgBox(batch, 'iron', lx, y + 1.62, lz, 0.2, 0.3, 0.2, yaw, { faces: ['top', 'ends', 'sides'] });
      kgBox(batch, 'iron', lx, y + 1.8, lz, 0.26, 0.04, 0.26, yaw);
      dyn.flames.push({ at: [lx, y + 1.6, lz], size: 0.16 });
      dyn.lights.push({ at: [lx, y + 1.7, lz], color: 0xffb060, power: 0.9, range: 10 });
      break;
    }
    case 'drawbridge': {
      // The timber of a drawbridge let down (the deck's boards are its floor's): `at` is the middle of the deck's top, `length` along the
      // prop's x (the hinge at +x, the castle's end), `width` across; under it three stringers and the cross beams, a kerb each side, the
      // iron-shod outer end, the hinge, and the two chains from the outer end up to `chainTo` ([local x, y above the deck]) on the gatehouse.
      const length = prop.length ?? 12;
      const width = prop.width ?? 4;
      const half = length / 2;
      for (const lz of [-width / 2 + 0.35, 0, width / 2 - 0.35]) box('wood', 0, -0.32, lz, length, 0.34, 0.3, 0, { tint: 0.8 });
      for (let lx = -half + 0.6; lx < half; lx += 1.6) box('wood', lx, -0.1, 0, 0.22, 0.16, width - 0.1, 0, { tint: 0.85 });
      for (const side of [-1, 1]) box('wood', 0, 0.1, side * (width / 2 - 0.12), length, 0.2, 0.24, 0, { tint: 0.9 });
      box('iron', -half + 0.12, -0.05, 0, 0.24, 0.32, width, 0, { tint: 0.8 });
      // (The hinge pin: a bar across the deck's end, as a row of short drums, so it lies across whatever way the bridge is turned.)
      for (let lz = -width / 2; lz <= width / 2 + 1e-6; lz += 0.5) {
        const [hx, hz] = here(half - 0.15, lz);
        kgCylinder(batch, 'iron', hx, y - 0.4, hz, 0.13, 0.13, 0.3, { sides: 8 });
      }
      const [toX, toY] = prop.chainTo ?? [half + 0.4, 6];
      for (const side of [-1, 1]) {
        const lz = side * (width / 2 - 0.15);
        const points = [];
        for (let k = 0; k <= 8; k += 1) {
          const t = k / 8;
          const lx = -half + 0.3 + (toX + half - 0.3) * t;
          const [x, z] = here(lx, lz);
          points.push([x, y + 0.2 + (toY - 0.2) * t - 0.9 * Math.sin(Math.PI * t), z]);
        }
        kgTube(batch, 'iron', points, 0.05, { segments: 24, sides: 5, tint: 0.7 });
        const [rx, rz] = here(-half + 0.3, lz);
        kgCylinder(batch, 'iron', rx, y + 0.05, rz, 0.09, 0.09, 0.22, { sides: 6 });
      }
      break;
    }
    case 'sign': {
      // A board on a post, an arrow painted on it pointing along the prop's +x (`yaw`), and a skull daubed under it for a way not to go (`warn`).
      box('wood', 0, 1.1, 0, 0.12, 2.2, 0.12);
      box('wood', 0.35, 1.85, 0.08, 1.2, 0.5, 0.05, 0, { tint: 0.9 });
      const paint = prop.warn ? [1.25, 0.45, 0.4] : [1.4, 1.35, 1.2];
      box('cloth', 0.25, 1.85, 0.115, 0.7, 0.09, 0.012, 0, { tint: paint });
      for (const [lx, h] of [[0.58, 0.3], [0.65, 0.2], [0.72, 0.1]]) box('cloth', lx, 1.85, 0.115, 0.07, h, 0.012, 0, { tint: paint });
      if (prop.warn) {
        box('cloth', 0.35, 1.5, 0.115, 0.3, 0.26, 0.012, 0, { tint: [1.4, 1.35, 1.2] });
        box('wood', 0.29, 1.53, 0.123, 0.06, 0.06, 0.006, 0, { tint: 0.3 });
        box('wood', 0.41, 1.53, 0.123, 0.06, 0.06, 0.006, 0, { tint: 0.3 });
      }
      break;
    }
    // ---- litter and wear (the stage's clutter: walked over, or a heap to walk round) ----
    case 'planks': {
      // Rotten planks, a few thrown down across each other, one on its edge against the rest.
      for (let k = 0; k < 4; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.1, (random() - 0.5) * 0.9);
        kgBox(batch, 'wood', px, y + 0.03 + k * 0.035, pz, 1.1 + random() * 0.9, 0.035, 0.17 + random() * 0.08, yaw + random() * 3, { tint: [0.6 + random() * 0.2, 0.58, 0.52] });
      }
      const [qx, qz] = here(0.2, 0.1);
      kgBox(batch, 'wood', qx, y + 0.22, qz, 0.9, 0.035, 0.2, yaw + 0.5, { tint: 0.65 });
      break;
    }
    case 'brokencrate': {
      box('wood', 0, 0.12, 0, 0.8, 0.06, 0.8, 0, { tint: 0.7 });
      box('wood', -0.38, 0.32, 0, 0.05, 0.5, 0.8, 0, { tint: 0.75 });
      box('wood', 0.2, 0.28, -0.38, 0.55, 0.42, 0.05, 0.12, { tint: 0.7 });
      box('wood', 0.5, 0.06, 0.5, 0.7, 0.04, 0.12, 0.7, { tint: 0.6 });
      box('wood', -0.1, 0.08, 0.55, 0.5, 0.04, 0.12, -0.4, { tint: 0.6 });
      box('iron', -0.38, 0.5, 0, 0.06, 0.05, 0.8, 0, { tint: [1.5, 0.8, 0.5] });
      break;
    }
    case 'sack': {
      for (let k = 0; k < 2; k += 1) {
        const [px, pz] = here(k * 0.5 - 0.2, (random() - 0.5) * 0.3);
        kgLump(batch, 'straw', px, y + 0.18, pz, 0.34, 0.2, 0.26, { seed: k + 40, detail: 1, tint: [0.78, 0.7, 0.55], aoFrom: y });
      }
      break;
    }
    case 'tools': {
      // A pick and a shovel dropped: shafts, an iron head, a blade.
      const lay = (material, lx, lz, w, h, d, turn = 0, up = 0.04, options = {}) => {
        const [px, pz] = here(lx, lz);
        kgBox(batch, material, px, y + up, pz, w, h, d, yaw + turn, options);
      };
      lay('wood', 0, 0, 1.2, 0.045, 0.045, 0.2);
      lay('iron', 0.6, 0.12, 0.34, 0.04, 0.05, 0.2, 0.05, { tint: [1.4, 0.9, 0.7] });
      lay('wood', 0.3, 0.55, 1.3, 0.045, 0.045, -0.5);
      lay('iron', -0.28, 0.82, 0.26, 0.025, 0.2, -0.5, 0.05, { tint: [1.4, 0.9, 0.7] });
      break;
    }
    case 'rustiron': {
      // Rusted ironwork on the ground: a bent bar, a ring, a length of chain.
      const rust = [1.6, 0.85, 0.5];
      box('iron', 0, 0.04, 0, 1.0, 0.05, 0.06, 0.4, { tint: rust });
      box('iron', 0.2, 0.05, 0.1, 0.6, 0.05, 0.06, 1.2, { tint: rust });
      const [rx, rz] = here(-0.5, 0.3);
      kgCylinder(batch, 'iron', rx, y + 0.02, rz, 0.2, 0.2, 0.05, { sides: 8, tint: rust });
      kgTube(batch, 'iron', [0, 0.25, 0.5, 0.75, 1].map((t) => { const [px, pz] = here(0.3 + t * 0.9, -0.3 + 0.12 * Math.sin(t * 6)); return [px, y + 0.03, pz]; }), 0.018, { segments: 8, sides: 4, tint: rust });
      break;
    }
    case 'rubbleheap': {
      // A heap of fallen stone to walk round: a mound of lumps, a few larger blocks on it.
      const size = prop.size ?? 1;
      for (let k = 0; k < 9; k += 1) {
        const ring = k < 5 ? 0.55 : 0.2;
        const angle = random() * Math.PI * 2;
        const [px, pz] = here(Math.cos(angle) * ring * size * 1.1, Math.sin(angle) * ring * size * 0.95);
        const r = (0.3 + random() * 0.32) * size * (k < 5 ? 1 : 0.85);
        kgLump(batch, k % 3 === 0 ? 'ashlar' : 'ruin', px, y + r * (k < 5 ? 0.45 : 1.05), pz, r * 1.1, r * 0.7, r, { seed: k + 60, detail: 1, aoFrom: y, tint: [0.8 + random() * 0.2, 0.8 + random() * 0.2, 0.82 + random() * 0.18] });
      }
      break;
    }
    case 'weeds': {
      // Weeds and grass thrust up between the flags: a few tufts.
      for (let k = 0; k < 4; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.0, (random() - 0.5) * 0.8);
        kgLump(batch, 'grass', px, y + 0.1, pz, 0.22 + random() * 0.18, 0.2 + random() * 0.15, 0.2 + random() * 0.15, { seed: k + 80, detail: 0, tint: [0.55 + random() * 0.25, 0.65 + random() * 0.2, 0.28], aoFrom: y });
      }
      break;
    }
    default:
      kcProp(prop, ctx);
      break;
  }
}
