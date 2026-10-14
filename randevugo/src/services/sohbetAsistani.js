// Sohbet asistanı (kullanıcı kararı 2026-10-14): numaralı menü yerine asistan gibi soru sorarak randevu.
//   Müşteri: "Randevu alacaktım"  → Asistan: "Tabii! Hangi gün gelmek istersiniz?"
//   Müşteri: "Yarın 3'te"         → Asistan: "Maalesef 15:00 dolu. 15:40 uygun mu?"
// İki katman:
//   ANLAMA  — önce kendi çözücümüz (utils/sekreterKomut: tarih, saat, hizmet), emin olunamazsa Gemini yalnız
//             bilgi ÇIKARIR (JSON). Yapay zekâ müşteriye cevap yazmaz; olmayan bir saati "boş" diyemez.
//   KARAR   — hangi sorunun sorulacağı, saatin boş olup olmadığı kodla belirlenir (musaitSaatleriGetir).
// Son onay eski akışın "onay" adımına devredilir: kapora linki, manuel onay, doğum günü sorusu aynen çalışır.
// Anlaşılmayan / randevu dışı mesajlarda null döner → eski menü akışı devam eder (yedek).
const pool = require('../config/db');
const { tarihBul, saatBul, hizmetBul, sade, gunEkle } = require('../utils/sekreterKomut');
const { bugunTarih } = require('../utils/tarih');

const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const haftaGunu = (t) => { const [y, a, g] = t.split('-').map(Number); return new Date(Date.UTC(y, a - 1, g)).getUTCDay(); };
const dk = (s) => { const [h, m] = String(s).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };
const s5 = (s) => String(s || '').slice(0, 5);

// Kısa metinler (bot 3 dil: tr/en/ar). Müşteriye "siz" diye hitap edilir.
const M = {
  tr: {
    selam: (i, l) => `Merhaba, ben ${i} asistanıyım 😊 Size nasıl yardımcı olabilirim?\n\nRandevu için gün ve saati yazmanız yeterli (ör. "yarın 3'te saç kesimi").` + (l ? `\nDilerseniz saatinizi buradan kendiniz de seçebilirsiniz:\n${l}` : ''),
    hizmet: (liste) => `Tabii! Hangi hizmet için randevu alalım?\n${liste}`,
    usta: (liste) => `Tercih ettiğiniz bir usta var mı? ${liste}\nFark etmezse "fark etmez" yazabilirsiniz.`,
    gun: () => `Tabii! Hangi gün gelmek istersiniz?`,
    saatler: (g, l) => `${g} için boş saatler: ${l}.\nSize hangisi uygun?`,
    dilimYok: (g, l) => `${g} o saatlerde boş yerimiz yok. Boş saatler: ${l}.\nSize hangisi uygun?`,
    dolu: (s, o) => `Maalesef ${s} dolu. ${o} uygun mu?`,
    gunDolu: (g, g2, l) => `Maalesef ${g} dolu 😔 En yakın boş gün ${g2}: ${l}.\nSize hangisi uygun?`,
    hepDolu: (g) => `Maalesef ${g} ve sonraki iki hafta dolu görünüyor. Başka bir gün yazabilir misiniz?`,
    kapali: (g) => `${g} kapalıyız. Başka bir gün olabilir mi?`,
    onay: (ozet) => `${ozet}\n\nRandevunuzu oluşturayım mı? ("evet" yazmanız yeterli)`,
    tekrar: () => `Peki, hangi gün ve saat size uygun olur?`,
    oneriYok: (s) => `Maalesef ${s} için uygun bir saat bulamadım. Başka bir saat yazabilir misiniz?`,
    ipucu: () => `Randevu için gün ve saati yazmanız yeterli 😊`,
    erken: (s) => `(Daha erken isterseniz ${s} de boş.)`,
  },
  en: {
    selam: (i, l) => `Hello, I'm the ${i} assistant 😊 How can I help you?\n\nTo book, just write the day and time (e.g. "tomorrow at 3, haircut").` + (l ? `\nOr pick a time yourself here:\n${l}` : ''),
    hizmet: (liste) => `Sure! Which service would you like to book?\n${liste}`,
    usta: (liste) => `Do you have a preferred staff member? ${liste}\nIf not, just write "any".`,
    gun: () => `Sure! Which day would you like to come?`,
    saatler: (g, l) => `Available times on ${g}: ${l}.\nWhich one suits you?`,
    dilimYok: (g, l) => `We're full at that time on ${g}. Available times: ${l}.\nWhich one suits you?`,
    dolu: (s, o) => `Sorry, ${s} is taken. Is ${o} OK?`,
    gunDolu: (g, g2, l) => `Sorry, ${g} is fully booked 😔 The nearest free day is ${g2}: ${l}.\nWhich one suits you?`,
    hepDolu: (g) => `Sorry, ${g} and the next two weeks look full. Could you suggest another day?`,
    kapali: (g) => `We're closed on ${g}. Would another day work?`,
    onay: (ozet) => `${ozet}\n\nShall I book it? (just reply "yes")`,
    tekrar: () => `OK, which day and time would suit you?`,
    oneriYok: (s) => `Sorry, I couldn't find a free time near ${s}. Could you suggest another time?`,
    ipucu: () => `To book, just write the day and time 😊`,
    erken: (s) => `(${s} is also free if you prefer earlier.)`,
  },
  ar: {
    selam: (i, l) => `مرحبًا، أنا مساعد ${i} 😊 كيف يمكنني مساعدتك؟\n\nللحجز اكتب اليوم والوقت فقط.` + (l ? `\nأو اختر الوقت بنفسك من هنا:\n${l}` : ''),
    hizmet: (liste) => `بالتأكيد! ما الخدمة التي تريد حجزها؟\n${liste}`,
    usta: (liste) => `هل تفضّل موظفًا معيّنًا؟ ${liste}\nإن لم يكن، اكتب "أي أحد".`,
    gun: () => `بالتأكيد! في أي يوم تريد الحضور؟`,
    saatler: (g, l) => `الأوقات المتاحة يوم ${g}: ${l}.\nأيّها يناسبك؟`,
    dilimYok: (g, l) => `لا يوجد مكان في ذلك الوقت يوم ${g}. الأوقات المتاحة: ${l}.\nأيّها يناسبك؟`,
    dolu: (s, o) => `عذرًا، الساعة ${s} محجوزة. هل يناسبك ${o}؟`,
    gunDolu: (g, g2, l) => `عذرًا، يوم ${g} محجوز بالكامل 😔 أقرب يوم متاح ${g2}: ${l}.\nأيّها يناسبك؟`,
    hepDolu: (g) => `عذرًا، يوم ${g} والأسبوعان التاليان محجوزة. هل يمكنك اقتراح يوم آخر؟`,
    kapali: (g) => `نحن مغلقون يوم ${g}. هل يناسبك يوم آخر؟`,
    onay: (ozet) => `${ozet}\n\nهل أؤكد الحجز؟ (اكتب "نعم")`,
    tekrar: () => `حسنًا، أي يوم ووقت يناسبك؟`,
    oneriYok: (s) => `عذرًا، لم أجد وقتًا متاحًا قريبًا من ${s}. هل يمكنك اقتراح وقت آخر؟`,
    ipucu: () => `للحجز اكتب اليوم والوقت فقط 😊`,
    erken: (s) => `(الساعة ${s} متاحة أيضًا إن أردت أبكر.)`,
  },
};

const EVET = /^(evet|e|olur|tamam|tmm|ok|okay|yes|yep|uygun|onayla|onayliyorum|onay|kabul|super|harika|aynen|👍|✅|نعم|اكيد|موافق|1)\b/;
const HAYIR = /^(hayir|yok|olmaz|istemiyorum|vazgec|no|nope|baska|degil|uymaz|لا|2)\b/;
const FARK_ETMEZ = /\b(fark etmez|farketmez|kim olursa|herhangi|any|anyone|doesn'?t matter|farketmiyor|أي أحد)\b/;
// Eski akışın kendi yakaladığı konular: iptal, randevularım, puan, referans, sıra
const DEVRET = /\b(iptal|randevularim|randevum var mi|puan|sadakat|referans|davet|siram|sirada|cancel|my appointments|الغاء)\b/;
const SELAM = /^(merhaba|mrb|meraba|selam|slm|selamlar|sa|selamun aleykum|selamın aleyküm|iyi gunler|iyi aksamlar|gunaydin|hello|hi|hey|السلام عليكم|مرحبا)[\s!.,]*$/;
// Bilgi sorusu (fiyat, adres, saatler…): yapay zekâ yoksa da tanınsın
const BILGI = /\b(fiyat|ucret|kac para|ne kadar|kac tl|adres|nerede|neredesiniz|konum|yol tarifi|kacta acil|kacta kapan|calisma saat|acik misiniz|park|price|how much|cost|address|where|opening hours|سعر|كم|عنوان|أين)/;
const RANDEVU = /\b(randevu|sira al|yer var|musait|bos yer|bos saat|gelebilir miyim|gelmek istiyorum|appointment|book|booking|موعد|حجز)/;
const DILIM = (s) => /\bsabah|morning|صباح/.test(s) ? 'sabah' : /\b(ogle|ogleden sonra|ogleden|afternoon|بعد الظهر)/.test(s) ? 'ogle' : /\b(aksam|aksamustu|evening|مساء)/.test(s) ? 'aksam' : '';

function gunYazi(tarih, dil) {
  const [y, a, g] = tarih.split('-').map(Number);
  const bugun = bugunTarih();
  if (dil === 'tr') {
    const on = tarih === bugun ? 'Bugün' : tarih === gunEkle(bugun, 1) ? 'Yarın' : GUNLER[haftaGunu(tarih)];
    return `${on} (${g} ${AYLAR[a - 1]})`;
  }
  return new Date(Date.UTC(y, a - 1, g)).toLocaleDateString(dil === 'ar' ? 'ar' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

// Boş saatlerden okunabilir bir seçki: en fazla 6 saat, gün içine yayılmış
function saatSecki(saatler, n = 6) {
  if (saatler.length <= n) return saatler.map(s5);
  const adim = (saatler.length - 1) / (n - 1);
  return [...new Set(Array.from({ length: n }, (_, i) => s5(saatler[Math.round(i * adim)])))];
}
const dilimSuz = (saatler, dilim) => !dilim ? saatler : saatler.filter(s => dilim === 'sabah' ? dk(s) < 720 : dilim === 'ogle' ? dk(s) >= 720 && dk(s) < 1020 : dk(s) >= 1020);

// ── ANLAMA: Gemini'den yalnız bilgi çıkarımı (JSON) ──
async function yapayZekaAnla({ metin, isletme, hizmetler, calisanlar, durum, bugun }) {
  const g = require('../utils/gemini');
  if (!g.anahtarlar().length) return null;
  const sistem = `Bir randevu asistanının ANLAMA katmanısın. Müşterinin son mesajından bilgileri çıkar; cevap yazma.
Bugün: ${bugun} (${GUNLER[haftaGunu(bugun)]}). İşletme: ${isletme.isim}. Çalışma saatleri: ${s5(isletme.calisma_baslangic || '09:00')}-${s5(isletme.calisma_bitis || '19:00')}.
Hizmetler (id: ad): ${hizmetler.map(h => `${h.id}: ${h.isim}`).join('; ')}
Çalışanlar (id: ad): ${calisanlar.map(c => `${c.id}: ${c.isim}`).join('; ') || 'yok'}
Bilinenler: hizmet=${durum.secilen_hizmet_id || 'yok'}, tarih=${durum.secilen_tarih || 'yok'}, saat=${durum.secilen_saat || 'yok'}. Asistanın son sorusu: ${durum.sohbet_bekleyen || 'yok'}.
Kurallar: Tarihi YYYY-MM-DD ver ("yarın", "cuma", "haftaya salı" gibi ifadeleri bugüne göre çevir). Saati HH:MM ver; "3'te", "3 gibi" gibi saatler çalışma saatine göre öğleden sonradır (15:00). Belirsiz zaman ("öğleden sonra") için saat verme, dilim ver. Hizmet adı tam geçmese de en yakın hizmetin id'sini ver ("saç" → saç kesimi). Mesajda olmayan bilgiyi uydurma, boş bırak.`;
  try {
    const j = await g.geminiIstek({
      systemInstruction: { parts: [{ text: sistem }] },
      contents: [{ role: 'user', parts: [{ text: String(metin).slice(0, 500) }] }],
      generationConfig: {
        temperature: 0, maxOutputTokens: 1024, responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            niyet: { type: 'STRING', enum: ['randevu', 'onay', 'red', 'bilgi', 'iptal', 'selam', 'diger'] },
            hizmet_id: { type: 'INTEGER' }, calisan_id: { type: 'INTEGER' }, fark_etmez: { type: 'BOOLEAN' },
            tarih: { type: 'STRING' }, saat: { type: 'STRING' }, dilim: { type: 'STRING', enum: ['', 'sabah', 'ogle', 'aksam'] },
          },
          required: ['niyet'],
        },
      },
    }, { sure: 10000 });
    const t = JSON.parse(g.metniAl(j) || 'null');
    return t && typeof t === 'object' ? t : null;
  } catch (e) { return null; }
}

// Mesajdan bilgi: önce kendi çözücümüz, eksik kalanı yapay zekâ
async function anla({ metin, isletme, hizmetler, calisanlar, durum }) {
  const bugun = bugunTarih();
  const s = ' ' + sade(metin).replace(/[!?,;]+/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const sonuc = { niyet: null, hizmetId: null, calisanId: null, farkEtmez: FARK_ETMEZ.test(s), tarih: null, saat: null, dilim: DILIM(s) };
  const t = tarihBul(s, bugun); if (t.kelime) sonuc.tarih = t.tarih;
  const st = saatBul(s.replace(/\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/, ' ')); if (st) sonuc.saat = st.saat;
  const hz = hizmetBul(s, hizmetler); if (hz.ad) sonuc.hizmetId = hz.hizmet.id;
  const usta = calisanlar.find(c => new RegExp(`\\b${sade(c.isim).split(' ')[0]}\\b`).test(s)); if (usta) sonuc.calisanId = usta.id;
  const trimli = s.trim();
  if (SELAM.test(trimli)) sonuc.niyet = 'selam';
  else if (EVET.test(trimli) && trimli.split(' ').length <= 4) sonuc.niyet = 'onay';
  else if (HAYIR.test(trimli) && trimli.split(' ').length <= 4 && !sonuc.tarih && !sonuc.saat) sonuc.niyet = 'red';
  else if (BILGI.test(s) && !sonuc.tarih && !sonuc.saat) sonuc.niyet = 'bilgi';
  else if (RANDEVU.test(s) || sonuc.tarih || sonuc.saat || sonuc.hizmetId) sonuc.niyet = 'randevu';

  // Kısa ve net mesajlarda yapay zekâya gerek yok ("evet", "15:40", "yarın"); diğerlerinde eksikleri tamamla
  const kisaNet = sonuc.niyet && trimli.split(' ').length <= 3;
  if (!kisaNet) {
    const yz = await yapayZekaAnla({ metin, isletme, hizmetler, calisanlar, durum, bugun });
    if (yz) {
      if (!sonuc.niyet || (sonuc.niyet === 'randevu' && ['bilgi', 'iptal'].includes(yz.niyet))) sonuc.niyet = yz.niyet;
      if (!sonuc.tarih && /^\d{4}-\d{2}-\d{2}$/.test(yz.tarih || '') && yz.tarih >= bugun && yz.tarih <= gunEkle(bugun, 90)) sonuc.tarih = yz.tarih;
      if (!sonuc.saat && /^\d{2}:\d{2}$/.test(yz.saat || '')) sonuc.saat = yz.saat;
      if (!sonuc.hizmetId && hizmetler.some(h => h.id === yz.hizmet_id)) sonuc.hizmetId = yz.hizmet_id;
      if (!sonuc.calisanId && calisanlar.some(c => c.id === yz.calisan_id)) sonuc.calisanId = yz.calisan_id;
      if (yz.fark_etmez) sonuc.farkEtmez = true;
      if (!sonuc.dilim && yz.dilim) sonuc.dilim = yz.dilim;
    }
  }
  return sonuc;
}

// ── KARAR ──
// wa: whatsappWeb örneği (durumGuncelle, akisIsle, tarihFormat, saatFormat için)
async function isle({ wa, metin, botDurum, isletme, hizmetler, musteriTelefon, isletmeId }) {
  if (isletme.bot_tarzi === 'menu') return null;
  if (!['baslangic', 'ana_menu', 'sohbet'].includes(botDurum.asama || 'baslangic')) return null;   // eski akışın özel adımları (iptal, bekleme, doğum günü…)
  if (!hizmetler.length) return null;
  const dil = ['en', 'ar'].includes(isletme._musteriDil) ? isletme._musteriDil : 'tr';
  const T = M[dil];
  const s = ' ' + sade(metin) + ' ';
  if (DEVRET.test(s)) return null;

  const randevuService = require('./randevu');
  const calisanlar = (await pool.query('SELECT id, isim FROM calisanlar WHERE isletme_id = $1 AND (aktif IS NULL OR aktif = true) ORDER BY id', [isletmeId])).rows;
  const d = { ...botDurum };
  if (d.secilen_tarih) d.secilen_tarih = require('../utils/tarih').tarihFormatla(d.secilen_tarih);
  if (d.secilen_saat) d.secilen_saat = s5(d.secilen_saat);
  const surecte = d.asama === 'sohbet';
  const a = await anla({ metin, isletme, hizmetler, calisanlar, durum: d });

  if (a.niyet === 'selam' && !surecte) {
    await kaydet(wa, musteriTelefon, isletmeId, 'ana_menu', {});
    // Randevu linki WhatsApp'ta önizleme kartıyla açılır (düğme yerine)
    let link = null; try { link = await require('../utils/randevuLinki').randevuLinki(isletme); } catch (e) { /* link olmadan */ }
    return T.selam(isletme.isim, link);
  }
  if (a.niyet === 'iptal') return null;
  if (a.niyet === 'bilgi' || ((!a.niyet || a.niyet === 'diger') && !surecte)) {
    // Soru (fiyat, adres, saatler…): yapay zekâ işletme bilgisiyle kısa cevap verir; menü gösterilmez
    const cevap = await require('./deepseek').serbetCevap(metin, isletme, hizmetler, 'whatsapp').catch(() => null);
    if (!surecte) {
      if (!cevap) return null;                                         // yapay zekâ yok → eski akış
      await kaydet(wa, musteriTelefon, isletmeId, 'ana_menu', {});
      return `${cevap}\n\n${T.ipucu()}`;
    }
    // Süreç ortasında soru: kısa cevap + kaldığımız soru
    const devam = await sonrakiAdim({ wa, d, a: {}, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId });
    return cevap ? `${cevap}\n\n${devam}` : devam;
  }

  // Onay bekliyorduk
  if (d.sohbet_bekleyen === 'onay') {
    if (a.niyet === 'onay' && !a.saat && !a.tarih) {
      // Eski akışın onay adımı: randevu oluşturma, kapora linki, manuel onay, doğum günü sorusu
      await kaydet(wa, musteriTelefon, isletmeId, 'onay', { sohbet_bekleyen: null });
      const guncel = (await pool.query('SELECT * FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [musteriTelefon, isletmeId])).rows[0];
      return await wa.akisIsle('1', guncel, isletme, hizmetler, musteriTelefon, isletmeId);
    }
    if (a.niyet === 'red' && !a.saat && !a.tarih) {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { secilen_saat: null, sohbet_bekleyen: 'saat' });
      return T.tekrar();
    }
  }
  // Hizmet sorulmuştu: rakam ("2") ya da adın bir parçası ("saç") → tek eşleşme varsa o hizmet
  if (d.sohbet_bekleyen === 'hizmet' && !a.hizmetId) {
    if (/^\s*\d{1,2}\s*$/.test(metin)) { const h = hizmetler[Number(metin) - 1]; if (h) a.hizmetId = h.id; }
    else {
      const kel = sade(metin).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
      const es = hizmetler.filter(h => sade(h.isim).split(/[^a-z0-9]+/).some(p => kel.some(k => p.startsWith(k) || k.startsWith(p))));
      if (es.length === 1) a.hizmetId = es[0].id;
    }
  }

  // Bilgileri işle: yeni gün/saat gelirse eskisinin üzerine yazılır
  if (a.hizmetId) d.secilen_hizmet_id = a.hizmetId;
  if (a.calisanId) d.secilen_calisan_id = a.calisanId;
  if (a.farkEtmez) d._fark_etmez = true;
  if (a.tarih && a.tarih !== d.secilen_tarih) { d.secilen_tarih = a.tarih; d.secilen_saat = null; }
  if (a.saat) d.secilen_saat = a.saat;
  d._dilim = a.dilim;
  if (!surecte && a.niyet !== 'randevu' && !a.tarih && !a.saat && !a.hizmetId) return null;
  return await sonrakiAdim({ wa, d, a, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId });
}

async function sonrakiAdim({ wa, d, a, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId }) {
  // secilen_calisan_id = 0 → müşteri "fark etmez" dedi (saat seçilince o saatte boş usta atanır)
  const alan = { secilen_hizmet_id: d.secilen_hizmet_id || null, secilen_tarih: d.secilen_tarih || null,
    secilen_saat: d.secilen_saat || null, secilen_calisan_id: d.secilen_calisan_id ?? null };

  // 1) Hizmet
  if (!alan.secilen_hizmet_id) {
    if (hizmetler.length === 1) alan.secilen_hizmet_id = hizmetler[0].id;
    else {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'hizmet' });
      const liste = hizmetler.slice(0, 10).map(h => `• ${h.isim}${Number(h.fiyat) > 0 ? ` · ${Number(h.fiyat).toLocaleString('tr-TR')}₺` : ''}`).join('\n');
      return T.hizmet(liste);
    }
  }
  const hizmet = hizmetler.find(h => h.id === alan.secilen_hizmet_id);

  // 2) Usta: müşteri seçer modunda ve birden çok usta varsa bir kez sorulur. Cevapta usta tanınmazsa "fark etmez" sayılır.
  const uygun = await randevuService.uygunCalisanlar(isletmeId, alan.secilen_hizmet_id).catch(() => calisanlar);
  const secimModu = isletme.calisan_secim_modu || 'musteri';
  if (alan.secilen_calisan_id === null && uygun.length === 1) alan.secilen_calisan_id = uygun[0].id;
  if (alan.secilen_calisan_id === null && uygun.length > 1) {
    if (secimModu !== 'musteri' || d._fark_etmez || d.sohbet_bekleyen === 'usta') alan.secilen_calisan_id = 0;
    else {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'usta' });
      return T.usta(uygun.map(c => c.isim).join(', '));
    }
  }
  const ustaBelli = Number(alan.secilen_calisan_id) > 0;

  // 3) Gün
  if (!alan.secilen_tarih) {
    await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'tarih' });
    return T.gun();
  }

  // 4) Saat: usta belli değilse bütün uygun ustaların boş saatleri birleşir; seçilen saatte boş olan usta atanır
  const ustaSaat = async (tarih) => {
    const ustalar = ustaBelli ? [{ id: alan.secilen_calisan_id }] : (uygun.length ? uygun : [{ id: null }]);
    const harita = new Map();
    for (const u of ustalar) {
      for (const sa of await randevuService.musaitSaatleriGetir(isletmeId, tarih, u.id, alan.secilen_hizmet_id)) {
        const k = s5(sa); if (!harita.has(k)) harita.set(k, u.id);
      }
    }
    return harita;
  };
  let harita = await ustaSaat(alan.secilen_tarih);
  let saatler = [...harita.keys()].sort();
  const gunY = gunYazi(alan.secilen_tarih, dil);

  if (!saatler.length) {
    const kapali = String(isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number).includes(haftaGunu(alan.secilen_tarih));
    // En yakın boş gün (14 gün)
    for (let i = 1; i <= 14; i++) {
      const t2 = gunEkle(alan.secilen_tarih, i);
      const h2 = await ustaSaat(t2);
      if (h2.size) {
        alan.secilen_tarih = t2; alan.secilen_saat = null;
        await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'saat' });
        const liste = saatSecki([...h2.keys()].sort()).join(', ');
        return kapali ? `${T.kapali(gunY)}\n${T.saatler(gunYazi(t2, dil), liste)}` : T.gunDolu(gunY, gunYazi(t2, dil), liste);
      }
    }
    await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, secilen_tarih: null, sohbet_bekleyen: 'tarih' });
    return T.hepDolu(gunY);
  }

  if (!alan.secilen_saat) {
    const dilimli = dilimSuz(saatler, d._dilim);
    await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'saat' });
    if (d._dilim && !dilimli.length) return T.dilimYok(gunY, saatSecki(saatler).join(', '));
    return T.saatler(gunY, saatSecki(dilimli.length ? dilimli : saatler).join(', '));
  }

  // İstenen saat dolu → en yakın boş saat önerilir (onaylanırsa o saat)
  let saat = alan.secilen_saat;
  let oneriMetni = null;
  if (!harita.has(saat)) {
    const sonra = saatler.find(x => dk(x) > dk(saat) && dk(x) - dk(saat) <= 180);
    const once = [...saatler].reverse().find(x => dk(x) < dk(saat) && dk(saat) - dk(x) <= 180);
    const oneri = sonra || once;
    if (!oneri) {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, secilen_saat: null, sohbet_bekleyen: 'saat' });
      return `${T.oneriYok(saat)}\n${T.saatler(gunY, saatSecki(saatler).join(', '))}`;
    }
    oneriMetni = T.dolu(saat, oneri) + (sonra && once ? ` ${T.erken(once)}` : '');
    saat = oneri;
  }
  alan.secilen_saat = saat;
  if (!ustaBelli) alan.secilen_calisan_id = harita.get(saat) || null;
  await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'onay' });
  if (oneriMetni) return oneriMetni;
  const usta = alan.secilen_calisan_id ? (uygun.find(c => c.id === alan.secilen_calisan_id) || calisanlar.find(c => c.id === alan.secilen_calisan_id)) : null;
  const ozet = `📅 ${gunY} · 🕐 ${saat}\n✂️ ${hizmet?.isim || ''}${usta && uygun.length > 1 ? ` · 👤 ${usta.isim}` : ''}`;
  return T.onay(ozet);
}

async function kaydet(wa, tel, isletmeId, asama, alanlar) {
  const temiz = Object.fromEntries(Object.entries(alanlar).filter(([k]) => !k.startsWith('_')));
  await wa.durumGuncelle(tel, isletmeId, asama, temiz);
}

module.exports = { isle, anla, saatSecki, M };
