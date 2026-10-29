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

class TasarimController {
  // ── Süper admin ──
  async liste(req, res) {
    try {
      const rows = (await pool.query(`${LISTE_SQL} ORDER BY t.sira, t.id`)).rows;
      const sahip = (await pool.query(`SELECT s.tasarim_id, i.id, i.isim, s.kaynak, (i.sayfa_tasarim_id = s.tasarim_id) AS kullaniyor
          FROM isletme_tasarimlari s JOIN isletmeler i ON i.id = s.isletme_id ORDER BY s.tarih DESC`)).rows;
      res.json({ tasarimlar: rows.map(t => ({ ...disari(t), sahipler: sahip.filter(s => s.tasarim_id === t.id).map(({ tasarim_id, ...s }) => s) })),
        secenekler: SECENEK });
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
