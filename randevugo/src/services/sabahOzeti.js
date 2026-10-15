// Sabah özeti (kullanıcı kararı 2026-10-16, tek kişi düzeni): her sabah 08:45'te Telegram'a tek mesaj. Panelde
// 10 sayfa gezmeden günün işi belli olur: son 24 saatte ne oldu, bugün kimi aramalı, nerede sorun var.
// Her bölüm ayrı sorgu; biri hata verirse (tablo yoksa) o satır atlanır, özet yine gider.
const pool = require('../config/db');
const devir = require('./devir');

const OTOMATIK = ['bot', 'online', 'web'];
const istanbul = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Istanbul', hour: 'numeric', minute: 'numeric', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return { tarih: `${p.year}-${p.month}-${p.day}`, saat: Number(p.hour) % 24, dakika: Number(p.minute) };
};
const sayi = async (sql, params = []) => { try { return (await pool.query(sql, params)).rows[0] || {}; } catch (e) { return null; } };
const satirlar = async (sql, params = []) => { try { return (await pool.query(sql, params)).rows; } catch (e) { return null; } };
const tl = (n) => `${Math.round(Number(n) || 0).toLocaleString('tr-TR')}₺`;

async function veriTopla() {
  const v = {};
  v.satis = await sayi(`
    SELECT COUNT(*) FILTER (WHERE olusturma_tarihi >= NOW() - INTERVAL '24 hours' AND COALESCE(gonderilen_mesaj, '') <> 'Müşteri kendisi yazdı')::int AS giden,
      COUNT(*) FILTER (WHERE son_mesaj_tarihi >= NOW() - INTERVAL '24 hours')::int AS cevap,
      COUNT(*) FILTER (WHERE son_mesaj_tarihi >= NOW() - INTERVAL '24 hours' AND durum IN ('olumlu', 'sicak'))::int AS olumlu,
      COUNT(*) FILTER (WHERE son_mesaj_tarihi >= NOW() - INTERVAL '24 hours' AND durum = 'olumsuz')::int AS ret
    FROM satis_konusmalar`);
  v.kayit = await satirlar(`SELECT isim, kayit_kanali FROM isletmeler WHERE demo IS NOT TRUE AND olusturma_tarihi >= NOW() - INTERVAL '24 hours' ORDER BY id`);
  v.odeme = await sayi(`SELECT COUNT(*)::int AS n, COALESCE(SUM(tutar), 0) AS toplam FROM odemeler
    WHERE durum = 'odendi' AND COALESCE(odeme_tarihi, olusturma_tarihi) >= NOW() - INTERVAL '24 hours'`);
  v.randevu = await sayi(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE kaynak = ANY($1))::int AS oto,
      COUNT(DISTINCT isletme_id)::int AS isletme
    FROM randevular WHERE olusturma_tarihi >= NOW() - INTERVAL '24 hours'`, [OTOMATIK]);
  try { v.sicak = await devir.liste(50); } catch (e) { v.sicak = null; }
  v.geriAra = await sayi(`SELECT COUNT(*)::int AS n FROM potansiyel_musteriler
    WHERE atanan_id IS NOT NULL AND durum NOT IN ('ilgilenmiyor', 'musteri_oldu')
      AND sonraki_arama < date_trunc('day', NOW()) + INTERVAL '1 day'`);
  v.kurulum = await sayi(`SELECT COUNT(*)::int AS n FROM satis_konusmalar WHERE kurulum_durum IS NOT NULL`);
  v.deneme = await sayi(`SELECT COUNT(*)::int AS n FROM isletmeler WHERE aktif = true AND demo IS NOT TRUE
    AND deneme_bitis_tarihi BETWEEN NOW() AND NOW() + INTERVAL '3 days'
    AND (paket_bitis_tarihi IS NULL OR paket_bitis_tarihi < deneme_bitis_tarihi)`);
  v.uyari = await satirlar(`SELECT baslik FROM sistem_uyarilari WHERE cozuldu = false AND seviye = 'kritik' ORDER BY son_zaman DESC LIMIT 20`);
  try { v.satisBot = require('./satisBot').bagliNumaralar().length; } catch (e) { v.satisBot = null; }
  try { v.merkez = require('./merkezOtpBot').aktifMi(); } catch (e) { v.merkez = null; }
  return v;
}

function metinYaz(v, md = (x) => String(x)) {
  const L = [];
  const g = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long', timeZone: 'Europe/Istanbul' });
  L.push(`☀️ *Günaydın! SıraGO sabah özeti* (${md(g)})`, '', '*Son 24 saat*');
  if (v.satis) L.push(`💬 Satış Bot: ${v.satis.giden} mesaj gitti · ${v.satis.cevap} cevap · ${v.satis.olumlu} olumlu · ${v.satis.ret} ret`);
  if (v.kayit) L.push(`🎉 Kayıt: ${v.kayit.length}${v.kayit.length ? ` (${v.kayit.slice(0, 5).map(k => md(k.isim)).join(', ')}${v.kayit.length > 5 ? '…' : ''})` : ''}`);
  if (v.odeme) L.push(`💳 Ödeme: ${v.odeme.n}${v.odeme.n ? ` · ${tl(v.odeme.toplam)}` : ''}`);
  if (v.randevu) L.push(`📅 Esnaflara gelen randevu: ${v.randevu.n} (${v.randevu.oto} otomatik, ${v.randevu.isletme} işletme)`);

  L.push('', '*Bugün yapılacaklar*');
  if (v.sicak) {
    L.push(`🔥 Bot sana devretti: ${v.sicak.length} aday${v.sicak.length ? ' (Satış Masası\'nın en üstünde)' : ''}`);
    for (const s of v.sicak.slice(0, 5)) L.push(`   • ${md(s.isletme_adi || 'İsimsiz')} · +${md(s.telefon)} · ${md(s.sebep_ad)}`);
  }
  if (v.geriAra) L.push(`⏰ Geri arama zamanı gelen: ${v.geriAra.n}`);
  if (v.kurulum && v.kurulum.n) L.push(`🧭 WhatsApp'ta kurulumu süren: ${v.kurulum.n}`);
  if (v.deneme && v.deneme.n) L.push(`⏳ Denemesi 3 gün içinde biten: ${v.deneme.n} (ödeme linki kendiliğinden gidiyor)`);

  const dikkat = [];
  if (v.uyari && v.uyari.length) {
    dikkat.push(`🚨 Açık kritik uyarı: ${v.uyari.length}`);
    for (const u of v.uyari.slice(0, 3)) dikkat.push(`   • ${md(u.baslik)}`);
  }
  if (v.satisBot === 0) dikkat.push('📵 Satış Bot numarası BAĞLI DEĞİL: mesaj gitmiyor, QR kart web kaydına düşüyor');
  if (v.merkez === false) dikkat.push('📵 Merkez OTP BAĞLI DEĞİL: doğrulama kodu ve hatırlatmalar gitmiyor');
  if (dikkat.length) L.push('', '*Dikkat*', ...dikkat);
  else L.push('', '✅ Sistemde açık kritik sorun yok.');
  return L.join('\n');
}

async function hazirla() {
  const bot = require('./satisBot');
  return metinYaz(await veriTopla(), (x) => (bot._mdKacis ? bot._mdKacis(x) : String(x)));
}

async function gonder() {
  const metin = await hazirla();
  await require('./satisBot')._telegramBildirimGonder(metin);
  return metin;
}

// 08:45-09:30 arasında günde bir kez (yeniden başlatmada tekrar gitmesin diye tarih ekip_ayar'da)
async function zamaniGeldiyse(simdi = new Date()) {
  const t = istanbul(simdi);
  const dk = t.saat * 60 + t.dakika;
  if (dk < 8 * 60 + 45 || dk > 9 * 60 + 30) return false;
  const r = await pool.query(`INSERT INTO ekip_ayar (anahtar, deger) VALUES ('sabah_ozeti', $1)
    ON CONFLICT (anahtar) DO UPDATE SET deger = EXCLUDED.deger WHERE ekip_ayar.deger->>'tarih' IS DISTINCT FROM $2
    RETURNING anahtar`, [JSON.stringify({ tarih: t.tarih }), t.tarih]);
  if (!r.rows.length) return false;
  await gonder();
  console.log('☀️ Sabah özeti gönderildi');
  return true;
}

function baslat() {
  setInterval(() => zamaniGeldiyse().catch(e => console.error('Sabah özeti:', e.message)), 10 * 60 * 1000);
}

module.exports = { veriTopla, metinYaz, hazirla, gonder, zamaniGeldiyse, baslat };
