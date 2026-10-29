// Hizmet notu (2026-10-29): berber "saç tıraşına yüz bakımı hediye" yazmak istedi; açıklama alanı müşteriye hiç görünmüyordu.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { SRC } = require('./yardimci');

test('hizmet notu: bot listelerinde hizmetin altında, yapay zekâ isteminde not olarak', () => {
  const { notSatiri, yzHizmet, hizmetNotu } = require(path.join(SRC, 'utils', 'hizmetNotu'));
  const h = { isim: 'Saç Kesimi', sure_dk: 30, fiyat: 500, aciklama: '  🎁 Yüz ve saç\nbakımı hediye  ' };
  assert.equal(hizmetNotu(h), '🎁 Yüz ve saç bakımı hediye');
  assert.equal(notSatiri(h), '\n   _🎁 Yüz ve saç bakımı hediye_');
  assert.equal(notSatiri({ isim: 'Sakal' }), '', 'notu olmayan hizmette boş');
  assert.equal(notSatiri({ aciklama: '*kalın* _x_' }), '\n   _kalın x_', 'WhatsApp biçim işaretleri bozmasın');
  assert.equal(yzHizmet(h), 'Saç Kesimi (30 dk, 500 TL; not: 🎁 Yüz ve saç bakımı hediye)');
  assert.equal(yzHizmet({ isim: 'Sakal', sure_dk: 20, fiyat: 300 }), 'Sakal (20 dk, 300 TL)');

  const bm = require(path.join(SRC, 'utils', 'botMesajlar'));
  const metin = bm.get({ isim: 'Blanco', bot_diller: 'tr' }, 'hizmetListesi',
    { isletmeAd: 'Blanco', hizmetler: [h, { isim: 'Sakal', sure_dk: 20, fiyat: 300 }], fiyatFormat: (x) => x });
  assert.match(metin, /\*1\.\* Saç Kesimi - 30dk - 500 TL\n   _🎁 Yüz ve saç bakımı hediye_\n\*2\.\* Sakal/);
});
