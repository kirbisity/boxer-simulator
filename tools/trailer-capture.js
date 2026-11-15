// Trailer capture helper (launch video spec 2026-11-14), driven over CDP from a 540x960 @2x viewport (1080x1920):
//   const { TC } = await import('/tools/trailer-capture.js');
//   TC.prep();                         // top graphics, adaptive resolution off, UI hidden, the page's loop held (boxer.capture)
//   await TC.battle('agincourt', 1);   // a Battle Mode scenario at a seed, watched
//   await TC.story('wokou', 2);        // a story chapter's battle at a seed (the hero an AI soldier)
//   TC.skip(30);                       // run the fight on 30 s without drawing every frame
//   TC.focus(23);                      // the game's watch camera on a man
//   TC.cam({ pos, look, fov });        // a fixed camera; TC.cam(fn) a camera from the world's time; TC.cam(null) the game's own
//   TC.follow(id, { back, up, side, lookUp, fov })   a camera held at an offset from a man, looking at him
// Not part of the game; nothing imports it.

import { battleOf } from '/src/scenarios.js';
import { seededRandom } from '/src/physics.js';
import { STORY_BATTLES } from '/src/story/battles/index.js';
import { storyNorthLife } from '/tools/storynorth.js';
import { skirmish, SKIRMISH_ARENA } from '/tools/trailer-skirmish.js';

const HIDE = 'header,footer,#fight-ui,#hud,.hud,#clock,#ghost-bar,.ghost-bar,#log,#banner,.level-hud,#speeds,.fu-pick,#pause,#restart,#menu,.menu,#modes,.arena::after,.toast,#toast,#sound-toggle,.audio-mixer,#icons,.event-icon,#camera-bar{display:none!important}';

const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
const ease = (k) => k * k * (3 - 2 * k);

export const TC = {
  camera: null,
  prep({ hideUi = true } = {}) {
    const boxer = window.boxer;
    boxer.skipIntro?.();
    boxer.quality('high');
    boxer.adaptiveResolution(false);
    // Extra high: every man his own full model, at any distance (main.js boxer.fullModels).
    boxer.fullModels(true);
    this.ui(!hideUi);
    // No commanders' crowns on a cutscene (a sprite sized to nothing).
    TC.noCrowns = hideUi;
    const renderer = boxer.scene.renderer;
    if (!renderer.__orig) {
      renderer.__orig = renderer.render.bind(renderer);
      renderer.render = (scene, camera) => {
        const T = window.TC; const k = typeof T.camera === "function" ? T.camera(boxer.state.world?.time ?? 0, boxer.state.world) : T.camera;
        if (k && camera === boxer.scene.camera) {
          camera.position.set(...k.pos);
          camera.lookAt(...k.look);
          camera.fov = k.fov ?? 50;
          camera.updateProjectionMatrix();
          camera.updateMatrixWorld();
        }
        // The commanders' crowns (generalmark.js, sprites sized once at boot) shrunk to nothing on a cutscene.
        if (window.TC.noCrowns) scene.traverse((o) => { if (o.isSprite && Math.abs(o.scale.x - 0.035) < 1e-6) o.scale.setScalar(1e-6); });
        // (The game's resolution keeps pulling the ratio back to its cap of 2: the full device ratio, every frame.)
        if (renderer.getPixelRatio() !== window.devicePixelRatio) renderer.setPixelRatio(window.devicePixelRatio);
        renderer.__orig(scene, camera);
      };
    }
    boxer.capture(true);
    // A phone's layout (the driver's 405x720 CSS viewport, so the HUD is the size it is on a phone) drawn at the full 1080x1920: the
    // game caps its pixel ratio at 2 (render.js), the capture at the device's.
    boxer.scene.renderer.setPixelRatio(window.devicePixelRatio);
    return boxer.quality();
  },
  ui(show) {
    let style = document.getElementById('trailer-hide');
    if (!show && !style) {
      style = document.createElement('style');
      style.id = 'trailer-hide';
      style.textContent = HIDE;
      document.head.appendChild(style);
    }
    if (show && style) style.remove();
    return show;
  },
  async battle(key, seed = 1, { masked = false } = {}) {
    const s = battleOf(key);
    const cast = s.cast(seededRandom(seed));
    // Every samurai masked (the two unmasked kabuto designs swapped; as tools/trailer-seki-scout.js MASKED).
    const mask = (inputs) => { const swap = masked ? { samurai: { 0: 3, 2: 4 } }[inputs.outfit?.kind]?.[inputs.outfit.design] : null; return swap == null ? inputs : { ...inputs, outfit: { ...inputs.outfit, design: swap } }; };
    const fighters = Object.entries(cast).flatMap(([corner, side]) => side.map((inputs) => ({ inputs: mask(inputs), corner })));
    const count = window.boxer.storyBattle({ fighters, options: { seed, arena: s.arena, rules: s.rules, formation: s.formation, place: s.scene }, view: { scene: s.scene, camera: s.camera ?? {}, weather: s.weather } });
    await this.settle();
    return count;
  },
  async story(id, seed = 1, { rank = 'soldier', place = 'front' } = {}) {
    const battle = STORY_BATTLES[id];
    const setup = battle.setup(storyNorthLife(battle, { rank, place }), seed, {});
    const count = window.boxer.storyBattle({ ...setup, view: { ...battle.view, ...(setup.view ?? {}) } });
    this.player = setup.player;
    await this.settle();
    return { count, player: setup.player, scene: setup.view?.scene };
  },
  // Played, not watched: man `id` becomes the player's (his side and his place in it, as the side picker sets them), the fight AI plays him
  // (boxer.autopilot), the HUD shown and the game's own follow camera. Only the sound button is kept off the picture.
  play(id, { zoom = 8.5, pitch = 0.34 } = {}) {
    const boxer = window.boxer;
    const state = boxer.state;
    const man = state.world.fighters[id];
    const index = state.world.fighters.filter((f) => f.corner === man.corner).indexOf(man);
    state.lead[man.corner] = index;
    document.querySelector(`#modes button[data-value="play"]${man.corner === 'blue' ? '[data-side="blue"]' : ':not([data-side])'}`)?.click();
    state.playSide = man.corner;
    state.lead[man.corner] = index;
    boxer.autopilot(true);
    this.ui(true);
    let style = document.getElementById('trailer-play');
    if (!style) {
      style = document.createElement('style');
      style.id = 'trailer-play';
      style.textContent = '#sound-toggle,.audio-mixer,#sandbox-menu,.sandbox-only,footer.controls,.zone-hints,#camera-bar{display:none!important}';
      document.head.appendChild(style);
    }
    this.noCrowns = false;
    // A phone's HUD: touch, no keyboard hints.
    const ui = document.getElementById('fight-ui');
    if (ui) ui.dataset.device = 'touch';
    this.camera = null;
    // A third-person chase camera behind him, facing the foes nearest him (the game's own arm folds onto him in a packed crowd).
    this.chase(id, { back: zoom, pitch });
    boxer.playFrames(2, 0);
    return { mode: state.mode, side: state.playSide, player: boxer.state.world.fighters.find((f) => f.player)?.id ?? null };
  },
  // Behind man `id`, `back` m from him and raised by `pitch` rad, looking past him at the foes nearest him (their middle within 12 m, else
  // the whole enemy side's): both the eye and the aim eased, as a follow camera would.
  chase(id, { back = 8.5, pitch = 0.34, lookUp = 1.1, fov = 50, ease = 0.06 } = {}) {
    let eye = null;
    let aim = null;
    this.camera = (time, world) => {
      const man = world.fighters[id];
      const at = man.root;
      const foes = world.fighters.filter((f) => f.corner !== man.corner && f.state === 'up');
      const near = foes.filter((f) => Math.hypot(f.root[0] - at[0], f.root[1] - at[1]) < 12);
      const set = near.length ? near : foes;
      const mid = set.length ? [set.reduce((s, f) => s + f.root[0], 0) / set.length, set.reduce((s, f) => s + f.root[1], 0) / set.length] : [at[0] + 1, at[1]];
      const dx = mid[0] - at[0], dz = mid[1] - at[1], L = Math.hypot(dx, dz) || 1;
      const wantEye = [at[0] - (dx / L) * back * Math.cos(pitch), 1.2 + back * Math.sin(pitch), at[1] - (dz / L) * back * Math.cos(pitch)];
      const wantAim = [at[0] + (dx / L) * 2.5, lookUp, at[1] + (dz / L) * 2.5];
      eye = eye ? lerp(eye, wantEye, ease) : wantEye;
      aim = aim ? lerp(aim, wantAim, ease * 1.5) : wantAim;
      return { pos: eye, look: aim, fov };
    };
  },
  // The gun shot (spec shot 6): an East ashigaru with a teppō against a West samurai, both from Sekigahara's own cast at `seed`, on the
  // Sengoku battlefield (its camps) in mist, `distance` m apart. Returns the pair's ids [gunner, samurai].
  async duel(seed = 1, distance = 14, { castSeed = 1, samurai = 0 } = {}) {
    const cast = battleOf('sekigahara').cast(seededRandom(castSeed));
    const gun = cast.red.find((i) => i.style === 'matchlock' && i.outfit?.kind === 'ashigaru');
    const sam = cast.blue.filter((i) => i.outfit?.kind === 'samurai')[samurai];
    window.boxer.fight([structuredClone(gun)], [structuredClone(sam)], { seed, distance, place: 'sengoku' });
    // Watched: both men the AI's (fight() leaves the first as the player's, standing still).
    document.querySelector('#modes button[data-value="watch"]')?.click();
    window.boxer.weather('mist');
    await this.settle();
    return { gunner: 0, samurai: 1, samStyle: sam.style };
  },
  // Sekigahara's skirmish (tools/trailer-skirmish.js: the East's teppō rank and spears against the West's masked samurai and ashigaru), in
  // the Sengoku camps and the battle's morning, at `seed` (the scout's seeds are the same fight).
  async skirmish(seed = 11) {
    const s = battleOf('sekigahara');
    const sides = skirmish(1);
    const fighters = Object.entries(sides).flatMap(([corner, side]) => side.map((inputs) => ({ inputs: structuredClone(inputs), corner })));
    window.boxer.storyBattle({ fighters, options: { seed, arena: SKIRMISH_ARENA, rules: s.rules, formation: s.formation, place: 'sengoku' }, view: { scene: 'sengoku', camera: s.camera ?? {}, weather: s.weather } });
    await this.settle();
    return window.boxer.state.world.fighters.length;
  },
  // The ending's duel: two knights at the gallop with couched lances on the open field, `distance` m apart. [red, blue] presets.
  async joust(seed = 1, distance = 60, { lane = 0, red = { preset: 'maximilian', mounted: true }, blue = { preset: 'knight', style: 'lance', mounted: true }, place = 'field' } = {}) {
    window.boxer.fight([structuredClone(red)], [structuredClone(blue)], { seed, distance, place });
    document.querySelector('#modes button[data-value="watch"]')?.click();
    window.boxer.weather(null);
    // Either side of a tilt `lane` m wide: red rides +x along z = -lane/2, blue -x along z = +lane/2 (yaw 0 faces +x).
    if (lane) {
      window.boxer.placeRider(0, -distance / 2, -lane / 2, 0);
      window.boxer.placeRider(1, distance / 2, lane / 2, Math.PI);
    }
    await this.settle();
    return window.boxer.state.world.fighters.map((f) => ({ id: f.id, weapon: f.weapon?.kind, mounted: Boolean(f.mount), at: f.mount?.at, yaw: f.mount?.yaw }));
  },
  async settle() {
    // The menus shut, as storyBattle does (fight() leaves the home screen over the fight).
    window.boxer.closeMenus?.();
    if (window.boxer.fullModels()) window.boxer.fullModels(true);
    // Out of the training yard the page boots into (it starts its bout again when a man is out): a sandbox fight.
    window.boxer.state.game = 'sandbox';
    document.body.dataset.game = 'sandbox';
    window.boxer.finishBuilding?.();
    window.boxer.finishSkins?.();
    window.boxer.playFrames(2, 0);
  },
  // Before a take: `frames` frames drawn with the clock held (no time passes), pausing now and then, so the place's grass, textures and
  // skins have come in before the first frame recorded (the first second of a fresh scene is otherwise half loaded).
  async warm(frames = 120) {
    const boxer = window.boxer;
    boxer.finishSkins?.();
    for (let i = 0; i < frames; i += 1) {
      boxer.playFrames(1, 0);
      if (i % 10 === 9) await new Promise((ok) => setTimeout(ok, 60));
    }
    boxer.finishSkins?.();
    return boxer.skins?.().waiting ?? 0;
  },
  // Run the fight on without drawing each frame (the simulation as the scout ran it; draws a frame every second so views keep up).
  skip(seconds) {
    const boxer = window.boxer;
    for (let t = 0; t < seconds; t += 1) boxer.playFrames(1, Math.min(1, seconds - t));
    return boxer.state.world.time;
  },
  focus(id) {
    this.camera = null;
    return window.boxer.focusOn(id);
  },
  cam(spec) {
    this.camera = spec;
    return Boolean(spec);
  },
  // A path: keys [{ t, pos, look, fov }] by world time, eased between.
  path(keys) {
    this.camera = (time) => {
      if (time <= keys[0].t) return keys[0];
      for (let i = 1; i < keys.length; i += 1) {
        if (time <= keys[i].t) {
          const k = ease((time - keys[i - 1].t) / (keys[i].t - keys[i - 1].t));
          return { pos: lerp(keys[i - 1].pos, keys[i].pos, k), look: lerp(keys[i - 1].look, keys[i].look, k), fov: (keys[i - 1].fov ?? 50) + ((keys[i].fov ?? 50) - (keys[i - 1].fov ?? 50)) * k };
        }
      }
      return keys[keys.length - 1];
    };
  },
  // Held at an offset from a man (in the world's axes, smoothed), looking at his chest.
  follow(id, { back = 3.2, up = 1.5, side = 1.2, lookUp = 1.2, fov = 45, dir = [0, 0, 1] } = {}) {
    let eye = null;
    this.camera = (time, world) => {
      const man = world.fighters[id];
      const root = man.root ?? man.x?.slice?.(0, 3);
      const at = [root[0], 0, root[1]];
      const want = [at[0] + dir[0] * back + dir[2] * side, at[1] + up, at[2] + dir[2] * back - dir[0] * side];
      eye = eye ? lerp(eye, want, 0.08) : want;
      return { pos: eye, look: [at[0], at[1] + lookUp - 1, at[2]], fov };
    };
  },
  // The men with the most mechanics (distinct weighted kinds) in the last `seconds`, richest first: [{ id, corner, weapon, kinds, at:[x,z] }].
  busiest(seconds = 5, corner = null) {
    const W = { glance: 3, parry: 3, bladeBlock: 3, clash: 2, blocked: 2, caught: 4, disarmed: 4, shieldBroke: 4, weaponBroke: 4, helmet: 4, misfire: 5, shot: 2, arrow: 1, staggered: 2, floored: 3, fell: 2, thrown: 3, throw: 3, knockout: 4, severed: 2, dazed: 2, jump: 3, clinch: 3, beatenThrough: 4 };
    const w = window.boxer.state.world;
    const mine = new Map();
    for (const e of w.events) {
      if (e.time < w.time - seconds || !W[e.kind]) continue;
      for (const id of new Set([e.fighter, e.attacker, e.defender])) {
        if (id == null || id < 0) continue;
        if (!mine.has(id)) mine.set(id, new Set());
        mine.get(id).add(e.kind);
      }
    }
    return [...mine].map(([id, kinds]) => ({ id, corner: w.fighters[id].corner, weapon: w.fighters[id].weapon?.kind, state: w.fighters[id].state, kinds: [...kinds], worth: [...kinds].reduce((s, k) => s + W[k], 0), at: w.fighters[id].root.map((v) => +v.toFixed(1)) }))
      .filter((m) => !corner || m.corner === corner).sort((a, b) => b.worth - a.worth).slice(0, 5);
  },
  // A camera on a circle round some men, at the bearing with the most room (no body within the line of sight), looking at their middle.
  clear(ids, { radius = 3.5, height = 1.1, lookUp = 1.25, fov = 42, prefer = null } = {}) {
    const w = window.boxer.state.world;
    const pts = ids.map((id) => w.fighters[id].root);
    const m = [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    const others = w.fighters.filter((f) => !ids.includes(f.id) && f.state !== 'gone').map((f) => f.root);
    let best = null;
    for (let k = 0; k < 48; k += 1) {
      const a = (k / 48) * Math.PI * 2;
      const eye = [m[0] + Math.cos(a) * radius, m[1] + Math.sin(a) * radius];
      // Room: the nearest body to the segment eye -> middle (and the eye itself).
      let room = Infinity;
      for (const o of others) {
        const dx = m[0] - eye[0], dz = m[1] - eye[1];
        const t = Math.max(0, Math.min(0.85, ((o[0] - eye[0]) * dx + (o[1] - eye[1]) * dz) / (dx * dx + dz * dz)));
        room = Math.min(room, Math.hypot(eye[0] + dx * t - o[0], eye[1] + dz * t - o[1]));
      }
      // Side-on to the pair when two are given (both faces seen), and an optional bearing preferred.
      let score = Math.min(room, 2.5);
      if (pts.length === 2) score += 0.6 * Math.abs(Math.sin(a - Math.atan2(pts[1][1] - pts[0][1], pts[1][0] - pts[0][0])));
      if (prefer != null) score += 0.4 * Math.cos(a - prefer);
      if (!best || score > best.score) best = { score, room, eye, a };
    }
    this.camera = { pos: [best.eye[0], height, best.eye[1]], look: [m[0], lookUp, m[1]], fov };
    return { room: +best.room.toFixed(2), bearing: +best.a.toFixed(2), middle: m.map((v) => +v.toFixed(1)) };
  },
  where(id) {
    const man = window.boxer.state.world.fighters[id];
    return { root: man.root, state: man.state, corner: man.corner, weapon: man.weapon?.kind };
  },
  info() {
    const w = window.boxer.state.world;
    return { time: w.time, men: w.fighters.length, quality: window.boxer.quality(), camera: window.boxer.scene.camera.position.toArray() };
  },
};
window.TC = TC;
