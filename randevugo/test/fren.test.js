// Satış Bot freni (2026-10-17): olumsuz oranı aynı gün gönderilenler üzerinden; eski konuşmalardan gelen ret oranı bozmaz
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('fren: önceki günlerin retleri bugünkü orana girmez; sert ret yine sayılır', async () => {
  const { db } = await hazirla(`
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, gonderilen_mesaj TEXT, durum TEXT, red_tipi TEXT,
      son_mesaj_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP);`);
  const simdi = "(NOW() AT TIME ZONE 'Europe/Istanbul')";
  // bugün 18 gönderim, 2 ret
  await db.exec(`INSERT INTO satis_konusmalar (gonderilen_mesaj, durum, son_mesaj_tarihi, olusturma_tarihi)
    SELECT 'Merhaba, kolay gelsin', CASE WHEN g <= 2 THEN 'olumsuz' ELSE 'ai_devrede' END, ${simdi}, ${simdi} FROM generate_series(1, 18) g`);
  // önceki günlerden bugün ret veren 13 konuşma + elle yazılan 3 ret
  await db.exec(`INSERT INTO satis_konusmalar (gonderilen_mesaj, durum, son_mesaj_tarihi, olusturma_tarihi)
    SELECT 'Merhaba, X ile mi görüşüyorum?', 'olumsuz', ${simdi}, ${simdi} - INTERVAL '3 days' FROM generate_series(1, 13)`);
  await db.exec(`INSERT INTO satis_konusmalar (gonderilen_mesaj, durum, son_mesaj_tarihi, olusturma_tarihi)
    SELECT 'Elle yazıldı', 'olumsuz', ${simdi}, ${simdi} FROM generate_series(1, 3)`);
  const bot = require(SRC + '/services/satisBot');
  assert.deepStrictEqual(await bot._redBugun(), { olumsuz: 2, sert: 0, gonderilen: 18 });
  await db.exec(`UPDATE satis_konusmalar SET red_tipi = 'sert' WHERE id IN (SELECT id FROM satis_konusmalar WHERE olusturma_tarihi < ${simdi} - INTERVAL '1 day' LIMIT 2)`);
  assert.strictEqual((await bot._redBugun()).sert, 2, 'eski konuşmadan gelen "yazmayın" yine ban sinyali');
});

test('fren sonrası elle başlatma: o ana kadarki retler taban olur, yalnız sonrakiler sayılır', async () => {
  const bot = require(SRC + '/services/satisBot');
  const pool = require(SRC + '/config/db');
  bot.durum = 'bagli'; bot.aktif = false;
  bot.fren = { sebep: 'olumsuz_oran', mesaj: 'x' };
  bot._bagliSocklar = () => [];
  const once = await bot._redBugun();
  assert.ok(once.olumsuz > 0);
  await bot.gonderimBaslat();
  assert.strictEqual(bot.fren, null);
  assert.deepStrictEqual(bot._frenSonrasi(await bot._redBugun()), { olumsuz: 0, sert: 0, gonderilen: 0 });
  await pool.query(`INSERT INTO satis_konusmalar (gonderilen_mesaj, durum, son_mesaj_tarihi, olusturma_tarihi)
    VALUES ('Merhaba, kolay gelsin', 'olumsuz', NOW() AT TIME ZONE 'Europe/Istanbul', NOW() AT TIME ZONE 'Europe/Istanbul')`);
  assert.deepStrictEqual(bot._frenSonrasi(await bot._redBugun()), { olumsuz: 1, sert: 0, gonderilen: 1 });
  bot.gonderimDurdur?.();
});
