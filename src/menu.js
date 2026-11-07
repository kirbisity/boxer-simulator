// The way in: a home screen, and from it (in this order) Career (to come),
// Battle Mode, Level Mode, The Last Gate, Deadliest Warrior, Who Wins? (the quick battle: a random fighter) and the Sandbox; and a character
// creator that goes one plain
// question at a time. The menus only choose fighters and places; the
// fights themselves are the same world as everywhere else (main.js does
// the starting, through the hooks it hands over).

import { normaliseInputs, PRESETS } from './body.js';
import { GLADIATORS, randomBoxer, randomCharacter, randomGladiator, redress, weightOf } from './cast.js';
import { STYLE_KEYS, STYLES } from './moves.js';
import { CLOTH_COLORS, FACTION_KEYS, FACTIONS, factionOf, finishOptions, firstDesignOf, HEADGEAR, headgearOptions, helmChoices, helmSlotOf, outfitOf, outfitSets, OUTFITS, pickableSets, randomColors, setCard, setHelmSlot, withFinish, wornCard } from './outfits.js';
import { setCardElement } from './setcard.js';
import { openInfoPop, withInfo } from './infopop.js';
import { originOf, REGION_ORIGINS, regionName, regionTone, setShade, settleOrigin, skinShadeOf, toneSpan } from './faceregions.js';
import { photoFaceRegions } from './photoface.js';
import { battleOf, SCENARIOS } from './scenarios.js';
import { addBattleThumb } from './battlethumbs.js';
import { musterScreen } from './musterview.js';
import { customBattleScreen } from './custombattleview.js';
import { CUSTOM_BATTLE } from './custombattle.js';
import { lineShown, pairedOpponent, ratingOf, starsOf, styleName, WARRIORS } from './roster.js';
import { WEAPONS } from './weapons.js';
import { boltedOn, breedOf, canRide, mountOf } from './horses.js';
import { shadeGradient, shadeTone, toneShade } from './skintones.js';
import { fightUiHomeSwitch } from './fightui/toggle.js';
import { STAGE_LIST } from './levelmode/story.js';
import { audioMixer } from './audio/controls.js';
import { hitFeelPanel } from './hitfeelview.js';
import { getLang, LANG_NAMES, LANGS, onLangChange, pick, SEP, setLang, t, tname } from './i18n.js';
import { LAST_GATE, LAST_GATE_MODES, LAST_GATE_MODE_KEYS } from './lastgate.js';
import { lastGateBoardList, lastStandBuilder } from './lastgateview.js';
import { lastStandLevel } from './squad.js';

// The two quick battles: what each is called, where it is fought, who fights.
export const EVENTS = {
  boxing: {
    title: { en: 'Prize Fight', zh: '职业拳赛' }, kicker: { en: 'Boxing', zh: '拳击' }, place: 'ring', glyph: '🥊',
    blurb: { en: 'Gloves on, in the ring, one weight class. Any unarmed style — and they mix them.', zh: '戴上拳套，上擂台，同一个量级。徒手流派随便用——还能混着来。' },
  },
  gladiator: {
    title: { en: 'Blood & Sand', zh: '血与沙' }, kicker: { en: 'Gladiator', zh: '角斗' }, place: 'colosseum', glyph: '⚔️',
    blurb: { en: 'The Colosseum. Knights, samurai, gladiators — steel, any weight, no rules.', zh: '罗马斗兽场。骑士、武士、角斗士——真刀真枪，不分量级，没有规矩。' },
  },
};

// What the character creator offers in each kind of fight.
// Passive is the sandbox's: nobody makes a fighter who will not fight.
const UNARMED = STYLE_KEYS.filter((key) => !STYLES[key].weapon && !STYLES[key].passive);
const ARMED = STYLE_KEYS.filter((key) => STYLES[key].weapon);
// What each style is (the ⓘ of its card), in either language.
const STYLE_NOTES = {
  boxing: { en: 'Hands only: slips, rolls, combinations.', zh: '只用拳：闪、潜、组合拳。' }, kickboxing: { en: 'Punches and kicks from range.', zh: '拳脚并用，远距离开打。' }, street: { en: 'Wild and heavy, little defence.', zh: '又野又狠，基本不防守。' },
  muayThai: { en: 'Kicks, knees, elbows, the clinch.', zh: '腿、膝、肘，外加箍颈缠抱。' }, sumo: { en: 'Pushes and drives men off their feet.', zh: '推、顶，把人撞得脚下离地。' }, mix: { en: 'Switches between the unarmed styles.', zh: '几门徒手功夫换着用。' },
  unskilled: { en: 'An ordinary person in a fight.', zh: '普通人打架，就这样。' }, passive: { en: 'Will not fight back: covers up and runs.', zh: '不还手：抱头，逃跑。' }, clinchBrawl: { en: 'Grabs the neck, hammers with the free hand.', zh: '一手箍脖子，另一手往死里砸。' },
  handgun: { en: 'Keeps his distance, aims and fires; hand to hand up close.', zh: '拉开距离，瞄准，开火；贴身了就肉搏。' }, baton: { en: 'A police baton: hard blunt blows.', zh: '警棍：钝器重击。' }, lance: { en: 'The war lance on foot, 3.3 m: holds his man at the point and drives it in with his weight behind it; slow, and tired by it.', zh: '步战持骑枪，三米三：枪尖顶住对手，再把全身分量压上去捅；慢，还累人。' }, longsword: { en: 'Hand-and-a-half sword: cuts and lunges.', zh: '手半剑：能劈能刺。' },
  maximus: { en: 'A legion swordsman in the arena: gladius, no shield, a veteran\'s parries.', zh: '军团老兵下了斗兽场：一把罗马短剑，不拿盾，格挡全凭老经验。' }, commodus: { en: 'The emperor as Hercules: lion skin and club, heavy blows, little defence.', zh: '皇帝扮成赫拉克勒斯：披狮皮，抡棍棒，下手重，几乎不防。' }, whip: { en: 'A long whip: the tip cracks in from far off; a hard lash can drop a man to his knees. Nothing against armour.', zh: '长鞭：鞭梢老远就抽过来；狠狠一鞭能把人抽得跪下。碰上盔甲就没辙。' }, crossbow: { en: 'Shouldered and loosed: a heavy bolt, then a slow spanning; the sidearm when they close.', zh: '抵肩一发：一支重矢，上弦慢得很；近了换副武器。' }, nu: { en: 'The Chinese crossbow: a bolt, spanned quicker; the sword when they close.', zh: '中国弩：一支箭，上弦快些；近了拔剑。' }, jian: { en: 'The straight sword: thrust and flick.', zh: '直剑：刺，点，挑。' }, wuxia: { en: 'Unarmoured and very quick: runs of thrusts and cuts, slipping away.', zh: '不着甲，快得很：一连串刺劈，一闪就没影。' }, odachi: { en: 'A great field sword: wide two-handed cuts from far off.', zh: '野战大太刀：双手抡开，隔老远就是大劈大砍。' }, bat: { en: 'Wild two-handed swings.', zh: '双手乱抡。' }, riot: { en: 'Baton behind a clear riot shield; shoves with it.', zh: '透明防暴盾后面挥警棍；也拿盾顶人。' }, legionary: { en: 'Scutum and gladius: the boss punched in, the point past the edge.', zh: '大盾配短剑：盾心往前一撞，剑尖从盾边捅出去。' }, centurion: { en: 'The legionary\'s way, harder forward.', zh: '军团兵的打法，只是压得更狠。' }, guanYu: { en: 'The Green Dragon Crescent Blade: great sweeping cuts from far off, pressed forward.', zh: '青龙偃月刀：隔老远大开大合地扫，步步紧逼。' }, joan: { en: 'Arming sword in white plate, bareheaded; bears the standard when she leads.', zh: '白甲，不戴盔，手持骑士剑；领兵冲锋时擎着军旗。' }, thraex: { en: 'Sica and parmula: the curved blade hooks round a shield at the legs and flank.', zh: '弯刀配小方盾：弯刃绕过盾牌，专勾腿和侧肋。' }, murmillo: { en: 'Gladius behind the great scutum: patient, stabbing out from cover.', zh: '大盾后面藏一把短剑：沉得住气，从掩护后面往外捅。' }, secutor: { en: 'Scutum and gladius, the smooth helmet: always closing.', zh: '大盾短剑，一顶光溜溜的头盔：永远在往前逼。' }, retiarius: { en: 'Net and trident, no helmet: throws the net to bind, then the trident in both hands.', zh: '渔网三叉戟，不戴盔：先撒网缠人，再双手攥戟往里扎。' }, scissor: { en: 'Scale coat, gladius, and a steel-cased arm ending in a crescent blade.', zh: '鳞甲、短剑，一条钢套包住的手臂，末端是一片月牙刃。' },
  katana: { en: 'Two hands, held upright: deep cuts.', zh: '双手立刀：一刀就是深口子。' }, ronin: { en: 'The katana fought to finish it: presses in, long runs of cuts, little rest.', zh: '打刀用到底：贴上去，一刀接一刀，几乎不喘气。' }, nito: { en: 'Two swords, katana and wakizashi: one meets his blade while the other cuts into the gap.', zh: '二刀流，打刀加胁差：一把架住对方的刀，另一把往空当里砍。' }, knife: { en: 'Close in, stab fast, bleed them.', zh: '贴身，快捅，放血。' }, hoplomachus: { en: 'Spear and round shield; a gladius in reserve.', zh: '长矛圆盾；腰里还备着一把短剑。' },
  warhammer: { en: 'Long and heavy: crushes through armour.', zh: '又长又沉：隔着甲把人砸烂。' }, naginata: { en: 'Long curved blade: great cuts from far off.', zh: '长柄弯刃：隔老远大劈大砍。' }, spear: { en: 'Long reach: back off, thrust from the point.', zh: '够得远：往后撤，用枪尖扎。' }, yari: { en: 'A spear with a cross blade: thrusts deep, cuts and hooks with the side blades.', zh: '十文字枪：往深里扎，两边的横刃还能割能钩。' }, pitchfork: { en: 'A farm fork: long reach, blunt tines, easily knocked away.', zh: '农家草叉：够得远，叉齿是钝的，一拨就开。' },
  bow: { en: 'Keeps away and looses arrows; the sidearm up close.', zh: '躲远了放箭；近身换副武器。' }, bayaraLance: { en: 'The banners\' heavy spear, its long iron head: couched and driven home at the gallop, fought at the point on foot; the dao when it is lost.', zh: '八旗的重枪，铁头又长：纵马夹枪往里送，步战就用枪尖扎；枪丢了拔腰刀。' }, bayaraBow: { en: 'Three heavy arrows from the Manchu bow at close range, then the bow dropped and straight in with the saber.', zh: '满洲弓抵近射三支重箭，然后扔弓，拔刀直冲。' }, manchuBow: { en: 'The heavy Manchu bow: walks in close and looses a long, heavy, broad-headed arrow at the face and the gaps; the saber when they are on him.', zh: '满洲重弓：走到跟前，一支又长又沉的宽刃箭，专射脸和甲缝；人扑上来了就拔刀。' }, longbow: { en: 'The English war bow: a heavy arrow about ten times a minute, from any rank, over the heads in front; the falchion when they are on him.', zh: '英格兰长弓：一分钟十来支重箭，站在第几排都行，越过前排头顶往下落；人冲到眼前就拔弯刀。' }, pike: { en: 'A 5 m pike levelled at the chest: holds men off at its full length; helpless once inside it.', zh: '五米长矛平端胸口：靠这一整根长度把人挡在外面；一旦被钻进来，就毫无办法。' }, matchlock: { en: 'One heavy shot, a long reload; the sidearm up close.', zh: '一发重弹，装填老半天；近身换副武器。' },
  rapier: { en: 'A long slender sword: the point is everything.', zh: '细长的剑：全靠剑尖。' }, revolver: { en: 'An Adams revolver, side-on, one arm straight: five shots double action, then the long reload.', zh: '亚当斯左轮，侧身单臂直伸：双动五发，然后是漫长的装填。' },
  espada: { en: 'A Spanish cut-and-thrust sword: thrust first.', zh: '西班牙劈刺剑：先刺。' }, espadaRodela: { en: 'Sword and steel buckler.', zh: '剑配钢圆盾。' }, macuahuitl: { en: 'An obsidian-edged club and a feathered shield: cuts flesh, chips on steel.', zh: '黑曜石刃木棍配羽毛盾：砍肉利落，碰上钢就崩口。' }, tepoztopilli: { en: 'An obsidian-edged spear: thrusts and cuts.', zh: '黑曜石刃长矛：能刺能割。' },
  taichi: { en: 'Rooted and soft: deflects nearly everything, answers with palms and pushes.', zh: '扎根柔化：几乎什么都能化开，回手就是掌和推。' }, taekwondo: { en: 'Kicks from range, turning and spinning; little defence.', zh: '远距离出腿，转身旋踢；防守很少。' }, judo: { en: 'Grips the collar and throws over the shoulder: as far as his legs can lift the man.', zh: '抓领子，过肩摔：腿能把人抬多高，就摔多远。' },
  staff: { en: 'A long staff, both ends striking: blunt and quick.', zh: '长棍，两头都能打：钝，但快。' }, kanabo: { en: 'An iron-studded club: huge slow swings, no thrust.', zh: '铁钉狼牙棒：抡得又大又慢，不能刺。' }, threeEyed: { en: 'Three barrels fired in turn, then a club.', zh: '三根铳管轮着放，打完当棍子使。' },
  dao: { en: 'A one-handed curved sabre: quick cuts.', zh: '单手弯刀：快砍。' }, saber: { en: 'The steppe and Turkish sabre: long draw cuts.', zh: '草原和突厥的马刀：拖着刀刃长长一划。' }, saberShield: { en: 'Sabre and kalkan, the wicker round shield.', zh: '马刀配藤编圆盾。' }, kilij: { en: 'The kılıç: a longer, deeply curved sabre whose edge slides as it cuts, deadliest from the saddle.', zh: '基利吉弯刀：更长、弯得更深，砍下去刃口顺势一滑，马背上最要命。' }, kilijShield: { en: 'Kilij and kalkan: long drawing cuts from behind the round shield.', zh: '基利吉配圆盾：躲在盾后，拉出一道道长口子。' }, saladin: { en: 'The straight Ayyubid sword and a leather-faced round shield: long cuts from behind it, patient, quick to answer.', zh: '阿尤布王朝的直剑配皮面圆盾：躲在盾后长劈，沉得住气，回手也快。' }, yatagan: { en: 'The Janissary\'s forward-curved short sword.', zh: '耶尼切里的前弯短刀。' },
  gorilla: { en: 'A silverback upright: huge hooks and shoves, charges; little defence.', zh: '直立的银背大猩猩：大摆拳、猛推、冲撞；几乎不防。' }, chimp: { en: 'Charges in on all fours, grabs, beats with both arms and bites; drags and throws.', zh: '四肢着地冲上来，抓住就双臂乱捶加撕咬；还会拖人、摔人。' }, baboon: { en: 'Lunges and grabs low, slashes with canines longer than a leopard\'s, hangs on and bites again.', zh: '低身扑抓，獠牙比豹子还长，一口划开，咬住不放再咬。' }, macaque: { en: 'Small, fast and nervy: darts in on all fours, grabs a leg, bites and bites; runs when hurt.', zh: '小、快、神经质：四肢着地窜进来，抱腿就咬，咬了又咬；疼了就跑。' }, combatBot: { en: 'Forearm guns: the AR-15 arm from afar, the shotgun arm closer, never reloading; then a mace and a heavy blade.', zh: '前臂就是枪：远处用AR-15那条胳膊，近了换霰弹枪那条，从不换弹；再往后是钉锤和重刃。' },
  rifle: { en: 'The AR-15: fast, accurate, devastating; thirty rounds, then a magazine change.', zh: 'AR-15：快、准、狠；三十发，然后换弹匣。' }, shotgun: { en: 'A pump shotgun: slow, a hard kick, nine pellets that devastate up close.', zh: '泵动霰弹枪：慢，后坐力大，九颗弹丸近距离一轰就烂。' },
  langyaShield: { en: 'A wolf-tooth mace and an iron parry buckler: crushes armour.', zh: '狼牙棒配铁格挡盾：专砸盔甲。' }, maceShield: { en: 'A flanged mace and kalkan: the answer to armour.', zh: '翼锤配圆盾：盔甲的克星。' }, champi: { en: 'The Inca star mace: a bronze star on a wooden haft, swung overhead and from the side.', zh: '印加星锤：木柄上一颗青铜星，过顶抡，侧面扫。' }, steppeBow: { en: 'A composite bow: a faster, harder arrow; the sabre up close.', zh: '复合弓：箭更快更狠；近身换马刀。' }, kheshigBow: { en: 'Up to five quick arrows, then straight in with the flanged mace.', zh: '最多五支快箭，然后提着翼锤直冲上去。' }, cumanBow: { en: 'Up to five quick arrows from the composite bow, then the bow dropped and straight in with the sabre.', zh: '复合弓最多五支快箭，然后扔弓，拔马刀直冲。' }, swordShield: { en: 'A curved sabre and a small round shield.', zh: '弯刀配小圆盾。' }, guandao: { en: 'A heavy crescent blade on a long shaft: crushing cuts.', zh: '长杆上一片沉重的月牙刃：劈下去就是碾碎。' },
};
const HAIR = { black: '#120d0a', 'dark brown': '#2a1a10', brown: '#6b4a2a', blond: '#c9a25e', red: '#8a3a1c', grey: '#8d8d8d' };
const HAIR_STYLES = { male: ['cleanShort', 'fade', 'buzz', 'spiky', 'cornrows', 'midLong', 'long', 'dreads', 'topknot', 'bald'], female: ['bun', 'ponytail', 'cleanShort', 'midLong', 'long', 'dreads', 'topknot'] };
/** A style's name, and its weapon when the name does not already say it. */
const words = (key) => key.replace(/([A-Z])/g, ' $1').toLowerCase();
// The creator's chips and swatches (hair, eyes, beards, skin, the cloth colours, a horse's barding), in either language.
const OPTION_WORDS = {
  cleanShort: { en: 'clean short', zh: '利落短发' }, fade: { en: 'fade', zh: '渐变' }, buzz: { en: 'buzz', zh: '寸头' }, spiky: { en: 'spiky', zh: '刺头' },
  cornrows: { en: 'cornrows', zh: '脏辫' }, midLong: { en: 'mid long', zh: '中长发' }, long: { en: 'long', zh: '长发' }, dreads: { en: 'dreads', zh: '雷鬼辫' },
  topknot: { en: 'topknot', zh: '发髻' }, bald: { en: 'bald', zh: '光头' }, bun: { en: 'bun', zh: '盘发' }, ponytail: { en: 'ponytail', zh: '马尾' },
  none: { en: 'none', zh: '无' }, stubble: { en: 'stubble', zh: '胡茬' }, mustache: { en: 'mustache', zh: '八字胡' }, beard: { en: 'beard', zh: '络腮胡' },
  brown: { en: 'brown', zh: '棕' }, hazel: { en: 'hazel', zh: '榛色' }, blue: { en: 'blue', zh: '蓝' }, green: { en: 'green', zh: '绿' }, grey: { en: 'grey', zh: '灰' },
  amber: { en: 'amber', zh: '琥珀' }, black: { en: 'black', zh: '黑' }, 'dark brown': { en: 'dark brown', zh: '深棕' }, blond: { en: 'blond', zh: '金' }, red: { en: 'red', zh: '红' },
  porcelain: { en: 'porcelain', zh: '瓷白' }, light: { en: 'light', zh: '白皙' }, lightTan: { en: 'light tan', zh: '浅麦色' }, medium: { en: 'medium', zh: '中等' },
  tan: { en: 'tan', zh: '小麦色' }, deep: { en: 'deep', zh: '深色' },
  "kit's own": { en: "kit's own", zh: '套装原色' }, navy: { en: 'navy', zh: '藏青' }, maroon: { en: 'maroon', zh: '栗红' }, charcoal: { en: 'charcoal', zh: '炭灰' },
  white: { en: 'white', zh: '白' }, olive: { en: 'olive', zh: '橄榄绿' }, denim: { en: 'denim', zh: '牛仔蓝' }, sand: { en: 'sand', zh: '沙色' }, sky: { en: 'sky', zh: '天蓝' },
  forest: { en: 'forest', zh: '墨绿' }, yellow: { en: 'yellow', zh: '黄' }, ochre: { en: 'ochre', zh: '赭黄' }, orange: { en: 'orange', zh: '橙' }, rust: { en: 'rust', zh: '铁锈红' },
  wine: { en: 'wine', zh: '酒红' }, purple: { en: 'purple', zh: '紫' }, slate: { en: 'slate', zh: '石板灰' }, linen: { en: 'linen', zh: '亚麻' }, undyed: { en: 'undyed', zh: '本色' },
  cream: { en: 'cream', zh: '米白' }, plate: { en: 'plate', zh: '板甲' }, lamellar: { en: 'lamellar', zh: '札甲' }, brigandine: { en: 'brigandine', zh: '布面甲' },
  mail: { en: 'mail', zh: '锁子甲' }, leather: { en: 'leather', zh: '皮甲' }, scale: { en: 'scale', zh: '鳞甲' }, felt: { en: 'felt', zh: '毡甲' },
};
/** An option's words in the language in force (its English words when there is no entry). */
const optionWords = (key) => (OPTION_WORDS[key] ? pick(OPTION_WORDS[key]) : words(key));
/** A line of names joined by ' · ' ("Longsword · Gothic harness"), each part in the language in force. */
const nameLine = (line) => String(line ?? '').split(SEP).map(tname).join(SEP);

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child !== null && child !== undefined));
  return node;
};

/** A screen: title, subtitle, body, and a back button. */
function screen(id, title, subtitle, onBack) {
  const root = document.getElementById(id);
  root.replaceChildren();
  root.className = 'screen';
  const head = el('header', { className: 'screen-head' });
  if (onBack) head.append(el('button', { className: 'back', type: 'button', textContent: t('common.back'), onclick: onBack }));
  head.append(el('div', { className: 'titles' }, el('h1', { textContent: title }), subtitle ? el('p', { className: 'lede', textContent: subtitle }) : null));
  const body = el('div', { className: 'screen-body' });
  root.append(head, body);
  return body;
}

/**
 * A choice: glyph, kicker and title, kept small (its line of text is its tooltip, and a battle's whole story is behind
 * its ⓘ: `withStory`). Without `onClick`, not open yet: shown, dimmed, and saying so.
 */
function choice({ glyph, kicker, title, text, onClick, tone = '' }) {
  const open = Boolean(onClick);
  return el('button', { className: `choice ${tone}${open ? '' : ' soon'}`, type: 'button', title: text ?? '', onclick: onClick ?? null, ariaDisabled: open ? null : 'true' },
    el('span', { className: 'glyph', textContent: glyph, ariaHidden: 'true' }),
    el('span', { className: 'words' }, kicker ? el('em', { textContent: kicker }) : null, el('b', { textContent: title })));
}

/** A choice with its story (`title`, `kicker`, the paragraphs of `lines`) a tap away behind its ⓘ (infopop.js). */
const withStory = (card, { title, kicker, lines }) => withInfo(card, () => el('div', { className: 'story-info' },
  kicker ? el('em', { textContent: kicker }) : null, el('b', { textContent: title }), ...lines.filter(Boolean).map((line) => el('p', { textContent: line }))), t('menu.story', { title }));

/** Each style's faction, by the character who fights in it (ring if none does): for grouping styles. */
const STYLE_FACTION = (key) => {
  const character = Object.values(PRESETS).find((preset) => preset.style === key);
  return character ? factionOf(character) : 'ring';
};

/** Install the menus. `game` is the set of hooks main.js provides. */
export function installMenus(game) {
  // The screen open now, drawn again in the new language when it changes (each screen sets it; null: nothing to redraw).
  let redraw = null;
  onLangChange(() => {
    if (redraw && document.body.dataset.overlay) redraw();
  });
  const show = (id) => {
    if (!id) redraw = null;
    for (const other of ['home', 'quick', 'lastgate-screen', 'levels-screen', 'muster-screen', 'custom-screen', 'stages-screen', 'versus', 'wizard', 'settings-screen']) document.getElementById(other).hidden = other !== id;
    document.body.dataset.overlay = id ?? '';
  };
  const close = () => show(null);

  // ---- Home ------------------------------------------------------------
  // In order. Career is first and not open yet (it needs a store of its own, to come): when it is, it gets its onClick.
  function home() {
    game.attract();
    redraw = home;
    const body = screen('home', 'Gladiator', t('menu.home.lede'), null);
    body.parentElement.classList.add('home');
    body.append(el('div', { className: 'choices home-choices' },
      choice({ glyph: '🏆', kicker: t('menu.home.career.kicker'), title: t('menu.home.career.title'), text: t('menu.home.career.text'), tone: 'career' }),
      choice({ glyph: '🗺️', kicker: t('menu.home.battle.kicker'), title: t('menu.home.battle.title'), text: t('menu.home.battle.text'), onClick: levels, tone: 'gold' }),
      choice({ glyph: '🏰', kicker: t('menu.home.level.kicker'), title: t('menu.home.level.title'), text: t('menu.home.level.text'), onClick: stages, tone: 'storm' }),
      choice({ glyph: '🛡️', kicker: t('menu.home.gate.kicker'), title: tname(LAST_GATE.title), text: t('menu.home.gate.text'), onClick: () => lastGate(), tone: 'mist' }),
      choice({ glyph: '☠️', kicker: t('menu.home.versus.kicker'), title: t('menu.home.versus.title'), text: t('menu.home.versus.text'), onClick: versus }),
      choice({ glyph: '⚡', kicker: t('menu.home.quick.kicker'), title: t('menu.home.quick.title'), text: t('menu.home.quick.text'), onClick: quickEvent }),
      choice({ glyph: '🧪', kicker: t('menu.home.sandbox.kicker'), title: t('menu.home.sandbox.title'), text: t('menu.home.sandbox.text'), onClick: () => { close(); game.sandbox(); } })),
      el('div', { className: 'home-links' },
        el('button', { className: 'replay-intro', type: 'button', textContent: t('menu.home.tutorial'), onclick: () => { close(); game.tutorial(); } }),
        // The intro (intro.js) again: the legends, then back here.
        el('button', { className: 'replay-intro', type: 'button', textContent: t('menu.home.intro'), onclick: () => { close(); game.intro(home); } }),
        // How the player attacks (fightui/): tapping his man or the buttons; a tap flips it.
        fightUiHomeSwitch((textContent, onclick) => el('button', { className: 'replay-intro', type: 'button', textContent, onclick })),
        el('button', { className: 'replay-intro', type: 'button', textContent: t('menu.home.settings'), onclick: settings })));
    show('home');
  }

  // ---- Settings ----------------------------------------------------------
  // The sound's mixer (audio/controls.js), kept in this browser, and the way to the sound bench (audio/bench.js).
  function settings() {
    redraw = settings;
    const body = screen('settings-screen', t('settings.title'), t('settings.lede'), home);
    const panel = el('div', { className: 'settings-panel' });
    // The language (src/i18n.js): the whole game's, kept in this browser; a tap switches every screen at once.
    const langRow = el('section', { className: 'audio-mixer lang-row', ariaLabel: t('settings.language') }, el('h2', { textContent: t('settings.language') }),
      el('div', { className: 'seg lang-seg', role: 'radiogroup' }, ...LANGS.map((code) => {
        const on = code === getLang();
        const button = el('button', { type: 'button', className: on ? 'on' : '', textContent: LANG_NAMES[code], role: 'radio', ariaChecked: String(on), lang: code === 'zh' ? 'zh-CN' : 'en' });
        button.dataset.lang = code;
        button.onclick = () => setLang(code);
        return button;
      })));
    panel.append(langRow);
    if (game.audio) panel.append(audioMixer(game.audio));
    if (game.hitFeel) panel.append(hitFeelPanel(game.hitFeel.settings, game.hitFeel.save));
    panel.append(el('button', { className: 'bench-open', type: 'button', textContent: t('settings.bench'), onclick: () => game.soundBench?.() }));
    body.append(panel);
    show('settings-screen');
  }

  // ---- Who Wins? (the quick battle) ------------------------------------------------
  // One tap from here to the fight (then the side): a random fighter for you. Making your own is the smaller way.
  function quickEvent() {
    redraw = quickEvent;
    const body = screen('quick', t('menu.home.quick.title'), t('menu.quick.lede'), home);
    const random = (eventKey) => (eventKey === 'boxing' ? randomBoxer() : randomGladiator());
    body.append(
      el('div', { className: 'choices two' }, ...Object.entries(EVENTS).map(([key, event]) => choice({ glyph: event.glyph, kicker: pick(event.kicker), title: pick(event.title), text: pick(event.blurb), onClick: () => startQuick(key, random(key)) }))),
      el('div', { className: 'quick-make' }, el('span', { textContent: t('menu.quick.make') }),
        ...Object.entries(EVENTS).map(([key, event]) => el('button', { type: 'button', textContent: `🛠️ ${pick(event.title)}`, onclick: () => wizard({ event: key, start: random(key), finish: () => t('wizard.fight'), onDone: (inputs) => startQuick(key, inputs), onBack: quickEvent }) }))),
    );
    show('quick');
  }

  function startQuick(eventKey, player) {
    const event = EVENTS[eventKey];
    // The prize fight pairs by weight (every man fights mixed, gloved); the arena by rating: one of each kind of man, the nearer his rating to yours the likelier.
    const arenaOpponent = () => {
      const kinds = GLADIATORS.map((key) => ({ key, inputs: PRESETS[key] }));
      const { key } = pairedOpponent(player, kinds.map((kind) => ({ ...kind.inputs, key: kind.key })));
      return randomGladiator(Math.random, key);
    };
    const opponent = () => (eventKey === 'boxing' ? randomBoxer(Math.random, { weightKg: weightOf(player) }) : arenaOpponent());
    close();
    const fight = () => game.match({ red: [player], blue: [opponent()], place: event.place, game: 'quick', label: pick(event.title), next: { text: t('menu.quick.next'), run: fight } });
    fight();
  }

  // ---- Last Stand Squad: a level, the squad, its places, and in (lastgate.js, squad.js) ----------------------------
  // The levels as cards (the hero's look, the level and its land, the hero and his weapon, what he is good for, the horde he
  // faces, the level's best); a tap opens its squad builder (lastgateview.js), then the squad's placing before the gate
  // (musterview.js, locked), then the run. The best runs in this browser, a board for each, behind a button. `key`: straight
  // to that level's builder (the end card's ⚔ Squad).
  function lastGate(key = null) {
    if (key in LAST_GATE_MODES) return lastStandSquad(key);
    redraw = () => lastGate();
    const body = screen('lastgate-screen', tname(LAST_GATE.title), t('menu.gate.lede'), home);
    body.parentElement.classList.add('lg-pick');
    const cards = el('div', { className: 'lg-heroes' }, ...LAST_GATE_MODE_KEYS.map((mode) => {
      const spec = LAST_GATE_MODES[mode];
      const image = el('img', { alt: '', draggable: false });
      game.portrait?.(`lastgate-${mode}`, spec.hero()).then((url) => { image.src = url; });
      const best = game.lastGateBoard?.best?.(mode);
      return el('button', { className: 'lg-hero', type: 'button', onclick: () => lastStandSquad(mode) },
        el('span', { className: 'lg-hero-look' }, image),
        el('span', { className: 'lg-hero-words' },
          el('em', { textContent: t('menu.gate.level', { level: spec.level, region: tname(pick(spec.region)) }) }),
          el('b', { textContent: `${spec.glyph} ${tname(spec.title)}` }),
          el('em', { textContent: `${tname(spec.label)} · ${tname(spec.weapon)}` }),
          el('span', { textContent: pick(spec.strength) }),
          el('small', { textContent: pick(spec.blurb) }),
          best ? el('i', { className: 'lg-hero-best', textContent: t('menu.gate.best', { kills: best.kills, waves: best.waves ?? 0 }) }) : null));
    }));
    const board = el('div', { className: 'lg-menu-board', hidden: true }, el('h2', { textContent: t('menu.gate.board') }),
      ...LAST_GATE_MODE_KEYS.map((mode) => el('section', { className: 'lg-menu-board-mode' },
        el('h3', { textContent: `${LAST_GATE_MODES[mode].glyph} ${tname(LAST_GATE_MODES[mode].title)}` }),
        lastGateBoardList(game.lastGateBoard?.list(mode) ?? []))));
    const toggle = el('button', { type: 'button', className: 'lg-board-toggle', textContent: t('menu.gate.boardButton'), onclick: () => {
      board.hidden = !board.hidden;
      cards.hidden = !board.hidden;
      toggle.textContent = board.hidden ? t('menu.gate.boardButton') : t('menu.gate.levels');
    } });
    body.append(cards, board, toggle);
    show('lastgate-screen');
  }

  /** A level's squad builder, then its placing; started, the run with that squad where it was put (main.js enterLastGate). */
  function lastStandSquad(mode) {
    const root = document.getElementById('lastgate-screen');
    const spec = LAST_GATE_MODES[mode];
    show('lastgate-screen');
    // (The squad builder and its placing draw their own words: lastgateview.js, musterview.js.)
    redraw = null;
    lastStandBuilder(root, {
      mode,
      portrait: game.portrait?.(`lastgate-${mode}`, spec.hero()) ?? null,
      onBack: () => lastGate(),
      onNext: (men) => {
        const level = lastStandLevel(mode, men);
        musterScreen(root, {
          key: `laststand-${mode}`, level, locked: true, corners: ['red'], formations: { red: 'level' }, lead: { corner: 'red', index: 0 },
          backLabel: t('menu.gate.back'), resetLabel: t('menu.gate.reset'), startLabel: t('menu.gate.start'), lede: t('menu.gate.muster'),
          onBack: () => lastStandSquad(mode),
          onStart: (setup) => {
            close();
            game.lastGate(mode, { men: setup.cast.red.slice(1), places: setup.places.red ?? level.places.red });
          },
        });
      },
    });
  }

  // ---- Level Mode: the stages ---------------------------------------------------
  // Stage 1 starts through `game.onStage(key)` (main.js wires it; unwired, the card does nothing); the rest are shown, not open yet.
  function stages() {
    redraw = stages;
    const body = screen('stages-screen', t('menu.home.level.title'), t('menu.stages.lede'), home);
    body.append(el('div', { className: 'choices levels stages' }, ...STAGE_LIST.map((stage) => {
      const card = choice({
        glyph: stage.glyph, kicker: pick(stage.kicker), title: pick(stage.title), text: pick(stage.blurb), tone: stage.ready ? 'storm' : '',
        onClick: stage.ready ? () => { if (!game.onStage) return; close(); game.onStage(stage.key); } : null,
      });
      if (stage.ready) addBattleThumb(card, stage.key);
      return withStory(card, { title: pick(stage.title), kicker: pick(stage.kicker), lines: [pick(stage.blurb)] });
    })));
    show('stages-screen');
  }

  // ---- Battle Mode: the levels --------------------------------------------------
  // A battle is one tap from here as the level has it; its ⚙ opens the setup (musterview.js): the armies, their order, the man played;
  // its ⓘ its story. The custom battle first (custombattleview.js): the player's own ground, sides and men.
  function levels() {
    redraw = levels;
    const body = screen('levels-screen', t('menu.home.battle.title'), t('menu.levels.lede'), home);
    const custom = addBattleThumb(choice({ glyph: '⚔️', kicker: t('menu.levels.custom.kicker'), title: tname(CUSTOM_BATTLE.title), text: t('menu.levels.custom.text'), onClick: customBattle, tone: 'gold' }), CUSTOM_BATTLE.key);
    // The training yard: every control, one at a time.
    const yard = choice({ glyph: '🎯', kicker: t('menu.levels.yard.kicker'), title: t('menu.levels.yard.title'), text: t('menu.levels.yard.text'), onClick: () => { close(); game.tutorial(); }, tone: 'gold' });
    const card = ([key, level]) => {
      const play = choice({ glyph: { rebellion: '🌾', pride: '🥊', port: '🚢', agincourt: '🏹', cerignola: '🔥', sekigahara: '🏯', pyongyang: '🐉', cajamarca: '☀️', zeelandia: '⚓', wokou: '🏴‍☠️', qiJiguang: '🛡️', rhodes: '🌙' }[key] ?? '🚇', kicker: tname(pick(level.place)).split(' · ').pop(), title: tname(level.title), text: pick(level.blurb), onClick: () => { close(); game.level(key); } });
      addBattleThumb(play, key);
      const told = withStory(play, { title: tname(level.title), kicker: tname(pick(level.place)), lines: [pick(level.blurb), pick(level.roster)] });
      // (The card's kicker is the date alone, to fit one line; the ⓘ has the place too.) A battle of armies (a `cast`) can be set up; a duel cannot.
      if (!level.cast) return told;
      return el('div', { className: 'level-card' }, told, el('button', { className: 'level-setup', type: 'button', textContent: t('menu.levels.setup'), title: t('menu.levels.setupTitle', { title: tname(level.title) }), onclick: () => muster(key) }));
    };
    body.append(el('div', { className: 'choices levels' }, custom, yard, ...Object.entries(SCENARIOS).map(card)));
    show('levels-screen');
  }

  /** A battle's setup screen (musterview.js); started, the battle as set up (main.js enterLevel). */
  function muster(key) {
    show('muster-screen');
    redraw = null;
    musterScreen(document.getElementById('muster-screen'), { key, level: battleOf(key), onBack: levels, onStart: (setup) => { close(); game.level(key, setup); } });
  }

  /** The custom battle: its ground and sides, then its men placed (custombattleview.js); fought as any set-up battle is. */
  function customBattle() {
    show('custom-screen');
    redraw = null;
    customBattleScreen(document.getElementById('custom-screen'), { onBack: levels, onFight: (setup) => { close(); game.level(CUSTOM_BATTLE.key, setup); } });
  }

  // ---- Deadliest Warrior -------------------------------------------------------
  // (`kept`: the picks of the screen as it was, when it is drawn again in another language.)
  function versus(kept = null) {
    // Each side picks a faction, then turns its carousel through that faction's warriors.
    const faction = kept?.faction ?? { red: 'knights', blue: 'japanese' };
    const custom = kept?.custom ?? { red: null, blue: null };
    // On horseback (each side's pick; only a man whose kit rides can: horses.js).
    const mounted = kept?.mounted ?? { red: false, blue: false };
    const body = screen('versus', t('menu.home.versus.title'), null, home);
    body.parentElement.classList.add('dw');
    const roster = (corner) => WARRIORS.filter((warrior) => warrior.faction === faction[corner]);
    // A faction opens on its flagship (`flagship` in the roster), else on its first.
    const opening = (corner) => Math.max(0, roster(corner).findIndex((warrior) => warrior.flagship));
    const at = kept?.at ?? { red: opening('red'), blue: opening('blue') };
    redraw = () => versus({ faction, custom, mounted, at });
    const entry = (corner) => custom[corner] ?? roster(corner)[at[corner]];
    const sides = {};
    for (const corner of ['red', 'blue']) {
      const tabs = el('div', { className: 'dw-tabs', role: 'tablist' }, ...FACTION_KEYS.filter((key) => WARRIORS.some((warrior) => warrior.faction === key)).map((key) => {
        const tab = el('button', { type: 'button', className: 'dw-tab', role: 'tab', title: pick(FACTIONS[key].blurb) }, el('span', { textContent: FACTIONS[key].glyph }), el('b', { textContent: tname(FACTIONS[key].label) }));
        tab.dataset.faction = key;
        tab.onclick = () => {
          faction[corner] = key;
          at[corner] = opening(corner);
          custom[corner] = null;
          build(corner);
        };
        return tab;
      }));
      // A mouse wheel turns into a sideways scroll on the row (a trackpad's own sideways swipe passes through).
      tabs.addEventListener('wheel', (wheel) => {
        if (tabs.scrollWidth <= tabs.clientWidth || Math.abs(wheel.deltaX) > Math.abs(wheel.deltaY)) return;
        tabs.scrollLeft += wheel.deltaY;
        wheel.preventDefault();
      }, { passive: false });
      const stage = el('div', { className: 'dw-stage' });
      const title = el('div', { className: 'dw-name' });
      const prev = el('button', { className: 'dw-arrow prev', type: 'button', ariaLabel: t('menu.versus.prev'), textContent: '‹', onclick: () => turn(corner, -1) });
      const next = el('button', { className: 'dw-arrow next', type: 'button', ariaLabel: t('menu.versus.next'), textContent: '›', onclick: () => turn(corner, 1) });
      const own = el('button', { className: 'dw-own', type: 'button', textContent: t('menu.versus.own'), onclick: () => wizard({ event: 'any', start: randomCharacter(), finish: () => t('menu.versus.use'), onDone: (inputs) => { custom[corner] = { key: `custom-${corner}-${Date.now()}`, title: inputs.name, line: styleName(STYLES[inputs.style]), inputs }; game.attract(); show('versus'); redraw = () => versus({ faction, custom, mounted, at }); draw(corner); }, onBack: () => { show('versus'); redraw = () => versus({ faction, custom, mounted, at }); } }) });
      const portraits = new Map();
      // Swipe across the stage to turn it.
      let downAt = null;
      stage.addEventListener('pointerdown', (press) => { downAt = press.clientX; });
      // A swipe ends in a click on the card it started on: that click is the swipe's, not a pick.
      let swiped = false;
      stage.addEventListener('pointerup', (lift) => {
        if (downAt === null) return;
        const moved = lift.clientX - downAt;
        downAt = null;
        swiped = Math.abs(moved) > 36;
        if (swiped) turn(corner, moved < 0 ? 1 : -1);
      });
      stage.addEventListener('click', (click) => {
        if (!swiped) return;
        swiped = false;
        click.stopPropagation();
      }, true);
      const section = el('section', { className: `dw-side ${corner}` }, el('span', { className: 'dw-corner', textContent: corner === 'red' ? t('menu.versus.red') : t('menu.versus.blue') }), tabs, prev, stage, next, title);
      sides[corner] = { section, cards: [], title, stage, tabs, portraits, own };
    }
    // The faction's warriors as cards on the stage (each portrait made once, kept).
    function build(corner) {
      const side = sides[corner];
      side.stage.replaceChildren();
      side.cards = roster(corner).map((warrior, index) => {
        const image = side.portraits.get(warrior.key) ?? el('img', { alt: '', draggable: false });
        side.portraits.set(warrior.key, image);
        const card = el('button', { className: 'dw-card', type: 'button', tabIndex: -1, onclick: () => { const offset = index - at[corner]; if (offset) turn(corner, offset); } }, image);
        card.dataset.index = String(index);
        side.stage.append(card);
        return { card, image, warrior };
      });
      for (const tab of side.tabs.children) tab.classList.toggle('on', tab.dataset.faction === faction[corner]);
      // The row scrolls when the factions don't fit: bring the chosen one into view (the row only, not the page).
      const chosen = side.tabs.querySelector('.dw-tab.on');
      if (chosen && side.tabs.scrollWidth > side.tabs.clientWidth) side.tabs.scrollTo({ left: chosen.offsetLeft - (side.tabs.clientWidth - chosen.offsetWidth) / 2, behavior: 'smooth' });
      draw(corner);
    }
    function turn(corner, by) {
      const count = roster(corner).length;
      custom[corner] = null;
      at[corner] = (at[corner] + by + count) % count;
      draw(corner);
    }
    function draw(corner) {
      const side = sides[corner];
      const count = side.cards.length;
      for (const { card, image, warrior } of side.cards) {
        let offset = Number(card.dataset.index) - at[corner];
        if (offset > count / 2) offset -= count;
        if (offset < -count / 2) offset += count;
        // The chosen in the middle; the next two coming in on the right, smaller and turned; one behind on the left.
        card.dataset.slot = String(Math.max(-2, Math.min(3, offset)));
        card.classList.toggle('chosen', offset === 0 && !custom[corner]);
        // Only the one in the middle takes a press; the arrows and a swipe turn to the others.
        card.inert = offset !== 0;
        if (offset >= -1 && offset <= 2 && !image.src) game.portrait(warrior.key, warrior.inputs).then((url) => { image.src = url; });
      }
      const shown = entry(corner);
      // His strength in stars (roster.js), the rating behind them on hover.
      const stars = starsOf(shown.inputs);
      const starLine = el('span', { className: 'dw-stars', textContent: stars ? '★'.repeat(stars) + '☆'.repeat(5 - stars) : '', title: stars ? t('menu.versus.rating', { rating: ratingOf(shown.inputs) }) : '' });
      // Mounted or on foot: offered to a man who rides, with his horse and its armour.
      const rides = canRide(shown.inputs);
      const kit = rides ? mountOf(shown.inputs) : null;
      // (A robot dog is its own legs: boltedOn, never on foot.)
      const bolted = rides && boltedOn(shown.inputs);
      const mount = el('button', { type: 'button', className: `dw-mount${rides && (mounted[corner] || bolted) ? ' on' : ''}`, disabled: !rides || bolted, textContent: bolted ? `🤖 ${tname(breedOf(kit.breed).label)}` : rides ? (mounted[corner] ? `${t('menu.versus.mounted', { breed: tname(breedOf(kit.breed).label) })}${kit.barding === 'bare' ? '' : t('menu.versus.barding', { barding: optionWords(kit.barding) })}` : t('menu.versus.onFoot')) : t('menu.versus.footOnly'), title: bolted ? t('menu.versus.robot') : rides ? t('menu.versus.rideTitle') : t('menu.versus.noRide') });
      mount.onclick = () => {
        mounted[corner] = !mounted[corner];
        draw(corner);
      };
      // His armour: its card (setcard.js) in a pop-up (infopop.js), its words selectable.
      const loreButton = el('button', { type: 'button', className: 'dw-mount', textContent: t('menu.versus.armour'), title: t('menu.versus.armourTitle') });
      loreButton.onclick = () => openInfoPop(setCardElement(wornCard(shown.inputs), () => game.portrait(shown.key ?? `lore:${shown.title}`, shown.inputs)), { label: t('menu.versus.armourLabel', { name: tname(shown.title) }) });
      // Under his name: on horseback or not, his armour, and making your own instead, side by side.
      side.title.replaceChildren(el('b', { textContent: tname(shown.title) }), starLine, el('span', { textContent: custom[corner] ? nameLine(shown.line) : lineShown(shown.inputs) }), el('div', { className: 'dw-buttons' }, mount, loreButton, side.own));
      if (custom[corner]) side.title.prepend(el('em', { textContent: t('menu.versus.yours') }));
    }
    const fightButton = el('button', { className: 'primary big dw-fight', type: 'button', textContent: t('menu.versus.fight') });
    fightButton.onclick = () => {
      // A character in armour comes in one of its picked designs.
      const red = normaliseInputs(redress(structuredClone(entry('red').inputs)));
      const blue = normaliseInputs(redress(structuredClone(entry('blue').inputs)));
      const armed = [red, blue].some((inputs) => STYLES[inputs.style]?.weapon);
      red.mounted = (mounted.red || boltedOn(red)) && canRide(red);
      blue.mounted = (mounted.blue || boltedOn(blue)) && canRide(blue);
      // Horsemen fight on the open field: room to charge and wheel round.
      const place = red.mounted || blue.mounted ? 'field' : armed ? 'colosseum' : 'ring';
      close();
      const fight = () => game.match({ red: [red], blue: [blue], place, game: 'versus', label: t('menu.home.versus.title'), next: { text: t('menu.versus.rematch'), retry: true, run: fight } });
      fight();
    };
    body.append(sides.red.section, el('div', { className: 'dw-middle' }, el('span', { className: 'dw-vs', textContent: t('menu.versus.vs') }), fightButton), sides.blue.section);
    build('red');
    build('blue');
    show('versus');
  }

  // ---- The character creator ---------------------------------------------------
  /**
   * One question at a time, with the fighter shown beside it as it changes.
   * `event`: 'boxing' (unarmed, in gloves), 'gladiator' (armed), or 'any'.
   */
  function wizard({ event, start, finish, onDone, onBack }) {
    const inputs = normaliseInputs(structuredClone(start));
    if (event === 'boxing') Object.assign(inputs, { outfit: { kind: 'boxing', design: 0 }, accessories: [] });
    let gearTouched = false;
    const styles = event === 'boxing' ? UNARMED : event === 'gladiator' ? ARMED : STYLE_KEYS.filter((key) => !STYLES[key].passive);
    // (Each title a getter: read as the step is drawn, in the language in force.)
    const steps = [
      { key: 'who', get title() { return t('wizard.who'); }, render: stepWho },
      { key: 'body', get title() { return t('wizard.body'); }, render: stepBody },
      { key: 'training', get title() { return t('wizard.training'); }, render: stepTraining },
      { key: 'style', get title() { return t('wizard.style'); }, render: stepStyle },
      ...(event === 'boxing' ? [] : [{ key: 'gear', get title() { return t('wizard.gear'); }, render: stepGear }]),
      { key: 'look', get title() { return t('wizard.look'); }, render: stepLook },
      { key: 'ready', get title() { return t('wizard.ready'); }, render: stepReady },
    ];
    // (`finish`: the last button's words, or a function giving them in the language in force.)
    const finishLabel = () => (typeof finish === 'function' ? finish() : finish);
    let index = 0;
    const root = document.getElementById('wizard');
    root.className = 'wizard';
    const panel = el('div', { className: 'wizard-panel', role: 'dialog', ariaLabel: t('wizard.label') });
    root.replaceChildren(panel);
    let previewTimer = null;
    const preview = () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => game.preview(inputs, event), 60);
    };

    function draw() {
      redraw = draw;
      panel.ariaLabel = t('wizard.label');
      const step = steps[index];
      const dots = el('ol', { className: 'steps', ariaLabel: t('wizard.steps') }, ...steps.map((each, at) => {
        const dot = el('li', { className: at === index ? 'now' : at < index ? 'done' : '' }, el('button', { type: 'button', textContent: String(at + 1), title: each.title, onclick: () => { index = at; draw(); } }));
        return dot;
      }));
      const content = el('div', { className: 'step-body' });
      step.render(content);
      const back = el('button', { type: 'button', textContent: index === 0 ? t('wizard.cancel') : t('common.back'), onclick: () => { if (index === 0) { game.attract(); onBack(); } else { index -= 1; draw(); } } });
      const nextLabel = index === steps.length - 1 ? finishLabel() : t('common.next');
      const next = el('button', { type: 'button', className: 'primary', textContent: nextLabel, onclick: () => {
        if (index === steps.length - 1) {
          onDone(normaliseInputs(structuredClone(inputs)));
        } else {
          index += 1;
          draw();
        }
      } });
      panel.replaceChildren(
        el('p', { className: 'step-count', textContent: t('wizard.step', { at: index + 1, of: steps.length }) }),
        el('h1', { textContent: step.title }),
        dots, content,
        el('div', { className: 'wizard-nav' }, back, next),
      );
      next.focus({ preventScroll: true });
      preview();
    }

    // Controls, each one plain and big.
    const buttons = (options, current, onPick, describe = (option) => optionWords(option)) => el('div', { className: 'chips', role: 'radiogroup' }, ...options.map((option) => {
      const button = el('button', { type: 'button', className: option === current() ? 'chip on' : 'chip', textContent: describe(option), role: 'radio', ariaChecked: String(option === current()) });
      button.onclick = () => { onPick(option); draw(); };
      return button;
    }));
    // (`track`: a CSS background for the slider's track, the Skin's shades.)
    const slider = ({ label, min, max, step, get, set, show: shown, track = null }) => {
      const value = el('output', { textContent: shown(get()) });
      const input = el('input', { type: 'range', min, max, step, value: get(), ariaLabel: label });
      if (track) input.style.setProperty('--tone-track', track);
      input.oninput = () => {
        set(Number(input.value));
        value.textContent = shown(get());
        refreshStats();
        preview();
      };
      return el('label', { className: track ? 'slider tone' : 'slider' }, el('span', { className: 'slider-head' }, el('b', { textContent: label }), value), input);
    };
    let statsBox = null;
    const refreshStats = () => {
      if (!statsBox) return;
      const stats = game.stats(inputs);
      statsBox.replaceChildren(...[
        [t('wizard.weight'), `${stats.weight.toFixed(0)} kg`], [t('wizard.bodyFat'), `${Math.round(stats.bodyFat * 100)}%`],
        [t('wizard.bench'), `${Math.round(stats.bench)} kg`], [t('wizard.sprint'), `${stats.sprint.toFixed(2)} s`],
      ].map(([name, text]) => el('div', { className: 'stat' }, el('span', { textContent: name }), el('b', { textContent: text }))));
    };
    const stats = () => {
      statsBox = el('div', { className: 'stats', ariaLive: 'polite' });
      refreshStats();
      return statsBox;
    };
    const swatches = (palette, current, onPick) => el('div', { className: 'swatches', role: 'radiogroup' }, ...Object.entries(palette).map(([name, hex]) => {
      const button = el('button', { type: 'button', className: hex === current() ? 'swatch on' : 'swatch', title: optionWords(name), ariaLabel: optionWords(name) });
      button.style.background = hex;
      button.onclick = () => { onPick(hex); draw(); };
      return button;
    }));

    function stepWho(content) {
      const name = el('input', { type: 'text', value: inputs.name, maxLength: 32, ariaLabel: t('wizard.name') });
      name.oninput = () => { inputs.name = name.value || 'Fighter'; };
      content.append(
        el('label', { className: 'field' }, el('b', { textContent: t('wizard.name') }), name),
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.sex') }), buttons(['male', 'female'], () => inputs.sex, (sex) => {
          inputs.sex = sex;
          if (!HAIR_STYLES[sex].includes(inputs.look.hairStyle)) inputs.look.hairStyle = HAIR_STYLES[sex][0];
          if (sex === 'female') inputs.look.facialHair = 'none';
          // An origin chosen with no composite of this sex: the nearest that has one, the skin kept within its range.
          settleOrigin(inputs.look, photoFaceRegions(sex));
        }, (sex) => (sex === 'male' ? t('wizard.man') : t('wizard.woman')))),
        slider({ label: t('wizard.age'), min: 18, max: 100, step: 1, get: () => inputs.age, set: (value) => { inputs.age = value; }, show: (value) => t('wizard.years', { n: value }) }),
      );
    }
    function stepBody(content) {
      content.append(
        slider({ label: t('wizard.height'), min: 150, max: 210, step: 1, get: () => inputs.heightCm, set: (value) => { inputs.heightCm = value; }, show: (value) => `${value} cm` }),
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.frame') }), buttons(['small', 'medium', 'large'], () => inputs.frame, (frame) => { inputs.frame = frame; refreshStats(); }, (frame) => ({ small: t('wizard.frame.small'), medium: t('wizard.frame.medium'), large: t('wizard.frame.large') })[frame])),
        stats(),
      );
    }
    function stepTraining(content) {
      const [low, high] = game.calorieRange(inputs);
      content.append(
        el('p', { className: 'hint', textContent: t('wizard.fatHint') }),
        slider({ label: t('wizard.training.label'), min: 0, max: 1, step: 0.01, get: () => inputs.exercise, set: (value) => { inputs.exercise = value; }, show: (value) => t('wizard.hours', { n: Math.round(game.hours(value)) }) }),
        slider({ label: t('wizard.eating'), min: Math.floor(low / 10) * 10, max: Math.ceil(high / 10) * 10, step: 10, get: () => inputs.calories, set: (value) => { inputs.calories = value; }, show: (value) => t('wizard.kcal', { n: Math.round(value).toLocaleString(getLang() === 'zh' ? 'zh-CN' : 'en') }) }),
        stats(),
      );
    }
    function stepStyle(content) {
      const groups = FACTION_KEYS.map((faction) => [faction, styles.filter((key) => STYLE_FACTION(key) === faction)]).filter(([, keys]) => keys.length);
      content.append(...groups.map(([faction, keys]) => el('div', { className: 'style-group' },
        el('b', { className: 'style-faction', textContent: `${FACTIONS[faction].glyph} ${tname(FACTIONS[faction].label)}` }),
        el('div', { className: 'cards compact' }, ...keys.map(styleCard)))));
    }
    function styleCard(key) {
      {
        const style = STYLES[key];
        // Its name only; what it is, in its pop-up (the ⓘ, a long press or a right-click).
        const card = el('button', { type: 'button', className: inputs.style === key ? 'card-choice on' : 'card-choice' }, el('b', { textContent: tname(style.label) }));
        card.onclick = () => {
          inputs.style = key;
          // Dressed for it, unless they have already chosen what to wear.
          const character = Object.values(PRESETS).find((preset) => preset.style === key);
          if (!gearTouched && event !== 'boxing' && character?.outfit) {
            inputs.outfit = { ...character.outfit, colors: randomColors(character.outfit.kind) };
            inputs.accessories = [...(character.accessories ?? [])];
          }
          draw();
        };
        return withInfo(card, () => el('div', { className: 'style-info' }, el('b', { textContent: tname(style.label) }), el('p', { textContent: pick(STYLE_NOTES[key]) })), t('wizard.styleInfo', { name: tname(style.label) }));
      }
    }
    // Outfit sets (outfitsets.js) under their factions, each a small tile (its picture and name), its description and stats in
    // a pop-up; the one worn above them (a tap: its card), with its finishes (colours, crests: the same stats).
    function stepGear(content) {
      const outfit = inputs.outfit ?? { kind: 'boxing', design: 0 };
      const worn = outfitOf(inputs);
      const set = outfitSets(worn.kind).find((each) => each.key === worn.set);
      const designs = set.designs.map((at) => [OUTFITS[worn.kind].designs[at], at]).filter(([design]) => !design.levelOnly);
      const sets = pickableSets();
      const pickSet = (kind, key) => {
        gearTouched = true;
        const changed = kind !== outfit.kind;
        // (The helmet slot kept: a helm chosen stays on over whatever set is worn.)
        inputs.outfit = { kind, design: firstDesignOf(kind, key), colors: changed ? randomColors(kind) : outfit.colors, ...(outfit.helm ? { helm: outfit.helm } : {}), ...(outfit.bareHead ? { bareHead: true } : {}) };
        if (changed) inputs.accessories = headgearOptions(kind).includes(inputs.accessories?.[0]) ? inputs.accessories : [];
        draw();
      };
      const full = (card, kind, key) => () => setCardElement(card, () => game.setPortrait?.(kind, key));
      const wornTile = setCardElement(wornCard(inputs), () => game.setPortrait?.(worn.kind, worn.set), { tile: true, tag: 'button' });
      const wornPick = withInfo(wornTile, full(wornCard(inputs), worn.kind, worn.set), t('wizard.wornInfo'));
      wornPick.classList.add('worn');
      wornTile.onclick = wornPick.openInfo;
      content.append(
        wornPick,
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.helmet') }), helmPicker()),
        ...(designs.length < 2 ? [] : [el('div', { className: 'field' }, el('b', { textContent: t('wizard.finish') }), buttons(designs.map(([, at]) => String(at)), () => String(outfit.design ?? 0), (at) => { gearTouched = true; inputs.outfit = { ...outfit, design: Number(at) }; }, (at) => tname(OUTFITS[outfit.kind].designs[at].label)))]),
        // The metal's steel and its decoration, where the kit offers them (outfits.js finishOptions).
        ...Object.entries(finishOptions(worn.kind)).filter(([, choices]) => choices).map(([field, choices]) => el('div', { className: 'field' }, el('b', { textContent: field === 'steel' ? t('wizard.steel') : t('wizard.decoration') }),
          buttons(choices.map(([value]) => value), () => inputs.outfit?.[field] ?? choices[0][0], (value) => { gearTouched = true; inputs.outfit = withFinish(inputs.outfit, field, value); }, (value) => tname(choices.find(([key]) => key === value)[1])))),
        ...(['top', 'bottom'].some((part) => worn.look[part]) ? [
          el('div', { className: 'field' }, el('b', { textContent: t('wizard.top') }), clothPicker('top')),
          el('div', { className: 'field' }, el('b', { textContent: t('wizard.legs') }), clothPicker('bottom')),
        ] : []),
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.head') }), buttons(headgearOptions(outfit.kind), () => inputs.accessories?.[0] ?? 'none', (item) => { gearTouched = true; inputs.accessories = item === 'none' ? [] : [item]; }, (item) => (item === 'none' ? t('wizard.nothing') : tname(HEADGEAR[item].label)))),
        ...FACTION_KEYS.map((faction) => [faction, sets.filter((each) => each.faction === faction)]).filter(([, group]) => group.length).map(([faction, group]) => el('div', { className: 'style-group' },
          el('b', { className: 'style-faction', textContent: `${FACTIONS[faction].glyph} ${tname(FACTIONS[faction].label)}` }),
          el('div', { className: 'set-cards' }, ...group.map((each) => {
            const card = setCard(each.kind, each.key);
            const tile = setCardElement(card, () => game.setPortrait?.(each.kind, each.key), { tile: true, tag: 'button', chosen: each.kind === worn.kind && each.key === worn.set });
            tile.onclick = () => pickSet(each.kind, each.key);
            return withInfo(tile, full(card, each.kind, each.key), t('wizard.setInfo', { name: tname(card.name) }));
          })))),
      );
    }
    // The helmet slot: the set's own helm, none, or another kit's (outfits.js helmChoices), under the faction it comes from.
    function helmPicker() {
      const helms = helmChoices();
      const select = el('select', { ariaLabel: t('wizard.helmet') }, el('option', { value: 'own', textContent: t('wizard.helmet.own') }), el('option', { value: 'none', textContent: t('wizard.helmet.none') }),
        ...FACTION_KEYS.map((faction) => [faction, helms.filter((helm) => helm.faction === faction)]).filter(([, group]) => group.length).map(([faction, group]) => el('optgroup', { label: `${FACTIONS[faction].glyph} ${tname(FACTIONS[faction].label)}` },
          ...group.map((helm) => el('option', { value: helm.key, textContent: `${tname(helm.name)} (${helm.kg.toFixed(1)} kg)` })))));
      select.value = helmSlotOf(inputs);
      select.onchange = () => { gearTouched = true; setHelmSlot(inputs, select.value); draw(); };
      return select;
    }
    // The colour of the clothes under the kit (`outfit.colors`): its own, or one picked from the cloth colours.
    function clothPicker(part) {
      const own = '#000001';
      const palette = { "kit's own": own, ...CLOTH_COLORS };
      const picker = swatches(palette, () => inputs.outfit?.colors?.[part] ?? own, (hex) => {
        gearTouched = true;
        const colors = { ...inputs.outfit?.colors };
        if (hex === own) delete colors[part];
        else colors[part] = hex;
        inputs.outfit = { ...inputs.outfit, colors };
      });
      picker.firstChild.classList.add('own');
      return picker;
    }
    // Where they are from (faceregions.js REGION_ORIGINS): the photo faces of their sex, by continent, whatever they wear or
    // fight with. Untouched it shows their kit's own (originOf) and writes nothing, so they are cast as that kit's men are;
    // chosen, it is `look.faceRegion`, and the skin goes back to the origin's own tone. The Skin slider then moves the shade
    // smoothly within the origin's range only (toneSpan); moving it settles the origin shown, since the shade is reckoned from it.
    // (Drawn faces, #faces=off, have no origin: the slider runs the whole ladder, as the swatches did.)
    const originNow = () => {
      const regions = photoFaceRegions(inputs.sex);
      return regions ? originOf(inputs, regions, outfitOf(inputs).faceRegion) : null;
    };
    function originPicker(origin) {
      const regions = photoFaceRegions(inputs.sex);
      const select = el('select', { ariaLabel: t('wizard.origin') }, ...REGION_ORIGINS.map((group) => {
        const offered = Object.keys(group.regions).filter((region) => regions.includes(region));
        return offered.length ? el('optgroup', { label: tname(group.label) }, ...offered.map((region) => el('option', { value: region, textContent: tname(group.regions[region]), selected: region === origin }))) : null;
      }));
      select.value = origin;
      select.onchange = () => {
        inputs.look.faceRegion = select.value;
        setShade(inputs.look, toneShade(regionTone(select.value)));
        draw();
      };
      return select;
    }
    function skinSlider(origin) {
      const look = inputs.look;
      const [low, high] = toneSpan(origin);
      // The shade seen: his own once the origin is his, else (cast from his kit) the composite's, which is the origin's tone.
      const shade = () => (!origin || look.faceRegion ? skinShadeOf(origin, look) : toneShade(regionTone(origin)));
      return slider({ label: t('wizard.skin'), min: low, max: high, step: 0.05, get: shade, track: shadeGradient(low, high), show: (value) => optionWords(shadeTone(value)), set: (value) => {
        setShade(look, value);
        if (origin) look.faceRegion ??= origin;
      } });
    }
    function stepLook(content) {
      const look = inputs.look;
      const origin = originNow();
      content.append(...[
        origin ? el('div', { className: 'field' }, el('b', { textContent: t('wizard.origin') }), originPicker(origin)) : null,
        skinSlider(origin),
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.hair') }), buttons(HAIR_STYLES[inputs.sex] ?? HAIR_STYLES.male, () => look.hairStyle, (style) => { look.hairStyle = style; })),
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.hairColour') }), swatches(HAIR, () => look.hairColor, (hex) => { look.hairColor = hex; })),
        inputs.sex === 'male' ? el('div', { className: 'field' }, el('b', { textContent: t('wizard.facialHair') }), buttons(['none', 'stubble', 'mustache', 'beard'], () => look.facialHair, (hair) => { look.facialHair = hair; })) : null,
        el('div', { className: 'field' }, el('b', { textContent: t('wizard.eyes') }), buttons(['brown', 'hazel', 'blue', 'green', 'grey', 'amber'], () => look.eyeColor, (eye) => { look.eyeColor = eye; })),
      ].filter(Boolean));
    }
    function stepReady(content) {
      const style = STYLES[inputs.style];
      const stat = game.stats(inputs);
      content.append(el('dl', { className: 'summary' }, ...[
        [t('wizard.name'), inputs.name], [t('wizard.style.label'), nameLine(styleName(style))],
        [t('wizard.body.label'), t('wizard.bodyLine', { sex: inputs.sex === 'male' ? t('wizard.man') : t('wizard.woman'), age: inputs.age, height: inputs.heightCm, weight: stat.weight.toFixed(0), fat: Math.round(stat.bodyFat * 100) })],
        ...(originNow() ? [[t('wizard.origin'), tname(regionName(originNow()))]] : []),
        [t('wizard.wearing'), `${tname(OUTFITS[inputs.outfit?.kind ?? 'boxing'].label)}${inputs.accessories?.[0] ? `${getLang() === 'zh' ? '，' : ', '}${getLang() === 'zh' ? tname(HEADGEAR[inputs.accessories[0]].label) : HEADGEAR[inputs.accessories[0]].label.toLowerCase()}` : ''}`],
      ].flatMap(([name, text]) => [el('dt', { textContent: name }), el('dd', { textContent: text })])));
    }

    show('wizard');
    draw();
  }

  // Back to the menu from a fight.
  game.onMenu(home);
  return { lastGate, home, levels, stages, versus, quickEvent, customBattle, close };
}
