// A weapon art made an event of (weaponarts.js): the player's all-out stroke given a beat of cinema, in the game's own
// realistic register (no comic text, no glow that is not light on steel). Everything is tied to the art's real events: its
// start (the `art` event) and its first contact (a `landed`, `blocked` or `bladeBlock` of that stroke, or a `clash` of blades
// while it is in flight), and everything at contact is scaled by that contact's own strength (hitfeel.js hitStrength).
//
//   wind-up    the fight slowed through the wind-up, then let go into the stroke at full speed (the frame's pace only, as a
//              hit-stop: the physics step is never changed, and the test hooks boxer.advance and playFrames never have it)
//   push       the camera eased in along its line toward the fight and tilted a little, held through the stroke
//   gleam      light caught on the steel as the stroke begins (a star of glare on the blade)
//   trail      a fading streak along the striking part's path, bright only where it moves fast
//   impact     a heavier hit-stop; sparks off steel, blood or dust off a man, by the blow; a strong short shake; a warm glare
//   sound      a long drawing whoosh at the start, a deep impact layer under the blow's own sound
//   name       the art's name, small and quiet low on the screen, for a moment
//
// prefers-reduced-motion: the slowing, the push and the shake toned down, no tilt and no glare.
// No DOM and no three.js: main.js asks it what to do (artdramaview.js draws it); tests drive it directly.

import { hitStrength } from './hitfeel.js';
import { MOVES } from './moves.js';
import { ARTS } from './weaponarts.js';

export const ARTDRAMA = {
  // The wind-up's slow motion: the fight runs at `slowest` of its pace while the stroke is drawn back (its own `windup`, in
  // the fight's seconds, stretched by 1/slowest, up to `most` real seconds), slid into over `easeIn` and let go over `easeOut`
  // just as the stroke is driven: the stroke itself is seen at full speed, the contrast is what makes it land.
  windup: { slowest: 0.38, most: 0.7, easeIn: 0.06, easeOut: 0.1 },
  // The impact's hit-stop: deeper and longer than an ordinary blow's (hitfeel.js 0.15, 0.025-0.075 s), between `seconds.light`
  // and `seconds.heavy` real seconds by the contact's strength, then eased back over `ease`.
  impact: { slowest: 0.06, seconds: { light: 0.05, heavy: 0.14 }, ease: 0.1 },
  // The push-in: the camera moved this share of the way along its line to what it looks at (0.14 at ~2.5 m is ~35 cm: the
  // frame tightens on the two men without losing either), in over `in` s, held `hold` s, out over `out` s (real seconds);
  // at contact a further `kick` share, gone in `kickSeconds`.
  push: { share: 0.14, in: 0.22, hold: 0.85, out: 0.6, kick: 0.05, kickSeconds: 0.25 },
  // The tilt: the camera rolled this far (degrees) with the push, a hand-held lean into the stroke, never enough to read as a
  // spin.
  roll: { degrees: 2.2 },
  // The shake at contact: metres at full strength (6 cm: three times the hit feel's kick, plainly a shake), a jitter of three
  // unrelated frequencies (Hz) dying with time constant `decay` (s), over `seconds`; a light contact shakes `floor` of it.
  shake: { metres: 0.06, hz: [17, 23, 31], decay: 0.09, seconds: 0.5, floor: 0.35 },
  // The glare at contact: a warm wash over the screen at `opacity` × strength, gone in `seconds`.
  flash: { opacity: 0.22, seconds: 0.18 },
  // The gleam on the steel at the start: its size (m) and life (real s).
  gleam: { size: 0.42, seconds: 0.38 },
  // The trail: each sample kept this long in the fight's seconds (a streak of the last ~1/6 s of the stroke), at most
  // `samples` of them; drawn at full only past `fast` m/s of the striking part (a wind-up hardly shows).
  trail: { seconds: 0.16, samples: 40, fast: 9 },
  // The burst at contact: sparks off steel (`sparks.base` + `per` × strength), blood off an edge or a point that bit (count and
  // speed in spawnBlood's terms) and dust off a blunt blow (puffs of `size` m), each scaled by the contact's strength.
  burst: { sparks: { base: 14, per: 34 }, blood: { base: 8, per: 26, speed: 1.8, speedPer: 2.2 }, dust: { puffs: 2, per: 4, size: 0.32 } },
  // Sound: the drawing whoosh's gain, and the impact layer's at light and full strength (0..1 of the effects bus).
  sound: { draw: 0.75, impact: { light: 0.45, heavy: 1 } },
  // A phone's buzz: a short one as the stroke starts, a longer one (ms) at contact by strength.
  haptic: { start: 14, light: 30, heavy: 70 },
  // The art's name on screen: real seconds shown (faded in and out within it).
  caption: { seconds: 1.8 },
  // The names shown (an art's own name; else its button's, ARTS.labels).
  titles: { artIai: 'Iai', artPommel: 'Knaufschlag', artDrawCut: 'Drawing cut', artWheel: 'Wheel cut', artCrush: 'Crushing blow', artCrushClub: 'Crushing blow', artCrushOne: 'Crushing blow', artSpear: 'Lunge' },
  // A contact counts as the art's only within its stroke: its duration (fight seconds) and this much after.
  contactSlack: 0.1,
  // Toned down for prefers-reduced-motion: each a share of the full effect (the wind-up's and the impact's slowing are
  // shares of the slowing, so 0.3 slows 30% as much).
  reduced: { slowing: 0.3, push: 0.4, roll: 0, shake: 0.3, flash: 0 },
};

const artClamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const artSmooth = (t) => t * t * (3 - 2 * t);

/** The name an art is shown by. */
export function artTitle(name) {
  return ARTDRAMA.titles[name] ?? ARTS.labels[name] ?? 'Weapon art';
}

/**
 * The drama of the player's arts. hear(event, playerId, now) for each event (now: real seconds): what to do at once (a start:
 * { kind: 'start', ... }; a contact: { kind: 'contact', strength, ... }), or null. Each frame: pace(now), push(now) (share of the
 * camera's line), roll(now) (rad), shake(now, out) ([x, y, z] m), flash(now) (0..1), caption(now) ({ text, opacity } or null),
 * and `active` (the art being made: { fighter, art, time, start, contact }).
 */
export function createArtDrama({ reduced = false } = {}) {
  const tone = reduced ? ARTDRAMA.reduced : { slowing: 1, push: 1, roll: 1, shake: 1, flash: 1 };
  let active = null;
  let impact = null;

  function hear(event, playerId, now) {
    if (playerId === null || playerId === undefined) return null;
    if (event.kind === 'art' && event.attacker === playerId) {
      const spec = MOVES[event.punch];
      active = { fighter: event.attacker, art: event.punch, time: event.time, start: now, windup: spec?.windup ?? 0.3, duration: spec?.duration ?? 1, contact: null };
      impact = null;
      return { kind: 'start', art: event.punch, fighter: event.attacker, title: artTitle(event.punch), draw: ARTDRAMA.sound.draw, vibrate: ARTDRAMA.haptic.start, gleam: { size: ARTDRAMA.gleam.size, seconds: ARTDRAMA.gleam.seconds } };
    }
    if (!active || active.contact) return null;
    if (event.time - active.time > active.duration + ARTDRAMA.contactSlack) return null;
    const ours = ((event.kind === 'landed' || event.kind === 'blocked') && event.attacker === playerId && event.punch === active.art)
      || (event.kind === 'bladeBlock' && event.defender === playerId && event.punch === active.art)
      // (Blades touching as the stroke is gathered, two guards crossed, are not its contact: only once it is driven.)
      || (event.kind === 'clash' && (event.fighter === playerId || event.other === playerId) && event.time >= active.time + active.windup);
    if (!ours || !event.point) return null;
    // Steel on steel: a blade or a guard met, a clash, plate that turned it, or a machine (sparks, not blood).
    const metal = event.kind !== 'landed' || event.target === 'shield' || event.effects?.some((effect) => effect.includes('plate'));
    const strength = Math.max(0.2, hitStrength(event));
    active.contact = { start: now, strength };
    impact = { start: now, strength };
    const edge = (event.cut ?? 0) + (event.pierce ?? 0);
    const burst = ARTDRAMA.burst;
    const normal = event.normal ?? [0, 1, 0];
    return {
      kind: 'contact',
      strength,
      metal,
      point: event.point,
      normal,
      defender: event.kind === 'bladeBlock' ? event.attacker : event.defender,
      sparks: metal ? Math.round(burst.sparks.base + burst.sparks.per * strength) : 0,
      blood: !metal && edge >= 1 ? { count: Math.round(burst.blood.base + burst.blood.per * strength), speed: burst.blood.speed + burst.blood.speedPer * strength } : null,
      dust: !metal ? { count: Math.round(burst.dust.puffs + burst.dust.per * strength), size: burst.dust.size * (0.6 + 0.4 * strength) } : null,
      impact: ARTDRAMA.sound.impact.light + (ARTDRAMA.sound.impact.heavy - ARTDRAMA.sound.impact.light) * strength,
      vibrate: Math.round(ARTDRAMA.haptic.light + (ARTDRAMA.haptic.heavy - ARTDRAMA.haptic.light) * strength),
      shake: ARTDRAMA.shake.metres * (ARTDRAMA.shake.floor + (1 - ARTDRAMA.shake.floor) * strength) * tone.shake,
    };
  }

  /** The share of the fight's pace now: slowed through the art's wind-up, held at its contact. */
  function pace(now) {
    let share = 1;
    if (active) {
      const spec = ARTDRAMA.windup;
      const hold = Math.min(spec.most, active.windup / spec.slowest);
      const age = now - active.start;
      let slow = 0;
      if (age >= 0 && age < hold) slow = artSmooth(artClamp(age / spec.easeIn));
      else if (age >= hold) slow = 1 - artSmooth(artClamp((age - hold) / spec.easeOut));
      // (A contact during the wind-up ends the slowing: the impact's own hold takes over.)
      if (active.contact) slow = 0;
      share = Math.min(share, 1 - (1 - spec.slowest) * slow * tone.slowing);
    }
    if (impact) {
      const spec = ARTDRAMA.impact;
      const hold = spec.seconds.light + (spec.seconds.heavy - spec.seconds.light) * impact.strength;
      const age = now - impact.start;
      if (age >= 0) {
        const eased = age < hold ? 0 : artClamp((age - hold) / spec.ease);
        share = Math.min(share, 1 - (1 - spec.slowest) * (1 - eased) * tone.slowing);
      }
    }
    return share;
  }

  /** The envelope (0..1) of the push and the tilt: in, held, out. */
  function envelope(now) {
    if (!active) return 0;
    const spec = ARTDRAMA.push;
    const age = now - active.start;
    if (age < 0) return 0;
    if (age < spec.in) return artSmooth(age / spec.in);
    if (age < spec.in + spec.hold) return 1;
    const out = (age - spec.in - spec.hold) / spec.out;
    return out >= 1 ? 0 : 1 - artSmooth(out);
  }

  /** The share of the camera's line to what it looks at to move along it now. */
  function push(now) {
    let share = ARTDRAMA.push.share * envelope(now);
    if (impact) {
      const age = now - impact.start;
      if (age >= 0 && age < ARTDRAMA.push.kickSeconds) share += ARTDRAMA.push.kick * impact.strength * (1 - age / ARTDRAMA.push.kickSeconds) ** 2;
    }
    return share * tone.push;
  }

  /** The camera's tilt now (rad). */
  function roll(now) {
    return ((ARTDRAMA.roll.degrees * Math.PI) / 180) * envelope(now) * tone.roll;
  }

  /** The shake now ([x, y, z] m, into out). */
  function shake(now, out = [0, 0, 0]) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    if (!impact) return out;
    const spec = ARTDRAMA.shake;
    const age = now - impact.start;
    if (age < 0 || age > spec.seconds) return out;
    const metres = spec.metres * (spec.floor + (1 - spec.floor) * impact.strength) * Math.exp(-age / spec.decay) * tone.shake;
    const [a, b, c] = spec.hz.map((hz) => 2 * Math.PI * hz * age);
    out[0] = metres * (Math.sin(a) * 0.6 + Math.sin(c + 1.3) * 0.4);
    out[1] = metres * (Math.sin(b + 0.7) * 0.7 + Math.sin(a + 2.1) * 0.3);
    out[2] = metres * (Math.sin(c) * 0.5 + Math.sin(b + 2.9) * 0.5);
    return out;
  }

  /** The glare over the screen now (0..1). */
  function flash(now) {
    if (!impact) return 0;
    const left = 1 - (now - impact.start) / ARTDRAMA.flash.seconds;
    return left > 0 && left <= 1 ? ARTDRAMA.flash.opacity * impact.strength * left * left * tone.flash : 0;
  }

  /** The art's name now: its text and opacity, or null once gone. */
  function caption(now) {
    if (!active) return null;
    const t = (now - active.start) / ARTDRAMA.caption.seconds;
    if (t < 0 || t >= 1) return null;
    return { text: artTitle(active.art), opacity: Math.min(1, t / 0.12, (1 - t) / 0.35) };
  }

  /** Whether anything is still playing out (the view keeps drawing while it is). */
  function busy(now) {
    if (!active) return false;
    const until = active.start + Math.max(ARTDRAMA.push.in + ARTDRAMA.push.hold + ARTDRAMA.push.out, ARTDRAMA.caption.seconds);
    if (now <= until || (impact && now <= impact.start + ARTDRAMA.shake.seconds)) return true;
    active = null;
    impact = null;
    return false;
  }

  function reset() {
    active = null;
    impact = null;
  }

  return { hear, pace, push, roll, shake, flash, caption, busy, reset, reduced, get active() { return active; } };
}
