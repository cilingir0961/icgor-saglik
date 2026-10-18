# "Bana Anlat — Vücudumda nerelere dikkat etmeliyim?" (v0.7)

Amaç: kullanıcı 3B vücuduna baktığında **neremde ne ölçüldü, hangi hareketimde fark var, bu ne anlama gelebilir
ve şimdi ne yapabilirim** sorularının cevabını kolayca bulsun. İçGör bir teşhis cihazı değildir; gözlemlenen
duruş ve hareket farklarını, belirsizlikleriyle birlikte, günlük Türkçeyle anlatır.

## Nereden açılır?

- **Bugün** ekranı → "Bana Anlat" kartı (en önemli tek cümle + "Vücudumda nerelere dikkat etmeliyim?")
- **☰ Daha** → "Bana Anlat"
- **3B Anatomi** → sağ araç çubuğu "Bana Anlat": vücut baştan ayağa çerçevelenir, 8 bölge işareti çıkar
- **Tarama raporu** → üstte "Vücudumun Özeti" kartı (her taramadan sonra)
- **Asistan** → "Vücudumda nerelere dikkat etmeliyim?" (yalnızca "Bana Anlat bulguları" paylaşımı açıksa)

## Bölgeler ve hangi ölçüme dayandıkları (`src/insight/regions.js`)

| Bölge | Ölçüm (kaynak) | Tür |
|---|---|---|
| Baş ve boyun | Başın yana eğimi (önden duruş); başın öne konumu, kulak–omuz açısı (yandan; kişiye göre değişir → yalnızca ölçüm); baş yana yatırma sağ–sol farkı (hareket testi) | sapma / ölçüm / asimetri |
| Sol omuz, Sağ omuz | Omuz seviyesi (önden/arkadan); kol kaldırma açısı ve sağ–sol fark (hareket testi); kamera koçu kol kaldırma farkı | sapma / ölçüm / asimetri |
| Gövde | Yana eğilim (önden/arkadan), öne eğilim (yandan); squat ve öne eğilmede gövde açısı | sapma / ölçüm |
| Kalça ve leğen | Kalça seviyesi (deneysel); squat kalça açısı | sapma / ölçüm |
| Sol diz, Sağ diz | Squat en küçük diz açısı, tekrarlar arası tutarlılık; yandan diz hizası (deneysel); kamera koçu squat/otur-kalk | ölçüm |
| Ayak bilekleri ve denge | Tek ayak üzerinde durma süresi, yürüyüş adım sıklığı | ölçüm |

**Bölgesi olmayanlar (bilerek):** omurga şekli/eğriliği, disk, kas yırtığı, sinir sıkışması, iç organlar, iç yağ.
Kamera bunları göremez; haritada yer almaz ve hiçbir metinde ima edilmez.

## Renk kuralı (`src/insight/evaluate.js`)

| Renk | Koşul | Kullanıcıya yazılan |
|---|---|---|
| **Gri** | Bölge için ölçüm yok **ya da** yalnızca düşük güvenilirlikli ölçüm var | "Bu bölge için henüz ölçüm yok" / "ölçüldü ama güvenilirliği düşüktü" |
| **Yeşil** | En az bir güvenilir ölçüm var ve hiçbiri belirsizliği aşan fark (\|fark\| > 2u) göstermiyor | "Ölçümde belirgin fark görülmedi" (asla "sorun yok") |
| **Sarı** | Son ölçümde belirsizliği aşan fark var ama yalnızca **tek** ölçümde, ya da yalnızca **deneysel** göstergede | "Tekrar ölçüm / dikkat önerilir" |
| **Turuncu** | Aynı göstergede, **aynı yönde**, karşılaştırılabilir koşullarda (aynı görünüş, model, mesafe, eğim durumu) **en az iki** güvenilir ölçümde süren fark; deneysel gösterge turuncu olamaz | "Birden fazla ölçümde süren fark" |

- **Kırmızı yoktur:** kamera verisinden tıbbi risk sınıflandırması yapılmaz.
- Ölçülmemiş bölge **asla yeşil** gösterilmez.
- Tek ölçümden kesin sonuç üretilmez (en fazla sarı + "tekrar ölçelim").
- Düşük kare hızı (< 8 fps), eksik eklem, kameraya doğru kısalan segment ve düşük güvenilirlik: ölçüm
  kullanılmaz (gri). Telefon eğimi bilinmiyorsa belirsizlik büyür (eğim ±4°) ve kartta açıkça uyarı yazılır.

## Açıklama kartı (bölgeye dokununca)

1. **Ne gözlemlendi:** hangi harekette/duruşta, kaç derece (sol/sağ değerleriyle), ± belirsizlik
2. **Dayandığı ölçüm:** test adı ve tarih
3. **Bu ne demek?** sade açıklama + neden kesin bir sağlık sorunu anlamına gelmediği
4. **Ölçüm ne kadar güvenilir?** güvenilirlik derecesi, karar sınırı (±2u), kaç ölçümde görüldüğü,
   kamera kaynaklı olası nedenler (açı, kıyafet, ışık, görünürlük, kare hızı, deneysel gösterge)
5. **Ne yapabilirim?** tekrar ölçüm, "Bana uygun hareketi göster" (seviye/ekipman/yer/kısıt süzgeçli),
   "Ölçümü tekrarla", "Bu bölgede ağrı, uyuşma veya güç kaybı var" (işaretlenirse öneri yapılmaz, uzmana yönlendirilir)
6. **Daha fazla bilgi:** genel anatomi (açıkça "sana özel ölçüm değil" etiketli)
7. **Sesli dinle** (varsayılan kapalı; yalnızca cihaz içi Türkçe ses)

### Örnek (test verisi, gerçek kişi değil)

> **Sağ omuz — Birden fazla ölçümde süren fark** · Ölçüm güvenilirliği: iyi · 2 ölçüm
>
> Kolları yandan kaldırma sırasında sol taraf 24° daha fazla ölçüldü (sol 152°, sağ 128°); fark 24° ± 4,2°.
>
> **Bu ne demek?** Kollarını yandan kaldırırken bir kol diğerinden daha yükseğe kalktı. Bu, hareketi iki tarafta
> farklı yaptığın, bir tarafta daha rahat olduğun ya da kameranın bir kolu daha zor gördüğü anlamına gelebilir.
> Bu fark tek başına bir sağlık sorunu olduğunu göstermez. Kamera yalnızca vücudunun dış hatlarını ve eklem
> noktalarının yaklaşık yerini görür; kas, kemik, disk, sinir veya iç organ hakkında bilgi veremez.
>
> **Ne yapabilirim?** Bu fark birkaç ölçümde sürdü. Hareketi rahat yapabildiğin aralıkta, kontrollü egzersizlerle
> çalışabilirsin; ağrı, uyuşma veya güç kaybı varsa bir fizyoterapist ya da hekime göstermen iyi olur.
> Önerilen: Kolları yandan kaldırma · Kol çevirme · Duvar meleği (tedavi değildir).

## Egzersiz önerisi kuralları (`src/insight/recommend.js`)

- Bölge → aday listesi (hafif ve kontrollü olanlar önde); `planner.eligible` ile seviye, yer, ekipman, güvenlik
  ön değerlendirmesi ve kısıtlı bölgeler süzülür; en fazla 3 öneri.
- **Öneri yapılmaz** (uzmana yönlendirme gösterilir): son 7 günde antrenman geri bildiriminde göğüs ağrısı,
  baş dönmesi, nefes darlığı, **uyuşma**, **güç kaybı**; plan duraklatılmışsa; son 14 günde o bölge için
  "ağrı/uyuşma/güç kaybı" işaretlendiyse; profilde bölge kısıtlı ise.
- Antrenman geri bildirimine "uyuşma/karıncalanma" ve "güç kaybı" eklendi → plan durur, yük artmaz.

## Sesli anlatım (`src/insight/speak.js`)

Varsayılan kapalı; kullanıcı başlatır/durdurur. Yalnızca `localService` (cihaz üzerinde çalışan) Türkçe ses
seçilir: bazı tarayıcıların çevrim içi sesleri metni üçüncü taraf sunucuya gönderir, bunlar kullanılmaz. Uygun
ses yoksa anlaşılır hata gösterilir; yazılı özellik eksiksiz çalışır.

## Doğrulama

| Test | Sonuç |
|---|---|
| `test/insight.test.js` (10) | simetrik → yeşil; tek ölçüm farkı → sarı; aynı yönde iki ölçüm → turuncu; ters yön → sarı; kötü açı (eğim bilinmiyor) → fark belirgin sayılmaz + uyarı; eksik eklem/düşük güvenilirlik → gri; düşük fps koç oturumu kullanılmaz; deneysel → en fazla sarı; ağrı/uyuşma/kısıt → öneri yok; veri yok → boş özet; sesli: yalnız cihaz içi Türkçe; asistan veri yok yanıtı |
| Tarayıcı (`bana-anlat`, `bana-anlat-bos`, `bana-anlat-3b`) | iPhone/Android/masaüstü emülasyonu: renkler, kart metinleri (derece, ±u, "sağlık sorunu olduğunu göstermez"), öneri süzgeci, belirti → kilit, büyük yazı, 3B işaretlerin yeri (önden: sağ omuz ekranın solunda), boş durum |

Not: tarayıcı testleri sentetik/elle yazılmış ölçüm verisiyle yapılır; **gerçek kişi ve gerçek cihaz doğrulaması
yapılmadı.** Renk eşikleri (2u, iki ölçüm) istatistiksel karar kuralıdır; klinik eşik değildir.
