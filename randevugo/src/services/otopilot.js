// Otopilot kurulum (kullanıcı kararı 2026-10-15): WhatsApp'tan kayıt olan esnafın dükkânını Satış Bot aynı sohbette
// baştan sona kurar, esnafın panel açması gerekmez. Adımlar: (kategori belli değilse ne iş yaptığı) → hizmet ve
// fiyatlar → çalışanlar → hangi numara → WhatsApp'ı eşleştirme koduyla bağlama → bitti (randevu linki + deneme).
// Durum satis_konusmalar.kurulum_durum'da (deploy'da kaybolmaz). 2 saat ilerlemeyen ya da "yardım" yazan esnaf
// Sistem Uyarıları'na ve Telegram'a düşer; ekip arayıp tamamlar. "panel" yazan kalan adımları panelden yapar.
const pool = require('../config/db');
const { telefonNormalize } = require('../utils/telefon');
const { paketGetir } = require('../config/paketler');

const PANEL = 'https://admin.sırago.com';
const ADIM_AD = { kategori: 'işletme türü', hizmet: 'hizmet ve fiyatlar', calisan: 'çalışanlar', numara: 'WhatsApp numarası', bagla: 'WhatsApp bağlama' };
const ADIM_SAYFA = { kategori: 'hizmetler', hizmet: 'hizmetler', calisan: 'calisanlar', numara: 'botbaglanti', bagla: 'botbaglanti' };
const TAKILDI_SAAT = 2;     // bu kadar ilerlemeyen kurulum ekibe düşer
const UNUT_SAAT = 72;       // sonra otopilot bırakır (kurulum.js hatırlatmaları sürer)
const MAX_KOD = 5;
const KATEGORILER = [['berber', 'Berber'], ['kuaför', 'Kuaför'], ['güzellik salonu', 'Güzellik salonu'], ['tırnak salonu', 'Tırnak salonu'],
  ['diş kliniği', 'Diş kliniği'], ['veteriner', 'Veteriner'], ['diyetisyen', 'Diyetisyen'], ['spa', 'Spa / masaj'], ['dövme', 'Dövme']];

// ── Metin yardımcıları ──
const sade = (m) => ' ' + String(m || '').toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim() + ' ';
const icinde = (s, liste) => liste.some(k => s.includes(` ${k} `));
const kelimeSayisi = (s) => s.trim().split(' ').filter(Boolean).length;
const EVET = ['evet', 'tamam', 'olur', 'doğru', 'dogru', 'aynen', 'bu numara', 'e', 'he', 'evt', 'yes', 'bu'];
const GEC = ['geç', 'gec', 'atla', 'sonra', 'fiyat yok', 'şimdilik geç', 'simdilik gec'];
const TEK = ['sadece ben', 'yalnız ben', 'yalniz ben', 'tek başıma', 'tek basima', 'tekim', 'ben', 'benim', 'kendim', 'tek ben', 'bir tek ben'];
const YARDIM = ['yardım', 'yardim', 'destek', 'arayın', 'arayin', 'beni arayın', 'beni arayin', 'anlamadım', 'anlamadim', 'yapamadım', 'yapamadim', 'temsilci'];
const PANELDEN = ['panel', 'panelden', 'bilgisayardan'];
const IPTAL = ['iptal', 'vazgeç', 'vazgec', 'vazgeçtim', 'dur', 'durdur'];
const YENI_KOD = ['kod', 'yeni kod', 'tekrar', 'kod gelmedi', 'tekrar kod', 'kod istiyorum', 'olmadı', 'olmadi'];
const ISIM_DISI = new Set(['ben', 'biz', 'sen', 'o', 'var', 'kişi', 'kisi', 'kişiyiz', 'kisiyiz', 'çalışıyoruz', 'calisiyoruz', 'çalışıyor', 'calisiyor', 've', 'ile']);

const buyukHarf = (s) => s.split(' ').map(k => k ? k.charAt(0).toLocaleUpperCase('tr') + k.slice(1) : k).join(' ');
const telGoster = (t) => { const d = String(t || '').replace(/\D/g, ''); return /^905\d{9}$/.test(d) ? `0${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : d; };
const tlYaz = (n) => Number(n) > 0 ? `${Number(n).toLocaleString('tr-TR')}₺` : 'fiyat dükkânda';
const istanbulSaat = () => Number(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', hour12: false })) % 24;

// "250", "1.500" (binlik nokta), "250,50" → sayı
const SAYI = /\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?/g;
function sayiOku(x) {
  let t = String(x).trim();
  t = /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
// Yalnız fiyatlar yazıldıysa ("250 150 350 100", "250tl, 150tl") sayı listesi; harf varsa null (liste biçimi)
function yalnizSayilar(metin) {
  const t = String(metin || '').toLocaleLowerCase('tr').replace(/tl|₺|lira/g, ' ');
  if (!/\d/.test(t) || /\p{L}/u.test(t)) return null;
  const l = (t.match(SAYI) || []).map(sayiOku);
  return l.length && l.every(n => n != null && n >= 0 && n <= 100000) ? l : null;
}
// Hizmet adına göre süre: örnek listelerdeki aynı/benzer ad, yoksa 30 dk
function sureTahmin(isim) {
  const { hizmetSablonu } = require('./demo');
  const ad = isim.toLocaleLowerCase('tr');
  for (const [k] of KATEGORILER) {
    for (const [s, dk] of hizmetSablonu(k)) {
      const sa = s.toLocaleLowerCase('tr');
      if (ad === sa || ad.includes(sa) || sa.includes(ad)) return dk;
    }
  }
  return 30;
}
// Her satıra "hizmet fiyat" ("Saç kesim 250", "2. Sakal: 150 TL", "Boya (90 dk) 600")
function hizmetListesiOku(metin, mevcut = []) {
  const satirlar = String(metin || '').split(/\n|;|,(?!\d)/).map(x => x.trim()).filter(Boolean);
  const liste = [];
  for (const ham of satirlar) {
    const s = ham.replace(/^\s*(?:[-•*]+|\d{1,2}\s*[.)])\s*/, '').trim();
    const r = s.match(/^(.*?\p{L}.*?)\s*[:=\-–]?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:tl|₺|lira)?\s*\.?$/iu);
    if (!r) return { hata: ham.slice(0, 40), liste };
    let isim = r[1];
    let sure = null;
    const sm = isim.match(/\(?\s*(\d{1,3})\s*(?:dk|dakika|dak)\.?\s*\)?/i);
    if (sm) { sure = parseInt(sm[1]); isim = isim.replace(sm[0], ' '); }
    const ss = isim.match(/\(?\s*(\d)\s*saat\s*\)?/i);
    if (!sure && ss) { sure = parseInt(ss[1]) * 60; isim = isim.replace(ss[0], ' '); }
    isim = isim.replace(/[:=\-–]+\s*$/, '').replace(/\s+/g, ' ').trim();
    const fiyat = sayiOku(r[2]);
    if (isim.length < 2 || isim.length > 60 || fiyat == null || fiyat > 100000) return { hata: ham.slice(0, 40), liste };
    const es = mevcut.find(h => h.isim.toLocaleLowerCase('tr') === isim.toLocaleLowerCase('tr'));
    liste.push({ isim: es ? es.isim : buyukHarf(isim), fiyat, sure: sure || es?.sure_dk || sureTahmin(isim) });
  }
  return { liste };
}
// "Ahmet, Mehmet ve Ayşe" / alt alta → isimler
function isimleriOku(metin) {
  const parcalar = String(metin || '').split(/,|\n|;|\/|&|\+| ve | ile /i).map(x => x.replace(/^\s*(?:[-•*]+|\d{1,2}\s*[.)])\s*/, '').replace(/[^\p{L}\s.'-]/gu, ' ').replace(/\s+/g, ' ').trim());
  const sonuc = [];
  for (const p of parcalar) {
    const kelimeler = p.split(' ').filter(k => k && !ISIM_DISI.has(k.toLocaleLowerCase('tr')));
    if (!kelimeler.length || kelimeler.length > 3) continue;
    const ad = buyukHarf(kelimeler.join(' ').toLocaleLowerCase('tr'));
    if (ad.length < 2 || ad.length > 40) continue;
    if (!sonuc.some(x => x.toLocaleLowerCase('tr') === ad.toLocaleLowerCase('tr'))) sonuc.push(ad);
  }
  return sonuc.slice(0, 30);
}
// "1" / "berberim" → kategori adı; "0"/"diğer" → null; anlaşılmadı → undefined
function kategoriOku(metin) {
  const n = String(metin || '').match(/^\s*(\d)\s*[.)]?\s*$/);
  if (n) { const i = parseInt(n[1]); return i === 0 ? null : (KATEGORILER[i - 1]?.[0] ?? undefined); }
  const s = sade(metin);
  const es = [['berber', 'berber'], ['kuaf', 'kuaför'], ['güzellik', 'güzellik salonu'], ['guzellik', 'güzellik salonu'], ['tırnak', 'tırnak salonu'],
    ['manikür', 'tırnak salonu'], ['diş', 'diş kliniği'], ['dis klinik', 'diş kliniği'], ['veteriner', 'veteriner'], ['diyet', 'diyetisyen'],
    ['spa', 'spa'], ['masaj', 'spa'], ['dövme', 'dövme'], ['dovme', 'dövme'], ['tattoo', 'dövme']];
  for (const [k, ad] of es) if (s.includes(' ' + k)) return ad;
  if (icinde(s, ['diğer', 'diger', 'başka', 'baska'])) return null;
  return undefined;
}

class Otopilot {
  constructor() {
    this._dinlenen = new Set();     // bağlanma olayı dinlenen işletmeler
    this._biten = new Map();         // isletmeId → bitiş zamanı (olay + mesaj + denetim aynı anda bitirmesin)
    this.yaziyorMs = 1200;           // "yazıyor…" süresi (testte 0)
    this.wa = null;                  // testte sahte WhatsApp servisi
  }

  _wa() { return this.wa || require('./whatsappWeb'); }
  _bagliMi(isletmeId) { try { return this._wa().getDurum(isletmeId)?.durum === 'bagli'; } catch (e) { return false; } }
  _oku(x) { try { return typeof x === 'string' ? JSON.parse(x) : x || null; } catch (e) { return null; } }

  async _kaydet(telefon, d, kid) {
    const json = d ? JSON.stringify(d) : null;
    if (kid) return pool.query('UPDATE satis_konusmalar SET kurulum_durum = $1 WHERE id = $2', [json, kid]);
    return pool.query(`UPDATE satis_konusmalar SET kurulum_durum = $1 WHERE id = (SELECT id FROM satis_konusmalar
      WHERE telefon = $2 OR telefon = '+' || $2 OR telefon LIKE '%' || right($2, 10) ORDER BY (telefon = $2) DESC, olusturma_tarihi DESC LIMIT 1)`, [json, telefon]);
  }

  async _isletme(id) { return (await pool.query('SELECT id, isim, telefon, kategori, paket, slug FROM isletmeler WHERE id = $1', [id])).rows[0] || null; }
  async _hizmetler(id) { return (await pool.query('SELECT id, isim, sure_dk, fiyat FROM hizmetler WHERE isletme_id = $1 AND (aktif IS NULL OR aktif = true) ORDER BY id', [id])).rows; }
  async _sablonEkle(isletmeId, kategori) {
    const { hizmetSablonu } = require('./demo');
    for (const [isim, sure] of hizmetSablonu(kategori)) {
      await pool.query('INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES ($1, $2, $3, 0, true)', [isletmeId, isim, sure]);
    }
  }

  // Satış Bot üzerinden yaz (sohbetin geldiği numaradan; yoksa bağlı herhangi biri) ve konuşma kaydına ekle
  async _yaz(bot, d, txt, sock) {
    const s = sock || bot.numaraSockets?.get?.(d.numaraId)?.sock || bot._aktifSock?.()?.sock || bot.sock;
    if (!s || !d.jid) throw new Error('Satış Bot bağlı değil');
    if (this.yaziyorMs) { try { await s.sendPresenceUpdate?.('composing', d.jid); await new Promise(r => setTimeout(r, this.yaziyorMs)); } catch (e) { /* önemsiz */ } }
    const giden = await bot._yaz(s, d.jid, txt, { yaziyor: false });
    if (d.kid) Promise.resolve(bot._botKaydet?.(d.kid, giden)).catch(() => {});
    return giden;
  }

  // Ekibe haber: Sistem Uyarısı (aynı kurulum için tek kayıt) + Telegram (yarım saatte bir)
  async _yardim(bot, d, isletme, telefon, sebep) {
    await require('../utils/sistemUyari').uyar({ tip: 'kurulum', anahtar: `kurulum:${d.isletmeId}`, seviye: 'uyari', isletmeId: d.isletmeId,
      baslik: `Kurulumda yardım gerekiyor: ${isletme?.isim || '#' + d.isletmeId}`,
      detay: `${sebep} · adım: ${ADIM_AD[d.adim] || d.adim} · tel: +${telefon}` });
    if (d.yardimT && Date.now() - d.yardimT < 30 * 60 * 1000) return;
    d.yardimT = Date.now();
    const md = (x) => (bot._mdKacis ? bot._mdKacis(x) : String(x));
    try {
      await bot._telegramBildirimGonder?.(`🙋 *Kurulumda yardım gerekiyor*\n\n🏪 ${md(isletme?.isim || '')}\n📞 +${md(telefon)}\n📍 Adım: ${md(ADIM_AD[d.adim] || d.adim)}\n💬 ${md(sebep)}\n\n👉 Arayıp birlikte tamamlayın.`);
    } catch (e) { /* bildirim önemsiz */ }
  }

  // ── Sorular ──
  _kategoriSorusu() {
    return `Şimdi dükkânınızı buradan kuralım, 2 dakika sürer.\n\nÖnce: ne iş yapıyorsunuz? Numarasını yazmanız yeterli:\n` +
      KATEGORILER.map(([, ad], i) => `${i + 1}. ${ad}`).join('\n') + '\n0. Diğer';
  }
  _hizmetSorusu(hizmetler) {
    const ornekFiyat = [250, 150, 350, 100, 200, 300, 120, 180, 400, 90];
    return `*Adım 1/3: Hizmetler ve fiyatlar*\nSizin için şu listeyi hazırladım:\n` +
      hizmetler.map((h, i) => `${i + 1}. ${h.isim} (${h.sure_dk} dk)`).join('\n') +
      `\n\nFiyatları sırayla yazmanız yeterli, örnek: *${hizmetler.map((_, i) => ornekFiyat[i % 10]).join(' ')}*\n\n` +
      `Listeniz farklıysa her satıra bir hizmet ve fiyatını yazın:\n${hizmetler[0]?.isim || 'Saç kesim'} 250\n${hizmetler[1]?.isim || 'Sakal'} 150\n\n` +
      `Fiyat yazmak istemezseniz *geç* yazın (sayfada "fiyat dükkânda" görünür).`;
  }
  _calisanSorusu() {
    return `*Adım 2/3: Çalışanlar*\nDükkânda kimler çalışıyor? İsimleri virgülle ya da alt alta yazın, örnek: *Ahmet, Mehmet*\nTek başınıza çalışıyorsanız *sadece ben* yazın.`;
  }
  _numaraSorusu(telefon) {
    const tel = telefonNormalize(telefon);
    return `*Adım 3/3: WhatsApp bağlantısı*\nMüşterileriniz size WhatsApp'tan yazınca randevuyu bot alsın, siz uğraşmayın.\n\n` +
      (/^905\d{9}$/.test(tel)
        ? `Randevu mesajları bu numaraya mı geliyor: *${telGoster(tel)}*? Evetse *evet* yazın; başka numaraysa o numarayı yazın.`
        : `Randevu mesajları hangi numaraya geliyor? *05xx xxx xx xx* şeklinde yazın.`);
  }
  _kodMesaji(tel) {
    return `${telGoster(tel)} numaralı telefonda WhatsApp'ı açın:\n` +
      `1. Android: sağ üstte *⋮* → *Bağlı cihazlar*. iPhone: *Ayarlar* → *Bağlı cihazlar*\n` +
      `2. *Cihaz bağla*'ya basın, en alttaki *telefon numarasıyla bağla* seçeneğini seçin\n` +
      `3. Aşağıdaki kodu yazın\n\n` +
      `Bağlanınca size buradan haber vereceğim. Kod yaklaşık 2 dakika geçerli; süresi geçerse *kod* yazın.`;
  }

  // Kayıt bitince: gerekirse örnek hizmetleri koyar, durumu yazar, ilk soruyu döndürür (gönderimi satış botu yapar)
  async baslat({ isletmeId, telefon, jid, numaraId }) {
    const isletme = await this._isletme(isletmeId);
    if (!isletme) return null;
    let hizmetler = await this._hizmetler(isletmeId);
    const turBelli = isletme.kategori && isletme.kategori !== 'genel';
    if (!hizmetler.length && turBelli) { await this._sablonEkle(isletmeId, isletme.kategori); hizmetler = await this._hizmetler(isletmeId); }
    const kid = (await pool.query(`SELECT id FROM satis_konusmalar WHERE telefon = $1 OR telefon = '+' || $1 OR telefon LIKE '%' || right($1, 10)
      ORDER BY (telefon = $1) DESC, olusturma_tarihi DESC LIMIT 1`, [telefon])).rows[0]?.id || null;
    const adim = hizmetler.length ? 'hizmet' : 'kategori';
    const d = { isletmeId, adim, jid, numaraId: numaraId || null, kid, basla: Date.now(), t: Date.now(), deneme: 0, kodSayisi: 0, kodHata: 0 };
    await this._kaydet(telefon, d, kid);
    return adim === 'hizmet' ? `Şimdi dükkânınızı buradan kuralım, 2 dakika sürer.\n\n${this._hizmetSorusu(hizmetler)}` : this._kategoriSorusu();
  }

  // Gelen mesaj kurulumun parçasıysa işler ve true döner (false → satış botu normal akışa devam eder)
  async mesaj({ bot, konusma, telefon, jid, numaraId, sock, metin, pushName }) {
    const d = this._oku(konusma?.kurulum_durum);
    if (!d || !d.isletmeId) return false;
    d.kid = konusma.id;
    if (Date.now() - (d.t || 0) > UNUT_SAAT * 3600 * 1000) { await this._kaydet(telefon, null, d.kid); return false; }
    const isletme = await this._isletme(d.isletmeId);
    if (!isletme) { await this._kaydet(telefon, null, d.kid); return false; }
    if (jid) d.jid = jid;
    if (numaraId) d.numaraId = numaraId;
    if (pushName && !d.isim) d.isim = String(pushName).slice(0, 60);
    const s = sade(metin);
    const ctx = { bot, d, isletme, telefon, metin: String(metin || ''), s, kelime: kelimeSayisi(s), yaz: (txt) => this._yaz(bot, d, txt, sock) };

    if (icinde(s, IPTAL) && ctx.kelime <= 3) {
      await this._kaydet(telefon, null, d.kid);
      await ctx.yaz(`Tamam, kurulumu durdurdum. Kalan adımları istediğiniz zaman panelden yapabilirsiniz: ${PANEL}/?sayfa=${ADIM_SAYFA[d.adim] || 'hizmetler'}`);
      return true;
    }
    if (icinde(s, PANELDEN) && ctx.kelime <= 4) {
      await this._kaydet(telefon, null, d.kid);
      await ctx.yaz(`Tamam, kalan adımları panelden yapabilirsiniz: ${PANEL}/?sayfa=${ADIM_SAYFA[d.adim] || 'hizmetler'}\nTakılırsanız buraya yazın.`);
      return true;
    }
    if (icinde(s, YARDIM)) {
      await this._yardim(bot, d, isletme, telefon, `Esnaf yardım istedi: "${ctx.metin.slice(0, 120)}"`);
      await this._kaydet(telefon, d, d.kid);
      await ctx.yaz(`Ekibimize ilettim, kısa süre içinde sizi arayacaklar 🙏 Bu arada kaldığımız yerden devam edebiliriz.` +
        (d.adim === 'bagla' ? ' Yeni bağlantı kodu için *kod* yazın.' : ''));
      return true;
    }
    // WhatsApp bu arada bağlandıysa (koddan ya da panelden QR ile) kurulum biter
    if (['numara', 'bagla'].includes(d.adim) && this._bagliMi(d.isletmeId)) { await this._bitir(bot, d, telefon, isletme); return true; }

    if (d.adim === 'kategori') return this._kategori(ctx);
    if (d.adim === 'hizmet') return this._hizmet(ctx);
    if (d.adim === 'calisan') return this._calisan(ctx);
    if (d.adim === 'numara') return this._numara(ctx);
    if (d.adim === 'bagla') return this._bagla(ctx);
    return false;
  }

  // Anlaşılmayan cevap: tekrar sor; üçüncüde ekibe haber ver
  async _anlamadim(ctx, aciklama) {
    const { d, telefon } = ctx;
    d.deneme = (d.deneme || 0) + 1;
    if (d.deneme === 3) await this._yardim(ctx.bot, d, ctx.isletme, telefon, '3 kez anlaşılamayan cevap');
    await this._kaydet(telefon, d, d.kid);
    await ctx.yaz(`${aciklama}\n\n${d.deneme >= 3 ? 'Ekibimize de haber verdim, isterseniz sizi arayıp birlikte yapacaklar. ' : ''}Yardım için *yardım*, panelden devam etmek için *panel* yazın.`);
    return true;
  }

  async _ilerle(ctx, adim) {
    Object.assign(ctx.d, { adim, deneme: 0, t: Date.now() });
    await this._kaydet(ctx.telefon, ctx.d, ctx.d.kid);
  }

  async _kategori(ctx) {
    const sec = kategoriOku(ctx.metin);
    if (sec === undefined) return this._anlamadim(ctx, 'Listeden numarasını yazar mısınız? Örnek: *1* (berber). Listede yoksa *0* yazın.');
    const { KATEGORI_KOD } = require('./demo');
    await pool.query('UPDATE isletmeler SET kategori = $1 WHERE id = $2', [sec ? KATEGORI_KOD[sec] || 'genel' : 'genel', ctx.d.isletmeId]);
    if (!(await this._hizmetler(ctx.d.isletmeId)).length) await this._sablonEkle(ctx.d.isletmeId, sec || 'genel');
    await this._ilerle(ctx, 'hizmet');
    await ctx.yaz(this._hizmetSorusu(await this._hizmetler(ctx.d.isletmeId)));
    return true;
  }

  async _hizmet(ctx) {
    const { d, s, metin, isletme } = ctx;
    const hizmetler = await this._hizmetler(d.isletmeId);
    let kayit;
    if (icinde(s, GEC) && ctx.kelime <= 4) kayit = hizmetler;
    else {
      const fiyatlar = yalnizSayilar(metin);
      if (fiyatlar) {
        if (fiyatlar.length !== hizmetler.length) {
          return this._anlamadim(ctx, `Listede ${hizmetler.length} hizmet var, ${fiyatlar.length} fiyat yazdınız. Sırayla ${hizmetler.length} fiyat yazın ya da her satıra hizmet ve fiyat yazın.`);
        }
        for (const [i, h] of hizmetler.entries()) await pool.query('UPDATE hizmetler SET fiyat = $1 WHERE id = $2', [fiyatlar[i], h.id]);
        kayit = hizmetler.map((h, i) => ({ ...h, fiyat: fiyatlar[i] }));
      } else {
        const l = hizmetListesiOku(metin, hizmetler);
        if (l.hata || !l.liste.length) {
          return this._anlamadim(ctx, `${l.hata ? `"${l.hata}" satırını anlayamadım. ` : ''}Fiyatları sırayla yazın (örnek: *250 150*) ya da her satıra *hizmet adı ve fiyat* yazın, örnek: ${hizmetler[0]?.isim || 'Saç kesim'} 250`);
        }
        const paket = await paketGetir(isletme.paket);
        const yeni = l.liste.slice(0, paket.hizmet_limit || 10);
        // Eski liste: randevuya bağlı olmayan silinir, bağlı olan pasife alınır (geçmiş randevular bozulmasın)
        for (const h of hizmetler) {
          try { await pool.query('DELETE FROM hizmetler WHERE id = $1', [h.id]); }
          catch (e) { await pool.query('UPDATE hizmetler SET aktif = false WHERE id = $1', [h.id]); }
        }
        for (const h of yeni) {
          await pool.query('INSERT INTO hizmetler (isletme_id, isim, sure_dk, fiyat, aktif) VALUES ($1, $2, $3, $4, true)', [d.isletmeId, h.isim, h.sure, h.fiyat]);
        }
        kayit = yeni.map(h => ({ isim: h.isim, sure_dk: h.sure, fiyat: h.fiyat }));
        if (l.liste.length > yeni.length) d.hizmetFazla = l.liste.length - yeni.length;
      }
    }
    await this._ilerle(ctx, 'calisan');
    await ctx.yaz(`✅ Hizmetler kaydedildi:\n${kayit.map(h => `• ${h.isim} (${h.sure_dk} dk): ${tlYaz(h.fiyat)}`).join('\n')}` +
      (d.hizmetFazla ? `\n(Paketinizde en fazla ${kayit.length} hizmet var; kalan ${d.hizmetFazla} hizmet eklenmedi.)` : '') +
      `\nSüre ve fiyatları sonra panelden değiştirebilirsiniz.\n\n${this._calisanSorusu()}`);
    return true;
  }

  async _calisan(ctx) {
    const { d, s, metin, isletme } = ctx;
    const tek = icinde(s, TEK) && ctx.kelime <= 4;
    let isimler = tek ? [] : isimleriOku(metin);
    // "Ben ve Ali" → ben = esnafın WhatsApp adı
    if (tek || (icinde(s, ['ben']) && isimler.length)) {
      const kendi = isimleriOku(d.isim || '')[0] || 'Usta';
      if (!isimler.some(x => x.toLocaleLowerCase('tr') === kendi.toLocaleLowerCase('tr'))) isimler.unshift(kendi);
    }
    if (!isimler.length) return this._anlamadim(ctx, 'Çalışanların isimlerini virgülle ayırarak yazın, örnek: *Ahmet, Mehmet* (müşteri randevuda bu ismi görür). Tek başınıza çalışıyorsanız *sadece ben* yazın.');
    const paket = await paketGetir(isletme.paket);
    const limit = paket.calisan_limit || 1;
    const mevcut = (await pool.query('SELECT id, isim FROM calisanlar WHERE isletme_id = $1 AND (aktif IS NULL OR aktif = true) ORDER BY id', [d.isletmeId])).rows;
    // Demo/saha şablonundaki tek "Usta" esnafın verdiği ilk isme döner
    const sablon = mevcut.length === 1 && mevcut[0].isim === 'Usta' ? mevcut[0] : null;
    const gercek = sablon ? [] : mevcut;
    const yeniler = isimler.filter(x => !gercek.some(m => m.isim.toLocaleLowerCase('tr') === x.toLocaleLowerCase('tr')));
    const yer = Math.max(0, limit - gercek.length);
    const eklenecek = yeniler.slice(0, yer);
    const kalan = yeniler.slice(yer);
    for (const [i, ad] of eklenecek.entries()) {
      if (i === 0 && sablon) await pool.query('UPDATE calisanlar SET isim = $1 WHERE id = $2', [ad, sablon.id]);
      else await pool.query("INSERT INTO calisanlar (isletme_id, isim, uzmanlik, aktif) VALUES ($1, $2, '', true)", [d.isletmeId, ad]);
    }
    const hepsi = [...gercek.map(m => m.isim), ...eklenecek];
    await this._ilerle(ctx, 'numara');
    await ctx.yaz(`✅ Çalışanlar: ${hepsi.join(', ') || 'Usta'}` +
      (kalan.length ? `\n(${paket.isim || 'Paketiniz'} paketinde ${limit} çalışan var; ${kalan.join(', ')} için paketi yükseltebilirsiniz.)` : '') +
      `\n\n${this._numaraSorusu(ctx.telefon)}`);
    return true;
  }

  async _numara(ctx) {
    const { d, s, metin, telefon } = ctx;
    const yazilan = (metin.match(/\+?\d[\d\s().-]{8,}\d/) || [])[0];
    let tel = yazilan ? telefonNormalize(yazilan) : null;
    if (!yazilan && icinde(s, EVET) && ctx.kelime <= 4) tel = telefonNormalize(telefon);
    if (!tel || !/^905\d{9}$/.test(tel)) return this._anlamadim(ctx, 'Numarayı *05xx xxx xx xx* şeklinde yazar mısınız? Bu numaraysa *evet* yazın.');
    d.tel = tel;
    await this._ilerle(ctx, 'bagla');
    return this._kodGonder(ctx);
  }

  async _bagla(ctx) {
    const { s, metin } = ctx;
    if (icinde(s, YENI_KOD) && ctx.kelime <= 4) return this._kodGonder(ctx);
    if (/\bqr\b/i.test(metin)) {
      await ctx.yaz(`QR ile bağlamak için bilgisayardan ya da başka bir telefondan panele girin: ${PANEL}/?sayfa=botbaglanti\nEkrandaki QR'ı bu telefonun WhatsApp'ından (*Bağlı cihazlar* → *Cihaz bağla*) okutun.`);
      return true;
    }
    await ctx.yaz(`Kodu WhatsApp'a yazınca bağlantı kurulur ve size buradan haber veririm. Yeni kod için *kod*, yardım için *yardım* yazın.`);
    return true;
  }

  async _kodGonder(ctx) {
    const { bot, d, isletme, telefon } = ctx;
    if ((d.kodSayisi || 0) >= MAX_KOD) {
      await this._yardim(bot, d, isletme, telefon, `${MAX_KOD} kez kod istendi, WhatsApp bağlanmadı`);
      await this._kaydet(telefon, d, d.kid);
      await ctx.yaz(`Bağlantı bir türlü olmadı; ekibimize haber verdim, sizi arayıp birlikte bağlayacaklar. İsterseniz panelden QR ile de bağlayabilirsiniz: ${PANEL}/?sayfa=botbaglanti`);
      return true;
    }
    if (d.sonKod && Date.now() - d.sonKod < 30 * 1000) {
      await ctx.yaz('Kod az önce gönderildi. Yeni kod için yarım dakika bekleyip *kod* yazın.');
      return true;
    }
    d.kodSayisi = (d.kodSayisi || 0) + 1;
    d.sonKod = Date.now();
    await this._kaydet(telefon, d, d.kid);
    await ctx.yaz('Bağlantı kodunuzu alıyorum, birkaç saniye sürer…');
    try {
      const kod = String(await this._wa().eslestirmeKoduAl(d.isletmeId, isletme.isim, d.tel)).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      this._dinle(d.isletmeId);
      d.kodHata = 0; d.t = Date.now();
      await this._kaydet(telefon, d, d.kid);
      await ctx.yaz(this._kodMesaji(d.tel));
      await ctx.yaz(kod.length === 8 ? `${kod.slice(0, 4)}-${kod.slice(4)}` : kod);
    } catch (e) {
      d.kodHata = (d.kodHata || 0) + 1;
      if (d.kodHata >= 2) await this._yardim(bot, d, isletme, telefon, `WhatsApp eşleştirme kodu alınamadı: ${e.message}`);
      await this._kaydet(telefon, d, d.kid);
      await ctx.yaz(d.kodHata >= 2
        ? `WhatsApp şu an kod vermiyor. Ekibimize haber verdim, sizi arayıp birlikte bağlayacaklar. Bir dakika sonra *kod* yazıp yeniden deneyebilir ya da panelden QR ile bağlayabilirsiniz: ${PANEL}/?sayfa=botbaglanti`
        : 'WhatsApp kod vermedi; bir dakika sonra *kod* yazıp yeniden deneyelim.');
    }
    return true;
  }

  // Bağlantı olayı (sohbet beklerken): kod girilip WhatsApp açılınca kurulum biter
  _dinle(isletmeId) {
    if (this._dinlenen.has(isletmeId)) return;
    const wa = this._wa();
    if (typeof wa.once !== 'function') return;
    this._dinlenen.add(isletmeId);
    wa.once(`bagli_${isletmeId}`, () => {
      this._dinlenen.delete(isletmeId);
      setTimeout(() => this.baglandi(isletmeId).catch(e => console.error('Otopilot bağlantı sonrası:', e.message)), 3000);
    });
  }

  async baglandi(isletmeId, bot = require('./satisBot')) {
    const r = (await pool.query(
      "SELECT id, telefon, kurulum_durum FROM satis_konusmalar WHERE kurulum_durum IS NOT NULL AND kurulum_durum->>'isletmeId' = $1 ORDER BY id DESC LIMIT 1",
      [String(isletmeId)])).rows[0];
    const d = this._oku(r?.kurulum_durum);
    if (!d || !['numara', 'bagla'].includes(d.adim)) return false;
    d.kid = r.id;
    await this._bitir(bot, d, r.telefon, await this._isletme(isletmeId));
    return true;
  }

  async _bitir(bot, d, telefon, isletme) {
    if (Date.now() - (this._biten.get(d.isletmeId) || 0) < 60 * 1000) return;
    this._biten.set(d.isletmeId, Date.now());
    await this._kaydet(telefon, null, d.kid);
    const link = await require('../utils/randevuLinki').randevuLinki(isletme).catch(() => null);
    try {
      await this._yaz(bot, d,
        `🎉 Kurulum tamam! WhatsApp'ınız bağlandı, bot artık müşterilerinize randevu veriyor.\n\n` +
        (link ? `Randevu linkiniz: ${link}\n\n` : '') +
        `Deneyin: başka bir telefondan kendi numaranıza *merhaba* yazın; bot cevap verip randevu alsın.\n\n` +
        `Linki WhatsApp durumunuza ve Instagram profilinize koyun, ilk randevular gelsin. Randevularınızı panelden de görürsünüz: ${PANEL}`);
    } catch (e) { console.error('Otopilot bitiş mesajı gönderilemedi:', e.message); }
    await require('../utils/sistemUyari').coz(`kurulum:${d.isletmeId}`, 'otopilot');
    const dk = Math.max(1, Math.round((Date.now() - (d.basla || Date.now())) / 60000));
    const md = (x) => (bot._mdKacis ? bot._mdKacis(x) : String(x));
    try { await bot._telegramBildirimGonder?.(`✅ *Otopilot kurulumu bitirdi*\n\n🏪 ${md(isletme?.isim || '')}\n⏱️ ${dk} dk\n📱 WhatsApp bağlı`); } catch (e) { /* önemsiz */ }
  }

  // Yarım saatte bir: bağlananı bitir, 2 saat ilerlemeyeni ekibe bildir (09-21), 72 saati geçeni bırak
  async denetle(bot = require('./satisBot'), { saatKontrol = true } = {}) {
    let rows = [];
    try { rows = (await pool.query('SELECT id, telefon, kurulum_durum FROM satis_konusmalar WHERE kurulum_durum IS NOT NULL')).rows; }
    catch (e) { return 0; }
    const saat = istanbulSaat();
    let n = 0;
    for (const r of rows) {
      const d = this._oku(r.kurulum_durum);
      if (!d?.isletmeId) { await this._kaydet(r.telefon, null, r.id); continue; }
      d.kid = r.id;
      if (Date.now() - (d.t || 0) > UNUT_SAAT * 3600 * 1000) { await this._kaydet(r.telefon, null, r.id); continue; }
      if (['numara', 'bagla'].includes(d.adim) && this._bagliMi(d.isletmeId)) { await this._bitir(bot, d, r.telefon, await this._isletme(d.isletmeId)); n++; continue; }
      if (!d.uyarildi && Date.now() - (d.t || 0) > TAKILDI_SAAT * 3600 * 1000 && (!saatKontrol || (saat >= 9 && saat < 21))) {
        d.uyarildi = true;
        const isletme = await this._isletme(d.isletmeId);
        await this._yardim(bot, d, isletme, r.telefon, `${TAKILDI_SAAT} saattir ilerlemiyor`);
        await this._kaydet(r.telefon, d, r.id);
        n++;
      }
    }
    return n;
  }

  zamanlayiciBaslat() {
    if (this._zamanlayici) return;
    this._zamanlayici = setInterval(() => this.denetle().catch(e => console.error('Otopilot denetim:', e.message)), 30 * 60 * 1000);
  }
}

module.exports = new Otopilot();
module.exports._test = { yalnizSayilar, hizmetListesiOku, isimleriOku, kategoriOku, sayiOku, telGoster };
