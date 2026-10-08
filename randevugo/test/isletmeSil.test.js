const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('işletme tüm bağlı kayıtlarıyla silinir, ortak kayıtlar korunur', async () => {
  const { db, pool } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT NOT NULL REFERENCES isletmeler(id), isim TEXT);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT NOT NULL REFERENCES isletmeler(id), hizmet_id INT NOT NULL REFERENCES hizmetler(id));
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, son_gelinen_isletme_id INT REFERENCES isletmeler(id));
    CREATE TABLE eski_tablo (id SERIAL PRIMARY KEY, isletme_id INT);
    INSERT INTO isletmeler (isim) VALUES ('Silinecek'), ('Kalacak');
    INSERT INTO hizmetler (isletme_id, isim) VALUES (1,'Kesim'), (2,'Kesim');
    INSERT INTO randevular (isletme_id, hizmet_id) VALUES (1,1), (2,2);
    INSERT INTO musteriler (son_gelinen_isletme_id) VALUES (1);
    INSERT INTO eski_tablo (isletme_id) VALUES (1), (2);`);
  const { isletmeTamSil } = require(SRC + '/utils/isletmeSil');

  assert.strictEqual(await isletmeTamSil(pool, 1), 1);
  const say = async (t) => (await db.query(`SELECT COUNT(*)::int c FROM ${t}`)).rows[0].c;
  assert.strictEqual(await say('isletmeler'), 1);
  assert.strictEqual(await say('hizmetler'), 1);
  assert.strictEqual(await say('randevular'), 1);
  assert.strictEqual(await say('eski_tablo'), 1);
  assert.strictEqual(await say('musteriler'), 1, 'müşteri silinmez');
  assert.strictEqual((await db.query('SELECT son_gelinen_isletme_id FROM musteriler')).rows[0].son_gelinen_isletme_id, null);
});
