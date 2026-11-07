// Chen Er and his people: invented, and kept inside what the record allows (a Yiwu recruit of the southern troops; a
// Kuandian settler's daughter driven in with the 64,000 households in 1606; a soldier's family outside Liaoyang in 1621).
// The engine may take the hero's name and birth year from here; the family's members appear in the life as
// life.family[key] = true once a card's choice sets them (`family: { wife: true }` and so on).
export const STORY_HERO = {
  name: { zh: '陈二', en: 'Chen Er' },
  from: { zh: '义乌倍磊', en: 'Beilei, Yiwu' },
  born: 1568,
  preset: 'mingSpear',
};

export const STORY_FAMILY = {
  brother: {
    name: { zh: '陈大', en: 'Chen Da' }, born: 1559, died: 1587,
    notes: { zh: '挑煤的。十年的工钱换了弟弟一个兵册上的名字。', en: 'A coal carrier. Ten years\' wages bought his brother a name on the army register.' },
  },
  wife: {
    name: { zh: '孙氏', en: 'Mrs Sun' }, born: 1586, from: { zh: '宽甸', en: 'Kuandian' },
    notes: { zh: '宽甸弃地时随舅舅迁到辽阳城外，爹娘死在路上。', en: 'Driven in from Kuandian in 1606 with her uncle; her parents died on the road.' },
  },
  son: {
    name: { zh: '陈辽生', en: 'Chen Liaosheng' }, born: 1608,
    notes: { zh: '生在辽东，所以叫辽生。', en: 'Born in Liao, so named Liaosheng.' },
  },
  daughter: {
    name: { zh: '阿禾', en: 'Ahe' }, born: 1611,
    notes: { zh: '小名阿禾，他想起了义乌的稻子。', en: 'Little rice-stalk: he was thinking of the paddies at home.' },
  },
};
