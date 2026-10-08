-- SıraGO Lite / Pro görünümü (kullanıcı kararı 2026-10-08). NULL = pakete göre otomatik:
-- Başlangıç ve Standart → Lite, Pro+ ve Kurumsal → Pro. Esnaf Ayarlar'dan değiştirebilir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS panel_modu VARCHAR(10);
