import sys
def edit(p, pairs):
    s = open(p).read()
    for old, new in pairs:
        if s.count(old) != 1: sys.exit(f'{p}: expected 1 of {old[:80]!r}, found {s.count(old)}')
        s = s.replace(old, new)
    open(p, 'w').write(s)
edit('src/loftbody.js', [
("""  kosode: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.2, sleeveLoose: 1.42 },""",
 """  // `sleeveFlare`: a sleeve cut straight and wide (flaredSleeve): close at the shoulder, this many times the elbow's breadth at its mouth.
  kosode: { hem: -0.1, neck: 0.97, loose: 1.12, sleeve: 1.5, sleeveLoose: 1.3, sleeveFlare: 1.55 },"""),
("""function along(a, b, forward, count, from, to, depthAt, widthAt, offsetAt = () => 0) {""",
 """/**
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

function along(a, b, forward, count, from, to, depthAt, widthAt, offsetAt = () => 0) {"""),
("""      loft(mesh, upperArmRings(-0.3, shape.sleeve > 1 ? 1.05 : shape.sleeve, count(6)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured && !base ? { bend: limbs.upper.mass } : {}) });
      if (shape.sleeve > 1) {""",
 """      // A wide sleeve (`sleeveFlare`): close at the shoulder, widening down the arm to an open mouth that stands off the
      // forearm and hangs.
      if (shape.sleeveFlare) {
        const upper = upperArmRings(-0.3, 1.05, count(6));
        const elbow = Math.max(upper.at(-1).depth, upper.at(-1).width);
        const mid = shape.sleeveLoose * (1 + (shape.sleeveFlare - 1) * (1.35 / (shape.sleeve + 0.3)));
        loft(mesh, widened(upper, 1.1, mid), sides, { color: pattern, inflate: 1, capStart: false, capEnd: false });
        loft(mesh, widened(forearmRings(0.05, shape.sleeve - 1, count(4)), mid, shape.sleeveLoose * shape.sleeveFlare, elbow), sides, { color: pattern, inflate: 1, capStart: false, capEnd: false });
        return;
      }
      loft(mesh, upperArmRings(-0.3, shape.sleeve > 1 ? 1.05 : shape.sleeve, count(6)), sides, { color: pattern, inflate: shape.sleeveLoose, capStart: false, capEnd: false, ...(limbs && !armoured && !base ? { bend: limbs.upper.mass } : {}) });
      if (shape.sleeve > 1) {"""),
("""    const legReach = { hakama: [1.04, 0.3],""",
 """    // (Hakama worn long, `long`: untied, falling full to the ankle.)
    const longHakama = bottom?.kind === 'hakama' && bottom.long;
    const legReach = longHakama ? [1.04, 0.9] : { hakama: [1.04, 0.3],"""),
("""    if (legReach[0] > 0 && !skirted) loft(mesh, thighRings(-0.05, legReach[0], ragLeg ? ragLeg.thigh : count(Math.max(3, Math.round(9 * legReach[0])))), ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: legLoose, capStart: false, capEnd: false, ...bendThigh });
    // Hakama (the hitatare's trousers): full, bloused out at the knee where they are tied over the shin guards.
    if (bottom?.kind === 'hakama' && !skirted) loft(""",
 """    if (longHakama && !skirted) loft(mesh, widened(thighRings(-0.05, 1.04, count(9)), legLoose, LOFT.hakama.knee, thighR * 0.8), sides, { color: legPattern, inflate: 1, capStart: false, capEnd: false });
    else if (legReach[0] > 0 && !skirted) loft(mesh, thighRings(-0.05, legReach[0], ragLeg ? ragLeg.thigh : count(Math.max(3, Math.round(9 * legReach[0])))), ragLeg ? ragLeg.sides : sides, { color: legPattern, inflate: legLoose, capStart: false, capEnd: false, ...bendThigh });
    // Hakama (the hitatare's trousers): full, bloused out at the knee where they are tied over the shin guards.
    if (bottom?.kind === 'hakama' && !skirted && !longHakama) loft("""),
("""      const trouserRings = along(knee, foot, frames[BONE[`${side}Shin`]].x, ragLeg ? ragLeg.shin : count(8), -0.14, legReach[1], () => shankR * 1.12, () => shankR * 1.1);
      loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings,""",
 """      const straight = along(knee, foot, frames[BONE[`${side}Shin`]].x, ragLeg ? ragLeg.shin : count(8), longHakama ? 0.04 : -0.14, legReach[1], () => shankR * 1.12, () => shankR * 1.1);
      // (Long hakama: as full as the knee and fuller to the hem.)
      const trouserRings = longHakama ? widened(straight, 1 / 1.22, LOFT.hakama.hem / 1.22, thighR * 0.8 * LOFT.hakama.knee / 1.12) : straight;
      loft(mesh, base ? tagged(`${side}Shin`, trouserRings) : trouserRings,"""),
("""  board: { wide: 0.26,""",
 """  // Hakama worn long: how many times the leg's breadth above the knee it is at the knee, and (of that) at its hem.
  hakama: { knee: 1.75, hem: 1.25 },
  board: { wide: 0.26,"""),
])
edit('src/outfits.js', [
("""    label, top: { kind: 'kosode', color: kosode }, bottom: { kind: 'hakama', color: hakama },
    armor: { kind: 'roninDo', color: steel, lace, gold: band, cloth: linen, cloth2: sash },
    head: { kind: 'hachimaki', color: headband },
    feet: { kind: 'sandal', color: '#5a3a22' },
  };""",
 """    // The hakama worn long and untied, the sash's ends hanging, and the pair of scabbards thrust through it at the left hip.
    label, top: { kind: 'kosode', color: kosode }, bottom: { kind: 'hakama', color: hakama, long: true },
    armor: { kind: 'roninDo', color: steel, lace, gold: band, cloth: linen, cloth2: sash },
    head: { kind: 'hachimaki', color: headband },
    feet: { kind: 'sandal', color: '#5a3a22' },
    extras: [{ kind: 'sashEnds', color: sash }, { kind: 'daisho', color: '#15151a', cord: sash }],
  };"""),
])
edit('src/wardrobe.js', [
("""    } else if (extra.kind === 'tabard') {
      for (const facing of [1, -1]) {""",
 """    } else if (extra.kind === 'sashEnds') {
      // A sash's two ends hanging from its knot at the front of the left hip, one longer than the other.
      const front = body.segments.trunk.skinRadius * 0.62 * 1.32 + 0.02 * scale;
      for (const [across, length] of [[0.05, 0.3], [0.085, 0.22]]) {
        const end = new Dangle(hips, [front, 0.03 * scale, across * scale], [0.15, -1, across], length * scale, { sag: 0.75, damping: 0.2 });
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.006 * scale, length * scale, 0.045 * scale), surface(new THREE.Color(color).getHex(), { roughness: 0.9 }));
        strip.position.y = (-length * scale) / 2;
        end.group.add(strip);
        dangles.push(end);
      }
    } else if (extra.kind === 'daisho') {
      // The pair of scabbards (the katana's and the wakizashi's) thrust through the sash at the left hip, edge up, their
      // mouths before the belly and their ends behind; lacquered, a cord (sageo) knotted round each. Rigid on the hips.
      const lacquer = surface(new THREE.Color(color).getHex(), { roughness: 0.3 });
      const cord = surface(new THREE.Color(extra.cord ?? color).getHex(), { roughness: 0.9 });
      const side = body.segments.trunk.skinRadius * 1.02 + 0.015 * scale;
      for (const [length, lift, slope, inward] of [[0.74, 0.05, 0.36, 0], [0.5, 0.075, 0.2, 0.03]]) {
        const heading = new THREE.Vector3(-1, -slope, 0.12).normalize();
        const saya = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014 * scale, 0.017 * scale, length * scale, 8), lacquer);
        tube.scale.z = 0.62;
        const knot = new THREE.Mesh(new THREE.TorusGeometry(0.019 * scale, 0.005 * scale, 5, 10), cord);
        knot.rotation.x = Math.PI / 2;
        knot.scale.y = 0.62;
        knot.position.y = length * scale * 0.24;
        saya.add(tube, knot);
        // Its length (the cylinder's y) along `heading`, a third of it before the hip.
        saya.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), heading);
        saya.position.set(0, lift * scale, side - inward * scale).addScaledVector(heading, length * scale * 0.2);
        hips.add(saya);
        inkAll(saya, 0.0025);
      }
    } else if (extra.kind === 'tabard') {
      for (const facing of [1, -1]) {"""),
])
