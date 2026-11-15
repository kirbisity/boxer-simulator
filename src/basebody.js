// The fighters' skin from the modelled base meshes (body style 'base', bodystyles.js; 2026-11-10): the modelled
// human body itself, without its head, hands and feet (the game's own cover them). The mesh (src/basebody-data.js, made by
// tools/blender/basebody.py) was modelled at one build of each sex, its `reference`; a fighter of that build gets it as
// modelled, scaled to his height, its arms turned into the rig's A-pose by the tool, and nothing else.
//
// Other builds change it gently, keeping its contour (2026-11-11: the model, used simply and faithfully):
//   - its joints move as the game's do: each of the mesh's own joints by how this body's bind-pose joint (rig.js bindPoints)
//     lies from the reference's, so height and frame lengthen and shorten the parts along their bones, not across; each limb
//     then runs in the model's own direction at the game's length, and the loft (clothes) and the rig are built on those
//     joints, not the rig's straight A-pose (baseBindJoints: the rig follows the model);
//   - each point is scaled out from its part's axis by a ratio, this body's ring over the reference's at its place along the
//     part (loftbody.js: the rings the plain skin is drawn on; their depth ratio fore and aft, their width ratio across, the
//     trunk's lean the difference of the two), smoothed along the part, so fat and muscle swell the modelled shape as a whole;
//   - the fat belly's dome and the starved contour are added on top, out along the point's own line from the axis;
//   - fat smooths the muscle relief modelled in the mesh (a fighter shows it by how defined he is against the reference).
// Points near a joint carry both parts and blend between them (the tool's `blend`), so the parts meet without a step.
//
// The texture coordinates are the loft's (skindetail.js detailUv at the point's part, t and angle), so skintex.js paints the
// mesh as it paints the loft. Triangles across a part's seam (angle 0, its front) are split there, and a triangle is drawn in
// one part's tile: its points from another part are drawn twice, once per tile, welded for the normals.
//
// No Three.js: plain numbers, built in the skin worker with the rest of the loft.

import { BASE_BODY_DATA } from './basebody-data.js';
import { faceMorphWeights } from './facemorph.js';
import { detailUv } from './skindetail.js';
import { vec } from './pose.js';

export const BASE_BODY = {
  // Each skin part's axis, from joint to joint (rig.js bindPoints names; the base mesh's own joints are named the same).
  axes: {
    trunk: ['pelvis', 'neck'], neck: ['neck', 'head'],
    lUpper: ['lShoulder', 'lElbow'], lFore: ['lElbow', 'lHand'], rUpper: ['rShoulder', 'rElbow'], rFore: ['rElbow', 'rHand'],
    lThigh: ['lHip', 'lKnee'], lShin: ['lKnee', 'lFoot'], rThigh: ['rHip', 'rKnee'], rShin: ['rKnee', 'rFoot'],
  },
  // A part's rings are read from a table of this many stops along the part's span, linearly between them (the loft's profiles
  // are smooth on that scale: their stops are a tenth of a part apart).
  stops: 64,
  // Each part's span of t, its points' own, widened this far either end (its rings read a little past them).
  spanMargin: 0.05,
  // Fat hides the muscle's relief modelled in the mesh: the mesh's surface low-passed (`smoothPasses` rounds of Taubin
  // smoothing, `smoothStep` in and `smoothBack` out each round, which keeps the volume) is what a fat layer leaves, and a fighter
  // shows the relief by how defined his part is against how defined the reference was (sculpt.js definedFrom, definedTo: the
  // fat over which a muscle's edges go). Eight rounds spread over about three edges (5 cm): a muscle's breadth.
  smoothPasses: 8,
  smoothStep: 0.5,
  smoothBack: -0.53,
  // A part's girth ratio is smoothed along it over this many stops either way (0.12 of the part: a ring's profile turns at the
  // loft's stops, a tenth of a part apart, and a ratio taken stop by stop would print them as bands).
  ratioSmooth: 8,
  // The forearm's skin ends at the modelled wrist, and the game's hand (wardrobe.js buildHand) is drawn on the rig's hand point,
  // the fist's middle (0.19 of height from the elbow; the model's wrist lies 0.14 from it, the anatomical 0.146 of Drillis and
  // Contini: the rig's point is right, the drawn palm short, its heel only 3.3 cm behind the point). So the forearm is drawn
  // out to `handSeat` (m per 1.8 m of height) behind the hand point, under the palm's rounded heel (its section there 2.3 by
  // 2.9 cm, a wrist's), not to the fist's middle. The upper arm runs at the game's length too. The length either gains is laid
  // on in the shaft's middle, between `stretch[0]` and `[1]` of the part (with a smooth rise and fall, 1 - cos), and both
  // ends keep the model's own scale: the elbow's point and crease, the deltoid's insertion, the forearm's swell below the elbow
  // and the wrist's slimness. Stretched evenly (2026-11-11: the arms read as rubber tubes), the joints'
  // forms were drawn out with the shafts and the arm lost its hinge.
  handSeat: 0.021,
  stretch: [0.2, 0.85],
  // An arm's own reach (loftbody.js LOFT.fit's): this share of its ring's radius round its axis, from `armFrom` (t, above the
  // shoulder joint) down.
  armReach: 1.6, armFrom: -0.25,
  // How much of a part's swell (or thinning) against the reference is laid on along the model's surface normals rather than
  // round the part's axis (placeBaseBody): all of it.
  offsetAlongNormal: 1,
  // The normals it is laid along are the surface's after this many rounds of Laplacian smoothing (about the square root as many
  // edges, 10 cm on a man: broader than a pec's or a breast's under-curve, narrower than the trunk's own turn round its sides).
  normalPasses: 40,
  // The emaciated reference's contour is faded out over the shoulder's cap: within `starveArm[0]` of an upper arm's ring radius
  // round its axis (from armFrom down) none of it, from `starveArm[1]` (its reach, armReach) all. Its figure stood with one hand
  // on the hip and the other arm hanging (tools/blender/emaciated.py), its shoulders shrugged and turned, so the delta there is
  // its pose, not its wasting: ±2 cm lumps on a starved man's shoulders. Its collarbones and the ribs below stay. (Round 15,
  // noted: a starved shoulder still had the model's thickness. With the arms lowered by D's rest shape the lumps are gone,
  // and the fade now runs from 0.3 to 0.8 of the arm's ring radius: her bony cap, 1 cm lower over a starved man's joint.)
  starveArm: [0.3, 0.8],
  // The trunk's drawn anatomy (the rules', and her bone relief: baseStarvedDetail) is faded over the shoulder's cap at the sides
  // (`side`, t of the trunk, where |sin| of the angle passes `sideFrom`): those triangles are drawn in the arm's tile, which has
  // none, so a patch of ribs would end in a polygon on the back.
  starveDetail: { side: [0.66, 0.8], sideFrom: 0.55 },
  // Each limb's parent at its root, and where on the parent the joint is (its t): the upper arm on the trunk at the shoulders
  // (the shoulder joint stands 0.91 of the way up the trunk: rig.js bindPoints, 0.025 of height under the neck's foot on a
  // 0.27 trunk), the forearm on the upper arm at the elbow, the thigh on the trunk at the hip joint, the shin on the thigh at the
  // knee, the neck on the trunk at its foot. ('side*' names stand for both sides, '*' the side.)
  joins: { sideUpper: ['trunk', 0.91], sideFore: ['*Upper', 1], sideThigh: ['trunk', 0], sideShin: ['*Thigh', 1], neck: ['trunk', 1] },
  // The ease from the parent's ratio into the part's own: from `joinRatio[0]` to `[1]` (t of the part).
  joinRatio: [-0.25, 0.3],
  // A slit in the modelled surface (closeSlits): an inner hole whose roundness (4π·area / perimeter², 1 for a circle) is under
  // this. The male mesh as exported has one behind each lower shin, two thin holes meeting at a point, rows of points up to
  // 5 mm apart that share no edge; the mesh's own open ends, the neck's, the wrists' and the soles' cuts, are round (0.89 and
  // up). Its sides were offset along normals smoothed apart (no edge joins them), and a fat man's calf opened it into specks
  // of the background and flaps of skin.
  slitRoundness: 0.3,
  // The shoulder's design (2026-11-11: the base shoulder was too wide and bulky against the game's own, v7). Five
  // ways were tried ('A'..'E', all acting in one zone, shoulderZone), then D's grown into D+ (shoulderPlus 'D1', 'D2'); the
  // user's choice, shipped to the test page, is 'D2' (with its chest, round 13, and her own overrides, round 14). null draws
  // the model as it is; the others stay selectable for the body sheet (?shoulder=…, 'none' for null).
  //   A graft:  the zone's points laid onto the loft's own surface (the trunk's top ring and the upper arm's root, v7's rings).
  //   B girdle: the zone moved in towards the midline by `girdleIn` and down by `girdleDrop` (m per 1.8 m of height), the
  //             deltoid's bulk beyond the arm's ring scaled by `deltoidScale` on its outer side.
  //   C girth:  the zone's smoothed surface driven onto the loft's rings, the mesh's own detail carried on it.
  //   D rebind: the model's arms lowered `rebindDegrees` about its shoulders by its own bone-heat weights before anything else,
  //             and that taken as its rest shape: a shoulder modelled lowered, bound in the game's hang.
  //   E muscle: as C, but of the model's bulk over the loft's rings only the share this body's arm muscle shows is taken off
  //             (the model read as a bodybuilder's: a bodybuilder keeps all of it, a thin man next to none).
  shoulder: 'D2',
  // The zone: the trunk's top from `trunkT[0]` to `[1]` (eased: about 5 cm on a man), where its point's |sin| round the ring
  // passes `lateral[0]` to `[1]` (the sides: not the chest's middle or the neck); the upper arm down to `armT` (eased: the root's
  // third), within `armReach` of its ring's radius of its axis.
  shoulderZone: { trunkT: [0.8, 0.9], lateral: [0.35, 0.75], armT: [0.2, 0.38], armReach: [1.6, 2.2], armRoot: -0.1 },
  girdleIn: 0.015, girdleDrop: 0.01, deltoidScale: 0.85,
  // (The designs' moves smoothed over this many rounds, about three edges, 4-5 cm on a man.)
  shoulderSmooth: 8,
  // (The model's upper arm hangs 25 degrees from the vertical, the game's 11 (tools/bodysheet-page.js SHEET.armRest).)
  rebindDegrees: 14, rebindClavicle: 0.35,
  // The emaciated reference's upper-arm girth (m, her free arm at 1.68 m: tools/blender ax_model, measured round 15: 20.0 and
  // 18.0 cm round its section at 30% and 70% of its length, here as 2π times the mean distance off the arm's axis, which reads
  // about a sixth less than the section's length on our arms), the floor D+ thins an arm to (shoulderPlus); a man's by `maleGirth` (the base meshes' male to female
  // shoulder-width ratio).
  armFloor: [0.17, 0.16], maleGirth: 1.11, floorGrow: 0.5,
  // The shoulder's cap the trunk carries takes the arm's ratio (by its muscle) within the first of these of the shoulder joint
  // (m per 1.8 m), none past the second (placeBaseBody: round 18).
  capReach: [0.12, 0.22],
  // The family of builds a fighter's skin is blended from (baseFamily; the remodel of 2026-11, tools/blender/family): each
  // sex's base mesh refitted, point for point, to an emaciated body (E: the emaciated reference, and her frame refitted
  // to a man's), an ordinary one (N: ANSUR II's means at a BMI of 21.5, hers, and 22.5, his), a muscular one (M: the man's
  // the base model itself), three fat ones (F1 to F3: ANSUR II's means at 27, 33 and 40) and the game's fattest body (F4: a BMI
  // of 100, F3 grown as fat grows to that body's volume, family/swell.py). `use`: off, a fighter's skin is
  // the base model placed by his girth ratios alone, as it was before the family.
  // `ease`: towards each open border (wrist, ankle, the neck's top) the family's placing gives way to the one by his girth
  // ratios, all of the family's up to the first t of the part and none of it from the second: the hand, the foot and the head
  // are the game's own, drawn to the game's rings there, and the border's cut ring was made to sit under them (a build's own
  // ring stood 1.4 times as wide as the base's at the wrist, the emaciated one's 0.6). A forearm's and a shin's lower third is
  // bone and tendon, which a build hardly changes; the neck's skin ends 0.6 of the way to the head's middle.
  // (The neck's ease is the last third of its skin: begun at 0.2, the neck's own points stood at the other placing among the
  // trapezius' that climb its flank, which are the trunk's and so the build's own all the way up: a toothed seam down its side.)
  // `hold`: the builds' skin about the neck's top is kept inside the game's head (headHold), none of the hold below the first
  // t of the neck and all of it from the second: the trapezius' points, the trunk's, climb the nape to 0.55 of the neck.
  family: { builds: ['E', 'N', 'M', 'F1', 'F2', 'F3', 'F4'], use: true, ease: { Fore: [0.55, 0.85], Shin: [0.6, 0.88], neck: [0.4, 0.6] }, hold: [0.3, 0.55] },
  // (D+'s neck top held within this share of the head's radius of its centre, behind and at the sides.)
  headHold: 0.85,
  // The head as it is drawn on its joint (render.js HEAD_SCALE, HEAD_SEAT), in head radii (body.js headRadius, 0.055 of
  // stature: 96 mm on a man of 1.75 m). `size` and `seat`: 1.12 of the radius and 0.18 of a radius under the joint, as the
  // helmets and the neck's top were fitted. `lift`: how far above that seat it is drawn, and `smaller`: the share taken off
  // that size, helmet, hair and all: the jaw's line stands higher by both, and that much more of the neck shows under it. The
  // neck's skin goes up with it (neckToHead; headHold's reach and neckCut's plane less by `smaller`): `draw`, the shares of
  // the way up the neck between which its skin is drawn out.
  head: { size: 1.12, seat: 0.18, lift: 0.13, smaller: 0.045, draw: [0.05, 0.4] },
  // PROOF OF CONCEPT, round 11 (noted: D is better, but the shoulders and arms smaller still, the neck longer, the woman's
  // shoulder a sharper joint, not a tube): D's rest shape, then (shoulderPlus):
  //   `in`      the shoulder's zone moved in towards the midline (m per 1.8 m): shorter clavicles, the acromion in;
  //   `trap`    the trapezius lowered (m), most beside the neck and `trapKeep` of it left at the acromion: the top line from the
  //             neck out flatter, and more of the neck showing above it;
  //   `deltoid` the deltoid's bulk beyond the arm's ring kept at this share on its outer side;
  //   `arm`     the upper arm's and forearm's girth about their axes (eased in below the shoulder's cap, `armFrom` to `armTo`, t);
  //   `square`  the cap's profile in the arm's plane about the shoulder joint pushed from a circle's towards a square's (a
  //             superellipse of exponent 4: at 45 degrees up and out 19% further) by this share: the acromion's corner where the
  //             top line meets the arm;
  //   `edge`    the deltoid's front and back edges, grooves this deep (m) at 0.6 of muscle showing and up to twice it at all;
  //   `chest`, `chestRows`, `chestFrom`, `chestTo`: the chest's width brought to the loft's (v7's) ring (round 13; see shoulderPlus);
  //   `slope`, `slopeNeck`, `floorBy` (round 16, by how wasted the body is: loftbody.js baseWasting): the top line's extra drop
  //             at the acromion (m), the share of the drop beside the neck given back, and the arm's girth floor's margin over the
  //             emaciated reference's (applied by wasting only, round 17); the corner's squaring and the flat top fade out with it;
  //   `neckBand`, `neckEase`, `neckMost` (round 17): the neck's middle measured (t), the scaling's ease in from the trapezius
  //             and out to the head (t), and its least and most ratio;
  //   `deltoidBy`, `deltoidWaste` (round 17): `deltoid`'s kept share scaled by the arm's muscle showing, from the first (none)
  //             to the second (a bodybuilder's), and less by this share of wasting;
  //   `neckCut` the neck's top ring trimmed to this share of the head's radius under its centre;
  //   `female`  a woman's own amounts over these (round 14: her shoulders narrower still);
  //   `neckTuck` the neck's top drawn in under the head by this share of its radius;
  //   `pit`     the armpit's hollow (m): the trunk's flank under the arm, from 2 to 14 cm under the shoulder joint and within
  //             the arm's own depth fore and aft, drawn in towards the midline, deepest at the arm's middle and easing out to the
  //             pec's edge in front and the lat's behind: the arm's inner face then stands off the flank, its own round form.
  shoulderPlus: {
    D1: { in: 0.02, trap: 0.04, trapKeep: 0.35, deltoid: 0.7, arm: 0.9, armFrom: -0.05, armTo: 0.2, square: 0.4, edge: 0.003, pit: 0 },
    D2: { in: 0.035, trap: 0.085, trapKeep: 0.25, deltoid: 0.35, arm: 0.78, armFrom: -0.05, armTo: 0.2, square: 0.8, edge: 0.005, pit: 0.018, neckTuck: 0.5, chest: 1, chestRows: 0.03, chestFrom: [0.35, 0.5], chestTo: [0.72, 0.82], neckCut: 0.75, slope: 0.012, slopeNeck: 0.5, floorBy: 0, deltoidBy: [0.4, 2.4], deltoidWaste: 0.7, neckBand: [0.2, 0.4], neckEase: [-0.05, 0.15, 0.5, 0.7], neckMost: [0.6, 1.6],
      female: { in: 0.05, deltoid: 0.15, arm: 0.72 } },
  },
};

const BASE_TAU = Math.PI * 2;
const baseDecoded = new Map();

/** The bones Blender's bone-heat weights name (tools/blender/baseweights.py), or null where the data has none. */
export const baseHeatBones = () => BASE_BODY_DATA?.heatBones ?? null;

/** Whether the base meshes are here (a build may leave them out: tools/custom.js; the style then draws the loft's own skin). */
export const baseBodyAvailable = () => Boolean(BASE_BODY_DATA?.male);

/** Bytes from base64, in Node and the page alike. */
function baseBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/**
 * A mesh's bone-heat weights, four a point (tools/baseweights-pack.js: 4-bit indices, three weights and the rest), as
 * { heatIndex (Uint8, into BASE_BODY_DATA.heatBones), heatWeight (Float32) }; nulls where the mesh has none (a crowd's).
 */
function baseHeat(packed) {
  if (!packed.heat) return { heatIndex: null, heatWeight: null };
  const nibbles = baseBytes(packed.heat.index);
  const three = baseBytes(packed.heat.weight);
  const heatIndex = new Uint8Array(packed.count * 4);
  const heatWeight = new Float32Array(packed.count * 4);
  for (let vertex = 0; vertex < packed.count; vertex += 1) {
    let rest = 1;
    for (let slot = 0; slot < 4; slot += 1) {
      heatIndex[vertex * 4 + slot] = (nibbles[vertex * 2 + (slot >> 1)] >> ((slot & 1) * 4)) & 15;
      // (The fourth is the rest, under half a step of the stored weights' rounding taken as none.)
      const w = slot < 3 ? three[vertex * 3 + slot] / 255 : rest > 1.5 / 255 ? rest : 0;
      heatWeight[vertex * 4 + slot] = w;
      rest -= w;
    }
  }
  return { heatIndex, heatWeight };
}

/**
 * The triangles with each slit in the surface closed (BASE_BODY.slitRoundness): its loop of open edges, followed the other way
 * round (so the new faces turn out as their neighbours do), cut into ears in its own plane (Newell's normal), so its sides are
 * one surface, joined by edges, and are smoothed and offset as one.
 */
function closeSlits(positions, triangles) {
  const p = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
  // Every open edge, a → b as its one triangle has it: the hole's loop runs b → a.
  const directed = new Set();
  for (let corner = 0; corner < triangles.length; corner += 3) for (let k = 0; k < 3; k += 1) directed.add(`${triangles[corner + k]}|${triangles[corner + ((k + 1) % 3)]}`);
  const outgoing = new Map();
  for (const key of directed) {
    const [a, b] = key.split('|').map(Number);
    if (directed.has(`${b}|${a}`)) continue;
    (outgoing.get(b) ?? outgoing.set(b, []).get(b)).push(a);
  }
  // (A point may lie on two holes, as at the shin's slit: the open edges are walked one at a time, and each time the walk comes
  // back to a point on its own path, the loop since is cut out as one hole.)
  const loops = [];
  for (const start of outgoing.keys()) {
    const path = [start];
    while (outgoing.get(path.at(-1))?.length) {
      const to = outgoing.get(path.at(-1)).pop();
      const back = path.indexOf(to);
      if (back < 0) path.push(to);
      else loops.push([to, ...path.splice(back + 1)]);
    }
  }
  const added = [];
  for (const loop of loops) {
    if (loop.length < 3) continue;
    const normal = [0, 0, 0];
    let perimeter = 0;
    loop.forEach((v, index) => {
      const [a, b] = [p(v), p(loop[(index + 1) % loop.length])];
      normal[0] += (a[1] - b[1]) * (a[2] + b[2]);
      normal[1] += (a[2] - b[2]) * (a[0] + b[0]);
      normal[2] += (a[0] - b[0]) * (a[1] + b[1]);
      perimeter += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    });
    const area = Math.hypot(...normal) / 2;
    if (!(perimeter > 0) || (4 * Math.PI * area) / perimeter ** 2 >= BASE_BODY.slitRoundness) continue;
    // Ears: a corner turning the loop's way with no other point of the loop inside it, clipped until three are left.
    const left = [...loop];
    const turn = (a, b, c) => vec.dot(vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(b))), normal);
    const inside = (q, a, b, c) => turn(a, b, q) >= 0 && turn(b, c, q) >= 0 && turn(c, a, q) >= 0;
    while (left.length > 3) {
      const index = left.findIndex((b, at) => {
        const a = left[(at + left.length - 1) % left.length];
        const c = left[(at + 1) % left.length];
        return turn(a, b, c) > 0 && !left.some((q) => q !== a && q !== b && q !== c && inside(q, a, b, c));
      });
      // (A loop with no clean ear left, folded on itself: closed as a fan from its first point.)
      if (index < 0) {
        for (let at = 1; at + 1 < left.length; at += 1) added.push(left[0], left[at], left[at + 1]);
        left.length = 0;
        break;
      }
      added.push(left[(index + left.length - 1) % left.length], left[index], left[(index + 1) % left.length]);
      left.splice(index, 1);
    }
    if (left.length === 3) added.push(...left);
  }
  if (!added.length) return triangles;
  const out = new Uint16Array(triangles.length + added.length);
  out.set(triangles);
  out.set(added, triangles.length);
  return out;
}

/**
 * PROOF OF CONCEPT (BASE_BODY.shoulder 'D'): the model's arms lowered BASE_BODY.rebindDegrees about each shoulder joint, in the
 * plane of the arm and the vertical, each point turned by that angle times its bone-heat weight on the arm's bones (the upper
 * arm and the forearm all of it, the clavicle `rebindClavicle` of it: one turn about one pivot, so blending the angle is what
 * dual quaternions would give), and the elbow and hand joints with them. The mesh is then bound as it now stands.
 */
function rebindArmsDown(mesh) {
  const bones = BASE_BODY_DATA.heatBones;
  const angle = (BASE_BODY.rebindDegrees * Math.PI) / 180;
  const positions = Float32Array.from(mesh.positions);
  const joints = structuredClone(mesh.joints);
  for (const side of ['l', 'r']) {
    const pivot = mesh.joints[`${side}Shoulder`];
    // (Left is +z in the model's frame: turned so that the arm comes in towards the body.)
    const sign = side === 'l' ? 1 : -1;
    const share = new Map([[bones.indexOf(`${side}UpperArm`), 1], [bones.indexOf(`${side}Forearm`), 1], [bones.indexOf(`${side}Clavicle`), BASE_BODY.rebindClavicle]]);
    const turn = (point, a) => {
      const y = point[1] - pivot[1];
      const z = point[2] - pivot[2];
      const [c, s] = [Math.cos(a), Math.sin(a) * sign];
      return [point[0], pivot[1] + y * c - z * s, pivot[2] + z * c + y * s];
    };
    for (let vertex = 0; vertex < mesh.count; vertex += 1) {
      let w = 0;
      for (let slot = 0; slot < 4; slot += 1) w += (share.get(mesh.heatIndex[vertex * 4 + slot]) ?? 0) * mesh.heatWeight[vertex * 4 + slot];
      if (w <= 0) continue;
      positions.set(turn([positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]], angle * w), vertex * 3);
    }
    for (const joint of ['Elbow', 'Hand']) joints[`${side}${joint}`] = turn(mesh.joints[`${side}${joint}`], angle);
  }
  mesh.positions = positions;
  mesh.joints = joints;
}

/** A sex's base mesh, decoded once: { parts, joints, reference, count, positions (units of height), triangles, part, part2, blend, starved, heatIndex, heatWeight }. */
export function baseBodyMesh(sex, crowd = false) {
  const key = `${sex}|${crowd}|${BASE_BODY.shoulder}`;
  if (baseDecoded.has(key)) return baseDecoded.get(key);
  const data = BASE_BODY_DATA[sex];
  const packed = data.meshes[crowd ? 'crowd' : 'full'];
  const ints = new Int16Array(baseBytes(packed.positions).buffer);
  const mesh = {
    parts: data.parts,
    joints: data.joints,
    reference: data.reference,
    count: packed.count,
    positions: Float32Array.from(ints, (value) => value / BASE_BODY_DATA.positionScale),
    triangles: null,
    part: baseBytes(packed.part),
    part2: baseBytes(packed.part2),
    blend: Float32Array.from(baseBytes(packed.blend), (value) => value / 255),
    starved: packed.starved ? Float32Array.from(new Int16Array(baseBytes(packed.starved).buffer), (value) => value / BASE_BODY_DATA.deltaScale) : new Float32Array(packed.count),
    // (A fighter's mesh: each point's place on each of the family's builds, as an offset in its own part's frame: baseFamily.)
    family: packed.family ? baseFamilyOffsets(packed.family, packed.count) : null,
    ...baseHeat(packed),
  };
  mesh.triangles = closeSlits(mesh.positions, new Uint16Array(baseBytes(packed.triangles).buffer));
  if (BASE_BODY.shoulder?.startsWith('D') && mesh.heatIndex) rebindArmsDown(mesh);
  baseDecoded.set(key, mesh);
  return mesh;
}

/**
 * The family's builds decoded (tools/basebody-family.js: ten bits a number, three to a Uint32, each (n − 512) × the build's
 * scale): one Float32Array a build, in BASE_BODY.family.builds' order, three a point (along, fore and aft, across its part),
 * units of height. A build left out is the base mesh itself: all zeros.
 */
function baseFamilyOffsets(packed, count) {
  return BASE_BODY.family.builds.map((name) => {
    const offsets = new Float32Array(count * 3);
    if (!packed[name]) return offsets;
    const words = new Uint32Array(baseBytes(packed[name].offsets).buffer);
    for (let vertex = 0; vertex < count; vertex += 1) {
      for (let axis = 0; axis < 3; axis += 1) offsets[vertex * 3 + axis] = (((words[vertex] >>> (10 * axis)) & 1023) - 512) * packed[name].scale;
    }
    return offsets;
  });
}

/**
 * How starved a body is, 0 to 1: the game's own measure, the face's gaunt weight (facemorph.js: from BMI and body fat), so a
 * normal body is untouched.
 */
export const baseStarvation = (body) => faceMorphWeights(body).gaunt;

const starvedReliefs = {};
/**
 * The emaciated reference's bone relief for the skin map's trunk tile (tools/blender/family/emaciateddetail.py; skintex.js
 * draws the trunk's bones from it), or null where there is none: { width, height, span, heights (units of stature, row by row
 * from the span's foot), weight }. One tile a sex: each is baked through that sex's own emaciated build. `weight`: how much of
 * it to draw, 0 to 1 (how much of it shows through the body's own fat and muscle: loftbody.js baseBoneRelief). A man's tile
 * has the skin rules' own ribs where his chest was remade of her (tools/basebody-detail.js).
 */
export function baseStarvedDetail(body, weight) {
  const sex = body.inputs.sex === 'female' ? 'female' : 'male';
  const packed = BASE_BODY_DATA?.starvedRelief?.[sex];
  if (!packed) return null;
  if (!starvedReliefs[sex]) {
    const bytes = new Int8Array(baseBytes(packed.heights).buffer);
    starvedReliefs[sex] = { width: packed.width, height: packed.height, span: packed.span, heights: Float32Array.from(bytes, (value) => (value / 127) * packed.deepest) };
  }
  return { ...starvedReliefs[sex], weight };
}

/** A part's frame: its axis from `a` to `b`, the ring's depth axis (the loft's: `forward` square to the axis) and width axis. */
function partFrame(a, b, forward) {
  const along = vec.sub(b, a);
  const length = vec.length(along);
  const axis = vec.scale(along, 1 / length);
  const depthAxis = vec.normalize(vec.sub(forward, vec.scale(axis, vec.dot(forward, axis))));
  return { a, axis, length, depthAxis, widthAxis: vec.cross(axis, depthAxis) };
}

/**
 * A point's place on a part: t along it, its angle round the ring at t (the loft's parametric angle: 0 the front, the ring's
 * point there is depth·cos, width·sin), its share of the ring's radius, and its width-axis offset (which side of the seam).
 * `frame` the base mesh's own (its joints), `ring(t)` the reference's ring (depth, width, offset, bend).
 */
function placeOn(frame, ring, point) {
  const rel = vec.sub(point, frame.a);
  const t = vec.dot(rel, frame.axis) / frame.length;
  const r = ring(t);
  const centre = vec.add(vec.scale(frame.axis, t * frame.length), vec.scale(frame.depthAxis, r.offset));
  const out = vec.sub(rel, centre);
  const x = vec.dot(out, frame.depthAxis);
  const y = vec.dot(out, frame.widthAxis);
  const phi = Math.atan2(y, x);
  let angle = Math.atan2(r.depth * Math.sin(phi), r.width * Math.cos(phi));
  if (angle < 0) angle += BASE_TAU;
  const radius = Math.hypot(r.depth * Math.cos(angle), r.width * Math.sin(angle)) * (r.bend ? r.bend(r, angle) : 1);
  return { t, angle, out: Math.hypot(x, y), radius, x, y };
}

/** A point's place on a part's own axis line: [t along, out fore and aft (the depth axis), out across (the width axis)]. */
function axisCoords(frame, point) {
  const rel = vec.sub(point, frame.a);
  const t = vec.dot(rel, frame.axis) / frame.length;
  const out = vec.sub(rel, vec.scale(frame.axis, t * frame.length));
  return [t, vec.dot(out, frame.depthAxis), vec.dot(out, frame.widthAxis)];
}

/** A part's ring profiles sampled at BASE_BODY.stops over [from, to]: [depth, width, offset] rows. */
function ringRows(part, from, to) {
  const count = BASE_BODY.stops;
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = from + ((to - from) * index) / count;
    return [part.depth(t), part.width(t), part.offset(t)];
  });
}

/**
 * A part's rings as a table (BASE_BODY.stops along [from, to]) read linearly: `part` is the loft's description of it
 * ({ a, b, forward, depth(t), width(t), offset(t), bend(ring, angle) }); the answer `(t) => { t, depth, width, offset, bend }`.
 */
function ringTable(part, from, to) {
  const count = BASE_BODY.stops;
  const span = to - from || 1;
  const rows = Array.from({ length: count + 1 }, (_, index) => {
    const t = from + (span * index) / count;
    return [part.depth(t), part.width(t), part.offset(t)];
  });
  return (t) => {
    const at = Math.min(count, Math.max(0, ((t - from) / span) * count));
    const index = Math.min(count - 1, Math.floor(at));
    const f = at - index;
    const [d0, w0, o0] = rows[index];
    const [d1, w1, o1] = rows[index + 1];
    return { t, depth: d0 + (d1 - d0) * f, width: w0 + (w1 - w0) * f, offset: o0 + (o1 - o0) * f, bend: part.bend };
  };
}

/** Two points' bone-heat weights mixed, `s` of the way from the first to the second (null where either has none). */
function mixHeat(a, b, s) {
  if (!a || !b) return a ?? b;
  const mixed = new Map();
  for (const [bone, w] of a) mixed.set(bone, (mixed.get(bone) ?? 0) + w * (1 - s));
  for (const [bone, w] of b) mixed.set(bone, (mixed.get(bone) ?? 0) + w * s);
  return mixed;
}

/** Plain Laplacian smoothing, `passes` rounds of each point halfway to its neighbours' mean (it shrinks: for directions only). */
function laplacian(positions, neighbours, passes) {
  let current = Float32Array.from(positions);
  for (let pass = 0; pass < passes; pass += 1) {
    const next = Float32Array.from(current);
    neighbours.forEach((list, vertex) => {
      if (!list.length) return;
      for (let axis = 0; axis < 3; axis += 1) {
        let sum = 0;
        for (const other of list) sum += current[other * 3 + axis];
        next[vertex * 3 + axis] = 0.5 * current[vertex * 3 + axis] + 0.5 * (sum / list.length);
      }
    });
    current = next;
  }
  return current;
}

/** Each point's unit normal, the mean of its triangles' by their areas. */
function vertexNormals(positions, triangles, count) {
  const sums = new Float64Array(count * 3);
  for (let corner = 0; corner < triangles.length; corner += 3) {
    const [a, b, c] = [triangles[corner], triangles[corner + 1], triangles[corner + 2]];
    const p = (v) => [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
    const face = vec.cross(vec.sub(p(b), p(a)), vec.sub(p(c), p(a)));
    for (const v of [a, b, c]) for (let axis = 0; axis < 3; axis += 1) sums[v * 3 + axis] += face[axis];
  }
  const out = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) {
    const length = Math.hypot(sums[v * 3], sums[v * 3 + 1], sums[v * 3 + 2]) || 1;
    for (let axis = 0; axis < 3; axis += 1) out[v * 3 + axis] = sums[v * 3 + axis] / length;
  }
  return out;
}

/** The mesh's neighbours (each point's, from its triangles). */
function neighboursOf(count, triangles) {
  const sets = Array.from({ length: count }, () => new Set());
  for (let corner = 0; corner < triangles.length; corner += 3) {
    const [a, b, c] = [triangles[corner], triangles[corner + 1], triangles[corner + 2]];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  return sets.map((set) => [...set]);
}

/** Taubin smoothing (BASE_BODY smooth*): the surface's relief low-passed, its volume kept. */
function smoothed(positions, neighbours) {
  let current = Float32Array.from(positions);
  const pass = (amount) => {
    const next = Float32Array.from(current);
    neighbours.forEach((list, vertex) => {
      if (!list.length) return;
      for (let axis = 0; axis < 3; axis += 1) {
        let sum = 0;
        for (const other of list) sum += current[other * 3 + axis];
        next[vertex * 3 + axis] += amount * (sum / list.length - current[vertex * 3 + axis]);
      }
    });
    current = next;
  };
  for (let round = 0; round < BASE_BODY.smoothPasses; round += 1) {
    pass(BASE_BODY.smoothStep);
    pass(BASE_BODY.smoothBack);
  }
  return current;
}

/**
 * The base mesh measured against the reference body's loft (once per sex and detail: `refParts` the loft's parts of the
 * reference, loftbody.js; `height` its standing height, m). The answer is everything a fighter's skin needs but his own rings:
 *   sources   the points to place: their two parts, blend, and (t, angle, ratio, smoothed ratio) on each part
 *   render    the points drawn: each a source, the part whose tile it is in, its t and angle there and its share round (u)
 *   triangles the drawn triangles, grouped by part (`ranges`: each part's first and last drawn point)
 */
export function measureBaseBody(mesh, refParts, height, refJoints) {
  const names = mesh.parts;
  const scaled = Float32Array.from(mesh.positions, (value) => value * height);
  const joint = (name) => mesh.joints[name].map((value) => value * height);
  const frames = {};
  const rings = {};
  for (const name of names) {
    const part = refParts[name];
    frames[name] = partFrame(joint(BASE_BODY.axes[name][0]), joint(BASE_BODY.axes[name][1]), part.forward);
  }
  const relief = smoothed(scaled, neighboursOf(mesh.count, mesh.triangles));
  // Each part's span of t, from its own points, then its reference rings over it.
  const span = Object.fromEntries(names.map((name) => [name, [Infinity, -Infinity]]));
  const point = (array, vertex) => [array[vertex * 3], array[vertex * 3 + 1], array[vertex * 3 + 2]];
  for (let vertex = 0; vertex < mesh.count; vertex += 1) {
    for (const index of [mesh.part[vertex], mesh.part2[vertex]]) {
      const name = names[index];
      const frame = frames[name];
      const t = vec.dot(vec.sub(point(scaled, vertex), frame.a), frame.axis) / frame.length;
      span[name][0] = Math.min(span[name][0], t - BASE_BODY.spanMargin);
      span[name][1] = Math.max(span[name][1], t + BASE_BODY.spanMargin);
    }
  }
  for (const name of names) {
    if (!Number.isFinite(span[name][0])) span[name] = [0, 1];
    rings[name] = ringTable(refParts[name], span[name][0], span[name][1]);
  }
  const at = (name, position) => placeOn(frames[name], rings[name], position);

  // The sources: the mesh's own points, and the points added where a triangle is split at a seam (below).
  // (Each source's coordinates on each of its two parts, on the part's own axis line: t, out fore and aft, out across; then the
  // same for the smoothed surface.)
  const src = { between: [], part: [], part2: [], blend: [], coords: [], position: [], relief: [], starved: [], normal: [], facing: [], heat: [], builds: [], buildCoords: mesh.family ? mesh.family.map(() => []) : null };
  // (Each point's surface normal on the model, and on each of its two parts in that part's frame: along, fore and aft, across.)
  // (Of the surface low-passed first, BASE_BODY.normalPasses: offset along the modelled surface's own normals, the faces of a
  // groove (between the pecs, under them) turn to each other and a fat man's offsets crossed there in folds.)
  const normals = vertexNormals(laplacian(scaled, neighboursOf(mesh.count, mesh.triangles), BASE_BODY.normalPasses), mesh.triangles, mesh.count);
  // (`heat`: the point's bone-heat weights, a Map of bone index (BASE_BODY_DATA.heatBones) to weight, or null.)
  const heatOf = (vertex) => {
    if (!mesh.heatIndex) return null;
    const weights = new Map();
    for (let slot = 0; slot < 4; slot += 1) if (mesh.heatWeight[vertex * 4 + slot] > 0) weights.set(mesh.heatIndex[vertex * 4 + slot], mesh.heatWeight[vertex * 4 + slot]);
    return weights;
  };
  // (`builds`: the point's place on each of the family's builds, and so its coordinates on each of its two parts there.)
  const addSource = (part, part2, blend, position, smooth, starved, normal, heat = null, builds = null) => {
    src.heat.push(heat);
    if (mesh.family) {
      src.builds.push(builds);
      builds.forEach((place, build) => src.buildCoords[build].push(...axisCoords(frames[names[part]], place), ...axisCoords(frames[names[part2]], place)));
    }
    const on = (index, point) => axisCoords(frames[names[index]], point);
    const facing = (index) => {
      const frame = frames[names[index]];
      return [vec.dot(normal, frame.axis), vec.dot(normal, frame.depthAxis), vec.dot(normal, frame.widthAxis)];
    };
    src.normal.push(normal);
    src.facing.push(...facing(part), ...facing(part2));
    src.part.push(part);
    src.part2.push(part2);
    src.blend.push(blend);
    src.coords.push(...on(part, position), ...on(part, smooth), ...on(part2, position), ...on(part2, smooth));
    src.position.push(position);
    src.relief.push(smooth);
    src.starved.push(starved);
    return src.part.length - 1;
  };
  // (Each point's starved delta faded over the shoulder's cap: BASE_BODY.starveArm.)
  const starveKeep = (p) => {
    let keep = 1;
    for (const name of ['lUpper', 'rUpper']) {
      const [t, x, y] = axisCoords(frames[name], p);
      if (t < BASE_BODY.armFrom) continue;
      const at = Math.max(0, Math.min(1, t));
      const ring = refParts[name];
      const d = Math.hypot(x, y) / Math.max(ring.depth(at), ring.width(at));
      const [inner, outer] = BASE_BODY.starveArm;
      const u = Math.min(1, Math.max(0, (d - inner) / (outer - inner)));
      keep = Math.min(keep, u * u * (3 - 2 * u));
    }
    return keep;
  };
  // (A point's place on each of the family's builds: moved by its offset there, turned out of its part's frame on the mesh's
  // joints, forward +x: baseFamily.)
  const familyFrames = mesh.family ? Object.fromEntries(names.map((name) => [name, partFrame(joint(BASE_BODY.axes[name][0]), joint(BASE_BODY.axes[name][1]), [1, 0, 0])])) : null;
  const buildsOf = (vertex) => {
    if (!mesh.family) return null;
    const frame = familyFrames[names[mesh.part[vertex]]];
    return mesh.family.map((offsets) => {
      const [along, fore, across] = [0, 1, 2].map((axis) => offsets[vertex * 3 + axis] * height);
      return vec.add(point(scaled, vertex), vec.add(vec.scale(frame.axis, along), vec.add(vec.scale(frame.depthAxis, fore), vec.scale(frame.widthAxis, across))));
    });
  };
  for (let vertex = 0; vertex < mesh.count; vertex += 1) addSource(mesh.part[vertex], mesh.part2[vertex], mesh.blend[vertex], point(scaled, vertex), point(relief, vertex), mesh.starved[vertex] * starveKeep(point(scaled, vertex)), point(normals, vertex), heatOf(vertex), buildsOf(vertex));

  // The drawn points: one per source and tile (and seam side).
  const render = { source: [], part: [], t: [], angle: [], u: [] };
  const drawn = new Map();
  const draw = (source, part, place, side) => {
    const key = `${source}|${part}|${side}`;
    if (drawn.has(key)) return drawn.get(key);
    const u = side === 0 ? place.angle / BASE_TAU : side < 0 ? 0 : 1;
    render.source.push(source);
    render.part.push(part);
    render.t.push(place.t);
    render.angle.push(u * BASE_TAU);
    render.u.push(u);
    drawn.set(key, render.source.length - 1);
    return render.source.length - 1;
  };
  // A seam split's new point, shared by the two triangles on its edge.
  const splits = new Map();
  const splitPoint = (i, j, s) => {
    const key = i < j ? `${i}|${j}` : `${j}|${i}`;
    if (splits.has(key)) return splits.get(key);
    const lerp = (p, q) => p.map((value, axis) => value + (q[axis] - value) * s);
    const near = s < 0.5 ? i : j;
    const same = src.part[i] === src.part[j] && src.part2[i] === src.part2[j];
    const blend = same ? src.blend[i] + (src.blend[j] - src.blend[i]) * s : src.blend[near];
    const made = addSource(src.part[near], src.part2[near], blend, lerp(src.position[i], src.position[j]), lerp(src.relief[i], src.relief[j]), src.starved[i] + (src.starved[j] - src.starved[i]) * s, vec.normalize(lerp(src.normal[i], src.normal[j])), mixHeat(src.heat[i], src.heat[j], s), mesh.family ? src.builds[i].map((place, build) => lerp(place, src.builds[j][build])) : null);
    // (For the tools that follow a drawn point back onto the model: basebody-trunk.js.)
    src.between.push([i, j, s]);
    splits.set(key, made);
    return made;
  };
  // Which upper arm's reach (BASE_BODY.armReach of its ring's radius round its axis, from armFrom above the joint) holds all of
  // some points: that arm's part index, or null.
  const armTile = (points) => {
    for (const name of ['lUpper', 'rUpper']) {
      const frame = frames[name];
      const ring = refParts[name];
      const within = points.every((p) => {
        const [t, x, y] = axisCoords(frame, p);
        const at = Math.max(BASE_BODY.armFrom, Math.min(1, t));
        return t >= BASE_BODY.armFrom && Math.hypot(x, y) < BASE_BODY.armReach * Math.max(ring.depth(Math.max(0, at)), ring.width(Math.max(0, at)));
      });
      if (within) return names.indexOf(name);
    }
    return null;
  };
  // First each triangle's part and whether it crosses its part's seam (the points the seams are cut at made then), then the
  // triangles drawn: a triangle that does not cross a seam but has an edge cut by its neighbour's takes the cut point too, so the
  // surface stays closed (a crack along the seam otherwise: a dark slash where the inside shows).
  const onSeam = (place) => Math.abs(place.y) < 1e-7;
  const edgeKey = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`);
  const faces = [];
  for (let corner = 0; corner < mesh.triangles.length; corner += 3) {
    const corners = [mesh.triangles[corner], mesh.triangles[corner + 1], mesh.triangles[corner + 2]];
    // The triangle's part: the one its points carry most of, by their blends (so the tiles meet along the blend's middle, a
    // smooth line, not round each point's own part: a jagged edge of triangles whose far points read the tile past its ends).
    const shares = new Map();
    for (const vertex of corners) {
      shares.set(src.part[vertex], (shares.get(src.part[vertex]) ?? 0) + 1 - src.blend[vertex]);
      shares.set(src.part2[vertex], (shares.get(src.part2[vertex]) ?? 0) + src.blend[vertex]);
    }
    let part = src.part[corners[0]];
    for (const [candidate, share] of shares) if (share > shares.get(part)) part = candidate;
    // (A trunk triangle wholly within an arm's own reach, the shoulder's cap, is drawn in that arm's tile: the trunk's paints
    // ribs and the flank there.)
    if (names[part] === 'trunk') {
      const arm = armTile(corners.map((vertex) => src.position[vertex]));
      if (arm !== null) part = arm;
    }
    const name = names[part];
    const places = corners.map((vertex) => at(name, src.position[vertex]));
    const us = places.map((place) => place.angle / BASE_TAU);
    const crosses = Math.max(...us) - Math.min(...us) > 0.5;
    if (crosses) {
      for (let index = 0; index < 3; index += 1) {
        const [p, q] = [places[index], places[(index + 1) % 3]];
        if (!onSeam(p) && !onSeam(q) && p.y * q.y < 0) splitPoint(corners[index], corners[(index + 1) % 3], p.y / (p.y - q.y));
      }
    }
    faces.push({ corners, part, name, places, crosses });
  }
  const triangles = [];
  for (const { corners, part, name, places, crosses } of faces) {
    if (!crosses) {
      // (With any edge's cut point drawn in, at its place in this triangle's own tile.)
      const polygon = [];
      for (let index = 0; index < 3; index += 1) {
        polygon.push(draw(corners[index], part, places[index], 0));
        const cut = splits.get(edgeKey(corners[index], corners[(index + 1) % 3]));
        if (cut !== undefined) polygon.push(draw(cut, part, at(name, src.position[cut]), 0));
      }
      for (let index = 1; index + 1 < polygon.length; index += 1) triangles.push(polygon[0], polygon[index], polygon[index + 1]);
      continue;
    }
    // Across the seam (the front, where the angle wraps): cut on the width axis's zero, each side drawn at its end of the tile.
    const low = [];
    const high = [];
    for (let index = 0; index < 3; index += 1) {
      const next = (index + 1) % 3;
      const [p, q] = [places[index], places[next]];
      const vertex = corners[index];
      if (onSeam(p)) {
        low.push(draw(vertex, part, p, -1));
        high.push(draw(vertex, part, p, 1));
      } else if (p.y > 0) low.push(draw(vertex, part, p, 0));
      else high.push(draw(vertex, part, p, 0));
      const cut = splits.get(edgeKey(vertex, corners[next]));
      if (cut !== undefined) {
        const place = at(name, src.position[cut]);
        // (A cut point on an edge that does not cross this triangle's seam, made by a neighbour in another tile, is drawn on
        // the side its own place falls.)
        if (!onSeam(p) && !onSeam(q) && p.y * q.y < 0) {
          low.push(draw(cut, part, place, -1));
          high.push(draw(cut, part, place, 1));
        } else (place.y > 0 ? low : high).push(draw(cut, part, place, 0));
      }
    }
    for (const polygon of [low, high]) for (let index = 1; index + 1 < polygon.length; index += 1) triangles.push(polygon[0], polygon[index], polygon[index + 1]);
  }
  // Drawn points grouped by part, so each part is one run (the loft's `parts`, which coverage and the maps read).
  const order = render.source.map((_, index) => index).sort((a, b) => render.part[a] - render.part[b] || a - b);
  const remap = new Int32Array(order.length);
  order.forEach((from, to) => {
    remap[from] = to;
  });
  const pick = (array, Type) => Type.from(order, (from) => array[from]);
  const drawnPart = pick(render.part, Uint8Array);
  const ranges = {};
  drawnPart.forEach((part, index) => {
    const name = names[part];
    ranges[name] ??= [index, index + 1];
    ranges[name][1] = index + 1;
  });
  return {
    names,
    height,
    spans: span,
    // The mesh's own joints (at the reference's height), the reference's bind-pose joints, and its rings along each part.
    joints: Object.fromEntries(Object.keys(mesh.joints).map((name) => [name, joint(name)])),
    refJoints,
    refRows: Object.fromEntries(names.map((name) => [name, ringRows(refParts[name], span[name][0], span[name][1])])),
    sources: { count: src.part.length, part: Uint8Array.from(src.part), part2: Uint8Array.from(src.part2), blend: Float32Array.from(src.blend), coords: Float32Array.from(src.coords), starved: Float32Array.from(src.starved), facing: Float32Array.from(src.facing), heat: src.heat, between: src.between, builds: mesh.family ? src.buildCoords.map((coords) => Float32Array.from(coords)) : null },
    render: { count: order.length, source: pick(render.source, Int32Array), part: drawnPart, t: pick(render.t, Float32Array), angle: pick(render.angle, Float32Array), u: pick(render.u, Float32Array) },
    triangles: Uint32Array.from(triangles, (index) => remap[index]),
    ranges,
  };
}

/**
 * The joints a fighter's base skin is placed on and the loft and the rig are built on (the rig follows the model). `rig` the
 * measured mesh (measureBaseBody), `joints` his bind-pose joints (rig.js bindPoints, by name), `height` his standing height (m).
 *   - Each of the mesh's joints is moved as his is from the reference's (height and frame lengthen and shorten the parts along
 *     their bones, not across).
 *   - Each limb (and the neck to the head) then runs from its root in the model's own direction, at the game's own length: the
 *     bones lie along the skin's own axes, so a shin ends at its foot and a sleeve's rings are the arm's (the model's legs slant
 *     back to an ankle 9.5 cm behind the rig's, its hips stand 2 cm wider: rings on the rig's line stood off the skin by that).
 *   - `bind`: the same skeleton with every chain moved onto the rig's own root (pelvis, hips, shoulders, neck), which is where
 *     the physics holds them: the skin is bound to it, so in play a limb's skin keeps its place beside the trunk's however the
 *     bones turn (bound on the model's roots, a thigh would be carried 2 cm in to the rig's hip).
 *   - `apart`: how far apart the shoulders and the hips are set against the rig's own (loftbody.js baseFrame: the frame as
 *     drawn over the rig's, and a body's weight under the ordinary build, which draws its skeleton in a little), the loft's
 *     and the skin's; the rig's stay, and the skin is bound to them.
 * Returns { loft, skin, bind } (joints by name; `skin` has the forearm end at the modelled wrist, not the hand point) and
 * `reach` (each arm part's length against the model's: a forearm's `extra` out to the hand, BASE_BODY.handSeat; an upper arm's
 * `within` its game-length frame).
 */
export function baseBindJoints(rig, joints, height, apart = 1) {
  const moved = Object.fromEntries(Object.keys(rig.joints).map((name) => [name, vec.add(rig.joints[name], vec.sub(joints[name], rig.refJoints[name]))]));
  const loft = { ...moved };
  const skin = {};
  const reach = {};
  // A chain from its root: each next joint in the model's direction at the rig's length.
  const chain = (names) => {
    for (let index = 1; index < names.length; index += 1) {
      const [from, to] = [names[index - 1], names[index]];
      loft[to] = vec.add(loft[from], vec.scale(vec.normalize(vec.sub(moved[to], moved[from])), vec.length(vec.sub(joints[to], joints[from]))));
    }
  };
  // (The shoulders as wide as the rig's (body.js ARM_LENGTHS), narrower than the model's: each arm brought in across to the
  // rig's shoulder, the model's own height and depth kept; the shoulder's cap, on the trunk, eases into it across the joint.)
  for (const side of ['l', 'r']) {
    const name = `${side}Shoulder`;
    loft[name] = [moved[name][0], moved[name][1], joints[name][2] * apart];
    loft[`${side}Hip`] = [moved[`${side}Hip`][0], moved[`${side}Hip`][1], moved[`${side}Hip`][2] * apart];
  }
  chain(['neck', 'head']);  // (the skin's; the loft's head is set below)
  for (const side of ['l', 'r']) {
    chain([`${side}Shoulder`, `${side}Elbow`, `${side}Hand`]);
    chain([`${side}Hip`, `${side}Knee`, `${side}Foot`]);
  }
  Object.assign(skin, loft);
  // (The neck's skin keeps the model's lean, but its bone and the rings on it run the rig's way, neck to the game's own head:
  // the model's head is not drawn, and bound leaning the model's way (13 degrees forward on the female against the rig's 6)
  // the neck's skin was turned back by the difference in play, creasing in a zigzag where its weights hand over to the chest.)
  loft.head = vec.add(loft.neck, vec.sub(joints.head, joints.neck));
  // (Where the game draws the head, for what must stay inside it: placeBaseBody's shoulderPlus neck top.)
  skin.gameHead = loft.head;
  for (const side of ['l', 'r']) {
    const [elbow, hand] = [loft[`${side}Elbow`], loft[`${side}Hand`]];
    const along = vec.normalize(vec.sub(hand, elbow));
    const modelled = vec.length(vec.sub(moved[`${side}Hand`], moved[`${side}Elbow`]));
    skin[`${side}Hand`] = vec.add(elbow, vec.scale(along, modelled));
    // (The forearm drawn out past its modelled length to the palm's heel: `extra`; the upper arm's frame is at the game's length,
    // the model's shorter, `within` of it taken up in the shaft.)
    reach[`${side}Fore`] = { extra: Math.max(0, vec.length(vec.sub(hand, elbow)) - (BASE_BODY.handSeat * height) / 1.8 - modelled) };
    const upper = vec.length(vec.sub(loft[`${side}Elbow`], loft[`${side}Shoulder`]));
    reach[`${side}Upper`] = { within: Math.max(0, upper - vec.length(vec.sub(moved[`${side}Elbow`], moved[`${side}Shoulder`]))) };
  }
  // Each chain carried onto the rig's root.
  const bind = { ...loft };
  const roots = { pelvis: ['pelvis'], neck: ['neck', 'head'] };
  for (const side of ['l', 'r']) {
    roots[`${side}Shoulder`] = [`${side}Shoulder`, `${side}Elbow`, `${side}Hand`];
    roots[`${side}Hip`] = [`${side}Hip`, `${side}Knee`, `${side}Foot`];
  }
  for (const [root, names] of Object.entries(roots)) {
    const shift = vec.sub(joints[root], loft[root]);
    for (const name of names) bind[name] = vec.add(loft[name], shift);
  }
  // (Where the head bone stands at rest among the skin's points, which are bound as they lie about the model's own neck: the
  // rig's neck and head, in front of the model's by the model's stoop (28 mm on the man). The head is drawn there: neckToHead.)
  skin.boundNeck = bind.neck;
  skin.boundHead = bind.head;
  return { loft, skin, bind, reach };
}

/**
 * The family of builds (BASE_BODY.family): a fighter's points put where the blend of the builds has them, `weights` one a
 * build and summing to one (loftbody.js baseFamilyWeights: by his fat and his lean mass), each on the fighter's own skeleton:
 * along each part at the blend's share of its length, across at its size by his height, the shoulder girdle where the blend's
 * is on its trunk. It takes the place of everything placed before it (his girth ratios on the base model, D+2's shoulders, the
 * starved contour): the builds are whole bodies, bone, muscle and fat as they lie on a body of that kind, where a ratio only
 * swells or shrinks the one model's own forms; but for the open borders, where it eases back into that placing
 * (BASE_BODY.family.ease), and for the skin about the neck's top, the neck's own and the trapezius' that climbs the nape as
 * the trunk's, which is kept inside the game's head `head` as that placing's is (headHold). `along(name, t, distance)` the
 * arms' stretch to the game's length (placeBaseBody). `across`: how broad his skeleton is against the builds' own (loftbody.js
 * baseFrame): the trunk's points that much further apart across and no deeper, a limb's that much further from its bone
 * both ways, the neck's as they are.
 */
function baseFamily(rig, frames, placed, height, weights, along, head = null, across = 1) {
  const { names, sources } = rig;
  const size = height / rig.height;
  const broad = Object.fromEntries(names.map((name) => [name, name === 'neck' ? [1, 1] : name === 'trunk' ? [1, across] : [across, across]]));
  const at = (name, c, k, out) => {
    const frame = frames[name];
    const [deep, wide] = broad[name];
    const distance = along(name, c[k], c[k] * frame.length);
    for (let axis = 0; axis < 3; axis += 1) out[axis] = frame.a[axis] + frame.axis[axis] * distance + (frame.depthAxis[axis] * c[k + 1] * deep + frame.widthAxis[axis] * c[k + 2] * wide) * size;
    return out;
  };
  const used = weights.map((weight, build) => [weight, sources.builds[build]]).filter(([weight]) => weight !== 0);
  // (Each part's ease to the placing already there, towards its open border: BASE_BODY.family.ease, by the part's name's end.)
  const eases = names.map((name) => Object.entries(BASE_BODY.family.ease).find(([end]) => name.endsWith(end))?.[1] ?? null);
  // (The builds' napes are their own bodies', 9 cm behind the neck's line at its top where the game's head reaches 5: the
  // neck's own points ease to the placing under the head, and the trapezius' beside them, the trunk's, stood off behind it in
  // two horns up to the ears.)
  const underHead = head ? names.map((name) => name === 'neck' || name === 'trunk') : [];
  const one = [0, 0, 0];
  const other = [0, 0, 0];
  const c = [0, 0, 0, 0, 0, 0];
  for (let vertex = 0; vertex < sources.count; vertex += 1) {
    const ease = eases[sources.part[vertex]];
    let share = 1;
    if (ease) {
      const u = Math.min(1, Math.max(0, (sources.coords[vertex * 12] - ease[0]) / (ease[1] - ease[0])));
      share = 1 - u * u * (3 - 2 * u);
      if (share <= 0) continue;
    }
    c.fill(0);
    for (const [weight, coords] of used) for (let k = 0; k < 6; k += 1) c[k] += weight * coords[vertex * 6 + k];
    at(names[sources.part[vertex]], c, 0, one);
    const blend = sources.blend[vertex];
    if (blend > 0 && sources.part2[vertex] !== sources.part[vertex]) {
      at(names[sources.part2[vertex]], c, 3, other);
      for (let axis = 0; axis < 3; axis += 1) one[axis] += (other[axis] - one[axis]) * blend;
    }
    if (underHead[sources.part[vertex]]) {
      const [t, x, y] = axisCoords(frames.neck, one);
      if (t > BASE_BODY.family.hold[0]) {
        const move = headHold(one, head, height, t, x, y, BASE_BODY.family.hold);
        for (let axis = 0; axis < 3; axis += 1) one[axis] += move[axis];
      }
    }
    if (share < 1) for (let axis = 0; axis < 3; axis += 1) one[axis] = placed[vertex * 3 + axis] + (one[axis] - placed[vertex * 3 + axis]) * share;
    placed.set(one, vertex * 3);
  }
}

/**
 * A fighter's base skin: each source point placed on his parts and blended across its joint. `parts` the loft's description of
 * his rings (see measureBaseBody), `joints` the joints it is placed on (baseBindJoints' `skin`), `relief(name)` how much of the
 * modelled muscle relief his part shows (1 all of it, 0 the smoothed surface), `height` his standing height (m), `starve` how
 * starved he is (baseStarvation: the emaciated reference's contour, each point's delta out along its line, laid on by it),
 * `foreReach` each arm part's length against the model's ({ extra, within }, baseBindJoints), `muscle(name, t, angle)` a
 * form to add out along each point's line (m), or null; `family` the family's weights (baseFamily), or null for the base
 * model by his ratios alone, and `across` how broad the family is drawn on him (baseFamily).
 * Returns the drawn points' positions (render order) and the sources', and how much of the emaciated build it took (`herShare`).
 */
export function placeBaseBody(rig, parts, relief, height, starve = 0, joints = rig.joints, foreReach = {}, muscle = null, shoulderKeep = 0, waste = 0, neckGirth = 0, family = null, across = 1) {
  const { names, sources, render } = rig;
  const frames = {};
  const ratios = {};
  // (How much of the emaciated build this body takes (baseFamily): the first of the family's.)
  const herShare = family && sources.builds ? Math.min(1, Math.max(0, family[0])) : 0;
  const count = BASE_BODY.stops;
  for (const name of names) {
    const part = parts[name];
    frames[name] = partFrame(joints[BASE_BODY.axes[name][0]], joints[BASE_BODY.axes[name][1]], part.forward);
    const [from, to] = rig.spans[name];
    const own = ringRows(part, from, to);
    const raw = own.map(([depth, width, offset], index) => {
      const [d0, w0, o0] = rig.refRows[name][index];
      return [depth / (d0 || 1e-6), width / (w0 || 1e-6), offset - o0];
    });
    // Smoothed along the part (BASE_BODY.ratioSmooth): a moving mean, the ends held.
    const smooth = raw.map((_, index) => {
      const sum = [0, 0, 0];
      let weight = 0;
      for (let k = -BASE_BODY.ratioSmooth; k <= BASE_BODY.ratioSmooth; k += 1) {
        const row = raw[Math.min(count, Math.max(0, index + k))];
        for (let axis = 0; axis < 3; axis += 1) sum[axis] += row[axis];
        weight += 1;
      }
      return sum.map((value) => value / weight);
    });
    ratios[name] = (t) => {
      const at = Math.min(count, Math.max(0, ((t - from) / (to - from || 1)) * count));
      const index = Math.min(count - 1, Math.floor(at));
      const f = at - index;
      return smooth[index].map((value, axis) => value + (smooth[index + 1][axis] - value) * f);
    };
  }
  // Across each joint the ratio eases from the parent's (at the joint, its depth and width ratios' mean all round) into the
  // part's own over BASE_BODY.joinRatio (t of the part): the shoulder's cap swells with the trunk across the shoulders, not as
  // the fat upper arm below it does, so it keeps the deltoid's curve (a fat arm's own ratio there stood the cap out as a shelf).
  const own = { ...ratios };
  for (const [name, [parent, at]] of Object.entries(BASE_BODY.joins)) {
    const partName = name.startsWith('side') ? null : name;
    for (const side of partName ? [''] : ['l', 'r']) {
      const child = partName ?? `${side}${name.slice(4)}`;
      const from = parent.replace('*', side);
      if (!own[child] || !own[from]) continue;
      const [kx, ky] = own[from](at);
      // (The upper arm's cap takes the trunk's ratio across the joint, so a fat arm does not stand the cap out as a shelf; but
      // the deltoid is the arm's muscle: by how much of it shows (`shoulderKeep`), the cap's ratio moves towards the arm's own
      // there (round 17: the shoulder had the same muscle at every build; a bodybuilder's cap took an average man's).)
      const ownAt = /Upper$/.test(child) ? own[child](0) : null;
      const joint = (kx + ky) / 2 + (ownAt ? (((ownAt[0] + ownAt[1]) / 2 - (kx + ky) / 2) * Math.min(1, shoulderKeep)) : 0);
      const [low, high] = BASE_BODY.joinRatio;
      ratios[child] = (t) => {
        const mine = own[child](t);
        const u = Math.min(1, Math.max(0, (t - low) / (high - low)));
        const w = u * u * (3 - 2 * u);
        return [joint + (mine[0] - joint) * w, joint + (mine[1] - joint) * w, mine[2] * w];
      };
    }
  }
  // The reference's ring semi-axes along each part (depth, width), read as the ratios are.
  const refRing = Object.fromEntries(names.map((name) => {
    const [from, to] = rig.spans[name];
    const rows = rig.refRows[name];
    return [name, (t) => {
      const at = Math.min(count, Math.max(0, ((t - from) / (to - from || 1)) * count));
      const index = Math.min(count - 1, Math.floor(at));
      const f = at - index;
      return [0, 1].map((axis) => rows[index][axis] + (rows[index + 1][axis] - rows[index][axis]) * f);
    }];
  }));
  const shows = Object.fromEntries(names.map((name) => [name, relief(name)]));
  const placed = new Float32Array(sources.count * 3);
  const place = (name, c, k, starved, out, n, forceShare = null) => {
    const frame = frames[name];
    const share = forceShare ?? shows[name];
    const t = c[k + 3] + (c[k] - c[k + 3]) * share;
    const x = c[k + 4] + (c[k + 1] - c[k + 4]) * share;
    const y = c[k + 5] + (c[k + 2] - c[k + 5]) * share;
    let [kx, ky, lean] = ratios[name](t);
    // (The shoulder's cap the trunk carries is the deltoid, the arm's muscle (round 18: the cap took the trunk's ratio, so a
    // bodybuilder's deltoid stood out no more than an average man's). Within an upper arm's reach (BASE_BODY.armReach of its
    // ring radius, from armFrom above its joint), the ratio moves towards the arm's own at its root, by how much of the arm's
    // muscle shows (`shoulderKeep`): fat alone keeps the trunk's, which rounds the cap without a shelf.)
    if (name === 'trunk' && shoulderKeep > 0) {
      const point = vec.add(vec.add(frame.a, vec.scale(frame.axis, t * frame.length)), vec.add(vec.scale(frame.depthAxis, x), vec.scale(frame.widthAxis, y)));
      for (const [arm, side] of [['lUpper', 'lShoulder'], ['rUpper', 'rShoulder']]) {
        if (!frames[arm]) continue;
        // (Near the shoulder joint, out past the shoulder's own width: within `capReach` (m per 1.8 m) of the joint, all of it
        // within the first, none past the second.)
        const off = vec.length(vec.sub(point, joints[side]));
        const [r0, r1] = BASE_BODY.capReach.map((value) => (value * height) / 1.8);
        const w = (1 - Math.min(1, Math.max(0, (off - r0) / (r1 - r0)))) * Math.min(1, shoulderKeep);
        if (w > 0) {
          const [ax, ay] = own[arm](0.35);
          const armRatio = (ax + ay) / 2;
          kx += (armRatio - kx) * w;
          ky += (armRatio - ky) * w;
        }
      }
    }
    // Scaled by the ratio out to the reference ring's own reach; past it (the shoulder's cap far out on the trunk's narrow top
    // ring, a buttock behind the hips') a point moves out as the ring's surface does, not by a share of its whole distance: the
    // part swells as a whole, and its outlying forms ride on the swell rather than flying out with it (square, boxy shoulders).
    // Thinning (a ratio under 1) takes the whole distance in, the outlying forms with it: held to the ring, a thin or starved
    // body kept the model's shoulder cap at full size over a thinner arm, 1.5 cm of deltoid standing off it at every build (the
    // user, 2026-11-11: "why does the shoulder always have some thickness").
    const [refDepth, refWidth] = refRing[name](t);
    const reach = (value, ring, ratio) => (ratio < 1 ? value : Math.max(-ring, Math.min(ring, value)));
    // That swell is then laid on along the model's own surface normal at the point (`n`: along, fore and aft, across), its
    // share there: the surface is offset, not stretched across, so a form keeps its shape as the part thickens or thins. Laid
    // on round the axis, the swell slid a form sideways where its surface turns from the axis: a shoulder's cap carried out
    // with the ribs' widening (a block on a fat man), a breast's foot and a pec's edge pushed out of their curves.
    const dx = (kx - 1) * reach(x, refDepth, kx);
    const dy = (ky - 1) * reach(y, refWidth, ky);
    const normalShare = BASE_BODY.offsetAlongNormal;
    const dn = dx * n[1] + dy * n[2];
    let px = x + dx + (n[1] * dn - dx) * normalShare + lean;
    let py = y + dy + (n[2] * dn - dy) * normalShare;
    const lift = n[0] * dn * normalShare;
    // Added along the point's own line out from the axis: the starved contour, a part's own swell (the trunk's belly, see
    // loftbody.js baseBelly) with its foot hanging down.
    const [swell, hang] = parts[name].swell ? parts[name].swell(t, Math.atan2(y, x)) : [0, 0];
    const length = Math.hypot(px, py) || 1e-9;
    // (And the arm's forms this body shows beyond the model's, `muscle(name, t, angle)` m: loftbody.js baseArmForms.)
    const add = starved + swell + (muscle ? muscle(name, t, Math.atan2(y, x)) : 0);
    px += (px / length) * add;
    py += (py / length) * add;
    const along = alongOf(name, t, t * frame.length - hang + lift);
    for (let axis = 0; axis < 3; axis += 1) out[axis] = frame.a[axis] + frame.axis[axis] * along + frame.depthAxis[axis] * px + frame.widthAxis[axis] * py;
    return out;
  };
  // (An arm's length against the model's (BASE_BODY.stretch): a forearm drawn out `extra` m past its modelled wrist, laid on up
  // to the mesh's own end, its wrist's cut ring, a little short of the joint (`end` of the part), so the cut lands under the
  // palm's heel; an upper arm's frame at the game's length, `within` m more than modelled, taken up in its shaft.)
  function alongOf(name, t, along) {
    const arm = foreReach[name];
    if (arm) {
      const frame = frames[name];
      const end = arm.extra ? rig.spans[name][1] - BASE_BODY.spanMargin : 1;
      const extra = arm.extra ? arm.extra + (1 - end) * frame.length : 0;
      const [a, b] = BASE_BODY.stretch;
      const u = t / end;
      const x = Math.min(1, Math.max(0, (u - a) / (b - a)));
      const shaft = x - Math.sin(2 * Math.PI * x) / (2 * Math.PI);
      along += extra * shaft + (arm.within ?? 0) * (shaft - Math.min(1, Math.max(0, u)));
    }
    return along;
  }
  const one = [0, 0, 0];
  const other = [0, 0, 0];
  for (let vertex = 0; vertex < sources.count; vertex += 1) {
    const k = vertex * 12;
    const c = sources.coords;
    const starved = sources.starved[vertex] * height * starve;
    const f = sources.facing;
    place(names[sources.part[vertex]], c, k, starved, one, [f[vertex * 6], f[vertex * 6 + 1], f[vertex * 6 + 2]]);
    const blend = sources.blend[vertex];
    if (blend > 0 && sources.part2[vertex] !== sources.part[vertex]) {
      place(names[sources.part2[vertex]], c, k + 6, starved, other, [f[vertex * 6 + 3], f[vertex * 6 + 4], f[vertex * 6 + 5]]);
      for (let axis = 0; axis < 3; axis += 1) one[axis] += (other[axis] - one[axis]) * blend;
    }
    placed.set(one, vertex * 3);
  }
  if (BASE_BODY.shoulder && BASE_BODY.shoulder !== 'D') {
    if (BASE_BODY.shoulderPlus[BASE_BODY.shoulder]) shoulderPlus(BASE_BODY.shoulderPlus[BASE_BODY.shoulder], { rig, parts, frames, placed, shoulderKeep, height, joints, waste: waste * (1 - herShare), neckGirth });
    // (The smoothed surface placed too, for the designs that drive it and carry the detail along: C and E.)
    const design = BASE_BODY.shoulder;
    let smooth = null;
    if (design === 'C' || design === 'E') {
      smooth = new Float32Array(sources.count * 3);
      for (let vertex = 0; vertex < sources.count; vertex += 1) {
        const k = vertex * 12;
        const c = sources.coords;
        const starved = sources.starved[vertex] * height * starve;
        const f = sources.facing;
        place(names[sources.part[vertex]], c, k, starved, one, [f[vertex * 6], f[vertex * 6 + 1], f[vertex * 6 + 2]], 0);
        const blend = sources.blend[vertex];
        if (blend > 0 && sources.part2[vertex] !== sources.part[vertex]) {
          place(names[sources.part2[vertex]], c, k + 6, starved, other, [f[vertex * 6 + 3], f[vertex * 6 + 4], f[vertex * 6 + 5]], 0);
          for (let axis = 0; axis < 3; axis += 1) one[axis] += (other[axis] - one[axis]) * blend;
        }
        smooth.set(one, vertex * 3);
      }
    }
    if (!BASE_BODY.shoulderPlus[design]) shoulderDesign(design, { rig, parts, frames, placed, smooth, shoulderKeep, height });
  }
  if (family && sources.builds) baseFamily(rig, frames, placed, height, family, alongOf, joints.gameHead ?? joints.head, across);
  if (joints.boundHead && frames.neck) neckToHead(rig, placed, joints.boundHead, joints.boundNeck, frames.neck, height);
  // (PROOF OF CONCEPT: the widths ANSUR II measures, when asked for (globalThis.BASE_WIDTHS, a list): biacromial (across the
  // shoulders' tops, from 1 cm above the shoulder joints up), chest breadth (the trunk's own skin across at the nipples, 0.72 of
  // height) and bideltoid (everything across, arms included, from 12 cm under the joints to them), in the bind pose.)
  if (globalThis.BASE_WIDTHS) {
    const trunk = frames.trunk;
    const joint = joints.lShoulder;
    const [tJ] = axisCoords(trunk, joint);
    let biacromial = 0;
    let chest = 0;
    let bideltoid = 0;
    for (let vertex = 0; vertex < placed.length / 3; vertex += 1) {
      const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
      const [t, , across] = axisCoords(trunk, p);
      const up = (t - tJ) * trunk.length;
      const name = names[sources.part[vertex]];
      const armish = /Upper|Fore/.test(name) || (sources.blend[vertex] > 0 && /Upper|Fore/.test(names[sources.part2[vertex]]));
      if (name === 'neck') continue;
      if (!armish && up > -0.01 * height / 1.8) biacromial = Math.max(biacromial, Math.abs(across));
      if (up > -0.12 * height / 1.8 && up <= 0.01 * height / 1.8) bideltoid = Math.max(bideltoid, Math.abs(across));
      if (!armish && Math.abs(p[1] - 0.72 * height) < 0.015 * height / 1.8) chest = Math.max(chest, Math.abs(across));
    }
    const spanT = rig.spans.trunk;
    const rowsT = ringRows(parts.trunk, spanT[0], spanT[1]);
    const [tN] = axisCoords(trunk, [joint[0], 0.72 * height, 0]);
    const at = Math.min(BASE_BODY.stops, Math.max(0, Math.round(((tN - spanT[0]) / (spanT[1] - spanT[0])) * BASE_BODY.stops)));
    // (The left upper arm's girth at 50% and 70% of it: 2π times its points' mean distance off its axis there.)
    const girth = (share) => {
      let sum = 0;
      let n = 0;
      for (let vertex = 0; vertex < placed.length / 3; vertex += 1) {
        if (names[sources.part[vertex]] !== 'lUpper') continue;
        const [t, x, y] = axisCoords(frames.lUpper, [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]]);
        if (Math.abs(t - share) < 0.1) {
          sum += Math.hypot(x, y);
          n += 1;
        }
      }
      return n ? (2 * Math.PI * sum) / n : 0;
    };
    // (A section's length round a part at t: its points within `band` of t, round their middle in angle order.)
    const around = (name, share, band) => {
      const pts = [];
      for (let vertex = 0; vertex < placed.length / 3; vertex += 1) {
        if (names[sources.part[vertex]] !== name) continue;
        const [t, x, y] = axisCoords(frames[name], [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]]);
        if (Math.abs(t - share) < band) pts.push([x, y]);
      }
      if (pts.length < 4) return 0;
      const cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
      const cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
      // (The outermost point in each of 24 sectors: the section's outline, not the points inside it.)
      const sectors = new Array(24).fill(null);
      for (const [x, y] of pts) {
        const k = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 24) % 24;
        const r = Math.hypot(x - cx, y - cy);
        if (!sectors[k] || r > sectors[k][2]) sectors[k] = [x, y, r];
      }
      const ring = sectors.filter(Boolean);
      let length = 0;
      for (let index = 0; index < ring.length; index += 1) length += Math.hypot(ring[(index + 1) % ring.length][0] - ring[index][0], ring[(index + 1) % ring.length][1] - ring[index][1]);
      return length;
    };
    // (The deltoid: its standoff outside the shoulder joint at the joint's height (±1.5 cm), its height over the joint within
    // 4 cm of it across.)
    let standoffAt = -1;
    let standoff = 0;
    let capTop = -Infinity;
    const [, , jointAcross] = axisCoords(trunk, joint);
    for (let vertex = 0; vertex < placed.length / 3; vertex += 1) {
      const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
      if (names[sources.part[vertex]] === 'neck') continue;
      const [t, , across] = axisCoords(trunk, p);
      const up = (t - tJ) * trunk.length;
      if (Math.sign(across) !== Math.sign(jointAcross)) continue;
      if (Math.abs(up) < 0.015 * height / 1.8 && Math.abs(across) - Math.abs(jointAcross) > standoff) {
        standoff = Math.abs(across) - Math.abs(jointAcross);
        standoffAt = vertex;
      }
      if (Math.abs(Math.abs(across) - Math.abs(jointAcross)) < 0.04 * height / 1.8) capTop = Math.max(capTop, up);
    }
    globalThis.BASE_WIDTHS.push({ biacromial: 2 * biacromial, chest: 2 * chest, bideltoid: 2 * bideltoid, ring: 2 * rowsT[at][1], girth50: around('lUpper', 0.5, 0.12), girth70: girth(0.7), neck: around('neck', 0.3, 0.1), standoff, capTop });
  }
  const positions = new Float32Array(render.count * 3);
  for (let index = 0; index < render.count; index += 1) positions.set(placed.subarray(render.source[index] * 3, render.source[index] * 3 + 3), index * 3);
  return { positions, sources: placed, herShare };
}

/**
 * PROOF OF CONCEPT: a shoulder design (BASE_BODY.shoulder 'A', 'B', 'C' or 'E') applied to the placed points (changed in place),
 * within BASE_BODY.shoulderZone. The loft's surface there (v7's) is the trunk's ring at its t and the upper arm's at its own,
 * this body's (`parts`); a point outside both is moved to the nearer of the two, along its own line out from that axis.
 */
function shoulderDesign(design, { rig, parts, frames, placed, smooth, shoulderKeep, height }) {
  const zone = BASE_BODY.shoulderZone;
  const ease = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const rings = Object.fromEntries(['trunk', 'lUpper', 'rUpper'].map((name) => {
    const [from, to] = rig.spans[name];
    const rows = ringRows(parts[name], from, to);
    const count = BASE_BODY.stops;
    return [name, (t) => {
      const at = Math.min(count, Math.max(0, ((t - from) / (to - from || 1)) * count));
      const index = Math.min(count - 1, Math.floor(at));
      const f = at - index;
      return rows[index].map((value, axis) => value + (rows[index + 1][axis] - value) * f);
    }];
  }));
  // Where a point lies on a part: [t, depth, width] from the ring's centre, the ring's radius along that line, and its
  // distance out.
  const onRing = (name, p, t0 = null) => {
    const frame = frames[name];
    const [t, x, y] = axisCoords(frame, p);
    const [depth, width, offset] = rings[name](t0 ?? t);
    const dx = x - offset;
    const r = Math.hypot(dx, y) || 1e-9;
    const radius = 1 / Math.hypot(dx / r / (depth || 1e-6), y / r / (width || 1e-6));
    return { t, dx, y, r, radius, frame };
  };
  // The move that lays `p` on the loft's surface (zero where it is inside it), and the point's zone weight.
  const moveOf = (p) => {
    const trunk = onRing('trunk', p, null);
    const tTrunk = Math.min(1, trunk.t);
    const trunkAt = onRing('trunk', p, tTrunk);
    const arm = ['lUpper', 'rUpper'].map((name) => onRing(name, p)).sort((a, b) => a.r / a.radius - b.r / b.radius)[0];
    const wTrunk = ease(zone.trunkT[0], zone.trunkT[1], trunk.t) * ease(zone.lateral[0], zone.lateral[1], Math.abs(trunk.y / trunk.r));
    const wArm = arm.t > -0.6 ? (1 - ease(zone.armT[0], zone.armT[1], arm.t)) * (1 - ease(zone.armReach[0], zone.armReach[1], arm.r / arm.radius)) * ease(zone.trunkT[0] - 0.1, zone.trunkT[0], trunk.t) : 0;
    const weight = Math.max(wTrunk, wArm);
    if (weight <= 0) return { weight, move: [0, 0, 0], arm };
    const candidates = [];
    const out = (ring, excess) => {
      const scale = -excess / ring.r;
      return vec.add(vec.scale(ring.frame.depthAxis, ring.dx * scale), vec.scale(ring.frame.widthAxis, ring.y * scale));
    };
    const trunkExcess = trunkAt.r - trunkAt.radius;
    const armExcess = arm.t >= zone.armRoot ? arm.r - arm.radius : Infinity;
    if (trunkExcess <= 0 || armExcess <= 0) return { weight, move: [0, 0, 0], arm };
    candidates.push([trunkExcess, out(trunkAt, trunkExcess)]);
    if (Number.isFinite(armExcess)) candidates.push([armExcess, out(arm, armExcess)]);
    candidates.sort((a, b) => a[0] - b[0]);
    return { weight, move: candidates[0][1], arm };
  };
  const scale = height / 1.8;
  const count = placed.length / 3;
  const shifts = new Float32Array(count * 3);
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (rig.names[rig.sources.part[vertex]] === 'neck') continue;
    const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
    let shift = [0, 0, 0];
    if (design === 'A') {
      const { weight, move } = moveOf(p);
      shift = vec.scale(move, weight);
    } else if (design === 'C' || design === 'E') {
      const { weight } = moveOf(p);
      if (weight > 0) {
        const { move } = moveOf([smooth[vertex * 3], smooth[vertex * 3 + 1], smooth[vertex * 3 + 2]]);
        shift = vec.scale(move, weight * (design === 'E' ? 1 - shoulderKeep : 1));
      }
    } else if (design === 'B') {
      const { weight, arm } = moveOf(p);
      if (weight > 0) {
        const trunk = frames.trunk;
        const [, , y] = axisCoords(trunk, p);
        // In towards the midline (the trunk's width axis), down along the trunk.
        shift = vec.add(vec.scale(trunk.widthAxis, -Math.sign(y) * BASE_BODY.girdleIn * scale * weight), vec.scale(trunk.axis, -BASE_BODY.girdleDrop * scale * weight));
        // The deltoid's bulk beyond the arm's ring, on its outer side (away from the trunk), scaled down.
        const excess = arm.r - arm.radius;
        const outer = -Math.sign(y) * vec.dot(vec.add(vec.scale(arm.frame.depthAxis, arm.dx / arm.r), vec.scale(arm.frame.widthAxis, arm.y / arm.r)), trunk.widthAxis);
        if (excess > 0 && outer > 0 && arm.t >= zone.armRoot) {
          const radial = vec.add(vec.scale(arm.frame.depthAxis, arm.dx / arm.r), vec.scale(arm.frame.widthAxis, arm.y / arm.r));
          shift = vec.add(shift, vec.scale(radial, -(1 - BASE_BODY.deltoidScale) * excess * outer * weight));
        }
      }
    }
    shifts.set(shift, vertex * 3);
  }
  // The moves smoothed over the surface (BASE_BODY.shoulderSmooth rounds, each point to its neighbours' mean): the zone's
  // edge, and the neck's points it leaves where they are, eased, not stepped (a ridge round the neck's foot otherwise).
  const neighbours = Array.from({ length: count }, () => new Set());
  const tri = rig.triangles;
  for (let corner = 0; corner < tri.length; corner += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => rig.render.source[tri[corner + k]]);
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  const lists = neighbours.map((set) => [...set]);
  const smoothed = laplacian(shifts, lists, BASE_BODY.shoulderSmooth);
  for (let index = 0; index < placed.length; index += 1) placed[index] += smoothed[index];
}

/**
 * The skin about the neck's top kept inside the game's head: the move that brings `point` within BASE_BODY.headHold of the
 * head's radius (0.055 of height, body.js headRadius) of the head's centre `head`, none of it below `from` of the way up the
 * neck and all of it from `to`. `t`, `x`, `y` the point's place on the neck's line (axisCoords): the hold is for what lies
 * behind the line and at its sides, and the throat's sides beside the jaw (seen from behind, they rose past the narrower jaw
 * in a fin); only the throat's middle under the chin is the neck's own, and nothing is held that stands more than the head's
 * radius out from the line (none of it from 1.5 radii).
 */
/**
 * The neck's top taken up to the head as it is drawn (BASE_BODY.head), on the placed points (changed in place), the neck's
 * own and the trunk's that climb it: drawn up along the head's upright axis by as much as the head's underside stands higher
 * (its `lift`, and half its radius' `smaller`: the jaw's angle and the hairline at the nape lie about half a radius under its
 * middle), none of it below `draw`'s first share of the way up the neck and all of it from the second, nor on what stands
 * further out from the neck's line than the head is wide (the trapezius' slope to the shoulder).
 * `head` and `neck` the joints the head bone stands on at rest (baseBindJoints boundHead, boundNeck: its upright axis the line
 * between them, not as the skin's own neck leans), `frame` the skin's neck's.
 */
function neckToHead(rig, placed, head, neck, frame, height) {
  const { size, lift, smaller, draw } = BASE_BODY.head;
  const radius = 0.055 * height;
  const raise = vec.scale(vec.normalize(vec.sub(head, neck)), (lift + 0.5 * size * smaller) * radius);
  const rise = (a, b, value) => {
    const u = Math.min(1, Math.max(0, (value - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const { names, sources } = rig;
  const under = names.map((name) => name === 'neck' || name === 'trunk');
  for (let vertex = 0; vertex < placed.length / 3; vertex += 1) {
    if (!under[sources.part[vertex]]) continue;
    const [t, x, y] = axisCoords(frame, [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]]);
    if (t <= draw[0]) continue;
    const up = rise(draw[0], draw[1], t) * (1 - rise(radius, 1.6 * radius, Math.hypot(x, y)));
    for (let axis = 0; axis < 3; axis += 1) placed[vertex * 3 + axis] += raise[axis] * up;
  }
}
function headHold(point, head, height, t, x, y, [from, to] = [0.3, 0.7]) {
  const rise = (from, to, value) => {
    const u = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return u * u * (3 - 2 * u);
  };
  const off = vec.sub(point, head);
  const reach = vec.length(off);
  const radius = 0.055 * height * (1 - BASE_BODY.head.smaller);
  const hold = BASE_BODY.headHold * radius;
  if (reach <= hold) return [0, 0, 0];
  const r0 = Math.hypot(x, y) || 1;
  const behind = Math.max(1 - rise(-0.2, 0.3, x / r0), rise(0.35, 0.7, Math.abs(y) / r0));
  // (Under the head: what stands farther out from the neck's line than the head is wide, the trapezius' slope to the
  // shoulder, is not the head's to hold.)
  const under = 1 - rise(radius, 1.5 * radius, r0);
  return vec.scale(off, -((reach - hold) / reach) * behind * under * rise(from, to, t));
}

/**
 * PROOF OF CONCEPT, round 11: D's rest shape made smaller and sharper (BASE_BODY.shoulderPlus, `spec`), on the placed points
 * (changed in place). Each point's moves are worked out on its own, then smoothed over the surface as the round 10 designs' are.
 */
function shoulderPlus(own, { rig, parts, frames, placed, shoulderKeep, height, joints, waste = 0, neckGirth = 0 }) {
  // (A woman's own amounts over the design's, `female`: round 14.)
  const spec = rig.sex === 'female' && own.female ? { ...own, ...own.female } : own;
  const ease = (a, b, x) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const scale = height / 1.8;
  const count = placed.length / 3;
  const trunk = frames.trunk;
  const neck = frames.neck;
  const shifts = new Float32Array(count * 3);
  const sides = ['l', 'r'].map((side) => {
    const name = `${side}Upper`;
    const joint = joints[`${side}Shoulder`];
    const [, , across] = axisCoords(trunk, joint);
    return { side, name, fore: `${side}Fore`, joint, across, frame: frames[name] };
  });
  // The neck's radius at its foot (its points' mean distance off its axis near t 0).
  let neckR = 0;
  let neckN = 0;
  for (let vertex = 0; vertex < count; vertex += 1) {
    if (rig.names[rig.sources.part[vertex]] !== 'neck') continue;
    const [t, x, y] = axisCoords(neck, [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]]);
    if (t < 0.25) {
      neckR += Math.hypot(x, y);
      neckN += 1;
    }
  }
  neckR = neckN ? neckR / neckN : 0.06 * scale;
  // Each arm's mean radius about its own axis, by fifths of its t (for the girth floor; the mesh has only a few points to a
  // tenth of an upper arm).
  const armSum = new Map();
  for (let vertex = 0; vertex < count; vertex += 1) {
    const partName = rig.names[rig.sources.part[vertex]];
    if (!/Upper$/.test(partName)) continue;
    const [t, x, y] = axisCoords(frames[partName], [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]]);
    const key = `${partName}|${Math.round(t / 0.2)}`;
    const [sum, n] = armSum.get(key) ?? [0, 0];
    armSum.set(key, [sum + Math.hypot(x, y), n + 1]);
  }
  const armMean = new Map([...armSum].map(([key, [sum, n]]) => [key, sum / n]));
  const armFloorAt = (t) => {
    const [t0, t1] = [0.3, 0.7];
    const [g0, g1] = BASE_BODY.armFloor;
    return g0 + (g1 - g0) * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
  };
  for (let vertex = 0; vertex < count; vertex += 1) {
    const partName = rig.names[rig.sources.part[vertex]];
    const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
    // (The neck's foot goes down with the trapezius beside it, eased out up the neck: the neck drawn out, not torn from it.)
    if (partName === 'neck') {
      const [tN, xN, yN] = axisCoords(neck, p);
      let shift = vec.scale(trunk.axis, -spec.trap * scale * (1 - ease(0, 0.6, tN)));
      // (Its top tucked in under the game's head, `neckTuck` of its radius at the top: its cut edge stood out past the skull
      // behind and at the sides in a ragged collar.)
      const tuck = (spec.neckTuck ?? 0) * ease(0.5, 0.95, tN);
      shift = vec.add(shift, vec.add(vec.scale(neck.depthAxis, -xN * tuck), vec.scale(neck.widthAxis, -yN * tuck)));
      // (Its top kept inside the game's head: within `headHold` of the head's radius (0.055 of height, body.js headRadius) of its
      // centre. Its cut top stood above the head's underside behind and at the sides, and its far wall's inside showed through
      // the open top in a fin.)
      const head = joints.gameHead ?? joints.head;
      if (head) shift = vec.add(shift, headHold(vec.add(p, shift), head, height, tN, xN, yN));
      // (Its top ring trimmed to the head's underside: nothing of it above `neckCut` of the head's radius under the head's
      // centre, along the neck, pushed down to that plane. Its sides beside the jaw rose past the game's narrower jaw and showed
      // from behind in a fin.)
      if (head && spec.neckCut) {
        const after = vec.add(p, shift);
        const along = vec.dot(vec.sub(after, head), neck.axis);
        const plane = -spec.neckCut * 0.055 * height * (1 - BASE_BODY.head.smaller);
        if (along > plane) shift = vec.add(shift, vec.scale(neck.axis, -(along - plane) * ease(0.2, 0.5, tN)));
      }
      shifts.set(shift, vertex * 3);
      continue;
    }
    const [tT, , yT] = axisCoords(trunk, p);
    const side = sides[yT * sides[0].across > 0 ? 0 : 1];
    const [tA, xA, yA] = axisCoords(side.frame, p);
    const rA = Math.hypot(xA, yA) || 1e-9;
    const radialA = vec.add(vec.scale(side.frame.depthAxis, xA / rA), vec.scale(side.frame.widthAxis, yA / rA));
    let shift = [0, 0, 0];
    // The zone: the trunk's top (t over 0.8) and the arm's root; the lateral share, how far out from the neck to the acromion.
    const out = Math.abs(yT) / Math.abs(side.across);
    const top = ease(0.78, 0.9, tT);
    const isArm = /Upper$|Fore$/.test(partName) || rig.sources.blend[vertex] > 0 && /Upper$|Fore$/.test(rig.names[rig.sources.part2[vertex]]);
    const armRoot = isArm ? 1 - ease(0.2, 0.4, tA) : 0;
    const zone = Math.max(top * ease(0.3, 0.7, out), armRoot);
    // In: towards the midline across the trunk: the trunk's cap only, the arm's own skin kept round its bone (the rig's
    // shoulder joint), so the shoulder comes in to the arm rather than the arm off its joint.
    if (!isArm) shift = vec.add(shift, vec.scale(trunk.widthAxis, -Math.sign(yT) * spec.in * scale * top * ease(0.3, 0.7, out)));
    // The trapezius down: most beside the neck (off the neck's own skin), trapKeep of it at the acromion, none below the top.
    const [, nx, ny] = axisCoords(neck, p);
    const offNeck = ease(neckR * 0.95, neckR * 1.35, Math.hypot(nx, ny));
    // (Beside the neck, on the trunk's own skin off its foot, the whole drop, as the neck's foot gets: the trunk's points there
    // were left up while the neck's went down, and stood behind the head in two horns.)
    // (A wasted body's top line slopes down from the neck, as the emaciated reference's: less of the drop beside the neck
    // (`slopeNeck` of it taken off), and `slope` (m) more out at the acromion: no flat ledge out to a corner.)
    const near = 1 - (spec.slopeNeck ?? 0) * waste * (1 - Math.min(1, out));
    const lateralKeep = near * (1 - (1 - spec.trapKeep) * Math.min(1, out)) + ((spec.slope ?? 0) * waste * Math.min(1, out)) / spec.trap;
    const trap = spec.trap * scale * top * (offNeck * lateralKeep + (1 - offNeck)) * (isArm ? 1 - ease(-0.2, 0.1, tA) : 1);
    shift = vec.add(shift, vec.scale(trunk.axis, -trap));
    if (isArm || zone > 0) {
      // The deltoid: its bulk beyond the arm's mean radius at this t, on its outer side, cut to `deltoid`.
      const outer = -Math.sign(yT) * vec.dot(radialA, trunk.widthAxis);
      const capW = (1 - ease(0.25, 0.45, tA)) * ease(-0.45, -0.15, tA);
      // (Its share kept by the body's own muscle there (`shoulderKeep`, the arm's development x leanness x definition: a
      // bodybuilder's 1, an average man's about 0.15) and less again on a wasted body: round 17: the shoulder had the
      // same muscle at every build. `deltoidBy` [least, most] of `deltoid`'s share.)
      const keepShare = Math.min(1, spec.deltoid * (spec.deltoidBy[0] + (spec.deltoidBy[1] - spec.deltoidBy[0]) * Math.min(1, shoulderKeep)) * (1 - spec.deltoidWaste * waste));
      if (outer > 0 && capW > 0) shift = vec.add(shift, vec.scale(radialA, -(1 - keepShare) * 0.35 * rA * outer * capW));
      // The corner: the cap's profile in the plane of the trunk's width and its axis, about the shoulder joint, squared.
      const rel = vec.sub(p, side.joint);
      const u = -Math.sign(yT) * vec.dot(rel, trunk.widthAxis) * -1;
      const lateral = Math.abs(vec.dot(rel, trunk.widthAxis));
      // (Only above the joint's level: the profile's upper quarter, from out to up; below it the arm hangs.)
      const up = Math.max(0, vec.dot(rel, trunk.axis));
      const r = Math.hypot(lateral, up);
      if (r > 1e-6 && r < 0.09 * scale && u !== 0) {
        const c = lateral / r;
        const s = up / r;
        const square = 1 / (c ** 4 + s ** 4) ** 0.25;
        // (Not on a wasted body (round 16): its shoulder slopes from the neck to a rounded deltoid, no ledge and corner.)
        const grow = spec.square * (1 - waste) * (square - 1) * (1 - ease(0.05 * scale, 0.09 * scale, r));
        const dir = vec.normalize(vec.add(vec.scale(trunk.widthAxis, Math.sign(vec.dot(rel, trunk.widthAxis)) * c), vec.scale(trunk.axis, s)));
        shift = vec.add(shift, vec.scale(dir, r * grow));
      }
      // The deltoid's front and back edges: grooves at about 35 degrees round from the front and the back, towards the outside.
      if (isArm && tA > -0.05 && tA < 0.45) {
        const angle = Math.atan2(yA, xA) * Math.sign(vec.dot(side.frame.widthAxis, trunk.widthAxis) * -Math.sign(yT) || 1);
        const groove = (a) => Math.max(0, 1 - ((angle - a) / 0.3) ** 2) ** 2;
        const along = ease(-0.05, 0.08, tA) * (1 - ease(0.3, 0.45, tA));
        const depth = spec.edge * scale * (0.6 + 1.4 * Math.min(1, shoulderKeep)) * along * (groove(0.6) + groove(Math.PI - 0.6));
        shift = vec.add(shift, vec.scale(radialA, -depth));
      }
    }
    // The armpit's hollow, on the trunk's own skin under the arm.
    if (spec.pit && !isArm) {
      const rel = vec.sub(p, side.joint);
      const below = -vec.dot(rel, trunk.axis);
      const fore = vec.dot(rel, trunk.depthAxis);
      const depthW = Math.max(0, 1 - (fore / (0.06 * scale)) ** 2) ** 2;
      const pitTo = spec.pitTo ?? 0.14;
      const heightW = ease(0.02 * scale, 0.05 * scale, below) * (1 - ease((pitTo - 0.04) * scale, pitTo * scale, below));
      const nearW = ease(0.55, 0.8, out);
      shift = vec.add(shift, vec.scale(trunk.widthAxis, -Math.sign(yT) * spec.pit * scale * depthW * heightW * nearW));
    }
    // The arm thinner about its own axis, but not under the emaciated reference's own arm (`armFloor`: her girth at that
    // share of the upper arm, m at 1.68 m, a man's by `maleGirth`), times `floorBy` for an unwasted body: a starved arm is hers,
    // a thin or an average one larger (round 16: at 72% of its girth and thinned, a woman's arm was a tube under hers).
    if (isArm) {
      const own = frames[partName] ?? side.frame;
      const [t, x, y] = axisCoords(own, p);
      const ease0 = /Upper$/.test(partName) ? ease(spec.armFrom, spec.armTo, t) : 1;
      let k = (1 - spec.arm) * ease0;
      const mean = armMean.get(`${partName}|${Math.round(t / 0.2)}`);
      if (mean && /Upper$/.test(partName)) {
        const floor = armFloorAt(t) * (height / 1.68) * (rig.sex === 'female' ? 1 : BASE_BODY.maleGirth) * (1 + spec.floorBy * (1 - waste)) / (2 * Math.PI);
        // (Grown to it where the model's own arm is under it, at most `floorGrow` of its girth more.)
        // (On a wasted body only, by how wasted: thin and average arms keep their own girth.)
        k += (Math.min(k, Math.max(-BASE_BODY.floorGrow, 1 - floor / mean)) - k) * waste;
      }
      shift = vec.add(shift, vec.add(vec.scale(own.depthAxis, -x * k), vec.scale(own.widthAxis, -y * k)));
    }
    shifts.set(shift, vertex * 3);
  }
  const neighbours = Array.from({ length: count }, () => new Set());
  const tri = rig.triangles;
  for (let corner = 0; corner < tri.length; corner += 3) {
    const [a, b, c] = [0, 1, 2].map((k) => rig.render.source[tri[corner + k]]);
    neighbours[a].add(b).add(c);
    neighbours[b].add(a).add(c);
    neighbours[c].add(a).add(b);
  }
  // (Smoothed less than the round 10 designs (half as many rounds): the corner and the edges are the point.)
  // The chest's width (`chest`, round 13: "get the chest to the original width", v7's): the trunk's own skin (not an
  // arm's, nor blending into one) across, row by row of its t (`chestRows` wide), against the loft's ring there (this body's,
  // the ring v7 draws: parts.trunk), scaled across (the trunk's width axis; its depth and the model's surface kept) by that
  // ratio, `chest` of the way; the ratio smoothed along the trunk and eased to none below `chestFrom` (the waist) and above
  // `chestTo` (the shoulders, D+'s own).
  if (spec.chest) {
    const spanT = rig.spans.trunk;
    const rows = ringRows(parts.trunk, spanT[0], spanT[1]);
    const stops = BASE_BODY.stops;
    const ringWidth = (t) => {
      const at = Math.min(stops, Math.max(0, ((t - spanT[0]) / (spanT[1] - spanT[0] || 1)) * stops));
      const index = Math.min(stops - 1, Math.floor(at));
      return rows[index][1] + (rows[index + 1][1] - rows[index][1]) * (at - index);
    };
    const bin = spec.chestRows;
    const widest = new Map();
    for (let vertex = 0; vertex < count; vertex += 1) {
      const name = rig.names[rig.sources.part[vertex]];
      const blendArm = rig.sources.blend[vertex] > 0 && /Upper|Fore/.test(rig.names[rig.sources.part2[vertex]]);
      if (name !== 'trunk' || blendArm) continue;
      const p = [placed[vertex * 3] + shifts[vertex * 3], placed[vertex * 3 + 1] + shifts[vertex * 3 + 1], placed[vertex * 3 + 2] + shifts[vertex * 3 + 2]];
      const [t, , across] = axisCoords(trunk, p);
      const row = Math.round(t / bin);
      widest.set(row, Math.max(widest.get(row) ?? 0, Math.abs(across)));
    }
    const ratioAt = (t) => {
      // (Over the three rows about t: a row's widest point is one vertex, and alone it was noisy.)
      let sum = 0;
      let n = 0;
      for (let k = -1; k <= 1; k += 1) {
        const row = Math.round(t / bin) + k;
        const own = widest.get(row);
        if (own > 0) {
          sum += ringWidth(row * bin) / own;
          n += 1;
        }
      }
      return n ? sum / n : 1;
    };
    for (let vertex = 0; vertex < count; vertex += 1) {
      const name = rig.names[rig.sources.part[vertex]];
      if (name === 'neck') continue;
      const p = [placed[vertex * 3] + shifts[vertex * 3], placed[vertex * 3 + 1] + shifts[vertex * 3 + 1], placed[vertex * 3 + 2] + shifts[vertex * 3 + 2]];
      const [t, , across] = axisCoords(trunk, p);
      const weight = ease(spec.chestFrom[0], spec.chestFrom[1], t) * (1 - ease(spec.chestTo[0], spec.chestTo[1], t));
      if (weight <= 0) continue;
      const k = 1 + spec.chest * weight * (ratioAt(t) - 1);
      // (The arm's own skin is left on its bone: the arms hang clear of the trunk by the physics' own rule, pose.js armClear.)
      if (/Upper|Fore/.test(name)) continue;
      const move = across * (k - 1);
      for (let axis = 0; axis < 3; axis += 1) shifts[vertex * 3 + axis] += trunk.widthAxis[axis] * move;
    }
  }
  const smoothed = laplacian(shifts, neighbours.map((set) => [...set]), BASE_BODY.shoulderSmooth / 2);
  for (let index = 0; index < placed.length; index += 1) placed[index] += smoothed[index];
  // The neck's girth (round 17: the neck did not follow the body), after the moves above are smoothed in (round 18:
  // measured before them, the smoothing then moved the neck's points along it and the girth came out off the target): its middle (`neckBand` of its t) scaled round its
  // axis to the body's own neck girth (loftbody.js baseNeckGirth), its section's length measured as the outline of its points
  // there; eased out up to the head's underside and down into the trapezius (`neckEase`, t).
  if (neckGirth > 0) {
    const pts = [];
    for (let vertex = 0; vertex < count; vertex += 1) {
      if (rig.names[rig.sources.part[vertex]] !== 'neck') continue;
      const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
      const [t, x, y] = axisCoords(neck, p);
      if (t > spec.neckBand[0] && t < spec.neckBand[1]) pts.push([x, y]);
    }
    if (pts.length > 6) {
      const cx = pts.reduce((sum, q) => sum + q[0], 0) / pts.length;
      const cy = pts.reduce((sum, q) => sum + q[1], 0) / pts.length;
      const sectors = new Array(24).fill(null);
      for (const [x, y] of pts) {
        const k = Math.floor(((Math.atan2(y - cy, x - cx) + Math.PI) / (2 * Math.PI)) * 24) % 24;
        const r = Math.hypot(x - cx, y - cy);
        if (!sectors[k] || r > sectors[k][2]) sectors[k] = [x, y, r];
      }
      const ring = sectors.filter(Boolean);
      let length = 0;
      for (let index = 0; index < ring.length; index += 1) length += Math.hypot(ring[(index + 1) % ring.length][0] - ring[index][0], ring[(index + 1) % ring.length][1] - ring[index][1]);
      const k = Math.min(spec.neckMost[1], Math.max(spec.neckMost[0], neckGirth / (length || neckGirth)));
      for (let vertex = 0; vertex < count; vertex += 1) {
        if (rig.names[rig.sources.part[vertex]] !== 'neck') continue;
        const p = [placed[vertex * 3], placed[vertex * 3 + 1], placed[vertex * 3 + 2]];
        const [t, x, y] = axisCoords(neck, p);
        const weight = ease(spec.neckEase[0], spec.neckEase[1], t) * (1 - ease(spec.neckEase[2], spec.neckEase[3], t));
        const grow = (k - 1) * weight;
        for (let axis = 0; axis < 3; axis += 1) placed[vertex * 3 + axis] += (neck.depthAxis[axis] * (x - cx) + neck.widthAxis[axis] * (y - cy)) * grow;
      }
    }
  }
}

/** The drawn points' texture coordinates: each in its part's tile at its t and share round (skindetail.js detailUv). */
export function baseBodyUvs(rig) {
  const uvs = new Float32Array(rig.render.count * 2);
  const tileOf = Object.fromEntries(rig.names.map((name) => [name, detailUv(name)]));
  for (let index = 0; index < rig.render.count; index += 1) uvs.set(tileOf[rig.names[rig.render.part[index]]]({ t: rig.render.t[index] }, rig.render.u[index]), index * 2);
  return uvs;
}
