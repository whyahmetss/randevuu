// Satış Bot kime cevap verir (2026-10-20): numaralar ekibin kişisel telefonları. Arkadaş, aile, zaten müşterimiz olan
// esnaf ve kanallar satış cevabı almaz; botun yazdığı aday, QR kart / "kayıt" / SıraGO diye yazan esnaf alır.
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

const ortam = hazirla(`
  CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, isletme_adi TEXT, kategori TEXT, gonderilen_mesaj TEXT, durum TEXT,
    gelen_mesajlar TEXT, son_mesaj_tarihi TIMESTAMP, sablon_id INT, lead_id INT, kayit_durum JSONB, kurulum_durum JSONB, ref_kullanici_id INT,
    bayi_id INT, kayit_isletme_id INT, insan_devraldi TIMESTAMP, red_tipi TEXT, otomatik_yanit TEXT, demo_gonderildi BOOLEAN, numara_id INT,
    olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, demo BOOLEAN DEFAULT false);
  CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, telefon TEXT, kategori TEXT, durum TEXT, wp_mesaj_durumu TEXT,
    wp_mesaj_tarihi TIMESTAMP, puan NUMERIC, ilce TEXT, sehir TEXT, yorum_sayisi INT, kaynak TEXT);
  CREATE TABLE satis_bot_sablonlar (id SERIAL PRIMARY KEY, aktif BOOLEAN, kampanya_id INT, kategori TEXT, min_puan NUMERIC, mesaj TEXT, gonderilen INT DEFAULT 0);
  INSERT INTO isletmeler (isim, telefon) VALUES ('Elit Barber Shop', '05323933024');
  INSERT INTO isletmeler (isim, telefon, demo) VALUES ('Demo Berber', '05559998877', true);`);

let sira = 0;   // mesaj kimlikleri testler arasında da tekil (bot aynı kimliği iki kez işlemez)
function botHazirla() {
  const bot = require(SRC + '/services/satisBot');
  const giden = [];
  const okunan = [];
  bot._yaz = async (s, j, t) => { giden.push(t); return t; };
  bot._telegramBildirimGonder = async () => {};
  bot.sock = { sendPresenceUpdate: async () => {}, readMessages: async (k) => okunan.push(...k) };
  bot.ayarlar.mesajBirlestir = false;
  bot.ayarlar.kayitAktif = false;
  bot.ayarlar.mod = 'hepsi';
  bot.ayarlar.gelenMesajCevap = true;
  const yaz = async (tel, metin, ek = {}) => {
    const n = giden.length;
    await bot.gelenMesajIsle({ key: { id: `M${++sira}`, remoteJid: ek.jid || `${tel}@s.whatsapp.net` }, message: ek.message || { conversation: metin } }, null);
    return giden.slice(n);
  };
  return { bot, giden, okunan, yaz };
}

test('arkadaş ya da aile yazınca cevap yok, kayıt açılmaz, okundu da yapılmaz', async () => {
  const { db } = await ortam;
  const { yaz, okunan } = botHazirla();
  assert.deepStrictEqual(await yaz('905441112233', 'Akşam maça geliyor musun'), []);
  assert.deepStrictEqual(await yaz('905441112233', 'Randevu aldım yarın dişçiye gidiyorum'), [], '"randevu" kelimesi tek başına satış sözü değil');
  assert.strictEqual((await db.query("SELECT COUNT(*)::int AS n FROM satis_konusmalar WHERE telefon = '905441112233'")).rows[0].n, 0);
  assert.strictEqual(okunan.length, 0, 'arkadaşın mesajı okundu yapılmaz (telefon sahibi görmeden mavi tik olmasın)');
});

test('zaten müşterimiz olan esnafa satış cevabı gitmez (Tayfun abi canlı hatası)', async () => {
  const { db } = await ortam;
  const { yaz } = botHazirla();
  assert.deepStrictEqual(await yaz('905323933024', 'Merhaba bugün iki tane müşterim randevu aldı yarın için fakat kendilerine bildirim gitmedi bir bakar mısın'), []);
  assert.deepStrictEqual(await yaz('905323933024', 'SıraGO panelde şifremi unuttum'), [], 'SıraGO dese de müşteriye satış konuşması yok');
  assert.strictEqual((await db.query("SELECT COUNT(*)::int AS n FROM satis_konusmalar WHERE telefon = '905323933024'")).rows[0].n, 0);
});

test('QR kart, "kayıt" ya da SıraGO diye kendisi yazan esnafa cevap gider; demo dükkânın numarası müşteri sayılmaz', async () => {
  const { db } = await ortam;
  const { yaz } = botHazirla();
  assert.strictEqual((await yaz('905301234567', "Merhaba, SıraGO'yu denemek istiyorum (kart: S12)")).length, 1);
  assert.strictEqual((await db.query("SELECT ref_kullanici_id FROM satis_konusmalar WHERE telefon = '905301234567'")).rows[0].ref_kullanici_id, 12);
  assert.strictEqual((await yaz('905301234567', 'fiyatı ne kadar')).length, 1, 'sohbet sürer: önceki mesajı satış sözüydü');
  assert.strictEqual((await yaz('905559998877', 'sirago nedir')).length, 1, 'demo dükkân gerçek müşteri değil');
});

test('botun ilk yazdığı adaya cevap gider; ekibin elle yazdığı kişiye gitmez; kanal ve yayın mesajları yok sayılır', async () => {
  const { db } = await ortam;
  const { bot, yaz } = botHazirla();
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, lead_id) VALUES ('905337776655', 'Makas', 'bekliyor', 'Merhaba, kolay gelsin', 7)");
  assert.strictEqual((await yaz('905337776655', 'Kimsiniz')).length, 1);
  await bot.insanDevraldi('905448889900', 'naber kanka');
  assert.deepStrictEqual(await yaz('905448889900', 'iyidir sen? sirago ne'), []);
  assert.deepStrictEqual(await yaz('x', 'Yeni kampanya!', { jid: '120363001122334455@newsletter' }), []);
  assert.deepStrictEqual(await yaz('x', 'Toplu mesaj', { jid: '1234567890@broadcast' }), []);
});

test('kaybolan mesaj sarmalayıcısı açılır; sesli mesaj yalnız satış sohbetinde yazıya çevrilir', async () => {
  const { db } = await ortam;
  const { yaz } = botHazirla();
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, lead_id) VALUES ('905321110000', 'Usta', 'bekliyor', 'Merhaba, kolay gelsin', 8)");
  assert.ok((await yaz('905321110000', null, { message: { ephemeralMessage: { message: { extendedTextMessage: { text: 'nasıl çalışıyor' } } } } })).length > 0);

  const sm = require(SRC + '/services/sesliMesaj');
  const eski = sm.metneCevir;
  const cevrilen = [];
  sm.metneCevir = async (msg, o) => { cevrilen.push(o.telefon); return { metin: 'fiyatı ne kadar' }; };
  try {
    const ses = { audioMessage: { seconds: 5, mimetype: 'audio/ogg' } };
    assert.ok((await yaz('905321110000', null, { message: ses })).length > 0, 'adayın sesli mesajı cevaplanır');
    assert.match((await db.query("SELECT gelen_mesajlar FROM satis_konusmalar WHERE telefon = '905321110000'")).rows[0].gelen_mesajlar, /Müşteri: fiyatı ne kadar/);
    assert.deepStrictEqual(await yaz('905449990000', null, { message: ses }), [], 'tanımadık kişinin sesi açılmaz bile');
    assert.deepStrictEqual(cevrilen, ['905321110000']);
  } finally { sm.metneCevir = eski; }
});

test('hesabı açmayı kabul eden adayda "kayıt" yazması beklenmez, kayıt soruları başlar', async () => {
  const { db } = await ortam;
  const { bot, yaz, giden } = botHazirla();
  bot.ayarlar.kayitAktif = true;
  bot._kayitDurumKaydet = async () => {};
  bot._kayitDurumYukle = async () => null;
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, durum, gonderilen_mesaj, lead_id) VALUES ('905325554433', 'Kral Berber', 'berber', 'ai_devrede', 'Merhaba, kolay gelsin', 9)");
  const ai = require(SRC + '/services/satisAI');
  const eski = { aktifMi: ai.aktifMi, cevapUret: ai.cevapUret };
  let baglam = null;
  ai.aktifMi = () => true;
  ai.cevapUret = async (x) => { baglam = x; return { mesajlar: ['Tamam, hemen başlıyorum.'], durum: 'sicak', arama_istiyor: false, demo_gonder: false, fiyatlar: [], kayit_baslat: true }; };
  try {
    const n = giden.length;
    await yaz('905325554433', 'olur tamam');
    const yeni = giden.slice(n);
    assert.strictEqual(yeni.length, 1);
    assert.match(yeni[0], /hesabınızı hemen açalım/);
    assert.match(yeni[0], /Kral Berber/, 'işletme adı onaya sorulur');
    assert.strictEqual(bot.konusmalar['905325554433'].kayit.adim, 'isletme_adi');
    assert.strictEqual(baglam.guven, bot.ayarlar.guvenMetni);
  } finally { Object.assign(ai, eski); delete bot.konusmalar['905325554433']; }
});

test('soğuk mesaj zaten müşterimiz olan esnafa gitmez; giden mesaj hangi numaradan çıktıysa konuşmaya yazılır', async () => {
  const { db } = await ortam;
  const { bot } = botHazirla();
  const gonderilen = [];
  const sock = {
    user: { id: '905550000001:3@s.whatsapp.net' },
    onWhatsApp: async (j) => [{ exists: true, jid: String(j).includes('@') ? j : `${j}@s.whatsapp.net` }],
    presenceSubscribe: async () => {}, sendPresenceUpdate: async () => {},
    sendMessage: async (jid, m) => { gonderilen.push([jid, m.text]); return { key: { id: 'G' + gonderilen.length } }; },
  };
  bot.ayarlar.typingMinMs = 500; bot.ayarlar.typingMaxMs = 500;
  await db.query("INSERT INTO potansiyel_musteriler (isletme_adi, telefon, kategori, durum) VALUES ('Elit Barber Shop', '0532 393 30 24', 'berber', 'yeni'), ('Yeni Berber', '0532 444 55 66', 'berber', 'yeni')");
  const [elit, yeni] = (await db.query('SELECT * FROM potansiyel_musteriler ORDER BY id')).rows;
  await bot._numaraMesajGonder({ numaraId: 4, sock }, elit);
  assert.strictEqual(gonderilen.length, 0);
  assert.strictEqual((await db.query('SELECT wp_mesaj_durumu FROM potansiyel_musteriler WHERE id = $1', [elit.id])).rows[0].wp_mesaj_durumu, 'zaten_musteri');
  await bot._numaraMesajGonder({ numaraId: 4, sock }, yeni);
  assert.strictEqual(gonderilen.length, 1);
  assert.strictEqual((await db.query("SELECT numara_id FROM satis_konusmalar WHERE telefon = '905324445566'")).rows[0].numara_id, 4);
});

test('takip mesajı ilk mesajı atan numaradan gider; o numara bağlı değilse başka numaradan gitmez', async () => {
  const { db } = await ortam;
  const { bot } = botHazirla();
  const atilan = [];
  const sockYap = (ad) => ({ user: { id: ad }, presenceSubscribe: async () => {}, sendPresenceUpdate: async () => {},
    sendMessage: async (jid, m) => { atilan.push([ad, jid, m.text]); return { key: { id: 'T' + atilan.length } }; } });
  bot.numaraSockets.set(5, { numaraId: 5, durum: 'bagli', sock: sockYap('A') });
  bot.numaraSockets.set(6, { numaraId: 6, durum: 'bagli', sock: sockYap('B') });
  try {
    await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, numara_id) VALUES ('905327778899', 'Usta', 'bekliyor', 'Merhaba', 6)");
    const k = (await db.query("SELECT * FROM satis_konusmalar WHERE telefon = '905327778899'")).rows[0];
    bot.ayarlar.maxTakipSayisi = 2;
    const eskiZaman = global.setTimeout;
    global.setTimeout = (f) => { f(); return 0; };
    try { await bot.takipMesajGonder(k); } finally { global.setTimeout = eskiZaman; }
    assert.deepStrictEqual(atilan.map(x => x[0]), ['B']);
    assert.doesNotMatch(atilan[0][2], /Usta için|\*kay/, 'takipte işletme adı ve *kayıt* komutu yok');
    bot.numaraSockets.get(6).durum = 'kapali';
    await bot.takipMesajGonder({ ...k, takip_sayisi: 1 });
    assert.strictEqual(atilan.length, 1, 'numara 6 bağlı değil: numara 5 "yazmıştım" demez');
  } finally { bot.numaraSockets.delete(5); bot.numaraSockets.delete(6); }
});

test('bir numarada sohbet sürerken o numara yeni kişiye "Merhaba" atmaz', async () => {
  await ortam;
  const { bot } = botHazirla();
  bot.aktif = true;
  bot.ayarlar.tatil = false; bot.ayarlar.mesaiBaslangic = 0; bot.ayarlar.mesaiBitis = 24; bot.ayarlar.sohbetteBekleDk = 5;
  bot.numaraSockets.set(9, { numaraId: 9, durum: 'bagli', sock: { user: { id: '905550000009@s.whatsapp.net' } } });
  bot._numaraSohbet = new Map([[9, Date.now()]]);
  let leadArandi = false;
  const eski = bot.siradakiLeadGetir;
  bot.siradakiLeadGetir = async () => { leadArandi = true; return null; };
  try {
    await bot._numaraGonderim(9);
    assert.strictEqual(leadArandi, false, 'sohbet varken yeni aday aranmadı');
    assert.ok(bot.numaraTimers.has(9), 'bir dakika sonra yeniden bakar');
  } finally {
    clearTimeout(bot.numaraTimers.get(9)); bot.numaraTimers.delete(9);
    bot.numaraSockets.delete(9); bot.siradakiLeadGetir = eski; bot.aktif = false; bot._numaraSohbet = new Map();
  }
});

// Canlı 2026-10-20: "Teşekkür ederim"e "Rica ederim, nasıl yardımcı olabilirim?", "kim olduğunuzu bilmiyorum"a tanıtımsız veda
test('bot kendini tanıtmadan cevap vermez: tanıtımsız ilk cevap ve tanıtımsız veda düzeltilir; tanıttıktan sonra dokunulmaz', async () => {
  const { db } = await ortam;
  const { yaz } = botHazirla();
  const ai = require(SRC + '/services/satisAI');
  const eski = { aktifMi: ai.aktifMi, cevapUret: ai.cevapUret };
  let siradaki = null;
  ai.aktifMi = () => true;
  ai.cevapUret = async () => siradaki;
  try {
    await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, lead_id) VALUES ('905457259801', 'Mimar Sinan', 'bekliyor', 'Merhaba, kolay gelsin', 11)");
    siradaki = { mesajlar: ['Rica ederim, nasıl yardımcı olabilirim?'], durum: 'bekliyor', arama_istiyor: false, demo_gonder: false, fiyatlar: [] };
    const ilk = await yaz('905457259801', 'Teşekkür ederim');
    assert.strictEqual(ilk.length, 1, 'tanıtım tek mesaj, soru yok (2026-10-29)');
    assert.match(ilk[0], /^SıraGO randevu yönetimi hizmetimiz için rahatsız etmiştim/);
    assert.doesNotMatch(ilk.join(' '), /nasıl yardımcı olabilirim/);

    siradaki = { mesajlar: ['Anladım, kusura bakmayın.'], durum: 'olumlu', arama_istiyor: false, demo_gonder: false, fiyatlar: [] };
    assert.deepStrictEqual(await yaz('905457259801', 'nasıl yani'), ['Anladım, kusura bakmayın.'], 'tanıttıktan sonra yapay zekâ cevabına dokunulmaz');

    await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, lead_id) VALUES ('905457259802', 'Usta', 'bekliyor', 'Merhaba, kolay gelsin', 12)");
    siradaki = { mesajlar: ['Anladım, rahatsız ettiysem kusura bakmayın.'], durum: 'olumsuz', arama_istiyor: false, demo_gonder: false, fiyatlar: [] };
    const veda = await yaz('905457259802', 'kim olduğunuzu bilmiyorum, yardımcı olabileceğiniz bir husus olduğunu düşünmüyorum');
    assert.match(veda[0], /^Kısaca söyleyeyim, .*adı SıraGO/);
    assert.match(veda[1], /Kolay gelsin/i);

    await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gonderilen_mesaj, lead_id) VALUES ('905457259803', 'Usta 2', 'bekliyor', 'Merhaba, kolay gelsin', 13)");
    const ret = await yaz('905457259803', 'ilgilenmiyorum');
    assert.match(ret[0], /adı SıraGO/, 'kural yedeğinin vedası da tanıtımlı');
  } finally { Object.assign(ai, eski); }
});

// Canlı 2026-10-22: ikinci cevapta tanıtım + aynı soru tekrar gitti; diş kliniğine "Berber ve kuaförlere" yazıldı
test('tanıtım yalnız ilk cevapta; önceki bot cevabı marka anmasa da tekrarlanmaz; tanıtım sektöre göre', async () => {
  const { db } = await ortam;
  const { yaz } = botHazirla();
  const ai = require(SRC + '/services/satisAI');
  const eski = { aktifMi: ai.aktifMi, cevapUret: ai.cevapUret };
  ai.aktifMi = () => true;
  ai.cevapUret = async () => ({ mesajlar: ['Anladım. Telefonla gelenleri kaçırdığınız oluyor mu?'], durum: 'olumlu', arama_istiyor: false, demo_gonder: false, fiyatlar: [] });
  try {
    await db.query(`INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, durum, gonderilen_mesaj, lead_id, gelen_mesajlar)
      VALUES ('905332060206', 'Kaya Diş', 'diş kliniği', 'ai_devrede', 'Merhaba, kolay gelsin', 21,
        E'\\n[12:27] Müşteri: Merhaba\\n[12:28] Bot: Siz randevuları şu an genelde telefonla mı alıyorsunuz?')`);
    assert.deepStrictEqual(await yaz('905332060206', 'Yok efendim olmuyor'), ['Anladım. Telefonla gelenleri kaçırdığınız oluyor mu?']);

    await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, durum, gonderilen_mesaj, lead_id) VALUES ('905332060207', 'Gülüş Diş', 'diş kliniği', 'bekliyor', 'Merhaba, kolay gelsin', 22)");
    ai.cevapUret = async () => ({ mesajlar: ['Rica ederim'], durum: 'bekliyor', arama_istiyor: false, demo_gonder: false, fiyatlar: [] });
    const ilk = await yaz('905332060207', 'Teşekkürler');
    assert.match(ilk[0], /^SıraGO randevu yönetimi/, 'tanıtım sektör adı geçirmez (2026-10-29); yanlış sektöre yazılamaz');
    assert.doesNotMatch(ilk[0], /Berber/);
  } finally { Object.assign(ai, eski); }
});
