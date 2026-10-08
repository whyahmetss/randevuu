const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('büyüme: kanal tespiti ve huni (kayıt → kurdu → randevu → ödedi)', async () => {
  await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, telefon TEXT, demo BOOLEAN DEFAULT false, demo_lead_id INT, referans_kodu TEXT, referans_ile_gelen INT, kayit_kanali TEXT, grup_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE satis_konusmalar (id SERIAL, kayit_isletme_id INT, gelen_mesajlar TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE hizmetler (isletme_id INT); CREATE TABLE calisanlar (isletme_id INT); CREATE TABLE wa_auth_keys (isletme_id INT);
    CREATE TABLE randevular (isletme_id INT); CREATE TABLE odemeler (isletme_id INT, durum TEXT);
    INSERT INTO isletmeler (telefon, demo_lead_id, referans_kodu, grup_id, demo) VALUES
      ('905320000001', NULL, NULL, NULL, false),   -- 1 whatsapp
      ('tg_99', NULL, NULL, NULL, false),          -- 2 telegram
      ('905320000003', 7, NULL, NULL, false),      -- 3 demo
      ('905320000004', NULL, 'ABC', 5, false),     -- 4 esnaf daveti (grubun merkezi)
      ('905320000005', NULL, NULL, 5, false),      -- 5 şube: sayılmaz
      ('905320000006', NULL, NULL, NULL, true);    -- 6 sahiplenilmemiş demo: sayılmaz
    UPDATE isletmeler SET referans_ile_gelen = 1 WHERE id = 4;
    INSERT INTO isletmeler (telefon, kayit_kanali) VALUES ('905320000007', 'randevu_sayfasi');  -- 7 randevu sayfasından
    INSERT INTO satis_konusmalar (kayit_isletme_id, gelen_mesajlar) VALUES (1, 'slm'), (NULL, 'hayır'), (NULL, NULL);
    INSERT INTO hizmetler VALUES (1); INSERT INTO calisanlar VALUES (1); INSERT INTO wa_auth_keys VALUES (1);
    INSERT INTO randevular VALUES (1); INSERT INTO odemeler VALUES (1, 'odendi'), (3, 'bekliyor');`);
  const r = await require(SRC + '/services/buyume').buyumeRaporu(30);
  const k = Object.fromEntries(r.kanallar.map(x => [x.kanal, x]));
  assert.deepStrictEqual(Object.keys(k).sort(), ['demo', 'randevu_sayfasi', 'referans', 'telegram', 'whatsapp']);
  assert.deepStrictEqual([k.whatsapp.kurdu, k.whatsapp.randevu, k.whatsapp.odedi], [1, 1, 1]);
  assert.strictEqual(k.demo.odedi, 0);
  assert.strictEqual(r.toplam.kayit, 5);
  assert.deepStrictEqual(r.satisBot, { yazilan: 3, cevap: 2, kayit: 1 });
});
