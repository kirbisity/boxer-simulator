// Chapter 1, 1587: the "bandit" suppression. The user's story, told faithfully: the brother who bought him his place,
// the drought, the refugees, the gentleman's report, the line, the wounded, the body in the mud. The event is private
// (no county named); its frame is the record: the Wanli drought-famine of 1586-88 that spread from the north to the
// Yangtze by the end of 1587, Ming soldiers' waist tags (腰牌, fields as in 武备志 卷28), Qi Jiguang's drill manual and
// his dismissal in 1583 (src/story/text/sources.md).
import { chapAlive, chapFallenCard, chapFlag, chapHeroUp, chapJudgementCard, chapPromotionCards } from './kit.js';

export const CHAPTER_SUPPRESSION = {
  id: 'suppression', n: 1, year: 1587,
  title: { zh: '剿匪', en: 'The Bandits' },
  battle: 'suppression',
  before: [
    {
      id: 'suppression-register',
      text: {
        zh: '万历十四年，哥哥陈大把床脚瓦罐里的铜钱全倒了出来。那是他挑了十年煤的工钱，一文一文数过去，换了弟弟兵册上的一个名字。那就是军籍：有名字，就有口粮，有饷。招兵的把总说，这叫“使费”。哥哥自己没去当兵。他说，叫扁担压弯了的背，穿不上号衣。',
        en: 'In the fourteenth year of Wanli, 1586, his elder brother Chen Da tipped out the clay jar under his bed: ten years of carrying coal, counted coin by coin, to buy his younger brother a name on the army roll. That was his junji (军籍), his place on the register: a name meant rations, and pay. The recruiting officer called the money a "fee". Chen Da did not enlist himself. A back bent by the carrying pole, he said, does not fit a uniform.',
      },
      choices: [],
    },
    {
      id: 'suppression-tag',
      text: {
        zh: '腰牌是一块巴掌大的木牌。正面写着：陈二，年十八，义乌县倍磊人，身长五尺二寸，面黄无须，左眉有痣，能举百斤。背面烙着营里的火印。哥哥不识字，拿在手里翻来覆去地看，说：这上头就是你了。弟弟说：这上头是营里要的那一部分。',
        en: 'The yaopai (腰牌), the waist tag, was a wooden board the size of a palm. On the front: Chen Er, eighteen, of Beilei in Yiwu county, five chi two cun tall, sallow, beardless, a mole over the left brow, can lift a hundred jin. On the back, the camp\'s brand. His brother could not read. He turned it over and over in his hands and said: so that\'s you, then. The younger one said: that\'s the part of me the camp wants.',
      },
      choices: [],
    },
    {
      id: 'suppression-veteran',
      when: (life) => chapAlive(life, 'wang'),
      text: {
        zh: '营里的老兵王老七，东阳人，嘉靖四十年跟戚将军在台州打过倭寇。他背得出《纪效新书》里的军法：临阵退缩的，甲长割他的耳朵；收兵点名，没有耳朵的，斩。新兵问戚将军如今在哪儿。王老七说：罢了官，回登州老家了。新兵问为什么。王老七说：仗打完了。',
        en: 'The camp\'s old hand Wang Laoqi, a Dongyang man, had fought the wokou (倭寇), the sea pirates, at Taizhou under General Qi in 1561. He could recite the military law from Qi\'s drill manual, the Jixiao Xinshu (纪效新书): a man who falls back, his file leader cuts off his ear; at the roll after, a man with no ear is beheaded. The recruits asked where General Qi was now. Dismissed, said Wang Laoqi, gone home to Dengzhou. The recruits asked why. The war was over, said Wang Laoqi.',
      },
      choices: [],
    },
    {
      id: 'suppression-drought',
      text: {
        zh: '万历十五年，北方大旱，到了年底，饥荒顺着运河一路南下，到了长江。家里的田裂成了龟背。一个赶车的捎来哥哥的口信：煤没人买了，米价一天一个样，他要跟着村里人出去逃荒。口信的最后一句是：你别回来，回来也是多一张嘴。',
        en: 'In 1587, the fifteenth year of Wanli, the north dried up, and by the end of the year the famine had come down the Grand Canal to the Yangtze. At home the paddies cracked like a tortoise\'s back. A carter brought word from his brother: nobody was buying coal, the price of rice changed by the day, and he was leaving with the village to beg on the roads. The last of the message: don\'t come home, it would only be one more mouth.',
      },
      choices: [],
    },
    {
      id: 'suppression-report',
      text: {
        zh: '县里一位乡绅递了禀帖：有流贼数百，聚于城外河滩，扶老携幼，意图不轨。“扶老携幼”四个字，后来谁也没有念出声。兵备道在禀帖上批了一个字：剿。营里发了火药和三天的干粮。',
        en: 'A gentleman of the county sent in a petition: several hundred roving bandits had gathered on the river flats outside the walls, "with their old and their young", intent on mischief. Nobody read those words aloud. The circuit intendant wrote one character across the petition: jiao (剿), exterminate. The camp handed out powder and three days\' dry rations.',
      },
      choices: [
        {
          text: { zh: '问队长：贼怎么还带着奶奶？', en: 'Ask the squad leader why bandits bring their grandmothers.' },
          effects: { flags: { askedWhy: true }, place: 'front' },
        },
        {
          text: { zh: '金阿满在发抖。跟他换位置，你站头排。', en: 'Jin Aman is shaking. Swap with him: you take the front rank.' },
          effects: { place: 'front', bond: { jin: 1 } },
        },
        {
          text: { zh: '什么也不说。看看枪头。', en: 'Say nothing. Check your spearhead.' },
          effects: { place: 'second' },
        },
      ],
    },
    {
      id: 'suppression-line',
      text: {
        zh: '河滩上的人站起来的时候，手里拿着的是锅、草席和孩子。鼓响了。照书上说的，闻鼓则进，进了就不许回头。',
        en: 'When the people on the flats stood up, what they held were pots, straw mats and children. The drum beat. As the book says: at the drum you advance, and once you advance you do not look back.',
      },
      choices: [],
    },
  ],
  after: [
    {
      id: 'suppression-count',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '收兵点数：斩获流贼一百三十七级，我军伤三人，其中一个是自己绊倒的。报捷的文书当天晚上就写好了。它凉得比河滩上的人还快。',
        en: 'At the roll after: a hundred and thirty-seven bandit heads taken; three of ours wounded, one of whom had tripped. The victory report was written that evening. It went cold faster than the bodies on the flats.',
      },
      choices: [],
    },
    chapFallenCard('suppression', 'jin', {
      zh: '金阿满没有回来。河滩上一个老汉抡起锄头，那是那天唯一一件当得了兵器的东西。报捷文书上，金阿满算“我军伤亡”，那老汉算“贼首”。',
      en: 'Jin Aman did not come back. An old man on the flats had swung a hoe: the one thing there that day that would pass for a weapon. In the report Jin Aman was "our losses" and the old man was "a bandit chief".',
    }),
    chapFallenCard('suppression', 'lou', {
      zh: '楼大有倒在河滩上，狼筅还攥在手里。是谁打倒他的，没有人看清。泥里的人太多，分不出谁是谁。',
      en: 'Lou Dayou went down on the flats with the wolf-brush still in his fists. Nobody saw who did it. There were too many in the mud to tell anyone apart.',
    }),
    chapFallenCard('suppression', 'wang', {
      zh: '王老七在台州打过倭寇，没有死；死在了一片家乡的河滩上，死在一群饿肚子的人手里。他背了一辈子的军法，没有一条讲到这个。',
      en: 'Wang Laoqi had come through the pirates at Taizhou. He died on a river flat at home, at the hands of hungry people. Of all the law he had by heart, not one article covered this.',
    }),
    {
      id: 'suppression-finish',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '队长派他下河滩去补刀：没死透的，一个也不许留，留下的会去告状。泥里还有东西在动。',
        en: 'The squad leader sent him down onto the flats to finish them: nobody left half alive, because the half alive go and complain. Things were still moving in the mud.',
      },
      choices: [
        { text: { zh: '照做。一刀一个，不看脸。', en: 'Do it. One stroke each. Don\'t look at the faces.' }, effects: { flags: { finished: true } } },
        { text: { zh: '走过去，对还在动的人说：别出声。', en: 'Walk past. Tell the ones still moving: keep quiet.' }, effects: { flags: { spared: true } } },
        { text: { zh: '用刀背砸泥，装作已经做了。', en: 'Strike the mud with the back of the blade, so it looks done.' }, effects: { flags: { spared: true, pretended: true } } },
      ],
    },
    {
      id: 'suppression-brother',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '河滩尽头趴着一个人，脸朝下埋在泥里，背是弯的。那是挑了十年扁担挑出来的弯。他把那人翻过来。是哥哥。',
        en: 'At the far end of the flats a man lay face down in the mud, his back bent: the bend that ten years under a carrying pole put in a man. He turned him over. It was his brother.',
      },
      choices: [],
    },
    {
      id: 'suppression-pockets',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '哥哥身上没有刀，没有棍，连扁担也没带。怀里只有半块发了霉的干饼，和一封叫血泡透了的信。信是托人代写的，字还认得出几个：某营某哨，交义乌陈二。哥哥是来找他的。',
        en: 'His brother had no blade on him, no club, not even the carrying pole. Inside his coat: half a cake of mouldy dry ration, and a letter soaked through with blood. Someone had written it for him, and a few words could still be made out: the camp, the company, to be given to Chen Er of Yiwu. His brother had been walking to find him.',
      },
      choices: [],
    },
    {
      id: 'suppression-grave',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '河堤上，队长在喊收队。',
        en: 'Up on the bank the squad leader was calling them in.',
      },
      choices: [
        {
          text: { zh: '把哥哥背回营里埋。', en: 'Carry your brother back to the camp and bury him there.' },
          effects: { flags: { buriedBrother: true, keptLetter: true }, place: 'front' },
        },
        {
          text: { zh: '就在河滩上挖个坑，用手挖。', en: 'Dig him a grave on the flats, with your hands.' },
          effects: { flags: { buriedBrother: true, buriedOnFlats: true, keptLetter: true } },
        },
        {
          text: { zh: '把信塞进腰牌的绳结里，走。', en: 'Tuck the letter into the cord of your waist tag, and go.' },
          effects: { flags: { keptLetter: true, leftBrother: true } },
        },
      ],
    },
    {
      id: 'suppression-carried',
      when: (life) => chapFlag(life, 'buriedBrother') && !chapFlag(life, 'buriedOnFlats'),
      text: {
        zh: '背着一个“贼”回营，队长没有拦他，只是记住了他的脸。那天的功，没有记在他名下。下一仗，头排就是他的。头排是留给队长舍得的人的。',
        en: 'The squad leader did not stop him carrying a "bandit" back to camp. He only remembered his face. That day\'s merit was not set down to his name. In the next fight the front rank was his: the front rank is for the men a squad leader can spare.',
      },
      // (His share of the day's heads is struck off: ranks.js, `merit: 'withhold'`.)
      effects: { merit: 'withhold' },
      choices: [],
    },
    chapJudgementCard('suppression',
      { zh: '鼓响以后，他离开了自己在阵里的位置。', en: 'After the drum he had left his place in the line.' },
      {
        zh: '甲长拿着刀来割他的耳朵。哨官摆了摆手：今天是大捷，大捷的文书里，不好写自家砍了自家的兵。',
        en: 'His file leader came with a knife for his ear. The company officer waved him off: today was a great victory, and a great victory\'s report has no line for beheading your own man.',
      },
      [
        { text: { zh: '认罪，挨三十军棍。', en: 'Own it. Take thirty strokes of the army staff.' }, effects: { flags: { flogged: true }, place: 'front' } },
        { text: { zh: '说你是去追逃跑的贼。', en: 'Say you were chasing a bandit who ran.' }, effects: { flags: { liedToOfficer: true } } },
      ]),
    {
      id: 'suppression-reward',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '那年，县里那位乡绅以“首告有功”得了一块匾。营里每人赏银三钱。陈二那三钱银子，没有花，也没有扔。',
        en: 'That year the county gentleman was given an honorific board for being the first to report. Every man in the camp got three qian (钱) of silver. Chen Er neither spent his three qian nor threw them away.',
      },
      choices: [],
    },
    // Merit only: no leader of his fell on the flats. Heads were merit; the heads on the flats were a hundred and thirty-seven.
    ...chapPromotionCards('suppression', 1, {
      merit: (rank) => ({
        zh: `收兵点名的时候，队长念到了陈二。一百三十七颗头，按书上的规矩归全哨均分，他那一甲也分到了几颗。队长说：站得住，手不软。他当了${rank.name.zh}，管${rank.leads.zh}。书上写着${rank.name.zh}的差事：临阵退缩的，许${rank.name.zh}割他的耳朵。`,
        en: `At the roll after, the squad leader read out Chen Er's name. The hundred and thirty-seven heads were shared out across the company, as the book says, and a few were set down to his file. Stood his ground, said the squad leader, and his hand didn't shake. He was made ${rank.name.en}, over ${rank.leads.en}. The book gives the file leader his duty: when a man falls back in battle, the file leader may cut off his ear.`,
      }),
    }),
  ],
  scenes: [
    {
      id: 'suppression-mud', at: 'after',
      when: (life, outcome) => chapHeroUp(outcome),
      script: [
        { who: 'narrator', line: { zh: '雨停了。河滩上只剩下乌鸦，和他。', en: 'The rain had stopped. On the flats there were only the crows, and him.' } },
        { who: 'hero', stage: 'kneel', line: { zh: '哥。', en: 'Brother.' } },
        { who: 'hero', stage: 'kneel', line: { zh: '你来做什么。', en: 'What did you come for.' } },
        { who: 'narrator', line: { zh: '信上有他的名字。别的字他不认得，自己的名字他认得。', en: 'His name was on the letter. He could not read the rest, but his own name he knew.' } },
        { who: 'squadLeader', line: { zh: '陈二！收队！', en: 'Chen Er! Fall in!' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于万历十五年，死在一片河滩上，年十九。兵册上他的名字后面添了两个字：阵亡。营里替他报了抚恤银，发没发，册子上没写。哥哥那封信没有送到。河滩上的东西，后来一把火都烧了。',
      en: 'Chen Er died in the fifteenth year of Wanli, 1587, on a river flat, aged nineteen. Beside his name on the roll they wrote two characters: killed in action. The camp claimed his death money. Whether anyone was paid it, the roll does not say. His brother\'s letter never reached him. What was left on the flats was burned.',
    },
  },
};
