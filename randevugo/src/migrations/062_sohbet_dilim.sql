-- Sohbet asistanı (2026-10-17): "yarın akşam" denince dilim hizmet sorulduktan sonra da hatırlansın
ALTER TABLE bot_durum ADD COLUMN IF NOT EXISTS sohbet_dilim VARCHAR(6);
