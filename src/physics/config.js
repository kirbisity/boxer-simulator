// Tuning: every physical constant of the fight world, with what it is set
// against. The simulation reads these; nothing else defines its numbers.

export const WORLD = {
  gravity: 9.81,
  substeps: 8,
  // Footwork with worn joints (body.joints 0): this share of a young man's.
  jointFootwork: 0.55,
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
  // cutHeadDeltaV: how hard a crest cut away flies, as if the head had been knocked this hard (m/s).
  props: { radius: 0.06, cutHeadDeltaV: 1.5, flySpeedPerHeadDeltaV: 1.6, flyBase: 1.2, flyUp: 1.5, restitution: 0.35, slide: 0.75, spinMin: 8, spinRange: 8 },
  contactStep: 0.012, // m a strike contact may separate per substep
  // Both hands on a weapon turn it this much more stiffly than one wrist.
  twoHandWrist: 1.7,
  // Wrists turn a weapon no faster than this (rad/s): real cuts peak near 20–30.
  weaponTurnLimit: 25,
  // A blade fending off a strike drives out this far (share of the line to the strike) past where they meet.
  fendDrive: 0.25,
  // Where along it a blade meets a strike it is set across (share of its
  // length from the hand): the first blade by its middle; the off hand's
  // short one (two blades) further out, its hand kept off the line the
  // strike comes in on (the wakizashi is half a katana: met by its middle,
  // the hand would be a hand's breadth from the incoming edge).
  meetAlong: 0.45, offMeetAlong: 0.7,
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
  // A head locked to the trunk (a jousting helm bolted to the breast): he
  // sees out of the sight's slit only `sight` rad either side of his facing
  // (a blow from further round comes unseen: not answered, and blindsiding),
  // turns his body to follow his man at `turn` of the usual rate (the eyes
  // and head lead a turn, and his cannot), and with no style of his own to
  // say, the head sits for a trunk leaning `restLean` rad.
  headLock: { sight: Math.PI / 5, turn: 0.55, restLean: 0.12 },
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
    // A part coming to rest against a limit slower than this (m/s) is
    // stopped there, all of it near rest, less the faster it comes; a blow
    // faster than it is only repositioned (physics.js stopAtLimits).
    restAgainst: 0.5,
  },
  minFold: { arm: 0.13, leg: 0.16 },
  // Held firmly: up to this far corrected per substep (more is stable now
  // that corrections are shared by mass).
  limitStep: 0.006, // m
  limitStepLimp: 0.03, // m: firmer corrections inject speed of their own
  // The stance on the floor: how fast he turns to face (per s), how fast the
  // stance follows hips pushed off it (per s), how near the arena's edge (m) it may stand.
  // Helmets (outfits.js HELMETS). `paddingStretch`: full padding (1) draws a
  // blow's contact out this many times longer again (an arming cap and liner
  // turn a ~3 ms steel-on-skull knock into ~10 ms). `glance`: on a fully
  // curved bowl, the share of a blow that skids off as it turns from square
  // to grazing; `slide`: the share of its twist that slides off instead of
  // turning the head. `glancedBelow`: a blow keeping less than this is told as glancing.
  helmet: { paddingStretch: 2.5, glance: 0.9, slide: 0.8, glancedBelow: 0.75 },
  // Dazed: a head blow past `from` of the chin (short of a knockdown) leaves
  // him dazed for `minSeconds`–`maxSeconds` by how near the knockdown it
  // came: slower to react (`reaction` s), his muscles at (1 − `strength`),
  // covering up, reeling sooner (`staggerMore`× the blow), the head lolling.
  daze: { from: 0.5, minSeconds: 1.5, maxSeconds: 6, reaction: 0.2, strength: 0.3, staggerMore: 0.5, sway: 0.03 },
  // A strike thrown at a place is aimed at a man of the other side standing within this (m) of it.
  aimedAtWithin: 0.7,
  footing: { turnRate: 6, followPushed: 2.5, edgeMargin: 0.3 },
  // A drop edge (an arena's `drop`: a subway platform over the track bed):
  // hips more than `footing` m past it and his feet are gone from under him;
  // hips below `outBelow` (m, the platform's top at 0; a man lying on the
  // track bed has them at about −1.1) and he is down on the tracks, out.
  drop: { footing: 0.12, outBelow: -0.45 },
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
  // Turning a limb about its own length (src/joints.js). The way an elbow or
  // knee bends is set by how far the shoulder or hip has turned the upper
  // bone, measured from the rig's bind pose swung to where the bone points
  // (rad, inward = the forearm or shin across the body). The shoulder: hanging,
  // ~70° in from the hand-forward neutral plus the hand behind the back, ~90°
  // out (forearm bent back past the side is out of reach); raised, its range
  // opens until little is (Codman's paradox: an arm overhead reaches its hand
  // behind the head or before the face). Elevation (rad above the trunk's
  // across) sets it, `low` at and below `lowAt`, `high` at and above `highAt`.
  // The hip turns the knee ~45° out (the shin across, as sitting
  // cross-legged) and ~40° in (the foot out), whatever the thigh does, and a
  // bent knee lets the shin turn ~30° more each way on the thigh. Resistance
  // starts `softBand` short of a limit and is full at it; strain past it
  // breaks the elbow or knee (joint.breakAngle). Bent less than `from`, a
  // limb has no defined twist. `wristBack`: the most a weapon can point back
  // along the forearm that holds it (~80° flexion beyond the grip's right
  // angle, rounded up for the handle's angle in the fist).
  limbTwist: {
    arm: { low: { inward: 1.95, outward: 1.55 }, high: { inward: 2.8, outward: 2.6 }, lowAt: -0.8, highAt: 0.8 },
    leg: { low: { inward: 1.3, outward: 1.2 }, high: { inward: 1.3, outward: 1.2 }, lowAt: -0.8, highAt: 0.8 },
    softBand: 0.35,
    // On his feet, his muscles hold a limb in range and the band where the
    // ligaments resist is this narrow (rad): a swing goes as it is thrown.
    standingBand: 0.05,
    // Of a turn out of range, the share taken off each substep (all of it, at
    // the limit, within a few substeps: a firm stop without ringing); past the
    // limit, turned back at this many rad/s per rad over, up to `restoreMax` rad/s.
    resistShare: 0.3,
    // A limp limb left past its limit is turned back this far (rad) a
    // substep (~1 rad/s, as a limb sags back): faster fought the trunk and floor.
    limpHold: 0.002,
    // Strain counts while the limb is still being wrenched out past its limit
    // faster than this (m/s at the hand or foot: a wrench, not a body
    // settling onto a folded limb), not while it lies there.
    wrenchSpeed: 1,
    // A turn breaks this much (rad) further past its limit than a hinge
    // does (joint.breakAngle): the measured turn of a limb folded under a
    // falling body reads up to ~1 rad past its limit without anything giving.
    breakFurther: 0.8,
    restoreRate: 2,
    restoreMax: 0.6,
    from: 0.35,
    // An upper bone pointing within ~45° of straight up from where it hangs
    // (cos of that) has no defined turn: the swing from hanging is singular there.
    reversed: 0.7,
    wristBack: 2.6,
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
  // shoves (`blunt`); an edge or a point sinks in and does not bounce off
  // (`edge`: a perfectly inelastic contact), so a cut hands over less
  // momentum than a club. Mixed by the blow's blunt and cut-and-pierce shares.
  // A body is no hard ball: flesh, clothing and padding soak a club's rebound, so even a blunt head hands over little more than its momentum.
  weaponTransferRestitution: { blunt: 0.2, edge: 0 },
  // An edge or point that goes in keeps going: the tissue's resistance, not
  // the blade's whole momentum, is what pushes the man. Of the momentum an
  // edge would hand over, this share is spent cutting (scaled by how much of
  // the blow's energy went into the cut or the stab, against armour that
  // stopped it): a sword barely moves a man; a club, whose blow is all blunt,
  // shoves him.
  edgeCarriesOn: 0.85,
  // Poise: armour against being moved by a blow. Its weight is more mass to
  // shift (already in the body's mass); its rigid shell and padding spread
  // the blow over the whole trunk and into braced legs, so the same momentum
  // knocks him less and staggers him less. Poise = 1 + `mass` × (armour kg ÷
  // body kg) + `shell` × (its blunt protection on the trunk); the push his
  // legs must take and a blow's stagger are divided by it.
  poise: { mass: 2.5, shell: 2.5 },
  // Skill: how precisely a fighter places his blows (0..1), apart from his
  // body. 0.5 is an ordinary trained man and fights as before: above it the
  // scatter he has (a wild swinger's, a heavy weapon's) narrows, to none at 1;
  // below it a novice's error is added, up to `aimError` (m, each way) at 0,
  // by what he strikes with: points (spear, rapier) need precision most. A
  // gun's or a bow's spread scales by 1 ± `gunSpread` × (0.5 − skill).
  // Skill (0 to 1, an ordinary man 0.5): `aimError` (m) a novice's blows go
  // off the mark at 0; `gunSpread` widens a novice's shots and narrows a
  // master's; `edgeTilt` [least, most] (rad) a novice's blade is turned off
  // true in the stroke at 0 (cos² of it bites; the rest lands as the flat,
  // `flatBlunt` of it as a blow); gaps in armour are found × (0.5 + skill);
  // `draw`: a master draws the edge through and drives the point straight,
  // the cut and the stab biting × (1 + draw) at 1, × (1 − draw) at 0.
  skill: { aimError: { hand: 0.04, blunt: 0.08, blade: 0.07, point: 0.1 }, gunSpread: 1.6, edgeTilt: [0.9, 1.5], flatBlunt: 0.5, draw: 0.25 },
  rotationLead: 0.45,
  // Stamina regained per second at rest, times aerobic fitness: a fit boxer
  // holds most of it through a round; an unfit one empties in about a minute.
  staminaRecovery: 0.07,
  // Accumulated brain strain (Σ(Δv − 1.2)²) a fighter absorbs, per unit of
  // chin, before going down. The count is against the total, and after each
  // knockdown only half as much again puts him back down.
  concussionCapacity: 4.1,
  concussionAfterKnockdown: 0.5,
  // Knocked out outright, no count: a head speed change this many times the
  // chin (the chin scales with neck and body), or a blow that moves the whole
  // body faster than this (m/s) — too much force for the mass that took it.
  knockout: { overChin: 1.85, bodyDeltaV: 2.45 },
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
  // A blow's toll on the striking limb: of the speed change it suffers beyond
  // what the same blow on a man its own size would give, `share` counts as
  // damage to its bone (m/s, as a struck part's); a glove passes `gloved` of
  // it; the struck part's blunt armour adds `armour` × its protection. Set
  // so that a light man (~65 kg) beating on a sumo (~150 kg) breaks a hand
  // or a shin in a few dozen full blows, and equal weights never do.
  strikerRecoil: { share: 0.7, gloved: 0.4, armour: 1 },
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
  // Getting up (physics/rising.js). He starts only once every part moves
  // slower than `restSpeed` (m/s) for `restSeconds`, or `waitMost` s after
  // his time down is up (a man held or jostled still tries). The muscles
  // start at `strengthFrom` and come back over getUpSeconds. Stages (s):
  // limbs drawn in straight, the roll to his front (for a half turn; less
  // for less), up on hands and knees, a foot through, onto that foot and the
  // other knee, standing (about 2.5 s in all, as a fit man takes); on to the next
  // once its time is up and the hips are at `reached` of the height it puts
  // them (`stood` of his standing height, the last). Short of it he strains
  // on while the hips still come up (`gain` m higher than before), until
  // they have not for `patience` s, `strainMost` s past the stage's time at
  // most; then he sinks back beaten (on his feet if not quite straight, he
  // is up). The lifting stages are slower the less his legs and arms can
  // lift beyond his weight with all he wears (rising.js liftMargin, as
  // strong as the fall has left him): none with `easyMargin` of it, as the
  // square root of the margin shrinking, `slowest` times at most. Field
  // plate (25–30 kg) costs a fit man a second or so; a jousting harness on
  // a fit man two; a man whose limbs cannot lift him and it does not get up
  // (Askew et al. 2012: men in field plate rose and remounted unaided).
  // On hands and knees
  // the knees are `kneesBack` of his height behind where he will stand;
  // kneeling, the trunk leans `kneelLean` rad forward; standing from it, the
  // rear foot slides in to stay within `legReach` of the leg's length. A part within
  // `contact` m of the floor is on it: the floor pushes back through it,
  // a hand or knee with at most `pushShare` of its limb's muscle force (the
  // rest holds the limb's own joints: on hands and knees a man lifts about
  // twice his weight, not the sum of every muscle's); a foot under a
  // straightening leg with all of it; a hand within `brace` m of the thigh
  // of a leg standing on its foot pushes down through it as a hand on the
  // floor. Standing up off the knee his hands press on it until the hips
  // are `braceFrom` of the way up, and come off by `braceTo` (or, past the
  // stand's time, once the hips have stalled `braceStall` s).
  rise: {
    restSpeed: 0.3, restSeconds: 0.3, waitMost: 1.5, strengthFrom: 0.4,
    seconds: { gather: 0.3, roll: 0.5, push: 0.5, step: 0.35, kneel: 0.4, stand: 0.55 },
    rollFrom: 0.6, reached: 0.75, stood: 0.97, patience: 1.2, gain: 0.01, strainMost: 6, easyMargin: 1.7, slowest: 2.5,
    kneesBack: 0.1, kneelLean: 0.35, legReach: 0.95, contact: 0.03, pushShare: 0.6, brace: 0.06, braceFrom: 0.6, braceTo: 0.9, braceStall: 0.3,
    // A man little hurt (bodyHarm 0) rises sooner and stronger: the count's
    // wait is `freshDown` of a spent man's, he starts the rise with
    // `freshStrength` more of his strength, and each stage takes `freshPace`
    // less time; a badly hurt one as before.
    freshDown: 0.45, freshStrength: 0.3, freshPace: 0.15,
  },
  // Balance: pushed past these, a fighter goes over rather than stepping.
  // Speed of the hips (m/s) and their distance outside the feet, as a share
  // of leg length; both scale with how strong the legs are.
  // The knock speed scales with the transfer above, so the limit does too.
  // massShare: how much of the body's mass resists a body-to-body knock;
  // strikeMassShare the same for a strike, brief enough that the planted
  // legs hold the whole body behind the trunk. legDamageCost: balance lost
  // to a fully damaged pair of legs.
  balance: { speed: 2.1, reach: 0.8, fallSeconds: 1.4, absorbPerSecond: 5, massShare: 0.7, strikeMassShare: 1, legDamageCost: 0.3 },
  // Charging: top speed as a multiple of footwork speed.
  rush: { speedFactor: 2.6 },
  // Bodies meeting (a man's trunk or head against another's, a horse's barrel,
  // neck or head against a man or another horse): two effective masses at a
  // closing speed, whatever they are (physics.js crashBetween).
  // - Contact: closing faster than `from` m/s (`fromHead` where a head is one
  //   of them: it whips about on its neck) the pair exchange momentum (impulse =
  //   reduced mass x closing x (1 + `restitution`): a body is no ball) and a
  //   pair brushing is one meeting every `cooldown` s.
  // - Mass: a part brings what is braced behind it standing (a blow's struck
  //   mass) and, as far as the rest of the body is going into the contact (its
  //   speed towards it, against the closing speed), the whole of it
  //   (`balance.massShare` of the body, a laden horse's, a man and his horse's
  //   through the seat); a body lying on the ground has the ground behind
  //   every part.
  // - Harm: the energy of the closing speed beyond `tolerance` m/s (a shove
  //   is taken unharmed) is ½ reduced mass x closing² and the impulse over the
  //   reduced masses; each is hurt as a blow hurts, by the speed change that
  //   impulse gives its own part (the lighter more, the heavier hits harder),
  //   through the blunt blow's machinery and its armour (worse where the other
  //   is in hard armour: `hard` per unit of its blunt protection). The
  //   contact lasts `contactSeconds` (the chest gives for a few centimetres,
  //   ~40 mm), so the peak force is (π/2) impulse over it, against the ribs'
  //   (body.fracture.rib): AIS 3+ thoracic injury (3 or more ribs) begins
  //   about 3-4 kN peak. `rotation` the head's turn for a push. A horse's blunt
  //   harm is `horse` of the energy its part took up (a man's harm is in speed
  //   change on a part a dozen times lighter; in joules it is a twentieth of
  //   that to a horse, WORLD.mount.horse thresholds).
  // - Calibrated: a man's trunk is seriously hurt by 8.8 m/s of speed change
  //   and dies of 22 (WORLD.damageCapacity, injury): 22 m/s on its 28 kg is
  //   ~7 kJ, the range of the 'commonly lethal' chest impacts of a vehicle on
  //   a pedestrian (~5 kJ); a horse at the gallop into a man standing gives
  //   his chest ~10 m/s and ~7 kN: ribs broken, in plate a third of the harm.
  crash: { from: 0.8, tolerance: 1.2, fromHead: 3, restitution: 0.2, contactSeconds: 0.05, rotation: 1, cooldown: 0.6, hard: 0.5, horse: 0.05 },
  // Static scenery in the physics (physics/terrain.js), only in an arena that
  // carries `terrain`; none of this is read otherwise.
  //   cell, margin: the lookup grid's cell (m), and how far past a solid's edge it is
  //     registered (so a part up to this radius is found from the one cell it is in).
  //   stepUp: the most (m) a foot rises in stride, and a part is lifted by the floor: a tread, a kerb (stairs of risers to about 0.22 m are climbed freely, two treads ahead in a stride); a taller face is a ledge, a wall.
  //   stepDown: the most a foot reaches down to the floor below it; further, there is no floor to stand
  //     on and he is in the air. airReach: how far under the hips a hanging foot is held. airDamping: the drag (per second) on a body in the air (the floor's is far more: a fall must reach its speed); airborne: how far (m) the hips of a man not on his feet are over the floor for him to be falling. fallingSpeed: a man coming down faster than this (m/s) is in the air until a foot is within `touching` m of the floor.
  //   bodyRadius, bodyHeight: the standing man as the walls see him (the root's push out of a wall).
  //   liftRate: how fast (per second) the stance's height follows the floor under the feet. sag: how far (m) under the lower foot's floor the stance is held (a straight leg lifts its planted foot as the hips pass over it, and a stance as tall as the legs reach cannot climb). rise: how fast (m/s) a part run into a higher tread is lifted onto it, up to `ride` m of it (past that it is a fall and stops on the floor).
  //   fall: a man landing on his feet (a part of a man on the floor otherwise takes the ordinary
  //     floor impact past `bodyFrom` m/s, times `body`): at `safe` m/s or less it costs nothing (a drop of about a metre);
  //     past it each leg takes `legs` of the speed beyond as leg damage (against legCapacity); from
  //     `ankleFrom` the ankle may break, surely by `ankleTo`; past `stumble` he cannot stay up; past
  //     `compressFrom` the spine takes `compress` of the speed beyond as trunk injury (WORLD.damageCapacity);
  //     `together` s: two feet landing within it are one landing. Speeds: a drop of 1 m lands at
  //     4.4 m/s, 3 m at 7.7, 6 m at 10.8, 10 m at 14.0. Calibrated in test/terrain.test.js.
  terrain: {
    cell: 2, margin: 0.75, stepUp: 0.45, stepDown: 0.45, airReach: 0.05, airDamping: 0.1, airborne: 0.7, fallingSpeed: 1.5, touching: 0.04, bodyRadius: 0.3, bodyHeight: 1.7, liftRate: 16, sag: 0.06, rise: 1.5, ride: 0.25, climb: 1, slopeSpan: 0.5, slopeMost: 0.6, slopeHeadroom: 0.5,
    fall: { safe: 5, legs: 1.6, bodyFrom: 4.5, body: 1, stumble: 6.5, ankleFrom: 6.8, ankleTo: 11, compress: 12, compressFrom: 8, together: 0.3 },
  },
  // Running (away from a gun, or after one): footwork speed times this.
  run: { speedFactor: 2.3 },
  // The player's run mode (control.js: the stick past its run threshold, Shift, or a locked run; set as `fighter.runMode`, which
  // no AI ever sets): not a fighter hurrying but a man running, weapon carried low at his side, nothing guarded.
  // - speedFactor: footwork speed times this (the AI's run is `run.speedFactor`). 4.0 × 1.2 m/s × legs and gear: a fit man in a gambeson
  //   sprints at ~4.2 m/s with a sword (an unladen sprinter 7-9, a trot with kit 3-4), a man in plate ~2.5 (his gear's `foot`).
  // - stance: the upright, narrow run (no blade angle, no crouch; the guard stance's are the style's); lean: the trunk's forward lean
  //   into the run (rad); dip: knees a touch bent (share of height); swing: the empty arm's swing (share of height, `runCarry`'s
  //   own is the walk's); ease: how fast (per second) the run pose and the guard trade places (0.17 s to be 63% there).
  // - step: the footwork of a run (WORLD.step is a fighter's): each step takes `seconds`, the next foot goes once the last is `overlap` of the
  //   way, a step lands `lead` step-times ahead of the stance, a foot goes when the stance has drifted `threshold` m, and rises `lift` m.
  // - carry: the weapon at his side. A short weapon (up to `longFrom` m) hangs point down and a little back from a hand at the hip
  //   (`hand`, share of height; z mirrored for the left hand); a long one is carried on the shoulder, held up and forward
  //   (`longHand`, `longDir`); a shield arm hangs at `shield`.
  runMode: {
    speedFactor: 4,
    stance: { blade: 0, crouch: 0.02, width: 0.55, lean: 0.03, guardHeight: 0 },
    lean: 0.3, dip: 0.03, swing: 0.15, ease: 6,
    step: { seconds: 0.15, overlap: 0.55, lead: 1.4, threshold: 0.2, lift: 0.12 },
    carry: { longFrom: 1.15, hand: [0.05, 0.5, 0.19], dir: [-0.3, -1, 0.05], longHand: [0.1, 0.62, 0.17], longDir: [0.45, 1, 0.1], shield: [0.04, 0.5, 0.2] },
  },
  // Walking about (the player's walk mode): upright and square, feet under
  // the hips, no guard; the arms swing with the stride, more the faster he goes.
  walk: { stance: { blade: 0, crouch: 0, width: 0.5, lean: 0.03, guardHeight: 0 }, strideHz: 0.9, runStrideHz: 1.5 },
  // Level mode, tending a wound (a bandage going on): the pose, as shares of a full dip and lean (the stoop over the hands at his side).
  tend: { dip: 0.04, lean: 0.12 },
  // Level mode, a matchlock's damp or sabotaged powder (only in a stage's world; Battle Mode guns keep the shot's own `misfire`).
  // - misfire: the chance, per shot, that the charge does not fire. It is the old redstone-cut powder of the lore: one in
  //   four is bad (the Dunnottar note: "third misfire this week"), a hard but not hopeless gunner.
  // - misfireKinds: what a misfire is, by weight. `click` (the match drops, nothing is spent: he can pull again at once),
  //   `puff` (the pan flashes, the charge is wasted: a whole reload, as the old misfire), `reprime` (the pan is fouled but
  //   the ball is in: he must prime it again, `primeSeconds`, a third of a reload).
  // - hangFire: the chance, per shot that did not misfire, that it hangs: the charge smoulders and goes off after a
  //   delay of hangMin to hangMax s, from the barrel as it points then. One in six, and long enough (half a second to
  //   a second and a half) that a man walks out of the line, or into it, and a gunner may lower the gun, thinking it dead.
  damp: { misfire: 0.25, misfireKinds: { click: 0.3, puff: 0.4, reprime: 0.3 }, primeSeconds: 5, hangFire: 0.17, hangMin: 0.5, hangMax: 1.5 },
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
  // `fractureSpeed` × bone density breaks the joint (two bodies meeting: `crash`).
  // A hard blow to the trunk (a fall on it, a collision) bleeds inside:
  // `internalBleed` of the blood a second per m/s that got through armour and
  // bone, clotting as a wound does. One fall is a bruise; fall after fall, or
  // trampled in a crush, a man can collapse and die of it.
  impact: { minSpeed: 2.2, head: 0.6, body: 1.0, fractureSpeed: 9.5, internalBleed: 0.0003 },
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
  // m each side of the centre the sides start: a few steps apart, room to come on (further when someone carries a gun).
  startApart: 1.6,
  // m past the longest weapon's length (and half its grip) the pair starts apart.
  startBeyondReach: 1.0,
  teamStartApart: 1.1,
  gunStartApart: 4.0,
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
  // break the fall and lets go of the grip), or wrenched off the arm by blows on it:
  // each strains the hold by its impulse, more the further from the grip it
  // lands (it twists the shield on the arm: × 1 + offset / the shield's reach),
  // against `wrench` N·s × the shield's `hold` (SHIELDS) × his grip (against
  // the reference); the strain eases at `strainLeak` a second, and past 1 the
  // shield goes. Or with the arm that held it broken or gone. On the floor it
  // is a plate of its own weight; a man of a shield style without his takes it up again.
  // A blow on the shield turns the arm about the shoulder (its impulse × its
  // lever from the shoulder); the arm holds it in line against up to its force
  // at the hand × its length for `holdSeconds` (a heater and arm, ~1 kg·m²
  // about the shoulder, are turned past ~11° (θ = J² / 2IT) by J ~6 N·m·s against
  // the ~100 N·m a shoulder has sideways: ~0.03 s of the ~200 N·m it pushes
  // with), and only `unbraced` of that unless he is blocking, set for the blow.
  // Past that the arm gives: the excess share of the impulse throws the shield
  // arm, the blow drives on past it (thrown back only by what the arm held),
  // and the guard is open, the arm going with the blow, for up to `open` s
  // (the whole of it at half the impulse over).
  // A blow meeting the face at a slant (its closing speed under `glance` of
  // its speed) glances along it and goes on, past the rim if that is where it goes.
  // A blade in it is turned back out about the hand up to `turnStep` rad a substep.
  // `wall` and `roof`: where the shield hand goes (heights) in a testudo
  // (formation.js): square before the chest, or up over the head; `roofTilt`,
  // how far forward a raised shield leans (of its facing).
  shield: { dropOnFall: 0.75, wrench: 60, strainLeak: 1, holdSeconds: 0.03, unbraced: 0.6, open: 0.4, glance: 0.45, turnStep: 0.5, wall: [0.36, 0.7, 0.1], roof: [0.26, 0.96, 0.03], roofTilt: 1.1 },
  weapons: { dropOnFall: 0.35, pickupSeconds: 0.45, pickupReach: 0.4, pickupGiveUp: 2, heavyFrom: 3.2, heavyAimJitter: 0.45 },
  // A long point: a couched lance, or a thrust with a weapon this long (m, shaft and all) or longer
  // (the 3.3 m war lance; not a 2.25 m spear). It comes on a line from far out: a man steps off that
  // line rather than back along it (AI.offLine), and a shield is put on the line to meet it.
  longPoint: 3,
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
  // On his knees with the pain (a lash, physics/whip.js): how far the hips drop and the trunk bows.
  pain: { dip: 0.27, lean: 0.35 },
  // The stance on all fours (crawlStance): each knee under the hip joint, and
  // out from it by `thighApart` × the thigh's radius over a lean man's
  // (`leanThigh` m): thick thighs meet and push the knees apart, so a thin man
  // crawls knees nearly together and a heavy one well apart; each foot `footOut` of his height further out, the
  // hands out from the shoulders by `armApart` of the arm's thickness.
  crawl: { speed: 0.3, accel: 0.3, strideHz: 1.1, stride: 0.06, dip: 0.3, lean: 1.1, turnSpeed: 0.7, turnOnSpot: 0.35, turnStride: 0.6, thighApart: 2, leanThigh: 0.06, footOut: 0.008, armApart: 0.8 },
  pin: { dip: 0.26, lean: 0.5, lockDistance: 0.2, weightShare: 0.6, gripStiffness: 4000, gripShare: 0.6, release: 0.6, lowNeck: 0.4, seconds: 4, retry: 1.2, struggleAfter: 0.8, pinners: 2 },
  // On horseback (physics/mounted.js; the breeds and barding in horses.js).
  // The rider sits his saddle: hips, knees and feet go where the saddle and
  // stirrups put them (no muscles of their own); the trunk, arms and weapon
  // are simulated as on foot, carried by the horse.
  // - startApart: m each side of the middle a mounted pair starts (room to charge).
  // - line: a team in a fight with riders in it starts in one line at `startApart` (the foot in
  //   their rows, abreast at the team spacing, the rows behind); the riders ride on the
  //   foot's flanks, `spacing` m apart across, and those who do not fit across the field
  //   form a rank `rankBack` m behind the last of the foot. Riders only: a line abreast.
  //   `spacing` is the room a horse wants (~2.4 m long, 0.7-0.9 m across, and the
  //   room to wheel without touching its neighbour): 3 m between horses' lines.
  // - seat: the knock (m/s of the trunk, as on foot) a man in a war saddle
  //   (high pommel and cantle) takes before he is thrown: `speed`, against the
  //   2.1 m/s that puts a man on foot over (WORLD.balance.speed); the seat
  //   couples him to the horse, so a share (`horseShare`) of the horse's mass
  //   resists a blow on him with his own (the cantle at his back, the stirrups,
  //   and the knees gripping the barrel: a rider braced on a horse is harder to
  //   unseat than one sitting on it). A horse that goes down slower than
  //   `kickFree` m/s lets its rider step clear: he is carried down with it but not flung
  //   (his speed is `carried` of what it was, he lands as a ragdoll); a faster fall
  //   throws him at the speed his horse lost, less the `grip` share his knees held.
  //   A lance's ~10 ms contact engages only the part of the horse the
  //   saddle's give lets it reach: a tenth, ~50-60 kg.
  // - coupling: a blow from the saddle has behind it the rider's body and, through
  //   the saddle and stirrups, a share of the horse: the target presses back along the
  //   line of the blow into the blade, the hand, the arm braced against the shoulder,
  //   the trunk and the seat, and the horse carries them all forward. How much of
  //   them takes part in the instant of contact is how rigidly the weapon is coupled
  //   to the body along that line: `forms` the share of the rider's mass by how it is
  //   held (the move's grip and mode; a move's own `coupling` overrides): `couched`
  //   a lance braced in the saddle and the lance rest (0.6, against 0.25 on foot: no
  //   rest, no cantle: a 90 kg man on a 600 kg horse puts ~115 kg behind the point, so
  //   a lance meeting a man at 12 m/s spends ~2 kJ; reconstructions of the joust
  //   measure 1-3 kJ), `twoThrust` a spear held under the arm against the ribs (the
  //   arm and the shaft a column into the trunk), `oneThrust` a point in one hand,
  //   `twoSwing` and `oneSwing` a cut or a swung head, which turns about the wrist and
  //   elbow and has only the locked arm and the shoulder on contact. The share is
  //   `across` at least, and its whole as the blow runs along the horse's own line
  //   (the stirrups and cantle brace the rider fore and aft; across it only his thighs
  //   hold him); the horse's mass takes part as `horse` of the rider's share (0.1 of it
  //   to the rider's 0.6 for the lance).
  // - twist: how far (rad) the rider turns his shoulders off his horse's line.
  // - swingPitch: how far (rad) below the shoulder a cut's mark lies for a man
  //   on foot at a man on foot (~0.3: the chest at arm's and blade's length);
  //   a rider's cut at a mark further down is the same swing turned down to it.
  // - seatHeight: the rider's hip joint above the saddle's seat (m).
  // - pass: m at least to one side of a man on foot the rider aims to pass
  //   him (his weapon side: clear of the horse's barrel), else as far off as
  //   puts the man's body (below him) `passReach` of his reach from the
  //   shoulder; against a rider, `passMounted` m between the horses' lines;
  //   a couched lance `passLance`.
  // - wheelAt: m past his man before he wheels round; `turnSpeed` the pace
  //   (m/s) he turns at; `edge` m from the arena's edge he turns away.
  // - horse: `blood` (share of its mass, ~8%: litres per kg) against a man's
  //   (`manBlood`, kg of a reference man's blood: 5.3 l), so a wound's loss is
  //   that much smaller a share; `heartSeconds` a pierced heart or great
  //   vessel leaves it standing; `legBreak` J of blunt or cut harm through a
  //   leg that cripples it; `headStun` J of blunt harm to the head that drops it;
  //   `trunkFatal` J of blunt harm summed on the body that kills it;
  //   `boltSeconds` a riderless horse runs before it stands.
  // - trample: a horse (and its rider) running into men on foot, a momentum
  //   exchange between the laden horse (~600-800 kg) and the men it meets:
  //   closing faster than `crash.from` it is a blow, the impulse then reduced
  //   mass x closing x (1 + `crash.restitution`) shared across the men's bodies by `legs` (the knees
  //   and feet take that share of what the upper body does: struck at the
  //   chest he is tipped over backwards, a ragdoll). Men standing with hips
  //   within `link` m of each other (close order: a shield wall's frontage,
  //   a pike block's file) take it as one block of up to `most`, the front
  //   (touched) men fully, those packed behind half (`behind`): the block's
  //   whole mass is what the horse has to move, so a dense line stops it. A
  //   man goes over if his own speed change is past `fell` m/s (a man on foot
  //   is put over by ~1.5; a horse's push is broadside across the chest) raised
  //   by `poiseGain` per unit of poise over 1 (armour and a rigid shell spread
  //   the blow into braced legs), and staggers (armoured) from `fell` x
  //   stagger.startAt. The harm to each, the man's trunk and the horse's chest,
  //   is the general crash rule (WORLD.crash), not this module's.
  // - hooves: a hoof in the stance (within `height` of the withers of the ground)
  //   on a man lying there bears `stance` of the laden horse's weight for
  //   `seconds` (an impulse on his trunk, taken as a crash: the ground behind him), once every
  //   `every` s a hoof.
  // - brace: a man on foot standing (slower than `still` m/s) with a thrusting
  //   weapon `length` m or longer, set against a horse's charge, has `share` of his
  //   own mass behind its point as well as his arms (his foot against the butt,
  //   his weight on the shaft).
  // - crash: a laden horse's speed change (m/s: impulse over its mass) from
  //   anything it runs into: past `fall` (its speed change along its line plus
  //   `lateral` of what comes across: a head-on crash is worst, a sidelong one
  //   mostly shoves; the knocks of the last `shockSeconds` add) it goes down and throws its rider; short of it the rider is
  //   knocked by the speed it lost (WORLD.mount.seat). Horses meeting exchange
  //   momentum by their laden masses; a shove across its
  //   line is `shove`, a velocity of its own that dies away in 1/`shoveDecay` s
  //   (its legs find the ground again). The harm to each horse is the general
  //   crash rule's (WORLD.crash `horse`: through its barding). Two horses of
  //   one side meet softly: closing slower than `alliedFrom` m/s they are only
  //   eased apart and their pace evened out (the legs find room; riders carried, no
  //   knock, no fall, no harm); a hard head-on at more is a crash as any other.
  // - stamina: a gallop tires a horse. At full effort (a gallop; effort is 0 at
  //   `easy` of its gallop speed and less) it is spent in `gallopSeconds`; at a walk it
  //   recovers in `restSeconds`; spent, its top speed is `slows` less.
  // - motion: the body of a horse rises, falls, pitches and rocks as it goes, from the
  //   same stride phase its legs and the drawn horse use (a gait's blend over `blend`
  //   m/s at the changes of gait). Per gait: `bob` [peak of the withers, rises a
  //   stride, stride phase at the top], `pitch` [rad nose up, phase at nose-up] once a stride,
  //   `rock` [rad leaning to its left, times a stride, phase]. A walk sways slowly, a trot
  //   bounces hard twice a stride (the suspension between diagonals), a canter rocks fore and
  //   aft once a stride in three beats, a gallop is low and smooth. The rider's seat is on
  //   the body, so it rises and falls with the horse. The trunk's lag, the lower back
  //   absorbing it: `seatSpring` (natural frequency `hz`, damping ratio `damping`) on
  //   the height the trunk is carried at; `lean`: forward lean (rad) of the trunk by
  //   gait, followed by a spring (`hz`, `damping`) which takes `follow` of the horse's
  //   pitch and leans back by `surge` rad per m/s² of the horse's acceleration.
  mount: {
    startApart: 12,
    line: { spacing: 3, rankBack: 5, margin: 1.5 },
    seat: { speed: 3.8, horseShare: 0.2, kickFree: 3, carried: 0.5, grip: 0.25 },
    coupling: { forms: { couched: 0.6, twoThrust: 0.35, oneThrust: 0.12, twoSwing: 0.04, oneSwing: 0.03 }, across: 0.4, horse: 0.167 },
    twist: 1.3,
    swingPitch: 0.3,
    seatHeight: 0.1,
    pass: 0.6, passReach: 0.5, passMounted: 1.5, passLance: 0.7,
    wheelAt: 9, turnSpeed: 5, edge: 6,
    horse: { manBlood: 75, heartSeconds: 10, legBreak: 160, headStun: 450, trunkFatal: 2500, boltSeconds: 4 },
    trample: { legs: 0.6, link: 0.9, most: 12, behind: 0.5, fell: 4, poiseGain: 0.15 },
    hooves: { height: 0.08, stance: 0.5, seconds: 0.08, every: 0.35 },
    brace: { length: 1.5, still: 0.5, share: 0.5 },
    crash: { fall: 6, lateral: 0.5, shockSeconds: 0.2, shoveDecay: 3, alliedFrom: 5 },
    stamina: { gallopSeconds: 60, restSeconds: 90, slows: 0.3, easy: 0.5 },
    motion: {
      blend: 0.5,
      stand: { bob: [0, 2, 0], pitch: [0, 0], rock: [0, 1, 0] },
      walk: { bob: [0.005, 2, 0.12], pitch: [0.025, 0.9], rock: [0.025, 1, 0.25] },
      trot: { bob: [0.024, 2, 0.475], pitch: [0.012, 0.1], rock: [0.012, 2, 0.2] },
      canter: { bob: [0.018, 1, 0.9], pitch: [0.03, 0.15], rock: [0.015, 1, 0.5] },
      gallop: { bob: [0.012, 1, 0.8], pitch: [0.025, 0.1], rock: [0.006, 1, 0.5] },
      seatSpring: { hz: 1.6, damping: 0.7 },
      lean: { walk: 0, trot: 0.03, canter: 0.06, gallop: 0.12, hz: 2, damping: 0.8, follow: 0.7, surge: 0.012 },
    },
  },
};
