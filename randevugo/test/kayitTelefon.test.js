// Web kaydı "Bir sorun oluştu" (2026-10-27): isletmeler.telefon UNIQUE NOT NULL kalmıştı; telefonsuz ikinci kayıt 500 veriyordu.
// Kod da işletme açılmadan harcanıyordu: tekrar denemede "süresi doldu". Artık kısıt kalkar, kod ancak başarıda harcanır.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

test('kayıt: telefonsuz ikinci işletme açılır; hata olursa doğrulama kodu harcanmaz', async (t) => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon VARCHAR(20) NOT NULL UNIQUE, kategori TEXT, aktif BOOLEAN, paket TEXT,
      olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, kayit_kanali TEXT);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN,
      grup_id INT, son_giris TIMESTAMP, sartlar_onay_tarihi TIMESTAMP);
    ${fs.readFileSync(path.join(SRC, 'migrations', '068_eposta_dogrulama.sql'), 'utf8')}
    ${fs.readFileSync(path.join(SRC, 'migrations', '072_eposta_onceki_kod.sql'), 'utf8')}
    INSERT INTO isletmeler (isim, telefon) VALUES ('Önceki web kaydı', '');`);
  sahte('services/socketServer', { emitToAdmin() {} });
  sahte('services/pushService', { sendToAdmin() {} });
  sahte('utils/davet', { kodGecerli: async () => true, davetUygula: async () => null, KANALLAR: ['web'] });
  const a = require(path.join(SRC, 'controllers', 'authController'));
  let giden;
  const eskiFetch = global.fetch;
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, o) => { giden = JSON.parse(o.body); return { ok: true, json: async () => ({}) }; };
  t.after(() => { global.fetch = eskiFetch; delete process.env.RESEND_API_KEY; });

  let r = cevap(); await a.kayitKod({ body: { email: 'emir@ornek.com' } }, r);
  const kod = giden.text.match(/(\d{3}) (\d{3})/).slice(1).join('');
  const kayit = () => ({ body: { isletmeAdi: 'Turkuas', email: 'emir@ornek.com', sifre: 'gizlisifre1', eposta_kod: kod } });

  r = cevap(); await a.botKayit(kayit(), r);
  assert.equal(r.kod, 500, 'eski şemada telefonsuz ikinci kayıt patlar');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM eposta_dogrulama')).rows[0].n, 1, 'kod harcanmadı');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM admin_kullanicilar')).rows[0].n, 0, 'yarım kayıt kalmaz');

  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '074_isletme_telefon_serbest.sql'), 'utf8'));
  r = cevap(); await a.botKayit(kayit(), r);
  assert.equal(r.veri.basarili, true, JSON.stringify(r.veri));
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM eposta_dogrulama')).rows[0].n, 0, 'başarıda kod harcanır');
  await db.exec(fs.readFileSync(path.join(SRC, 'migrations', '074_isletme_telefon_serbest.sql'), 'utf8'));   // tekrar çalışsa da sorun yok
});
