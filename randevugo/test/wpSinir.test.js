// SıraGO numarası güvenlik sınırı: ısınma kademeleri, kuyruk sırası, günlük sınır ve mesai dışı bekleme.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('wpSinir: ısınma ve kuyruk', async () => {
  await hazirla(`CREATE TABLE satis_bot_numaralar (id SERIAL PRIMARY KEY, olusturma_tarihi TIMESTAMP);
    INSERT INTO satis_bot_numaralar (olusturma_tarihi) VALUES (NOW()), (NOW() - INTERVAL '30 days');`);
  const giden = [];
  const botYolu = require.resolve(path.join(SRC, 'services', 'satisBot'));
  require.cache[botYolu] = { id: botYolu, filename: botYolu, loaded: true,
    exports: { durum: 'bagli', gunlukGonderim: 0, sock: { sendMessage: async (jid, m) => giden.push([jid, m.text]) } } };
  const w = require(path.join(SRC, 'utils', 'wpSinir'));

  assert.equal((await w.numaraLimiti(1, 80)).limit, 10, 'yeni numara: 10');
  assert.equal((await w.numaraLimiti(2, 80)).limit, 50, 'eski numara: tavan 50');
  assert.equal((await w.numaraLimiti(2, 20)).limit, 20, 'ayar daha düşükse ayar');
  assert.deepEqual([w.isinmaLimiti(0), w.isinmaLimiti(5), w.isinmaLimiti(10), w.isinmaLimiti(100)], [10, 20, 35, 50]);

  w._test.bekleme(() => 1);
  w._test.saat(() => 12);
  const sonuclar = [];
  w.kuyrugaEkle([{ telefon: '05321112233', mesaj: 'a', sonra: (s) => sonuclar.push(s) }, { telefon: '+905321112244', mesaj: 'b' }]);
  await w._test.bitir(); await new Promise(r => setTimeout(r, 30));
  assert.deepEqual(giden, [['905321112233@s.whatsapp.net', 'a'], ['905321112244@s.whatsapp.net', 'b']]);
  assert.deepEqual(sonuclar, ['gonderildi']);
  assert.equal(require(botYolu).gunlukGonderim, 2, 'Satış Bot sayacına da yazılır');

  // Günlük sınır dolunca göndermez (kuyrukta bekler)
  w._test.sayac.n = w.ZOMBI_GUNLUK;
  w.kuyrugaEkle([{ telefon: '05321112255', mesaj: 'c' }]);
  await new Promise(r => setTimeout(r, 30));
  assert.equal(giden.length, 2);
  assert.equal(w._test.kuyruk.length, 1);
  w._test.kuyruk.length = 0;
});
