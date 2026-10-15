// Saha satışı (2026-10-15): sahada hesap aç, ziyaret/kart sonuçları, satışçı kodlu QR kart, geçici şifre ve şifre değiştirme.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };
const giden = [];      // Merkez numarasından esnafa giden mesajlar

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT UNIQUE, sifre TEXT, rol TEXT, isletme_id INT, grup_id INT,
      aktif BOOLEAN DEFAULT true, ekip_gorev TEXT, ekip_yetkileri TEXT[], son_giris TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, isletme_adi TEXT, telefon TEXT, sehir TEXT, ilce TEXT, adres TEXT, kategori TEXT,
      puan NUMERIC, yorum_sayisi INT, web_sitesi TEXT, instagram TEXT, google_maps_url TEXT, skor INT, durum TEXT DEFAULT 'yeni', notlar TEXT,
      arama_tarihi TIMESTAMP, sonraki_arama TIMESTAMP, wp_mesaj_durumu TEXT, demo_isletme_id INT);
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, kategori TEXT, ilce TEXT, adres TEXT, aktif BOOLEAN DEFAULT true,
      paket TEXT, slug TEXT, demo BOOLEAN DEFAULT false, grup_id INT, olusturma_tarihi TIMESTAMP DEFAULT NOW(), deneme_bitis_tarihi TIMESTAMP,
      referans_kodu TEXT, referans_ile_gelen INT, kayit_kanali TEXT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, aktif BOOLEAN DEFAULT true);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, uzmanlik TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE randevular (id SERIAL, isletme_id INT);
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, lead_id INT, kayit_isletme_id INT, telefon TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE odemeler (id SERIAL, isletme_id INT, durum TEXT);
    CREATE TABLE audit_log (id SERIAL PRIMARY KEY, isletme_id INT, kullanici_id INT, kullanici_email TEXT, islem TEXT, detay TEXT,
      hedef_tablo TEXT, hedef_id INT, ip_adresi TEXT, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE sifre_sifirlama (kullanici_id INT PRIMARY KEY, kod_hash TEXT, son_gecerlilik TIMESTAMP, deneme INT DEFAULT 0, olusturma TIMESTAMP DEFAULT NOW());
    CREATE TABLE referanslar (id SERIAL PRIMARY KEY, referans_kodu TEXT UNIQUE, sahip_isletme_id INT, toplam_davet INT DEFAULT 0);
    INSERT INTO admin_kullanicilar (isim, email, rol) VALUES ('Ahmet', 'ahmet@sirago', 'superadmin'), ('Ali', 'ali@sirago', 'superadmin');`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/030_satis_masasi.sql', 'utf8'));
  await o.db.exec('ALTER TABLE isletmeler ADD COLUMN mesai_disi_mod VARCHAR(20) DEFAULT \'kapali_mesaj\'; ALTER TABLE satis_konusmalar ADD COLUMN durum TEXT;');
  await o.db.exec(fs.readFileSync(SRC + '/migrations/051_saha_satis.sql', 'utf8'));
  await o.db.exec("INSERT INTO potansiyel_musteriler (isletme_adi, telefon, kategori, ilce, atanan_id) VALUES ('Makas Berber', '0532 111 22 33', 'berber', 'Kadıköy', 2)");
  sahte('services/merkezOtpBot', { sockets: new Map(), mesajGonder: async (tel, m) => { giden.push([tel, m]); return { success: true }; } });
  sahte('services/whatsappWeb', { getDurum: () => ({ durum: 'kapali' }), mesajGonder: async () => ({ success: false }) });
  sahte('services/socketServer', { emitToAdmin: () => {}, emitToIsletme: () => {} });
  sahte('services/pushService', { sendToAdmin: () => {}, sendToIsletme: async () => {} });
  return o;
})();

const req = (id, ek = {}) => ({ kullanici: { id, email: id === 1 ? 'ahmet@sirago' : 'ali@sirago', rol: 'superadmin', ekip_yetkileri: ['genel', 'satis'], patron: id === 1 },
  body: {}, params: {}, query: {}, headers: {}, ip: '1.1.1.1', ...ek });
const res = () => { const r = { kod: 200 }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.v = v; return r; };
  r.redirect = (k, u) => { r.kod = k; r.url = u; return r; }; r.send = (v) => { r.v = v; return r; }; return r; };

test('satış ekibi saha demosunu açabilir; masa uçları satışın', async () => {
  const { yolYetkisi, yetkiVar } = require(SRC + '/config/ekip');
  const satis = { rol: 'superadmin', ekip_yetkileri: ['genel', 'satis'], patron: false };
  for (const [m, u] of [['POST', '/api/admin/saha-demo'], ['POST', '/api/admin/masa/hesap-ac'], ['POST', '/api/admin/masa/hesap/5/panel'], ['GET', '/api/admin/masa/qr-kart']]) {
    assert.strictEqual(yetkiVar(satis, yolYetkisi(m, u)), true, u);
  }
  assert.strictEqual(yetkiVar(satis, yolYetkisi('POST', '/api/admin/isletmeler/5/gecici-sifre')), false, 'geçici şifre işletme ekibinin');
  assert.strictEqual(yetkiVar(satis, yolYetkisi('POST', '/api/admin/impersonate/5')), false, 'satış başka işletmeye giremez');
});

test('ziyaret ve kart: görüşmeye sayılır, aramaya sayılmaz; kart iki gün sonra yeniden listeye düşer', async () => {
  const { db } = await ortam;
  const m = require(SRC + '/controllers/masaController');
  await db.query("INSERT INTO potansiyel_musteriler (isletme_adi, telefon, atanan_id) VALUES ('Ziyaret 1', '0532 000 00 01', 1), ('Kart 1', '0532 000 00 02', 1)");
  const [z, k] = (await db.query("SELECT id FROM potansiyel_musteriler WHERE isletme_adi IN ('Ziyaret 1', 'Kart 1') ORDER BY id")).rows.map(r => r.id);
  let r = res(); await m.sonuc(req(1, { params: { id: z }, body: { tip: 'ziyaret' } }), r); assert.strictEqual(r.v.ok, true);
  r = res(); await m.sonuc(req(1, { params: { id: k }, body: { tip: 'kart' } }), r); assert.strictEqual(r.v.ok, true);
  const kart = (await db.query('SELECT durum, sonraki_arama FROM potansiyel_musteriler WHERE id = $1', [k])).rows[0];
  assert.strictEqual(kart.durum, 'ilgileniyor');
  assert.ok(new Date(kart.sonraki_arama) - Date.now() > 40 * 3600 * 1000, 'iki gün sonra');
  r = res(); await m.ozet(req(1), r);
  assert.deepStrictEqual([r.v.ben.arama, r.v.ben.ziyaret, r.v.ben.kart, r.v.ben.gorusme], [0, 1, 1, 1]);
});

test('sahada hesap aç: işletme üyeye yazılır, örnek hizmet + esnaf çalışan, geçici şifre WhatsApp\'a gider, panel anahtarı döner', async () => {
  const { db } = await ortam;
  const m = require(SRC + '/controllers/masaController');
  const lead = (await db.query("SELECT id FROM potansiyel_musteriler WHERE isletme_adi = 'Makas Berber'")).rows[0].id;

  let r = res(); await m.hesapAc({ ...req(2), kullanici: { ...req(2).kullanici, id: 3 }, body: { lead_id: lead, isletme_adi: 'Makas Berber', telefon: '0532 111 22 33', email: 'makas@gmail.com' } }, r);
  assert.strictEqual(r.kod, 403, 'başkasının adayı (patron değilse) açılamaz');

  r = res(); await m.hesapAc(req(2, { body: { lead_id: lead, isletme_adi: 'Makas Berber', telefon: '0532 111 22 33', email: 'Makas@Gmail.com', yetkili_adi: 'Hasan' } }), r);
  assert.strictEqual(r.kod, 200, JSON.stringify(r.v));
  assert.match(r.v.sifre, /^[a-z]{4}-\d{4}$/);
  const i = (await db.query('SELECT * FROM isletmeler WHERE id = $1', [r.v.isletme_id])).rows[0];
  assert.deepStrictEqual([i.getiren_id, i.kayit_kanali, i.kategori, i.telefon, i.ilce, i.demo], [2, 'saha', 'berber', '905321112233', 'Kadıköy', false]);
  assert.strictEqual(i.mesai_disi_mod, 'randevu_ver', 'yeni hesapta bot gece de randevu alır');
  assert.ok((await db.query('SELECT COUNT(*)::int n FROM hizmetler WHERE isletme_id = $1 AND fiyat = 0', [i.id])).rows[0].n >= 3, 'berber örnek hizmetleri');
  assert.strictEqual((await db.query('SELECT isim FROM calisanlar WHERE isletme_id = $1', [i.id])).rows[0].isim, 'Hasan');
  const k = (await db.query('SELECT * FROM admin_kullanicilar WHERE isletme_id = $1', [i.id])).rows[0];
  assert.deepStrictEqual([k.email, k.rol, k.sifre_degistirmeli], ['makas@gmail.com', 'admin', true]);
  assert.ok(await require('bcryptjs').compare(r.v.sifre, k.sifre));
  assert.strictEqual((await db.query("SELECT durum FROM potansiyel_musteriler WHERE id = $1", [lead])).rows[0].durum, 'musteri_oldu');
  assert.strictEqual((await db.query("SELECT COUNT(*)::int n FROM satis_aktivite WHERE kullanici_id = 2 AND tip = 'kurulum' AND isletme_id = $1", [i.id])).rows[0].n, 1);
  const [tel, metin] = giden.at(-1);
  assert.strictEqual(tel, '905321112233');
  assert.ok(metin.includes(r.v.sifre) && metin.includes('makas@gmail.com'), 'giriş bilgisi esnafa gitti');
  assert.strictEqual(r.v.wa_gonderildi, true);
  const jwt = require('jsonwebtoken').verify(r.v.token, require(SRC + '/middleware/auth').jwtSecret);
  assert.deepStrictEqual([jwt.isletme_id, jwt.impersonated, jwt.impersonator], [i.id, true, 'ali@sirago']);

  r = res(); await m.hesapAc(req(2, { body: { isletme_adi: 'Başka', telefon: '05329998877', email: 'makas@gmail.com' } }), r);
  assert.strictEqual(r.kod, 400, 'aynı e-posta ikinci kez açılmaz');
  assert.strictEqual((await db.query("SELECT COUNT(*)::int n FROM isletmeler WHERE isim = 'Başka'")).rows[0].n, 0);

  // Sekme kapandı: açan üye panele yeniden girer, diğer üye giremez (patron girer)
  r = res(); await m.hesapPanel(req(2, { params: { id: i.id } }), r); assert.ok(r.v.token);
  const ali2 = { ...req(2).kullanici, id: 3 };
  r = res(); await m.hesapPanel({ ...req(2), kullanici: ali2, params: { id: i.id } }, r); assert.strictEqual(r.kod, 403);
});

test('sahada hesap aç: aynı telefonlu Venüs demosu gerçek hesaba döner (hizmetleri korunur)', async () => {
  const { db } = await ortam;
  const m = require(SRC + '/controllers/masaController');
  const demo = (await db.query("INSERT INTO isletmeler (isim, telefon, kategori, demo, paket) VALUES ('Demo Kuaför', '905334445566', 'kuafor', true, 'baslangic') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES ($1, 'Fön', 30, 0)", [demo]);
  await db.query("INSERT INTO calisanlar (isletme_id, isim) VALUES ($1, 'Usta')", [demo]);
  const r = res(); await m.hesapAc(req(1, { body: { isletme_adi: 'Gül Kuaför', telefon: '0533 444 55 66', email: 'gul@gmail.com', yetkili_adi: 'Gül' } }), r);
  assert.strictEqual(r.v.isletme_id, demo);
  assert.strictEqual(r.v.demodan, true);
  const i = (await db.query('SELECT demo, isim, kayit_kanali, getiren_id FROM isletmeler WHERE id = $1', [demo])).rows[0];
  assert.deepStrictEqual([i.demo, i.isim, i.kayit_kanali, i.getiren_id], [false, 'Gül Kuaför', 'saha', 1]);
  assert.deepStrictEqual((await db.query('SELECT isim FROM hizmetler WHERE isletme_id = $1', [demo])).rows.map(x => x.isim), ['Fön']);
  assert.deepStrictEqual((await db.query('SELECT isim FROM calisanlar WHERE isletme_id = $1', [demo])).rows.map(x => x.isim), ['Gül']);
});

test('QR kart: kod ve link üyeye özel; link bağlı Satış Bot numarasına, bot yoksa web kaydına yönlenir', async () => {
  const { db } = await ortam;
  const bot = { numaralar: [] };
  sahte('services/satisBot', { bagliNumaralar: () => bot.numaralar, numaraSockets: new Map(), _mdKacis: (x) => x, _telegramBildirimGonder: async () => {} });
  const m = require(SRC + '/controllers/masaController');
  let r = res(); await m.qrKart(req(2), r);
  assert.deepStrictEqual([r.v.kod, r.v.bagli, r.v.isim], ['S2', false, 'Ali']);
  assert.match(r.v.link, /\/k\/S2$/);
  assert.match(r.v.qr, /^data:image\/png;base64,/);

  r = res(); await m.kartYonlendir({ params: { kod: 's2' } }, r);
  assert.strictEqual(r.kod, 302);
  assert.match(r.url, /\?kayit=1&saha=S2$/);
  bot.numaralar = ['905001112233'];
  r = res(); await m.kartYonlendir({ params: { kod: 'S2' } }, r);
  assert.ok(r.url.startsWith('https://wa.me/905001112233?text='));
  assert.match(decodeURIComponent(r.url), /denemek istiyorum \(kart: S2\)/);
  r = res(); await m.kartYonlendir({ params: { kod: 'X1;drop' } }, r);
  assert.strictEqual(r.kod, 404);

  // Kod mesajdan yakalanır ve kayıtta üyeye yazılır (işletme başka üyedeyse dokunulmaz)
  const sk = require(SRC + '/utils/sahaKodu');
  assert.strictEqual(sk.kodYakala("Merhaba, SıraGO'yu denemek istiyorum (kart: S2)"), 2);
  assert.strictEqual(sk.kodYakala('kartım var'), null);
  const yeni = (await db.query("INSERT INTO isletmeler (isim) VALUES ('Kart Berber') RETURNING id")).rows[0].id;
  assert.strictEqual((await sk.kayittaUygula(2, yeni)).isim, 'Ali');
  assert.strictEqual(await sk.kayittaUygula(1, yeni), null, 'ikinci üye üzerine yazamaz');
  const i = (await db.query('SELECT getiren_id, kayit_kanali FROM isletmeler WHERE id = $1', [yeni])).rows[0];
  assert.deepStrictEqual([i.getiren_id, i.kayit_kanali], [2, 'qr_kart']);
  assert.strictEqual((await db.query("SELECT COUNT(*)::int n FROM satis_aktivite WHERE isletme_id = $1 AND tip = 'kurulum' AND otomatik", [yeni])).rows[0].n, 1);
  assert.strictEqual(await sk.kayittaUygula(99, yeni), null, 'olmayan üye');
});

test('web kaydı ?saha=S2 ile gelirse işletme o üyeye yazılır', async () => {
  const { db } = await ortam;
  const a = require(SRC + '/controllers/authController');
  const r = res();
  await a.botKayit({ body: { isletmeAdi: 'Web Kart Kuaför', email: 'webkart@gmail.com', sifre: 'gizlisifre1', kayitKanal: 'web', saha_kodu: 'S2' } }, r);
  assert.strictEqual(r.v.basarili, true, JSON.stringify(r.v));
  const i = (await db.query("SELECT getiren_id, kayit_kanali FROM isletmeler WHERE isim = 'Web Kart Kuaför'")).rows[0];
  assert.deepStrictEqual([i.getiren_id, i.kayit_kanali], [2, 'qr_kart']);
});

test('geçici şifre: kayıtlı WhatsApp\'a gider, ilk girişte değiştirmek zorunlu; şifre değiştirme kuralları', async () => {
  const { db } = await ortam;
  const bcrypt = require('bcryptjs');
  const isl = (await db.query("INSERT INTO isletmeler (isim, telefon) VALUES ('Unutkan Berber', '905347778899') RETURNING id")).rows[0].id;
  await db.query("INSERT INTO admin_kullanicilar (isim, email, sifre, rol, isletme_id) VALUES ('Unutkan', 'unutkan@gmail.com', $1, 'admin', $2)", [await bcrypt.hash('eskisifre1', 4), isl]);
  const admin = require(SRC + '/controllers/adminController');
  let r = res(); await admin.geciciSifre(req(1, { params: { id: isl }, body: { gonder: true } }), r);
  assert.match(r.v.sifre, /^[a-z]{4}-\d{4}$/);
  assert.deepStrictEqual([r.v.email, r.v.gonderildi], ['unutkan@gmail.com', true]);
  assert.ok(giden.at(-1)[1].includes(r.v.sifre));
  assert.strictEqual((await db.query("SELECT COUNT(*)::int n FROM audit_log WHERE islem = 'gecici_sifre'")).rows[0].n, 1);
  const gecici = r.v.sifre;

  const a = require(SRC + '/controllers/authController');
  r = res(); await a.giris({ body: { email: 'unutkan@gmail.com', sifre: 'eskisifre1' }, headers: {}, ip: '1' }, r);
  assert.strictEqual(r.kod, 401, 'eski şifre artık çalışmaz');
  r = res(); await a.giris({ body: { email: 'unutkan@gmail.com', sifre: gecici }, headers: {}, ip: '1' }, r);
  assert.strictEqual(r.v.kullanici.sifre_degistirmeli, true, 'giriş cevabı zorunlu değişimi söyler');
  const kid = r.v.kullanici.id;

  r = res(); await a.sifreDegistir({ kullanici: { id: kid, impersonated: true }, body: { yeni: 'yenisifre12' } }, r);
  assert.strictEqual(r.kod, 403, 'müşteri olarak girişte değiştirilemez');
  r = res(); await a.sifreDegistir({ kullanici: { id: kid }, body: { yeni: gecici } }, r);
  assert.strictEqual(r.kod, 400, 'geçici şifre yeni şifre olamaz');
  r = res(); await a.sifreDegistir({ kullanici: { id: kid }, body: { yeni: 'yenisifre12' }, headers: {}, ip: '1' }, r);
  assert.strictEqual(r.v.ok, true, 'zorunlu değişimde mevcut şifre sorulmaz');
  assert.strictEqual((await db.query('SELECT sifre_degistirmeli FROM admin_kullanicilar WHERE id = $1', [kid])).rows[0].sifre_degistirmeli, false);

  r = res(); await a.sifreDegistir({ kullanici: { id: kid }, body: { mevcut: 'yanlis', yeni: 'baskasifre1' } }, r);
  assert.strictEqual(r.kod, 400, 'normal değişimde mevcut şifre doğru olmalı');
  r = res(); await a.sifreDegistir({ kullanici: { id: kid }, body: { mevcut: 'yenisifre12', yeni: 'kisa' } }, r);
  assert.strictEqual(r.kod, 400);
  r = res(); await a.sifreDegistir({ kullanici: { id: kid }, body: { mevcut: 'yenisifre12', yeni: 'baskasifre1' }, headers: {}, ip: '1' }, r);
  assert.strictEqual(r.v.ok, true);
  r = res(); await a.giris({ body: { email: 'unutkan@gmail.com', sifre: 'baskasifre1' }, headers: {}, ip: '1' }, r);
  assert.strictEqual(r.v.kullanici.sifre_degistirmeli, false);

  r = res(); await a.profilim({ kullanici: { id: kid, impersonated: true } }, r);
  assert.deepStrictEqual([r.v.kullanici.sifre_degistirmeli, r.v.kullanici.impersonated], [false, true]);
});
