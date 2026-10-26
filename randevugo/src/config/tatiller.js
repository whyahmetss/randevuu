// Türkiye resmî tatilleri (2026-10-26). Dini bayramlar her yıl kayar: Diyanet takvimine göre elle eklenir.
// 2027 tarihleri Diyanet takviminden (Ramazan arife 8 Mart, 1. gün 9 Mart; Kurban arife 15 Mayıs, 1. gün 16 Mayıs).
// 2028 için Diyanet takvimi yayımlanınca DINI'ye eklenmeli; eklenmezse o yıl bayramlar normal gün sayılır.
// Esnaf panelden her tatil türü için açık/kapalı seçer (isletmeler.tatil_kapali). Seçmediyse VARSAYILAN_KAPALI geçerli.
// Arife yarım gündür: kapalı seçilirse 13:00'ten sonra randevu alınmaz.

const SABIT = [
  ['01-01', 'yilbasi', 'Yılbaşı'],
  ['04-23', 'egemenlik', '23 Nisan Ulusal Egemenlik ve Çocuk Bayramı'],
  ['05-01', 'emek', '1 Mayıs Emek ve Dayanışma Günü'],
  ['05-19', 'genclik', '19 Mayıs Atatürk\'ü Anma, Gençlik ve Spor Bayramı'],
  ['07-15', 'demokrasi', '15 Temmuz Demokrasi ve Millî Birlik Günü'],
  ['08-30', 'zafer', '30 Ağustos Zafer Bayramı'],
  ['10-28', 'cumhuriyet_arife', 'Cumhuriyet Bayramı arifesi', true],
  ['10-29', 'cumhuriyet', '29 Ekim Cumhuriyet Bayramı'],
];

// [yıl, arife (YYYY-MM-DD), gün sayısı, tür]
const DINI = [
  [2026, '2026-03-19', 3, 'ramazan'],
  [2026, '2026-05-26', 4, 'kurban'],
  [2027, '2027-03-08', 3, 'ramazan'],
  [2027, '2027-05-15', 4, 'kurban'],
];
const DINI_AD = { ramazan: 'Ramazan Bayramı', kurban: 'Kurban Bayramı' };

// Tür anahtarları ve panelde görünen adları (her yıl aynı)
const TURLER = [
  ...SABIT.map(([, anahtar, ad, yarim]) => ({ anahtar, ad, yarim: !!yarim })),
  ...['ramazan', 'kurban'].flatMap(t => [
    { anahtar: `${t}_arife`, ad: `${DINI_AD[t]} arifesi`, yarim: true },
    ...Array.from({ length: t === 'ramazan' ? 3 : 4 }, (_, i) => ({ anahtar: `${t}_${i + 1}`, ad: `${DINI_AD[t]} ${i + 1}. gün`, yarim: false })),
  ]),
];

// Berberlerin çoğu bayramın ilk günü kapalı, öbür tatillerde açık
const VARSAYILAN_KAPALI = ['ramazan_1', 'kurban_1'];
const ARIFE_KAPANIS = '13:00';

const gunEkle = (tarih, n) => {
  const [y, a, g] = tarih.split('-').map(Number);
  const d = new Date(Date.UTC(y, a - 1, g + n));
  return d.toISOString().slice(0, 10);
};

// tarih (YYYY-MM-DD) → o güne düşen tatiller (2027-05-19 hem Kurban 4. gün hem 19 Mayıs)
function ogunTatiller(tarih) {
  const t = String(tarih || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return [];
  const out = [];
  for (const [, arife, gun, tur] of DINI) {
    for (let i = 0; i <= gun; i++) {
      if (gunEkle(arife, i) === t) out.push(TURLER.find(x => x.anahtar === (i === 0 ? `${tur}_arife` : `${tur}_${i}`)));
    }
  }
  const s = SABIT.find(([ay]) => ay === t.slice(5));
  if (s) out.push(TURLER.find(x => x.anahtar === s[1]));
  return out;
}
const tatilBul = (tarih) => ogunTatiller(tarih)[0] || null;

const kapaliListe = (isletme) => (Array.isArray(isletme?.tatil_kapali) ? isletme.tatil_kapali : VARSAYILAN_KAPALI);

// O gün işletme için tatil kapanışı: null (açık) | { tamGun: true } | { sonra: '13:00' } (arife)
function tatilKapanisi(isletme, tarih) {
  const kapali = ogunTatiller(tarih).filter(t => kapaliListe(isletme).includes(t.anahtar));
  const tam = kapali.find(t => !t.yarim);
  if (tam) return { ...tam, tamGun: true };
  return kapali.length ? { ...kapali[0], sonra: ARIFE_KAPANIS } : null;
}

// Bugünden itibaren gelecek tatiller (panel listesi)
function yaklasanlar(bugun, gunSayisi = 400) {
  const out = [];
  for (let i = 0; i < gunSayisi; i++) {
    const tarih = gunEkle(bugun, i);
    for (const t of ogunTatiller(tarih)) out.push({ tarih, ...t });
  }
  return out;
}

module.exports = { TURLER, VARSAYILAN_KAPALI, tatilBul, tatilKapanisi, kapaliListe, yaklasanlar };
