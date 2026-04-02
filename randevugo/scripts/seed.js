const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const seed = async () => {
  console.log('🌱 Demo veriler ekleniyor...\n');

  // Demo işletme: Berber Ali
  const [isletme] = (await pool.query(`
    INSERT INTO isletmeler (isim, telefon, whatsapp_no, adres, ilce, kategori, calisma_baslangic, calisma_bitis, randevu_suresi_dk, kapali_gunler)
    VALUES ('Berber Ali', '05551234567', '+905551234567', 'Bağcılar Caddesi No:42', 'Bağcılar', 'berber', '09:00', '20:00', 30, '0')
    RETURNING id
  `)).rows;

  console.log(`✅ İşletme oluşturuldu: Berber Ali (ID: ${isletme.id})`);

  // Çalışanlar
  await pool.query(`
    INSERT INTO calisanlar (isletme_id, isim, telefon, uzmanlik) VALUES
    ($1, 'Ali Usta', '05551234567', 'sac_kesimi,sakal,cilt_bakimi'),
    ($1, 'Mehmet', '05559876543', 'sac_kesimi,sakal')
  `, [isletme.id]);

  console.log('✅ Çalışanlar eklendi: Ali Usta, Mehmet');

  // Hizmetler
  await pool.query(`
    INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat) VALUES
    ($1, 'Saç Kesimi', 30, 150),
    ($1, 'Sakal Tıraşı', 20, 100),
    ($1, 'Saç + Sakal', 45, 200),
    ($1, 'Cilt Bakımı', 40, 250),
    ($1, 'Saç Yıkama + Şekillendirme', 25, 120)
  `, [isletme.id]);

  console.log('✅ Hizmetler eklendi');

  // İşletme admin kullanıcısı
  const sifre = await bcrypt.hash('berberali123', 10);
  await pool.query(`
    INSERT INTO admin_kullanicilar (email, sifre, isim, rol, isletme_id)
    VALUES ('ali@berberali.com', $1, 'Berber Ali', 'isletme', $2)
    ON CONFLICT (email) DO NOTHING
  `, [sifre, isletme.id]);

  console.log('✅ İşletme admin hesabı: ali@berberali.com / berberali123');

  // Demo müşteri
  await pool.query(`
    INSERT INTO musteriler (telefon, isim) VALUES
    ('05531112233', 'Ahmet Müşteri'),
    ('05532223344', 'Mehmet Müşteri')
    ON CONFLICT DO NOTHING
  `);

  console.log('✅ Demo müşteriler eklendi');

  console.log('\n🎉 Demo veriler hazır!\n');
  process.exit(0);
};

seed().catch(err => {
  console.error('❌ Seed hatası:', err);
  process.exit(1);
});
