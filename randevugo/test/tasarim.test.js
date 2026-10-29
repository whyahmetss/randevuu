// Randevu sayfası tasarımları (2026-10-29): süper admin ekler/hediye eder, esnaf yalnız sahip olduğu ya da ücretsiz tasarımı seçer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200, basliklar: {} }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; };
  r.set = (k, v) => { r.basliklar[k] = v; return r; }; r.send = (b) => { r.govde = b; return r; }; r.end = () => r; return r; };

test('tasarım: ekle, medya, hediye, sahip olmayana kapalı, byte-range', async () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, sayfa_guncelleme TIMESTAMPTZ);
    INSERT INTO isletmeler (isim) VALUES ('Blanco'), ('Başka');
    ${fs.readFileSync(path.join(SRC, 'migrations', '076_sayfa_tasarimlari.sql'), 'utf8')}`);
  const y = require.resolve(path.join(SRC, 'services', 'socketServer'));
  require.cache[y] = { id: y, filename: y, loaded: true, exports: { emitToIsletme() {} } };
  const t = require(path.join(SRC, 'controllers', 'tasarimController'));
  const sa = { kullanici: { rol: 'superadmin' } };

  // Stil yalnız izinli seçenekler; serbest CSS/renk sızmaz
  assert.deepEqual(t.stilTemizle({ mod: 'koyu', vurgu: '#FFAA00', karartma: 2, yazi: 'comic', buton: 'yirtik', kart: 'x', css: 'body{}' }),
    { mod: 'koyu', vurgu: '#ffaa00', karartma: 0.85, yazi: 'sans', buton: 'yirtik', kart: 'cam' });

  let r = cevap(); await t.kaydet({ ...sa, params: {}, body: { isim: 'Gece Berber', fiyat: 499, stil: { mod: 'koyu', yazi: 'serif', buton: 'yirtik' } } }, r);
  const id = r.veri.id;
  r = cevap(); await t.kaydet({ ...sa, params: {}, body: { isim: 'Sade Ücretsiz', fiyat: 0 } }, r);
  const ucretsiz = r.veri.id;

  const video = Buffer.from('0123456789abcdef');
  r = cevap(); await t.medyaYukle({ ...sa, params: { id, tur: 'arka' }, body: { veri: 'data:video/mp4;base64,' + video.toString('base64') } }, r);
  assert.equal(r.veri.ok, true);
  r = cevap(); await t.medyaYukle({ ...sa, params: { id, tur: 'arka' }, body: { veri: 'data:text/html;base64,PGh0bWw+' } }, r);
  assert.equal(r.kod, 400, 'video/görsel dışı reddedilir');
  r = cevap(); await t.medyaYukle({ ...sa, params: { id, tur: 'poster' }, body: { veri: 'data:video/mp4;base64,AAAA' } }, r);
  assert.equal(r.kod, 400, 'poster video olamaz');

  // Ücretli tasarım: sahip olmayan seçemez, sayfada da açılmaz
  const esnaf = (isletme_id) => ({ kullanici: { isletme_id } });
  r = cevap(); await t.esnafSec({ ...esnaf(1), body: { tasarim_id: id } }, r);
  assert.equal(r.kod, 403);
  await db.query('UPDATE isletmeler SET sayfa_tasarim_id = $1 WHERE id = 1', [id]);
  assert.equal(await t.sayfaTasarimi(1), null, 'elle bağlansa da sahip değilse sayfada yok');

  // Hediye + uygula → sayfada açılır; liste sahipleri gösterir
  r = cevap(); await t.hediye({ ...sa, params: { id }, body: { isletme_id: 1, uygula: true } }, r);
  assert.match(r.veri.mesaj, /Blanco.*sayfasında açıldı/);
  const st = await t.sayfaTasarimi(1);
  assert.equal(st.id, id);
  assert.deepEqual([st.stil.yazi, st.stil.buton], ['serif', 'yirtik']);
  assert.equal(st.medya.arka.mime, 'video/mp4');
  r = cevap(); await t.liste(sa, r);
  assert.deepEqual(r.veri.tasarimlar.find(x => x.id === id).sahipler.map(s => [s.isim, s.kullaniyor]), [['Blanco', true]]);

  // Esnaf listesi: ücretsiz herkesin, ücretli yalnız sahibin
  r = cevap(); await t.esnafListe(esnaf(2), r);
  assert.deepEqual(r.veri.tasarimlar.map(x => [x.id, x.sahip]), [[id, false], [ucretsiz, true]]);
  r = cevap(); await t.esnafSec({ ...esnaf(2), body: { tasarim_id: ucretsiz } }, r);
  assert.equal(r.veri.ok, true);

  // Medya: tam ve aralıklı (Safari video için Range ister)
  r = cevap(); await t.medya({ params: { id, tur: 'arka' }, headers: {} }, r);
  assert.equal(r.basliklar['Content-Type'], 'video/mp4');
  assert.match(r.basliklar['Cache-Control'], /immutable/);
  assert.equal(Buffer.compare(r.govde, video), 0);
  r = cevap(); await t.medya({ params: { id, tur: 'arka' }, headers: { range: 'bytes=4-7' } }, r);
  assert.equal(r.kod, 206);
  assert.equal(r.basliklar['Content-Range'], 'bytes 4-7/16');
  assert.equal(r.govde.toString(), '4567');
  r = cevap(); await t.medya({ params: { id, tur: 'arka' }, headers: { range: 'bytes=99-' } }, r);
  assert.equal(r.kod, 416);

  // Pasif tasarım sayfada açılmaz; silinince kullananın sayfası düz görünüme döner
  await db.query('UPDATE sayfa_tasarimlari SET aktif = false WHERE id = $1', [id]);
  assert.equal(await t.sayfaTasarimi(1), null);
  r = cevap(); await t.sil({ ...sa, params: { id } }, r);
  assert.equal((await db.query('SELECT sayfa_tasarim_id FROM isletmeler WHERE id = 1')).rows[0].sayfa_tasarim_id, null);
  r = cevap(); await t.medya({ params: { id, tur: 'arka' }, headers: {} }, r);
  assert.equal(r.kod, 404, 'silinen tasarımın medyası önbellekten de gider');
});
