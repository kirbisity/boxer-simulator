// Matchup notes, read off the ratings sweep's bouts: what each warrior does better or worse against than his rating says
// he should. For each pairing he fought, the share he took (a draw half) less the share his and his foe's ratings
// predict (Bradley-Terry: s / (s + r)); those differences summed by the kinds of foe (their weapons, armour, body),
// weighted by bouts. A kind he beats by more than MARGIN over expectation is one he is strong against; less, weak.
// Besides the sweep's own bouts, each warrior meets one foe of every kind (the one nearest his rating, so the bout tells the
// most), `BOUTS_A_KIND` bouts from each corner, fought in parallel.
// Writes src/matchups.js (generated: do not edit by hand). Usage: node tools/matchups.js [workers = 10] (after tools/ratings.js).
import { fork } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { record } from './ratings.js';
import { RATINGS } from '../src/ratings.js';
import { WARRIORS } from '../src/roster.js';
import { STYLES } from '../src/moves.js';
import { WEAPONS } from '../src/weapons.js';
import { OUTFITS } from '../src/outfits.js';

// How far over or under expectation (share of bouts) a kind of foe must lie, and how many bouts it must rest on.
const MARGIN = 0.12;
const MIN_BOUTS = 6;
// Bouts from each corner against each kind's foe.
const BOUTS_A_KIND = 3;
// Firearms by weapon key fragment (the rest that shoot are bows and crossbows).
const GUN = /rifle|pistol|musket|matchlock|arquebus|carbine|smg|shotgun|gun|flame|ar15|m4|glock/i;

/** The kinds a warrior counts as, to his foes: his weapon's, his armour's, his body's. */
function kindsOf({ inputs, faction }) {
  const kinds = new Set();
  const style = STYLES[inputs.style] ?? {};
  const weapon = WEAPONS[style.weapon];
  const outfit = OUTFITS[inputs.outfit?.kind] ?? {};
  if (outfit.machine || faction === 'machines') kinds.add('machines');
  if (faction === 'primates' || faction === 'apes') kinds.add('beasts');
  if (inputs.mounted || outfit.mounted || outfit.horse) kinds.add('riders');
  if (style.ranged) kinds.add(GUN.test(style.weapon ?? '') ? 'guns' : 'bows');
  else if (!weapon) kinds.add('bare hands');
  else {
    const swing = weapon.harm?.swing ?? {};
    const thrust = weapon.harm?.thrust ?? {};
    const blunt = (swing.blunt ?? 0) + (thrust.blunt ?? 0);
    const cut = (swing.cut ?? 0) + (thrust.cut ?? 0);
    const pierce = (swing.pierce ?? 0) + (thrust.pierce ?? 0);
    if (weapon.length >= 1.8 && pierce >= cut && pierce >= blunt) kinds.add('spears and polearms');
    else if (blunt >= cut && blunt >= pierce) kinds.add('blunt weapons');
    else kinds.add('blades');
  }
  const protection = outfit.protection ?? {};
  const torso = { ...protection, ...(protection.regions?.torso ?? {}) };
  if ((torso.cut ?? 0) >= 0.75) kinds.add('heavy armour');
  else if ((torso.cut ?? 0) < 0.2 && !outfit.machine) kinds.add('the unarmoured');
  return [...kinds];
}

/** A list read as English: "a, b and c". */
const listed = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

const byKey = new Map(WARRIORS.map((warrior) => [warrior.key, warrior]));
const characters = RATINGS.characters;
const scoreOf = (key) => characters[key]?.score ?? characters[key]?.provisional ?? null;
const [mode, ...args] = process.argv.slice(2);

if (mode === 'pairs') {
  // A worker: a share of the [a, b] pairings, a's record against b.
  process.send(JSON.parse(args[0]).map(([a, b]) => ({ a, b, record: record(byKey.get(a).inputs, byKey.get(b).inputs, BOUTS_A_KIND) })));
} else {
  const workers = Number(mode ?? 10);
  // Each warrior against the foe of each kind nearest his rating.
  const kindsByKey = new Map(WARRIORS.map((warrior) => [warrior.key, kindsOf(warrior)]));
  const pairs = [];
  for (const warrior of WARRIORS) {
    const own = scoreOf(warrior.key);
    if (!own) continue;
    for (const kind of new Set([...kindsByKey.values()].flat())) {
      let nearest = null;
      for (const foe of WARRIORS) {
        const theirs = scoreOf(foe.key);
        if (foe.key === warrior.key || !theirs || !kindsByKey.get(foe.key).includes(kind)) continue;
        const gap = Math.abs(Math.log(theirs / own));
        if (!nearest || gap < nearest.gap) nearest = { key: foe.key, gap };
      }
      if (nearest && !(characters[warrior.key]?.records ?? {})[nearest.key]) pairs.push([warrior.key, nearest.key]);
    }
  }
  const unique = [...new Map(pairs.map((pair) => [pair.join('|'), pair])).values()];
  const share = Math.ceil(unique.length / workers);
  const started = Date.now();
  const results = (await Promise.all(Array.from({ length: workers }, (_, index) => new Promise((resolve, reject) => {
    const slice = unique.slice(index * share, (index + 1) * share);
    if (!slice.length) return resolve([]);
    const child = fork(fileURLToPath(import.meta.url), ['pairs', JSON.stringify(slice)]);
    child.on('message', resolve);
    child.on('error', reject);
  })))).flat();
  console.log(`${results.length} matchup pairings fought in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  // Every warrior's records: the sweep's and these, each pairing seen from both sides.
  const extra = new Map();
  const add = (a, b, tally) => {
    const own = extra.get(a) ?? {};
    const prev = own[b] ?? { wins: 0, losses: 0, draws: 0 };
    own[b] = { wins: prev.wins + tally.wins, losses: prev.losses + tally.losses, draws: prev.draws + tally.draws };
    extra.set(a, own);
  };
  for (const { a, b, record: tally } of results) {
    add(a, b, tally);
    add(b, a, { wins: tally.losses, losses: tally.wins, draws: tally.draws });
  }
  const recordsOf = (key) => {
    const merged = { ...(characters[key]?.records ?? {}) };
    for (const [foe, tally] of Object.entries(extra.get(key) ?? {})) {
      const prev = merged[foe] ?? { wins: 0, losses: 0, draws: 0 };
      merged[foe] = { wins: prev.wins + tally.wins, losses: prev.losses + tally.losses, draws: prev.draws + tally.draws };
    }
    return merged;
  };
  const out = {};
  for (const [key, character] of Object.entries(characters)) {
    const own = scoreOf(key);
    if (!own) continue;
    const tally = new Map();
    let best = null;
    let worst = null;
    for (const [foe, record] of Object.entries(recordsOf(key))) {
      const warrior = byKey.get(foe);
      const theirs = scoreOf(foe);
      const bouts = record.wins + record.losses + record.draws;
      if (!warrior || !theirs || !bouts) continue;
      const residual = (record.wins + record.draws / 2) / bouts - own / (own + theirs);
      for (const kind of kindsOf(warrior)) {
        const entry = tally.get(kind) ?? { sum: 0, bouts: 0 };
        entry.sum += residual * bouts;
        entry.bouts += bouts;
        tally.set(kind, entry);
      }
      const pairing = { foe: warrior.title ?? foe, residual };
      if (!best || residual > best.residual) best = pairing;
      if (!worst || residual < worst.residual) worst = pairing;
    }
    const kinds = [...tally].filter(([, entry]) => entry.bouts >= MIN_BOUTS).map(([kind, entry]) => [kind, entry.sum / entry.bouts]);
    const strong = kinds.filter(([, share]) => share > MARGIN).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([kind]) => kind);
    const weak = kinds.filter(([, share]) => share < -MARGIN).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([kind]) => kind);
    const lines = [];
    if (strong.length) lines.push(`Strong against ${listed(strong)}.`);
    if (weak.length) lines.push(`Weak against ${listed(weak)}.`);
    if (!lines.length) lines.push('Fights about as his rating says against every kind he met.');
    out[key] = {
      strong, weak,
      best: best && best.residual > MARGIN ? best.foe : null,
      worst: worst && worst.residual < -MARGIN ? worst.foe : null,
      text: lines.join(' '),
    };
  }
  const header = '// GENERATED by tools/matchups.js from the bouts in src/ratings.js — do not edit by hand; re-run the tool after the ratings.\n'
    + '// Per warrior: the kinds of foe he does better (strong) or worse (weak) against than his rating predicts, by more than '
    + `${MARGIN * 100}% of bouts on at least ${MIN_BOUTS} bouts; his best and worst single pairing against the odds.\n`;
  writeFileSync(new URL('../src/matchups.js', import.meta.url), `${header}export const MATCHUPS = ${JSON.stringify(out, null, 1)};\n`);
  const withNotes = Object.values(out).filter((entry) => entry.strong.length || entry.weak.length).length;
  console.log(`${Object.keys(out).length} warriors, ${withNotes} with notes`);
}
