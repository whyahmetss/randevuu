// "Randevum kaçtaydı?" (sahada 2026-10-16): bot var olan randevuyu söyler, yeni randevu akışı başlatmaz.
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


test('randevusunu soran müşteriye saat söylenir; hizmet seçerken sorsa da akış bozulmaz', async () => {
  const { db } = await m.hazirla(m.SEMA(1) + EK);
  m.ortam(null);
  const tel = '905552737638';
  await db.query("INSERT INTO musteriler (isim, telefon) VALUES ('Ahmet', $1)", [tel]);
  const mid = (await db.query('SELECT id FROM musteriler WHERE telefon = $1', [tel])).rows[0].id;
  await db.query("INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, durum, kaynak) VALUES (1, 1, $1, 1, CURRENT_DATE + 1, '09:00', 'onaylandi', 'bot')", [mid]);
  const wa = require(path.join(m.SRC, 'services', 'whatsappWeb'));
  const giden = [];
  wa.isletmeler[1] = { durum: 'bagli', sock: { sendMessage: async (j, c) => { giden.push(c.text); return { key: { id: 'x' } }; } } };
  const yaz = async (t) => {
    const n = giden.length;
    await wa.mesajIsle({ key: { remoteJid: '82128884756524@lid', remoteJidAlt: `${tel}@s.whatsapp.net`, fromMe: false }, message: { conversation: t }, pushName: 'Ahmet' }, 1);
    return giden.slice(n).join(' || ');
  };
  const c1 = await yaz('Merhaba randevum kaçtaydı?');
  assert.match(c1, /09:00/);
  assert.doesNotMatch(c1, /Hangi hizmet/);
  await yaz('randevu almak istiyorum');
  const c2 = await yaz('Randevu almayacağım randevum kaçta olduğunu soruyorum');
  assert.match(c2, /09:00/);
});
