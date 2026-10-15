// Esnaf teşviki (kullanıcı kararı 2026-10-15): doğru anda tek mesaj, SıraGO Merkez numarasından.
// 1) İlk otomatik randevu (bot ya da randevu sayfası) gelince tebrik + "linkini paylaş": sistemin çalıştığını görsün.
// 2) 10. otomatik randevuda davet isteği: en memnun olduğu an "çevrende randevuyu telefonla alan esnaf var mı?".
// Yalnız eşiği son 3 günde geçen işletmeye gider (eski işletmelere toplu mesaj yok). Her mesaj işletme başına bir
// kez; gönderilemezse (Merkez numarası bağlı değil) sonraki turda yeniden denenir. Gece yazılmaz (10:00-20:59).
const pool = require('../config/db');

const OTOMATIK = ['bot', 'online', 'web'];   // elle girilen (manuel) ve sekreter randevusu sayılmaz
const PENCERE_GUN = 3;
const DAVET_ESIK = 10;
const ANA_SUBE = '(i.grup_id IS NULL OR i.id = (SELECT MIN(m.id) FROM isletmeler m WHERE m.grup_id = i.grup_id))';

const istanbulSaat = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false })) % 24;
const gunSaat = (tarih, saat) => {
  const t = String(tarih || '').slice(0, 10);
  const g = t ? new Date(`${t}T12:00:00`).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }) : '';
  return `${g}${saat ? ` ${String(saat).slice(0, 5)}` : ''}`.trim();
};

// Son 3 günde otomatik randevu alan ve hiç daha eski otomatik randevusu olmayan (yani ilki yeni gelen) işletmeler
async function ilkRandevuAdaylari() {
  return (await pool.query(`
    SELECT i.id, i.isim, i.telefon, i.slug FROM isletmeler i
    WHERE i.id IN (SELECT DISTINCT r.isletme_id FROM randevular r WHERE r.kaynak = ANY($1) AND r.olusturma_tarihi > NOW() - make_interval(days => $2))
      AND i.aktif = true AND i.demo IS NOT TRUE AND i.ilk_randevu_tebrik IS NULL AND ${ANA_SUBE}
      AND NOT EXISTS (SELECT 1 FROM randevular r WHERE r.isletme_id = i.id AND r.kaynak = ANY($1) AND r.olusturma_tarihi <= NOW() - make_interval(days => $2))`,
    [OTOMATIK, PENCERE_GUN])).rows;
}

// 10. otomatik randevusu son 3 günde gelen işletmeler
async function davetAdaylari() {
  return (await pool.query(`
    SELECT i.id, i.isim, i.telefon FROM isletmeler i
    WHERE i.id IN (SELECT DISTINCT r.isletme_id FROM randevular r WHERE r.kaynak = ANY($1) AND r.olusturma_tarihi > NOW() - make_interval(days => $2))
      AND i.aktif = true AND i.demo IS NOT TRUE AND i.referans_tesvik IS NULL AND ${ANA_SUBE}
      AND (SELECT r.olusturma_tarihi FROM randevular r WHERE r.isletme_id = i.id AND r.kaynak = ANY($1)
           ORDER BY r.olusturma_tarihi, r.id OFFSET ($3::int - 1) LIMIT 1) > NOW() - make_interval(days => $2)`,
    [OTOMATIK, PENCERE_GUN, DAVET_ESIK])).rows;
}

async function ilkRandevuMesaji(i) {
  const r = (await pool.query(`
    SELECT to_char(r.tarih, 'YYYY-MM-DD') AS tarih, to_char(r.saat, 'HH24:MI') AS saat, m.isim AS musteri
    FROM randevular r LEFT JOIN musteriler m ON m.id = r.musteri_id
    WHERE r.isletme_id = $1 AND r.kaynak = ANY($2) ORDER BY r.olusturma_tarihi, r.id LIMIT 1`, [i.id, OTOMATIK]).catch(() => ({ rows: [] }))).rows[0];
  const link = await require('../utils/randevuLinki').randevuLinki(i).catch(() => null);
  return `🎉 Tebrikler! SıraGO ilk randevunuzu sizin yerinize aldı` +
    (r ? `: ${r.musteri ? `*${r.musteri}*, ` : ''}${gunSaat(r.tarih, r.saat)}` : '') + `.\n\n` +
    `Daha çok randevu için linkinizi WhatsApp durumunuza ve Instagram profilinize koyun:` + (link ? `\n${link}` : ' panelde *Randevu linkim*.');
}

async function davetMesaji(i) {
  const { davetKodu, davetLinki } = require('../utils/davet');
  const link = davetLinki(await davetKodu(i.id), 'davet');
  return `🙌 SıraGO size ${DAVET_ESIK} randevuyu otomatik aldı, telefonla uğraşmadınız!\n\n` +
    `Çevrenizde randevuyu hâlâ telefonla alan bir esnaf var mı? Bu linki ona gönderin:\n${link}\n\n` +
    `O ilk ödemesini yapınca sizin paketinize *1 ay bedava* eklenir 🎁`;
}

// Bir tur: gönderilenlerin sayısı. gonder(isletme, metin) → { gitti } (varsayılan Merkez numarası)
async function turCalistir({ gonder, saatKontrol = true } = {}) {
  if (saatKontrol) { const s = istanbulSaat(); if (s < 10 || s >= 21) return { tebrik: 0, davet: 0 }; }
  const yolla = gonder || ((i, m) => require('../utils/esnafaYaz').esnafaYaz(i, m));
  let tebrik = 0, davet = 0;
  for (const i of await ilkRandevuAdaylari()) {
    try {
      if ((await yolla(i, await ilkRandevuMesaji(i)))?.gitti) {
        await pool.query('UPDATE isletmeler SET ilk_randevu_tebrik = NOW() WHERE id = $1', [i.id]);
        tebrik++;
      }
    } catch (e) { console.error(`İlk randevu tebriği (#${i.id}):`, e.message); }
  }
  for (const i of await davetAdaylari()) {
    try {
      if ((await yolla(i, await davetMesaji(i)))?.gitti) {
        await pool.query('UPDATE isletmeler SET referans_tesvik = NOW() WHERE id = $1', [i.id]);
        davet++;
      }
    } catch (e) { console.error(`Davet isteği (#${i.id}):`, e.message); }
  }
  if (tebrik || davet) console.log(`🎁 Esnaf teşviki: ${tebrik} ilk randevu tebriği, ${davet} davet isteği`);
  return { tebrik, davet };
}

function baslat() {
  setInterval(() => turCalistir().catch(e => console.error('Esnaf teşviki:', e.message)), 15 * 60 * 1000);
}

module.exports = { turCalistir, baslat, ilkRandevuAdaylari, davetAdaylari, DAVET_ESIK };
