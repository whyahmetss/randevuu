/**
 * Web Push Helper
 * Kullanım:
 *   import { pushIzinDurumu, pushAc, pushKapat, pushTest } from './lib/push';
 */

import { API_URL } from './config';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function pushDesteklenir() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Kullanıcının mevcut push durumu */
export async function pushIzinDurumu() {
  if (!pushDesteklenir()) return { desteklenir: false, izin: 'denied', aboneMi: false };
  const izin = Notification.permission; // 'default' | 'granted' | 'denied'
  let aboneMi = false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      aboneMi = !!sub;
    }
  } catch (e) {}
  return { desteklenir: true, izin, aboneMi };
}

async function _apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('randevugo_token');
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).hata || 'Hata');
  return res.json();
}

/** Service worker kaydı + sunucudan public key + PushManager.subscribe + sunucuya kaydet */
export async function pushAc() {
  if (!pushDesteklenir()) throw new Error('Tarayıcınız push bildirimleri desteklemiyor');

  const izin = await Notification.requestPermission();
  if (izin !== 'granted') throw new Error('Bildirim izni verilmedi');

  // SW kaydı
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;

  // VAPID public key
  const { publicKey, enabled } = await _apiFetch('/push/public-key');
  if (!enabled || !publicKey) throw new Error('Sunucuda VAPID yapılandırılmamış');

  // Mevcut abonelik varsa önce iptal et (key değişmiş olabilir)
  const mevcut = await reg.pushManager.getSubscription();
  if (mevcut) { try { await mevcut.unsubscribe(); } catch (e) {} }

  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await _apiFetch('/push/subscribe', {
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });

  return { ok: true, endpoint: subscription.endpoint };
}

/** Mevcut aboneliği iptal et (hem SW hem backend) */
export async function pushKapat() {
  if (!pushDesteklenir()) return { ok: false };
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return { ok: true };
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    try { await _apiFetch('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch (e) {}
    try { await sub.unsubscribe(); } catch (e) {}
  }
  return { ok: true };
}

/** Test bildirimi tetikle (backend → SW → notification) */
export async function pushTest() {
  return await _apiFetch('/push/test', { method: 'POST', body: '{}' });
}
