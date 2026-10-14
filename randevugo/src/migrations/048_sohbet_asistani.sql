-- Sohbet asistanı (kullanıcı kararı 2026-10-14): numaralı menü yerine soru sorarak randevu.
-- bot_tarzi: 'sohbet' (varsayılan) | 'menu' (eski numaralı menü). Esnaf panelden değiştirebilir.
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS bot_tarzi VARCHAR(10) NOT NULL DEFAULT 'sohbet';
-- Asistanın son sorduğu şey: hizmet | usta | tarih | saat | onay (cevap ona göre yorumlanır)
ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS sohbet_bekleyen VARCHAR(12);
