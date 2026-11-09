// Peoples: what the men of a time and place were, from the records. The one truth both kinds of man are made from:
// the named presets (body.js PRESETS: Wang Er, Hūsun...) give their height, diet and training as their own difference
// from their people, and the soldiers generated for a battle (cast.js builtLike) are drawn about their rank's build.
//
// Each people: `heightCm` its men's mean stature, `weightKg` their mean weight at it (their build: builtLike scales it
// with each man's height), `exercise` how hard their life and drill worked them (0..1), and, where a preset eats from it,
// `calories` the day's diet. `of`: a body of men drawn from another people (Qi Jiguang's recruits are southerners), its
// base that people's. `ranks`: each class or rank within it as a stated difference from that base (picked men taller,
// better fed, harder drilled; `{}` the people's own ordinary man). A rank may also give, as they are: `skill` (body.js),
// `spread` (of height and weight, builtLike), and `mix` ([share, a difference from the rank], cast.js builtLike) with
// `ages` bands.
export const PEOPLES = {
  // Ming China, c. 1600: Ming burials of northern Han men give a stature about 164-166 cm (northern Ming-Qing series
  // generally 162-167); the soldier's ration about a sheng and a half of grain a day (about 1 kg: ~3000 kcal) with
  // little meat, often in arrears (`calories`); a garrison man (weisuo) drilled little, his officers' tenant as much as
  // their soldier (`exercise`).
  // The fighting men set a little above that mean by the user's choice (2026-11-07): soldiers were picked, and men of
  // the records' size read too small to today's eye. Brought back down to the records' upper middle on the user's call
  // (2026-11-08, "slightly tune down"): 164 cm, the weight at his height (65 × (164/166)²).
  ming: {
    heightCm: 164, weightKg: 63, calories: 3000, exercise: 0.5,
    ranks: {
      garrison: {},
      // The regulars in brigandine: paid men, picked a little for size, drilled.
      brigandine: { heightCm: 3, weightKg: 3, exercise: 0.18 },
      // The generals' household men (jiading): picked for size, fed by their master, at arms all their lives.
      elite: { heightCm: 6, weightKg: 7, exercise: 0.25 },
    },
  },
  // Southern Han (Zhejiang, Fujian): a little shorter and lighter than northern men (southern Ming-Qing series about
  // 161-164 cm); the weisuo the same little-drilled garrison as the north's (ming `exercise`).
  mingSouth: {
    heightCm: 163, weightKg: 59, exercise: 0.5,
    ranks: {
      garrison: {},
      brigandine: { heightCm: 2, weightKg: 3, exercise: 0.15 },
      // Koxinga picked his "iron men" by strength (they had to lift a stone lion): his elite is the big men of his army.
      elite: { heightCm: 7, weightKg: 11, exercise: 0.3 },
      // Sea raiders: short, thick men of the boats and the oar, heavy for their height.
      raider: { heightCm: -3, weightKg: 5, exercise: 0.16 },
    },
  },
  // Qi Jiguang's army (1559 on): not the weisuo's hereditary men but Yiwu miners and hill farmers he recruited himself,
  // after seeing the Yiwu men fight the silver-mine feud of 1558. He chose them for it (the Jixiao xinshu wants
  // countrymen, strong and plain, and turns away the quick-talking men of the towns), fed and paid them, and drilled them
  // daily with weapon and shield: southerners of the coast's height, a few kilograms heavier than its other regulars
  // (mingSouth brigandine), and harder worked (`exercise`). And trained: `skill` (body.js; their kit, the brigandine's,
  // is 0.35, a regular's) half again, a man who has struck and parried at the post every day for a year, short of the
  // 0.45 of a professional elite. His guards are his household men, as Koxinga's elite.
  qi: {
    of: 'mingSouth',
    ranks: {
      brigandine: { heightCm: 2, weightKg: 6, exercise: 0.3, skill: 0.5 },
      elite: { heightCm: 7, weightKg: 11, exercise: 0.3, skill: 0.55 },
    },
  },
  // The weisuo garrisons of the Zhejiang coast in the 1550s, as the raids found them: hereditary soldier households,
  // unpaid, their men worked as servants by their officers, the able-bodied long run off. What was left to muster was a
  // mixed lot, drawn by `mix`: the household soldiers, grown men in their twenties and thirties, lean and little
  // drilled; the old, men in their late forties and fifties and past sixty, stooped, their wind and their joints half
  // gone, kept on the rolls for their fathers' sake; and the thin, underfed boys and young men, small, light and hardly
  // exercised (a bad year's hunger takes strength and wind, body.js: a body below its healthy weight is older than its
  // years), taught nothing (`skill`, the levy's). Half again the usual spread of height and weight (`spread`). The few
  // regulars among them are as Koxinga's (mingSouth brigandine).
  mingCoast: {
    of: 'mingSouth',
    ranks: {
      garrison: {
        heightCm: -1, weightKg: -5, exercise: -0.05, spread: 1.5,
        mix: [
          [0.4, { ages: [[1, 22, 40]] }],
          [0.3, { ages: [[1, 47, 66]], exercise: -0.1 }],
          [0.3, { ages: [[1, 16, 30]], heightCm: -6, weightKg: -9, exercise: -0.15, skill: 0.15 }],
        ],
      },
      brigandine: { heightCm: 2, weightKg: 3, exercise: 0.15 },
    },
  },
  // The Jianzhou Jurchen of Nurhaci (Sarhu, 1619): hunters, herders and farmers, more meat and dairy than the Ming's
  // levies and at the bow and on horse from boyhood, but no giants: Qing bannermen and their descendants about
  // 165-168 cm, heavy for it (`weightKg`, the steppe's build). The hunt (the banner company was the hunting band) kept
  // them harder than a garrison man (`exercise`).
  // The fighting men set well above that mean by the user's choice (2026-11-07): the companies sent their strongest,
  // the banners were hunters fed on meat, and they must stand up to the Sultanates' men (ottoman); kept close to the
  // builds first given them (177-182 cm), a few centimetres down. Down again on the user's call (2026-11-08, "slightly
  // tune down"): 168 cm, the top of the records' range, the weight at his height (81 × (168/171)²).
  jurchen: {
    heightCm: 168, weightKg: 78, calories: 4300, exercise: 0.85,
    ranks: {
      // The company (niru) sent its able-bodied men to war, not all of them: a little above the people.
      banner: { heightCm: 2, weightKg: 2, exercise: 0.05 },
      // The Bayara, the guard: picked from the companies for strength and the bow (Yangguri, Darhan: body.js).
      bayara: { heightCm: 6, weightKg: 7, exercise: 0.1 },
    },
  },
  // Japanese men of the Sengoku and Edo periods: from skeletons about 155-158 cm (Hiramoto's series: Muromachi ~157,
  // Edo ~155-157), light. The samurai, fed better from the class's rice, barely taller than the commoners (Edo samurai
  // and daimyo remains a few cm above the townsmen); the rōnin lean and hard, living by the sword; the sōhei fed, hard
  // worked, drilled past an ashigaru but short of a samurai's lifetime (`skill`).
  japanese: {
    heightCm: 157, weightKg: 55, exercise: 0.6,
    ranks: {
      ashigaru: {},
      samurai: { heightCm: 3, weightKg: 3, exercise: 0.1 },
      ronin: { heightCm: 1, weightKg: 5, exercise: 0.32 },
      // Sea raiders: short, thick men of the boats, heavy for their height (as mingSouth's).
      raider: { heightCm: -2, weightKg: 5, exercise: 0.12 },
      sohei: { heightCm: 3, weightKg: 7, exercise: 0.2, skill: 0.6 },
    },
  },
  // Castilian men of the early 1500s about 163-167 cm (Spanish skeletal series of the period, ~165), at a peasant's
  // work. The men who crossed to the Indies were picked and hardened (veterans of Italy, hidalgos raised to arms): a
  // little above the Castilian mean (selection by hardiness, not by height), toughened by years of war (`exercise`).
  spanish: {
    heightCm: 165, weightKg: 66, exercise: 0.6,
    ranks: {
      // Set well above the Castilian mean by the user's choice (2026-11-03, "taller and stronger"), kept as chosen.
      soldier: { heightCm: 7, weightKg: 6, exercise: 0.24 },
      // The hidalgos, fed as their rank was.
      officer: { heightCm: 9, weightKg: 9, exercise: 0.26 },
    },
  },
  // The Mexica a few centimetres shorter than the Castilians (Tlatelolco and Valley of Mexico series about 160-163 cm),
  // lean, trained for war from youth in the telpochcalli; the jaguar and eagle orders a little bigger and harder.
  mexica: {
    heightCm: 160, weightKg: 58, exercise: 0.72,
    ranks: {
      warrior: {},
      elite: { heightCm: 2, weightKg: 2, exercise: 0.1 },
    },
  },
  // Andean men of the Inca period: from highland skeletons about 157-160 cm, short and stocky, broad and deep in the
  // chest (bodies made at 2,700 m and more), heavy for their height. The commons (hatun runa) carried, built and walked
  // the roads under the mit'a; the litter's bearers (the Lucanas) were picked for it. The lords of the Inca's lineage ate
  // better and were trained to arms in their youth (the warachikuy): a little taller and fitter.
  inca: {
    heightCm: 157, weightKg: 62, exercise: 0.7,
    ranks: {
      commoner: {},
      noble: { heightCm: 3, weightKg: 3, exercise: 0.04 },
    },
  },
  // The Hospitallers at Rhodes: western Europeans of c. 1500 (French, Spanish, Italian, English series about
  // 166-170 cm). Their sergeants and gunners men of the commons; the knights nobles, fed and trained from boyhood.
  hospitaller: {
    heightCm: 167, weightKg: 66, exercise: 0.65,
    ranks: {
      sergeant: {},
      knight: { heightCm: 3, weightKg: 5, exercise: 0.1 },
    },
  },
  // Ottoman men of the 1500s: Anatolian and Balkan series of the period about 165-169 cm. The fighting men are their
  // own people's, picked: the azaps levied but sturdy peasants; the Janissaries picked from the devşirme's tallest and
  // strongest boys and drilled for life; the heavy sipahis landholders fed on meat and at arms from boyhood. Heavy for
  // their height (`weightKg`), as their men were built.
  ottoman: {
    // Set well above that range by the user's choice (2026-11-03, "much stronger"), kept as chosen.
    heightCm: 175, weightKg: 80, exercise: 0.88,
    ranks: {
      azap: {},
      janissary: { heightCm: 5, weightKg: 8, exercise: 0.08 },
      heavy: { heightCm: 5, weightKg: 11, exercise: 0.07 },
    },
  },
  // Medieval Mongol and Oirat men, from skeletons about 163-167 cm, lean and hard. Steppe men: short and squat, heavy
  // for their height (riders' bodies, fed on meat and milk); the heavier the kit, the bigger and less lithe the man.
  steppe: {
    heightCm: 164, weightKg: 74, exercise: 0.7,
    ranks: {
      light: {},
      medium: { heightCm: 1, weightKg: 4, exercise: -0.04 },
      heavy: { heightCm: 3, weightKg: 9, exercise: -0.08 },
    },
  },
  // Dutch soldiers of the 1660s, among Europe's taller men then (Dutch conscripts and skeletons of the 1600s about
  // 166-170 cm).
  dutch: {
    heightCm: 168, weightKg: 65, exercise: 0.6,
    ranks: {
      soldier: {},
      officer: { heightCm: 2, weightKg: 3 },
    },
  },
  // English archers of the fifteenth century, from the Mary Rose's bowmen and the Towton grave: ~171 cm, heavy-boned and
  // strong in the shoulders from a boyhood at the butts; the men-at-arms, fed and trained to arms, about the same.
  english: {
    heightCm: 171, weightKg: 70, exercise: 0.86,
    ranks: {
      archer: {},
      manAtArms: { heightCm: 1, weightKg: 4, exercise: -0.06 },
    },
  },
  // The French of 1415 and 1503: the Gascon and Picard foot, smaller men of the commons (~167 cm); the men-at-arms
  // nobles, fed and trained to arms, as tall as the English ones.
  french: {
    heightCm: 167, weightKg: 64, exercise: 0.62,
    ranks: {
      foot: {},
      knight: { heightCm: 4, weightKg: 9, exercise: 0.16 },
    },
  },
  // The Swiss and the Landsknechts of 1500 a little shorter than the English (~168 cm), hardened by years of
  // campaigning; the Swiss the harder drilled.
  swiss: { heightCm: 168, weightKg: 67, exercise: 0.8, ranks: { pike: {} } },
  landsknecht: { heightCm: 168, weightKg: 67, exercise: 0.74, ranks: { pike: {} } },
};

// Rounded so a sum lands on the figure it states (0.5 + 0.18 is 0.68, not 0.6799...).
const sumOf = (base, difference, places) => Math.round((base + (difference ?? 0)) * 10 ** places) / 10 ** places;

/** A build from a base and a difference (heightCm, weightKg, exercise added; any other field as it is). */
function withDifference(base, { heightCm, weightKg, exercise, ...rest }) {
  return { ...rest, heightCm: sumOf(base.heightCm, heightCm, 0), weightKg: sumOf(base.weightKg, weightKg, 1), exercise: sumOf(base.exercise, exercise, 3) };
}

/** Every people's ranks as builds (mean height, weight and training; cast.js builtLike): `{ people: { rank: build } }`. */
export function peopleBuilds(peoples = PEOPLES) {
  const builds = {};
  for (const [name, people] of Object.entries(peoples)) {
    const base = people.of ? peoples[people.of] : people;
    builds[name] = {};
    for (const [rank, difference] of Object.entries(people.ranks)) {
      const { mix, ...own } = difference;
      const build = withDifference(base, own);
      builds[name][rank] = mix ? { ...build, mix: mix.map(([share, kind]) => [share, withDifference(build, kind)]) } : build;
    }
  }
  return builds;
}
