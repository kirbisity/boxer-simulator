// The whip's thong (WHIP): a rope of links hung from the end of the handle,
// lighter toward the tip, stepped with the bodies (Verlet, links of fixed
// length, drag, the floor). A snap of the handle runs out along it and the
// tip goes far faster than the hand. The tip striking a man lashes him:
// its small mass at its speed, through what he wears (armour takes nearly
// all of it); hard enough on the skin, he may go to his knees with the pain.

import { P } from '../body.js';
import { vec } from '../pose.js';
import { WHIP } from '../weapons.js';
import { WORLD } from './config.js';
import { addDamage, capsuleEnds, capsules, closestBetween, point, protectionAt, shieldDisc, stagger, wound } from '../physics.js';

/** A thong hung from the handle's end, straight down off it, at rest. */
function makeRope(weapon, spec) {
  const count = spec.links + 1;
  const linkLength = spec.length / spec.links;
  const x = new Float64Array(count * 3);
  // Each link's mass falls from the handle to `taper` of it at the tip; a particle carries half of each link beside it.
  const linkMass = Array.from({ length: spec.links }, (_, index) => 1 - (1 - spec.taper) * (index / Math.max(1, spec.links - 1)));
  const total = linkMass.reduce((sum, value) => sum + value, 0);
  const mass = new Float64Array(count);
  linkMass.forEach((share, index) => {
    const kg = (share / total) * spec.massKg;
    mass[index] += kg / 2;
    mass[index + 1] += kg / 2;
  });
  const inverse = mass.map((kg, index) => (index === 0 ? 0 : 1 / kg));
  for (let index = 0; index < count; index += 1) {
    const at = vec.add(weapon.tip, vec.add(vec.scale(weapon.dir, Math.min(index, 2) * linkLength), [0, -Math.max(0, index - 2) * linkLength, 0]));
    x.set(at, index * 3);
  }
  return { x, prev: x.slice(), mass, inverse, linkLength, count, lashed: new Map() };
}

/** Step every whip's thong `h` s: the root on the handle's end, the rest free. */
export function stepWhips(world, h) {
  for (const fighter of world.fighters) {
    const weapon = fighter.weapon;
    if (!weapon?.held || !weapon.spec.rope) continue;
    const spec = weapon.spec.rope;
    const rope = (weapon.rope ??= makeRope(weapon, spec));
    const { x, prev, inverse, linkLength, count } = rope;
    const keep = Math.exp(-spec.drag * h);
    for (let index = 1; index < count; index += 1) {
      for (let axis = 0; axis < 3; axis += 1) {
        const at = index * 3 + axis;
        const moving = (x[at] - prev[at]) * keep;
        prev[at] = x[at];
        x[at] += moving - (axis === 1 ? WORLD.gravity * h * h : 0);
      }
    }
    prev.set(x.subarray(0, 3), 0);
    x.set(weapon.tip, 0);
    for (let pass = 0; pass < spec.passes; pass += 1) {
      for (let index = 0; index < count - 1; index += 1) {
        const a = index * 3;
        const b = a + 3;
        const dx = x[b] - x[a];
        const dy = x[b + 1] - x[a + 1];
        const dz = x[b + 2] - x[a + 2];
        const length = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const wa = inverse[index];
        const wb = inverse[index + 1];
        const share = (length - linkLength) / length / (wa + wb);
        x[a] += dx * share * wa; x[a + 1] += dy * share * wa; x[a + 2] += dz * share * wa;
        x[b] -= dx * share * wb; x[b + 1] -= dy * share * wb; x[b + 2] -= dz * share * wb;
      }
    }
    for (let index = 1; index < count; index += 1) {
      const at = index * 3;
      if (x[at + 1] < 0.01) {
        x[at + 1] = 0.01;
        prev[at] += (x[at] - prev[at]) * 0.6;
        prev[at + 2] += (x[at + 2] - prev[at + 2]) * 0.6;
      }
    }
    lash(world, fighter, rope, spec, h);
  }
}

/** The tip's last links, moving fast enough, into a man of the other side (or his shield). */
function lash(world, fighter, rope, spec, h) {
  const { x, prev, mass, count } = rope;
  const reach = fighter.weapon.spec.reach + 1.5;
  const hips = point(fighter.x, P.pelvis);
  for (let index = count - spec.tipLinks; index < count; index += 1) {
    const at = index * 3;
    const to = [x[at], x[at + 1], x[at + 2]];
    const from = [prev[at], prev[at + 1], prev[at + 2]];
    const speed = vec.length(vec.sub(to, from)) / h;
    if (speed < spec.lashFrom) continue;
    for (const other of world.fighters) {
      if (other.corner === fighter.corner || other.state === 'out') continue;
      if (Math.hypot(other.x[P.pelvis * 3] - hips[0], other.x[P.pelvis * 3 + 2] - hips[2]) > reach) continue;
      // One lash to a man each stroke.
      if (world.time - (rope.lashed.get(other.id) ?? -Infinity) < 0.4) continue;
      if (other.shield) {
        const disc = shieldDisc(other);
        const offset = vec.sub(to, disc.centre);
        if (Math.abs(vec.dot(offset, disc.normal)) < 0.05 && vec.length(offset) < disc.radius) {
          rope.lashed.set(other.id, world.time);
          world.events.push({ time: world.time, kind: 'blocked', attacker: fighter.id, defender: other.id, weapon: 'whip', target: 'shield', speed, impulse: 0, force: 0, headDeltaV: 0, point: to, normal: disc.normal, effects: ['the lash on the shield'] });
          continue;
        }
      }
      for (const capsule of capsules(other)) {
        const [a, b] = capsuleEnds(other, capsule);
        const meet = closestBetween(from, to, a, b);
        if (vec.length(vec.sub(meet.onFirst, meet.onSecond)) > capsule.radius + 0.01) continue;
        rope.lashed.set(other.id, world.time);
        // What strikes: the tip's last links.
        let tipKg = 0;
        for (let link = count - spec.tipLinks; link < count; link += 1) tipKg += mass[link];
        lashHit(world, fighter, other, capsule.key, tipKg, speed, meet.onSecond, vec.normalize(vec.sub(to, from)));
        break;
      }
    }
  }
}

/** A lash lands: its energy, less what is worn there, a shallow cut and the sting; enough of it, and he goes to his knees. */
function lashHit(world, attacker, defender, key, tipKg, speed, at, dir) {
  const spec = WHIP;
  const energy = 0.5 * tipKg * speed * speed;
  const protection = protectionAt(defender.body.gear, key);
  const through = energy * (1 - (protection.cut ?? 0)) * (1 - 0.5 * (protection.blunt ?? 0));
  const event = { time: world.time, kind: 'landed', attacker: attacker.id, defender: defender.id, weapon: 'whip', mode: 'swing', punch: 'lash', target: key, speed, impulse: tipKg * speed, force: 0, headDeltaV: 0, harm: 0, cut: through, energy, point: at, normal: vec.scale(dir, -1), effects: [] };
  if (through < 0.5) {
    event.effects.push('the lash turned by what he wears');
    world.events.push(event);
    return;
  }
  event.effects.push(through > spec.painSure * 0.6 ? 'a hard lash' : 'lashed');
  wound(defender, 'cut', through * spec.cutShare, key, attacker);
  addDamage(defender, key, through / 40, false);
  // The tip's momentum into the part it struck.
  const capsule = capsules(defender).find((entry) => entry.key === key);
  if (capsule) world.pendingImpulses.push({ fighter: defender, shares: [[capsule.a, 0.5], [capsule.b, 0.5]], direction: dir, impulse: tipKg * speed * spec.impact });
  world.events.push(event);
  // The pain: likelier to put him on his knees the harder it was; short of that, he reels from it.
  const chance = Math.max(0, Math.min(0.9, (through - spec.painFrom) / (spec.painSure - spec.painFrom)));
  if (defender.state === 'up' && !defender.pain && world.random() < chance) startPain(world, defender, key);
  else if (through > spec.painFrom * spec.staggerFrom) stagger(world, defender, spec.staggerSeverity + spec.staggerPerPain * (through / spec.painFrom), event, true);
}

/** Down on his knees with the pain, a hand to where it struck; he will get up (WHIP.kneelSeconds, riseSeconds). */
export function startPain(world, fighter, key) {
  fighter.pain = { t: 0, key };
  fighter.punch = null;
  fighter.defence = null;
  fighter.rush = null;
  fighter.running = false;
  world.events.push({ time: world.time, kind: 'pain', fighter: fighter.id, effects: ['goes to his knees with the pain'] });
}

/** How far down on his knees he is (0..1): down quickly, up again after a while; null once he is up. */
export function painShare(fighter) {
  const pain = fighter.pain;
  if (!pain) return 0;
  if (pain.t < WHIP.kneelSeconds) return Math.min(1, pain.t / 0.25);
  return Math.max(0, 1 - (pain.t - WHIP.kneelSeconds) / WHIP.riseSeconds);
}
