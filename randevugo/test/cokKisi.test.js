// Çok kişilik randevu (2026-10-22, Elit Barber): "2 kişiyiz" diyen müşteriye bot da panel de her kişi için randevu açar.
// Boş usta varsa aynı saatte, yoksa arka arkaya; kapanışa sığmayan kişi "eksik" sayılır.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

function taklit(modul, exports) {
  const ad = require.resolve(path.join(SRC, modul));
  require.cache[ad] = { id: ad, filename: ad, loaded: true, exports };
}

const SEMA = (calisanSayisi = 1) => `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, paket TEXT DEFAULT 'profesyonel',
    calisma_baslangic TIME DEFAULT '09:00', calisma_bitis TIME DEFAULT '19:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30,
    mola_saatleri JSONB DEFAULT '[]', randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT, grup_id INT, randevu_onay_modu TEXT,
    kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT, oncu_no INT, calisan_secim_modu TEXT DEFAULT 'musteri',
    bot_diller TEXT DEFAULT 'tr', dogum_gunu_aktif BOOLEAN DEFAULT false, demo BOOLEAN DEFAULT false, adres TEXT, ilce TEXT, sehir TEXT, kategori TEXT);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT, dogum_tarihi DATE);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, isim_en TEXT, isim_ar TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0,
    aktif BOOLEAN DEFAULT true, kapora_yuzdesi INT DEFAULT 0);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME, calisma_bitis TIME,
    kapali_gunler TEXT, mola_saatleri JSONB DEFAULT '[]');
  CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE bot_durum (musteri_telefon VARCHAR(50), isletme_id INT, asama TEXT, secilen_hizmet_id INT, secilen_tarih DATE, secilen_saat TIME,
    secilen_calisan_id INT, secilen_dil TEXT, son_aktivite TIMESTAMP, UNIQUE (musteri_telefon, isletme_id));
  CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY); CREATE TABLE paket_tanimlari (kod TEXT);
  CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(20), isletme_id INT, istenen_tarih DATE, durum TEXT, hizmet_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
  INSERT INTO isletmeler (isim, slug) VALUES ('Elit Barber', 'elit');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç Kesimi', 30, 300), (1, 'Sakal Tıraşı', 20, 150);
  ${Array.from({ length: calisanSayisi }, (_, i) => `INSERT INTO calisanlar (isletme_id, isim) VALUES (1, '${['Tayfun', 'Ali'][i]}');`).join('\n')}
  ${fs.readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8')}
  ${fs.readFileSync(path.join(SRC, 'migrations', '048_sohbet_asistani.sql'), 'utf8')}
  ${fs.readFileSync(path.join(SRC, 'migrations', '066_kisi_sayisi.sql'), 'utf8')}`;

function ortam() {
  const dbYolu = require.resolve(path.join(SRC, 'config', 'db'));
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && k !== dbYolu) delete require.cache[k];
  taklit('services/socketServer', { emitToIsletme: () => {}, init: () => {} });
  taklit('services/pushService', { sendToIsletme: async () => {}, sendToAdmin: async () => {} });
  taklit('services/googleCalendar', { freebusyAraliklari: async () => [], freebusyCacheTemizle: () => {}, randevuEventOlustur: async () => {} });
  taklit('services/deepseek', { serbetCevap: async () => null });
  taklit('utils/gemini', { anahtarlar: () => [], geminiIstek: async () => ({}), metniAl: () => '' });
}

async function konusma(db, tel) {
  const wa = require(path.join(SRC, 'services', 'whatsappWeb'));
  const sohbet = require(path.join(SRC, 'services', 'sohbetAsistani'));
  const isletme = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
  const hizmetler = (await db.query('SELECT * FROM hizmetler WHERE isletme_id = 1 AND aktif = true ORDER BY id')).rows;
  return async (metin) => {
    await db.query(`INSERT INTO bot_durum (musteri_telefon, isletme_id, asama) VALUES ($1, 1, 'baslangic') ON CONFLICT DO NOTHING`, [tel]);
    const botDurum = (await db.query('SELECT * FROM bot_durum WHERE musteri_telefon = $1 AND isletme_id = 1', [tel])).rows[0];
    let c = await sohbet.isle({ wa, metin, botDurum, isletme: { ...isletme }, hizmetler, musteriTelefon: tel, isletmeId: 1 });
    if (!c) c = await wa.akisIsle(metin, botDurum, { ...isletme }, hizmetler, tel, 1);
    return typeof c === 'object' && c ? c.metin : c;
  };
}
const randevulari = async (db, tel) => (await db.query(
  `SELECT to_char(r.saat, 'HH24:MI') AS saat, r.calisan_id FROM randevular r JOIN musteriler m ON m.id = r.musteri_id WHERE m.telefon = $1 ORDER BY r.saat, r.calisan_id`, [tel])).rows;

test('kişi sayısı anlaşılır; "yarın 2 kişiyiz"deki 2 saat sanılmaz', () => {
  ortam();
  const { kisiBul } = require(path.join(SRC, 'services', 'sohbetAsistani'));
  const { sade } = require(path.join(SRC, 'utils', 'sekreterKomut'));
  const k = (t) => kisiBul(' ' + sade(t) + ' ')?.kisi || null;
  assert.equal(k('yarın 2 kişiyiz'), 2);
  assert.equal(k('3 kişilik randevu'), 3);
  assert.equal(k('iki kişi için'), 2);
  assert.equal(k('oğlumla geleceğim'), 2);
  assert.equal(k('ben ve eşim'), 2);
  assert.equal(k('ikimiz için yer var mı'), 2);
  assert.equal(k('kaç kişi çalışıyorsunuz'), null);
  assert.equal(k('saat 2 de gelirim'), null);
  assert.equal(k('saç kesimi'), null);
});

test('bot: tek ustalı dükkânda "2 kişiyiz" → özet 👥 2 kişi, evet → 15:00 ve 15:30 arka arkaya', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const tel = '905551110001';
  const yaz = await konusma(db, tel);
  const ozet = await yaz('yarın 15:00 saç kesimi 2 kişiyiz');
  assert.match(ozet, /15:00[\s\S]*Saç Kesimi[\s\S]*👥 2 kişi[\s\S]*oluşturayım mı/, ozet);
  const onay = await yaz('evet');
  assert.match(onay, /15:00\n👥 2\. kişi: 15:30/, onay);
  assert.deepEqual((await randevulari(db, tel)).map(r => r.saat), ['15:00', '15:30']);
  assert.equal((await db.query('SELECT kisi_sayisi FROM bot_durum WHERE musteri_telefon = $1', [tel])).rows[0].kisi_sayisi, null);

  // Sonraki yeni konuşmada kişi sayısı taşınmaz
  await yaz('yarın 17:00 sakal tıraşı');
  const ozet2 = (await db.query('SELECT kisi_sayisi FROM bot_durum WHERE musteri_telefon = $1', [tel])).rows[0];
  assert.equal(ozet2.kisi_sayisi, null);
});

test('bot: iki ustalı dükkânda "oğlumla" → aynı saatte iki ustaya', async () => {
  const { db } = await hazirla(SEMA(2));
  ortam();
  const tel = '905551110002';
  const yaz = await konusma(db, tel);
  assert.match(await yaz('oğlumla saç kesimi randevusu istiyorum'), /Tercih ettiğiniz bir usta/);
  assert.match(await yaz('fark etmez'), /Hangi gün/);
  assert.match(await yaz('yarın 10:00'), /👥 2 kişi/);
  await yaz('evet');
  assert.deepEqual(await randevulari(db, tel), [{ saat: '10:00', calisan_id: 1 }, { saat: '10:00', calisan_id: 2 }]);
});

test('bot: kapanışa sığmayan kişi söylenir', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const tel = '905551110003';
  const yaz = await konusma(db, tel);
  await yaz('yarın 18:00 saç kesimi 3 kişiyiz');
  const onay = await yaz('evet');
  assert.match(onay, /2\. kişi: 18:30[\s\S]*1 kişi için o gün yer kalmadı/, onay);
  assert.deepEqual((await randevulari(db, tel)).map(r => r.saat), ['18:00', '18:30']);
});

test('panel: kapıdan gelen 3 kişi → her biri onaylı randevu, dolu saat atlanır', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const yarin = gunSonraTarih(1);
  await db.query(`INSERT INTO musteriler (isim, telefon) VALUES ('Dolu', '905550000099')`);
  await db.query(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES (1, 1, 1, 1, $1, '11:00', '11:30', 'onaylandi')`, [yarin]);
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  let cevap;
  const res = { json: (x) => { cevap = x; }, status() { return this; } };
  await admin.randevuElleEkle({ body: { hizmet_id: 1, musteri_isim: 'Kemal', musteri_telefon: '05321112233', tarih: yarin, saat: '10:00', kisi: 3 }, kullanici: { isletme_id: 1 } }, res);
  assert.ok(cevap?.ok, JSON.stringify(cevap));
  assert.deepEqual(cevap.ek.yazilan.map(x => x.saat), ['10:30', '11:30']);
  assert.equal(cevap.ek.eksik, 0);
  const r = (await db.query(`SELECT to_char(saat, 'HH24:MI') AS saat, durum, kaynak FROM randevular WHERE musteri_id <> 1 ORDER BY saat`)).rows;
  assert.deepEqual(r.map(x => x.saat), ['10:00', '10:30', '11:30']);
  assert.ok(r.every(x => x.durum === 'onaylandi' && x.kaynak === 'manuel'));
});
