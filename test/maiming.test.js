// A limb lost (maiming.js): not death by itself. The stump bleeds from the vessel cut there (fast at the thigh, slow at
// the hand, sometimes clamped), the hand's weapon falls, a leg gone drops him to fight on from the ground or crawl off,
// and the shock of it goes to the fear model. The head off is still death.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { AI, fearTarget, thinkAll, surge } from '../src/ai.js';
import { advance, armGone, breakJoint, collapseAt, createWorld, cutOff, deathAt, inFight, legBroken, placeFighter, throwPunch, wound } from '../src/physics.js';
import { battleTally, wounded } from '../src/battletally.js';
import { bleedingFast, bleedingNow, bloodMl, MAIMING, maimFear, openArtery, playerStun, shockOf, stepVessels } from '../src/maiming.js';

/** Two men apart, nobody fighting yet: the first is the one maimed. */
function pair(style = 'katana', other = 'katana') {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS.contender, style: other }], { seed: 2 });
  placeFighter(world.fighters[0], -2, 0);
  placeFighter(world.fighters[1], 2, 0);
  advance(world, 0.3);
  return { world, man: world.fighters[0], foe: world.fighters[1] };
}

/** Seconds for a man of this weight to bleed to `share` of his blood from one vessel opened at `level`. */
function secondsTo(level, share, { clamped = false, ruin = false } = {}) {
  const man = { body: { bodyMassKg: 75 } };
  openArtery(man, level, () => (clamped ? 0 : 0.999), { ruin });
  let lost = 0;
  for (let t = 0; t < 1800; t += 0.5) {
    if (lost >= share) return t;
    lost += stepVessels(man, 0.5);
  }
  return Infinity;
}

test('a limb off is not death: he is still up; the head off is', () => {
  const { world, man, foe } = pair();
  cutOff(world, man, { joint: 'elbow', side: 'l' }, foe);
  assert.equal(man.state, 'up', 'the forearm off: still on his feet');
  assert.ok(inFight(man));
  assert.ok(man.vessels.length === 1 && bleedingNow(man) > 0);
  advance(world, 5);
  assert.notEqual(man.state, 'out', 'not dead on the spot');
  const other = pair();
  cutOff(other.world, other.man, { joint: 'neck', side: '' }, other.foe);
  assert.equal(other.man.state, 'out', 'beheaded');
  assert.equal(battleTally(other.world).red.killed, 1);
});

test('the bleeding is by the vessel: the thigh fastest, then the arm at the shoulder, the forearm; the hand slowest, often never', () => {
  const collapse = collapseAt();
  const hip = secondsTo('hip', collapse);
  const knee = secondsTo('knee', collapse);
  const shoulder = secondsTo('shoulder', collapse);
  const elbow = secondsTo('elbow', collapse);
  const wrist = secondsTo('wrist', collapse);
  assert.ok(hip >= 12 && hip <= 45, `the femoral: collapse in ${hip} s`);
  assert.ok(hip < shoulder && shoulder < elbow && shoulder < knee + 30, `hip ${hip} < shoulder ${shoulder} < elbow ${elbow}`);
  assert.ok(elbow <= 120, `the forearm off: ${elbow} s`);
  assert.ok(wrist > elbow, `the hand: ${wrist} s`);
  // Clamped (the cut artery drawn back in spasm), it bleeds far less: the arm at the shoulder does not collapse him.
  assert.ok(secondsTo('shoulder', collapse, { clamped: true }) === Infinity);
  // Death comes later than collapse, and only from the great vessels.
  assert.ok(secondsTo('hip', deathAt()) > hip + 5);
  assert.equal(secondsTo('wrist', deathAt()), Infinity, 'a hand off, untreated, does not bleed a man of 75 kg to death by itself');
  // A lighter man has less blood to lose.
  assert.ok(bloodMl({ body: { bodyMassKg: 55 } }) < bloodMl({ body: { bodyMassKg: 80 } }));
});

test('the bleeding runs on: collapse (bledOut) at what puts any man down, death (died) past it', () => {
  const { world, man, foe } = pair();
  cutOff(world, man, { joint: 'hip', side: 'r' }, foe);
  man.vessels[0] = { ...man.vessels[0], rate: MAIMING.vessels.hip.flow / bloodMl(man), clot: MAIMING.vessels.hip.clot, clamped: false };
  advance(world, 15);
  assert.notEqual(man.state, 'out', 'not in seconds');
  assert.ok(bleedingFast(man), 'bleeding fast: the bar shows it');
  advance(world, 40);
  assert.equal(man.state, 'out', 'collapsed within the minute');
  assert.ok(world.events.some((event) => event.kind === 'bledOut' && event.fighter === man.id));
  advance(world, 60);
  assert.ok(world.events.some((event) => event.kind === 'died' && event.fighter === man.id), 'and died of it');
  assert.equal(battleTally(world).red.killed, 1);
});

test('the weapon hand off: the weapon falls and nothing is drawn into it; no blow with it', () => {
  const { world, man, foe } = pair('katana', 'katana');
  assert.ok(man.weapon?.held);
  cutOff(world, man, { joint: 'wrist', side: man.weapon.main }, foe);
  assert.ok(armGone(man, 'r'));
  assert.ok(!man.weapon?.held, 'the katana fell with the hand');
  assert.ok(!throwPunch(world, man, 'cross', 'head'), 'no blow of the hand he has lost');
  assert.ok(world.debris.some((debris) => debris.kind === 'weapon' && debris.owner === man.id));
});

test('the off hand off: a weapon of both hands held in the one he has, if it can be; the shield arm off, the shield falls', () => {
  const { world, man, foe } = pair('katana');
  assert.equal(man.weapon.twoHanded, true);
  cutOff(world, man, { joint: 'elbow', side: man.weapon.off }, foe);
  assert.ok(man.weapon?.held, 'kept');
  assert.equal(man.weapon.twoHanded, false, 'in one hand now');
  const shielded = pair('swordShield');
  assert.ok(shielded.man.shield);
  cutOff(shielded.world, shielded.man, { joint: 'shoulder', side: 'l' }, shielded.foe);
  assert.ok(!shielded.man.shield, 'the shield went with the arm');
  assert.ok(shielded.man.weapon?.held, 'the sword stays in the sword hand');
});

test('a leg off drops him; on his knees he fights on from the ground (in the fight, armed) unless he has broken', () => {
  const { world, man, foe } = pair();
  cutOff(world, man, { joint: 'knee', side: 'l' }, foe);
  assert.ok(legBroken(man));
  assert.equal(man.state, 'down');
  // Steady (no fear: as a relentless man is), he kneels and fights on.
  man.body.inputs.relentless = true;
  for (let t = 0; t < 8 && !man.crawling; t += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  assert.ok(man.crawling && man.groundFight && man.crawlChosen, 'on his knees, fighting');
  assert.ok(inFight(man));
  assert.ok(man.weapon?.held, 'his katana still in his hands');
  // Broken (the fear model), he drops it and crawls off: out of the fight.
  man.body.inputs.relentless = false;
  for (let t = 0; t < 4 && man.state !== 'up'; t += 0.25) advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  Object.assign(man, { panicked: true, fear: 1, adrenaline: 0 });
  advance(world, 0.25, (current, dt) => thinkAll(current, dt));
  assert.equal(man.groundFight, false);
  assert.equal(inFight(man), false);
});

test('the shock: fear at once, by how much of him is gone, less for the trained; a surge of adrenaline with it', () => {
  const { world, man, foe } = pair();
  const before = fearTarget(world, man, 0, foe);
  cutOff(world, man, { joint: 'shoulder', side: 'l' }, foe);
  assert.ok(maimFear(man, world.time) > 0);
  assert.ok(fearTarget(world, man, 0, foe) > before + 0.2, 'afraid as he was not');
  assert.ok(maimFear(man, world.time + 60) < maimFear(man, world.time) / 2, 'it fades');
  assert.ok(shockOf(man, 'hip') > shockOf(man, 'shoulder') && shockOf(man, 'shoulder') > shockOf(man, 'wrist'));
  const veteran = { body: { skill: 0.85 } };
  const levy = { body: { skill: 0.1 } };
  assert.ok(shockOf(veteran, 'shoulder') < shockOf(levy, 'shoulder'));
  const calm = man.adrenaline ?? 0;
  surge(man, world.events.find((event) => event.kind === 'severed'));
  assert.ok(man.adrenaline > calm + 0.25, 'the adrenaline surges');
});

test('a limb ruined by the edge and broken there bleeds as torn open; one broken by a blunt blow does not', () => {
  const cut = pair();
  wound(cut.man, 'cut', 30, 'lThigh', cut.foe);
  cut.man.cutParts = new Set(['lThigh']);
  breakJoint(cut.world, cut.man, 'lHip');
  assert.ok(cut.man.vessels?.length === 1 && !cut.man.vessels[0].clamped);
  const blunt = pair();
  breakJoint(blunt.world, blunt.man, 'lHip');
  assert.ok(!blunt.man.vessels, 'a closed break: no vessel opened');
  assert.ok(maimFear(blunt.man, blunt.world.time) > 0, 'but the shock all the same');
});

test('the man played keeps playing: on his feet, stunned a moment, the less with adrenaline in him', () => {
  const { world, man, foe } = pair();
  man.player = true;
  cutOff(world, man, { joint: 'elbow', side: 'l' }, foe);
  assert.equal(man.state, 'up');
  assert.ok(man.stun > 0 && man.stun < 2, `stunned ${man.stun} s`);
  assert.ok(playerStun({ body: { gear: { courage: 0.2 } }, adrenaline: 0.8 }, 1) < playerStun({ body: { gear: { courage: 0.2 } }, adrenaline: 0 }, 1));
});

test('the tally: a man with a limb off who lived is wounded; one who died of it later is among the killed', () => {
  const { world, man, foe } = pair();
  cutOff(world, man, { joint: 'wrist', side: 'l' }, foe);
  assert.ok(wounded(man));
  man.bloodLost = deathAt() - 1e-4;
  man.vessels = [{ level: 'wrist', rate: 0.01, clot: 90, clamped: false }];
  advance(world, 0.5);
  assert.ok(world.events.some((event) => event.kind === 'died'));
  assert.equal(battleTally(world).red.killed, 1);
});

test('a machine cut about bleeds nothing and fears nothing: it goes on with what is left', () => {
  const world = createWorld([PRESETS.humanoid, PRESETS.contender], { seed: 1 });
  const bot = world.fighters[0];
  cutOff(world, bot, { joint: 'elbow', side: 'l' }, world.fighters[1]);
  assert.notEqual(bot.state, 'out');
  assert.ok(!bot.vessels);
  assert.equal(maimFear(bot, world.time), 0);
  assert.equal(AI.panic.breakAt > 0, true);
});
