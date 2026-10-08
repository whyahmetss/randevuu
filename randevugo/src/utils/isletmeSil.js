// İşletmeyi tüm verileriyle silmek. Sabit tablo listesi yerine veritabanının kendi yabancı anahtar
// kayıtlarını okur: hangi tablo işletmeye (ve onun randevularına, hizmetlerine…) bağlıysa önce onları
// temizler. Ortak kayıtlarda (ör. musteriler.son_gelinen_isletme_id) satırı silmez, bağlantıyı NULL yapar.
// Tek transaction: bir adım hata verirse hiçbir şey yarım silinmez ve hata çağırana döner.

const q = (ad) => '"' + String(ad).replace(/"/g, '""') + '"';

async function isletmeTamSil(pool, isletmeId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const fk = (await client.query(`
      SELECT cl.relname AS tablo, a.attname AS kolon, hcl.relname AS hedef, ha.attname AS hedef_kolon, a.attnotnull AS zorunlu
      FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      JOIN pg_class hcl ON hcl.oid = c.confrelid
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      JOIN pg_attribute ha ON ha.attrelid = c.confrelid AND ha.attnum = c.confkey[1]
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`)).rows;

    // tablo içindeki (kosul) satırlarına bağlı her şeyi temizle; yol: döngü koruması
    const altlariTemizle = async (tablo, kosul, yol) => {
      if (yol.length > 6) return;
      for (const f of fk.filter(x => x.hedef === tablo)) {
        const altKosul = `${q(f.kolon)} IN (SELECT ${q(f.hedef_kolon)} FROM ${q(tablo)} WHERE ${kosul})`;
        if (yol.includes(f.tablo)) {                       // döngü: yalnız bağlantıyı kopar
          if (!f.zorunlu) await client.query(`UPDATE ${q(f.tablo)} SET ${q(f.kolon)} = NULL WHERE ${altKosul}`, [isletmeId]);
          continue;
        }
        // Ortak kayıt (işletmeye ait değil, yalnız işaret ediyor): bağlantıyı boşalt
        if (!f.zorunlu && f.kolon !== 'isletme_id') {
          await client.query(`UPDATE ${q(f.tablo)} SET ${q(f.kolon)} = NULL WHERE ${altKosul}`, [isletmeId]);
          continue;
        }
        await altlariTemizle(f.tablo, altKosul, [...yol, f.tablo]);
        await client.query(`DELETE FROM ${q(f.tablo)} WHERE ${altKosul}`, [isletmeId]);
      }
    };

    // Yabancı anahtarı olmayan ama isletme_id kolonu taşıyan tablolar (eski tablolar)
    const kolonlu = (await client.query(
      "SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'isletme_id' AND table_name <> 'isletmeler'"
    )).rows.map(r => r.table_name);
    const fkli = new Set(fk.filter(x => x.hedef === 'isletmeler').map(x => x.tablo));
    for (const t of kolonlu.filter(t => !fkli.has(t))) {
      await altlariTemizle(t, 'isletme_id = $1', ['isletmeler', t]);
      await client.query(`DELETE FROM ${q(t)} WHERE isletme_id = $1`, [isletmeId]);
    }
    // referanslar.sahip_isletme_id gibi FK'siz özel kolonlar
    await client.query('SAVEPOINT ref');
    try { await client.query('DELETE FROM referanslar WHERE sahip_isletme_id = $1', [isletmeId]); }
    catch (e) { await client.query('ROLLBACK TO SAVEPOINT ref'); }

    await altlariTemizle('isletmeler', 'id = $1', ['isletmeler']);
    const r = await client.query('DELETE FROM isletmeler WHERE id = $1', [isletmeId]);
    await client.query('COMMIT');
    return r.rowCount;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { isletmeTamSil };
