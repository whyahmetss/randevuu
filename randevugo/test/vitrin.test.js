// SıraGO Vitrini: kurucu ilan verir → esnaf görür → sipariş verir → teslimde stok düşer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; };
  r.set = () => r; r.send = (b) => { r.govde = b; return r; }; r.end = () => r; return r; };

test('vitrin: ilan, görsel, sipariş, stok', async () => {
  const sema = "CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT); INSERT INTO isletmeler (isim, telefon) VALUES ('Kemal Berber', '05001112233');" +
    'CREATE TABLE randevular (id SERIAL PRIMARY KEY);' + fs.readFileSync(path.join(SRC, 'migrations', '019_magaza.sql'), 'utf8') + ';' +
    fs.readFileSync(path.join(SRC, 'migrations', '031_vitrin.sql'), 'utf8');
  const { db } = await hazirla(sema);
  const alarmYolu = require.resolve(path.join(SRC, 'utils', 'alarm'));
  const alarmlar = [];
  require.cache[alarmYolu] = { id: alarmYolu, filename: alarmYolu, loaded: true, exports: { alarm: async (k, d) => alarmlar.push(k + d) } };
  const v = require(path.join(SRC, 'controllers', 'vitrinController'));

  const png = 'data:image/png;base64,' + Buffer.from('resim').toString('base64');
  let r = cevap(); await v.ilanKaydet({ body: { isim: 'Tablet + stant', fiyat: '2500', eski_fiyat: '3000', stok: '2', gorsel: png }, params: {} }, r);
  assert.equal(r.kod, 200, JSON.stringify(r.veri));
  const ilan = r.veri.ilan;
  assert.match(ilan.gorsel, /\/api\/magaza\/gorsel\/\d+\?v=/);

  r = cevap(); await v.ilanKaydet({ body: { isim: 'x', odeme_linki: 'javascript:alert(1)' }, params: {} }, r);
  assert.equal(r.kod, 400);

  r = cevap(); await v.gorsel({ params: { id: ilan.id } }, r);
  assert.equal(String(r.govde), 'resim');

  const esnaf = { kullanici: { isletme_id: 1 } };
  r = cevap(); await v.vitrin(esnaf, r);
  assert.equal(r.veri.urunler.length, 1);
  assert.equal(r.veri.urunler[0].gorsel_veri, undefined, 'ham görsel listeye gitmemeli');

  r = cevap(); await v.siparis({ ...esnaf, body: { urun_id: ilan.id, adet: 3 } }, r);
  assert.equal(r.kod, 400, 'stoktan fazla');
  r = cevap(); await v.siparis({ ...esnaf, body: { urun_id: ilan.id, adet: 2, notu: 'siyah' } }, r);
  assert.equal(Number(r.veri.siparis.tutar), 5000);
  assert.equal(alarmlar.length, 1);
  const sipId = r.veri.siparis.id;

  r = cevap(); await v.siparisDurum({ params: { id: sipId }, body: { durum: 'teslim' } }, r);
  assert.equal((await db.query('SELECT stok FROM magaza_urunler WHERE id = $1', [ilan.id])).rows[0].stok, 0);

  // Düzenlemede görsel gönderilmezse eskisi kalır; yayından kaldırılınca vitrinden düşer
  r = cevap(); await v.ilanKaydet({ body: { isim: 'Tablet + stant', aktif: false }, params: { id: ilan.id } }, r);
  assert.ok(r.veri.ilan.gorsel);
  r = cevap(); await v.vitrin(esnaf, r);
  assert.equal(r.veri.urunler.length, 0);
});
