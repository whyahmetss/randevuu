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

// Karşılamadaki örnek hizmet (2026-10-27): masaj salonunda "yarın 3'te saç kesimi" yazıyordu. Sıra: panelde esnafın yazdığı →
// öne çıkan hizmet → ilk hizmet → kategoriye göre genel ad. Uzun hizmet adı örneği bozmasın diye kategoriye düşer.
const KATEGORI_ORNEK = [
  [/masaj|spa|wellness/, 'masaj', 'massage'], [/berber|barber/, 'saç kesimi', 'haircut'], [/kuaf[oö]r|sa[cç]/, 'fön', 'blow-dry'],
  [/t[ıi]rnak|nail|man[ıi]k[uü]r/, 'manikür', 'manicure'], [/g[uü]zellik|beauty|cilt|estetik/, 'cilt bakımı', 'facial'],
  [/di[sş]|dent/, 'muayene', 'check-up'], [/veteriner|vet/, 'muayene', 'check-up'], [/d[oö]vme|tattoo/, 'dövme', 'tattoo'],
  [/epilasyon|lazer/, 'lazer epilasyon', 'laser hair removal'], [/diyet|beslenme/, 'görüşme', 'consultation'],
];
const unvan = (isletme, dil) => require('../utils/calisanUnvani').calisanUnvani(isletme)[dil === 'en' ? 'en' : 'tr'];
function ornekHizmet(isletme, hizmetler, dil) {
  const elle = String(isletme.bot_ornek_hizmet || '').trim();
  if (elle) return elle;
  const h = hizmetler.find(x => x.one_cikan) || hizmetler[0];
  const ad = h && String((dil === 'en' && h.isim_en) || h.isim || '').trim();
  if (ad && ad.length <= 30 && (dil === 'tr' || h.isim_en)) return ad;
  const k = sade(isletme.kategori || '');
  const e = KATEGORI_ORNEK.find(([re]) => re.test(k));
  return e ? (dil === 'en' ? e[2] : e[1]) : (dil === 'en' ? 'appointment' : 'randevu');
}

// Kısa metinler (bot 3 dil: tr/en/ar). Müşteriye "siz" diye hitap edilir.
const M = {
  tr: {
    selam: (i, l, h) => `Merhaba, ben ${i} asistanıyım 😊 Size nasıl yardımcı olabilirim?\n\nRandevu için gün ve saati yazmanız yeterli (ör. "yarın 3'te ${h}").` + (l ? `\nDilerseniz saatinizi buradan kendiniz de seçebilirsiniz:\n${l}` : ''),
    hizmet: (liste) => `Tabii! Hangi hizmet için randevu alalım?\n${liste}`,
    hizmetTekrar: (liste) => `Hangi hizmeti istediğinizi anlayamadım 🙏 Listeden numarasını yazmanız yeterli (ör. *1*):\n${liste}`,
    usta: (liste, u = 'usta') => `Tercih ettiğiniz bir ${u} var mı? ${liste}\nFark etmezse "fark etmez" yazabilirsiniz.`,
    gun: () => `Tabii! Hangi gün gelmek istersiniz?`,
    saatler: (g, l) => `${g} için boş saatler: ${l}.\nSize hangisi uygun?`,
    saatSor: () => `Hangi saati istediğinizi yazar mısınız? (ör. "14:30" ya da "en erken")`,
    bugunBitti: (g2, l) => `Bugün için boş saatimiz kalmadı 😔 En yakın boş gün ${g2}: ${l}.\nSize hangisi uygun?`,
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
    kisi: (n, u = 'usta') => `${n} kişi (boş ${u} varsa aynı saatte, yoksa arka arkaya)`,
  },
  en: {
    selam: (i, l, h) => `Hello, I'm the ${i} assistant 😊 How can I help you?\n\nTo book, just write the day and time (e.g. "tomorrow at 3, ${h}").` + (l ? `\nOr pick a time yourself here:\n${l}` : ''),
    hizmet: (liste) => `Sure! Which service would you like to book?\n${liste}`,
    usta: (liste, u = 'staff member') => `Do you have a preferred ${u}? ${liste}\nIf not, just write "any".`,
    gun: () => `Sure! Which day would you like to come?`,
    saatSor: () => `Which time would you like? (e.g. "14:30" or "earliest")`,
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
    kisi: (n) => `${n} people (same time if staff is free, otherwise back to back)`,
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
    saatSor: () => `ما الوقت الذي تريده؟ (مثلاً "14:30")`,
    oneriYok: (s) => `عذرًا، لم أجد وقتًا متاحًا قريبًا من ${s}. هل يمكنك اقتراح وقت آخر؟`,
    ipucu: () => `للحجز اكتب اليوم والوقت فقط 😊`,
    erken: (s) => `(الساعة ${s} متاحة أيضًا إن أردت أبكر.)`,
    kisi: (n) => `${n} أشخاص`,
  },
};

const EVET = /^(evet|e|olur|tamam|tmm|ok|okay|yes|yep|uygun|onayla|onayliyorum|onay|kabul|super|harika|aynen|👍|✅|نعم|اكيد|موافق|1)\b/;
const HAYIR = /^(hayir|yok|olmaz|istemiyorum|vazgec|no|nope|baska|degil|uymaz|لا|2)\b/;
// "şimdi/hemen" yok: "uyumuştum şimdi yine uyuyom" randevu sanılıyordu
const EN_ERKEN = /\b(en erken|en yakin|ilk bos|asap|earliest|soonest)\b/;
const FARK_ETMEZ = /\b(fark etmez|farketmez|kim olursa|herhangi|any|anyone|doesn'?t matter|farketmiyor|أي أحد)\b/;
// Eski akışın kendi yakaladığı konular: iptal, randevularım, puan, referans, sıra
const DEVRET = /\b(iptal|randevularim|randevum var mi|puan|sadakat|referans|davet|siram|sirada|cancel|my appointments|الغاء)\b/;
// Selam (2026-10-17): "selamün aleyküm abi kolay gelsin" de selamdır; selam + dolgu kelimeleri dışında bir şey yoksa
const SELAM_KELIME = /\b(merhaba(lar)?|mrb|meraba|selam(lar)?|slm|sa|as|s\.?a|selamun ?aleykum|aleykum ?selam|selamunaleykum|iyi gunler|iyi aksamlar|iyi sabahlar|hayirli (gunler|aksamlar|isler|sabahlar)|gunaydin|kolay gelsin|hello|hi|hey|السلام عليكم|مرحبا)\b/g;
const SELAM_DOLGU = /\b(abi|abim|abey|kardes|kardesim|hocam|usta|ustam|kral|reis|bey|hanim|efendim|nasilsiniz|iyisiniz|insallah|ve)\b/g;
const selamMi = (t) => { const sade1 = t.replace(/[!.,?🙏😊👋🏻]/g, ' '); SELAM_KELIME.lastIndex = 0;
  return SELAM_KELIME.test(sade1) && !sade1.replace(SELAM_KELIME, ' ').replace(SELAM_DOLGU, ' ').trim(); };
const SELAM = { test: (t) => selamMi(t) };
// Bilgi sorusu (fiyat, adres, saatler…): yapay zekâ yoksa da tanınsın
const BILGI = /\b(fiyat|ucret|kac para|ne kadar|kac tl|adres|nerede|neredesiniz|konum|yol tarifi|kacta acil|kacta kapan|calisma saat|acik misiniz|park|price|how much|cost|address|where|opening hours|سعر|كم|عنوان|أين)/;
const DUKKAN_SORU = /\b(hizmet|kampanya|indirim|odeme|kart|nakit|iban|kac dakika|ne kadar surer|bekleme|sira|acik mi|acik misin|calisiyor mu|bugun acik|yarin acik|pazar acik|rezervasyon|kac kisi)/;
const RANDEVU = /\b(randevu|sira al|yer var|musait|bos yer|bos saat|gelebilir miyim|gelmek istiyorum|appointment|book|booking|موعد|حجز)/;
// Niteleyicisiz "tıraş" ("tıraş olmak istiyorum", "traşa gelsem") belirsiz: berberde çoğu zaman saç kesimi, sakal da
// olabilir (canlı 2026-10-19: liste yalnız Sakal/Çocuk tıraşı gösterdi, saç kesimi yoktu). Tahmin edilmez, sorulur.
const TIRAS_NITELEYICI = /\b(sakal|sac|cocuk|ense|kafa|bebek|damat|ustura|kirli|yuz|perma)/;
const tirasBelirsiz = (s) => /\bt[iı]?ras/.test(s) && !TIRAS_NITELEYICI.test(s);
// Çok kişilik (2026-10-22): "2 kişiyiz", "iki kişilik", "ikimiz", "oğlumla geleceğim", "ben ve eşim" → kişi sayısı.
// Eşleşen parça metinden çıkarılır: "yarın 2 kişiyiz"deki 2 saat (14:00) sanılmasın.
const YAKIN = '(oglum|kizim|esim|kardesim|arkadasim|babam|annem|abim|ablam|kocam|karim|yegenim|cocugum|nisanlim|sevgilim)';
const KISI_KALIP = [
  [/\b([2-5]) ?(kisi|kisiyiz|kisilik|kisiye|kisi icin|people|persons|person)\b/, (m) => Number(m[1])],
  [/\b(iki|uc|dort|bes) ?(kisi|kisiyiz|kisilik|kisiye)\b/, (m) => ({ iki: 2, uc: 3, dort: 4, bes: 5 })[m[1]]],
  [/\b(ikimiz|ikimize|ikimizin|two of us)\b/, () => 2],
  [/\b(ucumuz|ucumuze|three of us)\b/, () => 3],
  [new RegExp(`\\b${YAKIN}(la|le|lan|len|la beraber|le beraber| ile)\\b`), () => 2],
  [new RegExp(`\\bben ve ${YAKIN}\\b|\\b${YAKIN} ve ben\\b`), () => 2],
];
function kisiBul(s) {
  for (const [re, n] of KISI_KALIP) { const m = s.match(re); if (m) return { kisi: n(m), metin: m[0] }; }
  return null;
}
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

// Boş saatlerin okunur metni (2026-10-17): eski "6 saat seç" yöntemi 10:00 boşken 09:00, 11:30… gösteriyordu, müşteri
// istediği saat yok sanıyordu. Artık hiçbir boş saat gizlenmez: ardışık saatler aralık olur ("09:00–12:00 arası, 15:50").
function saatSecki(saatler, dil = 'tr') {
  const l = [...new Set(saatler.map(s5))].sort();
  if (l.length <= 6) return l.join(', ');
  let adim = Infinity;
  for (let i = 1; i < l.length; i++) adim = Math.min(adim, dk(l[i]) - dk(l[i - 1]));
  const esik = Math.max(adim, 30);
  const diziler = [];
  for (const x of l) {
    const son = diziler[diziler.length - 1];
    if (son && dk(x) - dk(son[son.length - 1]) <= esik) son.push(x); else diziler.push([x]);
  }
  const arasi = { tr: ' arası', en: '', ar: '' }[dil] ?? '';
  return diziler.map(d => d.length >= 3 ? `${d[0]}–${d[d.length - 1]}${arasi}` : d.join(', ')).join(', ');
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
Kurallar: Yalnız "tıraş/traş olmak" denip ne tıraşı olduğu söylenmediyse hizmet_id verme (saç kesimi de olabilir). Tarihi YYYY-MM-DD ver ("yarın", "cuma", "haftaya salı" gibi ifadeleri bugüne göre çevir). Saati HH:MM ver; "3'te", "3 gibi" gibi saatler çalışma saatine göre öğleden sonradır (15:00). Belirsiz zaman ("öğleden sonra") için saat verme, dilim ver. Hizmet adı tam geçmese de en yakın hizmetin id'sini ver ("saç" → saç kesimi). Randevu birden çok kişi içinse ("2 kişiyiz", "oğlumla geleceğiz") kisi_sayisi ver; tek kişiyse boş bırak. Mesajda olmayan bilgiyi uydurma, boş bırak.`;
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
            tarih: { type: 'STRING' }, saat: { type: 'STRING' }, dilim: { type: 'STRING', enum: ['sabah', 'ogle', 'aksam'] },
            kisi_sayisi: { type: 'INTEGER' },
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
  let s = ' ' + sade(metin).replace(/[!?,;]+/g, ' ').replace(/\.(?!\d)/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const kb = kisiBul(s);
  if (kb) s = s.replace(kb.metin, ' ');
  const sonuc = { kisi: kb?.kisi || null, niyet: null, hizmetId: null, calisanId: null, farkEtmez: FARK_ETMEZ.test(s), tarih: null, saat: null, dilim: DILIM(s) };
  const t = tarihBul(s, bugun); if (t.kelime) sonuc.tarih = t.tarih;
  // Yalnız gerçekten tarih olarak okunan "19.10" silinir; "19 ekim 13.00"daki 13.00 saattir (önceden siliniyordu)
  const st = saatBul(t.metin ? s.replace(t.metin, ' ') : s); if (st) sonuc.saat = st.saat;
  // Çıplak sayı ("yarın 10", saat sorulmuşken "17", "yok 11 olsun") saattir; hizmet/usta sorulurken rakam seçimdir
  if (!sonuc.saat && !['hizmet', 'usta'].includes(durum?.sohbet_bekleyen) && (t.kelime || ['saat', 'onay'].includes(durum?.sohbet_bekleyen))) {
    const yalin = (t.metin ? s.replace(t.metin, ' ') : s).replace(/\b\d{1,2} (ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)\b/, ' ');
    const sayilar = yalin.match(/(?:^| )\d{1,2}(?= |$)/g) || [];
    const h = sayilar.length === 1 ? Number(sayilar[0]) : NaN;
    if (h >= 1 && h <= 23) sonuc.saat = `${String(h >= 1 && h <= 7 ? h + 12 : h).padStart(2, '0')}:00`;
  }
  if (EN_ERKEN.test(s)) sonuc.enErken = true;
  const hz = hizmetBul(s, hizmetler); if (hz.ad) sonuc.hizmetId = hz.hizmet.id;
  const usta = calisanlar.find(c => new RegExp(`\\b${sade(c.isim).split(' ')[0]}\\b`).test(s)); if (usta) sonuc.calisanId = usta.id;
  const trimli = s.trim();
  if (SELAM.test(trimli)) sonuc.niyet = 'selam';
  else if (EVET.test(trimli) && trimli.split(' ').length <= 4) sonuc.niyet = 'onay';
  else if (HAYIR.test(trimli) && trimli.split(' ').length <= 4 && !sonuc.tarih && !sonuc.saat) sonuc.niyet = 'red';
  else if (BILGI.test(s) && !sonuc.tarih && !sonuc.saat) sonuc.niyet = 'bilgi';
  else if (RANDEVU.test(s) || sonuc.tarih || sonuc.saat || sonuc.hizmetId || sonuc.enErken || sonuc.kisi) sonuc.niyet = 'randevu';

  // Kısa ve net mesajlarda yapay zekâya gerek yok ("evet", "15:40", "yarın"); diğerlerinde eksikleri tamamla
  const kisaNet = sonuc.niyet && trimli.split(' ').length <= 3;
  if (!kisaNet) {
    const yz = await yapayZekaAnla({ metin, isletme, hizmetler, calisanlar, durum, bugun });
    if (yz) {
      if (!sonuc.niyet || (sonuc.niyet === 'randevu' && ['bilgi', 'iptal'].includes(yz.niyet))) sonuc.niyet = yz.niyet;
      // Sohbet ("ne yapıyorsun", "akşam gel") yapay zekâya göre "bilgi" olsa bile dükkân sorusu değilse cevaplanmaz
      if (sonuc.niyet === 'bilgi' && !BILGI.test(s) && !DUKKAN_SORU.test(s)) sonuc.niyet = 'diger';
      if (!sonuc.tarih && /^\d{4}-\d{2}-\d{2}$/.test(yz.tarih || '') && yz.tarih >= bugun && yz.tarih <= gunEkle(bugun, 90)) sonuc.tarih = yz.tarih;
      if (!sonuc.saat && /^\d{2}:\d{2}$/.test(yz.saat || '')) sonuc.saat = yz.saat;
      if (!sonuc.hizmetId && hizmetler.some(h => h.id === yz.hizmet_id) && !tirasBelirsiz(s)) sonuc.hizmetId = yz.hizmet_id;
      if (!sonuc.calisanId && calisanlar.some(c => c.id === yz.calisan_id)) sonuc.calisanId = yz.calisan_id;
      if (yz.fark_etmez) sonuc.farkEtmez = true;
      if (!sonuc.dilim && yz.dilim) sonuc.dilim = yz.dilim;
      if (!sonuc.kisi && yz.kisi_sayisi >= 2 && yz.kisi_sayisi <= 5) sonuc.kisi = yz.kisi_sayisi;
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
  if (require('../utils/randevuSorgusu').randevuSorgusu(metin)) return null;   // var olan randevuyu soruyor: eski akış listeler

  const randevuService = require('./randevu');
  const calisanlar = (await pool.query('SELECT id, isim FROM calisanlar WHERE isletme_id = $1 AND (aktif IS NULL OR aktif = true) ORDER BY id', [isletmeId])).rows;
  const d = { ...botDurum };
  if (d.secilen_tarih) d.secilen_tarih = require('../utils/tarih').tarihFormatla(d.secilen_tarih);
  if (d.secilen_saat) d.secilen_saat = s5(d.secilen_saat);
  const surecte = d.asama === 'sohbet';
  const a = await anla({ metin, isletme, hizmetler, calisanlar, durum: d });

  // Randevu/dükkân dışı konuşma (kullanıcı kararı 2026-10-17): bot karışmaz, esnaf kendisi bakar
  if (!surecte && (!a.niyet || a.niyet === 'diger')) return { sus: 'randevu/dükkân dışı sohbet' };
  if (a.niyet === 'selam' && !surecte) {
    // Yalnız selam: müşteriyse ya da esnafın elle konuştuğu biri değilse karşılanır; esnafın tanıdığına bot girmez
    if (!(await selamaCevapVer(isletmeId, musteriTelefon))) return { sus: 'selam — esnafın elle konuştuğu kişi' };
    await kaydet(wa, musteriTelefon, isletmeId, 'ana_menu', {});
    // Randevu linki WhatsApp'ta önizleme kartıyla açılır (düğme yerine)
    let link = null; try { link = await require('../utils/randevuLinki').randevuLinki(isletme); } catch (e) { /* link olmadan */ }
    return T.selam(isletme.isim, link, ornekHizmet(isletme, hizmetler, dil));
  }
  if (a.niyet === 'iptal') return null;
  if (a.niyet === 'bilgi' || ((!a.niyet || a.niyet === 'diger') && !surecte)) {
    // Soru (fiyat, adres, saatler…): yapay zekâ işletme bilgisiyle kısa cevap verir; menü gösterilmez
    const cevap = await require('./deepseek').serbetCevap(metin, isletme, hizmetler, 'whatsapp').catch(() => null)
      || fiyatCevap(s, hizmetler, d, dil);                              // yapay zekâ cevap veremezse fiyat yine söylenir
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
  // Hizmet adı tam geçmedi: rakam ("2") ya da adın parçaları ("saç kesimi", "erkek") → en çok eşleşen tek hizmet;
  // eşitlikte yalnız adaylar sorulur ("Saç Kesim (Erkek)" / "Saç Kesim (Bayan)")
  if (!a.hizmetId && (d.sohbet_bekleyen === 'hizmet' || !d.secilen_hizmet_id)) {
    if (d.sohbet_bekleyen === 'hizmet' && /^\s*\d{1,2}\s*$/.test(metin)) { const h = hizmetler[Number(metin) - 1]; if (h) a.hizmetId = h.id; }
    else {
      const adaylar = hizmetAday(metin, hizmetler);
      if (adaylar.length === 1) a.hizmetId = adaylar[0].id;
      else if (adaylar.length > 1 && adaylar.length < hizmetler.length) d._adaylar = adaylar;
    }
  }

  // Bilgileri işle: yeni gün/saat gelirse eskisinin üzerine yazılır
  if (!surecte) d.kisi_sayisi = null;                                   // yeni konuşma: önceki randevunun kişi sayısı taşınmaz
  if (a.kisi) d.kisi_sayisi = a.kisi;
  if (a.hizmetId) d.secilen_hizmet_id = a.hizmetId;
  if (a.calisanId) d.secilen_calisan_id = a.calisanId;
  if (a.farkEtmez) d._fark_etmez = true;
  if (a.tarih && a.tarih !== d.secilen_tarih) { d.secilen_tarih = a.tarih; d.secilen_saat = null; }
  if (a.saat) d.secilen_saat = a.saat;
  else if (a.dilim || a.enErken) d.secilen_saat = null;                 // onay beklerken "öğleden sonra olsun" → o dilimin saatleri
  // Dilim ("yarın akşam") hizmet/usta sorulduktan sonra da geçerli; yeni gün ya da saat gelince sıfırlanır
  // sohbet_dilim 'erken' = "en erken" dendi (hizmet sorulduktan sonra da geçerli)
  const eski = a.tarih || a.saat ? '' : (d.sohbet_dilim || '');
  d._dilim = a.dilim || (eski === 'erken' ? '' : eski);
  d._enErken = !!a.enErken || (!a.dilim && eski === 'erken');
  if (a.enErken && !d.secilen_tarih) d.secilen_tarih = bugunTarih();
  if (!surecte && a.niyet !== 'randevu' && !a.tarih && !a.saat && !a.hizmetId && !d._adaylar) return null;
  // Saat beklerken "evet/tamam/olur" ya da anlaşılmayan cevap: aynı listeyi tekrar etmek yerine net sor
  d._saatAnlasilmadi = d.sohbet_bekleyen === 'saat' && !a.saat && !a.tarih && !a.dilim && !a.enErken && !a.hizmetId;
  return await sonrakiAdim({ wa, d, a, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId });
}

async function sonrakiAdim({ wa, d, a, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId }) {
  // secilen_calisan_id = 0 → müşteri "fark etmez" dedi (saat seçilince o saatte boş usta atanır)
  const alan = { secilen_hizmet_id: d.secilen_hizmet_id || null, secilen_tarih: d.secilen_tarih || null,
    secilen_saat: d.secilen_saat || null, secilen_calisan_id: d.secilen_calisan_id ?? null, sohbet_dilim: d._enErken ? 'erken' : (d._dilim || null),
    kisi_sayisi: Number(d.kisi_sayisi) > 1 ? Number(d.kisi_sayisi) : null };

  // 1) Hizmet
  if (!alan.secilen_hizmet_id) {
    if (hizmetler.length === 1) alan.secilen_hizmet_id = hizmetler[0].id;
    else {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'hizmet' });
      // Tam liste numaralı ("2" yazmak yeter); adaylar madde işaretli (numaralar tam listeye göre)
      const satir = (h, i) => `${d._adaylar ? '•' : `${i + 1}.`} ${h.isim}${Number(h.fiyat) > 0 ? ` · ${Number(h.fiyat).toLocaleString('tr-TR')}₺` : ''}`;
      const liste = (d._adaylar || hizmetler).slice(0, 15).map(satir).join('\n');
      // Canlı hata (2026-10-17): anlaşılmayan cevaba aynı liste 4 kez gitti; tekrar sorarken nasıl seçileceği söylenir
      if (d.sohbet_bekleyen === 'hizmet' && !d._adaylar && T.hizmetTekrar) return T.hizmetTekrar(liste);
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
      return T.usta(uygun.map(c => c.isim).join(', '), unvan(isletme, dil));
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
      if (h2.size && d._enErken) {                                        // "en erken" → o günün ilk boş saati, doğrudan onaya
        const ilk = (dilimSuz([...h2.keys()].sort(), d._dilim)[0]) || [...h2.keys()].sort()[0];
        return await sonrakiAdim({ wa, d: { ...d, ...alan, secilen_tarih: t2, secilen_saat: ilk, _enErken: false }, a, T, dil, isletme, hizmetler, calisanlar, randevuService, musteriTelefon, isletmeId });
      }
      if (h2.size) {
        alan.secilen_tarih = t2; alan.secilen_saat = null;
        await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'saat' });
        const liste = saatSecki(dilimSuz([...h2.keys()].sort(), d._dilim).length ? dilimSuz([...h2.keys()].sort(), d._dilim) : [...h2.keys()].sort(), dil);
        if (kapali) return `${T.kapali(gunY)}\n${T.saatler(gunYazi(t2, dil), liste)}`;
        return gunEkle(t2, -i) === bugunTarih() && T.bugunBitti ? T.bugunBitti(gunYazi(t2, dil), liste) : T.gunDolu(gunY, gunYazi(t2, dil), liste);
      }
    }
    await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, secilen_tarih: null, sohbet_bekleyen: 'tarih' });
    return T.hepDolu(gunY);
  }

  if (!alan.secilen_saat && d._enErken) alan.secilen_saat = dilimSuz(saatler, d._dilim)[0] || saatler[0];
  if (!alan.secilen_saat) {
    const dilimli = dilimSuz(saatler, d._dilim);
    await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_bekleyen: 'saat' });
    if (d._dilim && !dilimli.length) return T.dilimYok(gunY, saatSecki(saatler, dil));
    const liste = T.saatler(gunY, saatSecki(dilimli.length ? dilimli : saatler, dil));
    return d._saatAnlasilmadi ? `${T.saatSor()}\n${liste}` : liste;
  }

  // İstenen saat dolu → en yakın boş saat önerilir (onaylanırsa o saat)
  let saat = alan.secilen_saat;
  let oneriMetni = null;
  if (!harita.has(saat) && dk(saat) < 12 * 60 && harita.has(s5(`${String(Number(saat.slice(0, 2)) + 12).padStart(2, '0')}:${saat.slice(3, 5)}`)) &&
      dk(saat) < dk(saatler[0])) saat = `${String(Number(saat.slice(0, 2)) + 12).padStart(2, '0')}:${saat.slice(3, 5)}`;
  if (!harita.has(saat)) {
    const sonra = saatler.find(x => dk(x) > dk(saat) && dk(x) - dk(saat) <= 180);
    const once = [...saatler].reverse().find(x => dk(x) < dk(saat) && dk(saat) - dk(x) <= 180);
    const oneri = sonra || once;
    if (!oneri) {
      await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, secilen_saat: null, sohbet_bekleyen: 'saat' });
      return `${T.oneriYok(saat)}\n${T.saatler(gunY, saatSecki(saatler, dil))}`;
    }
    oneriMetni = T.dolu(saat, oneri) + (sonra && once ? ` ${T.erken(once)}` : '');
    saat = oneri;
  }
  alan.secilen_saat = saat;
  if (!ustaBelli) alan.secilen_calisan_id = harita.get(saat) || null;
  await kaydet(wa, musteriTelefon, isletmeId, 'sohbet', { ...alan, sohbet_dilim: null, sohbet_bekleyen: 'onay' });
  if (oneriMetni) return oneriMetni;
  const usta = alan.secilen_calisan_id ? (uygun.find(c => c.id === alan.secilen_calisan_id) || calisanlar.find(c => c.id === alan.secilen_calisan_id)) : null;
  const ozet = `🗓️ ${gunY} · 🕐 ${saat}\n${require('../utils/hizmetEmoji').hizmetEmoji(isletme.kategori)} ${hizmet?.isim || ''}${usta && uygun.length > 1 ? ` · 👤 ${usta.isim}` : ''}`
    + (alan.kisi_sayisi ? `\n👥 ${T.kisi(alan.kisi_sayisi, unvan(isletme, dil))}` : '');
  return T.onay(ozet);
}

// Mesajdaki kelimelerle en çok örtüşen hizmet(ler). Kelime eşleşmesi ortak ön ek ile: "kesimi"~"kesim", "boyatmak"~"boyama"
function hizmetAday(metin, hizmetler) {
  const yaz = (x) => sade(x).replace(/t[iı]?ras/g, 'tras');   // tıraş / traş / tiraş aynı
  const kel = yaz(metin).split(/[^a-z0-9]+/).filter(w => w.length >= 3);
  const benzer = (k, p) => { let i = 0; while (i < k.length && k[i] === p[i]) i++; return i >= Math.min(4, k.length, p.length) && Math.min(k.length, p.length) >= 3; };
  let en = 0, adaylar = [];
  for (const h of hizmetler) {
    const parca = yaz(h.isim).split(/[^a-z0-9]+/).filter(p => p.length >= 3);   // "(Erkek)" sonrası boş parça her şeyle eşleşiyordu
    const puan = kel.filter(k => parca.some(p => benzer(k, p))).length;
    if (puan > en) { en = puan; adaylar = [h]; } else if (puan && puan === en) adaylar.push(h);
  }
  // Niteleyicisiz "tıraş": saç kesimi ve saç+sakal da adaylara girer (hizmet listesindeki sırayla)
  if (tirasBelirsiz(' ' + sade(metin) + ' ')) {
    for (const h of hizmetler) {
      const ad = yaz(h.isim);
      if ((/kesim/.test(ad) || (/\bsac\b/.test(ad) && /sakal/.test(ad))) && !adaylar.includes(h)) adaylar.push(h);
    }
    adaylar.sort((a, b) => hizmetler.indexOf(a) - hizmetler.indexOf(b));
  }
  return adaylar;
}

// Fiyat sorusu, yapay zekâ yokken: konuşulan (ya da mesajda geçen) hizmetin fiyatı, yoksa liste
function fiyatCevap(s, hizmetler, d, dil) {
  if (!/\b(fiyat|ucret|kac para|ne kadar|kac tl|price|how much|cost|سعر|كم)/.test(s)) return null;
  const tl = (h) => `${h.isim}: ${Number(h.fiyat).toLocaleString('tr-TR')}₺`;
  const fiyatli = hizmetler.filter(h => Number(h.fiyat) > 0);
  const anilan = hizmetBul(s, hizmetler).hizmet;
  const h = (anilan && Number(anilan.fiyat) > 0 && anilan) || fiyatli.find(x => x.id === d.secilen_hizmet_id);
  if (h) return tl(h);
  if (!fiyatli.length) return dil === 'tr' ? 'Fiyatı dükkânda öğrenebilirsiniz.' : null;
  return fiyatli.slice(0, 10).map(x => `• ${tl(x)}`).join('\n');
}
// Esnafın elle konuştuğu kişi = en az 2 farklı gün elle yazdığı (tanıdık ölçüsüyle aynı). Eskiden tek bir elle_sessiz kaydı
// yetiyordu; WhatsApp Business karşılama mesajı da "elle" sayıldığı için (2026-10-19'a kadar) gerçek müşterinin selamı
// da kalıcı olarak cevapsız kalıyordu.
async function selamaCevapVer(isletmeId, tel) {
  try {
    const r = (await pool.query(
      `SELECT EXISTS (SELECT 1 FROM randevular r JOIN musteriler m ON m.id = r.musteri_id WHERE r.isletme_id = $1 AND m.telefon = $2) AS musteri,
              (SELECT COUNT(*) FROM elle_yazisma WHERE isletme_id = $1 AND telefon = $2)::int AS elle_gun`, [isletmeId, tel])).rows[0];
    return r.musteri || r.elle_gun < 2;
  } catch (e) { return true; }   // tablo yoksa eski davranış
}

async function kaydet(wa, tel, isletmeId, asama, alanlar) {
  const temiz = Object.fromEntries(Object.entries(alanlar).filter(([k]) => !k.startsWith('_')));
  // sohbet_dilim / kisi_sayisi kolonu henüz yoksa (geçiş tamamlanmadan) randevu akışı durmasın
  for (let i = 0; ; i++) {
    try { return await wa.durumGuncelle(tel, isletmeId, asama, temiz); }
    catch (e) {
      const k = ['sohbet_dilim', 'kisi_sayisi'].find(x => x in temiz && e.message.includes(x));
      if (!k || i > 2) throw e;
      delete temiz[k];
    }
  }
}

module.exports = { isle, anla, saatSecki, kisiBul, M, ornekHizmet };
