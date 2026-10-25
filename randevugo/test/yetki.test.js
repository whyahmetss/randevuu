// Oturum anahtarı kuralları (rapor doğrulaması, 2026-10-26): anahtar yalnız başlıktan; silinen/kapatılan hesabın eski
// anahtarı geçmez; yetki kontrolü veritabanına ulaşamazsa istek durur. Canlı bağlantı (socket) da aynı kuralı uygular.
const test = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, aktif BOOLEAN DEFAULT true, grup_id INT, son_panel TIMESTAMP);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, email TEXT, rol TEXT, isletme_id INT, grup_id INT, aktif BOOLEAN DEFAULT true,
      ekip_yetkileri JSONB, ekip_gorev TEXT, patron BOOLEAN DEFAULT false);
    INSERT INTO isletmeler (isim) VALUES ('Berber');
    INSERT INTO admin_kullanicilar (email, rol, isletme_id) VALUES ('esnaf@x', 'admin', 1), ('kapali@x', 'admin', 1);
    UPDATE admin_kullanicilar SET aktif = false WHERE id = 2;
    INSERT INTO admin_kullanicilar (email, rol, aktif) VALUES ('ekip@x', 'superadmin', true), ('eskiekip@x', 'admin', true);`);
  const { authMiddleware, jwtSecret } = require(SRC + '/middleware/auth');
  const anahtar = (yuk) => jwt.sign(yuk, jwtSecret);
  const istek = async (req) => {
    let durum = 200, gecti = false;
    await authMiddleware({ headers: {}, query: {}, ...req }, { status(k) { durum = k; return this; }, json() {} }, () => { gecti = true; });
    return gecti ? 'gecti' : durum;
  };
  return { ...o, anahtar, istek };
})();

test('geçerli esnaf anahtarı başlıktan geçer; adres satırındaki anahtar kabul edilmez', async () => {
  const { anahtar, istek } = await ortam;
  const a = anahtar({ id: 1, rol: 'admin', isletme_id: 1 });
  assert.equal(await istek({ headers: { authorization: 'Bearer ' + a } }), 'gecti');
  assert.equal(await istek({ query: { token: a } }), 401);
});

test('silinen ya da kapatılan hesabın eski anahtarı geçmez', async () => {
  const { anahtar, istek } = await ortam;
  assert.equal(await istek({ headers: { authorization: 'Bearer ' + anahtar({ id: 2, rol: 'admin', isletme_id: 1 }) } }), 401, 'kapalı');
  assert.equal(await istek({ headers: { authorization: 'Bearer ' + anahtar({ id: 99, rol: 'admin', isletme_id: 1 }) } }), 401, 'silinmiş');
});

test('rolü düşürülen ekip üyesinin eski süper admin anahtarı geçmez', async () => {
  const { anahtar, istek } = await ortam;
  assert.equal(await istek({ headers: { authorization: 'Bearer ' + anahtar({ id: 3, rol: 'superadmin' }) } }), 'gecti');
  assert.equal(await istek({ headers: { authorization: 'Bearer ' + anahtar({ id: 4, rol: 'superadmin' }) } }), 401);
});

test('veritabanına ulaşılamazsa istek eski anahtarla devam etmez', async () => {
  const { pool, anahtar, istek } = await ortam;
  const asil = pool.query;
  pool.query = async () => { throw new Error('bağlantı yok'); };
  try {
    assert.equal(await istek({ headers: { authorization: 'Bearer ' + anahtar({ id: 1, rol: 'admin', isletme_id: 1 }) } }), 503);
  } finally { pool.query = asil; }
});

test('canlı bağlantı: kapalı/silinmiş hesap bağlanamaz, süper admin odası rolü veritabanından alır', async () => {
  const { anahtar } = await ortam;
  const { _test } = require(SRC + '/services/socketServer');
  const dene = async (handshake) => { const s = { handshake, data: {} }; try { await _test.kimlik(s); return s.data; } catch (e) { return e.message; } };
  assert.equal((await dene({ auth: { token: anahtar({ id: 1, rol: 'admin', isletme_id: 1 }) } })).kullanici.id, 1);
  assert.equal(await dene({ auth: { token: anahtar({ id: 2, rol: 'admin', isletme_id: 1 }) } }), 'Hesap kapatılmış');
  assert.equal(await dene({ auth: { token: anahtar({ id: 99, rol: 'admin' }) } }), 'Hesap kapatılmış');
  assert.equal(await dene({ query: { token: anahtar({ id: 1, rol: 'admin', isletme_id: 1 }) } }), 'Token yok', 'adres satırı kabul edilmez');
  // Rolü düşürülmüş eski ekip üyesi: anahtarda superadmin yazsa da admin odasına giremez
  assert.equal((await dene({ auth: { token: anahtar({ id: 4, rol: 'superadmin' }) } })).kullanici.rol, 'admin');
  assert.equal((await dene({ auth: { token: anahtar({ id: 3, rol: 'superadmin' }) } })).kullanici.rol, 'superadmin');
  assert.equal((await dene({ auth: { slug: 'berber' } })).misafir, 'berber');
});
