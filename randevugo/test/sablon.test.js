// Satış Bot şablonları (2026-10-16): boş alan izleri temizlenir, çok ret alan şablon kendiliğinden durur,
// migration bayram cümlesini düzeltir ve yeni şablonları pasif ekler.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = hazirla(`
    CREATE TABLE satis_bot_sablonlar (id SERIAL PRIMARY KEY, isim TEXT, mesaj TEXT, kategori TEXT DEFAULT 'genel', aktif BOOLEAN DEFAULT true,
      gonderim_modu TEXT, gonderilen INT DEFAULT 0, cevap_gelen INT DEFAULT 0, olumlu INT DEFAULT 0, olumsuz INT DEFAULT 0);
    CREATE TABLE sistem_uyarilari (id SERIAL PRIMARY KEY, anahtar TEXT, tip TEXT, seviye TEXT, isletme_id INT, baslik TEXT, detay TEXT,
      adet INT DEFAULT 1, son_zaman TIMESTAMP, cozuldu BOOLEAN DEFAULT false);
    CREATE UNIQUE INDEX ON sistem_uyarilari (anahtar) WHERE cozuldu = false;
    INSERT INTO satis_bot_sablonlar (isim, mesaj, gonderilen, olumsuz) VALUES
      ('Soru Soran', 'Selam abi, yorumlar on numara 🔥 Bayram öncesi tıraş yoğunluğu geliyordur, millet hep arayarak mı alıyor?', 79, 16),
      ('İnsta odaklı', 'Selam , Instagram''da sayfanıza denk geldim', 35, 1),
      ('Kötü', 'Merhaba', 40, 11);`);

test('şablon doldurma: boş isim "Selam ," bırakmaz', async () => {
  await ortam;
  const { sablonDoldur } = require(SRC + '/services/satisBot')._test;
  assert.strictEqual(sablonDoldur('Selam {isletme_sahibi}, {isletme_adi} için yazıyorum.', { isletme_adi: 'Makas' }), 'Selam, Makas için yazıyorum.');
  assert.strictEqual(sablonDoldur('Merhaba {isletme_sahibi} , nasılsınız?', { isletme_sahibi: 'Ali' }), 'Merhaba Ali, nasılsınız?');
  assert.strictEqual(sablonDoldur('Selam ,  Instagram', {}), 'Selam, Instagram');
});

test('migration temizliği ve otomatik fren', async () => {
  const { db } = await ortam;
  const sql = fs.readFileSync(SRC + '/migrations/052_satis_sablon_temizlik.sql', 'utf8');
  await db.exec(sql);
  await db.exec(sql);   // ikinci çalıştırma kopya eklemez
  const m = Object.fromEntries((await db.query('SELECT isim, mesaj, aktif FROM satis_bot_sablonlar')).rows.map(r => [r.isim, r]));
  assert.match(m['Soru Soran'].mesaj, /Yoğun günlerde telefonlar susmuyordur, millet/);
  assert.doesNotMatch(m['Soru Soran'].mesaj, /Bayram/);
  assert.match(m['İnsta odaklı'].mesaj, /^Selam, Instagram/);
  for (const ad of ['Defter mi Sistem mi', 'Kısa Acı Noktası', 'Kendini Tanıtan', 'İnsta DM Yükü']) assert.strictEqual(m[ad]?.aktif, false, ad);
  assert.strictEqual((await db.query('SELECT COUNT(*)::int n FROM satis_bot_sablonlar')).rows[0].n, 7);

  const bot = require(SRC + '/services/satisBot');
  const id = (isim) => db.query('SELECT id FROM satis_bot_sablonlar WHERE isim = $1', [isim]).then(r => r.rows[0].id);
  assert.strictEqual(await bot._sablonFreni(await id('Soru Soran')), false, '%20 ret: çalışmaya devam');
  assert.strictEqual(await bot._sablonFreni(await id('Kötü')), true, '%27,5 ret: durur');
  const k = (await db.query("SELECT aktif, durdurma_notu FROM satis_bot_sablonlar WHERE isim = 'Kötü'")).rows[0];
  assert.strictEqual(k.aktif, false);
  assert.match(k.durdurma_notu, /11 ret \/ 40 gönderim/);
  assert.ok((await db.query("SELECT 1 FROM sistem_uyarilari WHERE tip = 'sablon'")).rows[0]);
});

test('övgü içeren şablon yalnız 4,5+ puanlı dükkâna gider', async () => {
  const { db } = await ortam;
  await db.exec(fs.readFileSync(SRC + '/migrations/053_sablon_min_puan.sql', 'utf8'));
  const m = Object.fromEntries((await db.query('SELECT isim, min_puan FROM satis_bot_sablonlar')).rows.map(r => [r.isim, r.min_puan]));
  assert.strictEqual(Number(m['Soru Soran']), 4.5, '"yorumlar on numara" diyen şablon filtrelendi');
  assert.strictEqual(m['Kendini Tanıtan'], null);
  await db.query("UPDATE satis_bot_sablonlar SET aktif = (isim IN ('Soru Soran', 'Kendini Tanıtan'))");
  const sec = async (puan) => (await db.query(`SELECT isim FROM satis_bot_sablonlar WHERE aktif = true AND (min_puan IS NULL OR $1::numeric >= min_puan) ORDER BY isim`, [puan])).rows.map(r => r.isim);
  assert.deepStrictEqual(await sec(3.9), ['Kendini Tanıtan']);
  assert.deepStrictEqual(await sec(4.7), ['Kendini Tanıtan', 'Soru Soran']);
});

test('açılış yalnız "Merhaba, kolay gelsin"; "sağolun, size de" ilk cevabı sessiz kalmaz', async () => {
  const { db } = await ortam;
  const sql = fs.readFileSync(SRC + '/migrations/055_kolay_gelsin.sql', 'utf8');
  await db.exec(sql);
  await db.exec(sql);   // ikinci çalıştırma kopya eklemez
  const aktif = (await db.query('SELECT isim, mesaj FROM satis_bot_sablonlar WHERE aktif = true')).rows;
  assert.deepStrictEqual(aktif, [{ isim: 'Kolay Gelsin', mesaj: 'Merhaba, kolay gelsin' }]);
  assert.match((await db.query("SELECT durdurma_notu FROM satis_bot_sablonlar WHERE isim = 'Kendini Tanıtan'")).rows[0].durdurma_notu, /kolay gelsin/);

  const bot = require(SRC + '/services/satisBot');
  const ilk = await bot.fallbackCevapUret('Sağolun, size de', { gelen_mesajlar: null, isletme_adi: 'Makas' });
  assert.match(ilk.mesaj, /^Size de kolay gelsin\. İşletmelere WhatsApp'tan gelen randevu mesajlarını/);
  assert.doesNotMatch(ilk.mesaj, /https?:|sırago\.com/, 'tanıtımda link yok');
  assert.match(ilk.mesaj, /nasıl alıyorsunuz\?$/);
  assert.match((await bot.fallbackCevapUret('buyrun', { gelen_mesajlar: '[10:00] Müşteri: x' })).mesaj, /adı SıraGO/);
});
