// Hair for photo faces (photoface.js): one sculpted mass per style, grown
// from a style profile (hairProfile: for each column round the head, the path
// the hair takes from the crown over the scalp to where it leaves it, then
// down to where it is cut: a hime's blunt fringe at the brow and side locks
// at the cheek, long hair down the back, a crop to the hairline), drawn as one
// smooth surface with a strand texture, a sheen along the strands and ragged
// (or, cut blunt, straight) tips; tied styles add a knot and a tail. It sits
// over the painted scalp and hairline (photohair.js) and swings (hairswing.js).
// (Picked from four ways tried in the pilot: dense layered cards, a mass with
// cards over it, and tube clumps were the others.)

/* global THREE */
import { hairLength } from './photohair.js';

export const HAIR_MASS = {
  columns: 56,
  scalpRows: 12,
  hangRows: 12,
  // Of the head's radius: the volume over the scalp, the flare of hanging hair, a tube's radius at the root.
  tube: 0.07,
  sheen: { primary: 0.18, secondary: 0.12, width: [90, 24] },
};

/** Each style's shape: how far it hangs (heights, of the head's radius) at the front, sides and back; blunt or ragged; volume. */
function hairStyleShape(style) {
  const length = hairLength(style);
  if (style === 'hime') return { fringe: 0.2, sides: -0.78, back: -4.0, blunt: true, volume: 0.07 };
  if (length === 'long') return { fringe: 0.26, sides: -2.0, back: -3.2, volume: 0.09 };
  if (length === 'medium') return { fringe: 0.3, sides: -0.55, back: -0.95, volume: 0.08 };
  if (length === 'short') return { volume: 0.07 };
  if (length === 'tied') return { volume: 0.035, tied: style };
  return null;
}

const optionSmooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Where the hair leaves the scalp (polar angle from the crown), by azimuth from the face: the hairline, lifted over the ears. */
function hairLeavePolar(azimuth) {
  const f = Math.abs(azimuth) / Math.PI;
  return 0.95 + 1.2 * optionSmooth(0.05, 0.95, f) - 0.28 * Math.exp(-(((Math.abs(azimuth) - 1.6) / 0.35) ** 2));
}

/** How far down the hair hangs at an azimuth (a height, of the head's radius), or null where it ends at the scalp. */
function hairEndHeight(shape, azimuth) {
  const a = Math.abs(azimuth);
  if (shape.fringe === undefined) return null;
  if (shape.blunt) return a < 0.62 ? shape.fringe : a < 1.45 ? shape.sides : shape.back;
  const front = 1 - optionSmooth(0.45, 0.75, a);
  const back = optionSmooth(1.35, 1.8, a);
  return shape.fringe * front + shape.sides * (1 - front) * (1 - back) + shape.back * back;
}

/**
 * The style's columns: for each azimuth, points from the crown over the scalp and (hanging) down to the cut, in the head's local
 * space, with the length along them (`along`, 0..1) and their direction (`tangents`). `surface(direction)`: the head's surface.
 */
export function hairProfile({ style, surface, r, columns, volumeScale = 1, jitter = 0, random = Math.random }) {
  const shape = hairStyleShape(style);
  if (!shape) return null;
  const centre = new THREE.Vector3(0, 0.05 * r, 0);
  const volume = shape.volume * volumeScale * r;
  const out = [];
  for (let column = 0; column < columns; column += 1) {
    const azimuth = -Math.PI + ((column + 0.5 + (random() - 0.5) * jitter) / columns) * Math.PI * 2;
    const leave = hairLeavePolar(azimuth);
    const points = [];
    for (let row = 0; row <= HAIR_MASS.scalpRows; row += 1) {
      const polar = 0.03 + ((leave - 0.03) * row) / HAIR_MASS.scalpRows;
      const skin = surface(new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)));
      const radial = skin.clone().sub(centre);
      points.push(centre.clone().add(radial.setLength(radial.length() + volume * (1 - 0.35 * (polar / leave)))));
    }
    let end = hairEndHeight(shape, azimuth);
    if (end !== null) end *= r * (1 + (random() - 0.5) * jitter * 0.2);
    const from = points[points.length - 1];
    if (end !== null && end < from.y - 0.05 * r) {
      let last = from.clone();
      for (let row = 1; row <= HAIR_MASS.hangRows; row += 1) {
        const y = from.y + ((end - from.y) * row) / HAIR_MASS.hangRows;
        const t = row / HAIR_MASS.hangRows;
        const point = new THREE.Vector3();
        if (y > -1.05 * r) {
          const polar = Math.acos(Math.max(-1, Math.min(1, y / (1.06 * r))));
          const skin = surface(new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)));
          const radial = new THREE.Vector3(skin.x, 0, skin.z);
          const reach = Math.max(radial.length() + volume * 0.8 + 0.06 * r * t, Math.hypot(last.x, last.z) * (Math.abs(azimuth) < 0.62 ? 0.92 : 0.99));
          point.set(Math.cos(azimuth) * 0, y, 0).add(radial.setLength(reach));
        } else {
          const flat = new THREE.Vector3(last.x, 0, last.z);
          point.set(0, y, 0).add(flat.setLength(flat.length() + 0.01 * r));
        }
        points.push(point);
        last = point;
      }
    }
    // Lengths along, and directions.
    const lengths = [0];
    for (let i = 1; i < points.length; i += 1) lengths.push(lengths[i - 1] + points[i].distanceTo(points[i - 1]));
    const total = lengths[lengths.length - 1] || 1;
    const tangents = points.map((_, i) => points[Math.min(points.length - 1, i + 1)].clone().sub(points[Math.max(0, i - 1)]).normalize());
    out.push({ azimuth, points, along: lengths.map((l) => l / total), tangents, hangs: points.length > HAIR_MASS.scalpRows + 1 });
  }
  return { shape, columns: out, centre };
}

// ---- Textures (shared, made once on canvases) ----------------------------------------------------------------------------------

const optionTextures = {};
function hairCanvas(name, draw) {
  if (optionTextures[name]) return optionTextures[name];
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
  optionTextures[name] = texture;
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

// ---- Geometry ---------------------------------------------------------------------------------------------------------------------

function hairGeometryOf(positions, uvs, tangents, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('hairTangent', new THREE.Float32BufferAttribute(tangents, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A column resampled to `count` points by its length along (a column that stops at the scalp ends in repeated points). */
function resampleColumn(column, count, until = 1) {
  const points = [];
  const tangents = [];
  for (let k = 0; k < count; k += 1) {
    const want = (k / (count - 1)) * until;
    let i = 1;
    while (i < column.along.length - 1 && column.along[i] < want) i += 1;
    const a = column.along[i - 1];
    const b = column.along[i];
    const f = b > a ? Math.min(1, Math.max(0, (want - a) / (b - a))) : 0;
    points.push(column.points[i - 1].clone().lerp(column.points[i], f));
    tangents.push(column.tangents[i - 1].clone().lerp(column.tangents[i], f).normalize());
  }
  return { points, tangents };
}

/** One surface over the columns (around, and down each to its cut). */
function hairMassGeometry(profile, rows, repeat = 6) {
  const positions = [];
  const uvs = [];
  const tangents = [];
  const indices = [];
  const columns = profile.columns;
  columns.forEach((column, c) => {
    const { points, tangents: along } = resampleColumn(column, rows);
    points.forEach((point, k) => {
      positions.push(point.x, point.y, point.z);
      uvs.push((c / columns.length) * repeat, 1 - k / (rows - 1));
      tangents.push(along[k].x, along[k].y, along[k].z);
    });
  });
  for (let c = 0; c < columns.length; c += 1) {
    const next = (c + 1) % columns.length;
    for (let k = 0; k < rows - 1; k += 1) {
      const a = c * rows + k;
      const b = next * rows + k;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return hairGeometryOf(positions, uvs, tangents, indices);
}

/** Tapered tubes along columns (a ponytail's tail). */
function hairTubeGeometry(profile, rows, radius, r, sides = 6) {
  const positions = [];
  const uvs = [];
  const tangents = [];
  const indices = [];
  const centre = profile.centre;
  for (const column of profile.columns) {
    const { points, tangents: along } = resampleColumn(column, rows);
    const base = positions.length / 3;
    points.forEach((point, k) => {
      const t = k / (rows - 1);
      const normal = point.clone().sub(centre).normalize();
      const across = new THREE.Vector3().crossVectors(along[k], normal).normalize();
      const up = new THREE.Vector3().crossVectors(across, along[k]).normalize();
      const size = radius * r * Math.max(0.2, 1 - 0.8 * t);
      for (let side = 0; side < sides; side += 1) {
        const angle = (side / sides) * Math.PI * 2;
        const p = point.clone().addScaledVector(across, Math.cos(angle) * size).addScaledVector(up, Math.sin(angle) * size * 0.6);
        positions.push(p.x, p.y, p.z);
        uvs.push(side / sides, 1 - t);
        tangents.push(along[k].x, along[k].y, along[k].z);
      }
    });
    for (let k = 0; k < rows - 1; k += 1) {
      for (let side = 0; side < sides; side += 1) {
        const a = base + k * sides + side;
        const b = base + k * sides + ((side + 1) % sides);
        indices.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
  }
  return hairGeometryOf(positions, uvs, tangents, indices);
}

/** A ponytail's or queue's tail, a topknot's or bun's knot: for tied styles, the same in every option (a tube and an ellipsoid). */
function hairTiedExtras(style, r, material, add) {
  const tie = new THREE.Vector3(-0.75 * r, (style === 'topknot' ? 1.1 : 0.75) * r, 0);
  const knot = new THREE.Mesh(new THREE.SphereGeometry((style === 'topknot' ? 0.2 : 0.3) * r, 12, 9), material);
  knot.geometry.setAttribute('hairTangent', new THREE.Float32BufferAttribute(new Array(knot.geometry.attributes.position.count * 3).fill(0).map((_, i) => (i % 3 === 0 ? 1 : 0)), 3));
  knot.position.copy(tie);
  if (style === 'topknot') knot.scale.set(1.6, 0.75, 0.8);
  add(knot);
  if (style === 'ponytail') {
    const column = { points: [], along: [], tangents: [] };
    for (let k = 0; k <= 10; k += 1) column.points.push(tie.clone().add(new THREE.Vector3(-0.25 * r * Math.sin((k / 10) * 1.2), -2 * r * (k / 10), 0)));
    const lengths = [0];
    for (let i = 1; i < column.points.length; i += 1) lengths.push(lengths[i - 1] + column.points[i].distanceTo(column.points[i - 1]));
    column.along = lengths.map((l) => l / lengths[lengths.length - 1]);
    column.tangents = column.points.map((_, i) => column.points[Math.min(10, i + 1)].clone().sub(column.points[Math.max(0, i - 1)]).normalize());
    add(new THREE.Mesh(hairTubeGeometry({ columns: [column], centre: tie.clone().add(new THREE.Vector3(0.5 * r, 0, 0)) }, 10, 1.7, r * 0.1, 8), material));
  }
}

/**
 * Build a style's hair into `group` (meshes tagged userData.photoHair). `head` gives the surface (photohead.js `point`); `r` the
 * head's radius. Returns the triangles drawn.
 */
export function buildHairMass({ group, head, r, style, colour, random }) {
  const surface = (direction) => new THREE.Vector3(...head.point(direction.x, direction.y, direction.z)).multiplyScalar(r);
  let triangles = 0;
  const add = (mesh) => {
    mesh.userData.photoHair = true;
    mesh.castShadow = true;
    group.add(mesh);
    triangles += mesh.geometry.index ? mesh.geometry.index.count / 3 : 0;
  };
  const shape = hairStyleShape(style);
  if (!shape) return 0;
  const rows = HAIR_MASS.scalpRows + HAIR_MASS.hangRows + 1;
  const profile = hairProfile({ style, surface, r, columns: HAIR_MASS.columns, random });
  add(new THREE.Mesh(hairMassGeometry(profile, rows), sheenMaterial(colour, massSheet(Boolean(shape.blunt)), { alphaTest: 0.5 })));
  if (shape.tied) hairTiedExtras(shape.tied, r, sheenMaterial(colour, massSheet(true)), add);
  return triangles;
}
