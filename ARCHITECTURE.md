# Architecture

Gladiator is a physics simulation first and a game second. Every fighter is
a particle skeleton driven by muscles, every blow an impulse, every injury a
consequence of what the simulation measured. This page says where each part
lives, where its numbers are tuned, and how to add to it without scattering
logic.

## The simulation (no rendering; runs in Node)

| Module | Owns |
|---|---|
| `src/body.js` | Building a body from inputs (height, frame, age, training, diet): segment masses, bone, muscle force, reach; the `PRESETS` (one character per style). |
| `src/physiology.js` | Diet and training settling into weight, fat, muscle and bone over months. |
| `src/outfits.js` | `OUTFITS`: every outfit's look, movement class, protection (by region: `protection.regions`), bullet rating, plating, faction, sidearm. `gearTraits` resolves them for a fighter. `FACTIONS`. |
| `src/weapons.js` | `WEAPONS` and `SHIELDS` (mass, balance, reach, harm mix), shot specs (`MATCHLOCK`, `RIFLE`, `SHOTGUN`, `THREE_EYED`), `ARROW`, `GUN`, `BLADES`; effective mass of a weapon at its point of contact. |
| `src/moves.js` | `MOVES` (every strike and defence as a timed path) and `STYLES` (how a fighter fights: weapon, stance, attacks, defences, ranged behaviour). |
| `src/physics.js` | The world and its step: fighters, intent → pose → muscles → integration (XPBD constraints, joint limits), feet, balance, contact between bodies and weapons, blunt and blade harm, wounds, stagger, knockdowns. |
| `src/physics/config.js` | `WORLD`: every physical constant of the fight, each with what it is set against. Tune here. |
| `src/physics/ranged.js` | Guns, bows and crossbows: aim, fire (rounds, pellets, recoil, rocking), reload (a crossbow is spanned; its `shot.bolt` looses an arrow-like bolt with its own energy), arrows in flight, what a round or arrow does to a body. |
| `src/physics/grappling.js` | The clinch (holding, driving, throws) and holding a man down. |
| `src/physics/whip.js` | The whip's thong: a rope of tapering links hung from the handle (Verlet, fixed links, drag, floor), stepped each substep; its tip lashes (energy of the tip's mass, through the armour's cut protection), and a hard lash may put a man on his knees with the pain (`fighter.pain`, painPose) until he rises. A weapon with `rope` strikes only with the tip and reaches by `spec.reach`. |
| `src/aging.js` | The years, 18-100: shares of a young body's strength, muscle, fast fibres, joints and aerobic capacity, and the bone T-score's loss, by age, training and sex (menopause), aged early by starvation, sarcopenic obesity and fat-worn joints; read by physiology (lean, bone) and buildBody (forces, speed, posture). |
| `src/handling.js` | A man and a weapon: whether he can hold it out (its weight at its balance, against his arms), its pace in his hands (arm torque against its inertia, against a reference arm), and a bow's draw weight against his pull (part draws cast slower arrows). armFighter refuses what he cannot hold. |
| `src/formation.js` | Drill: a kit with `drill` ({ advance, charge }) fights in ranks. Each drilled man keeps a slot (ahead, across) relative to his side's leader; the anchor walks up (dressing the line, the last `charge` m at a run) or holds; the front rank fights on a leash, the rest stand in their slots (posed: no physics). Fallen men's places are filled from behind in the file; a shooter who has loosed swaps with a loaded man behind. Nothing names a unit. |
| `src/physics/net.js` | The retiarius's net: thrown, binding a man (no blows, no guard, short steps) until he works or cuts free. Drawn as a soft body by `src/netcloth.js` (cords that only pull, contact with bodies and sand; the physics alone decides who is caught). |
| `src/ai.js` | Decisions: target, game plan, range, when to strike, defend, pick up a weapon, shoot or reload. `AI` holds its tunables. |
| `src/cast.js` | Generators for armies (`mingSoldier`, `ottomanSoldier`, `steppeWarrior`, …) and `PERIOD_BUILD`: historical body sizes by people and rank. |
| `src/scenarios.js` | Levels: place, arena, formation, and the armies (troop tables) set from history. |

One step (`step` in `physics.js`): for each fighter, footwork, timers and
intent; then `WORLD.substeps` substeps of integrate → constraints → joint
limits → weapons → grappling → collisions → ground → velocities → pending
impulses; then balance, props, debris and arrows. Big fights step distant
fighters coarsely (`WORLD.tiers`); the AI of idle fighters thinks on a beat.

**Group fights.** A side of `WORLD.standard.minSide` or more has a leader,
the man nearest its middle at the start (`raiseStandards`). Where his faction
has a `standard` (FACTIONS), he bears it: in his hands as a weapon with a
`flag` (banner, ling qi, sancak, tug), or worn on his back (the Japanese great
sashimono). Fallen, it lies as a loose weapon; the nearest man of his side
puts taking it up before anything else (`takeUpStandard`), and the enemy
leaves it. Every other man, deciding for himself, leans slightly towards the
standard wherever it is (`keepWithLeader`, `AI.cohesion`), so a side tends to
hold together. A side without a standard follows a leader, the nearest man
taking over when he is out.

**Crawling.** A man whose leg is broken, or who is badly hurt and has lost his
nerve (fear, less likely with adrenaline: `AI.crawl`), goes on his knees and
crawls away (`startCrawl`, `WORLD.crawl`); he is out of the fight (`inFight`).

## Drawing (browser only)

`src/render.js` (scene, fighter views, camera), `src/loftbody.js` (the body
and clothes as lofted rings; `ARMOR_KINDS`), `src/wardrobe.js` (helmets, hats,
footwear, banners), `src/weaponview.js` (weapon meshes, debris, arrows, gore),
`src/crowdview.js` (instanced crowds), `src/stechzeug.js` (the jousting harness: the frog-mouthed helm, its plume and mantling, the tilting targe and queue; the helm in its first drawing, `STECHHELM`, or drawn to a profile, `STECHHELM_STYLES`, picked by the design's `head.style`), `src/arenaview.js` (the gladiators' kit in detail: helmets, scutum and parmula, sica, trident, net, the scissor's scales), `src/toon.js` (materials, outlines,
`disposeObject`). `src/main.js` runs the loop and input; playing, the camera
follows the player's man from behind (`src/followcam.js`: a smoothed anchor,
critically damped springs, a dead band on his facing, the heading held while
he is down, the player's own look kept `holdSeconds`, inside a place's walls;
`node tools/camera-stability.js` measures it). The fight's controls:
`src/gesture.js` (a touch's meaning: a drag begun in the top half looks, in
the bottom half is the stick; taps and presses anywhere), `src/control.js`
(orders → the fighter; the attack pad; `moveName`, `strikeOutcome` for the
on-screen call of each attack), `src/touch.js` (the controls and HUD on
screen). `src/tutorial.js` is the training yard's steps and card, staged by
main.js (`YARD`). `src/menu.js` the
menus; `src/intro.js` the intro on a first visit (the roster's `legend`
entries, a faction at a time, staged by main.js's `introStage`; skippable,
remembered in localStorage, replayed from the home screen). Anything removed from the scene is freed with `disposeObject`.

## Principles

- **Simulate, don't script.** Capabilities come from bodies, kit and
  physics. Levels are balanced only by army size, troop mix and period body
  size (`PERIOD_BUILD`), never by adjusting a unit's stats for a level.
- **Every number is named and explained** in `WORLD`, `AI`, `GUN`,
  `BLADES` or the data tables, with what it is set against.
- **Data over code.** A unit, weapon or faction is an entry in a table; code
  reads fields (`outfit.faction`, `outfit.bulletRating`, `style.ranged`),
  never lists of names.
- **Per second, not per step.** Rates scale with the step (`h`), so the
  substep count never changes the feel.
- **Deterministic.** All randomness goes through `world.random` (seeded);
  the same seed gives the same fight.

## Adding things

**A weapon:** an entry in `WEAPONS` (and a shot spec if it fires), a mesh case
in `buildWeaponMesh`, a style in `STYLES` that wields it, a character in
`PRESETS` with that style, an entry in `menu.js` `WARRIORS` and `STYLE_NOTES`.

**Two blades (dual wield):** a style with `offWeapon` holds a second weapon
in the off hand (`fighter.offWeapon`, the left hand: its own direction, spin,
point and grip strain), and may hold its first weapon otherwise than it is
made (`grip: 'one'`: a katana in one hand). A blade move is made with the
weapon in its `limb`'s hand (physics `bladeFor`); each blade's stroke is its
own (`strokeOf`: what it hit, whether it was stopped), and a move may drive
the other hand's move alongside (`with`, `withDelay`). Every held blade
strikes, meets fists and other blades (`heldBlades`; a blade stopped by one
not striking is a `parry` event), is jarred and is lost on its own
(`dropOffWeapon`; the wakizashi lost, the style's `single`; the long blade
lost, the short one goes to the sword hand). A weaponBlock is made with
whichever blade is not striking; the AI's `riposte` (style data) parries
with one blade and cuts with the other. Drawn by weaponview `drawHeld`.

**An outfit or armour:** an entry in `OUTFITS` with `faction`, `movement`,
`protection` (and `regions` for what covers only part of the body: a region
(head, torso, limb), a part on both sides (Forearm), or one part (rShank),
each with `deflects` if it is plate that turns a blade),
`bulletRating`/`plated` if proofed; a helm bolted to the breast (`headLocked`: physics lockHead and pose.js lockedHead carry the head with the trunk, and he sees only `WORLD.headLock.sight` round), the share of his skill the kit leaves him (`skillFactor`), poise beyond its weight and shell (`poise`); an `ARMOR_KINDS` entry in `loftbody.js`
for its pieces (a plate breastplate as `rigidBreastplate: [waist, top]`: the
trunk there rides the chest bone alone, so it neither bends, twists nor dents); any new helmet as a `buildHeadgear` case; a glyph in
`OUTFIT_GLYPH`.

**A faction:** an entry in `FACTIONS`; its outfits name it.

**A beast or a machine:** a preset with `build` (body.js): a fixed mass and
fat share, its own proportions (`lengths`), spread of muscle (`muscle`),
strength per kilogram (`strength`), fibre `bulk`, bone strength (`bones`)
and endurance (`aerobic`), in place of diet and training; the same skeleton
and physics. Weapons built into the forearms are `mounted` weapon specs (an
outfit's `mounted` names them by arm; never dropped, their weight the
kit's); a style's `switches` say when the AI takes up the other arm's, and
its `paired` fires a second forearm gun alongside the one in use, on a man
of its own if one is near (physics.js `pairedGun`). A machine is
`build.rigid` (firm flesh, no jiggle) and drawn by its kit's `armor.robot`
as rigid shells and joints over the bones (robotview.js), not a skin; a kit
may give its own head shell (`helmet`) in place of the HELMETS entry. An
animal's ways are style data too: its charge pose (`charge`), and a bite
while it holds a man (`bite`, physics/grappling.js).

**A level:** an entry in `SCENARIOS` with a troop table and a `cast`; body
sizes in `PERIOD_BUILD`; check the historical outcome with the level runner
and adjust only the numbers of each side.

## Checking a change

- `npm test` — unit and behaviour tests (`test/review.test.js` holds the
  regressions for bugs found in review).
- `node tools/fingerprint.js save FILE` before a refactor, `check FILE` after:
  fixed fights at fixed seeds, hashed. A refactor must leave every hash as it
  was; a physics change shows which fights it moved, and the timing column
  shows speed.
- Level outcomes: run a level over several seeds and compare winners with
  history (see the scratch `level.mjs` pattern in the PR description).

## Known limits

- Handedness: shields are always on the left arm, pickups use the right hand,
  `strikeThreat` reads the right arm; a left-handed fighter is not modelled.
- Some magic numbers remain inline in contact and wound code (cut thresholds,
  trunk mass share, grip-strain shares); they are listed in the review notes
  and belong in `WORLD`.
- No horses: battles decided from horseback (most steppe battles) cannot be
  recreated faithfully yet.
- Big battles: 100 a side of drilled troops (`tools/legion.js`) costs ~0.3 s of
  work per simulated second before contact and ~0.6–0.9 s at contact (Node,
  M-series); in the browser ~50 fps before contact, ~25 fps at contact, the
  drawing (one skinned body per man) about half of it. Crowd views draw
  posed men every other frame, still bodies not at all, and ink only within
  `CROWD_VIEW.inkDistance` of the camera.
