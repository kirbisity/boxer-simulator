import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { MOVEMENT, OUTFITS } from '../src/outfits.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';
import { STECHHELM_STYLES } from '../src/stechzeug.js';
import { advance, createWorld, placeFighter, point, poiseOf, throwPunch } from '../src/physics.js';

test('the helm in three shapes: each a design of the Stechzeug, waisted in profile, the sight a gap, the plates meeting the ring', () => {
  const styled = OUTFITS.tournament.designs.filter((design) => design.head.style);
  assert.deepEqual(styled.map((design) => design.head.style), ['augsburg', 'frog', 'gothic']);
  assert.ok(!OUTFITS.tournament.designs[0].head.style, 'the first drawing stays the default');
  for (const [name, spec] of Object.entries(STECHHELM_STYLES)) {
    const lower = spec.lower.map((section) => section[2]);
    const waist = Math.min(...lower);
    // The beak stands out at the sight, the bevor draws in at the throat, the chest plate flares out again.
    assert.ok(lower.at(-1) - waist > 1, `${name}: beak ${lower.at(-1)} over waist ${waist}`);
    assert.ok(spec.chest.at(-1)[2] - waist > 1, `${name}: chest plate flares`);
    assert.ok(lower.indexOf(waist) > 0, `${name}: the waist above the ring's foot`);
    assert.ok(spec.crown[0][0] > spec.lower.at(-1)[0], `${name}: the sight a gap between the lips`);
    assert.ok(spec.crown[0][2] > spec.lower.at(-1)[2], `${name}: the upper lip projects`);
    assert.deepEqual(spec.chest[0], spec.lower[0], `${name}: chest plate from the ring`);
    assert.deepEqual(spec.nape[0], spec.lower[0], `${name}: nape plate from the ring`);
  }
});

// Sir Edric's own body in his plate, or in the Stechzeug: only the kit differs.
const edricIn = (kind) => ({ ...structuredClone(PRESETS.knight), style: 'boxing', outfit: { kind, design: 0 }, accessories: [] });

/** One blow at the head of a man in this kit, the same blow every time: its head harm, or null if it missed. */
function headBlow(kind, attacker, move, seed, gap) {
  const world = createWorld([attacker, edricIn(kind)], { seed });
  const [striker, struck] = world.fighters;
  placeFighter(striker, -0.6 - gap, 0);
  placeFighter(struck, 0.6 + gap, 0);
  const still = () => { struck.cooldown = 99; struck.defence = null; striker.cooldown = 99; };
  advance(world, 0.5, still);
  throwPunch(world, striker, move, 'head');
  advance(world, 1.2, still);
  return world.events.find((event) => event.kind === 'landed' && event.target === 'head' && event.attacker === 0)?.harmDeltaV ?? null;
}

test('the Stechzeug\'s helm: a blow to the head does about half what it does to a knight in his bascinet', () => {
  const blows = [
    ['a cross', { ...PRESETS.heavy, style: 'boxing', outfit: { kind: 'casual', design: 0 } }, 'cross', -0.25],
    ['a war hammer', PRESETS.warhammer, 'hammerOverhead', 0.5],
    ['a long sword', { ...PRESETS.knight, style: 'longsword' }, 'oberhau', 0.3],
  ];
  for (const [label, attacker, move, gap] of blows) {
    let knight = 0;
    let tournament = 0;
    for (let seed = 1; seed <= 6; seed += 1) {
      const [k, t] = [headBlow('knight', attacker, move, seed, gap), headBlow('tournament', attacker, move, seed, gap)];
      if (k === null || t === null) continue;
      knight += k;
      tournament += t;
    }
    assert.ok(knight > 0, `${label} landed`);
    const ratio = tournament / knight;
    assert.ok(ratio > 0.38 && ratio < 0.62, `${label}: ${ratio.toFixed(2)} of the knight's head harm`);
  }
  // A point: half of what gets through (5% against 10%).
  const [plate, joust] = [OUTFITS.knight.protection, OUTFITS.tournament.protection];
  assert.ok(Math.abs((1 - joust.regions.head.pierce) / (1 - plate.pierce) - 0.5) < 1e-9);
});

test('the Stechzeug: cut-proof, better against a point than plate, proofed, slow, heavy, all poise', () => {
  const spec = OUTFITS.tournament;
  const knight = buildBody(PRESETS.knight);
  const max = buildBody(PRESETS.maximilian);
  assert.equal(spec.faction, 'knights');
  assert.equal(spec.family, undefined, 'never dealt at random');
  assert.ok(max.gear.cutProof && max.gear.deflects && max.gear.arrowproof && spec.plated);
  assert.equal(spec.protection.cut, 1);
  assert.ok(spec.protection.pierce > OUTFITS.knight.protection.pierce);
  assert.ok(spec.bulletRating > OUTFITS.knight.bulletRating);
  assert.ok(max.gear.gaps.thrust < 0.25, 'fewer gaps for a point than field plate');
  // Slower than plate on his feet and in his swing.
  for (const key of ['foot', 'accel', 'swing']) assert.ok(MOVEMENT[spec.movement][key] < MOVEMENT[OUTFITS.knight.movement][key], key);
  // ~1.7 times field plate's weight, and much more poise.
  assert.ok(max.gearKg > knight.gearKg * 1.4);
  const world = createWorld([PRESETS.maximilian, PRESETS.knight], { seed: 1 });
  const [mine, his] = world.fighters.map(poiseOf);
  assert.ok(mine > his * 1.35, `poise ${mine.toFixed(2)} against the knight's ${his.toFixed(2)}`);
});

test('the helm costs the man in it a quarter of his skill: a hero\'s 1 to 0.75, a kit\'s or his own likewise', () => {
  assert.equal(PRESETS.maximilian.hero, true);
  assert.equal(buildBody(PRESETS.maximilian).skill, 0.75);
  assert.ok(Math.abs(buildBody({ ...PRESETS.maximilian, skill: 0.8 }).skill - 0.6) < 1e-9);
  assert.equal(buildBody({ ...PRESETS.maximilian, outfit: { kind: 'knight', design: 0 } }).skill, 1, 'out of it, his own');
  assert.equal(buildBody(PRESETS.knight).skill, 0.5);
});

test('the head is locked to the trunk: through a bout its place against the chest does not change', () => {
  const world = createWorld([PRESETS.maximilian, PRESETS.knight], { seed: 2 });
  const [man, other] = world.fighters;
  // The head's place in the trunk's own frame (up the trunk, forward, to the left).
  const inTrunk = (fighter) => {
    const pelvis = point(fighter.x, P.pelvis);
    const neck = point(fighter.x, P.neck);
    const up = norm(sub(neck, pelvis));
    const across = sub(point(fighter.x, P.lShoulder), point(fighter.x, P.rShoulder));
    const left = norm(sub(across, up.map((value) => value * dot(across, up))));
    const forward = norm(cross(up, left));
    const head = sub(point(fighter.x, P.head), neck);
    return [dot(head, up), dot(head, forward), dot(head, left)];
  };
  advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  const rest = inTrunk(man);
  let most = 0;
  let others = 0;
  for (let second = 0; second < 40 && man.state !== 'out' && other.state !== 'out'; second += 0.25) {
    advance(world, 0.25, (current, dt) => thinkAll(current, dt));
    const now = inTrunk(man);
    most = Math.max(most, Math.hypot(...now.map((value, axis) => value - rest[axis])));
    others = Math.max(others, Math.abs(inTrunk(other)[2]));
  }
  assert.ok(most < 0.01, `the head moved ${(most * 100).toFixed(1)} cm against his chest`);
  assert.ok(others > 0.02, 'a free head does move about on its neck');
});

test('the war lance: long, heavy, a point; the lance style thrusts, holds the range, and falls back on the long sword', () => {
  const lance = WEAPONS.lance;
  const total = lance.length + lance.handle;
  assert.ok(total >= 3 && total <= 3.5, `${total} m`);
  assert.ok(lance.mass >= 5 && lance.mass <= 8, `${lance.mass} kg`);
  assert.ok(lance.mass > WEAPONS.longSpear.mass * 2);
  assert.ok(lance.harm.thrust.pierce > WEAPONS.longSpear.harm.thrust.pierce);
  assert.ok((lance.harm.thrust.cut ?? 0) < 0.05 && !lance.harm.swing.cut && lance.harm.swing.blunt > 0.5, 'next to no edge; swung, it clubs');
  assert.ok(lance.wrist.omega < WEAPONS.longSpear.wrist.omega, 'slower to turn than a spear');
  assert.ok(lance.vamplate > 0.1);
  const style = STYLES.lance;
  assert.equal(style.weapon, 'lance');
  assert.ok(Object.keys(style.attacks).every((name) => name.startsWith('lance')));
  assert.ok(style.keepPoint >= 1 && style.tempo > STYLES.spear.tempo);
  assert.equal(OUTFITS.tournament.sidearm, 'longsword');
  assert.equal(PRESETS.maximilian.style, 'lance');
});

const sub = (a, b) => a.map((value, axis) => value - b[axis]);
const dot = (a, b) => a.reduce((sum, value, axis) => sum + value * b[axis], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => a.map((value) => value / Math.hypot(...a));
