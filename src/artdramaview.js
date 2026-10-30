// The weapon art's drama (artdrama.js) on the page: the camera pushed in, tilted and shaken; the gleam on the steel and the
// trail behind the striking part (in the scene); the burst at contact (weaponview.js's sparks and blood, a dust of its own);
// the glare and the art's name (layers over the stage); its sound and buzz.

/* global THREE */

import { P } from './body.js';
import { ARTDRAMA } from './artdrama.js';
import { hitFeelMistTexture } from './hitfeelview.js';
import { MOVES } from './moves.js';
import { bladeFor, point } from './physics.js';
import { strikeSpan } from './physics/arts.js';
import { spawnBlood, spawnSparks } from './weaponview.js';

export const ARTDRAMA_VIEW = {
  // The trail's colour (added to the scene's light: pale steel, a little warm), and its brightest.
  trail: '#fff1dc',
  trailPeak: 0.42,
  // The gleam's colour: sunlight off polished steel.
  gleam: '#fff6e6',
  // The dust's colour: dry earth and sweat in the scene's light; how fast it leaves the struck place (m/s), how much it swells.
  dust: '#bfb19a',
  dustDrift: 0.9,
  dustSwell: 2.2,
  dustSeconds: 0.55,
  mostDust: 10,
};

/** A star of glare: a hot core and four thin rays (the way a camera sees a point of light on steel), drawn once. */
function artGleamTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const centre = size / 2;
  const core = context.createRadialGradient(centre, centre, 0, centre, centre, centre * 0.45);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = core;
  context.fillRect(0, 0, size, size);
  context.globalCompositeOperation = 'lighter';
  for (const [w, h] of [[size, 3], [3, size], [size * 0.55, 2], [2, size * 0.55]]) {
    const ray = context.createRadialGradient(centre, centre, 0, centre, centre, Math.max(w, h) / 2);
    ray.addColorStop(0, 'rgba(255,255,255,0.95)');
    ray.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = ray;
    context.fillRect(centre - w / 2, centre - h / 2, w, h);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The view of the drama in `view` (render.js's scene). `layers`: { flash, caption } (elements over the stage, or null).
 * felt(result, world) with what hear() returned; apply(drama, now, dt, world, { camera }) each frame after the camera is placed
 * (`camera`: whether this camera is the player's to move); reset().
 */
export function createArtDramaView(view, { flash = null, caption = null, audio = null, vibrate = null } = {}) {
  let gleamTexture = null;
  let dustTexture = null;
  let gleam = null;
  const dust = [];
  const shaken = [0, 0, 0];
  const forward = new THREE.Vector3();
  let rolled = 0;
  const leftAt = new THREE.Quaternion();
  let world = null;
  // The trail: samples of the striking part ({ time, a: [x,y,z], b: [x,y,z], speed }), and its ribbon.
  const samples = [];
  let ribbon = null;

  function ribbonMesh() {
    if (ribbon) return ribbon;
    const most = ARTDRAMA.trail.samples;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(most * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(most * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const index = [];
    for (let at = 0; at < most - 1; at += 1) {
      const a = at * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    // Added light, both faces, no depth written: a streak in the air, behind what stands before it.
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    ribbon = new THREE.Mesh(geometry, material);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 6;
    ribbon.userData.seeThrough = false;
    ribbon.visible = false;
    view.scene.add(ribbon);
    return ribbon;
  }

  function gleamSprite() {
    if (gleam) return gleam;
    gleamTexture ??= artGleamTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: gleamTexture, color: new THREE.Color(ARTDRAMA_VIEW.gleam), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
    sprite.renderOrder = 7;
    sprite.userData.seeThrough = false;
    sprite.visible = false;
    view.scene.add(sprite);
    gleam = { sprite, age: 0, life: 1, size: 0, fighter: null, weapon: null };
    return gleam;
  }

  function dustPuff() {
    if (dust.length >= ARTDRAMA_VIEW.mostDust) return dust.reduce((oldest, puff) => (puff.age / puff.life > oldest.age / oldest.life ? puff : oldest));
    dustTexture ??= hitFeelMistTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dustTexture, color: new THREE.Color(ARTDRAMA_VIEW.dust), transparent: true, depthWrite: false, opacity: 0 }));
    sprite.renderOrder = 5;
    sprite.userData.seeThrough = false;
    view.scene.add(sprite);
    const puff = { sprite, age: 0, life: 1, size: 0, opacity: 0, velocity: new THREE.Vector3() };
    dust.push(puff);
    return puff;
  }

  /** The striking part's two ends now ([near, far] world points), or null. */
  function strikingPart(fighter, art) {
    const weapon = bladeFor(fighter, MOVES[art]);
    if (!weapon?.held || !weapon.dir) return null;
    const hand = point(fighter.x, P[`${weapon.main}Hand`]);
    const stroke = fighter.punch?.type === art ? fighter.punch : null;
    const [from, to] = strikeSpan(weapon, stroke);
    // A thrust's line is along its own path and would draw no ribbon: its last third only, the tip's streak.
    const near = stroke?.spec.mode === 'thrust' && !stroke.spec.hilt ? from + (to - from) * 0.66 : from;
    const at = (s) => [hand[0] + weapon.dir[0] * s, hand[1] + weapon.dir[1] * s, hand[2] + weapon.dir[2] * s];
    return [at(near), at(to)];
  }

  /** What hear() asked for at once: the gleam, the burst, the sound and the buzz. */
  function felt(result, currentWorld) {
    if (!result) return;
    world = currentWorld;
    if (result.vibrate > 0) vibrate?.(result.vibrate);
    if (result.kind === 'start') {
      const fighter = currentWorld.fighters[result.fighter];
      const weapon = fighter && bladeFor(fighter, MOVES[result.art]);
      // (The steel's ring for an edge drawn: a weapon that cuts on its swing, not a hammer's or a club's head.)
      audio?.art?.('draw', result.draw, { blade: (weapon?.spec.harm?.swing?.cut ?? 0) > 0.5 });
      const shine = gleamSprite();
      shine.age = 0;
      shine.life = result.gleam.seconds;
      shine.size = result.gleam.size;
      shine.fighter = fighter ?? null;
      shine.art = result.art;
      shine.sprite.visible = Boolean(fighter);
      samples.length = 0;
      return;
    }
    audio?.art?.('impact', result.impact, { strength: result.strength, metal: result.metal });
    if (result.sparks > 0) spawnSparks(view, result.point, result.sparks);
    if (result.blood) spawnBlood(view, result.point, result.normal, result.blood.count, result.blood.speed);
    if (result.dust) {
      for (let index = 0; index < result.dust.count; index += 1) {
        const puff = dustPuff();
        puff.sprite.position.set(result.point[0], result.point[1], result.point[2]);
        const spread = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6 - 0.1, Math.random() - 0.5).multiplyScalar(0.8);
        puff.velocity.set(result.normal[0], result.normal[1], result.normal[2]).add(spread).normalize().multiplyScalar(ARTDRAMA_VIEW.dustDrift * (0.5 + Math.random() * 0.8) * (0.6 + result.strength));
        puff.age = 0;
        puff.life = ARTDRAMA_VIEW.dustSeconds * (0.7 + Math.random() * 0.6);
        puff.size = result.dust.size * (0.6 + Math.random() * 0.6);
        puff.opacity = Math.min(0.65, 0.35 + 0.3 * result.strength);
        puff.sprite.visible = true;
      }
    }
  }

  /** The trail: the striking part sampled while the art is made, its ribbon faded by age and lit by speed. */
  function drawTrail(drama, currentWorld) {
    const active = drama.active;
    const fighter = active && currentWorld?.fighters[active.fighter];
    const spec = ARTDRAMA.trail;
    if (fighter && fighter.punch?.type === active.art) {
      const ends = strikingPart(fighter, active.art);
      const last = samples[samples.length - 1];
      if (ends && (!last || currentWorld.time > last.time + 1e-4)) {
        const speed = last ? Math.hypot(ends[1][0] - last.b[0], ends[1][1] - last.b[1], ends[1][2] - last.b[2]) / (currentWorld.time - last.time) : 0;
        samples.push({ time: currentWorld.time, a: ends[0], b: ends[1], speed });
        while (samples.length > spec.samples) samples.shift();
      }
    }
    const now = currentWorld?.time ?? 0;
    while (samples.length && now - samples[0].time > spec.seconds) samples.shift();
    const mesh = samples.length >= 2 ? ribbonMesh() : ribbon;
    if (!mesh) return;
    mesh.visible = samples.length >= 2;
    if (!mesh.visible) return;
    const positions = mesh.geometry.attributes.position.array;
    const colors = mesh.geometry.attributes.color.array;
    const tint = new THREE.Color(ARTDRAMA_VIEW.trail);
    for (let index = 0; index < spec.samples; index += 1) {
      const sample = samples[Math.min(index, samples.length - 1)];
      const fresh = index < samples.length ? 1 - (now - sample.time) / spec.seconds : 0;
      const lit = ARTDRAMA_VIEW.trailPeak * Math.max(0, fresh) ** 1.5 * Math.min(1, sample.speed / spec.fast);
      for (const [end, point3] of [[0, sample.a], [1, sample.b]]) {
        const at = (index * 2 + end) * 3;
        positions[at] = point3[0];
        positions[at + 1] = point3[1];
        positions[at + 2] = point3[2];
        // Brighter toward the far end, where the steel moves fastest.
        const share = lit * (end ? 1 : 0.12);
        colors[at] = tint.r * share;
        colors[at + 1] = tint.g * share;
        colors[at + 2] = tint.b * share;
      }
    }
    mesh.geometry.attributes.position.needsUpdate = true;
    mesh.geometry.attributes.color.needsUpdate = true;
    mesh.geometry.setDrawRange(0, (samples.length - 1) * 6);
  }

  function apply(drama, now, dt, currentWorld, { camera: moveCamera = true } = {}) {
    if (currentWorld !== world) {
      if (world) reset(drama);
      world = currentWorld;
    }
    const camera = view.camera;
    // The tilt left last frame is taken off again if nothing has turned the camera since (it is placed afresh most frames).
    if (rolled && camera.quaternion.equals(leftAt)) camera.rotateZ(-rolled);
    rolled = 0;
    if (moveCamera && drama.busy(now)) {
      const share = drama.push(now);
      if (share > 0 && view.orbit?.target) {
        camera.getWorldDirection(forward);
        const reach = camera.position.distanceTo(view.orbit.target);
        camera.position.addScaledVector(forward, reach * share);
      }
      drama.shake(now, shaken);
      camera.position.x += shaken[0];
      camera.position.y += shaken[1];
      camera.position.z += shaken[2];
      const roll = drama.roll(now);
      if (roll) {
        camera.rotateZ(roll);
        rolled = roll;
        leftAt.copy(camera.quaternion);
      }
    }
    if (flash) {
      const glare = drama.flash(now);
      const shown = glare > 0.003 ? glare.toFixed(3) : '0';
      if (flash.style.opacity !== shown) flash.style.opacity = shown;
    }
    if (caption) {
      const line = drama.caption(now);
      if (line) {
        if (caption.textContent !== line.text) caption.textContent = line.text;
        caption.hidden = false;
        caption.style.opacity = line.opacity.toFixed(3);
      } else if (!caption.hidden) caption.hidden = true;
    }
    if (gleam?.sprite.visible) {
      gleam.age += dt;
      const t = gleam.age / gleam.life;
      const ends = gleam.fighter && strikingPart(gleam.fighter, gleam.art);
      if (t >= 1 || !ends) gleam.sprite.visible = false;
      else {
        // On the steel two-thirds of the way out, where the light catches the flat; up quick, gone slower.
        gleam.sprite.position.set(ends[0][0] + (ends[1][0] - ends[0][0]) * 0.66, ends[0][1] + (ends[1][1] - ends[0][1]) * 0.66, ends[0][2] + (ends[1][2] - ends[0][2]) * 0.66);
        const swell = Math.sin(Math.min(1, t / 0.3) * Math.PI * 0.5);
        gleam.sprite.scale.setScalar(gleam.size * (0.3 + 0.7 * swell));
        gleam.sprite.material.opacity = Math.min(1, t / 0.08) * (1 - t) ** 1.2;
        gleam.sprite.material.rotation = t * 0.6;
      }
    }
    for (const puff of dust) {
      if (!puff.sprite.visible) continue;
      puff.age += dt;
      const t = puff.age / puff.life;
      if (t >= 1) {
        puff.sprite.visible = false;
        continue;
      }
      puff.sprite.position.addScaledVector(puff.velocity, dt);
      puff.velocity.multiplyScalar(Math.exp(-dt * 4));
      puff.velocity.y -= dt * 0.3;
      puff.sprite.scale.setScalar(puff.size * (1 + ARTDRAMA_VIEW.dustSwell * (1 - (1 - t) ** 2)));
      puff.sprite.material.opacity = puff.opacity * Math.min(1, t / 0.06) * (1 - t) ** 1.6;
    }
    drawTrail(drama, currentWorld);
  }

  function reset(drama = null) {
    drama?.reset();
    samples.length = 0;
    if (ribbon) ribbon.visible = false;
    if (gleam) gleam.sprite.visible = false;
    for (const puff of dust) puff.sprite.visible = false;
    if (flash) flash.style.opacity = '0';
    if (caption) caption.hidden = true;
  }

  return { felt, apply, reset };
}
