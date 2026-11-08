// Chapter 3, 1593: Pyongyang, 6-8 February (Wanli 21/1/6-8). The record: Li Rusong's army of some 43,000; the southern
// foot under Wu Weizhong (a Yiwu man, Qi's recruit) at Moranbong, Wu shot in the chest; Luo Shangzhi on the wall; Li
// beheading a man who stepped back and promising silver to the first man up (5,000 taels in one account, 300 in
// another); Konishi Yukinaga's escape over the Daedong; Li's report putting the northern general Zhang Shijue first,
// heads being the measure of merit; the censors' charge that half the heads were Korean villagers (never settled); the
// Korean court's praise of the southern troops (宣祖实录). Sources in src/story/text/sources.md.
import { chapAlive, chapFallenCard, chapHeroUp, chapJudgementCard, chapLivedCard, chapPromotionCards } from './kit.js';

export const CHAPTER_PYONGYANG = {
  id: 'pyongyang', n: 3, year: 1593,
  title: { zh: '平壤', en: 'Pyongyang' },
  battle: 'pyongyang',
  before: [
    {
      id: 'pyongyang-north',
      text: {
        zh: '万历二十年，丰臣秀吉的大军渡海，几个月里拿下了汉城，又拿下了平壤，朝鲜国王一路北逃到鸭绿江边。大明发兵东征：提督李如松带辽东铁骑，南兵的步卒跟着游击吴惟忠。吴惟忠是义乌人，当年戚将军亲手招的兵。陈二的营调往北边。他头一回见到冻得能走人的江。',
        en: 'In 1592 Toyotomi Hideyoshi\'s army crossed the sea and within months had taken Seoul, and then Pyongyang; the Korean king fled north as far as the Yalu. The Ming sent an army east: Commander Li Rusong with the Liaodong horse, and the southern foot under Guerrilla Commander Wu Weizhong, a Yiwu man whom General Qi had recruited himself. Chen Er\'s camp was sent north. He saw a river frozen hard enough to walk on for the first time.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-he',
      text: {
        zh: '队里补进来一个永康人，何二狗，为东征新招的，使腰刀。他到营里第三天就弄明白了一件事：北兵骑马快，抢到的头多，可北兵不爱下马割头。他说：我替他们割，三七分账。',
        en: 'A Yongkang man joined the squad, He Ergou, newly recruited for Korea, a dao man. By his third day in camp he had worked one thing out: the northern horsemen were quick and got to the heads first, but they did not like getting off their horses to cut them. I\'ll cut for them, he said. A three-seven split.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-camps',
      when: (life) => chapAlive(life, 'wang'),
      text: {
        zh: '北兵骑马，看不起走路的；南兵走路，看不起只会抢头的。两边隔着一道营沟，各骂各的方言。王老七说：到了城墙底下，都是一样的肉。',
        en: 'The northern troops rode, and looked down on men who walked. The southern troops walked, and looked down on men who were only good for grabbing heads. A camp ditch between them, each side cursing in its own dialect. Wang Laoqi said: under the wall it\'s all the same meat.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-camps-nowang',
      when: (life) => !chapAlive(life, 'wang'),
      text: {
        zh: '北兵骑马，看不起走路的；南兵走路，看不起只会抢头的。两边隔着一道营沟，各骂各的方言。王老七要是还在，大概会说：到了城墙底下，都是一样的肉。',
        en: 'The northern troops rode, and looked down on men who walked. The southern troops walked, and looked down on men who were only good for grabbing heads. A camp ditch between them, each side cursing in its own dialect. Had Wang Laoqi been alive he would probably have said: under the wall it\'s all the same meat.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-promise',
      text: {
        zh: '提督传下话来：先登城者，重赏。有人说赏银五千两，有人说三百两。数目随说的人变，反正谁也没见过。',
        en: 'Word came down from the commander: a great reward to the first man on the wall. Five thousand taels of silver, some said; three hundred, said others. The figure changed with whoever told it. Nobody had seen either.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-wall',
      text: {
        zh: '正月初六，吴游击带南兵攻城北的牡丹峰，日本兵在土窟里放铳。云梯分下来，一队一架。',
        en: 'On the sixth of the first month Commander Wu took the southern men against Moranbong, the hill north of the city, where the Japanese fired from dugouts in the earth. The scaling ladders were handed out, one to a squad.',
      },
      choices: [
        { text: { zh: '上梯子。', en: 'Climb.' }, effects: { place: 'front', flags: { climbed: true } } },
        { text: { zh: '扶梯子。照书上的，队不散。', en: 'Hold the ladder. As the book says, keep the squad together.' }, effects: { place: 'second' } },
        { text: { zh: '问队长：头一个上去的要是死了，赏银给谁？', en: 'Ask the squad leader who gets the silver if the first man up dies.' }, effects: { place: 'front', flags: { askedSilver: true } } },
      ],
    },
  ],
  after: [
    {
      id: 'pyongyang-taken',
      text: {
        zh: '正月初八夜里，小西行长带着剩下的人渡过大同江，跑了。城是南兵先登的，朝鲜人亲眼看见。吴游击胸口中了一铳，还在指挥。',
        en: 'On the night of the eighth Konishi Yukinaga took what was left of his men across the Daedong River and got away. The southern foot had been first on the wall; the Koreans saw it with their own eyes. Commander Wu took a ball in the chest and kept giving orders.',
      },
      choices: [],
    },
    {
      id: 'pyongyang-credit',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '提督的奏捷疏里，首功给了北将张世爵：北兵在前，南兵在后。论功按首级，北兵马快刀快，头割得多；南兵在城墙上放铳爬梯，顾不上。朝鲜国王和大臣都替南兵说话，没有用。后来有御史上本，说北兵献上的首级，一半是朝鲜百姓剃了头充数的。朝廷派人去查。查清了没有，史书上也没说清。',
        en: 'In the commander\'s report of victory the first merit went to the northern general Zhang Shijue: northern troops first, southern second. Merit went by heads, and the northern men had fast horses and fast blades; the southern men had been busy on the wall with guns and ladders. The Korean king and his ministers spoke up for the southerners. It changed nothing. Later a censor memorialised that half the heads the northern troops had handed in were Korean villagers, shaved to pass. The court sent someone to look into it. Whether he found anything, the histories do not make clear.',
      },
      // (His share of the wall goes into the northern books: ranks.js, `merit: 'withhold'`.)
      effects: { merit: 'withhold' },
      choices: [],
    },
    {
      id: 'pyongyang-silver',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '五千两没有发下来，三百两也没有。营里的南兵聚在一处，有人说：去提督大帐前讨个说法。提督在城下亲手斩过一个后退的兵，人人都看见了。',
        en: 'The five thousand taels never came. Nor did the three hundred. The southern men gathered, and someone said: let\'s go to the commander\'s tent and ask. Under the wall they had all watched the commander behead a man with his own hand, for stepping back.',
      },
      choices: [
        {
          text: { zh: '跟他们去大帐。', en: 'Go with them to the tent.' },
          effects: { flags: { wentToTent: true } },
          fatal: {
            how: 'executed',
            text: {
              zh: '大帐前跪了一排人。提督问谁领的头。没人吭声，就挑了一个看上去最不服的——是陈二。罪名是“鼓噪”，斩首，首级挂在营门上。这是他在朝鲜挣到的唯一一颗算了数的头。',
              en: 'A row of men knelt before the tent. The commander asked who had led them. Nobody spoke, so they picked the one who looked least sorry. It was Chen Er. The charge was "raising a clamour". They cut off his head and hung it on the camp gate: the only head he earned in Korea that anybody counted.',
            },
          },
        },
        {
          text: { zh: '不去。把冻裂的手塞回袖子里。', en: 'Stay. Put your split hands back in your sleeves.' },
          effects: { flags: { stayedQuiet: true } },
        },
        {
          text: { zh: '找个识字的，把南兵先登的经过写成禀帖，递给朝鲜的官员。', en: 'Find a man who can write, have him set down how the southern men went up first, and get it to the Korean officials.' },
          effects: { flags: { petition: true } },
        },
      ],
    },
    {
      id: 'pyongyang-petition',
      when: (life) => Boolean(life?.flags?.petition),
      text: {
        zh: '朝鲜的史官后来写：南兵之功最高。这句话写进了朝鲜的书里，没有写进提督的捷报里。陈二的名字两边都没有。',
        en: 'A Korean court historian later wrote that the southern troops\' merit was the highest. The sentence went into the Korean books. It did not go into the commander\'s report. Chen Er\'s name went into neither.',
      },
      choices: [],
    },
    // The record's losses on the wall (the southern foot first up it, Wu Weizhong shot): the man over him dead on a ladder.
    // The post is filled from the men who stood; the merit was the north's (the credit card above keeps it back).
    ...chapPromotionCards('pyongyang', 3, {
      vacancy: true,
      vacated: (rank) => ({
        zh: `攻城那天，他头上的那个人死在了梯子上。照书上的规矩，从同队站住了的人里挑一个接旗。挑的是陈二。他当了${rank.name.zh}，管${rank.leads.zh}。功劳记在北兵的册子上；缺，是南兵自己拿命补的。`,
        en: `On the day of the wall the man over him died on a ladder. By the book, the flag goes to a man of the same unit who stood his ground. They picked Chen Er. He was made ${rank.name.en}, over ${rank.leads.en}. The merit went into the northern troops' books. The gaps the southern men filled themselves, with their lives.`,
      }),
    }),
    chapFallenCard('pyongyang', 'jin', {
      zh: '金阿满死在牡丹峰的土窟前面。他上山之前还在说笑，说朝鲜的雪比义乌的白。',
      en: 'Jin Aman died in front of a dugout on Moranbong. On the way up the hill he had still been joking: Korean snow, he said, was whiter than Yiwu\'s.',
    }),
    chapFallenCard('pyongyang', 'lou', {
      zh: '楼大有死在城墙下。他把狼筅顶上了墙头，人没上去。',
      en: 'Lou Dayou died at the foot of the wall. He got the wolf-brush to the top of it. He did not get there himself.',
    }),
    chapFallenCard('pyongyang', 'wang', {
      zh: '王老七死在平壤。五十多岁的人爬梯子，梯子没断，他的腿先软了。死前他说：书上写的，都对。',
      en: 'Wang Laoqi died at Pyongyang. A man past fifty on a ladder: the ladder held, and his legs gave first. Before he died he said: everything the book says is right.',
    }),
    chapFallenCard('pyongyang', 'ye', {
      zh: '叶春生死在城下，鸟铳摔成了两截。他写过的“平安”，这回没有人替他写。',
      en: 'Ye Chunsheng died below the wall, his gun broken in two. All the "safe and well" he had written; nobody wrote one for him.',
    }),
    chapFallenCard('pyongyang', 'he', {
      zh: '何二狗死了。他死在城外，身上揣着三颗头的分账，北兵一文也没给。',
      en: 'He Ergou died outside the city with three heads\' worth of shares owed him. The northern troopers never paid a copper of it.',
    }),
    chapLivedCard('pyongyang', 'he', {
      zh: '何二狗这一仗替北兵割了九颗头，分到了三颗的钱。他请大家喝酒，没人去。',
      en: 'He Ergou cut nine heads for the northern troopers that day and was paid for three. He offered everyone a drink. Nobody went.',
    }),
    chapJudgementCard('pyongyang',
      { zh: '城下乱成一团的时候，他离开了自己在阵里的位置。', en: 'In the confusion below the wall he had left his place in the line.' },
      {
        zh: '提督自己在城下斩过后退的兵。吴游击看了他很久，没有斩他：南兵本来就少，死一个少一个。打了五十军棍。',
        en: 'The commander himself had beheaded a man for stepping back under that wall. Commander Wu looked at him a long time and did not behead him: the southern troops were few enough already. Fifty strokes.',
      },
      [
        { text: { zh: '挨着。', en: 'Take them.' }, effects: { flags: { flogged: true }, place: 'front' } },
      ]),
  ],
  scenes: [
    {
      id: 'pyongyang-tally', at: 'after', set: 'gateHeads',
      when: (life, outcome) => chapHeroUp(outcome),
      script: [
        { who: 'narrator', line: { zh: '那天夜里，北营门口挑着灯笼点首级，一颗一颗，像收秋。', en: 'That night at the northern camp\'s gate they counted heads by lantern, one by one, like a harvest coming in.' } },
        { who: 'northTrooper', line: { zh: '南蛮子，看什么？你们的头在城墙上，没人捡。', en: 'What are you looking at, southerner? Your heads are on the wall. Nobody picked them up.' } },
        { who: 'hero', line: { zh: '我没看。我在数。', en: 'I\'m not looking. I\'m counting.' } },
        { who: 'narrator', line: { zh: '他数过了一百。有几颗，他看着不像日本人。', en: 'He counted past a hundred. A few of them did not look Japanese to him.' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '陈二死于万历二十一年正月，平壤城下，年二十五。那天南兵先登，捷报上北兵居首。他的名字后来在朝鲜的一份名册上出现过，写错了一个字。',
      en: 'Chen Er died under the walls of Pyongyang in the first month of 1593, aged twenty-five. The southern foot were first on the wall that day; the report put the northern horse first. His name turned up later on a Korean list, with one character wrong.',
    },
  },
};
