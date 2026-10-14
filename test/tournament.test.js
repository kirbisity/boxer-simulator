import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { MOVEMENT, OUTFITS } from '../src/outfits.js';
import { MOVES, STYLES, moveRange } from '../src/moves.js';
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
    // The Gothic's beak thrust out beyond the crown; the others' upper lip over it.
    if (name === 'gothic') assert.ok(spec.lower.at(-1)[2] > spec.crown[0][2], `${name}: the lower lip projects beyond the upper`);
    else assert.ok(spec.crown[0][2] > spec.lower.at(-1)[2], `${name}: the upper lip projects`);
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
  // (A few centimetres at most: the lock is a correction each substep, and he runs in his charge.)
  assert.ok(most < 0.03, `the head moved ${(most * 100).toFixed(1)} cm against his chest`);
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

/** Maximilian's first blow with the lance at a man standing still (a boxer's style: no weapon of his own): the contact, or null. */
function lanceAt(move, seed) {
  const world = createWorld([{ ...PRESETS.maximilian }, { ...PRESETS.samurai, style: 'boxing' }], { seed });
  const [knight, man] = world.fighters;
  const reach = moveRange(MOVES[move], knight.body, knight.weapon.spec) + man.body.lengths.headRadius;
  let thrown = false;
  for (let step = 0; step < 240 && !world.events.some((event) => event.attacker === 0 && event.kind === 'landed'); step += 1) {
    man.move = 0;
    const distance = Math.hypot(man.x[P.pelvis * 3] - knight.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2] - knight.x[P.pelvis * 3 + 2]);
    // The couched charge is begun at once and run in; the thrust walked in to and thrown within its reach.
    knight.running = move === 'lanceCharge';
    knight.move = !thrown || (move === 'lanceCharge' && knight.punch) ? 1 : 0;
    if (!thrown && (move === 'lanceCharge' || distance <= reach - 0.3 + (seed % 6) * 0.1)) thrown = throwPunch(world, knight, move, 'body');
    advance(world, 1 / 60);
  }
  return world.events.find((event) => event.attacker === 0 && event.kind === 'landed') ?? null;
}

test('the couched charge: run in, the point meets the man first along the shaft, and goes in harder than a thrust', () => {
  const charges = [0, 1, 2].map((seed) => lanceAt('lanceCharge', 2000 + seed));
  const thrusts = [0, 1, 2, 3, 4, 5].map((seed) => lanceAt('lanceThrust', 2000 + seed)).filter(Boolean);
  for (const hit of charges) {
    assert.ok(hit, 'the charge meets him');
    assert.equal(hit.target, 'trunk');
    assert.ok(hit.along > 0.9, `point-first along the shaft (${hit.along.toFixed(2)})`);
    assert.ok(hit.at > WEAPONS.lance.pointFrom, 'on the point, not the shaft');
    assert.ok(hit.pierce > 60, `run through (${hit.pierce.toFixed(0)} J)`);
  }
  const mean = (hits) => hits.reduce((sum, hit) => sum + hit.pierce, 0) / hits.length;
  assert.ok(mean(charges) > mean(thrusts), `charge ${mean(charges).toFixed(0)} J against a thrust's ${mean(thrusts).toFixed(0)} J`);
});

test('the lance is used once: after the charge, hit or miss, it is let fall and the long sword drawn', () => {
  // (A bout with Sir Edric that the charge does not end.)
  const world = createWorld([{ ...PRESETS.maximilian }, { ...PRESETS.knight }], { seed: 1002 });
  const knight = world.fighters[0];
  let charges = 0;
  let wasCharging = false;
  for (let step = 0; step < 600; step += 1) {
    advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
    const charging = knight.punch?.type === 'lanceCharge';
    if (charging && !wasCharging) charges += 1;
    wasCharging = charging;
  }
  assert.equal(charges, 1);
  assert.equal(world.events.filter((event) => event.attacker === 0 && ['lanceThrust', 'lanceHigh', 'lanceJab'].includes(event.punch)).length, 0, 'no poking with the lance');
  assert.notEqual(world.fighters[1].state, 'out', 'the bout goes on after the charge');
  assert.equal(knight.weapon?.kind, 'longsword');
});

/** The couched charge at a man standing still, aimed `across` m to the side of his middle (a world place): the contact, or null. */
function chargeOffCentre(target, across) {
  const world = createWorld([{ ...PRESETS.maximilian }, { ...PRESETS[target], style: 'boxing' }], { seed: 2000 });
  const [knight, man] = world.fighters;
  let thrown = false;
  for (let step = 0; step < 240 && !world.events.some((event) => event.attacker === 0 && event.kind === 'landed'); step += 1) {
    man.move = 0;
    knight.running = true;
    knight.move = 1;
    if (!thrown) {
      const middle = point(man.x, P.pelvis).map((value, axis) => (value + point(man.x, P.neck)[axis]) / 2);
      thrown = throwPunch(world, knight, 'lanceCharge', 'body', { at: [middle[0], middle[1], middle[2] + across] });
    }
    advance(world, 1 / 60);
  }
  return world.events.find((event) => event.attacker === 0 && event.kind === 'landed') ?? null;
}

test('plate turns a point that meets it aslant: it skids off the curve of the breastplate, where it runs an unarmoured man through', () => {
  const square = chargeOffCentre('knight', 0);
  const aslant = chargeOffCentre('knight', 0.1);
  const bare = chargeOffCentre('heavy', 0.1);
  assert.ok(square && aslant && bare);
  assert.ok(square.pierce > 0 && !square.effects.includes('glanced off the plate'), 'square on, the point bites (what the plate lets through)');
  assert.equal(aslant.pierce, 0);
  assert.ok(aslant.effects.includes('glanced off the plate'));
  assert.ok(bare.pierce > 60, `the same line into a bare chest: ${bare.pierce.toFixed(0)} J`);
  // On foot the charge goes in with tens of joules to about a hundred, not hundreds (a man standing still).
  assert.ok(square.energy > 40 && square.energy < 160, `${square.energy.toFixed(0)} J`);
});

test('an alert man answers the couched lance off its line (a sidestep or a blade across it), not by stepping straight back, and it mostly misses him', () => {
  let answered = 0;
  let avoided = 0;
  const answers = new Set();
  for (let seed = 0; seed < 6; seed += 1) {
    const world = createWorld([{ ...PRESETS.maximilian }, { ...PRESETS.samurai }], { seed: 1000 + seed });
    const [knight, man] = world.fighters;
    let seen = false;
    for (let step = 0; step < 150 && knight.couched !== 'done'; step += 1) {
      advance(world, 1 / 60, (current, dt) => thinkAll(current, dt));
      if (knight.punch?.type === 'lanceCharge' && man.defence) {
        answers.add(man.defence.name);
        seen = true;
      }
    }
    if (seen) answered += 1;
    if (!world.events.some((event) => event.attacker === 0 && event.punch === 'lanceCharge' && event.target === 'trunk')) avoided += 1;
  }
  assert.ok(answered >= 5, `answered ${answered} of 6`);
  assert.ok(!answers.has('stepBack') && !answers.has('slip'), [...answers].join(', '));
  assert.ok(answers.has('sidestep'));
  assert.ok(avoided >= 3, `the point kept off his body ${avoided} times in 6`);
});
