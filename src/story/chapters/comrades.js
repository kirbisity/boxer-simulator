// The named men of Chen Er's life. Private people, invented, kept to what the record allows: the southern troops (南兵)
// were recruited from Yiwu and the counties round it (Dongyang, Pujiang, Yongkang, Jinhua: all Jinhua prefecture, where
// Qi Jiguang drew his men), and Liaodong's own soldiers were hereditary military households (军户). `preset` is a key of
// PRESETS in src/body.js, the fighter he is built from; `born` gives his age in any chapter; `joins` is the chapter he
// enters the life in. `rises` lists the ranks he reaches if he is still alive then (the engine may apply them). Who dies
// is left to the simulation: a named man who falls in a battle is dead from then on, and the cards ask before they speak.
export const COMRADES = [
  {
    id: 'lou', name: { zh: '楼大有', en: 'Lou Dayou' }, from: { zh: '义乌佛堂', en: 'Fotang, Yiwu' },
    preset: 'langxian', born: 1566, joins: 1, rises: [{ chapter: 5, rank: 'squadLeader' }],
    notes: { zh: '矿工的儿子，个子大，话少，扛狼筅。', en: 'A miner\'s son, big and quiet; carries the wolf-brush (狼筅, langxian).' },
  },
  {
    id: 'jin', name: { zh: '金阿满', en: 'Jin Aman' }, from: { zh: '义乌赤岸', en: 'Chi\'an, Yiwu' },
    preset: 'mingSpear', born: 1569, joins: 1,
    notes: { zh: '爱说笑，怕打雷，不怕死。家里有个娘。1595年石门寨讨饷，被斩。', en: 'A joker, afraid of thunder, not of dying. Has a mother at home. Beheaded after the pay protest at Shimenzhai, 1595, if he lives that long.' },
  },
  {
    id: 'wang', name: { zh: '王老七', en: 'Wang Laoqi' }, from: { zh: '东阳', en: 'Dongyang' },
    preset: 'swordShield', born: 1541, joins: 1,
    notes: { zh: '老兵，嘉靖四十年跟戚将军在台州打过倭，背得出《纪效新书》。', en: 'An old hand who fought the pirates at Taizhou under Qi Jiguang in 1561, and can recite the drill manual.' },
  },
  {
    id: 'ye', name: { zh: '叶春生', en: 'Ye Chunsheng' }, from: { zh: '浦江', en: 'Pujiang' },
    preset: 'mingMatchlock', born: 1567, joins: 2, rises: [{ chapter: 4, rank: 'squadLeader' }, { chapter: 6, rank: 'officer' }],
    notes: { zh: '打鸟铳，识字，替人写家书。升官靠的是一手好字。', en: 'A gunner who can read and writes the men\'s letters. Rises by his handwriting.' },
  },
  {
    id: 'he', name: { zh: '何二狗', en: 'He Ergou' }, from: { zh: '永康', en: 'Yongkang' },
    preset: 'mingDao', born: 1571, joins: 3,
    notes: { zh: '1592年为东征招来的兵，使腰刀，替北兵割头分钱。', en: 'Recruited for Korea in 1592; a dao man who cuts heads for the northern troopers for a share.' },
  },
  {
    id: 'zhu', name: { zh: '朱应龙', en: 'Zhu Yinglong' }, from: { zh: '金华', en: 'Jinhua' },
    preset: 'mingSpear', born: 1577, joins: 5, rises: [{ chapter: 7, rank: 'squadLeader' }],
    notes: { zh: '家里的田抵了举人的债，1597年投军。', en: 'His family\'s land went to a provincial graduate for a debt; enlisted in 1597.' },
  },
  {
    id: 'ma', name: { zh: '马得胜', en: 'Ma Desheng' }, from: { zh: '辽阳', en: 'Liaoyang' },
    preset: 'mingDao', born: 1574, joins: 6,
    notes: { zh: '辽东本地军户，祖上洪武年间就在这里当兵。给陈二说的亲。', en: 'A Liaodong man of a hereditary military household, soldiering here since the Hongwu reign. Arranges Chen Er\'s marriage.' },
  },
  {
    id: 'shen', name: { zh: '沈小乙', en: 'Shen Xiaoyi' }, from: { zh: '义乌', en: 'Yiwu' },
    preset: 'mingMatchlock', born: 1603, joins: 8,
    notes: { zh: '十八岁的新兵，跟陈二的儿子差不多大。', en: 'An eighteen-year-old recruit, about the age of Chen Er\'s son.' },
  },
];
