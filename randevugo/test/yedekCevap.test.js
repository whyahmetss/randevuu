// Güvenlik ağı: müşteri yazdı ama bot hiçbir şey göndermediyse randevu linkiyle yedek cevap gider (sahada 2026-10-15:
// "Merhaba"ya cevap geldi, "yarın saat 3'te randevu" cevapsız kaldı). Bilerek susulan durumlarda yedek gitmez.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT);
  INSERT INTO isletmeler (isim, slug) VALUES ('Berber Berat', 'berber-berat-46');`;

function taklit(modul, exports) {
  const ad = require.resolve(path.join(SRC, modul));
  require.cache[ad] = { id: ad, filename: ad, loaded: true, exports };
}

async function ortam() {
  await hazirla(SEMA);
  const dbYolu = require.resolve(path.join(SRC, 'config', 'db'));
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && k !== dbYolu) delete require.cache[k];
  taklit('services/socketServer', { emitToIsletme: () => {}, init: () => {} });
  taklit('services/pushService', { sendToIsletme: async () => {}, sendToAdmin: async () => {} });
  taklit('utils/randevuLinki', { randevuLinki: async (i) => `https://randevu.sırago.com/book/${i.slug}` });
  const wa = require(path.join(SRC, 'services', 'whatsappWeb'));
  const giden = [];
  wa.mesajGonder = async (isletmeId, jid, metin) => { giden.push(metin); return { success: true }; };
  return { wa, giden };
}

const MESAJ = { key: { remoteJid: '82128884756524@lid', fromMe: false }, message: { conversation: 'Yarın saat 3 de randevu istiyorum' } };

test('yedek cevap: bot sessizce çıkarsa müşteriye randevu linki gider', async () => {
  const { wa, giden } = await ortam();
  wa._mesajIsle = async (msg, id, iz) => { iz.musteriMesaji = true; iz.adim = 'eski akış'; };
  await wa.mesajIsle(MESAJ, 1);
  assert.strictEqual(giden.length, 1);
  assert.match(giden[0], /book\/berber-berat-46/);
});

test('yedek cevap: işlem hata verirse de müşteriye cevap gider', async () => {
  const { wa, giden } = await ortam();
  wa._mesajIsle = async (msg, id, iz) => { iz.musteriMesaji = true; throw new Error('patladı'); };
  await assert.rejects(() => wa.mesajIsle(MESAJ, 1), /patladı/);
  assert.strictEqual(giden.length, 1, 'hata durumunda tek yedek cevap');
});

test('yedek cevap: bot cevap verdiyse ikinci mesaj gitmez', async () => {
  const { wa, giden } = await ortam();
  wa._mesajIsle = async (msg, id, iz) => { iz.musteriMesaji = true; await wa.mesajGonder(1, 'x', 'normal cevap'); iz.gonderildi = true; };
  await wa.mesajIsle(MESAJ, 1);
  assert.deepStrictEqual(giden, ['normal cevap']);
});

test('yedek cevap: bilerek susulduysa (kara liste, sessiz mod) gönderilmez', async () => {
  const { wa, giden } = await ortam();
  wa._mesajIsle = async (msg, id, iz) => { iz.musteriMesaji = true; iz.sessiz = 'kara liste'; };
  await wa.mesajIsle(MESAJ, 1);
  assert.strictEqual(giden.length, 0);
});

test('yedek cevap: boş/protokol mesajlarına gönderilmez', async () => {
  const { wa, giden } = await ortam();
  await wa.mesajIsle({ key: { remoteJid: '905550000000@s.whatsapp.net', fromMe: false }, message: { protocolMessage: {} } }, 1);
  assert.strictEqual(giden.length, 0);
});
