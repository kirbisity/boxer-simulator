// The sound board: one self-contained page that plays every sound effect the game has, the recorded sets take by take and each event
// as the game plays it (sfx/sampled.js over the synth families, at the engine's gain), with a light-to-heavy slider where the game scales
// the sound by the event's weight. The audio modules are put in it as they are (as tools/bundle.js does, without the rest of the game),
// the samples as base64. Usage: node tools/soundboard.js [out.html] (default dist/sound-board.html).

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

// In load order (each after what it imports).
const MODULES = ['audio/synth', 'audio/ear', 'audio/sfx/impact', 'audio/sfx/clash', 'audio/sfx/wound', 'audio/sfx/swing', 'audio/sfx/step', 'audio/sfx/fall', 'audio/sfx/voice', 'audio/sfx/horse', 'audio/sfx/ranged', 'audio/sfx/world', 'audio/sfx/spark', 'audio/sfx/ui', 'audio/sfx/thump', 'audio/sfx/art', 'audio/sfx/sampled', 'audio/samples', 'audio/families', 'audio/ambience'];
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
      { title: 'Sword swing', sets: ['bladeswing'], isNew: true, event: (s) => ({ type: 'swing', speed: lerp(8, 35, s), length: 1, mass: 1.3, head: 'blade' }), ends: ['8 m/s', '35 m/s'], note: 'The fist\'s and the mace\'s whooshes, higher and thinner.' },
      { title: 'Point into leather', sets: ['stab'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'point', covering: 'leather', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Shield bash', sets: ['punch'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'shield', covering: 'padded', part: 'trunk' }), ends: ['3 J', '300 J'], note: 'The punch takes, lower.' },
      { title: 'Whip lash', sets: ['whip'], isNew: true, event: (s) => ({ type: 'hit', energy: log(2, 40, s), striker: 'lash', covering: 'flesh', part: 'trunk' }), ends: ['2 J', '40 J'], note: 'The tip\'s energy.' },
      { title: 'Whip on mail', sets: ['whip'], isNew: true, event: (s) => ({ type: 'hit', energy: log(2, 40, s), striker: 'lash', covering: 'mail', part: 'trunk' }), ends: ['2 J', '40 J'], note: 'On armour or a shield: shorter, higher, the synth\'s knock beside it.' },
    ]],
    ['Steel, armour and shields', 'Weapon on weapon, on plate, on a helmet, on a wooden shield.', [
      { title: 'Sword on sword', sets: ['clash'], event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'blade', mass: 1.2 }), ends: ['1 m/s', '20 m/s'] },
      { title: 'Weapon on plate', sets: ['break'], event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'plate', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Blow on a helmet', sets: ['helmet'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'plate', part: 'head', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Blow on a wooden shield', sets: ['woodshield'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'wood', part: 'shield', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Blade on mail', sets: ['mail'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'mail', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'] },
      { title: 'Mace on mail', sets: ['mail'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blunt', covering: 'mail', part: 'trunk', mass: 1.6 }), ends: ['5 J', '400 J'], note: 'Lower.' },
      { title: 'Blade on lamellar', sets: ['lamellar'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'lamellar', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'], note: 'Derived: the mail\'s rattle lower over a plate\'s knock.' },
      { title: 'Blade on scale', sets: ['lamellar'], isNew: true, event: (s) => ({ type: 'hit', energy: log(5, 400, s), striker: 'blade', covering: 'scale', part: 'trunk', mass: 1.2 }), ends: ['5 J', '400 J'], note: 'The lamellar takes, higher.' },
      { title: 'Punch on plate', sets: ['platepunch'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'fist', covering: 'plate', part: 'trunk' }), ends: ['3 J', '300 J'], note: 'Derived: the punch\'s thud under the plate\'s clank (the sword-on-plate, helmet and clash takes), duller and shorter.' },
      { title: 'Kick on plate', sets: ['platepunch'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'foot', covering: 'plate', part: 'trunk' }), ends: ['3 J', '300 J'], note: 'Lower.' },
      { title: 'Punch on mail', sets: ['punch', 'mail'], isNew: true, event: (s) => ({ type: 'hit', energy: log(3, 300, s), striker: 'fist', covering: 'mail', part: 'trunk' }), ends: ['3 J', '300 J'], note: 'The punch, the rings under it.' },
      { title: 'Blade on a steel shield', sets: ['shieldclang'], isNew: true, event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'shieldmetal', mass: 1.2 }), ends: ['1 m/s', '20 m/s'], note: 'The helmet\'s and the plate\'s takes.' },
      { title: 'Steel on a haft', sets: ['woodshield'], isNew: true, event: (s) => ({ type: 'clash', speed: log(1, 20, s), a: 'blade', b: 'haft', mass: 1.2 }), ends: ['1 m/s', '20 m/s'], note: 'The shield take, higher and shorter.' },
    ]],
    ['Wounds and bones', 'The slider is the wound\'s severity.', [
      { title: 'Cut', sets: ['gore'], event: (s) => ({ type: 'wound', kind: 'cut', severity: s }), ends: ['minor', 'deep'] },
      { title: 'Bone breaking', sets: ['bones'], event: (s) => ({ type: 'wound', kind: 'bone', severity: s }), ends: ['crack', 'break'] },
      { title: 'Stab', sets: ['stab'], isNew: true, event: (s) => ({ type: 'wound', kind: 'stab', severity: s }), ends: ['minor', 'deep'] },
      { title: 'Skull or neck crushed', sets: ['bones'], event: () => ({ type: 'wound', kind: 'crush', severity: 1 }), ends: null },
    ]],
    ['Armour and falls', 'The kit\'s clank over each step, and men and weapons hitting the floor.', [
      { title: 'Plate, walking on sand', sets: ['step-grass-walk', 'armourstep'], event: (s) => ({ type: 'step', speed: 1.4, mass: lerp(55, 120, s), surface: 'sand', armour: 'plate' }), ends: MASS, note: 'The clank over the grass\'s steps, lower (sand has no recording of its own).' },
      { title: 'Mail, running on stone', sets: ['step-stone-run', 'armourstep'], event: (s) => ({ type: 'step', speed: 5, mass: lerp(55, 120, s), surface: 'stone', armour: 'mail' }), ends: MASS },
      { title: 'Man in plate falls', sets: ['clatter', 'bodyfall'], event: (s) => ({ type: 'fall', mass: 90, speed: log(0.8, 9, s), surface: 'earth', armour: 'plate' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Man falls on stone', sets: ['bodyfall'], isNew: true, event: (s) => ({ type: 'fall', mass: 80, speed: log(0.8, 9, s), surface: 'stone', armour: 'none' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Man falls on earth, by weight', sets: ['bodyfall'], isNew: true, event: (s) => ({ type: 'fall', mass: lerp(55, 120, s), speed: 4, surface: 'earth', armour: 'none' }), ends: MASS, note: 'At 4 m/s: a heavier man louder, lower, longer.' },
      { title: 'Man in mail lands a jump', sets: ['armourstep'], event: (s) => ({ type: 'land', mass: 85, speed: log(0.8, 9, s), surface: 'stone', armour: 'mail' }), ends: ['0.8 m/s', '9 m/s'] },
      { title: 'Man falls in water', sets: ['step-water'], isNew: true, event: (s) => ({ type: 'fall', mass: 80, speed: log(0.8, 9, s), surface: 'water', armour: 'none' }), ends: ['0.8 m/s', '9 m/s'], note: 'The steps\' splash, lower and drawn out; the synth\'s splash beside it.' },
      { title: 'Man falls in mud', sets: ['step-mud'], isNew: true, event: (s) => ({ type: 'fall', mass: 80, speed: log(0.8, 9, s), surface: 'mud', armour: 'none' }), ends: ['0.8 m/s', '9 m/s'] },
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
      { title: 'Boards', sets: ['step-stone-walk'], isNew: true, event: step('wood', 1.4), ends: MASS, note: 'The stone\'s steps, lower; the synth\'s knock of the planks beside.' },
      { title: 'Sand', sets: ['step-grass-walk'], isNew: true, event: step('sand', 1.4), ends: MASS, note: 'The grass\'s steps, lower; the synth\'s crunch beside.' },
      { title: 'Snow', sets: ['step-grass-walk'], isNew: true, event: step('snow', 1.4), ends: MASS, note: 'The grass\'s steps, lower still; the synth\'s crunch beside.' },
    ]],
    ['Horses', 'The slider is the gait, from a walk to a gallop.', [
      { title: 'Hooves on stone', sets: ['hoof-stone'], event: (s) => ({ type: 'horse', kind: 'hoof', gait: ['walk', 'trot', 'canter', 'gallop'][Math.min(3, Math.floor(s * 4))], speed: lerp(1.5, 12, s), surface: 'stone', mass: 550 }), ends: ['walk', 'gallop'] },
      { title: 'Hooves on turf', sets: ['hoof-soft'], event: (s) => ({ type: 'horse', kind: 'hoof', gait: ['walk', 'trot', 'canter', 'gallop'][Math.min(3, Math.floor(s * 4))], speed: lerp(1.5, 12, s), surface: 'grass', mass: 550 }), ends: ['walk', 'gallop'] },
      { title: 'Hooves in mud', sets: ['step-mud'], isNew: true, event: (s) => ({ type: 'horse', kind: 'hoof', gait: ['walk', 'trot', 'canter', 'gallop'][Math.min(3, Math.floor(s * 4))], speed: lerp(1.5, 12, s), surface: 'mud', mass: 550 }), ends: ['walk', 'gallop'], note: 'A man\'s squelch, lower and louder.' },
      { title: 'Neigh', sets: ['neigh'], event: (s) => ({ type: 'horse', kind: 'neigh', mass: lerp(700, 300, s) }), ends: ['700 kg', '300 kg'], note: 'A smaller horse higher.' },
      { title: 'Snort (synth)', sets: [], event: () => ({ type: 'horse', kind: 'snort', mass: 500 }), ends: null },
    ]],
    ['Ranged and world', 'Guns and thunder are heard over the whole map, at their own distance.', [
      { title: 'Matchlock at 40 m', sets: ['gunshot'], event: () => ({ type: 'shot', kind: 'matchlock' }), distance: 40, ends: null },
      { title: 'Thunder', sets: ['thunder'], isNew: true, event: (s) => ({ type: 'thunder', distance: log(5000, 150, s) }), distance: (s) => log(5000, 150, s), ends: ['5 km', '150 m'], note: 'Far: the rumble only, lower. Near: the crack.' },
      { title: 'Bow', sets: ['bow'], isNew: true, event: () => ({ type: 'shot', kind: 'bow' }), ends: null, note: 'The release recorded, the synth\'s thrum of the string under it.' },
      { title: 'Bow drawn', sets: ['bowdraw'], isNew: true, event: (s) => ({ type: 'draw', seconds: lerp(0.45, 1.1, s) }), ends: ['a quick 0.45 s', 'a slow 1.1 s'], note: 'Its wood and string bending: the creak fitted to the draw, tightest as the string goes. A bow only (not a crossbow or a gun).' },
      { title: 'Bow drawn and loosed', sets: ['bowdraw', 'bow'], isNew: true, direct: (voice, out, when, s) => {
        // (One loose as the game plays it at 2 m: the creak from the draw's first instant, the release at the loose.)
        const seconds = lerp(0.45, 1.1, s);
        const sound = (event, at) => {
          const family = SOUND_FAMILIES[event.type];
          const params = family.params(event);
          return playWithSamples(bank, voice, family, event, params, at, gainOfLevel(levelAtEar(params.level + (family.boost ?? 0), 2, false)));
        };
        sound({ type: 'draw', seconds }, when);
        return sound({ type: 'shot', kind: 'bow' }, when + seconds);
      }, ends: ['a quick 0.45 s', 'a slow 1.1 s'], note: 'One action in the game, two sounds: the draw, then the release.' },
      { title: 'Crossbow', sets: ['crossbow'], isNew: true, event: () => ({ type: 'shot', kind: 'crossbow' }), ends: null },
      { title: 'Cannon at 200 m', sets: ['gunshot'], isNew: true, event: () => ({ type: 'shot', kind: 'cannon' }), distance: 200, ends: null, note: 'The pistol\'s report at half speed over the synth\'s boom.' },
      { title: 'Arrow on mail', sets: ['mail'], isNew: true, event: (s) => ({ type: 'arrowhit', speed: log(15, 90, s), covering: 'mail' }), ends: ['15 m/s', '90 m/s'] },
      { title: 'Arrow into the body', sets: ['stab'], isNew: true, event: (s) => ({ type: 'arrowhit', speed: log(15, 90, s), covering: 'flesh' }), ends: ['15 m/s', '90 m/s'] },
      { title: 'Arrow on plate', sets: ['break'], isNew: true, event: (s) => ({ type: 'arrowhit', speed: log(15, 90, s), covering: 'plate' }), ends: ['15 m/s', '90 m/s'] },
      { title: 'Arrow into the ground (synth)', sets: [], event: (s) => ({ type: 'arrowhit', speed: log(15, 90, s), covering: 'ground' }), ends: ['15 m/s', '90 m/s'] },
      { title: 'Door opens', sets: ['door-creak'], isNew: true, event: () => ({ type: 'mech', kind: 'door', state: 'opening' }), ends: null },
      { title: 'Door shuts', sets: ['door-creak', 'door-slam'], isNew: true, event: () => ({ type: 'mech', kind: 'door', state: 'closing' }), ends: null },
      { title: 'Chest lid shuts', sets: ['door-creak', 'door-slam'], isNew: true, event: () => ({ type: 'mech', kind: 'chest', state: 'closing' }), ends: null, note: 'The door\'s takes, higher, quieter, shorter.' },
      { title: 'Portcullis let down', sets: ['portcullis-chain', 'portcullis-slam'], isNew: true, event: () => ({ type: 'mech', kind: 'portcullis', state: 'down' }), ends: null },
      { title: 'Portcullis raised', sets: ['chain'], isNew: true, event: () => ({ type: 'mech', kind: 'portcullis', state: 'opening' }), ends: null },
      { title: 'Barred gate shuts', sets: ['door-creak', 'portcullis-slam'], isNew: true, event: () => ({ type: 'mech', kind: 'gate', state: 'closing' }), ends: null, note: 'The door\'s creak lower, the portcullis\'s slam higher and shorter.' },
      { title: 'Drawbridge', sets: ['chain'], isNew: true, event: () => ({ type: 'mech', kind: 'drawbridge', state: 'down' }), ends: null, note: 'The heavy chain slower and lower, two runs, the synth\'s chain and timber beside it.' },
      { title: 'Shackles shaken', sets: ['shackle'], isNew: true, event: (s) => ({ type: 'mech', kind: 'shackles', state: 'open', strength: s }), ends: ['a sob', 'a wail'], note: 'A chained prisoner (Dunnottar\'s vault) as he weeps.' },
      { title: 'Whip on a chained prisoner', sets: ['whip', 'shackle'], isNew: true, event: (s) => ({ type: 'hit', energy: log(2, 40, s), striker: 'lash', covering: 'flesh', part: 'trunk', chained: true }), ends: ['2 J', '40 J'], note: 'The lash, his shackles jerked under it.' },
      { title: 'Lock', sets: ['crossbow-latch'], isNew: true, event: () => ({ type: 'mech', kind: 'lock', state: 'unlocked' }), ends: null, note: 'The crossbow\'s latch: the key\'s click, the bolt over.' },
      { title: 'Lever', sets: ['crossbow-crank'], isNew: true, event: () => ({ type: 'mech', kind: 'lever', state: 'opening' }), ends: null, note: 'The crossbow\'s crank, the synth\'s clunk beside it.' },
      { title: 'Ladder set down', sets: ['woodshield'], isNew: true, event: () => ({ type: 'mech', kind: 'ladder', state: 'opening' }), ends: null },
      { title: 'Thing picked up (synth)', sets: [], event: () => ({ type: 'mech', kind: 'pickup', state: 'open' }), ends: null },
    ]],
    ['Cries and the charge', 'The recorded cries, a man\'s and a woman\'s, as the game plays them (rationed by audio/cries.js: most blows are taken in silence). The slider is the body, small to big; the second the age: the voice\'s pitch follows both.', [
      ...['male', 'female'].flatMap((sex) => [['hurt', 'Hurt (a blow taken)'], ['scream', 'Scream (a severe wound, a limb lost)'], ['moan', 'Moan (lying or crawling hurt)'], ['fear', 'Fear (broken, running)'], ['dying', 'Dying']].map(([kind, what]) => ({
        title: `${sex === 'male' ? 'Man' : 'Woman'}: ${what}`, sets: [`voice-${sex}-${kind}`], isNew: true, age: true,
        event: (s, age = 30) => {
          const body = sex === 'male' ? { height: lerp(1.6, 1.98, s), mass: lerp(58, 115, s) } : { height: lerp(1.5, 1.82, s), mass: lerp(45, 85, s) };
          return { type: 'voice', kind, sex, who: 7, cry: { kind, sex, intensity: 0.8, rate: cryRate({ sex, age, id: 7, ...body }, Math.random() * 2 - 1) } };
        },
        ends: sex === 'male' ? ['1.60 m', '1.98 m'] : ['1.50 m', '1.82 m'],
      }))),
      { title: 'Army charge', sets: ['charge'], isNew: true, direct: (voice, out, when, s) => {
        const take = bank?.pick('charge');
        // (As engine.js plays it: each man's shout, 92 dB at 1 m, summed over `s`'s men, the line 60 m off; here 4 s of the loop.)
        const men = Math.round(log(16, 400, s));
        return take ? playSample(voice, out, take, { rate: 1, trim: 1, seconds: 4, fade: 1, skip: 0 }, when, gainOfLevel(92 + 10 * Math.log10(men / 3600))) : when;
      }, ends: ['16 men', '400 men'], note: 'Heard only when a side of 20 or more has 10 or more (and a third of it) running at the enemy together; fades as the lines meet.' },
    ]],
    ['Robots, breath and the menu', 'A robot shorting out (at its death and at a cut stump); breathing, heard only when a man is all but spent (the slider: from the stamina\'s last tenth to deep in the overdraft); the menu\'s buttons.', [
      { title: 'Robot shorting out', sets: ['shock'], isNew: true, event: (s) => ({ type: 'robotSpark', kind: s < 0.5 ? 'stump' : 'death', intensity: lerp(0.7, 1, s) }), ends: ['a stump', 'its death'] },
      ...['male', 'female'].map((sex) => ({
        title: `${sex === 'male' ? 'Man' : 'Woman'} out of breath`, sets: [`breath-${sex}-in`, `breath-${sex}-out`], isNew: true,
        direct: (voice, out, when, s) => {
          // (Two breaths, in and out, at the engine's cadence for the exertion, at an adult's voice.)
          const exertion = lerp(0.9, 1.5, s);
          const p = breathParams(exertion, sex === 'male' ? 1.78 : 1.65);
          const rate = cryRate({ sex, id: 7, height: sex === 'male' ? 1.78 : 1.65, mass: sex === 'male' ? 80 : 62, age: 30 });
          let t = when;
          for (const inhale of [true, false, true, false]) {
            if (bank) playPlan(bank, voice, breathPlan(p, inhale, exertion, sex, rate), t, gainOfLevel(p.level - 6));
            t += (inhale ? p.inSeconds : p.outSeconds) + 0.05;
          }
          return t;
        },
        ends: ['stamina 10%', 'deep overdraft'],
      })),
      ...['click', 'confirm', 'back'].map((kind) => ({ title: `Menu: ${kind}`, sets: kind === 'confirm' ? ['ui-tap', 'ui-chime'] : ['ui-tap'], isNew: true, direct: (voice, out, when) => (bank && playPlan(bank, voice, uiSamplePlan(kind), when, 0.8)) ?? playUi(voice, out, uiParams(kind), when, 0.8), ends: null, note: { click: 'The recorded tap.', back: 'The tap, lower.', confirm: 'The tap a little higher, the chime under it.' }[kind] })),
    ]],
    ['Synthesised families', 'What the game makes with no recording: the synth\'s voices (not played in the game: the recorded cries are), its breath (in the game only before the recordings load), an arrow going past, the hit-feel thump, the weapon art and the menu\'s notes (now only the victory and the defeat).', [
      { title: 'Voice: effort', sets: [], event: (s) => ({ type: 'voice', kind: 'effort', strength: s, size: 1.8, mass: 85 }), ends: ['soft', 'strong'], note: 'The synth\'s voices are not played in the game: the recorded cries are (Synth only plays this one).' },
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
    const event = card.event(s, card.ageOf?.());
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
      // (A cry's card: the age as well, 14 to 70 years.)
      const ageSlider = card.age ? el('input', { type: 'range', min: '14', max: '70', step: '1', value: '30', id: `age-${n}`, className: 'weight' }) : null;
      if (ageSlider) card.ageOf = () => Number(ageSlider.value);
      const info = el('p', { className: 'readout' });
      const weight = () => (slider ? Number(slider.value) : 1);
      const refresh = () => (info.textContent = readout(card, weight()));
      const buttons = el('div', { className: 'actions' },
        el('button', { type: 'button', className: 'play', textContent: recorded ? 'Play as in game' : 'Play', onclick: () => play(card, weight(), 'game') }),
        recorded && !card.direct && !card.age ? el('button', { type: 'button', className: 'ghost', textContent: 'Synth only', onclick: () => play(card, weight(), 'synth') }) : null);
      const takes = recorded ? el('div', { className: 'takes' }, ...[...new Set(card.sets)].flatMap((set) => [
        el('span', { className: 'set', textContent: set }),
        ...SAMPLE_SETS[set].map((file, index) => el('button', { type: 'button', className: 'take', textContent: String(index + 1), title: `${file}.mp3, as recorded`, onclick: () => playTake(file) })),
      ])) : null;
      const tags = el('div', { className: 'tags' }, el('span', { className: recorded ? 'tag rec' : 'tag syn', textContent: recorded ? 'recorded' : 'synth' }), card.isNew ? el('span', { className: 'tag new', textContent: 'new' }) : null);
      grid.append(el('article', { className: 'card' },
        el('header', {}, el('h3', { textContent: card.title }), tags),
        card.note ? el('p', { className: 'note', textContent: card.note }) : null,
        slider ? el('label', { className: 'slider', htmlFor: slider.id }, el('span', { textContent: card.ends[0] }), slider, el('span', { textContent: card.ends[1] })) : null,
        ageSlider ? el('label', { className: 'slider', htmlFor: ageSlider.id }, el('span', { textContent: 'age 14' }), ageSlider, el('span', { textContent: '70' })) : null,
        buttons, takes, info));
      if (slider) slider.addEventListener('input', refresh);
      if (ageSlider) ageSlider.addEventListener('input', refresh);
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
  // Fires: the fire's loop at each size as ambience.js plays it at 2 m (FIRE_SOUND: louder, fuller and lower the bigger the fire).
  const FIRES = [
    ['torch', 'Torch', 0.28, 'A torch in its bracket: a quiet, thin crackle.'],
    ['brazier', 'Brazier', 0.5, 'A brazier: louder and fuller.'],
    ['hearth', 'Hearth', 0.6, 'A hearth\'s fire.'],
    ['blaze', 'Large blaze', 1.5, 'A bonfire, a burning house: loudest, a deep roar. (None in the game yet: any fire given a size is heard so.)'],
  ];
  function toggleFire(key, size, button) {
    audio();
    if (ctx.state !== 'running') ctx.resume();
    const now = ctx.currentTime;
    if (playing[key]) {
      playing[key].gain.gain.setTargetAtTime(0, now, 0.15);
      playing[key].loop.stop(now + 1);
      delete playing[key];
    } else {
      const loop = bank.loop('fire');
      if (!loop) return (status.textContent = 'Still loading the recordings: try again in a moment.');
      const voice = fireVoice(size);
      const source = ctx.createBufferSource();
      Object.assign(source, { buffer: loop.buffer, loop: true, loopStart: loop.loopStart, loopEnd: loop.loopEnd });
      source.playbackRate.value = voice.rate;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = voice.highpass;
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = voice.lowpass;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(gainOfLevel(voice.level + 20 * Math.log10(distanceGain(2))) * FIRE_SOUND.trim, now, 0.3);
      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(gain);
      gain.connect(master);
      source.start(now + 0.03, loop.loopStart + Math.random() * (loop.loopEnd - loop.loopStart));
      playing[key] = { gain, loop: { stop: (at) => source.stop(at) } };
    }
    if (button) {
      button.setAttribute('aria-pressed', String(Boolean(playing[key])));
      button.textContent = playing[key] ? 'Stop' : 'Play fire';
    }
    return Boolean(playing[key]);
  }
  {
    const id = 'fires';
    const grid = el('div', { className: 'grid' });
    const section = el('section', { id, className: 'category' }, el('h2', { textContent: 'Fires' }), el('p', { className: 'blurb', textContent: `The fire's crackle, looped where a fire burns in a level, by its size: louder, fuller and lower the bigger it is. Here at 2 m; in the game at the ${FIRE_SOUND.nearest} nearest within ${FIRE_SOUND.within} m, placed and falling off with distance.` }), grid);
    root.querySelector('#ambience-loops').after(section);
    nav.querySelector('a[href="#ambience-loops"]').after(el('a', { href: `#${id}`, textContent: 'Fires' }));
    for (const [key, title, size, note] of FIRES) {
      const voice = fireVoice(size);
      const button = el('button', { type: 'button', className: 'play toggle', textContent: 'Play fire', onclick: () => toggleFire(key, size, button) });
      button.setAttribute('aria-pressed', 'false');
      button.dataset.loop = key;
      grid.append(el('article', { className: 'card' },
        el('header', {}, el('h3', { textContent: title }), el('div', { className: 'tags' }, el('span', { className: 'tag rec', textContent: 'loop' }), el('span', { className: 'tag new', textContent: 'new' }))),
        el('p', { className: 'note', textContent: note }),
        el('div', { className: 'actions' }, button),
        el('p', { className: 'readout', textContent: `size ${size} m · ${voice.level.toFixed(0)} dB at 1 m · pitch ×${voice.rate.toFixed(2)} · high-pass ${voice.highpass.toFixed(0)} Hz · low-pass ${voice.lowpass.toFixed(0)} Hz · ${FIRE_LOOP.file}.mp3, a ${FIRE_LOOP.seconds} s loop` })));
    }
  }
  const takes = Object.values(SAMPLE_SETS).reduce((sum, list) => sum + list.length, 0);
  document.getElementById('count').textContent = `${LOOPS.length} ambience loops, a fire's loop at ${FIRES.length} sizes, ${Object.keys(SAMPLE_SETS).length} recorded sets, ${takes} takes, and the synthesised families`;
  window.soundBoard = { play, playTake, toggleLoop, toggleFire, loops: () => Object.keys(playing), cards: CATEGORIES.flatMap(([, , cards]) => cards), ready: () => bank?.ready };
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
