const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

test('kurulum: adımlar gerçek veriden, takılana her eşikte bir kez mesaj', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false, olusturma_tarihi TIMESTAMP);
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
