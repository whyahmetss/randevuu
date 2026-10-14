// Randevu sayfası görünümü: tema/renk doğrulama, kapak-logo ayrı tabloda, görsel servisi, silme, işletmeyle birlikte silinme.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200, basliklar: {} }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; };
  r.set = (k, v) => { r.basliklar[k] = v; return r; }; r.send = (b) => { r.govde = b; return r; }; r.end = () => r; return r; };

test('randevu sayfası: tema, renk, kapak, logo, tanıtım', async () => {
  const { db } = await hazirla(`CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, aktif BOOLEAN DEFAULT true);
    INSERT INTO isletmeler (isim, slug) VALUES ('Kemal', 'kemal');
    ${fs.readFileSync(path.join(SRC, 'migrations', '038_randevu_sayfasi.sql'), 'utf8')}`);
  const s = require(path.join(SRC, 'controllers', 'sayfaController'));
  const req = (body) => ({ kullanici: { isletme_id: 1 }, body });

  let r = cevap(); await s.kaydet(req({ tema: 'mor-pembe' }), r); assert.equal(r.kod, 400);
  r = cevap(); await s.kaydet(req({ vurgu: '#123456' }), r); assert.equal(r.kod, 400, 'serbest renk yok');
  const png = 'data:image/png;base64,' + Buffer.from('kapak').toString('base64');
  r = cevap(); await s.kaydet(req({ tema: 'klasik', vurgu: '#c9973f', tanitim: '  2015ten beri  ', kapak: png }), r);
  assert.deepEqual([r.veri.tema, r.veri.vurgu, r.veri.tanitim, r.veri.kapak, r.veri.logo], ['klasik', '#c9973f', '2015ten beri', true, false]);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM isletme_gorselleri")).rows[0].n, 1, 'görsel ayrı tabloda');

  r = cevap(); await s.gorsel({ params: { slug: 'kemal', tur: 'kapak' } }, r);
  assert.equal(String(r.govde), 'kapak'); assert.equal(r.basliklar['Content-Type'], 'image/png');
  r = cevap(); await s.gorsel({ params: { slug: 'kemal', tur: 'sifre' } }, r); assert.equal(r.govde, undefined);

  r = cevap(); await s.kaydet(req({ kapak: null }), r); assert.equal(r.veri.kapak, false);
  r = cevap(); await s.kaydet(req({ logo: 'data:text/html;base64,PHNjcmlwdD4=' }), r); assert.equal(r.kod, 400, 'görsel olmayan reddedilir');

  await s.kaydet(req({ logo: png }), cevap());
  await db.query('DELETE FROM isletmeler WHERE id = 1');
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM isletme_gorselleri")).rows[0].n, 0, 'işletmeyle silinir');
});
