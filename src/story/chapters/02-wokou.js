// Chapter 2, 1588: a raid from the sea on the Zhejiang coast. The raid is private (the record has a handful of
// Wanli-era raids, no named one here); its frame is the record: Qi Jiguang's death in poverty (17 January 1588, Wanli
// 15/12), the collapse of the raids after the Jiajing reign (601 recorded under Jiajing, 15 in all of Wanli), Hideyoshi's
// ban on piracy of 1588, issued with the sword hunt, and the manual's "first prohibition" on heads (纪效新书 卷三).
import { chapAlive, chapFallenCard, chapFlag, chapHeroUp, chapJudgementCard, chapPromotionCards, chapWasThere } from './kit.js';

export const CHAPTER_WOKOU = {
  id: 'wokou', n: 2, year: 1588,
  title: { zh: '海上来的', en: 'From the Sea' },
  battle: 'wokou',
  before: [
    {
      id: 'wokou-qi',
      text: {
        zh: '万历十五年十二月，戚继光死在登州老家，家里穷得四壁空空。消息传到营里，已经开春了。',
        en: 'In the twelfth month of the fifteenth year of Wanli, January 1588, Qi Jiguang died at home in Dengzhou, poor, in a house with nothing in it. The news reached the camp in spring.',
      },
      choices: [],
    },
    {
      id: 'wokou-book',
      when: (life) => chapAlive(life, 'wang'),
      text: {
        zh: '王老七把那本翻烂了的《纪效新书》放在铺上，看了半天，说：人没了，书还在。又说：书上也没写，仗打赢了，打仗的人怎么办。',
        en: 'Wang Laoqi laid his falling-apart copy of the Jixiao Xinshu on his bunk and looked at it a long while. The man\'s gone, he said; the book\'s still here. Then: the book doesn\'t say, either, what becomes of the men once the war is won.',
      },
      choices: [],
    },
    {
      id: 'wokou-ledger',
      text: {
        zh: '嘉靖一朝，倭寇犯境，有记载的六百余次。到了万历一朝，四十几年，不过十几次。海防营的饷照旧开支，兵册照旧满员——册子上满员。',
        en: 'Under the Jiajing emperor the records counted more than six hundred pirate raids. Under Wanli, in more than forty years, fifteen. The coast army\'s pay was still drawn in full and its rolls were still full. On paper.',
      },
      choices: [],
    },
    {
      id: 'wokou-ye',
      text: {
        zh: '新来的叶春生是浦江人，打鸟铳，识字。他替营里的人写家书，一封两文钱，写到“平安”两个字，不另收钱。陈二拿出哥哥那封信，请他念。叶春生看了很久，说：念不了，字叫血糊住了。他念得出来，只是不念。',
        en: 'The new man, Ye Chunsheng of Pujiang, carried a matchlock and could read. He wrote the men\'s letters home at two coppers a letter, nothing extra for the words "safe and well". Chen Er brought out his brother\'s letter and asked him to read it. Ye looked at it a long time and said: I can\'t, the blood\'s over the words. He could have. He would not.',
      },
      choices: [],
    },
    {
      id: 'wokou-hideyoshi',
      text: {
        zh: '同一年，海那边的丰臣秀吉下令禁绝海贼：要么投到大名手下，要么交出兵器回去种地。他不是替大明着想。他要的是那些船和水手——四年以后，渡海去朝鲜的大军，坐的就是这些船。',
        en: 'The same year, across the sea, Toyotomi Hideyoshi banned piracy: the pirates were to serve a lord, or hand in their weapons and go back to the fields. It was not done for the Ming\'s sake. He wanted the ships and the seamen under his own hand. Four years later those ships carried his army to Korea.',
      },
      choices: [],
    },
    {
      id: 'wokou-alarm',
      text: {
        zh: '烽堠上起了烟。湾里泊着几条船，船上多少人说不清；报上来的数目，一路上翻了三番。',
        en: 'Smoke on the beacon tower. A few boats lay in the cove, with how many men aboard nobody could say; the number in the report tripled on its way up.',
      },
      choices: [
        { text: { zh: '照书上的鸳鸯阵，站到狼筅后面。', en: 'Take your place behind the wolf-brush, as the book draws the mandarin-duck formation (鸳鸯阵, yuanyang zhen).' }, effects: { place: 'second' } },
        { text: { zh: '跟队长说，你要站头排。', en: 'Tell the squad leader you want the front rank.' }, effects: { place: 'front', flags: { volunteered: true } } },
      ],
    },
  ],
  after: [
    {
      id: 'wokou-heads',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '倭寇里有日本人，更多的是福建口音、浙江口音。拎回来的头，顶上都剃成了日本样式；有几颗，剃刀印还是青的。是他们自己剃的，还是后来剃的，没有人问。',
        en: 'Some of the raiders were Japanese. More of them spoke with Fujian accents, and Zhejiang ones. The heads brought back were all shaved on the crown in the Japanese style; on a few the razor marks were still fresh. Whether the raiders had shaved them themselves, or someone had afterwards, nobody asked.',
      },
      choices: [],
    },
    {
      id: 'wokou-rule',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '书上的“临阵第一禁约”：长牌、长枪、狼筅只管往前杀，不许带解首刀，不许站住了顾恋首级。所以割头的人，从来不是杀人的人。论功的时候，论的是头。',
        en: 'The book\'s "first prohibition in battle": shields, spears and wolf-brushes kill and keep going; they may not carry the head-cutting knife, may not stop and fuss over heads. So the man who cuts the head is never the man who did the killing. When merit is counted, it is heads that are counted.',
      },
      choices: [
        { text: { zh: '不争。', en: 'Let it go.' }, effects: { flags: { letHeadGo: true } } },
        { text: { zh: '去找割头的人，要一半赏银。', en: 'Find the man who cut it and ask for half the reward.' }, effects: { flags: { askedShare: true } } },
      ],
    },
    chapFallenCard('wokou', 'jin', {
      zh: '金阿满死在沙滩上。他怕打雷，不怕死，这回两样都碰上了：先是鸟铳响，后来才是刀。',
      en: 'Jin Aman died on the sand. He had been afraid of thunder and not of dying, and that day he met both: first the guns went off, then came the blade.',
    }),
    chapFallenCard('wokou', 'lou', {
      zh: '楼大有死在沙滩上。狼筅的枝杈挂住了一个倭寇的刀，挂住了，却没有人上来补那一枪。',
      en: 'Lou Dayou died on the sand. The branches of his wolf-brush caught a pirate\'s blade and held it, and no spear came in behind to finish the man.',
    }),
    chapFallenCard('wokou', 'wang', {
      zh: '王老七死了。他守着藤牌，守了二十七年，最后一刀从牌子底下进来。他那本《纪效新书》，后来不知到了谁手里。',
      en: 'Wang Laoqi died. He had kept behind his rattan shield for twenty-seven years, and the last cut came in under it. His copy of the drill manual went to whoever was nearest.',
    }),
    chapFallenCard('wokou', 'ye', {
      zh: '叶春生死了，铳里还有一颗没放出去的子。他替别人写了几十封“平安”，自己家里那封，没有人替他写。',
      en: 'Ye Chunsheng died with a ball still in his gun. He had written dozens of "safe and well" for other men. Nobody wrote his.',
    }),
    {
      id: 'wokou-letter-ye',
      when: (life, outcome) => chapWasThere(life, outcome, 'ye') && !chapAlive(life, 'ye', outcome) && chapFlag(life, 'keptLetter'),
      text: {
        zh: '哥哥那封信，还是没有人念。',
        en: 'His brother\'s letter was still unread.',
      },
      choices: [],
    },
    chapJudgementCard('wokou',
      { zh: '仗打到一半，他离开了自己在阵里的位置。', en: 'Halfway through the fight he had left his place in the line.' },
      {
        zh: '这一回是真打仗，队长没有手软，提着刀来了。他的耳朵保住了，代价是挨四十军棍，扣一个月的饷。扣下的饷，归了谁，没人说。',
        en: 'This time it had been a real fight, and the squad leader came with the knife. He kept his ear, at the price of forty strokes and a month\'s pay. Whose the month\'s pay became, nobody said.',
      },
      [
        { text: { zh: '挨着。', en: 'Take it.' }, effects: { flags: { flogged: true }, place: 'front' } },
        { text: { zh: '说你是去救人的。', en: 'Say you went to pull a man out.' }, effects: { flags: { pleaded: true } } },
      ]),
    {
      id: 'wokou-reward',
      when: (life, outcome) => chapHeroUp(outcome),
      text: {
        zh: '报上去，这一仗成了“大捷”。巡抚请功，总兵加俸。陈二分到一钱银子，外加一句“奋勇当先”。这句话不能吃。',
        en: 'Up the chain it went as a great victory. The governor asked for honours; the regional commander got a raise. Chen Er got one qian of silver and a mention: "brave, and first into the enemy". A mention cannot be eaten.',
      },
      choices: [],
    },
    // His squad leader killed on the beach (the battle's `superior`), or his merit: the platoon leader picks the squad's
    // leaders from among its men (纪效新书 原束伍: "于兵内自举抽出队长"; 练兵实纪: "队长必有胆者").
    ...chapPromotionCards('wokou', 2, {
      vacated: (rank) => ({
        zh: `队长死在了沙滩上。书上写着：队长不退而队兵退走、致队长阵亡的，队下甲长俱斩。这一队没有退。哨长从站住了的人里挑人补缺，一个往上挪一格。陈二当了${rank.name.zh}，管${rank.leads.zh}。`,
        en: `The squad leader died on the sand. The book says: when a squad leader stands and his men fall back and let him die, every file leader under him is beheaded. This squad had not fallen back. The platoon leader filled the gaps from the men who had stood, each moved up one. Chen Er was made ${rank.name.en}, over ${rank.leads.en}.`,
      }),
      merit: (rank) => ({
        zh: `书上说，带兵的要从兵里挑，挑有胆的。哨长翻着那句“奋勇当先”，又看了看陈二。这一仗他站住了，一回也没往后看。陈二当了${rank.name.zh}，管${rank.leads.zh}。那一钱银子还是一钱。`,
        en: `The book says the men who lead are picked from among the men, and the ones picked are the ones with nerve. The platoon leader looked at the mention, "brave, and first into the enemy", and then at Chen Er. He had stood his ground that day, and never once looked back. Chen Er was made ${rank.name.en}, over ${rank.leads.en}. The qian of silver stayed one qian.`,
      }),
    }),
  ],
  scenes: [],
  ending: {
    text: {
      zh: '陈二死于万历十六年，死在海边，年二十。那一仗的捷报写得很长，他的名字在最后一行，挨着“伤亡无几”四个字。',
      en: 'Chen Er died on a beach in the sixteenth year of Wanli, 1588, aged twenty. The victory report was a long one. His name came at the very end, next to the words "losses negligible".',
    },
  },
};
