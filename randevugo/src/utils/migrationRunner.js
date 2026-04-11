const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function calistir() {
  try {
    // schema_migrations tablosunu oluştur (yoksa)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        dosya VARCHAR(200) UNIQUE NOT NULL,
        uygulama_tarihi TIMESTAMP DEFAULT NOW()
      )
    `);

    // migrations klasöründeki .sql dosyalarını sıralı oku
    const migrationsDir = path.join(__dirname, '..', 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('📁 migrations klasörü bulunamadı, atlanıyor.');
      return;
    }

    const dosyalar = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (dosyalar.length === 0) {
      console.log('📁 Migration dosyası yok, atlanıyor.');
      return;
    }

    // Hangileri zaten çalıştırılmış?
    const calistirilmis = (await pool.query('SELECT dosya FROM schema_migrations')).rows.map(r => r.dosya);

    let yeniSayisi = 0;
    for (const dosya of dosyalar) {
      if (calistirilmis.includes(dosya)) continue;

      const sql = fs.readFileSync(path.join(migrationsDir, dosya), 'utf8');
      console.log(`🔄 Migration çalıştırılıyor: ${dosya}`);

      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (dosya) VALUES ($1)', [dosya]);

      console.log(`✅ Migration tamamlandı: ${dosya}`);
      yeniSayisi++;
    }

    if (yeniSayisi > 0) {
      console.log(`✅ ${yeniSayisi} yeni migration uygulandı.`);
    } else {
      console.log('✅ Tüm migration\'lar güncel.');
    }
  } catch (e) {
    console.error('❌ Migration hatası:', e.message);
  }
}

module.exports = { calistir };
