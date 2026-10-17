// Mağaza / Vitrin ayrımı (2026-10-17): SıraGO'nun esnafa sattığı ilan (Vitrin) esnafın "müşteriye öner" listesine düşmez
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('vitrin ilanı Mağaza öneri listesinde yok, önerilemez; vitrinde görünür', async () => {
  await hazirla(`
    CREATE TABLE magaza_tedarikciler (id SERIAL PRIMARY KEY, isim TEXT, aktif BOOLEAN DEFAULT true, berber_komisyon_yuzde NUMERIC, sirago_komisyon_yuzde NUMERIC, iletisim TEXT);
    CREATE TABLE magaza_urunler (id SERIAL PRIMARY KEY, tedarikci_id INT, isim TEXT, aciklama TEXT, gorsel_url TEXT, gorsel_veri TEXT, fiyat NUMERIC, eski_fiyat NUMERIC,
      stok INT, urun_url TEXT, kategori TEXT, aktif BOOLEAN DEFAULT true, hedef VARCHAR(10) DEFAULT 'musteri', sira INT DEFAULT 0, kisisel_qr BOOLEAN,
      olusturma TIMESTAMP DEFAULT NOW(), guncelleme TIMESTAMP);
    CREATE TABLE magaza_isletme_kodlari (id SERIAL, tedarikci_id INT, isletme_id INT, indirim_kodu TEXT);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT);
    INSERT INTO isletmeler (isim) VALUES ('Elit');
    INSERT INTO magaza_tedarikciler (isim, berber_komisyon_yuzde) VALUES ('SıraGO', 0), ('Şampuancı', 10);
    INSERT INTO magaza_urunler (tedarikci_id, isim, fiyat, hedef, urun_url) VALUES (1, 'Kilitli Tablet Standı', 16900, 'esnaf', NULL), (2, 'Bakım Şampuanı', 300, 'musteri', 'https://x.com/s');`);
  const res = () => { const r = {}; r.json = (v) => { r.v = v; return r; }; r.status = (k) => { r.kod = k; return r; }; return r; };
  const req = (ek = {}) => ({ kullanici: { isletme_id: 1 }, body: {}, ...ek });
  const m = require(SRC + '/controllers/magazaController');
  let r = res(); await m.urunleriGetir(req(), r);
  assert.deepStrictEqual(r.v.urunler.map(u => u.isim), ['Bakım Şampuanı']);
  r = res(); await m.oner(req({ body: { urun_id: 1 } }), r);
  assert.strictEqual(r.kod, 404, 'vitrin ilanı önerilemez');
  const v = require(SRC + '/controllers/vitrinController');
  r = res(); await v.vitrin(req(), r);
  assert.deepStrictEqual(r.v.urunler.map(u => u.isim), ['Kilitli Tablet Standı']);
});

test('vitrin yönetimi: sipariş kargo/ödeme güncellenir, aylık özet demoyu saymaz, siparişli ilan silinmez yayından kalkar', async () => {
  const fs = require('fs');
  const pool = require(SRC + '/config/db');
  await pool.query(`ALTER TABLE isletmeler ADD COLUMN demo BOOLEAN DEFAULT false, ADD COLUMN telefon TEXT, ADD COLUMN ilce TEXT`);
  await pool.query(`CREATE TABLE magaza_siparisler (id SERIAL PRIMARY KEY, isletme_id INT NOT NULL, urun_id INT NOT NULL, adet INT NOT NULL DEFAULT 1,
    tutar NUMERIC(10,2), notu TEXT, durum VARCHAR(20) NOT NULL DEFAULT 'yeni', olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  for (const q of fs.readFileSync(SRC + '/migrations/060_vitrin_siparis.sql', 'utf8').split(';').filter(x => x.trim() && !x.trim().startsWith('--') || x.includes('ALTER'))) await pool.query(q);
  await pool.query(`INSERT INTO isletmeler (isim, demo) VALUES ('SıraGO Demo Berber', true)`);
  await pool.query(`INSERT INTO magaza_siparisler (isletme_id, urun_id, adet, tutar) VALUES (1, 1, 2, 33800), (2, 1, 1, 16900)`);
  const res = () => { const r = {}; r.json = (v) => { r.v = v; return r; }; r.status = (k) => { r.kod = k; return r; }; return r; };
  const v = require(SRC + '/controllers/vitrinController');
  let r = res(); await v.siparisGuncelle({ params: { id: 1 }, body: { odeme_durumu: 'odendi', kargo_firma: 'Yurtiçi', kargo_takip: 'YT123' } }, r);
  assert.deepStrictEqual([r.v.siparis.odeme_durumu, r.v.siparis.kargo_takip], ['odendi', 'YT123']);
  r = res(); await v.siparisGuncelle({ params: { id: 1 }, body: { durum: 'uçtu' } }, r);
  assert.strictEqual(r.kod, 400);
  r = res(); await v.ozet({ query: {} }, r);
  assert.deepStrictEqual([r.v.toplam.siparis, r.v.toplam.adet, r.v.toplam.ciro, r.v.toplam.tahsil], [1, 2, 33800, 33800], 'demo siparişi sayılmadı');
  assert.deepStrictEqual(r.v.urunler.map(u => [u.isim, u.adet]), [['Kilitli Tablet Standı', 2]]);
  r = res(); await v.ilanlar({}, r);
  assert.strictEqual(r.v.ilanlar[0].satilan, 2);
  r = res(); await v.ilanSil({ params: { id: 1 } }, r);
  assert.strictEqual(r.v.pasif, true);
  assert.strictEqual((await pool.query('SELECT aktif FROM magaza_urunler WHERE id = 1')).rows[0].aktif, false);
});
