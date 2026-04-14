#!/usr/bin/env node
const axios = require('axios');
const BASE = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'https://randevugo-api.onrender.com';
const WEBHOOK = `${BASE}/api/webhook/whatsapp`;
const PHONE = '905551234567';
let msgCounter = 0;

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', C: '\x1b[36m', M: '\x1b[35m' };
const results = [];

// ═══ Meta/WhatsApp Cloud API Payload Builder ═══
function buildPayload(from, body, type = 'text') {
  const msgId = `wamid.TEST${Date.now()}${++msgCounter}`;
  const base = {
    object: 'whatsapp_business_account',
    entry: [{
      id: '100000000000000',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '905001234567', phone_number_id: '100000000000001' },
          contacts: [{ profile: { name: 'Test User' }, wa_id: from }],
          messages: []
        },
        field: 'messages'
      }]
    }]
  };

  const msg = { from, id: msgId, timestamp: Math.floor(Date.now() / 1000).toString() };

  if (type === 'text') {
    msg.type = 'text';
    msg.text = { body };
  } else if (type === 'image') {
    msg.type = 'image';
    msg.image = { mime_type: 'image/jpeg', sha256: 'abc123', id: 'img_001' };
  } else if (type === 'audio') {
    msg.type = 'audio';
    msg.audio = { mime_type: 'audio/ogg', sha256: 'abc456', id: 'aud_001' };
  } else if (type === 'document') {
    msg.type = 'document';
    msg.document = { mime_type: 'application/pdf', sha256: 'abc789', id: 'doc_001', filename: 'test.pdf' };
  } else if (type === 'location') {
    msg.type = 'location';
    msg.location = { latitude: 41.0082, longitude: 28.9784 };
  } else if (type === 'empty_messages') {
    base.entry[0].changes[0].value.messages = [];
    return base;
  } else if (type === 'no_text') {
    msg.type = 'text';
    // text.body yok
    return base;
  }

  base.entry[0].changes[0].value.messages = [msg];
  return base;
}

// ═══ Send helper ═══
async function send(from, body, type = 'text') {
  const payload = buildPayload(from, body, type);
  const t0 = Date.now();
  try {
    const res = await axios.post(WEBHOOK, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 5000, validateStatus: () => true });
    const ms = Date.now() - t0;
    return { status: res.status, data: res.data, ms, timeout: ms > 3000 };
  } catch (e) {
    const ms = Date.now() - t0;
    if (e.code === 'ECONNABORTED' || e.message.includes('timeout')) return { status: 0, data: null, ms, timeout: true, error: 'TIMEOUT' };
    return { status: 0, data: null, ms, timeout: false, error: e.message };
  }
}

// ═══ Session reset: benzersiz telefon numarası kullan ═══
let phoneIdx = 0;
function freshPhone() { return `9055500${String(++phoneIdx).padStart(5, '0')}`; }

// ═══ Test runner ═══
async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    const ms = Date.now() - t0;
    results.push({ name, passed: true, ms });
    console.log(`  ${C.G}✅ PASS${C.r} ${C.d}(${ms}ms)${C.r} ${name}`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ name, passed: false, ms, error: e.message });
    console.log(`  ${C.R}❌ FAIL${C.r} ${C.d}(${ms}ms)${C.r} ${name}`);
    console.log(`        ${C.R}→ ${e.message}${C.r}`);
  }
}
function assert(c, m) { if (!c) throw new Error(m); }
function assertOk(r, ctx = '') {
  if (r.error) throw new Error(`${r.error} ${ctx}`);
  if (r.timeout) throw new Error(`TIMEOUT (${r.ms}ms) ${ctx}`);
  assert(r.status < 500, `Server error: ${r.status} ${ctx} ${JSON.stringify(r.data).slice(0, 150)}`);
}

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════
(async () => {
  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════╗\n║  RandevuGO — WhatsApp Bot Test Suite           ║\n╚════════════════════════════════════════════════╝${C.r}`);
  console.log(`${C.d}  Webhook: ${WEBHOOK}\n  Zaman  : ${new Date().toLocaleString('tr-TR')}${C.r}`);

  // ═══════════════════════════════════════════
  // 1. TEMEL AKIŞLAR VE ÇOKLU DİL
  // ═══════════════════════════════════════════
  const SEC = s => console.log(`\n${C.C}${C.b}═══ ${s} ═══${C.r}`);

  SEC('1. Temel Akışlar & Çoklu Dil');

  await test('Merhaba → Ana menü (session başlatma)', async () => {
    const r = await send(freshPhone(), 'Merhaba');
    assertOk(r);
  });

  await test('"1" → Hizmet listesi', async () => {
    const ph = freshPhone();
    await send(ph, 'Merhaba');
    const r = await send(ph, '1');
    assertOk(r);
  });

  await test('"hello" → İngilizce menü', async () => {
    const r = await send(freshPhone(), 'hello');
    assertOk(r);
  });

  await test('"hi" → İngilizce menü', async () => {
    const r = await send(freshPhone(), 'hi');
    assertOk(r);
  });

  await test('"مرحبا" → Arapça menü', async () => {
    const r = await send(freshPhone(), 'مرحبا');
    assertOk(r);
  });

  await test('"iptal" → Akışı kes, ana menü', async () => {
    const ph = freshPhone();
    await send(ph, 'Merhaba');
    await send(ph, '1');
    const r = await send(ph, 'iptal');
    assertOk(r);
  });

  await test('"sıram" → Sıra bilgisi (crash yok)', async () => {
    const r = await send(freshPhone(), 'sıram');
    assertOk(r);
  });

  await test('"puanım" → Puan bilgisi (crash yok)', async () => {
    const r = await send(freshPhone(), 'puanım');
    assertOk(r);
  });

  await test('"referans" → Referans kodu (crash yok)', async () => {
    const r = await send(freshPhone(), 'referans');
    assertOk(r);
  });

  // ═══════════════════════════════════════════
  // 2. STATE KORUMALI ÇOK ADIMLI TEST
  // ═══════════════════════════════════════════
  SEC('2. State Korumalı Çok Adımlı Akış');

  await test('Adım 1: Merhaba → Adım 2: "1" (3s bekleme) → Adım 3: Geçersiz tarih', async () => {
    const ph = freshPhone();
    const r1 = await send(ph, 'Merhaba');
    assertOk(r1, 'Adım 1');

    await new Promise(res => setTimeout(res, 3000));

    const r2 = await send(ph, '1');
    assertOk(r2, 'Adım 2');

    const r3 = await send(ph, 'yarın saat 25:00');
    assertOk(r3, 'Adım 3 — geçersiz tarih');
    // Bot hata verip aynı adımda kalmalı, crash olmamalı
  });

  await test('Akış ortasında "menü" → state sıfırlama', async () => {
    const ph = freshPhone();
    await send(ph, 'Merhaba');
    await send(ph, '1');
    const r = await send(ph, 'menü');
    assertOk(r);
  });

  // ═══════════════════════════════════════════
  // 3. GİRDİ GÜVENLİĞİ VE EDGE CASELER
  // ═══════════════════════════════════════════
  SEC('3. Girdi Güvenliği & Edge Cases');

  await test('SQL Injection payload', async () => {
    const r = await send(freshPhone(), "'; DROP TABLE randevular;--");
    assertOk(r, 'SQLi');
  });

  await test('XSS payload', async () => {
    const r = await send(freshPhone(), '<script>alert(1)</script>');
    assertOk(r, 'XSS');
  });

  await test('10.000 karakter sınır aşımı', async () => {
    const r = await send(freshPhone(), 'A'.repeat(10000));
    assertOk(r, '10K char');
  });

  await test('Sadece emoji: "😀😀😀"', async () => {
    const r = await send(freshPhone(), '😀😀😀');
    assertOk(r);
  });

  await test('Boşluklu giriş: "   evet   "', async () => {
    const r = await send(freshPhone(), '   evet   ');
    assertOk(r);
  });

  await test('Eksik payload: messages dizisi boş', async () => {
    const payload = buildPayload(freshPhone(), '', 'empty_messages');
    const t0 = Date.now();
    try {
      const res = await axios.post(WEBHOOK, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 5000, validateStatus: () => true });
      assert(res.status < 500, `Server error: ${res.status}`);
    } catch (e) {
      if (e.code === 'ECONNABORTED') throw new Error('TIMEOUT');
      throw e;
    }
  });

  await test('Eksik payload: text.body yok', async () => {
    const payload = buildPayload(freshPhone(), '', 'no_text');
    // no_text tipinde messages boş dönüyor, düzeltelim:
    payload.entry[0].changes[0].value.messages = [{
      from: freshPhone(), id: 'wamid.NOTEXT', timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text'
      // text.body yok!
    }];
    const t0 = Date.now();
    try {
      const res = await axios.post(WEBHOOK, payload, { headers: { 'Content-Type': 'application/json' }, timeout: 5000, validateStatus: () => true });
      assert(res.status < 500, `Server error: ${res.status}`);
    } catch (e) {
      if (e.code === 'ECONNABORTED') throw new Error('TIMEOUT');
      throw e;
    }
  });

  // ═══════════════════════════════════════════
  // 4. DESTEKLENMEYEN MEDYA TİPLERİ
  // ═══════════════════════════════════════════
  SEC('4. Desteklenmeyen Medya Tipleri');

  for (const type of ['image', 'audio', 'document', 'location']) {
    await test(`Medya tipi: ${type} → crash yok`, async () => {
      const r = await send(freshPhone(), null, type);
      assertOk(r, type);
    });
  }

  // ═══════════════════════════════════════════
  // 5. PERFORMANS VE SPAM (RATE LIMITING)
  // ═══════════════════════════════════════════
  SEC('5. Performans & Spam');

  await test('10x "Merhaba" aynı anda (Promise.all) → crash yok', async () => {
    const ph = freshPhone();
    const promises = Array.from({ length: 10 }, () => send(ph, 'Merhaba'));
    const results = await Promise.all(promises);
    let serverErrors = 0;
    for (const r of results) {
      if (r.status >= 500) serverErrors++;
      // 200 veya 429 kabul
    }
    assert(serverErrors === 0, `${serverErrors}/10 istek 500 döndü (server crash)`);
  });

  await test('10x farklı numaradan eşzamanlı → crash yok', async () => {
    const promises = Array.from({ length: 10 }, () => send(freshPhone(), 'Merhaba'));
    const results = await Promise.all(promises);
    for (const r of results) {
      assert(r.status < 500 || r.status === 0, `Server error: ${r.status}`);
    }
  });

  await test('Yanıt süresi < 3s (tekil istek)', async () => {
    const r = await send(freshPhone(), 'Merhaba');
    assertOk(r);
    assert(!r.timeout, `TIMEOUT: ${r.ms}ms > 3000ms`);
  });

  // ═══════════════════════════════════════════
  // ÖZET
  // ═══════════════════════════════════════════
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const totalMs = results.reduce((s, r) => s + r.m, 0) || 0;

  console.log(`\n${C.b}${C.C}══════════════════════════════════════════════════${C.r}`);
  if (failed === 0) {
    console.log(`  ${C.b}${C.G}🎉 TÜM TESTLER BAŞARILI: ${passed}/${total} passed${C.r}`);
  } else {
    console.log(`  ${C.b}${C.Y}SONUÇ: ${passed}/${total} passed, ${C.R}${failed} failed${C.r}`);
    console.log(`\n${C.R}${C.b}  Başarısız:${C.r}`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  ${C.R}✗${C.r} ${r.name}\n    ${C.d}${r.error}${C.r}`);
    }
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
})();
