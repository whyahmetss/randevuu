-- Ödeme otomasyonu: her bitiş tarihi için her aşamada (3/1/0/-3 gün) tek WhatsApp hatırlatması
CREATE TABLE IF NOT EXISTS odeme_hatirlatma (
  isletme_id INTEGER NOT NULL,
  bitis DATE NOT NULL,
  asama INTEGER NOT NULL,
  gonderildi BOOLEAN DEFAULT false,
  olusturma_tarihi TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (isletme_id, bitis, asama)
);
