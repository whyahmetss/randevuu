// Sesli mesajla randevu (kullanıcı kararı 2026-10-14): WhatsApp'a gelen ses kaydı Gemini ile yazıya çevrilir,
// metin botun normal akışına girer. Ses kaydı saklanmaz; yalnız yazıya dökülmüş metin sohbet geçmişine yazılır (KVKK metni).
// Müşteri ne anlaşıldığını görsün diye bot cevabının başına çevrilen metin eklenir: yanlış anlaşılan saat düzeltilebilsin.
const gemini = require('../utils/gemini');

const EN_UZUN_SN = 120;
const EN_BUYUK_BAYT = 3 * 1024 * 1024;
const GUNLUK_ISLETME = 300;     // işletme başına günlük çeviri sınırı (ücretsiz Gemini kotası paylaşılıyor)
const GUNLUK_KISI = 20;         // aynı numaradan günlük çeviri sınırı
const sayac = new Map();        // "gün:anahtar" → sayı

const TALIMAT = 'Bu, bir işletmeye (berber, kuaför, güzellik salonu, klinik vb.) randevu için gönderilmiş bir WhatsApp sesli mesajıdır. ' +
  'Söylenenleri konuşulan dilde, kelimesi kelimesine yazıya dök. Saatleri ve tarihleri duyduğun gibi yaz. ' +
  'Yalnız metni yaz; açıklama, tırnak ya da etiket ekleme. Konuşma anlaşılmıyorsa ya da ses yoksa yalnız [anlaşılmadı] yaz.';

// Sarmalayıcıları açıp ses mesajını bul (viewOnce, ephemeral)
function sesMesaji(msg) {
  let m = msg?.message;
  if (!m) return null;
  if (m.ephemeralMessage) m = m.ephemeralMessage.message || m;
  if (m.viewOnceMessage) m = m.viewOnceMessage.message || m;
  if (m.viewOnceMessageV2) m = m.viewOnceMessageV2.message || m;
  return m.audioMessage || null;
}

function sinirAsildi(anahtar, sinir) {
  const k = `${new Date().toISOString().slice(0, 10)}:${anahtar}`;
  const n = (sayac.get(k) || 0) + 1;
  if (sayac.size > 5000) sayac.clear();
  sayac.set(k, n);
  return n > sinir;
}

// { metin } | { hata: 'uzun' | 'sinir' | 'kapali' | 'cevrilemedi' } | null (ses mesajı değil)
async function metneCevir(msg, { isletmeId, telefon, sock, indir } = {}) {
  const ses = sesMesaji(msg);
  if (!ses) return null;
  if (!gemini.anahtarlar().length) return { hata: 'kapali' };
  if (Number(ses.seconds) > EN_UZUN_SN) return { hata: 'uzun' };
  if (sinirAsildi(`i${isletmeId}`, GUNLUK_ISLETME) || sinirAsildi(`k${isletmeId}:${telefon}`, GUNLUK_KISI)) return { hata: 'sinir' };
  try {
    const tampon = indir ? await indir(msg)
      : await require('@whiskeysockets/baileys').downloadMediaMessage(msg, 'buffer', {}, { reuploadRequest: sock?.updateMediaMessage, logger: undefined });
    if (!tampon?.length || tampon.length > EN_BUYUK_BAYT) return { hata: 'uzun' };
    const j = await gemini.geminiIstek({
      contents: [{ role: 'user', parts: [
        { text: TALIMAT },
        { inline_data: { mime_type: String(ses.mimetype || 'audio/ogg').split(';')[0].trim(), data: Buffer.from(tampon).toString('base64') } },
      ] }],
      generationConfig: { temperature: 0, maxOutputTokens: 400 },
    }, { sure: 30000 });
    const metin = gemini.metniAl(j).replace(/\s+/g, ' ').trim();
    if (!metin || /\[anlaşılmadı\]/i.test(metin)) return { hata: 'cevrilemedi' };
    return { metin: metin.slice(0, 500) };
  } catch (e) {
    console.error('Sesli mesaj çevirisi:', e.message);
    return { hata: 'cevrilemedi' };
  }
}

// Müşteriye cevap: ne anlaşıldığını gösterir (uzun metin kısaltılır)
const onEk = (metin) => `🎤 _"${metin.length > 160 ? metin.slice(0, 157) + '…' : metin}"_\n\n`;

const HATA_METNI = {
  uzun: '🎤 Sesli mesajınız biraz uzun. Kısaca söyler ya da yazarak iletebilir misiniz?',
  sinir: '🎤 Şu an sesli mesajları dinleyemiyorum. Yazarak iletebilir misiniz?',
  cevrilemedi: '🎤 Sesli mesajınızı anlayamadım. Tekrar söyler ya da yazarak iletebilir misiniz?',
};

module.exports = { metneCevir, sesMesaji, onEk, HATA_METNI, EN_UZUN_SN };
