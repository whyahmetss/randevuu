-- Prim Hesaplama: çalışana prim yüzdesi + prim ödemeleri tablosu
ALTER TABLE calisanlar ADD COLUMN IF NOT EXISTS prim_yuzdesi INTEGER DEFAULT 10;

CREATE TABLE IF NOT EXISTS prim_odemeleri (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  calisan_id INTEGER NOT NULL REFERENCES calisanlar(id) ON DELETE CASCADE,
  donem VARCHAR(7) NOT NULL,
  toplam_ciro DECIMAL(10,2) DEFAULT 0,
  prim_yuzdesi INTEGER DEFAULT 10,
  prim_tutari DECIMAL(10,2) DEFAULT 0,
  durum VARCHAR(20) DEFAULT 'bekliyor',
  odeme_tarihi TIMESTAMP,
  olusturma_tarihi TIMESTAMP DEFAULT NOW()
);
