// Grup kurma tek parça (rapor doğrulaması, 2026-10-26): dört ayrı yazımdı; araya hata girerse grup açılmış ama işletme
// bağlanmamış ya da rol değişmemiş kalıyordu. Artık ya hepsi ya hiçbiri; işletme zaten gruptaysa ikinci grup açılmaz.
const test = require('node:test');
const assert = require('node:assert');
const { hazirla, SRC } = require('./yardimci');

const SEMA = `
  CREATE TABLE sube_gruplari (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT UNIQUE, sahip_kullanici_id INT, logo TEXT, tanitim TEXT, renk_tema TEXT);
  CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, grup_id INT, sube_etiketi TEXT);
  CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, rol TEXT, grup_id INT, isletme_id INT);
  CREATE TABLE randevular (id SERIAL PRIMARY KEY, musteri_id INT, isletme_id INT);
  INSERT INTO isletmeler (isim) VALUES ('Berber');
  INSERT INTO admin_kullanicilar (rol, isletme_id) VALUES ('admin', 1);`;

async function kur(db) {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const c = require(SRC + '/controllers/grupController');
  let durum = 200, govde;
  await c.grupKur({ body: { isim: 'Zincir' }, kullanici: { id: 1, isletme_id: 1 } }, { status(k) { durum = k; return this; }, json(g) { govde = g; } });
  return { durum, govde };
}

test('grup kurulur: işletme bağlanır, kullanıcı grup sahibi olur, müşteriler gruba geçer', async () => {
  const { db } = await hazirla(SEMA + `CREATE TABLE musteriler (id SERIAL PRIMARY KEY, grup_id INT, son_gelinen_isletme_id INT);
    INSERT INTO musteriler (son_gelinen_isletme_id) VALUES (1);`);
  const { durum, govde } = await kur(db);
  assert.equal(durum, 200);
  assert.equal((await db.query('SELECT grup_id FROM isletmeler WHERE id = 1')).rows[0].grup_id, govde.grup.id);
  assert.equal((await db.query('SELECT rol FROM admin_kullanicilar WHERE id = 1')).rows[0].rol, 'grup_sahibi');
  assert.equal((await db.query('SELECT grup_id FROM musteriler WHERE id = 1')).rows[0].grup_id, govde.grup.id);
  assert.equal((await kur(db)).durum, 400, 'ikinci kez kurulamaz');
});

test('son adım hata verirse hiçbir şey yazılmaz', async () => {
  const { db } = await hazirla(SEMA); // musteriler tablosu yok: müşteri güncellemesi patlar
  const { durum } = await kur(db);
  assert.equal(durum, 500);
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM sube_gruplari')).rows[0].n, 0, 'yarım grup kalmaz');
  assert.equal((await db.query('SELECT grup_id FROM isletmeler WHERE id = 1')).rows[0].grup_id, null);
  assert.equal((await db.query('SELECT rol FROM admin_kullanicilar WHERE id = 1')).rows[0].rol, 'admin');
});
