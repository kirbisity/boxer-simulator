// The Last Gate (lastgate.js): the three heroes and their men, the rebels' kits and their desperation, the breach and
// the gate's fall, the pool that never grows however long the run, the board of best runs, and the line to share.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fearTarget, thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { deriveStats } from '../src/physiology.js';
import { advance, placeOnFloor } from '../src/physics.js';
import { createLastGate, createLastGateBoard, LAST_GATE, LAST_GATE_BOARD, LAST_GATE_HERO_KEYS, LAST_GATE_POOL, lastGateRank, lastGateRebel, lastGateRebelKind, lastGateResult, lastGateShareText, stepLastGate } from '../src/lastgate.js';
import { seededRandom } from '../src/physics.js';

const think = (world, dt) => {
  stepLastGate(world, dt);
  thinkAll(world, dt);
};

test('the three heroes: the samurai with the ōdachi, the Iron Pagoda with the guandao, the knight in plate with the mace; each with five of his kind', () => {
  const expected = {
    samurai: { weapon: 'odachi', kit: 'samuraiTosei', men: ['samurai', 'samuraiTosei', 'ashigaru'] },
    ironPagoda: { weapon: 'guandao', kit: 'ironPagoda', men: ['steppeMedium'] },
    knight: { weapon: 'flangedMace', kit: 'knight', men: ['knight', 'footman'] },
  };
  assert.deepEqual(LAST_GATE_HERO_KEYS, Object.keys(expected));
  for (const [key, want] of Object.entries(expected)) {
    const world = createLastGate(key, { companions: 5, seed: 2 });
    const hero = world.fighters[0];
    assert.equal(hero.corner, 'red');
    assert.equal(hero.weapon?.kind, want.weapon, `${key}'s weapon`);
    assert.ok(hero.weapon.held, `${key} can hold his weapon`);
    assert.equal(hero.body.inputs.outfit.kind, want.kit);
    assert.equal(hero.body.inputs.skill, LAST_GATE.heroSkill);
    // Armour that turns an edge: plate, the iron lamellar, the samurai's lacquered plates.
    assert.ok(hero.body.gear.protection.cut >= 0.5, `${key}'s armour against a cut: ${hero.body.gear.protection.cut}`);
    const men = world.fighters.filter((fighter) => fighter.corner === 'red').slice(1);
    assert.equal(men.length, 5);
    for (const man of men) assert.ok(want.men.includes(man.body.inputs.outfit.kind), `${key}'s man in ${man.body.inputs.outfit.kind}`);
    assert.equal(createLastGate(key, { companions: 0 }).fighters.filter((fighter) => fighter.corner === 'red').length, 1, 'alone');
  }
});

test('the rebels: most bare-handed, some with a staff, a few with a spear and a quilted jack; all starved, all desperate', () => {
  const total = Object.values(LAST_GATE_POOL).reduce((sum, count) => sum + count, 0);
  assert.equal(total, LAST_GATE.pool);
  assert.ok(LAST_GATE_POOL.unarmed > total / 2 && LAST_GATE_POOL.staff > LAST_GATE_POOL.spear && LAST_GATE_POOL.spear <= total / 5);
  const world = createLastGate('knight', { companions: 0, seed: 3 });
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
  const mix = (wave) => {
    const counts = { unarmed: 0, staff: 0, spear: 0 };
    for (let k = 0; k < 1000; k += 1) counts[lastGateRebelKind(wave, (k + 0.5) / 1000)] += 1;
    return counts;
  };
  assert.deepEqual(mix(1), { unarmed: 1000, staff: 0, spear: 0 });
  const late = mix(10);
  assert.ok(late.unarmed > 500 && late.staff > late.spear && late.spear > 0 && late.spear <= 120, JSON.stringify(late));
});

test('a rebel never routs: no fear however outmatched and hurt, and none breaks in a run', () => {
  const world = createLastGate('ironPagoda', { companions: 2, seed: 4 });
  const rebel = world.fighters.find((fighter) => fighter.corner === 'blue' && !fighter.dormant);
  rebel.concussion = 1e9;
  assert.equal(fearTarget(world, rebel, -1, world.fighters[0]), 0);
  advance(world, 40, think);
  const rebels = new Set(world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter) => fighter.id));
  assert.equal(world.events.filter((event) => event.kind === 'panic' && rebels.has(event.fighter)).length, 0);
  assert.ok(world.fighters.filter((fighter) => rebels.has(fighter.id)).every((fighter) => !fighter.panicked));
});

test('a rebel through the gate is a breach; at LAST_GATE.breachesToFall the gate falls and the run is over', () => {
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

test('a long run never has more rebels on their feet than the cap, and the fighter list never grows', () => {
  // The waves sped up (one every 8 s), so the cap is reached within the two minutes.
  const seconds = LAST_GATE.waves.seconds;
  LAST_GATE.waves.seconds = 8;
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
    LAST_GATE.waves.seconds = seconds;
  }
});

test('the board keeps the ten best runs, best first (kills, then time held), in storage or without it', () => {
  const store = new Map();
  const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  const board = createLastGateBoard(storage);
  const random = seededRandom(9);
  let last = null;
  for (let k = 0; k < 14; k += 1) last = board.add({ hero: LAST_GATE_HERO_KEYS[k % 3], kills: Math.floor(random() * 40), total: 50, seconds: Math.floor(random() * 400), waves: 3, date: `2026-10-${String(k + 1).padStart(2, '0')}` });
  const runs = board.list();
  assert.equal(runs.length, LAST_GATE_BOARD.keep);
  for (let k = 1; k < runs.length; k += 1) assert.ok(runs[k - 1].kills > runs[k].kills || (runs[k - 1].kills === runs[k].kills && runs[k - 1].seconds >= runs[k].seconds));
  assert.equal(JSON.parse(store.get(LAST_GATE_BOARD.key)).length, LAST_GATE_BOARD.keep);
  assert.ok(last.rank === null || (last.rank >= 1 && last.rank <= 10));
  // A best run is first; a poor one with a full board is not on it.
  assert.equal(board.add({ hero: 'knight', kills: 999, total: 999, seconds: 1, waves: 1 }).rank, 1);
  assert.equal(board.add({ hero: 'knight', kills: -1, total: 0, seconds: 0, waves: 1 }).rank, null);
  // Ties on kills go to the longer hold.
  assert.equal(lastGateRank([{ kills: 5, seconds: 100, date: 'a' }], { kills: 5, seconds: 200, date: 'b' }).rank, 1);
  // Storage that throws (a sandboxed page): the board still works for the page's life.
  const denied = createLastGateBoard({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(denied.add({ hero: 'samurai', kills: 3, total: 4, seconds: 60, waves: 2 }).rank, 1);
  assert.equal(createLastGateBoard(null).list().length, 0);
});

test('the line to share', () => {
  assert.equal(lastGateShareText({ hero: 'samurai', seconds: 222, kills: 57 }), 'I held The Last Gate for 3:42 as the Samurai — 57 rebels cut down. Gladiator');
  assert.equal(lastGateShareText({ hero: 'ironPagoda', seconds: 61, kills: 1 }), 'I held The Last Gate for 1:01 as the Iron Pagoda — 1 rebel cut down. Gladiator');
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
