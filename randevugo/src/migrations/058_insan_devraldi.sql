-- İnsan devraldı (kullanıcı kararı 2026-10-17): Satış Bot numarasından telefonla elle yazılan sohbette bot susar
-- (varsayılan 24 saat, her elle mesajda süre yenilenir). Kayıt, kurulum ve yapay zekâ cevapları bu sürede gitmez.
ALTER TABLE satis_konusmalar ADD COLUMN IF NOT EXISTS insan_devraldi TIMESTAMP;
