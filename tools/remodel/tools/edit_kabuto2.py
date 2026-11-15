import sys
def edit(p, pairs):
    s = open(p).read()
    for old, new in pairs:
        if s.count(old) != 1: sys.exit(f'{p}: expected 1 of {old[:80]!r}, found {s.count(old)}')
        s = s.replace(old, new)
    open(p, 'w').write(s)
edit('src/wardrobe.js', [
("""  // On a bowl raised to a point, a plume of it bound there (hagumaHair).
  if (head.hair) group.add(build.skull ? hagumaHair(r, head.hair, build.skull.outline.at(-1)[1], lowDetail) : shagumaHair(form, r, head.hair, lowDetail));""",
"""  if (head.hair) group.add(shagumaHair(form, r, head.hair, lowDetail));
  // Haguma: a plume of yak hair bound at the bowl's crown or point (`plume`, its colour).
  if (head.plume) group.add(hagumaHair(r, head.plume, build.skull ? build.skull.outline.at(-1)[1] : form.top, lowDetail));"""),
(""" * `skull`: a bowl raised to a point (nanbanSkull's outline), not the fitted dome; its hair (`head.hair`) a plume from the point.
""", """ * `skull`: a bowl raised to a point (nanbanSkull's outline), not the fitted dome.
"""),
("""    flap.rotation.y = side * -0.95;""", """    flap.rotation.y = side * -0.7;"""),
("""    case 'crescent': {
      const moon = new THREE.Mesh(new THREE.TorusGeometry(0.9 * r, 0.07 * r, 6, 24, Math.PI), crestMetal);
      moon.scale.set(1, 0.75, 0.35);
      moon.rotation.y = Math.PI / 2;
      moon.position.y = 0.05 * r;
      crest.add(moon);
      break;
    }
""", """    case 'crescent': {
      // A crescent moon cut from gilt sheet, its horns up: what lies between two circles' arcs, leant back with the bowl.
      const arc = (centre, radius, from, to) => Array.from({ length: 9 }, (_, step) => {
        const angle = from + ((to - from) * step) / 8;
        return [Math.cos(angle) * radius * 0.75 * r, (centre + Math.sin(angle) * radius) * 0.75 * r];
      });
      const moon = plateShape([...arc(0.9, 0.9, -Math.PI / 2, 0.627), ...arc(1.15, 0.78, 0.364, -Math.PI / 2)], 0.03 * r, crestMetal);
      const stand = new THREE.Group();
      stand.rotation.z = 0.16;
      stand.add(moon);
      crest.add(stand);
      break;
    }
"""),
])
edit('src/outfits.js', [
("""      toseiDesign('Russet', '#6b4a32', '#2a1a10', 'kuwagata', 'red', '#2a1f18'),""",
 """      // Russet iron under a shiinari bowl dressed in white yak hair, laced dark blue (the Met's shiinari kabuto, 17th c.).
      { ...toseiDesign('Russet', '#6b4a32', '#1d2a4f', null, 'red', '#2a1f18'), head: { kind: 'kabuto', design: 'shiinari', color: '#6b4a32', mask: 'red', plume: '#e9e3d2', lace: '#1d2a4f', gold: '#d6a743' } },"""),
("""head: { kind: 'kabuto', color: '#17171a', crest: 'tall', mask: 'black', maskDesign: 'oni', lace: '#b3161b', gold: '#d6a743' } },""",
 """head: { kind: 'kabuto', color: '#17171a', crest: 'crescent', mask: 'black', maskDesign: 'oni', plume: '#e9e3d2', lace: '#b3161b', gold: '#d6a743' } },"""),
])
edit('src/outfitsets.js', [
("""'kabuto:nanban+mask': 'Nanban kabuto and menpo',""", """'kabuto:nanban+mask': 'Nanban kabuto and menpo', 'kabuto:shiinari+mask': 'Shiinari kabuto and menpo',"""),
])
