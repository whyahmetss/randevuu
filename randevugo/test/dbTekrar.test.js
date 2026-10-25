// DB yeniden deneme (rapor doğrulaması, 2026-10-26): bağlantı sorgu yoldayken koparsa yazım sunucuda tamamlanmış
// olabilir; tekrar denemek çift kayıt üretir. Yazımlar yalnız bağlantı hiç kurulamadıysa tekrarlanır, okumalar her zaman.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const pool = require(path.join(__dirname, '..', 'src', 'config', 'db'));
const tekrar = pool._tekrarDenenebilir;
const hata = (code, message = 'x') => Object.assign(new Error(message), { code });

test('bağlantı kurulamadıysa yazım da tekrar denenir', () => {
  assert.equal(tekrar(hata('ECONNREFUSED'), 'INSERT INTO a VALUES (1)'), true);
  assert.equal(tekrar(hata(undefined, 'timeout exceeded when trying to connect'), 'UPDATE a SET b = 1'), true);
  assert.equal(tekrar(hata('57P03'), { text: 'DELETE FROM a' }), true);
});

test('sorgu yoldayken bağlantı koptuysa yazım tekrar denenmez, okuma denenir', () => {
  for (const e of [hata('ECONNRESET'), hata(undefined, 'Connection terminated unexpectedly'), hata('57P01')]) {
    assert.equal(tekrar(e, 'INSERT INTO a VALUES (1)'), false);
    assert.equal(tekrar(e, '  update a set b = 1'), false);
    assert.equal(tekrar(e, 'WITH x AS (INSERT INTO a VALUES (1) RETURNING *) SELECT * FROM x'), false);
    assert.equal(tekrar(e, 'SELECT pg_advisory_xact_lock(1)'), false);
    assert.equal(tekrar(e, 'SELECT id FROM a WHERE b = $1'), true);
    assert.equal(tekrar(e, { text: 'select * from a' }), true);
  }
});

test('geçici olmayan hata hiç tekrar denenmez', () => {
  assert.equal(tekrar(hata('23505', 'duplicate key'), 'SELECT 1'), false);
});
