// The Last Gate (lastgate.js): the four modes (their heroes and kit, their men, their hordes), the rebels' kits and their
// desperation, the androids, the lance kept, the horse archer's mace when his quiver is empty, the waves' ramp, the breach
// and the gate's fall, the pool that never grows however long the run, the boards of best runs, and the line to share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fearTarget, thinkAll } from '../src/ai.js';
import { buildBody, P } from '../src/body.js';
import { deriveStats } from '../src/physiology.js';
import { advance, placeOnFloor, seededRandom } from '../src/physics.js';
import { ammoCarried } from '../src/physics/ranged.js';
import { createLastGate, createLastGateBoard, LAST_GATE, LAST_GATE_BOARD, LAST_GATE_MODE_KEYS, LAST_GATE_MODES, lastGateBoardKey, lastGateFed, lastGateRank, lastGateRebel, lastGateRebelKind, lastGateResult, lastGateShareText, lastGateWaveValue, stepLastGate } from '../src/lastgate.js';

const think = (world, dt) => {
  stepLastGate(world, dt);
  thinkAll(world, dt);
};

test('four modes, each its own hero, his kit and his men: the samurai in ō-yoroi with the ōdachi, the knight on his destrier with the lance, the Mongol horse archer in iron lamellar, the SWAT officer with the AR-15', () => {
  const expected = {
    samurai: { weapon: 'odachi', kit: 'oyoroi', horse: null, men: ['samurai', 'samuraiTosei', 'ashigaru'] },
    knight: { weapon: 'lance', kit: 'knight', horse: ['destrier', 'plate'], sidearm: 'mace', men: ['knight', 'footman'] },
    mongol: { weapon: 'compositeBow', kit: 'mingIronLamellar', horse: ['steppe', 'bare'], sidearm: 'mace', men: ['steppeMedium'] },
    police: { weapon: 'rifle', kit: 'swat', horse: null, sidearm: 'baton', men: ['swat'] },
  };
  assert.deepEqual(LAST_GATE_MODE_KEYS, Object.keys(expected));
  // Each a scenario of its own name, and settings of its own.
  assert.equal(new Set(LAST_GATE_MODE_KEYS.map((key) => LAST_GATE_MODES[key].title)).size, 4);
  assert.equal(new Set(LAST_GATE_MODE_KEYS.map((key) => JSON.stringify(LAST_GATE_MODES[key].waves))).size, 4);
  for (const [key, want] of Object.entries(expected)) {
    const world = createLastGate(key, { companions: 5, seed: 2 });
    const hero = world.fighters[0];
    assert.equal(hero.corner, 'red');
    assert.equal(hero.weapon?.kind, want.weapon, `${key}'s weapon`);
    assert.ok(hero.weapon.held, `${key} can hold his weapon`);
    assert.equal(hero.body.inputs.outfit.kind, want.kit);
    assert.equal(hero.body.inputs.skill, LAST_GATE.heroSkill);
    assert.deepEqual(hero.mount ? [hero.mount.breed, hero.mount.barding] : null, want.horse, `${key}'s horse`);
    if (want.sidearm) assert.equal(hero.body.inputs.sidearm, want.sidearm);
    // A rider set down at his post on his horse, out before his men.
    if (hero.mount) assert.ok(Math.abs(hero.mount.at[0] - (LAST_GATE.gate.x + LAST_GATE.posts.rider[0])) < 1e-6 && Math.abs(hero.x[P.pelvis * 3] - hero.mount.at[0]) < 1);
    const men = world.fighters.filter((fighter) => fighter.corner === 'red').slice(1);
    assert.equal(men.length, 5);
    for (const man of men) {
      assert.ok(want.men.includes(man.body.inputs.outfit.kind), `${key}'s man in ${man.body.inputs.outfit.kind}`);
      assert.ok(!man.mount, 'his men on foot at the gate');
    }
    assert.equal(createLastGate(key, { companions: 0 }).fighters.filter((fighter) => fighter.corner === 'red').length, 1, 'alone');
  }
  // Armour that turns an edge on every hero; the Mongol's iron lamellar heavy against a point (a lance breaks on it).
  for (const key of LAST_GATE_MODE_KEYS) assert.ok(createLastGate(key, { companions: 0 }).fighters[0].body.gear.protection.cut >= 0.5, key);
  assert.ok(createLastGate('mongol', { companions: 0 }).fighters[0].body.gear.protection.pierce >= 0.7);
  // The finite: his quiver and the rifle's magazines.
  const archer = createLastGate('mongol', { companions: 0 }).fighters[0];
  assert.ok(Number.isFinite(ammoCarried(archer)) && ammoCarried(archer) <= 40, `${ammoCarried(archer)} arrows`);
  const officer = createLastGate('police', { companions: 0 }).fighters[0];
  assert.ok(Number.isFinite(ammoCarried(officer)), 'rounds counted');
});

test('the rebels: most bare-handed, some with a staff, a few with a spear and a quilted jack; all starved, all desperate; each mode its own mix', () => {
  for (const key of ['samurai', 'knight', 'mongol']) {
    const pool = LAST_GATE_MODES[key].pool;
    const total = Object.values(pool).reduce((sum, count) => sum + count, 0);
    assert.equal(total, LAST_GATE.pool, key);
    assert.ok(pool.unarmed >= total * 0.4 && pool.staff >= pool.spear && pool.spear <= total / 4, `${key}: ${JSON.stringify(pool)}`);
  }
  const world = createLastGate('samurai', { companions: 0, seed: 3 });
  const rebels = world.fighters.filter((fighter) => fighter.corner === 'blue');
  assert.equal(rebels.length, LAST_GATE.pool);
  const random = seededRandom(5);
  for (const kind of ['unarmed', 'staff', 'spear']) {
    const inputs = lastGateRebel(random, kind);
    const man = rebels.find((rebel) => rebel.body.inputs.style === inputs.style) ?? null;
    assert.ok(man, `a ${kind} rebel in the pool`);
    assert.equal(man.weapon?.kind ?? null, { unarmed: null, staff: 'staff', spear: 'longSpear' }[kind]);
    assert.equal(man.body.inputs.outfit.kind, kind === 'spear' ? 'levy' : 'rags');
    if (kind === 'spear') assert.ok(man.body.gear.protection.cut > 0, 'a little armour');
    else assert.equal(man.body.gear.protection.cut, 0, 'rags turn nothing');
  }
  for (const rebel of rebels) {
    assert.equal(rebel.body.gear.courage, LAST_GATE.desperate);
    const bmi = deriveStats(rebel.body).bmi;
    assert.ok(bmi < 16, `starved: BMI ${bmi.toFixed(1)}`);
  }
  // The waves: the first all bare hands; later most still bare-handed, some staffs, a few spears.
  const mix = (wave, mode = 'samurai') => {
    const counts = { unarmed: 0, staff: 0, spear: 0 };
    for (let k = 0; k < 1000; k += 1) counts[lastGateRebelKind(wave, (k + 0.5) / 1000, mode)] += 1;
    return counts;
  };
  assert.deepEqual(mix(1), { unarmed: 1000, staff: 0, spear: 0 });
  const late = mix(10);
  assert.ok(late.unarmed > 300 && late.staff > late.spear && late.spear > 0 && late.spear <= 300, JSON.stringify(late));
  // The Jacquerie's peasants come better armed than the famine rebels, from the first wave.
  assert.ok(mix(1, 'knight').staff + mix(1, 'knight').spear > 100 && mix(6, 'knight').spear > mix(6, 'samurai').spear);
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
  const awake = androids.find((android) => !android.dormant);
  assert.ok(awake, 'the first already out of the mist');
  awake.concussion = 1e9;
  assert.equal(fearTarget(world, awake, -1, world.fighters[0]), 0);
});

test('a rebel never routs: no fear however outmatched and hurt, and none breaks in a run', () => {
  const world = createLastGate('knight', { companions: 2, seed: 4 });
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

test('the Mongol shoots from the saddle until his quiver is empty, then draws the mace and fights on', () => {
  const world = createLastGate('mongol', { companions: 0, seed: 1 });
  const archer = world.fighters[0];
  // (His quiver nearly spent: the last few arrows.)
  archer.arrows = 3;
  let emptied = null;
  for (let t = 0; t < 60 && !world.lastGate.over && archer.weapon?.kind === 'compositeBow'; t += 0.25) {
    advance(world, 0.25, think);
    if (emptied === null && world.events.some((event) => event.kind === 'quiverEmpty' && event.fighter === 0)) emptied = world.time;
  }
  assert.ok(emptied !== null, 'his quiver ran out');
  assert.ok(world.events.some((event) => event.kind === 'arrow' && event.attacker === 0) || world.events.filter((event) => event.kind === 'loosed' && event.fighter === 0).length > 0 || archer.arrows === 0, 'he shot');
  assert.equal(archer.weapon?.kind, 'flangedMace', `then the ${archer.weapon?.kind}`);
  assert.ok(archer.weapon.held);
});

test('each mode\'s waves: intense from the first (foes on the field, one woken every few seconds), and steeper from two minutes on', () => {
  for (const key of LAST_GATE_MODE_KEYS) {
    const waves = LAST_GATE_MODES[key].waves;
    const at = (knob, wave) => lastGateWaveValue(key, knob, wave);
    // The steep part begins at two minutes (wave steepFrom + 1).
    assert.equal(waves.seconds * waves.steepFrom, 120, key);
    assert.ok(at('alive', 1) >= 2 && at('every', 1) <= 4, `${key}: ${at('alive', 1)} on the field, one every ${at('every', 1)} s`);
    // Before two minutes the horde grows; after, it grows faster (to the cap) and comes quicker, faster and better trained.
    const early = at('alive', waves.steepFrom) - at('alive', 1);
    const late = Math.min(LAST_GATE.liveCap, at('alive', waves.steepFrom + 2)) - at('alive', waves.steepFrom);
    assert.ok(early > 0 && late / 2 > early / (waves.steepFrom - 1), `${key}: +${early} in the first two minutes, +${late} in the next minute`);
    assert.ok(at('every', waves.steepFrom + 2) < at('every', waves.steepFrom) && at('every', waves.steepFrom) < at('every', 1));
    assert.ok(at('run', waves.steepFrom + 2) - at('run', waves.steepFrom) > at('run', waves.steepFrom) - at('run', waves.steepFrom - 2), `${key}: running`);
    assert.ok(at('skill', waves.steepFrom + 2) > at('skill', waves.steepFrom), `${key}: trained`);
    assert.ok(at('pace', 8) <= 1 && at('run', 20) <= 1);
    // The rebels' later waves bring fed men among the starving (none before two minutes); the androids need no feeding.
    if (key === 'police') assert.equal(at('fed', 8), null);
    else assert.ok(at('fed', waves.steepFrom) === 0 && at('fed', waves.steepFrom + 2) > 0.2, `${key}: fed`);
  }
  const starving = lastGateRebel(seededRandom(3), 'staff');
  const fed = lastGateFed(starving);
  assert.ok(deriveStats(buildBody(fed)).bmi > 20 && deriveStats(buildBody(starving)).bmi < 16);
  assert.equal(fed.style, starving.style, 'his arms as they were');
  // A foe woken later is trained to his wave's skill.
  const world = createLastGate('police', { companions: 5, seed: 3 });
  world.lastGate.time = 200;
  const before = new Set(world.fighters.filter((fighter) => !fighter.dormant).map((fighter) => fighter.id));
  stepLastGate(world, 0.1);
  const woken = world.fighters.find((fighter) => fighter.corner === 'blue' && !fighter.dormant && !before.has(fighter.id));
  assert.ok(woken, 'one woken');
  assert.ok(Math.abs(woken.body.inputs.skill - lastGateWaveValue('police', 'skill', world.lastGate.wave)) < 1e-9);
});

test('a foe through the gate is a breach; at LAST_GATE.breachesToFall the gate falls and the run is over', () => {
  const world = createLastGate('samurai', { companions: 0, seed: 6 });
  const run = world.lastGate;
  const gate = LAST_GATE.gate;
  for (let breach = 1; breach <= LAST_GATE.breachesToFall; breach += 1) {
    // A rebel walked past the line (as one slipping by the defenders would be).
    let rebel = world.fighters.find((fighter) => fighter.corner === 'blue' && !fighter.dormant && fighter.state !== 'out');
    if (!rebel) {
      advance(world, 6, think);
      rebel = world.fighters.find((fighter) => fighter.corner === 'blue' && !fighter.dormant && fighter.state !== 'out');
    }
    assert.ok(rebel, 'a rebel awake');
    assert.equal(run.over, null, 'not over before the last breach');
    placeOnFloor(rebel, gate.x + 0.5, 0, 0, Math.PI);
    stepLastGate(world, 1 / 60);
    assert.equal(run.breaches, breach - 1, 'on the line: not yet through');
    placeOnFloor(rebel, gate.x - gate.breachBehind - 0.2, 0, 0, Math.PI);
    stepLastGate(world, 1 / 60);
    assert.equal(run.breaches, breach);
    // Gone into the castle: asleep, or his place in the pool already woken again out in the mist.
    assert.ok(rebel.dormant || rebel.x[P.pelvis * 3] > LAST_GATE.spawn.x - 1, 'gone into the castle');
  }
  assert.equal(run.over?.how, 'fallen');
  const result = lastGateResult(world);
  assert.equal(result.breaches, LAST_GATE.breachesToFall);
  assert.equal(result.hero, 'samurai');
});

test('a long run never has more foes on their feet than the cap, and the fighter list never grows', () => {
  // The waves sped up (one every 8 s), so the cap is reached within the two minutes.
  const waves = LAST_GATE_MODES.samurai.waves;
  const seconds = waves.seconds;
  waves.seconds = 8;
  try {
    const world = createLastGate('samurai', { companions: 5, seed: 7 });
    const count = world.fighters.length;
    assert.equal(count, 6 + LAST_GATE.pool);
    let most = 0;
    for (let t = 0; t < 120 && !world.lastGate.over; t += 0.5) {
      advance(world, 0.5, think);
      const live = world.fighters.filter((fighter) => fighter.corner === 'blue' && !fighter.dormant && fighter.state !== 'out').length;
      most = Math.max(most, live);
      assert.ok(live <= LAST_GATE.liveCap, `${live} rebels on their feet at ${t} s`);
      assert.equal(world.fighters.length, count);
    }
    assert.ok(most >= LAST_GATE.liveCap - 4, `the horde grew to ${most}`);
    assert.ok(world.lastGate.kills.total > 0, 'rebels fell');
  } finally {
    waves.seconds = seconds;
  }
});

test('the boards, one for each mode, keep the ten best runs, best first (kills, then time held), in storage or without it', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const board = createLastGateBoard(storage);
  const random = seededRandom(9);
  let last = null;
  for (let k = 0; k < 14; k += 1) last = board.add({ hero: 'samurai', kills: Math.floor(random() * 40), total: 50, seconds: Math.floor(random() * 400), waves: 3, date: `2026-10-${String(k + 1).padStart(2, '0')}` });
  const runs = board.list('samurai');
  assert.equal(runs.length, LAST_GATE_BOARD.keep);
  for (let k = 1; k < runs.length; k += 1) assert.ok(runs[k - 1].kills > runs[k].kills || (runs[k - 1].kills === runs[k].kills && runs[k - 1].seconds >= runs[k].seconds));
  assert.equal(JSON.parse(store.get(lastGateBoardKey('samurai'))).length, LAST_GATE_BOARD.keep);
  assert.ok(last.rank === null || (last.rank >= 1 && last.rank <= 10));
  // Each mode its own board: a knight's run is not ranked against the samurai's.
  assert.equal(board.add({ hero: 'knight', kills: 1, total: 1, seconds: 10, waves: 1 }).rank, 1);
  assert.equal(board.list('knight').length, 1);
  assert.equal(board.list('police').length, 0);
  assert.equal(board.list('samurai').length, LAST_GATE_BOARD.keep);
  assert.equal(new Set(LAST_GATE_MODE_KEYS.map(lastGateBoardKey)).size, 4);
  // A best run is first; a poor one with a full board is not on it.
  assert.equal(board.add({ hero: 'samurai', kills: 999, total: 999, seconds: 1, waves: 1 }).rank, 1);
  assert.equal(board.add({ hero: 'samurai', kills: -1, total: 0, seconds: 0, waves: 1 }).rank, null);
  // Ties on kills go to the longer hold.
  assert.equal(lastGateRank([{ kills: 5, seconds: 100, date: 'a' }], { kills: 5, seconds: 200, date: 'b' }).rank, 1);
  // Storage that throws (a sandboxed page): the board still works for the page's life.
  const denied = createLastGateBoard({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(denied.add({ hero: 'mongol', kills: 3, total: 4, seconds: 60, waves: 2 }).rank, 1);
  assert.equal(denied.list('mongol').length, 1);
  assert.equal(createLastGateBoard(null).list('samurai').length, 0);
});

test('the line to share', () => {
  assert.equal(lastGateShareText({ hero: 'samurai', seconds: 222, kills: 57 }), 'I held The Last Gate for 3:42 as the Samurai — 57 rebels cut down. Gladiator');
  assert.equal(lastGateShareText({ hero: 'knight', seconds: 61, kills: 1 }), 'I held The Last Gate for 1:01 as the Knight — 1 rebel ridden down. Gladiator');
  assert.equal(lastGateShareText({ hero: 'police', seconds: 185, kills: 40 }), 'I held The Last Gate for 3:05 as the SWAT officer — 40 androids taken down. Gladiator');
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
