/**
 * Socket.IO Client — Global singleton + useSocketEvent hook
 *
 * Kullanım:
 *   import { connect, disconnect, useSocketEvent, useSocketStatus } from './lib/socket';
 *   connect(token);  // login sonrası
 *   useSocketEvent('randevu:yeni', (data) => { ... });
 *   disconnect();    // logout
 */
import { io } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';

// Socket sunucusu = API kökü (rota prefiksi /api ama Socket.IO root path kullanır)
const DEFAULT_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : 'https://randevugo-api.onrender.com';

const SOCKET_URL = (import.meta.env.VITE_API_URL || DEFAULT_URL).replace(/\/api\/?$/, '');

let socket = null;
const listeners = new Set(); // durum güncellemesi dinleyicileri (hooklar için)

function notifyStatus(status, extra = {}) {
  listeners.forEach(fn => { try { fn({ status, ...extra }); } catch (e) {} });
}

export function connect(token) {
  if (!token) return null;
  if (socket && socket.connected) return socket;
  if (socket) { try { socket.disconnect(); } catch (e) {} socket = null; }

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
  });

  socket.on('connect', () => {
    console.log('[socket] ✅ Bağlandı:', socket.id);
    notifyStatus('connected');
  });
  socket.on('disconnect', (reason) => {
    console.log('[socket] ❌ Ayrıldı:', reason);
    notifyStatus('disconnected', { reason });
  });
  socket.on('connect_error', (err) => {
    console.warn('[socket] ⚠️ Bağlantı hatası:', err.message);
    notifyStatus('error', { error: err.message });
  });
  socket.on('reconnect_attempt', (n) => notifyStatus('reconnecting', { attempt: n }));

  return socket;
}

export function disconnect() {
  if (socket) {
    try { socket.disconnect(); } catch (e) {}
    socket = null;
  }
  notifyStatus('disconnected');
}

export function getSocket() { return socket; }

/**
 * Hook: bir event'i dinle, unmount'ta unsubscribe olsun.
 * Re-render sırasında handler değişse bile kararlı (ref ile tutuluyor).
 */
export function useSocketEvent(event, handler) {
  const handlerRef = useRef(handler);
  useEffect(() => { handlerRef.current = handler; }, [handler]);

  useEffect(() => {
    if (!socket) return undefined;
    const fn = (...args) => { try { handlerRef.current?.(...args); } catch (e) { console.error('socket event error:', e); } };
    socket.on(event, fn);

    // Socket sonradan connect ederse de bağla (ilk mount'ta socket null olabilir)
    // Bunun için listeners setine bir check ekle
    const statusListener = (s) => {
      if (s.status === 'connected' && socket) {
        socket.off(event, fn); // eski olasılığı temizle
        socket.on(event, fn);
      }
    };
    listeners.add(statusListener);

    return () => {
      try { socket?.off(event, fn); } catch (e) {}
      listeners.delete(statusListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);
}

/**
 * Hook: canlı bağlantı durumunu izle.
 * return: { status: 'connected'|'disconnected'|'reconnecting'|'error', ... }
 */
export function useSocketStatus() {
  const [state, setState] = useState(() => ({
    status: socket?.connected ? 'connected' : 'disconnected',
  }));
  useEffect(() => {
    const fn = (s) => setState(s);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return state;
}

export default { connect, disconnect, getSocket, useSocketEvent, useSocketStatus };
