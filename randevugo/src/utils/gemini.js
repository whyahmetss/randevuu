// Gemini ortak çağrı (2026-10-13): birden çok ücretsiz API anahtarı ve model arasında dönüşümlü dener.
// GEMINI_API_KEYS="anahtar1,anahtar2,…" (ya da tek GEMINI_API_KEY). Bir anahtar/model meşgulse (503), kotası
// dolduysa (429) ya da model kalktıysa (404) sıradakine geçer. Her anahtar ayrı Google projesinden olmalı:
// ücretsiz kota proje başınadır.
// Canlı hata (2026-10-29): gemini-2.5-flash-lite kalktı; denemeler art arda ve her biri ayrı süreyle yapılınca
// müşteri mesajı 54 sn bekledi. Artık toplam süre `sure` ile sınırlı, kalkan model bir daha denenmez ve Google'ın
// 404 mesajında önerdiği yeni model ("use models/gemini-3.5-flash-lite") listenin başına alınır.
const anahtarlar = () => String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(/[,\s]+/).filter(Boolean);
const SABIT = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const olu = new Set();   // 404 veren modeller: süreç boyunca bir daha denenmez
let onerilen = null;     // Google'ın 404 mesajında önerdiği model
const modeller = () => [...new Set([process.env.GEMINI_MODEL, onerilen, ...SABIT].filter(Boolean))].filter(m => !olu.has(m));
let siradaki = 0;   // anahtarları sırayla kullan: kota tek anahtarda erimesin
let sonHata = null;

async function geminiIstek(govde, { sure = 30000 } = {}) {
  const liste = anahtarlar();
  if (!liste.length) return null;
  const bitis = Date.now() + sure;   // tüm denemeler için toplam süre
  const denemeler = [];
  const bas = siradaki++ % liste.length;
  anahtar: for (let i = 0; i < liste.length; i++) {
    const no = (bas + i) % liste.length;
    const key = liste[no];
    // Liste her denemede yeniden okunur: 404'te önerilen model aynı çağrıda hemen denenir
    const denenen = new Set();
    let model;
    while ((model = modeller().find(m => !denenen.has(m)))) {
      denenen.add(model);
      const kalan = bitis - Date.now();
      if (kalan < 500) { denemeler.push('süre doldu'); break anahtar; }
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(kalan), body: JSON.stringify(govde),
        });
        if (r.ok) { sonHata = null; return await r.json(); }
        const metin = (await r.text().catch(() => '')).slice(0, 300);
        denemeler.push(`k${no + 1}·${model}:${r.status}`);
        sonHata = { kod: r.status, mesaj: `anahtar ${no + 1}/${liste.length} · ${model}: ${metin.slice(0, 200)}` };
        if (r.status === 404) {                               // model kalktı → bir daha deneme, önerilen varsa onu al
          olu.add(model);
          const yeni = (metin.match(/use (?:models\/)?(gemini-[\w.-]+)/i) || [])[1];
          if (yeni && !olu.has(yeni) && yeni !== onerilen) { onerilen = yeni; console.log(`Gemini: ${model} kalkmış, ${yeni} kullanılacak`); }
          continue;
        }
        if (r.status === 429) break;                          // bu anahtarın kotası doldu → sıradaki anahtar
        if ([500, 503].includes(r.status)) continue;          // meşgul → sıradaki model
        break;                                                // 400/401/403: bu anahtar geçersiz → sıradaki anahtar
      } catch (e) {
        denemeler.push(`k${no + 1}·${model}:${e.name === 'TimeoutError' ? 'zaman aşımı' : 'ağ'}`);
        sonHata = { kod: 'ağ', mesaj: e.message };
      }
    }
  }
  console.error('Gemini cevap vermedi:', denemeler.join(', ') || 'model kalmadı', '|', sonHata?.mesaj || '');
  return null;
}

const metniAl = (j) => j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

module.exports = { geminiIstek, metniAl, anahtarlar, modeller, sonHata: () => sonHata };
