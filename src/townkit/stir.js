// The town kit's things the wind moves, apart from its trees (whose sway is in their materials, weather.js):
//
//   hung things   lanterns on their cords, washing on a line, banners on poles and on frames. One mesh on the kit's
//                 'cloth' material; each vertex carries where it hangs from and how it catches the wind
//                 (weather.js TK_STIR_RULE), and the vertex stage does the rest from the place's one wind.
//   what the air carries from the place itself: smoke from a fire or a chimney, the fire's own flames, snow blown
//                 off a wall's top or a roof's ridge when a gust crosses it, water dripping from an eave while
//                 the roof is wet. Small camera-facing sheets, drawn only in the open air (env/), lit by its sun
//                 and sky, hazed by its haze, moved by its gusts.
//
// Nothing here keeps a clock or a wind of its own: the time is the kit's (uTkTime), the wind the place's (uTkBlow,
// envGust), the wet and the snow the weather's (uTkWet, uTkSnow, uTkRain).

import { ENV_GLSL, envUniforms } from '../env/air.js';
import { tkBeams } from './beams.js';
import { tkgBuilder, tkgFrame } from './geo.js';
import { tkRandom } from './tex.js';
import { TK_STIR_RULE, tkWeather } from './weather.js';

/** Tuning for what the wind moves. */
export const TK_STIR = {
  // A paper lantern: the cord it hangs by (m), and its catch (weather.js TK_STIR_RULE: drag over weight per (m/s)^2;
  // 0.3 kg and 0.07 m^2 of face give 0.014).
  lantern: { cord: 0.24, catch: 0.014 },
  // Washing: a line sags by `sag` of its span; a piece is `wide` x `drop` m (each a range) with `gap` m between;
  // wet cloth catches 0.05 and dry light cloth 0.2 (TK_STIR_RULE), the pieces drawn between; the wave down a piece
  // is `flutter` m per metre from the line. Indigo, undyed hemp and white are the common cloths of the time and
  // place, approximate; the colours are by eye.
  washing: { sag: 0.05, wide: [0.5, 1.1], drop: [0.6, 1.3], gap: [0.08, 0.5], catch: [0.05, 0.2], flutter: 0.07, colours: [[0.16, 0.22, 0.4], [0.78, 0.74, 0.66], [0.9, 0.9, 0.88], [0.45, 0.36, 0.3], [0.22, 0.3, 0.5], [0.6, 0.22, 0.18]] },
  // A flag tied down one side to its pole: `droop` is its weight against the wind (it hangs at atan(droop / U^2)
  // under level: 6 gives 20 degrees in a 4 m/s wind and nearly straight down under 1 m/s); its wave `flutter` m per
  // metre from the pole. A banner laced to a pole and a top yard (a nobori) cannot stream: it only bellies and shakes.
  flag: { droop: 6, flutter: 0.12 },
  // (`cuts`: a nobori's cloth is cut this many times across and down its length so the waves show; `grime`: how
  // much darker its foot is than its head, the hem that the weather and the ground's mud reach; `tone`: each piece
  // of it varies this much, the cloth's own unevenness. Its flutter 0.1 m per metre from the pole: the free side of
  // a laced banner bellies a hand or so. By eye.)
  nobori: { flutter: 0.1, cuts: [4, 14], grime: 0.3, tone: 0.1 },
  // Smoke from a small fire: `count` puffs each living `life` s, rising at `rise` m/s and taken up to the wind's
  // speed over `drag` s, growing from `size[0]` to `size[1]` m across; a wood fire's plume leaves at about 1 m/s
  // and is bent flat within a few metres in a fresh wind, approximate. `colour`: its own (wood smoke, blue-grey).
  smoke: { count: 22, life: 9, rise: 1.0, drag: 1.4, size: [0.3, 3.2], colour: [0.62, 0.62, 0.65], alpha: 0.24 },
  // Flames: `count` tongues each living `life` s, rising `rise` m/s from `size` m across to nothing; `light`: how
  // bright (a multiple of the display's white: a flame is far over it, and blooms).
  fire: { count: 9, life: 0.55, rise: 1.3, size: 0.32, light: 3.2, colours: [[1, 0.78, 0.3], [1, 0.3, 0.06]] },
  // Snow blown off an edge: `perMetre` wisps along it, each living `life` s; it starts once the gust there passes
  // `from` m/s and is at its fullest at `full` (snow is lifted from about 5 m/s at the surface, more when fresh and
  // loose, approximate); it rides at `ride` of the wind, sinks `fall` m/s, spreads from `size[0]` to `size[1]` m.
  // `alpha`: a wisp's own thickness at its thickest (it is white on a white land: it shows as a veil over what is
  // darker behind it and as a bright streak against the sun, so it is drawn thick: by eye).
  spindrift: { perMetre: 2.4, life: 2.6, from: 3.6, full: 6.5, ride: 0.8, fall: 0.35, size: [0.5, 2.4], alpha: 1.1 },
  // Drips from an eave: `perMetre` along it; each lets a drop go every `every` s (a range) when the roof is soaked,
  // fewer of them as it dries (none under `wetFrom`); a drop is `wide` m across and drawn `long` s of its fall long.
  // (`long` 0.018: the eye's own blur of a falling drop, a hand's length near the ground; longer and each reads as a
  // blue rod standing in a dark lane.)
  drip: { perMetre: 2.2, every: [0.5, 3.5], wetFrom: 0.12, wide: 0.012, long: 0.018, alpha: 0.4 },
  // A lit lantern's light: one camera-facing sheet on the lantern's middle (it swings with the lantern, TK_STIR_RULE),
  // no light thrown on what is round it. The paper drawn lit over the lantern's own body, a soft halo `halo` lantern
  // radii out; `light`: the paper's brightness, a multiple of the display's white. A candle behind paper is a few
  // candelas per square metre, far under a lane's shaded wall by day (about a hundred and more): drawn as a lamp is
  // seen at dusk, by eye, so it reads in the shade. `colours`: red paper and pale oiled paper with a flame behind.
  glow: { halo: 3.2, light: 1.25, colours: [[1, 0.34, 0.12], [1, 0.7, 0.38]] },
};

const TK_STIR_KINDS = ['smoke', 'fire', 'spindrift', 'drip', 'glow'];

const TK_STIR_AIR_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec3 aAt;
attribute vec4 aSeed;
uniform float uTkTime;
uniform float uTkWet;
uniform float uTkSnow;
uniform float uTkRain;
uniform vec4 uTkBlow;
uniform vec4 uHow;
uniform vec4 uSize;
uniform vec3 uColour;
uniform vec3 uColourEnd;
varying vec2 vUv;
varying vec4 vColour;
${ENV_GLSL}
void main() {
  float r = aSeed.x;
  float r2 = aSeed.y;
  float r3 = aSeed.z;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 down = vec3(uTkBlow.x, 0.0, uTkBlow.y);
  float blow = envGust(aAt.xz);
  float life = uHow.x * (0.75 + 0.5 * r2);
  float age = fract(uTkTime / life + r);
  float t = age * life;
  vec3 middle = aAt;
  vec2 size = vec2(1.0);
  float alpha = uSize.z;
  vec3 colour = uColour;
  float lit = 1.0;
#if KIND == 0
  // Smoke: up at its own pace, slowing; taken up to the wind's speed; spreading and thinning.
  float carried = t - uHow.z * (1.0 - exp(-t / uHow.z));
  middle += vec3(0.0, uHow.y * t * (1.0 - 0.35 * age), 0.0) + down * blow * carried;
  middle += (right * sin(r3 * 40.0 + t * 0.9) + vec3(0.0, 1.0, 0.0) * cos(r2 * 30.0 + t * 0.7)) * 0.12 * t * aSeed.w;
  size = vec2(mix(uSize.x, uSize.y, sqrt(age)) * aSeed.w);
  alpha *= smoothstep(0.0, 0.06, age) * pow(1.0 - age, 1.6);
#elif KIND == 1
  // A flame's tongue: up, leaning with the wind, narrowing to nothing.
  middle += vec3(0.0, uHow.y * t, 0.0) * aSeed.w + down * blow * 0.12 * t + (right * (r3 - 0.5) + down * (r2 - 0.5)) * uSize.x * 0.7 * aSeed.w;
  size = vec2(uSize.x * (1.0 - 0.8 * age), uSize.x * (1.6 - age)) * aSeed.w;
  colour = mix(uColour, uColourEnd, age) * uSize.w * (0.75 + 0.25 * sin(uTkTime * 23.0 + r * 60.0));
  alpha *= 1.0 - age * age;
  lit = 0.0;
#elif KIND == 2
  // Snow off an edge: only while the gust there is strong enough and snow lies; downwind, sinking, spreading.
  float strength = smoothstep(uHow.z, uHow.w, blow) * uTkSnow;
  middle += down * blow * uHow.y * t + vec3(0.0, (0.5 * r3 - 0.1) * sin(age * 3.14159) - uSize.w * t, 0.0);
  float wide = mix(uSize.x, uSize.y, age);
  size = vec2(wide * 1.7, wide * 0.6);
  // (Its long way lies along the wind as the eye sees it.)
  vec3 seen = normalize(vec3(dot(down, right), dot(down, up), 0.0) + vec3(1e-4, 0.0, 0.0));
  vec3 newRight = right * seen.x + up * seen.y;
  up = cross(normalize(cross(right, up)), newRight);
  right = newRight;
  alpha *= strength * smoothstep(0.0, 0.12, age) * (1.0 - age);
#elif KIND == 3
  // A drop from an eave: let go, falling freely the height aSeed.w, then nothing until the next.
  float wet = smoothstep(uHow.z, 1.0, uTkWet) * (1.0 - uTkSnow);
  float every = mix(uHow.x, uHow.y, r2) / max(wet, 0.05);
  float fall = sqrt(2.0 * aSeed.w / 9.81);
  t = mod(uTkTime + r * 97.0, every + fall);
  float speed = 9.81 * t;
  middle.y -= 0.5 * 9.81 * t * t;
  float away = distance(cameraPosition, middle);
  float least = away * 0.0011;
  size = vec2(max(uSize.x, least), max(speed * uSize.y, uSize.x * 2.0));
  up = vec3(0.0, 1.0, 0.0);
  right = normalize(cross(up, cameraPosition - middle));
  // (A drip only where the roof is wet enough for this one's share, and while it is in the air.)
  alpha *= step(t, fall) * step(r3, wet * 1.2) * min(1.0, uSize.x / least);
#else
  // A lit lantern: its middle hangs under the hook as the hung things swing (weather.js TK_STIR_NORMAL: the lean from
  // the gust at the hook, swinging at the lantern's own rate and phase), drawn a lantern's radius toward the eye so it
  // lies over the paper; dimmed by the air between (as envHazeWalk's own through), adding no haze of its own.
  float hookUp = aSeed.w * 1.15 + uHow.y;
  vec3 hook = aAt + vec3(0.0, hookUp, 0.0);
  float wind = envGust(hook.xz);
  float lean = atan(uHow.x * wind * wind) * (1.0 + ${TK_STIR_RULE.swing.toFixed(2)} * sin(uTkTime * aSeed.y + aSeed.x));
  vec3 axis = vec3(-uTkBlow.y, 0.0, uTkBlow.x);
  vec3 arm = vec3(0.0, -hookUp, 0.0);
  middle = hook + arm * cos(lean) + cross(axis, arm) * sin(lean);
  middle += normalize(cameraPosition - middle) * aSeed.w * 1.1;
  size = vec2(2.0 * uSize.x * aSeed.w);
  float away = distance(cameraPosition, middle);
  colour = mix(uColour, uColourEnd, aSeed.z) * uSize.w * exp(-(uEnvRayleigh.rgb + uEnvHaze.rgb * envHazeColumn(max(cameraPosition.y, 0.0), max(middle.y, 0.0))) * away);
  lit = 0.0;
#endif
  vec3 world = middle + (right * aCorner.x * size.x + up * aCorner.y * size.y) * 0.5;
  // (Lit as the land is, env/terrain.js: the sun by how a face meets it, here a puff's half, and the whole sky.)
  vec3 light = uEnvSunColour * envSunShare(middle) * 0.5 + uEnvSkyLight;
#if KIND == 2
  // (Blown snow against the sun is lit through.)
  light += uEnvSunColour * envSunShare(middle) * 1.5 * pow(max(dot(normalize(middle - cameraPosition), uEnvSunDir), 0.0), 6.0);
#endif
#if KIND == 3
  // (A drop shows the sky.)
  colour = envSky(vec3(0.0, 1.0, 0.0)) * 0.9;
  lit = 0.0;
#endif
  colour *= mix(vec3(1.0), light, lit);
  vColour = vec4(lit > 0.5 || KIND == 3 ? envHaze(colour, cameraPosition, middle) : colour, alpha);
  vUv = aCorner;
  gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
}`;

const TK_STIR_AIR_FRAGMENT = /* glsl */ `
varying vec2 vUv;
varying vec4 vColour;
void main() {
#if KIND == 3
  float cover = 1.0 - abs(vUv.x);
#elif KIND == 4
  // (The paper, lit brightest at its middle, out to the lantern's radius; past it a soft halo.)
  float d = length(vUv) * ${TK_STIR.glow.halo.toFixed(2)};
  float cover = (1.0 - smoothstep(0.7, 1.0, d)) * (0.8 + 0.2 * (1.0 - d)) + 0.28 * exp(-d * d * 0.9);
#else
  float cover = 1.0 - smoothstep(0.1, 1.0, length(vUv));
#endif
  gl_FragColor = vec4(vColour.rgb, vColour.a * cover);
  #include <tonemapping_fragment>
}`;

/**
 * A collector of a place's moving things. The makers below lay them; `make(materials, tier)` returns
 * { group, tick }: the group to add to the place (before tkKeep) and the tick to pass to tkKeep as `stir`.
 */
export function tkStir(seed = 1) {
  const random = tkRandom(seed * 2654435 + 11);
  const builder = tkgBuilder();
  const pivots = [];
  const stirs = [];
  const sources = { smoke: [], fire: [], spindrift: [], drip: [], glow: [] };
  const world = tkgFrame();
  const laid = () => builder.batches().reduce((sum, batch) => sum + batch.position.length / 3, 0);
  // Everything laid since the last call hangs from `pivotOf(point)` with these figures (TK_STIR_RULE's attributes).
  const hang = (pivotOf, figures) => {
    const [batch] = builder.batches();
    for (let at = pivots.length / 3; at < laid(); at += 1) {
      const pivot = pivotOf([batch.position[at * 3], batch.position[at * 3 + 1], batch.position[at * 3 + 2]]);
      pivots.push(pivot[0], pivot[1], pivot[2]);
      stirs.push(figures[0], figures[1], figures[2], figures[3]);
    }
  };
  // A sheet of cloth from corner `o` along `u` and `v` (world vectors), cut `nu` x `nv` so a wave can run down it.
  const sheet = (o, u, v, nu, nv, colour) => {
    const at = (a, b) => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
    for (let i = 0; i < nu; i += 1) {
      for (let j = 0; j < nv; j += 1) {
        const [a0, a1, b0, b1] = [i / nu, (i + 1) / nu, j / nv, (j + 1) / nv];
        builder.quad('cloth', at(a0, b0), at(a1, b0), at(a1, b1), at(a0, b1), { uvs: [[a0, b0], [a1, b0], [a1, b1], [a0, b1]].map(([a, b]) => [a * Math.hypot(...u), b * Math.hypot(...v)]), colour });
      }
    }
  };
  const stir = {
    /** A paper lantern whose middle hangs at world (x, y, z), `size` m in radius, on its cord. */
    lantern(x, y, z, { size = 0.2, colour = [0.82, 0.16, 0.12], cord = TK_STIR.lantern.cord, phase = null } = {}) {
      const frame = tkgFrame(x, y, z);
      // (A round paper globe on bamboo hoops: seven rings from foot to head, twelve sides, so its outline holds at arm's length.)
      const globe = Array.from({ length: 7 }, (_, k) => [size * Math.max(0.35, Math.cos(((k - 3) / 3) * 1.21)), (size * (k - 3)) / 3]);
      builder.lathe('cloth', frame, 0, 0, globe, { colour, sides: 12 });
      builder.round('cloth', frame, 0, 0, size, size * 1.15, size * 0.38, size * 0.38, { colour: [0.2, 0.16, 0.12], sides: 6 });
      builder.round('cloth', frame, 0, 0, -size * 1.6, -size, size * 0.06, size * 0.3, { colour: [0.75, 0.6, 0.2], sides: 5, caps: '' });
      builder.round('cloth', frame, 0, 0, size * 1.15, size * 1.15 + cord, 0.006, 0.006, { colour: [0.12, 0.1, 0.08], sides: 3, caps: '' });
      const hook = [x, y + size * 1.15 + cord, z];
      // (Its swing's own rate: a pendulum as long as from the hook to its middle.)
      const swing = [phase ?? random() * 6.28, Math.sqrt(9.81 / (size * 1.15 + cord))];
      hang(() => hook, [TK_STIR.lantern.catch, 0, ...swing]);
      return { at: [x, y, z], size, cord, swing };
    },
    /**
     * A lantern (as `lantern` returns it) lit: its light, TK_STIR.glow. `pale` 0 for red paper, 1 for pale. Only the
     * kit's own cord: the light reads its hook from it.
     */
    glow(lantern, pale = 0) {
      sources.glow.push({ at: lantern.at, count: 1, seed: [lantern.swing[0], lantern.swing[1], pale, lantern.size] });
    },
    /**
     * A line from world point `a` to `b` ([x, y, z]) with washing on it. `dry` 0..1: how dry the cloth is; `share`:
     * how much of the line is taken; `pole`: a bamboo pole (stiff, `pole` m thick) in place of a sagging cord.
     */
    washing(a, b, { dry = 0.5, share = 0.75, pole = 0 } = {}) {
      const w = TK_STIR.washing;
      const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const sag = pole ? 0 : w.sag;
      const lineAt = (s) => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s - 4 * sag * span * s * (1 - s), a[2] + (b[2] - a[2]) * s];
      const cuts = pole ? 1 : 8;
      builder.tube('cloth', Array.from({ length: cuts + 1 }, (_, k) => lineAt(k / cuts)), pole || 0.006, pole * 0.8 || 0.006, { sides: pole ? 5 : 3, colour: pole ? [0.62, 0.56, 0.34] : [0.5, 0.44, 0.34] });
      hang((point) => point, [0, 0, 0, 0]);
      const range = ([low, high]) => low + (high - low) * random();
      let s = 0.06 + range(w.gap) / span;
      while (s < 0.94) {
        const wide = range(w.wide);
        const s1 = s + wide / span;
        if (s1 > 0.96) break;
        if (random() < share) {
          const drop = range(w.drop);
          const [p0, p1] = [lineAt(s), lineAt(s1)];
          const colour = w.colours[Math.floor(random() * w.colours.length)].map((value) => value * (0.8 + 0.3 * random()));
          sheet(p0, [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], [0, -drop, 0], 2, 4, colour);
          const catches = w.catch[0] + (w.catch[1] - w.catch[0]) * dry * (0.6 + 0.4 * random());
          // (Each point hangs from the line straight over it.)
          hang((point) => {
            const along = Math.max(0, Math.min(1, ((point[0] - p0[0]) * (p1[0] - p0[0]) + (point[2] - p0[2]) * (p1[2] - p0[2])) / (wide * wide)));
            return [point[0], p0[1] + (p1[1] - p0[1]) * along, point[2]];
          }, [catches, w.flutter, random() * 6.28, Math.sqrt(9.81 / drop)]);
        }
        s = s1 + range(w.gap) / span;
      }
    },
    /**
     * A flag on a pole standing at world (x, z) from `foot` to `top` (m): `fly` m long and `hoist` m deep, tied down
     * the pole from its top; `cut`: 'square' or 'pennon' (its fly end drawn to a point). The pole is laid in `into`
     * (a builder of the place's own, so it throws its shadow), the cloth here.
     */
    flag(into, x, z, foot, top, { fly = 1.6, hoist = 1.1, colour = [0.7, 0.12, 0.1], cut = 'square', pole = 0.035 } = {}) {
      into.round('timber', world, x, z, foot, top, pole, pole * 0.7, { sides: 6, colour: [0.4, 0.32, 0.24] });
      const y1 = top - 0.06;
      // (Laid out toward +x; the wind turns it.)
      if (cut === 'pennon') {
        const cuts = 5;
        for (let i = 0; i < cuts; i += 1) {
          const [a0, a1] = [i / cuts, (i + 1) / cuts];
          const at = (a, b) => [x + fly * a, y1 - hoist * (0.5 + (b - 0.5) * (1 - a)), z];
          builder.quad('cloth', at(a0, 1), at(a1, 1), at(a1, 0), at(a0, 0), { uvs: [[a0 * fly, 0], [a1 * fly, 0], [a1 * fly, hoist], [a0 * fly, hoist]], colour });
        }
      } else sheet([x, y1 - hoist, z], [fly, 0, 0], [0, hoist, 0], 8, 3, colour);
      hang((point) => [x, point[1], z], [-TK_STIR.flag.droop, TK_STIR.flag.flutter, random() * 6.28, 0]);
    },
    /**
     * A tall banner laced to a pole and to a yard at its head (a nobori), the pole at world (x, z) from `foot` to
     * `top`, the cloth `wide` m out from the pole along `yaw` and `long` m down from the yard. `bands`: [share of the
     * length from the top, colour] pairs laid over the field.
     */
    nobori(into, x, z, foot, top, { wide = 0.7, long = 3.2, yaw = 0, colour = [0.8, 0.77, 0.68], bands = [], pole = 0.03 } = {}) {
      const out = [Math.cos(yaw), 0, -Math.sin(yaw)];
      into.round('timber', world, x, z, foot, top, pole, pole * 0.8, { sides: 6, colour: [0.3, 0.26, 0.2] });
      into.tube('timber', [[x, top - 0.08, z], [x + out[0] * (wide + 0.06), top - 0.08, z + out[2] * (wide + 0.06)]], 0.014, 0.014, { sides: 4, colour: [0.3, 0.26, 0.2] });
      const [across, cuts] = TK_STIR.nobori.cuts;
      for (let j = 0; j < cuts; j += 1) {
        const [b0, b1] = [j / cuts, (j + 1) / cuts];
        const tint = bands.find(([from, to]) => (b0 + b1) / 2 >= from && (b0 + b1) / 2 < to)?.[2] ?? colour;
        const worn = (1 - TK_STIR.nobori.grime * ((b0 + b1) / 2) ** 1.6) * (1 - TK_STIR.nobori.tone * random());
        sheet([x + out[0] * 0.03, top - 0.1 - long * b1, z + out[2] * 0.03], [out[0] * wide, 0, out[2] * wide], [0, long * (b1 - b0), 0], across, 1, tint.map((part) => part * worn));
      }
      hang((point) => [x, point[1], z], [0, TK_STIR.nobori.flutter, random() * 6.28, 0]);
    },
    /** Smoke rising from world (x, y, z); `scale`: of TK_STIR.smoke's sizes. */
    smoke(x, y, z, scale = 1) {
      sources.smoke.push({ at: [x, y, z], count: TK_STIR.smoke.count, w: () => scale * (0.8 + 0.4 * random()) });
    },
    /** A fire burning at world (x, y, z), with its smoke; `scale`: of TK_STIR.fire's sizes. */
    fire(x, y, z, scale = 1) {
      sources.fire.push({ at: [x, y, z], count: TK_STIR.fire.count, w: () => scale * (0.7 + 0.6 * random()) });
      stir.smoke(x, y + 0.5 * scale, z, scale);
    },
    /** An edge snow blows off (a wall's top, a ridge): world points `a` to `b`. */
    spindrift(a, b) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      sources.spindrift.push({ a, b, count: Math.max(1, Math.round(length * TK_STIR.spindrift.perMetre)), w: () => 1 });
    },
    /** An eave that drips: world points `a` to `b` along its edge, the ground `ground` m (y) under it. */
    drips(a, b, ground = 0) {
      const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      sources.drip.push({ a, b, count: Math.max(1, Math.round(length * TK_STIR.drip.perMetre)), w: (y) => Math.max(0.2, y - ground) });
    },
    /** The meshes: { group, tick(time, wind, view, open) }. `tier` 'low' draws a third of what the air carries. */
    make(materials, tier = 'high') {
      const group = new THREE.Group();
      group.name = 'townkit:stir';
      const [batch] = builder.batches();
      if (batch?.position.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(batch.position), 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(batch.normal), 3));
        geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(batch.uv), 2));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(batch.colour), 3));
        geometry.setAttribute('aTkPivot', new THREE.BufferAttribute(new Float32Array(pivots), 3));
        geometry.setAttribute('aTkStir', new THREE.BufferAttribute(new Float32Array(stirs), 4));
        geometry.computeBoundingSphere();
        // (What hangs swings out of where it was laid: the sphere is that much wider.)
        geometry.boundingSphere.radius += 3;
        const mesh = new THREE.Mesh(geometry, materials.get('cloth'));
        mesh.name = 'townkit:hung';
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      const share = tier === 'low' ? 1 / 3 : 1;
      const carried = [];
      for (const kind of TK_STIR_KINDS) {
        const spec = TK_STIR[kind];
        const at = [];
        const seeds = [];
        for (const source of sources[kind]) {
          const count = Math.max(1, Math.round(source.count * share));
          for (let k = 0; k < count; k += 1) {
            const s = source.a ? (k + random()) / count : 0;
            const p = source.a ? [0, 1, 2].map((axis) => source.a[axis] + (source.b[axis] - source.a[axis]) * s) : source.at;
            at.push(p[0], p[1], p[2]);
            seeds.push(...(source.seed ?? [random(), random(), random(), source.w(p[1])]));
          }
        }
        if (!at.length) continue;
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
        geometry.setAttribute('aCorner', new THREE.BufferAttribute(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]), 2));
        geometry.setIndex([0, 1, 2, 0, 2, 3]);
        geometry.setAttribute('aAt', new THREE.InstancedBufferAttribute(new Float32Array(at), 3));
        geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 4));
        geometry.instanceCount = at.length / 3;
        const how = { smoke: [spec.life, spec.rise, spec.drag, 0], fire: [spec.life, spec.rise, 0, 0], spindrift: [spec.life, spec.ride, spec.from, spec.full], drip: [spec.every?.[0], spec.every?.[1], spec.wetFrom, 0], glow: [TK_STIR.lantern.catch, TK_STIR.lantern.cord, 0, 0] }[kind];
        const size = { smoke: [spec.size?.[0], spec.size?.[1], spec.alpha, 0], fire: [spec.size, 0, 1, spec.light], spindrift: [spec.size?.[0], spec.size?.[1], spec.alpha, spec.fall], drip: [spec.wide, spec.long, spec.alpha, 0], glow: [spec.halo, 0, 1, spec.light] }[kind];
        const material = new THREE.ShaderMaterial({
          vertexShader: TK_STIR_AIR_VERTEX,
          fragmentShader: TK_STIR_AIR_FRAGMENT,
          defines: { KIND: TK_STIR_KINDS.indexOf(kind) },
          uniforms: {
            ...envUniforms(),
            uTkTime: tkWeather.uTkTime, uTkWet: tkWeather.uTkWet, uTkSnow: tkWeather.uTkSnow, uTkRain: tkWeather.uTkRain, uTkBlow: tkWeather.uTkBlow,
            uHow: { value: new THREE.Vector4(...how) },
            uSize: { value: new THREE.Vector4(...size) },
            uColour: { value: new THREE.Vector3(...(spec.colour ?? spec.colours?.[0] ?? [1, 1, 1])) },
            uColourEnd: { value: new THREE.Vector3(...(spec.colours?.[1] ?? [1, 1, 1])) },
          },
          side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
          blending: kind === 'fire' || kind === 'glow' ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        material.userData.envOwn = true;
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `townkit:air:${kind}`;
        mesh.frustumCulled = false;
        mesh.matrixAutoUpdate = false;
        // (With the open air's own see-through things, after the fight's.)
        mesh.renderOrder = 6;
        // (Not in the puddles' mirror: place.js.)
        mesh.userData.tkAir = true;
        mesh.visible = false;
        carried.push(mesh);
        group.add(mesh);
      }
      // The light in the air (beams.js: a workaround, marked there). Every sheet of it covers the screen, so not on
      // the low tier.
      if (tier !== 'low') {
        const beams = tkBeams();
        carried.push(beams);
        group.add(beams);
      }
      const tick = (time, wind, view, open) => {
        // What the air carries is lit and moved by the open air; without it the place is as it was built.
        // (The sheets of beams.js put right the open air's walk of each sight line: nothing to draw where it walks none.)
        for (const mesh of carried) mesh.visible = open && !(mesh.userData.tkWalked && (view?.env?.airWalk ?? 'none') === 'none');
      };
      return { group, tick };
    },
  };
  return stir;
}
