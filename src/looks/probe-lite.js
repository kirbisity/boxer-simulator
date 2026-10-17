// TODO(look: probe-lite): replace this placeholder with the real look. In
// short: cheap image-based lighting, one light probe and a baked sky shared
// by every material.
// Until then it is the soft style (standard materials, no outlines), so the
// registry, the selector and the harness work end to end.

import { defineLook } from './kit.js';

export const PROBE_LITE_LOOK = defineLook({
  id: 'probe-lite',
  label: 'Probe lite',
  blurb: 'Placeholder: the soft style, no outlines.',
  style: 'soft',
  outlines: false,
  placeholder: true,
});
