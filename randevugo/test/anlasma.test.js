// Anlaşmalı hesap (2026-10-22, Elit Barber: video reklam karşılığı ücretsiz): ödeme kaydı açılmaz, ödeme kapısı geçilir,
// esnafın panelinde ödeme kartı yerine "iş birliği hesabı" çıkar; anlaşmayı yalnız patron verir.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('anlaşmalı hesap: 1 yıl ücretsiz, ödeme kaydı yok, ödeme kapısı geçer; bitirilince kapı kapanır', async () => {
  const { db } = await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, paket TEXT DEFAULT 'profesyonel', aktif BOOLEAN DEFAULT true, grup_id INT,
      olusturma_tarihi TIMESTAMP DEFAULT NOW(), deneme_bitis_tarihi TIMESTAMP, paket_bitis_tarihi TIMESTAMP);
    CREATE TABLE odemeler (id SERIAL PRIMARY KEY, isletme_id INT, donem TEXT, durum TEXT, tutar NUMERIC, olusturma_tarihi TIMESTAMP DEFAULT NOW());
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, hizmet_id INT, calisan_id INT, tarih DATE, durum TEXT);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, isim TEXT, fiyat NUMERIC); CREATE TABLE calisanlar (id SERIAL PRIMARY KEY, isim TEXT);
    CREATE TABLE randevu_hizmetleri (randevu_id INT, hizmet_id INT, fiyat NUMERIC);
    INSERT INTO isletmeler (isim, deneme_bitis_tarihi) VALUES ('Elit Barber', NOW() - INTERVAL '1 day');
    ${fs.readFileSync(path.join(SRC, 'migrations', '067_anlasma.sql'), 'utf8')}`);
  const admin = require(path.join(SRC, 'controllers', 'adminController'));
  const { odemeKontrol } = require(path.join(SRC, 'middleware', 'auth'));
  const cagir = async (fn, req) => { let c, kod = 200; await fn.call(admin, req, { json: (x) => { c = x; }, status(k) { kod = k; return this; } }); return { c, kod }; };
  const kapi = async () => { let gecti = false; await odemeKontrol({ kullanici: { rol: 'isletme', isletme_id: 1 } }, { status: () => ({ json: () => {} }) }, () => { gecti = true; }); return gecti; };

  assert.equal(await kapi(), false, 'deneme bitmiş, ödeme yok → kapı kapalı');
  const { c } = await cagir(admin.isletmeAnlasma, { params: { id: '1' }, body: { gun: 365, not: 'Video reklam karşılığı' } });
  assert.ok(c.anlasma_bitis, JSON.stringify(c));
  const i = (await db.query('SELECT * FROM isletmeler WHERE id = 1')).rows[0];
  assert.equal(i.anlasma_notu, 'Video reklam karşılığı');
  assert.ok(new Date(i.anlasma_bitis) - Date.now() > 364 * 864e5);
  assert.ok(new Date(i.deneme_bitis_tarihi) >= new Date(i.anlasma_bitis), 'ödeme kapısı ve hatırlatmalar için deneme de uzar');
  assert.equal(await kapi(), true);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM odemeler')).rows[0].n, 0, 'gelire hiçbir şey yazılmaz');

  const { c: dash } = await cagir(admin.dashboardEkstra, { kullanici: { isletme_id: 1 } });
  assert.equal(dash.paketDurumTipi, 'anlasma');
  assert.ok(dash.anlasma?.bitis);

  await cagir(admin.isletmeAnlasma, { params: { id: '1' }, body: { kaldir: true } });
  assert.equal((await db.query('SELECT anlasma_bitis FROM isletmeler WHERE id = 1')).rows[0].anlasma_bitis, null);
  assert.equal(await kapi(), false, 'anlaşma bitince ödeme yine istenir');
});

test('anlaşmalı hesap: yalnız patron verir', () => {
  const { yolYetkisi } = require(path.join(SRC, 'config', 'ekip'));
  assert.equal(yolYetkisi('POST', '/api/admin/isletmeler/52/anlasma'), 'patron');
  assert.equal(yolYetkisi('POST', '/api/admin/isletmeler/52/deneme-uzat'), 'isletmeler');
});
