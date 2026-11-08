// Chapter 5, 1595-98. Before it, the pay protest at Shimenzhai (石门寨), Jizhou garrison, Wanli 23/10/2-9 (October
// 1595): the southern troops of the Jianchang camp, Wu Weizhong's old men, back from Korea and facing disbandment, demand
// their arrears and the Pyongyang silver; the ringleader Hu Huaide, a 26-year-old Yiwu soldier; the dead counted at
// some 160 by the latest study (Sun Weiguo), several hundred, 1,300 or 3,300 in older accounts; called rebellion by the
// Ministry of War. Then Ulsan, Wanli 25/12 to 26/1 (late January-February 1598): Yang Hao and Ma Gui with some 40,000
// Ming and 10,000 Koreans against Katō Kiyomasa's half-built hill castle at Dosan; Chen Yin's men through two palisades,
// recalled because Yang "did not want Chen Yin's merit set above" Li Rumei's; wind and snow; Yang "fled first in
// disarray", Wu Weizhong and Mao Guoqi holding the rear; the dead "nearly 20,000", reported as "a hundred and some";
// Ding Yingtai's "28 crimes and 10 disgraces"; Yang dismissed (明史 卷259). Sources in src/story/text/sources.md.
import { chapAlive, chapDead, chapFallenCard, chapFlag, chapHeroUp, chapJudgementCard, chapLivedCard, chapPromotionCards } from './kit.js';

export const CHAPTER_ULSAN = {
  id: 'ulsan', n: 5, year: 1598,
  title: { zh: '蔚山', en: 'Ulsan' },
  battle: 'ulsan',
  before: [
    {
      id: 'ulsan-shimenzhai',
      text: {
        zh: '万历二十三年十月，蓟镇石门寨。东征回来的南兵听说朝廷要裁兵：欠的饷一笔勾销，平壤城下许的银子也再不提了。一个叫胡怀德的义乌兵，二十六岁，站到教场上喊：讨饷！很多人跟着他喊。',
        en: 'Shimenzhai, in the Jizhou garrison, the tenth month of 1595. The southern troops back from Korea had heard the court meant to disband them: the arrears wiped off the books, and the silver promised under Pyongyang\'s walls never to be mentioned again. A Yiwu soldier named Hu Huaide, twenty-six years old, stood up on the drill ground and shouted for their pay: taoxiang (讨饷), we want what we are owed. Many shouted with him.',
      },
      choices: [
        {
          text: { zh: '去教场。拿命换的，又不是讨饭。', en: 'Go to the drill ground. We paid for it with our lives. This isn\'t begging.' },
          effects: { flags: { joinedProtest: true } },
          fatal: {
            how: 'executed',
            scene: 'ulsan-drillground-self',
            text: {
              zh: '兵变九天就平了。事后清点，南兵死了一百六十多人；也有人说一千三百，有人说三千三百。数目随说的人变，人是一样地死。陈二的名字在被斩的名单上。胡怀德凌迟。兵部定的罪名是“谋反”。他们讨的那份饷，后来照裁兵的规矩，一并免了。',
              en: 'The mutiny was put down in nine days. By the count afterwards some hundred and sixty southern men were dead; others said thirteen hundred, or three thousand three hundred. The figure changed with the teller; the men died the same. Chen Er\'s name was on the list of the beheaded. Hu Huaide was put to the slow death. The Ministry of War called it rebellion. The pay they had asked for was struck off the books, as the rules for disbanded men allowed.',
            },
          },
        },
        {
          text: { zh: '待在营房里，把门关上。', en: 'Stay in the barracks and shut the door.' },
          effects: { flags: { stayedIn: true } },
        },
        {
          text: { zh: '去教场边上拉人回来。', en: 'Go to the edge of the drill ground and pull men back.' },
          effects: { flags: { pulledMenBack: true } },
        },
      ],
    },
    {
      id: 'ulsan-jin',
      when: (life) => chapAlive(life, 'jin'),
      text: {
        zh: '金阿满去了。陈二拉过他的袖子，他甩开了，说：二哥，我娘在赤岸等着这笔钱买米。第九天，金阿满被绑在教场的旗杆底下，他的名字排在胡怀德后面十几个。临刑前，他朝营房这边看了一眼，什么也没说。',
        en: 'Jin Aman went. Chen Er caught his sleeve and he shook it off: Er, my mother in Chi\'an is waiting on that money for rice. On the ninth day Jin Aman was bound at the foot of the flagpole on the drill ground, his name a dozen or so below Hu Huaide\'s. Before the blade he looked once toward the barracks, and said nothing.',
      },
      choices: [
        { text: { zh: '看着。', en: 'Watch.' }, effects: { flags: { jinExecuted: true, watchedJin: true }, dies: { jin: 'executed' } } },
        { text: { zh: '转过身去。', en: 'Turn away.' }, effects: { flags: { jinExecuted: true }, dies: { jin: 'executed' } } },
      ],
    },
    {
      id: 'ulsan-jin-gone',
      when: (life) => chapDead(life, 'jin') && !chapFlag(life, 'jinExecuted'),
      text: {
        zh: '金阿满要是还活着，一定在教场上。他死在朝鲜了。对大家来说，这样还省事一些。',
        en: 'Had Jin Aman lived, he would have been on that drill ground. He had died in Korea, which saved everyone the trouble.',
      },
      choices: [],
    },
    {
      id: 'ulsan-again',
      text: {
        zh: '万历二十五年，和谈谈崩了，日本兵又来了。朝廷又想起了南兵，又去浙江招人。吴惟忠又带着南兵过了鸭绿江。',
        en: 'In 1597 the talks fell apart and the Japanese came back. The court remembered the southern troops again, and went recruiting in Zhejiang again, and Wu Weizhong crossed the Yalu again at their head.',
      },
      choices: [],
    },
    {
      id: 'ulsan-zhu',
      text: {
        zh: '新兵朱应龙，金华人，使枪。他家的田抵了债，债主是县里的一位举人老爷。他说当兵好，当兵至少有人管饭。陈二说：有人说管。',
        en: 'A new man, Zhu Yinglong of Jinhua, a spearman. His family\'s land had gone to pay a debt to a provincial graduate of the county. Soldiering was better, he said: at least someone feeds you. Somebody says he will, said Chen Er.',
      },
      choices: [],
    },
    {
      id: 'ulsan-siege',
      text: {
        zh: '万历二十五年十二月，经理朝鲜军务杨镐、提督麻贵合兵四万，加上朝鲜兵一万，围了蔚山。加藤清正的岛山城才修了一半，城在山上，炮打不上去。史书上说那几天“风雪裂肤”。',
        en: 'The twelfth month of the twenty-fifth year of Wanli, January 1598. Yang Hao, the imperial commissioner for Korea, and Commander Ma Gui brought forty thousand Ming men and ten thousand Koreans round Ulsan. Katō Kiyomasa\'s castle on the hill at Dosan was half built, and high enough that the guns could not reach it. "Wind and snow split the skin", the history says of those days.',
      },
      choices: [
        { text: { zh: '跟陈寅的兵去拔栅。', en: 'Go with Chen Yin\'s men at the palisades.' }, effects: { place: 'front' } },
        { text: { zh: '守住身后的壕沟。', en: 'Hold the trench behind.' }, effects: { place: 'second' } },
      ],
    },
  ],
  after: [
    {
      id: 'ulsan-recall',
      text: {
        zh: '陈寅的兵已经拔了两道栅，再往前就是城门。杨经理却鸣金收兵：李如梅还没赶到，他不愿意陈寅的功劳压在李家头上。日本兵退进了岛山城。',
        en: 'Chen Yin\'s men had torn down two palisades and the gate was next. Then Commissioner Yang rang the gong for the recall. Li Rumei had not arrived yet, and Yang did not want Chen Yin\'s merit set above a Li\'s. The Japanese got back inside the hill castle.',
      },
      choices: [],
    },
    {
      id: 'ulsan-cold',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '围了十天。城里的人在饿，城外的人在冻。陈二看见一个北兵把冻掉的脚趾头揣进怀里，说要带回家埋。',
        en: 'Ten days of siege. Inside, they starved; outside, they froze. Chen Er watched a northern trooper put a toe that had frozen off inside his coat, to take home and bury.',
      },
      choices: [],
    },
    {
      id: 'ulsan-flight',
      text: {
        zh: '日本援兵从海边来了。杨经理大惧，“狼狈先奔”，各营跟着溃了。副将吴惟忠和游击茅国器断后，南兵一步一步往后退，退得跟书上画的一样齐整。辎重丢了一大半。',
        en: 'Japanese relief came up from the coast. Commissioner Yang, terrified, "fled first in disarray", and the camps broke after him. Brigade General Wu Weizhong and Guerrilla Commander Mao Guoqi held the rear: the southern men stepped back a pace at a time, as tidy as the drawings in the book. Most of the baggage was lost.',
      },
      choices: [],
    },
    {
      id: 'ulsan-report',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '各营报上来的死亡，将近两万。杨经理大怒，压下不报，只说死了一百多人，还跟总督邢玠一道报了捷。兵部主事丁应泰上疏，列了他“当罪者二十八，可羞者十”。杨镐革职回籍。二十年后，朝廷又想起了他。',
        en: 'The camps\' returns of the dead came to nearly twenty thousand. Commissioner Yang flew into a rage, kept them back, and reported a hundred and some; he and the Supreme Commander Xing Jie sent in news of a victory. Ding Yingtai of the Ministry of War memorialised against him: "twenty-eight crimes, ten disgraces". Yang Hao was dismissed and sent home. Twenty years later the court remembered him again.',
      },
      // (A defeat reported as a victory has no true list of merit: ranks.js, `merit: 'withhold'`.)
      effects: { merit: 'withhold' },
      choices: [],
    },
    chapFallenCard('ulsan', 'lou', {
      zh: '楼大有死在岛山城下。他个子大，冻得比别人慢，所以冲在最前头，所以死在最前头。',
      en: 'Lou Dayou died under the hill castle. He was a big man and froze slower than the rest, so he went at the front, so he died at the front.',
    }),
    chapFallenCard('ulsan', 'wang', {
      zh: '王老七死在蔚山。五十七岁了，本该在东阳晒太阳。裁兵的时候没轮到他，招兵的时候倒轮到了。',
      en: 'Wang Laoqi died at Ulsan, fifty-seven years old, when he should have been sitting in the sun in Dongyang. When they disbanded men his turn never came. When they recruited, it did.',
    }),
    chapFallenCard('ulsan', 'ye', {
      zh: '叶春生死在雪地里，怀里揣着一沓没写完的报功文书。文书上的功劳，后来都写在了别人名下。',
      en: 'Ye Chunsheng died in the snow with a sheaf of unfinished reports of merit inside his coat. The merit in them was later written under other men\'s names.',
    }),
    chapFallenCard('ulsan', 'he', {
      zh: '何二狗死在撤退的路上。他背着一口袋头，跑不快。那袋头是北兵的，他只有三成。',
      en: 'He Ergou died on the retreat. He was carrying a sack of heads and could not run. They were the northern troopers\' heads; his share was three in ten.',
    }),
    chapFallenCard('ulsan', 'zhu', {
      zh: '朱应龙死在蔚山。他说当兵至少有人管饭。围城的十天里，没有人管饭。',
      en: 'Zhu Yinglong died at Ulsan. At least someone feeds you, he had said. For the ten days of the siege, nobody did.',
    }),
    chapLivedCard('ulsan', 'lou', {
      zh: '楼大有活下来了，冻掉了两根手指。哨官让他当了队长，因为别的队长都死了。',
      en: 'Lou Dayou lived, and lost two fingers to the cold. The company officer made him a squad leader, because the other squad leaders were dead.',
    }),
    {
      id: 'ulsan-letter',
      when: (life, outcome) => chapAlive(life, 'ye', outcome) && chapFlag(life, 'keptLetter') && chapHeroUp(outcome),
      text: {
        zh: '撤下来的那天夜里，雪停了。叶春生向他要了那封信，凑着火，一个字一个字地看，看完了，念给他听。信上写了什么，陈二谁也没告诉。',
        en: 'The night after the retreat the snow stopped. Ye Chunsheng asked him for the letter, held it to the fire and went through it word by word, and when he had it, read it to him. What it said, Chen Er told no one.',
      },
      choices: [
        { text: { zh: '把信收回腰牌的绳结里。', en: 'Put the letter back in the cord of your waist tag.' }, effects: { flags: { letterRead: true } } },
      ],
    },
    chapJudgementCard('ulsan',
      { zh: '撤退的时候，他离开了自己在阵里的位置。', en: 'In the retreat he had left his place in the line.' },
      {
        zh: '可那天先跑的是杨经理，各营跟着他跑。要按军法，第一个该割耳朵的人坐在轿子里。没有人提这件事。陈二挨了二十军棍，算是给后来的人看。',
        en: 'But the first to run that day had been Commissioner Yang, and the camps had run after him. By the law, the first ear to be cut was riding in a sedan chair. Nobody raised it. Chen Er got twenty strokes, as an example to the rest.',
      },
      [
        { text: { zh: '挨着。', en: 'Take them.' }, effects: { flags: { flogged: true } } },
      ]),
    // The dead "nearly 20,000": the posts of the dead filled from the living who held (as Lou Dayou's, above).
    ...chapPromotionCards('ulsan', 5, {
      vacancy: true,
      vacated: (rank) => ({
        zh: `撤下来点名，营里一半的旗没有人扛。哨官拿着名册一个一个往下补：谁还站着，谁就往上挪一格。陈二当了${rank.name.zh}，管${rank.leads.zh}。捷报上写的是大捷；补缺的名册上，写的是实话。`,
        en: `At the roll after the retreat, half the camp\'s flags had nobody left to carry them. The company officer went down the roll filling the gaps: whoever was still standing moved up one. Chen Er was made ${rank.name.en}, over ${rank.leads.en}. The report said victory. The roll of posts to fill told the truth.`,
      }),
    }),
  ],
  scenes: [
    // The ninth day on the drill ground (the card before it: Jin Aman bound at the flagpole, watched or turned from). Staged on
    // its own set (scenes/sets.js drillGround): the pole, the condemned on their knees, Jin among them, him by the barracks;
    // facing it if he chose to watch, his back to it if he turned away. The blow is not shown: the dark comes down on it.
    {
      id: 'ulsan-drillground', at: 'before', after: 'ulsan-jin', set: 'drillGround', year: 1595,
      when: (life) => chapFlag(life, 'jinExecuted'),
      adjust: (life) => (chapFlag(life, 'watchedJin') ? {} : { hero: { face: [24, 2.5] } }),
      script: [
        { who: 'narrator', line: { zh: '教场上的旗杆，平日挂的是操练的号旗。', en: 'On ordinary days the flagpole on the drill ground flew the drill signals.' } },
        { who: 'jin', stage: 'shot:jin', line: { zh: '二哥，你别看。', en: 'Don\'t look, Er.' } },
        { who: 'officer', stage: ['dark', 'fall:jin', 'fall:condemned', 'shot:main'], line: { zh: '斩！', en: 'Strike!' } },
        { who: 'narrator', stage: 'lift', line: { zh: '那天的风从关外吹过来，跟平常一样。', en: 'The wind that day came from beyond the Wall, the same as any day.' } },
      ],
    },
    // The same day with no one of his in the row: Jin Aman dead in Korea already (the card 'ulsan-jin-gone').
    {
      id: 'ulsan-drillground-others', at: 'before', after: 'ulsan-jin-gone', set: 'drillGroundOthers', year: 1595,
      adjust: (life) => (chapFlag(life, 'stayedIn') ? { hero: { face: [24, 2.5] } } : {}),
      script: [
        { who: 'narrator', line: { zh: '第九天，教场上跪了一排南兵，都是东征回来的。', en: 'On the ninth day a row of southern men knelt on the drill ground, all of them back from Korea.' } },
        { who: 'officer', stage: ['dark', 'fall:condemned'], line: { zh: '斩！', en: 'Strike!' } },
        { who: 'narrator', stage: 'lift', line: { zh: '那天的风从关外吹过来，跟平常一样。', en: 'The wind that day came from beyond the Wall, the same as any day.' } },
      ],
    },
    // He went to the drill ground: his own name on the list of the beheaded (the fatal choice's scene, before its page).
    {
      id: 'ulsan-drillground-self', at: 'fatal', set: 'drillGroundSelf', year: 1595,
      script: [
        { who: 'narrator', line: { zh: '第九天。名单念到了陈二。', en: 'The ninth day. The list came to Chen Er.' } },
        { who: 'jin', when: (life) => chapAlive(life, 'jin'), line: { zh: '二哥。', en: 'Er.' } },
        { who: 'officer', stage: 'dark', line: { zh: '斩！', en: 'Strike!' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于万历二十五年十二月，蔚山城下，年二十九。营里报了他阵亡；杨经理那份只死了一百多人的捷报里，没有他。他死在两万人的那一边。',
      en: 'Chen Er died under the walls of Ulsan in the winter of 1597-98, aged twenty-nine. His camp reported him dead. He is not in Commissioner Yang\'s report, where only a hundred and some died. He died on the side with the twenty thousand.',
    },
  },
};
