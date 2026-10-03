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
        name: 'Simon', style: 'street', sex: 'male', heightCm: 183, weightKg: 72, frame: 'medium', age: 27, exercise: 0.35,
        outfit: { kind: 'casual', design: 0, colors: { top: '#24324a', bottom: '#2b3550' } }, accessories: ['headset'],
        look: { skinTone: 'lightTan', hairStyle: 'midLong', hairColor: '#120d0a', facialHair: 'none', eyeColor: 'brown' },
      },
      {
        name: 'Dre', style: 'street', sex: 'male', heightCm: 180, weightKg: 75, frame: 'medium', age: 25, exercise: 0.4,
        outfit: { kind: 'casual', design: 1, colors: { top: '#7a2230', bottom: '#26262b' } }, accessories: [],
        look: { skinTone: 'deep', hairStyle: 'dreads', hairColor: '#1a120c', facialHair: 'stubble', eyeColor: 'brown' },
      },
    ],
    // Each side's friends, for a team fight: changes to that side's lead.
    crews: {
      red: [
        { name: 'Tomo', heightCm: 176, weightKg: 68, age: 24, outfit: { kind: 'casual', design: 1, colors: { top: '#1c1c20', bottom: '#2b3550' } }, accessories: [], look: { hairStyle: 'spiky', skinTone: 'lightTan' } },
        { name: 'Jae', heightCm: 185, weightKg: 84, age: 29, exercise: 0.5, outfit: { kind: 'casual', design: 0, colors: { top: '#e4e4e6', bottom: '#26262b' } }, accessories: [], look: { hairStyle: 'fade', skinTone: 'light' } },
      ],
      blue: [
        { name: 'Marco', heightCm: 174, weightKg: 79, age: 30, outfit: { kind: 'casual', design: 0, colors: { top: '#4a5233', bottom: '#2b3550' } }, look: { hairStyle: 'buzz', skinTone: 'tan', facialHair: 'beard' } },
        { name: 'Kofi', heightCm: 188, weightKg: 82, age: 23, exercise: 0.45, outfit: { kind: 'casual', design: 1, colors: { top: '#6b6e74', bottom: '#1c1c20' } }, look: { hairStyle: 'cornrows', skinTone: 'deep' } },
      ],
    },
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

/** A crew member: the side's lead, changed as the crew entry says, fed to its weight. */
export function crewFighter(lead, entry) {
  const { weightKg, ...changes } = entry;
  const inputs = normaliseInputs({ ...lead, ...changes, outfit: { ...lead.outfit, ...changes.outfit }, look: { ...lead.look, ...changes.look } });
  inputs.calories = Math.round(caloriesForWeight(inputs, weightKg, (FRAMES[inputs.frame] ?? FRAMES.medium).lean));
  return inputs;
}

/** A world for a scenario: its fighters on its floor. */
export function scenarioWorld(key, seed = 1) {
  const scenario = SCENARIOS[key];
  return createWorld(scenarioFighters(scenario), { seed, arena: scenario.arena });
}
