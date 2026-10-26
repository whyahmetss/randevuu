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
 *   - veri:degisti { tur: hizmet|calisan|ayar|randevu } — başka cihazdaki değişiklik, ekran kendini tazeler
 *
 * Misafir (giriş yapmamış müşteri, randevu sayfası, 2026-10-14):
 *   - handshake auth.slug → yalnız `book:${slug}` odası; içerik taşımayan sinyaller alır:
 *     saatler:degisti (biri randevu aldı/iptal etti), sayfa:degisti (hizmet ya da görünüm değişti)
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../middleware/auth');

let io = null;

function init(httpServer, allowedOrigins = [], corsCheck = null) {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        // corsCheck verilmişse onu kullan (regex dahil), yoksa sadece liste
        const ok = corsCheck ? corsCheck(origin) : (!origin || allowedOrigins.includes(origin));
        if (ok) cb(null, true);
        else cb(null, false); // throw yok, silent reject
      },
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingInterval: 25000,
    pingTimeout: 20000,
  });

  // JWT auth middleware
  io.use((socket, next) => kimlik(socket).then(() => next(), (e) => next(e)));

  io.on('connection', async (socket) => {
    if (socket.data.misafir) { socket.join(`book:${socket.data.misafir}`); return; }
    const k = socket.data.kullanici;
    if (!k) { socket.disconnect(true); return; }

    // Otomatik odalar
    // Personel dükkânın bütün randevu olaylarını almaz (yalnız kendi ekranı; liste sayfası yeniler)
    if (k.isletme_id && k.rol !== 'personel') socket.join(`isletme:${k.isletme_id}`);
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

// Bağlantı kimliği: HTTP ile aynı kural (2026-10-26). Anahtar yalnız auth alanından (adres satırı loglara düşer);
// silinen/kapatılan hesap bağlanamaz; rol veritabanından (rolü düşürülen ekip üyesi süper admin odasına giremez).
async function kimlik(socket) {
  const token = socket.handshake.auth?.token;
  const slug = String(socket.handshake.auth?.slug || '');
  if (!token && /^[a-z0-9-]{1,100}$/.test(slug)) { socket.data.misafir = slug; return; }
  if (!token) throw new Error('Token yok');
  let decoded;
  try { decoded = jwt.verify(token, jwtSecret); } catch (e) { throw new Error('Geçersiz token'); }
  const k = (await require('../config/db').query('SELECT rol, aktif FROM admin_kullanicilar WHERE id = $1', [decoded.id])).rows[0];
  if (!k || k.aktif === false) throw new Error('Hesap kapatılmış');
  socket.data.kullanici = { ...decoded, rol: k.rol || decoded.rol };
}

// Hesap kapatılınca/silinince açık canlı bağlantıları da düşür
function kullaniciDusur(userId) {
  if (!io || !userId) return;
  try { io.in(`user:${userId}`).disconnectSockets(true); } catch (e) {}
}

function getIo() { return io; }

// Randevu sayfasındaki müşterilere sinyal (içerik yok: kim, ne aldı gitmez)
const slugCache = new Map();   // isletmeId → { slug, zaman }
async function emitToBook(isletmeId, event) {
  if (!io || !isletmeId) return;
  try {
    let c = slugCache.get(isletmeId);
    if (!c || Date.now() - c.zaman > 10 * 60 * 1000) {
      const r = (await require('../config/db').query('SELECT slug FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
      c = { slug: r?.slug || null, zaman: Date.now() };
      slugCache.set(isletmeId, c);
    }
    if (c.slug) io.to(`book:${c.slug}`).emit(event, {});
  } catch (e) { /* sinyal önemsiz */ }
}

// Helpers — graceful (io yoksa sessizce yut)
function emitToIsletme(isletmeId, event, data) {
  if (!io || !isletmeId) return;
  try { io.to(`isletme:${isletmeId}`).emit(event, data); } catch (e) {}
  // Randevu değişince randevu sayfasındaki müşterilerin boş saatleri tazelensin
  if (String(event).startsWith('randevu:') || (event === 'veri:degisti' && data?.tur === 'randevu')) emitToBook(isletmeId, 'saatler:degisti');
  else if (event === 'veri:degisti' && ['hizmet', 'calisan', 'ayar'].includes(data?.tur)) emitToBook(isletmeId, 'sayfa:degisti');
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
  emitToBook,
  kullaniciDusur,
  _test: { kimlik },
};
