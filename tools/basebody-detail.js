// Writes the emaciated reference's bone relief (tools/blender/family/emaciateddetail.py: her ribs, breastbone, collarbones,
// spine, shoulder blades and hip bones as heights on the skin map's trunk tile) into src/basebody-data.js as `starvedRelief`,
// in place of the one there: one tile a sex (each baked through that sex's own emaciated build, whose points lie elsewhere on
// the map), 8-bit integers of the deepest relief kept.
//   node tools/basebody-detail.js <female.json> <male.json>
//   each {width, height, span, deepest, heights: units of stature, rows from the span's foot, remade: shares (a man's)}
// Where her sculpt was remade (`remade`: the man's chest, where her breasts were) nothing of her bones is left to bake: the
// skin rules' own ribs are written there (skinrules.js trunkRule, its ribs alone), so the game still lays one relief.
import { readFileSync, writeFileSync } from 'node:fs';
import { BASE_BODY_DATA } from '../src/basebody-data.js';
import { trunkRule } from '../src/skinrules.js';

const REMADE = {
  // The rules' ribs drawn in what was remade: at this share they stand 3.6 mm from groove to crest, as her own do on the
  // man's flank beside it (3.2 to 3.4 mm at 1.75 m, the 5th to the 95th centile of the relief less its own 2.5 cm blur).
  ribs: 0.7,
  // The stature the rules' metres are read at (they are the same on every body; the relief is in units of stature).
  stature: 1.75,
};
// (The rules' traits with the ribs alone: no muscle, fat or other bone mark.)
const RIBS_ALONE = { female: false, dev: 0, bony: 0, lean: 0, fat: 0, heavy: 0, defined: 0, abs: 0, ribs: REMADE.ribs };

/** The relief with the rules' ribs added by each texel's remade share. */
function withRuleRibs(relief) {
  if (!relief.remade) return relief.heights;
  const [from, to] = relief.span;
  return relief.heights.map((height, index) => {
    const share = relief.remade[index];
    if (!(share > 0)) return height;
    const t = from + ((to - from) * Math.floor(index / relief.width)) / (relief.height - 1);
    const angle = (2 * Math.PI * (index % relief.width)) / (relief.width - 1);
    return height + (share * trunkRule(RIBS_ALONE, t, angle).h) / REMADE.stature;
  });
}

function packedRelief(file) {
  const relief = JSON.parse(readFileSync(file, 'utf8'));
  if (relief.heights.length !== relief.width * relief.height) throw new Error(`${file}: ${relief.heights.length} heights for a tile of ${relief.width} by ${relief.height}`);
  const bytes = Int8Array.from(withRuleRibs(relief), (value) => Math.round(Math.max(-1, Math.min(1, value / relief.deepest)) * 127));
  return { width: relief.width, height: relief.height, span: relief.span, deepest: relief.deepest, heights: Buffer.from(bytes.buffer).toString('base64') };
}

const [female, male] = process.argv.slice(2);
if (!female || !male) throw new Error('usage: node tools/basebody-detail.js <female.json> <male.json>');
const path = new URL('../src/basebody-data.js', import.meta.url);
const text = readFileSync(path, 'utf8');
const old = `"starvedRelief":${JSON.stringify(BASE_BODY_DATA.starvedRelief)}`;
if (!text.includes(old)) throw new Error('the old relief was not found');
const packed = { female: packedRelief(female), male: packedRelief(male) };
const header = "`starvedRelief` (tools/basebody-detail.js): the emaciated\n// reference's bone relief on the skin map's trunk tile, heights";
const note = "`starvedRelief` (tools/basebody-detail.js): the emaciated\n// reference's bone relief on the skin map's trunk tile, one a sex, heights";
writeFileSync(path, text.replace(old, `"starvedRelief":${JSON.stringify(packed)}`).replace(header, note));
console.log('written', Object.entries(packed).map(([sex, relief]) => `${sex} ${relief.width} x ${relief.height}`).join(', '));
