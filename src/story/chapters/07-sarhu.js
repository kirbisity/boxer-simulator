// Chapter 7, 1619: Sarhu, Liu Ting's eastern road. The record: Yang Hao, the Ulsan commissioner, as Military
// Superintendent of Liaodong; the oath on the Liaoyang drill ground with the Fushun deserter Bai Yunlong beheaded as a
// sacrifice to the flag; four roads, "470,000" claimed (90,000-120,000 in fact), to meet at Hetu Ala on the second day
// of the third month; heavy snow and the date leaked; Liu Ting, at odds with Yang since Korea, given the weakest road
// out of Kuandian with some ten thousand southern men (Sichuan, Huguang, Zhejiang, Fujian) and Gang Hong-rip's 13,000
// Koreans, asking for 30,000 Sichuan troops and granted 5,000; three hundred li into the mountains; Du Song and Ma Lin
// destroyed first; the false messenger from "Du Song"; Yang's recall never reaching Liu; Abdali ridge, Hong Taiji from
// the hilltop, Liu killed (3/4-5); some 3,000 Zhejiang men dead; Gang's surrender; Qiao Yiqi's suicide; the supervisor
// Kang Yingqian "escaping with his life alone"; 310-odd officers and 45,800-odd soldiers dead; Yang jailed, executed in
// 1629 (明史 卷259; zh.wikipedia 萨尔浒之战). The muster's empty names (空额) are the period's commonplace, told as his.
import { chapFallenCard, chapFamily, chapHeroUp, chapJudgementCard, chapLivedCard, chapPromotionCards } from './kit.js';

export const CHAPTER_SARHU = {
  id: 'sarhu', n: 7, year: 1619,
  title: { zh: '萨尔浒', en: 'Sarhu' },
  battle: 'sarhu',
  before: [
    {
      id: 'sarhu-yanghao',
      text: {
        zh: '来辽东当经略的，是杨镐——就是蔚山城下“狼狈先奔”的那一位。二十年过去，他的奏疏还是写得很好。',
        en: 'The Military Superintendent sent to Liaodong was Yang Hao: the very man who had "fled first in disarray" under Ulsan. Twenty years on, his memorials were as well written as ever.',
      },
      choices: [],
    },
    {
      id: 'sarhu-oath',
      text: {
        zh: '辽阳教场誓师，斩了抚顺的逃将白云龙祭旗。四路大军分道出塞，号称四十七万，约定三月初二会师赫图阿拉城下。实数大约十万上下。四十七万，是写给努尔哈赤看的，也是写给北京看的。',
        en: 'At the oath on the Liaoyang drill ground the Fushun deserter Bai Yunlong was beheaded as a sacrifice to the flag. Four armies would march out by four roads, "four hundred and seventy thousand strong", to meet before Hetu Ala, Nurhaci\'s seat, on the second day of the third month. The true number was nearer a hundred thousand. The four hundred and seventy thousand was written for Nurhaci to read, and for Beijing.',
      },
      choices: [],
    },
    {
      id: 'sarhu-liuting',
      text: {
        zh: '东路给了刘綎。刘大刀的刀有一百二十斤——说书的这么说。他在朝鲜就跟杨镐结了怨，这回分到的是最弱的一路：从宽甸出发，南兵一万出头，川、湖、浙、闽的都有，外加姜弘立的一万三千朝鲜兵。他要三万川兵，兵部准了五千。',
        en: 'The eastern road went to Liu Ting, "Liu the Big Blade", whose sword weighed a hundred and twenty jin if you believed the storytellers. He had fallen out with Yang Hao in Korea, and this time he got the weakest of the four roads: out from Kuandian, with ten thousand-odd southern men, from Sichuan, Huguang, Zhejiang and Fujian, and Gang Hong-rip\'s thirteen thousand Koreans. He asked for thirty thousand Sichuan troops. The Ministry granted five thousand.',
      },
      choices: [],
    },
    {
      id: 'sarhu-muster',
      text: {
        zh: '出塞以前，监军的文官来点名。陈二这一哨，册上一百个名字，站着的不到六十。那四十个名字的饷，每个月照领，领到了谁手里，册子上没写。文官说：大雪封山，师期是经略定的，北京等着捷报。谁敢误了师期——教场上祭旗的那根竿子，还空着。',
        en: 'Before the march the civil official supervising the army came to call the roll. Chen Er\'s company: a hundred names on the register, fewer than sixty men standing. The pay for the forty names was drawn every month; into whose hands, the register did not say. The official said: the snow is closing the passes, the Superintendent has set the date, Beijing is waiting for a victory. Anyone who makes us miss the date: the pole on the drill ground where the sacrifice hung is empty again.',
      },
      choices: [
        {
          text: { zh: '站出来说：雪这么大，日子是在北京定的，这样走是送死。', en: 'Step out and say it: in this snow, with a date set in Beijing, this march is death.' },
          effects: { flags: { spokeOut: true } },
          fatal: {
            how: 'executed',
            scene: 'sarhu-pole-self',
            text: {
              zh: '文官没有发火。他问了他的名字，记下来，叫人把他押回辽阳，绑在白云龙挂过的那根竿子底下。经略的令旗一挥，陈二成了第二个祭旗的人。罪名是“沮挠军心”。四路大军照期出塞，几天之内死了四万五千八百多人。他说的话，一个字也没有错。',
              en: 'The official did not raise his voice. He asked his name, wrote it down, and had him taken back to Liaoyang and tied at the foot of the pole where Bai Yunlong had hung. The Superintendent\'s flag dipped, and Chen Er was the second sacrifice to it. The charge was "undermining the army\'s resolve". The four armies marched on the day appointed, and within days forty-five thousand eight hundred of them were dead. Not one word he had said was wrong.',
            },
          },
        },
        {
          text: { zh: '念到死人的名字，替他们喊“到”。', en: 'When the dead men\'s names are called, call out "Here!" for them.' },
          effects: { flags: { answeredForDead: true } },
        },
        {
          text: { zh: '只答自己的名字。死人的名字，让它空着。', en: 'Answer to your own name only. Let the dead men\'s names hang.' },
          effects: { flags: { silentForDead: true } },
        },
      ],
    },
    {
      id: 'sarhu-silent',
      when: (life) => Boolean(life?.flags?.silentForDead),
      text: {
        zh: '没人答应的名字，书办自己替他们答了，答得很快，像是答惯了的。',
        en: 'The names nobody answered, the clerk answered for himself, quickly, like a man who had done it often.',
      },
      choices: [],
    },
    {
      id: 'sarhu-march',
      text: {
        zh: '刘綎的兵冒着大雪往深山里走，走了三百里。路上来了杜松的信使，说西路已经到了赫图阿拉，催东路快走。信是假的，送信的是努尔哈赤的人。真的是：西路杜松几天前就全军覆没了，北路马林也败了。经略的撤兵令，没有送到刘綎手里。',
        en: 'Liu Ting\'s men marched into the mountains through heavy snow, three hundred li deep. On the way a messenger came from Du Song: the western army had reached Hetu Ala, and the eastern was to hurry. The letter was false. The messenger was Nurhaci\'s man. What was true: Du Song\'s western army had been wiped out days before, and Ma Lin\'s northern army had broken too. The Superintendent\'s order to pull back never reached Liu Ting.',
      },
      choices: [
        { text: { zh: '让你的人拉开距离，别挤成一团。', en: 'Keep your men spaced out. Don\'t let them bunch.' }, effects: { place: 'second' } },
        { text: { zh: '跟上刘总兵的旗。', en: 'Keep up with General Liu\'s flag.' }, effects: { place: 'front' } },
      ],
    },
  ],
  after: [
    {
      id: 'sarhu-abdali',
      text: {
        zh: '阿布达里冈。皇太极占了山顶，从上往下冲。刘綎力战而死。东路里的浙兵，据说死了三千。',
        en: 'Abdali ridge. Hong Taiji took the hilltop and came down on them. Liu Ting fought, and died. Of the Zhejiang men on the eastern road, three thousand are said to have died.',
      },
      choices: [],
    },
    {
      id: 'sarhu-officials',
      text: {
        zh: '姜弘立带着朝鲜兵投降了。游击乔一琦留下遗书，投崖而死。监军康应乾“仅以身免”。文官跑得最快，这一点，萨尔浒跟蔚山是一样的。',
        en: 'Gang Hong-rip surrendered with the Koreans. Guerrilla Commander Qiao Yiqi left a letter and threw himself off a cliff. The army supervisor Kang Yingqian "escaped with his life alone". The civil officials ran fastest: in this, Sarhu and Ulsan were the same.',
      },
      choices: [],
    },
    {
      id: 'sarhu-tally',
      text: {
        zh: '四路兵马，文武将吏死了三百一十多人，军士四万五千八百多人。杨镐下狱，论死。他在牢里又活了十年，崇祯二年才伏法。那四万多人，没有一个多活一天。',
        en: 'Of the four armies, three hundred and ten-odd officers and officials were dead, and forty-five thousand eight hundred-odd soldiers. Yang Hao went to prison under sentence of death. He lived there another ten years, and was executed only in 1629. Of the forty-five thousand, not one got a day more.',
      },
      // (A rout has no merit: ranks.js, `merit: 'withhold'`.)
      effects: { merit: 'withhold' },
      choices: [],
    },
    {
      id: 'sarhu-walkout',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '陈二走出来了。三月的雪地里，脚印一路往南，有几行走着走着，就没有了。',
        en: 'Chen Er walked out. In the snow of the third month a line of footprints ran south, and some of the lines just stopped.',
      },
      choices: [],
    },
    chapFallenCard('sarhu', 'ma', {
      zh: '马得胜死在阿布达里冈。他是辽东人，这一回总算死在了家门口。',
      en: 'Ma Desheng died on Abdali ridge. He was a Liaodong man; this time, at least, he died near home.',
    }),
    chapFallenCard('sarhu', 'lou', {
      zh: '楼大有死在雪里。他缺了两根手指，握不紧枪，可他到最后也没有松手。',
      en: 'Lou Dayou died in the snow. He was two fingers short and could not grip a spear properly. He did not let go of it to the end.',
    }),
    chapFallenCard('sarhu', 'ye', {
      zh: '叶春生死了。东路的捷报没有人写，败报也没有人写——会写的人都死了。',
      en: 'Ye Chunsheng died. Nobody wrote the eastern road\'s victory report, nor its defeat: the men who could write were dead.',
    }),
    chapFallenCard('sarhu', 'he', {
      zh: '何二狗死在阿布达里冈。他这辈子割过的头，自己也数不清了。他自己的头，后金的人没要。',
      en: 'He Ergou died on Abdali ridge. He had lost count of the heads he had cut in his life. The Jin had no use for his.',
    }),
    chapFallenCard('sarhu', 'zhu', {
      zh: '朱应龙死在山上。他当兵是为了有人管饭。出塞的时候，带的是三天的干粮。',
      en: 'Zhu Yinglong died on the ridge. He had soldiered so that someone would feed him. They had marched out with three days\' dry rations.',
    }),
    chapFallenCard('sarhu', 'wang', {
      zh: '王老七死在萨尔浒，七十八岁。《纪效新书》里没有写，七十八岁的兵该站在第几排。',
      en: 'Wang Laoqi died at Sarhu, seventy-eight years old. The drill manual does not say which rank a soldier of seventy-eight should stand in.',
    }),
    chapLivedCard('sarhu', 'zhu', {
      zh: '朱应龙活着出来了。东路的队长差不多死光了，他当了队长。',
      en: 'Zhu Yinglong came out alive. Nearly every squad leader on the eastern road was dead, so he was made one.',
    }),
    {
      id: 'sarhu-children',
      when: (life, outcome) => chapHeroUp(outcome) && chapFamily(life, 'son'),
      text: {
        zh: '回到辽阳，辽生十一岁了，问爹在外头杀了几个鞑子。阿禾八岁，只问爹的手怎么冻成了这样。',
        en: 'Back in Liaoyang, Liaosheng, eleven, asked how many Tatars his father had killed. Ahe, eight, asked only why his hands were frozen like that.',
      },
      choices: [
        { text: { zh: '跟儿子说：一个也没有。', en: 'Tell your son: none.' }, effects: { flags: { toldSonNone: true } } },
        { text: { zh: '跟儿子说：学门手艺，别当兵。', en: 'Tell your son: learn a trade. Don\'t be a soldier.' }, effects: { flags: { toldSonTrade: true } } },
        { text: { zh: '把手伸给阿禾焐。', en: 'Give Ahe your hands to warm.' }, effects: { flags: { aheWarmedHands: true } } },
      ],
    },
    chapJudgementCard('sarhu',
      { zh: '在阿布达里冈，他离开了自己在阵里的位置。', en: 'On Abdali ridge he had left his place in the line.' },
      {
        zh: '可东路已经没有阵了，也没有剩下几个能割耳朵的人。活着回来的，能点上名就算数。',
        en: 'But by then there was no line left on the eastern road, and few left alive to cut ears. A man who came back and answered the roll was counted.',
      },
      [
        { text: { zh: '答到。', en: 'Answer to your name.' }, effects: { flags: { survivedSarhu: true } } },
      ]),
    // The eastern road's leaders dead (Liu Ting, his officers: 310-odd of the four armies'); the gaps filled from those back.
    ...chapPromotionCards('sarhu', 7, {
      vacancy: true,
      vacated: (rank) => ({
        zh: `萨尔浒没有功，只有缺。东路回来的人点完了名，管名册的书办把活人的名字一个一个往上挪，挪到死人空出来的地方。陈二成了${rank.name.zh}，管${rank.leads.zh}。他要管的人，多半还在阿布达里冈上。`,
        en: `Sarhu had no merit, only gaps. When the men back from the eastern road had answered the roll, the clerk who kept it moved the living up one by one into the places of the dead. Chen Er became ${rank.name.en}, over ${rank.leads.en}. Most of the men he was over were still up on Abdali ridge.`,
      }),
    }),
  ],
  scenes: [
    {
      // Played as the oath card is read (scenes/sets.js poleHead): the drill ground, the head on the pole, the ranks.
      id: 'sarhu-pole', at: 'before', after: 'sarhu-oath', set: 'poleHead',
      script: [
        { who: 'narrator', line: { zh: '辽阳教场，二月。竿子上挂着白云龙的头。', en: 'The Liaoyang drill ground, the second month. Bai Yunlong\'s head hung on the pole.' } },
        { who: 'official', stage: 'shot:official', line: { zh: '临阵脱逃者，以此为例。', en: 'Let this be the example for any man who runs.' } },
        { who: 'hero', stage: 'shot:ranks', line: { zh: '他是从抚顺跑回来的。抚顺的守将投了降，娶了人家的孙女。', en: 'He ran back from Fushun. The commander at Fushun surrendered, and married their khan\'s granddaughter.' } },
        { who: 'narrator', stage: 'shot:head', line: { zh: '投降的那个，竿子够不着。', en: 'The one who surrendered, the pole could not reach.' } },
      ],
    },
    // He spoke out at the muster: tied at the foot of the same pole (the fatal choice's scene, before its page).
    {
      id: 'sarhu-pole-self', at: 'fatal', set: 'poleSelf',
      script: [
        { who: 'narrator', line: { zh: '辽阳教场。白云龙挂过的那根竿子底下。', en: 'The Liaoyang drill ground. The foot of the pole where Bai Yunlong had hung.' } },
        { who: 'official', stage: 'dark', line: { zh: '沮挠军心。', en: '"Undermining the army\'s resolve."' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于万历四十七年三月，阿布达里冈，年五十一，是那四万五千八百多人里的一个。他的腰牌后来出现在八旗的一处营地里，被人拿去垫了桌脚。上面的字，那个旗丁不认得。',
      en: 'Chen Er died on Abdali ridge in the third month of 1619, aged fifty-one, one of the forty-five thousand eight hundred. His waist tag turned up later in a banner camp, propping up the leg of a table. The bannerman who put it there could not read what it said.',
    },
  },
};
