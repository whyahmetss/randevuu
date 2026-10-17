// İnsan devraldı (2026-10-17): Satış Bot numarasından telefonla elle yazılınca bot o sohbette susar
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, isletme_adi TEXT, kategori TEXT, gonderilen_mesaj TEXT, durum TEXT,
      gelen_mesajlar TEXT, son_mesaj_tarihi TIMESTAMP, sablon_id INT, lead_id INT, kayit_durum JSONB, kurulum_durum JSONB, ref_kullanici_id INT,
      bayi_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW());`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/058_insan_devraldi.sql', 'utf8'));
  return o;
})();

async function botHazirla() {
  const bot = require(SRC + '/services/satisBot');
  const giden = [];
  bot._yaz = async (s, j, t) => { giden.push(t); return t; };
  bot._telegramBildirimGonder = async () => {};
  bot.sock = { sendPresenceUpdate: async () => {} };
  bot.ayarlar.mesajBirlestir = false;
  bot.ayarlar.kayitAktif = false;
  const mesaj = async (tel, metin) => {
    const n = giden.length;
    await bot._mesajIsle({ key: { remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: metin } }, null, metin);
    return giden.slice(n);
  };
  return { bot, giden, mesaj };
}

test('telefondan elle yazılınca bot o sohbette susar; mesaj yine kayda geçer; süre dolunca geri döner', async (t) => {
  const { db } = await ortam;
  const { bot, mesaj } = await botHazirla();
  const tel = '905323933024';
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj) VALUES ($1, 'Elit Barber', 'musteri', 'x')", [tel]);
  assert.strictEqual((await mesaj(tel, 'merhaba')).length, 1, 'önce bot cevap veriyor');

  // Botun kendi mesajı devralma sayılmaz; telefondan yazılan sayılır
  t.mock.timers.enable({ apis: ['setTimeout'] });
  bot._botMesajiIsaretle('BOT1');
  bot._insanYazdiMi({ key: { id: 'BOT1', fromMe: true, remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: 'otomatik' } });
  t.mock.timers.tick(5000);
  await new Promise(r => setImmediate(r));
  assert.strictEqual((await db.query('SELECT insan_devraldi FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].insan_devraldi, null);
  bot._insanYazdiMi({ key: { id: 'TELEFON1', fromMe: true, remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: 'şifreniz yine tayfun1976' } });
  bot._insanYazdiMi({ key: { id: 'SIL1', fromMe: true, remoteJid: `${tel}@s.whatsapp.net` }, message: { protocolMessage: { type: 0 } } });
  t.mock.timers.tick(5000);
  t.mock.timers.reset();
  for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r));
  assert.ok((await db.query('SELECT insan_devraldi FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].insan_devraldi, 'devralındı');

  bot._destekCevap = {};
  assert.deepStrictEqual(await mesaj(tel, 'Şimdi fiyatlarımı belirliycem burada'), [], 'bot sustu');
  assert.match((await db.query('SELECT gelen_mesajlar FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].gelen_mesajlar, /fiyatlarımı belirliycem/);

  await db.query("UPDATE satis_konusmalar SET insan_devraldi = NOW() - INTERVAL '25 hours' WHERE telefon = $1", [tel]);
  assert.strictEqual((await mesaj(tel, 'yardım lazım')).length, 1, '24 saat sonra bot yine cevap veriyor');
});

test('elle yazılan yeni kişi: konuşma açılır, bot ne cevap verir ne soğuk mesaj/takip atar', async () => {
  const { db } = await ortam;
  const { bot, mesaj } = await botHazirla();
  const tel = '905304012096';
  const id = await bot.insanDevraldi(tel);
  const k = (await db.query('SELECT durum, insan_devraldi FROM satis_konusmalar WHERE id = $1', [id])).rows[0];
  assert.strictEqual(k.durum, 'elle');
  assert.ok(k.insan_devraldi);
  assert.deepStrictEqual(await mesaj(tel, 'Merhaba buradan alıyorsun'), []);
  assert.strictEqual(await bot.insanDevraldi('abc'), null, 'geçersiz numara yok sayılır');
});

test('otomatik karşılamaya cevap yok; ardından gelen "Merhabalar"a tek tanıtım; çapraz ikinci selama cevap yok', async () => {
  const { db } = await ortam;
  await db.exec(fs.readFileSync(SRC + '/migrations/061_otomatik_yanit.sql', 'utf8'));
  const { bot } = await botHazirla();
  const tel = '905056819811';
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj) VALUES ($1, 'Ersoy Güzellik', 'bekliyor', 'Merhaba, kolay gelsin')", [tel]);
  bot.ayarlar.mesajBirlestir = false;
  const giden = [];
  bot._yaz = async (s, j, t) => { giden.push(t); return t; };
  await bot.gelenMesajIsle({ key: { remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: 'Ersoy Güzellik Merkezi ile iletişime geçtiğiniz için teşekkürler! Size nasıl yardımcı olabiliriz? Çalışma saatlerimiz sabah 10.00 akşam 20.00dır.' } });
  assert.strictEqual(giden.length, 0, 'otomatik mesaja cevap yok');
  assert.match((await db.query('SELECT otomatik_yanit FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].otomatik_yanit, /Çalışma saatlerimiz/);
  await bot.gelenMesajIsle({ key: { remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: 'Merhabalar' } });
  assert.strictEqual(giden.length, 1, 'ilk gerçek cevaba tek tanıtım');
  assert.match(giden[0], /SıraGO'dan yazıyorum/);
  await bot.gelenMesajIsle({ key: { remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: 'Merhaba' } });
  assert.strictEqual(giden.length, 1, 'çapraz düşen ikinci selama cevap yok');
});
