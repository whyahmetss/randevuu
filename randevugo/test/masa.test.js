const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, rol TEXT, aktif BOOLEAN DEFAULT true,
      ekip_gorev TEXT, ekip_yetkileri TEXT[], son_giris TIMESTAMP);
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, telefon TEXT, sehir TEXT, ilce TEXT, kategori TEXT,
      puan NUMERIC, yorum_sayisi INT, web_sitesi TEXT, google_maps_url TEXT, skor INT, durum TEXT DEFAULT 'yeni', notlar TEXT,
      arama_tarihi TIMESTAMP, sonraki_arama TIMESTAMP, wp_mesaj_durumu TEXT, demo_isletme_id INT);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, demo BOOLEAN DEFAULT false, grup_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, lead_id INT, kayit_isletme_id INT, telefon TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE odemeler (id SERIAL, isletme_id INT, durum TEXT);
    INSERT INTO admin_kullanicilar (isim, email, rol) VALUES ('Ahmet', 'a@x', 'superadmin'), ('Ali', 'b@x', 'superadmin'), ('Mete', 'c@x', 'superadmin');
    INSERT INTO potansiyel_musteriler (isletme_adi, telefon, skor) SELECT 'Dükkan ' || g, '0532' || g, 100 - g FROM generate_series(1, 25) g;
    INSERT INTO potansiyel_musteriler (isletme_adi, telefon, skor, wp_mesaj_durumu) VALUES ('Bot yazdı', '0533', 999, 'gonderildi');`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/030_satis_masasi.sql', 'utf8'));
  return o;
})();

const req = (id, ek = {}) => ({ kullanici: { id, rol: 'superadmin', ekip_yetkileri: null, patron: id === 1 }, body: {}, params: {}, query: {}, ...ek });
const res = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.v = v; return r; }; return r; };

test('patron: ilk süper admin patron olur; ekip yönetimi ve takibi yalnız onda, kurucu arkadaşlar göremez', async () => {
  const { db } = await ortam;
  assert.deepStrictEqual((await db.query('SELECT id FROM admin_kullanicilar WHERE patron')).rows.map(r => r.id), [1]);
  const { yolYetkisi, yetkiVar } = require(SRC + '/config/ekip');
  const patron = { rol: 'superadmin', ekip_yetkileri: null, patron: true };
  const kurucu = { rol: 'superadmin', ekip_yetkileri: null, patron: false };
  const satis = { rol: 'superadmin', ekip_yetkileri: ['genel', 'satis'], patron: false };
  for (const [m, u] of [['GET', '/api/admin/ekip'], ['GET', '/api/admin/ekip-takip'], ['GET', '/api/admin/audit-log'], ['DELETE', '/api/admin/isletmeler/5'], ['PUT', '/api/admin/masa/hedef'], ['DELETE', '/api/admin/masa/itiraz/3']]) {
    const y = yolYetkisi(m, u);
    assert.strictEqual(yetkiVar(patron, y), true, u);
    assert.strictEqual(yetkiVar(kurucu, y), false, `kurucu ${m} ${u}`);
  }
  for (const u of ['/api/admin/masa/ozet', '/api/admin/masa/listem', '/api/admin/avci/gunluk']) assert.strictEqual(yetkiVar(satis, yolYetkisi('GET', u)), true, u);
  assert.strictEqual(yetkiVar(satis, yolYetkisi('POST', '/api/admin/masa/itirazlar')), true, 'itiraz eklemek herkese açık');
  assert.strictEqual(yetkiVar(kurucu, yolYetkisi('GET', '/api/admin/odemeler')), true, 'kurucu geri kalan her şeyi görür');
});

test('aday çekme: iki kişi aynı adayı alamaz, botun yazdığı aday çekilmez, en yüksek skor önce', async () => {
  const { db } = await ortam;
  const m = require(SRC + '/controllers/masaController');
  const r1 = res(); await m.cek(req(2, { body: { adet: 10 } }), r1);
  const r2 = res(); await m.cek(req(3, { body: { adet: 10 } }), r2);
  assert.deepStrictEqual([r1.v.cekilen, r2.v.cekilen], [10, 10]);
  const cakisan = (await db.query('SELECT COUNT(*)::int n FROM potansiyel_musteriler WHERE atanan_id IS NOT NULL GROUP BY id HAVING COUNT(*) > 1')).rows;
  assert.strictEqual(cakisan.length, 0);
  assert.strictEqual((await db.query("SELECT atanan_id FROM potansiyel_musteriler WHERE isletme_adi = 'Bot yazdı'")).rows[0].atanan_id, null);
  assert.strictEqual((await db.query("SELECT atanan_id FROM potansiyel_musteriler WHERE isletme_adi = 'Dükkan 1'")).rows[0].atanan_id, 2);
});

test('arama sonucu: aktivite yazılır, ulaşılamayan yarına düşer, kuruldu işletmeyi üyeye yazar, başkasının adayı kaydedilemez', async () => {
  const { db } = await ortam;
  const m = require(SRC + '/controllers/masaController');
  const ali = (await db.query('SELECT id FROM potansiyel_musteriler WHERE atanan_id = 2 ORDER BY id LIMIT 3')).rows.map(r => r.id);
  let r = res(); await m.sonuc(req(2, { params: { id: ali[0] }, body: { tip: 'arama_yok' } }), r);
  assert.strictEqual(r.v.ok, true);
  const l0 = (await db.query('SELECT durum, sonraki_arama FROM potansiyel_musteriler WHERE id = $1', [ali[0]])).rows[0];
  assert.strictEqual(l0.durum, 'cevapsiz');
  assert.ok(new Date(l0.sonraki_arama) > new Date());

  await db.query("INSERT INTO isletmeler (isim) VALUES ('Dükkan kuruldu')");
  await db.query('UPDATE potansiyel_musteriler SET demo_isletme_id = 1 WHERE id = $1', [ali[1]]);
  r = res(); await m.sonuc(req(2, { params: { id: ali[1] }, body: { tip: 'kurulum', notu: 'QR kart bırakıldı' } }), r);
  assert.strictEqual((await db.query('SELECT getiren_id FROM isletmeler WHERE id = 1')).rows[0].getiren_id, 2);

  r = res(); await m.sonuc(req(3, { params: { id: ali[2] }, body: { tip: 'gorustu' } }), r);
  assert.strictEqual(r.kod, 403, 'Mete, Ali\'nin adayını kaydedemez');

  r = res(); await m.ozet(req(2), r);
  const ben = r.v.ben;
  assert.deepStrictEqual([ben.arama, ben.kurulum], [2, 1]);
  assert.strictEqual(r.v.hedef.isletme, 200);
  assert.strictEqual(r.v.hedef.baglanan >= 1, true);
  assert.ok(r.v.hedef.kisi_gunluk >= 1);
  assert.strictEqual(r.v.liderlik.bugun[0].id, 2, 'kurulum yapan liderlikte en üstte');

  r = res(); await m.listem(req(2), r);
  assert.ok(!r.v.bugun.some(x => x.id === ali[1]), 'kurulan listeden düşer');
  assert.ok(r.v.ileride.some(x => x.id === ali[0]), 'ulaşılamayan yarına');

  r = res(); await m.ekipTakip(req(1), r);
  assert.strictEqual(r.v.uyeler.find(u => u.id === 2).getirdigi, 1);
});

test('itiraz bankası: hazır itirazlar yüklü, herkes ekler', async () => {
  const m = require(SRC + '/controllers/masaController');
  let r = res(); await m.itirazlar(req(2), r);
  assert.ok(r.v.itirazlar.length >= 8);
  r = res(); await m.itirazEkle(req(3, { body: { itiraz: 'Kızım bakıyor telefona', cevap: 'O zaman kızınız da panelden görsün' } }), r);
  assert.strictEqual(r.v.itiraz.ekleyen_id, 3);
});
