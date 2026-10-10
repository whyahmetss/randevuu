const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const { hazirla, SRC } = require('./yardimci');

const ortam = hazirla('');  // tek veritabanı: servisler ilk yüklendiği bağlantıyı tutar

test('ödeme linki: imzalı, süreli, kurcalanırsa geçersiz', async () => {
  await ortam;
  const o = require(SRC + '/services/odemeOtomasyon');
  const a = o.linkAnahtari(42, 'proplus');
  assert.deepStrictEqual([o.anahtarCoz(a).i, o.anahtarCoz(a).p], [42, 'proplus']);
  const [g, im] = a.split('.');
  const sahte = Buffer.from(JSON.stringify({ i: 1, p: null, e: Date.now() + 1e9 })).toString('base64url');
  assert.strictEqual(o.anahtarCoz(`${sahte}.${im}`), null, 'başka işletme için imza tutmaz');
  assert.strictEqual(o.anahtarCoz(g), null);
  assert.match(o.odemeLinki(42), /\/api\/odeme\/ode\/[\w-]+\.[\w-]+$/);
});

test('bitiş hatırlatması: 3 gün kala link gider, aynı aşama tekrar gitmez, demo/şube/telegram atlanır', async () => {
  const { db } = await ortam;
  await db.exec(`
    CREATE TABLE isletmeler (id SERIAL PRIMARY KEY, isim TEXT, telefon TEXT, paket TEXT, aktif BOOLEAN DEFAULT true, demo BOOLEAN DEFAULT false,
      grup_id INT, deneme_bitis_tarihi TIMESTAMP, paket_bitis_tarihi TIMESTAMP);
    INSERT INTO isletmeler (isim, telefon, paket, deneme_bitis_tarihi, demo, grup_id) VALUES
      ('Kuaför Ayşe', '905321112233', 'profesyonel', NOW() + INTERVAL '2 days 20 hours', false, NULL),
      ('Demo', '905321112234', 'profesyonel', NOW() + INTERVAL '2 days 20 hours', true, NULL),
      ('TG', 'tg_5', 'profesyonel', NOW() + INTERVAL '2 days 20 hours', false, NULL),
      ('Merkez', '905321112235', 'proplus', NOW() + INTERVAL '30 days', false, 9),
      ('Şube', '905321112236', 'proplus', NOW() + INTERVAL '2 days 20 hours', false, 9);`);
  await db.exec(fs.readFileSync(SRC + '/migrations/027_odeme_hatirlatma.sql', 'utf8'));
  await db.exec(fs.readFileSync(SRC + '/migrations/029_davet_oncu.sql', 'utf8'));
  const o = require(SRC + '/services/odemeOtomasyon');
  const giden = [];
  const gonder = async (tel, m) => { giden.push([tel, m]); return { success: true }; };
  assert.strictEqual(await o.hatirlatmalariGonder({ gonder }), 1);
  assert.strictEqual(giden[0][0], '905321112233');
  assert.match(giden[0][1], /ücretsiz denemeniz/);
  assert.match(giden[0][1], /499₺/);
  assert.match(giden[0][1], /\/api\/odeme\/ode\//);
  assert.strictEqual(await o.hatirlatmalariGonder({ gonder }), 0);

  // Bitti (0. gün) → ayrı aşama, yine bir kez
  await db.query("UPDATE isletmeler SET deneme_bitis_tarihi = NOW() - INTERVAL '2 hours' WHERE id = 1");
  assert.strictEqual(await o.hatirlatmalariGonder({ gonder }), 1);
  assert.match(giden[1][1], /bugün bitti/);
});
