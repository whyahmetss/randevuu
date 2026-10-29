// Mini site: hakkımızda, Instagram, galeri (limit, sıra, başka işletmenin fotoğrafı), ekip kartı, herkese açık görseller.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const cevap = () => { const r = { kod: 200, basliklar: {} }; r.status = (k) => { r.kod = k; return r; }; r.json = (v) => { r.veri = v; return r; };
  r.set = (k, v) => { r.basliklar[k] = v; return r; }; r.send = (b) => { r.govde = b; return r; }; r.end = () => r; return r; };
const foto = (m) => 'data:image/jpeg;base64,' + Buffer.from(m).toString('base64');

test('mini site: hakkımızda, Instagram, galeri, ekip', async () => {
  const { db } = await hazirla(`CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, aktif BOOLEAN DEFAULT true);
    CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isletme_id INT, isim TEXT, aktif BOOLEAN DEFAULT true);
    INSERT INTO isletmeler (isim, slug) VALUES ('Kemal', 'kemal'), ('Başka', 'baska');
    INSERT INTO calisanlar (isletme_id, isim) VALUES (1, 'Mehmet'), (2, 'Yabancı'), (1, 'Eski');
    UPDATE calisanlar SET aktif = false WHERE isim = 'Eski';
    ${fs.readFileSync(path.join(SRC, 'migrations', '038_randevu_sayfasi.sql'), 'utf8')}
    ${fs.readFileSync(path.join(SRC, 'migrations', '046_mini_site.sql'), 'utf8')}
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY); CREATE TABLE randevular (id SERIAL PRIMARY KEY);
    ${fs.readFileSync(path.join(SRC, 'migrations', '080_ilk_randevu_indirimi.sql'), 'utf8')}`);
  const s = require(path.join(SRC, 'controllers', 'sayfaController'));
  const req = (body, params = {}, isletme = 1) => ({ kullanici: { isletme_id: isletme }, body, params });

  // Hakkımızda + Instagram (adres, @ ve düz ad kabul; geçersiz ad reddedilir)
  let r = cevap(); await s.kaydet(req({ hakkimizda: '  2015ten beri Kadıköy\'de.  ', instagram: 'https://www.instagram.com/kemal.berber/?hl=tr' }), r);
  assert.equal(r.veri.hakkimizda, '2015ten beri Kadıköy\'de.'); assert.equal(r.veri.instagram, 'kemal.berber');
  r = cevap(); await s.kaydet(req({ instagram: '@kemal_berber' }), r); assert.equal(r.veri.instagram, 'kemal_berber');
  r = cevap(); await s.kaydet(req({ instagram: 'kemal berber!' }), r); assert.equal(r.kod, 400);
  r = cevap(); await s.kaydet(req({ instagram: '' }), r); assert.equal(r.veri.instagram, '');

  // Galeri: geçersiz görsel reddedilir, 12 sınırı, sıra değişir, başka işletme silemez
  r = cevap(); await s.galeriEkle(req({ veri: 'data:text/html;base64,PHNjcmlwdD4=' }), r); assert.equal(r.kod, 400);
  for (let i = 1; i <= 12; i++) { r = cevap(); await s.galeriEkle(req({ veri: foto('f' + i), aciklama: 'foto ' + i }), r); assert.equal(r.kod, 200); }
  r = cevap(); await s.galeriEkle(req({ veri: foto('f13') }), r); assert.equal(r.kod, 400, '12 fotoğraf sınırı');
  const ilk = r.kod && (await s.galeriListe(1));
  assert.equal(ilk.length, 12); assert.equal(ilk[0].aciklama, 'foto 1');
  r = cevap(); await s.galeriGuncelle(req({ yon: 1 }, { id: ilk[0].id }), r);
  assert.deepEqual(r.veri.galeri.slice(0, 2).map(g => g.aciklama), ['foto 2', 'foto 1'], 'sağa kaydırma');
  r = cevap(); await s.galeriSil(req({}, { id: ilk[0].id }, 2), r);
  assert.equal((await s.galeriListe(1)).length, 12, 'başka işletme silemez');
  r = cevap(); await s.galeriSil(req({}, { id: ilk[0].id }), r); assert.equal(r.veri.galeri.length, 11);

  // Herkese açık galeri görseli: doğru slug ile gelir, başka slug ile gelmez
  const g = (await s.galeriListe(1))[0];
  r = cevap(); await s.galeriGorsel({ params: { slug: 'kemal', id: g.id } }, r); assert.equal(String(r.govde), 'f2');
  r = cevap(); await s.galeriGorsel({ params: { slug: 'baska', id: g.id } }, r); assert.equal(r.govde, undefined);

  // Ekip kartı: uzmanlık + fotoğraf; başka işletmenin çalışanı düzenlenemez; pasif çalışan listede yok
  r = cevap(); await s.ekipKaydet(req({ uzmanlik: 'Sakal ve ustura tıraşı', foto: foto('mehmet') }, { id: 1 }), r);
  assert.equal(r.veri.ekip.length, 1, 'pasif çalışan gizli');
  assert.equal(r.veri.ekip[0].uzmanlik, 'Sakal ve ustura tıraşı'); assert.ok(r.veri.ekip[0].foto_v);
  r = cevap(); await s.ekipKaydet(req({ uzmanlik: 'x' }, { id: 2 }), r); assert.equal(r.kod, 404, 'başka işletmenin çalışanı');
  r = cevap(); await s.ekipGorsel({ params: { slug: 'kemal', id: 1 } }, r); assert.equal(String(r.govde), 'mehmet');
  r = cevap(); await s.ekipGorsel({ params: { slug: 'baska', id: 1 } }, r); assert.equal(r.govde, undefined);
  r = cevap(); await s.ekipKaydet(req({ foto: null }, { id: 1 }), r); assert.equal(r.veri.ekip[0].foto_v, null);

  // Panel verisi galeri ve ekibi içerir
  r = cevap(); await s.getir(req({}), r);
  assert.equal(r.veri.galeri.length, 11); assert.equal(r.veri.ekip[0].isim, 'Mehmet'); assert.equal(r.veri.galeri_limit, 12);

  // İşletme silinince galeri ve ekip fotoğrafları da silinir
  await s.ekipKaydet(req({ foto: foto('m2') }, { id: 1 }), cevap());
  await db.query('DELETE FROM isletmeler WHERE id = 1');
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM sayfa_galeri')).rows[0].n, 0);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM calisan_gorselleri')).rows[0].n, 0);
});
