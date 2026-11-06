// The gaps in rigid armour, only where they really are (weapons.js BLADES.gaps, physics/gaps.js): a blow finds one only in a
// zone measured on the man's own body (the armpit, the groin, the throat, the sights of a closed helm or an open helmet's face,
// the bend of the elbow and the knee; laced armour a little at its lacing), never at the middle of the breastplate, the back
// plate or the crown; under it what the kit has there (mail where history puts it, else the arming doublet, the bare face
// behind the sights); and in a fight a samurai's katana seldom finds the knight's, while a hammer still fells him.

import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { thinkAll } from '../src/ai.js';
import { directFighter, newOrders } from '../src/control.js';
import { leastProtected, startFinisher } from '../src/finisher.js';
import { advance, createWorld, placeFighter, point, protectionAt } from '../src/physics.js';
import { vec } from '../src/pose.js';
import { BLADES } from '../src/weapons.js';
import { gapChance, gapUnder, gapZoneAt, gapTrunkFrame } from '../src/physics/gaps.js';
import { strikeAt } from '../tools/weapon-strikes.js';
import { pairing } from '../tools/gaps.js';

/** A man of the knight's build in `kind`, standing a moment. */
function standing(kind, design = 0) {
  const world = createWorld([{ ...structuredClone(PRESETS.knight), style: 'boxing', outfit: { kind, design }, accessories: [] }, { ...PRESETS.contender }], { seed: 1 });
  advance(world, 0.5);
  return world.fighters[0];
}

/** The surface of his trunk `height` of the way up from hips to neck, `round` degrees from the front towards his left: the point and its normal. */
function onTrunk(man, height, round) {
  const frame = gapTrunkFrame(man);
  const angle = (round * Math.PI) / 180;
  const normal = vec.add(vec.scale(frame.forward, Math.cos(angle)), vec.scale(frame.left, Math.sin(angle)));
  const radius = man.body.segments.trunk.skinRadius * 0.78;
  return [vec.add(vec.add(frame.pelvis, vec.scale(frame.spine, height)), vec.scale(normal, radius)), normal];
}

/** The surface of his head facing `rise` up (the sine) and `round` degrees round from his front. */
function onHead(man, rise, round) {
  const frame = gapTrunkFrame(man);
  const up = vec.normalize(vec.sub(point(man.x, P.head), point(man.x, P.neck)));
  const forward = vec.normalize(vec.sub(frame.forward, vec.scale(up, vec.dot(frame.forward, up))));
  const side = vec.cross(up, forward);
  const angle = (round * Math.PI) / 180;
  const flat = Math.sqrt(1 - rise * rise);
  const normal = vec.add(vec.scale(up, rise), vec.scale(vec.add(vec.scale(forward, Math.cos(angle)), vec.scale(side, Math.sin(angle))), flat));
  return [vec.add(point(man.x, P.head), vec.scale(normal, man.body.lengths.headRadius)), normal];
}

const zoneOnTrunk = (man, height, round) => gapZoneAt(man, 'trunk', ...onTrunk(man, height, round));
const zoneOnHead = (man, rise, round) => gapZoneAt(man, 'head', ...onHead(man, rise, round));

test('the middle of the breastplate, the back plate and the crown never have a gap; the armpit, the groin, the throat and the sights do', () => {
  for (const kind of ['knight', 'samuraiTosei', 'mingElite', 'ottomanHeavy', 'samurai', 'conquistadorPlate']) {
    const man = standing(kind);
    for (const height of [0.2, 0.4, 0.6, 0.75]) {
      for (const round of [0, 20, 40, -40]) assert.equal(zoneOnTrunk(man, height, round), null, `${kind}: the breast at ${height}, ${round}°`);
    }
    for (const height of [0.1, 0.5, 0.8]) {
      for (const round of [150, 180, -160]) assert.equal(zoneOnTrunk(man, height, round), null, `${kind}: the back at ${height}, ${round}°`);
    }
    for (const round of [0, 90, 180]) assert.equal(zoneOnHead(man, 0.8, round), null, `${kind}: the crown`);
    assert.equal(zoneOnTrunk(man, 0.8, 90), 'armpit', `${kind}: under the arm`);
    assert.equal(zoneOnTrunk(man, 0.8, -95), 'armpit', `${kind}: under the other arm`);
    assert.equal(zoneOnTrunk(man, 0.82, 132), 'armpit', `${kind}: behind the arm, high`);
    assert.equal(zoneOnTrunk(man, 0.02, 10), 'groin', `${kind}: under the fauld`);
    assert.equal(zoneOnHead(man, -0.75, 10), 'neck', `${kind}: the throat`);
    assert.equal(zoneOnHead(man, -0.4, 170), 'neck', `${kind}: the nape`);
  }
  // The flank of the breastplate is plate; laced armour parts a little there (`lacing`), never at the breast.
  assert.equal(zoneOnTrunk(standing('knight'), 0.4, 90), null);
  assert.equal(zoneOnTrunk(standing('samurai'), 0.4, 90), 'lacing');
});

test('the sights of a closed helm, the face of an open one; a clear visor none; the helmet\'s cheek and brow are steel', () => {
  // A knight's visored bascinet, a masked tosei kabuto, a turban helmet's mail veil: the sights. A chichak with its nasal (the
  // sipahi's second set), an open kabuto: the face.
  assert.equal(standing('knight').body.gear.helmFace, 'closed');
  assert.equal(standing('samuraiTosei').body.gear.helmFace, 'closed');
  assert.equal(standing('ottomanHeavy').body.gear.helmFace, 'closed');
  assert.equal(standing('ottomanHeavy', 1).body.gear.helmFace, 'open');
  assert.equal(standing('oyoroi').body.gear.helmFace, 'open');
  assert.equal(standing('riot').body.gear.helmFace, 'sealed');
  assert.equal(zoneOnHead(standing('knight'), 0.15, 10), 'visor');
  assert.equal(zoneOnHead(standing('knight'), -0.3, 10), null, 'the bevor');
  assert.equal(zoneOnHead(standing('knight'), 0.15, 80), null, 'the side of the helm');
  assert.equal(zoneOnHead(standing('ottomanHeavy', 1), -0.3, 30), 'face');
  assert.equal(zoneOnHead(standing('riot'), 0.15, 0), null);
  assert.equal(zoneOnHead(standing('riot'), -0.75, 0), 'neck');
});

test('the bend of the knee and the inside of the elbow are gaps; the shin and the forearm\'s middle are plate', () => {
  const man = standing('knight');
  const at = (name) => point(man.x, P[name]);
  const knee = at('lKnee');
  const thigh = vec.normalize(vec.sub(knee, at('lHip')));
  const fold = vec.sub(at('lFoot'), knee);
  const back = vec.normalize(vec.sub(fold, vec.scale(thigh, vec.dot(fold, thigh))));
  const behind = vec.add(vec.lerp(at('lHip'), knee, 0.9), vec.scale(back, man.body.segments.lThigh.skinRadius));
  assert.equal(gapZoneAt(man, 'lThigh', behind, back), 'knee');
  assert.equal(gapZoneAt(man, 'lThigh', vec.add(vec.lerp(at('lHip'), knee, 0.9), vec.scale(back, -man.body.segments.lThigh.skinRadius)), vec.scale(back, -1)), null, 'the knee cop');
  const shin = vec.normalize(vec.sub(at('lFoot'), knee));
  const across = vec.normalize(vec.cross(shin, [0, 1, 0]));
  assert.equal(gapZoneAt(man, 'lShank', vec.add(vec.lerp(knee, at('lFoot'), 0.5), across), across), null, 'the greave');
  const elbow = at('rElbow');
  const upper = vec.normalize(vec.sub(elbow, at('rShoulder')));
  const lower = vec.sub(at('rHand'), elbow);
  const crease = vec.normalize(vec.sub(lower, vec.scale(upper, vec.dot(lower, upper))));
  assert.equal(gapZoneAt(man, 'rUpperArm', vec.add(vec.lerp(at('rShoulder'), elbow, 0.9), crease), crease), 'elbow');
  assert.equal(gapZoneAt(man, 'rUpperArm', vec.lerp(at('rShoulder'), elbow, 0.5), crease), null, 'the rerebrace');
});

test('a point finds a gap far more than an edge; no edge finds one in a full harness, nor goes through the sights; the lacing only a point', () => {
  const knight = standing('knight').body.gear;
  const lamellar = standing('samurai').body.gear;
  assert.equal(gapChance(knight, 'armpit', 'thrust'), BLADES.gaps.thrust);
  assert.equal(gapChance(knight, 'armpit', 'swing'), 0, 'cutProof');
  assert.equal(gapChance(knight, null, 'thrust'), 0, 'no zone, no gap');
  assert.equal(gapChance(lamellar, 'armpit', 'swing'), BLADES.gaps.swing);
  assert.equal(gapChance(lamellar, 'visor', 'swing'), 0, 'an edge does not go through a slit');
  assert.ok(gapChance(lamellar, 'lacing', 'thrust') > 0 && gapChance(lamellar, 'lacing', 'thrust') <= 0.15 * BLADES.gaps.thrust, 'the lacing: a small share');
  assert.equal(gapChance(lamellar, 'lacing', 'swing'), 0);
  assert.ok(BLADES.gaps.swing < BLADES.gaps.thrust / 2);
});

test('mail under the gaps where history puts it: a harness\'s voiders, standard and skirt, the tosei\'s kusari, the krug\'s rings; else the doublet; the bare face behind the sights', () => {
  const mail = BLADES.gaps.layers.mail;
  const under = (kind, zone, key = 'trunk') => {
    const gear = standing(kind).body.gear;
    return gapUnder(gear, zone, protectionAt(gear, key));
  };
  for (const zone of ['armpit', 'elbow', 'groin', 'neck']) {
    assert.deepEqual(under('knight', zone), { blunt: mail.blunt, cut: mail.cut, pierce: mail.pierce }, `knight: ${zone}`);
    assert.deepEqual(under('joan', zone), { blunt: mail.blunt, cut: mail.cut, pierce: mail.pierce }, `Joan: ${zone}`);
    assert.equal(under('samuraiTosei', zone).pierce, mail.pierce, `tosei: ${zone}`);
  }
  assert.equal(under('knight', 'knee').pierce, BLADES.gaps.under.pierce, 'the back of the knee: the arming hose');
  assert.equal(under('knight', 'visor', 'head').pierce, 0, 'behind the sights, the face');
  assert.equal(under('conquistadorPlate', 'armpit').cut, mail.cut, 'the mail sleeves');
  assert.equal(under('conquistadorPlate', 'groin').pierce, BLADES.gaps.under.pierce, 'his breeches');
  // Mail-and-plate and mail coats: a gap meets mail, never more than the coat itself.
  const krug = protectionAt(standing('ottomanHeavy').body.gear, 'trunk');
  assert.equal(under('ottomanHeavy', 'armpit').pierce, Math.min(mail.pierce, krug.pierce));
  // (The alp's mirror plates over the breast stop a point better than his rings: in a gap only the rings.)
  assert.equal(under('gaziAlp', 'groin').pierce, Math.min(mail.pierce, protectionAt(standing('gaziAlp').body.gear, 'trunk').pierce));
  assert.equal(under('ottomanHeavy', 'face', 'head').pierce, 0, 'the chichak leaves the face');
  // No documented voiders: the coat's padding.
  assert.equal(under('mingElite', 'armpit').pierce, BLADES.gaps.under.pierce);
  // The Stechzeug's helm is bolted to the breast: no throat between them.
  const max = standing('tournament');
  assert.equal(zoneOnHead(max, -0.75, 10), null);
  assert.equal(zoneOnTrunk(max, 0.8, 90), 'armpit');
});

test('a skilled point put to the middle of a knight\'s breastplate never goes into a gap', () => {
  // (When a gap was anywhere, a third of these went in at one.)
  let breast = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const { hit } = strikeAt('katana', 'tsuki', 'body', 1.6, { outfit: 'knight', seed });
    if (hit?.target !== 'trunk') continue;
    breast += 1;
    assert.equal(hit.gapZone, undefined, `seed ${seed}: the breast is no gap`);
    assert.ok(!hit.effects.includes('into a gap in the armour'), `seed ${seed}: ${hit.effects}`);
  }
  assert.ok(breast >= 8, `the point met the breast ${breast} times`);
});

test('in a fight the katana seldom finds the knight\'s gaps and does not run him through the breastplate; a hammer still fells him', () => {
  const katana = pairing('tosei', 'plate', 3);
  assert.ok(katana.thrust.rigid >= 8, `thrusts landed on plate: ${katana.thrust.rigid}`);
  assert.ok(katana.thrust.gaps / katana.thrust.rigid < 0.15, `into a gap ${katana.thrust.gaps} of ${katana.thrust.rigid} (was ~0.35 when a gap was anywhere)`);
  const chest = katana.deaths.filter((end) => end.loser === 'b' && end.target === 'trunk' && end.oneShot);
  assert.equal(chest.length, 0, 'never one blow through the chest');
  const hammer = pairing('hammer', 'plate', 3);
  assert.ok(hammer.deaths.filter((end) => end.loser === 'b').length >= 2, 'the hammer: plate is not proof against a blow');
});

test('the finisher\'s dagger looks for a gap in a knight on the floor (the throat, the sights, the armpit, the groin) and goes in at it; put to the breast, never', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    for (const region of [null, 'breast']) {
      const world = createWorld([{ inputs: structuredClone(PRESETS.light), corner: 'red' }, { inputs: structuredClone(PRESETS.knight), corner: 'blue' }], { seed });
      world.armed = true;
      const orders = newOrders();
      const [me, him] = world.fighters;
      placeFighter(him, me.root[0] + 1, me.root[1] + 0.1 * (seed % 2));
      const step = (seconds) => advance(world, seconds, (w, dt) => {
        thinkAll(w, dt, new Set([0, 1]));
        directFighter(w, me, orders, dt);
      });
      step(0.3);
      Object.assign(him, { state: 'down', downTimer: 8, knockdowns: 1 });
      step(0.8);
      // (Of his kit alone, the sights of his helm (bare behind) or the throat (the mail standard); lying, the gap he can get at: planFinisher.)
      assert.ok(['face', 'throat'].includes(leastProtected(him).region), leastProtected(him).region);
      assert.ok(startFinisher(world, me, him, region ? { region } : {}));
      step(3);
      const struck = world.events.filter((event) => event.kind === 'landed' && event.attacker === me.id && event.defender === him.id);
      assert.ok(struck.length >= 1, `seed ${seed}: struck`);
      if (region) assert.ok(struck.every((event) => !event.effects.includes('into a gap in the armour')), `seed ${seed}: the breastplate has no gap`);
      else assert.ok(struck.some((event) => event.gapZone && event.effects.includes('into a gap in the armour')), `seed ${seed}: in at a gap`);
    }
  }
});
