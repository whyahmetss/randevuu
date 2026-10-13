// Gemini ortak çağrı (2026-10-13): birden çok ücretsiz API anahtarı ve model arasında dönüşümlü dener.
// GEMINI_API_KEYS="anahtar1,anahtar2,…" (ya da tek GEMINI_API_KEY). Bir anahtar/model meşgulse (503), kotası
// dolduysa (429) ya da model kalktıysa (404) sıradakine geçer. Her anahtar ayrı Google projesinden olmalı:
// ücretsiz kota proje başınadır.
const anahtarlar = () => String(process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(/[,\s]+/).filter(Boolean);
const modeller = () => [...new Set([process.env.GEMINI_MODEL, 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite'].filter(Boolean))];
let siradaki = 0;   // anahtarları sırayla kullan: kota tek anahtarda erimesin
let sonHata = null;

async function geminiIstek(govde, { sure = 30000 } = {}) {
  const liste = anahtarlar();
  if (!liste.length) return null;
  const bas = siradaki++ % liste.length;
  for (let i = 0; i < liste.length; i++) {
    const key = liste[(bas + i) % liste.length];
    for (const model of modeller()) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          signal: AbortSignal.timeout(sure), body: JSON.stringify(govde),
        });
        if (r.ok) { sonHata = null; return await r.json(); }
        const metin = (await r.text().catch(() => '')).slice(0, 200);
        sonHata = { kod: r.status, mesaj: `anahtar ${(bas + i) % liste.length + 1}/${liste.length} · ${model}: ${metin}` };
        if (r.status === 404) continue;                       // model yok → sıradaki model
        if ([429, 500, 503].includes(r.status)) {
          if (r.status === 429) break;                        // bu anahtarın kotası doldu → sıradaki anahtar
          continue;                                           // meşgul → sıradaki model
        }
        break;                                                // 400/401/403: bu anahtar geçersiz → sıradaki anahtar
      } catch (e) { sonHata = { kod: 'ağ', mesaj: e.message }; }
    }
  }
  console.error('Gemini cevap vermedi:', sonHata?.kod, sonHata?.mesaj);
  return null;
}

const metniAl = (j) => j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';

module.exports = { geminiIstek, metniAl, anahtarlar, modeller, sonHata: () => sonHata };
