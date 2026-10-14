// Seans takibi (sayaç, bitiş, hatırlatma, ileri randevu varsa sessiz) ve hafıza kartı (işlem notu, fotoğraf, "son işlem").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

function taklit(modul, exports) {
  const ad = require.resolve(path.join(SRC, modul));
  require.cache[ad] = { id: ad, filename: ad, loaded: true, exports };
}
const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, musteri_id INT, hizmet_id INT, calisan_id INT, tarih DATE, saat TIME, durum TEXT);
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY); CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(20), isletme_id INT, istenen_tarih DATE, durum TEXT);
  INSERT INTO isletmeler (isim, slug) VALUES ('Lazer Güzellik', 'lazer'), ('Başka', 'baska');
  INSERT INTO musteriler (isim, telefon) VALUES ('Selin Kaya', '905551112233');
  INSERT INTO hizmetler (isletme_id, isim, fiyat, sure_dk) VALUES (1, 'Lazer Epilasyon', 900, 45), (1, 'Kaş', 150, 15);
  ${fs.readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8')}
  UPDATE hizmetler SET seans_sayisi = 3, seans_aralik_gun = 30 WHERE id = 1;`;

test('seans: sayaç, bitiş, hatırlatma, ileri randevu varsa sessiz', async () => {
  const { db } = await hazirla(SEMA);
  const giden = [];
  taklit('services/whatsappWeb', { getDurum: () => ({ durum: 'bagli' }), mesajGonder: async (id, tel, m) => { giden.push(m); return { success: true }; } });
  const seans = require(path.join(SRC, 'services', 'seans'));
  const { gunSonraTarih, bugunTarih } = require(path.join(SRC, 'utils', 'tarih'));
  const ekle = async (tarih, hizmet = 1) => (await db.query(
    `INSERT INTO randevular (isletme_id, musteri_id, hizmet_id, tarih, saat, durum) VALUES (1, 1, $1, $2, '10:00', 'tamamlandi') RETURNING id`, [hizmet, tarih])).rows[0].id;

  const r1 = await ekle(gunSonraTarih(-40));
  assert.deepEqual(await seans.randevuTamamlandi(r1), { seansId: 1, no: 1, toplam: 3, bitti: false });
  assert.equal(await seans.randevuTamamlandi(r1), null, 'aynı randevu iki kez sayılmaz');
  assert.equal(await seans.randevuTamamlandi(await ekle(bugunTarih(), 2)), null, 'seanssız hizmet sayılmaz');

  // 40 gün önceki seans, 30 günlük aralık → hatırlatma zamanı geçmiş ama en erken yarın kurulur
  const ms = (await db.query('SELECT * FROM musteri_seanslari')).rows[0];
  assert.equal(require(path.join(SRC, 'utils', 'tarih')).tarihFormatla(ms.sonraki_hatirlatma), gunSonraTarih(1));
  await db.query('UPDATE musteri_seanslari SET sonraki_hatirlatma = $1', [bugunTarih()]);
  assert.equal(await seans.hatirlatmalariGonder(), 1);
  assert.match(giden[0], /2\. seans/); assert.match(giden[0], /1\/3 tamamlandı/); assert.match(giden[0], /randevu\.sırago\.com\/book\/lazer/);
  assert.equal(await seans.hatirlatmalariGonder(), 0, 'aynı gün tekrar gitmez (bir hafta sonra)');

  // İleri tarihli randevusu varsa hatırlatma gitmez
  await db.query('UPDATE musteri_seanslari SET sonraki_hatirlatma = $1', [bugunTarih()]);
  await db.query(`INSERT INTO randevular (isletme_id, musteri_id, hizmet_id, tarih, saat, durum) VALUES (1, 1, 1, $1, '11:00', 'onaylandi')`, [gunSonraTarih(3)]);
  assert.equal(await seans.hatirlatmalariGonder(), 0);
  assert.equal((await db.query('SELECT sonraki_hatirlatma FROM musteri_seanslari')).rows[0].sonraki_hatirlatma, null);

  // 2. ve 3. seans → paket biter, hatırlatma yok
  await seans.randevuTamamlandi(await ekle(gunSonraTarih(-10)));
  const son = await seans.randevuTamamlandi(await ekle(bugunTarih()));
  assert.deepEqual([son.no, son.bitti], [3, true]);
  const bitti = (await db.query('SELECT durum, sonraki_hatirlatma FROM musteri_seanslari')).rows[0];
  assert.deepEqual([bitti.durum, bitti.sonraki_hatirlatma], ['bitti', null]);
  // Yeni seans paketi: 4. lazer randevusu yeni paketin 1. seansı olur
  assert.deepEqual((await seans.randevuTamamlandi(await ekle(bugunTarih()))).no, 1);
});

test('hafıza kartı: işlem notu, fotoğraf, sonraki randevuda "son işlem", seans etiketi verisi', async () => {
  const { db } = await hazirla(SEMA);
  taklit('services/socketServer', { emitToIsletme: () => {}, init: () => {} });
  const ac = require(path.join(SRC, 'controllers', 'adminController'));
  const req = (params, body, isletme = 1) => ({ params, body, query: {}, kullanici: { isletme_id: isletme, id: 1 } });
  await db.query(`INSERT INTO randevular (isletme_id, musteri_id, hizmet_id, tarih, saat, durum) VALUES
    (1, 1, 2, '2026-09-01', '10:00', 'tamamlandi'), (1, 1, 1, '2026-10-20', '15:00', 'onaylandi')`);

  let r = cevap(); await ac.randevuIslemKaydet(req({ id: 1 }, { islem_notu: '  Kaş: ince, kemer yüksek  ', foto: 'data:image/jpeg;base64,QUJD' }), r);
  assert.deepEqual([r.veri.islem_notu, r.veri.islem_foto_var], ['Kaş: ince, kemer yüksek', true]);
  r = cevap(); await ac.randevuIslemKaydet(req({ id: 1 }, { foto: 'data:text/html;base64,PHNjcmlwdD4=' }), r); assert.equal(r.kod, 400);
  r = cevap(); await ac.randevuIslemKaydet(req({ id: 1 }, { islem_notu: 'x' }, 2), r); assert.equal(r.kod, 404, 'başka işletme yazamaz');
  r = cevap(); await ac.randevuIslemGetir(req({ id: 1 }, {}, 2), r); assert.equal(r.kod, 404, 'başka işletme okuyamaz');
  r = cevap(); await ac.randevuIslemGetir(req({ id: 1 }, {}), r); assert.equal(r.veri.foto, 'data:image/jpeg;base64,QUJD');

  // Randevu listesi: sonraki randevuda önceki not + seans etiketi verisi
  r = cevap(); await ac.randevulariGetir(req({}, {}), r);
  assert.equal(r.kod, 200, JSON.stringify(r.veri));
  const sonraki = r.veri.randevular.find(x => x.id === 2);
  assert.equal(sonraki.son_islem_notu, 'Kaş: ince, kemer yüksek'); assert.equal(sonraki.son_islem_randevu_id, 1); assert.equal(sonraki.son_islem_foto_var, true);
  assert.equal(sonraki.seans_sayisi, 3, 'seanslı hizmet → panel "Seans 1/3" gösterir');
  const onceki = r.veri.randevular.find(x => x.id === 1);
  assert.equal(onceki.son_islem_notu, null, 'kendi notu "son işlem" diye görünmez'); assert.equal(onceki.islem_foto_var, true);

  r = cevap(); await ac.randevuIslemKaydet(req({ id: 1 }, { foto: null }), r); assert.equal(r.veri.islem_foto_var, false);
});
