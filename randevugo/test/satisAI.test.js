const test = require('node:test');
const assert = require('node:assert');
const { SRC } = require('./yardimci');

const ai = require(SRC + '/services/satisAI');

test('parça parça yazılan mesajlar tek müşteri turuna birleşir', () => {
  const m = ai.gecmistenMesajlar('[10:00] Bot: Merhaba\n[10:01] Müşteri: slm\n[10:01] Müşteri: fiyt ne', 'nasıl çalışıyo');
  assert.deepStrictEqual(m, [{ role: 'user', content: 'slm\nfiyt ne\nnasıl çalışıyo' }]);
});

test('son mesaj günlükte zaten varsa iki kez eklenmez', () => {
  const m = ai.gecmistenMesajlar('[10:01] Müşteri: selam\n[10:02] Bot: Buyrun\n[10:03] Müşteri: fiyat', 'fiyat');
  assert.strictEqual(m.length, 3);
  assert.strictEqual(m[2].content, 'fiyat');
});

test('Gemini çökerse DeepSeek cevap verir, bozuk JSON reddedilir', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.GEMINI_API_KEY = 'g'; process.env.DEEPSEEK_API_KEY = 'd';
  const eski = global.fetch;
  const cagrilar = [];
  try {
    global.fetch = async (u) => {
      cagrilar.push(u);
      if (u.includes('googleapis')) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n{"mesajlar":["Merhaba","Nasıl alıyorsunuz?"],"durum":"olumlu","arama_istiyor":false}\n```' } }] }) };
    };
    const r = await ai.cevapUret({ konusma: { gelen_mesajlar: '[1] Müşteri: slm' }, paketListesi: '', sonMesaj: 'fiyat' });
    assert.deepStrictEqual(r.mesajlar, ['Merhaba', 'Nasıl alıyorsunuz?']);
    assert.ok(cagrilar.at(-1).includes('deepseek'), 'Gemini modelleri meşgul → en son DeepSeek denendi');

    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"mesajlar":[],"durum":"x"}' } }], candidates: [] }) });
    assert.strictEqual(await ai.cevapUret({ konusma: { gelen_mesajlar: '' }, sonMesaj: 'a' }), null);
  } finally {
    global.fetch = eski;
    delete process.env.GEMINI_API_KEY; delete process.env.DEEPSEEK_API_KEY;
  }
});

test('Gemini: birden çok anahtar dönüşümlü; kotası dolan anahtardan sıradakine geçilir', async () => {
  delete process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEYS = 'anahtarA,anahtarB';
  const g = require(SRC + '/utils/gemini');
  const eski = global.fetch;
  const kullanilan = [];
  try {
    global.fetch = async (u, o) => {
      kullanilan.push(o.headers['x-goog-api-key']);
      if (o.headers['x-goog-api-key'] === 'anahtarA') return { ok: false, status: 429, text: async () => 'quota' };
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'merhaba' }] } }] }) };
    };
    const j = await g.geminiIstek({ contents: [] });
    assert.strictEqual(g.metniAl(j), 'merhaba');
    assert.ok(kullanilan.includes('anahtarB'));
  } finally { global.fetch = eski; delete process.env.GEMINI_API_KEYS; }
});

test('yapay zekâ izi temizlenir: uzun tire, kalın yazı, madde işareti, sondaki nokta', () => {
  assert.strictEqual(ai.dogallastir('Tabii — hemen bakalım.'), 'Tabii, hemen bakalım');
  assert.strictEqual(ai.dogallastir('**Kayıt** için yazın...'), 'Kayıt için yazın...');
  assert.strictEqual(ai.dogallastir('- Olur mu?'), 'Olur mu?');
  assert.strictEqual(ai.dogallastir('Fiyat 500–700 arası.'), 'Fiyat 500–700 arası', 'sayı aralığı bozulmaz');
});
