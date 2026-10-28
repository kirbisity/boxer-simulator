// How an arrow is seen from far off (pure numbers, so that they run in Node; weaponview.js draws the arrows with them).
//
// An arrow's shaft is 8 mm across and 80 cm long: true to size, from the high camera a big battle is watched from (forty metres and more) it is a fraction of a pixel,
// and the volleys the archers loose, the whole point of watching them, are all but gone. So that they can be followed it is drawn a little larger than it is, no more
// than what makes its shaft a pixel or so wide on the screen (`pixels`), and never past `thicker` times its own width, nor, longer, past `longer` times its length: a
// volley still reads as arrows and not as poles. Near the camera (a man played, a man followed) none of it applies: the arrow is as it is. Its fletching grows with it.
export const ARROW_SIGHT = {
  // The width (CSS px) the shaft is drawn at least, where it can be, and the most it grows for it: times its width, and times its length (it grows as the square root
  // of its width, so that it keeps its proportions of a thin shaft and not a stub).
  pixels: 1.2,
  thicker: 4,
  longer: 1.8,
};

/** The metres one screen pixel spans at `distance` m from a camera of vertical field of view `fovDeg` degrees on a view `heightPx` px high. */
export function metresPerPixel(distance, fovDeg, heightPx) {
  return (2 * Math.max(0, distance) * Math.tan((fovDeg * Math.PI) / 360)) / Math.max(1, heightPx);
}

/**
 * How much larger an arrow is drawn for its distance from the camera: { across (times its width), along (times its length) }, both 1 near the camera and growing
 * with the distance up to ARROW_SIGHT's limits. `width` is the shaft's own (m: ARROW's 0.004 a side, so 0.008).
 */
export function arrowSightScale(distance, { fovDeg = 40, heightPx = 720, width = 0.008 } = {}, spec = ARROW_SIGHT) {
  const wanted = spec.pixels * metresPerPixel(distance, fovDeg, heightPx);
  const across = Math.max(1, Math.min(spec.thicker, wanted / width));
  const along = Math.max(1, Math.min(spec.longer, Math.sqrt(across)));
  return { across, along };
}
