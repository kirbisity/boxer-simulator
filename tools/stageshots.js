// A dev helper for the contact sheet of Stage 1's looks: the same few fixed cameras, the UI hidden, a look chosen by name.
// In the page's console (served by tools/serve.py):
//
//   const { SS } = await import('/tools/stageshots.js');
//   SS.start();                  // the ghost walk, UI hidden, the camera taken over
//   SS.view('castle');           // stand at a view (castle | gate | quad); take a screenshot
//   SS.look('seaFog');           // boxer.stageLook(name) and a few frames for it to settle
//   SS.still(true);              // no lightning, a still sky: the same picture each time
//
// Not part of the game; nothing imports it.

import { floorAt } from '/src/physics/terrain.js';

export const VIEWS = {
  castle: { pos: [-113, 17.5, -7], look: [4, 17, 2], fov: 52, man: [-108.5, 14, -3.5] },
  gate: { pos: [-15, 4.5, 40], look: [14, 6.5, 50], fov: 60, man: [-8, 0, 48] },
  quad: { pos: [30, 28, -36], look: [8, 22, -50], fov: 66, man: [27, 24.93, -36] },
};

const HIDE = 'header,footer,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,.arena::after{display:none!important} body.ghost-walk .ghost-bar{display:none!important}';

export const SS = {
  views: VIEWS,
  start() {
    const boxer = window.boxer;
    boxer.skipIntro();
    boxer.adaptiveResolution(false);
    boxer.levelMode('dunnottar', { ghost: true });
    if (!document.getElementById('shotcss')) {
      const style = document.createElement('style');
      style.id = 'shotcss';
      style.textContent = HIDE;
      document.head.appendChild(style);
    }
    const renderer = boxer.scene.renderer;
    if (!renderer.__orig) {
      renderer.__orig = renderer.render.bind(renderer);
      renderer.render = (scene, camera) => {
        const k = window.__cam;
        if (k) {
          camera.position.set(...k.pos);
          camera.lookAt(...k.look);
          camera.fov = k.fov || 60;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
        renderer.__orig(scene, camera);
      };
    }
    return 'started';
  },
  view(name, extra = {}) {
    const v = { ...VIEWS[name], ...extra };
    const level = window.boxer.levelRun();
    // First onto the spot (the sections wake on the first step), then onto the floor found there (as tools/stagebench.html does).
    level.put([v.man[0], v.man[1] + 0.3, v.man[2]], 0);
    window.boxer.advance(4 / 60);
    const floor = floorAt(window.boxer.state.world.arena.terrain, v.man[0], v.man[2], v.man[1] + 1.5);
    if (floor != null) level.put([v.man[0], floor, v.man[2]], 0);
    window.boxer.advance(10 / 60);
    window.__cam = v;
    // (The follow camera, which decides what the castle draws, takes a couple of seconds to come to a man put somewhere new.)
    window.boxer.playFrames(150);
    return name;
  },
  look(name) {
    const result = window.boxer.stageLook(name);
    window.boxer.playFrames(8);
    return result;
  },
  still(on = true) {
    window.boxer.stageLook(undefined, { still: on });
    return on;
  },
  release() {
    window.__cam = null;
  },
};
