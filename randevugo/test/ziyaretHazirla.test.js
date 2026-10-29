// Ziyaret hazırla (2026-10-29): Google'dan bul (aday listesinde olmasa da) → demo sayfa gerçek saatlerle → kişiselleştir.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; }; return r; };
const p = (day, oh, om, ch, cm, cday = day) => ({ open: { day, hour: oh, minute: om }, close: { day: cday, hour: ch, minute: cm } });

test('saatleriCevir: genel saat, farklı günler, kapalı gün, öğle arası, gece yarısı, 24 saat', () => {
  const { saatleriCevir } = require(path.join(SRC, 'services', 'ziyaret'));
  // Pzt-Per 09-21, Cuma-Cmt 09-23, Pazar kapalı; Salı öğle arası 12-13
  const hafta = [p(1, 9, 0, 21, 0), p(2, 9, 0, 12, 0), p(2, 13, 0, 21, 0), p(3, 9, 0, 21, 0), p(4, 9, 0, 21, 0), p(5, 9, 0, 23, 0), p(6, 9, 0, 23, 0)];
  assert.deepEqual(saatleriCevir({ periods: hafta }),
    { genelBas: '09:00', genelBit: '21:00', haftalik: { 5: { bas: '09:00', bit: '23:00' }, 6: { bas: '09:00', bit: '23:00' } }, kapali: '0' });
  // Ertesi güne taşan kapanış (13:30 – 01:00) gün sonunda biter
  assert.deepEqual(saatleriCevir({ periods: [p(3, 13, 30, 1, 0, 4)] }), { genelBas: '13:30', genelBit: '00:00', haftalik: null, kapali: '0,1,2,4,5,6' });
  // 24 saat açık: kapanış yok
  assert.equal(saatleriCevir({ periods: [{ open: { day: 0, hour: 0, minute: 0 } }] }).genelBit, '00:00');
  assert.equal(saatleriCevir({}), null, 'saat bilgisi yoksa dokunulmaz');
});

test('linkCoz ve kategori tahmini', () => {
  const { linkCoz, kategoriTahmin } = require(path.join(SRC, 'services', 'ziyaret'));
  assert.deepEqual(linkCoz("https://www.google.com/maps/place/Villa+Barber's+Club/@41.1,28.8,17z/data=!3m1"),
    { metin: "Villa Barber's Club", konum: { lat: 41.1, lng: 28.8 } });
  assert.equal(linkCoz('https://www.google.com/maps/search/?api=1&query=Turkuas+Masaj').metin, 'Turkuas Masaj');
  assert.equal(linkCoz('https://example.com/x'), null);
  assert.equal(kategoriTahmin({ displayName: { text: "Villa Barber's Club" }, types: ['hair_salon'] }), 'berber', 'ad türden önce');
  assert.equal(kategoriTahmin({ displayName: { text: 'Turkuas' }, types: ['spa'] }), 'spa');
  assert.equal(kategoriTahmin({ displayName: { text: 'Duru Masaj Salonu' }, types: [] }), 'spa');
  assert.equal(kategoriTahmin({ displayName: { text: 'Lale' }, types: ['store'] }), null);
});

test('ziyaret: bul → hazırla (gerçek saatlerle demo) → kişiselleştir; gerçek işletme bu ekrandan değişmez', async (t) => {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.includes('config')) delete require.cache[k];
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, adres TEXT, ilce TEXT, kategori TEXT, aktif BOOLEAN, paket TEXT,
      booking_acik BOOLEAN, demo BOOLEAN, demo_lead_id INT, demo_goruntulenme INT, calisma_baslangic TIME, calisma_bitis TIME, kapali_gunler TEXT,
      haftalik_saatler JSONB, sayfa_tanitim TEXT, sayfa_guncelleme TIMESTAMPTZ, sayfa_tasarim_id INT, slug TEXT,
      olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, uzmanlik TEXT, aktif BOOLEAN);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, aktif BOOLEAN, aciklama TEXT);
    CREATE TABLE isletme_gorselleri (isletme_id INT, tur TEXT, veri TEXT, guncelleme TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (isletme_id, tur));
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, telefon TEXT, adres TEXT, sehir TEXT, ilce TEXT, kategori TEXT,
      puan NUMERIC, yorum_sayisi INT, web_sitesi TEXT, google_maps_id TEXT UNIQUE, google_maps_url TEXT, skor INT, demo_isletme_id INT);
    INSERT INTO isletmeler (isim, demo) VALUES ('Gerçek Esnaf', false);
    INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES (1, 'Kesim', 30, 400, true);`);
  const YER = { id: 'ChIJ_villa_barber_123', displayName: { text: "Villa Barber's Club" }, formattedAddress: 'Botanik Sk. No:7, 34494 Başakşehir/İstanbul',
    nationalPhoneNumber: '0532 111 22 33', googleMapsUri: 'https://maps.google.com/?cid=1', rating: 4.8, userRatingCount: 212, types: ['hair_salon'],
    addressComponents: [{ longText: 'İstanbul', types: ['administrative_area_level_1'] }, { longText: 'Başakşehir', types: ['administrative_area_level_2'] }],
    regularOpeningHours: { periods: [1, 2, 3, 4].map(g => p(g, 9, 0, 21, 0)).concat([p(5, 9, 0, 23, 0), p(6, 9, 0, 23, 0)]) } };
  const istekler = [];
  const eskiFetch = global.fetch;
  process.env.GOOGLE_MAPS_API_KEY = 'test';
  global.fetch = async (url, o = {}) => {
    istekler.push({ url: String(url), govde: o.body ? JSON.parse(o.body) : null, alan: o.headers?.['X-Goog-FieldMask'] });
    const veri = String(url).includes(':searchText') ? { places: [YER] } : YER;
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => veri };
  };
  t.after(() => { global.fetch = eskiFetch; delete process.env.GOOGLE_MAPS_API_KEY; });
  const z = require(path.join(SRC, 'controllers', 'ziyaretController'));

  let r = cevap(); await z.ara({ body: { girdi: "https://www.google.com/maps/place/Villa+Barber's+Club/@41.1,28.8,17z" } }, r);
  assert.equal(r.veri.adaylar[0].isim, "Villa Barber's Club");
  assert.equal(r.veri.adaylar[0].kategori, 'berber');
  assert.equal(istekler[0].govde.textQuery, "Villa Barber's Club");
  assert.ok(istekler[0].govde.locationBias, 'linkteki konum aramayı daraltır');
  assert.match(istekler[0].alan, /places\.regularOpeningHours/);

  r = cevap(); await z.hazirla({ body: { place_id: YER.id } }, r);
  assert.equal(r.veri.yeni, true, JSON.stringify(r.veri));
  const id = r.veri.isletme_id;
  const i = (await db.query("SELECT isim, demo, ilce, kategori, to_char(calisma_bitis, 'HH24:MI') bit, kapali_gunler, haftalik_saatler FROM isletmeler WHERE id = $1", [id])).rows[0];
  assert.deepEqual([i.isim, i.demo, i.kategori, i.bit, i.kapali_gunler], ["Villa Barber's Club", true, 'berber', '21:00', '0']);
  assert.deepEqual(i.haftalik_saatler, { 5: { bas: '09:00', bit: '23:00' }, 6: { bas: '09:00', bit: '23:00' } }, 'Google\'daki gerçek saatler');
  const lead = (await db.query('SELECT ilce, sehir, puan, demo_isletme_id FROM potansiyel_musteriler')).rows[0];
  assert.deepEqual([lead.ilce, lead.sehir, Number(lead.puan), lead.demo_isletme_id], ['Başakşehir', 'İstanbul', 4.8, id]);

  // Tekrar arayınca "hazır" görünür; tekrar hazırlayınca ikinci demo açılmaz
  r = cevap(); await z.ara({ body: { girdi: 'Villa Barber Başakşehir' } }, r);
  assert.equal(r.veri.adaylar[0].demo_isletme_id, id);
  r = cevap(); await z.hazirla({ body: { place_id: YER.id } }, r);
  assert.deepEqual([r.veri.isletme_id, r.veri.yeni], [id, false]);

  // Kişiselleştir: hizmet fiyatı, yeni hizmet, silme; logo; ad + tanıtım
  const hz = (await db.query('SELECT id, isim FROM hizmetler WHERE isletme_id = $1 ORDER BY id', [id])).rows;
  r = cevap(); await z.hizmetler({ params: { id }, body: { hizmetler: [{ id: hz[0].id, isim: 'Saç Kesim', sure_dk: 30, fiyat: 500 }, { id: hz[1].id, sil: true }, { isim: 'Yüz Bakımı', sure_dk: 20, fiyat: 300 }] } }, r);
  assert.equal(r.veri.ok, true);
  r = cevap(); await z.gorsel({ params: { id }, body: { tur: 'logo', veri: 'data:image/png;base64,iVBORw0KGgo=' } }, r);
  assert.equal(r.veri.ok, true);
  r = cevap(); await z.bilgi({ params: { id }, body: { isim: "Villa Barber's Club", tanitim: '2015\'ten beri' } }, r);
  r = cevap(); await z.getir({ params: { id } }, r);
  assert.equal(r.veri.kontrol.logo, true);
  assert.equal(r.veri.kontrol.fiyat, false, 'fiyatsız hizmet kaldıkça eksik görünür');
  assert.ok(r.veri.hizmetler.some(h => h.isim === 'Yüz Bakımı' && Number(h.fiyat) === 300));
  assert.ok(!r.veri.hizmetler.some(h => h.id === hz[1].id), 'silinen hizmet listede yok');
  assert.match(r.veri.qr, /^data:image\/png;base64,/);
  assert.match(r.veri.isletme.saatler, /Cum–Cmt 09:00–23:00/);
  assert.deepEqual([Number(r.veri.lead.puan), r.veri.lead.yorum_sayisi], [4.8, 212], 'ziyaret notu: Google puanı');

  // Gerçek işletme (demo değil) bu ekrandan değiştirilemez
  r = cevap(); await z.hizmetler({ params: { id: 1 }, body: { hizmetler: [{ id: 1, isim: 'X', fiyat: 1 }] } }, r);
  assert.equal(r.kod, 404);
  assert.equal((await db.query('SELECT isim FROM hizmetler WHERE id = 1')).rows[0].isim, 'Kesim');
  r = cevap(); await z.getir({ params: { id: 1 } }, r);
  assert.equal(r.kod, 404);

  r = cevap(); await z.son({}, r);
  assert.deepEqual(r.veri.liste.map(x => x.id), [id]);
});
