// Bildirim Merkezi (2026-10-17): demo dükkânlar "ödeme yapmadı"/"yeni işletme" üretmez; denemesi süren işletme ödeme gecikmesi sayılmaz
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('bildirim merkezi: demo ve denemedeki işletme yanlış uyarı üretmez', async () => {
  await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT, kategori TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
      grup_id INT, olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, paket_bitis_tarihi TIMESTAMP);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE randevular (id SERIAL, isletme_id INT, tarih DATE);
    INSERT INTO isletmeler (isim, paket, kategori, demo, olusturma_tarihi, deneme_bitis_tarihi, paket_bitis_tarihi) VALUES
      ('SıraGO Demo Berber', 'profesyonel', 'berber', true, NOW() - INTERVAL '30 days', NOW() - INTERVAL '20 days', NULL),
      ('Demo Kuaför', 'baslangic', 'kuafor', true, NOW() - INTERVAL '1 day', NOW() + INTERVAL '13 days', NULL),
      ('Elit Barber', 'baslangic', 'berber', false, NOW() - INTERVAL '2 days', NOW() + INTERVAL '4 days', NULL),
      ('Bitti Ödemedi', 'baslangic', 'berber', false, NOW() - INTERVAL '40 days', NOW() - INTERVAL '26 days', NULL),
      ('Yarın Bitiyor', 'baslangic', 'berber', false, NOW() - INTERVAL '13 days', NOW() + INTERVAL '1 day', NULL);`);
  const c = require(SRC + '/controllers/adminController');
  const r = {}; await c.bildirimMerkezi({ kullanici: { rol: 'superadmin' } }, { json: (v) => { r.v = v; }, status: () => ({ json: (v) => { r.v = v; } }) });
  const b = r.v.bildirimler;
  const tip = (t) => b.filter(x => x.tip === t).map(x => x.baslik).sort();
  assert.deepStrictEqual(tip('odeme_gecikme'), ['Bitti Ödemedi ödeme yapmadı']);
  assert.deepStrictEqual(tip('deneme_bitiyor'), ['Yarın Bitiyor deneme süresi bitiyor']);
  assert.ok(!JSON.stringify(b).includes('Demo'), 'demo dükkân hiçbir bildirimde yok');
  assert.deepStrictEqual(tip('yeni_kayit'), ['Yeni işletme: Elit Barber'], 'son 7 günün gerçek kaydı; demo yok');
});
