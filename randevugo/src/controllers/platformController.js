// Platform yönetimi (2026-10-15): Platform Ayarları, Sistem Uyarıları, Bot Mesajları, Özellik Anahtarları,
// Kuponlar ve KVKK veri dışa aktarma. Yetkiler config/ekip.js'deki yol önekleriyle (bilinmeyen → kurucu).
const pool = require('../config/db');
const platformAyar = require('../utils/platformAyar');
const ozellik = require('../utils/ozellik');
const botMesajlar = require('../utils/botMesajlar');
const kupon = require('../services/kupon');
const veriAktar = require('../services/veriAktar');
const { getIsletmeId } = require('../middleware/auth');

const kim = (req) => req.kullanici?.email || `kullanici#${req.kullanici?.id || '?'}`;
const denetim = (req, islem, detay, tablo, id) =>
  require('./adminController').auditLogYaz(req.kullanici, islem, detay, tablo, id).catch?.(() => {});
const hataYaz = (res, e, varsayilan = 'İşlem yapılamadı') =>
  e?.kullanici ? res.status(400).json({ hata: e.message }) : (console.error(varsayilan, e?.message), res.status(500).json({ hata: varsayilan }));

const DURUMLAR = ['kapali', 'herkes', 'secili'];
const DILLER = ['tr', 'en', 'ar'];

class PlatformController {
  // ── Platform Ayarları ──
  async ayarlar(req, res) {
    try { await platformAyar.yukle(); res.json({ ayarlar: platformAyar.liste() }); }
    catch (e) { hataYaz(res, e); }
  }

  async ayarKaydet(req, res) {
    try {
      const degisen = await platformAyar.kaydet(req.body?.degerler || {}, kim(req));
      if (degisen.length) await denetim(req, 'platform_ayari', degisen.join(' | ').slice(0, 1000), 'platform_ayarlari', null);
      res.json({ ayarlar: platformAyar.liste(), degisen: degisen.length });
    } catch (e) { hataYaz(res, e, 'Ayarlar kaydedilemedi'); }
  }

  // ── Sistem Uyarıları ──
  async uyarilar(req, res) {
    try {
      const cozuldu = req.query.durum === 'cozuldu';
      const r = await pool.query(
        `SELECT u.*, i.isim AS isletme_isim FROM sistem_uyarilari u LEFT JOIN isletmeler i ON i.id = u.isletme_id
          WHERE u.cozuldu = $1 ORDER BY CASE u.seviye WHEN 'kritik' THEN 0 WHEN 'uyari' THEN 1 ELSE 2 END, u.son_zaman DESC LIMIT 200`, [cozuldu]);
      res.json({ uyarilar: r.rows });
    } catch (e) { hataYaz(res, e); }
  }

  async uyariSayisi(req, res) {
    try {
      const r = (await pool.query(`SELECT COUNT(*)::int AS acik, COUNT(*) FILTER (WHERE seviye = 'kritik')::int AS kritik
        FROM sistem_uyarilari WHERE cozuldu = false`)).rows[0];
      res.json(r);
    } catch (e) { res.json({ acik: 0, kritik: 0 }); }
  }

  async uyariCoz(req, res) {
    try {
      const hepsi = req.params.id === 'hepsi';
      const r = hepsi
        ? await pool.query(`UPDATE sistem_uyarilari SET cozuldu = true, cozulme_zamani = NOW(), cozen = $1 WHERE cozuldu = false`, [kim(req)])
        : await pool.query(`UPDATE sistem_uyarilari SET cozuldu = true, cozulme_zamani = NOW(), cozen = $1 WHERE id = $2 AND cozuldu = false`,
          [kim(req), Number(req.params.id) || 0]);
      res.json({ cozulen: r.rowCount });
    } catch (e) { hataYaz(res, e); }
  }

  // ── Bot Mesajları ──
  async botMesajlari(req, res) {
    try {
      await botMesajlar.sablonlariYukle();
      const ozel = (await pool.query('SELECT anahtar, dil, metin, guncelleme FROM bot_mesaj_sablonlari')).rows;
      const ozelMap = new Map(ozel.map(x => [`${x.anahtar}:${x.dil}`, x]));
      const mesajlar = botMesajlar.anahtarlar().map(anahtar => ({
        anahtar,
        diller: Object.fromEntries(DILLER.map(dil => {
          const v = botMesajlar.varsayilanSablon(anahtar, dil);
          const o = ozelMap.get(`${anahtar}:${dil}`);
          return [dil, { varsayilan: v, duzenlenebilir: v !== null, ozel: o?.metin ?? null, guncelleme: o?.guncelleme ?? null }];
        })),
      }));
      res.json({ mesajlar });
    } catch (e) { hataYaz(res, e); }
  }

  async botMesajKaydet(req, res) {
    try {
      const { anahtar, dil } = req.params;
      if (!DILLER.includes(dil) || !botMesajlar.anahtarlar().includes(anahtar)) return res.status(404).json({ hata: 'Mesaj bulunamadı' });
      const varsayilan = botMesajlar.varsayilanSablon(anahtar, dil);
      if (varsayilan === null) return res.status(400).json({ hata: 'Bu mesaj liste içerdiği için panelden düzenlenemez' });
      const metin = req.body?.metin;
      if (metin === null || String(metin ?? '').trim() === '') {
        await pool.query('DELETE FROM bot_mesaj_sablonlari WHERE anahtar = $1 AND dil = $2', [anahtar, dil]);
        await denetim(req, 'bot_mesaji', `${anahtar} (${dil}) varsayılana döndü`, 'bot_mesaj_sablonlari', null);
      } else {
        const m = String(metin).slice(0, 2000);
        // Varsayılanda olmayan yer tutucu boş kalır: kullanıcıyı uyar
        const izinli = new Set([...varsayilan.matchAll(/\{(\w+)\}/g)].map(x => x[1]));
        const bilinmeyen = [...m.matchAll(/\{(\w+)\}/g)].map(x => x[1]).filter(x => !izinli.has(x));
        if (bilinmeyen.length) return res.status(400).json({ hata: `Bu mesajda kullanılamayan alan: {${bilinmeyen[0]}}. Kullanılabilenler: ${[...izinli].map(x => `{${x}}`).join(' ') || 'yok'}` });
        await pool.query(`INSERT INTO bot_mesaj_sablonlari (anahtar, dil, metin, guncelleme) VALUES ($1, $2, $3, NOW())
          ON CONFLICT (anahtar, dil) DO UPDATE SET metin = EXCLUDED.metin, guncelleme = NOW()`, [anahtar, dil, m]);
        await denetim(req, 'bot_mesaji', `${anahtar} (${dil}) değişti`, 'bot_mesaj_sablonlari', null);
      }
      await botMesajlar.sablonlariYukle();
      res.json({ ok: true });
    } catch (e) { hataYaz(res, e, 'Mesaj kaydedilemedi'); }
  }

  // ── Özellik Anahtarları ──
  async ozellikler(req, res) {
    try { res.json({ ozellikler: (await pool.query('SELECT * FROM ozellik_anahtarlari ORDER BY kod')).rows }); }
    catch (e) { hataYaz(res, e); }
  }

  async ozellikKaydet(req, res) {
    try {
      const b = req.body || {};
      const kod = String(req.params.kod || b.kod || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{2,60}$/.test(kod)) return res.status(400).json({ hata: 'Kod küçük harf, rakam ve _ olmalı (ör. yeni_takvim)' });
      const durum = DURUMLAR.includes(b.durum) ? b.durum : 'kapali';
      const idler = [...new Set((Array.isArray(b.isletme_idler) ? b.isletme_idler : String(b.isletme_idler || '').split(/[\s,]+/))
        .map(Number).filter(n => Number.isInteger(n) && n > 0))];
      if (durum === 'secili' && !idler.length) return res.status(400).json({ hata: '"Seçili işletmeler" için en az bir işletme no gir' });
      await pool.query(`INSERT INTO ozellik_anahtarlari (kod, aciklama, durum, isletme_idler, guncelleme) VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (kod) DO UPDATE SET aciklama = EXCLUDED.aciklama, durum = EXCLUDED.durum, isletme_idler = EXCLUDED.isletme_idler, guncelleme = NOW()`,
        [kod, String(b.aciklama || '').trim().slice(0, 300) || null, durum, idler]);
      await ozellik.yukle();
      await denetim(req, 'ozellik_anahtari', `${kod} → ${durum}${durum === 'secili' ? ` (${idler.join(',')})` : ''}`, 'ozellik_anahtarlari', null);
      res.json({ ok: true });
    } catch (e) { hataYaz(res, e, 'Kaydedilemedi'); }
  }

  async ozellikSil(req, res) {
    try {
      await pool.query('DELETE FROM ozellik_anahtarlari WHERE kod = $1', [req.params.kod]);
      await ozellik.yukle();
      await denetim(req, 'ozellik_anahtari', `${req.params.kod} silindi`, 'ozellik_anahtarlari', null);
      res.json({ ok: true });
    } catch (e) { hataYaz(res, e); }
  }

  // ── Kuponlar ──
  async kuponlar(req, res) {
    try { res.json({ kuponlar: (await pool.query(`SELECT id, kod, aciklama, indirim_yuzde, indirim_tl, paketler, to_char(son_tarih, 'YYYY-MM-DD') AS son_tarih, max_kullanim, kullanim, aktif, olusturma FROM kuponlar ORDER BY aktif DESC, olusturma DESC`)).rows }); }
    catch (e) { hataYaz(res, e); }
  }

  async kuponKaydet(req, res) {
    try {
      const k = kupon.kuponVerisi(req.body || {});
      const id = Number(req.params.id) || null;
      const deg = [k.kod, k.aciklama, k.indirim_yuzde, k.indirim_tl, k.paketler, k.son_tarih, k.max_kullanim, k.aktif];
      const r = id
        ? await pool.query(`UPDATE kuponlar SET kod=$1, aciklama=$2, indirim_yuzde=$3, indirim_tl=$4, paketler=$5, son_tarih=$6,
            max_kullanim=$7, aktif=$8 WHERE id=$9 RETURNING id, kod, aciklama, indirim_yuzde, indirim_tl, paketler, to_char(son_tarih, 'YYYY-MM-DD') AS son_tarih, max_kullanim, kullanim, aktif, olusturma`, [...deg, id])
        : await pool.query(`INSERT INTO kuponlar (kod, aciklama, indirim_yuzde, indirim_tl, paketler, son_tarih, max_kullanim, aktif)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, kod, aciklama, indirim_yuzde, indirim_tl, paketler, to_char(son_tarih, 'YYYY-MM-DD') AS son_tarih, max_kullanim, kullanim, aktif, olusturma`, deg);
      if (!r.rows[0]) return res.status(404).json({ hata: 'Kupon bulunamadı' });
      await denetim(req, id ? 'kupon_guncellendi' : 'kupon_eklendi',
        `${k.kod}: ${k.indirim_yuzde ? '%' + k.indirim_yuzde : k.indirim_tl + '₺'}`, 'kuponlar', r.rows[0].id);
      res.json({ kupon: r.rows[0] });
    } catch (e) {
      if (e.code === '23505') return res.status(400).json({ hata: 'Bu kod zaten var' });
      hataYaz(res, e, 'Kupon kaydedilemedi');
    }
  }

  async kuponSil(req, res) {
    try {
      const id = Number(req.params.id) || 0;
      const kullanilmis = (await pool.query('SELECT 1 FROM kupon_kullanimlari WHERE kupon_id = $1 LIMIT 1', [id])).rows[0];
      // Kullanılmış kupon silinmez (ödeme kayıtları ona bakıyor): pasife alınır
      if (kullanilmis) await pool.query('UPDATE kuponlar SET aktif = false WHERE id = $1', [id]);
      else await pool.query('DELETE FROM kuponlar WHERE id = $1', [id]);
      await denetim(req, 'kupon_silindi', `#${id}${kullanilmis ? ' (kullanılmış: pasife alındı)' : ''}`, 'kuponlar', id);
      res.json({ ok: true, pasif: !!kullanilmis });
    } catch (e) { hataYaz(res, e); }
  }

  async kuponKullanimlari(req, res) {
    try {
      const r = await pool.query(`SELECT k.*, i.isim AS isletme_isim FROM kupon_kullanimlari k LEFT JOIN isletmeler i ON i.id = k.isletme_id
        WHERE k.kupon_id = $1 ORDER BY k.zaman DESC`, [Number(req.params.id) || 0]);
      res.json({ kullanimlar: r.rows });
    } catch (e) { hataYaz(res, e); }
  }

  // Esnaf: kupon kodunu dene → indirimli fiyat (ödeme başlatmadan)
  async kuponKontrol(req, res) {
    try {
      const shopier = require('../services/shopierService');
      const f = await shopier.fiyatHesapla(getIsletmeId(req), req.query.paket, req.query.sure);
      if (!f) return res.status(404).json({ hata: 'İşletme bulunamadı' });
      const { kupon: k, indirimli } = await kupon.dogrula({ kod: req.query.kod, isletmeId: f.merkezId, paket: f.paket, tutar: f.fiyat });
      res.json({ kod: k.kod, once: f.fiyat, sonra: indirimli, aciklama: k.aciklama });
    } catch (e) { hataYaz(res, e, 'Kupon kontrol edilemedi'); }
  }

  // ── KVKK veri dışa aktarma ──
  async disaAktarAdmin(req, res) {
    try {
      await denetim(req, 'veri_disa_aktarim', `işletme #${req.params.id}`, 'isletmeler', Number(req.params.id));
      await veriAktar.gonder(res, req.params.id);
    } catch (e) { hataYaz(res, e, 'Dışa aktarılamadı'); }
  }

  async disaAktarEsnaf(req, res) {
    try {
      const id = getIsletmeId(req);
      if (!id) return res.status(400).json({ hata: 'İşletme yok' });
      await denetim(req, 'veri_disa_aktarim', `işletme #${id} (esnaf)`, 'isletmeler', id);
      await veriAktar.gonder(res, id);
    } catch (e) { hataYaz(res, e, 'Dışa aktarılamadı'); }
  }
}

module.exports = new PlatformController();
