// What Chen Er sees, dying at the Hun River: drawn from the life the player lived. Each entry is shown only if its
// `when(life)` holds (the flags, family and comrades the life actually has); `weight` is how likely the engine is to
// draw it when it cannot show them all; `cast` names the comrades a 3D flashback stages; `tone` sets the cut (heavy,
// sad, or the few slightly beautiful). Entries marked `last: true` close the sequence, in this order, after the drawn
// ones: his waist tag, then his brother's letter (read to him, or never read; the reader is told either way).
import { chapAlive, chapComrade, chapDead, chapFamily, chapFlag } from './kit.js';

const FB_LETTER = {
  zh: '“二弟：家里没米了，我去营里寻你。不要你的钱，就是看看你。饼留了半块，是给你的。哥。”',
  en: '"Second brother: there\'s no rice at home, so I\'m coming to the camp to find you. I don\'t want your money. I only want to see you. I\'ve kept back half the cake. It\'s for you. Your brother."',
};

// Did he die in a battle (not on the drill ground)?
const fbFellInBattle = (life, id) => chapDead(life, id) && chapComrade(life, id)?.diedAt?.how !== 'executed';

export const FLASHBACKS = [
  // His brother.
  {
    id: 'fb-pole', weight: 2, tone: 'beautiful', cast: [],
    when: () => true,
    text: {
      zh: '小时候，哥哥从煤场回来，扁担一头挑着煤，一头挑着他。',
      en: 'When he was small his brother came home from the coal yard with coal at one end of the pole and him at the other.',
    },
  },
  {
    id: 'fb-jar', weight: 2, tone: 'sad', cast: [],
    when: () => true,
    text: {
      zh: '哥哥数铜钱，数到一半停了，说：够了。其实还差几文。他把自己那天的饭钱添了进去。',
      en: 'His brother counting coins out of the jar, stopping halfway: that\'s enough. It was a few coppers short. He made it up with what he had for his dinner that day.',
    },
  },
  {
    id: 'fb-flats', weight: 3, tone: 'heavy', cast: [],
    when: () => true,
    text: {
      zh: '河滩。泥。一个弯着的背。他把那个人翻过来。',
      en: 'The river flats. Mud. A bent back. He turns the man over.',
    },
  },
  {
    id: 'fb-finished', weight: 3, tone: 'heavy', cast: [],
    when: (life) => chapFlag(life, 'finished'),
    text: {
      zh: '那天补刀，一刀一个，他没看脸。后来他常常想，那些脸里，有没有哥哥在路上认识的人。',
      en: 'That day on the flats, one stroke each, and he did not look at the faces. Afterwards he often wondered whether any of them belonged to people his brother had met on the road.',
    },
  },
  {
    id: 'fb-spared', weight: 2, tone: 'sad', cast: [],
    when: (life) => chapFlag(life, 'spared'),
    text: {
      zh: '那天河滩上，有一个人听了他的话，没有出声。那个人后来活下来没有，他不知道。',
      en: 'That day on the flats one of them did as he said, and kept quiet. Whether that one lived, he never knew.',
    },
  },
  // The friend executed after the pay protest, or lost in battle.
  {
    id: 'fb-jin-pole', weight: 4, tone: 'heavy', cast: ['jin'],
    when: (life) => chapFlag(life, 'jinExecuted'),
    text: {
      zh: '石门寨的教场，旗杆底下。阿满朝营房这边看了一眼。他什么也没说，他也什么都没说。',
      en: 'The drill ground at Shimenzhai, the foot of the flagpole. Aman looked once toward the barracks. Aman said nothing, and nor did he.',
    },
  },
  {
    id: 'fb-jin-snow', weight: 2, tone: 'beautiful', cast: ['jin'],
    when: (life) => (chapComrade(life, 'jin')?.diedAt?.chapter ?? 9) >= 3,
    text: {
      zh: '上牡丹峰的路上，金阿满说，朝鲜的雪比义乌的白。他说的时候在笑。',
      en: 'On the way up Moranbong Jin Aman said the snow in Korea was whiter than the snow at home. He was laughing when he said it.',
    },
  },
  {
    id: 'fb-jin-fell', weight: 2, tone: 'sad', cast: ['jin'],
    when: (life) => fbFellInBattle(life, 'jin'),
    text: {
      zh: '金阿满死得早，没赶上讨饷，也没赶上被斩。他娘在赤岸，等的那笔米钱，一直没有等到。',
      en: 'Jin Aman died early: too early for the pay protest, too early to be beheaded for it. His mother in Chi\'an never did get the rice money she was waiting for.',
    },
  },
  // Comrades, living or dead.
  {
    id: 'fb-wang', weight: 2, tone: 'sad', cast: ['wang'],
    when: (life) => chapDead(life, 'wang'),
    text: {
      zh: '王老七背军法：临阵退缩的，甲长割他的耳朵。背完了加一句：书上写的，都对。',
      en: 'Wang Laoqi reciting the law: a man who falls back, his file leader cuts off his ear. And then, always: everything the book says is right.',
    },
  },
  {
    id: 'fb-wang-alive', weight: 1, tone: 'beautiful', cast: ['wang'],
    when: (life) => chapAlive(life, 'wang'),
    text: {
      zh: '王老七八十岁了，还活着，还在兵册上。上一回见他，他在晒那本《纪效新书》，一页一页摊在太阳底下，像晒稻谷。',
      en: 'Wang Laoqi, eighty, still alive, still on the roll. The last time he saw him he was airing the drill manual, page by page in the sun, like grain.',
    },
  },
  {
    id: 'fb-lou', weight: 2, tone: 'sad', cast: ['lou'],
    when: (life) => fbFellInBattle(life, 'lou'),
    text: {
      zh: '楼大有扛着狼筅走在前头，竹枝在风里沙沙响，像义乌山上的竹林。',
      en: 'Lou Dayou walking in front with the wolf-brush on his shoulder, its branches rustling in the wind like the bamboo on the hills at home.',
    },
  },
  {
    id: 'fb-ye', weight: 2, tone: 'sad', cast: ['ye'],
    when: (life) => fbFellInBattle(life, 'ye'),
    text: {
      zh: '叶春生替人写家书，写到“平安”两个字，不另收钱。',
      en: 'Ye Chunsheng writing the men\'s letters home, charging nothing extra for "safe and well".',
    },
  },
  {
    id: 'fb-he', weight: 1, tone: 'heavy', cast: ['he'],
    when: (life) => chapDead(life, 'he'),
    text: {
      zh: '何二狗蹲在北营门口，一颗一颗地数头，嘴里念着三七、三七。',
      en: 'He Ergou squatting at the northern camp\'s gate counting heads, one by one, muttering: three in ten, three in ten.',
    },
  },
  {
    id: 'fb-zhu', weight: 1, tone: 'sad', cast: ['zhu'],
    when: (life) => chapDead(life, 'zhu'),
    text: {
      zh: '朱应龙说，当兵好，当兵至少有人管饭。',
      en: 'Zhu Yinglong saying: soldiering\'s better. At least someone feeds you.',
    },
  },
  {
    id: 'fb-shen', weight: 2, tone: 'sad', cast: ['shen'],
    when: (life) => chapComrade(life, 'shen') !== null,
    text: {
      zh: '沈小乙问：戚爷爷的兵，真的一个打十个？他十八岁，跟辽生一般大。',
      en: 'Shen Xiaoyi asking: General Qi\'s men, could each of them really beat ten? Eighteen, the same age as Liaosheng.',
    },
  },
  // The war's ledger.
  {
    id: 'fb-heads', weight: 1, tone: 'heavy', cast: [],
    when: () => true,
    text: {
      zh: '平壤，北营门口挑着灯笼点首级，一颗一颗，像收秋。',
      en: 'Pyongyang: heads being counted by lantern at the northern camp\'s gate, one by one, like a harvest coming in.',
    },
  },
  {
    id: 'fb-toe', weight: 1, tone: 'sad', cast: [],
    when: () => true,
    text: {
      zh: '蔚山，一个北兵把冻掉的脚趾头揣进怀里，说要带回家埋。',
      en: 'Ulsan: a northern trooper putting a frozen-off toe inside his coat, to take home and bury.',
    },
  },
  {
    id: 'fb-footprints', weight: 1, tone: 'sad', cast: [],
    when: () => true,
    text: {
      zh: '萨尔浒的雪地里，一行一行的脚印往南走，有几行走着走着，就没有了。',
      en: 'In the snow after Sarhu, lines of footprints going south, and some of the lines just stopping.',
    },
  },
  {
    id: 'fb-kuandian', weight: 2, tone: 'heavy', cast: [],
    when: (life) => chapFlag(life, 'drove') && !chapFlag(life, 'helpedOldMan'),
    text: {
      zh: '宽甸的路上，死的人倒了一路。上头说，这叫“招复逃人”。',
      en: 'The road in from Kuandian, the dead all along it. Upstairs they called it "bringing back runaway subjects".',
    },
  },
  {
    id: 'fb-cart', weight: 2, tone: 'beautiful', cast: [],
    when: (life) => chapFlag(life, 'helpedOldMan'),
    text: {
      zh: '宽甸的路上，一个老汉坐在他押的车上，一路没说话，下车的时候，给他鞠了一躬。',
      en: 'The road in from Kuandian: an old man riding on his cart, silent the whole way, who bowed to him when he got down.',
    },
  },
  {
    id: 'fb-diggers', weight: 3, tone: 'heavy', cast: [],
    when: (life) => chapFlag(life, 'killedForHeads'),
    text: {
      zh: '那几个挖参的跪在雪里。千总说，过年以前得报一回功。',
      en: 'The ginseng diggers kneeling in the snow. The battalion officer saying there had to be a report of merit before New Year.',
    },
  },
  {
    id: 'fb-diggers-free', weight: 2, tone: 'beautiful', cast: [],
    when: (life) => chapFlag(life, 'letDiggersGo'),
    text: {
      zh: '那几个挖参的，跑进林子里，一回头也没有回。',
      en: 'The ginseng diggers running into the trees, not one of them looking back.',
    },
  },
  // His wife and the children he wished for.
  {
    id: 'fb-cotton', weight: 4, tone: 'beautiful', cast: [],
    when: (life) => chapFamily(life, 'wife'),
    text: {
      zh: '成亲后头一个冬天，孙氏拆了自己的棉袄，把棉花絮进他的号衣。浑河边上，有一支箭扎进那层棉花里，没有扎透。',
      en: 'The first winter they were married, Mrs Sun unpicked her own padded jacket and wadded the cotton into his uniform. By the Hun River an arrow went into that cotton and did not come through.',
    },
  },
  {
    id: 'fb-ahe-wait', weight: 3, tone: 'beautiful', cast: [],
    when: (life) => chapFamily(life, 'daughter') && chapFlag(life, 'waitedForAhe'),
    text: {
      zh: '阿禾躲在她娘身后，问这个人是谁。他蹲着，一直蹲到她自己走过来。',
      en: 'Ahe behind her mother, asking who the man was. He stayed crouched until she came to him by herself.',
    },
  },
  {
    id: 'fb-ahe-lift', weight: 3, tone: 'sad', cast: [],
    when: (life) => chapFamily(life, 'daughter') && !chapFlag(life, 'waitedForAhe'),
    text: {
      zh: '他把阿禾抱起来，阿禾哭了。他一年回去两三趟，回一趟，她哭一回，哭到第三年，不哭了。',
      en: 'He picked Ahe up, and she cried. Two or three times a year he came home, and every time she cried, until the third year, when she stopped.',
    },
  },
  {
    id: 'fb-ahe-hands', weight: 3, tone: 'beautiful', cast: [],
    when: (life) => chapFlag(life, 'aheWarmedHands'),
    text: {
      zh: '阿禾捧着他冻裂的手，往上哈气。',
      en: 'Ahe holding his split, frozen hands, breathing on them.',
    },
  },
  {
    id: 'fb-son-trade', weight: 2, tone: 'sad', cast: [],
    when: (life) => chapFlag(life, 'toldSonTrade'),
    text: {
      zh: '他跟辽生说：学门手艺，别当兵。辽生没吭声。他不知道儿子听进去没有。',
      en: 'He told Liaosheng: learn a trade, don\'t be a soldier. Liaosheng said nothing. He never knew whether the boy took it in.',
    },
  },
  {
    id: 'fb-son-none', weight: 2, tone: 'sad', cast: [],
    when: (life) => chapFlag(life, 'toldSonNone'),
    text: {
      zh: '辽生问他杀了几个鞑子。他说：一个也没有。儿子看他的样子，像是有点失望。',
      en: 'Liaosheng asked how many Tatars he had killed. None, he said. The boy looked a little disappointed in him.',
    },
  },
  {
    id: 'fb-children', weight: 4, tone: 'heavy', cast: [],
    when: (life) => chapFamily(life, 'son'),
    text: {
      zh: '辽阳城外，一个兵的女人，一个十三岁的儿子，一个十岁的女儿。城要是破了——他想到这里，就不往下想了。',
      en: 'Outside Liaoyang: a soldier\'s wife, a son of thirteen, a daughter of ten. If the city falls: he gets that far, and stops thinking.',
    },
  },
  {
    id: 'fb-matchmaker', weight: 2, tone: 'beautiful', cast: ['ma'],
    when: (life) => chapFlag(life, 'married') && chapComrade(life, 'ma') !== null,
    text: {
      zh: '马得胜说：再不娶，死了连个烧纸的都没有。他娶了。现在，有人给他烧纸了吗？',
      en: 'Ma Desheng saying: marry now, or there\'ll be no one to burn paper for you. He married. Will anyone burn paper for him now?',
    },
  },
  {
    id: 'fb-single', weight: 3, tone: 'sad', cast: [],
    when: (life) => chapFlag(life, 'single'),
    text: {
      zh: '他没有娶。那时候他觉得，当兵的人娶亲是害了人家。现在他还是这么觉得，只是没有人给他烧纸了。',
      en: 'He never married. At the time he thought a soldier who marries does a woman no favours. He still thinks so. It is only that now there will be no one to burn paper for him.',
    },
  },
  // The last lines.
  {
    id: 'fb-last-tag', weight: 0, tone: 'sad', cast: [], last: true,
    when: () => true,
    text: {
      zh: '腰牌上写着：陈二，年十八，面黄无须，左眉有痣，能举百斤。他五十三了。腰牌上，他还是十八。',
      en: 'The waist tag says: Chen Er, eighteen, sallow, beardless, a mole over the left brow, can lift a hundred jin. He is fifty-three. On the tag he is still eighteen.',
    },
  },
  {
    id: 'fb-last-letter', weight: 0, tone: 'beautiful', cast: [], last: true,
    when: (life) => chapFlag(life, 'letterRead'),
    text: {
      zh: `那封信还在腰牌的绳结里。那年有人念给他听过，信上写的是：${FB_LETTER.zh}哥哥饿着肚子走了一路，那半块饼，一口也没有动。`,
      en: `The letter is still in the cord of his waist tag. Someone read it to him once. It said: ${FB_LETTER.en} His brother walked all that way hungry, and never touched the half cake.`,
    },
  },
  {
    id: 'fb-last-unread', weight: 0, tone: 'beautiful', cast: [], last: true,
    when: (life) => !chapFlag(life, 'letterRead'),
    text: {
      zh: `那封信还在腰牌的绳结里。他一辈子没有让人念。他一直以为，信上写的是：别回来。信上写的是：${FB_LETTER.zh}`,
      en: `The letter is still in the cord of his waist tag. In all his life he never had it read to him. He always supposed it said: don't come home. What it said was: ${FB_LETTER.en}`,
    },
  },
];
