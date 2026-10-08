-- Kurulum sihirbazı: takılan esnafa otomatik hatırlatma (her işletmeye her gün eşiğinde bir kez)
CREATE TABLE IF NOT EXISTS kurulum_hatirlatma (
  isletme_id INTEGER NOT NULL,
  gun INTEGER NOT NULL,
  adim VARCHAR(30),
  gonderildi BOOLEAN DEFAULT false,
  olusturma_tarihi TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (isletme_id, gun)
);
