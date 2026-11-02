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
      blurb: 'Gothic harness of the German workshops, c. 1480, fluted like frost on a window, its sallet sweeping back to a swallow’s tail and a bevor raised to meet the chin. Augsburg and Landshut sent such steel to any lord who could pay.\nAt Nancy in 1477 Charles the Bold rode out in harness much like it. His body was found days later in a frozen pond, the skull cloven by a halberd, the face so gnawed by wolves that only his physician knew him.\nSteel to glance every blow, and a slot too narrow to see the one that mattered.',
      patch: { helmet: { mass: 2.4, padding: 0.65, curve: 0.9, face: 'closed' }, protection: { regions: { head: { blunt: 0.62, cut: 1, pierce: 0.94, deflects: true } } } },
    },
    {
      key: 'hounskull', designs: [1, 4], name: 'Milanese harness — hounskull bascinet',
      blurb: 'Milanese plate of c. 1400, smooth and rounded as river stone, crowned by a bascinet drawn out to a hound’s snout and pierced for breath, a mail aventail at the throat. The Missaglia of Milan sold such harness to every side of every war.\nAt Agincourt in 1415 the French chivalry came on in bascinets like these through ploughed mud to the knee. They fell in heaps and smothered beneath one another, and the archers went among them with mallets and knives slipped through the visors.\nThe snout breathes for the man, until the mud is in it.',
      patch: { helmet: { mass: 2.6, padding: 0.7, curve: 0.92, face: 'closed' }, protection: { regions: { head: { blunt: 0.6, cut: 1, pierce: 0.95, deflects: true } } } },
    },
    {
      key: 'closeHelmet', designs: [3], name: 'Late harness — close helmet',
      blurb: 'Harness of the 1520s, the close helmet shut about the whole head and turning upon its gorget, visor and bevor folding together like a closed hand. The last flowering of the armourer’s art, fluted and blued for Maximilian’s court and his heirs.\nAt Pavia in 1525 the flower of French chivalry charged in such harness, and Spanish arquebusiers shot them from the hedges and the woods. King Francis was dragged from beneath his fallen horse and led away a prisoner, to sign whatever Spain put before him.\nThe finest helmet ever made, perfected just in time to hear the guns.',
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
      blurb: 'Coat of the fifteenth-century footman: small iron plates riveted within canvas or faded velvet, the rivet heads marching in rows down the breast. An iron kettle hat shades the face, its brim shedding blows that fall from above.\nAt Towton in 1461, in a snowstorm on Palm Sunday, such men hewed at one another from morning until dark. The grave pits opened five centuries later held skulls cleft again and again, long after the first wound would have been enough.\nThe brim turns the rain and the falling blade. It was never asked about the tenth.',
      patch: {},
    },
    {
      key: 'brigandineSallet', designs: [1], name: 'Brigandine and German sallet',
      blurb: 'The same riveted coat, crowned by a deep German sallet that sweeps low over the nape, an eye slot cut across its brow. A footman who could afford more steel spent it on his head, for the head was where the poleaxes went.\nThe Landsknechte wore such kit as they sold themselves to emperor, king and pope in turn. In 1527, their wages years in arrears, the emperor’s own army sacked Rome, tortured priests for their plate, and stabled horses in the Vatican.\nFaith in steel lasts exactly as long as the wages do.',
      patch: { helmet: { mass: 2.2, padding: 0.45, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } } },
    },
    {
      key: 'brigandineBurgundian', designs: [4], name: 'Brigandine and Burgundian kettle',
      blurb: 'Brigandine beneath a broad Burgundian kettle, deep in the crown, its brim wide as a farmer’s hat. The livery of Charles the Bold’s ordonnance companies, the most modern army of its day, drilled, uniformed and paid on time.\nAt Grandson and Morat in 1476 the Swiss pike squares came on like walking forests. At Morat the Burgundian line broke, and thousands were driven into the lake, where the iron that had kept them alive held them down.\nA brim to keep off the sky. Nothing keeps off the lake.',
      patch: { helmet: { mass: 2.3, padding: 0.5, curve: 0.65 }, protection: { regions: { head: { blunt: 0.6, cut: 0.92, pierce: 0.63 } } } },
    },
    {
      key: 'mail', designs: [2], name: 'Mail shirt and kettle hat',
      blurb: 'A haubergeon of riveted rings over a padded jack, each ring closed by hand, tens of thousands to a shirt. The old armour, worn by Roman, Viking and crusader long before anyone dreamed of plate.\nBy the fifteenth century it was a poor man’s inheritance, patched with rings from a dozen dead men’s shirts and rolled in barrels of sand to scour the rust. It turned an edge with a sound like rain, but a bodkin parted the links as fingers part a curtain.\nA thousand years of armour, mended by the last man who died in it.',
      patch: { extraMass: 0.105, protection: { blunt: 0.35, cut: 0.88, pierce: 0.5 }, gaps: null },
    },
    {
      key: 'breastplate', designs: [3], name: 'Breastplate and sallet',
      blurb: 'A munition breastplate beaten out by the hundred for the arsenals, plain and unfiled, a German sallet above. One curve of steel between the footman and the pike, strapped over a doublet that stank of a season’s marching.\nAt Bicocca in 1522 the Swiss charged across a sunken road into four ranks of Spanish arquebusiers. Lead pierced plate and man together; three thousand fell in half an hour, and the Swiss never again trusted the push of pike so blindly.\nProof against the pike. Merely a promise to the bullet.',
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
      blurb: 'The bowman of the Hundred Years War: a jack of many linen layers quilted tight, an iron kettle hat, a sheaf of arrows at the belt and a yew stave taller than he was. Such men darkened the sky over Crécy and Agincourt.\nThe French, it was said, cut two fingers from every archer they took, so he might never draw again. The English, legend holds, raised those two fingers across the field in answer, and loosed until the knights stopped coming.\nEverything he owned that mattered fit on two fingers.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.88, pierce: 0.6 } } } },
    },
    {
      key: 'bare', designs: [1], name: 'Archer — jack, bare head',
      blurb: 'The archer’s jack alone, linen quilted thick as a mattress, the head bare to wind and rain. A yeoman’s son on sixpence a day, who could not spare the price of a hat of iron, and trusted his stakes instead.\nAt Patay in 1429 the English archers were caught before they could drive their stakes. The French horse found them hiding in a hedgerow, and the bowmen whose fathers had won Agincourt died in the open without loosing a volley worth the name.\nWithout his stakes, he was only a man in a quilt.',
      patch: { extraMass: 0.035, protection: { regions: { head: BARE_HEAD } } },
    },
    {
      key: 'sallet', designs: [3], name: 'Archer — jack and sallet',
      blurb: 'The archer’s jack beneath a plain sallet, nape and neck in good steel, too fine a helmet by far for a yeoman’s purse. It sits a little loose, and the lining is stained.\nIt came from the field. When the slaughter was done the archers went among the heaped dead with knives, stripping the fallen men-at-arms of whatever could be carried. The heralds counted the noble dead with care; nobody counted what was taken from them.\nIt fit him well enough. Its first owner had no further use for it.',
      patch: { extraMass: 0.046, helmet: { mass: 2.1, padding: 0.4, curve: 0.75 }, protection: { regions: { head: { blunt: 0.52, cut: 0.9, pierce: 0.66 } } } },
    },
  ],
  conquistadorPlate: [
    {
      key: 'morion', designs: [0, 1], name: 'Conquistador — breastplate and morion',
      blurb: 'Harness of the conquest: breastplate and tassets over a padded doublet, mail at the arms, a combed morion riding high. Carried from the forges of Toledo across the sea to Tenochtitlan and Cajamarca, and rusting the whole way.\nOn the Noche Triste of 1520, fleeing Tenochtitlan along the broken causeways, Cortés’ men stuffed their breastplates with the city’s gold. Those who carried the most sank in the canals, held under by the very metal they had crossed an ocean to find.\nIron and gold weigh the same in deep water.',
      patch: {},
    },
    {
      key: 'cabasset', designs: [2, 4], name: 'Conquistador — breastplate and cabasset',
      blurb: 'The conquistador’s harness beneath a cabasset, its almond crown rising to a little stalk. Spanish smiths beat them out by the thousand for the tercios, plain and quick and cheap, and they went wherever Spain sent its sons.\nFrancisco Pizarro took an empire in such iron with a hundred and sixty-eight men. In 1541 his own countrymen, followers of the Almagro he had executed, ran him through in his house at Lima; he traced a cross in his blood, it is said, and kissed it.\nIt turned every Inca blade, and waited for the Spanish ones.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'pot', designs: [3], name: 'VOC pikeman — corselet and pot',
      blurb: 'Corselet and broad pot helmet of a Dutch East India Company pikeman, seventeenth century, the steel blackened against rust, the brim turned down against a sun that never set on the Company’s ledgers.\nShipped to Batavia to hold forts for merchants, such men were sent to the Banda Islands in 1621, where Jan Pieterszoon Coen had the islanders slaughtered, starved or enslaved so that the Company alone might own the nutmeg.\nA soldier’s iron, polished for a grocer’s war.',
      patch: { extraMass: 0.17, protection: { regions: { head: { blunt: 0.53, cut: 0.91, pierce: 0.78 } } } },
    },
  ],
  conquistadorQuilted: [
    {
      key: 'morion', designs: [0, 2], name: 'Escaupil and morion',
      blurb: 'Escaupil, the quilted cotton armour of the Mexica, two fingers thick and stiffened in brine, taken up by the very Spaniards it was made to stop. A steel morion rides above it, hot as a skillet by noon.\nWithin a season Cortés’ men had thrown off their roasting steel for it. The arrows of Tlaxcala and Tenochtitlan sank in and hung there trembling, while the cotton drank the sweat of the man who had come to conquer its makers.\nHe crossed an ocean to defeat these people, and dressed as one of them.',
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.9, pierce: 0.8 } } } },
    },
    {
      key: 'cabasset', designs: [1, 4], name: 'Escaupil and cabasset',
      blurb: 'The quilted escaupil beneath an almond cabasset: steel at the head, cotton at the heart. A soldier’s bargain between Toledo and the tropics, stitched for him by native hands.\nHernando de Soto’s men wore such kit through the swamps of La Florida from 1539, burning towns in search of a gold that was never there. When fever took de Soto in 1542, they sank him in the Mississippi by night, lest the natives learn the child of the sun could die.\nCotton stops an arrow. It was never asked to stop the river.',
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'feltHat', designs: [3], name: 'VOC musketeer — quilted coat, felt hat',
      blurb: 'A Company musketeer in the tropics: a quilted coat and a broad felt hat against the sun, the bandolier of powder charges rattling at his breast. Iron was a torment in that heat, and he left it in the fort.\nBatavia’s canals bred fever, and the Company buried its soldiers faster than its ships could bring them. Of every hundred men who sailed east, it is reckoned, fewer than half ever saw Holland again, and none of them were paid for the voyage home.\nHe traded steel for breath, and the air itself betrayed him.',
      patch: { extraMass: 0.065, protection: { bullet: { head: 0 }, regions: { head: { blunt: 0.03, cut: 0.05, pierce: 0, deflects: false } } } },
    },
  ],
  ottomanHeavy: [
    {
      key: 'turban', designs: [0, 2], name: 'Sipahi — mail and plate, turban helmet',
      blurb: 'Mail and plate of the Ottoman sipahi, the tall turban helmet fluted to a point and etched with verses of the Qur’an, a mail veil drawn across the face. He held his timar, its land and harvest, so long as he answered the Sultan’s summons.\nAt Vienna in 1683 the sipahis watched the Winged Hussars pour down the Kahlenberg into their camp. The Grand Vizier who had led them there was strangled with a silk cord at Belgrade that Christmas, by the Sultan’s order, for losing.\nThe verses on the crown pray for victory. They do not say for whom.',
      patch: { helmet: { mass: 2.4, padding: 0.5, curve: 0.88, face: 'closed' }, protection: { regions: { head: { blunt: 0.5, cut: 0.97, pierce: 0.6, deflects: true } } } },
    },
    {
      key: 'chichak', designs: [1], name: 'Sipahi — mail and plate, chichak',
      blurb: 'The sipahi’s mail and plate beneath a chichak, its sliding nasal and hinged cheek plates leaving the face bare to the wind. Lighter on the brow, a wider world to see, the favoured helm of horsemen from Cairo to the Crimea.\nAt Mohács in 1526 the Hungarian knights broke upon the Ottoman guns in an afternoon. Young King Louis, fleeing the field, fell from his horse into a swollen stream and drowned beneath his armour, and the sipahis rode on to Buda.\nBetter to see the blow coming, said the bold. Some of them lived to say it twice.',
      patch: { helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
  ],
  samurai: [
    {
      key: 'open', designs: [0, 2], name: 'Ō-yoroi — open kabuto',
      blurb: 'Ō-yoroi, the great box armour of the mounted archer: lacquered lamellae laced in silk, a riveted kabuto with its flaring neck guard, the face left bare. Worn in the Genpei war by men who called out their lineage before they loosed.\nAt Dan-no-ura in 1185 the Taira lost the war on the sea. The child emperor Antoku was carried beneath the waves in his grandmother’s arms, and Taira warriors leapt after him, one, it is said, in two suits of armour, that he might sink the faster.\nMade for the saddle and the bow. Used, at the last, as ballast.',
      patch: {},
    },
    {
      key: 'menpo', designs: [1, 3, 4], name: 'Ō-yoroi — kabuto and menpo',
      blurb: 'The great armour with an iron menpo over the face, its lacquered lips drawn back in a scowl beneath a horsehair moustache, a throat guard hung below. The mask wears a fury its wearer need not feel.\nBehind such iron no one could tell whether the man was young, or afraid. So after the battle the heads of the slain were washed, their hair dressed, and shown to the victorious lord on a board with a label, that he might know at last whose face it had been.\nThe mask has one expression. The head beneath had many, and only the last was recorded.',
      patch: { extraMass: 0.225, protection: { regions: { head: { blunt: 0.68, cut: 0.93, pierce: 0.66 } } } },
    },
  ],
  wokouArmoured: [
    {
      key: 'do', designs: [0], name: 'Wokou — dō-maru',
      blurb: 'A dō-maru of lacquered lamellae, wrapped about the body and tied at the right side: a retainer’s armour, captured or bartered, worn now by a pirate of the China coast. The arms are bare, the brow bound only by a hachimaki.\nIn 1555 a band of perhaps seventy such raiders landed in Zhejiang and marched inland all the way to the walls of Nanjing, killing thousands as they went, while garrisons ten times their number shut their gates and waited.\nThe armour remembers another master, and is not particular.',
      patch: { protection: { regions: { head: CLOTH_HEAD } } },
    },
    {
      key: 'sode', designs: [1, 3], name: 'Wokou — dō-maru and sode',
      blurb: 'The pirate’s dō-maru with its sode tied on, broad lacquered boards hanging from the shoulders like shuttered doors. Plunder from a better man, laced up again with mismatched cord.\nQi Jiguang drilled his peasant recruits to meet such raiders in the mandarin duck formation, shield and many-tipped bamboo spear together. At Taizhou in 1561 the wokou fell in their hundreds, and few who sailed that spring ever saw their islands again.\nBorrowed boards for a borrowed life. The sea collects on both.',
      patch: { extraMass: 0.085, protection: { regions: { head: CLOTH_HEAD, UpperArm: { blunt: 0.3, cut: 0.6, pierce: 0.35 } } } },
    },
    {
      key: 'jingasa', designs: [2], name: 'Wokou — dō-maru and iron hat',
      blurb: 'The dō-maru beneath a jingasa, a shallow iron hat that sheds a falling blade as a roof sheds rain. The cheapest helm in Japan, worn by men who expected to be struck from above, and rarely from anywhere else.\nWang Zhi, greatest of the pirate lords, was lured ashore in 1557 by the governor Hu Zongxian’s promise of pardon and open trade. He was held two years and beheaded, and his men went on burning the coast without him.\nA roof for the head, and no walls at all.',
      patch: { extraMass: 0.08, protection: { bullet: { head: 0.15 }, regions: { head: { blunt: 0.35, cut: 0.6, pierce: 0.4 } } } },
    },
  ],
  hunNoble: [
    {
      key: 'mail', designs: [0], name: 'Hun noble — mail and spangenhelm',
      blurb: 'A mail shirt won from Rome or Persia, and a spangenhelm of riveted segments, its brow band gilt, its cheek pieces hanging loose. A Hunnic lord wore the spoils of the empires he humbled, and smelt of horse beneath them.\nConstantinople paid his king in gold by the hundredweight to stay north of the Danube. When Attila was gone his sons quarrelled over the subject peoples like heirs over cattle; at the Nedao in 454 those peoples rose, and Ellac, the eldest, fell among the dead.\nTribute bought the shirt. Nothing could buy the men who had paid it.',
      patch: {},
    },
    {
      key: 'lamellar', designs: [1], name: 'Hun noble — leather lamellar and spangenhelm',
      blurb: 'Hardened leather lamellae laced in rows on rawhide cord, the steppe’s own armour, older than any memory: boiled and shaped by firelight in the winter camps, light on the horse and quiet in the saddle.\nOn the Catalaunian Plains in 451 the horde met Aetius and the Goths, and by nightfall Attila was penned in his wagon ring. He had the saddles heaped into a pyre, the story goes, meaning to burn himself upon it rather than be taken alive.\nLight enough to ride to the end of the world, and to the pyre built of saddles.',
      patch: { extraMass: 0.1, protection: { blunt: 0.48, cut: 0.75, pierce: 0.45 } },
    },
  ],
  mexicaElite: [
    {
      key: 'jaguar', designs: [0, 2, 4], name: 'Jaguar warrior',
      blurb: 'The jaguar warrior of the Mexica, clad in a spotted suit over quilted cotton, his face peering from the open jaws of a wooden helm. Only a man who had taken four captives for the gods might wear the skin of the night’s hunter.\nMany captives climbed the temple steps to the stone. In 1520, at the feast of Toxcatl, Pedro de Alvarado’s men barred the gates of the sacred precinct and cut down the dancing warriors in their finery, drum by drum, until the dancing stopped.\nHe dressed as the hunter. He died at a dance.',
      patch: { protection: { blunt: 0.22, cut: 0.22, pierce: 0.2 } },
    },
    {
      key: 'eagle', designs: [1, 3], name: 'Eagle warrior',
      blurb: 'The other order of the Mexica: a suit of feathers over quilted cotton, an eagle’s open beak for a helm, the warrior’s face within its throat. Sworn to the sun, who must be fed with hearts to rise each morning.\nCuauhtémoc, whose name means descending eagle, held Tenochtitlan through the siege of 1521 until hunger and smallpox had emptied it. Cortés burned his feet with oil to find the lost gold, and hanged him on the long road to Honduras.\nFeathers to fly to the sun. The sun took them, and the rest.',
      patch: { extraMass: 0.06, protection: { blunt: 0.18, cut: 0.18, pierce: 0.2 } },
    },
  ],
  mingBrigandine: [
    {
      key: 'bell', designs: [0, 2], name: 'Ming brigandine — bell helmet',
      blurb: 'An armoured vest of cotton, bound by iron rivets. Beneath lies a mosaic of hardened steel plates, flexible and strong against every weapon of its age, even firearms — last resort of the foot soldiers sent on the emperor’s errand.\nYet as rations dried up, quartermasters quietly pried the iron from within. Countless wretched souls marched into the meat grinder unaware their armour was merely a hollow shell.\nA peasant’s fortress, or a pre-stitched shroud. It all depended on how hungry the quartermaster was that morning.',
      patch: { protection: { regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
    {
      key: 'tube', designs: [1], name: 'Ming brigandine — riveted helmet',
      blurb: 'A tall helmet of riveted iron strips above the cotton vest and its hidden mosaic of plates, more steel on the crown than the bell helmet gives. The vest is a quilt of secrets; the helmet, a stockade for all to see.\nThe arsenals counted helmets by the head, and heads are easy to count. The plates sewn out of sight were not, and quartermasters sold them to the smiths by the catty. Many marched north to the Wall with an honest crown and a hollow chest.\nThe iron that shows is the iron that stays.',
      patch: { extraMass: 0.146, helmet: { mass: 1.6, padding: 0.35, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.87, pierce: 0.58 } } } },
    },
    {
      key: 'lamellar', designs: [3, 4], name: 'Ming iron lamellar — pointed helmet',
      blurb: 'Iron lamellae laced in rows beneath a plain pointed helmet: an armour older than the dynasty, every plate in plain sight. A frontier footman might march in his grandfather’s, mended with his father’s cord.\nNo quartermaster could hollow this one, so the lacing was skimped instead, left to rot in the wet season. In Korea in 1593, at Byeokjegwan, Ming footmen met Hideyoshi’s swordsmen in the thawing mud, and sodden cords let go like old promises.\nHonest iron, held together by dishonest string.',
      patch: { extraMass: 0.15, protection: { blunt: 0.6, cut: 0.83, pierce: 0.5, regions: { head: { blunt: 0.54, cut: 0.86, pierce: 0.6 } } } },
    },
    {
      key: 'scale', designs: [5], name: 'Ming iron scale coat',
      blurb: 'A coat of overlapping iron scales on cloth beneath the bell helmet, each scale a fish’s, the whole a river running down the chest. A blade slides along it as a carp slips through the hand.\nCostlier than brigandine, it was the first thing a starving garrison sold. At Sarhu in 1619 the Ming marched on Nurhaci in four columns and were destroyed one by one, and the Manchu bannermen stripped the scales from the dead and wore them home.\nThe fish changes rivers and never asks whose.',
      patch: { extraMass: 0.15, protection: { blunt: 0.58, cut: 0.84, pierce: 0.44, regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
  ],
  mingElite: [
    {
      key: 'brigandine', designs: [0, 1], name: 'Ming elite — brigandine, open helm',
      blurb: 'Heavy brigandine of a Ming officer or palace guardsman, faced in velvet and studded with gilt, steel guards on the arms, a tall narrow helmet crowned with a plume. Worn before the throne in the Forbidden City, the face left open, as befits a man who must be known.\nThe Embroidered Uniform Guard wore the emperor’s favour as well as his armour. They arrested ministers at dawn, beat them with staves before the assembled court, and in their prisons confessions came easily.\nAn open face, so the condemned would know whom to fear.',
      patch: {},
    },
    {
      key: 'brigandineMasked', designs: [2], name: 'Ming elite — brigandine, masked helm',
      blurb: 'The heavy brigandine beneath a helm bearing a guardian beast’s mask of steel, fangs bared across the face, eyes of hollow shadow. The beast snarls so the man need not.\nThose who stood beside the Dragon Throne were not meant to be seen as men. When the eunuch Wei Zhongxian ruled the court in the 1620s, it mattered little whose face was behind the mask, so long as it was turned the right way.\nThe beast bares its fangs on command. So did the man.',
      patch: { extraMass: 0.255, protection: { regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'scale', designs: [3], name: 'Ming elite — scale armour, open helm',
      blurb: 'A long coat of steel scales in place of the brigandine, burnished and gilt at the edges, beneath the plumed helm. In procession it shimmered like a carp’s flank in the palace moat.\nIt glittered at every parade of the Wanli Emperor, who would not hold court for some twenty-five years. The guards stood in their shining scales before an empty hall while ministers went unappointed and the frontier rotted beyond the gate.\nSplendour is easiest kept when nothing is asked of it.',
      patch: { extraMass: 0.26, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7 } },
    },
    {
      key: 'scaleMasked', designs: [4], name: 'Ming elite — scale armour, masked helm',
      blurb: 'Steel scales and the guardian beast’s mask: the full harness of the Ming guard, heavy as duty and as hard to set down. Not a finger’s width of the man is left to the eye.\nIn the spring of 1644 Li Zicheng’s rebels came through the gates of Beijing. The Chongzhen Emperor climbed Coal Hill behind the palace and hanged himself from a tree, and the masked guards found there was no one left to guard.\nThe mask outlasted the face it hid, and the dynasty it served.',
      patch: { extraMass: 0.265, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7, regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'lamellar', designs: [5], name: 'Ming elite — iron lamellar',
      blurb: 'Iron lamellae laced with crimson cord beneath the open helm, the cord dyed for the emperor’s own men, the plates blued and bright. An old armour, kept for its colour as much as its strength.\nWhen the young Zhengtong Emperor rode north against the Oirat in 1449, his guard went with him in crimson. At Tumu, short of water and badly led, the army was cut to pieces; the emperor was taken alive, and his guardsmen were not.\nThe crimson has faded, and so has every name it was dyed to honour.',
      patch: { protection: { blunt: 0.62, cut: 0.94, pierce: 0.74 } },
    },
  ],
};

// What each one-set outfit is, for the picker.
export const OUTFIT_BLURBS = {
  boxing: 'Trunks, laced boots and padded gloves, the kit of the prize ring tamed by the Marquess of Queensberry’s rules in 1867. Nothing guards the body but the man’s own fists, wrapped in horsehair and leather.\nThe gloves were meant to spare the hand, and did. Spared, it struck harder and more often, and the brain within the skull paid the difference. Old champions shuffled and slurred through their last years, punch-drunk, the crowd long gone home.\nMercy for the knuckles. None for the mind.',
  dobok: 'The dobok of taekwondo: white cotton jacket and trousers, a coloured belt knotted twice, the feet bare on the mat. Born in South Korea after the war, its forms drilled into conscripts by the regiment.\nKorean instructors carried the art to Vietnam in the 1960s and taught it to soldiers who would soon be fighting with rifles, not feet. The white cloth went to war, and the forms were practised in camps where the dead were counted every morning.\nCloth turns nothing. The belt measures only how long one has endured.',
  mma: 'Fight shorts and fingerless gloves of thin padding, the uniform of the cage. Its fighters learned every art and trusted none: the wrestler’s clinch, the boxer’s jab, the strangler’s patience.\nThe first tournaments of the 1990s were sold as having no rules at all. The purses were small and the risk was whole, and many of the men who built the sport now struggle to remember the nights they built it.\nNothing is hidden here. That was the promise, and the price.',
  sports: 'Running kit of light synthetic cloth, wicking and bright, shoes cushioned with foam for the long road. Made for speed and nothing else; the whole of it weighs less than a loaf of bread.\nIts wearer laced up for the morning loop, earbuds in, thinking of nothing at all. Fortune, and the road, led somewhere else entirely, and the reflective strips caught a light he never saw coming.\nDressed to flee, and caught all the same.',
  sumo: 'The mawashi alone: a band of heavy silk, metres long, wound tight about the hips to be gripped and thrown by. The rikishi of Japan grow their bodies for the push, as their forebears did before the shrines of the old gods.\nIn the stables the young are fed and beaten into mass by their seniors, and some have died of it. The old wrestlers, retired, carry their bulk into hearts and joints that give out decades before their neighbours’.\nNo armour but the flesh, and the flesh sends its bill late.',
  business: 'A wool suit and leather-soled shoes, a silk tie knotted at the throat: the armour of the office, cut to signal rank and nothing more. Its wearer meant to do battle only in meetings.\nGenerations of men have worn it to the trading floor and the boardroom, and in the crash of 1929, so the story goes, out of the window. The suit was pressed. The ledger was not.\nThe tie is a noose with a pattern on it, and the soles betray him on the stair.',
  casual: 'A flannel shirt and chinos, clothes for an ordinary day: an errand, a coffee, a walk to the car. Soft cotton worn thin at the cuffs, chosen for comfort and nothing else.\nThe wearer expected nothing more of the day. The crime pages are full of people who expected the same, and whose last photograph shows them dressed exactly so, smiling at something just out of frame.\nOrdinary days have ended worse, and been forgotten sooner.',
  hiking: 'A shell jacket of taped nylon and stout leather boots with lugged soles, made for wind on a mountain ridge. It sheds rain, holds heat, and grips the scree.\nThe mountains keep their own register: walkers in kit just like this, found in spring below the cornice, or never found at all, a bright jacket fading on a ledge no one can reach.\nThe boots hold the ground. The ground does not always hold.',
  thug: 'A track jacket, a beanie pulled low, trainers scuffed at the toe: the uniform of the street corner, cheap and easy to throw away. Its wearer has fought before, without rules or witnesses.\nThe estate raised him to it, and the estate will bury him from it. The knife he carries is meant for respect, and most often ends in a friend’s chest, or his own, on a stairwell that smells of rain.\nFabric only. The rest is nerve, and nerve runs out.',
  yakuza: 'The back bared to show the irezumi, a lifetime’s ink pricked by hand with needles of steel and bamboo: carp, dragon and peony, a full suit ending at wrist and collar so a shirt might hide it.\nThe yakuza strips to fight that his enemy may see whom he belongs to. And when he fails his oyabun, he cuts the top joint from his own little finger and offers it, wrapped in cloth, with a bow.\nInk is no armour. It is a contract with no clause for leaving.',
  victorianGent: 'A frock coat of wool broadcloth, a starched collar and a silk top hat, the dress of a gentleman of the 1860s. Fit for the club, the church, and the quarrel after.\nThe same coat walked the fog of Whitechapel and the dens of Limehouse, and its pockets held the dividends of the mills and the opium trade. The gentleman’s hands stayed clean because other hands, many of them small, did not.\nThe hat will not survive the first blow. The manners will not survive the second.',
  victorianLady: 'A whalebone corset laced tight, petticoats and a wide crinoline: the full gown of a Victorian lady. The corset holds the trunk stiff as any breastplate; the skirts drag at every step.\nCrinolines caught the hearth fire so often that thousands of women burned to death in them. Oscar Wilde lost two half-sisters so, in 1871, their gowns alight from the fireplace after a ball.\nShe was taught to faint. She chose otherwise.',
  rags: 'A torn shirt and bare feet, cloth gone grey with sleeping in it: the beggar, the prisoner, the one forgotten. Whatever he once owned was taken, or sold for bread.\nThe workhouse, the debtors’ prison, the transport ship to Botany Bay: every age has had its own way of disposing of such men, and the men have always outlasted it, somehow, for a while.\nHe has nothing left to lose, which is its own kind of armour.',
  commoner: 'Tunic and hose of undyed wool, a hood, a belt for the knife: the dress of a medieval labourer. Such men tilled the fields that fed the knights who trampled them.\nIn 1381 they rose under Wat Tyler and marched on London. The boy-king Richard met them at Smithfield; Tyler was stabbed by the Lord Mayor, and every promise made that summer was broken before the harvest was in.\nWool for warmth, and promises for armour.',
  joan: 'White harness, bright plate from head to foot beneath a crimson huque, made at Tours in 1429 at the Dauphin’s cost for a peasant girl of Domrémy. She carried her standard rather than her sword, she said, so as never to kill.\nShe wore it to Orléans and to the crowning at Reims. Taken at Compiègne, she was sold to the English, tried at Rouen, and burned there in 1431, aged nineteen. The king she had crowned lifted no finger.\nThe armour was a gift. So, they told her, were the voices.',
  templar: 'Mail hauberk, mittens and chausses beneath the white surcoat and its red cross, a flat-topped great helm above: the Poor Fellow-Soldiers of Christ and of the Temple of Solomon.\nSworn to poverty, they grew rich and lent to kings. Philip of France, deep in their debt, had them seized on a Friday in 1307. Jacques de Molay burned at Paris in 1314, summoning king and pope to judgment within the year. Both died.\nThe surest way to lose a king is to lend him money.',
  tournament: 'The Stechzeug, a jousting harness bolted to a frog-mouthed helm of thick steel; the rider sees the lance only by lifting his head at the last instant. Made for the German lists, where a lance struck true could unhorse a prince.\nIn 1559 Henry II of France rode in a tilt to celebrate his daughter’s wedding. Montgomery’s lance shattered against his helm, and a splinter passed through the visor into his eye. He lingered ten days and died.\nArmour made for a game, worn by men who forgot the game could kill.',
  police: 'A patrol uniform of navy polyester, a soft vest of woven aramid beneath the shirt, a duty belt heavy with radio, cuffs and pistol. Made to stop a knife’s thrust or a handgun round on an ordinary shift.\nIn North Hollywood in 1997, two robbers in homemade armour fired rifles for forty-four minutes while patrol pistols spent themselves against them. The officers borrowed rifles from a gun shop down the road.\nA rifle asks a question the vest cannot answer.',
  riot: 'Riot gear: a padded suit with hard shells over the limbs, a helmet with a full polycarbonate visor, a long shield and a baton. Worn on the line where batons meet bottles, and bricks meet both.\nOn either side of that line stand people who did not choose to be there. In every decade the photographs come back the same, and history decides later, rarely kindly, which side was wearing the villain’s costume.\nThe visor fogs, and the crowd does not end.',
  swat: 'Heavy tactical armour: hard plates over chest and limbs, a ballistic helmet with a sealed visor, a ram or a shield for the door. Born in Los Angeles in the 1960s, after a sniper in a Texas tower showed police how outgunned they were.\nIts wearer goes first through doors others flee from. Sometimes the address on the warrant is wrong, and the man asleep inside reaches for whatever is near, and nobody goes home the same.\nBehind the door, there is never a rehearsal.',
  infantry: 'A modern soldier: a plate carrier with ceramic rifle plates front and back, a combat helmet of aramid, a rucksack heavier than both. Heir to every breastplate that came before.\nThe plates turned bullets in Fallujah and Helmand. The bombs buried in the road came from beneath, where no plate was, and a generation came home whole of chest and short of limbs, or whole of body and short of sleep.\nThe plate stops what it was made to stop. The war was never so polite.',
  specialForces: 'A special-forces operator: plate carrier and high-cut helmet, night vision folded up on its mount, everything stripped to what speed allows. Such men are sent where no one admits to sending them.\nIn Mogadishu in 1993, Rangers left their back plates and night sights behind for what was meant to be an hour’s raid. It became a night and a morning in the streets, and eighteen Americans did not come out.\nLightness is a wager that the hour stays an hour.',
  proximity: 'The firefighter’s aluminized proximity suit, its silver skin throwing back the radiant heat of burning fuel, the hood’s gold-filmed visor a mirror. Made to approach a blaze, not to enter it.\nAt airfields and refineries crews in such suits walk toward fires everyone else is running from, close enough to drag a man from a burning cockpit, and no closer, for closer is where the suit stops promising anything.\nA mirror held up to the fire. Against a fist, it is only cloth.',
  fireEntry: 'A fire-entry suit, quilted layers of aluminized cloth and insulation, worn to walk into the flame itself, the air drawn from a tank on the back. It grants minutes, no more, and the wearer counts every one.\nAt Chernobyl in 1986 the first firemen climbed onto the reactor roof in canvas and rubber to fight the blaze. The fire went out by dawn; within weeks most of them had died of what no suit could turn away.\nIt buys minutes from the fire. Some fires sell nothing.',
  humanoid: 'A full-size humanoid robot, an aluminium frame within white plastic shells, motors at every joint humming like trapped insects. Built in laboratories to walk among us and fetch, carry and stack our boxes.\nIts makers filmed it walking, falling and rising again, and the world watched engineers shove and kick its kind to prove their balance. Whatever it is, it was taught from its first steps that the kick would come.\nMade to carry our boxes. Taught first to take our blows.',
  miniHumanoid: 'A small humanoid robot, a bare frame of metal and servos, knee-high, its head a camera and a speaker. Made to teach children, to dance at trade fairs, and to play at football in the RoboCup league.\nEach year at the tournament its kind topple, twitch, and are carried off the pitch by grown men in lanyards. Each year the new model is lighter and quicker, and the old ones go into a box marked spares.\nIt breaks easily, and does not complain, and is not asked.',
  combatBot: 'An armoured combat robot, a rifle and a shotgun where its forearms should be, sensors clustered in a blank head. Its makers gave it no name, only a designation and a serial number.\nIn Dallas in 2016, police sent a bomb-disposal robot toward a cornered gunman with a pound of explosive on its arm. It was the first time American police had killed with a machine, and the precedent was quietly filed away.\nIt does not tire, and it does not grieve. Those are the features.',
  exoArmoured: 'A soldier sealed in plate over a powered exoframe, motors and struts bearing the weight his body could not, a cable spine down his back. Every blow he throws carries more than his own strength.\nThe armies that dreamed of him spent decades and fortunes. The prototypes ran for hours, not days, on their batteries, and the programme called TALOS was shelved in 2019, unfinished, while the men it promised to carry went on carrying their loads the old way.\nShould the battery fail, he becomes a statue of himself.',
  silverback: 'A silverback gorilla, lord of his troop, his back gone grey with age, clothed in nothing but hide and muscle. He has no armour and needs none; his arms could fold a man in half.\nBy nature he is gentle, an eater of leaves who would rather beat his chest than fight. Men took his kind for trophies, and sold their hands as ashtrays; on the last day of 1977 poachers killed Digit, whom Dian Fossey loved, and in 1985 her own turn came.\nThe strongest creature in the forest, and the least dangerous one in it.',
  monkeyFur: 'A primate of forest or rock: macaque, baboon or chimpanzee. Fur, sinew and long canine teeth, hands that grip, and a cunning older than ours, set in a face too much like our own.\nWe strapped his kin into rockets and laboratory frames and wrote their names in lab books. In 2009 a pet chimpanzee in Connecticut, raised from infancy as a child of the house, tore the face from his owner’s friend.\nHe does not fight for honour. He fights to win, as we once did.',
  kungfu: 'A suit of loose silk, the jacket closed by frog buttons, trousers and cloth shoes: the dress of the masters of southern China, teaching in courtyards and clan halls among the incense smoke.\nIn 1900 the Boxers, trained in such arts, believed their rites made them proof against bullets. They rose against the foreigners, eight nations marched on Beijing, and the rifles answered the belief, rank after rank.\nSilk will not turn a blow. That is the work of the hands, and the hands are only flesh.',
  monk: 'The robe of a Shaolin monk, grey cotton, leggings bound at the shin, the head shaven and marked. At Songshan the monks made fighting a discipline of the body, as of the spirit.\nThirteen staff-bearing monks, it is told, helped the young Li Shimin of Tang against Wang Shichong in 621, and the temple was honoured for it. In 1928 a warlord burned it, and the library with it, for forty days.\nA vow of peace, kept with fists, and broken by fire.',
  wuxia: 'Robe and sash of a wandering swordsman of the jianghu, the rivers and lakes of the old tales, a sword wrapped in cloth across the back. He owes allegiance to no lord, only to his code.\nThe historian Sima Qian wrote of such knights-errant, who kept their word unto death. Emperor Wu had the most famous of them, Guo Xie, put to death with his whole clan, for a court cannot abide a man the people love without its leave.\nHonour without a master is a crime with good manners.',
  wokou: 'A pirate of the China coast, in a loose robe or bare to the waist, a long blade in his sash. Japanese, Chinese and Portuguese alike sailed under that name in the sixteenth century, for the Ming had forbidden trade by sea.\nThe ban made smugglers of merchants and pirates of smugglers. When the court lifted it in 1567 the raids dwindled; by then whole coastal counties had been burned to bare earth, and the court called that a victory.\nArmour is a weight the sea does not forgive. Neither, it seems, does the law.',
  guanYu: 'Guan Yu, general of Shu, in a green robe over gilt scale armour, his long beard combed, the cap of a Han general on his head. Sworn brother to Liu Bei in the peach garden, the tale says, unto death.\nHe held Jing province, and lost it when an ally turned. Taken by Lü Meng of Wu in 220, he was beheaded, and his head was sent to Cao Cao, who buried it with a lord’s honours.\nDead, he was raised a god of loyalty. Temples still burn incense to the man they could not keep alive.',
  hanSoldier: 'A soldier of the Han: an iron lamellar coat over a red robe, a helmet of narrow vertical plates, a crossbow at his side. Such men manned the beacon towers along the Silk Road against the Xiongnu.\nTheir bamboo slips survive in the desert at Juyan: requests for boots, reports of runaways, the names of the sick and the dead, all in the clerks’ neat hand, the soldiers themselves long since dust.\nTheir clay likenesses outlived them. So did their paperwork.',
  hanCavalry: 'A Han horseman in the iron lamellar coat and helmet, cut for the saddle, a ring-pommel sword at his hip. Emperor Wu sent such riders deep into the steppe to break the Xiongnu at their source.\nIn 119 BC the old general Li Guang, whom the Xiongnu called the Flying General, lost his way in the desert and came late to the battle. Rather than answer to the clerks of the court, he cut his own throat.\nFew came back across the desert. Fewer were welcomed home.',
  ironPagoda: 'The Iron Pagoda, heavy cavalry of the Jin: iron lamellae from neck to shin, a heavy iron helmet, horses barded and, the chroniclers claim, roped three abreast. They rode against the Song like a moving wall.\nAt Yancheng in 1140 Yue Fei’s men went in beneath them with axes and hooked blades to cut the horses’ legs. Within two years Yue Fei was recalled by his own court and put to death on a charge no one could name.\nSlow, and terribly hard to kill, unlike the man who beat them.',
  mingGarrison: 'A Ming garrison levy: a hemp vest, a sash, a cloth wrapped about the head, a spear drawn from a damp storeroom. Hereditary soldiers, bound to their posts by birth under the guard-and-battalion system.\nBy the late Ming the officers had taken the soldiers’ fields and pocketed their rations. Men deserted by the hundred thousand; those who stayed farmed for their commanders and drilled only when the inspectors came.\nThe state promised them armour. It sent the promise, and kept the iron.',
  mingIronLamellar: 'Ming cavalry of the northern border, iron lamellar over a deel, a pointed steppe helmet above, a horse bow at the hip. Their armour wore the enemy’s fashion, and many of them were the enemy’s cousins.\nWhole frontier garrisons changed sides with the seasons and the pay. In 1644 the general Wu Sangui opened Shanhai Pass, the eastern gate of the Wall, and the Manchu rode through to take the empire he had been posted there to keep.\nOn the frontier, the line between Ming and Mongol was a matter of who paid last.',
  ashigaru: 'Foot soldier of the Warring States: an okegawa dō of riveted horizontal strips lacquered black, a conical iron jingasa with his lord’s crest in gold. Lent from the castle store, with a spear or a matchlock to go with it.\nAfter every campaign the lacquered sets were counted back in. Those that did not return were docked from no one’s pay, for their wearers had lost everything already; at Sekigahara in 1600 the heads of nameless thousands were buried in mounds.\nLent by his lord, returned by his widow.',
  oyoroi: 'The ō-yoroi in full: silk-laced lamellae, broad shoulder boards, a kabuto with gilt horns, the great box armour of the mounted archer, so heavy he could scarcely walk in it, and seldom needed to.\nAt Ichi-no-Tani in 1184 Kumagai Naozane called back a fleeing Taira rider, threw him down, and found a boy of sixteen, Atsumori, with a flute in his sash. He struck off the head, wept, and later became a monk.\nThe bells of Gion Shōja ring of impermanence. No one told the armour.',
  samuraiTosei: 'Tōsei gusoku, armour of the gun age: a solid plate dō proofed against the musket, the test bullet’s dent left proudly in its breast, a menpo over the face, a kabuto above. Forged while Japan was unified by war.\nThen the Tokugawa peace came, two and a half centuries of it, and the armour went to the storehouse. When the samurai were abolished in the 1870s, sets like this were sold by the pound to foreign collectors.\nProof against the bullet. No proof against the century.',
  ronin: 'A masterless samurai: a worn cloak and kosode over odd pieces of armour, a straw hat low across the eyes, two swords he cannot bring himself to sell. His lord is dead or disgraced, and his stipend with him.\nForty-seven such men waited two years to avenge their lord Asano, took Kira’s head in the snow of 1703, and laid it on their master’s grave. The shogunate ordered them to cut open their own bellies for it, and they did.\nWhat honour he keeps, he keeps alone, and it is collected in full.',
  sohei: 'A warrior monk of Mount Hiei or Nara: a white cowl wrapped to the eyes, robes over lamellar armour, a naginata long as a doorway. For centuries they marched on Kyoto bearing sacred palanquins to bend the court.\nThe cloistered emperor Shirakawa named three things he could not command: the Kamo river, the dice, and the monks of the mountain. Oda Nobunaga could; in 1571 he burned Enryaku-ji and killed its monks, its women and its children.\nPrayer and the blade in the same hand, until a harder hand came.',
  hoplomachus: 'The hoplomachus: a brimmed, crested helmet with a grille, quilted leg wraps and tall greaves, a small round shield, a spear, and a dagger for when the spear was gone. He fought as a Greek hoplite fought, for Roman crowds.\nThe free men who had stood at Marathon were remembered in Rome as a costume, worn by slaves and captives. Their tombstones, where they had any, name the bouts won and the age at death, rarely past thirty.\nHis was the spear, and the dust, and someone else’s history.',
  murmillo: 'The murmillo: a broad-brimmed helmet with a fish crest and a grille, a manica of quilted linen binding the sword arm, a greave on the leg, the great curved shield. Named, it is thought, for a fish of the sea.\nThe net-man taunted him, so the old grammarians say, singing: I want not you but your fish; why flee me, Gaul? In the gladiators’ cemetery at Ephesus lie skulls pierced by three tines set a hand’s breadth apart.\nA fish on the crest, a song in the air, and three holes in the bone.',
  retiarius: 'The retiarius: no helmet, a bronze galerus at the left shoulder, a manica on the arm, the weighted net and the trident. The arena’s fisherman, nimble and nearly naked.\nHe was the lowest of gladiators, his bare face a shame. Juvenal sneers at Gracchus, a nobleman of ancient family, who fought as a retiarius so that all Rome might see him, and know him, as he ran.\nThat face is all the crowd remembers, and the only thing it wanted.',
  scissor: 'The scissor: a steel tube cased over the left forearm, ending in a crescent blade, scale on the body, a smooth egg of a helmet with two round eyes. Known from a few carvings and a line or two of stone, and little else.\nScholars still quarrel over his name and his purpose. Whoever wore the tube, his name was carved once, briefly, and the rest went into the sand with him, unrecorded by any pen.\nWhat he did with that blade the stone does not say, and the sand does not share.',
  secutor: 'The secutor: a smooth, egg-shaped helmet pierced by two small eyes, made so the trident would slip, a manica on the arm and the great shield. Hunter of the net-man, chaser across the sand.\nThe eyeholes were too small for a tine, and so small that he breathed his own breath back within minutes. The retiarius had only to run, and wait, and let the bronze do the strangling for him.\nArmour that wins the first minute and loses the fifth.',
  thraex: 'The thraex: a griffin-crested helmet with a grille, high greaves over quilted wraps, a small square shield and the curved sica. Made in the image of Rome’s Thracian foes.\nSpartacus, it is said, was a Thracian, and fought in the arena before he broke out of Capua in 73 BC with seventy men and kitchen knives. Two years later six thousand of his followers hung on crosses along the Appian Way.\nThe crowd chose sides; so did the dead, along the road.',
  maximus: 'A Roman general turned gladiator: a leather cuirass, bracers on the forearms, no helmet, a sword scarred from the northern wars. Once he commanded legions; now he awaits the editor’s thumb.\nRome had real ones: men of rank ruined by debt or disfavour who sold themselves to a lanista, swearing to endure the fire, the chains, the lash and the sword. The senate passed laws forbidding it, and had to pass them again.\nHe fights for a name only he remembers.',
  lorarius: 'The lorarius, whip-man of the arena, in an undyed tunic, a leather lash coiled at his belt. His task was to drive the reluctant onto the sand, and keep the frightened from running back.\nHe stood behind the fighters with the whip and the hot irons. When a man fell and did not rise, attendants dressed as Charon and Mercury came to test him with a heated rod, and drag him out through the Gate of Death.\nHe saw every ending, and none of them was his.',
  commodus: 'The emperor Commodus as Hercules, the lion’s skin over head and back, the club in hand, son of the philosopher Marcus Aurelius. He fought in the arena hundreds of times against men who dared not win, and billed the treasury for each.\nHe beheaded ostriches with crescent arrows and held the heads up to the senators, who chewed laurel to keep from laughing. On the last day of 192 his wrestling partner Narcissus strangled him in his bath.\nThe lion’s skin was borrowed. So, in the end, was the throne.',
  legionary: 'Legionary of the early Empire: lorica segmentata of iron bands on leather straps, an Imperial Gallic helmet, the scutum and gladius. Such men marched from the Rhine to the Euphrates on a ration of wheat and sour wine.\nIn AD 9 Varus led three legions into the Teutoburg forest, guided by Arminius, a Roman citizen and a friend. In the rain and the bog all three were destroyed, and pieces of their armour lie yet in the earth at Kalkriese.\nAugustus beat his head against the doors: Varus, give me back my legions. Nobody did.',
  republicanLegionary: 'Legionary of the Republic: a lorica hamata of mail, a bronze Montefortino helmet with its knob crown, the oval shield and two pila. A citizen farmer called from his plough for a season, and kept for years.\nAt Cannae in 216 BC Hannibal folded eight legions into a bag, and some fifty thousand died in an afternoon. The survivors were shipped to Sicily in disgrace and served there unforgiven, until at last they broke Hannibal at Zama.\nThe rings turn an edge, the bronze a stone. Nothing turns a city’s shame.',
  centurion: 'A centurion: mail hung with phalerae, greaves on the shins, a helmet with a transverse crest so his men might find him in the press, and a vine staff for their backs.\nHe stood in the front rank and died there more often than the rest. In the mutiny of AD 14 the Pannonian legions murdered one called Bring Me Another, for the vine staves he broke over their shoulders and kept calling for.\nThe medals were for those who lived. The staff was for everyone else.',
  lateRoman: 'A late Roman soldier: a mail shirt and a ridge helmet of two iron halves joined along the crown, silvered for the officers. Made quickly, in state workshops, for an empire under siege on every border.\nAt Adrianople in 378 the Goths whom Rome had let across the Danube, then starved, and sold dogs for their children, turned and destroyed the eastern army. The emperor Valens died on the field, and his body was never found.\nMade in haste, for an empire that had run out of time.',
  romanAuxiliary: 'An auxiliary horseman: a mail shirt, a cavalry galea with broad cheek pieces, an oval shield and the long spatha. No citizen, but a Batavian or a Thracian who would be one after twenty-five years.\nThe Batavians were Rome’s finest horse. In AD 69 they rose under Julius Civilis, one of their own, a Roman citizen of twenty-five years’ service, and burned the very Rhine forts they had garrisoned.\nMany served their time. Some, having earned the bronze diploma, came back with fire.',
  goth: 'A Visigoth warrior: woollen tunic and trousers, a round shield with an iron boss, a spear and no armour. His people crossed the Danube in 376 fleeing the Huns, and begged Rome for land.\nIn 410 under Alaric they sacked Rome itself, the first foe within its walls in eight centuries. Alaric died within months; slaves turned the Busento from its bed to bury him, and were killed so none could tell where.\nA people with nothing, who learned what nothing could do.',
  gothNoble: 'A Visigoth noble: a mail shirt and a spangenhelm of riveted segments, a gilt-hilted sword, an eagle brooch jewelled with garnets at his cloak. His kind carved a kingdom from Roman Spain, with Toledo for its crown.\nThey quarrelled over every succession. In 711 King Roderic rode against Tariq’s small army from Africa; his rivals deserted him on the field at Guadalete, and the kingdom fell all at once, in a single summer.\nThree centuries of kingdom, undone by one afternoon’s grudge.',
  gaziAlp: 'One of Osman’s gazis: a mail shirt beneath a padded coat, a pointed chichak, a sabre and a horse bow. Frontier raiders who carved a beylik from Byzantium’s fraying edge in Bithynia.\nOsman, it is told, dreamed a tree grew from his body and shaded the world. His heirs made it so, and kept it so by killing their brothers; when Mehmed III took the throne in 1595, nineteen of his were strangled in a single day.\nFrom so small a band, an empire grew, and pruned its own branches to stay tall.',
  janissary: 'A Janissary: the long dolama coat and the tall white felt börk, and no armour. Taken as a Christian boy in the devshirme, made a Muslim, raised for the Sultan alone.\nWhen they wanted a Sultan gone they overturned their soup cauldrons, and more than one went. In 1826 Mahmud II turned his cannon on their barracks, and thousands died in the burning; the court named it the Auspicious Incident.\nDrill was his armour, and loyalty his trade, until he sold it once too often.',
  azap: 'An Ottoman azap, foot archer or marine: a plain tunic, a turban wound about a felt cap, a bow and a short sword, and no armour. Peasant volunteers raised for a campaign and paid by the day.\nSuch men were sent first against the walls and onto the galleys. At Constantinople in 1453 the irregulars went in first in the final assault, to blunt the defenders’ swords and fill the ditch, before the Janissaries were sent through.\nHistory remembers the bridge, not the stones it was built of.',
  saladin: 'Saladin, Sultan of Egypt and Syria: a kazaghand, silk outside and mail within over a quilted lining, the tall pointed turban helmet. A Kurd of Tikrit who brought Cairo and Damascus under one banner.\nAt Hattin in 1187 he cut the crusaders off from water in the July heat. Reynald of Châtillon he slew with his own hand; the captive Templars and Hospitallers he gave over to be beheaded. Then he took Jerusalem back, and spared its people.\nMercy and the sword, kept in the same scabbard.',
  cataphract: 'A Parthian cataphract: scale armour from head to foot, the horse barded likewise, a masked helmet and the long kontos held two-handed. Man and mount together, a hammer of iron.\nAt Carrhae in 53 BC the legions of Crassus broke beneath such riders and their archers. Crassus was killed at a parley, and the story goes that molten gold was poured down his throat, to sate his thirst at last.\nWithin the iron, the man is faceless. Within the gold, so was Crassus.',
  parthianArcher: 'A Parthian horse archer: tunic and trousers, a soft felt cap, the composite bow of horn and sinew. He loosed even as he turned to flee, and the world still names the parting shot for him.\nAt Carrhae the legionaries locked shields and waited for the arrows to run out; a thousand camels came with more. The Romans who survived were marched east to Merv, and their eagles hung in Parthian temples for thirty years.\nArmour would only slow the horse. Patience only fed the quiver.',
  hun: 'A Hun horseman: a caftan, a cap of fur or felt, leggings of goatskin, the bow and the lasso. Ammianus wrote that they ate and slept on horseback, and seemed grown to their saddles.\nThey rode out of the steppe and Rome trembled. Attila took gold by the cartload, then in 453 died on his wedding night, choked by his own blood. His men slashed their cheeks, that the greatest of warriors be mourned with blood, not tears.\nWithin a few years the empire was gone, as if the steppe had breathed it out.',
  steppeLight: 'A Mongol light horseman: the deel belted with silk, a fur hat with ear flaps, no armour, a bow and quiver at the hip. He rode with a string of remounts and lived on their milk, and in need on their blood.\nAt the Kalka in 1223 such riders feigned flight for nine days, drew the Rus’ princes after them, then turned. The captured princes were laid beneath boards, and the Mongol commanders feasted on top until they were crushed.\nSpeed was his only shield, and retreat his favourite weapon.',
  steppeMedium: 'A Mongol horseman in hardened leather lamellar over the deel, laced in rows and lacquered against the rain, a fur hat on his head. Such riders crossed from Korea to the Danube within a lifetime.\nAt Baghdad in 1258 they broke the Caliphate in a fortnight, and the Tigris, it was said, ran black with ink from the House of Wisdom. The last Abbasid caliph was rolled in a carpet and trampled by horses.\nLeather is light, and the steppe is wide, and wherever it reached, something ended.',
  kheshig: 'The Kheshig, the Khan’s own guard: gilt scale armour and a pointed helmet with an iron face mask, sabre and bow. Sons of the great families, sworn to the Khan’s tent by day and by night, hostages as much as guards.\nWhen Genghis died in 1227, the escort that bore his body home is said to have killed every living soul it met upon the road, so none could tell where the Khan was laid. No one has found him yet.\nThe mask betrays nothing of who lies beneath, or where.',
  xiongnu: 'A Xiongnu horseman: a coat of felt or leather, a fur hat, the bow and a bronze knife. The northern scourge against whom the first long walls of Qin and Han were raised.\nTheir chanyu Modu took power by training his archers to shoot wherever his whistling arrow flew: at his horse, at his wife, at last at his own father. Then he made the Han emperor pay him silk and princesses.\nTheir kurgans keep their gold, and their silence.',
  incaNoble: 'An Inca lord: a woven uncu tunic banded with tocapu, gold spools in the stretched earlobes, the llautu cord about his head. Those squares may be a writing no one now can read.\nAt Cajamarca in 1532 Atahualpa came to meet the Spaniards on a litter borne by his lords. When the guns fired, the lords held the litter up with their bodies until they were cut down, hand after hand. He filled a room with gold for ransom, and was garrotted anyway.\nHe paid in gold. They were paid in iron.',
  incaUncu: 'An Inca warrior: an uncu tunic of cotton or wool, the llautu cord, quilted cotton beneath, a sling about the brow and a star-headed mace. He served the Sapa Inca in war as his labour owed, the mit’a.\nThe Spaniards kept the mit’a when the Inca fell, and sent its men up the silver mountain of Potosí. For two centuries they went in, and so many never came out that it was called the mountain that eats men.\nThe empire ran the length of the Andes, and its armour was cloth. Its debts were paid in lungs.',
  mexicaWarrior: 'A Mexica warrior in the ichcahuipilli, quilted cotton armour stiffened with brine, a feather band at the brow, the obsidian-edged macuahuitl in hand. Obsidian cuts like no steel, and shatters like glass.\nHe fought to capture, not to kill, for the gods required the living. The Spaniards fought only to kill, and smallpox, come ahead of them in 1520, had already emptied half the city before the siege closed.\nThe Spaniards took his armour for their own. They had already taken everything under it.',
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
