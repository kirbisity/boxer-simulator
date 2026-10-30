// The sound board: one self-contained page that plays every sound effect the game has, the recorded sets take by take and each event
// as the game plays it (sfx/sampled.js over the synth families, at the engine's gain), with a light-to-heavy slider where the game scales
// the sound by the event's weight. The audio modules are put in it as they are (as tools/bundle.js does, without the rest of the game),
// the samples as base64. Usage: node tools/soundboard.js [out.html] (default dist/sound-board.html).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

// In load order (each after what it imports).
const MODULES = ['audio/synth', 'audio/ear', 'audio/sfx/impact', 'audio/sfx/clash', 'audio/sfx/wound', 'audio/sfx/swing', 'audio/sfx/step', 'audio/sfx/fall', 'audio/sfx/voice', 'audio/sfx/horse', 'audio/sfx/ranged', 'audio/sfx/world', 'audio/sfx/ui', 'audio/sfx/thump', 'audio/sfx/art', 'audio/sfx/sampled', 'audio/samples', 'audio/families'];
const out = process.argv[2] ?? 'dist/sound-board.html';

const SAMPLE_EMBED_LINE = 'const SAMPLE_EMBED = null;';
function sampleEmbed() {
  const files = readdirSync('src/audio/samples').filter((file) => file.endsWith('.mp3')).sort();
  return `const SAMPLE_EMBED = {\n${files.map((file) => `  '${file.replace(/\.mp3$/, '')}': '${readFileSync(`src/audio/samples/${file}`).toString('base64')}',`).join('\n')}\n};`;
}
function strip(name) {
  let source = readFileSync(`src/${name}.js`, 'utf8');
  if (name === 'audio/samples') {
    if (!source.includes(SAMPLE_EMBED_LINE)) throw new Error(`src/audio/samples.js: no '${SAMPLE_EMBED_LINE}' to fill`);
    source = source.replace(SAMPLE_EMBED_LINE, sampleEmbed());
  }
  for (const [, path] of source.matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) {
    const imported = new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, '');
    if (MODULES.indexOf(imported) < 0 || MODULES.indexOf(imported) > MODULES.indexOf(name)) throw new Error(`src/${name}.js imports ${imported}.js, not above it in MODULES`);
  }
  return source.replace(/^import [^;]+;\n/gm, '').replace(/^export (async function|const|function\*|function|class|let) /gm, '$1 ');
}

/** The board itself (run in the page, after the modules: their names are in its scope). */
function board() {
  const log = (low, high, s) => low * (high / low) ** s;
  const lerp = (a, b, s) => a + (b - a) * s;
  // Each card: the set(s) it plays, the event at a weight s (0 light .. 1 heavy), how far off (m), and what the slider's ends mean.
  // `synth`: a family the game plays with no recording (the synth alone); `direct`: a sound the engine plays straight (ui, thump, art).
  const LIGHT_HEAVY = ['light', 'heavy'];
  const MASS = ['55 kg', '120 kg'];
  const step = (surface, speed, extra = {}) => (s) => ({ type: 'step', speed, mass: lerp(55, 120, s), surface, armour: 'none', depth: surface === 'water' ? 0.3 : 0, ...extra });
  const CATEGORIES = [
    ['Blows on flesh', 'A weapon or a limb landing on the body (bare, padded or leather). The slider is the blow\'s energy.', [
      { title: 'Blade on flesh', sets: ['slice'], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'flesh', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Mace on flesh', sets: ['bonehit'], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blunt', covering: 'flesh', part: 'trunk', mass: 1.6 }), ends: ['5 J', '400 J'] },
      { title: 'Punch', sets: ['punch'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'fist', covering: 'flesh', part: 'head' }), ends: ['3 J', '300 J'] },
      { title: 'Kick', sets: ['punch'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'foot', covering: 'flesh', part: 'trunk' }), ends: ['3 J', '300 J'], note: 'The punch takes, lower.' },
      { title: 'Fist whoosh', sets: ['fistswing'], isNew: true, event: (s) => ({ type: 'swing', speed: lerp(4, 14, s), length: 0.7, mass: 2, head: 'fist', reach: 0.22 }), ends: ['4 m/s', '14 m/s'], note: 'Heard as a punch or kick drives in.' },
      { title: 'Mace swing', sets: ['maceswing'], event: (s) => ({ type: 'swing', speed: lerp(8, 25, s), length: 0.7, mass: 1.6, head: 'blunt' }), ends: ['8 m/s', '25 m/s'] },
    ]],
    ['Steel, armour and shields', 'Weapon on weapon, on plate, on a helmet, on a wooden shield.', [
      { title: 'Sword on sword', sets: ['clash'], event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'blade', mass: 1.2 }), ends: ['1 m/s', '20 m/s'] },
      { title: 'Weapon on plate', sets: ['break'], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'plate', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Blow on a helmet', sets: ['helmet'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'plate', part: 'head', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Blow on a wooden shield', sets: ['woodshield'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'wood', part: 'shield', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Steel on a haft', sets: ['woodshield'], isNew: true, event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'haft', mass: 1.2 }), ends: ['1 m/s', '20 m/s'], note: 'The shield take, higher and shorter.' },
    ]],
    ['Wounds and bones', 'The slider is the wound\'s severity.', [
      { title: 'Cut', sets: ['gore'], event: (s) => ({ type: 'wound', kind: 'cut', severity: s }), ends: ['minor', 'deep'] },
      { title: 'Bone breaking', sets: ['bones'], event: (s) => ({ type: 'wound', kind: 'bone', severity: s }), ends: ['crack', 'break'] },
      { title: 'Skull or neck crushed', sets: ['bones'], event: () => ({ type: 'wound', kind: 'crush', severity: 1 }), ends: null },
    ]],
    ['Armour and falls', 'The kit\'s clank over each step, and men and weapons hitting the floor.', [
      { title: 'Plate, walking on sand', sets: ['armourstep'], event: (s) => ({ type: 'step', speed: 1.4, mass: lerp(55, 120, s), surface: 'sand', armour: 'plate' }), ends: MASS, note: 'Sand has no recording: the clank over the synth\'s ground.' },
      { title: 'Mail, running on stone', sets: ['step-stone-run', 'armourstep'], event: (s) => ({ type: 'step', speed: 5, mass: lerp(55, 120, s), surface: 'stone', armour: 'mail' }), ends: MASS },
      { title: 'Man in plate falls', sets: ['clatter'], event: (s) => ({ type: 'fall', mass: 90, speed: log(0.8, 9, s), surface: 'earth', armour: 'plate' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Man in mail lands a jump', sets: ['armourstep'], event: (s) => ({ type: 'land', mass: 85, speed: log(0.8, 9, s), surface: 'stone', armour: 'mail' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Dropped weapon', sets: ['clatter'], event: (s) => ({ type: 'clatter', speed: log(1.2, 8, s), mass: 1.2 }), ends: ['1.2 m/s', '8 m/s'] },
    ]],
    ['Footsteps', 'One footfall. The slider is the man\'s weight: lighter is quieter, shorter and crisper.', [
      { title: 'Stone, walking', sets: ['step-stone-walk'], event: step('stone', 1.4), ends: MASS },
      { title: 'Stone, running', sets: ['step-stone-run'], event: step('stone', 5), ends: MASS },
      { title: 'Tile, walking', sets: ['step-stone-walk'], event: step('tile', 1.4), ends: MASS },
      { title: 'Grass, walking', sets: ['step-grass-walk'], event: step('grass', 1.4), ends: MASS },
      { title: 'Grass, running', sets: ['step-grass-run'], event: step('grass', 5), ends: MASS },
      { title: 'Earth, walking', sets: ['step-grass-walk'], event: step('earth', 1.4), ends: MASS },
      { title: 'Mud', sets: ['step-mud'], event: step('mud', 1.4), ends: MASS },
      { title: 'Water', sets: ['step-water'], event: step('water', 1.4), ends: MASS },
      { title: 'Heels on stone', sets: ['step-heel'], isNew: true, event: step('stone', 1.4, { heels: true }), ends: MASS },
      { title: 'Heels on boards', sets: ['step-heel'], isNew: true, event: step('wood', 1.4, { heels: true }), ends: MASS },
      { title: 'Boards (synth)', sets: [], event: step('wood', 1.4), ends: MASS },
      { title: 'Sand (synth)', sets: [], event: step('sand', 1.4), ends: MASS },
      { title: 'Snow (synth)', sets: [], event: step('snow', 1.4), ends: MASS },
    ]],
    ['Horses', 'The slider is the gait, from a walk to a gallop.', [
      { title: 'Hooves on stone', sets: ['hoof-stone'], event: (s) => ({ type: 'horse', kind: 'hoof', gait: ['walk', 'trot', 'canter', 'gallop'][Math.min(3, Math.floor(s * 4))], speed: lerp(1.5, 12, s), surface: 'stone', mass: 550 }), ends: ['walk', 'gallop'] },
      { title: 'Hooves on turf', sets: ['hoof-soft'], event: (s) => ({ type: 'horse', kind: 'hoof', gait: ['walk', 'trot', 'canter', 'gallop'][Math.min(3, Math.floor(s * 4))], speed: lerp(1.5, 12, s), surface: 'grass', mass: 550 }), ends: ['walk', 'gallop'] },
      { title: 'Neigh', sets: ['neigh'], event: (s) => ({ type: 'horse', kind: 'neigh', mass: lerp(700, 300, s) }), ends: ['700 kg', '300 kg'], note: 'A smaller horse higher.' },
      { title: 'Snort (synth)', sets: [], event: () => ({ type: 'horse', kind: 'snort', mass: 500 }), ends: null },
    ]],
    ['Ranged and world', 'Guns and thunder are heard over the whole map, at their own distance.', [
      { title: 'Matchlock at 40 m', sets: ['gunshot'], event: () => ({ type: 'shot', kind: 'matchlock' }), distance: 40, ends: null },
      { title: 'Thunder', sets: ['thunder'], isNew: true, event: (s) => ({ type: 'thunder', distance: log(5000, 150, s) }), distance: (s) => log(5000, 150, s), ends: ['5 km', '150 m'], note: 'Far: the rumble only, lower. Near: the crack.' },
      { title: 'Bow (synth)', sets: [], event: () => ({ type: 'shot', kind: 'bow' }), ends: null },
      { title: 'Crossbow (synth)', sets: [], event: () => ({ type: 'shot', kind: 'crossbow' }), ends: null },
      { title: 'Cannon at 200 m (synth)', sets: [], event: () => ({ type: 'shot', kind: 'cannon' }), distance: 200, ends: null },
      { title: 'Arrow on mail (synth)', sets: [], event: (s) => ({ type: 'arrowhit', speed: log(15, 90, s), covering: 'mail' }), ends: ['15 m/s', '90 m/s'] },
      { title: 'Door slams (synth)', sets: [], event: () => ({ type: 'mech', kind: 'door', state: 'closed' }), ends: null },
      { title: 'Portcullis (synth)', sets: [], event: () => ({ type: 'mech', kind: 'portcullis', state: 'down' }), ends: null },
      { title: 'Lock (synth)', sets: [], event: () => ({ type: 'mech', kind: 'lock' }), ends: null },
    ]],
    ['Synthesised families', 'What the game makes with no recording, and the synth under the recorded ones.', [
      { title: 'Impact: blade on mail', sets: [], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'mail', part: 'trunk' }), ends: ['5 J', '400 J'] },
      { title: 'Impact: blade on lamellar', sets: [], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'lamellar', part: 'trunk' }), ends: ['5 J', '400 J'] },
      { title: 'Impact: punch on plate', sets: [], event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'fist', covering: 'plate', part: 'trunk' }), ends: ['3 J', '300 J'] },
      { title: 'Clash: blade on steel shield', sets: [], event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'shieldmetal' }), ends: ['1 m/s', '20 m/s'] },
      { title: 'Swing: sword', sets: [], event: (s) => ({ type: 'swing', speed: lerp(8, 35, s), length: 1, mass: 1.3, head: 'blade' }), ends: ['8 m/s', '35 m/s'] },
      { title: 'Wound: stab', sets: [], event: (s) => ({ type: 'wound', kind: 'stab', severity: s }), ends: ['minor', 'deep'] },
      { title: 'Fall: unarmoured on earth', sets: [], event: (s) => ({ type: 'fall', mass: 80, speed: log(0.8, 9, s), surface: 'earth', armour: 'none' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Voice: effort', sets: [], event: (s) => ({ type: 'voice', kind: 'effort', strength: s, size: 1.8, mass: 85 }), ends: ['soft', 'strong'], note: 'Voices are off in the game; heard here only.' },
      { title: 'Voice: struck', sets: [], event: (s) => ({ type: 'voice', kind: 'struck', strength: s, size: 1.8, mass: 85 }), ends: ['soft', 'strong'] },
      { title: 'Voice: cry of a wound', sets: [], event: (s) => ({ type: 'voice', kind: 'wound', strength: s, size: 1.8, mass: 85 }), ends: ['soft', 'strong'] },
      { title: 'Voice: death', sets: [], event: (s) => ({ type: 'voice', kind: 'death', strength: s, size: 1.8, mass: 85 }), ends: ['soft', 'strong'] },
      { title: 'Breath', sets: [], direct: (voice, out, when, s) => { const p = breathParams(s, 1.8); return playBreath(voice, out, p, when, gainOfLevel(p.level - 6), false); }, ends: ['at rest', 'spent'] },
      { title: 'Arrow whizzing past', sets: [], direct: (voice, out, when, s) => { const p = whizzParams(log(15, 90, s), 1); return playWhizz(voice, out, p, when, gainOfLevel(p.level)); }, ends: ['15 m/s', '90 m/s'] },
      { title: 'Hit-feel thump', sets: [], direct: (voice, out, when, s) => playThump(voice, out, thumpParams(s), when, Math.min(1, 0.3 + 0.7 * s)), ends: LIGHT_HEAVY },
      { title: 'Weapon art: draw', sets: [], direct: (voice, out, when) => playArtDraw(voice, out, artDrawParams(true), when, 0.8), ends: null },
      { title: 'Weapon art: impact', sets: [], direct: (voice, out, when, s) => playArtImpact(voice, out, artImpactParams(s, true), when, 0.8), ends: LIGHT_HEAVY },
      ...Object.keys(UI_SOUNDS).map((kind) => ({ title: `Menu: ${kind}`, sets: [], direct: (voice, out, when) => playUi(voice, out, uiParams(kind), when, 0.8), ends: null })),
    ]],
  ];

  let ctx = null;
  let master = null;
  let bank = null;
  const volume = document.getElementById('volume');
  const status = document.getElementById('status');
  function audio() {
    if (ctx) return ctx;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = Number(volume.value);
    master.connect(ctx.destination);
    bank = createSampleBank(ctx);
    status.textContent = 'Loading the recordings…';
    bank.ready.then((count) => (status.textContent = `${count} recordings ready. Sound is on.`));
    return ctx;
  }
  volume.addEventListener('input', () => master && (master.gain.value = Number(volume.value)));

  /** A voice into the master through the air of `distance` m (the engine's lowpass for it). */
  function voiceAt(distance) {
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass';
    air.frequency.value = airCutoff(distance);
    air.connect(master);
    return sfxVoice(ctx, air);
  }
  /** What the game would play for a card at a weight: its event, family, params, gain at the ear (as engine.js playCandidate). */
  function prepared(card, s) {
    const event = card.event(s);
    const family = SOUND_FAMILIES[event.type];
    const params = family.params(event);
    const distance = typeof card.distance === 'function' ? card.distance(s) : card.distance ?? 2;
    const atEar = levelAtEar(params.level + (family.boost ?? 0), distance, isMapWide(event));
    return { event, family, params, distance, atEar, gain: gainOfLevel(atEar) };
  }
  function play(card, s, mode) {
    audio();
    if (ctx.state !== 'running') ctx.resume();
    const when = ctx.currentTime + 0.03;
    if (card.direct) {
      const voice = voiceAt(2);
      return card.direct(voice, voice.out, when, s);
    }
    const p = prepared(card, s);
    const voice = voiceAt(p.distance);
    if (mode === 'synth') return p.family.play(voice, voice.out, p.params, when, p.gain);
    return playWithSamples(bank, voice, p.family, p.event, p.params, when, p.gain);
  }
  function playTake(name) {
    audio();
    if (ctx.state !== 'running') ctx.resume();
    const take = bank.take(name);
    if (!take) return (status.textContent = 'Still loading the recordings: try again in a moment.');
    const voice = voiceAt(2);
    playSample(voice, voice.out, take, { rate: 1, trim: 1, seconds: null, fade: 0.02, skip: 0 }, ctx.currentTime + 0.03, 0.7);
  }
  /** The readout: the game's numbers at this weight. */
  function readout(card, s) {
    if (card.direct) return '';
    const p = prepared(card, s);
    const plan = samplePlan(p.event.type, p.params, p.event, () => 0.5);
    const db = (20 * Math.log10(Math.max(1e-6, p.gain * (plan?.trim ?? 1)))).toFixed(1);
    const parts = [`${p.atEar.toFixed(0)} dB at the ear`, `gain ${db} dBFS`];
    if (plan) {
      parts.push(`pitch ×${plan.rate.toFixed(2)}`);
      if (plan.seconds) parts.push(`${(plan.seconds * (plan.share ?? 1)).toFixed(2)} s`);
      else if (plan.share) parts.push(`${Math.round(plan.share * 100)}% of the take`);
      parts.push(`set ${plan.set}${plan.extra?.length ? ' + ' + plan.extra.map((layer) => layer.set).join(' + ') : ''}`);
      if (plan.synth) parts.push('synth under it');
    } else parts.push('synth');
    return parts.join(' · ');
  }

  const root = document.getElementById('board');
  const nav = document.getElementById('nav');
  const el = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) if (child !== null && child !== undefined) node.append(child);
    return node;
  };
  let n = 0;
  for (const [name, blurb, cards] of CATEGORIES) {
    const id = name.toLowerCase().replace(/[^a-z]+/g, '-');
    nav.append(el('a', { href: `#${id}`, textContent: name }));
    const grid = el('div', { className: 'grid' });
    root.append(el('section', { id, className: 'category' }, el('h2', { textContent: name }), el('p', { className: 'blurb', textContent: blurb }), grid));
    for (const card of cards) {
      n += 1;
      const recorded = card.sets.length > 0;
      const slider = card.ends ? el('input', { type: 'range', min: '0', max: '1', step: '0.01', value: '0.5', id: `weight-${n}`, className: 'weight' }) : null;
      const info = el('p', { className: 'readout' });
      const weight = () => (slider ? Number(slider.value) : 1);
      const refresh = () => (info.textContent = readout(card, weight()));
      const buttons = el('div', { className: 'actions' },
        el('button', { type: 'button', className: 'play', textContent: recorded ? 'Play as in game' : 'Play', onclick: () => play(card, weight(), 'game') }),
        recorded && !card.direct ? el('button', { type: 'button', className: 'ghost', textContent: 'Synth only', onclick: () => play(card, weight(), 'synth') }) : null);
      const takes = recorded ? el('div', { className: 'takes' }, ...[...new Set(card.sets)].flatMap((set) => [
        el('span', { className: 'set', textContent: set }),
        ...SAMPLE_SETS[set].map((file, index) => el('button', { type: 'button', className: 'take', textContent: String(index + 1), title: `${file}.mp3, as recorded`, onclick: () => playTake(file) })),
      ])) : null;
      const tags = el('div', { className: 'tags' }, el('span', { className: recorded ? 'tag rec' : 'tag syn', textContent: recorded ? 'recorded' : 'synth' }), card.isNew ? el('span', { className: 'tag new', textContent: 'new' }) : null);
      grid.append(el('article', { className: 'card' },
        el('header', {}, el('h3', { textContent: card.title }), tags),
        card.note ? el('p', { className: 'note', textContent: card.note }) : null,
        slider ? el('label', { className: 'slider', htmlFor: slider.id }, el('span', { textContent: card.ends[0] }), slider, el('span', { textContent: card.ends[1] })) : null,
        buttons, takes, info));
      if (slider) slider.addEventListener('input', refresh);
      refresh();
    }
  }
  // The ambience loops: each a bed that plays until stopped (ambience.js plays them under the places, at the place's level).
  const LOOPS = [
    ['rain', 'Rain', 'Rain in the open: Dunnottar\'s storm, the container quay at night. Under a roof the synth\'s drumming on it instead.'],
    ['wind', 'Wind', 'Every outdoor place, as strong as the place is open to it (the steppe, the cliffs most); muffled through walls.'],
    ['market', 'Market', 'A town\'s market square by day: Maidstone, the Jiangnan water town. Thinned by rain, gone at night.'],
  ];
  const playing = {};
  function toggleLoop(name, button) {
    audio();
    if (ctx.state !== 'running') ctx.resume();
    const now = ctx.currentTime;
    if (playing[name]) {
      playing[name].gain.gain.setTargetAtTime(0, now, 0.15);
      playing[name].loop.stop(now + 1);
      delete playing[name];
    } else {
      const loop = bank.loop(name);
      if (!loop) return (status.textContent = 'Still loading the recordings: try again in a moment.');
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(0.7, now, 0.3);
      gain.connect(master);
      playing[name] = { gain, loop: startLoop(ctx, loop, gain, now + 0.03) };
    }
    if (button) {
      button.setAttribute('aria-pressed', String(Boolean(playing[name])));
      button.textContent = playing[name] ? 'Stop' : 'Play loop';
    }
    return Boolean(playing[name]);
  }
  {
    const id = 'ambience-loops';
    nav.prepend(el('a', { href: `#${id}`, textContent: 'Ambience loops' }));
    const grid = el('div', { className: 'grid' });
    root.prepend(el('section', { id, className: 'category' }, el('h2', { textContent: 'Ambience loops' }), el('p', { className: 'blurb', textContent: 'The places\' beds, recorded: each loops seamlessly until stopped (mono, played wide: two reads of it half a loop apart, left and right). Play several at once to hear them together.' }), grid));
    for (const [name, title, note] of LOOPS) {
      const spec = AMBIENCE_LOOPS[name];
      const button = el('button', { type: 'button', className: 'play toggle', textContent: 'Play loop', onclick: () => toggleLoop(name, button) });
      button.setAttribute('aria-pressed', 'false');
      button.dataset.loop = name;
      grid.append(el('article', { className: 'card' },
        el('header', {}, el('h3', { textContent: title }), el('div', { className: 'tags' }, el('span', { className: 'tag rec', textContent: 'loop' }), el('span', { className: 'tag new', textContent: 'new' }))),
        el('p', { className: 'note', textContent: note }),
        el('div', { className: 'actions' }, button),
        el('p', { className: 'readout', textContent: `${spec.file}.mp3 · ${spec.seconds} s period, its tail crossfaded into its head · looped ${spec.lead}–${(spec.lead + spec.seconds).toFixed(2)} s of the file` })));
    }
  }
  const takes = Object.values(SAMPLE_SETS).reduce((sum, list) => sum + list.length, 0);
  document.getElementById('count').textContent = `${LOOPS.length} ambience loops, ${Object.keys(SAMPLE_SETS).length} recorded sets, ${takes} takes, and the synthesised families`;
  window.soundBoard = { play, playTake, toggleLoop, loops: () => Object.keys(playing), cards: CATEGORIES.flatMap(([, , cards]) => cards), ready: () => bank?.ready };
}

const STYLE = `
/* Layout: a sticky bar (volume, sections) over a grid of sound cards, grouped by what makes the sound. */
:root {
  --bg: #eceef0; --surface: #f8f9fa; --ink: #1c2026; --muted: #5d6570; --line: #d3d8de;
  --bronze: #9a5a1c; --bronze-ink: #ffffff; --steel: #3d5a73; --new: #2f7a4f;
  --display: 'Barlow Condensed', 'Arial Narrow', sans-serif; --body: 'Source Sans 3', system-ui, sans-serif; --mono: 'JetBrains Mono', ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #15181c; --surface: #1e2227; --ink: #e6e9ed; --muted: #9aa3ad; --line: #30363e;
  --bronze: #d08a43; --bronze-ink: #1a1208; --steel: #8fb0cc; --new: #6cc394; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #15181c; --surface: #1e2227; --ink: #e6e9ed; --muted: #9aa3ad; --line: #30363e;
  --bronze: #d08a43; --bronze-ink: #1a1208; --steel: #8fb0cc; --new: #6cc394; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 15px/1.45 var(--body); margin: 0; padding-inline: 16px; padding-block: 0 48px; }
.wrap { max-width: 1180px; margin: 0 auto; }
.top { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding-block: 12px; display: flex; flex-wrap: wrap; gap: 8px 20px; align-items: center; }
h1 { font: 700 30px/1 var(--display); letter-spacing: 0.02em; text-transform: uppercase; margin: 0; }
.vol { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.vol input { width: 130px; accent-color: var(--bronze); }
#status { font-size: 13px; color: var(--muted); flex: 1 1 220px; min-width: 0; }
nav { display: flex; flex-wrap: wrap; gap: 6px; width: 100%; }
@media (max-width: 640px) { nav { flex-wrap: nowrap; overflow-x: auto; padding-bottom: 2px; } nav a { white-space: nowrap; } h1 { font-size: 26px; } }
nav a { font: 600 12px/1 var(--body); letter-spacing: 0.06em; text-transform: uppercase; color: var(--steel); text-decoration: none; padding: 6px 8px; border: 1px solid var(--line); border-radius: 4px; }
nav a:hover, nav a:focus-visible { border-color: var(--steel); }
.intro { color: var(--muted); max-width: 70ch; margin: 18px 0 0; }
.category { padding-top: 28px; scroll-margin-top: 120px; }
h2 { font: 600 24px/1.1 var(--display); letter-spacing: 0.04em; text-transform: uppercase; margin: 0; text-wrap: balance; }
.blurb { color: var(--muted); margin: 4px 0 14px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.card header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
h3 { font: 600 17px/1.2 var(--body); margin: 0; }
.tags { display: flex; gap: 4px; flex-shrink: 0; }
.tag { font: 600 10px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 5px; border-radius: 3px; border: 1px solid currentColor; }
.tag.rec { color: var(--bronze); } .tag.syn { color: var(--muted); } .tag.new { color: var(--new); }
.note { margin: -4px 0 0; font-size: 13px; color: var(--muted); }
.slider { display: grid; grid-template-columns: auto 1fr auto; gap: 8px; align-items: center; font: 11px var(--mono); color: var(--muted); }
.slider input { width: 100%; min-width: 0; accent-color: var(--bronze); }
.actions { display: flex; gap: 8px; flex-wrap: wrap; }
button { font: 600 14px/1 var(--body); cursor: pointer; border-radius: 4px; padding: 9px 12px; border: 1px solid var(--bronze); }
button.play { background: var(--bronze); color: var(--bronze-ink); }
button.ghost { background: transparent; color: var(--bronze); }
button.toggle { min-width: 96px; }
button.toggle[aria-pressed="true"] { background: transparent; color: var(--bronze); }
button:focus-visible { outline: 2px solid var(--steel); outline-offset: 2px; }
button:active { transform: translateY(1px); }
.takes { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
.set { font: 11px var(--mono); color: var(--muted); margin-right: 2px; }
.set:not(:first-child) { margin-left: 8px; }
button.take { font: 500 12px/1 var(--mono); padding: 6px 0; width: 30px; background: transparent; color: var(--ink); border-color: var(--line); font-variant-numeric: tabular-nums; }
button.take:hover { border-color: var(--bronze); }
.readout { margin: 0; font: 11px/1.5 var(--mono); color: var(--muted); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
`;

const MARKUP = `<div class="wrap">
<div class="top">
  <h1>Gladiator Sound Board</h1>
  <label class="vol" for="volume">Volume <input id="volume" type="range" min="0" max="1.5" step="0.01" value="0.9"></label>
  <span id="status">Tap any play button to turn sound on.</span>
  <nav id="nav"></nav>
</div>
<p class="intro">Every sound effect in the game: <span id="count"></span>. <strong>Play as in game</strong> plays the event the way the game does, at 2 m (guns and thunder at their own distance), picking a random take with a little pitch jitter; the slider moves the event from light to heavy, and the line under it shows what the game does with it. The numbered buttons play each recorded take as it was cut. <strong>Synth only</strong> plays what the game falls back on.</p>
<main id="board"></main>
</div>`;

const modules = MODULES.map((name) => `// ---- src/${name}.js ----\n${strip(name)}`).join('\n');
const script = `${modules}\n// ---- the board ----\n(${board.toString()})();\n`;
new vm.Script(script);
if (/<\/script/i.test(script)) throw new Error('a closing script tag inside the code');
const fonts = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=JetBrains+Mono:wght@400;500;600&family=Source+Sans+3:wght@400;600&display=swap">';
const page = `<meta charset="utf-8">\n<title>Gladiator Sound Board</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${fonts}\n<style>${STYLE}</style>\n${MARKUP}\n<script>\n${script}</script>\n`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
