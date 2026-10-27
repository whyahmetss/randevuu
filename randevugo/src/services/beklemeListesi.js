// Bekleme listesi (iptal boşluğu doldurma) — 2026-10-14
// Dolu güne bakan müşteri listeye girer (WhatsApp botu ya da randevu sayfası). Yer açılınca listedeki İLK kişiye
// WhatsApp'tan "evet/hayır" sorulur; 30 dk cevap gelmezse ya da "hayır" derse sıradakine geçilir.
// Aynı anda tek kişiye teklif gider: iki kişi aynı boşluğa "evet" deyip biri hayal kırıklığına uğramasın.
// Yer açılmasını bot iptali anında, panel/randevu sayfası iptallerini 5 dakikalık kontrol yakalar.
const pool = require('../config/db');
const { tarihFormatla, bugunTarih } = require('../utils/tarih');

const ZAMAN_ASIMI_DK = 30;
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const tarihYazi = (t) => { const [y, a, g] = tarihFormatla(t).split('-').map(Number); const d = new Date(y, a - 1, g); return `${g} ${AYLAR[a - 1]} ${GUNLER[d.getDay()]}`; };
const hizmetListesi = (b) => (Array.isArray(b.hizmet_ids) && b.hizmet_ids.length ? b.hizmet_ids : (b.hizmet_id ? [b.hizmet_id] : [])).map(Number).filter(Boolean);

// Listeye ekle. Aynı kişi aynı gün için bir kez bekler.
async function ekle({ isletmeId, telefon, isim, hizmetIds = [], tarih, kaynak = 'bot' }) {
  const tarihStr = tarihFormatla(tarih);
  const var_ = (await pool.query(
    `SELECT id FROM bekleme_listesi WHERE isletme_id = $1 AND musteri_telefon = $2 AND istenen_tarih = $3 AND durum IN ('bekliyor', 'bildirildi')`,
    [isletmeId, telefon, tarihStr])).rows[0];
  if (var_) return { zatenVar: true, id: var_.id };
  const ids = hizmetIds.map(Number).filter(Boolean);
  const r = (await pool.query(
    `INSERT INTO bekleme_listesi (musteri_telefon, isletme_id, hizmet_id, hizmet_ids, istenen_tarih, musteri_isim, kaynak)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [telefon, isletmeId, ids[0] || null, ids.length ? ids : null, tarihStr, isim ? String(isim).slice(0, 80) : null, kaynak])).rows[0];
  // Esnaf listeye kimin girdiğini görmüyordu (2026-10-27): panel bildirimi + telefona push; panel listesi de tazelenir
  try {
    await require('../controllers/adminController').bildirimOlustur(isletmeId, 'bekleme', '⏳ Bekleme listesine yeni kişi',
      `${isim ? String(isim).slice(0, 80) + ' · ' : ''}${tarihYazi(tarihStr)} için yer bekliyor. Yer açılınca ona otomatik haber verilecek.`);
  } catch (e) { /* bildirim tablosu yoksa listeye ekleme yine geçerli */ }
  return { eklendi: true, id: r.id };
}

// O gün için sıradaki kişiye teklif gönder. saat verilirse o saat (bot iptali), verilmezse kişinin hizmetlerine uyan ilk boş saat.
async function bildir(isletmeId, tarih, saat = null) {
  const tarihStr = tarihFormatla(tarih);
  // Şu an cevabı beklenen biri varsa ikinci kişiye teklif gitmez
  const aktif = (await pool.query(
    `SELECT id FROM bekleme_listesi WHERE isletme_id = $1 AND istenen_tarih = $2 AND durum = 'bildirildi'`, [isletmeId, tarihStr])).rows[0];
  if (aktif) return null;

  const adaylar = (await pool.query(
    `SELECT bl.*, h.isim AS hizmet_isim FROM bekleme_listesi bl LEFT JOIN hizmetler h ON h.id = bl.hizmet_id
      WHERE bl.isletme_id = $1 AND bl.istenen_tarih = $2 AND bl.durum = 'bekliyor' ORDER BY bl.olusturma_tarihi ASC`,
    [isletmeId, tarihStr])).rows;
  if (!adaylar.length) return null;

  const randevuService = require('./randevu');
  for (const b of adaylar) {
    const ids = hizmetListesi(b);
    const saatler = await randevuService.musaitSaatleriGetir(isletmeId, tarihStr, null, ids[0] || null, { hizmetIds: ids });
    const teklif = saat && saatler.includes(String(saat).slice(0, 5)) ? String(saat).slice(0, 5) : saatler[0];
    if (!teklif) continue;   // bu kişinin hizmetine yetecek boşluk yok → sıradaki (daha kısa hizmet) denenir
    const gitti = await teklifGonder(isletmeId, b, tarihStr, teklif, ids);
    await pool.query(
      `UPDATE bekleme_listesi SET durum = $2, bildirim_zamani = NOW(), bildirim_sayisi = COALESCE(bildirim_sayisi, 0) + 1, bildirilen_saat = $3 WHERE id = $1`,
      [b.id, gitti ? 'bildirildi' : 'bekliyor', teklif]);
    if (gitti) return { id: b.id, saat: teklif };
    return null;   // bot bağlı değil: sonraki kontrolde tekrar denenir
  }
  return null;
}

async function teklifGonder(isletmeId, b, tarihStr, saat, ids) {
  const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!isletme) return false;
  const tel = String(b.musteri_telefon);
  if (tel.startsWith('tg:')) {
    if (!isletme.telegram_token) return false;
    try {
      const TelegramBot = require('node-telegram-bot-api');
      await new TelegramBot(isletme.telegram_token).sendMessage(tel.slice(3),
        `🔔 *Müjde!* ${tarihYazi(tarihStr)} ${saat} için yer açıldı.\n${b.hizmet_isim ? '✂️ ' + b.hizmet_isim + '\n' : ''}\nRandevu almak için "randevu" yazın.`, { parse_mode: 'Markdown' });
      return true;
    } catch (e) { return false; }
  }
  const whatsappWeb = require('./whatsappWeb');
  if (whatsappWeb.getDurum(isletmeId)?.durum !== 'bagli') return false;
  const botMesajlar = require('../utils/botMesajlar');
  const mesaj = botMesajlar.get(isletme, 'beklemeListesiMusait', { tarihStr: tarihYazi(tarihStr), saatStr: saat, hizmetAd: b.hizmet_isim });
  const r = await whatsappWeb.mesajGonder(isletmeId, tel, mesaj);
  if (!r?.success) return false;
  // Müşteri "evet" derse bot randevuyu bu saate kurar (whatsappWeb → bekleme_onay)
  await pool.query(
    `INSERT INTO bot_durum (musteri_telefon, isletme_id, asama, secilen_tarih, secilen_saat, secilen_hizmet_id, son_aktivite)
     VALUES ($1, $2, 'bekleme_onay', $3, $4, $5, NOW())
     ON CONFLICT (musteri_telefon, isletme_id) DO UPDATE SET asama = 'bekleme_onay', secilen_tarih = EXCLUDED.secilen_tarih,
       secilen_saat = EXCLUDED.secilen_saat, secilen_hizmet_id = EXCLUDED.secilen_hizmet_id, son_aktivite = NOW()`,
    [tel, isletmeId, tarihStr, saat, ids[0] || null]);
  return true;
}

// Müşteri "evet" dedi ve randevu kuruldu
async function dolduruldu(isletmeId, telefon, randevu) {
  await pool.query(`UPDATE bekleme_listesi SET durum = 'randevu_alindi' WHERE musteri_telefon = $1 AND isletme_id = $2 AND durum = 'bildirildi'`, [telefon, isletmeId]);
  try {
    await require('./pushService').sendToIsletme(isletmeId, {
      title: '🔥 Boşluk doldu', body: `Bekleme listesinden bir müşteri ${randevu?.saat ? String(randevu.saat).slice(0, 5) + ' ' : ''}boşluğunu aldı.`, url: '/', tag: 'bekleme',
    });
  } catch (e) { /* push yok */ }
}

// Müşteri "hayır" dedi ya da süre doldu → sıradakine geç
async function vazgecti(isletmeId, telefon, durum = 'vazgecti') {
  const b = (await pool.query(
    `UPDATE bekleme_listesi SET durum = $3 WHERE musteri_telefon = $1 AND isletme_id = $2 AND durum = 'bildirildi' RETURNING istenen_tarih, bildirilen_saat`,
    [telefon, isletmeId, durum])).rows[0];
  if (b) await bildir(isletmeId, b.istenen_tarih, b.bildirilen_saat);
  return b || null;
}

// İlgili teklif kaydı (onayda hizmet listesi buradan alınır)
async function aktifTeklif(isletmeId, telefon) {
  return (await pool.query(
    `SELECT * FROM bekleme_listesi WHERE musteri_telefon = $1 AND isletme_id = $2 AND durum = 'bildirildi' ORDER BY bildirim_zamani DESC LIMIT 1`,
    [telefon, isletmeId])).rows[0] || null;
}

// 5 dakikada bir: zaman aşımı + panel/randevu sayfası iptalleriyle açılan yerler
async function kontrol() {
  const asim = (await pool.query(
    `UPDATE bekleme_listesi SET durum = 'zaman_asimi'
      WHERE durum = 'bildirildi' AND bildirim_zamani < NOW() - INTERVAL '${ZAMAN_ASIMI_DK} minutes'
      RETURNING isletme_id, musteri_telefon, istenen_tarih, bildirilen_saat`)).rows;
  for (const a of asim) {
    await pool.query(`UPDATE bot_durum SET asama = 'ana_menu' WHERE musteri_telefon = $1 AND isletme_id = $2 AND asama = 'bekleme_onay'`,
      [a.musteri_telefon, a.isletme_id]).catch(() => {});
    await bildir(a.isletme_id, a.istenen_tarih, a.bildirilen_saat).catch(() => {});
  }
  // Geçmiş günlerin kayıtları kapanır
  await pool.query(`UPDATE bekleme_listesi SET durum = 'gecti' WHERE durum = 'bekliyor' AND istenen_tarih < $1`, [bugunTarih()]);
  const gunler = (await pool.query(
    `SELECT DISTINCT isletme_id, istenen_tarih FROM bekleme_listesi WHERE durum = 'bekliyor' AND istenen_tarih >= $1`, [bugunTarih()])).rows;
  for (const g of gunler) await bildir(g.isletme_id, g.istenen_tarih).catch(e => console.error('Bekleme listesi:', e.message));
}

module.exports = { ekle, bildir, dolduruldu, vazgecti, aktifTeklif, kontrol, tarihYazi, ZAMAN_ASIMI_DK };
