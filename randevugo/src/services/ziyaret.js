// Ziyaret hazırla (kullanıcı kararı 2026-10-29): sahaya gitmeden önce dükkânı Google'da bul (aday listesinde olmasa da),
// demo randevu sayfasını gerçek bilgileriyle (ad, adres, telefon, çalışma saatleri, kategori) aç. Esnaf dükkânda kendi
// sayfasını görür; kabul ederse Satış Masası > Hesap aç demoyu onun gerçek hesabına çevirir.
// Google fotoğrafları kopyalanmaz (Google kuralları saklamaya izin vermiyor); logo/kapak elle yüklenir.
const pool = require('../config/db');

const PLACES = 'https://places.googleapis.com/v1';
const ALANLAR = ['id', 'displayName', 'formattedAddress', 'nationalPhoneNumber', 'internationalPhoneNumber', 'websiteUri',
  'googleMapsUri', 'rating', 'userRatingCount', 'types', 'primaryType', 'addressComponents', 'regularOpeningHours', 'businessStatus'];
const apiKey = () => process.env.GOOGLE_MAPS_API_KEY || '';
const hata = (mesaj, kod = 400) => Object.assign(new Error(mesaj), { kod });

// ── Girdi: Google Maps linki (kısa link dahil) ya da serbest metin ("Villa Barber Başakşehir") ──
async function kisaLinkCoz(url) {
  let u = url;
  for (let i = 0; i < 4; i++) {
    if (!/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(u)) break;
    const r = await fetch(u, { redirect: 'manual' });
    const yer = r.headers.get('location');
    if (!yer) break;
    u = new URL(yer, u).toString();
  }
  return u;
}
function linkCoz(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  if (!/google\.|goo\.gl/i.test(u.hostname)) return null;
  const yol = decodeURIComponent(u.pathname.replace(/\+/g, ' '));
  const ad = (yol.match(/\/maps\/place\/([^/]+)/) || [])[1] || u.searchParams.get('q') || u.searchParams.get('query') || null;
  const k = (u.pathname + u.search).match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || (u.searchParams.get('ll') || '').match(/(-?\d+\.\d+),(-?\d+\.\d+)/);
  return { metin: ad ? ad.trim() : null, konum: k ? { lat: Number(k[1]), lng: Number(k[2]) } : null };
}
async function girdiCoz(girdi) {
  const g = String(girdi || '').trim().slice(0, 500);
  if (!g) throw hata('İşletme adı ya da Google Maps linki yazın');
  if (/^https?:\/\//i.test(g)) {
    const c = linkCoz(await kisaLinkCoz(g));
    if (!c?.metin) throw hata('Linkten işletme okunamadı; işletme adı ve ilçeyi yazarak deneyin');
    return c;
  }
  return { metin: g, konum: null };
}

async function placesIstek(yol, govde) {
  if (!apiKey()) throw hata('GOOGLE_MAPS_API_KEY tanımlı değil', 500);
  const alan = govde ? ALANLAR.map(a => `places.${a}`).join(',') : ALANLAR.join(',');
  const r = await fetch(`${PLACES}${yol}`, {
    method: govde ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey(), 'X-Goog-FieldMask': alan },
    ...(govde ? { body: JSON.stringify(govde) } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw hata(`Google: ${d.error?.message || r.status}`, 502);
  return d;
}

// ── Kategori: Google türü → demo hizmet şablonu adı (services/demo HIZMETLER anahtarları) ──
const TUR = [
  [['barber_shop'], 'berber'], [['nail_salon'], 'tırnak salonu'], [['hair_salon', 'hair_care'], 'kuaför'],
  [['spa', 'massage', 'sauna', 'wellness_center'], 'spa'], [['beauty_salon', 'skin_care_clinic', 'beautician'], 'güzellik salonu'],
  [['dentist', 'dental_clinic'], 'diş kliniği'], [['veterinary_care'], 'veteriner'], [['nutritionist'], 'diyetisyen'],
];
const ADDAN = [
  [/berber|barber/, 'berber'], [/d[öo]vme|tattoo|ink/, 'dövme'], [/t[ıi]rnak|nail/, 'tırnak salonu'], [/masaj|massage|spa\b|hamam/, 'spa'],
  [/kuaf[öo]r|hair|sa[çc]/, 'kuaför'], [/g[üu]zellik|beauty|estetik|cilt/, 'güzellik salonu'], [/di[şs] |dent|di[şs]hekim/, 'diş kliniği'],
  [/veteriner|vet\b|pet/, 'veteriner'], [/diyet|beslenme/, 'diyetisyen'],
];
function kategoriTahmin(yer) {
  // Ad önce: "Villa Barber's Club" Google'da çoğu zaman hair_salon görünüyor
  const ad = String(yer.displayName?.text || '').toLocaleLowerCase('tr') + ' ';
  const a = ADDAN.find(([re]) => re.test(ad));
  if (a) return a[1];
  const turler = [yer.primaryType, ...(yer.types || [])].filter(Boolean);
  const t = TUR.find(([liste]) => liste.some(x => turler.includes(x)));
  return t ? t[1] : null;
}

// ── Çalışma saatleri: Google haftası (0 = Pazar, JS getDay ile aynı) → genel saat + gün bazlı fark + kapalı günler ──
const hhmm = (o) => `${String(o?.hour || 0).padStart(2, '0')}:${String(o?.minute || 0).padStart(2, '0')}`;
const dk = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function saatleriCevir(roh) {
  const periyot = roh?.periods || [];
  if (!periyot.length) return null;
  const gun = {};
  for (const p of periyot) {
    const g = p.open?.day;
    if (g == null) continue;
    const bas = hhmm(p.open);
    // Kapanış yoksa 24 saat açık; ertesi güne taşan kapanış gece yarısında biter ("00:00" = gün sonu)
    const bit = !p.close ? '00:00' : p.close.day !== g ? '00:00' : hhmm(p.close);
    const bitDk = bit === '00:00' ? 24 * 60 : dk(bit);
    const o = gun[g];
    // Öğle arası olan günde ilk açılış ve son kapanış alınır
    if (!o) gun[g] = { bas, bit, bitDk };
    else { if (dk(bas) < dk(o.bas)) o.bas = bas; if (bitDk > o.bitDk) Object.assign(o, { bit, bitDk }); }
  }
  const acik = Object.keys(gun).map(Number);
  if (!acik.length) return null;
  const say = {};
  for (const g of acik) { const k = `${gun[g].bas}-${gun[g].bit}`; say[k] = (say[k] || 0) + 1; }
  const [genelBas, genelBit] = Object.entries(say).sort((a, b) => b[1] - a[1])[0][0].split('-');
  const haftalik = {};
  for (const g of acik) if (gun[g].bas !== genelBas || gun[g].bit !== genelBit) haftalik[g] = { bas: gun[g].bas, bit: gun[g].bit };
  const kapali = [0, 1, 2, 3, 4, 5, 6].filter(g => !gun[g]);
  return { genelBas, genelBit, haftalik: Object.keys(haftalik).length ? haftalik : null, kapali: kapali.join(',') };
}

function adres(yer) {
  const c = yer.addressComponents || [];
  const bul = (tur) => c.find(x => (x.types || []).includes(tur))?.longText || null;
  return { sehir: bul('administrative_area_level_1'), ilce: bul('administrative_area_level_2') };
}

// Arama sonucu (listede gösterilen özet)
const ozet = (yer) => ({
  place_id: yer.id, isim: yer.displayName?.text || '', adres: yer.formattedAddress || '',
  telefon: yer.nationalPhoneNumber || yer.internationalPhoneNumber || null, puan: yer.rating || null, yorum: yer.userRatingCount || 0,
  kategori: kategoriTahmin(yer), kapandi: yer.businessStatus === 'CLOSED_PERMANENTLY', maps: yer.googleMapsUri || null,
});

async function ara(girdi) {
  const { metin, konum } = await girdiCoz(girdi);
  const govde = { textQuery: metin, languageCode: 'tr', regionCode: 'TR', maxResultCount: 6 };
  if (konum) govde.locationBias = { circle: { center: { latitude: konum.lat, longitude: konum.lng }, radius: 500 } };
  const d = await placesIstek('/places:searchText', govde);
  const adaylar = (d.places || []).map(ozet);
  // Aday listesinde zaten var mı / demosu hazır mı
  if (adaylar.length) {
    const var_ = (await pool.query('SELECT google_maps_id, id, demo_isletme_id FROM potansiyel_musteriler WHERE google_maps_id = ANY($1)',
      [adaylar.map(a => a.place_id)])).rows;
    for (const a of adaylar) { const v = var_.find(x => x.google_maps_id === a.place_id); a.lead_id = v?.id || null; a.demo_isletme_id = v?.demo_isletme_id || null; }
  }
  return adaylar;
}

// Yer ayrıntısı → aday kaydı (yoksa açılır) → demo sayfa (yoksa açılır, gerçek saatlerle) → { isletme_id, lead_id, yeni }
async function hazirla(placeId, kategoriSecim = null) {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(String(placeId || ''))) throw hata('Geçersiz yer');
  const yer = await placesIstek(`/places/${encodeURIComponent(placeId)}?languageCode=tr&regionCode=TR`);
  const o = ozet(yer);
  const { sehir, ilce } = adres(yer);
  const kategori = kategoriSecim || o.kategori || null;
  const avci = require('./avciBot');
  const skor = avci.skorHesapla({ puan: o.puan, yorum_sayisi: o.yorum, web_sitesi: yer.websiteUri || null, telefon: o.telefon });
  const lead = (await pool.query(`
    INSERT INTO potansiyel_musteriler (isletme_adi, telefon, adres, sehir, ilce, kategori, puan, yorum_sayisi, web_sitesi, google_maps_id, google_maps_url, skor)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (google_maps_id) DO UPDATE SET puan = EXCLUDED.puan, yorum_sayisi = EXCLUDED.yorum_sayisi,
      telefon = COALESCE(potansiyel_musteriler.telefon, EXCLUDED.telefon),
      kategori = CASE WHEN $13 THEN EXCLUDED.kategori ELSE COALESCE(potansiyel_musteriler.kategori, EXCLUDED.kategori) END
    RETURNING id, demo_isletme_id`,
    [o.isim, o.telefon, o.adres || null, sehir, ilce, kategori, o.puan, o.yorum, yer.websiteUri || null, yer.id, o.maps, skor, !!kategoriSecim])).rows[0];
  const d = await require('./demo').demoOlustur(lead.id);
  if (d.yeni) {
    const s = saatleriCevir(yer.regularOpeningHours);
    if (s) {
      await pool.query(`UPDATE isletmeler SET calisma_baslangic = $1, calisma_bitis = $2, haftalik_saatler = $3, kapali_gunler = $4
        WHERE id = $5 AND demo = true`, [s.genelBas, s.genelBit, s.haftalik ? JSON.stringify(s.haftalik) : null, s.kapali, d.isletme.id]);
    }
  }
  return { isletme_id: d.isletme.id, lead_id: lead.id, yeni: d.yeni };
}

module.exports = { ara, hazirla, saatleriCevir, kategoriTahmin, linkCoz, girdiCoz };
