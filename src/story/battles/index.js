// Story mode's battles, by id (a chapter's `battle` names one). Each file is src/story/battles/NN-<id>.js and exports its
// battle under a name of its own (BATTLE_SUPPRESSION, BATTLE_LIAODONG, …: the bundle is one shared scope, tools/bundle.js),
// shape as the story contract has it; the engine reads them only from here (src/story/runner.js). A battle not yet written is
// simply not listed: a chapter naming it goes on without a battle. Adding one: its import and its name in the list.

import { BATTLE_SUPPRESSION } from './01-suppression.js';
// The Korea battles (2-5): wokouBattle, pyongyangBattle, byeokjegwanBattle, ulsanBattle, by id.
import { KOREA_BATTLES } from './korea-battles.js';
import { BATTLE_LIAODONG } from './06-liaodong.js';
import { BATTLE_SARHU } from './07-sarhu.js';
import { BATTLE_HUNRIVER } from './08-hunriver.js';

export const STORY_BATTLES = Object.fromEntries([BATTLE_SUPPRESSION, ...Object.values(KOREA_BATTLES), BATTLE_LIAODONG, BATTLE_SARHU, BATTLE_HUNRIVER].filter(Boolean).map((battle) => [battle.id, battle]));
