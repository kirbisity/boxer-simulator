// PROOF OF CONCEPT, beasts round 1: characters that are not men, kept out of PRESETS (and so out of the
// pickers, the casts and the battles) until one is chosen. Each is a fixed build as body.js's gorilla is;
// its style is in moves.js STYLES (hidden), its coat or chassis in outfits.js OUTFITS. Drop this file and
// those entries and nothing else changes.
//
// Use: createWorld([BEAST_PRESETS.macaque, PRESETS.street]); in the page, fight([{ preset: 'gorilla',
// ...BEAST_PRESETS.macaque }], ...) after import('/src/beasts.js').

export const BEAST_PRESETS = {
  // Three primates smaller than a man, built as the gorilla is (a fixed `build`, shares of the height for
  // the limbs, muscle per kilogram, bones by section). The height is the animal reared up on its hind legs,
  // the way it stands to fight; each runs in on all fours (STYLES `charge`). The coat is the skin's colour
  // (`skinColor`), as the gorilla's. Bones as the gorilla's: a bone's strength goes with its section,
  // ~mass^(2/3) against an 80 kg man's. Bite (STYLES `bite`): a jaw's force goes with its muscles'
  // section, ~mass^(2/3), scaled from the silverback's ~2.5 kN at the canines, and goes in as deep as the
  // canines are long. Brain (`brain`): a small brain takes a far harder jolt than a man's before it is
  // concussed: the tolerable acceleration goes as brain mass^(-2/3) (Holbourn 1943; Ommaya et al. 1967, the
  // scaling from the rhesus experiments to men), taken here on the head's speed change over a like contact.
  // A man's brain ~1.35 kg; a rhesus's ~0.09 kg (x6.1), a chacma's ~0.19 kg (x3.7), a chimpanzee's ~0.38 kg
  // (x2.3). (The gorilla, ~0.5 kg, would be x1.9; left as it was, to keep its fights as they were.)
  //
  // A rhesus macaque, an adult male: head and body ~0.5 m, ~8 kg (males 7.7 kg on average; Napier &
  // Napier, *A Handbook of Living Primates*), reared up ~0.6 m. Limbs near equal (intermembral index ~93),
  // a big head for the body, a narrow chest. Monkey muscle per kilogram is put at the chimpanzee's (~1.35x a
  // man's, O'Neill et al. 2017), its fast fibres high (macaque limb muscle is mostly fast). Bones
  // (8/80)^(2/3) ≈ 0.22 of a man's. Lean (~5% fat, as wild males are).
  macaque: {
    name: 'Rhesus', style: 'macaque', sex: 'male', heightCm: 60, frame: 'medium', age: 25, exercise: 0.6, calories: 2800, skill: 0.25,
    build: {
      massKg: 8.5, bodyFat: 0.05, strength: 1.35, fast: 1.25, bulk: 1, bones: 0.22, brain: 6.1,
      lengths: { thigh: 0.23, shank: 0.22, trunk: 0.33, neckToHead: 0.09, upperArm: 0.2, forearmToFist: 0.24, shoulderSpan: 0.17, hipSpan: 0.11, headRadius: 0.075 },
      muscle: { upperArm: 1.2, forearm: 1.2, thigh: 1.1, shank: 1 },
    },
    outfit: { kind: 'monkeyFur', design: 0 }, accessories: [],
    look: { skinTone: 'light', skinColor: '#8a7656', hairStyle: 'bald', hairColor: '#8a7656', facialHair: 'none', eyeColor: 'brown' },
  },
  // A chacma baboon, an adult male: ~30 kg (males ~31 kg, females half that: the most dimorphic of the
  // monkeys), head and body ~0.8 m, reared up ~1.0 m. Its arms nearly as long as its legs (intermembral
  // ~97), a long muzzle and the longest canines for its size of any primate (~4 cm in a male, longer than a
  // leopard's; Plavcan 2001), slashed in fights with other males and with leopards and dogs, which they kill.
  // Bones (30/80)^(2/3) ≈ 0.52 of a man's.
  baboon: {
    name: 'Chacma', style: 'baboon', sex: 'male', heightCm: 100, frame: 'large', age: 25, exercise: 0.6, calories: 2800, skill: 0.3,
    build: {
      massKg: 30, bodyFat: 0.05, strength: 1.35, fast: 1.2, bulk: 1.2, bones: 0.52, brain: 3.7,
      lengths: { thigh: 0.23, shank: 0.22, trunk: 0.34, neckToHead: 0.09, upperArm: 0.23, forearmToFist: 0.26, shoulderSpan: 0.19, hipSpan: 0.11, headRadius: 0.07 },
      muscle: { upperArm: 1.3, forearm: 1.3, thigh: 1, shank: 0.9 },
    },
    outfit: { kind: 'monkeyFur', design: 1 }, accessories: [],
    look: { skinTone: 'deep', skinColor: '#6e6248', hairStyle: 'bald', hairColor: '#6e6248', facialHair: 'none', eyeColor: 'brown' },
  },
  // A common chimpanzee, an adult male: ~1.2 m reared up, ~55 kg (wild males 40-60 kg), ~6% fat. Its arms
  // long (intermembral ~106, span ~1.1x height), its legs short; muscle ~1.35 times a man's in force and
  // power per kilogram, with more fast fibres (O'Neill et al. 2017, PNAS: the paper the gorilla is built on),
  // more of it in the arms. Not the "five times as strong" of the stories: measured pulls are ~1.5x per
  // kilogram at most. Canines ~2.5 cm in a male. Bones (55/80)^(2/3) ≈ 0.78 of a man's. Fights as Goodall
  // saw chimpanzees attack: rushing in, grabbing, beating with the arms, biting the hands, feet and face.
  chimp: {
    name: 'Bruno', style: 'chimp', sex: 'male', heightCm: 120, frame: 'large', age: 22, exercise: 0.6, calories: 2800, skill: 0.3,
    build: {
      massKg: 55, bodyFat: 0.06, strength: 1.35, fast: 1.15, bulk: 1.6, bones: 0.78, brain: 2.3,
      lengths: { thigh: 0.22, shank: 0.2, trunk: 0.36, neckToHead: 0.1, upperArm: 0.27, forearmToFist: 0.28, shoulderSpan: 0.23, hipSpan: 0.12, headRadius: 0.065 },
      muscle: { upperArm: 1.5, forearm: 1.6, thigh: 0.8, shank: 0.7 },
    },
    outfit: { kind: 'monkeyFur', design: 2 }, accessories: [],
    look: { skinTone: 'deep', skinColor: '#1c1918', hairStyle: 'bald', hairColor: '#1c1918', facialHair: 'none', eyeColor: 'brown' },
  },
  // The robot dogs (src/robotdogs.js): each is what it carries on its back, seated on the robot as a rider on his horse
  // (physics/mounted.js; `mounted`, its kit's `horse`), bolted there; that is the fighter the bout counts, out when the
  // robot is down. Its build is the thing itself, rigid, no fat, a machine's battery: a Go2's sensor head and computer
  // (~2 kg), Spot's arm (~8 kg; 0.98 m of reach: its arm's share of a 0.7 m "height"), the SPUR turret and its mount (~9 kg;
  // its pan-and-tilt motors geared to hold the rifle steady: `strength` 4, motor torque per kg against a man's muscle).
  dogGo2: {
    name: 'Go2', style: 'dogRam', sex: 'male', heightCm: 40, frame: 'small', age: 27, exercise: 0.6, calories: 2800, skill: 0.6, mounted: true,
    build: { massKg: 2, bodyFat: 0, strength: 1, aerobic: 1.1, rigid: true },
    outfit: { kind: 'go2Dog', design: 0 }, accessories: [],
    look: { skinTone: 'deep', skinColor: '#2a2b2f', hairStyle: 'bald', hairColor: '#2a2b2f', facialHair: 'none', eyeColor: 'brown' },
  },
  dogSpot: {
    name: 'Spot', style: 'dogGrip', sex: 'male', heightCm: 70, frame: 'small', age: 27, exercise: 0.6, calories: 2800, skill: 0.6, mounted: true,
    build: { massKg: 8, bodyFat: 0, strength: 1, aerobic: 1.1, rigid: true, lengths: { upperArm: 0.7, forearmToFist: 0.7 } },
    outfit: { kind: 'spotDog', design: 0 }, accessories: [],
    look: { skinTone: 'deep', skinColor: '#1d1e22', hairStyle: 'bald', hairColor: '#1d1e22', facialHair: 'none', eyeColor: 'brown' },
  },
  dogVision60: {
    name: 'Vision 60', style: 'dogTurret', sex: 'male', heightCm: 50, frame: 'small', age: 27, exercise: 0.6, calories: 2800, skill: 0.7, mounted: true,
    build: { massKg: 9, bodyFat: 0, strength: 4, aerobic: 1.1, rigid: true },
    outfit: { kind: 'vision60Dog', design: 0 }, accessories: [],
    look: { skinTone: 'deep', skinColor: '#2b2f28', hairStyle: 'bald', hairColor: '#2b2f28', facialHair: 'none', eyeColor: 'brown' },
  },
};
