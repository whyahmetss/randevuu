// Shopier ödemesi (2026-10-23, Medinnessa: kartla 499₺ ödedi, paket Başlangıç'ta kaldı).
// Elle "✓ Öde" seçilen paketi uygular; sonra gelen webhook ikinci kez işlemez; referansla eşleşen webhook da paketi uygular.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

async function ortam() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, paket TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false, grup_id INT,
      paket_bitis_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, son_odeme_sure VARCHAR(5), bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT,
      bekleyen_sure TEXT, bekleyen_kupon_id INT, oncu_no INT, kilitli_paket TEXT, kilitli_fiyat NUMERIC,
      referans_ile_gelen INT, referans_odeme_tetiklendi BOOLEAN DEFAULT false);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, odeme_yontemi TEXT, odeme_tarihi TIMESTAMP,
      shopier_siparis_id TEXT, shopier_urun_id TEXT, referans_kodu TEXT, kupon_kodu TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE UNIQUE INDEX odemeler_isletme_donem ON odemeler (isletme_id, donem) WHERE isletme_id IS NOT NULL;
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, email TEXT, isletme_id INT);
    CREATE TABLE paket_tanimlari (kod TEXT, isim TEXT, fiyat NUMERIC);
    INSERT INTO isletmeler (isim, telefon, paket, deneme_bitis_tarihi, bekleyen_paket, bekleyen_shopier_urun_id)
      VALUES ('Medinnessa', '905546114548', 'baslangic', NOW() + INTERVAL '14 days', 'profesyonel', '777');`);
  const buAy = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
  await db.query(`INSERT INTO odemeler (isletme_id, tutar, donem, durum, odeme_yontemi, referans_kodu, shopier_urun_id) VALUES (1, 499, $1, 'odeme_bekliyor', 'shopier', 'SRGO-1', '777')`, [buAy]);
  sahte('services/socketServer', { emitToAdmin() {}, emitToIsletme() {} });
  sahte('services/pushService', { sendToAdmin() {}, sendToIsletme() {} });
  sahte('services/odemeOtomasyon', { odemeAlindiBildir() {} });
  sahte('utils/oncu', { oncuOdeme: async () => null, etkinFiyat: (i, p, f) => f });
  sahte('utils/alarm', { alarm() {} });
  const shopier = require(path.join(SRC, 'services', 'shopierService'));
  shopier.urunSil = async () => {};
  return { db, shopier };
}
const isletme = async (db) => (await db.query('SELECT paket, bekleyen_paket, paket_bitis_tarihi FROM isletmeler WHERE id = 1')).rows[0];

test('elle "✓ Öde": seçilen paket (Standart) uygulanır, 30 gün; sonra gelen webhook ikinci kez işlemez', async () => {
  const { db, shopier } = await ortam();
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  admin.auditLogYaz = async () => {};
  let c; await admin.odemeGuncelle({ params: { id: '1' }, body: { durum: 'odendi' }, kullanici: {} }, { json: (x) => { c = x; }, status() { return this; } });
  assert.equal(c.odeme.durum, 'odendi');
  let i = await isletme(db);
  assert.equal(i.paket, 'profesyonel');
  assert.equal(i.bekleyen_paket, null);
  const bitis = new Date(i.paket_bitis_tarihi).getTime();
  assert.ok(Math.abs(bitis - (Date.now() + 30 * 864e5)) < 864e5);

  const r = await shopier.siparisGeldi({ id: 611720117, paymentStatus: 'paid', lineItems: [{ productId: '777', title: 'SıraGO Standart Paket [SRGO-1]' }], totals: { grandTotal: '499.00' } });
  assert.equal(r.islem, 'zaten_islenmis');
  i = await isletme(db);
  assert.equal(new Date(i.paket_bitis_tarihi).getTime(), bitis, 'süre ikinci kez uzamaz');
  const o = (await db.query('SELECT tutar, shopier_siparis_id FROM odemeler WHERE id = 1')).rows[0];
  assert.equal(Number(o.tutar), 499);
  assert.equal(o.shopier_siparis_id, '611720117');
});

test('webhook: ürün kimliği tutmasa da [SRGO-1] referansıyla eşleşir ve seçilen paket uygulanır', async () => {
  const { db, shopier } = await ortam();
  const r = await shopier.siparisGeldi({ id: 5, paymentStatus: 'paid', lineItems: [{ id: 'satir-1', title: 'SıraGO Standart Paket [SRGO-1]' }], totals: { grandTotal: '499.00' } });
  assert.equal(r.islem, 'basarili');
  assert.equal((await isletme(db)).paket, 'profesyonel');
  assert.equal((await db.query('SELECT durum FROM odemeler WHERE id = 1')).rows[0].durum, 'odendi');
});

test('webhook imzası: hex, base64 ve "sha256=" önekli kabul; yanlışı red', async () => {
  const { shopier } = await ortam();
  shopier.webhookToken = 'gizli';
  const govde = '{"id":1}';
  const mac = crypto.createHmac('sha256', 'gizli').update(govde).digest();
  assert.equal(shopier.webhookDogrula(govde, mac.toString('hex')), true);
  assert.equal(shopier.webhookDogrula(govde, mac.toString('base64')), true);
  assert.equal(shopier.webhookDogrula(govde, 'sha256=' + mac.toString('hex')), true);
  assert.equal(shopier.webhookDogrula(govde, crypto.createHmac('sha256', 'baska').update(govde).digest('hex')), false);
  assert.equal(shopier.webhookDogrula(govde, 'bozuk'), false);
});
