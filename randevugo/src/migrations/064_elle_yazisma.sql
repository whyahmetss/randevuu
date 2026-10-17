-- Tanıdık algılama (2026-10-17): esnafın bir kişiye telefondan elle yazdığı günler (mesaj içeriği tutulmaz)
CREATE TABLE IF NOT EXISTS elle_yazisma (isletme_id INT NOT NULL, telefon VARCHAR(40) NOT NULL, gun DATE NOT NULL, PRIMARY KEY (isletme_id, telefon, gun));
