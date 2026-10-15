// Satış Masası (kullanıcı kararı 2026-10-10): 1 Aralık'a kadar 200 işletme hedefi için ekibin günlük
// çalışma ekranı. Her üye kendi arama listesini çeker (aynı dükkanı iki kişi aramaz), her aramanın
// sonucunu tek tıkla kaydeder; hedef, liderlik tablosu ve itiraz bankası buradan. Patron herkesi izler.
const pool = require('../config/db');
const { patronMu } = require('../config/ekip');
const { denemeGun } = require('../config/deneme');
const { telefonNormalize } = require('../utils/telefon');

// QR kart linki: randevu sayfasıyla aynı sunucu (/k/S12 → o an bağlı Satış Bot numarasına WhatsApp)
const KART_TABAN = (process.env.KART_LINK_TABAN || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');
const kartMetni = (kod) => `Merhaba, SıraGO'yu denemek istiyorum (kart: ${kod})`;

// Satış ekibinin "işletme olarak giriş" yetkisi yok: yalnız kendi açtığı hesabın paneline buradan girer (2 saat)
function panelAnahtari(kullanici, ekipUyesi) {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, impersonated: true, impersonator: ekipUyesi.email },
    require('../middleware/auth').jwtSecret, { expiresIn: '2h' });
}

const TIPLER = {
  arama_yok: { ad: 'Ulaşılamadı', durum: 'cevapsiz' },
  gorustu: { ad: 'Görüştü', durum: 'arandi' },
  ilgilenmiyor: { ad: 'İlgilenmiyor', durum: 'ilgilenmiyor' },
  ilgileniyor: { ad: 'İlgileniyor', durum: 'ilgileniyor' },
  demo: { ad: 'Demo gönderildi', durum: 'ilgileniyor' },
  kurulum: { ad: 'Kuruldu / bağlandı', durum: 'musteri_oldu' },
  // Saha (2026-10-15): dükkâna gidildi; QR kart bırakıldıysa esnaf karttan Satış Bot'a yazınca kayıt bu üyeye yazılır
  ziyaret: { ad: 'Ziyaret edildi', durum: 'arandi' },
  kart: { ad: 'QR kart bırakıldı', durum: 'ilgileniyor' },
  not: { ad: 'Not', durum: null },
};
// "Arama" telefon denemesidir; ziyaret ayrı sayılır ama görüşmeye girer (yüz yüze konuşuldu)
const ARAMA_SAYILAN = ['arama_yok', 'gorustu', 'ilgilenmiyor', 'ilgileniyor', 'demo', 'kurulum'];
// Kişisel numaradan soğuk WhatsApp sınırı (2026-10-14: önceki numara ban yedi). 'wa_mesaj' sonuç değil, sayaçtır.
const WA_GUNLUK = 20;
const waBugun = async (kid) => (await pool.query(
  `SELECT COUNT(*)::int AS n FROM satis_aktivite WHERE kullanici_id = $1 AND tip = 'wa_mesaj' AND olusturma_tarihi >= ${gunBasi}`, [kid])).rows[0].n;
const GORUSME_SAYILAN = ['gorustu', 'ilgilenmiyor', 'ilgileniyor', 'demo', 'kurulum', 'ziyaret'];

const hata = (res, mesaj, kod = 400) => res.status(kod).json({ hata: mesaj });
const gunBasi = "date_trunc('day', NOW() AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul'";

async function hedefAyar() {
  const r = (await pool.query("SELECT deger FROM ekip_ayar WHERE anahtar = 'hedef'")).rows[0];
  return r?.deger || { isletme: 200, tarih: '2026-12-01', baslangic: '2026-10-10' };
}

// Takım hedefi: bağlanan = başlangıçtan beri kurulan gerçek işletme (demo değil, şube değil)
async function hedefDurum() {
  const h = await hedefAyar();
  const baglanan = (await pool.query(`
    SELECT COUNT(*)::int AS n FROM isletmeler i
    WHERE i.demo IS NOT TRUE AND i.olusturma_tarihi >= $1::date - INTERVAL '3 hours'   -- İstanbul günü UTC'de 3 saat önce başlar
      AND (i.grup_id IS NULL OR i.id = (SELECT MIN(m.id) FROM isletmeler m WHERE m.grup_id = i.grup_id))`, [h.baslangic])).rows[0].n;
  const bugun = new Date(new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }));
  const kalanGun = Math.max(1, Math.ceil((new Date(h.tarih) - bugun) / 86400000));
  const kalan = Math.max(0, h.isletme - baglanan);
  const uye = (await pool.query("SELECT COUNT(*)::int AS n FROM admin_kullanicilar WHERE rol = 'superadmin' AND aktif = true")).rows[0].n || 1;
  const takimGunluk = Math.ceil(kalan / kalanGun);
  return { ...h, baglanan, kalan, kalan_gun: kalanGun, takim_gunluk: takimGunluk, kisi_gunluk: Math.max(1, Math.ceil(takimGunluk / uye)), uye };
}

// Kişi bazında sayılar (aralık: 'bugun' | 'hafta' | 'ay')
async function sayilar(aralik = 'bugun', kullaniciId = null) {
  const bas = aralik === 'bugun' ? gunBasi : aralik === 'hafta' ? `${gunBasi} - INTERVAL '6 days'` : `${gunBasi} - INTERVAL '29 days'`;
  const r = await pool.query(`
    SELECT u.id, u.isim, u.gunluk_hedef,
      COUNT(a.id) FILTER (WHERE a.tip = ANY($1))::int AS arama,
      COUNT(a.id) FILTER (WHERE a.tip = ANY($2))::int AS gorusme,
      COUNT(a.id) FILTER (WHERE a.tip = 'demo')::int AS demo,
      COUNT(a.id) FILTER (WHERE a.tip = 'kurulum')::int AS kurulum,
      COUNT(a.id) FILTER (WHERE a.tip = 'ziyaret')::int AS ziyaret,
      COUNT(a.id) FILTER (WHERE a.tip = 'kart')::int AS kart,
      MAX(a.olusturma_tarihi) AS son_aktivite
    FROM admin_kullanicilar u
    LEFT JOIN satis_aktivite a ON a.kullanici_id = u.id AND a.olusturma_tarihi >= ${bas}
    WHERE u.rol = 'superadmin' AND u.aktif = true ${kullaniciId ? 'AND u.id = $3' : ''}
    GROUP BY u.id ORDER BY kurulum DESC, gorusme DESC, arama DESC`,
    kullaniciId ? [ARAMA_SAYILAN, GORUSME_SAYILAN, kullaniciId] : [ARAMA_SAYILAN, GORUSME_SAYILAN]);
  return r.rows;
}

class MasaController {
  // Üst şerit: takım hedefi, benim bugünüm, liderlik tablosu
  async ozet(req, res) {
    try {
      const hedef = await hedefDurum();
      const [bugun, hafta] = await Promise.all([sayilar('bugun'), sayilar('hafta')]);
      const ben = bugun.find(x => x.id === req.kullanici.id) || { arama: 0, gorusme: 0, demo: 0, kurulum: 0, ziyaret: 0, kart: 0 };
      const benimHedef = ben.gunluk_hedef || hedef.kisi_gunluk;
      const bekleyen = (await pool.query(`
        SELECT COUNT(*) FILTER (WHERE sonraki_arama IS NULL OR sonraki_arama <= NOW())::int AS bugun,
               COUNT(*)::int AS toplam
        FROM potansiyel_musteriler WHERE atanan_id = $1 AND durum NOT IN ('ilgilenmiyor', 'musteri_oldu')`, [req.kullanici.id])).rows[0];
      res.json({
        hedef,
        ben: { ...ben, hedef: benimHedef, listede: bekleyen.toplam, bugun_aranacak: bekleyen.bugun, wa_bugun: await waBugun(req.kullanici.id), wa_sinir: WA_GUNLUK },
        liderlik: { bugun: bugun.map(({ gunluk_hedef, son_aktivite, ...x }) => x), hafta: hafta.map(({ gunluk_hedef, son_aktivite, ...x }) => x) },
        patron: patronMu(req.kullanici),
      });
    } catch (e) { console.error('masa ozet:', e.message); hata(res, 'Özet alınamadı', 500); }
  }

  // Benim listem: bugün aranacaklar (geri aranacaklar önce) + yaklaşan geri aramalar
  async listem(req, res) {
    try {
      const r = await pool.query(`
        SELECT p.id, p.isletme_adi, p.telefon, p.kategori, p.ilce, p.sehir, p.puan, p.yorum_sayisi, p.web_sitesi,
               p.google_maps_url, p.skor, p.durum, p.notlar, p.sonraki_arama, p.son_temas, p.demo_isletme_id,
               (SELECT a.tip FROM satis_aktivite a WHERE a.lead_id = p.id AND a.tip <> 'wa_mesaj' ORDER BY a.id DESC LIMIT 1) AS son_sonuc,
               -- Aynı ilçede SıraGO'yu gerçekten kullanan (randevusu olan) işletmeler: "Moda'da X kullanıyor"
               (SELECT json_agg(y) FROM (
                  SELECT i.isim, i.kategori, (CURRENT_DATE - i.olusturma_tarihi::date) AS gun
                  FROM isletmeler i
                  WHERE p.ilce IS NOT NULL AND i.ilce = p.ilce AND i.aktif = true AND i.demo IS NOT TRUE
                    AND EXISTS (SELECT 1 FROM randevular r WHERE r.isletme_id = i.id)
                  ORDER BY (i.kategori = p.kategori) DESC, i.olusturma_tarihi ASC LIMIT 3) y) AS yakindakiler
        FROM potansiyel_musteriler p
        WHERE p.atanan_id = $1 AND p.durum NOT IN ('ilgilenmiyor', 'musteri_oldu')
        ORDER BY (p.sonraki_arama IS NOT NULL AND p.sonraki_arama <= NOW()) DESC,
                 (p.sonraki_arama IS NULL) DESC, p.sonraki_arama ASC, p.skor DESC
        LIMIT 200`, [req.kullanici.id]);
      const simdi = Date.now();
      const bugun = r.rows.filter(x => !x.sonraki_arama || new Date(x.sonraki_arama).getTime() <= simdi);
      const ileride = r.rows.filter(x => x.sonraki_arama && new Date(x.sonraki_arama).getTime() > simdi);
      res.json({ bugun, ileride });
    } catch (e) { console.error('masa listem:', e.message); hata(res, 'Liste alınamadı', 500); }
  }

  // Havuzdan kendime aday çek (aynı anda iki kişi aynı adayı alamaz: atama tek UPDATE ile)
  async cek(req, res) {
    try {
      const adet = Math.min(Math.max(parseInt(req.body.adet) || 10, 1), 30);
      const { ilce, kategori, sehir } = req.body;
      const kosul = [];
      const params = [req.kullanici.id, adet];
      if (sehir) { params.push(sehir); kosul.push(`sehir = $${params.length}`); }
      if (ilce) { params.push(ilce); kosul.push(`ilce = $${params.length}`); }
      if (kategori) { params.push(kategori); kosul.push(`kategori = $${params.length}`); }
      const r = await pool.query(`
        UPDATE potansiyel_musteriler SET atanan_id = $1, atanma_tarihi = NOW()
        WHERE id IN (
          SELECT id FROM potansiyel_musteriler
          WHERE atanan_id IS NULL AND durum = 'yeni' AND telefon IS NOT NULL AND telefon <> ''
            AND (wp_mesaj_durumu IS NULL OR wp_mesaj_durumu = '')
            ${kosul.length ? 'AND ' + kosul.join(' AND ') : ''}
          ORDER BY skor DESC NULLS LAST, yorum_sayisi DESC NULLS LAST
          LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING id`, params);
      res.json({ cekilen: r.rows.length });
    } catch (e) { console.error('masa cek:', e.message); hata(res, 'Aday çekilemedi', 500); }
  }

  // Arama sonucu: aktivite kaydı + adayın durumu + (istenirse) geri arama zamanı
  async sonuc(req, res) {
    try {
      const leadId = parseInt(req.params.id);
      const { tip, notu, geri_ara } = req.body;
      if (!TIPLER[tip]) return hata(res, 'Geçersiz sonuç');
      const lead = (await pool.query('SELECT id, atanan_id, durum FROM potansiyel_musteriler WHERE id = $1', [leadId])).rows[0];
      if (!lead) return hata(res, 'Aday bulunamadı', 404);
      if (lead.atanan_id && lead.atanan_id !== req.kullanici.id && !patronMu(req.kullanici)) {
        return hata(res, 'Bu aday başka bir ekip arkadaşında', 403);
      }
      const temizNot = notu ? String(notu).slice(0, 1000) : null;
      // Kuruldu: hangi işletme olduğu (demo sahiplenildiyse ya da satış botundan kayıt olduysa) bulunur,
      // işletme bu üyeye yazılır (getiren_id) — prim ve takip buradan
      let isletmeId = null;
      if (tip === 'kurulum') {
        isletmeId = parseInt(req.body.isletme_id) || null;
        if (!isletmeId) {
          const b = (await pool.query(`
            SELECT COALESCE(
              (SELECT i.id FROM isletmeler i JOIN potansiyel_musteriler p ON p.demo_isletme_id = i.id WHERE p.id = $1 AND i.demo IS NOT TRUE),
              (SELECT k.kayit_isletme_id FROM satis_konusmalar k WHERE k.lead_id = $1 AND k.kayit_isletme_id IS NOT NULL ORDER BY k.id DESC LIMIT 1)
            ) AS id`, [leadId]).catch(() => ({ rows: [] }))).rows[0];
          isletmeId = b?.id || null;
        }
        if (isletmeId) await pool.query('UPDATE isletmeler SET getiren_id = COALESCE(getiren_id, $1) WHERE id = $2', [req.kullanici.id, isletmeId]);
      }
      await pool.query(
        'INSERT INTO satis_aktivite (kullanici_id, lead_id, tip, notu, isletme_id) VALUES ($1, $2, $3, $4, $5)',
        [req.kullanici.id, leadId, tip, temizNot, isletmeId]);
      const durum = TIPLER[tip].durum;
      let sonraki = null;
      if (geri_ara) { const t = new Date(geri_ara); if (!isNaN(t)) sonraki = t; }
      else if (tip === 'arama_yok') sonraki = new Date(Date.now() + 20 * 3600 * 1000);   // ulaşılamadı → yarın tekrar
      else if (tip === 'kart') sonraki = new Date(Date.now() + 2 * 24 * 3600 * 1000);     // kart bırakıldı → 2 gün sonra yokla
      await pool.query(`
        UPDATE potansiyel_musteriler SET
          atanan_id = COALESCE(atanan_id, $2),
          durum = COALESCE($3, durum),
          son_temas = CASE WHEN $4 THEN NOW() ELSE son_temas END,
          arama_tarihi = CASE WHEN $4 THEN NOW() ELSE arama_tarihi END,
          sonraki_arama = $5,
          notlar = CASE WHEN $6::text IS NOT NULL THEN CONCAT_WS(E'\\n', notlar, $6::text) ELSE notlar END
        WHERE id = $1`, [leadId, req.kullanici.id, durum, tip !== 'not', sonraki, temizNot]);
      res.json({ ok: true });
    } catch (e) { console.error('masa sonuc:', e.message); hata(res, 'Kaydedilemedi', 500); }
  }

  async birak(req, res) {
    try {
      const r = await pool.query(
        'UPDATE potansiyel_musteriler SET atanan_id = NULL, atanma_tarihi = NULL WHERE id = $1 AND (atanan_id = $2 OR $3) RETURNING id',
        [parseInt(req.params.id), req.kullanici.id, patronMu(req.kullanici)]);
      res.json({ ok: r.rows.length > 0 });
    } catch (e) { hata(res, 'Bırakılamadı', 500); }
  }

  // Bugün ne yaptım (patron ?kullanici= ile başkasınınkini de görür)
  async aktiviteler(req, res) {
    try {
      let kid = req.kullanici.id;
      if (req.query.kullanici && patronMu(req.kullanici)) kid = parseInt(req.query.kullanici);
      const gun = Math.min(Math.max(parseInt(req.query.gun) || 1, 1), 90);
      const r = await pool.query(`
        SELECT a.id, a.tip, a.notu, a.otomatik, a.olusturma_tarihi, a.isletme_id, p.isletme_adi, p.telefon, i.isim AS isletme_isim
        FROM satis_aktivite a
        LEFT JOIN potansiyel_musteriler p ON p.id = a.lead_id
        LEFT JOIN isletmeler i ON i.id = a.isletme_id
        WHERE a.kullanici_id = $1 AND a.tip <> 'wa_mesaj' AND a.olusturma_tarihi >= ${gunBasi} - make_interval(days => $2 - 1)
        ORDER BY a.id DESC LIMIT 300`, [kid, gun]);
      res.json({ aktiviteler: r.rows });
    } catch (e) { hata(res, 'Aktiviteler alınamadı', 500); }
  }

  // WhatsApp'a tıklandı: sayaç (sınır üstünde de açılır; uyarı panelde)
  async waMesaj(req, res) {
    try {
      await pool.query("INSERT INTO satis_aktivite (kullanici_id, lead_id, tip) VALUES ($1, $2, 'wa_mesaj')", [req.kullanici.id, parseInt(req.params.id) || null]);
      res.json({ wa_bugun: await waBugun(req.kullanici.id), wa_sinir: WA_GUNLUK });
    } catch (e) { hata(res, 'Kaydedilemedi', 500); }
  }

  // ── Sahada hesap aç (kullanıcı kararı 2026-10-15) ──
  // Dükkânda esnafın yanında: hesap 1 dakikada açılır, işletme bu üyeye yazılır (getiren_id), geçici şifre esnafın
  // WhatsApp'ına gider, üye aynı anda esnafın panelini açıp WhatsApp'ı QR ile bağlar. Venüs demosu varsa o sahiplenilir.
  async hesapAc(req, res) {
    const b = req.body || {};
    const isletmeAdi = String(b.isletme_adi || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    const tel = telefonNormalize(b.telefon);
    const yetkili = String(b.yetkili_adi || '').trim().slice(0, 60);
    if (isletmeAdi.length < 2 || isletmeAdi.length > 100) return hata(res, 'İşletme adını yazın');
    if (!/^905\d{9}$/.test(tel)) return hata(res, 'Cep telefonunu 05xx xxx xx xx şeklinde yazın');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return hata(res, 'Geçerli bir e-posta yazın (telefonundaki Gmail adresi olur)');
    let client = null;
    try {
      let lead = null;
      if (b.lead_id) {
        lead = (await pool.query('SELECT * FROM potansiyel_musteriler WHERE id = $1', [parseInt(b.lead_id)])).rows[0];
        if (!lead) return hata(res, 'Aday bulunamadı', 404);
        if (lead.atanan_id && lead.atanan_id !== req.kullanici.id && !patronMu(req.kullanici)) return hata(res, 'Bu aday başka bir ekip arkadaşında', 403);
      }
      if ((await pool.query('SELECT 1 FROM admin_kullanicilar WHERE LOWER(email) = $1', [email])).rows[0]) {
        return hata(res, 'Bu e-postayla zaten bir hesap var. Şifresini unuttuysa işletme detayından geçici şifre verilir.');
      }
      const { hizmetSablonu, KATEGORI_KOD } = require('../services/demo');
      const kategoriAd = String(b.kategori || lead?.kategori || '').toLocaleLowerCase('tr');
      const kategori = KATEGORI_KOD[kategoriAd] || (Object.values(KATEGORI_KOD).includes(kategoriAd) ? kategoriAd : 'genel');
      const sifre = require('../utils/geciciSifre').geciciSifreUret();
      const hash = await require('bcryptjs').hash(sifre, 10);

      client = await pool.connect();
      await client.query('BEGIN');
      // Bu dükkân için açılmış demo (aday kartındaki ya da aynı telefonlu) gerçek hesaba döner; saha demosu hariç
      let isletme = (await client.query(`
        UPDATE isletmeler SET isim = $1, telefon = $2, kategori = CASE WHEN $3 = 'genel' THEN kategori ELSE $3 END, demo = false,
          olusturma_tarihi = NOW(), deneme_bitis_tarihi = NOW() + make_interval(days => $4), getiren_id = $5, kayit_kanali = 'saha'
        WHERE id = (SELECT id FROM isletmeler WHERE demo = true AND COALESCE(slug, '') <> 'sirago-demo-berber'
                      AND (id = $6 OR telefon = $2) ORDER BY (id = $6) DESC, id DESC LIMIT 1)
        RETURNING *`, [isletmeAdi, tel, kategori, denemeGun(), req.kullanici.id, parseInt(lead?.demo_isletme_id) || 0])).rows[0];
      const demodan = !!isletme;
      if (!isletme) {
        isletme = (await client.query(`
          INSERT INTO isletmeler (isim, telefon, kategori, ilce, adres, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi, getiren_id, kayit_kanali)
          VALUES ($1, $2, $3, $4, $5, true, 'baslangic', NOW(), NOW() + make_interval(days => $6), $7, 'saha') RETURNING *`,
          [isletmeAdi, tel, kategori, lead?.ilce || null, lead?.adres || null, denemeGun(), req.kullanici.id])).rows[0];
        // Örnek hizmetler (fiyat 0 = "fiyat dükkânda"; esnafla birlikte düzenlenir) ve esnafın kendisi çalışan olarak
        for (const [isim, sure] of hizmetSablonu(kategoriAd || kategori)) {
          await client.query('INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES ($1, $2, $3, 0, true)', [isletme.id, isim, sure]);
        }
        await client.query("INSERT INTO calisanlar (isletme_id, isim, uzmanlik, aktif) VALUES ($1, $2, '', true)", [isletme.id, yetkili || 'Usta']);
      } else if (yetkili) {
        await client.query("UPDATE calisanlar SET isim = $1 WHERE isletme_id = $2 AND isim = 'Usta'", [yetkili, isletme.id]);
      }
      const kullanici = (await client.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif, sifre_degistirmeli)
         VALUES ($1, $2, $3, 'admin', $4, true, true) RETURNING id, email, rol, isletme_id`,
        [yetkili || isletmeAdi, email, hash, isletme.id])).rows[0];
      await client.query('COMMIT');
      client.release(); client = null;

      // Satış kaydı: "Bağladım" sayılır; aday listeden düşer
      try {
        await pool.query("INSERT INTO satis_aktivite (kullanici_id, lead_id, isletme_id, tip, notu) VALUES ($1, $2, $3, 'kurulum', $4)",
          [req.kullanici.id, lead?.id || null, isletme.id, demodan ? 'Sahada hesap açıldı (demo sahiplenildi)' : 'Sahada hesap açıldı']);
        if (lead) {
          await pool.query(`UPDATE potansiyel_musteriler SET durum = 'musteri_oldu', atanan_id = COALESCE(atanan_id, $2), son_temas = NOW(),
            sonraki_arama = NULL, demo_isletme_id = COALESCE(demo_isletme_id, $3) WHERE id = $1`, [lead.id, req.kullanici.id, isletme.id]);
        }
      } catch (e) { console.error('saha hesap: satış kaydı yazılamadı:', e.message); }

      const link = await require('../utils/randevuLinki').randevuLinki(isletme).catch(() => null);
      const { esnafaYaz } = require('../utils/esnafaYaz');
      const wa = await esnafaYaz(isletme,
        `🎉 SıraGO hesabınız açıldı: *${isletmeAdi}*\n\nGiriş: https://admin.sırago.com\nE-posta: ${email}\nGeçici şifre: *${sifre}*\n` +
        `(İlk girişte kendi şifrenizi belirleyeceksiniz.)\n\n${denemeGun()} gün ücretsiz, kart bilgisi yok.${link ? `\nRandevu linkiniz: ${link}` : ''}`);
      const ip = require('../utils/istemciIp').istemciIp(req);
      pool.query(`INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, hedef_tablo, hedef_id, ip_adresi)
        VALUES ($1, $2, $3, 'saha_hesap_ac', $4, 'isletmeler', $1, $5)`,
        [isletme.id, req.kullanici.id, req.kullanici.email, `${req.kullanici.email} sahada hesap açtı: ${isletmeAdi} (${email})`, ip]).catch(() => {});
      try {
        require('../services/socketServer').emitToAdmin('isletme:yeni', { isletme, kanal: 'saha' });
        const bot = require('../services/satisBot');
        const md = (x) => bot._mdKacis(x);
        bot._telegramBildirimGonder(`🏪 *Sahada hesap açıldı*\n\n${md(isletmeAdi)} (${md(kategori)})\n📞 +${md(tel)}\n👤 ${md(req.kullanici.email)}`).catch(() => {});
      } catch (e) { /* bildirim önemsiz */ }

      res.json({ isletme_id: isletme.id, isletme_isim: isletmeAdi, email, sifre, link, demodan, wa_gonderildi: wa.gitti,
        token: panelAnahtari(kullanici, req.kullanici) });
    } catch (e) {
      if (client) { await client.query('ROLLBACK').catch(() => {}); client.release(); }
      if (e.code === '23505') return hata(res, 'Bu e-postayla zaten bir hesap var');
      console.error('saha hesap aç:', e.message);
      hata(res, 'Hesap açılamadı', 500);
    }
  }

  // Sahada açtığım hesabın paneline yeniden gir (sekme kapandıysa): yalnız getiren üye, ilk 3 gün; patron her zaman
  async hesapPanel(req, res) {
    try {
      const i = (await pool.query(
        `SELECT id, isim, getiren_id, olusturma_tarihi > NOW() - INTERVAL '3 days' AS yeni FROM isletmeler WHERE id = $1 AND demo IS NOT TRUE`,
        [parseInt(req.params.id)])).rows[0];
      if (!i || !(patronMu(req.kullanici) || (i.getiren_id === req.kullanici.id && i.yeni))) return hata(res, 'Bu işletmenin paneline buradan giremezsin', 403);
      const k = (await pool.query("SELECT id, email, rol, isletme_id FROM admin_kullanicilar WHERE isletme_id = $1 AND aktif = true AND rol <> 'superadmin' ORDER BY id LIMIT 1", [i.id])).rows[0];
      if (!k) return hata(res, 'Bu işletmenin giriş hesabı yok', 404);
      pool.query(`INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, hedef_tablo, hedef_id)
        VALUES ($1, $2, $3, 'impersonate', $4, 'admin_kullanicilar', $5)`,
        [i.id, req.kullanici.id, req.kullanici.email, `${req.kullanici.email} sahada açtığı hesabın paneline girdi (${i.isim})`, k.id]).catch(() => {});
      res.json({ token: panelAnahtari(k, req.kullanici), isletme_isim: i.isim });
    } catch (e) { hata(res, 'Panel açılamadı', 500); }
  }

  // ── QR kart (2026-10-15): üyeye özel kod (S<id>). Esnaf okutunca Satış Bot'a "kart: S12" yazılı mesaj gider;
  // kayıt olursa işletme bu üyeye yazılır. Link numaradan bağımsız: Satış Bot numarası değişse de basılı kart çalışır.
  async qrKart(req, res) {
    try {
      const kod = `S${req.kullanici.id}`;
      const link = `${KART_TABAN}/k/${kod}`;
      const qr = await require('qrcode').toDataURL(link, { margin: 1, width: 640, errorCorrectionLevel: 'M' });
      const isim = (await pool.query('SELECT isim FROM admin_kullanicilar WHERE id = $1', [req.kullanici.id])).rows[0]?.isim || '';
      let numaralar = [];
      try { numaralar = require('../services/satisBot').bagliNumaralar(); } catch (e) { /* bot yüklenemedi */ }
      res.json({ kod, link, qr, isim, bagli: numaralar.length > 0, mesaj: kartMetni(kod) });
    } catch (e) { console.error('qr kart:', e.message); hata(res, 'QR kart hazırlanamadı', 500); }
  }

  // Herkese açık: /k/S12 → o an bağlı Satış Bot numarasına hazır mesajlı WhatsApp (numara yoksa tanıtım sitesi)
  async kartYonlendir(req, res) {
    const kod = String(req.params.kod || '').toUpperCase();
    if (!/^S\d{1,6}$/.test(kod)) return res.status(404).send('Bulunamadı');
    let numara = null;
    try { numara = require('../services/satisBot').bagliNumaralar()[0] || null; } catch (e) { /* yok */ }
    // Bot bağlı değilse web kaydı; kod taşınır, kayıt yine bu üyeye yazılır (authController.botKayit)
    if (!numara) return res.redirect(302, `${(process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '')}/?kayit=1&saha=${kod}`);
    res.redirect(302, `https://wa.me/${numara}?text=${encodeURIComponent(kartMetni(kod))}`);
  }

  // ── Bot sana devretti (2026-10-16, tek kişi düzeni): sıcak adaylar, hazır arama notuyla ──
  async sicakAdaylar(req, res) {
    try { res.json({ adaylar: await require('../services/devir').liste(30) }); }
    catch (e) { console.error('sıcak adaylar:', e.message); hata(res, 'Sıcak adaylar alınamadı', 500); }
  }

  // Arandı: sonuç Satış Masası aktivitesine yazılır; "ulaşamadım" 3 saat sonra yine listeye düşer
  async sicakKapat(req, res) {
    try {
      const SONUC = { gorustu: 'gorustu', ulasilamadi: 'arama_yok', ilgilenmiyor: 'ilgilenmiyor' };
      const sonuc = req.body?.sonuc;
      if (!SONUC[sonuc]) return hata(res, 'Geçersiz sonuç');
      const k = (await pool.query('SELECT id, lead_id FROM satis_konusmalar WHERE id = $1', [parseInt(req.params.id)])).rows[0];
      if (!k) return hata(res, 'Konuşma bulunamadı', 404);
      if (sonuc === 'ulasilamadi') await pool.query("UPDATE satis_konusmalar SET devir_ertele = NOW() + INTERVAL '3 hours' WHERE id = $1", [k.id]);
      else await pool.query('UPDATE satis_konusmalar SET devir_kapandi = NOW() WHERE id = $1', [k.id]);
      if (sonuc === 'ilgilenmiyor') {
        // Bot da bir daha yazmasın
        await pool.query("UPDATE satis_konusmalar SET durum = 'olumsuz' WHERE id = $1", [k.id]);
        if (k.lead_id) await pool.query("UPDATE potansiyel_musteriler SET durum = 'ilgilenmiyor' WHERE id = $1", [k.lead_id]).catch(() => {});
      }
      await pool.query('INSERT INTO satis_aktivite (kullanici_id, lead_id, tip, notu) VALUES ($1, $2, $3, $4)',
        [req.kullanici.id, k.lead_id || null, SONUC[sonuc], String(req.body?.notu || '').slice(0, 500) || 'Bot devretti'])
        .catch(e => console.error('sıcak aday aktivitesi:', e.message));
      res.json({ ok: true });
    } catch (e) { console.error('sıcak kapat:', e.message); hata(res, 'Kaydedilemedi', 500); }
  }

  // Sabah özeti: önizleme ve şimdi gönder (normalde her sabah 08:45'te kendiliğinden gider)
  async sabahOzeti(req, res) {
    try {
      const o = require('../services/sabahOzeti');
      if (req.method === 'POST') return res.json({ metin: await o.gonder(), gonderildi: true });
      res.json({ metin: await o.hazirla() });
    } catch (e) { console.error('sabah özeti:', e.message); hata(res, 'Özet hazırlanamadı', 500); }
  }

  // ── Hedef (okuma herkes, değiştirme patron) ──
  async hedefGuncelle(req, res) {
    try {
      const { isletme, tarih, kisiler } = req.body;
      const h = await hedefAyar();
      if (isletme !== undefined) { const n = parseInt(isletme); if (!(n > 0 && n < 100000)) return hata(res, 'Geçersiz hedef'); h.isletme = n; }
      if (tarih !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) return hata(res, 'Tarih YYYY-AA-GG olmalı'); h.tarih = tarih; }
      await pool.query("INSERT INTO ekip_ayar (anahtar, deger) VALUES ('hedef', $1) ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger", [h]);
      if (kisiler && typeof kisiler === 'object') {
        for (const [id, v] of Object.entries(kisiler)) {
          const n = v === null || v === '' ? null : parseInt(v);
          await pool.query("UPDATE admin_kullanicilar SET gunluk_hedef = $1 WHERE id = $2 AND rol = 'superadmin'", [n > 0 ? n : null, parseInt(id)]);
        }
      }
      res.json({ hedef: await hedefDurum() });
    } catch (e) { hata(res, 'Hedef kaydedilemedi', 500); }
  }

  // ── İtiraz bankası ──
  async itirazlar(req, res) {
    try {
      const r = await pool.query(`SELECT t.id, t.itiraz, t.cevap, t.kullanim, u.isim AS ekleyen FROM satis_itiraz t
        LEFT JOIN admin_kullanicilar u ON u.id = t.ekleyen_id ORDER BY t.kullanim DESC, t.id`);
      res.json({ itirazlar: r.rows });
    } catch (e) { hata(res, 'İtirazlar alınamadı', 500); }
  }

  async itirazEkle(req, res) {
    try {
      const itiraz = String(req.body.itiraz || '').trim(), cevap = String(req.body.cevap || '').trim();
      if (itiraz.length < 3 || cevap.length < 3) return hata(res, 'İtiraz ve cevap yazın');
      const r = await pool.query('INSERT INTO satis_itiraz (itiraz, cevap, ekleyen_id) VALUES ($1, $2, $3) RETURNING *',
        [itiraz.slice(0, 500), cevap.slice(0, 2000), req.kullanici.id]);
      res.json({ itiraz: r.rows[0] });
    } catch (e) { hata(res, 'Eklenemedi', 500); }
  }

  async itirazKullanildi(req, res) {
    try { await pool.query('UPDATE satis_itiraz SET kullanim = kullanim + 1 WHERE id = $1', [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e) { res.json({ ok: false }); }
  }

  async itirazGuncelle(req, res) {
    try {
      const itiraz = String(req.body.itiraz || '').trim(), cevap = String(req.body.cevap || '').trim();
      if (itiraz.length < 3 || cevap.length < 3) return hata(res, 'İtiraz ve cevap yazın');
      await pool.query('UPDATE satis_itiraz SET itiraz = $1, cevap = $2 WHERE id = $3', [itiraz.slice(0, 500), cevap.slice(0, 2000), parseInt(req.params.id)]);
      res.json({ ok: true });
    } catch (e) { hata(res, 'Güncellenemedi', 500); }
  }

  async itirazSil(req, res) {
    try { await pool.query('DELETE FROM satis_itiraz WHERE id = $1', [parseInt(req.params.id)]); res.json({ ok: true }); }
    catch (e) { hata(res, 'Silinemedi', 500); }
  }

  // ── Patron: ekip takibi ──
  async ekipTakip(req, res) {
    try {
      const [bugun, hafta, ay] = await Promise.all([sayilar('bugun'), sayilar('hafta'), sayilar('ay')]);
      const uyeler = (await pool.query(`
        SELECT u.id, u.isim, u.email, u.son_giris, u.patron, u.ekip_gorev, u.gunluk_hedef,
          (SELECT COUNT(*)::int FROM potansiyel_musteriler p WHERE p.atanan_id = u.id AND p.durum NOT IN ('ilgilenmiyor','musteri_oldu')) AS listede,
          (SELECT COUNT(*)::int FROM isletmeler i WHERE i.getiren_id = u.id) AS getirdigi,
          (SELECT COUNT(*)::int FROM isletmeler i WHERE i.getiren_id = u.id AND EXISTS (SELECT 1 FROM odemeler o WHERE o.isletme_id = i.id AND o.durum = 'odendi')) AS odeyen
        FROM admin_kullanicilar u WHERE u.rol = 'superadmin' AND u.aktif = true ORDER BY u.patron DESC NULLS LAST, u.id`)).rows;
      const bul = (l, id) => l.find(x => x.id === id) || {};
      res.json({
        hedef: await hedefDurum(),
        uyeler: uyeler.map(u => ({ ...u, bugun: bul(bugun, u.id), hafta: bul(hafta, u.id), ay: bul(ay, u.id), son_aktivite: bul(ay, u.id).son_aktivite || null })),
      });
    } catch (e) { console.error('ekip takip:', e.message); hata(res, 'Ekip takibi alınamadı', 500); }
  }
}

module.exports = new MasaController();
module.exports._test = { hedefDurum, sayilar, TIPLER };
