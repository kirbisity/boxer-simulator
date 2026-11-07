// Outfit sets: what can be picked to wear, each a real kit with its own name, description and stats.
//
// An outfit (outfits.js OUTFITS) draws in several designs. Designs that differ only in colour, crest, plume, lacing or
// painted device are one set (a finish of it: cosmetic). Designs that differ in what guards the man (brigandine or
// lamellar, a mail shirt or a breastplate, a sallet or a close helmet, a mask or none) are sets of their own, and a set
// says how its stats differ from the outfit's (`patch`, merged over the outfit: outfits.js setSpec):
//   protection   by kind and by region (head, torso, limb, or a part: UpperArm, Shank...), merged region by region;
//   extraMass    the kit's weight as a share of the body's (in place of the outfit's);
//   helmet       what is on the head as a blow meets it (outfits.js HELMETS: mass, padding, curve, face, hold);
//   gaps, breastplate, movement, courage: as on an outfit.
// An outfit with no entry here is one set: its own label, with `OUTFIT_BLURBS` for its description.
// The differences are kept small and historical: the same man in a better helmet, not a different man.

// A head guarded by nothing (a bare head or a cloth cap on a kit that otherwise has a helmet).
const BARE_HEAD = { blunt: 0, cut: 0, pierce: 0, deflects: false };
// A cloth wrap or hachimaki: a few turns of cotton, a little against a cut.
const CLOTH_HEAD = { blunt: 0.05, cut: 0.1, pierce: 0.02, deflects: false };

const BAYARA_BLURB = { en: 'Armour of the Bayara, the banner guard. Brocade over iron plates, a steel mirror over the heart, gilt at the shoulders.\nThe guard was picked from every company. Wherever the line broke, they went in first; whenever a city fell, they were paid first.\nIn 1619 four Ming columns were swallowed one by one. The silver owed to the Ming garrisons had long gathered dust in the palace vaults of Beijing.\nLoyalty was never free. The Khan simply paid on time.', zh: '八旗护军巴牙喇的铠甲。锦缎为面，铁叶为里，心口悬一面护心镜，肩头鎏金。\n护军由各牛录挑选而出。阵中凡有缺口，必是他们先入；城破之日，财货先分护军。\n一六一九年，明军四路，被逐一吞没。而那些本该发给明军的饷银，早已在京城内库里积了尘。\n忠诚并非无价。只是大汗从不拖欠。' };

export const OUTFIT_SETS = {
  // The Bayara: the open helmet, or (one in three) the steel face of the steppe's masked helmets, which guards the face too.
  bayara: [
    { key: 'open', designs: [0, 1, 2, 3], name: 'Bayara guard — open helmet', blurb: BAYARA_BLURB, patch: {} },
    {
      key: 'masked', designs: [4, 5], name: 'Bayara guard — steel face',
      blurb: { en: 'Iron face of the Bayara guard, hung beneath the helmet in the old manner of the Mongol nobles. Brows, nose and a set mouth in iron; the eyes cut through.\nIt did not flinch at the Ming guns. It could not.\nThe Khan had chosen these men by name, yet their faces were hidden. The Ming gunners saw only iron coming, and afterwards no one could say which man had run.\nThe gunner aimed at the iron face. The man behind it fell.', zh: '巴牙喇的铁面。垂于盔下，仿蒙古贵人旧制。眉、鼻、紧抿的嘴，皆以铁打成，眼处开两道缝。\n明军铳响，这张脸纹丝不动。本也动不了。\n大汗亲手点选的人，面目却藏在铁后。明军铳手只见一片铁涌来；战后，也无人说得出是谁先逃。\n铳手瞄的是铁面。倒下的，是铁面后的人。' },
      // The steel face over the cheeks and the brow: a blow to the face meets plate, a point turns.
      patch: { extraMass: 0.297, protection: { bullet: { head: 0.5 }, regions: { head: { blunt: 0.62, cut: 0.97, pierce: 0.74, deflects: true } } } },
    },
  ],
  knight: [
    {
      key: 'sallet', designs: [0, 2], name: 'Gothic harness — sallet and bevor',
      blurb: { en: 'German plate of about 1480, fluted like frost on a window. Fitted to one body by the best smiths of Augsburg, for the price of a small farm.\nHis levy marched behind him in leftovers.\nCharles the Bold of Burgundy rode to Nancy in 1477 in such a suit. The eye slit was narrow. A Swiss peasant’s halberd split his skull, and wolves found him before his servants did.\nHe was found at last in a frozen pond.', zh: '一四八〇年前后的德意志板甲。甲面压出细槽，如冬日窗上的冰花。奥格斯堡最好的甲匠量一人之身而打，价抵一座小庄园。\n他身后的征召兵，穿的是挑剩的旧甲。\n一四七七年，勃艮第的大胆查理身披这样一副甲，进兵南锡。眼缝狭窄，一个瑞士农夫的长戟劈开了他的头颅。仆从寻到他之前，狼已先到。\n最后找到他的地方，是一片结冰的池塘。' },
      patch: { helmet: { mass: 2.4, padding: 0.65, curve: 0.9, face: 'closed' }, protection: { regions: { head: { blunt: 0.62, cut: 1, pierce: 0.94, deflects: true } } } },
    },
    {
      key: 'hounskull', designs: [1, 4], name: 'Milanese harness — hounskull bascinet',
      blurb: { en: 'Milanese plate of about 1400, smooth as river stone, the helmet drawn into a pointed snout pierced with breathing holes. The newest steel in Europe, made first for those who could pay. A knight became an iron hound.\nAgincourt, 1415. French knights in these helmets waded through knee-deep mud, fell in heaps and suffocated. English archers in cloth finished them with knives through the visor.\nIt had rained for days.', zh: '一四〇〇年前后的米兰板甲。光滑如河中卵石，头盔向前拉成尖吻，吻上满布气孔。欧洲最新的钢，先供给出得起钱的人。骑士由此成了一条铁犬。\n一四一五年，阿金库尔。戴这种盔的法国骑士在没膝的烂泥里跋涉，成堆倒下，窒息而死。身着布衣的英格兰弓手走上前，以小刀刺入面甲的缝隙。\n那几日，雨一直在下。' },
      patch: { helmet: { mass: 2.6, padding: 0.7, curve: 0.92, face: 'closed' }, protection: { regions: { head: { blunt: 0.6, cut: 1, pierce: 0.95, deflects: true } } } },
    },
    {
      key: 'closeHelmet', designs: [3], name: 'Late harness — close helmet',
      blurb: { en: 'Plate of the 1520s, the close helmet shutting round the whole head like a fist. The armourer’s art at its height, polished and engraved for kings. The finest helmet ever made, perfected just as it stopped mattering.\nPavia, 1525. French nobles charged in suits like this. Spanish gunmen, commoners with a few weeks’ drill, shot them from behind hedges. King Francis I was taken prisoner.\nThe Spanish powder was dry that day.', zh: '一五二〇年代的板甲。护面盔合拢，如拳头般握住整颗头颅。甲匠的技艺至此登峰，打磨錾花，专供君王。史上最精良的头盔，恰在头盔不再要紧时完成。\n一五二五年，帕维亚。法国贵族身披这样的甲冲锋。西班牙火枪手藏在树篱后射击，他们是平民，只操练了几个星期。国王弗朗索瓦一世被俘。\n那一日，西班牙人的火药是干的。' },
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
      blurb: { en: 'Riveted coat and kettle hat of a fifteenth-century foot soldier. Iron plates inside canvas; a helmet shaped like a pot.\nTowton, 1461, the bloodiest day of the Wars of the Roses. Both sides gave the order: no quarter.\nA captured lord could be ransomed. A man in a kettle hat was worth nothing alive.\nThe skulls they dug up later bear cut upon cut.', zh: '十五世纪步卒的布甲与铁盔。帆布里铆着铁片，盔形如锅。\n一四六一年，陶顿，玫瑰战争最血腥的一日。两军皆传令：不留活口。\n领主被俘，尚可赎回；戴铁锅盔的人，活着不值一文。\n后人掘出的头骨上，刀痕一道叠着一道。' },
      patch: {},
    },
    {
      key: 'brigandineSallet', designs: [1], name: 'Brigandine and German sallet',
      blurb: { en: 'Riveted coat and deep German sallet with an eye slit. A foot soldier with money to spare spent it on his head, where the axes usually went.\nGerman mercenaries in this kit served emperor, king and pope in turn, whoever paid.\nIn 1527 the emperor’s own army, years behind on wages, paid itself. It sacked Rome and stabled its horses in the Vatican.\nThat year the pay chest did not come.', zh: '步卒的布甲与德式深盔，盔上开一道眼缝。步卒若有余钱，都花在头上，斧头多半落在那里。\n穿这身的德意志雇佣兵，先后为皇帝、国王、教皇效力，谁付钱，便替谁打仗。\n一五二七年，皇帝自己的军队欠饷多年，便自行取饷：洗劫罗马，在梵蒂冈拴马。\n那一年，饷箱没有来。' },
      patch: { helmet: { mass: 2.2, padding: 0.45, curve: 0.75, hold: 'half' }, protection: { regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } } },
    },
    {
      key: 'brigandineBurgundian', designs: [4], name: 'Brigandine and Burgundian kettle',
      blurb: { en: 'Brigandine and broad Burgundian kettle hat, its brim wide as a farmer’s straw hat. The uniform of Burgundy’s new standing army: drilled, dressed alike, paid on time, and proud of it.\nMorat, 1476. Swiss farmers with long pikes broke the line and drove thousands into the lake.\nThe iron that had kept them alive dragged them under.\nThe shore was far behind them.', zh: '勃艮第的布甲与宽檐铁盔。盔檐宽如农人的草帽。勃艮第新式常备军的军装：操练有素，衣甲划一，按时领饷，并以此为荣。\n一四七六年，穆尔滕。持长枪的瑞士农夫冲垮阵线，将数千人逼入湖中。\n一路护住他们性命的铁，此刻拖着他们沉了下去。\n岸，已在身后很远的地方。' },
      patch: { helmet: { mass: 2.3, padding: 0.5, curve: 0.65 }, protection: { regions: { head: { blunt: 0.6, cut: 0.92, pierce: 0.63 } } } },
    },
    {
      key: 'mail', designs: [2], name: 'Mail shirt and kettle hat',
      blurb: { en: 'Shirt of iron rings over a padded jacket, every ring riveted by hand. Romans, Vikings and crusaders wore it. A thousand years of armour, handed down at last to those who could not afford plate.\nBy the 1400s new arrowheads went through rings like a needle through lace, and the lords had moved on to plate.\nThe poor got the old shirts, patched with rings from a dozen dead men.\nThe shirt will pass to one more man yet.', zh: '锁子衫与棉甲。铁环一枚枚手工铆合。罗马人穿过，维京人穿过，十字军也穿过。千年的甲，最后传给了买不起板甲的人。\n到十五世纪，新式箭头穿过铁环，如针穿花边。领主们早已换上板甲。\n旧衫落到穷人手中，破处用十几个死人身上拆下的铁环补缀。\n这件衫子，还会再传给下一个人。' },
      patch: { extraMass: 0.105, protection: { blunt: 0.35, cut: 0.88, pierce: 0.5 }, gaps: null },
    },
    {
      key: 'breastplate', designs: [3], name: 'Breastplate and sallet',
      blurb: { en: 'Plain steel breastplate and sallet, stamped out by the hundred for army stores. The lord’s armour was fitted to him; the levy got small, medium and whatever was left.\nBicocca, 1522. The Swiss charged across a sunken road into four ranks of Spanish gunmen. Bullets went through steel and man alike. Three thousand fell in half an hour.\nSteel that stops a pike does not stop lead.', zh: '素面钢胸甲与深盔。军械库中成百地冲压而出。领主的甲量身打造；征召兵的甲，分小号、中号，以及剩下的。\n一五二二年，比科卡。瑞士人越过一条洼路，冲向四排西班牙火枪手。铅弹连甲带人一并打穿，半个时辰，倒下三千。\n挡得住长枪的钢，挡不住铅弹。' },
      patch: {
        extraMass: 0.14, breastplate: 0.6,
        helmet: { mass: 2.2, padding: 0.45, curve: 0.75, hold: 'half' },
        protection: { blunt: 0.5, cut: 0.9, pierce: 0.8, regions: { head: { blunt: 0.58, cut: 0.93, pierce: 0.7 } } },
      },
    },
  ],
  archer: [
    {
      key: 'kettle', designs: [0, 2], name: 'Archer — jack and kettle hat',
      blurb: { en: 'Padded jacket and kettle hat of an English longbowman, and a yew bow taller than he was. A commoner on a carpenter’s wage, who could kill a knight in a fortune of steel from two hundred paces.\nIt is said the French cut off the two drawing fingers of any archer they took. It is said the English archers waved those fingers at the French in reply, and kept shooting.\nTwo fingers were worth a knight.', zh: '英格兰长弓手的棉甲与铁锅盔，一张比人还高的紫杉弓。他是平民，工钱与木匠相仿；两百步外，却能射杀身披万贯钢甲的骑士。\n据说法国人捉到这样的人，便剁去他拉弦的两根手指。又据说，英格兰弓手竖起这两根手指回敬法国人，然后继续放箭。\n两根手指，抵得上一个骑士。' },
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.88, pierce: 0.6 } } } },
    },
    {
      key: 'bare', designs: [1], name: 'Archer — jack, bare head',
      blurb: { en: 'Padded jacket of a longbowman, thick as a mattress, nothing on his head. A farmer’s son on sixpence a day could not afford an iron hat. His armour was a row of sharpened stakes hammered into the ground.\nPatay, 1429. French horsemen caught the English bowmen still setting up behind a hedge, and rode them down before they could shoot.\nThe stakes were not yet in the ground.', zh: '长弓手的棉甲。厚如床褥，头上什么也没有。一日六便士的农家子弟买不起铁盔。他的甲，是一排打进地里的尖木桩。\n一四二九年，帕泰。法国骑兵撞上仍在树篱后布阵的英格兰弓手，未等开弓，便将他们踏倒。\n那一天，木桩还没有打下去。' },
      patch: { extraMass: 0.035, protection: { regions: { head: BARE_HEAD } } },
    },
    {
      key: 'sallet', designs: [3], name: 'Archer — jack and sallet',
      blurb: { en: 'Padded jacket of a longbowman under a sallet of good steel, far too fine for a farmer’s son. It sits a little loose. The lining is stained with someone else’s sweat.\nA poor archer found such a helmet on the field, going through the dead with a knife. The heralds counted the noblemen who fell. No one counted what was taken off them.\nIt was the only way the newest steel ever trickled down.\nThe blood in the lining is not yet dry.', zh: '长弓手的棉甲与好钢深盔。对农家子弟而言，这顶盔太过精良。戴着略松，衬里浸着别人的汗。\n穷弓手的盔，是持刀在死人堆里翻来的。纹章官仔细清点阵亡的贵人；从他们身上取走了什么，无人清点。\n最新的钢，只有这一条路流到底下。\n衬里的血，还没有干透。' },
      patch: { extraMass: 0.046, helmet: { mass: 2.1, padding: 0.4, curve: 0.75, hold: 'half' }, protection: { regions: { head: { blunt: 0.52, cut: 0.9, pierce: 0.66 } } } },
    },
  ],
  conquistadorPlate: [
    {
      key: 'morion', designs: [0, 1], name: 'Conquistador — breastplate and morion',
      blurb: { en: 'Armour of the Spanish conquest. A steel breastplate, mail on the arms, a crested morion. Made in Toledo, shipped across an ocean, worn in tropical heat: steel and gunpowder against stone and cotton, and very sure of itself.\nFleeing the Aztec capital by night in 1520, Cortés’ men stuffed their breastplates with treasure. On the broken causeways, those who carried most fell into the canals and sank.\nGold and iron both sink.', zh: '西班牙征服者的胸甲与高冠盔。钢胸甲，臂套锁子，盔有高脊。托莱多打造，漂洋过海，在热带烈日下穿戴。以钢与火药对石头与棉花，信心十足。\n一五二〇年，科尔特斯的人连夜逃出阿兹特克都城，把财宝塞进胸甲。堤道断了，背得最多的人跌进运河，沉了下去。\n金子与铁，都会下沉。' },
      patch: {},
    },
    {
      key: 'cabasset', designs: [2, 4], name: 'Conquistador — breastplate and cabasset',
      blurb: { en: 'Spanish armour and cabasset, an almond-shaped helmet with a little stalk, made cheap by the thousand for Spain’s armies. Plain iron for men who meant to conquer an empire on a budget.\nFrancisco Pizarro took the Inca Empire in such armour, with a hundred and sixty-eight men.\nIn 1541 he was stabbed to death in his own house in Lima, by fellow Spaniards quarrelling over the loot.\nThe helmet had stopped the Inca blades.', zh: '西班牙甲与卡巴塞盔。盔作杏仁形，顶上翘起一枝小柄，为西班牙军成批廉价赶制。素铁一片，配给想以小钱打下一个帝国的人。\n皮萨罗身披这样的甲，以一百六十八人取下印加帝国。\n一五四一年，他在利马自家宅中被刺死。动手的是西班牙同胞，为了分赃。\n印加人的刀，这顶盔都挡住了。' },
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'pot', designs: [3], name: 'VOC pikeman — corselet and pot',
      blurb: { en: 'Body armour and broad pot helmet of a Dutch East India Company pikeman, blackened against rust. Bought by shareholders, worn on their behalf.\nIn 1621 the Company sent men like him to the Banda Islands. Its governor had the islanders killed, starved or enslaved, so that the Company alone could sell nutmeg.\nThe first modern corporation had its own army.\nThe ledger for that year records nutmeg.', zh: '荷兰东印度公司长枪手的身甲与宽檐铁盔，涂黑以防锈。股东出钱购置，士兵代股东穿上。\n一六二一年，公司将这样的兵派往班达群岛。总督下令，岛民或杀，或饿死，或卖为奴，好让肉豆蔻只由公司一家出售。\n世上第一家现代公司，自有一支军队。\n那一年的账本上，记的是肉豆蔻。' },
      patch: { extraMass: 0.17, protection: { regions: { head: { blunt: 0.53, cut: 0.91, pierce: 0.78 } } } },
    },
  ],
  conquistadorQuilted: [
    {
      key: 'morion', designs: [0, 2], name: 'Escaupil and morion',
      blurb: { en: 'Escaupil and steel morion. Aztec cotton armour, two fingers thick and stiffened in salt water, worn by a Spaniard under a helmet as hot as a frying pan by noon.\nIn that heat steel was torture, and the cotton stopped native arrows just as well. Within a season Cortés’ men had copied the armour of the people they called primitive.\nAt noon the man beneath the steel slowly cooked.', zh: '埃斯考皮尔棉甲与钢高冠盔。阿兹特克棉甲，两指厚，以盐水浸硬，穿在一个西班牙人身上。头顶的钢盔，到正午烫如煎锅。\n那样的天气，穿钢如受刑，而棉甲挡土著的箭一样有效。不过一季，科尔特斯的人便照搬了他们口中“野蛮人”的甲。\n正午，钢盔下的人慢慢被煮熟。' },
      patch: { protection: { regions: { head: { blunt: 0.5, cut: 0.9, pierce: 0.8 } } } },
    },
    {
      key: 'cabasset', designs: [1, 4], name: 'Escaupil and cabasset',
      blurb: { en: 'Quilted cotton and almond-shaped cabasset. Steel for the head, cotton for the body, the stitching often by native hands: Spanish pride and tropical weather, each giving a little.\nFrom 1539 de Soto’s men wore this kit through the swamps of Florida, burning towns for gold that did not exist.\nWhen de Soto died of fever, they sank him in the Mississippi by night, so the locals would not learn he was mortal.\nThe river was deep enough to hide a god.', zh: '棉甲与卡巴塞盔。头上是钢，身上是棉，针脚多出自土著之手。西班牙人的体面与热带的天气，各让一步。\n一五三九年起，德索托的人穿着这身走过佛罗里达的沼泽，一路焚城，寻找并不存在的金子。\n德索托死于热病。部下趁夜将他沉入密西西比河，好让当地人不知道这位神也会死。\n河水很深，足以藏住一个神。' },
      patch: { protection: { regions: { head: { blunt: 0.48, cut: 0.9, pierce: 0.83 } } } },
    },
    {
      key: 'feltHat', designs: [3], name: 'VOC musketeer — quilted coat, felt hat',
      blurb: { en: 'Quilted coat and broad felt hat of a Dutch East India Company musketeer, a belt of powder charges across the chest. His iron stayed in the fort; in that heat it would have cooked him.\nThe canals of Batavia bred fever. The Company buried soldiers faster than ships could bring new ones. Fewer than half who sailed east saw Holland again.\nThe ledgers balanced anyway.', zh: '荷兰东印度公司火枪手的棉袍与毡帽，胸前挂一排火药筒。铁甲留在堡中，那样的天气，穿上便会焖熟。\n巴达维亚的运河是死水，滋生热病。公司埋葬士兵，比船运来新兵还快。东去的人，能回到荷兰的不足一半。\n账目照样平衡。' },
      patch: { extraMass: 0.065, protection: { bullet: { head: 0 }, regions: { head: { blunt: 0.03, cut: 0.05, pierce: 0, deflects: false } } } },
    },
  ],
  // The Ottoman foot in the chichak (the army's own: OUTFITS `picked`), or in a turban or the börk as before. The chichak as the
  // sipahi's (OUTFIT_SETS.ottomanHeavy `chichak`): a pointed bowl over a quilted cap, the nasal and the mail aventail; the face
  // open. Its ~2 kg on a 60-65 kg man (extraMass ~0.03); nothing on the body but cloth.
  azap: [
    {
      key: 'chichak', designs: [0, 1, 2], name: 'Ottoman — azap, iron chichak',
      blurb: { en: 'Plain iron chichak of an Ottoman azap. A pointed cap of hammered iron, a nose bar, a fringe of mail, over the same tunic he farmed in. The cheapest helmet in the arsenal, issued for a campaign and counted back in afterwards.\nThe better helmets went to men who came home to hand them back. The azaps went first at every breach.\nThe arsenal’s clerks wrote off the iron cap and the man in one line.', zh: '奥斯曼阿扎普的素铁尖盔。锤打的尖顶铁帽，一根护鼻条，一圈锁子垂边；身上仍是种地时的那件褂子。军械库中最便宜的盔，出征时发下，战后一一点回。\n好盔留给能活着回来交还的人。每逢攻城破口，阿扎普总在最前。\n军械库的书吏注销铁帽，连人带帽，记成一行。' },
      patch: {
        extraMass: 0.03,
        helmet: { mass: 2.0, padding: 0.45, curve: 0.85 },
        protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.3, torso: 0, limb: 0 }, regions: { head: { blunt: 0.45, cut: 0.95, pierce: 0.6, deflects: true } } },
      },
    },
    {
      key: 'turban', designs: [3, 4, 5], name: 'Ottoman — azap, turban',
      blurb: { en: 'Tunic and turban of an Ottoman azap, a foot archer or marine. A turban over a felt cap, a bow, a short sword, no armour. A farmer who volunteered for one campaign, paid by the day.\nConstantinople, 1453. Men like him went first in the final assault, to tire the defenders and fill the ditch with their bodies.\nThen the elite troops walked in over them.\nHe had been paid for the day.', zh: '奥斯曼阿扎普的素褂与头巾。步弓手，亦充水兵。毡帽外缠头巾，一张弓，一把短刀，不披甲。农人自愿随军一次，按日领钱。\n一四五三年，君士坦丁堡。最后的总攻，打头阵的正是这样的人：先拖垮守军，再以身躯填平壕沟。\n精锐随后踏着他们入城。\n他领的，是一日的工钱。' },
      patch: {},
    },
  ],
  janissary: [
    {
      key: 'chichak', designs: [0, 1, 2], name: 'Ottoman — Janissary, chichak',
      blurb: { en: 'Dolama and gilt-banded chichak of a Janissary. A pointed steel bowl, a sliding nose bar, a curtain of mail at the neck. The Sultan’s own slaves, kept on a salary; for a siege the regiments drew helmets from the armoury like rations.\nWhen the coins came clipped, the Janissaries overturned their soup pots, and the Sultan lost his throne, sometimes his head.\nThe helmet belonged to the Sultan. The loyalty was on account.', zh: '耶尼切里的多拉玛长袍与镀金箍尖盔。尖顶钢碗，推拉护鼻条，颈后垂一帘锁子。苏丹的奴隶，却领着俸饷；每逢攻城，各营从军械库领盔，如领口粮。\n银币一旦剪了边，耶尼切里便掀翻汤锅。苏丹失了宝座，有时连头颅一并失去。\n盔是苏丹的。忠诚，是赊来的。' },
      patch: {
        extraMass: 0.03,
        helmet: { mass: 2.0, padding: 0.45, curve: 0.85 },
        protection: { blunt: 0, cut: 0, pierce: 0, bullet: { head: 0.3, torso: 0, limb: 0 }, regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } },
      },
    },
    {
      key: 'bork', designs: [3, 4, 5], name: 'Ottoman — Janissary, börk',
      blurb: { en: 'Long coat and tall white felt hat of a Janissary; no armour. Taken from a Christian family as a boy, raised to serve the Sultan alone, among the first troops in Europe drilled with guns. A slave become the backbone of an empire.\nTo topple a Sultan, the Janissaries overturned their soup pots.\nIn 1826 the Sultan shelled their barracks. He named it the Auspicious Incident.', zh: '耶尼切里的长袍与白毡高帽，不披甲。幼时从基督徒家中带走，养大后只侍奉苏丹一人，是欧洲最早操练火器的兵之一。奴隶，成了帝国的脊梁。\n要废黜苏丹，耶尼切里便掀翻汤锅。\n一八二六年，苏丹炮轰了他们的营房，称之为“吉祥事变”。' },
      patch: {},
    },
  ],
  ottomanHeavy: [
    {
      key: 'turban', designs: [0, 2], name: 'Sipahi — mail and plate, turban helmet',
      blurb: { en: 'Mail and plate of an Ottoman cavalryman, under a tall turban helmet engraved with verses of the Qur’an. He held his land from the Sultan only so long as he came to fight. A holy warrior, on a lease.\nVienna, 1683. These horsemen watched the Polish cavalry charge down into their camp.\nThat Christmas the Grand Vizier who had led them there was strangled with a silk cord, for losing.', zh: '奥斯曼骑兵的锁子连板甲与高头巾盔。盔上錾满《古兰经》经文。封地受于苏丹，唯有应召出征才算数。圣战士，也是租来的。\n一六八三年，维也纳。这些骑兵眼看着波兰骑兵冲下山坡，踏入营中。\n那年圣诞，率他们至此的大维齐尔被一根丝绳勒死。罪名是战败。' },
      patch: { helmet: { mass: 2.4, padding: 0.5, curve: 0.88, face: 'closed', hold: 'half' }, protection: { regions: { head: { blunt: 0.5, cut: 0.97, pierce: 0.6, deflects: true } } } },
    },
    {
      key: 'chichak', designs: [1], name: 'Sipahi — mail and plate, chichak',
      blurb: { en: 'Mail and plate of an Ottoman horseman, under a lighter chichak with a sliding nose bar and an open face. Less protection, a better view: the right trade, once armies ran on cannon.\nMohács, 1526. The Hungarian knights charged the Ottoman guns and broke in an afternoon.\nTheir young King Louis fled, fell into a flooded stream, and drowned in his very expensive armour.', zh: '奥斯曼骑兵的锁子连板甲与轻尖盔。推拉护鼻条，面部敞开。护得少，看得清。军队倚仗大炮之后，这笔交换是值的。\n一五二六年，莫哈奇。匈牙利骑士冲向奥斯曼炮阵，一个下午便溃散了。\n年轻的国王拉约什二世逃跑时跌进涨水的溪流，溺死在那副价值连城的甲里。' },
      patch: { helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
    {
      // The great plates of the 16th century joined by bands of heavy rings (Askeri Müze; the Met's Ottoman mail-and-plate):
      // the round domed plate over the belly, plates at the breast, back and sides, a long mail skirt. Heavier than the
      // shirt of small plates (~14 kg against ~12), the same mail between, its stops the shirt's.
      key: 'krugDisc', designs: [3], name: 'Sipahi — krug of great plates, chichak',
      blurb: { en: 'The krug. Great steel plates over belly, chest, back and sides, joined by bands of heavy rings; a mail skirt to the knee. On the round belly plate, verses in gold asking God for victory.\nA sipahi’s whole harvest went into one. The timar that paid for it was a village’s grain, taxed at the threshing floor.\nThe peasants never saw the plate. They saw the tax collector, twice a year.', zh: '克鲁格甲。大钢板护住腹、胸、背与两肋，以粗环带相连；锁子长裙垂至膝下。圆形护腹板上，金字錾着祈求真主赐胜的经文。\n一个西帕希一整年的收成，尽数花在这一身上。供养这身甲的蒂马尔，是一个村庄的粮食，在打谷场上便已抽了税。\n农夫们从未见过那块钢板。他们见到的，是一年来两次的税吏。' },
      patch: { extraMass: 0.19, helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
    {
      // The bekhter: narrow plates in rows down the chest and back, set in mail and buckled down the front, laminated shoulder
      // plates (Ottoman and Persian, 16th-17th c.); its stops the shirt's, a little heavier.
      key: 'bekhter', designs: [4], name: 'Sipahi — bekhter, chichak',
      blurb: { en: 'The bekhter. Rows of narrow steel plates down the chest, each inscribed in gold, linked by mail and buckled with leather; laminated shoulders; a mail fringe from a pointed chichak. The plates lap like roof tiles, and a lance point skids from one to the next.\nOnly the richest timar holders and the Sultan’s own household could afford such a roof.\nThe poorer sipahis rode beside them in quilted coats. The lances found them first.', zh: '贝赫特甲。窄钢片顺胸排列，片片錾金，以锁子相连，皮带扣合；肩甲层叠，尖盔下垂一圈锁子。甲片如屋瓦相压，枪尖刺来，从一片滑到下一片。\n这样的钢屋顶，只有最富的蒂马尔主与苏丹近侍才住得起。\n穷些的西帕希穿着棉袍，与他们并骑。枪尖先找上的，是这些人。' },
      patch: { extraMass: 0.18, helmet: { mass: 2, padding: 0.45, curve: 0.85 }, protection: { regions: { head: { blunt: 0.47, cut: 0.96, pierce: 0.6, deflects: true } } } },
    },
  ],
  samurai: [
    {
      key: 'open', designs: [0, 2], name: 'Ō-yoroi — open kabuto',
      blurb: { en: 'Ō-yoroi, the great box armour of the early samurai. Lacquered plates laced with silk; the face left bare, so the rider could shout his lineage before he shot. Only the noble clans could afford it: a pedigree in lacquer.\nDan-no-ura, 1185. The defeated Taira threw themselves into the sea with their child emperor.\nIt is said one warrior wore two suits, to sink faster.', zh: '大铠，早期武士的箱形大甲。漆札以丝绳编缀，面部敞开，好让骑手开弓之前先自报家门。唯有名门出得起。一部漆成的家谱。\n一一八五年，坛之浦。战败的平家抱着年幼的天皇投入海中。\n据说有一名武士穿了两副大铠，好沉得更快。' },
      patch: {},
    },
    {
      key: 'menpo', designs: [1, 3, 4], name: 'Ō-yoroi — kabuto and menpo',
      blurb: { en: 'Great armour with an iron mask, the lips curled in a snarl beneath a horsehair moustache. The mask did the scowling, so the man inside need not.\nAfter a battle the enemy heads were washed, combed and shown to the victorious lord on a labelled board. Rewards were paid by the head.\nA famous face was worth a farm. A nobody’s was worth a nod.', zh: '大铠与铁面具。唇翻作狰狞之相，上缀马鬃胡须。凶相由面具摆出，里面的人不必费力。\n战后，敌人的首级要洗净、梳发，插上名签摆在板上，呈给得胜的主公过目，论首行赏。\n名人的头，抵得一块田。无名者的头，换来主公一点头。' },
      patch: { extraMass: 0.225, protection: { regions: { head: { blunt: 0.68, cut: 0.93, pierce: 0.66 } } } },
    },
  ],
  // The tōsei gusoku's kabuto in its three constructions. Against the suji-bachi's riveted plates (the kit's own: head blunt 0.7,
  // pierce 0.7, a ball 0.4; 2.8 kg), the Nanban kabuto's one-piece skull of thicker European steel, no seam for a blow to
  // open and its high point turning one aside, guards the head better against a blow (blunt +0.12) and a ball (0.55: such
  // skulls came proofed, a dent left as the mark), and weighs about half a kilogram more; the zunari's three plain plates,
  // smooth and rounded, turn a blow a little better than the riveted bowl and less well than the one-piece skull, and weigh
  // half a kilogram less (Bottomley and Hopson, Arms and Armour of the Samurai, 1988; the Met's and the British Museum's).
  samuraiTosei: [
    {
      key: 'sujiBachi', designs: [0, 1, 2, 3, 4, 5], name: 'Tōsei gusoku — suji-bachi kabuto',
      blurb: { en: 'Tōsei gusoku. Armour of the age of guns; a single iron plate across the chest.\nWhen it was finished it was tested with a musket, and the dent was left on the front like a brand.\nArmour that could stop a musket could not stop peace. Through two and a half centuries of Tokugawa rule it lay sealed in storerooms, until no one remembered what it had been made for.', zh: '当世具足。铁炮时代的武者之甲，胸前一整块铁板。\n甲成之日，以铁炮试射，弹痕留在正面，如同烙下的印记。\n然而挡得住铁炮的甲，终究挡不住太平。德川治世两百五十年，具足尽数封入库中，再无人记得它为何而造。' },
      patch: {},
    },
    {
      key: 'nanban', designs: [6], name: 'Tōsei gusoku — Nanban kabuto',
      blurb: { en: 'Nanban kabuto, helmet of the southern barbarians. A Spanish or Portuguese cabasset bought off the ships, or hammered in copy of one; the skull raised from one piece of thick steel, with no seam for a blow to open. Fashion and proof at once, for a lord who traded with the foreigners.\nThe ships brought the guns that made such helmets worth wearing. They also brought priests.\nWithin a generation the shogun had banned the faith, crucified converts at Nagasaki and closed the ports to all but the Dutch.', zh: '南蛮兜。西班牙或葡萄牙的卡巴塞盔，从南蛮船上买来，或照样仿打。盔顶以一整块厚钢锤成，没有可供劈开的接缝。既是时样，又经得起打，配给与洋人通商的大名。\n船上运来铁炮，这样的盔才值得一戴。船上也下来了传教士。\n不出一代，将军禁教，在长崎将信徒钉上十字架，港口只留给荷兰人。' },
      patch: { extraMass: 0.256, helmet: { mass: 3.3, padding: 0.55, curve: 0.9 }, protection: { bullet: { head: 0.55 }, regions: { head: { blunt: 0.82, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'zunari', designs: [7], name: 'Tōsei gusoku — zunari kabuto',
      blurb: { en: 'Zunari kabuto. Three plain plates riveted into a head-shaped bowl, a frown embossed at the brow; made fast and cheap by the thousand for the armies of the 1600s. It turned a blow nearly as well as a lord’s, at a fraction of the cost.\nSekigahara, 1600: some 160,000 men on one field in one morning. The victor, Tokugawa Ieyasu, then disarmed the country.\nThe cheap helmets went home with whoever had survived.', zh: '头形兜。三块素铁板铆成头形，眉间压出一道皱纹；十七世纪的大军所需，成千上万地赶制。挡刀几乎不输大名的盔，价钱却只是零头。\n一六〇〇年，关原。一个上午，一片原野上挤进约十六万人。胜者德川家康随后收缴了天下的兵器。\n廉价的盔，随活下来的人回了家。' },
      patch: { extraMass: 0.244, helmet: { mass: 2.3, padding: 0.5, curve: 0.8 }, protection: { bullet: { head: 0.45 }, regions: { head: { blunt: 0.76, cut: 0.95, pierce: 0.74 } } } },
    },
  ],
  wokouArmoured: [
    {
      key: 'do', designs: [0], name: 'Wokou — dō-maru',
      blurb: { en: 'Dō-maru of a wokou pirate. Wrap-around armour of lacquered plates, made for a samurai’s retainer, stolen or traded for. Arms bare, a cloth band round the head. Someone else’s armour, without someone else’s loyalty.\nIn 1555 some seventy raiders marched from the Chinese coast to the walls of Nanjing, killing thousands on the way.\nGarrisons ten times their number locked the gates and hid.', zh: '倭寇的胴丸。漆札环身，本为武士家臣所造，或抢或换，落到海贼身上。两臂赤裸，头缠布带。甲是别人的，忠心却没有跟来。\n一五五五年，七十余名倭寇自海边一路杀到南京城下，沿途杀了数千人。\n十倍于他们的卫所官兵，紧闭城门，躲着不出。' },
      patch: { protection: { regions: { head: CLOTH_HEAD } } },
    },
    {
      key: 'sode', designs: [1, 3], name: 'Wokou — dō-maru and sode',
      blurb: { en: 'Dō-maru of a wokou pirate, with great shoulder boards tied on like window shutters. Taken from a better man, and laced back together with whatever cord was to hand.\nThe general Qi Jiguang drilled ordinary farmers to fight in small teams: shields in front, long bamboo spears behind.\nTaizhou, 1561. The pirates fell by the hundred.\nCheap bamboo, well used, beat stolen armour.', zh: '倭寇的胴丸与大袖。两块大袖系在肩上，如两扇窗板。原主比他体面；甲散了，他随手找根绳子又编起来。\n戚继光把农夫练成小队：前列藤牌，后列狼筅长枪。\n一五六一年，台州。倭寇成百地倒下。\n便宜的毛竹用对了地方，胜过抢来的好甲。' },
      patch: { extraMass: 0.085, protection: { regions: { head: CLOTH_HEAD, UpperArm: { blunt: 0.3, cut: 0.6, pierce: 0.35 } } } },
    },
    {
      key: 'jingasa', designs: [2], name: 'Wokou — dō-maru and iron hat',
      blurb: { en: 'Pirate’s armour and jingasa, a shallow iron hat that sheds a sword blow as a roof sheds rain. The cheapest helmet in Japan, for men who expected trouble from above and nowhere else.\nWang Zhi, the greatest pirate lord of his day, was lured ashore in 1557 by a governor’s promise of pardon and lawful trade.\nThe governor held him two years, then cut off his head.', zh: '倭寇的胴丸与阵笠。浅浅一顶铁笠，刀劈下来，如雨水顺檐滑落。全日本最便宜的盔，只防头顶，别处不防。\n一五五七年，那一代最大的海商头目汪直，被总督胡宗宪以招安、开海通商之约诱上岸来。\n关押两年之后，总督砍了他的头。' },
      patch: { extraMass: 0.08, protection: { bullet: { head: 0.15 }, regions: { head: { blunt: 0.35, cut: 0.6, pierce: 0.4 } } } },
    },
  ],
  hunNoble: [
    {
      key: 'mail', designs: [0], name: 'Hun noble — mail and spangenhelm',
      blurb: { en: 'Mail shirt taken from Rome or Persia, and a helmet of riveted iron segments with a gilded brow band. The Huns made no such armour. Their lords wore the empires they had beaten, and still smelled of horse beneath.\nAfter Attila died, his sons quarrelled over his subject peoples like heirs over cattle.\nIn 454 those peoples rose. The eldest son died in battle.', zh: '匈人贵族的锁子甲与分瓣盔。锁子甲取自罗马或波斯，铁条铆成的盔上一道镀金额箍。匈人自己不造这样的甲；他们的贵人只是把打败的帝国穿在身上，底下仍是一股马膻味。\n阿提拉死后，几个儿子争夺他麾下的各部，如同分家争牛。\n四五四年，各部起兵反叛，长子战死。' },
      patch: {},
    },
    {
      key: 'lamellar', designs: [1], name: 'Hun noble — leather lamellar and spangenhelm',
      blurb: { en: 'Lamellar of hardened leather, laced with rawhide: the steppe’s own armour, light enough to outrun every heavy army of the age.\nCatalaunian Plains, 451. Beaten by the Romans and the Goths, Attila was penned inside a ring of his own wagons.\nHe had the saddles piled into a pyre, to burn himself rather than be taken.\nAt dawn, the Romans did not attack.', zh: '匈人的硬皮札甲，以生皮绳编缀。草原自己的甲，轻得能甩开那个时代所有的重甲大军。\n四五一年，卡太隆尼平原。阿提拉败于罗马人与哥特人，困在自家的车阵中。\n他命人把马鞍堆成柴垛，宁可自焚，也不愿被俘。\n天亮时，罗马人没有进攻。' },
      patch: { extraMass: 0.1, protection: { blunt: 0.48, cut: 0.75, pierce: 0.45 } },
    },
  ],
  mexicaElite: [
    {
      key: 'jaguar', designs: [0, 2, 4], name: 'Jaguar warrior',
      blurb: { en: 'Suit of the Aztec jaguar warrior. Spotted hide over quilted cotton, the face looking out between carved wooden jaws. Only a man who had taken four captives for sacrifice could wear it.\nIn 1520, during a festival in the Aztec capital, Spanish soldiers locked the temple gates and cut down the dancing warriors in their finery.\nThey kept on until the drums stopped.', zh: '阿兹特克美洲豹武士的战衣。斑纹披在棉甲之外，脸从木雕的豹口中探出。唯有为祭坛活捉过四名俘虏的人，才能穿上。\n一五二〇年，阿兹特克都城祭神的节日里，西班牙兵锁上神庙大门，砍向盛装起舞的武士。\n一直砍到鼓声停了。' },
      patch: { protection: { blunt: 0.22, cut: 0.22, pierce: 0.2 } },
    },
    {
      key: 'eagle', designs: [1, 3], name: 'Eagle warrior',
      blurb: { en: 'Suit of the Aztec eagle warrior, the other elite order. Feathers over quilted cotton; an eagle’s open beak for a helmet. Sworn to feed the sun with human hearts, so that it would keep rising.\nCuauhtémoc, the last Aztec emperor, held the capital through the siege of 1521, until hunger and smallpox emptied it.\nCortés burned his feet with oil to learn where the gold was. Then he hanged him anyway.', zh: '阿兹特克雄鹰武士的羽衣，另一支精锐。羽毛覆于棉甲之上，头盔是一张张开的鹰喙。他们立誓以人心供奉太阳，好让太阳继续升起。\n末代皇帝夸乌特莫克守住都城，熬过一五二一年的围城，直到饥饿与天花将城掏空。\n科尔特斯以热油烧他的脚，逼问黄金的下落。问完，仍将他吊死。' },
      patch: { extraMass: 0.06, protection: { blunt: 0.18, cut: 0.18, pierce: 0.2 } },
    },
  ],
  mingBrigandine: [
    {
      key: 'bell', designs: [0, 2], name: 'Ming brigandine — bell helmet',
      blurb: { en: 'Brigandine of a Ming foot soldier. Cotton studded with iron rivets; within, a mosaic of hardened steel plates, supple and strong against every weapon of its age, even guns.\nWhen rations ran short, the quartermasters quietly pried the iron out from inside.\nCountless men marched to battle never knowing their armour was an empty shell.\nFrom outside, the cotton looked the same.', zh: '明军步卒的布面甲。棉布面上钉满铁泡，内里层叠淬火钢叶，柔而坚，当世兵器皆可抵挡，火器亦然。\n粮饷一断，管甲库的便悄悄撬走了里面的铁片。\n无数人穿着一副空壳上阵，至死不知。\n外面的棉布，看上去一模一样。' },
      patch: { protection: { regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 } } } },
    },
    {
      key: 'tube', designs: [1], name: 'Ming brigandine — riveted helmet',
      blurb: { en: 'Brigandine with its hidden plates, under a tall helmet of riveted iron strips. The coat keeps its secrets. The helmet is there for all to see.\nThe inspectors counted helmets, and helmets are easy to count. Hidden plates were not, so the quartermasters sold them to blacksmiths by the pound.\nMany men marched to the Wall with a sound helmet and an empty coat.', zh: '布面甲与铁条高盔。甲里藏着钢叶，盔以铁条铆成。甲守着自己的秘密，盔却明摆着给人看。\n点验的官员只数头盔，头盔好数。甲里的钢叶数不着，管库的便论斤卖给了铁匠。\n许多人上边墙时，头上一顶好盔，身上一领空甲。' },
      patch: { extraMass: 0.128, helmet: { mass: 1.6, padding: 0.35, curve: 0.75 }, protection: { regions: { head: { blunt: 0.58, cut: 0.87, pierce: 0.58 } } } },
    },
    {
      key: 'lamellar', designs: [3, 4], name: 'Ming iron lamellar — pointed helmet',
      blurb: { en: 'Iron plates laced in rows, and a plain pointed helmet. A design older than the dynasty, every plate on the outside where anyone could check it. A border soldier might wear his grandfather’s.\nWith nothing hidden to steal, the quartermaster saved on the laces. Cheap cord rotted in the rainy season.\nKorea, 1593. Ming soldiers met Japanese swordsmen in the spring mud, and the sodden laces gave way.', zh: '明军的札甲与素面尖盔。铁甲片成排编缀，形制比大明还老，片片露在外头，谁都查得到。边军身上的，兴许是祖父那一副。\n无物可偷，管库的便省在绳子上。廉价的绳，到雨季就烂。\n一五九三年，朝鲜。明军在春泥中迎上日本刀手，泡软的甲绳一扯便断。' },
      patch: { extraMass: 0.15, protection: { blunt: 0.6, cut: 0.83, pierce: 0.5, regions: { head: { blunt: 0.54, cut: 0.86, pierce: 0.6 }, UpperArm: { blunt: 0.6, cut: 0.83, pierce: 0.5 }, Forearm: { blunt: 0.6, cut: 0.83, pierce: 0.5 } } } },
    },
    {
      key: 'scale', designs: [5], name: 'Ming iron scale coat',
      blurb: { en: 'Coat of overlapping iron scales under the bell helmet, running down the chest like a fish’s flank. A blade slides off it as a fish slips from the hand.\nA starving garrison sells its costliest coat first.\nSarhu, 1619. The Ming sent four separate columns against the Manchus, who destroyed them one at a time, stripped the scales from the dead and wore them home.', zh: '明军的鳞甲与钟形盔。铁鳞层层相叠，顺胸而下，如鱼的侧身。刀砍上去会滑开，如鱼从手中溜走。\n卫所饿着肚子时，最先卖掉的就是最贵的甲。\n一六一九年，萨尔浒。明军分兵四路进攻后金，被逐路击破。八旗兵从死人身上剥下鳞甲，穿着回了家。' },
      patch: { extraMass: 0.15, protection: { blunt: 0.58, cut: 0.84, pierce: 0.44, regions: { head: { blunt: 0.55, cut: 0.85, pierce: 0.55 }, UpperArm: { blunt: 0.58, cut: 0.84, pierce: 0.44 }, Forearm: { blunt: 0.58, cut: 0.84, pierce: 0.44 } } } },
    },
  ],
  mingElite: [
    {
      key: 'brigandine', designs: [0, 1], name: 'Ming elite — brigandine, open helm',
      blurb: { en: 'Heavy brigandine and articulated steel armguards of a jiading, the household man of a wealthy general. Thick, overlapping tempered steel within: a wall of iron beneath the master’s vanity.\nBehind every man so armed stood three conscripts, stripped of their own gear and sent to march in threadbare cotton.\nThe general kept the ledger himself.', zh: '家丁的布面甲与分节钢臂缚。只赏给豪门将领的家丁。内里厚叠精钢甲叶。主子的体面之下，砌着一堵铁墙。\n每一个披挂齐整的家丁身后，都站着三个被剥了甲的营兵，裹着露絮的破棉袄上阵。\n账本，由将军自己掌管。' },
      patch: {},
    },
    {
      key: 'brigandineMasked', designs: [2], name: 'Ming elite — brigandine, masked helm',
      blurb: { en: 'Household man’s brigandine, and a steel helmet shaped like a snarling guardian beast. The best smiths in the province, paid to give the master’s anger a face.\nA man without a face could be sent to do anything: seize a rival’s family, burn a village behind on its taxes.\nWhen the master fell from favour, the mask went into chains with the rest of the household.', zh: '家丁的布面甲与镇兽钢盔。盔作龇牙的镇兽之形。全省最好的匠人收了钱，专为主子的怒气打一张脸。\n没有脸的人，什么差事都使得：抄政敌的家，烧欠税的村。\n主子失宠那日，这张面具与一家老小一同上了枷。' },
      patch: { extraMass: 0.275, protection: { regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'scale', designs: [3], name: 'Ming elite — scale armour, open helm',
      blurb: { en: 'Long coat of steel scales, polished and gilded at the edges, under a plumed helmet. On parade it shimmered like a goldfish: exactly as expensive as it looked, and about as useful.\nThe Wanli Emperor did not hold court for some twenty-five years. His guards stood gleaming before an empty hall.\nThe silver meant for the border troops went on gilt and parades.', zh: '明军侍卫的长鳞甲与缨盔。钢鳞磨亮，边缘鎏金。阅兵时闪如金鱼。华贵如其外表，也仅止于外表。\n万历皇帝二十余年不上朝。他的侍卫立在空荡的大殿前，金光闪闪。\n本该发给边军的饷银，化作了金箔与仪仗。' },
      patch: { extraMass: 0.28, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7 } },
    },
    {
      key: 'scaleMasked', designs: [4], name: 'Ming elite — scale armour, masked helm',
      blurb: { en: 'Steel scales and the snarling beast mask: the full harness of a warlord’s chosen few, heavy as duty and as hard to take off. Not an inch of the man shows. A walking statue of his master’s importance.\nIn 1644 rebels marched into Beijing. The last Ming emperor hanged himself behind his palace.\nThe masked guards found there was no one left to guard.', zh: '家丁的鳞甲与兽面盔。将门亲信的全副披挂，重如差事，也如差事一般脱不下来。浑身不露一寸。一尊会走的雕像，雕的是主子的分量。\n一六四四年，闯军入北京。崇祯皇帝自缢于宫后煤山。\n戴面具的侍卫这才发现，已无人可守。' },
      patch: { extraMass: 0.285, protection: { blunt: 0.6, cut: 0.96, pierce: 0.7, regions: { head: { blunt: 0.68, cut: 0.97, pierce: 0.8 } } } },
    },
    {
      key: 'lamellar', designs: [5], name: 'Ming elite — iron lamellar',
      blurb: { en: 'Iron plates laced with crimson cord and polished bright, the red marking the wearer as one of the elite. A uniform that mostly says ‘look at me’.\nIn 1449 the emperor’s favourite eunuch led the army against the Mongols, and halted to wait for his own baggage carts. At Tumu the thirsty army was destroyed.\nThe emperor was captured. His guards were not so lucky.', zh: '亲军的朱绳札甲。铁甲片以朱红绳编缀，磨得锃亮，那一抹红便是精锐的记号。这身军装，多半只为让人看见。\n一四四九年，皇帝宠信的太监王振统军北征瓦剌，途中停下等候自家的辎重车。土木堡，干渴的大军全军覆没。\n皇帝被俘。侍卫们没有这份运气。' },
      patch: { protection: { blunt: 0.62, cut: 0.94, pierce: 0.74 } },
    },
  ],
};

// What each one-set outfit is, for the picker.
export const OUTFIT_BLURBS = {
  boxing: { en: 'Trunks, laced boots and padded leather gloves of the boxing ring. After the Queensberry rules of 1867 the sport was respectable enough for gentlemen to bet on. The gloves were sold as the safety upgrade.\nThey saved the hands, so boxers could punch harder and more often. The brain paid the difference.\nThe promoters kept the purse. Old champions shuffled and slurred through their last years.', zh: '拳台上的短裤、系带拳靴与皮面拳套。一八六七年昆斯伯里规则之后，拳击总算体面到绅士肯下注。拳套卖的，是安全。\n拳套护住了手，拳便打得更重、更多。差价由脑子来付。\n奖金归了经纪人。老拳王的晚年，拖着脚走路，话也说不清。' },
  judogi: { en: 'The judogi. A jacket of heavy double-woven cotton, thick enough to be seized by collar and sleeve without tearing; a belt that says how long he has been thrown. In 1882 Kano Jigoro drew it from the jujutsu of samurai retainers and called it the gentle way: using another man\'s weight against him.\nImperial Japan taught it to police and conscripts, to the men who would take Nanjing and Manila. After the surrender the victors made it an Olympic sport.\nThe jacket stayed the same thickness. Only the hands on the collar changed.', zh: '柔道服。双层厚织棉布，揪住领口袖口也扯不破；一条腰带，记着他被摔了多少年。一八八二年，嘉纳治五郎自武士家臣的柔术中化出此道，名之曰“柔”：借对方之力，摔倒对方。\n帝国日本以此教授警察与新兵，教出了后来攻入南京、马尼拉的人。投降之后，战胜国又将柔道送进了奥运会。\n衣服始终一样厚。换的，只是揪着领口的手。' },
  dobok: { en: 'The dobok of taekwondo. White cotton jacket and trousers, a coloured belt tied twice, bare feet on the mat. Born in South Korea after the Korean War and drilled into army conscripts: very clean, very orderly, very white.\nIn the 1960s Korean instructors taught it to soldiers bound for the Vietnam War, where no one fought with their feet for long.\nThe belt measured years of training. The war measured something else.', zh: '跆拳道服。白棉布上衣与长裤，彩色腰带绕两圈，赤脚踏上垫子。朝鲜战争后生于韩国，成了新兵的必修。很干净，很整齐，很白。\n一九六〇年代，韩国教官将这门功夫教给开赴越南的士兵。在那里，没有人能靠双脚打多久。\n腰带量的是练了几年。战争量的，是另一样东西。' },
  mma: { en: 'Fight shorts and thin fingerless gloves: the uniform of the cage. Mixed martial artists learned every style and trusted none: the wrestler’s grip, the boxer’s jab, the choke artist’s patience.\nThe first tournaments of the 1990s sold ‘no rules’. The fighters got small purses and the whole risk.\nThe company that bought the league later sold it for billions.', zh: '综合格斗的短裤与露指拳套，铁笼的制服。练这门的人什么都学，什么都不全信：摔跤手的抓握，拳击手的刺拳，降服高手的耐心。\n九十年代最初几届比赛，卖的就是“没有规则”四个字。拳手拿一点小钱，担全部的风险。\n后来买下联盟的公司，转手卖了几十亿。' },
  sports: { en: 'Running kit of light synthetic fabric, bright and sweat-wicking, with foam-cushioned shoes for the long road. Lighter than a loaf of bread, and built for speed and nothing else.\nThe roads were built for two-tonne cars; he only borrows the edge. The reflective strips on his jacket are the whole of his armour against a century of engineering.\nThey did their job perfectly. They caught the headlights.', zh: '化纤跑步服与减震跑鞋。轻薄鲜亮，吸汗速干，鞋底泡棉，为长路而做。全套比一块面包还轻，只为速度，别无他用。\n路是为两吨重的汽车修的，他只借了路边。外套上那几道反光条，便是他对抗百年汽车工业的全部铠甲。\n反光条尽了职。车灯照见了他。' },
  sumo: { en: 'The mawashi alone. A band of heavy silk, metres long, wrapped tight around the hips for the opponent to grip and throw by. Sumo wrestlers build their bodies for one thing, the push: a man made into his own mountain.\nIn the training stables, young wrestlers are force-fed and beaten into bulk by their seniors. Some have died of it.\nRetired, they carry the weight into hearts and knees that give out decades early.', zh: '相扑的兜裆布。厚丝绸，长达数米，紧缠胯间，供对手抓握摔投。力士练一身肉只为一件事：推。人把自己堆成了一座山。\n相扑部屋里，前辈逼着新人吃，逼着新人挨打，养出一身膘。有人因此丧命。\n退役之后，这一身分量压着心脏与膝盖，比常人早垮几十年。' },
  business: { en: 'Wool suit, leather-soled shoes and a silk tie knotted at the throat: the armour of the office. Cut to show rank and nothing more, for a man who only ever meant to fight in meetings.\nGenerations wore it to the trading floor. In the crash of 1929, it is said, some wore it out of the window.\nThe suit was perfectly pressed. The accounts were not.', zh: '羊毛西装、皮底鞋与丝领带，写字楼的铠甲。剪裁只为显出级别，别无他用；穿的人，只打算在会议室里打仗。\n几代人穿着这身走进交易大厅。据说一九二九年大崩盘时，也有人穿着这身走出了窗口。\n西装熨得笔挺。账目没有。' },
  casual: { en: 'Flannel shirt and chinos: clothes for an ordinary day. An errand, a coffee, a walk to the car. Soft cotton worn thin at the cuffs, chosen for comfort by a man who expected nothing to happen.\nSo many news stories begin this way. The last photograph shows someone dressed just so, smiling at something off camera.\nThe day had other plans.', zh: '法兰绒衬衫与卡其裤，寻常日子的衣着。办点事，喝杯咖啡，走到车边。软棉布，袖口已磨薄，图的是舒服；穿的人，没想过今天会出事。\n许多新闻都这样开头。最后一张照片里，人总是穿着这样一身，对着镜头外的什么在笑。\n这一天，另有安排。' },
  hiking: { en: 'Waterproof shell and stout leather boots with deep-tread soles, made for wind on a mountain ridge. It keeps out the rain, holds in the heat, and grips loose rock like a goat. A very confident outfit.\nThe rescue teams keep count. Every year they find walkers in kit just like this, at the foot of a slope in spring, or never at all.\nA bright jacket fades on a ledge no one can reach.', zh: '冲锋衣与深齿厚皮靴，为山脊上的风而做。挡雨，锁温，踩碎石稳如山羊。很有底气的一身。\n搜救队记着数。每年都能找到这样一身的人，春天，在某道坡底；或是永远找不到。\n一件鲜亮的外套，在无人够得着的岩架上慢慢褪色。' },
  thug: { en: 'Track jacket, a beanie pulled low, trainers scuffed at the toes: the uniform of the street corner, cheap and easy to throw away.\nThe youth club closed. The jobs moved abroad.\nThe knife he carries is meant to earn respect. It usually ends up in a friend, or in himself, in a stairwell that smells of rain.', zh: '运动外套、低压的毛线帽与磨花了头的球鞋，街角的制服。便宜，扔了也不心疼。\n少年活动中心关了门。工厂搬去了国外。\n兜里那把刀，本想换几分面子。到头来多半捅进了兄弟身上，或是自己身上，在一个满是雨水味的楼道里。' },
  yakuza: { en: 'His back bared to show the irezumi: a lifetime of hand-pricked tattoos, stopping at wrist and collar so a business shirt can hide them. A membership card, printed in skin.\nHe strips to fight, so the enemy sees whom he belongs to. When he fails his boss, he cuts off the tip of his little finger and hands it over, wrapped in cloth, with a polite bow.\nThe boss keeps all ten.', zh: '极道的刺青。一针一针手刺了一辈子，止于手腕与领口，好让一件衬衫遮住。一张印在皮肤上的会员证。\n打架先脱衣，是让对方看清他是谁家的人。差事办砸了，便切下小指的一截，以布包好，恭敬鞠躬，双手奉上。\n老大的十根手指，一根不少。' },
  victorianGent: { en: 'Wool frock coat, starched collar and silk top hat of a Victorian gentleman of the 1860s. Fit for the club, the church and the argument afterwards: respectability, buttoned to the neck.\nHis dividends came from cotton mills and the opium trade, worked by people he never had to meet, many of them children.\nThe coat strolled through the slums without collecting a speck.', zh: '一八六〇年代维多利亚绅士的长礼服、浆领与丝面高礼帽。去俱乐部，去教堂，散场后争几句，都合宜。体面，一直扣到脖子。\n他的股息来自棉纺厂与鸦片生意。做工的人他一个也不必见，其中许多是孩子。\n这身礼服走过贫民窟，一粒灰也没沾上。' },
  victorianLady: { en: 'Whalebone corset laced tight, layers of petticoats, a hooped crinoline: a Victorian lady in full dress. The corset holds her stiff as a breastplate; the skirts drag at every step. Fashion, as a very elegant cage.\nCrinolines caught fire so often that thousands of women burned to death in them.\nIn 1871 Oscar Wilde lost two half-sisters that way.', zh: '维多利亚淑女的鲸骨胸衣与裙撑。胸衣勒紧，衬裙层层，外撑一副裙箍。胸衣把她撑得如披胸甲，裙摆每一步都在后拖。时尚，一只极优雅的笼子。\n裙箍时常着火，成千上万的女人就这样被活活烧死。\n一八七一年，王尔德的两个同父异母姐姐，也是这样死的。' },
  rags: { en: 'Torn shirt and bare feet, the cloth gone grey from being slept in. The beggar, the prisoner, the forgotten man, who sold his last belongings for bread, down to nothing but his own stubbornness.\nEvery age has had a tidy way of being rid of him: the workhouse, the debtors’ prison, the ship to the penal colonies of Australia.\nSomehow, for a while, he outlasts each of them.', zh: '破衫与赤脚。衣裳睡得发灰。乞丐，囚徒，被遗忘的人，最后一点家当换了面包，身上只剩一股倔劲。\n每个时代打发他，都有一套干净利落的办法：济贫院，债务人监狱，开往澳洲流放地的船。\n而他，总能莫名地多熬一阵。' },
  commoner: { en: 'Wool tunic and hose, a hood, a belt for a knife: a medieval farm labourer. He grew the food that fed the knights, who then rode over his fields. He paid for the armour and never wore any.\nIn 1381 English peasants rose under Wat Tyler and marched on London over a new tax. The teenage King Richard II promised them everything.\nTyler was stabbed. By harvest every promise had been broken.', zh: '中世纪长工的羊毛短袍与兜帽。长袜，腰带上挂一把小刀。骑士吃的粮由他来种，骑士的马又踏过他的田。铠甲由他出钱，他自己一片也没穿过。\n一三八一年，朝廷开征新税，英格兰农民随瓦特·泰勒进军伦敦。十几岁的理查二世什么都答应了。\n泰勒被刺。不到秋收，许过的话一句也没兑现。' },
  joan: { en: 'Bright white plate from head to foot under a red tunic, made in 1429 at the future king’s expense for a farm girl from Domrémy. Joan of Arc carried a banner, not a sword, so that she would never have to kill.\nShe won Orléans and crowned Charles. When she was captured, he left her to the English.\nIn 1431 they burned her as a witch. She was nineteen. The king did nothing.', zh: '贞德的白甲与红袍。一四二九年，未来的国王出钱，为一个栋雷米的农家姑娘打了这一身雪亮的白甲。她手中擎的是旗，不是剑，好让自己永远不必杀人。\n她解了奥尔良之围，将查理送上王位。她被俘后，国王把她留给了英格兰人。\n一四三一年，她以女巫之名被烧死，年仅十九。国王什么也没做。' },
  templar: { en: 'Mail from head to foot under a white surcoat with a red cross, and a flat-topped great helm. The Knights Templar: monks sworn to poverty, dressed like an army of angels.\nThey grew rich and lent to kings. King Philip of France, deep in their debt, had them all arrested on Friday the thirteenth in 1307, and burned their leader.\nThe debt was cleared.', zh: '圣殿骑士的锁甲、红十字罩袍与平顶大盔。发过安贫誓的修士，打扮得如同一支天使军。\n他们渐渐富了，钱借给了各国君王。欠了他们一大笔债的法王腓力四世，于一三〇七年一个十三号的星期五，将他们尽数拘捕，又烧死了大团长。\n债，就此清了。' },
  tournament: { en: 'The Stechzeug, German jousting armour bolted to a thick frog-mouthed helm. The rider sees the lance only by lifting his head at the last moment. The armourers built their best work for the rich man’s favourite sport.\nIn 1559 King Henry II of France jousted at his daughter’s wedding. His opponent’s lance shattered, and a splinter went through the visor into his eye.\nHe took ten days to die.', zh: '德意志刺枪比武甲。整副甲以螺栓固定在厚重的蛙嘴盔上，骑手须在最后一刻抬头，才看得见迎面的枪。甲匠们最好的手艺，都给了富人最爱的这门消遣。\n一五五九年，法王亨利二世在女儿的婚礼上下场比武。对手的枪迸碎，一根木刺穿过面甲，扎进他的眼睛。\n他过了十天才死去。' },
  police: { en: 'Navy uniform and a soft vest of woven fibre, with a belt for radio, cuffs and pistol. Enough to stop a knife or a handgun bullet on an ordinary shift.\nNorth Hollywood, 1997. Two bank robbers in homemade armour fired rifles for forty-four minutes while police bullets bounced off. Officers borrowed rifles from a gun shop.\nAfterwards police everywhere bought rifles. The contractors were glad to help.', zh: '警察的藏青制服与纤维软防弹衣。腰带上挂着对讲机、手铐与手枪。寻常一班，挡一把刀、一颗手枪子弹，足够了。\n一九九七年，北好莱坞。两名银行劫匪身穿自制护甲，持步枪射击了四十四分钟，警察的子弹打上去纷纷弹开。警员只好去枪店借步枪。\n此后各地警局都买了步枪。军火商乐于效劳。' },
  riot: { en: 'Riot gear. A padded suit, hard plastic shells on the limbs, a helmet with a clear visor, a long shield and a baton. A whole industry sells it, and business is good whenever the public is angry.\nOn both sides of the shield stand people who mostly did not choose to be there. The same kit has protected crowds and charged them.\nWho wore the villain’s costume, history decides later, and rarely kindly.', zh: '防暴装备。护垫衣，四肢扣着硬塑料壳，头盔带透明面罩，一面长盾，一根警棍。整整一个产业专卖这一身，民众每发一回火，生意便好一回。\n盾的两边，站的多半都不是自愿来的人。同一身行头，护过人群，也冲过人群。\n谁穿的是反派的戏服，日后由史书判定。史书很少手软。' },
  swat: { en: 'Heavy tactical armour: hard plates, a bulletproof helmet with a sealed visor, a ram for the door. Born in 1960s Los Angeles after a sniper showed how outgunned the police were, then sold to every small-town force with a grant to spend.\nIt has saved hostages who would otherwise be dead.\nSometimes the warrant names the wrong house. The man inside grabs whatever is near. No one goes home the same.', zh: '特警的重型战术护甲。硬插板，防弹头盔配密封面罩，一根撞门锤。六十年代生于洛杉矶，一名狙击手让人看清了警察的火力差了多少；后来卖给了每一个有拨款要花的小镇警局。\n这身甲救下过本该丧命的人质。\n有时，搜查令写错了门牌。屋里的人随手抓起身边的东西。那一夜之后，谁都回不到从前。' },
  infantry: { en: 'Armour of a modern soldier. Ceramic plates front and back, an aramid helmet, a pack heavier than both. Defence contractors billed a fortune for it, and the plates truly stopped rifle bullets that would have killed his grandfather.\nIn Iraq and Afghanistan the bombs came from below, where no plate was.\nA generation came home with whole chests and missing legs. The contractors sold the army new trucks.', zh: '现代步兵的插板与芳纶盔。前胸后背各一块陶瓷插板，背包比两样加起来还重。军火承包商开了天价；插板也确实挡得住步枪弹，若在他祖父那一代，早已没命。\n在伊拉克与阿富汗，炸弹从脚下来，那里没有插板。\n一整代人回了家，胸口完好，双腿没了。承包商又卖给军队一批新卡车。' },
  specialForces: { en: 'Kit of a special-forces operator. Plate carrier, cut-down helmet, night-vision goggles, everything stripped for speed. The newest gear goes to these few first, years before the regular army sees it.\nMogadishu, 1993. US Rangers left their back plates and night-vision behind for what was meant to be an hour’s raid.\nIt became a night and a morning of street fighting. Eighteen Americans did not come back.', zh: '特种部队的插板背心与夜视仪。削边头盔，一切为求快，能卸的都卸了。最新的装备先给这少数人，正规军要等许多年。\n一九九三年，摩加迪沙。美军游骑兵为一场本该只有一个钟头的突袭，留下了后背插板与夜视仪。\n结果打成一夜又一个早晨的巷战。十八个美国人没有回来。' },
  proximity: { en: 'Silver proximity suit of a firefighter, throwing back the heat of burning fuel, its gold-tinted visor a mirror. Space-age materials, paid for by airlines and oil companies who would rather not lose a plane or a refinery.\nThe insurers wanted the assets saved; the suit saves people too. At airports, crews walk toward burning jets, close enough to drag a pilot out.\nOne step nearer, and the suit promises nothing.', zh: '消防员的银色隔热服。燃油的热浪被整片反射回去，金色面罩如镜。太空时代的料子，钱由航空公司与石油公司出，飞机与炼油厂，他们一样也不愿丢。\n保险公司要保的是资产，人也一并保住了。机场的消防队迎着燃烧的客机走去，近到能把飞行员拖出来。\n再近一步，这身衣服便什么也不担保了。' },
  fireEntry: { en: 'Fire-entry suit: thick silver layers and insulation, worn to walk into the flames, with air from a tank on the back. It buys a few minutes from the fire, and the wearer counts every one.\nChernobyl, 1986. The first firemen climbed onto the burning reactor in ordinary gear, because officials insisted it was a simple roof fire.\nWithin weeks most of them were dead of radiation. No one had told them.', zh: '消防员的进火服。厚银层与隔热棉，穿着直入火中，背上一罐空气。能从火里争得几分钟，穿的人一分一分地数。\n一九八六年，切尔诺贝利。第一批消防员穿着寻常装备爬上燃烧的反应堆，因为官员坚称，那只是屋顶着火。\n几周之内，他们大多死于辐射。没有人告诉过他们。' },
  humanoid: { en: 'Full-size humanoid robot. An aluminium frame in white plastic shells, motors humming like trapped insects. Built by tech firms racing for a trillion-dollar market, to carry our boxes and, one day, do our jobs.\nIt will lift what breaks human backs and work the shifts no one wants. The wages it saves do not go to the warehouse worker it replaces.\nIts makers filmed engineers kicking it, to show off its balance. The investors loved it.', zh: '全尺寸人形机器人。铝骨架裹着白色塑料壳，电机嗡鸣，如困在壳中的虫。科技公司争夺一个万亿美元的市场，造来替人搬箱子，有朝一日，替人上班。\n压垮人腰的重物，机器来扛；没人愿上的班，机器来上。省下的工钱，不归被顶替的仓库工人。\n厂家拍下工程师踹机器人的视频，炫耀平衡。投资人很喜欢。' },
  miniHumanoid: { en: 'Small humanoid robot, knee-high: metal and servos, a camera for a head. Built to teach children, dance at trade shows and play robot football. The friendly demo that keeps the research money coming.\nEvery tournament some topple, twitch and are carried off by grown men in lanyards.\nEvery year the new model is faster. The old ones go into a box marked spares.', zh: '小型人形机器人，高不过膝。金属与舵机，头是一只摄像头。造来教孩子、在展会上跳舞、踢机器人足球。和气的演示，让科研经费源源不断。\n每届比赛，总有几台摔倒、抽搐，被挂着胸牌的大人抱下场。\n新型号一年比一年快。旧的，进了一只写着“备件”的箱子。' },
  combatBot: { en: 'Armoured combat robot. A rifle and a shotgun for forearms, sensors for a head, a model number for a name. A defence contractor’s dream product: a soldier that never needs a pension.\nIt can go where a man would die, and that is real.\nDallas, 2016. Police sent a bomb-disposal robot loaded with explosives toward a cornered gunman. It was the first time US police had killed with a robot.', zh: '装甲战斗机器人。两条前臂，一为步枪，一为霰弹枪；头是一组传感器，名字是一串型号。军火商梦寐以求的货品：一个永不领退休金的兵。\n人去了会死的地方，机器去得了。这是真的。\n二〇一六年，达拉斯。警察让一台排爆机器人载着炸药，驶向一名被围困的枪手。这是美国警察第一次用机器人杀人。' },
  exoArmoured: { en: 'Sealed armour over a powered exoskeleton, motors carrying weight his body never could. Every punch carries more than his own strength: a man upgraded to a forklift.\nThe US Army spent years and a fortune on a suit called TALOS. The batteries lasted hours. The contract lasted longer.\nThe project was quietly cancelled in 2019. Pieces of it now help factory workers lift without wrecking their backs.', zh: '动力外骨骼与密封装甲。电机扛起肉身扛不动的分量，每一拳都远超他自己的力气。一个人，升级成了一台叉车。\n美国陆军在一套名为“塔罗斯”的战甲上耗了数年与巨款。电池撑几个钟头，合同撑得更久。\n二〇一九年，项目悄然下马。留下的零件，如今帮工厂工人搬东西时少伤些腰。' },
  silverback: { en: 'A silverback gorilla, head of his family, his back gone grey with age. He needs no armour; his arms could fold a man in half. He would rather eat leaves.\nMen hunted his kind for trophies, and sold their hands to tourists as ashtrays.\nIn 1977 poachers killed Digit, a gorilla the researcher Dian Fossey loved. In 1985 someone killed Fossey too.', zh: '银背大猩猩，一家之长，背上的毛随年岁褪为灰白。他不需要铠甲，双臂能将人对折。他更愿意吃树叶。\n人猎杀他的同类充作战利品，把手掌做成烟灰缸卖给游客。\n一九七七年，偷猎者杀死了迪吉特，研究者戴安·福西最心爱的大猩猩。一九八五年，福西也被人杀害。' },
  monkeyFur: { en: 'A wild primate: macaque, baboon or chimpanzee. Fur, muscle, long teeth, gripping hands and a cunning older than ours, in a face uncomfortably like our own.\nWe strapped his relatives into rockets and laboratory rigs, and some of our medicine is owed to them.\nIn 2009 a pet chimpanzee in Connecticut, raised as a child of the house, savagely attacked a visitor. He was shot in the kitchen.', zh: '野生灵长类。猕猴、狒狒或黑猩猩：皮毛，筋肉，长牙，一双抓得牢的手，一股比人类更古老的狡黠，长在一张与我们像得令人不安的脸上。\n我们把他的亲族绑进火箭、绑上实验台。我们的一些药，是欠着他们的。\n二〇〇九年，康涅狄格州一只当作孩子养大的宠物黑猩猩，重伤了上门的客人。他在厨房里被一枪打死。' },
  kungfu: { en: 'Loose silk suit with knotted cloth buttons, matching trousers and cloth shoes: the dress of the kung fu masters of southern China, who taught in courtyards among the incense smoke. Discipline, worn as lightly as breath.\nIn 1900 the Boxers, trained in the martial arts, believed their rituals made them proof against bullets. They rose against the foreigners in China.\nEight foreign armies marched on Beijing. The rifles settled the matter.', zh: '唐装、盘扣与布鞋。宽松丝绸，同色长裤，华南功夫师傅的装束，在香火缭绕的院中授徒。功夫穿在身上，轻如一口气。\n一九〇〇年，习拳的义和团相信符咒能令人刀枪不入，起而扶清灭洋。\n八国联军开进北京。此事由步枪定论。' },
  monk: { en: 'Grey cotton robe of a Shaolin monk, leggings bound at the shins, head shaved. The monks made fighting a spiritual practice: a prayer said with the fists.\nIn 621, it is said, thirteen monks helped a future Tang emperor win a war, and the temple was rewarded with land.\nIn 1928 a warlord burned it, library and all. It burned for forty days.', zh: '少林僧人的灰布僧袍。绑腿扎至小腿，头剃得精光。僧人把习武修成了功课，以拳头诵经。\n据说六二一年，十三棍僧助秦王李世民打赢一仗，寺院得了赏田。\n一九二八年，一个军阀放火烧寺，连同藏经阁。大火烧了四十天。' },
  wuxia: { en: 'Robe and sash of a wandering swordsman from the Chinese adventure tales, a cloth-wrapped sword on his back. He answers to no lord, only to his own code of honour: exactly the sort of man governments love.\nAround 100 BC the historian Sima Qian wrote of real knights-errant.\nThe emperor had the most famous, Guo Xie, executed with his whole family, for being too popular.', zh: '游侠的长袍、腰带与布裹长剑。浪迹江湖，不认主公，只认心中道义。朝廷最喜欢这样的人。\n两千多年前，司马迁为真实的游侠立传。\n名声最响的郭解，被汉武帝满门抄斩。罪名，是太得人心。' },
  wokou: { en: 'Loose robe and long blade of a pirate of the Chinese coast in the 1500s. Japanese, Chinese and Portuguese all sailed under the name, because the Ming emperors had banned trade by sea.\nThe ban turned merchants into smugglers, and smugglers into raiders.\nWhen the court lifted it in 1567, the raids faded. Whole coastal districts had already burned. The court called it a victory.', zh: '倭寇的宽袍与长刀。十六世纪的中国沿海，日本人、中国人、葡萄牙人都以此名出海，因为大明禁了海上贸易。\n海禁把商人逼成走私者，又把走私者逼成强盗。\n一五六七年隆庆开关，海患渐平。沿海整片州县，早已烧成白地。朝廷称之为大捷。' },
  guanYu: { en: 'Green robe over gilded scale armour, the long beard carefully combed: Guan Yu, the famous general of the Three Kingdoms. The legend says he swore brotherhood with the warlord Liu Bei. Loyalty, made flesh and steel.\nHe held a key province, and lost it when a supposed ally attacked from behind.\nHe was beheaded in 220. His head was sent to a rival as a gift.\nToday he is a god in a thousand temples.', zh: '关羽的绿袍与鎏金鳞甲。三国名将，长髯梳理得一丝不乱。传说他与刘备结义为兄弟。“忠义”二字，有了血肉与钢铁。\n他镇守荆州，被所谓的盟友从背后袭取。\n二二〇年，他被斩首，首级被当作礼物，送给了对头。\n如今，千座庙里供着他。' },
  hanSoldier: { en: 'Armour of a Han soldier. Iron plate over a red robe, a helmet of narrow iron strips, and a crossbow with a mass-produced trigger, centuries ahead of Europe. One small part of the machine that manned the signal towers of the Silk Road.\nWhat survives of him is paperwork. Bamboo slips in the desert record his requests for boots, reports of deserters, and the names of the sick and the dead.\nAll in a clerk’s neat hand.', zh: '汉军戍卒的铁甲与弩。红袍外披铁甲，头戴窄铁条编成的盔；弩机成批铸造，领先欧洲数百年。丝路烽燧这部大机器上，他是小小一个零件。\n留下来的，只有公文。沙漠中出土的简牍，记着他请领鞋履，记着逃卒，记着病者与死者的名字。\n字是书吏写的，工工整整。' },
  hanCavalry: { en: 'Iron plate cut for riding, and a ring-pommelled sword: a Han horseman. Emperor Wu bred bigger horses and forged more iron, to send riders like him deep into the steppe after the nomads.\nIn 119 BC the veteran general Li Guang lost his way in the desert and came late to battle.\nRather than face the court’s clerks, he cut his own throat.', zh: '汉军骑兵的铁甲与环首刀。甲为骑乘而裁。汉武帝养大马、多炼铁，只为把这样的骑手送进草原深处，追击匈奴。\n公元前一一九年，老将李广在大漠中迷路，误了会战之期。\n他说：“终不能复对刀笔之吏。”遂引刀自刭。' },
  bannerArmour: { en: 'Armour of the Eight Banners. The Ming brigandine’s own make: iron plates riveted inside a long studded coat, in one of only eight colours, yellow, white, red and blue, plain or bordered. The coat was copied from the enemy. The men inside it were not.\nNurhaci sorted every Jurchen household into a banner, and the banner fed, armed and drilled it.\nAt Fushun in 1618 he took three hundred thousand head of people and livestock, and gave the captives to the banners as bondservants.\nEach victory paid for the next coat. The losers paid the bill.', zh: '八旗的棉甲。仿明军布面甲之制：长袍内铆铁片，外钉泡钉。颜色只有八种：黄、白、红、蓝，或正或镶。甲照着敌人仿造；穿甲的人，却不是。\n努尔哈赤将女真每一户编入旗中，旗管衣食，发刀甲，督操练。\n一六一八年，努尔哈赤攻下抚顺，掳获人畜三十万，俘虏分给各旗为包衣。\n每一场胜仗，都为下一件甲付了账。付账的，是战败的人。' },
  bayara: BAYARA_BLURB,
  ironPagoda: { en: 'Iron Pagoda, the heavy cavalry of the Jin. Iron plates from neck to shin, a heavy helmet, armoured horses. A moving wall of iron, rolling south against the Song.\nYancheng, 1140. The Song general Yue Fei sent men underneath with axes to cut the horses’ legs. It worked.\nTwo years later his own government put him to death on invented charges, to please the enemy.', zh: '金国重骑铁浮屠的铠甲。铁甲自颈护至胫，头顶重盔，马亦披甲。一堵会走的铁墙，向南宋碾去。\n一一四〇年，郾城。岳飞遣步卒钻入马下，持斧专砍马足。此法奏效。\n两年后，他自己的朝廷以莫须有之罪杀了他，以讨好敌国。' },
  mingGarrison: { en: 'Hemp vest of a weisuo garrison soldier. A belt, a head-cloth, a spear drawn from a damp storehouse.\nBorn to a soldier household, he was a soldier as his father was, handed down like a field.\nIn time the field went to his officer, and his rations with it. Those who stayed tilled the officer’s land, and took up their spears only on the day the inspector came.\nWhether he was the Ming’s soldier or his officer’s farmhand, no one ever asked.', zh: '卫所兵的麻布坎肩。一条腰带，一块包头布，一杆从潮湿库房里领出的长枪。\n生在军户，便世代为兵，如同一块田，父传子，子传孙。\n后来那块田归了上官，连同他的口粮。留下的人替上官耕作，唯有巡按到来之日，才重新握起长枪。\n他究竟是大明的兵，还是上官的长工，从来无人过问。' },
  mingIronLamellar: { en: 'Ming border cavalry: iron plates over a Mongol-style coat, a pointed steppe helmet, a horse bow. They dressed like the enemy and were often the enemy’s cousins. A Great Wall built partly of borrowed loyalty.\nWhen the pay was late, whole garrisons changed sides with the seasons.\nIn 1644 the general Wu Sangui opened the Wall’s main gate to the Manchus. They rode in and took the empire he had been paid to protect.', zh: '明军边骑的铁甲与尖顶盔。蒙古式长袍外披铁甲，头戴草原尖盔，手持马弓。装束与敌人无异，往往本就是敌人的表亲。长城有一段，是用借来的忠心砌成的。\n饷银一迟，整座边堡便随季节易主。\n一六四四年，吴三桂打开山海关。满洲人长驱直入，取走了他受饷守护的江山。' },
  ashigaru: { en: 'Cuirass and war hat of the ashigaru. Black-lacquered iron scales; the lord’s crest on the hat.\nMade by the thousand, kept in the castle armoury, lent out for war. Men who walked behind the plough were forged into a machine of war.\nAfter Sekigahara the nameless heads went into the head-mounds. The armour was gathered up, to wait for the next man.\nThe armour remembers every man who wore it. No one remembers them.', zh: '足轻的胴甲与阵笠。黑漆铁札，笠上印着主家的家纹。\n成批打造，存于城中武库，战时借给足轻。平日扶犁的农人，就这样被打造成了战争的机器。\n关原一役，无名的首级埋入首冢，铠甲则被收回，等待下一个穿上它的人。\n铠甲记得每一个主人，却没有人记得他们。' },
  oyoroi: { en: 'The great armour of the early samurai, in full. Silk-laced plates, broad shoulder boards, a helmet with gilded horns. So heavy the noble archer inside could barely walk; he had a horse for that.\nIchi-no-Tani, 1184. A veteran knocked a fleeing enemy from his horse, pulled off the helmet, and found a boy of sixteen with a flute in his belt.\nHe killed him anyway. He wept, and became a monk.', zh: '早期武士的大铠，全副。丝绳缀甲，大袖宽阔，盔上一对镀金锹形。重得里面的贵族弓手几乎迈不开步；好在他有马。\n一一八四年，一之谷。熊谷直实将一名逃跑的敌将打下马，扯下头盔，见是一个十六岁的少年，腰间别着一支笛子。\n他还是杀了少年。他哭了一场，后来出家为僧。' },
  ronin: { en: 'Worn cloak over odd pieces of armour, a straw hat pulled low, and two swords he cannot bring himself to sell: a masterless samurai. His stipend died with his lord.\nIn 1703 forty-seven such men plotted for two years, killed their lord’s enemy in the snow, and laid the head on his grave.\nThe government praised their loyalty. Then it ordered them all to kill themselves.', zh: '浪人的破斗篷与斗笠。斗篷罩着东拼西凑的甲，斗笠压得低低的，两口刀怎么也舍不得卖。俸禄随主公一同死了。\n一七〇三年，四十七名这样的浪人密谋两年，雪夜里杀了主公的仇人，将首级供于主公墓前。\n幕府赞其忠义。随后，命他们全数切腹。' },
  sohei: { en: 'White hood wrapped to the eyes, robes over lamellar, a naginata as long as a doorway: a Buddhist warrior monk. For centuries they marched on Kyoto bearing holy shrines, to bully the imperial court.\nOne retired emperor famously named three things he could not command: the river, the dice, and the monks.\nOda Nobunaga could. In 1571 he burned their mountain temple, and killed its monks, women and children.', zh: '僧兵的白头巾与薙刀。头巾裹得只剩一双眼，僧袍下套着札甲，薙刀比门框还长。数百年间，他们抬着神舆开进京都，向朝廷施压。\n有位法皇曾叹：天下不如意者三，鸭川之水，双六之骰，山法师。\n织田信长管得住。一五七一年，他火烧比叡山，僧人、妇女、孩童，一个不留。' },
  hoplomachus: { en: 'Helmet of the hoplomachus, crested and brimmed with a face grille; padded leggings and tall greaves, a small round shield, a spear, and a dagger for when the spear was gone. Dressed as a Greek soldier, for a Roman crowd.\nRome made the Greek hero into a costume, and put it on slaves and prisoners.\nGladiator gravestones, where there were any, list fights won and age at death. It is rarely over thirty.', zh: '重装斗士的冠盔与小圆盾。盔有冠有檐，前设面栅；腿缠棉护，胫套高甲；一杆矛，矛失了还有匕首。扮作希腊兵，演给罗马人看。\n罗马把希腊英雄做成了戏服，穿在奴隶与俘虏身上。\n斗士若有墓碑，刻的不过两样：胜了几场，死时几岁。很少过三十。' },
  murmillo: { en: 'Helmet of the murmillo, broad-brimmed, with a fish-shaped crest and a face grille; a padded sleeve on the sword arm, one greave, a big curved shield. Named, it is thought, after a kind of fish.\nHis usual opponent, the net-fighter, would sing: ‘I’m not after you, I’m after your fish.’\nIn a gladiators’ graveyard in Turkey lie skulls with three neat holes, exactly the width of a trident.', zh: '鱼盔斗士的宽檐盔与弧形大盾。盔顶一道鱼形冠，前设面栅；持剑的臂裹棉袖，一腿套胫甲。名字据说来自一种鱼。\n他的老对手网斗士上场时会唱：“我不是冲你来的，是冲你的鱼来的。”\n土耳其一处斗士墓地出土的头骨上，有三个齐整的孔洞，间距恰是一柄三叉戟。' },
  retiarius: { en: 'Net and trident of the retiarius. No helmet; a metal shoulder guard, a padded sleeve, a weighted net. The arena’s fisherman, quick and nearly naked, his bare face thought a little shameful.\nThe poet Juvenal mocked a Roman of ancient family who fought as a retiarius, so that all Rome could see his face.\nAnd watch him run away.', zh: '网斗士的网与三叉戟。不戴头盔，一块金属护肩，一条棉袖，一张坠铅的网。竞技场上的渔夫，身手敏捷，近乎赤身；脸露在外，罗马人看来不甚光彩。\n诗人尤维纳利斯讥讽过一位世家子弟，偏以网斗士身份下场，好让全罗马看清他的脸。\n再看着他掉头逃跑。' },
  scissor: { en: 'The scissor gladiator. A steel tube over the left forearm ending in a curved blade, scale armour on the body, a smooth egg-shaped helmet with two round eyeholes. Known from a few carvings and very little else.\nHistorians still argue over his name and his purpose.\nWhoever wore the tube had his name carved once, briefly. The rest of him went into the sand, without a written word.', zh: '剪刃斗士的钢管与蛋形盔。左前臂套一根钢管，管端一弯月牙刃；身披鳞甲，盔面光滑，只开两个圆眼洞。传世的只有几块浮雕，此外几乎一无所有。\n他叫什么、做什么用，史家至今仍在争论。\n套过那根钢管的人，名字只草草刻过一回。其余的，连同他本人，都进了沙中，没有留下一个字。' },
  secutor: { en: 'Egg-shaped helmet of the secutor, with two tiny eyeholes so no trident could get in; a padded sleeve and a big shield. His task was to chase the net-fighter around the arena.\nThe eyeholes were so small that he was soon breathing his own stale air.\nThe net-fighter had only to keep running and wait. The helmet would do the strangling for him.', zh: '追击斗士的蛋形盔与大盾。盔上只留两个小眼洞，三叉戟的齿伸不进来；一条棉袖。他的差事，是满场追赶网斗士。\n眼洞太小，不消多久，吸进的便全是自己呼出的浊气。\n网斗士只需一直跑，一直等。勒死他的事，头盔自会去做。' },
  thraex: { en: 'Helmet of the thraex, the Thracian gladiator, griffin-crested with a face grille; tall greaves, a small square shield, a curved short sword. Rome dressed him as one of its defeated enemies, for fun.\nIn 73 BC, it is said, Spartacus broke out of a gladiator school with seventy men and kitchen knives.\nTwo years later six thousand of his followers were crucified along the road to Rome.', zh: '色雷斯斗士的狮鹫冠盔与小方盾。盔前设面栅；高胫甲，一把弯短剑。罗马把他扮作自己的手下败将，图个乐子。\n相传公元前七十三年，斯巴达克斯带着七十人和几把厨刀，杀出了斗士学校。\n两年后，他的六千名追随者被钉死在通往罗马的大道两旁。' },
  maximus: { en: 'Leather breastplate and bracers of a Roman general turned gladiator; no helmet, and a sword scarred from the wars in the north. Once he commanded armies. Now he waits for the crowd’s thumb.\nRome had real ones: noblemen ruined by debt or politics who signed themselves over to a gladiator school, swearing to endure fire, chains, whip and sword.\nThe Senate banned it. Then it had to ban it again.', zh: '沦为斗士的将军，皮胸甲与护腕。不戴头盔，剑上满是北方战场留下的豁口。从前号令三军，如今等着看台上的那根拇指。\n罗马确有其人：因债务或政争破落的贵族，把自己卖进斗士学校，立誓甘受火烧、锁链、鞭笞与刀剑。\n元老院下令禁止。后来，又不得不再禁一次。' },
  lorarius: { en: 'Plain tunic and whip of the lorarius, the whip-man of the arena. His task was to drive reluctant fighters onto the sand: the middle management of the slaughter.\nWhen a fighter fell and stayed down, attendants dressed as gods of the dead tested him with a hot iron, and dragged him out through the Gate of Death.\nThe whip-man watched every one.', zh: '执鞭人的粗布短衣与长鞭。竞技场上，不肯上场的斗士由他赶上沙地。屠场里的中层管理。\n斗士倒地不起，扮作冥神的杂役便以烙铁试探，再从死亡之门拖出去。\n每一个，执鞭人都看着。' },
  commodus: { en: 'Lion skin and club of the emperor Commodus as Hercules. Son of the philosopher-emperor Marcus Aurelius, he fought in the arena against men who knew better than to win, and billed the treasury for every fight.\nHe cut the heads off ostriches and waved them at the senators, who chewed leaves to keep from laughing.\nIn 192 his own wrestling coach strangled him in his bath.', zh: '康茂德扮作赫拉克勒斯的狮皮与大棒。哲学家皇帝马可·奥勒留之子，下场与人对打。对手都懂事，无人敢赢。每打一场，他都向国库报一笔出场费。\n他砍下鸵鸟的头，朝元老们晃动。元老们嚼着叶子，忍住不笑。\n一九二年，他自己的摔跤教练在浴池中将他掐死。' },
  legionary: { en: 'Armour of a Roman legionary. Iron bands on leather straps, a curved shield, a short sword, a steel helmet. Standard kit from state workshops: an army dressed by a supply chain.\nIn AD 9 the general Varus led three legions into a German forest, guided by Arminius, a local chief he trusted as a friend.\nIt was an ambush. All three legions died in the rain and mud.', zh: '罗马军团兵的环片甲与弧形盾。铁条以皮带串成甲，配短剑与铁盔，全出自官办作坊的标准件。一支由供应链穿戴起来的军队。\n公元九年，瓦卢斯率三个军团走进日耳曼密林。带路的是本地首领阿米尼乌斯，瓦卢斯待他如友。\n那是一场埋伏。三个军团尽数死在雨中泥里。' },
  republicanLegionary: { en: 'Mail shirt and knobbed bronze helmet of a legionary of the Republic, with an oval shield and two throwing spears. A farmer who paid for his own kit, called up for one season and kept for years.\nCannae, 216 BC. Hannibal surrounded eight legions and killed some fifty thousand men in an afternoon.\nThe generals went home. The survivors were exiled to Sicily in disgrace, for years.', zh: '共和国军团兵的锁子甲与铜盔。盔顶带纽，椭圆盾，两支投枪。他本是农人，装备自己出钱，说是征一季，一留便是数年。\n公元前二一六年，坎尼。汉尼拔围住八个军团，一个下午杀了约五万人。\n将军们回了家。幸存的兵背着耻辱，被发配西西里，一待多年。' },
  centurion: { en: 'Mail and medals of a Roman centurion. Greaves, a sideways crest on the helmet so his men could find him, and a vine stick for beating them. Authority, worn as plainly as a scar.\nIn a mutiny in AD 14, soldiers murdered a centurion they called ‘Bring Me Another’.\nThe name came from the vine sticks he kept breaking over their backs.', zh: '百夫长的锁子甲与勋章。腿套胫甲，盔顶一道横冠，好让部下找到他；手中一根葡萄藤棍，用来打部下。权威明明白白穿在身上，如一道疤。\n公元十四年的一场兵变中，士兵们杀了一个外号“再拿一根来”的百夫长。\n这外号，来自他在他们背上打断的藤棍。' },
  lateRoman: { en: 'Mail shirt and ridge helmet of a late Roman soldier, two iron halves joined along the top, silvered for officers. Made in haste in state factories: quantity over quality.\nIn 376 Rome let the Goths cross the Danube. Then its officials starved them, and sold them dog meat.\nTwo years later, at Adrianople, the Goths destroyed the eastern army, and the emperor with it.', zh: '罗马晚期士兵的锁子甲与合瓣盔。两片铁在盔顶合拢，军官的镀银。官办工场匆匆赶制，重量不重质。\n三七六年，罗马准哥特人渡过多瑙河。随后，官员们断了他们的粮，又把狗肉卖给他们。\n两年后，阿德里安堡。哥特人歼灭了东方大军，连同皇帝。' },
  romanAuxiliary: { en: 'Mail shirt and broad-cheeked helmet of a Roman auxiliary horseman, with an oval shield and a long sword. Not a citizen but a German or a Thracian, who would become one after twenty-five years of service.\nThe Batavians were Rome’s best horsemen. In AD 69 they rose under Julius Civilis, one of their own and a veteran Roman officer.\nThey burned the very forts they had been guarding.', zh: '罗马辅助骑兵的锁子甲与宽护颊盔。椭圆盾，一把长剑。他不是罗马公民，而是日耳曼人或色雷斯人；服役满二十五年，方得公民身份。\n巴达维人是罗马最好的骑兵。公元六十九年，他们随同族人、罗马老军官尤利乌斯·奇维里斯起兵。\n他们烧掉的，正是自己守卫过的营寨。' },
  goth: { en: 'Wool tunic and round shield of a Visigoth warrior, with an iron boss, a spear, and no armour. His people crossed into the Roman Empire in 376, fleeing the Huns and begging for land.\nIn 410, under their king Alaric, they took Rome itself and sacked it.\nThey were the first enemy inside its walls in eight hundred years.', zh: '西哥特战士的羊毛短衣与铁心圆盾。一杆矛，不披甲。三七六年，族人被匈人追赶，逃入罗马境内，乞求一块土地。\n四一〇年，他们随国王阿拉里克攻破罗马，大肆劫掠。\n八百年来，他们是第一个进入这座城的敌人。' },
  gothNoble: { en: 'Mail shirt and riveted iron helmet of a Visigoth noble, a gold-hilted sword and a garnet eagle brooch. His people carved a kingdom out of Roman Spain and held it for three centuries, mostly by arguing over who should be king.\nIn 711 King Roderic rode against a small army from North Africa. His rivals deserted him mid-battle.\nThe whole kingdom fell in a single summer.', zh: '西哥特贵族的锁子甲与铆接铁盔。金柄长剑，一枚嵌石榴石的鹰形胸针。族人从罗马治下的西班牙割出一个王国，坐了三百年，大半时间在争谁该为王。\n七一一年，国王罗德里克迎战一支北非来的小股军队。对头们在阵中弃他而去。\n整个王国，一个夏天便亡了。' },
  gaziAlp: { en: 'Mail under a padded coat, a pointed helmet, a sabre and a horse bow: one of the first Ottoman frontier warriors. Small raiding bands like his carved a state out of the crumbling Byzantine Empire.\nThe Ottoman sultans made a custom of putting their own brothers to death.\nWhen Mehmed III took the throne in 1595, nineteen of his brothers were strangled in a single day.', zh: '奥斯曼早期边境武士的棉袍与尖盔。棉袍内衬锁子甲，一把弯刀，一张马弓。正是这样一小股一小股的劫掠者，从摇摇欲坠的拜占庭身上割出了一个国家。\n奥斯曼苏丹处死亲兄弟，渐成惯例。\n一五九五年，穆罕默德三世登基。一日之内，十九个兄弟被勒死。' },
  janissary: { en: 'Long coat and tall white felt hat of a Janissary; no armour. Taken from a Christian family as a boy, raised to serve the Sultan alone, among the first troops in Europe drilled with guns. A slave become the backbone of an empire.\nTo topple a Sultan, the Janissaries overturned their soup pots.\nIn 1826 the Sultan shelled their barracks. He named it the Auspicious Incident.', zh: '耶尼切里的长袍与白毡高帽，不披甲。幼时从基督徒家中带走，养大后只侍奉苏丹一人，是欧洲最早操练火器的兵之一。奴隶，成了帝国的脊梁。\n要废黜苏丹，耶尼切里便掀翻汤锅。\n一八二六年，苏丹炮轰了他们的营房，称之为“吉祥事变”。' },
  azap: { en: 'Tunic and turban of an Ottoman azap, a foot archer or marine. A turban over a felt cap, a bow, a short sword, no armour. A farmer who volunteered for one campaign, paid by the day.\nConstantinople, 1453. Men like him went first in the final assault, to tire the defenders and fill the ditch with their bodies.\nThen the elite troops walked in over them.\nHe had been paid for the day.', zh: '奥斯曼阿扎普的素褂与头巾。步弓手，亦充水兵。毡帽外缠头巾，一张弓，一把短刀，不披甲。农人自愿随军一次，按日领钱。\n一四五三年，君士坦丁堡。最后的总攻，打头阵的正是这样的人：先拖垮守军，再以身躯填平壕沟。\n精锐随后踏着他们入城。\n他领的，是一日的工钱。' },
  saladin: { en: 'Kazaghand and tall pointed helmet of Saladin, Sultan of Egypt and Syria: a silk coat with mail sewn inside. A Kurdish soldier who united Cairo and Damascus under one flag, and wore the silk on the outside to do it.\nHattin, 1187. He cut the crusaders off from water in July. He had the captured warrior monks beheaded.\nThen he took Jerusalem, and spared its people.', zh: '萨拉丁的丝面锁甲与高尖盔。埃及与叙利亚的苏丹，丝袍内缝着锁子甲。一个库尔德军人，将开罗与大马士革并于一面旗下，丝绸穿在外面。\n一一八七年，哈丁。他在七月断了十字军的水源。被俘的骑士团修士，一律斩首。\n随后他攻下耶路撒冷，赦免了满城百姓。' },
  cataphract: { en: 'Scale armour of a Parthian cataphract, head to foot, his horse armoured too, a long lance in both hands. Only the nobility could afford the iron and the great horses: a hammer of iron, owned by the few.\nCarrhae, 53 BC. Crassus, the richest man in Rome, lost his army to these riders and their archers.\nIt is said the Parthians poured molten gold down his throat, to satisfy his greed at last.', zh: '帕提亚重骑兵的鳞甲。从头到脚，连马也披甲，双手端一杆长枪。铁甲与高头大马，唯有贵族置办得起。一柄铁锤，握在少数人手中。\n公元前五十三年，卡莱。罗马首富克拉苏的大军，葬送在这些骑手与弓手手里。\n据说帕提亚人将熔金灌入他的喉咙，好叫他的贪心终于饱足。' },
  parthianArcher: { en: 'Tunic, trousers, soft cap and a bow of horn and sinew: a Parthian horse archer. He could shoot backwards while riding away, the original Parthian shot.\nCarrhae, 53 BC. The Romans locked shields and waited for the arrows to run out.\nThen a thousand camels arrived, carrying more. Logistics, not courage, won the day.', zh: '帕提亚骑射手的短衣与角弓。长裤，软帽，一张角筋复合弓。打马离去时仍能回身放箭，正是“帕提亚回马箭”。\n公元前五十三年，卡莱。罗马人锁紧盾阵，只等对面箭尽。\n随后，一千头骆驼驮着箭赶到。那一日取胜的不是勇气，是辎重。' },
  hun: { en: 'Long coat, fur cap and goatskin leggings of a Hun horseman, with a bow and a lasso. A Roman writer claimed they ate and slept on horseback. Their powerful recurved bows outranged anything Rome had.\nAttila extorted cartloads of gold from Rome. In 453 he died on his wedding night, choking on a nosebleed.\nWithin a few years his empire had fallen apart.', zh: '匈人骑手的长袍、皮帽与山羊皮绑腿。一张弓，一根套索。有罗马作家说，他们吃睡都在马背上。那张反曲强弓，射程胜过罗马的一切。\n阿提拉从罗马勒索了一车又一车的黄金。四五三年，他死在新婚之夜，被自己的鼻血呛死。\n不过数年，帝国便分崩离析。' },
  steppeLight: { en: 'Silk-belted robe and fur hat of a Mongol light horseman; no armour, a bow at the hip. He rode with spare horses and lived on their milk: the cheapest, fastest army on earth.\nKalka River, 1223. Mongol riders feigned flight for nine days, drew the Rus’ princes after them, then turned and crushed them.\nThe captured princes were laid under boards, and the Mongol generals feasted on top.', zh: '蒙古轻骑的束腰袍与皮帽。不披甲，弓挂胯边。带着替换的马，以马奶为生。天下最便宜、最快的军队。\n一二二三年，迦勒迦河。蒙古骑兵佯败九日，引罗斯王公们一路追来，再回身将他们碾碎。\n被俘的王公压在木板下，蒙古将领在板上设宴。' },
  steppeMedium: { en: 'Lacquered leather lamellar of a Mongol horseman, worn over the robe against the rain. The Mongols took every engineer they conquered, and turned Chinese siege engines on Persian walls: the best craft, collected as loot.\nIn 1258 they took Baghdad in two weeks. The great library went into the river, which ran black with ink, it was said.\nThe last caliph was trampled by horses.', zh: '蒙古骑兵的漆皮札甲。罩在袍外，上漆防雨。每征服一处，工匠尽数带走，以汉人的攻城器械攻打波斯的城墙。最好的手艺，当作战利品收罗。\n一二五八年，他们两周攻下巴格达。大图书馆的书尽投河中，据说河水被墨染黑。\n末代哈里发死于马蹄之下。' },
  kheshig: { en: 'Gilded scale and iron face mask of the Kheshig, Genghis Khan’s own guard, with a sabre and a bow. Sons of powerful families, they guarded the Khan’s tent day and night, and served as hostages for their fathers’ good conduct.\nWhen Genghis died in 1227, it is said, his escort killed everyone they met on the road home, so that no one could tell where he was buried.\nThe grave has not been found.', zh: '怯薛的鎏金鳞甲与铁面。成吉思汗的亲卫，弯刀，长弓。皆是大族子弟，日夜守卫大汗的帐幕，同时也是人质，替父亲担保忠顺。\n据说一二二七年成吉思汗死后，护灵的队伍在归途上见人便杀，好让无人知道他葬在何处。\n那座坟，至今无人找到。' },
  cumanHeavy: { en: 'Plated mail and hinged steel face of a Cuman of a khan’s retinue, under a pointed helmet; the face wears a moustache over his own. The Rus’ called them Polovtsy. They raided Kyiv, married its princes’ daughters and sold its captives in Crimea: neighbours, in-laws and slavers at once.\nIn 1239 Khan Köten led forty thousand families into Hungary, and promised to be baptised for the privilege.\nIn 1241, with the Mongols at the passes, a mob in Pest decided he was their spy and killed him. His Cumans rode south, burning as they went. Without them, the Hungarian army was destroyed at Mohi.', zh: '库曼亲兵的缀片锁甲与钢面。锁子甲外缀一排排钢片，尖顶盔，一张带胡须的钢面以合页扣在脸上。罗斯人称他们为波洛伏齐。他们劫掠基辅，娶基辅王公之女，又将基辅的俘虏卖到克里米亚。邻居、姻亲、奴隶贩子，一身兼之。\n一二三九年，忽滩汗率四万户进入匈牙利，许诺受洗，以换取容身之地。\n一二四一年，蒙古人已至山口。佩斯城的暴民认定他是奸细，将他杀死。库曼人一路南下，一路焚烧。匈牙利大军失了他们，在莫希全军覆没。' },
  xiongnu: { en: 'Felt or leather coat, fur hat, a bow and a bronze knife: a Xiongnu horseman. The northern nomads were the reason the first Chinese emperors began building long walls.\nModu trained his archers to shoot wherever his whistling arrow flew: at his horse, then his wife, and at last his own father. Any man who hesitated was beheaded.\nLater he had the Han emperor pay him tribute in silk and princesses.', zh: '匈奴骑手的毡袍与青铜刀。皮帽，一张弓。中原最早的几位皇帝修筑长城，防的正是这些北方游牧之民。\n冒顿以鸣镝练兵：鸣镝射向何处，部下的箭便须跟到何处。先射他的马，再射他的爱妻，最后射他的父亲。迟疑者斩。\n后来，他让汉朝皇帝年年进贡丝绸，并送公主和亲。' },
  incaNoble: { en: 'Woven tunic of an Inca lord, covered in square patterns; gold plugs in his stretched earlobes, a braided cord round his head. The patterns may be a lost writing.\nCajamarca, 1532. The emperor Atahualpa came to meet the Spanish, carried by his nobles. When the Spanish guns fired, the nobles held up the litter until they were cut down.\nAtahualpa paid a roomful of gold in ransom. They strangled him anyway.', zh: '印加贵族的方格纹长衫。撑大的耳垂塞着金耳塞，头上绕一圈编绳。那些方格，或许是一种失传的文字。\n一五三二年，卡哈马卡。皇帝阿塔瓦尔帕由贵族们抬着去见西班牙人。枪声响起，贵族们死死托住轿子，直到一个个被砍倒。\n阿塔瓦尔帕交出满满一屋黄金赎命。他们还是勒死了他。' },
  incaUncu: { en: 'Cotton tunic, braided headband and quilted armour of an Inca warrior, with a sling and a star-shaped stone mace. He served the emperor as a labour tax, paid in work and, when needed, in blood.\nAfter the Inca fell, the Spanish kept the tax, and used it to send men into the silver mines of Potosí. So many never came out that it was called the mountain that eats men.\nThe silver paid for Spain’s wars in Europe.', zh: '印加战士的棉衫与絮棉甲。编织头带，一根投石索，一柄星形石锤。他为皇帝当兵，是在服劳役：平时交力气，必要时交血。\n印加亡后，西班牙人沿用这份劳役，将人送进波托西的银矿。下去而未上来的人太多，那座山被称作“吃人的山”。\n挖出的白银，供养着西班牙在欧洲的战争。' },
  mexicaWarrior: { en: 'Quilted cotton armour of an Aztec warrior, stiffened in salt water, and a wooden club edged with obsidian. Obsidian is sharper than steel, and shatters like glass. Stone, against iron.\nHe fought to capture, not to kill, because the gods wanted living prisoners. The Spanish fought to kill.\nSmallpox came ahead of them in 1520. Half the city was dead before the siege began.', zh: '阿兹特克战士的絮棉甲与黑曜石棍。棉甲以盐水浸硬，木棍嵌着黑曜石刃。黑曜石比钢更利，一碰即碎。石头，对上了铁。\n他打仗为的是活捉，因为神要活的祭品。西班牙人只为杀。\n一五二〇年，天花先他们一步进了城。围城尚未开始，城中已死了一半。' },
};

// The helmet slot (outfits.js helmChoices): a kit's helm worn with another kit, named by its head piece (outfits.js helmKey:
// the head's kind, its design or style after a colon, '+mask' with a face mask). A helm not named here takes its set's name.
export const HELM_NAMES = {
  'bascinet:sallet': 'Sallet and bevor', 'bascinet:hounskull': 'Hounskull bascinet', 'bascinet:closeHelmet': 'Close helmet',
  greatHelm: 'Great helm',
  'kettleHat:a': 'Kettle hat', 'kettleHat:b': 'Burgundian kettle hat', 'kettleHat:c': 'German sallet',
  morion: 'Morion', 'cabasset:spanish': 'Cabasset', potHelmet: 'Pot helmet',
  kabuto: 'Kabuto', 'kabuto+mask': 'Kabuto and menpo', 'kabuto:nanban+mask': 'Nanban kabuto and menpo', 'kabuto:zunari+mask': 'Zunari kabuto and menpo',
  jingasa: 'Jingasa (iron hat)',
  jaguarHelm: 'Jaguar helmet', eagleHelm: 'Eagle helmet',
  'mingHat:yongBell': 'Ming bell helmet', 'mingHat:rivetedTube': 'Ming riveted helmet', 'mingHat:plainPoint': 'Ming pointed helmet',
  mingHelm: 'Ming elite helmet', 'mingHelm+mask': 'Ming elite helmet and mask', 'qingHelm:bannerBowl': 'Banner helmet', 'qingHelm:bayaraBowl': 'Bayara helmet', pagodaHelm: 'Iron Pagoda helmet', hanHelm: 'Han lamellar cap',
  steppeHelm: 'Steppe helmet', 'steppeHelm+mask': 'Steppe helmet and face mask', spangenhelm: 'Spangenhelm',
  'chichak:turban': 'Turban helmet', chichak: 'Chichak', 'chichak+mask': 'Kipchak helmet and face mask',
  'arenaHelm:hoplomachus': 'Hoplomachus helmet', 'arenaHelm:murmillo': 'Murmillo helmet', 'arenaHelm:secutor': 'Secutor helmet',
  'arenaHelm:thraex': 'Thraex helmet', 'arenaHelm:scissor': 'Scissor helmet',
  galea: 'Galea', ridgeHelm: 'Ridge helmet', montefortino: 'Montefortino',
  riotHelmet: 'Riot helmet', opsHelmet: 'Combat helmet', proximityHood: 'Proximity hood',
};
