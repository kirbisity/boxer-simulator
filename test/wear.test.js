import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { breakShield, breakWeapon, createWorld } from '../src/physics.js';
import { WORLD } from '../src/physics/config.js';
import { bluntEdge, driveShaft, dullEdge, hackShield, keenness, stopIn, strainBlade, strikeShaft } from '../src/physics/wear.js';
import { buildOf, createWeapon, MATERIALS, SHIELDS, WEAPONS } from '../src/weapons.js';

const build = (kind) => buildOf(WEAPONS[kind], WORLD.wear.shaftFrom);
// A weapon in the hands of one of `count` different men (each piece its own strength).
const pieces = (kind, count) => Array.from({ length: count }, (_, id) => ({ weapon: createWeapon(kind), fighter: { id } }));
const shieldOf = (kind) => ({ kind, spec: SHIELDS[kind], wear: undefined });

test('what each weapon is made of comes from its material data, not its name', () => {
  assert.deepEqual([build('armingSword').edge, build('armingSword').blade, build('armingSword').shaft], ['steel', 'steel', null]);
  assert.deepEqual([build('longSpear').edge, build('longSpear').blade, build('longSpear').shaft], ['steel', null, 'hardwood']);
  assert.equal(build('gladius').blade, 'iron', 'Roman-era iron');
  assert.equal(build('staff').shaft, 'hardwood', 'all pole');
  assert.equal(build('manchuLance').shaft, 'waxwood');
  assert.equal(build('flangedMace').shaft, null, 'an iron haft');
  assert.equal(build('macuahuitl').edge, null, 'obsidian chips on its own (physics.js chip)');
  for (const kind of ['bow', 'matchlock', 'whip', 'armRifle']) assert.deepEqual([build(kind).edge, build(kind).blade, build(kind).shaft], [null, null, null], kind);
  for (const [kind, spec] of Object.entries(SHIELDS)) assert.ok(MATERIALS[spec.material], `${kind}: ${spec.material}`);
});

test('a dull edge is a wider one: it cuts less of the blow and lands the rest as the flat', () => {
  const [{ weapon, fighter }] = pieces('armingSword', 1);
  assert.equal(keenness(weapon), 1);
  // A hard minute of parries edge to edge, ~2,000 J taken on steel: some three times as wide.
  dullEdge(weapon, fighter, 0, 2000, 1);
  assert.ok(Math.abs(weapon.wear.edge - 3) < 1e-9, `${weapon.wear.edge}`);
  const keen = keenness(weapon);
  assert.ok(keen > 0.5 && keen < 0.7, `${keen}`);
  const mix = bluntEdge(weapon, { cut: 1, blunt: 0.4, pierce: 0.2 });
  assert.ok(Math.abs(mix.cut - keen) < 1e-9, 'the cut is what the wider edge parts');
  assert.ok(Math.abs(mix.blunt - (0.4 + (1 - keen) * WORLD.skill.flatBlunt)) < 1e-9, 'the rest lands as the flat');
  assert.equal(mix.pierce, 0.2, 'the point is untouched');
  // Flesh does not dull it; soft iron dulls sooner than steel; it never grows past a fully rolled edge.
  const [fresh] = pieces('armingSword', 1);
  dullEdge(fresh.weapon, fresh.fighter, 0, 500, 0);
  assert.equal(fresh.weapon.wear.edge, 1);
  const [roman] = pieces('gladius', 1);
  dullEdge(roman.weapon, roman.fighter, 0, 500, 1);
  const [steel] = pieces('armingSword', 1);
  dullEdge(steel.weapon, steel.fighter, 0, 500, 1);
  assert.ok(roman.weapon.wear.edge > steel.weapon.wear.edge);
  dullEdge(steel.weapon, steel.fighter, 0, 1e7, 1);
  assert.equal(steel.weapon.wear.edge, WORLD.wear.flat);
});

test('a good steel sword essentially never breaks in a duel; old iron bends now and then', () => {
  // A hard parry or a full cut onto plate puts ~50-150 J across the blade; a minute's fighting a few dozen of them.
  const swords = pieces('armingSword', 2000);
  const broken = swords.filter(({ weapon, fighter }) => {
    for (let blow = 0; blow < 30; blow += 1) if (strainBlade(weapon, fighter, 0, 150)) return true;
    return false;
  });
  assert.ok(broken.length <= 1, `${broken.length} of 2000 steel swords broke`);
  const gladii = pieces('gladius', 2000);
  const bent = gladii.filter(({ weapon, fighter }) => strainBlade(weapon, fighter, 0, 250) === 'bent');
  assert.ok(bent.length > broken.length && bent.length < 200, `${bent.length} of 2000 iron blades bent at 250 J`);
  // A slender rapier blade is weaker than a broad sword's.
  const [rapier] = pieces('rapier', 1);
  const [sword] = pieces('armingSword', 1);
  strainBlade(rapier.weapon, rapier.fighter, 0, 1);
  strainBlade(sword.weapon, sword.fighter, 0, 1);
  assert.ok(rapier.weapon.wear.bladeStrength / sword.weapon.wear.bladeStrength < 0.5);
});

test('a spear shaft carries the set brace figure into flesh, far less stopped on plate, and snaps past it', () => {
  const spears = pieces('longSpear', 2001);
  const bears = spears.map(({ weapon, fighter }) => {
    driveShaft(weapon, fighter, 0, 1, WORLD.wear.stop.flesh);
    return weapon.wear.shaftStrength;
  }).sort((a, b) => a - b);
  const median = bears[1000];
  assert.ok(Math.abs(median / WORLD.mount.brace.shaft - 1) < 0.05, `median ${median} J against the brace's ${WORLD.mount.brace.shaft}`);
  const snapped = (joules, stop) => spears.filter(({ weapon, fighter }) => driveShaft(weapon, fighter, 0, joules, stop).snapped).length / spears.length;
  // A couched charge from the saddle, 500-2,000 J: sometimes; a thrust on foot into a man: next to never.
  assert.ok(snapped(1000, stopIn({ pierce: 0 })) > 0.3 && snapped(1000, stopIn({ pierce: 0 })) < 0.7);
  assert.ok(snapped(300, stopIn({ pierce: 0.4 })) < 0.005);
  // Square on plate it is stopped dead: a hard two-handed thrust snaps the odd weak shaft.
  const onPlate = snapped(160, stopIn({ pierce: 0.95, deflects: true }));
  assert.ok(onPlate > 0.005 && onPlate < 0.2, `${onPlate}`);
  // What snapped carried only what it bore.
  const { weapon, fighter } = spears[0];
  const drive = driveShaft(weapon, fighter, 0, 1e5, WORLD.wear.stop.flesh);
  assert.ok(drive.snapped && drive.carried === weapon.wear.shaftStrength);
  // A thicker shaft is stronger (bending modulus, radius cubed).
  const [lance] = pieces('kontos', 1);
  driveShaft(lance.weapon, lance.fighter, 0, 1, 0.25);
  assert.ok(lance.weapon.wear.shaftStrength > 2 * median);
});

test('a shaft driven along its length is a column: a short or langeted one stronger, a long one keeps its section', () => {
  const medianAlong = (kind) => {
    const all = pieces(kind, 401).map(({ weapon, fighter }) => {
      driveShaft(weapon, fighter, 0, 1, WORLD.wear.stop.flesh);
      return weapon.wear;
    });
    const at = (key) => all.map((wear) => wear[key]).sort((a, b) => a - b)[200];
    return { along: at('shaftStrength'), bend: at('shaftBend') };
  };
  const spear = medianAlong('longSpear');
  assert.ok(Math.abs(spear.along / spear.bend - 1) < 1e-9, 'the reference column: as its section');
  // The war hammer's 0.8 m of ash below its langets: Euler's (1.45 / 0.8)² ≈ 3.3 of the war spear's, across it the same.
  const hammer = medianAlong('warhammer');
  assert.ok(Math.abs(hammer.along / hammer.bend - (WORLD.wear.column / (WEAPONS.warhammer.strikeFrom - build('warhammer').langets)) ** 2) < 1e-9);
  assert.ok(Math.abs(hammer.bend / spear.bend - 1) < 0.1, 'the same ash section, bent across');
  // A hard hammer thrust square on plate (~400 J at a full step) next to never snaps it; a war spear's mostly would.
  const snappedOnPlate = (kind, joules) => pieces(kind, 500).filter(({ weapon, fighter }) => driveShaft(weapon, fighter, 0, joules, stopIn({ pierce: 0.95, deflects: true })).snapped).length / 500;
  assert.ok(snappedOnPlate('warhammer', 400) < 0.03, `${snappedOnPlate('warhammer', 400)}`);
  assert.ok(snappedOnPlate('longSpear', 400) > 0.8);
  // A pike's long slender shaft bows before it snaps: no weaker than its section.
  const pike = medianAlong('pike');
  assert.ok(Math.abs(pike.along / pike.bend - 1) < 1e-9);
});

test('a shaft snaps under a heavy blow across it and is hacked through by edges', () => {
  const [{ weapon, fighter }] = pieces('longSpear', 1);
  assert.equal(strikeShaft(weapon, fighter, 0, 50, 0), null, 'a parry with it');
  assert.equal(strikeShaft(weapon, fighter, 0, weapon.wear.shaftStrength * WORLD.wear.across, 0), 'snapped');
  const [other] = pieces('longSpear', 1);
  let cuts = 0;
  while (!strikeShaft(other.weapon, other.fighter, 0, 100, 100) && cuts < 100) cuts += 1;
  assert.ok(cuts >= 3 && cuts <= 15, `${cuts} full sword cuts to hack it through`);
  const [sword] = pieces('armingSword', 1);
  assert.equal(strikeShaft(sword.weapon, sword.fighter, 0, 1e5, 1e5), null, 'a sword has no shaft');
});

test('a wooden shield splits in ten to thirty heavy blows; a steel one does not', () => {
  // A heavy axe or two-hander blow on the board: ~200 J, edge-led.
  const axe = { cut: 1, blunt: 0.5, pierce: 0 };
  const blowsToSplit = (kind, joules, mix, id) => {
    const shield = shieldOf(kind);
    let blows = 0;
    while (blows < 500 && !hackShield(shield, { id }, 0, joules, mix)) blows += 1;
    return blows + 1;
  };
  for (const kind of ['germanic', 'heater', 'roundShield', 'oval', 'kalkan', 'turs']) {
    const counts = Array.from({ length: 101 }, (_, id) => blowsToSplit(kind, 200, axe, id)).sort((a, b) => a - b);
    assert.ok(counts[50] >= 10 && counts[50] <= 30, `${kind}: ${counts[50]} blows`);
  }
  assert.ok(blowsToSplit('rodela', 400, axe, 1) > 499, 'steel dents');
  // A blunt head cracks the board less for its joules than an edge splits it.
  assert.ok(blowsToSplit('germanic', 200, { blunt: 1, cut: 0, pierce: 0 }, 3) > blowsToSplit('germanic', 200, axe, 3));
});

test('broken in his hands: a weaponBroke event, the pieces on the floor, and it is gone from his hands', () => {
  const world = createWorld([{ ...PRESETS.yari }, { ...PRESETS.contender }], { seed: 3 });
  const [man] = world.fighters;
  const spear = man.weapon;
  assert.equal(spear.kind, 'yari');
  const before = world.debris.length;
  breakWeapon(world, man, spear, 'shaft', 'snapped');
  const event = world.events.find((e) => e.kind === 'weaponBroke');
  assert.ok(event && event.fighter === man.id && event.weapon === 'yari' && event.part === 'shaft' && event.reason === 'snapped');
  assert.ok(!spear.held && man.weapon !== spear, 'gone from his hands');
  const pieces = world.debris.slice(before);
  assert.equal(pieces.length, 2, 'the head end and the butt');
  assert.ok(pieces.every((piece) => piece.kind === 'splinter'), 'splinters, nothing to pick up whole');

  const shielded = createWorld([{ ...PRESETS.legionary }, { ...PRESETS.contender }], { seed: 3 });
  const [legionary] = shielded.fighters;
  assert.ok(legionary.shield);
  breakShield(shielded, legionary);
  assert.equal(legionary.shield, null);
  const split = shielded.events.find((e) => e.kind === 'shieldBroke');
  assert.ok(split && split.shield === 'scutum' && split.fighter === legionary.id);
  assert.ok(!shielded.debris.some((piece) => piece.kind === 'shield'), 'no whole shield to take up again');
});
