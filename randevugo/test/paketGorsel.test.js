// Paket ödeme görseli (2026-10-15): Paket Yönetimi'nden yüklenen görsel Shopier ürününde kullanılır; yoksa Fiko.
// Eskiden her ödemede sabit, yabancı bir tişört fotoğrafı gidiyordu (bazen açılmıyordu).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const cevap = () => {
  const r = { kod: 200, govde: null, basliklar: {} };
  r.status = (k) => { r.kod = k; return r; };
  r.json = (g) => { r.govde = g; return r; };
  r.set = (k, v) => { r.basliklar[k] = v; return r; };
  r.send = (g) => { r.govde = g; return r; };
  r.end = () => r;
  return r;
};
const PNG = 'data:image/png;base64,' + Buffer.from('sahte-png').toString('base64');

test('paket görseli: yüklenir, sunulur, Shopier ürününde kullanılır; kaldırılınca Fiko', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, paket TEXT, grup_id INT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
      paket_bitis_tarihi TIMESTAMP, bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT, bekleyen_sure VARCHAR(5), oncu_no INT, kilitli_paket TEXT, kilitli_fiyat NUMERIC);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, odeme_yontemi TEXT, referans_kodu TEXT, shopier_urun_id TEXT);
    CREATE UNIQUE INDEX ON odemeler (isletme_id, donem);
    CREATE TABLE paket_tanimlari (id SERIAL PRIMARY KEY, kod TEXT, isim TEXT, fiyat NUMERIC, aktif BOOLEAN DEFAULT true, sira INT DEFAULT 0);
    ${fs.readFileSync(path.join(SRC, 'migrations', '049_paket_gorsel.sql'), 'utf8')}
    INSERT INTO paket_tanimlari (kod, isim, fiyat) VALUES ('baslangic', 'Başlangıç', 299);
    INSERT INTO isletmeler (isim, paket, paket_bitis_tarihi) VALUES ('Kemal', 'baslangic', NOW());`);
  sahte('services/socketServer', { emitToAdmin() {}, emitToIsletme() {} });
  sahte('services/pushService', { sendToAdmin() {}, sendToIsletme() {} });
  const ctrl = require(path.join(SRC, 'controllers', 'adminController'));
  const s = require(path.join(SRC, 'services', 'shopierService'));
  const urunler = [];
  s.urunOlustur = async (u) => { urunler.push(u); return { id: 'U' + urunler.length, url: 'https://shopier/x' }; };
  s.urunSil = async () => {};

  // Görsel yok → varsayılan (gorselUrl boş → urunOlustur Fiko'yu kullanır)
  await s.odemeBaslat(1, 'baslangic');
  assert.equal(urunler[0].gorselUrl, null);

  // Geçersiz görsel reddedilir
  let r = cevap();
  await ctrl.paketGorselKaydet({ params: { id: 1 }, body: { veri: 'http://kotu' }, kullanici: {} }, r);
  assert.equal(r.kod, 400);

  // Yükle → liste görsel verisini göndermez, var bilgisini gönderir
  r = cevap();
  await ctrl.paketGorselKaydet({ params: { id: 1 }, body: { veri: PNG }, kullanici: {} }, r);
  assert.equal(r.kod, 200);
  r = cevap();
  await ctrl.paketTanimlariGetir({}, r);
  assert.equal(r.govde.paketler[0].gorsel_var, true);
  assert.equal(r.govde.paketler[0].gorsel, undefined);

  // Herkese açık adres görseli döner
  r = cevap();
  await ctrl.paketGorsel({ params: { kod: 'baslangic' } }, r);
  assert.equal(r.basliklar['Content-Type'], 'image/png');
  assert.equal(Buffer.from(r.govde).toString(), 'sahte-png');

  // Shopier ürünü bu görselin adresiyle açılır
  await s.odemeBaslat(1, 'baslangic');
  assert.match(urunler[1].gorselUrl, /\/api\/paket-gorsel\/baslangic\?v=\d+$/);

  // Varsayılana dön
  r = cevap();
  await ctrl.paketGorselKaydet({ params: { id: 1 }, body: { veri: null }, kullanici: {} }, r);
  await s.odemeBaslat(1, 'baslangic');
  assert.equal(urunler[2].gorselUrl, null);
});
