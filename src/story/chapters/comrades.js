// PLACEHOLDER: replaced by the writer's chapter (src/story/chapters/comrades.js is the WRITER agent's). Only so the engine runs.
// The shape the engine reads: COMRADES [{ id, name: { zh, en }, from: { zh, en }, preset: PRESETS key or inputs, joins: chapter,
// bond?, rank?, notes }]; FAMILY { [who]: { name: { zh, en }, … } } (optional).

export const COMRADES = [
  { id: 'chen', name: { zh: '陈阿六', en: 'Chen Aliu' }, from: { zh: '义乌', en: 'Yiwu' }, preset: 'mingSpear', joins: 1, bond: 2, notes: 'placeholder' },
  { id: 'lou', name: { zh: '楼三', en: 'Lou San' }, from: { zh: '义乌', en: 'Yiwu' }, preset: 'mingSpear', joins: 1, bond: 1, notes: 'placeholder' },
  { id: 'zhou', name: { zh: '周贵', en: 'Zhou Gui' }, from: { zh: '金华', en: 'Jinhua' }, preset: 'mingSpear', joins: 1, bond: 0, notes: 'placeholder' },
];

export const FAMILY = {
  brother: { name: { zh: '吴大', en: 'Wu Da' }, role: { zh: '哥哥，挑煤的', en: 'his elder brother, a coal carrier' }, born: 1560 },
};
