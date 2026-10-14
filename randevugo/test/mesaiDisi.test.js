// Mesai dışı akışı uçtan uca (sahada 2026-10-15): 'kapali_mesaj' modunda mesaj hazırlanırken fonksiyon içindeki
// gölgeleyen botMesajlar tanımı (TDZ) hata veriyordu; hata yutuluyor, müşteri 'kapalı mesajı gitti' diye işaretlendiği
// için sonraki tüm mesajları 6 saat CEVAPSIZ kalıyordu. Sohbet asistanı test şeması yeniden kullanılır.
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
 ALTER TABLE randevular ADD COLUMN IF NOT EXISTS teyit_gonderildi BOOLEAN, ADD COLUMN IF NOT EXISTS anket_gonderildi BOOLEAN;`;
for (const mod of [null, 'randevu_ver', 'kapali_mesaj']) test('mesai dışı uçtan uca: mod=' + mod, async () => {
  const { db } = await m.hazirla(m.SEMA(2) + EK);
  if (mod) await db.query(`UPDATE isletmeler SET mesai_disi_mod=$1, calisma_baslangic='23:59', calisma_bitis='00:00'`, [mod]);
  m.ortam(null);
  const wa = require(path.join(m.SRC, 'services', 'whatsappWeb'));
  const giden = [];
  wa.isletmeler[1] = { durum: 'bagli', sock: { sendMessage: async (j, c) => { giden.push(c.text); return { key: { id: 'x' } }; } } };
  const yaz = async (t) => {
    const n = giden.length;
    await wa.mesajIsle({ key: { remoteJid: '82128884756524@lid', remoteJidAlt: '905552737638@s.whatsapp.net', fromMe: false }, message: { conversation: t }, pushName: 'Test' }, 1);
    return giden.slice(n).join(' || ');
  };
  const ilk = await yaz('Merhaba');
  const ikinci = await yaz('Yarın saat 3 de randevu istiyorum');
  if (mod === 'kapali_mesaj') {
    assert.match(ilk, /Şu an kapalıyız/, 'kapalı modunda ilk mesaja kapalı mesajı gider');
    assert.strictEqual(ikinci, '', 'kapalı mesajı gittikten sonra bilerek susulur');
  } else {
    assert.match(ilk, /asistanıyım/);
    assert.match(ikinci, /Hangi hizmet/, 'gece de randevu akışı devam eder');
  }
});
