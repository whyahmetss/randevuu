-- ═══════════════════════════════════════════════════
-- Migration 002: İşletme Gelişmiş Ayarları + Kara Liste
-- ═══════════════════════════════════════════════════

-- İşletme ayar kolonları
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bot_konusma_stili VARCHAR(20) DEFAULT 'samimi';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS randevu_modu VARCHAR(20) DEFAULT 'sirali';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS hatirlatma_saat INTEGER DEFAULT 1;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS calisan_secim_modu VARCHAR(20) DEFAULT 'musteri';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS randevu_onay_modu VARCHAR(20) DEFAULT 'otomatik';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS onay_timeout_dk INTEGER DEFAULT 30;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS iptal_sinir_saat INTEGER DEFAULT 2;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS mesai_disi_mod VARCHAR(20) DEFAULT 'kapali_mesaj';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS mesai_disi_mesaj TEXT;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bot_diller VARCHAR(100) DEFAULT 'tr';
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kara_liste_otomatik BOOLEAN DEFAULT false;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS kara_liste_ihlal_sinir INTEGER DEFAULT 3;

-- Kara liste tablosu
CREATE TABLE IF NOT EXISTS kara_liste (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER REFERENCES isletmeler(id) ON DELETE CASCADE,
  telefon VARCHAR(50) NOT NULL,
  sebep VARCHAR(50) DEFAULT 'manuel',
  ihlal_sayisi INTEGER DEFAULT 1,
  aktif BOOLEAN DEFAULT true,
  olusturma_tarihi TIMESTAMP DEFAULT NOW(),
  UNIQUE(isletme_id, telefon)
);

-- randevular tablosuna olusturma_tarihi (onay timeout için gerekli)
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS olusturma_tarihi TIMESTAMP DEFAULT NOW();

-- bot_durum tablosuna dil kolonu
ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS dil VARCHAR(10) DEFAULT 'tr';
