// Artillery: guns that stand on the ground as things of their own, served by a crew of men of the battle (a level's
// `artillery`: createWorld's option), and what their shot does. A gun is laid on a mark (turned at the rate its mount and
// its men can turn it), fired when it bears and a charge is in it, and charged again as fast as its crew can do it; it
// works only while its crew stand at it (cut down, broken, drawn off into the fight, it is silent; overrun, it is the
// enemy's to stand by). Its shot is a ball (one solid shot) or canister (many small balls in a cone), each ball flying
// on its own under gravity and the air's drag, and every ball meets bodies, horses, works and the ground as physics:
//
//  - A ball in a body: the drag of tissue on a sphere (ρ ≈ 1,060 kg/m³, soft tissue; the drag coefficient of a sphere,
//    ~0.47) takes its energy as it goes, dE/dx = −ρ·Cd·A/m · E, so through a path of L m of a man it keeps exp(−ρ·Cd·A·L/m)
//    of its energy and leaves the rest in him; his armour takes what it is proof against (outfits' bullet protection:
//    physics/ranged.js bulletProof's rating) on top. What is left goes on into the next man on its line: a heavy ball
//    (much mass behind a small face) ploughs through a file, a light one is stopped by a man or two. The wound is the
//    game's one wound model (physics/ranged.js bulletHit), its figures those of a matchlock ball scaled by the energy left
//    in him against the energy a matchlock's ball (MATCHLOCK, its ~1 kJ, a 25 g lead ball) leaves along the same path:
//    the matchlock's table is for what its ball does, and a ball that leaves sixteen times the energy does more than
//    that, which past what kills is the same death. A limb it passes through is shattered.
//  - The ground: a ball coming down at a shallow slant grazes and bounds on (ricochet: the round shot's way of reaching
//    the ranks behind the first), keeping part of its speed; steeper, it buries itself.
//  - The works: physics/cover.js screens (a wall's stone stops it; a daub screen takes what it costs to go through).
//
// The guns, and every figure, are from the sources below each (the Ming's own manuals where they give one, else what
// is known of such pieces, said as such). Ball weights where the source gives only the gun's: a piece's ball scales
// with its weight (殊域周咨录's folangji: the largest, 1,000+ jin, fired a ball of 8 jin, ~125 : 1).

import { P } from '../body.js';
import { capsules, closestBetween, point } from '../physics.js';
import { soundEvent } from '../audio/log.js';
import { OUTFITS, outfitOf } from '../outfits.js';
import { vec } from '../pose.js';
import { ARROW, bulletRegion, GUN, MATCHLOCK } from '../weapons.js';
import { bulletHit, horseOnPath, missileInHorse } from './ranged.js';
import { screenOnPath } from './cover.js';
import { reliefAt, worksOf } from './fieldworks.js';

/** The Ming jin (斤) in kg (~590 g in the Wanli years). */
const MING_JIN = 0.59;

export const ARTILLERY = {
  gravity: 9.81,
  // Tissue's drag on a ball (above): soft tissue's density (kg/m³, ICRP reference man ~1,060) and a sphere's drag
  // coefficient at a ball's speeds in water (~0.47, the textbook sphere's).
  tissue: { density: 1060, drag: 0.47 },
  // The air's on a ball in flight (kg/m³ at a spring day's ~10 °C; the same sphere's drag coefficient): a 14 g canister
  // ball loses a tenth of its speed in 30 m, a 5 kg round shot almost nothing.
  air: { density: 1.25, drag: 0.47 },
  // Iron's density (kg/m³), for a ball's size from its weight (a lead-cased iron ball, as the folangji's, a little smaller).
  iron: 7870,
  // A matchlock's ball, the wound table's own (weapons.js MATCHLOCK: ~1 kJ): ~25 g of lead (a Ming bird gun's three qian is
  // ~11 g, a Japanese 6-monme ~23 g, a large bore's 10-monme ~38 g; the middle of them).
  referenceBall: { kg: 0.025, density: 11340 },
  // The ground (a graze): a ball meeting it at less than `graze` rad below the level bounds on, `keep` of its speed along and
  // `bounce` of it upward (the round shot's ricochet over firm, flat ground: a ball fired level grazed and bounded on for
  // hundreds of metres; the share lost at each graze is an estimate, the ball ploughing a furrow). Steeper, it buries.
  graze: 0.17,
  keep: 0.7,
  bounce: 0.35,
  // m/s: a ball slower than this has nothing left that the game counts (a spent ball rolling still broke legs: not modelled).
  spent: 40,
  // m: a ball this far off the field is gone.
  far: 90,
  // A man of the crew is at his gun within `at` m of his post (his post `postBack` m behind its breech and `postSide` m to
  // one side, each in turn); he leaves it to fight a man come within `defendWithin` m of him.
  at: 1.2,
  postBack: 0.9,
  postSide: 0.8,
  defendWithin: 2.6,
  // A mark is picked again every `pick` s; a gun fires when laid within `laid` rad of it. Its own men within `lane` m of
  // the line before the mark foul it (the gunner holds his fire: half a man's breadth and the ball's lay error clear of him). Canister is loaded for marks within its `canisterWithin`.
  pick: 1,
  laid: 0.012,
  lane: 0.6,
  // The guns.
  pieces: {
    // 佛郎机 (folangji), the breech-loading swivel gun: a long barrel taking pre-charged chambers (子铳) dropped into its open
    // breech and wedged, so it fires as fast as a chamber can be swapped while the spent ones are charged again. Mingshi 92
    // (兵志四): "大者重千余斤，小者百五十斤 … 以子铳五枚，贮药置腹中". This is a small one, on its swivel: 150 jin (~89 kg),
    // five chambers. Its ball by the 125 : 1 of the largest (殊域周咨录): ~1.2 jin, ~0.7 kg, lead over iron. Canister (群子):
    // the ball's weight in small iron balls of ~14 g (the size of 無敌大将军's, below): ~50.
    folangji: {
      kg: 150 * MING_JIN,
      chambers: 5,
      ballKg: (150 / 125) * MING_JIN,
      canister: { pellets: 50, pelletKg: 0.014, cone: 0.045 },
      // m/s: the source gives none. A short-chambered breech-loader leaks gas at the chamber's joint; ~300 m/s is under the
      // 400-450 m/s of a long European culverin of the time (Hall, Weapons and Warfare in Renaissance Europe, 1997).
      velocity: 300,
      // s to knock out the wedge, lift out the spent chamber, drop in a charged one, wedge it and prime (an estimate: the
      // breech-loader's whole point, several shots a minute), and to charge a spent chamber (powder, wad, ball rammed: about
      // a matchlock's 15 s and twice it for the bigger charge).
      swapSeconds: 8,
      chargeSeconds: 30,
      // rad/s: swung on its pin by the tiller, as fast as a man turns a long gun; rad of laying error (σ: ~1 m at 100 m).
      traverse: 0.8,
      spread: 0.01,
      // m: its muzzle's height on its trestle or cart's side; its barrel's length (the muzzle ahead of its pivot).
      muzzleUp: 1,
      length: 1.6,
      crew: 2,
      // Charges carried with it (an estimate: the source counts guns, not their powder; a cart's day of fighting).
      rounds: 24,
      canisterWithin: 45,
      range: 300,
    },
    // 無敌大将军 (the "invincible great general"), Qi Jiguang's heavy breech-loader for his cart camps (练兵杂纪 / 练兵实纪
    // 杂集, as given in Great Ming Military, "Breech-loading cannons of the Ming dynasty", 2015): 1,050 jin (~620 kg), three
    // chambers, each charged with a heavy ball and 365 iron pellets (its canister). Its ball by the 125 : 1: ~8.4 jin, ~5 kg;
    // its pellets the ball's weight in 365: ~14 g each.
    dajiangjun: {
      kg: 1050 * MING_JIN,
      chambers: 3,
      ballKg: (1050 / 125) * MING_JIN,
      canister: { pellets: 365, pelletKg: ((1050 / 125) * MING_JIN) / 365, cone: 0.05 },
      // m/s: none given; a heavier charge in a stouter chamber than the folangji's (an estimate).
      velocity: 330,
      // s: a 50-80 kg chamber lifted in and out by two men (Shen Fei Pao's chambers, Jun Qi Tu Shuo: 80 jin), and charged.
      swapSeconds: 20,
      chargeSeconds: 60,
      // rad/s: a 620 kg gun on its cart, turned by handspikes at its trail (an estimate: a quarter turn in some 20 s).
      traverse: 0.08,
      spread: 0.008,
      muzzleUp: 0.9,
      length: 2,
      crew: 4,
      rounds: 12,
      canisterWithin: 60,
      range: 600,
    },
  },
};

/** A ball's radius (m) and frontal area (m²) from its mass (iron, or the reference's lead). */
function ballShape(kg, density = ARTILLERY.iron) {
  const radius = Math.cbrt((3 * kg) / (4 * Math.PI * density));
  return { radius, area: Math.PI * radius * radius };
}

/** The energy (J) a ball of `kg` and `area` with `joules` leaves in `path` m of tissue (and the share it keeps). */
export function tissueLoss(kg, area, joules, path) {
  const spec = ARTILLERY.tissue;
  const kept = Math.exp((-spec.density * spec.drag * area * path) / kg);
  return { left: joules * (1 - kept), kept };
}

/** What the reference matchlock ball (the wound table's) leaves along the same path: what the table's figures are for. */
function ballReferenceLoss(path) {
  const spec = ARTILLERY.referenceBall;
  const { area } = ballShape(spec.kg, spec.density);
  return tissueLoss(spec.kg, area, MATCHLOCK.energy, path).left;
}

/**
 * The world's guns from a level's `artillery` ([{ kind, at: [x, z], facing: [dx, dz], arc (rad either side of it), crew:
 * [fighter ids], load ('ball' | 'canister' | 'auto') }]), or null for none. Each crew man is marked to his gun (`gunCrew`).
 */
export function createArtillery(world, pieces) {
  if (!pieces?.length) return null;
  const made = pieces.map((piece, index) => {
    const spec = ARTILLERY.pieces[piece.kind];
    const facing = Math.atan2(piece.facing?.[1] ?? 0, piece.facing?.[0] ?? 1);
    const crew = (piece.crew ?? []).filter((id) => world.fighters[id]);
    for (const id of crew) world.fighters[id].gunCrew = index;
    return {
      index, kind: piece.kind, spec, at: [...piece.at], facing, arc: piece.arc ?? Math.PI, bearing: facing, elevation: 0,
      crew, load: piece.load ?? 'auto', corner: piece.corner ?? world.fighters[crew[0]]?.corner ?? 'red',
      // Chambers charged and waiting, spent ones to charge again, one in the breech (charged) or not.
      ready: spec.chambers - 1, spent: 0, seated: true, swapping: 0, charging: 0, rounds: (piece.rounds ?? spec.rounds) - spec.chambers,
      mark: null, markId: null, pickIn: 0, recoil: 0, shots: 0, hits: 0, kills: 0, firedAt: -Infinity, served: 0,
    };
  });
  return { pieces: made, balls: [] };
}

/** Whether a crew man is fit to serve: on his feet, not broken, not off the field. */
const crewFit = (fighter) => fighter && fighter.state === 'up' && !fighter.panicked && !fighter.fled && !fighter.crawling;

/** His post at his gun: behind its breech, each man in turn to one side or the other and further back. */
export function postOf(piece, fighter) {
  const spec = ARTILLERY;
  const slot = Math.max(0, piece.crew.indexOf(fighter.id));
  const back = spec.postBack * (1 + Math.floor(slot / 2) * 0.6);
  const side = (slot % 2 ? 1 : -1) * spec.postSide;
  const dir = [Math.cos(piece.bearing), Math.sin(piece.bearing)];
  return [piece.at[0] - dir[0] * back - dir[1] * side, piece.at[1] - dir[1] * back + dir[0] * side];
}

/** The crew men standing at their gun now. */
function gunCrewAt(world, piece) {
  return piece.crew.map((id) => world.fighters[id]).filter((fighter) => crewFit(fighter) && Math.hypot(fighter.root[0] - postOf(piece, fighter)[0], fighter.root[1] - postOf(piece, fighter)[1]) < ARTILLERY.at);
}

/** Whether a crew man stays with his gun: it has charges left, and no enemy is on him. */
export function atGun(world, fighter) {
  const piece = world.artillery?.pieces[fighter.gunCrew];
  if (!piece || piece.rounds + piece.ready + (piece.seated ? 1 : 0) <= 0) return false;
  return !world.fighters.some((other) => other.corner !== fighter.corner && other.corner !== 'grey' && other.state === 'up' && !other.fled && Math.hypot(other.root[0] - fighter.root[0], other.root[1] - fighter.root[1]) < ARTILLERY.defendWithin);
}

/**
 * A crew man's own think (ai.js, before his fighting): with no enemy on him, he goes to his post at the gun and stands
 * there serving it. Returns whether he did (his think is done), or false (he fights as any man: an enemy come within
 * `defendWithin` m, or his gun gone).
 */
export function serveGun(world, fighter) {
  if (!atGun(world, fighter)) return false;
  const piece = world.artillery.pieces[fighter.gunCrew];
  const post = postOf(piece, fighter);
  const apart = Math.hypot(post[0] - fighter.root[0], post[1] - fighter.root[1]);
  fighter.punch = null;
  if (apart > ARTILLERY.at * 0.6) {
    fighter.goTo = [post[0], 0, post[1]];
    fighter.move = 1;
    fighter.running = apart > 4;
  } else {
    fighter.goTo = null;
    fighter.move = 0;
    fighter.faceAt = { at: [piece.at[0] + Math.cos(piece.bearing) * 5, 1, piece.at[1] + Math.sin(piece.bearing) * 5], until: world.time + 0.5 };
  }
  return true;
}

/** The point to lay on in a man: his chest, or if the works hide it, his head; null if neither can be hit from the muzzle. */
function gunMarkIn(world, muzzle, fighter, missile) {
  for (const [part, up] of [['neck', -0.25], ['head', 0]]) {
    const mark = point(fighter.x, P[part]);
    mark[1] += up;
    if (!screenOnPath(world, muzzle, mark, missile)?.stops) return mark;
  }
  return null;
}

/** The gun's muzzle, laid on `bearing` (rad in the floor, from +x toward +z) and `elevation`. */
function gunMuzzle(piece, bearing = piece.bearing, elevation = piece.elevation) {
  const ground = piece.ground ?? 0;
  const spec = piece.spec;
  const flat = Math.cos(elevation) * spec.length * 0.5;
  return [piece.at[0] + Math.cos(bearing) * flat, ground + spec.muzzleUp + Math.sin(elevation) * spec.length * 0.5, piece.at[1] + Math.sin(bearing) * flat];
}

/** Within the gun's arc (rad either side of where it faces). */
const gunInArc = (piece, bearing) => Math.abs(Math.atan2(Math.sin(bearing - piece.facing), Math.cos(bearing - piece.facing))) <= piece.arc;

/**
 * The gun's mark: of the enemy on their feet within its range and arc whose chest or head its ball can reach (the works
 * not in the way) and with none of its own men within `lane` m of the line short of him, the one with the most of his men
 * along the line beyond him (a ball goes on through a file; canister spreads into a knot), the nearer first.
 */
function gunPickMark(world, piece) {
  const spec = piece.spec;
  const muzzle = gunMuzzle(piece);
  const ball = ballShape(spec.ballKg);
  const missile = { area: ball.area, joules: 0.5 * spec.ballKg * spec.velocity ** 2 };
  let best = null;
  for (const enemy of world.fighters) {
    if (enemy.corner === piece.corner || enemy.corner === 'grey' || enemy.state !== 'up' || enemy.fled || enemy.dormant || enemy.hidden) continue;
    const dx = enemy.root[0] - piece.at[0];
    const dz = enemy.root[1] - piece.at[1];
    const apart = Math.hypot(dx, dz);
    if (apart > spec.range || apart < 1.5 || !gunInArc(piece, Math.atan2(dz, dx))) continue;
    const mark = gunMarkIn(world, muzzle, enemy, missile);
    if (!mark) continue;
    const way = [dx / apart, dz / apart];
    let fouled = false;
    let file = 0;
    for (const other of world.fighters) {
      if (other === enemy || other.state === 'out' || other.fled) continue;
      const ox = other.root[0] - piece.at[0];
      const oz = other.root[1] - piece.at[1];
      const along = ox * way[0] + oz * way[1];
      const off = Math.abs(ox * way[1] - oz * way[0]);
      if (other.corner === piece.corner) {
        if (along > 0.5 && along < apart + 1 && off < ARTILLERY.lane && !piece.crew.includes(other.id)) fouled = true;
      } else if (other.state === 'up' && along > apart && off < 0.6 + (along - apart) * spec.canister.cone) file += 1;
    }
    if (fouled) continue;
    const score = file - apart / 1000;
    if (!best || score > best.score) best = { score, enemy, mark, apart };
  }
  return best;
}

/** Each step: every gun served (laid, fired, its chambers swapped and charged), and every ball in the air flown. */
export function stepArtillery(world, dt) {
  const artillery = world.artillery;
  if (!artillery) return;
  for (const piece of artillery.pieces) gunServe(world, piece, dt);
  if (artillery.balls.length) gunFlyBalls(world, dt);
}

function gunServe(world, piece, dt) {
  const spec = piece.spec;
  const works = worksOf(world.arena);
  piece.ground = works ? reliefAt(works, piece.at[0], piece.at[1]) : 0;
  piece.recoil = Math.max(0, piece.recoil - dt * 0.5);
  const men = gunCrewAt(world, piece);
  piece.served = men.length;
  if (!men.length) return;
  // The chambers: a spent one in the breech is swapped for a charged one; a man to spare charges the spent ones.
  if (!piece.seated && piece.ready > 0) {
    piece.swapping += dt;
    if (piece.swapping >= spec.swapSeconds) {
      piece.swapping = 0;
      piece.seated = true;
      piece.ready -= 1;
    }
  }
  const loaders = men.length - (!piece.seated && piece.ready > 0 ? 1 : 0);
  if (piece.spent > 0 && piece.rounds > 0 && loaders > 0) {
    piece.charging += dt;
    if (piece.charging >= spec.chargeSeconds) {
      piece.charging = 0;
      piece.spent -= 1;
      piece.rounds -= 1;
      piece.ready += 1;
    }
  }
  // Laying: on the mark, turned at its rate.
  piece.pickIn -= dt;
  if (piece.pickIn <= 0) {
    piece.pickIn = ARTILLERY.pick;
    const picked = gunPickMark(world, piece);
    piece.mark = picked?.mark ?? null;
    piece.markId = picked?.enemy.id ?? null;
  } else if (piece.markId !== null) {
    const enemy = world.fighters[piece.markId];
    if (enemy.state !== 'up') piece.mark = null;
  }
  if (!piece.mark) return;
  const muzzle = gunMuzzle(piece);
  const dx = piece.mark[0] - piece.at[0];
  const dz = piece.mark[2] - piece.at[1];
  const wanted = Math.atan2(dz, dx);
  const turn = Math.atan2(Math.sin(wanted - piece.bearing), Math.cos(wanted - piece.bearing));
  const rate = spec.traverse * Math.min(1, men.length / Math.max(1, spec.crew - 1));
  piece.bearing += Math.sign(turn) * Math.min(Math.abs(turn), rate * dt);
  // Elevation: on the mark, with its drop over the flight (the quoin is quick).
  const flat = Math.hypot(piece.mark[0] - muzzle[0], piece.mark[2] - muzzle[2]);
  const time = flat / spec.velocity;
  piece.elevation = Math.atan2(piece.mark[1] - muzzle[1] + 0.5 * ARTILLERY.gravity * time * time, flat);
  if (!piece.seated || Math.abs(turn) > ARTILLERY.laid) return;
  firePiece(world, piece, men[0]);
}

/** The gun goes off: its ball or its canister into the air, its chamber spent, its kick. */
export function firePiece(world, piece, gunner, load = null) {
  const spec = piece.spec;
  const random = world.random;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - random() * 0.999999)) * Math.cos(2 * Math.PI * random());
  const apart = piece.mark ? Math.hypot(piece.mark[0] - piece.at[0], piece.mark[2] - piece.at[1]) : Infinity;
  const kind = load ?? (piece.load === 'auto' ? (apart <= spec.canisterWithin ? 'canister' : 'ball') : piece.load);
  const muzzle = gunMuzzle(piece);
  const aim = (bearing, elevation) => [Math.cos(elevation) * Math.cos(bearing), Math.sin(elevation), Math.cos(elevation) * Math.sin(bearing)];
  const bearing = piece.bearing + gauss() * spec.spread;
  const elevation = piece.elevation + gauss() * spec.spread;
  const balls = kind === 'canister' ? spec.canister.pellets : 1;
  const kg = kind === 'canister' ? spec.canister.pelletKg : spec.ballKg;
  const shape = ballShape(kg);
  for (let k = 0; k < balls; k += 1) {
    const dir = kind === 'canister' ? aim(bearing + gauss() * spec.canister.cone, elevation + gauss() * spec.canister.cone) : aim(bearing, elevation);
    world.artillery.balls.push({ x: [...muzzle], v: vec.scale(dir, spec.velocity), kg, radius: shape.radius, area: shape.area, piece: piece.index, gunner: gunner.id, kind, passed: new Set(), done: false, age: 0 });
  }
  piece.seated = false;
  piece.spent += 1;
  piece.shots += 1;
  piece.firedAt = world.time;
  piece.recoil = 1;
  world.events.push({ time: world.time, kind: 'cannon', piece: piece.index, gun: piece.kind, load: kind, attacker: gunner.id, aimedAt: piece.markId, point: muzzle, dir: aim(piece.bearing, piece.elevation), effects: [kind === 'canister' ? 'fires canister' : 'fires a ball'] });
  if (world.ear) soundEvent(world, 'shot', { at: muzzle, kind: 'matchlock', weapon: piece.kind, who: gunner.id });
}

/** Every ball in the air: drag and gravity, then what it meets on this step's way, nearest first, until it is spent. */
function gunFlyBalls(world, dt) {
  const spec = ARTILLERY;
  const works = worksOf(world.arena);
  for (const ball of world.artillery.balls) {
    if (ball.done) continue;
    ball.age += dt;
    const speed = vec.length(ball.v);
    // The air's drag: dv = −(ρ Cd A / 2m) v² dt.
    const drag = (spec.air.density * spec.air.drag * ball.area) / (2 * ball.kg);
    ball.v = vec.scale(ball.v, 1 / (1 + drag * speed * dt));
    ball.v[1] -= spec.gravity * dt;
    let from = ball.x;
    let to = vec.add(ball.x, vec.scale(ball.v, dt));
    // What it meets on the way, one thing at a time (a man, then the man behind him, all in this step's flight).
    for (let guard = 0; guard < 12 && !ball.done; guard += 1) {
      const joules = 0.5 * ball.kg * vec.dot(ball.v, ball.v);
      const body = ballBodyOnPath(world, ball, from, to);
      const horse = horseOnPath(world, null, from, to);
      const screen = screenOnPath(world, from, to, { area: ball.area, joules });
      const ground = ballGroundOnPath(works, from, to);
      const firsts = [body && { s: body.s, what: 'body' }, horse && !ball.passed.has(`h${horse.horse.id}`) && { s: horse.s, what: 'horse' }, screen && { s: screen.s, what: 'screen' }, ground !== null && { s: ground, what: 'ground' }].filter(Boolean).sort((a, b) => a.s - b.s);
      if (!firsts.length) break;
      const first = firsts[0];
      const at = vec.lerp(from, to, first.s);
      if (first.what === 'body') ballInBody(world, ball, body, at);
      else if (first.what === 'horse') ballInHorse(world, ball, horse);
      else if (first.what === 'screen') {
        world.screened += 1;
        if (screen.stops) {
          ball.done = true;
          world.events.push({ time: world.time, kind: 'cannonHit', piece: ball.piece, target: 'works', point: at, effects: ['into the wall'] });
        } else ball.v = vec.scale(ball.v, Math.sqrt(screen.left / joules));
      } else ballGraze(ball, at, works);
      // On from where it met it, the rest of this step's way at the speed it has now.
      const rest = (1 - first.s) * dt;
      from = vec.add(at, vec.scale(ball.v, 1e-4));
      to = vec.add(from, vec.scale(ball.v, rest));
      if (vec.length(ball.v) < spec.spent) ball.done = true;
    }
    ball.x = to;
    if (Math.abs(ball.x[0]) > spec.far || Math.abs(ball.x[2]) > spec.far || ball.x[1] < -1 || ball.age > 6) ball.done = true;
  }
  if (world.artillery.balls.length > 256 && world.artillery.balls.every((ball, index) => index > 64 || ball.done)) world.artillery.balls = world.artillery.balls.filter((ball) => !ball.done);
}

/** Where on the way (share) the ball comes down to the ground (the relief there), or null. */
function ballGroundOnPath(works, from, to) {
  const floor = (p) => (works ? reliefAt(works, p[0], p[2]) : 0);
  const below = (s) => vec.lerp(from, to, s)[1] - floor(vec.lerp(from, to, s));
  if (below(1) > 0) return null;
  if (below(0) <= 0) return 0;
  let low = 0;
  let high = 1;
  for (let k = 0; k < 10; k += 1) {
    const middle = (low + high) / 2;
    if (below(middle) > 0) low = middle;
    else high = middle;
  }
  return high;
}

/** The ball at the ground: a graze (shallow: it bounds on, slower) or buried (steep). */
function ballGraze(ball, at, works) {
  const spec = ARTILLERY;
  const flat = Math.hypot(ball.v[0], ball.v[2]);
  const slant = Math.atan2(-ball.v[1], flat);
  if (slant > spec.graze || flat < spec.spent) {
    ball.done = true;
    return;
  }
  ball.v = [ball.v[0] * spec.keep, Math.abs(ball.v[1]) * spec.bounce + 0.01, ball.v[2] * spec.keep];
  ball.x = at;
  ball.x[1] = (works ? reliefAt(works, at[0], at[2]) : 0) + 0.01;
}

/**
 * The first man on the ball's way not yet gone through, with every part of him it passes through on this line: { s (share
 * of the way to the first), fighter, path (m of him it goes through), part (the capsule it goes through most of), point }.
 */
function ballBodyOnPath(world, ball, from, to) {
  const length = vec.length(vec.sub(to, from));
  if (length < 1e-9) return null;
  const along = vec.scale(vec.sub(to, from), 1 / length);
  let best = null;
  for (const other of world.fighters) {
    if (ball.passed.has(other.id) || other.dormant || other.fled) continue;
    const hips = point(other.x, P.pelvis);
    const t = Math.max(0, Math.min(length, vec.dot(vec.sub(hips, from), along)));
    if (vec.length(vec.sub(hips, vec.add(from, vec.scale(along, t)))) > 1.6) continue;
    let first = Infinity;
    let path = 0;
    let part = null;
    let most = 0;
    let offAxis = 1;
    let alongPart = 0;
    for (const capsule of capsules(other)) {
      const meet = closestBetween(from, to, point(other.x, capsule.a), point(other.x, capsule.b));
      const miss = vec.length(vec.sub(meet.onFirst, meet.onSecond));
      const reach = capsule.radius + ball.radius;
      if (miss > reach) continue;
      // The chord of the part the ball's middle crosses (a ball grazing it cuts the less of it).
      const chord = 2 * Math.sqrt(reach * reach - miss * miss) * (capsule.radius / reach);
      const s = Math.max(0, meet.s - Math.sqrt(reach * reach - miss * miss) / length);
      first = Math.min(first, s);
      path += chord;
      if (chord > most) [most, part, offAxis, alongPart] = [chord, capsule, miss / reach, meet.t];
    }
    if (!part) continue;
    if (!best || first < best.s) best = { s: first, fighter: other, path, part, offAxis, alongPart };
  }
  return best;
}

/** The ball through a man: what it leaves in him by his path through it and what his armour takes; the wound; on through. */
function ballInBody(world, ball, body, at) {
  const victim = body.fighter;
  ball.passed.add(victim.id);
  const joules = 0.5 * ball.kg * vec.dot(ball.v, ball.v);
  const key = body.part.key;
  const region = bulletRegion(key);
  // His armour over that part takes what it is proof against (its rated round's energy, as bulletProof reads it) first.
  const rating = Math.max(OUTFITS[outfitOf(victim.body.inputs).kind]?.bulletRating ?? GUN.energy, GUN.energy);
  const armour = Math.min(joules, (victim.body.gear.protection.bullet?.[region] ?? 0) * rating);
  const loss = tissueLoss(ball.kg, ball.area, joules - armour, body.path);
  const left = Math.max(0, joules - armour - loss.left);
  const speedBefore = Math.sqrt((2 * joules) / ball.kg);
  const speedAfter = Math.sqrt((2 * left) / ball.kg);
  ball.v = vec.scale(ball.v, speedAfter / Math.max(1e-9, speedBefore));
  const piece = world.artillery.pieces[ball.piece];
  const gunner = world.fighters[ball.gunner];
  if (victim.state === 'out') return;
  // The wound: the matchlock ball's, as many times over as this one left more energy in him along the same path.
  const share = loss.left / Math.max(1, ballReferenceLoss(body.path));
  const scaled = (table) => Object.fromEntries(Object.entries(table).map(([part, value]) => [part, value * share]));
  const shot = { energy: joules, lethal: scaled(MATCHLOCK.lethal), bleed: scaled(MATCHLOCK.bleed), limbBreak: 1, impulse: ball.kg * (speedBefore - speedAfter), killedBy: ball.kind === 'canister' ? 'cut down by canister' : 'struck by a cannon ball' };
  const event = { time: world.time, kind: 'shot', attacker: gunner.id, defender: victim.id, weapon: piece.kind, gun: true, load: ball.kind, from: [...ball.x], to: at, target: key, point: at, normal: vec.scale(vec.normalize(ball.v), -1), harm: 0, energy: joules, deposited: loss.left, armourTook: armour, path: body.path, kept: left / Math.max(1e-9, joules), effects: [] };
  world.events.push(event);
  const wasUp = victim.state !== 'out';
  bulletHit(world, gunner, { fighter: victim, capsule: body.part, target: key, throat: false, point: at, offAxis: body.offAxis, along: body.alongPart }, vec.normalize(ball.v.some((value) => value !== 0) ? ball.v : [1, 0, 0]), event, shot);
  piece.hits += 1;
  if (wasUp && victim.state === 'out') piece.kills += 1;
}

/** The ball through a horse (half a metre of its body: its chest or barrel): what it leaves in it, its harm; on through. */
function ballInHorse(world, ball, hit) {
  ball.passed.add(`h${hit.horse.id}`);
  const joules = 0.5 * ball.kg * vec.dot(ball.v, ball.v);
  const loss = tissueLoss(ball.kg, ball.area, joules, 0.5);
  ball.v = vec.scale(ball.v, Math.sqrt(Math.max(0, joules - loss.left) / Math.max(1e-9, joules)));
  // (missileInHorse's ball leaves its `horseShare` of what it is given: it is given what this one left, over that share.)
  missileInHorse(world, world.fighters[ball.gunner], hit, vec.normalize(ball.v), loss.left / ARROW.horseShare, { arrow: false });
}
