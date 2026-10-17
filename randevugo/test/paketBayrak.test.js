// Paket Yönetimi (2026-10-17): tüm özellik bayrakları panelden; NULL = koddaki varsayılan
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

test('paket bayrakları: NULL varsayılana düşer, panelden yazılan geçerli olur', async () => {
  const { db } = await hazirla(`
    CREATE TABLE paket_tanimlari (id SERIAL PRIMARY KEY, kod TEXT UNIQUE, isim TEXT, fiyat NUMERIC, calisan_limit INT, hizmet_limit INT,
      aylik_randevu_limit INT, bot_aktif BOOLEAN DEFAULT true, hatirlatma BOOLEAN, istatistik BOOLEAN, export_aktif BOOLEAN, ozellikler TEXT,
      aktif BOOLEAN DEFAULT true, sira INT DEFAULT 0, gorsel TEXT, gorsel_guncelleme TIMESTAMP);
    CREATE TABLE audit_log (id SERIAL, isletme_id INT, kullanici_id INT, kullanici_email TEXT, islem TEXT, detay TEXT, hedef_tablo TEXT, hedef_id INT, ip_adresi TEXT);
    INSERT INTO paket_tanimlari (kod, isim, fiyat, calisan_limit, hizmet_limit, aylik_randevu_limit, hatirlatma, istatistik, export_aktif)
      VALUES ('baslangic', 'Başlangıç', 299, 2, 10, 500, true, false, true), ('profesyonel', 'Standart', 499, 5, 50, 99999, true, true, true);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/059_paket_bayraklari.sql', 'utf8'));
  const pk = require(SRC + '/config/paketler');
  pk.paketCacheTemizle();
  // Kolonlar eklendi ama NULL: koddaki varsayılan geçerli (Standart'ta mağaza ve 3 dil açık kalmalı)
  assert.strictEqual((await pk.paketGetir('baslangic')).magaza, false);
  assert.strictEqual((await pk.paketGetir('profesyonel')).magaza, true);
  assert.strictEqual((await pk.paketGetir('profesyonel')).coklu_dil, 3);

  const c = require(SRC + '/controllers/adminController');
  const res = () => { const r = {}; r.json = (v) => { r.v = v; return r; }; r.status = () => r; return r; };
  let r = res(); await c.paketTanimlariGetir({}, r);
  const bas = r.v.paketler.find(p => p.kod === 'baslangic');
  assert.strictEqual(bas.etkin.magaza, false);
  assert.ok(r.v.bayraklar.magaza && r.v.sayilar.coklu_dil, 'panel etiketleri gelir');

  r = res(); await c.paketTanimiGuncelle({ kullanici: { id: 1 }, params: { id: bas.id }, body: { isim: 'Başlangıç', fiyat: 299, calisan_limit: 2, hizmet_limit: 10,
    aylik_randevu_limit: 500, bot_aktif: true, hatirlatma: true, istatistik: false, export_aktif: true, magaza: true, kasa: false, coklu_dil: 2, bilinmeyen: true } }, r);
  assert.strictEqual(r.v.mesaj, 'Güncellendi');
  const b = await pk.paketGetir('baslangic');
  assert.deepStrictEqual([b.magaza, b.kasa, b.coklu_dil, b.sadakat], [true, false, 2, false], 'gönderilmeyen bayrak varsayılanda kalır');
});
