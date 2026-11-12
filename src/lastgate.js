// Last Stand Squad (was The Last Gate): a quick score mode. A hero and the squad the player picked (squad.js: bought out of
// a budget of points) stand in formation before a castle's gate (placed by hand: musterview.js), and the enemy comes out of
// the fog in waves: a "Wave N" banner, the wave's few men (more each wave, slowly), the wave cleared, a breather, the next.
// The score is how many the squad kills (the hero's own counted apart), how many waves it survives and how long it lasts;
// the run ends when the hero falls (or all the squad with him). The gate is the ground's backdrop now, not a thing to lose:
// a foe goes for the nearest of the squad, not through the gateway.
// Four levels (LAST_GATE_MODES), each its own people, its own champion and its own ladder of foes:
// - 1 Japan, The Rice Riot: a samurai in tōsei gusoku with the ōdachi; the ikki climbs from starved peasants to ashigaru,
//   rōnin, sōhei (warrior monks) and samurai;
// - 2 Europe, The Jacquerie: a knight in full plate on his destrier with the lance (it breaks only on heavy armour:
//   weapons.js `shatters`; here it is kept, couched again and again); from the starved to the rebel peasant, the spear
//   footman, the man-at-arms, the knight and the hammer knight;
// - 3 China, The Red Turbans: a Mongol horse archer in iron lamellar with the composite bow, his arrows kept up from the
//   gate's stores (never out of them), the mace for close work; from the starved to the Ming garrison (spear, dao), the
//   brigandine men (spear, sword and shield) and, at the very end, the elite;
// - 4 Night Shift: a special police officer (SWAT) with the AR-15 and its magazines (empty, the baton), against an army of
//   service androids (the humanoid robot, not the combat bot) that never tire, never bleed and never fear.
// No foe in any level carries a bow, a crossbow or a gun (lastGateFoe: a shooter's style is put down for a spear).
//
// Nothing here makes a foe weak or a hero strong but their bodies and kit: the rebels begin as cast.js starvedRebel's men
// (starved to a BMI of 14–15.5, which takes their strength and wind: body.js, physiology.js), bare-handed; each wave climbs
// its level's `ladder` of foes (LAST_GATE_FOES), rung by rung, each man as hard as his build, his drill and his kit make
// him, nothing added. The horde never breaks: they have nothing left to lose (their kit's `courage` set to 1, the same path
// as a machine's fearlessness: ai.js fearTarget). A level's difficulty is all in its foes (`waves`, `ladder`): how many in
// a wave and at once (few, and growing slowly: fewer but tougher), who they are, how fast they walk and run.
//
// The horde is shown without its cost: a fixed pool of foes (the world's fighter list never grows), the wave's few awake,
// the rest dormant (as a level's sleeping men are) and woken one by one just inside the mist, fresh (physics.js
// reviveFighter) as the wave needs them; the fallen are cleared after a while.
//
// The world's own AI fights; this module only walks each foe at the nearest of the squad until he is near enough to fight
// (`driven`, as level mode's awareness walks its men), and keeps the squad at its places while no foe is near and no order
// of the player's stands (command.js orders govern otherwise; its Formation order, `form`, sends every man back to his
// place here, world.formPlaces, and holds him there); a rider is kept at his by his horse's reins (its goal).
// No DOM here: main.js and lastgateview.js draw it.

import { normaliseInputs, P, PRESETS } from './body.js';
import { englishManAtArms, footSoldier, frenchKnight, mingSoldier, rebel, roninWarrior, sengokuWarrior, soheiMonk, starvedRebel, steppeWarrior, swatOfficer } from './cast.js';
import { STYLES } from './moves.js';
import { createWorld, inFight, placeOnFloor, reviveFighter, seededRandom } from './physics.js';
import { placeMounted } from './physics/mounted.js';
import { t, tname } from './i18n.js';

export const LAST_GATE = {
  title: 'Last Stand Squad',
  // The place drawn round it (render.js `lastgate`, ground/painted.js): trodden wet earth, the gate's worn cobbles, puddles; closed in by woods (the works below).
  place: 'lastgate',
  // The floor: the field before the gate from x = gate.x to +halfX, a courtyard behind it.
  arena: { halfX: 18, halfZ: 10.5 },
  // A grey dawn mist (render.js applyWeather): clear to 3 m from the camera, gone by 26, cold blue-grey (`colour`); the sky the fog's, the sun weak through it.
  // Set against the spawn line: a foe is woken some 28–32 m from a camera behind the gate, past the fog's far edge.
  weather: { fog: [3, 26], sky: 0.85, colour: 0x8e99a3, sun: 0.7 },
  // The gate: its line at x (the wall along z), open |z| < halfWidth (a gateway a cart goes through, ~5 m). The squad's back to it.
  gate: { x: -12, halfWidth: 2.5, wallHeight: 3.2, towerHeight: 5.2 },
  // Where the squad may be placed (musterview.js, lastgate's zone): `ahead` m in front of the gate's line, `edge` m short of the woods.
  zone: { ahead: [0.6, 9], edge: 0.6 },
  // The men the hero brings when no squad is given (the headless runs, the old default).
  companionsMax: 5,
  // Every hero trained to this (body.js skill: a kit's men 0.2–0.5, the legends 1): the higher tier the player starts as.
  heroSkill: 0.9,
  // Default places, [m in front of the gate's line, m across]: the hero in the middle of the gateway, his men either side of him
  // and along the wall's foot (none behind him: the camera looks over his shoulder from there). A rider's further out
  // (`rider`): out before his men, room to turn his horse, and the camera behind him still in front of the wall.
  posts: { hero: [2.4, 0], rider: [8, 0], companions: [[2.2, -1.5], [2.2, 1.5], [1.7, -3.1], [1.7, 3.1], [1.2, -4.5], [1.2, 4.5], [0.9, -6]] },
  // The pool of foes (the fighter list's fixed share) and the most of them awake and on their feet at once.
  pool: 24,
  liveCap: 18,
  // Where foes are woken: x (the mist's far side for the camera), z within ±spread; the dormant are parked behind it.
  spawn: { x: 13, spread: 8, parkX: 16.5 },
  // s a fallen foe lies before he is cleared (his slot free to wake again); at least `clearSoonest` s when the pool is short.
  clearAfter: 8,
  clearSoonest: 2,
  // A foe walking at the squad turns to fight a man within `engage` m, and walks on when none is within `release` m.
  engage: 2.8,
  release: 4.5,
  // The squad's places: a man goes to fight a foe within `guard` m of his place; with none, back to it (`home` m is there).
  // A rider goes out to one within `rideGuard` m (his charge needs its run-up); a bow or a gun shoots at one within
  // `shootGuard` m (out to the mist's edge: what he can see to hit).
  guard: 5.5,
  rideGuard: 9,
  shootGuard: 20,
  home: 0.8,
  // Under the Formation order: a man fights only a foe within `reach` m of him while he is within `leash` m of his place;
  // otherwise back to it, at a run from `runFrom` m.
  form: { reach: 2.4, leash: 1.5, runFrom: 3 },
  // A rider rides at the foe nearest to the squad's line (lgGateThreat): his distance from it, and `across` m for every metre
  // he is out beyond the gateway's side; his man kept unless another is `switch` m nearer. Those within `room` m are left to his men on foot.
  threat: { across: 0.5, switch: 4, room: 6 },
  // A rider back to his post at his horse's trot, there within `within` m (a horse is not stopped on a coin), and stood facing the mist.
  rideHome: { within: 2 },
  // The waves' rhythm (s): before the first, a moment to take it in (`opening`); between waves a breather (`breather`), the
  // "Wave N" banner at its end; a wave whose last men will not come on (crawling, lost) is given up after `stall` s.
  opening: 3,
  breather: 6,
  stall: 75,
  // Rain standing in the field's hollows, [x, z, half-length, half-width] (m): shallow puddles (soft ground with water over it: physics/fieldworks.js),
  // drawn as Dunnottar's water is (levelmode/kitwater.js 'puddle', rung by feet and splashed), heard as a splash, reddened by the blood that falls in.
  // A few in the gateway's mouth, where the fighting is; more out across the field.
  puddles: [
    [-8.6, 0.7, 1.6, 0.9], [-9.8, -4.6, 1.3, 0.75], [-9.4, 5.6, 1.2, 0.7], [-6.0, -2.6, 1.1, 0.7], [-4.2, 2.2, 1.8, 1.0], [-1.6, -0.9, 1.3, 0.8],
    [-3.2, -6.6, 1.6, 0.9], [1.2, 3.8, 1.5, 0.9], [2.8, -4.3, 2.0, 1.1], [5.4, 0.5, 1.4, 0.8], [4.4, 7.1, 1.8, 0.9], [8.2, -1.9, 1.7, 1.0], [10.6, 4.6, 2.2, 1.2],
  ],
  // A puddle's ground: a few cm of rain over a firm bed (sinkage `depth`, firm `firm`, m), water's viscosity, wet clay's grip (`footing`, of a dry foot's).
  puddleGround: { depth: 0.02, firm: 0.05, viscosity: 1, footing: 0.8, water: 0.035 },
  // A man of the horde has nothing left to lose: his kit's courage (outfits.js gearTraits `outfit.courage`; 1 is a machine's: no fear at all).
  desperate: 1,
  // A foe who would come with a bow, a crossbow or a gun comes with this instead (none of the ladders has one: a guard).
  melee: 'spear',
};

/**
 * A wave's figure: [at wave 1, more each wave up to `steepFrom`, more each wave after it, least, most]. The early slope keeps
 * the first waves short; the late one, steeper, makes the waves after it the end of most runs.
 */
export function lgRamp([first, early, late, low = -Infinity, high = Infinity], wave, steepFrom) {
  const value = first + early * (Math.min(wave, steepFrom) - 1) + late * Math.max(0, wave - steepFrom);
  return Math.max(low, Math.min(high, value));
}

// The colours of the samurai's men (a lord's red lacing, his banner).
const LG_SAMURAI_SIDE = { tint: { armor: '#24242a', lace: '#8a1418' }, banner: '#8a1418' };
// The police hero's team, by place: a breacher with the shotgun, a man with the pistol, three with the baton.
const LG_TEAM = ['shotgun', 'handgun', 'baton', 'baton', 'baton'];

// The starved of each land: their names (a first and a second) and looks; a starved man's spear (the Japanese yari).
const LG_PEOPLE = {
  japanese: {
    names: [['Gonbei', 'Tasuke', 'Yosaku', 'Hachibei', 'Jinbei', 'Mohei', 'Sukeroku', 'Kyūbei', 'Genta', 'Heiji', 'Magoroku', 'Sakubei'], ['of Ōmi', 'of Kaga', 'of Yamashiro', 'of Mino', 'of Owari', 'of Settsu', 'of Kawachi', 'of Iga']],
    look: { skinTone: ['lightTan', 'lightTan', 'medium'], hairColor: ['#120d0a', '#1a120c'] },
    spear: 'yari',
  },
  chinese: {
    names: [['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Zhu', 'Han', 'Xu', 'Guo', 'Peng'], ['Laosan', 'Erlang', 'Xiaoliu', 'Dagou', 'Shuanzhu', 'Tiezhu', 'Goudan', 'Laowu']],
    look: { skinTone: ['lightTan', 'lightTan', 'medium'], hairColor: ['#120d0a', '#1a120c'] },
    spear: 'spear',
  },
};

/**
 * The four levels. The card's words: `level` (its number), `region`, `title` (the scenario), `label` (the hero), his `weapon`
 * and `strength`, `blurb`, and his foes (`foe`, `foes`, how they go down: `felled`). The hero (`hero()`: his preset in his
 * kit, trained to LAST_GATE.heroSkill), the men the squad builder offers first (`factions`, squad.js) and buys first
 * (`soldier`, a roster key), and his men when no squad is given (`companion(random, index)`). The horde: `people` (the
 * starved of its land), `enemy(random, kind)` makes a foe of a kind (LAST_GATE_FOES); `ladder` the kinds from the weakest to
 * the best (`rungs`) and how far up them wave w has climbed (`climb`, an lgRamp of the rung: at 2.4, 60% of those woken are
 * of rung 2 and 40% of rung 3: lastGateRebelKind); and `waves`: wave w brings `count` foes in all, keeps at most `alive` of
 * them on the field (at most LAST_GATE.liveCap), wakes one every `every` s while short, walks them at `pace` of a full walk,
 * `run` of them running, trained to `skill` (the androids only: a man's skill is his own, his rung's); each an lgRamp,
 * steeper from wave `steepFrom` on.
 */
export const LAST_GATE_MODES = {
  samurai: {
    level: 1, region: 'Japan',
    title: 'The Rice Riot', label: 'Samurai', glyph: '⛩️', weapon: 'Ōdachi', foe: 'rebel', foes: 'rebels', felled: 'cut down',
    strength: { en: 'Tōsei gusoku and the longest blade: cuts them down before they close.', zh: '一身当世具足，一口最长的刀：人还没扑到跟前，就已经倒下了。' },
    blurb: { en: 'A famine ikki: starving peasants at the castle gate, then the ashigaru, rōnin, warrior monks and samurai who join them.', zh: '饥荒逼出来的一揆：饿红了眼的农民堵在城门口，后头跟上来的，是足轻、浪人、僧兵，还有倒戈的武士。' },
    factions: ['japanese'], soldier: 'ashigaruSpear', people: LG_PEOPLE.japanese,
    // Makara Naotaka in the later armour of the Sengoku (outfits.js samuraiTosei: the riveted steel cuirass, the menpo, its
    // crest), the ōdachi in both hands.
    hero: () => ({ ...structuredClone(PRESETS.odachi), outfit: { kind: 'samuraiTosei', design: 0 }, accessories: ['crest'], skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? sengokuWarrior(random, LG_SAMURAI_SIDE, 'katana', 'samurai') : sengokuWarrior(random, LG_SAMURAI_SIDE, 'spear', 'ashigaru')),
    // The ikki up the Japanese ladder: the starved bare-handed, with a staff, with a yari in his rags; the ashigaru with the
    // yari (okegawa-dō, jingasa); the rōnin (katana, or both swords); the sōhei with the naginata; the samurai with the katana
    // in ō-yoroi or tōsei gusoku (a lifetime's training): the jizamurai and the temples' monks who led the risings.
    ladder: { rungs: ['unarmed', 'staff', 'ragSpear', 'ashigaru', 'ronin', 'sohei', 'samurai'], climb: [0, 0.5, 0.75, 0, 6] },
    waves: {
      steepFrom: 4,
      // 3 in the first wave, one more each wave, then one and a half: fewer, each harder (the ladder).
      count: [3, 1, 1.5, 1, 30],
      // On the field at once: 3, then 4 by wave 3, one more every two waves after, 8 at most.
      alive: [3, 0.4, 0.5, 2, 8],
      // One woken every 2.5 s at first, quicker each wave.
      every: [2.5, -0.2, -0.25, 0.8, 4],
      // Near a full walk from the first (a quick score mode: no long wait for them), a few running from the first, half by wave 6.
      pace: [0.85, 0.04, 0.06, 0, 1],
      run: [0.12, 0.06, 0.15, 0, 0.9],
    },
  },
  knight: {
    level: 2, region: 'Europe',
    title: 'The Jacquerie', label: 'Knight', glyph: '🛡️', weapon: 'Lance', foe: 'rebel', foes: 'rebels', felled: 'ridden down',
    strength: { en: 'Full plate on a destrier: the lance runs them through and is couched again.', zh: '全身板甲，胯下战马：一枪捅穿，夹回腋下，再冲。' },
    blurb: { en: '1358: the peasants of the Beauvaisis rise against their lords; footmen, men-at-arms and knights of the free companies join them.', zh: '一三五八年，博韦地区的农民造了老爷们的反；自由佣兵团的步卒、重甲兵和骑士，也趁乱入了伙。' },
    factions: ['knights'], soldier: 'footSpear',
    // On his destrier in its steel bard (his kit's), the lance couched; were it broken (on heavy armour only), the mace.
    hero: () => ({ ...structuredClone(PRESETS.knight), style: 'lance', mounted: true, sidearm: 'mace', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => (index < 2 ? englishManAtArms(random, index === 0 ? 'longsword' : 'warhammer') : footSoldier(random, 'spear')),
    // The Jacquerie up the European ladder: the starved bare-handed, with a staff; the rebel peasant with his hay fork, fed and
    // hard (cast.js rebel); the levy's spear in a quilted jack; the spear footman (the roster's: a soldier's build and drill);
    // the man-at-arms with the long sword in brigandine or mail; the knight in full plate with the long sword, then with the
    // war hammer (French knights, built as they were): Guillaume Cale had the free companies' men among his.
    ladder: { rungs: ['unarmed', 'staff', 'peasant', 'spear', 'footman', 'manAtArms', 'knight', 'hammerKnight'], climb: [0.3, 0.6, 0.85, 0, 7] },
    waves: {
      steepFrom: 4,
      // A few more than the samurai's (a rider cannot be everywhere).
      count: [3, 1, 1.5, 1, 30],
      alive: [3, 0.5, 0.5, 2, 9],
      every: [2.4, -0.2, -0.25, 0.8, 4],
      pace: [0.85, 0.04, 0.06, 0, 1],
      run: [0.12, 0.06, 0.12, 0, 0.85],
    },
  },
  mongol: {
    level: 3, region: 'China',
    title: 'The Red Turbans', label: 'Mongol archer', glyph: '🏹', weapon: 'Composite bow', foe: 'rebel', foes: 'rebels', felled: 'shot down',
    strength: { en: 'Iron lamellar on a steppe horse: arrows from the saddle, never short of them; the mace up close.', zh: '铁札甲，草原马：马背上放箭，箭壶永远是满的；贴身了，就抡骨朵。' },
    blurb: { en: '1351: famine and the Yellow River\'s flood raise the Red Turbans against the Yuan; their armies grow into soldiers.', zh: '一三五一年，饥荒加上黄河决口，红巾军起来反元；一帮饥民，越打越像兵。' },
    // His own steppe guard and the Han soldiers of the Yuan's garrisons.
    factions: ['chinese', 'steppe'], soldier: 'mingBrigSpear', people: LG_PEOPLE.chinese,
    // A horse archer of the Yuan's guard in iron lamellar to the knees, cut as the Mongols wore it (outfits.js
    // mingIronLamellar: the mongolIron coat, the spiked helmet with its lamellar aventail), on his steppe horse; the composite
    // bow, his quiver kept full from the gate's stores behind him (`endlessAmmo`: outfits.js gearTraits), and the mace
    // (STYLES.kheshigBow's fallback) for close work.
    hero: () => ({ ...structuredClone(PRESETS.kheshig), name: 'Jebe', style: 'kheshigBow', outfit: { kind: 'mingIronLamellar', design: 0 }, mounted: true, sidearm: 'mace', endlessAmmo: true, skill: LAST_GATE.heroSkill }),
    // His men on foot at the gate: two archers (shooting over him, then the sabre), one with sabre and shield, two with the mace.
    companion: (random, index) => steppeWarrior(random, index < 2 ? 'steppeBow' : index === 2 ? 'saberShield' : 'maceShield', 'medium'),
    // The Red Turbans up the Chinese ladder (the armies they became were the Ming's): the starved bare-handed, with a staff,
    // with a spear in his rags; the garrison man in his padded coat with the spear, then with the dao; the brigandine man in
    // his iron hat with the spear, then with the sabre and round shield; the elite with the guandao in the long coat, last.
    ladder: { rungs: ['unarmed', 'staff', 'ragSpear', 'mingGarrison', 'mingGarrisonDao', 'mingBrigandine', 'mingShield', 'mingElite'], climb: [0.2, 0.6, 0.85, 0, 7] },
    waves: {
      steepFrom: 4,
      // Rebels who come on fast at men who shoot them (`run`).
      count: [3, 1, 1.5, 1, 30],
      alive: [3, 0.4, 0.5, 2, 8],
      every: [2.5, -0.2, -0.25, 0.8, 4],
      pace: [0.85, 0.04, 0.06, 0, 1],
      // Running at him from the start (a man shot at runs), most of them by wave 6.
      run: [0.2, 0.08, 0.15, 0, 0.95],
    },
  },
  police: {
    level: 4, region: 'The depot',
    title: 'Night Shift', label: 'SWAT officer', glyph: '🚓', weapon: 'AR-15', foe: 'android', foes: 'androids', felled: 'taken down',
    strength: { en: 'A SWAT harness and the rifle\'s magazines; then the baton.', zh: '特警的全套护具，步枪弹匣管够；打空了，还有警棍。' },
    blurb: { en: 'Special police at the depot gate: its service androids walk out of the fog, and keep coming.', zh: '特警守在仓库大门口：雾里走出来一排服务型仿生人，没完没了。' },
    factions: ['law'], soldier: 'baton',
    // A SWAT officer (the team's heavy riot kit) with the AR-15 and its magazines (weapons.js RIFLE ammo), the baton at his belt.
    hero: () => ({ ...structuredClone(PRESETS.handgun), style: 'rifle', sidearm: 'baton', skill: LAST_GATE.heroSkill }),
    companion: (random, index) => ({ ...swatOfficer(random, LG_TEAM[index] ?? 'baton'), sidearm: 'baton' }),
    enemy: (random) => lastGateAndroid(random),
    // One kind: the depot's androids, all alike (they get better by `skill`: they learn).
    ladder: { rungs: ['android'], climb: [0, 0, 0, 0, 0] },
    waves: {
      steepFrom: 4,
      // Machines that never tire: a few at first (each takes several rounds), then the depot empties.
      count: [3, 1.5, 2.5, 1, 40],
      alive: [2, 0.8, 1, 2, 12],
      every: [3, -0.4, -0.4, 0.6, 4],
      // A steady walk from the first (no hunger in them); they run (a machine's sprint) from wave 4.
      pace: [0.8, 0.05, 0.1, 0, 1],
      run: [0, 0.05, 0.22, 0, 0.9],
      // Their fighting routines (the kickboxing they were shown) better each wave after the fourth: they learn.
      skill: [0.4, 0, 0.08, 0, 0.8],
    },
  },
};
export const LAST_GATE_MODE_KEYS = Object.keys(LAST_GATE_MODES);
// (The modes by their heroes, as the menu and the board name them.)
export const LAST_GATE_HEROES = LAST_GATE_MODES;
export const LAST_GATE_HERO_KEYS = LAST_GATE_MODE_KEYS;

const lgMode = (key) => LAST_GATE_MODES[key] ?? LAST_GATE_MODES.samurai;

/** A level's figure for this wave (`knob`: count, alive, every, pace, run, skill; null if the level leaves it to its foes). */
export function lastGateWaveValue(mode, knob, wave) {
  const waves = lgMode(mode).waves;
  return waves[knob] ? lgRamp(waves[knob], wave, waves.steepFrom) : null;
}

/** How many foes wave `wave` of a level brings in all, and how many of them at most on the field at once. */
export function lastGateWaveSize(mode, wave) {
  const count = Math.round(lastGateWaveValue(mode, 'count', wave));
  const alive = Math.min(LAST_GATE.liveCap, count, Math.round(lastGateWaveValue(mode, 'alive', wave)));
  return { count, alive };
}

/**
 * A rebel of the horde: a starving man (cast.js starvedRebel) with bare hands (`unarmed`), a staff, a spear in his rags
 * (`ragSpear`: his people's spear) or a spear in a quilted jack and kettle hat (`spear`, the European levy's kit: a little
 * armour); a man of `people` (LG_PEOPLE) named and looking as his land's; whatever he wears, his courage is a desperate man's.
 */
export function lastGateRebel(random, kind = 'unarmed', people = null) {
  let man = starvedRebel(random);
  if (people) {
    const pick = (list) => list[Math.floor(random() * list.length)];
    man = { ...man, name: `${pick(people.names[0])} ${pick(people.names[1])}`, look: { ...man.look, ...Object.fromEntries(Object.entries(people.look).map(([key, list]) => [key, pick(list)])) } };
  }
  if (kind === 'spear') {
    return normaliseInputs({ ...man, style: 'spear', outfit: { kind: 'levy', design: random() < 0.5 ? 0 : 1, courage: LAST_GATE.desperate }, accessories: [] });
  }
  const style = kind === 'staff' ? 'staff' : kind === 'ragSpear' ? (people?.spear ?? 'spear') : 'unskilled';
  return normaliseInputs({ ...man, style, outfit: { ...man.outfit, courage: LAST_GATE.desperate } });
}

// The rebels' colours: none of a lord's (their soldiers' kits in their own plain designs, no banner on the back).
const LG_REBEL_SIDE = { tint: null, banner: null };

/**
 * The horde's men, by kind (a level's `ladder` rungs): each a man of the cast (cast.js) as his kind are built, drilled and
 * kitted, nothing changed but his desperation (lastGateFoe). The starved first (lastGateRebel), then each land's soldiers.
 * `faction` the roster faction each is of (the starved are everyone's: `null`); none has a bow, a crossbow or a gun.
 */
export const LAST_GATE_FOES = {
  // The starved (cast.js starvedRebel, BMI 14–15.5, skill 0.05–0.2): bare hands; a staff; a spear in his rags; a spear in a quilted jack and kettle hat.
  unarmed: (random, people) => lastGateRebel(random, 'unarmed', people),
  staff: (random, people) => lastGateRebel(random, 'staff', people),
  ragSpear: (random, people) => lastGateRebel(random, 'ragSpear', people),
  spear: (random, people) => lastGateRebel(random, 'spear', people),
  // Japanese (cast.js): an ashigaru with the yari in okegawa-dō and jingasa; a rōnin with the katana (or both swords) in odd
  // pieces of armour, who comes on at a run; a sōhei with the naginata in kesa and hood; a samurai with the katana in ō-yoroi or tōsei gusoku.
  ashigaru: (random) => sengokuWarrior(random, LG_REBEL_SIDE, 'spear', 'ashigaru'),
  ronin: (random) => roninWarrior(random, 'ronin'),
  sohei: (random) => soheiMonk(random),
  samurai: (random) => sengokuWarrior(random, LG_REBEL_SIDE, 'katana', 'samurai'),
  // European: a rebel peasant with his hay fork (cast.js rebel: fed, not starved); a footman with the spear in whatever armour
  // he has (cast.js footSoldier); a man-at-arms with the long sword in it; a French man-at-arms in full plate with the long
  // sword, or the war hammer (cast.js frenchKnight).
  peasant: (random) => rebel(random),
  footman: (random) => footSoldier(random, 'spear'),
  manAtArms: (random) => footSoldier(random, 'longsword'),
  knight: (random) => frenchKnight(random, 'longsword'),
  hammerKnight: (random) => frenchKnight(random, 'warhammer'),
  // Chinese (cast.js mingSoldier): a garrison man in his padded coat with the spear or the dao; a brigandine man in his iron
  // hat with the spear, or the sabre and round shield; an elite with the guandao in the long coat.
  mingGarrison: (random) => mingSoldier(random, 'spear', 'garrison'),
  mingGarrisonDao: (random) => mingSoldier(random, 'dao', 'garrison'),
  mingBrigandine: (random) => mingSoldier(random, 'spear', 'brigandine'),
  mingShield: (random) => mingSoldier(random, 'swordShield', 'brigandine'),
  mingElite: (random) => mingSoldier(random, 'guandao', 'elite'),
};

/**
 * A man of the horde of this kind (LAST_GATE_FOES; `people` the starved's land), as desperate as the rest: whatever he was,
 * he has thrown in with the rising; and never a shooter (a bow, a crossbow or a gun put down for LAST_GATE.melee).
 */
export function lastGateFoe(random, kind = 'unarmed', people = null) {
  const man = (LAST_GATE_FOES[kind] ?? LAST_GATE_FOES.unarmed)(random, people);
  const style = STYLES[man.style]?.ranged ? LAST_GATE.melee : man.style;
  return normaliseInputs({ ...man, style, outfit: { ...man.outfit, courage: LAST_GATE.desperate } });
}

/** An android of the depot: the humanoid robot (body.js PRESETS.humanoid, not the combat bot), a unit number of its own. */
export function lastGateAndroid(random) {
  return normaliseInputs({ ...structuredClone(PRESETS.humanoid), name: `H-1 Unit ${100 + Math.floor(random() * 900)}` });
}

/** A level's foe of a kind: the androids its own; the rest the ladder's men of its land. */
function lgEnemy(mode, random, kind) {
  const spec = lgMode(mode);
  return spec.enemy ? spec.enemy(random, kind) : lastGateFoe(random, kind, spec.people ?? null);
}

const lgHips = (fighter) => [fighter.x[P.pelvis * 3], fighter.x[P.pelvis * 3 + 2]];
const lgApart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// Where a man stands on the field: his horse's place if he rides, else his hips.
const lgAt = (fighter) => (fighter.mount ? [fighter.mount.at[0], fighter.mount.at[1]] : lgHips(fighter));

/** The ground the squad may be placed on: x from `x[0]` to `x[1]`, z from `z[0]` to `z[1]` (m). */
export function lastGateZone() {
  const { gate, zone, arena } = LAST_GATE;
  return { x: [gate.x + zone.ahead[0], gate.x + zone.ahead[1]], z: [-(arena.halfZ - zone.edge), arena.halfZ - zone.edge] };
}

/** A place brought onto the squad's ground. */
export function intoLastGateZone([x, z]) {
  const zone = lastGateZone();
  return [Math.min(zone.x[1], Math.max(zone.x[0], x)), Math.min(zone.z[1], Math.max(zone.z[0], z))];
}

/** The default places ([x, z]) of a hero and `count` men (LAST_GATE.posts; a rider's further out; any more in a rank behind). */
export function lastGateDefaultPlaces(count, heroRides = false) {
  const gate = LAST_GATE.gate;
  const posts = LAST_GATE.posts;
  const [ahead, across] = heroRides ? posts.rider : posts.hero;
  const places = [[gate.x + ahead, across]];
  for (let index = 0; index < count; index += 1) {
    const post = posts.companions[index] ?? [0.8, (index % 2 ? 1 : -1) * (1 + Math.floor((index - posts.companions.length) / 2)) * 1.5];
    places.push(intoLastGateZone([gate.x + post[0], post[1]]));
  }
  return places;
}

/**
 * A run of Last Stand Squad: the world (the hero id 0, his men, then the foes' pool, all dormant) with its run state in
 * `world.lastGate`. `mode` one of LAST_GATE_MODE_KEYS; `men` the squad's comrades (inputs, squad.js), or, with none given,
 * `companions` (0–5) of the level's own (its `companion`); `places` [x, z] for the hero and each man in order (musterview.js),
 * else the default places; `seed` makes it the same run again.
 */
export function createLastGate(mode, { companions = LAST_GATE.companionsMax, men = null, places = null, seed = 1 } = {}) {
  const key = mode in LAST_GATE_MODES ? mode : 'samurai';
  const spec = lgMode(key);
  const random = seededRandom(seed * 7919 + 17);
  const squad = men ? men.map((inputs) => structuredClone(inputs)) : Array.from({ length: Math.max(0, Math.min(LAST_GATE.companionsMax, companions)) }, (_, index) => spec.companion(random, index));
  const defenders = [normaliseInputs(spec.hero()), ...squad.map((inputs) => normaliseInputs(inputs))];
  // The pool, each slot a man of the ladder's first rung; woken, he is made afresh as his wave's rung (lgWakeRebel).
  const first = spec.ladder.rungs[0];
  const foes = Array.from({ length: LAST_GATE.pool }, () => lgEnemy(key, random, first));
  const entries = [...defenders.map((inputs) => ({ inputs, corner: 'red' })), ...foes.map((inputs) => ({ inputs, corner: 'blue' }))];
  const world = createWorld(entries, { seed, arena: lastGateArena(), rules: { noStandards: true } });
  const heroRides = Boolean(world.fighters[0].mount);
  const fallback = lastGateDefaultPlaces(squad.length, heroRides);
  const posts = new Map();
  world.fighters.forEach((fighter, index) => {
    if (fighter.corner !== 'red') return;
    const given = places?.[index];
    const post = given && given.every(Number.isFinite) ? intoLastGateZone(given) : fallback[index];
    posts.set(fighter.id, post);
    placeOnFloor(fighter, post[0], post[1], 0, 0);
    if (fighter.mount) placeMounted(fighter, post[0], post[1], 0);
  });
  // The places the Formation order sends the squad back to (command.js).
  world.formPlaces = { red: Object.fromEntries([...posts].map(([id, post]) => [id, post.slice()])) };
  const pool = world.fighters.filter((fighter) => fighter.corner === 'blue').map((fighter) => ({ id: fighter.id }));
  pool.forEach((slot, index) => {
    const fighter = world.fighters[slot.id];
    fighter.dormant = true;
    placeOnFloor(fighter, LAST_GATE.spawn.parkX, ((index % 12) - 5.5) * 1.4, 0, Math.PI);
  });
  world.lastGate = {
    mode: key, hero: key, heroId: 0, companions: squad.length, squad: defenders.length,
    time: 0,
    // The wave now (the next, in a breather), its part ('breather' or 'fight'), when the breather ends, how many of the wave
    // are woken so far and when the last was; how many waves the squad has cleared.
    wave: 1, phase: 'breather', breatherUntil: LAST_GATE.opening, spawned: 0, lastSpawn: 0, cleared: 0,
    over: null,
    kills: { hero: 0, squad: 0, total: 0 },
    pool, posts, random,
    nextWake: 0, eventCursor: 0,
    lastHitBy: new Map(), downAt: new Map(), drive: new Map(),
    peak: { awake: 0, rebels: 0 },
    // For the page: fighters whose bodies were made new (their models to build again), and what to tell the player.
    rebuilds: [], news: [],
  };
  lgCountAwake(world);
  return world;
}

/** The floor with its works: the gate's stone wall across it (open at the gateway), woods closing the field in on either hand. */
export function lastGateArena() {
  const { halfX, halfZ } = LAST_GATE.arena;
  const gate = LAST_GATE.gate;
  return {
    halfX, halfZ,
    // A rider's field (physics/mounted.js steerInside): before the wall, between the woods; not the courtyard behind it.
    // Turned off its edges `edge` m ahead (the open field's 6 is most of this one): the wall and the woods are seen in time.
    ride: { x: [gate.x, halfX], z: [-(halfZ - 0.3), halfZ - 0.3], edge: 3 },
    works: {
      walls: [
        { points: [[gate.x, -halfZ - 0.5], [gate.x, halfZ + 0.5]], height: gate.wallHeight, kind: 'stone', gaps: [[halfZ + 0.5 - gate.halfWidth, halfZ + 0.5 + gate.halfWidth]] },
        ...[1, -1].map((sign) => ({ points: [[gate.x + 0.5, sign * (halfZ - 0.3)], [halfX + 6, sign * (halfZ - 0.3)]], height: 6, kind: 'wood' })),
      ],
      // The puddles: soft ground under rain water, ellipses (`bare`: the painted ground draws the earth round them; only the water is drawn here).
      soft: LAST_GATE.puddles.map(([x, z, rx, rz]) => ({ ...LAST_GATE.puddleGround, x: [x - rx, x + rx], z: [z - rz, z + rz], shape: 'ellipse', murk: 'puddle', bare: true, surface: 'mud', edge: Math.min(rx, rz) * 0.5 })),
      // Drawn only (worksview.js): the gatehouse's towers either side of the gateway, its arch and its doors standing open.
      gatehouse: { x: gate.x, halfWidth: gate.halfWidth, height: gate.towerHeight, wall: gate.wallHeight },
    },
  };
}

/** How far up its ladder this level's wave has climbed (a rung, fractional: 2.4 is between rungs 2 and 3). */
export function lastGateRung(wave, mode = 'samurai') {
  const spec = lgMode(mode);
  return lgRamp(spec.ladder.climb, wave, spec.waves.steepFrom);
}

/**
 * The kind of the next foe woken in wave `wave` of this level (`roll` 0–1): the rung below the climb or the one above it,
 * the upper by the climb's fraction (at 2.4, 40% of rung 3).
 */
export function lastGateRebelKind(wave, roll, mode = 'samurai') {
  const rungs = lgMode(mode).ladder.rungs;
  return rungs[Math.max(0, Math.min(rungs.length - 1, Math.floor(lastGateRung(wave, mode) + roll)))];
}

/** Foes awake and not down for good. */
function lgLiveRebels(world) {
  return world.lastGate.pool.filter((slot) => {
    const fighter = world.fighters[slot.id];
    return !fighter.dormant && fighter.state !== 'out';
  });
}

function lgCountAwake(world) {
  let awake = 0;
  let rebels = 0;
  for (const fighter of world.fighters) {
    if (fighter.dormant || fighter.state === 'out') continue;
    awake += 1;
    if (fighter.corner === 'blue') rebels += 1;
  }
  // (physics.js counts only the men awake for the fight's tier, as in a level.)
  world.awake = world.fighters.filter((fighter) => !fighter.dormant).length;
  const run = world.lastGate;
  run.peak.awake = Math.max(run.peak.awake, awake);
  run.peak.rebels = Math.max(run.peak.rebels, rebels);
  return { awake, rebels };
}

/** Wake a dormant slot of the pool just inside the mist as a fresh man of this kind (trained to the wave's skill, where the level sets one); returns him, or null if the pool is spent. */
function lgWakeRebel(world, kind, x = LAST_GATE.spawn.x) {
  const run = world.lastGate;
  const slot = run.pool.find((entry) => world.fighters[entry.id].dormant);
  if (!slot) return null;
  const fighter = world.fighters[slot.id];
  const z = (run.random() * 2 - 1) * LAST_GATE.spawn.spread;
  const wave = run.wave;
  const skill = lastGateWaveValue(run.mode, 'skill', wave);
  const man = lgEnemy(run.mode, run.random, kind);
  const inputs = skill === null ? man : { ...man, skill };
  reviveFighter(world, fighter, inputs, { at: [x + run.random() * 2, 0, z], yaw: Math.PI });
  fighter.dormant = undefined;
  run.lastHitBy.delete(fighter.id);
  run.downAt.delete(fighter.id);
  run.drive.set(fighter.id, { pace: lastGateWaveValue(run.mode, 'pace', wave) * (0.85 + 0.3 * run.random()), running: run.random() < lastGateWaveValue(run.mode, 'run', wave) });
  lgDrive(world, fighter, null);
  run.rebuilds.push(fighter.id);
  return fighter;
}

/** Put a foe to sleep (cleared from the field): not simulated, thought for or drawn. */
function lgSleepRebel(world, fighter) {
  fighter.dormant = true;
  fighter.driven = false;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.running = false;
}

/** Walk him at a man of the squad (`toward`, [x, z]), or, with none, at the gate. */
function lgDrive(world, fighter, toward) {
  const gate = LAST_GATE.gate;
  const way = world.lastGate.drive.get(fighter.id) ?? { pace: lastGateWaveValue(world.lastGate.mode, 'pace', 1), running: false };
  fighter.driven = true;
  fighter.walking = true;
  fighter.goTo = toward ? [toward[0], 0, toward[1]] : [gate.x + 1, 0, 0];
  fighter.move = way.pace;
  fighter.running = way.running;
  fighter.strafe = 0;
}

/** Let the fight AI have him (an enemy near). */
function lgRelease(fighter) {
  if (!fighter.driven) return;
  fighter.driven = false;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.running = false;
}

/** The nearest of `men` to a point, and how far. */
function lgNearestOf(men, at) {
  let best = null;
  let distance = Infinity;
  for (const man of men) {
    const d = lgApart(lgAt(man), at);
    if (d < distance) {
      best = man;
      distance = d;
    }
  }
  return { man: best, distance };
}

/** How far from his place a man goes out to a foe: a rider further (his run-up), a bow or a gun as far as he can see to hit. */
function lgGuardOf(fighter) {
  const style = STYLES[fighter.style];
  const weapon = fighter.weapon;
  if (style?.ranged && weapon?.held && weapon.spec.ranged && !weapon.spent) return LAST_GATE.shootGuard;
  return fighter.mount ? LAST_GATE.rideGuard : LAST_GATE.guard;
}

/**
 * The foe a rider rides at: the one nearest to the squad's line by the gate, the least far from the gate's line (m) plus
 * `across` for every metre he is out beyond the gateway's side. Kept while he is up, unless another is `switch` m nearer to
 * it (a rider who changes his man every moment never runs one down). Null if none is up.
 */
function lgGateThreat(world, fighter, foes) {
  const gate = LAST_GATE.gate;
  const spec = LAST_GATE.threat;
  const far = (foe) => {
    const [x, z] = lgHips(foe);
    return (x - gate.x) + spec.across * Math.max(0, Math.abs(z) - gate.halfWidth);
  };
  let best = null;
  let least = Infinity;
  for (const foe of foes) {
    const d = far(foe);
    // (Those already at the gate are his men's: a horse has no run-up against the wall.)
    if (d < spec.room) continue;
    if (d < least) {
      best = foe;
      least = d;
    }
  }
  const kept = fighter.focus === undefined ? null : world.fighters[fighter.focus];
  if (kept && foes.includes(kept) && far(kept) >= spec.room && far(kept) - least < spec.switch) return kept;
  return best;
}

/** A rider kept at his post by the reins: walked back to it at a trot, then stood facing the mist. */
function lgRideHome(world, fighter, post) {
  const horse = fighter.mount;
  fighter.driven = true;
  fighter.walking = false;
  fighter.goTo = null;
  fighter.move = 0;
  fighter.strafe = 0;
  fighter.running = false;
  const dx = post[0] - horse.at[0];
  const dz = post[1] - horse.at[1];
  const far = Math.hypot(dx, dz);
  horse.goalAt = world.time;
  horse.goal = far > LAST_GATE.rideHome.within ? { heading: Math.atan2(-dz, dx), speed: Math.min(horse.paces.trot, far) } : { heading: 0, speed: 0 };
}

/** A man on foot walked (or run, `running`) back to his place; there, on guard facing the mist. */
function lgWalkHome(fighter, post, running = false) {
  fighter.driven = true;
  fighter.strafe = 0;
  if (lgApart(lgHips(fighter), post) > LAST_GATE.home) {
    fighter.walking = true;
    fighter.goTo = [post[0], 0, post[1]];
    fighter.move = running ? 1 : 0.8;
    fighter.running = running;
  } else {
    fighter.walking = false;
    fighter.goTo = null;
    fighter.move = 0;
    fighter.running = false;
  }
}

/** Who struck each foe last (the events since the last look), to credit his fall to. */
function lgReadEvents(world) {
  const run = world.lastGate;
  const events = world.events;
  for (; run.eventCursor < events.length; run.eventCursor += 1) {
    const event = events[run.eventCursor];
    const struck = world.fighters[event.fighter ?? event.defender];
    const by = world.fighters[event.attacker];
    if (struck && by && struck.corner === 'blue' && by.corner === 'red' && event.attacker !== struck.id) run.lastHitBy.set(struck.id, by.id);
  }
}

/** The waves: a breather ended (the next wave on, its banner), a wave's men woken as it needs them, a wave cleared. */
function lgWaves(world, live) {
  const run = world.lastGate;
  if (run.phase === 'breather') {
    if (run.time < run.breatherUntil) return;
    run.phase = 'fight';
    run.spawned = 0;
    run.lastSpawn = run.time;
    run.nextWake = run.time;
    run.news.push({ kind: 'wave', wave: run.wave });
  }
  const { count, alive } = lastGateWaveSize(run.mode, run.wave);
  // All come and all down (or the last of them given up on): the wave cleared, a breather before the next.
  if (run.spawned >= count && (live === 0 || run.time - run.lastSpawn > LAST_GATE.stall)) {
    run.cleared = run.wave;
    run.news.push({ kind: 'cleared', wave: run.wave });
    run.wave += 1;
    run.phase = 'breather';
    run.breatherUntil = run.time + LAST_GATE.breather;
    return;
  }
  if (run.spawned < count && live < alive && run.time >= run.nextWake) {
    const kind = lastGateRebelKind(run.wave, run.random(), run.mode);
    if (lgWakeRebel(world, kind)) {
      run.spawned += 1;
      run.lastSpawn = run.time;
      run.nextWake = run.time + lastGateWaveValue(run.mode, 'every', run.wave);
    }
  }
}

/**
 * One step of the run, before the AI thinks (main.js thinkForBout; a headless run's think). `playerId`: the man played (his
 * own control, never steered), or null.
 */
export function stepLastGate(world, dt, { playerId = null } = {}) {
  const run = world.lastGate;
  if (!run) return;
  lgReadEvents(world);
  const defenders = world.fighters.filter((fighter) => fighter.corner === 'red');
  const standing = defenders.filter((fighter) => inFight(fighter) && fighter.state === 'up');
  // The fallen: credited (the hero's own, the squad's), and cleared after a while.
  for (const slot of run.pool) {
    const fighter = world.fighters[slot.id];
    if (fighter.dormant) continue;
    if (fighter.state === 'out' && !run.downAt.has(fighter.id)) {
      run.downAt.set(fighter.id, run.time);
      if (!run.over) {
        run.kills.total += 1;
        const by = run.lastHitBy.get(fighter.id);
        if (by === run.heroId) run.kills.hero += 1;
        else run.kills.squad += 1;
      }
      lgRelease(fighter);
    }
  }
  if (!run.over) {
    run.time += dt;
    const hero = world.fighters[run.heroId];
    if (hero.state === 'out' || hero.fled) run.over = { how: 'fallen', time: run.time };
    else if (!defenders.some((fighter) => inFight(fighter))) run.over = { how: 'overrun', time: run.time };
    if (run.over) run.news.push({ kind: 'over', how: run.over.how });
    else lgWaves(world, lgLiveRebels(world).length);
  }
  // Cleared: the long fallen, and (the pool short) the longest fallen sooner.
  const live = lgLiveRebels(world).length;
  const short = !run.pool.some((slot) => world.fighters[slot.id].dormant);
  let oldest = null;
  for (const [id, at] of run.downAt) {
    const fighter = world.fighters[id];
    if (fighter.dormant) continue;
    if (run.time - at >= LAST_GATE.clearAfter) lgSleepRebel(world, fighter);
    else if (short && run.time - at >= LAST_GATE.clearSoonest && (!oldest || at < run.downAt.get(oldest.id))) oldest = fighter;
  }
  if (oldest && live < lastGateWaveSize(run.mode, run.wave).alive) lgSleepRebel(world, oldest);
  // The foes: at the nearest of the squad on foot (a rider is not chased round the field: he rides at them), or at the man in their way.
  const onFoot = standing.filter((fighter) => !fighter.mount);
  for (const slot of run.pool) {
    const fighter = world.fighters[slot.id];
    if (fighter.dormant || fighter.state === 'out') continue;
    if (fighter.state !== 'up') {
      lgRelease(fighter);
      continue;
    }
    const at = lgHips(fighter);
    const { distance } = lgNearestOf(standing, at);
    const { man } = lgNearestOf(onFoot.length ? onFoot : standing, at);
    if (distance < LAST_GATE.engage) lgRelease(fighter);
    else if (fighter.driven || distance > LAST_GATE.release) lgDrive(world, fighter, man ? lgAt(man) : null);
  }
  // The squad: at their places while no foe is near them and no order of the player's stands; under the Formation order,
  // back to them and held there.
  const rebels = run.pool.map((slot) => world.fighters[slot.id]).filter((fighter) => !fighter.dormant && fighter.state === 'up');
  const command = world.commands?.red;
  for (const fighter of defenders) {
    const ordered = command && command.by !== fighter.id;
    if (fighter.id === playerId || fighter.state !== 'up' || fighter.panicked || (ordered && command.kind !== 'form')) {
      if (fighter.id !== playerId && fighter.driven) lgRelease(fighter);
      continue;
    }
    const post = run.posts.get(fighter.id);
    if (ordered) {
      lgHoldFormation(world, fighter, post, rebels);
      continue;
    }
    const near = lgNearestOf(rebels, post).distance;
    // A rider (not the player's own) rides at the foe nearest to the squad's line, not merely the nearest to him (LAST_GATE.threat).
    fighter.focus = fighter.mount ? lgGateThreat(world, fighter, rebels)?.id : undefined;
    if (near < lgGuardOf(fighter)) {
      lgRelease(fighter);
      continue;
    }
    if (fighter.mount) lgRideHome(world, fighter, post);
    else lgWalkHome(fighter, post);
  }
  lgCountAwake(world);
}

/**
 * The Formation order (command.js `form`) for one man: near his place with a foe within reach, he fights (the AI, which the
 * order keeps at his place: command.js); otherwise back to it, at a run from afar, and there he stands facing the mist.
 */
function lgHoldFormation(world, fighter, post, rebels) {
  const spec = LAST_GATE.form;
  if (fighter.mount) {
    fighter.focus = undefined;
    lgRideHome(world, fighter, post);
    return;
  }
  const away = lgApart(lgHips(fighter), post);
  const near = lgNearestOf(rebels, lgHips(fighter)).distance;
  if (away < spec.leash && near < spec.reach) {
    lgRelease(fighter);
    return;
  }
  lgWalkHome(fighter, post, away > spec.runFrom);
}

/** The page's share of the run's news and rebuilt men since it last asked. */
export function drainLastGate(world) {
  const run = world.lastGate;
  if (!run) return { rebuilds: [], news: [] };
  const out = { rebuilds: run.rebuilds, news: run.news };
  run.rebuilds = [];
  run.news = [];
  return out;
}

/**
 * What a run came to: the level (its hero), how long the squad lasted, its kills (all, the hero's own, the rest of the
 * squad's), the waves it cleared and the wave it fell in, how it ended, and the squad's size.
 */
export function lastGateResult(world) {
  const run = world.lastGate;
  return {
    hero: run.mode, seconds: Math.round(run.over?.time ?? run.time),
    kills: run.kills.total, heroKills: run.kills.hero, squadKills: run.kills.squad,
    waves: run.cleared, wave: run.wave, how: run.over?.how ?? null, squad: run.squad, companions: run.companions,
  };
}

// ---- The best runs ------------------------------------------------------------------------------------------------------
// The best runs in this browser, a board for each level, behind a small interface (list, add) so that a server's board can
// stand in for it later. The first on a level's board is its best.

export const LAST_GATE_BOARD = { key: 'gladiator/laststand-board', keep: 10 };

/** Better first: more kills (the squad's, the hero's among them), then more waves cleared, then longer lasted, then earlier. */
export function lastGateCompare(a, b) {
  return (b.kills - a.kills) || ((b.waves ?? 0) - (a.waves ?? 0)) || (b.seconds - a.seconds) || String(a.date).localeCompare(String(b.date));
}

/** The board with this run in it, best first, `keep` long; and where the run stands in it (null: not on it). */
export function lastGateRank(runs, entry, keep = LAST_GATE_BOARD.keep) {
  const all = [...runs, entry].sort(lastGateCompare);
  const kept = all.slice(0, keep);
  const at = kept.indexOf(entry);
  return { runs: kept, rank: at < 0 ? null : at + 1 };
}

/** A level's board's key in storage. */
export function lastGateBoardKey(mode) {
  return `${LAST_GATE_BOARD.key}/${mode in LAST_GATE_MODES ? mode : 'samurai'}`;
}

/**
 * The boards kept in `storage` (a localStorage, or anything with getItem and setItem; null or one that throws: boards that
 * keep nothing beyond the page), one for each level. `list(mode)` its runs best first; `best(mode)` the first or null;
 * `add(run)` puts a run on its level's board (`run.hero`, the level) and says its place.
 */
export function createLastGateBoard(storage) {
  const memory = new Map();
  const read = (mode) => {
    const key = lastGateBoardKey(mode);
    try {
      const raw = storage?.getItem(key);
      const runs = raw ? JSON.parse(raw) : memory.get(key) ?? [];
      return Array.isArray(runs) ? runs.filter((run) => run && Number.isFinite(run.kills) && Number.isFinite(run.seconds)) : [];
    } catch {
      return memory.get(key) ?? [];
    }
  };
  const list = (mode = 'samurai') => read(mode).sort(lastGateCompare).slice(0, LAST_GATE_BOARD.keep);
  return {
    list,
    best: (mode = 'samurai') => list(mode)[0] ?? null,
    add(run) {
      const mode = run.hero in LAST_GATE_MODES ? run.hero : 'samurai';
      const entry = { hero: mode, kills: run.kills, heroKills: run.heroKills ?? 0, seconds: run.seconds, waves: run.waves ?? 0, squad: run.squad ?? null, date: run.date ?? new Date().toISOString() };
      const ranked = lastGateRank(read(mode), entry);
      const key = lastGateBoardKey(mode);
      memory.set(key, ranked.runs);
      try {
        storage?.setItem(key, JSON.stringify(ranked.runs));
      } catch {
        // (Storage denied or full: the board lasts as long as the page.)
      }
      return ranked;
    },
  };
}

/** A run's time as m:ss. */
export function lastGateClock(seconds) {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** The line a player shares: "Last Stand Squad as the Samurai: 57 rebels cut down (21 by my hand), 8 waves, 3:42. HACS". */
export function lastGateShareText(result) {
  const mode = lgMode(result.hero);
  const foes = result.kills === 1 ? mode.foe : mode.foes;
  const waves = t(result.waves === 1 ? 'squad.wave' : 'squad.waves', { n: result.waves ?? 0 });
  return t('squad.shareLine', { title: tname(LAST_GATE.title), label: tname(mode.label), kills: result.kills, foes: tname(foes), felled: tname(mode.felled), mine: result.heroKills ?? 0, waves, clock: lastGateClock(result.seconds) });
}

/**
 * The words on a run's poster: the line over the time, the time the squad lasted, the foes it felled ("57 FELL"), the
 * hero's own and the waves ("21 BY HIS HAND · 8 WAVES"), the hero's name and what he is ("THE SAMURAI · ŌDACHI"), and the mark.
 */
export function lastGatePosterWords(result, name = null) {
  const mode = lgMode(result.hero);
  const waves = result.waves ?? 0;
  return {
    over: t('squad.poster.over'),
    held: lastGateClock(result.seconds),
    fell: t('squad.poster.fell', { n: result.kills }),
    by: t('squad.poster.by', { mine: result.heroKills ?? 0, waves: t(waves === 1 ? 'squad.poster.wave' : 'squad.poster.waves', { n: waves }) }),
    name: tname(name ?? mode.label).toUpperCase(),
    title: t('squad.poster.title', { label: tname(mode.label).toUpperCase(), weapon: tname(mode.weapon).toUpperCase() }),
    mark: `HACS · ${tname(LAST_GATE.title).toUpperCase()}`,
  };
}
