// Exterior ballistics: one model for everything that flies out of a barrel or off a string (a matchlock's ball, a
// rifle's bullet, a cannon's shot, an arrow). A missile flies under gravity and the air's drag, the drag the square
// law's: its deceleration a = ρ·Cd·A / (2m) · v², with A its frontal area, m its mass and Cd its drag coefficient,
// which for anything fired at the speed of sound depends on the Mach number:
//
//  - a round ball (a matchlock's lead, a cannon's iron, buckshot): the sphere's Cd, ~0.47 well below the speed of sound
//    and ~1 above it (the drag rises through the transonic as the shock forms). The Graz armoury's trials of its own
//    16th-18th c. guns (Krenn, Kalaus & Hall, "Material Culture and Military History: Test-Firing Early Modern Small
//    Arms", Material Culture Review 42, 1995) measured round balls losing ~2.5 m/s per metre over the first 24 m from
//    ~450 m/s: what the supersonic sphere's Cd ~1 gives for a 20-30 g ball (0.47 would give half of it).
//  - a modern bullet: a standard projectile's drag curve (G1, the old flat-based round nose; G7, the long boat-tailed
//    spitzer) scaled by the bullet's form factor, i = m / (BC · d²), BC its ballistic coefficient against that curve
//    (the makers' published figure, lb/in², converted here).
//  - an arrow (or a bolt): a constant Cd on the shaft's cross-section (subsonic, its fletching and its length's skin
//    friction), J. L. Park, "The aerodynamic drag and axial rotation of an arrow", Proc. IMechE Part P 225 (2011):
//    Cd ~1.5-2.6 on the shaft's section, by whether its boundary layer is laminar or turbulent.
//
// A missile's description (`projectile`): { kg, velocity (m/s at the muzzle), calibre (m) or, for a lead ball, none
// (its size from its weight), curve: 'sphere' | 'g1' | 'g7' | a number (a constant Cd), bc (lb/in², for g1/g7) }.
// Its energy at any distance (½mv²) is what its wound and the armour it meets are reckoned on (physics/ranged.js
// bulletHit, arrowHit): effective and greatest range are what the flight leaves it, not a figure set on the weapon.

export const BALLISTICS = {
  gravity: 9.81,
  // The air (kg/m³ at a spring day's ~10 °C, sea level) and the speed of sound in it (m/s: 331.3 + 0.606 per °C).
  air: { density: 1.25, sound: 337.4 },
  // Lead's density (kg/m³), for a ball's diameter from its weight (a 13 g ball is ~13 mm).
  lead: 11340,
  // A ballistic coefficient's lb/in² in kg/m² (0.45359 kg / 0.0254² m²).
  bcUnit: 703.07,
  // Drag coefficient against Mach number, [M, Cd] (linear between):
  // - sphere: Bailey & Hiatt, "Sphere drag coefficients for a broad range of Mach and Reynolds numbers", AIAA Journal 10
  //   (1972), and Miller & Bailey, J. Fluid Mech. 93 (1979), at a ball's Reynolds numbers (~10⁵): read off their curves.
  // - g1, g7: the standard projectiles' drag functions (Ingalls / Gâvre G1; the G7 long boat-tail) as the US Army's
  //   Ballistic Research Laboratory tabulated them (McCoy, Modern Exterior Ballistics, 1999), at the points given.
  curves: {
    sphere: [[0, 0.47], [0.5, 0.48], [0.6, 0.5], [0.7, 0.55], [0.8, 0.63], [0.9, 0.74], [1, 0.86], [1.1, 0.94], [1.2, 0.98], [1.4, 1], [2, 1.02], [3, 0.98]],
    g1: [[0, 0.2629], [0.5, 0.2032], [0.6, 0.2034], [0.7, 0.2165], [0.8, 0.2546], [0.9, 0.3415], [1, 0.4805], [1.1, 0.5883], [1.2, 0.6393], [1.3, 0.6589], [1.5, 0.6573], [2, 0.6085], [2.5, 0.5568], [3, 0.5199]],
    g7: [[0, 0.1198], [0.5, 0.1197], [0.7, 0.1194], [0.8, 0.121], [0.85, 0.125], [0.9, 0.1336], [0.95, 0.1655], [1, 0.3803], [1.05, 0.4043], [1.1, 0.4014], [1.2, 0.391], [1.3, 0.38], [1.5, 0.354], [2, 0.298], [2.5, 0.2603], [3, 0.2306]],
  },
  // A flight traced at fire (physics/ranged.js fire): integrated `step` s at a time (1 ms: a rifle bullet's metre, the
  // drag's change over it a tenth of a percent), and tested against what is on the way one chord at a time, `chord` s
  // of flight each (25 ms: ~10 m of a ball's, its curve's sag off the chord under 1 mm).
  step: 0.001,
  chord: 0.025,
  // Where a trace is given up (for the game's time, not the missile's reach: well past every field it is fought on, and
  // past what a level shot carries before it comes down): `path` m along it, or slower than `spent` m/s (a ball at
  // 40 m/s has ~10 J: nothing the wound model counts), or `seconds` s of flight, or `beyond` m past the field's edge.
  cutoff: { path: 600, spent: 40, seconds: 4, beyond: 10 },
  // How far a shooter's aim is laid off for the drop (`holdover`): he judges the distance to his mark and holds over
  // for the drop the missile takes at that distance, as a trained shooter does by eye (a matchlock's or a bow's has no
  // sight for range; an archer's "point of aim" over the mark). The judgement is off by one deviation of `spread` of
  // the distance (the master's, at skill 1, to the novice's at 0) and short by `short` of it (the novice's at 0, the
  // master's none): an untrained eye judges a far distance short (Gilinsky, Psychological Review 58, 1951: far
  // distances compressed), so he holds over too little and his shots at range go low; a trained man (the musketry and
  // archery schools' drill at known distances) is within a tenth. Estimates of those, set against that.
  judge: { spread: [0.3, 0.08], short: [0.15, 0] },
};

const curveOf = new WeakMap();

/** The constant part of a projectile's drag, ρ·i·A / 2m (1/m; × Cd(M)·v² is its deceleration), and its curve. */
function dragShape(projectile) {
  let shape = curveOf.get(projectile);
  if (shape) return shape;
  const calibre = projectile.calibre ?? 2 * Math.cbrt((3 * projectile.kg) / (4 * Math.PI * (projectile.density ?? BALLISTICS.lead)));
  const area = projectile.area ?? (Math.PI * calibre * calibre) / 4;
  // Against a standard projectile's curve, its form factor from its ballistic coefficient (i = m / (BC d²)).
  const form = projectile.bc ? projectile.kg / (projectile.bc * BALLISTICS.bcUnit * calibre * calibre) : 1;
  const curve = typeof projectile.curve === 'number' ? projectile.curve : BALLISTICS.curves[projectile.curve ?? 'sphere'];
  shape = { k: (BALLISTICS.air.density * form * area) / (2 * projectile.kg), curve, calibre, area };
  curveOf.set(projectile, shape);
  return shape;
}

/** The drag coefficient on `curve` (a number, or a [Mach, Cd] table) at `mach`. */
export function dragCoefficient(curve, mach) {
  if (typeof curve === 'number') return curve;
  if (mach <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const [m1, c1] = curve[index];
    if (mach <= m1) {
      const [m0, c0] = curve[index - 1];
      return c0 + ((c1 - c0) * (mach - m0)) / (m1 - m0);
    }
  }
  return curve[curve.length - 1][1];
}

/** A projectile's drag rate at `speed` (m/s): k such that dv/dt = −k·v² (1/m). */
export function dragRate(projectile, speed) {
  const shape = dragShape(projectile);
  return shape.k * dragCoefficient(shape.curve, speed / BALLISTICS.air.sound);
}

/** A projectile's frontal area (m²) and calibre (m). */
export function projectileSize(projectile) {
  const { area, calibre } = dragShape(projectile);
  return { area, calibre };
}

/**
 * One step of flight (`dt` s) of velocity `v` (world, m/s; changed in place): the drag first (implicit, v /= 1 + k|v|dt,
 * which never reverses it however long the step), then gravity. Returns the share of its speed the drag left it.
 */
export function flightStep(projectile, v, dt) {
  const speed = Math.hypot(v[0], v[1], v[2]);
  const kept = 1 / (1 + dragRate(projectile, speed) * speed * dt);
  v[0] *= kept;
  v[1] = v[1] * kept - BALLISTICS.gravity * dt;
  v[2] *= kept;
  return kept;
}

/**
 * A missile's flight from `from` (world) at velocity `v0` (world, m/s), as chords (BALLISTICS.chord s of flight each)
 * to test against what is on its way: [{ from, to, speeds: [at from, at to], time (s, at from), path (m, at from) }],
 * until it comes down to `floor` (m, the ground's height), leaves the box `within` ({ halfX, halfZ }: the field and a
 * margin) or meets BALLISTICS.cutoff.
 */
export function traceFlight(projectile, from, v0, { floor = 0, within = null } = {}) {
  const spec = BALLISTICS;
  const steps = Math.round(spec.chord / spec.step);
  const v = [...v0];
  let at = [...from];
  let speed = Math.hypot(...v);
  let time = 0;
  let path = 0;
  const chords = [];
  while (time < spec.cutoff.seconds && path < spec.cutoff.path && speed > spec.cutoff.spent) {
    const start = at;
    const startSpeed = speed;
    const startTime = time;
    const startPath = path;
    let x = start[0];
    let y = start[1];
    let z = start[2];
    for (let k = 0; k < steps; k += 1) {
      flightStep(projectile, v, spec.step);
      x += v[0] * spec.step;
      y += v[1] * spec.step;
      z += v[2] * spec.step;
    }
    at = [x, y, z];
    speed = Math.hypot(...v);
    time += steps * spec.step;
    path += Math.hypot(x - start[0], y - start[1], z - start[2]);
    chords.push({ from: start, to: at, speeds: [startSpeed, speed], time: startTime, path: startPath });
    if (y <= floor) break;
    if (within && (Math.abs(x) > within.halfX || Math.abs(z) > within.halfZ)) break;
  }
  return chords;
}

const tables = new WeakMap();

/**
 * A projectile's range table: a shot fired level at its muzzle velocity, metre by metre (`[distance]`): its speed
 * (m/s), its fall below the line of the bore (m) and its time of flight (s), to BALLISTICS.cutoff (gravity on, no ground).
 */
export function rangeTable(projectile) {
  let table = tables.get(projectile);
  if (table) return table;
  const spec = BALLISTICS;
  const v = [projectile.velocity, 0, 0];
  let x = 0;
  let y = 0;
  let time = 0;
  table = { speed: [projectile.velocity], drop: [0], time: [0] };
  while (time < spec.cutoff.seconds && x < spec.cutoff.path && Math.hypot(v[0], v[1]) > spec.cutoff.spent) {
    flightStep(projectile, v, spec.step);
    const before = x;
    x += v[0] * spec.step;
    y += v[1] * spec.step;
    time += spec.step;
    for (let metre = Math.floor(before) + 1; metre <= x; metre += 1) {
      table.speed[metre] = Math.hypot(v[0], v[1]);
      table.drop[metre] = -y;
      table.time[metre] = time;
    }
  }
  tables.set(projectile, table);
  return table;
}

/** A row of the range table at `distance` m (interpolated), or null past where it is spent. */
export function atRange(projectile, distance) {
  const table = rangeTable(projectile);
  const metre = Math.floor(Math.max(0, distance));
  if (metre + 1 >= table.speed.length) return null;
  const share = distance - metre;
  const mix = (column) => column[metre] + (column[metre + 1] - column[metre]) * share;
  const speed = mix(table.speed);
  return { speed, drop: mix(table.drop), time: mix(table.time), joules: 0.5 * projectile.kg * speed * speed };
}

/** The angle (rad) to hold over a mark `distance` m off for the drop on the way (atRange), or for the whole cutoff. */
export function holdover(projectile, distance) {
  const row = atRange(projectile, distance);
  if (!row) return Math.atan(rangeTable(projectile).drop.at(-1) / Math.max(1, rangeTable(projectile).drop.length - 1));
  return Math.atan(row.drop / Math.max(0.5, distance));
}

/**
 * One rule for every black-powder ball gun of the matchlock's age (weapons.js MATCHLOCK, THREE_EYED): its ball's muzzle
 * velocity and its aim, from its barrel (`barrel` m), its ball (`kg` of lead: the bore is the ball's own diameter, so the
 * barrel's length in calibres), its charge (`charge`, a share of the ball's weight) and how it is held (`hold`).
 * - Velocity (ballGunVelocity): Hutton's ballistic-pendulum trials at Woolwich (1775-91; Hutton, *Tracts on Mathematical
 *   and Philosophical Subjects*, 1812): with the same powder and ball, the velocity went nearly as the square root of the
 *   charge (`chargePower` 0.5: the powder's work goes as its weight) and as about the fifth root of the bore's length in
 *   calibres (`lengthPower` 0.2: a longer bore burns more of the charge before the ball leaves and lets its gas expand
 *   further, each calibre more giving less: sub-linear; his guns ran ~15-40 calibres). Fitted to one gun, the matchlock
 *   (`ref`: the Graz armoury's trials, ~392 m/s for a ~13 g ball out of a ~1 m barrel, Krenn, Kalaus & Hall 1995; on half
 *   the ball's weight of powder, an estimate in the period's third to two thirds); every other ball gun follows from it.
 *   (The Adams's percussion ball and the modern rounds keep their chronographed figures: another age's powder.)
 * - Aim (ballGunSpread, rad, one deviation): the ball's own wander (`wander`: a loose round ball out of a smoothbore swerves
 *   as its chance spin takes it; the matchlock's 0.014 less its sights' share) and the aim's, side by side. A gun at the
 *   cheek is laid by its sights: the eye's error lining the fore-sight on the back-sight (`sighting` m, ~1.5 mm with a
 *   period notch and bead: an estimate) over the sight radius, the barrel's length (the sights at breech and muzzle), so
 *   the shorter the barrel the wider. A gun at the hip or under the arm (`hold` 'hip') has no stock to the cheek and no
 *   line to the eye: it is pointed by feel and by the eye from half a metre above it, its error at the end of the length
 *   he points (`piece` m, the whole piece from the rear hand) `pointing` m, a hand's breadth (~3° on a 1.3 m piece: a man's
 *   width at ~10 m is one deviation; an estimate, fitted to nothing but that). Qi Jiguang of the northern troops' fast guns
 *   (快枪, the three-eyed gun among them): they cannot hit, they often burst, and the bird gun (鸟铳) is to be preferred
 *   (《纪效新书》, as quoted secondhand).
 */
export const BALL_GUN = {
  lead: 11340,
  ref: { velocity: 392, barrel: 1.0, kg: 0.013, charge: 0.5 },
  chargePower: 0.5,
  lengthPower: 0.2,
  wander: 0.0139,
  sighting: 0.0015,
  pointing: 0.07,
};

/** A lead ball's diameter (m), the bore it fits, from its mass (kg). */
export function ballBore(kg) {
  return Math.cbrt((6 * kg) / (Math.PI * BALL_GUN.lead));
}

/** A black-powder ball gun's muzzle velocity (m/s), BALL_GUN's rule: `barrel` m, ball `kg`, `charge` a share of its weight. */
export function ballGunVelocity({ barrel, kg, charge }) {
  const { ref, chargePower, lengthPower } = BALL_GUN;
  const calibres = barrel / ballBore(kg);
  const refCalibres = ref.barrel / ballBore(ref.kg);
  return ref.velocity * (charge / ref.charge) ** chargePower * (calibres / refCalibres) ** lengthPower;
}

/** A black-powder ball gun's spread (rad), BALL_GUN's rule: sighted at the cheek over its `barrel`, or pointed at the hip over its `piece`. */
export function ballGunSpread({ barrel, hold = 'cheek', piece = barrel }) {
  const aim = hold === 'hip' ? BALL_GUN.pointing / piece : BALL_GUN.sighting / barrel;
  return Math.hypot(BALL_GUN.wander, aim);
}

/** A projectile's muzzle energy (J). */
export function muzzleEnergy(projectile) {
  return 0.5 * projectile.kg * projectile.velocity * projectile.velocity;
}

/**
 * The share of the true distance a man of `skill` (0..1) judges it to be (BALLISTICS.judge): short by his `short`, off by
 * a deviation of his `spread` drawn from `gauss` (a normal deviate; 0, his judgement without its error).
 */
export function judgedShare(skill = 0.5, gauss = 0) {
  const { spread, short } = BALLISTICS.judge;
  const at = (range) => range[0] + (range[1] - range[0]) * Math.max(0, Math.min(1, skill));
  return Math.max(0.3, (1 - at(short)) * (1 + at(spread) * gauss));
}

/**
 * The flat-fire fall of a missile with constant drag rate `k` (1/m along its path) at `out` m on (horizontal) from
 * where it leaves at elevation `angle`: F(x) = (e^{2κx} − 1 − 2κx) / 4κ², κ = k / cos(angle), so that its height is
 * x·tanθ − g·F(x) / (v cosθ)² and its slope tanθ − g·F′(x) / (v cosθ)² (the drag on its way out taken from its
 * horizontal speed: close for a flat shot, and an arrow's lob, whose speed over its arc changes little). k = 0: x²/2,
 * the vacuum's parabola.
 */
export function flatFall(k, angle, out) {
  const kappa = k / Math.max(0.2, Math.cos(angle));
  if (kappa * out < 1e-6) return { fall: (out * out) / 2, slope: out };
  const e = Math.exp(2 * kappa * out);
  return { fall: (e - 1 - 2 * kappa * out) / (4 * kappa * kappa), slope: (e - 1) / (2 * kappa) };
}
