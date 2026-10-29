const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

test('kurulum: adımlar gerçek veriden, takılana her eşikte bir kez mesaj', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false, olusturma_tarihi TIMESTAMP, randevu_onay_modu TEXT DEFAULT 'otomatik');
    CREATE TABLE hizmetler (id SERIAL, isletme_id INT);
    CREATE TABLE calisanlar (id SERIAL, isletme_id INT);
    CREATE TABLE wa_auth_keys (isletme_id INT);
    CREATE TABLE randevular (id SERIAL, isletme_id INT);
    INSERT INTO isletmeler (isim, slug, telefon, olusturma_tarihi) VALUES
      ('Yeni', 'yeni', '905321112233', NOW() - INTERVAL '2 days'),
      ('Bugün', 'bugun', '905321112244', NOW() - INTERVAL '2 hours'),
      ('Demo', 'demo', '905321112255', NOW() - INTERVAL '2 days'),
      ('Telegram', 'tg', 'tg_12345', NOW() - INTERVAL '2 days');
    UPDATE isletmeler SET demo = true WHERE isim = 'Demo';
    INSERT INTO hizmetler (isletme_id) VALUES (1);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/026_kurulum.sql', 'utf8'));
  const k = require(SRC + '/services/kurulum');

  const d = await k.kurulumDurum(1);
  assert.strictEqual(d.tamam, 1);
  assert.deepStrictEqual(d.adimlar.map(a => a.tamam), [true, false, false, false]);

  const giden = [];
  const gonder = async (tel, m) => { giden.push([tel, m]); return { success: true }; };
  assert.strictEqual(await k.hatirlatmalariGonder({ gonder }), 1);
  assert.strictEqual(giden[0][0], '905321112233');
  assert.match(giden[0][1], /çalışan/i);
  assert.match(giden[0][1], /sayfa=calisanlar/);
  assert.strictEqual(await k.hatirlatmalariGonder({ gonder }), 0, 'aynı eşikte ikinci mesaj yok');
});

test('kurulum: WhatsApp isteğe bağlı — onsuz kurulum biter, WhatsApp için hatırlatma gitmez', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false, olusturma_tarihi TIMESTAMP, randevu_onay_modu TEXT DEFAULT 'otomatik');
    CREATE TABLE hizmetler (id SERIAL, isletme_id INT);
    CREATE TABLE calisanlar (id SERIAL, isletme_id INT);
    CREATE TABLE wa_auth_keys (isletme_id INT);
    CREATE TABLE randevular (id SERIAL, isletme_id INT);
    INSERT INTO isletmeler (isim, slug, telefon, olusturma_tarihi) VALUES ('Berber', 'berber', '905321112233', NOW() - INTERVAL '2 days');
    INSERT INTO hizmetler (isletme_id) VALUES (1);
    INSERT INTO calisanlar (isletme_id) VALUES (1);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/026_kurulum.sql', 'utf8'));
  delete require.cache[require.resolve(SRC + '/services/kurulum')];   // önceki testin veritabanını tutmasın
  const k = require(SRC + '/services/kurulum');

  let d = await k.kurulumDurum(1);
  assert.strictEqual(d.toplam, 3, 'WhatsApp adımı sayılmaz');
  assert.strictEqual(d.tamam, 2);
  assert.strictEqual(d.adimlar.find(a => a.anahtar === 'bot').istege_bagli, true);
  assert.strictEqual(d.bitti, false);

  // Sıradaki eksik WhatsApp değil, ilk randevu: hatırlatma randevu linki için
  const giden = [];
  await k.hatirlatmalariGonder({ gonder: async (tel, m) => { giden.push(m); return { success: true }; } });
  assert.strictEqual(giden.length, 1);
  assert.match(giden[0], /sayfa=qrkod/);
  assert.doesNotMatch(giden[0], /botbaglanti/);

  await db.exec('INSERT INTO randevular (isletme_id) VALUES (1)');
  d = await k.kurulumDurum(1);
  assert.strictEqual(d.bitti, true, 'WhatsApp bağlanmadan kurulum tamam');
});

test('077: WhatsApp bağlanmamış işletmenin randevu sayfası açılır, bağlı olup kapatana dokunulmaz', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, booking_acik BOOLEAN DEFAULT false);
    CREATE TABLE wa_auth_keys (isletme_id INT);
    INSERT INTO isletmeler (isim, booking_acik) VALUES ('Bağlanmamış', false), ('Bağlı kapattı', false), ('Açık', true);
    INSERT INTO wa_auth_keys VALUES (2);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/077_booking_whatsappsiz.sql', 'utf8'));
  const r = (await db.query('SELECT booking_acik FROM isletmeler ORDER BY id')).rows.map(x => x.booking_acik);
  assert.deepStrictEqual(r, [true, false, true]);
  await db.exec("INSERT INTO isletmeler (isim) VALUES ('Yeni')");
  assert.strictEqual((await db.query("SELECT booking_acik FROM isletmeler WHERE isim = 'Yeni'")).rows[0].booking_acik, true, 'yeni hesap açık başlar');
});
