// Satış Bot ≠ Merkez OTP (kullanıcı kararı 2026-10-15): bir numara yalnız bir sisteme bağlanır. Satış Bot numarası
// Merkez OTP'ye okutulursa bağlantı reddedilir; Satış Bot bir Merkez numarasını bağlarsa numara Merkez'den çıkarılır.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const bekle = async (kosul) => { for (let i = 0; i < 100 && !(await kosul()); i++) await new Promise(r => setTimeout(r, 10)); };

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE merkez_otp_bot (id SERIAL PRIMARY KEY, numara TEXT UNIQUE, auth_id INT UNIQUE, durum VARCHAR(20) DEFAULT 'kapali', qr_base64 TEXT,
      gunluk_gonderim INT DEFAULT 0, bugun_tarihi DATE, aktif BOOLEAN DEFAULT true, olusturma TIMESTAMP DEFAULT NOW());
    CREATE TABLE satis_bot_numaralar (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, durum TEXT);
    CREATE TABLE wa_auth_keys (isletme_id INT, key_id TEXT, key_data TEXT);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY); CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY);
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY); CREATE TABLE odemeler (id SERIAL PRIMARY KEY);
    INSERT INTO satis_bot_numaralar (isim, telefon, durum) VALUES ('Satış 1', '905009998877', 'aktif');
    INSERT INTO merkez_otp_bot (numara, auth_id, durum) VALUES (NULL, 800001, 'kapali'), ('+905001112233', 800002, 'kapali');
    INSERT INTO wa_auth_keys VALUES (800001, 'creds', '{}'), (800002, 'creds', '{}');`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/050_platform_yonetimi.sql', 'utf8'));
  await o.db.exec(fs.readFileSync(SRC + '/migrations/051_saha_satis.sql', 'utf8').replace(/^ALTER TABLE isletmeler ALTER COLUMN mesai_disi_mod.*$/m, ''));
  // Sahte WhatsApp soketi: bağlantı olaylarını test yayar; çıkışta WhatsApp gibi "loggedOut" ile kapanır
  const soketler = [];
  const baileys = require.cache[require.resolve('@whiskeysockets/baileys', { paths: [SRC] })].exports;
  baileys.default = () => {
    const s = { ev: new EventEmitter(), user: null, cikis: 0, end: () => {} };
    s.logout = async () => { s.cikis++; s.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 401 } } } }); };
    soketler.push(s);
    return s;
  };
  sahte('utils/pgAuthState', { usePostgresAuthState: async () => ({ state: { creds: {}, keys: {} }, saveCreds: () => {} }) });
  sahte('services/satisBot', { numaraSockets: new Map(), sock: null });
  return { ...o, soketler };
})();

const satir = async (db, id) => (await db.query('SELECT numara, durum, uyari FROM merkez_otp_bot WHERE id = $1', [id])).rows[0];

test('Satış Bot numarası Merkez OTP\'ye okutulursa bağlantı reddedilir, sebebi panelde ve Sistem Uyarıları\'nda', async () => {
  const { db, soketler } = await ortam;
  const mo = require(SRC + '/services/merkezOtpBot');
  await mo.numaraBaslat(1, 800001);
  const s = soketler.at(-1);
  s.user = { id: '905009998877:7@s.whatsapp.net' };
  s.ev.emit('connection.update', { connection: 'open' });
  await bekle(async () => (await satir(db, 1)).uyari);
  const r = await satir(db, 1);
  assert.strictEqual(s.cikis, 1, 'oturum kapatıldı (telefondaki bağlı cihaz silinir)');
  assert.deepStrictEqual([r.durum, r.numara], ['kapali', null]);
  assert.match(r.uyari, /\+905009998877 Satış Bot numarası; Merkez OTP'ye bağlanamaz/);
  assert.strictEqual(mo.aktifMi(), false, 'doğrulama kodu bu numaradan gitmez');
  assert.strictEqual((await db.query('SELECT COUNT(*)::int n FROM wa_auth_keys WHERE isletme_id = 800001')).rows[0].n, 0);
  const u = (await db.query("SELECT seviye, baslik FROM sistem_uyarilari WHERE anahtar = 'numara_cakisma:905009998877'")).rows[0];
  assert.strictEqual(u.seviye, 'kritik');

  // Ayrı bir numara okutulunca bağlanır, eski uyarı kalkar
  await mo.numaraBaslat(1, 800001);
  const s2 = soketler.at(-1);
  s2.user = { id: '905004445566:1@s.whatsapp.net' };
  s2.ev.emit('connection.update', { connection: 'open' });
  await bekle(async () => (await satir(db, 1)).durum === 'bagli');
  assert.deepStrictEqual(await satir(db, 1), { numara: '+905004445566', durum: 'bagli', uyari: null });
  assert.strictEqual(mo.aktifMi(), true);
});

test('Satış Bot bir Merkez numarasını bağlarsa numara Merkez OTP\'den çıkarılır (çakışmada satış kazanır)', async () => {
  const { db, soketler } = await ortam;
  const mo = require(SRC + '/services/merkezOtpBot');
  const sn = require(SRC + '/utils/sistemNumaralari');
  await mo.numaraBaslat(2, 800002);
  const s = soketler.at(-1);
  s.user = { id: '905001112233:2@s.whatsapp.net' };
  s.ev.emit('connection.update', { connection: 'open' });
  await bekle(async () => (await satir(db, 2)).durum === 'bagli');

  assert.strictEqual(await sn.digerSistemde('905001112233', 'satis'), true, 'Satış Bot bağlanırken Merkez\'de olduğunu görür');
  assert.strictEqual(await sn.digerSistemde('+90 500 999 88 77', 'merkez'), true, 'kayıtlı Satış Bot numarası (biçim fark etmez)');
  assert.strictEqual(await sn.digerSistemde('905007770000', 'merkez'), false);

  assert.strictEqual(await mo.satisaGecti('905001112233'), 1);
  assert.strictEqual(s.cikis, 1, 'Merkez oturumu kapatıldı');
  const r = await satir(db, 2);
  assert.deepStrictEqual([r.numara, r.durum], [null, 'kapali']);
  assert.match(r.uyari, /Satış Bot'a bağlandı; Merkez OTP'den çıkarıldı/);
  assert.strictEqual(mo.sockets.has(2), false);
  assert.strictEqual(await mo.satisaGecti('905001112233'), 0, 'tekrar çağrı bir şey yapmaz');
  assert.strictEqual((await satir(db, 1)).durum, 'bagli', 'öbür Merkez numarası etkilenmez');
});
