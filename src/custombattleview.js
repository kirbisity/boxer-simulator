// The custom battle's first screen (custombattle.js is the reckoning): the ground, and a faction for each side, picked in
// one screen that fits without scrolling (on a phone each row of choices scrolls sideways). Then on to the setup screen
// (musterview.js), where each side's fighters are counted in and placed, and the battle fought. Whatever is picked is
// kept in the browser at once, so the last battle is there to change and fight again.

import { addBattleThumb } from './battlethumbs.js';
import { changeBattle, CUSTOM_BATTLE, customCounts, customSetup, customFactions, customLevel, readCustomBattle, settleBattle, writeCustomBattle } from './custombattle.js';
import { unitOf } from './muster.js';
import { musterScreen } from './musterview.js';
import { getLang, onLangChange, SEP, t, tname } from './i18n.js';

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
    return `${count} ${unit.mounted ? '🐎 ' : ''}${String(unit.label).split(SEP).map(tname).join(SEP)}`;
  });
  return t('battle.sideLine', { n: battle.sides[corner].men.length, named: named.length ? ` · ${named.join(getLang() === 'zh' ? '、' : ', ')}` : '' });
}

/**
 * Open the custom battle in `root`: `onBack()` to Battle Mode's list, `onFight(setup)` to fight it (muster.js
 * musterLevel's setup, with the battle itself as `setup.battle`: main.js makes its level of it), `storage` where it is kept.
 */
export function customBattleScreen(root, { onBack, onFight, storage = globalThis.localStorage }) {
  let battle = readCustomBattle(storage);
  const keep = () => writeCustomBattle(battle, storage);

  // On a switch of language while the first screen is open, it is drawn again (the setup screen redraws itself: musterview.js).
  let pickerHead = null;
  const off = onLangChange(() => {
    if (!root.isConnected || !pickerHead) return;
    if (root.contains(pickerHead)) picker();
    else if (!root.querySelector('.muster-head')) off();
  });

  function picker() {
    root.replaceChildren();
    root.className = 'screen custom-battle';
    const head = customEl('header', { className: 'custom-head' },
      customEl('button', { className: 'back', type: 'button', textContent: t('common.back'), onclick: onBack }),
      customEl('div', { className: 'titles' }, customEl('h1', { textContent: tname(CUSTOM_BATTLE.title) }), customEl('p', { className: 'lede', textContent: t('battle.customLede') })));
    pickerHead = head;
    const maps = customEl('div', { className: 'custom-maps', role: 'radiogroup', ariaLabel: t('battle.ground') }, ...Object.entries(CUSTOM_BATTLE.maps).map(([key, map]) => {
      const card = customEl('button', {
        type: 'button', role: 'radio', className: `custom-map${battle.map === key ? ' on' : ''}`, ariaChecked: String(battle.map === key),
        onclick: () => { battle = changeBattle(battle, { map: key }); keep(); picker(); },
      }, customEl('span', { className: 'glyph', textContent: map.glyph, ariaHidden: 'true' }), customEl('b', { textContent: tname(map.label) }));
      return addBattleThumb(card, `map-${key}`);
    }));
    const factions = customFactions();
    const side = (corner) => customEl('section', { className: `custom-side ${corner}` },
      customEl('h2', { textContent: t(corner === 'red' ? 'battle.redSide' : 'battle.blueSide') }),
      customEl('div', { className: 'custom-factions', role: 'radiogroup', ariaLabel: t('battle.faction', { side: t(`muster.${corner}`) }) }, ...factions.map((faction) => customEl('button', {
        type: 'button', role: 'radio', className: `custom-faction${battle.factions[corner] === faction.key ? ' on' : ''}`, ariaChecked: String(battle.factions[corner] === faction.key),
        onclick: () => { battle = changeBattle(battle, { factions: { [corner]: faction.key } }); keep(); picker(); },
      }, customEl('i', { textContent: faction.glyph, ariaHidden: 'true' }), customEl('span', { textContent: tname(faction.label) })))),
      customEl('p', { className: 'custom-line', textContent: sideLine(battle, corner) }));
    const foot = customEl('div', { className: 'custom-foot' },
      customEl('button', { type: 'button', className: 'custom-quick', textContent: t('battle.fightAsIs'), disabled: !battle.sides.red.men.length || !battle.sides.blue.men.length, onclick: () => onFight(customSetup(battle)) }),
      customEl('button', { type: 'button', className: 'primary custom-next', textContent: t('battle.placing'), onclick: placing }));
    root.append(head,
      customEl('div', { className: 'custom-body' },
        customEl('section', { className: 'custom-ground' }, customEl('h2', { textContent: t('battle.ground') }), maps),
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
      backLabel: () => t('battle.backGround'),
      resetLabel: () => t('battle.resetCustom'),
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
