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
    assert.strictEqual(cagrilar.length, 2);

    global.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"mesajlar":[],"durum":"x"}' } }], candidates: [] }) });
    assert.strictEqual(await ai.cevapUret({ konusma: { gelen_mesajlar: '' }, sonMesaj: 'a' }), null);
  } finally {
    global.fetch = eski;
    delete process.env.GEMINI_API_KEY; delete process.env.DEEPSEEK_API_KEY;
  }
});
