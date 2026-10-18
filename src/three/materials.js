// Fiziksel tabanlı (PBR) anatomik malzemeler.
// Organlara hafif "ıslak doku" görünümü için clearcoat; deriye kenarda belirginleşen
// (Fresnel) yarı saydamlık — iç yapıları gizlemeden vücut sınırını gösterir.

import * as THREE from '../../vendor/three/build/three.module.js';
import { MATERIALS } from './palette.js';

const ORGAN_CLASSES = new Set(['heart', 'artery', 'vein', 'lung', 'airway', 'esophagus', 'diaphragm', 'liver', 'gallbladder', 'stomach', 'spleen', 'pancreas', 'kidney', 'small-intestine', 'large-intestine', 'bladder', 'brain']);

export function createMaterial(cls) {
  const def = MATERIALS[cls] ?? { color: '#cccccc', roughness: 0.5 };
  const color = new THREE.Color(def.color);
  if (cls === 'skin') return skinMaterial(color);
  if (ORGAN_CLASSES.has(cls)) {
    return new THREE.MeshPhysicalMaterial({
      color, roughness: def.roughness, metalness: 0,
      clearcoat: cls === 'brain' || cls === 'lung' ? 0.15 : 0.45,
      clearcoatRoughness: 0.35,
      // Hafif kadife parlaklık; beyaza fazla çekilirse kırmızı dokular pembeleşir.
      sheen: 0.12, sheenRoughness: 0.7, sheenColor: color.clone().lerp(new THREE.Color('#ffffff'), 0.12),
    });
  }
  // kemik / kıkırdak
  return new THREE.MeshStandardMaterial({ color, roughness: def.roughness, metalness: 0 });
}

function skinMaterial(color) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.55, metalness: 0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.FrontSide,
  });
  m.userData.fresnel = true;
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float icgorFres = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
       diffuseColor.a *= mix(0.35, 1.6, pow(icgorFres, 2.0));
       #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'icgor-skin-fresnel';
  return m;
}

/** Saydamlığı uygular; tam opak değilse derinlik yazımını kapatır (sıralama hatalarını azaltır). */
export function applyOpacity(material, opacity) {
  const transparent = opacity < 0.999 || material.userData.fresnel;
  material.opacity = opacity;
  if (material.transparent !== transparent) {
    material.transparent = transparent;
    material.needsUpdate = true;
  }
  material.depthWrite = !transparent || opacity > 0.9;
}
