// Chapter 8, 1621: the Hun River, the southern troops' last stand. The record: the Jin attack on Shenyang on the 12th
// of the third month of Tianqi 1, the city opened from inside next day, He Shixian and You Shigong killed; the relief
// under Chen Ce and Tong Zhongkui arriving too late; "If we cannot save Shenyang, what have we been doing here three
// years?"; the Sichuan men (Qin Bangping's White Poles, Zhou Dunji) north of the bridge, beating back the white and
// yellow banners, broken by hunger and cannon; Qi Jin's and Zhang Mingshi's Zhejiang camp south of it, some 3,000 men
// and 2,000 household troops, carts, guns, a ditch, a fence of sorghum stalks plastered with mud; Zhu Wanliang and
// Jiang Bi's relief at Baitapu beaten back; the powder spent, then spears and sabres, armour padded with thick cotton;
// Chen Ce killed, Tong Zhongkui stopped from fleeing by Qi Jin, both killed with Zhang Mingshi, Yuan Jianlong, Deng
// Qilong; "ten thousand-odd against tens of thousands, and killed thousands"; Liaoyang reached on the 19th and lost
// two days later, Yuan Yingtai hanging himself with his sword and seal (明史 卷259, 卷271; zh.wikipedia 浑河之战 (1621年)).
// He falls as a leader: the finale's after-cards read the same whether the simulation killed him or the night did.
import { chapBelow, chapFallenCard, chapFamily, chapHeroUp, chapLeftPlace } from './kit.js';

// The words every Qi Jin card opens with.
const HUNRIVER_QIJIN = {
  zh: '萨尔浒以后，辽事一坏到底，朝廷又想起了浙兵。副将戚金带着浙兵到了辽东。戚金是戚继光的侄子，他的兵还照《纪效新书》操练。营里懂这一套的老兵不多了，陈二算一个。',
  en: 'After Sarhu, with Liaodong going from bad to worse, the court remembered the Zhejiang troops once more. Brigade General Qi Jin brought Zhejiang men to Liaodong. Qi Jin was Qi Jiguang\'s nephew, and his men still drilled by the Jixiao Xinshu. Few old hands left in the camp knew the drill. Chen Er was one.',
};

export const CHAPTER_HUNRIVER = {
  id: 'hunriver', n: 8, year: 1621,
  title: { zh: '浑河', en: 'The Hun River' },
  battle: 'hunriver',
  finale: true,
  before: [
    // Qi Jin takes the old hands who know the drill and gives them what posts he has: as an appointment of his own (委),
    // one up from where the man stands, or a company for a man who never rose.
    {
      id: 'hunriver-qijin',
      when: (life) => chapBelow(life, 'shaoguan'),
      text: {
        zh: `${HUNRIVER_QIJIN.zh}戚金让他当了哨官。`,
        en: `${HUNRIVER_QIJIN.en} Qi Jin made him a company officer.`,
      },
      choices: [
        { text: { zh: '接过官旗。', en: 'Take the company\'s banner.' }, effects: { rank: 'shaoguan', promoted: 'given' } },
      ],
    },
    {
      id: 'hunriver-qijin-bazong',
      when: (life) => !chapBelow(life, 'shaoguan') && chapBelow(life, 'bazong'),
      text: {
        zh: `${HUNRIVER_QIJIN.zh}他在辽东已经是哨官了。戚金委他做了把总，管几个哨官。那几个哨官，有新补的，有花钱买的，懂这一套的只有他。`,
        en: `${HUNRIVER_QIJIN.en} He was a company officer in Liaodong already. Qi Jin appointed him commander (把总, bazong) over several companies. Of their officers, some were new and some had bought their posts; only he knew the drill.`,
      },
      choices: [
        { text: { zh: '接过令箭。', en: 'Take the arrow of command (令箭).' }, effects: { rank: 'bazong', promoted: 'given' } },
      ],
    },
    {
      id: 'hunriver-qijin-kept',
      when: (life) => !chapBelow(life, 'bazong'),
      text: {
        zh: `${HUNRIVER_QIJIN.zh}戚金让他还当把总。`,
        en: `${HUNRIVER_QIJIN.en} Qi Jin kept him on as a commander.`,
      },
      choices: [],
    },
    {
      id: 'hunriver-shen',
      text: {
        zh: '新兵沈小乙，义乌人，十八岁，跟辽生差不多大。他问哨官：戚爷爷的兵，真的一个打十个？陈二说：一个打一个。十二个人站在一起。',
        en: 'A recruit, Shen Xiaoyi, from Yiwu, eighteen, about the age of Liaosheng. He asked his officer: General Qi\'s men, was it true one of them could beat ten? Chen Er said: one man beats one man. Twelve men stand together.',
      },
      choices: [],
    },
    {
      id: 'hunriver-shenyang',
      text: {
        zh: '天启元年三月十二日，后金兵攻沈阳。第二天，城里投降过来的人做了内应，城破，总兵贺世贤、尤世功战死。总兵陈策、童仲揆带着川兵、浙兵赶来救援，到了浑河边上，沈阳已经丢了。',
        en: 'On the twelfth of the third month of 1621, the first year of Tianqi, the Jin attacked Shenyang. Next day men who had come over to the Ming opened it from inside; the city fell, and its commanders He Shixian and You Shigong died. The relief under Regional Commanders Chen Ce and Tong Zhongkui, Sichuan men and Zhejiang men, reached the Hun River after Shenyang was already lost.',
      },
      choices: [],
    },
    {
      id: 'hunriver-camp',
      text: {
        zh: '有人劝退兵。将领们说：“我辈不能救沈，在此三年何为！”川兵过了河，在桥北扎营；戚金、张名世的浙兵在桥南五里扎营，排开战车枪炮，挖了壕沟，拿高粱秸扎成栅栏，外面糊上泥。',
        en: 'Some said turn back. The commanders said: "If we cannot save Shenyang, what have we been doing here three years?" The Sichuan men crossed and camped north of the bridge. Qi Jin\'s and Zhang Mingshi\'s Zhejiang men camped five li south of it, drew up their carts and guns, dug a ditch, and built a fence of sorghum stalks plastered with mud.',
      },
      choices: [],
    },
    {
      id: 'hunriver-sichuan',
      text: {
        zh: '川兵先接的仗。秦邦屏的白杆兵两回打退了白旗、黄旗的骑兵，后金的人死在枪弩之下的有几千。可是川兵饿着肚子打了一整天，后金又推上来了炮。桥北的营破了，秦邦屏、周敦吉战死。后金兵渡过河来，把桥南的浙营围了好几层。',
        en: 'The Sichuan men fought first. Twice Qin Bangping\'s White Poles beat back the white and yellow banners\' horse, and thousands of the Jin died under their spears and crossbows. But the Sichuan men had fought all day on empty stomachs, and then the Jin brought up cannon. The camp north of the bridge broke; Qin Bangping and Zhou Dunji died. The Jin crossed the river and closed round the Zhejiang camp to the south, ring upon ring.',
      },
      choices: [],
    },
    {
      id: 'hunriver-relief',
      text: {
        zh: '朱万良、姜弼的一万多援兵到了白塔铺，派了几百人上来，碰上二百巴牙喇，追过去，撞上后金的大营，被打了回去。浙营里的人看见了援兵的旗，也看见那些旗往回走。',
        en: 'Zhu Wanliang and Jiang Bi\'s ten thousand-odd relief reached Baitapu and sent a few hundred men forward. They met two hundred Bayara, the Jin guard, chased them, ran into the Jin main camp, and were driven back. In the Zhejiang camp they saw the relief\'s flags. They saw the flags go back.',
      },
      choices: [],
    },
    {
      id: 'hunriver-place',
      text: {
        zh: '浙营里只有三千人，外加两千家丁。哨官的位置，在哨旗底下。',
        en: 'The Zhejiang camp held three thousand men, and two thousand household troops besides. A company officer\'s place is under the company flag.',
      },
      choices: [
        { text: { zh: '站到哨旗底下。', en: 'Stand under the company flag.' }, effects: { place: 'front' } },
        { text: { zh: '让沈小乙站在你身后。', en: 'Put Shen Xiaoyi behind you.' }, effects: { place: 'front', bond: { shen: 1 } } },
      ],
    },
  ],
  after: [
    {
      id: 'hunriver-powder',
      text: {
        zh: '火药打完了。浙兵扔下铳，拿起竹竿枪和腰刀接着打。他们穿着甲，甲外头裹着厚棉，刀箭很难进去。后金兵一层一层地上，浙兵一层一层地倒。',
        en: 'The powder ran out. The Zhejiang men dropped their guns, took up bamboo-shafted spears and their sabres, and fought on. They wore armour with thick cotton wadded over it, and blades and arrows hardly went in. The Jin came on rank after rank, and the Zhejiang men fell rank after rank.',
      },
      choices: [],
    },
    {
      id: 'hunriver-commanders',
      text: {
        zh: '陈策战死。童仲揆想走，戚金拦住了他，两个人一道死在营里，张名世也死了。“独此战，以万余人当虏数万，杀数千人。”这是后来的人说的。浙营里，没有几个人活着说话。',
        en: 'Chen Ce died. Tong Zhongkui made to leave; Qi Jin stopped him, and the two of them died together in the camp, and Zhang Mingshi with them. "In this one battle ten thousand-odd stood against the enemy\'s tens of thousands, and killed thousands": that was said by men who came later. Of the Zhejiang camp, hardly a man lived to say anything.',
      },
      choices: [],
    },
    chapFallenCard('hunriver', 'shen', {
      zh: '沈小乙死在哨旗前头。他到死都以为，戚爷爷的兵一个能打十个。',
      en: 'Shen Xiaoyi died in front of the company flag. To the end he believed General Qi\'s men could each beat ten.',
    }),
    chapFallenCard('hunriver', 'lou', {
      zh: '楼大有死在浑河边上。他从义乌带来的那几根竹枝，早就没有了。',
      en: 'Lou Dayou died by the Hun River. The bamboo branches he had carried from Yiwu were long gone.',
    }),
    chapFallenCard('hunriver', 'ye', {
      zh: '叶守备死在浑河。他写了一辈子捷报，最后这一仗没有捷报可写。',
      en: 'Commandant Ye died at the Hun River. He had written victory reports all his life. This last battle had none to write.',
    }),
    chapFallenCard('hunriver', 'zhu', {
      zh: '朱应龙死了，金华的田，他到底没有赎回来。',
      en: 'Zhu Yinglong died. He never did buy back the land in Jinhua.',
    }),
    chapFallenCard('hunriver', 'ma', {
      zh: '马得胜死在浑河，离辽阳城一天的路。',
      en: 'Ma Desheng died at the Hun River, a day\'s walk from Liaoyang.',
    }),
    chapFallenCard('hunriver', 'he', {
      zh: '何二狗死了。他死在一群不割头的人中间。',
      en: 'He Ergou died among men who did not cut heads.',
    }),
    {
      id: 'hunriver-fall',
      when: (life, outcome) => chapHeroUp(outcome) && !chapLeftPlace(outcome),
      text: {
        zh: '天黑以前，哨旗倒了。陈二倒在旗底下。照书上的规矩，他没有离开自己的位置。',
        en: 'Before dark the company flag went down. Chen Er went down under it. By the book, he never left his place.',
      },
      choices: [],
    },
    {
      id: 'hunriver-fall-left',
      when: (life, outcome) => chapLeftPlace(outcome),
      text: {
        zh: '天黑以前，哨旗倒了。陈二离开了自己的位置，是去拖一个倒下的人回来。他倒在离旗十几步的地方。这一回，没有人来割他的耳朵。',
        en: 'Before dark the company flag went down. Chen Er had left his place, to drag a fallen man back in. He went down a dozen paces from the flag. This time nobody came for his ear.',
      },
      choices: [],
    },
    {
      id: 'hunriver-liaoyang',
      when: (life) => chapFamily(life, 'wife'),
      text: {
        zh: '六天以后，后金兵到了辽阳城下。又过了两天，城破，经略袁应泰佩着剑和印自缢。孙氏和两个孩子住在辽阳城外。后来的事，没有记载。',
        en: 'Six days later the Jin stood under the walls of Liaoyang. Two days after that the city fell, and the Military Superintendent Yuan Yingtai hanged himself wearing his sword and his seal. Mrs Sun and the two children lived outside Liaoyang. What became of them, no record says.',
      },
      choices: [],
    },
    {
      id: 'hunriver-alone',
      when: (life) => !chapFamily(life, 'wife'),
      text: {
        zh: '六天以后，后金兵到了辽阳城下。又过了两天，城破，经略袁应泰佩着剑和印自缢。辽阳城里，没有一个人在等陈二回去。',
        en: 'Six days later the Jin stood under the walls of Liaoyang. Two days after that the city fell, and the Military Superintendent Yuan Yingtai hanged himself wearing his sword and his seal. In Liaoyang nobody was waiting for Chen Er to come back.',
      },
      choices: [],
    },
  ],
  scenes: [
    {
      id: 'hunriver-last', at: 'after',
      script: [
        { who: 'narrator', line: { zh: '浑河南岸，高粱秸的栅栏烧着了。泥糊的那一面，还没有烧透。', en: 'South of the Hun River the sorghum fence was burning. The side plastered with mud had not burned through yet.' } },
        { who: 'hero', stage: 'kneel', line: { zh: '站住。十二个人，站在一起。', en: 'Hold. Twelve men. Stand together.' } },
        { who: 'narrator', line: { zh: '他身边已经没有十二个人了。', en: 'There were no longer twelve men beside him.' } },
        { who: 'hero', stage: 'kneel', line: { zh: '哥。', en: 'Brother.' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于天启元年三月，浑河南岸，年五十三，官至哨官。这一辈子，他在兵册上换过五个营，腰牌换过三块，名字只有一个。人们说，戚家军最后的几千人死在了那一天，他是其中一个。义乌倍磊没有人知道这件事。辽阳城里知道的人，自己也顾不上了。',
      en: 'Chen Er died on the south bank of the Hun River in the third month of 1621, aged fifty-three, a company officer. In his life he was on the rolls of five camps and wore out three waist tags, under one name. The last few thousand of Qi\'s army died that day, people say, and he was one of them. In Beilei, in Yiwu, nobody knew. In Liaoyang those who knew had troubles of their own.',
    },
  },
};
