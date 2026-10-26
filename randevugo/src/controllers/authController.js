const pool = require('../config/db');
const { denemeGun } = require('../config/deneme');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const socketServer = require('../services/socketServer');
const pushService = require('../services/pushService');
const { jwtSecret } = require('../middleware/auth');

// Giriş cevabı (şifre, Google ve şifre sıfırlama aynı biçimde döner)
function oturumCevabi(kullanici) {
  const token = jwt.sign(
    { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null },
    jwtSecret, { expiresIn: '7d' });
  return { token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null,
    ekip_gorev: kullanici.ekip_gorev || null, ekip_yetkileri: Array.isArray(kullanici.ekip_yetkileri) ? kullanici.ekip_yetkileri : null, patron: kullanici.patron === true,
    sifre_degistirmeli: kullanici.sifre_degistirmeli === true } };
}
const sifreGecerli = (s) => String(s || '').length >= 8 && String(s).length <= 72;
// E-posta büyük/küçük harf duyarsız (Google "Ali@…" ile "ali@…" aynı hesap)
const kullaniciBul = async (email) => (await pool.query(
  'SELECT * FROM admin_kullanicilar WHERE LOWER(email) = LOWER($1) AND aktif = true ORDER BY id LIMIT 1', [String(email || '').trim()])).rows[0];
const GOOGLE_CLIENT_ID = () => (process.env.GOOGLE_CLIENT_ID || '').trim();
const telMaskele = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 4 ? `•••• ••• ${d.slice(-4, -2)} ${d.slice(-2)}` : ''; };

class AuthController {
  async giris(req, res) {
    try {
      const { email, sifre } = req.body;
      const kullanici = await kullaniciBul(email);
      
      if (!kullanici || !(await bcrypt.compare(String(sifre || ''), kullanici.sifre))) {
        return res.status(401).json({ hata: 'Email veya şifre hatalı' });
      }

      // Audit log — giriş kaydı
      try {
        await pool.query(
          `INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, ip_adresi)
           VALUES ($1, $2, $3, 'giris', 'Panel girişi', $4)`,
          [kullanici.isletme_id, kullanici.id, kullanici.email, require('../utils/istemciIp').istemciIp(req)]
        );
      } catch(e) { /* audit log opsiyonel */ }

      if (kullanici.rol === 'superadmin') pool.query('UPDATE admin_kullanicilar SET son_giris = NOW() WHERE id = $1', [kullanici.id]).catch(() => {});
      // Esnaf panele girdi mi (İşletmeler listesinde "son giriş")
      else if (kullanici.isletme_id) pool.query('UPDATE isletmeler SET son_giris = NOW(), son_panel = NOW() WHERE id = $1', [kullanici.isletme_id]).catch(() => {});
      res.json(oturumCevabi(kullanici));
    } catch (error) {
      console.error('❌ Giriş hatası:', error.message, error.stack);
      res.status(500).json({ hata: 'Sunucu hatası oluştu' });
    }
  }

  // Bot üzerinden kayıt (WP/TG bot çağırır)
  async botKayit(req, res) {
    try {
      const { isletmeAdi, sifre, telefon, kayitKanal, referans_kodu, davet } = req.body;
      // Telefon klavyesi e-postanın sonuna boşluk ekleyebiliyor: kod adımı (kayitKod) kırpıyordu, kayıt "geçerli e-posta yazın" diyordu (2026-10-26)
      const email = String(req.body.email || '').trim();
      if (!isletmeAdi || !email || !sifre) {
        return res.status(400).json({ hata: 'İşletme adı, email ve şifre zorunlu' });
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)) || String(email).length > 150) {
        return res.status(400).json({ hata: 'Geçerli bir e-posta yazın' });
      }
      if (String(sifre).length < 8 || String(sifre).length > 72) {
        return res.status(400).json({ hata: 'Şifre en az 8 karakter olmalı' });
      }
      if (String(isletmeAdi).trim().length < 2 || String(isletmeAdi).length > 100) {
        return res.status(400).json({ hata: 'İşletme adını kontrol edin' });
      }

      // Davet kodu yazıldıysa geçerli olmalı (yanlış yazılan kod sessizce kaybolmasın)
      const yazilanDavet = String(davet || referans_kodu || '').trim();
      if (yazilanDavet && !(await require('../utils/davet').kodGecerli(yazilanDavet))) {
        return res.status(400).json({ hata: 'Davet kodu bulunamadı. Kontrol edin ya da boş bırakın.' });
      }

      // Email kontrolü
      const mevcutKullanici = (await pool.query('SELECT id FROM admin_kullanicilar WHERE LOWER(email) = LOWER($1)', [email])).rows[0];
      if (mevcutKullanici) {
        return res.status(400).json({ hata: 'Bu email zaten kayıtlı. Giriş yapmayı dene.' });
      }

      // E-posta doğrulama (2026-10-22): web kaydında e-postaya giden kod doğrulanmadan hesap açılmaz.
      // Google kaydında e-postayı Google doğrular (req._epostaDogru, gövdeden gelemez). Mail servisi ayarlı değilse atlanır.
      const epostaAnahtar = String(email).trim().toLowerCase();
      let epostaDogru = req._epostaDogru === true;
      if (!epostaDogru && require('../utils/eposta').aktif()) {
        const d = (await pool.query('SELECT * FROM eposta_dogrulama WHERE email = $1 AND son_gecerlilik > NOW()', [epostaAnahtar])).rows[0];
        if (!d || d.deneme >= 5) return res.status(400).json({ hata: 'Doğrulama kodunun süresi doldu, yeni kod isteyin.', kod_gerekli: true });
        if (!(await bcrypt.compare(String(req.body.eposta_kod || '').replace(/\D/g, ''), d.kod_hash))) {
          await pool.query('UPDATE eposta_dogrulama SET deneme = deneme + 1 WHERE email = $1', [epostaAnahtar]);
          return res.status(400).json({ hata: 'Doğrulama kodu yanlış', kod_gerekli: true });
        }
        await pool.query('DELETE FROM eposta_dogrulama WHERE email = $1', [epostaAnahtar]);
        epostaDogru = true;
      }

      // İşletme oluştur
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
         VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + make_interval(days => $3)) RETURNING *`,
        [isletmeAdi, telefon || '', denemeGun()]
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(sifre, 10);
      const kullanici = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true) RETURNING *`,
        [isletmeAdi, email, hashSifre, isletme.id]
      )).rows[0];
      if (epostaDogru) {
        try { await pool.query('UPDATE admin_kullanicilar SET eposta_dogrulandi = true WHERE id = $1', [kullanici.id]); } catch (e) { /* kolon yoksa */ }
      }
      // Web kaydında Kullanım Şartları + KVKK onayı alındıysa tarihi saklanır
      if (req.body.sartlar_onay === true) {
        try { await pool.query('UPDATE admin_kullanicilar SET sartlar_onay_tarihi = NOW() WHERE id = $1', [kullanici.id]); } catch (e) { /* kolon yoksa */ }
      }

      // Davet/referans kodu varsa yalnız bağla — ödül davet edilen ilk ödemesini yapınca (suistimal koruması)
      let referansMesaj = '';
      const davetKod = davet || referans_kodu;
      const { davetUygula, KANALLAR } = require('../utils/davet');
      if (davetKod) {
        try {
          const sahip = await davetUygula(davetKod, isletme.id);
          if (sahip) {
            referansMesaj = ` (Davet: ${String(davetKod).toUpperCase()} kaydedildi — ödül ilk ödeme sonrası)`;
            console.log(`🤝 Davet kaydedildi: yeni #${isletme.id}, davet eden #${sahip}`);
          }
        } catch(e) { console.error('Davet uygulama hatası:', e.message); }
      }
      // Kayıt kanalı (Büyüme ekranı): randevu sayfasından mı, davet linkinden mi, düz web mi
      const kanal = KANALLAR.includes(kayitKanal) ? kayitKanal : null;
      if (kanal) {
        try { await pool.query('UPDATE isletmeler SET kayit_kanali = $1 WHERE id = $2', [davetKod && kanal === 'web' ? 'davet' : kanal, isletme.id]); } catch (e) { /* kolon yoksa */ }
      }

      // QR kart (Satış Bot bağlı değilken web kaydına düşen): ?saha=S12 → işletme o ekip üyesine yazılır
      const sahaUye = require('../utils/sahaKodu').linkKodu(req.body.saha_kodu);
      if (sahaUye) {
        try { await require('../utils/sahaKodu').kayittaUygula(sahaUye, isletme.id, { notu: 'QR karttan web ile kayıt oldu' }); }
        catch (e) { console.error('QR kart kaydı bağlanamadı:', e.message); }
      }
      // Bayi kartı: ?saha=B12 → işletme bayiye yazılır
      const sahaBayi = require('../services/bayi').linkKodu(req.body.saha_kodu);
      if (sahaBayi) {
        try { await require('../services/bayi').kayittaUygula(sahaBayi, isletme.id); }
        catch (e) { console.error('Bayi kaydı bağlanamadı:', e.message); }
      }

      console.log(`✅ Bot kayıt: ${isletmeAdi} (${email}) - kanal: ${kayitKanal || 'bilinmiyor'} - isletme_id: ${isletme.id}${referansMesaj}`);

      // Süper admin panele canlı yayın + push
      try {
        socketServer.emitToAdmin('isletme:yeni', { isletme, kanal: kayitKanal || 'web' });
        pushService.sendToAdmin({
          title: '🎉 Yeni İşletme Kaydı',
          body: `${isletmeAdi} — ${email}${kayitKanal ? ` (${kayitKanal})` : ''}`,
          url: '/',
          tag: `isletme-${isletme.id}`,
        });
      } catch (e) {}

      res.json({ 
        basarili: true, 
        isletme_id: isletme.id, 
        kullanici_id: kullanici.id,
        mesaj: `${isletmeAdi} başarıyla oluşturuldu!${referansMesaj}` 
      });
    } catch (error) {
      console.error('❌ Bot kayıt hatası:', error.message);
      res.status(500).json({ hata: 'Kayıt sırasında bir hata oluştu' });
    }
  }

  // Panelin giriş ekranı ayarları (Google girişi açık mı, kayıtta e-posta kodu isteniyor mu)
  async ayar(req, res) {
    res.json({ google_client_id: GOOGLE_CLIENT_ID() || null, eposta_dogrulama: require('../utils/eposta').aktif() });
  }

  // Kayıt 1/2 (2026-10-22): e-postaya 6 haneli kod. Kayıt (botKayit) bu kodla tamamlanır. 15 dk geçerli, dakikada 1.
  async kayitKod(req, res) {
    try {
      const eposta = require('../utils/eposta');
      const email = String(req.body.email || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 150) return res.status(400).json({ hata: 'Geçerli bir e-posta yazın' });
      if (!eposta.aktif()) return res.json({ gerekli: false });
      if (await kullaniciBul(email)) return res.status(400).json({ hata: 'Bu email zaten kayıtlı. Giriş yapmayı dene.' });
      const anahtar = email.toLowerCase();
      const son = (await pool.query("SELECT 1 FROM eposta_dogrulama WHERE email = $1 AND olusturma > NOW() - INTERVAL '1 minute'", [anahtar])).rows[0];
      if (son) return res.status(429).json({ hata: 'Kod az önce gönderildi, 1 dakika sonra tekrar dene.' });
      const kod = String(require('crypto').randomInt(0, 1000000)).padStart(6, '0');
      await pool.query(
        `INSERT INTO eposta_dogrulama (email, kod_hash, son_gecerlilik) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
         ON CONFLICT (email) DO UPDATE SET kod_hash = EXCLUDED.kod_hash, son_gecerlilik = EXCLUDED.son_gecerlilik, deneme = 0, olusturma = NOW()`,
        [anahtar, await bcrypt.hash(kod, 8)]);
      const m = eposta.dogrulamaMaili(kod);
      const g = await eposta.epostaGonder({ kime: email, konu: m.konu, html: m.html, metin: m.metin });
      if (!g.success) {
        await pool.query('DELETE FROM eposta_dogrulama WHERE email = $1', [anahtar]);
        return res.status(502).json({ hata: 'Kod e-postanıza gönderilemedi. Adresi kontrol edip tekrar deneyin.' });
      }
      res.json({ gerekli: true, mesaj: `Doğrulama kodunu ${email} adresine gönderdik. Gelen kutunuzu (ve spam klasörünü) kontrol edin.` });
    } catch (error) {
      console.error('❌ Kayıt kodu hatası:', error.message);
      res.status(500).json({ hata: 'Kod gönderilemedi' });
    }
  }

  // Google ile giriş/kayıt (kullanıcı kararı 2026-10-14). Google'ın kimlik kartı (ID token) Google'a doğrulatılır.
  // Hesap varsa girilir; yoksa işletme adı istenir ({ yeni: true }), ikinci istekte hesap açılıp girilir.
  async google(req, res) {
    try {
      const cid = GOOGLE_CLIENT_ID();
      if (!cid) return res.status(400).json({ hata: 'Google ile giriş henüz açık değil' });
      const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(String(req.body.credential || ''))}`);
      const g = r.ok ? await r.json() : null;
      if (!g || g.aud !== cid || !['accounts.google.com', 'https://accounts.google.com'].includes(g.iss)
          || !(g.email_verified === true || g.email_verified === 'true') || !(Number(g.exp) * 1000 > Date.now())) {
        return res.status(401).json({ hata: 'Google girişi doğrulanamadı, tekrar dene' });
      }
      const email = String(g.email).toLowerCase();
      let kullanici = await kullaniciBul(email);
      if (!kullanici) {
        const isletmeAdi = String(req.body.isletmeAdi || '').trim();
        if (!isletmeAdi) return res.json({ yeni: true, email, isim: g.name || '' });
        // Kayıt, normal kaydın aynısı (davet, kanal, bildirim); şifre rastgele — istenirse "Şifremi unuttum" ile belirlenir
        let sonuc = null;
        await this.botKayit({ _epostaDogru: true, body: { isletmeAdi, email, sifre: require('crypto').randomBytes(24).toString('hex'),
          kayitKanal: req.body.kayitKanal, davet: req.body.davet, sartlar_onay: req.body.sartlar_onay === true, saha_kodu: req.body.saha_kodu } },
          { status: () => ({ json: (d) => { sonuc = d; } }), json: (d) => { sonuc = d; } });
        if (!sonuc?.basarili) return res.status(400).json({ hata: sonuc?.hata || 'Kayıt yapılamadı' });
        kullanici = await kullaniciBul(email);
      }
      res.json(oturumCevabi(kullanici));
    } catch (error) {
      console.error('❌ Google giriş hatası:', error.message);
      res.status(500).json({ hata: 'Google girişi şu an yapılamadı' });
    }
  }

  // Şifremi unuttum 1/2: işletmenin kayıtlı telefonuna WhatsApp'tan 6 haneli kod.
  // Önce işletmenin kendi bağlı WhatsApp'ı (kendine mesaj), değilse SıraGO doğrulama numarası.
  async sifreKod(req, res) {
    try {
      const k = await kullaniciBul(req.body.email);
      const genel = { mesaj: 'Hesap bulunduysa kayıtlı WhatsApp numarasına kod gönderdik.' };
      if (!k) return res.json(genel);
      const i = k.isletme_id ? (await pool.query('SELECT id, telefon FROM isletmeler WHERE id = $1', [k.isletme_id])).rows[0] : null;
      const tel = require('../utils/telefon').telefonNormalize(i?.telefon);
      if (!/^905\d{9}$/.test(tel)) return res.status(400).json({ hata: `Hesabınızda kayıtlı telefon yok. ${require('../config/iletisim').DESTEK_EPOSTA} adresine yazın, hemen yardımcı olalım.` });
      const son = (await pool.query("SELECT 1 FROM sifre_sifirlama WHERE kullanici_id = $1 AND olusturma > NOW() - INTERVAL '1 minute'", [k.id])).rows[0];
      if (son) return res.status(429).json({ hata: 'Kod az önce gönderildi, 1 dakika sonra tekrar dene.' });
      const kod = String(require('crypto').randomInt(0, 1000000)).padStart(6, '0');
      await pool.query('DELETE FROM sifre_sifirlama WHERE kullanici_id = $1', [k.id]);
      await pool.query("INSERT INTO sifre_sifirlama (kullanici_id, kod_hash, son_gecerlilik) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')", [k.id, await bcrypt.hash(kod, 8)]);
      const metin = `SıraGO şifre yenileme kodunuz: *${kod}*\n15 dakika geçerli. Bu isteği siz yapmadıysanız dikkate almayın.`;
      let gitti = false;
      try {
        const wa = require('../services/whatsappWeb');
        if (wa.getDurum(i.id)?.durum === 'bagli') gitti = (await wa.mesajGonder(i.id, tel, metin))?.success;
      } catch (e) { /* yedeğe geç */ }
      if (!gitti) { try { gitti = (await require('../services/merkezOtpBot').mesajGonder(tel, metin))?.success; } catch (e) { /* aşağıda */ } }
      if (!gitti) return res.status(502).json({ hata: `Kod şu an gönderilemedi. ${require('../config/iletisim').DESTEK_EPOSTA} adresine yazın, hemen yardımcı olalım.` });
      res.json({ mesaj: `Kodu ${telMaskele(tel)} numaralı WhatsApp'a gönderdik.` });
    } catch (error) {
      console.error('❌ Şifre kodu hatası:', error.message);
      res.status(500).json({ hata: 'Kod gönderilemedi' });
    }
  }

  // Şifremi unuttum 2/2: kod + yeni şifre → şifre değişir ve giriş yapılır (5 yanlış denemede kod geçersiz)
  async sifreYenile(req, res) {
    try {
      const { email, kod, sifre } = req.body;
      if (String(sifre || '').length < 8 || String(sifre).length > 72) return res.status(400).json({ hata: 'Şifre en az 8 karakter olmalı' });
      const k = await kullaniciBul(email);
      const s = k ? (await pool.query('SELECT * FROM sifre_sifirlama WHERE kullanici_id = $1 AND son_gecerlilik > NOW()', [k.id])).rows[0] : null;
      if (!s || s.deneme >= 5) return res.status(400).json({ hata: 'Kodun süresi doldu, yeni kod isteyin.' });
      if (!(await bcrypt.compare(String(kod || '').replace(/\D/g, ''), s.kod_hash))) {
        await pool.query('UPDATE sifre_sifirlama SET deneme = deneme + 1 WHERE kullanici_id = $1', [k.id]);
        return res.status(400).json({ hata: 'Kod yanlış' });
      }
      await pool.query('UPDATE admin_kullanicilar SET sifre = $1 WHERE id = $2', [await bcrypt.hash(String(sifre), 10), k.id]);
      await pool.query('UPDATE admin_kullanicilar SET sifre_degistirmeli = false WHERE id = $1', [k.id]).catch(() => {});
      await pool.query('DELETE FROM sifre_sifirlama WHERE kullanici_id = $1', [k.id]);
      res.json(oturumCevabi({ ...k, sifre_degistirmeli: false }));
    } catch (error) {
      console.error('❌ Şifre yenileme hatası:', error.message);
      res.status(500).json({ hata: 'Şifre değiştirilemedi' });
    }
  }

  async profilim(req, res) {
    try {
      const kullanici = (await pool.query(
        'SELECT ak.id, ak.isim, ak.email, ak.rol, ak.isletme_id, ak.aktif, ak.olusturma_tarihi, i.isim as isletme_isim FROM admin_kullanicilar ak LEFT JOIN isletmeler i ON ak.isletme_id = i.id WHERE ak.id = $1',
        [req.kullanici.id]
      )).rows[0];
      if (kullanici && kullanici.rol === 'superadmin') {
        kullanici.ekip_gorev = req.kullanici.ekip_gorev || null;
        kullanici.ekip_yetkileri = req.kullanici.ekip_yetkileri || null;
        kullanici.patron = req.kullanici.patron === true;
      }
      if (kullanici) {
        // Ayrı sorgu: kolon henüz yoksa profil yine açılsın
        try {
          const f = (await pool.query('SELECT sifre_degistirmeli FROM admin_kullanicilar WHERE id = $1', [kullanici.id])).rows[0];
          kullanici.sifre_degistirmeli = f?.sifre_degistirmeli === true;
        } catch (e) { kullanici.sifre_degistirmeli = false; }
        kullanici.impersonated = req.kullanici.impersonated === true;
        try {
          kullanici.profil_foto = (await pool.query('SELECT profil_foto FROM admin_kullanicilar WHERE id = $1', [kullanici.id])).rows[0]?.profil_foto || null;
        } catch (e) { kullanici.profil_foto = null; }
      }
      res.json({ kullanici });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Profil fotoğrafı (2026-10-20): panel 256 px'e küçültüp gönderir; null → kaldır
  async profilFoto(req, res) {
    try {
      const veri = req.body?.veri ?? null;
      if (veri !== null && !(/^data:image\/(jpeg|png|webp);base64,/.test(String(veri)) && String(veri).length <= 400_000)) {
        return res.status(400).json({ hata: 'Fotoğraf JPG, PNG ya da WEBP olmalı ve çok büyük olmamalı' });
      }
      const eski = (await pool.query('SELECT profil_foto FROM admin_kullanicilar WHERE id = $1', [req.kullanici.id])).rows[0]?.profil_foto || null;
      await pool.query('UPDATE admin_kullanicilar SET profil_foto = $1 WHERE id = $2', [veri, req.kullanici.id]);
      // Esnafın fotoğrafı müşterinin gördüğü randevu sayfasında da logo olur (kullanıcı kararı 2026-10-20).
      // Kaldırınca logo yalnız bu fotoğrafsa silinir; Randevu Sayfam'dan ayrıca yüklenen logo korunur.
      const isletmeId = req.kullanici.rol !== 'superadmin' ? req.kullanici.isletme_id : null;
      if (isletmeId) {
        if (veri) await pool.query(`INSERT INTO isletme_gorselleri (isletme_id, tur, veri) VALUES ($1, 'logo', $2)
          ON CONFLICT (isletme_id, tur) DO UPDATE SET veri = EXCLUDED.veri, guncelleme = NOW()`, [isletmeId, veri]);
        else if (eski) await pool.query(`DELETE FROM isletme_gorselleri WHERE isletme_id = $1 AND tur = 'logo' AND veri = $2`, [isletmeId, eski]);
        await pool.query('UPDATE isletmeler SET sayfa_guncelleme = NOW() WHERE id = $1', [isletmeId]);   // sayfadaki ?v= önbelleği yenilensin
      }
      res.json({ profil_foto: veri });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }

  // Şifremi değiştir (2026-10-15): esnaf ve ekip kendi şifresini panelden değiştirir. Geçici şifreyle girene
  // (sifre_degistirmeli) mevcut şifre sorulmaz; panel o değiştirene kadar başka ekran açmaz.
  async sifreDegistir(req, res) {
    try {
      if (req.kullanici.impersonated) return res.status(403).json({ hata: 'Müşteri olarak girişte şifre değiştirilemez' });
      const { mevcut, yeni } = req.body || {};
      if (!sifreGecerli(yeni)) return res.status(400).json({ hata: 'Yeni şifre en az 8 karakter olmalı' });
      const k = (await pool.query('SELECT * FROM admin_kullanicilar WHERE id = $1 AND aktif = true', [req.kullanici.id])).rows[0];
      if (!k) return res.status(404).json({ hata: 'Kullanıcı bulunamadı' });
      const zorunlu = k.sifre_degistirmeli === true;
      if (!zorunlu && !(await bcrypt.compare(String(mevcut || ''), k.sifre))) return res.status(400).json({ hata: 'Mevcut şifre yanlış' });
      if (await bcrypt.compare(String(yeni), k.sifre)) {
        return res.status(400).json({ hata: zorunlu ? 'Geçici şifreden farklı bir şifre belirleyin' : 'Yeni şifre eskisiyle aynı' });
      }
      await pool.query('UPDATE admin_kullanicilar SET sifre = $1, sifre_degistirmeli = false WHERE id = $2', [await bcrypt.hash(String(yeni), 10), k.id]);
      await pool.query('DELETE FROM sifre_sifirlama WHERE kullanici_id = $1', [k.id]).catch(() => {});
      try {
        await pool.query(
          `INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, ip_adresi) VALUES ($1, $2, $3, 'sifre_degistirildi', $4, $5)`,
          [k.isletme_id, k.id, k.email, zorunlu ? 'Geçici şifre ilk girişte değiştirildi' : 'Şifre panelden değiştirildi', require('../utils/istemciIp').istemciIp(req)]);
      } catch (e) { /* audit log opsiyonel */ }
      res.json({ ok: true, mesaj: 'Şifren değişti' });
    } catch (error) {
      console.error('❌ Şifre değiştirme hatası:', error.message);
      res.status(500).json({ hata: 'Şifre değiştirilemedi' });
    }
  }
}

module.exports = new AuthController();
