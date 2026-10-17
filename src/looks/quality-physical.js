// TODO(look: quality-physical): replace this placeholder with the real look.
// In short: MeshPhysicalMaterial skin and metal under the best lights and
// shadows the budget allows.
// Until then it is the soft style (standard materials, no outlines), so the
// registry, the selector and the harness work end to end.

import { defineLook } from './kit.js';

export const QUALITY_PHYSICAL_LOOK = defineLook({
  id: 'quality-physical',
  label: 'Quality physical',
  blurb: 'Placeholder: the soft style, no outlines.',
  style: 'soft',
  outlines: false,
  placeholder: true,
});
