// The story's chapters in the order of the life, with the named men and the Hun River flashbacks. Each chapter file
// exports its chapter under its own name (CHAPTER_SUPPRESSION ...), not `chapter`, because the bundle is one shared
// scope (tools/bundle.js); the engine reads them from here.
//
// Effects on a choice are plain data: { rank, place, flags, bond: { comradeId: n }, family: { wife|son|daughter: true },
// dies: { comradeId: how } } (`dies`: a named man killed off the battlefield, as Jin Aman on the Shimenzhai drill
// ground). A choice with `fatal` ends the life on its own page. The battle outcome the after-cards read is described in
// ./kit.js.
import { CHAPTER_SUPPRESSION } from './01-suppression.js';
import { CHAPTER_WOKOU } from './02-wokou.js';
import { CHAPTER_PYONGYANG } from './03-pyongyang.js';
import { CHAPTER_BYEOKJEGWAN } from './04-byeokjegwan.js';
import { CHAPTER_ULSAN } from './05-ulsan.js';
import { CHAPTER_LIAODONG } from './06-liaodong.js';
import { CHAPTER_SARHU } from './07-sarhu.js';
import { CHAPTER_HUNRIVER } from './08-hunriver.js';

export { COMRADES } from './comrades.js';
export { FLASHBACKS } from './flashbacks.js';
export { STORY_FAMILY, STORY_HERO } from './family.js';

export const CHAPTERS = [
  CHAPTER_SUPPRESSION, CHAPTER_WOKOU, CHAPTER_PYONGYANG, CHAPTER_BYEOKJEGWAN,
  CHAPTER_ULSAN, CHAPTER_LIAODONG, CHAPTER_SARHU, CHAPTER_HUNRIVER,
];
