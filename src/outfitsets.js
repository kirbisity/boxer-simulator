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
      blurb: 'Harness of the German workshops, c. 1480, its sallet sweeping back like a swallow’s tail, a bevor raised to meet it. Made for a man of means who trusted steel to glance the blow. He saw the world only through a narrow slot.',
      patch: { helmet: { mass: 2.4, padding: 0.65, curve: 0.9, face: 'closed' }, protection: { regions: { head: { blunt: 0.62, cut: 1, pierce: 0.94, deflects: true } } } },
    },
    {
      key: 'hounskull', designs: [1, 4], name: 'Milanese harness — hounskull bascinet',
      blurb: 'Milanese plate of c. 1400, crowned by a bascinet drawn out to a snout like a hound’s. The armourers of Lombardy sold such harness to every side of every war. Yet mail at the throat has ever been where the dagger finds its rest.',
      patch: { helmet: { mass: 2.6, padding: 0.7, curve: 0.92, face: 'closed' }, protection: { regions: { head: { blunt: 0.6, cut: 1, pierce: 0.95, deflects: true } } } },
    },
    {
      key: 'closeHelmet', designs: [3], name: 'Late harness — close helmet',
      blurb: 'Harness of the 1520s, the close helmet shut about the whole head and turning upon its gorget. The last flowering of the armourer’s art, worn as the guns grew louder. Its wearer bore the full weight of an age that was ending.',
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
      blurb: 'Coat of the fifteenth-century footman, small plates riveted within cloth, the rivet heads marching in rows. An iron kettle hat shades the face from the blow that falls from above. Such men filled the battle lines, and the burial pits alike.',
      patch: {},
    },
    {
      key: 'brigandineSallet', designs: [1], name: 'Brigandine and German sallet',
      blurb: 'The same riveted coat, crowned by a deep German sallet that guards the nape. A footman who could afford more steel spent it on his head. The world grows narrower through its eye slot.',
      patch: { helmet: { mass: 2.2, padding: 0.45, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } } },
    },
    {
      key: 'brigandineBurgundian', designs: [4], name: 'Brigandine and Burgundian kettle',
      blurb: 'Brigandine beneath a broad Burgundian kettle, deep in the crown, its brim wide as a hat’s. Duke Charles’s footmen wore such at Grandson and Morat, where the Swiss pikes came on. The face is left open to the sky, and to whatever falls from it.',
      patch: { helmet: { mass: 2.3, padding: 0.5, curve: 0.65 }, protection: { regions: { head: { blunt: 0.6, cut: 0.92, pierce: 0.63 } } } },
    },
    {
      key: 'mail', designs: [2], name: 'Mail shirt and kettle hat',
      blurb: 'A haubergeon of riveted rings over a padded jack, the old armour of a thousand years. It turns an edge with a sound like rain. But a point may part the rings, and the weight of a blow passes through.',
      patch: { extraMass: 0.105, protection: { blunt: 0.35, cut: 0.88, pierce: 0.5 }, gaps: null },
    },
    {
      key: 'breastplate', designs: [3], name: 'Breastplate and sallet',
      blurb: 'A munition breastplate, beaten out by the hundred for the arsenals, a German sallet above. One curve of steel stood between the footman and the pike. He cursed its weight on every march, and blessed it once.',
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
      blurb: 'The bowman of the Hundred Years War: a jack of many linen layers and an iron kettle hat. Such men darkened the sky at Crécy and Agincourt. Swift of foot, for little else would save him when the line broke.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.88, pierce: 0.6 } } } },
    },
    {
      key: 'bare', designs: [1], name: 'Archer — jack, bare head',
      blurb: 'The archer’s jack alone, the head bare to wind and rain. Many went thus, for a hat of iron cost what a yeoman could not spare. Nothing stands between his skull and the blow.',
      patch: { extraMass: 0.035, protection: { regions: { head: BARE_HEAD } } },
    },
    {
      key: 'sallet', designs: [3], name: 'Archer — jack and sallet',
      blurb: 'The archer’s jack beneath a plain sallet, the nape and neck in steel. Perhaps it was stripped from a fallen man-at-arms once the field was won. Its new owner never asked whose it had been.',
      patch: { extraMass: 0.046, helmet: { mass: 2.1, padding: 0.4, curve: 0.75 }, protection: { regions: { head: { blunt: 0.52, cut: 0.9, pierce: 0.66 } } } },
    },
  ],
  conquistadorPlate: [
    {
      key: 'morion', designs: [0, 1], name: 'Conquistador — breastplate and morion',
      blurb: 'Harness of the conquest: breastplate and tassets over a doublet, mail at the arms, a combed morion above. Carried across the sea to Tenochtitlan and Cajamarca. It rusted in the tropic damp, as did the men within it.',
      patch: {},
    },
    {
      key: 'cabasset', designs: [2, 4], name: 'Conquistador — breastplate and cabasset',
      blurb: 'The conquistador’s harness beneath a cabasset, its almond crown rising to a little stalk. Spanish smiths beat them out by the thousand for the tercios. The pointed crown would turn a blow, if the blow came from above.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'pot', designs: [3], name: 'VOC pikeman — corselet and pot',
      blurb: 'Corselet and broad pot helmet of a Dutch East India Company pikeman, of the seventeenth century. Shipped out to Batavia and the Spice Islands to hold forts for merchants. Few who sailed east ever sailed home.',
      patch: { extraMass: 0.17, protection: { regions: { head: { blunt: 0.53, cut: 0.91, pierce: 0.78 } } } },
    },
  ],
  conquistadorQuilted: [
    {
      key: 'morion', designs: [0, 2], name: 'Escaupil and morion',
      blurb: 'Escaupil, the quilted cotton armour of the Mexica, two fingers thick, taken up by the very Spaniards it was made to stop. A steel morion rides above. Cool in the heat; the arrow sinks into it, and stays.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.9, pierce: 0.8 } } } },
    },
    {
      key: 'cabasset', designs: [1, 4], name: 'Escaupil and cabasset',
      blurb: 'The quilted escaupil beneath an almond cabasset. Steel at the head, cotton at the heart: the conqueror learned from the conquered what that land demanded. The crown’s point bids a falling blow slide away.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'feltHat', designs: [3], name: 'VOC musketeer — quilted coat, felt hat',
      blurb: 'A Company musketeer in the tropics: a quilted coat and a broad felt hat against the sun. Iron was a torment in that heat, and fever killed more than the spear. He traded steel for breath, and called it wisdom.',
      patch: { extraMass: 0.065, protection: { bullet: { head: 0 }, regions: { head: { blunt: 0.03, cut: 0.05, pierce: 0, deflects: false } } } },
    },
  ],
  ottomanHeavy: [
    {
      key: 'turban', designs: [0, 2], name: 'Sipahi — mail and plate, turban helmet',
      blurb: 'Mail and plate of the Ottoman sipahi, the tall turban helmet fluted to a point, a mail veil drawn across the face. He rode to war at the Sultan’s summons, for the land he held. The rings hide his face; only his deeds remain.',
      patch: { helmet: { mass: 2.4, padding: 0.5, curve: 0.88, face: 'closed' }, protection: { regions: { head: { blunt: 0.5, cut: 0.97, pierce: 0.6, deflects: true } } } },
    },
    {
      key: 'chichak', designs: [1], name: 'Sipahi — mail and plate, chichak',
      blurb: 'The sipahi’s mail and plate beneath a chichak, its sliding nasal and cheek plates leaving the face open. Lighter on the brow, and a wider world to see. Bold men chose it, and some of them lived.',
      patch: { helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
  ],
  samurai: [
    {
      key: 'open', designs: [0, 2], name: 'Ō-yoroi — open kabuto',
      blurb: 'Ō-yoroi, the great box armour of the mounted archer, laced lamellae beneath a riveted kabuto with its broad neck guard. Worn in the Genpei war by men who named their lineage before they loosed. The face is left bare to the enemy.',
      patch: {},
    },
    {
      key: 'menpo', designs: [1, 3, 4], name: 'Ō-yoroi — kabuto and menpo',
      blurb: 'The great armour with an iron menpo over the face, a throat guard hung beneath. The mask wears a scowl its wearer need not. Behind it, none could tell whether the man was young, or afraid.',
      patch: { extraMass: 0.225, protection: { regions: { head: { blunt: 0.68, cut: 0.93, pierce: 0.66 } } } },
    },
  ],
  wokouArmoured: [
    {
      key: 'do', designs: [0], name: 'Wokou — dō-maru',
      blurb: 'A dō-maru of lacquered lamellae, captured or bartered, worn by a pirate of the China coast. The arms are bare, the brow bound only by a hachimaki. The armour remembers another master.',
      patch: { protection: { regions: { head: CLOTH_HEAD } } },
    },
    {
      key: 'sode', designs: [1, 3], name: 'Wokou — dō-maru and sode',
      blurb: 'The pirate’s dō-maru with its sode tied on, broad boards to shield the shoulders. Perhaps taken from a samurai drowned off Ningbo. The sea keeps what it is given.',
      patch: { extraMass: 0.085, protection: { regions: { head: CLOTH_HEAD, UpperArm: { blunt: 0.3, cut: 0.6, pierce: 0.35 } } } },
    },
    {
      key: 'jingasa', designs: [2], name: 'Wokou — dō-maru and iron hat',
      blurb: 'The dō-maru beneath a jingasa, a shallow iron hat that sheds a falling blade as a roof sheds rain. The raiders who burned the Ming coast wore such. Their names are lost; the ashes were not.',
      patch: { extraMass: 0.08, protection: { bullet: { head: 0.15 }, regions: { head: { blunt: 0.35, cut: 0.6, pierce: 0.4 } } } },
    },
  ],
  hunNoble: [
    {
      key: 'mail', designs: [0], name: 'Hun noble — mail and spangenhelm',
      blurb: 'A mail shirt won from Rome or Persia, and a spangenhelm of riveted segments. A Hunnic lord wore the spoils of the empires he humbled. The rings turn an edge, but a point will find its way.',
      patch: {},
    },
    {
      key: 'lamellar', designs: [1], name: 'Hun noble — leather lamellar and spangenhelm',
      blurb: 'Hardened leather lamellae laced in rows, the steppe’s own armour, older than any memory. It bears a blow without complaint, and weighs little upon the horse. Yet leather softens in the rain.',
      patch: { extraMass: 0.1, protection: { blunt: 0.48, cut: 0.75, pierce: 0.45 } },
    },
  ],
  mexicaElite: [
    {
      key: 'jaguar', designs: [0, 2, 4], name: 'Jaguar warrior',
      blurb: 'The jaguar warrior of the Mexica, clad in a jaguar’s hide, his face peering from its wooden jaws. Only a man who had taken captives for the gods might wear it. Many captives climbed the temple steps; in time, so did some of their takers.',
      patch: { protection: { blunt: 0.22, cut: 0.22, pierce: 0.2 } },
    },
    {
      key: 'eagle', designs: [1, 3], name: 'Eagle warrior',
      blurb: 'The other order of the Mexica: a suit of feathers over quilted cotton, an eagle’s beak for a helm. Sworn to the sun, who must be fed. Feathers are light, and turn little.',
      patch: { extraMass: 0.06, protection: { blunt: 0.18, cut: 0.18, pierce: 0.2 } },
    },
  ],
  mingBrigandine: [
    {
      key: 'bell', designs: [0, 2], name: 'Ming brigandine — bell helmet',
      blurb: 'Brigandine of the Ming soldier, iron plates within cloth, gilt rivets in their rows, beneath a bell-shaped helmet with a red tassel. Such men held the Great Wall and the coast. The empire paid them late, when it paid at all.',
      patch: { protection: { regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
    {
      key: 'tube', designs: [1], name: 'Ming brigandine — riveted helmet',
      blurb: 'The brigandine beneath a tall helmet of riveted iron strips, more steel over the crown. A soldier’s pay bought little, so it was likely issued, or inherited. Who wore it first is not recorded.',
      patch: { extraMass: 0.146, helmet: { mass: 1.6, padding: 0.35, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.87, pierce: 0.58 } } } },
    },
    {
      key: 'lamellar', designs: [3, 4], name: 'Ming iron lamellar — pointed helmet',
      blurb: 'Iron lamellae laced in rows, and a plain pointed helmet: an armour older than the dynasty itself. A frontier footman might wear his grandfather’s. The laces rot long before the iron does.',
      patch: { extraMass: 0.15, protection: { blunt: 0.6, cut: 0.83, pierce: 0.5, regions: { head: { blunt: 0.54, cut: 0.86, pierce: 0.6 } } } },
    },
    {
      key: 'scale', designs: [5], name: 'Ming iron scale coat',
      blurb: 'A coat of overlapping iron scales on cloth, beneath the bell helmet. A blade slides along it as a fish slips through the hand. But a point may lift a scale and find what lies beneath.',
      patch: { extraMass: 0.15, protection: { blunt: 0.58, cut: 0.84, pierce: 0.44, regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
  ],
  mingElite: [
    {
      key: 'brigandine', designs: [0, 1], name: 'Ming elite — brigandine, open helm',
      blurb: 'Heavy brigandine of a Ming officer or palace guardsman, steel guards on the arms, a tall narrow helmet crowned with a plume. Worn before the throne in the Forbidden City. The face is left open, as befits a man who must be known.',
      patch: {},
    },
    {
      key: 'brigandineMasked', designs: [2], name: 'Ming elite — brigandine, masked helm',
      blurb: 'The heavy brigandine, the helm bearing a guardian beast’s mask of steel across the face. The beast snarls so the man need not. Those who stood beside the Dragon Throne were not meant to be seen as men.',
      patch: { extraMass: 0.255, protection: { regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'scale', designs: [3], name: 'Ming elite — scale armour, open helm',
      blurb: 'A long coat of steel scales in place of the brigandine, beneath the plumed helm. It shimmered in procession like a carp’s flank. Between scale and scale runs the narrow road a point will travel.',
      patch: { extraMass: 0.26, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7 } },
    },
    {
      key: 'scaleMasked', designs: [4], name: 'Ming elite — scale armour, masked helm',
      blurb: 'Steel scales and the guardian beast’s mask: the full harness of the Ming guard. Heavy as duty, and as hard to set down. When Beijing fell in 1644, some still wore it.',
      patch: { extraMass: 0.265, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7, regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'lamellar', designs: [5], name: 'Ming elite — iron lamellar',
      blurb: 'Iron lamellae laced with crimson cord, beneath the open helm. The cord was dyed for the emperor’s own men. The crimson has faded; the iron endures.',
      patch: { protection: { blunt: 0.62, cut: 0.94, pierce: 0.74 } },
    },
  ],
};

// What each one-set outfit is, for the picker.
export const OUTFIT_BLURBS = {
  boxing: 'Trunks, laced boots and padded gloves, the gear of the prize ring tamed by the Queensberry rules. Nothing guards the body but the man’s own hands. Many who wore them left their senses in the ring.',
  dobok: 'The dobok of taekwondo: white cotton jacket and trousers, the feet bare. Born in Korea after the war, its forms drilled into a generation. Cloth turns nothing; the belt tells only how long one has endured.',
  mma: 'Fight shorts and fingerless gloves, the uniform of the cage. Its fighters learned every art and trusted none. Nothing here is worn to help, and nothing is hidden.',
  sports: 'Running kit of light synthetic cloth, made for speed and nothing else. Its wearer meant only to run the morning road. Fortune, and the road, led somewhere else entirely.',
  sumo: 'The mawashi alone, a heavy silk belt to be gripped and thrown by. The rikishi of Japan grow their bodies for the push, as their forebears did before the shrines. There is no armour but the flesh itself.',
  business: 'A wool suit and leather-soled shoes, the armour of the office. Its wearer meant to do battle only in meetings. Cloth tears, and the soles betray him on the stair.',
  casual: 'A flannel shirt and chinos, clothes for an ordinary day. The wearer expected nothing more of it. Ordinary days have ended worse, and been forgotten sooner.',
  hiking: 'A shell jacket and stout boots, made for wind on a mountain ridge. The soles hold the ground well. Against all else, the wearer stands alone.',
  thug: 'A track jacket and a beanie, the uniform of the street corner. Its wearer has fought before, without rules or witnesses. Fabric only; the rest is nerve.',
  yakuza: 'The back bared to show the irezumi, a lifetime’s ink beneath the skin. The yakuza strips his shirt to fight, that his enemy may see whom he belongs to. Ink is no armour, but it is a vow.',
  victorianGent: 'A frock coat of wool broadcloth and a silk top hat, the dress of a gentleman of the 1860s. Fit for the club, the church and the quarrel after. The hat will not survive the first blow.',
  victorianLady: 'A whalebone corset and the full gown of a Victorian lady. The corset holds the trunk stiff as any breastplate, yet the skirts drag at every step. She was taught to faint; she chose otherwise.',
  rags: 'A torn shirt and bare feet: the beggar, the prisoner, the one forgotten. Whatever he once owned was taken. He has nothing left to lose, which is its own kind of armour.',
  commoner: 'Tunic and hose of wool, the dress of a medieval labourer. Such men tilled the fields that fed the knights who trampled them. When war came, they met it with no armour at all.',
  joan: 'White harness, bright plate from head to foot beneath a crimson huque: the armour of Joan of Arc. Paid for by the Dauphin in 1429 for a peasant girl of Domrémy. She wore it to Orléans, and to her ruin at Rouen.',
  templar: 'Mail hauberk, mittens and chausses beneath the white surcoat of the Poor Knights of the Temple, a flat-topped great helm above. Sworn to poverty, they grew rich. Their last Grand Master burned at Paris in 1314.',
  tournament: 'The Stechzeug, a jousting harness bolted to a frog-mouthed helm of thick steel. Made for the German lists, where a lance struck true could unhorse a prince. On foot, the man inside can scarcely stir.',
  police: 'A patrol uniform, a soft vest of woven aramid beneath it. Made to stop a knife’s thrust or a pistol round on an ordinary shift. A rifle asks a question it cannot answer.',
  riot: 'Riot gear: a padded suit with hard shells over the limbs, a helmet with a full visor. Worn on the line where batons meet bottles. The visor fogs, and the crowd does not end.',
  swat: 'Heavy tactical armour, hard plates over chest and limbs, a sealed visor. Its wearer goes first through doors others flee from. What waits beyond is never known in advance.',
  infantry: 'A modern soldier: a plate carrier with ceramic rifle plates front and back, a combat helmet of aramid. Heir to every breastplate before it. The plates are heavy, and the patrols long.',
  specialForces: 'A special-forces operator: plate carrier and high-cut helmet, stripped to what speed allows. Such men are sent where no one admits to sending them. Lightness is a wager on striking first.',
  proximity: 'The firefighter’s aluminized proximity suit, its silver skin throwing back the furnace’s heat. Made to approach a blaze, not to enter it. Against a fist it is only cloth.',
  fireEntry: 'A fire-entry suit, quilted aluminized layers worn to walk into the flame itself. It grants minutes, no more. Those who wear it count every one.',
  humanoid: 'A full-size humanoid robot, an aluminium frame within white plastic shells. Built in laboratories to walk among us and do our work. No one built it for this.',
  miniHumanoid: 'A small humanoid robot, a bare frame of metal and servos. Made to teach, to dance, to play at football. It is light, and breaks easily, and does not complain.',
  combatBot: 'An armoured combat robot, a rifle and a shotgun where its forearms should be. Its makers gave it no name, only a designation. It does not tire, and it does not grieve.',
  exoArmoured: 'A soldier sealed in armour over a powered exoframe, motors bearing the weight his body could not. Every blow he throws carries more than his own strength. Should the battery fail, he becomes a statue.',
  silverback: 'A silverback gorilla, lord of his troop, clothed in nothing but hide and muscle. He has no armour and needs none. Men have rarely been foolish enough to test him twice.',
  monkeyFur: 'A primate of forest or rock: macaque, baboon or chimpanzee. Fur, sinew and teeth, and a cunning older than ours. It does not fight for honour.',
  kungfu: 'A suit of loose silk, jacket and trousers, cloth shoes on the feet. The dress of the masters of southern China, teaching in their courtyards. Silk will not turn a blow; that is the hands’ work.',
  monk: 'The robe of a Shaolin monk, leggings bound at the shin, the head shaven. At Songshan the monks made fighting a discipline, and once took the field for an emperor. A vow of peace, kept with fists.',
  wuxia: 'Robe and sash of a wandering swordsman of the jianghu, the rivers and lakes of the old tales. He owes allegiance to no lord, only to his code. Such men, it is said, once lived.',
  wokou: 'A pirate of the China coast, in a robe or bare to the waist. Japanese, Chinese and Portuguese alike sailed under that name in the sixteenth century. Armour is a weight the sea does not forgive.',
  guanYu: 'Guan Yu, general of Shu, in a green robe over gilt scale armour and the cap of a Han general. Taken and beheaded by Wu in 220, he was raised a god of war and loyalty. Temples still burn incense to him.',
  hanSoldier: 'A soldier of the Han: an iron lamellar coat over a red robe, a helmet of narrow vertical plates. Such men guarded the Silk Road against the Xiongnu. Their clay likenesses outlived them.',
  hanCavalry: 'A Han horseman in the iron lamellar coat and helmet, cut for the saddle. Emperor Wu sent such riders deep into the steppe to break the Xiongnu. Few came back across the desert.',
  ironPagoda: 'The Iron Pagoda, heavy cavalry of the Jin: iron lamellae from neck to shin, a heavy iron helmet. They rode against the Song like a moving wall. Slow, and terribly hard to kill.',
  mingGarrison: 'A Ming garrison levy: a hemp vest, a sash, a cloth wrapped about the head. Hereditary soldiers, bound to their posts by birth. The state promised them armour; it never came.',
  mingIronLamellar: 'Ming cavalry of the northern border, iron lamellar over a deel, a pointed steppe helmet above. Their armour wore the enemy’s fashion. On the frontier, the line between Ming and Mongol was thin.',
  ashigaru: 'Foot soldier of the Warring States: a lacquered iron dō of horizontal strips and a conical iron jingasa. Lent by his lord, returned by his widow. Thousands like him fell at Nagashino and are named nowhere.',
  oyoroi: 'The ō-yoroi in full: laced lamellae, broad shoulder boards, a kabuto, the great box armour of the mounted archer. Worn by Minamoto and Taira, whose war the biwa singers still mourn. It was made for the saddle and the bow.',
  samuraiTosei: 'Tōsei gusoku, armour of the gun age: a solid plate dō proofed against the musket, a menpo over the face, a kabuto. Forged while Japan was unified by war. Then peace came, and it went to the storehouse.',
  ronin: 'A masterless samurai: cloak and kosode over odd pieces of armour, a straw hat low across the eyes. His lord is dead or disgraced, and his stipend with him. What honour he keeps, he keeps alone.',
  sohei: 'A warrior monk of Mount Hiei or Nara: a white cowl, robes over lamellar armour. For centuries they marched on Kyoto to bend the court. Nobunaga burned their mountain in 1571.',
  hoplomachus: 'The hoplomachus: a brimmed, crested helmet with a grille, quilted leg wraps and tall greaves, a small round shield. He fought as a Greek hoplite fought, for Roman crowds. His was the spear, and the dust.',
  murmillo: 'The murmillo: a broad-brimmed helmet with a fish crest, a manica binding the sword arm, a greave, the great curved shield. Named, it is thought, for a fish of the sea. Paired most often with the thraex, until one of them fell.',
  retiarius: 'The retiarius: no helmet, a galerus at the left shoulder, the net and the trident. The arena’s fisherman, scorned for fighting with his face bare. That face is all the crowd remembers.',
  scissor: 'The scissor: a steel tube over the forearm ending in a crescent blade, mail or scale on the body, a closed helmet. Known from a few carvings and little else. What he did with that blade, the stone does not say.',
  secutor: 'The secutor: a smooth, egg-shaped helmet pierced by two small eyes, made so the trident would slip, and the great shield. Hunter of the net-man. Inside, the air grows thin and the world shrinks to two holes.',
  thraex: 'The thraex: a griffin-crested helmet with a grille, high greaves, a small square shield and the curved sica. Made in the image of Rome’s Thracian foes. The crowd chose sides; so did the dead.',
  maximus: 'A Roman general turned gladiator: a leather cuirass, bracers, no helmet. Once he commanded legions; now he awaits the editor’s thumb. He fights for a name only he remembers.',
  lorarius: 'The lorarius, whip-man of the arena, in an undyed tunic. His task was to drive the reluctant onto the sand. He was never meant to fight, nor to be remembered.',
  commodus: 'The emperor Commodus as Hercules, the lion’s skin over head and back, the club in hand. He fought in the arena hundreds of times, against men who dared not win. He was strangled in his bath on the last day of 192.',
  legionary: 'Legionary of the early Empire: lorica segmentata of iron bands, an Imperial Gallic helmet. Such men marched from the Rhine to the Euphrates. Pieces of their armour lie yet in the earth at Kalkriese.',
  republicanLegionary: 'Legionary of the Republic: a lorica hamata of mail and a bronze Montefortino helmet. Such men broke Hannibal at Zama, and Carthage after. The rings turn an edge; the bronze, a stone.',
  centurion: 'A centurion: mail hung with phalerae, greaves, a helmet with a transverse crest so his men might find him. He stood in the front rank, and died there more often than the rest. The medals were for those who lived.',
  lateRoman: 'A late Roman soldier: a mail shirt and a ridge helmet of two halves joined along the crown. Made quickly, in state workshops, for an empire under siege. Such men watched the frontier break.',
  romanAuxiliary: 'An auxiliary horseman: a mail shirt, a cavalry galea, the long spatha. No citizen, but he would be one after twenty-five years. Many served their time; fewer lived to see the bronze diploma.',
  goth: 'A Visigoth warrior: tunic and trousers, a round shield, no armour. His people crossed the Danube fleeing the Huns, and sacked Rome in 410. Wealth enough for mail was rare among them.',
  gothNoble: 'A Visigoth noble: a mail shirt and a spangenhelm of riveted segments. His kind carved a kingdom from Roman Spain. It fell to the Moors in 711, all at once.',
  gaziAlp: 'One of Osman’s gazis: a mail shirt beneath a coat, a pointed chichak. Frontier raiders who carved a beylik from Byzantium’s fraying edge. From so small a band, an empire grew.',
  janissary: 'A Janissary: the dolama coat and the tall felt börk, and no armour. Taken as a boy in the devshirme, raised for the Sultan alone. Drill was his armour; in 1826 a Sultan destroyed them all.',
  azap: 'An Ottoman azap, foot archer or marine: tunic and turban, unarmoured. Sent first against the walls and onto the galleys. Their dead filled the ditches the Janissaries crossed.',
  saladin: 'Saladin, Sultan of Egypt and Syria: a kazaghand of silk over mail and padding, the tall pointed turban helmet. He took Jerusalem back in 1187. Even his enemies wrote of his mercy.',
  cataphract: 'A Parthian cataphract: scale armour from head to foot, a masked helmet, the long kontos. At Carrhae the legions of Crassus broke beneath such riders. Within the iron, the man is faceless, and stifling.',
  parthianArcher: 'A Parthian horse archer: tunic and trousers, a felt cap, the composite bow. He loosed even as he turned to flee, and the world still names the trick for him. Armour would only slow the horse.',
  hun: 'A Hun horseman: a caftan, a cap of fur or felt, the bow and the lasso. They rode out of the steppe and Rome trembled. Attila died on his wedding night, and soon they were gone.',
  steppeLight: 'A Mongol light horseman: the deel and a fur hat, no armour. He rode with a string of remounts and lived on what they gave. Speed was his only shield.',
  steppeMedium: 'A Mongol horseman in hardened leather lamellar over the deel, a fur hat on his head. Such riders crossed from Korea to the Danube within a lifetime. Leather is light, and the steppe is wide.',
  kheshig: 'The Kheshig, the Khan’s own guard: scale armour and a pointed helmet with an iron face mask. Sons of the great families, sworn to the Khan’s tent by day and by night. The mask betrays nothing of who lies beneath.',
  xiongnu: 'A Xiongnu horseman: a coat of felt or leather and a fur hat. The northern scourge against whom the first walls were raised. Their kurgans keep their gold, and their silence.',
  incaNoble: 'An Inca lord: a woven uncu tunic banded with tocapu, the llautu cord about his head. Those squares may be a writing no one now can read. At Cajamarca in 1532, the lords fell beside their king.',
  incaUncu: 'An Inca warrior: an uncu tunic of cotton or wool, the llautu, quilted cotton beneath. He served the Sapa Inca in war as his labour owed. The empire ran the length of the Andes; its armour was cloth.',
  mexicaWarrior: 'A Mexica warrior in the ichcahuipilli, quilted cotton armour stiffened with brine, a feather band at the brow. He fought to capture, not to kill, for the gods required the living. The Spaniards took his armour for their own.',
};

// The helmet slot (outfits.js helmChoices): a kit's helm worn with another kit, named by its head piece (outfits.js helmKey:
// the head's kind, its design or style after a colon, '+mask' with a face mask). A helm not named here takes its set's name.
export const HELM_NAMES = {
  'bascinet:sallet': 'Sallet and bevor', 'bascinet:hounskull': 'Hounskull bascinet', 'bascinet:closeHelmet': 'Close helmet',
  greatHelm: 'Great helm',
  'kettleHat:a': 'Kettle hat', 'kettleHat:b': 'Burgundian kettle hat', 'kettleHat:c': 'German sallet',
  morion: 'Morion', 'cabasset:spanish': 'Cabasset', potHelmet: 'Pot helmet',
  kabuto: 'Kabuto', 'kabuto+mask': 'Kabuto and menpo', jingasa: 'Jingasa (iron hat)',
  jaguarHelm: 'Jaguar helmet', eagleHelm: 'Eagle helmet',
  'mingHat:yongBell': 'Ming bell helmet', 'mingHat:rivetedTube': 'Ming riveted helmet', 'mingHat:plainPoint': 'Ming pointed helmet',
  mingHelm: 'Ming elite helmet', 'mingHelm+mask': 'Ming elite helmet and mask', pagodaHelm: 'Iron Pagoda helmet', hanHelm: 'Han lamellar cap',
  steppeHelm: 'Steppe helmet', 'steppeHelm+mask': 'Steppe helmet and face mask', spangenhelm: 'Spangenhelm',
  'chichak:turban': 'Turban helmet', chichak: 'Chichak',
  'arenaHelm:hoplomachus': 'Hoplomachus helmet', 'arenaHelm:murmillo': 'Murmillo helmet', 'arenaHelm:secutor': 'Secutor helmet',
  'arenaHelm:thraex': 'Thraex helmet', 'arenaHelm:scissor': 'Scissor helmet',
  galea: 'Galea', ridgeHelm: 'Ridge helmet', montefortino: 'Montefortino',
  riotHelmet: 'Riot helmet', opsHelmet: 'Combat helmet', proximityHood: 'Proximity hood',
};
