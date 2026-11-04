// The long, deep-curved sabre (the kilij) of the Cumans and the Sultan's men, the curved edge's draw (weapons.js
// sliceGain), the banners' heavy spear the Bayara carry (WEAPONS.manchuLance), and their horses' brigandine bard.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { BARDING, HORSES, bardingAt, mountOf } from '../src/horses.js';
import { buildHorseModel } from '../src/horsemesh.js';
import { STYLES } from '../src/moves.js';
import { OUTFITS, gearTraits } from '../src/outfits.js';
import { COVERINGS } from '../src/audio/sfx/impact.js';
import { battleOf } from '../src/scenarios.js';
import { advance, createWorld, seededRandom, shattersOn } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';
import { BLADES, WEAPONS, sliceGain } from '../src/weapons.js';
import { handling } from '../src/handling.js';
import { strikeAt } from '../tools/weapon-strikes.js';

const { kilij, saber, sayf, manchuLance, longSpear, lance } = WEAPONS;
const overall = (spec) => spec.length + spec.handle;

test('the kilij: longer than the sabre and twice as deeply curved, carried by the Cuman and every Sultanate kit; Saladin keeps his straight sayf', () => {
  assert.ok(kilij.length > saber.length, 'longer');
  assert.ok(kilij.curve >= 2 * saber.curve, 'more deeply curved');
  assert.ok(kilij.mass > saber.mass && kilij.balance > saber.balance, 'heavier, its weight further out (the yelman)');
  assert.equal(kilij.hands, 'one');
  for (const kind of ['cumanHeavy', 'azap', 'janissary', 'ottomanHeavy', 'gaziAlp']) assert.equal(OUTFITS[kind].sidearm, 'kilij', kind);
  assert.equal(gearTraits(PRESETS.cuman).sidearm, 'kilij');
  // Turgut Alp's own sabre and kalkan, with the kilij; the steppe's sabre and kalkan keep the Mongol sabre.
  assert.equal(STYLES[PRESETS.gaziAlp.style].weapon, 'kilij');
  assert.equal(STYLES[PRESETS.saber.style].weapon, 'saber', 'Mandukhai keeps the steppe sabre');
  // The Ayyubid sword of Saladin's day was straight: no curve, no draw.
  assert.equal(STYLES[PRESETS.saladin.style].weapon, 'sayf');
  assert.ok(!sayf.curve);
});

test('a curved edge draws: the more it slides as it goes in the more it cuts, the deeper the curve the more, and nothing through mail or plate', () => {
  const at = (spec) => 0.75 * spec.length;
  const across = 12;
  const gain = (spec, draw, cut = 0) => sliceGain(spec, [-draw, across, 0], [1, 0, 0], at(spec), { cut });
  // A straight blade: the cut's alignment is harmMix's, nothing added.
  assert.equal(gain(sayf, 6), 1);
  // A swing straight across: the curve alone leans the edge and it slides a little.
  assert.ok(gain(kilij, 0) > 1 && gain(kilij, 0) < 1.1);
  // More slide (the hilt drawn back, or the horse carrying it past): more cut.
  assert.ok(gain(kilij, 2) > gain(kilij, 0) && gain(kilij, 6) > gain(kilij, 2));
  // The deeper curve draws more than the sabre's at the same draw.
  assert.ok(gain(kilij, 6) > gain(saber, 6) && gain(saber, 6) > 1);
  // From the saddle: the horse's speed carried along the trailing blade (a gallop's 9 m/s) over a man's draw on foot (2 m/s).
  assert.ok(gain(kilij, 9) > gain(kilij, 2) * 1.15, `${gain(kilij, 9).toFixed(2)} at the gallop, ${gain(kilij, 2).toFixed(2)} on foot`);
  // Pushed out towards the point as it cuts, the curve leans against the push: it adds nothing (the straight blade's cut).
  assert.equal(gain(kilij, -6), 1);
  // Counted to `most`: the slide stops helping once it is twice the push.
  assert.ok(gain(kilij, 1000) < (1 + BLADES.slice.most ** 2) + 1e-9);
  // Mail and plate are not cut fibre by fibre: no gain at any slide.
  for (const cut of [BLADES.slice.hardFrom, 0.88, 1]) assert.equal(gain(kilij, 9, cut), 1, `cut ${cut}`);
  // Quilted cotton and cloth are.
  assert.ok(gain(kilij, 9, 0.6) > 1);
});

test('in a fight: the kilij\'s drawing cut slides its edge into a bare man, and none of it goes through mail', () => {
  const landed = (outfit) => {
    const hits = [];
    for (let seed = 1; seed <= 3; seed += 1) for (const zone of ['head', 'body']) for (const distance of [1.2, 1.5, 1.8]) {
      const { hit } = strikeAt('kilij', 'artDrawCut', zone, distance, { defenderStyle: 'passive', seed, outfit });
      if (hit?.kind === 'landed' && hit.cut > 0) hits.push(hit);
    }
    return hits;
  };
  const bare = landed(null);
  assert.ok(bare.length >= 3, `${bare.length} cuts`);
  assert.ok(bare.some((hit) => (hit.slice ?? 1) > 1), 'the drawn edge slid');
  for (const hit of landed('templar')) if (hit.target === 'trunk') assert.equal(hit.slice, undefined, 'mail: no slide counted');
});

test('the banners\' heavy spear: between the war spear and the lance in weight, length and toughness, a longer iron head and a keener point than the spear\'s', () => {
  assert.ok(manchuLance.mass > longSpear.mass && manchuLance.mass < lance.mass, 'weight');
  assert.ok(overall(manchuLance) > overall(longSpear) && overall(manchuLance) < overall(lance), 'length');
  // The iron: from where it strikes to the point, against the war spear's head.
  assert.ok(manchuLance.length - manchuLance.strikeFrom >= 1.4 * (longSpear.length - longSpear.strikeFrom), 'a longer head');
  assert.ok(Math.abs(manchuLance.length - manchuLance.strikeFrom - manchuLance.head) < 1e-9, "the head as drawn is the head that strikes");
  assert.ok(manchuLance.harm.thrust.pierce > longSpear.harm.thrust.pierce, 'a keener point');
  assert.ok(manchuLance.grip > longSpear.grip && manchuLance.grip < lance.grip);
  // Tougher than the lance: it breaks only on harder armour and a heavier blow; the foot spear never does.
  assert.ok(!longSpear.shatters);
  assert.ok(manchuLance.shatters.pierce > lance.shatters.pierce && manchuLance.shatters.joules > lance.shatters.joules);
  const held = (spec) => ({ spec });
  const plate = { pierce: 0.95 };
  const lamellar = { pierce: 0.78 };
  assert.ok(shattersOn(held(lance), 'thrust', plate, 300) && !shattersOn(held(manchuLance), 'thrust', plate, 300), 'a trot\'s blow on plate breaks the lance, not the heavy spear');
  assert.ok(shattersOn(held(manchuLance), 'thrust', plate, 1200), 'a gallop\'s on plate breaks it');
  assert.ok(shattersOn(held(lance), 'thrust', lamellar, 1200) && !shattersOn(held(manchuLance), 'thrust', lamellar, 1200), 'on heavy lamellar only the lance breaks');
});

test('the Bayara carry the heavy spear by default, on foot and from the saddle; the bow is still theirs to choose', () => {
  assert.equal(PRESETS.bayara.style, 'bayaraLance');
  assert.equal(STYLES.bayaraLance.weapon, 'manchuLance');
  assert.ok(STYLES.bayaraLance.couchedCharge?.saddleOnly, 'couched only from the saddle');
  assert.equal(STYLES.bayaraBow.weapon, 'manchuBow');
  assert.equal(PRESETS.bayaraBow.style, 'bayaraBow');
  assert.ok(handling(normalised(PRESETS.bayara), manchuLance).canHold);
  // Sarhu's three Bayara on horse ride with it.
  for (let seed = 1; seed <= 3; seed += 1) {
    const riders = battleOf('sarhu').cast(seededRandom(seed)).blue.filter((man) => man.outfit.kind === 'bayara');
    assert.ok(riders.length >= 2 && riders.every((man) => man.style === 'bayaraLance' && man.mounted));
  }
  // On foot he fights at the point and never runs in with it couched.
  const foot = createWorld([{ ...PRESETS.bayara }, { ...PRESETS.contender, style: 'boxing' }], { seed: 2 });
  const [bayara] = foot.fighters;
  assert.equal(bayara.weapon.kind, 'manchuLance');
  const thrown = new Set();
  for (let t = 0; t < 8; t += 1 / 60) {
    advance(foot, 1 / 60, thinkAll);
    if (bayara.punch) thrown.add(bayara.punch.type);
  }
  assert.ok(!thrown.has('lanceCharge') && [...thrown].some((type) => type.startsWith('spear')), [...thrown].join(', '));
  // From the saddle he couches it at a man on foot.
  const ridden = createWorld([{ ...PRESETS.bayara, mounted: true }, { ...PRESETS.contender, style: 'boxing' }], { seed: 2, arena: { halfX: 30, halfZ: 20 } });
  const [rider] = ridden.fighters;
  assert.ok(rider.mount && rider.weapon.kind === 'manchuLance');
  let couched = false;
  for (let t = 0; t < 30 && !couched; t += 1 / 60) {
    advance(ridden, 1 / 60, thinkAll);
    couched = rider.punch?.type === 'lanceCharge';
  }
  assert.ok(couched, 'a couched charge');
});

function normalised(inputs) {
  return createWorld([{ ...inputs }], { seed: 1 }).fighters[0].body;
}

test('the Bayara\'s horse is clad in brigandine in its rider\'s colours, studded in his gilt, head to rump', () => {
  for (let design = 0; design < OUTFITS.bayara.designs.length; design += 1) {
    const inputs = { ...PRESETS.bayara, outfit: { kind: 'bayara', design } };
    const mount = mountOf(inputs);
    const armor = OUTFITS.bayara.designs[design].armor;
    assert.equal(mount.barding, 'brigandine');
    assert.equal(mount.finish.cloth, armor.cloth, 'his coat\'s cloth');
    assert.equal(mount.finish.gold, armor.gold, 'its gilt studs');
  }
  const brig = BARDING.brigandine;
  // Every part but the legs; down below the belly as the lamellar skirt is.
  for (const part of ['head', 'neck', 'chest', 'body']) {
    assert.ok(brig.parts[part].cut >= 0.8 && brig.parts[part].cut < BARDING.lamellar.parts[part].cut, part);
    assert.ok(brig.parts[part].pierce < BARDING.lamellar.parts[part].pierce && !brig.parts[part].deflects, part);
  }
  assert.equal(brig.parts.legs.cut, 0);
  assert.equal(bardingAt('brigandine', 'body', 0.5 * 1.34, 1.34).cut, brig.parts.body.cut);
  assert.ok(brig.mass >= 20 && brig.mass < BARDING.lamellar.mass);
  assert.ok(COVERINGS[brig.covering], 'it sounds as small plates under cloth');
  // Drawn: the brigandine tile over the body, the neck and the face, under an iron brow plate; the mane hidden.
  const model = buildHorseModel({ breed: 'steppe', barding: 'brigandine', coat: HORSES.steppe.coats[0], seed: 3, detail: 'full', withers: HORSES.steppe.withers, corner: 'red' });
  for (const piece of ['face', 'crinet', 'peytral', 'skirt', 'crupper']) assert.ok(model.bard.pieces[piece] > 0, piece);
  assert.ok(model.parts.body.detail.brigandine && model.parts.neck.detail.brigandine && model.parts.head.detail.brigandine && model.parts.head.detail.munitionPlate);
  assert.ok(model.rig.maneHidden);
});
