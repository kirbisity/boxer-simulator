// The castle kit's surfaces: painted canvas textures (stone coursing, setts, flags, black rock, grass, boards) and
// the materials made of them. Everything is authored in the colours it should show (the game's output is linear),
// muted and cool, for a storm. A texture tiles over a stated number of metres, so geometry only has to give its
// UVs in metres. Nothing here runs until `ktMaterials` is called (THREE and the canvas are the browser's).

/** A small seeded generator (mulberry32). */
export function ktRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ktShade = (rgb, k) => `rgb(${Math.max(0, Math.min(255, rgb[0] * k)) | 0},${Math.max(0, Math.min(255, rgb[1] * k)) | 0},${Math.max(0, Math.min(255, rgb[2] * k)) | 0})`;

/** A canvas texture of `size` px square, painted by `paint(g, size, random)`, tiling over `metres`. */
function ktTexture(size, seed, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d'), size, ktRandom(seed));
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

/** Speckle: noise that gives a surface grain. */
function ktGrain(g, size, random, count, alpha, light = 255, dark = 0) {
  for (let index = 0; index < count; index += 1) {
    const shade = random() < 0.5 ? dark : light;
    g.fillStyle = `rgba(${shade},${shade},${shade},${random() * alpha})`;
    g.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
}

/** Courses of dressed blocks: `rows` courses to the tile, blocks of random length, mortar between. */
function ktCoursed(g, size, random, { base, rows, mortar, variance, moss = 0, chip = 0.35 }) {
  g.fillStyle = mortar;
  g.fillRect(0, 0, size, size);
  const height = size / rows;
  for (let row = 0; row < rows; row += 1) {
    let x = -random() * height * 2;
    while (x < size) {
      const length = height * (1.3 + random() * 1.8);
      const tone = 1 + (random() - 0.5) * variance;
      const warm = (random() - 0.5) * 0.08;
      g.fillStyle = ktShade([base[0] * (1 + warm), base[1], base[2] * (1 - warm)], tone);
      const inset = 1.5;
      g.fillRect(x + inset, row * height + inset, length - inset * 2, height - inset * 2);
      // A lit top edge and a dark foot, so the courses read as blocks.
      g.fillStyle = 'rgba(255,255,255,0.10)';
      g.fillRect(x + inset, row * height + inset, length - inset * 2, 2);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + inset, (row + 1) * height - inset - 3, length - inset * 2, 3);
      // Chips and pits.
      for (let c = 0; c < 5; c += 1) {
        if (random() > chip) continue;
        g.fillStyle = `rgba(0,0,0,${0.1 + random() * 0.2})`;
        g.fillRect(x + inset + random() * (length - 8), row * height + 4 + random() * (height - 10), 2 + random() * 5, 2 + random() * 4);
      }
      x += length;
    }
  }
  if (moss > 0) {
    for (let index = 0; index < 40 * moss; index += 1) {
      const px = random() * size;
      const py = random() * size;
      const gradient = g.createRadialGradient(px, py, 0, px, py, 8 + random() * 22);
      gradient.addColorStop(0, `rgba(70,86,48,${0.35 * moss})`);
      gradient.addColorStop(1, 'rgba(70,86,48,0)');
      g.fillStyle = gradient;
      g.fillRect(px - 30, py - 30, 60, 60);
    }
  }
  // Rain streaks, down from the courses' joints.
  for (let index = 0; index < 22; index += 1) {
    const px = random() * size;
    const py = random() * size;
    g.fillStyle = 'rgba(10,12,18,0.12)';
    g.fillRect(px, py, 1 + random() * 2, 10 + random() * 50);
  }
  ktGrain(g, size, random, 1800, 0.12);
}

/** A stone: a rounded block with a lit top edge, a dark foot and the odd chip. */
function ktStone(g, random, x, y, w, h, base, tone, round = 0.18) {
  const r = Math.min(w, h) * round;
  g.fillStyle = ktShade([base[0] * (0.96 + random() * 0.08), base[1], base[2] * (0.96 + random() * 0.06)], tone);
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.09)';
  g.fillRect(x + r, y + 1, w - 2 * r, Math.max(1.5, h * 0.12));
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x + r, y + h - Math.max(2, h * 0.14), w - 2 * r, Math.max(2, h * 0.14));
}

/** Rough rubble walling: rows of stones of every size, packed with mortar, moss along their tops. */
function ktRubble(g, size, random, { base, moss }) {
  g.fillStyle = 'rgb(30,30,28)';
  g.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const h = size * (0.075 + random() * 0.08);
    let x = -random() * h * 2;
    while (x < size) {
      const w = h * (0.9 + random() * 1.7);
      const tone = 0.62 + random() * 0.6;
      const stone = [x + 1.5, y + 1.5, w - 3, Math.min(h, size - y) - 3];
      for (const oy of y + h > size ? [0, -size] : [0]) ktStone(g, random, stone[0], stone[1] + oy, stone[2], stone[3], base, tone);
      if (random() < 0.5 * moss) {
        for (let k = 0; k < 5; k += 1) {
          g.fillStyle = `rgba(${60 + random() * 20},${80 + random() * 24},${40 + random() * 12},${0.3 + random() * 0.4})`;
          g.fillRect(x + random() * w, y + 1 + random() * 3, 2 + random() * 6, 2 + random() * 4);
        }
      }
      x += w;
    }
    y += h;
  }
  ktGrain(g, size, random, 2600, 0.14);
}

/** Black sea-rock: dark, cracked, banded, a little lichen on the ledges. */
function ktRock(g, size, random) {
  g.fillStyle = 'rgb(34,35,39)';
  g.fillRect(0, 0, size, size);
  for (let index = 0; index < 260; index += 1) {
    const x = random() * size;
    const y = random() * size;
    const w = 10 + random() * 60;
    const h = 5 + random() * 24;
    const tone = 0.55 + random() * 0.9;
    g.fillStyle = ktShade([46, 47, 53], tone);
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, w / 2, h / 2, (random() - 0.5) * 0.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(8,8,12,0.8)';
  for (let index = 0; index < 60; index += 1) {
    g.lineWidth = 1 + random() * 2;
    g.beginPath();
    let x = random() * size;
    let y = random() * size;
    g.moveTo(x, y);
    for (let step = 0; step < 6; step += 1) {
      x += (random() - 0.5) * 40;
      y += (random() - 0.3) * 40;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let index = 0; index < 50; index += 1) {
    const px = random() * size;
    const py = random() * size;
    const gradient = g.createRadialGradient(px, py, 0, px, py, 6 + random() * 14);
    gradient.addColorStop(0, 'rgba(96,106,76,0.26)');
    gradient.addColorStop(1, 'rgba(96,106,76,0)');
    g.fillStyle = gradient;
    g.fillRect(px - 20, py - 20, 40, 40);
  }
  ktGrain(g, size, random, 3000, 0.16);
}

/** Cobbled setts: close-packed rounded stones, a little uneven, wet and dark between. */
function ktCobbles(g, size, random) {
  g.fillStyle = 'rgb(26,25,24)';
  g.fillRect(0, 0, size, size);
  const count = 12;
  const cell = size / count;
  for (let row = 0; row < count; row += 1) {
    for (let column = 0; column < count; column += 1) {
      const cx = (column + (row % 2) * 0.5 + 0.5) * cell + (random() - 0.5) * 3;
      const cy = (row + 0.5) * cell + (random() - 0.5) * 3;
      const tone = 0.66 + random() * 0.6;
      g.fillStyle = ktShade([108, 102, 94], tone);
      const rx = cell * (0.46 + random() * 0.05);
      const ry = cell * (0.42 + random() * 0.06);
      for (const ox of [0, size, -size]) {
        g.beginPath();
        for (let k = 0; k < 8; k += 1) {
          const a = (k / 8) * Math.PI * 2 + 0.4;
          const j = 0.88 + random() * 0.2;
          const px = cx + ox + Math.cos(a) * rx * j;
          const py = cy + Math.sin(a) * ry * j;
          if (k === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.closePath();
        g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.fillRect(cx - rx * 0.5, cy - ry * 0.55, rx * 0.8, 2);
    }
  }
  ktGrain(g, size, random, 1800, 0.12);
}

/** Flagstones: big slabs, cracked, wet grout, moss in the joints. */
function ktFlags(g, size, random) {
  g.fillStyle = 'rgb(26,27,29)';
  g.fillRect(0, 0, size, size);
  const rows = 3;
  const height = size / rows;
  for (let row = 0; row < rows; row += 1) {
    let x = -random() * height;
    while (x < size) {
      const length = height * (0.9 + random() * 1.1);
      const tone = 0.78 + random() * 0.4;
      g.fillStyle = ktShade([92, 92, 94], tone);
      g.fillRect(x + 2.5, row * height + 2.5, length - 5, height - 5);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      g.fillRect(x + 2.5, row * height + 2.5, length - 5, 3);
      g.strokeStyle = 'rgba(10,10,14,0.55)';
      g.lineWidth = 1;
      if (random() < 0.45) {
        g.beginPath();
        g.moveTo(x + random() * length, row * height + 3);
        g.lineTo(x + random() * length, (row + 1) * height - 3);
        g.stroke();
      }
      x += length;
    }
  }
  for (let index = 0; index < 18; index += 1) {
    const px = random() * size;
    const py = random() * size;
    const gradient = g.createRadialGradient(px, py, 0, px, py, 14 + random() * 20);
    gradient.addColorStop(0, 'rgba(58,74,44,0.3)');
    gradient.addColorStop(1, 'rgba(58,74,44,0)');
    g.fillStyle = gradient;
    g.fillRect(px - 36, py - 36, 72, 72);
  }
  ktGrain(g, size, random, 2000, 0.13);
}

/** Wind-flattened grass, desaturated, with bare patches and the odd stone. */
function ktGrass(g, size, random) {
  g.fillStyle = 'rgb(62,72,46)';
  g.fillRect(0, 0, size, size);
  for (let index = 0; index < 260; index += 1) {
    const px = random() * size;
    const py = random() * size;
    const gradient = g.createRadialGradient(px, py, 0, px, py, 14 + random() * 36);
    const tone = random();
    gradient.addColorStop(0, tone < 0.3 ? 'rgba(88,98,58,0.38)' : tone < 0.7 ? 'rgba(44,56,36,0.38)' : 'rgba(78,70,52,0.3)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient;
    for (const ox of [0, size, -size]) g.fillRect(px - 50 + ox, py - 50, 100, 100);
  }
  for (let index = 0; index < 5000; index += 1) {
    const green = 60 + random() * 50;
    g.fillStyle = `rgba(${green * 0.8},${green + 14},${green * 0.5},0.5)`;
    g.fillRect(random() * size, random() * size, 1, 2 + random() * 5);
  }
}

/** The packed path: pale gravel and stone over earth, rutted. */
function ktPath(g, size, random) {
  g.fillStyle = 'rgb(96,90,78)';
  g.fillRect(0, 0, size, size);
  for (let index = 0; index < 400; index += 1) {
    const tone = 0.6 + random() * 0.7;
    g.fillStyle = ktShade([118, 110, 96], tone);
    const w = 4 + random() * 14;
    g.beginPath();
    g.ellipse(random() * size, random() * size, w, w * (0.5 + random() * 0.4), random() * 3, 0, Math.PI * 2);
    g.fill();
  }
  for (let index = 0; index < 8; index += 1) {
    const gradient = g.createLinearGradient(0, 0, size, 0);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(0.5, 'rgba(20,22,26,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gradient;
    g.fillRect(0, random() * size, size, 6 + random() * 10);
  }
  ktGrain(g, size, random, 3000, 0.16);
}

/** Boards: grey-brown planks, the grain and nail heads. */
function ktBoards(g, size, random, base = [84, 66, 48]) {
  const planks = 6;
  const width = size / planks;
  for (let plank = 0; plank < planks; plank += 1) {
    const tone = 0.7 + random() * 0.5;
    g.fillStyle = ktShade(base, tone);
    g.fillRect(plank * width, 0, width, size);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(plank * width, 0, 2, size);
    for (let line = 0; line < 22; line += 1) {
      g.fillStyle = `rgba(20,14,10,${0.08 + random() * 0.14})`;
      g.fillRect(plank * width + 3 + random() * (width - 6), 0, 1, size);
    }
    for (let nail = 0; nail < 2; nail += 1) {
      g.fillStyle = 'rgba(10,10,10,0.7)';
      g.fillRect(plank * width + width / 2, random() * size, 3, 3);
    }
  }
  ktGrain(g, size, random, 1500, 0.1);
}

/** Wet iron-grey, for gates and fittings. */
function ktIron(g, size, random) {
  g.fillStyle = 'rgb(48,48,52)';
  g.fillRect(0, 0, size, size);
  ktGrain(g, size, random, 3000, 0.3, 140, 0);
  for (let index = 0; index < 40; index += 1) {
    g.fillStyle = `rgba(110,60,30,${random() * 0.25})`;
    g.fillRect(random() * size, random() * size, 2 + random() * 8, 2 + random() * 8);
  }
}

// ---- the cut-away ------------------------------------------------------------------------------------

/** Shared uniforms of the screen-door fade: the camera, what it looks at, how wide the clear tube is, and whether it is on. */
const ktFade = { uKitCam: { value: null }, uKitSubject: { value: null }, uKitRadius: { value: 1.0 }, uKitOn: { value: 0 } };

/**
 * Let a material fade out (a dithered discard, a screen door) where it stands between the camera and the man it looks at:
 * every fragment within the tube from the camera to him, and at least half a metre in front of him, is dropped in a pattern
 * thinner the further from the middle of the tube. In a tight stair or a vault the wall that would hide him lets him through.
 */
function ktCutaway(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ktFade);
    shader.vertexShader = `varying vec3 vKitPos;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vKitPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = `varying vec3 vKitPos;\nuniform vec3 uKitCam;\nuniform vec3 uKitSubject;\nuniform float uKitRadius;\nuniform float uKitOn;\n${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if (uKitOn > 0.5) {
    vec3 kitLine = uKitSubject - uKitCam;
    float kitLength = max(length(kitLine), 0.001);
    float kitAlong = dot(vKitPos - uKitCam, kitLine) / (kitLength * kitLength);
    float kitRoom = clamp((1.0 - kitAlong) * kitLength - 0.5, 0.0, 1.0);
    float kitAcross = distance(vKitPos, uKitCam + kitLine * clamp(kitAlong, 0.0, 1.0));
    // (Only what is at the height of the line or above it: the floor under it is not in the way.)
    float kitAbove = vKitPos.y - (uKitCam.y + kitLine.y * clamp(kitAlong, 0.0, 1.0));
    float kitFade = (1.0 - smoothstep(uKitRadius * 0.45, uKitRadius, kitAcross)) * kitRoom * step(0.0, kitAlong) * step(-0.4, kitAbove);
    float kitNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (kitFade > kitNoise * 0.95 + 0.02) discard;
  }`);
  };
  material.customProgramCacheKey = () => 'kit-cutaway';
}

/** Tell the castle's materials where the camera and the man are: the tube between them is let through. */
export function ktSightline(camera, subject, on = true) {
  ktFade.uKitCam.value ??= new THREE.Vector3();
  ktFade.uKitSubject.value ??= new THREE.Vector3();
  ktFade.uKitCam.value.set(camera.x, camera.y, camera.z);
  ktFade.uKitSubject.value.set(subject[0], subject[1], subject[2]);
  ktFade.uKitOn.value = on ? 1 : 0;
}

/**
 * The materials of the castle, by name, each tiling over `tile` metres (the geometry's UVs are in metres).
 * `{ ashlar, ruin, rubble, rock, cobble, flags, grass, path, boards, wood, iron, bone, cloth, straw, flame, glow, black }`.
 */
export function ktMaterials() {
  const make = (map, tile, options = {}) => {
    map.repeat.set(1 / tile, 1 / tile);
    return new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.78, metalness: 0, ...options });
  };
  const m = {};
  ktFade.uKitCam.value ??= new THREE.Vector3(0, 100, 0);
  ktFade.uKitSubject.value ??= new THREE.Vector3(0, -100, 0);
  m.ashlar = make(ktTexture(256, 11, (g, s, r) => ktCoursed(g, s, r, { base: [112, 112, 114], rows: 4, mortar: 'rgb(48,48,50)', variance: 0.32, moss: 0.2 })), 2, { roughness: 0.62 });
  m.ruin = make(ktTexture(256, 12, (g, s, r) => ktCoursed(g, s, r, { base: [100, 102, 100], rows: 4, mortar: 'rgb(40,42,40)', variance: 0.42, moss: 1.1, chip: 0.7 })), 2, { roughness: 0.7 });
  m.rubble = make(ktTexture(256, 13, (g, s, r) => ktRubble(g, s, r, { base: [104, 102, 94], moss: 0.8 })), 3, { roughness: 0.72 });
  m.rock = make(ktTexture(256, 14, ktRock), 4, { roughness: 0.55 });
  m.cobble = make(ktTexture(256, 15, ktCobbles), 2.6, { roughness: 0.46 });
  m.flags = make(ktTexture(256, 16, ktFlags), 3, { roughness: 0.5 });
  m.grass = make(ktTexture(256, 17, ktGrass), 4, { roughness: 0.95 });
  m.path = make(ktTexture(256, 18, ktPath), 3, { roughness: 0.82 });
  m.boards = make(ktTexture(128, 19, (g, s, r) => ktBoards(g, s, r)), 2, { roughness: 0.8 });
  m.wood = make(ktTexture(128, 20, (g, s, r) => ktBoards(g, s, r, [70, 52, 36])), 2, { roughness: 0.85 });
  m.iron = make(ktTexture(128, 21, ktIron), 1.5, { roughness: 0.45, metalness: 0.55 });
  for (const name of ['ashlar', 'ruin', 'rubble', 'rock', 'cobble', 'flags', 'grass', 'path', 'boards', 'wood', 'iron']) ktCutaway(m[name]);
  const flat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.9, ...options });
  m.bone = flat(0xb9b29a, { roughness: 0.8 });
  m.cloth = flat(0x6a3a32, { roughness: 0.95, side: THREE.DoubleSide });
  m.straw = flat(0x8a7a4a, { roughness: 1 });
  m.black = flat(0x101114, { roughness: 0.9 });
  for (const name of ['bone', 'cloth', 'straw', 'black']) ktCutaway(m[name]);
  m.silhouette = flat(0x23252b, { roughness: 1 });
  m.flame = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.glow = new THREE.MeshBasicMaterial({ color: 0xffb060, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  m.raven = flat(0x0b0c10, { roughness: 0.6 });
  m.water = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.88, envMapIntensity: 1.4 });
  return m;
}

/** Let go of a material set's maps and materials. */
export function ktDispose(materials) {
  for (const material of Object.values(materials)) {
    material.map?.dispose();
    material.dispose();
  }
}
