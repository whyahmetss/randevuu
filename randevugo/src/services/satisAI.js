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
{"mesajlar": ["1-3 kısa WhatsApp mesajı"], "durum": "olumlu|olumsuz|bekliyor|sicak", "arama_istiyor": true|false}`;

function temizle(ham) {
  try {
    const t = String(ham || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const p = Cevap.safeParse(JSON.parse(t));
    if (!p.success) return null;
    const mesajlar = p.data.mesajlar.map(m => String(m).trim()).filter(Boolean).slice(0, 3);
    return mesajlar.length ? { ...p.data, mesajlar } : null;
  } catch (e) { return null; }
}

async function geminiCevap(sistem, messages) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistem + JSON_TALIMAT }] },
        contents: messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
        generationConfig: {
          temperature: 0.7, maxOutputTokens: 1500, responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              mesajlar: { type: 'ARRAY', items: { type: 'STRING' } },
              durum: { type: 'STRING', enum: ['olumlu', 'olumsuz', 'bekliyor', 'sicak'] },
              arama_istiyor: { type: 'BOOLEAN' },
            },
            required: ['mesajlar', 'durum', 'arama_istiyor'],
          },
        },
      }),
    });
    if (!r.ok) { console.error('Satış AI (Gemini) hatası', r.status); return null; }
    const j = await r.json();
    return temizle(j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join(''));
  } catch (e) { console.error('Satış AI (Gemini) hatası:', e.message); return null; }
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
    if (!r.ok) { console.error('Satış AI (DeepSeek) hatası', r.status); return null; }
    const j = await r.json();
    return temizle(j.choices?.[0]?.message?.content);
  } catch (e) { console.error('Satış AI (DeepSeek) hatası:', e.message); return null; }
}

// { mesajlar, durum, arama_istiyor } | null. Sıra: Claude → Gemini → DeepSeek (anahtarı olan);
// biri çökerse ya da bozuk cevap verirse sıradaki devreye girer. Hepsi null → kural yedeği.
async function cevapUret({ konusma, paketListesi, sonMesaj }) {
  const messages = gecmistenMesajlar(konusma.gelen_mesajlar, sonMesaj);
  if (!messages.length) return null;
  const baglam = [
    `İŞLETME: ${konusma.isletme_adi || '-'} (${konusma.kategori || '-'})`,
    konusma.gonderilen_mesaj && konusma.gonderilen_mesaj !== 'Müşteri kendisi yazdı'
      ? `BİZİM İLK MESAJIMIZ: ${String(konusma.gonderilen_mesaj).slice(0, 600)}`
      : 'Bu kişi bize kendisi yazdı (biz önce yazmadık).',
    `PAKETLER:\n${paketListesi || '(fiyat bilgisi yok — fiyat sorulursa sitede yazdığını söyle)'}`,
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

module.exports = { cevapUret, aktifMi, gecmistenMesajlar, MODEL };
