// Sekreter modu (kullanıcı kararı 2026-10-14): esnaf panele girmeden WhatsApp'tan yazar ya da söyler.
//   Kanal 1: kendi WhatsApp'ındaki "Kendime mesaj" sohbeti (her zaman açık; oraya yalnız telefon sahibi yazar)
//   Kanal 2: panelden girdiği ayrı numara (isletmeler.sekreter_telefon) — ör. dükkân hattı ayrı, usta kendi telefonundan yazar
// Komutlar utils/sekreterKomut ile çözülür; tanınmayan cümleye karışılmaz (kendime mesaj notları bozulmasın).
const pool = require('../config/db');
const { komutCoz, sade } = require('../utils/sekreterKomut');
const { bugunTarih, tarihFormatla, kapanisDk } = require('../utils/tarih');
const { telefonNormalize } = require('../utils/telefon');

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
function gunYazi(tarih) {
  const t = tarihFormatla(tarih); const [y, a, g] = t.split('-').map(Number);
  const d = new Date(Date.UTC(y, a - 1, g)).getUTCDay();
  const bugun = bugunTarih();
  const on = t === bugun ? 'Bugün' : t === require('./seans').gunEkle(bugun, 1) ? 'Yarın' : GUNLER[d];
  return `${on} (${g} ${AYLAR[a - 1]})`;
}
const s5 = (s) => String(s || '').slice(0, 5);
const dk = (s) => { const [h, m] = s5(s).split(':').map(Number); return h * 60 + (m || 0); };

const YARDIM = `🤵 *Sekreter modu* — panele girmeden yaz ya da sesli söyle:

📋 *bugün kimler var* · *yarın program*
⛔ *bugün 14-16 kapat* · *cumartesi kapalıyım*
✅ *yarın 14-16 aç* · *kapatmayı kaldır*
✍️ *Ahmet'e yarın 15:00 saç kesimi yaz*
   (yeni müşteriyse numarasını da yaz: Ahmet 0532 111 22 33 …)
↩️ *son randevuyu sil*`;

// Bu numara/sohbet sekreter komutu verebilir mi?
function sahipNumarasiMi(isletme, telefon) {
  if (!isletme || isletme.sekreter_aktif === false || !isletme.sekreter_telefon) return false;
  const a = telefonNormalize(isletme.sekreter_telefon), b = telefonNormalize(telefon);
  return !!a && a === b;
}

// metin → cevap (string) ya da null (komut değil). kanal: 'kendi' | 'numara'
async function isle({ isletmeId, metin, kanal }) {
  const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!isletme || isletme.sekreter_aktif === false) return null;
  const hizmetler = (await pool.query('SELECT id, isim, sure_dk FROM hizmetler WHERE isletme_id = $1 AND aktif = true ORDER BY id', [isletmeId])).rows;
  const k = komutCoz(metin, { bugun: bugunTarih(), hizmetler });
  if (!k) {
    // "Kendime mesaj"a yazılan sıradan notlara karışma; yalnız "fiko …" ile başlayıp anlaşılmayanlara yardım göster
    return /^\s*(fiko|sekreter)\b/i.test(String(metin)) ? `Anlayamadım 🤔\n\n${YARDIM}` : null;
  }
  try {
    switch (k.tip) {
      case 'yardim': return YARDIM;
      case 'liste': return await liste(isletme, k.tarih);
      case 'kapat': return await kapat(isletme, k);
      case 'ac': return await ac(isletme, k);
      case 'yaz': return await yaz(isletme, k, hizmetler);
      case 'yaz_eksik': return `Saati anlayamadım. Örnek: *Ahmet'e yarın 15:00 saç kesimi yaz*`;
      case 'sil_son': return await silSon(isletme);
      default: return null;
    }
  } catch (e) {
    console.error('Sekreter komutu:', e.message);
    return `⚠️ Yapamadım: ${e.message}`;
  }
}

async function liste(isletme, tarih) {
  const r = (await pool.query(
    `SELECT r.saat, r.durum, m.isim AS musteri, c.isim AS calisan,
            COALESCE((SELECT STRING_AGG(hh.isim, ' + ' ORDER BY rh.sira) FROM randevu_hizmetleri rh JOIN hizmetler hh ON hh.id = rh.hizmet_id WHERE rh.randevu_id = r.id), h.isim) AS hizmet
       FROM randevular r JOIN musteriler m ON m.id = r.musteri_id LEFT JOIN hizmetler h ON h.id = r.hizmet_id LEFT JOIN calisanlar c ON c.id = r.calisan_id
      WHERE r.isletme_id = $1 AND r.tarih = $2 AND r.durum NOT IN ('iptal') ORDER BY r.saat`, [isletme.id, tarih])).rows;
  const bloklar = (await pool.query('SELECT baslangic, bitis FROM takvim_bloklari WHERE isletme_id = $1 AND tarih = $2 ORDER BY baslangic', [isletme.id, tarih])).rows;
  const ek = { onay_bekliyor: ' ⏳', kapora_bekliyor: ' 💳', tamamlandi: ' ✓', gelmedi: ' ✗' };
  const satirlar = r.map(x => `${s5(x.saat)}  ${x.musteri || 'Müşteri'}${x.hizmet ? ' · ' + x.hizmet : ''}${x.calisan ? ' · ' + x.calisan : ''}${ek[x.durum] || ''}`);
  let cevap = `📋 *${gunYazi(tarih)}* — ${r.length ? `${r.length} randevu` : 'randevu yok'}\n`;
  if (satirlar.length) cevap += '\n' + satirlar.join('\n');
  if (bloklar.length) cevap += `\n\n⛔ Kapalı: ${bloklar.map(b => `${s5(b.baslangic)}–${s5(b.bitis)}`).join(', ')}`;
  return cevap;
}

async function kapat(isletme, k) {
  const bas = k.bas || s5(isletme.calisma_baslangic || '09:00');
  let bit = k.bit || s5(isletme.calisma_bitis || '19:00');
  if (kapanisDk(bas, bit) === 24 * 60) bit = '24:00'; // "00:00" kapanış: blok gün sonuna kadar sürsün (0. dakikada bitmesin)
  if (k.tarih < bugunTarih()) return 'Geçmiş bir gün kapatılamaz.';
  await pool.query(
    `INSERT INTO takvim_bloklari (isletme_id, tarih, baslangic, bitis, aciklama, kaynak) VALUES ($1, $2, $3, $4, $5, 'sekreter')`,
    [isletme.id, k.tarih, bas, bit, k.bas ? null : 'Bütün gün']);
  // Kapatılan aralıkta zaten randevu varsa esnaf bilsin (otomatik iptal etmiyoruz)
  const cakisan = (await pool.query(
    `SELECT r.saat, m.isim FROM randevular r JOIN musteriler m ON m.id = r.musteri_id
      WHERE r.isletme_id = $1 AND r.tarih = $2 AND r.durum NOT IN ('iptal', 'gelmedi', 'tamamlandi') ORDER BY r.saat`, [isletme.id, k.tarih])).rows
    .filter(x => dk(x.saat) >= dk(bas) && dk(x.saat) < dk(bit));
  let cevap = `⛔ *${gunYazi(k.tarih)} ${k.bas ? `${bas}–${bit}` : 'bütün gün'}* kapatıldı. Bu saatlere randevu verilmeyecek.`;
  if (cakisan.length) cevap += `\n\n⚠️ Bu aralıkta zaten ${cakisan.length} randevun var: ${cakisan.map(x => `${s5(x.saat)} ${x.isim}`).join(', ')}. Gerekirse müşteriyi arayıp haber ver.`;
  cevap += `\n\nAçmak için: *${k.tarih === bugunTarih() ? 'bugün' : 'o gün'} ${k.bas ? `${bas.slice(0, 2)}-${bit.slice(0, 2)} ` : ''}aç*`;
  return cevap;
}

async function ac(isletme, k) {
  const bloklar = (await pool.query('SELECT id, baslangic, bitis FROM takvim_bloklari WHERE isletme_id = $1 AND tarih = $2', [isletme.id, k.tarih])).rows;
  const silinecek = bloklar.filter(b => !k.bas || (dk(b.baslangic) < dk(k.bit) && dk(b.bitis) > dk(k.bas)));
  if (!silinecek.length) return `${gunYazi(k.tarih)} için kapatılmış saat yok.`;
  await pool.query('DELETE FROM takvim_bloklari WHERE id = ANY($1::int[])', [silinecek.map(b => b.id)]);
  // Açılan saat bekleme listesindekilere teklif edilsin
  try { await require('./beklemeListesi').bildir(isletme.id, k.tarih); } catch (e) { /* liste yoksa */ }
  return `✅ *${gunYazi(k.tarih)}* ${silinecek.map(b => `${s5(b.baslangic)}–${s5(b.bitis)}`).join(', ')} tekrar açıldı.`;
}

async function yaz(isletme, k, hizmetler) {
  if (!k.hizmetId) {
    return `Hangi hizmet? Şunlardan birini yaz:\n${hizmetler.slice(0, 12).map(h => `• ${h.isim}`).join('\n')}\n\nÖrnek: *${k.isim || 'Ahmet'}'e ${k.saat} ${hizmetler[0]?.isim || 'saç kesimi'} yaz*`;
  }
  // Müşteri: numara yazıldıysa o; yoksa bu dükkânın müşterilerinde isimle ara
  let telefon = k.telefon ? telefonNormalize(k.telefon) : null;
  let isim = k.isim;
  if (!telefon) {
    if (!isim) return `Kime yazayım? Örnek: *Ahmet'e yarın 15:00 saç kesimi yaz*`;
    const adaylar = (await pool.query(
      `SELECT DISTINCT m.id, m.isim, m.telefon FROM musteriler m
        WHERE (m.son_gelinen_isletme_id = $1 OR EXISTS (SELECT 1 FROM randevular r WHERE r.musteri_id = m.id AND r.isletme_id = $1))
          AND m.telefon NOT LIKE 'tg:%'`, [isletme.id])).rows
      .filter(m => sade(m.isim).startsWith(sade(isim)) || sade(m.isim).split(/\s+/).includes(sade(isim)));
    if (!adaylar.length) return `"${isim}" müşterilerinde yok. Numarasıyla yaz: *${isim} 0532 111 22 33 ${k.saat} yaz*`;
    if (adaylar.length > 1) {
      return `Birden çok "${isim}" var:\n${adaylar.slice(0, 6).map(m => `• ${m.isim} (…${String(m.telefon).slice(-4)})`).join('\n')}\n\nSoyadıyla ya da numarasıyla yaz.`;
    }
    telefon = adaylar[0].telefon; isim = adaylar[0].isim;
  }
  if (!String(telefon).startsWith('kapi') && !/^\d{10,15}$/.test(String(telefon))) return 'Telefon numarasını anlayamadım (05xx xxx xx xx).';

  const randevuService = require('./randevu');
  const hizmet = hizmetler.find(h => h.id === k.hizmetId);
  const bos = await randevuService.musaitSaatleriGetir(isletme.id, k.tarih, null, k.hizmetId);
  if (!bos.includes(k.saat)) {
    const yakin = bos.map(s => ({ s, f: Math.abs(dk(s) - dk(k.saat)) })).sort((a, b) => a.f - b.f).slice(0, 3).map(x => x.s).sort();
    return `⚠️ ${gunYazi(k.tarih)} ${k.saat} müsait değil.` + (yakin.length ? `\nEn yakın boş saatler: *${yakin.join(', ')}*` : '\nO gün boş saat yok.');
  }
  const sonuc = await randevuService.randevuOlustur({ isletmeId: isletme.id, musteriTelefon: telefon, musteriIsim: isim, hizmetIds: [k.hizmetId], tarih: k.tarih, saat: k.saat, kaynak: 'sekreter' });
  return `✅ Yazıldı: *${sonuc.musteri?.isim || isim}* · ${gunYazi(k.tarih)} ${k.saat} · ${hizmet?.isim || ''}` +
    `\n\nHatırlatmalar her zamanki gibi gidecek. Yanlışsa: *son randevuyu sil*`;
}

async function silSon(isletme) {
  const r = (await pool.query(
    `SELECT r.id, r.tarih, r.saat, m.isim FROM randevular r JOIN musteriler m ON m.id = r.musteri_id
      WHERE r.isletme_id = $1 AND r.kaynak = 'sekreter' AND r.durum NOT IN ('iptal') AND r.olusturma_tarihi > NOW() - INTERVAL '3 hours'
      ORDER BY r.id DESC LIMIT 1`, [isletme.id])).rows[0];
  if (!r) return 'Son 3 saatte buradan yazılmış randevu yok. Daha eskisini panelden iptal edebilirsin.';
  await require('./randevu').randevuIptal(r.id);
  return `↩️ Silindi: ${r.isim} · ${gunYazi(r.tarih)} ${s5(r.saat)}`;
}

module.exports = { isle, sahipNumarasiMi, YARDIM };
