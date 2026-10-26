// Acil durum ve resmî tatil ayarı (2026-10-26). Esnaf her çalışan ya da bütün dükkân için, personel yalnız kendisi için
// acil durum başlatır (services/acilDurum.js). Tatil ayarı yalnız esnafın.
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');
const acilDurum = require('../services/acilDurum');
const tatiller = require('../config/tatiller');
const { bugunTarih } = require('../utils/tarih');

// Kapsam: personel her zaman kendisi; esnaf gövdedeki calisan_id (boş = bütün dükkân)
const kapsam = (req) => (req.kullanici.rol === 'personel'
  ? { calisanId: req.kullanici.calisan_id }
  : { calisanId: parseInt(req.body?.calisan_id) || null });

const hataCevap = (res, e) => res.status(e.kod || 500).json({ hata: e.message });

class AcilDurumController {
  // GET /api/acil-durum
  async liste(req, res) {
    try {
      const calisanId = req.kullanici.rol === 'personel' ? req.kullanici.calisan_id : null;
      res.json({ acil_durumlar: await acilDurum.liste(getIsletmeId(req), calisanId), en_uzun_gun: acilDurum.EN_UZUN_GUN });
    } catch (e) { hataCevap(res, e); }
  }

  // POST /api/acil-durum/onizleme { calisan_id?, bitis_tarih } → etkilenen randevular ve kararlar (hiçbir şey değişmez)
  async onizleme(req, res) {
    try { res.json(await acilDurum.plan(getIsletmeId(req), { ...kapsam(req), bitisTarih: req.body?.bitis_tarih })); }
    catch (e) { hataCevap(res, e); }
  }

  // POST /api/acil-durum { calisan_id?, bitis_tarih } → uygula
  async baslat(req, res) {
    try {
      const sonuc = await acilDurum.baslat(getIsletmeId(req), { ...kapsam(req), bitisTarih: req.body?.bitis_tarih, olusturanId: req.kullanici.id });
      // Personel başlattıysa patrona haber
      if (req.kullanici.rol === 'personel') {
        try {
          await require('../services/pushService').sendToIsletme(getIsletmeId(req), {
            title: 'Acil durum', body: `${sonuc.calisan?.isim || 'Bir çalışan'} ${sonuc.bitis} tarihine kadar randevu almıyor; ${sonuc.randevular.length} randevu düzenlendi.`, url: '/', tag: 'acil',
          });
        } catch (e) { /* bildirim olmadan */ }
      }
      res.json(sonuc);
    } catch (e) { hataCevap(res, e); }
  }

  // DELETE /api/acil-durum/:id → bitir (personel yalnız kendisininkini)
  async bitir(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      if (req.kullanici.rol === 'personel') {
        const a = (await pool.query('SELECT calisan_id FROM acil_durumlar WHERE id = $1 AND isletme_id = $2', [req.params.id, isletmeId])).rows[0];
        if (!a || a.calisan_id !== req.kullanici.calisan_id) return res.status(404).json({ hata: 'Acil durum bulunamadı' });
      }
      const a = await acilDurum.bitir(isletmeId, parseInt(req.params.id));
      if (!a) return res.status(404).json({ hata: 'Acil durum bulunamadı ya da zaten bitmiş' });
      res.json({ bitti: true });
    } catch (e) { hataCevap(res, e); }
  }

  // GET /api/tatiller → türler, kapalı seçilenler, yaklaşan tatiller
  async tatilAyar(req, res) {
    try {
      const i = (await pool.query('SELECT tatil_kapali FROM isletmeler WHERE id = $1', [getIsletmeId(req)])).rows[0] || {};
      const kapali = tatiller.kapaliListe(i);
      res.json({
        turler: tatiller.TURLER, kapali, varsayilan: tatiller.VARSAYILAN_KAPALI,
        yaklasanlar: tatiller.yaklasanlar(bugunTarih()).map(t => ({ ...t, kapali: kapali.includes(t.anahtar) })),
      });
    } catch (e) { hataCevap(res, e); }
  }

  // PUT /api/tatiller { kapali: ['ramazan_1', ...] }
  async tatilKaydet(req, res) {
    try {
      const gecerli = new Set(tatiller.TURLER.map(t => t.anahtar));
      if (!Array.isArray(req.body?.kapali)) return res.status(400).json({ hata: 'kapali listesi gerekli' });
      const kapali = [...new Set(req.body.kapali.map(String))].filter(k => gecerli.has(k));
      await pool.query('UPDATE isletmeler SET tatil_kapali = $1 WHERE id = $2', [JSON.stringify(kapali), getIsletmeId(req)]);
      res.json({ kapali });
    } catch (e) { hataCevap(res, e); }
  }
}

module.exports = new AcilDurumController();
