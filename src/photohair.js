// Hair for a photo face (photoface.js): grown out of the skin rather than set
// on it as a cap. Two parts:
//
//   the scalp, painted: the photo head's shader (photoface.js) colours the
//   scalp with strands in the hair's colour up to a soft, irregular hairline
//   (temples, a widow's peak or not, sideburns into stubble, the nape), its
//   density thinning at the edge; the crown thins and the hairline recedes
//   on an older man. photoScalp gives its numbers, scalpCover the same
//   coverage on the CPU (a crowd's heads, painted per vertex);
//
//   beards, cards: thin curved strips along the jaw and the lip over the
//   painted density, alpha-tested with one shared strand texture (made once,
//   on a canvas).
//
// The hair's volume is hairmass.js's. The drawn styles (face.js
// LOOK_OPTIONS.hairStyle) map onto lengths: crop (buzz, fade, cornrows:
// painted only), short, medium, long and tied.

/* global THREE */

export const PHOTO_HAIR = {
  // Beard cards: segments, lift off the skin at the root and the tip (of the head's radius).
  segments: 5,
  lift: [0.025, 0.07],
  // The scalp's painted hairline (atlas rows, from the crown), by length.
  hairline: { crop: 0.225, short: 0.215, medium: 0.205, long: 0.2, tied: 0.205 },
  nape: 0.64,
  sideburn: 0.5,
};

const STYLE_LENGTH = {
  buzz: 'crop', fade: 'crop', cornrows: 'crop', bald: 'bald',
  cleanShort: 'short', spiky: 'short',
  midLong: 'medium', dreads: 'medium',
  long: 'long', hime: 'long', ringlets: 'long',
  bun: 'tied', ponytail: 'tied', topknot: 'tied', ringletUpdo: 'tied', ringletPigtails: 'tied',
};
const hairSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The style's length class, and whether an older man's hair recedes and thins. */
export function hairLength(style) {
  return STYLE_LENGTH[style] ?? 'short';
}

/** The painted scalp's numbers for a style, sex and age (seeded variation: `random`). */
export function photoScalp(style, female, age, random) {
  const length = hairLength(style);
  if (length === 'bald') return { hairline: 0.2, temple: 0, sideburn: 0.5, nape: 0.64, density: 0, crown: 0, seed: random() * 50 };
  const balding = female ? 0 : Math.min(1, Math.max(0, (age - 38) / 32)) * (0.4 + 0.6 * random());
  return {
    hairline: PHOTO_HAIR.hairline[length] + 0.05 * balding + (random() - 0.5) * 0.01,
    temple: (female ? 0.008 : 0.02) + 0.06 * balding + 0.01 * random(),
    sideburn: female ? 0.44 : PHOTO_HAIR.sideburn + 0.03 * random(),
    nape: PHOTO_HAIR.nape + (length === 'crop' ? -0.03 : 0.02),
    density: length === 'crop' ? 0.8 : 1,
    crown: 0.8 * Math.max(0, balding - 0.3),
    seed: random() * 50,
  };
}

/** How much hair covers the scalp at an atlas place (no noise): the shader's coverage, for a crowd's painted heads. */
export function scalpCover(u, v, scalp) {
  const du = Math.abs(u - 0.5);
  const row = 1 - v;
  const front = scalp.hairline + scalp.temple * hairSmooth(0.03, 0.1, du) * (1 - hairSmooth(0.12, 0.16, du));
  const side = front + (scalp.sideburn - front) * hairSmooth(0.13, 0.2, du);
  const line = side + (scalp.nape - side) * hairSmooth(0.24, 0.32, du);
  const ear = hairSmooth(1, 0.6, Math.hypot((du - 0.258) / 0.035, (row - 0.48) / 0.09));
  const crown = 1 - scalp.crown * hairSmooth(0.16, 0, row);
  return hairSmooth(line + 0.012, line - 0.018, row) * (1 - ear) * crown * scalp.density;
}

/** The shader's version of scalpCover, with noise in the hairline and strands (photoface.js puts it in the face's shader). */
export const SCALP_GLSL = `
float faceNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(faceHash(i), faceHash(i + vec2(1.0, 0.0)), f.x), mix(faceHash(i + vec2(0.0, 1.0)), faceHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float faceScalp(vec2 uv) {
  float du = abs(uv.x - 0.5);
  float row = 1.0 - uv.y;
  float front = faceHairline + faceTemple * smoothstep(0.03, 0.1, du) * (1.0 - smoothstep(0.12, 0.16, du));
  float side = mix(front, faceSideburn, smoothstep(0.13, 0.2, du));
  float line = mix(side, faceHairNape, smoothstep(0.24, 0.32, du));
  line += (faceNoise(vec2(uv.x * 140.0, faceHairSeed)) - 0.5) * 0.022 + (faceNoise(vec2(uv.x * 600.0, faceHairSeed + 7.0)) - 0.5) * 0.008;
  float ear = smoothstep(1.0, 0.6, length(vec2((du - 0.258) / 0.035, (row - 0.48) / 0.09)));
  float crown = 1.0 - faceCrown * smoothstep(0.16, 0.0, row) * (0.6 + 0.4 * faceNoise(uv * vec2(300.0, 150.0)));
  // At the edge the hairs thin out one by one, not as a soft wash.
  float edge = smoothstep(line + 0.014, line - 0.02, row);
  float hairs = step(faceHash(floor(uv * vec2(1400.0, 700.0)) * 0.37 + faceHairSeed), edge * 1.15) * step(0.002, edge);
  return mix(hairs, 1.0, smoothstep(line - 0.01, line - 0.04, row)) * (1.0 - ear) * crown * faceHairDensity;
}`;

let strandAtlas = null;
/** The shared strand texture: four columns of strands, white on clear, ragged at their tips (multiplied by the hair's colour). */
export function strandTexture() {
  if (strandAtlas) return strandAtlas;
  const size = 256;
  const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const paint = canvas.getContext('2d');
  let seed = 11;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let column = 0; column < 4; column += 1) {
    const left = (column * size) / 4;
    for (let strand = 0; strand < 45; strand += 1) {
      const x = left + 4 + random() * (size / 4 - 8);
      const end = size * (0.55 + 0.45 * random());
      const tone = Math.round(150 + 105 * random());
      paint.strokeStyle = `rgba(${tone},${tone},${tone},${0.35 + 0.6 * random()})`;
      paint.lineWidth = 0.6 + 0.7 * random();
      paint.beginPath();
      paint.moveTo(x, 0);
      const wave = (random() - 0.5) * 5;
      paint.bezierCurveTo(x + wave, end * 0.33, x - wave, end * 0.66, x + wave * 0.5, end);
      paint.stroke();
    }
  }
  strandAtlas = new THREE.CanvasTexture(canvas);
  return strandAtlas;
}

/** A material for cards in a hair colour: alpha-tested (no sorting), both sides. */
function cardMaterial(colour) {
  const material = new THREE.MeshStandardMaterial({ color: colour, map: strandTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  return material;
}

/**
 * Cards along the head's surface: each from a root, `steps` along a direction field, a little off the skin, then (`hang`) down
 * free of it. `surface(direction)` is the head's surface point in a direction from its centre (local space).
 */
function cardStrip({ root, direction, length, width, hang = 0, surface, centre, random, steps = PHOTO_HAIR.segments, toward = null }) {
  const points = [];
  let p = root.clone();
  let d = direction.clone();
  const step = length / steps;
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    const lift = PHOTO_HAIR.lift[0] + (PHOTO_HAIR.lift[1] - PHOTO_HAIR.lift[0]) * t;
    const out = p.clone().sub(centre);
    const skin = surface(out.clone().normalize());
    const minimum = skin.clone().sub(centre).length() * (1 + lift);
    if (out.length() < minimum || t * length < length - hang) out.setLength(minimum);
    p = centre.clone().add(out);
    points.push(p.clone());
    // Along the scalp (tangent to it), bending down where it hangs, or towards a tie.
    const normal = out.clone().normalize();
    if (toward) d.lerp(toward.clone().sub(p).normalize(), 0.5);
    if (hang && t * length > length - hang) d.lerp(new THREE.Vector3(0, -1, 0), 0.45);
    d.addScaledVector(normal, -d.dot(normal) * (hang && t * length > length - hang ? 0.2 : 1)).normalize();
    d.x += (random() - 0.5) * 0.15;
    d.z += (random() - 0.5) * 0.15;
    d.normalize();
    p.addScaledVector(d, step);
  }
  const positions = [];
  const uvs = [];
  const column = Math.floor(random() * 4);
  points.forEach((point, k) => {
    const t = k / steps;
    const ahead = points[Math.min(steps, k + 1)].clone().sub(points[Math.max(0, k - 1)]).normalize();
    const normal = point.clone().sub(centre).normalize();
    const across = new THREE.Vector3().crossVectors(ahead, normal).normalize().multiplyScalar(width * (1 - 0.45 * t) * 0.5);
    positions.push(...point.clone().sub(across).toArray(), ...point.clone().add(across).toArray());
    uvs.push(column / 4 + 0.01, t, (column + 1) / 4 - 0.01, t);
  });
  const indices = [];
  for (let k = 0; k < steps; k += 1) {
    const a = k * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  return { positions, uvs, indices };
}

function mergeStrips(strips) {
  const positions = [];
  const uvs = [];
  const indices = [];
  for (const strip of strips) {
    const base = positions.length / 3;
    positions.push(...strip.positions);
    uvs.push(...strip.uvs);
    indices.push(...strip.indices.map((index) => index + base));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A beard's cards for a photo head: `group` gets them (tagged userData.photoBeard, so a closed helmet can hide them). `head`:
 * photohead.js's mesh arrays (positions, uvs) and `point`; `r`: the head's radius; `facialHair`, `colour`. Returns the triangles.
 */
export function buildPhotoBeard({ group, head, r, facialHair = 'none', colour, random, coarse = false }) {
  const centre = new THREE.Vector3(0, 0.05 * r, 0);
  const surface = (direction) => new THREE.Vector3(...head.point(direction.x, direction.y, direction.z)).multiplyScalar(r);
  const vertices = head.positions.length / 3;
  const at = (index) => new THREE.Vector3(head.positions[index * 3], head.positions[index * 3 + 1], head.positions[index * 3 + 2]);
  const rowOf = (index) => 1 - head.uvs[index * 2 + 1];
  const duOf = (index) => Math.abs(head.uvs[index * 2] - 0.5);
  let triangles = 0;
  const add = (strips, material, tag) => {
    if (!strips.length) return;
    const mesh = new THREE.Mesh(mergeStrips(strips), material);
    mesh.userData[tag] = true;
    mesh.castShadow = true;
    group.add(mesh);
    triangles += strips.length * PHOTO_HAIR.segments * 2;
  };
  // Beards: short cards down along the jaw and chin, a moustache's over the lip (the density is painted under them).
  if (!coarse && (facialHair === 'beard' || facialHair === 'longBeard' || facialHair === 'mustache' || facialHair === 'handlebar')) {
    const beard = [];
    const lip = facialHair !== 'beard' && facialHair !== 'longBeard';
    for (let index = 0; index < vertices; index += 1) {
      const row = rowOf(index);
      const du = duOf(index);
      const inBeard = !lip && row > 0.73 && row < 0.95 && du < 0.16 && !(row < 0.75 && du < 0.04);
      const inLip = row > 0.655 && row < 0.69 && du < (facialHair === 'handlebar' ? 0.06 : 0.045);
      if (!(inBeard || inLip) || random() > 0.35) continue;
      const root = at(index);
      const normal = root.clone().sub(centre).normalize();
      const down = new THREE.Vector3(0, -1, 0).addScaledVector(normal, 0.25).normalize();
      beard.push(cardStrip({ root, direction: down, length: (inLip ? 0.08 : facialHair === 'longBeard' ? 0.5 : 0.16) * r, width: 0.06 * r, surface, centre, random, steps: 3 }));
    }
    const beardMaterial = cardMaterial(colour);
    add(beard, beardMaterial, 'photoBeard');
  }
  return triangles;
}
