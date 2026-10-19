// Fast travel for the sandbox's ghost walk: where a designer can jump to on a stage, worked out from the stage's own data, so it
// follows the stage when its rooms move. A place is { id, label, at: [x, y, z], yaw }: the start, each section (at its rest point,
// else its first man or item), each rest point, the boss, and the end of the road (the ending's prince, if the stage has one).

/** The places of a stage, in the order of its sections. */
export function travelPlaces(stage) {
  const places = [];
  const seen = new Set();
  const add = (id, label, at, yaw = 0) => {
    // (A place that is where another already is is not listed twice: the chapel and its boss, a section and its rest.)
    if (!at || seen.has(id) || places.some((place) => Math.hypot(place.at[0] - at[0], place.at[2] - at[2]) < 0.5 && Math.abs(place.at[1] - at[1]) < 1)) return;
    seen.add(id);
    places.push({ id, label, at: [...at], yaw });
  };
  const start = stage.start;
  if (start) add('start', 'The start', start.at, start.facing ?? 0);
  for (const section of stage.sections) {
    const man = section.spawns.find((spawn) => spawn.role === 'enemy' || spawn.role === 'boss' || spawn.role === 'civilian' || spawn.role === 'prisoner');
    const item = section.items[0];
    const here = section.rest?.at ?? man?.post ?? item?.at;
    add(`section:${section.id}`, section.name, here, man?.facing ?? 0);
    if (section.rest) add(`rest:${section.rest.id ?? section.id}`, `${section.rest.name ?? 'Rest'} (rest)`, section.rest.at);
    const boss = section.spawns.find((spawn) => spawn.role === 'boss');
    if (boss) add(`boss:${boss.id}`, `${boss.inputs?.name ?? boss.id} (boss)`, boss.post, boss.facing ?? 0);
  }
  const prince = stage.ending?.prince;
  if (prince) {
    for (const section of stage.sections) {
      const spawn = section.spawns.find((entry) => entry.id === prince);
      if (spawn) add(`prince:${prince}`, `${spawn.inputs?.name ?? 'The prince'} (the end)`, spawn.post, spawn.facing ?? 0);
    }
  }
  return places;
}
