// names-events: the fight's words as its data keeps them (English) → Chinese, read at display with tname() (src/i18n/names.js):
// the blows' names on the buttons, the toasts and over an incoming man (control.js moveName, its mirrored "Switch …" and
// "Reverse …" too), the weapon arts' names on their button and in the art's caption (weaponarts.js ARTS.labels, artdrama.js
// ARTDRAMA.titles), and the grenades' button names (weapons.js THROWABLES). The sandbox's event log (main.js logEvent: the
// physics' own words and numbers, a readout for testing) stays English.
export const NAMES_EVENTS = {
  // The blows (control.js MOVE_NAMES and the names made from move keys).
  'Jab': '刺拳', 'Cross': '后手直拳', 'Hook': '勾拳', 'Rear hook': '后手勾拳', 'Uppercut': '上勾拳', 'Liver hook': '肝区勾拳',
  'Roundhouse': '鞭腿', 'Low kick': '低扫腿', 'Spinning kick': '转身踢', 'Teep': '正蹬', 'Knee': '膝撞', 'Elbow': '肘击',
  'Rising elbow': '上挑肘', 'Palm strike': '掌击', 'Push': '推掌', 'Tsuppari': '突张', 'Oshi': '推压',
  'Shield bash': '盾撞', 'Overhand': '过顶劈', 'Forehand': '正手斩', 'Backhand': '反手斩', 'Leg strike': '腿击', 'Poke': '戳击',
  'Oberhau': '上劈', 'Zwerchhau': '横劈', 'Unterhau': '下撩', 'Lunge': '弓步突刺',
  'Shōmen': '正面劈', 'Kesagiri': '袈裟斩', 'Gyaku-kesa': '逆袈裟', 'Yokogiri': '横斩', 'Kiriage': '切上', 'Tsuki': '突刺',
  'Low cut': '下段斩', 'Uchi-otoshi': '打落', 'Kesa-tsuki': '袈裟接突', 'Jōdan-gedan': '上段转下段',
  'Hammer': '锤击', 'Sweep': '横扫', 'Cut': '砍', 'Rising cut': '上撩斩', 'Thrust': '刺',
  'Spear thrust': '枪刺', 'Spear jab': '枪点刺', 'Spear sweep': '枪扫', 'High thrust': '上刺', 'Low thrust': '下刺',
  'Lance thrust': '骑枪突刺', 'Lance at the face': '骑枪挑面', 'Lance jab': '骑枪点刺', 'Lance charge': '骑枪冲锋',
  'Stab': '捅刺', 'Rising stab': '上挑刺', 'High stab': '高刺', 'Finisher': '了结',
  'Quick thrust': '快刺', 'Flick cut': '腕挑', 'Hooked cut': '钩斩', 'Crescent slash': '新月斩', 'Butt strike': '杆尾击',
  'Shot': '射击', 'Volley': '齐射', 'Arrow loosed': '放箭',
  // Blows from the other side (control.js mirrorName).
  'Switch elbow': '换架肘击', 'Switch low kick': '换架低扫', 'Switch roundhouse': '换架鞭腿', 'Switch spinning kick': '换架转身踢',
  'Reverse blade cut': '反手刃砍', 'Reverse blade sweep': '反手刃扫', 'Reverse butt strike': '反手杆尾击', 'Reverse cut': '反手砍',
  'Reverse flick cut': '反手腕挑', 'Reverse hammer': '反手锤击', 'Reverse hooked cut': '反手钩斩', 'Reverse kesagiri': '反手袈裟斩',
  'Reverse kiriage': '反手切上', 'Reverse leg strike': '反手腿击', 'Reverse mace': '反手骨朵击', 'Reverse oberhau': '反手上劈',
  'Reverse overhand': '反手过顶劈', 'Reverse rising cut': '反手上撩斩', 'Reverse spear sweep': '反手枪扫', 'Reverse sweep': '反手横扫',
  'Reverse unterhau': '反手下撩', 'Reverse yokogiri': '反手横斩', 'Reverse zwerchhau': '反手横劈',
  // The weapon arts (weaponarts.js ARTS.labels, artdrama.js ARTDRAMA.titles, and the names made from art keys).
  'Iai': '居合', 'Knaufschlag': '柄头击', 'Pommel': '柄头击', 'Drawing cut': '拖斩', 'Draw cut': '拖斩', 'Wheel cut': '车轮斩',
  'Wheel': '车轮斩', 'Crushing blow': '碎甲重击', 'Crush': '碎甲', 'Flèche': '飞刺', 'Art fleche': '飞刺', 'Slam': '猛砸',
  'Art slam': '猛砸', 'Art overhand': '过顶重劈', 'Art roundhouse': '回旋重踢', 'Mordhau': '倒剑锤击', 'Half-sword': '半剑刺',
  'Wrist cut': '斩腕', 'Backhand whirl': '反手回旋斩', 'Leg sweep': '扫腿', 'Cleave': '开山劈', 'Cleaving chop': '开山劈',
  'Beak': '鸦喙啄', 'Hook and pull': '钩拽', 'Grapple and stab': '擒而刺之', 'Art grapple': '擒而刺之', 'Hip throw': '腰摔',
  'Art hip throw': '腰摔', 'Bash and cut': '盾撞接砍', 'Bash and thrust': '盾撞接刺', 'Weapon art': '绝技', 'Art': '绝技',
  // The grenades (weapons.js THROWABLES).
  'Frag': '破片雷', 'Flashbang': '闪光弹',
};
