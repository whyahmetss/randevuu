// Sekreter modu komut çözücü (2026-10-14): esnafın WhatsApp'tan yazdığı/söylediği cümleyi komuta çevirir.
// Saf fonksiyon (veritabanı yok) → testlenebilir. Tanınmayan cümle null döner; bot hiçbir şey yapmaz.
//   "bugün kimler var"                         → { tip: 'liste', tarih }
//   "fiko bugün 14:00 ile 16:00 arasını kapat"  → { tip: 'kapat', tarih, bas: '14:00', bit: '16:00' }
//   "yarın kapalıyım" / "yarını kapat"          → { tip: 'kapat', tarih, bas: null, bit: null }  (bütün gün)
//   "yarın 14-16 aç" / "kapatmayı kaldır"       → { tip: 'ac', tarih, bas?, bit? }
//   "Ahmet'e yarın 15:00'e saç kesimi yaz"      → { tip: 'yaz', tarih, saat: '15:00', isim: 'Ahmet', telefon: null, metin }
//   "son randevuyu sil" / "geri al"             → { tip: 'sil_son' }
//   "yardım"                                     → { tip: 'yardim' }

const GUNLER = ['pazar', 'pazartesi', 'sali', 'carsamba', 'persembe', 'cuma', 'cumartesi'];
const AYLAR = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

// Türkçe harfleri sadeleştir, küçük harf (karşılaştırma için)
const sade = (s) => String(s || '').toLocaleLowerCase('tr')
  .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/â/g, 'a').replace(/î/g, 'i');

const iki = (n) => String(n).padStart(2, '0');
const saatYaz = (h, m = 0) => `${iki(h)}:${iki(m)}`;
function gunEkle(bugun, gun) {
  const [y, a, g] = bugun.split('-').map(Number);
  return new Date(Date.UTC(y, a - 1, g + gun)).toISOString().slice(0, 10);
}
const haftaGunu = (tarih) => { const [y, a, g] = tarih.split('-').map(Number); return new Date(Date.UTC(y, a - 1, g)).getUTCDay(); };

// Tarih: bugün, yarın, öbür gün, gün adı (bugün dahil en yakın), "15 ekim", "15.10", "15/10/2026"
function tarihBul(s, bugun) {
  if (/\b(obur ?gun|ertesi gun)/.test(s)) return { tarih: gunEkle(bugun, 2), kelime: true };
  if (/\byarin/.test(s)) return { tarih: gunEkle(bugun, 1), kelime: true };
  if (/\bbugun/.test(s)) return { tarih: bugun, kelime: true };
  let m = s.match(/\b(\d{1,2}) (ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/);
  if (m) {
    const ay = AYLAR.indexOf(m[2]) + 1; let yil = Number(bugun.slice(0, 4));
    let t = `${yil}-${iki(ay)}-${iki(m[1])}`; if (t < bugun) t = `${yil + 1}-${iki(ay)}-${iki(m[1])}`;
    return { tarih: t, kelime: true };
  }
  m = s.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12 && Number(m[1]) >= 1 && Number(m[1]) <= 31) {
    let yil = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : Number(bugun.slice(0, 4));
    let t = `${yil}-${iki(m[2])}-${iki(m[1])}`; if (!m[3] && t < bugun) t = `${yil + 1}-${iki(m[2])}-${iki(m[1])}`;
    return { tarih: t, kelime: true, metin: m[0] };
  }
  // Gün adı: uzun adlar önce ("pazartesi" "pazar"dan, "cumartesi" "cuma"dan önce)
  for (const ad of ['pazartesi', 'cumartesi', 'carsamba', 'persembe', 'pazar', 'sali', 'cuma']) {
    if (new RegExp(`\\b${ad}`).test(s)) {
      const fark = (GUNLER.indexOf(ad) - haftaGunu(bugun) + 7) % 7;
      return { tarih: gunEkle(bugun, fark), kelime: true };
    }
  }
  return { tarih: bugun, kelime: false };
}

// Esnaf "3'te", "3 gibi" derken öğleden sonrayı kasteder: 1–7 arası saatler 13–19 olur
const ogledenSonra = (h) => (h >= 1 && h <= 7 ? h + 12 : h);

// Saat aralığı: "14-16", "14:00 ile 16:00 arası", "14.30-16", "2 ile 4 arası", "14ten 16ya"
function aralikBul(s) {
  const m = s.match(/\b(\d{1,2})(?:[:.](\d{2}))?(?:'?(?:den|dan|ten|tan))? ?(?:-|–|ile|ila|ve) ?(\d{1,2})(?:[:.](\d{2}))?(?:'?(?:e|a|ye|ya))?\b/);
  if (!m) return null;
  let b1 = ogledenSonra(Number(m[1])), b2 = ogledenSonra(Number(m[3]));
  const d1 = Number(m[2] || 0), d2 = Number(m[4] || 0);
  if (b1 > 23 || b2 > 24 || d1 > 59 || d2 > 59) return null;
  if (b2 * 60 + d2 <= b1 * 60 + d1) return null;
  return { bas: saatYaz(b1, d1), bit: saatYaz(b2, d2), metin: m[0] };
}

// Tek saat: "15:00", "15.30", "saat 3", "3'te", "15te", "3 gibi"
function saatBul(s) {
  let m = s.match(/\b(\d{1,2})[:.](\d{2})\b/);
  if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) return { saat: saatYaz(ogledenSonra(Number(m[1])), Number(m[2])), metin: m[0] };
  m = s.match(/\b(?:saat )?(\d{1,2}) ?'?(?:te|ta|de|da|e|a|ye|ya|gibi|sularinda)\b/) || s.match(/\bsaat (\d{1,2})\b/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 23) return { saat: saatYaz(ogledenSonra(Number(m[1]))), metin: m[0] };
  return null;
}

const TELEFON = /(?:\+?90[\s-]?)?0?\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/;

// Komut sözcükleri ve isim sayılmayacak sözcükler (sade biçimde)
const DOLGU = new Set(['fiko', 'sekreter', 'bugun', 'yarin', 'obur', 'ertesi', 'gun', 'saat', 'randevu', 'randevusu', 'randevuyu', 'icin', 'ile', 'ila',
  've', 'bir', 'bi', 'yaz', 'yazar', 'yazin', 'ekle', 'kaydet', 'ver', 'olustur', 'ayarla', 'gibi', 'sularinda', 'lutfen', 'abi', 'kanka', 'musteri',
  'bey', 'hanim', 'arasi', 'arasini', 'te', 'ta', 'de', 'da', 'e', 'a', 'ye', 'ya', ...GUNLER, ...AYLAR]);

function isimBul(orijinal, cikar) {
  let s = ' ' + String(orijinal) + ' ';
  for (const p of cikar.filter(Boolean)) s = s.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  // "Ahmet'e", "Ayşe'ye", "Mehmet Bey'e": kesme işaretli kelime ve önceki büyük harfli kelime
  const kesme = s.match(/((?:[A-ZÇĞİÖŞÜ][\wçğıöşü]+\s+)?[A-ZÇĞİÖŞÜa-zçğıöşü][\wçğıöşü]*)['’](?:e|a|ye|ya|ne|na|in|ın|un|ün|nin|nın)\b/);
  if (kesme) return kesme[1].replace(/\s+(Bey|Hanım)$/i, '').trim();
  const kelimeler = s.split(/[\s,]+/).filter(w => w && /^[A-Za-zÇĞİÖŞÜçğıöşü]+$/.test(w) && !DOLGU.has(sade(w)));
  // Büyük harfle başlayan ilk 1–2 kelime; hiç yoksa ilk kelime
  const buyuk = kelimeler.filter(w => /^[A-ZÇĞİÖŞÜ]/.test(w));
  const secim = (buyuk.length ? buyuk : kelimeler).slice(0, 2);
  return secim.length ? secim.join(' ') : null;
}

// Hizmet eşleştirme: adının bütün kelimeleri cümlede geçen en uzun hizmet; tek hizmet varsa o
function hizmetBul(s, hizmetler = []) {
  const kelimeler = new Set(s.split(/[^a-z0-9]+/).filter(Boolean));
  let en = null;
  for (const h of hizmetler) {
    const parca = sade(h.isim).split(/[^a-z0-9]+/).filter(w => w && w.length > 1 && w !== 've');
    if (!parca.length) continue;
    if (parca.every(p => [...kelimeler].some(k => k === p || (p.length > 3 && k.startsWith(p.slice(0, -1)))))) {
      if (!en || parca.length > en.n) en = { h, n: parca.length };
    }
  }
  if (en) return { hizmet: en.h, ad: en.h.isim };
  if (hizmetler.length === 1) return { hizmet: hizmetler[0], ad: null };
  return { hizmet: null, ad: null };
}

function komutCoz(metin, { bugun, hizmetler = [] } = {}) {
  const ham = String(metin || '').trim();
  if (!ham || ham.length > 300) return null;
  const s = ' ' + sade(ham).replace(/[!?,;]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const govde = s.replace(/^ (fiko|sekreter) /, ' ');

  if (/^ (yardim|komutlar|neler yapabilirsin|help|\?) $/.test(govde)) return { tip: 'yardim' };
  if (/\b(son (randevuyu|kaydi|yazdigini|ekledigini)|sonuncuyu) (sil|iptal|geri al)/.test(govde) || /^ geri al $/.test(govde)) return { tip: 'sil_son' };

  const { tarih, kelime } = tarihBul(govde, bugun);

  // Aç: "kapatmayı kaldır", "14-16 aç", "yarını aç", "bloğu kaldır"
  if (/\b(kapatmayi|kapamayi|blogu|blok|kapaliyi) (kaldir|iptal|sil|ac)/.test(govde) || /\b(ac|acin|aciyorum|acabilirsin)\b/.test(govde)) {
    const a = aralikBul(govde);
    return { tip: 'ac', tarih, bas: a?.bas || null, bit: a?.bit || null };
  }
  // Kapat: "14-16 kapat", "yarın kapalıyım", "müsait değilim", "dışarı çıkacağım"
  if (/\b(kapat|kapa|kapatin|blokla|kapaliyim|kapali olacagim|musait degilim|musait olmayacagim|yokum|olmayacagim|izinliyim)/.test(govde)) {
    const a = aralikBul(govde);
    return { tip: 'kapat', tarih, bas: a?.bas || null, bit: a?.bit || null };
  }
  // Randevu yaz: komut sözcüğü + saat şart
  if (/\b(yaz|ekle|kaydet|randevu ver|olustur|ayarla)\b/.test(govde)) {
    const tel = ham.match(TELEFON);
    const st = saatBul(govde.replace(TELEFON, ' '));
    if (!st) return { tip: 'yaz_eksik', eksik: 'saat' };
    const hz = hizmetBul(govde, hizmetler);
    const tarihMetni = tarihBul(govde, bugun).metin;
    const isim = isimBul(ham, [tel?.[0], tarihMetni, ...(hz.ad ? [hz.ad] : []),
      ...String(ham).match(/\b\d{1,2}[:.]\d{2}\b|\b\d{1,2}\s?'?(?:te|ta|de|da|e|a|ye|ya)\b|\b\d{1,2}\b/g) || []]);
    return { tip: 'yaz', tarih, saat: st.saat, isim, telefon: tel ? tel[0].replace(/\D/g, '') : null, hizmetId: hz.hizmet?.id || null, tarihVerildi: kelime };
  }
  // Liste: "bugün kimler var", "yarın program", "randevular"
  if (/\b(kimler|kim var|liste|listele|program|randevular|randevulari|ne var|kac randevu|bugunku|yarinki)/.test(govde)) return { tip: 'liste', tarih };
  return null;
}

module.exports = { komutCoz, tarihBul, aralikBul, saatBul, isimBul, hizmetBul, sade, gunEkle };
