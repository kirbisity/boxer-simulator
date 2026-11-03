// The Cumans (Kipchaks) of the 12th-13th-century steppe: a khan's retainer in mail with rows of steel plates laced over
// it, buckled down the front, lames on the upper arm, hinged vambraces, and the tall pointed helmet with its steel face
// mask; of the steppe faction; guarded as the bekhter of the same make is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../src/body.js';
import { ARMOR_KINDS } from '../src/loftbody.js';
import { STYLES } from '../src/moves.js';
import { factionOf, gearTraits, helmChoices, OUTFITS, outfitSets } from '../src/outfits.js';
import { HELM_NAMES } from '../src/outfitsets.js';
import { RATINGS } from '../src/ratings.js';
import { WARRIORS } from '../src/roster.js';

test('the Cuman is of the steppe, rides a steppe horse, and carries the sabre', () => {
  const kit = OUTFITS.cumanHeavy;
  assert.equal(kit.faction, 'steppe');
  assert.equal(factionOf(PRESETS.cuman), 'steppe');
  assert.equal(kit.horse, 'steppe');
  assert.equal(kit.sidearm, 'saber');
  assert.ok(kit.arrowproof);
  // The bow first, then the sabre at his belt (his kit's sidearm), not the kheshig's mace.
  assert.equal(STYLES.cumanBow.weapon, STYLES.kheshigBow.weapon);
  assert.notEqual(STYLES.cumanBow.fallback, 'mace');
  assert.equal(gearTraits(PRESETS.cuman).sidearm, 'saber');
});

test('his mail and plates guard as the bekhter of the same make does; the shins only in boot leather', () => {
  const kit = OUTFITS.cumanHeavy.protection;
  const bekhter = { ...OUTFITS.ottomanHeavy.protection, ...outfitSets('ottomanHeavy').find((set) => set.key === 'bekhter').patch.protection };
  for (const kind of ['blunt', 'cut', 'pierce']) assert.equal(kit[kind], bekhter[kind], kind);
  assert.ok(kit.regions.Shank.cut < 0.5);
  // ~15 kg on a 75 kg man.
  assert.ok(OUTFITS.cumanHeavy.extraMass >= 0.17 && OUTFITS.cumanHeavy.extraMass <= 0.23);
  assert.deepEqual(OUTFITS.cumanHeavy.gaps, { mail: 'all' });
});

test('the helmet is the tall Kipchak bowl with a steel face mask, closing the face', () => {
  for (const design of OUTFITS.cumanHeavy.designs) {
    assert.equal(design.head.kind, 'chichak');
    assert.equal(design.head.bowl, 'kipchak');
    assert.ok(design.head.mask);
    assert.ok(['kipchak', 'horde'].includes(design.head.maskDesign), design.label);
    assert.equal(design.armor.kind, 'cumanMail');
  }
  assert.equal(gearTraits(PRESETS.cuman).helmFace, 'closed');
  // Offered in the helmet slot under its own name.
  const helm = helmChoices().find((choice) => choice.key === 'chichak+mask');
  assert.ok(helm && helm.faction === 'steppe');
  assert.equal(HELM_NAMES['chichak+mask'], 'Kipchak helmet and face mask');
});

test('the mail shirt carries rows of plates in columns, mail between them, strapped shut down the front', () => {
  const kit = ARMOR_KINDS.cumanMail;
  const steel = kit.plates.filter((plate) => plate[5] === 'steel');
  const straps = kit.plates.filter((plate) => plate[5] === 'leather');
  assert.ok(steel.length >= 60, `${steel.length} plates`);
  // Nothing over the split front but the straps.
  assert.ok(steel.every(([, , angle, half]) => Math.abs(angle) - half > 0.05));
  assert.ok(straps.length >= 4 && straps.every(([, , angle]) => angle === 0));
  assert.equal(kit.trunk[0][3].mail, true);
  assert.ok(kit.upperArm.some((piece) => piece[3]?.lames));
  assert.equal(kit.forearm[3], 'steel');
});

test('Konchak is on the roster, rated', () => {
  const konchak = WARRIORS.find((warrior) => warrior.key === 'cuman');
  assert.equal(konchak.title, 'Konchak');
  assert.equal(konchak.faction, 'steppe');
  assert.ok(RATINGS.characters.cuman.score > 0);
  assert.ok(RATINGS.types['cumanBow|cumanHeavy'] > 0);
});
