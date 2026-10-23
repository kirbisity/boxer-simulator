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
| `src/physics.js` | The world and its step: fighters, intent → pose → muscles → integration (XPBD constraints, joint limits), feet, balance, contact between bodies and weapons, blunt and blade harm, wounds, stagger, knockdowns. Bodies meeting (a man's trunk or head against another's, a horse's barrel, neck or head against a man or another horse, a charge on a shield) are one general crash (`crashBetween`, `crashHarm`, `WORLD.crash`): two effective masses (`crashMass`: what is braced behind the part standing, the whole body as far as it is going into the contact, the ground behind a man lying) at a closing speed, an impulse and ½ reduced mass x closing² of energy, and each part hurt by the speed change that impulse gives it, through the blunt blow's machinery (`bluntConsequences`: the head's brain strain, the chest's ribs and trauma) and its armour; a horse is one of the parties, not a case. |
| `src/physics/config.js` | `WORLD`: every physical constant of the fight, each with what it is set against. Tune here. |
| `src/physics/ranged.js` | Guns, bows and crossbows: aim, fire (rounds, pellets, recoil, rocking), reload (a crossbow is spanned; its `shot.bolt` looses an arrow-like bolt with its own energy), arrows in flight, what a round or arrow does to a body. |
| `src/physics/grappling.js` | The clinch (holding, driving, throws) and holding a man down. |
| `src/physics/rising.js` | Getting up off the floor in stages (gather, roll, hands and knees, a foot through, kneel, stand): only what touches the floor lifts him, as hard as his own muscles push there (`body.muscleForce`, not the floor that holds a part up), the hands pressing on the knee as he stands; the less his legs and arms can lift beyond his weight with his gear (`liftMargin`), the slower, and a man who cannot sinks back. `node tools/getting-up.js alone` measures it per character. |
| `src/physics/whip.js` | The whip's thong: a rope of tapering links hung from the handle (Verlet, fixed links, drag, floor), stepped each substep; its tip lashes (energy of the tip's mass, through the armour's cut protection), and a hard lash may put a man on his knees with the pain (`fighter.pain`, painPose) until he rises. A weapon with `rope` strikes only with the tip and reaches by `spec.reach`. |
| `src/physics/overdraft.js` | The player's stamina overdraft (only the man flagged `fighter.player`: `directFighter` and main.js set it): past empty he goes on down to `WORLD.overdraft.floor`, his arms weaker on the fatigue scale (`fatigueScale`: 0.55 at empty to 0.25 at the floor), recovering at a quarter of the usual rate, a defence or blow taken drawing on it (`drawStamina`); a cost that would pass the floor makes him faint (physics.js `overdraftStep`: down `faintSeconds`, not a knockdown or knockout, up with the waking stamina and a grace); posture slumps with the depth (`slumpPose`, life.js breathing, face.js panting). `src/overdraftview.js` is its screen: the fade (`#fade`, `--od` from `fadeOf`) and the stamina bar's red segment. Everyone else keeps the old rules bit for bit. `node tools/overdraft.js` measures it. |
| `src/aging.js` | The years, 18-100: shares of a young body's strength, muscle, fast fibres, joints and aerobic capacity, and the bone T-score's loss, by age, training and sex (menopause), aged early by starvation, sarcopenic obesity and fat-worn joints; read by physiology (lean, bone) and buildBody (forces, speed, posture). |
| `src/handling.js` | A man and a weapon: whether he can hold it out (its weight at its balance, against his arms), its pace in his hands (arm torque against its inertia, against a reference arm), and a bow's draw weight against his pull (part draws cast slower arrows). armFighter refuses what he cannot hold. |
| `src/formation.js` | Drill: a kit with `drill` ({ advance, charge }) fights in ranks. Each drilled man keeps a slot (ahead, across) relative to his side's leader; the anchor walks up (dressing the line, the last `charge` m at a run) or holds; the front rank fights on a leash, the rest stand in their slots (posed: no physics). Fallen men's places are filled from behind in the file; a shooter who has loosed swaps with a loaded man behind. Nothing names a unit. Wings: a side's riders (a level's `formation.wings`) stand held on one flank of the foot line (`placeWings`: `WINGS.out` beyond its end, `back` behind the front rank; the two sides take opposite flanks so the wings ride past each other) and are released (`moveWings`) when the foot lines are within `WINGS.release`, an enemy horseman comes within `alarm`, one is struck, or `by` s pass; released, a wing rides at the enemy's shooters first (ai.js `chooseFocus`) with riding.js's charge. Mounted men are no part of the drilled ranks or of the line a formation closes on. |
| `src/physics/net.js` | The retiarius's net: thrown, binding a man (no blows, no guard, short steps) until he works or cuts free. Drawn as a soft body by `src/netcloth.js` (cords that only pull, contact with bodies and sand; the physics alone decides who is caught). |
| `src/horses.js` | `HORSES` (destrier, warhorse, Arabian, steppe, Japanese: mass, withers, paces, getting away, lateral pull, laden by `HORSE_LOAD`), `BARDING` (plate, lamellar, bare: protection by horse part), `canRide`/`mountOf` from the kit's `horse` and `barding`. |
| `src/physics/mounted.js` | On horseback: the horse a rigid body of capsules (`HORSE_SHAPE`, gait-cycled legs: `poseHorse`), steered within its limits (`stepHorse`, `turnRadius`); the horse's body rising, pitching and rocking with the one stride phase its legs and the drawn horse go by (`horseMotion`, `WORLD.mount.motion`: a walk's sway, a trot's bounce twice a stride, a canter's three-beat rocking, a gallop's low run; its hooves stay on the ground), a gallop tiring it (`WORLD.mount.stamina`); the rider's hips, knees and feet held in the saddle each substep (`seatRider`; his stance `lift`ed, his body damped against the horse: `fighter.carrier`; his pelvis carried by a damped spring on the saddle's height, his lower back taking the bounce: `absorbMotion`; his trunk leaned with the gait and rocked with the pitch, held to the gait's lean while he strikes: `ridingLean`), his facing (`riderFacing`), the seat (`keepSeat`, `seatMass`: a war saddle holds 3.8 m/s, the knees add a share of the horse, a slow fall lets him down), thrown (`unhorse`); blows on the horse through its barding (`strikeHorses`, `harmHorse`), its bleeding and fall (`bringDown`), horses against men and horses (`collideHorses`: horses of one side only ease apart below `crash.alliedFrom`; a momentum exchange between the laden horse, `ladenMass`, and the men it meets as one block `packedWith`, or another laden horse; the men flung as ragdolls through the engine's pending impulses and put over or staggered by their own speed change and poise; the horse's pace and sideways shove changed by the reaction (`jolt`), its rider knocked by the speed it lost, the horse brought down past what its legs take; hooves on men lying down: `trodOn`; the harm to the men, the horse and the shield arm is physics.js's general crash, the horse's part (`horseParty`) one of its two parties); a blow from the saddle has behind it the rider and a share of the horse as rigidly as its weapon is coupled to them (`mountedBehind`, `WORLD.mount.coupling`). `WORLD.mount` tunes it. |
| `src/riding.js` | The AI on horseback (`ride`: charge to pass on the weapon side, a move drawn for the pass by the style's weights, a point thrown while the man is still ahead and a cut as they pass abreast, steered on in the air (`steerBlow`), past, wheel round at a pace his turning circle fits in; each pass drawn with a little noise (the aim line, a pause before the charge, his pace, the side he turns to); steered clear of his own side's horses `keepLane`; ridden in beside his man after three passes or 25 s without a blow `keepPatience`; side by side against a rider; a couched lance; a mounted archer circling) and on foot against a rider (`standToRider`: a long weapon braced at the horse's chest, else off its line). `RIDING` holds its tunables. |
| `src/ai.js` | Decisions: target, game plan, range, when to strike, defend, pick up a weapon, shoot or reload. `AI` holds its tunables. |
| `src/command.js` | Orders in a battle: the man played commands his side (`world.commands[corner]`, `giveOrder`): To me (rings round him, following him), Charge (the nearest enemy in the way given, at a run; none left, each holds where he got to), Hold (the ranks keep their places, the formation's anchor halted; loose men their ground), Free (the side's own way). Read by ai.js (`orderedFocus`, `obeyOrder`, `orderKeepsPlace`, `keepOrders`); the buttons are `src/fightui/command.js`, keys 7–0. `COMMAND` holds its tunables; `node tools/orders.js <level>` measures it. |
| `src/cast.js` | Generators for armies (`mingSoldier`, `ottomanSoldier`, `steppeWarrior`, …) and `PERIOD_BUILD`: historical body sizes by people and rank. |
| `src/scenarios.js` | Levels: place, arena, formation, and the armies (troop tables) set from history. A scenario's own `arena`, `formation` and `cast` are its line of battle on foot (the fingerprint's fixtures); `wings` adds the horse history had there (Sekigahara, Pyongyang, Otumba, Rome against Han, Maidstone): a wider floor, camera, formation and a cast that joins the horsemen (cast.js `samuraiHorseman`, `mingHorseman`, `conquistadorHorseman`, `romanHorseman`, `hanHorseman`, `mountedKnight`) to the foot; `battleOf(key)` is the level as played. render.js `setPlace` builds a place again for a floor much wider than its own (scenery.js `sceneryFor` pushes the backdrop out; the camp props of the Sengoku place stand beyond the floor). |

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

**Terrain and stages (level mode).** An arena that carries `terrain`
(`physics/terrain.js`: slabs, ramps, stair flights, winding stairs, walls,
ceilings and a sea level, in a grid index) stands on it instead of the flat floor;
without it nothing here runs (the fingerprint proves it). `collideTerrain` puts
each part on the floor under it and out of walls and ledge faces; `groundStance`
lifts the stance (`fighter.lift`) to the lower foot's floor and plants each foot on
its own tread; a man off a ledge is in the air (`fighter.air`) and lands by
`landOnFeet` (`WORLD.terrain.fall`); below the sea he is lost (`drowned`).
`levelmode/stage.js` is the stage data (header comment: every field), the active
sections, dormant fighters (`fighter.dormant`: not stepped, thought for, collided or
drawn) and gates and ladders that swap solids. Civilians and prisoners are corner
`grey` (`hostile`). `levelmode/terrainview.js` draws the terrain as grey boxes, or, for a
stage with a `landform`, hands over to the castle kit. Stage 1 (`levelmode/stages/dunnottar.js`)
is ten sections of data (the builders every section shares are `stages/dnbuild.js`; the vault and the crypt under it are `stages/dunnottar-vault.js`, the sea cave under the gorge shelf and the old drain that runs from it to the crypt's sea-gate, the way round the plate knight at the front gate, `stages/dunnottar-sewer.js`, the vaulted sanctuary and the cell behind its chancel doors `stages/dunnottar-chapel.js`), with `decor` (wall runs with their openings, vaults, props) that only
the drawing reads. `levelmode/kit.js` draws it from the same solids and decor: merged batches per
material and chunk (`kitgeo.js`), painted textures (`kitpaint.js`: Voronoi stones and course-by-course masonry from noise, no two stones alike) and
the materials made of them (`kittex.js`: a shader patch that reads each texture twice, at two scales blended by a world-space macro map, with moss, damp,
rain streaks and a height fog), props (`kitprops.js`), the
headland as a heightfield under every floor, the detail of the sections near the player and a block
silhouette of the rest, gates and the ladder that move with their state, flames, ravens, and a pool
of four real lights (`kitchapel.js` dresses the chapel and the crypt: chandeliers, votive candles, stained glass, the cell doors' keyhole light, and the vault's own warm glow material). A section's `interior` (stage data) is how a roofed room is lit: `storm.js` blends the storm's look toward it over a second and a half as the player walks in (`stagelooks.js` `interiorLevels`), shutting out the sun, the mist, the rain and most of the lightning's flash. `storm.js` is the weather (place `dunnottar`: sky, sea, rain, seeded lightning) in one of the stage's looks
(`stagelooks.js`: six data entries, each a sky, light, fog, sea, rain, strikes and torches; `stagesky.js` paints the sky; `boxer.stageLook(name)`, the ghost bar's Look select or `?stagelook=` choose),
and the kit's materials fade in a screen-door tube between camera and man (`ktSightline`) while the
follow camera is kept off the stage's walls and roofs (`stageCameraRoom`, `followcam.js` `march`).

**What a stage paints (conditional painting).** A stage is one scene but each frame paints only what can be seen. `levelmode/visibility.js` (pure; `test/visibility.test.js`)
decides: the sections the man is in are painted in `detail`; so is any section reached from them, up to three portals deep, through openings that are inside the camera's frustum
and that a sight line from the eye reaches (`terrain.js` `rayBlocked` with the bars of a gate and the ladders left out: `seeThroughIds`; a shut door or a wall closes the way);
a section in view but not reached is a silhouette (`far`); the rest is `off` (not drawn, not animated), as is anything past the fog's far end. A section held in detail lingers 0.5 s
after the view stops reaching it. Inside the detailed sections the merged meshes are drawn by reach (`kit.js` `kitReach`: the fog's, and for the wear decals, which are cut in 14 m chunks,
drips, ravens and light shafts, the quality tier's), and a man whom no line from the eye or from the man played's head reaches, who is not near and not in the protected set,
is not posed or drawn (`kitMen`; held 0.35 s). `boxer.painted()` says what is painted now. The sea is not shaded past the fog's far end (`storm.js`).
**Quality** (`levelmode/quality.js`, `adaptres.js`): three tiers (`high`, `medium`, `low`: reaches in metres and the rain's share) and a ladder of rungs (pixel ratio and tier) that `auto` walks by the
frame times: pixels first, then medium, then low at the floor ratio; a frame far behind steps down in 0.3 s, a slow one in 0.8 s, back up after 6 s or more of ease. The tier is two uniforms of the kit's shader
(`kittex.js` `ktLod`: the reach of the sky's reflection in the stone, of the second read of the map, of standing water and of the soft edge of the baked shadow, each fading out over its
last quarter; the macro map and the shadow's taps), so a change of tier compiles nothing. `boxer.quality('auto' | 'high' | 'low')` (remembered in `localStorage`; the ghost bar has the select)
holds a rung or lets the frame times decide. `tools/stagebench.html` has the means of measuring (`SB.prof`, `SB.ab`, `SB.compare`).

## Drawing (browser only)

`src/render.js` (scene, fighter views, camera), `src/loftbody.js` (the body
and clothes as lofted rings; `ARMOR_KINDS`; `coveredRegions`: what of each skin part the armour's closed pieces cover, left out of a V7 skin), `src/bodystyles.js` (the keys of the ways to draw the skin and the one function that builds each, in slices too (`buildSkinMeshSteps`); V7, the default, is a loft wrapped onto the flesh field with skintex.js's maps; built skins kept by inputs (`cachedSkinMesh`); `sculpt.js`, `skindetail.js` and `fleshbody.js` are the prototype styles: landmark-bent rings, a bump map of the fine anatomy, the anatomy field with bones and muscles as volumes), `src/skinworker.js` (builds a V7 skin and its maps in a Worker; render.js `pumpSkinBuilds` asks it, draws the man in the plain loft meanwhile and swaps the skin in; the bundle carries its code as `skin-worker-source`), `src/wardrobe.js` (helmets, hats,
footwear, banners), `src/bones.js` (the anatomical skeleton of the bone and muscle views: built per fighter the first time one of them is shown, `ensureSkeleton` in render.js; the skin view draws none, the body draws its own bony landmarks), `src/weaponview.js` (weapon meshes, debris, arrows, gore),
`src/crowdview.js` (instanced crowds, the far body), `src/crowdlod.js` (which crowd men are drawn, how, and which are protected), `src/horsemesh.js` (a horse's meshes as plain arrays, built once per breed, barding, coat and level of detail: lofted barrel, neck and head over surfaces the tack and barding lie on, legs in segments, coats and markings by seed, `HORSE_BUILD` per breed; `buildHorseModel`, a `low` detail for crowds), `src/horsehair.js` (Verlet chains for what hangs: tail, trapper, loose stirrups), `src/horseview.js` (horses: the shared meshes moved each frame: gait-placed legs bending at knee, fetlock and hoof, head and neck nod, ears, mane, tail, trapper, stirrups at the rider's feet, reins from the bit to his hand; a fallen horse rolled, a broken leg hanging), `src/stechzeug.js` (the jousting harness: the frog-mouthed helm, its plume and mantling, the tilting targe and queue; the helm in its first drawing, `STECHHELM`, or drawn to a profile, `STECHHELM_STYLES`, picked by the design's `head.style`), `src/arenaview.js` (the gladiators' kit in detail: helmets, scutum and parmula, sica, trident, net, the scissor's scales), `src/toon.js` (materials, outlines,
`disposeObject`). `src/main.js` runs the loop and input; playing, the camera
follows the player's man from behind (`src/followcam.js`: a smoothed anchor,
critically damped springs, a dead band on his facing, the heading held while
he is down, the player's own look kept `holdSeconds`, inside a place's walls;
`node tools/camera-stability.js` measures it). Once a place is built, `src/scenerylod.js` swaps in cheaper copies of its scenery that look the same (wide scatters cut into cells that can be culled and, far off, thinned; static meshes of one material in one piece joined; `boxer.sceneryLod(false)` puts the place back as built), and `src/adaptres.js` steps the renderer's pixel ratio down in a big battle that cannot keep up and back up when it can (never in a fight of eight or fewer; `boxer.adaptiveResolution(false)` turns it off). Scenery that comes between the camera and the men it watches is faded see-through (`src/seethrough.js`: a few tests a second of lines from the camera to each man against the place's pieces, box then triangles; each faded mesh on its own copy of its material). Watching, the camera is `src/watchcam.js`: auto (everyone framed, a crowd drawn back to fit) until the viewer takes it by zooming (wheel, pinch) or tapping a man (then it follows him, or the men near where it looks, damped, moving with a steady run exactly; a man left lying gives way to the nearest still fighting); 'Frame all' or a double tap gives it back; the drama camera's push-in leaves a viewer's own zoom alone. The fight's controls:
`src/gesture.js` (a touch's meaning: a drag begun in the top half looks, in
the bottom half is the stick; taps and presses anywhere), `src/control.js`
(orders → the fighter; the attack pad; `moveName`, `strikeOutcome` for the
on-screen call of each attack), `src/touch.js` (the controls and HUD on
screen). `src/tutorial.js` is the training yard's steps and card, staged by
main.js (`YARD`). `src/menu.js` the
menus; `src/intro.js` the intro on a first visit (the roster's `legend`
entries, a faction at a time, staged by main.js's `introStage`; skippable,
remembered in localStorage, replayed from the home screen). Anything removed from the scene is freed with `disposeObject`.

## Looks (browser only)

A **look** is a whole way of drawing the game, switchable at runtime: the
Look selector in the sandbox's footer, `?look=<id>` in the URL, and the choice
made last (localStorage, kept only when picked in the selector). There are
two. `probe-lite` ("Realistic") is the look the game is committed to and the
one a first visit starts in: an SH light probe from a procedural sky, one sun
with one shadow map, Lambert skin and cloth, steel on a baked sky cube, no
post-processing. With it, the open-air places wear the scenery of
`src/scenery.js`: a CC0 photograph of the distant land and sky over generated
foothills with trees on them, and painted ground with a living layer (grass,
flowers, stones, puddles, the meadow pond). `toon` ("Classic cartoon") is the
old drawing exactly (no hooks, nothing loaded) and the safe fallback; with it
the places are as render.js builds them. Four other looks (`physical-sky`,
`hdr-post`, `quality-physical`, `photo-hdri`) and the scenery and ground
alternatives (painted sky band, ridges, full terrain, photo ground, model
trees) were tried as proofs of concept in October 2026 and removed.

| File | Owns |
|---|---|
| `src/looks.js` | The registry (`LOOKS`), the look in force (`activeLook`), choosing and loading a look (`loadLook`, `setLook`, `activateLookNow`), and the plumbing render.js calls: `captureViewDefaults`, `resetForLook`, `applyLook`, `drawFrame`, `resizeLook`, `flattenView`. Its header holds the shoot-and-measure recipe, the colour trap and the other r128 traps. |
| `src/looks/kit.js` | What look files import: `defineLook` and the `Look` type, `loadScripts` (lazy `<script>` tags, once each, in order, with a timeout), the colour helpers (`linearColour`, `linearise`, `sweepMaterials`, `assignColour`), renderer/sky/environment helpers (`setRenderer`, `hidePaintedSky`, `replaceEnvironment`, `own`, `stateOf`, `setShadowMapSize`), and THREE's constants by name (`TONE_MAPPING`, `OUTPUT_ENCODING`, `SHADOW_MAP`), so a look is plain data until a hook runs. |
| `src/looks/<id>.js` | One look. Exports one `<ID>_LOOK`. |
| `src/looksbench.js` | `window.__looks`: the staged still-lifes (`COMPARE_SCENES`), `capture`, `stats`, `colourCheck`, `register`. |

**The interface** (`Look` in `kit.js`): `id`, `label`, `blurb`; `style`
('toon' or 'soft': what `surface()` builds when the look has no hook of its
own); `scripts` (urls of optional three r128 example scripts, dependencies
first; loaded once and only when the look is chosen; a failure or a throw in
`prepare` falls back to toon with a console warning); `linear` (opt in to the
colour handling below); `outlines` (`true` as drawn, `false` none and no hull
meshes at all, a number multiplies every width); `renderer` (static renderer
settings, also given to the portrait renderer); and hooks, each optional (a
hook left out is the identity):

- `prepare(view)` (async): once per scene after the scripts load. Build what is
  expensive and reusable: an environment, a composer. Keep it in
  `stateOf(view, id)`.
- `apply(view, place)`: every time the place or the look changes, *after*
  `setPlace` has set the default rig for the place (`view.light` is the
  place's `PLACE_LIGHT` entry). Set renderer settings (`setRenderer`),
  `scene.environment` and the steel's map (`replaceEnvironment`), the sky
  (`hidePaintedSky`; the painted domes are tagged `userData.paintedSky`; add
  your own with `own(view, object)`), fog, and the lights (`view.lights.key`,
  `rim`, `sun`, `hemi`). Whatever it changes is put back before the next
  `apply`, so it never has to undo itself.
- `surface(color, options)` and `steel(envMap, options)`: the skin-and-cloth
  and metal materials; return a material, or nothing for the default.
- `renderFrame(view)` and `resize(view, w, h)`: the whole frame (an
  EffectComposer) and its sizing; `dispose(view)` frees what `own` did not know of.

Life cycle: choosing a look (`switchLook` in main.js) loads its scripts and
runs `prepare` for the scene; then `reapplyPlace` (reset to the built defaults,
the default rig, `applyLook`), `clearCrowdTemplates` and a progressive
`rebuildViews` (so materials and outlines are made afresh). Leaving a look runs
its `dispose`, frees what it `own`ed, and restores the renderer, lights,
environment and painted skies from the snapshot taken when the scene was built.

**Adding a look** is editing one file, `src/looks/<id>.js` (it already exists
as a placeholder, is registered, bundled and listed): add the hooks, delete
`placeholder`. Prefix every top-level name in it with the look: the bundle puts
all modules in one scope and `tools/bundle.js` and `test/looks.test.js` refuse
a duplicate. Try an idea without a file first: `__looks.register({ id, ... })`.

**The colour trap (r128).** Colour is not managed: a hex is used as if it were
linear light and the canvas is written as it stands, so the game is authored in
display values and shown unchanged. Set `outputEncoding = sRGBEncoding` (or tone
map) and everything authored is brightened and washed out, unless it is all
decoded on the way in. A look that wants a linear workflow says `linear: true`
and the plumbing decodes material colours and emissives (`convertSRGBToLinear`,
the authored values kept so toon comes back exactly), tags canvas textures
`sRGBEncoding`, decodes vertex and instance colours in the vertex shader
(skin, kit, steel and the crowd are painted into them), decodes the light and fog
colours after the default rig is set, and gives the steel a decoded copy of its
painted environment (the sRGB tag must be on the canvas texture before PMREM).
`scene.background` stays as authored (the clear colour is written raw). Anything
a look builds itself uses `linearColour(hex)`; a colour changed after the build
uses `assignColour` (face.js's bruise). `await __looks.colourCheck()` draws an
unlit swatch as a material colour, a canvas texture and a vertex colour through
the current look and reads the pixels back: all three must equal the hex
(a look with ACES and sRGB output does; toon with sRGB output
and nothing decoded returns 95,127,58 as 164,187,131, the milky wash).

Other things found: a changed `toneMapping` or shadow type does not recompile
compiled materials (`setRenderer` flags them; a new `outputEncoding` or
`scene.environment` does recompile); `scene.environment` reaches only
MeshStandard/MeshPhysical, not MeshToon (which has no envMap at all), Lambert,
Phong or Basic; a render target ignores `renderer.outputEncoding` (it uses the
target texture's) but gets `renderer.toneMapping` on every material, so set it
to none while a composer draws and tone-map in the last pass (a plain render
target has no antialiasing; a `WebGLMultisampleRenderTarget` with samples 4
worked in the harness);
skinned meshes work unchanged through a composer; a canvas must be read in the
same task as the render. The `field` shots show a pale blue disc against the
haze: the sky dome (radius 52) against the camera's far plane (60) is the
likely cause; it is there in the toon look too, and a look that replaces the sky
has no such disc.

**Comparing looks.** `python3 tools/serve.py 8941`, open
`http://127.0.0.1:8941/index.html?shoot&look=<id>` (`shoot` seeds Math.random
from the first line), then in the page (Chrome's javascript_tool):

```
await __looks.stage('colosseum')          // colosseum | field-cavalry | ring-portrait | sengoku-army
await __looks.capture('colosseum-<id>')   // shots/colosseum-<id>.png, 1280x720, pixel ratio 1
await __looks.stats(120)                  // ms per frame, draw calls, triangles, textures, geometries, programs
await __looks.set('toon')                 // the other look, same page; stage() again before capturing
```

Each scene is a fixed seed and fighters, rebuilt places (their painting is
seeded), a stated number of exact 1/60 s steps, then frozen under a fixed camera
(`__looks.tune({ yaw, pitch, distance, fov, height })` finds a framing). Two
loads of one look give byte-identical PNGs (the cavalry still differs in about
a thousand pixels of one horse's hair or cloth from load to load, on the old
renderer too). `stats` times the physics and view update (`updateMs`) apart from
the look's frame (`renderMs`: CPU submit plus a pixel read-back to wait for the
GPU; `submitMs` is the CPU part; `gpuMs` is the timer query where the browser
gives one, null where it answers zeros); a hidden-outline look draws fewer calls.
The page's own size and pixel ratio are not used, so numbers compare across looks.

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
- `node tools/lance.js [bouts] [seconds] [opponent ...]` — Maximilian's one
  couched charge against each opponent: met or not, how the man answered it
  (sidestep, blade across it, shield), point-first, glanced, into a gap, the
  pierce, and whether it decided the bout.
- `node tools/couched.js [seeds] [target ...]` — the same weapon on foot and
  from the saddle (the couched lance, a spear, a yari, a sabre, a long sword, a
  mace, a war hammer) at a man standing still: closing speed, mass behind the
  point, energy, pierce, cut, outcome.
- `node tools/cavalry.js [seeds] [case ...]` — a horse at the gallop into a
  man, a block of men, or another horse: its speed before and after, how fast
  and far the men were flung, who fell, whose ribs broke and who died, the horses'
  blunt harm, which horses went down.
- `node tools/crash.js [seeds] [charger:target[:run] ...]` — a man charging or
  running into another standing: the closing speed, impulse, energy and peak
  force of the crash, the harm each took, who went over.
- `node tools/mounted-bouts.js [bouts] [seconds] [matchup ...]` — whole mounted
  fights, to see that they still work (winners, riders thrown, horses down), and
  the riding AI's blows thrown and landed, by weapon.
- `node tools/riding-motion.js [character] [seconds]` — a rider at a walk, trot, canter and gallop: the rise and fall of the horse's withers, his hips, head, hand and blade (cm), the lean's swing, and the biggest change in a frame (a pop would show).
- Level outcomes: run a level over several seeds and compare winners with
  history (see the scratch `level.mjs` pattern in the PR description).

## Known limits

- Handedness: shields are always on the left arm, pickups use the right hand,
  `strikeThreat` reads the right arm; a left-handed fighter is not modelled.
- Some magic numbers remain inline in contact and wound code (cut thresholds,
  trunk mass share, grip-strain shares); they are listed in the review notes
  and belong in `WORLD`.
- Horses: one or two in a duel (Deadliest Warrior; the sandbox's per-fighter Mounted choice, `inputs.mounted`, with a Mount all / Dismount all shortcut: a team with riders lines up at the charging distance, the foot in rows and the riders on their flanks, `lineUpMounted`), on the open field (`field`); not in levels. A thrown rider does not
  remount; a riderless horse bolts and stands. The rider's legs are held,
  not simulated (the knees' grip is a share of the horse's mass in the seat, no standing in the stirrups);
  he does not parry from the saddle. A horse never balks at a line of points (it rides on and is stopped by the mass it meets and what the spears do to it); a man with a 1.75 m spear dodges rather than braces (`RIDING.brace.length` 1.8: lowering it makes spearmen stand, and win). A horse is not stepped round men lying
  down, and is drawn as rigid lofted parts (meshes shared by every horse alike, not a skinned body): the mane's tufts and the tail's hair are cheap chains, not a soft body.
- Big battles: 100 a side of drilled troops (`tools/legion.js`) costs ~0.3 s of
  work per simulated second before contact and ~0.6–0.9 s at contact (Node,
  M-series); in the browser ~50 fps before contact, ~25 fps at contact, the
  drawing (one skinned body per man) about half of it. Crowd views draw
  posed men every other frame, still bodies not at all, and ink only within
  `CROWD_VIEW.inkDistance` of the camera. Each template also has a far body
  (`simplifyTemplate`: its vertices merged in cells, on the same skeleton),
  shown beyond `lodDistance`; a man the camera does not see is not posed or
  drawn; and a man far from the camera or outside the shadow map casts no
  shadow (`src/crowdlod.js` decides, `selectCrowdDraw` in `render.js` applies
  it). The man played, his lock and opponent, anyone within 3 m of him and the
  man a watching camera follows are never simplified, culled or unshadowed
  (`protectedMen`). `boxer.lod(false)` turns it all off, to compare.
