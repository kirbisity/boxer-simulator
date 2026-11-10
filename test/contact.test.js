// How long a blow's contact lasts, and so its peak force (physics.js blowPeak, shellStretch): the weapon alone knocks, what
// is behind it pushes through the joints, and padding under a helmet or a rigid shell draws the knock out.
import test from 'node:test';
import assert from 'node:assert/strict';
import { blowPeak, shellStretch } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';

test('a two-handed spear thrust is a shove of about a kilonewton, as measured; a hammer swung all head is a knock', () => {
  // The thrust at the measured mean (Milks et al. 2016: 4.65 m/s, peak 362-1120 N): a ~2.3 kg shaft, ~9 kg of arms and body
  // behind it, into a man's trunk (~28 kg), on soft flesh (its knock drawn out, ~8 ms).
  const trunk = 28;
  const shove = (rigid, behind, speed, seconds) => blowPeak((behind * trunk) / (behind + trunk) * speed * 1.2, speed, seconds, rigid, behind, trunk);
  const thrust = shove(0.3, 11.3, 4.65, 0.008);
  assert.ok(thrust > 360 && thrust < 1800, `${thrust.toFixed(0)} N`);
  // All of it rigid, it would land as a knock several times as hard.
  assert.ok(shove(11.3, 11.3, 4.65, 0.008) > 4 * thrust);
  // A hammer: 1.5 kg of head on ~1 kg of arm, at 11 m/s: a knock of several kN.
  assert.ok(shove(1.5, 2.5, 11, 0.004) > 3000);
});

test('padding under a helmet or a rigid shell draws a knock out; flexible armour and a gap do not', () => {
  const gear = (padding) => ({ helmet: { padding } });
  assert.equal(shellStretch(gear(0), 'head', {}), 1);
  assert.ok(Math.abs(shellStretch(gear(0.65), 'head', {}) - (1 + WORLD.helmet.paddingStretch * 0.65)) < 1e-9);
  assert.equal(shellStretch(gear(0), 'trunk', { deflects: false }), 1, 'brigandine, mail: the weapon\'s own contact');
  assert.ok(shellStretch(gear(0), 'trunk', { deflects: true }) > 2, 'plate over the arming doublet');
});
