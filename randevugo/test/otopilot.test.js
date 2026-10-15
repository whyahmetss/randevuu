// Otopilot kurulum (2026-10-15): WhatsApp'tan kayıt olan esnafın dükkânı aynı sohbette kurulur — kategori, hizmet ve
// fiyat, çalışanlar, WhatsApp eşleştirme kodu, bitiş. Gerçek Satış Bot mesaj akışı (_mesajIsle) üzerinden.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const { hazirla, SRC } = require('./yardimci');

const ortam = (async () => {
  const o = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, kategori TEXT, aktif BOOLEAN DEFAULT true, paket TEXT, slug TEXT,
      olusturma_tarihi TIMESTAMP, deneme_bitis_tarihi TIMESTAMP, demo BOOLEAN DEFAULT false, referans_kodu TEXT, referans_ile_gelen INT,
      kayit_kanali TEXT, getiren_id INT);
    CREATE TABLE admin_kullanicilar (id SERIAL PRIMARY KEY, isim TEXT, email TEXT UNIQUE, sifre TEXT, rol TEXT, isletme_id INT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, sure_dk INT, fiyat NUMERIC, aktif BOOLEAN DEFAULT true);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, uzmanlik TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, hizmet_id INT REFERENCES hizmetler(id));
    CREATE TABLE satis_konusmalar (id SERIAL PRIMARY KEY, telefon TEXT, isletme_adi TEXT, kategori TEXT, gonderilen_mesaj TEXT, durum TEXT,
      gelen_mesajlar TEXT, son_mesaj_tarihi TIMESTAMP, sablon_id INT, lead_id INT, kayit_durum JSONB, kayit_isletme_id INT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE potansiyel_musteriler (id SERIAL PRIMARY KEY, durum TEXT, atanan_id INT);
    CREATE TABLE referanslar (id SERIAL PRIMARY KEY, referans_kodu TEXT UNIQUE, sahip_isletme_id INT, toplam_davet INT DEFAULT 0);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, durum TEXT);`);
  await o.db.exec(fs.readFileSync(SRC + '/migrations/050_platform_yonetimi.sql', 'utf8'));
  await o.db.exec(fs.readFileSync(SRC + '/migrations/051_saha_satis.sql', 'utf8').replace(/^ALTER TABLE isletmeler ALTER COLUMN mesai_disi_mod.*$/m, ''));
  return o;
})();

// Sahte WhatsApp (esnafın bağlanacağı servis): eşleştirme kodu verir, "bağlandı" olayı yayar
function sahteWa() {
  const wa = new EventEmitter();
  wa.durum = {}; wa.kodIstekleri = [];
  wa.getDurum = (id) => ({ durum: wa.durum[id] || 'bagli_degil' });
  wa.eslestirmeKoduAl = async (id, isim, tel) => { wa.kodIstekleri.push([id, tel]); if (wa.hata) throw new Error('WhatsApp kodu vermedi'); return 'ABCD1234'; };
  return wa;
}

async function botHazirla() {
  const bot = require(SRC + '/services/satisBot');
  const otopilot = require(SRC + '/services/otopilot');
  const giden = [], telegram = [];
  bot._yaz = async (s, j, t) => { giden.push(t); return t; };
  bot._telegramBildirimGonder = async (m) => { telegram.push(m); };
  bot.sock = { sendPresenceUpdate: async () => {} };
  bot.ayarlar.mesajBirlestir = false;
  otopilot.yaziyorMs = 0;
  otopilot.wa = sahteWa();
  const mesaj = async (tel, metin) => {
    const n = giden.length;
    await bot._mesajIsle({ key: { remoteJid: `${tel}@s.whatsapp.net` }, message: { conversation: metin }, pushName: 'Hasan Usta ✂️' }, null, metin);
    return giden.slice(n).join('\n---\n');
  };
  return { bot, otopilot, giden, telegram, mesaj };
}

test('metin okuma: fiyatlar, hizmet satırları, isimler, kategori', async () => {
  await ortam;
  const { yalnizSayilar, hizmetListesiOku, isimleriOku, kategoriOku } = require(SRC + '/services/otopilot')._test;
  assert.deepStrictEqual(yalnizSayilar('250 150 350 100'), [250, 150, 350, 100]);
  assert.deepStrictEqual(yalnizSayilar('250tl, 1.500 TL, 99,50₺'), [250, 1500, 99.5]);
  assert.strictEqual(yalnizSayilar('saç 250'), null);
  assert.strictEqual(yalnizSayilar('tamam'), null);
  const l = hizmetListesiOku('1. Saç kesimi: 300 TL\n- Sakal 150\nBoya (90 dk) 1.200', [{ isim: 'Sakal', sure_dk: 20 }]);
  assert.deepStrictEqual(l.liste.map(x => [x.isim, x.fiyat, x.sure]), [['Saç Kesimi', 300, 30], ['Sakal', 150, 20], ['Boya', 1200, 90]]);
  assert.strictEqual(hizmetListesiOku('saç kesimi ne kadar olsun bilmiyorum').hata, 'saç kesimi ne kadar olsun bilmiyorum');
  assert.deepStrictEqual(isimleriOku('ahmet, Mehmet ve ali usta\nAhmet'), ['Ahmet', 'Mehmet', 'Ali Usta']);
  assert.deepStrictEqual(isimleriOku('2 kişiyiz'), []);
  assert.deepStrictEqual(isimleriOku('Ben ve kardeşim Can'), ['Kardeşim Can']);
  assert.deepStrictEqual(['1', 'berberim', 'Kuaför salonu', '0', 'diğer', 'masaj salonu', 'merhaba', '12'].map(kategoriOku),
    ['berber', 'berber', 'kuaför', null, null, 'spa', undefined, undefined]);
});

test('kayıttan sonra otopilot: kategori → fiyatlar → çalışanlar (paket sınırı) → eşleştirme kodu → bağlandı → bitti', async () => {
  const { db } = await ortam;
  const { bot, otopilot, giden, telegram, mesaj } = await botHazirla();
  const tel = '905321112299';
  await db.query("INSERT INTO satis_konusmalar (telefon, isletme_adi, kategori, gonderilen_mesaj, durum) VALUES ($1, 'Müşteri', 'genel', 'Müşteri kendisi yazdı', 'kayit')", [tel]);
  bot.konusmalar[tel] = { kayit: { adim: 'isletme_adi' } };
  for (const m of ['Fiko Berber', 'fiko@gmail.com', 'yok']) await mesaj(tel, m);
  const kayit = await mesaj(tel, 'gizlisifre1');
  assert.match(kayit, /Hesabınız hazır/);
  assert.doesNotMatch(kayit, /İlk 3 adım/, 'otopilotta eski 3 adım metni gitmez');
  assert.match(kayit, /ne iş yapıyorsunuz/);
  const isl = (await db.query("SELECT id FROM isletmeler WHERE isim = 'Fiko Berber'")).rows[0].id;
  const d0 = (await db.query('SELECT kurulum_durum, durum FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0];
  assert.deepStrictEqual([d0.durum, d0.kurulum_durum.adim, d0.kurulum_durum.isletmeId], ['musteri', 'kategori', isl]);
  assert.match(telegram.at(-1), /bot WhatsApp'ta yaptırıyor/);

  assert.match(await mesaj(tel, 'merhaba'), /numarasını yazar mısınız/);
  const h = await mesaj(tel, '1');
  assert.match(h, /Adım 1\/3/);
  assert.match(h, /1\. Saç Kesim \(30 dk\)/);
  assert.strictEqual((await db.query('SELECT kategori FROM isletmeler WHERE id = $1', [isl])).rows[0].kategori, 'berber');

  assert.match(await mesaj(tel, '300 200'), /4 hizmet var, 2 fiyat/);
  const c = await mesaj(tel, '300 200 450 150');
  assert.match(c, /Saç Kesim \(30 dk\): 300₺/);
  assert.match(c, /Adım 2\/3/);
  assert.deepStrictEqual((await db.query('SELECT fiyat::int f FROM hizmetler WHERE isletme_id = $1 ORDER BY id', [isl])).rows.map(r => r.f), [300, 200, 450, 150]);

  const n = await mesaj(tel, 'Ahmet, Mehmet ve Ali');
  assert.match(n, /Çalışanlar: Ahmet, Mehmet/);
  assert.match(n, /2 çalışan var; Ali için paketi yükseltebilirsiniz/, 'Başlangıç paketi 2 çalışan');
  assert.match(n, /0532 111 22 99/);
  assert.deepStrictEqual((await db.query('SELECT isim FROM calisanlar WHERE isletme_id = $1 ORDER BY id', [isl])).rows.map(r => r.isim), ['Ahmet', 'Mehmet']);

  const k = await mesaj(tel, 'evet');
  assert.match(k, /Bağlı cihazlar/);
  assert.match(k, /ABCD-1234/);
  assert.deepStrictEqual(otopilot.wa.kodIstekleri.at(-1), [isl, '905321112299']);
  assert.match(await mesaj(tel, 'kod'), /yarım dakika bekleyip/, 'kod 30 sn içinde tekrar istenmez');
  assert.match(await mesaj(tel, 'yazdım'), /haber veririm/);

  // Esnaf kodu girdi: WhatsApp bağlandı olayı → bitiş mesajı, kurulum durumu temizlenir
  assert.strictEqual(otopilot.wa.listenerCount(`bagli_${isl}`), 1, 'bağlanma olayı dinleniyor');
  await otopilot.baglandi(isl, bot);
  assert.match(giden.at(-1), /Kurulum tamam/);
  assert.match(giden.at(-1), /book\/fiko-berber-/);
  assert.match(telegram.at(-1), /Otopilot kurulumu bitirdi/);
  assert.strictEqual((await db.query('SELECT kurulum_durum FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].kurulum_durum, null);
  assert.strictEqual(await otopilot.baglandi(isl, bot), false, 'ikinci olay bir şey yapmaz');

  // Kurulum bitti: yeni mesaj destek akışına gider
  assert.match(await mesaj(tel, 'teşekkürler bir sorum var'), /ekibimize ilettim/);
});

test('hizmet listesi kendi yazdığıyla değişir; randevulu eski hizmet silinmez pasife alınır; "sadece ben" WhatsApp adını alır', async () => {
  const { db } = await ortam;
  const { otopilot, giden, mesaj } = await botHazirla();
  const tel = '905321110001';
  const isl = (await db.query("INSERT INTO isletmeler (isim, telefon, kategori, paket) VALUES ('Liste Kuaför', $1, 'kuafor', 'baslangic') RETURNING id", [tel])).rows[0].id;
  await db.query("INSERT INTO satis_konusmalar (telefon, durum, kayit_isletme_id) VALUES ($1, 'musteri', $2)", [tel, isl]);
  const ilk = await otopilot.baslat({ isletmeId: isl, telefon: tel, jid: `${tel}@s.whatsapp.net` });
  assert.match(ilk, /Fön \(30 dk\)/, 'kuaför örnek listesi');
  const eski = (await db.query('SELECT id FROM hizmetler WHERE isletme_id = $1 ORDER BY id LIMIT 1', [isl])).rows[0].id;
  await db.query('INSERT INTO randevular (isletme_id, hizmet_id) VALUES ($1, $2)', [isl, eski]);

  const c = await mesaj(tel, 'Kadın saç kesimi 400\nFön 250\nBoya (120 dk) 1.500 TL');
  assert.match(c, /Boya \(120 dk\): 1\.500₺/);
  const h = (await db.query('SELECT isim, aktif FROM hizmetler WHERE isletme_id = $1 ORDER BY id', [isl])).rows;
  assert.deepStrictEqual(h.filter(x => x.aktif).map(x => x.isim), ['Kadın Saç Kesimi', 'Fön', 'Boya']);
  assert.strictEqual(h.find(x => !x.aktif)?.isim, 'Saç Kesim', 'randevusu olan eski hizmet pasif');
  assert.strictEqual(h.length, 4, 'randevusuz eski hizmetler silindi');

  assert.match(await mesaj(tel, 'sadece ben'), /Çalışanlar: Hasan Usta/);
  // Numara yazdı → kod; WhatsApp kod vermezse ikinci hatada ekibe düşer
  otopilot.wa.hata = true;
  assert.match(await mesaj(tel, '0533 222 11 00'), /kod vermedi/);
  const d = (await db.query('SELECT kurulum_durum FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].kurulum_durum;
  assert.strictEqual(d.tel, '905332221100');
  await db.query("UPDATE satis_konusmalar SET kurulum_durum = jsonb_set(kurulum_durum, '{sonKod}', '0') WHERE telefon = $1", [tel]);
  assert.match(await mesaj(tel, 'kod'), /ekibimize haber verdim/i);
  const u = (await db.query("SELECT tip, baslik FROM sistem_uyarilari WHERE anahtar = $1 AND cozuldu = false", [`kurulum:${isl}`])).rows[0];
  assert.strictEqual(u.tip, 'kurulum');
  // Bu arada panelden QR ile bağladı: sonraki mesajda kurulum biter, uyarı kapanır
  otopilot.wa.durum[isl] = 'bagli';
  assert.match(await mesaj(tel, 'bağladım galiba'), /Kurulum tamam/);
  assert.strictEqual((await db.query("SELECT cozuldu FROM sistem_uyarilari WHERE anahtar = $1", [`kurulum:${isl}`])).rows[0].cozuldu, true);
  assert.ok(giden.length > 0);
});

test('çıkışlar: "panel" otopilotu bırakır, "yardım" ekibe düşer, 3 anlaşılmayan cevapta ekibe haber; takılan kurulum denetimde uyarı olur', async () => {
  const { db } = await ortam;
  const { otopilot, telegram, mesaj, bot } = await botHazirla();
  const yeni = async (tel, ad) => {
    const isl = (await db.query("INSERT INTO isletmeler (isim, telefon, kategori, paket) VALUES ($1, $2, 'berber', 'baslangic') RETURNING id", [ad, tel])).rows[0].id;
    await db.query("INSERT INTO satis_konusmalar (telefon, durum, kayit_isletme_id) VALUES ($1, 'musteri', $2)", [tel, isl]);
    await otopilot.baslat({ isletmeId: isl, telefon: tel, jid: `${tel}@s.whatsapp.net` });
    return isl;
  };
  const durum = async (tel) => (await db.query('SELECT kurulum_durum FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].kurulum_durum;

  await yeni('905321110002', 'Panelci Berber');
  assert.match(await mesaj('905321110002', 'panel'), /sayfa=hizmetler/);
  assert.strictEqual(await durum('905321110002'), null);

  const isl3 = await yeni('905321110003', 'Yardımcı Berber');
  assert.match(await mesaj('905321110003', 'yardım lazım'), /sizi arayacaklar/);
  assert.match(telegram.at(-1), /Kurulumda yardım gerekiyor/);
  assert.ok((await db.query("SELECT 1 FROM sistem_uyarilari WHERE anahtar = $1", [`kurulum:${isl3}`])).rows[0]);
  assert.strictEqual((await durum('905321110003')).adim, 'hizmet', 'yardım isteyen kaldığı yerden devam eder');

  const isl4 = await yeni('905321110004', 'Şaşkın Berber');
  for (const m of ['bu ne', 'anlamıyorum hiç']) await mesaj('905321110004', m);
  assert.strictEqual((await db.query("SELECT 1 FROM sistem_uyarilari WHERE anahtar = $1", [`kurulum:${isl4}`])).rows[0], undefined);
  assert.match(await mesaj('905321110004', 'ne yazacağım'), /Ekibimize de haber verdim/);
  assert.ok((await db.query("SELECT 1 FROM sistem_uyarilari WHERE anahtar = $1", [`kurulum:${isl4}`])).rows[0]);

  // Denetim: 3 saattir ilerlemeyen kurulum bir kez uyarı olur; 3 günü geçen bırakılır
  const isl5 = await yeni('905321110005', 'Unutan Berber');
  await db.query(`UPDATE satis_konusmalar SET kurulum_durum = jsonb_set(kurulum_durum, '{t}', to_jsonb((EXTRACT(EPOCH FROM NOW()) * 1000 - 3 * 3600 * 1000)::bigint)) WHERE telefon = '905321110005'`);
  await yeni('905321110006', 'Eski Berber');
  await db.query(`UPDATE satis_konusmalar SET kurulum_durum = jsonb_set(kurulum_durum, '{t}', to_jsonb((EXTRACT(EPOCH FROM NOW()) * 1000 - 80 * 3600 * 1000)::bigint)) WHERE telefon = '905321110006'`);
  assert.strictEqual(await otopilot.denetle(bot, { saatKontrol: false }), 1);
  assert.ok((await db.query("SELECT 1 FROM sistem_uyarilari WHERE anahtar = $1 AND baslik LIKE '%Unutan Berber%'", [`kurulum:${isl5}`])).rows[0]);
  assert.strictEqual((await durum('905321110005')).uyarildi, true);
  assert.strictEqual(await durum('905321110006'), null, '72 saati geçen bırakıldı');
  assert.strictEqual(await otopilot.denetle(bot, { saatKontrol: false }), 0, 'ikinci denetimde tekrar uyarmaz');
});

test('otopilot kapalıysa eski 3 adım metni gider', async () => {
  const { db } = await ortam;
  const { bot, mesaj } = await botHazirla();
  bot.ayarlar.otopilotKurulum = false;
  const tel = '905321119999';
  await db.query("INSERT INTO satis_konusmalar (telefon, durum) VALUES ($1, 'kayit')", [tel]);
  bot.konusmalar[tel] = { kayit: { adim: 'isletme_adi' } };
  for (const m of ['Kapalı Berber', 'kapali@gmail.com', 'yok']) await mesaj(tel, m);
  assert.match(await mesaj(tel, 'gizlisifre1'), /İlk 3 adım/);
  assert.strictEqual((await db.query('SELECT kurulum_durum FROM satis_konusmalar WHERE telefon = $1', [tel])).rows[0].kurulum_durum, null);
  bot.ayarlar.otopilotKurulum = true;
});
