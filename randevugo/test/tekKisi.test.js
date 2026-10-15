// Tek kişi düzeni (2026-10-16): bot sıcak adayı Satış Masası'na devreder; sabah özeti günde bir kez Telegram'a gider.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const telegram = [];

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, isletme_adi TEXT, kategori TEXT, durum TEXT, lead_id INT,
      gelen_mesajlar TEXT, gonderilen_mesaj TEXT, son_mesaj_tarihi TIMESTAMP, kayit_isletme_id INT, kurulum_durum JSONB, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, durum TEXT, puan NUMERIC, ilce TEXT, demo_isletme_id INT,
      atanan_id INT, sonraki_arama TIMESTAMP);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, demo BOOLEAN DEFAULT false, demo_lead_id INT, aktif BOOLEAN DEFAULT true, kayit_kanali TEXT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW(), deneme_bitis_tarihi TIMESTAMP, paket_bitis_tarihi TIMESTAMP);
    CREATE TABLE satis_aktivite (id SERIAL PRIMARY KEY, kullanici_id INT NOT NULL, lead_id INT, isletme_id INT, tip TEXT, notu TEXT, otomatik BOOLEAN DEFAULT false,
      olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, durum TEXT, odeme_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE sistem_uyarilari (id SERIAL PRIMARY KEY, baslik TEXT, seviye TEXT, cozuldu BOOLEAN DEFAULT false, son_zaman TIMESTAMP DEFAULT NOW());
    CREATE TABLE ekip_ayar (anahtar VARCHAR(50) PRIMARY KEY, deger JSONB NOT NULL);
    INSERT INTO potansiyel_musteriler (isletme_adi, puan, ilce) VALUES ('Demo Kuaför', 4.8, 'Moda');
    INSERT INTO isletmeler (isim, demo, demo_lead_id) VALUES ('Demo Kuaför', true, 1);
    INSERT INTO isletmeler (isim, kayit_kanali) VALUES ('Yeni Berber', 'saha');
    INSERT INTO odemeler (isletme_id, tutar, durum, odeme_tarihi) VALUES (2, 499, 'odendi', NOW());
    INSERT INTO randevular (isletme_id, kaynak) VALUES (2, 'bot'), (2, 'manuel');
    INSERT INTO sistem_uyarilari (baslik, seviye) VALUES ('WhatsApp çıkış: Berber X', 'kritik');`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/054_tek_kisi.sql', 'utf8'));
  sahte('services/satisBot', { _mdKacis: (x) => String(x ?? ''), _telegramBildirimGonder: async (m) => { telegram.push(m); }, bagliNumaralar: () => [] });
  sahte('services/merkezOtpBot', { aktifMi: () => true });
  return o;
})();

const konusma = async (db, ad, durum, mesajlar = '', ek = {}) => (await db.query(
  `INSERT INTO satis_konusmalar (telefon, isletme_adi, durum, gelen_mesajlar, lead_id, son_mesaj_tarihi, gonderilen_mesaj)
   VALUES ($1, $2, $3, $4, $5, NOW(), 'Merhaba') RETURNING id`, [ek.tel || '90532' + Math.floor(Math.random() * 1e7), ad, durum, mesajlar, ek.lead || null])).rows[0].id;

test('sıcak aday devri: güçlü sinyal öne geçer, arama notu hazır, sonuçlar listeyi günceller', async () => {
  const { db } = await ortam;
  const devir = require(SRC + '/services/devir');
  assert.strictEqual(devir.sebepBul({ metin: 'aylık ne kadar?', durum: 'ai_devrede' }), 'fiyat');
  assert.strictEqual(devir.sebepBul({ metin: 'olur', durum: 'olumlu', arama: true }), 'arama');
  assert.strictEqual(devir.sebepBul({ metin: 'tamam', durum: 'ai_devrede' }), null);

  const a = await konusma(db, 'Fiyatçı Berber', 'ai_devrede', '\n[10:00:00] Müşteri: merhaba\n[10:00:05] Bot: Merhaba!\n[10:01:00] Müşteri: aylık ne kadar?');
  const b = await konusma(db, 'Arayın Kuaför', 'sicak');
  const c = await konusma(db, 'Reddeden', 'olumsuz');
  const d = await konusma(db, 'Demo Kuaför', 'ai_devrede', '', { lead: 1 });
  assert.strictEqual(await devir.devret(a, 'fiyat'), true);
  assert.strictEqual(await devir.devret(a, 'olumlu'), false, 'zayıf sinyal güçlüyü ezmez');
  assert.strictEqual(await devir.devret(b, 'arama'), true);
  assert.strictEqual(await devir.devret(c, 'sicak'), false, 'reddedene devir yok');
  assert.strictEqual(await devir.demoAcildi(1), true, 'demosunu açan devredilir');

  let l = await devir.liste();
  assert.deepStrictEqual(l.map(x => x.isletme_adi), ['Arayın Kuaför', 'Fiyatçı Berber', 'Demo Kuaför']);
  assert.deepStrictEqual(l[1].not, ['merhaba', 'aylık ne kadar?']);
  assert.strictEqual(l[2].puan != null && l[2].ilce, 'Moda');

  const m = require(SRC + '/controllers/masaController');
  const res = () => { const r = {}; r.status = () => r; r.json = (v) => { r.v = v; return r; }; return r; };
  await m.sicakKapat({ kullanici: { id: 7 }, params: { id: b }, body: { sonuc: 'ulasilamadi' } }, res());
  await m.sicakKapat({ kullanici: { id: 7 }, params: { id: a }, body: { sonuc: 'gorustu' } }, res());
  await m.sicakKapat({ kullanici: { id: 7 }, params: { id: d }, body: { sonuc: 'ilgilenmiyor' } }, res());
  l = await devir.liste();
  assert.strictEqual(l.length, 0, 'ulaşılamayan 3 saat gizli, diğerleri kapandı');
  assert.strictEqual((await db.query('SELECT durum FROM satis_konusmalar WHERE id = $1', [d])).rows[0].durum, 'olumsuz', 'ilgilenmeyene bot da yazmaz');
  assert.deepStrictEqual((await db.query('SELECT tip FROM satis_aktivite ORDER BY id')).rows.map(r => r.tip), ['arama_yok', 'gorustu', 'ilgilenmiyor']);
  assert.strictEqual(await devir.devret(a, 'arama'), true, 'kapanan aday yeniden "arayın" derse geri gelir');
  await db.query("UPDATE satis_konusmalar SET devir_ertele = NOW() - INTERVAL '1 minute' WHERE id = $1", [b]);
  assert.deepStrictEqual((await devir.liste()).map(x => x.isletme_adi), ['Fiyatçı Berber', 'Arayın Kuaför'], 'ikisi de aranmak istiyor: yenisi üstte');
});

test('sabah özeti: son 24 saat, aranacaklar ve dikkat; günde bir kez, yalnız sabah', async () => {
  await ortam;
  const o = require(SRC + '/services/sabahOzeti');
  const metin = await o.hazirla();
  assert.match(metin, /Kayıt: 1 \(Yeni Berber\)/);
  assert.match(metin, /Ödeme: 1 · 499₺/);
  assert.match(metin, /Esnaflara gelen randevu: 2 \(1 otomatik/);
  assert.match(metin, /Bot sana devretti: 2 aday/);
  assert.match(metin, /Arayın Kuaför · \+\d+ · Aranmak istiyor/);
  assert.match(metin, /Açık kritik uyarı: 1/);
  assert.match(metin, /Satış Bot numarası BAĞLI DEĞİL/);
  assert.doesNotMatch(metin, /Merkez OTP BAĞLI DEĞİL/);

  const saat = (s) => new Date(`2026-10-17T${s}:00+03:00`);
  assert.strictEqual(await o.zamaniGeldiyse(saat('07:30')), false);
  assert.strictEqual(await o.zamaniGeldiyse(saat('08:50')), true);
  assert.strictEqual(await o.zamaniGeldiyse(saat('09:00')), false, 'aynı gün ikinci kez gitmez');
  assert.strictEqual(await o.zamaniGeldiyse(new Date('2026-10-18T08:46:00+03:00')), true, 'ertesi gün yine gider');
  assert.strictEqual(telegram.length, 2);
});
