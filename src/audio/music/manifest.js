// The music cues. The scenes' music is supplied recordings (assets/music/*.mp3, one piece each, 3 to 4 minutes: period instruments over a
// gothic orchestra), fetched the first time a scene wants its piece (`file`, beside the page) and kept. The victory and defeat stings
// (supplied recordings too, about 13 s each, played once) and the Dunnottar boss's choir are embedded (`data`, base64: data/*.js), so
// a sting is ready the moment a fight ends.
// A cue loops between loopStart and loopEnd (s): a whole piece from its first sound (past the file's lead of silence) to its end.
// gain: the linear gain that brings the cue to about -18 LUFS (each piece measured with ffmpeg's ebur128).
// The pieces were converted from the supplied Opus to MP3 (128 kbps, 44.1 kHz), the format of the game's other music: every
// browser's decodeAudioData reads it, and Safari is not sure to read Opus. Files, not base64: thirteen pieces would put some 55 MB
// of text in the page's code, loaded whether a scene wants them or not.

import { MUSIC_DATA_BOSS_CHOIR } from './data/bosschoir.js';
import { MUSIC_DATA_VICTORY } from './data/victory.js';
import { MUSIC_DATA_DEFEAT } from './data/defeat.js';

/** A supplied piece: its file in assets/music, looped whole from `start` to `end` (s), at `gain`. */
const piece = (name, title, start, end, gain) => ({ file: `assets/music/${name}.mp3`, title, mime: 'audio/mpeg', loop: true, loopStart: start, loopEnd: end, gain });

export const MUSIC_CUES = {
  // Gothic orchestral with a Roman legion's march: bronze horns, frame drum, tympanum.
  roman: piece('iron-legion', 'March of the Iron Legion', 0, 208.01, 0.832),
  // Dark gothic orchestral: pipe organ, strings, low brass, timpani, wordless choir. Europe's middle ages, and a boss's fight.
  medieval: piece('gothic-boss', 'Gothic boss fight', 0, 198.01, 0.676),
  boss: piece('gothic-boss', 'Gothic boss fight', 0, 198.01, 0.676),
  // A Sengoku battlefield: taiko, shakuhachi, shamisen.
  japan: piece('samurais-come', 'Samurais Come', 0.65, 212.65, 0.776),
  // Feudal Japanese stealth into action: shakuhachi alone, then taiko, shinobue, shamisen.
  shinobi: piece('shinobi', 'Shinobi Infiltration', 0, 194.24, 0.767),
  // Ming coastal: dizi, guzheng, erhu, war drums, gong.
  china: piece('forbidden-coast', 'Tides of the Forbidden Coast', 0.69, 207.21, 0.741),
  // Joseon court and war: buk, janggu, piri, daegeum, haegeum.
  korea: piece('frost-palace', 'Frost on the Palace', 0, 187.81, 0.759),
  // Aztec ritual: ocarina, log drums, rattles, conch.
  aztec: piece('fifth-sun', 'Altar of the Fifth Sun', 0, 189.21, 0.822),
  // An Ottoman siege: the mehter's zurna, davul, kettle drums and cymbals.
  ottoman: piece('crescent-gate', 'Crescent at the Gate', 0, 217.61, 0.741),
  // A steppe horde: throat-singing drone, war drums, the gallop, low brass (two takes: the Huns', and the Mongols' longer one).
  huns: piece('huns-come', 'The Huns Come', 0.36, 213.61, 0.582),
  mongol: piece('mongol-comes', 'The Mongol Comes', 0.2, 243.61, 0.624),
  // The city at night: synth pads, sub bass, a slow trip-hop beat under the orchestra (two takes).
  modern: piece('neon-cathedral', 'Neon Cathedral of Rain', 0.67, 218.01, 0.596),
  vespers: piece('streetlight-vespers', 'Streetlight Vespers', 0.53, 198.81, 0.624),
  // Highland bagpipe, drone and bodhran.
  scottish: piece('scottish-cliffs', 'Lament of the Scottish Cliffs', 0.73, 224.93, 0.716),
  // A triumphant fanfare: bronze horns, pipe organ, timpani (D major). Measured -16.7 LUFS.
  victory: { data: MUSIC_DATA_VICTORY, title: 'Victory Fanfare', mime: 'audio/mpeg', loop: false, loopStart: 0, loopEnd: 12.8, gain: 0.861 },
  // A lament: solo horn, low strings, organ, a timpani roll (D minor). Measured -13.6 LUFS.
  defeat: { data: MUSIC_DATA_DEFEAT, title: 'Defeat Lament', mime: 'audio/mpeg', loop: false, loopStart: 0, loopEnd: 13.08, gain: 0.603 },
  // A supplied recording made with Suno (data/bosschoir.js): the whole piece looped, from its first sound to where its closing fade
  // has died (the file's 0.24 s lead is its silence and the MP3's delay). At -21.3 LUFS: the gain brings it to the others' -18.
  bossChoir: { data: MUSIC_DATA_BOSS_CHOIR, mime: 'audio/mpeg', loop: true, loopStart: 0.2400, loopEnd: 178.2000, gain: 1.462 },
};

/**
 * The opening cue of each scene. A scene is a scenario id (scenarios.js), else the level stage id, else the sandbox
 * place (render.js PLACE_ARENAS; port and subway are both). A place left out (the ring, the meadow, the open plain
 * and field, the bare stage) has no music.
 */
export const SCENE_MUSIC = {
  legion: 'roman',
  rebellion: 'medieval',
  // The battles of the stake and the ditch: the cue of their people.
  agincourt: 'medieval',
  cerignola: 'medieval',
  sekigahara: 'japan',
  pyongyang: 'korea',
  // No Andean cue: the nearest in the game, the Americas' (the Mexica's).
  cajamarca: 'aztec',
  zeelandia: 'china',
  // The Japanese pirates slipping into a Ming water town.
  wokou: 'shinobi',
  qiJiguang: 'china',
  rhodes: 'ottoman',
  port: 'modern',
  pride: 'modern',
  subway: 'vespers',
  dunnottar: 'scottish',
  colosseum: 'roman',
  stadium: 'modern',
  town: 'medieval',
  sengoku: 'japan',
  coastFort: 'china',
  coastVillage: 'china',
  jiangnan: 'china',
  // The story's canal town, as a custom battle's ground (custombattle.js).
  canaltown: 'china',
  // The horse-archer battles and their plains: the steppe horde's. Attila's Huns at the Catalaunian Plains; north of the Gobi
  // (the Xiongnu's own steppe, Mongolia's) and the Parthian horse archers at Carrhae, the longer take.
  mobei: 'mongol',
  catalaunian: 'huns',
  carrhae: 'mongol',
  // Sarhu: the Ming army's (the side the player leads).
  sarhu: 'china',
};

// (Dunnottar's boss: the supplied choir track; the 'boss' cue for any boss given no track of its own.)
export const BOSS_MUSIC = { dunnottar: 'bossChoir' };

/** The cue for a moment ('opening' | 'boss' | 'victory' | 'defeat') in a scene, or null for none (the menus have no music) (a boss: his scene's own track, else the 'boss' cue). */
export function cueFor(scene, moment) {
  if (moment === 'victory' || moment === 'defeat') return moment;
  if (moment === 'opening') return SCENE_MUSIC[scene] ?? null;
  if (moment === 'boss') return BOSS_MUSIC[scene] ?? 'boss';
  return null;
}
