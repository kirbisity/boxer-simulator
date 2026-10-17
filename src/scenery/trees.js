// The open-air places' trees, instanced (a few draw calls per place whatever
// the count): clumped geometry near the fight (broadleaf crowns of a handful
// of noise-displaced icosahedron clumps with crown-shaped normals and baked
// shading, dark inside and underneath; pines as a tapered trunk under
// drooping, ragged needle skirts), and beyond 30 m the same trees as cards
// (rendered once into an atlas, drawn as three crossed alpha-tested quads).
// They stand on the land the foothills raise, with woods up the hills.
// See src/scenery.js for the contract.

/* global THREE */

// ---- Shared ---------------------------------------------------------------

/** Half the size of each place's ground plane: trees stay on it. */
const TREES_GROUND_HALF = { meadow: 39, field: 69, plain: 64, sengoku: 54 };
/** What already stands about the ground (x, z, radius): no tree on it. */
const TREES_AVOID = {
  meadow: [[-13, -9, 4], [-6, -12, 4], [9, -11, 4], [14, 4, 4], [-14, 6, 4], [4, 12, 4], [-10, 2, 2], [11, -4, 2], [-3, 10, 2], [6, -9, 2]],
  sengoku: [[-14.5, 0, 9], [14.5, 0, 9]],
};
const TREES_NEAR = 30;

const treesSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A smooth-ish 3D noise in about [-1, 1] from a few seeded sine waves. */
function treesNoise(rng) {
  const waves = Array.from({ length: 5 }, () => {
    const d = new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
    return { d, f: 1.2 + rng() * 2.4, p: rng() * 6.28 };
  });
  return (x, y, z) => waves.reduce((sum, w) => sum + Math.sin((w.d.x * x + w.d.y * y + w.d.z * z) * w.f + w.p), 0) / 2.4;
}

/** The sun's direction now, for baked top light. */
function treesSunOf(view) {
  const sun = view?.lights?.sun?.position;
  return sun && sun.lengthSq() > 0 ? sun.clone().normalize() : new THREE.Vector3(0.62, 0.62, 0.48).normalize();
}

/** Collects triangles (position, normal, colour) into one non-indexed geometry. */
class TreesBuilder {
  constructor() {
    this.position = [];
    this.normal = [];
    this.color = [];
  }
  vertex(p, n, c) {
    this.position.push(p.x, p.y, p.z);
    this.normal.push(n.x, n.y, n.z);
    this.color.push(c.r, c.g, c.b);
  }
  get triangles() {
    return this.position.length / 9;
  }
  geometry() {
    // Wind every triangle to face where its normals point.
    const p = this.position;
    const n = this.normal;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 0; i < p.length; i += 9) {
      a.set(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]);
      b.set(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]);
      a.cross(b);
      const dot = a.x * (n[i] + n[i + 3] + n[i + 6]) + a.y * (n[i + 1] + n[i + 4] + n[i + 7]) + a.z * (n[i + 2] + n[i + 5] + n[i + 8]);
      if (dot >= 0) continue;
      for (const list of [p, n, this.color]) {
        for (let k = 0; k < 3; k++) [list[i + 3 + k], list[i + 6 + k]] = [list[i + 6 + k], list[i + 3 + k]];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** A tapered, slightly bent open tube from `base` along `axis`: trunk or branch. */
function treesTube(builder, { base, axis, length, r0, r1, segments, rings, bend, colour, rng }) {
  const up = axis.clone().normalize();
  const side = Math.abs(up.y) < 0.9 ? new THREE.Vector3(0, 1, 0).cross(up).normalize() : new THREE.Vector3(1, 0, 0);
  const other = up.clone().cross(side).normalize();
  const bendDir = side.clone().multiplyScalar(Math.cos(bend.angle)).addScaledVector(other, Math.sin(bend.angle));
  const ring = (k) => {
    const t = k / rings;
    const centre = base.clone().addScaledVector(up, length * t).addScaledVector(bendDir, bend.amount * Math.sin(t * Math.PI * 0.8));
    const radius = r0 + (r1 - r0) * t;
    return Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      const n = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(other, Math.sin(a));
      const wobble = 1 + (rng() - 0.5) * 0.18;
      return { p: centre.clone().addScaledVector(n, radius * wobble), n, shade: 0.75 + 0.25 * t };
    });
  };
  const rows = Array.from({ length: rings + 1 }, (_, k) => ring(k));
  const c = new THREE.Color();
  for (let k = 0; k < rings; k++) {
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const quad = [rows[k][i], rows[k][j], rows[k + 1][j], rows[k + 1][i]];
      for (const index of [0, 2, 1, 0, 3, 2]) {
        const v = quad[index];
        builder.vertex(v.p, v.n, c.copy(colour).multiplyScalar(1.25 * v.shade * (0.85 + 0.3 * Math.max(0, v.n.y + 0.3))));
      }
    }
  }
}

// ---- Clumped broadleaf ------------------------------------------------------

/** One broadleaf tree (metres, base at the origin): ~450 triangles. */
function treesBroadleafGeometry(rng, leaf, bark, sun) {
  const builder = new TreesBuilder();
  const noise = treesNoise(rng);
  const trunkHeight = 1.7 + rng() * 0.6;
  const crownRadius = 2.3 + rng() * 0.6;
  const crown = new THREE.Vector3((rng() - 0.5) * 0.3, trunkHeight + crownRadius * 0.95, (rng() - 0.5) * 0.3);
  const lean = rng() * Math.PI * 2;
  treesTube(builder, { base: new THREE.Vector3(), axis: new THREE.Vector3(crown.x, crown.y, crown.z), length: crown.y * 0.92, r0: 0.26, r1: 0.1, segments: 7, rings: 3, bend: { angle: lean, amount: 0.25 }, colour: bark, rng });
  // Branch stubs into the crown's edge.
  for (let index = 0; index < 2; index++) {
    const a = lean + index * Math.PI + (rng() - 0.5);
    const axis = new THREE.Vector3(Math.cos(a), 1.3 + rng() * 0.5, Math.sin(a));
    treesTube(builder, { base: new THREE.Vector3(crown.x * 0.5, trunkHeight * (0.92 + rng() * 0.1), crown.z * 0.5), axis, length: 1.4 + rng() * 0.4, r0: 0.09, r1: 0.04, segments: 5, rings: 1, bend: { angle: 0, amount: 0 }, colour: bark, rng });
  }
  // The crown: a big central clump and four or five round it, upper half favoured.
  const clumps = [{ centre: crown.clone(), radius: crownRadius * 0.78 }, { centre: crown.clone().add(new THREE.Vector3((rng() - 0.5) * 0.8, crownRadius * 0.55, (rng() - 0.5) * 0.8)), radius: crownRadius * 0.5 }];
  const around = 4;
  for (let index = 0; index < around; index++) {
    const a = (index / around) * Math.PI * 2 + rng() * 0.8;
    const lift = -0.35 + rng() * 1.1;
    const dir = new THREE.Vector3(Math.cos(a), lift, Math.sin(a)).normalize();
    clumps.push({ centre: crown.clone().addScaledVector(dir, crownRadius * (0.5 + rng() * 0.15)), radius: crownRadius * (0.45 + rng() * 0.15) });
  }
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const out = new THREE.Vector3();
  const c = new THREE.Color();
  const tint = new THREE.Color();
  for (const clump of clumps) {
    const ico = new THREE.IcosahedronGeometry(1, 1);
    const pos = ico.attributes.position;
    tint.copy(leaf).offsetHSL((rng() - 0.5) * 0.03, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.04);
    for (let v = 0; v < pos.count; v++) {
      const dir = new THREE.Vector3().fromBufferAttribute(pos, v).normalize();
      p.copy(dir).multiplyScalar(clump.radius).add(clump.centre);
      const bump = 1 + 0.24 * noise(p.x * 0.9, p.y * 0.9, p.z * 0.9) + 0.1 * noise(p.x * 2.3 + 5, p.y * 2.3, p.z * 2.3);
      p.copy(dir).multiplyScalar(clump.radius * bump);
      if (p.y < 0) p.y *= 0.78;
      p.add(clump.centre);
      // Normals: half the clump's own roundness, half the crown's, so the crown reads as one mass.
      out.copy(p).sub(crown).normalize();
      n.copy(dir).multiplyScalar(0.45).addScaledVector(out, 0.55).normalize();
      // Baked light: dark in the crown's heart and underneath, bright where the sun hits the top.
      const depth = treesSmooth(0.35, 1.05, p.distanceTo(crown) / (crownRadius * 1.15));
      const under = 0.55 + 0.45 * treesSmooth(-0.7, 0.6, n.y);
      const lit = Math.max(0, n.dot(sun));
      const shade = (0.6 + 0.4 * depth) * (0.72 + 0.28 * under) * (0.9 + 0.3 * lit);
      c.copy(tint).multiplyScalar(shade);
      c.r += 0.05 * lit * depth;
      c.g += 0.07 * lit * depth;
      builder.vertex(p, n, c);
    }
  }
  return builder.geometry();
}

// ---- Clumped pine -----------------------------------------------------------

/** One pine (metres, base at the origin): a trunk under drooping ragged skirts, ~320 triangles. */
function treesPineGeometry(rng, needle, bark, sun) {
  const builder = new TreesBuilder();
  const height = 7 + rng() * 2;
  const tiers = 9 + Math.floor(rng() * 3);
  const maxRadius = 1.9 + rng() * 0.5;
  treesTube(builder, { base: new THREE.Vector3(), axis: new THREE.Vector3(0, 1, 0), length: height * 0.8, r0: 0.24, r1: 0.06, segments: 6, rings: 3, bend: { angle: rng() * 6.28, amount: 0.2 }, colour: bark, rng });
  const c = new THREE.Color();
  const segments = 9;
  const base = 1.5 + rng() * 0.6;
  for (let tier = 0; tier < tiers; tier++) {
    const t = tier / (tiers - 1);
    const y = base + (height - base - 1.2) * Math.pow(t, 0.9);
    const radius = maxRadius * Math.pow(1 - t, 0.8) * (0.8 + rng() * 0.35) + 0.3;
    const droop = radius * (0.38 + rng() * 0.2);
    const lean = new THREE.Vector3((rng() - 0.5) * 0.3, 0, (rng() - 0.5) * 0.3);
    const apex = new THREE.Vector3((rng() - 0.5) * 0.1, tier === tiers - 1 ? height : y + radius * 0.3, (rng() - 0.5) * 0.1);
    const belly = new THREE.Vector3(0, y - droop * 0.5, 0);
    const turn = rng() * 6.28;
    const tierShade = 0.75 + 0.3 * t;
    const mid = [];
    const rim = [];
    for (let i = 0; i < segments; i++) {
      const a = turn + ((i + (rng() - 0.5) * 0.4) / segments) * Math.PI * 2;
      const tuft = i % 2 ? 0.62 + rng() * 0.15 : 1 + rng() * 0.25;
      const r = radius * tuft;
      const am = turn + ((i + 0.5) / segments) * Math.PI * 2;
      mid.push(new THREE.Vector3(Math.cos(am) * radius * 0.5, y + radius * 0.02 + (rng() - 0.5) * 0.2, Math.sin(am) * radius * 0.5).add(lean));
      rim.push(new THREE.Vector3(Math.cos(a) * r, y - droop * (0.6 + 0.5 * tuft) + (rng() - 0.5) * 0.3, Math.sin(a) * r).add(lean));
    }
    const normalAt = (p, up) => new THREE.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.6).add(new THREE.Vector3(0, up, 0)).normalize();
    const shadeOf = (p, n, outer) => {
      const lit = Math.max(0, n.dot(sun));
      c.copy(needle).multiplyScalar(tierShade * (0.5 + 0.55 * outer) * (0.8 + 0.4 * lit));
      const tip = outer > 0.9 ? 0.04 * lit : 0;
      c.r += tip * 0.6;
      c.g += tip;
      return c;
    };
    const tri = (a, b, d, up, outers) => {
      for (const [p, outer] of [[a, outers[0]], [b, outers[1]], [d, outers[2]]]) {
        const n = normalAt(p, up);
        builder.vertex(p, n, shadeOf(p, n, outer));
      }
    };
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      // Top: apex to the middle ring, the middle ring out to the ragged rim.
      tri(apex, mid[i], mid[j], 0.9, [0.1, 0.55, 0.55]);
      tri(mid[i], rim[i], rim[j], 0.75, [0.55, 1, 1]);
      tri(mid[i], rim[j], mid[j], 0.75, [0.55, 1, 0.55]);
      // Underneath, back in to the trunk: dark.
      for (const [p, n] of [[rim[j], normalAt(rim[j], -0.6)], [rim[i], normalAt(rim[i], -0.6)], [belly, new THREE.Vector3(0, -1, 0)]]) {
        builder.vertex(p, n, c.copy(needle).multiplyScalar(tierShade * 0.38));
      }
    }
  }
  return builder.geometry();
}

// ---- Placing ----------------------------------------------------------------

/** Is (x, z) a place a tree may stand in this place? */
function treesFree(place, spec, x, z, margin = 2.5) {
  const half = TREES_GROUND_HALF[place] ?? 40;
  if (Math.abs(x) > half || Math.abs(z) > half) return false;
  const [kx, kz] = spec.keepOut ?? [0, 0];
  if (Math.abs(x) < kx + margin && Math.abs(z) < kz + margin) return false;
  for (const clear of spec.keepClear ?? []) if (Math.hypot(x - clear.at[0], z - clear.at[1]) < clear.radius + 2) return false;
  for (const [ax, az, r] of TREES_AVOID[place] ?? []) if (Math.hypot(x - ax, z - az) < r) return false;
  return true;
}

/**
 * Where trees stand: `count` in an annulus [from, to], scattered (or in
 * `woods` clusters of `perWood`), spaced apart, off the ground and any keepClear.
 */
function treesScatter(place, spec, rng, { count, from, to, spacing = 3, woods = 0, perWood = 0, taken = [] }) {
  const trees = [];
  const ok = (x, z) => treesFree(place, spec, x, z) && ![...taken, ...trees].some((t) => Math.hypot(t.x - x, t.z - z) < spacing);
  const add = (x, z) => trees.push({ x, z, scale: 0.8 + rng() * 0.45, turn: rng() * Math.PI * 2, shape: Math.floor(rng() * 3), tint: rng() });
  for (let wood = 0; wood < woods; wood++) {
    const a = rng() * Math.PI * 2;
    const r = from + (to - from) * (0.3 + rng() * 0.6);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const size = 5 + rng() * 6;
    for (let tries = 0, made = 0; made < perWood && tries < perWood * 12; tries++) {
      const x = cx + (rng() - 0.5) * size * 2.4;
      const z = cz + (rng() - 0.5) * size * 1.4;
      const d = Math.hypot(x, z);
      if (d < from || d > to || !ok(x, z)) continue;
      add(x, z);
      made++;
    }
  }
  for (let tries = 0; trees.length < count + woods * perWood && tries < count * 40; tries++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(from * from + (to * to - from * from) * rng());
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (ok(x, z)) add(x, z);
  }
  return trees;
}

/** The height of the land a sibling scenery part has raised in this place (foothills, terrain), or null on flat ground. */
function treesLandOf(view, place) {
  const shown = view.places?.[place]?.children.find((child) => child.visible && child.userData.heightAt);
  return shown?.userData.heightAt ?? null;
}

/**
 * Woods up the hills beyond the ground: clusters set where the land has
 * risen at least a metre, each tree standing on the slope (a little sunk, so
 * no root shows on the downhill side). Far off, so they are drawn as cards.
 */
function treesOnHills(place, spec, rng, heightAt, { count, from, to, perWood }) {
  const trees = [];
  for (let tries = 0; trees.length < count && tries < count * 6; tries++) {
    const a = rng() * Math.PI * 2;
    const r = from + (to - from) * Math.pow(rng(), 0.8);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (heightAt(cx, cz) < 1) continue;
    if ((spec.keepClear ?? []).some((clear) => Math.hypot(cx - clear.at[0], cz - clear.at[1]) < clear.radius + 6)) continue;
    const size = 8 + rng() * 14;
    for (let made = 0, attempts = 0; made < perWood && attempts < perWood * 4; attempts++) {
      const x = cx + (rng() - 0.5) * size * 2;
      const z = cz + (rng() - 0.5) * size * 2;
      const y = heightAt(x, z);
      if (y < 0.6) continue;
      trees.push({ x, y: y - 0.25, z, scale: 0.9 + rng() * 0.6, turn: rng() * Math.PI * 2, shape: Math.floor(rng() * 3), tint: rng(), hill: true });
      made++;
    }
  }
  return trees;
}

// How many trees go up each place's hills when the land rises (in woods of perWood).
// The share of a place's own broadleaf trees kept when the land rises behind them.
const TREES_ON_LAND_KEEP = 0.55;

const TREES_HILL_WOODS = {
  meadow: { count: 160, from: 50, to: 200, perWood: 12 },
  field: { count: 180, from: 75, to: 220, perWood: 12 },
  sengoku: { count: 700, from: 40, to: 230, perWood: 28 },
};

/** One InstancedMesh per shape for the trees that use it. */
function treesInstance(group, geometries, material, trees, { shadows = true, scale = 1 } = {}) {
  // For the harness: where the last trees stood (to aim a close-up).
  globalThis.__treesLast = trees;
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const colour = new THREE.Color();
  geometries.forEach((geometry, shape) => {
    // Near to far, so a level's mist can leave out the farthest by drawing fewer (render.js applyWeather).
    const mine = trees.filter((tree) => tree.shape % geometries.length === shape).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    if (!mine.length) return;
    const mesh = new THREE.InstancedMesh(geometry, material, mine.length);
    mine.forEach((tree, index) => {
      q.setFromAxisAngle(THREE.Object3D.DefaultUp, tree.turn);
      s.setScalar(tree.scale * scale);
      matrix.compose(new THREE.Vector3(tree.x, tree.y ?? 0, tree.z), q, s);
      mesh.setMatrixAt(index, matrix);
      const t = tree.tint;
      colour.setRGB(0.88 + t * 0.2, 0.9 + t * 0.16, 0.86 + (1 - t) * 0.16);
      mesh.setColorAt(index, colour);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.treeReach = mine.map((tree) => Math.hypot(tree.x, tree.z));
    (globalThis.__treesStats ??= []).push({ trees: mine.length, triangles: geometry.attributes.position.count / 3 });
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = false;
    group.add(mesh);
  });
}

// ---- The shapes and their cards, made once per place --------------------------

/** Three tree shapes of the place's kind, coloured for it. */
function treesShapes(spec, rng, view) {
  const leaf = new THREE.Color(spec.trees.colour);
  const bark = new THREE.Color(spec.trees.bark);
  const sun = treesSunOf(view);
  const make = spec.trees.kind === 'pine' ? treesPineGeometry : treesBroadleafGeometry;
  return [0, 1, 2].map(() => make(rng, leaf, bark, sun));
}

const treesClumpedMaterial = () => new THREE.MeshLambertMaterial({ vertexColors: true });

const TREES_TILE = 512;

/**
 * The cards: each shape drawn once, from the side, into one atlas (an
 * orthographic camera, a render target); three quads crossed at 60° per tree.
 */
function treesCards(view, shapes) {
  const renderer = view.renderer;
  const cell = shapes.reduce((size, g) => {
    const box = g.boundingBox;
    return Math.max(size, box.max.y + 0.2, 2 * Math.max(-box.min.x, box.max.x, -box.min.z, box.max.z) + 0.4);
  }, 0);
  const target = new THREE.WebGLRenderTarget(TREES_TILE * shapes.length, TREES_TILE, {
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true,
  });
  target.texture.generateMipmaps = true;
  const scene = new THREE.Scene();
  // Albedo with the baked shading only: the card's own lighting does the sun.
  const flat = new THREE.MeshBasicMaterial({ vertexColors: true });
  shapes.forEach((geometry, index) => {
    const mesh = new THREE.Mesh(geometry, flat);
    mesh.position.x = (index + 0.5) * cell;
    scene.add(mesh);
  });
  const camera = new THREE.OrthographicCamera(0, cell * shapes.length, cell, 0, -50, 50);
  camera.position.set(0, 0, 10);
  const before = { target: renderer.getRenderTarget(), colour: renderer.getClearColor(new THREE.Color()), alpha: renderer.getClearAlpha(), shadows: renderer.shadowMap.autoUpdate };
  renderer.shadowMap.autoUpdate = false;
  // Clear to the foliage's own dark green, transparent, so mip edges don't fringe black.
  renderer.setClearColor(0x20301a, 0);
  renderer.setRenderTarget(target);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(before.target);
  renderer.setClearColor(before.colour, before.alpha);
  renderer.shadowMap.autoUpdate = before.shadows;
  flat.dispose();

  // A touch darker than white: the picture already carries its shading.
  const material = new THREE.MeshLambertMaterial({ map: target.texture, alphaTest: 0.4, color: 0xd0d0d0 });
  material.userData.treesTarget = target;
  // A quad seen edge-on fades out (its alpha falls below the test), so no seams.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 cardFace;\nvarying float vCardFacing;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      vec3 cardFaceView = normalize((modelViewMatrix * instanceMatrix * vec4(cardFace, 0.0)).xyz);
      vCardFacing = abs(dot(cardFaceView, normalize(-mvPosition.xyz)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCardFacing;')
      .replace('#include <alphatest_fragment>', 'diffuseColor.a *= smoothstep(0.12, 0.42, vCardFacing);\n#include <alphatest_fragment>');
  };
  material.customProgramCacheKey = () => 'trees-card';
  const geometries = shapes.map((_, index) => {
    const builder = { position: [], normal: [], uv: [], face: [] };
    const u0 = index / shapes.length;
    const u1 = (index + 1) / shapes.length;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      const ax = Math.cos(a);
      const az = -Math.sin(a);
      const face = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      for (const sign of [1, -1]) {
        const n = face.clone().multiplyScalar(0.45 * sign).add(new THREE.Vector3(0, 0.9, 0)).normalize();
        const corners = [[-0.5, 0, u0, 0], [0.5, 0, u1, 0], [0.5, 1, u1, 1], [-0.5, 1, u0, 1]];
        const order = sign > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        for (const i of order) {
          const [h, v, u, w] = corners[i];
          builder.position.push(ax * h * cell, v * cell, az * h * cell);
          builder.normal.push(n.x, n.y, n.z);
          builder.uv.push(u, w);
          builder.face.push(face.x, 0, face.z);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(builder.position, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(builder.normal, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uv, 2));
    g.setAttribute('cardFace', new THREE.Float32BufferAttribute(builder.face, 3));
    g.computeBoundingSphere();
    return g;
  });
  return { geometries, material };
}

/** The trees a place has by its spec, standing on the land, plus woods up its hills. */
function treesPlan(place, spec, rng, heightAt) {
  const { count, from, to, kind } = spec.trees;
  const trees = treesScatter(place, spec, rng, { count, from, to, spacing: kind === 'pine' ? 2.6 : 3.4 });
  if (!heightAt) return trees;
  // Broadleaf thinned, so the hills show through the gaps.
  const kept = kind === 'pine' ? trees : trees.filter(() => rng() < TREES_ON_LAND_KEEP);
  for (const tree of kept) tree.y = heightAt(tree.x, tree.z) - 0.1;
  const hills = TREES_HILL_WOODS[place] ? treesOnHills(place, spec, rng, heightAt, TREES_HILL_WOODS[place]) : [];
  return [...kept, ...hills];
}

function treesBuild({ place, view, spec, rng }) {
  if (spec.trees.kind === 'none') return null;
  const group = new THREE.Group();
  const trees = treesPlan(place, spec, rng, treesLandOf(view, place));
  const shapes = treesShapes(spec, rng, view);
  const cards = treesCards(view, shapes);
  const near = trees.filter((tree) => !tree.hill && Math.hypot(tree.x, tree.z) < TREES_NEAR);
  const far = trees.filter((tree) => !near.includes(tree));
  treesInstance(group, cards.geometries, cards.material, far, { shadows: false });
  treesInstance(group, shapes, treesClumpedMaterial(), near);
  group.userData.treesCount = trees.length;
  return group;
}

/** Variants: { id, label, blurb, replaces: [tags], build({ place, view, spec, rng }) -> THREE.Group, apply?({ place, view, spec, group }) }. */
export const TREE_VARIANTS = [
  {
    id: 'trees-on-land',
    label: 'Trees on the land',
    blurb: 'Clumped trees near the fight, cards beyond 30 m, each standing on the land the foothills raise, and woods in clusters up the hills. List it after the land part.',
    replaces: ['trees'],
    build: treesBuild,
  },
];
