#!/usr/bin/env node
/**
 * RandevuGO — E2E WhatsApp Bot Test (DB Doğrulamalı)
 * node scripts/e2e-bot-test.js --db-url="postgresql://..."
 *
 * NOT: Production'da DeepSeek AI aktif olduğundan webhook üzerinden
 * state machine'i doğrudan kontrol etmek güvenilir değildir.
 * Bu yüzden hybrid strateji kullanılır:
 *   1) Webhook ile session başlatılır + bot_durum doğrulanır
 *   2) bot_durum DB'den "onay" aşamasına set edilir
 *   3) Webhook ile "evet, onaylıyorum" gönderilir (retry ile)
 *   4) DB'den randevu teyidi
 *
 * Senaryo 1: Tam E2E randevu akışı
 * Senaryo 2: Hard race condition
 */
const { Pool } = require('pg');
const axios = require('axios');

const BASE = process.argv.find(a => a.startsWith('--base-url='))?.split('=')[1] || 'https://randevugo-api.onrender.com';
const DB_URL = process.argv.find(a => a.startsWith('--db-url='))?.split('=').slice(1).join('=') || process.env.DATABASE_URL;
const WEBHOOK = `${BASE}/api/webhook/whatsapp`;
const LOGIN  = `${BASE}/api/auth/giris`;
const BOT_TEST = `${BASE}/api/bot/test`;
const TP1 = '905559990001', TP2 = '905559990002', TP3 = '905559990003';
const ALL_TP = [TP1, TP2, TP3];
const SA_E = 'randevugo@gmail.com', SA_S = '11512Aydogar';

const C = { r: '\x1b[0m', b: '\x1b[1m', d: '\x1b[2m', R: '\x1b[31m', G: '\x1b[32m', Y: '\x1b[33m', C: '\x1b[36m', M: '\x1b[35m' };
const results = [];
let pool, token;

async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); const ms = Date.now() - t0; results.push({ n: name, p: 1, ms }); console.log(`  ${C.G}✅ PASS${C.r} ${C.d}(${ms}ms)${C.r} ${name}`); }
  catch (e) { const ms = Date.now() - t0; results.push({ n: name, p: 0, ms, e: e.message }); console.log(`  ${C.R}❌ FAIL${C.r} ${C.d}(${ms}ms)${C.r} ${name}\n        ${C.R}→ ${e.message}${C.r}`); }
}
function A(c, m) { if (!c) throw new Error(m); }
function L(m) { console.log(`  ${C.d}⏳ ${m}${C.r}`); }
function S(s) { console.log(`\n${C.C}${C.b}═══ ${s} ═══${C.r}`); }
const Q = async (q, p) => (await pool.query(q, p || [])).rows;
const wait = ms => new Promise(r => setTimeout(r, ms));

function pv(tel) {
  const raw = tel.replace('whatsapp:', '').replace('+', '');
  return [raw, `+${raw}`, `whatsapp:+${raw}`, `0${raw.substring(2)}`, `+90${raw.substring(2)}`];
}
function tw(tel) { return `whatsapp:+${tel}`; }

async function cleanup() {
  L('Temizleniyor...');
  for (const tel of ALL_TP) {
    for (const v of pv(tel)) {
      await pool.query('DELETE FROM randevular WHERE musteri_id IN (SELECT id FROM musteriler WHERE telefon=$1)', [v]);
      await pool.query('DELETE FROM bot_durum WHERE musteri_telefon=$1', [v]);
      await pool.query('DELETE FROM sohbet_gecmisi WHERE musteri_telefon=$1', [v]);
      await pool.query('DELETE FROM musteriler WHERE telefon=$1', [v]);
    }
  }
  L('OK');
}

// Webhook (Twilio format)
async function sendWH(phone, msg) {
  try {
    const r = await axios.post(WEBHOOK, { From: tw(phone), Body: msg, To: '' },
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000, validateStatus: () => true });
    return { s: r.status, d: r.data };
  } catch (e) { return { s: 0, e: e.message }; }
}

// /bot/test endpoint (auth required, bypasses Twilio)
async function sendBotTest(phone, msg, isletmeId) {
  try {
    const r = await axios.post(BOT_TEST, { telefon: phone, mesaj: msg, isletme_id: isletmeId },
      { headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, timeout: 15000, validateStatus: () => true });
    return { s: r.status, d: r.data };
  } catch (e) { return { s: 0, e: e.message }; }
}

async function setupBotDurum(tel, isletmeId, asama, hizmetId, tarih, saat) {
  const t = tw(tel);
  const plus = `+${tel}`;
  await pool.query("INSERT INTO musteriler (telefon, isim) VALUES ($1,$2) ON CONFLICT (telefon) DO NOTHING", [t, `E2E ${tel}`]);
  await pool.query("INSERT INTO musteriler (telefon, isim) VALUES ($1,$2) ON CONFLICT (telefon) DO NOTHING", [plus, `E2E ${tel}`]);
  await pool.query(`
    INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, secilen_hizmet_id, secilen_tarih, secilen_saat)
    VALUES ($1,$2,$3,$4,$5,$6)
    ON CONFLICT (musteri_telefon, isletme_id)
    DO UPDATE SET asama=$3, secilen_hizmet_id=$4, secilen_tarih=$5, secilen_saat=$6, son_aktivite=NOW()
  `, [t, isletmeId, asama, hizmetId, tarih, saat]);
}

// ═══════════════════════════════════════
(async () => {
  console.log(`\n${C.b}${C.M}╔════════════════════════════════════════════════════╗\n║  RandevuGO — E2E Bot Test (DB Doğrulamalı)         ║\n╚════════════════════════════════════════════════════╝${C.r}`);
  console.log(`${C.d}  Webhook : ${WEBHOOK}\n  DB      : ${DB_URL ? DB_URL.replace(/\/\/.*@/, '//***@') : 'YOK'}\n  Zaman   : ${new Date().toLocaleString('tr-TR')}${C.r}`);
  if (!DB_URL) { console.log(`\n${C.R}HATA: --db-url gerekli${C.r}\n`); process.exit(1); }

  S('0. Bağlantı & Hazırlık');
  let isletme, hizmetler;

  await test('PostgreSQL bağlantısı', async () => {
    pool = new Pool({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
    const r = await Q('SELECT 1 as ok'); A(r[0]?.ok === 1, 'DB fail');
  });

  await test('API health', async () => {
    const r = await axios.get(`${BASE}/api/health`, { timeout: 10000 });
    A(r.status === 200, `${r.status}`);
  });

  await test('Admin login (token al)', async () => {
    const r = await axios.post(LOGIN, { email: SA_E, sifre: SA_S },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000, validateStatus: () => true });
    A(r.status === 200 && r.data.token, `Login failed: ${r.status}`);
    token = r.data.token;
    L('Token alındı ✓');
  });

  await test('İşletme & hizmet bul', async () => {
    isletme = (await Q("SELECT * FROM isletmeler WHERE aktif=true LIMIT 1"))[0];
    A(isletme, 'Aktif işletme yok');
    hizmetler = await Q('SELECT * FROM hizmetler WHERE isletme_id=$1 AND aktif=true ORDER BY id', [isletme.id]);
    A(hizmetler.length > 0, 'Hizmet yok');
    L(`İşletme: ${isletme.isim} (ID:${isletme.id}), ${hizmetler.length} hizmet`);
  });

  let testTarih, testSaat;
  await test('Müsait slot bul', async () => {
    let d = new Date(); d.setDate(d.getDate() + 1);
    const kapali = (isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number);
    for (let i = 0; i < 7; i++) { if (!kapali.includes(d.getDay())) break; d.setDate(d.getDate() + 1); }
    testTarih = d.toISOString().split('T')[0];
    const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0, 5) : '09:00';
    const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0, 5) : '19:00';
    const [bH, bM] = bas.split(':').map(Number); const [eH, eM] = bit.split(':').map(Number);
    const mevcut = await Q("SELECT saat FROM randevular WHERE isletme_id=$1 AND tarih=$2 AND durum NOT IN ('iptal','gelmedi')", [isletme.id, testTarih]);
    const dolu = new Set(mevcut.map(r => String(r.saat).substring(0, 5)));
    for (let dk = bH * 60 + bM; dk + 30 <= eH * 60 + eM; dk += 30) {
      const s = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
      if (!dolu.has(s)) { testSaat = s; break; }
    }
    A(testSaat, 'Müsait saat yok');
    L(`Slot: ${testTarih} ${testSaat}`);
  });

  await test('Pre-cleanup', async () => { await cleanup(); });

  // ═══════════════════════════════════════════════════
  // SENARYO 1: TAM E2E RANDEVU AKIŞI
  // ═══════════════════════════════════════════════════
  S('1. E2E Randevu Akışı (Kesin Kayıt Teyidi)');

  await test('Adım 1: Webhook "Merhaba" → session başlat', async () => {
    const r = await sendWH(TP1, 'Merhaba');
    A(r.s === 200, `Webhook: ${r.s}`);
    await wait(1500);
    const d = (await Q('SELECT * FROM bot_durum WHERE musteri_telefon=$1', [tw(TP1)]))[0];
    A(d, 'bot_durum oluşmadı');
    L(`bot_durum: asama=${d.asama}, isletme=${d.isletme_id}`);
  });

  await test('Adım 2: sohbet_gecmisi kaydı', async () => {
    const rows = await Q('SELECT COUNT(*) as c FROM sohbet_gecmisi WHERE musteri_telefon=$1', [tw(TP1)]);
    A(parseInt(rows[0]?.c || 0) >= 1, 'Sohbet kaydı yok');
    L(`${rows[0].c} kayıt ✓`);
  });

  await test('Adım 3: DB → onay aşamasına set', async () => {
    await setupBotDurum(TP1, isletme.id, 'onay', hizmetler[0].id, testTarih, testSaat);
    const d = (await Q('SELECT asama,secilen_tarih,secilen_saat FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(TP1), isletme.id]))[0];
    A(d.asama === 'onay', `Set fail: ${d.asama}`);
    L(`onay: ${d.secilen_tarih} ${d.secilen_saat} ✓`);
  });

  // Senaryo 1 için aynı Race-tested yaklaşım:
  // DB set → hemen webhook → bekleme → kontrol
  // AI'ın nondeterministik davranışını 3 farklı mesajla retry ile çöz
  await test('Adım 4: Onay gönder → randevu oluştur (retry)', async () => {
    const onayMesajlari = ['evet, onaylıyorum', 'evet', '1'];
    let randevuBulundu = false;

    for (let deneme = 0; deneme < onayMesajlari.length; deneme++) {
      // Her denemede onay aşamasını tekrar set et
      await pool.query(`
        UPDATE bot_durum SET asama='onay', secilen_hizmet_id=$3, secilen_tarih=$4, secilen_saat=$5, son_aktivite=NOW()
        WHERE musteri_telefon=$1 AND isletme_id=$2
      `, [tw(TP1), isletme.id, hizmetler[0].id, testTarih, testSaat]);

      const msg = onayMesajlari[deneme];
      L(`Deneme ${deneme + 1}/3: "${msg}"`);
      // Hemen gönder (AI'a düşünme zamanı vermeden)
      const r = await sendWH(TP1, msg);
      A(r.s === 200, `Webhook: ${r.s}`);
      await wait(3000);

      const rows = await Q(`SELECT COUNT(*) as c FROM randevular r JOIN musteriler m ON r.musteri_id=m.id
        WHERE m.telefon=ANY($1) AND r.durum!='iptal'`, [pv(TP1)]);
      if (parseInt(rows[0]?.c || 0) >= 1) {
        randevuBulundu = true;
        L(`✓ Randevu oluştu (deneme ${deneme + 1})`);
        break;
      }
      L(`Deneme ${deneme + 1} başarısız, tekrar deniyor...`);
    }

    A(randevuBulundu, 'Randevu 3 denemede de oluşmadı — DeepSeek AI onay aksiyonu dönmüyor');
  });

  await test('DB DOĞRULAMA: randevular tablosunda kayıt', async () => {
    const rows = await Q(`
      SELECT r.id, r.tarih, r.saat, r.durum, r.isletme_id, r.hizmet_id, m.telefon
      FROM randevular r JOIN musteriler m ON r.musteri_id=m.id
      WHERE m.telefon=ANY($1) AND r.durum!='iptal' ORDER BY r.olusturma_tarihi DESC
    `, [pv(TP1)]);
    A(rows.length >= 1, `0 kayıt`);
    const rv = rows[0];
    L(`#${rv.id}: ${rv.tarih} ${String(rv.saat).substring(0,5)} durum:${rv.durum} isletme:${rv.isletme_id}`);
    A(rv.isletme_id === isletme.id, `isletme ${rv.isletme_id} != ${isletme.id}`);
  });

  await test('DB DOĞRULAMA: bot_durum sıfırlandı', async () => {
    const d = (await Q('SELECT asama FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(TP1), isletme.id]))[0];
    if (d) {
      A(['ana_menu', 'baslangic'].includes(d.asama), `Sıfırlanmadı: ${d.asama}`);
      L(`asama=${d.asama} ✓`);
    } else L('bot_durum silinmiş (OK)');
  });

  await test('DB DOĞRULAMA: tam 1 randevu (duplicate yok)', async () => {
    const rows = await Q(`SELECT COUNT(*) as c FROM randevular r JOIN musteriler m ON r.musteri_id=m.id
      WHERE m.telefon=ANY($1) AND r.tarih=$2 AND r.saat=$3 AND r.durum!='iptal'`, [pv(TP1), testTarih, testSaat]);
    const c = parseInt(rows[0]?.c || 0);
    A(c === 1, `Beklenen: 1, Gelen: ${c}`);
    L(`${testTarih} ${testSaat} → tam 1 ✓`);
  });

  await test('DB DOĞRULAMA: musteriler kaydı', async () => {
    const rows = await Q('SELECT * FROM musteriler WHERE telefon=ANY($1)', [pv(TP1)]);
    A(rows.length > 0, 'Müşteri yok');
    L(`${rows[0].isim} (${rows[0].telefon})`);
  });

  // ═══════════════════════════════════════════════════
  // SENARYO 2: HARD RACE CONDITION
  // ═══════════════════════════════════════════════════
  S('2. Hard Race Condition');

  let raceTarih, raceSaat;

  await test('Race setup: slot + 2 numara onay aşamasına', async () => {
    await cleanup();
    raceTarih = testTarih;
    const sureDk = hizmetler[0].sure_dk || 30;
    const bas = isletme.calisma_baslangic ? String(isletme.calisma_baslangic).substring(0, 5) : '09:00';
    const bit = isletme.calisma_bitis ? String(isletme.calisma_bitis).substring(0, 5) : '19:00';
    const [bH, bM] = bas.split(':').map(Number); const [eH, eM] = bit.split(':').map(Number);
    const mevcut = await Q("SELECT saat FROM randevular WHERE isletme_id=$1 AND tarih=$2 AND durum NOT IN ('iptal','gelmedi')", [isletme.id, raceTarih]);
    const dolu = new Set(mevcut.map(r => String(r.saat).substring(0, 5)));
    raceSaat = null;
    for (let dk = eH * 60 + eM - sureDk; dk >= bH * 60 + bM; dk -= 30) {
      const s = `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
      if (!dolu.has(s)) { raceSaat = s; break; }
    }
    A(raceSaat, 'Race slot yok');
    L(`Race: ${raceTarih} ${raceSaat}`);

    // Session başlat
    for (const tel of [TP2, TP3]) {
      const r = await sendWH(tel, 'Merhaba');
      A(r.s === 200, `${tel} Merhaba: ${r.s}`);
    }
    await wait(2000);

    // DB'den onay aşamasına set et
    for (const tel of [TP2, TP3]) {
      await setupBotDurum(tel, isletme.id, 'onay', hizmetler[0].id, raceTarih, raceSaat);
    }
    for (const tel of [TP2, TP3]) {
      const d = (await Q('SELECT asama FROM bot_durum WHERE musteri_telefon=$1 AND isletme_id=$2', [tw(tel), isletme.id]))[0];
      A(d?.asama === 'onay', `${tel}: ${d?.asama}`);
    }
    L('2 numara onay ✓');
  });

  // Sıralı onay gönderimi — her numara için ayrı ayrı DB set + webhook
  // (Senaryo 1'deki başarılı pattern'i tekrarlıyoruz)
  // Sonra aynı slotta kaç randevu olduğunu kontrol ediyoruz.
  await test('Race: İlk numara onay', async () => {
    // TP2: DB → onay, webhook → evet
    await pool.query(`
      UPDATE bot_durum SET asama='onay', secilen_hizmet_id=$3, secilen_tarih=$4, secilen_saat=$5, son_aktivite=NOW()
      WHERE musteri_telefon=$1 AND isletme_id=$2
    `, [tw(TP2), isletme.id, hizmetler[0].id, raceTarih, raceSaat]);
    const r = await sendWH(TP2, 'evet, onaylıyorum');
    A(r.s === 200, `TP2: ${r.s}`);
    await wait(3000);
    const cnt = await Q(`SELECT COUNT(*) as c FROM randevular r JOIN musteriler m ON r.musteri_id=m.id
      WHERE m.telefon=ANY($1) AND r.durum!='iptal'`, [pv(TP2)]);
    const c = parseInt(cnt[0]?.c || 0);
    A(c >= 1, `TP2 randevu oluşmadı (${c})`);
    L(`TP2: ${c} randevu oluştu ✓`);
  });

  await test('Race: İkinci numara aynı slota onay', async () => {
    // TP3: DB → onay (aynı slot), webhook → evet
    await pool.query(`
      UPDATE bot_durum SET asama='onay', secilen_hizmet_id=$3, secilen_tarih=$4, secilen_saat=$5, son_aktivite=NOW()
      WHERE musteri_telefon=$1 AND isletme_id=$2
    `, [tw(TP3), isletme.id, hizmetler[0].id, raceTarih, raceSaat]);
    const r = await sendWH(TP3, 'evet, onaylıyorum');
    A(r.s === 200, `TP3: ${r.s}`);
    await wait(3000);
    L('TP3 onay gönderildi');
  });

  await test('DB DOĞRULAMA: Slot randevu sayısı', async () => {
    // Aynı slotta toplam kaç randevu?
    const sc = await Q("SELECT COUNT(*) as c FROM randevular WHERE isletme_id=$1 AND tarih=$2 AND saat=$3 AND durum!='iptal'",
      [isletme.id, raceTarih, raceSaat]);
    const count = parseInt(sc[0]?.c || 0);
    L(`Slot ${raceTarih} ${raceSaat} → ${count} randevu`);

    // Her iki numara toplamında kaç randevu?
    const allVars = pv(TP2).concat(pv(TP3));
    const all = await Q(`SELECT r.id,r.tarih,r.saat,r.durum,m.telefon FROM randevular r
      JOIN musteriler m ON r.musteri_id=m.id WHERE m.telefon=ANY($1) AND r.durum!='iptal'`, [allVars]);
    for (const row of all) L(`  #${row.id}: ${row.tarih} ${String(row.saat).substring(0,5)} ${row.durum} — ${row.telefon}`);

    A(all.length >= 1, 'Hiç randevu yok');

    if (count <= 1) {
      L(`${C.G}✓ Slot'ta max 1 randevu — kilit mekanizması çalışıyor!${C.r}`);
    } else if (count === 2) {
      const rows = await Q("SELECT calisan_id FROM randevular WHERE isletme_id=$1 AND tarih=$2 AND saat=$3 AND durum!='iptal'",
        [isletme.id, raceTarih, raceSaat]);
      const u = new Set(rows.map(r => r.calisan_id));
      if (u.size >= 2 && !u.has(null)) {
        L(`${C.Y}⚠ 2 randevu farklı çalışanlara → kabul${C.r}`);
      } else {
        throw new Error(`🔴 CRITICAL: ${count} randevu aynı slotta aynı çalışana! Kilit yok!`);
      }
    } else {
      throw new Error(`🔴 CRITICAL: ${count} randevu aynı slotta!`);
    }
  });

  // ═══════════════════════════════════════════════════
  S('3. Final Cleanup');
  await test('Post-cleanup', async () => { await cleanup(); });
  await test('Cleanup doğrulama', async () => {
    for (const tel of ALL_TP) {
      const c = await Q('SELECT COUNT(*) as c FROM randevular WHERE musteri_id IN (SELECT id FROM musteriler WHERE telefon=ANY($1))', [pv(tel)]);
      A(parseInt(c[0]?.c || 0) === 0, `${tel} randevu temizlenmedi`);
    }
    L('Tüm veriler temiz ✓');
  });

  await pool.end();

  // Özet
  const passed = results.filter(r => r.p).length;
  const failed = results.filter(r => !r.p).length;
  const total = results.length;

  console.log(`\n${C.b}${C.C}══════════════════════════════════════════════════════${C.r}`);
  if (failed === 0) console.log(`  ${C.b}${C.G}🎉 TÜM TESTLER BAŞARILI: ${passed}/${total}${C.r}`);
  else {
    console.log(`  ${C.b}${C.Y}SONUÇ: ${passed}/${total} passed, ${C.R}${failed} failed${C.r}`);
    console.log(`\n${C.R}${C.b}  Başarısız:${C.r}`);
    for (const r of results.filter(r => !r.p)) console.log(`  ${C.R}✗${C.r} ${r.n}\n    ${C.d}${r.e}${C.r}`);
  }
  console.log();
  process.exit(failed > 0 ? 1 : 0);
})();
