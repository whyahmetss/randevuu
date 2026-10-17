// Bayi / toptancı ağı (2026-10-17): B kodu, kayıtta bayiye yazma, hakediş ve şifresiz bayi paneli
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, ilce TEXT, aktif BOOLEAN DEFAULT true, kayit_kanali TEXT,
      deneme_bitis_tarihi TIMESTAMP, paket_bitis_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, durum TEXT, odeme_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT);
    CREATE TABLE audit_log (id SERIAL, kullanici_id INT, kullanici_email TEXT, islem TEXT, detay TEXT);`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/056_bayi.sql', 'utf8'));
  await o.db.exec(fs.readFileSync(SRC + '/migrations/056_bayi.sql', 'utf8'));   // iki kez çalışabilir
  return o;
})();
const req = (ek = {}) => ({ kullanici: { id: 1, email: 'p@x' }, body: {}, params: {}, ...ek });
const res = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.v = v; return r; }; return r; };

test('bayi kodu: B12 yakalanır, ekip kodu S12 ile karışmaz', async () => {
  await ortam;
  const b = require(SRC + '/services/bayi');
  assert.strictEqual(b.kodYakala("Merhaba, SıraGO'yu denemek istiyorum (kart: B12)"), 12);
  assert.strictEqual(b.kodYakala('kart: S12'), null);
  assert.strictEqual(b.linkKodu('b7'), 7);
  assert.strictEqual(b.linkKodu('S7'), null);
  assert.strictEqual(require(SRC + '/utils/sahaKodu').kodYakala('kart: B12'), null, 'ekip tarafı bayi kodunu almaz');
});

test('bayi eklenir, kayıt bayiye yazılır, hakediş ve şifresiz panel doğru', async () => {
  const { db } = await ortam;
  const c = require(SRC + '/controllers/bayiController');
  const bayi = require(SRC + '/services/bayi');
  let r = res(); await c.ekle(req({ body: { isim: 'Hasan', firma: 'Hasan Berber Malzeme', telefon: '0532 111 22 33', komisyon_yuzde: '20', ilk_odeme_tl: 100 } }), r);
  const b = r.v.bayi;
  assert.strictEqual(b.kod, 'B1');
  assert.match(b.token, /^[a-f0-9]{32}$/);
  assert.match(b.panel_linki, /\/bayi\/[a-f0-9]{32}$/);
  r = res(); await c.ekle(req({ body: { isim: 'X', komisyon_yuzde: 150 } }), r);
  assert.strictEqual(r.kod, 400);

  await db.exec(`INSERT INTO isletmeler (isim, ilce, telefon, deneme_bitis_tarihi, paket_bitis_tarihi) VALUES
    ('Makas', 'Kadıköy', '905321', NOW() - INTERVAL '20 days', NOW() + INTERVAL '20 days'),
    ('Fön', 'Moda', '905322', NOW() - INTERVAL '1 day', NOW() + INTERVAL '25 days'),
    ('Yeni', 'Moda', '905323', NOW() + INTERVAL '5 days', NULL),
    ('Başkasının', 'Moda', '905324', NULL, NULL)`);
  for (const id of [1, 2, 3]) assert.ok(await bayi.kayittaUygula(1, id));
  await db.query('UPDATE isletmeler SET bayi_id = 99 WHERE id = 4');
  assert.strictEqual(await bayi.kayittaUygula(1, 4), null, 'başka bayinin işletmesi alınmaz');
  assert.strictEqual((await db.query('SELECT kayit_kanali FROM isletmeler WHERE id = 1')).rows[0].kayit_kanali, 'bayi');

  await db.exec(`INSERT INTO odemeler (isletme_id, tutar, durum, odeme_tarihi) VALUES
    (1, 500, 'odendi', NOW() - INTERVAL '45 days'), (1, 500, 'odendi', NOW()), (2, 300, 'odendi', NOW()),
    (3, 999, 'bekliyor', NOW()), (4, 700, 'odendi', NOW())`);
  r = res(); await c.odemeEkle(req({ params: { id: 1 }, body: { tutar: '200', notu: 'elden' } }), r);
  assert.strictEqual(r.v.ok, true);

  r = res(); await c.liste(req(), r);
  const h = r.v.bayiler[0];
  // ciro 1300 × %20 = 260 + 2 işletme ilk ödeme × 100 = 460; bu ay 800 × %20 = 160 + yalnız Fön'ün ilk ödemesi 100 = 260
  assert.deepStrictEqual([h.kayit, h.odeyen, h.hakedis, h.bu_ay_hakedis, h.odenen, h.bakiye], [3, 2, 460, 260, 200, 260]);

  r = res(); await c.panel(req({ params: { token: b.token } }), r);
  assert.strictEqual(r.kod, 200);
  assert.strictEqual(r.v.kart.kod, 'B1');
  assert.match(r.v.kart.qr, /^data:image\/png;base64,/);
  assert.match(r.v.kart.link, /\/k\/B1$/);
  const durum = Object.fromEntries(r.v.isletmeler.map(i => [i.isim, i.durum]));
  assert.deepStrictEqual(durum, { Makas: 'oduyor', 'Fön': 'oduyor', Yeni: 'denemede' });
  assert.strictEqual(r.v.isletmeler.find(i => i.isim === 'Makas').kazanc, 300);
  assert.ok(!JSON.stringify(r.v).includes('905321'), 'esnaf telefonu bayi paneline gitmez');
  assert.strictEqual(r.v.odemeler[0].tutar, 200);

  r = res(); await c.panel(req({ params: { token: 'f'.repeat(32) } }), r);
  assert.strictEqual(r.kod, 404);
  r = res(); await c.guncelle(req({ params: { id: 1 }, body: { yeni_link: true } }), r);
  assert.notStrictEqual(r.v.bayi.token, b.token, 'link yenilenince eskisi çalışmaz');
  const eski = res(); await c.panel(req({ params: { token: b.token } }), eski);
  assert.strictEqual(eski.kod, 404);
  r = res(); await c.guncelle(req({ params: { id: 1 }, body: { aktif: false } }), r);
  const kapali = res(); await c.panel(req({ params: { token: r.v.bayi.token } }), kapali);
  assert.strictEqual(kapali.kod, 404, 'kapatılan bayinin paneli açılmaz');
  assert.strictEqual(await bayi.kayittaUygula(1, 4), null);
});

test('yetki: bayi yönetimi ödemeler yetkisinde, bayi paneli herkese açık', async () => {
  await ortam;
  const { yolYetkisi } = require(SRC + '/config/ekip');
  assert.strictEqual(yolYetkisi('GET', '/api/admin/bayiler'), 'odemeler');
  assert.strictEqual(yolYetkisi('POST', '/api/admin/bayiler/3/odeme'), 'odemeler');
});
