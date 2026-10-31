// A low-polygon body, built the way game characters are: each part is a
// loft of elliptical rings along its bones, with a designed sculptProfile (the
// deltoid cap, the biceps, the narrow elbow, the calf), and the parts
// overlap where they meet rather than being fused. ~3k triangles for the
// whole body, and no lumps: every ring is a clean ellipse. 'faceted' drops to
// seven sides and flat normals, for a low-poly art look.

import { P } from './body.js';
import { relax, skinWeightsSteps } from './bodymesh.js';
import { vec } from './pose.js';
import { BONE, bindPoints, boneFrames } from './rig.js';
import { glovedFists, outfitOf, RAGS, ragHemTorn, ragSleeveTorn, ragTear, ragTorn } from './outfits.js';
import { DETAIL_ARMOUR, DETAIL_MAPS, mailUv, measureRings, plateUvAt, tileUv } from './detailmaps.js';
import { detailUv, FLAT_UV } from './skindetail.js';
import { SCULPT, limbShapes, sculptProfile, neckShape, sculptCoverShare, sculptTraits, trunkProfiles, trunkShapes } from './sculpt.js';
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
  kosode: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.2, sleeveLoose: 1.42 },
  // A medieval tunic: to the waist as a shirt, then a skirt to mid-thigh (`skirt`, thigh shares), belted.
  tunic: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.7, sleeveLoose: 1.26, skirt: 0.5 },
  // A shirt worn to rags (outfits.js RAGS: where it is torn away, each man's own): a piece of cloth wrapped round the trunk, lofted
  // to below its lowest jag and down the arm past the longest sleeve, then cut. Coarse on purpose (`torn`: `rings` and `sides` for
  // the trunk, `sleeveRings` and `sleeveSides` for a sleeve): whole quads go, so the opening is a few big notches and the hem
  // jags by the ring spacing; a few hundred triangles in all.
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
  // A brigandine's rivet heads: three rows to a ring, each `size` of its column
  // across (and as tall, along the piece), a hair proud of the cloth.
  studs: { rowsPerRing: 3, size: 0.3, tall: 0.07, lift: 0.012 },
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
  joust: { tassetTo: 0.68, tassetLames: 5, pauldron: 1.8, pauldronLames: 4, mail: [0.1, 0.4, 1.3] },
  ridged: { ridge: 0.18, width: 0.6, fade: 0.12, flare: 0.05, flareOver: 0.06, rope: 0.035 },
  // Its front drawn sharp (breastplateOn, not in a crowd): the two halves as
  // faces of their own, `lift` proud of the plate, `rows` to a ring and
  // `steps` across each half, so the ridge is an edge, not a curve; rivet
  // heads (`rivet` rad across) along the neck and the hem; a leather strap
  // and buckle on each shoulder; on a knight's full plate the lance rest
  // (arrêt) on the right breast.
  ridgedFront: { lift: 0.012, rows: 2, steps: 8, rivet: 0.055, rivetsNeck: 5, rivetsHem: 7, strapAt: 1.0, strapWidth: 0.09, lanceRest: [-0.55, 0.62, 0.12, 0.05, 0.05] },
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
  mesh.uvs.set(index, plateUvAt(ringMeasures.get(rings), place, angle));
}

/**
 * Add one loft to the mesh arrays.
 * @param rings [{ center, depthAxis, widthAxis, depth, width }]
 */
function loft(mesh, rings, sides, { capStart = true, capEnd = true, color = 'skin', inflate = 1, bones = () => null, shape = null, bend = null, uv = null, part = null, holes = null } = {}) {
  const start = mesh.positions.length / 3;
  // A colour may be a pattern: a function of the ring (and its index), and
  // of the angle round it (0 at the front, as the depth axis points).
  const paint = typeof color === 'function' ? color : () => color;
  // Steel with the plate's maps (`mesh.steelUv`, detailmaps.js): a loft all of steel (every point of it steel, steel2 or gilt) takes
  // the plate tile's coordinates. (Not a loft of steel and something else: a triangle across the two would read the skin's maps.)
  if (!uv && mesh.steelUv && !holes && rings.every((ring, index) => Array.from({ length: sides }, (_, step) => paint(ring, (step / sides) * Math.PI * 2, index, step)).every((role) => STEEL_ROLES.has(role)))) uv = tileUv(rings, inflate, 'plate');
  // A part with texture coordinates (`uv`: ring, share of the way round -> [u, v]) has its first column of vertices twice, so the
  // texture does not run backwards across the last quad: the pairs are welded again for relaxing and for the normals.
  const stride = uv ? sides + 1 : sides;
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
      // under it, and the skin would come through when a limb moves.
      mesh.weightPositions.push(...vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width))));
      mesh.colors.push(paint(ring, angle, ringIndex, step));
      mesh.bones.push(bones(ring, Math.cos(angle)));
      mesh.ringT.push(ring.t);
      mesh.ringA.push(angle);
      if (uv) {
        mesh.uvs.set(mesh.positions.length / 3 - 1, uv(ring, step / sides));
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
    mesh.ringT.push(rings[row].t);
    mesh.ringA.push(0);
    if (uv) mesh.uvs.set(center, uv(rings[row], 0));
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
const MANICA = { rows: ['steel', 'lace'] };
// The Ming elite's neck guard: steel lames lying over the shoulders and the
// top of the chest, each stepping out over the one below, with a steel band
// round the throat (the kit's `collar`).
const ELITE_GORGET = [0.8, 1.0, 1.36, { lames: 3, base: 'steel2' }];
// The Ming elite's arms: a great spaulder of steel lames over the shoulder,
// and lames down the upper arm (the forearm's to the wrist, in the kit).
const ELITE_ARM = [[-0.24, 1.02, 1.42, { lames: 6, base: 'steel2' }], [-0.2, 0.38, 1.62, { lames: 3, base: 'steel2' }], [0.3, 0.62, 1.58, { lames: 3, base: 'steel2' }]];
const BALTEUS = [0.04, 0.24, 1.14, { rows: ['steel', 'gold', 'steel'] }];
export const ARMOR_KINDS = {
  // Tosei gusoku: a solid cuirass of riveted horizontal steel lames, laced
  // skirt and sleeves, the war mask on the kabuto.
  toseiDo: {
    trunk: [-0.1, 1.02, 1.19, { rows: ['steel', 'steel', 'steel2'], rivets: 4 }], skirt: [0.5, 0.45, 1.24, LACED], collar: 'steel',
    upperArm: [-0.18, 0.45, 1.62, LACED], forearm: [-0.04, -0.04, 1.3, 'top'], thigh: [0.25, 0.85, 1.3, LACED], shin: [0.04, 0.86, 1.34, 'steel'],
  },
  // A rōnin on the road: his odd pieces of tōsei gusoku (the riveted
  // cuirass and its short laced skirt over the kosode, the haidate over the
  // hakama), a sash of two colours, the forearms bound in cloth, gaiters
  // (kyahan) over the shins.
  roninDo: {
    trunk: [-0.08, 1.0, 1.18, { rows: ['steel', 'steel', 'steel2'], rivets: 4 }], skirt: [0.4, 0.36, 1.22, LACED],
    belt: [0.02, 0.14, 1.3, { rows: ['cloth2', 'gold', 'cloth2'] }],
    thigh: [0.05, 0.88, 1.5, { rows: ['steel', 'steel', 'lace'], kozane: true }],
    forearm: [0.3, -0.04, 1.2, 'cloth2'], shin: [0.08, 0.88, 1.3, 'cloth'],
  },
  // Ashigaru: a plain lacquered okegawa-do with the lord's mon, a short skirt,
  // cloth sleeves and simple shin guards.
  okegawa: {
    trunk: [-0.05, 0.96, 1.17, { mon: [0.68, 0.07, 'gold'], base: 'armor' }], skirt: [0.3, 0.4, 1.2, { rows: ['armor', 'lace'], kozane: true }],
    forearm: [-0.04, -0.04, 1.22, 'top'], shin: [0.1, 0.8, 1.3, 'armor'],
  },
  // A sea raider's dō-maru: laced lames round the trunk and a laced skirt,
  // nothing on the arms or legs (often a captured or cast-off piece).
  doMaru: {
    trunk: [-0.05, 0.96, 1.16, { rows: ['armor', 'armor', 'lace'], kozane: true }], skirt: [0.4, 0.42, 1.22, { rows: ['armor', 'lace'], kozane: true }],
  },
  // The same with the great shoulder plates (sode) over bare arms.
  doMaruSode: {
    trunk: [-0.05, 0.96, 1.16, { rows: ['armor', 'armor', 'lace'], kozane: true }], skirt: [0.4, 0.42, 1.22, { rows: ['armor', 'lace'], kozane: true }],
    upperArm: [-0.18, 0.36, 1.6, { rows: ['armor', 'lace'], kozane: true }],
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
    upperArm: [-0.26, 0.62, 1.52, { studded: 12, base: 'cloth', edge: 'cloth2' }], forearm: [-0.04, -0.03, 1.26, 'steel'],
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
  };
}

/** A point on a ring's surface at `angle` (0 at the front), `out` times its radius. */
function onRing(ring, angle, out) {
  return vec.add(ring.center, vec.add(vec.scale(ring.depthAxis, Math.cos(angle) * ring.depth * out), vec.scale(ring.widthAxis, Math.sin(angle) * ring.width * out)));
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
    patchUv(mesh, rings, role, start + index, place, angle);
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
      patchUv(mesh, rings, role, mesh.positions.length / 3 - 1, place, angle);
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
  const add = (up, outward, role) => {
    const place = (up / rows) * last;
    shell.push({ ...ringAt(rings, measure.rising ? place : last - place), out: outward, v: up / tile.rows, role });
  };
  for (let row = 0; row < rows; row += 1) {
    add(row, low, roleOf(row, rows));
    add(row + 1, high, roleOf(row, rows));
  }
  // (In the run's own order, so the faces wind outward as the piece's own loft does.)
  if (!measure.rising) shell.reverse();
  loft(mesh, shell, sides, {
    color: (ring) => ring.role, inflate, shape: (ring) => ring.out / inflate, capStart: false, capEnd: false, bones,
    uv: (ring, share) => [tile.band + share * across, ring.v], holes,
  });
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
  for (let lame = 0; lame < paint.lames; lame += 1) {
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
    addGrid(mesh, rings, grid, lame % 2 ? 'steel2' : 'steel', () => null);
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
function breastplateOn(mesh, rings, inflate, shape, range, { lanceRest = false } = {}, bones) {
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
  if (lanceRest) {
    const [angle, at, across, high, stand] = spec.lanceRest;
    const place = from + (to - from) * at;
    addPatch(mesh, rings, [[place - high * 10, angle - across, out(place, angle, stand)], [place - high * 10, angle + across, out(place, angle, stand)], [place + high * 10, angle + across, out(place, angle, stand)], [place + high * 10, angle - across, out(place, angle, stand)]], 'steel2', bones);
  }
}

/**
 * A brigandine's rivets: the heads of the rivets that hold its plates inside
 * the cloth, in rows (`LOFT.studs.rowsPerRing` to a ring), `paint.studded`
 * round, each row offset half a column from the last; none on the bound
 * edges, the front opening or the splits.
 */
function studsOn(mesh, rings, inflate, paint, bones) {
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
      if (inLamellaGap(paint, angle) || (paint.opening && Math.cos(angle) > 1 - paint.opening * 3)) continue;
      addPatch(mesh, rings, [
        [place - spec.tall, angle - half, out], [place - spec.tall, angle + half, out],
        [place + spec.tall, angle + half, out], [place + spec.tall, angle - half, out],
      ], 'gold', bones);
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
function facet(positions, indices, colors, bones, weightPositions) {
  const flatPositions = [];
  const flatIndices = [];
  const flatColors = [];
  const flatBones = [];
  const flatWeights = [];
  for (let face = 0; face < indices.length; face += 1) {
    const i = indices[face];
    flatPositions.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    flatColors.push(colors[i]);
    flatBones.push(bones[i]);
    flatWeights.push(weightPositions[i * 3], weightPositions[i * 3 + 1], weightPositions[i * 3 + 2]);
    flatIndices.push(face);
  }
  return { positions: flatPositions, indices: flatIndices, colors: flatColors, bones: flatBones, weightPositions: flatWeights };
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
export function* buildLoftBodySteps(body, { faceted = false, lowDetail = false, sculpt = false, rules = null, fillet = false, wrap = null, hideCovered = false, coverOnly = false } = {}) {
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
  const limbFatter = (key) => (ruled && !outfitOf(body.inputs).look.armor ? 1 + LOFT.limbFatDrawn * Math.max(0, body.segments[key].skinRadius - body.segments[key].muscleRadius) : 1);
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
  const points = bindPoints(body);
  const frames = boneFrames(points, body);
  const at = (name) => points[P[name]];
  const seg = body.segments;
  const L = body.lengths;
  const mesh = { positions: [], weightPositions: [], indices: [], colors: [], bones: [], uvs: new Map(), welds: [], parts: {}, ringT: [], ringA: [], covers: {}, cover: lowDetail ? null : {} };
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
  const ridgedPlate = (ring, angle) => {
    if (!breastplate || ring.t < breastplate[0] - 0.02 || ring.t > breastplate[1]) return 1;
    const spec = LOFT.ridged;
    const height = breastplate[1] - breastplate[0];
    const along = (ring.t - breastplate[0]) / height;
    const fade = Math.min(1, along / spec.fade, (1 - along) / spec.fade);
    const off = Math.abs(Math.atan2(Math.sin(angle), Math.cos(angle)));
    const keel = spec.ridge * Math.max(0, 1 - off / spec.width) * Math.max(0, fade);
    const flare = spec.flare * Math.max(0, 1 - (ring.t - breastplate[0]) / spec.flareOver);
    return 1 + keel + flare;
  };
  // Roped borders on the breastplate: a twisted band at its neck and its hem.
  const roped = (ring, step) => breastplate && (Math.abs(ring.t - breastplate[1] + LOFT.ridged.rope) < LOFT.ridged.rope || Math.abs(ring.t - breastplate[0] - LOFT.ridged.rope) < LOFT.ridged.rope) ? (step % 2 ? 'steel2' : 'steel') : null;
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
  loft(mesh, trunkRings(Math.min(-0.12, hem), 1.12, trunkCount), trunkSides, { bones: abdomen, ...(sculpted ? { bend: ruledBend(trunkShape, 'trunk', null, coveredTrunk) } : {}), ...skinUv('trunk'), part: 'trunk' });
  mesh.covers.trunk = coveredTrunk;
  // Kit is geometry, not paint: shorts, waistband and (for women) a sports
  // top are lofts a little proud of the skin, so their edges are crisp.
  // Shorts sit on the hips under the belly, which hangs over them.
  const unbulged = (shape, bellyPart) => (u) => shape(u) - belly * LOFT.bellyScale * bellyPart * bulge(u);
  const shortsRings = (from, to, rings) => along(at('pelvis'), at('neck'), forward, rings, from, to, unbulged(bodyDepth, 1), bodyWidth, unbulged(bodyLean, 0.8));
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
  const plate = armor?.kind === 'plate';
  const lamellar = armor?.kind === 'lamellar';
  const hoplomachus = armor?.kind === 'hoplomachus';
  // A kind drawn from the table of pieces.
  const kit = ARMOR_KINDS[armor?.kind] ?? null;
  const tablePiece = (rings, inflate, paint, bones, shape = null) => {
    // Lamellae drawn as plates over a backing of their dark lacing (the robe showing in the splits), except in a crowd.
    if (paint?.lamellae && !lowDetail) {
      loft(mesh, rings, sides, { color: (ring, angle) => (inLamellaGap(paint, angle) ? 'cloth' : 'lace'), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}) });
      // Laced plates (not the pointed scales) as one shell with the lamellae's maps, where the detail maps are drawn.
      if (DETAIL_MAPS.on && !paint.pointDown) lacedShell(mesh, rings, inflate, lamellaRole(paint), bones ?? (() => null), sides + 6, 'lamellae', paint.gaps ? (t, angle) => inLamellaGap(paint, angle) : null);
      else lamellaeOn(mesh, rings, inflate, paint, bones ?? (() => null));
      return;
    }
    // Japanese laced rows as one shell with the kozane's maps, in the rows' base colour (not in a crowd).
    if (paint?.kozane && DETAIL_MAPS.on && !lowDetail) {
      lacedShell(mesh, rings, inflate, () => paint.rows[0], bones ?? (() => null), sides + 6, 'kozane');
      return;
    }
    // Mail with the mail's maps (detailmaps.js): one colour, the rings in the picture (not in a crowd).
    if (paint?.mail && DETAIL_MAPS.on && !lowDetail) {
      loft(mesh, rings, sides, { color: 'mail', inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}), uv: mailUv(rings, inflate) });
      return;
    }
    // Drawn as faces of their own, the rivets and the mirror are not painted as well.
    const studsDrawn = Boolean(paint?.studded && !lowDetail);
    loft(mesh, rings, sides, { color: paintFor(studsDrawn ? { ...paint, studsDrawn, mirror: null } : paint, armor), inflate, capStart: false, capEnd: false, ...(bones ? { bones } : {}), ...(shape ? { shape } : {}) });
    // Laminated plate: each lame its own band of faces (not in a crowd).
    if (paint?.lames && !lowDetail) lamesOn(mesh, rings, inflate, paint, bones ?? (() => null));
    // A brigandine's rivet heads, each its own small square (not in a crowd).
    if (paint?.studded && !lowDetail) studsOn(mesh, rings, inflate, paint, bones ?? (() => null));
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
      default:
        return 'top';
    }
  };
  // Below the waist: shorts on the hips, a belt, a sumo's mawashi.
  // (Cloth under armour is not bent either: it would stand through the plate.)
  const bendTrunk = sculpted && !armoured ? { bend: trunkShape.mass } : {};
  const shortsOn = (role, inflate) => loft(mesh, shortsRings(-0.12, 0.2, count(5)), trunkSides, { color: role, inflate, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
  if (bottom) {
    switch (bottom.kind) {
      case 'trunks': case 'longShorts':
        shortsOn('kit', 1.05);
        loft(mesh, shortsRings(0.17, 0.25, 1), trunkSides, { color: bottom.trim ? 'trim2' : 'band', inflate: 1.08, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
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
        loft(mesh, shortsRings(0.12, 0.17, 1), trunkSides, { color: 'belt', inflate: 1.075, capStart: false, capEnd: false, bones: abdomen, ...bendTrunk });
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
    const fauld = skirtRings(skirtTo(LOFT.fauld.reach), count(3), LOFT.fauld.flare);
    loft(mesh, fauld, sides, { color: (ring, angle, index) => (index % 2 ? 'steel2' : 'steel'), inflate: 1.2, capStart: false, capEnd: false, bones: () => hanging3 });
    if (!lowDetail && !armor.over) lamesOn(mesh, fauld, 1.2, { lames: LOFT.fauld.lames, base: 'steel2' }, () => hanging3);
  }
  // Kusazuri: the laced skirt of plates, in panels, over the hips and thighs.
  // (With the detail maps, its laced rows are the kozane's: one stepped shell.)
  const kozane = lamellar && DETAIL_MAPS.on && !lowDetail;
  if (kozane) lacedShell(mesh, skirtRings(skirtTo(0.5), count(6), 0.45), 1.24, (row) => (row === 0 && armor.trim ? 'gold' : 'steel'), () => hanging3, sides + 6, 'kozane');
  else if (lamellar) loft(mesh, skirtRings(skirtTo(0.5), count(6), 0.45), sides, { color: (ring, angle, index) => (index % 2 ? 'lace' : 'steel'), inflate: 1.24, capStart: false, capEnd: false, bones: () => hanging3 });
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
    loft(mesh, shortsRings(0.1, 0.16, 1), sides, { color: 'belt', inflate: 1.16, capStart: false, capEnd: false, bones: abdomen });
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
      if (plate) return roped(ring, step) ?? (armor.fluted && step % 2 ? 'steel2' : 'steel');
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
    if (plate && !lowDetail && !armor.over) breastplateOn(mesh, shellRings, shell[2], ridgedPlate, breastplate, { lanceRest: true }, abdomen);
  }
  // A field per pale is drawn sharp down the middle (paleOn), except in a crowd; a device over it (chargeOn) likewise.
  const sharpPale = (paint) => paint?.heraldry && armor?.heraldry === 'pale' && !lowDetail;
  for (const [from, to, inflate, paint] of armorPieces(kit, 'trunk', 'l')) {
    const rings = trunkRings(from, to, count(Math.max(4, Math.round(14 * (to - from)))));
    // A kit's steel breastplate (rigidBreastplate) is ridged, its borders roped.
    const ridgedPiece = kit?.rigidBreastplate && paint === 'steel';
    tablePiece(rings, inflate, ridgedPiece ? (ring, angle, index, step) => roped(ring, step) ?? 'steel' : sharpPale(paint) ? 'cloth' : paint, abdomen, ridgedPiece ? ridgedPlate : null);
    if (ridgedPiece && !lowDetail) breastplateOn(mesh, rings, inflate, ridgedPlate, breastplate, {}, abdomen);
    if (sharpPale(paint)) paleOn(mesh, rings, inflate * 1.02, 'cloth2', abdomen);
    if (paint?.heraldry && armor?.charge && !lowDetail) chargeOn(mesh, rings, armor.charge.kind, inflate * 1.06, 'charge', abdomen);
  }
  for (const [hem, flare, inflate, paint] of armorPieces(kit, 'skirt', 'l')) {
    const rings = skirtRings(skirtTo(hem), count(6), flare);
    tablePiece(rings, inflate, sharpPale(paint) ? 'cloth' : paint, () => hanging3);
    if (sharpPale(paint)) paleOn(mesh, rings, inflate * 1.02, 'cloth2', () => hanging3);
  }
  for (const [from, to, inflate, paint] of armorPieces(kit, 'belt', 'l')) {
    const rings = shortsRings(from, to, count(3));
    tablePiece(rings, inflate, paint, abdomen);
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
  for (const [from, to, inflate, paint] of armorPieces(over, 'trunk', 'l')) tablePiece(trunkRings(from, to, count(Math.max(4, Math.round(14 * (to - from))))), inflate, paint, abdomen, plate ? ridgedPlate : null);
  for (const [hem, flare, inflate, paint] of armorPieces(over, 'skirt', 'l')) tablePiece(skirtRings(skirtTo(hem), count(6), flare), inflate, paint, () => hanging3);
  // The neck thickens a little with fat (the roll under the jaw and at the nape is in the shape).
  const neckGirth = sculpted ? 1 + 3.4 * Math.max(0, traits.trunk.fat - 0.03) : 1;
  loft(mesh, along(at('neck'), at('head'), forward, ruled ? skinCount(5) : skinCount(3), ruled ? -0.2 : -0.05, 0.6, () => neckR * neckGirth, () => neckR * 1.05 * neckGirth), ruled ? 28 : fine ? SCULPT.limbSides + 4 : sides, { capEnd: false, ...(sculpted ? { bend: ruled && !armoured ? rulesShape(rulesOf, 'neck', null, rulesShare, neckShape(traits, false)) : neckShape(traits, detailed) } : {}), ...skinUv('neck'), part: 'neck' });
  // A collar up the neck: plate's gorget, or heavy riot armour's padded collar.
  // The riot collar starts lower and flares out over the trapezius, so no skin shows between it and the vest.
  // Plate's gorget flares down over the tops of the breast and back plates, closing the gap between them and the helmet.
  const collarFrom = plate ? -0.45 : lamellar || kit?.collar ? -0.15 : -0.6;
  const flare = (t) => 1 + (lamellar || kit?.collar ? 0 : (plate ? 0.7 : 0.9) * Math.max(0, -t) / 0.6);
  if (plate || lamellar || kit?.collar || armor?.kind === 'heavyRiot') {
    const collarRings = tagged('neck', along(at('neck'), at('head'), forward, count(3), collarFrom, 0.55, (t) => neckR * 1.55 * flare(t), (t) => neckR * 1.6 * flare(t) * flare(t)));
    // A mail collar with the mail's maps (detailmaps.js).
    const mailMaps = kit?.collar === 'mail' && DETAIL_MAPS.on && !lowDetail ? { uv: mailUv(collarRings, 1) } : {};
    loft(mesh, collarRings, sides, { color: kit?.collar ? paintFor(kit.collar, armor) : plate ? 'steel' : 'armor', capStart: false, capEnd: false, ...mailMaps });
  }
  const armorPiece = (rings, inflate, role = plate ? 'steel' : 'armor') => loft(mesh, rings, sides, { color: role, inflate, capStart: false, capEnd: false });

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
    loft(mesh, along(shoulder, elbow, armForward, skinCount(10), sculpted ? -0.22 : -0.3, 1.0, upperDepth, upperWidth), skinSides, { capStart: sculpted, ...(limbs ? { bend: ruledBend(limbs.upper, 'upper', side, sleeveCover) } : {}), ...skinUv(`${side}Upper`), part: `${side}Upper` });
    mesh.covers[`${side}Upper`] = sleeveCover;
    // Forearm: full below the elbow, tapering to the wrist inside the glove
    // (or, bare, on to the wrist above the fist).
    // Bare, the forearm runs right into the back of the fist.
    const wrist = glovedFists(body.inputs) ? 0.74 : 0.98;
    const forearmRings = (from, to, rings) => tagged(`${side}Fore`, along(elbow, hand, armForward, rings, from, to,
      sculptProfile([[-0.04, upperR * 0.7], [0.2, foreR * 1.05], [0.74, foreR * 0.6], [0.98, foreR * 0.6]]),
      sculptProfile([[-0.04, upperR * 0.72], [0.2, foreR * 1.18], [0.74, foreR * 0.68], [0.98, foreR * 0.7]])));
    loft(mesh, forearmRings(-0.04, wrist, skinCount(8)), skinSides, { ...(limbs ? { bend: ruledBend(limbs.fore, 'fore', side, foreCover) } : {}), ...skinUv(`${side}Fore`), part: `${side}Fore` });
    mesh.covers[`${side}Fore`] = foreCover;
    // Sleeves follow the arm's own shape, deltoid and all, a little off it,
    // from as deep in the shoulder as the arm's skin starts.
    const upperArmRings = (from, to, rings) => tagged(`${side}Upper`, along(shoulder, elbow, armForward, rings, from, to, (t) => Math.max(upperDepth(t), upperR * 0.9), (t) => Math.max(upperWidth(t), upperR * 0.9)));
    const sleeveOf = (shape, role) => {
      if (!shape?.sleeve) return;
      const outer = side === 'l' ? 1 : -1;
      let pattern = role;
      if (role === 'top' && top?.stripe) pattern = (ring, angle) => (Math.sin(angle) * outer > 0.85 ? 'stripe' : 'top');
      if (role === 'top' && top?.kind === 'flannel') pattern = (ring, angle, index, step) => (((index >> 1) + (step >> 1)) % 2 ? 'pattern' : 'top');
      if (role === 'top' && top?.kind === 'aloha') pattern = (ring, angle, index, step) => ((index * 3 + step * 5) % 7 === 0 ? 'pattern' : 'top');
      // A torn sleeve: a short coarse tube cut where this side's ends (one torn off at the shoulder).
      if (shape.torn) {
        loft(mesh, upperArmRings(-0.3, shape.sleeve, shape.torn.sleeveRings), shape.torn.sleeveSides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured ? { bend: limbs.upper.mass } : {}), holes: (t, angle) => ragSleeveTorn(tear, side, t, angle) });
        return;
      }
      loft(mesh, upperArmRings(-0.3, shape.sleeve > 1 ? 1.05 : shape.sleeve, count(6)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured ? { bend: limbs.upper.mass } : {}) });
      if (shape.sleeve > 1) {
        loft(mesh, forearmRings(-0.06, shape.sleeve - 1, count(5)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured ? { bend: limbs.fore.mass } : {}) });
        if (shape.ribbed || top?.kind === 'suit') loft(mesh, forearmRings(shape.sleeve - 1.07, shape.sleeve - 1, 1), sides, { color: top?.kind === 'suit' ? 'shirt' : 'trim', inflate: shape.sleeveLoose + 0.04, capStart: false, capEnd: false });
      }
    };
    if (topShape?.inner) sleeveOf(TOPS[topShape.inner], 'shirt');
    sleeveOf(topShape, 'top');
    if (lamellar) {
      // Sode: broad laced shoulder plates; kote: armoured cloth sleeves.
      if (kozane) lacedShell(mesh, upperArmRings(-0.18, 0.5, count(4)), 1.85 * (armor.sode ?? 1), () => 'steel', () => null, sides + 6, 'kozane');
      else armorPiece(upperArmRings(-0.18, 0.5, count(4)), 1.85 * (armor.sode ?? 1), (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
      armorPiece(forearmRings(-0.04, wrist - 0.04, count(4)), 1.3, 'top');
    } else if (hoplomachus) {
      // The manica: a segmented guard down the sword arm only.
      if (side === 'r') {
        armorPiece(upperArmRings(-0.25, 1.02, count(7)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
        armorPiece(forearmRings(-0.06, wrist - 0.02, count(6)), 1.32, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
      }
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'upperArm', side)) tablePiece(upperArmRings(from, to, count(Math.max(3, Math.round(7 * (to - from))))), inflate, paint);
      for (const [from, to, inflate, paint] of armorPieces(kit, 'forearm', side)) tablePiece(forearmRings(from, to <= 0 ? wrist + to : to, count(5)), inflate, paint);
    } else if (armor && armor.kind !== 'carrier') {
      const big = armor.joust ? LOFT.joust.pauldron : { riot: 1.6, heavyRiot: 1.85, plate: 1.65 }[armor.kind];
      // A jousting harness: mail at the armpit under the pauldron, the pauldron in lames (not in a crowd).
      if (armor.joust) loft(mesh, upperArmRings(LOFT.joust.mail[0], LOFT.joust.mail[1], count(3)), sides, { color: paintFor(MAIL, armor), inflate: LOFT.joust.mail[2], capStart: false, capEnd: false });
      const pauldron = upperArmRings(-0.2, 0.38, count(armor.joust ? 4 : 3));
      armorPiece(pauldron, big);
      if (armor.joust && !lowDetail) lamesOn(mesh, pauldron, big, { lames: LOFT.joust.pauldronLames, base: 'steel' }, () => null);
      if (plate) armorPiece(upperArmRings(0.36, 1.0, count(4)), 1.28);
      if (plate) armorPiece(forearmRings(-0.12, 0.12, count(2)), 1.5);
      armorPiece(forearmRings(0.12, wrist - 0.06, count(4)), plate ? 1.32 : 1.42);
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
    const legReach = { hakama: [1.04, 0.3], bloomers: [0.42, 0], trunks: [0.42, 0], longShorts: [0.62, 0], splitShorts: [0.28, 0], hikingShorts: [0.55, 0], tights: [1.04, 0.92], trackPants: [1.04, 0.9], pants: [1.04, 0.9], slacks: [1.04, 0.92], jeans: [1.04, 0.9], cargo: [1.04, 0.9], joggers: [1.04, 0.9], ragTrousers: [1.04, RAGS.trousers.hem + RAGS.trousers.jag * 1.7] }[bottom?.kind] ?? [0, 0];
    const legs = sculpted ? { thigh: limbShapes(traits, 'thigh', side, legReach[0] > 0 ? [[-0.3, legReach[0]]] : [], armoured), shank: limbShapes(traits, 'shank', side, legReach[1] > 0 ? [[-0.3, legReach[1]]] : [], armoured) } : null;
    loft(mesh, thighRings(-0.14, 1.0, skinCount(10)), skinSides, { ...(legs ? { bend: ruledBend(legs.thigh, 'thigh', side, legReach[0] > 0 ? [[-0.3, legReach[0]]] : []) } : {}), ...skinUv(`${side}Thigh`), part: `${side}Thigh` });
    mesh.covers[`${side}Thigh`] = legReach[0] > 0 ? [[-0.3, legReach[0]]] : [];
    const legLoose = { hakama: 1.3, bloomers: 1.32, tights: 1.03, trackPants: 1.14, splitShorts: 1.06, trunks: 1.08, longShorts: 1.1, ragTrousers: 1.24 }[bottom?.kind] ?? 1.12;
    const outer = side === 'l' ? 1 : -1;
    const legPattern = (ring, angle) => {
      if (bottom?.stripe && Math.abs(Math.sin(angle)) > 0.9) return 'trim2';
      if (bottom?.kind === 'cargo' && ring.t > 0.35 && ring.t < 0.62 && Math.sin(angle) * outer > 0.55) return 'trim2';
      return 'kit';
    };
    const bendThigh = legs && !armoured ? { bend: legs.thigh.mass } : {};
    if (bottom?.under) loft(mesh, thighRings(-0.05, 0.4, count(3)), sides, { color: 'under', inflate: 1.05, capStart: false, capEnd: false, ...bendThigh });
    // (Rags: a plain coarse tube down the thigh, LOFT.rags.)
    const ragLeg = bottom?.kind === 'ragTrousers' ? LOFT.rags : null;
    if (legReach[0] > 0 && !skirted) loft(mesh, thighRings(-0.05, legReach[0], ragLeg ? ragLeg.thigh : count(Math.max(3, Math.round(9 * legReach[0])))), ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: legLoose, capStart: false, capEnd: false, ...bendThigh });
    // Hakama (the hitatare's trousers): full, bloused out at the knee where they are tied over the shin guards.
    if (bottom?.kind === 'hakama' && !skirted) loft(mesh, thighRings(0.72, 1.06, count(3)), sides, { color: 'kit', inflate: 1.48, capStart: false, capEnd: false });
    // Bloomers end in a lace frill round the thigh.
    if (bottom?.kind === 'bloomers') loft(mesh, thighRings(legReach[0] - 0.02, legReach[0] + 0.06, 2), sides, { color: 'trim2', inflate: legLoose + 0.08, capStart: false, capEnd: false });
    if (lamellar) {
      // Haidate: laced apron plates down the thigh.
      armorPiece(thighRings(0.25, 0.85, count(5)), 1.3, (ring, angle, index) => (index % 2 ? 'lace' : 'steel'));
    } else if (hoplomachus) {
      // Ocreae: high greaves, up over the knee.
      armorPiece(thighRings(0.68, 1.05, count(3)), 1.34, 'steel');
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'thigh', side)) tablePiece(thighRings(from, to, count(Math.max(2, Math.round(8 * (to - from))))), inflate, paint);
      for (const [from, to, inflate, paint] of armorPieces(kit, 'knee', side)) tablePiece(thighRings(from, to, count(2)), inflate, paint);
    } else if (armor) {
      if (plate) armorPiece(thighRings(-0.05, 0.84, count(5)), 1.26);
      // The tasset: lames hung from the fauld over the front and outer side of the thigh, moving with it.
      // (Under a surcoat's or a huque's skirt they are not seen.)
      if (plate && !armor.over) tassetOn(mesh, thighRings(LOFT.tasset.from, armor.joust ? LOFT.joust.tassetTo : LOFT.tasset.to, count(armor.joust ? 6 : 4)), side === 'l' ? 1 : -1, armor.joust ? LOFT.joust.tassetLames : LOFT.tasset.lames);
      if (armor.kind === 'heavyRiot') armorPiece(thighRings(0.05, 0.7, count(3)), 1.35);
      armorPiece(thighRings(0.82, 1.05, count(2)), plate ? 1.5 : 1.45, plate ? 'steel' : 'pad');
    }
    // Shin and calf: the calf sits high and behind.
    // The shin starts inside the thigh, so the knee bends without a seam.
    const shinRings = (from, to, rings) => tagged(`${side}Shin`, along(knee, foot, frames[BONE[`${side}Shin`]].x, rings, from, to,
      sculptProfile([[-0.12, shankR * 0.6], [0, shankR * 0.92], [0.28, shankR * 1.1], [0.7, shankR * 0.7], [0.97, shankR * 0.5]]),
      sculptProfile([[-0.12, shankR * 0.6], [0, shankR * 0.9], [0.28, shankR * 0.98], [0.97, shankR * 0.52]]),
      sculptProfile([[0, 0], [0.28, -shankR * 0.18], [0.7, -shankR * 0.05], [1, 0]])));
    loft(mesh, shinRings(-0.12, 0.97, skinCount(10)), skinSides, { ...(legs ? { bend: ruledBend(legs.shank, 'shin', side, legReach[1] > 0 ? [[-0.3, legReach[1]]] : []) } : {}), ...skinUv(`${side}Shin`), part: `${side}Shin` });
    mesh.covers[`${side}Shin`] = legReach[1] > 0 ? [[-0.3, legReach[1]]] : [];
    // A plate greave covers the shin: the hose under it is not drawn (it stands wider than the greave at the ankle and showed through).
    if (legReach[1] > 0 && !skirted && !plate) {
      // Trousers fall straight to the shoe; joggers and track pants gather.
      const gathered = bottom.kind === 'joggers' || bottom.kind === 'trackPants';
      // Breeches cut off ragged below the knee (outfits.js RAGS): a coarse tube, whole quads gone at the hem.
      const ragged = ragLeg ? { holes: (t, angle) => ragHemTorn(ragTear(body.inputs.outfit), side, t, angle) } : {};
      loft(mesh, along(knee, foot, frames[BONE[`${side}Shin`]].x, ragLeg ? ragLeg.shin : count(8), -0.14, legReach[1], () => shankR * 1.12, () => shankR * 1.1), ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: bottom.kind === 'tights' ? 1.0 : gathered ? 1.12 : ragLeg ? ragLeg.shinLoose : 1.22, capStart: false, capEnd: false, ...ragged });
      if (gathered) loft(mesh, shinRings(legReach[1] - 0.08, legReach[1], 1), sides, { color: 'trim2', inflate: 1.15, capStart: false, capEnd: false });
    }
    if (lamellar) {
      // Suneate: splinted shin guards.
      armorPiece(shinRings(0.04, 0.86, count(5)), 1.34, 'steel');
    } else if (hoplomachus) {
      armorPiece(shinRings(-0.14, 0.9, count(6)), 1.32, (ring, angle, index) => (index === 0 ? 'gold' : 'steel'));
    } else if (kit) {
      for (const [from, to, inflate, paint] of armorPieces(kit, 'shin', side)) tablePiece(shinRings(from, to, count(Math.max(2, Math.round(7 * (to - from))))), inflate, paint);
    } else if (armor) {
      armorPiece(shinRings(-0.12, 0.12, count(2)), plate ? 1.5 : 1.45, plate ? 'steel' : 'pad');
      if (plate || armor.kind !== 'carrier') armorPiece(shinRings(0.1, plate ? 0.95 : 0.8, count(4)), plate ? 1.32 : 1.35);
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

  // What the armour covers of each skin part (the pieces lofted over it, see loft), the margin taken off each end of every stretch.
  const covered = armor && mesh.cover ? coverTable(mesh.cover, { trunk: [at('pelvis'), at('neck')], neck: [at('neck'), at('head')], ...Object.fromEntries(['l', 'r'].flatMap((side) => [[`${side}Upper`, [at(`${side}Shoulder`), at(`${side}Elbow`)]], [`${side}Fore`, [at(`${side}Elbow`), at(`${side}Hand`)]], [`${side}Thigh`, [at(`${side}Hip`), at(`${side}Knee`)]], [`${side}Shin`, [at(`${side}Knee`), at(`${side}Foot`)]]])) }) : null;
  if (coverOnly) return { covered };
  yield 'lofted';
  let { positions, indices, colors, bones, weightPositions } = mesh;
  if (faceted) ({ positions, indices, colors, bones, weightPositions } = facet(positions, indices, colors, bones, weightPositions));
  let positionArray = Float32Array.from(positions);
  let indexArray = Uint32Array.from(indices);
  if (!faceted) {
    // Smooth the skin only: cloth tubes are all open edges, and relaxing an
    // open edge pulls it in — hems would sink into the body beneath them.
    const loose = Float32Array.from(positionArray);
    positionArray = relax({ positions: positionArray, indices: indexArray }, fine ? SCULPT.relaxPasses : LOFT.relaxPasses, fine ? SCULPT.relaxAmount : LOFT.relaxAmount, mesh.welds).positions;
    yield 'relaxed';
    colors.forEach((region, vertex) => {
      if (region !== 'skin') positionArray.set(loose.subarray(vertex * 3, vertex * 3 + 3), vertex * 3);
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
  // Under armour (`hideCovered`): the skin the pieces cover is left out (every triangle of it), and the points no triangle uses.
  let hidden = 0;
  if (hideCovered && covered) {
    const inside = new Uint8Array(positionArray.length / 3);
    for (const [name, [from, to]] of Object.entries(mesh.parts)) {
      for (const [low, high] of covered[name] ?? []) for (let vertex = from; vertex < to; vertex += 1) if (mesh.ringT[vertex] > low && mesh.ringT[vertex] < high) inside[vertex] = 1;
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
  // `rigid`: vertices carried by the chest bone alone (a breastplate and what is under it): no flesh to dent.
  const rigid = bones.map((list) => list === chestOnly);
  yield 'skin weights';
  const weights = yield* skinWeightsSteps(Float32Array.from(weightPositions), frames, bones);
  // `regions` names what each vertex is (skin, kit, band, top) for painting.
  return {
    positions: positionArray, normals, indices: indexArray, regions: colors, rigid, ...(uvs ? { uvs } : {}), ...weights, bindFrames: frames, bindPoints: points,
    ...(covered ? { covered } : {}), ...(hidden ? { hiddenTriangles: hidden } : {}), ...(tint ? { tint } : {}),
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
