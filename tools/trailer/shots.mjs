// The launch video's recordings (spec: ai-toolkit-kb working-memory/projects/boxer-simulator/specs/2026-11-14-launch-video.md), each a take of
// the game recorded by tools/trailer/render.mjs: `setup` runs in the page (an async function body; `TC` is tools/trailer-capture.js, already
// prepared: highest graphics, every man a full model, the page's clock held), then the take is stepped frame by frame per `segments`
// ({ frames, dt }: dt 1/60 is real speed, 1/240 a quarter). Seeds make a take repeatable; the scouts (tools/trailer-scout.js,
// trailer-skirmish.js, trailer-seki-scout.js) chose them. `view`: 'phone' (the HUD laid out as on a phone) for played shots.
// Not part of the game.

const real = (seconds) => ({ frames: Math.round(seconds * 60), dt: 1 / 60 });
const slow = (seconds, factor) => ({ frames: Math.round(seconds * factor * 60), dt: 1 / (60 * factor) });

export const SHOTS = {
  // Story ch. 2, seed 2, its first seconds: Qi's squads advancing across the canal town, seen from four places round it in turn (above the
  // square, behind the column, beside its ranks by the houses, low before the shields), each with a little drift; no HUD.
  canalOpen: {
    view: 'frame',
    hud: false,
    setup: `
      await TC.story('wokou', 2);
      const w = boxer.state.world;
      const ming = w.fighters.filter((f) => f.corner === 'blue');
      const [mx, mz] = [ming.reduce((a, f) => a + f.root[0], 0) / ming.length, ming.reduce((a, f) => a + f.root[1], 0) / ming.length];
      const cuts = [
        [1.2, { pos: [mx + 6, 9, mz - 7], look: [mx - 3, 0.5, mz + 1], fov: 50 }, [-2, -0.5, 0]],
        [2.4, { pos: [mx + 9, 1.7, mz - 1.5], look: [mx - 2, 1.3, mz], fov: 50 }, [-1.5, 0, 0]],
        [3.6, { pos: [mx - 1, 2.4, mz + 9], look: [mx, 1.2, mz], fov: 46 }, [-1.2, 0, -0.6]],
        [9.9, { pos: [mx - 12, 1.2, mz - 5], look: [mx - 2, 1.4, mz], fov: 44 }, [0.8, 0, 0]],
      ];
      // Hard cuts between the four, each drifting by its offset over its time.
      TC.camera = (t) => {
        let from = 0;
        for (const [until, cam, drift] of cuts) {
          if (t < until) { const k = (t - from) / (until - from); return { pos: cam.pos.map((v, i) => v + drift[i] * k), look: cam.look, fov: cam.fov }; }
          from = until;
        }
        return cuts.at(-1)[1];
      };
      await TC.warm(150);`,
    segments: [real(4.8)],
  },
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
  // Story ch. 3, seed 1: the moment a Ming man comes over the top: run on until a climber is near the head of his ladder (3.4 m), then
  // played as him (the camera low behind him on the ladder): over the parapet into the defenders.
  pyongyangClimb: {
    view: 'phone',
    setup: `
      boxer.fullModels(false);
      const s = await TC.story('pyongyang', 1);
      TC.play(s.player); TC.skip(88);
      const w = boxer.state.world;
      let me = null;
      while (w.time < 150 && !me) {
        boxer.playFrames(6, 1 / 60);
        me = w.fighters.filter((f) => f.corner === 'red' && f.state === 'up' && f.climbing && f.x[1] > 3.4).sort((a, b) => b.x[1] - a.x[1])[0] ?? null;
      }
      boxer.fullModels(true); TC.play(me.id);
      TC.chase(me.id, { back: 3.6, pitch: 0.35, lookUp: 5.2, fov: 58 });
      await TC.warm(150);`,
    segments: [real(10)],
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
  // Battle Mode Agincourt, seed 1, played as an English longbowman of the front rank (Richard): one continuous take from 34 s, the last
  // volleys into the men-at-arms coming through the mud, then their arrival at the stakes and the melee (from 42 s).
  agincourt: {
    view: 'phone',
    setup: `
      boxer.fullModels(false);
      await TC.battle('agincourt', 1);
      const w = boxer.state.world;
      const bows = w.fighters.filter((f) => f.corner === 'blue' && f.weapon?.kind === 'longbow').sort((a, b) => Math.abs(a.root[1]) - Math.abs(b.root[1]));
      const front = Math.min(...bows.map((f) => f.root[0]));
      const me = bows.filter((f) => f.root[0] < front + 1)[0] ?? bows[0];
      TC.play(me.id); TC.skip(34);
      boxer.fullModels(true); TC.play(me.id);
      TC.chase(me.id, { back: 4.6, pitch: 0.32, lookUp: 1.4, fov: 52 });
      await TC.warm(150);`,
    segments: [real(12)],
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

  // ---- Dunnottar (Level Mode, played: the Forger walks the stage's own route, DUNNOTTAR_ROUTE, and the fight AI fights for him when a foe
  // closes; the game's own camera, its zoom held out; the HUD as on a phone). A section is entered where the route enters it. `at` [x, y, z]: y the floor
  // height near there (the stage's views, tools/camshots.js), null for the highest floor (open ground only).
  dnCliff: dunnottar([-100, 10.6, -4], 0, [[-80, -4], [-64, -4], [-60.5, -2], [-60.5, 8], [-70, 8]], 5),
  dnBridge: dunnottar([-50, null, 44], 0, [[-44, 44], [-34, 45], [-28, 46.2], [-22, 46.2], [-16, 46.2], [-10.4, 46.2]], 6),
  dnLedge: dunnottar([-7.8, null, 49.5], Math.PI / 2, [[-7.8, 50.4], [-8.2, 54], [-3, 54.2], [2.2, 54]], 6),
  dnGate: dunnottar([5, 2, 46.2], 0, [[10, 46.2], [13, 46.2], [16.5, 46.2], [17.7, 42], [17.7, 37]], 5),
  dnQuad: dunnottar([17, 12.18, 6.5], 0, [[17, 4.4], [24, 3.6], [32, 3.6], [39, 3.4]], 5, 'boxer.stage.gather?.();'),
  // Underground: the long cellar under the quadrangle (the vault, the turnkey's desk) and the crypt to its flooded passage. (Not the sewer:
  // the twist's way.)
  dnCellar: dunnottar([6, 6, -22.5], 0, [[14, -22.5], [22, -22.5], [28, -22.5], [32, -24.4]], 6),
  dnCrypt: dunnottar([20, 1.4, -24.4], Math.PI, [[16, -24.4], [12, -25.5], [8, -27.5], [6.2, -29], [6.2, -33]], 6),
  // The chapel, the boss: Lord Vaelen's intro (skipped once it starts), then the fight under his bar: the Forger's blows glance off the
  // jousting plate (1.97 s, slowed; 2.73, 4.97), and Vaelen knocks him out (5.05 s: the ghost bar). Started inside the chapel gate, clear of
  // its portcullis.
  dnChapel: {
    view: 'phone',
    level: true,
    setup: `
      await TC.level([-9, 17.18, -36], Math.PI);
      TC.pilot([[-14, -36], [-18, -36]]);
      const run = boxer.levelRun();
      const w = boxer.state.world;
      for (let i = 0; i < 300 && !run.cutscene(); i += 1) { TC.onFrame(w); boxer.playFrames(1, 1 / 60); }
      run.skipCutscene?.();
      await TC.warm(60);`,
    segments: [real(1.8), slow(0.5, 4), real(4.2)],
  },
};

/** A Dunnottar shot: the Forger stood at `at` facing `yaw`, piloted along `points` for `seconds`; `extra` runs before the take. */
function dunnottar(at, yaw, points, seconds, extra = '') {
  return {
    view: 'phone',
    level: true,
    setup: `
      await TC.level(${JSON.stringify(at)}, ${yaw});
      TC.pilot(${JSON.stringify(points)});
      ${extra}
      await TC.warm(90);
      // The game's camera comes to him at real speed (it does not move in a held frame).
      for (let i = 0; i < 40; i += 1) { TC.onFrame(boxer.state.world); boxer.playFrames(1, 1 / 60); }`,
    segments: [real(seconds)],
  };
}

