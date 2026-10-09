// The way in: a home screen, and from it Quick Battle, Levels, Deadliest
// Warrior and the Sandbox; and a character creator that goes one plain
// question at a time. The menus only choose fighters and places; the
// fights themselves are the same world as everywhere else (main.js does
// the starting, through the hooks it hands over).

import { normaliseInputs, PRESETS } from './body.js';
import { GLADIATORS, randomBoxer, randomCharacter, randomGladiator, redress, weightOf } from './cast.js';
import { STYLE_KEYS, STYLES } from './moves.js';
import { FACTION_KEYS, FACTIONS, factionOf, HEADGEAR, headgearOptions, OUTFIT_KEYS, OUTFITS, randomColors } from './outfits.js';
import { SCENARIOS } from './scenarios.js';
import { pairedOpponent, ratingOf, starsOf, styleName, WARRIORS } from './roster.js';
import { WEAPONS } from './weapons.js';
import { SKIN_TONES } from './render.js';

// The two quick battles: what each is called, where it is fought, who fights.
export const EVENTS = {
  boxing: {
    title: 'Prize Fight', kicker: 'Boxing', place: 'ring', glyph: '🥊',
    blurb: 'Gloves on, in the ring, one weight class. Any unarmed style — and they mix them.',
  },
  gladiator: {
    title: 'Blood & Sand', kicker: 'Gladiator', place: 'colosseum', glyph: '⚔️',
    blurb: 'The Colosseum. Knights, samurai, gladiators — steel, any weight, no rules.',
  },
};

// What the character creator offers in each kind of fight.
// Passive is the sandbox's: nobody makes a fighter who will not fight.
const UNARMED = STYLE_KEYS.filter((key) => !STYLES[key].weapon && !STYLES[key].passive);
const ARMED = STYLE_KEYS.filter((key) => STYLES[key].weapon);
const STYLE_NOTES = {
  boxing: 'Hands only: slips, rolls, combinations.', kickboxing: 'Punches and kicks from range.', street: 'Wild and heavy, little defence.',
  muayThai: 'Kicks, knees, elbows, the clinch.', sumo: 'Pushes and drives men off their feet.', mix: 'Switches between the unarmed styles.',
  unskilled: 'An ordinary person in a fight.', passive: 'Will not fight back: covers up and runs.', clinchBrawl: 'Grabs the neck, hammers with the free hand.',
  handgun: 'Keeps his distance, aims and fires; hand to hand up close.', baton: 'A police baton: hard blunt blows.', longsword: 'Hand-and-a-half sword: cuts and lunges.',
  maximus: 'A legion swordsman in the arena: gladius, no shield, a veteran\'s parries.', commodus: 'The emperor as Hercules: lion skin and club, heavy blows, little defence.', whip: 'A long whip: the tip cracks in from far off; a hard lash can drop a man to his knees. Nothing against armour.', crossbow: 'Shouldered and loosed: a heavy bolt, then a slow spanning; the sidearm when they close.', nu: 'The Chinese crossbow: a bolt, spanned quicker; the sword when they close.', jian: 'The straight sword: thrust and flick.', wuxia: 'Unarmoured and very quick: runs of thrusts and cuts, slipping away.', odachi: 'A great field sword: wide two-handed cuts from far off.', bat: 'Wild two-handed swings.', riot: 'Baton behind a clear riot shield; shoves with it.', legionary: 'Scutum and gladius: the boss punched in, the point past the edge.', centurion: 'The legionary\'s way, harder forward.', guanYu: 'The Green Dragon Crescent Blade: great sweeping cuts from far off, pressed forward.', joan: 'Arming sword in white plate, bareheaded; bears the standard when she leads.', thraex: 'Sica and parmula: the curved blade hooks round a shield at the legs and flank.', murmillo: 'Gladius behind the great scutum: patient, stabbing out from cover.', secutor: 'Scutum and gladius, the smooth helmet: always closing.', retiarius: 'Net and trident, no helmet: throws the net to bind, then the trident in both hands.', scissor: 'Scale coat, gladius, and a steel-cased arm ending in a crescent blade.',
  katana: 'Two hands, held upright: deep cuts.', knife: 'Close in, stab fast, bleed them.', hoplomachus: 'Spear and round shield; a gladius in reserve.',
  warhammer: 'Long and heavy: crushes through armour.', naginata: 'Long curved blade: great cuts from far off.', spear: 'Long reach: back off, thrust from the point.', yari: 'A spear with a cross blade: thrusts deep, cuts and hooks with the side blades.', pitchfork: 'A farm fork: long reach, blunt tines, easily knocked away.',
  bow: 'Keeps away and looses arrows; the sidearm up close.', matchlock: 'One heavy shot, a long reload; the sidearm up close.',
  rapier: 'A long slender sword: the point is everything.', revolver: 'An Adams revolver, side-on, one arm straight: five shots double action, then the long reload.',
  espada: 'A Spanish cut-and-thrust sword: thrust first.', espadaRodela: 'Sword and steel buckler.', macuahuitl: 'An obsidian-edged club and a feathered shield: cuts flesh, chips on steel.', tepoztopilli: 'An obsidian-edged spear: thrusts and cuts.',
  taichi: 'Rooted and soft: deflects nearly everything, answers with palms and pushes.', taekwondo: 'Kicks from range, turning and spinning; little defence.',
  staff: 'A long staff, both ends striking: blunt and quick.', kanabo: 'An iron-studded club: huge slow swings, no thrust.', threeEyed: 'Three barrels fired in turn, then a club.',
  dao: 'A one-handed curved sabre: quick cuts.', saber: 'The steppe and Turkish sabre: long draw cuts.', saberShield: 'Sabre and kalkan, the wicker round shield.', yatagan: 'The Janissary\'s forward-curved short sword.',
  rifle: 'The AR-15: fast, accurate, devastating; thirty rounds, then a magazine change.', shotgun: 'A pump shotgun: slow, a hard kick, nine pellets that devastate up close.',
  langyaShield: 'A wolf-tooth mace and an iron parry buckler: crushes armour.', maceShield: 'A flanged mace and kalkan: the answer to armour.', steppeBow: 'A composite bow: a faster, harder arrow; the sabre up close.', swordShield: 'A curved sabre and a small round shield.', guandao: 'A heavy crescent blade on a long shaft: crushing cuts.',
};
const OUTFIT_GLYPH = { mma: '🥋', boxing: '🥊', sports: '🏃', sumo: '🍙', hiking: '🥾', casual: '👕', business: '👔', yakuza: '🐉', swat: '🛡️', knight: '🏰', samurai: '⛩️', hoplomachus: '🏛️', commoner: '🌾', mingGarrison: '🏮', mingBrigandine: '🏮', mingElite: '🐉', kungfu: '☯️', monk: '🧘', dobok: '🥋', conquistadorPlate: '⚔️', conquistadorQuilted: '⚔️', mexicaWarrior: '🦅', mexicaElite: '🐆', ronin: '🗡️', wokou: '🏴‍☠️', wokouArmoured: '🏴‍☠️', victorianLady: '🎩', victorianGent: '🎩', police: '🚓', specialForces: '🎖️', ironPagoda: '🏯', steppeLight: '🐎', steppeMedium: '🐎', steppeHeavy: '🐎', kheshig: '🐎', azap: '🌙', janissary: '🌙', ottomanHeavy: '🌙', gaziAlp: '🌙', joan: '⚜️', guanYu: '🐉', commodus: '🦁', lorarius: '🪢', hanSoldier: '🏮', wuxia: '🗡️', riot: '🛡️', thug: '🧢', legionary: '🦅', centurion: '🦅' };
const SKIN = Object.fromEntries(Object.entries(SKIN_TONES).map(([key, hex]) => [key, `#${hex.toString(16).padStart(6, '0')}`]));
const HAIR = { black: '#120d0a', 'dark brown': '#2a1a10', brown: '#6b4a2a', blond: '#c9a25e', red: '#8a3a1c', grey: '#8d8d8d' };
const HAIR_STYLES = { male: ['cleanShort', 'fade', 'buzz', 'spiky', 'cornrows', 'midLong', 'long', 'dreads', 'topknot', 'bald'], female: ['bun', 'ponytail', 'cleanShort', 'midLong', 'long', 'dreads', 'topknot'] };
/** A style's name, and its weapon when the name does not already say it. */
const words = (key) => key.replace(/([A-Z])/g, ' $1').toLowerCase();

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/** A screen: title, subtitle, body, and a back button. */
function screen(id, title, subtitle, onBack) {
  const root = document.getElementById(id);
  root.replaceChildren();
  root.className = 'screen';
  const head = el('header', { className: 'screen-head' });
  if (onBack) head.append(el('button', { className: 'back', type: 'button', textContent: '← Back', onclick: onBack }));
  head.append(el('div', { className: 'titles' }, el('h1', { textContent: title }), subtitle ? el('p', { className: 'lede', textContent: subtitle }) : null));
  const body = el('div', { className: 'screen-body' });
  root.append(head, body);
  return body;
}

/** A big choice: glyph, kicker, title, a line of text. */
function choice({ glyph, kicker, title, text, onClick, tone = '' }) {
  return el('button', { className: `choice ${tone}`, type: 'button', onclick: onClick },
    el('span', { className: 'glyph', textContent: glyph, ariaHidden: 'true' }),
    el('span', { className: 'words' }, kicker ? el('em', { textContent: kicker }) : null, el('b', { textContent: title }), el('span', { textContent: text })));
}

/** Each style's faction, by the character who fights in it (ring if none does): for grouping styles. */
const STYLE_FACTION = (key) => {
  const character = Object.values(PRESETS).find((preset) => preset.style === key);
  return character ? factionOf(character) : 'ring';
};

/** Install the menus. `game` is the set of hooks main.js provides. */
export function installMenus(game) {
  const show = (id) => {
    for (const other of ['home', 'quick', 'levels-screen', 'versus', 'wizard']) document.getElementById(other).hidden = other !== id;
    document.body.dataset.overlay = id ?? '';
  };
  const close = () => show(null);

  // ---- Home ------------------------------------------------------------
  function home() {
    game.attract();
    const body = screen('home', 'Gladiator', 'Fighters of bone, muscle and steel — every blow simulated.', null);
    body.parentElement.classList.add('home');
    body.append(el('div', { className: 'choices four' },
      choice({ glyph: '⚡', kicker: 'Play now', title: 'Quick Battle', text: 'A prize fight or the arena: you, or a random fighter, against whoever comes.', onClick: quickEvent, tone: 'gold' }),
      choice({ glyph: '🗺️', kicker: 'Stories', title: 'Levels', text: 'Set fights in set places: a subway platform at 1:40 a.m., a village in revolt.', onClick: levels }),
      choice({ glyph: '☠️', kicker: 'Who would win?', title: 'Deadliest Warrior', text: 'Pick any two: a knight against a samurai, a sumo against a hoplomachus.', onClick: versus }),
      choice({ glyph: '🧪', kicker: 'Everything', title: 'Sandbox', text: 'Every setting: teams of eight, bodies grown from diet and training, every layer.', onClick: () => { close(); game.sandbox(); } })));
    show('home');
  }

  // ---- Quick Battle ------------------------------------------------------
  function quickEvent() {
    const body = screen('quick', 'Quick Battle', 'Choose the fight.', home);
    body.append(el('div', { className: 'choices two' }, ...Object.entries(EVENTS).map(([key, event]) => choice({ glyph: event.glyph, kicker: event.kicker, title: event.title, text: event.blurb, onClick: () => quickFighter(key) }))));
    show('quick');
  }

  function quickFighter(eventKey) {
    const event = EVENTS[eventKey];
    const body = screen('quick', event.title, 'Who fights for you?', quickEvent);
    const random = () => (eventKey === 'boxing' ? randomBoxer() : randomGladiator());
    body.append(el('div', { className: 'choices two' },
      choice({ glyph: '🎲', kicker: 'Fastest', title: 'Random fighter', text: 'Someone is picked for you. Straight into the fight.', onClick: () => startQuick(eventKey, random()) }),
      choice({ glyph: '🛠️', kicker: 'Step by step', title: 'Make your fighter', text: 'Body, training, style, gear and looks — one question at a time.', onClick: () => wizard({ event: eventKey, start: random(), finish: 'Fight!', onDone: (inputs) => startQuick(eventKey, inputs), onBack: () => quickFighter(eventKey) }) })));
    show('quick');
  }

  function startQuick(eventKey, player) {
    const event = EVENTS[eventKey];
    // The prize fight pairs by weight (every man fights mixed, gloved); the arena by rating: one of each kind of man, the nearer his rating to yours the likelier.
    const arenaOpponent = () => {
      const kinds = GLADIATORS.map((key) => ({ key, inputs: PRESETS[key] }));
      const { key } = pairedOpponent(player, kinds.map((kind) => ({ ...kind.inputs, key: kind.key })));
      return randomGladiator(Math.random, key);
    };
    const opponent = () => (eventKey === 'boxing' ? randomBoxer(Math.random, { weightKg: weightOf(player) }) : arenaOpponent());
    close();
    const fight = () => game.match({ red: [player], blue: [opponent()], place: event.place, game: 'quick', label: event.title, next: { text: 'Next opponent', run: fight } });
    fight();
  }

  // ---- Levels --------------------------------------------------------------
  function levels() {
    const body = screen('levels-screen', 'Levels', 'Set fights in set places, with their own people.', home);
    body.append(el('div', { className: 'choices levels' }, ...Object.entries(SCENARIOS).map(([key, level]) => {
      const who = level.roster ?? level.fighters.map((fighter) => `${fighter.name} · ${fighter.heightCm} cm, ${fighter.weightKg ? `${fighter.weightKg} kg` : `${Math.round(fighter.bodyFat * 100)}% fat`}`).join(' — ');
      return choice({ glyph: { rebellion: '🌾', pride: '🥊', port: '🚢', sekigahara: '🏯', pyongyang: '🐉', otumba: '🦅', zeelandia: '⚓', wokou: '🏴‍☠️', rhodes: '🌙' }[key] ?? '🚇', kicker: level.place, title: level.title, text: `${level.blurb} ${who}`, onClick: () => { close(); game.level(key); } });
    })));
    show('levels-screen');
  }

  // ---- Deadliest Warrior -------------------------------------------------------
  function versus() {
    // Each side picks a faction, then turns its carousel through that faction's warriors.
    const faction = { red: 'knights', blue: 'japanese' };
    const custom = { red: null, blue: null };
    const body = screen('versus', 'Deadliest Warrior', null, home);
    body.parentElement.classList.add('dw');
    const roster = (corner) => WARRIORS.filter((warrior) => warrior.faction === faction[corner]);
    // A faction opens on its flagship (`flagship` in the roster), else on its first.
    const opening = (corner) => Math.max(0, roster(corner).findIndex((warrior) => warrior.flagship));
    const at = { red: opening('red'), blue: opening('blue') };
    const entry = (corner) => custom[corner] ?? roster(corner)[at[corner]];
    const sides = {};
    for (const corner of ['red', 'blue']) {
      const tabs = el('div', { className: 'dw-tabs', role: 'tablist' }, ...FACTION_KEYS.filter((key) => WARRIORS.some((warrior) => warrior.faction === key)).map((key) => {
        const tab = el('button', { type: 'button', className: 'dw-tab', role: 'tab', title: FACTIONS[key].blurb }, el('span', { textContent: FACTIONS[key].glyph }), el('b', { textContent: FACTIONS[key].label }));
        tab.dataset.faction = key;
        tab.onclick = () => {
          faction[corner] = key;
          at[corner] = opening(corner);
          custom[corner] = null;
          build(corner);
        };
        return tab;
      }));
      const stage = el('div', { className: 'dw-stage' });
      const title = el('div', { className: 'dw-name' });
      const prev = el('button', { className: 'dw-arrow prev', type: 'button', ariaLabel: 'Previous', textContent: '‹', onclick: () => turn(corner, -1) });
      const next = el('button', { className: 'dw-arrow next', type: 'button', ariaLabel: 'Next', textContent: '›', onclick: () => turn(corner, 1) });
      const own = el('button', { className: 'dw-own', type: 'button', textContent: '✎ Make your own', onclick: () => wizard({ event: 'any', start: randomCharacter(), finish: 'Use this fighter', onDone: (inputs) => { custom[corner] = { key: `custom-${corner}-${Date.now()}`, title: inputs.name, line: styleName(STYLES[inputs.style]), inputs }; game.attract(); show('versus'); draw(corner); }, onBack: () => show('versus') }) });
      const portraits = new Map();
      // Swipe across the stage to turn it.
      let downAt = null;
      stage.addEventListener('pointerdown', (press) => { downAt = press.clientX; });
      // A swipe ends in a click on the card it started on: that click is the swipe's, not a pick.
      let swiped = false;
      stage.addEventListener('pointerup', (lift) => {
        if (downAt === null) return;
        const moved = lift.clientX - downAt;
        downAt = null;
        swiped = Math.abs(moved) > 36;
        if (swiped) turn(corner, moved < 0 ? 1 : -1);
      });
      stage.addEventListener('click', (click) => {
        if (!swiped) return;
        swiped = false;
        click.stopPropagation();
      }, true);
      const section = el('section', { className: `dw-side ${corner}` }, el('span', { className: 'dw-corner', textContent: corner === 'red' ? 'RED' : 'BLUE' }), tabs, prev, stage, next, title, own);
      sides[corner] = { section, cards: [], title, stage, tabs, portraits };
    }
    // The faction's warriors as cards on the stage (each portrait made once, kept).
    function build(corner) {
      const side = sides[corner];
      side.stage.replaceChildren();
      side.cards = roster(corner).map((warrior, index) => {
        const image = side.portraits.get(warrior.key) ?? el('img', { alt: '', draggable: false });
        side.portraits.set(warrior.key, image);
        const card = el('button', { className: 'dw-card', type: 'button', tabIndex: -1, onclick: () => { const offset = index - at[corner]; if (offset) turn(corner, offset); } }, image);
        card.dataset.index = String(index);
        side.stage.append(card);
        return { card, image, warrior };
      });
      for (const tab of side.tabs.children) tab.classList.toggle('on', tab.dataset.faction === faction[corner]);
      draw(corner);
    }
    function turn(corner, by) {
      const count = roster(corner).length;
      custom[corner] = null;
      at[corner] = (at[corner] + by + count) % count;
      draw(corner);
    }
    function draw(corner) {
      const side = sides[corner];
      const count = side.cards.length;
      for (const { card, image, warrior } of side.cards) {
        let offset = Number(card.dataset.index) - at[corner];
        if (offset > count / 2) offset -= count;
        if (offset < -count / 2) offset += count;
        // The chosen in the middle; the next two coming in on the right, smaller and turned; one behind on the left.
        card.dataset.slot = String(Math.max(-2, Math.min(3, offset)));
        card.classList.toggle('chosen', offset === 0 && !custom[corner]);
        if (offset >= -1 && offset <= 2 && !image.src) game.portrait(warrior.key, warrior.inputs).then((url) => { image.src = url; });
      }
      const shown = entry(corner);
      // His strength in stars (roster.js), the rating behind them on hover.
      const stars = starsOf(shown.inputs);
      const starLine = el('span', { className: 'dw-stars', textContent: stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '', title: stars ? `Fighting rating ${ratingOf(shown.inputs)} (Maximus 100)` : '' });
      side.title.replaceChildren(el('b', { textContent: shown.title }), starLine, el('span', { textContent: shown.line }));
      if (custom[corner]) side.title.prepend(el('em', { textContent: 'Your fighter' }));
    }
    const fightButton = el('button', { className: 'primary big dw-fight', type: 'button', textContent: 'Fight' });
    fightButton.onclick = () => {
      // A character in armour comes in one of its picked designs.
      const red = normaliseInputs(redress(structuredClone(entry('red').inputs)));
      const blue = normaliseInputs(redress(structuredClone(entry('blue').inputs)));
      const armed = [red, blue].some((inputs) => STYLES[inputs.style]?.weapon);
      close();
      const fight = () => game.match({ red: [red], blue: [blue], place: armed ? 'colosseum' : 'ring', game: 'versus', label: 'Deadliest Warrior', next: { text: 'Rematch', run: fight } });
      fight();
    };
    body.append(sides.red.section, el('div', { className: 'dw-middle' }, el('span', { className: 'dw-vs', textContent: 'VS' }), fightButton), sides.blue.section);
    build('red');
    build('blue');
    show('versus');
  }

  // ---- The character creator ---------------------------------------------------
  /**
   * One question at a time, with the fighter shown beside it as it changes.
   * `event`: 'boxing' (unarmed, in gloves), 'gladiator' (armed), or 'any'.
   */
  function wizard({ event, start, finish, onDone, onBack }) {
    const inputs = normaliseInputs(structuredClone(start));
    if (event === 'boxing') Object.assign(inputs, { outfit: { kind: 'boxing', design: 0 }, accessories: [] });
    let gearTouched = false;
    const styles = event === 'boxing' ? UNARMED : event === 'gladiator' ? ARMED : STYLE_KEYS.filter((key) => !STYLES[key].passive);
    const steps = [
      { key: 'who', title: 'Who are they?', render: stepWho },
      { key: 'body', title: 'Their build', render: stepBody },
      { key: 'training', title: 'How they live', render: stepTraining },
      { key: 'style', title: 'How they fight', render: stepStyle },
      ...(event === 'boxing' ? [] : [{ key: 'gear', title: 'What they wear', render: stepGear }]),
      { key: 'look', title: 'Their face', render: stepLook },
      { key: 'ready', title: 'Ready', render: stepReady },
    ];
    let index = 0;
    const root = document.getElementById('wizard');
    root.className = 'wizard';
    const panel = el('div', { className: 'wizard-panel', role: 'dialog', ariaLabel: 'Make your fighter' });
    root.replaceChildren(panel);
    let previewTimer = null;
    const preview = () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => game.preview(inputs, event), 60);
    };

    function draw() {
      const step = steps[index];
      const dots = el('ol', { className: 'steps', ariaLabel: 'Steps' }, ...steps.map((each, at) => {
        const dot = el('li', { className: at === index ? 'now' : at < index ? 'done' : '' }, el('button', { type: 'button', textContent: String(at + 1), title: each.title, onclick: () => { index = at; draw(); } }));
        return dot;
      }));
      const content = el('div', { className: 'step-body' });
      step.render(content);
      const back = el('button', { type: 'button', textContent: index === 0 ? '← Cancel' : '← Back', onclick: () => { if (index === 0) { game.attract(); onBack(); } else { index -= 1; draw(); } } });
      const nextLabel = index === steps.length - 1 ? finish : 'Next →';
      const next = el('button', { type: 'button', className: 'primary', textContent: nextLabel, onclick: () => {
        if (index === steps.length - 1) {
          onDone(normaliseInputs(structuredClone(inputs)));
        } else {
          index += 1;
          draw();
        }
      } });
      panel.replaceChildren(
        el('p', { className: 'step-count', textContent: `Step ${index + 1} of ${steps.length}` }),
        el('h1', { textContent: step.title }),
        dots, content,
        el('div', { className: 'wizard-nav' }, back, next),
      );
      next.focus({ preventScroll: true });
      preview();
    }

    // Controls, each one plain and big.
    const buttons = (options, current, onPick, describe = (option) => words(option)) => el('div', { className: 'chips', role: 'radiogroup' }, ...options.map((option) => {
      const button = el('button', { type: 'button', className: option === current() ? 'chip on' : 'chip', textContent: describe(option), role: 'radio', ariaChecked: String(option === current()) });
      button.onclick = () => { onPick(option); draw(); };
      return button;
    }));
    const slider = ({ label, min, max, step, get, set, show: shown }) => {
      const value = el('output', { textContent: shown(get()) });
      const input = el('input', { type: 'range', min, max, step, value: get(), ariaLabel: label });
      input.oninput = () => {
        set(Number(input.value));
        value.textContent = shown(get());
        refreshStats();
        preview();
      };
      return el('label', { className: 'slider' }, el('span', { className: 'slider-head' }, el('b', { textContent: label }), value), input);
    };
    let statsBox = null;
    const refreshStats = () => {
      if (!statsBox) return;
      const stats = game.stats(inputs);
      statsBox.replaceChildren(...[
        ['Weight', `${stats.weight.toFixed(0)} kg`], ['Body fat', `${Math.round(stats.bodyFat * 100)}%`],
        ['Bench', `${Math.round(stats.bench)} kg`], ['30 m sprint', `${stats.sprint.toFixed(2)} s`],
      ].map(([name, text]) => el('div', { className: 'stat' }, el('span', { textContent: name }), el('b', { textContent: text }))));
    };
    const stats = () => {
      statsBox = el('div', { className: 'stats', ariaLive: 'polite' });
      refreshStats();
      return statsBox;
    };
    const swatches = (palette, current, onPick) => el('div', { className: 'swatches', role: 'radiogroup' }, ...Object.entries(palette).map(([name, hex]) => {
      const button = el('button', { type: 'button', className: hex === current() ? 'swatch on' : 'swatch', title: words(name), ariaLabel: words(name) });
      button.style.background = hex;
      button.onclick = () => { onPick(hex); draw(); };
      return button;
    }));

    function stepWho(content) {
      const name = el('input', { type: 'text', value: inputs.name, maxLength: 32, ariaLabel: 'Name' });
      name.oninput = () => { inputs.name = name.value || 'Fighter'; };
      content.append(
        el('label', { className: 'field' }, el('b', { textContent: 'Name' }), name),
        el('div', { className: 'field' }, el('b', { textContent: 'Man or woman' }), buttons(['male', 'female'], () => inputs.sex, (sex) => {
          inputs.sex = sex;
          if (!HAIR_STYLES[sex].includes(inputs.look.hairStyle)) inputs.look.hairStyle = HAIR_STYLES[sex][0];
          if (sex === 'female') inputs.look.facialHair = 'none';
        }, (sex) => (sex === 'male' ? 'Man' : 'Woman'))),
        slider({ label: 'Age', min: 18, max: 100, step: 1, get: () => inputs.age, set: (value) => { inputs.age = value; }, show: (value) => `${value} years` }),
      );
    }
    function stepBody(content) {
      content.append(
        slider({ label: 'Height', min: 150, max: 210, step: 1, get: () => inputs.heightCm, set: (value) => { inputs.heightCm = value; }, show: (value) => `${value} cm` }),
        el('div', { className: 'field' }, el('b', { textContent: 'Frame' }), buttons(['small', 'medium', 'large'], () => inputs.frame, (frame) => { inputs.frame = frame; refreshStats(); }, (frame) => ({ small: 'Slight', medium: 'Medium', large: 'Broad' })[frame])),
        stats(),
      );
    }
    function stepTraining(content) {
      const [low, high] = game.calorieRange(inputs);
      content.append(
        el('p', { className: 'hint', textContent: 'Body fat is not chosen: it settles from what they eat and how they train.' }),
        slider({ label: 'Training', min: 0, max: 1, step: 0.01, get: () => inputs.exercise, set: (value) => { inputs.exercise = value; }, show: (value) => `${Math.round(game.hours(value))} hours a week` }),
        slider({ label: 'Eating', min: Math.floor(low / 10) * 10, max: Math.ceil(high / 10) * 10, step: 10, get: () => inputs.calories, set: (value) => { inputs.calories = value; }, show: (value) => `${Math.round(value).toLocaleString('en')} kcal a day` }),
        stats(),
      );
    }
    function stepStyle(content) {
      const groups = FACTION_KEYS.map((faction) => [faction, styles.filter((key) => STYLE_FACTION(key) === faction)]).filter(([, keys]) => keys.length);
      content.append(...groups.map(([faction, keys]) => el('div', { className: 'style-group' },
        el('b', { className: 'style-faction', textContent: `${FACTIONS[faction].glyph} ${FACTIONS[faction].label}` }),
        el('div', { className: 'cards' }, ...keys.map(styleCard)))));
    }
    function styleCard(key) {
      {
        const style = STYLES[key];
        const card = el('button', { type: 'button', className: inputs.style === key ? 'card-choice on' : 'card-choice' },
          el('b', { textContent: style.label }), el('span', { textContent: STYLE_NOTES[key] ?? '' }));
        card.onclick = () => {
          inputs.style = key;
          // Dressed for it, unless they have already chosen what to wear.
          const character = Object.values(PRESETS).find((preset) => preset.style === key);
          if (!gearTouched && event !== 'boxing' && character?.outfit) {
            inputs.outfit = { ...character.outfit, colors: randomColors(character.outfit.kind) };
            inputs.accessories = [...(character.accessories ?? [])];
          }
          draw();
        };
        return card;
      }
    }
    function stepGear(content) {
      const kinds = OUTFIT_KEYS;
      const outfit = inputs.outfit ?? { kind: 'boxing', design: 0 };
      const designs = OUTFITS[outfit.kind].designs.map((design, at) => [design, at]).filter(([design]) => !design.levelOnly);
      content.append(
        el('div', { className: 'field' }, el('b', { textContent: 'Outfit' }), buttons(kinds, () => outfit.kind, (kind) => {
          gearTouched = true;
          inputs.outfit = { kind, design: 0, colors: randomColors(kind) };
          inputs.accessories = headgearOptions(kind).includes(inputs.accessories?.[0]) ? inputs.accessories : [];
        }, (kind) => `${OUTFIT_GLYPH[kind] ?? ''} ${OUTFITS[kind].label}`)),
        designs.length > 1 ? el('div', { className: 'field' }, el('b', { textContent: 'Design' }), buttons(designs.map(([, at]) => String(at)), () => String(outfit.design ?? 0), (at) => { gearTouched = true; inputs.outfit = { ...outfit, design: Number(at) }; }, (at) => OUTFITS[outfit.kind].designs[at].label)) : null,
        el('div', { className: 'field' }, el('b', { textContent: 'Colours' }), el('button', { type: 'button', className: 'chip', textContent: '🎨 Shuffle colours', onclick: () => { gearTouched = true; inputs.outfit = { ...inputs.outfit, colors: randomColors(outfit.kind) }; preview(); } })),
        el('div', { className: 'field' }, el('b', { textContent: 'On the head' }), buttons(headgearOptions(outfit.kind), () => inputs.accessories?.[0] ?? 'none', (item) => { gearTouched = true; inputs.accessories = item === 'none' ? [] : [item]; }, (item) => (item === 'none' ? 'Nothing' : HEADGEAR[item].label))),
      );
    }
    function stepLook(content) {
      const look = inputs.look;
      content.append(
        el('div', { className: 'field' }, el('b', { textContent: 'Skin' }), swatches(SKIN, () => SKIN[look.skinTone], (hex) => { look.skinTone = Object.keys(SKIN).find((key) => SKIN[key] === hex); })),
        el('div', { className: 'field' }, el('b', { textContent: 'Hair' }), buttons(HAIR_STYLES[inputs.sex] ?? HAIR_STYLES.male, () => look.hairStyle, (style) => { look.hairStyle = style; })),
        el('div', { className: 'field' }, el('b', { textContent: 'Hair colour' }), swatches(HAIR, () => look.hairColor, (hex) => { look.hairColor = hex; })),
        inputs.sex === 'male' ? el('div', { className: 'field' }, el('b', { textContent: 'Facial hair' }), buttons(['none', 'stubble', 'mustache', 'beard'], () => look.facialHair, (hair) => { look.facialHair = hair; })) : null,
        el('div', { className: 'field' }, el('b', { textContent: 'Eyes' }), buttons(['brown', 'hazel', 'blue', 'green', 'grey', 'amber'], () => look.eyeColor, (eye) => { look.eyeColor = eye; })),
      );
    }
    function stepReady(content) {
      const style = STYLES[inputs.style];
      const stat = game.stats(inputs);
      content.append(el('dl', { className: 'summary' }, ...[
        ['Name', inputs.name], ['Style', styleName(style)],
        ['Body', `${inputs.sex === 'male' ? 'Man' : 'Woman'}, ${inputs.age}, ${inputs.heightCm} cm, ${stat.weight.toFixed(0)} kg, ${Math.round(stat.bodyFat * 100)}% fat`],
        ['Wearing', `${OUTFITS[inputs.outfit?.kind ?? 'boxing'].label}${inputs.accessories?.[0] ? `, ${HEADGEAR[inputs.accessories[0]].label.toLowerCase()}` : ''}`],
      ].flatMap(([name, text]) => [el('dt', { textContent: name }), el('dd', { textContent: text })])));
    }

    show('wizard');
    draw();
  }

  // Back to the menu from a fight.
  game.onMenu(home);
  return { home, levels, versus, quickEvent };
}
