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
| `src/physics/ranged.js` | Guns and bows: aim, fire (rounds, pellets, recoil, rocking), reload, arrows in flight, what a round or arrow does to a body. |
| `src/physics/grappling.js` | The clinch (holding, driving, throws) and holding a man down. |
| `src/ai.js` | Decisions: target, game plan, range, when to strike, defend, pick up a weapon, shoot or reload. `AI` holds its tunables. |
| `src/cast.js` | Generators for armies (`mingSoldier`, `ottomanSoldier`, `steppeWarrior`, …) and `PERIOD_BUILD`: historical body sizes by people and rank. |
| `src/scenarios.js` | Levels: place, arena, formation, and the armies (troop tables) set from history. |

One step (`step` in `physics.js`): for each fighter, footwork, timers and
intent; then `WORLD.substeps` substeps of integrate → constraints → joint
limits → weapons → grappling → collisions → ground → velocities → pending
impulses; then balance, props, debris and arrows. Big fights step distant
fighters coarsely (`WORLD.tiers`); the AI of idle fighters thinks on a beat.

## Drawing (browser only)

`src/render.js` (scene, fighter views, camera), `src/loftbody.js` (the body
and clothes as lofted rings; `ARMOR_KINDS`), `src/wardrobe.js` (helmets, hats,
footwear, banners), `src/weaponview.js` (weapon meshes, debris, arrows, gore),
`src/crowdview.js` (instanced crowds), `src/toon.js` (materials, outlines,
`disposeObject`). `src/main.js` runs the loop and input; `src/menu.js` the
menus. Anything removed from the scene is freed with `disposeObject`.

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

**An outfit or armour:** an entry in `OUTFITS` with `faction`, `movement`,
`protection` (and `regions` if it covers only part of the body),
`bulletRating`/`plated` if proofed; an `ARMOR_KINDS` entry in `loftbody.js`
for its pieces; any new helmet as a `buildHeadgear` case; a glyph in
`OUTFIT_GLYPH`.

**A faction:** an entry in `FACTIONS`; its outfits name it.

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
