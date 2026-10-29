// Kart fiyatı (2026-10-29): Esse Man gibi nakit ve kartla fiyatı farklı dükkânlar. fiyat = nakit (ana) fiyat,
// kart_fiyat panelde girilir; randevu sayfasında ve botta "1.800₺ nakit · 2.100₺ kart" diye görünür.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

async function ortam() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, paket TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, isim_en TEXT, isim_ar TEXT, sure_dk INT, fiyat NUMERIC DEFAULT 0,
      aciklama TEXT, emoji TEXT, kapora_yuzdesi INT DEFAULT 0, tampon_dk INT DEFAULT 0, seans_sayisi INT, seans_aralik_gun INT, aktif BOOLEAN DEFAULT true);
    INSERT INTO isletmeler (isim, slug, paket) VALUES ('Esse Man', 'esseman', 'profesyonel');`);
  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '070_hizmet_kategori.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '078_hizmet_kart_fiyat.sql'), 'utf8'));
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  const booking = require(path.join(SRC, 'controllers', 'bookingController'));
  const cagir = async (fn, req) => { let durum = 200, govde; await fn({ kullanici: { isletme_id: 1 }, params: {}, body: {}, ...req }, { status(k) { durum = k; return this; }, json(g) { govde = g; } }); return { durum, govde }; };
  return { db, admin, booking, cagir };
}

test('kart fiyatı: yardımcılar', () => {
  const k = require(path.join(SRC, 'utils', 'kartFiyat'));
  const fmt = (x) => Number(x).toLocaleString('tr-TR');
  assert.strictEqual(k.kartVar({ fiyat: 1800, kart_fiyat: 2100 }), true);
  assert.strictEqual(k.kartVar({ fiyat: 1800, kart_fiyat: 1800 }), false, 'aynı fiyat gösterilmez');
  assert.strictEqual(k.kartVar({ fiyat: 0, kart_fiyat: 2100 }), false, 'nakit fiyatı yoksa (fiyat dükkânda) kart da yazılmaz');
  assert.strictEqual(k.kartVar({ fiyat: 1800, kart_fiyat: null }), false);
  assert.strictEqual(k.kartEki({ fiyat: 1800, kart_fiyat: 2100 }, fmt), ' nakit · 2.100 TL kart');
  assert.strictEqual(k.kartEki({ fiyat: 1800, kart_fiyat: 2100 }, fmt, 'en'), ' cash · 2.100 TL card');
  assert.strictEqual(k.fiyatYazi({ fiyat: 1800, kart_fiyat: 2100 }), '1.800₺ nakit · 2.100₺ kart');
  assert.strictEqual(k.fiyatYazi({ fiyat: 1000 }), '1.000₺');
  assert.strictEqual(k.kartTemiz(''), null);
  assert.strictEqual(k.kartTemiz('0'), null);
  assert.strictEqual(k.kartTemiz('2100,5'), 2100.5);
});

test('kart fiyatı: panelden eklenir, hızlı fiyat düzenlemesi silmez, boş gönderilince kalkar; toplu eklemede 4. sütun', async () => {
  const { db, admin, booking, cagir } = await ortam();
  const e = await cagir(admin.hizmetEkle.bind(admin), { body: { isim: 'Saç', sure_dk: 45, fiyat: 1800, kart_fiyat: '2100' } });
  assert.strictEqual(Number(e.govde.hizmet.kart_fiyat), 2100);
  const id = e.govde.hizmet.id;

  // Bugün ekranındaki hızlı fiyat düzenlemesi kart_fiyat göndermez
  await cagir(admin.hizmetGuncelle.bind(admin), { params: { id }, body: { isim: 'Saç', sure_dk: 45, fiyat: 1900, aktif: true } });
  assert.strictEqual(Number((await db.query('SELECT kart_fiyat FROM hizmetler WHERE id = $1', [id])).rows[0].kart_fiyat), 2100);
  await cagir(admin.hizmetGuncelle.bind(admin), { params: { id }, body: { isim: 'Saç', sure_dk: 45, fiyat: 1900, aktif: true, kart_fiyat: null } });
  assert.strictEqual((await db.query('SELECT kart_fiyat FROM hizmetler WHERE id = $1', [id])).rows[0].kart_fiyat, null);

  await cagir(admin.hizmetTopluEkle.bind(admin), { body: { hizmetler: [{ isim: 'Sakal', sure_dk: 20, fiyat: 1000, kart_fiyat: 1200 }, { isim: 'Perma' }] } });
  const r = await cagir(booking.hizmetleriGetir.bind(booking), { params: { slug: 'esseman' } });
  const sakal = r.govde.hizmetler.find(h => h.isim === 'Sakal');
  assert.strictEqual(Number(sakal.kart_fiyat), 1200, 'randevu sayfasına kart fiyatı gider');
  assert.strictEqual(r.govde.hizmetler.find(h => h.isim === 'Perma').kart_fiyat, null);
});

test('kart fiyatı: bot listesi, seçim ve özet (tr/en), yapay zekâ bilgisi', () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC)) delete require.cache[k];
  const M = require(path.join(SRC, 'utils', 'botMesajlar'));
  const fmt = (x) => Number(x).toLocaleString('tr-TR');
  const isletme = { isim: 'Esse Man', kategori: 'berber', bot_konusma_stili: 'samimi' };
  const hizmetler = [{ isim: 'Saç', sure_dk: 45, fiyat: 1800, kart_fiyat: 2100 }, { isim: 'Saç-Sakal VIP', sure_dk: 60, fiyat: 4000 }];
  const liste = M.get(isletme, 'hizmetListesi', { isletmeAd: 'Esse Man', hizmetler, fiyatFormat: fmt });
  assert.match(liste, /Saç - 45dk - 1\.800 TL nakit · 2\.100 TL kart/);
  assert.match(liste, /Saç-Sakal VIP - 60dk - 4\.000 TL\n/, 'kart farkı olmayan hizmete ek yok');
  assert.match(M.get(isletme, 'hizmetSecildi', { hizmetAd: 'Saç', sureDk: 45, fiyat: '1.800', kartFiyat: '2.100' }), /Ücret: 1\.800 TL nakit · 2\.100 TL kart/);
  assert.match(M.get(isletme, 'randevuOzet', { isletmeAd: 'Esse Man', hizmetAd: 'Saç', tarihStr: 'Yarın', saatStr: '15:00', fiyat: '1.800', kartFiyat: '2.100' }), /1\.800 TL nakit · 2\.100 TL kart/);
  assert.doesNotMatch(M.get(isletme, 'randevuOzet', { isletmeAd: 'Esse Man', hizmetAd: 'VIP', tarihStr: 'Yarın', saatStr: '15:00', fiyat: '4.000' }), /kart/);
  const en = M.get({ ...isletme, bot_diller: 'tr,en', _musteriDil: 'en' }, 'hizmetListesi', { isletmeAd: 'Esse Man', hizmetler, fiyatFormat: fmt }, null, 'en');
  assert.match(en, /1\.800 TL cash · 2\.100 TL card/);
  const { yzHizmet } = require(path.join(SRC, 'utils', 'hizmetNotu'));
  assert.match(yzHizmet(hizmetler[0]), /nakit 1800 TL, kartla 2100 TL/);
});
