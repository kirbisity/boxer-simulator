// The setup screen of a battle (muster.js does the reckoning): the floor
// seen from above, to scale, each side's deployment zone shaded, every man a
// dot in his side's colour. For either side the player may keep the level's
// own army, or choose its formation, how many of each kind of man it has, and
// where they stand: tap the ground to put a man of the chosen kind there, drag
// across open ground for a block of them, drag a man to move him, tap him to
// remove him or to play as him. One side may be set up and the other left as
// the level has it. It fits a phone's screen without scrolling: the map takes
// what room there is, and what is chosen beneath it is in three tabs.
//
// What it hands back (`onStart(setup)`) is muster.js musterLevel's setup:
// each side's men, the places of a side set up by hand, and the man played.

import { countUnits, drawUp, formationsOf, intoZone, inZone, MUSTER, unitOf, unitsOf, zoneOf } from './muster.js';
import { STYLES } from './moves.js';
import { ARMIES } from './scenarios.js';

// The map's look: the floor's colour by its place (the ground it is drawn on), the sides' colours, sizes.
const MUSTER_VIEW = {
  ground: { plain: '#6c6a40', sengoku: '#66753f', town: '#6a645a', jiangnan: '#5a6058', cajamarca: '#8c7556', coastFort: '#a08e64', port: '#3c3e44', mobei: '#857a5e', catalaunian: '#7c8a44', carrhae: '#c2ac84' },
  side: { red: '#e0353b', blue: '#3a74ec' },
  gold: '#ffcf4a',
  // A man's dot (m of radius, and at least this many px); a rider's the size of his horse.
  man: 0.38,
  rider: 0.75,
  minDot: 4,
  // A tap finds the man within this (m, or px if more).
  reach: 0.7,
  reachPx: 16,
  // A press that moves less than this (px) is a tap; more, a drag.
  tap: 7,
  // The map's margin (px) round the floor, and its grid (m).
  margin: 10,
  grid: 5,
  // A block dragged out on open ground: men this far apart (m) when the formation has no spacing of its own.
  spacing: 1.2,
  rowSpacing: 1.5,
};

const musterEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/**
 * Open the setup screen for a battle in `root`: `key` and `level` (scenarios.js battleOf),
 * `onStart(setup)` when the player starts it, `onBack()` to go back to the levels.
 */
export function musterScreen(root, { key, level, onStart, onBack }) {
  const cast = level.cast(Math.random);
  const units = { red: unitsOf(level, 'red'), blue: unitsOf(level, 'blue') };
  // Each side: the level's own (`custom` false: its men drawn where the level puts them), or the player's.
  const fresh = (corner) => ({ custom: false, men: cast[corner].slice(), places: drawUp(level, corner, cast[corner], 'level'), formation: 'level' });
  const sides = { red: fresh('red'), blue: fresh('blue') };
  const view = {
    corner: 'red',
    tab: 'units',
    // The kind of man a tap puts down, per side: the side's first.
    brush: { red: units.red[0]?.id, blue: units.blue[0]?.id },
    selected: null,
    // The man played: { corner, man } (his inputs), or null for the usual choice of side.
    lead: null,
    note: '',
  };

  root.replaceChildren();
  root.className = 'screen muster';
  const head = musterEl('header', { className: 'muster-head' },
    musterEl('button', { className: 'back', type: 'button', textContent: '← Back', onclick: onBack }),
    musterEl('div', { className: 'titles' }, musterEl('h1', { textContent: level.title }), musterEl('p', { className: 'lede', textContent: 'Set up the armies — or start as it was.' })));
  const sideTabs = musterEl('div', { className: 'muster-sides', role: 'tablist' });
  const canvas = musterEl('canvas', { className: 'muster-canvas' });
  const pick = musterEl('div', { className: 'muster-pick', hidden: true });
  const hint = musterEl('div', { className: 'muster-hint' });
  const map = musterEl('div', { className: 'muster-map' }, canvas, pick, hint);
  const tabs = musterEl('div', { className: 'muster-tabs', role: 'tablist' });
  const panel = musterEl('div', { className: 'muster-panel' });
  const reset = musterEl('button', { type: 'button', className: 'muster-reset', textContent: '↺ As the level' });
  const start = musterEl('button', { type: 'button', className: 'primary muster-start', textContent: '▶ Start battle' });
  const foot = musterEl('div', { className: 'muster-foot' }, reset, start);
  root.append(head, sideTabs, map, tabs, panel, foot);

  const side = () => sides[view.corner];
  const unitById = (corner, id) => units[corner].find((unit) => unit.id === id);
  const kindOf = (corner, inputs) => unitOf(units[corner], inputs)?.label ?? STYLES[inputs.style]?.label ?? inputs.style;

  /** A side about to be changed by hand: from here on it is the player's (the level's men, where they stood, to start from). */
  function own(corner) {
    sides[corner].custom = true;
    return sides[corner];
  }

  /** A free place for one more man of a side drawn up by hand: the nearest open spot to the middle of its front, then back. */
  function freePlace(corner) {
    const sign = corner === 'red' ? -1 : 1;
    const front = Math.max(MUSTER.neutral, level.formation?.[corner]?.front ?? 0);
    const taken = sides[corner].places;
    const files = Math.ceil(2 * level.arena.halfZ / MUSTER_VIEW.spacing);
    const ranks = Math.ceil(2 * level.arena.halfX / MUSTER_VIEW.rowSpacing);
    for (let rank = 0; rank < ranks; rank += 1) {
      for (let file = 0; file < files; file += 1) {
        const across = (file % 2 ? 1 : -1) * Math.ceil(file / 2) * MUSTER_VIEW.spacing;
        const spot = intoZone(level, corner, [sign * (front + rank * MUSTER_VIEW.rowSpacing), across]);
        if (taken.every(([x, z]) => Math.hypot(x - spot[0], z - spot[1]) > MUSTER_VIEW.spacing * 0.75)) return spot;
      }
    }
    return intoZone(level, corner, [sign * front, 0]);
  }

  /** Room for `count` more on a side under the cap: how many fit. */
  function room(corner, count) {
    const left = MUSTER.cap - sides[corner].men.length;
    if (left < count) say(`At most ${MUSTER.cap} a side.`);
    return Math.max(0, Math.min(count, left));
  }

  /** Add `count` men of a unit: at `at` ([x, z]) or, drawn up, by the side's formation. */
  function add(corner, id, count = 1, at = null) {
    const unit = unitById(corner, id);
    const fits = unit ? room(corner, count) : 0;
    if (!fits) return;
    const army = own(corner);
    for (let index = 0; index < fits; index += 1) {
      army.men.push(unit.make(Math.random));
      army.places.push(at && index === 0 ? intoZone(level, corner, at) : army.formation === 'hand' ? freePlace(corner) : [0, 0]);
    }
    if (at) army.formation = 'hand';
    else if (army.formation !== 'hand') army.places = drawUp(level, corner, army.men, army.formation);
  }

  /** Take a man out of his side. */
  function remove(corner, index) {
    const army = own(corner);
    const [gone] = army.men.splice(index, 1);
    army.places.splice(index, 1);
    if (view.lead?.man === gone) view.lead = null;
    view.selected = null;
  }

  /** Fill a box dragged on the ground ([x, z] corners) with men of the brush's unit, in rows facing the enemy. */
  function fillBox(corner, [x0, z0], [x1, z1]) {
    const unit = unitById(corner, view.brush[corner]);
    if (!unit) return;
    const zone = zoneOf(level, corner);
    const xs = [Math.max(zone.x[0], Math.min(x0, x1)), Math.min(zone.x[1], Math.max(x0, x1))];
    const zs = [Math.max(zone.z[0], Math.min(z0, z1)), Math.min(zone.z[1], Math.max(z0, z1))];
    if (xs[0] > xs[1] || zs[0] > zs[1]) return;
    const spec = MUSTER.formations[side().formation] ?? MUSTER_VIEW;
    const step = unit.mounted ? 2 * MUSTER.formations.skirmish.spacing : spec.spacing;
    const rowStep = unit.mounted ? 2 * MUSTER.formations.skirmish.rowSpacing : spec.rowSpacing;
    const files = Math.max(1, Math.floor((zs[1] - zs[0]) / step) + 1);
    const ranks = Math.max(1, Math.floor((xs[1] - xs[0]) / rowStep) + 1);
    const spots = [];
    // The front rank first (nearest the enemy), then back.
    const sign = corner === 'red' ? -1 : 1;
    const nearest = sign < 0 ? xs[1] : xs[0];
    for (let rank = 0; rank < ranks; rank += 1) for (let file = 0; file < files; file += 1) spots.push([nearest - sign * rank * rowStep, (zs[0] + zs[1]) / 2 + (file - (files - 1) / 2) * step]);
    const fits = room(corner, spots.length);
    if (!fits) return;
    const army = own(corner);
    for (const spot of spots.slice(0, fits)) {
      army.men.push(unit.make(Math.random));
      army.places.push(intoZone(level, corner, spot));
    }
    army.formation = 'hand';
  }

  // ---- The map ---------------------------------------------------------------------------

  /** The map's frame: the floor's scale (px/m), where its middle is, and which way it lies (portrait: red at the foot). */
  function frame() {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const along = 2 * level.arena.halfX;
    const across = 2 * level.arena.halfZ;
    // Whichever way round shows the floor the bigger (a phone held upright: the lines across it, red at the foot).
    const fit = (w, h) => Math.min((width - 2 * MUSTER_VIEW.margin) / w, (height - 2 * MUSTER_VIEW.margin) / h);
    const portrait = fit(across, along) > fit(along, across);
    const scale = Math.max(1, portrait ? fit(across, along) : fit(along, across));
    return { width, height, portrait, scale, cx: width / 2, cy: height / 2 };
  }
  /** A place on the floor ([x, z], m) on the map (px), and back. */
  const toScreen = (f, [x, z]) => (f.portrait ? [f.cx + z * f.scale, f.cy - x * f.scale] : [f.cx + x * f.scale, f.cy + z * f.scale]);
  const toFloor = (f, [px, py]) => (f.portrait ? [(f.cy - py) / f.scale, (px - f.cx) / f.scale] : [(px - f.cx) / f.scale, (py - f.cy) / f.scale]);

  function draw() {
    const f = frame();
    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(f.width * ratio) || canvas.height !== Math.round(f.height * ratio)) {
      canvas.width = Math.round(f.width * ratio);
      canvas.height = Math.round(f.height * ratio);
    }
    const g = canvas.getContext('2d');
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, f.width, f.height);
    const rect = (x0, z0, x1, z1) => {
      const a = toScreen(f, [x0, z0]);
      const b = toScreen(f, [x1, z1]);
      return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
    };
    const { halfX, halfZ } = level.arena;
    // The floor, its grid and the middle line.
    g.fillStyle = MUSTER_VIEW.ground[level.scene] ?? '#555a4a';
    g.fillRect(...rect(-halfX, -halfZ, halfX, halfZ));
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -Math.floor(halfX / MUSTER_VIEW.grid) * MUSTER_VIEW.grid; x <= halfX; x += MUSTER_VIEW.grid) {
      const [a, b] = [toScreen(f, [x, -halfZ]), toScreen(f, [x, halfZ])];
      g.moveTo(...a);
      g.lineTo(...b);
    }
    for (let z = -Math.floor(halfZ / MUSTER_VIEW.grid) * MUSTER_VIEW.grid; z <= halfZ; z += MUSTER_VIEW.grid) {
      const [a, b] = [toScreen(f, [-halfX, z]), toScreen(f, [halfX, z])];
      g.moveTo(...a);
      g.lineTo(...b);
    }
    g.stroke();
    // No man's land between the zones, darker.
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(...rect(-MUSTER.neutral, -halfZ, MUSTER.neutral, halfZ));
    // Each side's zone: tinted, the side being set up the more, edged in its colour.
    for (const corner of ['red', 'blue']) {
      const zone = zoneOf(level, corner);
      const active = corner === view.corner;
      g.fillStyle = `${MUSTER_VIEW.side[corner]}${active ? '30' : '14'}`;
      g.fillRect(...rect(zone.x[0], zone.z[0], zone.x[1], zone.z[1]));
      if (active) {
        g.setLineDash([6, 4]);
        g.strokeStyle = MUSTER_VIEW.side[corner];
        g.lineWidth = 1.5;
        g.strokeRect(...rect(zone.x[0], zone.z[0], zone.x[1], zone.z[1]));
        g.setLineDash([]);
      }
    }
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1;
    g.strokeRect(...rect(-halfX, -halfZ, halfX, halfZ));
    // The men: the side not being set up fainter; riders bigger; shooters with a pale dot; the one played crowned in gold.
    for (const corner of view.corner === 'red' ? ['blue', 'red'] : ['red', 'blue']) {
      const army = sides[corner];
      g.globalAlpha = corner === view.corner ? 1 : 0.55;
      army.men.forEach((inputs, index) => {
        const [px, py] = toScreen(f, army.places[index]);
        const rides = Boolean(inputs.mounted);
        const radius = Math.max(MUSTER_VIEW.minDot * (rides ? 1.6 : 1), (rides ? MUSTER_VIEW.rider : MUSTER_VIEW.man) * f.scale);
        g.beginPath();
        g.arc(px, py, radius, 0, Math.PI * 2);
        g.fillStyle = MUSTER_VIEW.side[corner];
        g.fill();
        g.lineWidth = rides ? 2 : 1;
        g.strokeStyle = rides ? '#f4e2b0' : 'rgba(0,0,0,0.6)';
        g.stroke();
        if (STYLES[inputs.style]?.ranged) {
          g.beginPath();
          g.arc(px, py, radius * 0.4, 0, Math.PI * 2);
          g.fillStyle = 'rgba(255,255,255,0.85)';
          g.fill();
        }
        const chosen = view.selected?.corner === corner && view.selected.index === index;
        const played = view.lead?.corner === corner && view.lead.man === inputs;
        if (chosen || played) {
          g.beginPath();
          g.arc(px, py, radius + 3, 0, Math.PI * 2);
          g.lineWidth = 2;
          g.strokeStyle = played ? MUSTER_VIEW.gold : '#ffffff';
          g.stroke();
        }
        if (played) {
          g.fillStyle = MUSTER_VIEW.gold;
          g.font = `700 ${Math.max(11, radius * 2)}px sans-serif`;
          g.textAlign = 'center';
          g.fillText('★', px, py - radius - 4);
        }
      });
    }
    g.globalAlpha = 1;
    // The block being dragged out.
    if (press?.box && press.moved) {
      const a = press.from;
      const b = press.to;
      g.setLineDash([5, 3]);
      g.strokeStyle = MUSTER_VIEW.gold;
      g.lineWidth = 1.5;
      g.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      g.setLineDash([]);
    }
  }

  /** The man under a point on the map (px), the side being set up first: { corner, index } or null. */
  function manAt(f, point) {
    const reach = Math.max(MUSTER_VIEW.reach, MUSTER_VIEW.reachPx / f.scale);
    const floor = toFloor(f, point);
    let best = null;
    for (const corner of [view.corner, view.corner === 'red' ? 'blue' : 'red']) {
      sides[corner].places.forEach(([x, z], index) => {
        const distance = Math.hypot(x - floor[0], z - floor[1]);
        if (distance < reach && (!best || distance < best.distance - 0.05)) best = { corner, index, distance };
      });
      if (best) break;
    }
    return best && { corner: best.corner, index: best.index };
  }

  // A press on the map: on a man (to move him, or a tap to pick him) or on open ground (a tap to put one down, a drag for a block).
  let press = null;
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const f = frame();
    const point = [event.offsetX, event.offsetY];
    press = { id: event.pointerId, from: point, to: point, man: manAt(f, point), moved: false };
    press.box = !press.man;
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!press || event.pointerId !== press.id) return;
    press.to = [event.offsetX, event.offsetY];
    if (!press.moved && Math.hypot(press.to[0] - press.from[0], press.to[1] - press.from[1]) < MUSTER_VIEW.tap) return;
    press.moved = true;
    if (press.man) {
      // Dragging a man: he goes where the finger is, inside his own side's zone.
      const army = own(press.man.corner);
      army.places[press.man.index] = intoZone(level, press.man.corner, toFloor(frame(), press.to));
      army.formation = 'hand';
      view.selected = press.man;
      if (view.corner !== press.man.corner) view.corner = press.man.corner;
    }
    refresh();
  });
  const release = (event) => {
    if (!press || event.pointerId !== press.id) return;
    const done = press;
    press = null;
    const f = frame();
    if (done.man && !done.moved) {
      // A tap on a man: pick him (again: let him go).
      const same = view.selected?.corner === done.man.corner && view.selected.index === done.man.index;
      view.selected = same ? null : done.man;
      view.corner = done.man.corner;
    } else if (!done.man && !done.moved) {
      // A tap on open ground: a man of the brush's kind there, if it is the side's ground.
      const at = toFloor(f, done.from);
      view.selected = null;
      if (inZone(level, view.corner, at, 0.5)) add(view.corner, view.brush[view.corner], 1, at);
      else {
        const other = view.corner === 'red' ? 'blue' : 'red';
        say(inZone(level, other, at, 0.5) ? `That is ${other}'s ground: switch to ${other} above to set it up.` : 'Put men down on the shaded ground.');
      }
    } else if (!done.man && done.moved) fillBox(view.corner, toFloor(f, done.from), toFloor(f, done.to));
    refresh();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (event) => {
    if (press?.id === event.pointerId) press = null;
    refresh();
  });

  // ---- The panels -----------------------------------------------------------------------

  function say(text) {
    view.note = text;
  }

  function drawSideTabs() {
    sideTabs.replaceChildren(...['red', 'blue'].map((corner) => {
      const army = sides[corner];
      // A side's name: its armies' (the Spaniards & Tlaxcala).
      const name = (level.armies?.[corner] ?? []).map((armyKey) => ARMIES[armyKey].label).join(' & ') || corner;
      return musterEl('button', {
        type: 'button', role: 'tab', className: `muster-side ${corner}${view.corner === corner ? ' on' : ''}`, ariaSelected: String(view.corner === corner),
        onclick: () => { view.corner = corner; view.selected = null; refresh(); },
      }, musterEl('b', { textContent: name }), musterEl('span', { textContent: `${army.men.length} men · ${army.custom ? 'yours' : 'as the level'}` }));
    }));
  }

  function drawTabs() {
    const names = { units: 'Units', formation: 'Formation', you: 'Play as' };
    tabs.replaceChildren(...Object.entries(names).map(([tab, label]) => musterEl('button', {
      type: 'button', role: 'tab', className: view.tab === tab ? 'on' : '', textContent: label, ariaSelected: String(view.tab === tab),
      onclick: () => { view.tab = tab; refresh(); },
    })));
  }

  function drawPanel() {
    const corner = view.corner;
    const army = sides[corner];
    if (view.tab === 'units') {
      const counts = countUnits(units[corner], army.men);
      const brush = unitById(corner, view.brush[corner]);
      const chips = musterEl('div', { className: 'muster-units' }, ...units[corner].map((unit) => musterEl('button', {
        type: 'button', className: `muster-unit${unit.id === view.brush[corner] ? ' on' : ''}`,
        onclick: () => { view.brush[corner] = unit.id; refresh(); },
      }, musterEl('span', { textContent: `${unit.mounted ? '🐎 ' : ''}${unit.label}` }), musterEl('b', { textContent: String(counts[unit.id] ?? 0) }))));
      const stepper = brush && musterEl('div', { className: 'muster-stepper' },
        musterEl('button', { type: 'button', textContent: '−', ariaLabel: `One ${brush.label} fewer`, onclick: () => {
          const index = army.men.findLastIndex((inputs) => unitOf(units[corner], inputs)?.id === brush.id);
          if (index >= 0) remove(corner, index);
          refresh();
        } }),
        musterEl('span', { textContent: `${brush.label}: ${counts[brush.id] ?? 0}` }),
        musterEl('button', { type: 'button', textContent: '+', ariaLabel: `One more ${brush.label}`, onclick: () => { add(corner, brush.id, 1); refresh(); } }),
        musterEl('button', { type: 'button', textContent: '+5', onclick: () => { add(corner, brush.id, 5); refresh(); } }),
        musterEl('em', { textContent: `${army.men.length} / ${MUSTER.cap}` }));
      // The stepper first: always in sight, however many kinds of men the side has below it.
      panel.replaceChildren(stepper, chips);
    } else if (view.tab === 'formation') {
      const shapes = formationsOf();
      panel.replaceChildren(
        musterEl('div', { className: 'muster-formations' }, ...shapes.map((shape) => musterEl('button', {
          type: 'button', className: `muster-formation${army.formation === shape.key ? ' on' : ''}`,
          onclick: () => {
            const mine = own(corner);
            mine.formation = shape.key;
            mine.places = drawUp(level, corner, mine.men, shape.key);
            refresh();
          },
        }, musterEl('i', { textContent: shape.glyph, ariaHidden: 'true' }), musterEl('span', { textContent: shape.label })))),
        musterEl('p', { className: 'muster-note', textContent: army.formation === 'hand' ? 'Placed by hand. Pick a formation to draw them all up again.' : 'Bows and guns go in front of a line or a skirmish screen, behind a block or a wedge; riders wait on the flanks.' }));
    } else {
      const lead = view.lead;
      panel.replaceChildren(
        musterEl('p', { className: 'muster-note', textContent: lead ? `You play ${lead.man.name}, ${kindOf(lead.corner, lead.man).toLowerCase()} (${lead.corner}).` : 'Tap any man on the map, then “Play as him”. Or choose nobody, and pick a side when the battle opens.' }),
        lead ? musterEl('button', { type: 'button', textContent: 'Choose nobody', onclick: () => { view.lead = null; refresh(); } }) : null);
    }
  }

  function drawPick() {
    const chosen = view.selected;
    pick.hidden = !chosen;
    if (!chosen) return;
    const inputs = sides[chosen.corner].men[chosen.index];
    const played = view.lead?.man === inputs;
    pick.replaceChildren(
      musterEl('div', { className: 'muster-who' }, musterEl('b', { textContent: inputs.name }), musterEl('span', { textContent: kindOf(chosen.corner, inputs) })),
      musterEl('button', { type: 'button', className: played ? 'on' : 'primary', textContent: played ? '★ Playing' : '▶ Play as him', onclick: () => { view.lead = played ? null : { corner: chosen.corner, man: inputs }; refresh(); } }),
      musterEl('button', { type: 'button', textContent: '✕ Remove', onclick: () => { remove(chosen.corner, chosen.index); refresh(); } }));
  }

  function refresh() {
    drawSideTabs();
    drawTabs();
    drawPanel();
    drawPick();
    hint.textContent = view.note || 'Tap the shaded ground to place · drag a man to move him · drag open ground for a block';
    view.note = '';
    reset.disabled = !side().custom;
    draw();
  }

  reset.addEventListener('click', () => {
    const corner = view.corner;
    if (view.lead?.corner === corner && !cast[corner].includes(view.lead.man)) view.lead = null;
    sides[corner] = fresh(corner);
    view.selected = null;
    refresh();
  });
  start.addEventListener('click', () => {
    const lead = view.lead && { corner: view.lead.corner, index: sides[view.lead.corner].men.indexOf(view.lead.man) };
    onStart({
      cast: { red: sides.red.men, blue: sides.blue.men },
      places: { red: sides.red.custom ? sides.red.places : null, blue: sides.blue.custom ? sides.blue.places : null },
      lead: lead && lead.index >= 0 ? lead : null,
    });
  });

  // Drawn again whenever the map's room changes (shown, turned, the window resized).
  new ResizeObserver(() => draw()).observe(map);
  refresh();
}
