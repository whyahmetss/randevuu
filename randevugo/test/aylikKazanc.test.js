// Aylık kazanç özeti: manuel randevular sayılmaz, mesai dışı ve hatırlatma doğru sayılır, mesaj dürüst.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

test('aylık kazanç: sayımlar ve mesaj', async () => {
  await hazirla(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, aktif BOOLEAN DEFAULT true, calisma_baslangic TIME, calisma_bitis TIME, aylik_ozet_aktif BOOLEAN DEFAULT true);
    CREATE TABLE hizmetler (id SERIAL PRIMARY KEY, fiyat NUMERIC);
    CREATE TABLE randevular (id SERIAL PRIMARY KEY, isletme_id INT, hizmet_id INT, tarih DATE, durum TEXT, kaynak TEXT, hatirlatma_gonderildi BOOLEAN DEFAULT false, olusturma_tarihi TIMESTAMP);
    INSERT INTO isletmeler (isim, calisma_baslangic, calisma_bitis) VALUES ('Kemal', '09:00', '20:00');
    INSERT INTO hizmetler (fiyat) VALUES (300);
    -- olusturma UTC: 20:00 UTC = 23:00 İstanbul (mesai dışı), 08:00 UTC = 11:00 (mesai içi)
    INSERT INTO randevular (isletme_id, hizmet_id, tarih, durum, kaynak, hatirlatma_gonderildi, olusturma_tarihi) VALUES
      (1, 1, '2026-09-05', 'tamamlandi', 'bot', true, '2026-09-04 20:00'),
      (1, 1, '2026-09-06', 'tamamlandi', 'online', true, '2026-09-05 08:00'),
      (1, 1, '2026-09-07', 'gelmedi', 'bot', true, '2026-09-06 08:00'),
      (1, 1, '2026-09-08', 'iptal', 'bot', false, '2026-09-06 08:00'),
      (1, 1, '2026-09-09', 'tamamlandi', 'manuel', false, '2026-09-09 08:00'),
      (1, 1, '2026-10-01', 'tamamlandi', 'bot', false, '2026-09-30 08:00');`);
  const k = require(path.join(SRC, 'services', 'aylikKazanc'));
  const o = await k.hesapla(1, '2026-09');
  assert.equal(o.otomatik, 3);              // iptal ve manuel hariç
  assert.equal(o.otomatik_tutar, 600);      // gelmeyen ₺'ye katılmaz
  assert.equal(o.mesai_disi, 1);
  assert.equal(o.hatirlatilan, 3);
  assert.equal(o.hatirlatilan_gelen, 2);
  assert.equal(o.toplam, 4);
  assert.equal(o.ay_adi, 'Eylül 2026');
  const m = k.mesaj('Kemal', o);
  assert.match(m, /Sen uğraşmadan gelen randevu: \*3\*/);
  assert.match(m, /600₺/);
  assert.equal(k.mesaj('x', await k.hesapla(1, '2026-01')), null, 'boş ay mesaj atmaz');
});
