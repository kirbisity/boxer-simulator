// Level mode's chrome and its toasts made of parts, by key: { en, zh } (src/i18n/ui.js). The fixed words its data and logic say
// (door labels, prompts, places, people) are in names-level.js, put into the language at the screen.
export const UI_LEVEL = {
  // The HUD (levelmode/hud.js).
  'level.bandage': { en: 'Bandage', zh: '绷带' },
  'level.tonic': { en: 'Tonic', zh: '药剂' },
  'level.yourKit': { en: 'Your kit', zh: '你的装备' },
  'level.tapToClose': { en: 'Tap to close', zh: '轻触关闭' },
  // The boss's fall (levelmode/cutsceneview.js): the title card's word after his name, and the hint.
  'level.felled': { en: 'FELLED', zh: '伏诛' },
  'level.tapToSkip': { en: 'Tap to skip', zh: '轻触跳过' },
  'level.theBoss': { en: 'The boss', zh: '首领' },
  // Toasts with a name or a number in them (items.js, loot.js, team.js).
  'level.actionInterrupted': { en: '{action} interrupted', zh: '{action}被打断' },
  'level.cannotUse.bandage': { en: 'Cannot use bandage: {reason}', zh: '用不了绷带：{reason}' },
  'level.cannotUse.tonic': { en: 'Cannot use tonic: {reason}', zh: '用不了药剂：{reason}' },
  'level.carryNoMore.bandage': { en: 'You cannot carry more bandages', zh: '绷带带不下了' },
  'level.carryNoMore.tonic': { en: 'You cannot carry more tonics', zh: '药剂带不下了' },
  'level.taken.bandage': { en: 'Bandage taken ({count})', zh: '拿到绷带（{count}）' },
  'level.taken.tonic': { en: 'Tonic taken ({count})', zh: '拿到药剂（{count}）' },
  'level.putOn': { en: 'You put on the {outfit}', zh: '你换上了{outfit}' },
  'level.comradeFallen': { en: '{name} has fallen', zh: '{name}倒下了' },
  'level.comradeStruck': { en: '{name}: "Watch it!"', zh: '{name}：“看着点！”' },
  // The sandbox's run (levelmode/sandbox.js badge).
  'level.sandboxRun': { en: 'Sandbox run', zh: '沙盒试跑' },
  'level.fastTravelUsed': { en: 'fast travel used', zh: '用过快速移动' },
};
