// The way in: a home screen, and from it (in this order) Career (to come),
// Levels, Deadliest Warrior, Quick Battle and the Sandbox; and a character
// creator that goes one plain
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
import { canRide, HORSES, mountOf } from './horses.js';
import { SKIN_TONES } from './render.js';
import { fightUiHomeSwitch } from './fightui/toggle.js';

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
  handgun: 'Keeps his distance, aims and fires; hand to hand up close.', baton: 'A police baton: hard blunt blows.', lance: 'The war lance on foot, 3.3 m: holds his man at the point and drives it in with his weight behind it; slow, and tired by it.', longsword: 'Hand-and-a-half sword: cuts and lunges.',
  maximus: 'A legion swordsman in the arena: gladius, no shield, a veteran\'s parries.', commodus: 'The emperor as Hercules: lion skin and club, heavy blows, little defence.', whip: 'A long whip: the tip cracks in from far off; a hard lash can drop a man to his knees. Nothing against armour.', crossbow: 'Shouldered and loosed: a heavy bolt, then a slow spanning; the sidearm when they close.', nu: 'The Chinese crossbow: a bolt, spanned quicker; the sword when they close.', jian: 'The straight sword: thrust and flick.', wuxia: 'Unarmoured and very quick: runs of thrusts and cuts, slipping away.', odachi: 'A great field sword: wide two-handed cuts from far off.', bat: 'Wild two-handed swings.', riot: 'Baton behind a clear riot shield; shoves with it.', legionary: 'Scutum and gladius: the boss punched in, the point past the edge.', centurion: 'The legionary\'s way, harder forward.', guanYu: 'The Green Dragon Crescent Blade: great sweeping cuts from far off, pressed forward.', joan: 'Arming sword in white plate, bareheaded; bears the standard when she leads.', thraex: 'Sica and parmula: the curved blade hooks round a shield at the legs and flank.', murmillo: 'Gladius behind the great scutum: patient, stabbing out from cover.', secutor: 'Scutum and gladius, the smooth helmet: always closing.', retiarius: 'Net and trident, no helmet: throws the net to bind, then the trident in both hands.', scissor: 'Scale coat, gladius, and a steel-cased arm ending in a crescent blade.',
  katana: 'Two hands, held upright: deep cuts.', ronin: 'The katana fought to finish it: presses in, long runs of cuts, little rest.', nito: 'Two swords, katana and wakizashi: one meets his blade while the other cuts into the gap.', knife: 'Close in, stab fast, bleed them.', hoplomachus: 'Spear and round shield; a gladius in reserve.',
  warhammer: 'Long and heavy: crushes through armour.', naginata: 'Long curved blade: great cuts from far off.', spear: 'Long reach: back off, thrust from the point.', yari: 'A spear with a cross blade: thrusts deep, cuts and hooks with the side blades.', pitchfork: 'A farm fork: long reach, blunt tines, easily knocked away.',
  bow: 'Keeps away and looses arrows; the sidearm up close.', matchlock: 'One heavy shot, a long reload; the sidearm up close.',
  rapier: 'A long slender sword: the point is everything.', revolver: 'An Adams revolver, side-on, one arm straight: five shots double action, then the long reload.',
  espada: 'A Spanish cut-and-thrust sword: thrust first.', espadaRodela: 'Sword and steel buckler.', macuahuitl: 'An obsidian-edged club and a feathered shield: cuts flesh, chips on steel.', tepoztopilli: 'An obsidian-edged spear: thrusts and cuts.',
  taichi: 'Rooted and soft: deflects nearly everything, answers with palms and pushes.', taekwondo: 'Kicks from range, turning and spinning; little defence.',
  staff: 'A long staff, both ends striking: blunt and quick.', kanabo: 'An iron-studded club: huge slow swings, no thrust.', threeEyed: 'Three barrels fired in turn, then a club.',
  dao: 'A one-handed curved sabre: quick cuts.', saber: 'The steppe and Turkish sabre: long draw cuts.', saberShield: 'Sabre and kalkan, the wicker round shield.', saladin: 'The straight Ayyubid sword and a leather-faced round shield: long cuts from behind it, patient, quick to answer.', yatagan: 'The Janissary\'s forward-curved short sword.',
  gorilla: 'A silverback upright: huge hooks and shoves, charges; little defence.', combatBot: 'Forearm guns: the AR-15 arm from afar, the shotgun arm closer, never reloading; then a mace and a heavy blade.',
  rifle: 'The AR-15: fast, accurate, devastating; thirty rounds, then a magazine change.', shotgun: 'A pump shotgun: slow, a hard kick, nine pellets that devastate up close.',
  langyaShield: 'A wolf-tooth mace and an iron parry buckler: crushes armour.', maceShield: 'A flanged mace and kalkan: the answer to armour.', steppeBow: 'A composite bow: a faster, harder arrow; the sabre up close.', kheshigBow: 'Up to five quick arrows, then straight in with the flanged mace.', swordShield: 'A curved sabre and a small round shield.', guandao: 'A heavy crescent blade on a long shaft: crushing cuts.',
};
const OUTFIT_GLYPH = { mma: '🥋', boxing: '🥊', sports: '🏃', sumo: '🍙', hiking: '🥾', casual: '👕', business: '👔', yakuza: '🐉', swat: '🛡️', knight: '🏰', tournament: '🏇', samurai: '⛩️', hoplomachus: '🏛️', commoner: '🌾', mingGarrison: '🏮', mingBrigandine: '🏮', mingElite: '🐉', kungfu: '☯️', monk: '🧘', dobok: '🥋', conquistadorPlate: '⚔️', conquistadorQuilted: '⚔️', mexicaWarrior: '🦅', mexicaElite: '🐆', ronin: '🗡️', wokou: '🏴‍☠️', wokouArmoured: '🏴‍☠️', victorianLady: '🎩', victorianGent: '🎩', police: '🚓', specialForces: '🎖️', ironPagoda: '🏯', steppeLight: '🐎', steppeMedium: '🐎', mingIronLamellar: '🏮', kheshig: '🐎', azap: '🌙', janissary: '🌙', ottomanHeavy: '🌙', gaziAlp: '🌙', saladin: '🌙', joan: '⚜️', guanYu: '🐉', commodus: '🦁', lorarius: '🪢', hanSoldier: '🏮', wuxia: '🗡️', riot: '🛡️', thug: '🧢', legionary: '🦅', centurion: '🦅', silverback: '🦍', humanoid: '🤖', combatBot: '🤖' };
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

/** A big choice: glyph, kicker, title, a line of text. Without `onClick`, not open yet: shown, dimmed, and saying so. */
function choice({ glyph, kicker, title, text, onClick, tone = '' }) {
  const open = Boolean(onClick);
  return el('button', { className: `choice ${tone}${open ? '' : ' soon'}`, type: 'button', onclick: onClick ?? null, ariaDisabled: open ? null : 'true' },
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
  // In order. Career is first and not open yet (it needs a store of its own, to come): when it is, it gets its onClick.
  function home() {
    game.attract();
    const body = screen('home', 'Gladiator', 'Fighters of bone, muscle and steel — every blow simulated.', null);
    body.parentElement.classList.add('home');
    body.append(el('div', { className: 'choices home-choices' },
      choice({ glyph: '🏆', kicker: 'Coming soon', title: 'Career', text: 'One fighter, bout after bout, as he rises. Being built now.', tone: 'career' }),
      choice({ glyph: '🗺️', kicker: 'Stories', title: 'Levels', text: 'Set fights in set places. Start with the tutorial.', onClick: levels, tone: 'gold' }),
      choice({ glyph: '☠️', kicker: 'Who would win?', title: 'Deadliest Warrior', text: 'Pick any two warriors and watch them, or fight as one.', onClick: versus }),
      choice({ glyph: '⚡', kicker: 'Play now', title: 'Quick Battle', text: 'A random fighter against whoever comes. One tap.', onClick: quickEvent }),
      choice({ glyph: '🧪', kicker: 'Expert', title: 'Sandbox', text: 'Every setting: teams, bodies grown from diet and training, every layer.', onClick: () => { close(); game.sandbox(); } })),
      el('div', { className: 'home-links' },
        el('button', { className: 'replay-intro', type: 'button', textContent: '🎯 Tutorial', onclick: () => { close(); game.tutorial(); } }),
        // The intro (intro.js) again: the legends, then back here.
        el('button', { className: 'replay-intro', type: 'button', textContent: '▶ Watch the intro', onclick: () => { close(); game.intro(home); } }),
        // How the player attacks (fightui/): tapping his man or the buttons; a tap flips it.
        fightUiHomeSwitch((textContent, onclick) => el('button', { className: 'replay-intro', type: 'button', textContent, onclick }))));
    show('home');
  }

  // ---- Quick Battle ------------------------------------------------------
  // One tap from here to the fight (then the side): a random fighter for you. Making your own is the smaller way.
  function quickEvent() {
    const body = screen('quick', 'Quick Battle', 'Tap a fight: you get a random fighter.', home);
    const random = (eventKey) => (eventKey === 'boxing' ? randomBoxer() : randomGladiator());
    body.append(
      el('div', { className: 'choices two' }, ...Object.entries(EVENTS).map(([key, event]) => choice({ glyph: event.glyph, kicker: event.kicker, title: event.title, text: event.blurb, onClick: () => startQuick(key, random(key)) }))),
      el('div', { className: 'quick-make' }, el('span', { textContent: 'Or make your own fighter first:' }),
        ...Object.entries(EVENTS).map(([key, event]) => el('button', { type: 'button', textContent: `🛠️ ${event.title}`, onclick: () => wizard({ event: key, start: random(key), finish: 'Fight!', onDone: (inputs) => startQuick(key, inputs), onBack: quickEvent }) }))),
    );
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
    const body = screen('levels-screen', 'Levels', 'Tap a level, then choose your side.', home);
    // The training yard first: every control, one at a time.
    const yard = choice({ glyph: '🎯', kicker: 'Start here · two minutes', title: 'Tutorial', text: 'Every control, one at a time, against a knight who stands to be struck.', onClick: () => { close(); game.tutorial(); }, tone: 'gold' });
    body.append(el('div', { className: 'choices levels' }, yard, ...Object.entries(SCENARIOS).map(([key, level]) => choice({ glyph: { rebellion: '🌾', pride: '🥊', port: '🚢', sekigahara: '🏯', pyongyang: '🐉', otumba: '🦅', zeelandia: '⚓', wokou: '🏴‍☠️', rhodes: '🌙' }[key] ?? '🚇', kicker: level.place, title: level.title, text: level.blurb, onClick: () => { close(); game.level(key); } }))));
    show('levels-screen');
  }

  // ---- Deadliest Warrior -------------------------------------------------------
  function versus() {
    // Each side picks a faction, then turns its carousel through that faction's warriors.
    const faction = { red: 'knights', blue: 'japanese' };
    const custom = { red: null, blue: null };
    // On horseback (each side's pick; only a man whose kit rides can: horses.js).
    const mounted = { red: false, blue: false };
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
      // A mouse wheel turns into a sideways scroll on the row (a trackpad's own sideways swipe passes through).
      tabs.addEventListener('wheel', (wheel) => {
        if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY)) return;
        tabs.scrollLeft += wheel.deltaY;
        wheel.preventDefault();
      }, { passive: false });
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
      const section = el('section', { className: `dw-side ${corner}` }, el('span', { className: 'dw-corner', textContent: corner === 'red' ? 'RED' : 'BLUE' }), tabs, prev, stage, next, title);
      sides[corner] = { section, cards: [], title, stage, tabs, portraits, own };
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
      // The row scrolls when the factions don't fit: bring the chosen one into view (the row only, not the page).
      const chosen = side.tabs.querySelector('.dw-tab.on');
      if (chosen && side.tabs.scrollWidth > side.tabs.clientWidth) side.tabs.scrollTo({ left: chosen.offsetLeft - (side.tabs.clientWidth - chosen.offsetWidth) / 2, behavior: 'smooth' });
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
        // Only the one in the middle takes a press; the arrows and a swipe turn to the others.
        card.inert = offset !== 0;
        if (offset >= -1 && offset <= 2 && !image.src) game.portrait(warrior.key, warrior.inputs).then((url) => { image.src = url; });
      }
      const shown = entry(corner);
      // His strength in stars (roster.js), the rating behind them on hover.
      const stars = starsOf(shown.inputs);
      const starLine = el('span', { className: 'dw-stars', textContent: stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '', title: stars ? `Fighting rating ${ratingOf(shown.inputs)} (Maximus 100)` : '' });
      // Mounted or on foot: offered to a man who rides, with his horse and its armour.
      const rides = canRide(shown.inputs);
      const kit = rides ? mountOf(shown.inputs) : null;
      const mount = el('button', { type: 'button', className: `dw-mount${rides && mounted[corner] ? ' on' : ''}`, disabled: !rides, textContent: rides ? (mounted[corner] ? `🐎 Mounted · ${HORSES[kit.breed].label}${kit.barding === 'bare' ? '' : `, ${kit.barding} barding`}` : '🐎 On foot (tap to ride)') : '🚶 Fights on foot', title: rides ? 'Ride or fight on foot' : 'His people did not fight on horseback' });
      mount.onclick = () => {
        mounted[corner] = !mounted[corner];
        draw(corner);
      };
      // Under his name: on horseback or not, and making your own instead, side by side.
      side.title.replaceChildren(el('b', { textContent: shown.title }), starLine, el('span', { textContent: shown.line }), el('div', { className: 'dw-buttons' }, mount, side.own));
      if (custom[corner]) side.title.prepend(el('em', { textContent: 'Your fighter' }));
    }
    const fightButton = el('button', { className: 'primary big dw-fight', type: 'button', textContent: 'Fight' });
    fightButton.onclick = () => {
      // A character in armour comes in one of its picked designs.
      const red = normaliseInputs(redress(structuredClone(entry('red').inputs)));
      const blue = normaliseInputs(redress(structuredClone(entry('blue').inputs)));
      const armed = [red, blue].some((inputs) => STYLES[inputs.style]?.weapon);
      red.mounted = mounted.red && canRide(red);
      blue.mounted = mounted.blue && canRide(blue);
      // Horsemen fight on the open field: room to charge and wheel round.
      const place = red.mounted || blue.mounted ? 'field' : armed ? 'colosseum' : 'ring';
      close();
      const fight = () => game.match({ red: [red], blue: [blue], place, game: 'versus', label: 'Deadliest Warrior', next: { text: 'Rematch', retry: true, run: fight } });
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
  return { home, levels, versus, quickEvent, close };
}
