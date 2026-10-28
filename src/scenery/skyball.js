// The distant landscape and sky: a real CC0 panorama (Poly Haven) on a ball
// round the camera (it follows the camera, so it never comes nearer: no
// parallax, no geometry, one draw), turned so its sun stands where the
// game's sun does; the look's dome is hidden and the fog takes the
// photograph's horizon colour. Generated foothills (generated.js) stand in
// front of it. See src/scenery.js for the contract.

/* global THREE */
import { SKYBALL_PHOTO_DATA } from './skyball-photo-data.js';

const SKYBALL = {
  radius: 30,
  // The game's sun, as seen round the horizon (atan2(z, x) of probe-lite's sun).
  sun: [0.62, 0.62, 0.48],
};

const SKYBALL_DEG = Math.PI / 180;
// Below the horizon the photograph's own ground fades into the fog colour between these elevations.
const SKYBALL_FADE = [-7 * SKYBALL_DEG, -1.5 * SKYBALL_DEG];
// Steeply below the horizon (degrees down) the ball is the colour of dark earth, never the picture's sky: the
// ground always covers it from above, and a camera that somehow got under the floor sees dark, not the sky's underside.
const SKYBALL_UNDER = { from: -25, colour: 0x17140f };

// ---- the ball ---------------------------------------------------------------

const SKYBALL_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

// Photo: a sharp band round the horizon, a small cap of sky above; below the horizon the photograph's own ground fades into the fog colour.
const SKYBALL_PHOTO_FRAGMENT = `
uniform sampler2D uBand; uniform sampler2D uSky; uniform vec3 uHorizon; uniform float uTurn;
uniform vec2 uBandRange; uniform vec2 uSkyRange; uniform vec2 uFade; uniform float uMist;
varying vec3 vDir;
void main() {
  vec3 d = normalize( vDir );
  float elevation = asin( clamp( d.y, -1.0, 1.0 ) );
  float u = fract( atan( d.z, d.x ) * 0.15915494 + 0.5 + uTurn );
  vec3 band = texture2D( uBand, vec2( u, clamp( ( elevation - uBandRange.x ) / ( uBandRange.y - uBandRange.x ), 0.002, 0.998 ) ) ).rgb;
  vec3 sky = texture2D( uSky, vec2( u, clamp( ( elevation - uSkyRange.x ) / ( uSkyRange.y - uSkyRange.x ), 0.004, 0.996 ) ) ).rgb;
  float toSky = smoothstep( uSkyRange.x + 0.01, uBandRange.y - 0.01, elevation );
  vec3 colour = mix( band, sky, toSky );
  colour = mix( uHorizon, colour, smoothstep( uFade.x, uFade.y, elevation ) );
  colour = mix( colour, uHorizon, uMist );
  gl_FragColor = vec4( colour, 1.0 );
}`;

/** The ball, or only the part of it between two elevations (degrees): what is not covered costs no pixels. */
function skyballBall(material, low = -90, high = 90) {
  const thetaStart = (90 - high) * SKYBALL_DEG;
  const thetaLength = (high - low) * SKYBALL_DEG;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(SKYBALL.radius, 96, Math.max(4, Math.round((high - low) / 4)), 0, Math.PI * 2, thetaStart, thetaLength), material);
  // After the look's dome (-1000), before everything else; never hides what is drawn after it.
  ball.renderOrder = -990;
  ball.frustumCulled = false;
  ball.onBeforeRender = (renderer, scene, camera) => {
    camera.getWorldPosition(ball.position);
    ball.parent?.worldToLocal(ball.position);
    ball.updateMatrixWorld();
  };
  return ball;
}

/** The turn (0..1 round the band) of an angle in the PLACE_SCENERY convention (radians from +x towards +z). */
const skyballTurnOf = (angle) => ((angle / (Math.PI * 2) + 0.5) % 1 + 1) % 1;

// ---- photo ------------------------------------------------------------------

// Which panorama each place wears, and how far (in turns) to turn it past lining its sun up with the game's.
const SKYBALL_PHOTO_PLACES = {
  meadow: { photo: 'meadow', turn: 0 },
  field: { photo: 'meadow', turn: 0 },
  plain: { photo: 'plain', turn: 0 },
  sengoku: { photo: 'valley', turn: 0 },
  // No CC0 panorama of the Gobi's edge, of Champagne or of the Jazira: the dry plateau's far ranges for the two dry
  // plains, the green meadow's for Champagne; not turned, so the photograph's sun stays where the game's is (the
  // land in front of it, generated, is each place's own).
  mobei: { photo: 'plain', turn: 0 },
  catalaunian: { photo: 'meadow', turn: 0 },
  carrhae: { photo: 'plain', turn: 0 },
};

const skyballPhotoTextures = {};

function skyballPhotoTexture(key, part) {
  const id = `${key}:${part}`;
  if (skyballPhotoTextures[id]) return skyballPhotoTextures[id];
  const texture = new THREE.Texture();
  const image = new Image();
  const started = performance.now();
  image.onload = () => {
    texture.image = image;
    texture.needsUpdate = true;
    texture.userData = { decodeMs: performance.now() - started };
  };
  image.src = `data:image/jpeg;base64,${SKYBALL_PHOTO_DATA[key][part].jpeg}`;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  skyballPhotoTextures[id] = texture;
  return texture;
}

// ---- the variants -----------------------------------------------------------

/** Variants: { id, label, blurb, replaces: [tags], build({ place, view, spec, rng }) -> THREE.Group, apply?({ place, view, spec, group }) }. */
export const SKYBALL_VARIANTS = [
  {
    id: 'skyball-photo',
    label: 'Skyball: photo panorama',
    blurb: 'A real CC0 panorama (Poly Haven) with its own sky and land, turned so its sun stands where the game\'s does; the look\'s sky dome is hidden and the fog takes the photograph\'s horizon.',
    replaces: ['hills', 'mountains'],
    build({ place }) {
      const started = performance.now();
      const choice = SKYBALL_PHOTO_PLACES[place] ?? SKYBALL_PHOTO_PLACES.meadow;
      const data = SKYBALL_PHOTO_DATA[choice.photo];
      // Line the picture's sun (at u = sunU) up with the game's sun round the horizon.
      const sunTurn = skyballTurnOf(Math.atan2(SKYBALL.sun[2], SKYBALL.sun[0]));
      const turn = data.sunU - sunTurn + choice.turn;
      const material = new THREE.ShaderMaterial({
        vertexShader: SKYBALL_VERTEX,
        fragmentShader: SKYBALL_PHOTO_FRAGMENT,
        uniforms: {
          uBand: { value: skyballPhotoTexture(choice.photo, 'band') },
          uSky: { value: skyballPhotoTexture(choice.photo, 'sky') },
          uHorizon: { value: new THREE.Color() },
          uTurn: { value: turn },
          uBandRange: { value: new THREE.Vector2(data.band.low * SKYBALL_DEG, data.band.high * SKYBALL_DEG) },
          uSkyRange: { value: new THREE.Vector2(data.sky.low * SKYBALL_DEG, data.sky.high * SKYBALL_DEG) },
          uFade: { value: new THREE.Vector2(...SKYBALL_FADE) },
          // A level's mist (render.js applyWeather): how far the whole picture is toned toward the horizon colour.
          uMist: { value: 0 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
      });
      const group = new THREE.Group();
      // Down to just below the horizon; under that the background (the same horizon colour) shows.
      const ball = skyballBall(material, data.band.low + 2, 90);
      // Under the look's dome (which is hidden while this shows).
      ball.renderOrder = -1001;
      group.add(ball);
      const under = skyballBall(new THREE.MeshBasicMaterial({ color: SKYBALL_UNDER.colour, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }), -90, SKYBALL_UNDER.from);
      under.renderOrder = -1001;
      group.add(under);
      group.userData.buildMs = performance.now() - started;
      group.userData.photo = choice.photo;
      return group;
    },
    apply({ view, group }) {
      const data = SKYBALL_PHOTO_DATA[group.userData.photo];
      const dome = view.lookState?.['probe-lite']?.dome;
      if (dome) dome.visible = false;
      const horizon = new THREE.Color().fromArray(data.horizon);
      view.scene.background = horizon.clone();
      view.scene.fog?.color.copy(horizon);
      const uniforms = group.children[0].material.uniforms;
      uniforms.uHorizon.value.copy(horizon);
      // Clear weather: the picture as it is (a level's mist sets these again after).
      uniforms.uMist.value = 0;
      uniforms.uFade.value.set(...SKYBALL_FADE);
    },
  },
];
