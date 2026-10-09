// The ō-yoroi drawn: the great armour of the Heian–Kamakura mounted archer.
// A box armour, but a box of laced lacquer rows, not of boards: the dō wraps
// the trunk in a rounded box (a flat-ish front, rounded corners, drawn in a
// little at the waist), open on the right where a separate plate (the
// waidate) closes it; a gilt-edged breast plate and a stencilled leather
// front (tsurubashiri, where the bowstring runs); two small plates at the
// chest (sendan-no-ita on the right, kyūbi-no-ita on the left); the scarlet
// agemaki bow at the back, and the quiver (ebira). Hung to swing: the large,
// gently curved shoulder guards (sode) and the four great skirt panels
// (kusazuri), each a curved, flaring piece of laced rows that parts over the
// thighs. Every laced surface carries the kebiki lacing as it looks: many
// close-set rows, the small plate heads along each, the silk running down over them.

import { Dangle } from './dangle.js';
import { inkAll } from './wardrobe.js';
import { surface } from './toon.js';

export const OYOROI = {
  // The dō round the trunk: half-depth and half-width as shares of the trunk's skin
  // radius plus a margin (m at 1.8 m tall); `square` the superellipse's power (2 an
  // ellipse, higher a squarer box); `waist` how much it is drawn in at the waist.
  box: { depth: 0.8, width: 1.12, margin: 0.05, top: 0.06, bottom: 0.84, square: 3.2, waist: 0.07 },
  // Laced rows per metre of height, and the width (m) of one repeat of the plates across.
  rowsPerMetre: 34,
  plateRepeat: 0.09,
  // Sode: a large guard hung from each shoulder strap, curved round the arm (its
  // radius), standing out from it (`tilt`, rad); laced boards are stiff: little sag, much damping.
  sode: { width: 0.3, height: 0.36, radius: 0.42, out: 0.05, tilt: 0.28, sag: 0.08, damping: 0.85 },
  // Kusazuri: four flaring panels (front, back, both sides) from the dō's lower edge, each a
  // quarter-turn round less a gap, flaring out (`flare`: the hem's radius over the top's).
  kusazuri: { height: 0.36, span: 1.3, flare: 1.3, sag: 0.08, damping: 0.85 },
  quiverArrows: 14,
};

const textures = new Map();

/** Kebiki odoshi: close-set rows of small lacquered plate heads, the silk lacing running down over them. */
function odoshiTexture(lacquer, lace, gold) {
  const key = `${lacquer}|${lace}|${gold}`;
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 32;
  const g = canvas.getContext('2d');
  g.fillStyle = lace;
  g.fillRect(0, 0, 128, 32);
  // The plate heads along the top of the row: a lacquered band with a rounded head per plate.
  g.fillStyle = lacquer;
  g.fillRect(0, 0, 128, 8);
  for (let plate = 0; plate < 16; plate += 1) {
    const x = plate * 8;
    g.fillStyle = lacquer;
    g.beginPath();
    g.arc(x + 4, 8, 3.5, 0, Math.PI);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x + 2, 2, 4, 1.2);
    if (plate % 4 === 0) {
      g.fillStyle = gold;
      g.fillRect(x + 3, 3, 2, 2);
    }
  }
  // The lacing: two cords to a plate, light on their tops, shadowed between.
  for (let cord = 0; cord < 32; cord += 1) {
    const x = cord * 4;
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(x + 0.5, 12, 1.5, 18);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x + 2.8, 12, 1, 18);
  }
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(0, 30, 128, 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  textures.set(key, texture);
  return texture;
}

/** The stencilled leather of the breast (tsurubashiri): a field of small figures in rows, a border. */
function stencilTexture(leather, stencil) {
  const key = `stencil|${leather}|${stencil}`;
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = leather;
  g.fillRect(0, 0, 64, 96);
  g.fillStyle = stencil;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      // A lion-and-peony figure reduced to a lozenge with a dot: the shi-shi botan stencil.
      const x = 8 + column * 16 + (row % 2) * 8;
      const y = 8 + row * 11;
      g.beginPath();
      g.moveTo(x, y - 4);
      g.lineTo(x + 4, y);
      g.lineTo(x, y + 4);
      g.lineTo(x - 4, y);
      g.closePath();
      g.fill();
    }
  }
  g.strokeStyle = stencil;
  g.lineWidth = 3;
  g.strokeRect(2, 2, 60, 92);
  const texture = new THREE.CanvasTexture(canvas);
  textures.set(key, texture);
  return texture;
}

/** The laced surface's material, its rows repeated `across` × `down` times. */
function lacedMaterial(armor, across, down) {
  const texture = odoshiTexture(armor.color, armor.lace, armor.gold).clone();
  texture.needsUpdate = true;
  texture.repeat.set(Math.max(1, Math.round(across)), Math.max(1, Math.round(down)));
  const material = surface(0xffffff, { roughness: 0.55 });
  material.map = texture;
  material.side = THREE.DoubleSide;
  return material;
}

/**
 * A curved, flaring piece of laced rows: part of a cone round a vertical
 * axis (radius `top` at its top, `bottom` at its hem, `height` tall), facing
 * out along `facing` (rad: 0 is +z, π/2 is +x) and spanning `span` rad. Its
 * geometry is moved so the middle of its top edge sits at the origin: hung
 * from there, it swings like a skirt panel or a shoulder guard.
 */
function curvedPanel(top, bottom, height, facing, span, armor) {
  const geometry = new THREE.CylinderGeometry(top, bottom, height, 14, 4, true, facing - span / 2, span);
  // Cylinder angle θ: x = sin θ, z = cos θ; its top at +height/2.
  geometry.translate(-Math.sin(facing) * top, -height / 2, -Math.cos(facing) * top);
  const across = (span * (top + bottom)) / 2 / OYOROI.plateRepeat;
  return new THREE.Mesh(geometry, lacedMaterial(armor, across, height * OYOROI.rowsPerMetre));
}

/**
 * The dō: a rounded box (a superellipse in section) from under the arms to the
 * waist, drawn in at the waist, open on the right side (−z) for the waidate.
 * Collar frame: x forward, y up, z left.
 */
function doGeometry(depth, width, top, bottom, spec) {
  const around = 40;
  const down = 8;
  const gap = 0.32;
  const positions = [];
  const uvs = [];
  const indices = [];
  const power = 2 / spec.square;
  const signed = (value) => Math.sign(value) * Math.abs(value) ** power;
  for (let row = 0; row <= down; row += 1) {
    const v = row / down;
    const y = top + (bottom - top) * v;
    // Drawn in most two-thirds of the way down, a little out again at the hem.
    const pinch = 1 - spec.waist * Math.sin(Math.min(1, v / 0.85) * Math.PI) ** 2;
    for (let column = 0; column <= around; column += 1) {
      // From just past the right side, round the front, the left and the back, to just short of it again.
      const t = -Math.PI / 2 + gap / 2 + (column / around) * (Math.PI * 2 - gap);
      positions.push(signed(Math.cos(t)) * depth * pinch, y, signed(Math.sin(t)) * width * pinch);
      uvs.push(column / around, 1 - v);
    }
  }
  for (let row = 0; row < down; row += 1) {
    for (let column = 0; column < around; column += 1) {
      const a = row * (around + 1) + column;
      const b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** A gilt-edged plate of lacquer `width` × `height`, facing +x, centred. */
function lacquerPlate(width, height, thickness, armor) {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, width), surface(new THREE.Color(armor.color).getHex(), { roughness: 0.35 }));
  const rim = new THREE.Mesh(new THREE.BoxGeometry(thickness * 1.2, height * 1.04, width * 1.03), surface(new THREE.Color(armor.gold).getHex(), { roughness: 0.3 }));
  rim.position.x = -thickness * 0.15;
  group.add(rim, plate);
  return group;
}

/** The dō's size for this body: half-depth, half-width, top and hem in the collar frame (m). */
function doSize(body) {
  const scale = body.heightM / 1.8;
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  const spec = OYOROI.box;
  return { scale, trunk, depth: skin * spec.depth + spec.margin * scale, width: skin * spec.width + spec.margin * scale, top: -spec.top * trunk, bottom: -spec.bottom * trunk };
}

/**
 * The dō, the breast and what is fixed on it, in the chest bone's frame at
 * the neck (x forward, y up the spine, z to the left; m).
 */
export function buildOyoroiBox(body, armor) {
  const group = new THREE.Group();
  const { scale, depth, width, top, bottom } = doSize(body);
  const height = top - bottom;
  const thick = 0.012 * scale;
  const girth = 2 * (depth + width) * 2;
  const shell = new THREE.Mesh(doGeometry(depth, width, top, bottom, OYOROI.box), lacedMaterial(armor, girth / OYOROI.plateRepeat, height * OYOROI.rowsPerMetre));
  // The waidate: a separate laced plate closing the right side, a little proud of the dō.
  // (Its top edge's middle sits at the origin: placed on the right side, a little out from the dō.)
  const waidate = curvedPanel(width * 1.06, width * 1.02, height * 0.92, Math.PI, 0.9, armor);
  waidate.position.set(0, top - height * 0.04, -width * 1.1);
  group.add(shell, waidate);
  // The breast plate (munaita) across the top of the front, and the stencilled leather front below it.
  const breast = lacquerPlate(width * 1.25, height * 0.14, thick * 2, armor);
  breast.position.set(depth + thick, top - height * 0.06, 0);
  const leather = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.4, height * 0.68), surface(0xffffff, { roughness: 0.8 }));
  leather.material.map = stencilTexture(armor.leather, armor.stencil);
  leather.rotation.y = Math.PI / 2;
  leather.position.set(depth * 1.005 + thick * 0.4, top - height * 0.48, 0);
  // The back plate (oshitsuke-no-ita) and the shoulder straps (watagami) over the shoulders.
  const backPlate = lacquerPlate(width * 1.3, height * 0.14, thick * 2, armor);
  backPlate.rotation.y = Math.PI;
  backPlate.position.set(-depth - thick, top - height * 0.05, 0);
  const strap = surface(new THREE.Color(armor.leather).getHex(), { roughness: 0.8 });
  for (const side of [1, -1]) {
    const watagami = new THREE.Mesh(new THREE.BoxGeometry(depth * 2.05, thick * 1.5, width * 0.34), strap);
    watagami.position.set(0, top + thick, side * width * 0.6);
    group.add(watagami);
  }
  // The small plates at the chest, hung from the straps: sendan-no-ita laced on the right, kyūbi-no-ita solid on the left.
  const sendan = curvedPanel(depth * 2.2, depth * 2.2, height * 0.36, Math.PI / 2, 0.22, armor);
  sendan.position.set(depth + thick * 3, top - thick, -width * 0.55);
  const kyubi = lacquerPlate(width * 0.3, height * 0.38, thick * 1.5, armor);
  kyubi.position.set(depth + thick * 3, top - height * 0.2, width * 0.56);
  group.add(breast, leather, backPlate, sendan, kyubi);
  // The agemaki: a great scarlet bow at the back, its loops and two tails.
  const silk = surface(0xc0281e, { roughness: 0.75 });
  const knot = new THREE.Group();
  knot.position.set(-depth - thick * 4, top - height * 0.32, 0);
  for (const side of [1, -1]) {
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.045 * scale, 0.012 * scale, 6, 14), silk);
    loop.rotation.y = Math.PI / 2;
    loop.position.set(0, 0.02 * scale, side * 0.05 * scale);
    loop.scale.set(1, 0.7, 1.3);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.01 * scale, 0.16 * scale, 0.03 * scale), silk);
    tail.position.set(0, -0.08 * scale, side * 0.03 * scale);
    tail.rotation.x = side * 0.25;
    knot.add(loop, tail);
  }
  group.add(knot);
  // The ebira: a quiver on the back, the arrows standing in it heads down, fletchings over the right shoulder.
  group.add(buildEbira(scale, depth, top));
  inkAll(group, 0.0022);
  return group;
}

/** The quiver: a frame of black lacquer at the back, a fan of arrows rising from it to the right. */
function buildEbira(scale, depth, top) {
  const group = new THREE.Group();
  group.position.set(-depth - 0.06 * scale, top - 0.34 * scale, -0.05 * scale);
  group.rotation.x = -0.28;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05 * scale, 0.16 * scale, 0.12 * scale), surface(0x141214, { roughness: 0.4 }));
  const shaft = surface(0xc9a86a, { roughness: 0.7 });
  const fletch = surface(0xe8e4da, { roughness: 0.9 });
  const band = surface(0x141214, { roughness: 0.6 });
  group.add(frame);
  for (let arrow = 0; arrow < OYOROI.quiverArrows; arrow += 1) {
    const spread = (arrow / (OYOROI.quiverArrows - 1) - 0.5) * 0.5;
    const holder = new THREE.Group();
    holder.position.set((arrow % 2) * 0.012 * scale, 0.05 * scale, spread * 0.18 * scale);
    holder.rotation.x = spread;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0035 * scale, 0.0035 * scale, 0.62 * scale, 5), shaft);
    stick.position.y = 0.22 * scale;
    const feather = new THREE.Mesh(new THREE.BoxGeometry(0.002 * scale, 0.12 * scale, 0.022 * scale), arrow % 3 ? fletch : band);
    feather.position.y = 0.46 * scale;
    holder.add(stick, feather);
    group.add(holder);
  }
  return group;
}

/**
 * What hangs and swings: the sode from the shoulder straps (collar frame)
 * and the kusazuri from the dō's lower edge (the pelvis frame). Each a
 * Dangle; drawn in a crowd (`still`), fixed in place instead.
 */
export function buildOyoroiHanging(body, armor, collar, hips, still = false) {
  const { scale, trunk, depth, width } = doSize(body);
  const box = OYOROI.box;
  const dangles = [];
  const hang = (anchor, pivot, rest, length, spec, piece) => {
    if (still) {
      const holder = new THREE.Group();
      holder.position.set(...pivot);
      holder.add(piece);
      anchor.add(holder);
      return;
    }
    const dangle = new Dangle(anchor, pivot, rest, length, { sag: spec.sag, damping: spec.damping });
    dangle.group.add(piece);
    dangles.push(dangle);
  };
  // Sode: large, curved round the upper arm, a lacquered plate (kanmuri-no-ita) along the top; hung at an angle out from the arm.
  const sode = OYOROI.sode;
  for (const side of [1, -1]) {
    const piece = new THREE.Group();
    const facing = side > 0 ? 0 : Math.PI;
    const radius = sode.radius * scale;
    const span = (sode.width * scale) / radius;
    piece.add(curvedPanel(radius, radius * 1.06, sode.height * scale, facing, span, armor));
    const crown = lacquerPlate(sode.width * scale * 1.04, 0.035 * scale, 0.02 * scale, armor);
    crown.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    crown.position.y = -0.0175 * scale;
    piece.add(crown);
    hang(collar, [0, -0.02 * scale, side * (width + sode.out * scale)], [0, -1, side * Math.tan(sode.tilt)], sode.height * scale, sode, piece);
  }
  // Kusazuri: front, back and both sides, each a quarter of a flaring skirt less a gap, hung from the dō's hem.
  const spec = OYOROI.kusazuri;
  const from = (1 - box.bottom) * trunk;
  const panels = [
    { facing: Math.PI / 2, radius: depth, rest: [0.15, -1, 0] },
    { facing: -Math.PI / 2, radius: depth, rest: [-0.15, -1, 0] },
    { facing: 0, radius: width, rest: [0, -1, 0.15] },
    { facing: Math.PI, radius: width * 1.04, rest: [0, -1, -0.15] },
  ];
  for (const panel of panels) {
    const radius = panel.radius * 1.04;
    const piece = curvedPanel(radius, radius * spec.flare, spec.height * scale, panel.facing, spec.span, armor);
    const pivot = [Math.sin(panel.facing) * radius, from, Math.cos(panel.facing) * radius];
    hang(hips, pivot, panel.rest, spec.height * scale, spec, piece);
  }
  for (const dangle of dangles) inkAll(dangle.group, 0.0022);
  return dangles;
}
