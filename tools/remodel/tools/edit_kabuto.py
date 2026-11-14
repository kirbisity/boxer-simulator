import re, sys
p = 'src/wardrobe.js'
s = open(p).read()
def sub(old, new, count=1):
    global s
    if s.count(old) != count:
        sys.exit(f'expected {count} of: {old[:70]!r}, found {s.count(old)}')
    s = s.replace(old, new)

# --- hair: one builder for hair set into a bowl, rooted by a rule; its swing ---
sub("""/** The hair growing out of the kabuto's bowl (KABUTO_FORM): one mesh of tapering strands, greys varied lock by lock. */
function shagumaHair(form, r, colour) {
  const base = new THREE.Color(colour);
  const positions = [];
  const colours = [];
  const indices = [];
  // A fixed sequence, so every fighter's mane is the same hair.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let lock = 0; lock < SHAGUMA.locks; lock += 1) {
    const side = lock % 2 ? 1 : -1;
    // Round from over the brow's corner (u 0.14: the face kept clear) to the nape (u 1), up from near the foot to the crown.
    const u = 0.14 + 0.86 * random();
    const v = 0.3 + 0.62 * Math.sqrt(random());
    const root = formPoint(form.bowl, u, v).map((value) => value * r);
    root[2] *= side;
    const outward = new THREE.Vector3(root[0], root[1] - 0.2 * r, root[2]).normalize();
    // Longer behind than at the temples; the crown's locks stand up before they fall.
    const length = (SHAGUMA.length[0] + (SHAGUMA.length[1] - SHAGUMA.length[0]) * (0.35 + 0.65 * u) * (0.6 + 0.4 * random())) * r;
    const lift = SHAGUMA.lift * (random() - 0.35);
    const grey = base.clone().offsetHSL(0, 0, (random() - 0.5) * 0.22);
    const first = positions.length / 3;
    let at = new THREE.Vector3(...root);
    // Out from the bowl at first, a crown lock a little up or down, then falling.
    let heading = new THREE.Vector3(outward.x, outward.y * 0.45 + lift, outward.z).normalize();
    for (let step = 0; step <= SHAGUMA.segments; step += 1) {
      const t = step / SHAGUMA.segments;
      // The strand's breadth across it, flat to the bowl: tangent to the outward direction and the heading.
      const across = new THREE.Vector3().crossVectors(heading, outward).normalize();
      if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
      const half = SHAGUMA.width * r * (1 - 0.85 * t) * (0.7 + 0.6 * random());
      positions.push(at.x - across.x * half, at.y - across.y * half, at.z - across.z * half, at.x + across.x * half, at.y + across.y * half, at.z + across.z * half);
      const shade = grey.clone().multiplyScalar(0.45 + 0.3 * t);
      colours.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
      if (step < SHAGUMA.segments) {
        const a = first + step * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      // Each segment bends the strand down under its weight and a little outward, with a kink of its own.
      at = at.clone().addScaledVector(heading, length / SHAGUMA.segments);
      heading = heading.clone()
        .addScaledVector(new THREE.Vector3(0, -1, 0), SHAGUMA.droop / SHAGUMA.segments)
        .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z), 0.5 / SHAGUMA.segments)
        .add(new THREE.Vector3((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3))
        .normalize();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const mane = new THREE.Mesh(geometry, material);
  mane.userData.noOutline = true;
  return mane;
}
""", """// A plume of yak hair (the white, red or black haguma of the tōsei kabuto: the Met's and the Ann and Gabriel Barbier-Mueller
// Museum's): bound at the bowl's point, standing a little from it and falling down the back and both sides to below the
// chin, the brow and face kept clear; `tone`: how light its shadows stay (white hair is not grey at its roots).
const HAGUMA = { locks: 260, width: 0.11, length: [2.6, 3.9], lift: 0.5, droop: 3.4, segments: 8, tone: [0.74, 0.26] };
// How helmet hair swings (maneSwing): its free ends on a spring `stiffness` (1/s²) and `damping` (1/s) behind the head, at most
// `reach` of a lock's length off where it hangs.
const MANE_SWING = { stiffness: 60, damping: 5, reach: 0.4 };

/** The hair growing out of the kabuto's bowl (KABUTO_FORM): one mesh of tapering strands, greys varied lock by lock. */
function shagumaHair(form, r, colour, still = false) {
  // Round from over the brow's corner (u 0.14: the face kept clear) to the nape (u 1), up from near the foot to the crown.
  return hairLocks(r, colour, SHAGUMA, still, (random, side) => {
    const u = 0.14 + 0.86 * random();
    const v = 0.3 + 0.62 * Math.sqrt(random());
    const root = formPoint(form.bowl, u, v).map((value) => value * r);
    root[2] *= side;
    // Longer behind than at the temples.
    return { root, outward: new THREE.Vector3(root[0], root[1] - 0.2 * r, root[2]).normalize(), reach: 0.35 + 0.65 * u };
  });
}

/** A plume of yak hair (HAGUMA) bound at a bowl's point (`top`, head radii up) and falling round it, clear of the face. */
function hagumaHair(r, colour, top, still = false) {
  return hairLocks(r, colour, HAGUMA, still, (random, side) => {
    // Round from beside the temple to the nape, thickest behind; each lock leaves the point outward and a little up.
    const turn = Math.PI * (0.3 + 0.7 * Math.sqrt(random()));
    const outward = new THREE.Vector3(Math.cos(turn), 0.25, side * Math.sin(turn)).normalize();
    const root = [outward.x * 0.1 * r, (top - 0.12 * random()) * r, outward.z * 0.1 * r];
    return { root, outward, reach: 0.6 + 0.4 * (turn / Math.PI) };
  });
}

/**
 * Hair set into a helmet: one mesh of tapering strands (`spec`: SHAGUMA, HAGUMA), each lock from `lockAt(random, side)`
 * ({ root, outward, reach: its share of the full length }), its shade varied lock by lock. It swings (maneSwing) unless `still`.
 */
function hairLocks(r, colour, spec, still, lockAt) {
  const base = new THREE.Color(colour);
  const [dark, gain] = spec.tone ?? [0.45, 0.3];
  const positions = [];
  const colours = [];
  const indices = [];
  const shares = [];
  // A fixed sequence, so every fighter's mane is the same hair.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let lock = 0; lock < spec.locks; lock += 1) {
    const { root, outward, reach } = lockAt(random, lock % 2 ? 1 : -1);
    const length = (spec.length[0] + (spec.length[1] - spec.length[0]) * reach * (0.6 + 0.4 * random())) * r;
    // The crown's locks stand up before they fall.
    const lift = spec.lift * (random() - 0.35);
    const grey = base.clone().offsetHSL(0, 0, (random() - 0.5) * 0.22);
    const first = positions.length / 3;
    let at = new THREE.Vector3(...root);
    // Out from the bowl at first, a crown lock a little up or down, then falling.
    let heading = new THREE.Vector3(outward.x, outward.y * 0.45 + lift, outward.z).normalize();
    for (let step = 0; step <= spec.segments; step += 1) {
      const t = step / spec.segments;
      // The strand's breadth across it, flat to the bowl: tangent to the outward direction and the heading.
      const across = new THREE.Vector3().crossVectors(heading, outward).normalize();
      if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
      const half = spec.width * r * (1 - 0.85 * t) * (0.7 + 0.6 * random());
      positions.push(at.x - across.x * half, at.y - across.y * half, at.z - across.z * half, at.x + across.x * half, at.y + across.y * half, at.z + across.z * half);
      const shade = grey.clone().multiplyScalar(dark + gain * t);
      colours.push(shade.r, shade.g, shade.b, shade.r, shade.g, shade.b);
      shares.push((t * t * length) / (spec.length[1] * r), (t * t * length) / (spec.length[1] * r));
      if (step < spec.segments) {
        const a = first + step * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      // Each segment bends the strand down under its weight and a little outward, with a kink of its own.
      at = at.clone().addScaledVector(heading, length / spec.segments);
      heading = heading.clone()
        .addScaledVector(new THREE.Vector3(0, -1, 0), spec.droop / spec.segments)
        .addScaledVector(new THREE.Vector3(outward.x, 0, outward.z), 0.5 / spec.segments)
        .add(new THREE.Vector3((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3))
        .normalize();
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const mane = new THREE.Mesh(geometry, material);
  mane.name = 'helm-hair';
  mane.userData.noOutline = true;
  if (!still) mane.userData.swing = maneSwing(mane, shares, spec.length[1] * r);
  return mane;
}

const maneScratch = { inverse: null, from: null, to: null };

/**
 * Helmet hair's swing (`userData.swing`: update(dt, hitAt, time) each frame; render.js): a weight hung a lock's `length` (m)
 * under the helmet (chinahelms.js swingStep), left behind by the head's running, turning and ducking and thrown by a blow to
 * it; each vertex moved by its share (`shares`: none at the root, most at the longest lock's end) of how far the weight is
 * off where it hangs.
 */
function maneSwing(mesh, shares, length) {
  const s = maneScratch;
  if (!s.inverse) Object.assign(s, { inverse: new THREE.Matrix4(), from: new THREE.Vector3(), to: new THREE.Vector3() });
  const rest = Float32Array.from(mesh.geometry.attributes.position.array);
  let state = null;
  let lastHit = null;
  let moved = false;
  const swing = {
    angle: 0,
    kick(direction, speed) {
      if (state) for (let axis = 0; axis < 3; axis += 1) state.velocity[axis] += direction[axis] * speed;
    },
    update(dt, hitAt = null, time = 0) {
      const parent = mesh.parent;
      if (!parent || !(dt > 0)) return;
      parent.updateWorldMatrix(true, false);
      const pivot = s.from.setFromMatrixPosition(parent.matrixWorld).toArray();
      state = swingStep(state, { pivot, target: [0, -1, 0], length, stiffness: MANE_SWING.stiffness, damping: MANE_SWING.damping }, dt);
      if (hitAt !== null && hitAt !== lastHit && time - hitAt >= 0 && time - hitAt < 0.2) {
        lastHit = hitAt;
        const angle = Math.random() * Math.PI * 2;
        swing.kick([Math.cos(angle), 0.4, Math.sin(angle)], SWING.hitSpeed);
      }
      // How far the weight is off where it hangs (world), no more than `reach` of the length; in the helmet's frame.
      const off = [state.tip[0] - pivot[0], state.tip[1] - pivot[1] + length, state.tip[2] - pivot[2]];
      const far = Math.hypot(...off);
      swing.angle = Math.min(far / length, MANE_SWING.reach);
      if (swing.angle < 0.004 && !moved) return;
      moved = swing.angle >= 0.004;
      const scale = far > 1e-9 ? (swing.angle * length) / far : 0;
      s.inverse.copy(parent.matrixWorld).invert();
      s.to.set(pivot[0] + off[0] * scale, pivot[1] + off[1] * scale, pivot[2] + off[2] * scale).applyMatrix4(s.inverse);
      s.from.applyMatrix4(s.inverse);
      const [x, y, z] = [s.to.x - s.from.x, s.to.y - s.from.y, s.to.z - s.from.z];
      const position = mesh.geometry.attributes.position;
      const array = position.array;
      for (let vertex = 0; vertex < shares.length; vertex += 1) {
        const share = shares[vertex];
        array[vertex * 3] = rest[vertex * 3] + x * share;
        array[vertex * 3 + 1] = rest[vertex * 3 + 1] + y * share;
        array[vertex * 3 + 2] = rest[vertex * 3 + 2] + z * share;
      }
      position.needsUpdate = true;
    },
  };
  return swing;
}
""")

# --- the pointed bowl ---
sub("""const NANBAN_SKULL = {
  outline: [[1.16, 0.12], [1.15, 0.4], [1.08, 0.78], [0.92, 1.18], [0.66, 1.58], [0.36, 1.92], [0.1, 2.14], [0, 2.18]],
  brim: 0.3, rivets: 14, rivetY: 0.24,
};
""", """const NANBAN_SKULL = {
  outline: [[1.16, 0.12], [1.15, 0.4], [1.08, 0.78], [0.92, 1.18], [0.66, 1.58], [0.36, 1.92], [0.1, 2.14], [0, 2.18]],
  brim: 0.3, rivets: 14, rivetY: 0.24,
};
// The shiinari ("acorn-shaped") bowl of the tōsei kabuto (the Met's russet-iron shiinari kabuto with white yak hair, 17th c.):
// plates raised tall to a blunt point, the join a ridge down the front and back, a close row of rivets round the foot and a
// narrow flat brim all round in place of the peak.
const SHIINARI_SKULL = {
  outline: [[1.16, 0.12], [1.17, 0.5], [1.14, 0.9], [1.05, 1.32], [0.9, 1.72], [0.68, 2.08], [0.42, 2.36], [0.16, 2.52], [0, 2.56]],
  brim: 0.14, rivets: 26, rivetY: 0.26,
};
""")
sub("""function nanbanSkull(r, material) {
  const spec = NANBAN_SKULL;
""", """function nanbanSkull(r, material, spec = NANBAN_SKULL) {
""")
sub(""" * - nanban: the Nanban kabuto, a European cabasset's skull bought or copied from the Portuguese (nanbanSkull): one piece of
 *   thicker steel, no seams for a blow to open, its brim in place of the peak.
""", """ * - nanban: the Nanban kabuto, a European cabasset's skull bought or copied from the Portuguese (nanbanSkull): one piece of
 *   thicker steel, no seams for a blow to open, its brim in place of the peak.
 * - shiinari: the tall acorn-shaped bowl (SHIINARI_SKULL), its brim in place of the peak.
 * `skull`: a bowl raised to a point (nanbanSkull's outline), not the fitted dome; its hair (`head.hair`) a plume from the point.
""")
sub("""  nanban: { peak: false, dress() {} },
""", """  nanban: { peak: false, skull: NANBAN_SKULL, dress() {} },
  shiinari: { peak: false, skull: SHIINARI_SKULL, dress() {} },
""")
sub("""  const bowl = build === KABUTO_BOWLS.nanban ? nanbanSkull(r, bowlSteel) : new THREE.Mesh(bowlGeometry, bowlSteel);""",
    """  const bowl = build.skull ? nanbanSkull(r, bowlSteel, build.skull) : new THREE.Mesh(bowlGeometry, bowlSteel);""")
sub("""  if (head.hair) group.add(shagumaHair(form, r, head.hair));""",
    """  // On a bowl raised to a point, a plume of it bound there (hagumaHair).
  if (head.hair) group.add(build.skull ? hagumaHair(r, head.hair, build.skull.outline.at(-1)[1], lowDetail) : shagumaHair(form, r, head.hair, lowDetail));""")
sub("""function buildKabuto(group, head, r, steel, color) {""", """function buildKabuto(group, head, r, steel, color, lowDetail = false) {""")
sub("""      buildKabuto(group, head, r, steel, color);""", """      buildKabuto(group, head, r, steel, color, lowDetail);""")
sub("""import { HONGYING_MOUNTS, mingHoodGrid, TASSELS } from './chinahelms.js';""", """import { HONGYING_MOUNTS, mingHoodGrid, SWING, swingStep, TASSELS } from './chinahelms.js';""")

# --- shikoro lames laced; throat guard of lames ---
sub("""    lame.material = bowlSteel.clone();
    lame.material.side = THREE.DoubleSide;
    lame.position.y = -0.05 * r - tier * 0.24 * r;
    lame.scale.z = narrow;
""", """    lame.material = bowlSteel.clone();
    lame.material.side = THREE.DoubleSide;
    lame.position.y = -0.05 * r - tier * 0.24 * r;
    lame.scale.z = narrow;
    // Each tier a row of laced scales (detailmaps.js HELMET_PART_TILES).
    lame.userData.helmPart = 'shikoro';
""")
sub("""    const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * r, 0.95 * r, 0.42 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), head.mask === 'oni' ? metal(steel, 0x101012) : lace);
    throat.material = throat.material.clone();
    throat.material.side = THREE.DoubleSide;
    throat.position.y = MASK_THROAT_Y * r;
    group.add(throat);
""", """    // The throat guard (yodare-kake): three laced lames hung from the mask's chin, each wider than the one above, a cord at
    // the foot of each.
    for (let tier = 0; tier < 3; tier += 1) {
      const [top, bottom] = [0.75 + tier * 0.075, 0.83 + tier * 0.075];
      const lame = new THREE.Mesh(new THREE.CylinderGeometry(top * r, bottom * r, 0.15 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), head.mask === 'oni' ? metal(steel, 0x101012) : bowlSteel);
      lame.material = lame.material.clone();
      lame.material.side = THREE.DoubleSide;
      lame.position.y = (MASK_THROAT_Y + 0.14 - tier * 0.14) * r;
      lame.userData.helmPart = 'shikoro';
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(bottom * 1.005 * r, bottom * 1.012 * r, 0.035 * r, 16, 1, true, Math.PI * 0.05, Math.PI * 0.9), lace);
      cord.material = lace.clone();
      cord.material.side = THREE.DoubleSide;
      cord.position.y = lame.position.y - 0.075 * r;
      group.add(lame, cord);
    }
""")

# --- fukigaeshi: a turned-back plate with a gilt border and mon ---
sub("""    const flap = new THREE.Mesh(new THREE.BoxGeometry(0.45 * r * turnback, 0.42 * r * turnback, 0.06 * r), bowlSteel);
    flap.position.set(0.55 * r, -0.05 * r, side * (Math.cos(Math.PI * 0.18) * shikoro(0).z / r + 0.29 + 0.25 * (turnback - 1)) * r);
    flap.rotation.y = side * -0.6;
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.47 * r * turnback, 0.06 * r, 0.07 * r), gold);
    edge.position.copy(flap.position).add(new THREE.Vector3(0, 0.2 * r * turnback, 0));
    edge.rotation.y = flap.rotation.y;
    group.add(flap, edge);
""", """    // A plate rounded at its outer corners, lacquered as the bowl, in a gilt border, the mon a gilt stud on its face.
    const [wide, tall] = [0.24 * r * turnback, 0.23 * r * turnback];
    const outline = (grow) => [[0, -tall - grow], [wide * 0.7 + grow, -tall - grow], [wide + grow, -tall * 0.55], [wide + grow, tall + grow], [0, tall + grow]];
    const flap = new THREE.Group();
    const border = plateShape(outline(0.03 * r), 0.04 * r, gold);
    const face = plateShape(outline(-0.02 * r), 0.05 * r, bowlSteel);
    face.position.x = 0.005 * r;
    const mon = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * r * turnback, 0.1 * r * turnback, 0.07 * r, 12), gold);
    mon.rotation.z = Math.PI / 2;
    mon.position.x = 0.035 * r;
    flap.add(border, face, mon);
    flap.position.set(0.55 * r, -0.05 * r, side * (Math.cos(Math.PI * 0.18) * shikoro(0).z / r + 0.29 + 0.25 * (turnback - 1)) * r);
    // Its face forward and out: the lame's end turned back beside the face.
    flap.rotation.y = side * -0.95;
    group.add(flap);
""")

# --- crest: the kuwagata ---
sub("""    case 'kuwagata': case 'tall': {
      for (const side of [1, -1]) {
        const horn = new THREE.Mesh(new THREE.BoxGeometry(0.04 * r, (head.crest === 'tall' ? 1.9 : 1.3) * r, 0.18 * r), crestMetal);
        horn.position.set(0, (head.crest === 'tall' ? 0.9 : 0.6) * r, side * 0.32 * r);
        horn.rotation.x = side * (head.crest === 'tall' ? 0.22 : 0.42);
        crest.add(horn);
      }
      if (head.crest === 'tall') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * r, 0.22 * r, 0.04 * r, 18), gold);
        disc.rotation.z = Math.PI / 2;
        disc.position.y = 0.2 * r;
        crest.add(disc);
      }
      break;
    }
""", """    case 'kuwagata': case 'tall': {
      // The kuwagata: two flat gilt horns cut from one sheet with their base plate (the kuwagata-dai) at the brow, spreading
      // up and out, broadening to a notched tip; leant back with the bowl. Between them a maedate: a small flame of bright
      // steel, or on the tall pair a gilt disc.
      const [reach, rise] = head.crest === 'tall' ? [0.82, 1.45] : [1, 1];
      const horns = plateShape(KUWAGATA_HALF.map(([across, up]) => [across * reach * r, up * rise * r]), 0.03 * r, crestMetal);
      const stand = new THREE.Group();
      stand.rotation.z = 0.16;
      stand.add(horns);
      crest.add(stand);
      if (head.crest === 'tall') {
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.22 * r, 0.22 * r, 0.04 * r, 18), gold);
        disc.rotation.z = Math.PI / 2;
        disc.position.set(0.03 * r, 0.3 * r, 0);
        crest.add(disc);
      } else {
        const flame = plateShape(FLAME_HALF.map(([across, up]) => [across * 0.26 * r, up * 0.4 * r]), 0.03 * r, steel);
        flame.position.set(0.04 * r, 0.16 * r, 0);
        crest.add(flame);
      }
      break;
    }
""")
sub("""// The flame maedate's half outline""", """// The kuwagata's half outline (the crest's own radii, [across, up]): from the middle of the base plate's foot out along it, up
// the horn's outer edge to its outer point, the notch, its inner point, and down its inner edge to the base plate's top.
const KUWAGATA_HALF = [[0, 0], [0.3, 0.02], [0.42, 0.14], [0.56, 0.42], [0.74, 0.74], [0.86, 1.0], [0.94, 1.26], [0.8, 1.12], [0.72, 1.3], [0.62, 1.02], [0.46, 0.72], [0.3, 0.46], [0.16, 0.3], [0, 0.26]];

// The flame maedate's half outline""")
open(p, 'w').write(s)

p = 'src/detailmaps.js'
s = open(p).read()
sub("""export const HELMET_PART_TILES = { pagodaHelm: { aventail: 'lamellae' } };""", """export const HELMET_PART_TILES = { pagodaHelm: { aventail: 'lamellae' }, kabuto: { shikoro: 'kozane' } };""")
open(p, 'w').write(s)
