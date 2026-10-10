const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

const ortam = hazirla(`
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, kategori TEXT, aktif BOOLEAN, paket TEXT,
    olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, demo BOOLEAN DEFAULT false, referans_kodu TEXT,
    referans_ile_gelen INT, kayit_kanali TEXT);
  CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT UNIQUE, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN);
  CREATE TABLE referanslar (id SERIAL PRIMARY KEY, referans_kodu VARCHAR(50) UNIQUE NOT NULL, sahip_isletme_id INT, kazanilan_ay INT DEFAULT 0, toplam_davet INT DEFAULT 0);
  CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, kayit_durum JSONB, kayit_isletme_id INT, durum TEXT, lead_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, durum TEXT);
  INSERT INTO isletmeler (isim) VALUES ('Davet Eden Berber');
  INSERT INTO referanslar (referans_kodu, sahip_isletme_id) VALUES ('SGABC123', 1);`);

test('WhatsApp kaydı: e-postadan sonra davet kodu sorulur, yanlış kod reddedilir, doğru kod bağlanır', async () => {
  const { db } = await ortam;
  const bot = require(SRC + '/services/satisBot');
  bot._telegramBildirimGonder = async () => {};
  const giden = [];
  bot._yaz = async (s, j, t) => { giden.push(t); return t; };
  const tel = '905321112299';
  bot.konusmalar[tel] = { kayit: { adim: 'isletme_adi' } };
  const yaz = (m) => bot.kayitAkisi('x', tel, m, {});
  await yaz('Yeni Kuaför');
  await yaz('yeni@ornek.com');
  assert.match(giden.at(-1), /Davet kodunu/);
  await yaz('SGZZZ999');
  assert.match(giden.at(-1), /bulamadım/);
  await yaz('sgabc123');
  assert.match(giden.at(-1), /şifre/);
  await yaz('kisa');
  assert.match(giden.at(-1), /8 ile 72/);
  await yaz('gizlisifre1');
  const i = (await db.query("SELECT referans_ile_gelen, kayit_kanali FROM isletmeler WHERE isim = 'Yeni Kuaför'")).rows[0];
  assert.deepStrictEqual([i.referans_ile_gelen, i.kayit_kanali], [1, 'davet']);
});

test('WhatsApp kaydı: "yok" diyen davetsiz devam eder', async () => {
  const { db } = await ortam;
  const bot = require(SRC + '/services/satisBot');
  const tel = '905321112298';
  bot.konusmalar[tel] = { kayit: { adim: 'isletme_adi' } };
  for (const m of ['Davetsiz Berber', 'davetsiz@ornek.com', 'yok', 'gizlisifre2']) await bot.kayitAkisi('x', tel, m, {});
  const i = (await db.query("SELECT referans_ile_gelen FROM isletmeler WHERE isim = 'Davetsiz Berber'")).rows[0];
  assert.strictEqual(i.referans_ile_gelen, null);
});

test('Telegram kaydı: davet kodu adımı, "kodum yok" butonu ve bağlama', async () => {
  const { db } = await ortam;
  const tg = require(SRC + '/services/telegramSatisBot');
  const giden = [];
  tg.bot = { sendMessage: async (c, t) => { giden.push(t); } };
  tg.kayitlar = {};
  tg.kayitlar[7] = { adim: 'isletme_adi' };
  await tg.kayitAdimi(7, 'TG Salon');
  await tg.kayitAdimi(7, 'tg@ornek.com');
  assert.match(giden.at(-1), /Davet kodunu/);
  await tg.kayitAdimi(7, 'SGABC123');
  assert.match(giden.at(-1), /Davet kodu alındı/);
  await tg.kayitAdimi(7, 'gizlisifre3');
  await tg.kayitTamamla(7);
  const i = (await db.query("SELECT referans_ile_gelen FROM isletmeler WHERE isim = 'TG Salon'")).rows[0];
  assert.strictEqual(i.referans_ile_gelen, 1);

  tg.kayitlar[8] = { adim: 'isletme_adi' };
  await tg.kayitAdimi(8, 'TG Davetsiz');
  await tg.kayitAdimi(8, 'tg2@ornek.com');
  await tg.butonIsle({ message: { chat: { id: 8 } }, data: 'kayit_davetsiz' });
  assert.strictEqual(tg.kayitlar[8].adim, 'sifre');
});
