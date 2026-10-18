// Kas gruplarının günlük dilde açıklaması (saf). Genel eğitim bilgisidir; kişiye özel değerlendirme, tanı veya
// tedavi değildir. "Bana Anlat" bölgesiyle eşleme: ilgili ölçüm varsa kullanıcı oradan kendi sonucuna geçer.

export const MUSCLE_GUIDE = {
  'mus-head-neck': {
    plain: 'Başını dik tutar, çevirir ve eğer. Çiğneme ve yutkunmada da görev alır.',
    daily: 'Ekrana bakarken başını taşımak, omzunun üstünden geriye bakmak, uzun süre telefon kullanmak.',
    regions: ['bas-boyun'],
  },
  'mus-chest': {
    plain: 'Kolunu öne ve içe doğru getirir; itme hareketlerinin ana kaslarıdır.',
    daily: 'Bir kapıyı itmek, yerden kalkarken kendini itmek, bir şeyi göğüs hizasında taşımak.',
    regions: ['govde', 'omuz-L', 'omuz-R'],
  },
  'mus-abdomen': {
    plain: 'Gövdeyi öne büker, döndürür ve dik tutmaya yardım eder; nefes vermede de çalışır.',
    daily: 'Yataktan doğrulmak, eğilip bir şey almak, yürürken dengeyi korumak.',
    regions: ['govde'],
  },
  'mus-back': {
    plain: 'Gövdeyi dik tutar, geriye doğru açar; kürek kemiklerini hareket ettirir.',
    daily: 'Uzun süre oturmak, yerden bir şey kaldırmak, sırt çantası taşımak.',
    regions: ['govde', 'omuz-L', 'omuz-R'],
  },
  'mus-shoulder-arm': {
    plain: 'Kolunu yukarı, yana ve öne kaldırır; dirseğini büker ve açar.',
    daily: 'Üst rafa uzanmak, saçını taramak, poşet taşımak, ceket giymek.',
    regions: ['omuz-L', 'omuz-R'],
  },
  'mus-forearm-hand': {
    plain: 'Bileğini ve parmaklarını hareket ettirir; kavrama gücünü sağlar.',
    daily: 'Kavanoz açmak, yazı yazmak, telefon tutmak, çanta kulpunu kavramak.',
    regions: ['omuz-L', 'omuz-R'],
  },
  'mus-hip-thigh': {
    plain: 'Kalçanı ve dizini büker ve açar; ayağa kalkmanın, merdiven çıkmanın ana kaslarıdır.',
    daily: 'Sandalyeden kalkmak, merdiven çıkmak, çömelip bir şey almak.',
    regions: ['kalca', 'diz-L', 'diz-R'],
  },
  'mus-leg-foot': {
    plain: 'Ayak bileğini hareket ettirir; yürürken itme ve denge sağlar.',
    daily: 'Yürümek, parmak ucunda uzanmak, engebeli zeminde dengede kalmak.',
    regions: ['diz-L', 'diz-R', 'denge'],
  },
  'mus-pelvic': {
    plain: 'Leğen kemiğinin tabanını destekler; gövdenin derin destek kaslarıyla birlikte çalışır.',
    daily: 'Öksürürken, gülerken veya ağır bir şey kaldırırken gövdeyi destekler.',
    regions: ['kalca'],
  },
};
