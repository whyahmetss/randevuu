// Esnaf teşviki (2026-10-15): ilk otomatik randevuda tebrik, 10. otomatik randevuda davet isteği — yalnız eşiği yeni
// geçen işletmeye, bir kez. Eski işletmelere toplu mesaj gitmez.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, slug TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
      grup_id INT, referans_kodu TEXT);
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, musteri_id INT, tarih DATE, saat TIME, kaynak TEXT, durum TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE referanslar (id SERIAL PRIMARY KEY, referans_kodu TEXT UNIQUE, sahip_isletme_id INT, toplam_davet INT DEFAULT 0);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY); CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY);
    INSERT INTO isletmeler (isim, telefon, slug) VALUES
      ('Yeni Berber', '905320000001', 'yeni-berber'),       -- 1: ilk bot randevusu bugün
      ('Eski Berber', '905320000002', 'eski-berber'),       -- 2: ilk randevusu 10 gün önce (eski işletme: tebrik yok)
      ('Manuel Berber', '905320000003', 'manuel-berber'),   -- 3: yalnız elle girilmiş randevu
      ('Onuncu Berber', '905320000004', 'onuncu-berber'),   -- 4: 10. otomatik randevu bugün
      ('Çoktan Berber', '905320000005', 'coktan-berber');   -- 5: 10. otomatik randevu 20 gün önce
    INSERT INTO musteriler (isim) VALUES ('Zeynep');
    INSERT INTO randevular (isletme_id, musteri_id, tarih, saat, kaynak) VALUES (1, 1, '2026-10-16', '14:30', 'bot');
    INSERT INTO randevular (isletme_id, kaynak, olusturma_tarihi) VALUES (2, 'online', NOW() - INTERVAL '10 days'), (2, 'bot', NOW());
    INSERT INTO randevular (isletme_id, kaynak) VALUES (3, 'manuel'), (3, 'sekreter');
    INSERT INTO randevular (isletme_id, kaynak, olusturma_tarihi) SELECT 4, 'bot', NOW() - make_interval(days => 20 - g) FROM generate_series(1, 9) g;
    INSERT INTO randevular (isletme_id, kaynak) VALUES (4, 'online');
    INSERT INTO randevular (isletme_id, kaynak, olusturma_tarihi) SELECT 5, 'bot', NOW() - make_interval(days => 40 - g) FROM generate_series(1, 25) g;`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/051_saha_satis.sql', 'utf8').replace(/^ALTER TABLE isletmeler ALTER COLUMN mesai_disi_mod.*$/m, ''));
  return o;
})();

test('ilk otomatik randevu tebriği ve 10. randevuda davet isteği: doğru işletmeye, bir kez', async () => {
  const { db } = await ortam;
  const t = require(SRC + '/services/esnafTesvik');
  const giden = [];
  let calisiyor = false;
  const gonder = async (i, m) => { giden.push([i.id, m]); return { gitti: calisiyor }; };

  // Merkez numarası bağlı değil: işaretlenmez, sonraki turda yeniden denenir
  assert.deepStrictEqual(await t.turCalistir({ gonder, saatKontrol: false }), { tebrik: 0, davet: 0 });
  assert.strictEqual((await db.query('SELECT COUNT(*)::int n FROM isletmeler WHERE ilk_randevu_tebrik IS NOT NULL')).rows[0].n, 0);

  calisiyor = true; giden.length = 0;
  assert.deepStrictEqual(await t.turCalistir({ gonder, saatKontrol: false }), { tebrik: 1, davet: 1 });
  const tebrik = giden.find(([id]) => id === 1)[1];
  assert.match(tebrik, /ilk randevunuzu sizin yerinize aldı: \*Zeynep\*, 16 Ekim Cuma 14:30/);
  assert.match(tebrik, /book\/yeni-berber/);
  const davet = giden.find(([id]) => id === 4)[1];
  assert.match(davet, /10 randevuyu otomatik aldı/);
  assert.match(davet, /\?davet=SG[A-Z0-9]{6}&k=davet/);
  assert.match(davet, /1 ay bedava/);
  assert.deepStrictEqual(giden.map(([id]) => id).sort(), [1, 4], 'eski, manuel ve çoktan geçmiş işletmeye gitmez');

  giden.length = 0;
  assert.deepStrictEqual(await t.turCalistir({ gonder, saatKontrol: false }), { tebrik: 0, davet: 0 }, 'ikinci kez gitmez');
  assert.strictEqual(giden.length, 0);
});
