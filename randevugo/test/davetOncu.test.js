const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = hazirla(`
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT, referans_kodu TEXT, referans_ile_gelen INT,
    referans_odeme_tetiklendi BOOLEAN DEFAULT false, demo BOOLEAN DEFAULT false);
  CREATE TABLE referanslar (id SERIAL PRIMARY KEY, referans_kodu VARCHAR(50) UNIQUE NOT NULL, sahip_isletme_id INT,
    kazanilan_ay INT DEFAULT 0, toplam_davet INT DEFAULT 0);
  INSERT INTO isletmeler (isim, paket) VALUES ('Davet Eden', 'profesyonel'), ('Yeni', 'baslangic'), ('Kendi', 'baslangic');`);

test('davet: kod bir kez üretilir, yeni işletme bağlanır, ikinci kez/kendi kodu bağlanmaz', async () => {
  const { db } = await ortam;
  const d = require(SRC + '/utils/davet');
  const kod = await d.davetKodu(1);
  assert.match(kod, /^SG[A-Z0-9]{6}$/);
  assert.strictEqual(await d.davetKodu(1), kod);
  assert.strictEqual(await d.davetUygula(kod.toLowerCase(), 2), 1);
  assert.strictEqual(await d.davetUygula(kod, 2), null, 'ikinci kez bağlanmaz');
  assert.strictEqual(await d.davetUygula(kod, 1), null, 'kendi kodu');
  assert.strictEqual(await d.davetUygula('YOKBOYLE', 3), null);
  await db.query('UPDATE isletmeler SET referans_odeme_tetiklendi = true WHERE id = 2');
  const b = await d.davetBilgi(1);
  assert.deepStrictEqual([b.gelen, b.odeyen, b.kazanilan_ay], [1, 1, 1]);
  assert.match(b.link, /\/\?davet=SG/);
});

test('Öncü Esnaf: ilk ödeyen #1, fiyat kilitlenir, liste fiyatı artsa da kilitli fiyat geçer, 100 dolunca kapanır', async () => {
  const { db } = await ortam;
  await db.exec(fs.readFileSync(SRC + '/migrations/029_davet_oncu.sql', 'utf8'));
  const o = require(SRC + '/utils/oncu');
  assert.strictEqual(await o.oncuOdeme(2, 'baslangic', 299), 1);
  assert.strictEqual(await o.oncuOdeme(2, 'baslangic', 299), 1, 'tekrar ödeme yeni numara almaz');
  assert.strictEqual(await o.oncuOdeme(1, 'profesyonel', 699), 2);
  const i = (await db.query('SELECT * FROM isletmeler WHERE id = 2')).rows[0];
  assert.strictEqual(o.etkinFiyat(i, 'baslangic', 399), 299, 'zam yansımaz');
  assert.strictEqual(o.etkinFiyat(i, 'baslangic', 249), 249, 'indirim olursa düşük olan');
  assert.strictEqual(o.etkinFiyat(i, 'profesyonel', 699), 699, 'başka paket liste fiyatı');
  await o.oncuOdeme(2, 'profesyonel', 699);
  assert.strictEqual(Number((await db.query('SELECT kilitli_fiyat FROM isletmeler WHERE id = 2')).rows[0].kilitli_fiyat), 699, 'paket değişince yeni paket kilitlenir');

  await db.query("INSERT INTO isletmeler (isim, oncu_no) SELECT 'x' || g, g + 2 FROM generate_series(1, 98) g");
  assert.strictEqual((await o.oncuDurum(3)).kalan, 0);
  assert.strictEqual(await o.oncuOdeme(3, 'baslangic', 299), null, '101. esnafa yer yok');
});
