// The ways to build a body's skin, by key. Each takes a built body (body.js)
// and returns the bind-pose mesh (positions, normals, indices, skin weights,
// bind frames; a lofted one also names each vertex's `regions`). No Three.js
// here, so every style can be built and checked in Node.
//
// 'lofted' is the default and the baseline. 'smoothed' and 'dense' are the
// anatomy field (bodymesh.js), 'faceted' the loft in flat low poly. The
// three below are the body-drawing directions (docs: the body-style sheets,
// tools/bodysheet.html): 'sculpt' the same cheap loft with landmark-driven
// ring profiles (sculpt.js), 'flesh' the field brought up to the same
// landmarks for hero fighters and close-ups (fleshbody.js), 'detail' the
// loft's silhouette with a shading map carrying the fine anatomy
// (skindetail.js; the renderer applies the map).

import { buildBodyMesh } from './bodymesh.js';
import { buildLoftBody } from './loftbody.js';
import { buildFleshBody } from './fleshbody.js';
import { buildDetailMap } from './skindetail.js';

export const BODY_STYLE_KEYS = ['lofted', 'smoothed', 'faceted', 'dense', 'sculpt', 'detail', 'flesh'];

/** The skin mesh of a body in a style (an unknown key is the fine field, as before). */
export function buildSkinMesh(body, style) {
  if (style === 'lofted') return buildLoftBody(body);
  if (style === 'sculpt') return buildLoftBody(body, { sculpt: true });
  if (style === 'flesh') return buildFleshBody(body);
  if (style === 'detail') return { ...buildLoftBody(body, { sculpt: 'mass' }), detail: buildDetailMap(body) };
  if (style === 'faceted') return buildLoftBody(body, { faceted: true });
  if (style === 'smoothed') return buildBodyMesh(body, 'skin', 0.024, 4);
  return buildBodyMesh(body, 'skin');
}
