# Launch video pipeline

Regenerates the launch video from the game as it is now (spec: ai-toolkit-kb `working-memory/projects/boxer-simulator/specs/2026-11-14-launch-video.md`). Not part of the game.

```sh
node tools/trailer/render.mjs          # record every shot not yet recorded, and the text cards
node tools/trailer/render.mjs --all    # record every shot again (after a game update)
node tools/trailer/render.mjs canal    # one shot again
python3 tools/trailer/assemble.py      # cut, titles, sound -> trailer-out/<output in edit.json>
```

- `shots.mjs` — each recording: the scene, seed, the man played, the camera, the speed (real or slow) frame by frame.
- `edit.json` — the cut: in and out of each shot, the cards over them, the music, which game sample each physics event sounds as.
- `titles.html` — the cards, in the game's own type and colours.
- `driver.mjs` — starts `tools/serve.py` (port 8935) and a Chrome of its own (debug port 9333) if they are not running.
- In the game (`src/main.js`, capture hooks only): `boxer.capture`, `boxer.autopilot`, `boxer.fullModels`, `boxer.placeRider`, `boxer.closeMenus`; the camera and stepping in `tools/trailer-capture.js`.

Every frame is the game stepped one frame and grabbed at 1080×1920 (a phone's layout for the HUD), at the highest graphics with every man a full model, so the take is the same at any machine speed. Takes whose AI watches the camera (the played man's) can differ from a scout's; re-record and check the events log (`trailer-out/shots/<id>.events.json`).
