// A dev helper for the pictures of Dunnottar's dark places (the interiors' light, the underground water, the sewer and its cesspool): a fixed camera
// at each, the UI hidden, a shot posted to tools/serve.py (shots/<name>.png). In the page's console (served by tools/serve.py):
//
//   const { LS } = await import('/tools/lightshots.js');
//   LS.start();                    // the ghost walk, UI hidden, the camera taken over, the look still
//   LS.view('vault');              // stand the man at a view and point the camera
//   await LS.shot('vault-after');  // post the canvas as shots/vault-after.png
//   LS.all('after')                // every view, one shot each
//
// Not part of the game; nothing imports it.

import { floorAt } from '/src/physics/terrain.js';

// man: where he stands [x, y, z] (y: a floor above him to look down from), yaw his facing; cam: the eye and the point looked at.
export const VIEWS = {
  gatehall: { man: [-1, 0, 46.2], yaw: Math.PI, cam: [4.6, 2.6, 49.5], look: [-3, 1.2, 45] },
  gallery: { man: [25.5, 4.18, 46], yaw: 0, cam: [17, 6.6, 47.5], look: [27, 5, 45] },
  ascent: { man: [17.6, 8.18, 20], yaw: Math.PI / 2, cam: [18.6, 10.8, 24.6], look: [17, 9.2, 17] },
  vault: { man: [20, 6, -22.5], yaw: 0, cam: [13, 8.4, -22.5], look: [24, 6.8, -22.5] },
  torture: { man: [7, 6, -30], yaw: -Math.PI / 2, cam: [7.2, 8.2, -34.6], look: [7, 6.6, -28] },
  stores: { man: [15.2, 6, -14.6], yaw: -Math.PI / 2, cam: [15.2, 8.2, -19.5], look: [15.2, 6.6, -12] },
  crypt: { man: [16, 1.4, -24.4], yaw: Math.PI, cam: [22, 3.6, -24.4], look: [12, 2, -24.4] },
  flooded: { man: [6.2, 1.4, -29], yaw: Math.PI / 2, cam: [6.2, 3.6, -24], look: [6.2, 1.2, -33] },
  keep: { man: [52, 12.18, -23.8], yaw: 0, cam: [45.5, 14.6, -22.5], look: [55, 13, -24] },
  towerstair: { man: [60.6, 13.5, -23.8], yaw: Math.PI / 2, cam: [66.6, 15.4, -24.6], look: [61, 13.6, -22.4] },
  chapel: { man: [-12, 17.18, -36], yaw: Math.PI, cam: [-4.5, 20.5, -36], look: [-18, 18.5, -36] },
  cell: { man: [-40, 17.18, -36], yaw: Math.PI, cam: [-36.4, 19.2, -32.4], look: [-42, 17.6, -38.4] },
  grotto: { man: [-48.5, -5, 49], yaw: Math.PI / 2, cam: [-50.5, -2.6, 53.6], look: [-47.5, -4.4, 45] },
  drain: { man: [-48.5, -5, 34], yaw: Math.PI / 2, cam: [-48.5, -3, 39], look: [-48.5, -4.2, 28] },
  cistern: { man: [-48.5, -5, 14], yaw: Math.PI / 2, cam: [-48.5, -2.2, 21], look: [-48.5, -4.6, 9] },
  longdrain: { man: [-20, -1.6, -37.9], yaw: Math.PI, cam: [-14.5, 0.4, -37.9], look: [-24, -1, -37.9] },
  cesspool: { man: [-42.6, -1.6, -37.9], yaw: 0, cam: [-43.9, 0.9, -36.4], look: [-35, -2, -38.6] },
  cesspoolhigh: { man: [-42.6, -1.6, -37.9], yaw: 0, cam: [-30.6, 2.2, -32.2], look: [-38, -2.2, -39.5] },
};

const HIDE = 'header,footer,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,.arena::after{display:none!important} body.ghost-walk .ghost-bar{display:none!important}';

export const LS = {
  views: VIEWS,
  start({ look = 'stormBreak', quality = 'high' } = {}) {
    const boxer = window.boxer;
    boxer.skipIntro();
    boxer.quality(quality);
    boxer.adaptiveResolution(false);
    boxer.levelMode('dunnottar', { ghost: true });
    boxer.stageLook(look, { still: true });
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
          camera.position.set(...k.cam);
          camera.lookAt(...k.look);
          camera.fov = k.fov || 62;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
        renderer.__orig(scene, camera);
      };
    }
    return 'started';
  },
  view(name, extra = {}, frames = 150) {
    const v = { ...VIEWS[name], ...extra };
    const level = window.boxer.levelRun();
    level.put([v.man[0], v.man[1] + 0.3, v.man[2]], v.yaw ?? 0);
    window.boxer.advance(4 / 60);
    const floor = floorAt(window.boxer.state.world.arena.terrain, v.man[0], v.man[2], v.man[1] + 1.5);
    if (floor != null && Number.isFinite(floor)) level.put([v.man[0], floor, v.man[2]], v.yaw ?? 0);
    window.boxer.advance(10 / 60);
    window.__cam = v;
    window.boxer.playFrames(frames);
    return name;
  },
  async shot(name) {
    const boxer = window.boxer;
    boxer.playFrames(1);
    const url = boxer.scene.renderer.domElement.toDataURL('image/png');
    const response = await fetch(`/__shot?name=${encodeURIComponent(name)}`, { method: 'POST', body: url });
    return response.status;
  },
  async all(tag, names = Object.keys(VIEWS)) {
    const out = {};
    for (const name of names) {
      LS.view(name);
      out[name] = await LS.shot(`${name}-${tag}`);
    }
    return out;
  },
  release() {
    window.__cam = null;
  },
};
