// What of a stage is painted this frame: the decisions, as pure functions (no drawing; kit.js applies them to the scene).
//
// A stage is one scene, but not one picture. Each section is its own group (kit.js: detail, silhouette, its things that move), and each frame only
// the sections that can be seen are painted:
//   - `detail`: the section the man is in (its walls, props, decals, markers), and any section reached from one of those through a chain of portals whose
//     opening is inside the camera's view and not shut (a closed gate, a wall in the way);
//   - `far`: a section in view that is not reached that way: its silhouette, a plain block, which is all that is seen of it from far off or behind a wall;
//   - `off`: a section outside the view, or too far to be seen through the haze: nothing, and nothing of it is animated.
// Inside a section, small things (decals, drips, ravens, light shafts) are painted only within a reach, and a chunk of ground whose nearest edge is past the
// fog's far end is not painted at all (the fog has hidden it). Men are held to the same sight: a man in no painted section, or behind a wall that the line from
// the eye to his head and to his feet is stopped by, is not posed or drawn (the men who matter are never hidden: the man played, whom he is locked on, anyone close).

/** The numbers: every one of them in metres or counts. */
export const VISIBILITY = {
  // How many portals deep the sections painted in detail may be from the man's own (a courtyard, the gatehouse beyond it, the passage beyond that).
  hops: 3,
  // Margin round a section's region in the view tests: its walls, towers and the rock under it reach past the ground it covers.
  margin: 8,
  // A portal's opening is tested as the box of its area, this much deeper (it is a hand-over corridor of a few metres, but a door is seen from further).
  openingMargin: 2,
  // Seconds a section stays painted in detail after the view stops reaching it (a turn of the camera back must not find it gone and pop it back).
  hold: 0.5,
  // Past this from the eye (m) the heightened parts of the picture that are far too small to see, and in the fog, are not drawn: a chunk of ground this far off.
  // (The fog's own far end, plus this margin, is the limit used: `fogReach`.)
  fogMargin: 12,
  // A man is never hidden within this of the man played (m), nor of the eye.
  menNear: 4.5,
  eyeNear: 2.5,
  // Seconds a man stays drawn after he last could be seen (stepping out from behind a corner must not find him missing).
  menHold: 0.35,
  // The sight lines to a man: heights above his feet (m) tried in turn; one clear line is enough to show him.
  sightHeights: [0.3, 1.0, 1.7],
};

// ---- boxes -------------------------------------------------------------------------------------------------

/**
 * The boxes ({ x0, x1, y0, y1, z0, z1 }) of a region (an entry, or a list of them: stage.js), each `margin` m larger all round, floor to sky. A turned rectangle is
 * its bounding box; a polygon is its bounding box. `low` and `high` are the heights it stands between where the region does not say.
 */
export function regionBoxes(region, { margin = 0, low = -30, high = 80 } = {}) {
  if (!region) return [];
  const entries = Array.isArray(region) && !Array.isArray(region[0]) ? region : [region];
  const boxes = [];
  for (const entry of entries) {
    if (!entry) continue;
    let x0;
    let x1;
    let z0;
    let z1;
    if (entry.polygon) {
      x0 = Math.min(...entry.polygon.map((p) => p[0]));
      x1 = Math.max(...entry.polygon.map((p) => p[0]));
      z0 = Math.min(...entry.polygon.map((p) => p[1]));
      z1 = Math.max(...entry.polygon.map((p) => p[1]));
    } else {
      const yaw = entry.yaw ?? 0;
      const hu = entry.size[0] / 2;
      const hv = entry.size[1] / 2;
      const ex = Math.abs(Math.cos(yaw)) * hu + Math.abs(Math.sin(yaw)) * hv;
      const ez = Math.abs(Math.sin(yaw)) * hu + Math.abs(Math.cos(yaw)) * hv;
      x0 = entry.at[0] - ex;
      x1 = entry.at[0] + ex;
      z0 = entry.at[1] - ez;
      z1 = entry.at[1] + ez;
    }
    boxes.push({ x0: x0 - margin, x1: x1 + margin, y0: low - 4, y1: high, z0: z0 - margin, z1: z1 + margin });
  }
  return boxes;
}

/** The distance (m) from a point to a box (0 inside it). */
export const boxDistance = (box, x, y, z) => Math.hypot(Math.max(box.x0 - x, 0, x - box.x1), Math.max(box.y0 - y, 0, y - box.y1), Math.max(box.z0 - z, 0, z - box.z1));

/** The nearest of several boxes to a point. */
export const nearestBoxDistance = (boxes, x, y, z) => boxes.reduce((best, box) => Math.min(best, boxDistance(box, x, y, z)), Infinity);

// ---- the sections ------------------------------------------------------------------------------------------

/**
 * A stage's sections as a graph: `{ ids, bounds: { id: [boxes] }, links: [{ a, b, boxes }], near: { id: [link] } }`. A link is a portal (the hand-over area where
 * two sections meet); it is followed either way, since the opening that lets the man out of a room lets the room's light in.
 */
export function sectionGraph(stage, { margin = VISIBILITY.margin, openingMargin = VISIBILITY.openingMargin } = {}) {
  const sea = Number.isFinite(stage.sea) ? stage.sea : -30;
  const bounds = {};
  const links = [];
  const near = {};
  for (const section of stage.sections) {
    bounds[section.id] = regionBoxes(section.bounds, { margin, low: sea });
    near[section.id] = [];
  }
  for (const section of stage.sections) {
    for (const portal of section.portals ?? []) {
      if (!bounds[portal.to]) continue;
      const link = { a: section.id, b: portal.to, boxes: regionBoxes(portal.area, { margin: openingMargin, low: sea }) };
      links.push(link);
      near[link.a].push(link);
      near[link.b].push(link);
    }
  }
  return { ids: stage.sections.map((section) => section.id), bounds, links, near };
}

/**
 * Which sections are painted, and how: a Map from section id to 'detail', 'far' or 'off' (see the header).
 *   `active`: the ids the man's own place makes active (the section he is in, and those whose portal he stands in): always detail if in view.
 *   `inView(boxes)`: whether any of these boxes meets the camera's frustum (true for all, if there is no camera yet).
 *   `open(link)`: whether the way through this link is clear (not a shut gate, not a wall: kit.js tests it by sight from the eye).
 *   `reach(id)`: whether the section is near enough to be seen through the haze (default: all are).
 */
export function chooseSections(graph, { active, inView = () => true, open = () => true, reach = () => true, hops = VISIBILITY.hops }) {
  const result = new Map();
  const seen = new Map();
  const viewed = (id) => {
    if (!seen.has(id)) seen.set(id, inView(graph.bounds[id]));
    return seen.get(id);
  };
  // Detail: the man's own sections, then outward through the openings that are in view and clear.
  let frontier = [];
  for (const id of graph.ids) {
    if (active.has(id)) {
      result.set(id, viewed(id) ? 'detail' : 'off');
      frontier.push(id);
    }
  }
  for (let hop = 0; hop < hops && frontier.length; hop += 1) {
    const next = [];
    for (const id of frontier) {
      for (const link of graph.near[id]) {
        const other = link.a === id ? link.b : link.a;
        if (result.get(other) === 'detail') continue;
        if (!inView(link.boxes) || !open(link)) continue;
        if (!viewed(other) || !reach(other)) continue;
        result.set(other, 'detail');
        next.push(other);
      }
    }
    frontier = next;
  }
  for (const id of graph.ids) {
    if (!result.has(id)) result.set(id, viewed(id) && reach(id) ? 'far' : 'off');
  }
  return result;
}

/**
 * Hold on to the best a section has been: `held` is { id: { state, left } } kept between frames. A section that was 'detail' and is now less stays 'detail' for
 * `hold` s more (a camera turning back finds it still there). Mutates `held`, returns the Map of states to paint.
 */
export function holdSections(held, wanted, dt, hold = VISIBILITY.hold) {
  const out = new Map();
  for (const [id, state] of wanted) {
    const entry = (held[id] ??= { state: 'off', left: 0 });
    if (state === 'detail') {
      entry.left = hold;
      entry.state = 'detail';
    } else if (entry.state === 'detail' && entry.left > 0) {
      entry.left -= dt;
      if (entry.left <= 0) entry.state = state;
    } else {
      entry.state = state;
    }
    out.set(id, entry.state);
  }
  return out;
}

// ---- distance ----------------------------------------------------------------------------------------------

/** How far the fog lets the eye see (m): its far end, and a margin for the height fog (kittex.js KT_FOG) that clears above the low ground. */
export const fogReach = (far, margin = VISIBILITY.fogMargin) => (Number.isFinite(far) ? far + margin : Infinity);

/** Whether a thing (a sphere: its distance to the eye, its radius) is past a reach. `reach` 0 or less means never drawn; Infinity, always. */
export const pastReach = (distance, radius, reach) => reach <= 0 || distance - radius > reach;

/** Whether a sphere is past a reach, with a margin so that one on the line does not flicker: once past it stays past until it is `margin` inside. */
export const pastReachHeld = (distance, radius, reach, wasPast, margin = 1.5) => reach <= 0 || distance - radius > (wasPast ? reach - margin : reach);

// ---- men ---------------------------------------------------------------------------------------------------

/**
 * The ids of the solids that do not stop the eye: a gate of bars, a ladder, a fence (the feet are stopped by them, the eye reaches through).
 */
export function seeThroughIds(stage) {
  const ids = new Set();
  const see = (solid) => {
    if (solid.id) ids.add(solid.id);
  };
  for (const section of stage.sections) {
    for (const solid of section.terrain ?? []) if (['ladder', 'fence', 'hidden'].includes(solid.style)) see(solid);
    // A gate of bars, or a ladder, is seen through; a door (planks or iron plate) is not.
    for (const mechanism of [...(section.gates ?? []), ...(section.ladders ?? [])]) {
      if (!['bars', 'ladder'].includes(mechanism.look?.kind)) continue;
      for (const solids of Object.values(mechanism.states ?? {})) for (const solid of solids) see(solid);
    }
  }
  return ids;
}

/**
 * Whether a man can be seen from the eye `eye` ([x, y, z]), by lines from it to his feet, middle and head (`blocked(a, b, ay, by)`: whether a line over the floor
 * from [x, z] a to b at heights ay to by is stopped, terrain.js rayBlocked with the see-through solids left out). One clear line is enough.
 */
export function manSeen(eye, foot, blocked, heights = VISIBILITY.sightHeights) {
  const a = [eye[0], eye[2]];
  const b = [foot[0], foot[2]];
  for (const h of heights) if (!blocked(a, b, eye[1], foot[1] + h)) return true;
  return false;
}

/**
 * Whether a man is drawn this frame. `safe`: the protected set (the man played, whom he is locked on, his opponent, whom the camera follows) always is.
 * `near`: within `menNear` of the man played or `eyeNear` of the eye. `sectionState`: the state of the section he stands in. `seen`: manSeen's answer.
 * A man in a section that is not painted in detail, who is not near, is hidden: nothing of his section is in sight (his section is far or off).
 */
export function manDrawn({ safe = false, near = false, sectionState = 'detail', seen = true } = {}) {
  if (safe || near) return true;
  if (sectionState !== 'detail') return false;
  return seen;
}

/** The hold on a man: `held` is { id: seconds left }; returns whether he stays drawn, refreshing the time while he is drawn for a reason, counting it down otherwise. */
export function holdMan(held, id, drawn, dt, hold = VISIBILITY.menHold) {
  if (drawn) {
    held[id] = hold;
    return true;
  }
  const left = (held[id] ?? 0) - dt;
  held[id] = Math.max(0, left);
  return left > 0;
}
