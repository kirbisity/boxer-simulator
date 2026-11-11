// Hair for photo faces (photoface.js): each style built from its own shape
// (HAIR_STYLES), read from the real cut, so no two read alike at a glance:
//
//   a cap: one smooth surface over the scalp, from the crown to where the
//   hair leaves it (hairProfile: for each column round the head, the path
//   the hair takes), as thick as the style is full, thinning to its edge; a
//   fade's or a topknot's stops short of the shaved sides (the painted
//   scalp, photohair.js, shows the stubble below it);
//
//   a hang: the same surface carried on down from the hairline to where it is
//   cut: a hime's blunt fringe at the brow and side locks at the chin, a bob
//   to the jaw, long hair over the shoulders to the shoulder blades;
//
//   parts: what is not one surface: spikes, cornrows (braids along the scalp
//   in rows), a bun or topknot (a knot), a ponytail's tail, dreads (ropes over
//   the scalp hanging free), ringlets (tight spirals hanging from the head or
//   from pigtails' ties, or piled up in an updo).
//
// What hangs free swings: every hanging part is bound to a chain (hairswing.js:
// a ring of chains round the head for the hang, one chain for each tail, rope
// and ringlet), each vertex to its chain(s) and how far down it is. Everything
// is drawn with one strand texture and a sheen along the strands; a cap and
// hang in one alpha-tested mesh (ragged, or blunt, tips), the parts in one
// opaque mesh. Under a helmet (buildHairRim) only what hangs below its rim at
// the back is kept, sharing the hair's vertices (it swings the same).
// (The mass over painted scalp was picked in the pilot over dense layered
// cards, a mass with cards over it, and tube clumps.)

/* global THREE */

export const HAIR_MASS = {
  // Columns round the head (a column a 6.4° slice: enough for a smooth silhouette at a portrait's size) and rows over the
  // scalp and down the hang (a hang to the shoulder blades in 16 rows, 2.5 cm each: it bends smoothly as it swings).
  columns: 56,
  scalpRows: 12,
  hangRows: 16,
  // Chains for the hang: one each 7 columns (8 round the head, 45° apart: the swing is a few broad waves, not strand by strand).
  chainEvery: 7,
  // A hang needs this much below the hairline to swing (of r): a fringe's 3 cm does not.
  shortest: 0.3,
  // Nodes in a chain (the hang's, a tail's, a rope's, a ringlet's): five links bend in a curve, not a hinge.
  nodes: 6,
  // The hang's strands gather in clumps: each column pushed in or out this much at the tips (of r), so the hang's edge and
  // surface are broken, not a smooth shell.
  clump: 0.05,
  // Uncut (not blunt) hair ends unevenly: each column's length varies by this share of how far it hangs.
  ragged: 0.08,
  // The sheen along the strands (Kajiya-Kay, two lobes): a white primary, a tinted secondary, their widths (higher: tighter).
  sheen: { primary: 0.18, secondary: 0.12, width: [90, 24] },
  // Under a helmet: kept only below this (of r: under the rim of an open helmet's neck guard) and behind this (behind the
  // ears: a cheek plate or a closed face covers the sides).
  rim: { below: -0.62, behind: -0.2 },
};

/**
 * Each style's shape (lengths of the head's radius r, heights from the head's centre, down negative; angles in radians):
 *   cap: `crown` thickness over the crown thinning to `edge` at the hairline; `top`, the lowest polar angle it reaches
 *        (the shaved sides of a fade or a topknot below it); none: painted only (a buzz, cornrows).
 *   hang: how far down it is cut at the front (`fringe`, null: the face left open), sides and back; `blunt` (cut straight)
 *        or ragged; `drape`: how far the long hair below the jaw falls back behind the shoulders; `curl`: a bob's tips turned
 *        under; `swing`: its chains' stiffness and damping (hairswing.js).
 *   parts: what else is drawn (see buildParts).
 */
export const HAIR_STYLES = {
  // Short, cut close at the sides, the top in stiff spikes standing up and back.
  spiky: { cap: { crown: 0.05, edge: 0.02 }, parts: [{ kind: 'spikes', count: 26, length: 0.34 }] },
  // A short back and sides: full on top, tapered to almost nothing over the ears and nape.
  cleanShort: { cap: { crown: 0.075, edge: 0.018 } },
  // A fade: a raised flat top over sides shaved to stubble (the cap ends 60° down from the crown; the stubble is painted).
  fade: { cap: { crown: 0.18, edge: 0.02, top: 1.05 } },
  // Clipped to the scalp: the painted stubble alone.
  buzz: {},
  // Braids lying flat in rows from the hairline back over the crown to the nape, the scalp painted between them.
  cornrows: { parts: [{ kind: 'cornrows', rows: 9 }] },
  // Hair drawn back tight into a bun (high on the crown or low at the nape: seeded per head).
  bun: { cap: { crown: 0.04, edge: 0.02 }, parts: [{ kind: 'bun' }] },
  // Drawn back tight to a tie at the back of the crown, the tail hanging to the shoulder blades and swinging.
  ponytail: { cap: { crown: 0.04, edge: 0.02 }, parts: [{ kind: 'tail', length: 2.6, radius: 0.24 }] },
  // A bob to the jaw: a side-swept fringe, the ends turned under; short, so it bounces rather than swings.
  midLong: {
    cap: { crown: 0.085, edge: 0.05 },
    hang: { fringe: 0.32, sides: -0.82, back: -0.95, curl: 0.12, swing: { stiffness: 0.2, damping: 0.08 } },
  },
  // Long, parted, falling past the face and over the shoulders to the shoulder blades.
  long: {
    cap: { crown: 0.09, edge: 0.05 },
    hang: { fringe: null, sides: -2.5, back: -3.7, drape: 0.55, swing: { stiffness: 0.07, damping: 0.04 } },
  },
  // Locs: ropes over the scalp, hanging free to the shoulders, heavy.
  dreads: { cap: { crown: 0.035, edge: 0.02 }, parts: [{ kind: 'ropes', count: 20, length: 1.9, radius: 0.065 }] },
  // A small knot on the very top of the head, the sides cut short (the cap only over the top).
  topknot: { cap: { crown: 0.04, edge: 0.02, top: 1.25 }, parts: [{ kind: 'topknot' }] },
  // Two bunches of ringlets tied high at the sides, a blunt fringe.
  ringletPigtails: {
    cap: { crown: 0.05, edge: 0.03 },
    hang: { fringe: 0.24, sides: null, back: null, blunt: true },
    parts: [{ kind: 'pigtails', each: 4, length: 1.9 }],
  },
  // Long ringlets all round the sides and back, from a full crown.
  ringlets: {
    cap: { crown: 0.08, edge: 0.05 },
    parts: [{ kind: 'ringlets', count: 11, length: 2.2 }],
  },
  // Curls piled up on the crown, a ringlet left hanging at each temple.
  ringletUpdo: { cap: { crown: 0.06, edge: 0.03 }, parts: [{ kind: 'updo', curls: 8 }, { kind: 'temples', length: 1.2 }] },
  // The hime cut: a blunt fringe at the brow, side locks cut straight at the chin, the rest straight to the shoulder blades.
  hime: {
    cap: { crown: 0.075, edge: 0.05 },
    hang: { fringe: 0.2, sides: -1.05, back: -3.8, blunt: true, drape: 0.4, swing: { stiffness: 0.1, damping: 0.05 } },
  },
  bald: {},
};

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the hair leaves the scalp (polar angle from the crown), by azimuth from the face: the hairline, lifted over the ears. */
function hairLeavePolar(azimuth) {
  const f = Math.abs(azimuth) / Math.PI;
  return 0.95 + 1.2 * smooth(0.05, 0.95, f) - 0.28 * Math.exp(-(((Math.abs(azimuth) - 1.6) / 0.35) ** 2));
}

/**
 * How far down the hair hangs at an azimuth (a height, of r), or null where it ends at the hairline. Front (the fringe)
 * within 0.6 rad of the face, the sides to 1.45 rad (behind the ear), the back beyond; blunt cuts step, others blend.
 */
function hangEnd(hang, azimuth) {
  const a = Math.abs(azimuth);
  if (hang.blunt) return a < 0.62 ? hang.fringe : a < 1.45 ? hang.sides : hang.back;
  if (hang.fringe === null && a < 0.62) return null;
  const front = hang.fringe === null ? 0 : 1 - smooth(0.45, 0.75, a);
  const back = smooth(1.35, 1.9, a);
  return (hang.fringe ?? 0) * front + hang.sides * (1 - front) * (1 - back) + hang.back * back;
}

const lengthsOf = (points) => {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
  return lengths;
};
const tangentsOf = (points) => points.map((_, i) => points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize());

/**
 * The style's columns: for each azimuth, points from the crown over the scalp to the hairline and (hanging) down to the cut,
 * in the head's local space, with the length along them (`along`, 0..1), their directions (`tangents`) and the length over
 * the scalp (`scalpLength`: what lies below it hangs). `surface(direction)`: the head's surface. Null for a style with no cap.
 */
export function hairProfile({ style, surface, r, columns = HAIR_MASS.columns, random = Math.random }) {
  const shape = HAIR_STYLES[style];
  if (!shape?.cap) return null;
  const { cap, hang } = shape;
  const centre = new THREE.Vector3(0, 0.05 * r, 0);
  const out = [];
  for (let column = 0; column < columns; column += 1) {
    const azimuth = -Math.PI + ((column + 0.5) / columns) * Math.PI * 2;
    const leave = Math.min(hairLeavePolar(azimuth), cap.top ?? Infinity);
    const side = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
    const points = [];
    for (let row = 0; row <= HAIR_MASS.scalpRows; row += 1) {
      const polar = 0.03 + ((leave - 0.03) * row) / HAIR_MASS.scalpRows;
      const skin = surface(new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)));
      const radial = skin.clone().sub(centre);
      // Thick over the crown, thinning to the edge (a fade's cap down to nothing, so it meets the painted stubble).
      const thickness = (cap.edge + (cap.crown - cap.edge) * (1 - smooth(0, 1, polar / leave))) * r;
      points.push(centre.clone().add(radial.setLength(radial.length() + thickness)));
    }
    const scalpLength = lengthsOf(points).at(-1);
    let end = hang ? hangEnd(hang, azimuth) : null;
    const from = points[points.length - 1];
    if (end !== null && end !== undefined) end = (end - (hang.blunt ? 0 : HAIR_MASS.ragged * Math.abs(end) * random())) * r;
    if (end !== null && end !== undefined && end < from.y - 0.05 * r) {
      // The clump this column falls in: pushed out or in, more towards the tips.
      const clump = (random() - 0.5) * 2 * HAIR_MASS.clump * r * (hang.blunt ? 0.4 : 1);
      // How much of this column is at the side (the drape takes the side hair back behind the shoulder, not the back's).
      const sideness = Math.abs(Math.sin(azimuth));
      let last = from.clone();
      for (let row = 1; row <= HAIR_MASS.hangRows; row += 1) {
        const t = row / HAIR_MASS.hangRows;
        const y = from.y + (end - from.y) * t;
        const point = new THREE.Vector3();
        if (y > -1.05 * r) {
          // Beside the head: just off the skin (the hair's volume, flaring a little as it falls).
          const polar = Math.acos(Math.max(-1, Math.min(1, y / (1.06 * r))));
          const skin = surface(new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)));
          const radial = new THREE.Vector3(skin.x, 0, skin.z);
          const reach = Math.max(radial.length() + cap.edge * r * 0.8 + 0.06 * r * t, Math.hypot(last.x, last.z) * (Math.abs(azimuth) < 0.62 ? 0.92 : 0.99));
          point.set(0, y, 0).add(radial.setLength(reach));
        } else {
          // Below the head: straight down from where it left the head, the side hair falling back over the shoulder.
          const below = -1.05 * r - y;
          const flat = new THREE.Vector3(last.x, 0, last.z);
          point.set(0, y, 0).add(flat.setLength(flat.length() + 0.01 * r));
          if (hang.drape) point.addScaledVector(new THREE.Vector3(-1, 0, 0), hang.drape * sideness * Math.min(below, 0.25 * r) * 0.9);
          if (hang.drape) point.addScaledVector(side, 0.04 * r * Math.min(1, below / r));
        }
        point.addScaledVector(side, clump * t);
        // A bob's tips turned under, towards the neck.
        if (hang.curl && t > 0.75) point.addScaledVector(side, -hang.curl * r * ((t - 0.75) / 0.25) ** 2);
        points.push(point);
        last = point;
      }
    }
    const lengths = lengthsOf(points);
    const total = lengths.at(-1) || 1;
    out.push({ azimuth, points, along: lengths.map((l) => l / total), total, scalpLength, tangents: tangentsOf(points), hangs: points.length > HAIR_MASS.scalpRows + 1 });
  }
  return { shape, columns: out, centre };
}

// ---- Textures (shared, made once on canvases) ----------------------------------------------------------------------------------

const hairTextures = {};
function hairCanvas(name, draw) {
  if (hairTextures[name]) return hairTextures[name];
  const canvas = Object.assign(document.createElement('canvas'), { width: 256, height: 256 });
  const paint = canvas.getContext('2d');
  let seed = name.length * 977 + 13;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  draw(paint, random);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  hairTextures[name] = texture;
  return texture;
}

/** A mass of hair: streaks over a solid base, the tips ragged (or cut straight). */
function massSheet(blunt) {
  return hairCanvas(blunt ? 'massBlunt' : 'mass', (paint, random) => {
    const tip = blunt ? 0.985 : 0.82;
    for (let x = 0; x < 256; x += 1) {
      const end = 256 * (tip + (1 - tip) * random());
      const tone = Math.round(170 + 60 * random());
      paint.fillStyle = `rgb(${tone},${tone},${tone})`;
      paint.fillRect(x, 0, 1, end);
    }
    for (let strand = 0; strand < 140; strand += 1) {
      const x = random() * 256;
      const tone = Math.round(random() < 0.5 ? 120 + 40 * random() : 230 + 25 * random());
      paint.strokeStyle = `rgba(${tone},${tone},${tone},${0.35 + 0.4 * random()})`;
      paint.lineWidth = 0.6 + random();
      paint.beginPath();
      paint.moveTo(x, 0);
      paint.lineTo(x + (random() - 0.5) * 6, 256 * (blunt ? 0.98 : 0.8 + 0.2 * random()));
      paint.stroke();
    }
  });
}

/** Strands for the parts (tubes, knots): streaks the full height, repeating both ways. */
function strandSheet() {
  return hairCanvas('strands', (paint, random) => {
    for (let x = 0; x < 256; x += 1) {
      const tone = Math.round(150 + 80 * random());
      paint.fillStyle = `rgb(${tone},${tone},${tone})`;
      paint.fillRect(x, 0, 1, 256);
    }
    for (let strand = 0; strand < 160; strand += 1) {
      const x = random() * 256;
      const tone = Math.round(random() < 0.5 ? 90 + 40 * random() : 230 + 25 * random());
      paint.strokeStyle = `rgba(${tone},${tone},${tone},${0.3 + 0.4 * random()})`;
      paint.lineWidth = 0.6 + random();
      paint.beginPath();
      paint.moveTo(x, 0);
      paint.lineTo(x + (random() - 0.5) * 4, 256);
      paint.stroke();
    }
  });
}

// ---- The material: a lit hair surface with a sheen along its strands (Kajiya-Kay, two lobes) --------------------------------

function sheenMaterial(colour, map, { alphaTest = 0 } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: colour, map, alphaTest, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
  const { primary, secondary, width } = HAIR_MASS.sheen;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 hairTangent;\nvarying vec3 vHairTangent;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHairTangent = normalize( mat3( modelViewMatrix ) * hairTangent );');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vHairTangent;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
#if NUM_DIR_LIGHTS > 0
{
	vec3 strandT = normalize( vHairTangent );
	vec3 halfway = normalize( directionalLights[ 0 ].direction + geometry.viewDir );
	float c1 = dot( strandT, halfway );
	float c2 = dot( normalize( strandT + geometry.normal * 0.2 ), halfway );
	float lit = clamp( dot( geometry.normal, directionalLights[ 0 ].direction ) * 0.5 + 0.5, 0.0, 1.0 );
	reflectedLight.directSpecular += directionalLights[ 0 ].color * lit * ( ${primary.toFixed(3)} * pow( sqrt( max( 0.0, 1.0 - c1 * c1 ) ), ${width[0].toFixed(1)} ) + ${secondary.toFixed(3)} * pow( sqrt( max( 0.0, 1.0 - c2 * c2 ) ), ${width[1].toFixed(1)} ) * diffuseColor.rgb );
}
#endif`);
  };
  material.customProgramCacheKey = () => 'photohair-sheen';
  return material;
}

// ---- Geometry: one builder a mesh, every vertex with its strand direction and its swing binding --------------------------------

/**
 * A mesh being built: positions, uvs, strand tangents, indices, and for each vertex its swing (chain a, chain b, b's share,
 * how far down the chain: below 0, it does not move).
 */
function hairSheet() {
  const sheet = { positions: [], uvs: [], tangents: [], swing: [], indices: [] };
  sheet.vertex = (point, u, v, tangent, bind = NO_SWING) => {
    sheet.positions.push(point.x, point.y, point.z);
    sheet.uvs.push(u, v);
    sheet.tangents.push(tangent.x, tangent.y, tangent.z);
    sheet.swing.push(...bind);
    return sheet.positions.length / 3 - 1;
  };
  sheet.geometry = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(sheet.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(sheet.uvs, 2));
    geometry.setAttribute('hairTangent', new THREE.Float32BufferAttribute(sheet.tangents, 3));
    geometry.setIndex(sheet.indices);
    geometry.computeVertexNormals();
    geometry.userData.swing = Float32Array.from(sheet.swing);
    return geometry;
  };
  return sheet;
}
const NO_SWING = [0, 0, 0, -1];

/** A column resampled to `count` points by its length along, with each point's length below the hairline. */
function resampleColumn(column, count) {
  const points = [];
  const tangents = [];
  const below = [];
  for (let k = 0; k < count; k += 1) {
    const want = k / (count - 1);
    let i = 1;
    while (i < column.along.length - 1 && column.along[i] < want) i += 1;
    const a = column.along[i - 1];
    const b = column.along[i];
    const f = b > a ? Math.min(1, Math.max(0, (want - a) / (b - a))) : 0;
    points.push(column.points[i - 1].clone().lerp(column.points[i], f));
    tangents.push(column.tangents[i - 1].clone().lerp(column.tangents[i], f).normalize());
    below.push(want * column.total - column.scalpLength);
  }
  return { points, tangents, below };
}

/** Points along a polyline resampled evenly to `count`. */
function resamplePath(path, count) {
  const lengths = lengthsOf(path);
  const total = lengths.at(-1);
  const out = [];
  for (let k = 0; k < count; k += 1) {
    const want = (k / (count - 1)) * total;
    let i = 1;
    while (i < path.length - 1 && lengths[i] < want) i += 1;
    const f = lengths[i] > lengths[i - 1] ? Math.min(1, (want - lengths[i - 1]) / (lengths[i] - lengths[i - 1])) : 0;
    out.push(path[i - 1].clone().lerp(path[i], f));
  }
  return out;
}

/**
 * The cap and hang: one surface over the columns (around, and down each to its cut). The hang's chains are the columns every
 * `chainEvery` (each from its hairline down, as long as it hangs); a vertex follows the two either side of its column.
 */
function capAndHang(profile, chains, r) {
  const columns = profile.columns;
  // A cap alone (nothing hangs) has the scalp's rows only: half the triangles of one that hangs.
  const rows = HAIR_MASS.scalpRows + (columns.some((column) => column.hangs) ? HAIR_MASS.hangRows : 0) + 1;
  const sheet = hairSheet();
  const every = HAIR_MASS.chainEvery;
  const sectors = Math.ceil(columns.length / every);
  // The ring of chains (null where the hair does not hang far enough to swing).
  const swing = profile.shape.hang?.swing ?? {};
  const ring = [];
  for (let sector = 0; sector < sectors; sector += 1) {
    const column = columns[sector * every];
    const hanging = column.points.slice(HAIR_MASS.scalpRows);
    if (!column.hangs || column.total - column.scalpLength < HAIR_MASS.shortest * r) {
      ring.push(-1);
      continue;
    }
    ring.push(chains.length);
    chains.push({ rest: resamplePath(hanging, HAIR_MASS.nodes), ring: true, ...swing });
  }
  const repeat = 6;
  columns.forEach((column, c) => {
    const { points, tangents, below } = resampleColumn(column, rows);
    // The two chains either side of this column and the far one's share (a missing one: the near one alone).
    const sector = Math.floor(c / every);
    let a = ring[sector];
    let b = ring[(sector + 1) % sectors];
    let share = (c - sector * every) / every;
    if (a < 0) [a, share] = [b, 1];
    if (b < 0) [b, share] = [a, 0];
    points.forEach((point, k) => {
      const bind = a < 0 || below[k] <= 0 ? NO_SWING : [a, b, share, below[k]];
      sheet.vertex(point, (c / columns.length) * repeat, 1 - k / (rows - 1), tangents[k], bind);
    });
  });
  for (let c = 0; c < columns.length; c += 1) {
    const next = (c + 1) % columns.length;
    for (let k = 0; k < rows - 1; k += 1) {
      const a = c * rows + k;
      const b = next * rows + k;
      sheet.indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return sheet;
}

/**
 * A tube along `path` (local points), its radius `radius(t)` (t 0..1 along), `sides` round; flattened to `flat` of its
 * width across `up` (a braid lying on the scalp). `bind(t)`: each ring's swing binding. Frames carried along (no twist).
 */
function addTube(sheet, path, { radius, sides = 6, bind = () => NO_SWING, up = null, flat = 1, v = 1 }) {
  const tangents = tangentsOf(path);
  const lengths = lengthsOf(path);
  const total = lengths.at(-1) || 1;
  let normal = up ? up.clone() : new THREE.Vector3(0, 0, 1);
  if (Math.abs(normal.dot(tangents[0])) > 0.95) normal = new THREE.Vector3(1, 0, 0);
  const base = sheet.positions.length / 3;
  path.forEach((point, k) => {
    const t = lengths[k] / total;
    const along = tangents[k];
    normal.addScaledVector(along, -normal.dot(along)).normalize();
    const across = new THREE.Vector3().crossVectors(along, normal);
    const size = radius(t);
    const binding = bind(t, k);
    for (let side = 0; side <= sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2;
      const p = point.clone().addScaledVector(across, Math.cos(angle) * size).addScaledVector(normal, Math.sin(angle) * size * flat);
      sheet.vertex(p, side / sides, t * v, along, binding);
    }
  });
  const ring = sides + 1;
  for (let k = 0; k < path.length - 1; k += 1) {
    for (let side = 0; side < sides; side += 1) {
      const a = base + k * ring + side;
      sheet.indices.push(a, a + ring, a + 1, a + 1, a + ring, a + ring + 1);
    }
  }
}

/** An ellipsoid (a knot, a bun, a curl): `radii` along its own axes, `facing` its x; strands round it. */
function addKnot(sheet, centre, radii, { segments = 12, rings = 8, facing = null } = {}) {
  const base = sheet.positions.length / 3;
  const rotate = new THREE.Quaternion();
  if (facing) rotate.setFromUnitVectors(new THREE.Vector3(1, 0, 0), facing.clone().normalize());
  for (let ring = 0; ring <= rings; ring += 1) {
    const polar = (ring / rings) * Math.PI;
    for (let segment = 0; segment <= segments; segment += 1) {
      const azimuth = (segment / segments) * Math.PI * 2;
      const local = new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth) * radii[0], Math.cos(polar) * radii[1], Math.sin(polar) * Math.sin(azimuth) * radii[2]);
      const tangent = new THREE.Vector3(-Math.sin(azimuth), 0, Math.cos(azimuth)).applyQuaternion(rotate);
      sheet.vertex(centre.clone().add(local.applyQuaternion(rotate)), segment / segments * 2, ring / rings, tangent);
    }
  }
  const row = segments + 1;
  for (let ring = 0; ring < rings; ring += 1) {
    for (let segment = 0; segment < segments; segment += 1) {
      const a = base + ring * row + segment;
      sheet.indices.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
}

/** A chain for a hanging part (local rest points, root first) and the binding of a point `down` along it. */
function partChain(chains, path, swing) {
  const index = chains.length;
  const rest = resamplePath(path, HAIR_MASS.nodes);
  chains.push({ rest, ...swing });
  return (down) => [index, index, 0, down];
}

/** A ringlet: a tight spiral round an axis hung from `root` (local), `length` long, `turns` a head radius; its own chain. */
function addRinglet(sheet, chains, root, { length, r, random, outward = null, swing }) {
  const axis = [];
  const steps = 6;
  const drift = outward ? outward.clone().setY(0).normalize() : new THREE.Vector3();
  for (let k = 0; k <= steps; k += 1) {
    const t = k / steps;
    // Hangs straight down, drifting a little out from the head as it falls (the curls stand off one another).
    axis.push(root.clone().add(new THREE.Vector3(0, -length * t, 0)).addScaledVector(drift, 0.15 * r * Math.sin(t * Math.PI * 0.5)));
  }
  const bind = partChain(chains, axis, swing);
  // The spiral: 0.34 r a turn (tight Victorian curls, 3.5 cm), 5 points a turn, round the axis at 0.06 r opening to 0.11 r,
  // the strand 0.055 r thick tapering to 0.035 r.
  const pitch = 0.34 * r;
  const perTurn = 5;
  const count = Math.max(8, Math.round((length / pitch) * perTurn));
  const phase = random() * Math.PI * 2;
  const spiral = [];
  const downs = [];
  for (let k = 0; k <= count; k += 1) {
    const t = k / count;
    const centre = axis[0].clone().lerp(axis.at(-1), t).addScaledVector(drift, 0.15 * r * Math.sin(t * Math.PI * 0.5));
    const angle = phase + (t * length / pitch) * Math.PI * 2;
    // The spiral widens towards the end (a ringlet opens as it falls).
    const wide = (0.06 + 0.05 * t) * r * Math.min(1, t * 6);
    spiral.push(centre.add(new THREE.Vector3(Math.cos(angle) * wide, 0, Math.sin(angle) * wide)));
    downs.push(t * length);
  }
  addTube(sheet, spiral, { radius: (t) => (0.055 - 0.02 * t) * r, sides: 5, bind: (t, k) => bind(downs[k]), v: length / r });
}

/** A point on the head's surface by polar angle and azimuth, lifted `lift` (of r) off it, and the outward direction there. */
function scalpAt(surface, centre, polar, azimuth, lift, r) {
  const direction = new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth));
  const skin = surface(direction);
  const out = skin.clone().sub(centre);
  const normal = out.clone().normalize();
  return { point: centre.clone().add(out.setLength(out.length() + lift * r)), normal };
}

/** The style's parts into `sheet`, their chains into `chains`. */
function buildParts(shape, sheet, chains, { surface, centre, r, random }) {
  const at = (polar, azimuth, lift = 0) => scalpAt(surface, centre, polar, azimuth, lift, r);
  for (const part of shape.parts ?? []) {
    if (part.kind === 'spikes') {
      // Stiff tufts over the top and front (polar under 1.15 rad, not over the ears or nape), standing out and leaning
      // up and back; four-sided cones (4 triangles each), 0.08 r at the root.
      for (let k = 0; k < part.count; k += 1) {
        const polar = 0.08 + 1.05 * Math.sqrt(random());
        const azimuth = (random() - 0.5) * 2 * Math.PI * (polar < 0.5 ? 1 : 0.75);
        const { point, normal } = at(polar, azimuth, (shape.cap?.crown ?? 0) * 0.4);
        const direction = normal.clone().add(new THREE.Vector3(-0.25, 0.45, 0)).normalize();
        const length = part.length * r * (0.7 + 0.5 * random());
        const tip = point.clone().addScaledVector(direction, length);
        const across = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1)).normalize();
        const other = new THREE.Vector3().crossVectors(direction, across).normalize();
        const base = sheet.positions.length / 3;
        for (let side = 0; side < 4; side += 1) {
          const angle = (side / 4) * Math.PI * 2 + random();
          sheet.vertex(point.clone().addScaledVector(across, Math.cos(angle) * 0.085 * r).addScaledVector(other, Math.sin(angle) * 0.085 * r), side / 4, 0, direction);
        }
        const tipIndex = sheet.vertex(tip, 0.5, 1, direction);
        for (let side = 0; side < 4; side += 1) sheet.indices.push(base + side, base + ((side + 1) % 4), tipIndex);
      }
    } else if (part.kind === 'cornrows') {
      // Braids from the hairline over the crown to the nape, side by side across the head, each in its own plane
      // (sideways `across`, 0.7 at the outermost: above the ears), a tube flattened against the scalp, bulging and
      // pinching along its length as the plaits cross (every 0.18 r).
      for (let row = 0; row < part.rows; row += 1) {
        const across = ((row + 0.5) / part.rows - 0.5) * 2 * 0.7;
        const flat = Math.sqrt(1 - across * across);
        const path = [];
        // From over the brow (0.95 rad forward of the crown, less at the sides, the hairline being further back there) to the
        // nape (2.05 rad behind).
        const front = 0.95 - 0.35 * across * across;
        for (let k = 0; k <= 20; k += 1) {
          const sweep = front - ((front + 2.05) * k) / 20;
          const direction = new THREE.Vector3(Math.sin(sweep) * flat, Math.cos(sweep) * flat, across);
          path.push(centre.clone().add(surface(direction).sub(centre).multiplyScalar(1.015)));
        }
        const length = lengthsOf(path).at(-1);
        addTube(sheet, path, {
          radius: (t) => 0.06 * r * (0.7 + 0.3 * Math.abs(Math.sin((t * length) / (0.18 * r) * Math.PI))),
          sides: 6,
          flat: 0.55,
          up: path[10].clone().sub(centre).normalize(),
          v: length / r,
        });
      }
    } else if (part.kind === 'bun' || part.kind === 'topknot') {
      // A bun: high on the back of the crown or low at the nape (seeded), 0.3 r; a topknot: small, upright on the crown.
      const top = part.kind === 'topknot';
      const high = top || random() < 0.5;
      const polar = top ? 0.12 : high ? 0.75 : 1.85;
      const size = top ? 0.19 : 0.31;
      const { point, normal } = at(polar, Math.PI, 0);
      const centreOf = point.clone().addScaledVector(normal, size * r * 0.75);
      addKnot(sheet, centreOf, top ? [size * r, size * r * 1.15, size * r] : [size * r, size * r * 0.92, size * r * 1.05], { facing: normal });
      // The hair round its base: a band of twisted hair (a flattened ring).
      addKnot(sheet, point.clone().addScaledVector(normal, 0.02 * r), [0.05 * r, size * r * 0.85, size * r * 0.85], { segments: 10, rings: 4, facing: normal });
    } else if (part.kind === 'tail') {
      // A ponytail: tied at the back of the crown, out over the back of the skull, then hanging down the back, thick at the
      // tie and tapering to a brush; its own chain from just below the tie.
      const tie = at(1.2, Math.PI, 0.02);
      addKnot(sheet, tie.point.clone().addScaledVector(tie.normal, 0.06 * r), [0.08 * r, 0.15 * r, 0.15 * r], { segments: 10, rings: 5, facing: tie.normal });
      const start = tie.point.clone().addScaledVector(tie.normal, 0.14 * r);
      const path = [start];
      const out = tie.normal.clone().setY(0).normalize();
      for (let k = 1; k <= 12; k += 1) {
        const t = k / 12;
        const down = part.length * r * t;
        // Arcing out over the skull's back (0.25 r) and in again as it falls past the nape.
        path.push(start.clone().add(new THREE.Vector3(0, -down, 0)).addScaledVector(out, 0.28 * r * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5) - 0.12 * r * t));
      }
      const lengths = lengthsOf(path);
      const bind = partChain(chains, path, { stiffness: 0.08, damping: 0.03 });
      const tube = path.map((p, k) => ({ p, down: lengths[k] }));
      addTube(sheet, tube.map((entry) => entry.p), {
        radius: (t) => part.radius * r * (0.75 + 0.6 * Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) - 0.95 * t * t),
        sides: 8,
        flat: 0.75,
        bind: (t, k) => bind(tube[k].down),
        v: part.length,
      });
    } else if (part.kind === 'ropes') {
      // Locs: each rooted over the crown, lying along the scalp down to the hairline behind or beside the head, then hanging
      // free (to the shoulders behind, the jaw beside the face). The front ones are swept back off the face.
      for (let k = 0; k < part.count; k += 1) {
        const azimuth = (k % 2 ? 1 : -1) * (0.95 + (Math.PI - 0.95) * (Math.floor(k / 2) / (part.count / 2 - 1)) + (random() - 0.5) * 0.12);
        const rootPolar = 0.2 + 0.6 * random();
        const leave = hairLeavePolar(azimuth) - 0.05;
        const path = [];
        for (let s = 0; s <= 4; s += 1) path.push(at(rootPolar + ((leave - rootPolar) * s) / 4, azimuth, 0.06).point);
        const hairline = path.at(-1).clone();
        const behind = Math.abs(azimuth) / Math.PI;
        const length = part.length * r * (0.7 + 0.3 * behind) * (0.9 + 0.2 * random());
        const out = new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
        const hang = [];
        for (let s = 1; s <= 6; s += 1) hang.push(hairline.clone().add(new THREE.Vector3(0, (-length * s) / 6, 0)).addScaledVector(out, 0.08 * r * Math.sin((s / 6) * Math.PI * 0.5)));
        const bind = partChain(chains, [hairline, ...hang], { stiffness: 0.06, damping: 0.05 });
        const whole = [...path, ...hang];
        const scalp = lengthsOf(path).at(-1);
        const lengths = lengthsOf(whole);
        const thick = part.radius * r * (0.85 + 0.3 * random());
        addTube(sheet, whole, {
          radius: (t) => thick * (1 - 0.3 * t),
          sides: 5,
          bind: (t, i) => (lengths[i] > scalp ? bind(lengths[i] - scalp) : NO_SWING),
          v: lengths.at(-1) / r,
        });
      }
    } else if (part.kind === 'ringlets') {
      // Long ringlets hung round the sides and back from just under the cap's edge (not across the face).
      for (let k = 0; k < part.count; k += 1) {
        // Alternately either side, from beside the temple (0.85 rad from the face) round to the middle of the back.
        const wrapped = (k % 2 ? 1 : -1) * (0.85 + (Math.PI - 0.85) * (Math.floor(k / 2) / Math.max(1, Math.ceil(part.count / 2) - 1)));
        const { point, normal } = at(hairLeavePolar(wrapped) - 0.12, wrapped, (shape.cap?.edge ?? 0) + 0.04);
        const behind = Math.abs(wrapped) / Math.PI;
        addRinglet(sheet, chains, point, { length: part.length * r * (0.55 + 0.45 * behind) * (0.9 + 0.2 * random()), r, random, outward: normal, swing: { stiffness: 0.1, damping: 0.025 } });
      }
    } else if (part.kind === 'pigtails') {
      // Two bunches tied high at the sides behind the ears, a knot at each tie and ringlets hanging from it.
      for (const side of [-1, 1]) {
        const tie = at(0.95, side * 2.1, 0.02);
        const knotAt = tie.point.clone().addScaledVector(tie.normal, 0.1 * r);
        addKnot(sheet, knotAt, [0.14 * r, 0.12 * r, 0.12 * r], { segments: 10, rings: 6, facing: tie.normal });
        for (let k = 0; k < part.each; k += 1) {
          const spread = new THREE.Vector3((random() - 0.5) * 0.18 * r, -0.06 * r, (random() - 0.5) * 0.18 * r);
          addRinglet(sheet, chains, knotAt.clone().add(spread).addScaledVector(tie.normal, 0.06 * r), { length: part.length * r * (0.8 + 0.3 * random()), r, random, outward: tie.normal, swing: { stiffness: 0.09, damping: 0.025 } });
        }
      }
    } else if (part.kind === 'updo') {
      // Curls piled on the crown and the back of it: small knots in a heap, the biggest at the middle.
      for (let k = 0; k < part.curls; k += 1) {
        const angle = (k / part.curls) * Math.PI * 2;
        const ring = k === 0 ? 0 : 0.32;
        const { point, normal } = at(0.45 + ring * Math.cos(angle), Math.PI + ring * 1.6 * Math.sin(angle), 0.02);
        const size = (k === 0 ? 0.2 : 0.14 + 0.04 * random()) * r;
        addKnot(sheet, point.addScaledVector(normal, size * 0.8), [size, size * 0.85, size], { segments: 9, rings: 6, facing: normal });
      }
    } else if (part.kind === 'temples') {
      // A loose ringlet before each ear.
      for (const side of [-1, 1]) {
        const { point, normal } = at(1.55, side * 1.05, 0.05);
        addRinglet(sheet, chains, point, { length: part.length * r, r, random, outward: normal, swing: { stiffness: 0.1, damping: 0.025 } });
      }
    }
  }
}

/**
 * Build a style's hair into `group` (meshes tagged userData.photoHair). `head` gives the surface (photohead.js `point`); `r` the
 * head's radius. Returns the triangles drawn, the meshes, and the chains their hanging parts swing on (hairswing.js).
 */
export function buildHairMass({ group, head, r, style, colour, random }) {
  const surface = (direction) => new THREE.Vector3(...head.point(direction.x, direction.y, direction.z)).multiplyScalar(r);
  const shape = HAIR_STYLES[style];
  const result = { triangles: 0, meshes: [], chains: [] };
  if (!shape) return result;
  const centre = new THREE.Vector3(0, 0.05 * r, 0);
  const add = (sheet, material) => {
    if (!sheet.indices.length) return;
    const mesh = new THREE.Mesh(sheet.geometry(), material);
    mesh.userData.photoHair = true;
    mesh.castShadow = true;
    group.add(mesh);
    result.meshes.push(mesh);
    result.triangles += sheet.indices.length / 3;
  };
  const profile = hairProfile({ style, surface, r, random });
  if (profile) add(capAndHang(profile, result.chains, r), sheenMaterial(colour, massSheet(Boolean(shape.hang?.blunt)), { alphaTest: 0.5 }));
  const parts = hairSheet();
  buildParts(shape, parts, result.chains, { surface, centre, r, random });
  add(parts, sheenMaterial(colour, strandSheet()));
  return result;
}

/**
 * What of a hair mesh shows under a helmet: its triangles wholly below the rim and behind the ears (long hair, a tail, ropes
 * out of the back), sharing the mesh's vertices (so it swings with them); null when none. Built once, when first wanted.
 */
export function buildHairRim(mesh, r) {
  if (mesh.userData.rim !== undefined) return mesh.userData.rim;
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  const index = geometry.index.array;
  const kept = [];
  const shows = (vertex) => position.getY(vertex) < HAIR_MASS.rim.below * r && position.getX(vertex) < HAIR_MASS.rim.behind * r;
  for (let i = 0; i < index.length; i += 3) if (shows(index[i]) && shows(index[i + 1]) && shows(index[i + 2])) kept.push(index[i], index[i + 1], index[i + 2]);
  let rim = null;
  if (kept.length) {
    const shared = new THREE.BufferGeometry();
    for (const name of Object.keys(geometry.attributes)) shared.setAttribute(name, geometry.attributes[name]);
    shared.setIndex(kept);
    rim = new THREE.Mesh(shared, mesh.material);
    rim.userData.photoHairRim = true;
    rim.castShadow = true;
  }
  mesh.userData.rim = rim;
  return rim;
}

/**
 * The head as an ellipsoid (local space) for the swinging hair to stay out of: its reach along each axis from photohead.js's
 * surface, shrunk to 0.95 (inside the skin everywhere, so hair resting on the head is never pushed off where it was cut).
 */
export function headEllipsoid(head, r) {
  const reach = (x, y, z) => new THREE.Vector3(...head.point(x, y, z)).multiplyScalar(r);
  const [front, back, up, side] = [reach(1, 0, 0).x, reach(-1, 0, 0).x, reach(0, 1, 0).y, reach(0, 0, 1).z];
  // Down to the chin at most (the surface below runs on into the neck, which has its own capsule).
  const down = Math.max(reach(0, -1, 0).y, -1.05 * r);
  return {
    centre: new THREE.Vector3((front + back) / 2, (up + down) / 2, 0),
    radii: [((front - back) / 2) * 0.95, ((up - down) / 2) * 0.95, side * 0.95],
  };
}
