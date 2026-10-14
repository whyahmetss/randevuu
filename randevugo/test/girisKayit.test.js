// Giriş/kayıt: büyük/küçük harf duyarsız giriş, şifre sıfırlama (WhatsApp kodu, 5 deneme), Google ile giriş ve kayıt.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

test('giriş, şifremi unuttum ve Google', async () => {
  const bcrypt = require(require.resolve('bcryptjs', { paths: [SRC] }));
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, kategori TEXT, aktif BOOLEAN, paket TEXT,
      olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, kayit_kanali TEXT);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN,
      grup_id INT, ekip_gorev TEXT, ekip_yetkileri JSONB, patron BOOLEAN, son_giris TIMESTAMP);
    CREATE TABLE audit_log (id SERIAL PRIMARY KEY, isletme_id INT, kullanici_id INT, kullanici_email TEXT, islem TEXT, detay TEXT, ip_adresi TEXT);
    INSERT INTO isletmeler (isim, telefon, aktif) VALUES ('Kemal Berber', '05321234567', true);
    ${fs.readFileSync(path.join(SRC, 'migrations', '036_sifre_sifirlama.sql'), 'utf8')}`);
  await db.query("INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id, aktif) VALUES ('Kemal', 'Kemal@Ornek.com', $1, 'admin', 1, true)", [await bcrypt.hash('eskisifre1', 4)]);
  const gidenler = [];
  sahte('services/socketServer', { emitToAdmin() {} });
  sahte('services/pushService', { sendToAdmin() {} });
  sahte('services/whatsappWeb', { getDurum: () => ({ durum: 'kapali' }), mesajGonder: async () => ({ success: false }) });
  sahte('services/merkezOtpBot', { mesajGonder: async (tel, m) => { gidenler.push([tel, m]); return { success: true }; } });
  sahte('utils/davet', { kodGecerli: async () => true, davetUygula: async () => null, KANALLAR: ['web'] });
  const a = require(path.join(SRC, 'controllers', 'authController'));

  let r = cevap(); await a.giris({ body: { email: 'kemal@ornek.com', sifre: 'eskisifre1' }, headers: {}, socket: {} }, r);
  assert.ok(r.veri.token, 'büyük/küçük harf duyarsız giriş');

  // Şifremi unuttum
  r = cevap(); await a.sifreKod({ body: { email: 'kemal@ornek.com' } }, r);
  assert.match(r.veri.mesaj, /45 67/);
  assert.equal(gidenler[0][0], '905321234567');
  const kod = gidenler[0][1].match(/\*(\d{6})\*/)[1];
  r = cevap(); await a.sifreKod({ body: { email: 'kemal@ornek.com' } }, r);
  assert.equal(r.kod, 429, '1 dakikada bir kod');
  r = cevap(); await a.sifreKod({ body: { email: 'yok@ornek.com' } }, r);
  assert.equal(r.kod, 200, 'olmayan hesap için de aynı cevap (hesap var mı sızmasın)');

  const yanlis = kod === '000000' ? '111111' : '000000';
  r = cevap(); await a.sifreYenile({ body: { email: 'kemal@ornek.com', kod: yanlis, sifre: 'yenisifre1' } }, r);
  assert.equal(r.veri.hata, 'Kod yanlış');
  r = cevap(); await a.sifreYenile({ body: { email: 'kemal@ornek.com', kod, sifre: 'yenisifre1' } }, r);
  assert.ok(r.veri.token, 'doğru kodla şifre değişir ve giriş yapılır');
  r = cevap(); await a.giris({ body: { email: 'kemal@ornek.com', sifre: 'yenisifre1' }, headers: {}, socket: {} }, r);
  assert.ok(r.veri.token);
  r = cevap(); await a.sifreYenile({ body: { email: 'kemal@ornek.com', kod, sifre: 'baska12345' } }, r);
  assert.equal(r.kod, 400, 'kod bir kez kullanılır');

  // Google
  process.env.GOOGLE_CLIENT_ID = 'test-cid';
  const fetchEski = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ aud: 'test-cid', iss: 'accounts.google.com', email: 'Yeni@Gmail.com', email_verified: 'true', exp: String(Math.floor(Date.now() / 1000) + 600), name: 'Yeni Kişi' }) });
  try {
    r = cevap(); await a.google({ body: { credential: 'x' } }, r);
    assert.equal(r.veri.yeni, true, 'hesap yoksa işletme adı istenir');
    r = cevap(); await a.google({ body: { credential: 'x', isletmeAdi: 'Yeni Kuaför' } }, r);
    assert.ok(r.veri.token, 'işletme adıyla hesap açılır ve girilir');
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM isletmeler WHERE isim = 'Yeni Kuaför'")).rows[0].n, 1);
    r = cevap(); await a.google({ body: { credential: 'x' } }, r);
    assert.ok(r.veri.token, 'ikinci seferde doğrudan girer');
    global.fetch = async () => ({ ok: true, json: async () => ({ aud: 'baska-uygulama', iss: 'accounts.google.com', email: 'a@b.com', email_verified: 'true', exp: '9999999999' }) });
    r = cevap(); await a.google({ body: { credential: 'x' } }, r);
    assert.equal(r.kod, 401, 'başka uygulamanın kartı reddedilir');
  } finally { global.fetch = fetchEski; delete process.env.GOOGLE_CLIENT_ID; }
});
