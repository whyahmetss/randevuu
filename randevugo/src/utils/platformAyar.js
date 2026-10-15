// Platform Ayarları (2026-10-15): işi etkileyen değerler panelden değişir, kod/deploy gerekmez.
// Değerler bellekte tutulur (al() senkron); kaydedilince ve dakikada bir veritabanından tazelenir.
// Veritabanında olmayan anahtar koddaki varsayılanı döner.
const pool = require('../config/db');

const TANIMLAR = [
  { anahtar: 'havale_banka', grup: 'Havale bilgileri', etiket: 'Banka adı', tur: 'metin', varsayilan: 'Garanti BBVA' },
  { anahtar: 'havale_iban', grup: 'Havale bilgileri', etiket: 'IBAN', tur: 'iban', varsayilan: 'TR54 0006 2000 7440 0006 8578 09' },
  { anahtar: 'havale_alici', grup: 'Havale bilgileri', etiket: 'Hesap sahibi', tur: 'metin', varsayilan: 'Ahmet Çavdar' },
  { anahtar: 'destek_eposta', grup: 'İletişim', etiket: 'Destek e-postası', tur: 'eposta', varsayilan: 'siragobusiness@gmail.com' },
  { anahtar: 'destek_whatsapp', grup: 'İletişim', etiket: 'Destek WhatsApp (905xxxxxxxxx, boşsa butonlar gizlenir)', tur: 'telefon',
    varsayilan: String(process.env.DESTEK_WP || '').replace(/\D/g, '') },
  { anahtar: 'deneme_gun', grup: 'Satış', etiket: 'Ücretsiz deneme süresi (gün)', tur: 'sayi', min: 1, max: 90,
    varsayilan: Math.max(1, parseInt(process.env.DENEME_GUN) || 14) },
  { anahtar: 'kapali_mesaj_tekrar_saat', grup: 'Bot', etiket: '"Şu an kapalıyız" mesajı aynı kişiye en sık kaç saatte bir', tur: 'sayi', min: 1, max: 72, varsayilan: 6 },
  { anahtar: 'spam_esik', grup: 'Bot', etiket: 'Dakikada kaç mesajdan sonra 10 dk sessize alınsın', tur: 'sayi', min: 5, max: 100, varsayilan: 15 },
  { anahtar: 'galeri_limit', grup: 'Randevu sayfası', etiket: 'Galeride en fazla fotoğraf', tur: 'sayi', min: 1, max: 50, varsayilan: 12 },
];
const TANIM = Object.fromEntries(TANIMLAR.map(t => [t.anahtar, t]));

let degerler = {};
let yuklendi = false;

function cevir(t, ham) {
  if (ham === null || ham === undefined || ham === '') return t.varsayilan;
  if (t.tur === 'sayi') { const n = Number(ham); return Number.isFinite(n) ? n : t.varsayilan; }
  return String(ham);
}

function al(anahtar) {
  const t = TANIM[anahtar];
  if (!t) throw new Error(`Bilinmeyen platform ayarı: ${anahtar}`);
  return cevir(t, degerler[anahtar]);
}

async function yukle() {
  try {
    const r = await pool.query('SELECT anahtar, deger FROM platform_ayarlari');
    degerler = Object.fromEntries(r.rows.map(x => [x.anahtar, x.deger]));
    yuklendi = true;
  } catch (e) { /* tablo henüz yoksa varsayılanlar */ }
}

// Geçersiz değer → hata mesajı; boş değer → varsayılana dönüş
function dogrula(t, v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (t.tur === 'sayi') {
    const n = Number(s);
    if (!Number.isInteger(n) || n < t.min || n > t.max) return `${t.etiket}: ${t.min}–${t.max} arası tam sayı olmalı`;
  }
  if (t.tur === 'iban' && !/^TR\d{24}$/.test(s.replace(/\s/g, '').toUpperCase())) return 'IBAN TR ile başlamalı ve 26 karakter olmalı';
  if (t.tur === 'eposta' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'E-posta geçersiz';
  if (t.tur === 'telefon' && !/^905\d{9}$/.test(s.replace(/\D/g, ''))) return 'Telefon 905xxxxxxxxx biçiminde olmalı';
  if (s.length > 300) return `${t.etiket} çok uzun`;
  return null;
}

function normalize(t, v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const s = String(v).trim();
  if (t.tur === 'telefon') return s.replace(/\D/g, '');
  if (t.tur === 'iban') return s.replace(/\s/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
  return s;
}

// degisiklik: { anahtar: deger|null }. Hepsi doğrulanır, biri bile hatalıysa hiçbiri kaydedilmez.
async function kaydet(degisiklik, kim) {
  const girdiler = Object.entries(degisiklik || {});
  for (const [k, v] of girdiler) {
    const t = TANIM[k];
    if (!t) throw Object.assign(new Error(`Bilinmeyen ayar: ${k}`), { kullanici: true });
    const h = dogrula(t, v);
    if (h) throw Object.assign(new Error(h), { kullanici: true });
  }
  const degisen = [];
  for (const [k, v] of girdiler) {
    const yeni = normalize(TANIM[k], v);
    const eski = degerler[k] ?? null;
    if ((eski ?? null) === yeni) continue;
    if (yeni === null) await pool.query('DELETE FROM platform_ayarlari WHERE anahtar = $1', [k]);
    else await pool.query(`INSERT INTO platform_ayarlari (anahtar, deger, guncelleme, guncelleyen) VALUES ($1, $2, NOW(), $3)
      ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger, guncelleme = NOW(), guncelleyen = EXCLUDED.guncelleyen`, [k, yeni, kim || null]);
    degisen.push(`${TANIM[k].etiket}: ${eski ?? '(varsayılan)'} → ${yeni ?? '(varsayılan)'}`);
  }
  await yukle();
  return degisen;
}

function liste() {
  return TANIMLAR.map(t => ({
    anahtar: t.anahtar, grup: t.grup, etiket: t.etiket, tur: t.tur, min: t.min, max: t.max,
    varsayilan: t.varsayilan, deger: degerler[t.anahtar] ?? null, etkin: al(t.anahtar),
  }));
}

function baslat() {
  yukle();
  setInterval(yukle, 60_000).unref?.();
}

module.exports = { al, yukle, kaydet, liste, baslat, TANIMLAR, _yuklendi: () => yuklendi };
