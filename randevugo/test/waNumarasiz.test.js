// Numarasız "kapıdan gelen" müşteri (kapi52…) ve Telegram müşterisine (tg:…) WhatsApp mesajı gönderilmez. Canlı hata
// (2026-10-31): 15 dk hatırlatması kapi… adresine gidince sendMessage 25 sn asılı kaldı, o sırada gelen müşteri mesajı da
// cevapsız kaldı.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('mesajGonder: WhatsApp numarası olmayan hedefe gönderilmez, gerçek numaraya gönderilir', async () => {
  await hazirla('');
  const wa = require(path.join(SRC, 'services', 'whatsappWeb'));
  const giden = [];
  wa.isletmeler[1] = { durum: 'bagli', sock: { sendMessage: async (jid) => { giden.push(jid); return {}; } } };
  for (const hedef of ['kapi521730000000000', 'tg:123456']) {
    const r = await wa.mesajGonder(1, hedef, 'Randevunuza 15 dk kaldı');
    assert.strictEqual(r.success, false, hedef);
  }
  assert.deepStrictEqual(giden, [], 'sock.sendMessage hiç çağrılmadı');
  assert.strictEqual((await wa.mesajGonder(1, '905551234567', 'x')).success, true);
  assert.strictEqual((await wa.mesajGonder(1, '905551234567@s.whatsapp.net', 'x')).success, true);
  assert.deepStrictEqual(giden, ['905551234567@s.whatsapp.net', '905551234567@s.whatsapp.net']);
  delete wa.isletmeler[1];
});
