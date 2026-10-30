// The hit feel (hitfeel.js) on the page: the camera's jolt and narrowing, the
// mist off a struck place (soft sprites in the scene, behind what stands before
// them), the dark edges (one layer over the stage), the vibration and the thump.

/* global THREE */

import { HITFEEL } from './hitfeel.js';

export const HITFEEL_VIEW = {
  // The mist's colour: a warm pale grey, sweat and dust in the scene's light (not a white flash).
  mist: '#cbc2b4',
  // How fast (m/s) the mist leaves the struck place, outward, and how much it swells over its life.
  drift: 0.45,
  swell: 1.8,
  // The most mists at once (each a sprite; old ones are reused).
  most: 6,
};

/** A soft round puff (a radial fade), drawn once. */
export function hitFeelMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * The view of the feel in `view` (render.js's scene), its dark edges on `layer` (an element over the stage, or null).
 * apply(feel, now, dt) each frame after the camera is placed; felt(result) with what hear() returned; reset().
 */
export function createHitFeelView(view, { layer = null, audio = null, vibrate = null } = {}) {
  let texture = null;
  const mists = [];
  const jolt = [0, 0, 0];
  let narrowed = 0;

  function mistSprite() {
    texture ??= hitFeelMistTexture();
    if (mists.length >= HITFEEL_VIEW.most) return mists.reduce((oldest, mist) => (mist.age / mist.life > oldest.age / oldest.life ? mist : oldest));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: new THREE.Color(HITFEEL_VIEW.mist), transparent: true, depthWrite: false, opacity: 0 }));
    sprite.renderOrder = 5;
    sprite.userData.seeThrough = false;
    view.scene.add(sprite);
    const mist = { sprite, age: 0, life: 1, size: 0, opacity: 0, velocity: new THREE.Vector3() };
    mists.push(mist);
    return mist;
  }

  /** What hear() asked for at once: the vibration, the thump, the mist. */
  function felt(result) {
    if (!result) return;
    if (result.vibrate > 0) vibrate?.(result.vibrate);
    if (result.thump > 0) audio?.thump?.(result.thump, result.strength);
    if (result.puff) {
      const mist = mistSprite();
      const { point, normal } = result.puff;
      mist.sprite.position.set(point[0], point[1], point[2]);
      mist.velocity.set(normal[0], normal[1], normal[2]).multiplyScalar(HITFEEL_VIEW.drift);
      mist.age = 0;
      mist.life = result.puff.seconds;
      mist.size = result.puff.size;
      mist.opacity = result.puff.opacity;
      mist.sprite.visible = true;
    }
  }

  function apply(feel, now, dt) {
    const camera = view.camera;
    feel.offset(now, jolt);
    camera.position.x += jolt[0];
    camera.position.y += jolt[1];
    camera.position.z += jolt[2];
    // The view narrowed, as a zoom (nothing else in the game zooms the lens: its fov is left to the cameras that own it).
    const narrow = feel.fov(now);
    if (narrow !== narrowed) {
      const half = (camera.fov * Math.PI) / 360;
      camera.zoom = narrow > 0 ? Math.tan(half) / Math.tan(half - (narrow * Math.PI) / 360) : 1;
      narrowed = narrow;
      camera.updateProjectionMatrix();
    }
    if (layer) {
      const dark = feel.vignette(now);
      const shown = dark > 0.003 ? dark.toFixed(3) : '0';
      if (layer.style.opacity !== shown) layer.style.opacity = shown;
    }
    for (const mist of mists) {
      if (!mist.sprite.visible) continue;
      mist.age += dt;
      const t = mist.age / mist.life;
      if (t >= 1) {
        mist.sprite.visible = false;
        continue;
      }
      mist.sprite.position.addScaledVector(mist.velocity, dt);
      mist.velocity.multiplyScalar(Math.exp(-dt * 6));
      mist.sprite.scale.setScalar(mist.size * (1 + HITFEEL_VIEW.swell * (1 - (1 - t) ** 2)));
      // Quickly in, slowly gone.
      mist.sprite.material.opacity = mist.opacity * Math.min(1, t / 0.08) * (1 - t) ** 1.5;
    }
  }

  function reset() {
    for (const mist of mists) mist.sprite.visible = false;
    if (narrowed) {
      view.camera.zoom = 1;
      narrowed = 0;
      view.camera.updateProjectionMatrix();
    }
    if (layer) layer.style.opacity = '0';
  }

  return { felt, apply, reset, spec: HITFEEL };
}

/**
 * The Hit feel section of the settings (in the mixer's style): each effect a switch and an intensity slider, saved as they change
 * (`save()`). `settings` is hitfeel.js's (changed in place: the fight reads it as it goes).
 */
export function hitFeelPanel(settings, save) {
  const section = document.createElement('section');
  section.className = 'audio-mixer hit-feel';
  section.setAttribute('aria-label', 'Hit feel');
  const title = document.createElement('h2');
  title.textContent = 'Hit feel';
  section.append(title);
  for (const [name, spec] of Object.entries(HITFEEL.effects)) {
    const value = settings[name];
    if (!value) continue;
    const row = document.createElement('div');
    row.className = 'mixer-row hit-feel-row';
    const words = document.createElement('label');
    words.className = 'hit-feel-switch';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = value.on;
    box.dataset.hitfeel = name;
    const label = document.createElement('span');
    label.textContent = spec.label;
    label.title = spec.note;
    words.append(box, label);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '200';
    slider.step = '5';
    slider.value = String(Math.round(value.intensity * 100));
    slider.dataset.hitfeelIntensity = name;
    slider.setAttribute('aria-label', `${spec.label} intensity`);
    slider.disabled = !value.on;
    const shown = document.createElement('output');
    shown.textContent = `${slider.value}%`;
    box.addEventListener('change', () => {
      value.on = box.checked;
      slider.disabled = !box.checked;
      save();
    });
    slider.addEventListener('input', () => {
      value.intensity = Number(slider.value) / 100;
      shown.textContent = `${slider.value}%`;
      save();
    });
    row.append(words, slider, shown);
    section.append(row);
  }
  const note = document.createElement('p');
  note.className = 'hit-feel-note';
  note.textContent = 'How your blows land, each scaled by the blow itself. To try some alone: #hitfeel=kick,thump at the end of the address (or all, none).';
  section.append(note);
  return section;
}
