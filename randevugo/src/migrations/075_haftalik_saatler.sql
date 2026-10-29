-- Gün bazlı çalışma saati (2026-10-29): { "5": { "bas": "09:00", "bit": "23:00", "son": "22:00" } } — 0 = Pazar.
-- Boş gün genel saate (calisma_baslangic / calisma_bitis) düşer; kapalı günler kapali_gunler'de kalır.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS haftalik_saatler JSONB;
