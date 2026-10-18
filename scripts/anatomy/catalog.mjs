// Hangi kaynak parçalarının hangi anatomik yapıyı oluşturduğu (seçim kuralları) ve çokgen bütçeleri.
// Kimlikler (id) uygulamadaki organ kataloğuyla (src/anatomy/organ-info.js) eşleşir.

const SKULL = /\b(frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|maxilla|mandible|zygomatic bone|nasal bone|lacrimal bone|palatine bone|vomer|inferior nasal concha|hyoid)/i;
const SPINE = /(vertebra\b|^atlas$|^axis$|sacrum|coccyx|intervertebral disk)/i;
const RIBCAGE = /(\brib\b|costal cartilage|body of sternum|manubrium|xiphoid)/i;
const PELVIS = /^(left|right) hip bone$/i;
const UPPER = /(clavicle|scapula|humerus|radius|ulna|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|finger|thumb)/i;
const LOWER = /(femur|patella|tibia|fibula|talus|calcaneus|navicular bone of|cuboid|cuneiform|metatarsal|toe\b|sesamoid)/i;

// Eklem segmentleri (4D eklem hareketi ve AR uzuv takibi için). Gövdeye bağlı parçalar 'trunk'.
const SIDE = (name) => (/\bleft\b/i.test(name) ? 'L' : /\bright\b/i.test(name) ? 'R' : null);
export function boneSegment(name) {
  const side = SIDE(name);
  if (!side) return 'trunk';
  if (/humerus/i.test(name)) return `upperArm-${side}`;
  if (/radius|ulna|scaphoid|lunate|triquetral|pisiform|trapezium|trapezoid|capitate|hamate|metacarpal|finger|thumb/i.test(name)) return `forearm-${side}`;
  if (/femur|patella/i.test(name)) return `thigh-${side}`;
  if (/tibia|fibula|talus|calcaneus|navicular|cuboid|cuneiform|metatarsal|toe\b|sesamoid/i.test(name)) return `leg-${side}`;
  return 'trunk'; // köprücük ve kürek kemiği gövdeyle hareket eder
}

const vesselClass = (name) => (/artery|arterial|aorta/i.test(name) ? 'artery' : /vein|sinus/i.test(name) ? 'vein' : null);
const boneClass = (name) => (/cartilage|intervertebral disk/i.test(name) ? 'cartilage' : 'bone');

const AORTA = /^(ascending aorta|arch of aorta|descending aorta|thoracic aorta|abdominal aorta|abdominal part of aorta|thoracic part of aorta)$/i;
const VESSEL_EXCLUDE = /coronary|cardiac vein|interventricular|marginal (branch|vein)|conus branch|septal|ventricular branch|of (left|right) (ventricle|atrium)|segmental|lobe (branch|tributary)|portal vein|lobar|cerebral|basilar|communicating|choroid|cerebellar|pontine|thalam|striate|ophthalmic|ciliary|retinal|lingular|caudate|bronchopulmonary|hepatovenous|sinus|sulcus|callosomarginal|pericallosal|frontal branch|parietal branch|temporal branch|occipital branch|medullary vein|vermis|septum pellucidum|lateral ventricle|insular|precuneal|orbitofrontal|prefrontal|lenticulostriate|basal vein|of brain|of penis|labyrinth|tympanic|of eye/i;

/**
 * Z-Anatomy kas grupları (ad düzenli ifadesi, sırayla ilk eşleşen). Seçilebilir birimler bu gruplardır;
 * her grubun Türkçe bilgi kartı organ-info.js'de.
 */
export const MUSCLE_GROUPS = [
  { id: 'mus-head-neck', en: 'Muscles of head and neck', re: /masseter|temporalis|pterygoid|bucc?inator|frontalis|occipitalis|epicranial|common tendinous ring|levator nasolabialis|tarsus|rectus muscle|orbicularis|zygomaticus|frontal belly|occipital belly|occipitofrontalis|mentalis|risorius|nasalis|depressor|levator labii|levator anguli|procerus|corrugator|platysma|sternocleidomastoid|scalen|longus colli|longus capitis|digastric|mylohyoid|geniohyoid|stylohyoid|sternohyoid|sternothyroid|thyrohyoid|omohyoid|splenius|capitis|auricular|epicranius|temporoparietalis|arytenoid|cricothyroid|thyro|pharyn|laryn|palat|uvula|tongue|glossus|levator palpebrae|rectus (superior|inferior|medial|lateral)|oblique muscle of eye|superior oblique|inferior oblique|tensor tympani|stapedius|salpingo|constrictor/i, budget: { high: 24000, low: 7000 } },
  { id: 'mus-chest', en: 'Muscles of thorax', re: /pectoralis|serratus anterior|subclavius|intercostal|transversus thoracis|subcostal|levatores (breves |longi )?costarum|levator costae/i, budget: { high: 20000, low: 7000 } },
  { id: 'mus-abdomen', en: 'Muscles of abdomen', re: /rectus abdominis|external oblique|internal oblique|abdominal oblique|transversus abdominis|pyramidalis|quadratus lumborum|cremaster|linea alba|inguinal/i, budget: { high: 12000, low: 4000 } },
  { id: 'mus-back', en: 'Muscles of back', re: /trapezius|latissimus|rhomboid|levator scapulae|erector|iliocostalis|longissimus|spinalis|semispinalis|multifidus|rotator|interspinales|intertransversari|serratus posterior/i, budget: { high: 22000, low: 7000 } },
  { id: 'mus-leg-foot', en: 'Muscles of leg and foot', re: /gastrocnemius|soleus|plantaris|popliteus|tibialis|peroneus|fibularis|hallucis|extensor digitorum longus|flexor digitorum longus|of foot|quadratus plantae|extensor digitorum brevis|flexor digitorum brevis|calcaneal tendon|flexor accessorius|plantar aponeurosis|metatarsal ligament/i, budget: { high: 22000, low: 7000 } },
  { id: 'mus-hip-thigh', en: 'Muscles of hip and thigh', re: /gluteus|piriformis|obturator|gemellus|quadratus femoris|tensor fasciae latae|iliopsoas|psoas|iliacus|sartorius|rectus femoris|vastus|adductor (longus|brevis|magnus|minimus)|gracilis|pectineus|biceps femoris|semitendinosus|semimembranosus|patellar|quadriceps|iliotibial|iliopectineal arch/i, budget: { high: 26000, low: 8000 } },
  { id: 'mus-shoulder-arm', en: 'Muscles of shoulder and arm', re: /deltoid|supraspinatus|infraspinatus|teres|subscapularis|biceps brachii|brachialis|coracobrachialis|triceps|anconeus/i, budget: { high: 16000, low: 5000 } },
  { id: 'mus-forearm-hand', en: 'Muscles of forearm and hand', re: /brachioradialis|pronator|supinator|carpi|flexor digitorum|extensor digitorum|palmaris|pollicis|opponens|lumbrical|of hand|extensor indicis|extensor digiti minimi|interosse|palmar aponeurosis|metacarpal ligament/i, budget: { high: 22000, low: 7000 } },
  { id: 'mus-pelvic', en: 'Muscles of pelvic floor and perineum', re: /levator ani|coccygeus|perine|sphincter|bulbospongiosus|ischiocavernosus|puborectalis|pubococcygeus|iliococcygeus|pubo-analis/i, budget: { high: 4000, low: 1500 } },
];

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
 * layer: 'skin' | 'muscles' | 'skeleton' | 'organs' | 'vessels' | 'nerves'
 * segment: eklem segmenti — işlev (ad → segment) veya 'geometric' (eklem eksenine en yakın segment)
 * select(ctx) → BodyParts3D FJ kimlikleri; source:'hra' olanlar HRA'dan kayıtla gelir.
 * budget: üçgen hedefleri {high, low}
 */
export const STRUCTURES = [
  { id: 'skin', layer: 'skin', en: 'Skin', fma: 'FMA7163', select: (c) => c.concept('FMA7163'), cls: () => 'skin', budget: { high: 60000, low: 14000 } },

  { id: 'skull', layer: 'skeleton', en: 'Skull', fma: 'FMA46565', select: bones(SKULL), cls: boneClass, budget: { high: 45000, low: 9000 } },
  { id: 'spine', layer: 'skeleton', en: 'Vertebral column', fma: 'FMA13478', select: bones(SPINE), cls: boneClass, budget: { high: 30000, low: 10000 } },
  { id: 'ribcage', layer: 'skeleton', en: 'Thoracic cage', fma: 'FMA7480', select: bones(RIBCAGE), cls: boneClass, budget: { high: 30000, low: 10000 } },
  { id: 'pelvis', layer: 'skeleton', en: 'Pelvic girdle (hip bones)', fma: 'FMA16580', select: bones(PELVIS), cls: boneClass, budget: { high: 10000, low: 3500 } },
  { id: 'upper-limb-bones', layer: 'skeleton', en: 'Bones of upper limbs and shoulder girdle', fma: 'FMA7183', select: bones(UPPER), cls: boneClass, segment: boneSegment, budget: { high: 26000, low: 7000 } },
  { id: 'lower-limb-bones', layer: 'skeleton', en: 'Bones of lower limbs', fma: 'FMA7184', select: bones(LOWER), cls: boneClass, segment: boneSegment, budget: { high: 24000, low: 7000 } },

  { id: 'brain', layer: 'organs', en: 'Brain', fma: 'FMA50801', select: (c) => c.concept('FMA50801').filter((fj) => !/ventricle|aqueduct/i.test(c.name(fj))), cls: () => 'brain', budget: { high: 60000, low: 12000 } },
  {
    id: 'heart', layer: 'organs', en: 'Heart', fma: 'FMA7088',
    // Karıncık ve kulakçık duvarları FMA7088 ağacında değil (FMA13256 altında); adla eklenir.
    select: (c) => [...c.concept('FMA7088'), ...c.find(/^Wall of (ventricle|left atrium|right atrium)$/i)].filter((fj) => !/^cavity of/i.test(c.name(fj))),
    // Kulakçıklar ayrı sınıf: iki evreli kalp atımı simülasyonunda önce kulakçıklar kasılır.
    cls: (n) => vesselClass(n) ?? (/atrium|auricle/i.test(n) ? 'heart-atrium' : 'heart'), budget: { high: 36000, low: 9000 },
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

  // ---------- Damarlar (BodyParts3D) ----------
  // Organ içi ince dallar (koroner, karaciğer/akciğer segment, beyin yüzeyi) organlarda zaten var veya
  // görsel kalabalık yaratır; ana sistemik ağ seçilir.
  { id: 'aorta', layer: 'vessels', en: 'Aorta', fma: 'FMA3734', select: (c) => c.find(AORTA), cls: () => 'artery', budget: { high: 5000, low: 2000 } },
  { id: 'vena-cava', layer: 'vessels', en: 'Venae cavae', fma: 'FMA10951', select: (c) => c.find(/^(superior|inferior) vena cava$/i), cls: () => 'vein', budget: { high: 2500, low: 1000 } },
  {
    id: 'arteries', layer: 'vessels', en: 'Systemic and pulmonary arteries', fma: 'FMA50720',
    select: (c) => c.find(/artery|arterial trunk|brachiocephalic trunk|pulmonary trunk|celiac trunk/i).filter((fj) => !VESSEL_EXCLUDE.test(c.name(fj)) && !AORTA.test(c.name(fj))),
    cls: () => 'artery', budget: { high: 26000, low: 9000 },
  },
  {
    id: 'veins', layer: 'vessels', en: 'Systemic veins', fma: 'FMA50723',
    select: (c) => c.find(/\bvein\b|venous arch/i).filter((fj) => !VESSEL_EXCLUDE.test(c.name(fj))),
    cls: () => 'vein', budget: { high: 20000, low: 7000 },
  },

  // ---------- Sinir sistemi (BodyParts3D; beyin organ katmanında) ----------
  { id: 'spinal-cord', layer: 'nerves', en: 'Spinal cord', fma: 'FMA7647', select: (c) => c.find(/^(neural tissue of spinal cord|cauda equina)$/i), cls: () => 'spinal-cord', budget: { high: 4000, low: 1500 } },
  {
    id: 'nerves', layer: 'nerves', en: 'Peripheral nerves', fma: 'FMA65132',
    select: (c) => c.find(/nerve|plexus/i).filter((fj) => !/venous plexus|pampiniform|choroid plexus|ciliary ganglion|central canal|masseteric artery/i.test(c.name(fj))),
    cls: () => 'nerve', budget: { high: 24000, low: 8000 },
  },

  // ---------- Kaslar ve tendonlar (Z-Anatomy) ----------
  ...MUSCLE_GROUPS.map((g) => ({
    id: g.id, layer: 'muscles', en: g.en, fma: 'FMA5022', source: 'zanatomy', zgroup: g.re,
    cls: (n) => (/tendon/i.test(n) ? 'tendon' : 'muscle'), segment: 'geometric', budget: g.budget,
  })),
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
