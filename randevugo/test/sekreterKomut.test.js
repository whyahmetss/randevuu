// Sekreter modu: esnafın doğal cümleleri komuta çevrilir; tanınmayan cümle null (bot karışmaz).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { komutCoz } = require(path.join(__dirname, '..', 'src', 'utils', 'sekreterKomut'));

const bugun = '2026-10-14';   // Çarşamba
const hizmetler = [{ id: 1, isim: 'Saç Kesimi' }, { id: 2, isim: 'Sakal Tıraşı' }, { id: 3, isim: 'Saç + Sakal' }, { id: 4, isim: 'Boya' }];
const coz = (m) => komutCoz(m, { bugun, hizmetler });

test('sekreter: liste', () => {
  assert.deepEqual(coz('Bugün kimler var?'), { tip: 'liste', tarih: '2026-10-14' });
  assert.deepEqual(coz('fiko yarın program ne'), { tip: 'liste', tarih: '2026-10-15' });
  assert.deepEqual(coz('cuma randevuları'), { tip: 'liste', tarih: '2026-10-16' });
  assert.deepEqual(coz('çarşamba kim var'), { tip: 'liste', tarih: '2026-10-14' }, 'gün adı bugünse bugün');
  assert.deepEqual(coz('20.10 liste'), { tip: 'liste', tarih: '2026-10-20' });
});

test('sekreter: kapat / aç', () => {
  assert.deepEqual(coz('Fiko bugün 14:00 ile 16:00 arasını kapat, dışarı çıkacağım'), { tip: 'kapat', tarih: bugun, bas: '14:00', bit: '16:00' });
  assert.deepEqual(coz('yarın 2-4 arası müsait değilim'), { tip: 'kapat', tarih: '2026-10-15', bas: '14:00', bit: '16:00' }, '2-4 öğleden sonra');
  assert.deepEqual(coz('14.30-16 kapat'), { tip: 'kapat', tarih: bugun, bas: '14:30', bit: '16:00' });
  assert.deepEqual(coz('cumartesi kapalıyım'), { tip: 'kapat', tarih: '2026-10-17', bas: null, bit: null }, 'bütün gün');
  assert.deepEqual(coz('yarın 14-16 aç'), { tip: 'ac', tarih: '2026-10-15', bas: '14:00', bit: '16:00' });
  assert.deepEqual(coz('kapatmayı kaldır'), { tip: 'ac', tarih: bugun, bas: null, bit: null });
});

test('sekreter: randevu yaz', () => {
  let k = coz("Ahmet'e yarın 15:00'e saç kesimi yaz");
  assert.deepEqual([k.tip, k.tarih, k.saat, k.isim, k.hizmetId, k.telefon], ['yaz', '2026-10-15', '15:00', 'Ahmet', 1, null]);
  k = coz('yarın 3te Mehmet Yılmaz saç sakal yaz');
  assert.deepEqual([k.saat, k.isim, k.hizmetId], ['15:00', 'Mehmet Yılmaz', 3], '"saç sakal" → Saç + Sakal');
  k = coz('Ayşe 0532 111 22 33 cuma 11:30 boya ekle');
  assert.deepEqual([k.tarih, k.saat, k.isim, k.telefon, k.hizmetId], ['2026-10-16', '11:30', 'Ayşe', '05321112233', 4]);
  k = coz("Can Bey'e bugün 17.00 sakal tıraşı kaydet");
  assert.deepEqual([k.saat, k.isim, k.hizmetId], ['17:00', 'Can', 2]);
  assert.deepEqual(coz('Ahmet saç kesimi yaz'), { tip: 'yaz_eksik', eksik: 'saat' });
});

test('sekreter: diğer ve tanınmayan', () => {
  assert.deepEqual(coz('son randevuyu sil'), { tip: 'sil_son' });
  assert.deepEqual(coz('geri al'), { tip: 'sil_son' });
  assert.deepEqual(coz('yardım'), { tip: 'yardim' });
  for (const m of ['merhaba', 'süt al eve', 'yarın 3te randevum var mı acaba yer', 'Teşekkürler']) assert.equal(coz(m), null, m);
});
