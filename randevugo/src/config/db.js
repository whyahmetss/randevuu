const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

pool.on('connect', () => {
  console.log('📦 PostgreSQL bağlantısı kuruldu');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL hatası:', err);
});

module.exports = pool;
