import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { MOVES, STYLES } from '../src/moves.js';
import { advance, createWorld, placeFighter } from '../src/physics.js';
import { directFighter, newOrders } from '../src/control.js';
import { ARTS, artLabel, chooseArt } from '../src/weaponarts.js';
import { CASES, artSurvey } from '../tools/situational-arts.js';

// The situational weapon arts (weaponarts.js ARTS.choices, chooseArt): the art made is the one the moment asks for.

/** The player (`style`) and a man (`defenderStyle`, in `outfit`) `distance` m off at `side` rad round to the player's left. */
function scene(style, defenderStyle, distance, { outfit = null, side = 0, prepare = null } = {}) {
  const world = createWorld([{ ...PRESETS.contender, style }, { ...PRESETS.contender, style: defenderStyle, ...(outfit ? { outfit: { kind: outfit, design: 0 } } : {}) }], { seed: 1 });
  const [me, him] = world.fighters;
  placeFighter(me, 0, 0);
  placeFighter(him, distance * Math.cos(side), distance * Math.sin(side));
  advance(world, 0.5);
  me.yaw = 0;
  prepare?.(me, him);
  return { world, me, him };
}
const chosen = (style, defenderStyle, distance, options) => {
  const { world, me, him } = scene(style, defenderStyle, distance, options);
  return chooseArt(world, me, him).art;
};
const charging = (me, him) => {
  him.rush = { t: 0, duration: 1, hit: false };
};
const down = (me, him) => {
  him.crawling = true;
};

// [his style, the man's, distance (m), options, the art expected]
const SITUATIONS = [
  ['longsword', 'boxing', 1.4, {}, 'artPommel'],
  ['longsword', 'longsword', 1.4, { outfit: 'knight' }, 'artMordhau'],
  ['longsword', 'longsword', 1.0, { outfit: 'knight' }, 'artHalfSword'],
  ['katana', 'boxing', 1.5, {}, 'artIai'],
  ['katana', 'boxing', 1.05, {}, 'artKesagiri'],
  ['katana', 'boxing', 2.4, {}, 'artTsuki'],
  ['odachi', 'katana', 2.3, { outfit: 'samurai' }, 'artTsuki'],
  ['dao', 'boxing', 1.5, {}, 'artDrawCut'],
  ['saber', 'saber', 1.4, {}, 'artWristCut'],
  ['dao', 'boxing', 1.4, { side: 0.8 }, 'artBackhand'],
  ['spear', 'boxing', 1.4, {}, 'artButt'],
  ['spear', 'boxing', 2.6, {}, 'artSpear'],
  ['spear', 'boxing', 2.6, { prepare: charging }, 'artLegSweep'],
  ['naginata', 'boxing', 2.0, {}, 'artWheel'],
  ['naginata', 'boxing', 1.2, {}, 'artCleave'],
  ['guandao', 'boxing', 2.0, { prepare: down }, 'artCleave'],
  ['warhammer', 'boxing', 1.5, {}, 'artCrush'],
  ['warhammer', 'longsword', 1.5, { outfit: 'knight' }, 'artBeak'],
  ['warhammer', 'swordShield', 1.5, {}, 'artHook'],
  ['kanabo', 'swordShield', 1.5, {}, 'artHook'],
  ['kanabo', 'longsword', 1.5, { outfit: 'knight' }, 'artCrushClub'],
  ['mace', 'swordShield', 1.3, {}, 'artHook'],
  ['dagger', 'boxing', 0.55, {}, 'artGrapple'],
  ['dagger', 'boxing', 1.2, {}, 'artFleche'],
  ['judo', 'boxing', 0.55, {}, 'artHipThrow'],
  ['sumo', 'boxing', 0.55, {}, 'artHipThrow'],
  ['boxing', 'boxing', 0.8, {}, 'artLiverHook'],
  ['boxing', 'unskilled', 0.8, {}, 'artOverhand'],
  ['kickboxing', 'boxing', 0.6, {}, 'artTeep'],
  ['kickboxing', 'boxing', 1.0, {}, 'artSpinKick'],
  ['kickboxing', 'boxing', 1.4, {}, 'artRoundhouse'],
  ['swordShield', 'dao', 1.3, {}, 'artShieldBash'],
  ['swordShield', 'boxing', 1.3, {}, 'artDrawCut'],
  ['legionary', 'dao', 1.2, {}, 'artShieldBashThrust'],
];

test('situational arts: the art chosen is the one the situation asks for, by family', () => {
  for (const [style, defenderStyle, distance, options, expected] of SITUATIONS) {
    assert.equal(chosen(style, defenderStyle, distance, options), expected, `${style} at a ${defenderStyle} ${distance} m off${options.outfit ? ` in ${options.outfit}` : ''}`);
  }
});

test('situational arts: every art chosen is an art move, named on the button; no style attacks with one (the AI makes none)', () => {
  const named = new Set(Object.values(ARTS.choices).flat().map((choice) => choice.art).concat(['artShieldBash', 'artShieldBashThrust']));
  for (const name of named) {
    assert.equal(MOVES[name]?.art, true, name);
    assert.ok(ARTS.labels[name], `${name} labelled`);
    if (MOVES[name].then) assert.equal(MOVES[MOVES[name].then]?.art, true, `${name} then ${MOVES[name].then}`);
  }
  for (const [key, style] of Object.entries(STYLES)) for (const move of Object.keys(style.attacks ?? {})) assert.notEqual(MOVES[move]?.art, true, `${key} attacks with ${move}`);
});

test("situational arts: the button names the art he would make now, and changes as the situation does", () => {
  const { world, me, him } = scene('katana', 'boxing', 1.5);
  me.adrenaline = 0.9;
  assert.equal(artLabel(me, world), 'Iai');
  placeFighter(him, 1.05, 0);
  me.yaw = 0;
  assert.equal(artLabel(me, world), 'Kesagiri');
  placeFighter(him, 2.4, 0);
  assert.equal(artLabel(me, world), 'Tsuki');
  // (Without the world: his family's own.)
  assert.equal(artLabel(me), 'Iai');
});

test('situational arts: pressed, the chosen art is made (a strike, or a hold taken for a throw)', () => {
  for (const [style, distance, expected] of [['katana', 1.05, 'artKesagiri'], ['spear', 1.4, 'artButt'], ['kickboxing', 0.6, 'artTeep']]) {
    const { world, me } = scene(style, 'boxing', distance);
    const orders = newOrders();
    me.adrenaline = 0.9;
    orders.actions = ['art'];
    advance(world, 1 / 60, (current, dt) => directFighter(current, me, orders, dt));
    assert.equal(me.punch?.type, expected, style);
    assert.equal(world.events.findLast((event) => event.kind === 'art')?.punch, expected);
  }
  // The judoka seizes him and, once he has hold, throws him.
  const { world, me, him } = scene('judo', 'boxing', 0.55);
  const orders = newOrders();
  me.adrenaline = 0.9;
  orders.actions = ['art'];
  advance(world, 1 / 60, (current, dt) => directFighter(current, me, orders, dt));
  assert.ok(me.clinch?.art?.throw, 'a hold taken for the throw');
  orders.actions = [];
  for (let frame = 0; frame < 120 && him.state === 'up'; frame += 1) advance(world, 1 / 60, (current, dt) => directFighter(current, me, orders, dt));
  assert.ok(world.events.some((event) => event.kind === 'throw' && event.attacker === me.id), 'thrown');
});

// Each art made at the man it is for from a few distances (tools/situational-arts.js CASES): it meets him.
for (const { art, style, distances, compare, ...options } of CASES) {
  test(`situational art ${art} (${style}): it lands`, () => {
    const survey = artSurvey(style, art, distances, options, 2);
    const done = survey.met + (MOVES[art].throw ? survey.thrown : 0);
    assert.ok(done >= survey.tries * 0.5, `${art} met him ${survey.met} (thrown ${survey.thrown}) of ${survey.tries}`);
  });
}

const caseOf = (art, style) => CASES.find((entry) => entry.art === art && (!style || entry.style === style));
const survey = (art, style, seeds = 3, move = art) => {
  const { distances, compare, ...options } = caseOf(art, style);
  return artSurvey(style ?? caseOf(art).style, move, distances, move === art ? options : { ...options, zone: null }, seeds);
};

test('situational arts: each does what it is for', () => {
  // The mordhau on plate: more comes through the helm than the pommel's blow brings.
  const mordhau = survey('artMordhau', 'longsword');
  const pommel = survey('artMordhau', 'longsword', 3, 'artPommel');
  assert.ok(mordhau.blunt.best > pommel.blunt.best * 1.2, `mordhau ${mordhau.blunt.best.toFixed(1)} against the pommel's ${pommel.blunt.best.toFixed(1)} through plate`);
  // The half-sword's point finds the gaps in plate; the pommel never goes in.
  const half = survey('artHalfSword', 'longsword');
  assert.ok(half.gaps >= half.tries * 0.3, `half-sword into a gap ${half.gaps} of ${half.tries}`);
  // The tsuki finds the throat of an armoured man.
  const tsuki = survey('artTsuki', 'katana');
  assert.ok(tsuki.throat >= tsuki.tries * 0.3, `tsuki at the throat ${tsuki.throat} of ${tsuki.tries}`);
  // The wrist cut takes his sword hand: his weapon gone some of the time.
  const wrist = survey('artWristCut', 'dao');
  assert.ok(wrist.disarmed >= 2, `wrist cut disarmed ${wrist.disarmed} of ${wrist.tries}`);
  assert.ok((wrist.parts.rForearm ?? 0) >= wrist.tries * 0.25, `at his sword arm: ${JSON.stringify(wrist.parts)}`);
  // The leg sweep and the hammer's hook take his feet.
  const sweep = survey('artLegSweep', 'spear');
  assert.ok(sweep.fell >= sweep.tries * 0.3, `swept down ${sweep.fell} of ${sweep.tries}`);
  const hook = survey('artHook', 'warhammer');
  assert.ok(hook.fell >= 2, `hooked down ${hook.fell} of ${hook.tries}`);
  // The beak goes into plate where the crushing blow cannot.
  const beak = survey('artBeak', 'warhammer');
  assert.ok(beak.pierce.best > 20, `beak's point through plate ${beak.pierce.best.toFixed(0)}`);
  assert.equal(survey('artBeak', 'warhammer', 3, 'artCrush').pierce.best, 0);
  // The dagger's stab from the hold finds a gap in a harness; the throws throw.
  const grapple = survey('artGrapple', 'dagger');
  assert.ok(grapple.gaps >= 2, `grapple and stab into a gap ${grapple.gaps} of ${grapple.tries}`);
  const judo = survey('artHipThrow', 'judo');
  assert.ok(judo.thrown >= judo.tries * 0.5 && judo.fell >= judo.tries * 0.5, `judo thrown ${judo.thrown}, down ${judo.fell} of ${judo.tries}`);
  // The liver hook goes in under the guard to the body.
  const liver = survey('artLiverHook', 'boxing');
  assert.ok((liver.parts.trunk ?? 0) >= liver.tries * 0.4, `liver hook to the body: ${JSON.stringify(liver.parts)}`);
});

test("situational arts: the hook drags a shield aside; the shield's art lands the boss and then the blade", () => {
  const { distances, compare, ...options } = caseOf('artHook', 'maceShield');
  const hooked = artSurvey('maceShield', 'artHook', distances, options, 2);
  assert.ok((hooked.parts.shield ?? 0) >= 2, `on the shield: ${JSON.stringify(hooked.parts)}`);
  let both = 0;
  for (const distance of [0.9, 1.1, 1.3]) {
    const { world } = scene('swordShield', 'dao', distance);
    const [me] = world.fighters;
    me.adrenaline = 0.9;
    const orders = newOrders();
    orders.actions = ['art'];
    advance(world, 1 / 60, (current, dt) => directFighter(current, me, orders, dt));
    assert.equal(me.punch?.type, 'artShieldBash');
    orders.actions = [];
    advance(world, 2, (current, dt) => directFighter(current, me, orders, dt));
    const struck = new Set(world.events.filter((event) => event.attacker === me.id && (event.kind === 'landed' || event.kind === 'blocked')).map((event) => event.punch));
    if (struck.has('artShieldBash') && struck.has('artShieldCut')) both += 1;
  }
  assert.ok(both >= 1, `boss and blade both met him in ${both} of 3`);
});
