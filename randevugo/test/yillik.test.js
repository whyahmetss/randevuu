// Yıllık ödeme: 12 ay kullan, 9 ay öde. Ürün 9 aylık fiyatla açılır, ödenince bitiş 365 gün uzar; aylık 30 gün.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

test('yıllık ödeme: 9 ay fiyat, 365 gün; aylık 30 gün', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, paket TEXT, grup_id INT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
      paket_bitis_tarihi TIMESTAMP, bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT, bekleyen_sure VARCHAR(5), bekleyen_kupon_id INT, son_odeme_sure VARCHAR(5),
      oncu_no INT, kilitli_paket TEXT, kilitli_fiyat NUMERIC, referans_ile_gelen INT, referans_odeme_tetiklendi BOOLEAN);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, odeme_yontemi TEXT, referans_kodu TEXT,
      shopier_urun_id TEXT, shopier_siparis_id TEXT, odeme_tarihi TIMESTAMP);
    CREATE UNIQUE INDEX ON odemeler (isletme_id, donem) WHERE isletme_id IS NOT NULL;
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, email TEXT, isletme_id INT);
    INSERT INTO isletmeler (isim, paket, paket_bitis_tarihi, oncu_no) VALUES ('Kemal', 'baslangic', NOW(), 1), ('Ali', 'baslangic', NOW(), 2);`);
  sahte('services/socketServer', { emitToAdmin() {}, emitToIsletme() {} });
  sahte('services/pushService', { sendToAdmin() {}, sendToIsletme() {} });
  sahte('services/odemeOtomasyon', { odemeAlindiBildir() {} });
  const s = require(path.join(SRC, 'services', 'shopierService'));
  const urunler = [];
  s.urunOlustur = async (u) => { urunler.push(u); return { id: 'U' + urunler.length, url: 'https://shopier/x' }; };
  s.urunSil = async () => {};

  await s.odemeBaslat(1, 'baslangic', 'yil');
  assert.equal(urunler[0].fiyat, 299 * 9);
  assert.match(urunler[0].baslik, /Yıllık/);
  await s.siparisGeldi({ id: 'S1', paymentStatus: 'paid', lineItems: [{ id: 'U1', title: urunler[0].baslik }], totals: { grandTotal: String(299 * 9) } });

  await s.odemeBaslat(2, 'baslangic');
  assert.equal(urunler[1].fiyat, 299);
  await s.siparisGeldi({ id: 'S2', paymentStatus: 'paid', lineItems: [{ id: 'U2', title: urunler[1].baslik }], totals: { grandTotal: '299' } });

  const gun = (await db.query(`SELECT id, ROUND(EXTRACT(EPOCH FROM (paket_bitis_tarihi - NOW())) / 86400) AS g, bekleyen_sure FROM isletmeler ORDER BY id`)).rows;
  assert.equal(Number(gun[0].g), 365);
  assert.equal(Number(gun[1].g), 30);
  assert.equal(gun[0].bekleyen_sure, null);
});
