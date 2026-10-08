// Kendini izleyen sistem (2026-10-08): bir şey ters gidince ekip esnaf aramadan Telegram'dan öğrensin.
// Aynı konu 30 dk içinde bir kez bildirilir (alarm yağmuru olmasın). Ayar: ALARM_TELEGRAM_CHAT_ID
// (yoksa SATIS_TELEGRAM_CHAT_ID), bot: TELEGRAM_SATIS_BOT_TOKEN.
const axios = require('axios');

const son = new Map();
const SESSIZ_MS = 30 * 60 * 1000;

async function alarm(konu, detay = '') {
  try {
    const simdi = Date.now();
    if (son.has(konu) && simdi - son.get(konu) < SESSIZ_MS) return;
    son.set(konu, simdi);
    if (son.size > 500) son.delete(son.keys().next().value);
    console.error(`🚨 ALARM ${konu}: ${detay}`);
    const token = process.env.TELEGRAM_SATIS_BOT_TOKEN || process.env.SATIS_TELEGRAM_BOT_TOKEN;
    const chat = process.env.ALARM_TELEGRAM_CHAT_ID || process.env.SATIS_TELEGRAM_CHAT_ID;
    if (!token || !chat) return;
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chat,
      text: `🚨 SıraGO alarm: ${konu}\n\n${String(detay).slice(0, 1500)}`,
    }, { timeout: 10000 });
  } catch (e) { console.error('Alarm gönderilemedi:', e.message); }
}

// Kısa sürede çok hata → tek alarm (ör. 10 dk'da 10 adet 5xx)
const sayac = new Map();
function hataSay(konu, detay, { esik = 10, pencereMs = 10 * 60 * 1000 } = {}) {
  const simdi = Date.now();
  const l = (sayac.get(konu) || []).filter(t => simdi - t < pencereMs);
  l.push(simdi);
  sayac.set(konu, l);
  if (l.length >= esik) alarm(konu, `${l.length} hata / ${Math.round(pencereMs / 60000)} dk. Son: ${detay}`);
}

module.exports = { alarm, hataSay };
