// A dev helper for looking at the story mode's Korea battles (src/story/battles/02-05) in the page before the story's own
// screens open them: the battle set up for a stand-in life and opened as a Battle Mode level. In the page's console
// (served by tools/serve.py):
//
//   const { KS } = await import('/tools/koreashots.js');
//   KS.open('ulsan');            // the battle at seed 1, the hero a soldier in the front; the camera on him
//   KS.open('pyongyang', { rank: 'officer' }, 2);
//
// Drawn in the battle's `view.scene`; the air is that place's (the story's own `place`, the battle's climate, is what the
// engine passes to createWorld). Not part of the game; nothing imports it.

import { PRESETS } from '/src/body.js';
import { SCENARIOS } from '/src/scenarios.js';
import { KOREA_BATTLES } from '/src/story/battles/korea-battles.js';

const comrade = (id, en, bond) => ({ id, name: { zh: en, en }, born: 1567, inputs: { ...PRESETS.mingSpear }, rank: 'soldier', alive: true, bond, diedAt: null });

/** A stand-in life: the hero (a spearman's body, born 1568) and three comrades, his rank and place as given. */
export function standInLife(n, { rank = 'soldier', place = 'front' } = {}) {
  return {
    hero: { name: { zh: '英', en: 'The Hero' }, born: 1568, inputs: { ...PRESETS.mingSpear } },
    chapter: n, rank, place,
    comrades: [comrade('chen', 'Chen', 5), comrade('wang', 'Wang', 4), comrade('li', 'Li', 3)],
  };
}

/** The battle's setup as a Battle Mode level (SCENARIOS key `story-<id>`): its men where it puts them, its works, its view. */
export function asLevel(battle, setup) {
  const side = (corner) => setup.fighters.filter((entry) => entry.corner === corner).map((entry) => entry.inputs);
  return {
    title: battle.title.en,
    place: `${battle.title.zh} · ${battle.year}`,
    blurb: '',
    scene: battle.view.scene,
    weather: battle.view.weather,
    arena: setup.options.arena,
    camera: battle.view.camera,
    roster: '',
    // (Fronts of 0: a battle map's drawing apart, scenarios.js drawnApart, leaves them where they are.)
    formation: setup.options.formation,
    cast: () => ({ red: side('red'), blue: side('blue') }),
    fighters: [],
  };
}

export const KS = {
  battles: KOREA_BATTLES,
  open(id, life = {}, seed = 1) {
    const battle = KOREA_BATTLES[id];
    const setup = battle.setup({ ...standInLife(battle.n), ...life }, seed);
    const key = `story-${id}`;
    SCENARIOS[key] = asLevel(battle, setup);
    window.boxer.skipIntro();
    window.boxer.enterLevel(key, 'watch');
    // Watched (the AI fights every man, the hero too), the camera framing the field; `focusOn(player)` follows him.
    document.querySelector('#side-pick').hidden = true;
    document.querySelector('#modes button[data-value="watch"]')?.click();
    window.boxer.state.paused = false;
    window.boxer.frameAll();
    return { key, men: setup.fighters.length, player: setup.player, comrades: setup.comrades, slot: setup.slot };
  },
};
