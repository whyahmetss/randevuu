// 2026-10-20: varsayılan (samimi) üslupta bot aynı müşteriye hem "siz" hem "sen" diyordu; hizmet ikonu hep ✂️ idi
const test = require('node:test');
const assert = require('node:assert');
const { SRC } = require('./yardimci');

test('samimi üslup "siz" der; hizmet ikonu sektöre göre', () => {
  const bm = require(SRC + '/utils/botMesajlar');
  const p = { isletmeAd: 'Diş Kliniği', hizmetAd: 'Kontrol', tarihStr: '20 Ekim', saatStr: '14:00', calisanAd: 'Dr. Ayşe' };
  const berber = bm.get({ isim: 'x', bot_konusma_stili: 'samimi', kategori: 'berber', bot_diller: 'tr' }, 'randevuOnaylandi', p);
  assert.match(berber, /Randevunuz Oluşturuldu/);
  assert.doesNotMatch(berber, /Randevun Oluşturuldu/);
  assert.match(berber, /✂️ Kontrol/);
  const disci = bm.get({ isim: 'x', kategori: 'disci', bot_diller: 'tr' }, 'randevuOnaylandi', p);
  assert.match(disci, /🦷 Kontrol/);
  assert.doesNotMatch(disci, /✂️/);
});
