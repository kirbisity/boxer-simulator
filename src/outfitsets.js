// Outfit sets: what can be picked to wear, each a real kit with its own name, description and stats.
//
// An outfit (outfits.js OUTFITS) draws in several designs. Designs that differ only in colour, crest, plume, lacing or
// painted device are one set (a finish of it: cosmetic). Designs that differ in what guards the man (brigandine or
// lamellar, a mail shirt or a breastplate, a sallet or a close helmet, a mask or none) are sets of their own, and a set
// says how its stats differ from the outfit's (`patch`, merged over the outfit: outfits.js setSpec):
//   protection   by kind and by region (head, torso, limb, or a part: UpperArm, Shank...), merged region by region;
//   extraMass    the kit's weight as a share of the body's (in place of the outfit's);
//   helmet       what is on the head as a blow meets it (outfits.js HELMETS: mass, padding, curve, face);
//   gaps, breastplate, movement, courage: as on an outfit.
// An outfit with no entry here is one set: its own label, with `OUTFIT_BLURBS` for its description.
// The differences are kept small and historical: the same man in a better helmet, not a different man.

// A head guarded by nothing (a bare head or a cloth cap on a kit that otherwise has a helmet).
const BARE_HEAD = { blunt: 0, cut: 0, pierce: 0, deflects: false };
// A cloth wrap or hachimaki: a few turns of cotton, a little against a cut.
const CLOTH_HEAD = { blunt: 0.05, cut: 0.1, pierce: 0.02, deflects: false };

export const OUTFIT_SETS = {
  knight: [
    {
      key: 'sallet', designs: [0, 2], name: 'Gothic harness — sallet and bevor',
      blurb: 'German plate of the 1480s: a sallet sweeping back over the neck, a bevor guarding chin and throat. Light and glancing; the sights are a long slot.',
      patch: { helmet: { mass: 2.4, padding: 0.65, curve: 0.9, face: 'closed' }, protection: { regions: { head: { blunt: 0.62, cut: 1, pierce: 0.94, deflects: true } } } },
    },
    {
      key: 'hounskull', designs: [1, 4], name: 'Milanese harness — hounskull bascinet',
      blurb: 'Italian plate of c. 1400: a pointed bascinet with a snouted visor and a mail aventail over the neck. The point turns a blow; the mail at the throat is the weak place.',
      patch: { helmet: { mass: 2.6, padding: 0.7, curve: 0.92, face: 'closed' }, protection: { regions: { head: { blunt: 0.6, cut: 1, pierce: 0.95, deflects: true } } } },
    },
    {
      key: 'closeHelmet', designs: [3], name: 'Late harness — close helmet',
      blurb: 'Plate of the 1520s: a close helmet shut round the whole head and turning on the gorget, no mail at the throat. The best-guarded head, and the heaviest.',
      patch: {
        extraMass: 0.285,
        helmet: { mass: 3.1, padding: 0.7, curve: 0.82, face: 'closed' },
        protection: { regions: { head: { blunt: 0.67, cut: 1, pierce: 0.97, deflects: true } } },
        gaps: { mail: ['armpit', 'elbow', 'groin'], closed: ['neck'] },
      },
    },
  ],
  footman: [
    {
      key: 'brigandineKettle', designs: [0], name: 'Brigandine and kettle hat',
      blurb: 'The 15th-century infantryman: small plates riveted inside a cloth coat, a ridged iron kettle hat whose brim keeps blows off the face.',
      patch: {},
    },
    {
      key: 'brigandineSallet', designs: [1], name: 'Brigandine and German sallet',
      blurb: 'The same riveted coat under a deep German sallet: more of the head and the back of the neck in steel, a narrower view.',
      patch: { helmet: { mass: 2.2, padding: 0.45, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } } },
    },
    {
      key: 'brigandineBurgundian', designs: [4], name: 'Brigandine and Burgundian kettle',
      blurb: 'A wide-brimmed Burgundian kettle, deep in the crown: the brim takes a downward cut, the crown a blow, the face stays open.',
      patch: { helmet: { mass: 2.3, padding: 0.5, curve: 0.65 }, protection: { regions: { head: { blunt: 0.6, cut: 0.92, pierce: 0.63 } } } },
    },
    {
      key: 'mail', designs: [2], name: 'Mail shirt and kettle hat',
      blurb: 'A haubergeon of riveted rings over a padded jack: lighter than plates and good against an edge, but a point parts the rings and a blow goes through.',
      patch: { extraMass: 0.105, protection: { blunt: 0.35, cut: 0.88, pierce: 0.5 }, gaps: null },
    },
    {
      key: 'breastplate', designs: [3], name: 'Breastplate and sallet',
      blurb: 'A munition breastplate and a German sallet: one curved steel plate over the chest turns a point best of all the footmen, and weighs the most.',
      patch: {
        extraMass: 0.14, breastplate: 0.6,
        helmet: { mass: 2.2, padding: 0.45, curve: 0.75 },
        protection: { blunt: 0.5, cut: 0.9, pierce: 0.8, regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } },
      },
    },
  ],
  archer: [
    {
      key: 'kettle', designs: [0, 2], name: 'Archer — jack and kettle hat',
      blurb: 'The bowman of the Hundred Years War: a padded jack of many linen layers and an iron kettle hat. Quick on his feet, proof against little but a glancing cut.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.88, pierce: 0.6 } } } },
    },
    {
      key: 'bare', designs: [1], name: 'Archer — jack, bare head',
      blurb: 'The jack alone, the head bare: the lightest kit in the line, and nothing between the skull and a blow.',
      patch: { extraMass: 0.035, protection: { regions: { head: BARE_HEAD } } },
    },
    {
      key: 'sallet', designs: [3], name: 'Archer — jack and sallet',
      blurb: 'A plain sallet over the jack: the back of the head and the neck guarded too, at a little more weight.',
      patch: { extraMass: 0.046, helmet: { mass: 2.1, padding: 0.4, curve: 0.75 }, protection: { regions: { head: { blunt: 0.52, cut: 0.9, pierce: 0.66 } } } },
    },
  ],
  conquistadorPlate: [
    {
      key: 'morion', designs: [0, 1], name: 'Conquistador — breastplate and morion',
      blurb: 'The Spanish soldier of the conquest: a breastplate and tassets over a doublet, mail at the arms, a combed morion whose brim turns a downward blow.',
      patch: {},
    },
    {
      key: 'cabasset', designs: [2, 4], name: 'Conquistador — breastplate and cabasset',
      blurb: 'The same harness under the almond cabasset: a tall pointed crown that glances a blow, a narrow brim, a little lighter than the morion.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'pot', designs: [3], name: 'VOC pikeman — corselet and pot',
      blurb: 'A Dutch East India Company pikeman: the corselet of a 17th-century pike block and a broad-brimmed pot helmet, heavier and deeper in the crown.',
      patch: { extraMass: 0.17, protection: { regions: { head: { blunt: 0.53, cut: 0.91, pierce: 0.78 } } } },
    },
  ],
  conquistadorQuilted: [
    {
      key: 'morion', designs: [0, 2], name: 'Escaupil and morion',
      blurb: 'The quilted cotton armour the Spaniards took from the Mexica (escaupil), two fingers thick, under a steel morion: light, cool, and good against an arrow.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.9, pierce: 0.8 } } } },
    },
    {
      key: 'cabasset', designs: [1, 4], name: 'Escaupil and cabasset',
      blurb: 'The escaupil under an almond cabasset: a pointed crown that turns a blow aside.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'feltHat', designs: [3], name: 'VOC musketeer — quilted coat, felt hat',
      blurb: 'A Company musketeer in the tropics: a quilted coat and a broad felt hat. No steel on the head at all, and the lightest kit to move in.',
      patch: { extraMass: 0.065, protection: { bullet: { head: 0 }, regions: { head: { blunt: 0.03, cut: 0.05, pierce: 0, deflects: false } } } },
    },
  ],
  ottomanHeavy: [
    {
      key: 'turban', designs: [0, 2], name: 'Sipahi — mail and plate, turban helmet',
      blurb: 'The Ottoman heavy horseman: mail and plate (krug), vambraces, and the tall pointed Turkman turban helmet with a mail veil over the face.',
      patch: { helmet: { mass: 2.4, padding: 0.5, curve: 0.88, face: 'closed' }, protection: { regions: { head: { blunt: 0.5, cut: 0.97, pierce: 0.6, deflects: true } } } },
    },
    {
      key: 'chichak', designs: [1], name: 'Sipahi — mail and plate, chichak',
      blurb: 'The same mail and plate under a chichak with a sliding nasal and cheek plates: lighter, a wider view, the face open.',
      patch: { helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
  ],
  samurai: [
    {
      key: 'open', designs: [0, 2], name: 'Ō-yoroi — open kabuto',
      blurb: 'The mounted samurai\'s great box armour of laced lamellae, a riveted kabuto with its wide neck guard; the face bare.',
      patch: {},
    },
    {
      key: 'menpo', designs: [1, 3, 4], name: 'Ō-yoroi — kabuto and menpo',
      blurb: 'The great armour with a lacquered iron face mask (menpo) and its throat guard: the face and throat in iron, a little more weight.',
      patch: { extraMass: 0.225, protection: { regions: { head: { blunt: 0.68, cut: 0.93, pierce: 0.66 } } } },
    },
  ],
  wokouArmoured: [
    {
      key: 'do', designs: [0], name: 'Wokou — dō-maru',
      blurb: 'A pirate in a captured dō-maru: lacquered lamellae round the trunk, the arms and head bare but for a hachimaki.',
      patch: { protection: { regions: { head: CLOTH_HEAD } } },
    },
    {
      key: 'sode', designs: [1, 3], name: 'Wokou — dō-maru and sode',
      blurb: 'The dō-maru with its shoulder boards (sode) tied on: the upper arms guarded, a little heavier.',
      patch: { extraMass: 0.085, protection: { regions: { head: CLOTH_HEAD, UpperArm: { blunt: 0.3, cut: 0.6, pierce: 0.35 } } } },
    },
    {
      key: 'jingasa', designs: [2], name: 'Wokou — dō-maru and iron hat',
      blurb: 'The dō-maru and an iron jingasa: a shallow conical hat of iron that turns a downward cut.',
      patch: { extraMass: 0.08, protection: { bullet: { head: 0.15 }, regions: { head: { blunt: 0.35, cut: 0.6, pierce: 0.4 } } } },
    },
  ],
  hunNoble: [
    {
      key: 'mail', designs: [0], name: 'Hun noble — mail and spangenhelm',
      blurb: 'A Hunnic lord in a mail shirt won from Rome or Persia and a riveted spangenhelm: good against an edge, poor against a point.',
      patch: {},
    },
    {
      key: 'lamellar', designs: [1], name: 'Hun noble — leather lamellar and spangenhelm',
      blurb: 'Hardened leather lamellae laced in rows, the steppe\'s own armour: takes a blow better than mail, an edge less well, and weighs less.',
      patch: { extraMass: 0.1, protection: { blunt: 0.48, cut: 0.75, pierce: 0.45 } },
    },
  ],
  mexicaElite: [
    {
      key: 'jaguar', designs: [0, 2, 4], name: 'Jaguar warrior',
      blurb: 'One of the Mexica\'s two orders of elite warriors: a jaguar skin suit over quilted cotton, the head in the jaws of a wooden jaguar helmet.',
      patch: { protection: { blunt: 0.22, cut: 0.22, pierce: 0.2 } },
    },
    {
      key: 'eagle', designs: [1, 3], name: 'Eagle warrior',
      blurb: 'The other order: a suit of feathers over quilted cotton and an eagle\'s beak helmet. Lighter than the jaguar\'s hide, a little less against an edge.',
      patch: { extraMass: 0.06, protection: { blunt: 0.18, cut: 0.18, pierce: 0.2 } },
    },
  ],
  mingBrigandine: [
    {
      key: 'bell', designs: [0, 2], name: 'Ming brigandine — bell helmet',
      blurb: 'The Ming soldier\'s cloth-covered brigandine of iron plates, gilt rivets showing, and a bell-shaped iron helmet with a red tassel.',
      patch: { protection: { regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
    {
      key: 'tube', designs: [1], name: 'Ming brigandine — riveted helmet',
      blurb: 'The brigandine under a tall riveted helmet of iron strips: more steel over the crown, a little heavier.',
      patch: { extraMass: 0.146, helmet: { mass: 1.6, padding: 0.35, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.87, pierce: 0.58 } } } },
    },
    {
      key: 'lamellar', designs: [3, 4], name: 'Ming iron lamellar — pointed helmet',
      blurb: 'Iron lamellae laced in rows instead of the cloth coat, and a plain pointed helmet: takes a blow a little worse, an edge and a point a little better.',
      patch: { extraMass: 0.15, protection: { blunt: 0.6, cut: 0.83, pierce: 0.5, regions: { head: { blunt: 0.54, cut: 0.86, pierce: 0.6 } } } },
    },
    {
      key: 'scale', designs: [5], name: 'Ming iron scale coat',
      blurb: 'A coat of overlapping iron scales on cloth under the bell helmet: an edge slides on the scales; a point can lift one.',
      patch: { extraMass: 0.15, protection: { blunt: 0.58, cut: 0.84, pierce: 0.44, regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
  ],
  mingElite: [
    {
      key: 'brigandine', designs: [0, 1], name: 'Ming elite — brigandine, open helm',
      blurb: 'An officer\'s or guardsman\'s heavy brigandine with steel arm guards, under a tall narrow helmet with a plume; the face open.',
      patch: {},
    },
    {
      key: 'brigandineMasked', designs: [2], name: 'Ming elite — brigandine, masked helm',
      blurb: 'The heavy brigandine with a steel guardian-beast face mask on the helmet: face and cheeks in steel.',
      patch: { extraMass: 0.255, protection: { regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'scale', designs: [3], name: 'Ming elite — scale armour, open helm',
      blurb: 'A long coat of steel scales instead of the brigandine: an edge skids off it, a point finds the gaps between scales more often.',
      patch: { extraMass: 0.26, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7 } },
    },
    {
      key: 'scaleMasked', designs: [4], name: 'Ming elite — scale armour, masked helm',
      blurb: 'The steel scale coat with the masked helmet: the heaviest kit of the Ming line.',
      patch: { extraMass: 0.265, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7, regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'lamellar', designs: [5], name: 'Ming elite — iron lamellar',
      blurb: 'Iron lamellae laced with crimson cord under the open helmet.',
      patch: { protection: { blunt: 0.62, cut: 0.94, pierce: 0.74 } },
    },
  ],
};

// What each one-set outfit is, for the picker.
export const OUTFIT_BLURBS = {
  boxing: 'Trunks, boots and padded gloves: the ring\'s rules, nothing to stop a blow.',
  dobok: 'The taekwondo uniform: a cotton jacket and trousers, bare feet.',
  mma: 'Fight shorts and fingerless gloves: grappling and striking, nothing worn to help.',
  sports: 'Running kit: light, free to move, no guard at all.',
  sumo: 'The mawashi alone: a heavy silk belt to grip, a body built for the push.',
  business: 'A suit and leather shoes: cloth that tears, soles that slip.',
  casual: 'Everyday clothes: a flannel shirt and chinos.',
  hiking: 'A shell jacket and boots: good grip on the ground, nothing more.',
  thug: 'A track jacket and a beanie: street clothes.',
  yakuza: 'Bare back and tattoos: the gangster stripped to fight.',
  victorianGent: 'A frock coat and a top hat: wool broadcloth, a gentleman of the 1860s.',
  victorianLady: 'A corset and a full gown: the corset stiffens the trunk, the skirts hamper the legs.',
  rags: 'A torn shirt and bare feet: a beggar or a prisoner.',
  commoner: 'Tunic and hose: a medieval labourer, unarmoured.',
  joan: 'Joan of Arc\'s white harness, bright plate head to foot under a crimson huque.',
  templar: 'A Templar brother: a mail hauberk with mail mittens and chausses, the surcoat, and a flat-topped great helm over a mail coif.',
  tournament: 'The Stechzeug: a jousting harness bolted to a frog-mouthed helm of thick steel. Near proof against everything, and almost too heavy to fight on foot in.',
  police: 'A patrol uniform and a soft body armour vest under it: proof against a knife\'s thrust and a pistol, not a rifle.',
  riot: 'Riot gear: a padded suit with hard shells over the limbs, a helmet with a full visor.',
  swat: 'Heavy riot armour: hard plates on chest and limbs, a sealed visor.',
  infantry: 'A modern soldier: a plate carrier with rifle plates front and back, a combat helmet.',
  specialForces: 'A special-forces operator: a plate carrier and a high-cut helmet, lighter and quicker than the infantryman.',
  proximity: 'A firefighter\'s aluminized proximity suit: it reflects radiant heat, and is no armour against a blow.',
  fireEntry: 'A fire-entry suit: quilted aluminized layers for walking into flame for a few minutes.',
  humanoid: 'A full-size humanoid robot: an aluminium frame and plastic shells.',
  miniHumanoid: 'A small humanoid robot: a bare metal frame, light and fragile.',
  combatBot: 'An armoured combat robot with a rifle and a shotgun for forearms.',
  exoArmoured: 'A soldier in a powered exoframe under armour: the motors carry the weight and add to his blows.',
  silverback: 'A silverback gorilla: hide and muscle, no clothes.',
  monkeyFur: 'A primate: a macaque, a baboon or a chimpanzee.',
  kungfu: 'A silk kung fu suit: loose jacket and trousers, cloth shoes.',
  monk: 'A Shaolin monk\'s robe, leggings bound at the shin, the head shaven.',
  wuxia: 'A wandering swordsman\'s robe and sash, from the stories.',
  wokou: 'A pirate of the China coast: a robe or a bare chest, no armour.',
  guanYu: 'Guan Yu, the god of war: a green robe over gilt scale armour, the cap of a Han general.',
  hanSoldier: 'A Han dynasty soldier: an iron lamellar coat over a red robe, an iron helmet of narrow vertical plates.',
  hanCavalry: 'A Han horseman: the iron lamellar coat and helmet, cut for the saddle.',
  ironPagoda: 'The Jin dynasty\'s heavy cavalry: a long coat of iron lamellae from neck to shin and a heavy iron helmet. Slow, and very hard to hurt.',
  mingGarrison: 'A Ming garrison levy: a hemp vest, a sash, a cloth wrap round the head. No armour.',
  mingIronLamellar: 'Ming cavalry in iron lamellar over a deel, a pointed steppe helmet: armour from the northern border.',
  ashigaru: 'A foot soldier of the Warring States: a lacquered iron dō of horizontal strips and a conical iron jingasa.',
  oyoroi: 'The ō-yoroi, the great box armour of the mounted archer, in full: laced lamellae, broad shoulder boards, a kabuto.',
  samuraiTosei: 'The tōsei gusoku, the samurai armour of the gun age: a solid plate dō, a menpo over the face, a kabuto.',
  ronin: 'A masterless samurai: a cloak and kosode over odd pieces of armour, a straw hat.',
  sohei: 'A warrior monk: a white cowl, robes over a lamellar armour.',
  hoplomachus: 'The hoplomachus: a brimmed, crested helmet with a grille, quilted leg wraps and tall greaves, a small round shield.',
  murmillo: 'The murmillo: a broad-brimmed fish-crested helmet, a manica on the sword arm, a greave, the big curved shield.',
  retiarius: 'The retiarius: no helmet, a shoulder guard (galerus) on the left arm, the net and the trident.',
  scissor: 'The scissor: a tube of steel ending in a blade over the forearm, mail or scale on the body, a closed helmet.',
  secutor: 'The secutor: a smooth egg-shaped helmet with two eye holes, made to slip a trident, and the big shield.',
  thraex: 'The thraex: a griffin-crested helmet with a grille, high greaves, a small square shield and a curved blade.',
  maximus: 'A Roman general turned gladiator: a leather cuirass, bracers, no helmet.',
  lorarius: 'The arena\'s whip-man: an undyed tunic, the whip to drive the reluctant.',
  commodus: 'The emperor Commodus as Hercules: the lion\'s skin over his head and back, the club.',
  legionary: 'A legionary of the early Empire: the lorica segmentata of iron bands and an Imperial Gallic helmet.',
  republicanLegionary: 'A legionary of the Republic: a mail shirt (lorica hamata) and a bronze Montefortino helmet.',
  centurion: 'A centurion: mail with his medals (phalerae), greaves, a helmet with a transverse crest.',
  lateRoman: 'A late Roman soldier: a mail shirt and a ridge helmet of two halves joined along the crown.',
  romanAuxiliary: 'An auxiliary horseman: a mail shirt, a cavalry galea, the long spatha.',
  goth: 'A Visigoth warrior: a tunic and trousers, a round shield; no armour.',
  gothNoble: 'A Visigoth noble: a mail shirt and a spangenhelm of riveted segments.',
  gaziAlp: 'One of Osman\'s gazis: a mail shirt under a coat, a pointed chichak.',
  janissary: 'A Janissary: the dolama coat and the tall felt börk; no armour, all drill.',
  azap: 'An Ottoman azap, a foot archer or marine: a tunic and a turban, unarmoured.',
  saladin: 'Saladin: a kazaghand (a silk-covered coat of mail and padding) over a mail shirt, and the tall pointed turban helmet.',
  cataphract: 'A Parthian cataphract: scale armour from head to foot, a masked helmet, the long kontos.',
  parthianArcher: 'A Parthian horse archer: a tunic and trousers, a felt cap, the composite bow.',
  hun: 'A Hun horseman: a caftan and a fur or felt cap, the bow and the lasso.',
  steppeLight: 'A Mongol light horseman: the deel and a fur hat, no armour.',
  steppeMedium: 'A Mongol horseman in hardened leather lamellar over the deel, a fur hat.',
  kheshig: 'The Khan\'s guard: scale armour and a pointed helmet with an iron face mask.',
  xiongnu: 'A Xiongnu horseman: a felt or leather coat and a fur hat.',
  incaNoble: 'An Inca lord: a woven uncu tunic with tocapu bands, the llautu cord round the head.',
  incaUncu: 'An Inca warrior: the uncu tunic of cotton or wool, the llautu, quilted cotton beneath.',
  mexicaWarrior: 'A Mexica warrior: the ichcahuipilli, quilted cotton armour soaked in brine, and a feather band.',
};
