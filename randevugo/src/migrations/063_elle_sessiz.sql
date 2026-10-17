-- Esnaf telefondan elle yazınca bot o kişiye susar (2026-10-17): bellek yeniden başlatmada siliniyordu, kalıcı olsun
CREATE TABLE IF NOT EXISTS elle_sessiz (isletme_id INT NOT NULL, jid VARCHAR(40) NOT NULL, bitis TIMESTAMP NOT NULL, PRIMARY KEY (isletme_id, jid));
