// Geçici şifre girişi (2026-10-27): WhatsApp'tan kopyalanınca *yıldız*/boşluk geliyor, "göster" açıkken ilk harf büyüyor;
// aynı e-postalı ikinci hesap varsa yalnız ilkine bakılıyordu. Hepsi "Email veya şifre hatalı" diyordu.
const test = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcryptjs');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };

test('geçici şifre: yıldız, boşluk, büyük harf, uzun tire tolere edilir; normal şifrede edilmez', async () => {
  const { db } = await hazirla(`
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN,
      sifre_degistirmeli BOOLEAN DEFAULT false, grup_id INT);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, son_giris TIMESTAMP, son_panel TIMESTAMP);`);
  await db.query(`INSERT INTO admin_kullanicilar (email, sifre, rol, isletme_id, aktif, sifre_degistirmeli) VALUES
    ('Esnaf@ornek.com', $1, 'personel', 9, true, false),
    ('esnaf@ornek.com', $2, 'admin', 1, true, true),
    ('normal@ornek.com', $3, 'admin', 2, true, false)`,
    [await bcrypt.hash('baskasifre', 4), await bcrypt.hash('kmtr-4829', 4), await bcrypt.hash('Gizli-1234', 4)]);
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const a = require(SRC + '/controllers/authController');
  const gir = async (email, sifre) => { const r = cevap(); await a.giris({ body: { email, sifre }, headers: {}, socket: {} }, r); return r; };

  for (const yazilan of ['kmtr-4829', '*kmtr-4829*', ' Kmtr-4829 ', 'KMTR–4829']) {
    const r = await gir('esnaf@ornek.com', yazilan);
    assert.equal(r.kod, 200, `${yazilan}: ${JSON.stringify(r.veri)}`);
    assert.equal(r.veri.kullanici.id, 2, 'şifresi tutan hesap açılır');
    assert.equal(r.veri.kullanici.sifre_degistirmeli, true);
  }
  assert.equal((await gir('esnaf@ornek.com', 'kmtr-4820')).kod, 401);
  assert.equal((await gir('Esnaf@ornek.com', 'baskasifre')).veri.kullanici.id, 1);
  assert.equal((await gir('normal@ornek.com', 'Gizli-1234')).kod, 200);
  assert.equal((await gir('normal@ornek.com', 'gizli-1234')).kod, 401, 'normal şifre büyük/küçük harfe duyarlı kalır');
});
