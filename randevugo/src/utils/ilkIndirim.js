// İlk randevu indirimi (kullanıcı kararı 2026-10-29): esnaf yeni müşteri çekmek için ilk randevuya %20 ya da 100 ₺ indirim verir.
// Hangi hizmetlerde geçerli olduğunu esnaf seçer (hizmetler.ilk_indirim, varsayılan açık). Randevu sayfası aynı hesabı yapar
// (admin-panel/src/components/BookingPage/BookingPage.jsx: ilkIndirimUygula); biri değişirse öbürü de değişmeli.
const YUZDE_MAX = 90;

// İşletmenin geçerli kampanyası → { tur, deger, bitis } ya da null (kapalı, değer yok, süresi geçmiş)
function kampanya(i, bugun) {
  if (!i || !i.ilk_indirim_aktif) return null;
  const tur = i.ilk_indirim_tur === 'tl' ? 'tl' : 'yuzde';
  const deger = Number(i.ilk_indirim_deger) || 0;
  if (!(deger > 0) || (tur === 'yuzde' && deger > YUZDE_MAX)) return null;
  const bitis = i.ilk_indirim_bitis ? String(i.ilk_indirim_bitis).slice(0, 10) : null;
  if (bitis && bugun && bitis < bugun) return null;
  return { tur, deger, bitis };
}

// Hizmet fiyatlarına indirim: yüzde her uygun hizmete; TL uygun hizmetlerden sırayla düşülür (fiyat 0'ın altına inmez).
// Fiyatlar tam liraya yuvarlanır. → { fiyatlar: [her hizmetin yeni fiyatı], tutar: toplam indirim }
function uygula(hizmetler, indirim) {
  const liste = hizmetler.map(h => Number(h.fiyat) || 0);
  if (!indirim) return { fiyatlar: liste, tutar: 0 };
  let kalan = indirim.tur === 'tl' ? Number(indirim.deger) || 0 : 0;
  const fiyatlar = hizmetler.map((h, i) => {
    const f = liste[i];
    if (h.ilk_indirim === false || !(f > 0)) return f;
    if (indirim.tur === 'tl') { const dus = Math.min(kalan, f); kalan -= dus; return Math.round(f - dus); }
    return Math.round(f * (100 - Number(indirim.deger)) / 100);
  });
  return { fiyatlar, tutar: liste.reduce((t, f) => t + f, 0) - fiyatlar.reduce((t, f) => t + f, 0) };
}

// Panelden gelen ayar → temiz değerler ya da kullanıcıya gösterilecek hata
function ayarTemiz(b) {
  const tur = b.tur === 'tl' ? 'tl' : 'yuzde';
  const deger = parseFloat(String(b.deger ?? '').replace(',', '.'));
  const aktif = !!b.aktif;
  if (aktif && !(deger > 0)) return { hata: 'İndirim miktarını yaz' };
  if (aktif && tur === 'yuzde' && deger > YUZDE_MAX) return { hata: `İndirim en fazla %${YUZDE_MAX} olabilir` };
  const bitis = b.bitis ? String(b.bitis).slice(0, 10) : null;
  if (bitis && !/^\d{4}-\d{2}-\d{2}$/.test(bitis)) return { hata: 'Bitiş tarihi geçersiz' };
  return { aktif, tur, deger: deger > 0 ? deger : null, bitis };
}

module.exports = { kampanya, uygula, ayarTemiz, YUZDE_MAX };
