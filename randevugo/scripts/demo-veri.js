const { Pool } = require('pg');
try { require('dotenv').config(); } catch(e) {}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) { console.log('❌ DATABASE_URL yok!'); process.exit(1); }
console.log('🔗 DB bağlantısı kuruluyor...');
const pool = new Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });

// ── Türk isimleri ──
const erkekAdlari = ['Ahmet', 'Mehmet', 'Mustafa', 'Ali', 'Hüseyin', 'Hasan', 'İbrahim', 'Emre', 'Burak', 'Murat', 'Oğuz', 'Cem', 'Serkan', 'Tolga', 'Kaan', 'Deniz', 'Onur', 'Ufuk', 'Barış', 'Eren', 'Yusuf', 'Furkan', 'Can', 'Berk', 'Taner', 'Sinan', 'Volkan', 'Erdem', 'Kerem', 'Koray'];
const kadinAdlari = ['Ayşe', 'Fatma', 'Zeynep', 'Elif', 'Merve', 'Büşra', 'Esra', 'Selin', 'Derya', 'Gamze', 'Pınar', 'Ceren', 'İrem', 'Tuğba', 'Hande', 'Aslı', 'Özge', 'Nur', 'Ebru', 'Gizem', 'Damla', 'Melisa', 'Ece', 'Dila', 'Cansu', 'Burcu', 'Sibel', 'Buse', 'Yasemin', 'Defne'];
const soyadlar = ['Yılmaz', 'Kaya', 'Demir', 'Çelik', 'Şahin', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Koç', 'Kurt', 'Özkan', 'Aktaş', 'Polat', 'Korkmaz', 'Tekin', 'Erdoğan', 'Aksoy', 'Güneş'];

const rastgele = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rastgeleSayi = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const rastgeleTelefon = () => `+9053${rastgeleSayi(1,9)}${rastgeleSayi(1000000, 9999999)}`;

async function demoVeriBas() {
  console.log('🚀 Demo veri basılıyor...\n');

  // İşletmeyi bul
  const isletme = (await pool.query("SELECT id FROM isletmeler WHERE isim ILIKE '%Kuaför Hakan%' OR isim ILIKE '%kuafor%' ORDER BY id LIMIT 1")).rows[0];
  if (!isletme) {
    console.log('❌ İşletme bulunamadı! İsim kontrol et.');
    process.exit(1);
  }
  const isletmeId = isletme.id;
  console.log(`✅ İşletme ID: ${isletmeId}`);

  // Çalışanları al
  const calisanlar = (await pool.query('SELECT id, isim FROM calisanlar WHERE isletme_id=$1 AND aktif=true', [isletmeId])).rows;
  if (calisanlar.length === 0) {
    console.log('❌ Çalışan yok!');
    process.exit(1);
  }
  console.log(`✅ ${calisanlar.length} çalışan bulundu`);

  // Hizmetleri al
  const hizmetler = (await pool.query('SELECT id, isim, sure_dk, fiyat FROM hizmetler WHERE isletme_id=$1 AND aktif=true', [isletmeId])).rows;
  if (hizmetler.length === 0) {
    console.log('❌ Hizmet yok!');
    process.exit(1);
  }
  console.log(`✅ ${hizmetler.length} hizmet bulundu`);

  // ── 1) 80 Müşteri Ekle ──
  console.log('\n📋 Müşteriler ekleniyor...');
  const musteriIds = [];
  for (let i = 0; i < 80; i++) {
    const cinsiyet = Math.random() > 0.4 ? 'erkek' : 'kadin';
    const ad = cinsiyet === 'erkek' ? rastgele(erkekAdlari) : rastgele(kadinAdlari);
    const soyad = rastgele(soyadlar);
    const isim = `${ad} ${soyad}`;
    const telefon = rastgeleTelefon();
    const kayitTarihi = new Date();
    kayitTarihi.setDate(kayitTarihi.getDate() - rastgeleSayi(1, 90));

    try {
      const r = await pool.query(
        `INSERT INTO musteriler (telefon, isim) VALUES ($1, $2) ON CONFLICT (telefon) DO NOTHING RETURNING id`,
        [telefon, isim]
      );
      if (r.rows[0]) musteriIds.push(r.rows[0].id);
    } catch (e) {
      // Hata olursa geç
    }
  }
  console.log(`✅ ${musteriIds.length} müşteri eklendi`);

  // ── 2) Son 30 Gün İçin Randevular ──
  console.log('\n📅 Randevular ekleniyor...');
  const saatler = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30'];
  const durumlar = ['tamamlandi', 'tamamlandi', 'tamamlandi', 'tamamlandi', 'onaylandi', 'onaylandi', 'bekliyor', 'iptal'];
  let randevuSayisi = 0;

  for (let gun = -30; gun <= 7; gun++) {
    const tarih = new Date();
    tarih.setDate(tarih.getDate() + gun);
    const tarihStr = tarih.toISOString().slice(0, 10);
    const haftaGunu = tarih.getDay(); // 0=Pazar
    if (haftaGunu === 0) continue; // Pazar kapalı

    // Her gün 5-12 randevu
    const gunlukRandevu = rastgeleSayi(5, 12);
    const kullanilanSaatler = new Set();

    for (let r = 0; r < gunlukRandevu; r++) {
      let saat;
      let deneme = 0;
      do {
        saat = rastgele(saatler);
        deneme++;
      } while (kullanilanSaatler.has(saat) && deneme < 30);
      if (kullanilanSaatler.has(saat)) continue;
      kullanilanSaatler.add(saat);

      const calisan = rastgele(calisanlar);
      const hizmet = rastgele(hizmetler);
      const musteri = musteriIds.length > 0 ? rastgele(musteriIds) : null;
      // Geçmiş günler tamamlandı, gelecek günler bekliyor/onaylandı
      let durum;
      if (gun < 0) {
        durum = Math.random() > 0.1 ? 'tamamlandi' : 'iptal';
      } else if (gun === 0) {
        durum = rastgele(['onaylandi', 'tamamlandi', 'bekliyor']);
      } else {
        durum = rastgele(['onaylandi', 'bekliyor']);
      }

      try {
        // Bitiş saati hesapla
        const [sh, sm] = saat.split(':').map(Number);
        const bitisDk = sh * 60 + sm + hizmet.sure_dk;
        const bitisSaat = `${String(Math.floor(bitisDk / 60)).padStart(2,'0')}:${String(bitisDk % 60).padStart(2,'0')}`;

        await pool.query(
          `INSERT INTO randevular (isletme_id, calisan_id, hizmet_id, musteri_id, tarih, saat, bitis_saati, durum)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [isletmeId, calisan.id, hizmet.id, musteri, tarihStr, saat, bitisSaat, durum]
        );
        randevuSayisi++;
      } catch (e) {
        if (randevuSayisi === 0) console.log('❗ Randevu hatası:', e.message);
      }
    }
  }
  console.log(`✅ ${randevuSayisi} randevu eklendi`);

  // ── 3) İstatistik özeti ──
  const toplamMusteri = (await pool.query('SELECT COUNT(*) as c FROM musteriler')).rows[0].c;
  const toplamRandevu = (await pool.query('SELECT COUNT(*) as c FROM randevular WHERE isletme_id=$1', [isletmeId])).rows[0].c;
  const toplamGelir = (await pool.query("SELECT COALESCE(SUM(h.fiyat),0) as t FROM randevular r JOIN hizmetler h ON h.id=r.hizmet_id WHERE r.isletme_id=$1 AND r.durum='tamamlandi'", [isletmeId])).rows[0].t;
  const bugunRandevu = (await pool.query("SELECT COUNT(*) as c FROM randevular WHERE isletme_id=$1 AND tarih=CURRENT_DATE", [isletmeId])).rows[0].c;

  console.log(`\n🎉 Demo veri tamamlandı!`);
  console.log(`───────────────────────`);
  console.log(`👥 Toplam Müşteri: ${toplamMusteri}`);
  console.log(`📅 Toplam Randevu: ${toplamRandevu}`);
  console.log(`💰 Toplam Gelir: ${toplamGelir}₺`);
  console.log(`📌 Bugün Randevu: ${bugunRandevu}`);
  console.log(`───────────────────────`);

  await pool.end();
  process.exit(0);
}

demoVeriBas().catch(err => {
  console.error('❌ Hata:', err);
  process.exit(1);
});
