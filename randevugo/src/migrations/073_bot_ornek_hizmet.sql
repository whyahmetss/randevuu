-- Bot karşılamasındaki örnek hizmet (2026-10-27): masaj salonunda bot "yarın 3'te saç kesimi" diyordu.
-- Boşsa öne çıkan / ilk hizmetten, o da yoksa kategoriden seçilir; esnaf panelden kendisi yazabilir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bot_ornek_hizmet VARCHAR(60);

-- Çalışan unvanı (2026-10-27): masaj salonunda bot "usta" diyordu. Boşsa kategoriden (terapist, uzman, doktor…).
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS calisan_unvani VARCHAR(30);
