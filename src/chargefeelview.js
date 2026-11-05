// The charge's feel (chargefeel.js) on the page: the lens widened, and the streaks at the screen's edges (one canvas over
// the stage, at half the screen's resolution: thin soft lines need no more, and it is drawn only while the charge is felt).

import { CHARGEFEEL } from './chargefeel.js';

export const CHARGEFEEL_VIEW = {
  // The streaks' colour: a pale warm white (dust and light going by), never a cartoon's speed lines.
  colour: '255, 248, 236',
  // Their width (px of the half-resolution canvas) at the inner end and the outer.
  width: { inner: 0.8, outer: 3 },
  // The canvas's resolution, a share of the screen's.
  scale: 0.5,
};

/** The streaks: each a fixed angle round the centre, its own length, and a place along its way (0..1), from `random`. */
export function chargeStreaks(count = CHARGEFEEL.lines.count, random = Math.random) {
  return Array.from({ length: count }, (_, index) => ({
    angle: ((index + random() * 0.8) / count) * Math.PI * 2,
    length: 0.55 + random() * 0.9,
    phase: random(),
    pace: 0.7 + random() * 0.6,
  }));
}

/**
 * The view of the feel in `view` (render.js's scene: its camera's lens), the streaks on `layer` (a canvas over the stage, or
 * null). apply(feel, dt, { camera }) each frame after the camera is placed (`camera`: whether the lens is the player's to
 * widen); reset().
 */
export function createChargeFeelView(view, { layer = null } = {}) {
  const streaks = chargeStreaks();
  // The lens as its owner left it, and what this last made of it (to know when someone else has set it).
  let base = view.camera.fov;
  let written = null;
  let drawn = false;

  function lens(widen) {
    const camera = view.camera;
    if (written === null || camera.fov !== written) base = camera.fov;
    const wanted = base + widen;
    if (camera.fov === wanted) return;
    camera.fov = wanted;
    written = widen > 0 ? wanted : null;
    camera.updateProjectionMatrix();
  }

  function lines(opacity, flow, dt) {
    if (!layer) return;
    const context = layer.getContext('2d');
    if (opacity < 0.004) {
      if (drawn) {
        context.clearRect(0, 0, layer.width, layer.height);
        layer.style.opacity = '0';
        drawn = false;
      }
      return;
    }
    const width = Math.max(1, Math.round(layer.clientWidth * CHARGEFEEL_VIEW.scale));
    const height = Math.max(1, Math.round(layer.clientHeight * CHARGEFEEL_VIEW.scale));
    if (layer.width !== width || layer.height !== height) {
      layer.width = width;
      layer.height = height;
    }
    context.clearRect(0, 0, width, height);
    layer.style.opacity = '1';
    drawn = true;
    const { inner, length } = CHARGEFEEL.lines;
    const cx = width / 2;
    const cy = height / 2;
    // From the centre to a corner: the streaks' way, as a share of it (on an ellipse through the corners, the screen's shape).
    const rx = cx * Math.SQRT2;
    const ry = cy * Math.SQRT2;
    context.lineCap = 'round';
    for (const streak of streaks) {
      streak.phase = (streak.phase + flow * streak.pace * dt) % 1;
      const from = inner + (1 - inner) * streak.phase;
      const to = Math.min(1.05, from + length * streak.length * (0.6 + 0.4 * streak.phase));
      // In softly at its inner end, gone at the screen's edge.
      const fade = Math.min(1, streak.phase / 0.2) * (1 - streak.phase) ** 0.5;
      const cos = Math.cos(streak.angle);
      const sin = Math.sin(streak.angle);
      const x0 = cx + cos * rx * from;
      const y0 = cy + sin * ry * from;
      const x1 = cx + cos * rx * to;
      const y1 = cy + sin * ry * to;
      const gradient = context.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, `rgba(${CHARGEFEEL_VIEW.colour}, 0)`);
      gradient.addColorStop(1, `rgba(${CHARGEFEEL_VIEW.colour}, ${(opacity * fade).toFixed(3)})`);
      context.strokeStyle = gradient;
      context.lineWidth = CHARGEFEEL_VIEW.width.inner + (CHARGEFEEL_VIEW.width.outer - CHARGEFEEL_VIEW.width.inner) * streak.phase;
      context.beginPath();
      context.moveTo(x0, y0);
      context.lineTo(x1, y1);
      context.stroke();
    }
  }

  function apply(feel, dt, { camera = true } = {}) {
    lens(camera ? feel.widen() : 0);
    lines(feel.lines(), feel.flow(), dt);
  }

  function reset() {
    lens(0);
    lines(0, 0, 0);
  }

  return { apply, reset, spec: CHARGEFEEL };
}
