// OTP günlük sınırı (rapor doğrulaması, 2026-10-26): sayaç "biraz bekleyin" kontrolünden önce artıyordu; müşteri bekleme
// süresinde "tekrar gönder"e 5 kez basınca o gün hiç kod alamıyordu. Gönderilemeyen kod da hakkı yiyordu.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { hazirla, SRC } = require('./yardimci');

const sahte = (ad, exports) => { const y = require.resolve(path.join(SRC, ad)); require.cache[y] = { id: y, filename: y, loaded: true, exports }; };

async function ortam() {
  for (const k of Object.keys(require.cache)) if (k.startsWith(SRC) && !k.endsWith(path.join('config', 'db.js'))) delete require.cache[k];
  await hazirla(`CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, slug TEXT, booking_acik BOOLEAN DEFAULT true, imza_gizle BOOLEAN DEFAULT false, aktif BOOLEAN DEFAULT true);
    INSERT INTO isletmeler (isim, slug) VALUES ('Berber', 'berber');`);
  const wa = { bagli: true, giden: [] };
  sahte('services/whatsappWeb', { getDurum: () => ({ durum: wa.bagli ? 'bagli' : 'kapali' }), mesajGonder: async (id, jid, m) => { wa.giden.push(m); } });
  sahte('services/merkezOtpBot', { aktifMi: () => false });
  sahte('middleware/ddosGuard', { ddosSayacArtir() {}, _olayLogla: async () => {} });
  const booking = require(path.join(SRC, 'controllers', 'bookingController'));
  const iste = async () => {
    let durum = 200, govde;
    await booking.otpGonder({ params: { slug: 'berber' }, body: { telefon: '05551112233' } },
      { status(k) { durum = k; return this; }, json(g) { govde = g; } });
    return { durum, govde };
  };
  return { wa, iste };
}

test('bekleme süresinde tekrar basmak günlük hakkı tüketmez', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T09:00:00Z') });
  const { iste } = await ortam();
  assert.equal((await iste()).durum, 200);
  for (let i = 0; i < 6; i++) assert.ok((await iste()).govde.cooldown, 'bekleme cevabı');
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(61 * 1000);
    assert.equal((await iste()).durum, 200, `${i + 2}. kod gider`);
  }
  t.mock.timers.tick(61 * 1000);
  assert.equal((await iste()).durum, 429, '6. kod günlük sınıra takılır');
});

test('gönderilemeyen kod günlük hakkı tüketmez', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T09:00:00Z') });
  const { wa, iste } = await ortam();
  wa.bagli = false;
  for (let i = 0; i < 6; i++) assert.equal((await iste()).durum, 503);
  wa.bagli = true;
  assert.equal((await iste()).durum, 200);
  assert.equal(wa.giden.length, 1);
});

test('gün sınırı İstanbul gününe göre: gece 00:30 (TR) yeni gün sayılır', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-26T15:00:00Z') });
  const { iste } = await ortam();
  for (let i = 0; i < 5; i++) { assert.equal((await iste()).durum, 200); t.mock.timers.tick(61 * 1000); }
  assert.equal((await iste()).durum, 429);
  t.mock.timers.setTime(new Date('2026-10-26T21:30:00Z').getTime()); // 27 Ekim 00:30 İstanbul, UTC'de hâlâ 26'sı
  assert.equal((await iste()).durum, 200);
});
