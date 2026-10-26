// Usta seçilmeden boş saat: her ustanın takvimi ayrı hesaplanıp birleşir (canlı, 2026-10-26: iki ustalı dükkânda
// bir usta doluyken öbürü de dolu görünüyordu). Ustasız randevuya o saatte boş olan usta atanır.
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
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE paket_tanimlari (kod TEXT);
  INSERT INTO isletmeler (isim) VALUES ('İki Usta');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç', 30, 300);
  INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Tayfun'), (1, 'Kalfa');
  INSERT INTO musteriler (isim, telefon) VALUES ('Eski', '905550000001');`;
const GUN = '2030-01-15';

test('usta seçilmeden: bir usta doluyken öbürünün saatleri açık kalır, ustasız randevu ustaya atanır', async () => {
  const { db } = await hazirla(SEMA);
  delete require.cache[require.resolve(path.join(SRC, 'services', 'randevu'))];
  const r = require(path.join(SRC, 'services', 'randevu'));

  // Tayfun 09:00–12:00 tamamen dolu
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, 1, 1, 1, '${GUN}', '09:00', '12:00', 'onaylandi')`);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, 1, 1), [], 'Tayfun dolu');
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, 1), ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'], 'Kalfa boş: saatler açık');

  // Ustasız eski randevu 10:00–10:30 bir ustayı tutar → Kalfa da o saatte dolu sayılır
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, NULL, 1, 1, '${GUN}', '10:00', '10:30', 'onaylandi')`);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, 1), ['09:00', '09:30', '10:30', '11:00', '11:30']);

  // Usta verilmeden alınan randevu boş ustaya (Kalfa) yazılır
  const s = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000002', hizmetIds: [1], tarih: GUN, saat: '11:00', kaynak: 'bot' });
  assert.equal((s.randevu || s).calisan_id, 2);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, 1), ['09:00', '09:30', '10:30']);
});

test('hizmete uygun olmayan ustanın randevusu takvimi kapatmaz', async () => {
  const { db } = await hazirla(SEMA);
  delete require.cache[require.resolve(path.join(SRC, 'services', 'randevu'))];
  const r = require(path.join(SRC, 'services', 'randevu'));
  // Saçı yalnız Tayfun yapar; Kalfa'nın dolu olması önemsiz, Tayfun'un dolu olması önemli
  await db.exec(`INSERT INTO calisan_hizmetler VALUES (1, 1);
    INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum)
    VALUES (1, 2, 1, 1, '${GUN}', '09:00', '12:00', 'onaylandi'), (1, 1, 1, 1, '${GUN}', '09:00', '10:00', 'onaylandi')`);
  assert.deepEqual(await r.musaitSaatleriGetir(1, GUN, null, 1), ['10:10', '10:30', '11:00', '11:30'], 'Kalfa dolu olsa da Tayfun 10:00+5dk tampondan sonra boş');
});
