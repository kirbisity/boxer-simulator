// The custom battle's first screen (custombattle.js is the reckoning): the ground, and a faction for each side, picked in
// one screen that fits without scrolling (on a phone each row of choices scrolls sideways). Then on to the setup screen
// (musterview.js), where each side's fighters are counted in and placed, and the battle fought. Whatever is picked is
// kept in the browser at once, so the last battle is there to change and fight again.

import { addBattleThumb } from './battlethumbs.js';
import { changeBattle, CUSTOM_BATTLE, customCounts, customSetup, customFactions, customLevel, readCustomBattle, settleBattle, writeCustomBattle } from './custombattle.js';
import { unitOf } from './muster.js';
import { musterScreen } from './musterview.js';

const customEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/** A side's men in a line: "12 men · 4 Noble Knight, 4 …" (the commonest kinds first). */
function sideLine(battle, corner) {
  const level = customLevel(battle);
  const counts = Object.entries(customCounts(battle.sides[corner])).sort((a, b) => b[1] - a[1]);
  const named = counts.map(([id, count]) => {
    const unit = level.units[corner].find((each) => each.id === id);
    return `${count} ${unit.mounted ? '🐎 ' : ''}${unit.label}`;
  });
  return `${battle.sides[corner].men.length} men${named.length ? ` · ${named.join(', ')}` : ''}`;
}

/**
 * Open the custom battle in `root`: `onBack()` to Battle Mode's list, `onFight(setup)` to fight it (muster.js
 * musterLevel's setup, with the battle itself as `setup.battle`: main.js makes its level of it), `storage` where it is kept.
 */
export function customBattleScreen(root, { onBack, onFight, storage = globalThis.localStorage }) {
  let battle = readCustomBattle(storage);
  const keep = () => writeCustomBattle(battle, storage);

  function picker() {
    root.replaceChildren();
    root.className = 'screen custom-battle';
    const head = customEl('header', { className: 'custom-head' },
      customEl('button', { className: 'back', type: 'button', textContent: '← Back', onclick: onBack }),
      customEl('div', { className: 'titles' }, customEl('h1', { textContent: CUSTOM_BATTLE.title }), customEl('p', { className: 'lede', textContent: 'Pick the ground and a faction a side; then count in the fighters and place them.' })));
    const maps = customEl('div', { className: 'custom-maps', role: 'radiogroup', ariaLabel: 'The ground' }, ...Object.entries(CUSTOM_BATTLE.maps).map(([key, map]) => {
      const card = customEl('button', {
        type: 'button', role: 'radio', className: `custom-map${battle.map === key ? ' on' : ''}`, ariaChecked: String(battle.map === key),
        onclick: () => { battle = changeBattle(battle, { map: key }); keep(); picker(); },
      }, customEl('span', { className: 'glyph', textContent: map.glyph, ariaHidden: 'true' }), customEl('b', { textContent: map.label }));
      return addBattleThumb(card, `map-${key}`);
    }));
    const factions = customFactions();
    const side = (corner) => customEl('section', { className: `custom-side ${corner}` },
      customEl('h2', { textContent: corner === 'red' ? 'Red side' : 'Blue side' }),
      customEl('div', { className: 'custom-factions', role: 'radiogroup', ariaLabel: `${corner} faction` }, ...factions.map((faction) => customEl('button', {
        type: 'button', role: 'radio', className: `custom-faction${battle.factions[corner] === faction.key ? ' on' : ''}`, ariaChecked: String(battle.factions[corner] === faction.key),
        onclick: () => { battle = changeBattle(battle, { factions: { [corner]: faction.key } }); keep(); picker(); },
      }, customEl('i', { textContent: faction.glyph, ariaHidden: 'true' }), customEl('span', { textContent: faction.label })))),
      customEl('p', { className: 'custom-line', textContent: sideLine(battle, corner) }));
    const foot = customEl('div', { className: 'custom-foot' },
      customEl('button', { type: 'button', className: 'custom-quick', textContent: '▶ Fight as it is', disabled: !battle.sides.red.men.length || !battle.sides.blue.men.length, onclick: () => onFight(customSetup(battle)) }),
      customEl('button', { type: 'button', className: 'primary custom-next', textContent: 'Fighters & placing →', onclick: placing }));
    root.append(head,
      customEl('div', { className: 'custom-body' },
        customEl('section', { className: 'custom-ground' }, customEl('h2', { textContent: 'The ground' }), maps),
        customEl('div', { className: 'custom-sides' }, side('red'), side('blue'))),
      foot);
    root.querySelector('.custom-map.on')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** The setup screen: each side's fighters counted in (− / +) and placed; every change kept. */
  function placing() {
    const level = customLevel(battle);
    const formations = { red: battle.sides.red.formation, blue: battle.sides.blue.formation };
    musterScreen(root, {
      key: CUSTOM_BATTLE.key,
      level,
      formations,
      lead: battle.lead,
      backLabel: '← Ground & sides',
      resetLabel: '↺ As it was',
      onBack: picker,
      onChange: (sides, lead) => {
        battle = settleBattle({
          ...battle,
          sides: Object.fromEntries(['red', 'blue'].map((corner) => [corner, {
            men: sides[corner].men.map((inputs, index) => ({ unit: unitOf(level.units[corner], inputs)?.id, at: sides[corner].places[index] })),
            formation: sides[corner].formation,
          }])),
          lead: lead && lead.index >= 0 ? lead : null,
        });
        keep();
      },
      onStart: (setup) => onFight({ ...setup, battle }),
    });
  }

  picker();
}
