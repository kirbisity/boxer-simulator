// The launch video's recordings (spec: ai-toolkit-kb working-memory/projects/boxer-simulator/specs/2026-11-14-launch-video.md), each a take of
// the game recorded by tools/trailer/render.mjs: `setup` runs in the page (an async function body; `TC` is tools/trailer-capture.js, already
// prepared: highest graphics, every man a full model, the page's clock held), then the take is stepped frame by frame per `segments`
// ({ frames, dt }: dt 1/60 is real speed, 1/240 a quarter). Seeds make a take repeatable; the scouts (tools/trailer-scout.js,
// trailer-skirmish.js, trailer-seki-scout.js) chose them. `view`: 'phone' (the HUD laid out as on a phone) for played shots.
// Not part of the game.

const real = (seconds) => ({ frames: Math.round(seconds * 60), dt: 1 / 60 });
const slow = (seconds, factor) => ({ frames: Math.round(seconds * factor * 60), dt: 1 / (60 * factor) });

export const SHOTS = {
  // Story ch. 2, seed 2, played as the hero (Wu): from just before the clash into the fight until the raiders break.
  canal: {
    view: 'phone',
    setup: `
      const s = await TC.story('wokou', 2);
      TC.play(s.player, { zoom: 8.5, pitch: 0.42 });
      TC.skip(5); boxer.playFrames(30);
      await TC.warm(120);`,
    segments: [real(14.5)],
  },
  // Story ch. 3, seed 1: the hero's approach through the snow, the Hamgu gate (含毬門) in frame (it stands 50 m along the wall).
  pyongyangGate: {
    view: 'phone',
    setup: `
      boxer.fullModels(false);
      const s = await TC.story('pyongyang', 1);
      TC.play(s.player); TC.skip(64);
      boxer.fullModels(true); TC.play(s.player);
      TC.chase(s.player, { back: 9, pitch: 0.3, toward: [2, -34], lookUp: 3, fov: 54 });
      await TC.warm(150);`,
    segments: [real(5.5)],
  },
  // Story ch. 3, seed 1: on the wall-walk, hand to hand: run on until five Ming men are up, then played as the busiest of them there.
  pyongyangWall: {
    view: 'phone',
    setup: `
      boxer.fullModels(false);
      const s = await TC.story('pyongyang', 1);
      TC.play(s.player, { zoom: 6.5, pitch: 0.3 });
      TC.skip(110);
      const w = boxer.state.world;
      const onWall = () => w.fighters.filter((f) => f.corner === 'red' && f.state === 'up' && f.x[1] > 4.5);
      while (w.time < 200 && onWall().length < 5) TC.skip(2);
      TC.skip(10);
      const up = onWall();
      const id = TC.busiest(4, 'red').find((b) => up.some((f) => f.id === b.id))?.id ?? up[0]?.id ?? s.player;
      boxer.fullModels(true); TC.play(id);
      TC.chase(id, { back: 6.5, pitch: 0.95, lookUp: 5.6, fov: 52 });
      await TC.warm(150);`,
    segments: [real(10)],
  },
  // Battle Mode Agincourt, seed 1, played as Bernard (a French man-at-arms): the march in the mud, the volley at a quarter speed (an arrow
  // goes through the armour at his shin at 1.87 s), on into the field.
  agincourt: {
    view: 'phone',
    setup: `
      await TC.battle('agincourt', 1);
      TC.play(21, { zoom: 4.6, pitch: 0.2 });
      await TC.warm(150);`,
    segments: [real(1.6), slow(0.8, 4), real(6)],
  },
  // The same arrow, close: a still camera low beside his shin, the arrow's last two metres at a sixth of real speed.
  agincourtArrow: {
    view: 'phone',
    setup: `
      await TC.battle('agincourt', 1);
      TC.play(21, { zoom: 4.6, pitch: 0.2 });
      for (let i = 0; i < 102; i += 1) boxer.playFrames(1, 1 / 60);
      TC.cam({ pos: [-41.0, 0.5, 5.3], look: [-41.9, 0.25, 2.9], fov: 52 });
      await TC.warm(60);`,
    segments: [slow(0.42, 6)],
  },
  // Sekigahara (tools/trailer-skirmish.js, seed 11): the East's teppō rank fires; a masked West samurai is shot dead through his armour;
  // his side charges on past him. No HUD.
  sekigahara: {
    view: 'frame',
    hud: false,
    setup: `
      await TC.skirmish(11);
      const a = { pos: [-12.2, 2.3, 5.2], look: [4, 1.1, -2.4], fov: 46 };
      const b = { pos: [-11.6, 2.25, 4.6], look: [7, 1.0, -2.2], fov: 34 };
      const c = { pos: [-5.5, 2.2, 2.2], look: [8.0, 0.6, -2.0], fov: 22 };
      TC.path([{ t: 0, ...a }, { t: 0.9, ...b }, { t: 1.2, ...b }, { t: 2.8, ...c }, { t: 6, ...c }]);
      boxer.playFrames(1, 0);
      await TC.warm(150);
      boxer.playFrames(21, 1 / 60);`,
    segments: [slow(0.54, 4), real(3.6)],
  },
  // The ending's duel on the open field (seed 5, either side of a tilt): a lance glances off plate (a quarter speed), one knight unhorsed,
  // then the camera rises over the field for the title. No HUD.
  joust: {
    view: 'frame',
    hud: false,
    setup: `
      await TC.joust(5, 50, { lane: 2.2 });
      const a = { pos: [-2, 2.0, 6], look: [0, 1.4, -6], fov: 62 };
      const b = { pos: [-1.2, 1.7, 1.5], look: [0.8, 1.5, -8.6], fov: 38 };
      const c = { pos: [0, 9, 10], look: [0, 3, -40], fov: 55 };
      TC.path([{ t: 0, ...a }, { t: 3.4, ...a }, { t: 5.7, ...b }, { t: 6.8, ...b }, { t: 9.8, ...c }, { t: 20, ...c }]);
      boxer.playFrames(1, 0);
      await TC.warm(150);
      for (let i = 0; i < 34; i += 1) boxer.playFrames(1, 0.1);`,
    segments: [real(2.3), slow(1, 4), real(5)],
  },
};
