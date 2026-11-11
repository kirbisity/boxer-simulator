// Page side of the photo-face shots: injected by drive.mjs into the game page (served by tools/serve.py).
(() => {
  const ring = (red, blue, seed = 3) => ({
    place: 'ring', seed, frames: 40, distance: 2.0, red, blue,
    camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
    portraits: [0, 1],
  });
  const PAIRS = [
    ['italy', 'sweden'], ['japan', 'japan'], ['china', 'china'], ['mongolia', 'mongolia'], ['westAfrica', 'ethiopia'], ['india', 'india'],
    ['england', 'england'], ['iran', 'turkey'], ['mexico', 'peru'], ['russia', 'russia'], ['ethiopia', 'philippines'], ['southAfrica', 'chadCameroon'],
  ];
  const SCENES = {
    'face-ring': { about: 'Two bare-headed fighters in the ring.', ...ring([{ preset: 'amateur' }], [{ preset: 'taichi' }]) },
    'face-ring2': { about: 'Two bare-headed women in the ring.', ...ring([{ preset: 'contender' }], [{ preset: 'revolver' }], 5), frames: 20, distance: 2.4 },
    'face-helmet': {
      about: 'Helmeted: a legionary and a samurai in the Colosseum.',
      place: 'colosseum', seed: 11, frames: 60, distance: 2.3,
      red: [{ preset: 'legionary' }], blue: [{ preset: 'samurai' }],
      camera: { focus: { centre: true, height: 1.3 }, yaw: 1.3, pitch: 0.05, distance: 4.6, fov: 42 },
      portraits: [0, 1],
    },
    'face-brawl': {
      about: 'A brawl of twenty bare heads in the field.',
      place: 'field', seed: 6, frames: 40,
      red: ['amateur', 'street', 'passive', 'mix', 'light', 'unskilled', 'veteran', 'bat', 'longbow', 'spear'].map((preset) => ({ preset })),
      blue: ['taichi', 'taekwondo', 'knife', 'staff', 'contender', 'sumo', 'wuxia', 'revolver', 'heavy', 'shotgun'].map((preset) => ({ preset })),
      camera: { focus: { centre: true, height: 1.0 }, yaw: 0.9, pitch: 0.2, distance: 11, fov: 40 },
    },
    'face-steppe': {
      about: 'Mongols against the Ming, ten a side, on the plain.',
      place: 'field', seed: 8, frames: 40,
      red: ['steppeBow', 'saberShield', 'kheshig', 'maceShield', 'saber', 'steppeBow', 'kheshig', 'saberShield', 'maceShield', 'steppeBow'].map((preset) => ({ preset })),
      blue: ['mingSpear', 'mingDao', 'swordShield', 'mingCrossbow', 'langxian', 'mingMatchlock', 'mingSpear', 'mingDao', 'guandao', 'threeEyed'].map((preset) => ({ preset })),
      camera: { focus: { centre: true, height: 1.0 }, yaw: 0.9, pitch: 0.2, distance: 11, fov: 40 },
    },
  };
  PAIRS.forEach(([man, woman], index) => {
    SCENES[`face-grid${index}`] = {
      about: `Portraits: a ${man} man and a ${woman} woman.`,
      place: 'field', seed: 20 + index, frames: 12, distance: 2.6,
      red: [{ preset: 'amateur', name: `${man} man`, faceRegion: man }], blue: [{ preset: 'contender', name: `${woman} woman`, faceRegion: woman }],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      grid: [man, woman],
    };
  });
  // Head shape: one region at three builds and three ages (named, to be found among the views).
  const BUILDS = [
    ['italy', 'male', 'amateur'], ['mongolia', 'male', 'amateur'], ['westAfrica', 'male', 'amateur'], ['india', 'female', 'contender'],
  ];
  BUILDS.forEach(([region, sex, preset]) => {
    const one = (name, extra) => ({ preset, name, faceRegion: region, age: 28, ...extra });
    SCENES[`face-builds-${region}`] = {
      about: `Head shape: ${region} ${sex}s, lean to fat and young to old.`,
      place: 'field', seed: 31, frames: 10,
      red: [one('lean', { calories: 2200, exercise: 0.95, frame: 'small' }), one('average', { calories: 3000, exercise: 0.4 }), one('fat', { calories: 6200, exercise: 0.03, frame: 'large' })],
      blue: [one('age 20', { age: 20, calories: 3000, exercise: 0.4 }), one('age 45', { age: 45, calories: 3000, exercise: 0.4 }), one('age 72', { age: 72, calories: 3000, exercise: 0.4 })],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 6, fov: 40 },
      builds: { region, names: ['lean', 'average', 'fat', 'age 20', 'age 45', 'age 72'] },
    };
  });
  // Hair styles: two fighters a scene, each with a style (and one old man, balding).
  const HAIR = [['buzz', 'bun'], ['cleanShort', 'ponytail'], ['midLong', 'long'], ['topknot', 'hime'], ['bald', 'ringlets'], ['cleanShort', 'midLong']];
  HAIR.forEach(([man, woman], index) => {
    const old = index === 5;
    const look = (hairStyle, female) => ({ skinTone: 'light', hairStyle, hairColor: '#3a2a1c', facialHair: !female && index === 2 ? 'beard' : 'none', eyeColor: 'brown' });
    SCENES[`face-hair${index}`] = {
      about: `Hair: ${man} and ${woman}.`,
      place: 'field', seed: 40 + index, frames: 10, distance: 2.6,
      red: [{ preset: 'amateur', name: `m-${man}${old ? '-old' : ''}`, faceRegion: index % 2 ? 'italy' : 'england', age: old ? 64 : 28, look: look(man, false) }],
      blue: [{ preset: 'contender', name: `f-${woman}`, faceRegion: index % 2 ? 'japan' : 'sweden', age: 26, look: look(woman, true) }],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      hair: true,
    };
  });
  // Hair options: six styles, two fighters a scene.
  const OPTION_STYLES = [
    [{ name: 'hime', preset: 'contender', region: 'japan', style: 'hime' }, { name: 'long', preset: 'contender', region: 'sweden', style: 'long' }],
    [{ name: 'ponytail', preset: 'amateur', region: 'italy', style: 'ponytail' }, { name: 'medium', preset: 'amateur', region: 'england', style: 'midLong' }],
    [{ name: 'short', preset: 'amateur', region: 'germany', style: 'cleanShort' }, { name: 'topknot', preset: 'amateur', region: 'japan', style: 'topknot' }],
  ];
  OPTION_STYLES.forEach(([red, blue], index) => {
    const one = ({ name, preset, region, style }) => ({ preset, name, faceRegion: region, age: 27, look: { skinTone: 'light', hairStyle: style, hairColor: '#2a1d14', facialHair: 'none', eyeColor: 'brown' } });
    SCENES[`face-opt${index}`] = {
      about: `Hair options: ${red.name} and ${blue.name}.`,
      place: 'field', seed: 60 + index, frames: 8, distance: 2.8,
      red: [one(red)], blue: [one(blue)],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      options: true,
    };
  });
  // Every style on a man and a woman (verb `styles`: front, three-quarter and back; verb `motion`: a turn and a run).
  const ALL_STYLES = ['spiky', 'cleanShort', 'fade', 'buzz', 'cornrows', 'bun', 'ponytail', 'midLong', 'long', 'dreads', 'topknot', 'ringletPigtails', 'ringlets', 'ringletUpdo', 'hime', 'bald'];
  ALL_STYLES.forEach((style) => {
    const one = (preset, name, region, female) => ({ preset, name, faceRegion: region, age: 27, look: { skinTone: female ? 'light' : 'medium', hairStyle: style, hairColor: female ? '#3a2a1c' : '#1d1510', facialHair: 'none', eyeColor: 'brown' } });
    SCENES[`face-style-${style}`] = {
      about: `Hair style ${style} on a man and a woman.`,
      place: 'field', seed: 70, frames: 8, distance: 2.8,
      red: [one('amateur', `m-${style}`, 'italy', false)], blue: [one('contender', `f-${style}`, 'sweden', true)],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      style,
    };
  });
  // A helmeted pair for what shows below a helmet's rim (a man with a ponytail, a woman with long hair).
  SCENES['face-style-helmet'] = {
    about: 'Helmets over long hair and a ponytail.',
    place: 'field', seed: 71, frames: 8, distance: 2.8,
    red: [{ preset: 'legionary', name: 'helm-ponytail', faceRegion: 'italy', age: 27, look: { skinTone: 'medium', hairStyle: 'ponytail', hairColor: '#1d1510', facialHair: 'none', eyeColor: 'brown' } }],
    blue: [{ preset: 'samurai', name: 'helm-long', faceRegion: 'japan', age: 27, look: { skinTone: 'light', hairStyle: 'long', hairColor: '#1d1510', facialHair: 'none', eyeColor: 'brown' } }],
    camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let bench = null;

  async function texturesIn() {
    for (let waited = 0; waited < 8000; waited += 50) {
      if ((window.__photoFaces.stats().pending ?? 0) === 0) break;
      await sleep(50);
    }
    window.boxer.playFrames(1);
  }

  async function jpeg(name, crop = null) {
    await texturesIn();
    const shot = await window.__looks.capture(name, { save: false });
    const image = new Image();
    await new Promise((resolve) => { image.onload = resolve; image.src = shot.dataUrl; });
    const [x, y, w, h] = crop ?? [0, 0, image.width, image.height];
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    canvas.getContext('2d').drawImage(image, x, y, w, h, 0, 0, w, h);
    return { name, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
  }

  function aimAtHead(index, { turn = 0.2, distance = 0.8, fov = 28, pitch = 0.04 } = {}) {
    const scene = window.boxer.scene;
    const view = window.boxer.state.views[index];
    const matrix = view.head.group.matrixWorld.elements;
    const length = Math.hypot(matrix[0], matrix[1], matrix[2]);
    scene.orbit.target.set(matrix[12], matrix[13] + 0.01, matrix[14]);
    scene.orbit.yaw = Math.atan2(matrix[2] / length, matrix[0] / length) + turn;
    scene.orbit.pitch = pitch;
    scene.orbit.distance = distance;
    scene.camera.fov = fov;
    scene.camera.updateProjectionMatrix();
    window.boxer.state.paused = true;
    window.boxer.playFrames(1);
  }

  function faceIds() {
    return window.boxer.state.views.map((view) => {
      let id = null;
      view.head?.group.traverse((object) => { if (object.material?.userData?.photoFace) id = object.material.userData.photoFace; });
      return { name: view.fighter.body.inputs.name, kit: view.fighter.body.inputs.outfit?.kind, face: id };
    });
  }

  // The arms let down by the sides (particles: shoulders 2, 3; elbows 4, 5; hands 6, 7), so the guard's gloves do not hide the hair.
  function armsDown(index) {
    const view = window.boxer.state.views[index];
    const x = view.fighter.x;
    const forward = new THREE.Vector3().setFromMatrixColumn(view.head.group.matrixWorld, 0).setY(0).normalize();
    for (const [shoulder, elbow, hand] of [[2, 4, 6], [3, 5, 7]]) {
      x[elbow * 3] = x[shoulder * 3] - forward.x * 0.03;
      x[elbow * 3 + 1] = x[shoulder * 3 + 1] - 0.28;
      x[elbow * 3 + 2] = x[shoulder * 3 + 2] - forward.z * 0.03;
      x[hand * 3] = x[elbow * 3] + forward.x * 0.04;
      x[hand * 3 + 1] = x[elbow * 3 + 1] - 0.26;
      x[hand * 3 + 2] = x[elbow * 3 + 2] + forward.z * 0.04;
    }
  }

  // Frames with the physics paused (the page then draws with no time passing): the hair stepped by hand, on the body's
  // capsules as the page last drew them.
  function playHair(frames) {
    for (let frame = 0; frame < frames; frame += 1) {
      window.boxer.playFrames(1);
      for (const view of window.boxer.state.views) {
        const swing = view.head?.hairSwing;
        if (swing) swing.update(1 / 60, view.head.group, swing.colliders ?? []);
      }
    }
  }

  function hairTriangles(index) {
    let triangles = 0;
    window.boxer.state.views[index].head?.group.traverseVisible((object) => {
      if (object.isMesh && (object.userData.photoHair || object.userData.photoHairRim || object.userData.photoBeard)) triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
    });
    return triangles;
  }

  function headTriangles(index) {
    let triangles = 0;
    let meshes = 0;
    window.boxer.state.views[index].head?.group.traverseVisible((object) => {
      if (!object.isMesh || object.userData.outline || !object.material?.visible) return;
      triangles += (object.geometry.index ? object.geometry.index.count : object.geometry.attributes.position.count) / 3;
      meshes += 1;
    });
    return { triangles, meshes };
  }

  window.__faceHarness = {
    async run(step) {
      bench ??= await import('/src/looksbench.js').catch(() => ({ COMPARE_SCENES: {} }));
      Object.assign(bench.COMPARE_SCENES, SCENES);
      const [verb, mode, extra] = step.split(':');
      if (verb === 'faces') {
        await window.__photoFaces.set(mode === 'after');
        return { on: mode === 'after', stats: window.__photoFaces.stats() };
      }
      if (verb === 'grid') {
        const shots = [];
        for (const scene of Object.keys(SCENES).filter((id) => SCENES[id].grid)) {
          await window.__looks.stage(scene);
          for (const [index, region] of SCENES[scene].grid.entries()) {
            aimAtHead(index, { turn: 0.15, distance: 0.75 });
            shots.push(await jpeg(`face-grid-${index ? 'f' : 'm'}-${region}`, [380, 40, 520, 600]));
            aimAtHead(index, { turn: 1.2, distance: 0.75 });
            shots.push(await jpeg(`face-grid-${index ? 'f' : 'm'}-${region}-profile`, [380, 40, 520, 600]));
          }
        }
        return { shots, faces: window.__photoFaces.stats() };
      }
      if (verb === 'builds') {
        const shots = [];
        for (const scene of Object.keys(SCENES).filter((id) => SCENES[id].builds)) {
          await window.__looks.stage(scene);
          const { region, names } = SCENES[scene].builds;
          for (const name of names) {
            const index = window.boxer.state.views.findIndex((view) => view.fighter.body.inputs.name === name);
            if (index < 0 || !window.boxer.state.views[index].head) continue;
            const slug = name.replace(' ', '');
            aimAtHead(index, { turn: 0.12, distance: 0.75 });
            shots.push(await jpeg(`face-build-${region}-${slug}${mode ? `-${mode}` : ""}`, [380, 40, 520, 600]));
            aimAtHead(index, { turn: 1.2, distance: 0.75 });
            shots.push(await jpeg(`face-build-${region}-${slug}-profile${mode ? `-${mode}` : ""}`, [380, 40, 520, 600]));
            aimAtHead(index, { turn: 0.6, distance: 0.75 });
            shots.push(await jpeg(`face-build-${region}-${slug}-34${mode ? `-${mode}` : ""}`, [380, 40, 520, 600]));
          }
        }
        return { shots };
      }
      if (verb === 'hair') {
        const shots = [];
        for (const scene of Object.keys(SCENES).filter((id) => SCENES[id].hair)) {
          await window.__looks.stage(scene);
          for (const [index, view] of window.boxer.state.views.entries()) {
            if (!view.head) continue;
            const name = view.fighter.body.inputs.name;
            aimAtHead(index, { turn: 0.45, distance: 0.85 });
            shots.push(await jpeg(`face-hair-${name}${mode ? `-${mode}` : ''}`, [380, 40, 520, 600]));
            aimAtHead(index, { turn: 2.3, distance: 0.95 });
            shots.push(await jpeg(`face-hair-${name}-back${mode ? `-${mode}` : ''}`, [380, 40, 520, 600]));
          }
        }
        return { shots };
      }
      if (verb === 'styles') {
        // `styles[:tag[:style,style]]`: each style's man and woman, front, three-quarter and back, and the head's triangles.
        const shots = [];
        const triangles = {};
        for (const style of extra ? extra.split(',') : ALL_STYLES) {
          await window.__looks.stage(`face-style-${style}`);
          window.boxer.state.views.forEach((view, index) => armsDown(index));
          playHair(90);
          for (const [index, view] of window.boxer.state.views.entries()) {
            if (!view.head) continue;
            const name = view.fighter.body.inputs.name;
            triangles[name] = { head: headTriangles(index).triangles, hair: hairTriangles(index) };
            for (const [turn, label] of [[0.12, 'front'], [0.8, 'q'], [Math.PI - 0.2, 'back']]) {
              aimAtHead(index, { turn, distance: 1.15, pitch: 0.08 });
              window.boxer.scene.orbit.target.y -= 0.06;
              window.boxer.playFrames(1);
              shots.push(await jpeg(`style-${name}-${label}${mode ? `-${mode}` : ''}`, [400, 40, 480, 640]));
            }
          }
        }
        return { shots, triangles };
      }
      if (verb === 'hairdebug') {
        // `hairdebug::style`: each fighter's hair chains, root and tip, rest (head space) against simulated (brought back).
        await window.__looks.stage(`face-style-${extra}`);
        const track = [];
        for (let frame = 0; frame < 30; frame += 1) {
          playHair(1);
          track.push(window.boxer.state.views.map((view) => {
            const chain = view.head.hairSwing?.chains[0];
            if (!chain) return null;
            const p = new THREE.Vector3().fromArray(chain.world, (chain.count - 1) * 3).applyMatrix4(view.head.group.matrixWorld.clone().invert());
            return p.toArray().map((v) => v.toFixed(3)).join(',');
          }).join(' | '));
        }
        return {
          track,
          views: window.boxer.state.views.map((view) => {
            const swing = view.head.hairSwing;
            const inverse = view.head.group.matrixWorld.clone().invert();
            const scale = new THREE.Vector3().setFromMatrixScale(view.head.group.matrixWorld);
            return {
              name: view.fighter.body.inputs.name, scale: scale.toArray().map((v) => v.toFixed(3)),
              chains: (swing?.chains ?? []).map((chain) => {
                const tip = (chain.count - 1) * 3;
                const now = new THREE.Vector3().fromArray(chain.world, tip).applyMatrix4(inverse);
                const restWorld = new THREE.Vector3().fromArray(chain.rest, tip).applyMatrix4(view.head.group.matrixWorld);
                const colliders = (swing.colliders ?? []).map((c) => {
                  const axis = c.b.clone().sub(c.a);
                  const t = Math.max(0, Math.min(1, restWorld.clone().sub(c.a).dot(axis) / (axis.lengthSq() || 1)));
                  return `${c.part ?? 'head'}:${(c.a.clone().addScaledVector(axis, t).distanceTo(restWorld) - c.radius).toFixed(3)}`;
                });
                return { rest: [...chain.rest.slice(tip, tip + 3)].map((v) => v.toFixed(3)), now: now.toArray().map((v) => v.toFixed(3)), length: chain.length.toFixed(3), colliders };
              }),
            };
          }),
        };
      }
      if (verb === 'helmet') {
        await window.__looks.stage('face-style-helmet');
        window.boxer.state.views.forEach((view, index) => armsDown(index));
        playHair(90);
        const shots = [];
        const triangles = {};
        for (const [index, view] of window.boxer.state.views.entries()) {
          const name = view.fighter.body.inputs.name;
          triangles[name] = { head: headTriangles(index).triangles, hair: hairTriangles(index) };
          for (const [turn, label] of [[0.8, 'q'], [Math.PI - 0.3, 'back']]) {
            aimAtHead(index, { turn, distance: 1.25, pitch: 0.08 });
            window.boxer.scene.orbit.target.y -= 0.08;
            window.boxer.playFrames(1);
            shots.push(await jpeg(`style-${name}-${label}${mode ? `-${mode}` : ''}`, [400, 40, 480, 640]));
          }
        }
        return { shots, triangles };
      }
      if (verb === 'motion') {
        // `motion:tag:style[,style]`: the woman of each style turned on the spot (a quick 150° turn: the hair left behind, then
        // swinging after) and run forward (a bob each stride); physics frozen, the body moved by hand, the hair simulated.
        const shots = [];
        for (const style of (extra ?? 'long').split(',')) {
          for (const kind of ['turn', 'run']) {
            await window.__looks.stage(`face-style-${style}`);
            const views = window.boxer.state.views;
            const index = views.findIndex((view) => view.fighter.body.inputs.name === `f-${style}`);
            const fighter = views[index].fighter;
            armsDown(index);
            playHair(90);
            const rest = Float32Array.from(fighter.x);
            const count = rest.length / 3;
            let cx = 0;
            let cz = 0;
            for (let p = 0; p < count; p += 1) { cx += rest[p * 3] / count; cz += rest[p * 3 + 2] / count; }
            const head = views[index].head.group;
            const startAt = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
            const facing = new THREE.Vector3().setFromMatrixColumn(head.matrixWorld, 0).setY(0).normalize();
            const yaw0 = Math.atan2(facing.z, facing.x);
            const pose = (t) => {
              // Turn: 0 to 150° in 0.3 s (eased), then held. Run: 4 m/s forward, bobbing 3 cm, 2.6 strides a second.
              const u = Math.min(1, t / 0.3);
              const angle = kind === 'turn' ? -2.6 * u * u * (3 - 2 * u) : 0;
              const ahead = kind === 'run' ? 4 * t : 0;
              const bob = kind === 'run' ? 0.03 * Math.abs(Math.sin(t * Math.PI * 2.6)) : 0;
              const [c, s] = [Math.cos(angle), Math.sin(angle)];
              for (let p = 0; p < count; p += 1) {
                const x = rest[p * 3] - cx;
                const z = rest[p * 3 + 2] - cz;
                fighter.x[p * 3] = cx + c * x - s * z + facing.x * ahead;
                fighter.x[p * 3 + 1] = rest[p * 3 + 1] + bob;
                fighter.x[p * 3 + 2] = cz + s * x + c * z + facing.z * ahead;
              }
              return ahead;
            };
            let t = 0;
            for (const mark of kind === 'turn' ? [0.15, 0.3, 0.45, 0.7, 1.2] : [0.2, 0.45, 0.8]) {
              while (t < mark) {
                t += 1 / 60;
                pose(t);
                playHair(1);
              }
              const ahead = pose(t);
              const scene = window.boxer.scene;
              scene.orbit.target.set(startAt.x + facing.x * ahead, startAt.y - 0.12, startAt.z + facing.z * ahead);
              Object.assign(scene.orbit, { yaw: yaw0 + (kind === 'turn' ? 0.6 : Math.PI / 2), pitch: 0.06, distance: 1.5 });
              scene.camera.fov = 30;
              scene.camera.updateProjectionMatrix();
              shots.push(await jpeg(`motion-${style}-${kind}-${Math.round(mark * 100)}${mode ? `-${mode}` : ''}`, [400, 40, 480, 640]));
              t += 1 / 60;
            }
          }
        }
        return { shots };
      }
      if (verb === 'lum') {
        // The face's lit luminance against the chest's, both in the same frame (cheeks and forehead; the chest's front).
        await window.__looks.stage(mode);
        const tag = extra;
        const scene = window.boxer.scene;
        const out = [];
        const shots = [];
        for (const index of [0, 1]) {
          const view = window.boxer.state.views[index];
          const fighter = view.fighter;
          const r = fighter.body.lengths.headRadius;
          const head = view.head.group;
          head.updateMatrixWorld(true);
          const forward = new THREE.Vector3().setFromMatrixColumn(head.matrixWorld, 0).setY(0).normalize();
          const at = (particle) => new THREE.Vector3(fighter.x[particle * 3], fighter.x[particle * 3 + 1], fighter.x[particle * 3 + 2]);
          const chest = at(1).lerp(at(8), 0.3).addScaledVector(forward, 0.13);
          const headAt = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
          scene.orbit.target.copy(headAt.clone().lerp(chest, 0.5));
          scene.orbit.yaw = Math.atan2(forward.z, forward.x) + 0.25;
          Object.assign(scene.orbit, { pitch: 0.05, distance: 1.5 });
          scene.camera.fov = 34;
          scene.camera.updateProjectionMatrix();
          window.boxer.state.paused = true;
          window.boxer.playFrames(1);
          await texturesIn();
          const shot = await window.__looks.capture('lum', { save: false });
          const image = new Image();
          await new Promise((resolve) => { image.onload = resolve; image.src = shot.dataUrl; });
          const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
          const paint = canvas.getContext('2d');
          paint.drawImage(image, 0, 0);
          shots.push({ name: `face-lum-${mode}-${index}-${tag}`, dataUrl: canvas.toDataURL('image/jpeg', 0.9) });
          scene.camera.updateMatrixWorld();
          const sample = (world) => {
            const p = world.clone().project(scene.camera);
            const x = Math.round(((p.x + 1) / 2) * image.width);
            const y = Math.round(((1 - p.y) / 2) * image.height);
            const { data } = paint.getImageData(x - 4, y - 4, 9, 9);
            let sum = 0;
            for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
            return { x, y, lum: sum / (data.length / 4) };
          };
          const local = (x, y, z) => new THREE.Vector3(x * r, y * r, z * r).applyMatrix4(head.matrixWorld);
          const face = [local(0.8, -0.32, 0.3), local(0.8, -0.32, -0.3), local(0.88, 0.32, 0)].map(sample);
          const body = sample(chest);
          const faceLum = face.reduce((sum, point) => sum + point.lum, 0) / face.length;
          out.push({ name: fighter.body.inputs.name, face: Math.round(faceLum), chest: Math.round(body.lum), ratio: Math.round((faceLum / body.lum) * 100) / 100, points: [...face, body] });
        }
        return { lum: out, shots };
      }
      if (verb === 'casts') {
        await window.__looks.stage(mode);
        return { casts: window.boxer.state.views.map((view) => { let m = null; view.head?.group.traverse((o) => { if (o.material?.userData?.photoFace) m = o.material; }); return { name: view.fighter.body.inputs.name, face: m?.userData.photoFace, colour: m?.color.getHexString(), type: m?.type, bodySkin: view.fighter.body.inputs.look?.skinTone }; }) };
      }
      if (verb === 'uni') {
        // Zero one shader setting at a time on the first fighter's face (finding what paints what).
        await window.__looks.stage(mode);
        const shots = [];
        for (const setting of ['none', ...extra.split(',')]) {
          window.boxer.scene.scene.traverse((o) => {
            const u = o.material?.userData?.scalp;
            if (u && u[setting]) u[setting].value = 0;
          });
          aimAtHead(0);
          shots.push(await jpeg(`uni-${setting}`, [500, 150, 300, 300]));
        }
        return { shots };
      }
      if (verb === 'fill') {
        // Set the photo faces' fill (ambient scale) on the heads in the scene now, and for the next ones.
        const value = Number(mode);
        window.__photoFaces.fill?.(value);
        return { fill: value };
      }
      if (verb === 'shots') {
        const scene = mode;
        const tag = extra;
        await window.__looks.stage(scene);
        const shots = [await jpeg(`${scene}-wide-${tag}`)];
        for (const index of SCENES[scene]?.portraits ?? []) {
          aimAtHead(index);
          shots.push(await jpeg(`${scene}-portrait${index}-${tag}`));
          aimAtHead(index, { turn: 1.25, distance: 0.85 });
          shots.push(await jpeg(`${scene}-profile${index}-${tag}`));
        }
        return { fighters: faceIds(), heads: window.boxer.state.views.slice(0, 2).map((_, index) => headTriangles(index)), faces: window.__photoFaces.stats(), shots };
      }
      if (verb === 'crowd') {
        const tag = extra;
        await window.__looks.stage(mode);
        const shots = [await jpeg(`${mode}-wide-${tag}`)];
        const scene = window.boxer.scene;
        const lead = window.boxer.state.views[0];
        const at = new THREE.Vector3().setFromMatrixPosition(lead.head.group.matrixWorld);
        scene.orbit.target.set(at.x, at.y - 0.3, at.z);
        Object.assign(scene.orbit, { distance: 4.5, pitch: 0.12 });
        scene.camera.fov = 40;
        scene.camera.updateProjectionMatrix();
        window.boxer.playFrames(1);
        shots.push(await jpeg(`${mode}-close-${tag}`));
        return { fighters: window.boxer.state.views.length, faces: window.__photoFaces.stats(), shots };
      }
      if (verb === 'blink') {
        await window.__looks.stage(mode);
        const head = window.boxer.state.views[0].head;
        aimAtHead(0, { turn: 0.1, distance: 0.6 });
        let lid = null;
        head.group.traverse((object) => { if (object.material?.userData?.lid) lid = object.material.userData.lid; });
        const shots = [];
        for (const value of [0, 0.5, 1]) {
          head.update = () => {};
          lid.value = value;
          shots.push(await jpeg(`face-blink-${value * 100}`, [380, 40, 520, 600]));
        }
        return { shots };
      }
      if (verb === 'materials') {
        await window.__looks.stage(mode);
        const head = window.boxer.state.views[0].head.group;
        const skull = head.children.find((child) => child.material?.userData?.photoFace);
        const ours = skull.material;
        const skin = ours.color.clone().multiplyScalar(0.8);
        const make = {
          ours: () => ours,
          noNormal: () => { const m = ours.clone(); m.normalMap = null; m.onBeforeCompile = ours.onBeforeCompile; return m; },
          plainStandard: () => new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 }),
          plainLambert: () => new THREE.MeshLambertMaterial({ color: skin }),
        };
        const shots = [];
        for (const [name, build] of Object.entries(make)) {
          const material = build();
          skull.material = material;
          aimAtHead(0, { turn: 0.2 });
          shots.push(await jpeg(`mat-${name}`, [380, 40, 520, 600]));
        }
        skull.material = ours;
        return { shots, skin: skin.getHexString(), body: window.boxer.state.views[0].skinMesh.material.type };
      }
      if (verb === 'stats') {
        await window.__looks.stage(mode);
        await texturesIn();
        const result = await window.__looks.stats(Number(extra ?? 240));
        return { frameMs: result.frameMs, renderMs: result.renderMs, triangles: result.triangles, drawCalls: result.drawCalls, textures: result.textures, faces: window.__photoFaces.stats() };
      }
      throw new Error(`unknown step ${step}`);
    },
  };
})();
