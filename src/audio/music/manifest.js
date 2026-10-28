// The music cues: sparse period pieces rendered with ACE-Step 1.5 (tools/music-prompts.json) and embedded by
// tools/music-convert.py, which writes the data modules and the generated blocks below.
// A looped cue's file is its loop with a little of its own end before loopStart and of its start after loopEnd, so
// play it with source.loop = true between loopStart and loopEnd (seconds); the seam is already cross-faded.
// gain: the linear gain that brings the cue to about -18 LUFS (above 1 where the file was kept down for its peak).

// <generated imports>
import { MUSIC_DATA_MENU } from './data/menu.js';
import { MUSIC_DATA_ROMAN } from './data/roman.js';
import { MUSIC_DATA_MEDIEVAL } from './data/medieval.js';
import { MUSIC_DATA_JAPAN } from './data/japan.js';
import { MUSIC_DATA_CHINA } from './data/china.js';
import { MUSIC_DATA_KOREA } from './data/korea.js';
import { MUSIC_DATA_AZTEC } from './data/aztec.js';
import { MUSIC_DATA_OTTOMAN } from './data/ottoman.js';
import { MUSIC_DATA_MODERN } from './data/modern.js';
import { MUSIC_DATA_SCOTTISH } from './data/scottish.js';
import { MUSIC_DATA_BOSS } from './data/boss.js';
import { MUSIC_DATA_VICTORY } from './data/victory.js';
import { MUSIC_DATA_DEFEAT } from './data/defeat.js';
// </generated imports>

export const MUSIC_CUES = {
  // <generated cues>
  menu: { data: MUSIC_DATA_MENU, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 55.0570, gain: 1.000 },
  roman: { data: MUSIC_DATA_ROMAN, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 36.2000, gain: 1.047 },
  medieval: { data: MUSIC_DATA_MEDIEVAL, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 37.5328, gain: 1.000 },
  japan: { data: MUSIC_DATA_JAPAN, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 36.2000, gain: 1.000 },
  china: { data: MUSIC_DATA_CHINA, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 36.1999, gain: 1.000 },
  korea: { data: MUSIC_DATA_KOREA, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 38.6001, gain: 1.000 },
  aztec: { data: MUSIC_DATA_AZTEC, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 37.5333, gain: 1.175 },
  ottoman: { data: MUSIC_DATA_OTTOMAN, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 36.2000, gain: 1.012 },
  modern: { data: MUSIC_DATA_MODERN, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 34.0784, gain: 1.202 },
  scottish: { data: MUSIC_DATA_SCOTTISH, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 45.0003, gain: 1.012 },
  boss: { data: MUSIC_DATA_BOSS, mime: 'audio/mpeg', loop: true, loopStart: 0.2000, loopEnd: 37.5333, gain: 1.000 },
  victory: { data: MUSIC_DATA_VICTORY, mime: 'audio/mpeg', loop: false, loopStart: 0.0000, loopEnd: 12.0000, gain: 1.122 },
  defeat: { data: MUSIC_DATA_DEFEAT, mime: 'audio/mpeg', loop: false, loopStart: 0.0000, loopEnd: 12.0000, gain: 1.000 },
  // </generated cues>
};

/**
 * The opening cue of each scene. A scene is a scenario id (scenarios.js), else the level stage id, else the sandbox
 * place (render.js PLACE_ARENAS; port and subway are both). A place left out (the ring, the meadow, the open plain
 * and field, the bare stage) has no music.
 */
export const SCENE_MUSIC = {
  legion: 'roman',
  rebellion: 'medieval',
  // The battles of the stake, the ditch and the palisade: no new music, the cue of their people.
  agincourt: 'medieval',
  cerignola: 'medieval',
  nagashino: 'japan',
  pyongyang: 'korea',
  // No Andean cue: the nearest in the game, the Americas' (the Mexica's).
  cajamarca: 'aztec',
  zeelandia: 'china',
  wokou: 'china',
  qiJiguang: 'china',
  rhodes: 'ottoman',
  port: 'modern',
  pride: 'modern',
  subway: 'modern',
  dunnottar: 'scottish',
  colosseum: 'roman',
  stadium: 'modern',
  town: 'medieval',
  sengoku: 'japan',
  coastFort: 'china',
  coastVillage: 'china',
  jiangnan: 'china',
};

const BOSS_MUSIC = { dunnottar: 'boss' };

/** The cue for a moment ('menu' | 'opening' | 'boss' | 'victory' | 'defeat') in a scene (null for the menu), or null for none. */
export function cueFor(scene, moment) {
  if (moment === 'menu' || moment === 'victory' || moment === 'defeat') return moment;
  if (moment === 'opening') return SCENE_MUSIC[scene] ?? null;
  if (moment === 'boss') return BOSS_MUSIC[scene] ?? null;
  return null;
}
