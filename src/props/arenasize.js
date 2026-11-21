// The amphitheatre's size (render.js builds it, the cameras keep inside it). About half the Colosseum's own: its sand was
// 83 by 48 m inside a building 188 by 156 m and 48 m high (the usual published figures, approximate), on 80 arches.
export const COLOSSEUM = {
  // The sand's half-axes inside the podium wall (m).
  rx: 22,
  rz: 13,
  // The seats: how many rows, each `step` of the sand's half-axis deep and `rise` m over the one below.
  tiers: 22,
  step: 0.04,
  rise: 0.62,
};
