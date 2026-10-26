// Resmî tatil kapanışı, acil durum (aktar ya da iptal), personel girişi, KVKK silme (2026-10-26).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');
const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, aktif BOOLEAN DEFAULT true, paket TEXT DEFAULT 'profesyonel',
    calisma_baslangic TIME DEFAULT '09:00', calisma_bitis TIME DEFAULT '12:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30,
    mola_saatleri JSONB DEFAULT '[]', randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT DEFAULT 0, grup_id INT,
    randevu_onay_modu TEXT, kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT, telegram_token TEXT);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT, dogum_tarihi DATE);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0, kapora_yuzdesi INT DEFAULT 0);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME,
    calisma_bitis TIME, kapali_gunler TEXT, mola_saatleri JSONB DEFAULT '[]');
  CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN DEFAULT true, grup_id INT, son_giris TIMESTAMP);
  CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(20), isletme_id INT, hizmet_id INT, hizmet_ids INT[], istenen_tarih DATE,
    musteri_isim TEXT, kaynak VARCHAR(12), durum TEXT DEFAULT 'bekliyor', olusturma_tarihi TIMESTAMP DEFAULT NOW());
  CREATE TABLE bot_durum (musteri_telefon VARCHAR(50), isletme_id INT);
  CREATE TABLE paket_tanimlari (kod TEXT); CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY);
  ${fs.readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8')}
  ${fs.readFileSync(path.join(SRC, 'migrations', '071_acil_tatil_personel_kvkk.sql'), 'utf8')}
  INSERT INTO isletmeler (isim, slug) VALUES ('Elit Barber', 'elit');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES (1, 'Saç', 30, 300);
  INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Tayfun'), (1, 'Kalfa');
  INSERT INTO musteriler (isim, telefon) VALUES ('Ayşe Kaya', '905550000001'), ('Mehmet', '905550000002'), ('Can', '905550000003');`;

async function ortam() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(SEMA);
  const giden = [];
  sahte('services/socketServer', { emitToIsletme() {}, emitToAdmin() {}, kullaniciDusur() {} });
  sahte('services/pushService', { sendToIsletme: async () => {}, sendToAdmin: async () => {} });
  sahte('services/googleCalendar', { freebusyAraliklari: async () => [], freebusyCacheTemizle() {}, randevuEventSil: async () => {} });
  sahte('services/whatsappWeb', { getDurum: () => ({ durum: 'bagli' }), mesajGonder: async (id, tel, m) => { giden.push([tel, m]); return { success: true }; } });
  return { db, giden };
}
const bekle = (ms) => new Promise(r => setTimeout(r, ms));

test('resmî tatil: bayramın 1. günü varsayılan kapalı, arifede 13:00 sonrası, esnaf açabilir', async () => {
  const { db } = await ortam();
  const r = require(path.join(SRC, 'services', 'randevu'));
  await db.exec("UPDATE isletmeler SET calisma_bitis = '16:00'");
  assert.deepEqual(await r.musaitSaatleriGetir(1, '2027-05-16', 1, 1), [], 'Kurban 1. gün kapalı');
  assert.ok((await r.musaitSaatleriGetir(1, '2027-05-17', 1, 1)).length > 0, '2. gün açık');
  await db.exec(`UPDATE isletmeler SET tatil_kapali = '["kurban_arife"]'`);
  const arife = await r.musaitSaatleriGetir(1, '2027-05-15', 1, 1);
  assert.equal(arife.at(-1), '12:30', 'arifede 13:00 ve sonrası kapalı');
  assert.ok((await r.musaitSaatleriGetir(1, '2027-05-16', null, 1)).length > 0, 'listede yoksa bayram günü açık');
});

test('acil durum: boş ustası olana aktarılır, olmayan iptal edilir; müşteriye sebep söylenmez; bitirince takvim açılır', async () => {
  const { db, giden } = await ortam();
  const gun = gunSonraTarih(2);
  await db.exec(`
    INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES
      (1, 1, 1, 1, '${gun}', '10:00', '10:30', 'onaylandi'),
      (1, 1, 2, 1, '${gun}', '11:00', '11:30', 'onaylandi'),
      (1, 2, 3, 1, '${gun}', '11:00', '11:30', 'onaylandi');`);
  const acil = require(path.join(SRC, 'services', 'acilDurum'));
  const p = await acil.plan(1, { calisanId: 1, bitisTarih: gun });
  assert.deepEqual(p.randevular.map(k => [k.saat, k.karar, k.yeni_calisan]), [['10:00', 'aktar', 'Kalfa'], ['11:00', 'iptal', null]]);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM randevular WHERE durum = 'iptal'")).rows[0].n, 0, 'önizleme hiçbir şeyi değiştirmez');

  const s = await acil.baslat(1, { calisanId: 1, bitisTarih: gun });
  const rows = (await db.query('SELECT id, calisan_id, durum FROM randevular ORDER BY id')).rows;
  assert.deepEqual(rows.map(x => [x.calisan_id, x.durum]), [[2, 'onaylandi'], [1, 'iptal'], [2, 'onaylandi']]);
  const r = require(path.join(SRC, 'services', 'randevu'));
  assert.deepEqual(await r.musaitSaatleriGetir(1, gun, 1, 1), [], 'Tayfun o gün randevu almaz');

  await bekle(5000);   // mesajlar arka planda, aralıklı
  assert.equal(giden.length, 2);
  assert.match(giden[0][1], /aynı saatte Kalfa ile devam/);
  assert.match(giden[1][1], /iptal edildi/);
  assert.match(giden[1][1], /randevu\.sırago\.com\/elit|https?:\/\//, 'yeni saat linki');
  for (const [, m] of giden) assert.doesNotMatch(m, /cenaze|hastane|acil/i, 'sebep yazılmaz');
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM bekleme_listesi WHERE kaynak = 'acil'")).rows[0].n, 1, 'iptal olan bekleme listesinde');

  await acil.bitir(1, s.acil.id);
  assert.ok((await r.musaitSaatleriGetir(1, gun, 1, 1)).length > 0, 'bitince Tayfun yeniden randevu alır');
  await assert.rejects(acil.plan(1, { calisanId: 1, bitisTarih: gunSonraTarih(31) }), /en fazla 30 gün/);
});

test('acil durum: bütün dükkân kapanınca aktarım yok, hepsi iptal', async () => {
  const { db } = await ortam();
  const gun = gunSonraTarih(1);
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES
      (1, 1, 1, 1, '${gun}', '10:00', '10:30', 'onaylandi'), (1, 2, 2, 1, '${gun}', '10:00', '10:30', 'onaylandi')`);
  const acil = require(path.join(SRC, 'services', 'acilDurum'));
  const p = await acil.plan(1, { bitisTarih: gun });
  assert.equal(p.kapsam, 'dukkan');
  assert.deepEqual(p.randevular.map(k => k.karar), ['iptal', 'iptal']);
  await acil.baslat(1, { bitisTarih: gun });
  const r = require(path.join(SRC, 'services', 'randevu'));
  assert.deepEqual(await r.musaitSaatleriGetir(1, gun, null, 1), []);
  assert.deepEqual(await r.musaitSaatleriGetir(1, gun, 2, 1), [], 'dükkân bloğu her ustayı kapatır');
});

test('personel: davetle hesap açar, yalnız kendi randevularını görür, esnaf ekranlarına giremez', async () => {
  const { db } = await ortam();
  const gun = gunSonraTarih(1);
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES
      (1, 1, 1, 1, '${gun}', '10:00', '10:30', 'onaylandi'), (1, 2, 2, 1, '${gun}', '10:00', '10:30', 'onaylandi')`);
  const pc = require(path.join(SRC, 'controllers', 'personelController'));
  const { authMiddleware } = require(path.join(SRC, 'middleware', 'auth'));

  let r = cevap(); await pc.davetOlustur({ kullanici: { isletme_id: 1 }, params: { id: 1 } }, r);
  const token = r.veri.link.split('personel=')[1];
  r = cevap(); await pc.davetBilgi({ params: { token } }, r);
  assert.deepEqual(r.veri, { isletme: 'Elit Barber', calisan: 'Tayfun' });
  r = cevap(); await pc.davetKabul({ params: { token }, body: { email: 'tayfun@ornek.com', sifre: 'kisa' } }, r);
  assert.equal(r.kod, 400);
  r = cevap(); await pc.davetKabul({ params: { token }, body: { email: 'tayfun@ornek.com', sifre: 'gizlisifre1' } }, r);
  assert.equal(r.veri.kullanici.rol, 'personel');
  const oturum = r.veri.token;
  r = cevap(); await pc.davetKabul({ params: { token }, body: { email: 'baska@ornek.com', sifre: 'gizlisifre1' } }, r);
  assert.equal(r.kod, 404, 'link tek kullanımlık');

  const istek = async (yol) => {
    const req = { headers: { authorization: `Bearer ${oturum}` }, baseUrl: '/api', path: yol, originalUrl: '/api' + yol, query: {} };
    const res = cevap(); let gecti = false;
    await authMiddleware(req, res, () => { gecti = true; });
    return { gecti, res, req };
  };
  assert.equal((await istek('/randevular')).res.kod, 403, 'esnaf randevu listesi kapalı');
  assert.equal((await istek('/musteriler')).res.kod, 403);
  const ok = await istek('/personel/randevular');
  assert.ok(ok.gecti);
  r = cevap(); await pc.randevularim({ ...ok.req, query: { tarih: gun } }, r);
  assert.deepEqual(r.veri.randevular.map(x => [x.musteri, x.saat]), [['Ayşe Kaya', '10:00']], 'yalnız kendi randevusu');
  assert.equal('telefon' in r.veri.randevular[0], false, 'telefon gösterilmez');

  // Esnaf erişimi kaldırınca oturum düşer
  r = cevap(); await pc.erisimKaldir({ kullanici: { isletme_id: 1 }, params: { id: 1 } }, r);
  assert.equal(r.veri.kapanan, 1);
  assert.equal((await istek('/personel/ben')).res.kod, 401);
  void db;
});

test('KVKK: yaklaşan randevu varken silinmez; sonra müşteri anonimleşir, sohbet/bekleme kayıtları silinir', async () => {
  const { db } = await ortam();
  await db.exec(`INSERT INTO randevular (isletme_id, calisan_id, musteri_id, hizmet_id, tarih, saat, bitis_saati, durum) VALUES
      (1, 1, 1, 1, '${gunSonraTarih(3)}', '10:00', '10:30', 'onaylandi'), (1, 1, 1, 1, '2026-01-05', '10:00', '10:30', 'tamamlandi');
    INSERT INTO bot_durum VALUES ('905550000001', 1);
    INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, istenen_tarih) VALUES ('905550000001', 1, '2030-01-01');`);
  const kvkk = require(path.join(SRC, 'services', 'kvkk'));
  await assert.rejects(kvkk.veriSil({ isletmeId: 1, telefon: '905550000001' }), /yaklaşan bir randevunuz var/);
  await db.exec("UPDATE randevular SET durum = 'iptal' WHERE tarih > '2026-06-01'");
  await kvkk.veriSil({ isletmeId: 1, telefon: '905550000001' });
  const m = (await db.query('SELECT isim, telefon FROM musteriler WHERE id = 1')).rows[0];
  assert.deepEqual(m, { isim: 'Silinmiş müşteri', telefon: 'silindi-1' });
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM randevular WHERE musteri_id = 1')).rows[0].n, 2, 'randevu kayıtları kalır');
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM bot_durum")).rows[0].n, 0);
  assert.equal((await db.query("SELECT COUNT(*)::int n FROM bekleme_listesi")).rows[0].n, 0);
  const t = (await db.query('SELECT telefon_ozet, durum FROM kvkk_silme_talepleri ORDER BY id')).rows;
  assert.deepEqual(t.map(x => x.durum), ['yaklasan_randevu', 'silindi']);
  assert.doesNotMatch(t[0].telefon_ozet, /5550000001/, 'telefon açık saklanmaz');
});
