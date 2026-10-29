// Bölünmüş randevu (kullanıcı kararı 2026-10-29): saçı erkek usta, kaşı kadın personel yapan salonda müşteri ikisini
// birlikte seçince randevu arka arkaya iki ustaya bölünür. Eskiden saatler açık görünüyor, onayda "çalışan bulunamadı" çıkıyordu.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT DEFAULT 'profesyonel', calisma_baslangic TIME DEFAULT '09:00',
    calisma_bitis TIME DEFAULT '12:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30, mola_saatleri JSONB DEFAULT '[]',
    randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT DEFAULT 0, grup_id INT, randevu_onay_modu TEXT,
    kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0, kapora_yuzdesi INT DEFAULT 0);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME, calisma_bitis TIME,
    kapali_gunler TEXT, mola_saatleri JSONB DEFAULT '[]');
  CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW(), bagli_randevu_id INT,
    hatirlatma_gonderildi BOOLEAN DEFAULT false, teyit_gonderildi BOOLEAN DEFAULT false, sms_hatirlatma_gonderildi BOOLEAN DEFAULT false);
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE paket_tanimlari (kod TEXT);
  INSERT INTO isletmeler (isim) VALUES ('Villa');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Erkek Saç Kesim', 30, 700), (1, 'Kaş Alımı', 15, 500), (1, 'Sakal', 20, 300);
  INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Ferhat'), (1, 'Derya');
  INSERT INTO calisan_hizmetler VALUES (1, 1), (1, 3), (2, 2);
  INSERT INTO musteriler (isim, telefon) VALUES ('Eski', '905550000001');`;
const GUN = '2030-01-15';
const SACKAS = { hizmetIds: [1, 2] };

async function servis() {
  const { db } = await hazirla(SEMA);
  delete require.cache[require.resolve(path.join(SRC, 'services', 'randevu'))];
  return { db, r: require(path.join(SRC, 'services', 'randevu')) };
}

test('hizmetler ustalarına göre gruplanır; tek usta yapabiliyorsa bölünmez', async () => {
  const { r } = await servis();
  assert.deepEqual(await r.bolunmusGruplar(1, [1, 2, 3]), [
    { hizmetIds: [1, 3], ustalar: [1], sureDk: 50 },
    { hizmetIds: [2], ustalar: [2], sureDk: 15 },
  ], 'saç ve sakal Ferhat\'ta birlikte, kaş Derya\'da');
  assert.equal(await r.bolunmusGruplar(1, [1, 3]), null, 'saç + sakalı Ferhat tek başına yapar');
  assert.equal(await r.bolunmusGruplar(1, [1]), null);
});

test('saç + kaş: saatler ikinci parçanın ustasına göre de süzülür', async () => {
  const { db, r } = await servis();
  // 11:30 saç → 12:00 kaş kapanışı aşar
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, null, SACKAS), ['09:00', '09:30', '10:00', '10:30', '11:00']);

  // Derya 10:30–11:00 dolu (+5 dk tampon): saçı 10:00 ya da 10:30'da başlayanın kaşı denk gelmez
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, 2, 1, 2, '${GUN}', '10:30', '11:00', 'onaylandi')`);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, null, SACKAS), ['09:00', '09:30', '11:00']);
});

test('ikinci parça yarım saat ızgarasına düşmese de bulunur (sakal 20 dk → kaş 09:20)', async () => {
  const { db, r } = await servis();
  // Ferhat 09:20'den sonra dolu: 09:00–09:20 sakal sığar, kaş Derya'da 09:20–09:35
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, 1, 1, 1, '${GUN}', '09:20', '12:00', 'onaylandi')`);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, null, { hizmetIds: [3, 2] }), ['09:00']);
});

test('randevu iki ustaya arka arkaya yazılır; ilk parça iptal olunca ikincisi de düşer', async () => {
  const { db, r } = await servis();
  const s = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000002', musteriIsim: 'Ali Veli', hizmetIds: [1, 2], tarih: GUN, saat: '09:00', kaynak: 'online' });
  assert.equal(s.parcalar.length, 2);
  assert.equal(s.hizmet.fiyat, 1200);

  const satirlar = (await db.query(`SELECT id, calisan_id, hizmet_id, saat::text, bitis_saati::text, bagli_randevu_id, hatirlatma_gonderildi, teyit_gonderildi
    FROM randevular ORDER BY id`)).rows;
  assert.deepEqual(satirlar.map(x => [x.calisan_id, x.hizmet_id, x.saat, x.bitis_saati]), [[1, 1, '09:00:00', '09:30:00'], [2, 2, '09:30:00', '09:45:00']]);
  assert.equal(satirlar[1].bagli_randevu_id, satirlar[0].id);
  assert.equal(satirlar[0].hatirlatma_gonderildi, false, 'müşteri ilk parça için hatırlatılır');
  assert.equal(satirlar[1].hatirlatma_gonderildi && satirlar[1].teyit_gonderildi, true, 'ikinci parça için ayrıca mesaj gitmez');

  assert.ok(!(await r.musaitSaatleriGetir(1, GUN, null, null, SACKAS)).includes('09:00'), 'alınan saat kapanır');

  await r.randevuIptal(satirlar[0].id);
  assert.deepEqual((await db.query('SELECT durum FROM randevular ORDER BY id')).rows.map(x => x.durum), ['iptal', 'iptal']);
});

test('ikinci parçanın ustası doluysa randevu yazılmaz (yarım randevu kalmaz)', async () => {
  const { db, r } = await servis();
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, 2, 1, 2, '${GUN}', '10:30', '11:00', 'onaylandi')`);
  await assert.rejects(
    r.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000003', hizmetIds: [1, 2], tarih: GUN, saat: '10:00', kaynak: 'online' }),
    e => e.code === 'SLOT_DOLU');
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM randevular WHERE durum <> 'iptal'")).rows[0].n, 1, 'yalnız Derya\'nın eski randevusu');
});
