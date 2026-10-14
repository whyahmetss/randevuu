// Sohbet asistanı: menüsüz, soru sorarak randevu (kullanıcının örnek konuşması) — gerçek bot akışı + gerçek müsaitlik.
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
    bot_diller TEXT DEFAULT 'tr', dogum_gunu_aktif BOOLEAN DEFAULT false, demo BOOLEAN DEFAULT false, adres TEXT, ilce TEXT, sehir TEXT);
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
  INSERT INTO isletmeler (isim, slug) VALUES ('Kemal Berber', 'kemal');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç Kesimi', 30, 300), (1, 'Sakal Tıraşı', 20, 150);
  ${Array.from({ length: calisanSayisi }, (_, i) => `INSERT INTO calisanlar (isletme_id, isim) VALUES (1, '${['Mehmet', 'Ali'][i]}');`).join('\n')}
  INSERT INTO musteriler (isim, telefon) VALUES ('Dolu Müşteri', '905550000099');
  ${fs.readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8')}
  ${fs.readFileSync(path.join(SRC, 'migrations', '048_sohbet_asistani.sql'), 'utf8')}`;

function ortam(yzCevap = null) {
  // Önceki testin veritabanını tutan modüller atılır (config/db her testte yeniden taklit edilir)
  const dbYolu = require.resolve(path.join(SRC, 'config', 'db'));
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && k !== dbYolu) delete require.cache[k];
  taklit('services/socketServer', { emitToIsletme: () => {}, init: () => {} });
  taklit('services/pushService', { sendToIsletme: async () => {}, sendToAdmin: async () => {} });
  taklit('services/googleCalendar', { freebusyAraliklari: async () => [] });
  taklit('services/deepseek', { serbetCevap: async () => 'Saç kesimi 300₺, sakal tıraşı 150₺.' });
  taklit('utils/gemini', {
    anahtarlar: () => (yzCevap ? ['x'] : []),
    geminiIstek: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(yzCevap) }] } }] }),
    metniAl: (j) => j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '',
  });
}

async function konusma(db, tel = '905551112233') {
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

test('sohbet: kullanıcının örneği — merhaba, randevu, yarın 3, dolu → 15:40, evet', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const yarin = gunSonraTarih(1);
  await db.query(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES (1, 1, 1, 1, $1, '15:00', '15:30', 'onaylandi')`, [yarin]);
  const yaz = await konusma(db);

  assert.match(await yaz('Merhaba'), /Kemal Berber asistanıyım/);
  assert.match(await yaz('Randevu alacaktım'), /Hangi hizmet/);
  assert.match(await yaz('saç kesimi'), /Hangi gün gelmek istersiniz/);
  const dolu = await yaz('yarın 3 de');
  assert.match(dolu, /Maalesef 15:00 dolu\. 15:40 uygun mu\?/, dolu);
  const onay = await yaz('evet');
  assert.match(onay, /15:40/, onay);
  const r = (await db.query(`SELECT r.saat, r.calisan_id, r.kaynak, m.telefon FROM randevular r JOIN musteriler m ON m.id = r.musteri_id WHERE m.telefon = '905551112233'`)).rows;
  assert.equal(r.length, 1); assert.equal(String(r[0].saat).slice(0, 5), '15:40'); assert.equal(r[0].calisan_id, 1);
  assert.equal((await db.query(`SELECT asama FROM bot_durum WHERE musteri_telefon = '905551112233'`)).rows[0].asama, 'ana_menu');
});

test('sohbet: tek mesajda her şey, hayır deyince yeni saat, soru sorunca cevap + kaldığı yer', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const yaz = await konusma(db, '905552223344');
  const ozet = await yaz('yarın 11:00 sakal tıraşı için yer var mı');
  assert.match(ozet, /11:00[\s\S]*Sakal Tıraşı[\s\S]*oluşturayım mı/, ozet);
  assert.match(await yaz('hayır'), /hangi gün ve saat/);
  const soru = await yaz('fiyatı ne kadar');
  assert.match(soru, /150₺[\s\S]*boş saatler/, soru);
  assert.match(await yaz('öğleden sonra'), /boş saatler: (1[2-6]:\d\d(, )?)+\./);
  assert.match(await yaz('14:30'), /oluşturayım mı/);
  assert.match(await yaz('tamam'), /14:30/);
});

test('sohbet: iki usta — usta sorulur, "fark etmez" → boş olan atanır; dolu gün → en yakın boş gün', async () => {
  const { db } = await hazirla(SEMA(2));
  ortam();
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const yaz = await konusma(db, '905553334455');
  assert.match(await yaz('saç kesimi randevusu istiyorum'), /Tercih ettiğiniz bir usta var mı\? Mehmet, Ali/);
  assert.match(await yaz('fark etmez'), /Hangi gün/);
  // Mehmet yarın 10:00'da dolu, Ali boş → 10:00 verilir, Ali atanır
  await db.query(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES (1, 1, 1, 1, $1, '10:00', '10:30', 'onaylandi')`, [gunSonraTarih(1)]);
  assert.match(await yaz('yarın 10:00'), /oluşturayım mı/);
  await yaz('evet');
  const r = (await db.query(`SELECT r.calisan_id FROM randevular r JOIN musteriler m ON m.id = r.musteri_id WHERE m.telefon = '905553334455'`)).rows[0];
  assert.equal(r.calisan_id, 2, 'boş olan usta (Ali)');

  // Kapalı gün → en yakın açık gün önerilir
  const pazar = [0, 1, 2, 3, 4, 5, 6].map(i => gunSonraTarih(i + 1)).find(t => new Date(t + 'T12:00:00Z').getUTCDay() === 0);
  await db.query(`UPDATE isletmeler SET kapali_gunler = '0'`);
  const yaz2 = await konusma(db, '905553334466');
  await yaz2('sakal tıraşı'); await yaz2('fark etmez');
  const g = await yaz2(`${pazar.slice(8, 10)}.${pazar.slice(5, 7)} 12:00`);
  assert.match(g, /kapalıyız[\s\S]*Pazartesi[\s\S]*boş saatler/, g);
});

test('sohbet: yapay zekâ anlamayı tamamlar ("haftaya salı akşamüstü"), menü tarzında devreye girmez, iptal eski akışa gider', async () => {
  const { db } = await hazirla(SEMA(1));
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const hedef = gunSonraTarih(7);
  ortam({ niyet: 'randevu', hizmet_id: 1, tarih: hedef, saat: '', dilim: 'aksam' });
  const yaz = await konusma(db, '905554445566');
  const c = await yaz('haftaya bi saç kestirmek istiyorum akşamüstü uygun');
  assert.match(c, /boş saatler: (1[7-8]:\d\d(, )?)+\./, c);

  // İptal → eski akış (randevu yoksa "randevunuz yok" metni)
  ortam();
  const iptal = await yaz('randevumu iptal etmek istiyorum');
  assert.ok(iptal && !/Hangi gün/.test(iptal));

  // Menü tarzı seçiliyse sohbet devreye girmez
  await db.query(`UPDATE isletmeler SET bot_tarzi = 'menu'`);
  const sohbet = require(path.join(SRC, 'services', 'sohbetAsistani'));
  const isletme = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
  assert.equal(await sohbet.isle({ wa: {}, metin: 'yarın 3te', botDurum: { asama: 'ana_menu' }, isletme, hizmetler: [{ id: 1, isim: 'x' }], musteriTelefon: '9', isletmeId: 1 }), null);
});

test('çakışma: aynı saati iki müşteri ister — ilk onaylayan alır, ötekine boş saatler; gün dolduysa bekleme listesi', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const yarin = gunSonraTarih(1);
  const wa = require(path.join(SRC, 'services', 'whatsappWeb'));
  // mesajIsle'deki gibi: saat kaçtıysa müşteriye cevapsız kalınmaz
  const konus = async (tel) => { const yaz = await konusma(db, tel); return async (m) => { try { return await yaz(m); } catch (e) {
    if (e.code !== 'SLOT_DOLU') throw e; const isletme = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
    return (await wa._saatKacti(isletme, tel, 1)).metin; } }; };
  const ayse = await konus('905550000001');
  const can = await konus('905550000002');
  assert.match(await ayse('yarın 15:00 saç kesimi'), /oluşturayım mı/);
  assert.match(await can('yarın 15:00 saç kesimi'), /oluşturayım mı/, 'ikisine de aynı saat önerildi (henüz kimse onaylamadı)');
  assert.match(await can('evet'), /15:00/, 'önce onaylayan alır');
  const kacti = await ayse('evet');
  assert.match(kacti, /az önce başka bir müşteri aldı[\s\S]*boş saatler: [\s\S]*Size hangisi uygun/, kacti);
  assert.match(await ayse('16:00'), /oluşturayım mı/);
  assert.match(await ayse('evet'), /16:00/);
  const n = (await db.query(`SELECT COUNT(*)::int AS n FROM randevular WHERE tarih = $1 AND saat = '15:00'`, [yarin])).rows[0].n;
  assert.equal(n, 1, 'aynı saate tek randevu');

  // Ustası olmayan dükkân: veritabanı kontrolü ikinci randevuyu reddeder
  await db.query('DELETE FROM calisanlar');
  const randevu = require(path.join(SRC, 'services', 'randevu'));
  await randevu.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000003', hizmetId: 1, tarih: yarin, saat: '11:00', kaynak: 'web' });
  await assert.rejects(randevu.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000004', hizmetId: 1, tarih: yarin, saat: '11:00', kaynak: 'web' }), { code: 'SLOT_DOLU' });
  await assert.rejects(randevu.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000004', hizmetId: 1, tarih: yarin, saat: '11:15', kaynak: 'web' }), { code: 'SLOT_DOLU' }, 'üst üste binen de olmaz');

  // Gün tamamen doldu → saati kaçıran bekleme listesine eklenir
  await db.query(`UPDATE isletmeler SET calisma_baslangic = '09:00', calisma_bitis = '09:30'`);
  const ertesi = gunSonraTarih(2);
  const ali = await konus('905550000005');
  await ali(`${ertesi.slice(8, 10)}.${ertesi.slice(5, 7)} 09:00 saç kesimi`);
  await randevu.randevuOlustur({ isletmeId: 1, musteriTelefon: '905550000006', hizmetId: 1, tarih: ertesi, saat: '09:00', kaynak: 'web' });
  const doldu = await ali('evet');
  assert.match(doldu, /başka boş saat kalmadı[\s\S]*bekleme listesine ekledim/, doldu);
  assert.equal((await db.query(`SELECT COUNT(*)::int AS n FROM bekleme_listesi WHERE musteri_telefon = '905550000005'`)).rows[0].n, 1);
});

test('sohbet: "11\'de" / "3\'te", onay beklerken "öğleden sonra olsun", yapay zekâ yokken fiyat', async () => {
  const { db } = await hazirla(SEMA(1));
  ortam();
  taklit('services/deepseek', { serbetCevap: async () => null });       // Gemini/DeepSeek cevap veremedi
  const yaz = await konusma(db, '905556667788');
  const ozet = await yaz("Yarın 11'de sakal tıraşı için yer var mı");
  assert.match(ozet, /11:00[\s\S]*Sakal Tıraşı[\s\S]*oluşturayım mı/, ozet);
  const dilim = await yaz('öğleden sonra olsun');
  assert.match(dilim, /boş saatler: (1[2-6]:\d\d(, )?)+\./, dilim);
  const fiyat = await yaz('fiyatı ne kadar');
  assert.match(fiyat, /Sakal Tıraşı: 150₺[\s\S]*boş saatler/, fiyat);
  assert.match(await yaz("yarın 3'te"), /15:00[\s\S]*oluşturayım mı/);
  assert.match(await yaz('evet'), /15:00/);
});

test('sohbet: parantezli/benzer hizmet adları — "saç kesimi" → Erkek/Bayan sorulur, "erkek" seçer; yapay zekâ olmadan döngü yok', async () => {
  const { db } = await hazirla(SEMA(1));
  await db.exec(`DELETE FROM hizmetler; INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç Kesim (Erkek)', 30, 200), (1, 'Saç Kesim (Bayan)', 45, 350),
    (1, 'Saç Boyama', 90, 600), (1, 'Sakal Tıraş', 20, 100), (1, 'Fön', 30, 150), (1, 'Keratin Bakım', 60, 800)`);
  ortam();
  const yaz = await konusma(db, '905557778899');
  assert.match(await yaz('Randevu alacaktım'), /Hangi hizmet[\s\S]*Keratin/);
  const iki = await yaz('saç kesimi');
  assert.match(iki, /Saç Kesim \(Erkek\)[\s\S]*Saç Kesim \(Bayan\)/, iki);
  assert.doesNotMatch(iki, /Boyama|Keratin/, iki);
  assert.match(await yaz('erkek'), /Hangi gün/);
  assert.match(await yaz("yarın 3'te"), /15:00[\s\S]*Saç Kesim \(Erkek\)[\s\S]*oluşturayım mı/);

  const yaz2 = await konusma(db, '905557778800');
  assert.match(await yaz2('yarın 11de fön çektirmek istiyorum'), /11:00[\s\S]*Fön[\s\S]*oluşturayım mı/);
  const yaz3 = await konusma(db, '905557778801');
  assert.match(await yaz3('sakal tıraşı'), /Hangi gün/);
});
