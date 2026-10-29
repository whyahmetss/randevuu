// Randevu sayfası tasarımları (kullanıcı kararı 2026-10-29): süper admin video/görsel arka planlı tasarım ekler,
// fiyatını girer (tek seferlik; 0 = ücretsiz), işletmeye hediye eder. İşletme sahip olduğu (ya da ücretsiz) tasarımı seçer.
// Stil serbest CSS değil, sınırlı seçenek: her tasarım randevu akışının tüm parçalarında okunur kalsın.
const pool = require('../config/db');
const { getIsletmeId } = require('../middleware/auth');

const hata = (res, m, k = 400) => res.status(k).json({ hata: m });
const RENK = /^#[0-9a-f]{6}$/i;
const SECENEK = { mod: ['koyu', 'acik'], yazi: ['sans', 'serif', 'mono'], buton: ['yuvarlak', 'kare', 'yirtik'], kart: ['cam', 'duz'] };
const VARSAYILAN = { mod: 'koyu', vurgu: '#2fd27a', karartma: 0.45, yazi: 'sans', buton: 'yuvarlak', kart: 'cam' };

function stilTemizle(s) {
  const g = s && typeof s === 'object' ? s : {};
  const out = { ...VARSAYILAN };
  for (const [k, izin] of Object.entries(SECENEK)) if (izin.includes(g[k])) out[k] = g[k];
  if (RENK.test(String(g.vurgu || ''))) out.vurgu = String(g.vurgu).toLowerCase();
  const k = Number(g.karartma);
  if (Number.isFinite(k)) out.karartma = Math.min(0.85, Math.max(0, Math.round(k * 100) / 100));
  return out;
}

// Medya: arka = video (mp4/webm, ≤ 6 MB) ya da görsel (jpg/png/webp/gif, ≤ 3 MB); poster = görsel (≤ 1 MB)
const VIDEO = /^data:(video\/(?:mp4|webm));base64,(.+)$/;
const RESIM = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/;
const SINIR = { video: 6 * 1024 * 1024, arka: 3 * 1024 * 1024, poster: 1024 * 1024 };
function medyaCoz(tur, veri) {
  const s = String(veri || '');
  const v = tur === 'arka' ? s.match(VIDEO) : null;
  const r = v ? null : s.match(RESIM);
  const m = v || r;
  if (!m) return { hata: tur === 'arka' ? 'MP4/WEBM video ya da JPG/PNG/WEBP/GIF görsel olmalı' : 'Poster JPG, PNG ya da WEBP olmalı' };
  const buf = Buffer.from(m[2], 'base64');
  const sinir = v ? SINIR.video : SINIR[tur];
  if (buf.length > sinir) return { hata: `Dosya çok büyük (en fazla ${Math.round(sinir / 1048576)} MB)` };
  return { mime: m[1], buf };
}

// Sunulan medya bellekte tutulur (az sayıda tasarım; her ziyarette veritabanına gidilmesin). Toplam ~80 MB sınır.
const onbellek = new Map(); let onbellekBoyut = 0;
const ONBELLEK_MAX = 80 * 1024 * 1024;
function onbellegeKoy(anahtar, deger) {
  if (deger.buf.length > ONBELLEK_MAX / 4) return;
  while (onbellekBoyut + deger.buf.length > ONBELLEK_MAX && onbellek.size) {
    const [ilk, d] = onbellek.entries().next().value; onbellek.delete(ilk); onbellekBoyut -= d.buf.length;
  }
  onbellek.set(anahtar, deger); onbellekBoyut += deger.buf.length;
}
const onbellekTemizle = (id) => { for (const [k, d] of onbellek) if (k.startsWith(`${id}:`)) { onbellek.delete(k); onbellekBoyut -= d.buf.length; } };

// Liste satırı: medya verisi olmadan; medya sürümü (v) adres önbelleğini kırar
const LISTE_SQL = `SELECT t.*,
    (SELECT json_object_agg(m.tur, json_build_object('mime', m.mime, 'v', EXTRACT(EPOCH FROM m.guncelleme)::bigint, 'boyut', octet_length(m.veri)))
       FROM sayfa_tasarim_medya m WHERE m.tasarim_id = t.id) AS medya
  FROM sayfa_tasarimlari t`;
const disari = (t) => ({
  id: t.id, isim: t.isim, aciklama: t.aciklama || '', fiyat: Number(t.fiyat) || 0, aktif: t.aktif, sira: t.sira,
  stil: stilTemizle(t.stil), medya: t.medya || {},
});

// Randevu sayfasına giden tasarım bilgisi (bookingController): işletme sahipse ya da tasarım ücretsizse
async function sayfaTasarimi(isletmeId) {
  const t = (await pool.query(`${LISTE_SQL}
     JOIN isletmeler i ON i.sayfa_tasarim_id = t.id
    WHERE i.id = $1 AND t.aktif = true
      AND (t.fiyat <= 0 OR EXISTS (SELECT 1 FROM isletme_tasarimlari s WHERE s.isletme_id = i.id AND s.tasarim_id = t.id))`, [isletmeId])).rows[0];
  if (!t) return null;
  const d = disari(t);
  return { id: d.id, stil: d.stil, medya: d.medya };
}

// ── Satın alma (Faz 3) ──
// Shopier'de tek seferlik dijital ürün açılır; başlıkta SRGO-T<satış no> (paket ödemesinin SRGO-<işletme> eşleşmesine düşmez).
const API_ADRES = (process.env.BASE_URL || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');
async function satinAlBaslat(isletmeId, tasarimId) {
  const t = (await pool.query(`${LISTE_SQL} WHERE t.id = $1 AND t.aktif = true`, [tasarimId])).rows[0];
  if (!t) return { hata: 'Tasarım bulunamadı', kod: 404 };
  const fiyat = Number(t.fiyat) || 0;
  if (fiyat <= 0) return { hata: 'Bu tasarım ücretsiz, doğrudan kullanabilirsiniz' };
  if ((await pool.query('SELECT 1 FROM isletme_tasarimlari WHERE isletme_id = $1 AND tasarim_id = $2', [isletmeId, tasarimId])).rows.length)
    return { hata: 'Bu tasarım zaten sizde' };
  const isletme = (await pool.query('SELECT isim FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  const shopier = require('../services/shopierService');
  // Aynı işletmenin yarım kalmış satın almaları: Shopier'de ürün birikmesin
  const eski = (await pool.query(`DELETE FROM tasarim_satislari WHERE isletme_id = $1 AND durum = 'bekliyor' RETURNING shopier_urun_id`, [isletmeId])).rows;
  for (const e of eski) if (e.shopier_urun_id) shopier.urunSil(e.shopier_urun_id).catch(() => {});
  const satis = (await pool.query(`INSERT INTO tasarim_satislari (isletme_id, tasarim_id, tasarim_isim, tutar) VALUES ($1, $2, $3, $4) RETURNING id`,
    [isletmeId, tasarimId, t.isim, fiyat])).rows[0];
  const m = t.medya || {};
  const gorselTur = m.poster ? 'poster' : m.arka && !String(m.arka.mime).startsWith('video/') ? 'arka' : null;
  try {
    const urun = await shopier.urunOlustur({
      baslik: `SıraGO Sayfa Tasarımı: ${t.isim} [SRGO-T${satis.id}]`,
      aciklama: `Randevu sayfası tasarımı (tek seferlik, süresiz kullanım)\nTasarım: ${t.isim}\nİşletme: ${isletme?.isim || isletmeId}\nRef: SRGO-T${satis.id}`,
      fiyat,
      gorselUrl: gorselTur ? `${API_ADRES}/api/tasarim-medya/${t.id}/${gorselTur}?v=${m[gorselTur].v}` : null,
    });
    await pool.query('UPDATE tasarim_satislari SET shopier_urun_id = $1 WHERE id = $2', [String(urun.id), satis.id]);
    return { url: urun.url, satis_id: satis.id };
  } catch (e) {
    await pool.query('DELETE FROM tasarim_satislari WHERE id = $1', [satis.id]).catch(() => {});
    console.error('Tasarım ödemesi başlatılamadı:', e.response?.data || e.message);
    return { hata: 'Ödeme sayfası açılamadı, lütfen tekrar deneyin', kod: 502 };
  }
}

// Shopier siparişi bir tasarım satışıysa işler (shopierService._siparisIsle paket eşleşmesinden ÖNCE çağırır).
// → null (tasarım satışı değil) | { islem, ... }
async function siparisEslestir({ urunId, urunBaslik, siparisId, tutar }) {
  const ref = String(urunBaslik || '').match(/SRGO-T(\d+)/);
  let s = null;
  try {
    if (urunId) s = (await pool.query('SELECT * FROM tasarim_satislari WHERE shopier_urun_id = $1', [String(urunId)])).rows[0];
    if (!s && ref) s = (await pool.query('SELECT * FROM tasarim_satislari WHERE id = $1', [parseInt(ref[1])])).rows[0];
  } catch (e) {
    // Deploy anında migration bitmeden gelen bildirim: tablo yoksa tasarım satışı olamaz, paket akışı bozulmasın
    if (e.code === '42P01' && !ref) return null;
    throw e;
  }
  if (!s && !ref) return null;
  if (!s) {   // başlık tasarım satışı ama kayıt yok: paket ödemesi sayılmasın, ekip baksın
    try { await require('../utils/alarm').alarm('Tasarım ödemesi eşleşmedi', `Sipariş #${siparisId} · ${urunBaslik} · ${tutar}₺`); } catch (e) { /* alarm opsiyonel */ }
    return { islem: 'tasarim_eslesmedi' };
  }
  if (s.durum === 'odendi') return { islem: 'zaten_islenmis' };
  await pool.query(`UPDATE tasarim_satislari SET durum = 'odendi', shopier_siparis_id = $1, odeme_tarihi = NOW(), tutar = $2 WHERE id = $3`,
    [String(siparisId), tutar || s.tutar, s.id]);
  if (s.tasarim_id) {
    await pool.query(`INSERT INTO isletme_tasarimlari (isletme_id, tasarim_id, kaynak) VALUES ($1, $2, 'satin')
      ON CONFLICT (isletme_id, tasarim_id) DO UPDATE SET kaynak = 'satin', tarih = NOW()`, [s.isletme_id, s.tasarim_id]);
    // Aldığı tasarım sayfasında hemen açılır
    await pool.query('UPDATE isletmeler SET sayfa_tasarim_id = $1, sayfa_guncelleme = NOW() WHERE id = $2', [s.tasarim_id, s.isletme_id]);
  }
  if (s.shopier_urun_id) require('../services/shopierService').urunSil(s.shopier_urun_id).catch(() => {});
  try {
    await require('./adminController').bildirimOlustur(s.isletme_id, 'tasarim', '🎨 Tasarımınız hazır',
      `"${s.tasarim_isim}" tasarımı randevu sayfanızda açıldı. Teşekkürler!`);
  } catch (e) { /* bildirim opsiyonel */ }
  try { require('../services/socketServer').emitToIsletme(s.isletme_id, 'veri:degisti', { tur: 'ayar' }); } catch (e) { /* opsiyonel */ }
  try {
    const i = (await pool.query('SELECT isim FROM isletmeler WHERE id = $1', [s.isletme_id])).rows[0];
    await require('../utils/alarm').alarm(`🎨 Tasarım satıldı: ${i?.isim || s.isletme_id}`, `${s.tasarim_isim} · ${tutar || s.tutar}₺ (Shopier #${siparisId})`);
  } catch (e) { /* alarm opsiyonel */ }
  if (tutar && Number(tutar) + 0.01 < Number(s.tutar)) console.warn(`⚠️ Tasarım satışı #${s.id}: ödenen ${tutar}₺ < fiyat ${s.tutar}₺`);
  return { islem: 'tasarim_satildi', satis_id: s.id, isletme_id: s.isletme_id, tasarim_id: s.tasarim_id };
}

class TasarimController {
  // ── Süper admin ──
  async liste(req, res) {
    try {
      const rows = (await pool.query(`${LISTE_SQL} ORDER BY t.sira, t.id`)).rows;
      const sahip = (await pool.query(`SELECT s.tasarim_id, i.id, i.isim, s.kaynak, (i.sayfa_tasarim_id = s.tasarim_id) AS kullaniyor
          FROM isletme_tasarimlari s JOIN isletmeler i ON i.id = s.isletme_id ORDER BY s.tarih DESC`)).rows;
      const satis = (await pool.query(`SELECT tasarim_id, COUNT(*)::int AS adet, COALESCE(SUM(tutar), 0)::float AS ciro
          FROM tasarim_satislari WHERE durum = 'odendi' GROUP BY tasarim_id`)).rows;
      const toplam = satis.reduce((a, s) => ({ adet: a.adet + s.adet, ciro: a.ciro + s.ciro }), { adet: 0, ciro: 0 });
      res.json({ tasarimlar: rows.map(t => ({ ...disari(t), sahipler: sahip.filter(s => s.tasarim_id === t.id).map(({ tasarim_id, ...s }) => s),
        satis: satis.find(s => s.tasarim_id === t.id) || { adet: 0, ciro: 0 } })), satis_toplam: toplam, secenekler: SECENEK });
    } catch (e) { console.error('tasarim liste:', e.message); hata(res, 'Alınamadı', 500); }
  }

  async kaydet(req, res) {
    try {
      const b = req.body || {};
      const isim = String(b.isim || '').trim().slice(0, 60);
      if (!isim) return hata(res, 'Tasarım adı zorunlu');
      const fiyat = Math.max(0, Number(b.fiyat) || 0);
      const deg = [isim, String(b.aciklama || '').trim().slice(0, 200) || null, fiyat, b.aktif !== false, parseInt(b.sira) || 0, JSON.stringify(stilTemizle(b.stil))];
      const t = req.params.id
        ? (await pool.query(`UPDATE sayfa_tasarimlari SET isim=$1, aciklama=$2, fiyat=$3, aktif=$4, sira=$5, stil=$6, guncelleme=NOW() WHERE id=$7 RETURNING id`,
            [...deg, parseInt(req.params.id)])).rows[0]
        : (await pool.query(`INSERT INTO sayfa_tasarimlari (isim, aciklama, fiyat, aktif, sira, stil) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, deg)).rows[0];
      if (!t) return hata(res, 'Tasarım bulunamadı', 404);
      res.json({ ok: true, id: t.id });
    } catch (e) { console.error('tasarim kaydet:', e.message); hata(res, 'Kaydedilemedi', 500); }
  }

  async sil(req, res) {
    try {
      const id = parseInt(req.params.id);
      // Kullanan işletmelerin sayfası düz görünüme döner (FK: ON DELETE SET NULL)
      const r = await pool.query('DELETE FROM sayfa_tasarimlari WHERE id = $1 RETURNING id', [id]);
      onbellekTemizle(id);
      if (!r.rows.length) return hata(res, 'Tasarım bulunamadı', 404);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Silinemedi', 500); }
  }

  async medyaYukle(req, res) {
    try {
      const id = parseInt(req.params.id), tur = req.params.tur;
      if (!['arka', 'poster'].includes(tur)) return hata(res, 'Geçersiz medya türü');
      if (req.body?.veri === null) {
        await pool.query('DELETE FROM sayfa_tasarim_medya WHERE tasarim_id = $1 AND tur = $2', [id, tur]);
        onbellekTemizle(id);
        return res.json({ ok: true });
      }
      const m = medyaCoz(tur, req.body?.veri);
      if (m.hata) return hata(res, m.hata);
      const r = await pool.query(`INSERT INTO sayfa_tasarim_medya (tasarim_id, tur, mime, veri) SELECT $1, $2, $3, $4 WHERE EXISTS (SELECT 1 FROM sayfa_tasarimlari WHERE id = $1)
          ON CONFLICT (tasarim_id, tur) DO UPDATE SET mime = EXCLUDED.mime, veri = EXCLUDED.veri, guncelleme = NOW() RETURNING tasarim_id`, [id, tur, m.mime, m.buf]);
      if (!r.rows.length) return hata(res, 'Tasarım bulunamadı', 404);
      onbellekTemizle(id);
      res.json({ ok: true });
    } catch (e) { console.error('tasarim medya:', e.message); hata(res, 'Yüklenemedi', 500); }
  }

  // Hediye: işletme tasarıma sahip olur; uygula=true ise sayfasında hemen açılır
  async hediye(req, res) {
    try {
      const id = parseInt(req.params.id), isletmeId = parseInt(req.body?.isletme_id);
      if (!isletmeId) return hata(res, 'İşletme seçin');
      const t = (await pool.query('SELECT id, isim FROM sayfa_tasarimlari WHERE id = $1', [id])).rows[0];
      const i = (await pool.query('SELECT id, isim FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
      if (!t || !i) return hata(res, 'Tasarım ya da işletme bulunamadı', 404);
      await pool.query(`INSERT INTO isletme_tasarimlari (isletme_id, tasarim_id, kaynak) VALUES ($1, $2, 'hediye') ON CONFLICT DO NOTHING`, [isletmeId, id]);
      if (req.body?.uygula) await pool.query('UPDATE isletmeler SET sayfa_tasarim_id = $1, sayfa_guncelleme = NOW() WHERE id = $2', [id, isletmeId]);
      try { require('../services/socketServer').emitToIsletme(isletmeId, 'veri:degisti', { tur: 'ayar' }); } catch (e) { /* canlı yayın opsiyonel */ }
      res.json({ ok: true, mesaj: `${t.isim} tasarımı ${i.isim} işletmesine hediye edildi${req.body?.uygula ? ' ve sayfasında açıldı' : ''}` });
    } catch (e) { console.error('tasarim hediye:', e.message); hata(res, 'Hediye edilemedi', 500); }
  }

  async hediyeGeriAl(req, res) {
    try {
      const id = parseInt(req.params.id), isletmeId = parseInt(req.params.isletmeId);
      await pool.query('DELETE FROM isletme_tasarimlari WHERE isletme_id = $1 AND tasarim_id = $2', [isletmeId, id]);
      await pool.query('UPDATE isletmeler SET sayfa_tasarim_id = NULL WHERE id = $1 AND sayfa_tasarim_id = $2', [isletmeId, id]);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Geri alınamadı', 500); }
  }

  // ── Esnaf ──
  async esnafListe(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const secili = (await pool.query('SELECT sayfa_tasarim_id FROM isletmeler WHERE id = $1', [isletmeId])).rows[0]?.sayfa_tasarim_id || null;
      const sahip = new Set((await pool.query('SELECT tasarim_id FROM isletme_tasarimlari WHERE isletme_id = $1', [isletmeId])).rows.map(r => r.tasarim_id));
      // Pasif tasarım listede yok; sahip olunan pasif tasarım da gösterilmez (sayfada da açılmaz)
      const rows = (await pool.query(`${LISTE_SQL} WHERE t.aktif = true ORDER BY t.sira, t.id`)).rows;
      res.json({ secili, tasarimlar: rows.map(t => ({ ...disari(t), sahip: sahip.has(t.id) || Number(t.fiyat) <= 0 })) });
    } catch (e) { hata(res, 'Alınamadı', 500); }
  }

  async satinAl(req, res) {
    try {
      const r = await satinAlBaslat(getIsletmeId(req), parseInt(req.params.id));
      if (r.hata) return hata(res, r.hata, r.kod || 400);
      res.json(r);
    } catch (e) { console.error('tasarım satın al:', e.message); hata(res, 'Ödeme başlatılamadı', 500); }
  }

  async esnafSec(req, res) {
    try {
      const isletmeId = getIsletmeId(req);
      const id = req.body?.tasarim_id == null ? null : parseInt(req.body.tasarim_id);
      if (id !== null) {
        const t = (await pool.query(`SELECT t.id FROM sayfa_tasarimlari t WHERE t.id = $1 AND t.aktif = true
            AND (t.fiyat <= 0 OR EXISTS (SELECT 1 FROM isletme_tasarimlari s WHERE s.isletme_id = $2 AND s.tasarim_id = t.id))`, [id, isletmeId])).rows[0];
        if (!t) return hata(res, 'Bu tasarım sizde yok', 403);
      }
      await pool.query('UPDATE isletmeler SET sayfa_tasarim_id = $1, sayfa_guncelleme = NOW() WHERE id = $2', [id, isletmeId]);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Kaydedilemedi', 500); }
  }

  // ── Herkese açık medya (randevu sayfası) — sürümlü adres, bir yıl önbellek, Safari için byte-range ──
  async medya(req, res) {
    try {
      const id = parseInt(req.params.id), tur = req.params.tur;
      const anahtar = `${id}:${tur}`;
      let m = onbellek.get(anahtar);
      if (!m) {
        const r = (await pool.query('SELECT mime, veri FROM sayfa_tasarim_medya WHERE tasarim_id = $1 AND tur = $2', [id, tur])).rows[0];
        if (!r) return res.status(404).end();
        m = { mime: r.mime, buf: Buffer.isBuffer(r.veri) ? r.veri : Buffer.from(r.veri) };
        onbellegeKoy(anahtar, m);
      }
      res.set('Content-Type', m.mime).set('Cache-Control', 'public, max-age=31536000, immutable')
        .set('Cross-Origin-Resource-Policy', 'cross-origin').set('Accept-Ranges', 'bytes');
      const aralik = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (aralik) {
        const boy = m.buf.length;
        let bas = aralik[1] === '' ? boy - Number(aralik[2]) : Number(aralik[1]);
        let son = aralik[1] === '' || aralik[2] === '' ? boy - 1 : Number(aralik[2]);
        if (!(bas >= 0) || bas >= boy || son < bas) return res.status(416).set('Content-Range', `bytes */${boy}`).end();
        son = Math.min(son, boy - 1);
        return res.status(206).set('Content-Range', `bytes ${bas}-${son}/${boy}`).send(m.buf.subarray(bas, son + 1));
      }
      res.send(m.buf);
    } catch (e) { res.status(500).end(); }
  }
}

module.exports = new TasarimController();
module.exports.sayfaTasarimi = sayfaTasarimi;
module.exports.stilTemizle = stilTemizle;
module.exports.siparisEslestir = siparisEslestir;
module.exports.satinAlBaslat = satinAlBaslat;
