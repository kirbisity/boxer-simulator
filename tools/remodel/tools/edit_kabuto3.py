import sys
def edit(p, pairs):
    s = open(p).read()
    for old, new in pairs:
        if s.count(old) != 1: sys.exit(f'{p}: expected 1 of {old[:80]!r}, found {s.count(old)}')
        s = s.replace(old, new)
    open(p, 'w').write(s)
edit('src/wardrobe.js', [
("""const HAGUMA = { locks: 260, width: 0.11, length: [2.6, 3.9], lift: 0.5, droop: 3.4, segments: 8, tone: [0.74, 0.26] };""",
 """// `spread`: how far a lock keeps heading outward as it falls; `over` (head radii): how far it lies off the helmet it falls over.
const HAGUMA = { locks: 420, width: 0.07, length: [3.3, 4.7], lift: 0.3, droop: 7, spread: 0.12, segments: 10, tone: [0.74, 0.26], over: 0.05 };"""),
("""/** A plume of yak hair (HAGUMA) bound at a bowl's point (`top`, head radii up) and falling round it, clear of the face. */
function hagumaHair(r, colour, top, still = false) {
  return hairLocks(r, colour, HAGUMA, still, (random, side) => {""",
 """/**
 * A plume of yak hair (HAGUMA) bound at a bowl's point (`top`, head radii up) and falling round it, clear of the face, over
 * the helmet's `hull` ([y, radius] up its axis, head radii: the bowl and the neck guard under it).
 */
function hagumaHair(r, colour, top, hull, still = false) {
  return hairLocks(r, colour, { ...HAGUMA, hull }, still, (random, side) => {"""),
("""  const [dark, gain] = spec.tone ?? [0.45, 0.3];""",
 """  const [dark, gain] = spec.tone ?? [0.45, 0.3];
  // The helmet's radius at a height (`spec.hull`), which a lock lies over: none above or below it.
  const hullAt = (y) => {
    const hull = spec.hull;
    if (!hull || y < hull[0][0] || y > hull.at(-1)[0]) return 0;
    const upper = hull.findIndex(([height]) => height >= y) || 1;
    const [[y0, r0], [y1, r1]] = [hull[upper - 1], hull[upper]];
    return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  };"""),
("""      at = at.clone().addScaledVector(heading, length / spec.segments);
      heading = heading.clone()
        .addScaledVector(new THREE.Vector3(0, -1, 0), spec.droop / spec.segments)
        .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z), 0.5 / spec.segments)""",
 """      at = at.clone().addScaledVector(heading, length / spec.segments);
      const need = (hullAt(at.y / r) + (spec.over ?? 0)) * r;
      const out = Math.hypot(at.x, at.z);
      if (need > out && out > 1e-6) { at.x *= need / out; at.z *= need / out; }
      heading = heading.clone()
        .addScaledVector(new THREE.Vector3(0, -1, 0), spec.droop / spec.segments)
        .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z), (spec.spread ?? 0.5) / spec.segments)"""),
("""  if (head.plume) group.add(hagumaHair(r, head.plume, build.skull ? build.skull.outline.at(-1)[1] : form.top, lowDetail));""",
 """  if (head.plume) {
    const outline = build.skull?.outline.map(([radius, y]) => [y, radius]) ?? [[0, form.front], [form.top * 0.55, form.front * 0.92], [form.top * 0.85, form.front * 0.6], [form.top, 0]];
    const foot = shikoro((head.tiers ?? 4) - 1);
    group.add(hagumaHair(r, head.plume, outline.at(-1)[0], [[-0.05 - (head.tiers ?? 4) * 0.24, foot.x / r + 0.2 + flare], [outline[0][0] - 0.02, outline[0][1] + (build.skull?.brim ?? 0.1)], ...outline], lowDetail));
  }"""),
("""        const flame = plateShape(FLAME_HALF.map(([across, up]) => [across * 0.26 * r, up * 0.4 * r]), 0.03 * r, steel);""",
 """        const flame = plateShape(FLAME_HALF.map(([across, up]) => [across * 0.26 * r, up * 0.4 * r]), 0.03 * r, metal(steel, 0xc9ccd2));"""),
("""const KUWAGATA_HALF = [[0, 0], [0.3, 0.02], [0.42, 0.14], [0.56, 0.42], [0.74, 0.74], [0.86, 1.0], [0.94, 1.26], [0.8, 1.12], [0.72, 1.3], [0.62, 1.02], [0.46, 0.72], [0.3, 0.46], [0.16, 0.3], [0, 0.26]];""",
 """const KUWAGATA_HALF = [[0, 0], [0.32, 0.02], [0.46, 0.12], [0.62, 0.4], [0.82, 0.72], [0.96, 1.0], [1.04, 1.28], [0.86, 1.12], [0.74, 1.32], [0.6, 1.02], [0.42, 0.72], [0.26, 0.48], [0.14, 0.32], [0, 0.28]];"""),
])
s = open('src/outfits.js').read()
import re
# The samurai's kabuto: the neck guard spread wide and the fukigaeshi large, as the laced helmets of his armour were.
lines = s.split('\n')
n = 0
for i, line in enumerate(lines):
    if "armor: { kind: 'lamellar', color: '#b3161b'" in line and "head: { kind: 'kabuto'," in line and 'flare' not in line:
        lines[i] = line.replace("head: { kind: 'kabuto',", "head: { kind: 'kabuto', flare: 0.07, tiers: 5, fukigaeshi: 1.5,")
        n += 1
print('samurai heads', n)
open('src/outfits.js', 'w').write('\n'.join(lines))
