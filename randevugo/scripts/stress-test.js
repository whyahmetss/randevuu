#!/usr/bin/env node
/**
 * RandevuGO — Stress / Rate-Limit / DoS Dayanıklılık Testi
 * node scripts/stress-test.js [--base-url=https://...]
 */
const axios = require('axios');

const BASE = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'https://randevugo-api.onrender.com';
const WEBHOOK = `${BASE}/api/webhook/whatsapp`;

const C = {
  r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
  R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', C: '\x1b[36m', M: '\x1b[35m', W: '\x1b[37m'
};

const results = [];

function S(s) { console.log(`\n${C.C}${C.b}═══ ${s} ═══${C.r}`); }
function L(m) { console.log(`  ${C.d}${m}${C.r}`); }

function statusDist(codes) {
  const dist = {};
  codes.forEach(c => { dist[c] = (dist[c] || 0) + 1; });
  return Object.entries(dist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}x ${k}`).join(', ');
}

async function sendTwilio(phone, body, timeout = 15000) {
  const t0 = Date.now();
  try {
    const r = await axios.post(WEBHOOK, {
      From: `whatsapp:+${phone}`,
      Body: body,
      To: ''
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout,
      validateStatus: () => true
    });
    return { status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { status: e.code === 'ECONNABORTED' ? 'TIMEOUT' : `ERR:${e.code || e.message}`, ms: Date.now() - t0 };
  }
}

async function sendRaw(data, timeout = 10000) {
  const t0 = Date.now();
  try {
    const r = await axios.post(WEBHOOK, data, {
      headers: { 'Content-Type': 'application/json' },
      timeout,
      validateStatus: () => true
    });
    return { status: r.status, ms: Date.now() - t0 };
  } catch (e) {
    return { status: e.code === 'ECONNABORTED' ? 'TIMEOUT' : `ERR:${e.code || e.message}`, ms: Date.now() - t0 };
  }
}

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    results.push({ n: name, p: result.pass, ms, detail: result.detail });
    const icon = result.pass ? `${C.G}✅ PASS` : `${C.R}❌ FAIL`;
    console.log(`  ${icon}${C.r} ${C.d}(${(ms / 1000).toFixed(1)}s)${C.r} ${name}`);
    if (result.detail) console.log(`        ${C.d}${result.detail}${C.r}`);
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ n: name, p: false, ms, detail: e.message });
    console.log(`  ${C.R}❌ FAIL${C.r} ${C.d}(${(ms / 1000).toFixed(1)}s)${C.r} ${name}\n        ${C.R}→ ${e.message}${C.r}`);
  }
}

// ═══════════════════════════════════════
(async () => {
  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════════╗\n║  RandevuGO — Stress & Rate-Limit Testi             ║\n╚════════════════════════════════════════════════════╝${C.r}`);
  console.log(`${C.d}  Webhook : ${WEBHOOK}\n  Zaman   : ${new Date().toLocaleString('tr-TR')}${C.r}`);

  // ═══════════════════════════════════════════════════
  // 1. DİKEY SPAM — Tek numaradan 50 eşzamanlı istek
  // ═══════════════════════════════════════════════════
  S('1. Dikey Spam — Tek Numaradan 50 Eşzamanlı İstek');

  await test('50x "Merhaba" aynı anda (905550001111)', async () => {
    const phone = '905550001111';
    const N = 50;

    L(`${N} istek aynı anda gönderiliyor...`);
    const promises = Array.from({ length: N }, () => sendTwilio(phone, 'Merhaba'));
    const all = await Promise.all(promises);

    const codes = all.map(r => r.status);
    const times = all.map(r => r.ms);
    const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const maxMs = Math.max(...times);
    const minMs = Math.min(...times);

    const s200 = codes.filter(c => c === 200).length;
    const s429 = codes.filter(c => c === 429).length;
    const sErr = codes.filter(c => c !== 200 && c !== 429).length;
    const dist = statusDist(codes);

    L(`Dağılım : ${dist}`);
    L(`Süre    : min=${minMs}ms, avg=${avgMs}ms, max=${maxMs}ms`);

    // PASS koşulu: sunucu çökmemeli (tüm isteklere cevap vermiş olmalı)
    // ve ya rate-limit aktifse 429 dönmeli, ya da 200 dönüp sessizce drop etmeli
    const allResponded = all.every(r => typeof r.status === 'number');
    const has429 = s429 > 0;
    const noServerError = codes.filter(c => c >= 500).length === 0;

    let detail = '';
    if (has429) {
      detail = `✓ Rate-limit aktif: ${s429}/${N} istek 429 ile reddedildi`;
    } else if (s200 === N && noServerError) {
      detail = `⚠ Rate-limit YOK ama sunucu çökmedi (${N}/${N} → 200). Tüm istekler işlendi.`;
    } else {
      detail = `Sunucu cevapları: ${dist}`;
    }

    return {
      pass: allResponded && noServerError,
      detail: `${detail}\n        Süre: avg=${avgMs}ms, max=${maxMs}ms | ${dist}`
    };
  });

  // ═══════════════════════════════════════════════════
  // 2. YATAY SPAM — 20 farklı numaradan eşzamanlı
  // ═══════════════════════════════════════════════════
  S('2. Yatay Spam — 20 Numaradan Eşzamanlı (DDoS Sim.)');

  await test('20 farklı numara aynı anda "1" gönder', async () => {
    const N = 20;
    const phones = Array.from({ length: N }, (_, i) =>
      `9055500${String(i + 1).padStart(5, '0')}`
    );

    L(`${N} numara eşzamanlı gönderiliyor...`);
    const t0 = Date.now();
    const promises = phones.map(p => sendTwilio(p, '1'));
    const all = await Promise.all(promises);
    const totalMs = Date.now() - t0;

    const codes = all.map(r => r.status);
    const times = all.map(r => r.ms);
    const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const maxMs = Math.max(...times);
    const minMs = Math.min(...times);
    const dist = statusDist(codes);

    L(`Dağılım  : ${dist}`);
    L(`Süre     : min=${minMs}ms, avg=${avgMs}ms, max=${maxMs}ms, total=${totalMs}ms`);

    const noServerError = codes.filter(c => c >= 500).length === 0;
    const avgUnder3s = avgMs < 3000;

    let detail = '';
    if (!avgUnder3s) {
      detail = `⚠ Ort. yanıt süresi ${avgMs}ms (> 3000ms hedefi)`;
    } else {
      detail = `✓ Ort. yanıt: ${avgMs}ms (< 3s hedefi)`;
    }

    return {
      pass: noServerError && avgUnder3s,
      detail: `${detail}\n        ${dist} | max=${maxMs}ms`
    };
  });

  // ═══════════════════════════════════════════════════
  // 3. MALFORMED JSON — Hatalı payload saldırısı
  // ═══════════════════════════════════════════════════
  S('3. Malformed JSON — Hatalı Payload Saldırısı');

  await test('50 hatalı payload (10/s × 5s)', async () => {
    const malformedPayloads = [
      // Boş body
      {},
      // Sadece entry
      { entry: [{}] },
      // entry > changes ama value yok
      { entry: [{ changes: [{}] }] },
      // text.body null
      { entry: [{ changes: [{ value: { messages: [{ text: { body: null } }] } }] }] },
      // From var ama Body yok
      { From: 'whatsapp:+905550001111' },
      // Body var ama From yok
      { Body: 'test' },
      // Sayısal From
      { From: 12345, Body: 'test', To: '' },
      // Çok uzun mesaj
      { From: 'whatsapp:+905550001111', Body: 'A'.repeat(10000), To: '' },
      // Array body
      { From: 'whatsapp:+905550001111', Body: [1, 2, 3], To: '' },
      // Nested garbage
      { From: 'whatsapp:+905550001111', Body: { nested: { deep: true } }, To: '' },
    ];

    const RATE = 10; // per second
    const DURATION = 5; // seconds
    const TOTAL = RATE * DURATION;

    L(`${TOTAL} hatalı istek gönderiliyor (${RATE}/s × ${DURATION}s)...`);

    const allResults = [];
    for (let sec = 0; sec < DURATION; sec++) {
      const batch = Array.from({ length: RATE }, (_, i) => {
        const payload = malformedPayloads[(sec * RATE + i) % malformedPayloads.length];
        return sendRaw(payload, 10000);
      });
      const batchResults = await Promise.all(batch);
      allResults.push(...batchResults);

      // 1 saniye bekle (batch arası)
      if (sec < DURATION - 1) await new Promise(r => setTimeout(r, 1000));
    }

    const codes = allResults.map(r => r.status);
    const times = allResults.map(r => r.ms);
    const avgMs = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const maxMs = Math.max(...times);
    const dist = statusDist(codes);

    L(`Dağılım : ${dist}`);
    L(`Süre    : avg=${avgMs}ms, max=${maxMs}ms`);

    // PASS: sunucu çökmemeli (5xx olmamalı veya minimal olmalı)
    const s5xx = codes.filter(c => typeof c === 'number' && c >= 500).length;
    const sTimeout = codes.filter(c => c === 'TIMEOUT').length;
    const sErr = codes.filter(c => typeof c === 'string' && c !== 'TIMEOUT').length;
    const allResponded = sTimeout === 0 && sErr === 0;

    // En az yarısı yanıt vermiş olmalı (bazıları timeout olabilir)
    const responded = codes.filter(c => typeof c === 'number').length;
    const respondRate = (responded / TOTAL * 100).toFixed(0);

    let detail = '';
    if (s5xx === 0 && responded > TOTAL * 0.5) {
      detail = `✓ Sunucu sağlam: 0 crash, ${respondRate}% yanıt oranı`;
    } else if (s5xx > 0) {
      detail = `⚠ ${s5xx} adet 5xx hatası — sunucu bazı isteklerde çöktü`;
    } else {
      detail = `⚠ Yanıt oranı düşük: ${respondRate}%`;
    }

    return {
      pass: s5xx <= TOTAL * 0.05 && responded > TOTAL * 0.5,
      detail: `${detail}\n        ${dist} | avg=${avgMs}ms`
    };
  });

  // ═══════════════════════════════════════════════════
  // 4. Health check — sunucu hala ayakta mı?
  // ═══════════════════════════════════════════════════
  S('4. Post-Stress Sağlık Kontrolü');

  await test('API hala ayakta mı?', async () => {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const r = await axios.get(`${BASE}/api/health`, { timeout: 10000 });
      return {
        pass: r.status === 200,
        detail: `Health: ${r.status} — sunucu ayakta ✓`
      };
    } catch (e) {
      return { pass: false, detail: `Health FAIL: ${e.message}` };
    }
  });

  await test('Webhook normal istek kabul ediyor mu?', async () => {
    const r = await sendTwilio('905559999999', 'test');
    return {
      pass: r.status === 200,
      detail: `Webhook: ${r.status} (${r.ms}ms) — normal akış çalışıyor ✓`
    };
  });

  // ═══════════════════════════════════════════════════
  // RAPOR
  // ═══════════════════════════════════════════════════
  const passed = results.filter(r => r.p).length;
  const failed = results.filter(r => !r.p).length;
  const total = results.length;

  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════════╗\n║  STRESS TEST RAPORU                                ║\n╚════════════════════════════════════════════════════╝${C.r}\n`);

  const colW = 52;
  for (const r of results) {
    const icon = r.p ? `${C.G}✅ PASS` : `${C.R}❌ FAIL`;
    const dur = `${(r.ms / 1000).toFixed(1)}s`;
    console.log(`  ${icon}${C.r}  ${r.n} ${C.d}(${dur})${C.r}`);
    if (r.detail) {
      r.detail.split('\n').forEach(line => {
        console.log(`        ${C.d}${line.trim()}${C.r}`);
      });
    }
  }

  console.log(`\n${C.b}${C.C}══════════════════════════════════════════════════════${C.r}`);
  if (failed === 0) {
    console.log(`  ${C.b}${C.G}🛡️  TÜM STRES TESTLERİ BAŞARILI: ${passed}/${total}${C.r}`);
    console.log(`  ${C.d}Sistem spam, DDoS ve malformed payload saldırılarına dayanıklı.${C.r}`);
  } else {
    console.log(`  ${C.b}${C.Y}SONUÇ: ${passed}/${total} passed, ${C.R}${failed} failed${C.r}`);
    console.log(`\n${C.R}${C.b}  Başarısız:${C.r}`);
    for (const r of results.filter(r => !r.p)) {
      console.log(`  ${C.R}✗${C.r} ${r.n}`);
      if (r.detail) console.log(`    ${C.d}${r.detail.split('\n')[0].trim()}${C.r}`);
    }
  }

  console.log(`\n${C.d}  Toplam süre: ${(results.reduce((a, r) => a + r.ms, 0) / 1000).toFixed(1)}s${C.r}\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
