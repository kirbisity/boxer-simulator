// The sandbox's camera feel panel: sliders on the follow camera's own dials (followcam.js FOLLOW_CAM), changed live, kept in this
// browser, and copied out as JSON so that a setting the player likes can be written back into FOLLOW_CAM as its default. The camera
// reads FOLLOW_CAM every frame, so a dial moved here is felt at once.

import { createDialTuner } from './dialtuner.js';
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

const cameraTuner = createDialTuner(FOLLOW_CAM, CAMERA_DIALS, 'gladiator.cameraDials');

/** FOLLOW_CAM's dials as the page loaded them (so that a reset, and the copy's "changed", are against the code's defaults). */
export const CAMERA_DEFAULTS = cameraTuner.defaults;

/** Set the dials in `values` ({ path: number }, unknown paths and values out of range ignored) on FOLLOW_CAM. */
export const applyCameraDials = (values, spec = FOLLOW_CAM) => cameraTuner.apply(values, spec);

/** The dials now, as { path: number } (only those changed from the defaults if `changedOnly`). */
export const cameraDialValues = (changedOnly = false, spec = FOLLOW_CAM) => cameraTuner.values(changedOnly, spec);

/** The panel, built into `host` (a DOM element); the dials kept in this browser are applied first. */
export const mountCameraTuner = (host) => cameraTuner.mount(host, 'Changes apply at once and are kept in this browser, in every mode. Copy the values and send them to have them made the default.');
