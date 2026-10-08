// Venüs kişisel demo (kullanıcı kararı 2026-10-08): Avcı'nın bulduğu dükkan için hazır randevu sayfası.
// Esnafa "senin için sayfanı hazırladım" diye gönderilir; açınca Venüs'e haber düşer, aynı numarayla
// kayıt olursa demo onun gerçek hesabına dönüşür (satisBot _hesapOlustur).
// Fiyat uydurulmaz (0 → sayfada "fiyat dükkanda"); hizmetler kategoriye göre örnek isimlerdir.
const pool = require('../config/db');
const { DENEME_GUN } = require('../config/deneme');
const { telefonNormalize } = require('../utils/telefon');
const { randevuLinki } = require('../utils/randevuLinki');

const HIZMETLER = {
  berber: [['Saç Kesim', 30], ['Sakal Tıraşı', 20], ['Saç + Sakal', 45], ['Çocuk Tıraşı', 20]],
  'kuaför': [['Saç Kesim', 45], ['Fön', 30], ['Saç Boyama', 90], ['Röfle', 120]],
  'güzellik salonu': [['Manikür', 45], ['Pedikür', 60], ['Kaş Tasarım', 20], ['Cilt Bakımı', 60]],
  'tırnak salonu': [['Manikür', 45], ['Kalıcı Oje', 60], ['Protez Tırnak', 90]],
  'diş kliniği': [['Muayene', 30], ['Diş Taşı Temizliği', 45], ['Dolgu', 60]],
  veteriner: [['Muayene', 30], ['Aşı', 15], ['Tıraş & Bakım', 60]],
  diyetisyen: [['İlk Görüşme', 45], ['Kontrol', 30]],
  spa: [['Klasik Masaj', 60], ['Aromaterapi', 60], ['Hamam', 45]],
  'dövme': [['Tasarım Görüşmesi', 30], ['Küçük Dövme', 60], ['Büyük Dövme', 180]],
};
const KATEGORI_KOD = { berber: 'berber', 'kuaför': 'kuafor', 'güzellik salonu': 'guzellik', 'tırnak salonu': 'guzellik',
  'diş kliniği': 'disci', veteriner: 'veteriner', diyetisyen: 'diyetisyen', spa: 'spa', 'dövme': 'dovme' };

function mesajUret(isletmeAdi, link) {
  return `Merhaba, ${isletmeAdi} için 2 dakikada online randevu sayfanızı hazırladım: ${link}\n\n` +
    `Müşterileriniz telefon açmadan saat seçebilir. Bir göz atın, beğenirseniz ${DENEME_GUN} gün ücretsiz kullanın; ` +
    `hizmet ve fiyatları birlikte düzenleriz.`;
}

async function demoOlustur(leadId) {
  const lead = (await pool.query('SELECT * FROM potansiyel_musteriler WHERE id = $1', [parseInt(leadId)])).rows[0];
  if (!lead) { const e = new Error('Lead bulunamadı'); e.kod = 404; throw e; }

  // Aynı lead için ikinci kez demo açma: mevcut olanı döndür
  if (lead.demo_isletme_id) {
    const v = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [lead.demo_isletme_id])).rows[0];
    if (v) { const link = await randevuLinki(v); return { isletme: v, link, mesaj: mesajUret(v.isim, link), yeni: false }; }
  }

  const kategori = String(lead.kategori || '').toLocaleLowerCase('tr');
  const tel = telefonNormalize(lead.telefon) || null;
  const isletme = (await pool.query(
    `INSERT INTO isletmeler (isim, telefon, adres, ilce, kategori, aktif, paket, booking_acik, demo, demo_lead_id,
                             calisma_baslangic, calisma_bitis, olusturma_tarihi, deneme_bitis_tarihi)
     VALUES ($1, $2, $3, $4, $5, true, 'baslangic', true, true, $6, '09:00', '20:00', NOW(), NOW() + make_interval(days => $7))
     RETURNING *`,
    [lead.isletme_adi, tel, lead.adres || null, lead.ilce || null, KATEGORI_KOD[kategori] || 'genel', lead.id, DENEME_GUN])).rows[0];
  await pool.query("INSERT INTO calisanlar (isletme_id, isim, uzmanlik, aktif) VALUES ($1, 'Usta', '', true)", [isletme.id]);
  for (const [isim, sure] of (HIZMETLER[kategori] || [['Randevu', 30], ['Uzun Randevu', 60]])) {
    await pool.query('INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES ($1, $2, $3, 0, true)', [isletme.id, isim, sure]);
  }
  await pool.query('UPDATE potansiyel_musteriler SET demo_isletme_id = $1 WHERE id = $2', [isletme.id, lead.id]);
  const link = await randevuLinki(isletme);
  return { isletme, link, mesaj: mesajUret(isletme.isim, link), yeni: true };
}

// Demo sayfası açıldı (randevu sayfası her yüklendiğinde) — kişisel veri tutmaz, yalnız sayaç
function demoGoruntulendi(isletmeId) {
  pool.query('UPDATE isletmeler SET demo_goruntulenme = COALESCE(demo_goruntulenme, 0) + 1, demo_son_goruntulenme = NOW() WHERE id = $1 AND demo = true',
    [isletmeId]).catch(() => {});
}

module.exports = { demoOlustur, demoGoruntulendi, mesajUret };
