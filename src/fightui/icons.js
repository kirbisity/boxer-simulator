// The new attack controls' icons, drawn here as inline SVG (no assets): each
// move's own path across the screen as seen from behind the fighter (a hook
// sweeps in from its side, an uppercut climbs, a cut follows its edge's way,
// a straight blow or a thrust goes in at a target), with a small mark of
// what it is thrown with (a fist, a foot, a knee, a blade...).

const FIGHT_UI_LIMB_MARKS = {
  fist: '<rect x="-5" y="-4.5" width="10" height="9" rx="3" fill="currentColor"/><path d="M-2 -4.5v3M1.5 -4.5v3" stroke="rgba(0,0,0,.55)" stroke-width="1.2"/>',
  foot: '<path d="M-3 -6v7.5h8.5a2 2 0 0 0 0-4H1V-6z" fill="currentColor"/>',
  knee: '<path d="M-5 5L0 -4L5 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  elbow: '<path d="M-5 -5L3 0L-5 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>',
  blade: '<path d="M-6 6L5 -5" stroke="currentColor" stroke-width="2.4"/><path d="M-6.5 1.5L-1.5 6.5" stroke="currentColor" stroke-width="2.4"/>',
  club: '<path d="M-6 6L2 -2" stroke="currentColor" stroke-width="2.6"/><circle cx="3" cy="-3" r="4" fill="currentColor"/>',
  gun: '<rect x="-6" y="-4" width="12" height="4.5" rx="1" fill="currentColor"/><rect x="-6" y="0" width="4" height="6" rx="1" fill="currentColor"/>',
  shield: '<path d="M0 -6l6 2v3c0 4-3 6-6 7c-3-1-6-3-6-7v-3z" fill="currentColor"/>',
  body: '<circle cx="0" cy="-3.5" r="2.6" fill="currentColor"/><path d="M-4 6l2-7h4l2 7" fill="currentColor"/>',
};

/** An arrowhead at `tip`, pointing along `way` (unit, SVG y down). */
function fightUiArrowHead(tip, way, size = 7) {
  const back = [tip[0] - way[0] * size, tip[1] - way[1] * size];
  const across = [-way[1] * size * 0.62, way[0] * size * 0.62];
  return `<path d="M${tip[0].toFixed(1)} ${tip[1].toFixed(1)}L${(back[0] + across[0]).toFixed(1)} ${(back[1] + across[1]).toFixed(1)}L${(back[0] - across[0]).toFixed(1)} ${(back[1] - across[1]).toFixed(1)}z" fill="currentColor"/>`;
}

/** The path a move's icon draws: a target for one that goes straight in, an arrow along its way for the rest. */
function fightUiPathMark(entry) {
  if (entry.group === 'push') {
    // Forward (into the screen, up on it): two chevrons.
    return '<path d="M-10 4L0 -6L10 4M-10 13L0 3L10 13" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  if (!entry.travel) {
    if (entry.limb === 'gun') return '<circle r="10" fill="none" stroke="currentColor" stroke-width="3"/><path d="M0 -16v8M0 8v8M-16 0h8M8 0h8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle r="2.6" fill="currentColor"/>';
    const point = entry.limb === 'blade' ? '<path d="M0 -6L4 0L0 6L-4 0z" fill="currentColor"/>' : '<circle r="3.4" fill="currentColor"/>';
    // Its side, as the tap pad places it: a lead (left) or rear (right) straight is a little to its side.
    const shift = entry.side * 4;
    return `<g transform="translate(${shift} -2)"><circle r="11" fill="none" stroke="currentColor" stroke-width="3" opacity=".9"/>${point}<path d="M-15 -15l4 4M15 -15l-4 4M-15 11l4 -4M15 11l-4 -4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></g>`;
  }
  // The arrow, SVG y down; bowed a little (a hook or a kick more than a cut).
  const way = [entry.travel[0], -entry.travel[1]];
  const start = [-way[0] * 15, -way[1] * 15 - 2];
  const end = [way[0] * 13, way[1] * 13 - 2];
  // A climb or a fall nearly straight up or down bows little (else it reads as a bracket).
  const bow = entry.limb === 'blade' ? 4 : Math.abs(entry.travel[1]) > 0.8 ? 4 : 10;
  const normal = [-way[1], way[0]];
  // Bowed away from the middle of the screen below: hooks round, uppercuts scoop.
  const sign = normal[1] > 0 || (normal[1] === 0 && normal[0] > 0) ? -1 : 1;
  const control = [(start[0] + end[0]) / 2 + normal[0] * bow * sign, (start[1] + end[1]) / 2 + normal[1] * bow * sign];
  const endWay = (() => {
    const d = [end[0] - control[0], end[1] - control[1]];
    const length = Math.hypot(d[0], d[1]) || 1;
    return [d[0] / length, d[1] / length];
  })();
  const tip = [end[0] + endWay[0] * 4, end[1] + endWay[1] * 4];
  const width = entry.limb === 'blade' ? 3 : 4;
  return `<path d="M${start[0].toFixed(1)} ${start[1].toFixed(1)}Q${control[0].toFixed(1)} ${control[1].toFixed(1)} ${end[0].toFixed(1)} ${end[1].toFixed(1)}" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round"/>${fightUiArrowHead(tip, endWay, 8)}`;
}

/** A move's icon (SVG markup), its hand's mark in the corner; a low blow stands on a floor line (its shape, not only its colour, says low). */
export function fightUiIcon(entry, { mark = true } = {}) {
  const limb = mark ? `<g transform="translate(15 16)" opacity=".9">${FIGHT_UI_LIMB_MARKS[entry.limb] ?? ''}</g>` : '';
  const floor = entry.group === 'low' ? '<path d="M-19 19h26" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>' : '';
  return `<svg class="fu-icon" viewBox="-24 -24 48 48" aria-hidden="true">${fightUiPathMark(entry)}${floor}${limb}</svg>`;
}

/** The marks of how a blow went, small, for the word beside the man: a burst, a shield, a spark, a dashed ring. */
export const FIGHT_UI_OUTCOME_GLYPHS = {
  hit: '<svg class="fu-icon" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-10l2.6 6.4 6.9-1.2-4.6 5.1 4.6 5.1-6.9-1.2L0 10l-2.6-6.4-6.9 1.2 4.6-5.1-4.6-5.1 6.9 1.2z" fill="currentColor"/></svg>',
  blocked: '<svg class="fu-icon" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M0-10l8 3v5c0 6-4 9-8 11c-4-2-8-5-8-11v-5z" fill="currentColor"/></svg>',
  glance: '<svg class="fu-icon" viewBox="-12 -12 24 24" aria-hidden="true"><path d="M-9 6a10 10 0 0 1 16-11" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M7-5l4-3M8 0l4 0M4-9l1-3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  miss: '<svg class="fu-icon" viewBox="-12 -12 24 24" aria-hidden="true"><circle r="8.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3.4"/></svg>',
};
FIGHT_UI_OUTCOME_GLYPHS.parried = FIGHT_UI_OUTCOME_GLYPHS.blocked;

/** The Jump and Crawl buttons' icons (touch.js): a man springing up off a floor line; a man low on his hands and knees. */
export const FIGHT_UI_CONTROL_ICONS = {
  jump: '<svg class="fu-icon" viewBox="-24 -24 48 48" aria-hidden="true"><circle cx="0" cy="-14" r="4.2" fill="currentColor"/><path d="M0 -8v10M0 -5l-7 -5M0 -5l7 -5M0 2l-6 7M0 2l6 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M-15 19h30" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M-15 10l4 -5l4 5M7 10l4 -5l4 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/></svg>',
  crawl: '<svg class="fu-icon" viewBox="-24 -24 48 48" aria-hidden="true"><circle cx="13" cy="-3" r="4.2" fill="currentColor"/><path d="M8 1L-9 3M8 1l3 12M-9 3l-3 10M-9 3l-9 7" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M-20 17h40" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
};
