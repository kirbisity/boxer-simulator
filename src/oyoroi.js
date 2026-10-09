// The ō-yoroi drawn: the great armour of the Heian–Kamakura mounted archer,
// as boxy as it was. Its trunk is a rigid box of lacquered lamellae laced in
// silk (a separate plate, the waidate, closing the right side), under a
// gilt-edged breast plate and a stencilled leather front (tsurubashiri, where
// the bowstring runs); two small plates hang at the chest (sendan-no-ita on
// the right, kyūbi-no-ita on the left); a scarlet agemaki bow at the back,
// and the quiver (ebira) of arrows over it. Hung to swing: the broad flat
// shoulder boards (sode) and the four great square skirt panels (kusazuri).
// The lamellae are painted as they look (rows of small plates, the lacing
// running down over them), on flat boards: cheap to draw, and the shape is
// the box.

import { Dangle } from './dangle.js';
import { inkAll } from './wardrobe.js';
import { surface } from './toon.js';

export const OYOROI = {
  // The box round the trunk, as shares of the trunk's skin radius (depth, width) plus a margin (m, at 1.8 m tall).
  box: { depth: 0.82, width: 1.18, margin: 0.05, top: 0.06, bottom: 0.84 },
  // Rows of lamellae on a board, per metre of its height.
  rowsPerMetre: 26,
  // Sode: a board beside each upper arm (m at 1.8 m tall), hung from the shoulder strap, standing out from the arm.
  // Laced lacquer boards are stiff: they swing a little and settle quickly (low sag, high damping).
  sode: { width: 0.3, height: 0.36, out: 0.07, sag: 0.06, damping: 0.85 },
  // Kusazuri: four square panels from the box's lower edge, front, back and both sides.
  kusazuri: { height: 0.36, front: 0.36, side: 0.3, sag: 0.06, damping: 0.85 },
  quiverArrows: 14,
};

const textures = new Map();

/** Laced lamellae painted on a board: rows of small lacquered plates with silk lacing running down over them. */
function odoshiTexture(lacquer, lace, gold) {
  const key = `${lacquer}|${lace}|${gold}`;
  if (textures.has(key)) return textures.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  // One row: the plates' lacquered heads along the top, the lacing below them.
  g.fillStyle = lace;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = lacquer;
  g.fillRect(0, 0, 128, 18);
  // Each plate's rounded head and its two lacing holes; a glint of gilt now and then.
  for (let plate = 0; plate < 16; plate += 1) {
    const x = plate * 8;
    g.fillStyle = lacquer;
    g.beginPath();
    g.arc(x + 4, 18, 4, 0, Math.PI);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x + 2, 6, 1.5, 3);
    g.fillRect(x + 5, 6, 1.5, 3);
    if (plate % 4 === 0) {
      g.fillStyle = gold;
      g.fillRect(x + 3, 1, 2, 2);
    }
  }
  // The lacing: close-set cords running down, light and shadow.
  for (let cord = 0; cord < 32; cord += 1) {
    const x = cord * 4;
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.fillRect(x, 22, 1.5, 40);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(x + 2.5, 22, 1, 40);
  }
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 61, 128, 3);
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

/** A board of laced lamellae `width` × `height` (m), `rows` deep, facing +x, its top at y = 0. */
function lacedBoard(width, height, thickness, armor, rowsPerMetre) {
  const texture = odoshiTexture(armor.color, armor.lace, armor.gold).clone();
  texture.needsUpdate = true;
  texture.repeat.set(Math.max(1, width / 0.12), Math.max(1, Math.round(height * rowsPerMetre)));
  const face = surface(0xffffff, { roughness: 0.55 });
  face.map = texture;
  const edge = surface(new THREE.Color(armor.color).getHex(), { roughness: 0.5 });
  // Only the broad faces, front and back (±x), carry the lacing; the edges are lacquer.
  const board = new THREE.Mesh(new THREE.BoxGeometry(thickness, height, width), [face, face, edge, edge, edge, edge]);
  board.position.y = -height / 2;
  return board;
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

/**
 * The box, the breast and what is fixed on it, in the chest bone's frame at
 * the neck (x forward, y up the spine, z to the left; m).
 */
export function buildOyoroiBox(body, armor) {
  const group = new THREE.Group();
  const scale = body.heightM / 1.8;
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  const spec = OYOROI.box;
  const depth = skin * spec.depth + spec.margin * scale;
  const width = skin * spec.width + spec.margin * scale;
  const top = -spec.top * trunk;
  const bottom = -spec.bottom * trunk;
  const height = top - bottom;
  const thick = 0.012 * scale;
  // The box's four boards: front, back, left (one piece with them), and the waidate on the right a little proud of it.
  const boards = [
    { at: [depth, 0, 0], turn: 0, span: width * 2 },
    { at: [-depth, 0, 0], turn: Math.PI, span: width * 2 },
    { at: [0, 0, width], turn: -Math.PI / 2, span: depth * 2 },
    { at: [0, 0, -width - thick * 1.5], turn: Math.PI / 2, span: depth * 2 + thick * 3 },
  ];
  for (const { at, turn, span } of boards) {
    const board = lacedBoard(span, height, thick, armor, OYOROI.rowsPerMetre);
    const holder = new THREE.Group();
    holder.position.set(at[0], top, at[2]);
    holder.rotation.y = turn;
    holder.add(board);
    group.add(holder);
  }
  // The breast plate (munaita) across the top of the front, and the stencilled leather front below it.
  const breast = lacquerPlate(width * 1.5, height * 0.16, thick * 2, armor);
  breast.position.set(depth + thick * 1.5, top - height * 0.06, 0);
  const leather = new THREE.Mesh(new THREE.PlaneGeometry(width * 1.7, height * 0.72), surface(0xffffff, { roughness: 0.8 }));
  leather.material.map = stencilTexture(armor.leather, armor.stencil);
  leather.rotation.y = Math.PI / 2;
  leather.position.set(depth + thick * 0.8, top - height * 0.5, 0);
  // The back plate (oshitsuke-no-ita) and the shoulder straps (watagami) over the shoulders.
  const backPlate = lacquerPlate(width * 1.6, height * 0.16, thick * 2, armor);
  backPlate.rotation.y = Math.PI;
  backPlate.position.set(-depth - thick * 1.5, top - height * 0.05, 0);
  const strap = surface(new THREE.Color(armor.leather).getHex(), { roughness: 0.8 });
  for (const side of [1, -1]) {
    const watagami = new THREE.Mesh(new THREE.BoxGeometry(depth * 2.1, thick * 1.5, width * 0.36), strap);
    watagami.position.set(0, top + thick, side * width * 0.62);
    group.add(watagami);
  }
  // The small plates at the chest: sendan-no-ita laced on the right, kyūbi-no-ita solid on the left.
  const sendan = new THREE.Group();
  sendan.position.set(depth + thick * 4, top - thick, -width * 0.55);
  sendan.add(lacedBoard(width * 0.42, height * 0.38, thick, armor, OYOROI.rowsPerMetre));
  const kyubi = lacquerPlate(width * 0.32, height * 0.4, thick * 1.5, armor);
  kyubi.position.set(depth + thick * 4, top - height * 0.2, width * 0.58);
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
  group.add(buildEbira(scale, depth, top, armor));
  inkAll(group, 0.0022);
  return group;
}

/** The quiver: a frame of black lacquer at the back, a fan of arrows rising from it to the right. */
function buildEbira(scale, depth, top, armor) {
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
 * and the kusazuri from the box's lower edge (the pelvis frame). Each a
 * Dangle; drawn in a crowd (`still`), fixed in place instead.
 */
export function buildOyoroiHanging(body, armor, collar, hips, still = false) {
  const scale = body.heightM / 1.8;
  const skin = body.segments.trunk.skinRadius;
  const trunk = body.lengths.trunk;
  const box = OYOROI.box;
  const depth = skin * box.depth + box.margin * scale;
  const width = skin * box.width + box.margin * scale;
  const thick = 0.012 * scale;
  const dangles = [];
  const hang = (anchor, pivot, rest, length, spec, board, turn) => {
    if (still) {
      const holder = new THREE.Group();
      holder.position.set(...pivot);
      holder.rotation.y = turn;
      holder.add(board);
      anchor.add(holder);
      return;
    }
    const dangle = new Dangle(anchor, pivot, rest, length, { sag: spec.sag, damping: spec.damping });
    const holder = new THREE.Group();
    holder.rotation.y = turn;
    holder.add(board);
    dangle.group.add(holder);
    dangles.push(dangle);
  };
  // Sode: broad and flat, beside each upper arm, a lacquered plate (kanmuri-no-ita) along the top.
  const sode = OYOROI.sode;
  for (const side of [1, -1]) {
    const board = new THREE.Group();
    const laced = lacedBoard(sode.width * scale, sode.height * scale, thick, armor, OYOROI.rowsPerMetre);
    const crown = lacquerPlate(sode.width * scale * 1.04, 0.035 * scale, thick * 1.6, armor);
    crown.position.y = -0.0175 * scale;
    board.add(laced, crown);
    hang(collar, [0, -0.02 * scale, side * (width + sode.out * scale)], [0, -1, side * 0.25], sode.height * scale, sode, board, side * -Math.PI / 2);
  }
  // Kusazuri: front, back and both sides, from the box's lower edge (above the pelvis), flaring a little out.
  const spec = OYOROI.kusazuri;
  const from = (1 - box.bottom) * trunk;
  const skirt = [
    { at: [depth, from, 0], rest: [0.18, -1, 0], span: spec.front, turn: 0 },
    { at: [-depth, from, 0], rest: [-0.18, -1, 0], span: spec.front, turn: Math.PI },
    { at: [0, from, width], rest: [0, -1, 0.18], span: spec.side, turn: -Math.PI / 2 },
    { at: [0, from, -width - thick * 1.5], rest: [0, -1, -0.18], span: spec.side, turn: Math.PI / 2 },
  ];
  for (const panel of skirt) {
    const board = lacedBoard(panel.span * scale, spec.height * scale, thick, armor, OYOROI.rowsPerMetre);
    hang(hips, panel.at, panel.rest, spec.height * scale, spec, board, panel.turn);
  }
  for (const dangle of dangles) inkAll(dangle.group, 0.0022);
  return dangles;
}
