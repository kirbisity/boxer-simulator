// PROOF OF CONCEPT, beasts round 1: robot dogs, as the horse machinery carries them (physics/mounted.js).
//
// A robot quadruped is driven here as a horse is (a rigid body steered to a heading and a speed within what
// its legs give, its legs placed by its gait, its parts capsules a blow can meet), with no rider: what it
// carries on its back (a gripper arm, a rifle turret, a sensor head) is the "rider" the physics seats on it,
// bolted down (an outfit's `bolted`: never thrown), drawn as that mount (robotdogview.js) and not as a man.
// Nothing here is a horse's breed: HORSES is left as it was; horses.js and mounted.js look here too.
// Drop this file (and the few lines that read it) and nothing else changes.
//
// Each in units of `withers` (m: the top of its body standing), as HORSE_SHAPE is: `parts` (capsules: a body
// in two, `chest` and `body`, and a sensor head), `legs` (each from its hip, `root`, its knee bent `bend`
// (+1 forward, -1 back: all four of these robots' knees point back)), `upperLeg`, `lowerLeg`, `seat` (where
// what it carries sits), `strideMost` (its longest stride; past it the legs step faster, as a robot's
// controller does, not slide). `gaits`: a robot dog trots (diagonal pairs together) at nearly every speed
// and walks only creeping; the small one bounds flat out. `level`: its controller holds its body level (no
// bob, pitch or rock with the stride). `machine`: no blood. `harm`: what breaks its leg, smashes its sensor
// head, wrecks it (J of blunt harm, as WORLD.mount.horse's for a horse), scaled from the horse's by its mass
// to the 2/3 (a structure's strength goes with its section): (m/500)^(2/3) of a 500 kg horse's.
// `battery`: hours of walking on a charge (it does not tire in a fight).

const dogShape = ({ length, root, rootZ, hip, upper, lower, radius, head, legRadius = 0.06 }) => ({
  parts: [
    { key: 'chest', part: 'chest', a: [0, hip + 0.05, 0], b: [length, hip + 0.05, 0], radius, mass: 0.42 },
    { key: 'body', part: 'body', a: [-length, hip + 0.05, 0], b: [0, hip + 0.05, 0], radius, mass: 0.42 },
    { key: 'head', part: 'head', a: [length + head * 0.4, hip + 0.06, 0], b: [length + head * 1.6, hip + 0.04, 0], radius: head, mass: 0.04 },
  ],
  legs: [
    { key: 'lFore', fore: true, bend: -1, root: [root, hip, rootZ], mass: 0.03 },
    { key: 'rFore', fore: true, bend: -1, root: [root, hip, -rootZ], mass: 0.03 },
    { key: 'lHind', fore: false, bend: -1, root: [-root, hip, rootZ], mass: 0.03 },
    { key: 'rHind', fore: false, bend: -1, root: [-root, hip, -rootZ], mass: 0.03 },
  ],
  legRadius,
  upperLeg: upper, lowerLeg: lower,
  seat: [0, hip + 0.05 + radius, 0],
  strideMost: 1.1,
});

// Gaits by speed (m/s, up to): strides a second at the least (past `strideMost` the legs step faster), the share of a stride
// each foot is down, and when in the stride each comes down. A walk (one foot at a time), a trot (diagonals), a bound (pairs).
const DOG_GAITS = [
  { name: 'stand', upTo: 0.12, hz: 0, duty: 1, phase: { lFore: 0, rFore: 0, lHind: 0, rHind: 0 } },
  { name: 'walk', upTo: 0.45, hz: 1.4, duty: 0.7, phase: { lHind: 0, lFore: 0.25, rHind: 0.5, rFore: 0.75 } },
  { name: 'trot', upTo: 2.6, hz: 2.2, duty: 0.5, phase: { lFore: 0, rHind: 0, rFore: 0.5, lHind: 0.5 } },
  { name: 'bound', upTo: Infinity, hz: 3, duty: 0.35, phase: { lFore: 0, rFore: 0.05, lHind: 0.5, rHind: 0.55 } },
];
const dogHarmAt = (kg) => {
  const share = (kg / 500) ** (2 / 3);
  return { legBreak: Math.round(160 * share), headStun: Math.round(450 * share), trunkFatal: Math.round(2500 * share) };
};

export const ROBOT_DOGS = {
  // Unitree Go2 (2023), the consumer one: ~15 kg, 0.70 x 0.31 x 0.40 m standing, thigh and calf 0.213 m each, top speed
  // ~3.5 m/s (Pro; 3.7 the Edu), 1-2 h on its 8 Ah pack. Grey plastic shells over an aluminium frame, a lidar dome on its
  // nose. No arm: it fights with its body (run into a man's legs: physics/mounted.js rideDown).
  go2: {
    label: 'Unitree Go2', mass: 13, withers: 0.33, gallop: 3.5, canter: 2.5, trot: 1.5, walk: 0.6, accel: 4, lateral: 5, spin: 3,
    coats: ['#c8ccd2'], robot: true, machine: true, level: true, battery: 1.5, harm: dogHarmAt(15),
    shape: dogShape({ length: 0.6, root: 0.58, rootZ: 0.36, hip: 0.82, upper: 0.65, lower: 0.65, radius: 0.2, head: 0.13, legRadius: 0.085 }), gaits: DOG_GAITS,
  },
  // Boston Dynamics Spot (2020), the industrial one: 32.7 kg (8 kg more with the arm), 1.10 x 0.50 m, ~0.6 m at the top of
  // its body standing, legs 0.32 and 0.33 m, 1.6 m/s at most (it trots; it does not run), 90 min on a battery. Yellow
  // shells. Its arm (Spot Arm): 0.98 m reach, a gripper of 130 N peak (what it carries: the core, src/beasts.js).
  spot: {
    label: 'Boston Dynamics Spot', mass: 32, withers: 0.6, gallop: 1.6, canter: 1.3, trot: 1, walk: 0.5, accel: 2, lateral: 2.5, spin: 1.2,
    coats: ['#f2c21b'], robot: true, machine: true, level: true, battery: 1.5, harm: dogHarmAt(40),
    shape: dogShape({ length: 0.75, root: 0.6, rootZ: 0.2, hip: 0.85, upper: 0.53, lower: 0.55, radius: 0.17, head: 0.1, legRadius: 0.06 }), gaits: DOG_GAITS,
  },
  // Ghost Robotics Vision 60 (the US Air Force's base patrol dog), the military one: ~51 kg, ~0.95 m long, ~0.55 m at the
  // top of its body, ~3 m/s at most, ~3 h on a charge, rated for rain and dust. Shown (AUSA 2021) carrying SWORD
  // Defense's SPUR rifle turret (6.5 Creedmoor, a 30x thermal sight): the turret is what it carries (src/beasts.js).
  vision60: {
    label: 'Ghost Robotics Vision 60', mass: 42, withers: 0.55, gallop: 3, canter: 2.2, trot: 1.4, walk: 0.6, accel: 2.5, lateral: 4, spin: 1.5,
    coats: ['#4d5446'], robot: true, machine: true, level: true, battery: 3, harm: dogHarmAt(51),
    shape: dogShape({ length: 0.72, root: 0.6, rootZ: 0.24, hip: 0.84, upper: 0.56, lower: 0.58, radius: 0.2, head: 0.11, legRadius: 0.07 }), gaits: DOG_GAITS,
  },
};

/** A robot dog's shell, as horses.js BARDING is armour by part: thin aluminium and plastic (as the humanoid robot's, outfits.js). */
export const ROBOT_SHELL = {
  label: 'Robot shell', mass: 0,
  parts: {
    head: { blunt: 0.3, cut: 0.7, pierce: 0.5, deflects: true }, neck: { blunt: 0.3, cut: 0.7, pierce: 0.5, deflects: true },
    chest: { blunt: 0.3, cut: 0.7, pierce: 0.5, deflects: true }, body: { blunt: 0.3, cut: 0.7, pierce: 0.5, deflects: true },
    legs: { blunt: 0.2, cut: 0.6, pierce: 0.4, deflects: true },
  },
};
