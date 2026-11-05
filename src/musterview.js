// The setup screen of a battle (muster.js does the reckoning): the floor
// seen from above, to scale, each side's deployment zone shaded, every man a
// dot in his side's colour. For either side the player may keep the level's
// own army, or choose its formation, how many of each kind of man it has, and
// where they stand: tap the ground to put a man of the chosen kind there, drag
// across open ground for a block of them, drag a man to move him, tap him to
// remove him or to play as him. One side may be set up and the other left as
// the level has it. It fits the screen without scrolling: the map takes most of
// it (beside a narrow panel on a wide screen, above one that folds away on a
// phone), zoomed with the wheel, a pinch or its buttons; what is chosen in the
// panel is in three tabs.
//
// What it hands back (`onStart(setup)`) is muster.js musterLevel's setup:
// each side's men, the places of a side set up by hand, and the man played.

import { capsOf, countUnits, drawUp, formationsOf, intoZone, inZone, MUSTER, roomFor, unitOf, unitsOf, zoneOf } from './muster.js';
import { STYLES } from './moves.js';
import { ARMIES } from './scenarios.js';

// The map's look: the floor's colour by its place (the ground it is drawn on), the sides' colours, sizes.
const MUSTER_VIEW = {
  ground: { plain: '#6c6a40', sengoku: '#66753f', town: '#6a645a', jiangnan: '#5a6058', cajamarca: '#8c7556', coastFort: '#a08e64', port: '#3c3e44', mobei: '#857a5e', catalaunian: '#7c8a44', carrhae: '#c2ac84', sarhu: '#8a7e52' },
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
  // Zoom: how far in (times the whole floor), each button's step, and the wheel's (per 100 px of scroll).
  zoomMost: 6,
  zoomStep: 1.5,
  wheelStep: 1.25,
};

const musterEl = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/**
 * Open the setup screen for a battle in `root`: `key` and `level` (scenarios.js battleOf, or a custom battle's:
 * custombattle.js customLevel, with its men's `places` and `formations`), `onStart(setup)` when the player starts it,
 * `onBack()` to go back, `onChange(sides, lead)` whenever an army changes (a custom battle keeps it), and the
 * words of its back and reset buttons (`backLabel`, `resetLabel`).
 */
export function musterScreen(root, { key, level, onStart, onBack, onChange = null, lead = null, formations = {}, backLabel = '← Back', resetLabel = '↺ As the level' }) {
  const cast = level.cast(Math.random);
  const units = { red: unitsOf(level, 'red'), blue: unitsOf(level, 'blue') };
  // Each side: the level's own (`custom` false: its men drawn where the level puts them), or the player's (a custom battle's men where he left them).
  const fresh = (corner) => (level.places
    ? { custom: true, men: cast[corner].slice(), places: level.places[corner].map((place) => place.slice()), formation: formations[corner] ?? 'hand' }
    : { custom: false, men: cast[corner].slice(), places: drawUp(level, corner, cast[corner], 'level'), formation: 'level' });
  const sides = { red: fresh('red'), blue: fresh('blue') };
  const caps = capsOf(level);
  const view = {
    corner: 'red',
    tab: 'units',
    // The kind of man a tap puts down, per side: the side's first.
    brush: { red: units.red[0]?.id, blue: units.blue[0]?.id },
    selected: null,
    // The man played: { corner, man } (his inputs), or null for the usual choice of side.
    lead: lead && sides[lead.corner]?.men[lead.index] ? { corner: lead.corner, man: sides[lead.corner].men[lead.index] } : null,
    note: '',
    // The map's zoom (1: the whole floor) and how far it is moved (px), and whether a drag moves it (✋) rather than drawing a block.
    zoom: 1,
    pan: [0, 0],
    panning: false,
    // On a phone the panel folds away under the map.
    folded: false,
  };

  root.replaceChildren();
  root.className = 'screen muster';
  const head = musterEl('header', { className: 'muster-head' },
    musterEl('button', { className: 'back', type: 'button', textContent: backLabel, onclick: onBack }),
    musterEl('div', { className: 'titles' }, musterEl('h1', { textContent: level.title }), musterEl('p', { className: 'lede', textContent: level.places ? `${level.place} · place your armies, then fight.` : 'Set up the armies — or start as it was.' })));
  const sideTabs = musterEl('div', { className: 'muster-sides', role: 'tablist' });
  const canvas = musterEl('canvas', { className: 'muster-canvas' });
  const pick = musterEl('div', { className: 'muster-pick', hidden: true });
  const hint = musterEl('div', { className: 'muster-hint' });
  const zoomBar = musterEl('div', { className: 'muster-zoom' });
  const map = musterEl('div', { className: 'muster-map' }, canvas, pick, hint, zoomBar);
  const tabs = musterEl('div', { className: 'muster-tabs', role: 'tablist' });
  const panel = musterEl('div', { className: 'muster-panel' });
  const reset = musterEl('button', { type: 'button', className: 'muster-reset', textContent: resetLabel });
  const start = musterEl('button', { type: 'button', className: 'primary muster-start', textContent: '▶ Start battle' });
  const foot = musterEl('div', { className: 'muster-foot' }, reset, start);
  const aside = musterEl('aside', { className: 'muster-aside' }, sideTabs, tabs, panel, foot);
  root.append(head, musterEl('div', { className: 'muster-body' }, map, aside));

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

  /** Room for `count` more on a side under the caps (the level's: muster.js capsOf): how many fit. */
  function room(corner, count) {
    const fits = roomFor(level, { red: sides.red.men.length, blue: sides.blue.men.length }, corner, count);
    if (fits < count) say(sides[corner].men.length + fits >= caps.side ? `At most ${caps.side} a side.` : `At most ${caps.total} in all.`);
    return fits;
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
    const whole = Math.max(1, portrait ? fit(across, along) : fit(along, across));
    const scale = whole * view.zoom;
    // Moved no further than keeps some of the floor in sight.
    const reach = [(portrait ? across : along) * scale / 2, (portrait ? along : across) * scale / 2];
    view.pan = view.pan.map((offset, axis) => Math.max(-reach[axis], Math.min(reach[axis], offset)));
    return { width, height, portrait, scale, whole, cx: width / 2 + view.pan[0], cy: height / 2 + view.pan[1] };
  }

  /** Zoom by `factor` about a point on the map (px): the floor under it stays under it. */
  function zoomAt(factor, [px, py] = [canvas.clientWidth / 2, canvas.clientHeight / 2]) {
    const before = frame();
    const zoom = Math.max(1, Math.min(MUSTER_VIEW.zoomMost, view.zoom * factor));
    const ratio = zoom / view.zoom;
    view.zoom = zoom;
    view.pan = [px - (px - before.cx) * ratio - before.width / 2, py - (py - before.cy) * ratio - before.height / 2];
    if (zoom === 1) view.pan = [0, 0];
    refresh();
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

  // A press on the map: on a man (to move him, or a tap to pick him) or on open ground (a tap to put one down, a drag for a
  // block; with ✋ on, or the right or middle button, a drag moves the map). Two fingers pinch to zoom and move it.
  let press = null;
  const fingers = new Map();
  let pinch = null;
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return { apart: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.setPointerCapture(event.pointerId);
    const point = [event.offsetX, event.offsetY];
    fingers.set(event.pointerId, point);
    if (fingers.size === 2) {
      // A second finger: no man is put down or moved; the two zoom and move the map.
      press = null;
      pinch = spread();
      return;
    }
    if (fingers.size > 2) return;
    const f = frame();
    const pans = view.panning || event.button === 1 || event.button === 2;
    press = { id: event.pointerId, from: point, to: point, last: point, man: pans ? null : manAt(f, point), moved: false, pans };
    press.box = !press.man && !pans;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointermove', (event) => {
    if (fingers.has(event.pointerId)) fingers.set(event.pointerId, [event.offsetX, event.offsetY]);
    if (pinch && fingers.size === 2) {
      const now = spread();
      view.pan = [view.pan[0] + now.mid[0] - pinch.mid[0], view.pan[1] + now.mid[1] - pinch.mid[1]];
      zoomAt(now.apart / Math.max(1, pinch.apart), now.mid);
      pinch = now;
      return;
    }
    if (!press || event.pointerId !== press.id) return;
    press.to = [event.offsetX, event.offsetY];
    if (!press.moved && Math.hypot(press.to[0] - press.from[0], press.to[1] - press.from[1]) < MUSTER_VIEW.tap) return;
    press.moved = true;
    if (press.pans) {
      view.pan = [view.pan[0] + press.to[0] - press.last[0], view.pan[1] + press.to[1] - press.last[1]];
      press.last = press.to;
    } else if (press.man) {
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
    fingers.delete(event.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!press || event.pointerId !== press.id) return;
    const done = press;
    press = null;
    const f = frame();
    if (done.pans) {
      // (Only the map moved.)
    } else if (done.man && !done.moved) {
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
        say(inZone(level, other, at, 0.5) ? `That is ${other}'s ground: switch to ${other} to set it up.` : 'Put men down on the shaded ground.');
      }
    } else if (!done.man && done.moved) fillBox(view.corner, toFloor(f, done.from), toFloor(f, done.to));
    refresh();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', (event) => {
    fingers.delete(event.pointerId);
    if (fingers.size < 2) pinch = null;
    if (press?.id === event.pointerId) press = null;
    refresh();
  });
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    zoomAt(MUSTER_VIEW.wheelStep ** (-event.deltaY / 100), [event.offsetX, event.offsetY]);
  }, { passive: false });

  function drawZoomBar() {
    zoomBar.replaceChildren(
      musterEl('button', { type: 'button', textContent: '+', title: 'Zoom in', ariaLabel: 'Zoom in', onclick: () => zoomAt(MUSTER_VIEW.zoomStep) }),
      musterEl('button', { type: 'button', textContent: '−', title: 'Zoom out', ariaLabel: 'Zoom out', disabled: view.zoom <= 1, onclick: () => zoomAt(1 / MUSTER_VIEW.zoomStep) }),
      musterEl('button', { type: 'button', textContent: '⤢', title: 'The whole field', ariaLabel: 'Show the whole field', disabled: view.zoom <= 1, onclick: () => { view.zoom = 1; view.pan = [0, 0]; refresh(); } }),
      musterEl('button', { type: 'button', className: view.panning ? 'on' : '', textContent: '✋', title: 'Drag to move the map', ariaLabel: 'Drag to move the map', ariaPressed: String(view.panning), onclick: () => { view.panning = !view.panning; refresh(); } }));
  }

  // ---- The panels -----------------------------------------------------------------------

  function say(text) {
    view.note = text;
  }

  function drawSideTabs() {
    sideTabs.replaceChildren(...['red', 'blue'].map((corner) => {
      const army = sides[corner];
      // A side's name: its armies' (the Spaniards & Tlaxcala).
      const name = level.sideNames?.[corner] ?? ((level.armies?.[corner] ?? []).map((armyKey) => ARMIES[armyKey].label).join(' & ') || corner);
      return musterEl('button', {
        type: 'button', role: 'tab', className: `muster-side ${corner}${view.corner === corner ? ' on' : ''}`, ariaSelected: String(view.corner === corner),
        onclick: () => { view.corner = corner; view.selected = null; refresh(); },
      }, musterEl('b', { textContent: name }), musterEl('span', { textContent: `${army.men.length} men${level.places ? '' : ` · ${army.custom ? 'yours' : 'as the level'}`}` }));
    }));
  }

  function drawTabs() {
    const names = { units: 'Units', formation: 'Formation', you: 'Play as' };
    tabs.replaceChildren(...Object.entries(names).map(([tab, label]) => musterEl('button', {
      type: 'button', role: 'tab', className: view.tab === tab && !view.folded ? 'on' : '', textContent: label, ariaSelected: String(view.tab === tab),
      onclick: () => { view.tab = tab; view.folded = false; refresh(); },
    })), musterEl('button', {
      type: 'button', className: 'muster-fold', textContent: view.folded ? '▴' : '▾', title: view.folded ? 'Show the panel' : 'Fold the panel away: more map', ariaLabel: view.folded ? 'Show the panel' : 'Hide the panel', ariaExpanded: String(!view.folded),
      onclick: () => { view.folded = !view.folded; refresh(); },
    }));
  }

  function drawPanel() {
    const corner = view.corner;
    const army = sides[corner];
    if (view.tab === 'units') {
      const counts = countUnits(units[corner], army.men);
      const fewer = (unit) => {
        const index = army.men.findLastIndex((inputs) => unitOf(units[corner], inputs)?.id === unit.id);
        if (index >= 0) remove(corner, index);
        refresh();
      };
      // A row a kind of man: tap it to put that kind down on the map; − and + take one off or add one (+5 five), drawn up in the side's order.
      const rows = units[corner].map((unit) => musterEl('div', { className: `muster-unit-row${unit.id === view.brush[corner] ? ' on' : ''}` },
        musterEl('button', {
          type: 'button', className: `muster-unit${unit.id === view.brush[corner] ? ' on' : ''}`, title: `Tap the map to place ${unit.label}`,
          onclick: () => { view.brush[corner] = unit.id; refresh(); },
        }, musterEl('span', { textContent: `${unit.mounted ? '🐎 ' : ''}${unit.label}` }), musterEl('b', { textContent: String(counts[unit.id] ?? 0) })),
        musterEl('button', { type: 'button', className: 'step', textContent: '−', ariaLabel: `One ${unit.label} fewer`, disabled: !counts[unit.id], onclick: () => fewer(unit) }),
        musterEl('button', { type: 'button', className: 'step', textContent: '+', ariaLabel: `One more ${unit.label}`, onclick: () => { add(corner, unit.id, 1); refresh(); } }),
        musterEl('button', { type: 'button', className: 'step', textContent: '+5', ariaLabel: `Five more ${unit.label}`, onclick: () => { add(corner, unit.id, 5); refresh(); } })));
      const total = Number.isFinite(caps.total) ? ` · ${sides.red.men.length + sides.blue.men.length} / ${caps.total} in all` : '';
      panel.replaceChildren(musterEl('p', { className: 'muster-note' }, musterEl('b', { textContent: `${army.men.length} / ${caps.side}` }), ` men${total} · ★ kind: tap the map to place`), musterEl('div', { className: 'muster-units' }, ...rows));
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
    aside.classList.toggle('folded', view.folded);
    drawZoomBar();
    drawSideTabs();
    drawTabs();
    drawPanel();
    drawPick();
    hint.textContent = view.note || (view.panning ? 'Drag to move the map · ✋ again to place men' : 'Tap the shaded ground to place · drag a man to move him · drag open ground for a block');
    view.note = '';
    reset.disabled = !side().custom;
    start.disabled = !sides.red.men.length || !sides.blue.men.length;
    draw();
    onChange?.(sides, view.lead && { corner: view.lead.corner, index: sides[view.lead.corner].men.indexOf(view.lead.man) });
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
