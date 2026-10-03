// Fighting styles and their moves. A move is data: which limb strikes, the
// path its target takes, how the trunk turns and leans, what it costs, and
// how much of the body's mass is behind it. The physics executes it with the
// fighter's own muscles, so a kick is as fast as that leg can make it.

// The striking limb's local path is built from the aim point (the target on
// the opponent, in the attacker's frame: x forward, y up, z left) and the
// limb's side (+1 left, -1 right). Each path returns the targets it drives.
export const MOVES = {
  // Punches.
  jab: { kind: 'strike', limb: 'lHand', path: 'straight', windup: 0, extendUntil: 0.2, duration: 0.34, twist: 0.12, shift: 0.05, cost: 0.012, mass: { arm: 0.55 }, rotation: 0.85, zones: ['head', 'body'], reach: 'arm' },
  cross: { kind: 'strike', limb: 'rHand', path: 'straight', windup: 0, extendUntil: 0.26, duration: 0.44, twist: -0.85, shift: 0.06, cost: 0.02, mass: { arm: 0.6, body: 0.012 }, rotation: 1, zones: ['head', 'body'], reach: 'arm' },
  hook: { kind: 'strike', limb: 'lHand', path: 'hook', windup: 0.09, extendUntil: 0.3, duration: 0.48, twist: 0.45, shift: 0.02, cost: 0.024, mass: { arm: 0.6, body: 0.01 }, rotation: 1.35, zones: ['head', 'body'], reach: 'close' },
  uppercut: { kind: 'strike', limb: 'rHand', path: 'upper', windup: 0.08, extendUntil: 0.28, duration: 0.46, twist: -0.55, dip: 0.02, cost: 0.024, mass: { arm: 0.6, body: 0.01 }, rotation: 1.25, zones: ['head', 'body'], reach: 'close' },
  // Elbows: short, sharp, cutting; the forearm folds and the point leads.
  elbow: { kind: 'strike', limb: 'rElbow', path: 'elbow', windup: 0.09, extendUntil: 0.26, duration: 0.44, twist: -1.25, shift: 0.07, cost: 0.02, mass: { arm: 0.75, body: 0.02 }, rotation: 1.3, cuts: true, zones: ['head'], reach: 'close' },
  upElbow: { kind: 'strike', limb: 'lElbow', path: 'upElbow', windup: 0.05, extendUntil: 0.22, duration: 0.4, twist: 0.3, shift: 0.04, cost: 0.02, mass: { arm: 0.7, body: 0.018 }, rotation: 1.25, cuts: true, zones: ['head'], reach: 'close' },
  // Knee: driven up and forward with the hips.
  knee: { kind: 'strike', limb: 'rKnee', path: 'knee', windup: 0.06, extendUntil: 0.3, duration: 0.55, twist: -0.3, shift: 0.05, lean: -0.1, cost: 0.03, mass: { leg: 0.5, body: 0.05 }, rotation: 0.9, zones: ['body', 'head'], reach: 'close' },
  // Kicks: chamber, then the shin or foot swings or drives through.
  roundhouse: { kind: 'strike', limb: 'rFoot', path: 'roundhouse', windup: 0.12, extendUntil: 0.36, duration: 0.7, twist: -1.25, lean: -0.22, cost: 0.04, mass: { leg: 0.55, body: 0.025 }, rotation: 1.45, zones: ['body', 'head'], reach: 'leg' },
  lowKick: { kind: 'strike', limb: 'rFoot', path: 'roundhouse', windup: 0.1, extendUntil: 0.32, duration: 0.62, twist: -1.1, lean: -0.12, cost: 0.03, mass: { leg: 0.55, body: 0.02 }, rotation: 1, zones: ['legs'], reach: 'leg' },
  teep: { kind: 'strike', limb: 'lFoot', path: 'teep', windup: 0.14, extendUntil: 0.34, duration: 0.6, twist: 0.1, lean: -0.18, cost: 0.03, mass: { leg: 0.45, body: 0.12 }, rotation: 0.5, push: true, zones: ['body'], reach: 'leg' },
  // Sumo: open-hand thrusts to the chest (tsuppari), a two-handed drive
  // with the legs behind it (oshi). An open palm spreads the blow over a
  // longer contact (`contactSeconds`) and harms little (`harm`); the push
  // is the point: momentum into the man's balance.
  // `shove`: while the hands are on him, the legs keep driving (share of the drive).
  tsuppariL: { kind: 'strike', limb: 'lHand', path: 'straight', windup: 0, extendUntil: 0.2, duration: 0.34, twist: 0.25, shift: 0.07, cost: 0.014, mass: { arm: 0.65, body: 0.04 }, rotation: 0.4, push: true, shove: 0.6, harm: 0.35, contactSeconds: 0.03, zones: ['body', 'head'], reach: 'arm' },
  tsuppariR: { kind: 'strike', limb: 'rHand', path: 'straight', windup: 0, extendUntil: 0.22, duration: 0.36, twist: -0.3, shift: 0.07, cost: 0.014, mass: { arm: 0.65, body: 0.04 }, rotation: 0.4, push: true, shove: 0.6, harm: 0.35, contactSeconds: 0.03, zones: ['body', 'head'], reach: 'arm' },
  oshi: { kind: 'strike', limb: 'rHand', path: 'pushBoth', windup: 0.08, extendUntil: 0.36, duration: 0.6, twist: 0, shift: 0.12, lean: 0.25, dip: 0.03, step: 1.4, cost: 0.03, mass: { arm: 1.2, body: 0.14 }, rotation: 0.2, push: true, shove: 1.2, harm: 0.2, contactSeconds: 0.05, zones: ['body'], reach: 'arm' },
  // Weapon moves (path 'blade'): the main hand and the blade follow a path
  // from `from` to `to` (hand in heights, local; dir where the weapon points),
  // bent through the aim; `grip` says whether both hands hold it. A thrust
  // drives the point along the line to the aim instead, the legs driving
  // in behind it at `step` × footwork speed. `mid` is where the
  // blade points as it passes through the aim. `sweep`: the swing
  // carries on through, so it can take more than one man.
  // Katana: cut from an upright guard, two hands always.
  shomen: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.02, 0.98, -0.02], dir: [-0.65, 0.75, 0] }, mid: [0.9, 0.3, 0], to: { hand: [0.3, 0.5, 0], dir: [0.5, -0.85, 0] }, windup: 0.14, extendUntil: 0.36, duration: 0.72, twist: -0.15, lean: 0.14, shift: 0.07, cost: 0.03, mass: { arm: 0.6, body: 0.03 }, rotation: 0.8, zones: ['head'], reach: 'weapon' },
  kesagiri: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.02, 0.92, -0.15], dir: [-0.4, 0.7, -0.6] }, mid: [0.9, 0.15, 0.1], to: { hand: [0.27, 0.42, 0.18], dir: [0.45, -0.7, 0.55] }, windup: 0.14, extendUntil: 0.36, duration: 0.72, twist: -0.5, lean: 0.12, shift: 0.06, cost: 0.03, mass: { arm: 0.6, body: 0.03 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon' },
  gyakuKesa: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.05, 0.9, 0.12], dir: [-0.4, 0.7, 0.6] }, mid: [0.9, 0.15, -0.1], to: { hand: [0.27, 0.42, -0.2], dir: [0.45, -0.7, -0.55] }, windup: 0.14, extendUntil: 0.36, duration: 0.72, twist: 0.4, lean: 0.12, shift: 0.06, cost: 0.03, mass: { arm: 0.6, body: 0.03 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon' },
  yokogiri: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', sweep: true, from: { hand: [0.04, 0.68, -0.26], dir: [-0.2, 0.12, -1] }, mid: [1, 0.05, 0], to: { hand: [0.2, 0.66, 0.26], dir: [0.15, 0.05, 1] }, windup: 0.13, extendUntil: 0.36, duration: 0.7, twist: -0.75, lean: 0.06, shift: 0.04, cost: 0.03, mass: { arm: 0.6, body: 0.035 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon' },
  kiriage: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.14, 0.4, -0.18], dir: [0.4, -0.6, -0.6] }, mid: [0.9, 0.1, 0], to: { hand: [0.12, 0.86, 0.12], dir: [0.3, 0.8, 0.5] }, windup: 0.12, extendUntil: 0.34, duration: 0.68, twist: 0.3, lean: 0.04, shift: 0.04, cost: 0.028, mass: { arm: 0.55, body: 0.025 }, rotation: 0.8, zones: ['body'], reach: 'weapon' },
  tsuki: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'two', from: { hand: [0.12, 0.6, 0], dir: [1, 0.2, 0] }, windup: 0.08, extendUntil: 0.32, duration: 0.55, twist: -0.1, lean: 0.16, shift: 0.1, depth: 0.25, step: 1.6, cost: 0.025, mass: { arm: 0.6, body: 0.05 }, rotation: 0.6, zones: ['body', 'head'], reach: 'weapon' },
  // Long sword: two hands for the cuts (the middle cut sweeps), one for the lunge.
  oberhau: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.0, 0.94, -0.16], dir: [-0.45, 0.65, -0.6] }, mid: [0.9, 0.15, 0.1], to: { hand: [0.27, 0.42, 0.18], dir: [0.45, -0.7, 0.55] }, windup: 0.16, extendUntil: 0.4, duration: 0.78, twist: -0.5, lean: 0.12, shift: 0.07, cost: 0.034, mass: { arm: 0.6, body: 0.035 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon' },
  zwerchhau: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', sweep: true, from: { hand: [0.03, 0.72, -0.28], dir: [-0.25, 0.15, -1] }, mid: [1, 0.05, 0], to: { hand: [0.2, 0.68, 0.28], dir: [0.15, 0.05, 1] }, windup: 0.16, extendUntil: 0.42, duration: 0.8, twist: -0.8, lean: 0.06, shift: 0.05, cost: 0.036, mass: { arm: 0.6, body: 0.04 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon' },
  unterhau: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.14, 0.4, -0.2], dir: [0.4, -0.6, -0.6] }, mid: [0.9, 0.1, 0], to: { hand: [0.12, 0.86, 0.12], dir: [0.3, 0.8, 0.5] }, windup: 0.14, extendUntil: 0.38, duration: 0.74, twist: 0.3, lean: 0.04, shift: 0.04, cost: 0.03, mass: { arm: 0.55, body: 0.03 }, rotation: 0.8, zones: ['body'], reach: 'weapon' },
  lunge: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.1, 0.62, -0.08], dir: [1, 0.15, 0] }, windup: 0.1, extendUntil: 0.36, duration: 0.62, twist: -0.6, lean: 0.2, shift: 0.15, depth: 0.25, step: 2.4, cost: 0.03, mass: { arm: 0.6, body: 0.05 }, rotation: 0.6, zones: ['body', 'head'], reach: 'weapon' },
  // Police baton: forehand strikes high and low, and a short jab with the tip.
  overhand: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'one', from: { hand: [-0.02, 0.92, -0.2], dir: [-0.6, 0.6, -0.3] }, mid: [0.9, 0.2, 0.1], to: { hand: [0.3, 0.55, 0.1], dir: [0.5, -0.6, 0.4] }, windup: 0.14, extendUntil: 0.36, duration: 0.58, twist: -0.7, lean: 0.12, shift: 0.05, cost: 0.024, mass: { arm: 0.6, body: 0.015 }, rotation: 1.15, zones: ['head', 'body'], reach: 'weapon', contactAt: 0.7 },
  forehand: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'one', from: { hand: [0.0, 0.72, -0.3], dir: [-0.4, 0.3, -0.85] }, mid: [1, 0.05, 0], to: { hand: [0.25, 0.62, 0.15], dir: [0.3, 0, 0.95] }, windup: 0.14, extendUntil: 0.36, duration: 0.56, twist: -0.85, lean: 0.06, shift: 0.04, cost: 0.024, mass: { arm: 0.6, body: 0.015 }, rotation: 1.3, zones: ['body', 'head'], reach: 'weapon', contactAt: 0.7 },
  legSwing: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'one', from: { hand: [0.04, 0.76, -0.24], dir: [-0.3, 0.7, -0.5] }, mid: [0.8, -0.4, 0.1], to: { hand: [0.3, 0.32, 0.1], dir: [0.4, -0.7, 0.4] }, windup: 0.14, extendUntil: 0.38, duration: 0.6, twist: -0.6, lean: 0.18, dip: 0.04, shift: 0.05, cost: 0.024, mass: { arm: 0.6, body: 0.015 }, rotation: 1, zones: ['legs'], reach: 'weapon', contactAt: 0.7 },
  poke: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.12, 0.66, -0.1], dir: [1, 0.1, 0] }, windup: 0.05, extendUntil: 0.27, duration: 0.45, twist: -0.4, lean: 0.1, shift: 0.07, depth: 0.25, step: 1.2, cost: 0.016, mass: { arm: 0.6, body: 0.02 }, rotation: 0.5, zones: ['body', 'head'], reach: 'weapon' },
  // Knife: thrusts, short and quick, from a low guard.
  stab: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.16, 0.6, -0.1], dir: [1, 0.15, 0.05] }, windup: 0.04, extendUntil: 0.25, duration: 0.42, twist: -0.6, lean: 0.12, shift: 0.07, depth: 0.25, step: 1.3, cost: 0.016, mass: { arm: 0.6, body: 0.02 }, rotation: 0.6, zones: ['body'], reach: 'weapon' },
  upStab: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.1, 0.44, -0.1], dir: [0.75, 0.65, 0] }, windup: 0.06, extendUntil: 0.27, duration: 0.45, twist: -0.4, lean: 0.1, dip: 0.03, shift: 0.06, depth: 0.25, step: 1.2, cost: 0.018, mass: { arm: 0.6, body: 0.025 }, rotation: 0.6, zones: ['body'], reach: 'weapon' },
  highStab: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.12, 0.74, -0.12], dir: [1, 0.25, 0.05] }, windup: 0.05, extendUntil: 0.27, duration: 0.45, twist: -0.65, lean: 0.12, shift: 0.07, depth: 0.25, step: 1.3, cost: 0.018, mass: { arm: 0.6, body: 0.02 }, rotation: 0.6, zones: ['head'], reach: 'weapon' },
  // Polearms: the head swung or driven from well back; slow to wind, long in reach.
  hammerOverhead: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.0, 0.95, -0.1], dir: [-0.5, 0.85, -0.1] }, mid: [0.85, 0.5, 0], to: { hand: [0.3, 0.55, 0.05], dir: [0.6, -0.8, 0.05] }, windup: 0.26, extendUntil: 0.56, duration: 1.0, twist: -0.4, lean: 0.16, shift: 0.08, cost: 0.045, mass: { arm: 0.7, body: 0.06 }, rotation: 1.2, zones: ['head', 'body'], reach: 'weapon', contactAt: 0.88 },
  hammerSide: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.02, 0.7, -0.3], dir: [-0.3, 0.3, -0.9] }, mid: [1, 0.15, 0], to: { hand: [0.22, 0.66, 0.25], dir: [0.2, 0.05, 1] }, windup: 0.24, extendUntil: 0.54, duration: 0.95, twist: -0.9, lean: 0.08, shift: 0.06, cost: 0.045, mass: { arm: 0.7, body: 0.06 }, rotation: 1.4, zones: ['head', 'body'], reach: 'weapon', contactAt: 0.88 },
  hammerThrust: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'two', from: { hand: [0.02, 0.62, -0.08], dir: [1, 0.2, 0] }, windup: 0.18, extendUntil: 0.5, duration: 0.85, twist: -0.3, lean: 0.18, shift: 0.12, depth: 0.25, step: 1.2, cost: 0.035, mass: { arm: 0.7, body: 0.06 }, rotation: 0.8, zones: ['head', 'body'], reach: 'weapon' },
  naginataSweep: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', sweep: true, from: { hand: [0.0, 0.72, -0.3], dir: [-0.3, 0.2, -0.95] }, mid: [1, 0.05, 0], to: { hand: [0.2, 0.66, 0.26], dir: [0.2, 0, 1] }, windup: 0.2, extendUntil: 0.46, duration: 0.85, twist: -0.85, lean: 0.06, shift: 0.05, cost: 0.04, mass: { arm: 0.6, body: 0.04 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon', contactAt: 0.8 },
  naginataCut: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.0, 0.92, -0.14], dir: [-0.45, 0.7, -0.5] }, mid: [0.9, 0.2, 0.1], to: { hand: [0.26, 0.45, 0.15], dir: [0.5, -0.65, 0.5] }, windup: 0.2, extendUntil: 0.44, duration: 0.82, twist: -0.5, lean: 0.12, shift: 0.06, cost: 0.038, mass: { arm: 0.6, body: 0.035 }, rotation: 0.8, zones: ['body', 'head'], reach: 'weapon', contactAt: 0.8 },
  naginataRising: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.12, 0.42, -0.2], dir: [0.5, -0.6, -0.55] }, mid: [0.9, 0.1, 0], to: { hand: [0.12, 0.85, 0.12], dir: [0.35, 0.8, 0.45] }, windup: 0.16, extendUntil: 0.42, duration: 0.78, twist: 0.3, lean: 0.05, shift: 0.04, cost: 0.034, mass: { arm: 0.55, body: 0.03 }, rotation: 0.8, zones: ['body'], reach: 'weapon', contactAt: 0.8 },
  naginataThrust: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'two', from: { hand: [0.05, 0.6, -0.06], dir: [1, 0.12, 0] }, windup: 0.1, extendUntil: 0.36, duration: 0.65, twist: -0.3, lean: 0.16, shift: 0.1, depth: 0.25, step: 1.5, cost: 0.03, mass: { arm: 0.6, body: 0.05 }, rotation: 0.6, zones: ['body', 'head'], reach: 'weapon' },
  spearThrust: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'two', from: { hand: [-0.04, 0.6, -0.08], dir: [1, 0.08, 0] }, windup: 0.08, extendUntil: 0.32, duration: 0.6, twist: -0.4, lean: 0.16, shift: 0.12, depth: 0.25, step: 1.7, cost: 0.026, mass: { arm: 0.6, body: 0.05 }, rotation: 0.5, zones: ['body', 'head'], reach: 'weapon' },
  spearJab: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'two', from: { hand: [0.02, 0.62, -0.08], dir: [1, 0.1, 0] }, windup: 0.04, extendUntil: 0.22, duration: 0.42, twist: -0.2, lean: 0.08, shift: 0.06, depth: 0.2, step: 1.2, cost: 0.016, mass: { arm: 0.55, body: 0.03 }, rotation: 0.5, zones: ['body', 'head'], reach: 'weapon' },
  spearSweep: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'two', from: { hand: [0.0, 0.7, -0.25], dir: [-0.1, 0.25, -1] }, mid: [1, 0, 0], to: { hand: [0.18, 0.62, 0.2], dir: [0.3, -0.1, 1] }, windup: 0.16, extendUntil: 0.42, duration: 0.75, twist: -0.7, lean: 0.06, shift: 0.04, cost: 0.03, mass: { arm: 0.55, body: 0.03 }, rotation: 1, zones: ['legs', 'body'], reach: 'weapon', contactAt: 0.85 },
  // Hoplomachus: the spear thrust overhand at the face and throat, or
  // underhand at the belly; then, with the spear gone, the gladius.
  spearHigh: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [-0.02, 0.86, -0.18], dir: [1, -0.05, 0.05] }, windup: 0.1, extendUntil: 0.36, duration: 0.6, twist: -0.6, lean: 0.14, shift: 0.1, depth: 0.25, step: 1.6, cost: 0.026, mass: { arm: 0.6, body: 0.04 }, rotation: 0.5, zones: ['head', 'body'], reach: 'weapon' },
  spearLow: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [-0.04, 0.5, -0.18], dir: [1, 0.12, 0.05] }, windup: 0.08, extendUntil: 0.34, duration: 0.56, twist: -0.5, lean: 0.12, shift: 0.1, depth: 0.25, step: 1.6, cost: 0.024, mass: { arm: 0.6, body: 0.04 }, rotation: 0.5, zones: ['body'], reach: 'weapon' },
  gladiusThrust: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'thrust', grip: 'one', from: { hand: [0.08, 0.6, -0.14], dir: [1, 0.1, 0.05] }, windup: 0.06, extendUntil: 0.3, duration: 0.5, twist: -0.6, lean: 0.12, shift: 0.08, depth: 0.25, step: 1.5, cost: 0.02, mass: { arm: 0.6, body: 0.03 }, rotation: 0.6, zones: ['body', 'head'], reach: 'weapon' },
  gladiusCut: { kind: 'strike', limb: 'rHand', path: 'blade', mode: 'swing', grip: 'one', from: { hand: [0.0, 0.88, -0.2], dir: [-0.55, 0.65, -0.4] }, mid: [0.9, 0.15, 0.1], to: { hand: [0.28, 0.5, 0.12], dir: [0.5, -0.6, 0.45] }, windup: 0.1, extendUntil: 0.3, duration: 0.6, twist: -0.6, lean: 0.12, shift: 0.05, cost: 0.024, mass: { arm: 0.6, body: 0.02 }, rotation: 0.7, zones: ['body', 'head'], reach: 'weapon' },
  // Whole-body moves.
  // A charge runs until it meets the other body or runs out of steam.
  rush: { kind: 'rush', duration: 1.2, cost: 0.05 },
  clinch: { kind: 'clinch', duration: 3, cost: 0.02 },
};

// Bare strikes do blunt harm; a weapon move's harm splits into blunt, cut
// and pierce by the weapon and how its contact lands (weapons.js).
// Defences, each a timed posture change the physics carries out.
export const DEFENCES = {
  guard: { seconds: 0.5 }, // gloves tight to the face, elbows in
  slip: { seconds: 0.32 }, // head off the line, to one side
  roll: { seconds: 0.45 }, // dip under and come up on the other side
  parry: { seconds: 0.25 }, // lead hand slaps the incoming glove aside
  leanBack: { seconds: 0.4 }, // trunk back out of range: the answer to a head kick
  check: { seconds: 0.45 }, // lead knee up, shin out: the answer to a low kick
  stepBack: { seconds: 0.35 },
  // The weapon brought across the line of the incoming strike, to meet it.
  weaponBlock: { seconds: 0.45 },
  // The shield punched out towards the incoming strike.
  shieldBlock: { seconds: 0.45 },
};

/**
 * Styles. `cadence` is the style's rhythm (see the AI): relative lengths of
 * spells of working and of moving, the share of attacks thrown in bursts,
 * and how much it circles. `stance` shapes the guard (blade angle, crouch, stance width,
 * how upright), `idle` the constant motion, `attacks` and `defences` the
 * AI's mix (relative weights), `rushChance` how often it charges (per s).
 */
export const STYLES = {
  boxing: {
    label: 'Boxing',
    cadence: { work: 1.55, move: 0.48, burst: 0.6, mobility: 0.6 },
    stance: { blade: 0.55, crouch: 0.03, width: 1, lean: 0.14, guardHeight: 0 },
    idle: { bounce: 1, sway: 1, rock: 0.2 },
    attacks: { jab: 0.34, cross: 0.26, hook: 0.2, uppercut: 0.12, rush: 0.006 },
    // Punches come in combinations: most attacks open one, and each
    // punch follows the last as soon as the hand is back.
    combos: { 'jab cross': 0.3, 'jab jab cross': 0.14, 'jab cross hook': 0.26, 'cross hook cross': 0.12, 'hook uppercut hook': 0.1, 'jab uppercut cross': 0.08 },
    comboChance: 0.6,
    tempo: 1.8, // rest between attacks, as a share of the AI's default
    defences: { slip: 0.38, roll: 0.3, parry: 0.12, guard: 0.15, stepBack: 0.05 },
    defendChance: 0.85,
    // Head off the centre line, always moving, whenever in range.
    headMovement: 1,
    counter: 0.45, // after slipping a punch, how often the answer comes straight back
    // Which game plans this style leans to (multiplies each plan's weight).
    plans: { pressure: 1.8, brawler: 0.8, outboxer: 0.5, counter: 0.6 },
    pressure: 0.3, // share of the time spent working inside
  },
  kickboxing: {
    label: 'Kickboxing',
    cadence: { work: 1, move: 1, burst: 0.45, mobility: 0.5 },
    stance: { blade: 0.42, crouch: 0.02, width: 1.12, lean: 0.1, guardHeight: 0.01 },
    idle: { bounce: 0.8, sway: 0.8, rock: 0.4 },
    attacks: { jab: 0.22, cross: 0.17, hook: 0.1, uppercut: 0.05, roundhouse: 0.18, lowKick: 0.15, teep: 0.08, rush: 0.008 },
    defences: { guard: 0.3, check: 0.28, leanBack: 0.18, slip: 0.14, stepBack: 0.1 },
    defendChance: 0.38,
    headMovement: 0.4,
    pressure: 0.05,
  },
  // No training to speak of: wide looping hooks and big rear hands, guard
  // dropping, charging in; defence is covering up or backing off.
  street: {
    label: 'Street',
    cadence: { work: 1.2, move: 0.7, burst: 0.8, mobility: 0.25 },
    stance: { blade: 0.3, crouch: 0.01, width: 0.95, lean: 0.06, guardHeight: -0.05 },
    idle: { bounce: 0.3, sway: 1.3, rock: 0.5 },
    attacks: { jab: 0.12, cross: 0.34, hook: 0.38, uppercut: 0.1, rush: 0.03 },
    combos: { 'cross hook': 0.6, 'hook hook': 0.4 },
    comboChance: 0.3,
    tempo: 1.2,
    defences: { guard: 0.5, stepBack: 0.3, slip: 0.2 },
    defendChance: 0.35,
    headMovement: 0.2,
    counter: 0.1,
    plans: { brawler: 2.5, pressure: 1.2, outboxer: 0.3, counter: 0.2 },
    pressure: 0.25,
  },
  muayThai: {
    label: 'Muay Thai',
    cadence: { work: 1.2, move: 0.8, burst: 0.3, mobility: 0.3 },
    // Square and upright, weight back, guard high and long.
    stance: { blade: 0.22, crouch: 0, width: 0.92, lean: 0.03, guardHeight: 0.02 },
    idle: { bounce: 0.25, sway: 0.7, rock: 1 },
    attacks: { jab: 0.1, cross: 0.1, roundhouse: 0.2, lowKick: 0.12, teep: 0.12, knee: 0.14, elbow: 0.1, upElbow: 0.04, clinch: 0.06, rush: 0.005 },
    defences: { check: 0.34, guard: 0.28, leanBack: 0.26, parry: 0.12 },
    defendChance: 0.4,
    headMovement: 0.15,
    // Muay Thai walks forward into the clinch, knees and elbows.
    pressure: 0.35,
  },
  // An ordinary person in a fight: square, hands low, swinging wild hooks
  // and crosses at random, one at a time, with poor technique (less of the
  // body behind each blow: `technique`) and poor aim (`aimJitter`, m). No
  // blocking, no slipping: at best a late flinch back (`reactionSlow`, s).
  unskilled: {
    label: 'Unskilled',
    cadence: { work: 1.2, move: 0.6, burst: 0.5, mobility: 0.15 },
    stance: { blade: 0.12, crouch: 0, width: 0.9, lean: 0.02, guardHeight: -0.14 },
    idle: { bounce: 0.1, sway: 1.4, rock: 0.6 },
    attacks: { jab: 0.1, cross: 0.3, hook: 0.35, uppercut: 0.08, lowKick: 0.07, rush: 0.04 },
    comboChance: 0,
    tempo: 1,
    defences: { stepBack: 1 },
    defendChance: 0.15,
    headMovement: 0,
    counter: 0,
    technique: 0.75,
    aimJitter: 0.12,
    reactionSlow: 0.12,
    plans: { brawler: 2.5, pressure: 1, outboxer: 0.3, counter: 0.1 },
    pressure: 0.2,
  },
  // Sumo: low and wide, hands forward; thrusts, drives and charges to push
  // a man off his feet, and in the clinch (`clinchDrive`) walks him back.
  sumo: {
    label: 'Sumo',
    cadence: { work: 1.5, move: 0.5, burst: 0.75, mobility: 0.2 },
    stance: { blade: 0.05, crouch: 0.07, width: 1.45, lean: 0.22, guardHeight: -0.08 },
    idle: { bounce: 0.1, sway: 0.4, rock: 0.5 },
    attacks: { tsuppariL: 0.25, tsuppariR: 0.25, oshi: 0.2, clinch: 0.3, rush: 0.04 },
    combos: { 'tsuppariL tsuppariR tsuppariL': 0.5, 'tsuppariR tsuppariL oshi': 0.5 },
    comboChance: 0.6,
    tempo: 1,
    defences: { guard: 0.4, parry: 0.4, stepBack: 0.2 },
    defendChance: 0.45,
    headMovement: 0.05,
    plans: { pressure: 2.2, brawler: 1.2, outboxer: 0.2, counter: 0.4 },
    pressure: 0.6,
    clinchDrive: true,
  },
  // Mixed: switches every so often between the unarmed styles in `mix`, so
  // it boxes for a while, then kicks, then clinches and knees, then pushes.
  mix: {
    label: 'Mix',
    mix: ['boxing', 'kickboxing', 'muayThai', 'sumo'],
    cadence: { work: 1.2, move: 0.8, burst: 0.55, mobility: 0.5 },
    stance: { blade: 0.45, crouch: 0.03, width: 1.05, lean: 0.12, guardHeight: 0 },
    idle: { bounce: 0.7, sway: 0.8, rock: 0.4 },
    attacks: { jab: 0.3, cross: 0.25, hook: 0.2, roundhouse: 0.1, lowKick: 0.1, rush: 0.005 },
    defences: { guard: 0.3, slip: 0.3, stepBack: 0.2, parry: 0.2 },
    defendChance: 0.6,
    headMovement: 0.5,
    pressure: 0.2,
  },
  // Weapon styles: `weapon` is what is carried; `weaponGuard` where the
  // main hand rests (heights, local) and where the weapon points. Knocked
  // out of the hand, the fighter boxes.
  baton: {
    label: 'Police baton', weapon: 'baton',
    cadence: { work: 1, move: 0.8, burst: 0.55, mobility: 0.45 },
    stance: { blade: 0.42, crouch: 0.02, width: 1.05, lean: 0.08, guardHeight: 0 },
    weaponGuard: { hand: [0.1, 0.78, -0.13], dir: [-0.15, 1, -0.1] },
    idle: { bounce: 0.4, sway: 0.8, rock: 0.4 },
    attacks: { overhand: 0.34, forehand: 0.26, legSwing: 0.14, poke: 0.12, jab: 0.14 },
    tempo: 0.9,
    defences: { weaponBlock: 0.35, guard: 0.3, stepBack: 0.35 },
    defendChance: 0.5,
    headMovement: 0.2,
    plans: { pressure: 1.8, brawler: 1.4, outboxer: 0.4, counter: 0.5 },
    pressure: 0.25,
  },
  longsword: {
    label: 'Long sword', weapon: 'longsword',
    cadence: { work: 1.4, move: 0.6, burst: 0.75, mobility: 0.6 },
    stance: { blade: 0.4, crouch: 0.04, width: 1.2, lean: 0.06, guardHeight: 0 },
    // Pflug: hilt at the hip, point at the opponent's face.
    weaponGuard: { hand: [0.17, 0.55, -0.03], dir: [1, 0.55, 0] },
    idle: { bounce: 0.2, sway: 0.5, rock: 0.3 },
    attacks: { oberhau: 0.3, zwerchhau: 0.25, unterhau: 0.15, lunge: 0.3 },
    // Cuts chained one into the next.
    combos: { 'oberhau zwerchhau': 0.35, 'zwerchhau unterhau oberhau': 0.25, 'oberhau lunge': 0.2, 'unterhau oberhau': 0.2 },
    comboChance: 0.55,
    tempo: 1,
    // The blade meets what comes: it blocks, and an edge met cuts.
    defences: { weaponBlock: 0.7, stepBack: 0.25, guard: 0.05 },
    defendChance: 0.8,
    headMovement: 0.1,
    plans: { outboxer: 1.4, counter: 1.2, pressure: 0.8, brawler: 0.4 },
    pressure: 0.05,
  },
  katana: {
    label: 'Katana', weapon: 'katana',
    cadence: { work: 1.2, move: 0.8, burst: 0.7, mobility: 0.55 },
    stance: { blade: 0.15, crouch: 0.05, width: 1.15, lean: 0.03, guardHeight: 0 },
    // Hands before the navel, blade held upright.
    weaponGuard: { hand: [0.17, 0.6, -0.03], dir: [0.3, 1, 0.05] },
    idle: { bounce: 0.1, sway: 0.3, rock: 0.2 },
    attacks: { shomen: 0.25, kesagiri: 0.25, gyakuKesa: 0.15, yokogiri: 0.15, kiriage: 0.1, tsuki: 0.1 },
    combos: { 'kesagiri gyakuKesa': 0.35, 'kiriage kesagiri': 0.2, 'shomen tsuki': 0.2, 'yokogiri shomen': 0.25 },
    comboChance: 0.5,
    tempo: 1.1,
    defences: { weaponBlock: 0.7, stepBack: 0.25, guard: 0.05 },
    defendChance: 0.8,
    headMovement: 0.1,
    plans: { counter: 1.4, outboxer: 1.2, pressure: 0.8, brawler: 0.4 },
    pressure: 0.05,
  },
  // Polearms. Each holds the range its reach gives (see the AI), and fights
  // mixed when it loses its weapon. `rangeInside`: how far inside his own
  // reach he likes to stand (a spearman, at the very point).
  warhammer: {
    label: 'War hammer', weapon: 'warhammer',
    cadence: { work: 1.2, move: 0.8, burst: 0.45, mobility: 0.35 },
    stance: { blade: 0.45, crouch: 0.05, width: 1.25, lean: 0.06, guardHeight: 0 },
    weaponGuard: { hand: [0.15, 0.6, -0.06], dir: [0.55, 0.85, 0] },
    idle: { bounce: 0.1, sway: 0.4, rock: 0.3 },
    attacks: { hammerOverhead: 0.4, hammerSide: 0.35, hammerThrust: 0.25 },
    combos: { 'hammerSide hammerOverhead': 0.5, 'hammerThrust hammerOverhead': 0.5 },
    comboChance: 0.35,
    tempo: 1.2,
    defences: { weaponBlock: 0.6, stepBack: 0.4 },
    defendChance: 0.7,
    headMovement: 0.05,
    plans: { pressure: 1.2, brawler: 1, outboxer: 0.8, counter: 0.8 },
    pressure: 0.1,
    rangeInside: 0.15,
  },
  naginata: {
    label: 'Naginata', weapon: 'naginata',
    cadence: { work: 1.2, move: 0.8, burst: 0.65, mobility: 0.6 },
    stance: { blade: 0.4, crouch: 0.05, width: 1.25, lean: 0.05, guardHeight: 0 },
    weaponGuard: { hand: [0.1, 0.56, -0.06], dir: [1, 0.45, 0] },
    idle: { bounce: 0.15, sway: 0.4, rock: 0.3 },
    attacks: { naginataSweep: 0.35, naginataCut: 0.25, naginataRising: 0.15, naginataThrust: 0.25 },
    combos: { 'naginataSweep naginataCut': 0.4, 'naginataThrust naginataSweep': 0.35, 'naginataRising naginataCut': 0.25 },
    comboChance: 0.5,
    tempo: 1.1,
    defences: { weaponBlock: 0.65, stepBack: 0.35 },
    defendChance: 0.75,
    headMovement: 0.05,
    plans: { outboxer: 1.4, counter: 1.1, pressure: 0.8, brawler: 0.4 },
    pressure: 0.05,
    rangeInside: 0.2,
  },
  spear: {
    label: 'Spear', weapon: 'longSpear',
    cadence: { work: 1.3, move: 0.7, burst: 0.7, mobility: 0.5 },
    stance: { blade: 0.6, crouch: 0.06, width: 1.3, lean: 0.06, guardHeight: 0 },
    weaponGuard: { hand: [0.04, 0.62, -0.08], dir: [1, 0.12, 0] },
    idle: { bounce: 0.2, sway: 0.4, rock: 0.3 },
    attacks: { spearThrust: 0.45, spearJab: 0.4, spearSweep: 0.15 },
    combos: { 'spearJab spearThrust': 0.5, 'spearJab spearJab spearThrust': 0.3, 'spearThrust spearJab': 0.2 },
    comboChance: 0.55,
    tempo: 1,
    defences: { weaponBlock: 0.45, stepBack: 0.55 },
    defendChance: 0.75,
    headMovement: 0.05,
    plans: { outboxer: 1.8, counter: 1.2, pressure: 0.5, brawler: 0.2 },
    pressure: 0.02,
    rangeInside: 0.06,
  },
  knife: {
    label: 'Knife', weapon: 'knife',
    // Close the distance and keep stabbing: long working spells, in flurries.
    cadence: { work: 1.7, move: 0.45, burst: 1, mobility: 0.6 },
    stance: { blade: 0.35, crouch: 0.05, width: 1.05, lean: 0.14, guardHeight: -0.02 },
    weaponGuard: { hand: [0.2, 0.6, -0.09], dir: [1, 0.25, 0.1] },
    idle: { bounce: 0.6, sway: 1.1, rock: 0.4 },
    attacks: { stab: 0.35, upStab: 0.2, highStab: 0.1, jab: 0.2, hook: 0.15 },
    combos: { 'jab stab': 0.3, 'stab stab': 0.25, 'stab stab upStab': 0.2, 'hook upStab stab': 0.15, 'jab stab highStab': 0.1 },
    comboChance: 0.65,
    tempo: 0.75,
    defences: { stepBack: 0.35, slip: 0.25, guard: 0.2, parry: 0.2 },
    defendChance: 0.45,
    headMovement: 0.4,
    plans: { pressure: 2.2, brawler: 1.6, outboxer: 0.3, counter: 0.4 },
    pressure: 0.55,
  },
  // The hoplomachus: spear in the right hand, the parma on the left forearm
  // held out before him. Losing the spear, he draws the gladius.
  hoplomachus: {
    label: 'Hoplomachus', weapon: 'spear', shield: 'parma', fallback: 'gladius',
    cadence: { work: 0.9, move: 1.2, burst: 0.4, mobility: 0.4 },
    stance: { blade: 0.5, crouch: 0.06, width: 1.2, lean: 0.1, guardHeight: 0 },
    weaponGuard: { hand: [-0.02, 0.8, -0.18], dir: [1, -0.05, 0.03] },
    // The shield arm: forearm across before the chest.
    shieldGuard: [0.3, 0.72, 0.05],
    idle: { bounce: 0.2, sway: 0.5, rock: 0.3 },
    attacks: { spearHigh: 0.55, spearLow: 0.45 },
    tempo: 1.5,
    defences: { shieldBlock: 0.6, stepBack: 0.4 },
    defendChance: 0.65,
    headMovement: 0.1,
    plans: { outboxer: 1.5, counter: 1.2, pressure: 0.6, brawler: 0.3 },
    pressure: 0.05,
  },
  gladius: {
    label: 'Gladius and parma', hidden: true, weapon: 'gladius', shield: 'parma', fallback: 'mix',
    cadence: { work: 1.1, move: 0.9, burst: 0.6, mobility: 0.4 },
    stance: { blade: 0.45, crouch: 0.06, width: 1.15, lean: 0.12, guardHeight: 0 },
    weaponGuard: { hand: [0.08, 0.6, -0.14], dir: [1, 0.2, 0.05] },
    shieldGuard: [0.3, 0.72, 0.05],
    idle: { bounce: 0.3, sway: 0.6, rock: 0.3 },
    attacks: { gladiusThrust: 0.6, gladiusCut: 0.4 },
    tempo: 1.4,
    defences: { shieldBlock: 0.65, stepBack: 0.35 },
    defendChance: 0.6,
    headMovement: 0.1,
    plans: { pressure: 1.2, counter: 1, outboxer: 0.8, brawler: 0.5 },
    pressure: 0.25,
  },
};

/** Styles a player can pick (a fallback such as the drawn gladius is not one). */
export const STYLE_KEYS = Object.keys(STYLES).filter((key) => !STYLES[key].hidden);

/**
 * Game plans the AI switches between within a bout, as adjustments to its
 * style: distance kept (m), tempo and pressure (multipliers on the style's),
 * defence (multiplier on its chance), extra counters, and the share of
 * attacks thrown heavy. `weight` is how often each is picked at random.
 */
export const STRATEGIES = {
  outboxer: { label: 'out-boxing', weight: 1, range: 0.15, tempo: 1.15, pressure: 0.3, defend: 1.15, counter: 0, heavy: 0.02, cadence: { work: 0.7, move: 1.5, burst: 0.8, mobility: 1.5 } },
  pressure: { label: 'pressure', weight: 1, range: -0.1, tempo: 0.75, pressure: 2.2, defend: 0.85, counter: 0, heavy: 0.05, cadence: { work: 1.6, move: 0.5, burst: 1.3, mobility: 0.6 } },
  counter: { label: 'counter-punching', weight: 0.8, range: 0.05, tempo: 1.5, pressure: 0.6, defend: 1.25, counter: 0.35, heavy: 0.06, cadence: { work: 0.6, move: 1.4, burst: 0.7, opening: 2 } },
  brawler: { label: 'brawling', weight: 0.6, range: -0.05, tempo: 0.9, pressure: 1.5, defend: 0.6, counter: 0, heavy: 0.15, cadence: { work: 1.4, move: 0.4, burst: 1.5, mobility: 0.3 } },
};

/** Which moves the style can use, for the player's pad. */
export function movesFor(styleKey) {
  return Object.keys(STYLES[styleKey]?.attacks ?? STYLES.boxing.attacks);
}

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/**
 * Local targets for a strike at time t, aimed at `aim`.
 * @returns {object} any of lHand, rHand, lElbow, rElbow, lFoot, rFoot, lKnee, rKnee
 */
export function strikeTargets(move, t, aim, body, followThrough) {
  const side = move.limb[0] === 'l' ? 1 : -1;
  const s = move.limb[0];
  const H = body.heightM;
  const windingUp = t < move.windup;
  const hipY = body.lengths.ankle + body.lengths.shank + body.lengths.thigh;
  switch (move.path) {
    case 'straight':
      return { [`${s}Hand`]: add(aim, [followThrough, 0, 0]) };
    case 'hook':
      return { [`${s}Hand`]: windingUp ? add(aim, [-0.2, 0.02, 0.38 * side]) : add(aim, [0.06, 0, -0.2 * side]) };
    case 'upper':
      return { [`${s}Hand`]: windingUp ? add(aim, [-0.18, -0.38, 0]) : add(aim, [0.06, 0.16, 0]) };
    case 'elbow': {
      // The elbow sweeps across at head height; the fist folds to the ear.
      const elbow = windingUp ? add(aim, [-0.32, 0.04, 0.42 * side]) : add(aim, [0.1, -0.02, -0.3 * side]);
      return { [`${s}Elbow`]: elbow, [`${s}Hand`]: add(elbow, [-0.06, 0.06, -0.16 * side]) };
    }
    case 'upElbow': {
      const elbow = windingUp ? add(aim, [-0.2, -0.32, 0.05 * side]) : add(aim, [0.04, 0.18, 0]);
      return { [`${s}Elbow`]: elbow, [`${s}Hand`]: add(elbow, [-0.05, 0.14, -0.04 * side]) };
    }
    case 'knee': {
      // Knee up and through; the foot tucks under and behind it.
      const knee = windingUp ? [0.15 * H, hipY * 0.85, 0.06 * side] : add(aim, [0.08, -0.02, 0]);
      return { [`${s}Knee`]: knee, [`${s}Foot`]: add(knee, [-0.22, -0.3, 0]) };
    }
    case 'roundhouse': {
      // Open out to the side, level with the target; then sweep the shin
      // across it and through.
      if (windingUp) return { [`${s}Foot`]: add(aim, [-0.12, 0.04, 0.55 * side]) };
      return { [`${s}Foot`]: add(aim, [0.06, 0, -0.35 * side]) };
    }
    case 'pushBoth': {
      // Both palms into his chest, a shoulder's width apart, and through.
      const through = windingUp ? -0.12 : followThrough;
      return { lHand: add(aim, [through, 0, 0.12]), rHand: add(aim, [through, 0, -0.12]) };
    }
    case 'teep': {
      // Knee up in front, then the sole drives straight out into the target.
      if (windingUp) return { [`${s}Foot`]: [0.12 * H, hipY * 0.55, 0.05 * side], [`${s}Knee`]: [0.18 * H, hipY * 0.98, 0.05 * side] };
      return { [`${s}Foot`]: add(aim, [followThrough * 0.8, 0, 0]) };
    }
    default:
      return {};
  }
}

/** How far a move reaches from the attacker's pelvis, for choosing moves by distance. */
export function moveRange(move, body, weapon = null) {
  const legReach = body.lengths.thigh + body.lengths.shank;
  if (move.reach === 'weapon') return body.reach * 1.05 + (weapon?.length ?? 0) * (move.mode === 'thrust' ? 0.9 : 0.85);
  if (move.reach === 'leg') return legReach * 1.25;
  if (move.reach === 'close') return body.reach * 0.95;
  return body.reach * 1.3;
}
