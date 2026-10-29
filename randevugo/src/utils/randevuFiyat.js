// Randevunun tutarı (2026-10-29): randevu_hizmetleri'ne yazılan fiyatların toplamı. Çoklu hizmetin hepsi ve ilk randevu
// indirimi dahil; sonradan değişen liste fiyatı eski randevuyu değiştirmez. Eskiden raporlar hizmetin bugünkü liste
// fiyatını (yalnız ilk hizmet) topluyordu. Sorguda randevular "r", hizmetler (r.hizmet_id ile) "h" diye bağlanmış olmalı.
const RANDEVU_FIYAT = 'COALESCE((SELECT SUM(rh.fiyat) FROM randevu_hizmetleri rh WHERE rh.randevu_id = r.id), h.fiyat, 0)';

module.exports = { RANDEVU_FIYAT };
