// The derived stats of each reference profile, settled from its own inputs,
// against the measured ranges. Usage: node tools/physiology.js

import { buildBody, FRAMES } from '../src/body.js';
import { deriveStats, inputsForProfile, REFERENCE_PROFILES } from '../src/physiology.js';

export function compareProfiles() {
  return REFERENCE_PROFILES.map((profile) => {
    const inputs = inputsForProfile(profile, 175, FRAMES[profile.frame].lean);
    const stats = deriveStats(buildBody({ ...inputs, name: profile.label }));
    return { profile, inputs, stats };
  });
}

const within = (value, [low, high]) => value >= low && value <= high;

if (process.argv[1]?.endsWith('physiology.js')) {
  const keys = ['rmr', 'arm', 'tScore', 'squat', 'bench', 'grip', 'sprint', 'impact'];
  for (const { profile, inputs, stats } of compareProfiles()) {
    console.log(`\n${profile.label}: exercise ${inputs.exercise.toFixed(2)}, ${inputs.calories} kcal/day → ${stats.weight.toFixed(1)} kg, ${(stats.bodyFat * 100).toFixed(1)}% fat (target ${profile.weight} kg, ${profile.bodyFat * 100}%)`);
    for (const key of keys) {
      const [low, high] = profile[key];
      const ok = within(stats[key], profile[key]) ? 'ok ' : 'OFF';
      console.log(`  ${ok} ${key.padEnd(7)} ${stats[key].toFixed(key === 'tScore' || key === 'sprint' ? 2 : 0).padStart(8)}   want ${low}–${high}`);
    }
  }
}
