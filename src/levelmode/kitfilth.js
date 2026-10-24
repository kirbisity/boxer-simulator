// The castle kit's filth, for the old drain and its cesspool: slime on the floors, rubbish, rags, dead rats, a corpse, rotted timber, cobwebs, glowing fungus,
// rusted outfall pipes with sewage pouring from them, flies over what rots; and what a fallen man leaves lying (the helmet off a dead man's head). Like kitprops.js:
// the still things go into the section's batch (a room of them is a few draw calls); what moves or glows is noted in `dyn.filth` and made by `kfDynamics` (the
// fungus's glow, the flies, the pouring sewage). A prop is the stage's `{ kind: 'prop', what, at: [x, y, z], yaw, ... }` decor.

import { kgBox, kgCylinder, kgLump, kgTube } from './kitgeo.js';
import { ktRandom } from './kittex.js';
import { buildArenaHelm } from '../arenaview.js';

/** Where a prop's local (lx, lz) is in the world, for a prop at [x, z] turned `yaw`. */
function kfAt(at, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return (lx, lz) => [at[0] + lx * c + lz * s, at[2] - lx * s + lz * c];
}

/** The sewage's colours, as tints of the kit's flat materials. */
const KF = {
  slime: [0.34, 0.42, 0.16],
  muck: [0.32, 0.26, 0.14],
  rot: [0.42, 0.36, 0.26],
  rag: [0.55, 0.46, 0.34],
  rat: [0.42, 0.36, 0.32],
  rust: [1.6, 0.8, 0.45],
  web: [1.3, 1.3, 1.25],
  fungus: [0.9, 1.25, 0.5],
  flesh: [0.62, 0.52, 0.42],
};

/** The things this file builds (kitprops.js hands it any prop it does not know). */
export const KF_PROPS = ['slime', 'rubbish', 'rags', 'rat', 'corpse', 'cobweb', 'fungus', 'outfall', 'flies', 'rotwood', 'scum'];

/** Build a filth prop into `ctx.batch` (and its moving parts into `ctx.dyn.filth`). Returns false for a prop it does not know. */
export function kfProp(prop, ctx) {
  if (!KF_PROPS.includes(prop.what)) return false;
  const { batch, dyn } = ctx;
  const at = prop.at;
  const yaw = prop.yaw ?? 0;
  const here = kfAt(at, yaw);
  const y = at[1];
  const size = prop.size ?? 1;
  const random = ktRandom(Math.floor(Math.abs(at[0] * 173 + at[2] * 59 + y * 31)) + 17);
  dyn.filth ??= [];
  switch (prop.what) {
    case 'slime': {
      // A spread of slime on the floor: low wet lumps, green-black, and a darker heart.
      for (let k = 0; k < 6; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.6 * size, (random() - 0.5) * 1.2 * size);
        kgLump(batch, 'black', px, y + 0.005, pz, (0.4 + random() * 0.5) * size, 0.025, (0.3 + random() * 0.4) * size, { seed: k + 3, detail: 1, tint: random() < 0.5 ? KF.slime : KF.muck });
      }
      break;
    }
    case 'scum': {
      // Floating filth on the sewage: a raft of froth and rotten straw, a plank, a tipped keg's hoop (at the water's surface).
      for (let k = 0; k < 5; k += 1) {
        const [px, pz] = here((random() - 0.5) * 1.8 * size, (random() - 0.5) * 1.4 * size);
        kgLump(batch, 'straw', px, y + 0.01, pz, (0.3 + random() * 0.4) * size, 0.03, (0.25 + random() * 0.3) * size, { seed: k + 23, detail: 1, tint: random() < 0.5 ? KF.muck : KF.rot });
      }
      const [qx, qz] = here(0.3, -0.2);
      kgBox(batch, 'wood', qx, y + 0.02, qz, 1.1 * size, 0.04, 0.18, yaw + 0.6, { tint: KF.rot });
      break;
    }
    case 'rubbish': {
      // A heap of rubbish washed up against the wall: rotten straw and rags, broken staves, a bone or two, all one brown.
      const tint = [KF.muck, KF.rot, KF.rag];
      for (let k = 0; k < 10; k += 1) {
        const angle = random() * Math.PI * 2;
        const ring = (k < 6 ? 0.55 : 0.2) * size;
        const [px, pz] = here(Math.cos(angle) * ring, Math.sin(angle) * ring * 0.8);
        const r = (0.18 + random() * 0.28) * size;
        kgLump(batch, k % 3 === 0 ? 'cloth' : 'straw', px, y + r * 0.45, pz, r * 1.2, r * 0.6, r, { seed: k + 41, detail: 1, tint: tint[k % 3], aoFrom: y });
      }
      for (let k = 0; k < 3; k += 1) {
        const [px, pz] = here((random() - 0.5) * size, (random() - 0.5) * size);
        kgBox(batch, 'wood', px, y + 0.12 + k * 0.05, pz, 0.7 * size, 0.04, 0.08, yaw + random() * 3, { tint: KF.rot });
      }
      const [bx, bz] = here(0.4 * size, 0.2);
      kgBox(batch, 'bone', bx, y + 0.06, bz, 0.34, 0.05, 0.06, yaw + 1.2);
      break;
    }
    case 'rags': {
      for (let k = 0; k < 3; k += 1) {
        const [px, pz] = here((random() - 0.5) * 0.9, (random() - 0.5) * 0.7);
        kgLump(batch, 'cloth', px, y + 0.04, pz, 0.35 + random() * 0.25, 0.05, 0.25 + random() * 0.2, { seed: k + 61, detail: 1, tint: k === 1 ? KF.muck : KF.rag });
      }
      break;
    }
    case 'rat': {
      // A dead rat on its side: a body, a head, a tail.
      const [bx, bz] = here(0, 0);
      kgLump(batch, 'cloth', bx, y + 0.045, bz, 0.11, 0.05, 0.06, { seed: 71, detail: 1, tint: KF.rat });
      const [hx, hz] = here(0.13, 0.01);
      kgLump(batch, 'cloth', hx, y + 0.04, hz, 0.05, 0.035, 0.035, { seed: 72, detail: 0, tint: KF.rat });
      kgTube(batch, 'bone', [0, 0.25, 0.5, 0.75, 1].map((t) => { const [px, pz] = here(-0.1 - t * 0.2, 0.04 * Math.sin(t * 5)); return [px, y + 0.012, pz]; }), 0.007, { segments: 6, sides: 3, tint: [0.7, 0.55, 0.5] });
      break;
    }
    case 'corpse': {
      // A man dead in the filth a long while: lying on his back in rags, his flesh gone to leather and bone.
      const lay = (material, lx, lz, rx, ry, rz, tint, up = 0) => {
        const [px, pz] = here(lx, lz);
        kgLump(batch, material, px, y + ry * 0.6 + up, pz, rx, ry, rz, { seed: Math.floor(lx * 10 + lz * 7) + 90, detail: 1, tint });
      };
      lay('cloth', 0, 0, 0.42, 0.13, 0.22, KF.rag);
      lay('cloth', 0.42, 0, 0.18, 0.1, 0.2, KF.muck);
      lay('bone', 0.72, 0.02, 0.11, 0.1, 0.1, KF.flesh, 0.02);
      for (const side of [-1, 1]) {
        lay('cloth', -0.55, side * 0.12, 0.34, 0.07, 0.07, KF.rag);
        const [fx, fz] = here(-0.98, side * 0.14);
        kgBox(batch, 'bone', fx, y + 0.05, fz, 0.22, 0.05, 0.07, yaw);
        const [ax, az] = here(0.25 + (side > 0 ? 0.1 : -0.05), side * 0.38);
        kgBox(batch, 'bone', ax, y + 0.05, az, 0.48, 0.045, 0.05, yaw + side * 0.5, { tint: KF.flesh });
      }
      dyn.filth.push({ kind: 'flies', at: [at[0], y + 0.5, at[2]], count: 10, radius: 0.5 });
      break;
    }
    case 'cobweb': {
      // Strands across a corner of the vault: a fan of threads and a few rings, grey.
      const span = prop.span ?? 0.9;
      const [cx, cz] = here(0, 0);
      const hub = [cx, y, cz];
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 5) * Math.PI * 0.5;
        const [ex, ez] = here(Math.cos(a) * span, Math.sin(a) * span * 0.2);
        kgTube(batch, 'bone', [hub, [(hub[0] + ex) / 2, y - 0.05 - Math.sin(a) * span * 0.4, (hub[2] + ez) / 2], [ex, y - Math.sin(a) * span * 0.8, ez]], 0.004, { segments: 3, sides: 3, tint: KF.web });
      }
      break;
    }
    case 'fungus': {
      // A cluster of pale caps on the wet stone, glowing a faint sick green (`light`: a little light of their own, for the pool of real lights).
      for (let k = 0; k < 7 * size; k += 1) {
        const [px, pz] = here((random() - 0.5) * 0.7 * size, (random() - 0.5) * 0.5 * size);
        const h = 0.04 + random() * 0.08;
        kgCylinder(batch, 'bone', px, y, pz, 0.008, 0.012, h, { sides: 4, tint: KF.fungus });
        kgLump(batch, 'bone', px, y + h, pz, 0.03 + random() * 0.04, 0.015, 0.03 + random() * 0.04, { seed: k + 120, detail: 0, tint: KF.fungus });
      }
      dyn.filth.push({ kind: 'glow', at: [at[0], y + 0.12, at[2]], size: 0.9 * size, colour: 0x9fe060 });
      if (prop.light !== false) dyn.lights.push({ at: [at[0], y + 0.5, at[2]], color: 0x8fdc50, power: 0.42 * size, range: 6 });
      break;
    }
    case 'outfall': {
      // A rusted pipe out of the wall (`face`: the way it points out; `length` m of it out of the wall face at `at`), sewage pouring from its mouth down to `to` (a y).
      const dir = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[prop.face ?? 'N'];
      const r = 0.2 * size;
      const long = prop.length ?? 0.6;
      // (A cylinder is built up its y axis from its foot: tipped a quarter turn it runs from the wall outward.)
      const tilt = dir[0] !== 0 ? { tiltZ: -Math.sign(dir[0]) * Math.PI / 2 } : { tiltX: Math.sign(dir[1]) * Math.PI / 2 };
      kgCylinder(batch, 'iron', at[0] - dir[0] * 0.3, y, at[2] - dir[1] * 0.3, r, r, long + 0.3, { sides: 10, tint: KF.rust, ...tilt });
      kgCylinder(batch, 'black', at[0] + dir[0] * (long - 0.02), y, at[2] + dir[1] * (long - 0.02), r * 0.8, r * 0.8, 0.03, { sides: 10, ...tilt });
      // A beard of slime down the wall under it.
      kgLump(batch, 'black', at[0] - dir[0] * 0.05, y - 0.6, at[2] - dir[1] * 0.05, 0.35, 0.6, 0.05 + Math.abs(dir[0]) * 0.3, { seed: 140, detail: 1, tint: KF.slime });
      const mouth = [at[0] + dir[0] * (long + 0.02), y - r * 0.5, at[2] + dir[1] * (long + 0.02)];
      dyn.filth.push({ kind: 'stream', at: mouth, to: prop.to ?? y - 1.5, width: r * 1.3, dir });
      break;
    }
    case 'flies':
      dyn.filth.push({ kind: 'flies', at: [at[0], y, at[2]], count: prop.count ?? 12, radius: prop.radius ?? 0.6 });
      break;
    case 'rotwood': {
      // A rotted timber: a beam fallen and broken, black with wet.
      const [ax, az] = here(-0.6, 0);
      const [bx, bz] = here(0.7, 0.1);
      kgBox(batch, 'wood', ax, y + 0.12, az, 1.4 * size, 0.22, 0.24, yaw + 0.05, { tint: KF.rot });
      kgBox(batch, 'wood', bx, y + 0.1, bz, 1.0 * size, 0.2, 0.22, yaw - 0.35, { tint: [0.3, 0.27, 0.2] });
      break;
    }
    default:
      return false;
  }
  return true;
}

// ---- What moves ---------------------------------------------------------------------------------------------

/** A strip of falling sewage: a brown streaked canvas, scrolled down. */
function kfStreamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const random = ktRandom(808);
  g.fillStyle = 'rgba(70,58,30,0.75)';
  g.fillRect(0, 0, 32, 128);
  for (let k = 0; k < 40; k += 1) {
    const x = random() * 32;
    const w = 1 + random() * 4;
    g.fillStyle = random() < 0.5 ? `rgba(40,34,16,${0.4 + random() * 0.4})` : `rgba(120,110,60,${0.2 + random() * 0.3})`;
    g.fillRect(x, 0, w, 128);
  }
  for (let k = 0; k < 30; k += 1) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(random() * 32, random() * 128, 2 + random() * 6, 4 + random() * 10);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

let KF_STREAM = null;
const KF_TMP = new THREE.Object3D();

/**
 * The moving parts of a section's filth (`list`: its `dyn.filth`): the fungus's glow (sprites that breathe), the flies (an instanced swarm each), the sewage pouring
 * from the outfalls (a scrolled strip, and a ring in the water where it lands: `water`, kitwater.js). Returns { group, update(t) } or null.
 */
export function kfDynamics(list, textures, water) {
  if (!list?.length) return null;
  const group = new THREE.Group();
  group.name = 'filth';
  const glows = [];
  const swarms = [];
  const streams = [];
  for (const item of list) {
    if (item.kind === 'glow') {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow, color: item.colour, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5, fog: true }));
      sprite.position.set(...item.at);
      sprite.scale.setScalar(item.size);
      sprite.renderOrder = 5;
      group.add(sprite);
      glows.push({ sprite, phase: item.at[0] * 1.7 + item.at[2] });
    } else if (item.kind === 'flies') {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.014, 0.01, 0.014), new THREE.MeshBasicMaterial({ color: 0x050505 }), item.count);
      mesh.frustumCulled = false;
      group.add(mesh);
      swarms.push({ mesh, item, seeds: Array.from({ length: item.count }, (_, k) => [k * 2.39 + item.at[0], 1.3 + (k % 5) * 0.37, 0.7 + (k % 3) * 0.41]) });
    } else if (item.kind === 'stream') {
      KF_STREAM ??= kfStreamTexture();
      const map = KF_STREAM.clone();
      map.needsUpdate = true;
      const height = Math.max(0.2, item.at[1] - item.to);
      map.repeat.set(1, height / 1.2);
      const material = new THREE.MeshLambertMaterial({ map, color: 0x9a8a60, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
      for (const turn of [0, Math.PI / 2]) {
        const card = new THREE.Mesh(new THREE.PlaneGeometry(item.width, height), material);
        card.position.set(item.at[0], item.to + height / 2, item.at[2]);
        card.rotation.y = turn + (item.dir[0] !== 0 ? Math.PI / 2 : 0);
        card.renderOrder = 2;
        group.add(card);
      }
      streams.push({ map, item, next: 0 });
    }
  }
  const update = (t) => {
    for (const glow of glows) glow.sprite.material.opacity = 0.38 + 0.14 * Math.sin(t * 0.7 + glow.phase);
    for (const swarm of swarms) {
      const { item, mesh, seeds } = swarm;
      seeds.forEach(([a, b, c], k) => {
        const r = item.radius * (0.4 + 0.6 * Math.abs(Math.sin(t * 0.9 * c + a)));
        KF_TMP.position.set(item.at[0] + Math.cos(t * b * 2.2 + a) * r, item.at[1] + 0.25 * Math.sin(t * c * 3.1 + a * 2), item.at[2] + Math.sin(t * b * 1.9 + a * 1.3) * r);
        KF_TMP.updateMatrix();
        mesh.setMatrixAt(k, KF_TMP.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (const stream of streams) {
      stream.map.offset.y = (t * 1.6) % 1;
      // (Where it lands it rings the sewage, about once a second: the rings a man makes must have room in the pool.)
      if (water && t >= stream.next) {
        stream.next = t + 1.1;
        water.poke([stream.item.at[0], stream.item.to, stream.item.at[2]], 0.45, 0, t);
      }
    }
  };
  return { group, update };
}

// ---- What a dead man leaves -----------------------------------------------------------------------------------

/**
 * The helmets lying where they fell (a run's `level.dropped`: [{ id, kind: 'helmet', head: { kind, style, color }, at: [x, y, z], yaw }], levelmode/level.js): each
 * drawn once, with the arena helmet's own geometry (arenaview.js), on its side on the floor. `update(dropped)` each frame. Returns { group, update }.
 */
export function kfDropped() {
  const group = new THREE.Group();
  group.name = 'dropped';
  const made = new Map();
  const update = (dropped) => {
    const live = new Set();
    for (const thing of dropped ?? []) {
      live.add(thing.id);
      if (made.has(thing.id)) continue;
      const holder = new THREE.Group();
      const helm = new THREE.Group();
      const metal = new THREE.MeshStandardMaterial({ color: thing.head?.color ?? '#b98a3e', roughness: 0.38, metalness: 0.75 });
      if (thing.head?.kind === 'arenaHelm') buildArenaHelm(helm, thing.head, 0.115, metal);
      else helm.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), metal));
      // On its side, the crown toward the dead man.
      helm.rotation.set(0, 0, Math.PI / 2 - 0.25);
      helm.position.y = 0.12;
      holder.add(helm);
      holder.position.set(...thing.at);
      holder.rotation.y = thing.yaw ?? 0;
      group.add(holder);
      made.set(thing.id, holder);
    }
    for (const [id, holder] of made) {
      if (live.has(id)) continue;
      group.remove(holder);
      holder.traverse((object) => {
        object.geometry?.dispose();
        object.material?.dispose?.();
      });
      made.delete(id);
    }
  };
  return { group, update };
}
