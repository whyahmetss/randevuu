// Platform yönetimi (2026-10-15): Platform Ayarları, Sistem Uyarıları, bot şablonları, özellik anahtarları,
// kuponlar (ödeme akışı dahil) ve KVKK dışa aktarma.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const temizCache = () => {
  const dbYolu = require.resolve(path.join(SRC, 'config', 'db'));
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && k !== dbYolu) delete require.cache[k];
};
const cevap = () => {
  const r = { kod: 200, govde: null, basliklar: {} };
  r.status = (k) => { r.kod = k; return r; };
  r.json = (g) => { r.govde = g; return r; };
  r.set = (k, v) => { r.basliklar[k] = v; return r; };
  r.send = (g) => { r.govde = g; return r; };
  r.end = () => r;
  return r;
};
const migr = (ad) => fs.readFileSync(path.join(SRC, 'migrations', ad), 'utf8');

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, paket TEXT, grup_id INT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
    paket_bitis_tarihi TIMESTAMP, bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT, bekleyen_sure VARCHAR(5), son_odeme_sure VARCHAR(5),
    oncu_no INT, kilitli_paket TEXT, kilitli_fiyat NUMERIC, referans_ile_gelen INT, referans_odeme_tetiklendi BOOLEAN, bot_konusma_stili TEXT, bot_diller TEXT);
  CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, odeme_yontemi TEXT, referans_kodu TEXT,
    shopier_urun_id TEXT, shopier_siparis_id TEXT, odeme_tarihi TIMESTAMP);
  CREATE UNIQUE INDEX ON odemeler (isletme_id, donem) WHERE isletme_id IS NOT NULL;
  CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, email TEXT, sifre TEXT, isletme_id INT);
  CREATE TABLE audit_log (id SERIAL PRIMARY KEY, isletme_id INT, kullanici_id INT, kullanici_email TEXT, islem TEXT, detay TEXT, hedef_tablo TEXT, hedef_id INT, ip_adresi TEXT);
  CREATE TABLE paket_tanimlari (id SERIAL PRIMARY KEY, kod TEXT, isim TEXT, fiyat NUMERIC, aktif BOOLEAN DEFAULT true, sira INT DEFAULT 0);
  ${migr('049_paket_gorsel.sql')}
  ${migr('050_platform_yonetimi.sql')}
  INSERT INTO isletmeler (isim, telefon, paket, paket_bitis_tarihi) VALUES ('Kemal', '905551112233', 'baslangic', NOW()), ('Ali', '905551112244', 'baslangic', NOW());`;

async function ortam(ekSema = '') {
  const { db } = await hazirla(SEMA + ekSema);
  temizCache();
  sahte('services/socketServer', { emitToAdmin() {}, emitToIsletme() {} });
  sahte('services/pushService', { sendToAdmin() {}, sendToIsletme() {} });
  sahte('services/odemeOtomasyon', { odemeAlindiBildir() {} });
  return db;
}

test('platform ayarları: varsayılan, doğrulama, kaydet; deneme süresi anında değişir', async () => {
  await ortam();
  const ayar = require(path.join(SRC, 'utils', 'platformAyar'));
  await ayar.yukle();
  assert.equal(ayar.al('galeri_limit'), 12);
  await assert.rejects(() => ayar.kaydet({ deneme_gun: 0 }), /1–90/);
  await assert.rejects(() => ayar.kaydet({ havale_iban: 'TR12' }), /IBAN/);
  await assert.rejects(() => ayar.kaydet({ bilinmeyen: 1 }), /Bilinmeyen/);
  await assert.rejects(() => ayar.kaydet({ destek_whatsapp: '0532 111 22 33' }), /905/);
  const degisen = await ayar.kaydet({ deneme_gun: 30, havale_iban: 'tr330006100519786457841326' }, 'test');
  assert.equal(degisen.length, 2);
  assert.equal(ayar.al('deneme_gun'), 30);
  assert.equal(require(path.join(SRC, 'config', 'deneme')).denemeGun(), 30);
  assert.equal(ayar.al('havale_iban'), 'TR33 0006 1005 1978 6457 8413 26');
  // Boş → varsayılana döner
  await ayar.kaydet({ deneme_gun: '' });
  assert.equal(ayar.al('deneme_gun'), Math.max(1, parseInt(process.env.DENEME_GUN) || 14));
});

test('sistem uyarıları: aynı sorun tek satırda sayılır, çözülünce yeni sorun yeni satır', async () => {
  const db = await ortam();
  const su = require(path.join(SRC, 'utils', 'sistemUyari'));
  await su.uyar({ tip: 'cevapsiz', anahtar: 'cevapsiz:1', baslik: 'Cevapsız', isletmeId: 1, seviye: 'kritik' });
  await su.uyar({ tip: 'cevapsiz', anahtar: 'cevapsiz:1', baslik: 'Cevapsız', detay: 'ikinci', isletmeId: 1, seviye: 'kritik' });
  let r = (await db.query('SELECT * FROM sistem_uyarilari')).rows;
  assert.equal(r.length, 1);
  assert.equal(r[0].adet, 2);
  assert.equal(r[0].detay, 'ikinci');
  await su.coz('cevapsiz:1');
  await su.uyar({ tip: 'cevapsiz', anahtar: 'cevapsiz:1', baslik: 'Cevapsız', isletmeId: 1 });
  r = (await db.query('SELECT cozuldu FROM sistem_uyarilari ORDER BY id')).rows;
  assert.deepEqual(r.map(x => x.cozuldu), [true, false]);
  // Telegram alarmı da panele düşer
  await require(path.join(SRC, 'utils', 'alarm')).alarm('Test alarmı', 'detay');
  assert.ok((await db.query("SELECT 1 FROM sistem_uyarilari WHERE anahtar = 'alarm:Test alarmı'")).rows[0]);
});

test('bot mesajları: panel şablonu koddaki metnin yerine geçer; liste mesajı ve bilinmeyen alan reddedilir', async () => {
  await ortam();
  const M = require(path.join(SRC, 'utils', 'botMesajlar'));
  const ctrl = require(path.join(SRC, 'controllers', 'platformController'));
  const isletme = { bot_diller: 'tr' };
  assert.match(M.get(isletme, 'mesaiDisi', { basSaat: '09:00', bitSaat: '19:00' }), /Şu an kapalıyız/);

  let r = cevap();
  await ctrl.botMesajKaydet({ params: { anahtar: 'mesaiDisi', dil: 'tr' }, body: { metin: 'Dükkân kapalı ({basSaat}–{bitSaat}), {yok}' }, kullanici: {} }, r);
  assert.equal(r.kod, 400);
  assert.match(r.govde.hata, /\{yok\}/);

  r = cevap();
  await ctrl.botMesajKaydet({ params: { anahtar: 'hizmetListesi', dil: 'tr' }, body: { metin: 'x' }, kullanici: {} }, r);
  assert.equal(r.kod, 400);

  r = cevap();
  await ctrl.botMesajKaydet({ params: { anahtar: 'mesaiDisi', dil: 'tr' }, body: { metin: 'Dükkân kapalı ({basSaat}–{bitSaat})' }, kullanici: {} }, r);
  assert.equal(r.kod, 200);
  assert.equal(M.get(isletme, 'mesaiDisi', { basSaat: '09:00', bitSaat: '19:00' }), 'Dükkân kapalı (09:00–19:00)');

  r = cevap();
  await ctrl.botMesajKaydet({ params: { anahtar: 'mesaiDisi', dil: 'tr' }, body: { metin: null }, kullanici: {} }, r);
  assert.match(M.get(isletme, 'mesaiDisi', { basSaat: '09:00', bitSaat: '19:00' }), /Şu an kapalıyız/);
});

test('özellik anahtarları: kapalı / herkes / seçili işletmeler', async () => {
  await ortam();
  const oz = require(path.join(SRC, 'utils', 'ozellik'));
  const ctrl = require(path.join(SRC, 'controllers', 'platformController'));
  assert.equal(oz.acik('yeni_takvim', 1), false);
  let r = cevap();
  await ctrl.ozellikKaydet({ params: {}, body: { kod: 'yeni_takvim', durum: 'secili', isletme_idler: '1, 7' }, kullanici: {} }, r);
  assert.equal(r.kod, 200);
  assert.equal(oz.acik('yeni_takvim', 1), true);
  assert.equal(oz.acik('yeni_takvim', 2), false);
  r = cevap();
  await ctrl.ozellikKaydet({ params: { kod: 'yeni_takvim' }, body: { durum: 'herkes' }, kullanici: {} }, r);
  assert.equal(oz.acik('yeni_takvim', 2), true);
  r = cevap();
  await ctrl.ozellikKaydet({ params: {}, body: { kod: 'Kötü Kod', durum: 'herkes' }, kullanici: {} }, r);
  assert.equal(r.kod, 400);
});

test('kupon: doğrulama kuralları', async () => {
  const db = await ortam(`
    INSERT INTO kuponlar (kod, indirim_yuzde, son_tarih) VALUES ('ESKI50', 50, '2020-01-01');
    INSERT INTO kuponlar (kod, indirim_tl, max_kullanim, kullanim) VALUES ('DOLU', 50, 1, 1);
    INSERT INTO kuponlar (kod, indirim_yuzde, paketler) VALUES ('PRO', 20, ARRAY['proplus']);
    INSERT INTO kuponlar (kod, indirim_tl) VALUES ('BUYUK', 500);`);
  const kupon = require(path.join(SRC, 'services', 'kupon'));
  await assert.rejects(() => kupon.dogrula({ kod: 'yok', isletmeId: 1, paket: 'baslangic', tutar: 299 }), /geçerli değil/);
  await assert.rejects(() => kupon.dogrula({ kod: 'eski50', isletmeId: 1, paket: 'baslangic', tutar: 299 }), /süresi dolmuş/);
  await assert.rejects(() => kupon.dogrula({ kod: 'DOLU', isletmeId: 1, paket: 'baslangic', tutar: 299 }), /hakkı dolmuş/);
  await assert.rejects(() => kupon.dogrula({ kod: 'PRO', isletmeId: 1, paket: 'baslangic', tutar: 299 }), /pakette geçerli değil/);
  await assert.rejects(() => kupon.dogrula({ kod: 'BUYUK', isletmeId: 1, paket: 'baslangic', tutar: 299 }), /bu tutarda/);
  assert.equal((await kupon.dogrula({ kod: ' pro ', isletmeId: 1, paket: 'proplus', tutar: 1499 })).indirimli, 1199.2);
  assert.throws(() => kupon.kuponVerisi({ kod: 'A1', indirim_yuzde: 10 }), /3–40/);
  assert.throws(() => kupon.kuponVerisi({ kod: 'IKISI', indirim_yuzde: 10, indirim_tl: 5 }), /ikisinden biri/);
  assert.throws(() => kupon.kuponVerisi({ kod: 'COK', indirim_yuzde: 95 }), /1–90/);
  void db;
});

test('kupon: ödeme indirimli açılır, indirimli ödeme paketi uzatır, kullanım bir kez sayılır', async () => {
  const db = await ortam(`INSERT INTO kuponlar (kod, indirim_yuzde, max_kullanim) VALUES ('ILKAY50', 50, 10);`);
  const s = require(path.join(SRC, 'services', 'shopierService'));
  const urunler = [];
  s.urunOlustur = async (u) => { urunler.push(u); return { id: 'U' + urunler.length, url: 'https://shopier/x' }; };
  s.urunSil = async () => {};

  await s.odemeBaslat(1, 'baslangic', null, 'ilkay50');
  assert.equal(urunler[0].fiyat, 149.5);
  assert.match(urunler[0].aciklama, /Kupon: ILKAY50/);
  await s.siparisGeldi({ id: 'S1', paymentStatus: 'paid', lineItems: [{ id: 'U1', title: urunler[0].baslik }], totals: { grandTotal: '149.50' } });

  const isl = (await db.query(`SELECT paket, bekleyen_kupon_id, ROUND(EXTRACT(EPOCH FROM (paket_bitis_tarihi - NOW())) / 86400) AS g FROM isletmeler WHERE id = 1`)).rows[0];
  assert.equal(Number(isl.g), 30, 'indirimli ödeme 30 gün uzattı');
  assert.equal(isl.bekleyen_kupon_id, null);
  assert.equal((await db.query('SELECT kullanim FROM kuponlar')).rows[0].kullanim, 1);
  assert.equal((await db.query('SELECT kupon_kodu FROM odemeler WHERE isletme_id = 1')).rows[0].kupon_kodu, 'ILKAY50');
  // Aynı işletme aynı kuponu ikinci kez kullanamaz
  await assert.rejects(() => s.odemeBaslat(1, 'baslangic', null, 'ILKAY50'), /daha önce kullandın/);

  // Yıllık + kupon: kuponlu yıllık tutar ödenince 365 gün
  await s.odemeBaslat(2, 'baslangic', 'yil', 'ILKAY50');
  assert.equal(urunler[1].fiyat, 299 * 9 / 2);
  await s.siparisGeldi({ id: 'S2', paymentStatus: 'paid', lineItems: [{ id: 'U2', title: urunler[1].baslik }], totals: { grandTotal: String(299 * 9 / 2) } });
  const g2 = (await db.query(`SELECT ROUND(EXTRACT(EPOCH FROM (paket_bitis_tarihi - NOW())) / 86400) AS g FROM isletmeler WHERE id = 2`)).rows[0].g;
  assert.equal(Number(g2), 365);
});

test('KVKK dışa aktarma: işletme verisi gelir, şifre ve WhatsApp anahtarları gelmez, başka işletme gelmez', async () => {
  await ortam(`
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, musteri_id INT, tarih DATE);
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, son_gelinen_isletme_id INT);
    CREATE TABLE wa_auth_keys (id SERIAL PRIMARY KEY, isletme_id INT, deger TEXT);
    INSERT INTO musteriler (isim, telefon) VALUES ('Ayşe', '905550000001'), ('Başka', '905550000002');
    INSERT INTO randevular (isletme_id, musteri_id, tarih) VALUES (1, 1, '2026-10-15'), (2, 2, '2026-10-15');
    INSERT INTO wa_auth_keys (isletme_id, deger) VALUES (1, 'gizli');
    INSERT INTO admin_kullanicilar (email, sifre, isletme_id) VALUES ('kemal@x.com', 'hash', 1);`);
  const d = await require(path.join(SRC, 'services', 'veriAktar')).isletmeVerisi(1);
  assert.equal(d.isletme.isim, 'Kemal');
  assert.equal(d.veri.randevular.length, 1);
  assert.deepEqual(d.veri.musteriler.map(m => m.isim), ['Ayşe']);
  assert.equal(d.veri.wa_auth_keys, undefined);
  assert.equal(d.veri.kullanicilar[0].email, 'kemal@x.com');
  assert.equal(d.veri.kullanicilar[0].sifre, undefined);
});
