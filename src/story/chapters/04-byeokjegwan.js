// Chapter 4, 1593: Byeokjegwan, 27 February (Wanli 21/1/27). The record: Li Rusong rode ahead with a few thousand horse
// and was caught by Kobayakawa Takakage's and Tachibana Muneshige's men in the hills; his horse shot, Li Yousheng died
// shielding him, Li Rumei shot down the attacker's horse; Li reported 264 killed, 49 wounded, 276 horses (Japanese
// accounts claim 6,000-10,000); Li blamed the Military Superintendent Song Yingchang; the peace talks that followed,
// each envoy telling his own court the other side had submitted. The foot's part is not recorded: Chen Er's company
// coming up the road is his story, kept vague. Sources in src/story/text/sources.md.
import { chapAlive, chapFallenCard, chapHeroUp, chapJudgementCard, chapLivedCard, chapPassedOverCard } from './kit.js';

export const CHAPTER_BYEOKJEGWAN = {
  id: 'byeokjegwan', n: 4, year: 1593,
  title: { zh: '碧蹄馆', en: 'Byeokjegwan' },
  battle: 'byeokjegwan',
  before: [
    {
      id: 'byeokjegwan-south',
      text: {
        zh: '平壤一下，提督急着南下，要赶在开春以前拿回汉城。正月二十七，听说前头的倭兵不多，他带着几千骑兵先走了。步兵在后头，陷在化冻的泥里。',
        en: 'With Pyongyang taken, the commander was in a hurry to go south and take back Seoul before spring. On the twenty-seventh of the first month, told there were few Japanese ahead, he rode on in front with a few thousand horse. The foot came behind, sunk in the thawing mud.',
      },
      choices: [],
    },
    {
      id: 'byeokjegwan-mud',
      text: {
        zh: '正月的朝鲜，路白天化开，夜里又冻上。南兵的草鞋一天烂一双。军需官说，鞋已经照数发过了——照册子上的数。',
        en: 'In Korea in the first month the road thawed by day and froze again at night. A southern soldier wore out a pair of straw sandals a day. The quartermaster said the sandals had been issued in full: in full according to the roll.',
      },
      choices: [],
    },
    {
      id: 'byeokjegwan-ye',
      when: (life) => chapAlive(life, 'ye'),
      text: {
        zh: '叶春生在平壤替哨官写了一份报功的文书，写得好，哨官升了一级，叶春生当了队长。他说：刀砍的功劳要人看见，笔写的功劳自己就看得见。',
        en: 'At Pyongyang Ye Chunsheng had written up a report of merit for the company officer. It was well written. The officer went up a grade, and Ye was made a squad leader. A blade\'s merit needs someone to see it, he said. A brush\'s merit you can see for yourself.',
      },
      choices: [],
    },
    {
      id: 'byeokjegwan-road',
      text: {
        zh: '前头传下话来：提督在碧蹄馆被围了。步兵加快了脚步，队形拉成了一条线。',
        en: 'Word came back down the road: the commander was surrounded at Byeokjegwan. The foot quickened, and the formation stretched out into a single file.',
      },
      choices: [
        { text: { zh: '跟紧狼筅，队不成队不走。', en: 'Keep to the wolf-brush. A squad that is not a squad does not advance.' }, effects: { place: 'second' } },
        { text: { zh: '跑。提督要是死了，谁也领不到饷。', en: 'Run. If the commander dies, nobody gets paid.' }, effects: { place: 'front', flags: { ranAhead: true } } },
      ],
    },
  ],
  after: [
    {
      id: 'byeokjegwan-lis',
      text: {
        zh: '提督的马中弹倒了，他差一点死在那里。家丁李有声用身子挡在他前头，死了；李如梅一箭射倒了冲上来那人的马。家丁是将军自己掏钱养的人，命也是将军的。这一回，将军用掉了一条。',
        en: 'The commander\'s horse was shot under him and he came within a breath of dying there. His household man Li Yousheng put his body in front of him and died for it; Li Rumei shot down the horse of the man riding at him. A general\'s household men, his jiading (家丁), were fed from the general\'s own purse, and their lives were his too. This time he spent one.',
      },
      choices: [],
    },
    {
      id: 'byeokjegwan-count',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '提督上报：阵亡二百六十四人，伤四十九人，失马二百七十六匹。日本人的记载说明军死了六千到一万。两个数目中间，躺着碧蹄馆的山谷。提督说，败在经略宋应昌粮草不继。宋经略是文官。文官的笔，比提督的刀长。',
        en: 'The commander reported 264 killed, 49 wounded, 276 horses lost. Japanese accounts put the Ming dead at six to ten thousand. Between the two numbers lies the valley of Byeokjegwan. The commander said the fault was the Military Superintendent Song Yingchang\'s, for failing the supplies. Song was a civil official, and a civil official\'s brush reaches further than a general\'s sword.',
      },
      choices: [],
    },
    chapFallenCard('byeokjegwan', 'jin', {
      zh: '金阿满死在碧蹄馆南边的泥里。他跑在最前头，因为他说，提督要是死了，欠的饷就没人认了。',
      en: 'Jin Aman died in the mud south of Byeokjegwan. He had run at the front because, he said, if the commander died there\'d be nobody left to own up to the arrears.',
    }),
    chapFallenCard('byeokjegwan', 'lou', {
      zh: '楼大有死了。狼筅太长，山路太窄，他一个人横在路上，挡了很久。',
      en: 'Lou Dayou died. The wolf-brush was too long and the hill road too narrow, so he stood across the road alone and held it a long time.',
    }),
    chapFallenCard('byeokjegwan', 'wang', {
      zh: '王老七死在碧蹄馆的山谷里。他在台州打过的倭寇，跟这回的不是一回事：这回的有几万人，排着队。',
      en: 'Wang Laoqi died in the valley of Byeokjegwan. The pirates he had fought at Taizhou were nothing like these: these came in tens of thousands, in ranks.',
    }),
    chapFallenCard('byeokjegwan', 'ye', {
      zh: '叶春生死了。他刚当上队长，队旗还是新的。',
      en: 'Ye Chunsheng died. He had only just been made squad leader. The flag was still new.',
    }),
    chapFallenCard('byeokjegwan', 'he', {
      zh: '何二狗死在路边。他到死都在往回看，看北兵会不会回来带他走。北兵没有回来。',
      en: 'He Ergou died by the roadside, still looking back to see if the northern horse would come back for him. They did not.',
    }),
    chapLivedCard('byeokjegwan', 'lou', {
      zh: '楼大有活着回来了，狼筅的枝杈断了一半。他把断下来的枝子一根一根捡起来，说：这是竹子，家里漫山都是，可这几根是从义乌带来的。',
      en: 'Lou Dayou came back alive, half the branches of his wolf-brush broken off. He picked them up one by one. It\'s bamboo, he said; the hills at home are covered in it. But these came all the way from Yiwu.',
    }),
    {
      id: 'byeokjegwan-talks',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '碧蹄馆以后，提督不大想打了。和谈开始，谈了四年。两边的使者各自回去禀报：对面已经求和了。',
        en: 'After Byeokjegwan the commander had little appetite left for fighting. Peace talks began and went on for four years, the envoys on each side reporting to their own masters that the other side had begged for terms.',
      },
      choices: [],
    },
    chapJudgementCard('byeokjegwan',
      { zh: '退下来的时候，他离开了自己在阵里的位置。', en: 'In the falling back he had left his place in the line.' },
      {
        zh: '这一仗输了，输了的仗要有人担。提督担不起，经略不肯担，于是从步兵里拉了几个出来打军棍。陈二是其中一个。',
        en: 'The battle had been lost, and a lost battle needs someone to carry it. The commander could not, and the Superintendent would not, so a few men were pulled out of the foot and given the staff. Chen Er was one of them.',
      },
      [
        { text: { zh: '挨着。', en: 'Take it.' }, effects: { flags: { flogged: true }, place: 'front' } },
      ]),
    // Where his merit has earned a post: someone else gets it, with the merit (冒功). The foot lost no leaders the record
    // counts here (Li's 264 dead were his riders), so no post falls open by a death.
    chapPassedOverCard('byeokjegwan',
      {
        zh: '队里空出一个缺，按功该是陈二的。补上去的是一个参将家丁的表弟，碧蹄馆那天他在后营看马。名册上，那人的名字底下，记着陈二这几仗的功。这叫冒功。营里人人都知道，人人都不说。',
        en: 'A post fell open in the company, and by his merit it was Chen Er\'s. It went to the cousin of some brigade general\'s household man, who had spent the day of Byeokjegwan minding horses in the rear camp. On the roll, under that man\'s name, stood Chen Er\'s merit from his fights. It is called maogong (冒功), passing off another man\'s merit. Everyone in the camp knew. Nobody said.',
      },
      [
        { text: { zh: '不说。', en: 'Say nothing.' }, effects: { flags: { passedOver: true } } },
        { text: { zh: '去找哨官说。哨官说：功劳，下一仗再挣。', en: 'Go to the company officer. The officer says: merit? Earn some more next time.' }, effects: { flags: { passedOver: true, complained: true }, place: 'front' } },
      ]),
    {
      id: 'byeokjegwan-back',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '南兵撤回蓟镇。欠的饷，说是回了关就发。',
        en: 'The southern troops were pulled back to the Jizhou garrison, inside the Wall. The pay they were owed, they were told, would be paid once they were back through the passes.',
      },
      choices: [
        { text: { zh: '把攒下的碎银子缝进棉袄里。', en: 'Sew your bits of silver into the lining of your coat.' }, effects: { flags: { savings: true } } },
        { text: { zh: '买一壶酒，跟队里还活着的人喝了。', en: 'Buy a jug of wine and drink it with whoever in the squad is still alive.' }, effects: { flags: { drankWithSquad: true } } },
        { text: { zh: '托一个回浙江的人，给哥哥烧点纸钱。', en: 'Pay a man going home to Zhejiang to burn paper money for your brother.' }, effects: { flags: { burnedPaper: true } } },
      ],
    },
  ],
  scenes: [],
  ending: {
    text: {
      zh: '陈二死于万历二十一年正月二十七日，碧蹄馆南边的路上，年二十五。提督的阵亡册上只有二百六十四个人。他在不在里头，要看是哪一本册子。',
      en: 'Chen Er died on the twenty-seventh of the first month, 1593, on the road south of Byeokjegwan, aged twenty-five. The commander\'s list of the dead had two hundred and sixty-four names on it. Whether his was one of them depends on whose list you read.',
    },
  },
};
