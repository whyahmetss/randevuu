// Bot döngüsü koruması (2026-10-15): esnaf numarasını bağlayınca Satış Bot'un / Merkez OTP'nin mesajlarına esnafın
// botu cevap vermez (iki bot birbirine sonsuz yazmasın). Diğer müşterilere normal cevap verir.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const T = __dirname;
const src = fs.readFileSync(path.join(T, 'sohbetAsistani.test.js'), 'utf8');
const cut = src.slice(0, src.indexOf("test('sohbet:"));
const m = {};
new Function('require', '__dirname', 'm', cut.replace("const test = require('node:test');", '') + '; m.SEMA=SEMA; m.ortam=ortam; m.taklit=taklit; m.hazirla=hazirla; m.SRC=SRC;')(require, T, m);
const EK = `
 CREATE TABLE IF NOT EXISTS sohbet_gecmisi (id SERIAL PRIMARY KEY, musteri_telefon TEXT, isletme_id INT, yon TEXT, mesaj TEXT, tarih TIMESTAMP DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS kara_liste (id SERIAL PRIMARY KEY, isletme_id INT, telefon TEXT, aktif BOOLEAN, bloke_bitis TIMESTAMP);
 ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS mesai_disi_mod TEXT; ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS mesai_disi_mesaj TEXT;
 ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sesli_mesaj_aktif BOOLEAN; ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS son_aktivite TIMESTAMP;
 ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS isletme_id INT, ADD COLUMN IF NOT EXISTS telefon TEXT, ADD COLUMN IF NOT EXISTS tg_chat_id TEXT, ADD COLUMN IF NOT EXISTS durum TEXT, ADD COLUMN IF NOT EXISTS gonderim_tarihi TIMESTAMP, ADD COLUMN IF NOT EXISTS musteri_id INT;
 ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS google_maps_link TEXT, ADD COLUMN IF NOT EXISTS yorum_mesaj_sablonu TEXT;
 ALTER TABLE randevular ADD COLUMN IF NOT EXISTS teyit_gonderildi BOOLEAN, ADD COLUMN IF NOT EXISTS anket_gonderildi BOOLEAN;
 CREATE TABLE merkez_otp_bot (id SERIAL PRIMARY KEY, numara TEXT, aktif BOOLEAN DEFAULT true);
 INSERT INTO merkez_otp_bot (numara) VALUES ('+90 501 000 00 77');`;

test('esnafın botu SıraGO sistem numaralarına cevap vermez, gerçek müşteriye verir', async () => {
  const { db } = await m.hazirla(m.SEMA(1) + EK);
  m.ortam(null);
  // Satış Bot bağlı: numarası ve gizli kimliği (LID) canlı bağlantıdan okunur
  m.taklit('services/satisBot', { numaraSockets: new Map([[1, { durum: 'bagli', sock: { user: { id: '905009998877:4@s.whatsapp.net', lid: '11122233344455:4@lid' } } }]]), sock: null });
  m.taklit('services/merkezOtpBot', { sockets: new Map() });
  const sn = require(path.join(m.SRC, 'utils', 'sistemNumaralari'));
  await sn.kayitliYenile();
  assert.strictEqual(sn.sistemNumarasi('905009998877'), true);
  assert.strictEqual(sn.sistemNumarasi('11122233344455@lid'), true, 'gizli kimlikle (LID) gelen');
  assert.strictEqual(sn.sistemNumarasi('905010000077'), true, 'kayıtlı Merkez OTP numarası (bağlı olmasa da)');
  assert.strictEqual(sn.sistemNumarasi('905551112233'), false);

  const wa = require(path.join(m.SRC, 'services', 'whatsappWeb'));
  const giden = [];
  wa.isletmeler[1] = { durum: 'bagli', sock: { sendMessage: async (j, c) => { giden.push(c.text); return { key: { id: 'x' } }; } } };
  const yaz = async (jid, alt, t) => {
    const n = giden.length;
    await wa.mesajIsle({ key: { remoteJid: jid, remoteJidAlt: alt, fromMe: false }, message: { conversation: t }, pushName: 'X' }, 1);
    return giden.slice(n).join(' || ');
  };
  assert.strictEqual(await yaz('905009998877@s.whatsapp.net', undefined, 'Kurulum tamam! WhatsApp bağlandı.'), '', 'Satış Bot mesajına cevap yok');
  assert.strictEqual(await yaz('11122233344455@lid', undefined, 'Adım 1/3'), '', 'LID ile gelen Satış Bot mesajına cevap yok');
  assert.strictEqual(await yaz('99988877766655@lid', '905010000077@s.whatsapp.net', 'SıraGO şifre kodunuz: 123456'), '', 'OTP mesajına cevap yok');
  assert.notStrictEqual(await yaz('905551234567@s.whatsapp.net', undefined, 'Merhaba'), '', 'gerçek müşteriye cevap gider');
  assert.strictEqual((await db.query("SELECT COUNT(*)::int n FROM sistem_uyarilari WHERE tip = 'cevapsiz'").catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n, 0, 'bilerek susmak "cevapsız" uyarısı değil');
});
