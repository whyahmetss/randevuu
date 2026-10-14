// Memnuniyet anketi (puan → link/alarm, Google linki herkese) ve bekleme listesi (tek teklif, hayır → sıradaki, zaman aşımı).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

// Modül taklidi: WhatsApp ve müsait saat hesabı
function taklit(modul, exports) {
  const ad = require.resolve(path.join(SRC, modul));
  require.cache[ad] = { id: ad, filename: ad, loaded: true, exports };
}

test('memnuniyet: puan okuma', () => {
  const { puanAl } = require(path.join(SRC, 'services', 'memnuniyet'));
  for (const [g, b] of [['5', 5], [' 4 ', 4], ['5️⃣', 5], ['3/5', 3], ['2 puan', 2], ['⭐⭐⭐⭐', 4], ['1.', 1]]) assert.equal(puanAl(g), b, g);
  for (const g of ['6', '0', '15', 'yarın 5te gelebilir miyim', 'evet', '', '10/10']) assert.equal(puanAl(g), null, g);
});

test('memnuniyet: yüksek puana link, düşük puana açıklama + alarm, link her iki durumda', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, google_maps_link TEXT, yorum_mesaj_sablonu TEXT);
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT);
    CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY, isletme_id INT, randevu_id INT, musteri_id INT, telefon VARCHAR(20),
      gonderim_zamani TIMESTAMP, durum VARCHAR(20) DEFAULT 'bekliyor', gonderim_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW(),
      puan SMALLINT, geri_bildirim TEXT, puan_zamani TIMESTAMPTZ, tg_chat_id VARCHAR(40), cozuldu BOOLEAN NOT NULL DEFAULT false);
    INSERT INTO isletmeler (isim, google_maps_link, yorum_mesaj_sablonu) VALUES ('Kemal Berber', 'https://g.page/r/x/review', 'Merhaba {musteri_adi}! deneyiminiz nasıldı? {google_maps_link}');
    INSERT INTO musteriler (isim) VALUES ('Ayşe'), ('Can');
    INSERT INTO yorum_talepleri (isletme_id, musteri_id, telefon, durum, gonderim_tarihi) VALUES
      (1, 1, '905551112233', 'puan_bekliyor', NOW()), (1, 2, '905554445566', 'puan_bekliyor', NOW()),
      (1, 2, '905557778899', 'puan_bekliyor', NOW() - INTERVAL '3 days');`);
  const alarmlar = [];
  taklit('services/pushService', { sendToIsletme: async (id, p) => { alarmlar.push(p.title); } });
  taklit('services/socketServer', { emitToIsletme: () => {} });
  delete require.cache[require.resolve(path.join(SRC, 'services', 'memnuniyet'))];   // ilk test gerçek veritabanıyla yüklemişti
  const m = require(path.join(SRC, 'services', 'memnuniyet'));

  // Puan olmayan mesaj → bot normal akışa devam eder
  assert.equal(await m.cevapIsle({ isletmeId: 1, telefon: '905551112233', metin: 'yarın yer var mı' }), null);
  // 5 puan → teşekkür + link; eski varsayılan şablon ("deneyiminiz nasıldı?") yerine yeni metin
  const yuksek = await m.cevapIsle({ isletmeId: 1, telefon: '905551112233', metin: '5' });
  assert.match(yuksek, /g\.page\/r\/x\/review/); assert.doesNotMatch(yuksek, /nasıldı/);
  assert.equal(alarmlar.length, 0);
  // Cevaplanan anket tekrar yakalanmaz
  assert.equal(await m.cevapIsle({ isletmeId: 1, telefon: '905551112233', metin: '4' }), null);

  // 2 puan → özür + açıklama isteği + link (Google kuralı: link puana göre seçilmez) + esnafa alarm
  const dusuk = await m.cevapIsle({ isletmeId: 1, telefon: '905554445566', metin: '2' });
  assert.match(dusuk, /üzüldük/); assert.match(dusuk, /g\.page\/r\/x\/review/);
  assert.equal(alarmlar.length, 1);
  const tesekkur = await m.cevapIsle({ isletmeId: 1, telefon: '905554445566', metin: 'Saçım çok kısa kesildi' });
  assert.match(tesekkur, /ilettik/);
  const kayit = (await db.query('SELECT puan, geri_bildirim, durum FROM yorum_talepleri WHERE id = 2')).rows[0];
  assert.deepEqual([kayit.puan, kayit.geri_bildirim, kayit.durum], [2, 'Saçım çok kısa kesildi', 'tamamlandi']);
  assert.equal(alarmlar.length, 2, 'açıklama da esnafa gider');

  // 48 saati geçmiş anket sayılmaz
  assert.equal(await m.cevapIsle({ isletmeId: 1, telefon: '905557778899', metin: '1' }), null);
});

test('bekleme listesi: tek teklif, hayır → sıradaki, zaman aşımı, tekrar kayıt yok', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, bot_diller TEXT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT);
    CREATE TABLE bot_durum (musteri_telefon VARCHAR(50), isletme_id INT, asama TEXT, secilen_tarih TEXT, secilen_saat TEXT,
      secilen_hizmet_id INT, son_aktivite TIMESTAMP, UNIQUE (musteri_telefon, isletme_id));
    CREATE TABLE bekleme_listesi (id SERIAL PRIMARY KEY, musteri_telefon VARCHAR(20) NOT NULL, isletme_id INT, hizmet_id INT,
      istenen_tarih DATE NOT NULL, durum VARCHAR(20) DEFAULT 'bekliyor', olusturma_tarihi TIMESTAMP DEFAULT NOW());
    INSERT INTO isletmeler (isim) VALUES ('Kemal');
    INSERT INTO hizmetler (isletme_id, isim) VALUES (1, 'Saç Kesimi');
    ${require('fs').readFileSync(path.join(SRC, 'migrations', '047_esnaf_ozellikleri.sql'), 'utf8').split('-- 3) Hafıza kartı')[0].split('-- 2) Bekleme listesi')[1].split('\n').slice(1).join('\n')}`);
  const giden = [];
  let bosSaatler = [];
  taklit('services/whatsappWeb', { getDurum: () => ({ durum: 'bagli' }), mesajGonder: async (id, tel, m) => { giden.push(tel); return { success: true }; } });
  taklit('services/randevu', { musaitSaatleriGetir: async () => bosSaatler });
  taklit('services/pushService', { sendToIsletme: async () => {} });
  const b = require(path.join(SRC, 'services', 'beklemeListesi'));
  const yarin = require(path.join(SRC, 'utils', 'tarih')).gunSonraTarih(1);

  assert.ok((await b.ekle({ isletmeId: 1, telefon: '905550000001', hizmetIds: [1], tarih: yarin })).eklendi);
  assert.ok((await b.ekle({ isletmeId: 1, telefon: '905550000001', hizmetIds: [1], tarih: yarin })).zatenVar, 'aynı gün tekrar kayıt yok');
  await b.ekle({ isletmeId: 1, telefon: '905550000002', hizmetIds: [1], tarih: yarin, kaynak: 'web' });

  // Boş yer yokken teklif gitmez
  await b.kontrol(); assert.equal(giden.length, 0);
  // Yer açıldı → yalnız ilk kişiye
  bosSaatler = ['16:00'];
  await b.kontrol(); await b.kontrol();
  assert.deepEqual(giden, ['905550000001'], 'aynı anda tek teklif');
  const bd = (await db.query("SELECT asama, secilen_saat FROM bot_durum WHERE musteri_telefon = '905550000001'")).rows[0];
  assert.deepEqual([bd.asama, bd.secilen_saat], ['bekleme_onay', '16:00'], 'evet derse bot randevuyu kurabilsin');

  // Hayır → sıradaki kişiye aynı saat
  await b.vazgecti(1, '905550000001');
  assert.deepEqual(giden, ['905550000001', '905550000002']);

  // 30 dk cevap yok → zaman aşımı, bot durumu sıfırlanır
  await db.query("UPDATE bekleme_listesi SET bildirim_zamani = NOW() - INTERVAL '31 minutes' WHERE durum = 'bildirildi'");
  await b.kontrol();
  const durumlar = (await db.query('SELECT musteri_telefon, durum FROM bekleme_listesi ORDER BY id')).rows.map(r => r.durum);
  assert.deepEqual(durumlar, ['vazgecti', 'zaman_asimi']);
  assert.equal((await db.query("SELECT asama FROM bot_durum WHERE musteri_telefon = '905550000002'")).rows[0].asama, 'ana_menu');
});

test('memnuniyet: otomatik anket cevabı Yorum Avcısı açıksa kayda geçer, kapalıysa eski mesaj', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, google_maps_link TEXT, yorum_mesaj_sablonu TEXT, yorum_avcisi_aktif BOOLEAN, paket TEXT);
    CREATE TABLE musteriler (id SERIAL PRIMARY KEY, isim TEXT);
    CREATE TABLE yorum_talepleri (id SERIAL PRIMARY KEY, isletme_id INT, randevu_id INT, musteri_id INT, telefon VARCHAR(20),
      gonderim_zamani TIMESTAMP, durum VARCHAR(20) DEFAULT 'bekliyor', gonderim_tarihi TIMESTAMP, olusturma_tarihi TIMESTAMP DEFAULT NOW(),
      puan SMALLINT, geri_bildirim TEXT, puan_zamani TIMESTAMPTZ, tg_chat_id VARCHAR(40), cozuldu BOOLEAN NOT NULL DEFAULT false);
    INSERT INTO isletmeler (isim, google_maps_link, yorum_avcisi_aktif, paket) VALUES ('Açık', 'https://g.page/r/a/review', true, 'profesyonel'), ('Kapalı', 'https://g.page/r/b/review', false, 'profesyonel');
    INSERT INTO musteriler (isim) VALUES ('Ali');`);
  const alarmlar = [];
  taklit('services/pushService', { sendToIsletme: async (id, p) => { alarmlar.push(p.title); } });
  taklit('services/socketServer', { emitToIsletme: () => {} });
  delete require.cache[require.resolve(path.join(SRC, 'services', 'memnuniyet'))];
  const m = require(path.join(SRC, 'services', 'memnuniyet'));
  assert.equal(await m.anketPuani({ isletmeId: 2, randevuId: 9, musteriId: 1, telefon: '905551', puan: 1 }), null, 'Yorum Avcısı kapalı');
  const cevapMetni = await m.anketPuani({ isletmeId: 1, randevuId: 7, musteriId: 1, telefon: '905551', puan: 2 });
  assert.match(cevapMetni, /üzüldük/); assert.equal(alarmlar.length, 1);
  // Müşterinin açıklaması cevapIsle ile yakalanır
  assert.match(await m.cevapIsle({ isletmeId: 1, telefon: '905551', metin: 'Bekletildim' }), /ilettik/);
  const k = (await db.query('SELECT puan, geri_bildirim FROM yorum_talepleri WHERE randevu_id = 7')).rows[0];
  assert.deepEqual([k.puan, k.geri_bildirim], [2, 'Bekletildim']);
});
