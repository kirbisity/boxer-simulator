// Two weapons meet (the `clash` event): steel on steel rings, bright and inharmonic (a blade is a free bar: its modes at 1, 2.76, 5.40,
// 8.93 times the first), and scrapes when the edges slide along each other; steel into a haft is a chop into wood; on a shield, a knock
// of its boards or the clang of its boss. The energy is the relative speed's (a sword's metre of steel, ~1.2 kg at the point of contact
// meeting another), its share radiated by what met.

import { bandMakeUp, contactBrightness, levelFromEnergy, sfxBuffer, sfxBurst, sfxClamp, sfxFilter, sfxModes, sfxNoise, sfxEnvelope, sfxPlayBuffer, writeGrains } from '../synth.js';

/** How each kind radiates (share of the energy, over how long), how hard it is, and the first mode of what it is. */
export const CLASH_KINDS = {
  blade: { efficiency: 6e-3, seconds: 0.9, hardness: 1, base: 640, decay: 1.1 },
  blunt: { efficiency: 3e-3, seconds: 0.5, hardness: 0.9, base: 380, decay: 0.55 },
  haft: { efficiency: 4e-4, seconds: 0.12, hardness: 0.45, base: 420, decay: 0.1 },
  shield: { efficiency: 5e-4, seconds: 0.14, hardness: 0.45, base: 300, decay: 0.12 },
  shieldmetal: { efficiency: 2e-3, seconds: 0.5, hardness: 0.9, base: 760, decay: 0.5 },
};
/** A free-free bar's mode ratios (a blade). */
const BAR_RATIOS = [1, 2.756, 5.404, 8.933];

/** What a clash sounds like, without a context: { level, brightness, modes, wood (a knock of wood in it), scrape (s of sliding) }. */
export function clashParams(event) {
  const a = CLASH_KINDS[event.a] ?? CLASH_KINDS.blade;
  const b = CLASH_KINDS[event.b] ?? CLASH_KINDS.blade;
  const speed = Math.max(0.3, event.speed ?? 6);
  const energy = 0.5 * 1.2 * speed * speed;
  // The pair radiates as its louder member does; the softer one sets how bright the contact is.
  const ring = a.efficiency >= b.efficiency ? a : b;
  const soft = a.hardness <= b.hardness ? a : b;
  const level = levelFromEnergy(energy, ring.efficiency, ring.seconds);
  const brightness = contactBrightness(soft.hardness, energy);
  const metal = (kind) => kind === CLASH_KINDS.blade || kind === CLASH_KINDS.blunt || kind === CLASH_KINDS.shieldmetal;
  const modes = [];
  for (const kind of [a, b]) {
    if (!metal(kind)) continue;
    const ratios = kind === CLASH_KINDS.blade ? BAR_RATIOS : [1, 1.71, 2.47, 3.11];
    // A harder strike excites more of the upper modes; each higher one dies sooner (the air and the steel take the highs first).
    ratios.forEach((ratio, index) => modes.push({ f: kind.base * ratio * (1 + (Math.random() - 0.5) * 0.06), decay: kind.decay / (1 + index * 0.6), amp: index ? sfxClamp(brightness / 8000, 0.15, 0.9) / index : 1 }));
  }
  const wood = !metal(a) || !metal(b) ? (metal(a) ? b : a) : null;
  return { level, brightness, modes, wood: wood ? { base: wood.base, decay: wood.decay } : null, scrape: event.slide ? sfxClamp(0.12 + speed * 0.03, 0.12, 0.5) : 0, energy, speed };
}

/** Play a clash into `out`. Returns the end time. */
export function playClash(voice, out, params, when, gain) {
  // The strike: a click of broadband noise as bright as the contact.
  sfxBurst(voice, out, { when, peak: gain * 0.3, decay: 0.015, type: 'highpass', frequency: sfxClamp(params.brightness * 0.3, 800, 9000) });
  let end = when + 0.1;
  // (The parts' peaks add up to about the clash's gain: the ring takes most of it, less beside the wood of a haft.)
  if (params.modes.length) {
    sfxModes(voice, out, when, params.modes, gain * (params.wood ? 0.35 : 0.6));
    end = Math.max(end, when + params.modes[0].decay);
  }
  if (params.wood) {
    // Steel into wood: a chop, the board's knock and the splinters' crackle.
    sfxModes(voice, out, when, [{ f: params.wood.base, decay: params.wood.decay, amp: 1 }, { f: params.wood.base * 2.4, decay: params.wood.decay * 0.6, amp: 0.5 }], gain * 0.35);
    sfxBurst(voice, out, { when, peak: gain * 0.25, decay: 0.05, type: 'bandpass', frequency: 1400, q: 0.8, color: 'pink' });
    const buffer = sfxBuffer(voice.ctx, 0.08, (data, rate) => writeGrains(data, rate, { count: 12, spread: 0.04, low: 1500, high: 5000, decay: 0.006, amp: 0.4 }));
    sfxPlayBuffer(voice, out, buffer, when, gain * 0.25);
  }
  if (params.scrape > 0) {
    // Edge along edge: band-passed noise swept up as the contact runs toward the points, rough with the burrs.
    const envelope = sfxEnvelope(voice, out, when, gain * 0.3 * bandMakeUp(6), 0.01, params.scrape * 0.6, params.scrape * 0.5);
    const band = sfxFilter(voice, envelope, 'bandpass', 2600, 6);
    band.frequency.setValueAtTime(2400, when);
    band.frequency.linearRampToValueAtTime(5200, when + params.scrape);
    sfxNoise(voice, band, when, params.scrape * 1.2 + 0.05);
    end = Math.max(end, when + params.scrape * 1.2);
  }
  return end + 0.05;
}
