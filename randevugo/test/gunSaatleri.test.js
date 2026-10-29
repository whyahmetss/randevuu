// Gün bazlı saat (2026-10-29): berber "hafta içi 9–21, son müşteri 20:00; cuma-cumartesi 23:00 kapanış" istedi.
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

const BERBER = { calisma_baslangic: '09:00:00', calisma_bitis: '21:00:00', kapali_gunler: '0',
  haftalik_saatler: { 1: { son: '20:00' }, 5: { bit: '23:00', son: '22:00' }, 6: { bit: '23:00' } } };

test('gunSaatleri: günde yazılan önce, boş alan genel saate düşer; hafta özeti', () => {
  const { gunSaatleri, haftaOzeti, tabloTemizle } = require(SRC + '/utils/gunSaatleri');
  assert.deepEqual(gunSaatleri(BERBER, 1), { kapali: false, bas: '09:00', bit: '21:00', son: '20:00', basDk: 540, bitDk: 1260, sonDk: 1200 });
  assert.equal(gunSaatleri(BERBER, 5).bitDk, 23 * 60);
  assert.equal(gunSaatleri(BERBER, 2).sonDk, null, 'son yazılmayan günde sınır yok');
  assert.equal(gunSaatleri(BERBER, 0).kapali, true);
  assert.equal(gunSaatleri({ ...BERBER, haftalik_saatler: JSON.stringify(BERBER.haftalik_saatler) }, 5).bit, '23:00', 'JSON metni de okunur');
  assert.equal(gunSaatleri({ calisma_baslangic: '13:30', calisma_bitis: '00:00' }, 3).bitDk, 24 * 60, '00:00 kapanış gün sonu');
  assert.equal(haftaOzeti(BERBER), 'Pzt–Per 09:00–21:00 · Cum–Cmt 09:00–23:00 · Paz kapalı');
  assert.deepEqual(tabloTemizle({ 5: { bas: '09:00', bit: '25:00', son: '' }, 7: { bas: '09:00' }, x: 1, 2: {} }), { 5: { bas: '09:00' } });
  assert.equal(tabloTemizle({}), null);
});

test('müsait saatler: hafta içi son randevu 20:00, cuma 23:00 kapanış', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, calisma_baslangic TIME, calisma_bitis TIME, kapali_gunler TEXT, randevu_suresi_dk INT,
      slot_aralik_dk INT, varsayilan_tampon_dk INT, randevu_modu TEXT, mola_saatleri JSONB, tatil_kapali JSONB, haftalik_saatler JSONB);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE calisan_hizmetler (id SERIAL PRIMARY KEY, calisan_id INT, hizmet_id INT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, sure_dk INT, tampon_dk INT);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, tarih DATE, saat TIME, bitis_saati TIME, durum TEXT);
    CREATE TABLE takvim_bloklari (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, tarih DATE, baslangic TIME, bitis TIME);
    INSERT INTO hizmetler (isletme_id, sure_dk, tampon_dk) VALUES (1, 30, 0);`);
  await db.query(`INSERT INTO isletmeler (calisma_baslangic, calisma_bitis, kapali_gunler, slot_aralik_dk, haftalik_saatler)
    VALUES ('09:00', '21:00', '0', 30, $1)`, [JSON.stringify(BERBER.haftalik_saatler)]);
  const randevu = require(SRC + '/services/randevu');
  const { gunSonraTarih } = require(SRC + '/utils/tarih');
  const gunBul = (hedef) => { for (let i = 2; i < 10; i++) { const t = gunSonraTarih(i); const [y, a, g] = t.split('-').map(Number); if (new Date(y, a - 1, g).getDay() === hedef) return t; } };
  const son = async (gun) => { const s = await randevu.musaitSaatleriGetir(1, gunBul(gun), null, 1); return [s[0], s[s.length - 1]]; };

  assert.deepEqual(await son(1), ['09:00', '20:00'], 'pazartesi: 30 dk hizmet 20:30 yerine en geç 20:00');
  assert.deepEqual(await son(2), ['09:00', '20:30'], 'salı: son yazılmadı, kapanışa göre');
  assert.deepEqual(await son(5), ['09:00', '22:00'], 'cuma: 23:00 kapanış, son randevu 22:00');
  assert.deepEqual(await son(6), ['09:00', '22:30'], 'cumartesi: 23:00 kapanış');
  assert.equal((await randevu.musaitSaatleriGetir(1, gunBul(0), null, 1)).length, 0, 'pazar kapalı');
});
