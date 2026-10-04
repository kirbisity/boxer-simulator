// The look of an outfit, for the renderer: the colour of each garment role
// on the body, tattoos, steel, and the pieces that are not part of the body
// mesh — fists, footwear, headgear and the things that swing.

import { Dangle } from './dangle.js';
import { outfitOf, resolveColor } from './outfits.js';
import { outlineFor, surface } from './toon.js';

export const WARDROBE = {
  // Steel: how metal and how polished; the reflection map is a gradient
  // sky (cheap — one texture, built once — and enough to read as steel).
  steel: { metalness: 0.9, roughness: 0.26 },
  // Irezumi: the ink colours of a body suit, and the bare strip down the
  // chest (munewari) that marks it as one.
  ink: { outline: 0x1b1f2e, indigo: 0x26407a, red: 0xb8312f, chestGap: 0.045 },
};

const darker = (hex, share = 0.72) => new THREE.Color(hex).multiplyScalar(share);

/** The design's garments, with 'corner' and the fighter's own colour choices resolved. */
export function dressFor(inputs, cornerHex) {
  const { kind, design, look } = outfitOf(inputs);
  const female = inputs.sex === 'female';
  const chosen = inputs.outfit?.colors ?? {};
  const color = (value) => resolveColor(value, cornerHex);
  const top = look.top && (!look.top.female || female) ? { ...look.top, color: color(chosen.top ?? look.top.color) } : null;
  const bottom = look.bottom ? { ...look.bottom, color: color(chosen.bottom ?? look.bottom.color) } : null;
  const feet = (female && look.femaleFeet) || look.feet || { kind: 'bare' };
  // A side's colours over any design (`tint`: the armour's lacquer and
  // lacing, the helmet), and a banner on the back (sashimono).
  const tint = inputs.outfit?.tint;
  const armor = look.armor && tint ? { ...look.armor, color: tint.armor ?? look.armor.color, lace: tint.lace ?? look.armor.lace } : look.armor;
  const head = look.head && tint?.armor ? { ...look.head, color: tint.armor, lace: tint.lace ?? look.head.lace } : look.head;
  return { kind, design, look, top, bottom, armor, feet, head, extras: look.extras ?? [], tattoo: look.tattoo, female, color, banner: inputs.outfit?.banner ?? null };
}

/** The colour of each role the body mesh is painted with, for this dress. */
export function roleColors(dress, skin) {
  const { top, bottom, armor, feet, color } = dress;
  const base = (value, fallback) => new THREE.Color(value ? color(value) : fallback);
  const topColor = base(top?.color, 0x888888);
  const kitColor = base(bottom?.color, 0x888888);
  const armorColor = base(armor?.color, 0x222222);
  return {
    skin,
    kit: kitColor,
    band: new THREE.Color(0xf4f4f4),
    trim2: bottom?.trim || bottom?.stripe ? base(bottom.trim ?? bottom.stripe) : darker(kitColor, 0.7),
    top: topColor,
    trim: top?.trim ? base(top.trim) : darker(topColor, 0.75),
    stripe: base(top?.stripe, 0xf2f2f2),
    shirt: base(top?.shirt ?? top?.under, 0xe4e4e6),
    tie: base(top?.tie, 0x8a1f2a),
    pattern: top?.pattern || top?.check ? base(top.pattern ?? top.check) : darker(topColor, 0.55),
    belt: new THREE.Color(bottom?.kind === 'slacks' ? 0x151515 : 0x2a1d14),
    under: base(bottom?.under, 0x1c1c22),
    mawashi: kitColor,
    armor: armorColor,
    pad: armorColor.clone().lerp(new THREE.Color(0x555a63), 0.35),
    steel: armorColor,
    steel2: darker(armorColor, 0.62),
    boot: base(feet?.color, 0x17171c),
    sock: base(feet?.socks, 0xdddddd),
    top2: topColor,
    // Lamellar's lacing and gilt; the leather of a gladiator's straps.
    lace: base(armor?.lace, 0x1d2a4f),
    gold: base(armor?.gold, 0xd6a743),
    // Mail's rings, light and shadow; the leather of a do's front; a
    // surcoat's or brigandine's cloth and its second (heraldic) colour.
    mail: base(armor?.mail, 0x8d9097),
    mail2: darker(base(armor?.mail, 0x8d9097), 0.6),
    leather: base(armor?.leather, 0x5a3a22),
    cloth: base(armor?.cloth, 0x8a1f22),
    cloth2: base(armor?.cloth2, 0xe8e2d2),
  };
}

/**
 * An irezumi body suit, painted on bare skin: waves in indigo, peonies in
 * red, outlined in black, everywhere but the face, neck, hands and feet,
 * and a bare strip down the middle of the chest.
 */
export function tattooColor(point, segment, skin) {
  if (!segment || ['head', 'neck', 'lFoot', 'rFoot'].includes(segment)) return null;
  const [x, y, z] = point;
  if (segment === 'trunk' && x > 0 && Math.abs(z) < WARDROBE.ink.chestGap) return null;
  const waves = Math.sin(x * 21 + y * 14) + Math.sin(-z * 17 + y * 9) + 0.6 * Math.sin(x * 31 - z * 23 + y * 5);
  if (Math.abs(waves - 0.2) < 0.13 || Math.abs(waves - 1.2) < 0.1) return new THREE.Color(WARDROBE.ink.outline);
  if (waves > 1.2) return new THREE.Color(WARDROBE.ink.red);
  if (waves > -1.4) return new THREE.Color(WARDROBE.ink.indigo);
  return skin.clone().lerp(new THREE.Color(WARDROBE.ink.indigo), 0.25);
}

/** A metal material for steel: shiny, lit by the shared reflection map. */
export function steelMaterial(envMap, options = {}) {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: WARDROBE.steel.metalness, roughness: WARDROBE.steel.roughness, envMap, envMapIntensity: 1.1, ...options });
}

/**
 * The reflection map for steel: a painted gradient sky with a bright
 * horizon band, made into an environment once per scene.
 */
export function steelEnvironment(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const gradient = g.createLinearGradient(0, 0, 0, 128);
  gradient.addColorStop(0, '#f4f7ff');
  gradient.addColorStop(0.42, '#9aa6bb');
  gradient.addColorStop(0.5, '#ffffff');
  gradient.addColorStop(0.58, '#5d636e');
  gradient.addColorStop(1, '#1a1c22');
  g.fillStyle = gradient;
  g.fillRect(0, 0, 256, 128);
  // A few soft lamps, for highlights that move as the steel turns.
  for (const [x, y] of [[40, 30], [150, 22], [210, 40]]) {
    const lamp = g.createRadialGradient(x, y, 0, x, y, 18);
    lamp.addColorStop(0, 'rgba(255,255,255,1)');
    lamp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = lamp;
    g.fillRect(x - 18, y - 18, 36, 36);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  return target.texture;
}

// ---- Pieces off the body mesh -------------------------------------------------

/** Shadows and ink outlines for a group's meshes (gathered first: an outline is a mesh too). */
function inkAll(group, width = 0.003) {
  const meshes = [];
  group.traverse((piece) => {
    if (piece.isMesh && !piece.userData.outline) meshes.push(piece);
  });
  for (const piece of meshes) {
    piece.castShadow = true;
    if (!piece.userData.noOutline) piece.add(outlineFor(piece, width));
  }
}

const finish = (group) => {
  inkAll(group);
  group.matrixAutoUpdate = false;
  return group;
};

/**
 * A hand: a bare fist in skin, a black tactical glove, or a steel gauntlet,
 * in the forearm's frame at the hand point (y along the forearm).
 */
export function buildHand(body, side, kind, skinColor, steel) {
  const scale = body.heightM / 1.8;
  const material = kind === 'gauntlet' ? steel : surface(kind === 'tactical' ? 0x18191d : skinColor);
  const hand = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), material);
  palm.scale.set(0.034 * scale * (kind === 'bare' ? 1 : 1.1), 0.045 * scale, 0.042 * scale * (kind === 'bare' ? 1 : 1.08));
  palm.position.y = 0.012 * scale;
  hand.add(palm);
  for (let finger = 0; finger < 4; finger += 1) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.0095 * scale, 10, 8), material);
    knuckle.position.set(0.008 * scale, 0.045 * scale, (finger - 1.5) * 0.018 * scale);
    hand.add(knuckle);
  }
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * scale, 0.012 * scale, 0.045 * scale, 8), material);
  thumb.rotation.x = Math.PI / 2;
  thumb.position.set(0.03 * scale, 0.022 * scale, (side === 'l' ? -1 : 1) * 0.004 * scale);
  hand.add(thumb);
  if (kind !== 'bare') {
    // The cuff of the glove or the gauntlet's flared wrist.
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, kind === 'gauntlet' ? 0.055 * scale : 0.042 * scale, 0.06 * scale, 14), material);
    cuff.position.y = -0.04 * scale;
    hand.add(cuff);
  }
  return finish(hand);
}

/**
 * Footwear in the foot's frame (y along the foot, toes forward): soles and
 * uppers by kind, a heel block under a woman's business boot, steel
 * sabatons, or a bare foot.
 */
export function buildFootwear(body, kind, colors, skinColor, steel, heels) {
  const length = 0.25 * body.heightM / 1.8;
  const shoe = new THREE.Group();
  const upperColor = colors.boot.getHex();
  const spec = {
    boxingBoot: { width: 0.05, height: 0.045, sole: 0x17171c },
    trainer: { width: 0.054, height: 0.05, sole: 0xf4f4f6 },
    hikingBoot: { width: 0.06, height: 0.058, sole: 0x2a2420 },
    tacticalBoot: { width: 0.06, height: 0.056, sole: 0x111111 },
    compactBoot: { width: 0.054, height: 0.05, sole: 0x111111 },
    heelAnkleBoot: { width: 0.05, height: 0.042, sole: 0x0b0b0d },
    dressShoe: { width: 0.045, height: 0.038, sole: 0x2a1d14 },
    // Split-toed socks on straw sandals; a gladiator's leather sandal.
    tabi: { width: 0.046, height: 0.045, sole: 0xc8b27a },
    sandal: { width: 0.036, height: 0.044, sole: 0x5a3a22, skin: true },
    sabaton: { width: 0.058, height: 0.05 },
    bare: { width: 0.042, height: 0.032 },
  }[kind] ?? { width: 0.05, height: 0.045, sole: 0x17171c };
  const upperMaterial = kind === 'sabaton' ? steel : kind === 'bare' || spec.skin ? surface(skinColor) : surface(upperColor, { roughness: 0.5 });
  const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), upperMaterial);
  upper.scale.set(spec.width, length / 2, spec.height);
  upper.position.set(-0.012, length * 0.28, 0);
  shoe.add(upper);
  if (spec.sole !== undefined) {
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.018, length * 0.95, spec.height * 1.9), surface(spec.sole));
    sole.position.set(-spec.width * 0.95, length * 0.28, 0);
    shoe.add(sole);
  }
  if (kind === 'sandal') {
    // Straps across the bare foot.
    for (const along of [0.15, 0.45, 0.72]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(spec.height * 1.02, 0.005, 5, 14, Math.PI), surface(upperColor));
      strap.rotation.y = Math.PI / 2;
      strap.rotation.z = Math.PI / 2;
      strap.position.set(-0.01, length * along, 0);
      shoe.add(strap);
    }
  }
  if (kind === 'trainer' && colors.accent) {
    const swoosh = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.6, length * 0.5, spec.height * 2.02), surface(colors.accent));
    swoosh.position.set(-0.006, length * 0.3, 0);
    shoe.add(swoosh);
  }
  if (heels) {
    // A long pointed toe; then the whole boot pitched up at the heel, its
    // toe still on the floor, standing on a slim stiletto.
    const toe = new THREE.Mesh(new THREE.ConeGeometry(spec.height * 0.95, length * 0.42, 12), upperMaterial);
    toe.scale.set(spec.width / spec.height * 0.7, 1, 1);
    toe.position.set(-0.02, length * 0.86, 0);
    shoe.add(toe);
    const pitch = -0.32;
    const floor = -(spec.width * 0.95 + 0.009);
    const toeTip = length * 1.07;
    const lift = floor * (1 - Math.cos(pitch)) - toeTip * Math.sin(pitch);
    for (const piece of [...shoe.children]) {
      const { x, y } = piece.position;
      piece.position.set(x * Math.cos(pitch) + y * Math.sin(pitch) + lift, -x * Math.sin(pitch) + y * Math.cos(pitch), piece.position.z);
      piece.rotation.z -= pitch;
    }
    // The heel's back corner, lifted, down to the floor.
    const heelBack = -length * 0.18;
    const heelTop = floor * Math.cos(pitch) + heelBack * Math.sin(pitch) + lift;
    const heelLength = heelTop - floor;
    const heel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.004, heelLength, 8), surface(0x0b0b0d));
    heel.rotation.z = Math.PI / 2;
    heel.position.set(floor + heelLength / 2, heelBack * Math.cos(pitch) - floor * Math.sin(pitch) + 0.01, 0);
    shoe.add(heel);
  }
  if (kind === 'sabaton') {
    // Overlapping lames over the toes.
    for (let lame = 0; lame < 3; lame += 1) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(spec.width * 1.05, spec.width * 1.05, 0.012, 14, 1, true, 0, Math.PI), steel);
      band.rotation.z = Math.PI / 2;
      band.position.set(0.005, length * (0.42 + lame * 0.14), 0);
      band.userData.noOutline = true;
      shoe.add(band);
    }
  }
  return finish(shoe);
}

/**
 * Headgear, in head coordinates (r the head radius): an amateur's
 * headguard, a beanie, a riot helmet with its visor, a knight's great helm
 * or bascinet. Returns the group and whether it hides the hair.
 */
export function buildHeadgear(body, head, colors, steel, cornerHex) {
  if (!head) return null;
  const r = body.lengths.headRadius;
  const group = new THREE.Group();
  const color = head.color === 'corner' ? cornerHex : head.color;
  const cloth = surface(color);
  let hidesHair = true;
  switch (head.kind) {
    case 'headguard': {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.14 * r, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), cloth);
      shell.position.y = 0.02 * r;
      group.add(shell);
      for (const side of [1, -1]) {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.4 * r, 12, 10), cloth);
        cheek.scale.set(1, 1.4, 0.5);
        cheek.position.set(0.35 * r, -0.45 * r, side * 0.9 * r);
        group.add(cheek);
      }
      const brow = new THREE.Mesh(new THREE.TorusGeometry(0.85 * r, 0.14 * r, 8, 20, Math.PI * 0.9), cloth);
      brow.rotation.set(Math.PI / 2, 0, -Math.PI * 0.45);
      brow.position.set(0.18 * r, 0.42 * r, 0);
      group.add(brow);
      break;
    }
    case 'beanie': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.13 * r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth);
      cap.position.y = 0.05 * r;
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(1.12 * r, 1.14 * r, 0.25 * r, 18, 1, true), surface(new THREE.Color(color).multiplyScalar(0.8).getHex()));
      fold.position.y = 0.12 * r;
      group.add(cap, fold);
      hidesHair = false;
      break;
    }
    case 'riotHelmet': {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.26 * r, 22, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), cloth);
      dome.position.y = 0.05 * r;
      group.add(dome);
      if (head.visor !== false) {
        const visor = new THREE.Mesh(new THREE.SphereGeometry(1.3 * r, 20, 12, Math.PI * 0.58, Math.PI * 0.84, Math.PI * 0.35, Math.PI * 0.33), new THREE.MeshStandardMaterial({ color: 0x9fb6d6, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0.2, side: THREE.DoubleSide }));
        visor.position.y = -0.02 * r;
        visor.userData.noOutline = true;
        group.add(visor);
      }
      if (head.neck) {
        // A neck protector all the way round under the helmet, down to the
        // collar: a padded back flap and a throat guard.
        const guard = new THREE.Mesh(new THREE.CylinderGeometry(1.12 * r, 1.45 * r, 1.25 * r, 20, 1, true), cloth);
        guard.material = cloth.clone();
        guard.material.side = THREE.DoubleSide;
        guard.position.y = -0.95 * r;
        group.add(guard);
      }
      break;
    }
    case 'greatHelm': {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * r, 1.22 * r, 2.1 * r, 20, 1, false), steel);
      barrel.position.y = -0.15 * r;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 20, 8, 0, Math.PI * 2, 0, Math.PI * 0.32), steel);
      crown.position.y = 0.55 * r;
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.2 * r, 0.08 * r, 1.6 * r), surface(0x050506));
      slit.position.set(1.17 * r, 0.12 * r, 0);
      slit.userData.noOutline = true;
      const cross = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 1.0 * r, 0.12 * r), steel);
      cross.position.set(1.22 * r, -0.3 * r, 0);
      group.add(barrel, crown, slit, cross);
      break;
    }
    case 'bascinet': {
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 20, 14), steel);
      skull.scale.set(1, head.pointed ? 1.25 : 1.08, 1);
      skull.position.y = 0.08 * r;
      const visor = new THREE.Mesh(new THREE.ConeGeometry(0.75 * r, 1.25 * r, 14), steel);
      visor.rotation.z = -Math.PI / 2;
      visor.position.set(1.15 * r, -0.12 * r, 0);
      const slits = new THREE.Mesh(new THREE.BoxGeometry(0.08 * r, 0.06 * r, 1.0 * r), surface(0x050506));
      slits.position.set(1.12 * r, 0.12 * r, 0);
      slits.userData.noOutline = true;
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.45 * r, 0.8 * r, 18, 1, true), steel);
      aventail.position.y = -0.95 * r;
      group.add(skull, visor, slits, aventail);
      break;
    }
    case 'kabuto':
      buildKabuto(group, head, r, steel, color);
      break;
    case 'gladiatorHelm':
      buildGladiatorHelm(group, head, r, steel, color);
      break;
    case 'jingasa': {
      // The ashigaru's war hat: a broad shallow cone of lacquered iron, the mon on the front.
      const lacquer = metal(steel, color);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.1 * r, 0.85 * r, 28, 1, true), lacquer);
      cone.material = lacquer.clone();
      cone.material.side = THREE.DoubleSide;
      cone.position.y = 0.72 * r;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.08 * r, 1.12 * r, 0.3 * r, 18, 1, true), surface(0x1a1714));
      band.position.y = 0.32 * r;
      const mon = new THREE.Mesh(new THREE.CircleGeometry(0.28 * r, 18), metal(steel, head.gold ?? 0xd6a743));
      mon.position.set(1.32 * r, 0.62 * r, 0);
      mon.rotation.set(0, Math.PI / 2, -0.38);
      mon.userData.noOutline = true;
      for (const side of [1, -1]) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, 0.9 * r, 0.05 * r), surface(0x2a2420));
        tie.position.set(0.1 * r, -0.2 * r, side * 0.95 * r);
        tie.rotation.x = side * 0.15;
        group.add(tie);
      }
      group.add(cone, band, mon);
      hidesHair = false;
      break;
    }
    case 'kettleHat': {
      // A foot soldier's chapel de fer: a round steel crown and a broad brim sloping down.
      const crownSteel = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), crownSteel);
      crown.scale.y = head.tall ? 1.25 : 1.05;
      crown.position.y = 0.1 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.22 * r, (head.brim ?? 1.9) * r, 0.42 * r, 26, 1, true), crownSteel);
      brim.material = crownSteel.clone();
      brim.material.side = THREE.DoubleSide;
      brim.position.y = -0.08 * r;
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.2 * r, 0.05 * r, 6, 20, Math.PI), crownSteel);
      ridge.rotation.y = Math.PI / 2;
      ridge.position.y = 0.1 * r;
      ridge.scale.y = crown.scale.y;
      group.add(crown, brim, ridge);
      if (head.coif) {
        const coif = new THREE.Mesh(new THREE.CylinderGeometry(1.08 * r, 1.4 * r, 1.1 * r, 18, 1, true), metal(steel, 0x7d8087));
        coif.position.y = -0.85 * r;
        group.add(coif);
      }
      break;
    }
    case 'secutorHelm': {
      // The secutor's smooth egg of bronze: nothing for a net or a trident
      // to catch on, two small eyeholes, a low fin.
      const bronze = metal(steel, color);
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.32 * r, 24, 18), bronze);
      shell.scale.set(1.08, 1.18, 1);
      shell.position.set(0.05 * r, -0.05 * r, 0);
      const fin = new THREE.Mesh(new THREE.TorusGeometry(1.42 * r, 0.1 * r, 6, 20, Math.PI * 0.85), bronze);
      fin.position.y = -0.05 * r;
      fin.rotation.z = 0.25;
      fin.scale.set(1.05, 1.15, 1);
      const dark = surface(0x0c0b09);
      for (const side of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.CircleGeometry(0.12 * r, 12), dark);
        eye.position.set(1.4 * r, 0.12 * r, side * 0.32 * r);
        eye.rotation.y = Math.PI / 2 - side * 0.25;
        eye.userData.noOutline = true;
        group.add(eye);
      }
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.3 * r, 0.06 * r, 6, 24), bronze);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -1.15 * r;
      group.add(shell, fin, rim);
      break;
    }
    default:
      return null;
  }
  inkAll(group);
  return { group, hidesHair };
}

/** Steel of another colour, polished like the rest. */
function metal(steel, hex) {
  const material = steel.clone();
  material.color = new THREE.Color(hex);
  return material;
}

/**
 * A samurai's kabuto, head coordinates (x forward, y up, z left; r the head
 * radius): a ribbed bowl, the shikoro (tiers of laced lames flaring down
 * over the neck), fukigaeshi turned back beside the face, a crest at the
 * brow, and perhaps a menpo over the lower face.
 */
function buildKabuto(group, head, r, steel, color) {
  const bowlSteel = metal(steel, color);
  const gold = metal(steel, head.gold ?? 0xd6a743);
  const lace = surface(head.lace ?? 0x1d2a4f);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.24 * r, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), bowlSteel);
  bowl.scale.y = 0.95;
  bowl.position.y = 0.05 * r;
  // Ribs down the bowl, and the tehen ring at the crown.
  for (let rib = 0; rib < 12; rib += 1) {
    const angle = (rib / 12) * Math.PI * 2;
    const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.25 * r, 0.025 * r, 4, 16, Math.PI * 0.5), gold);
    ridge.rotation.set(0, angle, Math.PI / 2);
    ridge.position.y = 0.05 * r;
    ridge.scale.y = 0.95;
    group.add(ridge);
  }
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.22 * r, 0.05 * r, 6, 14), gold);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.22 * r;
  group.add(bowl, crown);
  // Shikoro: tiers widening down and out, open at the face.
  for (let tier = 0; tier < 4; tier += 1) {
    const top = 1.2 * r + tier * 0.18 * r;
    const bottom = top + 0.2 * r;
    // Cylinder angles start at +z (the left); the open part faces +x, the front.
    const lame = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, 0.26 * r, 22, 1, true, Math.PI * 0.82, Math.PI * 1.36), bowlSteel);
    lame.material = bowlSteel.clone();
    lame.material.side = THREE.DoubleSide;
    lame.position.y = -0.05 * r - tier * 0.24 * r;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(bottom * 1.005, bottom * 1.01, 0.05 * r, 22, 1, true, Math.PI * 0.82, Math.PI * 1.36), lace);
    cord.material = lace.clone();
    cord.material.side = THREE.DoubleSide;
    cord.position.y = lame.position.y - 0.13 * r;
    group.add(lame, cord);
  }
  // Fukigaeshi: the top lame turned back beside the face.
  for (const side of [1, -1]) {
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.45 * r, 0.42 * r, 0.06 * r), bowlSteel);
    flap.position.set(0.55 * r, -0.05 * r, side * 1.3 * r);
    flap.rotation.y = side * -0.6;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.47 * r, 0.06 * r, 0.07 * r), gold);
    edge.position.copy(flap.position).add(new THREE.Vector3(0, 0.2 * r, 0));
    edge.rotation.y = flap.rotation.y;
    group.add(flap, edge);
  }
  // The peak over the brow.
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(1.32 * r, 1.4 * r, 0.06 * r, 20, 1, false, Math.PI * 0.2, Math.PI * 0.6), bowlSteel);
  peak.position.set(0.05 * r, 0.12 * r, 0);
  group.add(peak);
  // The crest (maedate) is headgear of its own (kabutoCrest): it can be knocked off.
  // Menpo: the lower face guard, with a nose and a bristling moustache.
  if (head.mask) {
    const maskSteel = metal(steel, head.mask === 'red' ? color : 0x141416);
    // Sphere angles: x = −cos φ, so the front (+x) is at φ = π.
    const menpo = new THREE.Mesh(new THREE.SphereGeometry(1.06 * r, 18, 10, Math.PI * 0.58, Math.PI * 0.84, Math.PI * 0.52, Math.PI * 0.36), maskSteel);
    menpo.material = maskSteel.clone();
    menpo.material.side = THREE.DoubleSide;
    menpo.position.y = 0;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14 * r, 0.32 * r, 8), maskSteel);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(1.08 * r, -0.12 * r, 0);
    const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.08 * r, 0.6 * r), surface(0xe8e4da));
    moustache.position.set(1.06 * r, -0.34 * r, 0);
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), lace);
    throat.material = lace.clone();
    throat.material.side = THREE.DoubleSide;
    throat.position.y = -1.0 * r;
    group.add(menpo, nose, moustache, throat);
  }
}

// How much bigger than first drawn a crest and a plume stand: they are meant to be seen.
const HEAD_DRESS_SCALE = 1.7;
const PLUME_SCALE = 1.15;

/** A kabuto's crest (maedate) on its holder at the brow, in head coordinates. */
export function kabutoCrest(head, r, steel) {
  const gold = metal(steel, head.gold ?? 0xd6a743);
  const crest = new THREE.Group();
  crest.position.set(1.22 * r, 0.32 * r, 0);
  const crestMetal = head.crest === 'antlers' ? surface(0x16161a, { roughness: 0.5 }) : gold;
  switch (head.crest) {
    case 'crescent': {
      const moon = new THREE.Mesh(new THREE.TorusGeometry(0.9 * r, 0.07 * r, 6, 24, Math.PI), crestMetal);
      moon.scale.set(1, 0.75, 0.35);
      moon.rotation.y = Math.PI / 2;
      moon.position.y = 0.05 * r;
      crest.add(moon);
      break;
    }
    case 'kuwagata': case 'tall': {
      for (const side of [1, -1]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.04 * r, (head.crest === 'tall' ? 1.9 : 1.3) * r, 0.18 * r), crestMetal);
        horn.position.set(0, (head.crest === 'tall' ? 0.9 : 0.6) * r, side * 0.32 * r);
        horn.rotation.x = side * (head.crest === 'tall' ? 0.22 : 0.42);
        crest.add(horn);
      }
      if (head.crest === 'tall') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * r, 0.22 * r, 0.04 * r, 18), gold);
        disc.rotation.z = Math.PI / 2;
        disc.position.y = 0.2 * r;
        crest.add(disc);
      }
      break;
    }
    case 'sun': {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * r, 0.42 * r, 0.05 * r, 26), crestMetal);
      disc.rotation.z = Math.PI / 2;
      disc.position.y = 0.38 * r;
      const sun = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * r, 0.3 * r, 0.06 * r, 22), surface(0xc8161b));
      sun.rotation.z = Math.PI / 2;
      sun.position.set(0.01 * r, 0.38 * r, 0);
      crest.add(disc, sun);
      break;
    }
    case 'antlers': {
      for (const side of [1, -1]) {
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * r, 0.05 * r, 1.5 * r, 6), crestMetal);
        beam.position.set(-0.3 * r, 0.65 * r, side * 0.55 * r);
        beam.rotation.set(side * 0.55, 0, 0.35);
        crest.add(beam);
        for (const [up, out] of [[0.35, 0.3], [0.75, 0.45], [1.1, 0.4]]) {
          const tine = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * r, 0.035 * r, 0.5 * r, 5), crestMetal);
          tine.position.set(-0.2 * r - up * 0.25 * r, up * r + 0.1 * r, side * (0.3 + out) * r);
          tine.rotation.set(side * 0.1, 0, -0.6);
          crest.add(tine);
        }
      }
      break;
    }
    default:
      break;
  }
  inkAll(crest);
  return crest;
}

/**
 * Headgear worn over the head or the helmet, in head coordinates (r the
 * head radius): a runner's cap, a boonie hat, a yakuza's hat, a commoner's
 * wrapped head, a knight's plume, a kabuto's crest. Null if the outfit has
 * nothing for it to sit on.
 */
export function buildHeadProp(kind, body, dress, colors, steel, cornerHex) {
  const r = body.lengths.headRadius;
  const group = new THREE.Group();
  const cloth = (hex) => surface(hex, { roughness: 0.75 });
  switch (kind) {
    case 'cap': {
      const fabric = cloth(colors.top.getHex());
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.14 * r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), fabric);
      crown.position.y = 0.08 * r;
      const peak = new THREE.Mesh(new THREE.CylinderGeometry(0.95 * r, 0.95 * r, 0.05 * r, 18, 1, false, Math.PI * 0.2, Math.PI * 0.6), fabric);
      peak.scale.set(1, 1, 0.75);
      peak.position.set(0.55 * r, 0.12 * r, 0);
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.1 * r, 8, 6), fabric);
      button.position.y = 1.2 * r;
      group.add(crown, peak, button);
      break;
    }
    case 'boonie': {
      const fabric = cloth(0x9a9068);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.14 * r, 0.75 * r, 18), fabric);
      crown.position.y = 0.45 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * r, 1.95 * r, 0.3 * r, 22, 1, true), fabric);
      brim.material = fabric.clone();
      brim.material.side = THREE.DoubleSide;
      brim.position.y = 0.0;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.12 * r, 1.14 * r, 0.12 * r, 18, 1, true), cloth(0x5a5238));
      band.position.y = 0.18 * r;
      group.add(crown, brim, band);
      break;
    }
    case 'hat': {
      const felt = cloth(0x1a1a1d);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.88 * r, 1.08 * r, 0.85 * r, 20), felt);
      crown.scale.z = 0.88;
      crown.position.y = 0.5 * r;
      const pinch = new THREE.Mesh(new THREE.BoxGeometry(0.9 * r, 0.12 * r, 0.25 * r), felt);
      pinch.position.y = 0.9 * r;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.085 * r, 1.09 * r, 0.16 * r, 20, 1, true), cloth(0x8a1f2a));
      band.position.y = 0.2 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.8 * r, 1.75 * r, 0.05 * r, 26), felt);
      brim.position.y = 0.1 * r;
      group.add(crown, pinch, band, brim);
      break;
    }
    case 'headWrap': {
      const linen = cloth(0xd8cfb8);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1 * r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), linen);
      cap.position.y = 0.06 * r;
      const roll = new THREE.Mesh(new THREE.TorusGeometry(1.06 * r, 0.16 * r, 8, 22), linen);
      roll.rotation.x = Math.PI / 2;
      roll.rotation.z = 0.15;
      roll.position.y = 0.22 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.22 * r, 10, 8), linen);
      knot.position.set(-1.12 * r, 0.25 * r, 0);
      group.add(cap, roll, knot);
      for (const side of [1, -1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.6 * r, 0.22 * r), linen);
        tail.position.set(-1.18 * r, -0.05 * r, side * 0.14 * r);
        tail.rotation.x = side * 0.25;
        group.add(tail);
      }
      break;
    }
    case 'plume': {
      if (!dress.head) return null;
      // On the crown of the helm, sweeping back.
      const top = dress.head.kind === 'bascinet' ? (dress.head.pointed ? 1.55 : 1.35) * r : 0.95 * r;
      const feather = surface(cornerHex, { roughness: 0.9 });
      // Built round its holder on the crown, then sized up as a whole.
      const plume = new THREE.Group();
      plume.position.y = top;
      plume.scale.setScalar(PLUME_SCALE);
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * r, 0.08 * r, 0.3 * r, 8), steel);
      plume.add(holder);
      for (let index = 0; index < 9; index += 1) {
        const angle = 0.1 + index * 0.19;
        const blade = new THREE.Mesh(new THREE.SphereGeometry(0.17 * r, 8, 6), feather);
        blade.scale.set(1, 3.6, 0.6);
        blade.position.set(-Math.sin(angle) * 0.8 * r, 0.15 * r + Math.cos(angle) * 0.8 * r, (index % 2 ? 1 : -1) * 0.06 * r);
        blade.rotation.z = angle;
        plume.add(blade);
      }
      group.add(plume);
      break;
    }
    case 'crest': {
      if (dress.head?.kind !== 'kabuto') return null;
      // Grown from its holder at the brow.
      const crest = kabutoCrest(dress.head, r, steel);
      crest.scale.setScalar(HEAD_DRESS_SCALE);
      return crest;
    }
    default:
      return null;
  }
  inkAll(group);
  return group;
}

/**
 * A hoplomachus's helmet: a bronze bowl with a broad brim all round, a
 * grated visor over the face, a crest along the top and a plume in it.
 */
function buildGladiatorHelm(group, head, r, steel, color) {
  const bronze = metal(steel, color);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.22 * r, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), bronze);
  bowl.position.y = 0.05 * r;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.95 * r, 2.0 * r, 0.06 * r, 28), bronze);
  brim.position.y = -0.38 * r;
  // A drooping brim at the back and sides, rolled at the edge.
  const roll = new THREE.Mesh(new THREE.TorusGeometry(1.98 * r, 0.06 * r, 6, 32), bronze);
  roll.rotation.x = Math.PI / 2;
  roll.position.y = -0.38 * r;
  // The visor: a face plate pierced by a grille.
  if (head.grille === false) {
    group.add(bowl, brim, roll, ridge);
    return;
  }
  const visor = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 18, 10, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.42, Math.PI * 0.4), bronze);
  visor.material = bronze.clone();
  visor.material.side = THREE.DoubleSide;
  const dark = surface(0x0c0b09);
  for (let row = 0; row < 4; row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.07 * r, 8), dark);
      const theta = Math.PI * 0.5 + 0.18 + row * 0.12;
      const phi = column * 0.16;
      hole.position.set(1.215 * r * Math.sin(theta) * Math.cos(phi), 1.215 * r * Math.cos(theta), -1.215 * r * Math.sin(theta) * Math.sin(phi));
      hole.lookAt(hole.position.clone().multiplyScalar(2));
      hole.userData.noOutline = true;
      group.add(hole);
    }
  }
  // The crest ridge front to back: a plume standing in it (hoplomachus), a
  // tall solid fin (murmillo), or a griffin's neck curving forward (thraex).
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(1.25 * r, 0.09 * r, 6, 20, Math.PI), bronze);
  ridge.position.y = 0.05 * r;
  ridge.scale.y = 1.05;
  if (head.crest === 'fin') {
    // A half-disc standing up along the crown, front to back (cylinder angles start at +z, here turned up).
    const fin = new THREE.Mesh(new THREE.CylinderGeometry(1.85 * r, 1.85 * r, 0.09 * r, 24, 1, false, -Math.PI * 0.42, Math.PI * 0.84), bronze);
    fin.rotation.x = -Math.PI / 2;
    fin.position.y = 0.05 * r;
    group.add(fin);
  } else if (head.crest === 'griffin') {
    const neck = new THREE.Mesh(new THREE.TorusGeometry(1.5 * r, 0.12 * r, 8, 20, Math.PI * 0.7), bronze);
    neck.position.y = 0.05 * r;
    neck.rotation.z = Math.PI * 0.2;
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.16 * r, 0.5 * r, 8), bronze);
    beak.position.set(1.05 * r, 1.25 * r, 0);
    beak.rotation.z = -Math.PI * 0.62;
    group.add(neck, beak);
  }
  const plume = surface(head.plume ?? 0xb81d22, { roughness: 0.9 });
  for (let feather = 0; feather < (head.crest === 'fin' ? 0 : head.crest === 'griffin' ? 5 : 9); feather += 1) {
    const angle = 0.25 + (feather / 8) * (Math.PI - 0.5);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.2 * r, 1.3 * r, 0.06 * r), plume);
    blade.position.set(Math.cos(angle) * 1.75 * r, 0.05 * r + Math.sin(angle) * 1.75 * r, 0);
    blade.rotation.z = angle - Math.PI / 2;
    group.add(blade);
  }
  group.add(bowl, brim, roll, visor, ridge);
}

/**
 * The things that swing: a tie from the collar, a sumo's sagari strings
 * from the mawashi, a knight's tabard front and back. Each is a Dangle on
 * the collar or the hips.
 */
export function buildSwinging(body, dress, collar, hips, cornerHex) {
  const scale = body.heightM / 1.8;
  const dangles = [];
  for (const extra of dress.extras) {
    const color = extra.color === 'corner' ? cornerHex : extra.color;
    if (extra.kind === 'tie') {
      const tie = new Dangle(collar, [0.1 * scale, -0.07 * scale, 0], [0.28, -1, 0], 0.3 * scale, { sag: extra.loose ? 0.9 : 0.5, damping: 0.2 });
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008 * scale, 0.3 * scale, 0.05 * scale), surface(color));
      blade.position.y = -0.15 * scale;
      tie.group.add(blade);
      dangles.push(tie);
    } else if (extra.kind === 'sagari') {
      const cords = surface(color);
      for (let index = 0; index < 9; index += 1) {
        const across = (index - 4) * 0.022 * scale;
        const sagari = new Dangle(hips, [0.15 * scale, 0.04 * scale, across], [0.3, -1, across * 2], 0.24 * scale, { sag: 0.7, damping: 0.15 });
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004 * scale, 0.005 * scale, 0.24 * scale, 5), cords);
        cord.position.y = -0.12 * scale;
        sagari.group.add(cord);
        dangles.push(sagari);
      }
    } else if (extra.kind === 'tabard') {
      for (const facing of [1, -1]) {
        const panel = new Dangle(collar, [facing * 0.17 * scale, -0.05 * scale, 0], [facing * 0.12, -1, 0], 0.75 * scale, { sag: 0.4, damping: 0.25 });
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.012 * scale, 0.75 * scale, 0.36 * scale), surface(color));
        cloth.position.y = -0.375 * scale;
        panel.group.add(cloth);
        if (extra.emblem) {
          const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.08 * scale, 3), surface(extra.emblem));
          emblem.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
          emblem.rotation.z = Math.PI;
          emblem.position.set(facing * 0.008 * scale, -0.28 * scale, 0);
          panel.group.add(emblem);
        }
        dangles.push(panel);
      }
    }
  }
  for (const dangle of dangles) inkAll(dangle.group, 0.0025);
  return dangles;
}

/**
 * Lettering across the back of the armour ("SWAT"), on the chest bone's
 * frame at the neck: x forward, y up the spine, z to the left.
 */
/**
 * A sashimono: the side's banner on a pole up the back, standing clear of
 * the helmet, a white disc on the field (collar coordinates: x forward, y up).
 */
export function buildBanner(body, colorHex) {
  const scale = body.heightM / 1.8;
  const back = -(body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.05);
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.01 * scale, 1.0 * scale, 6), surface(0x3a2a1c));
  pole.position.set(back, 0.25 * scale, 0);
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = colorHex;
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#f2eee4';
  g.beginPath();
  g.arc(32, 40, 17, 0, Math.PI * 2);
  g.fill();
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.2 * scale, 0.4 * scale), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.rotation.y = Math.PI / 2;
  flag.position.set(back - 0.005, 0.52 * scale, 0.105 * scale);
  group.add(pole, flag);
  return group;
}

export function buildBackPrint(body, text, colorHex = '#e9e2c8') {
  const scale = body.heightM / 1.8;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const g = canvas.getContext('2d');
  g.fillStyle = colorHex;
  g.font = 'bold 78px Arial Black, Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const texture = new THREE.CanvasTexture(canvas);
  const print = new THREE.Mesh(new THREE.PlaneGeometry(0.26 * scale, 0.1 * scale), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  // Facing backwards, across the shoulder blades, just off the armour.
  const back = body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.012;
  print.rotation.y = -Math.PI / 2;
  print.position.set(-back, -0.13 * scale, 0);
  print.renderOrder = 2;
  const group = new THREE.Group();
  group.add(print);
  return group;
}

/** Which kind of hand an outfit gives. */
export function handKind(inputs, gloved) {
  if (gloved) return 'gloved';
  const fists = outfitOf(inputs).spec.fists;
  if (fists === 'gloved-tactical') return 'tactical';
  if (fists === 'gauntlet') return 'gauntlet';
  return 'bare';
}

