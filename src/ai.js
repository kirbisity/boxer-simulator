// Fight AI: reads only what a fighter can see (distance, the opponent's strike
// starting, its own stamina) and issues the same commands a player would,
// choosing from its style's moves those that reach from where it stands.

import { aheadOfSlot, DRILL, fallIn, fromSlot, moveFormations, moveWings, volleyDue, walkToSlot, WINGS } from './formation.js';
import { keepOrders, obeyOrder, orderedFocus, orderKeepsPlace } from './command.js';
import { P } from './body.js';
import { MOVES, STRATEGIES, STYLES, moveRange } from './moves.js';
import { bladeFor, bodyHarm, chinNow, couchedGap, crawlingAway, dazedShare, dropWeapon, fightTier, hostile, inFight, legShare, longPoint, nearestOpponent, perform, point, reachOf, shedStandard, sightAngle, staggerShare, startCrawl, startPickup, strikeThreat, throwPunch, toLocal, useMounted, WORLD } from './physics.js';
import { vec, yawRotate } from './pose.js';
import { WEAPONS } from './weapons.js';
import { FACTIONS, factionOf } from './outfits.js';
import { castNet } from './physics/net.js';
import { heldOffAt } from './physics/brush.js';
import { handling } from './handling.js';
import { holdWing, reinFrom, ride, standToRider } from './riding.js';
import { walkingDistance } from './physics/fieldworks.js';
import { ammoLeft, emptied } from './physics/ranged.js';

export const AI = {
  // Against a gun: close in (to `within` m, then fight), weaving (rad/s),
  // and charge from `chargeFrom` m, this often a second.
  gunRush: { within: 1.1, weave: 5, chargeFrom: 3, chargePerSecond: 1.5 },
  // Held in a collar tie, how soon a brawler ties up back (per second).
  tieBackPerSecond: 3,
  // In a big fight, how often (s) a fighter with nothing happening near him thinks.
  idleThinkEvery: 0.1,
  // Cohesion in a group fight (a side of WORLD.standard.minSide or more):
  // each fighter, deciding for himself as ever, leans slightly towards his
  // side's standard (see keepLeaders). Within `radius` m, plus `radiusPerSqrt`
  // × √(men standing), no pull; beyond it a pull growing to full over `ramp`
  // m: a sideways lean towards him (`strafe`, of a full sidestep) and, run
  // out ahead of him, an easing of the advance (`holdBack`, share of the
  // forward step given up). Never within `engaged` m of reach of his man:
  // the exchange decides then. Choosing whom to fight, a man near my leader
  // counts as `focus` m nearer for each m he is nearer him. A shooter running
  // for room weighs each m a spot lies beyond that ground as `escape` m less
  // distance from his pursuer: the run away still wins, but bends homeward.
  // The retiarius's net: thrown from `from` to `to` m, at `rate` a second while there.
  net: { from: 1.3, to: 3.2, rate: 1.2 },
  // A man going to take up his fallen standard runs to it from further than `runFor` m.
  // Weighted heavily: a man keeps with his leader (and picks men near him) before going off on his own fight.
  cohesion: { radius: 1.6, radiusPerSqrt: 0.6, ramp: 2.5, strafe: 0.8, holdBack: 0.9, engaged: 0.8, focus: 0.6, escape: 0.5, runFor: 1.5 },
  // A side's leader (its standard's bearer, its general), when the AI has him and he has no place in the ranks (a rider,
  // a man of a loose army), keeps with the body of his men rather than going on at the enemy ahead of them
  // (keepWithHisMen): he goes no nearer the enemy than the man of them a `body` share of the way out from the
  // nearest (each man's distance to his own nearest enemy; 0.5, the middle one: at the main body, not before it),
  // give or take `slack` m. Held there, on foot he does not step forward; on a horse he rides on across the way to
  // them and not into it (riding.js reinFrom), reckoned from where his horse will be `foresee` s on at the pace it
  // closes with them (a horse at the gallop, 9 m/s, needs a second and more to be turned off its line: measured at
  // Pyongyang, a general held from the moment he was level with his men's middle still rode 7 m past it). The enemy come to him, within both reaches and `engaged` m (the
  // cohesion's), he fights where he is; and as his men close, the line he may come to closes with them, so he comes
  // to hand-to-hand when they do. Only with `minMen` of his men or more on their feet (fewer are not a body to keep
  // with). A general led from among his men, not before them: the chanyu among his riders, Surena with his horse
  // archers; the commander who rode out ahead of his own was the one cut off (Publius Crassus at Carrhae).
  // (His kit is his men's way of fighting too: a shooter leading shooters keeps his bow, WORLD.standard.shooters.)
  // (These are AI.general's `body`, `slack`, `foresee`, `engaged` and `minMen`, set with the rest of it below.)
  // Passive: runs from anyone nearer than `safeDistance` m, at a run while stamina is over `runWhile`.
  passive: { safeDistance: 3.5, runWhile: 0.2 },
  // A gunman running for room: points `stride` m away in `directions`
  // directions, scored by distance from him, room to the edge (weighted)
  // and not running past him (weighted); a fresh choice every `rethink` s.
  gunKite: { stride: 2.5, directions: 16, wallMargin: 0.7, roomWeight: 0.8, pastWeight: 2.5, rethink: 0.4 },
  bodyShotShare: 0.2,
  // Seconds between attacks; pros throw ~40–60 strikes a round, in bursts.
  restMin: 0.9,
  restRange: 2.0,
  rangeSlack: 0.12,
  // Pelvis-to-pelvis distance beyond arm reach the AI stands at: the lead
  // hand then lands near full extension, when it is fastest.
  rangeExtra: 0.2,
  // Closing into range: full pace until this far (m) beyond his working range, then easing to `approachFloor` of it.
  approachBrake: 1.0,
  approachFloor: 0.35,
  // Kickers hold a little further out than punchers.
  kickerExtra: 0.15,
  // Charges per second at range, per unit of the style's rush weight: at
  // 0.006 about one every two minutes, more for the charging styles.
  rushPerWeight: 1.5,
  // A charge after the bow (ranged.charge) runs until he is within this share of the sword's reach.
  chargeInto: 1.1,
  // A man who charges (inputs.charging) runs in from this far (m) beyond his reach.
  charging: { runFrom: 1.5 },
  // Pressure spells: how long one lasts, and how often they start per
  // second per unit of the style's pressure share.
  pressureSeconds: 4,
  pressureSpellsPerShare: 0.25,
  // Seeing a strike start and moving: ~0.2 s for an untrained man, ~0.1 s
  // for an elite boxer, who reads the shoulder before the glove moves.
  reactionSeconds: 0.15,
  reactionTrained: 0.08,
  reactionJitter: 0.04,
  // A couched point carried in at a run is watched, not answered, until it
  // is within `couchedWatch` m of him (its gap, physics couchedGap): from then
  // the reaction runs as to any blow starting.
  couchedWatch: 0.6,
  // A long point (physics longPoint: a couched lance; a thrust with a weapon WORLD.longPoint m long or more) is answered off
  // its line: a sidestep (weight `sidestep` among the style's defences), a straight step back
  // (`stepBack` of its weight) and the guard (`guard`) far less. And while a couched point comes at
  // him he does not walk onto it: he holds his ground, watching it, until he steps off its line.
  offLine: { sidestep: 1.2, stepBack: 0.15, guard: 0.3 },
  // How much more often a straight punch to the head is slipped than the
  // style's overall mix says (the mix includes body shots, which cannot be).
  slipPreference: 3,
  // A heavy blow (a weapon of `heavyMass` kg or more counts as fully heavy;
  // a loaded heavy strike as `loaded`) is seen and got out of the way of:
  // up to `defend` more likely to be answered, and answered by moving (slip,
  // lean back, step back; weighted up to `move` times, and open to anyone)
  // rather than by blocking (weighted down to `block` of itself).
  evadeHeavy: { heavyMass: 4, loaded: 0.6, defend: 0.6, move: 3, block: 0.4 },
  // A game plan lasts this long (s, plus up to `strategyRange`) before a rethink.
  strategySeconds: 20,
  strategyRange: 20,
  strategyMinimum: 6, // s a new plan is kept before hurt or finishing may change it
  // Heavy attacks: extra share when the opponent is hurt and there to be finished.
  finishingHeavy: 0.15,
  neutralDistance: 1.8, // m kept from an opponent who is down or rising
  // The longer weapon: hold this far (m) inside my reach and outside his;
  // he is coming in when the gap closes faster than `closingSpeed` (m/s);
  // then a burst of `burstMin` + up to `burstRange` × burstiness attacks.
  range: { inside: 0.12, outside: 0.25, closingSpeed: 0.4, burstMin: 2, burstRange: 2 },
  // Picking a weapon up: as far as he will go for one (m); it must be this
  // much nearer him than any of them (unless it is at his feet), and not
  // with a blow coming at him; he stoops for it this near (hips to weapon, m), and
  // when it lies no deeper than `reachDown` m below his feet (a hand stooping reaches the ground he stands on, not
  // the bottom of a ditch: he goes down to it first).
  // `eagerness`: chance per second, when one is there for the taking, that he goes for it.
  pickup: { enabled: true, maxDistance: 3.5, margin: 0.3, atFeet: 0.7, stoopAt: 0.55, eagerness: 1.5, shieldClear: 2.5, reachDown: 0.3 },
  // A mixed fighter's spells in one style (s, give or take half).
  mix: { seconds: 10 },
  // Holding the last man down: how near his chest (m, hips to chest) to kneel, and how many hold at once.
  pin: { reach: 0.55, pinners: 2 },
  // Fear and confidence: how much stronger one side's shots are than the
  // other's (ratio of threats) makes for full confidence or full fear;
  // how many clean shots felt before experience weighs as much as the look
  // of the man; and what confidence (+1) or fear (−1) does to the fight.
  confidenceRatio: 2.5,
  // Fear, panic and adrenaline. `fear` 0..1 follows (over `settle` s) a
  // target made of feeling outmatched (`outmatched` × fear from nerve) and
  // of being hurt (`hurt` × the worst of brain strain, blood lost, gunshot
  // harm and knockdowns, `perKnockdown` each), less the armour's courage.
  // Past `breakAt` he may break (`rate`/s at full fear) into the passive
  // style — unless adrenaline is over `adrenalineHolds`. He comes out once
  // fear is under `calmAt` for `calmSeconds`, or adrenaline surges.
  // Crawling away: a panicked man hurt past `from` (his worst of hurtShare
  // and his legs' damage) goes down on his knees at up to `rate` a second
  // (scaled by how far past), much less with adrenaline in him (`adrenaline`:
  // the share it takes away at full). Crawling, he keeps going away from the
  // nearest enemy, `away` m at a time.
  // He keeps the way he chose for `rethink` s, or till within `arrived` m of it.
  // At a wall he crawls along it only with an enemy within `pressed` m.
  // A broken limb alone (an arm, a leg that will not bear him; `limbFrom` of
  // legShare and `perArm` for each broken arm) puts a man on his knees too,
  // panicked or not, at up to `limbRate` a second.
  crawl: { from: 0.45, rate: 0.8, adrenaline: 0.9, away: 3, rethink: 1.5, arrived: 0.6, pressed: 2, limbFrom: 0.45, limbRate: 0.5, perArm: 0.6 },
  // `standardDown`: fear, for every man of a side, while its standard lies
  // fallen (or, without one, for `leaderLostFor` s after its leader falls).
  // `brokenArm` / `brokenLeg`: fear for each arm or leg of his broken.
  // A weapon is fear in itself, the more the deadlier (WEAPONS threat:
  // fists 1, a knife 2.2, a sword 3–4.9, a gun 5–7): `armed` at full for one
  // `lethalSpan` deadlier than what he holds himself (his own counted at
  // `ownWeapon`: a sword in your hand is comfort against a sword, not
  // against a rifle). Being outmatched — by size and strength (nerve) or by
  // the weapon — multiplies the rest: × (1 + `mismatch` × how outmatched).
  // The weapon is feared at full within `dreadNear` m of its reach, fading
  // out over `dreadFade` m beyond; a bow or gun beyond that is still
  // `dreadAtRange` of it (men stood under volleys; few broke at the first).
  // Until he has felt it (`proven` clean blows taken), a weapon is feared at
  // `unproven` of that, and the mismatch multiplier at `unprovenMismatch`:
  // a man does not break at the sight of a sword before a blow has landed,
  // as often he does after one.
  // In the ring, unarmed (a sport, a referee, a bell), fear is `ring` of it.
  // A drilled man still in his ranks (gear.drill, a slot) fears `drilled` of
  // it: the files at his shoulders, and the training (legions broke seldom).
  // A man who has broken once breaks the easier: `breakAt` falls by
  // `brokeBefore` each time, to `breakAtLeast`.
  panic: {
    settle: 2, outmatched: 0.5, hurt: 0.9, perKnockdown: 0.22, breakAt: 0.83, rate: 0.5, adrenalineHolds: 0.55, calmAt: 0.4, calmSeconds: 3, standardDown: 0.35, leaderLostFor: 6,
    brokenArm: 0.2, brokenLeg: 0.3, armed: 0.35, lethalSpan: 4, ownWeapon: 0.92, dreadNear: 1.5, dreadFade: 5, dreadAtRange: 0.3, drilled: 0.7, unproven: 0.4, unprovenMismatch: 0.75, proven: 2, mismatch: 0.7, ring: 0.45, brokeBefore: 0.06, breakAtLeast: 0.5,
  },
  // Routs. Few battles are fought to the last man: as a side's men fall,
  // crawl off or break, fear runs through the rest. In a side of at least
  // `minSide`, each man fears `losses` at full as the share of his side lost
  // goes from `lossesFrom` to `lossesFull`, and `contagion` for each of his
  // own he sees broken within `within` m (up to `contagionMost`). The share
  // lost is of the side's strength, not its heads (each man as much as he
  // was worth at the start, AI.strength): the best of a side going down takes
  // more of its heart than as many of the rest. A broken
  // man of such a side runs for his own rear; at the field's edge (within
  // `edge` m) with no enemy within `clearOf` m he has fled: out of the battle,
  // and he does not come back. History has most battles end so.
  // Contagion: a comrade breaking and running is the most frightening thing
  // a man in a line can see. Each broken man of his own within `within` m
  // counts in full within `close` m, fading to nothing at `within`; one well
  // behind him (more than `behindFrom` m back, by his side's front) he hardly
  // sees, `behind` of it (a man running back through the ranks is in front of
  // those behind him, and is seen: the rear feels a front that breaks).
  // `follow`: a man beside a runner (within `beside` m) may go with him: a
  // chance a second of `rate` at full fear for each runner beside him (up to
  // `followMost` of them), from fear `from` (a steady man does not run because
  // his neighbour does; a frightened one does), less discipline's `discipline`
  // share of it at full (Qi's law: the squad of a man who ran died with him).
  // So a weak line that starts to go, goes all at once: the domino.
  // How the broken go (in a battle on a closed field: not level mode, whose
  // stages have their own rout). A man who breaks goes one of two ways,
  // decided as he breaks:
  // - `crawl`: down on his hands and knees, crawling away (out of the fight:
  //   a man on his knees is no longer a soldier). The chance is `share`, and
  //   `hurt` more at full hurt (hurtShare, his legs'), `tired` more with his
  //   stamina spent, `afraid` more as far past breaking as his fear goes, up
  //   to `most`: the wounded and the spent go down, the merely frightened run.
  //   A crawler who reaches the edge with nobody within `clearOf` m has
  //   crawled off the field.
  // - else he runs, and a broken man's flight is no charge: a stumbling jog,
  //   looking back, at `pace` of the run he would charge at (fear takes the
  //   legs: men who ran from a field ran badly, and were cut down from behind).
  // `rally`: a runner who gets clear (at the field's edge, nobody within
  // `clearOf` m) does not stand there. Often he finds his nerve and comes
  // back: a chance of `chance`, less `hurt` of it at full hurt, `again` of
  // that for each time he has come back already, never more than `most`
  // times (so a battle still ends: each man comes back at most twice, and
  // breaks the easier each time, AI.panic brokeBefore). Else he goes, off the
  // field and out of the battle (not drawn: gone, as men who fled were).
  // A man who comes back comes back with his fear at `nerve`, felt `steadied`
  // less for `steadyFor` s (he has talked himself into it); and for `shaky` s
  // he is hesitant: he goes in at `pace` of his steps and never at a run,
  // hangs back as a man `hesitant` afraid would (morale hesitate) and covers
  // up `guard` less (his mind is on the way out). Broken again, he runs
  // again: scared, run, return, scared, his back to the enemy half the time —
  // a side that has started to go fights badly, and does not stand at the
  // edge of the field in a line doing nothing.
  rout: {
    minSide: 4, losses: 0.35, lossesFrom: 0.3, lossesFull: 0.75, contagion: 0.1, contagionMost: 0.3, within: 5, close: 1.5, behind: 0.35, behindFrom: 1, edge: 1.6, clearOf: 4,
    follow: { beside: 3, rate: 1.5, followMost: 2, from: 0.3, discipline: 0.9 },
    pace: 0.7,
    crawl: { share: 0.15, hurt: 0.9, tired: 0.35, afraid: 0.4, most: 0.85 },
    rally: { chance: 0.65, hurt: 1, again: 0.5, most: 2, nerve: 0.35, steadied: 0.35, steadyFor: 8, shaky: 10, pace: 0.6, hesitant: 0.7, guard: 0.5 },
  },
  // How much fight there is in a man, as another sizes him up at a glance
  // (strengthOf): his weapon's harm, its reach, his armour, a horse under
  // him, his training and his size, and the state he is in. Each a factor,
  // 1 for a bare-handed, fit, ordinary man on foot, unhurt and unarmoured:
  // - `weapon`: what he holds, WEAPONS threat (fists 1, a knife 2.2, a sword
  //   3–4.9, a gun 5–7) to this power: a sword makes a man about twice as
  //   much to face as bare hands; a gun a little more again;
  // - `reach`: per metre of reach past his bare arm (a spear keeps a sword off);
  // - `armour`: × (1 + `armour` × his kit's protection, the mean of blunt, cut
  //   and pierce): plate (0.8) about double, brigandine 1.9, a hemp vest 1.1;
  // - `mounted`: on a horse: above you, ten times your weight, and fast. Men
  //   on foot dreaded horse, the more so men who had never seen one;
  // - `skill`: × (1 + `skill` × (his skill − 0.5)): a samurai (0.7–0.85) over a levy (0.25);
  // - `size`: his muscle over `muscleKg` (a fit 70 kg man's), to this power:
  //   strength, not weight (armour is counted above; age and want show here:
  //   a thin old levy has three quarters of a young raider's);
  // - `hurt`: × (1 − `hurt` × how hurt he is, hurtShare);
  // - `broken`: a man broken and running is this share of what he was (nobody fears a back);
  //   one down on his knees or crawling, `down` of it.
  strength: { weapon: 0.6, reach: 0.3, armour: 1.2, mounted: 2.5, skill: 1.2, size: 1, muscleKg: 28, hurt: 0.8, broken: 0.2, down: 0.1 },
  // Perceived relative strength (standingFear): each man weighs the knot of
  // enemies before him (those round the nearest of them) against himself and
  // the comrades round him, every man by strengthOf, each counted in full
  // within `group` m of the middle of his own knot and fading out over
  // `groupFade` m more. The log of their strength over ours is the gap: within
  // `parity` of even (e^0.25: a quarter stronger either way) it is nothing, and
  // morale is as it would be; past it, fear grows to `fear` over `span` more
  // (e^0.9: ×2.5), and the stronger side is steadied as much, down to
  // −`steady` (a samurai among frightened levies is sure of himself; the
  // levies are not). It is felt as they come: in full with the nearest of them
  // within `near` m (a few strides: a charge that close is upon him), fading
  // to nothing at `sight` m (a charge seen coming across a square frightens
  // before it lands: men broke at the sight of it). The same weighing in a duel, one
  // against many and a battle: only who is there differs. (It stands in for
  // counting heads: three on one is three times one man's strength.)
  standing: { group: 3, groupFade: 3, near: 6, sight: 16, parity: 0.25, span: 0.9, fear: 0.5, steady: 0.25 },
  // The field seen (outnumberedFear): in a battle (a side of `rout.minSide`
  // or more), what a man makes of the whole of it, not the knot before him:
  // how many of his own still fight (on their feet, not broken, not crawling
  // off: stillFighting) against how many of theirs, each by strengthOf. Even
  // to `from` (half as many again) a man does not count heads: battles were
  // fought at worse odds every day. Past it fear grows, log by log, to `fear`
  // at `full` (three to one: the line has gone, the men round him are all
  // that is left) and on to `most` at `beyond` (six to one: there is nothing
  // left to fight for). Felt by every man of the side, wherever he stands: the
  // last handful of a beaten army knew the battle was lost and broke, or
  // threw down their arms, rather than die to the last man (who fights on at
  // such odds are the few with the courage or the discipline for it: both
  // still damp it, fearTarget). Strength, not heads, as AI.standing: a knot
  // of armoured knights is not outnumbered by a crowd of peasants twice its number.
  outnumbered: { from: 1.5, full: 3, fear: 0.45, beyond: 6, most: 0.8 },
  // The general (keepGenerals): each side of at least `minSide` men (a
  // company or more; a handful of men, who all see each other, fight as one
  // knot round the standard and its leader, as before) has one man in command: the man played, while he fights (the player
  // leads his side); else its leader (the standard's: one who led in life, or
  // the man at its middle). His side forms on him: the rallying point the
  // loose men keep near (AI.cohesion) is where he stands, the standard beside
  // him; drilled men keep their places in the ranks (formation.js) and are
  // not drawn off. When an enemy still fighting comes within `threat` m of
  // him, the `guards` men of his own nearest him (loose men, within `guardFrom`
  // m: his household, his retinue) go for that man first: they put themselves
  // between him and the blow, as a lord's men did. Men within `heartWithin` m
  // who see him still on his feet take heart, `heart` off their fear (the
  // general in the thick of it). If he falls (out, fled, crawling off, or
  // broken and running), his whole side feels it, `fell` and `saw` more for
  // a man within `sawWithin` m of where he went down, fading over `fellFor`
  // s (armies broke at the cry that the king was dead: Hastings, Bosworth);
  // and command passes at once to the strongest man still fighting within
  // `successorWithin` m of where he fell (strengthOf: the best-armed, the
  // best-trained, the knight among the levies), else the nearest of them.
  general: { minSide: 8, threat: 5, guards: 3, guardFrom: 10, heartWithin: 8, heart: 0.06, fell: 0.2, saw: 0.15, sawWithin: 10, fellFor: 8, successorWithin: 8, body: 0.5, slack: 1, foresee: 1.2, engaged: 0.8, minMen: 3 },
  // Morale in a battle (a side of at least `rout.minSide`): what the men
  // round a man do to his fear, whoever they are. Within `near` m of him:
  // - no man of his own standing there (`alone`): fear; each who stands
  //   with him takes `support` off, up to `supportMost` (the files at his
  //   shoulders: men stood in a line who would have run alone);
  // - (more of them than of his own, and stronger: AI.standing, by strength, not heads);
  // - men of the other side in their places in a drilled body (formation.js):
  //   `formed` each, up to `formedMost` (a line that holds is frightening to run at);
  // - his own falling round him (out, crawling off), within `fallenWithin`
  //   m and the last `fallenFor` s: `fallen` each, up to `fallenMost`; each
  //   counted by what he was worth to the side (AI.strength) against its
  //   average, from `worthLeast` to `worthMost` of an ordinary man (the
  //   samurai who led the rush cut down before you is worth three of the boys
  //   beside him: it is losing your best that breaks a side).
  // Afraid but not broken (fear 0..1), a man hesitates: he stands `hesitate.range`
  // m further off at full fear, presses `pressure` less, waits `tempo` longer between
  // attacks (most men in a melee hang back; the bold and the desperate do the fighting).
  // Discipline (a side's `discipline`, 0..1, set by its level: a fact about
  // that army — Qi Jiguang's law and drill; a coast garrison's none): his
  // fear is taken down by `discipline` of it at full, and he breaks the
  // later, `breakLater` of the way from breakAt to 1 at full (a man who
  // knows his squad will be put to death if he runs does not run).
  morale: { near: 2.5, alone: 0.12, support: 0.04, supportMost: 0.12, worthLeast: 0.5, worthMost: 3, formed: 0.1, formedMost: 0.4, fallen: 0.12, fallenMost: 0.36, fallenWithin: 6, fallenFor: 8, shock: 0.4, shockFull: 0.3, shockFor: 10, hesitate: { range: 0.8, pressure: 0.8, tempo: 2 }, discipline: 0.6, breakLater: 0.6 },
  // Shock: what frightens beyond the harm it does (shockFear). Any man, any side.
  // - A gun going off near him (a 'shot': the powder's bang and flash and
  //   smoke): each heard startles him by `blast`, in full within `blastNear` m
  //   of the muzzle and fading to nothing at `blastFar` (the enemy's guns:
  //   his own he expects, and they fire away from him); the startle adds up
  //   and dies away with a half-life of `halfLife` s, and frightens him up to
  //   `blastMost`. Small for men used to it: a soldier who has stood in a line
  //   of guns flinches and goes on (men stood under volleys; few broke at the first).
  // - A horse coming at him (a rider of the other side at more than
  //   `horseSpeed` m/s, heading within `horseCone` (cosine) of straight at
  //   him): `horse` in full within `horseNear` m, fading to nothing at
  //   `horseFar` (half a tonne at a gallop: men on foot have always given way
  //   before it). Only the nearest such horse counts.
  // - `strange`: to a people who had never met it (FACTIONS `strangers`: the
  //   Inca, the Mexica: the Americas had no horse and no powder), each of
  //   these is `strange` times the shock. Why three: the Spaniards and the Inca
  //   tell alike how the first guns and horses struck the Andes. The Inca
  //   called the gun illapa, the thunder; at Cajamarca the crowd, thousands
  //   strong, ran from a few dozen horse and a falconet's shot until they threw
  //   down a wall in the crush, which no account has a European army do at a
  //   handful of shots. Within four years (Sacsayhuamán, 1536) the same people
  //   fought horse with pits and bolas: it was the strangeness, not the
  //   strength. Three makes a blast or a charge a frightening thing to them
  //   (near a third of the way to breaking alone) and leaves it a flinch to
  //   others; relative strength (AI.standing) already counts the horse's and
  //   the steel's real advantage, for everyone alike.
  shock: { blast: 0.06, blastMost: 0.15, blastNear: 4, blastFar: 16, halfLife: 5, horse: 0.1, horseNear: 3, horseFar: 10, horseSpeed: 3, horseCone: 0.7, strange: 3 },
  // An ambush (a side's `ambush`, physics.js createWorld: hidden men) is
  // sprung at its signal, when one of its men strikes, or when one of the
  // other side comes within `spotted` m of one (he is found out).
  ambush: { spotted: 1.5 },
  // Adrenaline 0..1: a surge on knocking a man down (`knockdown`) or on a
  // very hard blow survived (`hardHit` per unit of severity over `hardFrom`),
  // fading with `halfLife` s; how much a body surges depends on age, size
  // and sex (see adrenalineGain), and it takes away `nerve` of his fear in
  // an even fight, down to `nerveOutmatched` when hopelessly outmatched (no
  // rush of blood makes a man unafraid of a rifle). It holds him from
  // breaking over `holds` in an even fight, `holdsOutmatched` outmatched.
  adrenaline: { knockdown: 0.45, hardHit: 0.35, hardFrom: 0.6, halfLife: 35, nerve: 0.85, nerveOutmatched: 0.3, holdsOutmatched: 0.85 },
  // Fear per metre of reach the other has on me.
  reachFear: 0.6,
  // His weapon is out of line when it points this far off me (cosine).
  openingAngle: 0.5,
  experienceShots: 3,
  // `cadence`: a confident man works longer and moves less between, fear the reverse.
  confidence: { closer: 0.15, pressure: 1.0, tempo: 0.45, defend: 0.45, heavy: 0.08, cadence: 0.5 },
  // Team fights: a fighter facing an opponent already taken on by this many
  // team-mates looks for another, all else near equal (m of extra distance each).
  // Keeping to the man in front: every `every` s, a man of the other side `margin` m and `ratio` nearer than his own is taken instead;
  // a shooter who hits him draws him only from within `shooterWithin` m.
  retarget: { every: 0.3, margin: 1, ratio: 0.67, shooterWithin: 3 },
  crowdPenalty: 0.7,
  // The pursuit, in a battle: a broken man running is chased by those near him
  // (within `within` m), `chasers` of them at most; the rest let him go and
  // turn to whoever still stands to fight. A whole army did not run down one
  // fugitive: the winners kept their ground, and a few rode or ran after the runners.
  pursuit: { within: 10, chasers: 2 },
  // Team-mates keep this far apart (m), and treat one within this far of
  // the line to their man as in the line of fire.
  mateSpacing: 1.0,
  lineOfFire: 0.4,
  // m: in level mode a shooter holds his shot with a team-mate (the player among them) this near the line to his man: a shaft or a ball
  // does not fly true and the man moves as it comes. (Battles keep `lineOfFire`: their fingerprints.)
  shotLineOfFire: 0.9,
  // m: a heavy gun holds its shot at a man with a comrade this near him (and any bow or gun at a man at grips with ours).
  gunCrowd: 1.2,
  // s: a shooter who has held his shot this long for his own men in the way, his mark at grips with them, lets the bow
  // or the gun go and draws his sidearm to join them (heldTooLong): his shooting is done where the lines have met.
  holdShot: 4,
  // m: an arrow's drop and its spread at a long mark (and the mark on the move) want more room round him than a ball's.
  arrowCrowd: 2,
  // m: a comrade nearer than this on the line is not shot over (the man beside him, when the mark is off to that side:
  // the arrow cannot rise over his head so soon), nor a comrade on a horse at any range (physics/ranged.js overHeads
  // lifts over men on foot only). The man in the rank before him (DRILL's ~1.2 m) is shot over.
  overHeadsFrom: 1,
  // m: how far off a shooter looks for another mark when his own is fouled (clearMark).
  markWithin: 60,
  pastTarget: 0.45, // m: a team-mate this close behind my man is in the line too
  kickClearance: 1.3, // m: no kicks or knees with a team-mate this close, beside or ahead
  // Facing a longer reach (a sword, a baton, a spear) or a blade: keep out of
  // it, then surge. Outreached by this much (m) or facing an edge or a point
  // with nothing as long in hand, a fighter holds `margin` beyond the other's
  // reach, circling; after a wait (shorter when confident, at once when the
  // other has just thrown and is recovering) he surges in at `surgeSpeed`
  // × footwork, throws a burst of a few quick attacks, and retreats.
  blade: {
    outreachedBy: 0.25, margin: 0.3, slack: 0.12,
    surgeSpeed: 1.8, retreatSpeed: 1.4, surgeSeconds: 1.4,
    stepBackChance: 0.65,
  },
  // Cadence: every fighter alternates spells of moving (circling, nothing
  // thrown but into an opening) and of working (attacking, much of it in
  // quick bursts). Mean spell lengths (s) before the style, plan, temper
  // and nerve stretch them; how widely each fighter's temperament varies
  // (e^±spread on each trait); the gap between attacks in a burst (s); and
  // how readily a moving fighter jumps on an opponent recovering from a miss.
  cadence: { workSeconds: 4.5, moveSeconds: 1.6, spread: 0.45, burstGap: 0.1, openingChance: 0.7 },
  // A machine (`gear.machine`: a robot) never tires (physics.js: its stamina stays full), so it has no
  // reason to pause: no circling between flurries, no surge-and-retreat against a longer reach, one
  // attack after another as fast as its motors reset (`rest`: this share of a fresh man's pause after an attack).
  machine: { rest: 0.35 },
  // Numbers: confidence gained per doubling of my side's standing fighters
  // over theirs (lost when outnumbered).
  numbersConfidence: 0.45,
  // A gang: at most this many take on one man at once; the rest hold this
  // far outside their range and circle until a place or another man frees up.
  engageSlots: 3,
  // Men of a squad (formation.js, a drill with `squad`: Qi Jiguang's) pick the enemy their own are already on: each of them already
  // on him counts as `together` m nearer, up to engageSlots (several on one: the squad's local superiority).
  // A raider held off by one of their wolf-brushes (physics/brush.js) within `held` m (a stride or two) beyond a man's own reach is his to
  // strike, whoever he was on, if his weapon reaches `longFrom` m or more (a spear, a guandao): the langxian guards, the
  // spear kills (the Jixiao xinshu's order of the squad). The short arms (the shields' and the swords') leave him to
  // them while there is another raider to face, and keep the front against the rest: crowding in on him, they would
  // only stand in the spears' way (teamSpacing: no thrust through a comrade).
  // Going out to him, a man walks up to `strikeAt` of his reach (where a point lands: STYLES keepPoint) and strikes.
  squad: { together: 1, held: 2.5, longFrom: 1.6, strikeAt: 0.9 },
  // A wolf-brush's bearer holding a man (holdWithBrush): within `band` m of the distance it holds him at he stands; off
  // it, he steps in or gives ground at `give` of his footwork, the brush kept on him.
  brush: { band: 0.25, give: 0.5 },
  waitingDistance: 0.5,
  // How often (per second) a waiting fighter looks for a less crowded man.
  refocusRate: 0.6,
};

/**
 * The game plan for now: survive when hurt, finish when the opponent is,
 * otherwise a weighted pick that holds for a while.
 */
function chooseStrategy(world, fighter, opponent, dt) {
  // Hurt means after a knockdown, not a passing stun: a plan is held, not flipped.
  const hurt = fighter.hurt > 0;
  const finishing = opponent.hurt > 0 || opponent.state === 'rising';
  fighter.aiStrategyFor = (fighter.aiStrategyFor ?? 0) - dt;
  // A new plan is kept at least `strategyMinimum` s before it can be flipped.
  const held = world.time - (fighter.aiStrategySince ?? -Infinity) < AI.strategyMinimum;
  let next = null;
  if (hurt && fighter.aiStrategy !== 'outboxer' && !held) next = 'outboxer';
  else if (!hurt && finishing && !['pressure', 'brawler'].includes(fighter.aiStrategy) && !held) next = world.random() < 0.5 ? 'pressure' : 'brawler';
  else if (!fighter.aiStrategy || fighter.aiStrategyFor <= 0) next = pick(Object.fromEntries(Object.entries(STRATEGIES).map(([key, plan]) => [key, plan.weight * (STYLES[fighter.style].plans?.[key] ?? 1)])), world.random);
  if (next) {
    if (next !== fighter.aiStrategy) world.events.push({ time: world.time, kind: 'strategy', fighter: fighter.id, strategy: next, effects: [] });
    fighter.aiStrategy = next;
    fighter.aiStrategyFor = AI.strategySeconds + world.random() * AI.strategyRange;
    fighter.aiStrategySince = world.time;
  }
  return STRATEGIES[fighter.aiStrategy];
}

function pick(weights, random) {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  let roll = random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[0]?.[0] ?? null;
}

/** One AI decision tick for every fighter not driven by the player. */
export function thinkAll(world, dt, playerIds = new Set()) {
  keepGenerals(world, playerIds);
  keepLeaders(world);
  keepSides(world);
  springAmbush(world);
  keepShock(world, dt);
  moveFormations(world, dt, hurtShare);
  moveWings(world, dt);
  // The player's orders to his side (command.js).
  keepOrders(world);
  // In a big fight, a fighter with nothing happening near him thinks ten
  // times a second (each on his own beat) rather than every step.
  const staggered = fightTier(world) >= 3;
  for (const fighter of world.fighters) {
    if (playerIds.has(fighter.id)) continue;
    // Level mode: a dormant man (his section is not active) is not thought for; nor is a neutral one (corner 'grey': civilians, prisoners), nor one levelmode drives itself (`driven`: unaware, searching, following; levelmode/awareness.js).
    if (fighter.dormant || fighter.corner === 'grey' || fighter.driven) continue;
    // A man lying in ambush waits where he is, unseen, for the signal (springAmbush).
    if (fighter.hidden) continue;
    if (!staggered || fighter.detail === 'full' || fighter.detail === undefined) {
      // Cleared, so that once he is staggered he takes up his own beat.
      fighter.aiOwed = undefined;
      think(world, fighter, dt);
      keepPlace(world, fighter);
      continue;
    }
    // Each on his own beat (offset by his id), so the thinking is spread over the steps.
    fighter.aiOwed = (fighter.aiOwed ?? (fighter.id % 6) * dt) + dt;
    if (fighter.aiOwed < AI.idleThinkEvery - 1e-9) continue;
    think(world, fighter, fighter.aiOwed);
    keepPlace(world, fighter);
    fighter.aiOwed = 0;
  }
}

/**
 * Each side's rallying point (world.leaders), from its standard: the man
 * bearing it (in his hands or on his back), or, fallen, the standard where
 * it lies, and the man nearest it, whose first care is to take it up. A
 * side without a standard follows a leader; when he is out, the man nearest
 * where he fell takes over. Only sides big enough have one (world.standards).
 */
function keepLeaders(world) {
  world.leaders = {};
  for (const [corner, standard] of Object.entries(world.standards ?? {})) {
    const side = world.fighters.filter((fighter) => fighter.corner === corner && inFight(fighter));
    if (!side.length) continue;
    const leader = world.fighters[standard.leader];
    let bearer = null;
    let lying = null;
    if (standard.kind) {
      // A fallen leader lets the standard go: from his hands, or off his back.
      if (leader.state === 'out' && leader.weapon?.held && leader.weapon.spec.flag) dropWeapon(world, leader, 'dropped');
      if (leader.state === 'out' && leader.wornStandard && !leader.wornStandard.shed) shedStandard(world, leader);
      bearer = side.find((fighter) => (fighter.weapon?.held && fighter.weapon.kind === standard.kind) || (fighter.wornStandard && !fighter.wornStandard.shed)) ?? null;
      if (!bearer) {
        lying = world.debris.find((debris) => debris.weapon === standard.kind && !debris.taken && world.fighters[debris.owner]?.corner === corner) ?? null;
        // Lost altogether (it never is, but): the leader as without one.
        if (!lying) standard.kind = null;
      }
    }
    // The side's general (keepGenerals), while he fights: the man it forms on.
    const general = generalOf(world, corner);
    if (!standard.kind) {
      // No flag: the general is the leader; his fall is felt as a general's (generalFear), not twice.
      bearer = general ?? (leader.state === 'out' ? nearestTo(side.filter((fighter) => fighter.state === 'up'), point(leader.x, P.pelvis)) ?? leader : leader);
      if (bearer !== leader && !general) standard.lostAt = world.time;
    }
    if (bearer) standard.leader = bearer.id;
    // Where they rally: the standard where it lies (taking it up comes first), else the general, the standard beside him.
    const at = lying ? lying.x : general ? point(general.x, P.pelvis) : point(bearer.x, P.pelvis);
    // The man going for it keeps going while he can, rather than two turning back and forth.
    const able = side.filter((fighter) => fighter.state === 'up' && !fighter.panicked && !fighter.clinch && !fighter.pin);
    const going = lying && able.find((fighter) => fighter.id === standard.taker);
    const taker = lying ? going ?? nearestTo(able, at) : null;
    standard.taker = taker?.id;
    const shaken = Boolean(lying) || world.time - (standard.lostAt ?? -Infinity) < AI.panic.leaderLostFor;
    world.leaders[corner] = { leader: bearer, general, at: [at[0], at[2]], standing: side.length, lying, taker, shaken };
  }
}

/** A side's general (AI.general), if he is still fighting (stillFighting; the man played while he is in the fight); else null. */
export function generalOf(world, corner) {
  const id = world.generals?.[corner]?.id;
  const general = id === null || id === undefined ? null : world.fighters[id];
  return general && (general.player ? inFight(general) : stillFighting(general)) ? general : null;
}

/** Fallen from command: out, fled, crawling off, or broken and running (the man played never breaks: only down or gone). */
const fallenFromCommand = (fighter) => !inFight(fighter) || fighter.crawling || (fighter.panicked && !fighter.player);

/** He takes command of his side (a 'newGeneral' event, for the log). */
function appointGeneral(world, entry, fighter, how) {
  entry.id = fighter?.id ?? null;
  if (fighter) world.events.push({ time: world.time, kind: 'newGeneral', fighter: fighter.id, effects: [how] });
}

/**
 * The man who takes command where the general fell (AI.general): the
 * strongest still fighting within `successorWithin` m, else the nearest.
 */
export function successorOf(world, corner, where) {
  const spec = AI.general;
  const able = world.fighters.filter((fighter) => fighter.corner === corner && stillFighting(fighter));
  const apart = (fighter) => Math.hypot(fighter.x[P.pelvis * 3] - where[0], fighter.x[P.pelvis * 3 + 2] - where[1]);
  const near = able.filter((fighter) => apart(fighter) <= spec.successorWithin);
  if (near.length) return near.reduce((best, fighter) => (strengthNow(fighter) > strengthNow(best) ? fighter : best));
  return able.reduce((best, fighter) => (!best || apart(fighter) < apart(best) ? fighter : best), null);
}

/**
 * Each side's general (world.generals: { corner: { id, fellAt, fellWhere,
 * threat, guards } }), on the sides with a standard (world.standards) of
 * AI.general `minSide` men or more: the man played while he fights; else its leader at the
 * start; fallen, the strongest near where he fell (successorOf). And while
 * an enemy is upon him, the men nearest him who guard him (AI.general).
 */
function keepGenerals(world, playerIds) {
  const spec = AI.general;
  for (const corner of Object.keys(world.standards ?? {})) {
    if ((world.sides?.[corner]?.men ?? world.fighters.filter((fighter) => fighter.corner === corner).length) < spec.minSide) continue;
    const generals = (world.generals ??= {});
    const entry = (generals[corner] ??= { id: world.standards[corner].leader, fellAt: null, fellWhere: null, threat: null, guards: [] });
    const general = entry.id === null ? null : world.fighters[entry.id];
    if (general && fallenFromCommand(general)) {
      // Fallen: felt by his side (generalFear), and command passes.
      entry.fellAt = world.time;
      entry.fellWhere = [general.x[P.pelvis * 3], general.x[P.pelvis * 3 + 2]];
      world.events.push({ time: world.time, kind: 'generalFell', fighter: general.id, effects: ['the general has fallen'] });
      appointGeneral(world, entry, successorOf(world, corner, entry.fellWhere), 'takes command');
    } else if (!general) {
      // Nobody was left to take it the last time; someone may be on his feet again.
      const successor = successorOf(world, corner, entry.fellWhere ?? [0, 0]);
      if (successor) appointGeneral(world, entry, successor, 'takes command');
    }
    // The man played leads his side while he is in the fight.
    const played = world.fighters.find((fighter) => fighter.corner === corner && playerIds.has(fighter.id) && inFight(fighter) && !fighter.crawling);
    if (played && entry.id !== played.id) appointGeneral(world, entry, played, 'takes command');
    // His guard: the nearest enemy still fighting within `threat` m of him, and the men nearest him to meet that man.
    entry.threat = null;
    entry.guards = [];
    const now = generalOf(world, corner);
    if (!now) continue;
    const at = [now.x[P.pelvis * 3], now.x[P.pelvis * 3 + 2]];
    const apart = (fighter) => Math.hypot(fighter.x[P.pelvis * 3] - at[0], fighter.x[P.pelvis * 3 + 2] - at[1]);
    let threat = null;
    for (const other of world.fighters) {
      if (hostile(other, now) && !other.dormant && stillFighting(other) && apart(other) < spec.threat && (!threat || apart(other) < apart(threat))) threat = other;
    }
    if (!threat) continue;
    entry.threat = threat.id;
    // (Loose men only: a man in his place in a drilled body keeps it.)
    entry.guards = world.fighters
      .filter((fighter) => fighter.corner === corner && fighter !== now && !playerIds.has(fighter.id) && !fighter.slot && stillFighting(fighter) && apart(fighter) < spec.guardFrom)
      .sort((a, b) => apart(a) - apart(b))
      .slice(0, spec.guards)
      .map((fighter) => fighter.id);
  }
}

/** The enemy he goes for to guard his general (AI.general), if he is one of the guard and that man is still on his feet; else null. */
function guardingAgainst(world, fighter) {
  const entry = world.generals?.[fighter.corner];
  if (!entry || entry.threat === null || !entry.guards.includes(fighter.id)) return null;
  const threat = world.fighters[entry.threat];
  return threat && threat.state === 'up' && !crawlingAway(threat) ? threat : null;
}

/**
 * Fear from his general (AI.general), −heart..fell+saw: heart from seeing
 * him on his feet near by; dread, for a while, when he has fallen. On a side
 * with a general only (a battle: a side big enough to raise a standard).
 */
export function generalFear(world, fighter) {
  const spec = AI.general;
  const entry = world.generals?.[fighter.corner];
  if (!entry) return 0;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  let fear = 0;
  const since = entry.fellAt === null ? Infinity : world.time - entry.fellAt;
  if (since < spec.fellFor) {
    const saw = Math.hypot(entry.fellWhere[0] - at[0], entry.fellWhere[1] - at[1]) < spec.sawWithin;
    fear += (1 - since / spec.fellFor) * (spec.fell + (saw ? spec.saw : 0));
  }
  const general = generalOf(world, fighter.corner);
  if (general && general !== fighter && Math.hypot(general.x[P.pelvis * 3] - at[0], general.x[P.pelvis * 3 + 2] - at[1]) < spec.heartWithin) fear -= spec.heart;
  return fear;
}

/** Of these fighters, the one nearest a point. */
function nearestTo(fighters, at) {
  let nearest = null;
  let least = Infinity;
  for (const fighter of fighters) {
    const distance = Math.hypot(fighter.x[P.pelvis * 3] - at[0], fighter.x[P.pelvis * 3 + 2] - at[2]);
    if (distance < least) {
      least = distance;
      nearest = fighter;
    }
  }
  return nearest;
}

/**
 * The standard is down and he is nearest: before anything else, he goes to
 * it and takes it up, his own weapon let fall. Returns whether he is on it.
 */
function takeUpStandard(world, fighter) {
  const side = world.leaders?.[fighter.corner];
  if (!side?.lying || side.taker !== fighter) return false;
  if (fighter.pickup) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  // A blow already on its way is finished first; a shot not yet loosed is given up (the bow or gun lowered) for the standard.
  if (fighter.punch?.spec.path === 'aim' && !fighter.punch.fired) fighter.punch = null;
  if (fighter.punch) return false;
  const debris = side.lying;
  const distance = Math.hypot(debris.x[0] - fighter.x[P.pelvis * 3], debris.x[2] - fighter.x[P.pelvis * 3 + 2]);
  fighter.goTo = debris.x;
  fighter.strafe = 0;
  fighter.aiCombo = null;
  fighter.aimAt = undefined;
  if (distance > AI.pickup.stoopAt) {
    fighter.move = 1;
    fighter.running = distance > AI.cohesion.runFor;
    return true;
  }
  fighter.move = 0;
  // Still tumbling: he waits over it.
  if (debris.resting) startPickup(world, fighter, debris);
  return true;
}

/**
 * After his own decision: a man in the ranks keeps to his slot (not out
 * past his leash after a blow); anyone else keeps near his side's standard.
 */
function keepPlace(world, fighter) {
  // Under an order (command.js), the order says where he stands.
  if (orderKeepsPlace(world, fighter)) return;
  const formation = fighter.slot ? world.formations?.[fighter.formation] : null;
  if (!formation) {
    keepWithLeader(world, fighter);
    keepWithHisMen(world, fighter);
    return;
  }
  if (fighter.state !== 'up' || fighter.clinch || fighter.pin || fighter.pickup || fighter.panicked || fighter.crawling) return;
  // Out past his leash (after a man, or carried on by a blow): back to his place,
  // still facing them and free to strike and guard as he goes.
  // (A spear going out to a man held in one of his squad's wolf-brushes goes as far as it takes: AI.squad.held.)
  const opponent = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  const leash = opponent && heldByMyBrush(world, fighter) === opponent ? DRILL.leash + AI.squad.held : DRILL.leash;
  if (aheadOfSlot(fighter, formation) > leash) {
    walkToSlot(fighter, formation, opponent);
    fighter.running = false;
  }
}

/**
 * The guns before a squad (a drill with `squad`: Qi Jiguang's fowling
 * pieces) have one shot each before the rush is on them, and it is held
 * for the squad's volley (DRILL.volley): until the word is given
 * (formation.volleyAt) the gunner stands with it ready, while the man he
 * has laid on is coming on (at a run, DRILL.runIn) too fast for the piece
 * to be loaded again before he arrives. Thrown away at long range, it is
 * the only shot his place gets: the matchlock takes 15 s to load and a rush
 * covers the ground in a few. A line of shooters that relieve each other
 * (the Han crossbowmen) shoots as it likes.
 */
function holdsFire(fighter, formation, distance) {
  const shot = fighter.weapon.spec.shot;
  if (!formation.drill.squad || !shot || formation.volleyAt !== undefined) return false;
  return distance < shot.reloadSeconds * DRILL.runIn;
}

/**
 * A squad's gunner whose volley is fired, with the enemy too near to load
 * again (DRILL.runIn), in a drill with `sidearm` (Qi Jiguang's): the shot done, he lets the
 * piece fall and draws his kit's sidearm (physics.js dropWeapon: the dao at a
 * brigandine man's belt), is a moment about it (DRILL.volley.draw: no blow
 * before), and falls in at his squad's front (formation.js fallIn). Returns
 * whether he did.
 */
function drawAfterVolley(world, fighter, formation, distance) {
  const weapon = fighter.weapon;
  if (!formation.drill.sidearm || !weapon.spec.shot || weapon.loaded || fighter.punch || fighter.sidearmDrawn || !fighter.body.gear.sidearm) return false;
  if (distance >= weapon.spec.shot.reloadSeconds * DRILL.runIn) return false;
  dropWeapon(world, fighter, 'dropped');
  if (fighter.weapon?.held) {
    fighter.cooldown = Math.max(fighter.cooldown ?? 0, DRILL.volley.draw);
    fallIn(world, fighter, formation);
  }
  return true;
}

/**
 * In the ranks: unless the enemy is on his slot (the front rank's to fight,
 * or anyone's once they are through), he stands in his place facing them.
 * A loaded shooter in the front rank shoots from it; one who has loosed
 * spans again in his place; one with a single slow shot holds it until it
 * is sure (holdsFire). Returns whether that is what he does.
 */
function holdRank(world, fighter, opponent, style, dt) {
  const formation = fighter.slot ? world.formations?.[fighter.formation] : null;
  if (!formation) return false;
  const distance = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  const weapon = fighter.weapon;
  const gun = style.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent ? style.ranged : null;
  if (gun) {
    // Close enough to need the sword: the ordinary way (the crossbow let fall, the sidearm drawn).
    if (distance <= gun.close) return false;
    // His volley fired and no time to load: the gun let fall and the sword drawn (a drill with `sidearm`).
    if (drawAfterVolley(world, fighter, formation, distance)) return true;
    const away = walkToSlot(fighter, formation, opponent);
    if (weapon.spec.shot && !weapon.loaded) {
      fighter.reloading = true;
      return true;
    }
    // (A bow shoots from any rank: its arrow goes up over the heads in front, physics/ranged.js overHeads; a gun or a crossbow only from the front.)
    if ((!fighter.inFront && !weapon.spec.bow) || fighter.punch || fighter.cooldown > 0 || away > DRILL.leash) return true;
    // A gun or a crossbow fires with its rank's volley (formation.js volleyDue).
    if (!volleyDue(world, formation, fighter)) return true;
    if (holdsFire(fighter, formation, distance)) return true;
    // His own men in the way (shotFouled; a bow's arrow goes over the heads before it): held, and after a while at a
    // man at grips with them, the weapon put by and the sidearm drawn (heldTooLong).
    const fouled = shotFouled(world, fighter, opponent, { overHeads: Boolean(weapon.spec.bow) });
    if (fouled) {
      const other = clearMark(world, fighter, { overHeads: Boolean(weapon.spec.bow) });
      if (other) fighter.focus = other.id;
      else heldTooLong(world, fighter, fouled);
      return true;
    }
    heldTooLong(world, fighter, null);
    const zone = world.random() < gun.headShare ? 'head' : 'body';
    if (throwPunch(world, fighter, gun.move ?? 'shoot', zone)) {
      fighter.punch.quick = true;
      fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
    }
    return true;
  }
  // Relieved, hurt, by a fresh man (formation.js relieveWounded): back to his place behind, whoever is in front of him.
  if (world.time - (fighter.relievedAt ?? -Infinity) < DRILL.relief) {
    walkToSlot(fighter, formation, opponent);
    if (!fighter.defence && opponent.punch?.target === fighter.id) perform(world, fighter, 'guard');
    return true;
  }
  const reach = reachOf(fighter) + reachOf(opponent);
  const onHim = opponent.state === 'up' && distance < reach + 0.3;
  const onSlot = opponent.state === 'up' && fromSlot(fighter, formation, opponent) < reach + DRILL.engage;
  // A squad (a drill with `squad`: Qi Jiguang's) fights as one: any man of it, not the front rank only, goes for an enemy come within his reach of his place.
  const squad = formation.drill.squad && opponent.state === 'up' && fromSlot(fighter, formation, opponent) < reach + DRILL.squadEngage;
  // (And a man held in one of its wolf-brushes is the spears' to go out to, a stride or two past their places: AI.squad.held.)
  if (onHim || squad || (fighter.inFront && onSlot) || heldByMyBrush(world, fighter) === opponent) return false;
  walkToSlot(fighter, formation, opponent);
  return true;
}

/**
 * Cohesion: after his own decision, a fighter far from his side's standard
 * (or leader) leans a little towards it: a sideways lean, and an easier
 * advance if he has run out ahead of it. Each man decides alone; together a
 * side tends to hold together, its rear not drawn into the front's fight.
 */
function keepWithLeader(world, fighter) {
  const spec = AI.cohesion;
  const side = world.leaders?.[fighter.corner];
  if (!side || (side.general ?? side.leader) === fighter || side.taker === fighter || fighter.state !== 'up') return;
  // Busy with something of his own: a hold, a blow, a weapon to pick up, a gun's room to find.
  if (fighter.clinch || fighter.pin || fighter.punch || fighter.pickup || fighter.goTo || fighter.panicked) return;
  const foe = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (!foe) return;
  const at = point(fighter.x, P.pelvis);
  const line = [foe.x[P.pelvis * 3] - at[0], 0, foe.x[P.pelvis * 3 + 2] - at[2]];
  const apart = Math.hypot(line[0], line[2]) || 1e-6;
  if (foe.state === 'up' && apart < reachOf(fighter) + reachOf(foe) + spec.engaged) return;
  const offset = [side.at[0] - at[0], 0, side.at[1] - at[2]];
  const distance = Math.hypot(offset[0], offset[2]);
  const pull = Math.min(1, Math.max(0, (distance - spec.radius - spec.radiusPerSqrt * Math.sqrt(side.standing)) / spec.ramp));
  if (pull <= 0) return;
  // His own frame, as he faces his man: the move is along the line, the strafe to its left.
  const forward = [line[0] / apart, 0, line[2] / apart];
  const left = [-forward[2], 0, forward[0]];
  const across = vec.dot(offset, left);
  fighter.strafe = Math.max(-1, Math.min(1, (fighter.strafe ?? 0) + Math.sign(across) * spec.strafe * pull * Math.min(1, Math.abs(across) / distance + 0.2)));
  // Out ahead of the standard, going further: he eases off.
  if (vec.dot(offset, forward) < 0 && fighter.move > 0) fighter.move *= 1 - spec.holdBack * pull;
}

/**
 * A side's leader out of the ranks keeps with the body of his men (AI.general): after his own decision, if he is
 * nearer the enemy than the middle of his men are (each to his nearest), and no enemy is on him, he goes no nearer:
 * no step forward on foot, and on a horse he rides on across the way to them, not into it.
 */
function keepWithHisMen(world, fighter) {
  const spec = AI.general;
  const side = world.leaders?.[fighter.corner];
  if (side?.leader !== fighter || fighter.state !== 'up' || fighter.panicked || fighter.wing?.held) return;
  // A general's is an army's: a side of `minSide` men or more at the start (a skirmish of a few has its leader in it with the rest).
  if (world.fighters.filter((other) => other.corner === fighter.corner).length < spec.minSide) return;
  if (fighter.clinch || fighter.pin || fighter.pickup) return;
  const where = (man) => (man.mount ? man.mount.at : [man.x[P.pelvis * 3], man.x[P.pelvis * 3 + 2]]);
  const foes = world.fighters.filter((other) => hostile(other, fighter) && other.state === 'up' && inFight(other) && !other.hidden);
  const men = world.fighters.filter((other) => other !== fighter && other.corner === fighter.corner && other.state === 'up' && inFight(other) && !other.panicked && !other.hidden);
  if (!foes.length || men.length < spec.minMen) return;
  const nearestFoe = (man) => {
    const at = where(man);
    let best = { foe: null, distance: Infinity };
    for (const foe of foes) {
      const there = where(foe);
      const distance = Math.hypot(there[0] - at[0], there[1] - at[1]);
      if (distance < best.distance) best = { foe, distance };
    }
    return best;
  };
  const theirs = men.map((man) => nearestFoe(man).distance).sort((a, b) => a - b);
  const line = theirs[Math.round(spec.body * (theirs.length - 1))];
  const mine = nearestFoe(fighter);
  const at = where(fighter);
  const there = where(mine.foe);
  const toward = [(there[0] - at[0]) / mine.distance, (there[1] - at[1]) / mine.distance];
  // On a horse, where he will be: a horse going on at them is reckoned `foresee` s further on.
  const going = fighter.mount?.velocity ? Math.max(0, fighter.mount.velocity[0] * toward[0] + fighter.mount.velocity[2] * toward[1]) : 0;
  if (mine.distance - going * spec.foresee >= line - spec.slack) return;
  // The enemy come to him: he fights where he stands.
  if (mine.distance < reachOf(fighter) + reachOf(mine.foe) + spec.engaged) return;
  if (fighter.mount) {
    reinFrom(world, fighter, toward);
    return;
  }
  // (His step is along the line to the man he faces: forward taken away; back and across are left to him.)
  if (fighter.move > 0) fighter.move = 0;
  fighter.running = false;
}

/** How far (m) a spot ([x, z]) lies beyond the ground a fighter keeps near his standard; 0 within it, or out of a group fight. */
function strayFromLeader(world, fighter, at) {
  const spec = AI.cohesion;
  const side = world.leaders?.[fighter.corner];
  if (!side || (side.general ?? side.leader) === fighter) return 0;
  const distance = Math.hypot(side.at[0] - at[0], side.at[1] - at[1]);
  return Math.max(0, distance - spec.radius - spec.radiusPerSqrt * Math.sqrt(side.standing));
}

/** How far a target is from my side's standard (m), in a group fight; 0 otherwise. */
function fromMyLeader(world, fighter, other) {
  const side = world.leaders?.[fighter.corner];
  if (!side || (side.general ?? side.leader) === fighter) return 0;
  return Math.hypot(other.x[P.pelvis * 3] - side.at[0], other.x[P.pelvis * 3 + 2] - side.at[1]);
}

/**
 * The defence that answers this incoming strike, and which way to move:
 * off a straight punch's line, under a hook in the direction it travels,
 * back from an uppercut. Returns { name, side } (side +1 = to the left).
 */
export function chooseDefence(fighter, attacker, style, incoming, random) {
  const spec = incoming.spec;
  // The strike comes from its shoulder (or hip): the head goes to the other
  // side of that line, outside the arm. The glove itself starts too near the
  // attacker's chin to say which side it is on.
  const head = toLocal(fighter, point(fighter.x, P.head));
  const root = spec.limb.replace(/Hand|Elbow/, 'Shoulder').replace(/Foot|Knee/, 'Hip');
  const lateral = toLocal(fighter, point(attacker.x, P[root]))[2] - head[2];
  const away = Math.abs(lateral) > 0.02 ? -Math.sign(lateral) : random() < 0.5 ? 1 : -1;
  const name = pickDefence(style, incoming, random, heaviness(attacker, incoming), longPoint(attacker, incoming));
  // A roll starts on the side the hook comes from and ducks across with it.
  return { name, side: name === 'roll' ? -away : away };
}

/** How heavy an incoming blow is, 0 (a jab) to 1 (a great club, or a strike loaded up). */
function heaviness(striker, incoming) {
  const spec = AI.evadeHeavy;
  const blade = incoming.spec.path === 'blade' ? bladeFor(striker, incoming.spec) : null;
  const weapon = blade?.held ? blade.spec.mass / spec.heavyMass : 0;
  return Math.min(1, Math.max(weapon, incoming.heavy ? spec.loaded : 0));
}

function pickDefence(style, incoming, random, heavy = 0, long = false) {
  const answers = { ...style.defences };
  const spec = incoming.spec;
  if (long) {
    // A long point: stepping straight back only keeps him on its line (it comes on faster than he
    // gives ground), and arms raised do not turn it; he steps off the line, or beats the shaft aside.
    const offLine = AI.offLine;
    answers.sidestep = offLine.sidestep;
    if (answers.stepBack) answers.stepBack *= offLine.stepBack;
    if (answers.guard) answers.guard *= offLine.guard;
    delete answers.slip;
    delete answers.roll;
    delete answers.leanBack;
    return pick(answers, random) ?? 'sidestep';
  }
  if (heavy > 0) {
    // A heavy blow: anyone takes his body out of its way rather than meet it.
    const evade = AI.evadeHeavy;
    answers.stepBack = (answers.stepBack ?? 0.25) * (1 + (evade.move - 1) * heavy);
    if (incoming.zone === 'head') {
      answers.slip = (answers.slip ?? 0.25) * (1 + (evade.move - 1) * heavy);
      answers.leanBack = (answers.leanBack ?? 0.2) * (1 + (evade.move - 1) * heavy);
    }
    for (const block of ['guard', 'weaponBlock', 'parry']) if (answers[block]) answers[block] *= 1 - (1 - evade.block) * heavy;
  }
  if (incoming.zone === 'legs') return answers.check ? 'check' : answers.stepBack ? 'stepBack' : 'guard';
  if (incoming.zone !== 'head') {
    // Head movement does not take a body shot away: elbows and distance do.
    delete answers.slip;
    delete answers.roll;
  } else if (spec.path === 'hook' && answers.roll && random() < 0.8) return 'roll';
  else if (spec.path === 'straight' || spec.path === 'upper') {
    // A straight punch at the head: first choice is to take the head away.
    delete answers.roll;
    if (answers.slip) answers.slip *= AI.slipPreference;
  }
  if (spec.limb.endsWith('Foot')) {
    // Kicks are answered by distance or a high guard; nobody slips a shin.
    delete answers.slip;
    delete answers.roll;
    delete answers.parry;
    delete answers.check;
  } else {
    delete answers.check;
    if (!spec.limb.endsWith('Hand')) delete answers.parry;
  }
  return pick(answers, random) ?? 'guard';
}

/**
 * Whether `other` is a man `fighter` may fight: of the other side, awake, and, in level mode, not neutral
 * (hostile) and one his awareness allows (`mayTarget`, levelmode/awareness.js: a follower fights only whom
 * the player fights). In a battle, simply the other side.
 */
function foeOf(fighter, other) {
  return hostile(other, fighter) && !other.dormant && !other.hidden && (!fighter.mayTarget || fighter.mayTarget(other));
}

/**
 * Who to fight. Whoever just hit me, if it is not the man I am on; a new man
 * when mine is down; otherwise the one I am on. A new man is the nearest one
 * standing, passing over those my team-mates already have in hand.
 */
function chooseFocus(world, fighter) {
  const events = world.events;
  if ((fighter.aiEventCursor ?? 0) > events.length) fighter.aiEventCursor = events.length;
  let hitBy = null;
  for (let index = fighter.aiEventCursor ?? 0; index < events.length; index += 1) {
    const event = events[index];
    surge(fighter, event);
    if (event.kind !== 'landed' && event.kind !== 'blocked' && event.kind !== 'shot' && event.kind !== 'arrow') continue;
    feel(world, fighter, event);
    // Hit from afar (a shot, an arrow): he turns on the shooter only if he is near; a man across the field is not chased through his line.
    const shooter = world.fighters[event.attacker];
    const far = (event.kind === 'shot' || event.kind === 'arrow') && shooter && Math.hypot(shooter.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], shooter.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]) > AI.retarget.shooterWithin;
    if (event.defender === fighter.id && shooter?.corner !== fighter.corner && !far) {
      hitBy = event.attacker;
      if (event.kind !== 'blocked') fighter.aiLastHit = event.time;
    }
  }
  fighter.aiEventCursor = events.length;
  const current = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  // A man crawling away is left to go (not one crawling by his own choice: the player's crawl is still the fight).
  if (hitBy !== null && hitBy !== fighter.focus && world.fighters[hitBy].state === 'up' && !crawlingAway(world.fighters[hitBy])) {
    fighter.focus = hitBy;
    return world.fighters[hitBy];
  }
  // A wolf-brush holding a man: its bearer keeps on him (holdWithBrush); his squad's men within reach of him go for him.
  const held = heldByMyBrush(world, fighter);
  if (held) {
    if (held.id !== fighter.focus) world.events.push({ time: world.time, kind: 'focus', fighter: fighter.id, target: held.id, effects: [] });
    fighter.focus = held.id;
    return held;
  }
  // One of his general's guard, an enemy upon the general: that man first (AI.general).
  const threat = guardingAgainst(world, fighter);
  if (threat) {
    if (threat.id !== fighter.focus) world.events.push({ time: world.time, kind: 'focus', fighter: fighter.id, target: threat.id, effects: [] });
    fighter.focus = threat.id;
    return threat;
  }
  // How many of his side already go for each man: counted once, not per comparison.
  const crowds = new Map();
  for (const mate of world.fighters) {
    if (mate !== fighter && mate.corner === fighter.corner && mate.state === 'up' && mate.focus !== undefined) crowds.set(mate.focus, (crowds.get(mate.focus) ?? 0) + 1);
  }
  const chased = (other) => !pursuedByOthers(world, fighter, other, crowds);
  if (current && current.state === 'up' && !crawlingAway(current) && chased(current) && !closerAtHand(world, fighter, current) && !leavesHeld(world, fighter, current)) return current;
  const standing = world.fighters.filter((other) => foeOf(fighter, other) && other.state === 'up' && !crawlingAway(other));
  const worth = standing.filter(chased);
  const leftToOthers = worth.length < standing.length;
  // Only runners left, all far off or chased enough: he lets them go and keeps his ground.
  if (standing.length && !worth.length) {
    fighter.focus = undefined;
    return null;
  }
  standing.splice(0, standing.length, ...worth);
  if (!standing.length) {
    fighter.focus = undefined;
    // (Nobody at all in sight: the other side hidden in an ambush. He waits.)
    const nearest = fighter.mayTarget ? null : nearestOpponent(world, fighter);
    return nearest?.hidden ? null : nearest;
  }
  const at = point(fighter.x, P.pelvis);
  // Nearest, least crowded, and (in a group fight) nearer my side's leader.
  // A wing of horse rides at the enemy's shooters first (they cannot stand to a charge).
  const shooters = fighter.wing && !fighter.wing.held ? WINGS.shooters : 0;
  // A man of a squad (a drill with `squad`) goes for the man his own already have in hand, up to a gang's worth (AI.squad): one enemy at a time, by several.
  const crowding = (other) => {
    const crowd = crowds.get(other.id) ?? 0;
    return fighter.slot && world.formations?.[fighter.formation]?.drill.squad && crowd < AI.engageSlots ? -AI.squad.together * crowd : AI.crowdPenalty * crowd;
  };
  const score = (other) => vec.length(vec.sub(point(other.x, P.pelvis), at)) + crowding(other) + AI.cohesion.focus * fromMyLeader(world, fighter, other) - (shooters && !other.mount && STYLES[other.style]?.ranged ? shooters : 0);
  // The nearest, least crowded: each scored once (the first of equals kept, as before).
  // (A man held in our wolf-brush is left to the spears by the short arms of a squad while there is another to face.)
  const facing = standing.filter((other) => !leavesHeld(world, fighter, other));
  // Only a man held in our brush left to him, and runners left to others: he leaves that one to the spears too, and keeps his ground.
  if (!facing.length && leftToOthers) {
    fighter.focus = undefined;
    return null;
  }
  const pool = facing.length ? facing : standing;
  let next = pool[0];
  let best = score(next);
  for (let index = 1; index < pool.length; index += 1) {
    const value = score(pool[index]);
    if (value < best) {
      next = pool[index];
      best = value;
    }
  }
  if (next.id !== fighter.focus) world.events.push({ time: world.time, kind: 'focus', fighter: fighter.id, target: next.id, effects: [] });
  fighter.focus = next.id;
  return next;
}

/**
 * Whether a broken man running (`other`) is left by `fighter` to others (AI.pursuit): in a battle, he is too far
 * off to chase, or enough of `fighter`'s side are already after him. A man who stands and fights is never left.
 */
function pursuedByOthers(world, fighter, other, crowds) {
  if (!other.panicked || !battleField(world, fighter)) return false;
  const spec = AI.pursuit;
  const apart = Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  // (crowds counts the others of his side on him, not himself.)
  return apart > spec.within || (crowds.get(other.id) ?? 0) >= spec.chasers;
}

/**
 * The enemy held in a wolf-brush (physics/brush.js) that this man should be on: for its bearer, the man he holds; for
 * a man of a squad (a drill with `squad`), the nearest held by one of his side's brushes within his reach and
 * AI.squad.held m. Null if none.
 */
function heldByMyBrush(world, fighter) {
  if (fighter.holding !== undefined) {
    const man = world.fighters[fighter.holding];
    return man?.caught?.by === fighter.id ? man : null;
  }
  if (!fighter.slot || !world.formations?.[fighter.formation]?.drill.squad || !world.brushTouches || reachOf(fighter) < AI.squad.longFrom) return null;
  const within = reachOf(fighter) + AI.squad.held;
  let best = null;
  let nearest = within;
  for (const other of world.fighters) {
    if (!other.caught || other.state !== 'up' || world.fighters[other.caught.by].corner !== fighter.corner) continue;
    const distance = Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
    if (distance < nearest) {
      nearest = distance;
      best = other;
    }
  }
  return best;
}

/** Whether a man of a squad with a short weapon leaves this enemy, held in his side's wolf-brush, to the spears (AI.squad.longFrom). */
function leavesHeld(world, fighter, other) {
  if (!other.caught || !fighter.slot || fighter.holding !== undefined || world.fighters[other.caught.by].corner !== fighter.corner) return false;
  return Boolean(world.formations?.[fighter.formation]?.drill.squad) && reachOf(fighter) < AI.squad.longFrom;
}

/**
 * A wolf-brush holding a man (physics/brush.js): its bearer does not strike (a thrust would take the brush off him)
 * but keeps it steady in his face, standing off at the distance it holds him at (brush.js heldOffAt) while his squad's
 * spears go for him. Returns whether that is what he does.
 */
function holdWithBrush(world, fighter, opponent) {
  if (fighter.holding === undefined || opponent.id !== fighter.holding || opponent.caught?.by !== fighter.id) return false;
  const distance = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  const want = heldOffAt(opponent);
  fighter.move = distance < want - AI.brush.band ? -AI.brush.give : distance > want + AI.brush.band ? AI.brush.give : 0;
  fighter.strafe = 0;
  fighter.running = false;
  fighter.aiCombo = null;
  return true;
}

/**
 * Whether a man of the other side stands clearly nearer than the one he is
 * on (by `AI.retarget.margin` m and `ratio` of the distance), looked at every
 * `every` s: then he takes the man in front of him rather than going through
 * a line to reach his own. One man to fight: never.
 */
function closerAtHand(world, fighter, current) {
  const spec = AI.retarget;
  if (world.time < (fighter.aiRetargetAt ?? 0)) return false;
  fighter.aiRetargetAt = world.time + spec.every;
  const at = point(fighter.x, P.pelvis);
  const away = (other) => Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]);
  const mine = away(current);
  for (const other of world.fighters) {
    if (other === current || !foeOf(fighter, other) || other.state !== 'up' || crawlingAway(other)) continue;
    const distance = away(other);
    if (distance < mine - spec.margin && distance < mine * spec.ratio) return true;
  }
  return false;
}

/**
 * Team-mates: where to sidestep (+ left) to stay apart and keep the line to
 * my man clear, and whether one stands in that line now.
 */
function teamSpacing(world, fighter, opponent, lineOfFire = AI.lineOfFire) {
  const at = point(fighter.x, P.pelvis);
  const to = point(opponent.x, P.pelvis);
  const line = vec.sub(to, at);
  const length = vec.length(line) || 1e-6;
  const ahead = vec.scale(line, 1 / length);
  const left = [-ahead[2], 0, ahead[0]];
  let strafe = 0;
  let blocked = false;
  // A kick or knee sweeps wide: it needs a team-mate-free arc beside me too.
  let kickRoom = true;
  for (const mate of world.fighters) {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') continue;
    const offset = vec.sub(point(mate.x, P.pelvis), at);
    const along = vec.dot(offset, ahead);
    const across = vec.dot(offset, left);
    const apart = Math.hypot(offset[0], offset[2]);
    // In the way: between me and him, or crowding him, near the line.
    if (along > 0.1 && along < length + AI.pastTarget && Math.abs(across) < lineOfFire) {
      blocked = true;
      strafe += across >= 0 ? -1 : 1;
    } else if (apart < AI.mateSpacing) strafe += (across >= 0 ? -1 : 1) * (1 - apart / AI.mateSpacing);
    if (apart < AI.kickClearance && along > -0.2) kickRoom = false;
  }
  // Facing turns the line: the fighter's own left is the line's left.
  return { strafe: Math.max(-1, Math.min(1, strafe)), blocked, kickRoom };
}

/** Whether team-mates nearer my man already fill the places to take him on. */
function waitingTurn(world, fighter, opponent) {
  // A man held in one of our wolf-brushes (physics/brush.js) cannot turn his blade on those who come at him: no one
  // waits his turn at him (the spears thrust past the shields' shoulders at him, as the squad was drawn up to).
  if (opponent.caught && world.fighters[opponent.caught.by].corner === fighter.corner) return false;
  const at = point(opponent.x, P.pelvis);
  const away = (other) => Math.hypot(...[0, 2].map((axis) => point(other.x, P.pelvis)[axis] - at[axis]));
  const mine = away(fighter);
  const closer = world.fighters.filter((mate) => mate !== fighter && mate.corner === fighter.corner && mate.state === 'up' && mate.focus === opponent.id && away(mate) < mine).length;
  return closer >= AI.engageSlots;
}

/** Clean head shots exchanged, as each side's felt threat: what one blow really did, over the chin. */
function feel(world, fighter, event) {
  if (event.kind !== 'landed' || event.target !== 'head' || !event.headDeltaV) return;
  const blend = (memory, value) => ({ sum: (memory?.sum ?? 0) + value, count: (memory?.count ?? 0) + 1 });
  if (event.defender === fighter.id) fighter.aiFelt = blend(fighter.aiFelt, event.headDeltaV / chinNow(fighter));
  if (event.attacker === fighter.id) fighter.aiDealt = blend(fighter.aiDealt, event.headDeltaV / chinNow(world.fighters[event.defender]));
}

/**
 * Confidence, −1 (afraid) to +1 (sure of himself): his best shot against
 * mine, sized up from the look of the man and corrected by what the shots
 * landed so far have actually done. A man whose punches feel weak is pressed;
 * a man who could end it with one is respected.
 */
export function confidence(fighter, opponent, world = null) {
  const judged = (looks, memory) => {
    if (!memory?.count) return looks;
    const weight = memory.count / (memory.count + AI.experienceShots);
    // A clean shot's average, scaled up to a power shot: the jabs are not the threat.
    return looks * (1 - weight) + Math.max(looks * 0.25, 1.6 * (memory.sum / memory.count)) * weight;
  };
  const mine = judged(strikeThreat(fighter, opponent), fighter.aiDealt);
  const theirs = judged(strikeThreat(opponent, fighter), fighter.aiFelt);
  let nerve = Math.log(mine / theirs) / Math.log(AI.confidenceRatio);
  // Good armour is courage.
  nerve += fighter.body.gear.courage;
  // A longer reach is frightening in itself: he can hit me before I can hit him.
  nerve -= AI.reachFear * Math.max(0, reachOf(opponent) - reachOf(fighter));
  if (world) {
    // Outnumbering is courage; being outnumbered, fear.
    const standing = (corner) => world.fighters.filter((other) => other.corner === corner && inFight(other)).length;
    nerve += AI.numbersConfidence * Math.log2(Math.max(1, standing(fighter.corner)) / Math.max(1, standing(opponent.corner)));
  }
  return Math.max(-1, Math.min(1, nerve));
}

/**
 * Whether this fighter must keep out of his opponent's reach: outreached
 * (a sword against fists, a spear against a sword) or facing an edge or a
 * point with nothing as long in his own hands.
 */
export function outreached(fighter, opponent) {
  // His blade caught in a wolf-brush (physics/brush.js) reaches no one: he is gone in on, not held off.
  if (opponent.caught) return false;
  const theirs = opponent.weapon?.held ? opponent.weapon.spec : null;
  const mine = fighter.weapon?.held ? fighter.weapon.spec : null;
  if (reachOf(opponent) - reachOf(fighter) > AI.blade.outreachedBy) return true;
  const sharp = theirs && Object.values(theirs.harm).some((mix) => (mix.cut ?? 0) + (mix.pierce ?? 0) > 0.3);
  return Boolean(sharp && !(mine && mine.length >= theirs.length - 0.1));
}

/**
 * A weapon lying loose, and nothing in my hands: go and get it, if it is
 * nearer me than any of them and no one stands close enough to hit me
 * while I stoop (or it is at my feet). Walk to it, stoop, take it.
 * Returns whether this fighter is on it.
 */
function goForWeapon(world, fighter, opponent, dt) {
  if (fighter.pickup) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  // A man of a shield style who has lost his wants it back, whatever is in his hand.
  const wantsShield = Boolean(STYLES[fighter.style]?.shield) && !fighter.shield;
  // A beast (`unarmed` kit) takes up no weapon.
  const wantsWeapon = !fighter.weapon?.held && !fighter.body.gear.unarmed;
  // Nothing loose on the floor he wants (the usual case): no thought, and no draw on the bout's randomness.
  const loose = world.debris?.some((debris) => !debris.taken && debris.resting && ((debris.kind === 'weapon' && wantsWeapon) || (debris.kind === 'shield' && wantsShield)));
  if (!loose || fighter.clinch || fighter.pin || fighter.punch || !AI.pickup.enabled) {
    fighter.aiPickupFor = null;
    return false;
  }
  const at = point(fighter.x, P.pelvis);
  const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
  const enemies = world.fighters.filter((other) => foeOf(fighter, other) && other.state === 'up');
  const attackingMe = enemies.some((other) => other.punch?.target === fighter.id);
  // Still worth it: loose, on the floor, and nearer me than any of them.
  const worth = (debris) => {
    // A standard is taken up only by its own side's chosen man (takeUpStandard).
    if (!debris || debris.taken || !debris.resting) return null;
    if (debris.kind === 'shield' ? !wantsShield : debris.kind !== 'weapon' || !wantsWeapon || WEAPONS[debris.weapon]?.flag) return null;
    // Not a weapon he cannot lift (handling.js).
    if (debris.kind === 'weapon' && !handling(fighter.body, WEAPONS[debris.weapon]).canHold) return null;
    // Nor a bow or a gun he has nothing left to shoot from (physics/ranged.js ammoLeft).
    if (debris.kind === 'weapon' && WEAPONS[debris.weapon]?.ranged && ammoLeft(fighter, { spec: WEAPONS[debris.weapon] }) <= 0) return null;
    const mine = flat(debris.x, at);
    const theirs = enemies.reduce((least, other) => Math.min(least, flat(debris.x, point(other.x, P.pelvis))), Infinity);
    if (mine > AI.pickup.maxDistance || (mine > AI.pickup.atFeet && mine > theirs - AI.pickup.margin)) return null;
    // A gun is no use with him on top of you: only with room to raise it.
    const nearest = enemies.reduce((least, other) => Math.min(least, flat(at, point(other.x, P.pelvis))), Infinity);
    if (WEAPONS[debris.weapon]?.ranged && nearest < (STYLES.handgun.ranged.flee ?? 2.4)) return null;
    // A shield only when there is time for it: nobody within `shieldClear` m,
    // no blow coming, and a weapon in his hand (a weapon on the floor first).
    if (debris.kind === 'shield' && (nearest < AI.pickup.shieldClear || attackingMe || wantsWeapon)) return null;
    return mine;
  };
  let target = world.debris?.[fighter.aiPickupFor];
  let mine = worth(target);
  if (mine === null) {
    fighter.aiPickupFor = null;
    target = null;
    // Not while a blow is coming at me; then, now and then, when one is there for the taking.
    if (attackingMe || world.random() > AI.pickup.eagerness * dt) return false;
    for (const debris of world.debris ?? []) {
      const distance = worth(debris);
      if (distance !== null && (mine === null || distance < mine)) {
        mine = distance;
        target = debris;
      }
    }
    if (!target) return false;
    fighter.aiPickupFor = target.id;
  }
  fighter.goTo = target.x;
  fighter.strafe = 0;
  fighter.aiCombo = null;
  const below = Math.min(fighter.x[P.lFoot * 3 + 1], fighter.x[P.rFoot * 3 + 1]) - target.x[1];
  if (mine > AI.pickup.stoopAt || below > AI.pickup.reachDown) {
    fighter.move = Math.min(1.4, 0.6 + mine);
    return true;
  }
  fighter.move = 0;
  startPickup(world, fighter, target);
  return true;
}

/**
 * A mixed fighter changes style now and then, between strikes, never to a
 * weapon style: a spell of boxing, then of kicking, of clinching, of pushing.
 */
function switchMix(world, fighter, dt) {
  const mix = STYLES[fighter.mixed]?.mix;
  if (!mix || fighter.punch || fighter.clinch || fighter.weapon?.held) return;
  fighter.mixFor = (fighter.mixFor ?? AI.mix.seconds * (0.5 + world.random())) - dt;
  if (fighter.mixFor > 0) return;
  const others = mix.filter((key) => key !== fighter.style);
  const next = others[Math.floor(world.random() * others.length)];
  fighter.style = next;
  fighter.mixFor = AI.mix.seconds * (0.5 + world.random());
  fighter.aiCombo = null;
  world.events.push({ time: world.time, kind: 'styleSwitch', fighter: fighter.id, style: next, effects: [`switches to ${STYLES[next].label}`] });
}

/** Spread of one temperament trait round 1: e^(±spread). */
function trait(random) {
  return Math.exp((random() * 2 - 1) * AI.cadence.spread);
}

/**
 * A fighter's own cadence for now: how long he moves and how long he works,
 * how much of his work comes in bursts and how far he circles. From his
 * style, his game plan, his own temperament (drawn once, his for the
 * bout) and his nerve: confidence works longer and waits less.
 */
function cadenceOf(world, fighter, style, plan, nerve) {
  fighter.temperament ??= { work: trait(world.random), move: trait(world.random), burst: trait(world.random), mobility: trait(world.random) };
  const own = fighter.temperament;
  const base = { work: 1, move: 1, burst: 0.5, mobility: 0.5, ...style.cadence };
  const tilt = plan.cadence ?? {};
  return {
    work: AI.cadence.workSeconds * base.work * (tilt.work ?? 1) * own.work * Math.exp(AI.confidence.cadence * nerve),
    move: AI.cadence.moveSeconds * base.move * (tilt.move ?? 1) * own.move * Math.exp(-AI.confidence.cadence * nerve),
    burst: Math.min(1, base.burst * (tilt.burst ?? 1) * own.burst),
    mobility: Math.min(1, base.mobility * (tilt.mobility ?? 1) * own.mobility),
    opening: AI.cadence.openingChance * (tilt.opening ?? 1),
    nerve,
  };
}

/** Draw how long a phase lasts: around its mean, never instant. */
function phaseLength(random, mean) {
  return mean * (0.4 + 1.2 * random());
}

/**
 * Move or work. Moving, a fighter circles at his distance and throws
 * nothing unless an opening shows; working, he attacks, much of it in
 * bursts. Facing a longer reach or a blade (`wary`), moving means holding
 * outside that reach, working means a surge in for one burst, and a
 * retreat follows. Sets the fighter's footwork; returns whether he may
 * start an attack now.
 */
function cadenceStep(world, fighter, opponent, { distance, range, wary, cadence, dt }) {
  const random = world.random;
  const blade = AI.blade;
  const safe = reachOf(opponent) + fighter.body.lengths.headRadius + blade.margin;
  const myRange = reachOf(fighter) + opponent.body.lengths.headRadius;
  let phase = fighter.aiCadence;
  // A man held in one of my side's wolf-brushes (physics/brush.js) cannot come at me: there is nothing to wait for or
  // keep out of. Up to where my point lands (AI.squad.strikeAt of my reach), and strike.
  if (opponent.caught && world.fighters[opponent.caught.by].corner === fighter.corner) {
    const at = myRange * AI.squad.strikeAt;
    fighter.move = distance > at + AI.rangeSlack ? 1 : distance < at - AI.rangeSlack * 2 ? -0.5 : 0;
    return true;
  }
  // The longer weapon: hold at the edge of his reach, inside mine; answer
  // whoever steps in with a burst; step back when pressed.
  const outreaching = !wary && fighter.weapon?.held && reachOf(fighter) - reachOf(opponent) > blade.outreachedBy;
  if (outreaching) return holdTheRange(world, fighter, opponent, distance, cadence, dt);
  const start = (name, length) => {
    phase = fighter.aiCadence = { name, t: 0, length, thrownAtStart: fighter.stats.thrown, burstLeft: 0 };
    if (name === 'work' && wary) world.events.push({ time: world.time, kind: 'surge', fighter: fighter.id, style: fighter.style, effects: [] });
  };
  // A machine works without a pause, and wary of nothing (AI.machine).
  if (fighter.body.gear.machine) {
    wary = false;
    if (phase?.name !== 'work') start('work', Infinity);
  }
  if (!phase) start('work', phaseLength(random, cadence.work));
  phase.t += dt;
  // Openings: he is recovering from a blow, committed, giving ground, or
  // his weapon's point is off the line to me.
  const offLine = opponent.weapon?.held && (() => {
    const toMe = vec.normalize(vec.sub(point(fighter.x, P.pelvis), point(opponent.x, P.pelvis)));
    const d = opponent.weapon.dir;
    return (d[0] * toMe[0] + d[2] * toMe[2]) / (Math.hypot(d[0], d[2]) || 1) < AI.openingAngle;
  })();
  const recovering = (opponent.punch && opponent.punch.t > opponent.punch.spec.extendUntil) || opponent.committed > 0 || opponent.defence?.name === 'stepBack' || offLine;
  // Afraid, he lets the distance open rather than walk back into range.
  const approach = Math.max(0.3, 1 + Math.min(0, cadence.nerve) * AI.confidence.pressure * 0.5);
  if (phase.name === 'move') {
    // Circle at my distance (out of his reach if he outreaches me).
    const hold = wary ? safe : range;
    if (distance < hold - blade.slack) fighter.move = wary ? -1 : -0.7;
    else if (distance > hold + blade.slack) fighter.move = (wary ? 0.6 : 1) * approach;
    else fighter.move *= Math.exp(-dt * 4);
    fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 1 : -1) * cadence.mobility));
    const opening = recovering && random() < cadence.opening * dt * 10;
    if ((phase.t > phase.length || opening) && fighter.stamina > (wary ? 0.3 : 0.15)) start('work', wary ? blade.surgeSeconds : phaseLength(random, cadence.work));
    return false;
  }
  if (phase.name === 'retreat') {
    fighter.move = -blade.retreatSpeed;
    if (distance > safe || !wary) start('move', phaseLength(random, cadence.move));
    return false;
  }
  // Working.
  if (wary) {
    fighter.move = distance > myRange * 0.85 ? blade.surgeSpeed : 0.4;
    fighter.strafe = 0;
    const thrown = fighter.stats.thrown - phase.thrownAtStart;
    const hit = (fighter.aiLastHit ?? -Infinity) > world.time - phase.t;
    if (!phase.burstSize) phase.burstSize = 1 + Math.floor(random() * (1 + 3 * cadence.burst));
    if ((thrown >= phase.burstSize && !fighter.punch) || phase.t > phase.length || hit) start('retreat', 0);
    fighter.cooldown = Math.min(fighter.cooldown, AI.cadence.burstGap);
    return true;
  }
  // Sure of himself, he works from closer still: he walks his man down.
  const workRange = range - AI.confidence.closer * Math.max(0, cadence.nerve);
  // Coming into his range he checks his pace (AI.approachBrake m out, down to approachFloor): he arrives set, not walking onto the other man's fist.
  if (distance > workRange + AI.rangeSlack) fighter.move = approach * Math.min(1, AI.approachFloor + (distance - workRange) / AI.approachBrake);
  else if (distance < workRange - AI.rangeSlack * 2 && !fighter.clinch) fighter.move = -0.7;
  else fighter.move *= Math.exp(-dt * 4);
  if (fighter.stamina < 0.25 && distance < range + 0.4) fighter.move = -0.6;
  if (phase.t > phase.length && !fighter.punch && !fighter.aiCombo?.length) start('move', phaseLength(random, cadence.move));
  return true;
}

/**
 * Footwork with the longer weapon: stand just outside his reach and well
 * inside my own, so he must come through my range to reach me. When he
 * steps in (or surges), meet him with a quick burst; when he is inside
 * his own range, give ground. Attacks are thrown whenever he is in reach.
 */
function holdTheRange(world, fighter, opponent, distance, cadence, dt) {
  const spec = AI.range;
  const mine = reachOf(fighter) + opponent.body.lengths.headRadius;
  const his = reachOf(opponent) + fighter.body.lengths.headRadius;
  const style = STYLES[fighter.style];
  // A point weapon (`keepPoint`) is held off where its point, not its shaft, arrives: at that share of my reach.
  const hold = Math.max(Math.min(mine - (style?.rangeInside ?? spec.inside), Math.max(his + spec.outside, mine * 0.6)), mine * (style?.keepPoint ?? 0));
  if (distance < his) fighter.move = -1;
  else if (distance < hold - AI.blade.slack) fighter.move = -0.6;
  else if (distance > hold + AI.blade.slack) fighter.move = 0.8;
  else fighter.move *= Math.exp(-dt * 4);
  fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 1 : -1) * cadence.mobility * 0.5));
  // Coming in: the moment to strike, and to keep striking.
  const closing = (fighter.aiLastGap ?? distance) - distance;
  fighter.aiLastGap = distance;
  const comingIn = distance < mine && (closing > spec.closingSpeed * dt || opponent.aiCadence?.name === 'work');
  // A style that tires fast (a heavy lance) meets him with a burst only while it has the wind for one (`burstAbove`, stamina).
  if (comingIn && !fighter.punch && !fighter.aiBurst && fighter.stamina > (style?.burstAbove ?? 0)) {
    fighter.aiBurst = { left: spec.burstMin + Math.floor(world.random() * (1 + spec.burstRange * cadence.burst)) };
  }
  if (fighter.aiBurst) {
    fighter.cooldown = Math.min(fighter.cooldown, AI.cadence.burstGap);
    if (fighter.aiBurst.thrown === undefined) fighter.aiBurst.thrown = fighter.stats.thrown;
    if (fighter.stats.thrown - fighter.aiBurst.thrown >= fighter.aiBurst.left || distance > mine + 0.3) fighter.aiBurst = null;
  }
  return true;
}

/**
 * The rest after an attack: in a burst, hardly any; between bursts the
 * style's rest, stretched so that a bursty fighter throws about as much
 * over a round as an even one, only bunched.
 */
function nextGap(world, fighter, style, plan, cadence) {
  const random = world.random;
  const phase = fighter.aiCadence;
  if (fighter.body.gear.machine) return restAfterAttack(fighter, style, random) * AI.machine.rest;
  if (phase?.burstLeft > 0) {
    phase.burstLeft -= 1;
    return AI.cadence.burstGap;
  }
  const size = random() < cadence.burst ? 1 + Math.floor(random() * (1 + 3 * cadence.burst)) : 0;
  if (phase) phase.burstLeft = size;
  return restAfterAttack(fighter, style, random) * plan.tempo * (1 + size * 0.6);
}

/**
 * The last man of his side is down: kneel over him and hold him there. Go
 * to his side, level with his chest, and take hold once there. Returns
 * whether this fighter is on it (false: stand off as usual).
 */
function holdDown(world, fighter, opponent) {
  if (fighter.pin) {
    fighter.move = 0;
    fighter.strafe = 0;
    return true;
  }
  if (world.rules?.noPins) return false;
  const lastOfSide = world.fighters.filter((other) => other.corner === opponent.corner && inFight(other)).length === 1;
  if (!lastOfSide || (opponent.state !== 'down' && opponent.state !== 'rising')) return false;
  const holding = world.fighters.filter((other) => other.pin?.target === opponent.id).length;
  if (holding >= AI.pin.pinners) return false;
  // Beside his chest, a forearm's length off the line of his body.
  const chest = vec.lerp(point(opponent.x, P.pelvis), point(opponent.x, P.neck), 0.6);
  const at = point(fighter.x, P.pelvis);
  const apart = Math.hypot(chest[0] - at[0], chest[2] - at[2]);
  fighter.strafe = 0;
  if (apart > AI.pin.reach) {
    fighter.move = Math.min(1, (apart - AI.pin.reach) * 2 + 0.3);
    return true;
  }
  fighter.move = 0;
  perform(world, fighter, 'pin');
  return true;
}

// ---- Fear, panic and adrenaline -------------------------------------------------

/** How much a body surges with adrenaline: young, big and male more; old less. */
export function adrenalineGain(fighter) {
  const inputs = fighter.body.inputs;
  const age = Math.max(0.45, Math.min(1.2, 1.15 - 0.013 * (inputs.age - 25)));
  const size = ((fighter.body.bodyMassKg ?? fighter.body.massKg) / 75) ** 0.25;
  return age * size * (inputs.sex === 'female' ? 0.8 : 1);
}

/** Adrenaline from what just happened to him: a man put down, or a hard blow survived. */
export function surge(fighter, event) {
  const spec = AI.adrenaline;
  let rise = 0;
  const putDown = event.kind === 'knockout' || ((event.kind === 'landed' || event.kind === 'blocked') && event.effects?.some((effect) => effect.startsWith('knockdown')));
  if (putDown && event.attacker === fighter.id) rise = spec.knockdown;
  if (event.defender === fighter.id && fighter.state === 'up') {
    const severity = event.kind === 'shot' || event.kind === 'arrow' ? (event.harm ?? 0) * 2 : event.kind === 'landed' && event.target === 'head' ? (event.harmDeltaV ?? event.headDeltaV ?? 0) / chinNow(fighter) : 0;
    if (severity > spec.hardFrom) rise = Math.max(rise, spec.hardHit * Math.min(2, severity - spec.hardFrom + 0.5));
  }
  if (event.kind === 'staggered' && event.fighter === fighter.id) rise = Math.max(rise, spec.hardHit);
  if (rise > 0) fighter.adrenaline = Math.min(1, (fighter.adrenaline ?? 0) + rise * adrenalineGain(fighter));
}

/** How hurt he is, 0 (fresh) to 1 (about to drop): the worst of everything that puts a man down. */
export function hurtShare(fighter) {
  return Math.min(1, Math.max(bodyHarm(fighter), AI.panic.perKnockdown * fighter.knockdowns));
}

/**
 * The couched charge: true while it has the fighter (running in, or the
 * blow under way). Once its blow is over the lance goes (dropped: the
 * sidearm is drawn as for any lost weapon) and the style is fought as usual.
 */
function couchedCharge(world, fighter, opponent, style, distance) {
  const charge = style.couchedCharge;
  if (fighter.couched === 'done' || !fighter.weapon?.held || fighter.weapon.kind !== style.weapon) return false;
  const punch = fighter.punch;
  if (fighter.couched === 'striking') {
    if (punch?.type === charge.move) {
      fighter.move = 1;
      fighter.running = true;
      return true;
    }
    fighter.couched = 'done';
    dropWeapon(world, fighter, 'dropped');
    return false;
  }
  if (punch || fighter.clinch || fighter.slot) return false;
  const reach = moveRange(MOVES[charge.move], fighter.body, fighter.weapon.spec) + opponent.body.lengths.headRadius;
  fighter.couched ??= { backUntil: world.time + charge.backFor };
  // Inside the point (he came on, `pointBand` m inside the lance's reach): back off for room, a while at most, then couch it anyway.
  if (distance < reach - charge.pointBand && world.time < fighter.couched.backUntil) {
    fighter.move = -1;
    fighter.strafe = 0;
    return true;
  }
  fighter.move = 1;
  fighter.running = true;
  fighter.strafe = 0;
  // Within `couchFrom` m beyond the reach the lance is couched on the line to his middle and carried in at the run;
  // the move drives it home when the point is near him (MOVES couched).
  if (distance <= reach + charge.couchFrom && throwPunch(world, fighter, charge.move, 'body')) fighter.couched = 'striking';
  return true;
}

/** How many of his arms are broken (0, 1 or 2). */
const brokenArms = (fighter) => (fighter.broken.has('lElbow') ? 1 : 0) + (fighter.broken.has('rElbow') ? 1 : 0);

/**
 * A broken limb puts a man on his knees, panicked or not: a leg that will
 * barely bear him, or an arm hanging. Less likely with adrenaline in him.
 */
function crawlOnBrokenLimb(world, fighter, dt) {
  const crawl = AI.crawl;
  if (fighter.state !== 'up' || fighter.crawling || fighter.mount) return;
  const limbs = Math.min(1, Math.max(legShare(fighter), brokenArms(fighter) * crawl.perArm));
  if (limbs <= crawl.limbFrom) return;
  const rate = crawl.limbRate * ((limbs - crawl.limbFrom) / (1 - crawl.limbFrom)) * (1 - crawl.adrenaline * fighter.adrenaline);
  if (world.random() < rate * dt) startCrawl(world, fighter, 'goes down on his knees, the limb broken');
}

/**
 * How much fight there is in a man, as another sizes him up (AI.strength):
 * his weapon's harm and reach, his armour, a horse under him, his training,
 * his strength, and the state he is in now. 1 for a bare-handed, unarmoured,
 * fit, ordinary man on foot. Nothing to fear in a man out of the fight.
 */
export function strengthOf(fighter) {
  if (!inFight(fighter)) return 0;
  const spec = AI.strength;
  const { protection } = fighter.body.gear;
  const armour = ((protection.blunt ?? 0) + (protection.cut ?? 0) + (protection.pierce ?? 0)) / 3;
  const reach = Math.max(0, reachOf(fighter) - fighter.body.reach);
  let strength = lethality(fighter) ** spec.weapon * (1 + spec.reach * reach) * (1 + spec.armour * armour);
  strength *= (fighter.mount ? spec.mounted : 1) * Math.max(0.2, 1 + spec.skill * ((fighter.body.skill ?? 0.5) - 0.5));
  strength *= (fighter.body.muscleKg / spec.muscleKg) ** spec.size * (1 - spec.hurt * hurtShare(fighter));
  if (fighter.panicked) strength *= spec.broken;
  else if (fighter.state !== 'up' || fighter.crawling) strength *= spec.down;
  return strength;
}

/**
 * Still fighting: in the fight (inFight), on his feet (or getting up), not
 * broken and not crawling off. What a side has left to fight with, as the men
 * of both sides see it (AI.outnumbered) and as a battle is decided (battleend.js).
 */
export function stillFighting(fighter) {
  return inFight(fighter) && !fighter.panicked && !fighter.crawling && (fighter.state === 'up' || fighter.state === 'rising');
}

/** A man's strength as of this think (kept by keepSides), or reckoned now. */
const strengthNow = (fighter) => fighter.aiStrength ?? strengthOf(fighter);

/**
 * Each side's state for the rout (world.sides): its men at the start, what
 * they were worth (each man's strength as he came to the field), the share
 * of that lost (out, crawling off, broken or fled), where the broken stand,
 * and the way to its rear (away from the other side, as they stood at the start).
 */
function keepSides(world) {
  const sides = (world.sides ??= {});
  for (const fighter of world.fighters) {
    fighter.aiStrength = strengthOf(fighter);
    // What he was worth to his side, fresh: who he was (his arms, his kit, his horse), not how he fares.
    if (fighter.aiWorth === undefined && fighter.aiStrength > 0) fighter.aiWorth = fighter.aiStrength;
  }
  for (const corner of ['red', 'blue']) {
    const men = world.fighters.filter((fighter) => fighter.corner === corner);
    if (!men.length) continue;
    const side = (sides[corner] ??= { men: men.length, rear: null });
    side.worth = men.reduce((sum, fighter) => sum + (fighter.aiWorth ?? 1), 0);
    // A man gone counts whole; one broken but still on the field, half (he may yet rally); each by what he was worth.
    const lost = men.reduce((sum, fighter) => sum + (fighter.aiWorth ?? 1) * (!inFight(fighter) ? 1 : fighter.panicked ? 0.5 : 0), 0);
    side.lost = lost / side.worth;
    // How much of it went in the last few seconds (AI.morale shock): kept as a short history.
    side.history = (side.history ?? []).filter((entry) => world.time - entry[0] <= AI.morale.shockFor);
    side.history.push([world.time, side.lost]);
    side.shock = Math.max(0, side.lost - side.history[0][1]);
    // Its men still fighting, and their strength (AI.outnumbered: the field seen; battleend.js: a battle decided).
    const fighting = men.filter(stillFighting);
    side.fighting = fighting.length;
    side.strength = fighting.reduce((sum, fighter) => sum + fighter.aiStrength, 0);
    side.broken = men.filter((fighter) => fighter.panicked && inFight(fighter)).map((fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]]);
    // Where his own fell (out, or crawling off), and when, and what each was worth against the side's average: seen by the men near him for a while (AI.morale).
    for (const fighter of men) if (fighter.goneAt === undefined && !inFight(fighter) && !fighter.fled) fighter.goneAt = world.time;
    const average = side.worth / men.length;
    const worth = (fighter) => Math.max(AI.morale.worthLeast, Math.min(AI.morale.worthMost, (fighter.aiWorth ?? average) / average));
    side.fallen = men.filter((fighter) => fighter.goneAt !== undefined && world.time - fighter.goneAt < AI.morale.fallenFor).map((fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2], worth(fighter)]);
  }
  for (const [corner, other] of [['red', 'blue'], ['blue', 'red']]) {
    if (!sides[corner] || !sides[other] || sides[corner].rear) continue;
    const middle = (side) => {
      const men = world.fighters.filter((fighter) => fighter.corner === side);
      return [men.reduce((sum, fighter) => sum + fighter.x[P.pelvis * 3], 0) / men.length, men.reduce((sum, fighter) => sum + fighter.x[P.pelvis * 3 + 2], 0) / men.length];
    };
    const [mine, theirs] = [middle(corner), middle(other)];
    const length = Math.hypot(mine[0] - theirs[0], mine[1] - theirs[1]) || 1;
    sides[corner].rear = [(mine[0] - theirs[0]) / length, (mine[1] - theirs[1]) / length];
  }
}

/**
 * The runners of his own he sees, 0.. (AI.rout): each broken man within
 * `within` m, in full within `close` m and fading beyond; one well behind
 * him (by his side's front) hardly. `within` overrides how far he looks.
 */
export function runnersSeen(world, fighter, within = AI.rout.within) {
  const spec = AI.rout;
  const side = world.sides?.[fighter.corner];
  if (!side?.broken?.length) return 0;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const front = side.rear ? [-side.rear[0], -side.rear[1]] : null;
  let seen = 0;
  for (const other of side.broken) {
    const off = [other[0] - at[0], other[1] - at[1]];
    const apart = Math.hypot(off[0], off[1]);
    // (Himself, if he is one of them.)
    if (apart < 1e-6 || apart > within) continue;
    const near = apart <= spec.close ? 1 : 1 - (apart - spec.close) / (within - spec.close);
    const behind = front && off[0] * front[0] + off[1] * front[1] < -spec.behindFrom;
    seen += near * (behind ? spec.behind : 1);
  }
  return seen;
}

/** Fear from how his side goes: its losses, and his own broken near him. Only in a side big enough. */
export function routFear(world, fighter) {
  const spec = AI.rout;
  const side = world.sides?.[fighter.corner];
  if (!side || side.men < spec.minSide) return 0;
  const losses = spec.losses * Math.max(0, Math.min(1, (side.lost - spec.lossesFrom) / (spec.lossesFull - spec.lossesFrom)));
  const shock = AI.morale.shock * Math.min(1, (side.shock ?? 0) / AI.morale.shockFull);
  return losses + shock + Math.min(spec.contagionMost, spec.contagion * runnersSeen(world, fighter));
}

/**
 * Fear from the men round him (AI.morale): alone or among his own, before a
 * drilled body of theirs, his own falling beside him (the best of them the
 * most); in a battle (a side of rout.minSide or more). Not his side's whole state
 * (routFear's losses) but what he sees within a few strides.
 */
export function companyFear(world, fighter) {
  const spec = AI.morale;
  const side = world.sides?.[fighter.corner];
  if (!side || side.men < AI.rout.minSide) return 0;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  let friends = 0;
  let formed = 0;
  for (const other of world.fighters) {
    if (other === fighter || other.state !== 'up' || other.crawling || other.fled || other.dormant || other.hidden) continue;
    if (Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[1]) > spec.near) continue;
    if (other.corner === fighter.corner) friends += other.panicked ? 0 : 1;
    // Men in their places in a drilled body before him: a wall of them that does not give way.
    else if (hostile(other, fighter) && !other.panicked && other.slot && world.formations?.[other.formation]) formed += 1;
  }
  let fear = friends ? -Math.min(spec.supportMost, spec.support * friends) : spec.alone;
  fear += Math.min(spec.formedMost, spec.formed * formed);
  let fallen = 0;
  for (const [x, z, worth = 1] of side.fallen ?? []) if (Math.hypot(x - at[0], z - at[1]) < spec.fallenWithin) fallen += worth;
  return fear + Math.min(spec.fallenMost, spec.fallen * fallen);
}

/**
 * Fear from the field seen (AI.outnumbered): the strength of his side's men
 * still fighting against the other side's, wherever they stand. Nothing to
 * `from` to one; `fear` at `full`, `most` at `beyond` (log by log between). In
 * a battle only (a side of rout.minSide or more): a duel or a brawl has
 * standingFear, which weighs the men before him.
 */
export function outnumberedFear(world, fighter) {
  const spec = AI.outnumbered;
  const side = world.sides?.[fighter.corner];
  const other = world.sides?.[fighter.corner === 'red' ? 'blue' : 'red'];
  if (!side || !other || side.men < AI.rout.minSide || !other.strength) return 0;
  const odds = other.strength / Math.max(1e-6, side.strength);
  if (odds <= spec.from) return 0;
  const along = (low, high) => Math.max(0, Math.min(1, Math.log(odds / low) / Math.log(high / low)));
  return spec.fear * along(spec.from, spec.full) + (spec.most - spec.fear) * along(spec.full, spec.beyond);
}

/**
 * Perceived relative strength (AI.standing), −steady..fear: the knot of
 * enemies round the nearest of them against himself and his own round him,
 * each man by strengthOf; felt the more the nearer they are. Near even,
 * nothing; much stronger than us, fear; much weaker, steadiness. The same in
 * a duel, one against many and a battle.
 */
export function standingFear(world, fighter) {
  const spec = AI.standing;
  const where = (other) => [other.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2]];
  const at = where(fighter);
  const enemies = world.fighters.filter((other) => hostile(other, fighter) && !other.dormant && !other.hidden && inFight(other));
  let nearest = null;
  let nearestApart = Infinity;
  // (Behind a palisade or a ditch, an enemy is as far as he would have to walk to get at him: physics/fieldworks.js walkingDistance.)
  const works = Boolean(world.arena.works);
  for (const enemy of enemies) {
    const apart = works ? walkingDistance(world, where(enemy), at) : Math.hypot(where(enemy)[0] - at[0], where(enemy)[1] - at[1]);
    if (apart < nearestApart) [nearest, nearestApart] = [enemy, apart];
  }
  if (!nearest || nearestApart >= spec.sight) return 0;
  const middle = where(nearest);
  const weight = (other, from) => {
    const apart = Math.hypot(where(other)[0] - from[0], where(other)[1] - from[1]);
    return Math.max(0, Math.min(1, 1 - (apart - spec.group) / spec.groupFade));
  };
  let ours = strengthNow(fighter);
  for (const other of world.fighters) if (other !== fighter && other.corner === fighter.corner && !other.dormant) ours += weight(other, at) * strengthNow(other);
  let theirs = 0;
  for (const enemy of enemies) theirs += weight(enemy, middle) * strengthNow(enemy);
  if (!theirs || !ours) return 0;
  const gap = Math.log(theirs / ours);
  const past = (value) => Math.max(0, Math.min(1, (value - spec.parity) / spec.span));
  const coming = Math.min(1, 1 - (nearestApart - spec.near) / (spec.sight - spec.near));
  return coming * (spec.fear * past(gap) - spec.steady * past(-gap));
}

/** How many times the shock of a thing (`what`: 'gun', 'horse') is to him: AI.shock `strange` if his people had never met it (FACTIONS `strangers`), else 1. */
export function strangeness(fighter, what) {
  return FACTIONS[factionOf(fighter.body.inputs)]?.strangers?.includes(what) ? AI.shock.strange : 1;
}

/**
 * The ambush (world.ambush, a side's men `hidden`: physics.js createWorld) is
 * sprung at its signal, or the moment one of them strikes (the player may go
 * early), or one of the other side comes on one of them (AI.ambush `spotted`):
 * from then they are seen, and fight.
 */
function springAmbush(world) {
  const ambush = world.ambush;
  if (!ambush || ambush.sprung) return;
  const hidden = world.fighters.filter((fighter) => fighter.hidden);
  let sprung = world.time >= ambush.signal || !hidden.length;
  for (let index = Math.min(ambush.cursor, world.events.length); index < world.events.length && !sprung; index += 1) {
    const event = world.events[index];
    if (event.attacker !== undefined && world.fighters[event.attacker]?.hidden) sprung = true;
  }
  ambush.cursor = world.events.length;
  for (const fighter of hidden) {
    if (sprung) break;
    const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    sprung = world.fighters.some((other) => hostile(other, fighter) && inFight(other) && Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[1]) < AI.ambush.spotted);
  }
  if (!sprung) return;
  ambush.sprung = true;
  ambush.at = world.time;
  for (const fighter of hidden) fighter.hidden = false;
  world.events.push({ time: world.time, kind: 'ambush', corner: ambush.corner, effects: ['the signal: the ambush is sprung'] });
}

/**
 * Each man's startle from the guns (AI.shock): every gun fired since the last
 * look ('shot' events, one to a man's firing however many balls or pellets)
 * startles the other side's men near its muzzle, the more the nearer, `strange` times a
 * man whose people had never heard one; the startle dies away.
 */
function keepShock(world, dt) {
  const spec = AI.shock;
  const events = world.events;
  if ((world.shockCursor ?? 0) > events.length) world.shockCursor = events.length;
  const blasts = [];
  const fired = new Set();
  for (let index = world.shockCursor ?? 0; index < events.length; index += 1) {
    const event = events[index];
    if (event.kind !== 'shot' || !event.from || fired.has(`${event.attacker}:${event.time}`)) continue;
    fired.add(`${event.attacker}:${event.time}`);
    blasts.push([event.from[0], event.from[2], world.fighters[event.attacker]]);
  }
  world.shockCursor = events.length;
  const fade = 0.5 ** (dt / spec.halfLife);
  for (const fighter of world.fighters) {
    if (fighter.startle) fighter.startle *= fade;
    if (!blasts.length || fighter.state === 'out') continue;
    const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    for (const [x, z, shooter] of blasts) {
      // His own side's guns are no shock to him: he knew they would fire, and they fire at the others.
      if (shooter && !hostile(shooter, fighter)) continue;
      const heard = Math.max(0, Math.min(1, 1 - (Math.hypot(x - at[0], z - at[1]) - spec.blastNear) / (spec.blastFar - spec.blastNear)));
      if (heard > 0) fighter.startle = (fighter.startle ?? 0) + spec.blast * heard * strangeness(fighter, 'gun');
    }
  }
}

/**
 * Fear from shock (AI.shock): the startle of guns gone off near him (keepShock),
 * and a horse of theirs coming at him at speed, the nearest such; each the
 * more if his people had never met it (strangeness). In a battle or a duel alike.
 */
export function shockFear(world, fighter) {
  const spec = AI.shock;
  const guns = Math.min(spec.blastMost * strangeness(fighter, 'gun'), fighter.startle ?? 0);
  if (fighter.mount) return guns;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  let horse = 0;
  for (const other of world.fighters) {
    const mount = other.mount;
    if (!mount || !hostile(other, fighter) || other.hidden || other.dormant || !inFight(other) || mount.speed < spec.horseSpeed) continue;
    const off = [at[0] - mount.at[0], at[1] - mount.at[1]];
    const apart = Math.hypot(off[0], off[1]);
    if (apart >= spec.horseFar) continue;
    // Its heading on the floor (yaw 0 runs along +x), against the line to him.
    const heading = [Math.cos(mount.yaw), -Math.sin(mount.yaw)];
    if ((off[0] * heading[0] + off[1] * heading[1]) / Math.max(apart, 1e-6) < spec.horseCone) continue;
    horse = Math.max(horse, Math.min(1, 1 - (apart - spec.horseNear) / (spec.horseFar - spec.horseNear)));
  }
  return guns + spec.horse * horse * (horse > 0 ? strangeness(fighter, 'horse') : 1);
}

/** His side's discipline, 0..1 (world.discipline, set by the level's order for each side). */
const disciplineOf = (world, fighter) => world.discipline?.[fighter.corner] ?? 0;

/** A battle on a closed field (not level mode's open stages): where the broken run, crawl, come back or leave (AI.rout). */
const battleField = (world, fighter) => !world.arena.open && (world.sides?.[fighter.corner]?.men ?? 0) >= AI.rout.minSide;

/** At the field's edge (within rout `edge` m of it). */
function atFieldEdge(world, fighter) {
  const { halfX, halfZ } = world.arena;
  const edge = AI.rout.edge;
  return Math.abs(fighter.x[P.pelvis * 3]) > halfX - edge || Math.abs(fighter.x[P.pelvis * 3 + 2]) > halfZ - edge;
}

/** How far the nearest enemy still up is (m; Infinity if none). */
function nearestFoeAt(world, fighter) {
  let nearest = Infinity;
  for (const other of world.fighters) {
    if (!foeOf(fighter, other) || other.state !== 'up') continue;
    nearest = Math.min(nearest, Math.hypot(other.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]));
  }
  return nearest;
}

/** Off the field: out of the battle for good, and not drawn or moved (dormant, as a stage's sleeping men are). */
function leaveField(world, fighter, how) {
  fighter.fled = true;
  fighter.dormant = true;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.running = false;
  world.events.push({ time: world.time, kind: 'fled', fighter: fighter.id, effects: [how] });
}

/**
 * The chance a runner who has got clear comes back (AI.rout rally): less the
 * more he is hurt, `again` as much each time he has come back, none past `most`.
 */
export function rallyChance(fighter) {
  const spec = AI.rout.rally;
  const times = fighter.rallies ?? 0;
  if (times >= spec.most) return 0;
  return Math.max(0, spec.chance * (1 - spec.hurt * hurtShare(fighter)) * spec.again ** times);
}

/** He finds his nerve and goes back in, hesitant for a while (AI.rout rally). */
function comeBack(world, fighter) {
  const spec = AI.rout.rally;
  fighter.panicked = false;
  fighter.rallies = (fighter.rallies ?? 0) + 1;
  fighter.fear = Math.min(fighter.fear ?? 0, spec.nerve);
  fighter.calmFor = 0;
  fighter.steadyUntil = world.time + spec.steadyFor;
  fighter.shakyUntil = world.time + spec.shaky;
  fighter.goTo = null;
  world.events.push({ time: world.time, kind: 'rally', fighter: fighter.id, effects: ['comes back to the fight'] });
}

/**
 * The chance a man breaking goes down to crawl rather than run (AI.rout
 * crawl): the hurt, the spent and the most afraid go down. Decided once, as he breaks.
 */
export function crawlShare(fighter, breakAt = AI.panic.breakAt) {
  const spec = AI.rout.crawl;
  const hurt = Math.max(hurtShare(fighter), legShare(fighter));
  const tired = 1 - Math.max(0, Math.min(1, fighter.stamina ?? 1));
  const afraid = Math.max(0, Math.min(1, ((fighter.fear ?? 0) - breakAt) / Math.max(1e-6, 1 - breakAt)));
  return Math.min(spec.most, spec.share + spec.hurt * hurt + spec.tired * tired + spec.afraid * afraid);
}

/**
 * A broken man of a big side runs for its rear, at a broken man's pace (AI.rout
 * `pace`). Once at the edge with no enemy near, he comes back (rallyChance) or
 * leaves the field: never stands there. True while this has him.
 */
function rout(world, fighter, opponent) {
  const spec = AI.rout;
  const side = world.sides?.[fighter.corner];
  // An open arena (level mode: the box is only a far limit, not an edge to flee over) is never fled over: a stage's garrison runs for its section's rear instead (levelmode/awareness.js).
  if (world.arena.open) return world.stage?.rout?.(world, fighter, opponent) ?? false;
  if (!side?.rear || side.men < spec.minSide) return false;
  const at = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const { halfX, halfZ } = world.arena;
  const nearest = opponent ? Math.hypot(opponent.x[P.pelvis * 3] - at[0], opponent.x[P.pelvis * 3 + 2] - at[1]) : Infinity;
  if (atFieldEdge(world, fighter) && nearest > spec.clearOf) {
    // Clear of them, the edge of the field before him: back in, or away for good.
    if (world.random() < rallyChance(fighter)) {
      comeBack(world, fighter);
      return false;
    }
    leaveField(world, fighter, 'flees the field');
    return true;
  }
  // Pressed close, he first gets clear of the man on him.
  if (nearest < AI.passive.safeDistance) return false;
  const margin = spec.edge * 0.5;
  fighter.goTo = [Math.max(-(halfX - margin), Math.min(halfX - margin, at[0] + side.rear[0] * 30)), 0, Math.max(-(halfZ - margin), Math.min(halfZ - margin, at[1] + side.rear[1] * 30))];
  fighter.move = spec.pace;
  fighter.running = fighter.stamina > AI.passive.runWhile;
  return true;
}

/** How deadly what he holds is (WEAPONS threat; bare hands 1). */
const lethality = (fighter) => (fighter?.weapon?.held ? fighter.weapon.spec.threat ?? 1 : 1);

/** How much deadlier his weapon is than mine, 0..1 (one `lethalSpan` deadlier: 1), as near as he is. */
export function weaponDread(fighter, opponent) {
  const spec = AI.panic;
  const deadlier = Math.max(0, Math.min(1, (lethality(opponent) - Math.max(1, spec.ownWeapon * lethality(fighter))) / spec.lethalSpan));
  if (!deadlier) return 0;
  const apart = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
  const near = Math.max(0, Math.min(1, 1 - (apart - reachOf(opponent) - spec.dreadNear) / spec.dreadFade));
  const shoots = opponent.weapon?.held && (opponent.weapon.spec.ranged || opponent.weapon.spec.shot);
  const felt = Math.min(1, (fighter.aiFelt?.count ?? 0) / spec.proven);
  return deadlier * Math.max(near, shoots ? spec.dreadAtRange : 0) * (spec.unproven + (1 - spec.unproven) * felt);
}

/** A ring bout: the ropes, and nobody armed. */
const ringBout = (world, fighter, opponent) => Boolean(world.arena.ring) && !fighter.weapon?.held && !opponent?.weapon?.held;

/**
 * What he fears now, 0..1: being outmatched (`nerve` −1..1: size, strength,
 * skill; `dread`: the weapon), being hurt and broken, his side's state, the
 * strength of the men before him against his own round him (standingFear); all
 * multiplied by how outmatched he is, damped by armour, by adrenaline (most
 * in an even fight) and by the ring.
 */
export function fearTarget(world, fighter, nerve, opponent) {
  const spec = AI.panic;
  const outmatched = Math.max(0, -nerve);
  const dread = opponent ? weaponDread(fighter, opponent) : 0;
  const shaken = world.leaders?.[fighter.corner]?.shaken ? spec.standardDown : 0;
  const legs = ['lKnee', 'rKnee', 'lHip', 'rHip'].filter((joint) => fighter.broken.has(joint)).length;
  const broken = brokenArms(fighter) * spec.brokenArm + Math.min(2, legs) * spec.brokenLeg;
  const felt = spec.outmatched * outmatched + spec.armed * dread + spec.hurt * hurtShare(fighter) + shaken + broken + routFear(world, fighter) + companyFear(world, fighter) + standingFear(world, fighter) + outnumberedFear(world, fighter) + generalFear(world, fighter) + shockFear(world, fighter);
  // How outmatched he is multiplies the rest, a little less before a blow has landed.
  const blows = Math.min(1, (fighter.aiFelt?.count ?? 0) / spec.proven);
  const mismatch = Math.min(1, outmatched + dread) * (spec.unprovenMismatch + (1 - spec.unprovenMismatch) * blows);
  const rush = AI.adrenaline.nerve + (AI.adrenaline.nerveOutmatched - AI.adrenaline.nerve) * mismatch;
  const ring = opponent && ringBout(world, fighter, opponent) ? spec.ring : 1;
  // In his place in a drilled formation (a slot: his kit's drill, or his side's by its level), the ranks hold him.
  const ranks = fighter.slot && world.formations?.[fighter.formation] ? spec.drilled : 1;
  const discipline = 1 - AI.morale.discipline * disciplineOf(world, fighter);
  return Math.max(0, Math.min(1, felt * (1 + spec.mismatch * mismatch) * (1 - fighter.body.gear.courage) * (1 - rush * (fighter.adrenaline ?? 0)) * ring * ranks * discipline));
}

/**
 * Fear, settling towards what he feels now; past breaking point he may
 * break (unless adrenaline holds him), and once calm again he recovers.
 */
function feelFear(world, fighter, nerve, dt, opponent = null) {
  const spec = AI.panic;
  // A machine (`gear.machine`: a robot) has no morale: it is never afraid and never runs; it fights until it is destroyed.
  if (fighter.body.gear.machine) {
    fighter.fear = 0;
    fighter.panicked = false;
    return;
  }
  fighter.adrenaline = (fighter.adrenaline ?? 0) * 0.5 ** (dt / AI.adrenaline.halfLife);
  // Come back from a rout, he has talked himself into it: for a while he feels it the less (AI.rout rally).
  const steadied = world.time < (fighter.steadyUntil ?? -Infinity) ? 1 - AI.rout.rally.steadied : 1;
  const target = fearTarget(world, fighter, nerve, opponent) * steadied;
  fighter.fear = (fighter.fear ?? 0) + (target - (fighter.fear ?? 0)) * Math.min(1, dt / spec.settle);
  // Adrenaline holds him from breaking: easily in an even fight, hardly against a much deadlier man.
  const mismatch = Math.min(1, Math.max(0, -nerve) + (opponent ? weaponDread(fighter, opponent) : 0));
  const held = fighter.adrenaline > spec.adrenalineHolds + (AI.adrenaline.holdsOutmatched - spec.adrenalineHolds) * mismatch;
  const shaky = Math.max(spec.breakAtLeast, spec.breakAt - spec.brokeBefore * (fighter.panics ?? 0));
  const breakAt = shaky + (1 - shaky) * AI.morale.breakLater * disciplineOf(world, fighter);
  if (!fighter.panicked) {
    if (!held && (breaks(world, fighter, breakAt, dt) || followsRunners(world, fighter, dt))) {
      fighter.panicked = true;
      fighter.panics = (fighter.panics ?? 0) + 1;
      fighter.calmFor = 0;
      fighter.punch = null;
      fighter.clinch = null;
      // Whatever is in his hands goes: he runs.
      if (fighter.weapon?.held) dropWeapon(world, fighter, 'dropped');
      world.events.push({ time: world.time, kind: 'panic', fighter: fighter.id, effects: ['breaks and runs'] });
      fighter.shakyUntil = undefined;
      fighter.steadyUntil = undefined;
      // In a battle the hurt, the spent and the most afraid go down on their knees and crawl; the rest run (AI.rout crawl).
      if (battleField(world, fighter) && !fighter.mount && world.random() < crawlShare(fighter, breakAt)) startCrawl(world, fighter, 'crawls away in the rout');
    }
    crawlOnBrokenLimb(world, fighter, dt);
    return;
  }
  // Badly hurt as well as broken: down on his knees, crawling for safety.
  const crawl = AI.crawl;
  const severity = Math.max(hurtShare(fighter), legShare(fighter));
  if (fighter.state === 'up' && !fighter.crawling && severity > crawl.from) {
    const rate = crawl.rate * ((severity - crawl.from) / (1 - crawl.from)) * (1 - crawl.adrenaline * fighter.adrenaline);
    if (world.random() < rate * dt) startCrawl(world, fighter, 'crawls away');
  }
  crawlOnBrokenLimb(world, fighter, dt);
  // Once off the field he stays off.
  if (fighter.fled) return;
  fighter.calmFor = fighter.fear < spec.calmAt ? (fighter.calmFor ?? 0) + dt : 0;
  if (held || fighter.calmFor > spec.calmSeconds) {
    fighter.panicked = false;
    world.events.push({ time: world.time, kind: 'rally', fighter: fighter.id, effects: [held ? 'adrenaline: fights on' : 'steadies'] });
  }
}

/** Past his breaking point, whether he breaks this step: the further past it, the likelier (AI.panic `rate` a second at full fear). */
function breaks(world, fighter, breakAt, dt) {
  return fighter.fear > breakAt && world.random() < AI.panic.rate * ((fighter.fear - breakAt) / (1 - breakAt)) * dt;
}

/**
 * How readily he goes with the runners beside him, a chance a second (AI.rout
 * `follow`): for each of his own broken within `beside` m (seen as
 * runnersSeen sees them), as afraid as he is past `from`, less his side's
 * discipline. In a battle only (a side of rout.minSide or more).
 */
export function followRate(world, fighter) {
  const spec = AI.rout.follow;
  if ((world.sides?.[fighter.corner]?.men ?? 0) < AI.rout.minSide || (fighter.fear ?? 0) <= spec.from) return 0;
  const runners = Math.min(spec.followMost, runnersSeen(world, fighter, spec.beside));
  const afraid = (fighter.fear - spec.from) / (1 - spec.from);
  return spec.rate * runners * afraid * (1 - spec.discipline * disciplineOf(world, fighter));
}

/** Whether he goes with the runners beside him this step (followRate). */
function followsRunners(world, fighter, dt) {
  const rate = followRate(world, fighter);
  return rate > 0 && world.random() < rate * dt;
}

/** Passive: get away from whoever is nearest, covering up when one swings. */
function keepAway(world, fighter, opponent, dt) {
  const at = point(fighter.x, P.pelvis);
  const enemies = world.fighters.filter((other) => foeOf(fighter, other) && other.state === 'up');
  let nearest = opponent;
  let nearestDistance = Infinity;
  for (const enemy of enemies) {
    const distance = Math.hypot(enemy.x[P.pelvis * 3] - at[0], enemy.x[P.pelvis * 3 + 2] - at[2]);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = enemy;
    }
  }
  if (nearestDistance < AI.passive.safeDistance) {
    fighter.aiEscapeAge = (fighter.aiEscapeAge ?? Infinity) + dt;
    if (!fighter.aiEscape || fighter.aiEscapeAge > AI.gunKite.rethink) {
      fighter.aiEscape = escapePoint(world, fighter, nearest);
      fighter.aiEscapeAge = 0;
    }
    fighter.goTo = fighter.aiEscape;
    // (Broken in a battle: a broken man's jog, AI.rout pace.)
    fighter.move = fighter.panicked && battleField(world, fighter) ? AI.rout.pace : 1;
    fighter.running = fighter.stamina > AI.passive.runWhile;
  } else fighter.move = 0;
  // Hands up whenever someone swings at him.
  if (!fighter.defence && enemies.some((enemy) => enemy.punch?.target === fighter.id)) perform(world, fighter, 'guard');
}

/**
 * A gun keeps away. Closer than `flee` (m), he turns and runs for the most
 * open ground, round him and never into a corner, until he has `flee` plus
 * `rest` again; then he turns, takes the stance, gun up on him in both
 * hands, and fires as he backs away.
 */
/**
 * A style with weapons built into the arms (`switches`: [{ to, within,
 * beyond, strikes }]) takes up the first whose terms are met: the man
 * nearer than `within` m, further than `beyond`, or `strikes` blows thrown
 * with the one in use. Between blows only.
 */
function switchArms(world, fighter, style, distance) {
  if (!style.switches || fighter.punch) return false;
  const thrown = fighter.stats.thrown - (fighter.mountedSince ?? 0);
  const rule = style.switches.find((each) => (each.within === undefined || distance < each.within) && (each.beyond === undefined || distance > each.beyond) && (each.strikes === undefined || thrown >= each.strikes));
  return Boolean(rule) && useMounted(world, fighter, rule.to);
}

/**
 * A bow or a gun with nothing left to shoot (physics/ranged.js ammoLeft, or given up: heldTooLong) is spent: he lets it
 * fall and draws his kit's sidearm (physics.js dropWeapon), and fights as the men of his side's line do, in his
 * place in the ranks or at the man before him; never idle with it, nor off the field. A gun that is also a club
 * (`emptyStyle`, the three-eyed gun) is kept and swung; a forearm gun cannot be let go. Returns the style he fights in.
 */
function castAside(world, fighter, style) {
  const weapon = fighter.weapon;
  if (!style.ranged || !weapon?.held || !weapon.spent || !weapon.spec.ranged || weapon.spec.mounted) return style;
  if (style.emptyStyle) emptied(world, fighter);
  else dropWeapon(world, fighter, 'dropped');
  fighter.aimAt = undefined;
  fighter.reloading = false;
  return STYLES[fighter.style] ?? STYLES.mix;
}

/**
 * Whether a shot at his man now would put his own men in its way, so he holds it: any shot at a man with a comrade
 * within AI.gunCrowd of him (at grips with ours: a miss, or an arrow's drop, finds ours); a flat shot (a gun, a
 * crossbow, or a bow not shooting over heads) with a comrade near the line to him, too (teamSpacing). A bow in the
 * ranks puts its arrow up over the heads before it (physics/ranged.js overHeads), as archers shot over their own lines.
 */
function shotFouled(world, fighter, opponent, { overHeads = false } = {}) {
  const lineOfFire = world.stage ? AI.shotLineOfFire : AI.lineOfFire;
  if (!overHeads && teamSpacing(world, fighter, opponent, lineOfFire).blocked) return 'line';
  const at = point(fighter.x, P.pelvis);
  const mark = point(opponent.x, P.pelvis);
  const length = Math.hypot(mark[0] - at[0], mark[2] - at[2]) || 1e-6;
  const ahead = [(mark[0] - at[0]) / length, (mark[2] - at[2]) / length];
  const bow = Boolean(fighter.weapon?.spec.bow);
  const crowd = bow ? AI.arrowCrowd : AI.gunCrowd;
  let fouled = null;
  for (const mate of world.fighters) {
    if (mate === fighter || mate.corner !== fighter.corner || mate.state === 'out') continue;
    const there = point(mate.x, P.pelvis);
    if (Math.hypot(there[0] - mark[0], there[2] - mark[2]) < crowd) return 'crowd';
    // Over the heads: not one too near to rise over, nor a rider.
    if (!overHeads) continue;
    const offset = [there[0] - at[0], there[2] - at[2]];
    const along = offset[0] * ahead[0] + offset[1] * ahead[1];
    const across = Math.abs(offset[0] * ahead[1] - offset[1] * ahead[0]);
    if (along > 0.1 && along < length && across < lineOfFire + (mate.mount ? 0.5 : 0) && (mate.mount || along < AI.overHeadsFrom)) fouled = 'line';
  }
  return fouled;
}

/**
 * Another man to shoot at when his own mark is fouled (shotFouled): the nearest enemy standing within AI.markWithin m
 * with no comrade of his in the way. The rear of their line, the men not yet at grips with ours: where the archers
 * shot once the lines had met. Null when there is none.
 */
function clearMark(world, fighter, options) {
  const at = point(fighter.x, P.pelvis);
  let best = null;
  let nearest = AI.markWithin;
  for (const other of world.fighters) {
    if (!foeOf(fighter, other) || other.state !== 'up' || other.fled || other.hidden) continue;
    const apart = Math.hypot(other.x[P.pelvis * 3] - at[0], other.x[P.pelvis * 3 + 2] - at[2]);
    if (apart >= nearest || shotFouled(world, fighter, other, options)) continue;
    best = other;
    nearest = apart;
  }
  return best;
}

/**
 * A shot held (shotFouled) or not: how long he has been holding it (since his last shot). Past AI.holdShot s, his
 * man at grips with ours (`crowd`) and no other to shoot at (clearMark), he gives up shooting: the weapon is spent and
 * next think he lets it go and draws (castAside). Returns whether he did.
 */
function heldTooLong(world, fighter, fouled) {
  if (!fouled) {
    fighter.holdingShot = undefined;
    return false;
  }
  fighter.holdingShot ??= world.time;
  if (fouled !== 'crowd' || world.time - fighter.holdingShot < AI.holdShot || fighter.weapon.spec.mounted) return false;
  fighter.weapon.spent = true;
  fighter.holdingShot = undefined;
  return true;
}

function gunfight(world, fighter, opponent, distance, gun, dt) {
  // A fired matchlock: loaded only with nobody near; with someone coming,
  // away from him for room to load.
  const weapon = fighter.weapon;
  if (weapon.spec.shot && !weapon.loaded) {
    fighter.aimAt = undefined;
    // (Behind a palisade, how far the enemy would have to walk round it: physics/fieldworks.js walkingDistance.)
    const me = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
    const nearest = Math.min(...world.fighters.filter((other) => foeOf(fighter, other) && other.state === 'up').map((other) => (world.arena.works ? walkingDistance(world, [other.x[P.pelvis * 3], other.x[P.pelvis * 3 + 2]], me) : vec.length(vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis))))));
    if (nearest > gun.reloadSafe) {
      fighter.reloading = true;
      fighter.goTo = null;
      fighter.move = 0;
      fighter.strafe = 0;
      fighter.running = false;
      return;
    }
    fighter.reloading = false;
    fighter.aiEscapeAge = (fighter.aiEscapeAge ?? Infinity) + dt;
    if (!fighter.aiEscape || fighter.aiEscapeAge > AI.gunKite.rethink) {
      fighter.aiEscape = escapePoint(world, fighter, opponent);
      fighter.aiEscapeAge = 0;
    }
    fighter.goTo = fighter.aiEscape;
    fighter.move = 1;
    fighter.running = true;
    return;
  }
  fighter.reloading = false;
  // Shoot while there is time for a shot before he arrives; run when there
  // is not. Not for ever: a man as fast as you is never outrun, so after a
  // spell of running, turn and shoot.
  const me = point(fighter.x, P.pelvis);
  const toMe = vec.normalize([me[0] - opponent.x[P.pelvis * 3], 0, me[2] - opponent.x[P.pelvis * 3 + 2]]);
  const theirs = [opponent.rootVelocity[0], 0, opponent.rootVelocity[1]];
  const mine = [fighter.rootVelocity[0], 0, fighter.rootVelocity[1]];
  const closing = Math.max(0.3, vec.dot(vec.sub(theirs, mine), toMe));
  const timeLeft = (distance - gun.close) / closing;
  const standing = world.time < (fighter.aiStandUntil ?? -1);
  // A style that holds its ground (`ranged.holdGround`): shoots where he stands, never runs or backs off.
  if (gun.holdGround) fighter.aiFleeing = false;
  else if (distance < gun.flee && timeLeft < gun.shotSeconds && !standing && !fighter.aiFleeing) {
    fighter.aiFleeing = true;
    fighter.aiFleeSince = world.time;
  } else if (fighter.aiFleeing && (distance > gun.flee + gun.rest || world.time - fighter.aiFleeSince > gun.runFor)) {
    fighter.aiFleeing = false;
    fighter.aiStandUntil = world.time + gun.standFor;
  }
  if (fighter.aiFleeing && !fighter.punch) {
    fighter.aimAt = undefined;
    fighter.aiEscapeAge = (fighter.aiEscapeAge ?? Infinity) + dt;
    if (!fighter.aiEscape || fighter.aiEscapeAge > AI.gunKite.rethink) {
      fighter.aiEscape = escapePoint(world, fighter, opponent);
      fighter.aiEscapeAge = 0;
    }
    fighter.goTo = fighter.aiEscape;
    fighter.move = 1;
    fighter.running = true;
    return;
  }
  // Stood off: the stance, the gun on him, backing away while he can.
  fighter.aimAt = opponent.id;
  const back = point(fighter.x, P.pelvis);
  const away = [back[0] - opponent.x[P.pelvis * 3], back[2] - opponent.x[P.pelvis * 3 + 2]];
  const roomBehind = room(world, [back[0] + away[0] / distance, back[2] + away[1] / distance]);
  // A style that walks on as it shoots (`ranged.advance`, of a full step) closes the range instead.
  fighter.move = gun.advance ?? (!gun.holdGround && roomBehind > AI.gunKite.wallMargin ? -0.6 : 0);
  fighter.strafe = Math.sin(world.time * 0.8 + fighter.id * 1.7) * 0.4;
  if (fighter.punch || fighter.cooldown > 0) return;
  // His own men in the way: no shot (shotFouled). One on the line, he steps off it for a clear one; his man at grips
  // with ours, he looks for another, and in the end puts the weapon by and goes to them (heldTooLong).
  const fouled = shotFouled(world, fighter, opponent);
  const other = fouled ? clearMark(world, fighter) : null;
  if (!other && heldTooLong(world, fighter, fouled)) return;
  if (other) fighter.focus = other.id;
  if (fouled === 'line') fighter.strafe = teamSpacing(world, fighter, opponent).strafe || fighter.strafe;
  if (fouled) return;
  const zone = world.random() < gun.headShare ? 'head' : 'body';
  if (throwPunch(world, fighter, gun.move ?? 'shoot', zone)) {
    // From the stance the gun is already up: the shot goes as soon as the sights settle.
    fighter.punch.quick = true;
    fighter.cooldown = gun.between[0] + world.random() * gun.between[1];
  }
}

/** How far a floor point is from the nearest edge of the arena (m). */
function room(world, at) {
  return Math.min(world.arena.halfX - Math.abs(at[0]), world.arena.halfZ - Math.abs(at[1]));
}

/**
 * Where to run: of the points a stride away all round, the one farthest
 * from him, with room behind it, and not past him.
 */
function escapePoint(world, fighter, opponent) {
  // On a stage's terrain: along walkable ground, never over a ledge or into a wall (levelmode/awareness.js).
  const safe = world.stage?.escape?.(world, fighter, opponent);
  if (safe) return safe;
  const kite = AI.gunKite;
  const me = [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
  const him = [opponent.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2]];
  const toHim = vec.normalize([him[0] - me[0], 0, him[1] - me[1]]);
  let best = null;
  let bestScore = -Infinity;
  for (let index = 0; index < kite.directions; index += 1) {
    const angle = (index / kite.directions) * Math.PI * 2;
    const way = [Math.cos(angle), Math.sin(angle)];
    const limitX = world.arena.halfX - kite.wallMargin;
    const limitZ = world.arena.halfZ - kite.wallMargin;
    const at = [Math.max(-limitX, Math.min(limitX, me[0] + way[0] * kite.stride)), Math.max(-limitZ, Math.min(limitZ, me[1] + way[1] * kite.stride))];
    const fromHim = Math.hypot(at[0] - him[0], at[1] - him[1]);
    const toward = way[0] * toHim[0] + way[1] * toHim[2];
    const score = fromHim + kite.roomWeight * Math.min(room(world, at), 2) - kite.pastWeight * Math.max(0, toward) - AI.cohesion.escape * strayFromLeader(world, fighter, at);
    if (score > bestScore) {
      bestScore = score;
      best = [at[0], 0, at[1]];
    }
  }
  return best;
}

/** Crawling: away from the nearest of them, on his knees, as long as he can. */
function crawlAway(world, fighter, dt) {
  fighter.focus = undefined;
  fighter.strafe = 0;
  const at = point(fighter.x, P.pelvis);
  const enemy = nearestOpponent(world, fighter);
  if (!enemy) {
    fighter.goTo = null;
    fighter.move = 0;
    return;
  }
  // A way chosen is kept a while: a crawl is no place for second thoughts.
  fighter.aiCrawlAge = (fighter.aiCrawlAge ?? Infinity) + dt;
  if (!fighter.aiCrawlTo || fighter.aiCrawlAge > AI.crawl.rethink || Math.hypot(fighter.aiCrawlTo[0] - at[0], fighter.aiCrawlTo[2] - at[2]) < AI.crawl.arrived) {
    const away = [at[0] - enemy.x[P.pelvis * 3], at[2] - enemy.x[P.pelvis * 3 + 2]];
    fighter.aiCrawlTo = crawlTarget(world, at, away, Math.hypot(away[0], away[1]) < AI.crawl.pressed);
    fighter.aiCrawlAge = 0;
  }
  if (!fighter.aiCrawlTo) {
    // At the wall with nobody on him, or cornered: he stays as he is, facing the way he was going.
    fighter.goTo = [at[0] + Math.cos(fighter.yaw) * 2, 0, at[2] - Math.sin(fighter.yaw) * 2];
    fighter.move = 0;
    return;
  }
  fighter.goTo = fighter.aiCrawlTo;
  fighter.move = 1;
}

/**
 * Where to crawl: straight away from him; with a wall in the way and him
 * close (`pressed`), along the wall (whichever way has more room); else, or
 * cornered, nowhere (null): he stays at the wall.
 */
function crawlTarget(world, at, away, pressed) {
  const { halfX, halfZ } = world.arena;
  const margin = AI.gunKite.wallMargin;
  const length = Math.hypot(away[0], away[1]) || 1;
  const ahead = [away[0] / length, away[1] / length];
  const clamp = (way) => [Math.max(-(halfX - margin), Math.min(halfX - margin, at[0] + way[0] * AI.crawl.away)), 0, Math.max(-(halfZ - margin), Math.min(halfZ - margin, at[2] + way[1] * AI.crawl.away))];
  const room = (point) => Math.hypot(point[0] - at[0], point[2] - at[2]);
  const straight = clamp(ahead);
  if (room(straight) > AI.crawl.away * 0.5) return straight;
  if (!pressed) return null;
  // Along the wall, whichever way has more room.
  let best = null;
  for (const way of [[-ahead[1], ahead[0]], [ahead[1], -ahead[0]]]) {
    const along = clamp([way[0] * 0.8 + ahead[0] * 0.2, way[1] * 0.8 + ahead[1] * 0.2]);
    if (room(along) > AI.crawl.away * 0.5 && (!best || room(along) > room(best))) best = along;
  }
  return best;
}

export function think(world, fighter, dt) {
  decide(world, fighter, dt);
  // Come back from a rout and not yet over it: he goes in at a hesitant walk, never a run (AI.rout rally).
  if (world.time < (fighter.shakyUntil ?? -Infinity) && !fighter.panicked && !fighter.crawling && fighter.move > 0) {
    fighter.move *= AI.rout.rally.pace;
    fighter.running = false;
  }
}

/** What he does this step (think). */
function decide(world, fighter, dt) {
  const random = world.random;
  fighter.strafe = 0;
  fighter.running = false;
  fighter.aimAt = undefined;
  if (fighter.state !== 'up') {
    fighter.move = 0;
    return;
  }
  if (fighter.crawling) {
    // Crawled to the edge of a battle's field with nobody near: off it (AI.rout crawl).
    if (crawlingAway(fighter) && battleField(world, fighter) && atFieldEdge(world, fighter) && nearestFoeAt(world, fighter) > AI.rout.clearOf) {
      leaveField(world, fighter, 'crawls off the field');
      return;
    }
    crawlAway(world, fighter, dt);
    return;
  }
  // Off the field: he stands well back, out of it.
  if (fighter.fled) {
    fighter.goTo = null;
    fighter.move = 0;
    return;
  }
  // On his knees with the pain: nothing until he is up.
  if (fighter.pain) {
    fighter.move = 0;
    return;
  }
  // His own choice, or the man the player's order sends him at (command.js).
  const opponent = orderedFocus(world, fighter, chooseFocus(world, fighter));
  if (!opponent) {
    fighter.move = 0;
    return;
  }
  // On horseback: the charge (riding.js).
  if (fighter.mount) {
    // A wing of horse stands on the flank until it is released (formation.js moveWings).
    if (fighter.wing?.held) holdWing(fighter, world.time);
    else ride(world, fighter, opponent, STYLES[fighter.style] ?? STYLES.mix, dt, { gunfight });
    return;
  }
  switchMix(world, fighter, dt);
  // A weapon on the floor, and the chance to get it.
  fighter.goTo = null;
  // The side's standard down, and he nearest it: that first.
  if (takeUpStandard(world, fighter)) return;
  // The net: thrown once he is in range of a man not already in one.
  if (fighter.net?.held && opponent.state === 'up' && !opponent.netted) {
    const apart = Math.hypot(opponent.x[P.pelvis * 3] - fighter.x[P.pelvis * 3], opponent.x[P.pelvis * 3 + 2] - fighter.x[P.pelvis * 3 + 2]);
    if (apart > AI.net.from && apart < AI.net.to && random() < AI.net.rate * dt) castNet(world, fighter, opponent);
  }
  if (goForWeapon(world, fighter, opponent, dt)) return;
  // A bow or a gun with nothing left to shoot: let fall, the sidearm drawn (castAside).
  let style = castAside(world, fighter, STYLES[fighter.style]);
  const nerve = confidence(fighter, opponent, world);
  fighter.aiConfidence = nerve;
  // Fear builds and may break him; broken, or passive by choice, he only covers up and gets away.
  feelFear(world, fighter, nerve, dt, opponent);
  if (fighter.panicked && rout(world, fighter, opponent)) return;
  if (style.passive || fighter.panicked) {
    keepAway(world, fighter, opponent, dt);
    return;
  }
  // A man held in his wolf-brush: kept there, not struck at (holdWithBrush).
  if (holdWithBrush(world, fighter, opponent)) return;
  // The player's order (command.js): to him, a charge, a hold; over his place in the ranks.
  const order = obeyOrder(world, fighter, opponent, style, dt);
  if (order === 'obeyed') return;
  // In the ranks: his place first.
  if (order !== 'fight' && holdRank(world, fighter, opponent, style, dt)) return;
  const bold = AI.confidence;
  const basePlan = chooseStrategy(world, fighter, opponent, dt);
  // Confidence presses: closer, more often inside, quicker to throw, slower
  // to cover up, readier to load up. Fear is the reverse.
  // Afraid but not broken, he hangs back: further off, slower to go in, less pressing (AI.morale hesitate).
  // In a battle (a side of rout.minSide or more): a bout's fear is its own (the ring, the duel).
  // Come back from a rout, he hangs back as a frightened man would, and his guard is poor (AI.rout rally).
  const shaky = world.time < (fighter.shakyUntil ?? -Infinity);
  const afraid = (world.sides?.[fighter.corner]?.men ?? 0) >= AI.rout.minSide ? Math.max(fighter.fear ?? 0, shaky ? AI.rout.rally.hesitant : 0) : 0;
  const hesitate = AI.morale.hesitate;
  const plan = {
    ...basePlan,
    range: basePlan.range - bold.closer * nerve + hesitate.range * afraid,
    pressure: basePlan.pressure * Math.exp(bold.pressure * nerve) * (1 - hesitate.pressure * afraid),
    tempo: basePlan.tempo * Math.exp(-bold.tempo * nerve) * (1 + hesitate.tempo * afraid),
    defend: basePlan.defend * Math.exp(-bold.defend * nerve) * (shaky ? 1 - AI.rout.rally.guard : 1),
    heavy: Math.max(0, basePlan.heavy + bold.heavy * nerve),
  };
  const distance = vec.length(vec.sub(point(opponent.x, P.pelvis), point(fighter.x, P.pelvis)));
  // A man down or getting up is not hit. The last man of his side, down,
  // is held down; anyone else is given room.
  if (opponent.state !== 'up') {
    fighter.aiCombo = null;
    if (holdDown(world, fighter, opponent)) return;
    fighter.move = distance < AI.neutralDistance ? -0.8 : 0;
    return;
  }
  // A couched charge (style.couchedCharge): the lance used once, as it was meant — run at him and
  // drive it home in stride; when that blow is done, hit or miss, the lance is let fall and the sidearm drawn.
  if (style.couchedCharge && couchedCharge(world, fighter, opponent, style, distance)) return;
  if (style.couchedCharge) style = STYLES[fighter.style] ?? STYLES.mix;
  // Forearm weapons (`switches`): the one the distance, or the blows thrown with this one, call for.
  if (switchArms(world, fighter, style, distance)) style = STYLES[fighter.style];
  // A gun: keep away and shoot; once he is in close, drop it and fight mixed.
  const gun = style.ranged && fighter.weapon?.held && !fighter.weapon.spent ? style.ranged : null;
  // A volley style (`ranged.volley`) shoots that many and then goes in, however far he is.
  const volleySpent = Boolean(gun?.volley) && (fighter.loosed ?? 0) >= gun.volley;
  if (gun && distance > gun.close && !volleySpent) {
    gunfight(world, fighter, opponent, distance, gun, dt);
    return;
  }
  if (gun && style.emptyStyle) {
    // A gun that is also a club (the three-eyed gun): a man on him, it is a club now.
    fighter.weapon.spent = true;
    fighter.style = style.emptyStyle;
    fighter.aimAt = undefined;
    style = STYLES[fighter.style];
  } else if (gun) {
    dropWeapon(world, fighter, 'dropped');
    style = STYLES[fighter.style] ?? STYLES.mix;
    // A style that charges in once the bow is down (`ranged.charge` s): straight at him with the sword drawn.
    if (gun.charge) fighter.aiCharge = { until: world.time + gun.charge };
  }
  // A couched point levelled at him and coming: he does not run onto it (AI.offLine), whatever else he meant to do.
  // (Looked for only by a man about to run in: a charger, or one charging in after the bow.)
  const levelled = (fighter.aiCharge || (fighter.body.inputs.charging ?? 1) > 1) && world.fighters.some((other) => foeOf(fighter, other) && other.punch?.spec.couched && other.punch.target === fighter.id && (!fighter.body.gear.headLocked || inSight(fighter, other)));
  // Charging in after the bow: flat out until he is within the sword's reach, then the fight.
  if (fighter.aiCharge && !fighter.slot && !levelled) {
    if (world.time < fighter.aiCharge.until && distance > reachOf(fighter) * AI.chargeInto) {
      fighter.move = 1;
      fighter.running = true;
      fighter.strafe = 0;
      return;
    }
    fighter.aiCharge = null;
  }
  // A man on a horse coming at him: braced with a long weapon, or out of its way (riding.js).
  if (opponent.mount?.state === 'up' && !fighter.slot) {
    standToRider(world, fighter, opponent, style, dt);
    return;
  }
  // Grabbed by the neck, a brawler grabs back: the mutual tie, trading.
  if (style.attacks.collarTie && !fighter.clinch && !fighter.punch && opponent.clinch?.target === fighter.id && world.random() < AI.tieBackPerSecond * dt) perform(world, fighter, 'collarTie');
  // Facing a gun at a distance, standing off is death: close in, weaving,
  // and charge when near enough.
  // (A man in the ranks keeps his place under their shooting: no charge.)
  const facingGun = !gun && !fighter.slot && opponent.weapon?.held && opponent.weapon.spec.ranged && !opponent.weapon.spent && opponent.state === 'up';
  if (facingGun && distance > AI.gunRush.within) {
    fighter.move = 1;
    // Flat out all the way in: every stride slower is another shot.
    fighter.running = true;
    fighter.strafe = Math.sin(world.time * AI.gunRush.weave + fighter.id) * 0.8;
    if (!fighter.punch && !fighter.rush && distance < AI.gunRush.chargeFrom && world.random() < AI.gunRush.chargePerSecond * dt) perform(world, fighter, 'rush');
    return;
  }
  // A man who charges (`inputs.charging`, a raider): from well out, he comes on at a run.
  const charging = fighter.body.inputs.charging ?? 1;
  if (charging > 1 && !fighter.slot && !fighter.clinch && !levelled && distance > reachOf(fighter) + AI.charging.runFrom) {
    fighter.move = 1;
    fighter.running = true;
    fighter.strafe = 0;
    return;
  }
  const spacing = teamSpacing(world, fighter, opponent);
  fighter.strafe = spacing.strafe;
  // In a gang, wait my turn: only the nearest few take him on.
  const waiting = waitingTurn(world, fighter, opponent);
  if (waiting && random() < AI.refocusRate * dt) fighter.focus = undefined;
  const kicker = (style.attacks.roundhouse ?? 0) + (style.attacks.teep ?? 0) > 0.15;
  // Spells of pressure: for a few seconds the fighter works inside.
  fighter.aiPressure = Math.max(0, (fighter.aiPressure ?? 0) - dt);
  if (fighter.aiPressure === 0 && random() < (style.pressure ?? 0) * plan.pressure * AI.pressureSpellsPerShare * dt) fighter.aiPressure = AI.pressureSeconds;
  const inside = fighter.aiPressure > 0;
  const reach = reachOf(fighter);
  const range = (inside ? reach * 0.75 : reach + opponent.body.lengths.headRadius + AI.rangeExtra + plan.range + (kicker ? AI.kickerExtra : 0)) + (waiting ? AI.waitingDistance : 0);
  // Circling while waiting: round him, a way chosen by who I am.
  if (waiting) fighter.strafe = Math.max(-1, Math.min(1, fighter.strafe + (fighter.id % 2 ? 0.6 : -0.6)));
  // His own cadence: spells of moving and of working, in bursts; against a
  // longer reach or a blade, held off out of reach between surges.
  // A machine that knows no fear (`courage` 1) in plate no edge can cut (`cutProof`) walks in under the longer weapon.
  const fearless = fighter.body.gear.courage >= 1 && fighter.body.gear.cutProof;
  const wary = !waiting && !fighter.clinch && !fearless && outreached(fighter, opponent);
  const cadence = cadenceOf(world, fighter, style, plan, nerve);
  let mayAttack = true;
  if (fighter.clinch && style.clinchDrive) fighter.move = 1;
  else if (waiting || fighter.clinch) {
    if (distance > range + AI.rangeSlack) fighter.move = 1;
    else if (distance < range - AI.rangeSlack * 2 && !fighter.clinch) fighter.move = -0.7;
    else fighter.move *= Math.exp(-dt * 4);
  } else if (!fighter.defence || (fighter.defence.name !== 'stepBack' && fighter.defence.name !== 'sidestep')) {
    mayAttack = cadenceStep(world, fighter, opponent, { distance, range, wary, cadence, dt });
  }

  // React to a strike once it can be seen coming: after a reaction time
  // that training shortens, and only if not busy throwing one.
  // In a crowd, the strike to answer is whichever is coming at me.
  // Only a blow aimed at him: one at a team-mate is not his to answer.
  // A man in a helm bolted to his breast sees only through its slit (sightAngle): a blow from outside it comes unseen.
  const striker = world.fighters.find((other) => hostile(other, fighter) && other.punch?.target === fighter.id && (!fighter.body.gear.headLocked || inSight(fighter, other)));
  const incoming = striker?.punch;
  if (incoming && fighter.seenPunch !== incoming) {
    fighter.seenPunch = incoming;
    const skill = fighter.body.inputs.exercise;
    fighter.reactAt = AI.reactionSeconds - AI.reactionTrained * skill + (random() - 0.5) * 2 * AI.reactionJitter + (style.reactionSlow ?? 0) + WORLD.daze.reaction * dazedShare(fighter);
    fighter.reacted = false;
  }
  // Seen from when it starts to move, loading included; not while committed.
  // (A couched point carried in at a run: from when it comes within couchedWatch of him.)
  let seenFor = incoming?.age ?? incoming?.t;
  // A couched point levelled at him and coming: he does not walk onto it (AI.offLine).
  if (incoming?.spec.couched && !fighter.defence && fighter.move > 0) fighter.move = 0;
  if (incoming?.spec.couched) {
    if (incoming.watchedFrom === undefined && (incoming.driven || couchedGap(world, striker, incoming) <= AI.couchedWatch)) incoming.watchedFrom = incoming.age;
    seenFor = incoming.watchedFrom === undefined ? 0 : incoming.age - incoming.watchedFrom;
  }
  if (incoming && !fighter.reacted && !fighter.punch && !(fighter.committed > 0) && seenFor >= fighter.reactAt) {
    fighter.reacted = true;
    // Reeling from a blow, he is slow to cover up.
    const reeling = staggerShare(fighter, WORLD.stagger.defend);
    // A heavy blow is watched for, and got out of the way of, more than a light one.
    const heavy = 1 + AI.evadeHeavy.defend * heaviness(striker, incoming);
    if (random() < Math.min(0.97, style.defendChance * plan.defend * (0.6 + 0.6 * fighter.body.inputs.exercise) * reeling * heavy)) {
      let { name, side } = chooseDefence(fighter, striker, style, incoming, random);
      // Two blades: meet it with one and cut with the other.
      if (style.riposte && fighter.offWeapon?.held && riposte(world, fighter, striker, style, distance)) return;
      // A blade coming is got away from, not blocked with an arm.
      if (incoming.spec.path === 'blade' && wary && name !== 'sidestep' && !longPoint(striker, incoming) && random() < AI.blade.stepBackChance) name = 'stepBack';
      perform(world, fighter, name, { side, from: striker.id });
      // Slip and fire back: the counter comes while the attacker's hand is out.
      if ((name === 'slip' || name === 'roll') && random() < Math.min(0.9, (style.counter ?? 0) + plan.counter)) {
        fighter.cooldown = Math.min(fighter.cooldown, 0.12);
        fighter.aiCombo = null;
      }
    }
  }

  // Dazed: he covers up, gives ground a little, and holds his own blows back, the more the more dazed.
  const dazed = dazedShare(fighter);
  if (dazed > 0) {
    if (!fighter.defence && !fighter.punch) perform(world, fighter, 'guard');
    fighter.move *= 1 - 0.5 * dazed;
    if (fighter.cooldown < 0.05 && random() < dazed) fighter.cooldown = 0.3;
  }
  if (fighter.punch || fighter.rush || !mayAttack) return;
  // Never through a team-mate, and not while waiting a turn.
  if (spacing.blocked || waiting) {
    fighter.aiCombo = null;
    return;
  }
  // The rest of a combination follows as soon as the last hand is back.
  if (fighter.aiCombo?.length) {
    const next = fighter.aiCombo.shift();
    fighter.aiComboStep += 1;
    if (!throwPunch(world, fighter, next, fighter.aiComboZone)) fighter.aiCombo = null;
    else if (!fighter.aiCombo.length) fighter.cooldown = nextGap(world, fighter, style, plan, cadence);
    return;
  }
  fighter.aiComboStep = 0;
  if (fighter.cooldown > 0) return;
  // Choose among the moves that reach from here; in the clinch, knees.
  const choices = {};
  for (const [name, weight] of Object.entries(style.attacks)) {
    const spec = MOVES[name];
    if (fighter.clinch) {
      if (name === 'knee' && spacing.kickRoom) choices[name] = 1;
      continue;
    }
    if (spec.kind === 'rush') {
      // A charge is its own decision, not a fallback when nothing else reaches.
      if (distance > range - 0.1 && distance < range + 1.2 && random() < weight * AI.rushPerWeight * (1 + 3 * fighter.body.gear.courage) * charging * dt) {
        if (throwPunch(world, fighter, name)) fighter.cooldown = AI.restMin + random() * AI.restRange;
        return;
      }
      continue;
    }
    if (spec.kind === 'clinch') {
      // Held by the neck, a brawler grabs back: the mutual tie.
      const heldByHim = opponent.clinch?.target === fighter.id && spec.hands;
      if (distance < fighter.body.reach * 1.05) choices[name] = weight * (heldByHim ? 12 : 2);
      continue;
    }
    if (!spacing.kickRoom && spec.limb.match(/Foot|Knee/)) continue;
    const blade = spec.path === 'blade' ? bladeFor(fighter, spec) : fighter.weapon;
    const held = blade?.held ? blade.spec : null;
    if (spec.reach === 'weapon' && !held) continue;
    const reach = moveRange(spec, fighter.body, held) + opponent.body.lengths.headRadius;
    // Close-range moves only when close; long ones only when there is room.
    if (distance <= reach && (spec.reach !== 'leg' || distance > fighter.body.reach * 0.9)) choices[name] = weight;
  }
  // Holding him by the neck with one hand, the other hammers.
  if (fighter.clinch && style.clinchStrikes) {
    const free = (fighter.clinch.hands ?? ['l', 'r']).length < 2;
    if (free) for (const [name, weight] of Object.entries(style.clinchStrikes)) if (!fighter.clinch.hands.includes(MOVES[name].limb[0])) choices[name] = weight;
  }
  let move = pick(choices, random);
  if (!move) return;
  // Open a combination that starts with a punch that reaches from here.
  let combo = null;
  if (style.combos && !fighter.clinch && random() < (style.comboChance ?? 0)) {
    const openers = Object.fromEntries(Object.entries(style.combos).filter(([sequence]) => choices[sequence.split(' ')[0]]));
    const sequence = pick(openers, random);
    if (sequence) [move, ...combo] = sequence.split(' ');
  }
  // Now and then, one big shot instead: a power strike loaded up and thrown alone.
  const finishing = opponent.hurt > 0 || opponent.stagger > 0;
  const heavy = !fighter.clinch && random() < plan.heavy + (finishing ? AI.finishingHeavy : 0);
  if (heavy) {
    combo = null;
    if (move === 'jab' && choices.cross) move = 'cross';
    if (move === 'teep' && choices.roundhouse) move = 'roundhouse';
  }
  const spec = MOVES[move];
  const zone = spec.zones ? (random() < AI.bodyShotShare ? spec.zones.at(-1) : spec.zones[0]) : null;
  if (throwPunch(world, fighter, move, zone, { heavy })) {
    fighter.aiCombo = combo;
    fighter.aiComboZone = zone;
    fighter.cooldown = combo ? 0 : nextGap(world, fighter, style, plan, cadence);
  }
}

/**
 * Parry and riposte with two blades (a style's `riposte`): a share of the
 * strikes he answers (`chance`) are met with one blade (weaponBlock: the blade
 * not striking goes across the line, physics weaponIntent) while the other
 * cuts into the opening at once — the katana's cut while the wakizashi takes
 * his blade, or the wakizashi's thrust while the katana does. Only a riposte
 * that reaches him from here. Returns whether he answered so.
 */
function riposte(world, fighter, striker, style, distance) {
  const random = world.random;
  const answer = style.riposte;
  if (random() >= answer.chance) return false;
  const choices = {};
  for (const [name, weight] of Object.entries(answer.moves)) {
    const spec = MOVES[name];
    const blade = bladeFor(fighter, spec);
    if (blade?.held && distance <= moveRange(spec, fighter.body, blade.spec) + striker.body.lengths.headRadius) choices[name] = weight;
  }
  const move = pick(choices, random);
  if (!move) return false;
  perform(world, fighter, 'weaponBlock', { from: striker.id });
  const spec = MOVES[move];
  const zone = random() < AI.bodyShotShare ? spec.zones.at(-1) : spec.zones[0];
  if (throwPunch(world, fighter, move, zone, { riposte: true })) {
    fighter.stats.ripostes = (fighter.stats.ripostes ?? 0) + 1;
    fighter.aiCombo = null;
  }
  return true;
}

/** Seconds before the next attack: the style's tempo, slower when tired, quicker in the clinch. */
function restAfterAttack(fighter, style, random) {
  const tired = 1.6 - fighter.stamina * 0.6;
  return (AI.restMin + random() * AI.restRange) * tired * (style.tempo ?? 1) * (fighter.clinch ? 0.4 : 1);
}

/** Whether `other` is within what this man can see ahead of him (physics sightAngle). */
function inSight(fighter, other) {
  const facing = yawRotate([1, 0, 0], fighter.yaw);
  const from = vec.sub(point(other.x, P.pelvis), point(fighter.x, P.pelvis));
  const length = Math.hypot(from[0], from[2]) || 1e-6;
  return (facing[0] * from[0] + facing[2] * from[2]) / length >= Math.cos(sightAngle(fighter));
}
