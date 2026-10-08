const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('duyuru yayınlanınca hedef işletmelerin bildirimlerine düşer (demo/pasif hariç, paket hedefi uygulanır)', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false);
    CREATE TABLE isletme_bildirimleri (id SERIAL PRIMARY KEY, isletme_id INT, tip TEXT, baslik TEXT, mesaj TEXT, link TEXT, okundu BOOLEAN DEFAULT false, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    INSERT INTO isletmeler (isim, paket, aktif, demo) VALUES
      ('Lite Berber', 'baslangic', true, false), ('Standart Kuaför', 'profesyonel', true, false),
      ('Demo', 'baslangic', true, true), ('Pasif', 'kurumsal', false, false);`);
  const ctrl = require(SRC + '/controllers/adminController');
  assert.strictEqual(await ctrl.duyuruDagit({ id: 1, baslik: 'Bakım', mesaj: 'Gece 2-3 arası', hedef: 'hepsi' }), 2);
  assert.strictEqual(await ctrl.duyuruDagit({ id: 2, baslik: 'Yeni özellik', mesaj: 'Kasa', hedef: 'profesyonel' }), 1);
  const b = (await db.query("SELECT isletme_id, baslik FROM isletme_bildirimleri ORDER BY id")).rows;
  assert.deepStrictEqual(b.map(x => x.isletme_id), [1, 2, 2]);
  assert.match(b[0].baslik, /📢 Bakım/);
});
