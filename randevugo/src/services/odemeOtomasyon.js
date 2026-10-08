// Ödeme otomasyonu (kullanıcı kararı 2026-10-08): şirket kurulana kadar kart saklanamıyor, o yüzden
// "tek dokunuşla öde" düzeni. Bitişten önce esnafa SıraGO merkez WhatsApp numarasından kişisel ödeme
// linki gider; linke dokununca giriş yapmadan Shopier ödeme sayfası açılır; ödeme gelince paket
// kendiliğinden uzar (shopierService.siparisGeldi).
const crypto = require('crypto');
const pool = require('../config/db');
const { paketGetir } = require('../config/paketler');

const API = (process.env.BASE_URL || 'https://randevu.xn--srago-n4a.com').replace(/\/$/, '');
const GIZLI = process.env.ODEME_LINK_SECRET || process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const LINK_GUN = 10;   // link 10 gün geçerli

const b64 = (s) => Buffer.from(s).toString('base64url');
const imza = (govde) => crypto.createHmac('sha256', GIZLI).update('odeme:' + govde).digest('base64url');

// Yalnız ödeme başlatabilen, süreli link anahtarı (giriş anahtarı değil: panele erişim vermez)
function linkAnahtari(isletmeId, paket) {
  const govde = b64(JSON.stringify({ i: isletmeId, p: paket || null, e: Date.now() + LINK_GUN * 86400000 }));
  return `${govde}.${imza(govde)}`;
}
function anahtarCoz(anahtar) {
  const [govde, im] = String(anahtar || '').split('.');
  if (!govde || !im) return null;
  const beklenen = imza(govde);
  if (im.length !== beklenen.length || !crypto.timingSafeEqual(Buffer.from(im), Buffer.from(beklenen))) return null;
  try {
    const v = JSON.parse(Buffer.from(govde, 'base64url').toString());
    return v.e > Date.now() && Number.isInteger(v.i) ? v : null;
  } catch (e) { return null; }
}
const odemeLinki = (isletmeId, paket) => `${API}/api/odeme/ode/${linkAnahtari(isletmeId, paket)}`;

const tarih = (d) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' });

// Bitişe göre aşamalar: kaç gün kala (negatif = geçti) hangi mesaj
const ASAMALAR = [
  { gun: 3, metin: (x) => `Merhaba, ${x.isim} için SıraGO ${x.deneme ? 'ücretsiz denemeniz' : 'paketiniz'} ${x.tarih} tarihinde bitiyor. Kesinti olmasın diye tek dokunuşla yenileyebilirsiniz (${x.paketAd}, ${x.fiyat}₺/ay):` },
  { gun: 1, metin: (x) => `Merhaba, ${x.isim} için SıraGO ${x.deneme ? 'denemeniz' : 'paketiniz'} yarın bitiyor. Müşterileriniz randevu almaya devam etsin diye buradan ödeyebilirsiniz (${x.fiyat}₺):` },
  { gun: 0, metin: (x) => `Merhaba, SıraGO ${x.deneme ? 'denemeniz' : 'paketiniz'} bugün bitti. Ödeme yapınca paneliniz anında açılır, bilgileriniz duruyor (${x.fiyat}₺):` },
  { gun: -3, metin: (x) => `Merhaba, ${x.isim} paneliniz 3 gündür kapalı. Randevu ve müşteri bilgileriniz silinmedi; ödeme yapınca her şey kaldığı yerden devam eder. Bir sorun varsa bu mesaja yazın:` },
];

async function hatirlatmalariGonder({ gonder, simdi = new Date() } = {}) {
  const saat = Number(simdi.toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false }));
  if (!gonder && (saat < 10 || saat >= 20)) return 0;
  const gonderFn = gonder || ((tel, m) => require('./merkezOtpBot').mesajGonder(tel, m));
  const adaylar = (await pool.query(`
    SELECT i.id, i.isim, i.telefon, i.paket, i.oncu_no, i.kilitli_paket, i.kilitli_fiyat,
      GREATEST(COALESCE(i.deneme_bitis_tarihi, 'epoch'), COALESCE(i.paket_bitis_tarihi, 'epoch')) AS bitis,
      (i.paket_bitis_tarihi IS NULL OR i.paket_bitis_tarihi < COALESCE(i.deneme_bitis_tarihi, 'epoch')) AS deneme
    FROM isletmeler i
    WHERE i.aktif = true AND i.demo IS NOT TRUE AND i.telefon ~ '^[0-9+]{10,16}$'
      AND (i.grup_id IS NULL OR i.id = (SELECT MIN(m.id) FROM isletmeler m WHERE m.grup_id = i.grup_id))
      AND GREATEST(COALESCE(i.deneme_bitis_tarihi, 'epoch'), COALESCE(i.paket_bitis_tarihi, 'epoch'))
          BETWEEN $1::timestamp - INTERVAL '4 days' AND $1::timestamp + INTERVAL '4 days'`, [simdi.toISOString()])).rows;
  let n = 0;
  for (const a of adaylar) {
    const kalan = Math.ceil((new Date(a.bitis) - simdi) / 86400000);
    const asama = ASAMALAR.find(s => (s.gun > 0 ? kalan === s.gun : s.gun === 0 ? kalan === 0 : kalan <= s.gun && kalan > s.gun - 2));
    if (!asama) continue;
    const kayit = await pool.query(
      `INSERT INTO odeme_hatirlatma (isletme_id, bitis, asama) VALUES ($1, $2::date, $3) ON CONFLICT DO NOTHING RETURNING isletme_id`,
      [a.id, a.bitis, asama.gun]);
    if (!kayit.rows.length) continue;
    const p = await paketGetir(a.paket);
    if (!(p.fiyat > 0)) continue;
    const fiyat = require('../utils/oncu').etkinFiyat(a, a.paket, p.fiyat);
    const metin = asama.metin({ isim: a.isim, deneme: a.deneme, tarih: tarih(a.bitis), paketAd: p.isim, fiyat });
    const sonuc = await gonderFn(a.telefon, `${metin}\n${odemeLinki(a.id, a.paket)}`);
    if (sonuc?.success) {
      n++;
      await pool.query('UPDATE odeme_hatirlatma SET gonderildi = true WHERE isletme_id = $1 AND bitis = $2::date AND asama = $3', [a.id, a.bitis, asama.gun]);
    }
  }
  return n;
}

// Ödeme gelince esnafa teşekkür + yeni bitiş tarihi (WhatsApp), ekibe Telegram
async function odemeAlindiBildir(isletmeId, tutar) {
  try {
    const i = (await pool.query('SELECT isim, telefon, paket_bitis_tarihi FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
    if (!i) return;
    if (/^[0-9+]{10,16}$/.test(i.telefon || '')) {
      await require('./merkezOtpBot').mesajGonder(i.telefon,
        `Teşekkürler, ${tutar}₺ ödemeniz alındı. ${i.isim} için SıraGO ${tarih(i.paket_bitis_tarihi)} tarihine kadar aktif. İyi çalışmalar!`);
    }
    await require('../utils/alarm').alarm(`💳 Ödeme: ${i.isim}`, `${tutar}₺ (Shopier) — paket ${tarih(i.paket_bitis_tarihi)} tarihine uzadı.`);
  } catch (e) { console.error('Ödeme bildirimi gönderilemedi:', e.message); }
}

function baslat() {
  setInterval(() => hatirlatmalariGonder().catch(e => console.error('Ödeme hatırlatma hatası:', e.message)), 60 * 60 * 1000);
}

module.exports = { linkAnahtari, anahtarCoz, odemeLinki, hatirlatmalariGonder, odemeAlindiBildir, baslat };
