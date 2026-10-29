// Hizmet kategorileri ve zengin randevu sayfası (2026-10-26): 80 hizmetli salon tek uzun liste olmasın.
// Kategori her pakette; öne çıkan hizmetler Pro+ ve üstünde; toplu ekleme aynı adı atlar, paket limitini aşmaz.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

async function ortam(paket) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, paket TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, isim_en TEXT, isim_ar TEXT, sure_dk INT, fiyat NUMERIC DEFAULT 0,
      aciklama TEXT, emoji TEXT, kapora_yuzdesi INT DEFAULT 0, tampon_dk INT DEFAULT 0, seans_sayisi INT, seans_aralik_gun INT, aktif BOOLEAN DEFAULT true);
    INSERT INTO isletmeler (isim, slug, paket) VALUES ('Villa', 'villa', '${paket}');`);
  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '070_hizmet_kategori.sql'), 'utf8'));
  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '078_hizmet_kart_fiyat.sql'), 'utf8'));
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  const booking = require(path.join(SRC, 'controllers', 'bookingController'));
  const cagir = async (fn, req) => { let durum = 200, govde; await fn({ kullanici: { isletme_id: 1 }, params: {}, body: {}, ...req }, { status(k) { durum = k; return this; }, json(g) { govde = g; } }); return { durum, govde }; };
  return { db, admin, booking, cagir };
}

test('toplu ekleme: kategoriyle eklenir, aynı ad atlanır, süre/fiyat temizlenir', async () => {
  const { db, admin, cagir } = await ortam('proplus');
  const r = await cagir(admin.hizmetTopluEkle.bind(admin), { body: { hizmetler: [
    { isim: 'Saç kesim', sure_dk: 45, fiyat: '300', kategori: ' Saç ' },
    { isim: 'saç KESİM', sure_dk: 45, kategori: 'Saç' },
    { isim: 'Ombre', sure_dk: 'x', fiyat: '1.500,50'.replace('.', ''), kategori: 'Renk' },
    { isim: '   ' },
  ] } });
  assert.equal(r.durum, 200);
  assert.deepEqual(r.govde, { eklenen: 2, atlanan: 1 });
  const h = (await db.query('SELECT isim, sure_dk, fiyat, kategori FROM hizmetler ORDER BY id')).rows;
  assert.deepEqual(h.map(x => [x.isim, x.sure_dk, Number(x.fiyat), x.kategori]), [['Saç kesim', 45, 300, 'Saç'], ['Ombre', 30, 1500.5, 'Renk']]);
});

test('toplu ekleme paket limitini aşamaz, hiçbiri eklenmez', async () => {
  const { db, admin, cagir } = await ortam('baslangic'); // 10 hizmet sınırı
  const hizmetler = Array.from({ length: 11 }, (_, i) => ({ isim: 'Hizmet ' + i }));
  const r = await cagir(admin.hizmetTopluEkle.bind(admin), { body: { hizmetler } });
  assert.equal(r.durum, 403);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM hizmetler')).rows[0].n, 0);
});

test('randevu sayfası: Pro+ öne çıkanları görür; alt pakette öne çıkarma yok sayılır', async () => {
  for (const [paket, beklenen] of [['proplus', true], ['kurumsal', true], ['profesyonel', false], ['baslangic', false]]) {
    const { db, booking, cagir } = await ortam(paket);
    await db.query("INSERT INTO hizmetler (isletme_id, isim, sure_dk, kategori, one_cikan) VALUES (1, 'Keratin', 120, 'Bakım', true)");
    const r = await cagir(booking.hizmetleriGetir.bind(booking), { params: { slug: 'villa' } });
    assert.equal(r.govde.zengin, beklenen, paket);
    assert.equal(r.govde.hizmetler[0].one_cikan, beklenen, paket);
    assert.equal(r.govde.hizmetler[0].kategori, 'Bakım');
  }
});

test('panel: öne çıkarma yalnız Pro+ ve üstünde kaydedilir; hızlı fiyat düzenlemesi kategoriyi silmez', async () => {
  const alt = await ortam('profesyonel');
  const e = await alt.cagir(alt.admin.hizmetEkle.bind(alt.admin), { body: { isim: 'Fön', sure_dk: 30, fiyat: 200, kategori: 'Saç', one_cikan: true } });
  assert.equal(e.govde.hizmet.one_cikan, false);
  assert.equal(e.govde.hizmet.kategori, 'Saç');

  const ust = await ortam('proplus');
  const e2 = await ust.cagir(ust.admin.hizmetEkle.bind(ust.admin), { body: { isim: 'Fön', sure_dk: 30, fiyat: 200, kategori: 'Saç', one_cikan: true } });
  assert.equal(e2.govde.hizmet.one_cikan, true);
  const g = await ust.cagir(ust.admin.hizmetGuncelle.bind(ust.admin), { params: { id: e2.govde.hizmet.id }, body: { isim: 'Fön', sure_dk: 30, fiyat: 250, aktif: true } });
  assert.equal(g.govde.hizmet.kategori, 'Saç');
  assert.equal(g.govde.hizmet.one_cikan, true);
  const g2 = await ust.cagir(ust.admin.hizmetGuncelle.bind(ust.admin), { params: { id: e2.govde.hizmet.id }, body: { isim: 'Fön', sure_dk: 30, fiyat: 250, aktif: true, kategori: '', one_cikan: false } });
  assert.equal(g2.govde.hizmet.kategori, null);
  assert.equal(g2.govde.hizmet.one_cikan, false);
});
