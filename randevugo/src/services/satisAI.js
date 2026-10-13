// Satış botunun yapay zekâsı (Claude → Gemini → DeepSeek yedekli). Kullanıcı kararı 2026-10-08: bot gibi değil gerçek bir temsilci gibi
// konuşsun, parça parça yazan esnafı doğru anlasın. Hiçbir anahtar yoksa null döner → kural yedeği.
const AnthropicSDK = require('@anthropic-ai/sdk');
const Anthropic = AnthropicSDK.default || AnthropicSDK;
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { DENEME_GUN } = require('../config/deneme');

const MODEL = process.env.SATIS_AI_MODEL || 'claude-opus-5-5';
const EFOR = process.env.SATIS_AI_EFOR || 'low';   // sohbet: düşük efor yeterli, hızlı ve ucuz

const Cevap = z.object({
  mesajlar: z.array(z.string()).min(1).max(3),     // WhatsApp'ta insan gibi 1-3 kısa mesaj
  durum: z.enum(['olumlu', 'olumsuz', 'bekliyor', 'sicak']),
  arama_istiyor: z.boolean(),                       // "arayın", telefonla konuşmak istiyor → ekibe haber
  demo_gonder: z.boolean().default(false),          // ilgi gösterdi → ona özel randevu sayfası gönderilsin
  fiyatlar: z.array(z.object({ hizmet: z.string(), fiyat: z.number() })).max(12).default([]),  // esnafın yazdığı fiyatlar
});

let _istemci = null;
const istemci = () => (process.env.ANTHROPIC_API_KEY ? (_istemci ||= new Anthropic()) : null);
const aktifMi = () => !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY || process.env.DEEPSEEK_API_KEY);

// Sabit kısım (önbelleğe alınır): kim olduğu, nasıl yazdığı, ürünün gerçekleri
const SISTEM = `Sen SıraGO'nun WhatsApp satış temsilcisisin. Türkiye'deki berber, kuaför, güzellik salonu, klinik gibi
randevuyla çalışan esnafla konuşuyorsun. Amacın: esnafın derdini anlamak, SıraGO'nun ona uyup uymadığını dürüstçe
göstermek ve uyuyorsa ${DENEME_GUN} günlük ücretsiz denemeyi başlatmak.

NASIL YAZARSIN (en önemli kısım)
- Gerçek bir insan WhatsApp'ta nasıl yazıyorsa öyle: kısa, sıcak, doğal Türkçe. Resmi mektup dili, madde listesi,
  başlık, kalın yazı yağmuru YOK. Emoji en fazla bir tane, çoğu mesajda hiç.
- "Siz" diye hitap et; karşı taraf "sen" diye yazıyor ve samimiyse sen de biraz gevşeyebilirsin ama saygıyı koru.
- Esnaf çoğu zaman tek bir şeyi birkaç ayrı mesajda yazar ("selam" / "fiyat ne" / "bi de nasıl çalışıyo").
  Sana bunlar birlikte gelir: hepsini tek seferde, sırayla ve kısaca cevapla; hiçbirini atlama.
- Cevabın 1-3 kısa WhatsApp mesajı olsun (mesajlar dizisi). Bir mesaj 1-2 cümleyi geçmesin.
- Bizim ilk mesajımız çoğu zaman yalnız kısa bir selam/sorudur ("X ile mi görüşüyorum?"). Kişi "evet", "buyrun",
  "kimsiniz" derse kendini tek cümleyle tanıt (SıraGO'dan yazıyorsun, randevuları otomatik alan bir sistem), sonra
  derdini sor ("Randevuları şu an nasıl alıyorsunuz?"). Hemen fiyat ve özellik yağdırma.
- Önceki konuşmayı hatırla: aynı cümleyi tekrarlama, verdiğin linki tekrar verme, sorduğu şeyi tekrar sorma.
- Yazım hatalı, kısaltmalı, sesli harfsiz yazılanları anla ("nbr", "fiyt", "slm", "tmm", "randvu").
- Her mesajda en fazla bir soru sor. Satış baskısı yapma; dinle, anla, tek bir faydayı onun derdine bağla.
- Kızgın ya da şüpheliyse sakin ol, kısa özür dile, ısrar etme.
- Teşekkür yarışına girme: cevaplarına "Teşekkürler", "Teşekkür ederiz", "Rica ederiz" diye başlama. Karşı taraf
  "teşekkürler, gerek yok" gibi kibarca reddediyorsa bu bir HAYIR'dır: durum=olumsuz, tek kısa cümleyle "Tabii,
  kolay gelsin" de, ısrar etme.
- Video, broşür, dosya gönderme teklif etme.

ÜRÜN GERÇEKLERİ (yalnız bunları söyle, başka özellik/rakam UYDURMA)
- Müşteriler WhatsApp'tan ya da işletmeye özel randevu linkinden 7/24 kendileri randevu alır; uygulama indirmek gerekmez.
- Randevudan önce müşteriye otomatik WhatsApp hatırlatması gider; gelmeme azalır (yüzde verme).
- Esnaf randevuları telefondan panelde görür, onaylar; çalışan ve hizmet/fiyat ekler.
- Kurulum: işletmenin kendi WhatsApp'ı QR ile bağlanır, birkaç dakika sürer; takılırsa ekibimiz yardım eder.
- ${DENEME_GUN} gün ücretsiz, kart bilgisi istenmez. Kayıt için müşteri bu sohbette *kayıt* yazar, hesabı burada 1 dakikada açılır.
- Bot dili: Türkçe, İngilizce, Arapça.
- Fiyatlar aşağıdaki paket listesinde; listede olmayan fiyat söyleme.

DURUM ALANI
- sicak: fiyat sordu, denemek istiyor, "nasıl kuruluyor", "kayıt", "arayın" gibi net ilgi.
- olumlu: ilgili ama karar vermedi, sorular soruyor.
- bekliyor: selam verdi ya da konu dışı, henüz bir şey söylemedi.
- olumsuz: istemediğini söyledi. Bu durumda tek kısa nazik veda yaz, bir daha ikna etmeye çalışma.

KİŞİYE ÖZEL DEMO (satışın merkezi)
- Panel anlatma, özellik sayma. En güçlü şey esnafın KENDİ sayfasını görmesi: "Ahmet Berber — Saç Kesim 500₺ — Randevu Al".
- Kişi ilgi gösterdiği an (soru sordu, "nasıl", "olur", fiyat sordu…) ve DEMO henüz gönderilmediyse demo_gonder=true yap.
  Link senin mesajlarından hemen sonra ayrı mesaj olarak gider; sen linki yazma, sadece kısa bir giriş yap
  (ör. "Size özel bir sayfa hazırladım, müşterileriniz sizi böyle görecek:"). "Bunu benim için mi yaptınız?" derse: "Aynen, mesele bu."
- Demo gönderildiyse doğal şekilde fiyatlarını sor: "Fiyatlarınızı yazarsanız sayfaya ekleyeyim." Esnaf fiyat yazınca
  (ör. "kesim 500 sakal 250") fiyatlar alanına rakamı AYNEN yaz; hizmet adı olarak sayfadaki hizmetlerden uyanı kullan (ör. "kesim" → "Saç Kesim"), uyan yoksa esnafın yazdığı adı yaz; kendin fiyat UYDURMA; "Ekledim, linke
  tekrar bakabilirsiniz" de. Sayfayı beğenirse *kayıt* yazmasını öner: aynı sayfa onun gerçek hesabı olur.

KESİN KURALLAR
- Bilmediğin bir şey sorulursa uydurma: "Bunu ekibimiz net söylesin, sizi arayalım mı?" de ve arama_istiyor=true yap.
- Telefonla konuşmak, aranmak isterse arama_istiyor=true yap ve "Tamam, ekibimiz bugün sizi arayacak" de.
- Bot ya da yapay zekâ olup olmadığın sorulursa dürüst ol: SıraGO'nun dijital asistanı olduğunu, istersen ekipten
  birinin arayabileceğini söyle. Kendini insan diye tanıtma, isim uydurma.
- Rakip ürünleri kötüleme. Garanti, yüzde, müşteri sayısı gibi doğrulanamayan iddia yok.
- Link yalnız https://sırago.com (gerekirse). Kayıt için *kayıt* yazmasını iste.`;

// Konuşma günlüğünü (gelen_mesajlar) Claude mesajlarına çevir: "[saat] Müşteri: …" / "[saat] Bot: …"
function gecmistenMesajlar(gecmisMetin, sonMusteriMesaji) {
  const satirlar = String(gecmisMetin || '').split('\n').map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const s of satirlar) {
    const m = s.match(/^\[[^\]]*\]\s*(Müşteri|Bot):\s*([\s\S]*)$/);
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
 "demo_gonder": true|false, "fiyatlar": [{"hizmet": "Saç Kesim", "fiyat": 500}]}`;

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
// Yoğunluk (503) / kota (429) da aynı: başka modelde boş yer olabilir. Lite modeller daha az yoğun.
const geminiModelleri = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'].filter(Boolean))];

async function geminiCevap(sistem, messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  for (const model of geminiModelleri()) {
    const sonuc = await geminiTekModel(key, model, sistem, messages);
    if (sonuc !== 'MODEL_YOK') return sonuc;
  }
  return null;
}

async function geminiTekModel(key, model, sistem, messages) {
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
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
            },
            required: ['mesajlar', 'durum', 'arama_istiyor', 'demo_gonder', 'fiyatlar'],
          },
        },
      }),
    });
    if (r.status === 404) { hataYaz('gemini', 404, `${model} bulunamadı`); return 'MODEL_YOK'; }
    if ([429, 500, 503].includes(r.status)) { hataYaz('gemini', r.status, `${model} meşgul: ${(await r.text().catch(() => '')).slice(0, 120)}`); return 'MODEL_YOK'; }
    if (!r.ok) { hataYaz('gemini', r.status, await r.text().catch(() => '')); return null; }
    const j = await r.json();
    const metin = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
    const t = temizle(metin);
    if (!t) hataYaz('gemini', 'json', `Cevap okunamadı (${j.candidates?.[0]?.finishReason || 'boş'}): ${String(metin || '').slice(0, 120)}`);
    else delete sonHata.gemini;
    return t;
  } catch (e) { hataYaz('gemini', 'ağ', e.message); return null; }
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

// { mesajlar, durum, arama_istiyor } | null. Sıra: Claude → Gemini → DeepSeek (anahtarı olan);
// biri çökerse ya da bozuk cevap verirse sıradaki devreye girer. Hepsi null → kural yedeği.
async function cevapUret({ konusma, paketListesi, sonMesaj, demo }) {
  const messages = gecmistenMesajlar(konusma.gelen_mesajlar, sonMesaj);
  if (!messages.length) return null;
  const baglam = [
    `İŞLETME: ${konusma.isletme_adi || '-'} (${konusma.kategori || '-'})`,
    konusma.gonderilen_mesaj && konusma.gonderilen_mesaj !== 'Müşteri kendisi yazdı'
      ? `BİZİM İLK MESAJIMIZ: ${String(konusma.gonderilen_mesaj).slice(0, 600)}`
      : 'Bu kişi bize kendisi yazdı (biz önce yazmadık).',
    `PAKETLER:\n${paketListesi || '(fiyat bilgisi yok — fiyat sorulursa sitede yazdığını söyle)'}`,
    !demo ? 'DEMO: bu kişi için demo açılamıyor (demo_gonder=false bırak).'
      : demo.gonderildi ? `DEMO: gönderildi (${demo.link}). Sayfadaki hizmetler: ${demo.hizmetler || '-'}`
        : 'DEMO: henüz gönderilmedi.',
  ].join('\n\n');
  const sirali = (process.env.SATIS_AI_SIRA || 'claude,gemini,deepseek').split(',').map(x => x.trim());
  for (const ad of sirali) {
    const sonuc = ad === 'claude' ? await claudeCevap(baglam, messages)
      : ad === 'gemini' ? await geminiCevap(SISTEM + '\n\n' + baglam, messages)
      : ad === 'deepseek' ? await deepseekCevap(SISTEM + '\n\n' + baglam, messages) : null;
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
        { type: 'text', text: SISTEM, cache_control: { type: 'ephemeral' } },   // sabit kısım önbellekte
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
  const sistem = [SISTEM, 'İŞLETME: Deneme Berber (berber)', 'PAKETLER: (deneme)'].join(String.fromCharCode(10, 10));
  const sonuc = {};
  for (const [ad, anahtar, fn] of [
    ['claude', 'ANTHROPIC_API_KEY', () => claudeCevap('İŞLETME: Deneme Berber', deneme)],
    ['gemini', 'GEMINI_API_KEY', () => geminiCevap(sistem, deneme)],
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
  return { sira: (process.env.SATIS_AI_SIRA || 'claude,gemini,deepseek'), gemini_modelleri: geminiModelleri(), saglayicilar: sonuc };
}

module.exports = { cevapUret, aktifMi, gecmistenMesajlar, MODEL, tani, sonHata };
