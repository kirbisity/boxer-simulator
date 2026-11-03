// The look of an outfit, for the renderer: the colour of each garment role
// on the body, tattoos, steel, and the pieces that are not part of the body
// mesh — fists, footwear, headgear and the things that swing.

import { Dangle } from './dangle.js';
import { FACTIONS, factionOf, HEADGEAR, heelLift, OUTFITS, outfitOf, RAGS, ragStrips, ragTear, resolveColor } from './outfits.js';
import { doubleSided, outlineFor, surface } from './toon.js';
import { activeLook } from './looks.js';
import { outlineScale } from './looks/kit.js';
import { buildArenaHelm, buildGalea, buildLionHead, formMesh } from './arenaview.js';
import { buildStechhelm } from './stechzeug.js';
import { CLOTH_GARMENTS, clothMaterialOf, DETAIL_MAPS, HELMET_PART_TILES, HELMET_TILES, MOULDED_TILES } from './detailmaps.js';
import { clothPropMaterial, wearTile } from './detailtex.js';
import { HELM_STYLE } from './helmstyle.js';
import { helmMapSheet, helmMapsReady, helmMaterial } from './helmmaps.js';
import { buildWarMask } from './menpo.js';
import { buildHanHood, buildMingDesignHelm, buildTassel } from './chinahelmview.js';
import { HONGYING_MOUNTS, TASSELS } from './chinahelms.js';
import { designFormOf, formGrid, formPoint, headRadiusAt, HELM_SPAN, KABUTO_FORM, maskOnFace, MASK_FITS } from './helmforms.js';
import { knightFormOf, knightGrid } from './knighthelms.js';

export const WARDROBE = {
  // How far (m, for a 1.8 m man) a sabaton's point runs on past the foot.
  sabatonPoint: 0.06,
  // Steel: how metal and how polished; the reflection map is a gradient
  // sky (cheap — one texture, built once — and enough to read as steel).
  steel: { metalness: 0.9, roughness: 0.26 },
  // Irezumi: the ink colours of a body suit, and the bare strip down the
  // chest (munewari) that marks it as one.
  ink: { outline: 0x1b1f2e, indigo: 0x26407a, red: 0xb8312f, chestGap: 0.045 },
};

const darker = (hex, share = 0.72) => new THREE.Color(hex).multiplyScalar(share);

// Aluminized cloth on the pieces off the body (a proximity suit's gloves, boots and hood): the film's sheen as metal, lit by
// the steel's reflections, the cloth atlas's crinkled tile on it (render.js FOIL is the body's). The hood's visor: gold
// film on polycarbonate (a gold-coated visor reflects the radiant heat and dims the glare), `visor` its finish.
export const FOIL_PIECE = { metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2, visor: { color: 0xd8a640, metalness: 1, roughness: 0.08 } };

/** Aluminized cloth (`stuff`: a CLOTH_MATERIALS key, aluminized or its quilted kind) in `color`, lit by `envMap`. */
export function foilMaterial(envMap, color, stuff = 'aluminized') {
  const material = new THREE.MeshStandardMaterial({ color, metalness: FOIL_PIECE.metalness, roughness: FOIL_PIECE.roughness, envMap, envMapIntensity: FOIL_PIECE.envMapIntensity });
  return DETAIL_MAPS.on ? clothPropMaterial(material, stuff) : material;
}

/** What a worn piece of a slot (`feet`, the shoe of this kind) is made of for this man (detailmaps.js clothMaterialOf). */
function wornMaterial(body, slot, kind) {
  const inputs = body.inputs ?? {};
  return clothMaterialOf({ [slot]: { kind } }, slot === 'feet' ? 'boot' : 'top', { faction: factionOf(inputs), outfit: outfitOf(inputs).kind });
}

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
  // A head piece that is the wearer's choice (a lady's hair decoration: OUTFITS `optionalHead`) is drawn only when she has it on.
  const optionalHead = OUTFITS[kind]?.optionalHead;
  const headChosen = !optionalHead || (inputs.accessories ?? []).includes(optionalHead);
  const head = !headChosen ? null : look.head && tint?.armor ? { ...look.head, color: tint.armor, lace: tint.lace ?? look.head.lace } : look.head;
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
    // A rope for a belt (rags).
    rope: new THREE.Color(0x8a7650),
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
    // The fur of a collar or stole (a steppe man's fox or wolf).
    fur: base(armor?.fur, 0x6a4a2a),
    cloth: base(armor?.cloth, 0x8a1f22),
    cloth2: base(armor?.cloth2, 0xe8e2d2),
    // A device over the field (a Templar's cross), drawn sharp-edged.
    charge: base(armor?.charge?.color, 0xa2201e),
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
  // A look may build its own metal; it answers nothing to leave it to the default.
  const custom = activeLook().steel?.(envMap, options);
  if (custom) return custom;
  return new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, metalness: WARDROBE.steel.metalness, roughness: WARDROBE.steel.roughness, envMap, envMapIntensity: 1.1, ...options });
}

/**
 * The reflection map for steel: a painted gradient sky with a bright
 * horizon band, made into an environment once per scene.
 */
export function steelEnvironment(renderer, { linear = false } = {}) {
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
  // The painted sky is authored in sRGB; a linear-workflow look needs it decoded before it is filtered (see the colour trap in looks.js).
  if (linear) texture.encoding = THREE.sRGBEncoding;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromEquirectangular(texture);
  generator.dispose();
  texture.dispose();
  return target.texture;
}

// ---- Pieces off the body mesh -------------------------------------------------

/** Shadows and ink outlines for a group's meshes (gathered first: an outline is a mesh too). */
export function inkAll(group, width = 0.003) {
  const meshes = [];
  group.traverse((piece) => {
    if (piece.isMesh && !piece.userData.outline) meshes.push(piece);
  });
  for (const piece of meshes) {
    piece.castShadow = true;
    if (!piece.userData.noOutline && outlineScale(activeLook()) !== 0) piece.add(outlineFor(piece, width));
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
  // (A proximity suit's aluminized gloves: their gauntlet cuff over the sleeve.)
  const material = kind === 'gauntlet' ? steel : kind === 'proximity' ? foilMaterial(steel?.envMap ?? null, 0xc9ccd1) : surface(kind === 'tactical' ? 0x18191d : skinColor);
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
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, kind === 'gauntlet' || kind === 'proximity' ? 0.055 * scale : 0.042 * scale, 0.06 * scale, 14), material);
    cuff.position.y = -0.04 * scale;
    hand.add(cuff);
  }
  return finish(hand);
}

/**
 * Footwear in the foot's frame (y along the foot, toes forward): soles and
 * uppers by kind, a heel block under a woman's business boot, steel
 * sabatons, or a bare foot. `feet`: the design's own (a sabaton's `point`,
 * `lames` and `rivets`).
 */
export function buildFootwear(body, kind, colors, skinColor, steel, heels, feet = {}) {
  const length = 0.25 * body.heightM / 1.8;
  const shoe = new THREE.Group();
  const upperColor = colors.boot.getHex();
  const spec = {
    boxingBoot: { width: 0.05, height: 0.045, sole: 0x17171c },
    trainer: { width: 0.054, height: 0.05, sole: 0xf4f4f6 },
    hikingBoot: { width: 0.06, height: 0.058, sole: 0x2a2420 },
    tacticalBoot: { width: 0.06, height: 0.056, sole: 0x111111 },
    // A proximity suit's boot: rubber, under an aluminized cover (`foil`).
    proximityBoot: { width: 0.064, height: 0.06, sole: 0x111111, foil: true },
    compactBoot: { width: 0.054, height: 0.05, sole: 0x111111 },
    heelAnkleBoot: { width: 0.05, height: 0.042, sole: 0x0b0b0d },
    // A patent platform shoe: a round toe, straps over the instep and ankle.
    platformShoe: { width: 0.05, height: 0.046, sole: 0x0b0b0d, patent: true },
    dressShoe: { width: 0.045, height: 0.038, sole: 0x2a1d14 },
    // A Song and Jin rider's leather boot: soft, its toe turned up.
    jinBoot: { width: 0.056, height: 0.05, sole: 0x2a1d14 },
    // A rider's soft leather boot (khuff) to the knee, its toe a little pointed.
    ridingBoot: { width: 0.054, height: 0.048, sole: 0x2a1d14 },
    // Split-toed socks on straw sandals; a gladiator's leather sandal.
    tabi: { width: 0.046, height: 0.045, sole: 0xc8b27a },
    sandal: { width: 0.036, height: 0.044, sole: 0x5a3a22, skin: true },
    // A bare foot bound in strips of rag (a starving rebel's).
    footRags: { width: 0.043, height: 0.034, skin: true },
    sabaton: { width: 0.058, height: 0.05 },
    bare: { width: 0.042, height: 0.032 },
  }[kind] ?? { width: 0.05, height: 0.045, sole: 0x17171c };
  // The cloth atlas's tile on the upper (detailtex.js clothPropMaterial: leather, a trainer's knit, a tabi's cotton).
  const stuff = wornMaterial(body, 'feet', kind);
  const upperMaterial = kind === 'sabaton' ? steel : spec.foil ? foilMaterial(steel?.envMap ?? null, upperColor, stuff) : kind === 'bare' || spec.skin ? surface(skinColor) : surface(upperColor, { roughness: spec.patent ? 0.12 : 0.5 });
  if (kind !== 'sabaton' && kind !== 'bare' && !spec.skin && !spec.foil) clothPropMaterial(upperMaterial, stuff);
  const upper = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), upperMaterial);
  upper.scale.set(spec.width, length / 2, spec.height);
  upper.position.set(-0.012, length * 0.28, 0);
  shoe.add(upper);
  if (spec.sole !== undefined) {
    // A tabi's waraji and a sandal's sole are plaited straw or leather (the people's: a Mexica's of fibre).
    const soleStuff = kind === 'tabi' ? 'straw' : kind === 'sandal' ? stuff : 'none';
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.018, length * 0.95, spec.height * 1.9), clothPropMaterial(surface(spec.sole), soleStuff));
    sole.position.set(-spec.width * 0.95, length * 0.28, 0);
    shoe.add(sole);
  }
  if (kind === 'sandal') {
    // Straps across the bare foot.
    for (const along of [0.15, 0.45, 0.72]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(spec.height * 1.02, 0.005, 5, 14, Math.PI), clothPropMaterial(surface(upperColor), stuff));
      strap.rotation.y = Math.PI / 2;
      strap.rotation.z = Math.PI / 2;
      strap.position.set(-0.01, length * along, 0);
      shoe.add(strap);
    }
  }
  if (kind === 'footRags') {
    // A strip of rag wound round the middle of the foot and one round the ankle: two open, eight-sided bands, the toes bare.
    const rag = clothPropMaterial(surface(upperColor, { roughness: 0.95 }), stuff);
    rag.side = THREE.DoubleSide;
    for (const [along, wide] of [[0.3, 0.32], [-0.02, 0.18]]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(spec.height * 1.08, spec.height * 1.12, length * wide, 8, 1, true), rag);
      band.scale.set(spec.width / spec.height, 1, 1);
      band.position.set(-0.012, length * along, 0);
      shoe.add(band);
    }
  }
  if (kind === 'jinBoot' || kind === 'ridingBoot') {
    // The toe drawn out and turned up (+x is up from the sole); the rider's boot's only a little.
    const turned = kind === 'jinBoot';
    const reach = turned ? 0.34 : 0.26;
    const toe = new THREE.Mesh(new THREE.ConeGeometry(spec.height * 0.9, length * reach, 10), upperMaterial);
    toe.geometry.translate(0, length * reach / 2, 0);
    toe.scale.set(spec.width / spec.height, 1, 1);
    toe.position.set(-0.012, length * 0.62, 0);
    toe.rotation.z = turned ? -0.55 : -0.12;
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
    // The pointed toe of a 15th-century sabaton: the steel drawn out past the foot to a point (`feet.point`, else
    // WARDROBE.sabatonPoint: m beyond it, at this height), low over the ground.
    const point = (feet.point ?? WARDROBE.sabatonPoint) * body.heightM / 1.8;
    const cap = Math.min(point, WARDROBE.sabatonPoint * body.heightM / 1.8);
    const toe = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 12), steel);
    toe.scale.set(spec.width * 0.62, cap + length * 0.16, spec.height * 0.72);
    toe.position.set(-spec.width * 0.42, length * 0.78 + (cap - length * 0.16) / 2 + length * 0.16 * 0.5, 0);
    shoe.add(toe);
    // À la poulaine (the Gothic harness's, 1470s-80s: the Met's 29.150.9a,b; Wallace A 21): past the toe cap the point runs
    // on as a thin spike, drawn down to near the ground.
    if (point > cap) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 8), steel);
      // From inside the cap's tip (0.86 of the foot's length past the cap) out to the point, tipped down a little.
      const run = point - cap + length * 0.06;
      const droop = 0.06;
      spike.scale.set(spec.width * 0.26, run, spec.height * 0.2);
      spike.rotation.z = droop;
      spike.position.set(-spec.width * 0.42 - Math.sin(droop) * run * 0.5, length * 0.8 + cap + run / 2, 0);
      shoe.add(spike);
    }
    // Lames across the foot (`feet.lames`, else three): thin steel rings following its section, narrowing towards the toe,
    // and their brass rivets each side where the design has them (`feet.rivets`).
    const lames = feet.lames ?? 3;
    const brass = feet.rivets ? metal(steel, colors.gold?.getHex?.() ?? 0xd6a743) : null;
    for (let index = 0; index < lames; index += 1) {
      const along = lames === 3 ? [0.36, 0.46, 0.56][index] : 0.32 + (0.36 * index) / (lames - 1);
      const across = Math.sqrt(Math.max(0.05, 1 - ((along - 0.28) / 0.5) ** 2));
      const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 4, 18), steel);
      band.rotation.x = Math.PI / 2;
      band.scale.set(spec.width * across * 1.03, spec.height * across * 1.03, spec.width);
      band.position.set(-0.012, length * along, 0);
      band.userData.noOutline = true;
      shoe.add(band);
      if (!brass) continue;
      for (const side of [1, -1]) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 6, 4), brass);
        rivet.position.set(-0.012, length * along, side * spec.width * across * 1.06);
        rivet.userData.noOutline = true;
        shoe.add(rivet);
      }
    }
  }
  return finish(shoe);
}

/**
 * Headgear, in head coordinates (r the head radius): an amateur's
 * headguard, a beanie, a riot helmet with its visor, a knight's great helm
 * or bascinet. Returns the group and whether it hides the hair.
 */
// The Han lamellar helmet's rows (in head radii): the cap's [bottom radius,
// top radius, height, centre y] from the brow up, and the curtain's [top
// radius, bottom radius, height, centre y] from the rim down; plates round a
// row, and the face's opening in the curtain (rad, centred on the front).
const HAN_HELM = {
  plates: 22,
  cap: [[1.2, 1.12, 0.42, 0.32], [1.12, 0.98, 0.4, 0.66], [0.98, 0.76, 0.36, 0.98], [0.76, 0.44, 0.3, 1.22]],
  curtain: [[1.18, 1.3, 0.46, 0.04], [1.28, 1.42, 0.46, -0.32], [1.4, 1.56, 0.46, -0.68]],
  faceOpen: 1.5,
};

// The helmets of the Republic and of late antiquity (head radii):
// - the Montefortino's bowl radius, how much higher than round it rises
//   (`peak`), how far its neck brim flares out, and how high it sits above the
//   head's middle (`lift`: worn up on the forehead, as the galea, clear of the eyes);
// - the ridge helmet's bowl, its height, its lift;
// - the spangenhelm: `plates` plates (and as many spangen), the cone's base
//   radius and height, the brow band's height;
// - the bashlyk's tip folded forward this far (rad).
const MONTEFORTINO = { bowl: 1.24, peak: 1.12, brim: 0.32, lift: 0.18 };
const RIDGE_HELM = { bowl: 1.24, height: 1.08, lift: 0.18 };
const SPANGENHELM = { plates: 6, base: 1.24, height: 1.6, brow: 0.16 };
const BASHLYK = { fold: 0.9 };

// The comb morion of c. 1560-80 (the Met's 14.25.629 and its etched Milanese and Brescian kind; RCIN 67373), in head radii:
// - `skull`: raised in one piece, its foot an ellipse `long` before and behind and `broad` each side at height `foot`, its
//   dome `high` over the foot: a narrow skull, longer than broad;
// - `comb`: the skull drawn up in the middle plane into a tall crescent, a half-disc reaching `long` before and behind and
//   `high` over the skull's foot (about half again the dome's height), `thick` through, its edge turned and roped;
// - `brim`: out from the skull's foot `side` over the ears, nearly level there, drawn out `point` further and swept up `rise`
//   at the front and back into points (a boat seen from the side), `sharp` how narrow the points are in plan, `sweep` how
//   gradually the edge rises toward them from the sides (a crescent, not flaps), `drop` how far it dips over the ears; its
//   edge turned and roped;
// - `rivets`: the lining's brass-capped rivets round the skull just over the brim, `rise` above its foot;
// - `plume`: the plume holder riveted on behind the left ear (`at`: rad round from the front), `long` tall.
// The rope of the turned edges: `rope` thick, a twist every `twist` along it.
const MORION = {
  skull: { long: 1.22, broad: 1.04, foot: 0.12, high: 1.0 },
  comb: { long: 1.3, high: 1.78, thick: 0.07 },
  brim: { side: 0.4, point: 0.62, rise: 0.8, sharp: 6, sweep: 2.5, drop: 0.05 },
  rivets: { count: 16, rise: 0.12, r: 0.05 },
  plume: { at: 2.5, long: 0.42 },
  rope: { r: 0.042, twist: 0.09 },
  brass: 0xc9a04a,
};

/**
 * A turned and roped edge along `points` (head-radius points times `r`): a tube `MORION.rope.r` thick whose radius swells and
 * falls in a spiral, a twist every `MORION.rope.twist`, so it reads as the rope filed into the roll.
 */
function ropedEdge(points, r, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * r, y * r, z * r)), closed);
  const segments = Math.max(16, Math.round(curve.getLength() / (MORION.rope.twist * r)) * 4);
  const radial = 6;
  const geometry = new THREE.TubeGeometry(curve, segments, MORION.rope.r * r, radial, closed);
  const position = geometry.attributes.position;
  const centre = new THREE.Vector3();
  const vertex = new THREE.Vector3();
  for (let along = 0; along <= segments; along += 1) {
    curve.getPointAt((along % (closed ? segments : segments + 1)) / segments, centre);
    for (let round = 0; round <= radial; round += 1) {
      const index = along * (radial + 1) + round;
      vertex.fromBufferAttribute(position, index).sub(centre);
      vertex.multiplyScalar(1 + 0.35 * Math.sin((2 * Math.PI * along) / 4 + (2 * Math.PI * round) / radial));
      position.setXYZ(index, centre.x + vertex.x, centre.y + vertex.y, centre.z + vertex.z);
    }
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/**
 * The comb morion's brim (MORION.brim): from the skull's foot out to its edge, level over the ears and swept up into points
 * before and behind; its texture coordinates round (u) and out (v) for the etched tile. Returns the mesh and its edge points.
 */
function morionBrim(r, material) {
  const { long, broad, foot } = MORION.skull;
  const { side, point, rise, sharp, sweep, drop } = MORION.brim;
  const around = 64;
  const rings = 4;
  const positions = [];
  const uvs = [];
  const edge = [];
  for (let ring = 0; ring <= rings; ring += 1) {
    const share = ring / rings;
    for (let step = 0; step <= around; step += 1) {
      const angle = (step / around) * Math.PI * 2;
      const ends = Math.abs(Math.cos(angle)) ** sharp;
      const reach = (side + point * ends) * share;
      // The sweep up gathers toward the edge (a curved, not a flat, brim).
      const lift = (rise * Math.abs(Math.cos(angle)) ** sweep - drop) * share ** 1.6;
      const p = [(long + reach) * Math.cos(angle), foot + lift, (broad + reach) * Math.sin(angle)];
      positions.push(p[0] * r, p[1] * r, p[2] * r);
      uvs.push(step / around, share);
      if (ring === rings && step < around) edge.push(p);
    }
  }
  const indices = [];
  for (let ring = 0; ring < rings; ring += 1) {
    for (let step = 0; step < around; step += 1) {
      const a = ring * (around + 1) + step;
      const b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const surfaceMaterial = material.clone();
  surfaceMaterial.side = THREE.DoubleSide;
  return { mesh: new THREE.Mesh(geometry, surfaceMaterial), edge };
}

export function buildHeadgear(body, head, colors, steel, cornerHex, { lowDetail = false } = {}) {
  if (!head) return null;
  const r = body.lengths.headRadius;
  const group = new THREE.Group();
  const color = head.color === 'corner' ? cornerHex : head.color;
  const cloth = surface(color);
  let hidesHair = true;
  // Fitted over the head the helmets are made on (helmforms.js HELM_HEAD): render.js widens it to a broader head.
  let fitted = false;
  // Its laced parts that wear a laced tile (detailmaps.js HELMET_PART_TILES), drawn as tiers for it; not in a crowd.
  const partTiles = DETAIL_MAPS.on && !lowDetail ? HELMET_PART_TILES[head.kind] ?? {} : {};
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
      // A knight's helmet under study (helmstyle.js `knight`; knighthelms.js), fitted over the head, with its baked maps.
      if (buildKnightHelm(group, head, r, metal(steel, color))) {
        fitted = true;
        break;
      }
      // The great helm of the Templars' day (c. 1220–1250): a tall can over
      // the whole head, its sides drawing in a little to a sharp shoulder and
      // a low pointed crown, its lower edge flaring a little over the mail
      // coif; a raised strip down the middle of the front to the sight, one
      // sight across, rows of breaths in the faceplate below it.
      // Its outline (radius at height, in head radii), from the lower edge up to the shoulder.
      const sides = [[-1.31, 1.29], [-1.2, 1.22], [-0.9, 1.2], [0.3, 1.16], [1.12, 1.08]];
      const crownFrom = 1.12;
      const crownRise = 0.26;
      const radiusAt = (y) => {
        if (y >= crownFrom) return sides.at(-1)[1] * Math.max(0, 1 - (y - crownFrom) / crownRise);
        const upper = sides.findIndex(([at]) => at >= y);
        if (upper <= 0) return sides[0][1];
        const [y0, r0] = sides[upper - 1];
        const [y1, r1] = sides[upper];
        return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
      };
      // The shoulder twice over, so the sides and the crown each keep their own
      // shading and meet at a crisp edge; then the cone to its point.
      const profile = [...sides, sides.at(-1), [crownFrom + crownRise, 0.001]].map(([y, radius]) => new THREE.Vector2(radius * r, y * r));
      const shellSteel = steel.clone();
      shellSteel.side = THREE.DoubleSide;
      const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), shellSteel);
      // A riveted seam along the shoulder, where the crown plate meets the sides.
      const seam = new THREE.Mesh(new THREE.TorusGeometry(sides.at(-1)[1] * r, 0.025 * r, 5, 28), steel);
      seam.rotation.x = Math.PI / 2;
      seam.position.y = (crownFrom - 0.01) * r;
      group.add(shell, seam);
      const dark = surface(0x050506);
      // On the shell at height y, `angle` round from the front (+x) towards the left (+z), standing `out` off it.
      const onShell = (object, y, angle, out = 0) => {
        const radius = radiusAt(y) + out;
        object.position.set(Math.cos(angle) * radius * r, y * r, Math.sin(angle) * radius * r);
        object.rotation.y = -angle;
        return object;
      };
      // The raised strip down the front, from over the crown to the sight.
      const ridgePath = [];
      for (let y = crownFrom + crownRise * 0.85; y >= 0.2; y -= 0.04) ridgePath.push(new THREE.Vector3((radiusAt(y) + 0.015) * r, y * r, 0));
      group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridgePath), 24, 0.045 * r, 5, false), steel));
      // The sight: one slit across the front.
      const sightAt = 0.12;
      const sight = new THREE.Mesh(new THREE.CylinderGeometry((radiusAt(sightAt) + 0.004) * r, (radiusAt(sightAt) + 0.004) * r, 0.08 * r, 16, 1, true, Math.PI / 2 - 0.62, 1.24), dark);
      sight.position.y = sightAt * r;
      sight.userData.noOutline = true;
      group.add(sight);
      // Breaths: rows of holes punched in the faceplate, either side of its middle.
      if (head.breaths) {
        const holes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04 * r, 0.06 * r, 0.06 * r), dark, 36);
        const place = new THREE.Object3D();
        let at = 0;
        for (const side of [1, -1]) {
          for (let row = 0; row < 6; row += 1) {
            for (let column = 0; column < 3; column += 1) {
              onShell(place, -0.12 - row * 0.15, side * (0.14 + column * 0.15), 0.003);
              place.updateMatrix();
              holes.setMatrixAt(at, place.matrix);
              at += 1;
            }
          }
        }
        holes.userData.noOutline = true;
        group.add(holes);
      }
      // A small cross cut through the lower left of the face.
      if (head.crossCut) {
        for (const [h, w] of [[0.2, 0.06], [0.06, 0.18]]) {
          const piece = onShell(new THREE.Mesh(new THREE.BoxGeometry(0.04 * r, h * r, w * r), dark), -1.02, 0.5, 0.003);
          piece.userData.noOutline = true;
          group.add(piece);
        }
      }
      // The mail coif under it, from inside its lower edge down over the neck to the shoulders (`coif`: its colour).
      if (head.coif) {
        const coif = new THREE.Mesh(new THREE.CylinderGeometry(1.08 * r, 1.3 * r, 0.75 * r, 20, 1, true), surface(new THREE.Color(head.coif).getHex(), { roughness: 0.9 }));
        coif.material.side = THREE.DoubleSide;
        coif.position.y = (sides[0][0] - 0.22) * r;
        group.add(coif);
      }
      break;
    }
    case 'stechhelm':
      buildStechhelm(group, head, r, steel, { lowDetail });
      break;
    case 'bascinet': {
      if (buildKnightHelm(group, head, r, metal(steel, color))) {
        fitted = true;
        break;
      }
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
      fitted = true;
      break;
    case 'arenaHelm':
      // A gladiator's helmet of his kind, in detail (arenaview.js).
      fitted = buildArenaHelm(group, head, r, metal(steel, color));
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
    case 'kasa':
      buildKasa(group, r, color, head);
      hidesHair = false;
      break;
    case 'kettleHat': {
      // In its design (helmforms.js HELM_DESIGNS: `head.design`, or the one helmstyle.js `kettle` asks for), fitted over the
      // head, with its baked maps.
      const design = helmDesignOf(head);
      if (design && buildDesignHelm(group, design, r, metal(steel, color), { bevor: head.bevor !== false })) {
        fitted = true;
        // A mail coif under it.
        if (head.coif) {
          const coif = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.36 * r, 1.0 * r, 18, 1, true), metal(steel, 0x7d8087));
          coif.position.y = -0.95 * r;
          group.add(coif);
        }
        break;
      }
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
      // The comb morion (MORION): a narrow skull raised in one piece into a tall crescent comb front to back, the brim
      // level over the ears and swept up into points before and behind, every edge turned and roped, the lining's brass
      // rivets round the skull's foot, a plume holder behind.
      const iron = metal(steel, color);
      const brass = metal(steel, MORION.brass);
      const { long, broad, foot, high } = MORION.skull;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      skull.scale.set(long, high, broad);
      skull.position.y = foot * r;
      // The comb: a half-disc in the middle plane, its foot sunk in the skull; its edge roped from end to end.
      const comb = MORION.comb;
      const outline = (angle) => [comb.long * Math.cos(angle), foot + comb.high * Math.sin(angle)];
      const disc = new THREE.Shape();
      for (let step = 0; step <= 32; step += 1) {
        const [x, y] = outline((step / 32) * Math.PI);
        if (step === 0) disc.moveTo(x * r, y * r);
        else disc.lineTo(x * r, y * r);
      }
      const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(disc, { depth: comb.thick * r, bevelEnabled: false }), iron);
      plate.position.z = (-comb.thick * r) / 2;
      const crest = Array.from({ length: 25 }, (_, step) => {
        const [x, y] = outline(0.12 + (step / 24) * (Math.PI - 0.24));
        return [x, y, 0];
      });
      group.add(skull, plate, ropedEdge(crest, r, iron));
      const brim = morionBrim(r, iron);
      group.add(brim.mesh, ropedEdge(brim.edge, r, iron, true));
      // The lining's rivets, brass-capped, round the skull just over the brim.
      const rivets = MORION.rivets;
      const ring = Math.sqrt(1 - (rivets.rise / high) ** 2);
      for (let index = 0; index < rivets.count; index += 1) {
        const angle = ((index + 0.5) / rivets.count) * Math.PI * 2;
        const cap = new THREE.Mesh(new THREE.SphereGeometry(rivets.r * r, 6, 4), brass);
        cap.position.set(long * ring * Math.cos(angle) * r, (foot + rivets.rise) * r, broad * ring * Math.sin(angle) * r);
        group.add(cap);
      }
      // The plume holder: a short brass tube riveted upright on the skull behind the left ear.
      const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * r, 0.05 * r, MORION.plume.long * r, 8), brass);
      holder.position.set(long * Math.cos(MORION.plume.at) * r, (foot + 0.32) * r, (broad + 0.03) * Math.sin(MORION.plume.at) * r);
      holder.rotation.x = -0.25;
      group.add(holder);
      break;
    }
    case 'cabasset': {
      // In its design (the Spanish cabasset, helmforms.js HELM_DESIGNS), fitted over the head, its etching and rivets baked.
      const design = helmDesignOf(head);
      if (design && buildDesignHelm(group, design, r, metal(steel, color))) {
        fitted = true;
        break;
      }
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
    case 'robotHead': {
      // A humanoid robot's head (Unitree's G1): a rounded dark helmet over
      // the whole head, an open oval face frame in front, black inside, no
      // face; a ring of light round the opening (`led`) and a bar of it
      // across; a trim disc at each ear.
      const shell = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 24, 16), surface(color, { roughness: 0.35 }));
      shell.scale.set(1, 1.1, 0.94);
      shell.position.y = 0.04 * r;
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.62 * r, 20, 14), new THREE.MeshStandardMaterial({ color: head.visor ?? 0x0d0e11, roughness: 0.15, metalness: 0.5 }));
      face.scale.set(0.42, 1.15, 0.95);
      face.position.set(0.98 * r, 0.02 * r, 0);
      const light = new THREE.MeshBasicMaterial({ color: new THREE.Color(head.led ?? '#46b4ff') });
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.6 * r, 0.055 * r, 8, 32), light);
      bezel.rotation.y = Math.PI / 2;
      bezel.scale.set(1, 1.15, 1);
      bezel.position.set(1.06 * r, 0.02 * r, 0);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, 0.07 * r, 0.7 * r), light);
      bar.position.set(1.22 * r, 0.12 * r, 0);
      for (const glow of [bezel, bar]) glow.userData.noOutline = true;
      group.add(shell, face, bezel, bar);
      for (const side of [1, -1]) {
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * r, 0.34 * r, 0.12 * r, 16), surface(head.trim ?? 0xb6bbc3, { roughness: 0.3 }));
        ear.rotation.x = Math.PI / 2;
        ear.position.set(-0.05 * r, 0.05 * r, side * 1.12 * r);
        group.add(ear);
      }
      break;
    }
    case 'gorillaHead': {
      // A silverback's head over the man's: the black-furred cranium with
      // its sagittal crest, the heavy brow ridge, the deep-set eyes under
      // it, the broad dark muzzle and its nostrils.
      const fur = surface(color, { roughness: 0.9 });
      const face = surface(0x34302f, { roughness: 0.7 });
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(1.14 * r, 20, 14), fur);
      cranium.scale.set(1.02, 1.0, 0.98);
      cranium.position.y = 0.06 * r;
      const crest = new THREE.Mesh(new THREE.SphereGeometry(0.62 * r, 14, 10), fur);
      crest.scale.set(1.35, 0.85, 0.42);
      crest.position.set(-0.2 * r, 0.82 * r, 0);
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * r, 0.24 * r, 1.7 * r, 12), face);
      brow.rotation.x = Math.PI / 2;
      brow.scale.set(1, 1, 0.8);
      brow.position.set(0.98 * r, 0.3 * r, 0);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.66 * r, 16, 12), face);
      muzzle.scale.set(0.8, 0.78, 1.05);
      muzzle.position.set(0.82 * r, -0.38 * r, 0);
      group.add(cranium, crest, brow, muzzle);
      const dark = surface(0x120c08, { roughness: 0.3 });
      for (const side of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 * r, 10, 8), dark);
        eye.position.set(1.08 * r, 0.08 * r, side * 0.34 * r);
        const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.1 * r, 8, 6), dark);
        nostril.position.set(1.32 * r, -0.2 * r, side * 0.14 * r);
        group.add(eye, nostril);
      }
      break;
    }
    // The monkeys' and the chimpanzee's heads over the man's, as the silverback's.
    case 'macaqueHead':
    case 'baboonHead':
    case 'chimpHead': {
      // A rhesus: a round furred cranium, the bare pink face set flat in it, close-set eyes under a light brow, a short
      // muzzle, small ears. A chacma: a long dog-like muzzle, dark and bare, the eyes deep under a heavy brow, a mane over
      // the crown and nape. A chimpanzee: a bare face under a heavy brow ridge, a jutting muzzle, big ears out to the sides.
      const kind = head.kind;
      const fur = surface(color, { roughness: 0.95 });
      const skin = surface(head.face ?? 0x6a5547, { roughness: 0.7 });
      const dark = surface(0x120c08, { roughness: 0.3 });
      const cranium = new THREE.Mesh(new THREE.SphereGeometry(1.1 * r, 20, 14), fur);
      cranium.scale.set(kind === 'baboonHead' ? 1.05 : 1, kind === 'chimpHead' ? 0.92 : 1, 0.98);
      cranium.position.y = 0.05 * r;
      group.add(cranium);
      const face = new THREE.Mesh(new THREE.SphereGeometry(0.82 * r, 18, 12), skin);
      face.scale.set(0.5, 0.95, 0.9);
      face.position.set(0.72 * r, -0.02 * r, 0);
      group.add(face);
      const muzzleLength = kind === 'baboonHead' ? 1.25 : kind === 'chimpHead' ? 0.72 : 0.52;
      const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * r, 0.42 * r, muzzleLength * r, 14), skin);
      muzzle.rotation.z = -Math.PI / 2 + (kind === 'baboonHead' ? 0.28 : 0.1);
      muzzle.position.set((0.75 + muzzleLength * 0.45) * r, (kind === 'baboonHead' ? -0.42 : -0.38) * r, 0);
      muzzle.scale.set(1, 1, kind === 'baboonHead' ? 0.82 : 1.1);
      group.add(muzzle);
      const nose = new THREE.Mesh(new THREE.SphereGeometry(0.2 * r, 10, 8), kind === 'baboonHead' ? dark : skin);
      nose.position.set((0.78 + muzzleLength * 0.92) * r, (kind === 'baboonHead' ? -0.55 : -0.3) * r, 0);
      group.add(nose);
      const brow = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * r, 0.16 * r, 1.25 * r, 10), kind === 'macaqueHead' ? skin : fur);
      brow.rotation.x = Math.PI / 2;
      brow.scale.set(1, 1, kind === 'macaqueHead' ? 0.6 : 1);
      brow.position.set(0.9 * r, 0.26 * r, 0);
      group.add(brow);
      if (kind === 'baboonHead') {
        // The mane: a cape of longer fur over the crown and down the nape.
        const mane = new THREE.Mesh(new THREE.SphereGeometry(1.25 * r, 16, 10, Math.PI * 0.55, Math.PI * 0.9), fur);
        mane.scale.set(1.05, 1.1, 1.15);
        mane.position.set(-0.25 * r, 0, 0);
        group.add(mane);
      }
      for (const side of [1, -1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.11 * r, 10, 8), dark);
        eye.position.set(0.98 * r, 0.1 * r, side * 0.27 * r);
        const ear = new THREE.Mesh(new THREE.SphereGeometry((kind === 'chimpHead' ? 0.38 : 0.24) * r, 10, 8), skin);
        ear.scale.set(0.45, 1, 0.4);
        ear.position.set(-0.05 * r, 0.12 * r, side * (kind === 'chimpHead' ? 1.12 : 0.98) * r);
        group.add(eye, ear);
        if (kind === 'baboonHead') {
          // A male's canines, longer than a leopard's: a pair down past the lips.
          const canine = new THREE.Mesh(new THREE.ConeGeometry(0.06 * r, 0.36 * r, 6), surface(0xeae2cc, { roughness: 0.4 }));
          canine.rotation.z = Math.PI;
          canine.position.set((0.75 + muzzleLength * 0.62) * r, -0.68 * r, side * 0.16 * r);
          group.add(canine);
        }
      }
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
      buildPagodaHelm(group, head, r, steel, color, { laced: Boolean(partTiles.aventail) });
      worldMask(group, head, r, steel, color);
      break;
    case 'ayyubidHelm':
      buildAyyubidHelm(group, head, r, steel, color);
      worldMask(group, head, r, steel, color);
      break;
    case 'steppeHelm': {
      // A steppe helmet: a tall pointed iron bowl, a brow band, a spike with
      // a plume, a lamellar aventail round the sides and back (open at the
      // face); the kheshig's with a gilt band and an iron face mask.
      const iron = metal(steel, color);
      // The bowl's profile (head radii): near upright above the brow band, then drawn in, its flanks a little hollow,
      // to a tall narrow point, as on surviving Mongol and Central Asian bowls; HELM_SPAN narrows it side to side.
      const profile = [[1.14, 0], [1.13, 0.2], [1.04, 0.5], [0.86, 0.82], [0.62, 1.12], [0.4, 1.42], [0.24, 1.72], [0.13, 2.0], [0.07, 2.25], [0.03, 2.42], [0, 2.46]];
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 20), iron);
      bowl.material.side = THREE.DoubleSide;
      bowl.position.y = 0.06 * r;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.17 * r, 0.08 * r, 6, 24), metal(steel, head.gold ?? color));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.1 * r;
      const spike = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * r, 0.05 * r, 0.5 * r, 8), iron);
      spike.position.y = 2.7 * r;
      group.add(bowl, band, spike);
      // A Ming rider's (`tassel`): the red horsehair tassel bound to the spike, falling round it.
      if (head.tassel) {
        spike.scale.y = 1.4;
        spike.position.y = 2.78 * r;
        group.add(hongying(r, HONGYING_MOUNTS.steppeHelm, head.tassel, lowDetail));
      } else if (head.plume) {
        const plume = new THREE.Mesh(new THREE.ConeGeometry(0.09 * r, 0.9 * r, 6), surface(head.plume, { roughness: 0.9 }));
        plume.position.y = 3.2 * r;
        group.add(plume);
      }
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(1.16 * r, 1.7 * r, 1.25 * r, 22, 3, true, Math.PI * 0.8, Math.PI * 1.4), metal(steel, head.coif ?? color));
      aventail.material.side = THREE.DoubleSide;
      aventail.position.y = -0.52 * r;
      group.add(aventail);
      // The kit's own war mask (`maskDesign`: worldMask), else the plain one.
      if (head.mask && !worldMask(group, head, r, steel, color)) {
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
    case 'loovuuz': {
      // The Mongol fur hat: a tall domed crown of black fur (fox or sable),
      // the fur turned up thick all round as a brim, a red knot on top and a
      // white horsehair plume standing up from it, leaning back.
      const furMaterial = surface(head.fur ?? 0x17130f, { roughness: 1 });
      furMaterial.flatShading = true;
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.14 * r, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.55), furMaterial);
      crown.scale.set(1, 1.7, 1);
      crown.position.y = 0.4 * r;
      const brim = new THREE.Mesh(new THREE.TorusGeometry(1.14 * r, 0.36 * r, 7, 18), furMaterial);
      brim.rotation.x = Math.PI / 2;
      brim.scale.z = 1.5;
      brim.position.y = 0.62 * r;
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.16 * r, 8, 6), surface(color, { roughness: 0.9 }));
      knot.position.y = 2.3 * r;
      const hair = surface(head.plume ?? 0xece6d6, { roughness: 1 });
      const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.34 * r, 0.1 * r, 1.4 * r, 9), hair);
      plume.position.set(-0.28 * r, 2.95 * r, 0);
      plume.rotation.z = 0.35;
      group.add(crown, brim, knot, plume);
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
      // In its design (helmforms.js HELM_DESIGNS: `head.design`, the Turkman turban helmet), fitted over the head, its
      // inlay, rivets and mail baked; the mail closing across the face below the eye arches.
      const design = helmDesignOf(head);
      if (design && buildDesignHelm(group, design, r, metal(steel, color))) {
        fitted = true;
        break;
      }
      // The Ottoman chichak: a pointed bowl with a gilt band and finial, a
      // sliding nasal bar, cheek plates and a mail aventail round the neck;
      // (`turban`) a turban wound round it, as an alp wore it.
      const iron = metal(steel, color);
      // The bowl raised to a tall ogival point (CHICHAK: its profile), fluted from the band up as the Ottoman bowls are.
      const bowlGeometry = new THREE.LatheGeometry(CHICHAK.profile.map(([out, up]) => new THREE.Vector2(out * r, up * r)), CHICHAK.sides);
      const place = bowlGeometry.attributes.position;
      for (let index = 0; index < place.count; index += 1) {
        const [x, y, z] = [place.getX(index), place.getY(index), place.getZ(index)];
        const swell = 1 + CHICHAK.flute * Math.cos(Math.atan2(z, x) * CHICHAK.flutes) * Math.min(1, y / (0.3 * r));
        place.setXYZ(index, x * swell, y, z * swell);
      }
      bowlGeometry.computeVertexNormals();
      const bowl = new THREE.Mesh(bowlGeometry, iron);
      bowl.position.y = 0.06 * r;
      const gilt = metal(steel, head.gold ?? 0xd6a743);
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.19 * r, 0.07 * r, 6, 24), gilt);
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.12 * r;
      // The finial: a gilt knop and spike on the point.
      const knop = new THREE.Mesh(new THREE.SphereGeometry(0.1 * r, 10, 8), gilt);
      knop.position.y = (CHICHAK.profile.at(-1)[1] + 0.1) * r;
      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.06 * r, 0.45 * r, 8), gilt);
      finial.position.y = (CHICHAK.profile.at(-1)[1] + 0.38) * r;
      // The nasal: a bar sliding in its bracket on the brow, its foot widened into a leaf.
      const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 1.0 * r, 0.12 * r), iron);
      nasal.position.set(1.2 * r, -0.12 * r, 0);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, 0.22 * r, 0.22 * r), gilt);
      leaf.position.set(1.21 * r, -0.6 * r, 0);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1 * r, 0.3 * r, 0.2 * r), gilt);
      bracket.position.set(1.2 * r, 0.24 * r, 0);
      group.add(bowl, band, knop, finial, nasal, leaf, bracket);
      for (const side of [1, -1]) {
        const cheek = new THREE.Mesh(new THREE.BoxGeometry(0.6 * r, 0.8 * r, 0.06 * r), iron);
        cheek.position.set(0.35 * r, -0.45 * r, side * 1.08 * r);
        group.add(cheek);
      }
      const mailCloth = metal(steel, head.mail ?? 0x8d9097);
      mailCloth.side = THREE.DoubleSide;
      // The aventail hung from the bowl's foot round the sides and back to the shoulders, wearing the mail's rings (the
      // detail tile) where the maps are drawn.
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(1.17 * r, 1.65 * r, CHICHAK.aventail * r, 22, 2, true, Math.PI * 0.75, Math.PI * 1.5), mailCloth);
      aventail.position.y = (0.1 - CHICHAK.aventail / 2) * r;
      if (DETAIL_MAPS.on && !lowDetail) wearTile(aventail, 'mail', { moulded: true });
      group.add(aventail);
      worldMask(group, head, r, steel, color);
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
    case 'llautu': {
      // The Inca's llautu: a braided cord of coloured wool wound several times
      // round the head over the cropped hair, the turns in two colours (the
      // head's and its `lace`). A lord's ears (the Spaniards' orejones) were
      // stretched round great plugs of gold (`earspools`). The Sapa Inca's
      // mascapaicha (`fringe`): a fringe of red wool tassels hung from the
      // llautu over his brow, and a little upright of feathers above it.
      hidesHair = false;
      const second = surface(head.lace ?? color);
      for (let turn = 0; turn < 3; turn += 1) {
        const cord = new THREE.Mesh(new THREE.TorusGeometry(1.07 * r, 0.075 * r, 6, 22), turn % 2 ? second : cloth);
        cord.rotation.x = Math.PI / 2;
        cord.position.y = (0.2 + turn * 0.13) * r;
        group.add(cord);
      }
      if (head.earspools) {
        const gold = surface(head.earspools, { roughness: 0.3 });
        for (const side of [1, -1]) {
          const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * r, 0.3 * r, 0.1 * r, 14), gold);
          spool.rotation.x = Math.PI / 2;
          spool.position.set(-0.08 * r, -0.12 * r, side * 1.0 * r);
          group.add(spool);
        }
      }
      if (head.fringe) {
        const wool = surface(head.fringe, { roughness: 0.95 });
        for (let tassel = 0; tassel < 9; tassel += 1) {
          const angle = ((tassel - 4) / 4) * 0.55;
          const strand = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * r, 0.035 * r, 0.42 * r, 5), wool);
          strand.position.set(Math.cos(angle) * 1.1 * r, 0.02 * r, Math.sin(angle) * 1.1 * r);
          group.add(strand);
        }
        const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * r, 0.03 * r, 0.6 * r, 5), second);
        staff.position.set(0.55 * r, 1.25 * r, 0);
        const feathers = new THREE.Mesh(new THREE.ConeGeometry(0.14 * r, 0.55 * r, 5), surface(0xece4d0));
        feathers.position.set(0.55 * r, 1.75 * r, 0);
        group.add(staff, feathers);
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
      // (`topknot`: the hair cap's knob over the crown, the cloth wound round below it, in the cap's own undyed colour.)
      if (head.topknot) {
        const bun = new THREE.Mesh(new THREE.SphereGeometry(0.42 * r, 12, 10), surface(head.topknot, { roughness: 0.9 }));
        bun.scale.y = 1.15;
        bun.position.set(0.05 * r, 1.12 * r, 0);
        group.add(bun);
      }
      for (const side of [1, -1]) {
        const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.7 * r, 0.22 * r), wrap);
        tail.position.set(-1.18 * r, -0.12 * r, side * 0.14 * r);
        tail.rotation.x = side * 0.2;
        group.add(tail);
      }
      break;
    }
    case 'katozukin': {
      // The sōhei's katō-zukin: white cloth wound over the crown and round
      // the head, its end drawn across the face to the eyes, the rest falling
      // over the shoulders. Head frame: +x the face, +y up; three.js sphere
      // angle φ 0 is behind (−x), π in front.
      const wrap = cloth;
      wrap.side = THREE.DoubleSide;
      const slit = 0.26 * Math.PI;
      // Over the crown and brow, down to just above the eyes.
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.16 * r, 20, 10, 0, Math.PI * 2, 0, 0.43 * Math.PI), wrap);
      // Round the sides and back, below the brow: open in front for the eyes.
      const sides = new THREE.Mesh(new THREE.SphereGeometry(1.17 * r, 20, 8, Math.PI + slit, Math.PI * 2 - 2 * slit, 0.42 * Math.PI, 0.38 * Math.PI), wrap);
      // The veil across nose, mouth and chin, from under the eyes.
      const veil = new THREE.Mesh(new THREE.SphereGeometry(1.2 * r, 14, 8, Math.PI - slit - 0.05, 2 * slit + 0.1, 0.53 * Math.PI, 0.3 * Math.PI), wrap);
      // A fold at the brow, the edge of the wrap over the eyes.
      const brow = new THREE.Mesh(new THREE.TorusGeometry(1.15 * r, 0.07 * r, 6, 24, Math.PI * 0.55), wrap);
      brow.rotation.set(Math.PI / 2, 0, -Math.PI * 0.275);
      brow.position.y = 0.2 * r;
      // The cloth falling round the neck to the shoulders, behind and at the
      // sides (CylinderGeometry's angle 0 is +z; behind, −x, is 3π/2), the
      // veil's ends hanging in front.
      const behind = Math.PI * 1.4;
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.5 * r, 1.5 * r, 18, 2, true, Math.PI * 1.5 - behind / 2, behind), wrap);
      drape.position.set(-0.08 * r, -1.05 * r, 0);
      const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.95 * r, 1.25 * r, 0.9 * r, 10, 1, true, Math.PI * 0.5 - 0.6, 1.2), wrap);
      bib.position.set(0.02 * r, -1.05 * r, 0);
      group.add(bib);
      group.add(crown, sides, veil, brow, drape);
      break;
    }
    case 'mingHat': {
      // In one of the rank and file's four designs (chinahelms.js MING_HELMS: `design`, `finish`), fitted over the head.
      if (head.design && buildMingDesignHelm(group, head, r, steel, { lowDetail })) {
        fitted = true;
        break;
      }
      // The Ming soldier's iron helmet: a round crown, a wide brim almost
      // flat, a spike on top and the red horsehair tassel (hongying) bound
      // to it, falling round it over the crown.
      const iron = metal(steel, color);
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.17 * r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      crown.scale.y = 1.1;
      crown.position.y = 0.12 * r;
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(1.18 * r, 1.78 * r, 0.16 * r, 28, 1, true), iron.clone());
      brim.material.side = THREE.DoubleSide;
      brim.position.y = 0.06 * r;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.07 * r, 1.0 * r, 8), iron);
      spike.position.y = 1.85 * r;
      group.add(crown, brim, spike, hongying(r, HONGYING_MOUNTS.mingHat, head.tassel, lowDetail));
      break;
    }
    case 'montefortino': {
      // The Montefortino helmet of the Republic's legions (Crassus's men, 53
      // BC): a bronze bowl spun nearly to a hemisphere, a little peaked, with a
      // cast knob on the crown that holds the horsehair plume; a short neck
      // brim flared out behind (the old helmet's only guard for the nape),
      // a rolled rim, and broad hinged cheek pieces (scalloped, here rounded)
      // hanging over the jaw. Worn up on the forehead as the galea is.
      const bronze = metal(steel, color);
      const lift = MONTEFORTINO.lift * r;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(MONTEFORTINO.bowl * r, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), bronze);
      bowl.scale.y = MONTEFORTINO.peak;
      bowl.position.y = lift;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(MONTEFORTINO.bowl * r, 0.05 * r, 6, 28), bronze);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = lift;
      // The neck brim: a short flared ring behind (cylinder angle π..2π is x < 0).
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(MONTEFORTINO.bowl * r, (MONTEFORTINO.bowl + MONTEFORTINO.brim) * r, 0.18 * r, 22, 1, true, Math.PI * 1.15, Math.PI * 0.7), bronze.clone());
      brim.material.side = THREE.DoubleSide;
      brim.position.y = lift - 0.08 * r;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * r, 0.16 * r, 0.3 * r, 10), bronze);
      knob.position.y = lift + MONTEFORTINO.bowl * MONTEFORTINO.peak * r + 0.1 * r;
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.13 * r, 10, 6), bronze);
      button.position.y = knob.position.y + 0.17 * r;
      group.add(bowl, rim, brim, knob, button);
      // The plume: a tuft of horsehair standing from the knob and falling back.
      if (head.plume) {
        const hair = surface(head.plume, { roughness: 1 });
        const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.28 * r, 1.1 * r, 8), hair);
        tuft.position.set(-0.25 * r, button.position.y + 0.45 * r, 0);
        tuft.rotation.z = 0.5;
        group.add(tuft);
      }
      for (const side of [1, -1]) {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), bronze);
        cheek.scale.set(0.44 * r, 0.68 * r, 0.07 * r);
        cheek.position.set(0.24 * r, -0.36 * r, side * 1.18 * r);
        cheek.rotation.set(side * -0.18, 0, -0.1);
        group.add(cheek);
      }
      break;
    }
    case 'ridgeHelm': {
      // The late Roman ridge helmet (the Intercisa and Berkasovo kind, c.
      // 300–450): a bowl raised in two iron halves joined along a ridge band
      // from brow to nape, riveted to a brow band; a nasal down from the brow,
      // broad cheek pieces laced at the jaw, a small neck guard laced on behind.
      // The parade ones were silvered and gilt (`gold`: the bands).
      const iron = metal(steel, color);
      const bands = metal(steel, head.gold ?? color);
      const lift = RIDGE_HELM.lift * r;
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(RIDGE_HELM.bowl * r, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      bowl.scale.set(1.04, RIDGE_HELM.height, 0.98);
      bowl.position.y = lift;
      // The ridge: a band arched over the crown from front to back, standing up a little.
      const ridge = new THREE.Mesh(new THREE.TorusGeometry(RIDGE_HELM.bowl * r * 1.02, 0.06 * r, 5, 24, Math.PI), bands);
      ridge.scale.set(1.04, RIDGE_HELM.height, 1);
      ridge.position.y = lift;
      const brow = new THREE.Mesh(new THREE.TorusGeometry(RIDGE_HELM.bowl * r * 1.03, 0.07 * r, 6, 28), bands);
      brow.rotation.x = Math.PI / 2;
      brow.position.y = lift + 0.04 * r;
      const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.6 * r, 0.16 * r), iron);
      nasal.position.set(RIDGE_HELM.bowl * r * 1.04, lift - 0.24 * r, 0);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(RIDGE_HELM.bowl * r, (RIDGE_HELM.bowl + 0.22) * r, 0.42 * r, 20, 1, true, Math.PI * 1.15, Math.PI * 0.7), iron.clone());
      neck.material.side = THREE.DoubleSide;
      neck.position.y = lift - 0.24 * r;
      group.add(bowl, ridge, brow, nasal, neck);
      for (const side of [1, -1]) {
        const cheek = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), iron);
        cheek.scale.set(0.66 * r, 0.9 * r, 0.08 * r);
        cheek.position.set(0.3 * r, -0.42 * r, side * 1.16 * r);
        cheek.rotation.set(side * -0.16, 0, -0.08);
        group.add(cheek);
      }
      break;
    }
    case 'spangenhelm': {
      // The spangenhelm of the migrations (Germanic and Hunnic lords, and the
      // late Roman army's too): a conical bowl of `plates` iron plates riveted
      // between as many bands (spangen) that run up from the brow band to a
      // small crown knob; a short mail aventail hung from the brow band round
      // the sides and back, open at the face. `gold`: the bands gilt bronze.
      const iron = metal(steel, color).clone();
      iron.flatShading = true;
      const bands = metal(steel, head.gold ?? color);
      const plates = SPANGENHELM.plates;
      const bowl = new THREE.Mesh(new THREE.ConeGeometry(SPANGENHELM.base * r, SPANGENHELM.height * r, plates * 2, 1, true), iron);
      bowl.material.side = THREE.DoubleSide;
      bowl.position.y = (SPANGENHELM.brow + SPANGENHELM.height / 2) * r;
      const brow = new THREE.Mesh(new THREE.TorusGeometry(SPANGENHELM.base * r, 0.07 * r, 6, 28), bands);
      brow.rotation.x = Math.PI / 2;
      brow.position.y = SPANGENHELM.brow * r;
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11 * r, 8, 6), bands);
      knob.position.y = (SPANGENHELM.brow + SPANGENHELM.height) * r;
      group.add(bowl, brow, knob);
      // The spangen: a band up each seam from the brow to the knob, lying on the cone.
      const slant = Math.atan2(SPANGENHELM.base, SPANGENHELM.height);
      const length = Math.hypot(SPANGENHELM.base, SPANGENHELM.height) * r;
      for (let seam = 0; seam < plates; seam += 1) {
        const angle = (seam / plates) * Math.PI * 2;
        const band = new THREE.Mesh(new THREE.BoxGeometry(0.16 * r, length, 0.05 * r), bands);
        const holder = new THREE.Group();
        holder.rotation.y = angle;
        band.position.set(0, 0, (SPANGENHELM.base / 2) * r + 0.02 * r);
        band.rotation.x = -slant;
        holder.position.y = bowl.position.y;
        holder.add(band);
        group.add(holder);
      }
      const aventail = new THREE.Mesh(new THREE.CylinderGeometry(SPANGENHELM.base * r, (SPANGENHELM.base + 0.3) * r, 0.9 * r, 20, 2, true, Math.PI * 0.8, Math.PI * 1.4), metal(steel, head.coif ?? color));
      aventail.material.side = THREE.DoubleSide;
      aventail.position.y = (SPANGENHELM.brow - 0.45) * r;
      group.add(aventail);
      break;
    }
    case 'bashlyk': {
      // The bashlyk: the soft felt cap of the Iranian horse peoples (Scythians,
      // Parthians, as the coins of the Arsacid kings and the Palmyrene reliefs
      // show it): a tall crown of felt that stands up and folds its tip
      // forward, and long lappets down over the ears and the nape, tied under
      // the chin or thrown back.
      const felt = surface(color, { roughness: 1 });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1.12 * r, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), felt);
      crown.scale.y = 1.25;
      crown.position.y = 0.06 * r;
      // The tip: a soft cone rising from the crown and bent over toward the brow.
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5 * r, 1.1 * r, 10), felt);
      tip.position.set(0.28 * r, 1.55 * r, 0);
      tip.rotation.z = -BASHLYK.fold;
      const flapFelt = felt.clone();
      flapFelt.side = THREE.DoubleSide;
      // The lappets: down over each ear to the jaw, and a broad one over the nape.
      const nape = new THREE.Mesh(new THREE.CylinderGeometry(1.14 * r, 1.3 * r, 1.0 * r, 16, 1, true, Math.PI * 1.2, Math.PI * 0.6), flapFelt);
      nape.position.y = -0.45 * r;
      group.add(crown, tip, nape);
      for (const side of [1, -1]) {
        const lappet = new THREE.Mesh(new THREE.BoxGeometry(0.42 * r, 1.25 * r, 0.06 * r), flapFelt);
        lappet.position.set(0.05 * r, -0.5 * r, side * 1.12 * r);
        lappet.rotation.x = side * -0.12;
        group.add(lappet);
      }
      break;
    }
    case 'hanHelm': {
      // The Western Han lamellar hood (chinahelms.js HAN_HOOD), fitted over the head, its lamellae and lacing in its maps.
      if (!head.old && buildHanHood(group, head, r, steel, { lowDetail })) {
        fitted = true;
        break;
      }
      // A Western Han iron helmet (doumou), as the one from the King of Qi's
      // tomb at Linzi (2nd c. BC): a rounded cap of small iron lamellae laced
      // in overlapping rows to an iron crown boss, and a lamellar curtain over
      // the neck and cheeks, open at the face. Each row is a ring of flat
      // facets (one plate a facet), each set a little inside the row below.
      const iron = metal(steel, color).clone();
      iron.flatShading = true;
      const lacing = surface(head.lace ?? 0x3a2a20, { roughness: 0.9 });
      const plates = HAN_HELM.plates;
      // The cap: rows from the brow up to the crown, along a dome's profile.
      HAN_HELM.cap.forEach(([bottomRadius, topRadius, height, y], row) => {
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(topRadius * r, bottomRadius * r, height * r, plates, 1, true, row % 2 ? Math.PI / plates : 0), iron);
        ring.material.side = THREE.DoubleSide;
        ring.position.y = y * r;
        const lace = new THREE.Mesh(new THREE.TorusGeometry(bottomRadius * r * 0.99, 0.025 * r, 4, plates * 2), lacing);
        lace.rotation.x = Math.PI / 2;
        lace.position.y = (y - height * 0.32) * r;
        group.add(ring, lace);
      });
      const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42 * r, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), iron);
      crown.position.y = 1.28 * r;
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.14 * r, 10, 8), iron);
      boss.position.y = 1.7 * r;
      group.add(crown, boss);
      // The curtain: rows flaring from the rim down over the nape and cheeks, open over the face (+x).
      HAN_HELM.curtain.forEach(([topRadius, bottomRadius, height, y], row) => {
        const open = HAN_HELM.faceOpen;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(topRadius * r, bottomRadius * r, height * r, plates, 1, true, Math.PI / 2 + open / 2 + (row % 2 ? Math.PI / plates : 0), Math.PI * 2 - open), iron);
        ring.material.side = THREE.DoubleSide;
        ring.position.y = y * r;
        group.add(ring);
      });
      break;
    }
    case 'qingHelm': {
      // The Eight Banners' helmet (chinahelms.js QING_HELMS: `design`, its finish `finish`): the bowl drawn up into its
      // tall gilt tube and plume, fitted over the head; and the hood of the coat's own studded cloth hanging from it
      // over the ears and the neck to the shoulders, closer round the face than the Ming elite's flaps and hanging
      // near straight down, narrow under the narrow cone, bound in
      // the coat's binding (`trim`).
      buildMingDesignHelm(group, { ...head, design: head.design ?? 'bannerBowl' }, r, steel, { lowDetail });
      studdedHood(group, head, r, steel, { open: Math.PI * 0.36, trim: head.trim ?? null, top: 1.08, bottom: 1.32 });
      fitted = true;
      break;
    }
    case 'mingHelm': {
      // A Ming officer's helmet (the bowl of the 1500s–1600s): a tall pointed
      // steel bowl, swelling above the brow and drawn up to a finial tube,
      // riveted bands down it front, back and sides, a brow band, a spike
      // on the finial and the red horsehair tassel (hongying) bound under it,
      // falling round the finial over the bowl's top; padded cloth flaps
      // studded with rivets hanging from the rim over the cheeks and neck.
      const bowlSteel = metal(steel, color);
      const profile = [[1.12, 0.05], [1.15, 0.4], [1.08, 0.82], [0.9, 1.25], [0.64, 1.62], [0.37, 1.92], [0.17, 2.08], [0.1, 2.12]];
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 24), bowlSteel);
      bowl.material = bowlSteel.clone();
      bowl.material.side = THREE.DoubleSide;
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.13 * r, 0.07 * r, 6, 24), metal(steel, head.gold ?? 0xd6a743));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.1 * r;
      // The riveted bands: down the bowl's curve, a hair proud of it.
      const strap = metal(steel, new THREE.Color(color).multiplyScalar(0.7).getHex());
      for (let side = 0; side < 4; side += 1) {
        const turn = (side / 4) * Math.PI * 2;
        const path = new THREE.CatmullRomCurve3(profile.slice(0, -1).map(([x, y]) => new THREE.Vector3(Math.cos(turn) * (x + 0.04) * r, y * r, Math.sin(turn) * (x + 0.04) * r)));
        group.add(new THREE.Mesh(new THREE.TubeGeometry(path, 10, 0.05 * r, 4), strap));
      }
      const finial = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * r, 0.14 * r, 0.6 * r, 10), bowlSteel);
      finial.position.y = 2.32 * r;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05 * r, 0.7 * r, 8), bowlSteel);
      spike.position.y = 2.95 * r;
      group.add(bowl, band, finial, spike, hongying(r, HONGYING_MOUNTS.mingHelm, head.tassel, lowDetail));
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
        // The flaps: padded cloth open over the face (+x), from the rim to the
        // shoulders, rows of rivet heads over them (studdedHood).
        studdedHood(group, head, r, steel);
      }
      // Its decoration, where one was chosen (outfits.js ARMOUR_DECOR: the lion face and wings, or the guardians).
      if (head.decor) mingHelmDecor(group, head.decor, r, steel, profile, color);
      if (head.mask && !worldMask(group, head, r, steel, color)) {
        // A steel face mask from the brow to the chin, an eye slit across it.
        const mask = new THREE.Mesh(new THREE.SphereGeometry(1.12 * r, 18, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.44, Math.PI * 0.42), bowlSteel.clone());
        mask.material.side = THREE.DoubleSide;
        const slit = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.12 * r, 1.1 * r), surface(0x0b0b0d));
        slit.position.set(1.08 * r, 0.12 * r, 0);
        group.add(mask, slit);
      }
      break;
    }
    case 'proximityHood': {
      // A proximity (or fire-entry) hood over a firefighter's helmet and his breathing mask: a crown of aluminized cloth
      // standing off the head on the helmet, its bib falling over the shoulders under the coat's collar, and a broad
      // gold-coated visor in a dark rubber gasket across the face (it narrows his sight: outfits.js `sight`).
      const foil = foilMaterial(steel?.envMap ?? null, new THREE.Color(color).getHex(), head.quilted ? 'aluminizedQuilt' : 'aluminized');
      // One lathe from the bib's hem up (head radii: [radius, height]): the bib over the shoulders, the straight sides down
      // past the chin, the crown rounded over the helmet.
      const profile = [[2.25, -2.15], [2.05, -1.95], [1.7, -1.55], [1.52, -1.1], [1.5, -0.4], [1.5, 0.35], [1.44, 0.8], [1.25, 1.2], [0.9, 1.48], [0.45, 1.62], [0, 1.66]];
      const hood = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 28), foil);
      hood.scale.set(1.06, 1, 1);
      // The window across the face (a cylinder's angle 0 is +z, the front +x at π/2), in its gasket.
      const across = 1.95;
      const gasket = new THREE.Mesh(new THREE.CylinderGeometry(1.535 * r, 1.535 * r, 1.22 * r, 24, 1, true, Math.PI / 2 - (across + 0.14) / 2, across + 0.14), surface(0x16171a, { roughness: 0.6 }));
      gasket.scale.set(1.06, 1, 1);
      gasket.position.y = -0.12 * r;
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(1.56 * r, 1.56 * r, 1.04 * r, 24, 1, true, Math.PI / 2 - across / 2, across), new THREE.MeshStandardMaterial({ ...FOIL_PIECE.visor, envMap: steel?.envMap ?? null, envMapIntensity: 1.3 }));
      visor.scale.set(1.06, 1, 1);
      visor.position.y = -0.12 * r;
      visor.userData.noOutline = true;
      group.add(hood, gasket, visor);
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
  // Its metal (a moulded shell: all of it) wearing its tile's detail maps (detailmaps.js HELMET_TILES), not in a crowd.
  // Its laced parts first, one row of plates to a tier, laced as its people lace their lamellar (render.js's body cords).
  for (const [part, partTile] of Object.entries(partTiles)) {
    const cord = new THREE.Color((body.inputs && FACTIONS[factionOf(body.inputs)]?.lamellarCord) ?? head.lace ?? 0x141416);
    wearTile(group, partTile, { part, rows: 1, cords: [cord, cord] });
  }
  const tile = lowDetail ? null : HELMET_TILES[head.kind];
  if (tile) wearTile(group, tile, { moulded: MOULDED_TILES.has(tile) });
  // The hat's own stuff (detailmaps.js CLOTH_GARMENTS.head: felt, fur, feathers, cotton...) on its parts in its colour (or its
  // fur's), from the cloth atlas; its metal, plumes and trims as they were. Not in a crowd.
  const stuff = CLOTH_GARMENTS.head[head.kind];
  if (stuff && stuff !== 'none' && !lowDetail) {
    const own = new Set([color, head.fur].filter((value) => value !== undefined && value !== null).map((value) => new THREE.Color(value).getHex()));
    group.traverse((object) => {
      const material = object.isMesh ? object.material : null;
      if (material?.color && !(material.metalness > 0.5) && own.has(material.color.getHex())) clothPropMaterial(material, stuff);
    });
  }
  inkAll(group);
  // A helmet is a thin shell: drawn from both sides (toon.js doubleSided), so from under its brim or inside it is never a hole.
  doubleSided(group);
  // What swings (a tassel, a plume, feathers: chinahelmview.js), moved each frame by render.js.
  const swings = [];
  group.traverse((object) => object.userData.swing && swings.push(object.userData.swing));
  // An open-faced helmet (`openFace`) leaves the beard to be seen.
  return { group, hidesHair, showsBeard: Boolean(head.openFace && !head.maskDesign), fitted, swings };
}

// Saladin's helmet, in head radii: the bowl's lathe profile from its rim up
// (a little swelling, then drawn in to a point, as the 12th-century Syrian
// and Iranian bowls were), its ribs (`ribs`: the segments' joins, with
// `rivets` along each), the turban's coils [height, radius, thickness, tilt]
// wound round the bowl's foot, its tail down the back, and the mail
// aventail's rows from the rim down over neck and shoulders, open at the face.
// The Ottoman chichak drawn plainly (no design): its bowl's profile ([out, up] in head radii, from the band to the point),
// raised in an ogee to a tall point as on the Ottoman bowls of the 15th-16th centuries (the Askeri Müze's and Topkapı's),
// `flutes` shallow flutes round it standing `flute` of the radius, and its mail aventail `aventail` long.
const CHICHAK = {
  profile: [[1.17, 0], [1.2, 0.3], [1.16, 0.62], [1.04, 0.95], [0.84, 1.25], [0.58, 1.55], [0.32, 1.85], [0.14, 2.08], [0.04, 2.22], [0, 2.26]],
  sides: 32, flutes: 16, flute: 0.025, aventail: 1.25,
};

const AYYUBID_HELM = {
  bowl: [[1.17, -0.05], [1.2, 0.3], [1.14, 0.7], [0.98, 1.05], [0.74, 1.4], [0.46, 1.7], [0.2, 1.95], [0.05, 2.1]],
  ribs: 4,
  rivets: 5,
  finial: [0.07, 0.32],
  turban: [[0.02, 1.26, 0.2, 0.1], [0.3, 1.25, 0.21, -0.12], [0.56, 1.18, 0.19, 0.08], [0.78, 1.06, 0.15, -0.06]],
  tail: { width: 0.5, length: 1.7, from: 0.25 },
  // Rows: [top radius, bottom radius, height, centre y]; the face's opening (rad, centred on the front).
  aventail: [[1.16, 1.32, 0.42, -0.2], [1.3, 1.48, 0.42, -0.58], [1.46, 1.66, 0.42, -0.96]],
  faceOpen: Math.PI * 0.55,
  nasal: [0.1, 0.95],
};

/**
 * Saladin's helmet: a pointed bowl of riveted segments with a small finial
 * and a nasal, a turban wound round its foot (the tail falling behind), and
 * a mail aventail in rows from the rim to the shoulders, open at the face.
 */
function buildAyyubidHelm(group, head, r, steel, color) {
  const spec = AYYUBID_HELM;
  const iron = metal(steel, color);
  const gilt = metal(steel, head.gold ?? 0xc9a23a);
  const bowl = new THREE.Mesh(new THREE.LatheGeometry(spec.bowl.map(([x, y]) => new THREE.Vector2(x * r, y * r)), 28), iron);
  group.add(bowl);
  // The ribs: gilt strips over the segments' joins, following the bowl up to the point, riveted.
  const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045 * r, 6, 4), gilt, spec.ribs * spec.rivets);
  const place = new THREE.Object3D();
  let at = 0;
  for (let rib = 0; rib < spec.ribs; rib += 1) {
    const angle = (rib / spec.ribs) * Math.PI * 2 + Math.PI / spec.ribs;
    const out = (x) => [Math.cos(angle) * x * 1.02 * r, Math.sin(angle) * x * 1.02 * r];
    // A pivot turned to this rib's side of the bowl (its x outward), the strips laid along the profile in it.
    const pivot = new THREE.Group();
    pivot.rotation.y = -angle;
    for (let index = 1; index < spec.bowl.length; index += 1) {
      const [x0, y0] = spec.bowl[index - 1];
      const [x1, y1] = spec.bowl[index];
      const length = Math.hypot(x1 - x0, y1 - y0) * r;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03 * r, length * 1.04, 0.12 * r), gilt);
      strip.position.set(((x0 + x1) / 2) * 1.02 * r, ((y0 + y1) / 2) * r, 0);
      strip.rotation.z = -Math.atan2(x1 - x0, y1 - y0);
      pivot.add(strip);
    }
    group.add(pivot);
    for (let rivet = 0; rivet < spec.rivets; rivet += 1) {
      const u = 1 + rivet * 1.0;
      const [x, y] = spec.bowl[Math.min(spec.bowl.length - 1, Math.round(u))];
      const [px, pz] = out(x * 1.01);
      place.position.set(px, y * r, pz);
      place.updateMatrix();
      studs.setMatrixAt(at, place.matrix);
      at += 1;
    }
  }
  group.add(studs);
  const [finialRadius, finialHeight] = spec.finial;
  const finial = new THREE.Mesh(new THREE.ConeGeometry(finialRadius * r, finialHeight * r, 8), gilt);
  finial.position.y = (spec.bowl.at(-1)[1] + finialHeight / 2 - 0.02) * r;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(finialRadius * 1.2 * r, 8, 6), gilt);
  knob.position.y = (spec.bowl.at(-1)[1] - 0.02) * r;
  group.add(finial, knob);
  // The nasal, riveted under the turban at the brow, down over the nose.
  const [nasalWidth, nasalLength] = spec.nasal;
  const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, nasalLength * r, nasalWidth * r), iron);
  nasal.position.set(1.2 * r, (0.02 - nasalLength / 2) * r, 0);
  nasal.rotation.z = 0.06;
  group.add(nasal);
  // The turban: coils of cloth wound round the bowl's foot, each a little across the last.
  if (head.turban) {
    const cloth = surface(new THREE.Color(head.turban).getHex(), { roughness: 0.9 });
    for (const [y, radius, thick, tilt] of spec.turban) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(radius * r, thick * r, 8, 26), cloth);
      coil.rotation.set(Math.PI / 2, tilt, 0);
      coil.position.y = y * r;
      coil.scale.set(1, 1, 0.9);
      group.add(coil);
    }
    // The tail (ʿadhaba) tucked in behind and falling down the back of the neck.
    const tailCloth = cloth.clone();
    tailCloth.side = THREE.DoubleSide;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, spec.tail.length * r, spec.tail.width * r), tailCloth);
    // Falling clear of the aventail as it flares: its foot further back than its top.
    tail.position.set(-1.56 * r, (spec.tail.from - spec.tail.length / 2) * r, 0.12 * r);
    tail.rotation.z = -0.24;
    group.add(tail);
  }
  // The aventail: rows of mail, each a shade apart so the rows read, open at the face.
  const mail = new THREE.Color(head.mail ?? 0x7c8087);
  spec.aventail.forEach(([top, bottom, height, y], row) => {
    const material = metal(steel, mail.clone().multiplyScalar(row % 2 ? 0.82 : 1));
    material.side = THREE.DoubleSide;
    material.roughness = 0.55;
    const open = spec.faceOpen;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(top * r, bottom * r, height * r, 26, 1, true, Math.PI / 2 + open / 2, Math.PI * 2 - open), material);
    band.position.y = y * r;
    group.add(band);
  });
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
  // Above them, round the back and sides only (the front left open for the eyes), tiers up under the bowl's rim:
  // [height, radius, roll, open where the angle's cosine from the front is above this].
  crown: [[0.14, 1.36, 0.12, 0.5], [0.5, 1.28, 0.08, 0.5]],
  plates: 30,
  plate: [0.32, 0.5],
};

/**
 * The Iron Pagoda's helmet (the Jin heavy horse of the 1120s–40s, as
 * reconstructed): a tall steel bowl rising to a point, a spike finial with
 * a plume (dark feathers) or a horsehair tassel falling behind, a riveted
 * brow peak; and the aventail, tiers of small dotted iron plates rolled up
 * round the neck and chin to just under the eyes, so only the eyes show.
 * The aventail's plates are instanced: dozens of them for the cost of two meshes;
 * or (`laced`, where the detail maps draw them) each tier one band marked as the
 * aventail (`userData.helmPart`), wearing a row of the laced lamellae's tile.
 */
function buildPagodaHelm(group, head, r, steel, color, { laced = false } = {}) {
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
  // The tiers round the neck and chin, then those up the back of the head to the rim.
  const tiers = [...spec.aventail.map(([y, radius, roll]) => [y, radius, roll, 2]), ...spec.crown];
  tiers.forEach(([y, radius, roll, openFrom], tier) => {
    const partial = openFrom <= 1;
    // Just inside the plates, rolled out at the foot as they are.
    const flare = Math.sin(roll) * (spec.plate[1] / 2);
    // A part tier's backing runs round the back only (cylinder angle 0 is +z; the front, +x, is at π/2).
    const open = partial ? Math.acos(openFrom) : 0;
    const band = new THREE.Mesh(new THREE.CylinderGeometry((radius - flare - 0.07) * r, (radius + flare - 0.07) * r, spec.plate[1] * r, 28, 1, true, Math.PI / 2 + open, Math.PI * 2 - open * 2), backing);
    band.position.y = y * r;
    band.userData.noOutline = true;
    group.add(band);
    if (laced) {
      // The tier as one band of plates, flared at its foot as the plates are, the tile's row on it.
      const tierBand = new THREE.Mesh(new THREE.CylinderGeometry((radius - flare) * r, (radius + flare) * r, spec.plate[1] * r, 40, 1, true, Math.PI / 2 + open, Math.PI * 2 - open * 2), plateMaterial);
      tierBand.position.y = y * r;
      tierBand.userData.noOutline = true;
      tierBand.userData.helmPart = 'aventail';
      group.add(tierBand);
      return;
    }
    for (let index = 0; index < spec.plates; index += 1) {
      const angle = ((index + (tier % 2) * 0.5) / spec.plates) * Math.PI * 2;
      const ahead = Math.cos(angle);
      if (ahead > openFrom) continue;
      holder.position.set(ahead * radius * r, y * r, -Math.sin(angle) * radius * r);
      // Face outward, the foot rolled out from the neck.
      holder.rotation.set(0, angle + Math.PI / 2, 0);
      holder.rotateX(-roll);
      holder.updateMatrix();
      placements.push(holder.matrix.clone());
    }
  });
  if (laced) return;
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

// The Ming helmet's red tassel (hongying): a hank of horsehair dyed red, bound round the finial's spike and falling all
// round it over the top of the bowl; every Ming helmet bore one, the soldier's iron hat and the officer's tall bowl alike.
// Drawn as strands of hair (chinahelmview.js buildTassel, chinahelms.js TASSELS.hongying) that swing as the head moves.

/**
 * Padded cloth flaps hanging from a helmet's rim over the cheeks, the ears and the neck to the shoulders, open over the face
 * (+x) by `open` (rad), flaring from `top` to `bottom` (head radii), rows of rivet heads over them (one instanced mesh): the Ming elite's, of the coat's own stuff (its
 * cloth, or its steel, `flapSteel`, where the coat is scale), and the banners' hood (`qingHelm`), its edges bound in the
 * coat's binding (`trim`) where it has one.
 */
function studdedHood(group, head, r, steel, { open = Math.PI * 0.5, trim = null, top = 1.2, bottom = 1.75 } = {}) {
  const start = Math.PI / 2 + open / 2;
  const span = Math.PI * 2 - open;
  const [tall, at] = [1.4, -0.6];
  const coif = new THREE.Mesh(new THREE.CylinderGeometry(top * r, bottom * r, tall * r, 22, 3, true, start, span), head.flapSteel ? metal(steel, new THREE.Color(head.coif).getHex()).clone() : surface(head.coif ?? 0x1f2a4a, { roughness: 0.85 }));
  coif.material.side = THREE.DoubleSide;
  coif.position.y = at * r;
  const rows = 3;
  const columns = 11;
  const studs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06 * r, 6, 4), metal(steel, head.gold ?? 0xd6a743), rows * columns);
  const place = new THREE.Object3D();
  let stud = 0;
  for (let row = 0; row < rows; row += 1) {
    const down = (row + 0.6) / (rows + 0.4);
    const radius = (top + (bottom - top) * down + 0.03) * r;
    for (let column = 0; column < columns; column += 1) {
      const theta = start + span * ((column + 0.5 + (row % 2) * 0.5) / (columns + 0.5));
      place.position.set(Math.sin(theta) * radius, (0.1 - tall * down) * r, Math.cos(theta) * radius);
      place.updateMatrix();
      studs.setMatrixAt(stud, place.matrix);
      stud += 1;
    }
  }
  studs.userData.noOutline = true;
  group.add(coif, studs);
  if (!trim) return;
  // The binding: a band round the hem, and down both edges of the face's opening.
  const bound = surface(trim, { roughness: 0.85 });
  const hem = new THREE.Mesh(new THREE.CylinderGeometry((bottom - 0.02) * r, (bottom + 0.03) * r, 0.14 * r, 22, 1, true, start, span), bound);
  hem.material.side = THREE.DoubleSide;
  hem.position.y = (at - tall / 2 + 0.07) * r;
  group.add(hem);
  for (const theta of [start, start + span]) {
    const from = new THREE.Vector3(Math.sin(theta) * (top + 0.02) * r, (at + tall / 2) * r, Math.cos(theta) * (top + 0.02) * r);
    const to = new THREE.Vector3(Math.sin(theta) * (bottom + 0.02) * r, (at - tall / 2) * r, Math.cos(theta) * (bottom + 0.02) * r);
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * r, 0.06 * r, from.distanceTo(to), 6), bound);
    edge.position.copy(from).add(to).multiplyScalar(0.5);
    edge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    group.add(edge);
  }
}

/**
 * A red horsehair tassel bound to a helmet's spike where its mount says (chinahelms.js HONGYING_MOUNTS: `top`, `length`,
 * the `hull` it is kept out of as it swings); still in a crowd (`lowDetail`).
 */
function hongying(r, { top, length, hull }, colour = TASSELS.hongying.colour, lowDetail = false) {
  const spec = lowDetail ? { ...TASSELS.hongying, length, count: 16 } : { ...TASSELS.hongying, length };
  return buildTassel(spec, r, { at: [0, top, 0], hull, still: lowDetail, colour });
}

// The Ming officer's helmet's two decorations (outfits.js ARMOUR_DECOR tunshou, guardians), in head radii on its bowl
// (`profile` [radius, y] up the lathe):
// - tunshou: the gilt lion face (吞兽) on the brow (`plaque`: its radius and height), gilt wings rising at each side
//   (`wing`: feathers, their lengths), a gilt cap over the finial's foot, and two small spear-pointed pennons (`pennon`:
//   their poles' height and the flag) beside the red tassel: the Ming generals' helmets of 出警入跸图 and their
//   reconstructions (the user's drawing).
// - guardians: gilt bands down the seams from finial to brim (`bands`), a gilt guardian (门神) on each panel between them
//   (`figure`: its height up the bowl), a gilt band round the foot, a wide black brim edged in gilt cloud scrolls
//   (`brim`: its reach and the scrolls), and a seated gilt figure on the finial between two cloud curls: the black-lacquered
//   ray-skin parade helmets (the user's photograph of a reconstruction, after the Dingling and Mu family helmets).
const MING_DECOR = {
  tunshou: { plaque: { r: 0.36, y: 0.62 }, wing: { feathers: 6, length: [0.75, 1.35], y: 0.42 }, pennon: { height: 1.0, flag: [0.36, 0.24], colour: '#cfd6dc' } },
  guardians: { bands: 8, figure: { y: 0.92, height: 0.5 }, brim: { reach: 0.62, scrolls: 22 }, footBand: [0.05, 0.36] },
};

/** The decoration of a Ming officer's helmet (MING_DECOR) over its bowl (`profile`), its brim in the bowl's `color`. */
function mingHelmDecor(group, decor, r, steel, profile, color) {
  const gilt = metal(steel, decor.gold ?? 0xd6a743);
  const radiusAt = (y) => {
    for (let index = 1; index < profile.length; index += 1) {
      const [x0, y0] = profile[index - 1];
      const [x1, y1] = profile[index];
      if (y <= y1) return x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
    return profile.at(-1)[0];
  };
  const add = (mesh) => {
    group.add(mesh);
    return mesh;
  };
  const top = profile.at(-1)[1];
  if (decor.kind === 'tunshou') {
    const spec = MING_DECOR.tunshou;
    // The lion's face on the brow: a gilt boss, its mane a ring round it, brows, eyes, the snout and the fangs.
    const plaque = new THREE.Group();
    const { r: size, y } = spec.plaque;
    plaque.position.set(radiusAt(y) * r, y * r, 0);
    plaque.rotation.z = -0.12;
    const disc = new THREE.Mesh(new THREE.SphereGeometry(size * r, 14, 10), gilt);
    disc.scale.set(0.28, 1, 1.1);
    plaque.add(disc);
    const mane = new THREE.Mesh(new THREE.TorusGeometry(size * 0.92 * r, 0.06 * r, 6, 18), gilt);
    mane.rotation.y = Math.PI / 2;
    mane.scale.set(1, 1, 1.1);
    plaque.add(mane);
    const lump = (radius, at, scale = [1, 1, 1]) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius * r, 8, 6), gilt);
      mesh.position.set(...at.map((value) => value * r));
      mesh.scale.set(...scale);
      plaque.add(mesh);
    };
    for (const side of [1, -1]) {
      lump(0.07, [0.1, 0.08, 0.13 * side]);
      lump(0.08, [0.07, 0.17, 0.15 * side], [0.6, 0.5, 1.4]);
      lump(0.03, [0.1, -0.2, 0.08 * side], [1, 1.6, 1]);
    }
    lump(0.09, [0.13, -0.07, 0], [1.2, 0.8, 1.2]);
    lump(0.07, [0.08, -0.22, 0], [0.8, 0.5, 2.2]);
    add(plaque);
    // The wings at the sides: a fan of gilt feathers each side, rising and curling back.
    const { feathers, length, y: wingY } = spec.wing;
    for (const side of [1, -1]) {
      for (let index = 0; index < feathers; index += 1) {
        const share = index / (feathers - 1);
        const long = (length[0] + (length[1] - length[0]) * (1 - Math.abs(share - 0.6))) * r;
        const feather = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), gilt);
        feather.scale.set(0.12 * r, long, 0.035 * r);
        feather.position.y = long / 2;
        const pivot = new THREE.Group();
        pivot.position.set(0.15 * r, wingY * r, side * radiusAt(wingY) * r);
        pivot.rotation.set(side * (0.15 + share * 0.45), 0, 0.5 - share * 0.85);
        pivot.add(feather);
        add(pivot);
      }
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.13 * r, 10, 8), gilt);
      boss.scale.set(1, 1, 0.45);
      boss.position.set(0.15 * r, wingY * r, side * (radiusAt(wingY) + 0.03) * r);
      add(boss);
    }
    // The gilt cap over the finial's foot, and the two pennons beside the tassel.
    const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3 * r, 0.42 * r, 0.22 * r, 14), gilt));
    cap.position.y = (top - 0.1) * r;
    const { height, flag, colour } = spec.pennon;
    const cloth = surface(new THREE.Color(colour).getHex(), { roughness: 0.8 });
    cloth.side = THREE.DoubleSide;
    for (const side of [1, -1]) {
      const pole = add(new THREE.Mesh(new THREE.CylinderGeometry(0.018 * r, 0.018 * r, height * r, 5), gilt));
      pole.position.set(0, (top + height / 2) * r, side * 0.32 * r);
      const point = add(new THREE.Mesh(new THREE.ConeGeometry(0.045 * r, 0.16 * r, 5), steel));
      point.position.set(0, (top + height + 0.08) * r, side * 0.32 * r);
      const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-flag[0], -flag[1] * 0.3), new THREE.Vector2(-flag[0] * 0.7, -flag[1] * 0.55), new THREE.Vector2(-flag[0], -flag[1]), new THREE.Vector2(0, -flag[1] * 0.75)].map((v) => v.multiplyScalar(r)));
      const pennant = add(new THREE.Mesh(new THREE.ShapeGeometry(shape), cloth));
      pennant.position.set(-0.01 * r, (top + height - 0.04) * r, side * 0.32 * r);
      pennant.rotation.y = side * 0.5;
    }
    return;
  }
  const spec = MING_DECOR.guardians;
  // Gilt bands down every seam, a hair proud of the bowl, from under the finial to the foot.
  for (let band = 0; band < spec.bands; band += 1) {
    const turn = (band / spec.bands) * Math.PI * 2;
    const path = new THREE.CatmullRomCurve3(profile.slice(0, -1).map(([x, y]) => new THREE.Vector3(Math.cos(turn) * (x + 0.05) * r, y * r, Math.sin(turn) * (x + 0.05) * r)));
    add(new THREE.Mesh(new THREE.TubeGeometry(path, 12, 0.07 * r, 4), gilt));
  }
  // A guardian on each panel between the bands: robe, head and the halberd up beside him, in gilt relief.
  const { y: figureY, height } = spec.figure;
  for (let panel = 0; panel < spec.bands; panel += 1) {
    const turn = ((panel + 0.5) / spec.bands) * Math.PI * 2;
    const figure = new THREE.Group();
    const out = radiusAt(figureY) + 0.02;
    figure.position.set(Math.cos(turn) * out * r, figureY * r, Math.sin(turn) * out * r);
    figure.rotation.set(0, -turn, -0.18);
    const robe = new THREE.Mesh(new THREE.ConeGeometry(0.11 * r, height * 0.75 * r, 6), gilt);
    robe.scale.set(0.35, 1, 0.35);
    figure.add(robe);
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06 * r, 8, 6), gilt);
    headMesh.position.y = height * 0.45 * r;
    figure.add(headMesh);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * r, 0.012 * r, height * r, 4), gilt);
    staff.position.set(0, height * 0.1 * r, 0.1 * r);
    figure.add(staff);
    add(figure);
  }
  // The gilt band round the foot.
  const [from, to] = spec.footBand;
  const foot = add(new THREE.Mesh(new THREE.CylinderGeometry((radiusAt(to) + 0.03) * r, (radiusAt(from) + 0.03) * r, (to - from) * r, 28, 1, true), gilt));
  foot.material = gilt.clone();
  foot.material.side = THREE.DoubleSide;
  foot.position.y = ((from + to) / 2) * r;
  // The wide black brim, edged in gilt cloud scrolls.
  const { reach, scrolls } = spec.brim;
  const inner = radiusAt(from);
  const brim = add(new THREE.Mesh(new THREE.RingGeometry(inner * r, (inner + reach) * r, 36, 1), metal(steel, new THREE.Color(color).getHex())));
  brim.material.side = THREE.DoubleSide;
  brim.rotation.x = -Math.PI / 2;
  brim.position.y = from * r;
  const edge = add(new THREE.Mesh(new THREE.TorusGeometry((inner + reach) * r, 0.04 * r, 5, 40), gilt));
  edge.rotation.x = Math.PI / 2;
  edge.position.y = from * r;
  for (let scroll = 0; scroll < scrolls; scroll += 1) {
    const turn = (scroll / scrolls) * Math.PI * 2;
    const curl = add(new THREE.Mesh(new THREE.TorusGeometry(0.07 * r, 0.02 * r, 4, 10, Math.PI * 1.4), gilt));
    curl.rotation.x = -Math.PI / 2;
    curl.position.set(Math.cos(turn) * (inner + reach - 0.09) * r, (from + 0.015) * r, Math.sin(turn) * (inner + reach - 0.09) * r);
  }
  // The seated figure on the finial, between two cloud curls.
  const seat = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2 * r, 0.24 * r, 0.12 * r, 12), gilt));
  seat.position.y = (top + 0.48) * r;
  const body = add(new THREE.Mesh(new THREE.SphereGeometry(0.17 * r, 10, 8), gilt));
  body.scale.set(1, 1.15, 1.1);
  body.position.y = (top + 0.7) * r;
  const crown = add(new THREE.Mesh(new THREE.SphereGeometry(0.08 * r, 8, 6), gilt));
  crown.position.y = (top + 0.95) * r;
  for (const side of [1, -1]) {
    const cloud = add(new THREE.Mesh(new THREE.TorusGeometry(0.11 * r, 0.03 * r, 5, 12, Math.PI * 1.5), gilt));
    cloud.position.set(0, (top + 0.62) * r, side * 0.34 * r);
    cloud.rotation.y = Math.PI / 2;
  }
}

/** A knight's helmet's part as a mesh (knighthelms.js knightGrid: leaned as its design leans), its coordinates in its region of the sheet. */
function knightMesh(form, part, material) {
  const { positions, uvs, indices } = knightGrid(form, part);
  const rect = part.region ? form.regions[part.region] : null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(rect ? uvs.map((value, index) => (index % 2 === 0 ? rect[0] + value * (rect[2] - rect[0]) : rect[1] + value * (rect[3] - rect[1]))) : uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

/**
 * A knight's helmet in a design (knighthelms.js: the unit's own `head.design`, else `#knighthelm`), each part a measured
 * surface scaled to `r` wearing the design's sheet (the sights and breaths cut out), the dark arming cap inside, the mail
 * aventail or the coif (`head.coif`) below; a crowd's man in the same helmet. False for none or where the maps are not there
 * (drawn as before).
 */
function buildKnightHelm(group, head, r, iron) {
  const form = knightFormOf(head.kind, HELM_STYLE.knight, head.design);
  if (!form || !helmMapsReady() || !helmMapSheet(form.sheet)) return false;
  // The mail aventail is not gilt with the plates (render.js `userData.decor`).
  const mailIron = iron.userData.decor ? Object.assign(iron.clone(), { userData: { ...iron.userData, decor: null } }) : iron;
  for (const [name, part] of Object.entries(form.parts)) {
    const side = part.double ? THREE.DoubleSide : THREE.FrontSide;
    const material = part.look === 'liner' ? surface(0x0d0c0b, { roughness: 1 }) : helmMaterial(part.look === 'mail' ? mailIron : iron, form.sheet, { side, cut: !!form.cut });
    const mesh = knightMesh(form, part, material);
    mesh.name = `helm-${name}`;
    mesh.scale.setScalar(r);
    if (part.look === 'liner') mesh.userData.noOutline = true;
    group.add(mesh);
  }
  // The great helm over the Templar's mail coif.
  if (head.coif && !form.parts.aventail) {
    const coif = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.36 * r, 0.8 * r, 18, 1, true), surface(new THREE.Color(head.coif).getHex(), { roughness: 0.9 }));
    coif.material.side = THREE.DoubleSide;
    coif.position.y = -1.72 * r;
    group.add(coif);
  }
  return true;
}

/**
 * The design a helmet is drawn in (helmforms.js DESIGN_FORMS), or null (drawn as before): none under `#kettle=now`; a
 * kettle hat in the one `#kettle=a|b|c` asks for; otherwise the wearer's own (`head.design`), a crowd's man's too.
 */
function helmDesignOf(head) {
  if (HELM_STYLE.kettle === 'now') return null;
  const choice = head.kind === 'kettleHat' && HELM_STYLE.kettle !== 'own' ? HELM_STYLE.kettle : head.design;
  return choice ? designFormOf(head.kind, choice) : null;
}

/**
 * A helmet in a design (helmforms.js DESIGN_FORMS): each part a measured surface in head radii scaled to `r`,
 * wearing its sheet (rivets, turned edges, flutes, the sights and openings cut out). False where the maps are not there
 * (the helmet is drawn as before).
 */
function buildDesignHelm(group, form, r, iron, { bevor = true } = {}) {
  if (!helmMapsReady() || !helmMapSheet(form.sheet)) return false;
  const regions = form.regions;
  for (const [name, part] of Object.entries(form.parts)) {
    // (A sallet may be worn without its bevor: an archer's.)
    if (name === 'bevor' && !bevor) continue;
    const material = helmMaterial(iron, form.sheet, { side: part.double ? THREE.DoubleSide : THREE.FrontSide, cut: !!form.cut });
    const mesh = formMesh(part, regions[part.region], material);
    mesh.name = `helm-${name}`;
    mesh.scale.setScalar(r);
    group.add(mesh);
  }
  return true;
}

/** Steel of another colour, polished like the rest. */
function metal(steel, hex) {
  const material = steel.clone();
  material.color = new THREE.Color(hex);
  return material;
}

// Shaguma's hair (an oni's mane: dyed yak or bear hair set into the kabuto, as on Uesugi and Ii retainers' helmets): the
// steel bowl left showing and the hair growing out of it, from the crown down the sides and back, standing out from
// the bowl and falling over the neck guard to the shoulders, wild and uneven; never across the face.
const SHAGUMA = { locks: 220, width: 0.13, length: [1.8, 3.7], lift: 0.25, droop: 4.2, segments: 7 };

/** The hair growing out of the kabuto's bowl (KABUTO_FORM): one mesh of tapering strands, greys varied lock by lock. */
function shagumaHair(form, r, colour) {
  const base = new THREE.Color(colour);
  const positions = [];
  const colours = [];
  const indices = [];
  // A fixed sequence, so every fighter's mane is the same hair.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let lock = 0; lock < SHAGUMA.locks; lock += 1) {
    const side = lock % 2 ? 1 : -1;
    // Round from over the brow's corner (u 0.14: the face kept clear) to the nape (u 1), up from near the foot to the crown.
    const u = 0.14 + 0.86 * random();
    const v = 0.3 + 0.62 * Math.sqrt(random());
    const root = formPoint(form.bowl, u, v).map((value) => value * r);
    root[2] *= side;
    const outward = new THREE.Vector3(root[0], root[1] - 0.2 * r, root[2]).normalize();
    // Longer behind than at the temples; the crown's locks stand up before they fall.
    const length = (SHAGUMA.length[0] + (SHAGUMA.length[1] - SHAGUMA.length[0]) * (0.35 + 0.65 * u) * (0.6 + 0.4 * random())) * r;
    const lift = SHAGUMA.lift * (random() - 0.35);
    const grey = base.clone().offsetHSL(0, 0, (random() - 0.5) * 0.22);
    const first = positions.length / 3;
    let at = new THREE.Vector3(...root);
    // Out from the bowl at first, a crown lock a little up or down, then falling.
    let heading = new THREE.Vector3(outward.x, outward.y * 0.45 + lift, outward.z).normalize();
    for (let step = 0; step <= SHAGUMA.segments; step += 1) {
      const t = step / SHAGUMA.segments;
      // The strand's breadth across it, flat to the bowl: tangent to the outward direction and the heading.
      const across = new THREE.Vector3().crossVectors(heading, outward).normalize();
      if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
      const half = SHAGUMA.width * r * (1 - 0.85 * t) * (0.7 + 0.6 * random());
      positions.push(at.x - across.x * half, at.y - across.y * half, at.z - across.z * half, at.x + across.x * half, at.y + across.y * half, at.z + across.z * half);
      const shade = grey.clone().multiplyScalar(0.45 + 0.3 * t);
      colours.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
      if (step < SHAGUMA.segments) {
        const a = first + step * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      // Each segment bends the strand down under its weight and a little outward, with a kink of its own.
      at = at.clone().addScaledVector(heading, length / SHAGUMA.segments);
      heading = heading.clone()
        .addScaledVector(new THREE.Vector3(0, -1, 0), SHAGUMA.droop / SHAGUMA.segments)
        .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z), 0.5 / SHAGUMA.segments)
        .add(new THREE.Vector3((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3))
        .normalize();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const mane = new THREE.Mesh(geometry, material);
  mane.userData.noOutline = true;
  return mane;
}

/** A path of points over the kabuto's fitted bowl (helmforms.js formPoint: u round from the face, v up), a little proud of it. */
const overBowl = (form, r, points, out = 1.012) => new THREE.CatmullRomCurve3(points.map(([u, v]) => new THREE.Vector3(...formPoint(form.bowl, u, v).map((value, axis) => value * r * (axis === 1 ? 1 : out)))));

// The Nanban kabuto's skull (the British Museum's, c. 1600; the Met's 36.25.88): a European cabasset's, raised in one piece to
// a point over the crown with a ridge fore and aft, set on a narrow brim; [radius, height] up its outline (head radii, before
// it is drawn in to the bowl's oval), the brim's reach, and the lining rivets' row round its foot.
const NANBAN_SKULL = {
  outline: [[1.16, 0.12], [1.15, 0.4], [1.08, 0.78], [0.92, 1.18], [0.66, 1.58], [0.36, 1.92], [0.1, 2.14], [0, 2.18]],
  brim: 0.3, rivets: 14, rivetY: 0.24,
};

/** The Nanban kabuto's skull: a lathe of NANBAN_SKULL's outline drawn in to the bowl's oval, its brim and its rivets. */
function nanbanSkull(r, material) {
  const spec = NANBAN_SKULL;
  const oval = KABUTO_FORM.side / KABUTO_FORM.front;
  const skull = new THREE.Mesh(new THREE.LatheGeometry(spec.outline.map(([radius, y]) => new THREE.Vector2(radius * r, y * r)).reverse(), 24), material);
  skull.scale.z = oval;
  const [footRadius, footY] = spec.outline[0];
  const brimMaterial = material.clone();
  brimMaterial.side = THREE.DoubleSide;
  // The brim: out nearly level, its edge turned down.
  const brim = new THREE.Mesh(new THREE.LatheGeometry([[footRadius - 0.02, footY + 0.02], [footRadius + spec.brim, footY - 0.07], [footRadius + spec.brim + 0.02, footY - 0.13]].map(([radius, y]) => new THREE.Vector2(radius * r, y * r)), 28), brimMaterial);
  // The ridge fore and aft over the point, and the lining's rivets round the foot.
  const ridge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spec.outline.slice(1).concat(spec.outline.slice(1, -1).reverse().map(([radius, y]) => [-radius, y])).map(([radius, y]) => new THREE.Vector3(radius * r * 1.005, y * r, 0))), 24, 0.03 * r, 4, false), material);
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045 * r, 6, 4), material, spec.rivets);
  const place = new THREE.Object3D();
  for (let index = 0; index < spec.rivets; index += 1) {
    const angle = (index / spec.rivets) * Math.PI * 2;
    place.position.set(Math.cos(angle) * 1.15 * r, spec.rivetY * r, Math.sin(angle) * 1.15 * r);
    place.updateMatrix();
    rivets.setMatrixAt(index, place.matrix);
  }
  skull.add(brim, ridge, rivets);
  return skull;
}

/**
 * The kabuto's bowl in each construction (outfits.js `head.design`; none, the suji-bachi), and what it is dressed with
 * over the fitted bowl (`dress`): whether it has the peak (mabizashi) over the brow (`peak`).
 * - suji: the suji-bachi of the 16th c., plates riveted edge over edge, each join a standing rib (suji) gilt, the tehen's
 *   ring at the crown.
 * - nanban: the Nanban kabuto, a European cabasset's skull bought or copied from the Portuguese (nanbanSkull): one piece of
 *   thicker steel, no seams for a blow to open, its brim in place of the peak.
 * - zunari: the "head-shaped" bowl of three plain plates, the cheap strong helmet of the 1600s, its seam along the crown and
 *   its brow embossed in a scowl's wrinkles (the Met's zunari kabuto with menpo, 17th c.).
 */
const KABUTO_BOWLS = {
  suji: {
    peak: true,
    dress(group, { form, r, gold }) {
      for (let rib = 0; rib < 12; rib += 1) {
        const u = rib / 6 - (rib > 6 ? 2 : 0);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(overBowl(form, r, Array.from({ length: 9 }, (_, step) => [u, (step / 8) * 0.9])), 16, 0.025 * r, 4, false), gold));
      }
      const crown = new THREE.Mesh(new THREE.TorusGeometry(0.22 * r, 0.05 * r, 6, 14), gold);
      crown.rotation.x = Math.PI / 2;
      crown.position.y = (form.top - 0.03) * r;
      group.add(crown);
    },
  },
  nanban: { peak: false, dress() {} },
  zunari: {
    peak: true,
    dress(group, { form, r, bowlSteel }) {
      // The seam down the crown from brow to nape, and three wrinkles across the brow, rising to the temples.
      group.add(new THREE.Mesh(new THREE.TubeGeometry(overBowl(form, r, [[0, 0.12], [0, 0.4], [0, 0.7], [0, 0.94], [1, 0.94], [1, 0.7], [1, 0.4], [1, 0.12]]), 16, 0.03 * r, 4, false), bowlSteel));
      for (const v of [0.13, 0.22, 0.31]) {
        const wrinkle = Array.from({ length: 9 }, (_, step) => {
          const u = -0.3 + (step / 8) * 0.6;
          return [u, v + 0.08 * Math.abs(u) / 0.3];
        });
        group.add(new THREE.Mesh(new THREE.TubeGeometry(overBowl(form, r, wrinkle, 1.008), 16, 0.035 * r, 4, false), bowlSteel));
      }
    },
  },
};

/**
 * A samurai's kabuto, head coordinates (x forward, y up, z left; r the head
 * radius): a ribbed bowl, the shikoro (tiers of laced lames flaring down
 * over the neck), fukigaeshi turned back beside the face, a crest at the
 * brow, and perhaps a menpo over the lower face. The bowl is an oval dome
 * fitted over the head (helmforms.js KABUTO_FORM), longer than it is broad;
 * the shikoro hangs from its foot, oval as it is, rounding out as it flares.
 */
function buildKabuto(group, head, r, steel, color) {
  const bowlSteel = metal(steel, color);
  const gold = metal(steel, head.gold ?? 0xd6a743);
  const lace = surface(head.lace ?? 0x1d2a4f);
  const form = KABUTO_FORM;
  const { positions, uvs, indices } = formGrid(form.bowl);
  const bowlGeometry = new THREE.BufferGeometry();
  bowlGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions.map((value) => value * r), 3));
  bowlGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  bowlGeometry.setIndex(indices);
  bowlGeometry.computeVertexNormals();
  // The bowl in its construction (KABUTO_BOWLS): the suji-bachi's riveted plates, the Nanban's one-piece skull, the zunari.
  const build = KABUTO_BOWLS[head.design] ?? KABUTO_BOWLS.suji;
  const bowl = build === KABUTO_BOWLS.nanban ? nanbanSkull(r, bowlSteel) : new THREE.Mesh(bowlGeometry, bowlSteel);
  bowl.name = 'kabuto-bowl';
  group.add(bowl);
  build.dress(group, { form, r, gold, bowlSteel, steel });
  // Shikoro: tiers widening down and out, open at the face (`flare`: the
  // early great armour's flared out wide over the shoulders, `tiers` of it).
  // Each tier's radius front to back (x) and side to side (z): from just
  // inside the bowl's foot, wider by the same each tier.
  const flare = head.flare ?? 0;
  const shikoro = (tier) => {
    const out = tier * (0.18 + flare) - 0.04;
    return { x: (form.back + out) * r, z: (form.side + out) * r };
  };
  for (let tier = 0; tier < (head.tiers ?? 4); tier += 1) {
    const { x: top, z: topZ } = shikoro(tier);
    const bottom = top + (0.2 + flare) * r;
    const narrow = topZ / top;
    // Cylinder angles start at +z (the left); the open part faces +x, the front.
    const lame = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, 0.26 * r, 22, 1, true, Math.PI * 0.82, Math.PI * 1.36), bowlSteel);
    lame.material = bowlSteel.clone();
    lame.material.side = THREE.DoubleSide;
    lame.position.y = -0.05 * r - tier * 0.24 * r;
    lame.scale.z = narrow;
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(bottom * 1.005, bottom * 1.01, 0.05 * r, 22, 1, true, Math.PI * 0.82, Math.PI * 1.36), lace);
    cord.material = lace.clone();
    cord.material.side = THREE.DoubleSide;
    cord.position.y = lame.position.y - 0.13 * r;
    cord.scale.z = narrow;
    group.add(lame, cord);
  }
  // The early great helmets' fukigaeshi: the top tiers' front ends turned
  // back into big wings either side of the face. Each is hinged on the neck
  // guard's front edge and folded out and back, so it lies along the side of
  // the head facing forward and out (about 45°), bowed a little, outside the
  // tiers behind it; faced with stencilled leather, gilt-edged, a gilt rosette.
  if (head.greatWings) {
    const facing = surface(new THREE.Color(head.leather ?? '#5a4430').getHex(), { roughness: 0.8 });
    facing.side = THREE.DoubleSide;
    const rim = metal(steel, head.gold ?? 0xd6a743);
    const size = head.fukigaeshi ?? 1;
    // The shikoro's open front edge (cylinder angle 0.18π on the left), from
    // just under the bowl's rim down to the foot of the third tier.
    const edgeX = Math.sin(Math.PI * 0.18);
    const edgeZ = Math.cos(Math.PI * 0.18);
    const first = shikoro(0);
    const third = shikoro(2);
    const hingeTop = { radius: first.x + 0.08 * r, z: first.z + 0.08 * r, y: 0.05 * r };
    const hingeFoot = { radius: third.x + (0.3 + flare) * r, z: third.z + (0.3 + flare) * r, y: -0.68 * r };
    const width = 0.95 * r * size;
    const bow = 0.12 * r;
    const across = 10;
    const tall = 6;
    for (const side of [1, -1]) {
      const hinge = (share) => {
        const radius = hingeTop.radius + (hingeFoot.radius - hingeTop.radius) * share;
        const across = hingeTop.z + (hingeFoot.z - hingeTop.z) * share;
        return new THREE.Vector3(edgeX * radius, hingeTop.y + (hingeFoot.y - hingeTop.y) * share, side * edgeZ * across);
      };
      // Folded back 45° from facing forward: it runs back and out, its face forward and out.
      const back = new THREE.Vector3(-Math.SQRT1_2, 0, side * Math.SQRT1_2);
      const outward = new THREE.Vector3(Math.SQRT1_2, 0, side * Math.SQRT1_2);
      // A point on the wing: `along` from the hinge (0) to its outer edge (1),
      // `down` from its top (0) to its foot (1); the outer corners rounded.
      const at = (along, down) => {
        const corner = Math.max(0, (along - 0.7) / 0.3);
        const round = 1 - Math.sqrt(Math.max(0, 1 - corner * corner));
        const share = 0.5 + (down - 0.5) * (1 - 0.35 * round);
        return hinge(share).addScaledVector(back, width * along).addScaledVector(outward, bow * Math.sin(Math.PI * along));
      };
      const positions = [];
      for (let row = 0; row <= tall; row += 1) for (let column = 0; column <= across; column += 1) positions.push(...at(column / across, row / tall).toArray());
      const indices = [];
      for (let row = 0; row < tall; row += 1) {
        for (let column = 0; column < across; column += 1) {
          const a = row * (across + 1) + column;
          indices.push(a, a + across + 1, a + 1, a + 1, a + across + 1, a + across + 2);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const face = new THREE.Mesh(geometry, facing);
      // Gilt round its edge: along the top, round the outer end, back along the foot (the hinge edge is the neck guard's).
      const border = [];
      for (let k = 0; k <= across; k += 1) border.push(at(k / across, 0));
      for (let k = 1; k < tall; k += 1) border.push(at(1, k / tall));
      for (let k = across; k >= 0; k -= 1) border.push(at(k / across, 1));
      const edge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(border), 48, 0.045 * r, 5, false), rim);
      // The rosette on its face, a little out from it.
      const middle = at(0.55, 0.5);
      const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.17 * r, 0.17 * r, 0.05 * r, 14), rim);
      rosette.position.copy(middle).addScaledVector(outward, 0.03 * r);
      rosette.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
      group.add(face, edge, rosette);
    }
  }
  // Fukigaeshi: the top lame turned back beside the face (larger on the early helmets).
  const turnback = head.greatWings ? 0 : head.fukigaeshi ?? 1;
  for (const side of [1, -1]) {
    if (!turnback) break;
    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.45 * r * turnback, 0.42 * r * turnback, 0.06 * r), bowlSteel);
    flap.position.set(0.55 * r, -0.05 * r, side * (Math.cos(Math.PI * 0.18) * shikoro(0).z / r + 0.29 + 0.25 * (turnback - 1)) * r);
    flap.rotation.y = side * -0.6;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.47 * r * turnback, 0.06 * r, 0.07 * r), gold);
    edge.position.copy(flap.position).add(new THREE.Vector3(0, 0.2 * r * turnback, 0));
    edge.rotation.y = flap.rotation.y;
    group.add(flap, edge);
  }
  // The peak over the brow (the Nanban skull has its brim instead).
  if (build.peak) {
    const peak = new THREE.Mesh(new THREE.CylinderGeometry((form.front + 0.08) * r, (form.front + 0.16) * r, 0.06 * r, 20, 1, false, Math.PI * 0.2, Math.PI * 0.6), bowlSteel);
    peak.position.set(0.05 * r, form.footY.front * r, 0);
    peak.scale.z = (form.side + 0.1) / (form.front + 0.1);
    group.add(peak);
  }
  // The crest (maedate) is headgear of its own (kabutoCrest): it can be knocked off.
  // Shaguma: the whole helmet dressed in long yak hair, a shaggy cap over the
  // bowl and a mane over the neck guard to the shoulders, open at the face.
  if (head.hair) group.add(shagumaHair(form, r, head.hair));
  // A mask in a design under study (helmstyle.js `masks`), drawn with baked maps (menpo.js), set on the face (helmforms.js
  // MASK_FITS); the gorget under it, hanging from under the chin.
  // `own`: the kit's own mask design (`maskDesign`; an oni somen for `mask: 'oni'`, else the commoner ressei-men).
  const maskDesign = HELM_STYLE.masks === 'own' ? head.maskDesign ?? (head.mask === 'oni' ? 'oni' : 'ressei') : HELM_STYLE.masks;
  const maskTint = head.mask === 'red' ? color : MENPO.black;
  if (head.mask && maskDesign !== 'now' && helmMapsReady() && buildWarMask(group, maskDesign, r, maskTint, steel.envMap)) {
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), head.mask === 'oni' ? metal(steel, 0x101012) : lace);
    throat.material = throat.material.clone();
    throat.material.side = THREE.DoubleSide;
    throat.position.y = MASK_THROAT_Y * r;
    group.add(throat);
    // A half mask (the ressei-men) made an oni's: a scowling brow over the eyes and tusks at the corners of the mouth.
    if (MENPO.scowled.includes(maskDesign)) oniScowl(group, r, metal(steel, maskTint));
  } else if (head.mask === 'oni') {
  // An oni somen: the whole face in black iron, heavy brows, glaring eye
  // holes, a snarl with fangs, and two short horns at the brow.
    const iron = metal(steel, 0x101012);
    const face = new THREE.Mesh(new THREE.SphereGeometry(1.08 * r, 18, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.22, Math.PI * 0.62), iron);
    face.material = iron.clone();
    face.material.side = THREE.DoubleSide;
    face.userData.facePatch = true;
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
    throat.position.y = MASK_THROAT_Y * r;
    setOnFace(MASK_FITS.oniFace, r, face, brow, ...eyes, nose, mouth, ...fangs, ...horns);
    group.add(face, brow, ...eyes, nose, mouth, ...fangs, ...horns, throat);
  } else if (head.mask) {
  // Menpo: the lower face guard, with a nose and a bristling moustache.
    const maskSteel = metal(steel, head.mask === 'red' ? color : 0x141416);
    // Sphere angles: x = −cos φ, so the front (+x) is at φ = π.
    const menpo = new THREE.Mesh(new THREE.SphereGeometry(1.06 * r, 18, 10, Math.PI * 0.58, Math.PI * 0.84, Math.PI * 0.52, Math.PI * 0.36), maskSteel);
    menpo.material = maskSteel.clone();
    menpo.material.side = THREE.DoubleSide;
    menpo.userData.facePatch = true;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.14 * r, 0.32 * r, 8), maskSteel);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(1.08 * r, -0.12 * r, 0);
    const moustache = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.08 * r, 0.6 * r), surface(0xe8e4da));
    moustache.position.set(1.06 * r, -0.34 * r, 0);
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), lace);
    throat.material = lace.clone();
    throat.material.side = THREE.DoubleSide;
    throat.position.y = MASK_THROAT_Y * r;
    setOnFace(MASK_FITS.menpo, r, menpo, nose, moustache);
    group.add(menpo, nose, moustache, throat);
  }
}

// The gorget's (nodowa's) middle under a samurai's mask, head radii: hanging from the mask's foot under the chin.
const MASK_THROAT_Y = -1.5;

// The samurai's half masks read as an oni's face (the menpo of the 16th-17th c. were made to frighten: the Met's 13.112.15,
// the British Museum's menpo with their hooked noses, open snarls and moustaches): `scowled`, the mask designs (menpo.js) given
// a heavy scowling brow of iron over the eyes (its inner ends drawn down to the nose, two furrows between) and tusks at the
// mouth's corners. `black`: black-lacquered iron, drawn a little lighter than black so the mask's relief reads.
// `brow` [inner, outer] (z, y) of each brow on the face, head radii; `tusks` (z, y, height) on the lower lip.
const MENPO = { scowled: ['ressei'], black: 0x2c2b2f, brow: [[0.06, -0.01], [0.46, 0.13]], stand: 0.1, thick: 0.065, tusks: [0.15, -0.86, 0.2] };

/** The scowl and tusks on a half mask (MENPO), in `iron` the mask's own metal, on the face as the mask is (helmforms.js headRadiusAt). */
function oniScowl(group, r, iron) {
  const onFace = (z, y, stand) => {
    const azimuth = Math.asin(Math.max(-0.95, Math.min(0.95, z / 1.05)));
    const radius = headRadiusAt(azimuth, y) + stand;
    return new THREE.Vector3(radius * Math.cos(azimuth) * r, y * r, radius * Math.sin(azimuth) * r);
  };
  const [[innerZ, innerY], [outerZ, outerY]] = MENPO.brow;
  const bone = surface(0xe8e2d0, { roughness: 0.4 });
  for (const side of [1, -1]) {
    // The brow: thick at the nose and arched, its inner end low (the scowl).
    const brow = Array.from({ length: 7 }, (_, step) => {
      const t = step / 6;
      return onFace(side * (innerZ + (outerZ - innerZ) * t), innerY + (outerY - innerY) * t + 0.035 * Math.sin(Math.PI * t), MENPO.stand);
    });
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(brow), 12, MENPO.thick * r, 5, false), iron));
    // A furrow up from the nose between the brows.
    const furrow = [onFace(side * 0.03, -0.06, MENPO.stand - 0.02), onFace(side * 0.045, 0.06, MENPO.stand - 0.01), onFace(side * 0.05, 0.13, MENPO.stand - 0.02)];
    group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(furrow), 6, 0.022 * r, 4, false), iron));
    // A tusk up from the corner of the mouth.
    const [tuskZ, tuskY, tall] = MENPO.tusks;
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.045 * r, tall * r, 6), bone);
    tusk.position.copy(onFace(side * tuskZ, tuskY + tall / 2, 0.17));
    tusk.rotation.x = side * -0.25;
    group.add(tusk);
  }
}

// The metal each of the other war masks is drawn in (menpo.js): of the helmet's steel, bronze, its gilt, or its mail.
const WORLD_MASK_METAL = {
  tiemian: (head, color) => color, kipchak: (head, color) => color, shoumian: () => 0x9a7a4a,
  horde: (head) => head.gold ?? 0xc9a23a, ventail: (head, color) => head.mail ?? head.coif ?? color,
};

/**
 * A helmet's war mask of China, the steppe or the sultanates (`head.maskDesign`: menpo.js MASK_SHEETS), set on the face
 * as the samurai's are and kept fitted through the helmet's span (helmforms.js HELM_SPAN); under a plate mask, mail at
 * the throat hanging from its foot. Whether it was drawn (else the helmet's own).
 */
function worldMask(group, head, r, steel, color) {
  const tintOf = WORLD_MASK_METAL[head.maskDesign];
  if (!tintOf || HELM_STYLE.masks === 'now' || !helmMapsReady()) return false;
  const span = HELM_SPAN[head.kind] ?? null;
  if (!buildWarMask(group, head.maskDesign, r, tintOf(head, color), steel.envMap, span)) return false;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), metal(steel, head.mail ?? head.coif ?? color).clone());
  throat.material.side = THREE.DoubleSide;
  throat.position.y = MASK_THROAT_Y * r;
  if (span) throat.scale.set(1 / span[0], 1 / span[1], 1 / span[2]);
  group.add(throat);
  return true;
}

/**
 * The pieces of a mask drawn on its sphere set on the face (helmforms.js maskOnFace with `fit`): a patch of the sphere
 * (`userData.facePatch`) has every vertex moved, a piece on it (a nose, a brow, an eye) its place.
 */
function setOnFace(fit, r, ...pieces) {
  const onFace = (x, y, z) => maskOnFace(fit, [x / r, y / r, z / r]).map((value) => value * r);
  for (const piece of pieces) {
    if (piece.userData.facePatch) {
      const position = piece.geometry.attributes.position;
      for (let index = 0; index < position.count; index += 1) position.setXYZ(index, ...onFace(position.getX(index), position.getY(index), position.getZ(index)));
      piece.geometry.computeVertexNormals();
    } else piece.position.set(...onFace(piece.position.x, piece.position.y, piece.position.z));
  }
}

// How much bigger than first drawn a crest and a plume stand: they are meant to be seen.
const HEAD_DRESS_SCALE = 1.7;
const PLUME_SCALE = 1.15;

/**
 * Where a crest or plume stands on a helmet (head radii times `r`): a knight's helmet in a design on its own crown or comb
 * (knighthelms.js `top`), a bascinet on its point, any other on its crown.
 */
function crestTop(head, r) {
  const knightly = knightFormOf(head.kind, HELM_STYLE.knight, head.design);
  return knightly ? (knightly.top + 0.08) * r : head.kind === 'bascinet' ? (head.pointed ? 1.55 : 1.35) * r : 0.95 * r;
}

// The knights' parade crests (outfits.js HEADGEAR harpy, ostrich), in head radii:
// - harpy (drawn `scale` times these measures): the winged harpy (a woman's head and breast on a bird's body, wings raised behind, a long tail curling down the
//   helmet's back into a scroll) cast and gilt on the burgonet of the Negroli parade harness (the "harpy" or sphinx crests of
//   Filippo Negroli's embossed armours, Milan c. 1530-45: the Met's 17.190.1720, the Real Armería's A 139). `tail`: the
//   tail's run from the body back and down the skull, ending in its curl (`curl`: the scroll's radius and turns); `seat`:
//   how far below the helmet's top its bracket is set (into the comb).
// - ostrich: a spray of white ostrich plumes rising from a small gilt crown on the helmet's top (the fluted Maximilian
//   harnesses' parade dress, and the Greenwich tournament harnesses' panaches): `plumes` feathers, each `length` long, rising
//   and falling outward along `path` (out, up, in lengths), `width` across at its fullest, drawn in `segments` x 3 rings,
//   round `spread` of the sides and back, the
//   crown `crown` wide with its fleurons, set `seat` down over the top.
export const HELM_CRESTS = {
  harpy: { gilt: '#b8923a', scale: 1.5, seat: 0.22, tail: [[-0.15, 0.36], [-0.38, 0.12], [-0.69, -0.27], [-0.92, -0.81], [-1.04, -1.35], [-1.04, -1.7]], curl: [0.12, 1.25], wing: { feathers: 6, length: [0.42, 0.78] } },
  ostrich: { gilt: '#d4aa48', feather: '#f3f0e8', seat: 0.24, plumes: 13, length: 2.2, segments: 8, width: 0.3, spread: 2.1, path: [[0, 0.05], [0.05, 0.42], [0.25, 0.7], [0.52, 0.68], [0.75, 0.42], [0.88, 0.05], [0.93, -0.22]], crown: { radius: 0.3, height: 0.12, fleurons: 8 } },
};

/** The gilt harpy standing on a helmet's crown, facing forward (+x), its tail down the back. */
function harpyCrest(r, gilt) {
  const spec = HELM_CRESTS.harpy;
  const group = new THREE.Group();
  const add = (geometry, [x, y, z], scale = [1, 1, 1], rotation = [0, 0, 0]) => {
    const mesh = new THREE.Mesh(geometry, gilt);
    mesh.position.set(x * r, y * r, z * r);
    mesh.scale.set(...scale);
    mesh.rotation.set(...rotation);
    group.add(mesh);
    return mesh;
  };
  // The bracket and its socket on the comb, the bird's feet clasping it.
  add(new THREE.CylinderGeometry(0.05 * r, 0.08 * r, 0.24 * r, 8), [0, 0.1, 0]);
  // The bird's body, low and long, its breast up and forward into the woman's bust.
  add(new THREE.SphereGeometry(0.2 * r, 12, 8), [-0.04, 0.36, 0], [1.35, 0.8, 0.75], [0, 0, 0.35]);
  add(new THREE.SphereGeometry(0.14 * r, 12, 8), [0.12, 0.58, 0], [0.85, 1.2, 1]);
  for (const side of [1, -1]) add(new THREE.SphereGeometry(0.065 * r, 8, 6), [0.22, 0.6, 0.065 * side]);
  // The neck, the head and the knot of hair behind it.
  add(new THREE.CylinderGeometry(0.045 * r, 0.06 * r, 0.16 * r, 8), [0.15, 0.78, 0], [1, 1, 1], [0, 0, -0.2]);
  add(new THREE.SphereGeometry(0.1 * r, 12, 10), [0.18, 0.92, 0], [1.05, 1.15, 0.9]);
  add(new THREE.SphereGeometry(0.055 * r, 8, 6), [0.08, 1.0, 0]);
  // The wings raised behind and up from the shoulders, each a fan of long feathers.
  const { feathers, length } = spec.wing;
  for (const side of [1, -1]) {
    for (let index = 0; index < feathers; index += 1) {
      const share = index / (feathers - 1);
      const long = (length[0] + (length[1] - length[0]) * share) * r;
      const feather = new THREE.Mesh(new THREE.BoxGeometry(0.07 * r, long, 0.015 * r), gilt);
      feather.geometry.translate(0, long / 2, 0);
      const pivot = new THREE.Group();
      pivot.position.set(0.02 * r, 0.62 * r, 0.09 * side * r);
      pivot.rotation.set(side * (0.25 + 0.05 * share), 0, 0.35 + 0.55 * share);
      pivot.add(feather);
      group.add(pivot);
    }
  }
  // The tail: from the body back over the skull and down the back of the helmet, ending in a scroll.
  const [radius, turns] = spec.curl;
  const points = spec.tail.map(([x, y]) => new THREE.Vector3(x * r, y * r, 0));
  const end = points.at(-1);
  for (let step = 1; step <= 10; step += 1) {
    const angle = (step / 10) * turns * Math.PI * 2;
    const shrink = radius * (1 - (0.6 * step) / 10) * r;
    points.push(new THREE.Vector3(end.x + shrink * Math.sin(angle), end.y - shrink * (1 - Math.cos(angle)), 0));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 40, 0.04 * r, 6, false), gilt));
  return group;
}

/**
 * One ostrich plume along its curve (in its own plane, x out and y up): a tube swelled in the middle and narrowed to its
 * tip, flattened across its plane (the barbs hang either side of the quill, z), its surface ruffled so the barbs read as
 * soft fronds, not a sausage. `seed`: each plume ruffled its own way.
 */
function ostrichPlume(curve, r, spec, seed) {
  const rings = spec.segments * 3;
  const sides = 8;
  const geometry = new THREE.TubeGeometry(curve, rings, spec.width * r, sides, false);
  const position = geometry.attributes.position;
  const at = new THREE.Vector3();
  const offset = new THREE.Vector3();
  for (let ring = 0; ring <= rings; ring += 1) {
    const t = ring / rings;
    curve.getPointAt(t, at);
    const swell = 0.25 + Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.7;
    for (let side = 0; side <= sides; side += 1) {
      const index = ring * (sides + 1) + side;
      offset.set(position.getX(index), position.getY(index), position.getZ(index)).sub(at);
      // Flat across its plane, the fronds' tips ruffled.
      const ruffle = 1 + 0.28 * Math.sin(ring * 2.3 + side * 1.7 + seed * 3.1);
      offset.x *= 0.45;
      offset.y *= 0.45;
      offset.multiplyScalar(swell * ruffle);
      position.setXYZ(index, at.x + offset.x, at.y + offset.y, at.z + offset.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A spray of ostrich plumes rising from a small gilt crown on a helmet's top. */
function ostrichSpray(r, gilt, feather) {
  const spec = HELM_CRESTS.ostrich;
  const group = new THREE.Group();
  const { radius, height, fleurons } = spec.crown;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * r, radius * 0.85 * r, height * r, 20, 1, true), gilt);
  band.material = gilt.clone();
  band.material.side = THREE.DoubleSide;
  band.position.y = height * 0.5 * r;
  group.add(band);
  for (let index = 0; index < fleurons; index += 1) {
    const angle = (index / fleurons) * Math.PI * 2;
    const fleuron = new THREE.Mesh(new THREE.ConeGeometry(0.045 * r, 0.14 * r, 5), gilt);
    fleuron.position.set(Math.cos(angle) * radius * r, (height + 0.06) * r, Math.sin(angle) * radius * r);
    group.add(fleuron);
  }
  // The plumes: each rising from inside the crown, arching out and falling (`path`, in plume lengths: out, up), round the sides
  // and back (`spread`, rad either side of straight back: none before the face), each a run of soft tufts along its quill.
  const { path, spread } = spec;
  const curve = new THREE.CatmullRomCurve3(path.map(([out, up]) => new THREE.Vector3(out * spec.length * r, up * spec.length * r, 0)));
  for (let index = 0; index < spec.plumes; index += 1) {
    const angle = Math.PI - spread + (2 * spread * index) / (spec.plumes - 1);
    const plume = new THREE.Group();
    plume.rotation.y = -angle;
    // Every other plume a little shorter and more upright: a full spray, not a ring.
    plume.scale.setScalar(index % 2 ? 0.82 : 1);
    plume.rotation.z = index % 2 ? 0.25 : 0;
    plume.add(new THREE.Mesh(ostrichPlume(curve, r, spec, index), feather));
    group.add(plume);
  }
  return group;
}

/** A kabuto's crest (maedate) on its holder at the brow, in head coordinates. */
export function kabutoCrest(head, r, steel) {
  const gold = metal(steel, head.gold ?? 0xd6a743);
  const crest = new THREE.Group();
  crest.position.set((KABUTO_FORM.brow[0] + 0.02) * r, KABUTO_FORM.brow[1] * r, 0);
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
    case 'kuwagataTall': {
      // The ō-yoroi's kuwagata: two tall flat gilt blades rising from a
      // holder at the brow, widening to a squared tip, a gilt crest between.
      for (const side of [1, -1]) {
        const blade = new THREE.Shape();
        blade.moveTo(-0.07 * r, 0);
        blade.lineTo(0.07 * r, 0);
        blade.lineTo(0.13 * r, 1.95 * r);
        blade.lineTo(0.2 * r, 2.15 * r);
        blade.lineTo(-0.16 * r, 2.2 * r);
        blade.lineTo(-0.1 * r, 1.95 * r);
        blade.closePath();
        const horn = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.03 * r, bevelEnabled: false }), crestMetal);
        // The blade's flat faces forward (+x): turned about y from the shape's +z face.
        horn.rotation.set(side * 0.24, Math.PI / 2, 0);
        horn.position.set(0, 0.12 * r, side * 0.34 * r);
        crest.add(horn);
      }
      const holder = new THREE.Mesh(new THREE.BoxGeometry(0.06 * r, 0.28 * r, 0.9 * r), crestMetal);
      holder.position.y = 0.1 * r;
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * r, 0.18 * r, 0.05 * r, 16), surface(0x16141a, { roughness: 0.4 }));
      badge.rotation.z = Math.PI / 2;
      badge.position.set(0.04 * r, 0.3 * r, 0);
      crest.add(holder, badge);
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
    case 'flame': case 'halo': case 'rabbit': case 'wings': case 'fan': case 'buffalo':
      KAWARI_CRESTS[head.crest](headSpace(crest, r), head, r, { gold, steel, lacquer: metal(steel, head.color ?? 0x17171a) });
      break;
    default:
      break;
  }
  inkAll(crest);
  return crest;
}

/**
 * A group inside a crest in the head's own coordinates (head radii times r about the head's middle): the crest stands at
 * the brow and is drawn HEAD_DRESS_SCALE times bigger, so this one is put back and scaled down to match; the shapes that stand
 * on the bowl's sides or crown (wakidate, ushirodate) are placed by where the bowl is.
 */
function headSpace(crest, r) {
  const space = new THREE.Group();
  space.scale.setScalar(1 / HEAD_DRESS_SCALE);
  space.position.set((-crest.position.x) / HEAD_DRESS_SCALE, (-crest.position.y) / HEAD_DRESS_SCALE, 0);
  crest.add(space);
  return space;
}

/** A tapered horn or beam through `points` (head coordinates times r), from `from` thick to `to` at its tip. */
function taperedHorn(points, from, to, material) {
  const horn = new THREE.Group();
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const share = (index - 1) / (points.length - 1);
    const next = index / (points.length - 1);
    const length = a.distanceTo(b);
    const piece = new THREE.Mesh(new THREE.CylinderGeometry(from + (to - from) * next, from + (to - from) * share, length * 1.04, 7), material);
    piece.position.copy(a).add(b).multiplyScalar(0.5);
    piece.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    horn.add(piece);
  }
  return horn;
}

/** A flat shape (outline points [across, up], one half, mirrored) cut from plate `thick`, its face forward (+x). */
function plateShape(half, thick, material) {
  const shape = new THREE.Shape();
  const outline = [...half, ...half.slice().reverse().map(([across, up]) => [-across, up])];
  outline.forEach(([across, up], index) => (index ? shape.lineTo(across, up) : shape.moveTo(across, up)));
  shape.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false }), material);
  mesh.rotation.y = Math.PI / 2;
  return mesh;
}

// The flame maedate's half outline (head radii, from its foot in the middle round its three tongues to the notch at its top).
const FLAME_HALF = [[0, 0], [0.5, 0], [0.9, 0.12], [1.15, 0.35], [1.22, 0.68], [1.45, 1.02], [1.1, 0.86], [0.95, 0.6], [0.8, 0.74], [0.86, 1.16], [0.62, 0.96], [0.5, 0.7], [0.38, 0.96], [0.44, 1.42], [0.2, 1.12], [0.1, 0.82], [0, 0.96]];

/**
 * The kawari kabuto's crests (late 16th and 17th c.: the Met's and the Tokyo National Museum's), cheap shapes in head
 * coordinates (`space`, times r): each `(space, head, r, { gold, steel, lacquer })`.
 */
const KAWARI_CRESTS = {
  // A gilt flame (kaen) standing on a fretwork crescent at the brow, a smaller flame of bright steel before it.
  flame(space, head, r, { gold, steel }) {
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.8 * r, 0.08 * r, 5, 20, Math.PI), gold);
    crescent.rotation.set(0, Math.PI / 2, Math.PI);
    crescent.scale.set(1, 0.45, 1.6);
    crescent.position.set(1.2 * r, 0.95 * r, 0);
    const outer = plateShape(FLAME_HALF.map(([a, b]) => [a * r, b * r]), 0.035 * r, gold);
    outer.position.set(1.12 * r, 0.62 * r, 0);
    const inner = plateShape(FLAME_HALF.map(([a, b]) => [a * 0.5 * r, b * 0.55 * r]), 0.035 * r, steel);
    inner.position.set(1.17 * r, 0.72 * r, 0);
    space.add(crescent, outer, inner);
  },
  // The tall eboshi (a court cap's peak, raised in lacquered papier-mâché over the bowl) and a gilt sun halo behind it.
  halo(space, head, r, { gold, lacquer }) {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(0.7 * r, 1.9 * r, 18), lacquer);
    peak.scale.z = 0.5;
    peak.rotation.z = 0.12;
    peak.position.set(-0.05 * r, 1.85 * r, 0);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.45 * r, 0.17 * r, 6, 36), gold);
    halo.rotation.y = Math.PI / 2;
    halo.scale.z = 0.3;
    halo.position.set(-0.55 * r, 2.15 * r, 0);
    space.add(peak, halo);
  },
  // A hare's two tall ears in black lacquer, standing from the crown and leaning back.
  rabbit(space, head, r, { lacquer }) {
    for (const side of [1, -1]) {
      const shape = new THREE.Shape();
      shape.absellipse(0, 1.25 * r, 0.24 * r, 1.25 * r, 0, Math.PI * 2, false, 0);
      const ear = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.06 * r, bevelEnabled: false, curveSegments: 16 }), lacquer);
      ear.rotation.set(side * 0.22, Math.PI / 2, 0);
      const lean = new THREE.Group();
      lean.rotation.z = 0.3;
      lean.position.set(-0.05 * r, 0.95 * r, side * 0.36 * r);
      lean.add(ear);
      space.add(lean);
    }
  },
  // An eagle's wings in black lacquered wood, spread up and out from either side of the bowl, a gilt boss at each root.
  wings(space, head, r, { gold }) {
    const black = surface(0x141416, { roughness: 0.45 });
    const grey = surface(0x2c2c30, { roughness: 0.55 });
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      wing.position.set(-0.15 * r, 0.8 * r, side * 0.88 * r);
      wing.rotation.z = 0.35;
      for (let feather = 0; feather < 7; feather += 1) {
        const length = (1.5 + 0.22 * feather) * r;
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, length, 0.3 * r).translate(0, length / 2, 0), feather % 2 ? grey : black);
        blade.rotation.x = side * (0.12 + feather * 0.17);
        wing.add(blade);
      }
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.14 * r, 10, 8), gold);
      boss.position.copy(wing.position);
      space.add(wing, boss);
    }
  },
  // Two gilt fans (ōgi), ribbed, standing up from either side of the bowl, their faces forward.
  fan(space, head, r, { gold }) {
    const leaf = gold.clone();
    leaf.side = THREE.DoubleSide;
    for (const side of [1, -1]) {
      const fan = new THREE.Group();
      fan.position.set(0.05 * r, 0.75 * r, side * 0.8 * r);
      fan.rotation.set(side * 0.55, Math.PI / 2, 0);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1.4 * r, 18, Math.PI * 0.08, Math.PI * 0.84), leaf);
      fan.add(disc);
      for (let rib = 0; rib < 9; rib += 1) {
        const angle = Math.PI * (0.1 + (0.8 * rib) / 8);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.4 * r, 0.05 * r, 0.05 * r).translate(0.7 * r, 0, 0.02 * r), gold);
        bar.rotation.z = angle;
        fan.add(bar);
      }
      space.add(fan);
    }
  },
  // A water buffalo's horns in gilt, sweeping out from the sides of the bowl and up, the tips turned in.
  buffalo(space, head, r, { gold }) {
    for (const side of [1, -1]) {
      const points = [[0.05, 0.7, 0.8], [0.12, 1.05, 1.55], [0.18, 1.9, 1.85], [0.12, 2.75, 1.5], [0.0, 3.1, 0.95]].map(([x, y, z]) => new THREE.Vector3(x * r, y * r, side * z * r));
      space.add(taperedHorn(points, 0.3 * r, 0.04 * r, gold));
    }
  },
};

/**
 * Headgear worn over the head or the helmet, in head coordinates (r the
 * head radius): a runner's cap, a boonie hat, a yakuza's hat, a commoner's
 * wrapped head, a knight's plume, a kabuto's crest. Null if the outfit has
 * nothing for it to sit on.
 */
/**
 * A traveller's sugegasa: a broad, shallow cone of plaited sedge, its ribs
 * radiating from the peak, a dark bound rim, tied under the chin; worn low,
 * it shades the eyes. Worn as a helmet would be, or as a loose hat (a prop
 * that a blow or a fall can knock off).
 */
function buildKasa(group, r, color, head = {}) {
  const straw = surface(color, { roughness: 0.95 });
  straw.flatShading = true;
  straw.side = THREE.DoubleSide;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.3 * r, 1.15 * r, 40, 1, true), straw);
  cone.position.y = 0.62 * r;
  const ribs = surface(new THREE.Color(color).multiplyScalar(0.72).getHex(), { roughness: 1 });
  for (let rib = 0; rib < 16; rib += 1) {
    const angle = (rib / 16) * Math.PI * 2;
    const line = new THREE.Mesh(new THREE.BoxGeometry(3.4 * r, 0.025 * r, 0.04 * r), ribs);
    line.position.set(Math.cos(angle) * 1.65 * r, 0.64 * r, Math.sin(angle) * 1.65 * r);
    line.rotation.set(0, -angle, -Math.atan2(1.15, 3.3));
    line.userData.noOutline = true;
    group.add(line);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3.3 * r, 0.06 * r, 5, 40), surface(head.rim ?? 0x1c1a18, { roughness: 0.8 }));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.05 * r;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1.0 * r, 1.08 * r, 0.32 * r, 18, 1, true), surface(0x2a2420));
  band.position.y = 0.22 * r;
  for (const side of [1, -1]) {
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.05 * r, 1.25 * r, 0.05 * r), surface(head.tie ?? 0xe8e2d2));
    tie.position.set(0.25 * r, -0.2 * r, side * 0.9 * r);
    tie.rotation.set(side * 0.18, 0, 0.2);
    group.add(tie);
  }
  group.add(cone, rim, band);
}

export function buildHeadProp(kind, body, dress, colors, steel, cornerHex) {
  const r = body.lengths.headRadius;
  const group = new THREE.Group();
  const cloth = (hex) => surface(hex, { roughness: 0.75 });
  switch (kind) {
    case 'kasa':
      buildKasa(group, r, 0xc8a868);
      break;
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
    case 'harpy': {
      if (!dress.head) return null;
      const crest = harpyCrest(r, metal(steel, dress.head.gold ?? dress.armor?.gold ?? HELM_CRESTS.harpy.gilt));
      crest.position.y = crestTop(dress.head, r) - HELM_CRESTS.harpy.seat * r;
      crest.scale.setScalar(HELM_CRESTS.harpy.scale);
      group.add(crest);
      break;
    }
    case 'ostrich': {
      if (!dress.head) return null;
      const spray = ostrichSpray(r, metal(steel, dress.head.gold ?? dress.armor?.gold ?? HELM_CRESTS.ostrich.gilt), surface(HELM_CRESTS.ostrich.feather, { roughness: 1 }));
      spray.position.y = crestTop(dress.head, r) - HELM_CRESTS.ostrich.seat * r;
      spray.scale.setScalar(PLUME_SCALE);
      group.add(spray);
      break;
    }
    case 'plume': {
      if (!dress.head) return null;
      // On the crown of the helm, sweeping back.
      const top = crestTop(dress.head, r);
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
    default: {
      // A crest chosen in place of the design's own (HEADGEAR `maedate`), on the kabuto as its own is.
      const maedate = HEADGEAR[kind]?.maedate;
      if (!maedate || dress.head?.kind !== 'kabuto') return null;
      const crest = kabutoCrest({ ...dress.head, crest: maedate }, r, steel);
      crest.scale.setScalar(HEAD_DRESS_SCALE);
      return crest;
    }
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
 * Soft cloth hung round a body part: a cloak from the shoulders, a skirt from
 * the waist. One sheet of cloth over an arc of `arc` rad centred on `centre`
 * (angle 0 is +z, the left; behind is 3π/2; a full turn closes it round),
 * from radius `top` at `y` to `hem` at `length` below. Under it, `columns`
 * chains of `links` pendulums (Dangle) round the hang: they sway, swing out
 * on a turn, fold over a stepping leg and settle, and the body's colliders
 * hold them off it. Neighbouring chains are held together (the cloth between
 * them stretches little: `stretch`), and the sheet is drawn through all the
 * chains' joints each frame, so it bends as one cloth. `paint(column)` gives
 * each column's material. Returns what is stepped each frame, in order: the
 * Dangles a level at a time, each level then held to its neighbours, and last
 * the sheet itself. (Each has `update` and a `group`.)
 */
export function softDrape(anchor, { columns, links, top, hem, y, length, centre, arc, sag = 0.2, damping = 0.7, collides = ['trunk', 'leg'], paint, stretch = 1.12 }) {
  const closed = arc >= Math.PI * 2 - 1e-6;
  const link = length / links;
  const share = arc / columns;
  const chains = [];
  for (let column = 0; column < columns; column += 1) {
    const theta = centre - arc / 2 + share * (column + 0.5);
    const out = [Math.sin(theta), Math.cos(theta)];
    let parent = anchor;
    let pivot = [out[0] * top, y, out[1] * top];
    // Hanging down and a little out, as cloth falls from round a body.
    let rest = [out[0] * (hem - top) / length, -1, out[1] * (hem - top) / length];
    const chain = [];
    for (let index = 0; index < links; index += 1) {
      const dangle = new Dangle(parent, pivot, rest, link, { sag, damping, collides, outward: [out[0], 0, out[1]] });
      // At rest before it first moves (a figure that never steps, a design sheet's first frame).
      dangle.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dangle.rest);
      dangle.group.updateMatrix();
      chain.push(dangle);
      parent = dangle.group;
      pivot = [0, -link, 0];
      rest = [0, -1, 0];
    }
    chains.push(chain);
  }
  const steps = [];
  const gap = new THREE.Vector3();
  for (let index = 0; index < links; index += 1) {
    const level = chains.map((chain) => chain[index]);
    steps.push(...level);
    // The cloth between two chains at this level, as hung, and how far it may stretch.
    const limit = 2 * (top + ((hem - top) * (index + 1)) / links) * Math.sin(share / 2) * stretch;
    steps.push({
      group: new THREE.Group(),
      update() {
        if (level.some((dangle) => !dangle.tip)) return;
        const scale = anchor.matrixWorld.getMaxScaleOnAxis();
        for (let pass = 0; pass < 2; pass += 1) {
          for (let column = 0; column < (closed ? columns : columns - 1); column += 1) {
            const a = level[column].tip;
            const b = level[(column + 1) % columns].tip;
            gap.subVectors(b, a);
            const distance = gap.length();
            if (distance <= limit * scale) continue;
            gap.multiplyScalar((distance - limit * scale) / (2 * distance));
            a.add(gap);
            b.sub(gap);
          }
        }
        for (const dangle of level) {
          const { pivot, length: reach } = dangle.placeInWorld();
          dangle.aim(pivot, reach);
        }
      },
    });
  }
  steps.push(clothSheet(anchor, chains, { closed, link, paint, folds: hem * 0.06 }));
  return steps;
}

/** Uniform Catmull–Rom through p1 and p2, at t from p1 (0) to p2 (1). */
function catmullRom(p0, p1, p2, p3, t, out) {
  const t2 = t * t;
  const t3 = t2 * t;
  for (const axis of ['x', 'y', 'z']) {
    out[axis] = 0.5 * (2 * p1[axis] + (p2[axis] - p0[axis]) * t + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t2 + (3 * p1[axis] - p0[axis] - 3 * p2[axis] + p3[axis]) * t3);
  }
  return out;
}

/**
 * softDrape's cloth: a smooth sheet through the joints of its chains (the
 * pivots across the top, each link's tip below), in the anchor's frame,
 * redrawn each frame, falling in a fold to each column (`folds` deep at the
 * hem). An open sheet runs half a column past its outer chains.
 */
function clothSheet(anchor, chains, { closed, link, paint, folds }) {
  const columns = chains.length;
  const links = chains[0].length;
  const across = 6;
  const down = 3;
  const spans = closed ? columns : columns + 1;
  const width = closed ? spans * across : spans * across + 1;
  const height = links * down + 1;
  const joints = Array.from({ length: links + 1 }, () => Array.from({ length: columns + 2 }, () => new THREE.Vector3()));
  const rows = Array.from({ length: links + 1 }, () => Array.from({ length: width }, () => new THREE.Vector3()));
  const positions = new Float32Array(width * height * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  // Faces, sorted by their column's material (a two-coloured surcoat).
  const materials = [];
  const buckets = [];
  const cell = (u) => {
    const span = Math.floor(u / across);
    const column = (closed ? span : span - 1) + ((u % across) < across / 2 ? 0 : 1);
    return closed ? column % columns : Math.max(0, Math.min(columns - 1, column));
  };
  for (let u = 0; u < spans * across; u += 1) {
    const material = paint(cell(u));
    let slot = materials.indexOf(material);
    if (slot < 0) {
      slot = materials.push(material) - 1;
      buckets.push([]);
    }
    const next = closed ? (u + 1) % width : u + 1;
    for (let v = 0; v < height - 1; v += 1) {
      const a = v * width + u;
      const b = v * width + next;
      const c = (v + 1) * width + u;
      const d = (v + 1) * width + next;
      buckets[slot].push(a, c, b, b, c, d);
    }
  }
  const indices = [];
  buckets.forEach((bucket, slot) => {
    geometry.addGroup(indices.length, bucket.length, slot);
    indices.push(...bucket);
  });
  geometry.setIndex(indices);
  const sheet = new THREE.Mesh(geometry, materials.length > 1 ? materials : materials[0]);
  // Its bounds move with the cloth every frame.
  sheet.frustumCulled = false;
  anchor.add(sheet);
  const matrix = new THREE.Matrix4();
  const foot = new THREE.Vector3();
  const point = new THREE.Vector3();
  const update = () => {
    // Each chain's joints in the anchor's frame, from the links' own matrices.
    chains.forEach((chain, column) => {
      matrix.identity();
      joints[0][column + 1].copy(chain[0].group.position);
      chain.forEach((dangle, index) => {
        matrix.multiply(dangle.group.matrix);
        joints[index + 1][column + 1].copy(foot.set(0, -link, 0).applyMatrix4(matrix));
      });
    });
    for (const row of joints) {
      if (closed) {
        row[0].copy(row[columns]);
        row[columns + 1].copy(row[1]);
      } else {
        // Half a column past the outer chains, as the cloth runs on.
        row[0].copy(row[1]).multiplyScalar(1.5).addScaledVector(row[2], -0.5);
        row[columns + 1].copy(row[columns]).multiplyScalar(1.5).addScaledVector(row[columns - 1], -0.5);
      }
    }
    // Across each row through its joints, then down each column of the sheet.
    const at = (row, k) => row[Math.max(0, Math.min(columns + 1, k))];
    joints.forEach((row, r) => {
      for (let u = 0; u < width; u += 1) {
        const span = Math.min(Math.floor(u / across), spans - 1);
        const t = u / across - span;
        if (closed) {
          const k = (n) => row[((span + n) % columns) + 1];
          catmullRom(k(-1 + columns), k(0), k(1), k(2), t, rows[r][u]);
        } else {
          catmullRom(at(row, span - 1), at(row, span), at(row, span + 1), at(row, span + 2), t, rows[r][u]);
        }
      }
    });
    for (let v = 0; v < height; v += 1) {
      const span = Math.min(Math.floor(v / down), links - 1);
      const t = v / down - span;
      for (let u = 0; u < width; u += 1) {
        const k = (n) => rows[Math.max(0, Math.min(links, span + n))][u];
        catmullRom(k(-1), k(0), k(1), k(2), t, point);
        // Folds: the hem is wider than where it hangs from, so the cloth falls in
        // flutes, shallow at the top and deeper down (out from the anchor's axis).
        const outward = Math.hypot(point.x, point.z) || 1;
        const fold = folds * (0.1 + 0.9 * (v / (height - 1))) * Math.sin((u / across) * Math.PI * 2);
        positions.set([point.x + (point.x / outward) * fold, point.y, point.z + (point.z / outward) * fold], (v * width + u) * 3);
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  update();
  return { group: sheet, update };
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
    } else if (extra.kind === 'juzu') {
      // The monk's prayer beads (juzu): a long loop of wooden beads round the
      // neck and down over the chest, every tenth bead larger. Rigid on the collar.
      const wood = surface(new THREE.Color(color).getHex(), { roughness: 0.45 });
      const width = (body.lengths.shoulderSpan ?? 0.4 * scale) * 0.32;
      const count = 36;
      for (let index = 0; index < count; index += 1) {
        // Round the back of the neck, then a U down the front to the breastbone.
        const angle = (index / count) * Math.PI * 2;
        const front = Math.max(0, -Math.cos(angle));
        const bead = new THREE.Mesh(new THREE.SphereGeometry((index % 9 ? 0.011 : 0.017) * scale, 8, 6), wood);
        bead.position.set(-0.03 * scale + front * 0.21 * scale, 0.05 * scale - front * front * 0.3 * scale, Math.sin(angle) * width * (1 + 0.25 * front));
        collar.add(bead);
      }
    } else if (extra.kind === 'mantle') {
      // A great mantle from the shoulders to the ankles, open in front, soft
      // (softDrape: chains round the shoulders and down the back), a cross on
      // its left shoulder. Drawn in a crowd (`still`), the band hangs rigid instead.
      const length = (extra.length ?? 1.3) * scale;
      const shoulders = body.lengths.shoulderSpan ?? 0.4 * scale;
      const cloth = surface(new THREE.Color(color).getHex(), { roughness: 0.85 });
      cloth.side = THREE.DoubleSide;
      const drape = softDrape(collar, { columns: 9, links: 3, top: shoulders * 0.62, hem: shoulders * 1.2, y: 0.02 * scale, length, centre: Math.PI * 1.5, arc: Math.PI * 1.3, sag: 0.18, damping: 0.75, paint: () => cloth });
      if (extra.cross) {
        // On the cloth at the left front of the shoulders (riding on the last chain's top link).
        const red = surface(new THREE.Color(extra.cross).getHex(), { roughness: 0.8 });
        const topLink = drape.filter((dangle) => dangle.anchor === collar).at(-1);
        const theta = Math.PI * 1.5 + Math.PI * 0.65 - (Math.PI * 1.3) / 18;
        for (const [w, h] of [[0.035, 0.12], [0.1, 0.035]]) {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w * scale, h * scale, 0.004 * scale), red);
          bar.position.set(Math.sin(theta) * 0.02 * scale, -0.14 * scale, Math.cos(theta) * 0.02 * scale);
          bar.rotation.y = theta;
          topLink.group.add(bar);
        }
      }
      dangles.push(...drape);
    } else if (extra.kind === 'tatters') {
      // Strips of a shirt torn to rags (outfits.js RAGS), hanging from its ragged hem at the edges of the torn front and
      // behind, each on the hips and swinging as he moves; their tips torn to a point.
      const cloth = surface(new THREE.Color(dress.top?.color ?? '#b9ad8e').multiplyScalar(0.9).getHex(), { roughness: 0.95 });
      cloth.side = THREE.DoubleSide;
      const width = (body.lengths.hipSpan / 2 + body.segments.lThigh.muscleRadius * 0.85) * 0.92;
      const depth = body.segments.trunk.muscleRadius * 0.62;
      for (const strip of ragStrips(ragTear(body.inputs.outfit))) {
        const length = (RAGS.strips.shortest + (RAGS.strips.longest - RAGS.strips.shortest) * strip.length) * scale;
        const out = [Math.cos(strip.angle), 0, -Math.sin(strip.angle)];
        const pivot = [out[0] * depth * 1.1, strip.u * body.lengths.trunk, out[2] * width * 1.1];
        const tatter = new Dangle(hips, pivot, [out[0] * 0.15, -1, out[2] * 0.15], length, { sag: 0.6, damping: 0.4, collides: ['trunk', 'leg'] });
        const across = (0.03 + 0.02 * strip.length) * scale;
        const shape = new THREE.Shape([new THREE.Vector2(-across / 2, 0), new THREE.Vector2(across / 2, 0), new THREE.Vector2(across * 0.3, -length * 0.8), new THREE.Vector2(across * 0.05, -length), new THREE.Vector2(-across * 0.35, -length * 0.85)]);
        const piece = new THREE.Mesh(new THREE.ShapeGeometry(shape), cloth);
        // Its face turned out from the body.
        piece.rotation.y = strip.angle + Math.PI / 2;
        tatter.group.add(piece);
        dangles.push(tatter);
      }
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
  if (look === 'steppe') {
    // The tug up the back of a horse archer who leads (his bow in his hands): no cloth, horse-tails hung in a ring
    // under a brass disc and a trident at the top of its pole, standing well clear of his head as the carried one does.
    const height = 1.9 * scale;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * scale, 0.01 * scale, height, 6), surface(0x3a2a1c));
    pole.position.set(back, height / 2 - 0.25 * scale, 0);
    group.add(pole);
    const top = height - 0.25 * scale;
    const brass = surface(0xc8a040, { roughness: 0.4 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * scale, 0.07 * scale, 0.015 * scale, 12), brass);
    disc.position.set(back, top - 0.04 * scale, 0);
    group.add(disc);
    const hair = surface(0x1d1a17, { roughness: 1 });
    const pale = surface(0xe8e2d4, { roughness: 1 });
    for (let tail = 0; tail < 7; tail += 1) {
      const angle = (tail / 7) * Math.PI * 2;
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.035 * scale, 0.6 * scale, 5), tail % 2 ? pale : hair);
      plume.position.set(back + Math.cos(angle) * 0.05 * scale, top - 0.36 * scale, Math.sin(angle) * 0.05 * scale);
      group.add(plume);
    }
    for (const side of [-1, 0, 1]) {
      const prong = new THREE.Mesh(new THREE.ConeGeometry(0.012 * scale, (side ? 0.12 : 0.18) * scale, 5), surface(0xb8bcc2, { roughness: 0.35 }));
      prong.position.set(back, top + (side ? 0.06 : 0.09) * scale, side * 0.04 * scale);
      group.add(prong);
    }
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

/**
 * A machine's battery box on its back (`armor.backBox`): a big dark case
 * across the shoulder blades, its edges and vents picked out in the
 * accent colour (`cloth`).
 */
export function buildBackBox(body, colors) {
  const scale = body.heightM / 1.8;
  const back = body.segments.trunk.skinRadius * 0.62 * 1.32;
  const casing = surface(colors.armor.getHex(), { roughness: 0.55 });
  const accent = surface(colors.cloth.getHex(), { roughness: 0.5 });
  const group = new THREE.Group();
  const add = (size, at, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size.map((value) => value * scale)), material);
    mesh.position.set(...at.map((value) => value * scale));
    mesh.castShadow = true;
    mesh.add(outlineFor(mesh, 0.003));
    group.add(mesh);
  };
  const depth = 0.2;
  const behind = -back / scale - depth / 2;
  add([depth, 0.44, 0.4], [behind, -0.2, 0], casing);
  // The lid's band and the vents in the accent colour.
  add([depth + 0.01, 0.035, 0.41], [behind, 0.0, 0], accent);
  for (const row of [-0.26, -0.31, -0.36]) add([0.01, 0.018, 0.24], [behind - depth / 2 - 0.004, row, 0], accent);
  return group;
}

/**
 * A breathing set on the back (a design's `airPack`), on the collar's frame (x forward, y up the spine, z to the left): a
 * carbon-wrapped cylinder (6.8 L, ~160 mm across and ~520 mm long, its valve and regulator at the bottom) on a backplate, with
 * its harness's shoulder straps; `covered` (a fire-entry suit, worn over the set) the same shape as a hump in the suit's cloth.
 */
export function buildAirPack(body, pack, colors, envMap) {
  const scale = body.heightM / 1.8;
  const back = body.segments.trunk.skinRadius * 0.62 * 1.32;
  const group = new THREE.Group();
  const cylinder = pack.covered ? foilMaterial(envMap, colors.top.getHex(), 'aluminizedQuilt') : surface(pack.color ?? 0x2a2c30, { roughness: 0.45 });
  const frame = pack.covered ? cylinder : surface(0x141416, { roughness: 0.7 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3, envMap });
  const add = (mesh, at) => {
    mesh.position.set(...at.map((value) => value * scale));
    group.add(mesh);
    return mesh;
  };
  const radius = (pack.covered ? 0.1 : 0.08) * scale;
  add(new THREE.Mesh(new THREE.BoxGeometry(0.02 * scale, 0.5 * scale, 0.24 * scale), frame), [-back / scale - 0.012, -0.24, 0]);
  // The cylinder: a tube with domed ends.
  const behind = -back / scale - 0.02 - radius / scale;
  add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.4 * scale, 16), cylinder), [behind, -0.26, 0]);
  for (const end of [-0.06, -0.46]) add(new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 8), cylinder), [behind, end, 0]);
  if (!pack.covered) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.025 * scale, 0.06 * scale, 10), brass), [-back / scale - 0.1, -0.54, 0]);
    // A band of the cylinder's label, and the shoulder straps over the coat.
    add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.08 * scale, 16), surface(pack.band ?? 0xd8b030, { roughness: 0.5 })), [-back / scale - 0.02 - radius / scale, -0.16, 0]);
    // The harness: a strap from the backplate over each shoulder and down the chest.
    for (const side of [1, -1]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(2.1 * back, 0.014 * scale, 0.05 * scale), frame), [0, -0.005, side * 0.1]);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.014 * scale, 0.3 * scale, 0.05 * scale), frame), [back / scale * 1.02, -0.16, side * 0.1]);
    }
  }
  for (const mesh of group.children) {
    mesh.castShadow = true;
    mesh.add(outlineFor(mesh, 0.003));
  }
  return group;
}

/** Which kind of hand an outfit gives. */
export function handKind(inputs, gloved) {
  if (gloved) return 'gloved';
  const fists = outfitOf(inputs).spec.fists;
  if (fists === 'gloved-tactical') return 'tactical';
  if (fists === 'gauntlet') return 'gauntlet';
  if (fists === 'gloved-proximity') return 'proximity';
  return 'bare';
}

