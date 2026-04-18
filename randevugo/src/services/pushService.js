/**
 * Web Push Notification Servisi
 *
 * Setup:
 *   - `VAPID_PUBLIC_KEY` ve `VAPID_PRIVATE_KEY` env var'ları gerekir
 *   - Üretmek için: `node -e "console.log(require('web-push').generateVAPIDKeys())"`
 *
 * Kullanım:
 *   - sendToIsletme(isletmeId, { title, body, url, tag }) — o işletmenin tüm subscribe'larına yollar
 *   - sendToUser(userId, payload) — tek kullanıcıya
 *   - saveSubscription(sub, isletmeId, userId, userAgent) — subscribe olanı DB'ye yaz
 *   - removeSubscription(endpoint) — unsubscribe
 *   - getPublicKey() — frontend için VAPID public key
 */

const webpush = require('web-push');
const pool = require('../config/db');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CONTACT = process.env.VAPID_CONTACT || 'mailto:destek@sirago.com';

let enabled = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  try {
    webpush.setVapidDetails(CONTACT, PUBLIC_KEY, PRIVATE_KEY);
    enabled = true;
    console.log('✅ Web Push aktif (VAPID keys yüklendi)');
  } catch (e) {
    console.log('⚠️ Web Push VAPID yapılandırma hatası:', e.message);
  }
} else {
  console.log('⚠️ Web Push pasif — VAPID_PUBLIC_KEY ve VAPID_PRIVATE_KEY env var\'ları tanımlanmalı');
}

function getPublicKey() { return PUBLIC_KEY; }
function isEnabled() { return enabled; }

async function saveSubscription(sub, isletmeId, userId, userAgent) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error('Geçersiz abonelik');
  }
  await pool.query(
    `INSERT INTO push_subscriptions (isletme_id, kullanici_id, endpoint, p256dh, auth, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       isletme_id = EXCLUDED.isletme_id,
       kullanici_id = EXCLUDED.kullanici_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       olusturma_tarihi = NOW()`,
    [isletmeId || null, userId || null, sub.endpoint, sub.keys.p256dh, sub.keys.auth, userAgent || null]
  );
}

async function removeSubscription(endpoint) {
  if (!endpoint) return;
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

async function _sendToSubs(rows, payload) {
  if (!enabled) return { sent: 0, failed: 0 };
  const data = JSON.stringify({
    title: payload.title || 'SıraGO',
    body: payload.body || '',
    url: payload.url || '/',
    tag: payload.tag || 'default',
    icon: payload.icon || '/logo.png',
    badge: payload.badge || '/logo.png',
    data: payload.data || {},
    // Tablet dükkan modu için opsiyonel: sürekli görünür + özel titreşim
    ...(payload.requireInteraction !== undefined && { requireInteraction: !!payload.requireInteraction }),
    ...(payload.vibrate && { vibrate: payload.vibrate }),
    ...(payload.silent !== undefined && { silent: !!payload.silent }),
  });
  let sent = 0, failed = 0, silindi = 0;
  await Promise.allSettled(rows.map(async (r) => {
    const sub = { endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } };
    try {
      await webpush.sendNotification(sub, data);
      sent++;
    } catch (e) {
      failed++;
      // 404/410 → abonelik geçersiz, sil
      if (e.statusCode === 404 || e.statusCode === 410) {
        try { await removeSubscription(r.endpoint); silindi++; } catch (_) {}
      }
    }
  }));
  if (silindi > 0) console.log(`🧹 Web Push: ${silindi} geçersiz abonelik temizlendi`);
  return { sent, failed };
}

async function sendToIsletme(isletmeId, payload) {
  if (!enabled || !isletmeId) return { sent: 0, failed: 0 };
  try {
    const { rows } = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE isletme_id = $1',
      [isletmeId]
    );
    if (!rows.length) return { sent: 0, failed: 0 };
    return await _sendToSubs(rows, payload);
  } catch (e) {
    console.log('Push gönderim hatası:', e.message);
    return { sent: 0, failed: 1 };
  }
}

async function sendToUser(userId, payload) {
  if (!enabled || !userId) return { sent: 0, failed: 0 };
  try {
    const { rows } = await pool.query(
      'SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE kullanici_id = $1',
      [userId]
    );
    if (!rows.length) return { sent: 0, failed: 0 };
    return await _sendToSubs(rows, payload);
  } catch (e) {
    console.log('Push gönderim hatası:', e.message);
    return { sent: 0, failed: 1 };
  }
}

async function sendToAdmin(payload) {
  if (!enabled) return { sent: 0, failed: 0 };
  try {
    // super_admin kullanıcılarının subscription'ları
    const { rows } = await pool.query(`
      SELECT ps.endpoint, ps.p256dh, ps.auth
      FROM push_subscriptions ps
      JOIN admin_kullanicilar k ON k.id = ps.kullanici_id
      WHERE k.rol IN ('super_admin', 'superadmin')
    `);
    if (!rows.length) return { sent: 0, failed: 0 };
    return await _sendToSubs(rows, payload);
  } catch (e) {
    console.log('Admin push hatası:', e.message);
    return { sent: 0, failed: 1 };
  }
}

module.exports = {
  getPublicKey,
  isEnabled,
  saveSubscription,
  removeSubscription,
  sendToIsletme,
  sendToUser,
  sendToAdmin,
};
