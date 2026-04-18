// Toplu Tarama — Bölge ve Şehir Presetleri
// Avcı Bot toplu tarama için hazır il listeleri

const TR_ILCELER = require('./tr_ilceler.json');

const BOLGELER = {
  buyuk_10: {
    isim: '🏙 Büyük 10 Şehir',
    aciklama: 'En kalabalık 10 şehir — hızlı ve etkili',
    iller: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Kayseri', 'Samsun'],
  },
  buyuk_20: {
    isim: '🏙 Büyük 20 Şehir',
    aciklama: 'İlk 20 büyükşehir',
    iller: ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Adana', 'Konya', 'Gaziantep', 'Kayseri', 'Samsun',
            'Mersin', 'Diyarbakır', 'Hatay', 'Eskişehir', 'Şanlıurfa', 'Trabzon', 'Malatya', 'Erzurum', 'Van', 'Denizli'],
  },
  marmara: {
    isim: '🌊 Marmara Bölgesi',
    aciklama: '11 il',
    iller: ['İstanbul', 'Kocaeli', 'Bursa', 'Tekirdağ', 'Sakarya', 'Balıkesir', 'Kırklareli', 'Edirne', 'Yalova', 'Çanakkale', 'Bilecik'],
  },
  ege: {
    isim: '🌅 Ege Bölgesi',
    aciklama: '8 il',
    iller: ['İzmir', 'Aydın', 'Muğla', 'Denizli', 'Manisa', 'Uşak', 'Afyonkarahisar', 'Kütahya'],
  },
  akdeniz: {
    isim: '🌴 Akdeniz Bölgesi',
    aciklama: '8 il',
    iller: ['Antalya', 'Mersin', 'Adana', 'Hatay', 'Osmaniye', 'Kahramanmaraş', 'Burdur', 'Isparta'],
  },
  karadeniz: {
    isim: '🌲 Karadeniz Bölgesi',
    aciklama: '18 il',
    iller: ['Samsun', 'Trabzon', 'Ordu', 'Giresun', 'Rize', 'Artvin', 'Bartın', 'Bolu', 'Düzce', 'Sinop', 'Kastamonu', 'Zonguldak', 'Tokat', 'Amasya', 'Çorum', 'Gümüşhane', 'Bayburt', 'Karabük'],
  },
  ic_anadolu: {
    isim: '🌾 İç Anadolu',
    aciklama: '13 il',
    iller: ['Ankara', 'Konya', 'Kayseri', 'Eskişehir', 'Sivas', 'Nevşehir', 'Aksaray', 'Niğde', 'Kırıkkale', 'Karaman', 'Çankırı', 'Kırşehir', 'Yozgat'],
  },
  g_dogu: {
    isim: '🏜 Güneydoğu',
    aciklama: '9 il',
    iller: ['Gaziantep', 'Şanlıurfa', 'Diyarbakır', 'Mardin', 'Batman', 'Siirt', 'Şırnak', 'Kilis', 'Adıyaman'],
  },
  dogu: {
    isim: '🏔 Doğu Anadolu',
    aciklama: '14 il',
    iller: ['Erzurum', 'Malatya', 'Elazığ', 'Van', 'Ağrı', 'Kars', 'Iğdır', 'Ardahan', 'Erzincan', 'Muş', 'Bingöl', 'Bitlis', 'Hakkari', 'Tunceli'],
  },
  tumu: {
    isim: '🇹🇷 Tüm Türkiye',
    aciklama: '81 il — dikkat: uzun sürer + yüksek API maliyeti',
    iller: Object.keys(TR_ILCELER).map(k => {
      // Küçük harfle başlayan keys'leri capitalize et (ilk harfe göre)
      return k.charAt(0).toLocaleUpperCase('tr') + k.slice(1);
    }),
  },
};

// İlçe sayısını hesapla (tahmini sorgu sayısı için)
function toplamIlceSayisi(iller) {
  let toplam = 0;
  for (const il of iller) {
    const key = String(il).toLocaleLowerCase('tr').replace('i̇', 'i');
    const ilceler = TR_ILCELER[key] || [];
    toplam += ilceler.length || 1;
  }
  return toplam;
}

module.exports = { BOLGELER, toplamIlceSayisi };
