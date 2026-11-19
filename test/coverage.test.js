// What guards a place on a man is what is drawn over it (coverage.js; physics.js protectionAt): no armour figure on a place where
// no armour is drawn, the hand bare but for a gauntlet or the tekkō, a kit's named figures only where something of it is drawn
// (or marked `worn`: clothes, or armour drawn by a module of its own).

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody, normaliseInputs, PRESETS } from '../src/body.js';
import { OUTFITS } from '../src/outfits.js';
import { protectionAt } from '../src/physics.js';
import { ARMOUR_COVER, coverageKnown, coverageOf, piecesAt } from '../src/coverage.js';

const PARTS = { lUpperArm: 'upperArm', rUpperArm: 'upperArm', lForearm: 'forearm', rForearm: 'forearm', lThigh: 'thigh', lShank: 'shank', trunk: 'trunk' };
const ALONG = [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95];
// Armour drawn by a module of its own whose coverage is not yet told (they keep their figures everywhere): the riot gear, the
// robots, the ō-yoroi's and the sōhei's lamellar (oyoroi.js), the hoplomachus's arena kit (arenaview.js, its figures `worn`).
const UNTOLD = ['riot', 'heavyRiot', 'robot', 'lamellar', 'hoplomachus'];

function gearOf(kind, design) {
  return buildBody(normaliseInputs({ ...structuredClone(PRESETS.contender), outfit: { kind, design }, accessories: [] })).gear;
}

function eachArmouredDesign(visit) {
  for (const [kind, spec] of Object.entries(OUTFITS)) {
    spec.designs?.forEach((design, index) => {
      const gear = gearOf(kind, index);
      if (!gear.protection) return;
      const any = ['cut', 'pierce', 'blunt'].some((figure) => (gear.protection[figure] ?? 0) > 0.05) || Object.keys(gear.protection.regions ?? {}).length;
      if (any) visit(kind, index, design, gear);
    });
  }
}

test('every armoured kit says what covers it: drawn by the armour table, declared (`coverAlso`), or among the few drawn whole elsewhere', () => {
  eachArmouredDesign((kind, index, design, gear) => {
    const armour = gear.cover?.armor;
    if (!armour && !gear.cover?.also) return;
    assert.ok(coverageKnown(armour, gear.cover.also) || UNTOLD.includes(armour), `${kind} ${index}: ${armour}`);
  });
});

test('no armour figure where no armour is drawn: a place the kit does not name takes its figures only under a piece', () => {
  eachArmouredDesign((kind, index, design, gear) => {
    const cover = gear.cover?.armor || gear.cover?.also ? coverageOf(gear.cover.armor, gear.cover) : null;
    if (!cover || !coverageKnown(gear.cover.armor, gear.cover.also)) return;
    const regions = gear.protection.regions ?? {};
    for (const [key, part] of Object.entries(PARTS)) {
      const sideless = key.replace(/^[lr](?=[A-Z])/, '');
      if (regions[key] || regions[sideless]) continue;
      for (const t of ALONG) {
        if (part === 'forearm' && t >= ARMOUR_COVER.handFrom) continue;
        if (part === 'shank' && t >= ARMOUR_COVER.footFrom) continue;
        const guard = protectionAt(gear, key, t);
        const drawn = piecesAt(cover, part, t).length > 0;
        if (!drawn) assert.ok((guard.cut ?? 0) <= (gear.under?.guard.cut ?? 0) + 1e-9, `${kind} ${index} ${key} at ${t}: ${guard.cut} with nothing drawn`);
      }
    }
  });
});

test('a figure the kit names for a part stands only where something of it is drawn there, or where it is marked worn', () => {
  eachArmouredDesign((kind, index, design, gear) => {
    if (!gear.cover?.armor && !gear.cover?.also) return;
    if (!coverageKnown(gear.cover.armor, gear.cover.also)) return;
    const cover = coverageOf(gear.cover.armor, gear.cover);
    for (const [region, figures] of Object.entries(gear.protection.regions ?? {})) {
      const part = { UpperArm: 'upperArm', Forearm: 'forearm', Thigh: 'thigh', Shank: 'shank' }[region.replace(/^[lr](?=[A-Z])/, '')];
      if (!part || figures.worn) continue;
      for (const t of ALONG) {
        if ((part === 'forearm' && t >= ARMOUR_COVER.handFrom) || (part === 'shank' && t >= ARMOUR_COVER.footFrom)) continue;
        const key = /^[lr]/.test(region) ? region : `l${region}`;
        if (!piecesAt(coverageOf(gear.cover.armor, { ...gear.cover, side: key[0] }), part, t).length) {
          assert.equal(protectionAt(gear, key, t).cut, gear.under?.covers?.includes(region.replace(/^[lr]/, '')) ? gear.under.guard.cut : 0, `${kind} ${index} ${key} at ${t}`);
        }
      }
      void cover;
    }
  });
});

test('the hand: bare but for a gauntlet (the knights) or the tekkō (the samurai)', () => {
  eachArmouredDesign((kind, index, design, gear) => {
    const hand = protectionAt(gear, 'lForearm', 0.95);
    const spec = OUTFITS[kind];
    if (spec.fists === 'gauntlet' || spec.hands) return;
    if (gear.protection.regions?.lHand || gear.protection.regions?.Hand) return;
    assert.equal(hand.cut ?? 0, 0, `${kind} ${index}: a bare hand`);
  });
  assert.ok(protectionAt(gearOf('knight', 0), 'lForearm', 0.95).cut >= 0.95, 'the gauntlet');
  assert.ok(protectionAt(gearOf('samuraiTosei', 0), 'rForearm', 0.95).cut > 0.3, 'the tekkō');
});

test('as drawn: the conquistador\'s mail stops at the elbow, the Ming coat at the knee, the tōsei\'s haidate short of the knee; the knight all over', () => {
  const conquistador = gearOf('conquistadorPlate', 0);
  assert.ok(protectionAt(conquistador, 'lUpperArm', 0.5).cut >= 0.8, 'mail sleeve');
  assert.equal(protectionAt(conquistador, 'lForearm', 0.5).cut, 0, 'the forearm in the doublet');
  assert.equal(protectionAt(conquistador, 'trunk', 0.05).cut, 0.85, 'the mail skirt below the breastplate: mail');
  const ming = gearOf('mingBrigandine', 0);
  assert.ok(protectionAt(ming, 'lThigh', 0.5).cut > 0.8);
  assert.equal(protectionAt(ming, 'lShank', 0.5).cut, 0);
  const tosei = gearOf('samuraiTosei', 0);
  assert.equal(protectionAt(tosei, 'lThigh', 0.93).cut, 0, 'the knee between haidate and suneate');
  assert.ok(protectionAt(tosei, 'lShank', 0.5).cut > 0.5, 'the suneate');
  const knight = gearOf('knight', 0);
  for (const key of Object.keys(PARTS)) for (const t of ALONG) assert.ok(protectionAt(knight, key, t).cut >= 0.95, `${key} ${t}`);
  assert.ok(protectionAt(knight, 'lShank', 0.98).cut >= 0.95, 'the sabaton');
});

test('metal quality: a harder metal turns more of an edge and a point, never spreads a blow better; plain iron is the figures as set', async () => {
  const { ARMOUR_METALS } = await import('../src/outfits.js');
  assert.equal(ARMOUR_METALS.iron.proof, 1);
  const order = ['poorIron', 'iron', 'steel', 'hardenedSteel'];
  for (let i = 1; i < order.length; i += 1) assert.ok(ARMOUR_METALS[order[i]].proof > ARMOUR_METALS[order[i - 1]].proof && ARMOUR_METALS[order[i]].vph > ARMOUR_METALS[order[i - 1]].vph);
  const knight = gearOf('knight', 0);
  const legionary = gearOf('legionary', 0);
  assert.equal(knight.metal, 'hardenedSteel');
  assert.equal(legionary.metal, 'poorIron');
  assert.ok(protectionAt(knight, 'trunk', 0.5).pierce > OUTFITS.knight.protection.pierce, 'hardened plate over the iron figure');
  assert.ok(protectionAt(legionary, 'trunk', 0.5).pierce < OUTFITS.legionary.protection.pierce, 'slag-laden sheet under it');
  assert.equal(protectionAt(knight, 'trunk', 0.5).blunt, OUTFITS.knight.protection.blunt, 'a blow the same');
  // The nanban dō's European steel is its breastplate and helmet: the Japanese kote stay iron.
  const nanban = gearOf('samuraiTosei', 8);
  const tosei = gearOf('samuraiTosei', 0);
  assert.ok(protectionAt(nanban, 'trunk', 0.5).pierce > protectionAt(tosei, 'trunk', 0.5).pierce);
  assert.equal(protectionAt(nanban, 'lForearm', 0.5).pierce, protectionAt(tosei, 'lForearm', 0.5).pierce);
});

test('mail has no gaps: its rings run on over the joints; plate and a coat of plates have theirs', async () => {
  const { rigidAt } = await import('../src/physics/gaps.js');
  const at = (kind, key, t, design = 0) => { const gear = gearOf(kind, design); return rigidAt(protectionAt(gear, key, t), gear); };
  assert.equal(at('templar', 'trunk', 0.5), false, 'the hauberk');
  assert.equal(at('templar', 'lUpperArm', 0.9), false, 'the hauberk sleeve over the elbow');
  assert.equal(at('conquistadorPlate', 'trunk', 0.05), false, 'the mail skirt below the breastplate');
  assert.equal(at('conquistadorPlate', 'trunk', 0.6), true, 'the breastplate');
  assert.equal(at('knight', 'trunk', 0.5), true);
  assert.equal(at('mingBrigandine', 'trunk', 0.5), true, 'a coat of plates');
});
