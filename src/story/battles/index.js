// Story mode's battles, by id (a chapter's `battle` names one). Each file is src/story/battles/NN-<id>.js and exports `battle`
// (shape: the story contract; the engine reads it in src/story/runner.js). Imported whole (`import * as`), so each file's own
// names stay its own in the one-scope bundle (tools/bundle.js wraps a module imported that way). A battle not yet written is
// simply not here: a chapter naming it has no battle until it is (the engine passes over it).
// Adding one: an import line and its name in the list.

import * as STORY_BATTLE_01 from './01-suppression.js';

export const STORY_BATTLES = Object.fromEntries([STORY_BATTLE_01].map((module) => module.battle).filter(Boolean).map((battle) => [battle.id, battle]));
