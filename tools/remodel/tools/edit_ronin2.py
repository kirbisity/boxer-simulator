import sys
def edit(p, pairs):
    s = open(p).read()
    for old, new in pairs:
        if s.count(old) != 1: sys.exit(f'{p}: expected 1 of {old[:80]!r}, found {s.count(old)}')
        s = s.replace(old, new)
    open(p, 'w').write(s)
edit('src/loftbody.js', [
("""/**
 * Rings cut wider steadily from the first (times `from`) to the last (times `to`), none narrower than `least` (m) times its
 * share: a sleeve or a trouser leg that widens to its mouth whatever the limb inside it does.
 */
function widened(rings, from, to, least = 0) {
  const last = rings.length - 1 || 1;
  return Object.assign(rings.map((ring, index) => {
    const share = from + ((to - from) * index) / last;
    return { ...ring, depth: Math.max(ring.depth, least) * share, width: Math.max(ring.width, least) * share };
  }), rings.part ? { part: rings.part } : null);
}
""",
 """/**
 * Rings each given how far the cloth lofted on it stands off (`flare`, times the ring; read by FLARED): steadily further from
 * the first (`from`) to the last (`to`), as if none were narrower than `least` (m). A sleeve or a trouser leg that widens to
 * its mouth whatever the limb inside it does. (The rings keep the limb's own size: the fit to the body lays a piece on by
 * how far it stands off its ring.)
 */
function widened(rings, from, to, least = 0) {
  const last = rings.length - 1 || 1;
  return Object.assign(rings.map((ring, index) => ({ ...ring, flare: (from + ((to - from) * index) / last) * Math.max(1, least / Math.max(ring.depth, ring.width)) })), rings.part ? { part: rings.part } : null);
}
const FLARED = { shape: (ring) => ring.flare, capStart: false, capEnd: false };
"""),
("""        loft(mesh, widened(upper, 1.1, mid), sides, { color: pattern, inflate: 1, capStart: false, capEnd: false });
        loft(mesh, widened(forearmRings(0.05, shape.sleeve - 1, count(4)), mid, shape.sleeveLoose * shape.sleeveFlare, elbow), sides, { color: pattern, inflate: 1, capStart: false, capEnd: false });""",
 """        loft(mesh, widened(upper, 1.1, mid), sides, { color: pattern, ...FLARED });
        loft(mesh, widened(forearmRings(0.05, shape.sleeve - 1, count(4)), mid, shape.sleeveLoose * shape.sleeveFlare, elbow), sides, { color: pattern, ...FLARED });"""),
("""LOFT.hakama.knee, thighR * 0.8), sides, { color: legPattern, inflate: 1, capStart: false, capEnd: false });""",
 """LOFT.hakama.knee, thighR * 0.8), sides, { color: legPattern, ...FLARED });"""),
("""      const trouserRings = longHakama ? widened(straight, 1 / 1.22, LOFT.hakama.hem / 1.22, thighR * 0.8 * LOFT.hakama.knee / 1.12) : straight;
      loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings, ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate:""",
 """      const trouserRings = longHakama ? widened(straight, 1, LOFT.hakama.hem, thighR * 0.8 * LOFT.hakama.knee) : straight;
      if (longHakama) loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings, sides, { color: legPattern, ...FLARED });
      else loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings, ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate:"""),
])
