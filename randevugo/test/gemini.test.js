// Gemini ortak çağrı: kalkan model bir daha denenmez, Google'ın önerdiği model kullanılır, toplam süre sınırlı
// (canlı hata 2026-10-29: gemini-2.5-flash-lite kalktı, müşteri mesajı 54 sn bekledi).
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const SRC = path.join(__dirname, '..', 'src');

function yeni() {
  delete require.cache[require.resolve(path.join(SRC, 'utils', 'gemini'))];
  return require(path.join(SRC, 'utils', 'gemini'));
}
const cevap = (status, govde) => ({ ok: status === 200, status, json: async () => govde, text: async () => (typeof govde === 'string' ? govde : JSON.stringify(govde)) });

test('gemini: kalkan model atlanır, 404 mesajındaki öneri sıradaki çağrıda ilk denenir', async (t) => {
  process.env.GEMINI_API_KEYS = 'a';
  delete process.env.GEMINI_MODEL;
  const g = yeni();
  const istenen = [];
  t.mock.method(global, 'fetch', async (url) => {
    const model = url.match(/models\/([^:]+):/)[1];
    istenen.push(model);
    if (model === 'gemini-3.5-flash-lite') return cevap(200, { candidates: [{ content: { parts: [{ text: 'tamam' }] } }] });
    return cevap(404, '{"error":{"code":404,"message":"This model models/' + model + ' is no longer available to new users. Please update your code to use models/gemini-3.5-flash-lite for the latest"}}');
  });
  t.mock.method(console, 'log', () => {});
  const j = await g.geminiIstek({}, { sure: 5000 });
  assert.strictEqual(g.metniAl(j), 'tamam');
  assert.deepStrictEqual(istenen, ['gemini-flash-latest', 'gemini-3.5-flash-lite'], 'öneri hemen sıradaki deneme olur');
  istenen.length = 0;
  await g.geminiIstek({}, { sure: 5000 });
  assert.deepStrictEqual(istenen, ['gemini-3.5-flash-lite'], 'kalkan modele bir daha istek gitmez');
  assert.ok(!g.modeller().includes('gemini-flash-latest'));
});

test('gemini: toplam süre aşılmaz (her model ayrı ayrı beklenmez)', async (t) => {
  process.env.GEMINI_API_KEYS = 'a,b,c,d';
  const g = yeni();
  let n = 0;
  t.mock.method(global, 'fetch', (url, { signal }) => { n++; return new Promise((_, red) => signal.addEventListener('abort', () => red(signal.reason))); });
  t.mock.method(console, 'error', () => {});
  const tut = setTimeout(() => {}, 5000);   // AbortSignal.timeout olay döngüsünü tek başına açık tutmaz
  const bas = Date.now();
  assert.strictEqual(await g.geminiIstek({}, { sure: 1200 }), null);
  clearTimeout(tut);
  const gecen = Date.now() - bas;
  assert.ok(gecen < 2000, `toplam ${gecen} ms`);
  assert.ok(n <= 2, `yalnız süre içinde deneme yapılır (${n})`);
  delete process.env.GEMINI_API_KEYS;
});

test('gemini: zaman aşımına düşen model süreyi tek başına yemez, sıradaki model denenir ve sonraki çağrılarda önce o', async (t) => {
  process.env.GEMINI_API_KEYS = 'a';
  delete process.env.GEMINI_MODEL;
  const g = yeni();
  const istenen = [];
  // Canlı (2026-10-31): gemini-flash-latest her istekte asılı kaldı, mesaj başına 24 sn
  t.mock.method(global, 'fetch', (url, { signal }) => {
    const model = url.match(/models\/([^:]+):/)[1];
    istenen.push(model);
    if (model === 'gemini-flash-latest') return new Promise((_, red) => signal.addEventListener('abort', () => red(signal.reason)));
    return Promise.resolve(cevap(200, { candidates: [{ content: { parts: [{ text: 'hızlı' }] } }] }));
  });
  t.mock.method(console, 'error', () => {});
  const tut = setTimeout(() => {}, 15000);
  const bas = Date.now();
  assert.strictEqual(g.metniAl(await g.geminiIstek({}, { sure: 10000 })), 'hızlı', 'süre bitmeden ikinci model cevap verir');
  assert.ok(Date.now() - bas < 7500, `ilk deneme sürenin yarısıyla (6 sn) sınırlı: ${Date.now() - bas} ms`);
  assert.deepStrictEqual(istenen, ['gemini-flash-latest', 'gemini-flash-lite-latest']);
  istenen.length = 0;
  await g.geminiIstek({}, { sure: 10000 });
  clearTimeout(tut);
  assert.deepStrictEqual(istenen, ['gemini-flash-lite-latest'], 'yavaş model 10 dk sona alınır');
  delete process.env.GEMINI_API_KEYS;
});
