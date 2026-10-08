const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

test('satış botu: ilgi gösterene kendi demo sayfası bir kez gider, yazdığı fiyatlar sayfaya işlenir', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, adres TEXT, ilce TEXT, kategori TEXT, aktif BOOLEAN, paket TEXT, booking_acik BOOLEAN,
      calisma_baslangic TEXT, calisma_bitis TEXT, olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, slug TEXT);
    CREATE TABLE calisanlar (id SERIAL, isletme_id INT, isim TEXT, uzmanlik TEXT, aktif BOOLEAN);
    CREATE TABLE hizmetler (id SERIAL, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, aktif BOOLEAN);
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, telefon TEXT, adres TEXT, ilce TEXT, kategori TEXT, durum TEXT);
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, lead_id INT);
    INSERT INTO potansiyel_musteriler (isletme_adi, telefon, kategori) VALUES ('Ahmet Berber', '0532 111 22 33', 'berber');
    INSERT INTO satis_konusmalar (telefon, lead_id) VALUES ('905321112233', 1);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/025_demo.sql', 'utf8'));
  await db.exec(fs.readFileSync(SRC + '/migrations/028_satis_demo.sql', 'utf8'));
  const bot = require(SRC + '/services/satisBot');
  const konusma = (await db.query('SELECT * FROM satis_konusmalar WHERE id = 1')).rows[0];

  assert.deepStrictEqual(await bot._demoDurum(konusma), { gonderildi: false });
  const m = await bot._demoGonder(konusma);
  assert.match(m, /Ahmet Berber için randevu sayfanız:\n.*\/book\//);
  assert.strictEqual(await bot._demoGonder(konusma), null, 'ikinci kez gönderilmez');
  assert.strictEqual((await db.query('SELECT demo_gonderildi FROM satis_konusmalar')).rows[0].demo_gonderildi, true);

  await bot._demoFiyatYaz(konusma, [{ hizmet: 'Saç Kesim', fiyat: 500 }, { hizmet: 'Ense Tıraşı', fiyat: 150 }, { hizmet: 'Uydurma', fiyat: -5 }]);
  const hz = Object.fromEntries((await db.query('SELECT isim, fiyat FROM hizmetler')).rows.map(h => [h.isim, Number(h.fiyat)]));
  assert.strictEqual(hz['Saç Kesim'], 500);
  assert.strictEqual(hz['Ense Tıraşı'], 150);
  assert.strictEqual(hz['Uydurma'], undefined);
  assert.strictEqual(hz['Sakal Tıraşı'], 0, 'yazılmayan fiyat uydurulmaz');
  const d = await bot._demoDurum(konusma);
  assert.match(d.hizmetler, /Saç Kesim 500₺/);
});

test('satış AI: eski biçimdeki cevap (demo/fiyat alanı yok) yine kabul edilir', async () => {
  const ai = require(SRC + '/services/satisAI');
  process.env.DEEPSEEK_API_KEY = 'd';
  const eski = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"mesajlar":["Merhaba"],"durum":"olumlu","arama_istiyor":false}' } }] }) });
  try {
    const r = await ai.cevapUret({ konusma: { gelen_mesajlar: '[1] Müşteri: slm' }, sonMesaj: 'nasıl', demo: { gonderildi: false } });
    assert.strictEqual(r.demo_gonder, false);
    assert.deepStrictEqual(r.fiyatlar, []);
  } finally { global.fetch = eski; delete process.env.DEEPSEEK_API_KEY; }
});
