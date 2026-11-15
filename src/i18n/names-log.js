// names-log: the fight log's words (main.js logEvent) in Chinese. The log's lines have their own Chinese templates beside the
// English ones; what fills them comes from the physics in English (an effect: "dazed for 3 s", "glanced off the helmet", a part
// struck, a weapon's name) and is read here: a whole phrase first, then a phrase with a name or a number in it, then any other
// name the game translates (tname), and otherwise the English as it is.
import { getLang, tname } from '../i18n.js';

// Whole phrases.
const LOG_PHRASES_ZH = {
  'a fresh quiver from the train': '辎重送来一壶新箭', 'a leg broken by the landing': '落地摔断了腿', 'a leg cut off': '一条腿被斩断',
  'a puff of smoke from the pan, and no shot': '药池冒了一缕烟，没响', 'ankle broken in the fall': '摔倒时扭断脚踝', 'blades meet': '刀刃相交',
  'bleeding hard': '大量出血', 'blindsided': '被偷袭', 'breaks and runs': '溃逃', 'breaks the hold': '挣脱压制', 'cannot get up': '起不来',
  'cannot lift him': '抬不动他', 'casts the net': '撒网', 'caught in the net': '被网缠住', 'checked': '被挡住', 'comes back to the fight': '重回战斗',
  'cut opened': '伤口裂开', 'dazed': '被打懵', 'dies of blood loss': '失血而死', 'drinks the tonic': '喝下药剂', 'drops down the garderobe': '从茅厕口落下',
  'facial fracture': '面骨骨折', 'falls': '倒下', 'fended off': '被格开', 'flash in the pan': '药池空燃', 'gets up off his knees': '从跪姿站起',
  'glanced off the barding': '被马甲滑开', 'glanced off the helmet': '被头盔滑开', 'glanced off the plate': '被板甲滑开', 'glances off the armour': '被甲胄滑开',
  'glances off the barding': '被马甲滑开', 'goes for the man who cut his comrade down': '扑向砍倒战友的人', 'goes to his knees with the pain': '疼得跪倒',
  'head against the ceiling': '头撞上顶棚', 'head hit the ground': '头磕在地上', 'held down': '被压住', 'his foot slips': '脚下一滑',
  'in the shield': '扎进盾里', 'into a gap in the armour': '刺入甲胄缝隙', 'into a horse': '撞上一匹马', 'into the wall': '撞上墙', 'is freed': '脱身',
  'its leg broken': '腿断了', 'jumps': '跃起', 'knocked flat': '被打翻在地', 'knocked him flat': '把他打翻在地', 'lands in the cesspool': '掉进粪池',
  'leg struck': '腿被击中', 'legs jarred by the landing': '落地震伤双腿', 'missed': '落空', 'on fire: runs': '着火：狂奔', 'puts on the helmet': '戴上头盔',
  'rests': '歇息', 'rib fracture': '肋骨骨折', 'rises out of the filth': '从污秽中爬起', 'rocked back by the kick': '被踢得后仰', 'runs onto a stake': '撞上木桩',
  'shield hooked': '盾被钩开', 'shield knocked aside': '盾被打偏', 'spine jarred': '脊椎受震', 'stabbed through the chest': '胸口被刺穿',
  'stopped by the shield': '被盾挡住', 'stumbles': '踉跄', 'stunned': '眩晕', 'swings the empty gun as a club': '抡起空枪当棍子',
  'swings up into the saddle': '翻身上马', 'taken on the shield': '用盾接住', 'the artery clamps': '动脉收紧', 'the bleeding is stopped': '止住了血',
  'the bone cut into': '砍进骨头', 'the bone shattered': '骨头碎裂', 'the charge smoulders and does not go': '火药闷燃，没有发射', 'the general has fallen': '主将阵亡',
  'the helm comes off': '头盔掉了', 'the helmet comes off': '头盔掉了', 'the hoof slips off him': '马蹄从他身上滑开', 'the lash on the shield': '鞭子抽在盾上',
  'the lash turned by what he wears': '鞭子被衣甲挡开', 'the match drops and nothing happens': '火绳掉了，什么也没发生', 'the obsidian edge is gone': '黑曜石刃口崩没了',
  'the pan is fouled and must be primed again': '药池脏了，得重新装药', 'the recoil snapped his arm': '后坐力震断了他的胳膊', 'the signal: the ambush is sprung': '信号：伏兵杀出',
  'the stake breaks': '木桩断了', 'through the heart': '穿心', 'thrown': '被摔出', 'thrown over the shoulder': '被过肩摔', 'tripped': '被绊倒',
  'up the ladder onto the wall': '顺梯登上城墙', 'wakes at the last rest': '在最后的歇息处醒来', 'knockdown': '击倒', 'overreached': '出手过猛',
  'panics': '惊慌', 'rallies': '重振', 'fights on': '继续奋战', 'cut': '砍伤', 'strike': '一击', 'meets': '刺中', 'hits': '击中',
  'stabbed': '被刺中', 'died of his injuries': '伤重而死', 'deep cut': '深深砍伤', 'a deep cut': '一道深伤', 'pushed back': '被推开', 'run through': '被刺穿',
  'hacked through': '被劈透', 'wind taken': '岔了气', 'reels': '摇晃', 'the ladder pushed off': '梯子被推倒', 'stabbed through': '被刺透',
  'out-boxing': '游击', 'pressure': '压迫', 'counter-punching': '防守反击', 'brawling': '乱战', 'accumulated': '累积', 'leg gave way': '腿软了',
  'one clean shot': '一记干净的重击', 'right': '右', 'left': '左', 'hip': '胯', 'wrist': '手腕', 'ankle': '脚踝', 'jaw': '下巴', 'nose': '鼻子',
  'skull': '颅骨', 'ribs': '肋骨', 'collarbone': '锁骨', 'fighter': '斗士',
  'glances off the helmet': '被头盔滑开', 'glances off the plate': '被板甲滑开', 'glanced off the armour': '被甲胄滑开', 'braced for it': '稳住了',
  'scutum': '大盾', 'parma': '小圆盾', 'shield torn away': '盾被夺走', 'ridden down': '被马踏倒', 'trampled': '被践踏', 'unhorsed': '落马',
  // Parts struck.
  head: '头部', trunk: '躯干', torso: '躯干', chest: '胸口', belly: '腹部', legs: '腿', leg: '腿', arm: '手臂', arms: '手臂', hand: '手', hands: '手',
  shield: '盾', neck: '脖子', face: '脸', body: '身体', back: '后背', foot: '脚', feet: '脚', hip: '胯', pelvis: '骨盆', shoulder: '肩', forearm: '前臂',
  upperarm: '上臂', thigh: '大腿', shin: '小腿', knee: '膝', elbow: '肘', guard: '格挡', weapon: '武器', blade: '刃',
};

// Phrases with a name or a number in them: [pattern, its Chinese].
const LOG_PATTERNS_ZH = [
  [/^dazed for (\d+) s$/, (m) => `懵了 ${m[1]} 秒`],
  [/^reeling for (\d+) s$/, (m) => `踉跄 ${m[1]} 秒`],
  [/^staggered \((\d+) s\)$/, (m) => `踉跄（${m[1]} 秒）`],
  [/^held down (\d+(?:\.\d+)?) s$/, (m) => `被压住 ${m[1]} 秒`],
  [/^knocked down, flung at ([\d.]+) m\/s$/, (m) => `被击倒，以 ${m[1]} m/s 甩出`],
  [/^horses collide at ([\d.]+) m\/s$/, (m) => `两马以 ${m[1]} m/s 相撞`],
  [/^its pace broken by ([\d.]+) m\/s$/, (m) => `步伐被打乱 ${m[1]} m/s`],
  [/^jumps \((.+)\)$/, (m) => `跃起（${logWords(m[1])}）`],
  [/^ridden down at ([\d.]+) m\/s$/, (m) => `以 ${m[1]} m/s 被马撞倒`],
  [/^trampled at ([\d.]+) m\/s$/, (m) => `以 ${m[1]} m/s 被践踏`],
  [/^knockdown \((.+)\)$/, (m) => `击倒（${logWords(m[1])}）`],
  [/^(.+) cut off$/, (m) => `${logWords(m[1])}被斩断`],
  [/^(.+) torn from his arm$/, (m) => `${logWords(m[1])}被扯离手臂`],
  [/^(right|left) (.+)$/, (m) => `${m[1] === 'right' ? '右' : '左'}${logWords(m[2])}`],
  [/^([a-z ]+): (.+)$/, (m) => `${logWords(m[1])}：${logWords(m[2])}`],
  [/^(.+) broken in the fall$/, (m) => `摔倒时${logWords(m[1])}骨折`],
  [/^(.+) broken(.*)$/, (m) => `${logWords(m[1])}骨折${m[2] ? logWords(m[2].replace(/^[,:]?\s*/, '')) : ''}`],
  [/^(.+) knocked off$/, (m) => `${logWords(m[1])}被打飞`],
  [/^(.+): broken hand$/, (m) => `${tname(m[1])}：手骨折`],
  [/^(.+): stopped by the armour$/, (m) => `${logWords(m[1])}：被甲胄挡住`],
  [/^(.+): the ball dents the plate$/, (m) => `${logWords(m[1])}：铅弹在板甲上打出凹痕`],
  [/^beats through the (.+)$/, (m) => `击穿${logWords(m[1])}`],
  [/^draws the (.+)$/, (m) => `拔出${logWords(m[1])}`],
  [/^sheathes the (.+)$/, (m) => `收起${logWords(m[1])}`],
  [/^takes up the (.+?)( again)?$/, (m) => `${m[2] ? '重新' : ''}拿起${logWords(m[1])}`],
  [/^picks up the (.+)$/, (m) => `捡起${logWords(m[1])}`],
  [/^holds the (.+) in one hand$/, (m) => `单手握${logWords(m[1])}`],
  [/^parried with the (.+)$/, (m) => `用${logWords(m[1])}架开`],
  [/^his (.+) caught in the wolf-brush$/, (m) => `他的${logWords(m[1])}被狼筅缠住`],
  [/^hurts his (.+)$/, (m) => `伤了${logWords(m[1])}`],
  [/^pulls the pin of a (.+)$/, (m) => `拔掉${logWords(m[1])}的引信`],
  [/^puts on (.+)$/, (m) => `穿上${logWords(m[1])}`],
  [/^switches to (.+)$/, (m) => `换成${logWords(m[1])}`],
  [/^the (.+) shattered$/, (m) => `${logWords(m[1])}碎了`],
  [/^the (.+) splits apart$/, (m) => `${logWords(m[1])}裂开了`],
  [/^the (.+) split$/, (m) => `${logWords(m[1])}裂了`],
  [/^the (.+) falls$/, (m) => `${logWords(m[1])}掉落`],
  [/^the (.+) goes off$/, (m) => `${logWords(m[1])}炸了`],
  [/^(.+) dropped$/, (m) => `${logWords(m[1])}脱手`],
  [/^the (.+)$/, (m) => logWords(m[1])],
  [/^([lr])([A-Z]\w*)$/, (m) => `${m[1] === 'l' ? '左' : '右'}${logWords(m[2].toLowerCase())}`],
];

/** An English word or phrase of the fight log in the language in force (English as it is). */
export function logWords(english) {
  if (english === null || english === undefined) return '';
  const words = String(english);
  if (getLang() !== 'zh') return words;
  const key = words.trim();
  if (Object.hasOwn(LOG_PHRASES_ZH, key)) return LOG_PHRASES_ZH[key];
  if (Object.hasOwn(LOG_PHRASES_ZH, key.toLowerCase())) return LOG_PHRASES_ZH[key.toLowerCase()];
  for (const [pattern, chinese] of LOG_PATTERNS_ZH) {
    const found = pattern.exec(key);
    if (found) return chinese(found);
  }
  const named = tname(key);
  if (named !== key) return named;
  const titled = tname(key.charAt(0).toUpperCase() + key.slice(1));
  return titled !== key.charAt(0).toUpperCase() + key.slice(1) ? titled : words;
}

/** A part struck (the physics' key: 'head', 'lForearm', 'trunk'), in the language in force. */
export const logPart = (part) => logWords(part);
