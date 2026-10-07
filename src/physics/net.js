// The retiarius's net: carried in the off hand, thrown open over a man,
// binding his arms and weapon until he works or cuts himself free.

import { P } from '../body.js';
import { STYLES } from '../moves.js';
import { vec } from '../pose.js';
import { NET } from '../weapons.js';
import { WORLD } from './config.js';
import { capsules, closestBetween, point } from '../physics.js';

// What the net can catch: the head, the trunk and the arms, not the legs.
const CATCHES = new Set(['head', 'trunk', 'lUpperArm', 'rUpperArm', 'lForearm', 'rForearm']);

/** Throw the net at `target`: lobbed from the hand to arrive at his chest, opening as it flies. */
export function castNet(world, fighter, target) {
  if (!fighter.net?.held || fighter.state !== 'up' || fighter.punch) return false;
  const hand = point(fighter.x, P.lHand);
  const aim = vec.lerp(point(target.x, P.neck), point(target.x, P.pelvis), 0.35);
  const to = vec.sub(aim, hand);
  const time = Math.max(0.15, Math.hypot(to[0], to[2]) / NET.speed);
  fighter.net.held = false;
  world.nets ??= [];
  world.nets.push({ id: world.nets.length, owner: fighter.id, corner: fighter.corner, x: hand, v: [to[0] / time, to[1] / time + 0.5 * WORLD.gravity * time, to[2] / time], age: 0, state: 'flying', target: null });
  // Both hands for the trident now.
  if (fighter.weapon?.held && STYLES[fighter.style]?.net) fighter.style = 'tridentTwo';
  world.events.push({ time: world.time, kind: 'netCast', fighter: fighter.id, effects: ['casts the net'] });
  return true;
}

/** Nets in flight: over a man of the other side, they bind him; short, they fall. Bound men work free. */
export function flyNets(world, dt) {
  for (const net of world.nets) {
    if (net.state === 'flying') flyNet(world, net, dt);
    else if (net.state === 'wrapped') holdNet(world, net, dt);
    else net.age += dt;
  }
}

function flyNet(world, net, dt) {
  net.age += dt;
  net.v[1] -= WORLD.gravity * dt;
  net.x = vec.add(net.x, vec.scale(net.v, dt));
  const open = NET.radius * Math.min(1, 0.25 + net.age / NET.open);
  for (const other of world.fighters) {
    if (other.corner === net.corner || other.state !== 'up' || other.netted) continue;
    for (const capsule of capsules(other)) {
      if (!CATCHES.has(capsule.key)) continue;
      const meet = closestBetween(net.x, net.x, point(other.x, capsule.a), point(other.x, capsule.b));
      if (vec.length(vec.sub(meet.onFirst, meet.onSecond)) > open * 0.7 + capsule.radius) continue;
      net.state = 'wrapped';
      net.target = other.id;
      other.netted = { net: net.id, t: 0 };
      // Whatever blow he had begun is caught up in it.
      other.punch = null;
      other.defence = null;
      world.events.push({ time: world.time, kind: 'netted', fighter: other.id, attacker: net.owner, effects: ['caught in the net'] });
      return;
    }
  }
  if (net.x[1] <= 0.03 || net.age > NET.flightMax) land(net);
}

/** On a man: it goes where he goes; he works at it, faster with an edge to cut it. */
function holdNet(world, net, dt) {
  const man = world.fighters[net.target];
  net.x = vec.lerp(point(man.x, P.neck), point(man.x, P.pelvis), 0.4);
  man.netted.t += dt;
  const weapon = man.weapon?.held ? man.weapon.spec : null;
  const edged = weapon && Object.values(weapon.harm).some((mix) => (mix.cut ?? 0) + (mix.pierce ?? 0) > 0.5);
  const rate = NET.freeRate * (edged ? NET.bladeFree : 1);
  if (man.state === 'out' || world.random() < rate * dt) {
    man.netted = null;
    net.x = [net.x[0], 0.02, net.x[2]];
    land(net);
    if (man.state !== 'out') world.events.push({ time: world.time, kind: 'freed', fighter: man.id, effects: [edged ? 'cuts himself free' : 'throws off the net'] });
  }
}

function land(net) {
  net.state = 'ground';
  net.v = [0, 0, 0];
  net.x = [net.x[0], 0.02, net.x[2]];
  net.age = 0;
}
