// The skin worker: builds a fighter's skin (bodystyles.js, V7 by default: the loft wrapped onto the flesh field) and its maps off
// the page's thread, so a battle's first seconds are not spent on it (render.js asks; pumpSkinBuilds is the fallback that builds
// it a few milliseconds a frame where no worker can be had). Plain numbers only: no Three.js, no page.
//
// A request: { id, inputs, style, check, known }: the body is made again from its inputs (a body is its inputs), `check` a few of
// the page's own numbers for it (a body that came out otherwise is refused: `mismatch`), `known` the map keys the page has made.
// The answer: { id, built, maps, ms }, the arrays handed over, not copied.

import { buildBody } from './body.js';
import { buildSkinMesh, makeSkinTextures, skinTextureKey } from './bodystyles.js';
import { DETAIL_MAPS } from './detailmaps.js';

/** A few numbers that say whether two bodies are the same body. */
export function bodyCheck(body) {
  return [body.segments.trunk.skinRadius, body.segments.lUpperArm.skinRadius, body.segments.rThigh.skinRadius, body.lengths.trunk, body.lengths.headRadius, body.neckIndex];
}

/** Answer one request (also what the tests call). */
export function skinWorkerAnswer({ id, inputs, style, check, known = [], detailMaps = DETAIL_MAPS.on }) {
  const started = performance.now();
  // Armour drawn with the detail maps or not, as the page draws it (detailmaps.js).
  DETAIL_MAPS.on = detailMaps;
  const body = buildBody(inputs);
  if (check && bodyCheck(body).some((value, index) => value !== check[index])) return { answer: { id, mismatch: true }, transfer: [] };
  const built = buildSkinMesh(body, style);
  const key = skinTextureKey(body, style, built);
  const maps = known.includes(key) ? null : makeSkinTextures(body, style, built);
  const transfer = [built.positions, built.normals, built.indices, built.uvs, built.skinIndex, built.skinWeight, maps?.albedo, maps?.normal, maps?.ao, maps?.rough].filter(Boolean).map((array) => array.buffer);
  return { answer: { id, built, maps, ms: performance.now() - started }, transfer };
}

if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      const { answer, transfer } = skinWorkerAnswer(data);
      self.postMessage(answer, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, error: String(error?.stack ?? error) });
    }
  };
}
