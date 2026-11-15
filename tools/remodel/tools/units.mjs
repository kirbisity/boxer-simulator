// The featured units: each a list of columns (inputs) to show side by side, and which column is the close-up.
import { readFileSync } from 'node:fs';
export function units(castsFile) {
  const C = JSON.parse(readFileSync(castsFile));
  const all = [...C.qiJiguang.red, ...C.qiJiguang.blue, ...C.agincourt.red, ...C.agincourt.blue, ...C.cajamarca.red, ...C.cajamarca.blue, ...C.sarhu.red, ...C.sarhu.blue, ...C.storySarhu];
  const pick = (kind, design, style, mounted) => {
    const m = all.find((x) => x.outfit?.kind === kind && (design == null || x.outfit.design === design) && (style == null || x.style === style) && (mounted == null || Boolean(x.mounted) === mounted));
    if (!m) throw new Error(`no ${kind} d${design} ${style}`);
    const c = structuredClone(m); delete c.__corner; return c;
  };
  // The same man in another design or with another weapon (so only the kit differs across the columns).
  const as = (man, design, style) => ({ ...structuredClone(man), outfit: { ...man.outfit, design }, ...(style ? { style } : {}) });
  const foot = (man) => { const c = structuredClone(man); delete c.mounted; return c; };
  const P = (name) => structuredClone(C['preset:' + name]);
  const U = {};
  const eliteI = pick('mingEliteInfantry', 3, 'swordShield');
  U.mingEliteInfantry = { cols: [eliteI, as(eliteI, 3, 'langxian'), as(eliteI, 3, 'spear'), as(eliteI, 3, 'matchlock')], labels: ['shield+dao', 'langxian', 'spear', 'fowling piece'] };
  const ronin = pick('ronin', 2, 'nito');
  U.ronin = { cols: [ronin, as(ronin, 0), as(ronin, 2, 'ronin')], labels: ['d2 nito', 'd0', 'd2 ronin'] };
  const sam = pick('samurai', 1, 'katana');
  U.samurai = { cols: [sam, as(sam, 3, 'odachi')], labels: ['d1', 'd3 odachi'] };
  const tosei = pick('samuraiTosei', 1, 'katana');
  U.samuraiTosei = { cols: [tosei, as(tosei, 2), as(tosei, 4)], labels: ['d1', 'd2', 'd4'] };
  U.vaelen = { cols: [P('vaelen')], labels: ['Vaelen'] };
  U.forger = { cols: [P('forger'), P('forgerMaren'), P('forgerTobin')], labels: ['forger', 'Maren', 'Tobin'] };
  const knight = pick('knight', 0, 'longsword', false);
  U.knight = { cols: [knight, as(knight, 1), as(knight, 2), as(knight, 3)], labels: ['d0', 'd1', 'd2', 'd3'] };
  const conq = foot(pick('conquistadorPlate', 2, 'espada', false));
  U.conquistadorPlate = { cols: [as(conq, 0), as(conq, 1), conq, as(conq, 4)], labels: ['d0', 'd1', 'd2', 'd4'] };
  const inca = pick('incaNoble', 0, 'champi');
  U.incaNoble = { cols: [inca, as(inca, 1), as(inca, 2), as(inca, 3), as(inca, 4)], labels: ['d0', 'd1', 'd2', 'd3', 'd4 Atahualpa'] };
  const brig = pick('mingBrigandine', 1, 'matchlock');
  U.mingBrigandine = { cols: [as(brig, 0, 'spear'), brig, as(brig, 2)], labels: ['d0', 'd1 gunner', 'd2'], close: 1 };
  U.family = { cols: [C.storyPole[0], C.storyPole[1]], labels: ['brother', 'boy'], builds: false };
  const banner = pick('bannerArmour', 2, 'spear');
  U.bannerArmour = { cols: [banner, as(banner, 4), as(banner, 5), as(banner, 0)], labels: ['d2', 'd4', 'd5', 'd0'] };
  const bay = foot(pick('bayara', 0, 'bayaraLance'));
  U.bayara = { cols: [bay, as(bay, 1), as(bay, 2), as(bay, 4), as(bay, 5)], labels: ['d0', 'd1', 'd2', 'd4', 'd5'] };
  const lam = foot(pick('mingIronLamellar', 1));
  U.mingIronLamellar = { cols: [lam, as(lam, 2)], labels: ['d1', 'd2'] };
  const archer = pick('archer', 0);
  U.archer = { cols: [archer, as(archer, 1), as(archer, 2), as(archer, 3)], labels: ['d0', 'd1', 'd2', 'd3'] };
  const footman = pick('footman', 0, 'longsword');
  U.footman = { cols: [P('dunnottarGuard'), P('dunnottarMatchlock'), as(footman, 1), as(footman, 2), as(footman, 3)], labels: ['guard d0', 'matchlock d4', 'd1', 'd2', 'd3'] };
  U.levy = { cols: [P('dunnottarSoldier')], labels: ['levy d0'] };
  const wk = pick('wokou', 0);
  U.wokou = { cols: [wk, as(wk, 1), as(wk, 4), as(wk, 5), as(wk, 6)], labels: ['d0', 'd1', 'd4', 'd5', 'd6'] };
  const wka = pick('wokouArmoured', 0);
  U.wokouArmoured = { cols: [wka, as(wka, 1), as(wka, 2), as(wka, 3)], labels: ['d0', 'd1', 'd2', 'd3'] };
  const uncu = pick('incaUncu', 0, 'champi');
  U.incaUncu = { cols: [uncu, as(uncu, 1), as(uncu, 2), as(uncu, 3), as(uncu, 4)], labels: ['d0', 'd1', 'd2', 'd3', 'd4'] };
  const gar = pick('mingGarrison', 0, 'dao');
  U.mingGarrison = { cols: [gar, as(gar, 1), as(gar, 3), as(gar, 4)], labels: ['d0', 'd1', 'd3', 'd4'] };
  // Mounted men, as cast.
  U.mounted = { cols: [pick('bayara', 0, 'bayaraLance', true), pick('mingIronLamellar', 1, null, true), pick('conquistadorPlate', 1, 'lance', true), pick('knight', 1, 'lance', true)], labels: ['bayara', 'iron lamellar', 'conquistador', 'knight'], builds: false, wide: true };
  return U;
}
