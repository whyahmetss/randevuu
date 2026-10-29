// Elden ödeme (2026-10-29): sahada nakit alınan ödeme tek adımda; ücretli dönem deneme bitince başlar.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

test('elden ödeme: deneme günleri yanmaz, kayıt nakit/ödendi, şube ve geçersiz paket reddedilir', async () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, grup_id INT, paket TEXT, aktif BOOLEAN, deneme_bitis_tarihi TIMESTAMP,
      paket_bitis_tarihi TIMESTAMP, son_odeme_sure TEXT, bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT, bekleyen_sure TEXT, bekleyen_kupon_id INT);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem VARCHAR(7), durum VARCHAR(30), odeme_yontemi VARCHAR(30),
      odeme_tarihi TIMESTAMP, notlar TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE UNIQUE INDEX odemeler_donem ON odemeler (isletme_id, donem) WHERE isletme_id IS NOT NULL;
    INSERT INTO isletmeler (isim, paket, aktif, deneme_bitis_tarihi) VALUES ('Blanco', 'baslangic', true, NOW() + INTERVAL '10 days');
    INSERT INTO isletmeler (isim, paket, aktif, grup_id, deneme_bitis_tarihi) VALUES ('Merkez', 'proplus', true, 7, NOW()), ('Şube', 'proplus', true, 7, NOW());`);
  const bildirim = [];
  sahte('services/socketServer', { emitToIsletme() {}, emitToAdmin() {} });
  sahte('services/odemeOtomasyon', { odemeAlindiBildir: (id, tutar, yontem) => bildirim.push([id, tutar, yontem]) });
  sahte('utils/oncu', { oncuOdeme: async () => null });
  const a = require(path.join(SRC, 'controllers', 'adminController'));
  const ode = async (body) => { const r = cevap(); await a.eldenOdeme({ body, kullanici: { email: 'admin@x' }, headers: {}, socket: {} }, r); return r; };

  let r = await ode({ isletme_id: 1, paket: 'profesyonel', ay: 1, tutar: 499, not: 'dükkânda' });
  assert.equal(r.kod, 200, JSON.stringify(r.veri));
  const i = (await db.query(`SELECT paket, son_odeme_sure, aktif,
      EXTRACT(EPOCH FROM (paket_bitis_tarihi - (deneme_bitis_tarihi + INTERVAL '1 month')))::int AS fark FROM isletmeler WHERE id = 1`)).rows[0];
  assert.equal(i.paket, 'profesyonel');
  assert.equal(i.son_odeme_sure, 'ay');
  assert.strictEqual(i.fark, 0, 'ücretli dönem deneme bitince başlar (10 gün deneme yanmaz)');
  const o = (await db.query('SELECT * FROM odemeler WHERE isletme_id = 1')).rows;
  assert.equal(o.length, 1);
  assert.deepEqual([o[0].durum, o[0].odeme_yontemi, Number(o[0].tutar)], ['odendi', 'nakit', 499]);
  assert.match(o[0].notlar, /1 ay Standart · dükkânda/);
  assert.deepEqual(bildirim[0], [1, 499, 'elden'], 'esnafa "ödemeniz alındı" gider');

  // Yıllık: ilk ödemenin bitişinden devam eder, yıllık işaretlenir
  r = await ode({ isletme_id: 1, paket: 'profesyonel', ay: 12, tutar: 4491, yontem: 'havale' });
  assert.equal(r.kod, 200, JSON.stringify(r.veri));
  assert.equal((await db.query('SELECT son_odeme_sure FROM isletmeler WHERE id = 1')).rows[0].son_odeme_sure, 'yil');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM odemeler WHERE isletme_id = 1')).rows[0].n, 2, 'ikinci ödeme ayrı dönem');

  assert.equal((await ode({ isletme_id: 3, paket: 'proplus', ay: 1, tutar: 1499 })).kod, 400, 'şube ödemesi merkeze girilir');
  assert.equal((await ode({ isletme_id: 2, paket: 'yok', ay: 1, tutar: 10 })).kod, 400, 'geçersiz paket');
  assert.equal((await ode({ isletme_id: 2, paket: 'proplus', ay: 0, tutar: 10 })).kod, 400, 'süre 1–24 ay');
});
