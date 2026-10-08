const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

test('yalnız teşekkür/kapanış mesajlarına cevap verilmez, soru içerenlere verilir', async () => {
  await hazirla('');
  const { yalnizNezaket } = require(SRC + '/services/satisBot')._test;
  for (const m of ['Teşekkürler', 'çok teşekkür ederim', 'sağolun abi', 'Kolay gelsin', '👍', '🙏🙏', 'eyvallah usta', 'Teşekkürler\nİyi çalışmalar'])
    assert.strictEqual(yalnizNezaket(m), true, m);
  for (const m of ['teşekkürler fiyat ne', 'evet', 'tamam', 'nasıl çalışıyor', 'teşekkürler gerek yok ama kaç para', 'merhaba'])
    assert.strictEqual(yalnizNezaket(m), false, m);
});
