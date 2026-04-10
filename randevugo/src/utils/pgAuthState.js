/**
 * PostgreSQL-based auth state for Baileys (replaces useMultiFileAuthState)
 * Stores WhatsApp session credentials in DB so deploys don't break connections.
 */
const { proto } = require('@whiskeysockets/baileys');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

const TABLE = 'wa_auth_keys';

async function usePostgresAuthState(pool, isletmeId) {
  const prefix = `isletme_${isletmeId}`;

  // ─── Helper: read from DB ───
  async function readData(id) {
    try {
      const res = await pool.query(
        `SELECT key_data FROM ${TABLE} WHERE isletme_id=$1 AND key_id=$2`,
        [isletmeId, id]
      );
      if (res.rows.length === 0) return null;
      return JSON.parse(res.rows[0].key_data, BufferJSON.reviver);
    } catch (e) {
      return null;
    }
  }

  // ─── Helper: write to DB ───
  async function writeData(id, data) {
    const json = JSON.stringify(data, BufferJSON.replacer);
    await pool.query(
      `INSERT INTO ${TABLE} (isletme_id, key_id, key_data) VALUES ($1, $2, $3)
       ON CONFLICT (isletme_id, key_id) DO UPDATE SET key_data = $3, updated_at = NOW()`,
      [isletmeId, id, json]
    );
  }

  // ─── Helper: remove from DB ───
  async function removeData(id) {
    await pool.query(
      `DELETE FROM ${TABLE} WHERE isletme_id=$1 AND key_id=$2`,
      [isletmeId, id]
    );
  }

  // ─── Load or init creds ───
  let creds = await readData('creds');
  if (!creds) {
    creds = initAuthCreds();
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          for (const id of ids) {
            const value = await readData(`${type}-${id}`);
            if (value) {
              if (type === 'app-state-sync-key') {
                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
              } else {
                data[id] = value;
              }
            }
          }
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              if (value) {
                tasks.push(writeData(`${category}-${id}`, value));
              } else {
                tasks.push(removeData(`${category}-${id}`));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
  };
}

module.exports = { usePostgresAuthState };
