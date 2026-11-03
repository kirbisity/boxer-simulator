// The Eight Banners of the Later Jin (the Qing to be) and the Battle of Sarhu (1619): the banner coat is the Ming
// brigandine's make and guards as it does, the Bayara no better than the Ming elite; the heavy Manchu bow's arrow is
// slower and strikes harder than the steppe bow's; Sarhu's two sides are cast as they were.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBody } from '../src/body.js';
import { QING_HELMS, QING_HOOD, qingHoodSheets, qingHoodStuds, shellGrid, TASSELS, CHINA_FINISHES } from '../src/chinahelms.js';
import { ARMOR_KINDS } from '../src/loftbody.js';
import { STYLES } from '../src/moves.js';
import { factionOf, gearTraits, OUTFITS } from '../src/outfits.js';
import { ARMIES, battleOf, SCENARIOS, scenarioWorld } from '../src/scenarios.js';
import { ARROW, WEAPONS } from '../src/weapons.js';
import { seededRandom } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';

const energyOf = (bow) => ((bow.arrowSpeed ?? ARROW.speed) / ARROW.speed) ** 2 * (bow.arrowEnergy ?? 1);

test('the banner coat is the Ming brigandine\'s make: the same guard and weight, in the eight banners\' colours', () => {
  const banner = OUTFITS.bannerArmour;
  const brigandine = OUTFITS.mingBrigandine;
  assert.deepEqual(banner.protection, brigandine.protection);
  assert.equal(banner.extraMass, brigandine.extraMass);
  assert.deepEqual(banner.designs.map((design) => design.label), ['Plain Yellow', 'Bordered Yellow', 'Plain White', 'Bordered White', 'Plain Red', 'Bordered Red', 'Plain Blue', 'Bordered Blue']);
  // The bordered banners bound in red, the bordered red in white; the plain in their own colour.
  for (const design of banner.designs) {
    const bordered = design.label.startsWith('Bordered');
    assert.equal(Boolean(design.head.trim), bordered, design.label);
    if (bordered) assert.equal(design.armor.cloth2, design.label === 'Bordered Red' ? '#ece8dc' : '#b3161b', design.label);
    assert.equal(design.armor.kind, 'bannerCoat');
    assert.equal(design.head.kind, 'qingHelm');
  }
  // Drawn as the brigandine is: a studded coat bound down the front; the skirt split, the apron hanging over it.
  const coat = ARMOR_KINDS.bannerCoat;
  assert.ok(coat.trunk[3].studded && coat.trunk[3].placket);
  assert.ok(coat.skirt[3].studded && coat.skirt[3].apron && coat.skirt[3].legs);
});

test('the banner skirt is two leg panels split before and behind, the front panel hanging over the split; the Ming brigandine\'s as it was', () => {
  for (const kind of ['bannerCoat', 'bayaraCoat']) {
    const skirt = ARMOR_KINDS[kind].skirt[3];
    // Split only before (0) and behind (π): one panel over each leg, none at the sides.
    assert.deepEqual(skirt.gaps, [0, Math.PI], kind);
    const { split, from, front: [top, half] } = skirt.legs;
    assert.ok(split > 0.05 && split < 0.4, `${kind}: the splits narrow`);
    // The front panel covers the split before, from under the apron's foot, and is no wider than a strip.
    assert.ok(half > split && half < 0.5, `${kind}: the front panel over the split`);
    assert.ok(top <= skirt.apron[0] + 0.05 && from <= skirt.apron[0] + 0.05, `${kind}: from under the apron`);
  }
  // The bands run across the Bayara's leg panels.
  assert.ok(ARMOR_KINDS.bayaraCoat.skirt[3].bands > 0);
  // The Ming brigandine keeps its four splits, and no leg panels.
  const ming = ARMOR_KINDS.mingBrigandine.skirt[3];
  assert.equal(ming.gaps.length, 4);
  assert.equal(ming.legs, undefined);
});

test('the banners\' hood: side flaps, a back flap and a collar, all studded in rows as the coat is, open over the face', () => {
  const sheets = qingHoodSheets();
  assert.deepEqual(sheets.map((sheet) => sheet.kind).sort(), ['back', 'collar', 'flap', 'flap']);
  const studs = qingHoodStuds();
  // Studs on every sheet (each stud near one of them).
  for (const sheet of sheets) {
    const on = studs.filter(([x, y, z]) => {
      const phi = Math.atan2(z / sheet.ellipse[1], (x - sheet.centre) / sheet.ellipse[0]);
      const [from, to] = sheet.phi;
      const turned = ((phi - from) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const top = sheet.top(phi);
      return turned <= to - from && y <= top && y >= sheet.hem(phi);
    });
    assert.ok(on.length >= 6, `${sheet.kind}: ${on.length} studs`);
  }
  // As close as the coat's rivet heads: a few head radii's tenths apart, so a flap carries several columns.
  assert.ok(QING_HOOD.studs.pitch < 0.3 && studs.length > 120, `${studs.length} studs`);
  // The face open: no stud within the opening before the flaps.
  for (const [x, y, z] of studs) if (y > -1.0) assert.ok(Math.abs(Math.atan2(z, x)) > 0.25 * Math.PI, `a stud over the face at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`);
  // The flaps hang close and straight: narrow, at the hem no more than 0.15 head radii further out than at the top.
  assert.ok(QING_HOOD.flare[1] - QING_HOOD.ellipse[1] <= 0.15);
});

test('the Bayara is guarded as the Ming elite, no better; the banners braver than the Ming regulars, the men stronger', () => {
  const bayara = OUTFITS.bayara;
  const elite = OUTFITS.mingElite;
  for (const kind of ['blunt', 'cut', 'pierce']) assert.ok(bayara.protection[kind] <= elite.protection[kind], kind);
  assert.ok(bayara.skill <= elite.skill);
  assert.ok(bayara.horse, 'the guard rides');
  assert.ok(ARMOR_KINDS.bayaraCoat.mirrors.length === 1 && ARMOR_KINDS.bayaraCoat.skirt[3].bands, 'the mirror over the heart, steel bands on the skirt');
  assert.ok(OUTFITS.bannerArmour.courage > OUTFITS.mingBrigandine.courage && OUTFITS.bannerArmour.courage >= elite.courage);
  assert.ok(OUTFITS.bannerArmour.skill > OUTFITS.mingBrigandine.skill && OUTFITS.bannerArmour.skill < elite.skill);
  // At Sarhu the banner men are heavier and fitter than the Ming regulars, about as the Ming elite.
  const { red, blue } = SCENARIOS.sarhu.cast(seededRandom(2));
  const mean = (men, key) => men.reduce((sum, man) => sum + key(man), 0) / men.length;
  const banners = blue.filter((man) => man.outfit.kind === 'bannerArmour');
  const regulars = red.filter((man) => man.outfit.kind === 'mingBrigandine');
  const mass = (man) => buildBody(man).bodyMassKg;
  assert.ok(mean(banners, mass) > mean(regulars, mass) + 2, `${mean(banners, mass).toFixed(1)} v ${mean(regulars, mass).toFixed(1)} kg`);
  assert.ok(mean(banners, (man) => man.exercise) > mean(regulars, (man) => man.exercise));
});

test('the Manchu bow: a heavy draw, a slower arrow than the steppe bow\'s carrying more energy', () => {
  const manchu = WEAPONS.manchuBow;
  const steppe = WEAPONS.compositeBow;
  assert.ok(manchu.bow && manchu.drawN > steppe.drawN);
  assert.ok(manchu.arrowSpeed < steppe.arrowSpeed);
  assert.ok(energyOf(manchu) > energyOf(steppe) && energyOf(manchu) > energyOf(WEAPONS.longbow));
  assert.ok(Math.abs(energyOf(manchu) - 1.4) < 0.05, `${energyOf(manchu).toFixed(2)} of a war arrow's energy`);
  // Shot close: the banner archer walks in to ~35 m and holds his ground.
  assert.equal(STYLES.manchuBow.weapon, 'manchuBow');
  assert.ok(STYLES.manchuBow.ranged.reach <= 40 && STYLES.manchuBow.ranged.holdGround);
  assert.ok(STYLES.bayaraBow.ranged.volley > 0);
});

test('the banners\' helmet: a black bowl with a gilt tube and plume, the Bayara\'s steel and gilt, fitted and symmetric', () => {
  for (const [name, design] of Object.entries(QING_HELMS)) {
    assert.ok(CHINA_FINISHES[design.finish] && CHINA_FINISHES[design.finial.finish], name);
    assert.ok(TASSELS[design.plume], `${name}: ${design.plume}`);
    const { positions } = shellGrid(design);
    let widest = 0;
    for (let index = 0; index < positions.length; index += 3) widest = Math.max(widest, Math.abs(positions[index + 2]));
    assert.ok(widest > 0.9 && widest < 1.4, `${name}: ${widest.toFixed(2)} head radii across`);
    // The tiered finial round the point, the peak standing out over the brow, the brim round the rest only a lip.
    assert.ok(design.finial.tiers.length >= 3 && design.finial.tiers.some((tier) => tier[4] === 'cup'), name);
    assert.ok(design.peak.reach > 0.25 && design.brim.reach < 0.06, name);
  }
  assert.ok(QING_HELMS.bayaraBowl.glyphBand && QING_HELMS.bayaraBowl.swags, 'the Bayara\'s band of characters and its swags');
  assert.equal(QING_HELMS.bannerBowl.finish, 'blackLacquer');
});

test('the Eight Banners are a faction of their own, labelled Later Jin, with their characters in the roster', () => {
  for (const kind of ['bannerArmour', 'bayara']) assert.match(OUTFITS[kind].label, /^Eight Banners \(Later Jin\)/);
  const banners = WARRIORS.filter((warrior) => warrior.faction === 'manchu');
  assert.deepEqual(banners.map((warrior) => warrior.inputs.style).sort(), ['bayaraBow', 'guandao', 'manchuBow', 'spear']);
  assert.ok(banners.some((warrior) => warrior.flagship));
});

test('Sarhu: the Ming a few elite, many in brigandine, some garrison men and a few guns; the banners all in coats of plates, a few Bayara on horse', () => {
  for (let seed = 1; seed <= 3; seed += 1) {
    const { red, blue } = battleOf('sarhu').cast(seededRandom(seed));
    const count = (side, kind) => side.filter((man) => man.outfit.kind === kind).length;
    assert.ok(count(red, 'mingElite') > 0 && count(red, 'mingElite') < count(red, 'mingGarrison'));
    assert.ok(count(red, 'mingBrigandine') > count(red, 'mingGarrison'));
    assert.equal(count(red, 'mingElite') + count(red, 'mingBrigandine') + count(red, 'mingGarrison'), red.length);
    const guns = red.filter((man) => ['matchlock', 'threeEyed'].includes(man.style)).length;
    assert.ok(guns >= 3 && guns <= red.length / 3, `${guns} guns`);
    assert.ok(blue.every((man) => ['bannerArmour', 'bayara'].includes(man.outfit.kind)), 'every man of the banners armoured');
    assert.ok(blue.every((man) => factionOf(man) === 'manchu'));
    const riders = blue.filter((man) => man.mounted);
    assert.ok(riders.length >= 2 && riders.length <= 4 && riders.every((man) => man.outfit.kind === 'bayara'), `${riders.length} riders`);
    assert.ok(blue.some((man) => man.style === 'manchuBow') && blue.some((man) => man.style === 'guandao'));
    assert.ok(red.some((man) => man.name === 'Du Song') && blue.some((man) => man.name === 'Nurhaci'));
    // A small battle, as the others.
    assert.ok(red.length + blue.length <= 70);
  }
  assert.match(SCENARIOS.sarhu.blurb, /guns/);
  assert.ok(SCENARIOS.sarhu.weather.fog);
  assert.deepEqual(SCENARIOS.sarhu.armies, { red: ['ming'], blue: ['banners'] });
  for (const kind of ['bannerArmour', 'bayara']) assert.ok(Object.values(ARMIES.banners.ranks).some((rank) => rank.kinds.includes(kind)));
});

test('Sarhu builds a world: both sides on the field, the banners\' armour on them', () => {
  const world = scenarioWorld('sarhu', 1);
  const sides = { red: 0, blue: 0 };
  for (const fighter of world.fighters) sides[fighter.corner] += 1;
  assert.ok(sides.red >= 25 && sides.blue >= 25, JSON.stringify(sides));
  const banner = world.fighters.find((fighter) => fighter.body.inputs.outfit.kind === 'bannerArmour');
  assert.deepEqual(gearTraits(banner.body.inputs).protection.cut, OUTFITS.mingBrigandine.protection.cut);
});
