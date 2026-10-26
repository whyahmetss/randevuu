// Yeni şube merkezden kopyalanır (2026-10-26): hizmetler + ayarlar her zaman, çalışanlar istenirse; hata olursa yarım şube kalmaz.
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

const SEMA = `
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, telefon TEXT, sehir TEXT, ilce TEXT, adres TEXT,
    kategori TEXT, aktif BOOLEAN DEFAULT true, paket TEXT, grup_id INT, sube_etiketi TEXT, paket_bitis_tarihi TIMESTAMP,
    deneme_bitis_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP, calisma_baslangic TIME DEFAULT '09:00',
    calisma_bitis TIME DEFAULT '19:00', kapali_gunler TEXT DEFAULT '0', mola_saatleri JSONB DEFAULT '[]', whatsapp_no TEXT);
  CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, aktif BOOLEAN DEFAULT true);
  CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, telefon TEXT, mola_saatleri JSONB DEFAULT '[]', aktif BOOLEAN DEFAULT true);
  CREATE TABLE calisan_hizmetler (id SERIAL PRIMARY KEY, calisan_id INT, hizmet_id INT, UNIQUE(calisan_id, hizmet_id));
  CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT UNIQUE, sifre TEXT, rol TEXT, isletme_id INT, grup_id INT, aktif BOOLEAN);
  INSERT INTO isletmeler (isim, kategori, paket, grup_id, calisma_baslangic, calisma_bitis, kapali_gunler, mola_saatleri, whatsapp_no)
    VALUES ('Merkez Spa', 'masaj', 'proplus', 1, '10:00', '22:00', '1', '[{"bas":"13:00","bit":"14:00"}]', '905551112233');
  INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES (1, 'Thai Masajı', 60, 1500, true), (1, 'Eski', 30, 100, false);
  INSERT INTO calisanlar (isletme_id, isim, telefon) VALUES (1, 'Ayşe', '905550000000');
  INSERT INTO calisan_hizmetler (calisan_id, hizmet_id) VALUES (1, 1);
  INSERT INTO admin_kullanicilar (email, rol) VALUES ('var@x.com', 'admin');`;

async function ekle(body) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const c = require(SRC + '/controllers/grupController');
  let durum = 200, govde;
  await c.subeEkle({ body, kullanici: { grup_id: 1 } }, { status(k) { durum = k; return this; }, json(g) { govde = g; } });
  return { durum, govde };
}

test('şube merkezden kopyalanır: ayarlar + aktif hizmetler, çalışan istenmezse gelmez', async () => {
  const { db } = await hazirla(SEMA);
  const { durum, govde } = await ekle({ isim: 'Kadıköy' });
  assert.equal(durum, 200, JSON.stringify(govde));
  assert.deepEqual(govde.kopya, { ayar: true, hizmet: 1, calisan: 0 });
  const s = (await db.query('SELECT * FROM isletmeler WHERE id = $1', [govde.sube.id])).rows[0];
  assert.equal(s.kategori, 'masaj');
  assert.equal(s.calisma_bitis, '22:00:00');
  assert.equal(s.kapali_gunler, '1');
  assert.deepEqual(s.mola_saatleri, [{ bas: '13:00', bit: '14:00' }]);
  assert.equal(s.whatsapp_no, null, 'WhatsApp numarası kopyalanmaz');
  const h = (await db.query('SELECT isim, fiyat FROM hizmetler WHERE isletme_id = $1', [s.id])).rows;
  assert.deepEqual(h.map(x => x.isim), ['Thai Masajı'], 'pasif hizmet gelmez');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM calisanlar WHERE isletme_id = $1', [s.id])).rows[0].n, 0);
});

test('çalışan kopyası istenirse çalışan + hizmet eşleşmesi gelir, telefon gelmez', async () => {
  const { db } = await hazirla(SEMA);
  const { govde } = await ekle({ isim: 'Moda', kopyala_calisan: true });
  assert.deepEqual(govde.kopya, { ayar: true, hizmet: 1, calisan: 1 });
  const c = (await db.query('SELECT * FROM calisanlar WHERE isletme_id = $1', [govde.sube.id])).rows[0];
  assert.equal(c.isim, 'Ayşe');
  assert.equal(c.telefon, null);
  const ch = (await db.query(`SELECT h.isim FROM calisan_hizmetler ch JOIN hizmetler h ON h.id = ch.hizmet_id WHERE ch.calisan_id = $1`, [c.id])).rows;
  assert.deepEqual(ch.map(x => x.isim), ['Thai Masajı']);
});

test('hizmet kopyası kapatılabilir; kayıtlı müdür e-postası şube açmadan reddedilir', async () => {
  const { db } = await hazirla(SEMA);
  const { govde } = await ekle({ isim: 'Boş', kopyala_hizmet: false });
  assert.equal(govde.kopya.hizmet, 0);
  const once = (await db.query('SELECT COUNT(*)::int n FROM isletmeler')).rows[0].n;
  const r = await ekle({ isim: 'X', mudur_email: 'var@x.com', mudur_sifre: '123456' });
  assert.equal(r.durum, 400);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM isletmeler')).rows[0].n, once, 'yarım şube kalmaz');
});
