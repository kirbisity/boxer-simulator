// The UI chrome's strings, by key, each { en, zh } (src/i18n.js t()). One table per part of the game, so each stays
// beside the others it is read with; merged here. A key is `<area>.<what>`; a `{name}` in a string is filled by t()'s vars.
// A zh the same as its en must be in KEEP_ENGLISH (src/i18n.js): test/i18n.test.js checks it.

import { UI_COMMON } from './ui-common.js';
import { UI_MENU } from './ui-menu.js';
import { UI_FIGHT } from './ui-fight.js';
import { UI_BUILDER } from './ui-builder.js';
import { UI_LEVEL } from './ui-level.js';
import { UI_SQUAD } from './ui-squad.js';
import { UI_CARDS } from './ui-cards.js';

export const UI_TABLES = { UI_COMMON, UI_MENU, UI_FIGHT, UI_BUILDER, UI_LEVEL, UI_SQUAD, UI_CARDS };
export const UI = Object.assign({}, ...Object.values(UI_TABLES));
