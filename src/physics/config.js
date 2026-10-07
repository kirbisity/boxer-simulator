// Tuning: every physical constant of the fight world, with what it is set
// against. The simulation reads these; nothing else defines its numbers.

export const WORLD = {
  gravity: 9.81,
  substeps: 8,
  // Half the inside of a 20 ft ring (6.1 m), less a margin for the ropes.
  ringHalf: 2.85,
  gloveRadius: 0.065,
  teamSpacing: 1.1, // m between team-mates at the start of a team fight
  teamRowSpacing: 0.9, // m between rows of a side too big to stand abreast
  sidestepShare: 0.7, // sidestep speed as a share of footwork speed
  // A clean power shot lands at about this share of the limb's top speed.
  threatSpeedShare: 0.6,
  // Fists, gloved and bare. A 10 oz glove spreads a punch over ~11 ms; a
  // bare fist lands sooner on a smaller, harder knuckle — peak force some
  // 20–40% higher for the same impulse — so skin splits, and the hand's own
  // bones break at a lower load (the boxer's fracture of street fights).
  fists: {
    gloved: { radius: 0.065, contactSeconds: 0.011, handFracture: 1, cutForce: Infinity },
    bare: { radius: 0.042, contactSeconds: 0.008, handFracture: 0.9, cutForce: 2100 },
  },
  // Things worn that come off: a headset is knocked away by the first clean
  // shot to the head (or when its wearer goes down). Free, it flies with the
  // head's new speed and the blow's direction, tumbles, and settles on the floor.
  props: { radius: 0.06, flySpeedPerHeadDeltaV: 1.6, flyBase: 1.2, flyUp: 1.5, restitution: 0.35, slide: 0.75, spinMin: 8, spinRange: 8 },
  contactStep: 0.012, // m a strike contact may separate per substep
  // Both hands on a weapon turn it this much more stiffly than one wrist.
  twoHandWrist: 1.7,
  // Wrists turn a weapon no faster than this (rad/s): real cuts peak near 20–30.
  weaponTurnLimit: 25,
  // A blade fending off a strike drives out this far (share of the line to the strike) past where they meet.
  fendDrive: 0.25,
  gripStep: 0.006, // m the off hand is drawn onto a two-handed grip per substep
  // A polearm's front hand slides along the shaft: no closer to the rear
  // hand than this share of its usual spacing, and this far short of the head (m).
  grip: { shortest: 0.4, headClear: 0.08 },
  contactRange: 2.6, // m between hips beyond which two fighters cannot touch
  // A big fight looks for near pairs once a step, out to this much beyond
  // contactRange (more than two men can close in one step), and checks the
  // exact distance each substep.
  contactMargin: 0.6,
  bodyReach: 1.3, // m from the hips that any part of a body (standing or lying) can be
  // A strike from more than this far off the defender's facing (rad) is
  // unseen; the head moves this much further for it.
  blindsideAngle: Math.PI / 3,
  blindsideFactor: 1.6,
  // Head movement in range: how far past both reaches it starts (m), how
  // quickly it eases in (/s), its rhythm (Hz), its side-to-side size as a
  // share of height (~8 cm on a 1.8 m boxer) and the knee bend as it crosses.
  // Slip and roll targets, as shares of height.
  headMovement: { slip: { across: 0.14, down: 0.06 }, roll: { across: 0.14, down: 0.04 } },
  weave: { range: 0.35, easeRate: 4, hz: 0.75, size: 0.045, kneeDip: 0.03 },
  // Each muscle group is a spring-damper towards its target: natural
  // frequency ω (rad/s) and damping ratio ζ. Below ζ = 1 a part overshoots a
  // little and settles, which is what inertia looks like; the force cap from
  // the muscle bounds it, so a heavy, weak part lags and a light, strong one
  // snaps. Hands are stiff so the cap, not the spring, sets punch speed.
  motor: {
    hand: { omega: 60, zeta: 0.6 },
    elbow: { omega: 34, zeta: 0.75 },
    // The neck holds the head steady and on the opponent (stiff, well
    // damped: it does not bob); a blow still snaps it back before the
    // reflex delay is up.
    head: { omega: 20, zeta: 0.85 },
    trunk: { omega: 13, zeta: 0.5 },
    pelvis: { omega: 12, zeta: 0.5 },
    knee: { omega: 22, zeta: 0.7 },
    foot: { omega: 36, zeta: 0.9 },
  },
  // Muscles react to a blow after a reflex delay (~60–90 ms for a startle
  // response; less when braced), then ramp back to full force. Until then
  // only passive tone holds (the floor): the share of force a relaxed
  // muscle and its tendons still give.
  reflex: { latency: 0.095, trainedSaving: 0.03, bracedSaving: 0.035, ramp: 0.14, floor: 0.12 },
  // Per-second velocity damping: joints and tissue lose energy; a limp body
  // less so, which is why it falls rather than sinks.
  damping: { up: 0.8, down: 0.5 },
  groundFriction: 14,
  braceCompliance: 5e-4, // m/N: torso braces give a little so the trunk can twist
  diagonalCompliance: 3e-3,
  // Joint limits for the ragdoll: knees bend only forward; the head stays
  // within this angle of the trunk's axis; elbows and knees cannot fold flat.
  headCone: 1.2,
  // The spine's twist: how far the hips may turn against the shoulders
  // about the trunk (rad). Without it a limp body's hips spin round under
  // its chest and the legs turn inside out.
  spineTwist: 1.3,
  // A body down and limp is a ragdoll: no muscle drive, only the tone of
  // relaxed muscle damping how its parts move against each other (per s),
  // its ligaments' tighter range (cones in rad), its limbs kept out of its
  // own trunk (share of trunk radius), and rest once it lies still.
  ragdoll: {
    toneDamping: 7, spineTwist: 0.8, hipCone: 2.0, headCone: 0.9, shoulderCone: 2.8, bodyClearance: 0.85,
    sleepSpeed: 0.12, sleepSeconds: 0.25, hingeSlack: 0.03,
  },
  minFold: { arm: 0.13, leg: 0.16 },
  // Held firmly: up to this far corrected per substep (more is stable now
  // that corrections are shared by mass).
  limitStep: 0.006, // m
  limitStepLimp: 0.03, // m: firmer corrections inject speed of their own
  // The stance on the floor: how fast he turns to face (per s), how fast the
  // stance follows hips pushed off it (per s), how near the arena's edge (m) it may stand.
  footing: { turnRate: 6, followPushed: 2.5, edgeMargin: 0.3 },
  joint: {
    hipCone: 2.4, // rad from straight down: room for a head kick, not the splits
    // Forced this far past its range in an instant, a joint breaks.
    breakAngle: 0.8, // rad past the limit
    // The neck is braced by the whole shoulder girdle: it takes far more.
    breakAngles: { neck: 1.5 },
    straightAllowance: 0.01, // m a hinge may pass straight before it is held
    // ...held there: rad·s of strain past the break angle before it gives,
    // and how fast strain leaks away (per s) once the joint is back in range.
    strainToBreak: 0.05,
    strainLeak: 6,
    // A leg or neck broken: down this long (s) at most before he is out.
    brokenDownSeconds: 2,
  },
  // Footwork: a planted foot stays put until the stance has drifted this far
  // from it, then steps; one foot at a time.
  step: { threshold: 0.11, seconds: 0.17, lift: 0.05, lead: 0.5 },
  // Footwork speed and how quickly it can change (m/s, m/s²), for a body
  // whose leg drive is typical (legStrengthTypical × its weight); stronger
  // or weaker legs scale both.
  // Boxers move explosively (push-offs of ~8 m/s²), so the trunk visibly
  // lags a step in and sways past the stance when it stops.
  footSpeed: 1.2,
  footAcceleration: 8,
  legStrengthTypical: 0.8,
  // An impact's contact lasts about this long through a 10–12 oz glove;
  // peak force ≈ (π/2)·impulse / contact time for a half-sine pulse.
  contactSeconds: 0.011,
  restitution: 0.1,
  // How much momentum a blow hands to what it hits, as a restitution: higher
  // than the damage figure above, because the glove and flesh cushion the
  // tissue's strain more than they cushion the push. Raised for a sharper,
  // more visible knockback; damage still uses the cushioned figure.
  transferRestitution: 0.6,
  // A weapon's blow, by what meets the body: a hard blunt head rebounds and
  // shoves (`blunt`); an edge or a point sinks in and slides rather than
  // bouncing off (`edge`), so a cut hands over less momentum than a club.
  // Mixed by the blow's blunt and cut-and-pierce shares.
  weaponTransferRestitution: { blunt: 0.5, edge: 0.25 },
  rotationLead: 0.45,
  // Stamina regained per second at rest, times aerobic fitness: a fit boxer
  // holds most of it through a round; an unfit one empties in about a minute.
  staminaRecovery: 0.07,
  // Accumulated brain strain (Σ(Δv − 1.2)²) a fighter absorbs, per unit of
  // chin, before going down. The count is against the total, and after each
  // knockdown only half as much again puts him back down.
  concussionCapacity: 4,
  concussionAfterKnockdown: 0.5,
  // Knocked out outright, no count: a head speed change this many times the
  // chin (the chin scales with neck and body), or a blow that moves the whole
  // body faster than this (m/s) — too much force for the mass that took it.
  knockout: { overChin: 1.8, bodyDeltaV: 2.4 },
  // A heavy attack: first loaded (seconds sitting down on the legs, turned
  // away by this share of the strike's own twist), then thrown with more of
  // the body's weight behind the limb, at a higher stamina cost, and leaving
  // the thrower committed (unable to defend) for a moment after.
  heavy: { loadSeconds: 0.2, loadTwist: 0.6, loadDip: 0.045, massFactor: 1.4, costFactor: 2.2, committedSeconds: 0.35 },
  // Damage that stays. Head damage and knockdowns weaken the chin; a blow
  // stuns for this many seconds per m/s of head speed change; after getting
  // up a fighter is hurt (muscles at `hurtStrength` rising back to full)
  // for `hurtSeconds` plus `hurtPerKnockdown` per knockdown so far; a beaten
  // trunk recovers stamina slower and beaten arms punch weaker.
  // A blow to the head: share of a blocked blow that still reaches it
  // through the guard; the peak force (N) past which a fist splits the skin.
  head: { blockedShare: 0.12, cutForce: 1800 },
  hurt: {
    chinPerHeadDamage: 0.35, chinPerKnockdown: 0.1, stunPerDeltaV: 0.6,
    hurtSeconds: 8, hurtPerKnockdown: 4, hurtStrength: 0.65,
    staminaPerTrunkDamage: 0.6, armForcePerDamage: 0.4,
  },
  // Armour (blunt protection from `armouredFrom`) spreads a heavy blow: a
  // man in it reels instead of dropping. A blow of `startAt` or more of what
  // would put him down (head speed change over the chin, or the knock over
  // what his legs take) staggers him for `minSeconds` to `maxSeconds`, more
  // the harder it was; one that would put him down staggers him instead,
  // unless it was overwhelming or he was already reeling. Reeling, his
  // muscles are at `strength`, his blows carry `harm` of their weight and he
  // defends `defend` as often, all recovering as the stagger wears off.
  // A blow's blunt peak force (N) counts as `force` would to put him down;
  // knocked past his feet just after a blow, he stumbles for `catchSeconds`
  // to get them back under him.
  stagger: { armouredFrom: 0.5, startAt: 0.7, overwhelm: 1.6, minSeconds: 2, maxSeconds: 10, strength: 0.7, harm: 0.6, defend: 0.5, force: 5000, catchSeconds: 1, hitWithin: 0.5 },
  rotationalFactor: { jab: 0.85, cross: 1, hook: 1.35, uppercut: 1.25 },
  followThrough: 0.2, // m beyond the target the glove is aimed at
  minImpactSpeed: 2.0,
  getUpSeconds: 1.6,
  // Balance: pushed past these, a fighter goes over rather than stepping.
  // Speed of the hips (m/s) and their distance outside the feet, as a share
  // of leg length; both scale with how strong the legs are.
  // The knock speed scales with the transfer above, so the limit does too.
  // massShare: how much of the body's mass resists a body-to-body knock;
  // strikeMassShare the same for a strike, brief enough that the planted
  // legs hold the whole body behind the trunk. legDamageCost: balance lost
  // to a fully damaged pair of legs.
  balance: { speed: 2.1, reach: 0.8, fallSeconds: 1.4, absorbPerSecond: 5, massShare: 0.7, strikeMassShare: 1, legDamageCost: 0.3 },
  // Charging: top speed as a multiple of footwork speed, and how much of the
  // trunk's mass meets the other body in a collision.
  rush: { speedFactor: 2.6, trunkShare: 0.7, minClosing: 0.8 },
  // Running (away from a gun, or after one): footwork speed times this.
  run: { speedFactor: 2.3 },
  // Walking about (the player's walk mode): upright and square, feet under
  // the hips, no guard; the arms swing with the stride, more the faster he goes.
  walk: { stance: { blade: 0, crouch: 0, width: 0.5, lean: 0.03, guardHeight: 0 }, strideHz: 0.9, runStrideHz: 1.5 },
  // Out this long (s), a body is left where it lies: no more simulation for it.
  goneSeconds: 20,
  // m/s: faster than this, a man cannot go on loading a gun (he waits).
  reloadMaxSpeed: 0.6,
  // A throw from the hold: `seconds` of the thrower's leg force, the top
  // of the man pulled across and `down`, his hips pushed back (`hipShare`).
  throw: { seconds: 0.3, down: 0.6, hipShare: 0.6 },
  // Hitting the floor or another body. A part meeting the floor faster than
  // `minSpeed` (m/s) takes the speed beyond it: the head as a blow to the
  // head (`head` of it, the arms and shoulders breaking part of a fall), the
  // rest as damage to the part (`body` of it), less what armour spreads,
  // less again for dense bone. A hand or elbow landing faster than
  // `fractureSpeed` × bone density breaks the joint. Two bodies meeting
  // faster than `bumpSpeed` (m/s; a charge at any speed) each take their own
  // speed change (`charge` of it) as damage to the trunk: the lighter man more.
  // A hard blow to the trunk (a fall on it, a collision) bleeds inside:
  // `internalBleed` of the blood a second per m/s that got through armour and
  // bone, clotting as a wound does. One fall is a bruise; fall after fall, or
  // trampled in a crush, a man can collapse and die of it.
  impact: { minSpeed: 2.2, head: 0.6, body: 1.0, fractureSpeed: 9.5, bumpSpeed: 2.2, charge: 0.75, bumpEvery: 0.6, internalBleed: 0.0003 },
  // Injury piling up, from blows, falls and collisions alike (in each part's
  // damage capacity, uncapped): the trunk past `trunkFatal` and he dies of
  // his injuries; the head past `headFatal`, the skull breaks; an arm or leg
  // past `limbBreak`, it breaks (a leg: down, then crawling). Before that,
  // a battered trunk saps him, as blood loss does (to `shockStrength` of his
  // strength at the fatal mark). Knockdowns and bleeding still end most fights.
  injury: { trunkFatal: 2.5, headFatal: 2.2, limbBreak: 1.8, shockStrength: 0.6 },
  // Firing: the recoil's peak force is its impulse over `seconds` (the
  // gun's kick spread through a braced hand, or a stock into the shoulder).
  // Against the gun hand's strength (N; `reference` an average man's) the
  // aim steadies or shakes (spread × √(reference / strength), between
  // `steadiest` and `shakiest`); past `snapOver` × his strength the arm may
  // snap, the likelier the further past (`snapRise` per share beyond it).
  // Only the frailest: an ordinary man is bruised by a matchlock, not broken.
  // `rockedOver`: a long gun's kick over the shooter's whole mass (m/s) past which it rocks him off balance (a shotgun in a light body); `rocked`: how hard.
  recoil: { seconds: 0.015, longGunSeconds: 0.03, reference: 250, steadiest: 0.75, shakiest: 1.7, snapOver: 3.5, snapRise: 2, rockedOver: 0.24, rocked: 0.9 },
  // Running, nobody within `relaxFrom` m: the hands come down from the
  // guard and swing (`swing`, heights), back up within `guardFrom` m. Running:
  // flagged so by the AI, or faster than `runningSpeed` m/s.
  runCarry: { relaxFrom: 4, guardFrom: 2.6, swing: 0.07, ease: 4, runningSpeed: 2.5 },
  // Detail by the size of the fight (fighters in all): up to `full`, every
  // fighter exactly as in a one-on-one; up to `grid`, the same physics, near
  // pairs found through a spatial grid; up to `coarse`, a fighter with no
  // fighter not in an exchange (not striking, struck at, just hit, held or
  // rising) steps once in `stride[3]` substeps; beyond, once in `stride[4]`,
  // and if no enemy is within `engageRange` m and he is standing he is a
  // proxy — no particle physics, his body eased (`proxyFollow` /s) to the
  // pose his muscles want — until he is engaged again. In both, a hand or
  // blade not striking is tested for contact every other substep. The
  // player's fighter (world.keepFull) is always in full.
  // `proxyEvery`: a proxy's pose is worked out every this many steps (spread over them), for that span.
  tiers: { full: 6, grid: 16, coarse: 32, engageRange: 3, hitMemory: 0.6, stride: { 3: 2, 4: 4 }, proxyFollow: 12, proxyEvery: 2 },
  gunStartApart: 2.5, // m each side of the centre, when someone carries a gun
  // The clinch: hands locked behind the neck; it breaks when the defender's
  // strength wins or the time runs out.
  // reachSeconds: time the hands have to get to the neck before the clinch is abandoned.
  // driveShare: of a sumo's leg force (less his man's) that drives his man back in the clinch.
  // `release`: a held hand pulled this far (m) from the neck has lost its grip.
  clinch: { lockDistance: 0.14, range: 0.95, pullDown: 0.08, reachSeconds: 0.6, driveShare: 0.85, release: 0.55 },
  // Leg kicks add up: the speed change each kick gives the struck leg
  // (m/s, summed) until it gives way — some 20 hard low kicks from a heavy
  // man into a lightweight's thigh, many more the other way. After it first
  // gives, it buckles again at each further share of capacity, not at every
  // touch; in between the damaged leg is weaker and the stance less steady.
  legCapacity: 24,
  legGivesAgainEvery: 0.6,
  // Speed change (m/s, summed over blows) a segment takes before it is
  // seriously hurt and shows fully red: a face about a dozen hard shots,
  // a trunk two dozen body shots, a forearm a lot of blocking.
  damageCapacity: { head: 26, trunk: 16, Forearm: 30, UpperArm: 30, Thigh: 12, Shank: 12 },
  blockedDamageShare: 0.35,
  downSecondsMin: 3,
  downSecondsRange: 4,
  knockdownsToStop: 3,
  // Weapons on the floor and in the hand: a fall or knockdown shakes the
  // grip loose this often (a knockout always); a man without a weapon who
  // reaches one on the floor stoops `pickupSeconds` to take it, and gives
  // up if he has not got his hand to it (within `pickupReach` m) in `pickupGiveUp` s.
  // A weapon heavier than `heavyFrom` kg is slower to raise (against gravity)
  // and to bring back after the blow (its momentum to stop): the windup and
  // the recovery take √(mass / heavyFrom) as long, and each blow costs
  // mass / heavyFrom times the stamina. The swing itself is the muscles'
  // (inertia and Hill already slow it). It is harder to steer, too: its aim
  // wanders `heavyAimJitter` m (each way, per unit of mass over heavyFrom), so
  // a great club finds the head less often than the shoulder.
  // A shield lost: in a fall, most likely (`dropOnFall`: the arm goes out to
  // break the fall and lets go of the grip), or wrenched off the arm by a blow on it
  // whose impulse passes `wrench` N·s (for an arm of the reference strength;
  // the likelier the further past), or with the arm that held it broken or
  // gone. On the floor it is a plate of its own weight; a man of a shield
  // style without his takes it up again.
  shield: { dropOnFall: 0.75, wrench: 42, wrenchRise: 1.5 },
  weapons: { dropOnFall: 0.35, pickupSeconds: 0.45, pickupReach: 0.4, pickupGiveUp: 2, heavyFrom: 3.2, heavyAimJitter: 0.45 },
  // A side of `minSide` or more has a leader, the man nearest its middle at
  // the start, and he carries its standard if its faction has one (FACTIONS).
  // Without a banner colour of its own, a side's flag is its corner's.
  standard: { minSide: 4, colours: { red: '#b3161b', blue: '#1f3f8a' } },
  // Holding the last man down. Pinners kneel beside him (hips this share of
  // height lower, leaning in), lock their hands on his chest and hips once
  // within `lockDistance` (m), and press with this share of their weight;
  // the hands let go past `release` m. Held with his trunk below `lowNeck` × his standing neck
  // height for `seconds`, he is beaten. Trying to rise under the hold and
  // failing, he tries again after `retry` s. At most `pinners` at once. The
  // hold presses and holds; it never strikes and adds no harm.
  // A man held down who is not out fights it: he tries to get up `struggleAfter` s into the hold.
  // The grip pulls like a spring of `gripStiffness` N/m, up to `gripShare` of the arm's strike force.
  // Crawling on the knees (a broken leg, or a badly hurt man who has lost
  // his nerve): knees and hands to the floor, a knee-walk of `stride` × height
  // per step at `strideHz` at full pace, the body low (`dip`) and over the
  // hands (`lean`); `speed` × footSpeed at most (~0.35 m/s), gathered
  // at `accel` × footAcceleration. A man crawling is out of the fight. He
  // turns only by stepping round, the outer knee taking the longer stride:
  // at most `turnSpeed` rad/s at full pace, `turnOnSpot` of that shuffling
  // round where he is; `turnStride`: how much longer the outer knee's step.
  crawl: { speed: 0.3, accel: 0.3, strideHz: 1.1, stride: 0.06, dip: 0.3, lean: 1.1, turnSpeed: 0.7, turnOnSpot: 0.35, turnStride: 0.6 },
  pin: { dip: 0.26, lean: 0.5, lockDistance: 0.2, weightShare: 0.6, gripStiffness: 4000, gripShare: 0.6, release: 0.6, lowNeck: 0.4, seconds: 3, retry: 1.2, struggleAfter: 0.8, pinners: 2 },
};
