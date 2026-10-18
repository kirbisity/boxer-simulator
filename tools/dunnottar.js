// A bot that plays Level Mode Stage 1, "Memories of Dunnottar", from the cliff path on, headless, to judge how
// hard it is ("How it will be judged: Difficulty" in the spec). The player follows DUNNOTTAR_ROUTE; when enemies
// have noticed him he fights with the existing fight AI (ai.js `think`, limited by `mayTarget` to the men who are
// aware of him), then goes back to the route. Deaths wake at the last rest, as in the game; ten deaths is a fail.
//
//   careful   fights what has noticed him, one at a time where it can (backs off along the way he came when two or
//             more come), bandages when he bleeds and nobody aware is within 6 m, drinks the tonic when badly hurt,
//             rests at every rest point near the route, takes the items near the route, changes into a dead man's
//             harness when it protects more, takes up a poleaxe lying near (the answer to plate), takes the cell key
//             and frees the prisoners.
//   reckless  runs the route, fights only what is within a few metres, never heals, never loots; rests only at
//             a rest within a few metres of his way.
//
// Usage:
//   node tools/dunnottar.js [sweep] [--policy careful,reckless] [--runs 10] [--seed0 1] [--jobs 8] [--deaths 10] [--seconds 2400]
//   node tools/dunnottar.js segments [--runs 20] [--segments start_rest1,rest1_rest2,...] [--logs]   rest to rest, from full health
//   node tools/dunnottar.js vaelen [--runs 10] [--variant unhealed,healed,brigandine,plate]   the boss alone, from the chapel gate
//   node tools/dunnottar.js one <policy> <seed> [--log]                                   one run, JSON (the sweep's worker)
// A sweep of 16 + 16 runs takes about ten minutes on ten cores (a run is a few thousand simulated seconds at about 6x real time);
// each run is its own process, `--jobs` of them at a time. `segments` is the quick way to tune: one stretch, many seeds.
//
// What the bot knows that a person would: it does not step back off a cliff in a fight, it gives up a stand-off across a rail, it
// closes in on a man who will not come, it ignores a man crawling away. What it does not: use cover, the doors and the stair
// as a choke, or the prisoners to hold a man. It fights with the game's own fight AI, so it is a fair stand-in for "a competent
// operative", not for a good player (who should do better than these numbers).
//
// ---- What was tuned, and why (phase C3) -----------------------------------------------------------------------------------
// The first sweep, the stage as built: the careful bot died ten times on the cliff path and never got past the first pair of levies
// (the reckless one the same). The fights are the full simulation: the operative (sword and buckler, 76 kg, skill 0.75) beat a
// levy with a spear 4 times in 10 and a guard with a poleaxe 5 in 10; plate cannot be cut at all; Vaelen (210 cm, 150 kg of
// body and a harness that the kit makes 120 kg more, so 270 kg) killed him in 16 s and was beaten in none of 36 duels. So:
//   levy (tier 1)  skill 0.3 -> 0.04, exercise 0.45 -> 0.06, 172 cm medium -> 168 cm small, calories 2977 -> 1984 (62 kg: the
//                  calories come down with the exercise or the same man is fat, 139 kg, and stronger): underfed conscripts, won
//                  by the operative 24 in 24 one to one, 21 in 24 two to one.
//   guard (tier 2) skill 0.5 -> 0.25, exercise 0.55 -> 0.1, calories 3865 -> 2681 (80 kg, not 82): 12 in 14 one to one. Below that
//                  skill buys nothing: a man in brigandine with a poleaxe kills a third of the operatives who face him however
//                  slow his hands (one blow to the head), so a guard costs the operative about one life in six.
//   crossbow, matchlock (tier 2) skill 0.5 -> 0.2, exercise 0.55/0.5 -> 0.3 (calories with it): about 3 in 4 one to one.
//   man-at-arms (tier 3) skill 0.7 -> 0.5, exercise 0.7 -> 0.5 (calories 4737 -> 4047, 90 kg): the sword does nothing to plate, so
//                  the careful bot takes a poleaxe from a fallen guard and wins about 4 in 10; with the sword, 0 in 24.
//   Vaelen         harness 120 kg -> 42 kg (outfit.extraMass 0.3, a hook in outfits.js gearTraits that a man's own `outfit` may set;
//                  nothing else uses it), 195 kg in all; exercise 0.95 -> 0.35 (calories 9256 -> 5515, same 150 kg, but a soft
//                  giant, FFMI 30 -> 22: the strongman killed in 5 s whatever his skill); skill 0.9 kept (the helm takes a
//                  quarter); outfit.balance 1.5 (the same kind of hook; he overreached and fell with his own poleaxe swing, which
//                  is the broken knee seen at his waking). Phase 2 (config) unchanged.
//   stage          gone: levy2, levy4, levy6, levy8 (the pairs: two at once cost the operative a third of his blood and lost one
//                  fight in two), bowman1 and gunner2 (the three at the oillet killed 7 in 10; one matchlock and a levy: 1 in 10),
//                  headguard (a levy who joined the hall guard's fight), stairguard2 (joined the stair guard's), patrol2,
//                  jailer2 (joined the jailer), wallbow (a crossbow down the straight of the wall walk), wallguard,
//                  wallknight1 (the wall walk had a guard and three knights in a row); the stair knight is a guard now (Sergeant
//                  Calder), one man-at-arms (Sir Lauder) is left before the chapel. The lodge guard stands 7 m farther east and
//                  looks east (he saw the well, the rest point, from his door); the turnkey stands at the middle of the cellar.
//                  A fourth rest, rest2b "The Turnkey's Fire", at the turnkey's brazier before the stair up to the keep (the
//                  stretch from the well to the chapel gate was one rest in nine men, and no one lived through it once in ten).
//                  The courtyard is darker (light 0.75 -> 0.55: the well is seen from 14 m and not from 19).
//   items          the stage starts him with 4 bandages and 2 tonics (3 and 1), the pouch holds 6 and 3 (5 and 3): a tonic is the only
//                  thing that gives back blood, and the first fight is the one that needs it.
// The bot is only part of the answer (it fought where a person would not: the log of every death is in `--log`), so the numbers
// were checked by hand on single fights (duel.mjs-style one to one and one to two bouts, in the session's scratchpad).
//
// ---- The table ---------------------------------------------------------------------------------------------------------------
// 16 runs a policy, seeds 1-16, 10 deaths a fail, 2400 simulated seconds a timeout (the stage as it was / as it is now):
//                          reached Vaelen   beat him   failed (10 deaths)   mean deaths   where they died
//   careful, as built       0/10             0/10       8/10 (rest timed out) 9.1          cliff 91 of 91 (levy 1, 2)
//   careful, tuned          12/16            7/16       0/16                 1.9           gate 13 (the hall guard 11), tower 8, vault 4
//   reckless, as built      0/10             0/10       9/10                 9.6          cliff 96 of 96
//   reckless, tuned         1/16             0/16       12/16                8.3          tower 58, gate 32, ascent 19, vault 9
// Vaelen alone from the chapel gate (20 runs each; as built, 12 each, in brackets):
//   unhealed (half the blood gone, empty pouch)  beaten 1/20  (0/12)   median death at 82 s (26 s)
//   healed, sword and gambeson                   beaten 2/20  (0/12)   (16 s)
//   healed, a guard's brigandine                 beaten 3/20  (0/12)
//   healed, a man-at-arms' plate                 beaten 15/20 (2/12)
// and 7 of 26 attempts at him in the careful sweep were wins (27%; they wear what they took off the last knight, plate half the time).
// A person who comes to him healed with brigandine and a poleaxe is where the spec wants the odds, about one in three.
//
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hurtShare, think, thinkAll } from '../src/ai.js';
import { P } from '../src/body.js';
import { advance, bodyHarm, collapseAt, reclothe, startPickup } from '../src/physics.js';
import { levelPreset } from '../src/levelmode/presets.js';
import { levelAware } from '../src/levelmode/adapter.js';
import { createLevelWorld, levelThink, respawnPlayer, restAtPoint } from '../src/levelmode/level.js';
import { interactions } from '../src/levelmode/interact.js';
import { feetFloor, holdPlayer, useItem } from '../src/levelmode/items.js';
import { regionContains, setMechanism, stageFloor, updateStage } from '../src/levelmode/stage.js';
import { OUTFITS } from '../src/outfits.js';
import { DUNNOTTAR, DUNNOTTAR_ROUTE } from '../src/levelmode/stages/dunnottar.js';

const STEP = 1 / 60;
/** The sections in the order the route reaches them (the cell is a side room). */
const ORDER = ['cliff', 'gate', 'ascent', 'quad', 'vault', 'tower', 'chapel'];
const PLAYER = new Set([0]);
const hipX = (fighter) => fighter.x[P.pelvis * 3];
const hipZ = (fighter) => fighter.x[P.pelvis * 3 + 2];
const apart = (a, b) => Math.hypot(hipX(a) - hipX(b), hipZ(a) - hipZ(b));

/** How the policies differ (all in the open here, so that the tuning can read them). */
const POLICY = {
  careful: { engage: 16, release: 22, heal: true, loot: true, hammer: true, items: 9, rest: 20, run: false, retreatAt: 2 },
  reckless: { engage: 3.5, release: 6, heal: false, loot: false, items: 0, rest: 3.5, run: true, retreatAt: 99 },
  // The route with nobody about, to learn where the walker goes (a trace of positions).
  trace: { engage: 0, release: 0, heal: false, loot: false, items: 0, rest: 0, run: false, retreatAt: 99 },
};

/** How much a harness protects: the mean of its blunt, cut and pierce proofing. */
function protection(inputs) {
  const spec = OUTFITS[inputs.outfit?.kind]?.protection;
  return spec ? (spec.blunt + spec.cut + spec.pierce) / 3 : 0;
}

// ---- The route ------------------------------------------------------------------------------------------

/** The route as one list of points: [{ p: [x, z], acts: [] }], the chapel gate to be opened at the end of the wall walk. */
function basePlan() {
  const plan = [];
  for (const leg of DUNNOTTAR_ROUTE) {
    for (const p of leg.points) plan.push({ p, acts: [], leg: leg.name, base: plan.length });
    // (The gates a leg lists are the ones its end comes to: the chapel gate at the end of the wall walk.)
    if (leg.open?.length) plan.at(-1).acts.push(...leg.open.map((id) => ({ kind: 'gate', id })));
  }
  return plan;
}

let traceCache = null;
/** Where a man walking the route goes, nobody about: samples { x, y, z, idx } each half second. */
function routeTrace() {
  if (!traceCache) {
    const run = new Run({ policy: 'trace', seed: 1 });
    run.play({ seconds: 900 });
    traceCache = run.samples;
  }
  return traceCache;
}

/** The nearest trace sample to a point (3 m of height counts as a far step: floors above and below are not near). */
function nearestSample(samples, x, y, z) {
  let best = null;
  let bestD = Infinity;
  for (const sample of samples) {
    const d = Math.hypot(sample.x - x, sample.z - z) + 4 * Math.abs(sample.y - y);
    if (d < bestD) {
      bestD = d;
      best = sample;
    }
  }
  return { sample: best, d: bestD, flat: best ? Math.hypot(best.x - x, best.z - z) : Infinity, dy: best ? Math.abs(best.y - y) : Infinity };
}

/** The route with the detours a policy takes: the items within reach of the way, the rests, the cell key and door. */
function planFor(policy) {
  const plan = basePlan();
  const spec = POLICY[policy];
  if (!spec || (!spec.items && !spec.rest)) return plan;
  const samples = routeTrace();
  const stops = [];
  for (const section of DUNNOTTAR.sections) {
    for (const item of section.items) {
      if (item.kind === 'note' || !spec.items) continue;
      const { sample, flat, dy } = nearestSample(samples, item.at[0], item.at[1], item.at[2]);
      if (sample && flat <= spec.items && dy <= 1.3) stops.push({ order: samples.indexOf(sample), p: [item.at[0], item.at[2]], acts: [{ kind: 'item', id: item.id }], before: sample.idx, item });
    }
    if (section.rest) {
      const { sample, flat, dy } = nearestSample(samples, section.rest.at[0], section.rest.at[1], section.rest.at[2]);
      if (sample && flat <= spec.rest && dy <= 1.3) stops.push({ order: samples.indexOf(sample), p: [section.rest.at[0], section.rest.at[2]], acts: [{ kind: 'rest', id: section.rest.id, name: section.rest.name }], before: sample.idx });
    }
  }
  stops.sort((a, b) => a.order - b.order);
  // Gates that open with a key follow the key: unlock the door once the key is in hand.
  const withDoors = [];
  for (const stop of stops) {
    withDoors.push(stop);
    if (stop.item?.kind !== 'key') continue;
    for (const section of DUNNOTTAR.sections) {
      for (const gate of section.gates) {
        if (gate.key !== stop.item.id) continue;
        const at = [gate.at[0], gate.at[2] + 1.2];
        withDoors.push({ p: at, acts: [{ kind: 'gate', id: gate.id }], before: stop.before });
      }
    }
  }
  // Insert, last first, so the earlier indices hold.
  const byBefore = new Map();
  for (const stop of withDoors) {
    if (!byBefore.has(stop.before)) byBefore.set(stop.before, []);
    byBefore.get(stop.before).push(stop);
  }
  const out = [];
  plan.forEach((entry, index) => {
    for (const stop of byBefore.get(index) ?? []) out.push({ p: stop.p, acts: stop.acts, leg: 'detour', stop: true, base: index });
    out.push(entry);
  });
  return out;
}

// ---- A run ----------------------------------------------------------------------------------------------

class Run {
  /**
   * @param policy careful | reckless | trace
   * @param seed the world's seed
   * @param maxDeaths the deaths after which the run is a fail
   * @param plan the points to walk (default: the policy's plan)
   * @param setup a function given the world before the first step (the boss duel's)
   */
  constructor({ policy, seed, maxDeaths = 10, plan = null, setup = null, log = false, endAt = null, only = null }) {
    this.endAt = endAt;
    this.only = only;
    this.policy = policy;
    this.spec = POLICY[policy];
    this.log = log ? [] : null;
    this.world = createLevelWorld(DUNNOTTAR, levelPreset('forger'), { seed });
    this.me = this.world.fighters[0];
    this.level = this.world.stage.level;
    this.maxDeaths = maxDeaths;
    this.plan = plan ?? planFor(policy);
    this.idx = 0;
    this.samples = [];
    this.sampleAt = 0;
    this.deaths = [];
    this.stats = { bandages: 0, tonics: 0, swaps: 0, hammers: 0, rests: 0, kills: 0, stuck: 0, retreats: 0 };
    this.furthest = 0;
    this.vaelen = { reached: false, attempts: 0, beaten: false, atArrival: [] };
    this.cursor = 0;
    this.lastHit = null;
    this.mode = 'route';
    this.trail = [];
    this.retreat = null;
    this.retreatUsed = false;
    this.best = Infinity;
    this.progressAt = 0;
    this.tried = new Map();
    this.looted = new Set();
    this.lootGoal = null;
    this.bossAware = false;
    this.restsMade = new Set();
    this.ignore = new Map();
    this.engagedAt = 0;
    this.clashAt = 0;
    this.closing = false;
    this.result = null;
    this.targetable = (other) => this.wanted(other);
    this.me.mayTarget = this.targetable;
    setup?.(this);
  }

  note(text) {
    this.log?.push(`${this.world.time.toFixed(1).padStart(7)}  ${this.sectionName()}  ${text}`);
  }

  /** The section the man stands in. */
  sectionName() {
    const me = this.me;
    const y = feetFloor(me);
    return DUNNOTTAR.sections.find((section) => regionContains(section.bounds, hipX(me), hipZ(me), y))?.id ?? '?';
  }

  /** Whether he fights this man: awake, aware of him, and not one he has given up on (across a fence, say). */
  wanted(other) {
    if (other.corner !== 'blue' || other.dormant || other.state === 'out' || other.crawling || !levelAware(this.world, other)) return false;
    const until = this.ignore.get(other.id);
    const struck = this.lastHit?.attacker === other.id && this.world.time - this.lastHit.time < 4;
    return !(until > this.world.time && !struck);
  }

  /** Enemies awake and aware of him: [{ fighter, d }] nearest first. */
  aware() {
    const me = this.me;
    const found = [];
    for (const fighter of this.world.fighters) {
      if (!this.wanted(fighter)) continue;
      found.push({ fighter, d: apart(me, fighter) });
    }
    return found.sort((a, b) => a.d - b.d);
  }

  /** Play until the stage is done (the boss down), failed (too many deaths) or out of time. */
  play({ seconds = 2400, final = true } = {}) {
    const world = this.world;
    const end = world.time + seconds;
    const think = (current, dt) => this.step(current, dt);
    while (!this.result && world.time < end) advance(world, STEP, think);
    if (!this.result && final) this.result = this.policy === 'trace' ? 'traced' : 'timeout';
    return this.report();
  }

  /** One step before the physics: the stage, the player's own systems, the men, the bot. */
  step(world, dt) {
    const level = this.level;
    const me = this.me;
    updateStage(world);
    if (this.policy === 'trace') for (const fighter of world.fighters.slice(1)) fighter.dormant = true;
    else if (this.only) for (const fighter of world.fighters.slice(1)) if (!this.only.includes(fighter.spawn?.id)) fighter.dormant = true;
    levelThink(world, dt);
    level.ui.length = 0;
    level.rebuild.clear();
    this.watch();
    if (level.dying) {
      this.die();
      return;
    }
    if (me.state === 'out') return;
    thinkAll(world, dt, PLAYER);
    // (A rest or a death makes him new in place: what he may target is put on him again.)
    me.mayTarget = this.targetable;
    this.control(dt);
  }

  /** The events since last step: who struck him; the boss; how far he has got. */
  watch() {
    const world = this.world;
    const events = world.events;
    if (this.cursor > events.length) this.cursor = events.length;
    for (; this.cursor < events.length; this.cursor += 1) {
      const event = events[this.cursor];
      if (event.defender === 0 && ['landed', 'shot', 'arrow', 'crash'].includes(event.kind)) this.lastHit = { attacker: event.attacker, kind: event.kind, time: event.time };
      if ((event.attacker === 0 || event.defender === 0) && ['landed', 'blocked', 'bladeBlock', 'shot', 'arrow'].includes(event.kind)) this.clashAt = event.time;
      if (event.kind === 'rested') this.stats.rests += 1;
      if (event.attacker === 0 && ['knockout', 'killed'].includes(event.kind) && event.fighter !== 0) this.stats.kills += 1;
    }
    if (this.endAt && !this.result && this.me.state === 'up' && Math.hypot(hipX(this.me) - this.endAt[0], hipZ(this.me) - this.endAt[2]) < 1.2 && Math.abs(feetFloor(this.me) - this.endAt[1]) < 1.2) this.result = 'through';
    const here = ORDER.indexOf(this.sectionName());
    if (here > this.furthest) this.furthest = here;
    const boss = this.level.boss ? world.fighters[this.level.boss.id] : null;
    if (boss) {
      const aware = !boss.dormant && boss.state !== 'out' && levelAware(world, boss);
      if (aware && !this.bossAware) {
        this.vaelen.reached = true;
        this.vaelen.attempts += 1;
        this.vaelen.atArrival.push({ harm: Number(bodyHarm(this.me).toFixed(2)), bandages: this.level.inventory.bandage, tonics: this.level.inventory.tonic, armour: Number(protection(this.me.body.inputs).toFixed(2)), t: Number(world.time.toFixed(0)) });
        this.note('Vaelen sees him');
      }
      this.bossAware = aware;
      if (boss.state === 'out' && !this.vaelen.beaten) {
        this.vaelen.beaten = true;
        this.result = 'beaten';
        this.note('Vaelen is down');
      }
    }
  }

  /** The man is out: note where and by whom, wake at the last rest, or give up. */
  die() {
    const world = this.world;
    const level = this.level;
    const hit = this.lastHit && world.time - this.lastHit.time < 30 ? this.lastHit : null;
    const killer = hit ? world.fighters[hit.attacker]?.spawn?.id ?? hit.kind : 'bled';
    const section = this.sectionName();
    this.deaths.push({ section, by: killer, at: Number(world.time.toFixed(0)), boss: this.bossAware });
    this.note(`dies to ${killer}`);
    if (this.deaths.length >= this.maxDeaths) {
      this.result = 'fail';
      return;
    }
    respawnPlayer(world);
    level.ui.length = 0;
    level.rebuild.clear();
    this.me.mayTarget = (other) => this.wanted(other);
    this.ignore.clear();
    this.mode = 'route';
    this.retreat = null;
    this.retreatUsed = false;
    this.bossAware = false;
    this.lootGoal = null;
    this.hammerGoal = null;
    this.trail.length = 0;
    this.lastHit = null;
    this.idx = this.planIndexHere();
    this.best = Infinity;
    this.progressAt = world.time;
  }

  /** After a rest or a death: the point of the plan to head for from where he stands (stops already done are passed at once). */
  planIndexHere() {
    if (this.policy === 'trace') return 0;
    const me = this.me;
    const { sample } = nearestSample(routeTrace(), hipX(me), feetFloor(me), hipZ(me));
    let found = this.plan.findIndex((entry) => entry.base >= (sample?.idx ?? 0));
    if (found < 0) return 0;
    // A gate just behind him that is still shut is still to be opened.
    for (let back = found - 1; back >= Math.max(0, found - 3); back -= 1) {
      if (this.plan[back].acts.some((act) => act.kind === 'gate' && this.world.stage.mechanisms[act.id] !== 'open')) found = back;
    }
    return found;
  }

  // ---- What he does -----------------------------------------------------------------------------------

  /** Heal or fight or walk, one step. */
  control(dt) {
    const me = this.me;
    const level = this.level;
    const world = this.world;
    const spec = this.spec;
    if (level.action || me.pickup) {
      holdPlayer(me);
      return;
    }
    if (this.policy === 'trace') return this.route(dt);
    const aware = this.aware();
    const nearest = aware[0]?.d ?? Infinity;
    // Fighting: from engage to release.
    let fighting = this.mode === 'fight' ? nearest <= spec.release : nearest <= spec.engage;
    // (He does not drop his guard the moment a man is out of sight: two seconds more.)
    if (fighting) this.lastFoe = world.time;
    else if (this.mode === 'fight' && world.time - (this.lastFoe ?? 0) < 2) fighting = true;
    if (this.mode !== 'fight' && fighting) {
      this.mode = 'fight';
      this.engagedAt = world.time;
      this.retreatUsed = false;
      this.note(`engages ${aware.filter((entry) => entry.d <= spec.release).map((entry) => entry.fighter.spawn.id).join(',')}`);
    }
    if (this.mode === 'fight' && !fighting) {
      this.mode = 'route';
      me.focus = undefined;
      me.goTo = null;
      this.note(`clear (harm ${bodyHarm(me).toFixed(2)})`);
      this.best = Infinity;
      this.progressAt = world.time;
      this.retreat = null;
    }
    if (spec.heal && this.tend(aware)) return;
    // A stand-off: nobody has struck for a while. Six seconds on, he closes in (a man waits only so long); fourteen, and if they
    // are not within reach (across a rail, say) he goes on his way and they are let be a while.
    this.closing = false;
    if (this.mode === 'fight') {
      const idle = world.time - Math.max(this.clashAt, this.engagedAt);
      if (idle > 14 && nearest > 3) {
        for (const entry of aware) this.ignore.set(entry.fighter.id, world.time + 25);
        this.note('gives up the stand-off');
        this.mode = 'route';
        me.focus = undefined;
        this.best = Infinity;
        this.progressAt = world.time;
        return this.route(dt);
      }
      this.closing = idle > 6 && nearest > 2 && nearest <= 9;
    }
    if (fighting) return this.fight(aware, dt);
    if (spec.loot && this.loot(aware)) return;
    this.route(dt);
  }

  /** Bandage and tonic. True if he took an action this step (so he does nothing else). */
  tend(aware) {
    const me = this.me;
    const level = this.level;
    const nearest = aware[0]?.d ?? Infinity;
    const harm = bodyHarm(me);
    if (me.state === 'up' && !level.tonics.length && level.inventory.tonic > 0 && (harm >= 0.3 || (me.bloodLost ?? 0) / collapseAt() >= 0.3)) {
      if (useItem(this.world, 'tonic')) {
        this.stats.tonics += 1;
        this.note(`tonic (harm ${harm.toFixed(2)})`);
      }
    }
    if (me.state === 'up' && (me.bleed ?? 0) > 1e-4 && level.inventory.bandage > 0 && (nearest > 6 || (harm >= 0.5 && nearest > 3.5)) && !me.punch) {
      if (useItem(this.world, 'bandage')) {
        this.stats.bandages += 1;
        this.note('bandage');
        return true;
      }
    }
    return false;
  }

  /** The fight AI for the player, limited to the men aware of him; two or more coming: back along the way he came, first. */
  fight(aware, dt) {
    const me = this.me;
    const world = this.world;
    const spec = this.spec;
    const near = aware.filter((entry) => entry.d <= spec.release);
    if (!this.retreatUsed && near.length >= spec.retreatAt && near[0].d > 5 && this.trail.length > 6) {
      this.retreatUsed = true;
      this.retreat = { until: world.time + 5, to: this.trail[Math.max(0, this.trail.length - 9)] };
      this.stats.retreats += 1;
    }
    if (this.retreat && (world.time > this.retreat.until || near[0]?.d <= 4)) this.retreat = null;
    if (this.retreat) {
      me.walking = true;
      me.goTo = [this.retreat.to[0], 0, this.retreat.to[1]];
      me.move = 1;
      me.running = true;
      me.strafe = 0;
      return;
    }
    me.walking = false;
    if (this.closing && aware[0]) {
      const target = aware[0].fighter;
      me.goTo = [hipX(target), 0, hipZ(target)];
      me.move = 1;
      me.running = false;
      me.strafe = 0;
      return;
    }
    think(world, me, dt);
    this.keepFromEdge();
  }

  /** A man in a fight does not step back off a cliff: if the way he is moving leads over a drop, he stops. */
  keepFromEdge() {
    const me = this.me;
    const world = this.world;
    const forward = [Math.cos(me.yaw), -Math.sin(me.yaw)];
    const side = [forward[1], -forward[0]];
    const floor = feetFloor(me);
    const ahead = Math.sign(me.move) || 0;
    const open = (dx, dz) => [0.9, 1.6].every((reach) => stageFloor(world, hipX(me) + dx * reach, hipZ(me) + dz * reach, floor) >= floor - 1.5);
    if (ahead && !open(forward[0] * ahead, forward[1] * ahead)) me.move = 0;
    if (me.strafe && !(open(side[0], side[1]) && open(-side[0], -side[1]))) me.strafe = 0;
  }

  /** After a fight, a poleaxe lying near (the answer to plate): walk to it and take it up. True while at it. */
  takeHammer() {
    const me = this.me;
    const world = this.world;
    if (me.weapon?.kind === 'warhammer' || me.pickup) return false;
    if (!this.hammerGoal) {
      const floor = feetFloor(me);
      const found = world.debris.find((debris) => debris.kind === 'weapon' && debris.weapon === 'warhammer' && !debris.taken && debris.resting && debris.x
        && Math.hypot(debris.x[0] - hipX(me), debris.x[2] - hipZ(me)) < 10 && Math.abs(debris.x[1] - floor) < 1.2 && !this.tried.get(`hammer${debris.id}`));
      if (!found) return false;
      this.hammerGoal = { id: found.id, until: world.time + 12 };
      this.tried.set(`hammer${found.id}`, 1);
    }
    const debris = world.debris[this.hammerGoal.id];
    if (!debris || debris.taken || world.time > this.hammerGoal.until) {
      this.hammerGoal = null;
      return false;
    }
    const d = Math.hypot(debris.x[0] - hipX(me), debris.x[2] - hipZ(me));
    if (d > 0.55) {
      me.walking = true;
      me.running = false;
      me.goTo = [debris.x[0], 0, debris.x[2]];
      me.move = Math.min(1, 0.5 + d);
      return true;
    }
    me.move = 0;
    if (startPickup(world, me, debris, { swap: true })) {
      this.stats.hammers += 1;
      this.note('takes up a poleaxe');
    }
    this.hammerGoal = null;
    return true;
  }

  /** After a fight, a dead man's harness that protects more: walk to him and change. True while at it. */
  loot(aware) {
    const me = this.me;
    const world = this.world;
    if (aware.length && aware[0].d < 20) return false;
    if (this.spec.hammer && this.takeHammer()) return true;
    const mine = protection(me.body.inputs);
    if (!this.lootGoal) {
      let best = null;
      for (const dead of world.fighters) {
        if (dead === me || dead.state !== 'out' || dead.dormant || dead.corner !== 'blue' || this.looted.has(dead.id)) continue;
        const d = apart(me, dead);
        if (d > 14 || Math.abs(dead.x[P.pelvis * 3 + 1] - me.x[P.pelvis * 3 + 1]) > 1.6) continue;
        const gain = protection(dead.body.inputs) - mine;
        if (gain > 0.05 && (!best || gain > best.gain)) best = { dead, gain };
      }
      if (!best) return false;
      this.lootGoal = { id: best.dead.id, until: world.time + 14 };
      this.looted.add(best.dead.id);
    }
    const dead = world.fighters[this.lootGoal.id];
    if (world.time > this.lootGoal.until || dead.state !== 'out') {
      this.lootGoal = null;
      return false;
    }
    const d = apart(me, dead);
    if (d > 1.0) {
      me.walking = true;
      me.running = false;
      me.goTo = [hipX(dead), 0, hipZ(dead)];
      me.move = 1;
      return true;
    }
    me.move = 0;
    const choice = interactions(world).find((entry) => entry.id === `outfit:${dead.id}`);
    if (choice && choice.run(world)) {
      this.stats.swaps += 1;
      this.note(`changes into ${dead.spawn?.id}'s harness`);
    }
    this.lootGoal = null;
    return true;
  }

  /** Walk the plan. */
  route(dt) {
    const me = this.me;
    const world = this.world;
    me.walking = true;
    me.strafe = 0;
    const entry = this.plan[this.idx];
    if (!entry) {
      if (this.policy === 'trace') this.result = 'traced';
      else this.finish();
      return;
    }
    const [tx, tz] = entry.p;
    const d = Math.hypot(tx - hipX(me), tz - hipZ(me));
    if (d < (entry.stop ? 0.5 : 0.6)) {
      if (this.act(entry)) return;
      this.idx += 1;
      this.best = Infinity;
      this.progressAt = world.time;
      return;
    }
    // Nearer to it for four seconds out of the last; else it is a wall and he goes on.
    if (d < this.best - 0.05) {
      this.best = d;
      this.progressAt = world.time;
    } else if (world.time - this.progressAt > 4) {
      this.stats.stuck += 1;
      this.note(`stuck going to ${tx.toFixed(1)},${tz.toFixed(1)}`);
      this.idx += 1;
      this.best = Infinity;
      this.progressAt = world.time;
      return;
    }
    me.goTo = [tx, 0, tz];
    me.move = 1;
    me.running = this.spec.run;
    if (this.policy !== 'trace') this.keepTrail();
    else this.sample();
  }

  keepTrail() {
    const last = this.trail.at(-1);
    const here = [hipX(this.me), hipZ(this.me)];
    if (!last || Math.hypot(last[0] - here[0], last[1] - here[1]) >= 1) {
      this.trail.push(here);
      if (this.trail.length > 40) this.trail.shift();
    }
  }

  sample() {
    if (this.world.time < this.sampleAt) return;
    this.sampleAt = this.world.time + 0.5;
    this.samples.push({ x: hipX(this.me), y: feetFloor(this.me), z: hipZ(this.me), idx: this.idx });
  }

  /** The things done at a plan point: take, open, rest. True while there is something still to do. */
  act(entry) {
    const world = this.world;
    const level = this.level;
    const me = this.me;
    if (!entry.acts.length) return false;
    const act = entry.acts[0];
    const key = `${this.idx}:${act.kind}:${act.id}`;
    const tries = (this.tried.get(key) ?? 0) + 1;
    this.tried.set(key, tries);
    let done = tries > 40;
    me.move = 0;
    if (act.kind === 'item') done ||= level.taken.has(act.id);
    if (act.kind === 'gate') done ||= world.stage.mechanisms[act.id] === 'open';
    if (act.kind === 'rest') {
      const need = bodyHarm(me) > 0.03 || level.inventory.bandage < level.startItems.bandage || level.inventory.tonic < level.startItems.tonic || !this.restsMade.has(act.id);
      done ||= !need || level.checkpoint.id === act.id;
    }
    if (!done) {
      const choice = interactions(world).find((entry2) => (act.kind === 'item' && entry2.id === `item:${act.id}`) || (act.kind === 'gate' && entry2.id === `gate:${act.id}`) || (act.kind === 'rest' && entry2.kind === 'rest'));
      if (choice && !choice.disabled && this.aware().every((enemy) => enemy.d > 6)) {
        if (choice.run(world) !== false) {
          if (act.kind === 'rest') {
            this.restsMade.add(act.id);
            this.note(`rests at ${act.name ?? act.id}`);
            this.idx = this.planIndexHere();
            this.trail.length = 0;
            return true;
          }
          this.note(`${act.kind} ${act.id}`);
          done = true;
        }
      }
    }
    if (done) {
      entry.acts = entry.acts.slice(1);
      return entry.acts.length > 0;
    }
    return true;
  }

  /** The plan is walked: the boss is the last thing. If he has not seen him, go to him. */
  finish() {
    const me = this.me;
    const boss = this.level.boss ? this.world.fighters[this.level.boss.id] : null;
    me.walking = true;
    if (!boss || boss.state === 'out') {
      me.move = 0;
      return;
    }
    me.goTo = [hipX(boss), 0, hipZ(boss)];
    me.move = 1;
    me.running = false;
  }

  /** The run's numbers. */
  report() {
    const level = this.level;
    return {
      policy: this.policy,
      result: this.result,
      furthest: ORDER[this.furthest],
      deaths: this.deaths,
      seconds: Number(this.world.time.toFixed(0)),
      stats: this.stats,
      vaelen: this.vaelen,
      freed: [...level.freed],
      armour: Number(protection(this.me.body.inputs).toFixed(2)),
      log: this.log,
    };
  }
}

// ---- The boss alone ---------------------------------------------------------------------------------------

/** What the operative brings to the chapel gate. */
const VARIANTS = {
  // Hurt and out of everything: half his blood gone, the pouch empty.
  unhealed: (run) => {
    run.me.bloodLost = 0.5 * collapseAt();
    run.me.concussion = 0.25 * run.me.concussion + 0.1;
    run.level.inventory = { bandage: 0, tonic: 0 };
  },
  // Rested: whole, the pouch as the stage starts him.
  healed: () => {},
  // Rested, and in a dead guard's brigandine (taken from Corporal Rae or the like).
  brigandine: (run) => {
    const guard = levelPreset('dunnottarGuard');
    reclothe(run.world, run.me, { ...run.me.body.inputs, outfit: structuredClone(guard.outfit), accessories: [] });
  },
  // Rested, and in a dead man-at-arms' plate (taken from Sir Lauder or Sir Rannoch).
  plate: (run) => {
    const knight = levelPreset('dunnottarKnight');
    reclothe(run.world, run.me, { ...run.me.body.inputs, outfit: structuredClone(knight.outfit), accessories: [] });
  },
};

function bossDuel(variant, seed, log, seconds = 240) {
  const chapel = DUNNOTTAR_ROUTE.find((leg) => leg.to === 'chapel');
  const plan = chapel.points.map((p) => ({ p, acts: [], leg: chapel.name }));
  const run = new Run({
    policy: 'careful',
    seed,
    plan,
    log,
    maxDeaths: 1,
    setup: (self) => {
      const rest = DUNNOTTAR.sections.find((section) => section.rest?.id === 'rest3').rest;
      setMechanism(self.world, 'chapelgate', 'open');
      restAtPoint(self.world, { id: rest.id, at: rest.at, name: rest.name });
      self.level.ui.length = 0;
      self.me.mayTarget = (other) => self.wanted(other);
      VARIANTS[variant](self);
    },
  });
  // The plan is the chapel leg: the points from the gate to Vaelen; items and rests are not in it.
  run.play({ seconds });
  const boss = run.world.fighters[run.level.boss.id];
  return { variant, seed, result: boss.state === 'out' ? 'beaten' : run.deaths.length ? 'died' : 'timeout', seconds: run.report().seconds, by: run.deaths[0]?.by ?? '', bossHurt: Number(hurtShare(boss).toFixed(2)), log: run.log };
}


// ---- Segments: from one rest to the next -------------------------------------------------------------------

/** The rests, by id: { at, name }. */
const RESTS = Object.fromEntries(DUNNOTTAR.sections.filter((section) => section.rest).map((section) => [section.rest.id, section.rest]));

/** The stretches between rests, as the bot walks them (a death there wakes at the rest it began from). */
export const SEGMENTS = {
  start_rest1: { from: null, to: 'rest1', note: 'the cliff path' },
  rest1_rest2: { from: 'rest1', to: 'rest2', note: 'gorge, gatehouse, oillet stair, ascent, quad' },
  rest2_rest2b: { from: 'rest2', to: 'rest2b', note: 'the quad, the cellar to the turnkey\'s fire' },
  rest2b_rest3: { from: 'rest2b', to: 'rest3', note: 'keep, stair tower, wall walk' },
};

/** One walk of a segment from full health: { result: through | died | timeout, by, seconds, harm, bandages, tonics }. */
function segmentRun(name, policy, seed, log) {
  const spec = SEGMENTS[name];
  const full = planFor(policy);
  const samples = routeTrace();
  const startAt = spec.from ? RESTS[spec.from].at : DUNNOTTAR.start.at;
  const endAt = RESTS[spec.to].at;
  const from = spec.from ? nearestSample(samples, startAt[0], startAt[1], startAt[2]).sample.idx : 0;
  const to = nearestSample(samples, endAt[0], endAt[1], endAt[2]).sample.idx;
  // (From the turnkey's fire he does not go back for the cell: that is a walk through the cellar, and the cellar's men are another stretch's.)
  const plan = full.filter((entry) => entry.base >= from && entry.base <= to && !(spec.from === 'rest2b' && entry.stop && entry.acts.some((act) => act.kind === 'gate')));
  const run = new Run({
    policy, seed, plan, log, maxDeaths: 1, endAt,
    setup: (self) => {
      if (spec.from) {
        restAtPoint(self.world, { id: spec.from, at: startAt, name: RESTS[spec.from].name });
        self.level.ui.length = 0;
      }
    },
  });
  return run;
}

function segment(name, policy, seed, log) {
  const run = segmentRun(name, policy, seed, log);
  run.play({ seconds: 900 });
  const report = run.report();
  return { segment: name, policy, seed, result: report.result === 'through' ? 'through' : report.deaths.length ? 'died' : 'timeout', by: report.deaths[0]?.by ?? '', where: report.deaths[0]?.section ?? '', seconds: report.seconds, harm: Number(bodyHarm(run.me).toFixed(2)), bandages: report.stats.bandages, tonics: report.stats.tonics, log: run.log };
}

// ---- The command line ------------------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg.startsWith('--')) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith('--')) options[arg.slice(2)] = true;
      else {
        options[arg.slice(2)] = next;
        index += 1;
      }
    } else options._.push(arg);
  }
  return options;
}

/** Run `jobs` child processes at a time over the argument lists; each prints one JSON line. */
function farm(lists, jobs) {
  const script = fileURLToPath(import.meta.url);
  return new Promise((resolve) => {
    const results = new Array(lists.length);
    let next = 0;
    let running = 0;
    let finished = 0;
    const launch = () => {
      while (running < jobs && next < lists.length) {
        const mine = next;
        next += 1;
        running += 1;
        const child = spawn(process.execPath, [script, ...lists[mine]], { stdio: ['ignore', 'pipe', 'inherit'] });
        let out = '';
        child.stdout.on('data', (chunk) => { out += chunk; });
        child.on('close', () => {
          running -= 1;
          finished += 1;
          try {
            results[mine] = JSON.parse(out.trim().split('\n').at(-1));
          } catch {
            results[mine] = { result: 'crash', deaths: [], stats: {}, vaelen: {} };
          }
          process.stderr.write(`\r${finished}/${lists.length} done `);
          if (finished === lists.length) {
            process.stderr.write('\n');
            resolve(results);
          } else launch();
        });
      }
    };
    launch();
  });
}

const pad = (value, width) => String(value).padEnd(width);

function printSweep(runs) {
  console.log(`${pad('policy', 9)}${pad('seed', 5)}${pad('result', 9)}${pad('furthest', 9)}${pad('deaths', 7)}${pad('time', 6)}${pad('band', 5)}${pad('tonic', 6)}${pad('swap', 5)}${pad('rest', 5)}${pad('vael', 10)}  died (section:by)`);
  for (const run of runs) {
    const vaelen = run.vaelen.beaten ? 'beaten' : run.vaelen.reached ? `seen x${run.vaelen.attempts}` : '-';
    console.log(`${pad(run.policy, 9)}${pad(run.seed, 5)}${pad(run.result, 9)}${pad(run.furthest ?? '-', 9)}${pad(run.deaths.length, 7)}${pad(run.seconds ?? '', 6)}${pad(run.stats.bandages ?? '', 5)}${pad(run.stats.tonics ?? '', 6)}${pad(run.stats.swaps ?? '', 5)}${pad(run.stats.rests ?? '', 5)}${pad(vaelen, 10)}  ${run.deaths.map((death) => `${death.section}:${death.by}`).join(' ')}`);
  }
}

function printSummary(runs) {
  for (const policy of [...new Set(runs.map((run) => run.policy))]) {
    const mine = runs.filter((run) => run.policy === policy);
    const share = (test) => `${mine.filter(test).length}/${mine.length}`;
    const deaths = mine.map((run) => run.deaths.length);
    const sum = deaths.reduce((a, b) => a + b, 0);
    const bySection = {};
    const byKiller = {};
    for (const run of mine) for (const death of run.deaths) {
      bySection[death.section] = (bySection[death.section] ?? 0) + 1;
      byKiller[death.by] = (byKiller[death.by] ?? 0) + 1;
    }
    const attempts = mine.reduce((total, run) => total + (run.vaelen.attempts ?? 0), 0);
    const wins = mine.filter((run) => run.vaelen.beaten).length;
    const sorted = (object) => Object.entries(object).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(', ');
    console.log(`\n${policy}: reached Vaelen ${share((run) => run.vaelen.reached)}, beat him ${share((run) => run.vaelen.beaten)} (${wins}/${attempts} attempts), failed ${share((run) => run.result === 'fail')}, mean deaths ${(sum / mine.length).toFixed(1)}, median time ${[...mine.map((run) => run.seconds)].sort((a, b) => a - b)[Math.floor(mine.length / 2)]} s`);
    console.log(`  deaths by section: ${sorted(bySection) || 'none'}`);
    console.log(`  deaths by: ${sorted(byKiller) || 'none'}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const command = options._[0] ?? 'sweep';
  const jobs = Number(options.jobs ?? Math.max(1, cpus().length - 2));
  if (command === 'one') {
    const [, policy, seed] = options._;
    const run = new Run({ policy, seed: Number(seed), maxDeaths: Number(options.deaths ?? 10), log: Boolean(options.log) });
    const report = run.play({ seconds: Number(options.seconds ?? 2400) });
    console.log(JSON.stringify({ ...report, seed: Number(seed) }));
    return;
  }
  if (command === 'seg') {
    const [, name, policy, seed] = options._;
    console.log(JSON.stringify(segment(name, policy, Number(seed), Boolean(options.log))));
    return;
  }
  if (command === 'boss') {
    const [, variant, seed] = options._;
    console.log(JSON.stringify(bossDuel(variant, Number(seed), Boolean(options.log))));
    return;
  }
  const runs = Number(options.runs ?? 10);
  const seed0 = Number(options.seed0 ?? 1);
  if (command === 'segments') {
    const names = String(options.segments ?? Object.keys(SEGMENTS).join(',')).split(',');
    const policy = String(options.policy ?? 'careful');
    const lists = names.flatMap((name) => Array.from({ length: runs }, (_, index) => ['seg', name, policy, String(seed0 + index), ...(options.logs ? ['--log'] : [])]));
    const results = await farm(lists, jobs);
    for (const name of names) {
      const mine = results.filter((result) => result.segment === name);
      const through = mine.filter((result) => result.result === 'through');
      const by = {};
      for (const result of mine) if (result.by) by[result.by] = (by[result.by] ?? 0) + 1;
      const mean = (list, key) => (list.reduce((sum, result) => sum + (result[key] ?? 0), 0) / Math.max(1, list.length)).toFixed(2);
      if (options.logs) for (const result of mine.filter((entry) => entry.result !== 'through')) console.log(`--- ${name} seed ${result.seed} ${result.result} ${result.by}\n${(result.log ?? []).join('\n')}`);
      console.log(`${pad(name, 12)} through ${through.length}/${mine.length}  timeout ${mine.filter((result) => result.result === 'timeout').length}  mean time ${mean(mine, 'seconds')} s  harm at the end ${mean(through, 'harm')}  bandages ${mean(mine, 'bandages')} tonics ${mean(mine, 'tonics')}  killers: ${Object.entries(by).sort((a, b) => b[1] - a[1]).map(([key, count]) => `${key} ${count}`).join(', ') || '-'}`);
    }
    return;
  }
  if (command === 'vaelen') {
    const variants = String(options.variant ?? 'unhealed,healed,brigandine,plate').split(',');
    const lists = variants.flatMap((variant) => Array.from({ length: runs }, (_, index) => ['boss', variant, String(seed0 + index)]));
    const results = await farm(lists, jobs);
    for (const variant of variants) {
      const mine = results.filter((result) => result.variant === variant);
      const won = mine.filter((result) => result.result === 'beaten').length;
      const by = {};
      for (const result of mine) if (result.by) by[result.by] = (by[result.by] ?? 0) + 1;
      const median = [...mine.map((result) => result.seconds)].sort((a, b) => a - b)[Math.floor(mine.length / 2)];
      console.log(`vaelen vs ${pad(variant, 9)} beaten ${won}/${mine.length}  died ${mine.filter((result) => result.result === 'died').length}  timed out ${mine.filter((result) => result.result === 'timeout').length}  median ${median} s  killed by ${Object.keys(by).join(',') || '-'}`);
    }
    return;
  }
  const policies = String(options.policy ?? 'careful,reckless').split(',');
  const lists = policies.flatMap((policy) => Array.from({ length: runs }, (_, index) => ['one', policy, String(seed0 + index), '--deaths', String(options.deaths ?? 10), '--seconds', String(options.seconds ?? 2400)]));
  const results = await farm(lists, jobs);
  printSweep(results);
  printSummary(results);
}

export { Run, segmentRun, basePlan, planFor, routeTrace, bossDuel, POLICY, VARIANTS };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
