const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('şube limiti: Pro+ en fazla 3 aktif şube, paket düşünce fazlası kapanır', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT, grup_id INT, aktif BOOLEAN DEFAULT true,
      paket_bitis_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP);
    INSERT INTO isletmeler (isim, paket, grup_id) VALUES ('Merkez','proplus',1), ('Ş2','proplus',1), ('Ş3','proplus',1), ('Ş4','proplus',1);`);
  const { grupLimit, subeIzinli } = require(SRC + '/utils/subeLimit');

  const g = await grupLimit(1);
  assert.strictEqual(g.limit, 3);
  assert.strictEqual(g.aktifler.length, 4);
  assert.strictEqual(await subeIzinli(1, 1), true);
  assert.strictEqual(await subeIzinli(3, 1), true);
  assert.strictEqual(await subeIzinli(4, 1), false, '4. şube Pro+ sınırının dışında');

  await db.query("UPDATE isletmeler SET paket='profesyonel' WHERE id=1");
  assert.strictEqual(await subeIzinli(1, 1), true, 'merkez her zaman açık');
  assert.strictEqual(await subeIzinli(2, 1), false, 'Standart pakette şube yok');
});
