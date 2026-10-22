// E-posta doğrulama (2026-10-22): web kaydı e-postaya giden 6 haneli kod doğrulanmadan tamamlanmaz (Resend).
// Mail servisi ayarlı değilse kayıt eskisi gibi kodsuz; Google kaydında e-postayı Google doğrular.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

async function ortam() {
  // Önceki testin veritabanını tutan modüller atılır
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, kategori TEXT, aktif BOOLEAN, paket TEXT,
      olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, kayit_kanali TEXT);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN,
      grup_id INT, ekip_gorev TEXT, ekip_yetkileri JSONB, patron BOOLEAN, son_giris TIMESTAMP, sartlar_onay_tarihi TIMESTAMP);
    ${fs.readFileSync(path.join(SRC, 'migrations', '068_eposta_dogrulama.sql'), 'utf8')}`);
  sahte('services/socketServer', { emitToAdmin() {} });
  sahte('services/pushService', { sendToAdmin() {} });
  sahte('utils/davet', { kodGecerli: async () => true, davetUygula: async () => null, KANALLAR: ['web'] });
  return { db, a: require(path.join(SRC, 'controllers', 'authController')) };
}
const kayit = (ek = {}) => ({ body: { isletmeAdi: 'Elit Barber', email: 'Tayfun@Ornek.com', sifre: 'gizlisifre1', ...ek } });

test('e-posta doğrulama: kod olmadan / yanlış kodla hesap açılmaz, doğru kodla açılır', async (t) => {
  const { db, a } = await ortam();
  const gidenler = [];
  const eskiFetch = global.fetch;
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, o) => { gidenler.push({ url, govde: JSON.parse(o.body) }); return { ok: true, json: async () => ({ id: 'x' }) }; };
  t.after(() => { global.fetch = eskiFetch; delete process.env.RESEND_API_KEY; });

  let r = cevap(); await a.ayar({}, r);
  assert.equal(r.veri.eposta_dogrulama, true);

  r = cevap(); await a.botKayit(kayit(), r);
  assert.equal(r.kod, 400); assert.equal(r.veri.kod_gerekli, true);
  r = cevap(); await a.botKayit(kayit({ _epostaDogru: true }), r);
  assert.equal(r.kod, 400, 'gövdeden doğrulandı denilemez');

  r = cevap(); await a.kayitKod({ body: { email: 'Tayfun@Ornek.com' } }, r);
  assert.equal(r.kod, 200, JSON.stringify(r.veri));
  assert.equal(gidenler.length, 1);
  assert.equal(gidenler[0].url, 'https://api.resend.com/emails');
  assert.deepEqual(gidenler[0].govde.to, ['Tayfun@Ornek.com']);
  const kod = gidenler[0].govde.text.match(/\b(\d{6})\b/)[1];

  r = cevap(); await a.kayitKod({ body: { email: 'tayfun@ornek.com' } }, r);
  assert.equal(r.kod, 429, 'dakikada bir kod');

  r = cevap(); await a.botKayit(kayit({ eposta_kod: kod === '000000' ? '111111' : '000000' }), r);
  assert.equal(r.veri.hata, 'Doğrulama kodu yanlış');
  r = cevap(); await a.botKayit(kayit({ eposta_kod: kod }), r);
  assert.equal(r.veri.basarili, true, JSON.stringify(r.veri));
  assert.equal((await db.query('SELECT eposta_dogrulandi FROM admin_kullanicilar')).rows[0].eposta_dogrulandi, true);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM eposta_dogrulama')).rows[0].n, 0, 'kod tek kullanımlık');

  r = cevap(); await a.kayitKod({ body: { email: 'tayfun@ornek.com' } }, r);
  assert.match(r.veri.hata, /zaten kayıtlı/);
});

test('e-posta doğrulama: 5 yanlış denemede kod geçersiz; mail gidemezse kod saklanmaz', async (t) => {
  const { db, a } = await ortam();
  let giden = null, basarili = true;
  const eskiFetch = global.fetch;
  process.env.RESEND_API_KEY = 're_test';
  global.fetch = async (url, o) => { giden = JSON.parse(o.body); return basarili ? { ok: true, json: async () => ({}) } : { ok: false, status: 422, json: async () => ({ message: 'invalid' }) }; };
  t.after(() => { global.fetch = eskiFetch; delete process.env.RESEND_API_KEY; });

  basarili = false;
  let r = cevap(); await a.kayitKod({ body: { email: 'yok@ornek.com' } }, r);
  assert.equal(r.kod, 502);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM eposta_dogrulama')).rows[0].n, 0);

  basarili = true;
  r = cevap(); await a.kayitKod({ body: { email: 'ali@ornek.com' } }, r);
  const kod = giden.text.match(/\b(\d{6})\b/)[1];
  for (let i = 0; i < 5; i++) { r = cevap(); await a.botKayit(kayit({ email: 'ali@ornek.com', eposta_kod: kod === '000000' ? '111111' : '000000' }), r); }
  r = cevap(); await a.botKayit(kayit({ email: 'ali@ornek.com', eposta_kod: kod }), r);
  assert.match(r.veri.hata, /süresi doldu/);
});

test('e-posta doğrulama: mail servisi yoksa kodsuz kayıt; Google kaydı doğrulanmış sayılır', async () => {
  delete process.env.RESEND_API_KEY;
  const { db, a } = await ortam();
  let r = cevap(); await a.kayitKod({ body: { email: 'veli@ornek.com' } }, r);
  assert.equal(r.veri.gerekli, false);
  r = cevap(); await a.botKayit(kayit({ email: 'veli@ornek.com' }), r);
  assert.equal(r.veri.basarili, true);
  assert.equal((await db.query("SELECT eposta_dogrulandi FROM admin_kullanicilar WHERE email = 'veli@ornek.com'")).rows[0].eposta_dogrulandi, false);

  process.env.RESEND_API_KEY = 're_test';
  try {
    r = cevap(); await a.botKayit({ _epostaDogru: true, body: kayit({ email: 'google@ornek.com' }).body }, r);
    assert.equal(r.veri.basarili, true);
    assert.equal((await db.query("SELECT eposta_dogrulandi FROM admin_kullanicilar WHERE email = 'google@ornek.com'")).rows[0].eposta_dogrulandi, true);
  } finally { delete process.env.RESEND_API_KEY; }
});
