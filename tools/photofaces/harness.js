// Page side of the photo-face shots: injected by drive.mjs into the game page (served by tools/serve.py).
(() => {
  const SCENES = {
    'face-ring': {
      about: 'Two bare-headed fighters in the ring.',
      place: 'ring', seed: 3, frames: 50, distance: 2.0,
      red: [{ preset: 'amateur' }], blue: [{ preset: 'taichi' }],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      portraits: [0, 1],
    },
    'face-ring2': {
      about: 'Two bare-headed women in the ring.',
      place: 'ring', seed: 5, frames: 20, distance: 2.4,
      red: [{ preset: 'contender' }], blue: [{ preset: 'revolver' }],
      camera: { focus: { centre: true, height: 1.25 }, yaw: 1.25, pitch: 0.1, distance: 4.4, fov: 40 },
      portraits: [0, 1],
    },
    'face-brawl': {
      about: 'A brawl of twenty bare heads in the field: the crowd drawing (all but the two leads baked).',
      place: 'field', seed: 6, frames: 40,
      red: ['amateur', 'street', 'passive', 'mix', 'light', 'unskilled', 'veteran', 'bat', 'longbow', 'spear'].map((preset) => ({ preset })),
      blue: ['taichi', 'taekwondo', 'knife', 'staff', 'contender', 'sumo', 'wuxia', 'revolver', 'mingDao', 'mingSpear'].map((preset) => ({ preset })),
      camera: { focus: { centre: true, height: 1.0 }, yaw: 0.9, pitch: 0.2, distance: 11, fov: 40 },
    },
    'face-helmet': {
      about: 'Helmeted: a legionary and a samurai in the Colosseum.',
      place: 'colosseum', seed: 11, frames: 60, distance: 2.3,
      red: [{ preset: 'legionary' }], blue: [{ preset: 'samurai' }],
      camera: { focus: { centre: true, height: 1.3 }, yaw: 1.3, pitch: 0.05, distance: 4.6, fov: 42 },
      portraits: [0, 1],
    },
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let bench = null;

  async function jpeg(name) {
    const shot = await window.__looks.capture(name, { save: false });
    const image = new Image();
    await new Promise((resolve) => { image.onload = resolve; image.src = shot.dataUrl; });
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    canvas.getContext('2d').drawImage(image, 0, 0);
    return { name, dataUrl: canvas.toDataURL('image/jpeg', 0.9) };
  }

  function headOf(index) {
    const view = window.boxer.state.views[index];
    const matrix = view.head.group.matrixWorld.elements;
    const forward = [matrix[0], matrix[1], matrix[2]];
    const length = Math.hypot(...forward);
    return { at: [matrix[12], matrix[13], matrix[14]], forward: forward.map((value) => value / length), view };
  }

  function aimAtHead(index, { turn = 0.2, distance = 0.8, fov = 28, pitch = 0.04 } = {}) {
    const scene = window.boxer.scene;
    const { at, forward } = headOf(index);
    scene.orbit.target.set(at[0], at[1] + 0.01, at[2]);
    scene.orbit.yaw = Math.atan2(forward[2], forward[0]) + turn;
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
    const counted = new Set();
    window.boxer.state.views[index].head.group.traverseVisible((object) => {
      if (!object.isMesh || object.userData.outline || !object.material?.visible) return;
      const geometry = object.geometry;
      triangles += (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3;
      counted.add(object);
    });
    return { triangles, meshes: counted.size };
  }

  async function setFaces(on) {
    await window.__photoFaces.set(on);
    await sleep(50);
  }

  window.__faceHarness = {
    async run(step) {
      bench ??= await import('/src/looksbench.js');
      Object.assign(bench.COMPARE_SCENES, SCENES);
      const [verb, mode, extra] = step.split(':');
      if (verb === 'faces') {
        await setFaces(mode === 'after');
        return { on: mode === 'after', stats: window.__photoFaces.stats() };
      }
      if (verb === 'probe') {
        await window.__looks.stage(mode);
        return { fighters: faceIds(), heads: window.boxer.state.views.map((_, index) => headTriangles(index)) };
      }
      if (verb === 'shots') {
        const scene = mode;
        const tag = extra;
        await window.__looks.stage(scene);
        const shots = [await jpeg(`${scene}-wide-${tag}`)];
        for (const index of SCENES[scene]?.portraits ?? []) {
          aimAtHead(index);
          window.boxer.state.paused = true;
          shots.push(await jpeg(`${scene}-portrait${index}-${tag}`));
          aimAtHead(index, { turn: 1.25, distance: 0.85 });
          shots.push(await jpeg(`${scene}-profile${index}-${tag}`));
        }
        return { fighters: faceIds(), heads: window.boxer.state.views.slice(0, 4).map((_, index) => headTriangles(index)), shots };
      }
      if (verb === 'materials') {
        await window.__looks.stage(mode);
        const head = window.boxer.state.views[0].head.group;
        const skull = head.children.find((child) => child.material?.userData?.photoFace);
        const standard = skull.material;
        const make = {
          standard: () => standard,
          phong: () => new THREE.MeshPhongMaterial({ map: standard.map, normalMap: standard.normalMap, shininess: 18, specular: 0x222222 }),
          lambert: () => new THREE.MeshLambertMaterial({ map: standard.map }),
          flatStandard: () => new THREE.MeshStandardMaterial({ map: standard.map, roughness: 0.6 }),
        };
        const shots = [];
        for (const [name, build] of Object.entries(make)) {
          const material = build();
          head.traverse((object) => { if (object.isMesh && object.material?.map === standard.map) object.material = material; });
          aimAtHead(0, { turn: 0.2 });
          shots.push(await jpeg(`mat-${name}`));
          head.traverse((object) => { if (object.isMesh && object.material === material) object.material = standard; });
        }
        return { shots };
      }
      if (verb === 'crowd') {
        const tag = extra;
        await window.__looks.stage(mode);
        const shots = [await jpeg(`face-crowd-wide-${tag}`)];
        const scene = window.boxer.scene;
        const views = window.boxer.state.views;
        const lead = views.find((view) => view.head?.group?.visible !== false && !view.machine) ?? views[0];
        const at = new THREE.Vector3().setFromMatrixPosition(lead.head.group.matrixWorld);
        scene.orbit.target.set(at.x, at.y - 0.3, at.z);
        Object.assign(scene.orbit, { distance: 4.5, pitch: 0.12 });
        scene.camera.fov = 40;
        scene.camera.updateProjectionMatrix();
        window.boxer.playFrames(1);
        shots.push(await jpeg(`face-crowd-close-${tag}`));
        return { fighters: views.length, faces: [...new Set(faceIds().map((entry) => entry.face))], shots };
      }
      if (verb === 'stats') {
        await window.__looks.stage(mode);
        const result = await window.__looks.stats(Number(extra ?? 240));
        return { frameMs: result.frameMs, renderMs: result.renderMs, gpuMs: result.gpuMs, triangles: result.triangles, drawCalls: result.drawCalls, textures: result.textures, programs: result.programs, renderer: result.renderer };
      }
      throw new Error(`unknown step ${step}`);
    },
  };
})();
