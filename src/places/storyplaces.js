// The story's places that can be walked (story/storyview.js: the roam before and after a battle; main.js
// enterStoryRoam): each a place of the renderer (render.js builders) with the stage that gives a walker its floors and
// walls (levelmode/stage.js: the Dunnottar stage's own mechanism, no second one), where the battle musters in it, and
// the weathers it is seen in. A battle names its place in its view (`view.roam`: a key here).

import { CANAL_TOWN, CANAL_TOWN_WEATHER, canalTownStage } from './canaltown.js';

export const STORY_PLACES = {
  // The water town of the wokou chapter (story/battles/02-wokou.js).
  canaltown: {
    place: 'canaltown',
    stage: canalTownStage,
    // Where the line forms (the ring he walks to): [x, y, z].
    muster: CANAL_TOWN.muster,
    weathers: CANAL_TOWN_WEATHER,
    // How often each weather is met (shares of 1; Jiangnan's damp: mostly wet stone under a low sky, rain on about one
    // day in three, the odd dry one. A choice for the look, not a climate record).
    odds: { damp: 0.45, rain: 0.35, dry: 0.2 },
    // The follow camera at his arrival (orbit yaw from behind him, as a stage's: main.js enterStage).
    camera: { yaw: 0.3, pitch: 0.22, distance: 5.2 },
  },
};

/** The ring at a place's muster point (m): he is at the battle when he stands within it. */
export const STORY_MUSTER_RADIUS = 1.6;

/** The weather of a place on a day (`roll` in [0, 1): the battle's seeded draw): { name, ...the kit's weather values }. */
export function storyPlaceWeather(key, roll = 0) {
  const entry = STORY_PLACES[key];
  let left = roll;
  let name = Object.keys(entry.odds)[0];
  for (const [each, share] of Object.entries(entry.odds)) {
    name = each;
    if ((left -= share) < 0) break;
  }
  return { name, ...entry.weathers[name] };
}
