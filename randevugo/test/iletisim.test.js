// Landing "Beni arayın": geçersiz numara kayda/bildirime dönüşmez, geçerli numara kaydedilir.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('iletişim formu: sunucu telefonu doğrular', async () => {
  const { db } = await hazirla(`CREATE TABLE iletisim_mesajlari (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, telefon TEXT, mesaj TEXT, kaynak TEXT)`);
  const ctrl = require(path.join(SRC, 'controllers', 'adminController'));
  const cagir = async (body) => {
    const r = { kod: 200 };
    await ctrl.iletisimGonder({ body }, { status(k) { r.kod = k; return this; }, json(d) { r.veri = d; return this; } });
    return r;
  };
  for (const telefon of ['12', 'abc', '1234567890123456']) assert.equal((await cagir({ telefon, kaynak: 'landing' })).kod, 400, telefon);
  assert.equal((await db.query('SELECT 1 FROM iletisim_mesajlari')).rows.length, 0);
  assert.equal((await cagir({ telefon: '0532 123 45 67', kaynak: 'landing' })).kod, 200);
  assert.equal((await cagir({ isim: 'Ali', mesaj: 'merhaba' })).kod, 200);
  assert.equal((await db.query('SELECT 1 FROM iletisim_mesajlari')).rows.length, 2);
});
