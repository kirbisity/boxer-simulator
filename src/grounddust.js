// Dust off dry loose ground: what a body knocks into the air where it strikes or drags across sand or dry earth. One
// rule for every part of every body, read from the physics as it stands (nothing is scripted to a move): a part that
// comes down onto the ground throws up dust by how fast it arrives and how heavy it is, and a part dragged across
// the ground trails dust by how fast it slides. So a walk leaves little, a run a puff at every footfall, a skid a
// trail, and a man thrown down a cloud the length of him. The dust is the battle effects' own soft puffs
// (battlefx.js: lit by the place's sun and sky, carried on its wind), paler and shorter-lived than powder smoke.

import { P } from './body.js';
import { floorUnder } from './physics.js';
import { PLACE_SURFACE } from './audio/surface.js';
import { battleFxAddPuff } from './battlefx.js';

export const GROUND_DUST = {
  // How much dust each ground gives when dry (audio/surface.js PLACE_SURFACE's kinds): raked dry sand all of it, bare
  // trodden earth under half, everything else (grass, stone, boards, mud, snow) none. By eye.
  loose: { sand: 1, earth: 0.45 },
  // The bodies read each frame: the nearest to the camera (a far man's dust is a pixel).
  bodies: 14,
  // A part has come down when it is within `touch` m of the floor (its underside: a foot's point is the ankle, whose
  // underside rides 2 to 8 cm up through a step, so height alone does not tell a planted foot from a swung one) and
  // has slowed under `rest` m/s; it is under way again past twice that, or clear of the ground.
  touch: 0.09,
  rest: 0.35,
  // What it throws up goes by the fastest it moved on the way down: under `soft` m/s nothing (a foot set down in a
  // walk swings at about 2), all of it at `hard` (a sprint's foot swings at 7 or 8; a fall from standing lands the
  // hips at about 4, with the trunk's weight behind them: `parts`).
  soft: 1.8,
  hard: 7.5,
  // A part dragged along the ground (lower than `scrape` m)
  // faster than `slide` m/s trails dust, `trail` puffs a second for each m/s past it.
  scrape: 0.03,
  slide: 1.1,
  trail: 5,
  // The parts, each with its weight in the rule (a foot 1; the hips carry the trunk; a hand next to nothing).
  parts: [['lFoot', 1], ['rFoot', 1], ['lKnee', 1.1], ['rKnee', 1.1], ['pelvis', 2.6], ['lShoulder', 1.5], ['rShoulder', 1.5], ['head', 1], ['lHand', 0.5], ['rHand', 0.5], ['lElbow', 0.7], ['rElbow', 0.7]],
  // A strike's puffs: `count` for each unit of strength x weight (and one more), thrown outward along the ground at
  // up to `throw` m/s and upward at up to `up`, each swelling to `size` m (by strength) and gone in `life` s.
  count: 6,
  throw: 1.7,
  up: 0.55,
  size: [0.45, 1.3],
  life: [1.4, 4.2],
  // How thick a puff is at its thickest (the puff's own alpha), at the least and the most strength.
  thick: [0.2, 0.55],
  // Dust is not warm: it rises only by what threw it, and settles (m/s).
  rise: -0.04,
  // Dust is the ground itself in the air: lit, it is as bright as the sand under it, where powder smoke's soft ball
  // (battlefx.js: its wrapped light and painted density) comes out half as bright. `shade` is the puffs' `soot`, here
  // under 0: brighter than smoke by that share. By eye against the sunlit sand.
  shade: -1.0,
};

const groundDustOf = new WeakMap();

/**
 * Once a frame: `view` (render.js), the `world` as the physics has it, `dt` s of the fight gone by (0 while paused:
 * nothing is raised).
 */
export function updateGroundDust(view, world, dt) {
  if (!(dt > 0) || !world?.fighters) return;
  const tune = GROUND_DUST;
  let loose = tune.loose[PLACE_SURFACE[view.place]] ?? 0;
  // Wet ground gives none, nor ground under snow (the open air's weather, where the place is drawn in it).
  if (view.env?.on) loose *= (1 - Math.min(1, view.env.wet ?? 0)) ** 2 * (view.env.weather?.snow ? 0 : 1);
  if (loose <= 0.02) return;
  const eye = view.camera.position;
  let near = world.fighters.filter((fighter) => fighter?.x?.length >= 45 && !fighter.dormant && !fighter.fled);
  if (near.length > tune.bodies) {
    near = near
      .map((fighter) => ({ fighter, far: (fighter.x[24] - eye.x) ** 2 + (fighter.x[26] - eye.z) ** 2 }))
      .sort((a, b) => a.far - b.far)
      .slice(0, tune.bodies)
      .map((entry) => entry.fighter);
  }
  const arena = world.arena ?? null;
  for (const fighter of near) {
    let state = groundDustOf.get(fighter);
    if (!state) groundDustOf.set(fighter, (state = { moving: new Array(tune.parts.length).fill(false), peak: new Float32Array(tune.parts.length), owed: new Float32Array(tune.parts.length) }));
    const { x, v } = fighter;
    for (let index = 0; index < tune.parts.length; index += 1) {
      const [name, weight] = tune.parts[index];
      const at = P[name] * 3;
      const floor = floorUnder(arena, x[at + 2], x[at], x[at + 1]);
      const over = x[at + 1] - (fighter.radius?.[P[name]] ?? 0.05) - floor;
      const level = Math.hypot(v[at], v[at + 2]);
      const speed = Math.hypot(level, v[at + 1]);
      const low = over < tune.touch;
      if (!low || speed > tune.rest * 2) {
        state.moving[index] = true;
        state.peak[index] = Math.max(state.peak[index], speed);
      } else if (state.moving[index] && speed < tune.rest) {
        // Come down and stopped: by the fastest it went on the way.
        const strength = Math.min(1, Math.max(0, (state.peak[index] - tune.soft) / (tune.hard - tune.soft)));
        if (strength > 0) groundDustBurst(view, [x[at], floor, x[at + 2]], [v[at], v[at + 2]], strength, weight, loose);
        state.moving[index] = false;
        state.peak[index] = 0;
      }
      if (over < tune.scrape && level > tune.slide) {
        // Dragged or skidding: a trail, a puff each time enough is owed.
        state.owed[index] += tune.trail * (level - tune.slide) * weight * dt;
        while (state.owed[index] >= 1) {
          state.owed[index] -= 1;
          groundDustPuff(view, [x[at], floor, x[at + 2]], [v[at] * 0.3, v[at + 2] * 0.3], Math.min(1, (level - tune.slide) / 4) * 0.5, loose);
        }
      } else if (over >= tune.scrape) state.owed[index] = 0;
    }
  }
}

function groundDustBurst(view, at, way, strength, weight, loose) {
  const count = 1 + Math.round(GROUND_DUST.count * strength * weight);
  for (let k = 0; k < count; k += 1) {
    const turn = Math.random() * Math.PI * 2;
    const out = GROUND_DUST.throw * strength * (0.3 + 0.7 * Math.random());
    groundDustPuff(view, at, [Math.cos(turn) * out + way[0] * 0.25, Math.sin(turn) * out + way[1] * 0.25], strength * Math.min(1, 0.6 + 0.2 * weight), loose);
  }
}

function groundDustPuff(view, at, drift, strength, loose) {
  const tune = GROUND_DUST;
  const mix = (range, t) => range[0] + (range[1] - range[0]) * t;
  battleFxAddPuff(view, {
    at: [at[0] + (Math.random() - 0.5) * 0.12, at[1] + 0.04, at[2] + (Math.random() - 0.5) * 0.12],
    velocity: [drift[0], tune.up * (0.3 + 0.7 * strength) * (0.6 + 0.4 * Math.random()), drift[1]],
    size0: 0.05,
    size1: mix(tune.size, strength) * (0.75 + 0.5 * Math.random()),
    grow: 0.35 + 0.3 * Math.random(),
    alpha: mix(tune.thick, strength) * loose,
    life: mix(tune.life, strength) * (0.8 + 0.4 * Math.random()),
    rise: tune.rise,
    soot: tune.shade,
  });
}
