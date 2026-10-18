// Hangi kaynak parçalarının hangi anatomik yapıyı oluşturduğu (seçim kuralları) ve çokgen bütçeleri.
// Kimlikler (id) uygulamadaki organ kataloğuyla (src/anatomy/organ-info.js) eşleşir.

const SKULL = /\b(frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|maxilla|mandible|zygomatic bone|nasal bone|lacrimal bone|palatine bone|vomer|inferior nasal concha|hyoid)/i;
const SPINE = /(vertebra\b|^atlas$|^axis$|sacrum|coccyx|intervertebral disk)/i;
const RIBCAGE = /(\brib\b|costal cartilage|body of sternum|manubrium|xiphoid)/i;
const PELVIS = /^(left|right) hip bone$/i;
const UPPER = /(clavicle|scapula|humerus|radius|ulna|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|finger|thumb)/i;
const LOWER = /(femur|patella|tibia|fibula|talus|calcaneus|navicular bone of|cuboid|cuneiform|metatarsal|toe\b|sesamoid)/i;

const vesselClass = (name) => (/artery|arterial|aorta/i.test(name) ? 'artery' : /vein|sinus/i.test(name) ? 'vein' : null);
const boneClass = (name) => (/cartilage|intervertebral disk/i.test(name) ? 'cartilage' : 'bone');

/** Kemik havuzu: FMA5018 (kemik organı) + kaburga kıkırdakları + omurlar arası diskler. */
function bonePool(ctx) {
  return [...new Set([
    ...ctx.concept('FMA5018', 'is_a'),
    ...ctx.concept('FMA7480'),
    ...ctx.concept('FMA13478'),
    ...ctx.concept('FMA16580'),
  ])];
}
const bones = (re) => (ctx) => bonePool(ctx).filter((fj) => re.test(ctx.name(fj)));

/**
 * layer: 'skin' | 'skeleton' | 'organs'
 * select(ctx) → BodyParts3D FJ kimlikleri; source:'hra' olanlar HRA'dan kayıtla gelir.
 * budget: üçgen hedefleri {high, low}
 */
export const STRUCTURES = [
  { id: 'skin', layer: 'skin', en: 'Skin', fma: 'FMA7163', select: (c) => c.concept('FMA7163'), cls: () => 'skin', budget: { high: 60000, low: 14000 } },

  { id: 'skull', layer: 'skeleton', en: 'Skull', fma: 'FMA46565', select: bones(SKULL), cls: boneClass, budget: { high: 30000, low: 9000 } },
  { id: 'spine', layer: 'skeleton', en: 'Vertebral column', fma: 'FMA13478', select: bones(SPINE), cls: boneClass, budget: { high: 30000, low: 10000 } },
  { id: 'ribcage', layer: 'skeleton', en: 'Thoracic cage', fma: 'FMA7480', select: bones(RIBCAGE), cls: boneClass, budget: { high: 30000, low: 10000 } },
  { id: 'pelvis', layer: 'skeleton', en: 'Pelvic girdle (hip bones)', fma: 'FMA16580', select: bones(PELVIS), cls: boneClass, budget: { high: 10000, low: 3500 } },
  { id: 'upper-limb-bones', layer: 'skeleton', en: 'Bones of upper limbs and shoulder girdle', fma: 'FMA7183', select: bones(UPPER), cls: boneClass, budget: { high: 22000, low: 6500 } },
  { id: 'lower-limb-bones', layer: 'skeleton', en: 'Bones of lower limbs', fma: 'FMA7184', select: bones(LOWER), cls: boneClass, budget: { high: 22000, low: 6500 } },

  { id: 'brain', layer: 'organs', en: 'Brain', fma: 'FMA50801', select: (c) => c.concept('FMA50801').filter((fj) => !/ventricle|aqueduct/i.test(c.name(fj))), cls: () => 'brain', budget: { high: 30000, low: 9000 } },
  {
    id: 'heart', layer: 'organs', en: 'Heart', fma: 'FMA7088',
    // Karıncık ve kulakçık duvarları FMA7088 ağacında değil (FMA13256 altında); adla eklenir.
    select: (c) => [...c.concept('FMA7088'), ...c.find(/^Wall of (ventricle|left atrium|right atrium)$/i)].filter((fj) => !/^cavity of/i.test(c.name(fj))),
    cls: (n) => vesselClass(n) ?? 'heart', budget: { high: 24000, low: 8000 },
  },
  // Akciğer parankimi 4.3'te akciğer kavram ağacına bağlı değil (ayrı FJ65xx temsil serisi); adla seçilir.
  // Sağ orta lob segmentleri ("lateral", "medial") adında taraf belirtmez.
  {
    id: 'lung-right', layer: 'organs', en: 'Right lung', fma: 'FMA7333', hraNode: 'VH_M_lungs_R',
    select: (c) => c.find(/^Parenchyma of (right .*|lateral|medial) bronchopulmonary segment$/i), cls: () => 'lung', budget: { high: 16000, low: 5000 },
  },
  {
    id: 'lung-left', layer: 'organs', en: 'Left lung', fma: 'FMA7370', hraNode: 'VH_M_lungs_L',
    select: (c) => c.find(/^Parenchyma of (left .*|.*lingular|apicoposterior) bronchopulmonary segment$/i), cls: () => 'lung', budget: { high: 16000, low: 5000 },
  },
  {
    id: 'airways', layer: 'organs', en: 'Trachea and bronchial tree', fma: 'FMA7394',
    select: (c) => c.find(/^(trachea|(right|left) main bronchus( proper)?|.*bronchial tree)$/i),
    cls: () => 'airway', budget: { high: 8000, low: 2500 },
  },
  { id: 'esophagus', layer: 'organs', en: 'Esophagus', fma: 'FMA7131', select: (c) => c.concept('FMA7131'), cls: () => 'esophagus', budget: { high: 1500, low: 600 } },
  { id: 'diaphragm', layer: 'organs', en: 'Diaphragm', fma: 'FMA13295', select: (c) => c.concept('FMA13295'), cls: () => 'diaphragm', budget: { high: 8000, low: 2500 } },
  {
    id: 'liver', layer: 'organs', en: 'Liver', fma: 'FMA7197',
    select: (c) => c.concept('FMA7197').filter((fj) => /hepatovenous segment|caudate lobe of liver/i.test(c.name(fj))),
    cls: () => 'liver', budget: { high: 14000, low: 5000 },
  },
  { id: 'gallbladder', layer: 'organs', en: 'Gallbladder', fma: 'FMA7202', select: (c) => c.concept('FMA7202'), cls: () => 'gallbladder', budget: { high: 1500, low: 600 } },
  { id: 'stomach', layer: 'organs', en: 'Stomach', fma: 'FMA7148', select: (c) => c.concept('FMA7148'), cls: () => 'stomach', budget: { high: 2000, low: 1200 } },
  { id: 'spleen', layer: 'organs', en: 'Spleen', fma: 'FMA7196', select: (c) => c.concept('FMA7196'), cls: () => 'spleen', budget: { high: 1400, low: 800 } },
  {
    id: 'pancreas', layer: 'organs', en: 'Pancreas', fma: 'FMA7198',
    select: (c) => c.concept('FMA7198').filter((fj) => /parenchyma/i.test(c.name(fj))),
    cls: () => 'pancreas', budget: { high: 4000, low: 1500 },
  },
  { id: 'kidney-right', layer: 'organs', en: 'Right kidney', fma: 'FMA7204', select: (c) => c.concept('FMA7204'), cls: () => 'kidney', budget: { high: 2500, low: 1200 } },
  { id: 'kidney-left', layer: 'organs', en: 'Left kidney', fma: 'FMA7205', select: (c) => c.concept('FMA7205'), cls: () => 'kidney', budget: { high: 3000, low: 1200 } },
  { id: 'small-intestine', layer: 'organs', en: 'Small intestine', fma: 'FMA7200', select: (c) => c.concept('FMA7200'), cls: () => 'small-intestine', budget: { high: 9000, low: 3000 } },
  { id: 'large-intestine', layer: 'organs', en: 'Large intestine', fma: 'FMA7201', select: (c) => c.concept('FMA7201'), cls: () => 'large-intestine', budget: { high: 12000, low: 4000 } },
  { id: 'bladder', layer: 'organs', en: 'Urinary bladder', fma: 'FMA15900', select: (c) => c.concept('FMA15900'), cls: () => 'bladder', budget: { high: 600, low: 400 } },
];

/**
 * HRA (Visible Human Male) ↔ BodyParts3D ortak işaret noktaları.
 * Akciğerleri BodyParts3D gövdesine yerleştiren afin dönüşüm bu yapıların ağırlık merkezlerinden uydurulur.
 */
const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
export const LANDMARKS = [
  ['VH_M_cervical_vertebra_1', { name: 'Atlas' }],
  ['VH_M_cervical_vertebra_2', { name: 'Axis' }],
  ...[3, 4, 5, 6, 7].map((i) => [`VH_M_cervical_vertebra_${i}`, { name: `${ORD[i - 1]} cervical vertebra` }]),
  ...ORD.map((o, i) => [`VH_M_thoracic_vertebra_${i + 1}`, { name: `${o} thoracic vertebra` }]),
  ...ORD.slice(0, 5).map((o, i) => [`VH_M_lumbar_vertebra_${i + 1}`, { name: `${o} lumbar vertebra` }]),
  ['VH_M_sacrum', { name: 'Sacrum' }],
  ['VH_M_left_kidney', { structure: 'kidney-left' }],
  ['VH_M_right_kidney', { structure: 'kidney-right' }],
  ['VH_M_heart', { structure: 'heart', excludeClasses: ['artery', 'vein'] }],
  ['VH_M_liver', { structure: 'liver' }],
  ['VH_M_spleen', { structure: 'spleen' }],
  ['VH_M_urinary_bladder', { structure: 'bladder' }],
];

export { MATERIALS } from '../../src/three/palette.js';
