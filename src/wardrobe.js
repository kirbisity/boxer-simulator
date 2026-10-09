// The look of an outfit, for the renderer: the colour of each garment role
// on the body, tattoos, steel, and the pieces that are not part of the body
// mesh — fists, footwear, headgear and the things that swing.

import { Dangle } from './dangle.js';
import { heelLift, outfitOf, resolveColor } from './outfits.js';
import { outlineFor, surface } from './toon.js';
import { buildArenaHelm, buildGalea, buildLionHead } from './arenaview.js';

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
    // A patent platform shoe: a round toe, straps over the instep and ankle.
    platformShoe: { width: 0.05, height: 0.046, sole: 0x0b0b0d, patent: true },
    dressShoe: { width: 0.045, height: 0.038, sole: 0x2a1d14 },
    // A Song and Jin rider's leather boot: soft, its toe turned up.
    jinBoot: { width: 0.056, height: 0.05, sole: 0x2a1d14 },
    // Split-toed socks on straw sandals; a gladiator's leather sandal.
    tabi: { width: 0.046, height: 0.045, sole: 0xc8b27a },
    sandal: { width: 0.036, height: 0.044, sole: 0x5a3a22, skin: true },
    sabaton: { width: 0.058, height: 0.05 },
    bare: { width: 0.042, height: 0.032 },
  }[kind] ?? { width: 0.05, height: 0.045, sole: 0x17171c };
  const upperMaterial = kind === 'sabaton' ? steel : kind === 'bare' || spec.skin ? surface(skinColor) : surface(upperColor, { roughness: spec.patent ? 0.12 : 0.5 });
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
  if (kind === 'jinBoot') {
    // The toe drawn out and turned up (+x is up from the sole).
    const toe = new THREE.Mesh(new THREE.ConeGeometry(spec.height * 0.9, length * 0.34, 10), upperMaterial);
    toe.geometry.translate(0, length * 0.17, 0);
    toe.scale.set(spec.width / spec.height, 1, 1);
    toe.position.set(-0.012, length * 0.62, 0);
    toe.rotation.z = -0.55;
    shoe.add(toe);
  }
  if (kind === 'trainer' && colors.accent) {
    const swoosh = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.6, length * 0.5, spec.height * 2.02), surface(colors.accent));
    swoosh.position.set(-0.006, length * 0.3, 0);
    shoe.add(swoosh);
  }
  if (heels) {
    // A long pointed toe; then the whole boot pitched down about the ankle
    // (the body stands higher by the heel's lift), its toe on the floor and
    // its heel on a slim stiletto.
    if (heels.round) {
      // A round toe, blunt and broad.
      const toe = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), upperMaterial);
      toe.scale.set(spec.width * 0.95, length * heels.point * 0.9, spec.height * 1.05);
      toe.position.set(-0.016, length * 0.66, 0);
      shoe.add(toe);
    } else {
      const toe = new THREE.Mesh(new THREE.ConeGeometry(spec.height * 0.95, length * heels.point, 12), upperMaterial);
      toe.scale.set(spec.width / spec.height * (0.7 - (heels.point - 0.42) * 0.6), 1, 1);
      toe.position.set(-0.02, length * (0.65 + heels.point / 2), 0);
      shoe.add(toe);
    }
    // Mary Jane straps over the instep and round the ankle, each with a buckle.
    for (let strap = 0; strap < (heels.straps ?? 0); strap += 1) {
      const along = 0.34 - strap * 0.17;
      const band = new THREE.Mesh(new THREE.TorusGeometry(spec.height * (1.08 + strap * 0.06), 0.006, 5, 16, Math.PI), upperMaterial);
      band.rotation.y = Math.PI / 2;
      band.rotation.z = Math.PI / 2;
      band.position.set(-0.008 + strap * 0.012, length * along, 0);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.004), steel);
      buckle.position.set(-0.008 + strap * 0.012, length * along, spec.height * (1.08 + strap * 0.06));
      shoe.add(band, buckle);
    }
    const pitch = -heels.pitch;
    const floor = -(spec.width * 0.95 + 0.009);
    const ground = floor - heelLift(heels, body.heightM);
    for (const piece of [...shoe.children]) {
      const { x, y } = piece.position;
      piece.position.set(x * Math.cos(pitch) + y * Math.sin(pitch), -x * Math.sin(pitch) + y * Math.cos(pitch), piece.position.z);
      piece.rotation.z -= pitch;
    }
    // The stiletto: from under the heel of the sole, lifted, down to the floor
    // (its top sunk a little into the sole so the two read as one).
    const heelAt = length * 0.02;
    const heelTop = floor * Math.cos(pitch) + heelAt * Math.sin(pitch) + 0.012;
    const heelLength = heelTop - ground;
    // A stiletto, or a chunky block heel.
    const heel = heels.block
      ? new THREE.Mesh(new THREE.BoxGeometry(heelLength, 0.042, spec.height * 1.7), upperMaterial)
      : new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.004, heelLength, 8), surface(0x0b0b0d));
    if (!heels.block) heel.rotation.z = Math.PI / 2;
    heel.position.set(ground + heelLength / 2, heelAt * Math.cos(pitch) - floor * Math.sin(pitch), 0);
    shoe.add(heel);
    if (heels.platform) {
      // The platform: a thick sole under the forefoot, from the floor up to the pitched toe.
      const platformAt = length * 0.62;
      const toeFloor = floor * Math.cos(pitch) + platformAt * Math.sin(pitch);
      const thickness = toeFloor - ground + 0.006;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(thickness, length * 0.62, spec.height * 2.05), upperMaterial);
      slab.position.set(ground + thickness / 2, platformAt * Math.cos(pitch) - floor * Math.sin(pitch), 0);
      shoe.add(slab);
    }
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
    case 'arenaHelm':
      // A gladiator's helmet of his kind, in detail (arenaview.js).
      buildArenaHelm(group, head, r, metal(steel, color));
      break;
    case 'galea':
      // The legion's Imperial Gallic helmet (arenaview.js).
      buildGalea(group, head, r, metal(steel, color));
      break;
    case 'lionHead':
      // Commodus's lion scalp (arenaview.js); his beard shows below its jaw.
      buildLionHead(group, head, r);
      hidesHair = false;
      break;
    case 'guanYuCap': {
      // Guan Yu's green cap: soft cloth over the crown and the topknot, a
      // gold ornament at the front, two ties hanging down behind.
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), cloth);
      crown.scale.set(1.04, 0.92, 1.02);
      crown.position.y = 0.1 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.48 * r, 14, 10), cloth);
      knot.position.set(-0.55 * r, 0.86 * r, 0);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.17 * r, 1.19 * r, 0.2 * r, 24, 1, true), surface(new THREE.Color(color).multiplyScalar(0.7).getHex()));
      band.position.y = 0.14 * r;
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.14 * r, 10, 8), surface(new THREE.Color(head.gold ?? '#d6a743').getHex(), { roughness: 0.35 }));
      jewel.scale.set(0.5, 1, 1.3);
      jewel.position.set(1.12 * r, 0.42 * r, 0);
      group.add(crown, knot, band);
      // A plain soldier's cap has no ornament.
      if (!head.plain) group.add(jewel);
      for (const side of [1, -1]) {
        const tie = new THREE.Mesh(new THREE.BoxGeometry(0.03 * r, 1.4 * r, 0.26 * r), cloth);
        tie.position.set(-1.12 * r, -0.4 * r, side * 0.22 * r);
        tie.rotation.set(side * 0.12, 0, -0.18);
        group.add(tie);
      }
      for (const piece of [crown, knot, jewel]) piece.add(outlineFor(piece, 0.003));
      hidesHair = false;
      break;
    }
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
    case 'topHat': {
      // A tall silk hat: the crown flaring a little to its top, a narrow curled brim, a band.
      const silk = surface(color, { roughness: 0.35 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 0.92 * r, 1.6 * r, 22), silk);
      crown.position.y = 1.0 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * r, 1.5 * r, 0.06 * r, 26), silk);
      brim.position.y = 0.22 * r;
      brim.scale.set(1.08, 1, 0.95);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.94 * r, 0.94 * r, 0.22 * r, 22, 1, true), surface(0x2a2a30));
      band.position.y = 0.38 * r;
      group.add(crown, brim, band);
      break;
    }
    case 'morion': {
      // The Spanish morion: a round crown with a tall comb front to back and a brim
      // that sweeps up to points before and behind.
      const iron = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      crown.scale.y = 1.15;
      crown.position.y = 0.1 * r;
      const comb = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * r, 1.25 * r, 0.06 * r, 24, 1, false, Math.PI * 0.5, Math.PI), iron);
      comb.rotation.x = Math.PI / 2;
      comb.scale.set(1, 1, 0.75);
      comb.position.y = 0.35 * r;
      const brim = new THREE.Mesh(new THREE.TorusGeometry(1.35 * r, 0.12 * r, 6, 28), iron);
      brim.rotation.x = Math.PI / 2;
      brim.scale.set(1.45, 0.75, 1);
      brim.position.y = 0.08 * r;
      // The brim's points rise fore and aft.
      for (const end of [1, -1]) {
        const point = new THREE.Mesh(new THREE.ConeGeometry(0.16 * r, 0.6 * r, 8), iron);
        point.position.set(end * 1.95 * r, 0.3 * r, 0);
        point.rotation.z = end * -1.1;
        group.add(point);
      }
      group.add(crown, comb, brim);
      break;
    }
    case 'cabasset': {
      // The cabasset: a tall pear-shaped crown with a little stalk, a narrow flat brim.
      const iron = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.15 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), iron);
      crown.scale.y = 1.45;
      crown.position.y = 0.08 * r;
      const stalk = new THREE.Mesh(new THREE.ConeGeometry(0.12 * r, 0.4 * r, 8), iron);
      stalk.position.y = 1.85 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.15 * r, 1.45 * r, 0.08 * r, 24, 1, true), iron.clone());
      brim.material.side = THREE.DoubleSide;
      brim.position.y = 0.06 * r;
      group.add(crown, stalk, brim);
      break;
    }
    case 'potHelmet': {
      // A 17th-century pikeman's pot: a rounded crown, a broad down-turned brim, a ridge.
      const iron = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      crown.scale.y = 1.05;
      crown.position.y = 0.1 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.17 * r, 1.7 * r, 0.3 * r, 26, 1, true), iron.clone());
      brim.material.side = THREE.DoubleSide;
      brim.position.y = -0.02 * r;
      group.add(crown, brim);
      break;
    }
    case 'feltHat': {
      // A broad black felt hat, its brim pinned up at one side under a plume.
      const felt = cloth;
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.95 * r, 1.1 * r, 0.9 * r, 18), felt);
      crown.position.y = 0.55 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(2.0 * r, 2.0 * r, 0.06 * r, 26), felt);
      brim.position.y = 0.12 * r;
      brim.rotation.x = 0.12;
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.18 * r, 1.4 * r, 6), surface(head.plume ?? 0xd06a1a));
      plume.position.set(-0.3 * r, 0.9 * r, 0.9 * r);
      plume.rotation.x = -0.9;
      group.add(crown, brim, plume);
      break;
    }
    case 'tiltHat': {
      // An 1880s hat: a small flat crown tipped forward over the brow, a feather curling back.
      const felt = cloth;
      const hat = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.8 * r, 0.45 * r, 18), felt);
      crown.position.y = 0.3 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * r, 1.25 * r, 0.05 * r, 22), felt);
      brim.position.y = 0.08 * r;
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.16 * r, 1.5 * r, 6), surface(head.plume ?? 0xe8e0cc));
      feather.position.set(-0.5 * r, 0.6 * r, 0.45 * r);
      feather.rotation.set(0.3, 0, 1.15);
      hat.add(crown, brim, feather);
      hat.position.set(0.25 * r, 0.75 * r, 0);
      hat.rotation.z = -0.28;
      group.add(hat);
      hidesHair = false;
      break;
    }
    case 'flower': {
      // A small flower worn in the hair on one side: dark red petals round a
      // black heart on a scrap of black lace. It sits just off the skull,
      // above the ear, on any hair (or none) and clear of hair falling below.
      const petals = surface(color, { roughness: 0.55 });
      petals.side = THREE.DoubleSide;
      const flower = new THREE.Group();
      const lace = new THREE.Mesh(new THREE.CircleGeometry(0.2 * r, 8), surface(head.lace ?? 0x0d0c0f, { roughness: 0.9 }));
      lace.material.side = THREE.DoubleSide;
      lace.position.z = -0.03 * r;
      flower.add(lace);
      for (const [ring, count, size, lift] of [[0.1, 6, 0.1, 0], [0.05, 5, 0.075, 0.025]]) {
        for (let petal = 0; petal < count; petal += 1) {
          const angle = (petal / count) * Math.PI * 2 + ring * 10;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(size * r, 8, 6), petals);
          leaf.scale.set(1, 0.75, 0.45);
          leaf.position.set(Math.cos(angle) * ring * r, Math.sin(angle) * ring * r, lift * r);
          flower.add(leaf);
        }
      }
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.04 * r, 8, 6), surface(0x0b0a0c, { roughness: 0.3 }));
      heart.position.z = 0.05 * r;
      flower.add(heart);
      // Above the ear, a little forward, facing out from the head (its +z out).
      const side = head.side ?? 1;
      const polar = 0.95;
      const azimuth = side * 1.35;
      const out = [Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)];
      flower.position.set(out[0] * 1.2 * r, out[1] * 1.2 * r, out[2] * 1.2 * r);
      flower.lookAt(out[0] * 3 * r, out[1] * 3 * r, out[2] * 3 * r);
      group.add(flower);
      hidesHair = false;
      break;
    }
    case 'fascinator': {
      // A small black lace fascinator perched on one side of the head: a
      // rosette of lace petals round a jet bead, spiky lace leaves fanning
      // up and back from it.
      const lace = surface(color, { roughness: 0.8 });
      lace.side = THREE.DoubleSide;
      const piece = new THREE.Group();
      for (let petal = 0; petal < 7; petal += 1) {
        const angle = (petal / 7) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.16 * r, 6), lace);
        leaf.position.set(Math.cos(angle) * 0.14 * r, Math.sin(angle) * 0.14 * r, 0);
        leaf.rotation.set(0.25 * Math.sin(angle), 0.25 * Math.cos(angle), angle);
        piece.add(leaf);
      }
      for (let spray = 0; spray < 6; spray += 1) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * r, 0.6 * r, 4), lace);
        const angle = -0.4 + spray * 0.28;
        spike.position.set(Math.cos(angle) * 0.3 * r, Math.sin(angle) * 0.3 * r + 0.15 * r, -0.02 * r);
        spike.rotation.z = angle - Math.PI / 2;
        piece.add(spike);
      }
      const bead = new THREE.Mesh(new THREE.SphereGeometry(0.08 * r, 10, 8), surface(head.bead ?? 0x2a2a30, { roughness: 0.1 }));
      bead.position.z = 0.04 * r;
      piece.add(bead);
      // On the left side of the crown, facing out and tipped up.
      piece.position.set(0.05 * r, 0.8 * r, (head.side ?? 1) * 0.75 * r);
      piece.rotation.set((head.side ?? 1) * -0.6, 0, 0.2);
      group.add(piece);
      hidesHair = false;
      break;
    }
    case 'miniTopHat': {
      // A doll-sized top hat pinned at a tilt on the side of the head: a lace
      // band and bow, a short veil of netting over the brim.
      const felt = surface(color, { roughness: 0.4 });
      const hat = new THREE.Group();
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * r, 0.3 * r, 0.62 * r, 16), felt);
      crown.position.y = 0.34 * r;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * r, 0.35 * r, 0.03 * r, 16), felt);
      top.position.y = 0.66 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.56 * r, 0.56 * r, 0.04 * r, 18), felt);
      brim.position.y = 0.03 * r;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.315 * r, 0.315 * r, 0.12 * r, 16, 1, true), surface(head.lace ?? 0x3a3a42));
      band.position.y = 0.12 * r;
      const bow = new THREE.Mesh(new THREE.SphereGeometry(0.12 * r, 8, 6), surface(head.lace ?? 0x3a3a42));
      bow.scale.set(0.5, 0.8, 1.6);
      bow.position.set(0, 0.14 * r, 0.33 * r);
      const net = surface(color, { roughness: 1 });
      net.side = THREE.DoubleSide;
      net.transparent = true;
      net.opacity = 0.55;
      const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.56 * r, 0.62 * r, 0.32 * r, 16, 1, true, -Math.PI * 0.35, Math.PI * 0.7), net);
      veil.position.y = -0.14 * r;
      hat.add(crown, top, brim, band, bow, veil);
      hat.position.set(0.1 * r, 0.92 * r, (head.side ?? 1) * 0.42 * r);
      hat.rotation.x = (head.side ?? 1) * -0.45;
      group.add(hat);
      hidesHair = false;
      break;
    }
    case 'widowCap': {
      // Queen Victoria's widow's cap: white lawn over the crown, dipping to a
      // point on the brow, and a long black veil hanging behind.
      const lawn = surface(head.cap ?? 0xf2efe8);
      lawn.side = THREE.DoubleSide;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.1 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), lawn);
      cap.position.set(-0.12 * r, 0.12 * r, 0);
      cap.scale.set(1, 0.75, 1.05);
      const point = new THREE.Mesh(new THREE.ConeGeometry(0.22 * r, 0.6 * r, 4), lawn);
      point.position.set(0.82 * r, 0.42 * r, 0);
      point.rotation.z = -Math.PI * 0.62;
      const veilCloth = surface(color);
      veilCloth.side = THREE.DoubleSide;
      const veil = new THREE.Mesh(new THREE.CylinderGeometry(1.05 * r, 1.5 * r, 2.6 * r, 16, 1, true, Math.PI * 0.75, Math.PI * 1.5), veilCloth);
      veil.position.set(-0.35 * r, -0.75 * r, 0);
      group.add(cap, point, veil);
      hidesHair = false;
      break;
    }
    case 'policeCap': {
      // A police peaked cap: a stiff crown flaring to its flat top, a black
      // visor, a cap badge.
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.25 * r, 1.06 * r, 0.62 * r, 22), cloth);
      crown.position.y = 0.62 * r;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1.07 * r, 1.07 * r, 0.22 * r, 22, 1, true), surface(0x0b0b0d, { roughness: 0.6 }));
      band.material.side = THREE.DoubleSide;
      band.position.y = 0.38 * r;
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * r, 1.2 * r, 0.05 * r, 20, 1, false, Math.PI * 0.22, Math.PI * 0.56), surface(0x0b0b0d, { roughness: 0.25 }));
      visor.position.set(0.3 * r, 0.28 * r, 0);
      visor.rotation.z = -0.18;
      const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.3 * r, 0.24 * r), metal(steel, head.gold ?? 0xd6a743));
      badge.position.set(1.12 * r, 0.7 * r, 0);
      group.add(crown, band, visor, badge);
      break;
    }
    case 'opsHelmet': {
      // A high-cut ballistic helmet: the shell cut high over the ears, rails
      // on the sides, the night-vision mount on the front, electronic ear
      // defenders under it.
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.24 * r, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.46), surface(color, { roughness: 0.75 }));
      shell.scale.y = 1.05;
      shell.position.y = 0.1 * r;
      const dark = surface(0x1a1b1e, { roughness: 0.6 });
      const mount = new THREE.Mesh(new THREE.BoxGeometry(0.16 * r, 0.32 * r, 0.42 * r), dark);
      mount.position.set(1.2 * r, 0.62 * r, 0);
      group.add(shell, mount);
      for (const side of [1, -1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.9 * r, 0.12 * r, 0.08 * r), dark);
        rail.position.set(0, 0.3 * r, side * 1.2 * r);
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.42 * r, 0.42 * r, 0.3 * r, 14), dark);
        ear.rotation.x = Math.PI / 2;
        ear.position.set(0, -0.15 * r, side * 1.05 * r);
        group.add(rail, ear);
      }
      break;
    }
    case 'pagodaHelm':
      buildPagodaHelm(group, head, r, steel, color);
      break;
    case 'steppeHelm': {
      // A steppe helmet: a tall pointed iron bowl, a brow band, a spike with
      // a plume, a lamellar aventail round the sides and back (open at the
      // face); the kheshig's with a gilt band and an iron face mask.
      const iron = metal(steel, color);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      bowl.scale.y = 1.45;
      bowl.position.y = 0.06 * r;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.17 * r, 0.08 * r, 6, 24), metal(steel, head.gold ?? color));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.1 * r;
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * r, 0.08 * r, 0.6 * r, 8), iron);
      spike.position.y = 1.95 * r;
      group.add(bowl, band, spike);
      if (head.plume) {
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09 * r, 0.9 * r, 6), surface(head.plume, { roughness: 0.9 }));
        plume.position.y = 2.6 * r;
        group.add(plume);
      }
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * r, 1.7 * r, 1.25 * r, 22, 3, true, Math.PI * 0.8, Math.PI * 1.4), metal(steel, head.coif ?? color));
      aventail.material.side = THREE.DoubleSide;
      aventail.position.y = -0.52 * r;
      group.add(aventail);
      if (head.mask) {
        const mask = new THREE.Mesh(new THREE.SphereGeometry(1.12 * r, 18, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.42, Math.PI * 0.44), iron.clone());
        mask.material.side = THREE.DoubleSide;
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.12 * r, 1.0 * r), surface(0x0b0b0d));
        slit.position.set(1.08 * r, 0.14 * r, 0);
        group.add(mask, slit);
      }
      break;
    }
    case 'furHat': {
      // The steppe hat: a cloth crown, peaked, with a thick upturned fur brim.
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.1 * r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), cloth);
      crown.scale.y = 1.35;
      crown.position.y = 0.12 * r;
      const fur = new THREE.Mesh(new THREE.TorusGeometry(1.12 * r, 0.26 * r, 8, 22), surface(head.fur ?? 0x5a3a22, { roughness: 1 }));
      fur.rotation.x = Math.PI / 2;
      fur.position.y = 0.2 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.14 * r, 8, 6), surface(0xb3161b, { roughness: 0.9 }));
      knot.position.y = 1.6 * r;
      group.add(crown, fur, knot);
      break;
    }
    case 'bork': {
      // The Janissary's börk: a tall white felt hat, its long flap falling
      // down the back, a brass sheath (for the plume spoon) on the brow.
      const felt = surface(color, { roughness: 0.9 });
      const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.92 * r, 1.12 * r, 1.9 * r, 20), felt);
      hat.position.y = 0.85 * r;
      const flapFelt = felt.clone();
      flapFelt.side = THREE.DoubleSide;
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.1 * r, 2.6 * r), flapFelt);
      flap.position.set(-1.0 * r, 0.3 * r, 0);
      flap.rotation.set(0, Math.PI / 2, -0.12);
      const sheath = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * r, 0.16 * r, 1.0 * r, 10), metal(steel, head.gold ?? 0xd6a743));
      sheath.position.set(1.05 * r, 0.7 * r, 0);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.12 * r, 0.08 * r, 6, 22), metal(steel, head.gold ?? 0xd6a743));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.0;
      group.add(hat, flap, sheath, band);
      break;
    }
    case 'turban': {
      // A turban: cloth wound in coils over a coloured cap.
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.08 * r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), surface(head.cap ?? color, { roughness: 0.9 }));
      cap.scale.y = 1.3;
      cap.position.y = 0.2 * r;
      group.add(cap);
      for (let coil = 0; coil < 3; coil += 1) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry((1.14 - coil * 0.1) * r, 0.22 * r, 8, 22), cloth);
        wrap.rotation.x = Math.PI / 2;
        wrap.rotation.z = coil * 0.4;
        wrap.position.y = (0.15 + coil * 0.3) * r;
        group.add(wrap);
      }
      break;
    }
    case 'chichak': {
      // The Ottoman chichak: a pointed bowl with a gilt band and finial, a
      // sliding nasal bar, cheek plates and a mail aventail round the neck;
      // (`turban`) a turban wound round it, as an alp wore it.
      const iron = metal(steel, color);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      bowl.scale.y = 1.3;
      bowl.position.y = 0.08 * r;
      const gilt = metal(steel, head.gold ?? 0xd6a743);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.17 * r, 0.07 * r, 6, 24), gilt);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12 * r;
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.08 * r, 0.6 * r, 8), gilt);
      finial.position.y = 1.85 * r;
      const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 1.0 * r, 0.12 * r), iron);
      nasal.position.set(1.18 * r, -0.12 * r, 0);
      group.add(bowl, band, finial, nasal);
      for (const side of [1, -1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.6 * r, 0.8 * r, 0.06 * r), iron);
        cheek.position.set(0.35 * r, -0.45 * r, side * 1.08 * r);
        group.add(cheek);
      }
      const mailCloth = surface(head.mail ?? 0x8d9097, { roughness: 0.55 });
      mailCloth.side = THREE.DoubleSide;
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(1.15 * r, 1.6 * r, 1.1 * r, 22, 2, true, Math.PI * 0.75, Math.PI * 1.5), mailCloth);
      aventail.position.y = -0.45 * r;
      group.add(aventail);
      if (head.turban) {
        const wrap = new THREE.Mesh(new THREE.TorusGeometry(1.24 * r, 0.2 * r, 8, 22), surface(head.turban, { roughness: 0.9 }));
        wrap.rotation.x = Math.PI / 2;
        wrap.position.y = 0.3 * r;
        group.add(wrap);
      }
      break;
    }
    case 'featherBand': {
      // A coloured band round the head with a few tall feathers at the back.
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.06 * r, 0.12 * r, 6, 22), cloth);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.3 * r;
      group.add(band);
      for (let feather = 0; feather < 3; feather += 1) {
        const quill = new THREE.Mesh(new THREE.ConeGeometry(0.12 * r, 1.4 * r, 5), cloth);
        quill.position.set(-1.0 * r, 1.0 * r, (feather - 1) * 0.25 * r);
        quill.rotation.z = 0.45;
        group.add(quill);
      }
      hidesHair = false;
      break;
    }
    case 'jaguarHelm': {
      // A carved wooden jaguar head worn as a helmet: the face looks out of its open jaws.
      const hide = cloth;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1.25 * r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hide);
      skull.position.y = 0.15 * r;
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.55 * r, 12, 8), hide);
      muzzle.scale.set(1.1, 0.6, 1);
      muzzle.position.set(1.05 * r, 0.75 * r, 0);
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(1.15 * r, 0.1 * r, 6, 20, Math.PI), surface(0xece4d0));
      jaw.rotation.set(0, Math.PI / 2, Math.PI / 2);
      jaw.position.set(0.95 * r, 0.35 * r, 0);
      group.add(skull, muzzle, jaw);
      for (const side of [1, -1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.22 * r, 0.4 * r, 6), hide);
        ear.position.set(0.1 * r, 1.45 * r, side * 0.7 * r);
        group.add(ear);
        const spot = new THREE.Mesh(new THREE.SphereGeometry(0.16 * r, 8, 6), surface(0x2a1d14));
        spot.position.set(0.2 * r, 1.05 * r, side * 0.95 * r);
        group.add(spot);
      }
      break;
    }
    case 'eagleHelm': {
      // A carved eagle's head: the beak over the brow, the face in its open mouth, a feather crest.
      const feathers = cloth;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(1.25 * r, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), feathers);
      skull.position.y = 0.15 * r;
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.35 * r, 1.1 * r, 8), surface(0xd6a743));
      beak.rotation.z = -Math.PI / 2 - 0.35;
      beak.position.set(1.45 * r, 0.75 * r, 0);
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.25 * r, 1.2 * r, 6), surface(0x6a4428));
      crest.position.set(-0.6 * r, 1.4 * r, 0);
      crest.rotation.z = 0.7;
      group.add(skull, beak, crest);
      break;
    }
    case 'hachimaki': {
      // A cloth band tied round the brow, knotted behind, the ends hanging; the hair shows.
      hidesHair = false;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.06 * r, 0.11 * r, 6, 22), cloth);
      band.rotation.x = Math.PI / 2;
      band.rotation.z = -0.18;
      band.position.y = 0.32 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.17 * r, 8, 6), cloth);
      knot.position.set(-1.06 * r, 0.24 * r, 0);
      group.add(band, knot);
      for (const side of [1, -1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, 0.55 * r, 0.16 * r), cloth);
        tail.position.set(-1.12 * r, -0.04 * r, side * 0.12 * r);
        tail.rotation.x = side * 0.25;
        group.add(tail);
      }
      break;
    }
    case 'clothWrap': {
      // A Ming garrison soldier's cloth wrapped round the head and knotted behind.
      const wrap = cloth;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.12 * r, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.47), wrap);
      cap.position.y = 0.05 * r;
      const roll = new THREE.Mesh(new THREE.TorusGeometry(1.08 * r, 0.17 * r, 8, 22), wrap);
      roll.rotation.x = Math.PI / 2;
      roll.rotation.z = 0.12;
      roll.position.y = 0.18 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.22 * r, 10, 8), wrap);
      knot.position.set(-1.12 * r, 0.22 * r, 0);
      group.add(cap, roll, knot);
      for (const side of [1, -1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.7 * r, 0.22 * r), wrap);
        tail.position.set(-1.18 * r, -0.12 * r, side * 0.14 * r);
        tail.rotation.x = side * 0.2;
        group.add(tail);
      }
      break;
    }
    case 'mingHat': {
      // The Ming soldier's iron helmet: a round crown, a wide brim almost
      // flat, a short spike and a red tassel at its foot.
      const iron = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.17 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      crown.scale.y = 1.1;
      crown.position.y = 0.12 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.18 * r, 1.78 * r, 0.16 * r, 28, 1, true), iron.clone());
      brim.material.side = THREE.DoubleSide;
      brim.position.y = 0.06 * r;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1 * r, 0.6 * r, 8), iron);
      spike.position.y = 1.55 * r;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.3 * r, 0.35 * r, 10), surface(head.tassel ?? 0xb3161b, { roughness: 0.9 }));
      tassel.position.y = 1.32 * r;
      tassel.rotation.x = Math.PI;
      group.add(crown, brim, spike, tassel);
      break;
    }
    case 'mingHelm': {
      // A Ming officer's helmet: a tall steel bowl with a brass brow band, a
      // spike with a red tassel and plume, and a padded coif hanging from
      // the rim over the neck and shoulders, open at the face.
      const bowlSteel = metal(steel, color);
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(1.18 * r, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), bowlSteel);
      bowl.scale.y = 1.3;
      bowl.position.y = 0.08 * r;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.18 * r, 0.07 * r, 6, 24), metal(steel, head.gold ?? 0xd6a743));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12 * r;
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * r, 0.09 * r, 0.9 * r, 8), metal(steel, head.gold ?? 0xd6a743));
      spike.position.y = 1.95 * r;
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.34 * r, 0.42 * r, 10), surface(head.tassel ?? 0xb3161b, { roughness: 0.9 }));
      tassel.position.y = 1.62 * r;
      tassel.rotation.x = Math.PI;
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08 * r, 0.7 * r, 6), surface(head.tassel ?? 0xb3161b, { roughness: 0.9 }));
      plume.position.y = 2.65 * r;
      group.add(bowl, band, spike, tassel, plume);
      if (head.neck === 'steel') {
        // A steel neck guard: three lames stepping out from the rim to the
        // shoulders, open over the face (+x).
        for (let lame = 0; lame < 3; lame += 1) {
          const ring = new THREE.Mesh(new THREE.CylinderGeometry((1.18 + lame * 0.18) * r, (1.36 + lame * 0.18) * r, 0.46 * r, 22, 1, true, Math.PI * 0.8, Math.PI * 1.4), bowlSteel.clone());
          ring.material.side = THREE.DoubleSide;
          ring.position.y = (-0.08 - lame * 0.4) * r;
          group.add(ring);
        }
      } else {
        // The coif: open over the face (+x), from the rim to the shoulders.
        const coif = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * r, 1.75 * r, 1.25 * r, 22, 3, true, Math.PI * 0.8, Math.PI * 1.4), surface(head.coif ?? 0x1f2a4a, { roughness: 0.85 }));
        coif.material.side = THREE.DoubleSide;
        coif.position.y = -0.5 * r;
        group.add(coif);
      }
      if (head.mask) {
        // A steel face mask from the brow to the chin, an eye slit across it.
        const mask = new THREE.Mesh(new THREE.SphereGeometry(1.12 * r, 18, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.44, Math.PI * 0.42), bowlSteel.clone());
        mask.material.side = THREE.DoubleSide;
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.12 * r, 1.1 * r), surface(0x0b0b0d));
        slit.position.set(1.08 * r, 0.12 * r, 0);
        group.add(mask, slit);
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

// The Iron Pagoda's helmet, in head radii (WARDROBE-style dials): the bowl's
// lathe profile bottom-up, the aventail's tiers rolled round the neck and
// chin up to just under the eyes, the plates in each tier.
const PAGODA_HELM = {
  // The bowl sits from the brow (`brow`, above the eyes) up to its point; the spike rises from there.
  brow: 0.38,
  bowl: [[1.2, -0.02], [1.22, 0.14], [1.17, 0.52], [1.04, 0.9], [0.82, 1.3], [0.52, 1.66], [0.22, 1.98], [0.06, 2.16]],
  spikeTop: 3.9,
  // Tiers bottom to top: [height of the plates' middle, radius out from the neck, how far each tier rolls out at its foot].
  aventail: [[-1.92, 1.95, 0.32], [-1.5, 1.78, 0.3], [-1.08, 1.6, 0.28], [-0.66, 1.46, 0.24], [-0.26, 1.38, 0.2]],
  // The top tier rises from under the eyes in front to the bowl's rim at the sides and behind (head radii at the back).
  riseBehind: 0.7,
  plates: 30,
  plate: [0.32, 0.5],
};

/**
 * The Iron Pagoda's helmet (the Jin heavy horse of the 1120s–40s, as
 * reconstructed): a tall steel bowl rising to a point, a spike finial with
 * a plume (dark feathers) or a horsehair tassel falling behind, a riveted
 * brow peak; and the aventail, tiers of small dotted iron plates rolled up
 * round the neck and chin to just under the eyes, so only the eyes show.
 * The aventail's plates are instanced: dozens of them for the cost of two meshes.
 */
function buildPagodaHelm(group, head, r, steel, color) {
  const spec = PAGODA_HELM;
  const iron = metal(steel, color);
  iron.side = THREE.DoubleSide;
  const trim = metal(steel, head.gold ?? color);
  const brow = spec.brow;
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(spec.bowl.map(([x, y]) => new THREE.Vector2(x * r, (y + brow) * r)), 28), iron);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.22 * r, 0.07 * r, 6, 30), trim);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = (brow + 0.02) * r;
  group.add(bowl, rim);
  // The brow peak: a curved plate out over the eyes, riveted to the rim.
  const peak = new THREE.Mesh(new THREE.CylinderGeometry(1.32 * r, 1.42 * r, 0.16 * r, 20, 1, true, Math.PI * 0.32, Math.PI * 0.36), trim);
  peak.material = trim.clone();
  peak.material.side = THREE.DoubleSide;
  peak.position.y = (brow - 0.02) * r;
  group.add(peak);
  for (let rivet = -2; rivet <= 2; rivet += 1) {
    const angle = rivet * 0.22;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.045 * r, 6, 4), trim);
    stud.position.set(Math.cos(angle) * 1.25 * r, (brow + 0.12) * r, Math.sin(angle) * 1.25 * r);
    group.add(stud);
  }
  // The finial: a cup on the point and a slender spike above it.
  const cup = new THREE.Mesh(new THREE.SphereGeometry(0.12 * r, 10, 8), trim);
  const point = 2.12 + brow;
  cup.position.y = point * r;
  const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * r, 0.05 * r, (spec.spikeTop - point) * r, 8), iron);
  spike.position.y = ((spec.spikeTop + point) / 2) * r;
  group.add(cup, spike);
  if (head.plume === 'tassel') {
    // A horsehair tassel: long red hair from the cup, falling back and down behind.
    const hair = surface(head.plumeColor ?? 0xb3161b, { roughness: 0.95 });
    for (let lock = 0; lock < 24; lock += 1) {
      const spread = (lock / 23 - 0.5) * 1.3;
      const length = (2.4 + (lock % 3) * 0.35) * r;
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.12 * r, length, 5), hair);
      // Hanging from its top: the cone points down along −y from the cup.
      strand.geometry.rotateZ(Math.PI);
      strand.geometry.translate(0, -length / 2, 0);
      strand.position.set(-0.04 * r, (point + 0.06) * r, spread * 0.2 * r);
      // Falling back over the bowl and down behind, fanned a little side to side (a −z turn swings the foot back, −x).
      strand.rotation.set(spread * 0.45, 0, -0.95 - (lock % 2) * 0.12);
      group.add(strand);
    }
  } else if (head.plume) {
    // Feathers standing up from the spike, fanned a little.
    const feather = surface(head.plumeColor ?? 0x1a1a1c, { roughness: 0.9 });
    for (let quill = 0; quill < 4; quill += 1) {
      const lean = (quill / 3 - 0.5) * 0.55;
      const length = (1.8 + (quill % 2) * 0.4) * r;
      const vane = new THREE.Mesh(new THREE.ConeGeometry(0.15 * r, length, 4), feather);
      vane.scale.z = 0.3;
      vane.geometry.translate(0, length / 2, 0);
      vane.position.y = (spec.spikeTop - 0.75) * r;
      vane.rotation.set(lean * 0.6, quill * 0.5, lean);
      group.add(vane);
    }
  }
  // The aventail: tiers of plates round the neck and chin, each rolled out at its foot.
  const [width, height] = spec.plate;
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2);
  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height * 0.22);
  shape.quadraticCurveTo(width / 2, height / 2, 0, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, height * 0.22);
  shape.closePath();
  const plateGeometry = new THREE.ShapeGeometry(shape, 3);
  plateGeometry.scale(r, r, r);
  const plateMaterial = metal(steel, head.aventail ?? color);
  plateMaterial.side = THREE.DoubleSide;
  const dotGeometry = new THREE.CircleGeometry(0.045 * r, 6);
  const dotMaterial = surface(head.lace ?? 0x141416);
  dotMaterial.side = THREE.DoubleSide;
  const placements = [];
  const holder = new THREE.Object3D();
  // Behind each tier its leather backing, dark, so the gaps between plates show lacing, not the face.
  const backing = surface(head.lace ?? 0x141416);
  backing.side = THREE.DoubleSide;
  spec.aventail.forEach(([y, radius, roll], tier) => {
    const top = tier === spec.aventail.length - 1;
    // Just inside the plates, rolled out at the foot as they are.
    const flare = Math.sin(roll) * (spec.plate[1] / 2);
    const band = new THREE.Mesh(new THREE.CylinderGeometry((radius - flare - 0.07) * r, (radius + flare - 0.07) * r, spec.plate[1] * r, 28, 1, true), backing);
    band.position.y = y * r;
    band.userData.noOutline = true;
    group.add(band);
    for (let index = 0; index < spec.plates; index += 1) {
      const angle = ((index + (tier % 2) * 0.5) / spec.plates) * Math.PI * 2;
      const ahead = Math.cos(angle);
      // At the back and sides the tiers climb to the rim; the top tier in front stops under the eyes.
      const rise = top ? ((1 - ahead) / 2) ** 0.6 * spec.riseBehind : 0;
      holder.position.set(ahead * radius * r, (y + rise) * r, -Math.sin(angle) * radius * r);
      // Face outward, the foot rolled out from the neck.
      holder.rotation.set(0, angle + Math.PI / 2, 0);
      holder.rotateX(-roll);
      holder.updateMatrix();
      placements.push(holder.matrix.clone());
    }
  });
  const plates = new THREE.InstancedMesh(plateGeometry, plateMaterial, placements.length);
  const dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, placements.length * 2);
  const dotOffset = new THREE.Matrix4();
  placements.forEach((matrix, index) => {
    plates.setMatrixAt(index, matrix);
    // Two punched holes down each plate, their lacing dark in them.
    for (const [slot, rise] of [[0, 0.12], [1, -0.1]]) {
      dotOffset.makeTranslation(0, rise * r, 0.004 * r);
      dots.setMatrixAt(index * 2 + slot, matrix.clone().multiply(dotOffset));
    }
  });
  plates.userData.noOutline = true;
  dots.userData.noOutline = true;
  group.add(plates, dots);
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
  // Shaguma: the whole helmet dressed in long yak hair, a shaggy cap over the
  // bowl and a mane over the neck guard to the shoulders, open at the face.
  if (head.hair) {
    const hair = surface(head.hair, { roughness: 1, flatShading: true });
    const cap = new THREE.Mesh(new THREE.IcosahedronGeometry(1.38 * r, 1), hair);
    cap.scale.set(1, 0.72, 1);
    cap.position.y = 0.32 * r;
    // Over the shikoro: a skirt flaring to the shoulders, open at the face (cylinder angles start at +z).
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.42 * r, 2.15 * r, 1.45 * r, 14, 1, true, Math.PI * 0.78, Math.PI * 1.44), hair);
    skirt.material = hair.clone();
    skirt.material.side = THREE.DoubleSide;
    skirt.position.y = -0.55 * r;
    group.add(cap, skirt);
    // Locks hanging past the skirt's edge, uneven.
    for (let lock = 0; lock < 22; lock += 1) {
      const around = Math.PI * 0.78 + ((lock + 0.5) / 22) * Math.PI * 1.44;
      const length = (0.7 + 0.35 * ((lock * 7) % 5) / 4) * r;
      const strand = new THREE.Mesh(new THREE.ConeGeometry(0.22 * r, length, 4), hair);
      strand.rotation.x = Math.PI;
      // Cylinder angle θ: x = sin θ, z = cos θ.
      strand.position.set(Math.sin(around) * 2.05 * r, -1.25 * r - length / 2, Math.cos(around) * 2.05 * r);
      group.add(strand);
    }
  }
  // An oni somen: the whole face in black iron, heavy brows, glaring eye
  // holes, a snarl with fangs, and two short horns at the brow.
  if (head.mask === 'oni') {
    const iron = metal(steel, 0x101012);
    const face = new THREE.Mesh(new THREE.SphereGeometry(1.08 * r, 18, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.22, Math.PI * 0.62), iron);
    face.material = iron.clone();
    face.material.side = THREE.DoubleSide;
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16 * r, 0.14 * r, 0.95 * r), iron);
    brow.position.set(1.08 * r, 0.3 * r, 0);
    const glare = surface(0x8a1a12, { emissive: 0x3a0806 });
    const eyes = [1, -1].map((side) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09 * r, 8, 6), glare);
      eye.position.set(1.06 * r, 0.16 * r, side * 0.24 * r);
      eye.scale.x = 0.5;
      return eye;
    });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16 * r, 0.3 * r, 6), iron);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(1.14 * r, -0.04 * r, 0);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.12 * r, 0.5 * r), surface(0x2a0a08));
    mouth.position.set(1.06 * r, -0.36 * r, 0);
    const bone = surface(0xe8e2d0);
    const fangs = [0.16, -0.16].map((z) => {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.045 * r, 0.2 * r, 5), bone);
      fang.position.set(1.08 * r, -0.26 * r, z * r);
      return fang;
    });
    const horns = [1, -1].map((side) => {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.08 * r, 0.42 * r, 6), bone);
      horn.position.set(0.95 * r, 0.62 * r, side * 0.4 * r);
      horn.rotation.set(side * -0.35, 0, -0.35);
      return horn;
    });
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), iron);
    throat.material = iron.clone();
    throat.material.side = THREE.DoubleSide;
    throat.position.y = -1.0 * r;
    group.add(face, brow, ...eyes, nose, mouth, ...fangs, ...horns, throat);
  } else if (head.mask) {
  // Menpo: the lower face guard, with a nose and a bristling moustache.
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
    } else if (extra.kind === 'choker') {
      // A lace choker round the neck, jet beads hanging from it in front on short strings that swing.
      const lace = surface(color, { roughness: 0.7 });
      const neck = body.lengths.headRadius * 0.5;
      const band = new THREE.Mesh(new THREE.TorusGeometry(neck * 1.12, 0.009 * scale, 6, 24), lace);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.075 * scale;
      collar.add(band);
      const jet = surface(extra.beads ?? 0x2a2a30, { roughness: 0.1 });
      for (let drop = 0; drop < 5; drop += 1) {
        const across = (drop - 2) * 0.35;
        const length = (0.03 + 0.025 * (2 - Math.abs(drop - 2))) * scale;
        const string = new Dangle(collar, [Math.cos(across) * neck * 1.15, 0.07 * scale, Math.sin(across) * neck * 1.15], [0.15, -1, 0], length, { sag: 0.6, damping: 0.25 });
        const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007 * scale, 8, 6), jet);
        bead.position.y = -length;
        const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0012 * scale, 0.0012 * scale, length, 4), jet);
        thread.position.y = -length / 2;
        string.group.add(bead, thread);
        dangles.push(string);
      }
    } else if (extra.kind === 'ribbons') {
      // Thin ribbon ties falling from the waist round the hips, swinging as she moves.
      const ribbon = surface(color, { roughness: 0.6 });
      ribbon.side = THREE.DoubleSide;
      const around = body.lengths.hipSpan / 2 + 0.1 * scale;
      for (let index = 0; index < (extra.count ?? 8); index += 1) {
        // Down both sides, front to back, none down the middle front or back.
        const side = index % 2 ? 1 : -1;
        const angle = side * (0.55 + (Math.floor(index / 2) / Math.max(1, (extra.count ?? 8) / 2 - 1)) * 1.9);
        const length = (extra.length ?? 0.5) * scale * (0.8 + 0.4 * ((index * 7) % 5) / 4);
        const tie = new Dangle(hips, [Math.cos(angle) * around, 0.02 * scale, Math.sin(angle) * around], [Math.cos(angle) * 0.15, -1, Math.sin(angle) * 0.15], length, { sag: 0.85, damping: 0.12 });
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.004 * scale, length, 0.012 * scale), ribbon);
        strip.position.y = -length / 2;
        strip.rotation.y = angle;
        tie.group.add(strip);
        dangles.push(tie);
      }
    } else if (extra.kind === 'train') {
      // A train behind: draped cloth from the waist, open in front, to the
      // floor at the back (with a short skirt in front, a high-low hem).
      const length = (extra.length ?? 0.95) * scale;
      const drape = new Dangle(hips, [-0.04 * scale, 0.04 * scale, 0], [-0.25, -1, 0], length, { sag: 0.35, damping: 0.3 });
      const cloth = surface(color, { roughness: 0.7 });
      cloth.side = THREE.DoubleSide;
      // CylinderGeometry's angle 0 is +z (her left); behind her is 3π/2.
      const arc = Math.PI * 1.15;
      const skirt = new THREE.Mesh(new THREE.CylinderGeometry(body.lengths.hipSpan * 0.95, body.lengths.hipSpan * 1.9, length, 20, 4, true, Math.PI * 1.5 - arc / 2, arc), cloth);
      skirt.position.y = -length / 2;
      drape.group.add(skirt);
      dangles.push(drape);
    } else if (extra.kind === 'tabard') {
      for (const facing of [1, -1]) {
        const length = 0.75 * scale;
        const panel = new Dangle(collar, [facing * 0.17 * scale, -0.05 * scale, 0], [facing * 0.12, -1, 0], length, { sag: 0.4, damping: 0.25 });
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(0.012 * scale, length, 0.36 * scale), surface(color));
        cloth.position.y = -length / 2;
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
 * The Mexica feather device at the top of its staff (at height `top`): a
 * disc of feather-work in `colour` with a gold rim, facing back and front
 * (x), and a spray of green quetzal plumes above it.
 */
export function featherDevice(colour, top, size = 1) {
  const group = new THREE.Group();
  const feathers = surface(new THREE.Color(colour).getHex(), { roughness: 1 });
  const gold = surface(0xd8a23a, { roughness: 0.5 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * size, 0.2 * size, 0.03 * size, 18), feathers);
  disc.rotation.z = Math.PI / 2;
  disc.position.y = top - 0.12 * size;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2 * size, 0.018 * size, 6, 24), gold);
  rim.rotation.y = Math.PI / 2;
  rim.position.y = disc.position.y;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.05 * size, 8, 6), gold);
  boss.position.set(0, disc.position.y, 0);
  group.add(disc, rim, boss);
  const quetzal = surface(0x1f8a4a, { roughness: 0.9 });
  for (let plume = 0; plume < 5; plume += 1) {
    const spread = (plume - 2) * 0.28;
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.03 * size, 0.5 * size, 5), quetzal);
    feather.position.set(0, top + 0.15 * size, Math.sin(spread) * 0.12 * size);
    feather.rotation.x = spread;
    group.add(feather);
  }
  return group;
}

/**
 * A sashimono: the side's banner on a pole up the back, standing clear of
 * the helmet, a white disc on the field (collar coordinates: x forward, y up).
 */
export function buildBanner(body, colorHex, great = false, look = null) {
  const scale = body.heightM / 1.8;
  const back = -(body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.05);
  const group = new THREE.Group();
  if (look === 'mexica') {
    // A Mexica captain's pamitl on its frame up the back: feather-work and plumes above the head.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.01 * scale, 1.5 * scale, 6), surface(0x3a2a1c));
    pole.position.set(back, 0.5 * scale, 0);
    const device = featherDevice(colorHex, 1.2 * scale, scale);
    device.position.x = back;
    group.add(pole, device);
    return group;
  }
  // A commander's great banner: twice as tall, and a field three times the size.
  const size = great ? { pole: 1.9, width: 0.34, height: 0.95 } : { pole: 1.0, width: 0.2, height: 0.4 };
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.01 * scale, size.pole * scale, 6), surface(0x3a2a1c));
  pole.position.set(back, (size.pole / 2 - 0.25) * scale, 0);
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
  if (great) {
    // A gold rim round the crest.
    g.strokeStyle = '#d8a23a';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(32, 40, 19, 0, Math.PI * 2);
    g.stroke();
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(size.width * scale, size.height * scale), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), side: THREE.DoubleSide, roughness: 0.9 }));
  flag.rotation.y = Math.PI / 2;
  flag.position.set(back - 0.005, (size.pole - 0.25 - size.height / 2 - 0.03) * scale, (size.width / 2 + 0.005) * scale);
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

