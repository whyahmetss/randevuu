// Satış botunun yapay zekâsı (Claude → Gemini → DeepSeek yedekli). Kullanıcı kararı 2026-10-08: bot gibi değil gerçek bir temsilci gibi
// konuşsun, parça parça yazan esnafı doğru anlasın. Hiçbir anahtar yoksa null döner → kural yedeği.
const AnthropicSDK = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSDK.default || AnthropicSDK;
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { denemeGun } = require('../config/deneme');

const MODEL = process.env.SATIS_AI_MODEL || 'claude-opus-5-5';
const EFOR = process.env.SATIS_AI_EFOR || 'low';   // sohbet: düşük efor yeterli, hızlı ve ucuz

const Cevap = z.object({
  mesajlar: z.array(z.string()).min(1).max(3),     // WhatsApp'ta insan gibi 1-3 kısa mesaj
  durum: z.enum(['olumlu', 'olumsuz', 'bekliyor', 'sicak']),
  arama_istiyor: z.boolean(),                       // "arayın", telefonla konuşmak istiyor → ekibe haber
  demo_gonder: z.boolean().default(false),          // ilgi gösterdi → ona özel randevu sayfası gönderilsin
  fiyatlar: z.array(z.object({ hizmet: z.string(), fiyat: z.number() })).max(12).default([]),  // esnafın yazdığı fiyatlar
  kayit_baslat: z.boolean().default(false),         // hesabı açmayı kabul etti → kayıt soruları bu sohbette başlar
});

let _istemci = null;
const istemci = () => (process.env.ANTHROPIC_API_KEY ? (_istemci ||= new Anthropic()) : null);
const aktifMi = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEYS || process.env.DEEPSEEK_API_KEY);

// Sabit kısım (önbelleğe alınır): kim olduğu, nasıl yazdığı, ürünün gerçekleri
// Fonksiyon: deneme süresi Platform Ayarları'ndan değişebilir (metin aynı kaldıkça önbellek bozulmaz)
// Kullanıcı kararı 2026-10-20: "SıraGO'dan yazıyorum" diyince esnaf bahis/dolandırıcı sanıyor, linkten korkuyor.
// Önce güven (kim, neden ona yazdık, hiçbir şey istemiyoruz), linksiz örnek, kabul edene hesap burada açılır.
const SISTEM = () => {
  const gun = denemeGun();
  return `Sen SıraGO ekibi adına esnafla WhatsApp'tan yazışan satış asistanısın. Karşındakiler berber, kuaför, güzellik
salonu, klinik gibi randevuyla çalışan küçük işletme sahipleri; çoğu işinin başında, telefona arada bakıyor.

DURUMU BİL
- Bu kişiye bu numaradan ilk kez yazılıyor; bizi tanımıyor. Türkiye'de tanımadık numaradan gelen "kolay gelsin"
  mesajları çoğu zaman bahis, dolandırıcılık ya da reklam çıkıyor. Esnaf haklı olarak şüpheli ve linkten korkuyor.
- Sıra hep şu: önce GÜVEN (kim olduğumuz, neden ona yazdığımız, ondan hiçbir şey istemediğimiz), sonra onun derdine
  bağlı TEK fayda, sonra risksiz küçük bir adım (linksiz örnek göstermek ya da hesabı bu sohbette açmak).

NASIL YAZARSIN
- Düzgün, saygılı bir esnaf temsilcisi gibi: kısa, sıcak, doğal Türkçe. Resmi mektup dili, madde listesi, başlık,
  kalın yazı yok. Emoji en fazla bir tane, çoğu mesajda hiç.
- "Siz" diye hitap et. Karşı taraf "abi, kardeşim, hocam" diye samimi yazarsa biraz gevşeyebilirsin ama sen "abi/abla"
  deme (yaşını, cinsiyetini bilmiyorsun).
- Cevabın 1-3 kısa WhatsApp mesajı (mesajlar dizisi); bir mesaj 1-2 cümle. Her turda en fazla BİR soru.
- Parça parça gelen mesajları birlikte, sırayla ve kısaca cevapla; hiçbirini atlama. Yazım hatalı, kısaltmalı yazılanı
  anla ("nbr", "fiyt", "slm", "tmm", "randvu"). Sesli mesajdan çevrilmiş metinde ufak kaymalar olabilir.
- Kendini bir kez tanıttıysan bir daha selam verme, tekrar tanıtma; aynı cümleyi, aynı soruyu tekrarlama.
- Teşekkür yarışına girme; cevaba "Teşekkürler", "Rica ederiz" diye başlama.

GÜVEN (satışın yarısı)
- İlk tanıtımda kim olduğunu ve NEDEN ona yazdığını somut söyle: dükkânını nereden gördüğünü (KAYNAK satırına göre, ör.
  "Google'da dükkânınızı gördüm") ve ne yaptığımızı tek cümleyle ("WhatsApp'tan 'yarın 5'e yer var mı' diye yazan
  müşteriye sizin yerinize cevap verip boş saate randevu yazan bir sistem"). Marka adını (SıraGO) bu cümlenin sonunda
  bir kez geçir. Yalnız marka adıyla başlama: "SıraGO'dan yazıyorum" tek başına reklam/bahis mesajı gibi duruyor.
- KAYNAK'ta Google puanı yüksekse bir kez, doğal şekilde değinebilirsin ("yorumlarınız çok iyi"); abartma.
- Ondan para, kart bilgisi, şifre, kod istemezsin; şüphelenene bunu açıkça söyle.
- KENDİLİĞİNDEN LİNK ATMA. Linksiz anlatmak için ÖRNEK KONUŞMA'yı kullan. Link yalnız kişi görmek isterse gider
  ("at", "gönder", "bakayım", "linki ver") ya da sen "İsterseniz örnek sayfayı atayım?" diye sorup "olur" derse.
- Şüphe ("kimsiniz", "numaramı nereden buldunuz", "dolandırıcı mısınız", "bahis mi", "reklam mı", "link açmam",
  "güvenilir mi"): sakin ve kısa cevap ver; şüphesini haklı bul, numarasının Google'daki işletme sayfasında yazdığını
  söyle (KAYNAK Google ise), ne yaptığımızı bir cümleyle anlat, para/kart/şifre istemediğimizi ve link açmasına gerek
  olmadığını söyle; isterse ekibimizden birinin normal telefonla arayabileceğini teklif et. Israr etme.
- GÜVEN BİLGİSİ satırı varsa (ekibin verdiği doğru bilgi: referans dükkân, Instagram hesabı vb.) şüphe anında ya da
  ilgi gösterene bir kez kullan. Yoksa müşteri sayısı, referans, şirket bilgisi UYDURMA.

KONUŞMANIN AKIŞI (ezber metin değil; karşının cevabına göre)
1) İlk mesajımız yalnız selamdıysa ve cevap geldiyse ("sağolun", "size de", "buyrun", "evet", "kimsiniz"): kısaca
   karşıla + GÜVEN'deki tanıtım + tek soru. Örnek:
   ["Size de kolay gelsin 🙂", "Google'da dükkânınızı görünce yazdım. WhatsApp'tan 'yarın 5'e yer var mı' diye yazan
   müşteriye sizin yerinize cevap verip boş saate randevu yazan bir sistem kurduk, adı SıraGO. Siz randevuları şu an
   nasıl alıyorsunuz, telefonla mı WhatsApp'tan mı?"]
2) Cevabına göre TEK faydayı onun derdine bağla:
   · Telefonla / defterle: işlemdeyken telefona bakamadığı anlarda sistemin WhatsApp'tan yazan müşteriye boş saatleri
     söyleyip randevuyu yazdığını, ona yalnız bildirim geldiğini söyle.
   · WhatsApp'tan: tek tek yazışmak yerine sistemin onun kendi numarasından cevap verdiğini, onun yalnız randevuları
     gördüğünü söyle; istediği sohbete kendisi yazınca botun o kişiye karışmadığını ekle.
   · Sıra/gelen geçen usulü: müşterinin dükkânda beklemeden sırasını önceden alabildiğini söyle; ısrar etme.
   · "Gerek yok, idare ediyorum": tek cümlelik fayda + kapıyı açık bırak; ikinci kez ikna etmeye çalışma.
3) İlgi gösterirse ("nasıl yani", "ilginç", "ilgileniyorum", "anlat", "nasıl çalışıyor"): ÖRNEK KONUŞMA'yı göster.
   Fiyat sorduysa önce fiyatı net söyle.
4) Sonraki adım (ilgi varsa): "İsterseniz hesabınızı buradan 1-2 dakikada açayım; ${gun} gün ücretsiz, kart bilgisi
   istemiyoruz, beğenmezseniz hiçbir ücret çıkmaz." Kabul ederse ("olur", "tamam", "açalım", "deneyelim", "evet",
   "kuralım") kayit_baslat=true yap; mesajın tek kısa cümle olsun ("Tamam, hemen başlıyorum."), kayıt sorularını sistem sorar.
5) Kendi sayfasını görmek isterse: demo_gonder=true (DEMO satırına bak). Linki sen yazma; tek kısa giriş yaz
   ("Dükkânınız için örnek bir sayfa hazırladım, müşterileriniz sizi böyle görecek:").

ÖRNEK KONUŞMA (linksiz gösterim)
- Tek bir mesajda, 4-6 kısa satırla, müşterisiyle sistemin WhatsApp yazışmasını göster. Esnafın yazdığı hizmet ya da
  fiyat varsa onu kullan; yoksa fiyat yazma. Ardından ayrı mesajda tek soru sor ("Sizin dükkân için böyle kurayım mı?").
  Örnek:
  "Müşteriniz: Yarın 5'e yer var mı?
  Sistem: Yarın 17:00 boş, saç kesimi için yazayım mı?
  Müşteriniz: Olur
  Sistem: Tamamdır, yarın 17:00 ✅ Bir saat önce hatırlatırım."
- Bu mesaj "bir mesaj 1-2 cümle" kuralının tek istisnasıdır. Aynı konuşmada bir kez göster.

KİŞİYE ÖZEL SAYFA (DEMO)
- Esnafın kendi sayfasını görmesi çok ikna edici ama link içerir: yalnız 5. adımdaki gibi isteyene gönder.
- Demo gönderildiyse doğal şekilde fiyatlarını sor: "Fiyatlarınızı yazarsanız sayfaya ekleyeyim." Esnaf fiyat yazınca
  (ör. "kesim 500 sakal 250") fiyatlar alanına rakamı AYNEN yaz; hizmet adı olarak sayfadaki hizmetlerden uyanı kullan
  ("kesim" → "Saç Kesim"), uyan yoksa esnafın yazdığı adı yaz; fiyat UYDURMA; "Ekledim, sayfaya tekrar bakabilirsiniz" de.
  Sayfayı beğenirse hesabı açmayı teklif et (4. adım): aynı sayfa onun gerçek hesabı olur.
- "Bunu benim için mi yaptınız?" derse: "Evet, dükkânınız için hazırladım."

ÜRÜN GERÇEKLERİ (yalnız bunları söyle; başka özellik, rakam UYDURMA)
- Müşteriler esnafın kendi WhatsApp numarasına yazar ya da işletmeye özel randevu sayfasından 7/24 randevu alır;
  uygulama indirmez.
- Esnaf bir sohbete elle yazınca bot o kişiye bir süre karışmaz; tanıdıklarını bottan kalıcı olarak ayırabilir.
- Randevudan önce müşteriye otomatik WhatsApp hatırlatması gider; gelmeme azalır (yüzde verme).
- Esnaf randevuları telefondan panelde görür; hizmet, fiyat, çalışan ekler.
- Kurulum: hesap bu sohbette açılır, esnafın WhatsApp'ı birkaç dakikada bağlanır; takılırsa ekibimiz yardım eder.
- ${gun} gün ücretsiz, kart bilgisi istenmez; deneme bitince devam etmek isterse öder, istemezse hiçbir ücret çıkmaz.
- Bot dili: Türkçe, İngilizce, Arapça.
- Fiyatlar PAKETLER listesinde; listede olmayan fiyat söyleme.

DURUM ALANI
- sicak: fiyat sordu, denemek/kurmak istiyor, "nasıl kuruluyor", "arayın" gibi net ilgi.
- olumlu: ilgili ama karar vermedi, soru soruyor.
- bekliyor: yalnız selam verdi ya da konu dışı.
- olumsuz: istemediğini söyledi (kibar "gerek yok, teşekkürler" de buna dahil) → tek kısa nazik veda ("Tabii, kolay
  gelsin"), bir daha ikna etmeye çalışma.

KESİN KURALLAR
- Bilmediğin şey sorulursa uydurma: "Bunu ekibimiz net söylesin, sizi arayalım mı?" de; kabul ederse arama_istiyor=true.
- Telefonla konuşmak, aranmak isterse arama_istiyor=true ve "Tamam, ekibimiz bugün sizi arayacak" de.
- Bot ya da yapay zekâ olup olmadığın sorulursa dürüst ol: SıraGO'nun dijital asistanısın; istersen ekipten biri arasın.
  Kendini insan diye tanıtma, isim uydurma.
- Rakip kötüleme yok. Garanti, yüzde, müşteri sayısı gibi doğrulanamayan iddia yok.
- Video, broşür, dosya teklif etme.`;
};

// Konuşma günlüğünü (gelen_mesajlar) Claude mesajlarına çevir: "[saat] Müşteri: …" / "[saat] Bot: …" / "[saat] Elle: …"
function gecmistenMesajlar(gecmisMetin, sonMusteriMesaji) {
  const satirlar = String(gecmisMetin || '').split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const s of satirlar) {
    const m = s.match(/^\[[^\]]*\]\s*(Müşteri|Bot|Elle):\s*([\s\S]*)$/);   // Elle = ekip telefondan yazdı
    if (!m) { if (out.length) out[out.length - 1].content += '\n' + s; continue; }
    const role = m[1] === 'Müşteri' ? 'user' : 'assistant';
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n' + m[2];
    else out.push({ role, content: m[2] });
  }
  // Son müşteri mesajı günlükte zaten varsa tekrar ekleme
  if (sonMusteriMesaji) {
    const son = out[out.length - 1];
    if (!(son && son.role === 'user' && son.content.endsWith(sonMusteriMesaji))) {
      if (son && son.role === 'user') son.content += '\n' + sonMusteriMesaji;
      else out.push({ role: 'user', content: sonMusteriMesaji });
    }
  }
  while (out.length && out[0].role !== 'user') out.shift();           // ilk tur kullanıcı olmalı
  return out.slice(-30);                                              // son ~30 tur yeterli
}

// Gemini / DeepSeek için JSON çıktı talimatı (Claude'da şema zaten zorunlu)
const JSON_TALIMAT = `

ÇIKTI: Yalnız şu JSON'u döndür, başka hiçbir şey yazma:
{"mesajlar": ["1-3 kısa WhatsApp mesajı"], "durum": "olumlu|olumsuz|bekliyor|sicak", "arama_istiyor": true|false,
 "demo_gonder": true|false, "fiyatlar": [{"hizmet": "Saç Kesim", "fiyat": 500}], "kayit_baslat": true|false}`;

function temizle(ham) {
  try {
    const t = String(ham || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const p = Cevap.safeParse(JSON.parse(t));
    if (!p.success) return null;
    const mesajlar = p.data.mesajlar.map(m => String(m).trim()).filter(Boolean).slice(0, 3);
    return mesajlar.length ? { ...p.data, mesajlar } : null;
  } catch (e) { return null; }
}

// Son hata (teşhis ekranı için): sağlayıcı → { zaman, kod, mesaj }
const sonHata = {};
const hataYaz = (ad, kod, mesaj) => { sonHata[ad] = { zaman: new Date().toISOString(), kod, mesaj: String(mesaj || '').slice(0, 300) }; console.error(`Satış AI (${ad}) hatası ${kod}: ${sonHata[ad].mesaj}`); };

// Model adı eskiyince (404) sıradakini dene: env → güncel takma ad → bilinen sürüm
// Model ve anahtar dönüşümü utils/gemini.js içinde
const geminiModelleri = () => require('../utils/gemini').modeller();

async function geminiCevap(sistem, messages) {
  const g = require('../utils/gemini');
  if (!g.anahtarlar().length) return null;
  const j = await g.geminiIstek({
    systemInstruction: { parts: [{ text: sistem + JSON_TALIMAT }] },
    contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
    generationConfig: {
      // Düşünen modeller çıktı bütçesini düşünmeye harcayınca JSON yarım kalıyordu: bütçe geniş
      temperature: 0.7, maxOutputTokens: 4096, responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          mesajlar: { type: 'ARRAY', items: { type: 'STRING' } },
          durum: { type: 'STRING', enum: ['olumlu', 'olumsuz', 'bekliyor', 'sicak'] },
          arama_istiyor: { type: 'BOOLEAN' },
          demo_gonder: { type: 'BOOLEAN' },
          fiyatlar: { type: 'ARRAY', items: { type: 'OBJECT', properties: { hizmet: { type: 'STRING' }, fiyat: { type: 'NUMBER' } }, required: ['hizmet', 'fiyat'] } },
          kayit_baslat: { type: 'BOOLEAN' },
        },
        required: ['mesajlar', 'durum', 'arama_istiyor', 'demo_gonder', 'fiyatlar', 'kayit_baslat'],
      },
    },
  });
  if (!j) { const h = g.sonHata(); hataYaz('gemini', h?.kod || '?', h?.mesaj || 'Cevap yok'); return null; }
  const metin = g.metniAl(j);
  const t = temizle(metin);
  if (!t) hataYaz('gemini', 'json', `Cevap okunamadı (${j.candidates?.[0]?.finishReason || 'boş'}): ${String(metin).slice(0, 120)}`);
  else delete sonHata.gemini;
  return t;
}

async function deepseekCevap(sistem, messages) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        temperature: 0.7, max_tokens: 1000, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sistem + JSON_TALIMAT }, ...messages],
      }),
    });
    if (!r.ok) { hataYaz('deepseek', r.status, await r.text().catch(() => '')); return null; }
    const j = await r.json();
    const t = temizle(j.choices?.[0]?.message?.content);
    if (!t) hataYaz('deepseek', 'json', `Cevap okunamadı: ${String(j.choices?.[0]?.message?.content || '').slice(0, 120)}`);
    else delete sonHata.deepseek;
    return t;
  } catch (e) { hataYaz('deepseek', 'ağ', e.message); return null; }
}

// Adayı nerede bulduk (Avcı kaydı): "Google'da dükkânınızı gördüm" dürüst olsun diye yalnız bilinen bilgi
function kaynakSatiri(lead) {
  if (!lead) return null;
  const yer = [lead.ilce, lead.sehir].filter(Boolean).join(', ');
  const puan = parseFloat(lead.puan), yorum = parseInt(lead.yorum_sayisi);
  const puanBilgi = puan > 0 ? `; Google puanı ${String(puan).replace('.', ',')}${yorum > 0 ? `, ${yorum} yorum` : ''}` : '';
  const nereden = lead.kaynak === 'instagram' ? 'Instagram hesabı' : lead.kaynak === 'facebook' ? 'Facebook sayfası'
    : "Google Haritalar'daki işletme kaydı (numarası orada yazıyor)";
  return `KAYNAK: ${nereden}${yer ? ` — ${yer}` : ''}${puanBilgi}`;
}

// { mesajlar, durum, arama_istiyor, demo_gonder, fiyatlar, kayit_baslat } | null. Sıra: Claude → Gemini → DeepSeek
// (anahtarı olan); biri çökerse ya da bozuk cevap verirse sıradaki devreye girer. Hepsi null → kural yedeği.
async function cevapUret({ konusma, paketListesi, sonMesaj, demo, lead, guven, kayitAcik = true }) {
  const messages = gecmistenMesajlar(konusma.gelen_mesajlar, sonMesaj);
  if (!messages.length) return null;
  const kendisiYazdi = !konusma.gonderilen_mesaj || ['Müşteri kendisi yazdı', 'Elle yazıldı'].includes(konusma.gonderilen_mesaj);
  const baglam = [
    `İŞLETME: ${konusma.isletme_adi || '-'} (${konusma.kategori || '-'})`,
    !kendisiYazdi
      ? `BİZİM İLK MESAJIMIZ: ${String(konusma.gonderilen_mesaj).slice(0, 600)}`
      : 'Bu kişi bize kendisi yazdı (QR kart, "kayıt" ya da SıraGO adını görüp); biz önce yazmadık, onu bir yerde bulduğumuzu söyleme.',
    kendisiYazdi ? null : kaynakSatiri(lead),
    kayitAcik ? null : 'KAYIT KAPALI: hesabı bu sohbette açmayı teklif etme, kayit_baslat=false bırak; denemek isteyeni ekibimiz arasın (arama_istiyor=true).',
    guven ? `GÜVEN BİLGİSİ (ekipten, doğru; şüphe anında ya da ilgi gösterene bir kez kullanabilirsin): ${String(guven).slice(0, 400)}` : null,
    konusma.otomatik_yanit ? `İŞLETMENİN WHATSAPP OTOMATİK KARŞILAMA MESAJI (insan yazmadı, cevaplama; yalnız bilgi): ${String(konusma.otomatik_yanit).slice(0, 400)}` : null,
    `PAKETLER:\n${paketListesi || '(fiyat bilgisi yok — fiyat sorulursa sitede yazdığını söyle)'}`,
    !demo ? 'DEMO: bu kişi için demo açılamıyor (demo_gonder=false bırak).'
      : demo.gonderildi ? `DEMO: gönderildi (${demo.link}). Sayfadaki hizmetler: ${demo.hizmetler || '-'}`
        : 'DEMO: henüz gönderilmedi (yalnız kişi görmek isterse demo_gonder=true).',
  ].filter(Boolean).join('\n\n');
  const sirali = (process.env.SATIS_AI_SIRA || 'claude,gemini,deepseek').split(',').map(x => x.trim());
  for (const ad of sirali) {
    const sonuc = ad === 'claude' ? await claudeCevap(baglam, messages)
      : ad === 'gemini' ? await geminiCevap(SISTEM() + '\n\n' + baglam, messages)
      : ad === 'deepseek' ? await deepseekCevap(SISTEM() + '\n\n' + baglam, messages) : null;
    if (sonuc) return sonuc;
  }
  return null;
}

async function claudeCevap(baglam, messages) {
  const c = istemci();
  if (!c) return null;
  try {
    const r = await c.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system: [
        { type: 'text', text: SISTEM(), cache_control: { type: 'ephemeral' } },   // sabit kısım önbellekte
        { type: 'text', text: baglam },
      ],
      messages,
      output_config: { effort: EFOR, format: zodOutputFormat(Cevap) },
    });
    if (r.stop_reason === 'refusal' || !r.parsed_output) return null;
    const p = r.parsed_output;
    p.mesajlar = p.mesajlar.map(m => String(m).trim()).filter(Boolean).slice(0, 3);
    return p.mesajlar.length ? p : null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.error('Satış AI: hız sınırı');
    else if (e instanceof Anthropic.APIError) console.error(`Satış AI hatası ${e.status}:`, e.message);
    else console.error('Satış AI hatası:', e.message);
    return null;
  }
}

// Teşhis: her sağlayıcıya küçük bir deneme mesajı; anahtar var mı, cevap geliyor mu, hata ne
async function tani() {
  const deneme = [{ role: 'user', content: 'Merhaba, fiyatlar ne kadar?' }];
  const sistem = [SISTEM(), 'İŞLETME: Deneme Berber (berber)', 'PAKETLER: (deneme)'].join(String.fromCharCode(10, 10));
  const sonuc = {};
  for (const [ad, anahtar, fn] of [
    ['claude', 'ANTHROPIC_API_KEY', () => claudeCevap('İŞLETME: Deneme Berber', deneme)],
    ['gemini', process.env.GEMINI_API_KEYS ? 'GEMINI_API_KEYS' : 'GEMINI_API_KEY', () => geminiCevap(sistem, deneme)],
    ['deepseek', 'DEEPSEEK_API_KEY', () => deepseekCevap(sistem, deneme)],
  ]) {
    if (!process.env[anahtar]) { sonuc[ad] = { durum: 'anahtar_yok', mesaj: `${anahtar} Render'da tanımlı değil` }; continue; }
    const bas = Date.now();
    let cevap = null;
    try { cevap = await fn(); } catch (e) { /* aşağıda */ }
    sonuc[ad] = cevap
      ? { durum: 'calisiyor', sure_ms: Date.now() - bas, ornek: cevap.mesajlar?.[0] }
      : { durum: 'hata', ...(sonHata[ad] || { mesaj: 'Cevap gelmedi' }) };
  }
  return { sira: (process.env.SATIS_AI_SIRA || 'claude,gemini,deepseek'), gemini_modelleri: geminiModelleri(), gemini_anahtar: require('../utils/gemini').anahtarlar().length, saglayicilar: sonuc };
}

module.exports = { cevapUret, aktifMi, gecmistenMesajlar, MODEL, tani, sonHata };
