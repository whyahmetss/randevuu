const pool = require('../config/db');
const { DENEME_GUN } = require('../config/deneme');
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
    ekip_gorev: kullanici.ekip_gorev || null, ekip_yetkileri: Array.isArray(kullanici.ekip_yetkileri) ? kullanici.ekip_yetkileri : null, patron: kullanici.patron === true } };
}
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

      const token = jwt.sign(
        { id: kullanici.id, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null },
        jwtSecret,
        { expiresIn: '7d' }
      );

      // Audit log — giriş kaydı
      try {
        await pool.query(
          `INSERT INTO audit_log (isletme_id, kullanici_id, kullanici_email, islem, detay, ip_adresi)
           VALUES ($1, $2, $3, 'giris', 'Panel girişi', $4)`,
          [kullanici.isletme_id, kullanici.id, kullanici.email, require('../utils/istemciIp').istemciIp(req)]
        );
      } catch(e) { /* audit log opsiyonel */ }

      if (kullanici.rol === 'superadmin') pool.query('UPDATE admin_kullanicilar SET son_giris = NOW() WHERE id = $1', [kullanici.id]).catch(() => {});
      res.json({ token, kullanici: { id: kullanici.id, isim: kullanici.isim, email: kullanici.email, rol: kullanici.rol, isletme_id: kullanici.isletme_id, grup_id: kullanici.grup_id || null,
        ekip_gorev: kullanici.ekip_gorev || null, ekip_yetkileri: Array.isArray(kullanici.ekip_yetkileri) ? kullanici.ekip_yetkileri : null,
        patron: kullanici.patron === true } });
    } catch (error) {
      console.error('❌ Giriş hatası:', error.message, error.stack);
      res.status(500).json({ hata: 'Sunucu hatası oluştu' });
    }
  }

  // Bot üzerinden kayıt (WP/TG bot çağırır)
  async botKayit(req, res) {
    try {
      const { isletmeAdi, email, sifre, telefon, kayitKanal, referans_kodu, davet } = req.body;
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
      const mevcutKullanici = (await pool.query('SELECT id FROM admin_kullanicilar WHERE email = $1', [email])).rows[0];
      if (mevcutKullanici) {
        return res.status(400).json({ hata: 'Bu email zaten kayıtlı. Giriş yapmayı dene.' });
      }

      // İşletme oluştur
      const isletme = (await pool.query(
        `INSERT INTO isletmeler (isim, telefon, kategori, aktif, paket, olusturma_tarihi, deneme_bitis_tarihi) 
         VALUES ($1, $2, 'genel', true, 'baslangic', NOW(), NOW() + make_interval(days => $3)) RETURNING *`,
        [isletmeAdi, telefon || '', DENEME_GUN]
      )).rows[0];

      // Admin kullanıcı oluştur
      const hashSifre = await bcrypt.hash(sifre, 10);
      const kullanici = (await pool.query(
        `INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) 
         VALUES ($1, $2, $3, 'admin', $4, true) RETURNING *`,
        [isletmeAdi, email, hashSifre, isletme.id]
      )).rows[0];
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

  // Panelin giriş ekranı ayarları (Google girişi açık mı)
  async ayar(req, res) {
    res.json({ google_client_id: GOOGLE_CLIENT_ID() || null });
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
        await this.botKayit({ body: { isletmeAdi, email, sifre: require('crypto').randomBytes(24).toString('hex'),
          kayitKanal: req.body.kayitKanal, davet: req.body.davet, sartlar_onay: req.body.sartlar_onay === true } },
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
      if (!/^905\d{9}$/.test(tel)) return res.status(400).json({ hata: 'Hesabınızda kayıtlı telefon yok. siragobusiness@gmail.com adresine yazın, hemen yardımcı olalım.' });
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
      if (!gitti) return res.status(502).json({ hata: 'Kod şu an gönderilemedi. siragobusiness@gmail.com adresine yazın, hemen yardımcı olalım.' });
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
      await pool.query('DELETE FROM sifre_sifirlama WHERE kullanici_id = $1', [k.id]);
      res.json(oturumCevabi(k));
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
      res.json({ kullanici });
    } catch (error) {
      res.status(500).json({ hata: error.message });
    }
  }
}

module.exports = new AuthController();
