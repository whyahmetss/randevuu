-- ═══════════════════════════════════════════════════
-- Migration 003: Abonelik Sistemi + Referans Koruma
-- ═══════════════════════════════════════════════════

-- Paket bitiş tarihi (hibrit model — mevcut donem sistemi korunur)
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS paket_bitis_tarihi TIMESTAMP;

-- Referans suistimal koruması: ödül sadece ilk ödemede verilsin
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS referans_odeme_tetiklendi BOOLEAN DEFAULT false;
