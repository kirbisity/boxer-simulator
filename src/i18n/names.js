// Proper names as the game's data keeps them (English) → Chinese (src/i18n.js tname()). Units, legends and battle soldiers;
// kits, helmets and weapons; styles, factions, places and horses. One table per kind, merged here; the data stays English, so
// saved fighters and setup codes are the same in either language.

import { NAMES_PEOPLE } from './names-people.js';
import { NAMES_KIT } from './names-kit.js';
import { NAMES_WORLD } from './names-world.js';

export const NAME_TABLES = { NAMES_PEOPLE, NAMES_KIT, NAMES_WORLD };
export const NAMES_ZH = Object.assign({}, ...Object.values(NAME_TABLES));
