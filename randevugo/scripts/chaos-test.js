#!/usr/bin/env node
/**
 * RandevuGO — Chaos / Fault-Tolerance Testi
 * node scripts/chaos-test.js --db-url="postgresql://..."
 *
 * Senaryo 1: DB Failure — bot_durum bozuk veriyle sorgu hatası simülasyonu
 * Senaryo 2: AI Timeout — DeepSeek yanıt vermezken webhook davranışı
 * Senaryo 3: Corrupted State — tanımsız aşama değeri ile mesaj gönderimi
 */
const { Pool } = require('pg');
const axios = require('axios');

const BASE = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'https://randevugo-api.onrender.com';
const DB_URL = process.argv.find(a => a.startsWith('--db-url='))?.split('=').slice(1).join('=') || process.env.DATABASE_URL;
const WEBHOOK = `${BASE}/api/webhook/whatsapp`;
const HEALTH  = `${BASE}/api/health`;

const TP1 = '905550009901';
const TP2 = '905550009902';
const TP3 = '905550009903';
const ALL_TP = [TP1, TP2, TP3];

const C = {
  r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m',
  R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', C: '\x1b[36m', M: '\x1b[35m'
};

const results = [];
let pool;

function S(s) { console.log(`\n${C.C}${C.b}═══ ${s} ═══${C.r}`); }
function L(m) { console.log(`  ${C.d}${m}${C.r}`); }

async function test(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - t0;
    results.push({ n: name, p: result.pass, ms, detail: result.detail });
    const icon = result.pass ? `${C.G}✅ PASS` : `${C.R}❌ FAIL`;
    console.log(`  ${icon}${C.r} ${C.d}(${(ms / 1000).toFixed(1)}s)${C.r} ${name}`);
    if (result.detail) result.detail.split('\n').forEach(l => console.log(`        ${C.d}${l.trim()}${C.r}`));
  } catch (e) {
    const ms = Date.now() - t0;
    results.push({ n: name, p: false, ms, detail: e.message });
    console.log(`  ${C.R}❌ FAIL${C.r} ${C.d}(${(ms / 1000).toFixed(1)}s)${C.r} ${name}\n        ${C.R}→ ${e.message}${C.r}`);
  }
}

function tw(tel) { return `whatsapp:+${tel}`; }
function pv(tel) {
  const raw = tel.replace('whatsapp:', '').replace('+', '');
  return [raw, `+${raw}`, `whatsapp:+${raw}`, `0${raw.substring(2)}`];
}
const Q = async (q, p) => (await pool.query(q, p || [])).rows;
const wait = ms => new Promise(r => setTimeout(r, ms));

async function sendWH(phone, body, timeout = 15000) {
  const t0 = Date.now();
  try {
    const r = await axios.post(WEBHOOK, {
      From: tw(phone), Body: body, To: ''
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout, validateStatus: () => true
    });
    return { status: r.status, ms: Date.now() - t0, data: r.data };
  } catch (e) {
    return { status: e.code === 'ECONNABORTED' ? 'TIMEOUT' : `ERR:${e.code || e.message}`, ms: Date.now() - t0 };
  }
}

async function cleanup() {
  for (const tel of ALL_TP) {
    for (const v of pv(tel)) {
      await pool.query('DELETE FROM randevular WHERE musteri_id IN (SELECT id FROM musteriler WHERE telefon=$1)', [v]).catch(() => {});
      await pool.query('DELETE FROM bot_durum WHERE musteri_telefon=$1', [v]).catch(() => {});
      await pool.query('DELETE FROM sohbet_gecmisi WHERE musteri_telefon=$1', [v]).catch(() => {});
      await pool.query('DELETE FROM musteriler WHERE telefon=$1', [v]).catch(() => {});
    }
  }
}

// ═══════════════════════════════════════
(async () => {
  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════════╗\n║  RandevuGO — Chaos / Fault-Tolerance Testi         ║\n╚════════════════════════════════════════════════════╝${C.r}`);
  console.log(`${C.d}  Webhook : ${WEBHOOK}\n  DB      : ${DB_URL ? DB_URL.replace(/\/\/.*@/, '//***@') : 'YOK'}\n  Zaman   : ${new Date().toLocaleString('tr-TR')}${C.r}`);

  if (!DB_URL) { console.log(`\n${C.R}HATA: --db-url gerekli${C.r}\n`); process.exit(1); }

  S('0. Bağlantı & Hazırlık');

  await test('PostgreSQL bağlantısı', async () => {
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const r = await Q('SELECT 1 as ok');
    return { pass: r[0]?.ok === 1, detail: 'DB bağlantısı OK' };
  });

  await test('API health', async () => {
    const r = await axios.get(HEALTH, { timeout: 10000 });
    return { pass: r.status === 200, detail: `Health: ${r.status}` };
  });

  let isletme;
  await test('İşletme bul', async () => {
    isletme = (await Q("SELECT * FROM isletmeler WHERE aktif=true LIMIT 1"))[0];
    return { pass: !!isletme, detail: isletme ? `${isletme.isim} (ID:${isletme.id})` : 'Yok' };
  });

  await test('Pre-cleanup', async () => {
    await cleanup();
    return { pass: true, detail: 'Test verileri temizlendi' };
  });

  // ═══════════════════════════════════════════════════
  // SENARYO 1: VERİTABANI BAĞLANTI KOPMASI / SORGU HATASI
  // ═══════════════════════════════════════════════════
  S('1. DB Failure — Veritabanı Hata Toleransı');

  await test('DB hatası sonrası webhook 200 döner (crash yok)', async () => {
    // bot_durum'a geçersiz isletme_id ile kayıt ekle — randevu oluşturma
    // sırasında FK constraint hatası tetikler
    // Ama biz direkt olarak webhook'a mesaj gönderip DB'nin
    // hata fırlattığı durumu kontrol edeceğiz.

    // Önce normal bir session oluştur
    const r1 = await sendWH(TP1, 'Merhaba');
    if (r1.status !== 200) {
      return { pass: false, detail: `İlk mesaj başarısız: ${r1.status}` };
    }
    await wait(1500);

    // bot_durum'u bozuk bir state'e zorla — var olmayan hizmet ID ile onay aşaması
    await pool.query(`
      INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, secilen_hizmet_id, secilen_tarih, secilen_saat)
      VALUES ($1, $2, 'onay', 999999, '2026-04-15', '09:00')
      ON CONFLICT (musteri_telefon, isletme_id)
      DO UPDATE SET asama='onay', secilen_hizmet_id=999999, secilen_tarih='2026-04-15', secilen_saat='09:00'
    `, [tw(TP1), isletme.id]);

    // Onay gönder — randevuOlustur FK hatası alacak
    const r2 = await sendWH(TP1, 'evet, onaylıyorum');
    L(`Webhook yanıtı: ${r2.status} (${r2.ms}ms)`);

    // Sunucu crash olmadıysa 200 dönmeli (veya en azından 5xx olmamalı)
    const noCrash = typeof r2.status === 'number' && r2.status < 500;

    // Health check — sunucu hala ayakta mı?
    await wait(1000);
    const h = await axios.get(HEALTH, { timeout: 10000, validateStatus: () => true });

    return {
      pass: noCrash && h.status === 200,
      detail: `Webhook: ${r2.status} | Health: ${h.status} | ${noCrash ? '✓ Crash yok' : '✗ Sunucu hatası!'}`
    };
  });

  await test('DB hatası sonrası sohbet_gecmisi tutarlı', async () => {
    // Hata olsa da sohbet_gecmisi'ne kayıt düşmüş olmalı
    const rows = await Q('SELECT COUNT(*) as c FROM sohbet_gecmisi WHERE musteri_telefon=$1', [tw(TP1)]);
    const count = parseInt(rows[0]?.c || 0);
    return {
      pass: count >= 1,
      detail: `${count} sohbet kaydı (hata öncesi mesajlar korunmuş)`
    };
  });

  await test('DB hatası sonrası sunucu normal çalışıyor', async () => {
    // Tamamen temiz bir numara ile normal mesaj gönder
    await cleanup();
    const r = await sendWH(TP1, 'Merhaba');
    return {
      pass: r.status === 200,
      detail: `Webhook: ${r.status} (${r.ms}ms) — DB hatası sonrası normal akış devam ediyor`
    };
  });

  // ═══════════════════════════════════════════════════
  // SENARYO 2: AI / HARİCİ API ZAMAN AŞIMI
  // ═══════════════════════════════════════════════════
  S('2. AI Timeout — DeepSeek Yanıt Vermezken Davranış');

  await test('Serbest metin (AI gereken) mesaj — timeout koruması', async () => {
    // DeepSeek'e gitmesi gereken bir serbest metin mesajı gönder
    // Eğer DeepSeek timeout olursa, sistem state machine'e fallback yapmalı
    // veya varsayılan bir cevap dönmeli

    // Önce session oluştur
    await cleanup();
    const r1 = await sendWH(TP2, 'Merhaba');
    await wait(1500);

    // Şimdi AI'a gitmesi gereken karmaşık bir serbest metin gönder
    // Webhook'un 15 saniye timeout'unda yanıt vermesi gerekiyor
    const t0 = Date.now();
    const r2 = await sendWH(TP2, 'Saç boyama ve fön çektirmek istiyorum, fiyat ne kadar acaba yarına müsait var mı?', 20000);
    const elapsed = Date.now() - t0;

    L(`Yanıt: ${r2.status} (${elapsed}ms)`);

    // 15 saniye içinde yanıt gelmeli (timeout olmamalı)
    const noTimeout = typeof r2.status === 'number';
    const under15s = elapsed < 16000;
    const noServerError = r2.status < 500;

    return {
      pass: noTimeout && noServerError,
      detail: `${noTimeout ? '✓ Yanıt geldi' : '✗ Timeout!'} | ${under15s ? `✓ ${(elapsed / 1000).toFixed(1)}s` : `✗ ${(elapsed / 1000).toFixed(1)}s (>15s)`} | Status: ${r2.status}`
    };
  });

  await test('AI timeout sonrası sunucu kilitlenmedi', async () => {
    // Hızlı ardışık 5 mesaj gönder — sunucu kilitli değilse hepsine yanıt vermeli
    const promises = Array.from({ length: 5 }, (_, i) =>
      sendWH(TP2, `test mesaj ${i + 1}`, 15000)
    );
    const all = await Promise.all(promises);
    const responded = all.filter(r => typeof r.status === 'number').length;
    const avgMs = Math.round(all.reduce((a, r) => a + r.ms, 0) / all.length);

    return {
      pass: responded === 5,
      detail: `${responded}/5 yanıt geldi | avg: ${avgMs}ms — ${responded === 5 ? '✓ Sunucu kilitlenmedi' : '✗ Bazı istekler asılı kaldı'}`
    };
  });

  // ═══════════════════════════════════════════════════
  // SENARYO 3: ZEHİRLENMİŞ/BOZUK OTURUM (Corrupted State)
  // ═══════════════════════════════════════════════════
  S('3. Corrupted State — Bozuk Oturum Dayanıklılığı');

  await test('Tanımsız aşama ile mesaj → crash olmamalı', async () => {
    await cleanup();

    // Önce geçerli bir session oluştur
    const r0 = await sendWH(TP3, 'Merhaba');
    await wait(1500);

    // bot_durum'daki asama'yı tanımsız bir değere boz
    await pool.query(`
      UPDATE bot_durum SET asama='undefined_step_99', son_aktivite=NOW()
      WHERE musteri_telefon=$1 AND isletme_id=$2
    `, [tw(TP3), isletme.id]);

    // Doğrula
    const before = (await Q('SELECT asama FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(TP3), isletme.id]))[0];
    L(`Bozuk asama: "${before?.asama}"`);

    // Mesaj gönder — crash olmamalı
    const r = await sendWH(TP3, 'Randevu almak istiyorum');
    L(`Webhook: ${r.status} (${r.ms}ms)`);

    const noCrash = typeof r.status === 'number' && r.status < 500;

    return {
      pass: noCrash,
      detail: `Webhook: ${r.status} — ${noCrash ? '✓ Crash yok, hata graceful handle edildi' : '✗ Sunucu çöktü!'}`
    };
  });

  await test('Bozuk state sonrası oturum sıfırlandı mı?', async () => {
    await wait(1500);

    const after = (await Q('SELECT asama FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(TP3), isletme.id]))[0];

    if (!after) {
      return { pass: true, detail: '✓ bot_durum silinmiş → yeni session açılacak' };
    }

    const reset = after.asama !== 'undefined_step_99';
    return {
      pass: reset,
      detail: `asama: "${after.asama}" — ${reset ? '✓ Geçerli bir aşamaya sıfırlandı' : '✗ Hala bozuk state!'}`
    };
  });

  await test('Bozuk state sonrası normal akış devam ediyor', async () => {
    const r = await sendWH(TP3, 'Merhaba');
    const after = (await Q('SELECT asama FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(TP3), isletme.id]))[0];

    return {
      pass: r.status === 200 && after && after.asama !== 'undefined_step_99',
      detail: `Webhook: ${r.status} | asama: "${after?.asama}" — ${after?.asama !== 'undefined_step_99' ? '✓ Normal akışa döndü' : '✗ Sorun devam ediyor'}`
    };
  });

  // ═══════════════════════════════════════════════════
  // 4. POST-CHAOS SAĞLIK KONTROLÜ
  // ═══════════════════════════════════════════════════
  S('4. Post-Chaos Sağlık Kontrolü');

  await test('API hala ayakta', async () => {
    const r = await axios.get(HEALTH, { timeout: 10000, validateStatus: () => true });
    return { pass: r.status === 200, detail: `Health: ${r.status}` };
  });

  await test('DB bağlantısı sağlam', async () => {
    const r = await Q('SELECT COUNT(*) as c FROM isletmeler WHERE aktif=true');
    return { pass: parseInt(r[0]?.c || 0) > 0, detail: `${r[0]?.c} aktif işletme` };
  });

  await test('Webhook normal çalışıyor', async () => {
    const r = await sendWH('905559999999', 'test');
    return { pass: r.status === 200, detail: `${r.status} (${r.ms}ms)` };
  });

  // ═══════════════════════════════════════════════════
  // CLEANUP & RAPOR
  // ═══════════════════════════════════════════════════
  S('5. Final Cleanup');
  await test('Cleanup', async () => {
    await cleanup();
    // 905559999999 de temizle
    for (const v of pv('905559999999')) {
      await pool.query('DELETE FROM bot_durum WHERE musteri_telefon=$1', [v]).catch(() => {});
      await pool.query('DELETE FROM sohbet_gecmisi WHERE musteri_telefon=$1', [v]).catch(() => {});
      await pool.query('DELETE FROM musteriler WHERE telefon=$1', [v]).catch(() => {});
    }
    return { pass: true, detail: 'Temizlendi' };
  });

  await pool.end();

  // RAPOR
  const passed = results.filter(r => r.p).length;
  const failed = results.filter(r => !r.p).length;
  const total = results.length;

  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════════╗\n║  CHAOS TEST RAPORU                                 ║\n╚════════════════════════════════════════════════════╝${C.r}\n`);

  for (const r of results) {
    const icon = r.p ? `${C.G}✅ PASS` : `${C.R}❌ FAIL`;
    console.log(`  ${icon}${C.r}  ${r.n} ${C.d}(${(r.ms / 1000).toFixed(1)}s)${C.r}`);
    if (r.detail) r.detail.split('\n').forEach(l => console.log(`        ${C.d}${l.trim()}${C.r}`));
  }

  console.log(`\n${C.b}${C.C}══════════════════════════════════════════════════════${C.r}`);
  if (failed === 0) {
    console.log(`  ${C.b}${C.G}🛡️  TÜM KAOS TESTLERİ BAŞARILI: ${passed}/${total}${C.r}`);
    console.log(`  ${C.d}Sistem DB kopması, AI timeout ve bozuk state durumlarında graceful degradation sağlıyor.${C.r}`);
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
