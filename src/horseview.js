// What a horse looks like, drawn from the simulation's horse (nothing here
// changes it). The body, neck, head, ears and each leg's segments are meshes
// made once per breed, barding, coat and level of detail (src/horsemesh.js)
// and shared by every horse that looks alike; they are moved each frame:
// the neck and head nod with the gait, the ears flick, the legs bend at knee
// (or hock), fetlock and hoof with the stride the physics gave them, the body
// rolls a little. The mane, the tail's hair, a cloth trapper, the stirrups and
// the reins are redrawn each frame (src/horsehair.js hangs them), the reins
// running from the bit to the rider's hand. A horse that falls rolls onto its
// side with its neck out; a leg the physics has broken hangs limp.

/* global THREE */
import { HORSE_SHAPE, poseHorse } from './physics/mounted.js';
import { P } from './body.js';
import { twoBoneIK, vec } from './pose.js';
import { buildHorseModel, horseModelKey } from './horsemesh.js';
import { hairChain, stepHair } from './horsehair.js';
import { steelMaterial } from './wardrobe.js';
import { disposeObject, doubleSided, outlineFor, surface } from './toon.js';
import { armourDetailMaterial } from './detailtex.js';
import { DETAIL_ARMOUR } from './detailmaps.js';
import { buildRobotDogView, disposeRobotDogView, updateRobotDogView } from './robotdogview.js';
import { HORSE_BASE_DATA } from './horsebase-data.js';
import { horseBaseFit, horseBaseMesh } from './horsebase.js';
import { SoftShell } from './soft.js';

const HORSE_LOOK = {
  outline: 0.005,
  rein: 0x2a1a10,
  iron: [0.5, 0.5, 0.54],
  leather: [0.16, 0.1, 0.07],
  // How many different models a breed keeps for coats and markings.
  variety: 12,
  // Horses beyond this many in a fight are drawn in low detail.
  crowd: 4,
  // The user's horse model (lowPolyHorse.blend, horsebase-data.js) in place of the lofted body, neck, head and legs: one
  // skinned mesh moved by the same frames, its coat image coloured the horse's coat, its flesh a soft body (soft.js) whose
  // belly swings with the trunk's jolts (HORSE_BELLY). The tack, the bard, the mane and the tail's hair laid over it
  // (horsemesh.js `base`). `firmness`: its flesh's (soft.js), a horse's hide over muscle a little softer than a man's.
  base: true,
  firmness: 0.45,
};

/**
 * The bard's skirt swings a little with the horse's momentum (a pilot on the Jurchen lamellar bard, the Iron Pagoda's: `kinds`),
 * as hair does: a point on a damped spring behind the horse's body (its own frequency `hz`, damping ratio under 1 so it swings
 * past and back), hanging `trail` s of the body's speed behind it, never more than `reach` m off; moved in the vertex shader,
 * each point by how far down the hanging skirt it is (none above `top`, the barrel's widest, all at `hem`, shares of the
 * withers' height), so the plates over the back and the saddle stay put and the hem swings most. Heavier than hair: stiffer
 * and shorter; up and down by `lift` of it (hung plates rise and fall less than they swing). Drawing only (the physics' capsules do not move); not in low detail.
 */
// (Swinging as hair does, the user's call, 2026-11-18: was hz 2.4, damping 0.5, reach 3.5 cm, no twist.) `twist`: the turn's own
// spring, so the skirt trails the horse round as it turns and swings side to side after (`twistHz`, `twistDamping`, at most
// `twistReach` rad about the barrel's middle, `pivot` × the withers forward of the frame's origin); `curve`: how the share
// grows down the skirt (under 2: more of it moves).
export const BARD_SWAY = {
  // `hang`: where the skirt hangs from, the point the spring follows (× the withers: over the croup, behind the saddle, at the
  // barrel's top), so the stride's rock, pitch and bob swing it as a pendulum, not only the horse's pace and turns (followed at
  // the frame's origin, under the barrel, it hardly moved as the body rocked: rigid from behind, the user's call, 2026-11-18).
  // (Softer, as hair, the user's call, 2026-11-20: was hz 1.2, reach 0.16, one spring, no ripple.)
  kinds: ['lamellar'], hz: 0.95, damping: 0.2, trail: 0.02, reach: 0.2, lift: 0.7, jump: 0.7, top: 0.8, hem: 0.42, curve: 1.3,
  // `chain`: the hem on a second spring following the first (its own `hz`, `damping`, at most `reach` m off the horse), the
  // skirt between the two by how far down it is: the hem lags the upper skirt as a lock of hair lags the head. `ripple`: a wave
  // run across the plates (`waves` per m along the horse and round it, `hz`), `amp` m at the hem at full stir, the stir the
  // horse's pace over `pace` m/s and the swing's own reach, so the panels lift out of step as hair does, and still at rest.
  chain: { hz: 0.8, damping: 0.18, reach: 0.26 },
  // `hold`: how many reaches out the springs themselves are held (the drawn offset eased into one reach before that).
  hold: 2.5,
  ripple: { amp: 0.03, hz: 1.4, waves: [7, 5], pace: 6 },
  hang: [-0.42, 1.0, 0],
  // `flare`: the skirt flaring out from the horse as it lags his rise and fall each stride (m out per m of the vertical lag;
  // `tuck` of it inward, the panels laid back against him), the flanks out to the sides, the rump's panel behind `rear` and the
  // breast's before `front` (× the withers, forward of the frame's origin) out behind and before: so from behind the skirt
  // flaps out and in with the stride.
  flare: 1.6, tuck: 0.3, rear: -0.35, front: 0.25,
  twistHz: 1.3, twistDamping: 0.3, twistReach: 0.12, pivot: -0.05,
};

const horseUp = new THREE.Vector3(0, 1, 0);
const horseX = new THREE.Vector3();
const horseY = new THREE.Vector3();
const horseZ = new THREE.Vector3();
const horseBasis = new THREE.Matrix4();
const horseInverse = new THREE.Matrix4();
const horseVector = new THREE.Vector3();

// ---- Models and their geometry, shared ----------------------------------------------

const horseModels = new Map();
const horseGeometries = new WeakMap();

/** A stable number from a horse's id and coat, so one horse always looks the same and a troop varies. */
function horseSeed(horse) {
  let hash = (horse.id ?? 0) * 7 + 3;
  for (const char of `${horse.breed}${horse.coat}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 1 + (hash % HORSE_LOOK.variety);
}

/** Whether a horse wears a cloth trapper: its own say, else an unarmoured heavy horse now and then (a bard is worn bare). */
function horseCaparison(horse, seed) {
  if (horse.caparison !== undefined) return Boolean(horse.caparison);
  return (horse.breed === 'destrier' || horse.breed === 'warhorse') && (horse.barding ?? 'bare') === 'bare' && seed % 2 === 0;
}

/** The model for a horse (built the first time that look is wanted). */
export function horseModelFor(horse, detail = 'full') {
  const seed = horseSeed(horse);
  // (The bard's finish: fluted, etched or plain plate, as the rider's harness is: horses.js mountOf.)
  const style = horse.barding === 'plate' ? horse.finish?.style ?? 'plain' : null;
  const base = HORSE_LOOK.base;
  const spec = { breed: horse.breed, barding: horse.barding, style, coat: horse.coat, seed, caparison: horseCaparison(horse, seed), detail, withers: horse.withers, corner: horse.corner, base };
  const key = horseModelKey(spec);
  if (!horseModels.has(key)) horseModels.set(key, buildHorseModel(spec));
  return horseModels.get(key);
}

function horseGeometry(part) {
  if (!horseGeometries.has(part)) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(part.colors, 3));
    if (part.uvs) geometry.setAttribute('uv', new THREE.BufferAttribute(part.uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
    geometry.computeBoundingSphere();
    horseGeometries.set(part, geometry);
  }
  return horseGeometries.get(part);
}

function horseMaterials(view) {
  if (!view.horseMaterials) {
    const hair = surface(0xffffff, { vertexColors: true });
    hair.side = THREE.DoubleSide;
    view.horseMaterials = {
      // (Barding and trappers are open shells: drawn from both sides, as all armour is: toon.js doubleSided.)
      soft: doubleSided(surface(0xffffff, { vertexColors: true })),
      hair,
      metal: doubleSided(steelMaterial(view.steelEnv, { vertexColors: true })),
      rein: new THREE.LineBasicMaterial({ color: HORSE_LOOK.rein }),
    };
  }
  return view.horseMaterials;
}

/**
 * The bard's steel wearing a tile's maps (detailmaps.js), its colour the rider's harness's (`finish.steel`) and a laced tile's
 * cords the rider's lacing (`finish.lace`); the rivet heads of a turned edge in the steel. Made once per view and look.
 */
function bardMaterial(view, tile, finish) {
  view.bardMaterials ??= new Map();
  const faced = tile === 'brigandine';
  const key = `${tile}|${finish?.steel ?? '-'}|${finish?.lace ?? '-'}${faced ? `|${finish?.cloth ?? '-'}|${finish?.gold ?? '-'}` : ''}`;
  if (!view.bardMaterials.has(key)) view.bardMaterials.set(key, makeBardMaterial(view, tile, finish));
  return view.bardMaterials.get(key);
}

/** A bard's material made anew (bardMaterial keeps one per look; a swaying bard has its own: BARD_SWAY). */
function makeBardMaterial(view, tile, finish) {
  // A brigandine's facing (the `brigandine` tile) is the rider's cloth, studded in his gilt (horses.js mountOf `finish`).
  const faced = tile === 'brigandine';
  {
    const base = steelMaterial(view.steelEnv, { vertexColors: true });
    if (faced && finish?.cloth) base.color = new THREE.Color(finish.cloth);
    else if (finish?.steel) base.color = new THREE.Color(finish.steel).lerp(new THREE.Color(0xffffff), 0.35);
    const masks = DETAIL_ARMOUR[tile]?.masks;
    const lace = finish?.lace ? new THREE.Color(finish.lace) : new THREE.Color(0x6a1a14);
    const gilt = faced && finish?.gold ? new THREE.Color(finish.gold) : new THREE.Color(0xffffff);
    const cords = masks === 'lace' ? [lace, lace] : masks === 'gold' ? [gilt, gilt] : null;
    // (A bard's broad plates would mirror only the ground under them: a little less of a mirror than the rider's harness, which
    // turns every way; mail and lamellae less bright again.)
    const metalness = tile === 'lamellae' || tile === 'mail' ? 0.75 : 0.85;
    return doubleSided(armourDetailMaterial(base, tile, { cords, metalness }));
  }
}

/** The swing of one horse's bard (BARD_SWAY): `uniform` (the frame's own axes, m) is what its materials read; `update` moves it. */
function bardSwing() {
  return { uniform: { value: new THREE.Vector3() }, hem: { value: new THREE.Vector3() }, ripple: { value: new THREE.Vector2() }, twist: { value: 0 }, at: null, was: [0, 0, 0], speed: [0, 0, 0], pace: [0, 0, 0], chain: [0, 0, 0], chainSpeed: [0, 0, 0], clock: 0, turn: null, turnSpeed: 0, lastYaw: 0 };
}

/** The turn's spring (BARD_SWAY `twist`): the skirt's own heading trailing the horse's (`yaw`), the lag (rad) into `uniform`. */
function updateBardTwist(swing, yaw, dt) {
  const spec = BARD_SWAY;
  if (swing.turn === null || !(dt > 0)) {
    if (swing.turn === null) {
      swing.turn = yaw;
      swing.lastYaw = yaw;
      swing.turnSpeed = 0;
      swing.twist.value = 0;
    }
    return;
  }
  // Unwrapped: the heading carried on past ±π.
  const target = swing.lastYaw + Math.atan2(Math.sin(yaw - swing.lastYaw), Math.cos(yaw - swing.lastYaw));
  const rate = (target - swing.lastYaw) / dt;
  const omega = Math.PI * 2 * spec.twistHz;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let step = 1; step <= steps; step += 1) {
    const goal = swing.lastYaw + ((target - swing.lastYaw) * step) / steps;
    swing.turnSpeed += (omega * omega * (goal - swing.turn) - 2 * spec.twistDamping * omega * (swing.turnSpeed - rate)) * h;
    swing.turn += swing.turnSpeed * h;
  }
  swing.lastYaw = target;
  let lag = swing.turn - target;
  if (Math.abs(lag) > spec.twistReach) {
    lag = Math.sign(lag) * spec.twistReach;
    swing.turn = target + lag;
  }
  swing.twist.value = lag;
}

const bardWorld = new THREE.Vector3();
const bardTurn = new THREE.Quaternion();

/**
 * A swing's offset eased into its reach (`off`, m, changed in place): drawn `reach * tanh(|off| / reach)` along it, so it
 * slows into the limit rather than stopping at it (a hard stop kinked the skirt each time it reached it: at a gallop the
 * trail alone is about the reach); the spring itself (`at`) held back only at BARD_SWAY.hold reaches, so it never runs off.
 */
function softReach(off, at, target, pace, reach, spec) {
  const far = Math.hypot(...off);
  if (!(far > 0)) return;
  const hold = reach * spec.hold;
  if (far > hold) {
    for (let axis = 0; axis < 3; axis += 1) at[axis] = target[axis] + (off[axis] * hold) / far / (axis === 1 ? spec.lift : 1) + pace[axis] * spec.trail;
  }
  const drawn = reach * Math.tanh(Math.min(far, hold) / reach);
  for (let axis = 0; axis < 3; axis += 1) off[axis] *= drawn / far;
}

/** Move a horse's bard swing by dt, after its frame: a damped spring behind the frame's origin (as clothsway.js ClothSwing). */
function updateBardSwing(swing, frame, dt) {
  const spec = BARD_SWAY;
  frame.updateMatrixWorld(true);
  bardWorld.set(spec.hang[0] * swing.withers, spec.hang[1] * swing.withers, spec.hang[2] * swing.withers).applyMatrix4(frame.matrixWorld);
  const target = [bardWorld.x, bardWorld.y, bardWorld.z];
  const moved = swing.at ? Math.hypot(target[0] - swing.was[0], target[1] - swing.was[1], target[2] - swing.was[2]) : Infinity;
  if (!swing.at || moved > spec.jump || !(dt > 0)) {
    if (!swing.at || moved > spec.jump) {
      swing.at = target.slice();
      swing.was = target.slice();
      swing.speed = [0, 0, 0];
      swing.pace = [0, 0, 0];
      swing.chain = target.slice();
      swing.chainSpeed = [0, 0, 0];
      swing.uniform.value.set(0, 0, 0);
      swing.hem.value.set(0, 0, 0);
    }
    return;
  }
  const omega = Math.PI * 2 * spec.hz;
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  const off = [0, 0, 0];
  const hem = [0, 0, 0];
  for (let axis = 0; axis < 3; axis += 1) {
    const pace = (target[axis] - swing.was[axis]) / dt;
    swing.pace[axis] += (pace - swing.pace[axis]) * Math.min(1, dt / 0.08);
    const chainOmega = Math.PI * 2 * spec.chain.hz;
    for (let step = 1; step <= steps; step += 1) {
      const goal = swing.was[axis] + ((target[axis] - swing.was[axis]) * step) / steps;
      // (Damped against the horse's pace smoothed, not one frame's: a frame's own is uneven, the drawing blended between steps.)
      swing.speed[axis] += (omega * omega * (goal - swing.at[axis]) - 2 * spec.damping * omega * (swing.speed[axis] - swing.pace[axis])) * h;
      swing.at[axis] += swing.speed[axis] * h;
      // The hem follows the upper skirt.
      swing.chainSpeed[axis] += (chainOmega * chainOmega * (swing.at[axis] - swing.chain[axis]) - 2 * spec.chain.damping * chainOmega * (swing.chainSpeed[axis] - swing.speed[axis])) * h;
      swing.chain[axis] += swing.chainSpeed[axis] * h;
    }
    swing.was[axis] = target[axis];
    off[axis] = (swing.at[axis] - target[axis] - swing.pace[axis] * spec.trail) * (axis === 1 ? spec.lift : 1);
    hem[axis] = (swing.chain[axis] - target[axis] - swing.pace[axis] * spec.trail) * (axis === 1 ? spec.lift : 1);
  }
  softReach(hem, swing.chain, target, swing.pace, spec.chain.reach, spec);
  softReach(off, swing.at, target, swing.pace, spec.reach, spec);
  // Into the frame's own axes (its turn only), as its geometry is.
  frame.getWorldQuaternion(bardTurn).invert();
  swing.uniform.value.set(off[0], off[1], off[2]).applyQuaternion(bardTurn);
  swing.hem.value.set(hem[0], hem[1], hem[2]).applyQuaternion(bardTurn);
  // The ripple's clock and stir (its phase run on; the stir eased, so it swells and dies away rather than switching).
  const ripple = spec.ripple;
  swing.clock += dt * Math.PI * 2 * ripple.hz;
  const stir = Math.min(1, Math.hypot(swing.pace[0], swing.pace[2]) / ripple.pace + Math.hypot(...hem) / spec.chain.reach);
  swing.ripple.value.set(swing.clock % 1000, swing.ripple.value.y + (stir - swing.ripple.value.y) * Math.min(1, dt / 0.4));
}

/** Make a material (or an outline's) move its points by a bard's swing, by how far down the hanging skirt each is (BARD_SWAY). */
function swayBard(material, swing, withers) {
  const before = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey?.() ?? '';
  const top = (BARD_SWAY.top * withers).toFixed(4);
  const span = ((BARD_SWAY.top - BARD_SWAY.hem) * withers).toFixed(4);
  const pivot = (BARD_SWAY.pivot * withers).toFixed(4);
  const [rear, front] = [BARD_SWAY.rear, BARD_SWAY.front].map((share) => (share * withers).toFixed(4));
  material.onBeforeCompile = (shader, renderer) => {
    before?.call(material, shader, renderer);
    shader.uniforms.uBardSwing = swing.uniform;
    shader.uniforms.uBardHem = swing.hem;
    shader.uniforms.uBardRipple = swing.ripple;
    shader.uniforms.uBardTwist = swing.twist;
    // The share down the skirt; then the turn's lag about the barrel's middle (as three's turn about y), then the swing.
    shader.vertexShader = `uniform vec3 uBardSwing;\nuniform vec3 uBardHem;\nuniform vec2 uBardRipple;\nuniform float uBardTwist;\n${shader.vertexShader}`.replace(
      '#include <morphtarget_vertex>',
      `float bardHang = pow( clamp( ( ${top} - position.y ) / ${span}, 0.0, 1.0 ), ${BARD_SWAY.curve.toFixed(2)} );
float bardTurn = uBardTwist * bardHang;
vec2 bardAt = transformed.xz - vec2( ${pivot}, 0.0 );
transformed.xz = vec2( ${pivot}, 0.0 ) + vec2( bardAt.x * cos( bardTurn ) + bardAt.y * sin( bardTurn ), - bardAt.x * sin( bardTurn ) + bardAt.y * cos( bardTurn ) );
vec3 bardSwingHere = mix( uBardSwing, uBardHem, bardHang );
transformed += bardSwingHere * bardHang;
vec2 bardOut = vec2( position.x > ${front} ? position.x - ${front} : ( position.x < ${rear} ? position.x - ${rear} : 0.0 ), position.z );
bardOut /= max( length( bardOut ), 1e-4 );
float bardFlare = bardSwingHere.y * ${BARD_SWAY.flare.toFixed(2)};
if ( bardFlare < 0.0 ) bardFlare *= ${BARD_SWAY.tuck.toFixed(2)};
transformed.xz += bardOut * bardFlare * bardHang;
float bardWave = sin( uBardRipple.x - position.x * ${BARD_SWAY.ripple.waves[0].toFixed(2)} + abs( position.z ) * ${BARD_SWAY.ripple.waves[1].toFixed(2)} );
transformed.xz += bardOut * bardWave * ${BARD_SWAY.ripple.amp.toFixed(3)} * ( 0.25 + 0.75 * uBardRipple.y ) * bardHang;
#include <morphtarget_vertex>`,
    );
  };
  material.customProgramCacheKey = () => `${baseKey}|bardSway`;
  material.needsUpdate = true;
  return material;
}

/** A mesh of a shared geometry (not freed with the horse), inked if asked. */
function horseMesh(parent, geometry, material, { ink = 0 } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.userData.shared = true;
  parent.add(mesh);
  if (ink) {
    const outline = outlineFor(mesh, ink);
    outline.userData.shared = true;
    mesh.add(outline);
  }
  return mesh;
}

/** A part's soft and metal geometries (and its bard's detail-mapped shells) as meshes under `parent`; returns them. */
function horsePart(parent, part, materials, { ink = 0, bard = null } = {}) {
  const meshes = [];
  if (part?.soft) meshes.push(horseMesh(parent, horseGeometry(part.soft), materials.soft, { ink }));
  if (part?.metal) meshes.push(horseMesh(parent, horseGeometry(part.metal), materials.metal));
  for (const [tile, geometry] of Object.entries(part?.detail ?? {})) {
    const mesh = horseMesh(parent, horseGeometry(geometry), bard ? bard(tile) : materials.metal);
    mesh.userData.detailMaps = tile;
    meshes.push(mesh);
  }
  return meshes;
}

/** A box or other stock geometry painted one colour (vertex colours), freed with the horse. */
function horsePainted(geometry, [r, g, b]) {
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) colors.set([r, g, b], v * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** Lay a limb piece from a point to another, its x axis towards `forward`, y along the piece. */
function layHorsePart(mesh, from, to, forward) {
  mesh.position.set(from[0], from[1], from[2]);
  horseY.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  horseX.set(forward[0], forward[1], forward[2]);
  horseX.addScaledVector(horseY, -horseX.dot(horseY));
  if (horseX.lengthSq() < 1e-6) horseX.set(0, 0, 1).addScaledVector(horseY, -horseY.z);
  horseX.normalize();
  horseZ.crossVectors(horseX, horseY);
  horseBasis.makeBasis(horseX, horseY, horseZ);
  mesh.quaternion.setFromRotationMatrix(horseBasis);
}

/** A thin box between two points in a parent's frame (a leather). */
function layStrap(mesh, from, to) {
  mesh.position.set(from[0], from[1], from[2]);
  horseVector.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const length = horseVector.length() || 1e-6;
  mesh.scale.set(1, length, 1);
  mesh.quaternion.setFromUnitVectors(horseUp, horseVector.divideScalar(length));
}

// ---- Building ----------------------------------------------------------------------------

/** Build a horse's model (added to the scene); returns its view. */
export function buildHorseView(view, horse, { detail = 'full' } = {}) {
  // (A robot dog: robotdogview.js draws it.)
  if (horse.spec?.robot) return buildRobotDogView(view, horse);
  const model = horseModelFor(horse, detail);
  const { rig, parts } = model;
  const W = horse.withers;
  const low = model.low;
  const materials = horseMaterials(view);
  const ink = low ? 0 : HORSE_LOOK.outline;
  const group = new THREE.Group();
  // Rolled about the barrel's line when it falls (as physics horsePoint): the body in `body`, about the pivot.
  const pivot = 0.76 * W;
  const body = new THREE.Group();
  body.position.y = pivot;
  group.add(body);
  const frame = new THREE.Group();
  frame.position.y = -pivot;
  body.add(frame);
  const owned = [];
  const bard = (tile) => bardMaterial(view, tile, horse.finish);
  // A swaying bard (BARD_SWAY): the body's pieces in materials of this horse's own, reading its swing.
  const swaying = !low && BARD_SWAY.kinds.includes(horse.barding) ? { ...bardSwing(), withers: W } : null;
  if (swaying) {
    const own = { ...materials, soft: swayBard(doubleSided(surface(0xffffff, { vertexColors: true })), swaying, W), metal: swayBard(doubleSided(steelMaterial(view.steelEnv, { vertexColors: true })), swaying, W) };
    const meshes = horsePart(frame, parts.body, own, { ink, bard: (tile) => swayBard(makeBardMaterial(view, tile, horse.finish), swaying, W) });
    swaying.materials = [];
    for (const mesh of meshes) {
      swaying.materials.push(mesh.material);
      for (const child of mesh.children) if (child.userData.outline && child.material) swayBard(child.material, swaying, W);
    }
  } else horsePart(frame, parts.body, materials, { ink, bard });
  // Neck, head, ears: the neck pivots at the withers, the head at the poll, the ears at their bases.
  const neck = new THREE.Group();
  neck.position.set(...rig.neckPivot);
  frame.add(neck);
  horsePart(neck, parts.neck, materials, { ink, bard });
  const head = new THREE.Group();
  head.position.set(...rig.poll);
  neck.add(head);
  horsePart(head, parts.head, materials, { ink, bard });
  const ears = [];
  if (!low) {
    for (const side of [1, -1]) {
      const ear = new THREE.Group();
      ear.position.set(rig.earBase[0], rig.earBase[1], side * rig.earSpread);
      head.add(ear);
      horsePart(ear, parts.ear, materials);
      ears.push({ ear, side });
    }
  }
  // Legs: drawn in the world, placed each frame from the gait.
  const legs = {};
  for (const leg of HORSE_SHAPE.legs) {
    const set = parts.legs[leg.key];
    const pieces = {};
    for (const [name, part] of Object.entries(set)) {
      const holder = new THREE.Group();
      view.scene.add(holder);
      pieces[name] = { holder, meshes: horsePart(holder, part, materials, { ink: name === 'upper' ? ink : 0 }) };
      if (!part.soft && !part.metal) pieces[name].holder.visible = false;
    }
    legs[leg.key] = pieces;
  }
  const base = model.spec.base ? buildBaseHorse(view, horse, rig, { low }) : null;
  // Hair and cloth that move: made per horse.
  const hang = {};
  if (!low) {
    if (!rig.maneHidden) hang.mane = horseMane(neck, rig, materials, owned);
    hang.tail = horseTail(frame, rig, materials, owned);
    if (rig.trapper) hang.trapper = horseTrapper(frame, rig, materials, owned);
    hang.stirrups = horseStirrups(frame, rig, materials, owned);
    hang.reins = horseReins(view.scene, materials, owned);
  }
  view.scene.add(group);
  return {
    horse, model, group, body, frame, neck, head, ears, legs, hang, owned, detail, base, swaying,
    drawn: { ...horse, capsules: [], legs: {} },
    clock: null, lastTime: null, gaitRoll: 0, lameLeg: null,
  };
}

// ---- The mane --------------------------------------------------------------------------

/** Hair strips face sideways; the material is two-sided, so one normal serves both faces. */
function horseSideNormals(count) {
  const normals = new Float32Array(count * 3);
  for (let v = 0; v < count; v += 1) normals[v * 3 + 2] = 1;
  return new THREE.BufferAttribute(normals, 3);
}

function horseManeGeometry(count, rows) {
  const vertices = count * rows * 2;
  const positions = new Float32Array(vertices * 3);
  const indices = [];
  for (let tuft = 0; tuft < count; tuft += 1) {
    for (let row = 0; row < rows - 1; row += 1) {
      const a = (tuft * rows + row) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('normal', horseSideNormals(vertices));
  geometry.frustumCulled = false;
  return geometry;
}

function horseHairMesh(parent, geometry, material, owned) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  parent.add(mesh);
  owned.push(mesh);
  return mesh;
}

/** The mane: a row of tufts along the crest, each a strip hung from the crest and swaying with the gait. */
function horseMane(neck, rig, materials, owned) {
  const { tufts } = rig.mane;
  const rows = 4;
  const geometry = horseManeGeometry(tufts.length, rows);
  const colors = new Float32Array(tufts.length * rows * 2 * 3);
  tufts.forEach((tuft, index) => {
    for (let row = 0; row < rows; row += 1) {
      const shade = 1 - 0.25 * (row / (rows - 1)) - 0.05 * (index % 2);
      for (let side = 0; side < 2; side += 1) colors.set([rig.mane.color[0] * shade, rig.mane.color[1] * shade, rig.mane.color[2] * shade], ((index * rows + row) * 2 + side) * 3);
    }
  });
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = horseHairMesh(neck, geometry, materials.hair, owned);
  return { mesh, rows };
}

function updateMane(hang, rig, motion) {
  const { mesh, rows } = hang;
  const positions = mesh.geometry.attributes.position.array;
  const side = rig.mane.side;
  const upright = rig.mane.upright;
  rig.mane.tufts.forEach((tuft, index) => {
    const swing = Math.sin(motion.cycle * 2 * Math.PI + tuft.phase) * motion.sway + Math.sin(motion.time * 1.6 + tuft.phase * 2) * 0.03;
    for (let row = 0; row < rows; row += 1) {
      const s = row / (rows - 1);
      // The hair lies over the neck's side from the crest, hangs down it, streams back with speed and swings with the stride.
      // Down the neck's side: its width a little below the crest is the ellipse's, narrowing to nothing at the throat.
      const down = Math.min(1.98, (tuft.length * s * 0.95) / tuft.depth);
      const fit = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(1 - down), 2.5)), 1 / 2.5);
      const z = (index % 3 === 2 ? -side : side) * (tuft.hw * fit * 1.06 + 0.005) * (1 - 0.4 * upright) * Math.min(1, s * 4 + 0.15);
      const lift = upright * tuft.length * 0.9 * Math.sin(Math.min(1, s * 2) * Math.PI) * 0.5;
      const x = tuft.base[0] - (motion.stream * 0.9 + swing) * tuft.length * s * s - tuft.length * 0.08 * s;
      const y = tuft.base[1] - tuft.length * s * (0.95 - 0.5 * upright) + lift;
      const half = tuft.width * 0.5 * Math.pow(1 - s, 0.8) + tuft.width * 0.04;
      const at = (index * rows + row) * 6;
      positions[at] = x - half * 0.8;
      positions[at + 1] = y - half * 0.6;
      positions[at + 2] = z;
      positions[at + 3] = x + half * 0.8;
      positions[at + 4] = y + half * 0.6;
      positions[at + 5] = z;
    }
  });
  mesh.geometry.attributes.position.needsUpdate = true;
}

// ---- The tail ---------------------------------------------------------------------------

const HORSE_TAIL = { points: 6, strands: 9 };

/** The tail's hair: a chain hung from the dock, drawn as a fan of strands along it. */
function horseTail(frame, rig, materials, owned) {
  const { points, strands } = HORSE_TAIL;
  const vertices = strands * points * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices * 3), 3));
  const colors = new Float32Array(vertices * 3);
  const indices = [];
  for (let strand = 0; strand < strands; strand += 1) {
    for (let k = 0; k < points; k += 1) {
      const shade = (0.82 + 0.18 * ((strand * 5) % 3) / 2) * (1 - 0.1 * (k / points));
      for (let side = 0; side < 2; side += 1) colors.set([rig.coat.mane[0] * shade, rig.coat.mane[1] * shade, rig.coat.mane[2] * shade], ((strand * points + k) * 2 + side) * 3);
      if (k < points - 1) {
        const a = (strand * points + k) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('normal', horseSideNormals(vertices));
  geometry.setIndex(indices);
  const mesh = horseHairMesh(frame, geometry, materials.hair, owned);
  return { mesh, chain: hairChain(points, rig.tailLength / (points - 1)), rest: new Float64Array(points * 3), local: new Float64Array(points * 3) };
}

/** A frame's matrix applied to a local point, into an array. */
function horseToWorld(matrix, x, y, z, out, at) {
  const e = matrix.elements;
  out[at] = e[0] * x + e[4] * y + e[8] * z + e[12];
  out[at + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
  out[at + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
}

function updateTail(hang, rig, frame, motion, dt) {
  const { mesh, chain, rest, local } = hang;
  const { points, strands } = HORSE_TAIL;
  const segment = rig.tailLength / (points - 1);
  // Where the hair lies at rest: the dock's carriage, lifted and streaming with speed; a swish when standing.
  let x = rig.tailRoot[0];
  let y = rig.tailRoot[1];
  const swish = Math.sin(motion.time * 1.3) * 0.05 * (1 - motion.pace);
  horseToWorld(frame.matrixWorld, x, y, 0, rest, 0);
  for (let k = 1; k < points; k += 1) {
    const lift = motion.pace;
    const angle = rig.tailCarriage[Math.min(4, k - 1)] * (1 - 0.8 * lift * rig.tailLift) - 0.1 * lift * rig.tailLift;
    x -= Math.cos(angle) * segment;
    y -= Math.sin(angle) * segment;
    horseToWorld(frame.matrixWorld, x, y, swish * rig.withers * (k / points), rest, k * 3);
  }
  const stiff = [0, 70, 38, 22, 14, 10];
  stepHair(chain, dt, rest, { stiff, drag: 2.2, gravity: 0.7 });
  // Into the frame's own coordinates.
  horseInverse.copy(frame.matrixWorld).invert();
  const e = horseInverse.elements;
  for (let k = 0; k < points; k += 1) {
    const px = chain.p[k * 3];
    const py = chain.p[k * 3 + 1];
    const pz = chain.p[k * 3 + 2];
    local[k * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12];
    local[k * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13];
    local[k * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
  }
  const positions = mesh.geometry.attributes.position.array;
  const W = rig.withers;
  for (let strand = 0; strand < strands; strand += 1) {
    const spread = (strand - (strands - 1) / 2) / ((strands - 1) / 2);
    const lengthShare = 0.86 + 0.14 * Math.cos(spread * 1.2) - 0.05 * ((strand * 3) % 2);
    for (let k = 0; k < points; k += 1) {
      const u = Math.min(points - 1, (k / (points - 1)) * lengthShare * (points - 1));
      const lo = Math.floor(u);
      const hi = Math.min(points - 1, lo + 1);
      const f = u - lo;
      const px = local[lo * 3] + (local[hi * 3] - local[lo * 3]) * f;
      const py = local[lo * 3 + 1] + (local[hi * 3 + 1] - local[lo * 3 + 1]) * f;
      const pz = local[lo * 3 + 2] + (local[hi * 3 + 2] - local[lo * 3 + 2]) * f;
      const tx = local[hi * 3] - local[lo * 3] || 1e-4;
      const ty = local[hi * 3 + 1] - local[lo * 3 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      // The strand's side-to-side spread widens down the hair; the ribbon's width is across its line in the horse's plane.
      const fan = spread * (0.012 + 0.03 * (k / (points - 1))) * W + Math.sin(motion.time * 2 + strand * 1.7 + k) * 0.004 * k;
      const width = (0.02 * (1 - 0.75 * (k / (points - 1))) + 0.003) * W;
      const nx = (-ty / tl) * width;
      const ny = (tx / tl) * width;
      const at = (strand * points + k) * 6;
      positions[at] = px - nx;
      positions[at + 1] = py - ny;
      positions[at + 2] = pz + fan;
      positions[at + 3] = px + nx;
      positions[at + 4] = py + ny;
      positions[at + 5] = pz + fan;
    }
  }
  mesh.geometry.attributes.position.needsUpdate = true;
}

// ---- The trapper ---------------------------------------------------------------------------

function horseTrapper(frame, rig, materials, owned) {
  const { trapper } = rig;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trapper.vertices * 3), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(trapper.colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(trapper.indices, 1));
  const mesh = horseHairMesh(frame, geometry, materials.hair, owned);
  const chains = trapper.hung.map((column) => hairChain(trapper.links + 1, 0.0));
  trapper.hung.forEach((column, index) => {
    const lengths = [0];
    let last = column.pivot;
    column.rest.forEach((point) => {
      lengths.push(Math.hypot(point[0] - last[0], point[1] - last[1], point[2] - last[2]));
      last = point;
    });
    chains[index].links = lengths;
    chains[index].segment = Math.max(...lengths);
  });
  return { mesh, chains, rest: new Float64Array((trapper.links + 1) * 3) };
}

function updateTrapper(hang, rig, frame, horse, dt) {
  const { trapper } = rig;
  const { chains, rest, mesh } = hang;
  const rows = trapper.links + 1;
  const positions = mesh.geometry.attributes.position.array;
  horseInverse.copy(frame.matrixWorld).invert();
  const inverse = horseInverse.elements;
  const capsules = horse.capsules?.slice(0, 2) ?? [];
  const collide = (p, at) => {
    // Out of the barrel and chest (capsules a little wider than the body), and off the floor.
    for (const capsule of capsules) {
      const [ax, ay, az] = capsule.a;
      const bx = capsule.b[0] - ax;
      const by = capsule.b[1] - ay;
      const bz = capsule.b[2] - az;
      const span = bx * bx + by * by + bz * bz || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[at] - ax) * bx + (p[at + 1] - ay) * by + (p[at + 2] - az) * bz) / span));
      const cx = ax + bx * t;
      const cy = ay + by * t;
      const cz = az + bz * t;
      const dx = p[at] - cx;
      const dy = p[at + 1] - cy;
      const dz = p[at + 2] - cz;
      const reach = capsule.radius * 0.97;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
      if (distance < reach) {
        p[at] = cx + (dx / distance) * reach;
        p[at + 1] = cy + (dy / distance) * reach;
        p[at + 2] = cz + (dz / distance) * reach;
      }
    }
    if (p[at + 1] < 0.02) p[at + 1] = 0.02;
  };
  trapper.hung.forEach((column, index) => {
    const chain = chains[index];
    horseToWorld(frame.matrixWorld, column.pivot[0], column.pivot[1], column.pivot[2], rest, 0);
    column.rest.forEach((point, j) => horseToWorld(frame.matrixWorld, point[0], point[1], point[2], rest, (j + 1) * 3));
    stepHair(chain, dt, rest, { stiff: [0, 190, 140, 110, 90], drag: 5, gravity: 0.8, collide, link: chain.links });
    for (let row = 0; row < rows; row += 1) {
      const px = chain.p[row * 3];
      const py = chain.p[row * 3 + 1];
      const pz = chain.p[row * 3 + 2];
      const at = (index * rows + row) * 3;
      positions[at] = inverse[0] * px + inverse[4] * py + inverse[8] * pz + inverse[12];
      positions[at + 1] = inverse[1] * px + inverse[5] * py + inverse[9] * pz + inverse[13];
      positions[at + 2] = inverse[2] * px + inverse[6] * py + inverse[10] * pz + inverse[14];
    }
  });
  mesh.geometry.attributes.position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

// ---- Stirrups and reins ----------------------------------------------------------------------

function horseStirrups(frame, rig, materials, owned) {
  const W = rig.withers;
  const out = [];
  for (const side of [1, -1]) {
    const holder = new THREE.Group();
    frame.add(holder);
    const ring = new THREE.TorusGeometry(0.036 * W, 0.0045 * W, 5, 12);
    ring.scale(1.15, 1.3, 1);
    ring.rotateY(Math.PI / 2);
    horsePainted(ring, HORSE_LOOK.iron);
    const iron = new THREE.Mesh(ring, materials.metal);
    iron.castShadow = true;
    holder.add(iron);
    const tread = new THREE.BoxGeometry(0.05 * W, 0.006 * W, 0.075 * W);
    tread.translate(0, -0.046 * W, 0);
    horsePainted(tread, HORSE_LOOK.iron);
    const treadMesh = new THREE.Mesh(tread, materials.metal);
    holder.add(treadMesh);
    const leatherGeometry = new THREE.BoxGeometry(0.006 * W, 1, 0.026 * W);
    leatherGeometry.translate(0, 0.5, 0);
    horsePainted(leatherGeometry, HORSE_LOOK.leather);
    const leather = new THREE.Mesh(leatherGeometry, materials.soft);
    leather.castShadow = true;
    frame.add(leather);
    owned.push(iron, treadMesh, leather);
    out.push({ side, holder, leather, chain: hairChain(2, rig.stirrupDrop), rest: new Float64Array(6) });
  }
  return out;
}

function updateStirrups(hang, rig, frame, horse, rider, dt) {
  const W = rig.withers;
  for (const stirrup of hang) {
    const bar = [rig.saddle.bar[0], rig.saddle.bar[1], stirrup.side * rig.saddle.bar[2]];
    let at;
    if (rider) {
      // The iron hangs under his foot.
      const foot = rider.x;
      const index = (stirrup.side > 0 ? P.lFoot : P.rFoot) * 3;
      horseVector.set(foot[index], foot[index + 1] - 0.015, foot[index + 2]);
      frame.worldToLocal(horseVector);
      at = [horseVector.x, horseVector.y + 0.012 * W, horseVector.z];
      stirrup.chain.ready = false;
    } else {
      // No rider: it swings on its leather from the bar.
      horseToWorld(frame.matrixWorld, bar[0], bar[1], bar[2], stirrup.rest, 0);
      horseToWorld(frame.matrixWorld, bar[0], bar[1] - rig.stirrupDrop, bar[2] + stirrup.side * 0.02 * W, stirrup.rest, 3);
      stepHair(stirrup.chain, dt, stirrup.rest, { stiff: [0, 5], drag: 1.2, gravity: 1 });
      horseVector.set(stirrup.chain.p[3], stirrup.chain.p[4], stirrup.chain.p[5]);
      frame.worldToLocal(horseVector);
      at = [horseVector.x, horseVector.y, horseVector.z];
    }
    stirrup.holder.position.set(at[0], at[1], at[2]);
    stirrup.holder.rotation.set(0, 0, 0);
    layStrap(stirrup.leather, bar, [at[0], at[1] + 0.04 * W, at[2]]);
  }
}

const HORSE_REIN_POINTS = 9;

function horseReins(scene, materials, owned) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * (HORSE_REIN_POINTS - 1) * 2 * 3), 3));
  const lines = new THREE.LineSegments(geometry, materials.rein);
  lines.frustumCulled = false;
  scene.add(lines);
  owned.push(lines);
  return { lines };
}

/** The reins: from each side of the bit to the rider's hand, slack where he does not hold them taut; with no rider they fall to the pommel. */
function updateReins(hang, rig, head, frame, horse, rider) {
  const W = rig.withers;
  const positions = hang.lines.geometry.attributes.position.array;
  head.updateWorldMatrix(true, false);
  let at = 0;
  for (const side of [1, -1]) {
    horseVector.set(rig.bit[0], rig.bit[1], side * Math.abs(rig.bit[2]) + side * 0.0);
    head.localToWorld(horseVector);
    const bit = [horseVector.x, horseVector.y, horseVector.z];
    let hand;
    let slack;
    if (rider) {
      // Both reins in the left hand, a hand's width apart.
      const index = P.lHand * 3;
      hand = [rider.x[index], rider.x[index + 1], rider.x[index + 2]];
      const sideways = horseVector.set(0, 0, side * 0.03).applyQuaternion(frame.getWorldQuaternion(new THREE.Quaternion()));
      hand = [hand[0] + sideways.x, hand[1] + sideways.y, hand[2] + sideways.z];
      const reach = Math.hypot(hand[0] - bit[0], hand[1] - bit[1], hand[2] - bit[2]);
      slack = Math.max(0.02, (0.95 * W - reach) * 0.6);
    } else {
      horseVector.set(rig.saddle.pommel[0], rig.saddle.pommel[1] + 0.02 * W, side * 0.05 * W);
      frame.localToWorld(horseVector);
      hand = [horseVector.x, horseVector.y, horseVector.z];
      slack = 0.3 * W;
    }
    for (let k = 0; k < HORSE_REIN_POINTS - 1; k += 1) {
      for (const j of [k, k + 1]) {
        const s = j / (HORSE_REIN_POINTS - 1);
        positions[at++] = bit[0] + (hand[0] - bit[0]) * s;
        positions[at++] = bit[1] + (hand[1] - bit[1]) * s - slack * 4 * s * (1 - s);
        positions[at++] = bit[2] + (hand[2] - bit[2]) * s;
      }
    }
  }
  hang.lines.geometry.attributes.position.needsUpdate = true;
}

// ---- Each frame ----------------------------------------------------------------------------

/** The leg the physics has broken or cut worst (the one that hangs), if the horse is lame. */
function lameLegOf(horse) {
  if (!horse.lame) return null;
  let worst = null;
  let most = -1;
  for (const leg of HORSE_SHAPE.legs) {
    const harm = horse.wounds?.[leg.key] ?? 0;
    if (harm > most) {
      most = harm;
      worst = leg.key;
    }
  }
  return worst;
}

const horseDown = [0, -1, 0];

/** Put the horse where it is now (its legs in their stride, rolled over if down). `world` gives the time and the rider. */
export function updateHorseView(view, world = null, frameDt = null) {
  if (view.robot) return updateRobotDogView(view, world);
  const horse = view.horse;
  const drawn = view.drawn;
  const rig = view.model.rig;
  Object.assign(drawn, { at: horse.at, yaw: horse.yaw, speed: horse.speed, stride: horse.stride, state: horse.state, roll: horse.roll, fall: horse.fall, withers: horse.withers, bank: horse.bank });
  poseHorse(drawn);
  const W = horse.withers;
  const time = world?.time ?? performance.now() / 1000;
  // The step: the drawn frame's own (main.js drawWorld, at the fight's pace), when given. The world's clock moves in whole
  // physics steps while the horse is drawn blended between them, so a spring stepped by it had nothing on one frame and two
  // steps on the next against a horse that had moved smoothly: the bard and the flesh jerked at the physics' rate.
  const dt = frameDt !== null ? Math.max(0, Math.min(0.05, frameDt)) : view.lastTime === null ? 0 : Math.max(0, Math.min(0.05, time - view.lastTime));
  view.lastTime = time;
  const up = horse.state === 'up';
  const speed = Math.abs(horse.speed);
  const pace = Math.min(1, speed / (horse.paces?.gallop ?? 10));
  const cycle = horse.stride;
  const fall = horse.fall ?? 0;
  // The gait's nod: head and neck rise and fall once a stride (a walk, a canter, a gallop), stretching forward with speed.
  const moving = up ? Math.min(1, speed / 1.5) : 0;
  const nod = Math.sin(cycle * Math.PI * 2 * (speed > 2.4 && speed < 4.6 ? 2 : 1) + 0.6) * moving;
  const idle = Math.sin(time * 0.7 + (horse.id ?? 0)) * 0.025 * (1 - moving);
  view.group.position.set(horse.at[0], (drawn.bob ?? 0) - (horse.sunk ?? 0), horse.at[1]);
  view.group.rotation.y = horse.yaw;
  // The body pitches (nose up and down) and rocks about its barrel with the stride, as the physics has it (physics/mounted.js horseMotion), and the fall's roll.
  view.body.rotation.z = drawn.pitch ?? 0;
  view.body.rotation.x = (horse.roll ?? 0) + (drawn.rock ?? 0);
  // Leaning into a turn: the whole horse about its hooves (the group stands on the ground; yaw, then the roll about its own forward line).
  view.group.rotation.order = 'YXZ';
  view.group.rotation.x = horse.bank ?? 0;
  view.body.position.y = 0.76 * W - fall * (0.76 * W - 0.21 * W);
  const pitchAmp = speed < 2.4 ? 0.07 : speed < 4.6 ? 0.025 : 0.06;
  view.neck.rotation.z = -0.22 * pace - pitchAmp * nod * 0.6 + idle - fall * 0.5 + (horse.dead ? -0.1 * fall : 0);
  view.head.rotation.z = 0.12 * pace + pitchAmp * nod * 0.9 - idle * 0.6 - fall * 0.1;
  view.neck.rotation.y = up ? Math.sin(cycle * Math.PI * 2) * 0.05 * moving : 0;
  // Ears: pricked when standing, pinned back at speed, a flick now and then.
  for (const { ear, side } of view.ears) {
    const flick = Math.max(0, Math.sin(time * 0.83 + side * 1.9 + (horse.id ?? 0))) ** 14 * 0.45;
    ear.rotation.z = -0.28 + 0.75 * pace - flick * 0.8;
    ear.rotation.x = side * (0.3 + 0.2 * pace + flick * 0.5);
    ear.rotation.y = side * -0.05;
  }
  // The legs: the physics' root, knee and hoof; the lower leg bent at the fetlock and the hoof set flat.
  view.lameLeg = lameLegOf(horse);
  const forward = [Math.cos(horse.yaw), 0, -Math.sin(horse.yaw)];
  const back = [-forward[0], 0, -forward[2]];
  const lengths = rig.lengths;
  for (const [key, pieces] of Object.entries(view.legs)) {
    const leg = drawn.legs[key];
    const root = leg.root;
    let knee = leg.knee;
    let hoof = leg.hoof;
    if (key === view.lameLeg) {
      // Broken: held up and swinging, the lower leg hanging from the knee.
      const swing = Math.sin(time * 3.1) * 0.03 * W;
      hoof = [root[0] + swing, root[1] - 0.26 * W, root[2]];
      const mid = [(root[0] + hoof[0]) / 2, (root[1] + hoof[1]) / 2, (root[2] + hoof[2]) / 2];
      knee = twoBoneIK(root, hoof, HORSE_SHAPE.upperLeg * W, HORSE_SHAPE.lowerLeg * W, vec.sub(leg.knee, mid));
    }
    const lifted = key === view.lameLeg ? 1 : Math.min(1, Math.max(0, (hoof[1] - 0.04 * W) / (0.05 * W)));
    // The sole rests on the ground when the hoof does; the coronet a hoof's height above it.
    const sole = [hoof[0], Math.max(0, hoof[1] - 0.03 * W), hoof[2]];
    const hoofHeight = lengths.hoof;
    let coronet = [sole[0], sole[1] + hoofHeight, sole[2]];
    coronet = vec.lerp(coronet, knee, 0.12 * lifted);
    let fetlock = twoBoneIK(knee, coronet, lengths.cannon, lengths.pastern, back);
    const axisDown = vec.normalize(vec.lerp(horseDown, vec.normalize(vec.sub(coronet, fetlock)), lifted));
    coronet = vec.sub(sole, vec.scale(axisDown, hoofHeight));
    if (lifted < 0.01) coronet = [sole[0], sole[1] + hoofHeight, sole[2]];
    fetlock = twoBoneIK(knee, coronet, lengths.cannon, lengths.pastern, back);
    const lower = vec.add(knee, vec.scale(vec.normalize(vec.sub(fetlock, knee)), lengths.cannon));
    layHorsePart(pieces.upper.holder, root, knee, forward);
    layHorsePart(pieces.cannon.holder, knee, lower, forward);
    if (pieces.pastern) {
      layHorsePart(pieces.pastern.holder, fetlock, coronet, forward);
      layHorsePart(pieces.hoof.holder, coronet, vec.add(coronet, axisDown), forward);
    }
  }
  if (view.base) updateBaseHorse(view, horse, dt);
  if (view.swaying) {
    // Only under a man who has the soft swing now (main.js softSwing: the man played, the two of a duel); else at rest.
    const rider = world?.fighters.find((fighter) => fighter.id === horse.rider) ?? null;
    if (!world || rider?.softSwing) {
      updateBardSwing(view.swaying, view.frame, dt);
      updateBardTwist(view.swaying, horse.yaw, dt);
    } else if (view.swaying.at) {
      view.swaying.at = null;
      view.swaying.turn = null;
      view.swaying.uniform.value.set(0, 0, 0);
      view.swaying.twist.value = 0;
    }
  }
  // Hair and cloth hang from where everything now is.
  if (view.hang.tail) {
    view.group.updateMatrixWorld(true);
    const motion = { cycle, time, sway: 0.09 * moving + 0.03, stream: 0.5 * pace + 0.05 * (1 - moving), pace };
    if (view.hang.mane) updateMane(view.hang.mane, rig, motion);
    updateTail(view.hang.tail, rig, view.frame, motion, dt);
    const rider = world?.fighters.find((fighter) => fighter.id === horse.rider && fighter.mount === horse) ?? null;
    if (view.hang.trapper) updateTrapper(view.hang.trapper, rig, view.frame, drawn, dt);
    updateStirrups(view.hang.stirrups, rig, view.frame, horse, rider, dt);
    updateReins(view.hang.reins, rig, view.head, view.frame, horse, rider);
  }
}

// ---- The user's horse model ---------------------------------------------------------------

/**
 * The belly's weight: the gut with its contents (some 10-15% of a horse's mass, 50-70 kg in a 470 kg horse: the caecum and
 * the great colon alone hold ~80-100 L) hangs in the abdomen on its mesentery and the abdominal wall, a heavy mass on a soft
 * spring. When the trunk is jolted (each stride's rise and fall, a hard halt, a turn) it lags and swings back, and the belly
 * and the lower flanks over it swing with it: the 'visceral piston' that couples a galloping horse's breathing to its stride
 * (Bramble & Carrier 1983, 'Running and breathing in mammals', Science 219:251).
 * - hz: the gut's natural frequency on its suspension, ~2.5 Hz (2-3 Hz: near the canter's and gallop's stride rate of
 *   1.7-2.2 Hz, which is why it couples to them; well above the walk's 0.95 Hz strides, which barely stir it; the trot's
 *   bounce, twice a stride at ~2.7 Hz, drives it hardest, as a rider sitting the trot knows).
 * - damping: ratio ~0.2: one visible swing back after a halt and a smaller one, gone within ~1 s, never a wobble.
 * - showing: the share of the gut's swing the skin over it shows (the abdominal wall's muscle carries the rest).
 * - most: the furthest the gut swings (m), the wall's own limit (a horse's belly never swings more than a hand's breadth).
 * - hind, fore: where the belly runs, from the stifle (in front of the hind legs' roots) to the girth (behind the elbows), as
 *   shares of the way from the hind legs' roots to the fore legs'; `ramp` the share over which it fades in at each end.
 * - flank: how far above the barrel's middle the slack reaches (of the barrel's half-depth): the flank over the gut swings
 *   too, the loin and the back over the spine do not.
 */
const HORSE_BELLY = { hz: 2.5, damping: 0.2, showing: 0.6, most: 0.06, hind: 0.08, fore: 0.82, ramp: 0.18, flank: 0.35 };

const BASE_TABLES = {};
const baseForward = new THREE.Vector3();
const baseRoot = new THREE.Vector3();
const baseKnee = new THREE.Vector3();
const baseStretch = new THREE.Matrix4();

/** The coat image (the model's coat as its brightness: horsebase-data.js), loaded once. */
function baseHorseTexture() {
  if (!BASE_TABLES.texture) {
    BASE_TABLES.texture = new THREE.TextureLoader().load(HORSE_BASE_DATA.image);
    BASE_TABLES.texture.flipY = true;
  }
  return BASE_TABLES.texture;
}

/** A frame from `from` to `to` (y along it, x towards `forward`), as layHorsePart lays a leg's piece. */
function baseHorseFrame(from, to, forward, out = new THREE.Matrix4()) {
  horseY.set(to[0] - from[0], to[1] - from[1], to[2] - from[2]).normalize();
  horseX.set(forward[0], forward[1], forward[2]);
  horseX.addScaledVector(horseY, -horseX.dot(horseY)).normalize();
  horseZ.crossVectors(horseX, horseY);
  out.makeBasis(horseX, horseY, horseZ);
  out.setPosition(from[0], from[1], from[2]);
  return out;
}

/**
 * Each point's own colour of the coat (horsemesh.js horseCoat, as the loft is painted): the body's, paler under the belly, a
 * bay's or a dun's dark points down the legs, a sock or a stocking white, the hoof horn, the muzzle dark, the dock its hair's. The coat image's
 * brightness shades it (the model's own light and dark, its muscle and hair).
 */
function baseHorseColours(mesh, fit, coat) {
  const { points, weights, parts, joints } = mesh;
  const count = points.length / 3;
  const colours = new Float32Array(count * 3);
  const smooth = (t) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const legKeys = ['lFore', 'rFore', 'lHind', 'rHind'];
  const white = [0.93, 0.91, 0.86];
  const horn = [0.72, 0.66, 0.58];
  const headAxis = [fit.muzzle[0] - fit.poll[0], fit.muzzle[1] - fit.poll[1]];
  const headSquared = headAxis[0] * headAxis[0] + headAxis[1] * headAxis[1] || 1;
  for (let v = 0; v < count; v += 1) {
    const [x, y] = [points[v * 3], points[v * 3 + 1]];
    const part = parts[weights[v * 3]];
    let colour = coat.body;
    if (part === 'body' && mesh.dock[v]) {
      // The dock behind the croup: its hair (the hair tail hangs from its end), the mane's colour, as the loft's dock.
      colour = coat.mane;
    } else if (part === 'body') {
      // Paler under the belly (the loft's: from a little below the barrel's middle).
      const top = fit.bodyFn(x, Math.PI / 2)[1];
      const bottom = fit.bodyFn(x, -Math.PI / 2)[1];
      const down = ((top + bottom) / 2 - y) / ((top - bottom) / 2);
      colour = mix(colour, coat.belly, smooth(down * 1.4 - 0.3));
    } else if (part === 'head') {
      // The muzzle's dark skin over its last fifth; a bay's or a dun's face darkened towards it.
      const along = ((x - fit.poll[0]) * headAxis[0] + (y - fit.poll[1]) * headAxis[1]) / headSquared;
      if (coat.type === 'bay' || coat.type === 'dun') colour = mix(colour, coat.points, smooth((along - 0.33) / 0.54) * 0.4);
      colour = mix(colour, coat.muzzle, smooth((along - 0.77) / 0.14));
    } else if (part !== 'neck') {
      // Down a leg, as the loft's (horsemesh.js legColor): its share of the way from its root to the ground.
      const key = part.split('.')[0];
      const root = joints[key].root[1];
      const global = Math.max(0, Math.min(1, (root - y) / root));
      const sock = coat.socks[legKeys.indexOf(key)];
      if (coat.type !== 'chestnut') colour = mix(colour, coat.points, smooth((global - 0.3) / 0.2) * (coat.type === 'grey' ? 0.5 : 1));
      if (sock && global > (sock === 3 ? 0.58 : 0.82)) colour = white;
      if (global > 0.94) colour = sock ? horn : coat.hoof;
    }
    colours.set(colour, v * 3);
  }
  return colours;
}

/** Each point's share of the belly's slack (HORSE_BELLY): along the belly, below the flank's line, by its weight on the trunk. */
function baseHorseBelly(mesh, fit) {
  const { points, weights, joints } = mesh;
  const count = points.length / 3;
  const shares = new Float32Array(count);
  const hindX = joints.lHind.root[0];
  const foreX = joints.lFore.root[0];
  const smooth = (t) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };
  for (let v = 0; v < count; v += 1) {
    const x = points[v * 3];
    const y = points[v * 3 + 1];
    const first = weights[v * 3 + 2] / 255;
    const onTrunk = (weights[v * 3] === 0 ? first : 0) + (weights[v * 3 + 1] === 0 ? 1 - first : 0);
    if (onTrunk <= 0) continue;
    const along = (x - hindX) / (foreX - hindX);
    const lengthwise = smooth((along - HORSE_BELLY.hind) / HORSE_BELLY.ramp) * smooth((HORSE_BELLY.fore - along) / HORSE_BELLY.ramp);
    const top = fit.bodyFn(x, Math.PI / 2)[1];
    const bottom = fit.bodyFn(x, -Math.PI / 2)[1];
    const middle = (top + bottom) / 2;
    const half = (top - bottom) / 2;
    const down = smooth((middle + HORSE_BELLY.flank * half - y) / ((1 + HORSE_BELLY.flank) * half));
    shares[v] = onTrunk * lengthwise * down * HORSE_BELLY.showing;
  }
  return shares;
}

/**
 * The user's horse as one skinned mesh over the horse's frames: the body (the view's frame), the neck, the head, and each
 * leg's upper leg, cannon and pastern (the pieces' holders, placed each frame from the gait). Bound where the view's frames
 * are at rest (a standing horse at the origin): the body at the frame, the neck and the head at the model's own neck root and
 * poll (the rig's, horsemesh.js), each leg's piece along the model's own bone, stretched along it to the game's length of that
 * piece. Its solid tail beyond the dock is folded into the dock's end (the hair tail hangs there); its coat image, the coat's
 * brightness, coloured the horse's coat. The tack and the bard are built over it (horsemesh.js `base`).
 */
function buildBaseHorse(view, horse, rig, { low = false } = {}) {
  const mesh = horseBaseMesh();
  const fit = horseBaseFit();
  const W = horse.withers;
  const count = mesh.points.length / 3;
  const positions = new Float32Array(count * 3);
  const tip = mesh.joints.dock[1];
  for (let vertex = 0; vertex < count; vertex += 1) {
    // (The tail beyond the dock drawn into the dock's end by its share of it: a point wholly on it folds to the end, its
    // triangles to nothing.)
    const fold = mesh.tail[vertex];
    for (let axis = 0; axis < 3; axis += 1) positions[vertex * 3 + axis] = (mesh.points[vertex * 3 + axis] * (1 - fold) + tip[axis] * fold) * W;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(mesh.uvs, 2));
  geometry.setIndex(mesh.triangles);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let vertex = 0; vertex < count; vertex += 1) {
    const first = mesh.weights[vertex * 3 + 2] / 255;
    skinIndex[vertex * 4] = mesh.weights[vertex * 3];
    skinIndex[vertex * 4 + 1] = mesh.weights[vertex * 3 + 1];
    skinWeight[vertex * 4] = first;
    skinWeight[vertex * 4 + 1] = 1 - first;
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setAttribute('color', new THREE.BufferAttribute(baseHorseColours(mesh, fit, rig.coat), 3));
  geometry.computeVertexNormals();
  // The bind: each part's frame at rest, the leg pieces stretched to the game's lengths.
  const joints = mesh.joints;
  const forward = [1, 0, 0];
  const at = (point) => point.map((value) => value * W);
  const lengths = rig.lengths;
  const inverses = [];
  inverses.push(new THREE.Matrix4());
  inverses.push(new THREE.Matrix4().makeTranslation(...rig.neckPivot).invert());
  inverses.push(new THREE.Matrix4().makeTranslation(rig.neckPivot[0] + rig.poll[0], rig.neckPivot[1] + rig.poll[1], rig.neckPivot[2] + rig.poll[2]).invert());
  for (const key of ['lFore', 'rFore', 'lHind', 'rHind']) {
    const j = joints[key];
    const pieces = [[j.root, j.knee, lengths.upper], [j.knee, j.fetlock, lengths.cannon], [j.fetlock, j.hoof, lengths.pastern + lengths.hoof]];
    for (const [from, to, length] of pieces) {
      const frame = baseHorseFrame(at(from), at(to), forward);
      const modelled = vec.length(vec.sub(at(to), at(from))) || 1e-6;
      inverses.push(new THREE.Matrix4().makeScale(1, length / modelled, 1).multiply(frame.invert()));
    }
  }
  const bones = inverses.map(() => {
    const bone = new THREE.Bone();
    bone.matrixAutoUpdate = false;
    return bone;
  });
  const material = surface(0xffffff, { vertexColors: true });
  material.map = baseHorseTexture();
  // The coat image holds the horse's own coat at 1 / coatGain of white: its colours (by point) times coatGain colour it.
  const gain = HORSE_BASE_DATA.coatGain;
  material.color.setRGB(gain, gain, gain);
  material.skinning = true;
  material.needsUpdate = true;
  const skinned = new THREE.SkinnedMesh(geometry, material);
  skinned.bindMode = 'detached';
  skinned.bind(new THREE.Skeleton(bones, inverses), new THREE.Matrix4());
  skinned.frustumCulled = false;
  skinned.castShadow = true;
  view.scene.add(skinned);
  // A crowd's horse (low detail: far off, one of many) is the same mesh with no ink and no soft flesh, as its loft had neither.
  if (HORSE_LOOK.outline && !low) {
    const outline = outlineFor(skinned, HORSE_LOOK.outline);
    outline.bindMode = 'detached';
    skinned.add(outline);
  }
  const soft = low ? null : new SoftShell(geometry, material, HORSE_LOOK.firmness, { mesh: skinned, recomputeNormals: false });
  soft?.hang(baseHorseBelly(mesh, fit));
  const roots = Object.fromEntries(['lFore', 'rFore', 'lHind', 'rHind'].map((key) => [key, at(joints[key].root)]));
  return { mesh: skinned, bones, soft, roots, upper: lengths.upper, gut: [0, 0, 0], gutRate: [0, 0, 0], lastRate: null, lastBob: null, lastSpeed: null };
}

/**
 * Each frame: the bones from the view's frames, and the belly's slack swung by the trunk's jolts (HORSE_BELLY): the gut a
 * damped mass on a spring, driven by the trunk's acceleration (the stride's rise and fall, speeding up and pulling up, the
 * turn's pull to the outside), lagging and swinging back as a heavy mass does.
 */
function updateBaseHorse(view, horse, dt) {
  const base = view.base;
  view.group.updateMatrixWorld(true);
  const sources = [view.frame, view.neck, view.head];
  for (const key of ['lFore', 'rFore', 'lHind', 'rHind']) {
    const pieces = view.legs[key];
    for (const piece of ['upper', 'cannon', 'pastern']) sources.push((pieces?.[piece] ?? pieces?.cannon)?.holder ?? view.frame);
  }
  sources.forEach((source, index) => {
    source.updateMatrixWorld(true);
    base.bones[index].matrixWorld.copy(source.matrixWorld);
  });
  // Each upper leg from the model's own hip or shoulder joint (where its skin was bound, on the trunk) to the game's knee or
  // hock, not from the game's leg root (up to 6 cm off it): the leg turns where the model's joint is, and the skin over the
  // hip and shoulder is not dragged after a root that is not under it. Its length the joint's to the knee now.
  const e = view.frame.matrixWorld.elements;
  baseForward.set(e[0], e[1], e[2]).normalize();
  ['lFore', 'rFore', 'lHind', 'rHind'].forEach((key, leg) => {
    const knee = view.legs[key]?.cannon?.holder;
    if (!knee) return;
    baseRoot.set(...base.roots[key]).applyMatrix4(view.frame.matrixWorld);
    baseKnee.setFromMatrixPosition(knee.matrixWorld);
    const bone = base.bones[3 + leg * 3];
    baseHorseFrame(baseRoot.toArray(), baseKnee.toArray(), baseForward.toArray(), bone.matrixWorld);
    bone.matrixWorld.multiply(baseStretch.makeScale(1, baseRoot.distanceTo(baseKnee) / base.upper, 1));
  });
  if (!base.soft) return;
  if (dt > 0) {
    // The trunk's acceleration in its own frame (x forward, y up, z to its left): up from its bob, forward from its change of
    // speed, to its left from the turn (v × yaw rate towards the turn's inside).
    const bob = view.group.position.y + view.body.position.y;
    const rate = base.lastBob === null ? 0 : (bob - base.lastBob) / dt;
    const up = base.lastRate === null ? 0 : (rate - base.lastRate) / dt;
    base.lastBob = bob;
    base.lastRate = rate;
    const speed = horse.speed ?? 0;
    const ahead = base.lastSpeed === null ? 0 : (speed - base.lastSpeed) / dt;
    base.lastSpeed = speed;
    // (A positive yaw rate turns it to its right, physics/mounted.js stepHorse: the trunk is pulled to its right, v × yaw rate.)
    const left = -speed * (horse.yawRate ?? 0);
    const omega = 2 * Math.PI * HORSE_BELLY.hz;
    const stiffness = omega * omega;
    const damping = 2 * HORSE_BELLY.damping * omega;
    const drive = [ahead, up, left];
    // (Semi-implicit Euler: stable for ω·dt = 15.7 / 60 ≈ 0.26 ≪ 2; dt is held under 0.05 s, ω·dt ≤ 0.8.)
    for (let axis = 0; axis < 3; axis += 1) {
      base.gutRate[axis] += (-drive[axis] - stiffness * base.gut[axis] - damping * base.gutRate[axis]) * dt;
      const swung = base.gut[axis] + base.gutRate[axis] * dt;
      base.gut[axis] = Math.max(-HORSE_BELLY.most, Math.min(HORSE_BELLY.most, swung));
      // (Stopped against the wall.)
      if (base.gut[axis] !== swung) base.gutRate[axis] = 0;
    }
    base.soft.carry(base.gut[0], base.gut[1], base.gut[2]);
  }
  base.soft.update(dt);
}

/** Remove a horse's model. */
export function disposeHorseView(view, horseView) {
  if (horseView.robot) return disposeRobotDogView(view, horseView);
  view.scene.remove(horseView.group);
  disposeObject(horseView.group);
  if (horseView.base) {
    view.scene.remove(horseView.base.mesh);
    // (Its geometry is its own; the coat image is shared by every horse and kept.)
    horseView.base.mesh.geometry.dispose();
    horseView.base.mesh.material.dispose();
  }
  // (A swaying bard's materials are this horse's own, on shared geometry: freed here.)
  for (const material of horseView.swaying?.materials ?? []) material.dispose();
  for (const mesh of horseView.owned) {
    mesh.parent?.remove(mesh);
    disposeObject(mesh);
  }
  for (const pieces of Object.values(horseView.legs)) {
    for (const piece of Object.values(pieces)) {
      view.scene.remove(piece.holder);
      disposeObject(piece.holder);
    }
  }
}
