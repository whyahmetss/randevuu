// Bekleme listesi panelde (2026-10-27): randevu sayfasından listeye yazılan müşteri esnafa görünmüyordu, bildirim de gitmiyordu.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };

test('bekleme listesi: esnafa bildirim, panelde yalnız bekleyenler, listeden çıkarma', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT);
    CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(50) NOT NULL, isletme_id INT, hizmet_id INT, hizmet_ids INTEGER[],
      istenen_tarih DATE NOT NULL, durum VARCHAR(20) DEFAULT 'bekliyor', musteri_isim VARCHAR(80), kaynak VARCHAR(12), bildirilen_saat VARCHAR(5),
      olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE isletme_bildirimleri (id SERIAL PRIMARY KEY, isletme_id INT, tip TEXT, baslik TEXT, mesaj TEXT, link TEXT, okundu BOOLEAN DEFAULT false,
      olusturma_tarihi TIMESTAMP DEFAULT NOW());
    INSERT INTO isletmeler (isim) VALUES ('Turkuas'), ('Başka');
    INSERT INTO hizmetler (isletme_id, isim) VALUES (1, 'Taş Masajı'), (1, 'Jakuzi');`);
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const y = require.resolve(path.join(SRC, 'services', 'pushService'));
  require.cache[y] = { id: y, filename: y, loaded: true, exports: { sendToIsletme: async () => {}, sendToAdmin: async () => {} } };
  const b = require(path.join(SRC, 'services', 'beklemeListesi'));
  const a = require(path.join(SRC, 'controllers', 'adminController'));
  const { gunSonraTarih } = require(path.join(SRC, 'utils', 'tarih'));

  await b.ekle({ isletmeId: 1, telefon: '905551112233', isim: 'Ayşe', hizmetIds: [1, 2], tarih: gunSonraTarih(1), kaynak: 'web' });
  const bil = (await db.query('SELECT * FROM isletme_bildirimleri')).rows;
  assert.equal(bil.length, 1);
  assert.equal(bil[0].isletme_id, 1);
  assert.match(bil[0].mesaj, /Ayşe/);

  await db.query(`INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, istenen_tarih, durum) VALUES
    ('905550000001', 1, $1, 'bekliyor'), ('905550000002', 1, $2, 'randevu_alindi'), ('905550000003', 2, $2, 'bekliyor')`,
    [gunSonraTarih(-1), gunSonraTarih(2)]);
  const getir = async () => { const r = cevap(); await a.beklemeListesiGetir({ kullanici: { isletme_id: 1 } }, r); return r.veri.bekleme_listesi; };
  let liste = await getir();
  assert.deepEqual(liste.map(x => x.musteri_telefon), ['905551112233'], 'geçmiş gün, alınmış randevu ve başka dükkân görünmez');
  assert.equal(liste[0].hizmet_isim, 'Taş Masajı + Jakuzi');

  let r = cevap(); await a.beklemeListesiSil({ params: { id: liste[0].id }, kullanici: { isletme_id: 2 } }, r);
  assert.equal(r.kod, 404, 'başka dükkânın kaydı silinemez');
  r = cevap(); await a.beklemeListesiSil({ params: { id: liste[0].id }, kullanici: { isletme_id: 1 } }, r);
  assert.equal(r.veri.ok, true);
  assert.equal((await getir()).length, 0);
});
