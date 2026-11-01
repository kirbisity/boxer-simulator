// The samurai's war masks drawn with baked maps (the design study: helmstyle.js `masks`): an oni somen (the whole face of
// a demon: bunched brows of black horsehair, glaring eyes, a broad nose, a snarl round gilt teeth and white tusks, the brow
// and cheeks furrowed; drawn a little low, below the kabuto's peak), a ressei-men (the fierce old man: a hooked nose, deep wrinkles, the mouth open on white teeth, a
// white horsehair moustache and chin tuft) or a karasu tengu (a crow's beak, feathered cheeks). Each is a patch of a sphere
// before the face, pushed out by its relief's coarse part (the sheet's `grid`, helmsheets.py) and wearing the rest in its
// maps; its outline is cut by the maps, its lacquer drawn in the wearer's colour (red, or black). References: helmmaps.js.

/* global THREE */
import { helmMapSheet, maskMaterial } from './helmmaps.js';
import { maskOnFace, MASK_FITS } from './helmforms.js';

const MASK_SHEETS = { oni: 'maskOni', ressei: 'maskRessei', tengu: 'maskTengu' };

/**
 * The mask's mesh from a sheet's grid ({ size, R, az, top, bottom, power, heights: size x size, v from the bottom, u from
 * the middle out}): 2 size - 1 columns across (the halves mirrored), size rows up; u = (angle / az) ** power. With a `fit`
 * (helmforms.js MASK_FITS), set on the face.
 */
export function maskGeometry(grid, r, fit = null) {
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
 * A kabuto's mask in style `style` ('oni', 'ressei', 'tengu'), added to `group` (head coordinates); `tint` the lacquer's
 * colour, `envMap` the steel's reflections. Returns the mask's mesh, or null when its sheet is not there (draw the old one).
 */
export function buildWarMask(group, style, r, tint, envMap) {
  const name = MASK_SHEETS[style];
  const sheet = name && helmMapSheet(name);
  if (!sheet?.grid) return null;
  const material = maskMaterial(name, tint, envMap);
  const mask = new THREE.Mesh(maskGeometry(sheet.grid, r, MASK_FITS[style]), material);
  mask.userData.noOutline = true;
  mask.castShadow = true;
  group.add(mask);
  return mask;
}
