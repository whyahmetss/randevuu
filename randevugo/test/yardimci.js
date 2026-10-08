// Testler için ortak hazırlık: gerçek Postgres yerine bellekte çalışan PGlite, WhatsApp (Baileys) taklidi.
// Kullanım: const { db } = await hazirla(`CREATE TABLE ...`);  ardından servisleri require et.
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const SRC = path.join(__dirname, '..', 'src');

function baileysTaklit() {
  const ad = require.resolve('@whiskeysockets/baileys', { paths: [SRC] });
  require.cache[ad] = {
    id: ad, filename: ad, loaded: true,
    exports: {
      default: () => {}, DisconnectReason: { loggedOut: 401, restartRequired: 515 },
      fetchLatestBaileysVersion: async () => ({}), makeCacheableSignalKeyStore: () => {},
      useMultiFileAuthState: async () => ({}), Browsers: { ubuntu: () => [] },
    },
  };
}

async function hazirla(sema = '') {
  const db = new PGlite();
  if (sema) await db.exec(sema);
  const sorgu = async (q, p) => {
    const r = await db.query(q, p || []);
    return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
  };
  const pool = {
    query: sorgu,
    connect: async () => ({ query: sorgu, release: () => {} }),
    on: () => {},
  };
  const dbYolu = require.resolve(path.join(SRC, 'config', 'db'));
  require.cache[dbYolu] = { id: dbYolu, filename: dbYolu, loaded: true, exports: pool };
  baileysTaklit();
  return { db, pool, SRC };
}

module.exports = { hazirla, SRC };
