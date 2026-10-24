// A dev helper for looking at the camera in Dunnottar's tight places and in the battle places: stand the man somewhere, let the camera settle, say what it did.
// In the page's console (served by tools/serve.py):
//
//   const { CS } = await import('/tools/camshots.js');
//   CS.start();                    // the ghost walk in Dunnottar
//   await CS.go('sewerdrain');     // stand at a view (CS.views names them), 200 frames; returns where the camera is and its arm
//   await CS.battle('town', 3);    // a watched fight in a place, the orbit turned 3 rad round, `distance` m out
//
// Not part of the game; nothing imports it.

import { floorAt } from '/src/physics/terrain.js';

const { PI } = Math;

/** [x, floor y guess, z, yaw]: Dunnottar's tight and open places (the routes of stages/dunnottar.js). */
export const VIEWS = {
  cliffpath: [-70, 10.6, -4, 0],
  cliffwall: [-62, 10.6, 8, PI],
  gatestair: [13, 4.18, 46.2, 0],
  oillet: [17.7, 4.18, 37, PI / 2],
  ascent: [17, 8, 14, PI / 2],
  quad: [14, 12.18, -1, PI],
  quadwell: [30.5, 12.18, 4, PI / 2],
  vault: [24, 6, -22.5, PI],
  crypt: [16.6, 1.4, -26, PI / 2],
  seagate: [3, 1.4, -37.9, PI],
  grotto: [-48.5, -5, 50, PI / 2],
  sewerdrain: [-48.5, -5, 35, PI / 2],
  cistern: [-48.5, -5, 14, PI / 2],
  drain2stair: [-48.5, -3, -10, PI / 2],
  longdrain: [-30, -1.6, -37.9, 0],
  celldoor: [16.7, 6, -26, PI / 2],
  // The tower's winding stair, 40 treads up (windingTread of stages/dunnottar.js DN_SPIRAL), along the way up.
  towerstair: [66.2, 18.33, -22.7, -1.93],
  chapel: [-14, 17.18, -36, PI],
};

export const CS = {
  views: VIEWS,
  start() {
    window.boxer.skipIntro();
    window.boxer.adaptiveResolution(false);
    window.boxer.levelMode('dunnottar', { ghost: true });
    return 'started';
  },
  async go(name) {
    const boxer = window.boxer;
    const [x, y, z, yaw] = VIEWS[name];
    const level = boxer.levelRun();
    // First onto the spot (the sections wake on the first step), then onto the floor found there.
    level.put([x, y + 0.3, z], yaw);
    boxer.advance(4 / 60);
    const floor = floorAt(boxer.state.world.arena.terrain, x, z, y + 1.5);
    level.put([x, floor, z], yaw);
    boxer.advance(10 / 60);
    boxer.playFrames(200);
    return CS.report(name);
  },
  /** Where the camera is and what the arm did (the old code has no rig: its orbit is what there is). */
  report(name = '') {
    const boxer = window.boxer;
    const orbit = boxer.scene.orbit;
    const arm = boxer.cameraRig?.stats().last;
    const round = (value) => Math.round(value * 100) / 100;
    return JSON.stringify({
      name,
      active: boxer.state.world.stage?.active,
      orbit: [round(orbit.pitch), round(orbit.distance)],
      arm: arm ? { pitch: round(arm.pitch), distance: round(arm.distance), pulled: round(arm.pulled) } : null,
      camera: boxer.scene.camera.position.toArray().map(round),
    });
  },
  /** A watched fight of two in a place, the camera `yaw` rad round and `distance` m out. */
  async battle(place, yaw = 0, distance = 7, pitch = 0.25) {
    const boxer = window.boxer;
    boxer.adaptiveResolution(false);
    boxer.fight([{ preset: 'heavy' }], [{ preset: 'light' }], { place });
    boxer.finishBuilding();
    document.querySelector('#modes button[data-value="watch"]')?.click();
    boxer.playFrames(3);
    Object.assign(boxer.scene.orbit, { yaw, distance, pitch });
    boxer.playFrames(120);
    return CS.report(place);
  },
};
