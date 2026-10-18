// Basit eklem donanımı (rig): uzuv segmentlerini eklem merkezleri etrafında zincirleme döndürür.
// Ağlar deforme edilmez; her segment rijit döner (eğitim amaçlı yaklaşım). Deri bu nedenle hareket sırasında gizlenir.
//
// Açılar radyan. Eksenler: +X hastanın solu, +Y yukarı, +Z ön.
//   abduct: kolu/bacağı yana kaldırma (Z ekseni çevresinde; sol taraf +, sağ taraf aynalanır)
//   flex:   öne bükme (X ekseni çevresinde; omuz/kalça/dirsek için ön yöne, diz için arkaya)

import * as THREE from '../../vendor/three/build/three.module.js';

export const SEGMENTS = ['upperArm-L', 'forearm-L', 'upperArm-R', 'forearm-R', 'thigh-L', 'leg-L', 'thigh-R', 'leg-R'];

const about = (center, rot) => new THREE.Matrix4()
  .makeTranslation(center.x, center.y, center.z)
  .multiply(rot)
  .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));

export class Rig {
  /** @param {Record<string, number[]>} joints manifest.joints */
  constructor(joints) {
    this.j = Object.fromEntries(Object.entries(joints).map(([k, v]) => [k, new THREE.Vector3(...v)]));
    this.matrices = new Map(SEGMENTS.map((s) => [s, new THREE.Matrix4()]));
  }

  /**
   * @param {{[k:string]: {abduct?:number, flex?:number}}} pose anahtarlar: shoulder-L, elbow-L, hip-L, knee-L (ve -R)
   * Dirsek ve diz için yalnızca flex kullanılır. Ek olarak AR için düzlem içi açı: {plane: θ} (Z ekseni, doğrudan).
   */
  setPose(pose = {}) {
    for (const S of ['L', 'R']) {
      const side = S === 'L' ? 1 : -1;
      const sh = pose[`shoulder-${S}`] ?? {}, el = pose[`elbow-${S}`] ?? {};
      const hp = pose[`hip-${S}`] ?? {}, kn = pose[`knee-${S}`] ?? {};
      const rot = (j, flexSign) => {
        const m = new THREE.Matrix4();
        if (j.plane !== undefined) return m.makeRotationZ(j.plane);
        const rz = new THREE.Matrix4().makeRotationZ(side * (j.abduct ?? 0));
        const rx = new THREE.Matrix4().makeRotationX(flexSign * (j.flex ?? 0));
        return m.multiplyMatrices(rz, rx);
      };
      const upper = about(this.j[`shoulder-${S}`], rot(sh, -1));
      const fore = upper.clone().multiply(about(this.j[`elbow-${S}`], rot(el, -1)));
      const thigh = about(this.j[`hip-${S}`], rot(hp, -1));
      const leg = thigh.clone().multiply(about(this.j[`knee-${S}`], rot(kn, +1)));
      this.matrices.get(`upperArm-${S}`).copy(upper);
      this.matrices.get(`forearm-${S}`).copy(fore);
      this.matrices.get(`thigh-${S}`).copy(thigh);
      this.matrices.get(`leg-${S}`).copy(leg);
    }
    return this;
  }

  /** Bir noktanın verilen segmentin dönüşümüyle yeni konumu (test/hata ayıklama). */
  transformPoint(segment, p) {
    return new THREE.Vector3(...p).applyMatrix4(this.matrices.get(segment)).toArray();
  }
}
