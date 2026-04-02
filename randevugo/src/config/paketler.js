const PAKETLER = {
  baslangic: {
    isim: 'Başlangıç',
    fiyat: 299,
    calisan_limit: 1,
    hizmet_limit: 5,
    aylik_randevu_limit: 100,
    bot_aktif: true,
    hatirlatma: false,
    istatistik: false,
    ozellikler: [
      '1 çalışan',
      '5 hizmete kadar',
      'Aylık 100 randevu',
      'WhatsApp bot',
    ]
  },
  profesyonel: {
    isim: 'Profesyonel',
    fiyat: 599,
    calisan_limit: 5,
    hizmet_limit: 20,
    aylik_randevu_limit: 500,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: false,
    ozellikler: [
      '5 çalışana kadar',
      '20 hizmete kadar',
      'Aylık 500 randevu',
      'WhatsApp bot',
      'Randevu hatırlatmaları',
    ]
  },
  premium: {
    isim: 'Premium',
    fiyat: 999,
    calisan_limit: 999,
    hizmet_limit: 999,
    aylik_randevu_limit: 99999,
    bot_aktif: true,
    hatirlatma: true,
    istatistik: true,
    ozellikler: [
      'Sınırsız çalışan',
      'Sınırsız hizmet',
      'Sınırsız randevu',
      'WhatsApp bot',
      'Randevu hatırlatmaları',
      'Gelişmiş istatistikler',
    ]
  }
};

module.exports = PAKETLER;
