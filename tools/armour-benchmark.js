// How much of a typical blow of each kind every armour in the game guards against, read off what the physics multiplies a blow by
// (protectionAt: the share of a cut, a point, a blow or a ball it stops, by part of the body), with the gaps of rigid armour
// (physics/gaps.js) folded in: of the blows that find one, the armour's own figure is not what they meet but what is under it.
// For every outfit, and every set of it that differs in what guards the man (outfitsets.js). Not fought: a strike at a dummy lands
// on whatever of him the weapon meets first (an arm, a shoulder), not the part asked about.
// Per kind: `guarded` torso, head, arms, legs, the whole body (WORLD.heat.skinShare: the head 9%, trunk 36%, limbs 55% of the skin),
// and `gapped` the torso's with the gaps in it, for a man of an average skill (gap chance × (0.5 + skill) = 1).
// Usage: node tools/armour-benchmark.js [out.json]

import { writeFileSync } from 'node:fs';
import { buildBody, normaliseInputs, PRESETS } from '../src/body.js';
import { OUTFITS, outfitSets } from '../src/outfits.js';
import { protectionAt } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { gapsOf } from '../src/physics/gaps.js';
import { BLADES } from '../src/weapons.js';

// The kinds of blow, each with the figure of the armour that guards against it and a typical weapon of the kind.
export const KINDS = {
  cut: { label: 'Cut', typical: 'sword, sabre, glaive edge', figure: 'cut', gap: 'swing' },
  point: { label: 'Point', typical: 'spear, thrust, arrow', figure: 'pierce', gap: 'thrust' },
  blunt: { label: 'Blow', typical: 'mace, hammer, club', figure: 'blunt', gap: null },
};
const LIMBS = { arms: ['lUpperArm', 'lForearm'], legs: ['lThigh', 'lShank'] };
const average = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/** What is under a gap in this kit: mail where it says (`mail`), else the arming coat (`under`). */
function underGap(gaps, kind) {
  const layers = BLADES.gaps.layers;
  const layer = gaps.mail ? layers[gaps.mailMake ?? 'mail'] : gaps.under ?? BLADES.gaps.under;
  return layer[kind];
}

/** One armour's rows: guarded shares by body part, whole body and gapped torso, for each kind of blow. */
function measure(kind, design, label, family) {
  const inputs = normaliseInputs({ ...structuredClone(PRESETS.contender), outfit: { kind, design }, accessories: [] });
  const gear = buildBody(inputs).gear;
  if (!gear.protection) return null;
  const at = (key, figure) => protectionAt(gear, key)[figure] ?? 0;
  const gaps = gapsOf(gear);
  const rigid = at('trunk', 'cut') >= gaps.rigidFrom;
  const share = WORLD.heat.skinShare;
  const row = { key: `${kind}:${design}`, kind, label, family, bullet: gear.protection.bullet ?? null, rigid, gaps: rigid ? { thrust: gaps.thrust, swing: gaps.swing, lacing: gaps.lacing } : null, mass: gear.extraMass ?? 0, blows: {} };
  for (const [name, rule] of Object.entries(KINDS)) {
    const torso = at('trunk', rule.figure);
    const head = at('head', rule.figure);
    const arms = average(LIMBS.arms.map((key) => at(key, rule.figure)));
    const legs = average(LIMBS.legs.map((key) => at(key, rule.figure)));
    const body = share.head * head + share.trunk * torso + share.limb * (average([arms, legs]));
    // A blow that finds a gap meets what is under it; one that does not, the armour. (Lacing parts it a little everywhere else.)
    const chance = rigid && rule.gap ? Math.min(1, gaps[rule.gap] + (rule.gap === 'thrust' ? gaps.lacing : 0)) : 0;
    const gapped = chance > 0 ? chance * underGap(gaps, rule.figure) + (1 - chance) * torso : torso;
    row.blows[name] = { torso, head, arms, legs, body, gapped };
  }
  const ball = gear.protection.bullet ?? { head: 0, torso: 0, limb: 0 };
  row.blows.ball = { torso: ball.torso ?? 0, head: ball.head ?? 0, arms: ball.limb ?? 0, legs: ball.limb ?? 0, body: share.head * (ball.head ?? 0) + share.trunk * (ball.torso ?? 0) + share.limb * (ball.limb ?? 0), gapped: ball.torso ?? 0 };
  return row;
}

/** Every armour and set of it. */
export function armourRows() {
  const rows = [];
  for (const kind of Object.keys(OUTFITS)) {
    const sets = outfitSets(kind);
    const options = sets.length ? sets.map((set) => ({ design: set.designs?.[0] ?? 0, label: set.name })) : [{ design: 0, label: OUTFITS[kind].label ?? kind }];
    for (const option of options) {
      const row = measure(kind, option.design, option.label, OUTFITS[kind].faction ?? 'other');
      if (row) rows.push(row);
    }
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rows = armourRows();
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(rows, null, 1));
  console.log(`${rows.length} armours`);
}
