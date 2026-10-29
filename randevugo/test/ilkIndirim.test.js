// İlk randevu indirimi (kullanıcı kararı 2026-10-29): esnaf yeni müşteriye %20 ya da 100 ₺ indirim verir; hangi hizmetlerde
// geçerli olduğunu seçer. İndirim randevuya yazılan fiyata uygulanır (ciro da indirimli), yalnız ilk randevuda.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');
const { kampanya, uygula, ayarTemiz } = require('../src/utils/ilkIndirim');

test('kampanya: kapalı, değersiz ya da süresi geçmiş kampanya yok sayılır', () => {
  const i = { ilk_indirim_aktif: true, ilk_indirim_tur: 'yuzde', ilk_indirim_deger: '20', ilk_indirim_bitis: '2030-02-01' };
  assert.deepEqual(kampanya(i, '2030-01-15'), { tur: 'yuzde', deger: 20, bitis: '2030-02-01' });
  assert.equal(kampanya({ ...i, ilk_indirim_aktif: false }, '2030-01-15'), null);
  assert.equal(kampanya({ ...i, ilk_indirim_deger: null }, '2030-01-15'), null);
  assert.equal(kampanya(i, '2030-02-02'), null, 'bitiş günü geçti');
  assert.ok(kampanya(i, '2030-02-01'), 'bitiş günü dahil');
});

test('uygula: yüzde her uygun hizmete, TL sırayla düşülür; kapsam dışı hizmet tam fiyat', () => {
  const hz = [{ fiyat: '700' }, { fiyat: '500', ilk_indirim: false }, { fiyat: '250' }];
  assert.deepEqual(uygula(hz, { tur: 'yuzde', deger: 20 }), { fiyatlar: [560, 500, 200], tutar: 190 });
  assert.deepEqual(uygula(hz, { tur: 'tl', deger: 800 }), { fiyatlar: [0, 500, 150], tutar: 800 });
  assert.deepEqual(uygula(hz, null), { fiyatlar: [700, 500, 250], tutar: 0 });
  assert.deepEqual(uygula([{ fiyat: 215 }], { tur: 'yuzde', deger: 15 }).fiyatlar, [183], 'tam liraya yuvarlanır');
});

test('ayarTemiz: açıkken miktar zorunlu, yüzde en fazla 90', () => {
  assert.ok(ayarTemiz({ aktif: true, tur: 'yuzde', deger: '' }).hata);
  assert.ok(ayarTemiz({ aktif: true, tur: 'yuzde', deger: 95 }).hata);
  assert.deepEqual(ayarTemiz({ aktif: true, tur: 'tl', deger: '100,5', bitis: '' }), { aktif: true, tur: 'tl', deger: 100.5, bitis: null });
  assert.deepEqual(ayarTemiz({ aktif: false, deger: '' }), { aktif: false, tur: 'yuzde', deger: null, bitis: null });
});

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT DEFAULT 'profesyonel', calisma_baslangic TIME DEFAULT '09:00',
    calisma_bitis TIME DEFAULT '18:00', kapali_gunler TEXT DEFAULT '', randevu_suresi_dk INT DEFAULT 30, mola_saatleri JSONB DEFAULT '[]',
    randevu_modu TEXT, slot_aralik_dk INT, varsayilan_tampon_dk INT DEFAULT 0, grup_id INT, randevu_onay_modu TEXT,
    kapora_aktif BOOLEAN DEFAULT false, kapora_alt_siniri NUMERIC, kapora_orani INT,
    ilk_indirim_aktif BOOLEAN DEFAULT true, ilk_indirim_tur TEXT DEFAULT 'yuzde', ilk_indirim_deger NUMERIC DEFAULT 20, ilk_indirim_bitis DATE);
  CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT UNIQUE, grup_id INT, son_gelinen_isletme_id INT);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, tampon_dk INT DEFAULT 0, kapora_yuzdesi INT DEFAULT 0,
    ilk_indirim BOOLEAN DEFAULT true);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME, calisma_bitis TIME,
    kapali_gunler TEXT, mola_saatleri JSONB DEFAULT '[]');
  CREATE TABLE calisan_hizmetler (calisan_id INT, hizmet_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, calisan_id INT, musteri_id INT, hizmet_id INT, tarih DATE, saat TIME, bitis_saati TIME,
    durum TEXT, kapora_durumu TEXT, kapora_tutari NUMERIC, kaynak TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW(), bagli_randevu_id INT,
    ilk_indirim_tutari NUMERIC);
  CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, sira INT, fiyat NUMERIC, sure_dk INT);
  CREATE TABLE paket_tanimlari (kod TEXT);
  INSERT INTO isletmeler (isim) VALUES ('Villa');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, ilk_indirim) VALUES (1, 'Erkek Saç Kesim', 30, 700, true), (1, 'Kaş Alımı', 15, 500, true),
    (1, 'Lazer Paket', 90, 13000, false);
  INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Ferhat'), (1, 'Derya');
  INSERT INTO calisan_hizmetler VALUES (1, 1), (2, 2), (2, 3);`;
const GUN = '2030-01-15';
const TEL = '905550000009';

async function servis() {
  const { db } = await hazirla(SEMA);
  delete require.cache[require.resolve(path.join(SRC, 'services', 'randevu'))];
  return { db, r: require(path.join(SRC, 'services', 'randevu')) };
}
const fiyatlar = async (db, id) => (await db.query('SELECT fiyat FROM randevu_hizmetleri WHERE randevu_id = $1 ORDER BY sira', [id])).rows.map(x => Number(x.fiyat));

test('ilk randevuda indirim yazılır, ikincisinde yazılmaz; iptal edilen randevu sayılmaz', async () => {
  const { db, r } = await servis();
  assert.ok(await r.ilkIndirimBul(1, TEL));

  const ilk = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [1], tarih: GUN, saat: '09:00', kaynak: 'online', ilkIndirim: true });
  assert.equal(ilk.ilkIndirimTutari, 140);
  assert.equal(ilk.hizmet.fiyat, 560);
  assert.deepEqual(await fiyatlar(db, ilk.randevu.id), [560], 'ciro indirimli fiyattan');
  assert.equal(Number(ilk.randevu.ilk_indirim_tutari), 140, 'panel etiketi için randevuda');

  assert.equal(await r.ilkIndirimBul(1, TEL), null, 'artık ilk değil');
  const ikinci = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [1], tarih: GUN, saat: '10:00', kaynak: 'online', ilkIndirim: true });
  assert.equal(ikinci.ilkIndirimTutari, 0);
  assert.deepEqual(await fiyatlar(db, ikinci.randevu.id), [700]);

  await db.exec(`UPDATE randevular SET durum = 'iptal'`);
  assert.ok(await r.ilkIndirimBul(1, TEL), 'iptal edilenler ilk randevu hakkını yemez');
});

test('bot ve panel randevusu kampanyayı kullanmaz (ilkIndirim istenmedi)', async () => {
  const { db, r } = await servis();
  const s = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [1], tarih: GUN, saat: '09:00', kaynak: 'bot' });
  assert.equal(s.ilkIndirimTutari, 0);
  assert.deepEqual(await fiyatlar(db, s.randevu.id), [700]);
});

test('kapsam dışı hizmete indirim yok; bölünmüş randevuda TL indirimi bir kez dağılır', async () => {
  const { db, r } = await servis();
  const lazer = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [3], tarih: GUN, saat: '09:00', kaynak: 'online', ilkIndirim: true });
  assert.equal(lazer.ilkIndirimTutari, 0, 'lazer paketi kampanya dışı');

  await db.exec(`UPDATE randevular SET durum = 'iptal'; UPDATE isletmeler SET ilk_indirim_tur = 'tl', ilk_indirim_deger = 900`);
  // Saç Ferhat'ta, kaş Derya'da: 900 ₺'nin 700'ü saçtan, 200'ü kaştan düşer
  const s = await r.randevuOlustur({ isletmeId: 1, musteriTelefon: TEL, hizmetIds: [1, 2], tarih: GUN, saat: '11:00', kaynak: 'online', ilkIndirim: true });
  assert.equal(s.parcalar.length, 2);
  assert.equal(s.ilkIndirimTutari, 900);
  assert.equal(s.hizmet.fiyat, 300);
  assert.deepEqual(await fiyatlar(db, s.parcalar[0].randevu.id), [0]);
  assert.deepEqual(await fiyatlar(db, s.parcalar[1].randevu.id), [300]);
});
