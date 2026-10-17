// İşletmeler listesi (2026-10-17): esnafın son giriş/görülmesi tutulur, demolar genel sayılara girmez
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false, grup_id INT, getiren_id INT, bayi_id INT);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, rol TEXT, isletme_id INT, grup_id INT);
    CREATE TABLE randevular (id SERIAL, isletme_id INT);
    CREATE TABLE bayiler (id SERIAL PRIMARY KEY, isim TEXT, firma TEXT);
    INSERT INTO admin_kullanicilar (isim, email, rol) VALUES ('Ahmet', 'a@x', 'superadmin');
    INSERT INTO bayiler (isim, firma) VALUES ('Hasan', 'Hasan Malzeme');
    INSERT INTO isletmeler (isim, demo, getiren_id, bayi_id) VALUES ('Gerçek', false, 1, 1), ('Demo Berber', true, NULL, NULL);
    INSERT INTO admin_kullanicilar (isim, email, rol, isletme_id) VALUES ('Esnaf', 'e@x', 'admin', 1);`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/057_isletme_son_giris.sql', 'utf8'));
  return o;
})();

test('esnaf panele istek atınca son görülme yazılır; ekip "işletme olarak giriş" yazmaz', async () => {
  const { db } = await ortam;
  const jwt = require('jsonwebtoken');
  const { authMiddleware, jwtSecret } = require(SRC + '/middleware/auth');
  const istek = async (yuk) => {
    const req = { headers: { authorization: 'Bearer ' + jwt.sign(yuk, jwtSecret) }, query: {} };
    let gecti = false;
    await authMiddleware(req, { status: () => ({ json: () => {} }) }, () => { gecti = true; });
    await new Promise(r => setTimeout(r, 50));
    return gecti;
  };
  assert.ok(await istek({ id: 2, rol: 'admin', isletme_id: 1, impersonated: true }));
  assert.strictEqual((await db.query('SELECT son_panel FROM isletmeler WHERE id = 1')).rows[0].son_panel, null, 'ekip girişi sayılmaz');
  assert.ok(await istek({ id: 2, rol: 'admin', isletme_id: 1 }));
  assert.ok((await db.query('SELECT son_panel FROM isletmeler WHERE id = 1')).rows[0].son_panel, 'esnaf girişi yazıldı');
});

test('işletme listesi getireni ve bayiyi verir', async () => {
  await ortam;
  const c = require(SRC + '/controllers/adminController');
  const r = {}; await c.tumIsletmeler({}, { json: (v) => { r.v = v; }, status: () => ({ json: (v) => { r.v = v; } }) });
  const g = r.v.isletmeler.find(i => i.isim === 'Gerçek');
  assert.strictEqual(g.getiren_isim, 'Ahmet');
  assert.strictEqual(g.bayi_isim, 'Hasan Malzeme');
  assert.strictEqual(r.v.isletmeler.find(i => i.isim === 'Demo Berber').demo, true);
});
