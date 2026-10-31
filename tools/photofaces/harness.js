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
      bench ??= await import('/src/looksbench.js');
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
          }
        }
        return { shots, faces: window.__photoFaces.stats() };
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
