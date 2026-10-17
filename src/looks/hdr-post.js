// TODO(look: hdr-post): replace this placeholder with the real look. In
// short: an HDR render target with bloom and a final tone-mapping pass
// (EffectComposer, loaded lazily).
// Until then it is the soft style (standard materials, no outlines), so the
// registry, the selector and the harness work end to end.

import { defineLook } from './kit.js';

export const HDR_POST_LOOK = defineLook({
  id: 'hdr-post',
  label: 'HDR post',
  blurb: 'Placeholder: the soft style, no outlines.',
  style: 'soft',
  outlines: false,
  placeholder: true,
});
