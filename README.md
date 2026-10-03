# Boxer Simulator

Fighters built from bone, joint and muscle, fought in a physics simulation.

This is the proof of concept: the body model and the core physics, in a ring.

- **Body model** (`src/body.js`). Sex, height, frame, age, training and body fat become bone, muscle and fat for each body part. From those come the particle masses, the muscle force limits, the collision radii, punch masses, chin and fracture thresholds. Every coefficient is in config with its source beside it.
- **Physics** (`src/physics.js`). Each fighter is 15 particles held by XPBD distance constraints (bones rigid, torso braces compliant). Motors pull each particle towards a desired pose with a force cap taken from the muscle, so hand speed comes from the body. Punches are hand targets. Landed punches are momentum exchanges between effective masses, and head speed change accumulates into knockdowns. A knocked-down fighter's motors cut out and the body falls as a ragdoll.
- **Fight AI** (`src/ai.js`). The AI issues the same commands the player does.
- **View** (`src/render.js`). Three.js renders four layers from the same model: skin, muscle, bone and the physics skeleton. The skin is a soft shell of damped springs, so punches dent it.

## Run

```sh
npm run serve        # http://127.0.0.1:8934
npm test
npm run bout -- heavy amateur 10 180   # headless bouts: wins, knockdowns, speeds, impacts
npm run bundle       # dist/boxer-simulator.html, one self-contained page
```
