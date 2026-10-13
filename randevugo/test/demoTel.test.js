// Demo numaraları: gerçek kişilere mesaj gitmez (eski demo numaraları dahil); WhatsApp ve SMS gönderimi engellenir.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('demo numaraları: tanınır ve WhatsApp/SMS gönderilmez', async () => {
  await hazirla('');
  const { demoTel, demoNumaraMi } = require(path.join(SRC, 'utils', 'demoTel'));
  assert.equal(demoTel(7), '+905990000007');
  for (const t of ['+905990000007', '05990000123', '905321000001', '+905321000015', '05551110002', '905321000001@s.whatsapp.net']) assert.ok(demoNumaraMi(t), t);
  for (const t of ['+905321000016', '05551110004', '05321234567', '']) assert.ok(!demoNumaraMi(t), t);

  const wa = require(path.join(SRC, 'services', 'whatsappWeb'));
  let giden = 0;
  wa.isletmeler[1] = { durum: 'bagli', sock: { sendMessage: async () => { giden++; } } };
  assert.equal((await wa.mesajGonder(1, '905321000003', 'test')).success, false);
  assert.equal((await wa.mesajGonder(1, demoTel(5), 'test')).success, false);
  assert.equal(giden, 0);
  assert.equal((await wa.mesajGonder(1, '905321234567', 'test')).success, true);
  assert.equal(giden, 1);
  delete wa.isletmeler[1];

  const sms = require(path.join(SRC, 'services', 'netgsm'));
  assert.equal((await sms.smsGonder(1, '+905321000004', 'x')).basarili, false);
});
