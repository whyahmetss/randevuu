// Tasarım satışı (Faz 3, 2026-10-29): Shopier tek seferlik ödeme → tasarım işletmenin olur, sayfada açılır.
// Tasarım siparişi paket ödemesi sayılıp süre uzatmamalı (başlıkta SRGO-T<no>, paket eşleşmesinden önce yakalanır).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

test('tasarım satışı: başlat, Shopier siparişi tasarımı verir, paket süresi uzamaz, iki kez işlenmez', async () => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, demo BOOLEAN, sayfa_guncelleme TIMESTAMPTZ, paket_bitis_tarihi TIMESTAMP,
      bekleyen_paket TEXT, bekleyen_shopier_urun_id TEXT, bekleyen_sure TEXT, bekleyen_kupon_id INT);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, tutar NUMERIC, donem TEXT, durum TEXT, odeme_yontemi TEXT, odeme_tarihi TIMESTAMP,
      shopier_siparis_id TEXT, shopier_urun_id TEXT);
    CREATE TABLE shopier_islenen_siparisler (siparis_id TEXT PRIMARY KEY);
    INSERT INTO isletmeler (isim, paket_bitis_tarihi) VALUES ('Blanco', '2026-12-01'), ('Başka', NULL);
    ${fs.readFileSync(path.join(SRC, 'migrations', '076_sayfa_tasarimlari.sql'), 'utf8')}
    INSERT INTO sayfa_tasarimlari (isim, fiyat, stil) VALUES ('Gece', 499, '{}'), ('Ücretsiz', 0, '{}');`);
  sahte('services/socketServer', { emitToIsletme() {}, emitToAdmin() {} });
  sahte('services/pushService', { sendToAdmin() {}, sendToIsletme() {} });
  sahte('utils/alarm', { alarm: async () => {} });
  const shopier = require(path.join(SRC, 'services', 'shopierService'));
  const olusan = [], silinen = [];
  shopier.urunOlustur = async (u) => { olusan.push(u); return { id: 9000 + olusan.length, url: `https://shopier.com/${9000 + olusan.length}` }; };
  shopier.urunSil = async (id) => { silinen.push(String(id)); };
  const t = require(path.join(SRC, 'controllers', 'tasarimController'));
  const al = async (isletme_id, id) => { const r = cevap(); await t.satinAl({ kullanici: { isletme_id }, params: { id } }, r); return r; };

  assert.equal((await al(1, 2)).kod, 400, 'ücretsiz tasarım satın alınmaz');
  let r = await al(1, 1);
  assert.equal(r.veri.url, 'https://shopier.com/9001');
  assert.match(olusan[0].baslik, /\[SRGO-T\d+\]$/);
  assert.doesNotMatch(olusan[0].baslik, /SRGO-\d/, 'paket referansı biçimi kullanılmaz');
  assert.equal(olusan[0].fiyat, 499);
  r = await al(1, 1);   // vazgeçip tekrar basıldı
  assert.deepEqual(silinen, ['9001'], 'yarım kalan ilk ürün Shopier\'den silinir');
  const satis = (await db.query("SELECT * FROM tasarim_satislari WHERE durum = 'bekliyor'")).rows;
  assert.equal(satis.length, 1);

  // Shopier siparişi: ürün kimliğiyle eşleşir; not alanına SRGO-1 yazılmış olsa da paket ödemesi sayılmaz
  const sonuc = await shopier.siparisGeldi({ id: 'S1', paymentStatus: 'paid', note: 'SRGO-1', totals: { grandTotal: '499.00' },
    lineItems: [{ productId: 9002, title: olusan[1].baslik }] });
  assert.equal(sonuc.islem, 'tasarim_satildi');
  assert.deepEqual((await db.query('SELECT kaynak FROM isletme_tasarimlari WHERE isletme_id = 1 AND tasarim_id = 1')).rows, [{ kaynak: 'satin' }]);
  assert.equal((await db.query('SELECT sayfa_tasarim_id FROM isletmeler WHERE id = 1')).rows[0].sayfa_tasarim_id, 1, 'sayfada hemen açılır');
  assert.equal((await db.query("SELECT durum FROM tasarim_satislari WHERE id = $1", [satis[0].id])).rows[0].durum, 'odendi');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM odemeler')).rows[0].n, 0, 'paket ödeme kaydı açılmaz');
  assert.equal((await db.query("SELECT to_char(paket_bitis_tarihi, 'YYYY-MM-DD') d FROM isletmeler WHERE id = 1")).rows[0].d, '2026-12-01', 'paket süresi uzamaz');
  assert.ok(silinen.includes('9002'), 'ödenen ürün Shopier\'den kaldırılır');

  assert.equal((await shopier.siparisGeldi({ id: 'S1', paymentStatus: 'paid', lineItems: [{ productId: 9002 }] })).islem, 'zaten_islenmis');
  assert.equal((await al(1, 1)).kod, 400, 'sahip olunan tasarım tekrar satın alınmaz');

  // Ürün kimliği gelmese de başlıktaki referansla eşleşir
  await al(2, 1);
  const b2 = olusan[olusan.length - 1].baslik;
  assert.equal((await shopier.siparisGeldi({ id: 'S2', paymentStatus: 'paid', totals: { grandTotal: '499' }, lineItems: [{ title: b2 }] })).islem, 'tasarim_satildi');
  assert.equal((await db.query('SELECT COUNT(*)::int n FROM isletme_tasarimlari WHERE isletme_id = 2')).rows[0].n, 1);

  // Kaydı olmayan tasarım referansı: paket ödemesine düşmez, ekip uyarılır
  assert.equal((await shopier.siparisGeldi({ id: 'S3', paymentStatus: 'paid', lineItems: [{ title: 'SıraGO Sayfa Tasarımı: X [SRGO-T999]' }] })).islem, 'tasarim_eslesmedi');
  assert.equal(await t.siparisEslestir({ urunId: 1, urunBaslik: 'SıraGO Standart Paket [SRGO-1]', siparisId: 'S4', tutar: 499 }), null, 'paket siparişine dokunulmaz');

  // Süper admin listesinde satış özeti
  r = cevap(); await t.liste({ kullanici: { rol: 'superadmin' } }, r);
  assert.deepEqual(r.veri.satis_toplam, { adet: 2, ciro: 998 });
});
