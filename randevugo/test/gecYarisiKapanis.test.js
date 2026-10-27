// "00:00" kapanış (2026-10-27): 13:30–00:00 açık masaj salonunda randevu sayfası "müsait saat yok" diyordu; kapanış 0. dakika okunuyordu.
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('kapanisDk: 00:00 ve açılıştan önceki kapanış gün sonu sayılır', () => {
  const { kapanisDk } = require(SRC + '/utils/tarih');
  assert.equal(kapanisDk('13:30', '00:00'), 24 * 60);
  assert.equal(kapanisDk('13:30:00', '00:00:00'), 24 * 60);
  assert.equal(kapanisDk('18:00', '02:00'), 24 * 60, 'gece yarısını aşan mesai gün sonunda biter');
  assert.equal(kapanisDk('09:00', '19:00'), 19 * 60);
});

test('müsait saatler: 13:30–00:00 salonunda gece yarısına kadar saat çıkar', async () => {
  await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, calisma_baslangic TIME, calisma_bitis TIME, kapali_gunler TEXT, randevu_suresi_dk INT,
      slot_aralik_dk INT, varsayilan_tampon_dk INT, randevu_modu TEXT, mola_saatleri JSONB, tatil_kapali JSONB);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, sure_dk INT, tampon_dk INT);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, tarih DATE, saat TIME, bitis_saati TIME, durum TEXT);
    CREATE TABLE calisan_hizmetler (id SERIAL PRIMARY KEY, calisan_id INT, hizmet_id INT);
    CREATE TABLE takvim_bloklari (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, tarih DATE, baslangic TIME, bitis TIME);
    INSERT INTO isletmeler (calisma_baslangic, calisma_bitis, kapali_gunler, slot_aralik_dk) VALUES ('13:30', '00:00', '', 30);
    INSERT INTO hizmetler (isletme_id, sure_dk, tampon_dk) VALUES (1, 60, 0);`);
  const randevu = require(SRC + '/services/randevu');
  const { gunSonraTarih } = require(SRC + '/utils/tarih');
  const saatler = await randevu.musaitSaatleriGetir(1, gunSonraTarih(7), null, 1);
  assert.equal(saatler[0], '13:30');
  assert.equal(saatler[saatler.length - 1], '23:00', '60 dk hizmet en geç 23:00');
});
