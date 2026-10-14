// Seans takibi (kullanıcı kararı 2026-10-14): lazer, cilt bakımı, kanal tedavisi kontrolü, aşı takvimi gibi zincirleme hizmetler.
// Hizmete "toplam seans + kaç günde bir" tanımlanır. Randevu tamamlanınca müşterinin ilerlemesi bir artar ("Seans 2/6");
// sıradaki seansın zamanı gelince (aralıktan 2 gün önce) müşteriye WhatsApp'tan hatırlatma gider. Randevusu varsa gitmez.
const pool = require('../config/db');
const { tarihFormatla, bugunTarih } = require('../utils/tarih');

const ONCE_GUN = 2;            // hatırlatma, seans gününden bu kadar önce
const TEKRAR_GUN = 7;          // cevap yoksa bir kez daha
const EN_FAZLA_HATIRLATMA = 2;

const gunEkle = (tarih, gun) => { const [y, a, g] = tarihFormatla(tarih).split('-').map(Number); const d = new Date(Date.UTC(y, a - 1, g + gun)); return d.toISOString().slice(0, 10); };

// Randevu "tamamlandı" olduğunda çağrılır (panel, otomatik onay, anket cevabı). Aynı randevu iki kez sayılmaz.
async function randevuTamamlandi(randevuId) {
  const r = (await pool.query(
    `SELECT r.id, r.isletme_id, r.musteri_id, r.hizmet_id, r.tarih, r.seans_id, h.seans_sayisi, h.seans_aralik_gun
       FROM randevular r LEFT JOIN hizmetler h ON h.id = r.hizmet_id WHERE r.id = $1`, [randevuId])).rows[0];
  if (!r || r.seans_id || !(Number(r.seans_sayisi) > 1) || !r.musteri_id) return null;

  let paket = (await pool.query(
    `SELECT * FROM musteri_seanslari WHERE isletme_id = $1 AND musteri_id = $2 AND hizmet_id = $3 AND durum = 'aktif' ORDER BY id DESC LIMIT 1`,
    [r.isletme_id, r.musteri_id, r.hizmet_id])).rows[0];
  if (!paket) {
    paket = (await pool.query(
      `INSERT INTO musteri_seanslari (isletme_id, musteri_id, hizmet_id, toplam, aralik_gun) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [r.isletme_id, r.musteri_id, r.hizmet_id, Number(r.seans_sayisi), Number(r.seans_aralik_gun) || 30])).rows[0];
  }
  const no = Number(paket.tamamlanan) + 1;
  const bitti = no >= Number(paket.toplam);
  // Hatırlatma tarihi: seans tarihi + aralık − 2 gün (en erken yarın)
  let sonraki = null;
  if (!bitti) {
    sonraki = gunEkle(r.tarih, Math.max(1, Number(paket.aralik_gun) - ONCE_GUN));
    const yarin = gunEkle(bugunTarih(), 1);
    if (sonraki < yarin) sonraki = yarin;
  }
  await pool.query(
    `UPDATE musteri_seanslari SET tamamlanan = $2, son_seans_tarihi = $3, sonraki_hatirlatma = $4, hatirlatma_sayisi = 0, durum = $5 WHERE id = $1`,
    [paket.id, no, tarihFormatla(r.tarih), sonraki, bitti ? 'bitti' : 'aktif']);
  await pool.query('UPDATE randevular SET seans_id = $1, seans_no = $2 WHERE id = $3', [paket.id, no, r.id]);
  return { seansId: paket.id, no, toplam: Number(paket.toplam), bitti };
}

// Günlük: zamanı gelen seanslar için müşteriye hatırlatma
async function hatirlatmalariGonder() {
  const bugun = bugunTarih();
  const liste = (await pool.query(
    `SELECT ms.*, m.telefon, m.isim AS musteri_isim, h.isim AS hizmet_isim, i.isim AS isletme_isim, i.slug
       FROM musteri_seanslari ms
       JOIN musteriler m ON m.id = ms.musteri_id
       JOIN isletmeler i ON i.id = ms.isletme_id AND i.aktif = true AND COALESCE(i.demo, false) = false
       LEFT JOIN hizmetler h ON h.id = ms.hizmet_id
      WHERE ms.durum = 'aktif' AND ms.sonraki_hatirlatma IS NOT NULL AND ms.sonraki_hatirlatma <= $1
      LIMIT 200`, [bugun])).rows;
  let giden = 0;
  for (const s of liste) {
    try {
      // Müşteri sıradaki seansı zaten aldıysa hatırlatma yok (seans tamamlanınca yeni tarih kurulur)
      const ileri = (await pool.query(
        `SELECT 1 FROM randevular WHERE isletme_id = $1 AND musteri_id = $2 AND hizmet_id = $3 AND tarih >= $4 AND durum NOT IN ('iptal', 'gelmedi') LIMIT 1`,
        [s.isletme_id, s.musteri_id, s.hizmet_id, bugun])).rows[0];
      if (ileri) { await pool.query('UPDATE musteri_seanslari SET sonraki_hatirlatma = NULL WHERE id = $1', [s.id]); continue; }

      const gitti = await mesajGonder(s);
      const sayi = Number(s.hatirlatma_sayisi) + (gitti ? 1 : 0);
      // Gitmediyse (bot bağlı değil) yarın tekrar denenir; gittiyse bir hafta sonra bir kez daha, sonra durur
      const sonraki = !gitti ? gunEkle(bugun, 1) : sayi < EN_FAZLA_HATIRLATMA ? gunEkle(bugun, TEKRAR_GUN) : null;
      await pool.query('UPDATE musteri_seanslari SET hatirlatma_sayisi = $2, sonraki_hatirlatma = $3 WHERE id = $1', [s.id, sayi, sonraki]);
      if (gitti) giden++;
    } catch (e) { console.error('Seans hatırlatma:', e.message); }
  }
  if (giden) console.log(`🔁 Seans hatırlatması: ${giden} müşteri`);
  return giden;
}

function hatirlatmaMetni(s, link) {
  const ad = String(s.musteri_isim || '').trim().split(/\s+/)[0];
  const sira = Number(s.tamamlanan) + 1;
  return `Merhaba${ad && !/^\d+$/.test(ad) ? ' ' + ad : ''}! 😊\n\n${s.hizmet_isim || 'Seans'} için *${sira}. seans* zamanınız geldi ` +
    `(${s.tamamlanan}/${s.toplam} tamamlandı).\n\nRandevu için buraya "randevu" yazabilir` + (link ? ` ya da saatinizi buradan seçebilirsiniz:\n${link}` : 'siniz.') +
    `\n\n${s.isletme_isim}`;
}

async function mesajGonder(s) {
  const tel = String(s.telefon || '');
  if (!tel || tel.startsWith('kapi') || tel.startsWith('tg:')) return false;
  const whatsappWeb = require('./whatsappWeb');
  if (whatsappWeb.getDurum(s.isletme_id)?.durum !== 'bagli') return false;
  let link = null;
  try { link = await require('../utils/randevuLinki').randevuLinki({ id: s.isletme_id, slug: s.slug, isim: s.isletme_isim }); } catch (e) { /* link olmadan */ }
  const r = await whatsappWeb.mesajGonder(s.isletme_id, tel, hatirlatmaMetni(s, link));
  return !!r?.success;
}

module.exports = { randevuTamamlandi, hatirlatmalariGonder, hatirlatmaMetni, gunEkle };
