// The container port at night: the quay edge (a concrete capping beam,
// rubber fenders on the face, cast-iron bollards), the box ship moored
// along it (plated hull, rubbing strake, draught marks, superstructure,
// boxes on her hatch covers, mooring lines to the bollards), the stacks of
// ISO containers (corrugated steel, corner posts and castings, door ends
// with their locking bars), two ship-to-shore gantry cranes, the sodium
// lamps over the yard, and the drums and pallets by the stacks.
//
// Built with the kit in src/props/arena.js: one merged geometry per
// material, colours per vertex (company paint, rust, wet grime), surfaces
// painted on canvas with normal maps.

/* global THREE */
import { arenaAt, arenaBuilder, arenaFinish, arenaMaterial, arenaPainted, arenaRandom, arenaRun, arenaSheet, arenaSmooth, arenaWood } from './arena.js';

// ---- surfaces ------------------------------------------------------------------

/**
 * A container's corrugated steel, 2.0 m by the box's 2.59 m height a
 * repeat: trapezoidal corrugations at 0.28 m pitch (seven a repeat), paint
 * in a light neutral (the box's colour is laid over it per vertex), rust
 * weeping from the top rail and scabbing along the bottom, scrapes, dents.
 */
function harbourCorrugated() {
  return arenaPainted('corrugated', () => {
    const s = arenaSheet(512, '#d6d6d4', 0.5, 31);
    const { rr } = s;
    const pitch = 512 / 7;
    for (let rib = 0; rib < 7; rib += 1) {
      const x = rib * pitch;
      // Out-flat, slope, in-flat, slope: the height steps, the blur rounds the bends.
      s.rect(x, 0, pitch * 0.36, 512, null, 0.78);
      s.rect(x + pitch * 0.36, 0, pitch * 0.14, 512, 'rgba(0,0,0,0.04)', 0.5);
      s.rect(x + pitch * 0.5, 0, pitch * 0.36, 512, 'rgba(0,0,0,0.06)', 0.22);
      s.rect(x + pitch * 0.86, 0, pitch * 0.14, 512, 'rgba(255,255,255,0.05)', 0.5);
    }
    // A dent or two: the height pushed in, the paint cracked round it.
    for (let index = 0; index < 3; index += 1) s.blob(rr(0, 512), rr(80, 440), rr(20, 50), rr(15, 40), rr(0, 3), null, 0.35, 0.45);
    // Rust weeping down from the top rail and from scratches.
    for (let index = 0; index < 70; index += 1) {
      const x = rr(0, 512);
      const y = index < 40 ? rr(0, 20) : rr(40, 470);
      const length = rr(30, 200);
      s.line([[x, y], [x + rr(-4, 4), y + length]], rr(1.5, 6), `rgba(${Math.round(rr(110, 150))},${Math.round(rr(55, 75))},${Math.round(rr(25, 40))},${rr(0.12, 0.35)})`, null);
      if (index >= 40) s.blob(x, y, rr(2, 6), rr(2, 4), 0, 'rgba(105,55,28,0.7)', 0.4);
    }
    // Scabbed rust and grime along the bottom, where the water stands.
    for (let index = 0; index < 160; index += 1) s.blob(rr(0, 512), rr(460, 512), rr(4, 22), rr(3, 12), rr(0, 3), `rgba(${Math.round(rr(90, 140))},${Math.round(rr(50, 70))},${Math.round(rr(25, 40))},${rr(0.3, 0.7)})`, rr(0.4, 0.55), 0.5);
    // Scrapes from the forklift tines and the spreader: bright bare streaks.
    for (let index = 0; index < 25; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-60, 60), y + rr(-6, 6)]], rr(1, 2.5), `rgba(${rr(0, 1) < 0.5 ? '235,235,230' : '120,80,50'},${rr(0.3, 0.6)})`, null);
    }
    for (let index = 0; index < 2000; index += 1) s.rect(rr(0, 512), rr(0, 512), rr(1, 3), rr(1, 3), `rgba(60,55,50,${rr(0.03, 0.12)})`, null);
    return arenaFinish(s, { relief: 22, blur: 2 });
  });
}

/** The ship's shell plating, 8 by 4 m a repeat: strakes 2 m deep, butts staggered, weld beads proud, rust weeping, fender scrapes. */
function harbourPlating() {
  return arenaPainted('plating', () => {
    const s = arenaSheet(512, '#8e9195', 0.5, 17);
    const { rr } = s;
    const strake = 256;
    for (let row = 0; row < 2; row += 1) {
      const y = row * strake;
      // Each plate painted at a slightly different time.
      const butt = rr(60, 450);
      s.rect(0, y, butt, strake, `rgba(${rr(0, 1) < 0.5 ? '255,255,255' : '0,0,0'},${rr(0.02, 0.06)})`, null);
      s.rect(butt - 1.5, y, 3, strake, 'rgba(60,60,62,0.5)', 0.72);
      s.rect(0, y - 1.5, 512, 3, 'rgba(60,60,62,0.5)', 0.72);
      // Plates dish in a little between the frames behind them.
      for (let frame = 0; frame < 11; frame += 1) s.rect(frame * 46.5 - 10, y + 6, 20, strake - 12, null, 0.47, 0.5);
    }
    for (let index = 0; index < 60; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-3, 3), y + rr(40, 220)]], rr(2, 7), `rgba(${Math.round(rr(120, 160))},${Math.round(rr(60, 80))},${Math.round(rr(30, 45))},${rr(0.15, 0.4)})`, null);
    }
    for (let index = 0; index < 18; index += 1) s.blob(rr(0, 512), rr(250, 500), rr(20, 60), rr(4, 14), rr(-0.2, 0.2), `rgba(${rr(0, 1) < 0.5 ? '190,190,185' : '120,70,40'},${rr(0.2, 0.45)})`, 0.45, 0.4);
    for (let index = 0; index < 2500; index += 1) s.rect(rr(0, 512), rr(0, 512), rr(1, 3), rr(1, 3), `rgba(40,40,45,${rr(0.04, 0.12)})`, null);
    return arenaFinish(s, { relief: 6, blur: 1 });
  });
}

/** Cast concrete, 2 m a repeat: aggregate, blowholes, formwork joints, stains. */
function harbourConcrete() {
  return arenaPainted('quay-concrete', () => {
    const s = arenaSheet(512, '#7d7c78', 0.5, 13);
    const { rr } = s;
    for (let index = 0; index < 90; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(15, 70), rr(10, 50), rr(0, 3), `rgba(${rr(0, 1) < 0.5 ? '40,40,38' : '150,148,140'},${rr(0.04, 0.1)})`, null);
    for (let index = 0; index < 4000; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(0.6, 2), rr(0.6, 2), 0, `rgba(${Math.round(rr(70, 160))},${Math.round(rr(70, 155))},${Math.round(rr(65, 145))},${rr(0.3, 0.6)})`, rr(0.45, 0.6), 0.6);
    for (let index = 0; index < 150; index += 1) s.blob(rr(0, 512), rr(0, 512), rr(1, 3), rr(1, 3), 0, 'rgba(30,30,30,0.6)', 0.2);
    s.rect(0, 254, 512, 3, 'rgba(50,50,48,0.4)', 0.35);
    for (let index = 0; index < 40; index += 1) {
      const x = rr(0, 512);
      const y = rr(0, 512);
      s.line([[x, y], [x + rr(-2, 2), y + rr(30, 150)]], rr(2, 8), `rgba(45,42,38,${rr(0.06, 0.16)})`, null);
    }
    return arenaFinish(s, { relief: 4, blur: 1 });
  });
}

/** Painted steel in general (cranes, lamp posts, drums, container frames), 1.5 m a repeat: chips, rust spots, runs of grime. */
function harbourSteel() {
  return arenaPainted('painted-steel', () => {
    const s = arenaSheet(256, '#d0d0ce', 0.5, 41);
    const { rr } = s;
    for (let index = 0; index < 40; index += 1) s.blob(rr(0, 256), rr(0, 256), rr(1, 5), rr(1, 4), rr(0, 3), `rgba(${Math.round(rr(110, 150))},${Math.round(rr(55, 75))},${Math.round(rr(25, 40))},${rr(0.4, 0.8)})`, 0.4);
    for (let index = 0; index < 30; index += 1) {
      const x = rr(0, 256);
      const y = rr(0, 256);
      s.line([[x, y], [x, y + rr(15, 90)]], rr(1, 4), `rgba(${rr(0, 1) < 0.5 ? '120,65,35' : '50,48,45'},${rr(0.1, 0.25)})`, null);
    }
    for (let index = 0; index < 800; index += 1) s.rect(rr(0, 256), rr(0, 256), rr(1, 2), rr(1, 2), `rgba(50,50,50,${rr(0.04, 0.12)})`, null);
    return arenaFinish(s, { relief: 3, blur: 1 });
  });
}

const HARBOUR_LINES = ['MAERA', 'KOSCO', 'HAPAG', 'ONELINE', 'EVERGO', 'NYKO', 'CMAS', 'YANGLU'];
const HARBOUR_PAINT = ['#8a2a1e', '#1f4f7a', '#2f6a3a', '#b5651d', '#6a6e74', '#d8d4c8', '#7a2a52', '#1d6a6a'];

/** The lines' names as the boxes carry them: white letters (dark on the pale box), each with its mark, worn. Two columns by four rows. */
function harbourLogos() {
  return arenaPainted('logos', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const g = canvas.getContext('2d');
    const random = arenaRandom(5);
    HARBOUR_LINES.forEach((name, index) => {
      const x0 = (index % 2) * 512;
      const y0 = Math.floor(index / 2) * 128;
      const ink = index === 5 ? '#1f3550' : '#f4f2ea';
      g.fillStyle = ink;
      // The mark: a disc, a star, a chevron, a block, alternating by line.
      const kind = index % 4;
      g.beginPath();
      if (kind === 0) g.arc(x0 + 60, y0 + 64, 38, 0, Math.PI * 2);
      else if (kind === 1) for (let k = 0; k < 10; k += 1) g.lineTo(x0 + 60 + Math.cos((k * Math.PI) / 5 - Math.PI / 2) * (k % 2 ? 17 : 40), y0 + 64 + Math.sin((k * Math.PI) / 5 - Math.PI / 2) * (k % 2 ? 17 : 40));
      else if (kind === 2) {
        g.moveTo(x0 + 22, y0 + 30);
        g.lineTo(x0 + 60, y0 + 64);
        g.lineTo(x0 + 98, y0 + 30);
        g.lineTo(x0 + 98, y0 + 60);
        g.lineTo(x0 + 60, y0 + 98);
        g.lineTo(x0 + 22, y0 + 60);
      } else g.rect(x0 + 24, y0 + 28, 72, 72);
      g.fill();
      g.font = 'bold 76px "Arial Black", Arial, sans-serif';
      g.textBaseline = 'middle';
      g.save();
      g.translate(x0 + 120, y0 + 66);
      g.scale(Math.min(1, 370 / g.measureText(name).width), 1);
      g.fillText(name, 0, 0);
      g.restore();
    });
    // Weathered: paint lost in flecks and runs.
    g.globalCompositeOperation = 'destination-out';
    for (let index = 0; index < 5000; index += 1) {
      g.fillStyle = `rgba(0,0,0,${0.3 + random() * 0.7})`;
      g.fillRect(random() * 1024, random() * 512, 1 + random() * 3, 1 + random() * 2);
    }
    for (let index = 0; index < 120; index += 1) {
      g.fillStyle = `rgba(0,0,0,${0.2 + random() * 0.3})`;
      g.fillRect(random() * 1024, random() * 512, 1 + random() * 3, 10 + random() * 40);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  });
}

/**
 * The ship's painted marks: draught numerals (left strip, 0.7 by 2.8 m,
 * the figures 0.1 m high every 0.2 m, a whole metre with its M), her name
 * and port of registry, and the load-line mark.
 */
function harbourMarks() {
  return arenaPainted('ship-marks', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const g = canvas.getContext('2d');
    g.fillStyle = '#f2f0ea';
    g.textBaseline = 'bottom';
    const perMetre = 512 / 2.8;
    // Keel 8 m below the yard: the water stands at a draught of 6.4 m.
    for (let tenth = 64; tenth <= 92; tenth += 2) {
      const y = 512 - (tenth / 10 - 6.4) * perMetre;
      const whole = tenth % 10 === 0;
      g.font = `bold ${Math.round(perMetre * 0.1)}px Arial, sans-serif`;
      g.fillText(whole ? `${tenth / 10}M` : `${tenth % 10}`, 20, y);
    }
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.font = 'bold 150px Arial, sans-serif';
    g.save();
    g.translate(576, 128);
    g.scale(Math.min(1, 860 / g.measureText('MERIDIAN STAR').width), 1);
    g.fillText('MERIDIAN STAR', 0, 0);
    g.restore();
    g.font = 'bold 84px Arial, sans-serif';
    g.fillText('MONROVIA', 576, 320);
    // The load-line disc: a ring, a bar through it, the society's letters.
    g.strokeStyle = '#f2f0ea';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(256, 448, 46, 0, Math.PI * 2);
    g.stroke();
    g.fillRect(190, 444, 132, 8);
    g.font = 'bold 34px Arial, sans-serif';
    g.fillText('L', 226, 415);
    g.fillText('R', 286, 415);
    for (let k = 0; k < 4; k += 1) g.fillRect(340, 410 + k * 18, 40, 6);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = 4;
    return texture;
  });
}

// ---- small helpers ---------------------------------------------------------------

/** A beam of a square section `size` from a to b (points [x, y, z]). */
function harbourBeam(builder, a, b, size, options) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const along = to.clone().sub(from);
  const length = along.length();
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), along.normalize());
  const matrix = new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), turn, new THREE.Vector3(1, 1, 1));
  const geometry = Array.isArray(size) ? new THREE.BoxGeometry(size[0], length, size[1]) : (size < 0 ? new THREE.CylinderGeometry(-size, -size, length, 6) : new THREE.BoxGeometry(size, length, size));
  builder.add(geometry, matrix, options);
}

const harbourHex = (hex, scale = 1) => {
  const colour = new THREE.Color(hex);
  return [colour.r * scale, colour.g * scale, colour.b * scale];
};
const harbourMix = (a, b, f) => a.map((value, index) => value + (b[index] - value) * f);

// ---- containers -----------------------------------------------------------------

const HARBOUR_BOX = { length: 6.06, height: 2.59, width: 2.44 };

/** One 20-foot box with its bottom at `y`, turned `turn`, painted in line `line`'s colour. */
function harbourContainer(parts, { x, y, z, turn, line, random, doorEnd }) {
  const { length: L, height: H, width: W } = HARBOUR_BOX;
  const base = arenaAt(x, y, z, 0, turn);
  const at = (lx, ly, lz, rx = 0, ry = 0, rz = 0) => base.clone().multiply(arenaAt(lx, ly, lz, rx, ry, rz));
  const paint = harbourHex(HARBOUR_PAINT[line % HARBOUR_PAINT.length], 0.88 + random() * 0.2);
  const frame = paint.map((value) => value * 0.82);
  const offset = [random(), 0];
  const skin = { tile: [2.0, H], offset: [offset[0], -y / H], colour: paint };
  // The walls: corrugated panels between the frame members.
  for (const side of [-1, 1]) {
    parts.skin.add(new THREE.PlaneGeometry(L - 0.3, H - 0.3), at(0, H / 2, side * (W / 2 - 0.035), 0, side < 0 ? Math.PI : 0), skin);
    // The line's name and mark along the upper side.
    parts.logos.add(new THREE.PlaneGeometry(2.6, 0.65), at(-side * 0.7, H * 0.68, side * (W / 2 - 0.02), 0, side < 0 ? Math.PI : 0), { uv: 'keep', tile: [2, 4], offset: [(line % 2) * 0.5, (3 - Math.floor((line % 8) / 2)) * 0.25] });
  }
  parts.skin.add(new THREE.PlaneGeometry(W - 0.3, H - 0.3), at(-doorEnd * (L / 2 - 0.035), H / 2, 0, 0, -doorEnd * Math.PI / 2), skin);
  parts.skin.add(new THREE.PlaneGeometry(L - 0.2, W - 0.2), at(0, H - 0.04, 0, -Math.PI / 2), { ...skin, offset: [offset[0], random()], colour: paint.map((v) => v * 0.85) });
  // The doors: two leaves, their seal line, four locking bars with their handles, hinges.
  const doorX = doorEnd * (L / 2 - 0.03);
  for (const side of [-1, 1]) parts.skin.add(new THREE.PlaneGeometry((W - 0.32) / 2, H - 0.34), at(doorX, H / 2, side * (W - 0.32) / 4, 0, doorEnd * Math.PI / 2), { ...skin, tile: [1.0, H] });
  const steel = (value) => ({ tile: 1.5, colour: value });
  parts.steel.add(new THREE.BoxGeometry(0.03, H - 0.32, 0.025), at(doorX + doorEnd * 0.01, H / 2, 0), steel([0.05, 0.05, 0.05]));
  const zinc = [0.55, 0.55, 0.53];
  for (const bar of [-0.88, -0.32, 0.32, 0.88]) {
    const bx = doorX + doorEnd * 0.05;
    parts.steel.add(new THREE.BoxGeometry(0.04, H - 0.24, 0.04), at(bx, H / 2, bar), steel(zinc));
    parts.steel.add(new THREE.BoxGeometry(0.03, 0.035, 0.42), at(bx + doorEnd * 0.02, 1.15, bar + 0.2), steel(zinc));
  }
  for (const side of [-1, 1]) for (const hy of [0.45, 2.2]) parts.steel.add(new THREE.BoxGeometry(0.06, 0.12, 0.07), at(doorX + doorEnd * 0.03, hy, side * (W / 2 - 0.14)), steel(frame));
  parts.logos.add(new THREE.PlaneGeometry(1.0, 0.25), at(doorX + doorEnd * 0.012, H - 0.5, -0.55, 0, doorEnd * Math.PI / 2), { uv: 'keep', tile: [2, 4], offset: [(line % 2) * 0.5, (3 - Math.floor((line % 8) / 2)) * 0.25] });
  // The frame: corner posts, side and end rails, the castings at the eight corners.
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) {
    parts.steel.add(new THREE.BoxGeometry(0.16, H - 0.24, 0.16), at(ex * (L / 2 - 0.08), H / 2, ez * (W / 2 - 0.08)), steel(frame));
    for (const ey of [0.06, H - 0.06]) parts.steel.add(new THREE.BoxGeometry(0.18, 0.12, 0.17), at(ex * (L / 2 - 0.09), ey, ez * (W / 2 - 0.085)), steel(frame.map((v) => v * 0.75)));
  }
  for (const ez of [-1, 1]) {
    parts.steel.add(new THREE.BoxGeometry(L - 0.36, 0.11, 0.1), at(0, H - 0.055, ez * (W / 2 - 0.05)), steel(frame));
    parts.steel.add(new THREE.BoxGeometry(L - 0.36, 0.17, 0.12), at(0, 0.085, ez * (W / 2 - 0.06)), steel(frame.map((v) => v * 0.8)));
  }
  for (const ex of [-1, 1]) {
    const door = ex === doorEnd;
    parts.steel.add(new THREE.BoxGeometry(0.12, door ? 0.2 : 0.12, W - 0.34), at(ex * (L / 2 - 0.06), H - (door ? 0.1 : 0.06), 0), steel(frame));
    parts.steel.add(new THREE.BoxGeometry(0.14, door ? 0.17 : 0.12, W - 0.34), at(ex * (L / 2 - 0.07), door ? 0.085 : 0.06, 0), steel(frame.map((v) => v * 0.8)));
  }
}

// ---- the ship -------------------------------------------------------------------

/**
 * The hull's half-breadth at x and height y: parallel-sided amidships, the
 * bow fining to a raked stem (longer at the deck than at the waterline),
 * the transom's corners rounded.
 */
function harbourHalfBreadth(x, y) {
  const half = 4.5;
  if (x > 18) {
    const run = 11 + 0.35 * (y + 3);
    const f = (x - 18) / run;
    return half * Math.sqrt(Math.max(0, 1 - f * f));
  }
  if (x < -15.5) return half - (-15.5 - x) ** 2 * 0.3;
  return half;
}

/** A surface on a grid: point(i, j) → [x, y, z], normals by differences, turned to face along `facing`. UVs in metres from `uv`. */
function harbourGrid(builder, columns, rows, point, facing, uv, options) {
  const grid = [];
  for (let i = 0; i <= columns; i += 1) {
    grid.push([]);
    for (let j = 0; j <= rows; j += 1) grid[i].push(point(i, j));
  }
  const normalAt = (i, j) => {
    const a = grid[Math.min(columns, i + 1)][j];
    const b = grid[Math.max(0, i - 1)][j];
    const c = grid[i][Math.min(rows, j + 1)];
    const d = grid[i][Math.max(0, j - 1)];
    const du = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const dv = new THREE.Vector3(c[0] - d[0], c[1] - d[1], c[2] - d[2]);
    const n = du.cross(dv).normalize();
    if (!Number.isFinite(n.x) || n.lengthSq() < 0.5) n.set(...facing(grid[i][j]));
    if (n.dot(new THREE.Vector3(...facing(grid[i][j]))) < 0) n.negate();
    return n;
  };
  const positions = [];
  const normals = [];
  const uvs = [];
  for (let i = 0; i < columns; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      for (const [di, dj] of [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]) {
        const p = grid[i + di][j + dj];
        const n = normalAt(i + di, j + dj);
        positions.push(...p);
        normals.push(n.x, n.y, n.z);
        uvs.push(...uv(p));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  builder.add(geometry, undefined, { uv: 'keep', ...options });
}

function harbourShip(parts, { centreZ, random }) {
  const stern = -17;
  const stemTop = 18 + 11 + 0.35 * 7.2;
  const deck = 4.2;
  const keel = -3;
  // Stations along the hull: two metres apart amidships, half a metre where she curves.
  const stations = [];
  for (let x = stern; x < -15.5; x += 0.5) stations.push(x);
  for (let x = -15.5; x < 18; x += 2) stations.push(x);
  for (let x = 18; x < stemTop; x += 0.5) stations.push(x);
  stations.push(stemTop);
  const black = [0.22, 0.25, 0.31];
  const red = [0.55, 0.17, 0.13];
  const plating = { tile: [8, 4] };
  for (const side of [-1, 1]) {
    // Two bands: the antifouling red below the boot-top, the black topsides above it.
    for (const [rowsY, colour] of [[[keel, -1.6, -0.8], red], [[-0.8, 0.4, 1.6, 2.9, deck], black]]) {
      harbourGrid(parts.hull, stations.length - 1, rowsY.length - 1, (i, j) => {
        const x = Math.min(stations[i], 18 + 11 + 0.35 * (rowsY[j] + 3));
        return [x, rowsY[j], centreZ + side * harbourHalfBreadth(x, rowsY[j])];
      }, ([x]) => (x > 18 ? [1, 0, side] : [0, 0, side]), ([x, y]) => [x * side, y], { ...plating, colour: (p) => {
        // Grime washed down from the deck edge, darkest under the scuppers.
        const v = 0.85 + 0.15 * arenaSmooth(deck, deck - 1.2, p.y);
        return colour.map((c) => c * v);
      } });
    }
  }
  // The transom.
  harbourGrid(parts.hull, 6, 4, (i, j) => {
    const y = keel + ((deck - keel) * j) / 4;
    const half = harbourHalfBreadth(stern, y);
    return [stern, y, centreZ - half + (2 * half * i) / 6];
  }, () => [-1, 0, 0], ([, y, z]) => [z, y], { ...plating, colour: (p) => (p.y < -0.8 ? red : black) });
  // The deck, and the hatch covers in a row along it.
  harbourGrid(parts.hull, stations.length - 1, 1, (i, j) => {
    const x = stations[i];
    const half = harbourHalfBreadth(x, deck);
    return [x, deck, centreZ + (j ? half : -half)];
  }, () => [0, 1, 0], ([x, , z]) => [x, z], { ...plating, colour: [0.3, 0.34, 0.3] });
  const bays = [-6.6, -0.4, 5.8, 12.0, 18.2];
  for (const bx of bays) parts.steel.add(new THREE.BoxGeometry(6.2, 0.3, 8.4), arenaAt(bx, deck + 0.15, centreZ), { tile: 1.5, colour: [0.24, 0.3, 0.26] });
  // The rubbing strake, and the angle bar at the deck edge.
  for (const side of [-1, 1]) {
    parts.hull.add(new THREE.CylinderGeometry(0.12, 0.12, 33, 10, 1), arenaAt(1.5, 2.5, centreZ + side * 4.5, 0, 0, Math.PI / 2), { tile: 2, colour: [0.2, 0.22, 0.26] });
    parts.hull.add(new THREE.BoxGeometry(33.5, 0.1, 0.08), arenaAt(1.25, deck - 0.05, centreZ + side * 4.54), { tile: 2, colour: [0.32, 0.34, 0.36] });
  }
  // The rail round the deck edge: stanchions and two courses.
  for (const side of [-1, 1]) {
    let previous = null;
    for (let x = stern + 0.6; x < 28.5; x += 1.6) {
      const z = centreZ + side * (harbourHalfBreadth(x, deck) - 0.08);
      parts.steel.add(new THREE.BoxGeometry(0.05, 1.0, 0.05), arenaAt(x, deck + 0.5, z), { tile: 1.5, colour: [0.55, 0.57, 0.55] });
      if (previous) for (const ry of [0.55, 1.0]) harbourBeam(parts.steel, [previous[0], deck + ry, previous[1]], [x, deck + ry, z], -0.025, { tile: 1.5, colour: [0.55, 0.57, 0.55] });
      previous = [x, z];
    }
  }
  // The superstructure aft: four decks of cabins, the bridge with its wings, the funnel.
  const white = [0.78, 0.79, 0.78];
  const house = (x0, x1, y0, y1, half) => parts.hull.add(new THREE.BoxGeometry(x1 - x0, y1 - y0, half * 2), arenaAt((x0 + x1) / 2, (y0 + y1) / 2, centreZ), { tile: [8, 4], colour: white });
  house(-15.4, -10.2, deck, deck + 2.5, 3.8);
  house(-15.4, -10.4, deck + 2.5, deck + 5, 3.6);
  house(-15.4, -10.6, deck + 5, deck + 7.5, 3.6);
  house(-14.8, -10.6, deck + 7.5, deck + 10, 4.6);
  parts.hull.add(new THREE.BoxGeometry(5.0, 0.2, 9.6), arenaAt(-12.6, deck + 10.1, centreZ), { tile: [8, 4], colour: [0.6, 0.62, 0.6] });
  parts.hull.add(new THREE.BoxGeometry(2.2, 4.4, 3.0), arenaAt(-14.4, deck + 12.2, centreZ), { tile: [8, 4], colour: (p) => (p.y > deck + 13.6 ? [0.08, 0.08, 0.08] : p.y > deck + 12 ? [0.7, 0.2, 0.15] : white) });
  harbourBeam(parts.steel, [-12, deck + 10.2, centreZ], [-12, deck + 14.5, centreZ], 0.12, { tile: 1.5, colour: [0.7, 0.7, 0.68] });
  // Windows down the yard side: cabins lit and dark, the bridge windows a row.
  for (let level = 0; level < 3; level += 1) {
    for (let k = 0; k < 4; k += 1) {
      const wx = -14.6 + k * 1.2;
      const wy = deck + 1.3 + level * 2.5;
      const z = centreZ - (level === 0 ? 3.8 : 3.6) - 0.01;
      if (random() < 0.55) parts.glow.add(new THREE.PlaneGeometry(0.75, 0.7), arenaAt(wx, wy, z, 0, Math.PI), { colour: [1, 0.85, 0.6] });
      else parts.hull.add(new THREE.PlaneGeometry(0.75, 0.7), arenaAt(wx, wy, z, 0, Math.PI), { colour: [0.05, 0.06, 0.08] });
    }
  }
  for (let k = 0; k < 6; k += 1) parts.hull.add(new THREE.PlaneGeometry(0.62, 0.9), arenaAt(-14.4 + k * 0.7, deck + 8.9, centreZ - 4.61, 0, Math.PI), { colour: [0.04, 0.05, 0.07] });
  parts.hull.add(new THREE.PlaneGeometry(4.0, 0.9), arenaAt(-10.59, deck + 8.9, centreZ, 0, Math.PI / 2), { colour: [0.04, 0.05, 0.07] });
  // Boxes on the hatch covers, two and three high.
  for (const bx of bays) {
    for (const bz of [-2.6, 0, 2.6]) {
      const high = 1 + Math.floor(random() * 3);
      for (let level = 0; level < high; level += 1) harbourContainer(parts, { x: bx, y: deck + 0.3 + level * HARBOUR_BOX.height, z: centreZ + bz, turn: 0, line: Math.floor(random() * 8), random, doorEnd: -1 });
    }
  }
  // Her marks on the yard side: draught figures aft, amidships and forward; the load-line disc; name and port on the stern.
  for (const mx of [-15.2, 4.0, 18.0]) {
    parts.marks.add(new THREE.PlaneGeometry(0.7, 2.8), arenaAt(mx, -1.6 + 1.4, centreZ - harbourHalfBreadth(mx, -0.2) - 0.012, 0, Math.PI), { uv: 'keep', tile: [8, 1], offset: [0, 0], colour: [0.92, 0.92, 0.9] });
  }
  parts.marks.add(new THREE.PlaneGeometry(1.0, 0.6), arenaAt(5.4, 0.4, centreZ - 4.512, 0, Math.PI), { uv: 'keep', tile: [4, 4], offset: [0.125, 0], colour: [0.92, 0.92, 0.9] });
  parts.marks.add(new THREE.PlaneGeometry(5.6, 1.6), arenaAt(stern - 0.012, 2.6, centreZ, 0, -Math.PI / 2), { uv: 'keep', tile: [8 / 7, 2], offset: [0.125, 0.5], colour: [0.92, 0.92, 0.9] });
  parts.marks.add(new THREE.PlaneGeometry(3.2, 0.9), arenaAt(stern - 0.012, 1.25, centreZ, 0, -Math.PI / 2), { uv: 'keep', tile: [8 / 7, 4], offset: [0.125, 0.25], colour: [0.92, 0.92, 0.9] });
  return { deck, stern };
}

// ---- the quay -------------------------------------------------------------------

/** A cast-iron tee-headed bollard: flange, waisted body, the head with its lip. */
function harbourBollard(builder, x, y, z, colour) {
  const profile = [[0, 0], [0.32, 0], [0.32, 0.05], [0.22, 0.07], [0.19, 0.3], [0.17, 0.42], [0.2, 0.47], [0.27, 0.52], [0.27, 0.57], [0.2, 0.62], [0, 0.63]].map(([r, y]) => new THREE.Vector2(r, y));
  builder.add(new THREE.LatheGeometry(profile, 12), arenaAt(x, y, z), { tile: 1.5, colour });
  // The tee: horns either side of the head, so a line cannot jump off.
  builder.add(new THREE.CylinderGeometry(0.07, 0.07, 0.62, 8), arenaAt(x, y + 0.5, z, 0, 0, Math.PI / 2), { tile: 1.5, colour });
}

function harbourQuay(parts, { edgeZ, random }) {
  // The capping beam: a concrete kerb along the edge, its seaward arris rounded, the top painted yellow at the edge.
  const along = (p) => {
    p.z += edgeZ;
  };
  arenaRun(parts.concrete, [[-0.7, -0.02], [0.08, -0.02], [0.12, 0.0], [0.12, 0.12], [0.08, 0.16], [-0.7, 0.16], [-0.7, 0.02]], { from: -40, length: 80, stepLength: 4, warp: along, tile: 2, colour: (p, n) => (n.y > 0.5 && p.z > -0.32 ? [0.95, 0.72, 0.12] : [0.62, 0.62, 0.6]) });
  // The face down to the water: weed and slime below the high-water line.
  parts.concrete.add(new THREE.PlaneGeometry(80, 2.0, 8, 4), arenaAt(0, -1.0, edgeZ + 0.1), { tile: 2, colour: (p) => {
    const wet = arenaSmooth(-0.9, -1.4, p.y);
    return harbourMix([0.6, 0.6, 0.58], [0.16, 0.2, 0.12], wet);
  } });
  // Bollards every six metres, and rubber cylinder fenders slung on chains between them.
  const iron = [0.12, 0.12, 0.13];
  const bollards = [];
  for (let x = -30; x <= 36; x += 6) {
    harbourBollard(parts.steel, x, 0.16, edgeZ - 0.5, iron.map((v) => v * (0.9 + random() * 0.3)));
    bollards.push(x);
  }
  for (let x = -27; x <= 33; x += 6) {
    parts.steel.add(new THREE.CylinderGeometry(0.32, 0.32, 1.7, 16, 1), arenaAt(x, -0.75, edgeZ + 0.45, 0, 0, Math.PI / 2), { tile: 1.5, colour: [0.07, 0.07, 0.07] });
    for (const end of [-0.7, 0.7]) harbourBeam(parts.steel, [x + end, -0.45, edgeZ + 0.45], [x + end * 1.1, 0.14, edgeZ - 0.1], -0.02, { tile: 1.5, colour: [0.3, 0.22, 0.16] });
  }
  // A steel ladder down the face here and there.
  for (const lx of [-21, 3, 27]) {
    for (const side of [-0.22, 0.22]) parts.steel.add(new THREE.BoxGeometry(0.05, 1.9, 0.06), arenaAt(lx + side, -0.85, edgeZ + 0.17), { tile: 1.5, colour: [0.5, 0.4, 0.15] });
    for (let rung = 0; rung < 6; rung += 1) parts.steel.add(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 5), arenaAt(lx, -1.7 + rung * 0.3, edgeZ + 0.17, 0, 0, Math.PI / 2), { tile: 1.5, colour: [0.5, 0.4, 0.15] });
  }
  return bollards;
}

/** A mooring line from a fairlead on the ship's deck edge to a bollard, sagging under its own weight, with its eye round the bollard. */
function harbourLine(builder, from, to) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const middle = a.clone().lerp(b, 0.55);
  middle.y -= 0.25 + a.distanceTo(b) * 0.02;
  const curve = new THREE.CatmullRomCurve3([a, a.clone().lerp(middle, 0.5).add(new THREE.Vector3(0, -0.05, 0)), middle, middle.clone().lerp(b, 0.5), b]);
  builder.add(new THREE.TubeGeometry(curve, 24, 0.035, 5, false), undefined, { tile: 1.5, colour: [0.55, 0.5, 0.38] });
  builder.add(new THREE.TorusGeometry(0.2, 0.035, 5, 14), arenaAt(to[0], to[1], to[2], Math.PI / 2), { tile: 1.5, colour: [0.55, 0.5, 0.38] });
}

// ---- cranes, lamps, odds and ends ----------------------------------------------

/**
 * A ship-to-shore gantry crane, its origin at the foot of its legs' middle:
 * four box-section legs on bogies, side frames braced, portal beams, the
 * boom of two box girders out over the water, the A-frame and its stays,
 * the machinery house aft, the trolley with its cab and the spreader hanging.
 */
function harbourCrane(parts, { x, z, spreaderY }) {
  const at = (lx, ly, lz, rx = 0, ry = 0, rz = 0) => arenaAt(x + lx, ly, z + lz, rx, ry, rz);
  const red = [0.62, 0.22, 0.15];
  const paint = (colour) => ({ tile: 1.5, colour });
  const legs = [[-4, -4], [4, -4], [-4, 2], [4, 2]];
  for (const [dx, dz] of legs) {
    parts.steel.add(new THREE.BoxGeometry(0.8, 19, 0.8), at(dx, 1.4 + 9.5, dz), paint(red));
    // The bogie: an equaliser beam on two wheel trucks running along the quay.
    const yellow = [0.75, 0.6, 0.12];
    parts.steel.add(new THREE.BoxGeometry(2.6, 0.5, 0.6), at(dx, 1.15, dz), paint(yellow));
    for (const tx of [-0.75, 0.75]) {
      parts.steel.add(new THREE.BoxGeometry(1.1, 0.5, 0.5), at(dx + tx, 0.65, dz), paint(yellow.map((v) => v * 0.8)));
      for (const wx of [-0.3, 0.3]) parts.steel.add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 14), at(dx + tx + wx, 0.3, dz, Math.PI / 2), paint([0.18, 0.18, 0.18]));
    }
  }
  // Side frames: ties at 12 m and 20 m between land and sea legs, crossed by diagonals.
  for (const dx of [-4, 4]) {
    for (const ty of [12, 20]) parts.steel.add(new THREE.BoxGeometry(0.6, ty === 20 ? 1.1 : 0.8, 6.0), at(dx, ty, -1), paint(red));
    harbourBeam(parts.steel, [x + dx, 12.4, z - 3.6], [x + dx, 19.5, z + 1.6], 0.35, paint(red));
    harbourBeam(parts.steel, [x + dx, 12.4, z + 1.6], [x + dx, 19.5, z - 3.6], 0.35, paint(red));
  }
  // Portal beams across the top, land side and sea side.
  for (const dz of [-4, 2]) parts.steel.add(new THREE.BoxGeometry(8.8, 1.2, 1.0), at(0, 20.3, dz), paint(red));
  // The boom: two box girders from the backreach out over the water, tied across beneath, walkways railed.
  const boom0 = -12;
  const boom1 = 30;
  for (const side of [-1, 1]) {
    parts.steel.add(new THREE.BoxGeometry(0.6, 1.8, boom1 - boom0), at(side * 1.8, 21.8, (boom0 + boom1) / 2), paint(red));
    for (let sz = boom0 + 0.5; sz <= boom1; sz += 3) parts.steel.add(new THREE.BoxGeometry(0.04, 1.0, 0.04), at(side * 2.25, 23.2, sz), paint([0.8, 0.8, 0.75]));
    parts.steel.add(new THREE.BoxGeometry(0.05, 0.05, boom1 - boom0), at(side * 2.25, 23.7, (boom0 + boom1) / 2), paint([0.8, 0.8, 0.75]));
  }
  for (let sz = boom0 + 2; sz < boom1; sz += 4) parts.steel.add(new THREE.BoxGeometry(3.6, 0.3, 0.35), at(0, 20.95, sz), paint(red));
  // The A-frame over the legs, and its stays down to the boom's tip and tail.
  const apex = [[-1.8, 33, -1], [1.8, 33, -1]];
  for (const [ax, ay, az] of apex) {
    const sx = Math.sign(ax) * 4;
    harbourBeam(parts.steel, [x + sx, 20.9, z - 4], [x + ax, ay, z + az], 0.55, paint(red));
    harbourBeam(parts.steel, [x + sx, 20.9, z + 2], [x + ax, ay, z + az], 0.55, paint(red));
    for (const [tz, ty] of [[18, 22.7], [boom1 - 0.5, 22.7], [boom0 + 0.5, 22.7]]) harbourBeam(parts.steel, [x + ax, ay - 0.3, z + az], [x + ax, ty, z + tz], -0.07, paint([0.4, 0.4, 0.4]));
  }
  parts.steel.add(new THREE.BoxGeometry(4.2, 0.7, 0.7), at(0, 33, -1), paint(red));
  // The machinery house aft on the boom.
  parts.steel.add(new THREE.BoxGeometry(5, 3, 7), at(0, 24.2, -8.5), paint([0.82, 0.82, 0.8]));
  parts.steel.add(new THREE.BoxGeometry(5.2, 0.15, 7.2), at(0, 25.75, -8.5), paint([0.5, 0.5, 0.5]));
  // The trolley out over the ship, the driver's cab slung under it, the spreader on its ropes.
  const trolleyZ = 10;
  parts.steel.add(new THREE.BoxGeometry(4.4, 1.1, 3.2), at(0, 23.25, trolleyZ), paint([0.75, 0.6, 0.15]));
  parts.steel.add(new THREE.BoxGeometry(1.8, 2.0, 2.2), at(2.7, 20.0, trolleyZ), paint([0.8, 0.8, 0.78]));
  parts.glow.add(new THREE.PlaneGeometry(1.5, 0.9), at(2.7, 20.3, trolleyZ + 1.11), { colour: [0.55, 0.6, 0.55] });
  for (const rx of [-0.6, 0.6]) for (const rz of [-1.1, 1.1]) parts.steel.add(new THREE.CylinderGeometry(0.025, 0.025, 22.7 - spreaderY, 4), at(rx, (22.7 + spreaderY) / 2, trolleyZ + rz), paint([0.3, 0.3, 0.3]));
  parts.steel.add(new THREE.BoxGeometry(2.6, 0.6, 1.4), at(0, spreaderY + 0.3, trolleyZ), paint([0.75, 0.6, 0.15]));
  parts.steel.add(new THREE.BoxGeometry(2.4, 0.35, 6.1), at(0, spreaderY - 0.15, trolleyZ), paint([0.75, 0.6, 0.15]));
  // Floodlights under the boom, the red obstruction light at its tip.
  for (const fz of [4, 12, 20, 28]) parts.glow.add(new THREE.BoxGeometry(0.5, 0.12, 0.35), at(0, 20.8, fz), { colour: [1, 0.95, 0.85] });
  parts.glow.add(new THREE.SphereGeometry(0.22, 8, 6), at(0, 23.0, boom1), { colour: [1, 0.15, 0.08] });
  parts.glow.add(new THREE.SphereGeometry(0.22, 8, 6), at(0, 33.5, -1), { colour: [1, 0.15, 0.08] });
}

/** A sodium street lamp: base shroud, tapered octagonal post, swept arm, the cobra-head housing with its lens. Returns the lens centre. */
function harbourLamp(parts, x, z, toward) {
  const grey = [0.35, 0.37, 0.4];
  parts.steel.add(new THREE.BoxGeometry(0.45, 0.04, 0.45), arenaAt(x, 0.02, z), { tile: 1.5, colour: grey });
  parts.steel.add(new THREE.CylinderGeometry(0.15, 0.19, 0.5, 8), arenaAt(x, 0.27, z), { tile: 1.5, colour: grey });
  parts.steel.add(new THREE.CylinderGeometry(0.065, 0.11, 7.0, 8), arenaAt(x, 3.5, z), { tile: 1.5, colour: grey });
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 6.9, z), new THREE.Vector3(x, 7.4, z + toward * 0.35), new THREE.Vector3(x, 7.25, z + toward * 1.1));
  parts.steel.add(new THREE.TubeGeometry(curve, 10, 0.035, 6, false), undefined, { tile: 1.5, colour: grey });
  const head = new THREE.Vector3(x, 7.18, z + toward * 1.3);
  parts.steel.add(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), arenaAt(head.x, head.y, head.z, 0, 0, 0, 0.22, 0.11, 0.42), { tile: 1.5, colour: grey });
  parts.glow.add(new THREE.CircleGeometry(1, 16), arenaAt(head.x, head.y - 0.005, head.z, Math.PI / 2, 0, 0, 0.19, 0.36, 1), { colour: [1, 0.72, 0.36] });
  return head;
}

/** A steel drum: rolling hoops, the chimes top and bottom, its bungs. */
function harbourDrum(builder, x, z, colour) {
  const profile = [[0, 0.005], [0.28, 0.005], [0.29, 0.02], [0.29, 0.04], [0.283, 0.06], [0.283, 0.27], [0.297, 0.285], [0.297, 0.305], [0.283, 0.32], [0.283, 0.56], [0.297, 0.575], [0.297, 0.595], [0.283, 0.61], [0.283, 0.83], [0.29, 0.85], [0.29, 0.875], [0.275, 0.88], [0.27, 0.865], [0, 0.865]].map(([r, y]) => new THREE.Vector2(r, y));
  builder.add(new THREE.LatheGeometry(profile, 14), arenaAt(x, 0, z), { tile: 1.5, colour });
  for (const [bx, bz] of [[0.16, 0.05], [-0.15, -0.06]]) builder.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 8), arenaAt(x + bx, 0.875, z + bz), { tile: 1.5, colour: [0.5, 0.5, 0.48] });
}

/** A stack of Euro pallets (1.2 by 0.8 m, 0.144 m high): top boards, stringers, blocks, bottom boards. */
function harbourPallets(builder, x, z, count, random) {
  for (let level = 0; level < count; level += 1) {
    const y0 = level * 0.144;
    const matrix = arenaAt(x + (random() - 0.5) * 0.06, y0, z + (random() - 0.5) * 0.06, 0, (random() - 0.5) * 0.06);
    const tint = [1.5, 1.3, 1.05].map((v) => v * (0.85 + random() * 0.25));
    const put = (geometry, lx, ly, lz) => builder.add(geometry, matrix.clone().multiply(arenaAt(lx, ly, lz)), { tile: 1.2, colour: tint });
    for (const bz of [-0.3375, -0.17, 0, 0.17, 0.3375]) put(new THREE.BoxGeometry(1.2, 0.022, bz === 0 || Math.abs(bz) > 0.3 ? 0.145 : 0.1), 0, 0.133, bz);
    for (const bz of [-0.3375, 0, 0.3375]) {
      put(new THREE.BoxGeometry(1.2, 0.022, 0.145), 0, 0.1, bz);
      for (const bx of [-0.5275, 0, 0.5275]) put(new THREE.BoxGeometry(bx === 0 ? 0.145 : 0.145, 0.078, 0.145), bx, 0.05, bz);
    }
    for (const bx of [-0.5275, 0, 0.5275]) put(new THREE.BoxGeometry(0.145, 0.022, 0.8), bx, 0.011, 0);
  }
}

// ---- the port --------------------------------------------------------------------

/**
 * Everything built on the quay but the ground, the water and the sky. The
 * stacks stand where `buildPort` always had them; returns the group (the
 * lamps' lights in it).
 */
export function harbourPort({ edgeZ }) {
  const group = new THREE.Group();
  const random = arenaRandom(4242);
  const parts = {
    skin: arenaBuilder(),
    logos: arenaBuilder(),
    steel: arenaBuilder(),
    hull: arenaBuilder(),
    marks: arenaBuilder(),
    concrete: arenaBuilder(),
    wood: arenaBuilder(),
    glow: arenaBuilder(),
    halo: arenaBuilder(),
  };
  const bollards = harbourQuay(parts, { edgeZ, random });
  const centreZ = edgeZ + 6;
  const { deck } = harbourShip(parts, { centreZ, random });
  // Mooring lines: stern lines and springs aft, springs and head lines forward.
  for (const [fx, bx] of [[-16, -24], [-14.5, -18], [-8, -6], [17, 12], [25, 30], [26.5, 36]]) {
    if (!bollards.includes(bx)) continue;
    harbourLine(parts.steel, [fx, deck + 0.15, centreZ - harbourHalfBreadth(fx, deck) + 0.05], [bx, 0.6, edgeZ - 0.5]);
  }
  // The yard's stacks, where they always stood.
  let count = 0;
  const box = (x, z, level, turn, index) => harbourContainer(parts, { x, y: level * HARBOUR_BOX.height, z, turn, line: index, random, doorEnd: random() < 0.5 ? 1 : -1 });
  for (const z of [-7.8, -10.4]) {
    for (let x = -20; x <= 20; x += 6.2) {
      if (Math.abs(x + 4) < 3 && z === -7.8) continue;
      const high = 1 + ((count * 7) % 3);
      for (let level = 0; level < high; level += 1) box(x + (level % 2) * 0.2, z, level, 0, count + level);
      count += 1;
    }
  }
  // The rows inland, boxes turned end-on to the lane: two a side, end to end
  // (they used to stand at 3 m centres, overlapping each other by half).
  for (const x of [-12.5, 12.5]) {
    for (const z of [-3.0, 3.1]) {
      const high = 1 + ((count * 5) % 2);
      for (let level = 0; level < high; level += 1) box(x, z, level, Math.PI / 2, count + level * 3);
      count += 1;
    }
  }
  // Drums and pallets by the stacks.
  const drums = ['#2a4a7a', '#8a2a1e', '#1c1c1e', '#2f5a34', '#2a4a7a'];
  [[-9, -6.4], [-8.4, -6.6], [7.8, -6.5], [10.6, 5.6], [-10.5, 5.4]].forEach(([x, z], index) => harbourDrum(parts.steel, x, z, harbourHex(drums[index], 0.85 + random() * 0.3)));
  for (const [x, z] of [[3, -6.6], [4.3, -6.4], [-11, 2]]) harbourPallets(parts.wood, x, z, 5, random);
  // Two gantry cranes on the quay, their bogies clear of the end stacks.
  harbourCrane(parts, { x: -20, z: edgeZ - 3, spreaderY: 15 });
  harbourCrane(parts, { x: 19, z: edgeZ - 3, spreaderY: 13.5 });
  // Sodium lamps over the yard, each throwing its own orange pool.
  for (const [x, z] of [[-7, -6.4], [6, -6.4], [-3, 7.6], [9, 7.6]]) {
    const head = harbourLamp(parts, x, z, z < 0 ? 1 : -1);
    parts.halo.add(new THREE.SphereGeometry(0.6, 12, 8), arenaAt(head.x, head.y - 0.1, head.z));
    const lamp = new THREE.PointLight(0xffa24a, 2, 16, 2);
    lamp.position.set(head.x, 6.6, head.z);
    group.add(lamp);
  }
  const materials = {
    skin: arenaMaterial(harbourCorrugated(), { roughness: 0.55, metalness: 0.3 }),
    logos: new THREE.MeshStandardMaterial({ map: harbourLogos(), transparent: true, alphaTest: 0.35, roughness: 0.6, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -1 }),
    steel: arenaMaterial(harbourSteel(), { roughness: 0.6, metalness: 0.35 }),
    hull: arenaMaterial(harbourPlating(), { roughness: 0.55, metalness: 0.3 }),
    marks: new THREE.MeshStandardMaterial({ map: harbourMarks(), transparent: true, alphaTest: 0.3, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1 }),
    concrete: arenaMaterial(harbourConcrete(), { roughness: 0.8 }),
    wood: arenaMaterial(arenaWood(), { roughness: 0.85 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    halo: new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.12, depthWrite: false }),
  };
  // Wet steel and paint catch the sky.
  for (const name of ['skin', 'steel', 'hull']) materials[name].userData.reflects = 0.25;
  for (const [name, builder] of Object.entries(parts)) {
    const mesh = builder.mesh(materials[name], { cast: !['glow', 'halo', 'logos', 'marks'].includes(name) });
    if (mesh) group.add(mesh);
  }
  return { group, triangles: Object.values(parts).reduce((sum, b) => sum + b.triangles, 0) };
}
