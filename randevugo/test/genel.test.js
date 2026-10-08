const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { SRC } = require('./yardimci');

test('tüm kaynak dosyaları sözdizimi hatasız', () => {
  const dosyalar = [];
  const gez = (d) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, f.name);
      if (f.isDirectory()) { if (f.name !== 'public') gez(p); } else if (f.name.endsWith('.js')) dosyalar.push(p);
    }
  };
  gez(SRC);
  assert.ok(dosyalar.length > 20);
  for (const f of dosyalar) execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
});

test('paketler: Pro+ 1499₺ ve 3 şube, Standart şube açamaz', () => {
  const { FALLBACK_PAKETLER: P } = require(SRC + '/config/paketler');
  assert.strictEqual(P.proplus.fiyat, 1499);
  assert.strictEqual(P.proplus.sube_limit, 3);
  assert.ok(!P.profesyonel.sube_yonetimi);
});

test('deneme süresi 14 gün', () => {
  assert.strictEqual(require(SRC + '/config/deneme').DENEME_GUN, 14);
});

test('alarm: aynı konu 30 dk içinde bir kez gönderilir', async () => {
  const axios = require(require.resolve('axios', { paths: [SRC] }));
  const eski = axios.post; let n = 0;
  axios.post = async () => { n++; };
  process.env.TELEGRAM_SATIS_BOT_TOKEN = 't'; process.env.SATIS_TELEGRAM_CHAT_ID = 'c';
  try {
    const { alarm, hataSay } = require(SRC + '/utils/alarm');
    await alarm('test', '1'); await alarm('test', '2');
    for (let i = 0; i < 12; i++) hataSay('yağmur', 'x');
    await new Promise(r => setTimeout(r, 20));
    assert.strictEqual(n, 2);
  } finally { axios.post = eski; }
});
