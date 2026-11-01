// A player bot: a fighter driven through the player's own orders (control.js: the stick, the lock, the guard held, a tap of
// the attack pad as fightui/kit.js throwMove makes it), against the AI, as Deadliest Warrior plays a bout. Each policy is a
// kind of human at the pad, with a human's reaction to a blow seen coming:
// - masher: walks straight at him and taps a blow that reaches every few tenths of a second; never guards;
// - careful: holds his range with the guard up as soon as he is near, counters each blow as it comes back, pokes when it goes quiet;
// - turtle: backs off out of his reach (circling off the walls), guards, and pokes when he walks into range.
// What it measures is the AI's: attacks a minute, the share of exchanges it starts, its first attack, how often a blow of
// the player's that misses is punished, and the player's wins and time to win.
// Usage: node tools/playerbot.js [policy|all|fair|rated] [seeds = 4] [seconds = 90] [pairs: player>ai,player>ai]
// `fair`: the same pairs AI v AI (the player's side's share); `rated`: RATED_PAIRS as tools/ratings.js fights them.
// (PRESS=off in the environment: the AI without AI.press, the old pace, to compare; PRESS_SET='{json}' sets its dials.)

import { P } from '../src/body.js';
import { AI, thinkAll } from '../src/ai.js';
import { directFighter, newOrders } from '../src/control.js';
import { fightUiMoves, fightUiZoneOf } from '../src/fightui/logic.js';
import { MOVES, moveRange } from '../src/moves.js';
import { advance, boutWinner, createWorld, inFight, reachOf, seededRandom } from '../src/physics.js';
import { WARRIORS } from '../src/roster.js';
import { RATING } from './ratings.js';

// Deadliest Warrior's colosseum (render.js PLACE_ARENAS: armed men fight there).
export const COLOSSEUM = { halfX: 6.5, halfZ: 4.4 };
// Player's warrior > the AI's: pairs rated near each other (src/ratings.js), mid-tier swordsmen and the like.
export const MATCHUPS = [['maximus', 'legionary'], ['centurion', 'esen'], ['rodelero', 'murmillo'], ['legionary', 'footSpear'], ['gaziAlp', 'maximus'], ['hidalgo', 'oyoroi']];
// A human at the pad: how soon a blow seen is answered (s), how often it is seen at all, and the walk's throw of the stick.
export const BOT = { reaction: 0.24, reads: 0.8, walk: 0.55, exchangeGap: 1.2, punishWithin: 0.7 };

const apart = (a, b) => Math.hypot(a.x[P.pelvis * 3] - b.x[P.pelvis * 3], a.x[P.pelvis * 3 + 2] - b.x[P.pelvis * 3 + 2]);
const toward = (from, to) => {
  const d = [to.x[P.pelvis * 3] - from.x[P.pelvis * 3], to.x[P.pelvis * 3 + 2] - from.x[P.pelvis * 3 + 2]];
  const length = Math.hypot(d[0], d[1]) || 1;
  return [d[0] / length, d[1] / length];
};

/** The pad's moves that reach him from here (as padAttack's reach: the move's range, his head, a lunge's step). */
function reaching(me, him) {
  const held = me.weapon?.held ? me.weapon.spec : null;
  const distance = apart(me, him);
  return fightUiMoves(me.style).filter((entry) => {
    const spec = MOVES[entry.move];
    if (spec?.kind !== 'strike' || spec.path === 'aim' || (spec.reach === 'weapon' && !held)) return false;
    return distance <= moveRange(spec, me.body, held) + him.body.lengths.headRadius + (spec.step ?? 0) * 0.5;
  });
}

/** The bot's man at the pad, for one policy. */
function botFor(policy, world, me, him, orders, random) {
  const state = { nextTap: 0, guardUntil: 0, seen: null, reactAt: Infinity, counterAt: Infinity, counters: 0, lastAction: 0, circle: random() < 0.5 ? 1 : -1 };
  const tap = (entry) => {
    orders.requests.push({ move: entry.move, zone: fightUiZoneOf(entry), strength: 'quick', at: world.time });
    state.lastAction = world.time;
  };
  const tapAny = () => {
    const moves = reaching(me, him);
    if (!moves.length) return false;
    tap(moves[Math.floor(random() * moves.length)]);
    return true;
  };
  // A blow coming at him, seen a reaction's time after it starts (or not at all).
  const watch = () => {
    const blow = him.punch?.target === me.id ? him.punch : null;
    if (blow && blow !== state.seen) {
      state.seen = blow;
      state.reactAt = random() < BOT.reads ? world.time + BOT.reaction * (0.8 + 0.4 * random()) : Infinity;
    }
    if (blow && world.time >= state.reactAt) {
      orders.guard = true;
      state.guardUntil = world.time + 0.15;
      state.counterAt = Infinity;
    }
    if (orders.guard && !blow && world.time > state.guardUntil) {
      orders.guard = false;
      // The counter as his blow comes back: a reaction later.
      state.counterAt = world.time + BOT.reaction * 0.6;
      state.counters = 1 + Math.floor(random() * 2);
    }
    return blow;
  };
  const stickAt = (dir, amount = BOT.walk) => { orders.stick = { dir, amount }; };
  return () => {
    orders.lock = him.id;
    if (me.state !== 'up' || him.state !== 'up') {
      orders.stick = null;
      orders.guard = false;
      return;
    }
    const distance = apart(me, him);
    const myReach = reachOf(me) + him.body.lengths.headRadius;
    const hisReach = reachOf(him) + me.body.lengths.headRadius;
    if (policy === 'masher') {
      stickAt(toward(me, him));
      if (distance < myReach * 0.75) orders.stick = null;
      if (world.time >= state.nextTap && distance < myReach + 0.4) {
        tapAny();
        state.nextTap = world.time + 0.3 + 0.25 * random();
      }
      return;
    }
    if (policy === 'careful') {
      // The guard up whenever he is within a step of his reach (the button held as he comes), dropped only for his own blow;
      // each of his blows that comes back is countered a reaction later; a quiet spell, and he steps in with a blow.
      const blow = him.punch?.target === me.id ? him.punch : null;
      if (blow && blow !== state.seen && blow.t > (blow.spec?.extendUntil ?? 0)) {
        state.seen = blow;
        state.counterAt = world.time + BOT.reaction * (0.8 + 0.4 * random());
        state.counters = 1 + Math.floor(random() * 2);
      }
      if (state.counters > 0 && world.time >= state.counterAt && !me.punch) {
        if (tapAny()) state.counters -= 1;
        else state.counters = 0;
        state.counterAt = world.time + 0.35;
      }
      orders.stick = null;
      const quiet = world.time - state.lastAction > 1.6 + random() * 0.8 && !blow;
      if (quiet) {
        if (distance > myReach) stickAt(toward(me, him));
        else if (tapAny()) state.nextTap = world.time + 0.6;
      }
      orders.guard = distance < hisReach + 0.4 && !me.punch && !(state.counters > 0 && world.time >= state.counterAt - 0.05);
      return;
    }
    const blow = watch();
    if (state.counters > 0 && world.time >= state.counterAt && !me.punch) {
      if (tapAny()) state.counters -= 1;
      else state.counters = 0;
      state.counterAt = world.time + 0.35;
    }
    // His blow out and coming back without touching: a man watching for it strikes into the gap.
    const recovering = him.punch && him.punch.t > (him.punch.spec?.extendUntil ?? 0) && !orders.guard;
    if (recovering && world.time >= state.nextTap && !me.punch && random() < 0.5) {
      tapAny();
      state.nextTap = world.time + 0.5;
    }
    // Turtle: out of his reach, round him rather than into a wall; a poke when he walks into range.
    const away = toward(him, me);
    const side = [-away[1] * state.circle, away[0] * state.circle];
    const x = me.x[P.pelvis * 3];
    const z = me.x[P.pelvis * 3 + 2];
    const nearWall = Math.abs(x) > COLOSSEUM.halfX - 1.2 || Math.abs(z) > COLOSSEUM.halfZ - 1.2;
    if (distance < hisReach + 0.5) {
      const way = nearWall ? [away[0] * 0.3 + side[0], away[1] * 0.3 + side[1]] : [away[0] + side[0] * 0.4, away[1] + side[1] * 0.4];
      const length = Math.hypot(way[0], way[1]) || 1;
      stickAt([way[0] / length, way[1] / length]);
    } else orders.stick = null;
    if (!blow && !orders.guard && world.time >= state.nextTap && distance < myReach && !me.punch) {
      if (tapAny()) state.nextTap = world.time + 0.9 + random() * 0.6;
    }
  };
}

/** A bout of the player's warrior (red, the bot) against the AI's (blue); what the AI did, and how it ended. `onFrame`: a look each frame. */
export function playBout(playerKey, aiKey, policy, seed, seconds = 90, onFrame = null) {
  const inputs = (key) => structuredClone(WARRIORS.find((warrior) => warrior.key === key).inputs);
  const world = createWorld([{ inputs: inputs(playerKey), corner: 'red' }, { inputs: inputs(aiKey), corner: 'blue' }], { seed, arena: COLOSSEUM });
  const [me, him] = world.fighters;
  me.player = true;
  const orders = newOrders();
  const random = seededRandom(seed * 7919 + 13);
  const bot = botFor(policy, world, me, him, orders, random);
  const players = new Set([me.id]);
  const tally = { aiStrikes: 0, playerStrikes: 0, firstAi: null, exchanges: 0, aiStarted: 0, whiffs: 0, punished: 0, minutes: 0, aiLanded: 0, playerLanded: 0 };
  const starts = [];
  let lastStrike = -Infinity;
  let seenAi = null;
  let seenMe = null;
  const pending = [];
  let cursor = 0;
  let winner = null;
  while (world.time < seconds && !(winner = boutWinner(world))) {
    advance(world, 1 / 60, (current, dt) => {
      bot();
      thinkAll(current, dt, players);
      directFighter(current, me, orders, dt);
    });
    onFrame?.(world, me, him, orders);
    if (me.state === 'up' && him.state === 'up') tally.minutes += 1 / 60 / 60;
    const struck = (fighter, seen) => fighter.punch && fighter.punch !== seen && MOVES[fighter.punch.type]?.kind === 'strike';
    const aiNew = struck(him, seenAi) || (him.rush && him.rush !== seenAi);
    const meNew = struck(me, seenMe);
    for (const [side, fresh] of [['ai', aiNew], ['me', meNew]]) {
      if (!fresh) continue;
      if (world.time - lastStrike > BOT.exchangeGap) {
        tally.exchanges += 1;
        if (side === 'ai') tally.aiStarted += 1;
      }
      lastStrike = world.time;
      starts.push({ side, at: world.time });
    }
    if (aiNew) {
      tally.aiStrikes += 1;
      tally.firstAi ??= world.time;
    }
    if (meNew) {
      tally.playerStrikes += 1;
      pending.push({ punch: me.punch, type: me.punch.type, from: world.time, touched: false, ended: null });
    }
    seenAi = him.punch ?? him.rush ?? seenAi;
    seenMe = me.punch ?? seenMe;
    for (; cursor < world.events.length; cursor += 1) {
      const event = world.events[cursor];
      if (event.kind !== 'landed' && event.kind !== 'blocked') continue;
      if (event.attacker === me.id) {
        for (const blow of pending) if (blow.ended === null) blow.touched = true;
        if (event.kind === 'landed') tally.playerLanded += 1;
      } else if (event.attacker === him.id && event.kind === 'landed') tally.aiLanded += 1;
    }
    for (const blow of pending) if (blow.ended === null && me.punch !== blow.punch) blow.ended = world.time;
    // A miss is punished when he starts a blow within BOT.punishWithin s of it coming back.
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const blow = pending[index];
      if (blow.ended === null || world.time - blow.ended < BOT.punishWithin) continue;
      if (!blow.touched && him.state === 'up') {
        tally.whiffs += 1;
        if (starts.some((start) => start.side === 'ai' && start.at >= blow.from && start.at <= blow.ended + BOT.punishWithin)) tally.punished += 1;
      }
      pending.splice(index, 1);
    }
  }
  return { ...tally, winner: winner === 'red' ? 'player' : winner === 'blue' ? 'ai' : null, time: world.time, alive: inFight(me) && inFight(him) };
}

/** Bouts of each matchup and seed under one policy, summed. */
export function measure(policy, { seeds = 4, seconds = 90, matchups = MATCHUPS, firstSeed = 300 } = {}) {
  const sum = { bouts: 0, playerWins: 0, aiWins: 0, draws: 0, killTimes: [], aiStrikes: 0, minutes: 0, exchanges: 0, aiStarted: 0, firstAi: [], whiffs: 0, punished: 0, aiLanded: 0, playerLanded: 0 };
  const rows = [];
  for (const [playerKey, aiKey] of matchups) {
    const row = { pair: `${playerKey}>${aiKey}`, playerWins: 0, aiWins: 0, draws: 0 };
    for (let index = 0; index < seeds; index += 1) {
      const result = playBout(playerKey, aiKey, policy, firstSeed + index, seconds);
      sum.bouts += 1;
      if (result.winner === 'player') { sum.playerWins += 1; row.playerWins += 1; sum.killTimes.push(result.time); }
      else if (result.winner === 'ai') { sum.aiWins += 1; row.aiWins += 1; }
      else { sum.draws += 1; row.draws += 1; }
      for (const key of ['aiStrikes', 'minutes', 'exchanges', 'aiStarted', 'whiffs', 'punished', 'aiLanded', 'playerLanded']) sum[key] += result[key];
      sum.firstAi.push(result.firstAi ?? seconds);
    }
    rows.push(row);
  }
  const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? null;
  return {
    policy, bouts: sum.bouts, rows,
    playerWinRate: (sum.playerWins + sum.draws / 2) / sum.bouts,
    playerWins: sum.playerWins, aiWins: sum.aiWins, draws: sum.draws,
    timeToKill: sum.killTimes.length ? mean(sum.killTimes) : null,
    aiAttacksPerMinute: sum.aiStrikes / Math.max(1e-6, sum.minutes),
    aiStartShare: sum.aiStarted / Math.max(1, sum.exchanges),
    firstAttack: median(sum.firstAi),
    punishRate: sum.punished / Math.max(1, sum.whiffs),
    whiffs: sum.whiffs,
    aiLandedPerMinute: sum.aiLanded / Math.max(1e-6, sum.minutes),
    playerLandedPerMinute: sum.playerLanded / Math.max(1e-6, sum.minutes),
  };
}

/** The same pairs AI against AI (the player's warrior left to the AI): a fair fight's win share for that side. */
export function aiOnly({ seeds = 4, seconds = 90, matchups = MATCHUPS, firstSeed = 300 } = {}) {
  let share = 0;
  let bouts = 0;
  for (const [playerKey, aiKey] of matchups) for (let index = 0; index < seeds; index += 1) {
    const inputs = (key) => structuredClone(WARRIORS.find((warrior) => warrior.key === key).inputs);
    const world = createWorld([{ inputs: inputs(playerKey), corner: 'red' }, { inputs: inputs(aiKey), corner: 'blue' }], { seed: firstSeed + index, arena: COLOSSEUM });
    let winner = null;
    while (world.time < seconds && !(winner = boutWinner(world))) advance(world, 1, (current, dt) => thinkAll(current, dt));
    share += winner === 'red' ? 1 : winner ? 0 : 0.5;
    bouts += 1;
  }
  return share / bouts;
}

// AI against AI as tools/ratings.js fights a pairing (its ring, its bell, its seeds; each from both corners): rated pairs.
export const RATED_PAIRS = [['maximus', 'legionary'], ['plate', 'templar'], ['oyoroi', 'tosei'], ['esen', 'sipahi'], ['footSpear', 'ashigaruSpear'], ['boxer', 'kickboxer'], ['mingDao', 'wokou'], ['hidalgo', 'rodelero'], ['murmillo', 'secutor'], ['centurion', 'saladin'], ['shaolin', 'maximus'], ['gorilla', 'plate']];

/** Each rated pair fought `seeds` times from each corner: a's wins, draws at the bell, and the mean time to a finish. */
export function ratedBouts({ seeds = 4, seconds = RATING.seconds, pairs = RATED_PAIRS } = {}) {
  return pairs.map(([a, b]) => {
    const tally = { pair: `${a} v ${b}`, wins: 0, losses: 0, draws: 0, times: [] };
    for (let index = 0; index < seeds; index += 1) for (const flip of [false, true]) {
      const inputs = (key) => structuredClone(WARRIORS.find((warrior) => warrior.key === key).inputs);
      const [red, blue] = flip ? [b, a] : [a, b];
      const world = createWorld([{ inputs: inputs(red), corner: 'red' }, { inputs: inputs(blue), corner: 'blue' }], { seed: RATING.firstSeed + index });
      let winner = null;
      for (let second = 0; second < seconds && !(winner = boutWinner(world)); second += 1) advance(world, 1, (current, dt) => thinkAll(current, dt));
      winner ??= boutWinner(world);
      if (!winner) tally.draws += 1;
      else {
        tally.times.push(world.time);
        if ((winner === 'red') !== flip) tally.wins += 1; else tally.losses += 1;
      }
    }
    return tally;
  });
}

const report = (result) => {
  const f = (value, digits = 2) => (value === null ? '—' : value.toFixed(digits));
  console.log(`${result.policy.padEnd(7)} bouts ${result.bouts}: player wins ${result.playerWins} ai ${result.aiWins} draws ${result.draws} (player ${f(100 * result.playerWinRate, 0)}%), player's time to win ${f(result.timeToKill, 1)} s`);
  console.log(`        AI: ${f(result.aiAttacksPerMinute, 1)} attacks/min, starts ${f(100 * result.aiStartShare, 0)}% of exchanges, first attack ${f(result.firstAttack, 1)} s (median), punishes ${f(100 * result.punishRate, 0)}% of ${result.whiffs} whiffs; landed/min AI ${f(result.aiLandedPerMinute, 1)} player ${f(result.playerLandedPerMinute, 1)}`);
  console.log(`        ${result.rows.map((row) => `${row.pair} ${row.playerWins}-${row.aiWins}-${row.draws}`).join('  ')}`);
};

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [policyArg = 'all', seedsArg = '4', secondsArg = '90', pairsArg] = process.argv.slice(2);
  const matchups = pairsArg ? pairsArg.split(',').map((pair) => pair.split('>')) : MATCHUPS;
  const options = { seeds: Number(seedsArg), seconds: Number(secondsArg), matchups };
  if (process.env.PRESS === 'off') AI.press.on = false;
  if (process.env.PRESS_SET) Object.assign(AI.press, JSON.parse(process.env.PRESS_SET));
  const started = performance.now();
  if (policyArg === 'rated') {
    for (const row of ratedBouts({ seeds: Number(seedsArg) })) console.log(`${row.pair.padEnd(24)} ${row.wins}-${row.losses}-${row.draws}  finish ${row.times.length ? (row.times.reduce((a, b) => a + b, 0) / row.times.length).toFixed(1) : '—'} s`);
  } else if (policyArg === 'fair') console.log(`AI v AI, the player's side: ${(100 * aiOnly(options)).toFixed(0)}%`);
  else for (const policy of policyArg === 'all' ? ['masher', 'careful', 'turtle'] : [policyArg]) report(measure(policy, options));
  console.log(`(${((performance.now() - started) / 1000).toFixed(1)} s wall)`);
}
