// The war masks drawn with baked maps. The samurai's is the menpō (the half mask from under the eyes to under the chin,
// russet iron or lacquered: a hooked nose, broad cheekbones and the crease past the mouth's corner, the mouth open in a
// grimace, the chin jutting, the cheek wings flared where the helmet's cord passes behind them, the iron finished in fine
// grooves round the mouth and down the nose; red lacquer inside). It is a patch of a sphere before the face, pushed out by
// its relief's coarse part (the sheet's `grid`, helmsheets.py) and wearing the rest in its maps; its outline and mouth
// are cut by the maps. References: helmmaps.js.
// The quick variants of China, the steppe and the sultanates (helmsheets.py WORLD_MASKS) are made the same way, their
// metal (iron, bronze, gilt, mail) drawn in the colour the helmet gives (wardrobe.js worldMask).

/* global THREE */
import { helmMapSheet, maskMaterial } from './helmmaps.js';
import { HELM_MAP_DATA } from './helmmaps-data.js';
import { maskOnFace, MASK_FITS } from './helmforms.js';

export const MASK_SHEETS = {
  menpo: 'maskMenpo',
  tiemian: 'maskTiemian', shoumian: 'maskShoumian', kipchak: 'maskKipchak', horde: 'maskHorde', ventail: 'maskVentail',
};

/** The mask's vertices (flat [x, y, z, ...], head coordinates times `r`) and texture coordinates from a sheet's grid. */
export function maskPoints(grid, r, fit = null) {
  const { size, R, az, top, bottom, power, heights } = grid;
  const columns = size * 2 - 1;
  const positions = [];
  const uvs = [];
  for (let row = 0; row < size; row += 1) {
    const v = row / (size - 1);
    const polar = bottom - v * (bottom - top);
    for (let column = 0; column < columns; column += 1) {
      const across = column - (size - 1);
      const u = Math.abs(across) / (size - 1);
      const angle = Math.sign(across) * u ** (1 / power) * az;
      const radius = (R + heights[row * size + Math.abs(across)]) * r;
      const point = [radius * Math.sin(polar) * Math.cos(angle), radius * Math.cos(polar), radius * Math.sin(polar) * Math.sin(angle)];
      positions.push(...(fit ? maskOnFace(fit, point.map((value) => value / r)).map((value) => value * r) : point));
      uvs.push(u, v);
    }
  }
  return { positions, uvs };
}

/**
 * The mask's mesh from a sheet's grid ({ size, R, az, top, bottom, power, heights: size x size, v from the bottom, u from
 * the middle out}): 2 size - 1 columns across (the halves mirrored), size rows up; u = (angle / az) ** power. With a `fit`
 * (helmforms.js MASK_FITS), set on the face.
 */
export function maskGeometry(grid, r, fit = null) {
  const { size } = grid;
  const { positions, uvs } = maskPoints(grid, r, fit);
  const columns = size * 2 - 1;
  const indices = [];
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const a = row * columns + column;
      indices.push(a, a + columns, a + 1, a + 1, a + columns, a + columns + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A war mask in style `style` (MASK_SHEETS), added to `group` (head coordinates); `tint` the lacquer's (or the metal's)
 * colour, `envMap` the steel's reflections; `span` the helmet's drawn span (helmforms.js HELM_SPAN), undone for the mask
 * so it stays fitted to the face; `bare`, the menpō in bare metal (its inside the same metal, darker) rather than
 * lacquer. Without the maps (`#maps=off`, tests), the same form in `plain` (a material), if given. Returns the mask's
 * mesh, or null when it cannot be drawn.
 */
export function buildWarMask(group, style, r, tint, envMap, { span = null, plain = null, bare = false } = {}) {
  const name = MASK_SHEETS[style];
  const grid = name && HELM_MAP_DATA[name]?.grid;
  if (!grid) return null;
  const material = helmMapSheet(name) ? maskMaterial(name, tint, envMap, bare ? new THREE.Color(tint).multiplyScalar(0.45).getHex() : undefined, bare) : plain;
  if (!material) return null;
  const mask = new THREE.Mesh(maskGeometry(grid, r, MASK_FITS[style]), material);
  mask.userData.noOutline = true;
  mask.castShadow = true;
  if (span) mask.scale.set(1 / span[0], 1 / span[1], 1 / span[2]);
  group.add(mask);
  return mask;
}
