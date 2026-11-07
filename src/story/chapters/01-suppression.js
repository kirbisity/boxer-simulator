// PLACEHOLDER: replaced by the writer's chapter (src/story/chapters/01-suppression.js is the WRITER agent's). Only so the engine
// runs Level 1 end to end; its words are a stand-in, not checked against the record.
//
// What the engine reads (the story contract): { id, n, year, title, battle, before: [card], after: [card], scenes: [{ id, at,
// when?(life, outcome), script: [{ who, line, stage? }] }], ending: { text }, judgement?: { back, ahead, fled } }.
// A scene's `stage` words the engine stages (src/story/scenes/stage.js): 'cut' (dark, the scene set), 'approach', 'turn' (he
// turns the body with his spear), 'kneel', 'search' (his hands at the body's chest), 'still' (he kneels on, the hands down), 'rise'.

export const chapter = {
  id: 'suppression',
  n: 1,
  year: 1587,
  title: { zh: '第一章 · 剿匪', en: 'Chapter One · The Suppression' },
  battle: 'suppression',
  before: [
    {
      id: 'register',
      text: {
        zh: '他的名字写进了军籍（军籍，军户的名册）。替他买下这个位子的，是哥哥挑了半辈子煤攒下的钱。',
        en: 'His name is written into the junji (军籍), the army register. The place was bought with his elder brother\'s savings: half a life of carrying coal.',
      },
      choices: [],
    },
    {
      id: 'drought',
      text: {
        zh: '那年大旱。哥哥跟着逃荒的人走了，说等雨来了再回来。',
        en: 'That year the rain did not come. His brother left with the people on the roads, and said he would be back when it rained.',
      },
      choices: [],
    },
    {
      id: 'line',
      text: {
        zh: '有个乡绅报了官，说路上来了一伙土匪。百户把队伍排开。你站在哪里？',
        en: 'A gentleman has reported bandits on the road. The company commander draws the company up. Where do you stand?',
      },
      choices: [
        { text: { zh: '站在第一排。', en: 'In the front rank.' }, effects: { place: 'front' } },
        { text: { zh: '站在第二排，在同乡身后。', en: 'In the second rank, behind the men from home.' }, effects: { place: 'second', bond: { chen: 1 } } },
      ],
    },
  ],
  after: [
    {
      id: 'wounded',
      when: (life, outcome) => !outcome?.hero?.fell,
      text: {
        zh: '仗打完了。百户下令：把地上还活着的都了结了。',
        en: 'It is over. The commander gives the order: finish the ones still alive on the ground.',
      },
      choices: [],
    },
    {
      id: 'ran',
      when: (life, outcome) => outcome?.comrades?.brother && !outcome.comrades.brother.fell,
      text: {
        zh: '他在死人中间找了很久，没有找到哥哥。也许他跑掉了。',
        en: 'He looks a long time among the dead, and does not find his brother. Perhaps he got away.',
      },
      choices: [],
    },
  ],
  scenes: [
    {
      id: 'brother',
      at: 'after',
      when: (life, outcome) => Boolean(outcome?.comrades?.brother?.fell),
      script: [
        { who: 'narrator', stage: 'cut', line: { zh: '泥里趴着一个人。', en: 'A man lies face down in the mud.' } },
        { who: 'hero', stage: 'turn', line: { zh: '他用枪杆把那人翻过来。', en: 'He turns the body over with the shaft of his spear.' } },
        { who: 'narrator', stage: 'kneel', line: { zh: '是他哥哥。', en: 'It is his brother.' } },
        { who: 'narrator', stage: 'search', line: { zh: '没有刀，没有枪。怀里是半块发霉的干粮。', en: 'No weapon. In his shirt, half a cake of mouldy dry ration.' } },
        { who: 'narrator', stage: 'search', line: { zh: '还有一封信，浸透了血，上面写着营里的地址，和他的名字。', en: 'And a letter, soaked in blood, with the camp\'s address on it, and his name.' } },
        { who: 'narrator', stage: 'still', line: { zh: '', en: '' } },
      ],
    },
  ],
  ending: {
    text: {
      zh: '他死在剿匪的路上，十九岁。',
      en: 'He died on the road, at nineteen, putting down bandits who were not bandits.',
    },
  },
};
