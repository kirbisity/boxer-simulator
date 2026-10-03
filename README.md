# Boxer Simulator

Fighters built from bone, joint and muscle, fought in a physics simulation.

This is the proof of concept: the body model and the core physics, in a ring.

- **Body model** (`src/body.js`). Sex, height, frame, age, training and body fat become bone, muscle and fat for each body part. From those come the particle masses, the muscle force limits, the collision radii, punch masses, chin and fracture thresholds. Every coefficient is in config with its source beside it.
- **Physics** (`src/physics.js`). Each fighter is 15 particles held by XPBD distance constraints (bones rigid, torso braces compliant). Motors pull each particle towards a desired pose with a force cap taken from the muscle, so hand speed comes from the body. Punches are hand targets. Landed punches are momentum exchanges between effective masses, and head speed change accumulates into knockdowns. A knocked-down fighter's motors cut out and the body falls as a ragdoll.
- **Life** (`src/life.js`). Seeded idle motion: a rhythmic bounce, head and trunk sway, hands that drift in the guard. Feet stay planted and step when the stance drifts away from them.
- **Styles and moves** (`src/moves.js`). Boxing, Kickboxing and Muay Thai, each with its own stance, idle rhythm, attacks, defences and pressure. Attacks: jab, cross, hook, uppercut, roundhouse, low kick, teep, knee, elbow, up-elbow, clinch, charge. Defences: guard, slip, roll, parry, lean back, check, step back.
- **Speed from the body.**
  - Muscle force scales with cross-section (mass^2/3).
  - Hill's force–velocity law caps how fast a limb can move. Its top speed grows with limb length and falls with muscle bulk (pennation).
  - The skeleton is sized by frame, so a thin fighter carries dead weight, and fat is mass with no force.
  - Light-to-middle builds come out fastest; `node tools/speed-curve.js jab cross roundhouse` prints the curves.
- **Body contact.** Collisions share momentum by mass. A charge transfers its momentum. Blows put a "knock" into the trunk that the legs must absorb, and too much topples a fighter. The clinch locks hands to the opponent's neck with constraints. Leg kicks accumulate damage until the leg gives way.
- **Fight AI** (`src/ai.js`). The AI issues the same commands the player does. It chooses moves by distance and defences by what is coming, and its style sets how often it presses inside or charges.
- **Hits.** A landed punch gives its momentum to the struck part, and the punching arm takes the same momentum back. The struck muscles hold only passive tone for a reflex delay of 55–85 ms, then catch the part with whatever force they have. Muscles are spring-dampers capped by their strength, so every movement has inertia. Knees, elbows and the neck have joint limits for the ragdoll.
- **Face** (`src/face.js`). Lightly anime: large drawn eyes (white, two-tone iris, pupil, highlights, a heavy lash line), a small nose and mouth, and a soft V-shaped jaw. Hair is built from tapered locks (spiky, short, fade, buzz, cornrows, bun, ponytail), and there is optional facial hair. It winces when hit, goes slack when stunned, shuts when knocked out, pants when tired, and reddens with damage.
- **Rig and skin** (`src/rig.js`, `src/bodymesh.js`). Seventeen bones, whose frames come straight from the physics particles. The body is one continuous skinned mesh, generated from that fighter's anatomy: each muscle group and fat deposit is a rounded shape, blended into the next with a smooth minimum. The mesh is built in an A-pose (surface nets) and each vertex is weighted to its nearest bones. A limb's bones only move skin on their own side of the body.
- **Skeleton** (`src/bones.js`). Skull with jaw and eye sockets, vertebrae, ten pairs of ribs and a sternum, shoulder blades, clavicles, pelvis, humerus, radius and ulna, femur and kneecap, tibia and fibula, and foot bones. Each piece rides its rig bone.
- **Style** (`src/toon.js`). Cel shading with ink outlines by default, which keeps the stylised faces out of the uncanny valley. Soft lit shading is available to compare.
- **View** (`src/render.js`). Three.js renders four layers: skin, muscle, bone and the physics skeleton. The skin is a soft shell of damped springs, so punches dent it.

## Run

```sh
npm run serve        # http://127.0.0.1:8934
npm test
npm run bout -- heavy:muayThai light:kickboxing 10 180   # headless bouts by preset:style
npm run bundle       # dist/boxer-simulator.html, one self-contained page
```
