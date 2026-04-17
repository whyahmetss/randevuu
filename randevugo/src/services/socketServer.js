/**
 * Socket.IO merkezi sunucu
 * 
 * Odalar:
 *   - `isletme:${isletme_id}` — işletme kullanıcıları (esnaf + tablet)
 *   - `user:${user_id}`       — kullanıcı-specific
 *   - `admin`                 — süper admin (Faz 2 için rezerve)
 * 
 * Eventler (server → client):
 *   - randevu:yeni / randevu:guncellendi / randevu:iptal
 *   - musteri:yeni / musteri:guncellendi
 *   - wa:qr / wa:bagli / wa:ayrildi
 *   - bildirim:yeni
 *   - destek:cevap
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../middleware/auth');

let io = null;

function init(httpServer, allowedOrigins = []) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error('Socket.IO CORS: Origin not allowed'));
      },
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // JWT auth middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Token yok'));
      const decoded = jwt.verify(token, jwtSecret);
      socket.data.kullanici = decoded;
      return next();
    } catch (e) {
      return next(new Error('Geçersiz token'));
    }
  });

  io.on('connection', async (socket) => {
    const k = socket.data.kullanici;
    if (!k) { socket.disconnect(true); return; }

    // Otomatik odalar
    if (k.isletme_id) socket.join(`isletme:${k.isletme_id}`);
    if (k.id) socket.join(`user:${k.id}`);
    if (k.rol === 'superadmin' || k.rol === 'super_admin') socket.join('admin');

    console.log(`🔌 Socket bağlandı: user=${k.id}, isletme=${k.isletme_id}, rol=${k.rol}`);

    socket.emit('connected', { userId: k.id, isletmeId: k.isletme_id, rol: k.rol });

    // Presence — odadaki cihaz sayısını yayınla
    if (k.isletme_id) {
      try {
        const size = await io.in(`isletme:${k.isletme_id}`).fetchSockets().then(s => s.length);
        io.to(`isletme:${k.isletme_id}`).emit('presence', { isletmeId: k.isletme_id, cihaz: size });
      } catch (e) {}
    }

    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Socket ayrıldı: user=${k.id}, reason=${reason}`);
      if (k.isletme_id) {
        try {
          const size = await io.in(`isletme:${k.isletme_id}`).fetchSockets().then(s => s.length);
          io.to(`isletme:${k.isletme_id}`).emit('presence', { isletmeId: k.isletme_id, cihaz: size });
        } catch (e) {}
      }
    });
  });

  console.log('✅ Socket.IO sunucusu başlatıldı');
  return io;
}

function getIo() { return io; }

// Helpers — graceful (io yoksa sessizce yut)
function emitToIsletme(isletmeId, event, data) {
  if (!io || !isletmeId) return;
  try { io.to(`isletme:${isletmeId}`).emit(event, data); } catch (e) {}
}

function emitToUser(userId, event, data) {
  if (!io || !userId) return;
  try { io.to(`user:${userId}`).emit(event, data); } catch (e) {}
}

function emitToAdmin(event, data) {
  if (!io) return;
  try { io.to('admin').emit(event, data); } catch (e) {}
}

function emitAll(event, data) {
  if (!io) return;
  try { io.emit(event, data); } catch (e) {}
}

module.exports = {
  init,
  getIo,
  emitToIsletme,
  emitToUser,
  emitToAdmin,
  emitAll,
};
