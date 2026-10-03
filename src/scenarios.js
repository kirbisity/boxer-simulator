// Scenarios: set fights in set places. Each is data for the same world, the
// same bodies, physics and AI as the sandbox — only the place, the people
// and what they wear differ.

import { FRAMES, normaliseInputs } from './body.js';
import { caloriesForWeight } from './physiology.js';
import { createWorld } from './physics.js';

/**
 * A scenario: where (an arena's floor half-sizes and the scene drawn round
 * it), and who, as ordinary fighter inputs plus what they wear. A body is
 * given by its weight: the calories that settle at it are worked out when
 * the bout is built, as the builder's slider would.
 */
export const SCENARIOS = {
  subway: {
    title: 'Last Train',
    place: 'New York subway platform, 1:40 a.m.',
    blurb: 'A shoulder barged on the stairs. No ring, no gloves, no referee — a strip of platform between the pillars and the yellow edge.',
    scene: 'subway',
    // The platform between the stair wall and the edge strip, along the train.
    arena: { halfX: 4.2, halfZ: 1.35 },
    camera: { yaw: -0.25, pitch: 0.14, distance: 5.4 },
    fighters: [
      {
        name: 'Kenji', style: 'street', sex: 'male', heightCm: 183, weightKg: 72, frame: 'medium', age: 27, exercise: 0.35,
        gloves: false, clothing: { top: 'tshirt', topColor: '#24324a', bottom: 'jeans', bottomColor: '#2b3550' }, accessories: ['headset'],
        look: { skinTone: 'light', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
      },
      {
        name: 'Dre', style: 'street', sex: 'male', heightCm: 180, weightKg: 75, frame: 'medium', age: 25, exercise: 0.4,
        gloves: false, clothing: { top: 'hoodie', topColor: '#7a2230', bottom: 'joggers', bottomColor: '#26262b' }, accessories: [],
        look: { skinTone: 'deep', hairStyle: 'dreads', hairColor: '#1a120c', facialHair: 'stubble', eyeColor: 'brown' },
      },
    ],
  },
};

/** Fighter inputs for a scenario: each body fed to its stated weight. */
export function scenarioFighters(scenario) {
  return scenario.fighters.map((entry, index) => {
    const { weightKg, ...rest } = entry;
    const inputs = normaliseInputs(rest);
    inputs.calories = Math.round(caloriesForWeight(inputs, weightKg, (FRAMES[inputs.frame] ?? FRAMES.medium).lean));
    return { inputs, corner: index === 0 ? 'red' : 'blue' };
  });
}

/** A world for a scenario: its fighters on its floor. */
export function scenarioWorld(key, seed = 1) {
  const scenario = SCENARIOS[key];
  return createWorld(scenarioFighters(scenario), { seed, arena: scenario.arena });
}
