// Kurulum sihirbazı (2026-10-08): kayıt olan esnaf adım adım canlıya geçsin; takılana SıraGO merkez
// WhatsApp numarasından 1., 3. ve 6. gün kısa bir yardım mesajı gitsin. Adımlar gerçek veriden okunur.
const pool = require('../config/db');

const PANEL = process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com';
const ADIMLAR = [
  { anahtar: 'hizmet', isim: 'Hizmetlerinizi ve fiyatlarınızı ekleyin', sayfa: 'hizmetler' },
  { anahtar: 'calisan', isim: 'Çalışanlarınızı ekleyin', sayfa: 'calisanlar' },
  { anahtar: 'bot', isim: "WhatsApp'ınızı bağlayın (QR)", sayfa: 'botbaglanti' },
  { anahtar: 'randevu', isim: 'İlk randevunuzu alın (linkinizi paylaşın)', sayfa: 'qrkod' },
];
const HATIRLATMA = {
  hizmet: "Merhaba, SıraGO hesabınız açık ama henüz hizmet eklenmemiş. Hizmet ve fiyatları girmeniz 2 dakika sürer, sonra müşterileriniz randevu alabilir:",
  calisan: 'Merhaba, SıraGO kurulumunuz neredeyse bitti. Sadece çalışanlarınızı (kendiniz dahil) eklemeniz kaldı:',
  bot: "Merhaba, SıraGO'da hizmetleriniz hazır. WhatsApp'ınızı QR ile bağlarsanız müşterileriniz size yazarak randevu alabilir. Takılırsanız bu mesaja cevap yazın, birlikte yapalım:",
  randevu: 'Merhaba, SıraGO hesabınız hazır! Randevu linkinizi WhatsApp durumunuza ve Instagram profilinize koyarsanız ilk randevular gelmeye başlar:',
};
const GUNLER = [1, 3, 6];

async function kurulumDurum(isletmeId) {
  const r = (await pool.query(`
    SELECT i.id, i.isim, i.slug, i.telefon, i.olusturma_tarihi, i.randevu_onay_modu,
      EXISTS (SELECT 1 FROM hizmetler h WHERE h.isletme_id = i.id) AS hizmet,
      EXISTS (SELECT 1 FROM calisanlar c WHERE c.isletme_id = i.id) AS calisan,
      EXISTS (SELECT 1 FROM wa_auth_keys w WHERE w.isletme_id = i.id) AS bot,
      EXISTS (SELECT 1 FROM randevular x WHERE x.isletme_id = i.id) AS randevu
    FROM isletmeler i WHERE i.id = $1`, [isletmeId])).rows[0];
  if (!r) return null;
  const adimlar = ADIMLAR.map(a => ({ ...a, tamam: !!r[a.anahtar] }));
  const tamam = adimlar.filter(a => a.tamam).length;
  return { adimlar, tamam, toplam: adimlar.length, bitti: tamam === adimlar.length, slug: r.slug, onay_modu: r.randevu_onay_modu || 'otomatik' };
}

// Saatlik çalışır; İstanbul saatiyle 11:00-19:59 arasında, eşiği geçmiş ve hâlâ eksik adımı olanlara bir kez yazar.
async function hatirlatmalariGonder({ gonder } = {}) {
  const saat = Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }));
  if (!gonder && (saat < 11 || saat >= 20)) return 0;
  const gonderFn = gonder || ((tel, m) => require('./merkezOtpBot').mesajGonder(tel, m));
  const adaylar = (await pool.query(`
    SELECT i.id, i.telefon, FLOOR(EXTRACT(EPOCH FROM (NOW() - i.olusturma_tarihi)) / 86400)::int AS gun
    FROM isletmeler i
    WHERE i.aktif = true AND i.demo IS NOT TRUE AND i.telefon ~ '^[0-9+]{10,16}$'
      AND i.olusturma_tarihi > NOW() - INTERVAL '8 days' AND i.olusturma_tarihi < NOW() - INTERVAL '1 day'`)).rows;
  let n = 0;
  for (const a of adaylar) {
    const esik = [...GUNLER].reverse().find(g => a.gun >= g);
    if (!esik) continue;
    const d = await kurulumDurum(a.id);
    const eksik = d?.adimlar.find(x => !x.tamam);
    if (!eksik) continue;
    // Önce kaydı al (aynı eşikte ikinci kez yazılmasın), sonra gönder
    const yeni = await pool.query(
      'INSERT INTO kurulum_hatirlatma (isletme_id, gun, adim) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING isletme_id',
      [a.id, esik, eksik.anahtar]);
    if (!yeni.rows.length) continue;
    const link = `${PANEL}/?sayfa=${eksik.sayfa}`;
    const sonuc = await gonderFn(a.telefon, `${HATIRLATMA[eksik.anahtar]}\n${link}`);
    if (sonuc?.success) {
      n++;
      await pool.query('UPDATE kurulum_hatirlatma SET gonderildi = true WHERE isletme_id = $1 AND gun = $2', [a.id, esik]);
    }
  }
  return n;
}

function baslat() {
  setInterval(() => hatirlatmalariGonder().catch(e => console.error('Kurulum hatırlatma hatası:', e.message)), 60 * 60 * 1000);
}

module.exports = { kurulumDurum, hatirlatmalariGonder, baslat, ADIMLAR };
