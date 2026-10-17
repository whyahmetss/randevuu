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
