// Story mode's chapters, in order (`CHAPTERS`), with the life's people (COMRADES, FAMILY) and the Hun River's memories
// (FLASHBACKS). Each chapter is src/story/chapters/NN-<id>.js exporting `chapter` (shape: the story contract), imported whole
// (`import * as`: tools/bundle.js keeps each file's names its own). Tolerant of gaps: a chapter not yet written is not listed,
// and the engine goes on to the next chapter there is (src/story/runner.js storyNextChapter).
// Adding one: an import line and its name in the list.

import * as STORY_CHAPTER_01 from './01-suppression.js';
import * as STORY_PEOPLE from './comrades.js';

export const CHAPTERS = [STORY_CHAPTER_01].map((module) => module.chapter).filter(Boolean).sort((a, b) => a.n - b.n);
export const STORY_COMRADES = STORY_PEOPLE.COMRADES ?? [];
export const STORY_FAMILY = STORY_PEOPLE.FAMILY ?? {};
// The Hun River's memories (chapters/flashbacks.js, the writer's, when it is written: its import goes here).
export const STORY_FLASHBACKS = [];
