// Öncü ödülü: Başlangıç'tan ödeyen öncüye Standart özellikleri açılır; limitler paketinden kalır; öncü olmayan kapalı.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('öncü ödülü: başlangıç öncüsüne kasa/sadakat açık, öncü olmayana kapalı', async () => {
  await hazirla(`CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, paket TEXT, oncu_no INT, grup_id INT, paket_ayricalik TEXT[] NOT NULL DEFAULT '{}');
    INSERT INTO isletmeler (paket, oncu_no, grup_id) VALUES ('baslangic', 7, NULL), ('baslangic', NULL, NULL), ('baslangic', 3, 9), ('baslangic', NULL, 9);
    INSERT INTO isletmeler (paket, paket_ayricalik) VALUES ('baslangic', '{kapora,dogum_gunu}');`);
  const { isletmePaketi } = require(path.join(SRC, 'utils', 'oncu'));
  const featureGuard = require(path.join(SRC, 'middleware', 'featureGuard'));

  const oncu = (await isletmePaketi(1)).paket;
  assert.equal(oncu.kasa, true); assert.equal(oncu.sadakat, true); assert.equal(oncu.oncu_odul, true);
  assert.equal(oncu.calisan_limit, 2, 'limit paketinden');
  assert.equal(oncu.sms_hatirlatma, false, 'kurumsal özellik açılmaz');
  assert.equal((await isletmePaketi(2)).paket.kasa, false);
  // Paket kuralı (2026-10-14): kapora ve Telegram Standart ve üstünde; Öncü Esnaf'ta Başlangıç'ta da açık
  assert.equal((await isletmePaketi(2)).paket.kapora, false);
  assert.equal((await isletmePaketi(2)).paket.telegram, false);
  assert.equal(oncu.kapora, true);
  assert.equal(oncu.telegram, true);
  assert.equal((await isletmePaketi(4)).paket.kasa, true, 'şube merkezin öncülüğüne tabi');
  // Kazanılmış hak (044): kuraldan önce açık olan özellik açık kalır, diğerleri kapalı
  assert.equal((await isletmePaketi(2)).paket.dogum_gunu, false);
  const eski = (await isletmePaketi(5)).paket;
  assert.equal(eski.kapora, true); assert.equal(eski.dogum_gunu, true); assert.equal(eski.telegram, false); assert.equal(eski.kasa, false);

  const dene = async (id) => { let gecti = false, kod = 200;
    await featureGuard('kasa')({ kullanici: { isletme_id: id } }, { status: (k) => { kod = k; return { json: () => {} }; } }, () => { gecti = true; });
    return gecti ? 200 : kod; };
  assert.equal(await dene(1), 200);
  assert.equal(await dene(2), 403);
});
