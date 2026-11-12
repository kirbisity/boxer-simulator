// Last Stand Squad (lastgate.js; was The Last Gate): the four levels (their heroes and kit, the men they bring when no squad
// is given), a squad given and placed, each level's ladder (its own faction's men from the starved rebel up, never a bow, a
// crossbow or a gun), the waves (a banner, the wave's few men, cleared, a breather, the next; counts growing slowly), the run's
// end (the hero falls), the kills credited (the hero's, the squad's), the Formation order (back to the places set), the
// androids, the lance kept, the horse archer's arrows that never run out, the pool that never grows however long the run,
// the boards of best runs (a best per level, kept in storage or not), the line to share, and the field's puddles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fearTarget, thinkAll } from '../src/ai.js';
import { buildBody, P } from '../src/body.js';
import { canCommand, giveOrder, ordersFor, standingOrder } from '../src/command.js';
import { STYLES } from '../src/moves.js';
import { factionOf } from '../src/outfits.js';
import { deriveStats } from '../src/physiology.js';
import { advance, createWorld, placeOnFloor, seededRandom } from '../src/physics.js';
import { ammoCarried } from '../src/physics/ranged.js';
import { createLastGate, createLastGateBoard, drainLastGate, intoLastGateZone, LAST_GATE, LAST_GATE_BOARD, LAST_GATE_FOES, LAST_GATE_MODE_KEYS, LAST_GATE_MODES, lastGateBoardKey, lastGateDefaultPlaces, lastGateFoe, lastGateRank, lastGateRebel, lastGateRebelKind, lastGateResult, lastGateRung, lastGateShareText, lastGateWaveSize, lastGateWaveValue, lastGateZone, stepLastGate } from '../src/lastgate.js';

const think = (world, dt) => {
  stepLastGate(world, dt);
  thinkAll(world, dt);
};
const hips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const foesUp = (world) => world.fighters.filter((fighter) => fighter.corner === 'blue' && !fighter.dormant && fighter.state !== 'out');

test('four levels, each its own hero, his kit and his men: the samurai in tōsei gusoku with the ōdachi, the knight on his destrier with the lance, the Mongol horse archer in iron lamellar, the SWAT officer with the AR-15', () => {
  const expected = {
    samurai: { level: 1, weapon: 'odachi', kit: 'samuraiTosei', horse: null, men: ['samurai', 'samuraiTosei', 'ashigaru'] },
    knight: { level: 2, weapon: 'lance', kit: 'knight', horse: ['destrier', 'plate'], sidearm: 'mace', men: ['knight', 'footman'] },
    mongol: { level: 3, weapon: 'compositeBow', kit: 'mingIronLamellar', horse: ['steppe', 'bare'], sidearm: 'mace', men: ['steppeMedium'] },
    police: { level: 4, weapon: 'rifle', kit: 'swat', horse: null, sidearm: 'baton', men: ['swat'] },
  };
  assert.equal(LAST_GATE.title, 'Last Stand Squad');
  assert.deepEqual(LAST_GATE_MODE_KEYS, Object.keys(expected));
  assert.equal(new Set(LAST_GATE_MODE_KEYS.map((key) => LAST_GATE_MODES[key].title)).size, 4);
  for (const [key, want] of Object.entries(expected)) {
    assert.equal(LAST_GATE_MODES[key].level, want.level);
    const world = createLastGate(key, { companions: 5, seed: 2 });
    const hero = world.fighters[0];
    assert.equal(hero.corner, 'red');
    assert.equal(hero.weapon?.kind, want.weapon, `${key}'s weapon`);
    assert.ok(hero.weapon.held, `${key} can hold his weapon`);
    assert.equal(hero.body.inputs.outfit.kind, want.kit);
    assert.equal(hero.body.inputs.skill, LAST_GATE.heroSkill);
    assert.deepEqual(hero.mount ? [hero.mount.breed, hero.mount.barding] : null, want.horse, `${key}'s horse`);
    if (want.sidearm) assert.equal(hero.body.inputs.sidearm, want.sidearm);
    // A rider set down at his place on his horse, out before his men.
    if (hero.mount) assert.ok(Math.abs(hero.mount.at[0] - (LAST_GATE.gate.x + LAST_GATE.posts.rider[0])) < 1e-6 && Math.abs(hero.x[P.pelvis * 3] - hero.mount.at[0]) < 1);
    const men = world.fighters.filter((fighter) => fighter.corner === 'red').slice(1);
    assert.equal(men.length, 5);
    for (const man of men) {
      assert.ok(want.men.includes(man.body.inputs.outfit.kind), `${key}'s man in ${man.body.inputs.outfit.kind}`);
      assert.ok(!man.mount, 'his men on foot at the gate');
    }
    assert.equal(createLastGate(key, { companions: 0 }).fighters.filter((fighter) => fighter.corner === 'red').length, 1, 'alone');
  }
  for (const key of LAST_GATE_MODE_KEYS) assert.ok(createLastGate(key, { companions: 0 }).fighters[0].body.gear.protection.cut >= 0.5, key);
  assert.ok(createLastGate('mongol', { companions: 0 }).fighters[0].body.gear.protection.pierce >= 0.7);
  // The Mongol's arrows kept up from the gate's stores (endlessAmmo); the rifle's magazines counted, and his men's quivers.
  assert.equal(ammoCarried(createLastGate('mongol', { companions: 0 }).fighters[0]), Infinity);
  assert.ok(Number.isFinite(ammoCarried(createLastGate('mongol', { companions: 2 }).fighters[1])));
  assert.ok(Number.isFinite(ammoCarried(createLastGate('police', { companions: 0 }).fighters[0])), 'rounds counted');
});

test('a squad given: its men stand where they were placed (kept on the squad\'s ground before the gate), and those places are the Formation order\'s', () => {
  const men = [0, 1, 2, 3, 4, 5, 6].map((index) => ({ ...structuredClone(LAST_GATE_MODES.samurai.companion(seededRandom(index + 1), 3)), mounted: false }));
  const zone = lastGateZone();
  const places = [[-9, 0], [-8, -2], [-8, 2], [-7, -4], [-7, 4], [-10, -6], [-10, 6], [30, 30]];
  const world = createLastGate('samurai', { men, places, seed: 4 });
  const squad = world.fighters.filter((fighter) => fighter.corner === 'red');
  assert.equal(squad.length, 8);
  assert.equal(world.lastGate.squad, 8);
  squad.forEach((fighter, index) => {
    const want = intoLastGateZone(places[index]);
    assert.ok(apart(hips(fighter), want) < 0.3, `man ${index} at ${hips(fighter)} for ${want}`);
    assert.deepEqual(world.formPlaces.red[fighter.id], want);
  });
  // One placed off the field is brought onto the squad's ground (its far corner).
  assert.deepEqual(intoLastGateZone([30, 30]), [zone.x[1], zone.z[1]]);
  // With none given, the default places: the hero in the gateway, his men about him, none behind him.
  const defaults = lastGateDefaultPlaces(7);
  assert.equal(defaults.length, 8);
  assert.ok(defaults.every(([x, z]) => x >= zone.x[0] && x <= zone.x[1] && z >= zone.z[0] && z <= zone.z[1]));
  assert.ok(defaults.slice(1).every(([x]) => x <= defaults[0][0]), 'his men level with him or nearer the wall');
});

test('each level climbs its own faction\'s ladder from the starved rebel; no foe carries a bow, a crossbow or a gun', () => {
  const ladders = {
    samurai: { rungs: ['unarmed', 'staff', 'ragSpear', 'ashigaru', 'ronin', 'sohei', 'samurai'], faction: 'japanese', kits: { ashigaru: ['ashigaru'], ronin: ['ronin'], sohei: ['sohei'], samurai: ['samurai', 'samuraiTosei'] } },
    knight: { rungs: ['unarmed', 'staff', 'peasant', 'spear', 'footman', 'manAtArms', 'knight', 'hammerKnight'], faction: 'knights', kits: { peasant: ['commoner'], footman: ['footman'], manAtArms: ['footman'], knight: ['knight'], hammerKnight: ['knight'] } },
    mongol: { rungs: ['unarmed', 'staff', 'ragSpear', 'mingGarrison', 'mingGarrisonDao', 'mingBrigandine', 'mingShield', 'mingElite'], faction: 'chinese', kits: { mingGarrison: ['mingGarrison'], mingGarrisonDao: ['mingGarrison'], mingBrigandine: ['mingBrigandine'], mingShield: ['mingBrigandine'], mingElite: ['mingElite'] } },
  };
  for (const [mode, want] of Object.entries(ladders)) {
    assert.deepEqual(LAST_GATE_MODES[mode].ladder.rungs, want.rungs, mode);
    const random = seededRandom(11);
    for (const kind of want.rungs) {
      assert.ok(LAST_GATE_FOES[kind], kind);
      for (let k = 0; k < 6; k += 1) {
        const man = buildBody(lastGateFoe(random, kind, LAST_GATE_MODES[mode].people ?? null));
        assert.equal(man.gear.courage, LAST_GATE.desperate, kind);
        assert.ok(!STYLES[man.inputs.style]?.ranged, `${mode}: a ${kind} with a ${man.inputs.style}`);
        if (want.kits[kind]) {
          // A soldier of the level's own people, in his kit, fed past the starved.
          assert.ok(want.kits[kind].includes(man.inputs.outfit.kind), `${kind} in ${man.inputs.outfit.kind}`);
          assert.equal(factionOf(man.inputs), want.faction, `${mode}: ${kind}`);
          assert.ok(deriveStats(man).bmi > 18, `${kind} fed`);
        } else {
          // The starved rebel (cast.js starvedRebel): rags (or the levy's quilted jack over them), a BMI under 16.
          assert.ok(['rags', 'levy'].includes(man.inputs.outfit.kind), `${kind} in ${man.inputs.outfit.kind}`);
          assert.ok(deriveStats(man).bmi < 16, `${kind} starved`);
        }
      }
    }
    // The waves climb it: the first all from the bottom rungs (the starved), never down, to the top by wave ten.
    const kinds = (wave) => {
      const counts = {};
      for (let k = 0; k < 1000; k += 1) {
        const kind = lastGateRebelKind(wave, (k + 0.5) / 1000, mode);
        counts[kind] = (counts[kind] ?? 0) + 1;
      }
      return counts;
    };
    assert.ok(Object.keys(kinds(1)).every((kind) => !want.kits[kind] || kind === 'peasant'), `${mode} wave 1: ${JSON.stringify(kinds(1))}`);
    assert.ok(kinds(1).unarmed >= 500, `${mode}: ${JSON.stringify(kinds(1))}`);
    for (let wave = 2; wave <= 14; wave += 1) assert.ok(lastGateRung(wave, mode) >= lastGateRung(wave - 1, mode), `${mode} climbs`);
    const top = want.rungs[want.rungs.length - 1];
    assert.deepEqual(kinds(10), { [top]: 1000 }, `${mode} at the top by wave 10`);
    // The best rung only at the end: none of it before wave 8.
    for (let wave = 1; wave < 8; wave += 1) assert.ok(!kinds(wave)[top], `${mode}: ${top} in wave ${wave}`);
  }
  // A starved man of the land's: a Japanese name and black hair in the Rice Riot, his spear a yari.
  const ikki = lastGateRebel(seededRandom(3), 'ragSpear', LAST_GATE_MODES.samurai.people);
  assert.equal(ikki.style, 'yari');
  assert.match(ikki.name, / of /);
  // A shooter's kind is put down for a spear: never a bow in the horde.
  LAST_GATE_FOES.archerTest = () => ({ ...structuredClone(LAST_GATE_MODES.samurai.companion(seededRandom(1), 3)), style: 'bow' });
  try {
    assert.equal(lastGateFoe(seededRandom(1), 'archerTest').style, LAST_GATE.melee);
  } finally {
    delete LAST_GATE_FOES.archerTest;
  }
});

test('waves: a breather, the "Wave N" banner, the wave\'s few men (more each wave, slowly), cleared, a breather, the next', () => {
  for (const key of LAST_GATE_MODE_KEYS) {
    let last = null;
    for (let wave = 1; wave <= 12; wave += 1) {
      const size = lastGateWaveSize(key, wave);
      assert.ok(size.alive >= 1 && size.alive <= size.count && size.alive <= LAST_GATE.liveCap, `${key} ${wave}: ${JSON.stringify(size)}`);
      if (last) assert.ok(size.count >= last.count && size.count - last.count <= 3 && size.alive - last.alive <= 1, `${key} wave ${wave}: ${last.count} → ${size.count}`);
      last = size;
    }
    // Few at first, and few on the field at once (fewer but tougher: the ladder makes them harder).
    assert.ok(lastGateWaveSize(key, 1).count <= 3 && lastGateWaveSize(key, 1).alive <= 3, key);
    if (key !== 'police') assert.ok(lastGateWaveSize(key, 12).alive <= 9, key);
    assert.ok(lastGateWaveValue(key, 'pace', 20) <= 1 && lastGateWaveValue(key, 'run', 30) <= 1);
  }
  // The androids learn (their skill by the wave); a man's skill is his own (his rung's).
  assert.ok(lastGateWaveValue('police', 'skill', 6) > lastGateWaveValue('police', 'skill', 4));
  for (const key of ['samurai', 'knight', 'mongol']) assert.equal(lastGateWaveValue(key, 'skill', 6), null);
  const world = createLastGate('samurai', { companions: 2, seed: 5 });
  const run = world.lastGate;
  const step = (seconds) => {
    for (let t = 0; t < seconds; t += 1 / 30) stepLastGate(world, 1 / 30);
  };
  // Before the first wave: nobody out of the mist.
  step(LAST_GATE.opening - 0.5);
  assert.equal(run.phase, 'breather');
  assert.equal(foesUp(world).length, 0);
  step(1);
  assert.equal(run.phase, 'fight');
  assert.deepEqual(drainLastGate(world).news, [{ kind: 'wave', wave: 1 }]);
  const { count } = lastGateWaveSize('samurai', 1);
  step(20);
  assert.equal(run.spawned, count, 'the whole wave out');
  assert.ok(foesUp(world).length <= lastGateWaveSize('samurai', 1).alive);
  // All of it down (one by the hero, the rest by his men): the wave cleared, its kills credited.
  const down = foesUp(world);
  down.forEach((foe, index) => {
    run.lastHitBy.set(foe.id, index === 0 ? run.heroId : 1);
    foe.state = 'out';
  });
  step(0.1);
  assert.deepEqual(run.kills, { hero: 1, squad: down.length - 1, total: down.length });
  assert.equal(run.cleared, 1);
  assert.equal(run.wave, 2);
  assert.equal(run.phase, 'breather');
  assert.deepEqual(drainLastGate(world).news, [{ kind: 'cleared', wave: 1 }]);
  step(LAST_GATE.breather - 0.5);
  assert.equal(run.phase, 'breather', 'a breather between waves');
  step(1);
  assert.equal(run.phase, 'fight');
  assert.deepEqual(drainLastGate(world).news, [{ kind: 'wave', wave: 2 }]);
  // The result: the kills (all, the hero's, the squad's), the waves cleared, the wave it stood in.
  const result = lastGateResult(world);
  assert.equal(result.kills, down.length);
  assert.equal(result.heroKills, 1);
  assert.equal(result.squadKills, down.length - 1);
  assert.equal(result.waves, 1);
  assert.equal(result.wave, 2);
  assert.equal(result.how, null);
  assert.equal(result.hero, 'samurai');
});

test('the run ends when the hero falls (the squad still up), and the time stops', () => {
  const world = createLastGate('samurai', { companions: 3, seed: 6 });
  advance(world, 6, think);
  assert.equal(world.lastGate.over, null);
  world.fighters[0].state = 'out';
  stepLastGate(world, 0.1);
  assert.equal(world.lastGate.over?.how, 'fallen');
  const at = world.lastGate.over.time;
  stepLastGate(world, 1);
  assert.equal(lastGateResult(world).seconds, Math.round(at));
  assert.ok(drainLastGate(world).news.some((item) => item.kind === 'over'));
});

test('the Formation order: offered only where the squad has places; every man back to his own and held there', () => {
  // A battle without places: no Formation among the orders, and none given.
  const plain = createWorld([0, 1, 2, 3].map((index) => ({ inputs: LAST_GATE_MODES.samurai.companion(seededRandom(index + 1), 3), corner: 'red' })).concat([{ inputs: LAST_GATE_MODES.samurai.companion(seededRandom(9), 3), corner: 'blue' }]));
  assert.ok(!ordersFor(plain, 'red').some((entry) => entry.kind === 'form'));
  assert.equal(giveOrder(plain, plain.fighters[0], 'form'), null);
  // A squad of two takes orders (its places are its own).
  const pair = createLastGate('samurai', { companions: 1, seed: 7 });
  assert.ok(canCommand(pair, pair.fighters[0]));
  assert.ok(ordersFor(pair, 'red').some((entry) => entry.kind === 'form'));
  const world = createLastGate('samurai', { companions: 4, seed: 7 });
  const hero = world.fighters[0];
  const men = world.fighters.filter((fighter) => fighter.corner === 'red' && fighter !== hero);
  // His men scattered out across the field (as a chase leaves them), then ordered back.
  men.forEach((man, index) => placeOnFloor(man, 2 + index, (index - 2) * 3, 0, 0));
  giveOrder(world, hero, 'form');
  assert.equal(standingOrder(world, 'red'), 'form');
  const think2 = (current, dt) => {
    stepLastGate(current, dt, { playerId: hero.id });
    thinkAll(current, dt, new Set([hero.id]));
  };
  advance(world, 14, think2);
  for (const man of men) {
    const away = apart(hips(man), world.formPlaces.red[man.id]);
    assert.ok(away < LAST_GATE.form.leash, `${man.body.inputs.name} ${away.toFixed(2)} m from his place`);
  }
  // Free again: the order taken back.
  giveOrder(world, hero, 'free');
  assert.equal(standingOrder(world, 'red'), 'free');
});

test('Night Shift\'s horde: service androids (the humanoid robot, not the combat bot): bare hands, no blood, no fear', () => {
  const world = createLastGate('police', { companions: 1, seed: 4 });
  const androids = world.fighters.filter((fighter) => fighter.corner === 'blue');
  assert.equal(androids.length, LAST_GATE.pool);
  for (const android of androids) {
    assert.equal(android.body.inputs.outfit.kind, 'humanoid');
    assert.ok(android.body.gear.machine, 'a machine');
    assert.equal(android.weapon ?? null, null, 'no weapon in its hands: not the combat bot\'s forearm guns');
  }
  assert.ok(androids.every((android) => android.dormant), 'none out of the mist before the first wave');
  advance(world, LAST_GATE.opening + 0.5, think);
  const awake = androids.find((android) => !android.dormant);
  assert.ok(awake, 'the first wave out of the mist');
  awake.concussion = 1e9;
  assert.equal(fearTarget(world, awake, -1, world.fighters[0]), 0);
});

test('a rebel never routs: no fear however outmatched and hurt, and none breaks in a run', () => {
  const world = createLastGate('knight', { companions: 2, seed: 4 });
  advance(world, LAST_GATE.opening + 0.5, think);
  const rebel = world.fighters.find((fighter) => fighter.corner === 'blue' && !fighter.dormant);
  rebel.concussion = 1e9;
  assert.equal(fearTarget(world, rebel, -1, world.fighters[0]), 0);
  advance(world, 40, think);
  const rebels = new Set(world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter) => fighter.id));
  assert.equal(world.events.filter((event) => event.kind === 'panic' && rebels.has(event.fighter)).length, 0);
  assert.ok(world.fighters.filter((fighter) => rebels.has(fighter.id)).every((fighter) => !fighter.panicked));
});

test('the knight\'s lance is kept: it runs the rebels through (no armour to break it on) and he couches it again', () => {
  const world = createLastGate('knight', { companions: 0, seed: 2 });
  const knight = world.fighters[0];
  for (let t = 0; t < 90 && !world.lastGate.over; t += 0.5) advance(world, 0.5, think);
  const charges = world.events.filter((event) => event.attacker === 0 && event.punch === 'lanceCharge' && (event.kind === 'landed' || event.kind === 'blocked'));
  assert.ok(charges.length >= 3, `${charges.length} couched blows landed`);
  assert.ok(!world.events.some((event) => event.effects?.includes('the lance shattered')), 'never broken on a rebel');
  assert.ok(world.lastGate.kills.hero >= 2, `${world.lastGate.kills.hero} ridden down`);
  if (knight.mount) assert.equal(knight.weapon?.kind, 'lance', 'still in his hand while he rides');
});

test('the Mongol shoots from the saddle and never runs out of arrows: the bow stays in his hand', () => {
  const world = createLastGate('mongol', { companions: 0, seed: 1 });
  const archer = world.fighters[0];
  for (let t = 0; t < 40 && !world.lastGate.over; t += 0.25) advance(world, 0.25, think);
  const loosed = world.events.filter((event) => event.kind === 'loosed' && event.attacker === 0).length;
  assert.ok(loosed > 0, 'he shot');
  assert.ok(!world.events.some((event) => event.kind === 'quiverEmpty' && event.fighter === 0), 'never out of arrows');
  assert.ok(!archer.weapon?.spent, 'nor his bow spent');
  if (archer.mount) assert.equal(archer.weapon?.kind, 'compositeBow', `still the bow, not the ${archer.weapon?.kind}`);
});


test('the pool never grows however long the run, and never more foes on their feet than the wave allows', () => {
  const world = createLastGate('police', { companions: 5, seed: 7 });
  const count = world.fighters.length;
  assert.equal(count, 6 + LAST_GATE.pool);
  let most = 0;
  for (let t = 0; t < 120 && !world.lastGate.over; t += 0.5) {
    advance(world, 0.5, think);
    const live = foesUp(world).length;
    most = Math.max(most, live);
    assert.ok(live <= Math.max(lastGateWaveSize('police', world.lastGate.wave).alive, lastGateWaveSize('police', Math.max(1, world.lastGate.wave - 1)).alive), `${live} on their feet at ${t} s`);
    assert.equal(world.fighters.length, count);
  }
  assert.ok(most >= 2, `the horde came: ${most}`);
  assert.ok(world.lastGate.kills.total > 0, 'foes fell');
});

test('the best runs, a board for each level, ten long, best first (kills, then waves, then time), kept in storage or without it', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const board = createLastGateBoard(storage);
  assert.equal(board.best('samurai'), null);
  const random = seededRandom(9);
  for (let k = 0; k < 14; k += 1) board.add({ hero: 'samurai', kills: Math.floor(random() * 40), heroKills: 3, squad: 6, seconds: Math.floor(random() * 400), waves: Math.floor(random() * 8), date: `2026-10-${String(k + 1).padStart(2, '0')}` });
  const runs = board.list('samurai');
  assert.equal(runs.length, LAST_GATE_BOARD.keep);
  for (let k = 1; k < runs.length; k += 1) assert.ok(runs[k - 1].kills >= runs[k].kills);
  assert.deepEqual(board.best('samurai'), runs[0]);
  assert.equal(JSON.parse(store.get(lastGateBoardKey('samurai'))).length, LAST_GATE_BOARD.keep);
  assert.equal(lastGateBoardKey('samurai'), 'gladiator/laststand-board/samurai');
  // A new page reads the same best back.
  assert.deepEqual(createLastGateBoard(storage).best('samurai'), runs[0]);
  // Each level its own board.
  assert.equal(board.add({ hero: 'knight', kills: 1, heroKills: 1, seconds: 10, waves: 0 }).rank, 1);
  assert.equal(board.list('knight').length, 1);
  assert.equal(board.list('police').length, 0);
  assert.equal(new Set(LAST_GATE_MODE_KEYS.map(lastGateBoardKey)).size, 4);
  assert.equal(board.add({ hero: 'samurai', kills: 999, heroKills: 1, seconds: 1, waves: 1 }).rank, 1);
  assert.equal(board.best('samurai').kills, 999);
  assert.equal(board.add({ hero: 'samurai', kills: -1, seconds: 0, waves: 0 }).rank, null);
  // Ties on kills go to more waves, then to the longer stand.
  assert.equal(lastGateRank([{ kills: 5, waves: 2, seconds: 300, date: 'a' }], { kills: 5, waves: 3, seconds: 100, date: 'b' }).rank, 1);
  assert.equal(lastGateRank([{ kills: 5, waves: 3, seconds: 100, date: 'a' }], { kills: 5, waves: 3, seconds: 200, date: 'b' }).rank, 1);
  // Storage that throws (a sandboxed page): the board still works for the page's life.
  const denied = createLastGateBoard({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(denied.add({ hero: 'mongol', kills: 3, seconds: 60, waves: 2 }).rank, 1);
  assert.equal(denied.best('mongol').kills, 3);
  assert.equal(createLastGateBoard(null).list('samurai').length, 0);
});

test('the line to share', () => {
  assert.equal(lastGateShareText({ hero: 'samurai', seconds: 222, kills: 57, heroKills: 21, waves: 8 }), 'Last Stand Squad as the Samurai: 57 rebels cut down (21 by my hand), 8 waves, 3:42. HACS');
  assert.equal(lastGateShareText({ hero: 'knight', seconds: 61, kills: 1, heroKills: 1, waves: 1 }), 'Last Stand Squad as the Knight: 1 rebel ridden down (1 by my hand), 1 wave, 1:01. HACS');
  assert.equal(lastGateShareText({ hero: 'police', seconds: 185, kills: 40, heroKills: 30, waves: 6 }), 'Last Stand Squad as the SWAT officer: 40 androids taken down (30 by my hand), 6 waves, 3:05. HACS');
});

test('the field\'s puddles: shallow water in ellipses, splashed and heard as water over mud, drawn as the castle\'s water, and blood clouds in them', async () => {
  const { lastGateArena } = await import('../src/lastgate.js');
  const { softAt, standingWater, worksOf } = await import('../src/physics/fieldworks.js');
  const { worksWaters } = await import('../src/levelmode/water.js');
  const { surfaceUnder } = await import('../src/audio/surface.js');
  const { bloodDyeCreate, bloodDyeLand } = await import('../src/blooddye.js');
  const arena = lastGateArena();
  const works = worksOf(arena);
  assert.equal(works.soft.length, LAST_GATE.puddles.length);
  const [x, z, rx, rz] = LAST_GATE.puddles[0];
  const middle = softAt(works, x, z);
  assert.ok(middle && standingWater(middle) > 0.02, 'water in the middle');
  // The ellipse, not its box: the box's corner is dry.
  assert.equal(softAt(works, x + rx * 0.95, z + rz * 0.95), null);
  const waters = worksWaters(arena.works);
  assert.equal(waters.length, LAST_GATE.puddles.length);
  assert.ok(waters.every((water) => water.shape === 'ellipse' && water.murk === 'puddle'));
  // Heard: mud with water over it (a splash with the squelch: audio/sfx/step.js); out of it, the place's wet earth.
  const world = { arena, place: 'lastgate' };
  const step = surfaceUnder(world, x, 0, z);
  assert.equal(step.surface, 'mud');
  assert.ok(step.depth > 0.02);
  assert.equal(surfaceUnder(world, 15, 0, -9.5).depth, 0);
  // Blood that falls in the water clouds it; on the mud beside it, a stain.
  const view = { works: { group: { userData: { bloodDyeWater: [(px, pz) => { const soft = softAt(works, px, pz); return soft ? { wet: soft.share, reach: 1 } : null; }] } } }, places: {}, place: 'lastgate' };
  const dye = bloodDyeCreate();
  assert.equal(bloodDyeLand(view, dye, x, z, 1, 0), true);
  assert.equal(dye.clouds.length, 1);
  assert.equal(bloodDyeLand(view, dye, x + rx + 1, z, 1, 0), false);
});
