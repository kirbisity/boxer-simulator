// Chapter 6, 1599-1618: Liaodong, twenty years of garrison. The record: the war's end with Hideyoshi's death (1598);
// the mining and tax eunuchs sent out from 1596 to pay for the palace halls burned in 1596-97, Gao Huai in Liaodong
// docking the soldiers' monthly grain, the Qiantun garrison's mutiny "vowing to eat Gao Huai's flesh" (Wanli 36/4,
// 1608), Jinzhou and Songshan in the sixth month, Gao recalled and his post given to another eunuch (明史 卷305); Li
// Chengliang's second term from 1601, aged 76; the abandonment of the Kuandian country in 1606, 64,000-odd households
// driven inside by the army, "the dead lay everywhere", Li and the governors rewarded for "bringing back runaways";
// "passing off defeats as victories, killing honest people for heads" (明史 卷238); Fushun's fall and Li Yongfang's
// surrender in 1618 (Nurhaci's Seven Grievances). The fort fight that is this chapter's battle is Chen Er's own, kept
// vague: the summer of 1618 on the border. Marriage, children, the price of a post are his private life, kept to what
// the place allowed. Sources in src/story/text/sources.md.
import { chapAlive, chapBelow, chapFallenCard, chapFamily, chapFlag, chapHeroUp, chapJudgementCard, chapLivedCard, chapPromotionCards } from './kit.js';

export const CHAPTER_LIAODONG = {
  id: 'liaodong', n: 6, year: 1618,
  title: { zh: '辽东', en: 'Liaodong' },
  battle: 'liaodong',
  before: [
    {
      id: 'liaodong-posted',
      text: {
        zh: '万历二十六年，丰臣秀吉死了，日本兵撤回海那边。大明说，这又是一场大捷。仗打完了，南兵又成了多余的人：有的裁回浙江，有的拨到北边各镇去补空额。陈二拨到了辽东。',
        en: 'In 1598 Toyotomi Hideyoshi died and the Japanese went home across the sea. The Ming called it another great victory. With the war over the southern men were surplus again: some disbanded home to Zhejiang, some sent to fill the empty places on the rolls of the northern garrisons. Chen Er was sent to Liaodong.',
      },
      choices: [],
    },
    {
      id: 'liaodong-ma',
      text: {
        zh: '同堡的马得胜是辽阳本地的军户，祖上从洪武年间就在这里当兵。当到他这一辈，屯田早成了千户老爷家的田，兵还是他家的兵。他看南蛮子不顺眼，看了三年，看顺了。',
        en: 'Ma Desheng, in the same fort, was a Liaoyang man of a hereditary military household, a junhu (军户): his forebears had soldiered here since the Hongwu reign. By his generation the family\'s colony land had long since become the land of the battalion commander\'s family, but the soldiering was still theirs. He did not care for southerners. It took him three years to get used to one.',
      },
      choices: [],
    },
    {
      id: 'liaodong-eunuch',
      text: {
        zh: '辽东来了一位税监，尚膳监的太监高淮，奉旨开矿收税。矿没开出什么，税收得倒很顺手，连兵的月粮也扣下一份。宫里的大殿烧了要重修，万岁爷缺钱，缺到了辽东大兵的饭碗里。',
        en: 'A tax commissioner came to Liaodong: the eunuch Gao Huai, of the imperial kitchens, sent to open mines and collect taxes. He found few mines and no difficulty collecting, down to a cut of the soldiers\' monthly grain. The great halls of the palace had burned and wanted rebuilding; the emperor was short of money, and the shortfall reached all the way into the rice bowls of Liaodong.',
      },
      choices: [
        { text: { zh: '给高公公的人塞钱，领足了米。', en: 'Slip Eunuch Gao\'s man a fee and draw your full rice.' }, effects: { flags: { paidEunuch: true } } },
        { text: { zh: '饿着，把扣了几回记下来。', en: 'Go hungry, and keep count of how often they dock it.' }, effects: { flags: { keptCount: true } } },
      ],
    },
    {
      id: 'liaodong-post',
      // (Any man below a company officer may buy it, whatever he was: the price decides, not the ladder.)
      when: (life) => chapBelow(life, 'shaoguan'),
      text: {
        zh: '营里空出一个哨官的缺。价钱营里人人知道，只有兵部不知道。',
        en: 'A company officer\'s post fell vacant. Everyone in the camp knew the price. Only the Ministry of War did not.',
      },
      choices: [
        { text: { zh: '拿出全部积蓄，买下这个缺。', en: 'Pay your savings for the post.' }, effects: { rank: 'shaoguan', promoted: 'bought', flags: { boughtRank: true } } },
        { text: { zh: '不买。', en: 'Don\'t.' }, effects: { flags: { refusedToBuy: true } } },
      ],
    },
    {
      id: 'liaodong-ye',
      when: (life) => chapAlive(life, 'ye'),
      text: {
        zh: '叶春生升了哨官。他没有买缺，也没有立什么战功：上头报功的文书，十份里有七份是他写的。他说：二哥，砍一百颗头，不如写好一个“捷”字。',
        en: 'Ye Chunsheng was made a company officer. He had bought no post and done nothing much in battle: seven in ten of the reports of merit that went up the chain were in his hand. A hundred heads, Er, he said, are worth less than one well-written character for "victory".',
      },
      choices: [],
    },
    {
      id: 'liaodong-kuandian',
      text: {
        zh: '万历三十四年，总兵李成梁说宽甸一带孤悬难守，跟督抚一道奏请弃地，把那里的百姓全迁回内地。那时已经住了六万四千多户。百姓恋家，不肯走，就用大军驱赶，死的人倒了一路。事后李成梁这些人以“招复逃人”的功劳，加官受赏。陈二的营，也在赶人的队伍里。',
        en: 'In 1606 the regional commander Li Chengliang declared the Kuandian country, out beyond the forts, too exposed to hold, and with the governors he asked leave to abandon it and move everyone back inside. Sixty-four thousand households lived there by then. People clung to their homes and would not go, so the army drove them, and the dead lay all along the road. Afterwards Li Chengliang and the others were promoted and rewarded, for "bringing back runaway subjects". Chen Er\'s company was among the drivers.',
      },
      choices: [
        { text: { zh: '照令赶人。', en: 'Drive them, as ordered.' }, effects: { flags: { drove: true } } },
        { text: { zh: '让一户人家的老汉坐你押的车。', en: 'Let an old man of one family ride on the cart you are guarding.' }, effects: { flags: { drove: true, helpedOldMan: true } } },
      ],
    },
    {
      id: 'liaodong-match',
      when: (life) => chapAlive(life, 'ma'),
      text: {
        zh: '万历三十五年，马得胜给他说了一门亲：宽甸迁来的孙家姑娘，爹娘死在搬迁的路上，跟着舅舅在辽阳城外种地。马得胜说：南蛮子，你都快四十了，再不娶，死了连个烧纸的都没有。',
        en: 'In 1607 Ma Desheng found him a match: the Sun girl from Kuandian, whose parents had died on the road when the settlers were driven in, now farming outside Liaoyang with her uncle. You\'re nearly forty, southerner, said Ma. Marry now, or there\'ll be no one to burn paper for you when you die.',
      },
      choices: [
        { text: { zh: '娶。', en: 'Marry her.' }, effects: { family: { wife: true }, flags: { married: true } } },
        { text: { zh: '不娶。当兵的人娶了亲，是害了人家。', en: 'Don\'t. A soldier who marries does the woman no favours.' }, effects: { flags: { single: true } } },
      ],
    },
    {
      id: 'liaodong-match-noma',
      when: (life) => !chapAlive(life, 'ma'),
      text: {
        zh: '万历三十五年，堡里的媒婆给他说了一门亲：宽甸迁来的孙家姑娘，爹娘死在搬迁的路上，跟着舅舅在辽阳城外种地。',
        en: 'In 1607 the fort\'s matchmaker found him a match: the Sun girl from Kuandian, whose parents had died on the road when the settlers were driven in, now farming outside Liaoyang with her uncle.',
      },
      choices: [
        { text: { zh: '娶。', en: 'Marry her.' }, effects: { family: { wife: true }, flags: { married: true } } },
        { text: { zh: '不娶。当兵的人娶了亲，是害了人家。', en: 'Don\'t. A soldier who marries does the woman no favours.' }, effects: { flags: { single: true } } },
      ],
    },
    {
      id: 'liaodong-cart',
      when: (life) => chapFlag(life, 'married') && chapFlag(life, 'helpedOldMan'),
      text: {
        zh: '成亲那天他才知道，孙家的舅舅，就是宽甸路上坐过他押的车的那个老汉。老汉说：车上坐不下她爹娘。',
        en: 'Only on the wedding day did he learn that the Sun girl\'s uncle was the old man who had ridden on his cart on the Kuandian road. There was no room on that cart for her father and mother, the old man said.',
      },
      choices: [],
    },
    {
      id: 'liaodong-children',
      when: (life) => chapFlag(life, 'married'),
      text: {
        zh: '万历三十六年，儿子生了，取名辽生。三十九年又添了个女儿，小名阿禾——他想起了义乌的稻子。他驻在边堡上，一年回辽阳两三趟。女儿头一回见他，躲到娘身后，问：这个人是谁？',
        en: 'In 1608 a son was born, and they named him Liaosheng, "born in Liao". In 1611 a daughter, whom they called Ahe, little rice-stalk: he was thinking of the paddies at home. He was posted out at the border forts and got back to Liaoyang two or three times a year. The first time his daughter saw him she hid behind her mother and asked: who is that man?',
      },
      choices: [
        { text: { zh: '把她抱起来。', en: 'Pick her up.' }, effects: { family: { son: true, daughter: true } } },
        { text: { zh: '蹲下来，等她自己过来。', en: 'Crouch down, and wait for her to come to you.' }, effects: { family: { son: true, daughter: true }, flags: { waitedForAhe: true } } },
      ],
    },
    {
      id: 'liaodong-qiantun',
      text: {
        zh: '万历三十六年四月，前屯卫的兵披甲鼓噪，发誓要吃高淮的肉。六月，锦州、松山的兵也变了。高淮逃进关里，反咬地方官“逐杀钦使”。朝廷把他召了回去，换另一位税监兼管辽东。辽东的兵听说了，说：换汤不换药。',
        en: 'In the fourth month of 1608 the soldiers of the Qiantun garrison put on their armour, raised a clamour, and swore to eat Gao Huai\'s flesh. In the sixth month Jinzhou and Songshan mutinied too. Gao Huai fled inside the Wall and accused the local officials of "driving out and trying to murder the emperor\'s envoy". The court recalled him, and gave Liaodong to another tax eunuch to run alongside his own. When the Liaodong soldiers heard, they said: a new bowl, the same soup.',
      },
      choices: [],
    },
    {
      id: 'liaodong-heads',
      text: {
        zh: '堡外抓到几个挖参的，有汉人，也有女真人。千总说，上头要首级，过年以前得报一回功。后来的《明史》这样写辽东的将官：“掩败为功，杀良民冒级。”那时候还没有《明史》，只有千总。',
        en: 'Outside the fort the patrol caught a few ginseng diggers, some Han, some Jurchen. The battalion officer said the people upstairs wanted heads: there had to be one report of merit before New Year. "They passed off defeats as victories, and killed honest people to claim their heads", the Ming History would later write of Liaodong\'s commanders. At the time there was no Ming History. There was the battalion officer.',
      },
      choices: [
        { text: { zh: '照做。', en: 'Do it.' }, effects: { flags: { killedForHeads: true } } },
        { text: { zh: '放他们走，回来报说跑了。', en: 'Let them go, and report that they got away.' }, effects: { flags: { letDiggersGo: true }, place: 'front' } },
      ],
    },
    {
      id: 'liaodong-letter',
      when: (life) => chapFlag(life, 'keptLetter') && !chapFlag(life, 'letterRead'),
      text: {
        zh: '辽阳城隍庙前有个代写书信的先生，两文钱一封，跟叶春生当年一个价。陈二把哥哥的信递过去。先生凑着太阳看了半天，念给他听。信上写了什么，陈二谁也没告诉。',
        en: 'In front of the city god\'s temple in Liaoyang there was a letter writer, two coppers a letter, the same as Ye Chunsheng used to charge. Chen Er handed over his brother\'s letter. The man held it up to the sun for a long time, then read it to him. What it said, Chen Er told no one.',
      },
      choices: [
        { text: { zh: '把信收回腰牌的绳结里。', en: 'Put the letter back in the cord of your waist tag.' }, effects: { flags: { letterRead: true } } },
      ],
    },
    {
      id: 'liaodong-fushun',
      text: {
        zh: '万历四十六年四月，努尔哈赤以“七大恨”告天，攻下了抚顺。守将李永芳投降，后来娶了努尔哈赤的孙女。辽东几十年没打过大仗的兵，一夜之间都成了前线。',
        en: 'In the fourth month of 1618 Nurhaci proclaimed his Seven Grievances to Heaven and took Fushun. Its commander Li Yongfang surrendered, and later married Nurhaci\'s granddaughter. Soldiers in Liaodong who had not fought a real war in decades were the front line overnight.',
      },
      choices: [
        { text: { zh: '去堡墙上你的位置。', en: 'Go to your place on the fort wall.' }, effects: { place: 'front' } },
        { text: { zh: '先托人往辽阳捎个信。', en: 'First get word to Liaoyang, by anyone going.' }, effects: { place: 'second', flags: { sentWord: true } } },
      ],
    },
  ],
  after: [
    {
      id: 'liaodong-fort',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '边堡守住了，或者说，后金的骑兵自己走了。报上去，又是一场大捷。那年七月，清河也丢了。',
        en: 'The fort held; or the Jin horsemen rode off of their own accord. It went up the chain as another great victory. In the seventh month Qinghe fell too.',
      },
      choices: [],
    },
    {
      id: 'liaodong-pay',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '辽东的饷欠了好几个月。户部说没钱。内库是有钱的，内库是皇上的。',
        en: 'Liaodong\'s pay was months in arrears. The Ministry of Revenue said there was no money. There was money in the Inner Treasury. The Inner Treasury was the emperor\'s.',
      },
      choices: [],
    },
    chapFallenCard('liaodong', 'ma', {
      zh: '马得胜死在堡墙下。他家从洪武年间就在辽东当兵，到他这一辈，当完了。千户老爷家的田，还是千户老爷家的。',
      en: 'Ma Desheng died below the fort wall. His family had soldiered in Liaodong since the Hongwu reign, and with him the soldiering was done. The battalion commander\'s family still had the land.',
    }),
    chapFallenCard('liaodong', 'lou', {
      zh: '楼大有死了，死在离义乌几千里的地方。狼筅烧火正好，后来营里的伙夫拿它煮了一锅粥。',
      en: 'Lou Dayou died, thousands of li from Yiwu. A wolf-brush makes good kindling: the camp cook boiled a pot of gruel on it afterwards.',
    }),
    chapFallenCard('liaodong', 'ye', {
      zh: '叶春生死了。哨官本不该站在墙头上，那天他是去看清楚，好写报功的文书。',
      en: 'Ye Chunsheng died. A company officer had no business on the wall top. He had gone up to see clearly, so as to write the report of merit.',
    }),
    chapFallenCard('liaodong', 'he', {
      zh: '何二狗死了。这一回没有人割他的头去报功：后金的人不论头，论的是人口和牲口。',
      en: 'He Ergou died. Nobody cut off his head for merit this time: the Jin did not count heads. They counted captives and livestock.',
    }),
    chapFallenCard('liaodong', 'zhu', {
      zh: '朱应龙死在边堡外。金华那位举人老爷，大概还收着他家的田租。',
      en: 'Zhu Yinglong died outside the fort. The provincial graduate back in Jinhua was presumably still collecting rent on his family\'s land.',
    }),
    chapFallenCard('liaodong', 'wang', {
      zh: '王老七死了，七十七岁，死在边堡上。兵册上他好些年都是四十岁：册子上的岁数，是领得到饷的岁数。',
      en: 'Wang Laoqi died on the fort, seventy-seven years old. On the roll he had been forty for years: the age on the roll was the age that drew pay.',
    }),
    chapLivedCard('liaodong', 'ye', {
      zh: '叶春生升了守备。这一仗的报功文书是他写的，写得很好，他自己的名字在第三行。',
      en: 'Ye Chunsheng was made a fort commandant. He wrote the report of this fight, and wrote it well. His own name was on the third line.',
    }),
    {
      id: 'liaodong-home',
      when: (life, outcome) => chapHeroUp(outcome) && chapFamily(life, 'son'),
      text: {
        zh: '开战以前，营里放了三天假。从边堡到辽阳，骑马一天，走路两天。',
        en: 'Before the campaign the camp gave three days\' leave. From the fort to Liaoyang was a day on horseback, two on foot.',
      },
      choices: [
        { text: { zh: '走回去，住一夜。', en: 'Walk home, and stay one night.' }, effects: { flags: { sawChildren: true } } },
        { text: { zh: '不回了，托人把这个月的饷捎回去。', en: 'Don\'t go. Send this month\'s pay home by someone else.' }, effects: { flags: { sentPay: true } } },
      ],
    },
    chapJudgementCard('liaodong',
      { zh: '守堡的时候，他离开了自己在墙上的位置。', en: 'In the defence of the fort he had left his place on the wall.' },
      {
        zh: '千总要拿他报一个“临阵退缩”，好显得自己治军严。后来一想，报上去，堡里少一个能打的南兵，自己还得写一份文书。打了三十军棍了事。',
        en: 'The battalion officer meant to report him for "falling back in battle", to look strict. Then he thought it over: report it, and the fort would be one fighting southerner short, and he would have to write a report himself. Thirty strokes, and done.',
      },
      [
        { text: { zh: '挨着。', en: 'Take them.' }, effects: { flags: { flogged: true } } },
      ]),
    // Merit: the fort's heads went up as a victory, and the posts of Liaodong's dead wanted filling.
    ...chapPromotionCards('liaodong', 6, {
      merit: (rank) => ({
        zh: `边堡那一仗报上去的首级，监军的文官验过，一颗不少，也一颗不多。陈二当了${rank.name.zh}，管${rank.leads.zh}。辽东的缺向来是要花钱的；这一回没有人来收钱。营里的人说，是因为这几年辽东死的人太多，缺比钱多。`,
        en: `The heads from the fort went up the chain, and the civil official who checked merit passed them: not one fewer, not one more. Chen Er was made ${rank.name.en}, over ${rank.leads.en}. A post in Liaodong had always cost money. This time nobody came to collect. Men in the camp said it was because so many had died in Liaodong those years that there were more posts than silver.`,
      }),
    }),
  ],
  scenes: [
    {
      // The first time she saw him (the card 'liaodong-children': she was born in 1611), staged in the Suns' yard (scenes/sets.js).
      id: 'liaodong-homecoming', at: 'after', set: 'yard', year: 1614,
      when: (life, outcome) => chapHeroUp(outcome) && chapFamily(life, 'daughter'),
      script: [
        { who: 'narrator', line: { zh: '辽阳城外，孙家的院子里晒着高粱。', en: 'Outside Liaoyang, sorghum was drying in the Suns\' yard.' } },
        { who: 'daughter', line: { zh: '娘，这个人是谁？', en: 'Mother, who is that man?' } },
        { who: 'wife', line: { zh: '是你爹。', en: 'That\'s your father.' } },
        { who: 'hero', stage: 'crouch', line: { zh: '阿禾，过来。', en: 'Ahe. Come here.' } },
        { who: 'narrator', when: (life) => chapFlag(life, 'waitedForAhe'), stage: 'approach:daughter', line: { zh: '她没有过来。他就那么蹲着，蹲到她过来为止。', en: 'She did not come. So he stayed crouched there until she did.' } },
        { who: 'narrator', when: (life) => !chapFlag(life, 'waitedForAhe'), stage: 'approach:hero:daughter', line: { zh: '她没有过来，躲回了娘身后。他站起来，去把她抱了起来。她哭了。', en: 'She did not come. She went back behind her mother. He stood up, and went and picked her up, and she cried.' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于万历四十六年，辽东一座边堡外，年五十。抚恤的银子报到了营里，营里说，要等饷到了一起发。辽东的饷，那一年没有到。',
      en: 'Chen Er died outside a border fort in Liaodong in 1618, aged fifty. His death money was claimed at the camp, and the camp said it would be paid along with the arrears. Liaodong\'s arrears did not come that year.',
    },
  },
};
