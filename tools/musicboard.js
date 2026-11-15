// The music board: one self-contained page that plays every piece of music the game has, each with where it plays, how it was made and
// how long it runs, to be heard one by one when choosing what to replace. "Play as in game" runs the game's own player (audio/music.js,
// put in the page as it is, as tools/soundboard.js does with the effects): an opening looped and faded after its while, a boss cue looped
// until stopped, a victory or defeat once, and a change of cue cross-faded. The pieces are files beside the page (assets/music, copied there), the stings embedded as base64, as in the game.
// Usage: node tools/musicboard.js [out.html] (default dist/music-board.html); npm run bundle:music.

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import vm from 'node:vm';
import { BOSS_MUSIC, MUSIC_CUES, SCENE_MUSIC } from '../src/audio/music/manifest.js';
import { MUSIC } from '../src/audio/music.js';
import { AUDIO_SETTINGS } from '../src/audio/engine.js';
import { SCENARIOS } from '../src/scenarios.js';
import { CUSTOM_BATTLE } from '../src/custombattle.js';
import { STAGE_LIST } from '../src/levelmode/story.js';

const out = process.argv[2] ?? 'dist/music-board.html';
const PROMPTS = JSON.parse(readFileSync('tools/music-prompts.json', 'utf8'));

// In load order (each after what it imports): the synth stings' modules, the cue data, the manifest and the player.
const DATA_MODULES = [...readFileSync('src/audio/music/manifest.js', 'utf8').matchAll(/from '\.\/(data\/\w+)\.js'/g)].map(([, path]) => `audio/music/${path}`);
const MODULES = ['audio/synth', 'audio/sfx/ui', ...DATA_MODULES, 'audio/music/manifest', 'audio/music'];

function strip(name) {
  const source = readFileSync(`src/${name}.js`, 'utf8');
  for (const [, path] of source.matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) {
    const imported = new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, '');
    if (MODULES.indexOf(imported) < 0 || MODULES.indexOf(imported) > MODULES.indexOf(name)) throw new Error(`src/${name}.js imports ${imported}.js, not above it in MODULES`);
  }
  return source.replace(/^import [^;]+;\n/gm, '').replace(/^export (async function|const|function\*|function|class|let) /gm, '$1 ');
}

// ---- An MP3's length, read from its frame headers ------------------------------------------------------------------------------------

const MP3_BITRATES = {
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** { seconds, kbps, rate } of an MP3 (Layer III) file. */
function mp3Length(bytes) {
  let at = 0;
  if (bytes.subarray(0, 3).toString('latin1') === 'ID3') at = 10 + ((bytes[6] << 21) | (bytes[7] << 14) | (bytes[8] << 7) | bytes[9]);
  let seconds = 0;
  let frames = 0;
  let bits = 0;
  let rate = 0;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) {
      at += 1;
      continue;
    }
    const version = (bytes[at + 1] >> 3) & 3;
    const layer = (bytes[at + 1] >> 1) & 3;
    const bitrate = MP3_BITRATES[version === 3 ? 1 : 2][bytes[at + 2] >> 4];
    rate = MP3_RATES[version]?.[(bytes[at + 2] >> 2) & 3];
    if (layer !== 1 || !bitrate || !rate) {
      at += 1;
      continue;
    }
    const padding = (bytes[at + 2] >> 1) & 1;
    const samples = version === 3 ? 1152 : 576;
    seconds += samples / rate;
    bits += bitrate;
    frames += 1;
    at += Math.floor((samples / 8) * bitrate * 1000 / rate) + padding;
  }
  return { seconds, kbps: frames ? Math.round(bits / frames) : 0, rate };
}

// ---- Where each cue plays --------------------------------------------------------------------------------------------------------------

const stageTitle = (key) => STAGE_LIST.find((stage) => stage.key === key)?.title ?? key;
const mapLabel = (key) => CUSTOM_BATTLE.maps[key]?.label ?? null;

/** Where an opening cue plays: the Battle Mode battles, the custom battle grounds and the stages whose scene names it. */
function openingPlaces(id) {
  const scenes = Object.entries(SCENE_MUSIC).filter(([, cue]) => cue === id).map(([scene]) => scene);
  const battles = scenes.filter((scene) => SCENARIOS[scene]).map((scene) => SCENARIOS[scene].title);
  const grounds = scenes.filter((scene) => mapLabel(scene)).map(mapLabel);
  const stages = scenes.filter((scene) => STAGE_LIST.some((stage) => stage.key === scene)).map(stageTitle);
  const nowhere = scenes.filter((scene) => !SCENARIOS[scene] && !mapLabel(scene) && !STAGE_LIST.some((stage) => stage.key === scene));
  const lines = [];
  if (battles.length) lines.push(['Battle Mode', battles.join(', ')]);
  if (grounds.length) lines.push(['Custom battle grounds', grounds.join(', ')]);
  if (stages.length) lines.push(['Level Mode', stages.join(', ')]);
  if (nowhere.length) lines.push(['Mapped, not reached now', `scene ${nowhere.map((scene) => `'${scene}'`).join(', ')} (no battle, ground or stage of that name)`]);
  return { scenes, lines };
}

const openingRule = `At the start of a battle or stage: faded in, looped for its first ${MUSIC.openingSeconds} s, then faded out over ${MUSIC.fade * 2} s.`;

/** Each cue: its card's facts, and how "Play as in game" plays it (a moment and a scene for the game's player). */
function describe(id) {
  const cue = MUSIC_CUES[id];
  const bytes = cue.file ? readFileSync(cue.file) : Buffer.from(cue.data, 'base64');
  const length = mp3Length(bytes);
  const prompt = cue.file ? null : PROMPTS.cues[id];
  const made = cue.file
    ? { kind: 'Supplied recording', text: `A supplied piece (${cue.file}), converted from Opus to MP3; fetched when its scene first wants it.`, prompt: null, details: null }
    : prompt
    ? { kind: 'Generated file', text: `Rendered offline with ACE-Step 1.5 (tools/music-prompts.json; seed ${promptTake(id) ?? 'n/a'}, the better take kept), embedded as MP3.`, prompt: `${prompt.prompt}${PROMPTS.common.suffix}`, details: `${prompt.bpm} bpm, ${prompt.key}` }
    : { kind: 'Supplied recording', text: 'A finished track added by hand (data/bosschoir.js), not from the generator; embedded as MP3.', prompt: null, details: null };
  const base = {
    id, made, loop: cue.loop, loopStart: cue.loopStart, loopEnd: cue.loopEnd, gain: cue.gain,
    seconds: length.seconds, kbps: length.kbps, rate: length.rate, bytes: bytes.length, embedded: cue.data?.length ?? 0, file: cue.file ?? null, name: cue.title ?? null,
  };
  if (id === 'boss' || id === 'bossChoir') {
    const scenes = Object.entries(BOSS_MUSIC).filter(([, cue]) => cue === id).map(([scene]) => scene);
    const where = id === 'boss'
      ? [['Level Mode', 'any boss fight whose stage has no boss track of its own. Today that is only the test yard\'s boss dummy, reached only by the test hook boxer.levelMode(), so it is not heard in normal play (every Dunnottar boss has the choir)']]
      : [['Level Mode', `the boss fight of ${scenes.map(stageTitle).join(', ')} (from the moment his room is sealed or his bar shows)`]];
    return { ...base, title: id === 'boss' ? `${cue.title ?? 'Boss fight'} (any boss without a track)` : 'Dunnottar boss choir', used: id !== 'boss', tag: id === 'boss' ? 'Test only' : null, play: { moment: 'boss', scene: id === 'boss' ? 'yard' : scenes[0] }, where,
      rule: `Loops while the boss fight is on; cross-faded in over ${MUSIC.fade} s from whatever played before.` };
  }
  if (id === 'victory' || id === 'defeat') {
    return { ...base, title: id === 'victory' ? 'Victory' : 'Defeat', used: true, play: { moment: id, scene: null },
      where: [['Every mode but the home screen', `the end of a bout or battle with a man played, for his side's ${id}${id === 'defeat' ? ' (in a Level Mode stage, each death)' : ' (in a Level Mode stage, the ending)'}`]],
      rule: 'Played once, not looped.' };
  }
  const { scenes, lines } = openingPlaces(id);
  return { ...base, title: cue.title ?? `${id[0].toUpperCase()}${id.slice(1)} opening`, used: lines.some(([label]) => label !== 'Mapped, not reached now'), play: { moment: 'opening', scene: scenes[0] }, where: lines, rule: openingRule };
}

/** The seed tools/music-convert.py kept for a cue, if it says. */
function promptTake(id) {
  const prompt = PROMPTS.cues[id];
  return prompt?.take ?? prompt?.seeds?.join(' or ') ?? null;
}

const CUES = Object.keys(MUSIC_CUES).map(describe);
// The game's own notes: the synth stings played only when a victory or defeat has no cue (audio/sfx/ui.js; engine onMissing).
const STINGS = ['victory', 'defeat'].map((kind) => ({
  id: `sting-${kind}`, kind, title: `${kind === 'victory' ? 'Victory' : 'Defeat'} sting (synth)`,
  made: { kind: 'Generated live', text: 'Synthesised in the browser as it plays (audio/sfx/ui.js): a few sawtooth and triangle notes.', prompt: null, details: null },
  where: [['Fallback only', `played when a ${kind} has no music cue; every scene has the ${kind} cue now, so it is not heard in the game`]],
  rule: 'Played once.', used: false,
}));
const SILENT = [
  'The home screen and every menu opened from it',
  'Story chapters: no opening music (a fight\'s end still has its victory or defeat)',
  'Quick fights, Versus, Last Stand, the training yard and the Sandbox: no opening (victory or defeat at the end)',
  `Custom battles on ${Object.keys(CUSTOM_BATTLE.maps).filter((key) => !SCENE_MUSIC[key]).map(mapLabel).join(', ')}: no opening`,
  `Every opening after its first ${MUSIC.openingSeconds} s: the ambience and the fight are the sound`,
];
const DATA = {
  cues: CUES, stings: STINGS, silent: SILENT,
  numbers: { fade: MUSIC.fade, openingSeconds: MUSIC.openingSeconds, duck: MUSIC.duck, musicLevel: AUDIO_SETTINGS.defaults.music, masterLevel: AUDIO_SETTINGS.defaults.master },
};

// ---- The page --------------------------------------------------------------------------------------------------------------------------

/** The board itself (run in the page, after the modules: their names are in its scope). */
function board(DATA) {
  const $ = (id) => document.getElementById(id);
  const make = (tag, props = {}, ...children) => {
    const node = Object.assign(document.createElement(tag), props);
    for (const child of children) if (child != null) node.append(child);
    return node;
  };
  const clock = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const sizeOf = (bytes) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(2)} MB` : `${Math.round(bytes / 1e3)} KB`);

  let ctx = null;
  let out = null;
  let music = null;
  let raw = null;
  let now = null;
  const buffers = new Map();

  function sound() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      out = ctx.createGain();
      out.gain.value = Number($('volume').value);
      out.connect(ctx.destination);
      music = createMusic(ctx, out);
      setInterval(() => music.maintain(ctx.currentTime), 250);
      requestAnimationFrame(function readout() {
        show();
        requestAnimationFrame(readout);
      });
    }
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    return ctx;
  }
  function buffer(id) {
    if (!buffers.has(id)) buffers.set(id, (MUSIC_CUES[id].file ? fetch(MUSIC_CUES[id].file).then((response) => response.arrayBuffer()) : Promise.resolve(bytesOf(MUSIC_CUES[id].data))).then((bytes) => ctx.decodeAudioData(bytes)));
    return buffers.get(id);
  }
  function stopRaw(fade = 0.3) {
    if (!raw) return;
    const { source, gain } = raw;
    gain.gain.cancelScheduledValues(ctx.currentTime);
    gain.gain.setValueAtTime(gain.gain.value, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + fade);
    source.stop(ctx.currentTime + fade + 0.05);
    raw = null;
  }
  function stopAll() {
    if (!ctx) return;
    music.stop();
    stopRaw();
    now = null;
  }

  /** As the game plays it: the game's player told the moment (a new one cross-fades from the last). */
  function playInGame(cue) {
    sound();
    stopRaw();
    music.update({ moment: cue.play.moment, key: `board:${cue.id}:${ctx.currentTime}`, scene: cue.play.scene, duck: 0 }, ctx.currentTime);
    now = { label: `${cue.title}, as in game`, from: ctx.currentTime, game: true, cue, seen: false };
  }
  /** The file, start to end once, or its loop's seam: from a few seconds before the loop's end, looping. */
  async function playFile(cue, seam) {
    sound();
    music.stop();
    stopRaw(0.05);
    const decoded = await buffer(cue.id);
    const source = ctx.createBufferSource();
    source.buffer = decoded;
    const gain = ctx.createGain();
    gain.gain.value = cue.gain;
    source.connect(gain);
    gain.connect(out);
    // The seam heard from this far before the loop's end (s).
    const SEAM_LEAD = 5;
    let offset = 0;
    if (seam) {
      source.loop = true;
      source.loopStart = cue.loopStart;
      source.loopEnd = Math.min(decoded.duration, cue.loopEnd);
      offset = Math.max(cue.loopStart, source.loopEnd - SEAM_LEAD);
    }
    source.start(ctx.currentTime, offset);
    const mine = { source, gain };
    source.onended = () => {
      if (raw === mine) {
        raw = null;
        now = null;
      }
    };
    raw = mine;
    now = { label: `${cue.title}, ${seam ? 'loop seam' : 'whole file'}`, from: ctx.currentTime - offset, game: false, cue };
  }
  function playSting(sting) {
    sound();
    const voice = sfxVoice(ctx, out);
    playUi(voice, voice.out, uiParams(sting.kind), ctx.currentTime + 0.01, 0.8);
    now = { label: sting.title, from: ctx.currentTime, game: false, cue: null };
  }
  function show() {
    const status = $('status');
    // (The game's player decodes a cue the first time: until it plays, the cue is waited for; once it has played and gone, it is over.)
    if (now?.game) {
      const playing = music.status().id === now.cue.id;
      if (playing) {
        if (!now.seen) now.from = ctx.currentTime;
        now.seen = true;
      } else if (now.seen) now = null;
      else {
        status.textContent = `Loading: ${now.label}`;
        return;
      }
    }
    if (!now) {
      status.textContent = 'Nothing playing.';
      return;
    }
    const at = ctx.currentTime - now.from;
    let text = `Playing: ${now.label}, ${clock(at)}`;
    if (now.game && now.cue.play.moment === 'opening') text += ` (fades out at ${clock(DATA.numbers.openingSeconds - DATA.numbers.fade)})`;
    status.textContent = text;
  }

  function facts(cue) {
    const rows = [
      ['Made', `${cue.made.kind}. ${cue.made.text}`],
      ['Length', cue.seconds ? `${clock(cue.seconds)} file (${cue.seconds.toFixed(1)} s), ${cue.loop ? `looped ${cue.loopStart.toFixed(2)}-${cue.loopEnd.toFixed(2)} s (${(cue.loopEnd - cue.loopStart).toFixed(1)} s loop)` : 'played once'}` : 'a second or two'],
    ];
    if (cue.bytes) rows.push(['File', `${cue.kbps} kbps, ${cue.rate / 1000} kHz, ${sizeOf(cue.bytes)} (${cue.file ? `${cue.file}, fetched` : `${sizeOf(cue.embedded)} as base64 in the game`}); level ×${cue.gain.toFixed(2)}`]);
    if (cue.made.details) rows.push(['Prompt', `${cue.made.details}. "${cue.made.prompt}"`]);
    rows.push(['In game', cue.rule]);
    return make('dl', { className: 'facts' }, ...rows.flatMap(([term, text]) => [make('dt', { textContent: term }), make('dd', { textContent: text })]));
  }
  function card(cue, buttons) {
    return make('article', { className: `card${cue.used ? '' : ' unused'}`, id: cue.id },
      make('header', {}, make('h3', { textContent: cue.title }), make('span', { className: `tag ${cue.used ? 'live' : 'idle'}`, textContent: cue.tag ?? (cue.used ? 'In use' : 'Not played') })),
      make('p', { className: 'key', textContent: cue.bytes ? `cue '${cue.id}'` : `audio/sfx/ui.js '${cue.kind}'` }),
      make('ul', { className: 'where' }, ...cue.where.map(([label, text]) => make('li', {}, make('b', { textContent: `${label}: ` }), text))),
      facts(cue),
      make('div', { className: 'actions' }, ...buttons, make('button', { className: 'ghost', type: 'button', textContent: 'Stop', onclick: stopAll })));
  }
  const button = (text, onclick, kind = 'ghost') => make('button', { className: kind, type: 'button', textContent: text, onclick });

  const grid = $('cues');
  for (const cue of DATA.cues) {
    const buttons = [button('Play as in game', () => playInGame(cue), 'play'), button('Play file', () => playFile(cue, false))];
    if (cue.loop) buttons.push(button('Loop seam', () => playFile(cue, true)));
    grid.append(card(cue, buttons));
  }
  for (const sting of DATA.stings) grid.append(card(sting, [button('Play as in game', () => playSting(sting), 'play')]));
  $('silent').append(...DATA.silent.map((text) => make('li', { textContent: text })));
  const total = DATA.cues.reduce((sum, cue) => sum + cue.seconds, 0);
  $('count').textContent = `${DATA.cues.length} music files (${DATA.cues.filter((cue) => cue.used).length} in use, ${clock(total)} in all) and ${DATA.stings.length} synth stings`;
  $('volume').addEventListener('input', (event) => {
    if (out) out.gain.setTargetAtTime(Number(event.target.value), ctx.currentTime, 0.05);
  });
  $('stop').addEventListener('click', stopAll);
  window.musicBoard = { playInGame: (id) => playInGame(DATA.cues.find((cue) => cue.id === id)), playFile: (id, seam = false) => playFile(DATA.cues.find((cue) => cue.id === id), seam), stop: stopAll, status: () => ({ running: ctx?.state === 'running', music: music?.status() ?? null, now: now?.label ?? null }), cues: DATA.cues.map((cue) => cue.id) };
}

const STYLE = `
:root {
  --bg: #eef0f2; --surface: #fafbfc; --ink: #1b1f24; --muted: #5a626c; --line: #d2d7dd;
  --accent: #8e531a; --accent-ink: #ffffff; --live: #2d7349; --idle: #8a6d1f; --focus: #3d5a73;
  --body: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; --mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #14171b; --surface: #1d2126; --ink: #e5e8ec; --muted: #99a2ac; --line: #30363e;
  --accent: #d38c45; --accent-ink: #1a1208; --live: #6cc394; --idle: #d9b85c; --focus: #8fb0cc; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #14171b; --surface: #1d2126; --ink: #e5e8ec; --muted: #99a2ac; --line: #30363e;
  --accent: #d38c45; --accent-ink: #1a1208; --live: #6cc394; --idle: #d9b85c; --focus: #8fb0cc; color-scheme: dark }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { background: var(--bg); color: var(--ink); font: 15px/1.45 var(--body); margin: 0; padding: 0 16px 48px; overflow-x: hidden; }
.wrap { max-width: 1120px; margin: 0 auto; }
.top { position: sticky; top: 0; z-index: 2; background: var(--bg); border-bottom: 1px solid var(--line); padding: 12px 0; display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; }
h1 { font: 700 24px/1.1 var(--body); margin: 0; letter-spacing: 0.01em; }
.vol { display: flex; gap: 8px; align-items: center; font-size: 13px; color: var(--muted); }
.vol input { width: 120px; accent-color: var(--accent); }
#status { font: 13px/1.4 var(--mono); color: var(--muted); flex: 1 1 240px; min-width: 0; font-variant-numeric: tabular-nums; }
.intro { color: var(--muted); max-width: 75ch; margin: 16px 0 0; }
h2 { font: 650 18px/1.2 var(--body); margin: 28px 0 10px; }
.rules, .silent { margin: 0; padding-left: 20px; max-width: 80ch; }
.rules li, .silent li { margin: 2px 0; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 330px), 1fr)); gap: 12px; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.card.unused { border-style: dashed; }
.card header { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
h3 { font: 650 16px/1.25 var(--body); margin: 0; }
.tag { font: 600 10px/1 var(--mono); text-transform: uppercase; letter-spacing: 0.06em; padding: 3px 5px; border-radius: 3px; border: 1px solid currentColor; white-space: nowrap; }
.tag.live { color: var(--live); } .tag.idle { color: var(--idle); }
.key { margin: -4px 0 0; font: 12px var(--mono); color: var(--muted); }
.where { margin: 0; padding-left: 18px; font-size: 14px; }
.where li { margin: 2px 0; overflow-wrap: anywhere; }
.facts { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 3px 10px; font-size: 13px; }
.facts dt { color: var(--muted); }
.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 4px; }
button { font: 600 14px/1 var(--body); cursor: pointer; border-radius: 4px; padding: 9px 12px; border: 1px solid var(--accent); background: transparent; color: var(--accent); min-height: 36px; }
button.play { background: var(--accent); color: var(--accent-ink); }
button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
button:active { transform: translateY(1px); }
@media (prefers-reduced-motion: reduce) { button:active { transform: none; } }
`;

const MARKUP = `<div class="wrap">
<div class="top">
  <h1>HACS Music Board</h1>
  <label class="vol" for="volume">Volume <input id="volume" type="range" min="0" max="1.5" step="0.01" value="0.8"></label>
  <button id="stop" type="button">Stop all</button>
  <span id="status">Nothing playing. Sound starts only from a button.</span>
</div>
<p class="intro">Every piece of music the game has: <span id="count"></span>. <strong>Play as in game</strong> runs the game's own music player: an opening loops and fades after its while, a boss cue loops until stopped, a victory or defeat plays once, and pressing it on another cue while one plays cross-fades as the game does. <strong>Play file</strong> plays the file once, start to end; <strong>Loop seam</strong> starts a few seconds before the loop point so the join can be judged.</p>
<h2>How the game uses music</h2>
<ul class="rules">
  <li>Music only at moments; one cue at a time, never layered. A change of cue cross-fades over ${DATA.numbers.fade} s.</li>
  <li>Openings: the first ${DATA.numbers.openingSeconds} s of a Battle Mode battle or Level Mode stage, looped, then faded out over ${DATA.numbers.fade * 2} s.</li>
  <li>Boss: loops while a Level Mode boss fight is on. Victory and defeat: once, at the end of a fight with a man played.</li>
  <li>Under loud fighting the music ducks by up to ${Math.round(DATA.numbers.duck * 100)}%. The music slider defaults to ${Math.round(DATA.numbers.musicLevel * 100)}% under the master's ${Math.round(DATA.numbers.masterLevel * 100)}%; this board plays at the volume above.</li>
</ul>
<h2>Where there is no music</h2>
<ul class="silent" id="silent"></ul>
<h2>The music</h2>
<main class="grid" id="cues"></main>
</div>`;

const modules = MODULES.map((name) => `// ---- src/${name}.js ----\n${strip(name)}`).join('\n');
const script = `(() => {\n${modules}\n// ---- the board ----\n(${board.toString()})(${JSON.stringify(DATA)});\n})();\n`;
new vm.Script(script);
if (/<\/script/i.test(script)) throw new Error('a closing script tag inside the code');
const page = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>HACS Music Board</title>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="description" content="Every piece of music in HACS, with where it plays and how it was made.">\n<style>${STYLE}</style>\n</head>\n<body>\n${MARKUP}\n<script>\n${script}</script>\n</body>\n</html>\n`;
mkdirSync(dirname(out), { recursive: true });
// The pieces beside the page, at the paths the cues name (a published board takes them as its files).
writeFileSync(out, page);
for (const file of new Set(Object.values(MUSIC_CUES).filter((cue) => cue.file).map((cue) => cue.file))) {
  mkdirSync(dirname(`${dirname(out)}/${file}`), { recursive: true });
  copyFileSync(file, `${dirname(out)}/${file}`);
}
console.log(`${out}: ${(page.length / 1e6).toFixed(2)} MB (${page.length} bytes), ${CUES.length} cues and ${STINGS.length} stings`);
