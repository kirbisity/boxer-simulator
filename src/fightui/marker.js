// The marks in the fight itself for the player's blows: at the press, a
// ring on the part of his man it goes at (head, body or legs, on the side
// it was asked) and an arrow showing where it comes from and its way (a
// sweep for a swing, chevrons falling for one from above or climbing for
// one that rises, a straight arrow for a thrust), in the colour of its kind;
// then, where it lands, a burst of how it went: a hit a bright ring and a
// flash of its colour, a block a steel shield, a glance a spark's arc, a
// miss the ring sweeping on past, dashed, as it fades.
//
// Quiet, to sit in the scene's own look rather than over it: thin lines, the
// kind's colour muted toward the warm grey of the scene's light, never fully
// opaque, the arrow dimming once it has shown the way, and all of it gone a
// moment after the blow (the men under the marks must stay in view).
//
// Cheap: a fixed handful of flat meshes made once and reused, all one plain
// unlit material kind (one shader, warmed at the start of each fight),
// drawn over everything, facing the camera, never made see-through.

/* global THREE */

import { P } from '../body.js';
import { FIGHT_UI } from './logic.js';

export const FIGHT_UI_MARKS = {
  // The ring's radius (m) on each part of him, and how far (m) to the side a side's ring sits.
  radius: { head: 0.085, body: 0.12, legs: 0.1 },
  aside: { head: 0.08, body: 0.13, legs: 0.11 },
  // Past this distance (m) from the camera the marks grow, to keep their size on the screen.
  growFrom: 3.6,
  // s: the ring closes in this long at the press; the arrow flies in this long.
  closeIn: 0.15,
  flyIn: 0.18,
  // s: the aim fades this long once how it went is known; a press never thrown fades after this.
  fadeOut: 0.14,
  giveUp: 1.4,
  // s: a burst lasts this long; a miss sweeps on for this long.
  burst: 0.4,
  sweep: 0.45,
  // The burst's size (m).
  burstSize: 0.1,
  // The dark shadow under each mark (keeps it legible on a bright scene): its offset (in ring radii) and strength.
  // Soft: enough to lift a thin line off a pale wall, not a black outline.
  shadowOffset: 0.07,
  shadowOpacity: 0.3,
  // The kind's colour is mixed this share toward a warm grey (the scene's lit stone and skin), so the marks
  // keep their hue (which kind of blow) but not the buttons' signal brightness, which shouted over the fight.
  mute: 0.38,
  muteToward: '#cfc6b6',
  // The most each mark is shown (opacity): the ring on him, the arrow, the burst of how it went. Never solid,
  // so the man under the ring is still seen through it; the arrow the least, as it crosses the fight.
  opacity: { aim: 0.62, arrow: 0.5, burst: 0.55 },
  // s: the arrow, once it has flown in and held this long, dims to `arrowRest` of itself (the way is read by then).
  arrowHold: 0.22,
  arrowRest: 0.6,
};

const fightUiMuted = new Map();
/** A colour muted for the marks (FIGHT_UI_MARKS.mute), as a hex string; made once per colour. */
export function fightUiMarkColour(hex) {
  if (!fightUiMuted.has(hex)) {
    const toward = new THREE.Color(FIGHT_UI_MARKS.muteToward);
    fightUiMuted.set(hex, `#${new THREE.Color(hex).lerp(toward, FIGHT_UI_MARKS.mute).getHexString()}`);
  }
  return fightUiMuted.get(hex);
}

const fightUiMarksMaterial = (hex, opacity = 1) => new THREE.MeshBasicMaterial({
  color: new THREE.Color(hex), transparent: true, opacity, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false,
});

/** A flat ribbon along points [[x, y]...], `width(t)` wide at each share t of the way, as a shape. */
function fightUiRibbon(points, width) {
  const left = [];
  const right = [];
  points.forEach((point, index) => {
    const before = points[Math.max(0, index - 1)];
    const after = points[Math.min(points.length - 1, index + 1)];
    const way = [after[0] - before[0], after[1] - before[1]];
    const length = Math.hypot(way[0], way[1]) || 1;
    const half = width(index / (points.length - 1)) / 2;
    const normal = [-way[1] / length, way[0] / length];
    left.push([point[0] + normal[0] * half, point[1] + normal[1] * half]);
    right.push([point[0] - normal[0] * half, point[1] - normal[1] * half]);
  });
  return fightUiPolygon([...left, ...right.reverse()]);
}

function fightUiPolygon(points) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], index) => (index ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  return shape;
}

/** An arrowhead (a triangle) with its tip at `tip`, pointing along unit `way`. */
function fightUiHead(tip, way, length, half) {
  const back = [tip[0] - way[0] * length, tip[1] - way[1] * length];
  const across = [-way[1] * half, way[0] * half];
  return fightUiPolygon([tip, [back[0] + across[0], back[1] + across[1]], [back[0] - across[0], back[1] - across[1]]]);
}

/** Points along a quadratic curve. */
const fightUiCurve = (from, control, to, count = 18) => Array.from({ length: count + 1 }, (_, index) => {
  const t = index / count;
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return [a * from[0] + b * control[0] + c * to[0], a * from[1] + b * control[1] + c * to[1]];
});

/**
 * The shapes, made once, in the plane facing the camera: the unit is the
 * ring's radius; each arrow travels along +x and ends at the ring's edge.
 */
function fightUiMarkGeometries() {
  const ticks = [0, 1, 2, 3].map((quarter) => {
    const angle = (quarter * Math.PI) / 2;
    const way = [Math.cos(angle), Math.sin(angle)];
    const across = [-way[1] * 0.045, way[0] * 0.045];
    const near = 1.14;
    const far = 1.42;
    return fightUiPolygon([[way[0] * near + across[0], way[1] * near + across[1]], [way[0] * far + across[0], way[1] * far + across[1]], [way[0] * far - across[0], way[1] * far - across[1]], [way[0] * near - across[0], way[1] * near - across[1]]]);
  });
  const dashes = Array.from({ length: 10 }, (_, index) => {
    const from = (index / 10) * Math.PI * 2;
    const arc = (Math.PI * 2) / 10 * 0.55;
    const outer = Array.from({ length: 7 }, (__, step) => from + (arc * step) / 6).map((angle) => [Math.cos(angle), Math.sin(angle)]);
    const inner = outer.slice().reverse().map(([x, y]) => [x * 0.88, y * 0.88]);
    return fightUiPolygon([...outer, ...inner]);
  });
  // A straight arrow: a shaft, then a head whose tip is at the ring's edge.
  // (Thin: a line drawn in the air, not a road sign; its head small.)
  const straight = [fightUiRibbon([[-3.6, 0], [-1.65, 0]], (t) => 0.1 + 0.1 * t), fightUiHead([-1.12, 0], [1, 0], 0.6, 0.36)];
  // A sweep: in from behind, bowed over, into the ring, widening as it comes.
  const sweepPoints = fightUiCurve([-3.9, -1.1], [-2.8, 1.2], [-1.55, 0.32]);
  const endWay = (() => {
    const [a, b] = sweepPoints.slice(-2);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
  })();
  const sweepTip = [sweepPoints.at(-1)[0] + endWay[0] * 0.52, sweepPoints.at(-1)[1] + endWay[1] * 0.52];
  const sweep = [fightUiRibbon(sweepPoints, (t) => 0.05 + 0.17 * t), fightUiHead(sweepTip, endWay, 0.6, 0.36)];
  // Chevrons: two, then a third, nearer the ring each.
  const chevron = (x, size) => fightUiPolygon([[x - 0.6 * size, 0.62 * size], [x, 0], [x - 0.6 * size, -0.62 * size], [x - 0.84 * size, -0.62 * size], [x - 0.24 * size, 0], [x - 0.84 * size, 0.62 * size]]);
  const chevrons = [chevron(-1.2, 1), chevron(-1.95, 0.85), chevron(-2.6, 0.7)];
  // The block's shield; the glance's spark arc.
  const shieldPoints = [[0, 1], [0.85, 0.7], [0.85, 0.05], ...fightUiCurve([0.85, 0.05], [0.8, -0.75], [0, -1.12], 8).slice(1), ...fightUiCurve([0, -1.12], [-0.8, -0.75], [-0.85, 0.05], 8).slice(1), [-0.85, 0.7]];
  const sparkArc = Array.from({ length: 13 }, (_, index) => 0.25 + (index / 12) * 1.7).map((angle) => [Math.cos(angle), Math.sin(angle)]);
  const spark = [fightUiRibbon(sparkArc, (t) => 0.06 + 0.16 * t), ...[[-0.25, 0.5], [0, 0.55], [0.3, 0.45]].map(([angle, length]) => {
    const at = 0.25 + angle;
    const way = [Math.cos(at), Math.sin(at)];
    return fightUiRibbon([[way[0] * 1.15, way[1] * 1.15], [way[0] * (1.15 + length), way[1] * (1.15 + length)]], () => 0.12);
  })];
  return {
    ring: new THREE.RingGeometry(0.9, 1, 48),
    ticks: new THREE.ShapeGeometry(ticks),
    dot: new THREE.CircleGeometry(0.09, 16),
    dashed: new THREE.ShapeGeometry(dashes),
    straight: new THREE.ShapeGeometry(straight),
    sweep: new THREE.ShapeGeometry(sweep),
    chevrons: new THREE.ShapeGeometry(chevrons),
    disc: new THREE.CircleGeometry(1, 32),
    thin: new THREE.RingGeometry(0.93, 1, 48),
    shield: new THREE.ShapeGeometry(fightUiPolygon(shieldPoints)),
    spark: new THREE.ShapeGeometry(spark),
  };
}

/** A mesh of the marks, with its dark shadow under it (the shadow first, so it is drawn first). */
function fightUiMarkMesh(parent, geometry, order) {
  const shadow = new THREE.Mesh(geometry, fightUiMarksMaterial('#000000', 0));
  shadow.renderOrder = 990 + order;
  shadow.position.set(FIGHT_UI_MARKS.shadowOffset, -FIGHT_UI_MARKS.shadowOffset, 0);
  const mesh = new THREE.Mesh(geometry, fightUiMarksMaterial('#ffffff', 0));
  mesh.renderOrder = 991 + order;
  const holder = new THREE.Group();
  holder.add(shadow, mesh);
  parent.add(holder);
  return { holder, mesh, shadow };
}

/** Show a mesh of the marks in a colour at an opacity (its shadow follows). */
function fightUiPaint(mark, hex, opacity) {
  const visible = opacity > 0.004;
  mark.holder.visible = visible;
  if (!visible) return;
  if (hex) mark.mesh.material.color.set(hex);
  mark.mesh.material.opacity = opacity;
  mark.shadow.material.opacity = opacity * FIGHT_UI_MARKS.shadowOpacity;
}

const fightUiEase = (t) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/**
 * The marks, in `view` (render.js's scene). aim(spec) at a press — spec:
 * { target (his man's id), zone, side (−1 left, 1 right, 0 middle of the
 * screen), group (the kind of blow), travel ([x, y] its way on the screen,
 * or null: straight in), from (the player's id) }; land(outcome, point) when
 * how it went is known (point: where, in the world, or null); update(world,
 * now) each frame before drawing; warm() at the start of a fight.
 */
export function createFightUiMarks(view) {
  const geometries = fightUiMarkGeometries();
  const root = new THREE.Group();
  root.name = 'fightui-marks';
  root.userData.seeThrough = false;
  root.frustumCulled = false;
  view.scene.add(root);

  // The aim: the ring on him and the arrow of the blow.
  const aimGroup = new THREE.Group();
  root.add(aimGroup);
  const ringGroup = new THREE.Group();
  aimGroup.add(ringGroup);
  const ring = fightUiMarkMesh(ringGroup, geometries.ring, 2);
  const ticks = fightUiMarkMesh(ringGroup, geometries.ticks, 2);
  const dot = fightUiMarkMesh(ringGroup, geometries.dot, 2);
  const dashed = fightUiMarkMesh(ringGroup, geometries.dashed, 2);
  const arrowTurn = new THREE.Group();
  aimGroup.add(arrowTurn);
  const arrowSlide = new THREE.Group();
  arrowTurn.add(arrowSlide);
  const arrows = { straight: fightUiMarkMesh(arrowSlide, geometries.straight, 1), sweep: fightUiMarkMesh(arrowSlide, geometries.sweep, 1), chevrons: fightUiMarkMesh(arrowSlide, geometries.chevrons, 1) };

  // Two bursts, used in turn (a blow and the next can overlap).
  const bursts = [0, 1].map(() => {
    const group = new THREE.Group();
    root.add(group);
    return {
      group, state: null,
      flash: fightUiMarkMesh(group, geometries.disc, 3),
      ring: fightUiMarkMesh(group, geometries.thin, 4),
      outer: fightUiMarkMesh(group, geometries.thin, 4),
      shield: fightUiMarkMesh(group, geometries.shield, 4),
      spark: fightUiMarkMesh(group, geometries.spark, 4),
    };
  });
  let nextBurst = 0;
  let aim = null;
  const every = [ring, ticks, dot, dashed, ...Object.values(arrows), ...bursts.flatMap((burst) => [burst.flash, burst.ring, burst.outer, burst.shield, burst.spark])];
  for (const mark of every) mark.holder.visible = false;

  const camera = view.camera;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const spot = new THREE.Vector3();
  const from = new THREE.Vector3();

  /** Where on him a part is (m, world), the side asked to the camera's left or right. */
  function partAt(fighter, zone, side, out) {
    const x = fighter.x;
    const at = (index) => [x[index * 3], x[index * 3 + 1], x[index * 3 + 2]];
    let point;
    if (zone === 'head') point = at(P.head);
    else if (zone === 'legs') {
      const [l, r] = [at(P.lKnee), at(P.rKnee)];
      point = [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2 - 0.04, (l[2] + r[2]) / 2];
    } else {
      const [neck, hips] = [at(P.neck), at(P.pelvis)];
      point = [neck[0] * 0.6 + hips[0] * 0.4, neck[1] * 0.6 + hips[1] * 0.4, neck[2] * 0.6 + hips[2] * 0.4];
    }
    out.set(point[0], point[1], point[2]).addScaledVector(right, side * (FIGHT_UI_MARKS.aside[zone] ?? 0.12));
    return out;
  }

  /** The marks grow with distance, to keep their size on the screen. */
  const grow = (at) => Math.max(1, at.distanceTo(camera.position) / FIGHT_UI_MARKS.growFrom);

  function aimAt(spec) {
    aim = { ...spec, start: null, landAt: null, outcome: null, way: spec.travel, colour: fightUiMarkColour(FIGHT_UI.colours[spec.group] ?? '#ffffff'), sweptBy: 0 };
    aim.arrow = spec.group === 'side' || spec.group === 'low' ? 'sweep' : spec.group === 'straight' ? 'straight' : 'chevrons';
  }

  function land(outcome, point) {
    if (!aim || aim.outcome) return;
    aim.outcome = outcome;
    if (outcome === 'miss') return;
    const burst = bursts[nextBurst];
    nextBurst = (nextBurst + 1) % bursts.length;
    burst.state = { outcome, colour: aim.colour, start: null, point: point ? new THREE.Vector3(point[0], point[1], point[2]) : aim.at?.clone() ?? null, turn: Math.random() * Math.PI * 2 };
  }

  function cancel() {
    if (aim && !aim.outcome) aim.giveUp = true;
  }

  function hideAll() {
    for (const mark of every) mark.holder.visible = false;
  }

  function update(world, now) {
    root.visible = Boolean(world);
    if (!world) return;
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    updateAim(world, now);
    for (const burst of bursts) updateBurst(burst, now);
  }

  function updateAim(world, now) {
    const marks = [ring, ticks, dot, dashed, ...Object.values(arrows)];
    const target = aim ? world.fighters[aim.target] : null;
    if (!aim || !target) {
      for (const mark of marks) mark.holder.visible = false;
      aim = null;
      return;
    }
    aim.start ??= now;
    if (aim.outcome) aim.landAt ??= now;
    const age = now - aim.start;
    if (!aim.outcome && (aim.giveUp || age > FIGHT_UI_MARKS.giveUp)) {
      aim.outcome = 'gone';
      aim.landAt = now;
    }
    const at = partAt(target, aim.zone, aim.side, spot);
    aim.at = at.clone();
    const radius = (FIGHT_UI_MARKS.radius[aim.zone] ?? 0.13) * grow(at);
    // Its way on the screen: its own, or (straight in) from the player toward the place.
    if (!aim.way) {
      const me = world.fighters[aim.from];
      if (me) {
        from.set(me.x[P.neck * 3], me.x[P.neck * 3 + 1] - 0.15, me.x[P.neck * 3 + 2]);
        const dx = at.clone().sub(from).dot(right);
        const dy = at.clone().sub(from).dot(up);
        aim.way = Math.hypot(dx, dy) > 0.05 ? [dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy)] : [0, 1];
      } else aim.way = [0, 1];
    }
    // Fading: once known (or given up), quickly; a miss sweeps on past.
    const since = aim.outcome ? now - aim.landAt : 0;
    const missed = aim.outcome === 'miss';
    const fade = aim.outcome ? 1 - since / (missed ? FIGHT_UI_MARKS.sweep : FIGHT_UI_MARKS.fadeOut) : Math.min(1, 0.3 + age / 0.05);
    if (fade <= 0) {
      for (const mark of marks) mark.holder.visible = false;
      aim = null;
      return;
    }
    aimGroup.position.copy(at);
    aimGroup.quaternion.copy(camera.quaternion);
    aimGroup.scale.setScalar(radius);
    const [wx, wy] = aim.way;
    // The ring closes in on the place at the press; a miss carries it on along the blow's way.
    const close = 1 + 0.6 * (1 - fightUiEase(age / FIGHT_UI_MARKS.closeIn));
    ringGroup.scale.setScalar(close * (missed ? 1 + 0.4 * since / FIGHT_UI_MARKS.sweep : 1));
    const swept = missed ? fightUiEase(since / FIGHT_UI_MARKS.sweep) * 2.4 : 0;
    ringGroup.position.set(wx * swept, wy * swept, 0);
    const shown = FIGHT_UI_MARKS.opacity.aim;
    fightUiPaint(ring, aim.colour, missed ? 0 : fade * shown);
    fightUiPaint(ticks, aim.colour, missed ? 0 : fade * shown * 0.85);
    fightUiPaint(dot, aim.colour, missed ? 0 : fade * shown * 0.8);
    fightUiPaint(dashed, fightUiMarkColour(FIGHT_UI.outcomeColours.miss), missed ? fade * shown : 0);
    // The arrow: flies in to the ring at the press; on the blow landing, on into it.
    const angle = Math.atan2(wy, wx);
    arrowTurn.rotation.z = angle;
    // A sweep bows over the top of its way, whichever way it goes.
    arrowTurn.scale.set(1, Math.cos(angle) < -1e-3 ? -1 : 1, 1);
    const flown = fightUiEase(age / FIGHT_UI_MARKS.flyIn);
    arrowSlide.position.x = -1.3 * (1 - flown) + (aim.outcome && aim.outcome !== 'gone' && !missed ? 0.9 * fightUiEase(since / FIGHT_UI_MARKS.fadeOut) : missed ? swept : 0);
    // Once it has shown the way, the arrow dims (it crosses the fight; the ring on him is what stays).
    const resting = 1 - (1 - FIGHT_UI_MARKS.arrowRest) * fightUiEase((age - FIGHT_UI_MARKS.flyIn - FIGHT_UI_MARKS.arrowHold) / 0.2);
    for (const [kind, mark] of Object.entries(arrows)) fightUiPaint(mark, aim.colour, kind === aim.arrow ? fade * (0.35 + 0.65 * flown) * resting * FIGHT_UI_MARKS.opacity.arrow : 0);
  }

  function updateBurst(burst, now) {
    const state = burst.state;
    const parts = [burst.flash, burst.ring, burst.outer, burst.shield, burst.spark];
    if (!state || !state.point) {
      for (const part of parts) part.holder.visible = false;
      burst.state = null;
      return;
    }
    state.start ??= now;
    const t = (now - state.start) / FIGHT_UI_MARKS.burst;
    if (t >= 1) {
      for (const part of parts) part.holder.visible = false;
      burst.state = null;
      return;
    }
    burst.group.position.copy(state.point);
    burst.group.quaternion.copy(camera.quaternion);
    const size = FIGHT_UI_MARKS.burstSize * grow(state.point);
    burst.group.scale.setScalar(size);
    const out = fightUiEase(t);
    const fade = (1 - t) * FIGHT_UI_MARKS.opacity.burst;
    const outcome = (name) => fightUiMarkColour(FIGHT_UI.outcomeColours[name]);
    const kind = state.outcome === 'parried' ? 'blocked' : state.outcome;
    for (const part of parts) part.holder.visible = false;
    if (kind === 'hit') {
      burst.flash.holder.scale.setScalar(0.8 + 0.9 * out);
      // (A faint flash: the blow is seen on the man himself, not under a disc of colour.)
      fightUiPaint(burst.flash, state.colour, Math.max(0, 0.22 * (1 - t * 2)));
      burst.ring.holder.scale.setScalar(0.7 + 1.8 * out);
      fightUiPaint(burst.ring, outcome('hit'), fade);
      burst.outer.holder.scale.setScalar(1 + 2.4 * fightUiEase(t * 0.85));
      fightUiPaint(burst.outer, state.colour, fade * 0.7);
    } else if (kind === 'blocked') {
      const pop = t < 0.2 ? 0.7 + 1.9 * t : 1.08 - 0.08 * ((t - 0.2) / 0.8);
      burst.shield.holder.scale.setScalar(pop);
      fightUiPaint(burst.shield, outcome('blocked'), fade * 0.85);
      burst.ring.holder.scale.setScalar(1.2 + 1.2 * out);
      fightUiPaint(burst.ring, outcome('blocked'), fade * 0.6);
    } else if (kind === 'glance') {
      burst.spark.holder.rotation.z = state.turn;
      burst.spark.holder.scale.setScalar(0.8 + 0.7 * out);
      fightUiPaint(burst.spark, outcome('glance'), fade);
    }
  }

  /** Compile the marks' one shader now (at the start of a fight), not at the first blow. */
  function warm() {
    const renderer = view.renderer;
    if (!renderer?.compile) return;
    for (const mark of every) {
      mark.holder.visible = true;
      mark.mesh.material.opacity = 0.01;
    }
    try {
      renderer.compile(view.scene, camera);
    } finally {
      hideAll();
    }
  }

  function reset() {
    aim = null;
    for (const burst of bursts) burst.state = null;
    hideAll();
  }

  return { aim: aimAt, land, cancel, update, warm, reset, get active() { return Boolean(aim) || bursts.some((burst) => burst.state); }, root };
}
