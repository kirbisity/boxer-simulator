// A low-polygon body, built the way game characters are: each part is a
// loft of elliptical rings along its bones, with a designed sculptProfile (the
// deltoid cap, the biceps, the narrow elbow, the calf), and the parts
// overlap where they meet rather than being fused. ~3k triangles for the
// whole body, and no lumps: every ring is a clean ellipse. 'faceted' drops to
// seven sides and flat normals, for a low-poly art look.

import { buildBody, FRAMES, P } from './body.js';
import { BASE_BODY, baseBindJoints, baseBodyAvailable, baseHeatBones, baseBodyMesh, baseBodyUvs, baseStarvation, measureBaseBody, placeBaseBody } from './basebody.js';
import { relax, skinWeights, skinWeightsSteps } from './bodymesh.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';
import { factionOf, glovedFists, outfitOf, RAGS, ragHemTorn, ragSleeveTorn, ragTear, ragTorn } from './outfits.js';
import { ARMOUR_EDGES, ARMOUR_TILES, armourTileOf, clothMaterialOf, clothUvAt, DETAIL_ARMOUR, DETAIL_MAPS, isLacedTile, mailUv, measureRings, pieceMaterial, plateUvAt, stripUv, tileSize, tileUv } from './detailmaps.js';
import { detailUv, FLAT_UV } from './skindetail.js';
import { SCULPT, SCULPT_TRUNK, limbShapes, sculptProfile, neckShape, sculptCoverShare, sculptTraits, trunkProfiles, trunkShapes } from './sculpt.js';
import { SLOSH_BONES, sloshFigures, sloshWeights } from './fatslosh.js';
import { ribDroop, RULES, rulesProfile, rulesShape, rulesTraits, trunkRule, trunkSilhouette } from './skinrules.js';

// The loft's own profiles (eased stop to stop), by a name of their own: the builder's `sculptProfile` is this or the rules' smooth one.
// (Not an aliased import: the one-file bundle strips imports, so an alias would name nothing.)
const stepProfile = sculptProfile;

// Tops: where the hem and neckline sit along the trunk (0 hips, 1 neck),
// how far the cloth stands off the skin, how long the sleeves run (a share of
// the upper arm; above 1, on down the forearm), and any layer beneath.
export const TOPS = {
  sportsBra: { hem: 0.56, neck: 0.86, loose: 1.05, sleeve: 0 },
  tank: { hem: 0.04, neck: 0.95, loose: 1.05, sleeve: 0 },
  tee: { hem: 0.02, neck: 0.98, loose: 1.06, sleeve: 0.5, sleeveLoose: 1.22 },
  longsleeve: { hem: 0, neck: 0.99, loose: 1.05, sleeve: 1.85, sleeveLoose: 1.16 },
  compression: { hem: 0.02, neck: 0.99, loose: 1.03, sleeve: 1.85, sleeveLoose: 1.08 },
  jacket: { hem: -0.1, neck: 1.0, loose: 1.11, sleeve: 1.85, sleeveLoose: 1.24, ribbed: true },
  hoodie: { hem: -0.1, neck: 1.0, loose: 1.11, sleeve: 1.8, sleeveLoose: 1.24, ribbed: true },
  puffer: { hem: -0.06, neck: 0.98, loose: 1.21, sleeve: 0, inner: 'longsleeve' },
  flannel: { hem: -0.08, neck: 0.99, loose: 1.1, sleeve: 1.82, sleeveLoose: 1.2 },
  suit: { hem: -0.16, neck: 0.99, loose: 1.09, sleeve: 1.85, sleeveLoose: 1.2 },
  waistcoat: { hem: -0.02, neck: 0.93, loose: 1.08, sleeve: 0, inner: 'longsleeve' },
  aloha: { hem: -0.06, neck: 0.98, loose: 1.11, sleeve: 0.55, sleeveLoose: 1.3 },
  haramaki: { hem: -0.02, neck: 0.45, loose: 1.05, sleeve: 0 },
  // A ball gown's bodice, off the shoulder, with short puffed sleeves.
  bodice: { hem: 0, neck: 0.86, loose: 1.04, sleeve: 0.32, sleeveLoose: 1.55 },
  // A kosode worn for the road: wide sleeves to below the elbow, wrapped across, its skirt tucked into the hakama.
  // `sleeveFlare`: a sleeve cut straight and wide (flaredSleeve): close at the shoulder, this many times the elbow's breadth at its mouth.
  // `sleeveHang`: the sleeve close round the arm instead, its bag hanging this far (m) below it, sewn shut at the end.
  kosode: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.6, sleeveLoose: 1.3, sleeveFlare: 1.15, sleeveHang: 0.2 },
  // A medieval tunic: to the waist as a shirt, then a skirt to mid-thigh (`skirt`, thigh shares), belted.
  tunic: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.7, sleeveLoose: 1.26, skirt: 0.5 },
  // A shirt worn to rags (outfits.js RAGS: where it is torn away, each man's own): a piece of cloth wrapped round the trunk, lofted
  // to below its lowest jag and down the arm past the longest sleeve, then cut. Coarse on purpose (`torn`: `rings` and `sides` for
  // the trunk, `sleeveRings` and `sleeveSides` for a sleeve): whole quads go, so the opening is a few big notches and the hem
  // jags by the ring spacing; a few hundred triangles in all.
  // A firefighter's turnout coat (a proximity or fire-entry suit's): loose, long-sleeved to the glove, its skirt to mid-thigh
  // over the trousers, not belted (`unbelted`), its storm flap down the front.
  turnout: { hem: -0.1, neck: 1.0, loose: 1.2, sleeve: 1.9, sleeveLoose: 1.36, skirt: 0.5, unbelted: true },
  rags: { hem: 0.03, neck: 0.96, loose: 1.1, sleeve: 0.9, sleeveLoose: 1.3, torn: { rings: 12, sides: 14, sleeveRings: 4, sleeveSides: 8 } },
};

export const LOFT = {
  // A corset: the waist drawn in by `cinch` of its width and depth, most at
  // `at` up the trunk (pelvis 0, neck 1), fading over `span` either way.
  corset: { cinch: 0.26, at: 0.32, span: 0.13 },
  // Gown skirts: the hem (thigh lengths below the waist), the bell's flare
  // out to the sides (`flare`) and front to back (`depthFlare`), and a bustle
  // standing out behind (a share of the waist's depth) a third of the way down;
  // a narrow skirt is let out over the hips (`hips`) so a stride stays inside it.
  gowns: {
    crinoline: { hem: 1.35, flare: 1.4, depthFlare: 0.98 },
    ball: { hem: 1.45, flare: 2.3, depthFlare: 4 },
    bustle: { hem: 1.45, flare: 0.6, depthFlare: 0.8, bustle: 2.2, hips: 0.3 },
    // A gothic bubble skirt: short, puffed out round the hips (`balloon`: the
    // flare swells and is gathered back in at the hem) over bloomers.
    bubble: { hem: 0.5, flare: 0.75, depthFlare: 1.3, balloon: true, hips: 0.25 },
    // A tiered skirt to mid-thigh: `tiers` ruffles, each flaring out from
    // under the one above (a lolita's petticoated skirt).
    tiered: { hem: 0.62, flare: 0.75, depthFlare: 0.9, tiers: 3, hips: 0.2 },
    // A mini draped skirt, falling straight from the hips (a train behind it makes a high-low hem).
    drape: { hem: 0.26, flare: 0.5, depthFlare: 0.55, hips: 0.2 },
  },
  // Belly: fat layer thickness (m) past which the abdomen bulges and hangs;
  // how far forward it bulges, and how far below the waistband it hangs,
  // per metre of layer past that.
  bellyFrom: 0.035,
  bellyScale: 0.9,
  bellyDrop: 2.2,
  // The base mesh's belly (body style 'base', baseBelly): one rounded mass, not a deeper ring. Its middle `centre` up the trunk,
  // below the navel (0.26: the lower abdomen carries most of the fat, subcutaneous and visceral), lowered by `dropShare` of its
  // hang; it reaches `tall` (u) up and down from there (from the rib margin to the groin) and `wide` (rad) round from the front
  // (to the flanks). Its depth is bellyScale's, its foot's hang bellyDrop's; both fall to nothing at its edge with a flat slope,
  // so it meets the body without a ledge.
  // The fold under it, where a waistband sits on a big belly, `foldShare` of its reach below its middle; the waistband's own top
  // (`waistband`, t: the trunks' band) is lowered to it.
  bellyBall: { centre: 0.18, dropShare: 0.5, tall: 0.26, wide: 1.5, foldShare: 0.5 },
  waistband: 0.25,
  // The fat masses that follow the frame (fatslosh.js), on the base mesh's trunk: the belly's mass reaches `bellyAcross` of the
  // trunk's half-width round it and `bellyOut` of its half-depth out from its middle; each breast and buttock is a ball of
  // `ballShare` of the trunk's half-width there, centred on the trunk's surface at its sculpt.js landmark.
  // How far below the hip joint (t, trunk lengths) the base meshes' crotch lies: the male's at 0.454 of height, his hips at 0.53,
  // his trunk 0.27 long (-0.28); the female's at 0.499 (-0.11). Shorts on the base mesh are lofted down to the lower.
  baseCrotch: -0.28,
  // A joint covered through on the base mesh (closeCoveredJoints): a piece reaching a part's top (t past `top`: the trunk's at its
  // shoulders, a limb's at its far joint) or its root (t under `root`, at or above the joint) closes it with its neighbour's;
  // a closed stretch then runs `far` (t) on past the joint.
  closedJoint: { top: { trunk: 0.9, limb: 0.9 }, root: 0.05, far: 10 },
  // (`ballOn`: a breast's or buttock's ball is set on the outermost skin along its line out within this share of its radius.)
  slosh: { bellyAcross: 1.05, bellyOut: 0.9, ballShare: 0.42, ballOn: 0.3, ballSwing: 0.5, midlineBand: 0.008 },
  // Clothes and armour fitted to the base mesh (fitClothToBase): a piece's point clears the skin of its part within `across`
  // (m) of its line out (about a triangle's breadth of the base mesh) and up to `deeper` (m) out past it (a big belly's 3-4 cm
  // over its ring, a breast's 5-6 cm past a top's; the shoulder's cap 10 cm out past the trunk's top ring is not counted); a ring is on a part whose axis it
  // runs along (cosine over `parallel`) within `onLine` (m) of it sideways; the skin is given `clear` more (its points are the
  // triangles' corners: a triangle's middle stands a little nearer). Only the skin wholly on its part counts (its blend into a
  // neighbour under `ownBlend`), and not flesh within an arm's own reach, `armReach` of its ring's radius round its axis from
  // `armFrom` (t, above the shoulder joint) to the elbow.
  // `overhang` (m): the belly's dome past which a point of it hangs over a waistband rather than under it.
  // `sampling`: the skin's faces wider than `across` are sampled within, this share of `across` apart. `tuck` (m): on a family
  // body the skin is kept this far in under a piece's end ring (skinInTheOpen): a waistband stands 2-3 cm off a big belly's foot.
  // `leanRing` (m): the radius of the ring a soft piece's inflate was drawn on (laidOver): a lean waist, 22 cm deep and 30 wide
  // (ANSUR II men at BMI 22: waist depth 21.6, breadth 30.5 cm), taken at its mean.
  // Layers kept inside one another (keepLayersInside): cells `along` (t) by 1/`around` of the way round, a point held by its own
  // and `spread` cells either side round; a layer counts as outer when it stands off its ring `rankGap` more (a share of the
  // ring's radius); what lies beneath is drawn `margin` (m: a few millimetres, the thickness of cloth) inside it.
  // (`reach`: rows either way an outer piece's rings are looked for, its rings standing up to a sixth of a part apart.)
  // (`endReach` (t): how far past a piece's end ring it still holds what is beneath, half a ring's spacing; `trunkFoot` (t):
  // below this a trunk piece is also checked against the thighs' pieces, from `thighRoot` (t) down each thigh; `mostPull` (m): the
  // most an arm's skin is drawn in under a trunk piece, 3 cm; an arm lying against a top's side lies further out; `hemPull` (m):
  // the most skin just past a piece's end ring is drawn in under its hem, 1 cm, about the cloth's own standoff off the skin;
  // `hideGap` (m): what lies within a piece's rings is left out only if that piece's surface is this near it, 3 cm, a padded
  // coat's thickness: a skirt or a coat's hem standing clear of the legs is open beneath; `hemStand` (m): how far a piece's upper
  // hem stands past the skin under it, the cloth's thickness; `skinMargin` (m): how far the skin is drawn inside a piece over it.)
  layers: { along: 0.03, around: 36, spread: 1, reach: 6, rankGap: 0.005, margin: 0.004, endReach: 0.04, trunkFoot: 0.05, thighRoot: -0.3, mostPull: 0.03, hemPull: 0.01, hideGap: 0.03, hemStand: 0.004, skinMargin: 0.008 },
  // (`alongBand`, m: how far up or down the part a skin point may lie from a piece's point and still hold it out: about one ring
  // of the base mesh, 1.5 cm.)
  // (`tightest`: a piece is drawn in to the skin as well as out, where the modelled body is slimmer than the ring (its waist),
  // but to no less than this share of its ring: a waistband hugs the hips.)
  // A collar up the trapezius (raiseCollars): away from the front by `from` (rad), in `sectors` round the trunk (and `spread`
  // either side, with no dip between two higher sectors `bridge` or fewer apart), to skin out at `neckShare` of the neck's
  // radius or more, stood `standoff` (m, times the piece's own standoff share) off it.
  collar: { from: 0.7, sectors: 48, spread: 1, bridge: 10, neckShare: 1.1, standoff: 0.006 },
  // The shoulder's turn into the arm on the base mesh (blendShoulders): the arm's share eases from `from` to `to` (t of the
  // upper arm from its joint: from 10 cm above it on a man's 0.33 m upper arm, over the cap, to a quarter of the way down the
  // shaft), and the blend fades out between `radial` (shares of the arm's ring radius: the cap and the armpit's fold, not the
  // flank or the chest beside them).
  shoulder: { from: -0.3, to: 0.25, radial: [1.3, 2] },
  // The base skin's normals smoothed over its surface (weldBaseNormals): `passes` rounds of each point's and its neighbours' mean
  // (one round reaches an edge each way, about 1.5 cm on a man: the full model's softness; two flattened the pecs too).
  baseNormals: { passes: 1 },
  // The arm's forms at the mesh's scale (baseArmForms): a muscle's height when fully shown (m: a bodybuilder's biceps and
  // deltoid stand 2-3 cm over the shaft between them, a fit arm's, at a third of that showing, about a centimetre), a joint's
  // (the elbow's point, its crease, the wrist's slimming: a centimetre and a half on a bony arm). Both are read at the fight
  // camera's distance (3-4 m, the arm 60-80 px tall): at 2.5 cm and 0.8 cm the forms were there in a close view and gone at
  // the fight's, the arm a smooth tube. `carried`, by sex, how much of the muscles' and the joints' forms the model is made with
  // at its reference build: the male model is lean and defined, but decimated to a fighter's 8k triangles (edges 1.5 cm) its
  // arm keeps only the broad masses, about half the muscle's relief and none of the elbow's point or the wrist's slimming; with
  // all of it taken as carried, a thin or average man's arm lost 1-2 cm of deltoid and biceps against the model and an athletic
  // one's got nothing, and no man showed an elbow. The female model is smooth.
  // `jointSpan`: how far along the part (t, either way) a joint's forms reach, 0.13 (4 cm on an upper arm).
  armForms: { muscle: 0.06, joint: 0.022, jointSpan: 0.13, carried: { male: { muscle: 0.5, joint: 0 }, female: { muscle: 0, joint: 0 } } },
  // A worn point takes the bone-heat weights of the skin point nearest its weight position, looked for within this (m) round it.
  // `bones`: the model's bones (basebody-data.js heatBones) a worn point on each part may take ('*' its side): its own and its
  // parent's across the joint it starts at; a trunk piece the trunk's alone (the game's pelvis, spine and chest).
  // How wasted a body's shoulders are by its BMI (baseWasting): none at `from`, all at `to`.
  wasting: { from: 22, to: 14 },
  // The family of builds' places in the plane of fat and lean mass (baseFamilyWeights): each build's fat mass index and
  // fat-free mass index, kg/m², at the model's own height. Its BMI is by its own volume (tools/blender/family/composition.py:
  // the mesh's openings capped, a density from its fat share by Siri's two compartments, fat 0.9 and lean 1.1 kg/L, and 2.2
  // for the head, hands and feet the mesh has not: a tenth of an ordinary body, Winter 2009's segment table), which comes out
  // at the BMI each fed build was fitted to within 2% (a man's 22.7, 27.0, 32.8 and 39.4 for 22.5, 27, 33 and 40); the
  // emaciated builds, fitted at 14, weigh 13.3 as drawn (their waists drawn in and their arms thinned since). Its fat share:
  // an ordinary and a fat build's from Deurenberg, Weststrate and Seidell's line at age 30 (1991, Br J Nutr 65:105: 1.2 BMI +
  // 0.23 age − 10.8 for a man − 5.4, %); the muscular man's the reference build's own 11%, an athletic woman's 20%; an
  // emaciated body's 5% and 9%, its essential fat nearly gone.
  // Past F3, the fattest build a tape was found for, a body is drawn by its volume and not by its place along the line: it is
  // a share of F4 (tools/blender/family/swell.py: F3 grown as fat grows to the game's fattest body, a BMI of 100 on the line
  // from F2 through F3), the share whose mix holds what the body weighs at its fat share, by the same densities (`density`,
  // kg/m³, Siri's two compartments) and the same `rest` (the BMI of the head, hands and feet the mesh has not) as the builds
  // were placed with. `swell`: the volume that mix holds over F3's, statures cubed, the terms of its cube in the share
  // (swell.py prints them from the builds as drawn: every point moving in a line, a mix's volume is a cube exactly).
  // `muscleMost`: the most of the muscular build's gain over the ordinary one a body takes (2: a fat-free mass index of about
  // 28 on a lean man, past the 25 Kouri et al. found the ceiling without drugs, 1995, Clin J Sport Med 5:223), and
  // `muscleLeast` the most of it taken off a body with less lean mass than the line has at its fat (half: an unused frame;
  // further and the model's forms turn inside out). That least fades to nothing at the emaciated build, which has no muscle
  // left to take off (less the muscular build's gain it was a shape of its own, not her: notched under the collarbones, its
  // shoulders sunk): the lean such a body lacks is taken as wasting along the line instead, mass for mass. `wasteMost`: the
  // most of the emaciated build's loss from the ordinary one (1.55: what the game's thinnest body, a BMI of 10, took of that
  // build as first fitted, at 14, its limbs thinned towards the bone. Of the build as it stands, 13.3, and drawn in by its
  // weight (frame, below), such a body takes 1.25 on a medium frame and 1.4 on a large one: the bound is past the game's range).
  // (The places and the swell are the builds' as they weighed before their necks were slimmed and their shoulders lowered and
  // lightened (girdle.py NECK.slim, GIRDLE.rise, TRAPEZIUS.keep, DELTOID.keep), not composition.py's and swell.py's printout of
  // them since, which reads each 1 to 4% lighter (an ordinary man's [3.89, 18.4]): placed by that, a body of a given weight
  // took more of the fatter builds and came out fuller below the shoulders. What was taken off the neck and shoulders is taken
  // off the picture, not given back to the trunk.)
  family: {
    male: { E: [0.66, 12.62], N: [4.07, 18.62], M: [2.85, 23.08], F1: [6.22, 20.75], F2: [9.83, 22.93], F3: [14.94, 24.43] },
    female: { E: [1.2, 12.11], N: [5.91, 15.67], M: [4.71, 18.83], F1: [9.08, 17.81], F2: [13.62, 19.45], F3: [19.14, 20.18] },
    muscleMost: 2, muscleLeast: 0.5, wasteMost: 1.55,
    swell: { male: [0.02345, 0.01071, 0.001684], female: [0.02607, 0.01163, 0.001549] }, density: { fat: 900, lean: 1100 }, rest: 2.2,
  },
  // How broad a body's skeleton is drawn (baseFrame): by its frame, and under the ordinary build a little by its weight.
  // `widths`: a small and a large frame's, against a medium one's. At a given stature and BMI ANSUR II's breadths between the
  // acromia spread by 3.5% (4082 men) and 4.0% (1986 women): a tenth either way is two and a half of those, the narrowest and
  // the broadest of some hundred and fifty people, frames told apart at a glance (the rig's own, body.js FRAMES, stand 0.94
  // and 1.07 apart: the skin's joints are set in or out of the rig's by the difference, baseBindJoints).
  // `weight`: the power of BMI a bone breadth goes by at a given stature in that survey (BMIs 19 to 37): 0.12 and 0.07 between
  // the acromia, 0.11 and 0.10 across the ankle, 0.12 and 0.11 across the hand; where the breadths that are flesh go by 0.36
  // (across the deltoids, the hips). The fed builds were fitted to that survey's breadths at their own weights and carry it
  // in their skin; the emaciated one is a sculpt set on the ordinary skeleton, so it is from the ordinary build down that
  // the rule draws it in (the survey has nobody that thin: its slope is carried on down as it stands, 5% at a BMI of 13).
  // `section`: the power of that breadth a body's volume goes by at its build: the trunk, half of it, broadens across and not
  // in depth, the limbs, two fifths, both ways, the head, hands and feet not at all: 0.5 + 2 × 0.4. A body is looked up
  // among the builds at its mass over that, so at one weight a broad frame is a leaner build drawn wider: as in the survey,
  // where at a given stature and BMI 1% more between the acromia goes with 0.4 to 0.5% more across the deltoids and 0.2 to
  // 0.4% more across the chest (the builds drawn so give 0.6 and 0.4), and with a chest 0.2% shallower and a waist 0.2%
  // narrower.
  frame: { widths: { small: 0.9, medium: 1, large: 1.1 }, weight: 0.1, section: 1.3 },
  // What lies over the emaciated build's bones on a fuller body (baseBoneRelief), m of soft tissue at the model's height for
  // each kg/m² more than that build has. `fat`: an ordinary man's fold of skin pinched at the chest or under the shoulder blade
  // is some 12 mm, two layers, 3 to 4 mm of it skin: 4 mm of fat a layer for his 3.4 kg/m² over the emaciated build's.
  // `lean`: his pectoral is some 20 mm thick over the chest's ribs, and a starved body keeps under half its muscle (its
  // organs and bones it keeps): 11 mm more for his 5.5 kg/m² more. The chest's cover stands for the whole relief's (the
  // flank's serratus and oblique add half that): the chest's ribs face the viewer, and at the flank's cover a man of ordinary
  // build was drawn with a rib cage on his chest. Estimates from typical figures, not one study's table. `spacing`: from one
  // rib to the next at the side, m. `bucket`: bodies share skin maps (skintex.js compositionKey, 6 mm of fat to a bucket) only
  // where the relief they show is within this of each other (a 20th of it, 0.5 mm of a hip bone's 10 mm crest): the relief
  // fades over a few kg/m², and a man of BMI 22 wore the ribs made for one of 19. `sculpt`: that build's indices as its relief
  // was baked over it, a BMI of 14.2: before its waist was drawn in and its arms thinned (tools/blender/family girdle.py),
  // which took mass off it and nothing off its ribs (composition.py even).
  boneCover: { fat: 0.0012, lean: 0.002, spacing: 0.028, bucket: 0.05, sculpt: { male: [0.71, 13.53], female: [1.28, 12.89] } },
  // The neck's girth (baseNeckGirth), m: at BMI 22, per unit of BMI, for full training (exercise 1: the trapezius and
  // sternocleidomastoid grown), at this height (scaled with the body's). `lean`: per unit of BMI under 22. The published line
  // is of the fed, whose necks differ by their fat; a wasting body loses the neck's muscle with the rest, and its neck is a
  // column on the spine: the line from the ordinary neck to the emaciated build's at its BMI of 14, drawn 6% under the
  // emaciated reference's own (27 cm round at 1.68 m, and a man's by the builds' ratio, 300 mm to 270).
  // `slim`: the share of that girth the neck is drawn at, the builds' own columns under it drawn in by the same share
  // (tools/blender/family girdle.py NECK.slim: the two are one dial); 1 the survey's neck.
  neck: { slim: 0.85, male: { at22: 0.375, perBmi: 0.005, lean: 0.012, trained: 0.025, height: 1.78 }, female: { at22: 0.325, perBmi: 0.0033, lean: 0.0094, trained: 0.012, height: 1.65 } },
  heat: { reach: 0.06, bones: { trunk: ['trunk', 'lThigh', 'rThigh'], neck: ['neck', 'trunk'], '*Upper': ['*UpperArm', '*Clavicle', 'trunk'], '*Fore': ['*Forearm', '*UpperArm'], '*Thigh': ['*Thigh', 'trunk'], '*Shin': ['*Shin', '*Thigh'] } },
  // PROOF OF CONCEPT (shoulder-poc): the armpit's hand-over from the trunk's bones to the upper arm's made narrow. Below the
  // shoulder's cap (t of the upper arm from `from` to `to`, eased) and on the arm's inner side, facing the trunk, the arm's share of
  // a point (upper arm and forearm) and the rest's are each raised to the power 1 + `sharpen` and summed to one again: whichever
  // carries most of a point carries more, so the flank stays the trunk's and the arm's inner face the arm's, and how the rest is
  // parted among the trunk's own bones is left alone. Blender's bone heat spreads them across the whole armpit, and
  // a lowered or raised arm dragged the flank with it into one webbed surface, a tube from the ribs to the elbow.
  armpit: { sharpen: 2, from: [-0.02, 0.06], to: [0.45, 0.6] },
  // (`alongPasses`: rounds a piece's fit is smoothed ring to ring, fitClothToBase: two, a ring's reach to the next and the one
  // after.)
  // (`kinds`: how closely each kind of piece is cut to the body, by what it is made of (stiffnessOf; `soft`: cloth, mail and
  // padding). `squeeze`: of the flesh standing out past the ring the piece was drawn on, the share it does not enclose: a
  // fitted plate is cut to the lean frame and presses in what is soft over it, and the body under it is not seen. `waist`:
  // the share of its thickness off the body it keeps at the trunk's waist (all of it at the chest's full breadth): a cuirass
  // rests on the waist and stands off the chest; the waist looked for within `waistIn` of the trunk's length. `ribs`: the share
  // of its thickness a cuirass keeps at its side, where it is cut to the rib cage.)
  fit: { kinds: { plate: { squeeze: 0.8, waist: 0.25 }, rows: { squeeze: 0.6, waist: 0.5 }, coat: { squeeze: 0.4, waist: 0.75 }, panel: { squeeze: 0.4, waist: 0.75 }, hung: { squeeze: 0.4, waist: 0.75 }, soft: { squeeze: 0, waist: 1 } },
    ribs: 0.6, waistIn: [0.1, 0.6], alongPasses: 2, tightest: 0.7, alongBand: 0.015, hardSpan: 0.8, overhang: 0.005, across: 0.03, sampling: 0.5, tuck: 0.03, deeper: 0.07, parallel: 0.999, onLine: 0.03, clear: 1.02, ownBlend: 0.2, armReach: 1.6, armFrom: -0.25, herReach: 0.6, leanRing: 0.13 },
  // Trunk lean radius (m) below which the body looks wasted, and over what
  // span it reaches the BMI floor's look (~0.107 m for a 180 cm man).
  wastingFrom: 0.135,
  wastingSpan: 0.03,
  sides: 18,
  facetedSides: 7,
  // Rings per unit of each part's count; above 1 is denser along the limbs.
  rowDensity: 1.4,
  // Lamellae drawn as plates (a flagship's armour, drawn in full): each a
  // rounded-top plate standing `lift` (share of the radius) off the piece,
  // its foot a further `tilt` out so the rows overlap like scales; `width`
  // of its column (the rest a dark gap of lacing), reaching `overlap` of a
  // row down over the next; two punched holes (`holes`: heights up the plate,
  // `hole`: size as a share of the plate's width and height).
  lamellae: { lift: 0.035, tilt: 0.03, width: 0.86, overlap: 0.3, shoulder: 0.78, holes: [0.62, 0.36], hole: [0.26, 0.11] },
  // Laminated plate (lames): each band stands out at its lower edge by `tilt`
  // over the next (`overlap` of a band beneath it), a dark edge line `edge`
  // of a band deep, and rivets (`rivets` round, `rivet` rad across) on each.
  lames: { lift: 0.03, tilt: 0.06, overlap: 0.25, edge: 0.14, steps: 18, rivets: 4, rivet: 0.05 },
  // Splints sewn to a cloth guard (splintsOn): spread through `over` (rad either side of the piece's front), each `wide` of its
  // share of that across and `lift` proud of the cloth (a share of the piece's radius); the cords that tie the guard on, bands
  // round it at `ties` (shares down the piece), each `tie` of the piece deep and `tieLift` proud.
  splints: { over: 2.2, wide: 0.55, lift: 0.045, ties: [0.1, 0.9], tie: 0.025, tieLift: 0.07, steps: 14 },
  // A plate harness's edges with the detail maps (harnessEdgesOn): a band `depth` (m; at most `most` of a short piece) at each
  // end of a piece, `lift` (share of the radius) proud of it; a couter's and a poleyn's `copLames` articulating lames.
  harnessEdge: { depth: 0.025, most: 0.3, lift: 0.012, copLames: 2 },
  // A brigandine's rivet heads: three rows to a ring, each `size` of its column
  // across (and as tall, along the piece), a hair proud of the cloth.
  studs: { rowsPerRing: 3, size: 0.3, tall: 0.07, lift: 0.012 },
  // A coat's skirt split into two leg panels with the front panel over the split (`legs`, legPanelsOn): the skirt drawn
  // `fine` times as many sides round (so the splits are cut narrow), the front panel `finer` times, standing `stand` (share
  // of the radius) out over the skirt; the bindings `wide` (rad round) and, across a panel's top, `deep` (places along).
  legs: { fine: 2, finer: 4, stand: 0.025, wide: 0.07, deep: 0.22 },
  // Stiff pieces (stiffnessOf, stiffen): a plate rides the bones as one body, its points' mean weights raised to `sharpen` (so a
  // cannon keeps to its own bone and a cop over a joint to both); a skirt's rows are stiff panel by panel, `panels` round it; a cloth coat
  // of plates keeps `coat` of the body's own give; a board hung at the shoulder (a sode on its cords, a coat's shoulder flap
  // from its seam) goes `hung` of the way with the chest it hangs from and the rest with the arm it lies on, so it lifts by
  // three quarters of what the arm does and never stands out level with it.
  stiff: { sharpen: 3, panels: 8, coat: 0.5, hung: 0.25 },
  // Loose cloth (looseness): cloth lying on the body moves with it, cloth standing `from` m off the skin begins to hang free
  // and at `full` m is wholly loose (a skirt's hem, a hanging sleeve, a trouser leg of hakama): what the air and his own
  // movement then swing (clothsway.js). `cell` (m): the grid the skin's points are sorted into for the search.
  sway: { from: 0.022, full: 0.12, cell: 0.13 },
  // A board hung beside a limb (boardOn: a sode, a coat's shoulder flap): `wide` (m) across, its edges bowed `bow` (m) in
  // towards the limb, `columns` faces across; laced lames each stand `tilt` (m) out at the head over the foot of the lame
  // above, `row` (m) tall where no laced tile gives the height.
  // Fitted to the body it is built on, it is laid `over` (m) off whatever is under it, giving by up to `give` (m out a m down) along its length (clearBoards).
  // A coat's flap (studded cloth) is bound `bound` (m) deep round its edges.
  // Hakama worn long: how many times the leg's breadth above the knee it is at the knee, and (of that) at its hem.
  // Its pleats: `pleats` folds across the front of each leg, each standing `fold` of the leg's breadth out at its edge, the
  // first `shade` of each lying dark in the fold.
  hakama: { knee: 1.6, hem: 1.35, pleats: 3, fold: 0.24, shade: 0.34 },
  board: { wide: 0.26, bow: 0.022, tilt: 0.012, row: 0.05, columns: 8, over: 0.012, give: 0.45, bound: 0.014 },
  // A plate breastplate (`plate`, or a kit's `rigidBreastplate`: [waist, top]
  // up the trunk) is one rigid shell on the chest bone from its lower edge at
  // the waist to its top: the trunk under it, and whatever is worn between
  // (the arming coat, mail, a huque over it), is carried with it, so it neither
  // bends, twists, stretches nor dents. Below the waist the fauld stays
  // lofted (articulated lames), one surface with the plate, so no gap opens.
  plateBreastplate: [0.32, 1.02],
  // A ridged breastplate (the 16th-century peascod's forebear, a keel down
  // the middle): `ridge` how far the centre stands out (share of the
  // trunk's depth), falling off straight to `width` rad either side, so the
  // two halves are flat planes meeting at an edge; it fades out over `fade`
  // of the plate's height at the neck and the waist. The lower edge turns
  // out (`flare`, over its lowest `flareOver` of t); `rope` (t) a roped
  // border at the neck and the hem.
  // Plate below the waist: the fauld (`reach` of a thigh's length below the
  // waist, `lames` bands, a little `flare`) and on each thigh a tasset of
  // `lames` overlapping plates over the front and outer side (`arc` rad,
  // centred `outward` rad towards the outside), each standing `step` further
  // out than the one above it, from `from` to `to` down the thigh.
  fauld: { reach: 0.14, lames: 3, flare: 0.2 },
  tasset: { from: -0.12, to: 0.42, lames: 3, arc: 2.3, outward: 0.35, inflate: 1.42, step: 0.05, steps: 10 },
  // A jousting harness (`armor.joust`, the Stechzeug): long tassets of more
  // lames to above the knee, laminated pauldrons of `pauldronLames` over the
  // shoulders (standing out to `pauldron`), and mail at the armpits showing
  // between the pauldron and the rerebrace.
  // A field harness's pauldron: one plate from `from` to `to` down the upper arm, closed over the point of the shoulder
  // (its top, inside the shoulder, is closed), standing off the arm by `flare` ([place down the arm, times the arm]):
  // fullest over the deltoid and drawn in to its turned lower edge.
  pauldron: { from: -0.2, to: 0.42, flare: [[-0.2, 1.08], [-0.12, 1.24], [0, 1.32], [0.2, 1.3], [0.42, 1.22]] },
  // A plate harness's limb pieces stand off the limb by these (times the limb): a rerebrace, a vambrace or a greave (`limb`) and
  // a cuisse (`thigh`) by the plate and the arming clothes' thickness, a centimetre or so; a couter or a poleyn (`cop`) by its
  // own bulge over the joint; the sleeve worn under them stands no further off the arm than `under`.
  harness: { limb: 1.16, thigh: 1.13, cop: 1.36, under: 1.07 },
  joust: { tassetTo: 0.68, tassetLames: 5, pauldron: 1.8, pauldronLames: 4, mail: [0.1, 0.4, 1.3] },
  ridged: { ridge: 0.18, width: 0.6, fade: 0.12, flare: 0.05, flareOver: 0.06, rope: 0.035 },
  // The Gothic form of it (a harness whose flutes are `sprays`, the German of c. 1480): the keel sharp (a narrow `width`), the
  // waist drawn in by `waist` over the lowest `waistOver` of the breastplate, and `sprays` flutes a side fanning up from the
  // waist over the plackart, each a rib `rib` (rad) across from `from` to `to` (share up the breastplate; `fan`: rad round at
  // its foot and its head, per flute).
  gothic: { ridge: 0.2, width: 0.34, waist: 0.07, waistOver: 0.34, sprays: 3, rib: 0.016, from: 0.06, to: 0.62, fan: [0.07, 0.3] },
  // Its front drawn sharp (breastplateOn, not in a crowd): the two halves as
  // faces of their own, `lift` proud of the plate, `rows` to a ring and
  // `steps` across each half, so the ridge is an edge, not a curve; rivet
  // heads (`rivet` rad across) along the neck and the hem; a leather strap
  // and buckle on each shoulder; on a knight's full plate the lance rest
  // (arrêt) on the right breast.
  ridgedFront: { lift: 0.012, rows: 2, steps: 8, rivet: 0.055, rivetsNeck: 5, rivetsHem: 7, strapAt: 1.0, strapWidth: 0.09, lanceRest: [-0.5, 0.6, 0.06, 0.1, 0.035] },
  // A light relaxation rounds the ring edges without losing the shapes.
  relaxPasses: 2,
  relaxAmount: 0.3,
  // The rules' styles: how much fuller a limb is drawn per metre of fat on it (0.03 m of fat: 15%).
  limbFatDrawn: 5,
  // The medium ring density (a skin wrapped onto a field): sides round a limb and the trunk, rings per baseline ring, the trunk's ring step (u).
  medium: { limbSides: 16, trunkSides: 36, limbDensity: 1.3, trunkStep: 0.022 },
  // Wrapping onto a field: Newton steps, the most a step and a whole wrap may move a point (m), the gradient's step (m), how far a
  // point buried in another part is set back behind the surface (m), and where the wrap fades in and out (the trunk's hips, the neck's top).
  wrap: { steps: 4, step: 0.03, most: 0.06, epsilon: 0.003, buried: 0.0025, hips: [0.3, 0.45], legs: false, neckTop: [0.3, 0.5], clothReach: 0.045 },
  // The skin under armour (`hideCovered`, see coverage): a stretch of a skin part inside a closed piece worn over it is left out of the mesh, all
  // but `margin` (m) inside each end of the piece (an open end, a joint the next piece meets, a gap that opens in a swing keep their skin).
  cover: { margin: 0.05 },
  // The plain loft's painted ribs (a starved man drawn before his V7 skin is built): from a rules' `ribs` share of `from`, the trunk
  // over `span` (u) on two rings a rib, one on its crest and one in the groove above it (`phases`: shares of skinrules.js RULES
  // .ribSpacing, the rib's own profile; `droop`: where the ribs run at the flank), so the stripes come out clean for a few hundred
  // triangles; each skin point's colour times 1 + `shade` × the rules' height (m) + `hollow` × the outline's (the sunk belly), held
  // between `dark` and `light`. Set by eye against the V7 skin of the same man.
  ribBand: { from: 0.25, span: [0.45, 0.93], phases: [0.29, 0.79], droop: 0.04, shade: 180, hollow: 12, dark: 0.55, light: 1.15 },
  // Breeches worn to rags: plain lofts, `sides` round, `hips` rings over the hips and seat, `thigh` down each thigh, `shin` from the
  // knee to the ragged hem; loose enough (`hipsLoose`, `shinLoose`) that the coarse tubes clear the knee and the seat between rings.
  rags: { sides: 10, hipSides: 14, hips: 4, thigh: 5, shin: 3, hipsLoose: 1.1, shinLoose: 1.34 },
  // A slice of the wrap's per-point work between hand-backs (buildLoftBodySteps), points.
  slice: 400,
};

// The roles drawn as metal that the plate's maps go on.
const STEEL_ROLES = new Set(['steel', 'steel2', 'gold']);
// Each run of rings measured once (girth, slant length), for the plate tile's coordinates on a patch laid over it.
const ringMeasures = new WeakMap();
/** A flat patch's corners in the plate tile, where the mesh carries the plate's maps and the patch is steel; else nothing. */
function patchUv(mesh, rings, role, index, place, angle) {
  if (!mesh.steelUv || !STEEL_ROLES.has(role)) return;
  if (!ringMeasures.has(rings)) ringMeasures.set(rings, measureRings(rings, 1));
  mesh.uvs.set(index, plateUvAt(ringMeasures.get(rings), place, angle, mesh.patchTile ?? 'plate'));
}
// A modern kit's moulded shell and pads (roles), which take its shell tile (`mesh.shellTile`) as steel takes its steel tile.
const SHELL_ROLES = new Set(['armor', 'pad']);

/**
 * A loft's cloth coordinates (detailmaps.js clothUvAt), or null where none of its roles is a material with a tile: each vertex
 * in its own role's material's cell, measured over the run of rings (the weave closing round it, its length up it).
 */
function clothLoftUv(mesh, rings, sides, inflate, paint) {
  const materials = new Map();
  const materialOf = (role) => {
    if (!materials.has(role)) materials.set(role, mesh.clothOf(role) ?? 'none');
    return materials.get(role);
  };
  let any = false;
  for (const [index, ring] of rings.entries()) {
    for (let step = 0; step < sides && !any; step += 1) any = materialOf(paint(ring, (step / sides) * Math.PI * 2, index, step)) !== 'none';
    if (any) break;
  }
  if (!any) return null;
  const measure = measureRings(rings, inflate);
  const along = new Map(rings.map((ring, index) => [ring, measure.along[index]]));
  return (ring, share, index, step) => clothUvAt(measure, materialOf(paint(ring, share * Math.PI * 2, index, step)), share, along.get(ring) ?? 0);
}

/**
 * How a piece moves on the body, by what it is made of. A plate of steel, of lacquer or of a moulded shell is one stiff body
 * ('plate'): it rides the bones whole and never bends, stretches or twists. Lames and the rows of lamellar, scale
 * and laced kozane are stiff row by row and give only between the rows ('rows'). A coat of small plates riveted inside cloth
 * ('coat') is half one and half the other: each ring of it leans `LOFT.stiff.coat` of the way from a stiff hoop to the body
 * under it. Cloth, mail, leather and padding follow the body point by point (null).
 */
const PLATE_PAINTS = new Set(['steel', 'steel2', 'gold', 'armor']);
export function stiffnessOf(paint) {
  if (typeof paint === 'string') return PLATE_PAINTS.has(paint) ? 'plate' : null;
  if (!paint || typeof paint !== 'object' || paint.mail) return null;
  const material = pieceMaterial(paint);
  if (material === 'studded') return 'coat';
  if (material === 'lamellae' || material === 'scales' || material === 'kozane') return 'rows';
  if (paint.lames || paint.rows?.some((role) => PLATE_PAINTS.has(role))) return 'rows';
  return material === 'steel' || material === 'armor' ? 'plate' : null;
}

/** A new stiff body of the mesh (its number), of a `kind`: 'plate', 'rows' or 'coat' (stiffnessOf), 'panel' (a hanging panel of a coat: held as rows are) or 'hung' (a board hung at the shoulder: one body, LOFT.stiff.hung). None (0) in a crowd's body. */
function stiffBody(mesh, kind) {
  if (!mesh.stiffens) return 0;
  mesh.bodies += 1;
  mesh.kinds.set(mesh.bodies, kind);
  return mesh.bodies;
}

/**
 * Make a piece's rings stiff (`kind`: stiffnessOf): whatever is lofted or laid on them afterwards (the piece, its edges, rivets
 * and lacing) belongs to the ring's body. A plate is one body; rows and a coat's are a body to each ring, or, round something
 * that parts (`panels`: a skirt over two legs), a body to each of that many panels of each ring. A coat's skirt cut into panels
 * that hang from the waist (`hung`: the panels between its splits) is a body to each panel, hem to waist ('panel'): its plates
 * keep their places in it, and it gives at the splits.
 */
function stiffen(mesh, rings, kind, panels = 0, hung = false) {
  if (!kind) return rings;
  // (What it is cut as, kept on the ring whether or not the mesh has stiff bodies: fitClothToBase.)
  for (const ring of rings) ring.kind = hung ? 'panel' : kind;
  if (hung) {
    const down = Array.from({ length: panels }, () => stiffBody(mesh, 'panel'));
    for (const ring of rings) ring.body = down;
    return rings;
  }
  const whole = kind === 'plate' ? stiffBody(mesh, kind) : 0;
  for (const ring of rings) ring.body = whole || (panels ? Array.from({ length: panels }, () => stiffBody(mesh, kind)) : stiffBody(mesh, kind));
  return rings;
}

/** The stiff body a point at `angle` round a ring belongs to (0: none): the piece being built as one (`mesh.body`), else the ring's. */
function bodyAt(mesh, ring, angle) {
  if (mesh.body) return mesh.body;
  if (!Array.isArray(ring.body)) return ring.body ?? 0;
  const turn = angle / (Math.PI * 2);
  return ring.body[Math.floor((turn - Math.floor(turn)) * ring.body.length) % ring.body.length];
}

/**
 * How loose each point of the cloth hangs (0 lying on the body .. 1 free; null when none does): by how far it stands off the
 * nearest skin (LOFT.sway). Skin, steel, shells and every stiff body's points are 0: nothing rigid sways.
 */
function looseness(positions, regions, stiff) {
  const { from, full, cell } = LOFT.sway;
  const count = regions.length;
  const key = (x, y, z) => `${x},${y},${z}`;
  const at = (vertex, axis) => Math.floor(positions[vertex * 3 + axis] / cell);
  const grid = new Map();
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (regions[vertex] !== 'skin') continue;
    const k = key(at(vertex, 0), at(vertex, 1), at(vertex, 2));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(vertex);
  }
  if (!grid.size) return null;
  const sway = new Float32Array(count);
  let any = false;
  for (let vertex = 0; vertex < count; vertex += 1) {
    const role = regions[vertex];
    if (role === 'skin' || stiff[vertex] || STEEL_ROLES.has(role) || SHELL_ROLES.has(role)) continue;
    const [x, y, z] = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    const [cx, cy, cz] = [at(vertex, 0), at(vertex, 1), at(vertex, 2)];
    let nearest = full * full;
    for (let i = cx - 1; i <= cx + 1; i += 1) for (let j = cy - 1; j <= cy + 1; j += 1) for (let k = cz - 1; k <= cz + 1; k += 1) {
      const list = grid.get(key(i, j, k));
      if (!list) continue;
      for (const other of list) {
        const [dx, dy, dz] = [positions[other * 3] - x, positions[other * 3 + 1] - y, positions[other * 3 + 2] - z];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < nearest) nearest = d;
      }
    }
    const share = Math.min(1, Math.max(0, (Math.sqrt(nearest) - from) / (full - from)));
    sway[vertex] = share * share * (3 - 2 * share);
    if (sway[vertex] > 0) any = true;
  }
  return any ? sway : null;
}

/**
 * Stiff bodies ride whole: every point of one takes the mean of its points' weights (a plate's sharpened, LOFT.stiff), so the
 * body turns with the bones as one piece (exactly, skinned by dual quaternions; without them it shears a little, never bends).
 */
function stiffWeights(weights, stiff, kinds) {
  const groups = new Map();
  stiff.forEach((body, vertex) => {
    if (!body) return;
    if (!groups.has(body)) groups.set(body, []);
    groups.get(body).push(vertex);
  });
  const sums = new Map();
  const write = (vertex, shares) => {
    const top = [...shares].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((sum, [, share]) => sum + share, 0) || 1;
    for (let slot = 0; slot < 4; slot += 1) {
      weights.skinIndex[vertex * 4 + slot] = top[slot]?.[0] ?? 0;
      weights.skinWeight[vertex * 4 + slot] = top[slot] ? top[slot][1] / total : 0;
    }
  };
  for (const [body, vertices] of groups) {
    sums.clear();
    for (const vertex of vertices) {
      for (let slot = 0; slot < 4; slot += 1) {
        const share = weights.skinWeight[vertex * 4 + slot];
        if (share > 0) sums.set(weights.skinIndex[vertex * 4 + slot], (sums.get(weights.skinIndex[vertex * 4 + slot]) ?? 0) + share);
      }
    }
    const kind = kinds.get(body);
    const power = kind === 'plate' ? LOFT.stiff.sharpen : 1;
    const mean = [...sums].map(([bone, sum]) => [bone, (sum / vertices.length) ** power]);
    const total = mean.reduce((sum, [, share]) => sum + share, 0) || 1;
    if (kind === 'plate') {
      for (const vertex of vertices) write(vertex, mean);
      continue;
    }
    if (kind === 'hung') {
      const hang = new Map(mean.map(([bone, share]) => [bone, (share / total) * (1 - LOFT.stiff.hung)]));
      hang.set(BONE.chest, (hang.get(BONE.chest) ?? 0) + LOFT.stiff.hung);
      for (const vertex of vertices) write(vertex, hang);
      continue;
    }
    // A row holds as a hoop where the body under it moves as one. A point of it that lies over another limb (a coat's yoke
    // over the shoulder) shares few of the hoop's bones and goes with that limb, as the strap or the cloth there does.
    const hoop = new Map(mean.map(([bone, share]) => [bone, share / total]));
    // (A panel hanging from the waist is sewn there: its points go with the trunk by as much more as they are the trunk's
    // than the panel is, so its head stays at the waist's seam when the thigh swings the rest, and no gap opens under the coat.)
    const trunkShare = (shareOf) => [BONE.pelvis, BONE.spine, BONE.chest].reduce((sum, bone) => sum + shareOf(bone), 0);
    const hangs = kind === 'panel' ? trunkShare((bone) => hoop.get(bone) ?? 0) : 1;
    for (const vertex of vertices) {
      let shared = 0;
      for (let slot = 0; slot < 4; slot += 1) shared += Math.min(weights.skinWeight[vertex * 4 + slot], hoop.get(weights.skinIndex[vertex * 4 + slot]) ?? 0);
      let sewn = 0;
      if (hangs < 1) {
        let own = 0;
        for (let slot = 0; slot < 4; slot += 1) if ([BONE.pelvis, BONE.spine, BONE.chest].includes(weights.skinIndex[vertex * 4 + slot])) own += weights.skinWeight[vertex * 4 + slot];
        sewn = Math.max(0, Math.min(1, (own - hangs) / (1 - hangs)));
      }
      const hold = shared * shared * (kind === 'coat' ? 1 - LOFT.stiff.coat : 1) * (1 - sewn);
      const own = new Map([...hoop].map(([bone, share]) => [bone, share * hold]));
      for (let slot = 0; slot < 4; slot += 1) {
        const share = weights.skinWeight[vertex * 4 + slot];
        if (share > 0) own.set(weights.skinIndex[vertex * 4 + slot], (own.get(weights.skinIndex[vertex * 4 + slot]) ?? 0) + share * (1 - hold));
      }
      write(vertex, own);
    }
  }
}

/**
 * Add one loft to the mesh arrays.
 * @param rings [{ center, depthAxis, widthAxis, depth, width }]
 */
function loft(mesh, rings, sides, { capStart = true, capEnd = true, color = 'skin', inflate = 1, bones = () => null, shape = null, bend = null, uv = null, part = null, holes = null, weighAt = null } = {}) {
  const start = mesh.positions.length / 3;
  // (Each ring knows its piece, for keeping layers inside one another: keepLayersInside.)
  if (mesh.ringOf) for (const ring of rings) {
    ring.piece ??= start;
    // (And the points of the piece lofted on it last, which what is laid on that piece rides: ridePiece.)
    (mesh.ringPoints ??= new Map()).set(ring, []);
    if (rings.over) ring.over = true;
    // (Torn cloth has holes the skin shows through: never hides it, keepLayersInside.)
    if (holes) ring.torn = true;
  }
  // A colour may be a pattern: a function of the ring (and its index), and
  // of the angle round it (0 at the front, as the depth axis points).
  const paint = typeof color === 'function' ? color : () => color;
  // Steel with the plate's maps (`mesh.steelUv`, detailmaps.js): a loft all of steel (every point of it steel, steel2 or gilt) takes
  // the plate tile's coordinates, or its kind's own steel tile (`mesh.steelTile`: detailmaps.js ARMOUR_TILES); a loft all of a
  // modern kit's moulded shell, its shell tile. (Not a loft of steel and something else: a triangle across the two would read
  // the skin's maps.)
  if (!uv && mesh.steelUv && !holes) {
    const roles = new Set(rings.flatMap((ring, index) => Array.from({ length: sides }, (_, step) => paint(ring, (step / sides) * Math.PI * 2, index, step))));
    if ([...roles].every((role) => STEEL_ROLES.has(role))) uv = tileUv(rings, inflate, mesh.steelTile ?? 'plate');
    else if (mesh.shellTile && [...roles].every((role) => SHELL_ROLES.has(role))) uv = tileUv(rings, inflate, mesh.shellTile);
  }
  // Cloth with the cloth atlas's maps (`mesh.clothOf`: role -> material, detailmaps.js): a loft any of whose roles is a material
  // with a tile takes coordinates in that tile's cell, vertex by vertex (its other roles in the flat cell, so no triangle of it
  // reads the skin's maps). Metal and moulded shells keep their own tiles (above).
  if (!uv && mesh.clothOf) uv = clothLoftUv(mesh, rings, sides, inflate, paint);
  // A part with texture coordinates (`uv`: ring, share of the way round -> [u, v]) has its first column of vertices twice, so the
  // texture does not run backwards across the last quad: the pairs are welded again for relaxing and for the normals.
  const stride = uv ? sides + 1 : sides;
  // (A tile of something that gives, measured again as worn: retile.)
  if (uv?.worn) (mesh.wornTiles ??= []).push({ start, rows: rings.length, stride, tile: uv.worn });
  // `holes`: cloth torn away (t, angle -> true where it is gone, asked at each quad's middle): those quads are left out.
  const gone = holes ? tornQuads(rings, sides, holes) : null;
  for (const [ringIndex, ring] of rings.entries()) {
    for (let step = 0; step < stride; step += 1) {
      const angle = (step / sides) * Math.PI * 2;
      // `shape`: the surface stood further out (or in) by angle and ring: a breastplate's ridge, its flared hem.
      // `bend`: the body's own anatomy (the sculpt style's bumps), which the cloth over it follows too.
      const out = inflate * (shape ? shape(ring, angle) : 1) * (bend ? bend(ring, angle) : 1);
      const p = vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * out), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * out)));
      mesh.positions.push(...p);
      // Weighted where the body's own surface is beneath it: cloth standing
      // off the skin would otherwise follow the bones less than the skin
      // under it, and the skin would come through when a limb moves. (Or,
      // `weighAt`, where the body is beneath another angle round: a strip
      // hung whole over a split, weighted as its middle, so it does not stretch.)
      const weighed = weighAt ? weighAt(angle) : angle;
      mesh.weightPositions.push(...vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(weighed) * ring.depth), vec.scale(ring.widthAxis, Math.sin(weighed) * ring.width))));
      // (The seam's second column is painted as the first: the same place round.)
      mesh.colors.push(paint(ring, angle, ringIndex, step % sides));
      mesh.bones.push(bones(ring, Math.cos(angle)));
      mesh.stiff.push(bodyAt(mesh, ring, angle));
      // (By the point's own index: patches and grids, which have no ring place, push points without one.)
      mesh.ringT[mesh.positions.length / 3 - 1] = ring.t;
      mesh.ringA[mesh.positions.length / 3 - 1] = angle;
      // (The ring each point was lofted on, where clothes are fitted to a base mesh afterwards: fitClothToBase.)
      if (mesh.ringOf) {
        mesh.ringOf.set(mesh.positions.length / 3 - 1, ring);
        mesh.ringPoints.get(ring).push(mesh.positions.length / 3 - 1);
      }
      if (uv) {
        mesh.uvs.set(mesh.positions.length / 3 - 1, uv(ring, step / sides, ringIndex, step % sides));
        if (step === sides) mesh.welds.push([mesh.positions.length / 3 - 1, mesh.positions.length / 3 - 1 - sides]);
      }
    }
  }
  for (let row = 0; row < rings.length - 1; row += 1) {
    for (let step = 0; step < sides; step += 1) {
      if (gone?.[row * sides + step]) continue;
      const a = start + row * stride + step;
      const b = uv ? a + 1 : start + row * sides + ((step + 1) % sides);
      mesh.indices.push(a, b, a + stride, b, b + stride, a + stride);
    }
  }
  const cap = (row, flip) => {
    const center = mesh.positions.length / 3;
    mesh.positions.push(...rings[row].center);
    mesh.weightPositions.push(...rings[row].center);
    mesh.colors.push(paint(rings[row], 0, row, 0));
    mesh.bones.push(bones(rings[row], 0));
    mesh.stiff.push(bodyAt(mesh, rings[row], 0));
    mesh.ringT[center] = rings[row].t;
    mesh.ringA[center] = 0;
    if (uv) mesh.uvs.set(center, uv(rings[row], 0, row, 0));
    for (let step = 0; step < sides; step += 1) {
      const a = start + row * stride + step;
      const b = uv ? a + 1 : start + row * sides + ((step + 1) % sides);
      if (flip) mesh.indices.push(center, b, a);
      else mesh.indices.push(center, a, b);
    }
  };
  if (capStart) cap(0, false);
  if (capEnd) cap(rings.length - 1, true);
  // A closed piece worn over a skin part (its rings tagged with the part: trunkRings, upperArmRings...) covers that stretch of it,
  // unless any of it is drawn as skin (sheer lace, an open shirt) or torn away (rags).
  if (rings.part && !part && mesh.cover && !gone?.includes(1) && !mesh.colors.slice(start).includes('skin')) {
    const ts = rings.map((ring) => ring.t);
    (mesh.cover[rings.part] ??= []).push([Math.min(...ts), Math.max(...ts)]);
  }
  // `part`: the skin part this loft is (trunk, neck, lUpper...), for blending the joins between parts (`filletParts`).
  if (part) mesh.parts[part] = [start, mesh.positions.length / 3];
}

/** Which quads of a loft are torn away (`holes`, see loft): 1 for gone, row by row, `sides` to a row. */
function tornQuads(rings, sides, holes) {
  const gone = new Uint8Array(Math.max(0, rings.length - 1) * sides);
  for (let row = 0; row < rings.length - 1; row += 1) {
    const t = (rings[row].t + rings[row + 1].t) / 2;
    for (let step = 0; step < sides; step += 1) gone[row * sides + step] = holes(t, ((step + 0.5) / sides) * Math.PI * 2) ? 1 : 0;
  }
  return gone;
}

/** Rings along a straight run from a to b, oriented by a frame's forward axis. */
/**
 * Rings each given how far the cloth lofted on it stands off (`flare`, times the ring; read by FLARED): steadily further from
 * the first (`from`) to the last (`to`), as if none were narrower than `least` (m). A sleeve or a trouser leg that widens to
 * its mouth whatever the limb inside it does. (The rings keep the limb's own size: the fit to the body lays a piece on by
 * how far it stands off its ring.)
 */
function widened(rings, from, to, least = 0) {
  const last = rings.length - 1 || 1;
  return Object.assign(rings.map((ring, index) => ({ ...ring, flare: (from + ((to - from) * index) / last) * Math.max(1, least / Math.max(ring.depth, ring.width)) })), rings.part ? { part: rings.part } : null);
}
/**
 * Rings whose cloth hangs in a flat bag behind the limb (under a forearm held forward): `from` to `to` (m) deep from the
 * first ring to the last, read by FLARED. A kosode's sleeve: close round the arm, its depth hanging below.
 */
function bagged(rings, from, to) {
  const last = rings.length - 1 || 1;
  for (const [index, ring] of rings.entries()) ring.hang = from + ((to - from) * index) / last;
  return rings;
}
/** Rings whose cloth is pleated across the front: `pleats` knife pleats, each `fold` (of the flare) out at its edge. */
function pleated(rings, pleats, fold) {
  for (const ring of rings) Object.assign(ring, { pleats, fold });
  return rings;
}
/** How far across its pleat (0 in the fold, 1 at the edge standing out) a pleated ring is at `angle`; null where it is plain. */
function pleatAt(ring, angle) {
  if (!ring.fold || Math.cos(angle) <= 0) return null;
  const across = (Math.atan2(Math.sin(angle), Math.cos(angle)) / Math.PI + 0.5) * ring.pleats;
  return across - Math.floor(across);
}
const FLARED = {
  shape: (ring, angle) => {
    let out = ring.flare;
    const pleat = pleatAt(ring, angle);
    if (pleat !== null) out *= 1 + ring.fold * (pleat - 0.5);
    // (The bag: a narrow lobe at the back of the ring, as thick as the sleeve round the arm.)
    if (ring.hang) out += (ring.hang / ring.depth) * Math.max(0, -Math.cos(angle)) ** 6;
    return out;
  },
  capStart: false,
  capEnd: false,
};

function along(a, b, forward, count, from, to, depthAt, widthAt, offsetAt = () => 0) {
  // `count` may be the list of t (the sculpt style spaces rings by where landmarks repeat).
  const axis = vec.normalize(vec.sub(b, a));
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  const widthAxis = vec.cross(axis, depthAxis);
  const length = vec.length(vec.sub(b, a));
  const rings = [];
  const stops = Array.isArray(count) ? count : null;
  for (let index = 0; index <= (stops ? stops.length - 1 : count); index += 1) {
    const t = stops ? stops[index] : from + ((to - from) * index) / count;
    const center = vec.add(vec.add(a, vec.scale(axis, t * length)), vec.scale(depthAxis, offsetAt(t)));
    rings.push({ t, center, depthAxis, widthAxis, depth: depthAt(t), width: widthAt(t) });
  }
  return rings;
}

/** The gradient of a field at a point, unit (a tetrahedron of four reads). */
function fieldGradient(field, x, y, z, e) {
  const a = field(x + e, y - e, z - e);
  const b = field(x - e, y - e, z + e);
  const c = field(x - e, y + e, z - e);
  const d = field(x + e, y + e, z + e);
  const g = [a - b - c + d, -a - b + c + d, -a + b - c + d];
  const length = Math.hypot(...g) || 1;
  return [g[0] / length, g[1] / length, g[2] / length];
}

/**
 * Wrap a loft's skin onto a field's surface (the refined flesh field: the limbs grow out of the trunk, the elbow and knee are one
 * surface): each skin point walked along the field's gradient onto its zero (Newton steps), so the loft keeps its topology, its
 * texture coordinates and its skin weights but takes the field's shape. A point of one part buried in another (an arm's root inside
 * the trunk, the trunk under the deltoid) lands on the same surface as the other's: it is set back a little behind it, so the part
 * whose surface it is wins. Cloth is moved with the skin, keeping its standoff. `outline(vertex)`: metres out along the normal added
 * on the trunk afterwards (the outline's features the field lacks). Returns the normals: the field's own on the skin.
 */
function* wrapOnField(positions, normals, mesh, regions, field, recompute, outline) {
  const spec = LOFT.wrap;
  const count = positions.length / 3;
  const copies = new Set(mesh.welds.map(([copy]) => copy));
  const partOf = new Array(count).fill(null);
  for (const [name, [from, to]] of Object.entries(mesh.parts)) for (let vertex = from; vertex < to; vertex += 1) partOf[vertex] = name;
  const cell = 0.05;
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map();
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (regions[vertex] !== 'skin') continue;
    const slot = key(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]);
    if (!grid.has(slot)) grid.set(slot, []);
    grid.get(slot).push(vertex);
  }
  /** The nearest skin point to (x, y, z) not of part `not` (or any), and the distance to its tangent plane. */
  const nearest = (x, y, z, not = undefined) => {
    let best = cell * cell;
    let found = -1;
    const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const other of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (not !== undefined && partOf[other] === not) continue;
            const distance = (positions[other * 3] - x) ** 2 + (positions[other * 3 + 1] - y) ** 2 + (positions[other * 3 + 2] - z) ** 2;
            if (distance < best) {
              best = distance;
              found = other;
            }
          }
        }
      }
    }
    if (found < 0) return null;
    const plane = (x - positions[found * 3]) * normals[found * 3] + (y - positions[found * 3 + 1]) * normals[found * 3 + 1] + (z - positions[found * 3 + 2]) * normals[found * 3 + 2];
    return { vertex: found, plane };
  };
  // Before anything moves: which skin points are buried in another part, and how far each piece of cloth stands off the skin.
  const buried = new Uint8Array(count);
  // (Cloth follows the skin point nearest it: moved as that point is, so it keeps its standoff and its hems stay on the skin.)
  const follows = new Int32Array(count).fill(-1);
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (vertex % LOFT.slice === 0) yield 'wrap: buried';
    const [x, y, z] = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    if (regions[vertex] === 'skin') {
      const other = partOf[vertex] ? nearest(x, y, z, partOf[vertex]) : null;
      if (other && other.plane < -0.003) buried[vertex] = 1;
      // A forearm or a shin starts inside the part above it: where they overlap, the part above is the skin (one surface, no ring).
      if (/Fore$|Shin$/.test(partOf[vertex] ?? '') && mesh.ringT[vertex] < -0.005) buried[vertex] = 1;
    } else {
      const skin = nearest(x, y, z);
      if (skin && skin.plane > -0.01 && skin.plane < spec.clothReach) follows[vertex] = skin.vertex;
    }
  }
  // How much of the wrap a point takes: fading in above the trunk's hips, fading out up the neck (the field's neck ends in the head).
  const share = (vertex) => {
    const t = mesh.ringT[vertex];
    const part = partOf[vertex];
    // The trunk below the waist (the hips under the shorts, a hanging belly) keeps the loft's: the field has no apron, and its hips met the shorts badly.
    if (part === 'trunk') return Math.min(1, Math.max(0, (t - spec.hips[0]) / (spec.hips[1] - spec.hips[0])));
    if (part === 'neck') return 1 - Math.min(1, Math.max(0, (t - spec.neckTop[0]) / (spec.neckTop[1] - spec.neckTop[0])));
    // The legs keep the loft's (under the shorts the field's hips and the cloth fought; the knee is blended by the fillet instead).
    if (/Thigh$|Shin$/.test(part ?? '')) return spec.legs ? 1 : 0;
    return 1;
  };
  const moved = new Float32Array(positions.length);
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (vertex % (LOFT.slice / 2) === 0) yield 'wrap: onto the field';
    if (copies.has(vertex) || regions[vertex] !== 'skin') continue;
    const weight = share(vertex);
    if (weight <= 0) continue;
    const target = 0;
    let [x, y, z] = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
    const [x0, y0, z0] = [x, y, z];
    let g = null;
    for (let step = 0; step < spec.steps; step += 1) {
      const f = field(x, y, z) - target;
      g = fieldGradient(field, x, y, z, spec.epsilon);
      const move = Math.max(-spec.step, Math.min(spec.step, f));
      x -= g[0] * move;
      y -= g[1] * move;
      z -= g[2] * move;
    }
    if (buried[vertex]) {
      x -= g[0] * spec.buried;
      y -= g[1] * spec.buried;
      z -= g[2] * spec.buried;
    }
    // Never further than `most` from where the loft put it (a point the field cannot place stays near its ring).
    let dx = x - x0;
    let dy = y - y0;
    let dz = z - z0;
    const length = Math.hypot(dx, dy, dz);
    const scale = (length > spec.most ? spec.most / length : 1) * weight;
    dx *= scale;
    dy *= scale;
    dz *= scale;
    moved.set([dx, dy, dz], vertex * 3);
  }
  // A weld's copy moves as its original; cloth as the skin under it.
  for (const [copy, original] of mesh.welds) moved.copyWithin(copy * 3, original * 3, original * 3 + 3);
  for (let vertex = 0; vertex < count; vertex += 1) if (follows[vertex] >= 0) moved.copyWithin(vertex * 3, follows[vertex] * 3, follows[vertex] * 3 + 3);
  for (let index = 0; index < positions.length; index += 1) positions[index] += moved[index];
  // The trunk's outline features, along the field's normal.
  yield 'wrap: moved';
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (regions[vertex] !== 'skin' || partOf[vertex] !== 'trunk' || copies.has(vertex)) continue;
    const out = outline(vertex) * share(vertex);
    if (!out) continue;
    const g = fieldGradient(field, positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2], 0.006);
    for (let axis = 0; axis < 3; axis += 1) positions[vertex * 3 + axis] += g[axis] * out;
  }
  for (const [copy, original] of mesh.welds) positions.copyWithin(copy * 3, original * 3, original * 3 + 3);
  const result = recompute();
  yield 'wrap: normals';
  // The skin's normals are the field's (smoothed: read over a centimetre), so the shading runs on across the joins.
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (vertex % LOFT.slice === 0) yield 'wrap: field normals';
    if (regions[vertex] !== 'skin') continue;
    const weight = share(vertex);
    if (weight <= 0) continue;
    const g = fieldGradient(field, positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2], 0.008);
    const n = [0, 1, 2].map((axis) => result[vertex * 3 + axis] * (1 - weight) + g[axis] * weight);
    const length = Math.hypot(...n) || 1;
    for (let axis = 0; axis < 3; axis += 1) result[vertex * 3 + axis] = n[axis] / length;
  }
  for (const [copy, original] of mesh.welds) result.copyWithin(copy * 3, original * 3, original * 3 + 3);
  return result;
}

// The joins blended (`fillet` styles): which parts meet which, and the radius (m) of the blend.
export const FILLET = {
  pairs: [['trunk', 'lUpper', 0.045], ['trunk', 'rUpper', 0.045], ['trunk', 'lThigh', 0.04], ['trunk', 'rThigh', 0.04], ['trunk', 'neck', 0.035], ['lUpper', 'lFore', 0.02], ['rUpper', 'rFore', 0.02], ['lThigh', 'lShin', 0.02], ['rThigh', 'rShin', 0.02]],
  // How far inside the other part a point may be and still count as on the join (m), and how much of the other's normal the seam takes.
  inside: 0.012,
  normalShare: 0.5,
};

/**
 * Blend the joins between skin parts that are separate lofts (an arm stuck into the trunk): each skin point near the other part is
 * pushed out by the polynomial smooth union of the two surfaces (the gap a blend of radius k fills: (k - d)^2 / 4k at distance d), and
 * its normal turned towards the other part's, so the shading runs across the join instead of breaking at a crease. The distance to
 * the other part is to the plane of its nearest point. Returns the new normals (positions are changed in place).
 */
function* filletParts(positions, normals, parts, regions, welds, recompute, bare, pairs = FILLET.pairs) {
  const push = new Float32Array(positions.length / 3);
  const blendTo = new Map();
  const point = (index) => [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
  const copies = new Set(welds.map(([copy]) => copy));
  for (const [nameA, nameB, k] of pairs) {
    if (!parts[nameA] || !parts[nameB]) continue;
    for (const [from, to] of [[nameA, nameB], [nameB, nameA]]) {
      yield 'fillet';
      const [toStart, toEnd] = parts[to];
      const cell = k * 1.5;
      const grid = new Map();
      const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
      for (let index = toStart; index < toEnd; index += 1) {
        if (regions[index] !== 'skin') continue;
        const [x, y, z] = point(index);
        const slot = key(x, y, z);
        if (!grid.has(slot)) grid.set(slot, []);
        grid.get(slot).push(index);
      }
      const [fromStart, fromEnd] = parts[from];
      for (let index = fromStart; index < fromEnd; index += 1) {
        if (regions[index] !== 'skin' || copies.has(index) || bare[index] <= 0) continue;
        const [x, y, z] = point(index);
        let nearest = -1;
        let best = cell * cell;
        const [cx, cy, cz] = [Math.floor(x / cell), Math.floor(y / cell), Math.floor(z / cell)];
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dz = -1; dz <= 1; dz += 1) {
              for (const other of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
                const distance = (positions[other * 3] - x) ** 2 + (positions[other * 3 + 1] - y) ** 2 + (positions[other * 3 + 2] - z) ** 2;
                if (distance < best) {
                  best = distance;
                  nearest = other;
                }
              }
            }
          }
        }
        if (nearest < 0) continue;
        const d = (x - positions[nearest * 3]) * normals[nearest * 3] + (y - positions[nearest * 3 + 1]) * normals[nearest * 3 + 1] + (z - positions[nearest * 3 + 2]) * normals[nearest * 3 + 2];
        if (d < -FILLET.inside) continue;
        const gap = Math.max(0, k - Math.max(0, d));
        push[index] = Math.max(push[index], ((gap * gap) / (4 * k)) * bare[index]);
        const weight = (gap / k) ** 2 * FILLET.normalShare * bare[index];
        if (weight > (blendTo.get(index)?.[1] ?? 0)) blendTo.set(index, [nearest, weight]);
      }
    }
  }
  for (let index = 0; index < push.length; index += 1) {
    if (!push[index]) continue;
    for (let axis = 0; axis < 3; axis += 1) positions[index * 3 + axis] += normals[index * 3 + axis] * push[index];
  }
  for (const [copy, original] of welds) positions.copyWithin(copy * 3, original * 3, original * 3 + 3);
  yield 'fillet: pushed';
  const result = recompute();
  // The normals across the join: each side's turned towards the other's (both read after the push).
  const before = Float32Array.from(result);
  for (const [index, [other, weight]] of blendTo) {
    const n = [0, 1, 2].map((axis) => before[index * 3 + axis] * (1 - weight) + before[other * 3 + axis] * weight);
    const length = Math.hypot(...n) || 1;
    for (let axis = 0; axis < 3; axis += 1) result[index * 3 + axis] = n[axis] / length;
  }
  for (const [copy, original] of welds) result.copyWithin(copy * 3, original * 3, original * 3 + 3);
  return result;
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let face = 0; face < indices.length; face += 3) {
    const [a, b, c] = [indices[face], indices[face + 1], indices[face + 2]];
    const p = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const n = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const i of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) normals[i * 3 + axis] += n[axis];
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return normals;
}

// Armour kinds drawn from a table of pieces. Each slot holds one piece or
// a list of them, the same both sides or per side ({ l, r }); a piece is
// [from, to, inflate, paint], along the part (for a forearm, `to` at or
// below 0 counts back from the wrist). Paint is a role, or a pattern of
// roles: rows (by ring), mail (rings in a weave), rivets (dots on a base),
// a front panel, or heraldry (the design's surcoat field).
const MAIL = { mail: true };
// Japanese laced rows (kozane in kebiki-odoshi): drawn with the kozane's maps where those are drawn (`kozane`).
const LACED = { rows: ['steel', 'lace'], kozane: true };
// Suneate and kote (the Japanese shin guard and armoured sleeve): cloth with iron splints down it (shino), tied on with cords.
const SPLINTED_SHIN = { splints: 7, base: 'top', tie: 'lace' };
const SPLINTED_SLEEVE = { splints: 5, base: 'top' };
const MANICA = { rows: ['steel', 'lace'] };
// The Ming elite's neck guard: steel lames lying over the shoulders and the
// top of the chest, each stepping out over the one below, with a steel band
// round the throat (the kit's `collar`).
const ELITE_GORGET = [0.8, 1.0, 1.36, { lames: 3, base: 'steel2' }];
// The Ming elite's arms: a great spaulder of steel lames over the shoulder,
// and lames down the upper arm (the forearm's to the wrist, in the kit).
const ELITE_ARM = [[-0.24, 1.02, 1.42, { lames: 6, base: 'steel2' }], [-0.2, 0.38, 1.62, { lames: 3, base: 'steel2' }], [0.3, 0.62, 1.58, { lames: 3, base: 'steel2' }]];
const BALTEUS = [0.04, 0.24, 1.14, { rows: ['steel', 'gold', 'steel'] }];
// The banner coats' skirt in two leg panels (loftbody.js legSplit, legPanelsOn): split before and behind (`split`, the
// half width round, rad) from below the apron's foot (`from`, t up the skirt), and the front panel from there down over
// the split before (`front`: the t of its top, its half width round, rad).
const BANNER_LEGS = { split: 0.16, from: -0.3, front: [-0.3, 0.26] };
// The Cuman's plates (ARMOR_KINDS.cumanMail): `rows` narrow lames from `from` to `to` up the trunk (0 hips, 1 neck), each
// `tall` of it (the rest of each step the dark rim between); the columns [centre angle, half width] round the trunk (0 the
// front, π the back), a strip of mail left between each; standing `out` from the skin. The straps closing the split front
// at these heights (`straps`), each `strap` tall and `across` half wide over the split.
const CUMAN_LAMES = {
  rows: 14, from: 0.04, to: 0.86, tall: 0.048, out: 1.18,
  columns: [[0.3, 0.19], [-0.3, 0.19], [1.05, 0.36], [-1.05, 0.36], [2.42, 0.52], [-2.42, 0.52]],
  straps: [0.33, 0.48, 0.63, 0.78], strap: 0.024, across: 0.17,
};
/** The Cuman's plates as the trunk's `plates` ([from t, to t, angle, half width, out, role, rim]), and the straps over the front. */
function cumanLames() {
  const { rows, from, to, tall, out, columns, straps, strap, across } = CUMAN_LAMES;
  const step = (to - from) / rows;
  const lames = Array.from({ length: rows }, (_, row) => from + row * step).flatMap((low) => columns.map(([angle, half]) => [low, low + tall, angle, half, out, 'steel', 'steel2']));
  return [...lames, ...straps.map((t) => [t - strap / 2, t + strap / 2, 0, across, out + 0.05, 'leather'])];
}

// The shoulder guard of a Chinese coat of plates (披膊): a flap of the coat's own studded cloth, bound in its binding, hung from
// the shoulder over the sleeve to above the elbow and bowed round the arm (boardOn).
const SHOULDER_FLAP = { studded: 12, base: 'cloth', edge: 'cloth2', board: { wide: 0.25, bow: 0.06 } };
export const ARMOR_KINDS = {
  // Tosei gusoku: a solid cuirass of riveted horizontal steel lames, laced
  // skirt and sleeves, the war mask on the kabuto.
  toseiDo: {
    trunk: [-0.1, 1.02, 1.19, { rows: ['steel', 'steel', 'steel2'], rivets: 4 }], skirt: [0.5, 0.45, 1.24, LACED], collar: 'steel',
    upperArm: [-0.2, 0.62, 1.5, { ...LACED, board: { wide: 0.24 } }], forearm: [-0.04, -0.04, 1.3, SPLINTED_SLEEVE], thigh: [0.25, 0.85, 1.3, LACED], shin: [0.04, 0.86, 1.3, SPLINTED_SHIN],
  },
  // A rōnin on a private errand, his armour hidden under the kosode: only the manchira's mail showing at the collar, the
  // kusari-kote's dark linen sleeves with an iron splint along each forearm, a sash of two colours, the kyahan's linen
  // wraps over the shins (the tatami-dō is sewn inside the robe: not drawn).
  roninDo: {
    collar: 'mail',
    belt: [0.02, 0.14, 1.3, { rows: ['cloth2', 'gold', 'cloth2'] }],
    forearm: [[-0.06, -0.02, 1.2, 'cloth'], [0.15, 0.05, 1.26, 'steel']],
    shin: [0.08, 0.88, 1.3, 'cloth'],
  },
  // Ashigaru: a plain lacquered okegawa-do with the lord's mon, a short skirt,
  // cloth sleeves and simple shin guards.
  okegawa: {
    trunk: [-0.05, 0.96, 1.17, { mon: [0.68, 0.07, 'gold'], base: 'armor' }], skirt: [0.3, 0.4, 1.2, { rows: ['armor', 'lace'], kozane: true }],
    forearm: [-0.04, -0.04, 1.22, 'top'], shin: [0.1, 0.8, 1.3, { ...SPLINTED_SHIN, splints: 5 }],
  },
  // A sea raider's dō-maru: laced lames round the trunk and a laced skirt,
  // nothing on the arms or legs (often a captured or cast-off piece).
  doMaru: {
    trunk: [-0.05, 0.96, 1.16, { rows: ['armor', 'armor', 'lace'], kozane: true }], skirt: [0.4, 0.42, 1.22, { rows: ['armor', 'lace'], kozane: true }],
  },
  // The same with the great shoulder plates (sode) over bare arms.
  doMaruSode: {
    trunk: [-0.05, 0.96, 1.16, { rows: ['armor', 'armor', 'lace'], kozane: true }], skirt: [0.4, 0.42, 1.22, { rows: ['armor', 'lace'], kozane: true }],
    upperArm: [-0.2, 0.62, 1.5, { rows: ['armor', 'lace'], kozane: true, board: { wide: 0.26 } }],
  },
  // A knight in mail: hauberk to the knees, mail sleeves and chausses, and a
  // surcoat in his colours over it.
  mail: {
    trunk: [[-0.12, 1.02, 1.1, MAIL], [-0.1, 0.94, 1.22, { heraldry: true }]], skirt: [[0.62, 0.35, 1.13, MAIL], [0.72, 0.45, 1.32, { heraldry: true }]], collar: 'mail',
    upperArm: [-0.3, 1.04, 1.14, MAIL], forearm: [-0.06, 0, 1.14, MAIL], thigh: [-0.05, 1.04, 1.1, MAIL], shin: [-0.12, 0.95, 1.1, MAIL],
  },
  // A brother-knight of the Temple: the mail hauberk to the knee with mail
  // sleeves, chausses and a coif at the neck; the Order's long surcoat over it
  // to the shins (its cross on the chest); a sword belt; plain steel greaves
  // and knee cops over the chausses.
  templar: {
    // The surcoat is worn clothing, front and back alike, carried by the body
    // (only the mantle over it swings): to the knee, flared for the stride.
    trunk: [[-0.12, 1.02, 1.1, MAIL], [-0.1, 0.94, 1.22, { heraldry: true }]], skirt: [[0.62, 0.35, 1.13, MAIL], [0.95, 0.5, 1.3, { heraldry: true }]], collar: 'mail',
    belt: [0.0, 0.08, 1.25, 'leather'],
    upperArm: [-0.3, 1.04, 1.14, MAIL], forearm: [-0.06, 0, 1.14, MAIL], thigh: [-0.05, 1.04, 1.1, MAIL], knee: [0.84, 1.04, 1.32, 'steel'],
    shin: [[-0.12, 0.95, 1.1, MAIL], [0.05, 0.85, 1.22, 'steel']],
  },
  // Saladin's kazaghand over his hauberk: the hauberk (zardiyya) to the knee
  // and wrist, its mail showing below the coat's hem and sleeves; the
  // kazaghand (mail between padded layers, faced with silk) to above the
  // knee, its front edge and hem in the second colour, buttoned in gold, its
  // sleeves to the elbow, tiraz bands of gold round the upper arms; a silk
  // sash, its ends hanging at the left hip, under the emir's belt of gilt
  // plaques (mintaqa).
  kazaghand: {
    trunk: [[-0.12, 1.02, 1.1, MAIL], [-0.1, 0.97, 1.24, 'cloth']], skirt: [[0.82, 0.42, 1.16, MAIL], [0.66, 0.5, 1.3, { edge: 'cloth2', base: 'cloth' }]],
    // No collar: the helmet's aventail covers the neck, open at the face so the beard shows.
    belt: [[-0.04, 0.12, 1.31, 'cloth2'], [0.0, 0.08, 1.36, { plaques: 12, base: 'leather' }]],
    straps: [[-0.1, 0, 0.97, 0, 0.13, 1.27, 'cloth2']],
    studs: [[0.3, 0, 0.035, 1.3, 'gold'], [0.45, 0, 0.035, 1.3, 'gold'], [0.6, 0, 0.035, 1.3, 'gold'], [0.75, 0, 0.035, 1.3, 'gold']],
    tassels: [[0.62, 0.62, 0.11, 1.52, 'cloth2'], [0.8, 0.5, 0.09, 1.52, 'cloth2']],
    upperArm: [[-0.3, 1.04, 1.14, MAIL], [-0.3, 1.02, 1.26, 'cloth'], [0.16, 0.32, 1.3, 'gold']], forearm: [[-0.06, 0, 1.14, MAIL], [-0.08, 0.1, 1.28, 'cloth2']],
  },
  // A foot soldier: a riveted brigandine over a quilted coat, a short skirt
  // of lames, spaulders, vambraces and knee cops; the legs otherwise bare of steel.
  brigandine: {
    trunk: [-0.06, 0.95, 1.21, { rivets: 3, base: 'cloth' }], skirt: [0.28, 0.35, 1.22, { rows: ['steel', 'steel2'] }],
    upperArm: [-0.2, 0.36, 1.62, 'steel'], forearm: [0.18, -0.08, 1.3, 'steel'], knee: [0.82, 1.05, 1.45, 'steel'],
  },
  // Ming garrison: a padded cotton coat to the knee over trousers, quilted in rows.
  mingQuilt: {
    trunk: [-0.05, 0.95, 1.12, { rows: ['cloth', 'cloth', 'cloth2'] }], skirt: [0.8, 0.5, 1.24, { rows: ['cloth', 'cloth', 'cloth2'] }],
    upperArm: [-0.1, 1.0, 1.12, 'cloth'],
  },
  // Ming garrison as he was (weisuo levy, the 16th century): no armour, a sleeveless vest of coarse hemp to the hip, closed with
  // knotted cloth buttons down the front, a cloth sash round the waist, its ends hanging at the side.
  mingVest: {
    trunk: [-0.1, 0.95, 1.09, 'cloth'], skirt: [0.28, 0.3, 1.17, 'cloth'],
    belt: [-0.03, 0.12, 1.22, 'cloth2'],
    studs: [[0.36, 0, 0.03, 1.1, 'leather'], [0.5, 0, 0.03, 1.1, 'leather'], [0.64, 0, 0.03, 1.1, 'leather'], [0.78, 0, 0.03, 1.1, 'leather'], [0.9, 0, 0.03, 1.1, 'leather']],
    tassels: [[0.55, 0.45, 0.08, 1.26, 'cloth2'], [0.7, 0.38, 0.07, 1.26, 'cloth2']],
  },
  // Ming brigandine (bumianjia, cloth-faced armour): iron plates riveted
  // inside a long coat of cloth, the brass rivet heads in rows over it; its
  // edges and the front opening bound in a dark cloth; a buckled belt; the
  // skirt to below the knee, split before, behind and at the sides for
  // walking and riding; studded shoulder guards over the upper arms; steel
  // bracers.
  mingBrigandine: {
    trunk: [[-0.06, 0.96, 1.2, { studded: 22, base: 'cloth', edge: 'cloth2', opening: 0.012 }], [0.14, 0.24, 1.3, { buckle: 'gold', base: 'leather' }]],
    skirt: [0.95, 0.55, 1.32, { studded: 24, base: 'cloth', edge: 'cloth2', gaps: [0, Math.PI, Math.PI / 2, -Math.PI / 2], gapWidth: 0.05 }],
    // Sleeveless: the rank and file's coat is a vest (the surviving bumianjia vests, the user's two photographs); the
    // arms only in the quilted sleeves of the coat under it. (The elite's coat keeps its arm guards; the lamellar its own.)
    // Its shoulders reach out over the point of the shoulder, the sleeve of the coat under it coming out from beneath them.
    upperArm: [-0.3, 0.14, 1.3, { studded: 10, base: 'cloth', edge: 'cloth2' }],
  },
  // Qi Jiguang's elite infantry (the user's photograph): the regular's long studded coat, trunk and split skirt as his,
  // with sleeves of the same studded cloth to the wrist (as the banner coat's), and over the front (left) forearm's
  // sleeve a plain solid steel tube from below the elbow to above the wrist (outfits.js MING_ARM_GUARD, its `lForearm`).
  mingEliteInfantry: {
    trunk: [[-0.06, 0.96, 1.2, { studded: 22, base: 'cloth', edge: 'cloth2', opening: 0.012 }], [0.14, 0.24, 1.3, { buckle: 'gold', base: 'leather' }]],
    skirt: [0.95, 0.55, 1.32, { studded: 24, base: 'cloth', edge: 'cloth2', gaps: [0, Math.PI, Math.PI / 2, -Math.PI / 2], gapWidth: 0.05 }],
    // The sleeve from the armhole down past the elbow to meet the forearm's (no shirt between), and over it the shoulder guard.
    upperArm: [[-0.3, 1.04, 1.22, { studded: 10, base: 'cloth' }], [-0.05, 0.6, 1.3, { ...SHOULDER_FLAP }]],
    forearm: {
      l: [[-0.04, -0.03, 1.22, { studded: 10, base: 'cloth', edge: 'cloth2' }], [0.12, -0.07, 1.36, 'steel']],
      r: [-0.04, -0.03, 1.22, { studded: 10, base: 'cloth', edge: 'cloth2' }],
    },
  },
  // The Eight Banners' armour (mianjia, cloth armour, the Jurchen's of the 1610s-30s; the Qing's after): the Ming
  // brigandine's own make, iron plates riveted inside a long coat, the rivet heads in rows over it, and drawn as
  // that coat is (its cloth the banner's colour, its binding `cloth2` the banner's border: red, or white on the red
  // banner; on a plain banner the cloth's own colour), down the front too (`placket`, its half width round, rad);
  // hanging from the waist over the skirt the apron panel (`apron`: from, to along it, half its width round), bound
  // in the same; the skirt long, in two leg panels, one over each leg, split before and behind and each bound at its
  // edges, and over the split before the front panel (前裆) hanging from under the apron to the hem (`legs`:
  // BANNER_LEGS; legPanelsOn; the user's photograph of a Qing armour, the strip down between the two halves); the
  // studded shoulder guards; the sleeves of the same studded cloth to the wrist.
  // (In a crowd the splits are painted, in the binding, as the other split skirts' are: `gaps`.)
  bannerCoat: {
    // Cut straight, loose over the waist as the Ming brigandine is not (the banners' coats in the user's photographs).
    straight: true,
    // (No belt shows: the apron hangs over it.) The front opening bound (`placket`); the collar of the same cloth, up under the helmet's hood.
    trunk: [-0.06, 0.96, 1.2, { studded: 22, base: 'cloth', edge: 'cloth2', placket: 0.05 }], collar: 'cloth',
    skirt: [0.95, 0.55, 1.32, { studded: 24, base: 'cloth', edge: 'cloth2', apron: [-0.32, 0.17, 0.42], legs: BANNER_LEGS, gaps: [0, Math.PI], gapWidth: 0.17 }],
    upperArm: [[-0.3, 1.04, 1.22, { studded: 10, base: 'cloth' }], [-0.05, 0.66, 1.3, { ...SHOULDER_FLAP }]], forearm: [-0.04, -0.03, 1.22, { studded: 10, base: 'cloth', edge: 'cloth2' }],
  },
  // The Bayara (the banners' guard, mounted): the same coat in brocade, its rivets close and gilt, the round steel
  // mirror over the heart in a gilt frame, the apron; the skirt with four steel bands across it (`bands`); gilt
  // plates over the shoulders and steel arm guards (lames) to the wrist.
  bayaraCoat: {
    straight: true,
    trunk: [-0.06, 0.97, 1.22, { studded: 28, base: 'cloth', edge: 'cloth2', placket: 0.04, mirror: [0.62, 0.15, 'steel'] }], collar: 'cloth',
    skirt: [0.95, 0.6, 1.34, { studded: 30, base: 'cloth', edge: 'cloth2', apron: [-0.32, 0.17, 0.42], bands: 4, legs: BANNER_LEGS, gaps: [0, Math.PI], gapWidth: 0.17 }],
    upperArm: [[-0.3, 0.5, 1.6, { rows: ['gold', 'gold'] }], [0.45, 1.02, 1.36, { lames: 6, base: 'steel2' }]], forearm: [-0.04, -0.03, 1.34, { lames: 6, base: 'steel2' }],
    mirrors: [[0.62, 0, 0.3, 1.36, 'steel']],
  },
  // A conquistador: the breastplate over the doublet, short tassets, mail
  // sleeves and collar; the doublet's cloth shows below.
  conquistador: {
    trunk: [[-0.06, 0.97, 1.12, MAIL], [0.1, 0.96, 1.22, 'steel']], skirt: [0.3, 0.4, 1.24, { rows: ['steel', 'steel2'] }], collar: 'mail',
    rigidBreastplate: [0.32, 0.96],
    upperArm: [-0.3, 1.04, 1.14, MAIL],
  },
  // A corset: boned cloth from the hips to under the bust, laced tight (the
  // body under it is drawn in, `cinch`; see LOFT.corset).
  corset: {
    cinch: true,
    trunk: [-0.02, 0.68, 1.1, { boning: true }],
  },
  // An overbust corset, worn alone: from the hips to just over the bust
  // (below the shoulders' width, so arms at the sides hang clear of it), the
  // shoulders bare; brocade, a steel busk with its clasps down the front,
  // laced up the back, a lace edge along the top.
  overbust: {
    cinch: true,
    trunk: [[-0.04, 0.74, 1.13, { boning: true, busk: true, brocade: true }], [0.7, 0.75, 1.145, 'lace']],
  },
  // The same with sheer lace sleeves, shoulder to wrist (a lolita's mourning dress).
  overbustSleeved: {
    cinch: true,
    trunk: [[-0.04, 0.74, 1.13, { boning: true, busk: true, brocade: true }], [0.7, 0.75, 1.145, 'lace']],
    upperArm: [-0.12, 1.02, 1.08, { lacework: true }], forearm: [-0.04, -0.02, 1.08, { lacework: true }],
  },
  // Escaupil and ichcahuipilli: quilted cotton, thick, stitched in rows.
  escaupil: {
    trunk: [-0.06, 0.96, 1.18, { rows: ['cloth', 'cloth', 'cloth2'] }], skirt: [0.42, 0.45, 1.22, { rows: ['cloth', 'cloth', 'cloth2'] }],
    upperArm: [-0.15, 0.55, 1.15, { rows: ['cloth', 'cloth2'] }],
  },
  ichcahuipilli: {
    trunk: [0.0, 0.94, 1.16, { rows: ['cloth', 'cloth', 'cloth2'] }], skirt: [0.22, 0.35, 1.18, { rows: ['cloth', 'cloth', 'cloth2'] }],
  },
  // The Inca uncu: the Andean man's tunic, one length of cloth woven to
  // shape, folded over the shoulders and sewn up the sides, sleeveless, to
  // the knee; its hem bound in a second colour. Plain (a commoner's, of
  // undyed or brown camelid wool and cotton); with a band of tocapu (squares
  // each woven with its own device) round the waist (a lord's); the black
  // and white checkerboard with a red stepped yoke at the neck (the dress
  // the Inca gave his soldiers and guards, `uncuChecks`); and the tocapu all
  // over (the Sapa Inca's own, `uncuRoyal`: none but he wore it).
  uncu: {
    trunk: [-0.1, 0.95, 1.08, 'cloth'], skirt: [0.88, 0.32, 1.16, { edge: 'cloth2', base: 'cloth' }],
  },
  uncuTocapu: {
    trunk: [-0.1, 0.95, 1.08, { tocapu: [-0.12, 0.16], base: 'cloth' }], skirt: [0.88, 0.32, 1.16, { edge: 'cloth2', base: 'cloth' }],
  },
  uncuChecks: {
    trunk: [-0.1, 0.95, 1.08, { checks: true, yoke: [0.8, 'lace'] }], skirt: [0.88, 0.32, 1.16, { checks: true }],
  },
  uncuRoyal: {
    trunk: [-0.1, 0.95, 1.08, { tocapu: true }], skirt: [0.88, 0.32, 1.16, { tocapu: true }],
  },
  // The jaguar knight's suit: the spotted skin over everything, to the wrists and ankles.
  jaguarSuit: {
    trunk: [-0.06, 0.98, 1.16, { spots: true }], skirt: [0.3, 0.4, 1.2, { spots: true }],
    upperArm: [-0.2, 1.02, 1.14, { spots: true }], forearm: [-0.04, -0.02, 1.12, { spots: true }],
    thigh: [0.0, 1.04, 1.1, { spots: true }], shin: [-0.1, 0.95, 1.1, { spots: true }],
  },
  // The eagle knight's suit: rows of feathers.
  featherSuit: {
    trunk: [-0.06, 0.98, 1.18, { rows: ['cloth', 'cloth', 'cloth2'] }], skirt: [0.32, 0.5, 1.24, { rows: ['cloth', 'cloth2'] }],
    upperArm: [-0.2, 1.02, 1.16, { rows: ['cloth', 'cloth2'] }], forearm: [-0.04, -0.02, 1.12, 'cloth'],
    thigh: [0.0, 1.04, 1.12, { rows: ['cloth', 'cloth2'] }],
  },
  // The same men in lamellar: small iron plates laced in rows (`lace`).
  mingLamellar: {
    trunk: [[-0.06, 0.96, 1.2, { lamellae: 30, gaps: [0], gapWidth: 0.025 }], [0.14, 0.24, 1.36, { buckle: 'gold', base: 'leather' }]],
    skirt: [0.92, 0.55, 1.32, { lamellae: 30, gaps: [0, Math.PI / 2, -Math.PI / 2], gapWidth: 0.06 }],
    upperArm: [-0.26, 0.6, 1.52, { lamellae: 16 }], forearm: [-0.04, -0.03, 1.26, 'steel'],
  },
  // The same coat in iron scales: small plates hung from the row above, their
  // pointed ends down, each row lying over the next.
  mingScaleCoat: {
    trunk: [[-0.06, 0.96, 1.2, { lamellae: 30, pointDown: true, gaps: [0], gapWidth: 0.025 }], [0.14, 0.24, 1.36, { buckle: 'gold', base: 'leather' }]],
    skirt: [0.92, 0.55, 1.32, { lamellae: 30, pointDown: true, gaps: [0, Math.PI / 2, -Math.PI / 2], gapWidth: 0.06 }],
    upperArm: [-0.26, 0.6, 1.52, { lamellae: 16, pointDown: true }], forearm: [-0.04, -0.03, 1.26, 'steel'],
  },
  // The elite in scale armour: overlapping iron scales from the collar to
  // below the knee, hung point down, the steel mirror over the heart; the
  // arms and the neck guard as the brigandine elite's.
  mingScale: {
    trunk: [[-0.06, 0.97, 1.22, { lamellae: 30, pointDown: true, gaps: [0], gapWidth: 0.02 }], [0.14, 0.24, 1.38, { buckle: 'gold', base: 'leather' }], ELITE_GORGET],
    skirt: [0.95, 0.6, 1.34, { lamellae: 30, pointDown: true, edge: 'gold', gaps: [0, Math.PI, Math.PI / 2, -Math.PI / 2], gapWidth: 0.05 }], 
    upperArm: ELITE_ARM, forearm: [-0.04, -0.03, 1.34, { lames: 6, base: 'steel2' }], collar: 'steel',
    mirrors: [[0.62, 0, 0.3, 1.42, 'steel']],
  },
  // The elite in lamellar (Qi Jiguang's and his guards', Qi Jiguang's level):
  // small iron plates laced in rows from the collar to below the knee, the
  // lacing showing (`lace`), the steel mirror over the heart; the arms and
  // the neck guard as the brigandine elite's. The same protection, drawn so.
  mingEliteLamellar: {
    trunk: [[-0.06, 0.97, 1.22, { lamellae: 30, gaps: [0], gapWidth: 0.02 }], [0.14, 0.24, 1.38, { buckle: 'gold', base: 'leather' }], ELITE_GORGET],
    skirt: [0.95, 0.6, 1.34, { lamellae: 30, edge: 'gold', gaps: [0, Math.PI, Math.PI / 2, -Math.PI / 2], gapWidth: 0.05 }],
    upperArm: ELITE_ARM, forearm: [-0.04, -0.03, 1.34, { lames: 6, base: 'steel2' }], collar: 'steel',
    mirrors: [[0.62, 0, 0.3, 1.42, 'steel']],
  },
  // Ming elite: the long brigandine coat to below the knee, its plates
  // riveted close (gilt heads, more and smaller than a soldier's), bound in a
  // dark edge, split for riding; a round steel mirror (huxinjing) over the
  // heart, a buckled belt; a great spaulder of steel lames over each
  // shoulder and lames down the arm to the wrist (ELITE_ARM); the steel
  // neck guard of lames over the shoulders (ELITE_GORGET).
  mingElite: {
    trunk: [[-0.06, 0.97, 1.22, { studded: 28, base: 'cloth', edge: 'cloth2', opening: 0.012, mirror: [0.62, 0.15, 'steel'] }], [0.14, 0.24, 1.32, { buckle: 'gold', base: 'leather' }], ELITE_GORGET],
    skirt: [0.95, 0.6, 1.34, { studded: 30, base: 'cloth', edge: 'cloth2', gaps: [0, Math.PI, Math.PI / 2, -Math.PI / 2], gapWidth: 0.05 }], 
    upperArm: ELITE_ARM, forearm: [-0.04, -0.03, 1.34, { lames: 6, base: 'steel2' }], collar: 'steel',
    mirrors: [[0.62, 0, 0.3, 1.36, 'steel']],
  },
  // Ō-yoroi: its box, skirt panels and shoulder boards are rigid pieces of
  // their own (oyoroi.js); on the body only what is worn on the limbs: the
  // bow arm's brocade sleeve and mailed kote, and the black-lacquered suneate.
  oyoroi: {
    upperArm: { l: [-0.15, 1.02, 1.16, 'cloth2'] },
    forearm: { l: [[-0.06, -0.02, 1.2, MAIL], [-0.04, 0.3, 1.26, 'gold']] },
    shin: [[0.02, 0.86, 1.3, 'steel'], [0.02, 0.1, 1.33, 'gold']],
  },
  // The Iron Pagoda (as reconstructed): lamellar of small dotted iron plates
  // laced in rows, a cuirass to the waist under crossed leather straps, a
  // buckled belt and a braided cord sash with cords hanging; a long skirt of
  // the same to below the knee, split front and sides over a red robe;
  // layered lamellar over the shoulders, the red sleeve at the elbow, lamellar
  // guards to the wrist. Drawn plate by plate (lamellae) but in a crowd.
  ironPagoda: {
    trunk: [[-0.08, 1.0, 1.24, { lamellae: 34 }], [0.2, 0.26, 1.37, { buckle: 'gold', base: 'leather' }], [0.13, 0.18, 1.39, { braid: 'leather', base: 'cloth2' }]],
    skirt: [[1.32, 0.55, 1.28, 'cloth'], [0.98, 0.6, 1.36, { lamellae: 30, gaps: [0, Math.PI / 2, -Math.PI / 2], gapWidth: 0.07, edge: 'gold' }]],
    collar: 'steel',
    upperArm: [[-0.32, 0.5, 1.62, { lamellae: 22 }], [0.45, 0.82, 1.44, { lamellae: 18, shade: 1 }]], forearm: [0.12, -0.02, 1.36, { lamellae: 16 }],
    straps: [[0.98, 0.55, 0.32, -0.75, 0.12, 1.37, 'leather'], [0.98, -0.55, 0.32, 0.75, 0.12, 1.37, 'leather'], [0.98, Math.PI - 0.55, 0.32, Math.PI + 0.75, 0.12, 1.37, 'leather'], [0.98, Math.PI + 0.55, 0.32, Math.PI - 0.75, 0.12, 1.37, 'leather']],
    tassels: [[0.55, 0.75, 0.05, 1.5, 'cloth2'], [0.68, 0.62, 0.05, 1.5, 'cloth2']],
  },
  // Steppe lamellar: iron plates laced in rows to the knees, iron bracers;
  // the leather kind the same cut in hardened hide; the kheshig's gilt-bossed scale.
  steppeLamellar: {
    trunk: [-0.06, 0.98, 1.2, { scales: true }], skirt: [1.0, 0.6, 1.3, { scales: true }], upperArm: [-0.26, 0.55, 1.44, { scales: true }], forearm: [-0.04, -0.03, 1.28, { rows: ['steel', 'steel2'] }],
  },
  steppeLeather: {
    trunk: [-0.06, 0.96, 1.16, { rows: ['cloth', 'cloth', 'cloth2'] }], skirt: [0.9, 0.5, 1.24, { rows: ['cloth', 'cloth2'] }], upperArm: [-0.2, 0.45, 1.32, { rows: ['cloth', 'cloth2'] }],
  },
  kheshig: {
    trunk: [[-0.08, 1.0, 1.22, { lamellae: 30, pointDown: true }], [0.14, 0.24, 1.36, { buckle: 'gold', base: 'leather' }]],
    skirt: [1.05, 0.7, 1.34, { lamellae: 30, pointDown: true, edge: 'gold', gaps: [0, Math.PI], gapWidth: 0.06 }], collar: 'steel',
    upperArm: [[-0.32, 0.45, 1.6, { lamellae: 18, pointDown: true, edge: 'gold' }], [0.45, 1.02, 1.36, { rows: ['steel', 'steel2'] }]], forearm: [-0.04, -0.03, 1.3, { rows: ['steel', 'steel2'] }],
    // The gilt boss over the heart.
    studs: [[0.64, 0, 0.16, 1.32, 'gold']],
  },
  // The lorica hamata of the Republic's legionary: mail to the hips over the
  // tunic (lofted out past the tunic's loose cloth, whose skirt shows below
  // it), the shoulders doubled with a mail cape (humeralia), short sleeves; a belt.
  hamata: {
    trunk: [[-0.12, 0.98, 1.16, MAIL], [0.72, 1.02, 1.24, MAIL]], skirt: [0.28, 0.4, 1.2, MAIL], upperArm: [-0.32, 0.32, 1.22, MAIL],
    belt: [0.02, 0.14, 1.22, { rows: ['lace', 'gold', 'lace'] }],
  },
  // No armour: a leather belt with a bronze buckle over the tunic (a Visigoth
  // warrior's dress, 451). The kit's `cloth` is his shield's paint (weaponview.js).
  girdle: {
    trunk: [0.14, 0.22, 1.2, { buckle: 'gold', base: 'leather' }],
  },
  // The Parthian cataphract (Carrhae, 53 BC; the Dura-Europos graffito and the
  // Khalchayan and Tang-i Sarvak reliefs): a coat of iron scales hung point down
  // from the collar to the knee, split before and behind for the saddle, over a
  // tunic (`cloth`) that shows at the hem, a buckled belt; and the limbs in
  // laminated defences, iron hoops lapping one over the next (as a manica is
  // made) from the shoulder to the wrist and from the hip down to the ankle —
  // the man as closed in iron as his horse. The scales' lacing is `lace`.
  cataphract: {
    trunk: [[-0.08, 1.0, 1.22, { lamellae: 30, pointDown: true, gaps: [0], gapWidth: 0.02 }], [0.14, 0.24, 1.36, { buckle: 'gold', base: 'leather' }]],
    skirt: [[1.12, 0.6, 1.16, 'cloth'], [1.02, 0.68, 1.32, { lamellae: 30, pointDown: true, gaps: [0, Math.PI], gapWidth: 0.06 }]], collar: 'steel',
    upperArm: [[-0.3, 0.38, 1.6, { lamellae: 18, pointDown: true }], [0.3, 1.02, 1.36, { lames: 6, base: 'steel2' }]],
    forearm: [-0.04, -0.03, 1.32, { lames: 7, base: 'steel2' }],
    thigh: [0.55, 1.02, 1.3, { lames: 6, base: 'steel2' }], shin: [-0.06, 0.92, 1.3, { lames: 8, base: 'steel2' }],
  },
  // The Mongol kit as worn by the steppe peoples into the 1600s: the deel to
  // mid-calf over a second robe of another colour showing at the hem, a
  // leather belt with a gilt buckle; the lamellar a vest over it, its skirt
  // split before and behind for the saddle, the deel's sleeves out of the
  // short lamellar shoulders, lamellar bracers; a fox or wolf stole over the
  // shoulders (`fur`). Nothing of it like a Chinese soldier's coat.
  mongolDeel: {
    trunk: [[-0.06, 0.99, 1.1, { panel: [0.1, 0.96, 0.985, 'cloth2'], base: 'cloth' }], [0.18, 0.3, 1.2, { buckle: 'gold', base: 'leather' }]],
    skirt: [[1.32, 0.6, 1.16, 'cloth2'], [1.18, 0.55, 1.2, 'cloth']],
  },
  // Leather lamellar: broad plates of hardened, lacquered hide, fewer and
  // larger than iron ones, laced in rows.
  mongolLamellar: {
    trunk: [[-0.06, 0.99, 1.1, 'cloth'], [-0.02, 0.92, 1.24, { lamellae: 20, gaps: [0], gapWidth: 0.06 }], [0.8, 1.02, 1.42, 'fur'], [0.16, 0.3, 1.34, { buckle: 'gold', base: 'leather' }]],
    skirt: [[1.36, 0.62, 1.16, 'cloth2'], [1.22, 0.56, 1.2, 'cloth'], [0.86, 0.6, 1.32, { lamellae: 18, gaps: [0, Math.PI], gapWidth: 0.1 }]],
    upperArm: [-0.3, 0.4, 1.55, { lamellae: 10 }], forearm: [0.12, -0.02, 1.34, { lamellae: 9 }],
  },
  // The iron-clad horseman (the Ming's, cut as the steppe's): the same in small iron plates, the skirt to the knee.
  mongolIron: {
    trunk: [[-0.06, 0.99, 1.1, 'cloth'], [-0.04, 0.96, 1.24, { lamellae: 32, gaps: [0], gapWidth: 0.04 }], [0.84, 1.02, 1.4, 'fur'], [0.16, 0.3, 1.34, { buckle: 'gold', base: 'leather' }]],
    skirt: [[1.36, 0.62, 1.16, 'cloth2'], [1.24, 0.56, 1.2, 'cloth'], [1.04, 0.62, 1.32, { lamellae: 30, gaps: [0, Math.PI], gapWidth: 0.07 }]], collar: 'steel',
    upperArm: [-0.3, 0.55, 1.55, { lamellae: 18 }], forearm: [0.12, -0.02, 1.34, { lamellae: 14 }],
  },
  // The deel: the steppe robe, crossed over to the right, to below the knee, sashed.
  deel: {
    trunk: [-0.06, 0.99, 1.1, { panel: [0.1, 0.96, 0.985, 'cloth2'], base: 'cloth' }], skirt: [1.05, 0.45, 1.22, 'cloth'], belt: [-0.04, 0.06, 1.16, 'cloth2'],
  },
  // The Janissary's dolama: a long coat buttoned down the front, its skirts to the shin, a sash.
  dolama: {
    trunk: [-0.06, 0.99, 1.1, { panel: [-0.1, 0.96, 0.985, 'cloth2'], base: 'cloth' }], skirt: [1.2, 0.5, 1.22, 'cloth'], belt: [-0.05, 0.07, 1.18, 'lace'],
  },
  // Mail-and-plate (krug): rows of plates set in a mail shirt, mail to the thighs, iron vambraces.
  krug: {
    trunk: [[-0.1, 1.0, 1.12, MAIL], [0.15, 0.85, 1.2, { rows: ['steel', 'steel', 'mail'] }]], skirt: [0.6, 0.45, 1.18, MAIL], collar: 'mail',
    upperArm: [-0.3, 0.55, 1.15, MAIL], forearm: [-0.04, -0.03, 1.3, 'steel'],
  },
  // The krug of great plates (Ottoman, 16th century): a mail shirt to the knee, and over it the round domed plate on the
  // belly with its boss, a plate across the breast, one at each side and two down the back, each a rigid piece with the
  // shirt's heavy rings showing between (`plates`, `discs`: their borders gilt); plate shoulder pieces, iron vambraces.
  krugDisc: {
    trunk: [-0.1, 1.0, 1.12, MAIL], skirt: [0.95, 0.5, 1.16, MAIL], collar: 'mail',
    plates: [[0.6, 0.9, 0, 0.62, 1.18, 'steel', 'gold'], [0.18, 0.62, 1.57, 0.36, 1.18, 'steel', 'gold'], [0.18, 0.62, -1.57, 0.36, 1.18, 'steel', 'gold'], [0.5, 0.9, Math.PI, 0.7, 1.18, 'steel', 'gold'], [0.12, 0.46, Math.PI, 0.7, 1.18, 'steel', 'gold']],
    discs: [[0.35, 0, 0.105, 1.24, 'steel', 'gold', 0.022], [0.35, 0, 0.03, 1.24, 'steel', 'steel2', 0.038]],
    upperArm: [[-0.3, 0.55, 1.15, MAIL], [-0.24, 0.14, 1.48, 'steel']], forearm: [-0.04, -0.03, 1.3, 'steel'],
  },
  // The bekhter: rows of narrow plates down the chest and back, set in the shirt's mail and gilt along their edges, the
  // front open down the middle and buckled shut with leather straps (`plates`, their straps and buckles); laminated plates
  // over the shoulders, a mail skirt, iron vambraces, and a round boss on the belt.
  bekhter: {
    trunk: [-0.1, 1.0, 1.12, MAIL], skirt: [0.75, 0.45, 1.16, MAIL], collar: 'mail',
    plates: [0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86].flatMap((t) => [[t - 0.07, t, 0.5, 0.42, 1.18, 'steel', 'gold'], [t - 0.07, t, -0.5, 0.42, 1.18, 'steel', 'gold'], [t - 0.07, t, Math.PI, 0.95, 1.18, 'steel', 'gold'], [t - 0.045, t - 0.025, 0, 0.2, 1.24, 'leather']]),
    studs: [0.3, 0.38, 0.46, 0.54, 0.62, 0.7, 0.78, 0.86].map((t) => [t - 0.035, 0, 0.045, 1.27, 'gold']),
    belt: [-0.02, 0.1, 1.22, 'leather'],
    discs: [[0.05, 0, 0.045, 1.25, 'steel', 'gold', 0.015]],
    upperArm: [[-0.3, 0.55, 1.15, MAIL], [-0.26, 0.34, 1.48, { lames: 4, base: 'steel' }]], forearm: [-0.04, -0.03, 1.3, 'steel'],
  },
  // The Cuman's mail and plates (12th-13th c.; OUTFITS.cumanHeavy): a mail shirt to mid-thigh, its sleeves to the elbow,
  // and laced over it rows of narrow plain steel plates (CUMAN_LAMES) from the collarbone to the hips, in columns: one each
  // side of the split front, one under each arm, two down the back, the dark mail showing in the strips between; the front
  // buckled shut with leather straps (`plates` and their brass buckles, `studs`); a coloured sash wound at the waist under a
  // red leather belt (the kit's `lace`), the bow case's strap across the chest; lames down the outside of the upper arm, hinged steel vambraces.
  cumanMail: {
    trunk: [[-0.1, 1.0, 1.12, MAIL], [0.1, 0.22, 1.27, 'cloth2'], [0.13, 0.19, 1.3, { buckle: 'gold', base: 'lace' }]], skirt: [0.62, 0.6, 1.24, MAIL], collar: 'mail',
    plates: cumanLames(),
    studs: CUMAN_LAMES.straps.map((t) => [t, 0.07, 0.05, 1.3, 'gold']),
    straps: [[0.96, -0.75, 0.2, 1.3, 0.06, 1.29, 'leather']],
    upperArm: [[-0.3, 1.0, 1.14, MAIL], [-0.2, 0.72, 1.42, { lames: 7, base: 'steel' }]], forearm: [-0.04, -0.03, 1.3, 'steel'],
  },
  // An alp's mail hauberk with round mirror plates laced over the breast and back (the char-aina's forerunners).
  mailMirror: {
    trunk: [-0.12, 1.0, 1.12, MAIL], skirt: [0.75, 0.4, 1.16, MAIL], collar: 'mail', upperArm: [-0.3, 1.0, 1.14, MAIL],
    discs: [[0.62, 0, 0.075, 1.16, 'steel', 'gold', 0.015], [0.62, Math.PI, 0.08, 1.16, 'steel', 'gold', 0.012], [0.62, 0, 0.02, 1.16, 'steel', 'steel2', 0.028]],
  },
  // A mail hauberk to the knees, long-sleeved.
  hauberk: {
    trunk: [-0.12, 1.0, 1.12, MAIL], skirt: [0.75, 0.4, 1.16, MAIL], collar: 'mail', upperArm: [-0.3, 1.0, 1.14, MAIL],
  },
  // A patrol officer's vest carrier over the shirt, a badge on the chest, the duty belt.
  patrolVest: {
    trunk: [0.32, 0.8, 1.08, { mon: [0.7, 0.07, 'gold'], base: 'cloth' }], belt: [-0.06, 0.04, 1.16, 'cloth'],
  },
  // A plate carrier: front and back plates over the torso, a band of magazine
  // pouches across the belly, a padded belt.
  plateCarrier: {
    trunk: [[0.3, 0.84, 1.14, { rows: ['cloth', 'cloth', 'cloth2'] }], [0.3, 0.5, 1.2, { panel: [0.3, 0.5, -0.2, 'cloth2'], base: 'cloth' }]], belt: [-0.06, 0.06, 1.18, 'cloth2'],
  },
  // A foot soldier's mail shirt: to the hips, sleeves to the elbow.
  haubergeon: {
    trunk: [-0.12, 1.0, 1.12, MAIL], skirt: [0.3, 0.3, 1.14, MAIL], collar: 'mail', upperArm: [-0.3, 0.5, 1.15, MAIL],
  },
  // A foot soldier's breastplate and backplate, a short fauld, knee cops: nothing on the arms.
  breastplate: {
    trunk: [-0.04, 0.96, 1.19, 'steel'], skirt: [0.22, 0.3, 1.2, { rows: ['steel', 'steel2'] }], knee: [0.82, 1.05, 1.45, 'steel'],
    rigidBreastplate: [0.32, 0.96],
  },
  // Murmillo: belt, the manica on the sword arm, a short greave on the lead leg over a quilted wrap.
  murmillo: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: { l: [0.62, 1.0, 1.18, 'pad'] }, shin: { l: [-0.05, 0.55, 1.32, 'steel'] },
  },
  // Secutor: like the murmillo, the greave higher.
  secutor: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: { l: [0.55, 1.0, 1.18, 'pad'] }, shin: { l: [-0.12, 0.9, 1.32, 'steel'] },
  },
  // Retiarius: no helmet, no greaves; the galerus standing up from the left shoulder, a manica on that arm.
  retiarius: {
    belt: BALTEUS, upperArm: { l: [[-0.32, 0.28, 2.0, 'steel'], [0.2, 1.02, 1.3, MANICA]] }, forearm: { l: [-0.06, -0.02, 1.3, MANICA] },
  },
  // Maximus: the leather under his harness (the detail is arenaview's
  // buildHarness): the cuirass's layers, the left shoulder guard, the bracers.
  maximus: {
    trunk: [-0.06, 0.96, 1.13, { rows: ['armor', 'armor', 'lace'] }],
    upperArm: { l: [[-0.32, 0.22, 1.7, { rows: ['armor', 'lace'] }], [0.15, 0.45, 1.42, { rows: ['armor', 'lace'] }]] },
    forearm: [0.42, -0.02, 1.24, { rows: ['armor', 'lace'] }],
  },
  // Guan Yu: the green robe crossed over the breast and down to the shins,
  // its dark green edge, a gilt belt; the gilt scale shows where it is
  // proud of the robe, over the shoulders and down the arms.
  guanYu: {
    trunk: [-0.08, 1.0, 1.24, { panel: [0.1, 0.96, 0.985, 'cloth2'], base: 'cloth' }], skirt: [1.2, 0.55, 1.3, { rows: ['cloth', 'cloth', 'cloth', 'cloth2'] }], belt: [-0.04, 0.07, 1.28, 'gold'], collar: 'cloth',
    upperArm: [[-0.32, 0.45, 1.62, { scales: true }], [0.45, 1.02, 1.36, { rows: ['steel', 'steel2'] }]], forearm: [-0.04, -0.03, 1.3, { rows: ['steel', 'steel2'] }],
  },
  // A Han soldier: a vest of small iron lamellae to the waist, with short
  // lamellar flaps over the shoulders, over a red robe to the knee.
  hanLamellar: {
    trunk: [-0.06, 0.95, 1.18, { scales: true }], skirt: [0.95, 0.5, 1.2, { rows: ['cloth', 'cloth', 'cloth', 'cloth2'] }], belt: [-0.04, 0.05, 1.22, 'lace'],
    upperArm: [-0.3, 0.2, 1.42, { scales: true }],
  },
  // The wuxia robe: crossed over the breast, to the shins, a sash.
  wuxiaRobe: {
    trunk: [-0.06, 0.99, 1.12, { panel: [0.1, 0.96, 0.985, 'cloth2'], base: 'cloth' }], skirt: [1.15, 0.55, 1.22, 'cloth'], belt: [-0.05, 0.08, 1.18, 'cloth2'],
  },
  // The lorica segmentata: iron hoops round the trunk from the armpits to
  // the waist, each lapping the one below, girth plates and the collar of
  // plates over the shoulders; lames over the upper arm; a studded belt.
  segmentata: {
    trunk: [-0.02, 0.97, 1.22, { rows: ['steel', 'steel', 'steel2'] }], collar: 'steel',
    upperArm: [-0.32, 0.4, 1.6, { rows: ['steel', 'steel', 'steel2'] }], belt: [0.02, 0.18, 1.26, { rows: ['lace', 'gold', 'lace'] }],
  },
  // A centurion's mail to the thigh, doubled over the shoulders, a belt; greaves.
  centurion: {
    trunk: [-0.12, 0.98, 1.14, MAIL], skirt: [0.32, 0.4, 1.18, MAIL], upperArm: [-0.32, 0.3, 1.2, MAIL],
    belt: [0.02, 0.16, 1.2, { rows: ['lace', 'gold', 'lace'] }], shin: [-0.12, 0.88, 1.3, 'steel'],
  },
  // A huque: a sleeveless cloth tunic over the armour, to the upper thigh,
  // open at the sides below the waist (here: the skirt split by its flare).
  huque: {
    trunk: [-0.1, 0.94, 1.26, { panel: [0.0, 0.94, 0.995, 'cloth2'], base: 'cloth' }], skirt: [0.34, 0.6, 1.34, 'cloth'],
  },
  // Commodus: nothing lofted; the lion's skin is drawn whole (arenaview's buildLionPelt).
  commodus: {},
  // Scissor: a shirt of bronze scales to the hips, the manica, the left
  // forearm in a steel tube (its crescent blade is the scissores, carried as
  // a shield), greaves on both shins.
  scissor: {
    trunk: [-0.16, 0.98, 1.16, { scales: true }], belt: BALTEUS, collar: 'steel',
    upperArm: { r: [-0.25, 1.02, 1.32, MANICA], l: [-0.2, 0.5, 1.4, { scales: true }] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA], l: [-0.1, 0.06, 1.55, 'steel'] },
    shin: [-0.1, 0.88, 1.32, 'steel'],
  },
  // A silverback's fur is his skin's colour; the silver saddle over the
  // back and down the hips (`back`: from, to up the piece, its role), the
  // rest of the coat black (`cloth`).
  silverback: {
    trunk: [-0.12, 1.02, 1.03, { back: [-0.12, 0.8, 'armor'], base: 'cloth' }],
    thigh: [0, 0.5, 1.03, { back: [0, 1, 'armor'], base: 'cloth' }],
  },
  // Thraex: quilted wraps up both thighs, high greaves over them, the manica.
  thraex: {
    belt: BALTEUS, upperArm: { r: [-0.25, 1.02, 1.32, MANICA] }, forearm: { r: [-0.06, -0.02, 1.32, MANICA] },
    thigh: [[0.05, 0.75, 1.2, { rows: ['pad', 'kit'] }], [0.68, 1.05, 1.34, 'steel']], shin: [-0.14, 0.9, 1.32, { rows: ['steel', 'steel', 'gold'] }],
  },
};

/** The pieces in a slot of an armour kind, for one side. */
function armorPieces(kind, slot, side) {
  const value = kind?.[slot];
  if (!value) return [];
  const forSide = Array.isArray(value) ? value : value[side];
  if (!forSide) return [];
  return Array.isArray(forSide[0]) ? forSide : [forSide];
}

// Tocapu's squares in turn: the cloth's red, its white, yellow (the `gold`), black (the `lace`), and the green or blue (the `leather`).
const TOCAPU_ROLES = ['cloth', 'gold', 'lace', 'cloth2', 'leather', 'cloth', 'lace', 'gold', 'cloth2'];

/** A paint as the loft wants it: a role, or a function of the ring and its place. */
function paintFor(paint, armor) {
  if (typeof paint === 'string' || typeof paint === 'function') return paint;
  if (paint.mail) return (ring, angle, index, step) => ((index + step) % 2 ? 'mail' : 'mail2');
  if (paint.heraldry) return (ring, angle) => heraldry(armor?.heraldry, ring.t, Math.sin(angle), Math.cos(angle));
  if (paint.mon) {
    // A round crest on the breast: centred `t` up the trunk, `size` across.
    const [centre, size, role] = paint.mon;
    return (ring, angle) => (Math.cos(angle) > 0 && Math.hypot((ring.t - centre) / size, Math.sin(angle) / (size * 2.6)) < 1 ? role : paint.base);
  }
  if (paint.panel) {
    const [from, to, ahead, role] = paint.panel;
    return (ring, angle) => (ring.t > from && ring.t < to && Math.cos(angle) > ahead ? role : paint.base);
  }
  return (ring, angle, index, step) => {
    // A region over the back (`back`: from, to along the piece, its role): a silverback's saddle.
    if (paint.back && ring.t > paint.back[0] && ring.t < paint.back[1] && Math.cos(angle) < -0.2) return paint.back[2];
    // A round plate over the breast (`mirror`: centre up the trunk, size, role), riveted cloth round it.
    if (paint.mirror && Math.cos(angle) > 0 && Math.hypot((ring.t - paint.mirror[0]) / paint.mirror[1], Math.sin(angle) / (paint.mirror[1] * 2.6)) < 1) return paint.mirror[2];
    // An Andean weave (the uncu): a checkerboard of the cloth's two colours
    // (`checks`), each square a few rings and steps (a hand's breadth), under a
    // stepped yoke at the neck (`yoke`: from how far up the trunk, its role)
    // that comes down in a point before and behind; or tocapu (`tocapu`: a
    // band from, to up the trunk, or `true` all over), squares each of their
    // own colour in turn (TOCAPU_ROLES).
    if (paint.checks) {
      if (paint.yoke && ring.t > paint.yoke[0] - 0.14 * Math.max(0, Math.abs(Math.cos(angle)) - 0.4)) return paint.yoke[1];
      return (Math.floor(index / 3) + Math.floor(step / 2)) % 2 ? 'cloth2' : 'cloth';
    }
    if (paint.tocapu && (paint.tocapu === true || (ring.t > paint.tocapu[0] && ring.t < paint.tocapu[1]))) {
      return TOCAPU_ROLES[(Math.floor(index / 2) * 2 + Math.floor(step / 2)) % TOCAPU_ROLES.length];
    }
    // A big cat's rosettes, scattered: a dark spot every few rings and steps.
    if (paint.spots) return (index * 7 + step * 3) % 5 === 0 ? 'cloth2' : 'cloth';
    // Sheer lace: the skin showing through an open mesh.
    if (paint.lacework) return index % 2 === 0 || step % 3 === 0 ? 'lace' : 'skin';
    // A corset: laced up the back, a steel busk down the front (its clasps
    // in pairs, `busk`), a bone every few panels, brocade between them.
    if (paint.boning) {
      if (Math.cos(angle) < -0.93) return 'lace';
      if (Math.cos(angle) > 0.97) return paint.busk && index % 3 === 1 ? 'gold' : 'cloth2';
      if (step % 3 === 0) return 'cloth2';
      if (paint.brocade && (index * 5 + step * 3) % 7 === 0) return 'cloth2';
      return 'cloth';
    }
    // Scales: rows of them, each offset by half a scale from the one above,
    // the lower edge of every third row dark with its lacing so the rows read.
    if (paint.scales) return index % 3 === 2 ? 'lace' : (step + index) % 2 ? 'steel' : 'steel2';
    // Laminated plate in a crowd: its bands as rows, a dark line between.
    if (paint.lames) return index % 2 ? 'steel2' : 'steel';
    // A brigandine (studded): its edges and front opening bound in the second
    // colour, the splits showing it too; in a crowd, the rivets as dots.
    if (paint.studded) {
      if ((paint.edge && index === 0) || (paint.opening && Math.cos(angle) > 1 - paint.opening) || inLamellaGap(paint, angle)) return paint.edge ?? paint.base;
      if (paint.studsDrawn) return paint.base;
      // In a crowd (not drawn as faces of their own: apronOn, bandsOn): the apron panel's bound edges (`apron`: from, to up
      // the piece, its half width round as the sine of the angle), and steel bands across a skirt (`bands`: how many).
      if (paint.apron && apronEdge(paint.apron, ring.t, angle)) return paint.edge ?? paint.base;
      if (paint.placket && Math.cos(angle) > Math.cos(paint.placket * 2)) return paint.edge ?? paint.base;
      if (paint.bands && index > 0 && index % 2 === 0) return 'steel';
      return index % 2 === 1 && step % 2 === 0 ? 'gold' : paint.base;
    }
    // Lamellae drawn plainly (a crowd): rows of plates and their lacing; the robe in the splits.
    if (paint.lamellae) return inLamellaGap(paint, angle) ? 'cloth' : index % 3 === 2 ? 'lace' : 'steel';
    // A belt with its buckle in front; a braided cord.
    if (paint.buckle) return Math.cos(angle) > 0.96 ? paint.buckle : paint.base;
    if (paint.braid) return (index + step) % 2 ? paint.braid : paint.base;
    if (paint.rivets && index % paint.rivets === 1 && step % 3 === 0) return 'gold';
    // A hem in its own colour: the lowest ring (a skirt's rings run up from the hem).
    if (paint.edge && index === 0) return paint.edge;
    if (paint.rows) return paint.rows[index % paint.rows.length];
    return paint.base;
  };
}

/** Whether a place on a piece (its ring's t, the angle round it, 0 at the front) is on the binding round an apron panel ([from, to, half width]). */
function apronEdge([from, to, half], t, angle) {
  if (Math.cos(angle) <= 0) return false;
  const across = Math.abs(Math.sin(angle));
  const inside = t > from && t < to && across < half;
  // (The binding at least a ring deep at the top and the bottom: in a crowd the rings are far apart.)
  return inside && (across > half * 0.72 || t < from + 0.07 || t > to - 0.07);
}

/** Whether an angle round a piece (0 at the front) falls in one of its lamellar splits (`gaps`: centres and a half-width, rad). */
function inLamellaGap(paint, angle) {
  const half = paint.gapWidth ?? 0;
  return (paint.gaps ?? []).some((centre) => Math.abs(Math.atan2(Math.sin(angle - centre), Math.cos(angle - centre))) < half);
}

/** A ring at a fractional place along a run of rings: its centre, axes and size between its neighbours. */
function ringAt(rings, place) {
  const index = Math.max(0, Math.min(rings.length - 2, Math.floor(place)));
  const share = place - index;
  const a = rings[index];
  const b = rings[index + 1];
  const mix = (x, y) => x + (y - x) * share;
  return {
    t: mix(a.t, b.t), center: vec.lerp(a.center, b.center, share), depthAxis: a.depthAxis, widthAxis: a.widthAxis,
    depth: mix(a.depth, b.depth), width: mix(a.width, b.width),
    // (Of the nearer ring's stiff body: stiffen.)
    body: (share < 0.5 ? a : b).body,
  };
}

/** A point on a ring's surface at `angle` (0 at the front), `out` times its radius. */
function onRing(ring, angle, out) {
  return vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * out), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * out)));
}

/** How far out from its ring's middle the piece lofted on `points` of a `ring` stands at `angle` round it (between its two points nearest that way). */
function pieceRadius(mesh, ring, points, angle) {
  let [before, after] = [null, null];
  for (const vertex of points) {
    const turn = Math.atan2(Math.sin(mesh.ringA[vertex] - angle), Math.cos(mesh.ringA[vertex] - angle));
    if (turn <= 0 && (!before || turn > before.turn)) before = { vertex, turn };
    if (turn >= 0 && (!after || turn < after.turn)) after = { vertex, turn };
  }
  const radius = ({ vertex }) => vec.length(vec.sub(mesh.positions.slice(vertex * 3, vertex * 3 + 3), ring.center));
  if (!before || !after) return radius(before ?? after);
  const span = after.turn - before.turn;
  return span < 1e-9 ? radius(before) : radius(before) + (radius(after) - radius(before)) * (-before.turn / span);
}

/**
 * A point laid on a piece (a patch's corner, a grid's: a rivet, a lame, a strap) rides it: where the piece is afterwards fitted
 * to a base body (fitClothToBase moves a lofted piece's points out to clear the flesh) the point goes out with the piece under
 * it, by the share that moved (ridePieces). Noted here against the piece lofted last on the rings either side of its `place`.
 */
function ridePiece(mesh, rings, place, angle, vertex) {
  if (!mesh.ringPoints) return;
  const index = Math.max(0, Math.min(rings.length - 2, Math.floor(place)));
  const share = Math.max(0, Math.min(1, place - index));
  const under = [];
  for (const [ring, weight] of [[rings[index], 1 - share], [rings[index + 1], share]]) {
    const points = mesh.ringPoints.get(ring);
    if (!points?.length) return;
    under.push({ ring, points, weight, was: pieceRadius(mesh, ring, points, angle) });
  }
  (mesh.riders ??= []).push({ vertex, angle, centre: ringAt(rings, place).center, under });
}

/** The points riding a piece (ridePiece) moved out or in with it, once it is fitted: boards apart, which lie on the whole (clearBoards). */
function ridePieces(mesh) {
  const onBoard = (vertex) => (mesh.boards ?? []).some(({ from, to }) => vertex >= from && vertex < to);
  for (const { vertex, angle, centre, under } of mesh.riders ?? []) {
    if (onBoard(vertex)) continue;
    const moved = under.reduce((sum, { ring, points, weight, was }) => sum + weight * (was > 1e-6 ? pieceRadius(mesh, ring, points, angle) / was : 1), 0);
    if (Math.abs(moved - 1) < 1e-4) continue;
    for (let axis = 0; axis < 3; axis += 1) mesh.positions[vertex * 3 + axis] = centre[axis] + (mesh.positions[vertex * 3 + axis] - centre[axis]) * moved;
  }
}

/**
 * Add a flat polygon to the mesh, lying on a piece of the body: its corners
 * as [place along the rings, angle, out], wound to face outward, each
 * weighted where the body's surface is beneath it.
 */
function addPatch(mesh, rings, corners, role, bones) {
  const start = mesh.positions.length / 3;
  const points = corners.map(([place, angle, out]) => onRing(ringAt(rings, place), angle, out));
  for (const [index, [place, angle]] of corners.entries()) {
    const ring = ringAt(rings, place);
    mesh.positions.push(...points[index]);
    mesh.weightPositions.push(...onRing(ring, angle, 1));
    mesh.colors.push(role);
    mesh.bones.push(bones(rings[Math.round(Math.max(0, Math.min(rings.length - 1, place)))], Math.cos(angle)));
    mesh.stiff.push(bodyAt(mesh, ring, angle));
    patchUv(mesh, rings, role, start + index, place, angle);
    ridePiece(mesh, rings, place, angle, start + index);
  }
  // Wound so its face looks away from the piece's axis.
  const [place0, angle0] = corners[0];
  const outward = vec.sub(points[0], ringAt(rings, place0).center);
  const normal = vec.cross(vec.sub(points[1], points[0]), vec.sub(points[2], points[0]));
  const flip = vec.dot(normal, outward) < 0;
  for (let corner = 1; corner < corners.length - 1; corner += 1) {
    if (flip) mesh.indices.push(start, start + corner + 1, start + corner);
    else mesh.indices.push(start, start + corner, start + corner + 1);
  }
  return angle0;
}

/**
 * A grid of faces over a piece, its vertices shared within it (so it
 * shades smooth) but with nothing else (so its edges are sharp):
 * `grid[row][column]` = [place, angle, out].
 */
function addGrid(mesh, rings, grid, role, bones) {
  const start = mesh.positions.length / 3;
  const columns = grid[0].length;
  for (const row of grid) {
    for (const [place, angle, out] of row) {
      const ring = ringAt(rings, place);
      mesh.positions.push(...onRing(ring, angle, out));
      mesh.weightPositions.push(...onRing(ring, angle, 1));
      mesh.colors.push(role);
      mesh.bones.push(bones(rings[Math.round(Math.max(0, Math.min(rings.length - 1, place)))], Math.cos(angle)));
      mesh.stiff.push(bodyAt(mesh, ring, angle));
      patchUv(mesh, rings, role, mesh.positions.length / 3 - 1, place, angle);
      ridePiece(mesh, rings, place, angle, mesh.positions.length / 3 - 1);
    }
  }
  const at = (row, column) => start + row * columns + column;
  // Wound so its faces look away from the piece's axis (judged on the first).
  const point = (index) => mesh.positions.slice(index * 3, index * 3 + 3);
  const [place0] = grid[0][0];
  const outward = vec.sub(point(at(0, 0)), ringAt(rings, place0).center);
  const normal = vec.cross(vec.sub(point(at(0, 1)), point(at(0, 0))), vec.sub(point(at(1, 0)), point(at(0, 0))));
  const flip = vec.dot(normal, outward) < 0;
  for (let row = 0; row < grid.length - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const [a, b, c, d] = [at(row, column), at(row, column + 1), at(row + 1, column + 1), at(row + 1, column)];
      if (flip) mesh.indices.push(a, c, b, a, d, c);
      else mesh.indices.push(a, b, c, a, c, d);
    }
  }
}

/**
 * A rigid plate's grid (addGrid) over a run of rings: from place `from` to `to` along it, `half` (rad) each side of `angle`,
 * standing at `out` and a little more over its middle, so it reads as a curved plate laid on what is under it.
 */
function curvedPlate(from, to, angle, half, out) {
  const rows = 4;
  const columns = Math.max(3, Math.round(half * 10));
  return Array.from({ length: rows + 1 }, (_, row) => Array.from({ length: columns + 1 }, (_, column) => {
    const across = column / columns - 0.5;
    return [from + ((to - from) * row) / rows, angle + across * 2 * half, out + 0.02 * (1 - (2 * across) ** 2)];
  }));
}

/**
 * A round domed plate's grid (addGrid) on a run of rings: rings out from its middle at place `centre` and `angle`, `radius`
 * (m) across, kept round where the piece narrows (each point's angle and place from its own ring's width and spacing), its
 * middle `dome` (m) proud of its rim at `out`.
 */
function domedDisc(rings, centre, angle, radius, out, dome) {
  const turns = 18;
  const spacing = vec.length(vec.sub(ringAt(rings, centre + 0.5).center, ringAt(rings, centre - 0.5).center)) || 0.025;
  return Array.from({ length: 5 }, (_, ring) => {
    const reach = ring / 4;
    return Array.from({ length: turns + 1 }, (_, side) => {
      const turn = (side / turns) * Math.PI * 2;
      const place = centre + (Math.sin(turn) * radius * reach) / spacing;
      const { width, depth } = ringAt(rings, place);
      const across = Math.asin(Math.max(-0.95, Math.min(0.95, (Math.cos(turn) * radius * reach) / (width * out))));
      return [place, angle + across, out + (dome * (1 - reach * reach)) / depth];
    });
  });
}

/**
 * A board hung beside a limb (`paint.board`: the sode of Japanese armour on its shoulder strap, a coat's shoulder flap): not a
 * shell round the arm but a nearly flat panel down its outside (`outer`: +1 the left limb's side round, -1 the right's),
 * LOFT.board.wide across (times `scale`) and standing clear of the limb's thickest ring by the piece's `inflate`. Its rows
 * are lames, each one's head standing out over the foot of the lame above, the top one a plain cap plate; with a laced tile
 * (`tile`, where the maps are drawn) each is a row of the tile tall and wears it. The whole is one stiff body riding the limb.
 */
function boardOn(mesh, rings, outer, inflate, paint, tile = null, scale = 1) {
  const spec = { ...LOFT.board, ...(paint.board === true ? null : paint.board) };
  const laced = tile && isLacedTile(tile) ? DETAIL_ARMOUR[tile] : null;
  const last = rings.length - 1;
  const lames = Math.max(3, Math.round(measureRings(rings, 1).length / (laced?.row ?? spec.row)));
  const half = (spec.wide * scale) / 2;
  const columns = mesh.stiffens ? spec.columns : 2;
  const clear = Math.max(...rings.map((ring) => ring.width)) * inflate;
  const across = laced ? Math.max(1, Math.round((half * 2) / (laced.columns * laced.pitch))) : 0;
  // A point of the board: `along` (m) fore and aft of the limb's axis, `stand` (m) out from it, at a place down the rings.
  const point = (place, along, stand) => {
    const ring = ringAt(rings, place);
    const [fore, side] = [along / ring.depth, (outer * stand) / ring.width];
    return [place, Math.atan2(side, fore), Math.hypot(fore, side)];
  };
  const rows = paint.rows ?? [paint.base ?? 'steel'];
  const first = mesh.positions.length / 3;
  // A flap of a coat of plates (`studded`): one face of its cloth, hanging whole, bound round in the coat's binding (a board
  // of the binding under a face of the cloth a little smaller), the rivet heads its tile's.
  const flap = Boolean(paint.studded);
  mesh.body = stiffBody(mesh, 'hung');
  const length = measureRings(rings, 1).length;
  const field = flap && tile && !laced ? { band: DETAIL_ARMOUR[tile].band, size: tileSize(tile) } : null;
  for (const [role, bound, lift] of flap ? [[paint.edge ?? paint.base, 0, 0], [paint.base, spec.bound, spec.tilt * 0.3]] : [[null, 0, 0]]) {
    for (let lame = 0; lame < lames; lame += 1) {
      const start = mesh.positions.length / 3;
      const grid = [0, 1].map((foot) => Array.from({ length: columns + 1 }, (_, column) => {
        const share = (column / columns) * 2 - 1;
        const down = Math.min(length - bound, Math.max(bound, ((lame + foot) / lames) * length));
        const along = share * (half - bound);
        return point((down / length) * last, along, clear + lift + (foot || flap ? 0 : spec.tilt) - spec.bow * (along / half) ** 2);
      }));
      addGrid(mesh, rings, grid, role ?? (laced ? rows[0] : rows[lame % rows.length]), () => null);
      if (field && bound) {
        for (let index = 0; index < 2 * (columns + 1); index += 1) {
          const down = Math.min(length - bound, Math.max(bound, ((lame + (index > columns ? 1 : 0)) / lames) * length));
          mesh.uvs.set(start + index, [field.band + (((index % (columns + 1)) / columns) * 2 * (half - bound)) / field.size[0], (length - down) / field.size[1]]);
        }
      }
      if (!laced || lame === 0) continue;
    for (let index = 0; index < 2 * (columns + 1); index += 1) {
        mesh.uvs.set(start + index, [laced.band + ((index % (columns + 1)) / columns) * across, (lames - lame - (index > columns ? 1 : 0)) / laced.rows]);
      }
    }
  }
  mesh.body = 0;
  const axis = vec.sub(rings[last].center, rings[0].center);
  (mesh.boards ??= []).push({
    from: first, to: mesh.positions.length / 3, origin: rings[0].center, axis: vec.normalize(axis), length: vec.length(axis),
    fore: rings[0].depthAxis, out: vec.scale(rings[0].widthAxis, outer), half, stand: (share) => clear - spec.bow * share * share, over: spec.over, give: spec.give,
  });
}

/**
 * The boards (boardOn) laid on what is under them: each was built off the limb's rings, which a fitted body's flesh and the
 * clothes laid on it may stand out past (a heavy man's shoulder, a full sleeve) or fall short of. Each line across it is
 * moved out or in to where every point of the body and its clothes under it is `over` (m) inside it, the board giving from
 * line to line as its lacing or its cloth lets it (`give`): it lies over the shoulder's round and hangs down the arm.
 */
function clearBoards(mesh) {
  const boards = mesh.boards ?? [];
  const onBoard = (vertex) => boards.some(({ from, to }) => vertex >= from && vertex < to);
  for (const board of boards) {
    // What lies under its face: [share down it, how far out the board must stand there].
    const under = [];
    for (let vertex = 0; vertex < mesh.positions.length / 3; vertex += 1) {
      if (onBoard(vertex)) continue;
      const rel = vec.sub(mesh.positions.slice(vertex * 3, vertex * 3 + 3), board.origin);
      const down = vec.dot(rel, board.axis);
      const fore = vec.dot(rel, board.fore);
      const out = vec.dot(rel, board.out);
      if (out <= 0 || down < 0 || down > board.length || Math.abs(fore) > board.half) continue;
      under.push([down / board.length, out + board.over - board.stand(fore / board.half)]);
    }
    if (!under.length) continue;
    // How far out each of `rows` lines across it must stand, and no line more than `give` (m out per m down) off the next:
    // its lames give that much on their lacing, a flap's cloth between its plates.
    const rows = 8;
    const need = new Array(rows + 1).fill(-Infinity);
    for (const [share, out] of under) for (const row of [Math.floor(share * rows), Math.ceil(share * rows)]) need[row] = Math.max(need[row], out);
    const step = (board.give * board.length) / rows;
    for (let pass = 0; pass < rows; pass += 1) {
      for (let row = 0; row <= rows; row += 1) need[row] = Math.max(need[row], (need[row - 1] ?? -Infinity) - step, (need[row + 1] ?? -Infinity) - step);
    }
    for (let vertex = board.from; vertex < board.to; vertex += 1) {
      const at = Math.max(0, Math.min(rows, (vec.dot(vec.sub(mesh.positions.slice(vertex * 3, vertex * 3 + 3), board.origin), board.axis) / board.length) * rows));
      const row = Math.min(rows - 1, Math.floor(at));
      const move = need[row] + (need[row + 1] - need[row]) * (at - row);
      for (let axis = 0; axis < 3; axis += 1) mesh.positions[vertex * 3 + axis] += board.out[axis] * move;
    }
  }
}

/**
 * Lamellae as plates: a row of small rounded-top plates between each pair
 * of rings, `paint.lamellae` round, each row offset half a plate from the
 * next, their rounded tops up (towards the shoulder on an arm), each with
 * two dark punched holes; none in the piece's splits (`gaps`). The bottom
 * row is `paint.edge` (a brass-edged hem) if given.
 */
function lamellaeOn(mesh, rings, inflate, paint, bones) {
  const spec = LOFT.lamellae;
  const columns = paint.lamellae;
  // Which way along the rings is up in the bind pose: the plates' tops go that way.
  const rising = rings.at(-1).center[1] >= rings[0].center[1];
  const rows = rings.length - 1;
  for (let row = 0; row < rows; row += 1) {
    // The plate's foot and top as places along the rings.
    const foot = rising ? row : row + 1;
    const way = rising ? 1 : -1;
    const lowest = rising ? row === 0 : row === rows - 1;
    const role = lowest && paint.edge ? paint.edge : (row + (paint.shade ?? 0)) % 4 === 3 ? 'steel2' : 'steel';
    for (let column = 0; column < columns; column += 1) {
      const angle = ((column + (row % 2) * 0.5) / columns) * Math.PI * 2;
      if (inLamellaGap(paint, angle)) continue;
      const half = (Math.PI / columns) * spec.width;
      const along = (u) => foot + way * u;
      const out = (u) => inflate + spec.lift + spec.tilt * Math.max(0, 1 - u);
      const bottom = -spec.overlap;
      if (paint.pointDown) {
        // Scales: hung from the top, the free end pointed and lying over the row below; no lacing holes showing.
        const waist = bottom + (1 - bottom) * (1 - spec.shoulder);
        addPatch(mesh, rings, [
          [along(1), angle - half, out(1)], [along(1), angle + half, out(1)],
          [along(waist), angle + half, out(waist)], [along(bottom), angle, out(bottom)], [along(waist), angle - half, out(waist)],
        ], role, bones);
        continue;
      }
      addPatch(mesh, rings, [
        [along(bottom), angle - half, out(bottom)], [along(bottom), angle + half, out(bottom)],
        [along(spec.shoulder), angle + half, out(spec.shoulder)], [along(1), angle, out(1)], [along(spec.shoulder), angle - half, out(spec.shoulder)],
      ], role, bones);
      // The holes: small dark squares a hair out from the plate.
      const [across, high] = spec.hole;
      for (const at of spec.holes) {
        const u = bottom + (1 - bottom) * at;
        const lift = out(u) + 0.006;
        addPatch(mesh, rings, [
          [along(u - high / 2), angle - half * across, lift], [along(u - high / 2), angle + half * across, lift],
          [along(u + high / 2), angle + half * across, lift], [along(u + high / 2), angle - half * across, lift],
        ], 'lace', bones);
      }
    }
  }
}

/**
 * Laced lamellar as a shell carrying a laced tile's maps (detailmaps.js `style`: 'lamellae' the steppe's and the Chinese, 'kozane'
 * the Japanese; instead of lamellaeOn's plates or rows painted in two colours): one loft over the piece in rows of the tile's own
 * height (DETAIL_ARMOUR[style].row, as many as fit the piece), two rings where the rows meet (the head of the row below standing
 * out in front of the foot of the row above, so the outline steps row by row as the plates do), `sides` round; its texture
 * coordinates count the tile's plates round (a whole number of tiles, by the piece's girth) and its rows up. `roleOf(row, rows)`:
 * each row's paint, the lowest row 0; `holes(t, angle)`: where the shell is left open (a split, a leather panel).
 */
function lacedShell(mesh, rings, inflate, roleOf, bones, sides, style, holes = null) {
  const spec = LOFT.lamellae;
  const tile = DETAIL_ARMOUR[style];
  const measure = measureRings(rings, inflate);
  const across = Math.max(1, Math.round(measure.girth / (tile.columns * tile.pitch)));
  const rows = Math.max(1, Math.round(measure.length / tile.row));
  const last = rings.length - 1;
  const low = inflate + spec.lift;
  const high = inflate + spec.lift + spec.tilt;
  const shell = [];
  // `up`: rows up the piece (0 at its lowest ring).
  const add = (up, outward, role, body) => {
    const place = (up / rows) * last;
    shell.push({ ...ringAt(rings, measure.rising ? place : last - place), out: outward, v: up / tile.rows, role, ...(body ? { body } : {}) });
  };
  // Where the piece is stiff in rows (stiffen), each laced row is a stiff body of its own (in as many panels round as the piece's).
  const rowsKind = rings[0].body ? mesh.kinds.get(Array.isArray(rings[0].body) ? rings[0].body[0] : rings[0].body) : null;
  const rowsStiff = rowsKind && rowsKind !== 'plate';
  const panels = Array.isArray(rings[0].body) ? rings[0].body.length : 0;
  // (Scales, `hangs`, the other way: each row's foot stands out over the heads of the row below.)
  for (let row = 0; row < rows; row += 1) {
    const body = !rowsStiff ? null : panels ? Array.from({ length: panels }, () => stiffBody(mesh, rowsKind)) : stiffBody(mesh, rowsKind);
    add(row, tile.hangs ? high : low, roleOf(row, rows), body);
    add(row + 1, tile.hangs ? low : high, roleOf(row, rows), body);
  }
  // (In the run's own order, so the faces wind outward as the piece's own loft does.)
  if (!measure.rising) shell.reverse();
  loft(mesh, shell, sides, {
    color: (ring) => ring.role, inflate, shape: (ring) => ring.out / inflate, capStart: false, capEnd: false, bones,
    uv: (ring, share) => [tile.band + share * across, ring.v], holes,
  });
}

/** Where along a measured run (a fractional ring index) it has gone `distance` (m) from its first ring. */
function placeAlong(measure, distance) {
  const { along } = measure;
  for (let index = 1; index < along.length; index += 1) {
    if (along[index] >= distance) return index - 1 + (distance - along[index - 1]) / Math.max(1e-9, along[index] - along[index - 1]);
  }
  return along.length - 1;
}

/**
 * A plate harness piece's two edges (detailmaps.js `harnessEdge`): at each end of the run a band LOFT.harnessEdge.depth (m) deep,
 * a hair proud of the plate, wearing the edge strip (the turned, roped roll at the edge, a file line, the lining rivets).
 */
function harnessEdgesOn(mesh, rings, inflate, sides, bones = () => null) {
  const spec = LOFT.harnessEdge;
  const measure = measureRings(rings, inflate);
  const depth = Math.min(spec.depth, measure.length * spec.most);
  const last = rings.length - 1;
  for (const [edgePlace, innerPlace] of [[0, placeAlong(measure, depth)], [last, placeAlong(measure, measure.length - depth)]]) {
    const edge = ringAt(rings, edgePlace);
    const inner = ringAt(rings, innerPlace);
    // (In the run's own order, so the faces wind outward as the piece's do.)
    loft(mesh, edgePlace === 0 ? [edge, inner] : [inner, edge], sides, { color: 'steel', inflate: inflate + spec.lift, capStart: false, capEnd: false, bones, uv: stripUv(edge, inner, inflate) });
  }
}

/** A lamellae paint's rows (lamellaeOn's colours): the lowest `paint.edge` if given, every fourth `steel2`. */
const lamellaRole = (paint) => (row) => (row === 0 && paint.edge ? paint.edge : (row + (paint.shade ?? 0)) % 4 === 3 ? 'steel2' : 'steel');

/**
 * Laminated plate: `paint.lames` bands along the piece, each its own ring of
 * faces standing out at one edge over the next band (so the steps catch the
 * light), a dark line along that edge, and a few rivet heads on each band.
 */
function lamesOn(mesh, rings, inflate, paint, bones) {
  const spec = LOFT.lames;
  const span = (rings.length - 1) / paint.lames;
  const turn = (step) => (step / spec.steps) * Math.PI * 2;
  const outer = mesh.body;
  for (let lame = 0; lame < paint.lames; lame += 1) {
    // (Each lame a stiff body of its own, sliding under the next.)
    mesh.body = stiffBody(mesh, 'rows');
    const from = lame * span;
    const to = Math.min(rings.length - 1, (lame + 1 + spec.overlap) * span);
    const out = (u) => inflate + spec.lift + spec.tilt * (1 - u);
    const edgeTo = from + spec.edge * span;
    for (let step = 0; step < spec.steps; step += 1) {
      const [a, b] = [turn(step), turn(step + 1)];
      addPatch(mesh, rings, [[from, a, out(0)], [from, b, out(0)], [to, b, out(1)], [to, a, out(1)]], 'steel', bones);
      addPatch(mesh, rings, [[from, a, out(0) + 0.004], [from, b, out(0) + 0.004], [edgeTo, b, out(spec.edge) + 0.004], [edgeTo, a, out(spec.edge) + 0.004]], 'steel2', bones);
    }
    const at = from + span * 0.55;
    for (let rivet = 0; rivet < spec.rivets; rivet += 1) {
      const angle = ((rivet + 0.5) / spec.rivets) * Math.PI * 2;
      const lift = out(0.55) + 0.008;
      addPatch(mesh, rings, [[at - span * 0.12, angle - spec.rivet, lift], [at - span * 0.12, angle + spec.rivet, lift], [at + span * 0.12, angle + spec.rivet, lift], [at + span * 0.12, angle - spec.rivet, lift]], 'gold', bones);
    }
  }
  mesh.body = outer;
}

/**
 * A tasset: `LOFT.tasset.lames` plates over the front and outer side of a
 * thigh (`outer` 1 for the left, -1 the right), each its own sheet and each
 * a little further out than the one above, so they read as lapped plates
 * hanging from the fauld rather than a skirt.
 */
function tassetOn(mesh, rings, outer, lames = LOFT.tasset.lames) {
  const spec = { ...LOFT.tasset, lames };
  const last = rings.length - 1;
  const centre = outer * spec.outward;
  for (let lame = 0; lame < spec.lames; lame += 1) {
    const [top, bottom] = [(last * lame) / spec.lames, Math.min(last, (last * (lame + 1.25)) / spec.lames)];
    const out = spec.inflate + spec.step * lame;
    const grid = [top, (top + bottom) / 2, bottom].map((place, row) => Array.from({ length: spec.steps + 1 }, (_, step) => {
      const angle = centre - spec.arc / 2 + (spec.arc * step) / spec.steps;
      // Each lame flares a little at its lower edge, lapping over the next.
      return [place, angle, out + 0.03 * row];
    }));
    // (Each lame a stiff plate hung on the thigh.)
    mesh.body = stiffBody(mesh, 'plate');
    addGrid(mesh, rings, grid, lame % 2 ? 'steel2' : 'steel', () => null);
    mesh.body = 0;
  }
}

/**
 * A ridged breastplate's front, drawn sharp over the plate beneath: each
 * half its own faces (shared by no vertex with the other), so the ridge
 * down the middle is a crisp edge; rivets along the neck and the hem,
 * leather straps at the shoulders, and (`lanceRest`) the arrêt on the right
 * breast. `shape` is the plate's own (the ridge, the flared hem); `range`
 * the plate's span of t.
 */
function breastplateOn(mesh, rings, inflate, shape, range, { lanceRest = false, sprays = null } = {}, bones) {
  const spec = LOFT.ridgedFront;
  const width = LOFT.ridged.width * 1.6;
  const from = placeAt(rings, range[0]);
  const to = placeAt(rings, range[1]);
  const rows = Math.max(2, Math.round((to - from) * spec.rows));
  const out = (place, angle, lift = spec.lift) => inflate * shape(ringAt(rings, place), angle) + lift;
  // Each half one smooth sheet; the two meet at the ridge without sharing it.
  for (const side of [1, -1]) {
    const grid = Array.from({ length: rows + 1 }, (_, row) => {
      const place = from + ((to - from) * row) / rows;
      return Array.from({ length: spec.steps + 1 }, (_, step) => {
        const angle = (side * width * step) / spec.steps;
        return [place, angle, out(place, angle)];
      });
    });
    addGrid(mesh, rings, grid, 'steel', bones);
  }
  const square = (place, angle, half, role, lift = spec.lift * 2) => addPatch(mesh, rings, [
    [place - half * 0.6, angle - half, out(place, angle, lift)], [place - half * 0.6, angle + half, out(place, angle, lift)],
    [place + half * 0.6, angle + half, out(place, angle, lift)], [place + half * 0.6, angle - half, out(place, angle, lift)],
  ], role, bones);
  const neck = to - 0.35;
  const hem = from + 0.35;
  for (let index = 0; index < spec.rivetsNeck; index += 1) square(neck, -width * 0.8 + (1.6 * width * index) / (spec.rivetsNeck - 1), spec.rivet, 'gold');
  for (let index = 0; index < spec.rivetsHem; index += 1) square(hem, -width + (2 * width * index) / (spec.rivetsHem - 1), spec.rivet, 'gold');
  for (const side of [1, -1]) {
    const angle = side * spec.strapAt;
    addPatch(mesh, rings, [[to - 1.2, angle - spec.strapWidth, out(to - 1.2, angle, spec.lift * 2)], [to - 1.2, angle + spec.strapWidth, out(to - 1.2, angle, spec.lift * 2)], [to, angle + spec.strapWidth, out(to, angle, spec.lift * 2)], [to, angle - spec.strapWidth, out(to, angle, spec.lift * 2)]], 'leather', bones);
    square(to - 0.9, angle, spec.rivet * 1.2, 'gold', spec.lift * 3);
  }
  // Sprays of flutes (LOFT.gothic): a few ribs a side fanning up and out from the waist.
  for (const side of sprays ? [1, -1] : []) {
    for (let flute = 1; flute <= sprays.sprays; flute += 1) {
      const pieces = 5;
      const at = (share) => [from + (to - from) * (sprays.from + (sprays.to - sprays.from) * share), side * flute * (sprays.fan[0] + (sprays.fan[1] - sprays.fan[0]) * share * share)];
      for (let piece = 0; piece < pieces; piece += 1) {
        const [[p0, a0], [p1, a1]] = [at(piece / pieces), at((piece + 1) / pieces)];
        addPatch(mesh, rings, [[p0, a0 - sprays.rib, out(p0, a0, spec.lift * 1.5)], [p0, a0 + sprays.rib, out(p0, a0, spec.lift * 1.5)], [p1, a1 + sprays.rib, out(p1, a1, spec.lift * 1.5)], [p1, a1 - sprays.rib, out(p1, a1, spec.lift * 1.5)]], 'steel2', bones);
      }
    }
  }
  if (lanceRest) {
    // The arrêt: a small bracket bolted to the right breast, its shelf standing forward for the lance to bear on (gilt on a
    // Gothic harness, as its borders are).
    const [angle, at, across, high, stand] = spec.lanceRest;
    const place = from + (to - from) * at;
    const role = sprays ? 'gold' : 'steel2';
    const corner = (up, round, lift) => [place + up * high, angle + round * across, out(place, angle, lift)];
    const face = (...corners) => addPatch(mesh, rings, corners.map((c) => corner(...c)), role, bones);
    face([-3, -1, spec.lift * 2], [-3, 1, spec.lift * 2], [3, 1, spec.lift * 2], [3, -1, spec.lift * 2]);
    face([-1, -1, spec.lift], [-1, 1, spec.lift], [-1, 1, stand], [-1, -1, stand]);
    face([1, -1, stand], [1, 1, stand], [1, 1, spec.lift], [1, -1, spec.lift]);
    face([-1, -1, stand], [-1, 1, stand], [1, 1, stand], [1, -1, stand]);
    for (const round of [-1, 1]) face([-1, round, spec.lift], [-1, round, stand], [1, round, stand], [1, round, spec.lift]);
  }
}

/**
 * Splints (`paint.splints`: shino, the long iron splints of a Japanese shin guard or sleeve, sewn to its cloth): that many narrow
 * strips down the piece over its front and sides (LOFT.splints), each its own faces a little proud of the cloth, and the cords
 * that tie the guard on round it near its head and its foot (`paint.tie`: their paint).
 */
function splintsOn(mesh, rings, inflate, paint, bones) {
  const spec = LOFT.splints;
  const last = rings.length - 1;
  const pitch = (2 * spec.over) / paint.splints;
  const half = (pitch * spec.wide) / 2;
  const out = inflate + spec.lift;
  for (let splint = 0; splint < paint.splints; splint += 1) {
    const angle = -spec.over + (splint + 0.5) * pitch;
    for (let index = 0; index < last; index += 1) addPatch(mesh, rings, [[index, angle - half, out], [index, angle + half, out], [index + 1, angle + half, out], [index + 1, angle - half, out]], 'steel', bones);
  }
  if (!paint.tie) return;
  const tied = inflate + spec.tieLift;
  for (const share of spec.ties) {
    const [from, to] = [(share - spec.tie) * last, (share + spec.tie) * last];
    for (let step = 0; step < spec.steps; step += 1) {
      const [a, b] = [(step / spec.steps) * Math.PI * 2 - Math.PI, ((step + 1) / spec.steps) * Math.PI * 2 - Math.PI];
      addPatch(mesh, rings, [[from, a, tied], [from, b, tied], [to, b, tied], [to, a, tied]], paint.tie, bones);
    }
  }
}

/**
 * A brigandine's rivets: the heads of the rivets that hold its plates inside
 * the cloth, in rows (`LOFT.studs.rowsPerRing` to a ring), `paint.studded`
 * round, each row offset half a column from the last; none on the bound
 * edges, the front opening or the splits; only `within` (rad) of the front, where given (a front panel's).
 */
function studsOn(mesh, rings, inflate, paint, bones, { within = null } = {}) {
  const spec = LOFT.studs;
  const columns = paint.studded;
  const rows = (rings.length - 1) * spec.rowsPerRing;
  const half = (Math.PI / columns) * spec.size;
  const out = inflate + spec.lift;
  for (let row = 0; row < rows; row += 1) {
    const place = (row + 0.5) / spec.rowsPerRing;
    // Clear of the hem's binding (the lowest ring's band).
    if (paint.edge && place < 0.6) continue;
    for (let column = 0; column < columns; column += 1) {
      const angle = ((column + (row % 2) * 0.5) / columns) * Math.PI * 2;
      if (within !== null && Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) > within) continue;
      if (inLamellaGap(paint, angle) || (paint.legs && fromSplit(angle) < paint.legs.split + LOFT.legs.wide * 1.5) || (paint.opening && Math.cos(angle) > 1 - paint.opening * 3) || (paint.placket && Math.abs(Math.sin(angle)) < paint.placket * 1.5 && Math.cos(angle) > 0)) continue;
      addPatch(mesh, rings, [
        [place - spec.tall, angle - half, out], [place - spec.tall, angle + half, out],
        [place + spec.tall, angle + half, out], [place + spec.tall, angle - half, out],
      ], 'gold', bones);
    }
  }
}

/**
 * A coat's apron panel hanging over its skirt (`paint.apron`: from, to along the piece, its half width round as the sine of the
 * angle): its binding (the coat's `edge`) laid round its four sides, each a strip of faces of its own over the cloth,
 * cut into short lengths so it follows the coat round.
 */
function apronOn(mesh, rings, inflate, paint, bones) {
  const [from, to, half] = paint.apron;
  const [low, high] = [placeAt(rings, from), placeAt(rings, to)];
  const across = Math.asin(half);
  const deep = 0.22;
  const wide = 0.07;
  const out = inflate + LOFT.studs.lift * 0.6;
  const role = paint.edge ?? paint.base;
  const lengths = 6;
  for (let piece = 0; piece < lengths; piece += 1) {
    const a = -across + (2 * across * piece) / lengths;
    const b = -across + (2 * across * (piece + 1)) / lengths;
    for (const [p0, p1] of [[low, low + deep], [high - deep, high]]) addPatch(mesh, rings, [[p0, a, out], [p0, b, out], [p1, b, out], [p1, a, out]], role, bones);
  }
  for (const [a, b] of [[-across, -across + wide], [across - wide, across]]) addPatch(mesh, rings, [[low, a, out], [low, b, out], [high, b, out], [high, a, out]], role, bones);
}

/** A coat's front opening bound (`paint.placket`, its half width round, rad): a strip of faces of its own, ring to ring. */
function placketOn(mesh, rings, inflate, paint, bones) {
  const half = paint.placket;
  const out = inflate + LOFT.studs.lift * 0.6;
  for (let place = 0; place < rings.length - 1; place += 1) addPatch(mesh, rings, [[place, -half, out], [place, half, out], [place + 1, half, out], [place + 1, -half, out]], paint.edge ?? paint.base, bones);
}

/** The angle (rad) from a place round a piece to the nearer of the leg panels' splits, before and behind. */
const fromSplit = (angle) => Math.min(Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))), Math.abs(Math.atan2(Math.sin(angle - Math.PI), Math.cos(angle - Math.PI))));

/** Where a loft of `sides` round cut where `within(angle)` (asked at each quad's middle) ends: the cut's half width (rad) about 0. */
function cutEdge(sides, half) {
  const step = (Math.PI * 2) / sides;
  return Math.max(0, Math.floor(half / step - 0.5) + 1) * step;
}

/**
 * A skirt split into two leg panels (`paint.legs`: `split` the half width of the splits before and behind, rad; `from` the
 * t up the piece they open below, hidden above under the coat and the apron; `front` [t of its top, half width rad] the
 * front panel over the split before): the skirt's sides round (LOFT.legs.fine as many), its `holes` (the splits cut out),
 * the splits' `edge` (rad from the front and the back, where the cut quads end).
 */
function legSplit(paint, sides) {
  const { split, from } = paint.legs;
  const fine = sides * LOFT.legs.fine;
  return { sides: fine, edge: cutEdge(fine, split), holes: (t, angle) => t < from && fromSplit(angle) < split };
}

/**
 * The leg panels' make (legSplit): the splits' edges bound in the coat's binding (`paint.edge`), and the front panel (前裆)
 * hanging from under the apron over the split before to the hem, a narrow strip of the skirt's own studded cloth standing a
 * little out from it, cut from a finer loft over the same rings (LOFT.legs.finer as many sides), bound down both its edges
 * and across its top (its hem bound as the skirt's is). `color` paints it as the skirt (without its splits); `uv` its tile.
 */
function legPanelsOn(mesh, rings, inflate, paint, bones, sides, split, color, uv = null) {
  const spec = LOFT.legs;
  const role = paint.edge ?? paint.base;
  const out = inflate + LOFT.studs.lift * 0.6;
  // A binding strip from place to place along the rings, between two angles round; a strip of the front panel's (`whole`) is
  // weighted as the panel's middle, as the panel is.
  const strip = (from, to, a, b, lift, whole = false) => {
    for (let place = from; place < to - 1e-6; place = Math.min(to, Math.floor(place) + 1)) {
      const next = Math.min(to, Math.floor(place) + 1);
      const first = mesh.positions.length / 3;
      addPatch(mesh, rings, [[place, a, lift], [place, b, lift], [next, b, lift], [next, a, lift]], role, bones);
      if (whole) [place, place, next, next].forEach((at, corner) => mesh.weightPositions.splice((first + corner) * 3, 3, ...onRing(ringAt(rings, at), 0, 1)));
    }
  };
  const opens = placeAt(rings, paint.legs.from);
  for (const centre of [0, Math.PI]) {
    strip(0, opens, centre + split.edge, centre + split.edge + spec.wide, out);
    strip(0, opens, centre - split.edge - spec.wide, centre - split.edge, out);
  }
  const [top, half] = paint.legs.front;
  const finer = sides * spec.finer;
  const edge = cutEdge(finer, half);
  const stand = inflate + spec.stand;
  // (Weighted whole as its middle, between the legs: it swings with them both and does not stretch as they part.)
  loft(mesh, rings, finer, { color, inflate: stand, capStart: false, capEnd: false, bones, holes: (t, angle) => t > top || Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle))) >= half, weighAt: () => 0, ...(uv ? { uv: uv(stand) } : {}) });
  const lift = stand + LOFT.studs.lift * 0.6;
  const high = placeAt(rings, top);
  strip(0, high, edge - spec.wide, edge, lift, true);
  strip(0, high, -edge, -edge + spec.wide, lift, true);
  strip(Math.max(0, high - spec.deep), high, -edge, edge, lift, true);
  return { edge, stand };
}

/**
 * Steel bands riveted across a skirt (`paint.bands`: how many, evenly over its lower two thirds), each a strip of faces
 * of its own over the cloth, broken at the skirt's splits and under the apron, under its rivet heads.
 */
function bandsOn(mesh, rings, inflate, paint, bones) {
  const span = rings.length - 1;
  const tall = 0.05 * span;
  const out = inflate + LOFT.studs.lift * 0.5;
  const steps = 40;
  const front = paint.apron ? paint.apron[2] : 0;
  for (let band = 0; band < paint.bands; band += 1) {
    const place = span * (0.12 + (0.5 * band) / Math.max(1, paint.bands - 1));
    // On leg panels (`legs`) the bands run across each panel to its split (the front panel hangs over them), not under the apron.
    const underApron = paint.legs ? paint.apron && place + tall > placeAt(rings, paint.apron[0]) - 0.05 : true;
    for (let step = 0; step < steps; step += 1) {
      const a = (step / steps) * Math.PI * 2;
      const b = ((step + 1) / steps) * Math.PI * 2;
      const middle = (a + b) / 2;
      if (paint.legs && fromSplit(middle) < paint.legs.split + LOFT.legs.wide) continue;
      if (inLamellaGap(paint, middle) || (underApron && Math.cos(middle) > 0 && Math.abs(Math.sin(middle)) < front)) continue;
      addPatch(mesh, rings, [[place - tall, a, out], [place - tall, b, out], [place + tall, b, out], [place + tall, a, out]], 'steel', bones);
    }
  }
}

/**
 * A strap or a cord laid over a piece: from [place along the rings, angle]
 * to another, `width` (rad round the piece), `out` times its radius.
 */
function stripOn(mesh, rings, from, to, width, out, role, bones) {
  const steps = 8;
  for (let step = 0; step < steps; step += 1) {
    const a = step / steps;
    const b = (step + 1) / steps;
    const placeA = from[0] + (to[0] - from[0]) * a;
    const placeB = from[0] + (to[0] - from[0]) * b;
    const angleA = from[1] + (to[1] - from[1]) * a;
    const angleB = from[1] + (to[1] - from[1]) * b;
    addPatch(mesh, rings, [[placeA, angleA - width / 2, out], [placeA, angleA + width / 2, out], [placeB, angleB + width / 2, out], [placeB, angleB - width / 2, out]], role, bones);
  }
}

/** Where along the rings (a place, as ringAt takes) the piece reaches t. */
function placeAt(rings, t) {
  for (let index = 0; index < rings.length - 1; index += 1) {
    const [a, b] = [rings[index].t, rings[index + 1].t];
    if ((t - a) * (t - b) <= 0) return index + (a === b ? 0 : (t - a) / (b - a));
  }
  return Math.abs(t - rings[0].t) < Math.abs(t - rings.at(-1).t) ? 0 : rings.length - 1;
}

/**
 * A device laid over a surcoat's field as its own faces, so its edges are
 * sharp (vertex colours would blur them across the cloth's triangles):
 * `pattee`, the Temple's cross pattée centred high on the breast, its four
 * arms widening to their ends. Sizes as shares of the trunk (up it) and of
 * its half-width (across it).
 */
function chargeOn(mesh, rings, kind, out, role, bones) {
  if (kind !== 'pattee') return;
  const centre = 0.65;
  const steps = 12;
  const angle = (across) => Math.asin(Math.max(-0.95, Math.min(0.95, across)));
  const patch = (corners) => addPatch(mesh, rings, corners.map(([t, across]) => [placeAt(rings, t), angle(across), out]), role, bones);
  // The upright: half as wide at the middle as at its ends (up and down the chest).
  const upright = { reach: 0.2, middle: 0.07, end: 0.17 };
  // The arms across: as long, in metres, as the upright's (a share of the half-width), as narrow and as flared.
  const beam = { reach: 0.62, middle: 0.035, end: 0.085 };
  for (const way of [1, -1]) {
    for (let step = 0; step < steps; step += 1) {
      const [a, b] = [step / steps, (step + 1) / steps];
      const wide = (u) => upright.middle + (upright.end - upright.middle) * u * u;
      const t = (u) => centre + way * upright.reach * u;
      patch([[t(a), -wide(a)], [t(a), wide(a)], [t(b), wide(b)], [t(b), -wide(b)]]);
      const high = (u) => beam.middle + (beam.end - beam.middle) * u * u;
      const across = (u) => way * beam.reach * u;
      patch([[centre - high(a), across(a)], [centre + high(a), across(a)], [centre + high(b), across(b)], [centre - high(b), across(b)]]);
    }
  }
}

/**
 * A field halved per pale, sharp down the middle: the second colour laid over
 * the right half (`across` below 0) as its own faces, a hair out from the cloth.
 */
function paleOn(mesh, rings, out, role, bones) {
  // Fine enough round that its flat faces do not sink into the curved cloth beneath.
  const steps = 24;
  for (let index = 0; index < rings.length - 1; index += 1) {
    for (let step = 0; step < steps; step += 1) {
      const [a, b] = [-Math.PI + (Math.PI * step) / steps, -Math.PI + (Math.PI * (step + 1)) / steps];
      addPatch(mesh, rings, [[index, a, out], [index, b, out], [index + 1, b, out], [index + 1, a, out]], role, bones);
    }
  }
}

/**
 * Plaques round a belt (the Ayyubid emir's mintaqa): `count` small square
 * plates, each its own faces a hair out from the leather, so they read sharp.
 */
function plaquesOn(mesh, rings, out, count, role, bones) {
  const half = (Math.PI / count) * 0.5;
  const [low, high] = [0.15 * (rings.length - 1), 0.85 * (rings.length - 1)];
  for (let plaque = 0; plaque < count; plaque += 1) {
    const angle = (plaque / count) * Math.PI * 2;
    addPatch(mesh, rings, [[low, angle - half, out], [low, angle + half, out], [high, angle + half, out], [high, angle - half, out]], role, bones);
  }
}

/** A surcoat's field: plain, per pale, quarterly, a cross, a chevron, or a chief. */
function heraldry(kind, t, across, ahead) {
  switch (kind) {
    case 'pale': return across > 0 ? 'cloth' : 'cloth2';
    case 'quarterly': return (across > 0) !== (t > 0.45) ? 'cloth' : 'cloth2';
    case 'cross': return ahead > 0 && (Math.abs(across) < 0.16 || Math.abs(t - 0.62) < 0.06) ? 'cloth2' : 'cloth';
    case 'chevron': return ahead > 0 && Math.abs(t - (0.35 + Math.abs(across) * 0.5)) < 0.07 ? 'cloth2' : 'cloth';
    case 'chief': return t > 0.74 ? 'cloth2' : 'cloth';
    default: return 'cloth';
  }
}

/** Split every triangle's corners apart so each face shades flat. */
function facet(positions, indices, colors, bones, weightPositions, stiff) {
  const flatPositions = [];
  const flatIndices = [];
  const flatColors = [];
  const flatBones = [];
  const flatStiff = [];
  const flatWeights = [];
  for (let face = 0; face < indices.length; face += 1) {
    const i = indices[face];
    flatPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    flatColors.push(colors[i]);
    flatBones.push(bones[i]);
    flatStiff.push(stiff[i]);
    flatWeights.push(weightPositions[i * 3], weightPositions[i * 3 + 1], weightPositions[i * 3 + 2]);
    flatIndices.push(face);
  }
  return { positions: flatPositions, indices: flatIndices, colors: flatColors, bones: flatBones, weightPositions: flatWeights, stiff: flatStiff };
}

/**
 * `sculpt`: the skin's rings bent by anatomy (sculpt.js: collarbones, ribs,
 * abs, pecs, belly, joint knobs...) on more, finer rings; clothes follow the
 * broad forms (`bend`) and armour is built as before. Never in a crowd.
 */
/** Drive a builder's slices (a generator) to its end now: its result. */
export function runSteps(steps) {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}

// ---- The base mesh's skin (body style 'base', basebody.js) ------------------------------------------------------------------

/**
 * A part's depth, width and centre offset along it, read from its own ring maker (`ringAt(t)`: one ring at t, as `along` makes
 * it), lazily: the ring makers are built in the order the loft needs them, and read only once the rings are all known.
 */
function ringProfiles(ringAt, a, b, forward) {
  const axis = vec.normalize(vec.sub(b, a));
  const length = vec.length(vec.sub(b, a));
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  return {
    depth: (t) => ringAt(t).depth,
    width: (t) => ringAt(t).width,
    offset: (t) => vec.dot(vec.sub(ringAt(t).center, vec.add(a, vec.scale(axis, t * length))), depthAxis),
  };
}

// The base mesh measured against its reference body's rings, once per sex and detail (basebody.js measureBaseBody).
const BASE_RIGS = new Map();
/** The options a base skin is built with (and measured with: the trunk's profiles depend on them): a fighter's, or a crowd's. */
export const baseLoftOptions = (crowd) => (crowd ? { lowDetail: true } : { sculpt: 'rules', rules: { share: 0, density: 'medium' }, hideCovered: true });
export function baseRigOf(sex, crowd) {
  const key = `${sex}|${crowd}|${Boolean(BASE_BODY.shoulder?.startsWith('D'))}`;
  if (!BASE_RIGS.has(key)) {
    const mesh = baseBodyMesh(sex, crowd);
    const reference = buildBody(mesh.reference);
    const { baseParts } = buildLoftBody(reference, { ...baseLoftOptions(crowd), base: { measure: true } });
    BASE_RIGS.set(key, { ...measureBaseBody(mesh, baseParts, reference.heightM, jointsByName(bindPoints(reference))), refTraits: sculptTraits(reference), refRules: rulesTraits(reference), sex });
  }
  return BASE_RIGS.get(key);
}

/** Bind-pose points (rig.js bindPoints, indexed by body.js P) by name. */
const jointsByName = (points) => Object.fromEntries(Object.entries(P).map(([name, index]) => [name, points[index]]));

// How much of a muscle's edges show through a fat layer (m): all under SCULPT.definedTo, none over definedFrom.
const definedBy = (fat) => {
  const t = Math.min(1, Math.max(0, (fat - SCULPT.definedFrom) / (SCULPT.definedTo - SCULPT.definedFrom)));
  return t * t * (3 - 2 * t);
};
// Each skin part's fat, by its sculpt.js trait.
const BASE_TRAIT = { trunk: 'trunk', neck: 'trunk', Upper: 'arm', Fore: 'fore', Thigh: 'thigh', Shin: 'shank' };

/**
 * The base mesh placed on this body's parts (`parts`, gathered by the loft) and added to the mesh as its skin: each drawn point
 * with its part's bones (the trunk's own lists), its place along and round the part (coverage reads it), its tile coordinates
 * (`uv`: the textured styles'); `height` his standing height (m); `starve` how starved he is (basebody.js baseStarvation); the
 * joints it is placed on and each forearm's reach to the hand (basebody.js baseBindJoints). The muscle relief the mesh was
 * modelled with shows by how defined each part is against the reference's (fat smooths it: basebody.js BASE_BODY smooth*); never more than modelled.
 */
/**
 * How wasted a body is, 0 to 1, for its shoulders (basebody.js shoulderPlus): by its BMI, none at LOFT.wasting.from (an
 * average build's 22), all at `to` (a starved one's 14), a thin build's 18 half-way; and never less than its starvation
 * (baseStarvation, the face's gaunt weight).
 */
export function baseWasting(body) {
  const { from, to } = LOFT.wasting;
  const bmi = body.massKg / (body.heightM * body.heightM);
  return Math.max(baseStarvation(body), Math.min(1, Math.max(0, (from - bmi) / (from - to))));
}

/**
 * The body's own neck girth (m round its middle), from its BMI and its training (LOFT.neck): the line through the published
 * means (a man's about 38 cm and a woman's about 33 at a normal BMI, 37 and 34 the cut-offs for overweight: Ben-Noun, Sohar
 * and Laor 2001, Obesity Research 9:470), half a centimetre a unit of BMI, and a trained man's neck muscle on top; under an
 * ordinary BMI the steeper line to the emaciated build's neck (`lean`).
 */
export function baseNeckGirth(body) {
  const spec = LOFT.neck[body.inputs.sex === 'female' ? 'female' : 'male'];
  const bmi = body.massKg / (body.heightM * body.heightM);
  return LOFT.neck.slim * (spec.at22 + (bmi < 22 ? spec.lean : spec.perBmi) * (bmi - 22) + spec.trained * (body.inputs.exercise ?? 0)) * (body.heightM / spec.height);
}

/**
 * How broad a body's skeleton is drawn against the builds' own (LOFT.frame), and what that makes of its mass. `across`: its
 * frame's width, and under the ordinary build its weight's part (the body's BMI over that build's own, both at the model's
 * height `modelHeight`, to the power `weight`): what the trunk's breadths and the limbs' sections are drawn by (basebody.js
 * baseFamily). `apart`: the same over the width the rig's shoulders and hips are set apart by already (body.js FRAMES): what
 * the skin's joints move by from the rig's (baseBindJoints). `section`: the volume a build holds drawn that broad, over its
 * own: a body is looked up among the builds at its mass indices over it (baseFamilyWeights), so the same weight on a broad
 * frame is a leaner build drawn wider, and still weighs what the body weighs.
 */
export function baseFrame(body, modelHeight) {
  const { frame, family } = LOFT;
  const ordinary = family[body.inputs.sex === 'female' ? 'female' : 'male'].N;
  const bmi = (body.massKg / (body.heightM * body.heightM)) * (modelHeight / body.heightM);
  const across = (frame.widths[body.inputs.frame] ?? 1) * Math.min(1, bmi / (ordinary[0] + ordinary[1])) ** frame.weight;
  return { across, apart: across / (FRAMES[body.inputs.frame] ?? FRAMES.medium).width, section: across ** frame.section };
}

/**
 * The family of builds' weights for a body (basebody.js baseFamily: one a build, in BASE_BODY.family.builds' order, summing to
 * one), by where its fat and its lean mass put it among them (LOFT.family), so the blend weighs what the body weighs. The
 * emaciated, the ordinary and the fat builds lie along one line in that plane, how well fed a body is (each step its own mix
 * of fat and the lean that comes and goes with it); the muscular build stands off it, across. So a body is the point of that
 * line it is level with, between two of its builds, and the muscular build's gain over the ordinary one, by as much as its
 * lean mass is over the line's there (or under: a little of that gain taken off; towards the emaciated build, which has none
 * to take off, the lean it lacks is wasting further along the line instead). One rule for every body, with no step
 * anywhere. `modelHeight` the model's standing height (m): a shape's mass goes by the cube of its height, so its mass indices
 * by the height itself, and a body is looked up at the model's; and at what it weighs a unit of its frame's section
 * (baseFrame), the builds being drawn as broad as its frame after.
 */
export function baseFamilyWeights(body, modelHeight) {
  const spec = LOFT.family;
  const at = spec[body.inputs.sex === 'female' ? 'female' : 'male'];
  const scale = modelHeight / body.heightM / baseFrame(body, modelHeight).section;
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const point = [(body.fatKg / (body.heightM * body.heightM)) * scale, body.ffmi * scale];
  const muscular = sub(at.M, at.N);
  const line = ['E', 'N', 'F1', 'F2', 'F3'];
  // (Each step of the line: the point as `along` of the step and `muscle` of the muscular gain; the step it falls within, the
  // first reaching on past its end, to `wasteMost`, and the last giving way to `past` of the fattest build.)
  let [from, to, along, muscle, past, least] = ['N', 'F1', 0, 0, 0, spec.muscleLeast];
  for (let step = 0; step + 1 < line.length; step += 1) {
    const start = at[line[step]];
    const run = sub(at[line[step + 1]], start);
    const off = sub(point, start);
    const det = run[0] * muscular[1] - run[1] * muscular[0];
    const u = (off[0] * muscular[1] - off[1] * muscular[0]) / det;
    if (u < 0 && step > 0) break;
    [from, to, muscle] = [line[step], line[step + 1], (run[0] * off[1] - run[1] * off[0]) / det];
    least = spec.muscleLeast;
    along = step + 2 === line.length ? Math.min(1, u) : u;
    if (step === 0) {
      // (The emaciated build has no muscle left to take off: the least fades to nothing at it, and the lean a body lacks
      // under that is taken as wasting along the line instead, mass for mass, as fully as the least has faded.)
      const fed = Math.min(1, Math.max(0, u));
      least *= fed;
      const under = Math.min(0, muscle + least);
      along = Math.max(1 - spec.wasteMost, u + ((1 - fed) * under * (muscular[0] + muscular[1])) / (run[0] + run[1]));
    }
    if (step + 2 === line.length && u > 1) {
      // (The volume of the line's point there over F3's, and the share of F4 that holds it: the cube rises all the way.)
      const volume = ([fat, lean]) => ((fat + lean - spec.rest) / (modelHeight * (fat + lean))) * (fat / spec.density.fat + lean / spec.density.lean);
      const more = volume([start[0] + u * run[0], start[1] + u * run[1]]) - volume(at[line[step + 1]]);
      const terms = spec.swell[body.inputs.sex === 'female' ? 'female' : 'male'];
      let low = 0;
      past = 1;
      for (let pass = 0; pass < 24; pass += 1) {
        const share = (low + past) / 2;
        if (share * (terms[0] + share * (terms[1] + share * terms[2])) < more) low = share;
        else past = share;
      }
    }
    if (u <= 1) break;
  }
  muscle = Math.min(spec.muscleMost, Math.max(-least, muscle));
  const weights = Object.fromEntries(BASE_BODY.family.builds.map((name) => [name, 0]));
  weights[from] += 1 - along;
  weights[to] += along - past;
  weights.F4 += past;
  weights.M += muscle;
  weights.N -= muscle;
  return BASE_BODY.family.builds.map((name) => weights[name]);
}

/**
 * How much of the emaciated build's bone relief (its ribs, spine, collarbones and hip bones: basebody.js baseStarvedDetail)
 * shows on a body, 1 to 0: through what the body has over those bones that the emaciated build has not, its fat and its
 * muscle by its mass indices (LOFT.boneCover). A soft layer `d` thick over a relief that repeats every `L` shows it at its own
 * surface by exp(−2π d / L): a disturbance of that wavelength dies away so with distance from where it is made (Laplace's
 * equation in the layer), which is why a rib cage is gone under a centimetre and a half of cover while the cage's own broad
 * shape is not. `modelHeight` as in baseFamilyWeights, and the indices over the body's frame as there: on a narrower skeleton
 * the same mass lies thicker.
 */
export function baseBoneRelief(body, modelHeight) {
  const cover = LOFT.boneCover;
  const emaciated = cover.sculpt[body.inputs.sex === 'female' ? 'female' : 'male'];
  const scale = modelHeight / body.heightM / baseFrame(body, modelHeight).section;
  const fat = (body.fatKg / (body.heightM * body.heightM)) * scale - emaciated[0];
  const lean = body.ffmi * scale - emaciated[1];
  const over = Math.max(0, cover.fat * fat + cover.lean * lean);
  return Math.exp((-2 * Math.PI * over) / cover.spacing);
}

function addBaseSkin(mesh, rig, parts, traits, uv, height, starve, { skin, reach }, rules = null, waste = 0, neckGirth = 0, family = null, across = 1) {
  const relief = (name) => {
    const key = BASE_TRAIT[name] ?? BASE_TRAIT[name.slice(1)];
    const modelled = definedBy(rig.refTraits[key].fat);
    return modelled <= 0 ? 1 : Math.min(1, definedBy(traits[key].fat) / modelled);
  };
  // (PROOF OF CONCEPT, BASE_BODY.shoulder 'E': the share of the model's shoulder bulk this body keeps, its arm's muscle showing
  // as baseArmForms reads it: development × leanness × definition through the fat.)
  const shoulderKeep = rules ? Math.min(1, rules.dev * rules.traits.arm.lean * Math.min(1, Math.max(0, (0.016 - rules.traits.arm.fat) / 0.011))) : 0;
  const { positions, herShare } = placeBaseBody(rig, parts, relief, height, starve, skin, reach, rules ? baseArmForms(rules, rig.refRules, LOFT.armForms.carried[rig.sex]) : null, shoulderKeep, waste, neckGirth, family, across);
  const uvs = uv ? baseBodyUvs(rig) : null;
  const start = mesh.positions.length / 3;
  const { render } = rig;
  for (let index = 0; index < render.count; index += 1) {
    const name = rig.names[render.part[index]];
    const point = [positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]];
    mesh.positions.push(...point);
    mesh.weightPositions.push(...point);
    mesh.colors.push('skin');
    mesh.bones.push(parts[name].bones ? parts[name].bones(render.t[index], Math.cos(render.angle[index])) : null);
    mesh.stiff.push(0);
    mesh.ringT[start + index] = render.t[index];
    mesh.ringA[start + index] = render.angle[index];
    if (uvs) mesh.uvs.set(start + index, [uvs[index * 2], uvs[index * 2 + 1]]);
  }
  // (Every copy of one point, drawn in two tiles or either side of a seam, takes the bones of the copy in its own part's tile:
  // given each tile's part's bones, a copy in an arm's tile was free to take the arm and its twin in the trunk's held to the
  // trunk's, and the two came apart in a crack once the arm moved.)
  const ownBones = new Map();
  for (let index = 0; index < render.count; index += 1) {
    const source = render.source[index];
    if (render.part[index] === rig.sources.part[source] || !ownBones.has(source)) ownBones.set(source, mesh.bones[start + index]);
  }
  for (let index = 0; index < render.count; index += 1) mesh.bones[start + index] = ownBones.get(render.source[index]);
  // (Each drawn point's bone-heat weights, by its source: the model's own skinning, baseHeatWeights.)
  mesh.heat = new Map();
  for (let index = 0; index < render.count; index += 1) {
    const heat = rig.sources.heat?.[render.source[index]];
    if (heat) mesh.heat.set(start + index, heat);
  }
  const firstIndex = mesh.indices.length;
  for (const index of rig.triangles) mesh.indices.push(start + index);
  for (const [name, [from, to]] of Object.entries(rig.ranges)) mesh.parts[name] = [start + from, start + to];
  // (`own`: the points wholly on their part, not blending into a neighbour across a joint: what the clothes are fitted to.)
  const own = Uint8Array.from(render.source, (source) => (rig.sources.part2[source] === rig.sources.part[source] || rig.sources.blend[source] < LOFT.fit.ownBlend ? 1 : 0));
  // (`swell`: how far the belly's dome stands each point out, m: a waistband sits under its overhang, fitClothToBase. None on a
  // body mixed of the family's builds: its belly is in the builds' own points, not a dome added to them.)
  const swell = Float32Array.from(render.part, (part, index) => (!family && rig.names[part] === 'trunk' && parts.trunk.swell ? parts.trunk.swell(render.t[index], render.angle[index])[0] : 0));
  // (`armSkin`: points that are an arm's or blend into one, across the armpit: keepLayersInside.)
  const armPart = (index) => /Upper$|Fore$/.test(rig.names[index]);
  const armSkin = Uint8Array.from(render.source, (source) => (armPart(rig.sources.part[source]) || (rig.sources.blend[source] > 0 && armPart(rig.sources.part2[source])) ? 1 : 0));
  mesh.base = { start, count: render.count, source: render.source, sources: rig.sources.count, own, swell, family: Boolean(family), armSkin, herShare, triangles: [firstIndex, mesh.indices.length] };
}

/**
 * The arm's forms at the mesh's own scale (LOFT.armForms; 2026-11-11: arms of bone and muscle hinged at
 * joints, not a rubber tube), placed as the skin rules place them (skinrules.js limbRule) but a centimetre high, not a map's
 * few millimetres: on the upper arm the deltoid's cap and the groove where it tucks into the arm, the biceps in front, the
 * triceps behind and the groove between them at the sides, the elbow's point behind and its crease in front; on the forearm
 * the swell of the brachioradialis and the flexors below the elbow, the elbow's point on its back, and the wrist slimmed.
 * The muscles' forms stand by how much muscle shows (the rules' development × the part's leanness × how defined it is through
 * its fat), the joints' by how bony the part is (fat buries them); each less what the model already carries of it at its
 * reference build (`carried` of the reference's: the male model is modelled lean and defined, the female smooth: tools/
 * basebody-pack.js REFERENCE_BUILD), so the reference gets the model as made. `rules`, `refRules` rulesTraits; the answer
 * (part name, t, angle) => metres out along the point's line from its part's axis.
 */
function baseArmForms(rules, refRules, carried) {
  const spec = LOFT.armForms;
  const JOINT_SPAN = spec.jointSpan;
  const smooth = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const hump = (x, centre, width) => Math.max(0, 1 - ((x - centre) / width) ** 2) ** 2;
  const shows = (R, key) => {
    const part = R.traits[key];
    return { muscle: R.dev * part.lean * smooth(0.016, 0.005, part.fat), bony: part.bony };
  };
  const own = { upper: shows(rules, 'arm'), fore: shows(rules, 'fore') };
  const ref = { upper: shows(refRules, 'arm'), fore: shows(refRules, 'fore') };
  const muscle = (kind) => spec.muscle * (own[kind].muscle - carried.muscle * ref[kind].muscle);
  const bony = (kind) => spec.joint * (own[kind].bony - carried.joint * ref[kind].bony);
  const kinds = { lUpper: ['upper', 1], rUpper: ['upper', -1], lFore: ['fore', 1], rFore: ['fore', -1] };
  return (name, t, angle) => {
    const kind = kinds[name];
    if (!kind) return 0;
    const [part, outerSign] = kind;
    const fa = Math.abs(angle);
    const outer = Math.sin(angle) * outerSign;
    const m = muscle(part);
    const j = bony(part);
    if (part === 'upper') {
      const deltoid = 0.8 * hump(t, 0.12, 0.2) * (0.4 + 0.6 * smooth(-0.3, 0.6, outer));
      const tuck = -0.4 * hump(t, 0.42 - 0.12 * Math.abs(Math.cos(angle)), 0.06) * smooth(-0.6, 0.2, outer);
      const biceps = 0.7 * hump(fa, 0, 0.9) * hump(t, 0.6, 0.25);
      const triceps = 0.6 * hump(Math.PI - fa, 0, 1.0) * hump(t, 0.48, 0.28);
      const groove = -0.3 * hump(fa, Math.PI / 2, 0.3) * smooth(0.3, 0.4, t) * (1 - smooth(0.8, 0.9, t));
      // (The joint's forms span LOFT.armForms.jointSpan of the part either way, about 4 cm: the olecranon with the triceps' tendon
      // running into it, the crease's fold. Narrower, they fell between the mesh's rings, 1.5 cm apart on the arm, and printed
      // nothing.)
      const point = 0.4 * hump(t, 0.95, JOINT_SPAN) * hump(Math.PI - fa, 0, 0.8);
      const crease = -hump(t, 0.97, 0.6 * JOINT_SPAN) * hump(fa, 0, 0.7);
      return m * (deltoid + tuck + biceps + triceps + groove) + j * (point + crease);
    }
    const swell = 0.6 * hump(t, 0.22, 0.2) * (hump(angle * outerSign, 0.7, 0.9) + 0.7 * hump(angle * outerSign, -0.8, 0.9));
    // (The olecranon is the ulna's, and turns with the forearm: most of the point stands on the forearm's side of the joint,
    // where its skin follows the forearm's bone. Laid on the upper arm's side, the joint's blended skin rounded it into the
    // bend's arc and the bent elbow showed none.)
    const point = 1.3 * hump(t, 0, JOINT_SPAN) * hump(Math.PI - fa, 0, 0.8);
    const wrist = -0.8 * smooth(0.65, 0.95, t);
    return m * swell + j * (point + wrist);
  };
}

/**
 * The base mesh's belly (LOFT.bellyBall), for a fat layer `belly` m past LOFT.bellyFrom on a trunk `length` m long, or null: its
 * middle and reach up the trunk, its depth and its foot's hang (m), and `swell(t, angle) => [out, down]` (m) at a point of the
 * trunk: a dome (1 - r²)² over the ellipse round its middle, so its slope is flat at its edge (no ledge at the flanks), its foot
 * hanging down over the groin by the same dome below the middle.
 */
function baseBelly(belly, length) {
  if (belly <= 0) return null;
  const spec = LOFT.bellyBall;
  const depth = belly * LOFT.bellyScale;
  const drop = belly * LOFT.bellyDrop;
  const centre = spec.centre - (drop / length) * spec.dropShare;
  return {
    centre, depth, drop, tall: spec.tall,
    swell: (t, angle) => {
      const round = Math.atan2(Math.sin(angle), Math.cos(angle));
      const r2 = ((t - centre) / spec.tall) ** 2 + (round / spec.wide) ** 2;
      if (r2 >= 1) return [0, 0];
      const dome = (1 - r2) ** 2;
      const below = Math.min(1, Math.max(0, (centre - t) / spec.tall));
      return [depth * dome, drop * dome * below * below * (3 - 2 * below)];
    },
  };
}

/**
 * The fat masses of a base skin (fatslosh.js): the belly (where there is one), the breasts and the buttocks, each placed on the
 * trunk's rings (`trunk`, the loft's description of it) at its landmark (sculpt.js SCULPT_TRUNK), each point's weight in each
 * (sloshWeights: most at the mass's free front and foot). `figures` its springs' (sloshFigures).
 */
function baseSlosh(figures, positions, rigid, trunk, belly, trunkShare, skin) {
  // (`skin`: the whole base skin before any of it was left out under clothes, { positions, regions }, where the masses' places are
  // measured: a breast under a top is left out of the drawn mesh.)
  const spec = LOFT.slosh;
  const axis = vec.normalize(vec.sub(trunk.b, trunk.a));
  const length = vec.length(vec.sub(trunk.b, trunk.a));
  const out = vec.normalize(vec.sub(trunk.forward, vec.scale(axis, vec.dot(trunk.forward, axis))));
  const side = vec.cross(axis, out);
  const centreAt = (u) => vec.add(vec.add(trunk.a, vec.scale(axis, u * length)), vec.scale(out, trunk.offset(u)));
  // Freer at the front (out) and the foot (down): a mass hangs from its root at the back and top.
  const hang = (local) => Math.min(1, Math.max(0, 0.5 + 0.5 * local[2])) * Math.min(1, Math.max(0, 0.6 - 0.4 * local[1]));
  const masses = [];
  if (belly) {
    const u = belly.centre;
    masses.push({ name: 'belly', bones: SLOSH_BONES.belly, centre: vec.add(centreAt(u), vec.scale(out, trunk.depth(u) * 0.5)), axes: [side, axis, out], radii: [trunk.width(u) * spec.bellyAcross, belly.tall * length, trunk.depth(u) * spec.bellyOut + belly.depth], hang });
  }
  const ball = (name, u, angle) => {
    const ring = { depth: trunk.depth(u), width: trunk.width(u) };
    const onRing = vec.add(centreAt(u), vec.add(vec.scale(out, Math.cos(angle) * ring.depth), vec.scale(side, Math.sin(angle) * ring.width)));
    const facing = vec.normalize(vec.sub(onRing, centreAt(u)));
    // (Centred on the skin itself, the outermost skin point along its line out within `ballOn` of its radius beside it: the base
    // mesh stands out of the ring by some centimetres on a fat chest, and a ball centred on the ring lay that far inside the flesh,
    // its weights falling away from a point the skin never reaches.)
    let reach = 0;
    const beside = ring.width * spec.ballShare * spec.ballOn;
    for (let vertex = 0; vertex < skin.positions.length / 3; vertex += 1) {
      if (skin.regions[vertex] !== 'skin') continue;
      const rel = vec.sub([skin.positions[vertex * 3], skin.positions[vertex * 3 + 1], skin.positions[vertex * 3 + 2]], onRing);
      const along = vec.dot(rel, facing);
      if (along > reach && vec.length(vec.sub(rel, vec.scale(facing, along))) < beside) reach = along;
    }
    const surface = vec.add(onRing, vec.scale(facing, reach));
    const across = vec.normalize(vec.cross(axis, facing));
    // (It swings no further than `ballSwing` of how far its foremost skin stands out before the trunk's midline at its height
    // (within `midlineBand` of it, m), the breast past the sternum, the buttock behind the spine: a man's flat chest barely
    // moves, a heavy breast its full swing; a very obese man's chest swung 2 cm and stood out from it as a point while it settled.)
    const toward = vec.scale(out, Math.cos(angle) >= 0 ? 1 : -1);
    const radius = ring.width * spec.ballShare;
    let midline = 0;
    let front = 0;
    for (let vertex = 0; vertex < skin.positions.length / 3; vertex += 1) {
      if (skin.regions[vertex] !== 'skin') continue;
      const p = [skin.positions[vertex * 3], skin.positions[vertex * 3 + 1], skin.positions[vertex * 3 + 2]];
      const rel = vec.sub(p, centreAt(u));
      const along = vec.dot(rel, toward);
      if (vec.length(vec.sub(p, surface)) < radius) front = Math.max(front, along);
      if (Math.abs(vec.dot(rel, side)) < spec.midlineBand && Math.abs(vec.dot(rel, axis)) < radius) midline = Math.max(midline, along);
    }
    const stands = Math.max(0, front - midline);
    masses.push({ name, bones: SLOSH_BONES[name], centre: surface, axes: [across, axis, facing], radii: [radius, radius, radius], hang, limit: stands * spec.ballSwing });
  };
  for (const sign of [1, -1]) {
    ball('breast', SCULPT_TRUNK.chest.at, sign * SCULPT_TRUNK.chest.angle);
    ball('buttock', SCULPT_TRUNK.glute.at, sign * SCULPT_TRUNK.glute.angle);
  }
  const weights = sloshWeights(positions, masses, rigid, trunkShare);
  return { figures, masses: masses.map(({ hang: _, ...mass }, index) => ({ ...mass, weights: weights[index] })) };
}

/**
 * Each point's bone-heat weights (an array by vertex: a Map of BASE_BODY_DATA.heatBones index to weight, or null): the base
 * skin's own, and every worn point's (the clothes and armour lofted over it) those of the skin point nearest the place it is
 * weighted at (its weight position: the body's surface beneath it), within `LOFT.heat.reach` (m), so the cloth turns as the skin
 * under it does.
 */
function clothHeat(mesh) {
  const count = mesh.positions.length / 3;
  const out = new Array(count).fill(null);
  const size = LOFT.heat.reach;
  const cells = new Map();
  const keyOf = (p) => p.map((value) => Math.floor(value / size)).join('|');
  // (Each skin point's part, from the skin's ranges: a worn point looks only at the skin of its own part, LOFT.heat.bones.)
  const skinPart = (vertex) => {
    for (const [name, [from, to]] of Object.entries(mesh.parts)) if (vertex >= from && vertex < to) return name;
    return null;
  };
  for (const [vertex, weights] of mesh.heat) {
    out[vertex] = weights;
    const p = [mesh.weightPositions[vertex * 3], mesh.weightPositions[vertex * 3 + 1], mesh.weightPositions[vertex * 3 + 2]];
    const key = keyOf(p);
    (cells.get(key) ?? cells.set(key, []).get(key)).push([p, weights, skinPart(vertex)]);
  }
  const names = baseHeatBones();
  // (Only the bones its part may move: a waistband or a shirt's side whose nearest skin was a hanging forearm's took the hand's
  // weight and was dragged out to the wrist in a strip. The trunk's the thighs' too: under a fat belly the waist's front drops
  // to the groin (tiltWaist), whose skin turns with the thigh; a waistband held to the trunk alone stayed as the skin and the
  // shorts' legs rose through it in a crouch, in shards.)
  const ownOnly = (weights, part) => {
    const allowed = LOFT.heat.bones[part.replace(/^[lr]/, '*')]?.map((bone) => bone.replace('*', part[0])) ?? null;
    if (!allowed) return weights;
    const kept = new Map([...weights].filter(([bone]) => allowed.includes(names[bone])));
    const total = [...kept.values()].reduce((sum, w) => sum + w, 0);
    if (total <= 0) return new Map([[names.indexOf(allowed[0]), 1]]);
    for (const [bone, w] of kept) kept.set(bone, w / total);
    return kept;
  };
  for (let vertex = 0; vertex < count; vertex += 1) {
    // (Not a worn point with bones of its own, a skirt hung from the pelvis and both thighs, a breastplate on the chest alone:
    // those keep their own, or a coat's skirt swung out with one leg like a flared dress. But the cloth lying on the skin
    // itself, fitClothToBase's `onSkin`, goes with the skin.)
    if (out[vertex] || mesh.heat.has(vertex) || (mesh.bones[vertex] && !mesh.onSkin?.has(vertex))) continue;
    const p = [mesh.weightPositions[vertex * 3], mesh.weightPositions[vertex * 3 + 1], mesh.weightPositions[vertex * 3 + 2]];
    const c = p.map((value) => Math.floor(value / size));
    const part = mesh.wornPart?.get(vertex) ?? null;
    let best = Infinity;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      for (const [q, weights, onPart] of cells.get(`${c[0] + dx}|${c[1] + dy}|${c[2] + dz}`) ?? []) {
        // (The cloth lying on the skin takes the skin's it lies on, whatever its part: a fat hip is the trunk's skin to well
        // below the joint, and the top of the trunks' leg, looking for the thigh's own, found none in reach and took the
        // nearest bone's weight, a forearm hanging by the hip, standing out from the hips in two blades.)
        if (part && onPart !== part && !mesh.onSkin?.has(vertex)) continue;
        const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d < best) {
          best = d;
          out[vertex] = weights;
        }
      }
    }
    if (part && out[vertex]) out[vertex] = ownOnly(out[vertex], part);
  }
  return out;
}

/**
 * The base mesh skinned with the model's own weights: Blender's bone heat on the model's skeleton (tools/blender/baseweights.py;
 * 2026-11-11: arms that read as hinged at real joints, not a rubber tube). Weighted by distance to the bones
 * (to their sixth power) each point went to its nearest bone within a centimetre or two, so a raised arm creased the chest
 * and the shoulder bent as a tube; bone heat spreads each bone's share over the surface by diffusion. Each bone of Blender's
 * skeleton is the game's of that name, but its one trunk bone, whose share is parted among the game's pelvis, spine and chest
 * by their distance weights at the point. `heat` the points' weights (clothHeat), `rigid` the points held by the chest alone (a
 * breastplate), which keep theirs. The answer is written into `weights` ({ skinIndex, skinWeight }).
 */
function baseHeatWeights(weights, heat, positions, frames, rigid) {
  const names = baseHeatBones();
  const trunkBones = [BONE.pelvis, BONE.spine, BONE.chest];
  const picked = [];
  heat.forEach((weightsOf, vertex) => {
    if (weightsOf && !rigid[vertex]) picked.push(vertex);
  });
  const subset = Float32Array.from(picked.flatMap((vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]]));
  const trunk = skinWeights(subset, frames, picked.map(() => trunkBones));
  picked.forEach((vertex, index) => {
    const mix = new Map();
    for (const [bone, w] of heat[vertex]) {
      const name = names[bone];
      if (name === 'trunk') {
        for (let slot = 0; slot < 4; slot += 1) {
          const share = trunk.skinWeight[index * 4 + slot];
          if (share > 0) mix.set(trunk.skinIndex[index * 4 + slot], (mix.get(trunk.skinIndex[index * 4 + slot]) ?? 0) + w * share);
        }
      } else mix.set(BONE[name], (mix.get(BONE[name]) ?? 0) + w);
    }
    // (The armpit: LOFT.armpit. The arm's share against all the rest's, so a point with next to none of the arm keeps what it
    // had: with every weight raised to the power wherever the arm had any share at all, of two neighbours on the lower ribs the
    // one with a hundredth of the arm went from 0.56 to 0.93 of the spine and the other stayed, and a turned trunk drew a
    // starved man's ribs in waves.)
    const sharp = armpitSharpness([positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]], frames);
    if (sharp > 0) {
      const ofArm = (bone) => ARMPIT_ARM.has(bone);
      let arm = 0;
      let total = 0;
      for (const [bone, w] of mix) {
        total += w;
        if (ofArm(bone)) arm += w;
      }
      const share = total > 0 ? arm / total : 0;
      if (share > 0 && share < 1) {
        const power = 1 + LOFT.armpit.sharpen * sharp;
        const sharpened = share ** power / (share ** power + (1 - share) ** power);
        for (const [bone, w] of mix) mix.set(bone, w * (ofArm(bone) ? sharpened / share : (1 - sharpened) / (1 - share)));
      }
    }
    const best = [...mix].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = best.reduce((sum, [, w]) => sum + w, 0) || 1;
    for (let slot = 0; slot < 4; slot += 1) {
      weights.skinIndex[vertex * 4 + slot] = best[slot]?.[0] ?? 0;
      weights.skinWeight[vertex * 4 + slot] = best[slot] ? best[slot][1] / total : 0;
    }
  });
}

/** The arm's bones, whose share of a point LOFT.armpit sets against the rest's. */
const ARMPIT_ARM = new Set([BONE.lUpperArm, BONE.lForearm, BONE.rUpperArm, BONE.rForearm]);

/** How much of LOFT.armpit's narrowing a point at `point` (bind pose) gets, 0 to 1: the nearer upper arm's armpit zone. */
function armpitSharpness(point, frames) {
  const spec = LOFT.armpit;
  const ease = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  let most = 0;
  for (const side of ['l', 'r']) {
    const frame = frames[BONE[`${side}UpperArm`]];
    const chest = frames[BONE.chest];
    if (!frame || !chest) continue;
    const length = vec.length(vec.sub(frame.end, frame.origin)) || 1;
    const rel = vec.sub(point, frame.origin);
    const t = vec.dot(rel, frame.y) / length;
    // (Its inner side: off the arm's axis towards the chest's.)
    const off = vec.sub(rel, vec.scale(frame.y, t * length));
    const inward = vec.dot(off, vec.normalize(vec.sub(chest.origin, frame.origin)));
    if (inward <= 0) continue;
    most = Math.max(most, ease(spec.from[0], spec.from[1], t) * (1 - ease(spec.to[0], spec.to[1], t)));
  }
  return most;
}

/**
 * The base mesh's shoulders weighted as one smooth turn from the trunk into the arm (LOFT.shoulder). Weighted by distance to the
 * bones alone (to their sixth power), the trunk's skin at the armpit's front and the shoulder's cap handed over from the chest
 * to the upper arm within a centimetre or two, and an arm lowered from the bind pose's 25 degrees folded the skin there into a
 * dark crease. Each point (skin, and what is worn over it, by the place it is weighted at) near an upper arm takes, of the
 * trunk's bones and the arm's, shares that ease along the arm's axis from `from` to `to` (t of the upper arm from its joint);
 * that blend fades out round the axis from `radial[0]` to `[1]` of the arm's ring radius, and its own weights take over.
 */
function blendShoulders(weights, positions, frames, parts) {
  const spec = LOFT.shoulder;
  const smooth = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  for (const side of ['l', 'r']) {
    const upper = frames[BONE[`${side}UpperArm`]];
    const part = parts[`${side}Upper`];
    if (!upper || !part) continue;
    const axis = vec.sub(upper.end, upper.origin);
    const length = vec.length(axis);
    const unit = vec.scale(axis, 1 / length);
    const picked = [];
    const shares = [];
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      const p = [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]];
      if ((p[2] > 0) !== (side === 'l')) continue;
      const rel = vec.sub(p, upper.origin);
      const t = vec.dot(rel, unit) / length;
      if (t < spec.from || t > spec.to) continue;
      const at = Math.min(1, Math.max(0, t));
      const radius = Math.max(part.depth(at), part.width(at));
      const off = vec.length(vec.sub(rel, vec.scale(unit, t * length)));
      const near = 1 - smooth(spec.radial[0] * radius, spec.radial[1] * radius, off);
      if (near <= 0) continue;
      picked.push(vertex);
      shares.push([near, smooth(spec.from, spec.to, t)]);
    }
    if (!picked.length) continue;
    const subset = Float32Array.from(picked.flatMap((vertex) => [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]]));
    const trunkBones = [BONE.spine, BONE.chest, BONE.neck, BONE[`${side}Clavicle`]];
    const armBones = [BONE[`${side}UpperArm`], BONE[`${side}Forearm`]];
    const trunkW = skinWeights(subset, frames, picked.map(() => trunkBones));
    const armW = skinWeights(subset, frames, picked.map(() => armBones));
    picked.forEach((vertex, index) => {
      const [near, arm] = shares[index];
      const mix = new Map();
      const add = (source, at, share) => {
        for (let slot = 0; slot < 4; slot += 1) {
          const w = source.skinWeight[at * 4 + slot] * share;
          if (w > 0) mix.set(source.skinIndex[at * 4 + slot], (mix.get(source.skinIndex[at * 4 + slot]) ?? 0) + w);
        }
      };
      add(weights, vertex, 1 - near);
      add(trunkW, index, near * (1 - arm));
      add(armW, index, near * arm);
      const best = [...mix].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = best.reduce((sum, [, w]) => sum + w, 0);
      for (let slot = 0; slot < 4; slot += 1) {
        weights.skinIndex[vertex * 4 + slot] = best[slot]?.[0] ?? 0;
        weights.skinWeight[vertex * 4 + slot] = best[slot] ? best[slot][1] / total : 0;
      }
    });
  }
}

/** A tile's coordinates (tileUv) marked as those of something that gives (cloth over small plates, mail): measured again as worn (retile). */
const asWorn = (uv, tile) => Object.assign(uv, { worn: tile });

/**
 * The tiles of what gives, measured on the piece as it is worn. A field tile's coordinates are laid out on the piece's rings as
 * built (tileUv); fitted to the body, flared or hung as a skirt, the piece is then drawn out one way and in the other, and its
 * rivet heads and links were drawn out with it into dashes. Each such loft is measured again where it lies: a whole number of
 * tiles round its mean girth, and along it by the mean length between its rings. (A plate keeps its own measure: it does not give.)
 */
function retile(mesh) {
  for (const { start, rows, stride, tile } of mesh.wornTiles ?? []) {
    const at = (row, step) => (start + row * stride + step) * 3;
    const span = (a, b) => Math.hypot(mesh.positions[a] - mesh.positions[b], mesh.positions[a + 1] - mesh.positions[b + 1], mesh.positions[a + 2] - mesh.positions[b + 2]);
    const [round, up] = tileSize(tile);
    const along = [0];
    let girth = 0;
    for (let row = 0; row < rows; row += 1) {
      let drop = 0;
      for (let step = 0; step < stride - 1; step += 1) {
        girth += span(at(row, step), at(row, step + 1)) / rows;
        if (row) drop += span(at(row, step), at(row - 1, step)) / (stride - 1);
      }
      if (row) along.push(along[row - 1] + drop);
    }
    const [first, last] = [mesh.uvs.get(start), mesh.uvs.get(start + (rows - 1) * stride)];
    const rising = last[1] >= first[1];
    const across = Math.max(1, Math.round(girth / round));
    for (let row = 0; row < rows; row += 1) {
      for (let step = 0; step < stride; step += 1) mesh.uvs.set(start + row * stride + step, [first[0] + (step / (stride - 1)) * across, (rising ? along[row] : along.at(-1) - along[row]) / up]);
    }
  }
}

/**
 * The clothes and armour fitted to the base skin (LOFT.fit): they are lofted on the rings, which the modelled body stands out of
 * where it departs from an ellipse (the pecs, the buttocks, a big belly). Each point of a piece is moved out from its ring's
 * middle until it clears the skin near it by the share it stood off its ring: the skin points of the same part that lie close
 * to its line out from the ring (within `across`) and no further out than `deeper` past it (a shoulder far out beyond a narrow
 * ring at the trunk's top is other anatomy the piece passes inside, as a strap passes under the shoulder's cap). Flesh within an
 * arm's own reach of its axis is the arm's, whichever part the mesh gave it: a piece on the trunk passes under it.
 */
function fitClothToBase(mesh, parts, armoured) {
  const spec = LOFT.fit;
  const { start, count } = mesh.base;
  const frames = {};
  for (const [name, part] of Object.entries(parts)) {
    const axis = vec.normalize(vec.sub(part.b, part.a));
    const depthAxis = vec.normalize(vec.sub(part.forward, vec.scale(axis, vec.dot(part.forward, axis))));
    frames[name] = { part, axis, length: vec.length(vec.sub(part.b, part.a)), depthAxis, widthAxis: vec.cross(axis, depthAxis) };
  }
  const nameOf = new Map();
  for (const [name, [from, to]] of Object.entries(mesh.parts)) for (let vertex = Math.max(from, start); vertex < to; vertex += 1) nameOf.set(vertex, name);
  // (Which arm's: `armOf` the side, or null.)
  const armOf = (point, name) => ['lUpper', 'rUpper'].find((arm) => {
    const frame = frames[arm];
    if (!frame || arm === name) return false;
    const rel = vec.sub(point, frame.part.a);
    const t = Math.max(spec.armFrom, Math.min(1, vec.dot(rel, frame.axis) / frame.length));
    const off = vec.sub(rel, vec.scale(frame.axis, t * frame.length));
    // (Further on a wasted body, by how much of the emaciated reference it takes (`herReach` more at all of her): her arm hangs
    // from her own shoulder, up to 5 cm off the bone at its root, and her armpit's skin lay out of the reach round the bone,
    // where it held a top's upper edge out past the arm in a blade.)
    return vec.length(off) < spec.armReach * (1 + spec.herReach * (mesh.base.herShare ?? 0)) * Math.max(frame.part.depth(Math.max(0, t)), frame.part.width(Math.max(0, t)));
  }) ?? null;
  const armsReach = (point, name) => armOf(point, name) !== null;
  const LEG = /^([lr])(Thigh|Shin|Foot)$/;
  const otherLeg = (name, flesh) => LEG.test(name) && LEG.test(flesh) && name[0] !== flesh[0];
  // Each base point of another part within an arm's reach (the shoulder's cap on the trunk), by arm: covered with the arm's root.
  mesh.base.armFlesh = new Array(count).fill(null);
  // The skin's points by part, in cells of `across` (a spatial hash).
  const size = spec.across;
  const cells = new Map();
  const keyOf = (x, y, z) => `${Math.floor(x / size)}|${Math.floor(y / size)}|${Math.floor(z / size)}`;
  const sample = (point, name, swell, armSkin) => {
    const key = keyOf(...point);
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push({ point, name, swell, arm: /Upper|Fore/.test(name) || armSkin || armsReach(point, name) });
  };
  for (let vertex = start; vertex < start + count; vertex += 1) {
    const name = nameOf.get(vertex);
    if (!name) continue;
    const point = mesh.positions.slice(vertex * 3, vertex * 3 + 3);
    if (!/Upper|Fore/.test(name)) mesh.base.armFlesh[vertex - start] = armOf(point, name);
    // (Neck flesh beyond the neck's own reach, the slope of the shoulders, is the trunk's: covered with the trunk's top.)
    if (name === 'neck' && frames.neck && !mesh.base.armFlesh[vertex - start]) {
      const frame = frames.neck;
      const rel = vec.sub(point, frame.part.a);
      const t = vec.dot(rel, frame.axis) / frame.length;
      const off = vec.length(vec.sub(rel, vec.scale(frame.axis, t * frame.length)));
      if (off > spec.armReach * Math.max(frame.part.depth(t), frame.part.width(t))) mesh.base.armFlesh[vertex - start] = 'trunk';
    }
    // (Or an arm's own point, or one blending into it (armSkin): a wasted arm hangs from the emaciated reference's shoulder,
    // basebody.js baseHer, up to 5 cm off the bone at its root and out of the reach round it.)
    sample(point, name, mesh.base.swell[vertex - start], Boolean(mesh.base.armSkin?.[vertex - start]));
  }
  // And points within each of the skin's faces wider than a piece's point looks about it (`across`), `sampling` of that apart:
  // a very fat belly draws the model's faces out to 5 cm and more, and a line out from a waistband's ring passed between
  // their corners finding no skin to clear, the trunks left in tatters with the belly through them.
  const [firstIndex, lastIndex] = mesh.base.triangles;
  for (let index = firstIndex; index < lastIndex; index += 3) {
    const corners = [0, 1, 2].map((corner) => mesh.indices[index + corner]);
    const name = nameOf.get(corners[0]);
    if (!name) continue;
    const points = corners.map((vertex) => mesh.positions.slice(vertex * 3, vertex * 3 + 3));
    const longest = Math.max(...[0, 1, 2].map((corner) => vec.length(vec.sub(points[corner], points[(corner + 1) % 3]))));
    const steps = Math.ceil(longest / (spec.across * spec.sampling));
    if (steps < 2) continue;
    const swell = Math.min(...corners.map((vertex) => mesh.base.swell[vertex - start]));
    const armSkin = corners.every((vertex) => mesh.base.armSkin?.[vertex - start]);
    for (let i = 0; i <= steps; i += 1) for (let j = 0; j <= steps - i; j += 1) {
      // (Not the corners themselves: they are in already.)
      if ((i === 0 || i === steps) && (j === 0 || j === steps - i) && (i + j === 0 || i + j === steps)) continue;
      const [u, v] = [i / steps, j / steps];
      sample([0, 1, 2].map((axis) => points[0][axis] * (1 - u - v) + points[1][axis] * u + points[2][axis] * v), name, swell, armSkin);
    }
  }
  // Which part a ring is on: the one whose axis it runs along and whose line its middle lies on (its lean aside).
  const ringPart = new Map();
  const partOf = (ring) => {
    if (ringPart.has(ring)) return ringPart.get(ring);
    const axis = ring.along ?? vec.cross(ring.depthAxis, ring.widthAxis);
    // (A straight leg's thigh and shin run along one line: the part whose own length the ring's middle lies in, or nearest it.)
    let found = null;
    let best = Infinity;
    for (const [name, frame] of Object.entries(frames)) {
      if (vec.dot(axis, frame.axis) < spec.parallel) continue;
      const rel = vec.sub(ring.center, frame.part.a);
      const along = vec.dot(rel, frame.axis) / frame.length;
      const off = vec.sub(rel, vec.scale(frame.axis, along * frame.length));
      if (Math.abs(vec.dot(off, frame.widthAxis)) >= spec.onLine) continue;
      const outside = Math.max(0, -along, along - 1);
      if (outside < best) {
        best = outside;
        found = name;
      }
    }
    ringPart.set(ring, found);
    return found;
  };
  // A piece lofted on the trunk's rings without the belly's bulge (trunks, a belt, a skirt's waist: loftbody's `unbulged`) is worn
  // under the belly, which hangs over it: the belly's dome is not counted for it.
  const trunk = parts.trunk;
  const underBelly = (ring) => trunk.bulged && Math.abs(ring.depth - trunk.depth(ring.t)) <= Math.abs(ring.depth - trunk.bulged(ring.t)) && trunk.bulged(ring.t) > trunk.depth(ring.t) + 1e-4;
  // Each point's share out (its reach over its radius), then laid on: a hard piece (steel, a moulded shell, mail, padding) keeps its
  // ring's shape, its shares averaged round the ring over `hardSpan` (rad) either way (a plate follows the chest's breadth, not a
  // pectoral); cloth keeps each point's own (it drapes over the form), but under armour every layer is laid on as the hard ones are (a share depends on the skin and
  // the ring, not on how far the piece stands off, so layers on the same rings keep their order: the arming coat under the plate).
  const shares = new Map();
  const hard = (vertex) => armoured || HARD_ROLES.has(mesh.colors[vertex]);
  // How far a piece stands off skin `need` out from its ring's centre (m). A hard piece by its inflate, a share of the ring (a
  // plate for a bigger man is the same plate made bigger, its padding with it); but cloth is no thicker on a fat body than on a
  // lean one, and its inflate is a thickness only on the `leanRing` it was drawn on: at a share of a fat belly's 23 cm the
  // waistband stood 2.3 cm off the skin all round, a hoop the trunks hung inside.
  // What a point is cut as (LOFT.fit.kinds), and how much of its thickness a trunk's ring keeps: none of the `waist` share
  // taken off where the trunk is as broad as at the chest, all of it at the waist.
  // (Under armour every layer of a part is cut as its armour is, the kind most of the part's stiff points are: on the same
  // rings the layers then keep their order, the arming coat under the plate.)
  const kindOf = (vertex) => mesh.ringOf.get(vertex)?.kind ?? mesh.kinds?.get(mesh.stiff?.[vertex]) ?? (PLATE_PAINTS.has(mesh.colors[vertex]) ? 'plate' : 'soft');
  const worn = {};
  if (armoured) {
    const tally = {};
    for (const [vertex, ring] of mesh.ringOf) {
      if (vertex >= start || mesh.colors[vertex] === 'skin' || kindOf(vertex) === 'soft' || !partOf(ring)) continue;
      const counts = tally[partOf(ring)] ??= {};
      counts[kindOf(vertex)] = (counts[kindOf(vertex)] ?? 0) + 1;
    }
    for (const [name, counts] of Object.entries(tally)) worn[name] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  const cutOf = (vertex, name) => spec.kinds[worn[name] ?? kindOf(vertex)] ?? spec.kinds.soft;
  // A cuirass is cut to the rib cage (`ribCut`: a trunk's piece of plate or of rows): no wider at any height than the trunk's
  // own flesh there, the arm's and the shoulder's cap left to the pieces worn on them, its armholes cut in round the arm's
  // root. `ribsAt` a ring: that flesh's reach to either side of the ring's middle (m; the skin within `alongBand` of it).
  const ribCut = (vertex, name) => name === 'trunk' && (kindOf(vertex) === 'plate' || kindOf(vertex) === 'rows');
  const ribFlesh = new Map();
  if (frames.trunk) for (const list of cells.values()) for (const { point, name, arm } of list) {
    if (arm || (name !== 'trunk' && name !== 'neck')) continue;
    const row = Math.floor(vec.dot(vec.sub(point, frames.trunk.part.a), frames.trunk.axis) / spec.alongBand);
    (ribFlesh.get(row) ?? ribFlesh.set(row, []).get(row)).push(point);
  }
  const ribs = new Map();
  const ribsAt = (ring) => {
    if (ribs.has(ring)) return ribs.get(ring);
    const row = Math.floor(vec.dot(vec.sub(ring.center, frames.trunk.part.a), frames.trunk.axis) / spec.alongBand);
    const reach = [0, 0];
    for (let near = row - 1; near <= row + 1; near += 1) for (const point of ribFlesh.get(near) ?? []) {
      const across = vec.dot(vec.sub(point, ring.center), ring.widthAxis);
      reach[across > 0 ? 0 : 1] = Math.max(reach[across > 0 ? 0 : 1], Math.abs(across));
    }
    ribs.set(ring, reach);
    return reach;
  };
  let [waistWidth, chestWidth, waistAt] = [Infinity, 0, 0];
  for (let t = spec.waistIn[0]; t <= spec.waistIn[1]; t += 0.05) if (trunk.width(t) < waistWidth) [waistWidth, waistAt] = [trunk.width(t), t];
  for (let t = waistAt; t <= 1.0001; t += 0.05) chestWidth = Math.max(chestWidth, trunk.width(t));
  const kept = (cut, name, t) => (name !== 'trunk' || chestWidth - waistWidth < 1e-6 ? 1 : cut.waist + (1 - cut.waist) * Math.min(1, Math.max(0, (trunk.width(Math.min(1, Math.max(0, t))) - waistWidth) / (chestWidth - waistWidth))));
  // How far out a point lies over skin `need` out from its ring's centre (m). The flesh past `flat`, the ring it was drawn on,
  // is enclosed less its cut's `squeeze`; and it stands off that by its inflate, a thickness: the share of the ring it was
  // drawn on, no more on a body that stands out of it (cloth: of the `leanRing` at most; it is no thicker on a fat body than
  // on a lean one, and at a share of a fat belly's 23 cm a waistband stood 2.3 cm off the skin all round, a hoop the trunks
  // hung inside). `thick` that share (the inflate less one, `kept`).
  const laidOver = (need, thick, vertex, flat, cut) => {
    const within = need <= flat ? need : flat + (need - flat) * (1 - cut.squeeze);
    return within + thick * Math.min(within, hard(vertex) ? flat : spec.leanRing);
  };
  // (And back: the skin under a point laid `reach` out.)
  const skinUnder = (reach, thick, vertex, flat, { squeeze }) => {
    const lean = hard(vertex) ? flat : spec.leanRing;
    const within = reach <= lean * (1 + thick) ? reach / (1 + thick) : reach - thick * lean;
    return within <= flat || squeeze >= 1 ? within : flat + (within - flat) / (1 - squeeze);
  };
  // How high each piece reaches up its part (a coat to the neck goes over the shoulder's cap: below).
  const pieceTop = new Map();
  const ribPieces = new Set();
  for (const ring of mesh.ringOf.values()) pieceTop.set(ring.piece, Math.max(pieceTop.get(ring.piece) ?? -Infinity, ring.t));
  for (const [vertex, ring] of mesh.ringOf) {
    if (vertex >= start || mesh.colors[vertex] === 'skin') continue;
    const name = partOf(ring);
    if (!name) continue;
    // (Only what is worn at the waist goes under the belly: a coat's skirt, lofted on the same unbulged rings, hangs over it.)
    const under = name === 'trunk' && WAIST_ROLES.has(mesh.colors[vertex]) && underBelly(ring);
    const onArm = /Upper|Fore/.test(name);
    const p = mesh.positions.slice(vertex * 3, vertex * 3 + 3);
    const out = vec.sub(p, ring.center);
    const radius = vec.length(out);
    if (radius < 1e-6) continue;
    const dir = vec.scale(out, 1 / radius);
    // The share the piece stands off its ring (its inflate): kept over the skin.
    const flat = Math.hypot(Math.cos(mesh.ringA[vertex]) * ring.depth, Math.sin(mesh.ringA[vertex]) * ring.width) || radius;
    const standoff = Math.max(1, radius / flat);
    let need = 0;
    let capped = false;
    let legs = false;
    // (The cells round the piece's point and on along its line out, a cell at a time to `deeper` past it: the skin it must clear
    // may stand that far out, a breast 3-6 cm past a top's ring, beyond the cells next to the point.)
    // (And for what is cinched, CINCHED_ROLES, the cells on in towards the centre as far as `tightest`: it is drawn in to the body
    // wherever that lies inside its ring. The furrow of a fat man's back lay 6 cm inside his waistband's, further than the cells
    // next to the point, and the band stood there on its loft's ring.)
    const visited = new Set();
    const near = [];
    const inward = CINCHED_ROLES.has(mesh.colors[vertex]) ? radius * (1 - spec.tightest) : 0;
    for (let step = -inward; step <= spec.deeper; step += size) {
      const [cx, cy, cz] = [0, 1, 2].map((axis) => Math.floor((p[axis] + dir[axis] * step) / size));
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const key = `${cx + dx}|${cy + dy}|${cz + dz}`;
        if (visited.has(key)) continue;
        visited.add(key);
        near.push(key);
      }
    }
    for (const key of near) {
      for (const { point, swell, arm, name: fleshOf } of cells.get(key) ?? []) {
        // (A leg's piece clears its own leg and the trunk over it, not the other leg across the gap between them: a cuisse's
        // inner side found the other thigh 4 cm past it and went out to enclose both.)
        if (otherLeg(name, fleshOf)) continue;
        // (The arm's flesh fits a piece on the arm, the rest of the skin a piece on the rest; the belly's dome not one under it.)
        // (A piece on the trunk up to its top, a shirt or a coat to the neck, goes over the shoulder's cap and the trapezius too.)
        const overCap = name === 'trunk' && !ribCut(vertex, name) && pieceTop.get(ring.piece) >= LOFT.closedJoint.top.trunk;
        if ((arm !== onArm && !(arm && overCap)) || (under && swell > spec.overhang)) continue;
        const rel = vec.sub(point, ring.center);
        const along = vec.dot(rel, dir);
        if (along <= 0 || along > radius + spec.deeper) continue;
        // (Near its line out round the part, `across`; along the part only within `alongBand`, so a waistband hugs the hips it
        // is on, not the flanks swelling above it.)
        const aside = vec.sub(rel, vec.scale(dir, along));
        const up = vec.dot(aside, frames[name].axis);
        if (Math.abs(up) > spec.alongBand || vec.length(vec.sub(aside, vec.scale(frames[name].axis, up))) > spec.across) continue;
        if (along > need) [need, capped, legs] = [along, arm && !onArm, name === 'trunk' && LEG.test(fleshOf)];
      }
    }
    // (A leg's flesh under a trunk's piece, a fauld's foot or a skirt over the thighs, is cleared whole: the leg wears its own
    // pieces at its own cut, and a groin's mail pressed in to the trunk's lean ring sank inside the hose of both thighs.)
    const cut = legs ? { ...cutOf(vertex, name), squeeze: 0 } : cutOf(vertex, name);
    const thick = (standoff * spec.clear - 1) * kept(cut, name, ring.t);
    let reach = need > 0 ? laidOver(need, thick, vertex, radius / standoff, cut) / radius : 1;
    let found = need > 0;
    let most = Infinity;
    if (ribCut(vertex, name)) {
      const across = vec.dot(dir, ring.widthAxis);
      const rib = ribsAt(ring)[across > 0 ? 0 : 1];
      if (rib > 0 && Math.abs(across) > 1e-3) most = rib * (1 + thick * spec.ribs) / Math.abs(across) / radius;
      if (most < reach) [reach, found] = [most, true];
      ribPieces.add(ring.piece);
    }
    shares.set(vertex, { ring, dir, radius, name, standoff, thick, cut, under, need, capped, most, lies: need > 0 && reach >= spec.tightest, share: found ? Math.max(spec.tightest, reach) : 1 });
  }
  // (Each worn point's part, for its weights: clothHeat.)
  mesh.wornPart = new Map([...shares].map(([vertex, { name }]) => [vertex, name]));
  const byRing = new Map();
  // (The cloth that lies on the skin, found beneath it no further in than `tightest`: it turns as that skin does, clothHeat,
  // whatever bones its loft gave it. Trunks lofted to hang from the pelvis, the spine and both thighs parted from a fat belly
  // carried by the spine alone as soon as the fighter crouched, the waistband dipping under it in front and the belly through.)
  mesh.onSkin = new Set([...shares].filter(([vertex, { lies }]) => lies && !hard(vertex)).map(([vertex]) => vertex));
  for (const [vertex, { ring }] of shares) (byRing.get(ring) ?? byRing.set(ring, []).get(ring)).push(vertex);
  const laidOf = new Map();
  for (const [ring, vertices] of byRing) {
    // (Cloth is drawn round the part: it lies on the skin where the part's section is convex and spans its hollows, a top across
    // the breasts, a waistband over the small of the back. The mean it was given before, never less than its own, stood it
    // off the flat of the back as well, 2 cm at a fat man's waist.)
    const drawn = vertices.filter((vertex) => !hard(vertex));
    const spans = spanOverHollows(drawn.map((vertex) => {
      const { dir, radius, share } = shares.get(vertex);
      return [vec.dot(dir, ring.depthAxis) * radius * share, vec.dot(dir, ring.widthAxis) * radius * share];
    }));
    drawn.forEach((vertex, index) => laidOf.set(vertex, shares.get(vertex).share * spans[index]));
    for (const vertex of vertices) {
      if (!hard(vertex)) continue;
      let sum = 0;
      let weight = 0;
      for (const other of vertices) {
        const gap = Math.abs(Math.atan2(Math.sin(mesh.ringA[other] - mesh.ringA[vertex]), Math.cos(mesh.ringA[other] - mesh.ringA[vertex])));
        if (gap > spec.hardSpan) continue;
        sum += shares.get(other).share;
        weight += 1;
      }
      laidOf.set(vertex, sum / weight);
    }
  }
  // Then along the piece, ring to ring (LOFT.fit.alongPasses rounds of each point's and its neighbours' in the rings either
  // side, at the same place round): each ring fitted on its own stood out from the next in bands, a coat over a very fat
  // belly in rings round it like a stack of tyres. (Not what is cinched, CINCHED_ROLES: a waistband two rings wide stood 1 cm
  // further off the back at its top for the buttocks under its foot.)
  const byPiece = new Map();
  for (const [ring, vertices] of byRing) (byPiece.get(ring.piece) ?? byPiece.set(ring.piece, []).get(ring.piece)).push([ring, vertices]);
  for (const list of byPiece.values()) {
    list.sort((a, b) => a[0].t - b[0].t);
    for (let pass = 0; pass < spec.alongPasses; pass += 1) {
      const before = new Map(laidOf);
      list.forEach(([, vertices], index) => {
        const below = list[index - 1]?.[1];
        const above = list[index + 1]?.[1];
        vertices.forEach((vertex, step) => {
          if (CINCHED_ROLES.has(mesh.colors[vertex])) return;
          let sum = 2 * before.get(vertex);
          let weight = 2;
          for (const other of [below, above]) {
            if (other?.length !== vertices.length) continue;
            sum += before.get(other[step]);
            weight += 1;
          }
          const mean = sum / weight;
          laidOf.set(vertex, hard(vertex) ? mean : Math.max(mean, shares.get(vertex).share));
        });
      });
    }
  }
  // (And the place each is weighted at, the body's surface beneath it, goes out with it: it takes its bones from the skin point
  // nearest that place, clothHeat, within LOFT.heat.reach, and a fat belly's skin stood further than that from the ring the
  // trunks were lofted on, so some of their points found the skin and turned with it and the rest kept the loft's own bones,
  // the trunks torn to tatters once the fighter crouched.)
  for (const [vertex, { ring, dir, radius, share, standoff, thick, cut, most }] of shares) {
    // (A cuirass's side no further out than its cut, whatever the rest of its ring came to.)
    const laid = Math.min(most, laidOf.get(vertex) ?? share);
    if (laid === 1) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      mesh.positions[vertex * 3 + axis] = ring.center[axis] + dir[axis] * radius * laid;
      mesh.weightPositions[vertex * 3 + axis] = ring.center[axis] + dir[axis] * skinUnder(radius * laid, thick, vertex, radius / standoff, cut);
    }
  }
  holdLegsUnderWaist(mesh, frames, shares);
  raiseCollars(mesh, frames, shares, pieceTop, nameOf, start, count);
  keepLayersInside(mesh, frames, shares, nameOf, start, count, armoured, pieceTop, ribPieces);
  // (A family body's belly is the model's own, not the loft's dome: the trunk's skin no piece lies over is found on the pieces
  // themselves, `open`. Under armour the skin is left out by the armour's own table, coverage.)
  if (mesh.base.family && !armoured) mesh.base.open = skinInTheOpen(mesh, 'trunk', frames, shares, nameOf, start, count);
}

/**
 * How much further out each point of a ring must go to lie on the ring's convex hull, as a multiple of its distance from the
 * ring's centre (1 where it is on the hull already): a band drawn taut round the points touches the outermost and spans the rest.
 * @param points [[x, y]] in the ring's plane, from its centre
 */
function spanOverHollows(points) {
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = (list) => {
    const chain = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain.slice(0, -1);
  };
  const hull = [...half(sorted), ...half(sorted.reverse())];
  if (hull.length < 3) return points.map(() => 1);
  return points.map((point) => {
    let furthest = 1;
    hull.forEach((a, index) => {
      const b = hull[(index + 1) % hull.length];
      const edge = [b[0] - a[0], b[1] - a[1]];
      const facing = point[0] * edge[1] - point[1] * edge[0];
      if (Math.abs(facing) < 1e-12) return;
      const along = (a[0] * point[1] - a[1] * point[0]) / facing;
      if (along < -1e-9 || along > 1 + 1e-9) return;
      furthest = Math.max(furthest, (a[0] * edge[1] - a[1] * edge[0]) / facing);
    });
    return furthest;
  });
}

// How far a point lies above a ring's own plane (m), up being the way `axis` runs: a tilted waist's ring is not square to its part.
function heightOverRing(point, ring, axis) {
  const normal = vec.normalize(vec.cross(ring.depthAxis, ring.widthAxis));
  return vec.dot(vec.sub(point, ring.center), normal) * Math.sign(vec.dot(normal, axis));
}

/**
 * The legs of a garment reach no higher than its waist: a piece's point on a thigh above the plane of the top ring of the trunk's
 * piece of the same cloth is brought down to that plane. The trunks' legs start above the hip (their root lies inside the
 * trunks), and a waist worn under a hanging belly drops in front to about the hip's own height (tiltWaist), where the legs'
 * tops, fitted out round the fat of the hip, stood up over the waistband in two red flaps under the belly.
 */
function holdLegsUnderWaist(mesh, frames, shares) {
  const waists = new Map();
  for (const [vertex, { ring, name }] of shares) {
    if (name !== 'trunk') continue;
    const cloth = mesh.colors[vertex];
    if (!waists.has(cloth) || ring.t > waists.get(cloth).t) waists.set(cloth, ring);
  }
  for (const [vertex, { name }] of shares) {
    const waist = /Thigh/.test(name) ? waists.get(mesh.colors[vertex]) : null;
    if (!waist) continue;
    const normal = vec.normalize(vec.cross(waist.depthAxis, waist.widthAxis));
    const over = heightOverRing(mesh.positions.slice(vertex * 3, vertex * 3 + 3), waist, frames.trunk.axis);
    if (over <= 0) continue;
    const down = vec.scale(normal, -over * Math.sign(vec.dot(normal, frames.trunk.axis)));
    for (const points of [mesh.positions, mesh.weightPositions]) for (let axis = 0; axis < 3; axis += 1) points[vertex * 3 + axis] += down[axis];
  }
}

/**
 * The base skin of part `name` that no piece worn on the part lies over (1 a point, else 0): the points above the plane of a
 * piece's top ring or below that of its bottom ring, for every piece on the part. A waist worn under a hanging belly is tilted,
 * its front lower than its back (tiltWaist), so the belly's skin above the band in front lies within the band's reach up the
 * trunk (the coverage's measure) and yet in the open: left out with the skin under the trunks, it left a hole under the belly
 * through which the inside of the trunks' back showed. Nor the skin within `tuck` of a piece's end: the piece stands off the
 * skin (its inflate), and one looks in past its edge.
 */
function skinInTheOpen(mesh, name, frames, shares, nameOf, start, count) {
  const spec = LOFT.fit;
  // Each piece's end rings on the part: the lowest and the highest up it, each plane's normal turned up the part.
  const ends = new Map();
  for (const { ring, name: on } of shares.values()) {
    if (on !== name) continue;
    const held = ends.get(ring.piece) ?? ends.set(ring.piece, { low: ring, high: ring }).get(ring.piece);
    if (ring.t < held.low.t) held.low = ring;
    if (ring.t > held.high.t) held.high = ring;
  }
  const above = (point, ring) => heightOverRing(point, ring, frames[name].axis);
  const open = new Uint8Array(count);
  for (let vertex = start; vertex < start + count; vertex += 1) {
    if (nameOf.get(vertex) !== name) continue;
    const point = mesh.positions.slice(vertex * 3, vertex * 3 + 3);
    const under = [...ends.values()].some(({ low, high }) => low !== high && above(point, low) >= spec.tuck && above(point, high) <= -spec.tuck);
    if (!under) open[vertex - start] = 1;
  }
  return open;
}

/**
 * Every trunk piece reaching the trunk's top (a shirt, a coat, a backplate, a gorget's foot) follows the base skin up to the
 * neckline at the back and sides (LOFT.collar): the modelled trapezius rises above the loft's top rings, and a garment's collar
 * lies on it, not under it. Each point of the piece's top ring, away from the front (`from` rad: the front neckline is cut low),
 * is carried to the highest skin point of the trunk and the neck in its sector round the trunk (`sector`) that still lies out at
 * the neck's foot or beyond (`neckShare` of the neck's radius), stood off it by `standoff` (m: the cloth's own thickness and
 * the layer margin) along the point's own line out from the axis. A piece already higher there stays.
 */
function raiseCollars(mesh, frames, shares, pieceTop, nameOf, start, count) {
  const spec = LOFT.collar;
  const trunk = frames.trunk;
  if (!trunk) return;
  const neckFoot = frames.neck ? Math.max(frames.neck.part.depth(0), frames.neck.part.width(0)) * spec.neckShare : 0;
  const placeOf = (p) => {
    const rel = vec.sub(p, trunk.part.a);
    const t = vec.dot(rel, trunk.axis) / trunk.length;
    const out = vec.sub(rel, vec.scale(trunk.axis, t * trunk.length));
    return { t, out, r: vec.length(out), angle: Math.atan2(vec.dot(out, trunk.widthAxis), vec.dot(out, trunk.depthAxis)) };
  };
  // The skin of the trunk and neck (not the arms', nor the shoulder's cap) by sector round the trunk: its highest point out at the neck's foot.
  const sectors = spec.sectors;
  const highest = new Array(sectors).fill(null);
  const sectorOf = (angle) => ((Math.floor(((angle / (Math.PI * 2)) % 1 + 1) % 1 * sectors) % sectors) + sectors) % sectors;
  for (let vertex = start; vertex < start + count; vertex += 1) {
    const name = nameOf.get(vertex);
    if (name !== 'trunk' && name !== 'neck') continue;
    if (mesh.base.armFlesh?.[vertex - start] && mesh.base.armFlesh[vertex - start] !== 'trunk') continue;
    const place = placeOf(mesh.positions.slice(vertex * 3, vertex * 3 + 3));
    if (place.r < neckFoot) continue;
    const sector = sectorOf(place.angle);
    if (!highest[sector] || place.t > highest[sector].t) highest[sector] = place;
  }
  const tops = highest.map((_, sector) => {
    let top = null;
    for (let k = -spec.spread; k <= spec.spread; k += 1) {
      const found = highest[(sector + k + sectors) % sectors];
      if (found && (!top || found.t > top.t)) top = found;
    }
    return top;
  });
  // (No dip between two higher sectors within `bridge` of each other: behind the neck the skin lies in at the spine, inside
  // the neck's foot, and the collar left low there was a notch down the back between the trapezius's two rises.)
  const bridged = tops.map((top, sector) => {
    let best = top;
    for (let before = 1; before < spec.bridge; before += 1) {
      for (let after = 1; before + after <= spec.bridge; after += 1) {
        const [low, high] = [tops[(sector - before + sectors) % sectors], tops[(sector + after) % sectors]];
        if (!low || !high) continue;
        const share = before / (before + after);
        const t = low.t + (high.t - low.t) * share;
        if (!best || t > best.t) best = { t, r: low.r + (high.r - low.r) * share };
      }
    }
    return best;
  });
  const topOf = (sector) => bridged[((sector % sectors) + sectors) % sectors];
  for (const [vertex, { ring, name, standoff }] of shares) {
    if (name !== 'trunk' || pieceTop.get(ring.piece) < LOFT.closedJoint.top.trunk || ring.t < pieceTop.get(ring.piece)) continue;
    const place = placeOf(mesh.positions.slice(vertex * 3, vertex * 3 + 3));
    if (Math.abs(place.angle) < spec.from) continue;
    // (The highest skin of a sector and those beside it, and between two sectors' middles the line from one to the other: the
    // collar is a smooth line, and each point keeps its own place round the trunk. Carried to the skin point's own place, the
    // points of three sectors met on one and the ring between them folded into teeth.)
    const at = ((place.angle / (Math.PI * 2)) % 1 + 1) % 1 * sectors - 0.5;
    const share = at - Math.floor(at);
    const [low, high] = [topOf(Math.floor(at)), topOf(Math.floor(at) + 1)];
    if (!low && !high) continue;
    const t = (low ?? high).t * (1 - share) + (high ?? low).t * share;
    if (t <= place.t) continue;
    const reach = (low ?? high).r * (1 - share) + (high ?? low).r * share + spec.standoff * standoff;
    const dir = vec.scale(place.out, 1 / (place.r || 1));
    const point = vec.add(vec.add(trunk.part.a, vec.scale(trunk.axis, t * trunk.length)), vec.scale(dir, reach));
    mesh.positions.splice(vertex * 3, 3, ...point);
  }
}

/**
 * Layer by layer, what is worn beneath stays beneath (LOFT.layers): skin under the clothes, a shirt under the coat, the trousers
 * under the shin guards. Every point of the base skin and of every piece is placed on its part (t along, its angle round, its
 * distance out from the axis), and gathered in cells of t by angle; a layer is ranked by how far its piece stands off its ring
 * (the skin 0). A point lying further out than a higher-ranked piece's surface there (between that piece's nearest rings below
 * and above it, in its cell or those beside it round the part), less `margin`, is drawn in to there along its line out from the
 * axis; past a piece's ends nothing is held by it. The skin of the shoulder's cap is held to the arm's layers,
 * not the trunk's (a shirt's top rings are narrower than the shoulders it passes under), and the belly's dome is not held under
 * a waistband it hangs over.
 */
// (`armoured`: under armour a piece low on the trunk is drawn in under a thigh's piece, never left out there.)
function keepLayersInside(mesh, frames, shares, nameOf, start, count, armoured = false, pieceTop = new Map(), ribPieces = new Set()) {
  const spec = LOFT.layers;
  mesh.underLayer = new Set();
  const cells = new Map();
  const placeOf = (name, vertex) => {
    const frame = frames[name];
    const p = mesh.positions.slice(vertex * 3, vertex * 3 + 3);
    const rel = vec.sub(p, frame.part.a);
    const t = vec.dot(rel, frame.axis) / frame.length;
    const out = vec.sub(rel, vec.scale(frame.axis, t * frame.length));
    const angle = Math.atan2(vec.dot(out, frame.widthAxis), vec.dot(out, frame.depthAxis));
    return { t, angle, r: vec.length(out), out };
  };
  const keyOf = (name, row, column) => `${name}|${row}|${((column % spec.around) + spec.around) % spec.around}`;
  const rowOf = (t) => Math.floor(t / spec.along);
  const columnOf = (angle) => Math.floor((((angle / (Math.PI * 2)) % 1) + 1) % 1 * spec.around);
  const layers = [];
  // (A piece's rank is its least standoff over all its points, near its inflate: a tilted waist's rings stand further off at the
  // front than their inflate, and a per-point rank would put the shorts over their own waistband there.)
  const pieceRank = new Map();
  for (const { standoff, ring } of shares.values()) pieceRank.set(ring.piece, Math.min(pieceRank.get(ring.piece) ?? Infinity, standoff));
  for (const [vertex, { name, under, ring }] of shares) {
    if (!frames[name]) continue;
    // (Cloth worn over armour outranks every piece: the plate is held inside it, and it is drawn out over the plate.)
    // (`hem`: on its piece's top ring, a top's upper hem below the part's top.)
    const hem = ring.t >= (pieceTop.get(ring.piece) ?? Infinity) - 1e-6 && ring.t < (name === 'trunk' ? LOFT.closedJoint.top.trunk : LOFT.closedJoint.top.limb);
    layers.push({ vertex, name, rank: ring.over ? Infinity : pieceRank.get(ring.piece), under, piece: ring.piece, over: Boolean(ring.over), torn: Boolean(ring.torn), hem });
  }
  // (The skin by its source point: the copies of one point drawn in two tiles, or either side of a seam, move as one, or the
  // surface would crack between them.)
  const copies = new Map();
  for (let vertex = start; vertex < start + count; vertex += 1) {
    const source = mesh.base.source[vertex - start];
    (copies.get(source) ?? copies.set(source, []).get(source)).push(vertex);
  }
  for (const group of copies.values()) {
    const vertex = group[0];
    const own = nameOf.get(vertex);
    if (!own) continue;
    // (The shoulder's cap is the arm's, the neck's slope the trunk's: held to those parts' layers.)
    const flesh = mesh.base.armFlesh?.[vertex - start];
    layers.push({ vertex, group, name: flesh ?? own, rank: 0, skin: true, arm: Boolean(mesh.base.armSkin?.[vertex - start]), dome: (mesh.base.swell?.[vertex - start] ?? 0) > 0 });
  }
  for (const layer of layers) {
    if (!frames[layer.name]) continue;
    Object.assign(layer, placeOf(layer.name, layer.vertex));
    if (layer.skin) continue;
    const key = keyOf(layer.name, rowOf(layer.t), columnOf(layer.angle));
    (cells.get(key) ?? cells.set(key, []).get(key)).push(layer);
  }
  // Each outer piece's surface at a place on a part: between its nearest ring below and above, or just past an end ring (within
  // `endReach`, so the skin dips under a hem rather than standing over its edge); Infinity where none lies over it.
  // (`within` set when the place lies between two of a piece's rings, not only past its end: only then is a piece beneath hidden.)
  let within = false;
  let limiting = null;
  const surface = (name, place, layer) => {
    let limit = Infinity;
    within = false;
    limiting = null;
    const row = rowOf(place.t);
    const column = columnOf(place.angle);
    const below = new Map();
    const above = new Map();
    for (let dr = -spec.reach; dr <= spec.reach; dr += 1) {
      for (let dc = -spec.spread; dc <= spec.spread; dc += 1) {
        for (const outer of cells.get(keyOf(name, row + dr, column + dc)) ?? []) {
          if (outer.rank <= layer.rank + spec.rankGap || (layer.dome && outer.under)) continue;
          const side = outer.t <= place.t ? below : above;
          const held = side.get(outer.piece);
          if (!held || Math.abs(outer.t - place.t) < Math.abs(held.t - place.t) || (Math.abs(outer.t - held.t) < 1e-6 && outer.r < held.r)) side.set(outer.piece, outer);
        }
      }
    }
    for (const piece of new Set([...below.keys(), ...above.keys()])) {
      const low = below.get(piece);
      const high = above.get(piece);
      let r;
      if (low && high) {
        const span = high.t - low.t;
        r = low.r + (high.r - low.r) * (span > 1e-6 ? (place.t - low.t) / span : 0);
        within = within || !low.torn;
      } else {
        const end = low ?? high;
        if (Math.abs(end.t - place.t) > spec.endReach) continue;
        // (Skin standing out past a hem by more than `hemPull` is the body going on beyond the garment, the breast above a
        // bandeau's edge: drawn in to the hem it crumpled into folds, so the hem is left to sink into it instead.)
        // (A hem only: a collar up at the part's top, raised along the trapezius, holds the slope of the shoulders under it.)
        const hem = (pieceTop.get(piece) ?? Infinity) < (name === 'trunk' ? LOFT.closedJoint.top.trunk : LOFT.closedJoint.top.limb);
        if (layer.skin && hem && layer.r - (end.r - spec.margin) > spec.hemPull) continue;
        r = end.r;
      }
      // (The piece is flat between its points round the ring, LOFT.sides of them: its facet's middle lies the chord's sag,
      // cos(π / sides) of the points' reach, inside them, where a breast's or a calf's skin between two points came through.)
      const facet = r * Math.cos(Math.PI / LOFT.sides);
      // (Skin a little deeper, `skinMargin`: between a piece's rings its surface is flat across, and a breast's tip under a top
      // came through it in specks at the nominal margin.)
      const gap = layer.skin ? spec.skinMargin : spec.margin;
      if (facet - gap < limit) {
        limit = facet - gap;
        limiting = piece;
      }
    }
    return limit;
  };
  // A band or a belt (BAND_ROLES) stands outside the pieces it is worn over, measured after the cloth was fitted: each point, in
  // order of rank (the innermost first, so an outer band sees an inner one where it now lies), drawn out to `margin` past the furthest
  // point of a lower-ranked piece in its cell and those beside it, that piece's facets' sag allowed for (cos(π / LOFT.sides)
  // of its points' reach, as below). Fitted to the skin each on its own, a waistband tilted under a fat belly and the shorts
  // under it came out at the same reach and crossed, the shorts showing through the band in patches; the band is moved out,
  // not the shorts in, as a band lies over what it holds. (Not every piece: a coat's skirt pushed out past its own body stood
  // out from it in a step at the belt.) Only past a piece that goes on above it, a coat under its belt: one that ends under the
  // band is gathered into it, the shorts' own cloth into their waistband, and drawn in under it as any layer is (below). Held
  // outside the shorts' reach round the hips below it, the band of a fat man's trunks stood 3 to 6 cm off his back, a hoop.
  const sag = 1 / Math.cos(Math.PI / LOFT.sides);
  // A piece's upper hem stands outside the skin under it, `hemStand` (m) past the skin's furthest point in its cell and those
  // beside it: the skin past a hem is not drawn in under it (`hemPull`), and a bandeau's upper hem sank into the breast's top in
  // a ragged edge where the skin cut through it.
  const skinReach = new Map();
  for (const layer of layers) {
    // (Not an arm's skin, nor skin blending into one: the arm lies beside a top, not under its hem.)
    if (!layer.skin || layer.r === undefined || layer.arm) continue;
    const key = keyOf(layer.name, rowOf(layer.t), columnOf(layer.angle));
    skinReach.set(key, Math.max(skinReach.get(key) ?? 0, layer.r));
  }
  for (const layer of layers) {
    if (!layer.hem || layer.skin || layer.r === undefined || layer.r < 1e-6) continue;
    let most = 0;
    const row = rowOf(layer.t);
    const column = columnOf(layer.angle);
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -spec.spread; dc <= spec.spread; dc += 1) most = Math.max(most, skinReach.get(keyOf(layer.name, row + dr, column + dc)) ?? 0);
    const want = most * sag + spec.hemStand;
    if (most > 0 && layer.r < want) {
      const push = (want - layer.r) / layer.r;
      for (let axis = 0; axis < 3; axis += 1) mesh.positions[layer.vertex * 3 + axis] += layer.out[axis] * push;
      layer.out = layer.out.map((value) => value * (1 + push));
      layer.r = want;
    }
  }
  for (const layer of [...layers].filter((one) => !one.skin && !one.over && one.r > 1e-6 && BAND_ROLES.has(mesh.colors[one.vertex])).sort((a, b) => a.rank - b.rank)) {
    let most = 0;
    const row = rowOf(layer.t);
    const column = columnOf(layer.angle);
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -spec.spread; dc <= spec.spread; dc += 1) {
      for (const under of cells.get(keyOf(layer.name, row + dr, column + dc)) ?? []) {
        if (under.over || under.rank >= layer.rank - spec.rankGap || (pieceTop.get(under.piece) ?? Infinity) <= (pieceTop.get(layer.piece) ?? -Infinity)) continue;
        most = Math.max(most, under.r);
      }
    }
    const want = most * sag + spec.margin;
    if (most > 0 && layer.r < want) {
      const push = (want - layer.r) / layer.r;
      for (let axis = 0; axis < 3; axis += 1) mesh.positions[layer.vertex * 3 + axis] += layer.out[axis] * push;
      layer.out = layer.out.map((value) => value * (1 + push));
      layer.r = want;
    }
  }
  // Cloth worn over armour first drawn out past every piece beneath it in its cell and those beside it (LOFT.layers.margin out).
  for (const layer of layers) {
    if (!layer.over || layer.r === undefined || layer.r < 1e-6) continue;
    let most = 0;
    const row = rowOf(layer.t);
    const column = columnOf(layer.angle);
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -spec.spread; dc <= spec.spread; dc += 1) {
      for (const under of cells.get(keyOf(layer.name, row + dr, column + dc)) ?? []) if (!under.over) most = Math.max(most, under.r);
    }
    const want = most + spec.margin;
    if (most > 0 && layer.r < want) {
      const push = (want - layer.r) / layer.r;
      for (let axis = 0; axis < 3; axis += 1) mesh.positions[layer.vertex * 3 + axis] += layer.out[axis] * push;
      layer.out = layer.out.map((value) => value * (1 + push));
      layer.r = want;
    }
    // (A skirt worn over armour, low on the trunk, hangs over the thighs' pieces too, the tassets: drawn out past them from each
    // thigh's own axis.)
    if (layer.name !== 'trunk' || layer.t >= spec.trunkFoot) continue;
    for (const thigh of ['lThigh', 'rThigh']) {
      if (!frames[thigh]) continue;
      const place = placeOf(thigh, layer.vertex);
      if (place.t < spec.thighRoot || place.t > 1 || place.r < 1e-6) continue;
      let deepest = 0;
      const r0 = rowOf(place.t);
      const c0 = columnOf(place.angle);
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -spec.spread; dc <= spec.spread; dc += 1) {
        for (const under of cells.get(keyOf(thigh, r0 + dr, c0 + dc)) ?? []) if (!under.over) deepest = Math.max(deepest, under.r);
      }
      const reach = deepest + spec.margin;
      if (deepest <= 0 || place.r >= reach) continue;
      const push = (reach - place.r) / place.r;
      for (let axis = 0; axis < 3; axis += 1) mesh.positions[layer.vertex * 3 + axis] += place.out[axis] * push;
    }
    Object.assign(layer, placeOf(layer.name, layer.vertex));
  }
  for (const layer of layers) {
    if (layer.r === undefined || layer.r < 1e-6) continue;
    const limit = surface(layer.name, layer, layer);
    const covered = within;
    // (A piece up to the trunk's top, a coat to the neck, goes over the shoulder's cap and holds its skin however far.)
    // (Not a cuirass, cut in round the arm's root, `ribPieces`: the shoulder's cap and what is worn over it lie beside it.)
    const overCap = limiting !== null && pieceTop.get(limiting) >= LOFT.closedJoint.top.trunk && !ribPieces.has(limiting);
    const beside = layer.skin ? layer.arm : shares.get(layer.vertex)?.capped;
    // (A piece low on the trunk lies over the thighs as well: under a thigh's piece there it is left out, not drawn in.)
    if (!layer.skin && layer.name === 'trunk' && layer.t < spec.trunkFoot) {
      for (const thigh of ['lThigh', 'rThigh']) {
        if (!frames[thigh]) continue;
        const place = placeOf(thigh, layer.vertex);
        if (place.t < spec.thighRoot || place.t > 1) continue;
        if (!armoured && place.r < surface(thigh, place, layer) && within) mesh.underLayer.add(layer.vertex);
      }
    }
    // (A piece's point with another piece over it is never seen: its triangles are left out where all their points are so, so
    // two layers of one cloth do not fight through each other: hideCovered.)
    // (Under armour as well: what lies between one closed piece's own rings is hidden by it, a plate's or a quilted coat's; the
    // gaps between pieces lie within none of them, and laced rows and split skirts are lofted with holes, which hide nothing.
    // Drawn in only, trousers came through the samurai's shin guards in slivers.)
    // (Only where the piece over it lies close, within `hideGap` either way: a skirt hanging clear of the legs is open beneath,
    // and what is under it is seen from below; and flesh standing far out of a piece, the inner thighs between two trouser legs,
    // fills the gap between pieces once drawn in.)
    const close = Math.abs(limit + spec.margin - layer.r) < spec.hideGap;
    // (Nor under armour below the trunk's foot: a fauld or a coat's skirt hangs open over the thighs, and the breeches under
    // its hem are seen from below.)
    const openHem = armoured && layer.name === 'trunk' && layer.t < spec.trunkFoot;
    // (Under a cuirass, cut inside the shoulder's flesh, the trunk's cloth is under it however far it is drawn in: the arming
    // coat's shoulder, left where the flesh put it, stood through the plate's edge in slivers.)
    const underCuirass = ribPieces.has(limiting) && layer.name === 'trunk';
    if (!layer.skin && covered && (!armoured || close || underCuirass) && !openHem) mesh.underLayer.add(layer.vertex);
    // (Skin between the rings of a closed piece is under it too, and left out the same way: drawn in to the cloth's
    // surface it still came through it in specks and patches where the cloth's facets cut across the modelled forms, at a
    // boot's top, a coat's shoulder, a sleeve's root. Under armour too: a plate or a quilted coat is a closed tube between its own
    // rings, and the gaps between pieces are not within any one of them. Not under torn cloth, whose holes show it.)
    if (layer.skin && covered && close) for (const vertex of layer.group ?? [layer.vertex]) mesh.underLayer.add(vertex);
    // (An arm's skin, or skin blending into an arm, that a trunk piece would draw in by more than `mostPull` is not under it: the
    // arm lies beside the top, and drawing it in tears it into spikes.)
    if (layer.r > limit && limit > 0 && !(beside && !overCap && !(underCuirass && !layer.skin) && layer.name === 'trunk' && layer.r - limit > spec.mostPull)) {
      const pull = (limit - layer.r) / layer.r;
      for (const vertex of layer.group ?? [layer.vertex]) for (let axis = 0; axis < 3; axis += 1) mesh.positions[vertex * 3 + axis] += layer.out[axis] * pull;
    }
    // (High on a thigh, under a trunk piece hanging over it, a coat's skirt or a fauld: held inside it from the trunk's own axis,
    // and left out where it lies close within it, as a trunk piece is under a thigh's above. Trousers' hips came through a thin
    // man's coat.)
    if (!/Thigh$/.test(layer.name) || !frames.trunk) continue;
    const onTrunk = placeOf('trunk', layer.vertex);
    if (onTrunk.t >= spec.trunkFoot || onTrunk.r < 1e-6) continue;
    const held = { ...layer, ...onTrunk };
    const hang = surface('trunk', held, held);
    if (!within) continue;
    if (!armoured && Math.abs(hang + spec.margin - onTrunk.r) < spec.hideGap) for (const vertex of layer.group ?? [layer.vertex]) mesh.underLayer.add(vertex);
    if (onTrunk.r > hang && hang > 0) {
      const pull = (hang - onTrunk.r) / onTrunk.r;
      for (const vertex of layer.group ?? [layer.vertex]) for (let axis = 0; axis < 3; axis += 1) mesh.positions[vertex * 3 + axis] += onTrunk.out[axis] * pull;
    }
  }
}
// The roles worn at the waist, under a hanging belly (fitClothToBase): shorts and trousers, their bands and belts, a mawashi.
const WAIST_ROLES = new Set(['kit', 'under', 'band', 'trim2', 'belt', 'mawashi', 'rope']);
// What is drawn tight round the body, an elastic or a tied band: it lies on the flesh at each of its edges (the flesh gives to it),
// not carried from one ring to the next as hanging cloth is (fitClothToBase).
const CINCHED_ROLES = new Set(['band', 'belt', 'mawashi', 'rope']);
// The roles of bands and belts worn over a garment (keepLayersInside): held outside what they are worn over.
const BAND_ROLES = new Set(['band', 'trim2', 'belt', 'rope']);
// The roles of hard pieces (fitClothToBase): metal, moulded shells, mail and padded pieces keep their rings' shape.
const HARD_ROLES = new Set(['steel', 'steel2', 'gold', 'armor', 'pad', 'mail', 'charge']);

/**
 * On the base mesh, a joint both of whose sides are covered by closed pieces is covered through (LOFT.closedJoint): the modelled
 * skin at a joint (the trapezius between a gorget and a backplate, the hip between a fauld and a cuisse) stands out of the rings
 * both pieces are lofted on, where the loft's own skin lay inside them. A piece reaching a part's end (`ends`) next to a piece
 * starting at the neighbour's root closes it: both stretches carry on through the joint, past the margins coverTable took off.
 * `cover` the raw stretches, `covered` the table (changed in place).
 */
function closeCoveredJoints(covered, cover) {
  const spec = LOFT.closedJoint;
  const reaches = (name, end) => (cover[name] ?? []).some(([from, to]) => (end === 'top' ? to >= (spec.top[name] ?? spec.top.limb) : from <= spec.root));
  const extend = (name, end) => {
    const list = covered[name];
    if (!list?.length) return;
    if (end === 'top') list[list.length - 1][1] = spec.far;
    else list[0][0] = -spec.far;
  };
  const joints = [['trunk', 'top', 'neck', 'root'], ['trunk', 'root', 'lThigh', 'root'], ['trunk', 'root', 'rThigh', 'root'], ['trunk', 'top', 'lUpper', 'root', false], ['trunk', 'top', 'rUpper', 'root', false],
    ['lUpper', 'top', 'lFore', 'root'], ['rUpper', 'top', 'rFore', 'root'], ['lThigh', 'top', 'lShin', 'root'], ['rThigh', 'top', 'rShin', 'root']];
  // (The trunk's top meets the neck and both shoulders: it is covered through only where the neck's foot is, an arm's root by the
  // trunk's top alone.)
  for (const [a, endA, b, endB, both = true] of joints) {
    if (!reaches(a, endA) || !reaches(b, endB)) continue;
    if (both) extend(a, endA);
    extend(b, endB);
  }
}

/**
 * The base skin's points drawn more than once (a seam, a tile's edge) given one normal: the mean of theirs; then smoothed over
 * the surface (LOFT.baseNormals): each point's normal the mean of its own and its neighbours', `passes` rounds. The model was
 * decimated from 12k points to an 8k-triangle mesh, and on its coarser triangles a soft fold (the valley under the pec toward
 * the flank) is lit as a hard groove; the full model's normals vary over a wider stretch. Positions are untouched.
 */
function weldBaseNormals(normals, base, indices) {
  const sums = new Float64Array(base.sources * 3);
  for (let index = 0; index < base.count; index += 1) {
    const from = (base.start + index) * 3;
    const to = base.source[index] * 3;
    for (let axis = 0; axis < 3; axis += 1) sums[to + axis] += normals[from + axis];
  }
  // (The sources' neighbours, through the drawn triangles.)
  const neighbours = Array.from({ length: base.sources }, () => new Set());
  const sourceOf = (vertex) => (vertex >= base.start && vertex < base.start + base.count ? base.source[vertex - base.start] : -1);
  for (let corner = 0; corner < indices.length; corner += 3) {
    const tri = [sourceOf(indices[corner]), sourceOf(indices[corner + 1]), sourceOf(indices[corner + 2])];
    if (tri.some((source) => source < 0)) continue;
    for (const a of tri) for (const b of tri) if (a !== b) neighbours[a].add(b);
  }
  let current = sums;
  for (let pass = 0; pass < LOFT.baseNormals.passes; pass += 1) {
    const next = new Float64Array(current.length);
    for (let source = 0; source < base.sources; source += 1) {
      const own = Math.hypot(current[source * 3], current[source * 3 + 1], current[source * 3 + 2]) || 1;
      for (let axis = 0; axis < 3; axis += 1) next[source * 3 + axis] = current[source * 3 + axis] / own;
      for (const other of neighbours[source]) {
        const length = Math.hypot(current[other * 3], current[other * 3 + 1], current[other * 3 + 2]) || 1;
        for (let axis = 0; axis < 3; axis += 1) next[source * 3 + axis] += current[other * 3 + axis] / length;
      }
    }
    current = next;
  }
  for (let index = 0; index < base.count; index += 1) {
    const from = base.source[index] * 3;
    const length = Math.hypot(current[from], current[from + 1], current[from + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) normals[(base.start + index) * 3 + axis] = current[from + axis] / length;
  }
}

/** A body's loft, built now (see buildLoftBodySteps). */
export function buildLoftBody(body, options = {}) {
  return runSteps(buildLoftBodySteps(body, options));
}

/**
 * The stretches of each skin part a body's armour covers (see LOFT.cover): { trunk: [[from, to]...], lUpper: [...], ... } in t along
 * the part, the margin at each end already taken off, or null when he wears no armour. What `hideCovered` leaves out of the skin.
 */
export function coveredRegions(body) {
  return buildLoftBody(body, { coverOnly: true }).covered ?? null;
}

/**
 * The loft, as slices of work (a generator: each `yield` is a place to hand the thread back, the return value the mesh), so a
 * dear style (V7's wrap onto the flesh field) can be built a few milliseconds a frame. `hideCovered`: under armour, the skin a
 * closed piece covers is left out of the mesh (coveredRegions); `coverOnly`: stop once that is known (no mesh worth having).
 */
export function* buildLoftBodySteps(body, { faceted = false, lowDetail = false, sculpt = false, rules = null, fillet = false, wrap = null, hideCovered = false, coverOnly = false, base: wantBase = null } = {}) {
  // (Where the base meshes are left out of a build, the loft's own skin.)
  const base = wantBase && baseBodyAvailable() ? wantBase : null;
  // `base`: the skin parts are the base mesh's (basebody.js) placed on this body's rings, not lofted; `base.measure` stops once the
  // rings are known and returns them (`baseParts`: what the base mesh is measured against, baseRigOf).
  const baseRig = base && !base.measure ? baseRigOf(body.inputs.sex === 'female' ? 'female' : 'male', lowDetail) : null;
  const baseParts = base ? {} : null;
  // The base mesh's own broad forms (sculpt.js mass shapes) on every body, crowds and armour too: its rings must be the same ones it was measured on.
  const baseTraits = base ? sculptTraits(body) : null;
  // Bent by anatomy (`sculpted`): `sculpt: true` with all its fine detail on fine rings (`detailed`); `sculpt: 'mass'` only the broad forms, on the usual
  // rings (the detail style adds the rest as shading); `sculpt: 'rules'` the broad forms, the outline's own features and a share of the fine anatomy of
  // skinrules.js (`rules`: { share, fine }: how much of the fine height goes in the mesh, and whether on fine rings), the rest left to the textures.
  // `fillet`: the joins of the arms, legs and neck to the trunk blended (filletParts), so a limb grows out of the body instead of being stuck on.
  const sculpted = Boolean(sculpt) && !faceted && !lowDetail;
  const detailed = sculpted && sculpt === true;
  const ruled = sculpted && sculpt === 'rules';
  const fine = sculpted && (sculpt === true || (ruled && Boolean(rules?.fine)));
  // `rules.density: 'medium'`: between the plain rings and the fine ones (a skin wrapped onto a field: `wrap`, see wrapOnField).
  const medium = ruled && !fine && rules?.density === 'medium';
  // `wrap`: the skin moved onto the surface of a signed-distance field (the refined flesh field: V5's joins on a loft's topology).
  const wrapping = ruled && Boolean(wrap) && !lowDetail && !faceted;
  // The textured styles' skin lofts carry texture coordinates (skindetail.js): they unwrap each part as a cylinder.
  const textured = sculpted && (sculpt === 'mass' || ruled);
  const skinUv = (tile) => (textured ? { uv: detailUv(tile) } : {});
  const traits = sculpted ? sculptTraits(body) : null;
  const rulesOf = ruled ? rulesTraits(body) : null;
  const rulesShare = ruled ? rules?.share ?? 0 : 0;
  // The profiles along each part: eased stop to stop (flat at every stop, which prints a band round the part at each), or for the
  // rules' styles a smooth curve through the stops (no shelf at the shoulder, no ring round the arm).
  const sculptProfile = ruled ? rulesProfile : stepProfile;
  // The rules' styles draw a fat limb a little fuller than the physics' radius (a heavy man's arms and thighs read as tubes at it):
  // drawn only, the body's own radii are untouched. Not under armour, which is built on the same rings.
  // (Not for the base mesh, which carries its own fullness: its rings are the physics' radii.)
  const limbFatter = (key) => (ruled && !base && !outfitOf(body.inputs).look.armor ? 1 + LOFT.limbFatDrawn * Math.max(0, body.segments[key].skinRadius - body.segments[key].muscleRadius) : 1);
  // Low detail (a crowd): fewer sides and rows, still smooth.
  const sides = faceted ? LOFT.facetedSides : lowDetail ? Math.round(LOFT.sides * 0.6) : LOFT.sides;
  const rows = faceted ? 0.5 : lowDetail ? LOFT.rowDensity * 0.6 : LOFT.rowDensity;
  const count = (n) => Math.max(2, Math.round(n * rows));
  // The skin's own rings, finer when sculpted (clothes and armour keep the usual count).
  const skinCount = (n) => (fine ? Math.max(2, Math.round(n * SCULPT.limbDensity)) : medium ? Math.max(2, Math.round(n * LOFT.medium.limbDensity)) : count(n));
  const skinSides = fine ? SCULPT.limbSides : medium ? LOFT.medium.limbSides : sides;
  const trunkSides = fine ? SCULPT.trunkSides : medium ? LOFT.medium.trunkSides : sides;
  // Which of a part's shapes the skin takes: all of it, or the broad forms alone.
  const skinBend = (shapes) => (detailed ? shapes.skin : armoured ? null : shapes.mass);
  // The rules' bend: the broad form, the outline's features and the mesh's share of the fine height, not under cloth, nothing under armour.
  const ruledBend = (shapes, part, side, covers) => (armoured || !ruled ? skinBend(shapes) : rulesShape(rulesOf, part, side, rulesShare, shapes.mass, (t) => sculptCoverShare(covers, t, 0.05)));
  // On the base mesh the rings (and the skin) are built on the model's own joints, and the skin bound to the same skeleton moved
  // onto the rig's roots (basebody.js baseBindJoints): `bindAt`, `bindFrames` what is returned for the renderer to bind to.
  const rigPoints = bindPoints(body);
  const baseBreadth = baseRig && !lowDetail && BASE_BODY.family.use ? baseFrame(body, baseRig.height) : { apart: 1, across: 1 };
  const baseJoints = baseRig ? baseBindJoints(baseRig, jointsByName(rigPoints), body.heightM, baseBreadth.apart) : null;
  const byIndex = (named) => Object.keys(P).map((name) => named[name]);
  const points = baseJoints ? byIndex(baseJoints.loft) : rigPoints;
  const frames = boneFrames(points, body);
  const bindAt = baseJoints ? byIndex(baseJoints.bind) : points;
  const bindFrames = baseJoints ? boneFrames(bindAt, body) : frames;
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const mesh = { positions: [], weightPositions: [], indices: [], colors: [], bones: [], stiff: [], bodies: 0, kinds: new Map(), body: 0, stiffens: !lowDetail, uvs: new Map(), welds: [], parts: {}, ringT: [], ringA: [], covers: {}, cover: lowDetail ? null : {}, ringOf: base && !base.measure ? new Map() : null };
  // Rings along a skin part, tagged with it: a closed piece lofted over them covers that stretch of the part (loft).
  const tagged = (name, rings) => Object.assign(rings, { part: name });
  const build = seg.trunk.tissue.muscle / (seg.trunk.tissue.muscle + seg.trunk.tissue.fat);
  // The trunk is a lean shape (from the radius without fat) under a layer
  // of fat, laid on where fat goes: thickest at the waist and belly, then
  // the hips (more so for women), least over the shoulders.
  const R = seg.trunk.muscleRadius;
  const fatLayer = Math.max(0, seg.trunk.skinRadius - seg.trunk.muscleRadius);
  const female = body.inputs.sex === 'female';
  const forward = [1, 0, 0];

  // Trunk: hips, waist, chest, shoulders, narrowing into the neck.
  const hipHalf = L.hipSpan / 2 + seg.lThigh.muscleRadius * 0.85;
  const neckR = L.headRadius * (0.44 + 0.12 * body.neckIndex);
  const hipFat = female ? 1.6 : 1.1;
  // Wasting (0 at a normal build, 1 at the BMI floor): the abdomen sinks
  // behind the ribs, the waist pinches and the chest shrinks onto its cage.
  const wasting = Math.min(1, Math.max(0, (LOFT.wastingFrom - R) / LOFT.wastingSpan));
  // The sculpt style draws the trunk's profiles from its landmarks (sculpt.js trunkProfiles).
  const sculptProfiles = sculpted ? trunkProfiles(body, traits, { L, R, neckR, hipHalf, sculptProfile }) : null;
  const leanWidth = sculptProfiles?.leanWidth ?? sculptProfile([[-0.12, hipHalf * 0.8], [0.02, hipHalf], [0.3, (L.hipSpan * 0.42 + R * 0.25) * (1 - 0.3 * wasting)], [0.62, (L.shoulderSpan * 0.42 + 0.02) * (1 - 0.14 * wasting)], [0.84, L.shoulderSpan * 0.48 * (1 - 0.06 * wasting)], [0.94, L.shoulderSpan * 0.4], [1.04, neckR * (1.7 + 0.5 * body.neckIndex)], [1.12, neckR * 1.15]]);
  const fatWidth = sculptProfiles?.fatWidth ?? sculptProfile([[-0.12, 0.9 * hipFat], [0.05, 1.25 * hipFat], [0.3, 1.55], [0.6, 1.05], [0.86, 0.55], [1.04, 0.45], [1.12, 0.25]]);
  const leanDepth = sculptProfiles?.leanDepth ?? sculptProfile([[-0.12, R * 0.5], [0.02, R * 0.62], [0.3, R * 0.55 * (1 - 0.3 * wasting)], [0.62, R * 0.62 * (1 + 0.15 * build) * (1 - 0.1 * wasting)], [0.88, R * 0.52], [1.04, neckR * 1.3], [1.12, neckR * 1.05]]);
  const fatDepth = sculptProfiles?.fatDepth ?? sculptProfile([[-0.12, 0.8], [0.1, 1.05], [0.3, 1.45], [0.62, 0.95], [0.88, 0.5], [1.04, 0.6], [1.12, 0.35]]);
  // The belly carries forward of the spine as fat thickens.
  const leanOffset = sculptProfiles?.leanOffset ?? sculptProfile([[0, -0.012], [0.3, 0], [0.65, 0.012], [1, -0.01]]);
  const fatOffset = sculptProfiles?.fatOffset ?? sculptProfile([[0, 0.1], [0.25, 0.55], [0.45, 0.35], [0.65, 0.1], [1, 0]]);
  // Past a thick enough layer the abdomen bulges forward, then hangs: the
  // trunk carries on below the waistband as an apron in front of the thighs,
  // narrowing and thinning to its hem.
  const belly = Math.max(0, fatLayer - LOFT.bellyFrom);
  const bulge = sculptProfile([[-0.12, 0.7], [0.15, 1], [0.4, 0.4], [0.6, 0]]);
  const hem = -0.12 - (belly * LOFT.bellyDrop) / vec.length(vec.sub(at('neck'), at('pelvis')));
  // A corset cinches the waist: the trunk drawn in round the natural waist.
  const corseted = Boolean(ARMOR_KINDS[outfitOf(body.inputs).look.armor?.kind]?.cinch);
  const cinch = (u) => (corseted ? 1 - LOFT.corset.cinch * Math.exp(-(((u - LOFT.corset.at) / LOFT.corset.span) ** 2)) : 1);
  const bodyWidth = (u) => (leanWidth(u) + fatLayer * fatWidth(u)) * cinch(u);
  const bodyDepth = (u) => (leanDepth(u) + fatLayer * fatDepth(u) + belly * LOFT.bellyScale * bulge(u)) * cinch(u);
  const bodyLean = (u) => leanOffset(u) + fatLayer * fatOffset(u) + belly * LOFT.bellyScale * 0.8 * bulge(u);
  // 0 at the hem, 1 at the waistband.
  const apron = (u) => Math.sqrt(Math.max(0, (u - hem) / (-0.12 - hem)));
  // (Sculpted, the apron's hem is rounded off: it closes in on itself rather than ending flat.)
  const hemWidth = sculpted ? 0.3 : 0.55;
  const hemDepth = sculpted ? 0.08 : 0.3;
  const width = (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (hemWidth + (1 - hemWidth) * apron(u)));
  const depth = (u) => (u >= -0.12 ? bodyDepth(u) : bodyDepth(-0.12) * (hemDepth + (1 - hemDepth) * apron(u)));
  const lean = (u) => (u >= -0.12 ? bodyLean(u) : bodyLean(-0.12) + bodyDepth(-0.12) * 0.7 * (1 - apron(u)));
  const trunkRings = (from, to, rings) => tagged('trunk', along(at('pelvis'), at('neck'), forward, rings, from, to, depth, width, lean));
  // A coat cut straight (a kit's `straight`), not tailored: it hangs from the chest to the hips without following the
  // waist in, the body's width and depth between them never less than the line from the hip to the chest.
  const chestAt = 0.7;
  const unwaisted = (shape) => (u) => (u <= 0 || u >= chestAt ? shape(u) : Math.max(shape(u), shape(0) + (shape(chestAt) - shape(0)) * (u / chestAt)));
  const straightRings = (from, to, rings) => tagged('trunk', along(at('pelvis'), at('neck'), forward, rings, from, to, unwaisted(depth), unwaisted(width), lean));
  // Skin weights go by distance; a wide belly lies nearer the hanging
  // forearms than the spine, so the abdomen is bound to the torso alone,
  // and the apron to the pelvis and spine, not the legs it hangs over.
  // The front of a fat belly lies over the thighs too, which swing forward
  // in a crouch; only the sides and back of the hips follow the legs.
  const torso = [BONE.pelvis, BONE.spine, BONE.chest, BONE.lThigh, BONE.rThigh];
  const hanging = [BONE.pelvis, BONE.spine, BONE.chest];
  const lumbar = (ring, front) => (ring.t < -0.12 || (belly > 0 && front > 0.2) ? hanging : ring.t < 0.55 ? torso : null);
  // A rigid breastplate (LOFT.plateBreastplate): the trunk from its waist to
  // its top rides the chest bone alone, everything on it; `chestOnly` marks those vertices.
  const kitOf = ARMOR_KINDS[outfitOf(body.inputs).look.armor?.kind];
  const breastplate = outfitOf(body.inputs).look.armor?.kind === 'plate' ? LOFT.plateBreastplate : kitOf?.rigidBreastplate ?? null;
  const chestOnly = [BONE.chest];
  const abdomen = (ring, front) => (breastplate && ring.t >= breastplate[0] && ring.t <= breastplate[1] ? chestOnly : lumbar(ring, front));
  // The breastplate's ridge and flared hem (LOFT.ridged), over its span of the trunk.
  // (The Gothic harness's: LOFT.gothic.)
  const gothicPlate = outfitOf(body.inputs).look.armor?.fluted === 'sprays';
  const brassBorders = outfitOf(body.inputs).look.armor?.decor?.kind === 'brass';
  const ridgedPlate = (ring, angle) => {
    if (!breastplate || ring.t < breastplate[0] - 0.02 || ring.t > breastplate[1]) return 1;
    const spec = gothicPlate ? { ...LOFT.ridged, ...LOFT.gothic } : LOFT.ridged;
    const height = breastplate[1] - breastplate[0];
    const along = (ring.t - breastplate[0]) / height;
    const fade = Math.min(1, along / spec.fade, (1 - along) / spec.fade);
    const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    const keel = spec.ridge * Math.max(0, 1 - off / spec.width) * Math.max(0, fade);
    const flare = spec.flare * Math.max(0, 1 - (ring.t - breastplate[0]) / spec.flareOver);
    return 1 + keel + flare - (gothicPlate ? spec.waist * Math.max(0, 1 - along / spec.waistOver) : 0);
  };
  // Roped borders on the breastplate: a twisted band at its neck and its hem (of brass on a harness with brass borders).
  const roped = (ring, step) => breastplate && (Math.abs(ring.t - breastplate[1] + LOFT.ridged.rope) < LOFT.ridged.rope || Math.abs(ring.t - breastplate[0] - LOFT.ridged.rope) < LOFT.ridged.rope) ? (brassBorders ? 'gold' : step % 2 ? 'steel2' : 'steel') : null;
  // Clothes hide the anatomy beneath them: no fine detail on the skin where trunks or a top cover it.
  const coveredTrunk = [];
  const dressed = outfitOf(body.inputs).look;
  // In armour (a plate, a coat of lames, a quilted jack) the sculpted skin keeps the loft's plain rings: the armour is built on those and has no room for a muscle's bulge.
  const armoured = Boolean(dressed.armor);
  if (sculpted && dressed.bottom && !dressed.bottom.skirt && dressed.bottom.kind !== 'gown') coveredTrunk.push([-0.2, 0.26, 0.05]);
  // (A shirt torn to rags hides nothing: the cage shows through where it is gone, and it is gone over most of the front and sides.)
  if (sculpted && dressed.top && (!dressed.top.female || female) && !TOPS[dressed.top.kind].torn) coveredTrunk.push([TOPS[dressed.top.kind].hem, TOPS[dressed.top.kind].neck, 0.03]);
  const trunkShape = sculpted ? trunkShapes(body, traits, coveredTrunk, armoured) : null;
  if (sculpted) yield 'trunk shapes';
  const apronRings = Math.round((-0.12 - Math.min(-0.12, hem)) * 10);
  // The plain loft of a starved man (the placeholder while his V7 skin is built, LOFT.ribBand): his ribs, sunk belly and collarbones
  // painted on the skin from the same rules the maps draw, so he reads as starved at once. Not in a crowd, faceted, or under armour.
  const starvedRules = !sculpted && !lowDetail && !faceted && !armoured ? rulesTraits(body) : null;
  const ribBand = Boolean(starvedRules && starvedRules.ribs > LOFT.ribBand.from);
  // Rings sparse over the hips and shoulders, dense where the landmarks repeat (ribs, abs, spine knobs).
  let trunkCount = count(18) + apronRings;
  if (fine) {
    trunkCount = [];
    for (let t = Math.min(-0.12, hem); t < 1.12; t += t > SCULPT.denseTrunk[0] && t < SCULPT.denseTrunk[1] ? SCULPT.denseStep : SCULPT.sparseStep) trunkCount.push(t);
    trunkCount.push(1.12);
  } else if (medium) {
    trunkCount = [];
    for (let t = Math.min(-0.12, hem); t < 1.12; t += LOFT.medium.trunkStep) trunkCount.push(t);
    trunkCount.push(1.12);
  } else if (ribBand) {
    // Over the cage, a ring on each rib's crest and one in each groove (LOFT.ribBand); the usual spacing elsewhere.
    const band = LOFT.ribBand;
    const spacing = RULES.ribSpacing;
    trunkCount = [];
    for (let t = Math.min(-0.12, hem); t < band.span[0]; t += 0.05) trunkCount.push(t);
    for (let rib = Math.floor((band.span[0] + band.droop) / spacing); rib * spacing - band.droop < band.span[1]; rib += 1) {
      for (const phase of band.phases) {
        const t = (rib + phase) * spacing - band.droop;
        if (t > band.span[0] && t < band.span[1]) trunkCount.push(t);
      }
    }
    for (let t = band.span[1]; t < 1.12; t += 0.05) trunkCount.push(t);
    trunkCount.push(1.12);
  }
  yield 'trunk shaped';
  // The base mesh's trunk: on the body's own width, depth and lean (its belly's bulge in them), without the apron's hem.
  // (The belly's bulge left out: the base mesh's belly is its own round mass, not a deeper ring.)
  const baseBellyShape = base ? baseBelly(belly, vec.length(vec.sub(at('neck'), at('pelvis')))) : null;
  if (base) baseParts.trunk = { a: at('pelvis'), b: at('neck'), forward, depth: (u) => unbulged(bodyDepth, 1)(u), bulged: (u) => bodyDepth(u), width: bodyWidth, offset: (u) => unbulged(bodyLean, 0.8)(u), bend: trunkShapes(body, baseTraits).mass, bones: (t, front) => abdomen({ t }, front), swell: baseBellyShape?.swell ?? null };
  else loft(mesh, trunkRings(Math.min(-0.12, hem), 1.12, trunkCount), trunkSides, { bones: abdomen, ...(sculpted ? { bend: ruledBend(trunkShape, 'trunk', null, coveredTrunk) } : {}), ...skinUv('trunk'), part: 'trunk' });
  mesh.covers.trunk = coveredTrunk;
  // Kit is geometry, not paint: shorts, waistband and (for women) a sports
  // top are lofts a little proud of the skin, so their edges are crisp.
  // Shorts sit on the hips under the belly, which hangs over them.
  const unbulged = (shape, bellyPart) => (u) => shape(u) - belly * LOFT.bellyScale * bellyPart * bulge(u);
  // (On the base mesh they are tagged as the trunk's, so the skin a closed pair of shorts covers is left out: coverage, hideCovered.)
  const shortsRings = (from, to, rings) => {
    const made = along(at('pelvis'), at('neck'), forward, rings, from, to, unbulged(bodyDepth, 1), bodyWidth, unbulged(bodyLean, 0.8));
    return base ? tagged('trunk', made) : made;
  };
  // The outfit, piece by piece. Every piece is a loft over the body part
  // it covers, painted by role (top, trim, shirt, tie, armour, steel...);
  // the view turns roles into the design's colours.
  const { look } = outfitOf(body.inputs);
  const top = look.top && (!look.top.female || female) ? look.top : null;
  const topShape = top ? TOPS[top.kind] : null;
  const bottom = look.bottom ?? null;
  const armor = look.armor ?? null;
  // Steel drawn with the plate's maps (detailmaps.js), not in a crowd, not leather or horn.
  mesh.steelUv = DETAIL_MAPS.on && !lowDetail && Boolean(armor) && !armor.matte;
  // Its kind's own tiles for its steel and its moulded shell (detailmaps.js ARMOUR_TILES), where they are drawn; a fluted
  // harness's (`armor.fluted`, the Maximilian) its kind's fluted tiles where it has them, the flutes in the normal map.
  const tileKind = armor?.fluted === true && ARMOUR_TILES[`${armor.kind}Fluted`] ? `${armor.kind}Fluted` : armor?.kind;
  mesh.steelTile = mesh.steelUv ? armourTileOf(tileKind, 'steel') : null;
  mesh.shellTile = mesh.steelUv ? armourTileOf(tileKind, 'armor') : null;
  // Cloth drawn with the cloth atlas's maps (detailmaps.js clothMaterialOf: each role's material), not in a crowd or faceted.
  const clothContext = { faction: factionOf(body.inputs), outfit: outfitOf(body.inputs).kind };
  mesh.clothOf = DETAIL_MAPS.on && !lowDetail && !faceted ? (role) => clothMaterialOf(look, role, clothContext) : null;
  const plate = armor?.kind === 'plate';
  const lamellar = armor?.kind === 'lamellar';
  const hoplomachus = armor?.kind === 'hoplomachus';
  // A kind drawn from the table of pieces.
  const kit = ARMOR_KINDS[armor?.kind] ?? null;
  // A piece from the table: `slot` (trunk, skirt, upperArm...) and `material` (detailmaps.js pieceMaterial, from its paint) choose
  // the tile it wears where the detail maps are drawn (armourTileOf).
  const tablePiece = (rings, inflate, paint, bones, shape = null, slot = null, material = pieceMaterial(paint)) => {
    const tile = DETAIL_MAPS.on && !lowDetail ? armourTileOf(tileKind, material, slot) : null;
    const boned = bones ?? (() => null);
    // Stiff as what it is made of (stiffnessOf); a skirt's rows panel by panel, as it parts over the legs.
    const hung = slot === 'skirt' && stiffnessOf(paint) === 'coat' && paint.gaps?.length > 1;
    stiffen(mesh, rings, stiffnessOf(paint), hung ? paint.gaps.length : slot === 'skirt' ? LOFT.stiff.panels : 0, hung);
    // Lamellae (and scales hung point down) drawn as plates over a backing of their dark lacing (the robe showing in the
    // splits), except in a crowd: with the maps, one shell in rows wearing its laced tile, or a field tile of the kind's own over
    // the backing; else plate by plate.
    if (paint?.lamellae && !lowDetail) {
      const gaps = paint.gaps ? (t, angle) => inLamellaGap(paint, angle) : null;
      loft(mesh, rings, sides, { color: (ring, angle) => (inLamellaGap(paint, angle) ? 'cloth' : 'lace'), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}) });
      if (tile && isLacedTile(tile)) lacedShell(mesh, rings, inflate, lamellaRole(paint), boned, sides + 6, tile, gaps);
      else if (tile) loft(mesh, rings, sides + 6, { color: (ring, angle, index) => (paint.edge && index === 0 ? paint.edge : 'steel'), inflate: inflate + LOFT.lamellae.lift, capStart: false, capEnd: false, bones: boned, holes: gaps, uv: tileUv(rings, inflate, tile) });
      else lamellaeOn(mesh, rings, inflate, paint, boned);
      return;
    }
    // Scales painted in rows (a crowd's drawing) as a laced shell over their lacing, where the maps are drawn.
    if (paint?.scales && tile && isLacedTile(tile)) {
      loft(mesh, rings, sides, { color: 'lace', inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}) });
      lacedShell(mesh, rings, inflate, () => 'steel', boned, sides + 6, tile);
      return;
    }
    // Japanese laced rows as one shell with the kozane's (or sugake's) maps, in the rows' base colour (not in a crowd).
    if (paint?.kozane && tile) {
      lacedShell(mesh, rings, inflate, () => paint.rows[0], boned, sides + 6, tile);
      return;
    }
    // Mail with the mail's maps (detailmaps.js): one colour, the rings in the picture (not in a crowd).
    if (paint?.mail && tile) {
      loft(mesh, rings, sides, { color: 'mail', inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}), uv: asWorn(mailUv(rings, inflate), 'mail') });
      return;
    }
    // A brigandine with its tile: the cloth (its binding and opening) in one loft, the rivet heads in the picture.
    // A skirt split into leg panels (`legs`): the splits cut from it, their edges bound, the front panel over the split before.
    const split = paint?.legs && !lowDetail ? legSplit(paint, sides) : null;
    const panel = (studsDrawn) => paintFor({ ...paint, studsDrawn, gaps: null, mirror: null, rivets: null }, armor);
    if (material === 'studded' && tile) {
      loft(mesh, rings, split ? split.sides : sides, { color: paintFor({ ...paint, studsDrawn: true, mirror: null, rivets: null }, armor), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}), uv: asWorn(tileUv(rings, inflate, tile), tile), ...(split ? { holes: split.holes } : {}) });
      if (split) legPanelsOn(mesh, rings, inflate, paint, boned, sides, split, panel(true), (out) => tileUv(rings, out, tile));
      if (paint.apron) apronOn(mesh, rings, inflate, paint, boned);
      if (paint.bands) bandsOn(mesh, rings, inflate, paint, boned);
      if (paint.placket) placketOn(mesh, rings, inflate, paint, boned);
      return;
    }
    // A field tile of the kind's own (hoops, riveted lames, mail and plate, etching, a moulded shell): rows painted in a crowd
    // are in the picture, so one colour (a crest painted over it is kept).
    if (tile && tile !== 'plate' && (material === 'steel' || material === 'armor')) {
      const colour = paint?.rows && !paint.mon ? paint.rows[0] : paintFor(paint, armor);
      loft(mesh, rings, sides, { color: colour, inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}), uv: tileUv(rings, inflate, tile) });
      if (paint?.lames) lamesOn(mesh, rings, inflate, paint, boned);
      // A plate piece whose edges are turned and riveted (detailmaps.js ARMOUR_EDGES: the foot soldier's spaulders, vambraces, cops).
      if (material === 'steel' && ARMOUR_EDGES[armor?.kind]?.includes(slot)) harnessEdgesOn(mesh, rings, inflate, sides, boned);
      return;
    }
    // Drawn as faces of their own, the rivets and the mirror are not painted as well.
    const studsDrawn = Boolean(paint?.studded && !lowDetail);
    loft(mesh, rings, split ? split.sides : sides, { color: paintFor(studsDrawn ? { ...paint, studsDrawn, mirror: null } : paint, armor), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}), ...(split ? { holes: split.holes } : {}) });
    if (split) {
      const { edge, stand } = legPanelsOn(mesh, rings, inflate, paint, boned, sides, split, panel(studsDrawn));
      // The front panel's own rivet heads, in columns down it as the skirt's.
      if (studsDrawn) studsOn(mesh, rings.filter((ring) => ring.t <= paint.legs.front[0] + 0.05), stand, { ...paint, gaps: null, legs: null, apron: null, placket: null, opening: null, studded: paint.studded * 2 }, boned, { within: edge - LOFT.legs.wide * 1.5 });
    }
    // Laminated plate: each lame its own band of faces (not in a crowd).
    if (paint?.lames && !lowDetail) lamesOn(mesh, rings, inflate, paint, boned);
    // A splinted guard's splints and its cords (not in a crowd).
    if (paint?.splints && !lowDetail) splintsOn(mesh, rings, inflate, paint, boned);
    // A brigandine's rivet heads, each its own small square (not in a crowd); its apron's binding and its skirt's steel bands.
    if (paint?.studded && !lowDetail) studsOn(mesh, rings, inflate, paint, boned);
    if (paint?.apron && !lowDetail) apronOn(mesh, rings, inflate, paint, boned);
    if (paint?.bands && !lowDetail) bandsOn(mesh, rings, inflate, paint, boned);
    if (paint?.placket && !lowDetail) placketOn(mesh, rings, inflate, paint, boned);
  };
  // Lamellar: rows of lacquered scales, laced between rows and down each column.
  const laced = (ring, angle, index) => (index % 3 === 2 ? 'lace' : 'steel');
  const hanging3 = [BONE.pelvis, BONE.lThigh, BONE.rThigh];
  // Patterns on the trunk: a zip, a suit's V with the shirt and tie in it,
  // an open shirt, checks, quilting, a seam down the side.
  const topPattern = (ring, angle, index, step) => {
    const u = ring.t;
    const ahead = Math.cos(angle);
    const side = Math.abs(Math.sin(angle));
    switch (top.kind) {
      case 'jacket': case 'hoodie':
        return top.zip && ahead > 0 && side < 0.06 ? 'trim' : 'top';
      case 'compression':
        return side > 0.93 ? 'trim' : 'top';
      case 'suit': case 'waistcoat': {
        const open = top.kind === 'suit' ? 0.5 : 0.55;
        const width = (u - open) * (top.kind === 'suit' ? 1.4 : 1.6);
        if (ahead > 0.25 && u > open && side < width) {
          if (side < 0.06) return 'tie';
          if (top.waistcoat && side > width * 0.55) return 'pattern';
          return 'shirt';
        }
        return 'top';
      }
      case 'flannel':
        if (ahead > 0.2 && side < 0.22) return 'shirt';
        return ((index >> 1) + (step >> 1)) % 2 ? 'pattern' : 'top';
      case 'aloha':
        if (ahead > 0.2 && side < 0.25) return 'skin';
        return (index * 3 + step * 5) % 7 === 0 ? 'pattern' : 'top';
      case 'puffer':
        return index % 2 ? 'trim' : 'top';
      case 'turnout':
        return ahead > 0 && side < 0.08 ? 'trim' : 'top';
      default:
        return 'top';
    }
  };
  // Below the waist: shorts on the hips, a belt, a sumo's mawashi.
  // (Cloth under armour is not bent either: it would stand through the plate.)
  // (Nor on the base mesh: the cloth is fitted to the modelled skin itself, and a bend on top would stand it off by the bend.)
  const bendTrunk = sculpted && !armoured && !base ? { bend: trunkShape.mass } : {};
  // (On the base mesh they reach down to its crotch, LOFT.baseCrotch, closing between the legs over the modelled groin.)
  // On a base mesh with a belly that hangs, the waist is worn under its fold in front (LOFT.bellyBall.foldShare): `waistDrop`
  // (t) how far the fold lies below the waistband.
  const waistDrop = baseBellyShape ? Math.max(0, LOFT.waistband - (baseBellyShape.centre - baseBellyShape.tall * LOFT.bellyBall.foldShare)) : 0;
  // The waist is tilted, not lowered all round: it dips under the belly in front and stays on the hips behind (the back of the
  // waistband at its own height), each ring turned about its width axis so its front lies `waistDrop` lower at the waistband,
  // fading to nothing down the shorts.
  const trunkSpan = vec.length(vec.sub(at('neck'), at('pelvis')));
  const tiltWaist = (rings) => {
    if (!waistDrop) return rings;
    const axis = vec.normalize(vec.sub(at('neck'), at('pelvis')));
    for (const ring of rings) {
      const reach = Math.min(1, Math.max(0, (ring.t - LOFT.baseCrotch) / (LOFT.waistband - LOFT.baseCrotch)));
      const front = waistDrop * trunkSpan * reach * reach * (3 - 2 * reach);
      const tilt = Math.atan2(front, 2 * ring.depth);
      // (Its part's own axis kept, for fitting it to the base skin: fitClothToBase.)
      ring.along = axis;
      ring.center = vec.sub(ring.center, vec.scale(axis, front / 2));
      ring.depthAxis = vec.normalize(vec.sub(vec.scale(ring.depthAxis, Math.cos(tilt)), vec.scale(axis, Math.sin(tilt))));
    }
    return rings;
  };
  // (Under a harness whose groin is closed with mail, the kit's gaps.mail, they are the mail breeches worn there: mail between
  // the fauld's foot and the cuisses, and behind, where the hose alone showed as a dark band.)
  const mailAt = outfitOf(body.inputs).spec?.gaps?.mail;
  const breeches = armor && base && DETAIL_MAPS.on && !lowDetail && Array.isArray(mailAt) && mailAt.includes('groin');
  const shortsOn = (role, inflate) => {
    const rings = tiltWaist(shortsRings(base ? LOFT.baseCrotch : -0.12, 0.2, count(base ? 6 : 5)));
    const mail = breeches && role === 'kit' ? { color: 'mail', uv: asWorn(mailUv(rings, inflate), 'mail') } : { color: role };
    loft(mesh, rings, trunkSides, { ...mail, inflate, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
  };
  if (bottom) {
    switch (bottom.kind) {
      case 'trunks': case 'longShorts':
        shortsOn('kit', 1.05);
        loft(mesh, tiltWaist(shortsRings(0.17, 0.25, 1)), trunkSides, { color: bottom.trim ? 'trim2' : 'band', inflate: 1.08, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
        break;
      case 'mawashi':
        if (bottom.under) shortsOn('under', 1.04);
        shortsOn('mawashi', bottom.under ? 1.07 : 1.04);
        loft(mesh, shortsRings(-0.04, 0.2, count(3)), sides, { color: 'mawashi', inflate: 1.14, capStart: false, capEnd: false, bones: abdomen });
        break;
      case 'loincloth':
        // The subligaculum: wrapped linen, with a fold hanging in front.
        shortsOn('kit', 1.05);
        break;
      case 'slacks': case 'pants': case 'jeans': case 'cargo':
        shortsOn('kit', 1.06);
        loft(mesh, tiltWaist(shortsRings(0.12, 0.17, 1)), trunkSides, { color: 'belt', inflate: 1.075, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
        break;
      case 'ragTrousers':
        // A plain wrap over the hips (LOFT.rags), held up with a length of rope: one thin ring.
        loft(mesh, shortsRings(-0.12, 0.2, LOFT.rags.hips), LOFT.rags.hipSides, { color: 'kit', inflate: LOFT.rags.hipsLoose, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
        loft(mesh, shortsRings(0.13, 0.15, 1), LOFT.rags.hipSides, { color: 'rope', inflate: LOFT.rags.hipsLoose + 0.025, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
        break;
      default:
        shortsOn('kit', bottom.kind === 'tights' ? 1.03 : 1.06);
    }
  }
  // A skirt (or a knight's tassets) hangs from the waist past the hips and
  // is carried by the pelvis and both thighs.
  const trunkLength = vec.length(vec.sub(at('neck'), at('pelvis')));
  const skirtTo = (share) => -0.12 - (share * L.thigh) / trunkLength;
  // Flared to the hem (an A-line skirt, tassets spreading over the thighs),
  // so a fighting stance does not push the legs through it.
  const skirtRings = (hemAt, rings, flare = 0.3) => along(at('pelvis'), at('neck'), forward, rings, hemAt, 0.2,
    (u) => (u >= -0.12 ? unbulged(bodyDepth, 1)(u) : bodyDepth(-0.12) * (1 + flare * 0.7 * Math.sqrt((-0.12 - u) / (-0.12 - hemAt)))),
    (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (1 + flare * Math.sqrt((-0.12 - u) / (-0.12 - hemAt)))),
    (u) => (u >= -0.12 ? unbulged(bodyLean, 0.8)(u) : unbulged(bodyLean, 0.8)(-0.12)));
  const skirted = Boolean(bottom?.skirt && female);
  if (skirted) loft(mesh, skirtRings(skirtTo(0.85), count(8), 0.5), sides, { color: 'kit', inflate: 1.16, capStart: false, capEnd: false, bones: () => hanging3 });
  // Plate below the waist is a fauld, not a skirt: a short band of lames round the hips (the tassets hang from it over each thigh, with the legs).
  if (plate) {
    const fauld = stiffen(mesh, skirtRings(skirtTo(LOFT.fauld.reach), count(3), LOFT.fauld.flare), 'rows', LOFT.stiff.panels);
    loft(mesh, fauld, sides, { color: (ring, angle, index) => (index % 2 ? 'steel2' : 'steel'), inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
    if (!lowDetail && !armor.over) lamesOn(mesh, fauld, 1.2, { lames: LOFT.fauld.lames, base: 'steel2' }, () => hanging3);
  }
  // Kusazuri: the laced skirt of plates, in panels, over the hips and thighs.
  // (With the detail maps, its laced rows are the kozane's: one stepped shell.)
  const kozane = lamellar && DETAIL_MAPS.on && !lowDetail;
  if (kozane) lacedShell(mesh, stiffen(mesh, skirtRings(skirtTo(0.5), count(6), 0.45), 'rows', LOFT.stiff.panels), 1.24, (row) => (row === 0 && armor.trim ? 'gold' : 'steel'), () => hanging3, sides + 6, 'kozane');
  else if (lamellar) loft(mesh, stiffen(mesh, skirtRings(skirtTo(0.5), count(6), 0.45), 'rows', LOFT.stiff.panels), sides, { color: (ring, angle, index) => (index % 2 ? 'lace' : 'steel'), inflate: 1.24, capStart: false, capEnd: false, bones: () => hanging3 });
  // A long gown's skirt, belled out from the waist to below the knee.
  // A gown, or a skirt over another bottom (`gown`: bloomers under a bubble skirt).
  const gownShape = bottom?.kind === 'gown' ? bottom.shape ?? 'crinoline' : bottom?.gown ?? null;
  if (gownShape) {
    const gown = LOFT.gowns[gownShape];
    const hemAt = skirtTo(gown.hem);
    const linear = (u) => Math.max(0, (-0.12 - u) / (-0.12 - hemAt));
    // The flare's growth down the skirt: a bell's (on to the hem), a bubble's
    // (swelling, then gathered back in), or tiers (each ruffle stands out from under the last).
    const down = (u) => {
      const d = linear(u);
      if (gown.balloon) return Math.sin(Math.min(1, d) * Math.PI * 0.82) * 0.9;
      if (gown.tiers) return Math.sqrt(d) * 0.7 + 0.3 * ((d * gown.tiers) % 1);
      return Math.sqrt(d);
    };
    const waistDepth = bodyDepth(-0.12);
    const bustle = (u) => (u >= -0.12 ? 0 : (gown.bustle ?? 0) * waistDepth * Math.exp(-(((down(u) ** 2 - 0.16) / 0.2) ** 2)));
    const rings = along(at('pelvis'), at('neck'), forward, count(9), hemAt, 0.2,
      (u) => (u >= -0.12 ? unbulged(bodyDepth, 1)(u) : waistDepth * (1 + gown.depthFlare * down(u))) + bustle(u),
      (u) => (u >= -0.12 ? bodyWidth(u) : bodyWidth(-0.12) * (1 + (gown.hips ?? 0) * Math.min(1, 3 * down(u)) + gown.flare * down(u))),
      (u) => unbulged(bodyLean, 0.8)(Math.max(u, -0.12)) - bustle(u));
    // Gathered cloth: darker folds every few steps; tiers, a darker hem to each ruffle.
    const gathered = (ring, angle, index, step) => {
      if (gown.tiers && (linear(ring.t) * gown.tiers) % 1 > 0.82) return 'trim2';
      return (gown.balloon || gown.tiers) && step % 3 === 0 ? 'trim2' : 'kit';
    };
    loft(mesh, rings, sides, { color: gathered, inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
  }
  if (bottom?.kind === 'loincloth') loft(mesh, skirtRings(skirtTo(0.22), count(2), 0.5), sides, { color: 'kit', inflate: 1.16, capStart: false, capEnd: false, bones: () => hanging3 });
  // The balteus: a gladiator's broad bronze belt.
  if (hoplomachus) loft(mesh, shortsRings(0.04, 0.24, count(3)), sides, { color: (ring, angle, index) => (index === 1 ? 'gold' : 'steel'), inflate: 1.14, capStart: false, capEnd: false, bones: abdomen });
  // The top, over any layer beneath it; then body armour over both.
  if (topShape?.inner) loft(mesh, trunkRings(-0.02, 0.99, count(12)), trunkSides, { color: 'shirt', inflate: TOPS[topShape.inner].loose, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
  if (topShape?.skirt) {
    loft(mesh, skirtRings(skirtTo(topShape.skirt), count(5), 0.45), sides, { color: 'top', inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
    if (!topShape.unbelted) loft(mesh, shortsRings(0.1, 0.16, 1), sides, { color: 'belt', inflate: 1.16, capStart: false, capEnd: false, bones: abdomen });
  }
  // Rags: this man's tear (outfits.js RAGS), cut from a coarse wrap (TOPS.rags.torn).
  const tear = topShape?.torn ? ragTear(body.inputs.outfit) : null;
  if (topShape?.torn) {
    const torn = topShape.torn;
    loft(mesh, trunkRings(topShape.hem, topShape.neck, torn.rings), torn.sides, { color: 'top', inflate: topShape.loose, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk, holes: (u, angle) => ragTorn(tear, u, angle) });
  } else if (topShape) {
    loft(mesh, trunkRings(topShape.hem, topShape.neck, count(Math.max(4, Math.round(14 * (topShape.neck - topShape.hem))))), trunkSides, { color: topPattern, inflate: topShape.loose, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
    if (topShape.ribbed) loft(mesh, trunkRings(topShape.hem, topShape.hem + 0.06, 1), trunkSides, { color: 'trim', inflate: topShape.loose + 0.012, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
  }
  if (armor) {
    const shell = { riot: [-0.05, 0.97, 1.25], heavyRiot: [-0.08, 1.12, 1.3], carrier: [0.05, 0.9, 1.2], plate: [-0.12, 1.1, 1.17], lamellar: [-0.1, 1.02, 1.2] }[armor.kind];
    const role = (ring, angle, index, step) => {
      if (plate && ring.t < breastplate[0]) return index % 2 ? 'steel2' : 'steel';
      // (Fluted: with the maps the flutes are the fluted tile's; without, every other step darker.)
      if (plate) return roped(ring, step) ?? (armor.fluted === true && !mesh.steelUv && step % 2 ? 'steel2' : 'steel');
      // The ō-yoroi's leather front panel, where the bowstring would catch.
      if (lamellar && armor.panel && ring.t > 0.3 && ring.t < 0.86 && Math.cos(angle) > 0.82) return 'leather';
      if (lamellar && armor.trim && index % 5 === 0) return 'gold';
      if (lamellar) return laced(ring, angle, index, step);
      if (armor.kind === 'carrier') return Math.abs(Math.sin(angle)) < 0.75 ? 'armor' : 'top';
      return 'armor';
    };
    const shellRings = shell ? trunkRings(shell[0], shell[1], count(lamellar ? 15 : 12)) : null;
    if (shell && kozane) {
      // The dō's laced rows: the lacing's colour under them (and the leather front panel, left open in the shell), the kozane over.
      const panel = (t, angle) => armor.panel && t > 0.3 && t < 0.86 && Math.cos(angle) > 0.82;
      loft(mesh, shellRings, sides, { color: (ring, angle) => (panel(ring.t, angle) ? 'leather' : 'lace'), inflate: shell[2], capStart: false, capEnd: false, bones: abdomen });
      lacedShell(mesh, shellRings, shell[2], (row, rows) => (armor.trim && row === rows - 1 ? 'gold' : 'steel'), abdomen, sides + 6, 'kozane', armor.panel ? panel : null);
    } else if (shell) loft(mesh, shellRings, sides, { color: role, inflate: shell[2], capStart: false, capEnd: false, bones: abdomen, ...(plate ? { shape: ridgedPlate } : {}) });
    // (Under cloth worn over it, the plate's front is not seen: drawn plain.)
    // (A fluted harness's breastplate fluted as the rest: its patches wear the fluted tile.)
    mesh.patchTile = armor.fluted === true && mesh.steelUv ? mesh.steelTile : null;
    if (plate && !lowDetail && !armor.over) breastplateOn(mesh, shellRings, shell[2], ridgedPlate, breastplate, { lanceRest: true, sprays: gothicPlate ? LOFT.gothic : null }, abdomen);
    mesh.patchTile = null;
  }
  // A field per pale is drawn sharp down the middle (paleOn), except in a crowd; a device over it (chargeOn) likewise.
  const sharpPale = (paint) => paint?.heraldry && armor?.heraldry === 'pale' && !lowDetail;
  for (const [from, to, inflate, paint] of armorPieces(kit, 'trunk', 'l')) {
    const rings = (kit.straight ? straightRings : trunkRings)(from, to, count(Math.max(4, Math.round(14 * (to - from)))));
    // A kit's steel breastplate (rigidBreastplate) is ridged, its borders roped.
    const ridgedPiece = kit?.rigidBreastplate && paint === 'steel';
    tablePiece(rings, inflate, ridgedPiece ? (ring, angle, index, step) => roped(ring, step) ?? 'steel' : sharpPale(paint) ? 'cloth' : paint, abdomen, ridgedPiece ? ridgedPlate : null, 'trunk', pieceMaterial(paint));
    // (Its ridged front wears the breastplate's own tile: an etched one's bands run on over it.)
    mesh.patchTile = ridgedPiece && mesh.steelUv ? armourTileOf(armor.kind, 'steel', 'trunk') : null;
    if (ridgedPiece && !lowDetail) breastplateOn(mesh, rings, inflate, ridgedPlate, breastplate, {}, abdomen);
    mesh.patchTile = null;
    if (sharpPale(paint)) paleOn(mesh, rings, inflate * 1.02, 'cloth2', abdomen);
    if (paint?.heraldry && armor?.charge && !lowDetail) chargeOn(mesh, rings, armor.charge.kind, inflate * 1.06, 'charge', abdomen);
  }
  for (const [hem, flare, inflate, paint] of armorPieces(kit, 'skirt', 'l')) {
    const rings = skirtRings(skirtTo(hem), count(6), flare);
    tablePiece(rings, inflate, sharpPale(paint) ? 'cloth' : paint, () => hanging3, null, 'skirt');
    if (sharpPale(paint)) paleOn(mesh, rings, inflate * 1.02, 'cloth2', () => hanging3);
  }
  for (const [from, to, inflate, paint] of armorPieces(kit, 'belt', 'l')) {
    const rings = shortsRings(from, to, count(3));
    tablePiece(rings, inflate, paint, abdomen, null, 'belt');
    if (paint?.plaques && !lowDetail) plaquesOn(mesh, rings, inflate * 1.03, paint.plaques, 'gold', abdomen);
  }
  // Straps across the trunk ([from t, from angle, to t, to angle, width rad, out, role]) and cords hanging down the skirt.
  if (kit?.straps && !lowDetail) {
    const rings = trunkRings(0, 1, 20);
    const place = (t) => t * 20;
    for (const [fromT, fromAngle, toT, toAngle, width, out, role] of kit.straps) stripOn(mesh, rings, [place(fromT), fromAngle], [place(toT), toAngle], width, out, role, abdomen);
  }
  // Studs on the trunk ([t, angle, half-size rad, out, role]): buttons, bosses.
  if (kit?.studs && !lowDetail) {
    const rings = trunkRings(0, 1, 20);
    for (const [t, angle, size, out, role] of kit.studs) {
      const place = t * 20;
      const tall = size * 0.6;
      addPatch(mesh, rings, [[place - tall, angle - size, out], [place - tall, angle + size, out], [place + tall, angle + size, out], [place + tall, angle - size, out]], role, abdomen);
    }
  }
  // Round plates on the trunk ([t, angle, radius rad, out, role]): a mirror
  // over the heart, a gilt rim round it (painted on the cloth in a crowd).
  if (kit?.mirrors && !lowDetail) {
    const rings = trunkRings(0, 1, 20);
    for (const [t, angle, radius, out, role] of kit.mirrors) {
      // Its height along the trunk as its width round it (places are twentieths of the trunk).
      const tall = radius * 9;
      const disc = (scale, lift) => Array.from({ length: 16 }, (_, side) => {
        const turn = (side / 16) * Math.PI * 2;
        return [t * 20 + Math.sin(turn) * tall * scale, angle + Math.cos(turn) * radius * scale, out + lift];
      });
      addPatch(mesh, rings, disc(1.12, 0), 'gold', abdomen);
      addPatch(mesh, rings, disc(1, 0.01), role, abdomen);
    }
  }
  // Rigid plates over the trunk ([from t, to t, centre angle, half-width rad, out, role, rim]): curved with it, standing
  // proud of what is under them (the mail they are set in), a band of the rim's role round each (gilt, or the plate's own
  // shadow); in a crowd, painted on as rows.
  if (kit?.plates && !lowDetail) {
    const rings = trunkRings(0, 1, 20);
    for (const [from, to, angle, half, out, role, rim] of kit.plates) {
      if (rim) addGrid(mesh, rings, curvedPlate(from * 20 - 0.25, to * 20 + 0.25, angle, half + 0.05, out - 0.01), rim, abdomen);
      addGrid(mesh, rings, curvedPlate(from * 20, to * 20, angle, half, out), role, abdomen);
    }
  }
  // Round domed plates on the trunk ([t, angle, radius m, out, role, rim, dome m]): a krug's belly plate and its boss, a
  // mirror over the breast; `dome` how far its middle stands out, a band of the rim's role round it.
  if (kit?.discs && !lowDetail) {
    const rings = trunkRings(0, 1, 20);
    for (const [t, angle, radius, out, role, rim, dome] of kit.discs) {
      addGrid(mesh, rings, domedDisc(rings, t * 20, angle, radius * 1.12, out - 0.005, dome * 0.6), rim, abdomen);
      addGrid(mesh, rings, domedDisc(rings, t * 20, angle, radius, out, dome), role, abdomen);
    }
  }
  if (kit?.tassels && !lowDetail) {
    // [angle, how far down (thigh lengths below the waist), width rad, out, role]
    for (const [angle, length, width, out, role] of kit.tassels) {
      const rings = skirtRings(skirtTo(length), 8, 0.3);
      stripOn(mesh, rings, [8, angle], [0, angle + 0.05], width, out, role, () => hanging3);
    }
  }
  // Cloth worn over the armour (`armor.over`, a kind from the table): Joan's huque over her plate.
  const over = ARMOR_KINDS[armor?.over] ?? null;
  // Cloth over a ridged plate lies over the ridge.
  // (Marked `over`: on the base mesh it is laid outside the armour beneath it wherever it covers it, keepLayersInside.)
  const overRings = (rings) => Object.assign(rings, { over: true });
  for (const [from, to, inflate, paint] of armorPieces(over, 'trunk', 'l')) tablePiece(overRings(trunkRings(from, to, count(Math.max(4, Math.round(14 * (to - from)))))), inflate, paint, abdomen, plate ? ridgedPlate : null);
  for (const [hem, flare, inflate, paint] of armorPieces(over, 'skirt', 'l')) tablePiece(overRings(skirtRings(skirtTo(hem), count(6), flare)), inflate, paint, () => hanging3);
  // The neck thickens a little with fat (the roll under the jaw and at the nape is in the shape).
  const neckGirth = sculpted ? 1 + 3.4 * Math.max(0, traits.trunk.fat - 0.03) : 1;
  if (base) baseParts.neck = { a: at('neck'), b: at('head'), forward, depth: () => neckR * neckGirth, width: () => neckR * 1.05 * neckGirth, offset: () => 0, bend: neckShape(baseTraits, false) };
  else loft(mesh, along(at('neck'), at('head'), forward, ruled ? skinCount(5) : skinCount(3), ruled ? -0.2 : -0.05, 0.6, () => neckR * neckGirth, () => neckR * 1.05 * neckGirth), ruled ? 28 : fine ? SCULPT.limbSides + 4 : sides, { capEnd: false, ...(sculpted ? { bend: ruled && !armoured ? rulesShape(rulesOf, 'neck', null, rulesShare, neckShape(traits, false)) : neckShape(traits, detailed) } : {}), ...skinUv('neck'), part: 'neck' });
  // A collar up the neck: plate's gorget, or heavy riot armour's padded collar.
  // The riot collar starts lower and flares out over the trapezius, so no skin shows between it and the vest.
  // Plate's gorget flares down over the tops of the breast and back plates, closing the gap between them and the helmet.
  const collarFrom = plate ? -0.45 : lamellar || kit?.collar ? -0.15 : -0.6;
  const flare = (t) => 1 + (lamellar || kit?.collar ? 0 : (plate ? 0.7 : 0.9) * Math.max(0, -t) / 0.6);
  if (plate || lamellar || kit?.collar || armor?.kind === 'heavyRiot') {
    const collarRings = tagged('neck', along(at('neck'), at('head'), forward, count(3), collarFrom, 0.55, (t) => neckR * 1.55 * flare(t), (t) => neckR * 1.6 * flare(t) * flare(t)));
    // A mail collar with the mail's maps (detailmaps.js).
    const mailMaps = kit?.collar === 'mail' && DETAIL_MAPS.on && !lowDetail ? { uv: mailUv(collarRings, 1) } : {};
    // (A plate gorget is stiff on the neck; a mail or cloth collar gives with it.)
    stiffen(mesh, collarRings, kit?.collar ? stiffnessOf(kit.collar) : 'plate');
    loft(mesh, collarRings, sides, { color: kit?.collar ? paintFor(kit.collar, armor) : plate ? 'steel' : 'armor', capStart: false, capEnd: false, ...mailMaps });
  }
  // (Stiff as its paint is: one plate, or rows where it is painted in rows of plates and lacing.)
  const armorPiece = (rings, inflate, role = plate ? 'steel' : 'armor') => loft(mesh, stiffen(mesh, rings, typeof role === 'function' ? 'rows' : stiffnessOf(role)), sides, { color: role, inflate, capStart: false, capEnd: false });
  // A plate harness's piece (with the maps): its edges turned and roped, rivets inside them (harnessEdgesOn); a couter's or a
  // poleyn's articulating lames (`lames`) over its cop.
  const harnessPiece = (rings, inflate, lames = 0) => {
    armorPiece(rings, inflate);
    if (!plate || !mesh.steelUv) return;
    harnessEdgesOn(mesh, rings, inflate, sides);
    if (lames) lamesOn(mesh, rings, inflate, { lames, base: 'steel' }, () => null);
  };

  for (const side of ['l', 'r']) {
    yield `${side} limbs`;
    const shoulder = at(`${side}Shoulder`);
    const elbow = at(`${side}Elbow`);
    const hand = at(`${side}Hand`);
    const upperR = seg[`${side}UpperArm`].skinRadius * limbFatter(`${side}UpperArm`);
    const foreR = seg[`${side}Forearm`].skinRadius * limbFatter(`${side}Forearm`);
    const armBuild = seg[`${side}UpperArm`].tissue.muscle / (seg[`${side}UpperArm`].tissue.muscle + seg[`${side}UpperArm`].tissue.fat);
    const armForward = frames[BONE[`${side}UpperArm`]].x;
    // Deltoid cap, biceps and triceps (deeper than wide), the narrow elbow.
    // It starts well inside the trunk so its end never shows at the shoulder.
    // Its root closes to a point inside the shoulder, so no end face shows.
    // (Sculpted, the root is a round dome inside the shoulder, not a point sticking out above it.)
    const root = sculpted ? [[-0.22, upperR * 0.3], [-0.14, upperR * 0.95]] : [[-0.3, upperR * 0.08]];
    const upperDepth = sculptProfile([...root, [-0.06, upperR * 1.22], [0.15, upperR * 1.2], [0.5, upperR * (1 + 0.15 * armBuild)], [0.9, upperR * 0.74], [1, upperR * 0.7]]);
    const upperWidth = sculptProfile([...root.map(([at, radius]) => [at, radius * 1.02]), [-0.06, upperR * 1.25], [0.15, upperR * 1.15], [0.5, upperR * 0.92], [1, upperR * 0.72]]);
    // (A torn sleeve covers the arm only as far as it reaches on this side.)
    const sleeveReach = tear ? (tear.sleeve === side || tear.sleeve === 'both' ? RAGS.sleeve.stub : RAGS.sleeve.end) : topShape?.sleeve;
    const sleeveCover = sleeveReach ? [[-0.4, Math.min(1.1, sleeveReach)]] : [];
    const foreCover = topShape?.sleeve > 1 ? [[-0.1, topShape.sleeve - 1]] : [];
    const limbs = sculpted ? { upper: limbShapes(traits, 'arm', side, sleeveCover, armoured), fore: limbShapes(traits, 'fore', side, foreCover, armoured) } : null;
    if (base) {
      const shapes = { upper: limbShapes(baseTraits, 'arm', side), fore: limbShapes(baseTraits, 'fore', side) };
      baseParts[`${side}Upper`] = { a: shoulder, b: elbow, forward: armForward, depth: upperDepth, width: upperWidth, offset: () => 0, bend: shapes.upper.mass };
      baseParts[`${side}Fore`] = { a: elbow, b: hand, forward: armForward, ...ringProfiles((t) => forearmRings(t, t, [t])[0], elbow, hand, armForward), bend: shapes.fore.mass };
    } else loft(mesh, along(shoulder, elbow, armForward, skinCount(10), sculpted ? -0.22 : -0.3, 1.0, upperDepth, upperWidth), skinSides, { capStart: sculpted, ...(limbs ? { bend: ruledBend(limbs.upper, 'upper', side, sleeveCover) } : {}), ...skinUv(`${side}Upper`), part: `${side}Upper` });
    mesh.covers[`${side}Upper`] = sleeveCover;
    // Forearm: full below the elbow, tapering to the wrist inside the glove
    // (or, bare, on to the wrist above the fist).
    // Bare, the forearm runs right into the back of the fist.
    const wrist = glovedFists(body.inputs) ? 0.74 : 0.98;
    const forearmRings = (from, to, rings) => tagged(`${side}Fore`, along(elbow, hand, armForward, rings, from, to,
      sculptProfile([[-0.04, upperR * 0.7], [0.2, foreR * 1.05], [0.74, foreR * 0.6], [0.98, foreR * 0.6]]),
      sculptProfile([[-0.04, upperR * 0.72], [0.2, foreR * 1.18], [0.74, foreR * 0.68], [0.98, foreR * 0.7]])));
    if (!base) loft(mesh, forearmRings(-0.04, wrist, skinCount(8)), skinSides, { ...(limbs ? { bend: ruledBend(limbs.fore, 'fore', side, foreCover) } : {}), ...skinUv(`${side}Fore`), part: `${side}Fore` });
    mesh.covers[`${side}Fore`] = foreCover;
    // Sleeves follow the arm's own shape, deltoid and all, a little off it,
    // from as deep in the shoulder as the arm's skin starts.
    const upperArmRings = (from, to, rings) => tagged(`${side}Upper`, along(shoulder, elbow, armForward, rings, from, to, (t) => Math.max(upperDepth(t), upperR * 0.9), (t) => Math.max(upperWidth(t), upperR * 0.9)));
    const sleeveOf = (worn, role) => {
      if (!worn?.sleeve) return;
      // (Under a plate harness a sleeve is the arming doublet's, cut close to the arm: LOFT.harness.under.)
      const shape = plate ? { ...worn, sleeveLoose: Math.min(worn.sleeveLoose, LOFT.harness.under) } : worn;
      const outer = side === 'l' ? 1 : -1;
      let pattern = role;
      if (role === 'top' && top?.stripe) pattern = (ring, angle) => (Math.sin(angle) * outer > 0.85 ? 'stripe' : 'top');
      if (role === 'top' && top?.kind === 'flannel') pattern = (ring, angle, index, step) => (((index >> 1) + (step >> 1)) % 2 ? 'pattern' : 'top');
      if (role === 'top' && top?.kind === 'aloha') pattern = (ring, angle, index, step) => ((index * 3 + step * 5) % 7 === 0 ? 'pattern' : 'top');
      // A torn sleeve: a short coarse tube cut where this side's ends (one torn off at the shoulder).
      if (shape.torn) {
        loft(mesh, upperArmRings(-0.3, shape.sleeve, shape.torn.sleeveRings), shape.torn.sleeveSides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured && !base ? { bend: limbs.upper.mass } : {}), holes: (t, angle) => ragSleeveTorn(tear, side, t, angle) });
        return;
      }
      // A wide sleeve (`sleeveFlare`): close at the shoulder, widening down the arm to an open mouth that stands off the
      // forearm and hangs.
      if (shape.sleeveFlare) {
        const upper = upperArmRings(-0.3, 1.05, count(6));
        const elbow = Math.max(upper.at(-1).depth, upper.at(-1).width);
        const mid = shape.sleeveLoose * (1 + (shape.sleeveFlare - 1) * (1.35 / (shape.sleeve + 0.3)));
        const hang = shape.sleeveHang ?? 0;
        loft(mesh, bagged(widened(upper, 1.1, mid), 0, hang), sides, { color: pattern, ...FLARED });
        loft(mesh, bagged(widened(forearmRings(0.05, shape.sleeve - 1, count(4)), mid, shape.sleeveLoose * shape.sleeveFlare, hang ? 0 : elbow), hang, hang), sides, { color: pattern, ...FLARED, capEnd: hang > 0 });
        return;
      }
      // (Under a harness's pauldron the sleeve's head ends inside the cap, not above it.)
      loft(mesh, upperArmRings(plate ? LOFT.pauldron.from + 0.06 : -0.3, shape.sleeve > 1 ? 1.05 : shape.sleeve, count(6)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured && !base ? { bend: limbs.upper.mass } : {}) });
      if (shape.sleeve > 1) {
        loft(mesh, forearmRings(-0.06, shape.sleeve - 1, count(5)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured && !base ? { bend: limbs.fore.mass } : {}) });
        if (shape.ribbed || top?.kind === 'suit') loft(mesh, forearmRings(shape.sleeve - 1.07, shape.sleeve - 1, 1), sides, { color: top?.kind === 'suit' ? 'shirt' : 'trim', inflate: shape.sleeveLoose + 0.04, capStart: false, capEnd: false });
      }
    };
    if (topShape?.inner) sleeveOf(TOPS[topShape.inner], 'shirt');
    sleeveOf(topShape, 'top');
    if (lamellar) {
      // Sode: the great laced shoulder boards, hung beside the arm; kote: armoured cloth sleeves.
      boardOn(mesh, upperArmRings(-0.22, 0.72, count(4)), side === 'l' ? 1 : -1, 1.5, { rows: ['steel', 'lace'], board: { wide: 0.3, bow: 0.012 } }, kozane ? 'kozane' : null, armor.sode ?? 1);
      tablePiece(forearmRings(-0.04, wrist - 0.04, count(4)), 1.3, SPLINTED_SLEEVE, null, null, 'forearm');
    } else if (hoplomachus) {
      // The manica: a segmented guard down the sword arm only.
      if (side === 'r') {
        armorPiece(upperArmRings(-0.25, 1.02, count(7)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
        armorPiece(forearmRings(-0.06, wrist - 0.02, count(6)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
      }
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'upperArm', side)) {
        const rings = upperArmRings(from, to, count(Math.max(3, Math.round(7 * (to - from)))));
        if (paint?.board) boardOn(mesh, rings, side === 'l' ? 1 : -1, inflate, paint, DETAIL_MAPS.on && !lowDetail ? armourTileOf(tileKind, pieceMaterial(paint), 'upperArm') : null);
        else tablePiece(rings, inflate, paint, null, null, 'upperArm');
      }
      for (const [from, to, inflate, paint] of armorPieces(kit, 'forearm', side)) tablePiece(forearmRings(from, to <= 0 ? wrist + to : to, count(5)), inflate, paint, null, null, 'forearm');
    } else if (armor && armor.kind !== 'carrier') {
      const big = armor.joust ? LOFT.joust.pauldron : { riot: 1.6, heavyRiot: 1.85, plate: 1.65 }[armor.kind];
      // A jousting harness: mail at the armpit under the pauldron, the pauldron in lames (not in a crowd).
      if (armor.joust) loft(mesh, upperArmRings(LOFT.joust.mail[0], LOFT.joust.mail[1], count(3)), sides, { color: paintFor(MAIL, armor), inflate: LOFT.joust.mail[2], capStart: false, capEnd: false });
      const pauldron = upperArmRings(-0.2, 0.38, count(armor.joust ? 4 : 3));
      if (plate && !armor.joust) {
        const spec = LOFT.pauldron;
        const cap = upperArmRings(spec.from, spec.to, count(6));
        for (const ring of cap) {
          const next = Math.max(1, spec.flare.findIndex(([place]) => place >= ring.t));
          const [[a, low], [b, high]] = [spec.flare[next - 1], spec.flare.at(next)];
          ring.flare = low + (high - low) * Math.max(0, Math.min(1, (ring.t - a) / (b - a)));
        }
        loft(mesh, stiffen(mesh, cap, 'plate'), sides, { color: 'steel', shape: (ring) => ring.flare, capEnd: false });
        if (mesh.steelUv) harnessEdgesOn(mesh, cap.slice(-2), spec.flare.at(-1)[1], sides);
      } else if (plate) harnessPiece(pauldron, big);
      else armorPiece(pauldron, big);
      if (armor.joust && !lowDetail) lamesOn(mesh, pauldron, big, { lames: LOFT.joust.pauldronLames, base: 'steel' }, () => null);
      if (plate) harnessPiece(upperArmRings(0.36, 1.0, count(4)), LOFT.harness.limb);
      if (plate) harnessPiece(forearmRings(-0.12, 0.12, count(2)), LOFT.harness.cop, LOFT.harnessEdge.copLames);
      if (plate) harnessPiece(forearmRings(0.12, wrist - 0.06, count(4)), LOFT.harness.limb);
      else armorPiece(forearmRings(0.12, wrist - 0.06, count(4)), 1.42);
    }

    yield `${side} arm`;
    const hip = at(`${side}Hip`);
    const knee = at(`${side}Knee`);
    const foot = at(`${side}Foot`);
    const thighR = seg[`${side}Thigh`].skinRadius * limbFatter(`${side}Thigh`);
    const shankR = seg[`${side}Shank`].skinRadius * limbFatter(`${side}Shank`);
    const legForward = frames[BONE[`${side}Thigh`]].x;
    const thighRings = (from, to, rings) => tagged(`${side}Thigh`, along(hip, knee, legForward, rings, from, to,
      sculptProfile([[-0.14, thighR * 1.0], [0.1, thighR * 1.18], [0.5, thighR * 1.0], [0.92, thighR * 0.66], [1, shankR * 0.92]]),
      sculptProfile([[-0.14, thighR * 1.0], [0.1, thighR * 1.1], [0.5, thighR * 0.95], [1, shankR * 0.9]]),
      sculptProfile([[0, 0], [0.5, thighR * 0.08], [1, 0]])));
    // The legs of the bottom: how far down the thigh, then the shin, it runs.
    // (Hakama worn long, `long`: untied, falling full to the ankle.)
    const longHakama = bottom?.kind === 'hakama' && bottom.long;
    const legReach = longHakama ? [1.04, 0.9] : { hakama: [1.04, 0.3], bloomers: [0.42, 0], trunks: [0.42, 0], longShorts: [0.62, 0], splitShorts: [0.28, 0], hikingShorts: [0.55, 0], tights: [1.04, 0.92], trackPants: [1.04, 0.9], pants: [1.04, 0.9], slacks: [1.04, 0.92], jeans: [1.04, 0.9], cargo: [1.04, 0.9], joggers: [1.04, 0.9], bunker: [1.04, 0.93], ragTrousers: [1.04, RAGS.trousers.hem + RAGS.trousers.jag * 1.7] }[bottom?.kind] ?? [0, 0];
    const legs = sculpted ? { thigh: limbShapes(traits, 'thigh', side, legReach[0] > 0 ? [[-0.3, legReach[0]]] : [], armoured), shank: limbShapes(traits, 'shank', side, legReach[1] > 0 ? [[-0.3, legReach[1]]] : [], armoured) } : null;
    if (base) baseParts[`${side}Thigh`] = { a: hip, b: knee, forward: legForward, ...ringProfiles((t) => thighRings(t, t, [t])[0], hip, knee, legForward), bend: limbShapes(baseTraits, 'thigh', side).mass };
    else loft(mesh, thighRings(-0.14, 1.0, skinCount(10)), skinSides, { ...(legs ? { bend: ruledBend(legs.thigh, 'thigh', side, legReach[0] > 0 ? [[-0.3, legReach[0]]] : []) } : {}), ...skinUv(`${side}Thigh`), part: `${side}Thigh` });
    mesh.covers[`${side}Thigh`] = legReach[0] > 0 ? [[-0.3, legReach[0]]] : [];
    const legLoose = { hakama: 1.3, bloomers: 1.32, tights: 1.03, trackPants: 1.14, splitShorts: 1.06, trunks: 1.08, longShorts: 1.1, ragTrousers: 1.24, bunker: 1.3 }[bottom?.kind] ?? 1.12;
    const outer = side === 'l' ? 1 : -1;
    const legPattern = (ring, angle) => {
      // (A pleat's fold lies in its neighbour's shade.)
      if ((pleatAt(ring, angle) ?? 1) < LOFT.hakama.shade) return 'trim2';
      if (bottom?.stripe && Math.abs(Math.sin(angle)) > 0.9) return 'trim2';
      if (bottom?.kind === 'cargo' && ring.t > 0.35 && ring.t < 0.62 && Math.sin(angle) * outer > 0.55) return 'trim2';
      return 'kit';
    };
    const bendThigh = legs && !armoured && !base ? { bend: legs.thigh.mass } : {};
    if (bottom?.under) loft(mesh, thighRings(-0.05, 0.4, count(3)), sides, { color: 'under', inflate: 1.05, capStart: false, capEnd: false, ...bendThigh });
    // (Rags: a plain coarse tube down the thigh, LOFT.rags.)
    const ragLeg = bottom?.kind === 'ragTrousers' ? LOFT.rags : null;
    if (longHakama && !skirted) loft(mesh, pleated(widened(thighRings(-0.05, 1.04, count(9)), legLoose, LOFT.hakama.knee, thighR * 0.8), LOFT.hakama.pleats, LOFT.hakama.fold), sides, { color: legPattern, ...FLARED });
    else if (legReach[0] > 0 && !skirted) loft(mesh, thighRings(-0.05, legReach[0], ragLeg ? ragLeg.thigh : count(Math.max(3, Math.round(9 * legReach[0])))), ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: legLoose, capStart: false, capEnd: false, ...bendThigh });
    // Hakama (the hitatare's trousers): full, bloused out at the knee where they are tied over the shin guards.
    if (bottom?.kind === 'hakama' && !skirted && !longHakama) loft(mesh, thighRings(0.72, 1.06, count(3)), sides, { color: 'kit', inflate: 1.48, capStart: false, capEnd: false });
    // Bloomers end in a lace frill round the thigh.
    if (bottom?.kind === 'bloomers') loft(mesh, thighRings(legReach[0] - 0.02, legReach[0] + 0.06, 2), sides, { color: 'trim2', inflate: legLoose + 0.08, capStart: false, capEnd: false });
    if (lamellar) {
      // Haidate: laced apron plates down the thigh.
      armorPiece(thighRings(0.25, 0.85, count(5)), 1.3, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
    } else if (hoplomachus) {
      // Ocreae: high greaves, up over the knee.
      armorPiece(thighRings(0.68, 1.05, count(3)), 1.34, 'steel');
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'thigh', side)) tablePiece(thighRings(from, to, count(Math.max(2, Math.round(8 * (to - from))))), inflate, paint, null, null, 'thigh');
      for (const [from, to, inflate, paint] of armorPieces(kit, 'knee', side)) tablePiece(thighRings(from, to, count(2)), inflate, paint, null, null, 'knee');
    } else if (armor) {
      if (plate) harnessPiece(thighRings(-0.05, 0.84, count(5)), LOFT.harness.thigh);
      // The tasset: lames hung from the fauld over the front and outer side of the thigh, moving with it.
      // (Under a surcoat's or a huque's skirt they are not seen.)
      if (plate && !armor.over) tassetOn(mesh, thighRings(LOFT.tasset.from, armor.joust ? LOFT.joust.tassetTo : LOFT.tasset.to, count(armor.joust ? 6 : 4)), side === 'l' ? 1 : -1, armor.joust ? LOFT.joust.tassetLames : LOFT.tasset.lames);
      if (armor.kind === 'heavyRiot') armorPiece(thighRings(0.05, 0.7, count(3)), 1.35);
      if (plate) harnessPiece(thighRings(0.82, 1.05, count(2)), LOFT.harness.cop, LOFT.harnessEdge.copLames);
      else armorPiece(thighRings(0.82, 1.05, count(2)), 1.45, 'pad');
    }
    // Shin and calf: the calf sits high and behind.
    // The shin starts inside the thigh, so the knee bends without a seam.
    const shinRings = (from, to, rings) => tagged(`${side}Shin`, along(knee, foot, frames[BONE[`${side}Shin`]].x, rings, from, to,
      sculptProfile([[-0.12, shankR * 0.6], [0, shankR * 0.92], [0.28, shankR * 1.1], [0.7, shankR * 0.7], [0.97, shankR * 0.5]]),
      sculptProfile([[-0.12, shankR * 0.6], [0, shankR * 0.9], [0.28, shankR * 0.98], [0.97, shankR * 0.52]]),
      sculptProfile([[0, 0], [0.28, -shankR * 0.18], [0.7, -shankR * 0.05], [1, 0]])));
    if (base) baseParts[`${side}Shin`] = { a: knee, b: foot, forward: frames[BONE[`${side}Shin`]].x, ...ringProfiles((t) => shinRings(t, t, [t])[0], knee, foot, frames[BONE[`${side}Shin`]].x), bend: limbShapes(baseTraits, 'shank', side).mass };
    else loft(mesh, shinRings(-0.12, 0.97, skinCount(10)), skinSides, { ...(legs ? { bend: ruledBend(legs.shank, 'shin', side, legReach[1] > 0 ? [[-0.3, legReach[1]]] : []) } : {}), ...skinUv(`${side}Shin`), part: `${side}Shin` });
    mesh.covers[`${side}Shin`] = legReach[1] > 0 ? [[-0.3, legReach[1]]] : [];
    // A plate greave covers the shin: the hose under it is not drawn (it stands wider than the greave at the ankle and showed through).
    if (legReach[1] > 0 && !skirted && !plate) {
      // Trousers fall straight to the shoe; joggers and track pants gather.
      const gathered = bottom.kind === 'joggers' || bottom.kind === 'trackPants';
      // Breeches cut off ragged below the knee (outfits.js RAGS): a coarse tube, whole quads gone at the hem.
      const ragged = ragLeg ? { holes: (t, angle) => ragHemTorn(ragTear(body.inputs.outfit), side, t, angle) } : {};
      // (On the base mesh tagged as the shin's, so the skin a closed trouser leg covers is left out, as under the shorts.)
      const straight = along(knee, foot, frames[BONE[`${side}Shin`]].x, ragLeg ? ragLeg.shin : count(8), longHakama ? -0.1 : -0.14, legReach[1], () => shankR * 1.12, () => shankR * 1.1);
      // (Long hakama: from just inside the leg's own breadth at the knee, fuller to the hem.)
      const trouserRings = longHakama ? pleated(widened(straight, 0.97, LOFT.hakama.hem, thighR * 0.8 * LOFT.hakama.knee), LOFT.hakama.pleats, LOFT.hakama.fold) : straight;
      if (longHakama) loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings, sides, { color: legPattern, ...FLARED });
      else loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings, ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: bottom.kind === 'tights' ? 1.0 : gathered ? 1.12 : ragLeg ? ragLeg.shinLoose : bottom.kind === 'bunker' ? 1.32 : 1.22, capStart: false, capEnd: false, ...ragged });
      if (gathered) loft(mesh, shinRings(legReach[1] - 0.08, legReach[1], 1), sides, { color: 'trim2', inflate: 1.15, capStart: false, capEnd: false });
    }
    if (lamellar) {
      // Suneate: splinted shin guards.
      tablePiece(shinRings(0.04, 0.86, count(5)), 1.3, SPLINTED_SHIN, null, null, 'shin');
    } else if (hoplomachus) {
      armorPiece(shinRings(-0.14, 0.9, count(6)), 1.32, (ring, angle, index) => (index === 0 ? 'gold' : 'steel'));
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'shin', side)) tablePiece(shinRings(from, to, count(Math.max(2, Math.round(7 * (to - from))))), inflate, paint, null, null, 'shin');
    } else if (armor) {
      if (plate) harnessPiece(shinRings(-0.12, 0.12, count(2)), LOFT.harness.cop);
      else armorPiece(shinRings(-0.12, 0.12, count(2)), 1.45, 'pad');
      if (plate) harnessPiece(shinRings(0.1, 0.95, count(4)), LOFT.harness.limb);
      else if (armor.kind !== 'carrier') armorPiece(shinRings(0.1, 0.8, count(4)), 1.35);
    }
    // Boot shafts up the shin; heels for a woman in business dress.
    const feet = (female && look.femaleFeet) || look.feet || {};
    // Shafts up the shin: an ankle boot just over the ankle bone.
    // A rider's boot (`over`) is pulled on over the trousers: its shaft as straight and full as they are, a little outside them.
    const shaft = { boxingBoot: [feet.high ? 0.45 : 0.62, 1.2], hikingBoot: [0.74, 1.36], compactBoot: [0.76, 1.3], tacticalBoot: [0.66, 1.36], heelAnkleBoot: [0.74, 1.2], jinBoot: [0.3, 1.28], ridingBoot: [0.04, 1.3, 'over'] }[feet.kind];
    const shaftRings = shaft?.[2] === 'over' ? along(knee, foot, frames[BONE[`${side}Shin`]].x, count(4), shaft[0], 0.98, (t) => shankR * (1.14 - 0.03 * t), (t) => shankR * (1.12 - 0.03 * t)) : shaft && shinRings(shaft[0], 0.98, count(3));
    if (shaft && !plate) loft(mesh, shaftRings, sides, { color: 'boot', inflate: shaft[1], capStart: false, capEnd: false });
    if (feet.socks) loft(mesh, shinRings(0.66, 0.75, 1), sides, { color: 'sock', inflate: 1.28, capStart: false, capEnd: false });
  }

  if (base?.measure) return { baseParts };
  if (baseRig) {
    addBaseSkin(mesh, baseRig, baseParts, baseTraits, textured, body.heightM, baseStarvation(body), baseJoints, lowDetail ? null : rulesTraits(body), baseWasting(body), lowDetail ? 0 : baseNeckGirth(body), lowDetail || !BASE_BODY.family.use ? null : baseFamilyWeights(body, baseRig.height), baseBreadth.across);
    fitClothToBase(mesh, baseParts, armoured);
    ridePieces(mesh);
    clearBoards(mesh);
  }
  retile(mesh);
  // What the armour covers of each skin part (the pieces lofted over it, see loft), the margin taken off each end of every stretch.
  // (On the base mesh, closed cloth hides the skin under it too: the modelled body stands out of the rings the cloth is lofted on.)
  const covered = (armor || baseRig) && mesh.cover ? coverTable(mesh.cover, { trunk: [at('pelvis'), at('neck')], neck: [at('neck'), at('head')], ...Object.fromEntries(['l', 'r'].flatMap((side) => [[`${side}Upper`, [at(`${side}Shoulder`), at(`${side}Elbow`)]], [`${side}Fore`, [at(`${side}Elbow`), at(`${side}Hand`)]], [`${side}Thigh`, [at(`${side}Hip`), at(`${side}Knee`)]], [`${side}Shin`, [at(`${side}Knee`), at(`${side}Foot`)]]])) }) : null;
  if (covered && baseRig) closeCoveredJoints(covered, mesh.cover);
  if (coverOnly) return { covered };
  yield 'lofted';
  let { positions, indices, colors, bones, weightPositions, stiff } = mesh;
  // (The base mesh's bone-heat weights per point, the skin's own and each worn point's from the skin beneath it: baseHeatWeights.)
  let heat = mesh.heat ? clothHeat(mesh) : null;
  if (faceted) ({ positions, indices, colors, bones, weightPositions, stiff } = facet(positions, indices, colors, bones, weightPositions, stiff));
  let positionArray = Float32Array.from(positions);
  let indexArray = Uint32Array.from(indices);
  if (!faceted) {
    // Smooth the skin only: cloth tubes are all open edges, and relaxing an
    // open edge pulls it in — hems would sink into the body beneath them.
    const loose = Float32Array.from(positionArray);
    positionArray = relax({ positions: positionArray, indices: indexArray }, fine ? SCULPT.relaxPasses : LOFT.relaxPasses, fine ? SCULPT.relaxAmount : LOFT.relaxAmount, mesh.welds).positions;
    yield 'relaxed';
    colors.forEach((region, vertex) => {
      // (The base mesh is a modelled surface, already smooth: relaxing it would only soften its forms.)
      if (region !== 'skin' || (mesh.base && vertex >= mesh.base.start)) positionArray.set(loose.subarray(vertex * 3, vertex * 3 + 3), vertex * 3);
    });
  }
  // A textured part's seam is one line of points drawn twice: the same normal on both.
  const smoothNormals = () => {
    const result = computeNormals(positionArray, indexArray);
    for (const [copy, original] of mesh.welds) {
      const sum = [0, 1, 2].map((axis) => result[copy * 3 + axis] + result[original * 3 + axis]);
      const length = Math.hypot(...sum) || 1;
      for (let axis = 0; axis < 3; axis += 1) result[copy * 3 + axis] = result[original * 3 + axis] = sum[axis] / length;
    }
    if (mesh.base) weldBaseNormals(result, mesh.base, indexArray);
    return result;
  };
  let normals = smoothNormals();
  yield 'normals';
  if (wrapping && !armoured) {
    // The legs' joins (trunk to thigh, the knee) by the fillet; the upper body by the field.
    const bare = new Float32Array(positionArray.length / 3).fill(1);
    for (const [name, [from, to]] of Object.entries(mesh.parts)) {
      const covers = (mesh.covers[name] ?? []).map(([low, high]) => [name === 'trunk' ? -5 : low - 0.04, high + 0.04]);
      for (let vertex = from; vertex < to; vertex += 1) bare[vertex] = sculptCoverShare(covers, mesh.ringT[vertex], 0.05);
    }
    normals = yield* filletParts(positionArray, normals, mesh.parts, colors, mesh.welds, smoothNormals, bare, FILLET.pairs.filter(([a, b]) => /Thigh|Shin/.test(a + b)));
    yield 'filleted';
    normals = yield* wrapOnField(positionArray, normals, mesh, colors, wrap, smoothNormals, (vertex) => {
      // The outline's own features (the starved belly sunk under the ribs, the collarbones, the blades) on the trunk, not under cloth.
      const t = mesh.ringT[vertex];
      return trunkSilhouette(rulesOf, t, mesh.ringA[vertex]) * sculptCoverShare(coveredTrunk, t, 0.05);
    });
  } else if (fillet && sculpted && !armoured) {
    // Under cloth the skin is not blended: pushed out, it would come through the shorts or a sleeve.
    const bare = new Float32Array(positionArray.length / 3).fill(1);
    for (const [name, [from, to]] of Object.entries(mesh.parts)) {
      // On the trunk, everything below the top of the shorts as well (a hanging belly lies over them).
      const covers = (mesh.covers[name] ?? []).map(([low, high]) => [name === 'trunk' ? -5 : low - 0.04, high + 0.04]);
      for (let vertex = from; vertex < to; vertex += 1) bare[vertex] = sculptCoverShare(covers, mesh.ringT[vertex], 0.05);
    }
    normals = yield* filletParts(positionArray, normals, mesh.parts, colors, mesh.welds, smoothNormals, bare);
  }
  // Texture coordinates: the parts that have them, and everything else on a flat patch of the map.
  let uvs = null;
  // (Not only the textured styles': a piece drawn with the detail maps carries its own, detailmaps.js.)
  if (textured || mesh.uvs.size) {
    uvs = new Float32Array((positionArray.length / 3) * 2);
    for (let vertex = 0; vertex < positionArray.length / 3; vertex += 1) uvs.set(mesh.uvs.get(vertex) ?? FLAT_UV, vertex * 2);
  }
  // How loose the cloth hangs, point by point (measured while the skin under it is still here); not on a crowd's body.
  let sway = lowDetail ? null : looseness(positionArray, colors, stiff);
  // Under armour (`hideCovered`): the skin the pieces cover is left out (every triangle of it), and the points no triangle uses.
  let hidden = 0;
  if (hideCovered && covered) {
    const inside = new Uint8Array(positionArray.length / 3);
    for (const [name, [from, to]] of Object.entries(mesh.parts)) {
      for (const [low, high] of covered[name] ?? []) for (let vertex = from; vertex < to; vertex += 1) if (mesh.ringT[vertex] > low && mesh.ringT[vertex] < high) inside[vertex] = 1;
    }
    // (On the base mesh, a piece's points under another piece: keepLayersInside.)
    for (const vertex of mesh.underLayer ?? []) inside[vertex] = 1;
    // (On the base mesh the belly's dome is never left out under a waistband, to its very edge: it hangs over it, and lifts off
    // it in a landing, showing the skin beneath.)
    if (mesh.base?.swell) mesh.base.swell.forEach((swell, index) => {
      if (swell > 0) inside[mesh.base.start + index] = 0;
    });
    // (Nor, on a family body, the trunk's skin no piece lies over: skinInTheOpen.)
    mesh.base?.open?.forEach((open, index) => {
      if (open) inside[mesh.base.start + index] = 0;
    });
    // (On the base mesh, the shoulder's cap the trunk carries is the arm's: covered where a closed sleeve or a pauldron covers the
    // arm's root.)
    if (mesh.base?.armFlesh) {
      mesh.base.armFlesh.forEach((arm, index) => {
        const trunkTop = (mesh.cover.trunk ?? []).some(([, high]) => high >= LOFT.closedJoint.top.trunk);
        const closes = arm === 'trunk' ? trunkTop : trunkTop || (covered[arm] ?? []).some(([low]) => low <= LOFT.closedJoint.root);
        if (arm && closes) inside[mesh.base.start + index] = 1;
      });
      // (And the trunk's own skin above the shoulder line, away from the front neckline (LOFT.collar.from), under a trunk piece
      // reaching the trunk's top: its collar is carried up the trapezius over it (raiseCollars), and the skin there, left in,
      // showed in patches on a coat's shoulders where the collar meets the shirt's sleeve.)
      const trunkTop = (mesh.cover.trunk ?? []).some(([, high]) => high >= LOFT.closedJoint.top.trunk);
      const [from, to] = mesh.parts.trunk ?? [0, 0];
      if (trunkTop) {
        for (let vertex = Math.max(from, mesh.base.start); vertex < to; vertex += 1) {
          const angle = Math.atan2(Math.sin(mesh.ringA[vertex]), Math.cos(mesh.ringA[vertex]));
          if (mesh.ringT[vertex] >= LOFT.closedJoint.top.trunk && Math.abs(angle) > LOFT.collar.from) inside[vertex] = 1;
        }
      }
    }
    const kept = [];
    for (let corner = 0; corner < indexArray.length; corner += 3) {
      const [a, b, c] = [indexArray[corner], indexArray[corner + 1], indexArray[corner + 2]];
      if (inside[a] && inside[b] && inside[c]) hidden += 1;
      else kept.push(a, b, c);
    }
    if (hidden) {
      const used = new Int32Array(inside.length).fill(-1);
      let next = 0;
      for (const vertex of kept) if (used[vertex] < 0) used[vertex] = next++;
      const order = new Int32Array(next);
      used.forEach((to, from) => {
        if (to >= 0) order[to] = from;
      });
      const pick = (array, width) => {
        const out = new array.constructor(next * width);
        for (let to = 0; to < next; to += 1) for (let axis = 0; axis < width; axis += 1) out[to * width + axis] = array[order[to] * width + axis];
        return out;
      };
      positionArray = pick(positionArray, 3);
      normals = pick(normals, 3);
      if (uvs) uvs = pick(uvs, 2);
      weightPositions = Array.from(order, (from) => [weightPositions[from * 3], weightPositions[from * 3 + 1], weightPositions[from * 3 + 2]]).flat();
      colors = Array.from(order, (from) => colors[from]);
      bones = Array.from(order, (from) => bones[from]);
      stiff = Array.from(order, (from) => stiff[from]);
      if (sway) sway = pick(sway, 1);
      if (heat) heat = Array.from(order, (from) => heat[from]);
      indexArray = Uint32Array.from(kept, (vertex) => used[vertex]);
    }
  }
  // The painted ribs (LOFT.ribBand): each trunk skin point darkened in the rules' grooves and hollows, lit on their ridges.
  let tint = null;
  if (ribBand) {
    const band = LOFT.ribBand;
    tint = new Float32Array(positionArray.length).fill(1);
    const [from, to] = mesh.parts.trunk;
    for (let vertex = from; vertex < to; vertex += 1) {
      const t = mesh.ringT[vertex];
      const angle = mesh.ringA[vertex];
      // (Read where the rib this ring follows runs at this angle, so a crest ring stays on the crest all the way round.)
      const onRib = t > band.span[0] && t < band.span[1] ? t - (ribDroop(angle) - band.droop) : t;
      const shade = band.shade * trunkRule(starvedRules, onRib, angle).h + band.hollow * trunkSilhouette(starvedRules, t, angle);
      tint.fill(Math.min(band.light, Math.max(band.dark, 1 + shade)), vertex * 3, vertex * 3 + 3);
    }
  }
  // `rigid`: vertices carried by the chest bone alone (a breastplate and what is under it); `firm`: those and every stiff
  // body's (no flesh to dent, nothing to slosh).
  const rigid = bones.map((list) => list === chestOnly);
  const firm = rigid.map((flag, vertex) => flag || Boolean(stiff[vertex]));
  yield 'skin weights';
  const weights = yield* skinWeightsSteps(Float32Array.from(weightPositions), frames, bones);
  // (Rows and a coat's rings take the cloth's weights first, as what is under them does, and are made hoops of afterwards.)
  if (heat) baseHeatWeights(weights, heat, weightPositions, frames, bones.map((list, vertex) => list === chestOnly || ['plate', 'hung'].includes(mesh.kinds.get(stiff[vertex]))));
  else if (baseRig) blendShoulders(weights, weightPositions, frames, baseParts);
  stiffWeights(weights, stiff, mesh.kinds);
  // The base mesh's fat masses that follow the frame (fatslosh.js): an overweight trunk and up, not in a crowd; each point by the
  // share the trunk's bones carry of it (an arm or a thigh lying against the belly or a breast is not moved with it), not a rigid plate.
  const figures = baseRig && !lowDetail ? sloshFigures(fatLayer) : null;
  const trunkBones = new Set([BONE.pelvis, BONE.spine, BONE.chest]);
  const trunkShare = figures ? Float32Array.from(firm, (_, vertex) => [0, 1, 2, 3].reduce((sum, slot) => sum + (trunkBones.has(weights.skinIndex[vertex * 4 + slot]) ? weights.skinWeight[vertex * 4 + slot] : 0), 0)) : null;
  const slosh = figures ? baseSlosh(figures, positionArray, firm, baseParts.trunk, baseBellyShape, trunkShare, { positions: mesh.positions, regions: mesh.colors }) : null;
  // `regions` names what each vertex is (skin, kit, band, top) for painting.
  return {
    positions: positionArray, normals, indices: indexArray, regions: colors, rigid, ...(uvs ? { uvs } : {}), ...weights, bindFrames, bindPoints: bindAt,
    ...(covered ? { covered } : {}), ...(hidden ? { hiddenTriangles: hidden } : {}), ...(tint ? { tint } : {}), ...(slosh ? { slosh } : {}),
    // (A base-mesh body, not a crowd's, is drawn skinned by dual quaternions: render.js SKIN_DQ, dqskin.js.)
    ...(baseRig && !lowDetail ? { dualQuaternion: true } : {}),
    ...(sway ? { sway } : {}),
  };
}

/**
 * The covered stretches of each part ({ part: [[from, to]...] }, t along it) from the pieces lofted over it: overlapping pieces joined,
 * then LOFT.cover.margin (m, as t by the part's length from `ends`) taken off each end; a stretch shorter than two margins covers nothing.
 */
function coverTable(cover, ends) {
  const table = {};
  for (const [name, pieces] of Object.entries(cover)) {
    const [a, b] = ends[name];
    const margin = LOFT.cover.margin / vec.length(vec.sub(b, a));
    const joined = [];
    for (const [from, to] of [...pieces].sort((p, q) => p[0] - q[0])) {
      const last = joined.at(-1);
      if (last && from <= last[1]) last[1] = Math.max(last[1], to);
      else joined.push([from, to]);
    }
    const stretches = joined.map(([from, to]) => [from + margin, to - margin]).filter(([from, to]) => to > from);
    if (stretches.length) table[name] = stretches;
  }
  return table;
}
