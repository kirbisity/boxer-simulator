// The Chinese soldiers' helmets drawn (chinahelms.js the data): the Ming rank and file's four designs, the Han lamellar
// hood, and the tassels and plumes that swing. The fine work (plate seams, rivets, cloud scrolls, lamellae, lacing, the
// painted 勇) is baked once per design and finish into a colour map and a normal map drawn on a canvas.

/* global THREE */

import { BRIM_V, brimGrid, CHINA_FINISHES, finialTop, HAN_HOOD, MING_HELMS, QING_HELMS, rimPath, shellEdge, shellGrid, shellV, SHELL_V, swingStep, SWING, tasselStrands, TASSELS } from './chinahelms.js';
import { surface } from './toon.js';

const CHINA_TURN = Math.PI * 2;
const CHINA_SHEET = [1024, 512];
const chinaSheets = new Map();

/** Where the glyph's font is missing, its strokes (a unit box, y down), drawn as a brush would. */
const CHINA_YONG_STROKES = [
  [[0.26, 0.08], [0.7, 0.08], [0.52, 0.2]],
  [[0.47, 0.17], [0.57, 0.25]],
  [[0.22, 0.29], [0.22, 0.63]],
  [[0.22, 0.29], [0.78, 0.29], [0.78, 0.63]],
  [[0.22, 0.46], [0.78, 0.46]],
  [[0.22, 0.62], [0.78, 0.62]],
  [[0.5, 0.29], [0.5, 0.62]],
  [[0.16, 0.74], [0.84, 0.74], [0.8, 0.95], [0.68, 0.91]],
  [[0.5, 0.62], [0.47, 0.8], [0.18, 0.98]],
];

/** Whether the page can draw 勇 in a CJK font (else a tofu box: the same as a character no font has). */
let chinaCjkFont = null;
function chinaHasCjkFont(font) {
  if (chinaCjkFont !== null) return chinaCjkFont;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const g = canvas.getContext('2d');
  const draw = (text) => {
    g.clearRect(0, 0, 48, 48);
    g.font = `40px ${font}`;
    g.fillText(text, 4, 40);
    return g.getImageData(0, 0, 48, 48).data.join(',');
  };
  chinaCjkFont = draw('勇') !== draw('\u{F0000}') && draw('勇') !== draw('\u{F0001}');
  return chinaCjkFont;
}
const CHINA_GLYPH_FONT = '"Noto Serif SC", "Songti SC", "STSong", "SimSun", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", serif';

/** A colour canvas and a height canvas drawn together. */
function chinaPair([width, height]) {
  const make = () => Object.assign(document.createElement('canvas'), { width, height });
  const colour = make();
  const relief = make();
  return { colour, relief, c: colour.getContext('2d'), h: relief.getContext('2d'), width, height };
}

/** The relief as a tangent-space normal map. */
function chinaNormalCanvas(relief, strength) {
  const { width, height } = relief;
  const source = relief.getContext('2d').getImageData(0, 0, width, height).data;
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const g = out.getContext('2d');
  const image = g.createImageData(width, height);
  const at = (x, y) => source[(((y + height) % height) * width + ((x + width) % width)) * 4] / 255;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Canvas rows run down; the sheet's v runs up.
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const length = Math.hypot(dx, dy, 1);
      const index = (y * width + x) * 4;
      image.data[index] = (0.5 - dx / length / 2) * 255;
      image.data[index + 1] = (0.5 - dy / length / 2) * 255;
      image.data[index + 2] = (0.5 + 0.5 / length) * 255;
      image.data[index + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  return out;
}

/** A small deterministic random. */
function chinaViewSeeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * A design's sheet in a finish: { map, normalMap }, made once. The sheet's x runs once round (the face at the middle), its y
 * down from the top (v = 1) to the brim's strip at the bottom.
 */
function chinaDesignSheet(key, design, finishName, lace) {
  const id = `${key}|${finishName}|${lace ?? ''}`;
  if (chinaSheets.has(id)) return chinaSheets.get(id);
  const finish = CHINA_FINISHES[finishName];
  const p = chinaPair(CHINA_SHEET);
  const { c, h, width, height } = p;
  const span = shellV(design);
  const round = CHINA_TURN * ((design.ellipse[0] + design.ellipse[1]) / 2);
  // Pixels per head radius round and up; x of an azimuth, y of a height.
  const perU = width / round;
  const perV = (height * (1 - SHELL_V)) / span.length;
  const xOf = (theta) => (0.5 - theta / CHINA_TURN) * width;
  const yOf = (y) => (1 - span.at(y)) * height;
  const random = chinaViewSeeded(key.length * 97 + finishName.length);
  c.fillStyle = finish.colour;
  c.fillRect(0, 0, width, height);
  h.fillStyle = '#808080';
  h.fillRect(0, 0, width, height);
  // Hammering (raised iron) and, on the lacquer, its brushing: soft dents, a mottle of the colour.
  for (let index = 0; index < 1400; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const size = 2 + random() * 6;
    h.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${finish.glyph ? 0.03 : 0.08})`;
    h.beginPath();
    h.arc(x, y, size, 0, CHINA_TURN);
    h.fill();
    c.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${finish.glyph ? 0.025 : 0.05})`;
    c.beginPath();
    c.arc(x, y, size * 1.6, 0, CHINA_TURN);
    c.fill();
  }
  const rivet = (x, y, size, colour) => {
    const shine = h.createRadialGradient(x, y, 0, x, y, size);
    shine.addColorStop(0, '#ffffff');
    shine.addColorStop(1, 'rgba(128,128,128,0)');
    h.fillStyle = shine;
    h.beginPath();
    h.arc(x, y, size, 0, CHINA_TURN);
    h.fill();
    c.fillStyle = colour;
    c.beginPath();
    c.arc(x, y, size * 0.8, 0, CHINA_TURN);
    c.fill();
  };
  const foot = design.profile[0][0];
  const top = design.profile.at(-1)[0];
  const light = finish.accent ?? '#d8dce2';
  // The plates' seams: one plate's edge laid over the next, riveted down it (or a raised strip over it, riveted).
  if (design.plates) {
    for (let plate = 0; plate < design.plates; plate += 1) {
      const theta = -Math.PI + (CHINA_TURN * (plate + 0.5)) / design.plates;
      for (const shift of [-width, 0, width]) {
        const x = xOf(theta) + shift;
        const strip = design.strips ? 0.13 * perU : 0.05 * perU;
        const ramp = h.createLinearGradient(x - strip, 0, x + strip, 0);
        ramp.addColorStop(0, '#808080');
        ramp.addColorStop(0.15, design.strips ? '#d0d0d0' : '#a8a8a8');
        ramp.addColorStop(0.85, design.strips ? '#d0d0d0' : '#a8a8a8');
        ramp.addColorStop(1, design.strips ? '#808080' : '#606060');
        h.fillStyle = ramp;
        h.fillRect(x - strip, 0, strip * 2, yOf(foot));
        if (design.strips) {
          c.fillStyle = 'rgba(255,255,255,0.2)';
          c.fillRect(x - strip * 0.8, 0, strip * 1.6, yOf(foot));
          c.fillStyle = 'rgba(0,0,0,0.45)';
          for (const edge of [-strip, strip * 0.85]) c.fillRect(x + edge, 0, Math.max(2, strip * 0.15), yOf(foot));
        } else {
          c.fillStyle = 'rgba(0,0,0,0.35)';
          c.fillRect(x + strip * 0.8, 0, Math.max(2, strip * 0.25), yOf(foot));
          c.fillStyle = finish.accent ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.1)';
          c.fillRect(x - strip, 0, Math.max(1.5, strip * 0.2), yOf(foot));
        }
        if (design.rivets) {
          for (let y = foot + 0.3; y < top - 0.25; y += 0.2) rivet(x, yOf(y), 0.035 * perU, design.strips ? '#e2e5e9' : light);
        }
      }
    }
  }
  // Cloud scrolls (如意云) cut on each plate, light on the blackened steel.
  if (design.scroll) {
    c.strokeStyle = light;
    h.strokeStyle = '#5a5a5a';
    for (let plate = 0; plate < design.plates; plate += 1) {
      const middle = xOf(-Math.PI + (CHINA_TURN * plate) / design.plates);
      for (const shift of [-width, 0, width]) {
        const cx = middle + shift;
        const cy = yOf(foot + (top - foot) * 0.42);
        const size = 0.27 * perU;
        for (const g of [c, h]) {
          g.lineWidth = Math.max(2, size * 0.28);
          g.lineCap = 'round';
          for (const side of [-1, 1]) {
            g.beginPath();
            g.arc(cx + side * size * 0.75, cy, size * 0.55, side > 0 ? Math.PI : 0, side > 0 ? Math.PI * 2.6 : -Math.PI * 1.6, side < 0);
            g.stroke();
          }
          g.beginPath();
          g.arc(cx, cy - size * 0.75, size * 0.62, Math.PI * 0.15, Math.PI * 0.85, true);
          g.stroke();
          g.beginPath();
          g.moveTo(cx, cy + size * 0.2);
          g.quadraticCurveTo(cx + size * 0.2, cy + size * 1.4, cx - size * 0.1, cy + size * 2.2);
          g.stroke();
        }
      }
    }
  }
  // The band round the foot: polished, riveted, standing a little proud.
  if (design.band) {
    const y0 = yOf(foot + 0.2);
    const y1 = yOf(foot);
    h.fillStyle = '#c0c0c0';
    h.fillRect(0, y0, width, y1 - y0);
    h.fillStyle = '#909090';
    h.fillRect(0, y0, width, 2);
    c.fillStyle = finish.glyph ? finish.colour : design.strips ? 'rgba(255,255,255,0.18)' : light;
    c.globalAlpha = design.strips ? 1 : 0.85;
    c.fillRect(0, y0, width, y1 - y0);
    c.globalAlpha = 1;
    if (design.rivets) for (let i = 0; i < 40; i += 1) rivet(((i + 0.5) / 40) * width, (y0 + y1) / 2, 0.035 * perU, '#e6e8ec');
  }
  // 勇 in gold on the front, where the Prince of Liang's helmet and the arsenals' have it: big, on the bowl's face.
  if (design.glyph && finish.glyph) {
    const tall = 0.95 * perV;
    const wide = 0.95 * perU;
    const cx = xOf(0);
    const cy = yOf(foot + (top - foot) * 0.47);
    const ink = (g, colour) => {
      g.save();
      g.translate(cx, cy);
      g.fillStyle = colour;
      g.strokeStyle = colour;
      if (chinaHasCjkFont(CHINA_GLYPH_FONT)) {
        g.scale(wide / 100, tall / 100);
        g.font = `bold 100px ${CHINA_GLYPH_FONT}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(design.glyph, 0, 4);
      } else {
        g.translate(-wide / 2, -tall / 2);
        g.scale(wide, tall);
        g.lineWidth = 0.1;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        for (const stroke of CHINA_YONG_STROKES) {
          g.beginPath();
          stroke.forEach(([x, y], index) => (index ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
      }
      g.restore();
    };
    ink(c, finish.glyph);
    ink(h, '#8c8c8c');
  }
  // The Han hood: vertical lamellae, each over the next, laced in rows (a red stitch through each).
  if (design.lamellae) {
    const n = design.lamellae;
    for (let k = 0; k < n; k += 1) {
      const x0 = (k / n) * width;
      const x1 = ((k + 1) / n) * width;
      const ramp = h.createLinearGradient(x0, 0, x1, 0);
      ramp.addColorStop(0, '#6c6c6c');
      ramp.addColorStop(0.15, '#888888');
      ramp.addColorStop(0.9, '#949494');
      ramp.addColorStop(1, '#9a9a9a');
      h.fillStyle = ramp;
      h.fillRect(x0, 0, x1 - x0, height * (1 - BRIM_V));
      c.fillStyle = `rgba(${random() < 0.5 ? '0,0,0' : '255,255,255'},${0.04 + random() * 0.08})`;
      c.fillRect(x0, 0, x1 - x0, height);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.fillRect(x0, 0, 1.5, height);
      for (const row of design.laceRows) {
        for (const dy of [0, row < 0 ? 0.16 : 0]) {
          const x = (x0 + x1) / 2;
          const y = yOf(row + dy);
          c.fillStyle = lace ?? finish.lace;
          c.beginPath();
          c.ellipse(x, y, 0.026 * perU, 0.034 * perV, 0, 0, CHINA_TURN);
          c.fill();
          rivet(x, y, 0.032 * perU, lace ?? finish.lace);
        }
      }
    }
  }
  // The brim's strip: plain, its edge turned and a little brighter.
  const brimTop = height * (1 - BRIM_V);
  c.fillStyle = finish.colour;
  c.fillRect(0, brimTop, width, height - brimTop);
  c.fillStyle = 'rgba(255,255,255,0.12)';
  c.fillRect(0, height - height * BRIM_V * 0.2, width, height * BRIM_V * 0.2);
  h.fillStyle = '#808080';
  h.fillRect(0, brimTop, width, height - brimTop);
  const map = new THREE.CanvasTexture(p.colour);
  map.encoding = THREE.sRGBEncoding;
  const normalMap = new THREE.CanvasTexture(chinaNormalCanvas(p.relief, 3));
  for (const texture of [map, normalMap]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  const sheet = { map, normalMap, glyphFont: design.glyph && finish.glyph ? chinaHasCjkFont(CHINA_GLYPH_FONT) : null, canvas: p.colour };
  chinaSheets.set(id, sheet);
  return sheet;
}

/** A grid (chinahelms.js) as a mesh, scaled to the head radius `r`. */
function chinaGridMesh({ positions, uvs, indices }, material, r) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map((value) => value * r), 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/** The helmet's metal in its finish, wearing its sheet. */
function chinaFinish(steel, finish, sheet) {
  const material = steel.clone();
  material.color = new THREE.Color(sheet ? 0xffffff : finish.colour);
  Object.assign(material, { vertexColors: false, metalness: finish.metalness, roughness: finish.roughness, side: THREE.DoubleSide });
  if (sheet) Object.assign(material, { map: sheet.map, normalMap: sheet.normalMap });
  // In a crowd (crowdview.js bakePieces): the finish's own colour, without its sheet.
  material.userData = { ...material.userData, crowdColor: new THREE.Color(finish.colour).getHex() };
  material.needsUpdate = true;
  return material;
}

/** A design's finial: a knob, or a tube (with the tube's mouth). */
function chinaFinials(design, r, material) {
  const top = design.profile.at(-1)[0];
  const finial = design.finial;
  if (!finial) return [];
  if (finial.kind === 'knob') {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(finial.r * r, 12, 8), material);
    knob.scale.y = 0.8;
    knob.position.y = (top + finial.r * 0.6) * r;
    return [knob];
  }
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(finial.r * 0.8 * r, finial.r * r, finial.h * r, 12, 1), material);
  tube.position.y = (top + finial.h / 2 - 0.02) * r;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(finial.r * 1.5 * r, finial.r * 2.4 * r, 0.06 * r, 12), material);
  collar.position.y = (top + 0.01) * r;
  return [tube, collar];
}

/**
 * The Ming soldier's helmet in its design (MING_HELMS: `head.design`, its finish `head.finish`): the fitted bowl wearing its
 * sheet, the brim, the finial and its plume, the chin cords. Returns the meshes it added.
 */
export function buildMingDesignHelm(group, head, r, steel, { lowDetail = false } = {}) {
  // (The banners' helmets are drawn the same way: QING_HELMS.)
  const design = MING_HELMS[head.design] ?? QING_HELMS[head.design];
  if (!design) return false;
  const finish = CHINA_FINISHES[head.finish ?? design.finish];
  const sheet = chinaDesignSheet(head.design, design, head.finish ?? design.finish);
  const material = chinaFinish(steel, finish, sheet);
  const seg = lowDetail ? { rows: 12, cols: 24 } : { rows: 22, cols: 48 };
  const bowl = chinaGridMesh(shellGrid(design, seg), material, r);
  bowl.name = 'helm-bowl';
  const brim = chinaGridMesh(brimGrid(design, seg), material, r);
  brim.name = 'helm-brim';
  group.add(bowl, brim);
  // The top: closed where nothing stands on it.
  const plain = chinaFinish(steel, finish, null);
  // A tube of its own finish (`finial.finish`: the banners' gilt tube on a black bowl).
  const tube = design.finial?.finish ? chinaFinish(steel, CHINA_FINISHES[design.finial.finish], null) : plain;
  for (const mesh of chinaFinials(design, r, tube)) group.add(mesh);
  if (!design.finial) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.04 * r, 8, 6), plain);
    tip.position.y = design.profile.at(-1)[0] * r;
    group.add(tip);
  }
  // The kit's own plume where it gives one (`head.plume`), else the design's.
  const plume = TASSELS[head.plume] ? head.plume : design.plume;
  if (plume && !lowDetail) group.add(buildTassel(TASSELS[plume], r, { at: [0, finialTop(design) - 0.03, 0] }));
  else if (plume) group.add(buildTassel({ ...TASSELS[plume], count: 10 }, r, { at: [0, finialTop(design) - 0.03, 0], still: true }));
  if (design.cords) {
    // Red chin cords from under the brim at the sides to under the jaw.
    const cord = surface(0xa81a1a, { roughness: 0.85 });
    for (const side of [1, -1]) {
      const from = new THREE.Vector3(-0.05 * r, design.profile[0][0] * r, side * 0.9 * r);
      const to = new THREE.Vector3(0.25 * r, -1.28 * r, side * 0.32 * r);
      const length = from.distanceTo(to);
      const piece = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * r, 0.018 * r, length, 5), cord);
      piece.position.copy(from).add(to).multiplyScalar(0.5);
      piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      piece.userData.noOutline = true;
      group.add(piece);
    }
  }
  return true;
}

/**
 * The Western Han lamellar hood (HAN_HOOD): the lamellae and lacing in its sheet, the padded cloth rim round the face and
 * the hem, the flat top disc edged in red cord, the thin tube and the pheasant feathers.
 */
export function buildHanHood(group, head, r, steel, { lowDetail = false } = {}) {
  const design = HAN_HOOD;
  const finish = CHINA_FINISHES[design.finish];
  const lace = head.cord ?? finish.lace;
  const sheet = chinaDesignSheet('hanHood', design, design.finish, lace);
  const material = chinaFinish(steel, finish, sheet);
  const seg = lowDetail ? { rows: 14, cols: 28 } : { rows: 26, cols: 56 };
  const shell = chinaGridMesh(shellGrid(design, seg), material, r);
  shell.name = 'helm-hood';
  group.add(shell);
  // The padded rim: a thick roll of cloth along the hood's whole lower edge.
  const rim = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPath(design).map(([x, y, z]) => new THREE.Vector3(x * r, y * r, z * r)), true), lowDetail ? 48 : 120, design.rim.r * r, 6, true),
    surface(new THREE.Color(design.rim.colour).getHex(), { roughness: 0.9 }),
  );
  rim.name = 'helm-rim';
  group.add(rim);
  // The top disc and its red cord, the tube.
  const top = design.profile.at(-1)[0];
  const plain = chinaFinish(steel, finish, null);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(design.top.r * 0.92 * r, design.top.r * r, 0.06 * r, 20), plain);
  disc.position.y = (top + 0.02) * r;
  const cord = new THREE.Mesh(new THREE.TorusGeometry(design.top.r * r, 0.03 * r, 5, 28), surface(new THREE.Color(lace).getHex(), { roughness: 0.85 }));
  cord.rotation.x = Math.PI / 2;
  cord.position.y = (top + 0.01) * r;
  cord.userData.noOutline = true;
  group.add(disc, cord, ...chinaFinials(design, r, plain));
  group.add(buildTassel(TASSELS[design.plume], r, { at: [0, finialTop(design) - 0.04, 0], still: lowDetail }));
  return true;
}

/** Whether a hood's edge leaves the face open at azimuth θ (tests, shots). */
export const hoodEdgeAt = (theta) => shellEdge(HAN_HOOD, theta);

// ---- Tassels and plumes ---------------------------------------------------------------------------------------------------

let chinaFeatherTexture = null;
/** A pheasant's tail feather: barred buff and black down a pale shaft, its edges ragged (alpha). */
function chinaFeatherMap() {
  if (chinaFeatherTexture) return chinaFeatherTexture;
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 512 });
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 64, 512);
  for (let y = 0; y < 512; y += 1) {
    const band = Math.sin((y / 512) * Math.PI * 22) > 0.35;
    g.fillStyle = band ? '#2a1d14' : '#b08a58';
    const ragged = 26 - Math.abs(Math.sin(y * 0.37) * 3) - (y > 470 ? (y - 470) * 0.6 : 0);
    g.fillRect(32 - ragged, 511 - y, ragged * 2, 1);
  }
  g.fillStyle = '#e8dcc0';
  g.fillRect(31, 0, 2, 512);
  chinaFeatherTexture = new THREE.CanvasTexture(canvas);
  chinaFeatherTexture.encoding = THREE.sRGBEncoding;
  return chinaFeatherTexture;
}

/**
 * A tassel or plume (TASSELS spec) bound at `at` (head radii, in the helmet's frame), as ribbons of hair (or feathers), kept
 * out of the helmet's `hull` ([y, radius] up the axis, head radii) as it swings. The mesh carries its swing
 * (`userData.swing`: update(dt, hitAt, time) each frame; render.js), unless `still` (a crowd's).
 */
export function buildTassel(spec, r, { at, hull = null, still = false, colour = spec.colour } = {}) {
  const strands = tasselStrands(spec);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(strands.positions.length);
  for (let index = 0; index < positions.length; index += 1) positions[index] = (strands.positions[index] + at[index % 3]) * r;
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(strands.uvs, 2));
  const base = new THREE.Color(colour);
  const colours = new Float32Array(strands.shades.length * 3);
  strands.shades.forEach((shade, index) => colours.set([base.r * shade, base.g * shade, base.b * shade], index * 3));
  if (spec.feather) colours.fill(1);
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(strands.indices);
  geometry.computeVertexNormals();
  const material = surface(0xffffff, { vertexColors: true, roughness: spec.feather ? 0.8 : 0.95 });
  material.side = THREE.DoubleSide;
  if (spec.feather) Object.assign(material, { map: chinaFeatherMap(), alphaTest: 0.5 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = spec.feather ? 'helm-feathers' : 'helm-tassel';
  mesh.userData.noOutline = true;
  mesh.userData.tassel = { at, length: spec.length, rest: strands.rest };
  if (!still) mesh.userData.swing = chinaTasselSwing(mesh, spec, r, at, strands, hull);
  return mesh;
}

const chinaSwingScratch = { matrix: null, inverse: null, pivot: null, rest: null, target: null, dir: null, q: null, identity: null, v: null };

/** A tassel mesh's swing: a damped spring (chinahelms.js swingStep) on its tip, bending its strands after it. */
function chinaTasselSwing(mesh, spec, r, at, strands, hull) {
  const s = chinaSwingScratch;
  if (!s.q) Object.assign(s, { inverse: new THREE.Matrix4(), pivot: new THREE.Vector3(), rest: new THREE.Vector3(), target: new THREE.Vector3(), dir: new THREE.Vector3(), q: new THREE.Quaternion(), identity: new THREE.Quaternion(), v: new THREE.Vector3(), tip: new THREE.Vector3() });
  const restPositions = Float32Array.from(mesh.geometry.attributes.position.array);
  const weights = strands.weights;
  const bind = new THREE.Vector3(...at).multiplyScalar(r);
  const restLocal = new THREE.Vector3(...strands.rest);
  let state = null;
  let lastHit = null;
  let bent = false;
  const swing = {
    angle: 0,
    get state() { return state; },
    kick(direction, speed) {
      if (!state) return;
      for (let axis = 0; axis < 3; axis += 1) state.velocity[axis] += direction[axis] * speed;
    },
    update(dt, hitAt = null, time = 0) {
      const parent = mesh.parent;
      if (!parent || !(dt > 0)) return;
      parent.updateWorldMatrix(true, false);
      const matrix = parent.matrixWorld;
      s.pivot.copy(bind).applyMatrix4(matrix);
      s.tip.copy(bind).addScaledVector(restLocal, spec.length * r).applyMatrix4(matrix);
      const length = s.tip.distanceTo(s.pivot);
      s.rest.copy(restLocal).transformDirection(matrix);
      s.target.copy(s.rest).lerp(s.v.set(0, -1, 0), spec.hang);
      if (s.target.lengthSq() < 1e-6) s.target.copy(s.rest);
      s.target.normalize();
      state = swingStep(state, { pivot: s.pivot.toArray(), target: s.target.toArray(), length, stiffness: spec.stiffness, damping: spec.damping }, dt);
      // A blow to the head throws it.
      if (hitAt !== null && hitAt !== lastHit && time - hitAt >= 0 && time - hitAt < 0.2) {
        lastHit = hitAt;
        const angle = Math.random() * CHINA_TURN;
        swing.kick([Math.cos(angle), 0.4, Math.sin(angle)], SWING.hitSpeed);
      }
      // Its direction now, in the helmet's frame, as a turn from rest (no more than `reach`).
      s.dir.set(state.tip[0] - s.pivot.x, state.tip[1] - s.pivot.y, state.tip[2] - s.pivot.z).normalize();
      s.inverse.copy(matrix).invert();
      s.dir.transformDirection(s.inverse);
      s.q.setFromUnitVectors(restLocal, s.dir);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(s.q.w)));
      if (angle > spec.reach) s.q.slerp(s.identity, 1 - spec.reach / angle);
      swing.angle = Math.min(angle, spec.reach);
      if (swing.angle < 0.004 && !bent) return;
      bent = swing.angle >= 0.004;
      const position = mesh.geometry.attributes.position;
      const array = position.array;
      for (let vertex = 0; vertex < weights.length; vertex += 1) {
        const i = vertex * 3;
        s.v.set(restPositions[i] - bind.x, restPositions[i + 1] - bind.y, restPositions[i + 2] - bind.z);
        const weight = weights[vertex];
        const x0 = s.v.x;
        const y0 = s.v.y;
        const z0 = s.v.z;
        s.v.applyQuaternion(s.q);
        let x = bind.x + x0 + (s.v.x - x0) * weight;
        const y = bind.y + y0 + (s.v.y - y0) * weight;
        let z = bind.z + z0 + (s.v.z - z0) * weight;
        // Kept out of the helmet.
        if (hull && weight > 0) {
          const need = chinaHullAt(hull, y / r) * r;
          const out = Math.hypot(x, z);
          if (need > 0 && out < need) {
            const scale = need / Math.max(out, 1e-6);
            x *= scale;
            z *= scale;
          }
        }
        array[i] = x;
        array[i + 1] = y;
        array[i + 2] = z;
      }
      position.needsUpdate = true;
    },
  };
  return swing;
}

/** A hull's radius at height y (0 outside it). */
function chinaHullAt(hull, y) {
  if (y < hull[0][0] || y > hull.at(-1)[0]) return 0;
  for (let i = 1; i < hull.length; i += 1) {
    if (y <= hull[i][0]) {
      const [y0, r0] = hull[i - 1];
      const [y1, r1] = hull[i];
      return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
    }
  }
  return 0;
}

/** The sheet a design is drawn with (shots: whether the glyph's font was there). */
export function chinaSheetInfo(key, finish) {
  const design = key === 'hanHood' ? HAN_HOOD : MING_HELMS[key];
  const sheet = chinaDesignSheet(key, design, finish ?? design.finish);
  return { glyphFont: sheet.glyphFont, width: sheet.canvas.width, height: sheet.canvas.height };
}
