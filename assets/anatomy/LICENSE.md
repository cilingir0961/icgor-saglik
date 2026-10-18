# Anatomik 3B model lisansları

Bu klasördeki model dosyaları (`*.glb`) üçüncü taraf açık veriden **türetilmiştir**.
Uygulamanın kaynak kodu bu lisanstan ayrıdır.

> Bu modeller genel referans anatomidir; herhangi bir kişinin tıbbi taraması değildir.

## BodyParts3D (deri, iskelet, organlar, damarlar, sinirler)

- Atıf: **BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International**
- Kaynak: https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html · Ayna: https://github.com/olivercase/body_parts_3d_api (commit `fd527e6f4daf732fd814314d9257df5877b844bc`, https://doi.org/10.5281/zenodo.22727172)
- Yayın: Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782–5. doi:10.1093/nar/gkn613
- Lisans notu: Resmi lisans sayfası (2025-02-27) CC BY 4.0 belirtir; kaynak OBJ yorumları ve ayna depo eski CC BY-SA 2.1 JP der. İhtiyaten bu projedeki türev model dosyaları CC BY-SA 4.0 altında yayınlanır (her iki lisansla uyumlu).
- **Bu klasördeki türev dosyalar: CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/

### Yapılan değişiklikler (uyarlama)

- Birim mm → m, eksenler Z-yukarı → Y-yukarı; vücut ayak tabanı y=0 olacak şekilde ortalandı.
- Parçalar anatomik yapılara birleştirildi; yinelenen temsiller ayıklandı.
- meshoptimizer ile iki ayrıntı düzeyine sadeleştirildi (high / low), normaller yeniden hesaplandı,
  EXT_meshopt_compression ile sıkıştırıldı.
- Her parçanın kaynak kimliği ve SHA-256 özeti: `provenance.json`.

## Z-Anatomy (kaslar ve tendonlar: `muscles.glb`)

- Atıf: **Z-Anatomy — Gauthier Kervyn (tasarım, 3B, anatomi), Marcin Zielinski (Python); BodyParts3D (DBCLS) türevi**
- Kaynak: https://github.com/Z-Anatomy/Models-of-human-anatomy (commit `0fee499c81db03fcbafecbe7ace68d5d5a18aa92`, `Z-Anatomy.zip`, SHA-256 `e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736`)
- Lisans: **CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/. Türev dosya da CC BY-SA 4.0.
- Uyarlama: Blender değiştiricileri uygulanmış geometri dışa aktarıldı (bpy), fasya/bursa/kılıf gibi ince zarlar
  çıkarıldı, kaslar işlevsel gruplara ayrıldı ve sadeleştirildi.
- Z-Anatomy iskeleti BodyParts3D'ninkinden ~1 cm farklı konumlandırıldığı için kaslar, 12 bölgede (4 gövde + 8 uzuv) kemik
  yüzeylerinin afin ICP kaydıyla BodyParts3D iskeletine taşındı (segment RMS en fazla
  3.12 mm; kemik merkezleri
  Right femur 112.7 → 0.34 mm, Left femur 112.7 → 0.36 mm, Right humerus 121.2 → 0.74 mm, Left humerus 121.2 → 0.65 mm).

## Doğrulama için kullanılan (dağıtılmayan) veri

- Human Reference Atlas — 3D Reference Organ Set, Male (united), v2.0 — Human Reference Atlas (HuBMAP), medical illustration: Kristen Browne, Heidi Schlehlein; Visible Human Male data, U.S. National Library of Medicine. Lisans: CC BY 4.0 (https://humanatlas.io/3d-reference-library). Yayın: Börner K, et al. Anatomical structures, cell types and biomarkers of the Human Reference Atlas. Nat Cell Biol. 2021;23:1117–1128. doi:10.1038/s41556-021-00788-6
- Yalnızca derleme sırasında, konumların bağımsız çapraz kontrolü için kullanılır
  (31 ortak yapı, kayıt RMS 15.77 mm). Bu klasörde HRA geometrisi yoktur.
