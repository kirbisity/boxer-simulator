import test from 'node:test';
import assert from 'node:assert/strict';
import { P, PRESETS } from '../src/body.js';
import { advance, createWorld } from '../src/physics.js';
import { thinkAll } from '../src/ai.js';
import { canRide, isMounted, mountAll, mountedTeams, sidesMounted } from '../src/horses.js';

const FIELD = { halfX: 30, halfZ: 20 };
const copy = (key, extra = {}) => ({ ...structuredClone(PRESETS[key]), ...extra });
const spot = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const between = (a, b) => Math.hypot(spot(a)[0] - spot(b)[0], spot(a)[1] - spot(b)[1]);
const world = (red, blue, arena = FIELD) => createWorld([...red.map((inputs) => ({ inputs, corner: 'red' })), ...blue.map((inputs) => ({ inputs, corner: 'blue' }))], { seed: 3, arena });

test('mounted is a fighter\'s own, and counts only for a kit that rides', () => {
  assert.equal(isMounted(copy('knight', { mounted: true })), true);
  assert.equal(isMounted(copy('knight')), false);
  assert.equal(isMounted(copy('murmillo', { mounted: true })), false, 'a gladiator is not put on a horse');
  const roster = [copy('knight'), copy('murmillo'), copy('samurai')];
  assert.equal(mountAll(roster, true), 2);
  assert.deepEqual(roster.map(isMounted), [true, false, true]);
  assert.equal(roster[1].mounted, undefined, 'the one who cannot ride is left alone');
  mountAll(roster, false);
  assert.deepEqual(roster.map(isMounted), [false, false, false]);
});

test('a setup\'s fighters carry their own mounted through the file and onto horses: two of the four who are flagged ride', () => {
  const red = [copy('knight', { mounted: true }), copy('knight', { name: 'Sir Foot' }), copy('samurai', { mounted: true }), copy('murmillo', { mounted: true })];
  const file = JSON.parse(JSON.stringify({ kind: 'gladiator/setup', version: 1, teams: { red, blue: [copy('templar'), copy('templar')] } }));
  const teams = mountedTeams(file);
  assert.deepEqual(teams.red.map((inputs) => Boolean(inputs.mounted)), [true, false, true, true]);
  const w = world(teams.red, teams.blue);
  // The gladiator's flag is a flag on a man who cannot ride: no horse.
  assert.equal(w.horses.length, 2);
  assert.deepEqual(w.fighters.filter((fighter) => fighter.mount).map((fighter) => fighter.corner), ['red', 'red']);
  assert.deepEqual(w.fighters.filter((fighter) => fighter.mount).map((fighter) => fighter.body.inputs.name), [PRESETS.knight.name, PRESETS.samurai.name]);
});

test('an older setup\'s side-level mounted is given to the riders of that side, and a fighter\'s own choice wins', () => {
  assert.deepEqual(sidesMounted('both'), ['red', 'blue']);
  assert.deepEqual(sidesMounted('blue'), ['blue']);
  assert.deepEqual(sidesMounted({ red: true, blue: false }), ['red']);
  assert.deepEqual(sidesMounted(''), []);
  assert.deepEqual(sidesMounted(undefined), []);
  const teams = { red: [copy('knight'), copy('murmillo'), copy('samurai', { mounted: false })], blue: [copy('templar'), copy('knight')] };
  const old = mountedTeams({ mounted: 'red', teams });
  assert.deepEqual(old.red.map(isMounted), [true, false, false], 'the gladiator cannot ride; the samurai chose to walk');
  assert.deepEqual(old.blue.map(isMounted), [false, false]);
  const both = mountedTeams({ mountedSides: 'both', teams });
  assert.deepEqual(both.blue.map(isMounted), [true, true]);
  // No side-level pick, no change.
  assert.deepEqual(mountedTeams({ teams }).red.map((inputs) => inputs.mounted), [undefined, undefined, false]);
  // The file's own fighters are not touched.
  assert.equal(teams.red[0].mounted, undefined);
});

test('canRide gates the horses: a side of men who cannot ride has none however it is flagged', () => {
  const w = world([copy('murmillo', { mounted: true }), copy('heavy', { mounted: true })], [copy('legionary', { mounted: true }), copy('street', { mounted: true })]);
  assert.equal(w.horses.length, 0);
  assert.ok(!canRide(PRESETS.heavy));
  // And so they start as a foot fight does, not 24 m apart.
  assert.ok(Math.abs(spot(w.fighters[0])[0] - spot(w.fighters[2])[0]) < 6);
});

test('a mixed team: the foot stand in their rows at the charging distance, the riders on their flanks, nobody on top of another', () => {
  const red = [copy('knight', { mounted: true }), copy('templar'), copy('templar'), copy('samurai', { mounted: true }), copy('knight')];
  const blue = [copy('saladin', { mounted: true }), copy('saladin', { mounted: true }), copy('kheshig'), copy('kheshig')];
  const w = world(red, blue);
  const team = (corner) => w.fighters.filter((fighter) => fighter.corner === corner);
  for (const corner of ['red', 'blue']) {
    const members = team(corner);
    const riders = members.filter((fighter) => fighter.mount);
    const foot = members.filter((fighter) => !fighter.mount);
    assert.ok(riders.length && foot.length, corner);
    const width = Math.max(...foot.map((fighter) => Math.abs(spot(fighter)[1])));
    for (const rider of riders) assert.ok(Math.abs(spot(rider)[1]) > width + 1, `${corner} rider at z ${spot(rider)[1]} beside foot to ${width}`);
    // All on their own side, at the line.
    const sign = corner === 'red' ? -1 : 1;
    for (const fighter of members) assert.ok(sign * spot(fighter)[0] > 10, `${corner} x ${spot(fighter)[0]}`);
    for (const a of members) for (const b of members) if (a !== b) assert.ok(between(a, b) > 0.9);
  }
  // The two sides are far enough apart to charge.
  const gap = Math.min(...team('blue').flatMap((b) => team('red').map((r) => Math.abs(spot(b)[0] - spot(r)[0]))));
  assert.ok(gap > 18, `${gap}`);
});

test('a team of riders only is a line abreast; those who do not fit across a narrow field form a rank behind', () => {
  const riders = (count) => Array.from({ length: count }, () => copy('knight', { mounted: true }));
  const w = world(riders(4), [copy('templar'), copy('templar')]);
  const zs = w.fighters.slice(0, 4).map((fighter) => spot(fighter)[1]).sort((a, b) => a - b);
  assert.ok(Math.abs(zs[0] + zs[3]) < 1e-6, 'centred');
  assert.ok(zs[1] - zs[0] > 1.5, 'a horse apart');
  const narrow = world(riders(8), [copy('templar')], { halfX: 30, halfZ: 6 });
  const xs = new Set(narrow.fighters.slice(0, 8).map((fighter) => Math.round(spot(fighter)[0] * 10)));
  assert.ok(xs.size >= 2, 'a second rank');
  for (const fighter of narrow.fighters) assert.ok(Math.abs(spot(fighter)[1]) <= 6, `z ${spot(fighter)[1]}`);
});

test('a mixed fight runs: riders and men on foot close, and the world goes on', () => {
  const w = world([copy('knight', { mounted: true }), copy('templar'), copy('samurai', { mounted: true }), copy('templar')], [copy('saladin', { mounted: true }), copy('kheshig'), copy('saladin', { mounted: true }), copy('kheshig')]);
  for (let step = 0; step < 60 * 12; step += 1) {
    thinkAll(w, 1 / 60);
    advance(w, 1 / 60);
  }
  for (const fighter of w.fighters) for (const value of fighter.x) assert.ok(Number.isFinite(value));
  // Closing: the nearest red-blue pair is much nearer than the 24 m they began.
  const reds = w.fighters.filter((fighter) => fighter.corner === 'red');
  const blues = w.fighters.filter((fighter) => fighter.corner === 'blue');
  const near = Math.min(...reds.flatMap((red) => blues.map((blue) => between(red, blue))));
  assert.ok(near < 8, `${near}`);
});
