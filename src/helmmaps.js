// The arena helmets' and the war masks' baked maps (helmmaps-data.js: authored by tools/blender/helmforms.py for the
// helmets, over the remodelled surfaces of helmforms.js, and by helmsheets.py for the masks; baked in Blender by
// helmbake.py, packed by packhelm.py): each helmet kind has one sheet (an atlas), and each part of the helmet lays its
// texture coordinates into its own region of it (helmforms.js FORM_REGIONS), folded at the middle of the face (the two
// halves of a helmet mirror each other, so the sheet holds only one, at twice the detail).
//
// What the helmets are drawn from (photographs not copied; see helmforms.js and helmforms.py for which detail is whose):
//   Pompeii gladiator barracks finds, Naples National Archaeological Museum, listed with inventory numbers and
//     descriptions at https://pompeiiinpictures.eu/R8/8%2007%2016%20p7.htm (thraex inv. 5649, griffin crest and Gorgon;
//     murmillo inv. 5672, 5673, 5674; secutor inv. 5642; provocator inv. 5657).
//   British Museum murmillo helmet 1946,0514.1 (Room 69, Hercules head at the front, about 3.5 kg):
//     https://imperiumromanum.pl/en/curiosities/helmet-of-murmillo-in-the-british-museum/ ; 46 cm high:
//     https://www.ipernity.com/doc/laurieannie/37607936
//   The Louvre's thraex helmet from Pompeii (Br 1108, 38 cm; broad brim, griffin, Gorgon, feather holders, movable visor
//     with a grille): https://heritage-key.com/?p=3936 ; https://following-hadrian.libraries.rutgers.edu/items/show/120
//   The thraex's crest ending in a griffin, feather sockets, palm: https://penelope.uchicago.edu/~grout/encyclopaedia_Romana/gladiators/thraexhelmet.html
//   The secutor's two small eyeholes, rounded top, smooth fin-like flanges: https://en.wikipedia.org/wiki/Secutor ;
//     https://penelope.uchicago.edu/encyclopaedia_romana/gladiators/secutorhelmet.html
//   The scissor's closed helmet, like the secutor's or the hoplomachus's: https://en.wikipedia.org/wiki/Scissor_(gladiator)
//   The 2025 Leeds loan of three Pompeii helmets: https://www.theartnewspaper.com/2025/06/23/are-you-not-entertained-three-ancient-helmets-headline-uk-exhibition-exploring-gladiators
//   The fifteenth-century foot soldiers' helmets (helmforms.js DESIGN_FORMS; measures from the museums' records):
//     ridged kettle hat, Italy c. 1460, Cleveland Museum of Art 1916.1919 (30.3 x 25.9 x 17.5 cm, 5.66 kg; rivets for the
//     lining along the ridge, round the dome's foot and the brim's edge): https://www.clevelandart.org/art/1916.1919 ; war
//     hat said to be from Lake Morat, Met 04.3.234 (tinned): https://www.metmuseum.org/art/collection/search/25097
//     Burgundian war hat, c. 1475, Met 04.3.228 (spirally fluted, 37.1 x 24.8 x 25.9 cm):
//     https://www.metmuseum.org/art/collection/search/21983
//     German sallet, Hans Blarer the Younger, Basel c. 1470-80, Met 29.158.11 (37.4 x 20.2 x 24.8 cm):
//     https://www.metmuseum.org/art/collection/search/26445 ; Caspar Rieder's, Mühlau c. 1480, Met 42.50.32:
//     https://www.metmuseum.org/art/collection/search/24701 ; the sallet and bevor: https://en.wikipedia.org/wiki/Sallet
//     the Spanish cabasset: Royal Collection RCIN 67296 (etched bands, roped brim, rosette rivets):
//     https://col.rct.uk/collection/67296/spanish-morion ; Met 14.25.533 https://www.metmuseum.org/art/collection/search/27105 ,
//     14.25.1851 https://www.metmuseum.org/art/collection/search/33561 , 27.159.12
//     https://www.metmuseum.org/art/collection/search/22982 , 14.25.532 https://www.metmuseum.org/art/collection/search/26512 ;
//     the Spanish cabacete, Cleveland 2012.39: https://www.clevelandart.org/art/2012.39 ; the morion's development (Tavares,
//     ASAC Bulletin 105, 2012): https://americansocietyofarmscollectors.org/wp-content/uploads/2022/04/2012-B105-The-Morion-An-Introduction-to-its-Develo.pdf
//   Samurai masks, the Met: somen https://www.metmuseum.org/art/collection/search/24176 , grimacing man (Myōchin
//     Munesuke) https://www.metmuseum.org/art/collection/search/22080 , mountain demon https://www.metmuseum.org/art/collection/search/24145 ,
//     tengu https://www.metmuseum.org/art/collection/search/23997 , menpō https://www.metmuseum.org/art/collection/search/31974 ;
//     ressei menpo (wrinkles, bared teeth, hair moustache): https://samurai-armor.com/?p=1177 ; karasu tengu menpo:
//     https://www.christies.com.cn/lot/lot-6389201 ; Science Museum somen https://collection.sciencemuseumgroup.org.uk/objects/co155266
//   The quick war masks of China, the steppe and the sultanates (helmsheets.py WORLD_MASKS; no Song or Jin mask survives,
//     so the Chinese two follow the texts and pictures): the iron man's face (tiemian), Jurchen riders in full-face
//     helmets in the Zhongxing Ruiying Tu, https://dragonsarmory.blogspot.com/2017/07/heavy-jin-dynasty-armor.html ,
//     iron face masks since the Warring States https://en.wikipedia.org/wiki/Chinese_armour ; the bronze guardian face
//     (shoumian), Di Qing's bronze mask (Song Shi: 臨敵被髮、帶銅面具) https://en.wikipedia.org/wiki/Di_Qing ,
//     https://www.zdic.net/hant/銅面 , the beast face (taotie) of bronze armour fittings https://brooklynmuseum.org/objects/213207 ;
//     the steppe man's iron face with joined brows and moustache (kipchak), the Lipovets mask (Kyiv region, 12th-13th
//     c., now in the Hermitage) https://eng.obozrevatel.com/section-news/news-a-golden-crest-from-a-mound-and-earrings-from-olbia-five-archaeological-treasures-that-russia-stole-from-ukraine-15-02-2024.html ;
//     the gilt half-mask with brows over almond eye cut-outs and a beak-shaped nose riveted on (horde), Cuman, 1200-1300,
//     the type worn across the Golden Horde, National Museum of the History of Ukraine АЗС-3607
//     https://kyiv.ua.museum-digital.org/object/12837?navlang=en ;
//     the ventail (mail laced across the lower face under a plate edge, the nasal over it), the Aq Qoyunlu turban helmet
//     at the Louvre Abu Dhabi (c. 1450-1500: a detachable nasal through a mail camail guarding the neck, ears and face)
//     https://collection.louvreabudhabi.ae/en/object/turban-helmet
//   The Turkman turban helmet with its aventail, the mail closing across the face below the eye arches (helmforms.js
//     DESIGN_FORMS.turbanTurkman): the Met's 50.87, Helmet with Aventail (Turkish, in the Turkman style, late 15th-16th c.;
//     34.6 cm high without the mail, 55.9 cm with it, 25.4 cm across, 3.35 kg with the mail; an Ottoman arsenal mark)
//     https://www.metmuseum.org/art/collection/search/24813 ; the Met's turban helmets 04.3.211 (Aq Qoyunlu, Sultan Ya'qub,
//     1478-c. 1490) https://www.metmuseum.org/art/collection/search/22013 ; aventails https://en.wikipedia.org/wiki/Aventail

/* global THREE */
import { HELM_MAP_DATA } from './helmmaps-data.js';
import { DETAIL_MAPS } from './detailmaps.js';

/** Whether the helmets' and masks' maps can be drawn (a browser, the maps on). */
export function helmMapsReady() {
  return DETAIL_MAPS.on && typeof THREE !== 'undefined' && typeof Image !== 'undefined' && typeof document !== 'undefined';
}

const helmSheetCache = new Map();

/** A sheet's textures ({ map, normalMap, ormMap, grid }), made once and shared. */
export function helmMapSheet(name) {
  if (!helmMapsReady() || !HELM_MAP_DATA[name]) return null;
  let entry = helmSheetCache.get(name);
  if (entry) return entry;
  const data = HELM_MAP_DATA[name];
  const make = (key, rgba) => {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 4;
    const g = canvas.getContext('2d');
    g.fillStyle = `rgba(${rgba.join(',')})`;
    g.fillRect(0, 0, 4, 4);
    const texture = new THREE.Texture(canvas);
    texture.anisotropy = 8;
    texture.needsUpdate = true;
    const image = new Image();
    image.onload = () => {
      texture.image = image;
      texture.needsUpdate = true;
    };
    image.src = `data:image/webp;base64,${data[key]}`;
    return texture;
  };
  const mean = data.mean.map((value) => Math.round(value * 255));
  entry = { map: make('albedo', [...mean, 1]), normalMap: make('normal', [128, 128, 255, 1]), ormMap: make('orm', [255, 90, 255, 1]), grid: data.grid ?? null, bytes: ['albedo', 'normal', 'orm'].reduce((sum, key) => sum + Math.floor((data[key].length * 3) / 4), 0) };
  helmSheetCache.set(name, entry);
  return entry;
}

/** Every sheet's WebP size (bytes), for the comparison. */
export function helmSheetBytes() {
  return Object.fromEntries(Object.entries(HELM_MAP_DATA).map(([name, data]) => [name, ['albedo', 'normal', 'orm'].reduce((sum, key) => sum + Math.floor((data[key].length * 3) / 4), 0)]));
}

/**
 * A helmet's metal wearing a sheet: `base` (the helmet's own bronze) cloned, its colour times the sheet's, the normal map,
 * roughness and metalness from the ORM map (roughness as baked, metalness times the bronze's). `duller`: the visor's
 * rougher polish (arenaview.js). Null when the sheet is not there.
 */
export function helmMaterial(base, name, { side = THREE.FrontSide, duller = false, cut = false } = {}) {
  const sheet = helmMapSheet(name);
  if (!sheet) return null;
  const material = base.clone();
  Object.assign(material, {
    vertexColors: false, map: sheet.map, normalMap: sheet.normalMap, roughnessMap: sheet.ormMap, metalnessMap: sheet.ormMap,
    roughness: duller ? 1.25 : 1, metalness: Math.min(base.metalness ?? 1, duller ? 0.5 : 1), side,
  });
  // In a crowd (crowdview.js bakePieces): the helmet's steel, without its sheet.
  material.userData = { ...material.userData, crowdColor: base.color.getHex() };
  // A sheet with openings (a sight): the normal map's alpha cuts them out.
  if (cut) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
#if defined( USE_MAP ) && defined( USE_NORMALMAP )
  if ( texture2D( normalMap, vUv ).a < 0.5 ) discard;
#endif`,
      );
    };
    material.customProgramCacheKey = () => 'helm-cut';
  }
  return material;
}

/**
 * A war mask's lacquer wearing its sheet: the lacquer (the albedo's alpha) drawn in `tint`, the rest (teeth, gilt, the
 * mouth's red, hair) in the sheet's own colours; the outline cut by the normal map's alpha; both sides drawn.
 */
export function maskMaterial(name, tint, envMap) {
  const sheet = helmMapSheet(name);
  if (!sheet) return null;
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, map: sheet.map, normalMap: sheet.normalMap, roughnessMap: sheet.ormMap, metalnessMap: sheet.ormMap,
    roughness: 1, metalness: 1, envMap: envMap ?? null, envMapIntensity: 1.1, side: THREE.DoubleSide,
  });
  const uniforms = { uMaskTint: { value: new THREE.Color(tint) } };
  material.userData.crowdColor = new THREE.Color(tint).getHex();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = `uniform vec3 uMaskTint;\n${shader.fragmentShader}`.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
#if defined( USE_MAP ) && defined( USE_NORMALMAP )
  if ( texture2D( normalMap, vUv ).a < 0.5 ) discard;
  diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * uMaskTint + max( texelColor.rgb - vec3( 0.86 ), 0.0 ) * vec3( 1.7, 0.6, 0.35 ), texelColor.a );
  diffuseColor.a = opacity;
#endif`,
    );
  };
  material.customProgramCacheKey = () => 'war-mask';
  return material;
}

/** Triangles drawn for a group (outlines included), for the comparison. */
export function triangleCount(object) {
  let total = 0;
  object.traverse((child) => {
    if (!child.isMesh || child.material?.visible === false) return;
    const geometry = child.geometry;
    const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    total += (count / 3) * (child.isInstancedMesh ? child.count : 1);
  });
  return Math.round(total);
}
