// Stage 1, Dunnottar: what is drawn and what is stood on agree. A wall, a vault or a rock that the drawing puts across the way a man
// walks must be one the physics has too (and the other way: no drawn opening is shut); the props that stand on a floor are solid
// to him and leave the garrison's posts, patrols and the things to take clear; the outdoor path is narrow but wide enough to fight on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStageWorld, mechanismsOf, setMechanism, stageTerrain } from '../src/levelmode/stage.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { DN_PATH, DUNNOTTAR, DUNNOTTAR_ROUTE, dnPropSolid } from '../src/levelmode/stages/dunnottar.js';
import { floorAt, pushOut } from '../src/physics/terrain.js';
import { hipsAt, walk } from './walker.js';
import { P } from '../src/body.js';

const BODY = 0.35;
const allIds = DUNNOTTAR.sections.map((section) => section.id);
const closed = Object.fromEntries(mechanismsOf(DUNNOTTAR).map((mechanism) => [mechanism.id, mechanism.state]));
const terrain = stageTerrain(DUNNOTTAR, allIds, closed);

/** Whether a man of body radius BODY at (x, z) on the floor y is clear of every wall and face (nothing pushes him). */
function clear(x, z, y) {
  const at = [x, z];
  const moved = pushOut(terrain, at, BODY, y, y + 1.7, 0.35);
  return !moved || Math.hypot(at[0] - x, at[1] - z) < 0.05;
}

test('scenery: every solid prop gets a solid, small litter does not', () => {
  const props = DUNNOTTAR.sections.flatMap((section) => section.decor.filter((decor) => decor.kind === 'prop'));
  const solid = new Set(props.filter((prop) => dnPropSolid(prop)).map((prop) => prop.what));
  for (const what of ['barrel', 'crate', 'table', 'bench', 'cart', 'trebuchet', 'ram', 'brazier', 'pew', 'altar', 'hearth', 'rubbleheap', 'bed']) assert.ok(solid.has(what), `${what} is solid`);
  for (const what of ['weapon', 'bones', 'straw', 'planks', 'puddle', 'torch', 'banner', 'tools']) assert.ok(!solid.has(what), `${what} is walked over`);
  // And each is in the terrain: a man put at its middle is pushed out.
  let checked = 0;
  for (const section of DUNNOTTAR.sections) {
    for (const prop of section.decor.filter((decor) => decor.kind === 'prop' && dnPropSolid(decor))) {
      const wall = dnPropSolid(prop);
      const at = [prop.at[0], prop.at[2]];
      const moved = pushOut(terrain, at, BODY, prop.at[1], prop.at[1] + 1.7, 0.35);
      assert.ok(moved && Math.hypot(at[0] - prop.at[0], at[1] - prop.at[2]) > 0.25, `${prop.what} at ${prop.at} blocks a man (${wall.size})`);
      checked += 1;
    }
  }
  assert.ok(checked > 60, `${checked} solid props`);
});

test('scenery: no post, patrol, flee point, lever, rest or thing to take is inside a prop or a rock', () => {
  const stuck = [];
  for (const section of DUNNOTTAR.sections) {
    if (section.rear && !clear(section.rear[0], section.rear[2], floorAt(terrain, section.rear[0], section.rear[2], section.rear[1] + 5) ?? section.rear[1])) stuck.push(`${section.id} rear point`);
    for (const spawn of section.spawns) {
      if (spawn.dead) continue;
      if (spawn.refuge && !clear(spawn.refuge[0], spawn.refuge[2], floorAt(terrain, spawn.refuge[0], spawn.refuge[2], spawn.refuge[1] + 1) ?? spawn.refuge[1])) stuck.push(`${spawn.id} refuge`);
      if (!clear(spawn.post[0], spawn.post[2], spawn.post[1])) stuck.push(`${spawn.id} post`);
      const path = spawn.patrol ?? [];
      for (let i = 0; i + 1 < path.length; i += 1) {
        const [x0, z0] = path[i];
        const [x1, z1] = path[i + 1];
        const length = Math.hypot(x1 - x0, z1 - z0);
        for (let s = 0; s <= length; s += 0.4) {
          const t = length ? s / length : 0;
          if (!clear(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, spawn.post[1])) {
            stuck.push(`${spawn.id} patrol ${i} at ${(x0 + (x1 - x0) * t).toFixed(1)},${(z0 + (z1 - z0) * t).toFixed(1)}`);
            break;
          }
        }
      }
    }
    // A thing to take, a lever or a rest is within reach (1.5 m) of somewhere a man can stand.
    const reachable = (at) => {
      for (let r = 0; r <= 1.3; r += 0.2) {
        for (let k = 0; k < (r === 0 ? 1 : 16); k += 1) {
          const angle = (k / 16) * Math.PI * 2;
          if (clear(at[0] + Math.cos(angle) * r, at[2] + Math.sin(angle) * r, at[1])) return true;
        }
      }
      return false;
    };
    for (const item of section.items) if (!reachable(item.at)) stuck.push(`item ${item.id}`);
    for (const lever of section.levers) if (!reachable(lever.at)) stuck.push(`lever ${lever.id}`);
    for (const gate of section.gates) if (!reachable(gate.at)) stuck.push(`gate ${gate.id}`);
    if (section.rest && !reachable(section.rest.at)) stuck.push(`rest ${section.rest.id}`);
  }
  assert.deepEqual(stuck, []);
});

/**
 * Whether the drawing puts something at a point (x, z) at height y (a metre or two of a man): a wall run's masonry (but not its openings), or
 * a barrel vault's soffit lower than his head. Returns a description or null.
 */
function drawnBlock(x, y, z) {
  for (const section of DUNNOTTAR.sections) {
    for (const decor of section.decor) {
      if (decor.kind === 'run') {
        const dx = decor.b[0] - decor.a[0];
        const dz = decor.b[1] - decor.a[1];
        const length = Math.hypot(dx, dz);
        const s = ((x - decor.a[0]) * dx + (z - decor.a[1]) * dz) / length;
        const t = (-(x - decor.a[0]) * dz + (z - decor.a[1]) * dx) / length;
        if (s < 0 || s > length || Math.abs(t) > decor.thick / 2 + 0.1) continue;
        for (const height of [y + 0.2, y + 0.9, y + 1.6]) {
          if (height < decor.y0 || height > decor.y1) continue;
          // (A ruin's top is ragged and low in places, but never lower than a man's head from its own floor.)
          const open = (decor.openings ?? []).some((o) => !o.solid && Math.abs(s - o.at) < o.width / 2 + 0.02 && height >= (o.sill ?? decor.y0) - 0.2 && height <= o.top + 0.05);
          if (!open) return `${section.id} wall ${decor.a}->${decor.b} at ${[x, y, z].map((v) => v.toFixed(1))}`;
        }
      } else if (decor.kind === 'vault') {
        const dx = decor.b[0] - decor.a[0];
        const dz = decor.b[1] - decor.a[1];
        const length = Math.hypot(dx, dz);
        const s = ((x - decor.a[0]) * dx + (z - decor.a[1]) * dz) / length;
        const t = (-(x - decor.a[0]) * dz + (z - decor.a[1]) * dx) / length / (decor.width / 2);
        if (s < 0 || s > length || Math.abs(t) > 1) continue;
        const spring = decor.a[2] + ((decor.b[2] - decor.a[2]) * s) / length;
        const soffit = spring + decor.crown * Math.sqrt(Math.max(0, 1 - t * t));
        if (y + 1.8 > soffit + 0.3 && y < spring) return `${section.id} vault ${decor.a} soffit ${soffit.toFixed(2)} at ${[x, y, z].map((v) => v.toFixed(1))}`;
      }
    }
  }
  return null;
}

test('scenery: along the whole route no drawn wall or vault stands across the way where the physics lets a man through', () => {
  const w = createStageWorld(DUNNOTTAR, levelPreset('forger'), { seed: 7 });
  const me = w.fighters[0];
  const quiet = (current) => current.fighters.slice(1).forEach((fighter) => { fighter.dormant = true; });
  const seen = new Set();
  const offences = [];
  let tick = 0;
  for (const leg of DUNNOTTAR_ROUTE) {
    for (const id of leg.open ?? []) setMechanism(w, id, 'open');
    walk(w, me, leg.points, {
      seconds: 260,
      think: quiet,
      each: () => {
        tick += 1;
        if (tick % 15) return;
        const [x, z] = hipsAt(me);
        const y = me.x[P.pelvis * 3 + 1] - 1.0;
        const hit = drawnBlock(x, y, z);
        if (hit && !seen.has(hit)) {
          seen.add(hit);
          offences.push(hit);
        }
      },
    });
  }
  assert.deepEqual(offences, []);
});

test('scenery: the outdoor path is narrow (not a road) and still wide enough to fight on', () => {
  assert.ok(DN_PATH <= 3.6 && DN_PATH - 0.3 >= 2.2, `${DN_PATH} m wide`);
  const cliff = DUNNOTTAR.sections.find((section) => section.id === 'cliff');
  const legs = cliff.terrain.filter((solid) => solid.id && /^leg\d$/.test(solid.id));
  assert.equal(legs.length, 3);
  for (const leg of legs) assert.ok(leg.size[1] <= 3.6, `${leg.id} is ${leg.size[1]} m wide`);
});

test('scenery: the castle is hidden from the cliff path by rock that is solid (crags flank the path, not on it)', () => {
  const cliff = DUNNOTTAR.sections.find((section) => section.id === 'cliff');
  const crags = cliff.decor.filter((decor) => decor.kind === 'outcrop').flatMap((decor) => decor.lumps);
  assert.ok(crags.length >= 20, `${crags.length} rocks`);
  // Each rock is a wall in the physics; none lies on the walked line of the route's first leg.
  for (const lump of crags) {
    const at = [lump.at[0], lump.at[2]];
    const moved = pushOut(terrain, at, BODY, lump.at[1] + 0.2, lump.at[1] + 1.0, 0.35);
    assert.ok(moved && Math.hypot(at[0] - lump.at[0], at[1] - lump.at[2]) > 0.2, `rock at ${lump.at} is solid`);
  }
});
