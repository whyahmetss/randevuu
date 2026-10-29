// Seanslı paket (2026-10-29): Villa'da lazer paketi 8+2 seans 13.000 ₺; her seans 13.000 ₺ yazılınca ciro, kasa ve prim
// on kat şişiyordu. Paketin parası ilk seansta yazılır, devam seansları 0 ₺. Ayrıca panelden iptal bölünmüş randevunun
// devam parçasını da düşürür; kasaya yazılan gelir randevuya yazılan fiyattır.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT DEFAULT 'profesyonel', calisma_baslangic TIME DEFAULT '09:00',
    calisma_bitis TIME DEFAULT '18:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30, mola_saatleri JSONB DEFAULT '[]',
    randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT DEFAULT 0, grup_id INT, randevu_onay_modu TEXT,
    kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0, kapora_yuzdesi INT DEFAULT 0,
    seans_sayisi SMALLINT, seans_aralik_gun SMALLINT);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME, calisma_bitis TIME,
    kapali_gunler TEXT, mola_saatleri JSONB DEFAULT '[]');
  CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW(), bagli_randevu_id INT,
    seans_id INT, seans_no SMALLINT);
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE musteri_seanslari (id SERIAL PRIMARY KEY, isletme_id INT, musteri_id INT, hizmet_id INT, toplam SMALLINT, tamamlanan SMALLINT DEFAULT 0,
    aralik_gun SMALLINT DEFAULT 30, son_seans_tarihi DATE, sonraki_hatirlatma DATE, hatirlatma_sayisi SMALLINT DEFAULT 0, durum TEXT DEFAULT 'aktif');
  CREATE TABLE kasa_hareketleri (id SERIAL PRIMARY KEY, isletme_id INT, tip TEXT, tutar NUMERIC, aciklama TEXT, kategori TEXT, odeme_yontemi TEXT,
    randevu_id INT, tarih DATE, olusturan_id INT);
  CREATE TABLE paket_tanimlari (kod TEXT);
  INSERT INTO isletmeler (isim) VALUES ('Villa');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, seans_sayisi, seans_aralik_gun) VALUES
    (1, 'Lazer Tüm Vücut Paketi', 90, 13000, 10, 45), (1, 'Erkek Saç Kesim', 30, 700, NULL, NULL), (1, 'Kaş Alımı', 15, 500, NULL, NULL);
  INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Derya'), (1, 'Ferhat');
  INSERT INTO calisan_hizmetler VALUES (1, 1), (1, 3), (2, 2);`;
const TEL = '905550000011';
const gun = (n) => `2030-01-${String(10 + n).padStart(2, '0')}`;

async function servis() {
  const { db } = await hazirla(SEMA);
  for (const m of ['services/randevu', 'controllers/adminController']) delete require.cache[require.resolve(path.join(SRC, m))];
  return { db, r: require(path.join(SRC, 'services', 'randevu')) };
}
const tutar = async (db, id) => Number((await db.query('SELECT SUM(fiyat) AS t FROM randevu_hizmetleri WHERE randevu_id = $1', [id])).rows[0].t);
const lazer = (r, n) => r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [1], tarih: gun(n), saat: '10:00', kaynak: 'online' });

test('paket: ilk seans tam fiyat, devam seansları 0 ₺; paket bitince yeni paket tam fiyat', async () => {
  const { db, r } = await servis();
  const s1 = await lazer(r, 1);
  assert.equal(await tutar(db, s1.randevu.id), 13000, 'ilk seans paketin parası');

  const s2 = await lazer(r, 2);
  assert.equal(await tutar(db, s2.randevu.id), 0, 'ilk seans daha yapılmadan alınan ikinci seans da paketin içinde');

  // İlk iki seans yapıldı: paket aktif (seans takibi tamamlananı sayar)
  await db.exec(`UPDATE randevular SET durum = 'tamamlandi';
    INSERT INTO musteri_seanslari (isletme_id, musteri_id, hizmet_id, toplam, tamamlanan) VALUES (1, 1, 1, 10, 2)`);
  assert.equal(await tutar(db, (await lazer(r, 3)).randevu.id), 0, 'süren paketin seansı');

  await db.exec(`UPDATE randevular SET durum = 'tamamlandi'; UPDATE musteri_seanslari SET durum = 'bitti', tamamlanan = 10`);
  assert.equal(await tutar(db, (await lazer(r, 4)).randevu.id), 13000, 'paket bitti: yeni paket');

  const sac = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [2], tarih: gun(5), saat: '10:00', kaynak: 'online' });
  assert.equal(await tutar(db, sac.randevu.id), 700, 'seanssız hizmet etkilenmez');
});

test('panel: ilk parça iptal edilince bölünmüş randevunun devamı da düşer; tamamlanınca kasaya randevunun tutarı yazılır', async () => {
  const { db, r } = await servis();
  // Saç Ferhat'ta, kaş Derya'da: bölünmüş randevu
  const s = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [2, 3], tarih: gun(1), saat: '10:00', kaynak: 'online' });
  assert.equal(s.parcalar.length, 2);
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  const cagir = async (id, durum) => { let c; await admin.randevuDurumGuncelle({ params: { id: String(id) }, body: { durum }, kullanici: { isletme_id: 1, id: 1 }, headers: {}, socket: {} },
    { json: (x) => { c = x; }, status() { return this; } }); return c; };

  await cagir(s.parcalar[0].randevu.id, 'iptal');
  assert.deepEqual((await db.query('SELECT durum FROM randevular ORDER BY id')).rows.map(x => x.durum), ['iptal', 'iptal']);

  // Paketin devam seansı tamamlanınca kasaya 0 ₺ yazılmaz (eskiden liste fiyatı 13.000 ₺ yazılıyordu); saç 700 ₺ yazılır
  await lazer(r, 2);
  const devam = await lazer(r, 3);
  await cagir(devam.randevu.id, 'tamamlandi');
  const sac = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [2], tarih: gun(4), saat: '10:00', kaynak: 'online' });
  await cagir(sac.randevu.id, 'tamamlandi');
  assert.deepEqual((await db.query('SELECT randevu_id, tutar FROM kasa_hareketleri ORDER BY id')).rows.map(x => [x.randevu_id, Number(x.tutar)]),
    [[sac.randevu.id, 700]]);
});
