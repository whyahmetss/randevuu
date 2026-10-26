// Sekreter modu (liste, kapat → müsait saatten düşer, aç, randevu yaz, isim belirsizliği, son randevuyu sil, yetki)
// ve sesli mesaj (yazıya çevirme, sınırlar, anlaşılmayan ses).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

function taklit(modul, exports) {
  const ad = require.resolve(path.join(SRC, modul));
  require.cache[ad] = { id: ad, filename: ad, loaded: true, exports };
}

test('sekreter: liste, kapat/aç, randevu yaz, sil, yetki', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, paket TEXT DEFAULT 'profesyonel',
      calisma_baslangic TIME DEFAULT '09:00', calisma_bitis TIME DEFAULT '19:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30,
      mola_saatleri JSONB DEFAULT '[]', randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT, grup_id INT, randevu_onay_modu TEXT, kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT, oncu_no INT);
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0, aktif BOOLEAN DEFAULT true, kapora_yuzdesi INT DEFAULT 0);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
      durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
    CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY);
    CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(20), isletme_id INT, istenen_tarih DATE, durum TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW(), hizmet_id INT);
    CREATE TABLE paket_tanimlari (kod TEXT);
    INSERT INTO isletmeler (isim, slug, telefon) VALUES ('Kemal Berber', 'kemal', '05321112233');
    INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç Kesimi', 30, 300), (1, 'Sakal Tıraşı', 20, 150);
    INSERT INTO musteriler (isim, telefon, son_gelinen_isletme_id) VALUES ('Ahmet Yılmaz', '905550000001', 1), ('Ali Can', '905550000002', 1), ('Ali Veli', '905550000003', 1);
    ${fs.readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8')}`);
  taklit('services/socketServer', { emitToIsletme: () => {} });
  taklit('services/pushService', { sendToIsletme: async () => {} });
  taklit('services/whatsappWeb', { getDurum: () => ({ durum: 'bagli_degil' }), mesajGonder: async () => ({ success: false }) });
  taklit('services/googleCalendar', { freebusyAraliklari: async () => [] });
  const sek = require(path.join(SRC, 'services', 'sekreter'));
  const randevu = require(path.join(SRC, 'services', 'randevu'));
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const yarin = gunSonraTarih(1);
  const isle = (metin) => sek.isle({ isletmeId: 1, metin, kanal: 'kendi' });

  // Sıradan not → karışmaz; "fiko" ile başlayan anlaşılmayan → yardım
  assert.equal(await isle('süt al eve'), null);
  assert.match(await isle('fiko bişey yap'), /Sekreter modu/);

  // Kapat → o aralık müsait saatlerden düşer; aç → geri gelir
  assert.match(await isle('yarın 14-16 kapat'), /14:00–16:00\* kapatıldı/);
  let saatler = await randevu.musaitSaatleriGetir(1, yarin, null, 1);
  assert.ok(!saatler.includes('14:00') && !saatler.includes('15:30') && saatler.includes('16:00') && saatler.includes('13:00'), saatler.join(','));
  assert.match(await isle('yarın 14-16 aç'), /tekrar açıldı/);
  saatler = await randevu.musaitSaatleriGetir(1, yarin, null, 1);
  assert.ok(saatler.includes('14:00'));

  // Randevu yaz: isimle bulunan müşteri
  assert.match(await isle("Ahmet'e yarın 15:00 saç kesimi yaz"), /Yazıldı: \*Ahmet Yılmaz\*/);
  // Aynı saat dolu → alternatif önerir
  assert.match(await isle("Ahmet'e yarın 15:00 saç kesimi yaz"), /müsait değil[\s\S]*En yakın boş saatler/);
  // Belirsiz isim → seçenek ister
  assert.match(await isle('Ali yarın 11:00 sakal tıraşı yaz'), /Birden çok "Ali"/);
  // Bilinmeyen isim → numara ister; numarayla yeni müşteri
  assert.match(await isle('Zeynep yarın 12:00 saç kesimi yaz'), /müşterilerinde yok/);
  assert.match(await isle('Zeynep 0544 333 22 11 yarın 12:00 saç kesimi yaz'), /Yazıldı: \*Zeynep\*/);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM randevular WHERE kaynak = 'sekreter'")).rows[0].n, 2);

  // Liste
  const liste = await isle('yarın kimler var');
  assert.match(liste, /2 randevu/); assert.match(liste, /12:00 {2}Zeynep/); assert.match(liste, /15:00 {2}Ahmet Yılmaz · Saç Kesimi/);

  // Son randevuyu sil
  assert.match(await isle('son randevuyu sil'), /Silindi: Zeynep/);
  assert.equal((await db.query("SELECT durum FROM randevular WHERE musteri_id = 4")).rows[0].durum, 'iptal');

  // Bütün gün kapat, geçmiş gün kapatılamaz
  assert.match(await isle('cumartesi kapalıyım'), /bütün gün\* kapatıldı/);

  // Yetki: başka numara ancak panelden girilirse; kayıttaki telefon tek başına yetmez
  const isletme = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
  assert.equal(sek.sahipNumarasiMi(isletme, '905321112233'), false, 'doğrulanmamış kayıt telefonu yetki vermez');
  await db.query("UPDATE isletmeler SET sekreter_telefon = '905321112233'");
  const i2 = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
  assert.equal(sek.sahipNumarasiMi(i2, '905321112233'), true);
  assert.equal(sek.sahipNumarasiMi({ ...i2, sekreter_aktif: false }, '905321112233'), false);
  await db.query('UPDATE isletmeler SET sekreter_aktif = false');
  assert.equal(await isle('bugün kimler var'), null, 'kapalıyken komut çalışmaz');
});

test('sesli mesaj: yazıya çevirme, uzun ses, anlaşılmayan ses', async () => {
  let cevap = 'Selam abi yarın öğleden sonra 3 gibi saç sakal boş yerin var mı';
  let istek = null;
  taklit('utils/gemini', {
    anahtarlar: () => ['x'],
    geminiIstek: async (g) => { istek = g; return { candidates: [{ content: { parts: [{ text: cevap }] } }] }; },
    metniAl: (j) => j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '',
  });
  const sm = require(path.join(SRC, 'services', 'sesliMesaj'));
  const ses = (sn) => ({ key: { id: 'a' }, message: { audioMessage: { seconds: sn, mimetype: 'audio/ogg; codecs=opus' } } });
  const indir = async () => Buffer.from('OggS-ses');

  assert.equal(sm.sesMesaji({ message: { conversation: 'merhaba' } }), null);
  const s = await sm.metneCevir(ses(6), { isletmeId: 1, telefon: '905551', indir });
  assert.equal(s.metin, cevap);
  assert.equal(istek.contents[0].parts[1].inline_data.mime_type, 'audio/ogg', 'codec eki atılır');
  assert.match(sm.onEk(s.metin), /^🎤 _"Selam abi/);
  assert.deepEqual(await sm.metneCevir(ses(300), { isletmeId: 1, telefon: '905551', indir }), { hata: 'uzun' });
  cevap = '[anlaşılmadı]';
  assert.deepEqual(await sm.metneCevir(ses(4), { isletmeId: 1, telefon: '905551', indir }), { hata: 'cevrilemedi' });
  // Kişi başı günlük sınır
  cevap = 'tamam';
  let son;
  for (let i = 0; i < 25; i++) son = await sm.metneCevir(ses(3), { isletmeId: 2, telefon: '905559', indir });
  assert.deepEqual(son, { hata: 'sinir' });
});
