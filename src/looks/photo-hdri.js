// TODO(look: photo-hdri): replace this placeholder with the real look. In
// short: photographic HDRI skies and environments for the sky, the light and
// the reflections.
// Until then it is the soft style (standard materials, no outlines), so the
// registry, the selector and the harness work end to end.

import { defineLook } from './kit.js';

export const PHOTO_HDRI_LOOK = defineLook({
  id: 'photo-hdri',
  label: 'Photo HDRI',
  blurb: 'Placeholder: the soft style, no outlines.',
  style: 'soft',
  outlines: false,
  placeholder: true,
});
