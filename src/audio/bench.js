// The sound bench: every synth family at a chosen strength and material, from a source dragged round a listener on a top-down circle
// (its azimuth and distance shown: front, back, left and right heard as they are), the reverb of a place (open field, a room, a tunnel,
// a sewer drain, a chapel: the acoustics model fed the probe those places give), the ambience beds one by one, the far field's sectors,
// and the music's cues. Opened from Settings (menu.js), or `boxer.soundBench()`, or ?bench=sound. Browser only, but `measureFamilies`
// (each family rendered offline, its peak and RMS) is how the families were checked without ears.

import { EAR, airCutoff, createListener, earDirection, placeListener } from './ear.js';
import { PROBE_RAYS, roomFromProbe } from './acoustics.js';
import { FAR_FIELD, createSectors } from './farfield.js';
import { MUSIC_CUES } from './music/manifest.js';
import { SOUND_FAMILIES } from './families.js';
import { COVERINGS, STRIKERS } from './sfx/impact.js';
import { SURFACES } from './sfx/step.js';
import { MECHS } from './sfx/world.js';
import { gainOfLevel, sfxVoice } from './synth.js';
import { breathParams, playBreath } from './sfx/voice.js';
import { playWhizz, whizzParams } from './sfx/ranged.js';
import { playUi, uiParams } from './sfx/ui.js';

/** The places of the reverb preview: the 12 distances (m; Infinity: nothing, open; 30: a passage running on under its roof) the probe finds in each (PROBE_RAYS: 8 round, 3 rising, 1 up). */
export const BENCH_PLACES = {
  'Open field': new Array(12).fill(Infinity),
  Room: [2.5, 3.2, 2.5, 3.2, 2.5, 3.2, 2.5, 3.2, 2, 2, 2, 1.4],
  Tunnel: [30, 2.6, 1.8, 2.6, 30, 2.6, 1.8, 2.6, 2.2, 2.2, 2.2, 1.6],
  'Sewer drain': [30, 2.3, 1.7, 2.3, 30, 2.3, 1.7, 2.3, 2.2, 2.2, 2.2, 1.6],
  Chapel: [12, 9, 6, 9, 14, 9, 6, 9, 10, 9, 10, 9],
};
// (The sewer drain's is what the probe gives in the Dunnottar drain, test/audioacoustics.test.js: walls 1.7 m each side, the barrel vault 1.6 m over the head, nothing along it.)

/** Each family's bench event at a strength (0..1) and the pickers' choices. */
export function benchEvent(type, strength, pick) {
  const s = Math.max(0.01, strength);
  const log = (low, high) => low * (high / low) ** s;
  switch (type) {
    case 'hit': return { type, energy: log(2, 600), impulse: log(2, 60), striker: pick.striker, covering: pick.covering, part: pick.part ?? 'trunk', braced: false };
    case 'wound': return { type, kind: pick.wound, severity: s };
    case 'clash': return { type, speed: log(1, 25), a: pick.clashA, b: pick.clashB, slide: pick.slide };
    case 'swing': return { type, speed: log(4, 40), length: pick.length ?? 1, mass: pick.mass ?? 1.3 };
    case 'step': return { type, speed: log(0.5, 8), mass: pick.bodyMass, surface: pick.surface, depth: pick.depth, armour: pick.armour };
    case 'fall': case 'land': return { type, mass: pick.bodyMass, speed: log(0.8, 9), surface: pick.surface, armour: pick.armour, depth: pick.depth };
    case 'voice': return { type, kind: pick.voice, strength: s, size: pick.size, mass: pick.bodyMass };
    case 'horse': return { type, kind: pick.horse, gait: 'trot', speed: log(1, 14), surface: pick.surface, mass: 500 };
    case 'shot': return { type, kind: pick.shot };
    case 'arrowhit': return { type, speed: log(15, 90), covering: pick.covering };
    case 'mech': return { type, kind: pick.mech, state: pick.mechState };
    case 'thunder': return { type, distance: log(5000, 150) };
    default: return { type };
  }
}

/** The bench's presets for the offline check: one event per family (and the voices and the menu's sounds). */
export const MEASURE_PRESETS = [
  ['hit flesh (fist, 60 J)', { type: 'hit', energy: 60, striker: 'fist', covering: 'flesh', part: 'trunk' }],
  ['hit plate (blunt, 300 J)', { type: 'hit', energy: 300, striker: 'blunt', covering: 'plate', part: 'trunk' }],
  ['hit mail (blade, 150 J)', { type: 'hit', energy: 150, striker: 'blade', covering: 'mail', part: 'trunk' }],
  ['hit lamellar', { type: 'hit', energy: 150, striker: 'blade', covering: 'lamellar' }],
  ['hit padded', { type: 'hit', energy: 120, striker: 'blunt', covering: 'padded' }],
  ['hit wood shield', { type: 'hit', energy: 150, striker: 'blade', covering: 'wood' }],
  ['wound cut', { type: 'wound', kind: 'cut', severity: 0.8 }],
  ['wound stab', { type: 'wound', kind: 'stab', severity: 0.8 }],
  ['wound bone', { type: 'wound', kind: 'bone', severity: 0.8 }],
  ['wound crush', { type: 'wound', kind: 'crush', severity: 0.8 }],
  ['clash blade-blade slide', { type: 'clash', speed: 10, a: 'blade', b: 'blade', slide: true }],
  ['clash blade-haft', { type: 'clash', speed: 10, a: 'blade', b: 'haft' }],
  ['swing sword', { type: 'swing', speed: 22, length: 1, mass: 1.3 }],
  ['step stone + plate', { type: 'step', speed: 2, mass: 90, surface: 'stone', armour: 'plate' }],
  ['step water knee-deep', { type: 'step', speed: 2, mass: 80, surface: 'water', depth: 0.5, armour: 'none' }],
  ['step grass + mail', { type: 'step', speed: 1.4, mass: 80, surface: 'grass', armour: 'mail' }],
  ['fall earth + mail', { type: 'fall', mass: 85, speed: 3.5, surface: 'earth', armour: 'mail' }],
  ['land stone', { type: 'land', mass: 80, speed: 4, surface: 'stone', armour: 'none' }],
  ['voice effort', { type: 'voice', kind: 'effort', strength: 0.7, size: 1.8, mass: 85 }],
  ['voice struck', { type: 'voice', kind: 'struck', strength: 0.7, size: 1.8, mass: 85 }],
  ['voice wound (cry)', { type: 'voice', kind: 'wound', strength: 0.9, size: 1.8, mass: 85 }],
  ['voice death', { type: 'voice', kind: 'death', strength: 0.8, size: 1.8, mass: 85 }],
  ['horse hoof stone', { type: 'horse', kind: 'hoof', speed: 4, surface: 'stone', mass: 500 }],
  ['horse snort', { type: 'horse', kind: 'snort', mass: 500 }],
  ['horse neigh', { type: 'horse', kind: 'neigh', mass: 500 }],
  ['shot bow', { type: 'shot', kind: 'bow' }],
  ['shot crossbow', { type: 'shot', kind: 'crossbow' }],
  ['shot matchlock (40 m)', { type: 'shot', kind: 'matchlock' }, 40],
  ['shot cannon (200 m)', { type: 'shot', kind: 'cannon' }, 200],
  ['arrow hit mail', { type: 'arrowhit', speed: 55, covering: 'mail' }],
  ['mech door shut', { type: 'mech', kind: 'door', state: 'closed' }],
  ['mech portcullis', { type: 'mech', kind: 'portcullis', state: 'down' }],
  ['mech lock', { type: 'mech', kind: 'lock' }],
  ['thunder (600 m)', { type: 'thunder', distance: 600 }, 600],
];

/**
 * Render every preset offline (OfflineAudioContext, no speakers) and measure it: [{ name, peak, rms (dBFS), seconds }]. Each is played
 * 2 m from the ear (or its own distance) at its level there, as the engine would, without the room or the panner.
 */
export async function measureFamilies(Offline = globalThis.OfflineAudioContext) {
  const rows = [];
  const rate = 44100;
  const extra = [
    ['breath (spent)', (voice, out, when) => playBreath(voice, out, breathParams(1, 1.8), when, gainOfLevel(breathParams(1, 1.8).level - 6), false)],
    ['arrow whizz', (voice, out, when) => playWhizz(voice, out, whizzParams(55, 1), when, gainOfLevel(whizzParams(55, 1).level))],
    ['ui confirm', (voice, out, when) => playUi(voice, out, uiParams('confirm'), when, 0.8)],
    ['ui victory', (voice, out, when) => playUi(voice, out, uiParams('victory'), when, 0.8)],
  ];
  const jobs = [
    ...MEASURE_PRESETS.map(([name, event, distance = 2]) => [name, (voice, out, when) => {
      const family = SOUND_FAMILIES[event.type];
      const params = family.params(event);
      const mapWide = event.type === 'thunder' || event.kind === 'matchlock' || event.kind === 'cannon';
      const atEar = params.level + 20 * Math.log10(mapWide ? 1 / distance : Math.max(EAR.floor, 1 / distance));
      return family.play(voice, out, params, when, gainOfLevel(atEar));
    }, distance]),
    ...extra,
  ];
  for (const [name, play, distance = 2] of jobs) {
    const seconds = 4;
    const offline = new Offline(1, rate * seconds, rate);
    // The air on the way, as the engine's chain has it.
    const air = offline.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = airCutoff(distance);
    air.connect(offline.destination);
    const voice = sfxVoice(offline, air);
    let error = null;
    try {
      play(voice, air, 0.02);
    } catch (caught) {
      error = caught;
    }
    const buffer = await offline.startRendering();
    const data = buffer.getChannelData(0);
    let peak = 0;
    let sum = 0;
    let last = 0;
    for (let index = 0; index < data.length; index += 1) {
      const value = Math.abs(data[index]);
      if (value > peak) peak = value;
      sum += data[index] * data[index];
      if (value > 1e-4) last = index;
    }
    const rms = Math.sqrt(sum / Math.max(1, last));
    rows.push({ name, peak: 20 * Math.log10(peak || 1e-9), rms: 20 * Math.log10(rms || 1e-9), seconds: last / rate, error: error ? String(error) : null });
  }
  return rows;
}

const make = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};
const options = (values) => values.map((value) => new Option(value, value));

/** Install the bench: `open()` / `close()`; the page's frame keeps running behind it. */
export function installSoundBench(engine) {
  let root = null;
  let loop = 0;
  const listenerAt = createListener();
  // The bench's listener: at the origin, facing -z (the circle's top), the camera's basis as three.js has it.
  const CAMERA = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const pick = { striker: 'blade', covering: 'plate', wound: 'cut', clashA: 'blade', clashB: 'blade', slide: false, surface: 'stone', armour: 'none', depth: 0.3, voice: 'wound', horse: 'hoof', shot: 'bow', mech: 'door', mechState: 'closed', size: 1.78, bodyMass: 80 };
  const source = { x: 2, z: -3 };
  let strength = 0.6;
  let ambience = { rain: false, wind: false, surf: false, thunder: false, crowd: false, market: false, sewer: false };
  const sectorMen = new Array(FAR_FIELD.sectors).fill(0);
  let thunderClock = 0;

  function head() {
    return [0, 1.6, 0];
  }

  function open() {
    if (root) return;
    engine.unlock();
    engine.bench.open(true);
    placeListener(listenerAt, head(), CAMERA);
    engine.bench.listen(head(), CAMERA);
    root = make('div', { className: 'sound-bench', id: 'sound-bench' });
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Sound bench');
    root.append(make('header', { className: 'bench-head' },
      make('button', { type: 'button', className: 'back', textContent: '← Back', onclick: close }),
      make('h1', { textContent: 'Sound bench' }),
      make('p', { className: 'lede', textContent: 'Every sound the game makes, at any strength, from anywhere round you. Headphones for 3-D; Speakers in Settings for stereo.' })));
    const body = make('div', { className: 'bench-body' });
    root.append(body);
    body.append(familiesPanel(), circlePanel(), placesPanel(), ambiencePanel(), farPanel(), musicPanel(), measurePanel());
    // (Inside the page's arena, beside the menus, so the speaker button stays over it.)
    (document.querySelector('.arena') ?? document.body).append(root);
    let last = performance.now();
    const step = (now) => {
      if (!root) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      engine.bench.listen(head(), CAMERA);
      engine.bench.tick(dt);
      if (ambience.thunder) {
        thunderClock -= dt;
        if (thunderClock <= 0) {
          thunderClock = 9 + Math.random() * 10;
          const angle = Math.random() * 2 * Math.PI;
          const distance = 200 + Math.random() * 1500;
          engine.bench.playEventAt({ type: 'thunder', distance }, [Math.cos(angle) * 100, 60, Math.sin(angle) * 100]);
        }
      }
      loop = requestAnimationFrame(step);
    };
    loop = requestAnimationFrame(step);
  }

  function close() {
    if (!root) return;
    cancelAnimationFrame(loop);
    root.remove();
    root = null;
    engine.bench.open(false);
  }

  function panel(title, ...children) {
    return make('section', { className: 'bench-panel' }, make('h2', { textContent: title }), ...children);
  }

  function select(label, key, values) {
    const node = make('select', {}, ...options(values));
    node.value = String(pick[key]);
    node.addEventListener('change', () => {
      pick[key] = typeof pick[key] === 'number' ? Number(node.value) : typeof pick[key] === 'boolean' ? node.value === 'true' : node.value;
    });
    return make('label', { className: 'bench-field' }, make('span', { textContent: label }), node);
  }

  function familiesPanel() {
    const readout = make('output', { className: 'bench-readout', textContent: 'Tap a family to hear it from the source on the circle.' });
    const slider = make('input', { type: 'range', min: '0', max: '100', value: String(strength * 100) });
    const strengthValue = make('output', { textContent: `${Math.round(strength * 100)}%` });
    slider.addEventListener('input', () => {
      strength = Number(slider.value) / 100;
      strengthValue.textContent = `${slider.value}%`;
    });
    const at = () => [source.x, 1.2, source.z];
    const fire = (type) => {
      if (type === 'breath') {
        const breath = engine.bench.playBreathAt(strength * 1.3, pick.size, at(), false);
        readout.textContent = breath ? `breath · ${breath.level.toFixed(0)} dB at 1 m · ${(breath.rate * 60).toFixed(0)} a minute` : 'Tap once more: sound starts on a tap.';
        return;
      }
      if (type === 'whizz' || type === 'ui') {
        const ctx = engine.context();
        if (!ctx) return;
        if (type === 'ui') engine.ui(['click', 'confirm', 'back', 'victory', 'defeat'][Math.min(4, Math.floor(strength * 5))]);
        else engine.bench.playWhizzAt(20 + strength * 70, at());
        readout.textContent = type;
        return;
      }
      const played = engine.bench.playEventAt(benchEvent(type, strength, pick), at());
      if (!played) {
        readout.textContent = 'Tap once more: sound starts on a tap.';
        return;
      }
      readout.textContent = `${type} · ${played.params.level.toFixed(0)} dB SPL at 1 m · ${played.atEar.toFixed(0)} dB at the ear · ${played.distance.toFixed(1)} m`;
    };
    const buttons = make('div', { className: 'bench-buttons' }, ...['hit', 'wound', 'clash', 'swing', 'step', 'fall', 'land', 'voice', 'breath', 'horse', 'shot', 'arrowhit', 'whizz', 'mech', 'thunder', 'ui'].map((type) => make('button', { type: 'button', textContent: type, onclick: () => fire(type) })));
    return panel('Families', buttons,
      make('label', { className: 'bench-field wide' }, make('span', { textContent: 'Strength' }), slider, strengthValue),
      make('div', { className: 'bench-fields' },
        select('Covering', 'covering', Object.keys(COVERINGS)),
        select('Striker', 'striker', Object.keys(STRIKERS)),
        select('Wound', 'wound', ['cut', 'stab', 'bone', 'crush']),
        select('Clash A', 'clashA', ['blade', 'haft', 'blunt', 'shield', 'shieldmetal']),
        select('Clash B', 'clashB', ['blade', 'haft', 'blunt', 'shield', 'shieldmetal']),
        select('Sliding', 'slide', ['false', 'true']),
        select('Surface', 'surface', Object.keys(SURFACES)),
        select('Water depth', 'depth', ['0.1', '0.3', '0.6', '1']),
        select('Armour', 'armour', ['none', 'mail', 'plate', 'lamellar', 'padded']),
        select('Voice', 'voice', ['effort', 'struck', 'wound', 'death']),
        select('Height (m)', 'size', ['1.5', '1.65', '1.78', '1.9', '2.05']),
        select('Body (kg)', 'bodyMass', ['55', '70', '80', '95', '120']),
        select('Horse', 'horse', ['hoof', 'snort', 'neigh']),
        select('Shot', 'shot', ['bow', 'crossbow', 'matchlock', 'cannon']),
        select('Mechanism', 'mech', Object.keys(MECHS)),
        select('Its state', 'mechState', ['open', 'closed'])),
      readout);
  }

  function circlePanel() {
    const size = 280;
    const canvas = make('canvas', { className: 'bench-circle', width: size * 2, height: size * 2 });
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    const readout = make('output', { className: 'bench-readout' });
    const scale = size / 2 / (EAR.radius + 2);
    const draw = () => {
      const g = canvas.getContext('2d');
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, size, size);
      const c = size / 2;
      for (const [radius, colour] of [[EAR.radius, 'rgba(255,255,255,0.25)'], [EAR.full, 'rgba(255,255,255,0.12)']]) {
        g.beginPath();
        g.arc(c, c, radius * scale, 0, 2 * Math.PI);
        g.strokeStyle = colour;
        g.stroke();
      }
      g.fillStyle = '#8e96aa';
      g.font = '11px IBM Plex Mono, monospace';
      g.textAlign = 'center';
      g.fillText('front', c, 12);
      g.fillText('behind', c, size - 4);
      g.textAlign = 'left';
      g.fillText('left', 4, c - 4);
      g.textAlign = 'right';
      g.fillText('right', size - 4, c - 4);
      // The listener: a head with its nose to the front.
      g.fillStyle = '#eef0f5';
      g.beginPath();
      g.arc(c, c, 7, 0, 2 * Math.PI);
      g.fill();
      g.beginPath();
      g.moveTo(c - 4, c - 6);
      g.lineTo(c, c - 13);
      g.lineTo(c + 4, c - 6);
      g.fill();
      g.fillStyle = '#ffcf4a';
      g.beginPath();
      g.arc(c + source.x * scale, c + source.z * scale, 9, 0, 2 * Math.PI);
      g.fill();
      const seen = earDirection(listenerAt, source.x, 1.2, source.z);
      readout.textContent = `azimuth ${((seen.azimuth * 180) / Math.PI).toFixed(0)}° (${Math.abs(seen.azimuth) > Math.PI / 2 ? 'behind' : 'in front'}, ${seen.azimuth > 0.05 ? 'right' : seen.azimuth < -0.05 ? 'left' : 'centre'}) · ${seen.distance.toFixed(1)} m · air ${Math.round(airCutoff(seen.distance))} Hz`;
    };
    const move = (press) => {
      const box = canvas.getBoundingClientRect();
      const c = size / 2;
      source.x = (press.clientX - box.left - c) / scale;
      source.z = (press.clientY - box.top - c) / scale;
      const d = Math.hypot(source.x, source.z);
      if (d > EAR.radius + 2) {
        source.x *= (EAR.radius + 2) / d;
        source.z *= (EAR.radius + 2) / d;
      }
      draw();
    };
    let dragging = false;
    canvas.addEventListener('pointerdown', (press) => {
      dragging = true;
      canvas.setPointerCapture(press.pointerId);
      move(press);
    });
    canvas.addEventListener('pointermove', (press) => dragging && move(press));
    canvas.addEventListener('pointerup', () => { dragging = false; });
    requestAnimationFrame(draw);
    return panel('Where it is', make('p', { className: 'bench-note', textContent: 'Drag the gold source round you (the inner ring is 10 m, the outer the 20 m circle).' }), canvas, readout);
  }

  function placesPanel() {
    const readout = make('output', { className: 'bench-readout' });
    const choose = (name) => {
      const room = roomFromProbe(BENCH_PLACES[name]);
      engine.bench.room(room);
      readout.textContent = `${name}: RT60 ${room.rt60.toFixed(2)} s · wet ${room.wet.toFixed(2)} · pre-delay ${(room.preDelay * 1000).toFixed(0)} ms · damping ${Math.round(room.damping)} Hz${room.flutter.feedback > 0 ? ` · flutter ${(room.flutter.delay * 1000).toFixed(0)} ms` : ''}`;
      for (const button of row.children) button.classList.toggle('on', button.textContent === name);
    };
    const row = make('div', { className: 'seg bench-seg' }, ...Object.keys(BENCH_PLACES).map((name) => make('button', { type: 'button', textContent: name, onclick: () => choose(name) })));
    requestAnimationFrame(() => choose('Open field'));
    return panel('Reverb of a place', row, make('p', { className: 'bench-note', textContent: `What the ${PROBE_RAYS.length}-ray probe finds in each, fed to the acoustics model. Then play a family above.` }), readout);
  }

  function ambiencePanel() {
    const apply = () => {
      engine.bench.ambience({
        spec: { wind: ambience.wind ? 54 : 0, surf: ambience.surf ? 72 : 0, crowd: ambience.crowd ? 84 : 0, market: ambience.market ? 56 : 0, flow: ambience.sewer ? 50 : 0 },
        rain: ambience.rain ? 0.85 : 0,
        drips: ambience.sewer ? [{ at: [1.5, 2.6, -2] }, { at: [-2, 2.6, 1] }, { at: [0.5, 2.6, 4] }] : [],
        waters: ambience.sewer ? [{ at: [0, 0, 3] }] : [],
        fires: [],
      });
    };
    apply();
    const row = make('div', { className: 'seg bench-seg' }, ...Object.keys(ambience).map((name) => {
      const button = make('button', { type: 'button', textContent: name });
      button.addEventListener('click', () => {
        ambience = { ...ambience, [name]: !ambience[name] };
        button.classList.toggle('on', ambience[name]);
        if (name === 'thunder') thunderClock = 0.3;
        apply();
      });
      return button;
    }));
    return panel('Ambience', row, make('p', { className: 'bench-note', textContent: 'The beds of the places: rain on you (a roof over you in a room, a tunnel, the drain), wind, surf, thunder now and then, a crowd, a market, the drain\'s drips and running water.' }));
  }

  function farPanel() {
    const sectors = createSectors();
    const update = () => {
      // Men at 40 m, half of them fighting, in each sector: the sums the far field makes from a battle.
      sectors.shout.fill(0);
      sectors.clash.fill(0);
      sectorMen.forEach((men, sector) => {
        sectors.men[sector] = men;
        sectors.shout[sector] = (men * 10 ** (FAR_FIELD.shoutFighting / 10)) / 1600;
        sectors.clash[sector] = (men * 0.5 * 10 ** (FAR_FIELD.clash / 10)) / 1600;
      });
      engine.bench.far(sectors);
    };
    update();
    const names = ['front', 'front right', 'right', 'behind right', 'behind', 'behind left', 'left', 'front left'];
    const grid = make('div', { className: 'bench-fields' }, ...names.map((name, sector) => {
      const slider = make('input', { type: 'range', min: '0', max: '200', value: '0' });
      const value = make('output', { textContent: '0' });
      slider.addEventListener('input', () => {
        sectorMen[sector] = Number(slider.value);
        value.textContent = slider.value;
        update();
      });
      return make('label', { className: 'bench-field' }, make('span', { textContent: name }), slider, value);
    }));
    return panel('Far field (men 40 m off, per side)', grid);
  }

  function musicPanel() {
    const ids = Object.keys(MUSIC_CUES);
    const list = make('div', { className: 'bench-buttons' }, ...(ids.length ? ids.map((id) => make('button', { type: 'button', textContent: id, onclick: () => engine.bench.music(id) })) : [make('span', { className: 'bench-note', textContent: 'No music cues in this build.' })]),
      make('button', { type: 'button', textContent: '■ Stop', onclick: () => engine.bench.stopMusic() }));
    return panel('Music cues', list);
  }

  function measurePanel() {
    const table = make('table', { className: 'bench-table' });
    const button = make('button', { type: 'button', textContent: 'Render every family offline' });
    button.addEventListener('click', async () => {
      button.disabled = true;
      const rows = await measureFamilies();
      table.replaceChildren(make('tr', {}, ...['family', 'peak dBFS', 'RMS dBFS', 's'].map((text) => make('th', { textContent: text }))),
        ...rows.map((row) => make('tr', {}, make('td', { textContent: row.name + (row.error ? ` (${row.error})` : '') }), make('td', { textContent: row.peak.toFixed(1) }), make('td', { textContent: row.rms.toFixed(1) }), make('td', { textContent: row.seconds.toFixed(2) }))));
      button.disabled = false;
    });
    return panel('Check', make('p', { className: 'bench-note', textContent: 'Each family rendered without speakers, 2 m off: its peak and loudness (nothing silent, nothing past 0 dBFS).' }), button, table);
  }

  return { open, close, isOpen: () => Boolean(root) };
}
