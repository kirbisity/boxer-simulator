// Chapter 4, 27 February 1593 (Wanli 21, the first month, the 27th day): Byeokjegwan (碧蹄馆), the post station on the
// road to Hanseong. Li Rusong's horse, ridden ahead of the army, caught in a bowl of hills by Kobayakawa Takakage's
// and Tachibana Muneshige's men; a company of foot comes up the road behind them.
//
// The history (sources):
//  - After Pyongyang, Li Rusong rode on toward Hanseong ahead of his guns and his foot with his vanguard: Zha Dashou's
//    3,000 met the Japanese first; Li himself with ~2,000, about 1,000 of them in the charge. The Japanese came up to
//    ~15,000 (Kobayakawa's reinforcements): Tachibana's 2,000 at the Ming right, Inoue Kagesada's 3,000 at the left,
//    Awaya Kagenao's 3,000 holding the hills. Li's cavalry, drawn into a bowl-shaped hollow, was attacked from both
//    flanks; Yang Yuan's 1,000 cavalry came up, struck the Japanese and let Li get out. Late morning to noon.
//    (Wikipedia, "Battle of Byeokjegwan", after Swope 2009 and Turnbull, Samurai Invasion 2002.)
//  - The ground: the hills round the station, a valley floor of rice fields; the fields' mud made the horses hard to
//    use and most of the Ming fought dismounted (accounts summarised on the battle's Wikipedia page and its mirrors).
//    The scouts crossed the Hyeeumryeong pass before dawn in thick fog.
//  - Losses: Li Rusong reported 264 killed, 49 wounded, 276 horses lost; Joseon officials 300-600 a side; the Japanese
//    claimed thousands.
//  - What is the story's, not the record's: the foot coming up. The relief that broke through was Yang Yuan's
//    cavalry; Li had left the foot behind. A company of southern foot arriving up the road stands here for "the foot
//    come up" of the chapter, with the strength of Yang Yuan's relief (1,000): the writer's text should not claim the
//    southern foot fought at Byeokjegwan.
//
// Numbers, at one man to ~120: 9 of Li Rusong's horsemen in the bowl (~1,000: 4 still mounted, 5 fighting on foot in
// their lamellar in the mud), 56 Japanese closing on it (Tachibana's 2,000 ahead: 16; Inoue's 3,000 and Awaya's 3,000
// on the hills either side: 20 each, of the ~8,000 the three put in: 1 : 6.2 against the horse), and the relief: a
// company of 12 southern foot and its officer (~1,000-1,500). 78 men.
//
// The ground: the valley along x (the road from the north, -x, toward Hanseong, +x), the hills either side as relief
// (fieldworks ditches whose profile only rises: ~4.5 m over 9 m), the valley floor a thawing paddy: soft ground
// (fieldworks soft) over the still-frozen subsoil.
//
// The hero: in the relief's squad, in its front rank as a soldier in front, behind as his place says; a squad leader
// at its back; an officer behind it. His comrades beside him.

import { mingHorseman, mingSoldier, sengokuWarrior } from '../../cast.js';
import { seededRandom } from '../../physics.js';
import { mergeWorks } from '../ground/walls.js';
import { koreaAssemble, koreaRowOf, koreaRows, koreaSeat, koreaStyles } from './korea.js';

export const BYEOKJEGWAN_1593 = {
  year: 1593,
  arena: { halfX: 22, halfZ: 14 },
  // A hill either side of the valley: rising from the floor's edge (`edge` m from the middle) by the profile (m out, m up).
  hills: { edge: 6, profile: [[0, 0], [3, 0.8], [6, 2.5], [9, 4.5]] },
  // The paddy: the reference man sinks ~12 cm into its thawed top (`depth`), no further than the frozen ground under it
  // (`firm` ~0.15 m: the frost line of a Korean February); clay's poor grip (as Agincourt's plough), a film of melt-water.
  paddy: { x: [-16, 16], z: [-5.5, 5.5], depth: 0.12, firm: 0.15, viscosity: 2, footing: 0.7, surface: 'mud', edge: 0.6, water: 0.02 },
  // Li Rusong's horse in the bowl: the mounted at its middle, the dismounted round them.
  cavalry: { mounted: [['spear', 2, -1.5], ['dao', 2, 1.5], ['threeEyed', 4, 0], ['dao', 0.5, 0]], foot: [['guandao', 4.5, -2.5], ['dao', 4.5, 2.5], ['spear', 5.5, -1], ['dao', 5.5, 1], ['guandao', 3, 3.5]] },
  // The Japanese: Tachibana's ahead on the road, Inoue's and Awaya's on the hills' slopes either side.
  japanese: {
    ahead: { at: [11, 0], counts: { katana: 3, yari: 7, matchlock: 4, bow: 2 }, abreast: 8 },
    flank: { x: 3, z: 9, counts: { katana: 3, naginata: 1, yari: 8, matchlock: 5, bow: 3 }, abreast: 10 },
  },
  // The relief: a squad of twelve as Qi armed it, four abreast, and its officer, coming up the road from the north.
  relief: { styles: ['swordShield', 'langxian', 'langxian', 'swordShield', 'spear', 'spear', 'spear', 'spear', 'matchlock', 'matchlock', 'matchlock', 'dao'], at: [-12, 0], abreast: 4, spacing: 1.3, rowSpacing: 1.6, officer: [-17, 0] },
  rows: { front: [-12, -0.65], second: [-13.6, -0.65], rear: [-15.2, -0.65], squadLeader: [-15.2, 1.95], officer: [-17, 0] },
  // Kobayakawa's and Tachibana's colours: a red army (scenarios.js SEKIGAHARA_EAST's).
  colours: { tint: { armor: '#9a1f18', lace: '#1a1a1d' }, banner: '#b3161b' },
  design: { mingBrigandine: 3, mingElite: 5, mingGarrison: 0 },
};

/** The paddy between the two hills (the hills themselves not raised: below). */
function byeokjegwanWorks(spec) {
  // (The ground's relief is left out: a plain field, as the regular battles are fought on. Banks drawn as bare earth looked like
  // plain lumps, and the relief made every man's footing and walk cost more.)
  return mergeWorks({ soft: [spec.paddy] });
}

export const byeokjegwanBattle = {
  id: 'byeokjegwan',
  n: 4,
  year: BYEOKJEGWAN_1593.year,
  title: { zh: '碧蹄馆', en: 'Byeokjegwan' },
  view: { scene: 'sarhu', weather: { fog: [10, 90], sky: 0.65, pale: 0.6, sun: 0.75 }, camera: { yaw: -0.6, pitch: 0.42, distance: 26, maxDistance: 34 } },
  seconds: 180,
  setup(life, seed = 1) {
    const random = seededRandom(seed);
    const spec = BYEOKJEGWAN_1593;
    const red = { men: [], places: [] };
    const add = (part) => {
      red.men.push(...part.men);
      red.places.push(...part.places);
    };
    for (const [style, x, z] of spec.cavalry.mounted) add({ men: [mingHorseman(random, style)], places: [[x, z]] });
    for (const [style, x, z] of spec.cavalry.foot) add({ men: [{ ...mingHorseman(random, style), mounted: false }], places: [[x, z]] });
    const southern = (style, rank = 'brigandine') => mingSoldier(random, style, rank, { people: 'qi', design: spec.design[rank === 'elite' ? 'mingElite' : 'mingBrigandine'] });
    add(koreaRows({ at: spec.relief.at, styles: spec.relief.styles, abreast: spec.relief.abreast, spacing: spec.relief.spacing, rowSpacing: spec.relief.rowSpacing, make: (style) => southern(style) }));
    add({ men: [southern('dao', 'elite')], places: [spec.relief.officer] });
    const seated = koreaSeat(life, red, { at: koreaRowOf(life, spec.rows), year: spec.year, design: spec.design });
    const blue = { men: [], places: [] };
    const japanese = (style) => sengokuWarrior(random, spec.colours, style, style === 'katana' || style === 'naginata' ? 'samurai' : 'ashigaru');
    const addBlue = (part) => {
      blue.men.push(...part.men);
      blue.places.push(...part.places);
    };
    const { ahead, flank } = spec.japanese;
    // Ahead on the road, facing -x: their rows run back toward +x.
    addBlue(koreaRows({ at: ahead.at, styles: koreaStyles(ahead.counts), abreast: ahead.abreast, spacing: 1.3, rowSpacing: 1.6, back: 1, make: japanese }));
    // On each hill: a line along x on the slope, the shooters on the upper side.
    for (const sign of [1, -1]) {
      const line = koreaRows({ at: [flank.x, sign * flank.z], styles: koreaStyles(flank.counts), abreast: flank.abreast, spacing: 1.4, rowSpacing: 1.6, back: 1, make: japanese });
      // (koreaRows runs its rows along z; here the line runs along x up the slope's contour: x and z swapped about its middle.)
      addBlue({ men: line.men, places: line.places.map(([x, z]) => [flank.x + (z - sign * flank.z), sign * (flank.z + (x - flank.x))]) });
    }
    const built = koreaAssemble({ red, blue, heroCorner: 'red', hero: seated.hero, comrades: seated.comrades });
    const slot = red.places[seated.hero];
    return {
      fighters: built.fighters,
      options: {
        seed,
        arena: { ...spec.arena, works: byeokjegwanWorks(spec) },
        place: 'byeokjegwan',
        formation: { red: { front: 0, layout: built.layouts.red }, blue: { front: 0, layout: built.layouts.blue } },
      },
      player: built.player,
      comrades: built.comrades,
      slot: { x: slot[0], z: slot[1] },
    };
  },
};
