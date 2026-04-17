const { Pool } = require('pg');
require('dotenv').config();

// ═══════════════════════════════════════════════════════════════════
// Neon.tech serverless PostgreSQL — connection pool + cold start retry
// ═══════════════════════════════════════════════════════════════════
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  // Neon uyumlu timeout'lar — cold start (ilk sorgu ~2-5sn olabilir)
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 30000,
  max: 10, // Neon Free plan: 10 eşzamanlı connection üst sınırı
});

pool.on('connect', () => {
  console.log('📦 PostgreSQL bağlantısı kuruldu');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL havuz hatası:', err.message);
});

// ═══ Retry wrapper — geçici bağlantı hatalarını (Neon cold start, network blip) yakalar ═══
const TRANSIENT_CODES = new Set([
  'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ENETUNREACH',
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
]);

const isTransient = (err) => {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection ended') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('could not connect')
  );
};

const originalQuery = pool.query.bind(pool);

pool.query = async (...args) => {
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await originalQuery(...args);
    } catch (err) {
      lastErr = err;
      if (!isTransient(err) || attempt === 3) throw err;
      const delay = 200 * attempt * attempt; // 200, 800, 1800 ms
      console.log(`⏳ DB geçici hata (${err.code || err.message}), ${delay}ms sonra yeniden (deneme ${attempt}/3)...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
};

module.exports = pool;
