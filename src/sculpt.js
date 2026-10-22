// Landmark-driven ring shapes for the lofted body ('sculpt' style). The loft
// stays what it was (elliptical rings along the bones, same skinning); here
// each ring's outline is bent by anatomy. Every feature is a smooth bump or
// groove at a landmark (a place along the part, and an angle round it), whose
// height comes from how bony, how muscled and how fat that part of this body
// is, so one set of rules draws the starved figure with its collarbones and
// ribs, the athlete with his pecs and abs, and the obese one with his belly
// apron, chest and neck roll. No Three.js: plain numbers.
//
// Two shapes come out of it for each part:
//   skin  the whole outline, detail and all
//   mass  only the broad forms (pecs, bust, belly, hips, buttocks, thick
//         arms and thighs): what a shirt or shorts worn over it follows. The
//         fine anatomy (ribs, abs, collarbones, spine, joint knobs) is not
//         there under cloth, and armour (built on the ring ellipses, with
//         standoff) is left as it was.
// A shape is `(ring, angle) => multiplier` of the ring's ellipse radius: the
// hook the loft already has (`shape`). Angle 0 is the front of the part.

export const SCULPT = {
  // Sides round a ring: the trunk needs the most (a rib or an ab block is a
  // few centimetres across); a limb's knobs and muscles read at fewer.
  trunkSides: 48,
  limbSides: 20,
  // The trunk's rings: a ring every `denseStep` (u: the trunk's length) over
  // the rib cage and belly, where ribs 4 cm apart need three or four rings
  // each to read, and every `sparseStep` over hips and shoulders. Limb rings
  // per unit of each part's baseline count (LOFT.rowDensity's ~1.4).
  denseTrunk: [0.12, 0.72],
  denseStep: 0.0125,
  sparseStep: 0.03,
  limbDensity: 1.9,
  // Fat thickness (m) under which bone shows through, and over which muscle
  // no longer does: a starved body's cover is 3 mm, a lean athlete's ~12.
  boneFatBelow: 0.018,
  boneFatSpan: 0.014,
  leanFatFrom: 0.004,
  leanFatSpan: 0.028,
  // How much of the muscle on show comes from the muscle there is, against
  // the training behind it (the game's exercise level): a heavy man who never
  // trained shows no muscle; skeletal muscle index (kg/m^2) 7 is a thin man's, 13.5 a bodybuilder's.
  bulkFromMuscle: 0.55,
  bulkFromTraining: 0.45,
  // Fat thickness (m) over which a muscle's edges are gone, and under which they are all there.
  definedFrom: 0.019,
  definedTo: 0.007,
  // How much of the bone's showing a fully developed trunk hides.
  muscleCoversBone: 0.85,
  smiThin: 7,
  smiHuge: 6.5,
  // A woman's muscle shows less for the same size (more cover, a smaller frame).
  womanBulk: 0.8,
  // A smoothing of the skin after the lofts: one light pass keeps the ribs.
  relaxPasses: 1,
  relaxAmount: 0.22,
  // Most a shape may stand out from its ring (a share of the radius), so a
  // bump never turns a ring inside out or through a shirt's standoff.
  mostOut: 1.45,
  leastOut: 0.55,
};

const sculptClamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const sculptSmooth = (low, high, x) => {
  const t = sculptClamp((x - low) / (high - low));
  return t * t * (3 - 2 * t);
};
/** A bump of height 1 at `centre`, falling off over `width` either side. */
const sculptHump = (x, centre, width) => Math.exp(-(((x - centre) / width) ** 2));
const SCULPT_TAU = Math.PI * 2;

/** Piecewise-smooth interpolation through [u, value] stops (the loft's own sculptProfile curve). */
export function sculptProfile(stops) {
  return (u) => {
    if (u <= stops[0][0]) return stops[0][1];
    for (let index = 1; index < stops.length; index += 1) {
      const [u0, v0] = stops[index - 1];
      const [u1, v1] = stops[index];
      if (u <= u1) return v0 + (v1 - v0) * sculptSmooth(u0, u1, u);
    }
    return stops.at(-1)[1];
  };
}

/**
 * What the body is made of, as shares between 0 and 1: how bony, how lean
 * (muscle shows through), how developed, and fat by region.
 */
export function sculptTraits(body) {
  const seg = body.segments;
  const female = body.inputs.sex === 'female';
  const fatOf = (key) => Math.max(0, seg[key].skinRadius - seg[key].muscleRadius);
  const bonyOf = (fat) => sculptClamp((SCULPT.boneFatBelow - fat) / SCULPT.boneFatSpan);
  const leanOf = (fat) => sculptClamp(1 - (fat - SCULPT.leanFatFrom) / SCULPT.leanFatSpan);
  const smi = body.muscleKg / body.heightM ** 2;
  const developed = sculptClamp(SCULPT.bulkFromMuscle * ((smi - SCULPT.smiThin) / SCULPT.smiHuge) + SCULPT.bulkFromTraining * body.inputs.exercise, 0, 1.1) * (female ? SCULPT.womanBulk : 1);
  const trunkFat = fatOf('trunk');
  const armFat = (fatOf('lUpperArm') + fatOf('rUpperArm')) / 2;
  const thighFat = (fatOf('lThigh') + fatOf('rThigh')) / 2;
  const shankFat = (fatOf('lShank') + fatOf('rShank')) / 2;
  const foreFat = (fatOf('lForearm') + fatOf('rForearm')) / 2;
  return {
    female,
    developed,
    trunk: { fat: trunkFat, bony: bonyOf(trunkFat), lean: leanOf(trunkFat) },
    arm: { fat: armFat, bony: bonyOf(armFat), lean: leanOf(armFat) },
    fore: { fat: foreFat, bony: bonyOf(foreFat), lean: leanOf(foreFat) },
    thigh: { fat: thighFat, bony: bonyOf(thighFat), lean: leanOf(thighFat) },
    shank: { fat: shankFat, bony: bonyOf(shankFat), lean: leanOf(shankFat) },
    neckIndex: body.neckIndex,
  };
}

// ---- Trunk ------------------------------------------------------------------

// Landmarks up the trunk (0 at the hip joint, 1 at the base of the neck) and
// round it (radians from the front). Named once; see the anatomy sheets.
const SCULPT_TRUNK = {
  // Collarbones: the sternal end, how far the shaft climbs towards the shoulder, which angles it spans.
  clavicle: { at: 0.86, climb: 0.05, from: 0.16, to: 1.5, width: 0.02 },
  // Ribs: the first one drawn, spacing between them, how far they droop towards the front, over which angles and heights.
  ribs: { top: 0.6, spacing: 0.042, droop: 0.1, droopAngle: 2.4, from: 0.34, to: 2.75, low: 0.27, high: 0.66 },
  // The front of the rib cage ends in an arch (the costal margin); below it the belly can sink.
  costal: { centre: 0.34, side: 0.07 },
  // Abdominal blocks (rectus): the first row's height, the spacing of the rows, where the side groove runs.
  abs: { rows: [0.455], period: 0.07, across: 0.23, acrossWidth: 0.1 },
  // Pectoral and bust: centre height, angle, spreads (below the centre the edge is sharper).
  chest: { at: 0.66, angle: 0.55, tallAbove: 0.09, tallBelow: 0.05, wide: 0.46 },
  // Hip bones: the front spine, and the crest running back from it.
  pelvis: { frontAt: 0.085, frontAngle: 1.02, crestTop: 0.17, crestFrom: 1.0, crestTo: 2.7 },
  // Shoulder blades and spine.
  back: { scapulaAt: 0.69, scapulaAngle: 2.55, spineKnob: 0.036 },
  // Belly and flanks, glutes.
  belly: { at: 0.2, tall: 0.17, wide: 0.9 },
  flank: { at: 0.2, angle: 1.5, tall: 0.1, wide: 0.42 },
  glute: { at: -0.035, angle: 2.62, tall: 0.1, wide: 0.5 },
};

/**
 * The trunk's profiles (replacing the loft's own): half-widths and
 * half-depths of the lean body and of the fat on it, along the trunk (u: hip
 * joint 0, base of neck 1; below 0 the crotch, above the shoulders and neck).
 * `lean*` is bone and muscle alone, `fat*` is per metre of fat layer.
 */
export function trunkProfiles(body, traits, ctx) {
  const { L, R, neckR, hipHalf, sculptProfile } = ctx;
  const { female } = traits;
  const { bony } = traits.trunk;
  const dev = traits.developed;
  // A rib cage half-width: the shoulder joints' span narrowed, a barrel wider with lats; a hungry one is slight.
  const chest = L.shoulderSpan * (0.385 + 0.04 * dev - 0.03 * bony);
  const waist = Math.min(hipHalf * (female ? 0.8 : 0.9), chest) * (1 - 0.12 * bony);
  const hips = hipHalf * (female ? 1.07 : 1.0);
  const depthBase = R * (female ? 0.68 : 0.72);
  const leanWidth = sculptProfile([[-0.12, hipHalf * 0.82], [0.02, hips], [0.14, (hips + waist) / 2 * 1.02], [0.3, waist], [0.52, chest * 0.96], [0.66, chest * (1 + 0.04 * dev)], [0.8, L.shoulderSpan * 0.455], [0.92, L.shoulderSpan * 0.34], [1.04, neckR * (1.5 + 0.45 * traits.neckIndex)], [1.12, neckR * 1.15]]);
  const leanDepth = sculptProfile([[-0.12, depthBase * 0.62], [0.02, depthBase * 0.84], [0.2, depthBase * (0.82 - 0.2 * bony)], [0.32, depthBase * (0.8 - 0.22 * bony)], [0.5, depthBase * (0.98 + 0.1 * dev - 0.14 * bony)], [0.66, depthBase * (1.02 + 0.14 * dev - 0.14 * bony)], [0.86, depthBase * (0.78 - 0.08 * bony)], [1.04, neckR * 1.25], [1.12, neckR * 1.05]]);
  // Fat: android in a man (belly, chest, neck), gynoid in a woman (hips, thighs, buttocks, arms), the rest even.
  const hipFat = female ? 1.55 : 1.05;
  const waistFat = female ? 1.15 : 1.65;
  const fatWidth = sculptProfile([[-0.12, 0.9 * hipFat], [0.05, 1.25 * hipFat], [0.3, waistFat], [0.6, female ? 0.85 : 1.1], [0.86, 0.5], [1.04, 0.45], [1.12, 0.25]]);
  const fatDepth = sculptProfile([[-0.12, 0.8], [0.1, female ? 1.2 : 1.05], [0.3, female ? 1.2 : 1.5], [0.62, female ? 1.0 : 1.0], [0.88, 0.5], [1.04, 0.6], [1.12, 0.35]]);
  // The belly carries forward of the spine as fat thickens (and a woman's, lower, with her hips).
  const leanOffset = sculptProfile([[0, -0.012], [0.3, 0], [0.65, 0.012], [1, -0.01]]);
  const fatOffset = sculptProfile([[0, 0.1], [0.25, female ? 0.45 : 0.6], [0.45, 0.35], [0.65, 0.12], [1, 0]]);
  return { leanWidth, leanDepth, leanOffset, fatWidth, fatDepth, fatOffset };
}

/** The signed angle from the front, in (-pi, pi]. */
const sculptFromFront = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

/**
 * Where fat is laid on the trunk, from how much there is: `mass` (metres out
 * from the lean form: the bust, belly, flanks and hips, buttocks, nape and back
 * rolls) and `folds` (metres in: the navel, the belly's lower crease, the
 * flank's fold). A man's goes to belly, flanks, chest and neck, a woman's to
 * hips, buttocks and bust.
 */
export function trunkFat(traits) {
  const { female, developed: dev } = traits;
  const { fat } = traits.trunk;
  const heavy = sculptSmooth(0.03, 0.075, fat);
  const veryHeavy = sculptSmooth(0.06, 0.11, fat);
  const C = SCULPT_TRUNK;
  const android = female ? 0.45 : 1;
  const gynoid = female ? 1 : 0.35;
  return {
    mass: (u, angle) => {
      const fa = Math.abs(sculptFromFront(angle));
      let out = 0;
      // The bust (a woman's), or chest fat (a man's), with a fold hanging under it.
      const chestFat = female ? 0.004 + 0.52 * fat * (0.6 + 0.4 * sculptDeveloped(dev)) : 0.22 * fat * sculptSmooth(0.035, 0.06, fat);
      const tall = u < C.chest.at ? C.chest.tallBelow : C.chest.tallAbove;
      out += chestFat * sculptHump(u, C.chest.at, tall) * sculptHump(fa, C.chest.angle, C.chest.wide);
      if (fat > 0.05) out -= (female ? 0.004 + 0.52 * fat : 0.22 * fat) * 0.14 * sculptHump(u, C.chest.at - 0.1 + 0.03 * sculptClamp(Math.abs(fa - C.chest.angle) * 2), 0.022) * sculptHump(fa, C.chest.angle, C.chest.wide * 0.9);
      // Belly: a soft rounding forward, lower in a man.
      out += fat * 0.45 * android * sculptHump(u, C.belly.at, C.belly.tall) * sculptHump(fa, 0, C.belly.wide) * heavy;
      // Love handles and flanks (a woman's go on the hips, lower).
      out += fat * (0.55 * android * sculptHump(u, C.flank.at, C.flank.tall) + 0.25 * gynoid * sculptHump(u, 0.04, 0.08)) * sculptHump(fa, C.flank.angle, C.flank.wide);
      // Buttocks, heavier with fat (a woman's more).
      out += (0.7 * fat * gynoid * 0.5 + 0.4 * fat * android * 0.5) * sculptHump(u, C.glute.at, C.glute.tall) * sculptHump(fa, C.glute.angle, C.glute.wide);
      // The neck's roll and the upper back's sculptHump.
      out += fat * 0.9 * veryHeavy * sculptHump(u, 1.01, 0.06) * sculptSmooth(1.8, 2.6, fa);
      // Back rolls, and a sagging of the lower back, in the very heavy.
      out += fat * 0.25 * heavy * sculptHump(u, 0.46, 0.05) * sculptSmooth(1.7, 2.5, fa) * (0.5 + 0.5 * Math.cos(((u - 0.36) / 0.09) * Math.PI));
      return out;
    },
    folds: (u, angle) => {
      const fa = Math.abs(sculptFromFront(angle));
      let out = 0;
      // The navel (a dimple, deeper in the heavy).
      out -= (0.003 + 0.012 * heavy) * sculptHump(u, 0.245, 0.016) * sculptHump(fa, 0, 0.07);
      // Waist folds (the belly's lower crease) and the flank's fold in the heavy.
      out -= 0.014 * heavy * sculptHump(u, 0.075, 0.017) * sculptSmooth(0.1, 0.5, 1.5 - fa) * (fa < 2 ? 1 : 0);
      out -= 0.009 * heavy * sculptHump(u, 0.33, 0.018) * sculptHump(fa, 1.4, 0.8);
      return out;
    },
  };
}

/**
 * The trunk's shapes: { skin, mass } for rings of the trunk loft (ring.t is
 * u; the shapes are 1 under the crotch, where the belly's apron hangs).
 */
export function trunkShapes(body, traits, covers = [], armoured = false) {
  const { female, developed: dev } = traits;
  const { fat, lean } = traits.trunk;
  // Muscle covers the bone as fat does: a trained trunk is not a hungry one.
  const bony = traits.trunk.bony * (1 - SCULPT.muscleCoversBone * sculptClamp(dev));
  const heavy = sculptSmooth(0.03, 0.075, fat);
  const C = SCULPT_TRUNK;

  // How much of each landmark shows.
  // Definition: muscle's edges show through skin only under a thin cover (a trained man at 11% fat, not an untrained one at 17%).
  const defined = sculptSmooth(SCULPT.definedFrom, SCULPT.definedTo, fat);
  const clavicleShows = lean ** 1.2 * (0.55 + 0.45 * bony);
  const ribsShow = lean ** 1.8 * (0.05 + 0.95 * bony) * (female ? 0.85 : 1);
  const absShow = sculptSmooth(0.12, 0.5, dev) * defined;
  const bonesShow = lean ** 1.1 * (0.15 + 0.85 * bony);
  const muscleBack = lean ** 1.2 * (0.25 + 0.75 * Math.max(dev, bony * 0.6));

  // Fat: where it is laid on, and the creases between its deposits.
  const fatField = trunkFat(traits);

  /** Metres the surface stands out, from the broad forms (what cloth follows). */
  const massOffset = (u, angle) => {
    const fa = Math.abs(sculptFromFront(angle));
    let out = fatField.mass(u, angle);
    // Pectorals (a man's): a shelf with a sharper lower edge.
    const chestMuscle = female ? 0.01 : 0.006 + 0.026 * dev;
    const tall = u < C.chest.at ? C.chest.tallBelow : C.chest.tallAbove;
    out += chestMuscle * sculptHump(u, C.chest.at, tall) * sculptHump(fa, C.chest.angle, C.chest.wide);
    // Buttocks: round (a trained man's rounder).
    out += (0.012 + 0.014 * dev - 0.012 * bony) * sculptHump(u, C.glute.at, C.glute.tall) * sculptHump(fa, C.glute.angle, C.glute.wide);
    // Lats flare the back above the waist; trapezius slopes up to the neck.
    out += 0.03 * dev * sculptHump(u, 0.58, 0.14) * sculptHump(fa, 1.9, 0.5);
    // (a diamond: from the neck down the spine to mid-back, and out along the shoulder line)
    const spineSide = Math.PI - fa;
    out += (0.008 + 0.034 * dev) * sculptHump(u, 0.95 - 0.2 * (1 - sculptClamp(spineSide / 1.1)), 0.075) * (1 - sculptSmooth(1.2, 1.6, spineSide));
    return out;
  };

  /** Metres the fine anatomy adds (skin only). */
  const detailOffset = (u, angle) => {
    const fa = Math.abs(sculptFromFront(angle));
    const back = Math.cos(angle) < 0;
    let out = 0;

    // Collarbones, with the hollows above and below, and the notch between them.
    if (clavicleShows > 0.02 && fa > C.clavicle.from - 0.1 && fa < C.clavicle.to + 0.2 && Math.cos(angle) > -0.1) {
      const along = sculptClamp((fa - C.clavicle.from) / (C.clavicle.to - C.clavicle.from));
      const centre = C.clavicle.at + C.clavicle.climb * along;
      const window = sculptSmooth(C.clavicle.from - 0.08, C.clavicle.from + 0.05, fa) * (1 - sculptSmooth(C.clavicle.to - 0.1, C.clavicle.to + 0.15, fa));
      const amount = (0.006 + 0.018 * clavicleShows) * window;
      out += amount * (sculptHump(u, centre, C.clavicle.width) - 0.8 * sculptHump(u, centre + 0.05, 0.022) - 0.55 * sculptHump(u, centre - 0.045, 0.026) * bony);
    }
    out -= 0.008 * clavicleShows * sculptHump(u, 0.9, 0.025) * sculptHump(fa, 0, 0.12);

    // Ribs: bands that droop towards the front, drawn between the cage's top and the arch of its lower edge; the sternum stays flat.
    if (ribsShow > 0.02) {
      const droop = C.ribs.droop * (1 - sculptClamp((fa - 0.5) / C.ribs.droopAngle));
      const phase = ((u + droop) / C.ribs.spacing) * SCULPT_TAU;
      const window = sculptSmooth(C.ribs.low - 0.02, C.ribs.low + 0.05, u + droop * 0.6) * (1 - sculptSmooth(C.ribs.high - 0.04, C.ribs.high + 0.02, u))
        * sculptSmooth(C.ribs.from, C.ribs.from + 0.25, fa) * (1 - sculptSmooth(C.ribs.to - 0.2, C.ribs.to + 0.1, fa));
      // Narrow ridges with wide flat intercostal grooves between them.
      out += 0.014 * ribsShow * window * (Math.max(0, Math.cos(phase)) ** 2 - 0.35);
    }
    // The arch of the lower ribs, and the hollow belly under it in the bony.
    if (bony > 0.05) {
      const archAt = C.costal.centre - C.costal.side * sculptClamp(fa / 1.4);
      const below = 1 - sculptSmooth(archAt - 0.07, archAt + 0.01, u);
      out -= 0.03 * bony * below * sculptSmooth(0.1, 0.2, u) * (1 - sculptSmooth(0.9, 1.5, fa)) * (1 - heavy);
      out += 0.006 * bony * sculptHump(u, archAt + 0.005, 0.02) * (1 - sculptSmooth(0.1, 1.7, fa));
    }

    // Abdominal blocks and the groove between them; below the ribs, the side line.
    if (absShow > 0.02) {
      const across = sculptHump(fa, C.abs.across, C.abs.acrossWidth);
      const window = sculptSmooth(0.1, 0.18, u) * (1 - sculptSmooth(0.49, 0.53, u));
      // Four rows of blocks, a groove between each pair.
      const blocks = Math.max(0, Math.cos(((u - C.abs.rows[0]) / C.abs.period) * SCULPT_TAU)) ** 1.8;
      out += 0.024 * absShow * window * across * (blocks - 0.35);
      out -= 0.01 * absShow * window * sculptHump(fa, 0, 0.045) * sculptSmooth(0.1, 0.18, u);
    }

    // Pectoral edge and the sternal groove (a man who trains).
    if (!female) {
      out -= 0.007 * dev * lean * sculptHump(fa, 0, 0.08) * sculptSmooth(0.52, 0.64, u) * (1 - sculptSmooth(0.76, 0.82, u));
      out += 0.005 * dev * lean * sculptHump(u, C.chest.at - 0.075, 0.016) * sculptHump(fa, C.chest.angle, 0.4);
    }
    // Serratus digitations along the side of a lean, trained cage.
    out += 0.004 * dev * lean * sculptHump(fa, 1.2, 0.28) * sculptHump(u, 0.45, 0.07) * Math.cos(((u + 0.02 * fa) / 0.036) * SCULPT_TAU);

    // Hip bones: the front spine, the crest running back, the hollow of the groin below it.
    if (bonesShow > 0.02) {
      out += (0.006 + 0.009 * bony) * bonesShow * sculptHump(u, C.pelvis.frontAt, 0.022) * sculptHump(fa, C.pelvis.frontAngle, 0.2);
      const along = sculptClamp((fa - C.pelvis.crestFrom) / (C.pelvis.crestTo - C.pelvis.crestFrom));
      const crest = 0.075 + (C.pelvis.crestTop - 0.075) * Math.sin(along * Math.PI) * 0.9 + 0.01 * along;
      out += (0.004 + 0.007 * bony) * bonesShow * sculptHump(u, crest, 0.02) * sculptSmooth(C.pelvis.crestFrom - 0.1, C.pelvis.crestFrom + 0.2, fa) * (1 - sculptSmooth(C.pelvis.crestTo - 0.1, C.pelvis.crestTo + 0.05, fa));
      out -= 0.006 * bony * sculptHump(u, 0.01, 0.04) * sculptHump(fa, 0.8, 0.3);
    }
    // The pubic bone's bump, under the belly.
    out += 0.005 * sculptHump(u, -0.09, 0.03) * sculptHump(fa, 0, 0.35) * (1 - heavy);

    // Back: the spine's groove between the erectors in the trained, its knobs in the bony; scapulae; hollows over the sacrum.
    if (back) {
      const centre = sculptHump(fa, Math.PI, 0.09);
      const length = sculptSmooth(0.08, 0.16, u) * (1 - sculptSmooth(0.88, 0.98, u));
      const knob = 0.5 + 0.5 * Math.cos((u / C.back.spineKnob) * SCULPT_TAU);
      out -= 0.007 * muscleBack * (1 - bony) * length * centre;
      out += 0.0062 * bonesShow * bony * length * knob * sculptHump(fa, Math.PI, 0.075);
      out += 0.006 * muscleBack * length * sculptHump(Math.PI - fa, 0.26, 0.11) * (1 - bony * 0.7);
      // Scapula: a plate and its spine, wing-like when starved.
      const blade = sculptHump(u, C.back.scapulaAt, 0.13) * sculptHump(fa, C.back.scapulaAngle, 0.24);
      out += (0.0045 + 0.008 * Math.max(bony, dev * 0.7)) * muscleBack * blade;
      out += 0.005 * bonesShow * sculptHump(u, C.back.scapulaAt + 0.1 - 0.03 * sculptClamp((C.back.scapulaAngle - fa) * 3, -1, 1), 0.02) * sculptHump(fa, C.back.scapulaAngle + 0.25, 0.3);
      out -= 0.007 * lean * sculptHump(u, 0.085, 0.03) * sculptHump(Math.PI - fa, 0.33, 0.08);
      // C7, the knob at the base of the neck.
      out += 0.006 * lean * sculptHump(u, 0.96, 0.025) * centre;
    }
    return out + fatField.folds(u, angle);
  };

  const radius = (ring, angle) => Math.hypot(Math.cos(angle) * ring.depth, Math.sin(angle) * ring.width);
  // Past the hem of the apron nothing is bent; in between, faded in.
  const fadeIn = (u) => sculptSmooth(-0.125, -0.06, u);
  const wrap = (offsetOf) => (ring, angle) => {
    const reach = fadeIn(ring.t);
    if (reach <= 0) return 1;
    const r = radius(ring, angle) || 1e-6;
    const squarish = 1 + 0.045 * reach * Math.sin(2 * angle) ** 2;
    const out = squarish + (offsetOf(ring.t, angle) * reach) / r;
    return sculptClamp(out, SCULPT.leastOut, SCULPT.mostOut);
  };
  // Cloth over a stretch of the trunk (`covers`: [from, to, fade]): its fine anatomy is not drawn there.
  const uncovered = (u) => covers.reduce((share, [from, to, fade]) => share * (1 - sculptSmooth(from - fade, from, u) * (1 - sculptSmooth(to, to + fade, u))), 1);
  // Under armour (built on the ring ellipses) the skin keeps the ellipse: a pectoral or a belly would stand through the plate.
  const bare = armoured ? 0 : 1;
  return { skin: wrap((u, angle) => bare * massOffset(u, angle) + detailOffset(u, angle) * uncovered(u) * bare), mass: wrap(massOffset), detail: detailOffset };
}

// ---- Neck ---------------------------------------------------------------

/**
 * The neck's offsets (metres; t runs from -0.05 at the neck's root to 0.6 at
 * the head): { mass, detail }. Mass is the trapezius slope into the shoulders
 * and the roll under the chin and at the nape; detail the cords (the
 * sternocleidomastoids) in the lean.
 */
export function neckOffsets(traits) {
  const { fat, bony, lean } = traits.trunk;
  const dev = traits.developed;
  const cords = lean * (0.25 + 0.5 * bony + 0.5 * Math.min(1, traits.neckIndex));
  const roll = sculptSmooth(0.045, 0.1, fat);
  return {
    mass: (t, angle) => {
      const fa = Math.abs(sculptFromFront(angle));
      let out = 0;
      // A trapezius slope down into the shoulders, thickening the neck's root.
      out += (0.006 + 0.03 * dev + 0.02 * traits.neckIndex) * (1 - sculptSmooth(-0.05, 0.3, t)) * sculptSmooth(1.2, 2.4, fa);
      // The roll under the chin, and at the nape, with fat.
      out += (0.01 + 0.5 * fat) * roll * sculptHump(t, 0.18, 0.2) * (0.6 + 0.4 * sculptSmooth(1.5, 2.4, fa)) * 0.7;
      return out;
    },
    detail: (t, angle) => {
      const fa = Math.abs(sculptFromFront(angle));
      let out = 0;
      // From behind the ear to the notch between the collarbones.
      out += 0.0085 * cords * sculptHump(fa, 0.62 + 0.25 * (1 - sculptClamp(t / 0.7)), 0.28) * sculptSmooth(-0.1, 0.1, t) * (1 - 0.5 * sculptSmooth(0.4, 0.62, t));
      out -= 0.004 * cords * sculptHump(fa, 0, 0.12) * sculptHump(t, 0.1, 0.12);
      return out;
    },
  };
}

/** The neck's shape for its rings: the broad forms, and (`fine`) the cords. */
export function neckShape(traits, fine = true) {
  const offsets = neckOffsets(traits);
  return (ring, angle) => {
    const r = Math.hypot(Math.cos(angle) * ring.depth, Math.sin(angle) * ring.width) || 1e-6;
    return sculptClamp(1 + (offsets.mass(ring.t, angle) + (fine ? offsets.detail(ring.t, angle) : 0)) / r, SCULPT.leastOut, SCULPT.mostOut);
  };
}

// ---- Limbs ---------------------------------------------------------------

/**
 * Shapes for a limb part's rings (t along the part, angle from the front).
 * `outer` is +1 where the ring's width axis points away from the body (the
 * left arm), -1 where it points in; the legs' width axes point left for both.
 */
export function limbShapes(traits, part, side, covers = [], armoured = false) {
  const { female, developed: dev } = traits;
  const outer = side === 'l' ? 1 : -1;
  const info = traits[part];
  const { fat, bony, lean } = info;
  const muscle = dev * lean;
  const thick = sculptSmooth(0.012, 0.03, fat);
  // +1 on the outside of the limb (a ring's width axis points away from the body on the left side's arm, towards it on the right's), -1 on the inside.
  const out = (angle) => Math.sin(angle) * outer;
  const radius = (ring, angle) => Math.hypot(Math.cos(angle) * ring.depth, Math.sin(angle) * ring.width) || 1e-6;
  const angleOf = (angle) => sculptFromFront(angle);

  const mass = {
    arm: (t, angle) => {
      const fa = angleOf(angle);
      const side = out(angle);
      let off = 0;
      // Deltoid: a cap over the joint, outer side, front and back heads.
      off += (0.006 + 0.013 * muscle + 0.2 * fat) * sculptHump(t, 0.08, 0.15) * (0.5 + 0.5 * Math.max(0, side));
      // Biceps (front) and triceps (back), the groove between them on the inner side.
      off += (0.004 + 0.016 * muscle + 0.25 * fat * 0.3) * sculptHump(t, 0.5, 0.2) * sculptHump(fa, 0, 0.7);
      off += (0.004 + 0.013 * muscle + 0.45 * fat * (female ? 1 : 0.7)) * sculptHump(t, 0.5, 0.2) * sculptHump(Math.abs(fa), Math.PI, 0.65);
      // Fat hangs off the back of the upper arm and swings: the lower arm's underside.
      off += 0.35 * fat * thick * sculptHump(t, 0.62, 0.22) * sculptHump(Math.abs(fa), Math.PI, 0.9);
      return off;
    },
    fore: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      // The forearm's bulk below the elbow: brachioradialis outer-front, flexors inner.
      off += (0.003 + 0.011 * muscle) * sculptHump(t, 0.2, 0.17) * sculptHump(fa - 0.5 * outer, 0, 0.75);
      off += (0.003 + 0.008 * muscle) * sculptHump(t, 0.28, 0.2) * sculptHump(Math.abs(fa), Math.PI, 0.9);
      off += 0.3 * fat * thick * sculptHump(t, 0.3, 0.3);
      return off;
    },
    thigh: (t, angle) => {
      const fa = angleOf(angle);
      const side = out(angle);
      let off = 0;
      // Quadriceps: the outer sweep (vastus lateralis), the rectus down the front, the teardrop above the knee inside.
      off += (0.006 + 0.022 * muscle) * sculptHump(t, 0.5, 0.26) * sculptHump(fa - 0.7 * outer, 0, 0.55);
      off += (0.005 + 0.013 * muscle) * sculptHump(t, 0.45, 0.25) * sculptHump(fa, 0, 0.45);
      off += (0.004 + 0.016 * muscle) * sculptHump(t, 0.82, 0.12) * sculptHump(fa + 0.6 * outer, 0, 0.5);
      // Hamstrings behind; the inner thigh's adductors.
      off += (0.004 + 0.015 * muscle + 0.2 * fat * (female ? 1.2 : 0.7)) * sculptHump(t, 0.45, 0.26) * sculptHump(Math.abs(fa), Math.PI, 0.7);
      off += (0.004 + 0.01 * muscle) * sculptHump(t, 0.3, 0.22) * sculptHump(side, -1, 0.6);
      // Fat: the thigh thickens at the top, its inside and back (more for a woman), with a pad above the knee on the inside.
      off += fat * (female ? 0.8 : 0.5) * thick * sculptHump(t, 0.18, 0.2) * (0.5 + 0.5 * Math.max(0, -side));
      off += 0.45 * fat * thick * sculptHump(t, 0.88, 0.12) * sculptHump(side, -1, 0.9);
      return off;
    },
    shank: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      // The calf: two heads high and behind, the inner head fuller.
      off += (0.005 + 0.016 * muscle) * sculptHump(t, 0.28, 0.17) * (sculptHump(Math.abs(fa), Math.PI - 0.45, 0.45) + 0.4 * sculptHump(Math.abs(fa), Math.PI, 0.3));
      off += 0.35 * fat * thick * sculptHump(t, 0.35, 0.3);
      return off;
    },
  }[part];

  const detail = {
    arm: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      // The elbow's point (the olecranon) behind, the humerus's epicondyles at the sides, more with no flesh on them.
      off += (0.004 + 0.01 * bony) * sculptHump(t, 0.97, 0.06) * sculptHump(Math.abs(fa), Math.PI, 0.7);
      off += 0.005 * bony * sculptHump(t, 0.95, 0.07) * sculptHump(Math.abs(fa), Math.PI / 2, 0.5);
      // The groove between the biceps and triceps, in the trained.
      off -= 0.004 * muscle * sculptHump(t, 0.5, 0.2) * sculptHump(Math.abs(fa), Math.PI / 2, 0.22);
      // The acromion and the head of the humerus, seen in the very thin.
      off += 0.006 * bony * sculptHump(t, -0.08, 0.1) * sculptHump(angleOf(angle) * outer, Math.PI / 2, 0.8);
      return off;
    },
    fore: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      off += 0.006 * bony * sculptHump(t, 0.02, 0.06) * sculptHump(Math.abs(fa), Math.PI, 0.7);
      // The wrist's bone knobs, and the tendons on its back.
      off += 0.006 * bony * sculptHump(t, 0.95, 0.05) * sculptHump(Math.abs(fa), Math.PI / 2, 0.5);
      off -= 0.004 * muscle * sculptHump(t, 0.3, 0.18) * sculptHump(Math.abs(fa), Math.PI / 2, 0.2);
      return off;
    },
    thigh: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      // The knee: the kneecap in front, the condyles at the sides, knobby when there is no flesh.
      off += (0.002 + 0.009 * bony) * sculptHump(t, 1.0, 0.07) * sculptHump(fa, 0, 0.5);
      off += 0.007 * bony * sculptHump(t, 0.98, 0.07) * sculptHump(Math.abs(fa), Math.PI / 2, 0.5);
      // The groove between the quadriceps and the hamstrings, along the side.
      off -= 0.004 * muscle * sculptHump(t, 0.5, 0.25) * sculptHump(Math.abs(fa), Math.PI / 2 + 0.1, 0.18);
      // The great trochanter at the hip, in the thin.
      off += 0.007 * bony * sculptHump(t, -0.02, 0.07) * sculptHump(angleOf(angle) * outer, Math.PI / 2, 0.55);
      return off;
    },
    shank: (t, angle) => {
      const fa = angleOf(angle);
      let off = 0;
      // The shin's crest, the front of the tibia, sharper when thin; the knee below it.
      off += (0.002 + 0.007 * bony) * sculptHump(t, 0.4, 0.4) * sculptHump(fa, 0, 0.2);
      off += (0.002 + 0.008 * bony) * sculptHump(t, -0.02, 0.07) * sculptHump(fa, 0, 0.5);
      off += 0.006 * bony * sculptHump(t, 0.05, 0.07) * sculptHump(Math.abs(fa), Math.PI / 2, 0.5);
      // The ankle bones, and the Achilles tendon's narrowing.
      off += 0.007 * sculptHump(t, 0.93, 0.045) * sculptHump(Math.abs(fa), Math.PI / 2, 0.45) * (0.5 + 0.5 * lean);
      return off;
    },
  }[part];

  const make = (offsetOf) => (ring, angle) => sculptClamp(1 + offsetOf(ring.t, angle) / radius(ring, angle), SCULPT.leastOut, SCULPT.mostOut);
  // Cloth over a stretch of the limb (`covers`: [from, to]): the bone and tendon knobs under it are not drawn.
  const uncovered = (t) => covers.reduce((share, [from, to]) => share * (1 - sculptSmooth(from - 0.05, from, t) * (1 - sculptSmooth(to, to + 0.05, t))), 1);
  const bare = armoured ? 0 : 1;
  return { skin: make((t, angle) => bare * (mass(t, angle) + detail(t, angle) * uncovered(t))), mass: make(mass), detail };
}

function sculptDeveloped(dev) {
  return sculptClamp(dev);
}
