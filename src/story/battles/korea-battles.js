// The Korea chapters' battles (2-5), by the id a chapter names in its `battle`. Each file exports its battle under a
// name of its own (the page's bundle is one scope: four files each exporting `battle` would collide, tools/bundle.js).

import { wokouBattle } from './02-wokou.js';
import { pyongyangBattle } from './03-pyongyang.js';
import { byeokjegwanBattle } from './04-byeokjegwan.js';
import { ulsanBattle } from './05-ulsan.js';

export const KOREA_BATTLES = Object.fromEntries([wokouBattle, pyongyangBattle, byeokjegwanBattle, ulsanBattle].map((battle) => [battle.id, battle]));
