// The press of a crowd (WORLD.press): men in body contact carry force from one to the next, so the ranks behind bear on
// the men in front.
//
// The contacts are the touches pushApart (physics.js) finds between trunks and shoulders, kept for the step as a level
// normal per pair (recordContact): in a big fight only the men near the fighting are in the physics, and they are the
// ones a press can be on (a proxy in the ranks touches nobody). Each step (solvePress), from the last step's contacts:
//  - every man stepping into a man before him drives (his legs' `push` of his weight along his way: pressDrive, set by
//    moveRoot from the way he wants to go); a man standing holds what bears on him with his feet, up to the ground's grip
//    on his weight (gripOf); on a slope his weight's pull along it bears on him too, and goes on down it with the rest.
//  - what bears on a man and is not held (or is driven on) goes on to the men before him along their contacts, shared by
//    how squarely each lies along it; a few Gauss-Seidel passes a step carry it through the pack.
//  - what goes on to nobody drives the man himself: it is his knock (WORLD.balance), as any shove, and past what his legs
//    hold he goes over (physics.js checkBalance), borne down by the press.
// Each man is left a `press`: how much of his hold bears on him (`load`), how many bodies touch him, and the contacts
// themselves (level unit normals from him to each), which keep him from stepping back into a man bearing on him (blockStep:
// hemmed in, he cannot step back) and blind his footing over a man lying under him (physics.js footDown).

import { WORLD } from './config.js';

/** A fresh press record (one per fighter, reused). */
export function pressRecord() {
  return { load: 0, count: 0, others: [], nx: [], nz: [], fx: 0, fz: 0, tx: 0, tz: 0, dx: 0, dz: 0, knock: 0 };
}

/** The step's contacts, kept on the world and filled by recordContact (cleared by solvePress once read). */
function contactsOf(world) {
  world.press ??= { pairs: new Map(), list: [] };
  return world.press;
}

/**
 * Two bodies touching this substep (pushApart's deepest body touch), `normal` the unit from the second to the first.
 * Each pair is kept once a step, at its deepest.
 */
export function recordContact(world, first, second, normal, depth) {
  const press = contactsOf(world);
  const low = first.id < second.id ? first : second;
  const high = low === first ? second : first;
  const key = low.id * 65536 + high.id;
  const level = Math.hypot(normal[0], normal[2]);
  if (level < 1e-6) return;
  // (Stored from the lower id to the higher.)
  const sign = first === low ? -1 : 1;
  const known = press.pairs.get(key);
  if (known) {
    if (depth <= known.depth) return;
    known.depth = depth;
    known.nx = (sign * normal[0]) / level;
    known.nz = (sign * normal[2]) / level;
    return;
  }
  const entry = { a: low, b: high, nx: (sign * normal[0]) / level, nz: (sign * normal[2]) / level, depth };
  press.pairs.set(key, entry);
  press.list.push(entry);
}

/** Whether a man takes part in a press: on his feet, on the ground (not a rider, not crawling, not in the air). */
function standing(fighter) {
  return fighter.state === 'up' && !fighter.mount && !fighter.crawling && !fighter.air && !fighter.dormant;
}

/** The floor's slope under him: rise per metre along x and z (0 off terrain). */
export function slopeOf(fighter) {
  return fighter.groundSlope ?? ZERO_SLOPE;
}
const ZERO_SLOPE = [0, 0];

/** The grip of his feet (N): the ground's on his weight (μ m g cos θ on a slope), as strong as his legs (`footing`, checkBalance's). */
export function gripOf(fighter, footing) {
  const [sx, sz] = slopeOf(fighter);
  return fighter.body.massKg * WORLD.gravity * WORLD.crash.brace.grip * footing / Math.sqrt(1 + sx * sx + sz * sz);
}

/** The slope's fall along the level unit (ux, uz) under him: sin θ that way (+ where it runs downhill, 0 off terrain). */
export function slopeFall(fighter, ux, uz) {
  const [sx, sz] = slopeOf(fighter);
  if (!sx && !sz) return 0;
  const grade = -(sx * ux + sz * uz);
  return grade / Math.sqrt(1 + grade * grade);
}

/**
 * The share of his feet's hold on the flat left to him against a push along the level unit (ux, uz) on a slope: his grip
 * (μ cos θ of his weight) less his weight's own pull down the slope that way (sin θ), over μ: 1 on the flat, less for a
 * push from above (on a 20% slope, 0.7 grip: ~0.72), more for one from below (~1.27). The man above is the harder to shove
 * back up the hill, and shoves down it the easier (physics.js groundBrace).
 */
export function slopeHold(fighter, ux, uz) {
  const [sx, sz] = slopeOf(fighter);
  if (!sx && !sz) return 1;
  const grip = WORLD.crash.brace.grip;
  return Math.max(0, (grip / Math.sqrt(1 + sx * sx + sz * sz) - slopeFall(fighter, ux, uz)) / grip);
}

/**
 * The step's press: from the contacts of the step before and each man's drive, the force carried through the pack, and the
 * knock it gives the men it is not passed on from. `footingOf(fighter)` is checkBalance's footing (strong legs, gear).
 */
export function solvePress(world, dt, footingOf) {
  const press = contactsOf(world);
  const fighters = world.fighters;
  for (const fighter of fighters) {
    const record = fighter.press;
    if (!record || (!record.count && !record.load && !record.knock)) continue;
    record.count = 0;
    record.others.length = 0;
    record.nx.length = 0;
    record.nz.length = 0;
    record.load = 0;
    record.knock = 0;
  }
  const list = press.list;
  if (!list.length) return;
  // The men in it: each with his contacts, his drive and his hold.
  const members = [];
  for (const contact of list) {
    const { a, b } = contact;
    if (!standing(a) || !standing(b)) continue;
    for (const [man, other, sign] of [[a, b, 1], [b, a, -1]]) {
      const record = (man.press ??= pressRecord());
      if (!record.count) {
        members.push(man);
        record.fx = record.fz = record.tx = record.tz = 0;
      }
      record.count += 1;
      record.others.push(other);
      record.nx.push(sign * contact.nx);
      record.nz.push(sign * contact.nz);
    }
  }
  press.pairs.clear();
  list.length = 0;
  if (!members.length) return;
  const spec = WORLD.press;
  const footings = members.map(footingOf);
  for (let sweep = 0; sweep < spec.sweeps; sweep += 1) {
    for (let m = 0; m < members.length; m += 1) {
      const man = members[m];
      const record = man.press;
      // What bears on him: what the men touching him pass on to him, and his own weight along a slope.
      let lx = 0;
      let lz = 0;
      for (let k = 0; k < record.count; k += 1) {
        const other = record.others[k].press;
        // (From the other to him: the other's normal to him is minus his to the other.)
        const along = -(other.tx * record.nx[k] + other.tz * record.nz[k]);
        if (along <= 0) continue;
        lx -= record.nx[k] * along * shareOf(other, -record.nx[k], -record.nz[k]);
        lz -= record.nz[k] * along * shareOf(other, -record.nx[k], -record.nz[k]);
      }
      record.fx = lx;
      record.fz = lz;
      const weight = man.body.massKg * WORLD.gravity;
      const [sx, sz] = slopeOf(man);
      const steep = Math.hypot(sx, sz);
      const pull = steep > 1e-6 ? weight * steep / Math.sqrt(1 + steep * steep) : 0;
      let nx = lx - (pull * sx) / Math.max(steep, 1e-6);
      let nz = lz - (pull * sz) / Math.max(steep, 1e-6);
      const drive = Math.hypot(record.dx, record.dz);
      if (drive > 0) {
        // Driving: his feet push him on along his way; what bears against it is held by what grip his drive leaves.
        const ux = record.dx / drive;
        const uz = record.dz / drive;
        const against = -(nx * ux + nz * uz);
        const held = Math.min(Math.max(0, against), Math.max(0, gripOf(man, footings[m]) - drive));
        nx += record.dx + ux * held;
        nz += record.dz + uz * held;
      } else {
        // Standing: his feet hold it, up to their grip that way.
        const size = Math.hypot(nx, nz);
        const hold = gripOf(man, footings[m]);
        const left = size > hold ? 1 - hold / size : 0;
        nx *= left;
        nz *= left;
      }
      record.tx = nx;
      record.tz = nz;
    }
  }
  // What each man bears, and what he passes on to nobody: that drives him (his knock).
  for (let m = 0; m < members.length; m += 1) {
    const man = members[m];
    const record = man.press;
    const borne = Math.hypot(record.fx, record.fz);
    const size = Math.hypot(record.tx, record.tz);
    record.load = borne / Math.max(1e-6, gripOf(man, footings[m]));
    if (size < 1e-9) continue;
    let passed = 0;
    for (let k = 0; k < record.count; k += 1) passed += Math.max(0, (record.tx * record.nx[k] + record.tz * record.nz[k]) / size) * shareOf(record, record.nx[k], record.nz[k]);
    const free = size * Math.max(0, 1 - passed);
    // (Not a man he is driving on himself with nothing before him: that is his own walk, not a shove.)
    if (free < 1e-6 || borne < 1e-6) continue;
    const fromOthers = Math.min(free, borne);
    const kick = (fromOthers / (WORLD.balance.massShare * man.body.massKg)) * dt;
    man.knock[0] += (record.tx / size) * kick;
    man.knock[2] += (record.tz / size) * kick;
    record.knock = kick;
  }
}

/**
 * The share of a man's onward force (tx, tz) that goes to the contact along the unit (ux, uz): its squareness along the
 * force over the squareness of all his contacts (the force goes to the men it points at).
 */
function shareOf(record, ux, uz) {
  const size = Math.hypot(record.tx, record.tz);
  if (size < 1e-9) return 0;
  const tx = record.tx / size;
  const tz = record.tz / size;
  const mine = Math.max(0, tx * ux + tz * uz);
  if (mine === 0) return 0;
  let total = 0;
  for (let k = 0; k < record.count; k += 1) total += Math.max(0, tx * record.nx[k] + tz * record.nz[k]);
  return total > 0 ? mine / total : 0;
}

/**
 * His drive into the press, from the way he wants to go (`wanted`, level m/s) and his footwork's pace: `push` of his weight,
 * as much of it as he is trying to go (a man walking on at a stroll leans in less than one trying to get through).
 */
export function setDrive(fighter, wanted, pace) {
  const record = (fighter.press ??= pressRecord());
  const speed = Math.hypot(wanted[0], wanted[1]);
  if (speed < 1e-6 || pace <= 0) {
    record.dx = record.dz = 0;
    return;
  }
  const force = WORLD.press.push * fighter.body.massKg * WORLD.gravity * Math.min(1, speed / pace);
  record.dx = (wanted[0] / speed) * force;
  record.dz = (wanted[1] / speed) * force;
}

/**
 * His steps back kept out of a body that bears on him (`wanted`, level m/s, changed in place; `facing`, his level unit): a
 * man pushing on him from behind (or beside) stands where he would step, and the way back into him is open only as fast as
 * that man is going from him. Hemmed in, he cannot step back out of the fight. A step forward into a man is a shove, as
 * bodies shove (pushApart), and a step back from a man standing idle behind him shoulders him aside.
 */
export function blockStep(fighter, wanted, facing) {
  const record = fighter.press;
  if (!record?.count) return;
  for (let k = 0; k < record.count; k += 1) {
    const nx = record.nx[k];
    const nz = record.nz[k];
    // (Only behind or beside him: a man before him is his to shove.)
    if (nx * facing[0] + nz * facing[2] > 0) continue;
    const other = record.others[k];
    const bears = -((other.press?.tx ?? 0) * nx + (other.press?.tz ?? 0) * nz);
    if (bears <= 0) continue;
    const into = wanted[0] * nx + wanted[1] * nz;
    const away = Math.max(0, (other.rootVelocity?.[0] ?? 0) * nx + (other.rootVelocity?.[1] ?? 0) * nz);
    if (into <= away) continue;
    wanted[0] -= (into - away) * nx;
    wanted[1] -= (into - away) * nz;
  }
}

/** Whether he is carried by the press, not choosing his steps (WORLD.press blindFrom). */
export function carried(fighter) {
  return (fighter.press?.load ?? 0) >= WORLD.press.blindFrom;
}

/** Whether he is hemmed in: two or more bodies touching him. */
export function hemmed(fighter) {
  return (fighter.press?.count ?? 0) >= 2;
}
