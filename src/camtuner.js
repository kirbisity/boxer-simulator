// The sandbox's camera feel panel: sliders on the follow camera's own dials (followcam.js FOLLOW_CAM), changed live, kept in this
// browser, and copied out as JSON so that a setting the player likes can be written back into FOLLOW_CAM as its default. The camera
// reads FOLLOW_CAM every frame, so a dial moved here is felt at once.

import { FOLLOW_CAM } from './followcam.js';

/** The dials offered: a path into FOLLOW_CAM, its range, and what it does (the panel's words). */
export const CAMERA_DIALS = [
  { path: 'facingSeconds', min: 0.05, max: 2, step: 0.05, label: 'Heading lag (s)', hint: 'How long the view takes to notice which way he faces. More: more inertia.' },
  { path: 'deadBand', min: 0, max: 1, step: 0.05, label: 'Dead band (rad)', hint: 'A turn smaller than this leaves the view where it is.' },
  { path: 'walkTurnRate', min: 0.1, max: 4, step: 0.05, label: 'Walk turn speed', hint: 'How fast the view comes round behind him walking (spring rate, rad/s).' },
  { path: 'turnRate', min: 0.1, max: 6, step: 0.1, label: 'Standing turn speed', hint: 'The same, standing.' },
  { path: 'run.rate', min: 0.1, max: 5, step: 0.05, label: 'Run turn speed', hint: 'The same running, at a standstill\'s rate…' },
  { path: 'run.perSpeed', min: 0, max: 1.5, step: 0.05, label: 'Run turn per m/s', hint: '…plus this for each m/s he runs.' },
  { path: 'turnMost', min: 0.3, max: 5, step: 0.1, label: 'Fastest turn (rad/s)', hint: 'The view never swings round faster than this by itself.' },
  { path: 'ahead.turn', min: 0, max: 1.5, step: 0.05, label: 'Look-ahead: turning', hint: 'Seconds of his turning the view leads into a curve.' },
  { path: 'ahead.intent', min: 0, max: 1, step: 0.05, label: 'Look-ahead: stick', hint: 'Share of the angle the stick asks that the view turns before his body does.' },
  { path: 'ahead.most', min: 0, max: 1, step: 0.05, label: 'Look-ahead: most (rad)', hint: 'The most the view leads where he goes.' },
  { path: 'ahead.seconds', min: 0.1, max: 2, step: 0.05, label: 'Look-ahead: ease (s)', hint: 'How slowly the look-ahead gathers and dies away.' },
  { path: 'targetRate', min: 1, max: 15, step: 0.5, label: 'Follow stiffness', hint: 'How tightly the look point keeps up with him (rad/s). Less: the view trails behind.' },
  { path: 'anchorSeconds', min: 0.02, max: 0.8, step: 0.02, label: 'Position smoothing (s)', hint: 'The low-pass on his hips the view follows.' },
  { path: 'distance', min: 2, max: 9, step: 0.1, label: 'Distance (m)', hint: 'How far behind him.' },
  { path: 'pitch', min: -0.05, max: 1, step: 0.01, label: 'Height angle (rad)', hint: 'How far above him it looks down.' },
];

const STORE_KEY = 'gladiator.cameraDials';

const read = (path, spec = FOLLOW_CAM) => path.split('.').reduce((at, key) => at[key], spec);
function write(path, value, spec = FOLLOW_CAM) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((at, key) => at[key], spec)[last] = value;
}

/** FOLLOW_CAM's dials as the page loaded them (so that a reset, and the copy's "changed", are against the code's defaults). */
export const CAMERA_DEFAULTS = Object.fromEntries(CAMERA_DIALS.map((dial) => [dial.path, read(dial.path)]));

/** Set the dials in `values` ({ path: number }, unknown paths and values out of range ignored) on FOLLOW_CAM. */
export function applyCameraDials(values, spec = FOLLOW_CAM) {
  for (const dial of CAMERA_DIALS) {
    const value = Number(values?.[dial.path]);
    if (Number.isFinite(value)) write(dial.path, Math.min(dial.max, Math.max(dial.min, value)), spec);
  }
}

/** The dials now, as { path: number } (only those changed from the defaults if `changedOnly`). */
export function cameraDialValues(changedOnly = false, spec = FOLLOW_CAM) {
  const values = {};
  for (const dial of CAMERA_DIALS) {
    const value = read(dial.path, spec);
    if (!changedOnly || Math.abs(value - CAMERA_DEFAULTS[dial.path]) > 1e-9) values[dial.path] = value;
  }
  return values;
}

function loadStored() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    return null;
  }
}
function store() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(cameraDialValues(true)));
  } catch {
    // (Storage refused: the dials still hold for this visit.)
  }
}

/** The panel, built into `host` (a DOM element); the dials kept in this browser are applied first. */
export function mountCameraTuner(host) {
  applyCameraDials(loadStored());
  host.replaceChildren();
  const note = document.createElement('p');
  note.className = 'camtune-note';
  note.textContent = 'Changes apply at once and are kept in this browser, in every mode. Copy the values and send them to have them made the default.';
  host.append(note);
  const outputs = [];
  for (const dial of CAMERA_DIALS) {
    const row = document.createElement('label');
    row.className = 'camtune-row';
    row.title = dial.hint;
    const name = document.createElement('span');
    name.textContent = dial.label;
    const slider = Object.assign(document.createElement('input'), { type: 'range', min: dial.min, max: dial.max, step: dial.step });
    const shown = document.createElement('output');
    const sync = () => {
      const value = read(dial.path);
      slider.value = value;
      shown.textContent = Number(value.toFixed(3)).toString();
      shown.classList.toggle('changed', Math.abs(value - CAMERA_DEFAULTS[dial.path]) > 1e-9);
    };
    slider.addEventListener('input', () => {
      write(dial.path, Number(slider.value));
      sync();
      showCode();
      store();
    });
    outputs.push(sync);
    sync();
    row.append(name, slider, shown);
    host.append(row);
  }
  const code = Object.assign(document.createElement('textarea'), { className: 'camtune-code', rows: 3, readOnly: true });
  const showCode = () => {
    code.value = JSON.stringify(cameraDialValues(true));
  };
  const actions = document.createElement('div');
  actions.className = 'camtune-actions';
  const copy = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Copy values' });
  copy.addEventListener('click', () => {
    showCode();
    const done = () => {
      copy.textContent = 'Copied';
      setTimeout(() => (copy.textContent = 'Copy values'), 1500);
    };
    navigator.clipboard?.writeText(code.value).then(done, () => code.select()) ?? code.select();
  });
  const reset = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Reset to defaults' });
  reset.addEventListener('click', () => {
    applyCameraDials(CAMERA_DEFAULTS);
    for (const sync of outputs) sync();
    showCode();
    store();
  });
  actions.append(copy, reset);
  host.append(code, actions);
  showCode();
}
