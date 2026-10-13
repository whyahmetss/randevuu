// SıraGO numarasından giden mesajlar için güvenlik sınırı (kullanıcı kararı 2026-10-14: önceki sanal numara
// toplu mesajdan ban yedi).
//  1) Isınma: yeni eklenen numara ilk günlerde az mesaj atar, kademeli artar; hiçbir ayar 50/gün tavanını aşamaz.
//  2) Kuyruk: süper adminin toplu mesajları (zombi) tek seferde değil, arka planda, mesai saatinde,
//     aralarda rastgele 45–120 sn bekleyerek ve günde en fazla ZOMBI_GUNLUK kadar gider.
const pool = require('../config/db');

const NUMARA_TAVAN = 50;
const ZOMBI_GUNLUK = 30;

// Numaranın eklenmesinden bu yana geçen güne göre günlük üst sınır
function isinmaLimiti(gun) {
  if (gun < 3) return 10;
  if (gun < 7) return 20;
  if (gun < 14) return 35;
  return NUMARA_TAVAN;
}

const _yasCache = new Map();   // numaraId → { gun, zaman }
async function numaraLimiti(numaraId, ayarLimiti) {
  let c = _yasCache.get(numaraId);
  if (!c || Date.now() - c.zaman > 60 * 60 * 1000) {
    const r = (await pool.query('SELECT olusturma_tarihi FROM satis_bot_numaralar WHERE id = $1', [numaraId]).catch(() => ({ rows: [] }))).rows[0];
    const gun = r?.olusturma_tarihi ? Math.floor((Date.now() - new Date(r.olusturma_tarihi).getTime()) / 86400000) : 0;
    c = { gun, zaman: Date.now() };
    _yasCache.set(numaraId, c);
  }
  return { limit: Math.min(ayarLimiti, isinmaLimiti(c.gun)), gun: c.gun };
}

// ── Toplu mesaj kuyruğu ──
const kuyruk = [];
let calisiyor = false;
const sayac = { tarih: null, n: 0 };
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saatTR = () => Number(new Date().toLocaleString('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hour12: false }));
const uyu = (ms) => new Promise(r => { const t = setTimeout(r, ms); t.unref?.(); });   // süreç kapanışını tutmasın
let _bekleme = () => 45000 + Math.random() * 75000;
let _saat = saatTR;

// is: { telefon, mesaj, sonra?: async (sonuc) => {} }  sonuc: 'gonderildi' | 'bot_kapali' | 'hata: …'
function kuyrugaEkle(isler) {
  for (const is of isler) kuyruk.push(is);
  if (!calisiyor) { calisiyor = true; isle().catch(e => console.error('wpSinir kuyruk:', e.message)).finally(() => { calisiyor = false; }); }
  return { kuyrukta: kuyruk.length, bugun_kalan: Math.max(0, ZOMBI_GUNLUK - (sayac.tarih === bugun() ? sayac.n : 0)) };
}

async function isle() {
  while (kuyruk.length) {
    if (sayac.tarih !== bugun()) { sayac.tarih = bugun(); sayac.n = 0; }
    const s = _saat();
    if (sayac.n >= ZOMBI_GUNLUK || s < 10 || s >= 20) { await uyu(15 * 60 * 1000); continue; }   // yarını / mesaiyi bekle
    const is = kuyruk.shift();
    let sonuc;
    try {
      const satisBot = require('../services/satisBot');
      if (satisBot.sock && satisBot.durum === 'bagli') {
        const tel = String(is.telefon).replace(/\D/g, '').replace(/^0/, '90');
        await satisBot.sock.sendMessage(`${tel}@s.whatsapp.net`, { text: is.mesaj });
        satisBot.gunlukGonderim = (satisBot.gunlukGonderim || 0) + 1;   // Satış Bot'un günlük sınırına da sayılır
        sayac.n++;
        sonuc = 'gonderildi';
      } else sonuc = 'bot_kapali';
    } catch (e) { sonuc = 'hata: ' + e.message; }
    try { await is.sonra?.(sonuc); } catch (e) { /* kayıt önemsiz */ }
    if (sonuc === 'gonderildi' && kuyruk.length) await uyu(_bekleme());
  }
}

const _test = { kuyruk, sayac, bekleme: (f) => { _bekleme = f; }, saat: (f) => { _saat = f; }, bitir: async () => { while (calisiyor && kuyruk.length) await new Promise(r => setTimeout(r, 5)); } };
module.exports = { isinmaLimiti, numaraLimiti, kuyrugaEkle, NUMARA_TAVAN, ZOMBI_GUNLUK, _test };
