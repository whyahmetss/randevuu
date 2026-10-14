-- Esnaf özellikleri (kullanıcı kararı 2026-10-14): memnuniyet anketi, bekleme listesi, işlem notu (hafıza kartı),
-- seans takibi, sesli mesaj, sekreter modu.

-- 1) Memnuniyet: Yorum Avcısı önce 1–5 puan sorar; düşük puanda esnafa alarm. Google linki puandan bağımsız herkese gider.
ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS puan SMALLINT;
ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS geri_bildirim TEXT;
ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS puan_zamani TIMESTAMPTZ;
ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS tg_chat_id VARCHAR(40);
ALTER TABLE yorum_talepleri ADD COLUMN IF NOT EXISTS cozuldu BOOLEAN NOT NULL DEFAULT false;

-- 2) Bekleme listesi: randevu sayfasından da eklenir; bildirilen saat ve 30 dk zaman aşımı
ALTER TABLE bekleme_listesi ALTER COLUMN musteri_telefon TYPE VARCHAR(50);
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS musteri_isim VARCHAR(80);
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirilen_saat VARCHAR(5);
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS kaynak VARCHAR(12) DEFAULT 'bot';
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS hizmet_ids INTEGER[];   -- randevu sayfasında birden çok hizmet seçilebilir
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_zamani TIMESTAMPTZ;
ALTER TABLE bekleme_listesi ADD COLUMN IF NOT EXISTS bildirim_sayisi INT DEFAULT 0;
CREATE INDEX IF NOT EXISTS bekleme_listesi_tarih ON bekleme_listesi (isletme_id, istenen_tarih, durum);

-- 3) Hafıza kartı: randevuya işlem notu + fotoğraf (fotoğraf ayrı tabloda; randevular'ı okuyan sorgular şişmesin)
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS islem_notu TEXT;
CREATE TABLE IF NOT EXISTS randevu_fotolari (
  randevu_id INTEGER PRIMARY KEY REFERENCES randevular(id) ON DELETE CASCADE,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  veri TEXT NOT NULL,
  guncelleme TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4) Seans takibi: hizmete "toplam seans + aralık"; müşteri başına ilerleme
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS seans_sayisi SMALLINT;
ALTER TABLE hizmetler ADD COLUMN IF NOT EXISTS seans_aralik_gun SMALLINT;
CREATE TABLE IF NOT EXISTS musteri_seanslari (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  musteri_id INTEGER NOT NULL REFERENCES musteriler(id) ON DELETE CASCADE,
  hizmet_id INTEGER REFERENCES hizmetler(id) ON DELETE SET NULL,
  toplam SMALLINT NOT NULL,
  tamamlanan SMALLINT NOT NULL DEFAULT 0,
  aralik_gun SMALLINT NOT NULL DEFAULT 30,
  son_seans_tarihi DATE,
  sonraki_hatirlatma DATE,
  hatirlatma_sayisi SMALLINT NOT NULL DEFAULT 0,
  durum VARCHAR(10) NOT NULL DEFAULT 'aktif',      -- aktif | bitti | iptal
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS musteri_seanslari_musteri ON musteri_seanslari (isletme_id, musteri_id, durum);
CREATE INDEX IF NOT EXISTS musteri_seanslari_hatirlatma ON musteri_seanslari (durum, sonraki_hatirlatma);
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS seans_id INTEGER;
ALTER TABLE randevular ADD COLUMN IF NOT EXISTS seans_no SMALLINT;

-- 5) Sekreter modu: esnaf WhatsApp'tan saat kapatır. Tarihe özel kapalı aralıklar (molalardan farklı, tek seferlik).
CREATE TABLE IF NOT EXISTS takvim_bloklari (
  id SERIAL PRIMARY KEY,
  isletme_id INTEGER NOT NULL REFERENCES isletmeler(id) ON DELETE CASCADE,
  calisan_id INTEGER,
  tarih DATE NOT NULL,
  baslangic VARCHAR(5) NOT NULL,
  bitis VARCHAR(5) NOT NULL,
  aciklama VARCHAR(120),
  kaynak VARCHAR(12) NOT NULL DEFAULT 'panel',
  olusturma TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS takvim_bloklari_tarih ON takvim_bloklari (isletme_id, tarih);
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sekreter_aktif BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS sesli_mesaj_aktif BOOLEAN NOT NULL DEFAULT true;
