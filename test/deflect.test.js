import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { advance, bodyHarm, createWorld, holdGuard, placeFighter, reachOf, throwPunch, undeflectable, WORLD } from '../src/physics.js';
import { deflectsWith, deflectWindow, guardHold } from '../src/physics/deflect.js';

/** Two men at a blow's reach: `attack` style strikes, `defend` style guards. */
function pair(attack, defend, defendExtra = {}) {
  const world = createWorld([
    { inputs: { ...structuredClone(PRESETS.contender), style: attack }, corner: 'red' },
    { inputs: { ...structuredClone(PRESETS.contender), style: defend, ...defendExtra }, corner: 'blue' },
  ], { seed: 1 });
  const [striker, man] = world.fighters;
  // (The man guarding is the man played: the deflect is the player's, the AI's window a share of it.)
  man.player = true;
  const distance = reachOf(striker) * 0.85;
  placeFighter(striker, -distance / 2, 0);
  placeFighter(man, distance / 2, 0);
  advance(world, 0.6);
  return { world, striker, man };
}

/** The striker's `move` at the man, whose guard goes up `lead` s before the blow's moment (`landAt` s after it is thrown); held `hold` s first if given. */
function meet(attack, move, defend, { lead, landAt = 0.26, hold = 0, down = null }) {
  const { world, striker, man } = pair(attack, defend);
  const guard = (current) => {
    man.guardHeld = true;
    holdGuard(current, man, striker.punch?.target === man.id ? striker : null);
  };
  for (let t = 0; t < hold; t += 1 / 120) advance(world, 1 / 120, guard);
  // (Let down for `down` s and put up again: the spam rule.)
  if (down !== null) for (let t = 0; t < down; t += 1 / 120) advance(world, 1 / 120, () => { man.guardHeld = false; });
  const harm = bodyHarm(man);
  const stamina = striker.stamina;
  const from = world.events.length;
  throwPunch(world, striker, move, 'body');
  for (let t = 0; t < landAt + 0.5; t += 1 / 120) advance(world, 1 / 120, (current) => (hold > 0 || t >= landAt - lead ? guard(current) : (man.guardHeld = false)));
  const events = world.events.slice(from);
  return { events, kinds: events.map((event) => event.kind), harm: bodyHarm(man) - harm, spent: stamina - striker.stamina, striker, man };
}

test('the deflect window: a katana\'s, shorter for a heavier weapon, longer for a lighter; none for a shield or the fists', () => {
  const window = (style, extra) => deflectWindow(pair('boxing', style, extra).man);
  assert.ok(Math.abs(window('katana') - WORLD.deflect.window) < 0.01, `katana ${window('katana').toFixed(3)} s`);
  assert.ok(window('warhammer') < window('katana') * 0.75, `war hammer ${window('warhammer').toFixed(3)} s`);
  assert.ok(window('guandao') < window('katana') * 0.75, `guandao ${window('guandao').toFixed(3)} s`);
  assert.ok(window('knife') > window('katana'), `knife ${window('knife').toFixed(3)} s`);
  assert.ok(!deflectsWith(pair('boxing', 'boxing').man), 'fists: a guard');
  assert.ok(!deflectsWith(pair('boxing', 'swordShield').man), 'a shield: a block');
});

test('a cut met in the window is deflected: no harm to him, the striker pays the meeting in stamina and reels a beat', () => {
  const met = meet('katana', 'kesagiri', 'katana', { lead: 0.15 });
  const deflect = met.events.find((event) => event.kind === 'deflect');
  assert.ok(deflect, `deflected (${met.kinds.join(', ')})`);
  assert.equal(met.harm, 0, 'no harm to him');
  assert.ok(met.spent > 0.004, `the striker paid ${met.spent.toFixed(3)} of his bar`);
  assert.ok(deflect.effects.some((effect) => /reels \((0\.[3-8])/.test(effect)), `a short reel, not a stagger: ${deflect.effects.join(', ')}`);
});

test('a guard held past its time is down: the blow lands', () => {
  const held = meet('katana', 'kesagiri', 'katana', { lead: 0, hold: WORLD.deflect.holdFor + 0.2 });
  assert.ok(!held.kinds.includes('deflect') && !held.kinds.includes('parry'), `held too long: ${held.kinds.join(', ')}`);
  assert.ok(held.harm > 0.05, `the blow lands (${held.harm.toFixed(3)})`);
  const { world, man } = pair('boxing', 'katana');
  man.guardUp = true;
  // (Half way from the end of his window to WORLD.deflect holdFor.)
  man.guardSince = world.time - (deflectWindow(man) + WORLD.deflect.holdFor) / 2;
  assert.ok(guardHold(man, world.time) > 0.3 && guardHold(man, world.time) < 0.7, `half way: ${guardHold(man, world.time).toFixed(2)}`);
});

test('a guard put up again at once has no window (no deflect by waving the blade up and down)', () => {
  const spam = meet('katana', 'kesagiri', 'katana', { lead: 0.15, hold: 0.2, down: 0.1 });
  assert.ok(!spam.kinds.includes('deflect'), `up again within ${WORLD.deflect.spam} s: ${spam.kinds.join(', ')}`);
});

test('the heavy strokes cannot be deflected and are marked: a war hammer and a great club at a katana, never a sword', () => {
  const marked = (attack, move) => {
    const { world, striker, man } = pair(attack, 'katana');
    throwPunch(world, striker, move, 'body');
    return undeflectable(striker, man);
  };
  assert.ok(marked('warhammer', 'hammerOverhead'), 'war hammer');
  assert.ok(marked('kanabo', 'hammerOverhead'), 'kanabo');
  assert.ok(!marked('katana', 'kesagiri'), 'katana');
  assert.ok(!marked('longsword', 'oberhau'), 'longsword');
  for (const lead of [0.1, 0.15]) assert.ok(!meet('kanabo', 'hammerOverhead', 'katana', { lead, landAt: 0.43 }).kinds.includes('deflect'), `kanabo never deflected (lead ${lead})`);
});

test('the AI\'s window is a share of the player\'s: a deflect is the player\'s reward', () => {
  const { man } = pair('boxing', 'katana');
  const played = deflectWindow(man);
  man.player = false;
  assert.ok(Math.abs(deflectWindow(man) - played * WORLD.deflect.aiShare) < 1e-9, `AI ${deflectWindow(man).toFixed(3)} s, played ${played.toFixed(3)} s`);
});

test('the man played deflects a blow at his front in his window before his blade has come all the way onto it', () => {
  // Raised so late the blade cannot travel to the line, yet in the window: the press is the parry.
  const met = meet('katana', 'kesagiri', 'katana', { lead: 0.06 });
  const deflect = met.events.find((event) => event.kind === 'deflect');
  assert.ok(deflect, `deflected (${met.kinds.join(', ')})`);
  assert.equal(met.harm, 0, 'no harm to him');
});
