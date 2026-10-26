// Acil durum (2026-10-26, kullanıcı kararı): cenaze, hastane gibi beklenmedik bir durumda çalışan ya da bütün dükkân
// bugünden seçilen güne kadar randevu almaz. Alınmış randevular: aynı saatte boş ve o hizmeti yapan başka usta varsa ona
// aktarılır; yoksa iptal edilir, müşteriye özür + yeni saat linki gider (çalışan acilinde o gün için bekleme listesine yazılır).
// Müşteriye sebep söylenmez ("beklenmedik bir durum"). Esnaf önce önizlemeyi görür; onaylamadan kimseye mesaj gitmez.
const pool = require('../config/db');
const { bugunTarih, simdiSaat, tarihFormatla } = require('../utils/tarih');

const EN_UZUN_GUN = 30;
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

const s5 = (x) => String(x || '').slice(0, 5);
const dakika = (x) => { const [h, m] = s5(x).split(':').map(Number); return h * 60 + (m || 0); };
const saatYaz = (dk) => `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
const gunEkle = (t, n) => { const [y, a, g] = t.split('-').map(Number); return new Date(Date.UTC(y, a - 1, g + n)).toISOString().slice(0, 10); };
const tarihYazi = (t) => { const [y, a, g] = t.split('-').map(Number); return `${g} ${AYLAR[a - 1]} ${GUNLER[new Date(y, a - 1, g).getDay()]}`; };

function hata(mesaj, kod = 400) { const e = new Error(mesaj); e.kod = kod; return e; }

// Girdi kontrolü: kapsam ('calisan' | 'dukkan'), bitiş tarihi bugünden en fazla 30 gün sonra
async function dogrula(isletmeId, { calisanId, bitisTarih }) {
  const bugun = bugunTarih();
  const bitis = String(bitisTarih || bugun).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bitis) || bitis < bugun) throw hata('Bitiş tarihi bugün ya da sonrası olmalı');
  if (bitis > gunEkle(bugun, EN_UZUN_GUN)) throw hata(`Acil durum en fazla ${EN_UZUN_GUN} gün sürebilir`);
  let calisan = null;
  if (calisanId) {
    calisan = (await pool.query('SELECT id, isim FROM calisanlar WHERE id = $1 AND isletme_id = $2', [calisanId, isletmeId])).rows[0];
    if (!calisan) throw hata('Çalışan bulunamadı', 404);
  }
  return { bugun, bitis, calisan };
}

// Etkilenen randevular (şu andan sonrası) ve her biri için karar: aktar (yeni usta) | iptal
async function plan(isletmeId, { calisanId = null, bitisTarih } = {}) {
  const { bugun, bitis, calisan } = await dogrula(isletmeId, { calisanId, bitisTarih });
  const simdi = saatYaz(simdiSaat().toplam);
  const randevular = (await pool.query(
    `SELECT r.id, r.tarih, r.saat, r.bitis_saati, r.calisan_id, r.hizmet_id, m.telefon, m.isim AS musteri_isim, c.isim AS calisan_isim,
            COALESCE((SELECT array_agg(rh.hizmet_id ORDER BY rh.sira) FROM randevu_hizmetleri rh WHERE rh.randevu_id = r.id), ARRAY[r.hizmet_id]) AS hizmet_ids,
            COALESCE((SELECT STRING_AGG(h2.isim, ', ' ORDER BY rh.sira) FROM randevu_hizmetleri rh JOIN hizmetler h2 ON h2.id = rh.hizmet_id WHERE rh.randevu_id = r.id),
                     (SELECT isim FROM hizmetler WHERE id = r.hizmet_id)) AS hizmet_isim
       FROM randevular r
       JOIN musteriler m ON m.id = r.musteri_id
       LEFT JOIN calisanlar c ON c.id = r.calisan_id
      WHERE r.isletme_id = $1 AND r.tarih >= $2 AND r.tarih <= $3
        AND r.durum NOT IN ('iptal', 'gelmedi', 'tamamlandi')
        AND ($4::int IS NULL OR r.calisan_id = $4)
        AND NOT (r.tarih = $2 AND r.saat < $5::time)
      ORDER BY r.tarih, r.saat`,
    [isletmeId, bugun, bitis, calisan ? calisan.id : null, simdi])).rows;

  const randevuService = require('./randevu');
  const alinan = [];   // bu planda başka ustaya aktarılanlar: aynı ustaya aynı saatte iki aktarım olmasın
  const kararlar = [];
  for (const r of randevular) {
    const tarih = tarihFormatla(r.tarih);
    const ids = (r.hizmet_ids || []).map(Number).filter(Boolean);
    const bas = dakika(r.saat), bit = r.bitis_saati ? dakika(r.bitis_saati) : bas + 30;
    let yeni = null;
    if (calisan) {   // dükkân kapanınca aktaracak usta yok
      const adaylar = (await randevuService.uygunCalisanlar(isletmeId, ids)).filter(u => u.id !== calisan.id);
      for (const u of adaylar) {
        const cakisma = alinan.some(a => a.calisanId === u.id && a.tarih === tarih && bas < a.bit && bit > a.bas);
        if (cakisma) continue;
        const bos = await randevuService.musaitSaatleriGetir(isletmeId, tarih, u.id, null, { hizmetIds: ids, simdiPayi: 0 });
        if (bos.includes(s5(r.saat))) { yeni = u; break; }
      }
    }
    if (yeni) alinan.push({ calisanId: yeni.id, tarih, bas, bit });
    kararlar.push({
      randevu_id: r.id, tarih, saat: s5(r.saat), musteri_isim: r.musteri_isim, telefon: r.telefon, hizmet: r.hizmet_isim,
      hizmet_ids: ids, eski_calisan: r.calisan_isim || null,
      karar: yeni ? 'aktar' : 'iptal', yeni_calisan_id: yeni?.id || null, yeni_calisan: yeni?.isim || null,
    });
  }
  return { kapsam: calisan ? 'calisan' : 'dukkan', calisan, baslangic: bugun, bitis, simdi, randevular: kararlar };
}

// Müşteriye mesaj: Telegram müşterisi → işletmenin botu; WhatsApp → esnafın numarası, bağlı değilse SıraGO merkez hattı
async function musteriyeYaz(isletme, telefon, metin) {
  const tel = String(telefon || '');
  try {
    if (tel.startsWith('tg:')) {
      if (!isletme.telegram_token) return null;
      const TelegramBot = require('node-telegram-bot-api');
      await new TelegramBot(isletme.telegram_token).sendMessage(tel.slice(3), metin);
      return 'telegram';
    }
    const wa = require('./whatsappWeb');
    if (wa.getDurum(isletme.id)?.durum === 'bagli' && (await wa.mesajGonder(isletme.id, tel, metin))?.success) return 'whatsapp';
    const merkez = require('./merkezOtpBot');
    if (merkez.aktifMi?.() && (await merkez.mesajGonder(tel, metin))?.success) return 'merkez';
  } catch (e) { console.error('Acil durum mesajı gönderilemedi:', e.message); }
  return null;
}

function mesajMetni(isletme, k, link, beklemede) {
  const ad = k.musteri_isim && !/^(online müşteri|bilinmiyor)$/i.test(k.musteri_isim) ? ` ${String(k.musteri_isim).split(' ')[0]}` : '';
  const ne = `${isletme.isim} ${tarihYazi(k.tarih)} ${k.saat} randevunuz`;
  if (k.karar === 'aktar') {
    return `Merhaba${ad}, ${ne} için küçük bir değişiklik var: ${k.eski_calisan || 'ustamız'} beklenmedik bir durum nedeniyle o gün çalışamıyor. ` +
      `Randevunuz aynı saatte ${k.yeni_calisan} ile devam ediyor. Uygun değilse bu mesaja yazmanız yeterli, başka bir saat ayarlarız.`;
  }
  return `Merhaba${ad}, çok üzgünüz: ${ne} beklenmedik bir durum nedeniyle iptal edildi.` +
    (link ? ` Size uygun yeni bir saati buradan seçebilirsiniz: ${link}` : ' Yeni bir saat için bize yazabilirsiniz.') +
    (beklemede ? ' O gün başka bir saat açılırsa size buradan haber vereceğiz.' : '');
}

// Uygula: kapalı aralıkları yaz, randevuları aktar/iptal et, müşterilere arka planda haber ver
async function baslat(isletmeId, { calisanId = null, bitisTarih, olusturanId = null } = {}) {
  const p = await plan(isletmeId, { calisanId, bitisTarih });
  const acil = (await pool.query(
    `INSERT INTO acil_durumlar (isletme_id, calisan_id, baslangic_tarih, bitis_tarih, olusturan_id) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [isletmeId, p.calisan?.id || null, p.baslangic, p.bitis, olusturanId])).rows[0];

  for (let t = p.baslangic; t <= p.bitis; t = gunEkle(t, 1)) {
    await pool.query(
      `INSERT INTO takvim_bloklari (isletme_id, calisan_id, tarih, baslangic, bitis, aciklama, kaynak, acil_durum_id)
       VALUES ($1, $2, $3, $4, '24:00', 'Acil durum', 'acil', $5)`,
      [isletmeId, p.calisan?.id || null, t, t === p.baslangic ? p.simdi : '00:00', acil.id]);
  }

  const randevuService = require('./randevu');
  const socketServer = require('./socketServer');
  for (const k of p.randevular) {
    if (k.karar === 'aktar') {
      const r = (await pool.query(
        `UPDATE randevular SET calisan_id = $1 WHERE id = $2 AND isletme_id = $3 AND durum NOT IN ('iptal', 'gelmedi', 'tamamlandi') RETURNING *`,
        [k.yeni_calisan_id, k.randevu_id, isletmeId])).rows[0];
      if (r) { try { socketServer.emitToIsletme(isletmeId, 'randevu:guncellendi', { randevu: r }); } catch (e) { /* canlı yenileme önemsiz */ } }
      else k.karar = 'atlandi';
    } else {
      await randevuService.randevuIptal(k.randevu_id);
    }
  }
  await pool.query('UPDATE acil_durumlar SET ozet = $1 WHERE id = $2', [JSON.stringify({ randevular: p.randevular }), acil.id]);

  // Mesajlar arka planda (çok randevuda WhatsApp'a art arda yüklenmesin diye aralıklı); sonuç özete yazılır
  bildir(isletmeId, acil.id, p).catch(e => console.error('Acil durum bildirimi:', e.message));
  return { acil, ...p };
}

async function bildir(isletmeId, acilId, p) {
  const isletme = (await pool.query('SELECT * FROM isletmeler WHERE id = $1', [isletmeId])).rows[0];
  if (!isletme) return;
  const link = await require('../utils/randevuLinki').randevuLinki(isletme).catch(() => null);
  const bekleme = require('./beklemeListesi');
  for (const [i, k] of p.randevular.entries()) {
    if (k.karar === 'atlandi') continue;
    let beklemede = false;
    if (k.karar === 'iptal' && p.calisan) {   // başka usta o gün boşalırsa haber verilsin
      try { beklemede = !!(await bekleme.ekle({ isletmeId, telefon: k.telefon, isim: k.musteri_isim, hizmetIds: k.hizmet_ids, tarih: k.tarih, kaynak: 'acil' })); } catch (e) { /* liste olmadan */ }
    }
    if (i) await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
    k.bildirim = await musteriyeYaz(isletme, k.telefon, mesajMetni(isletme, k, link, beklemede));
  }
  await pool.query('UPDATE acil_durumlar SET ozet = $1 WHERE id = $2', [JSON.stringify({ randevular: p.randevular }), acilId]);
}

// Acil durumu bitir: kapalı aralıklar kalkar (iptal edilen randevular geri gelmez)
async function bitir(isletmeId, acilId) {
  const a = (await pool.query('UPDATE acil_durumlar SET aktif = false, bitirildi = NOW() WHERE id = $1 AND isletme_id = $2 AND aktif = true RETURNING *',
    [acilId, isletmeId])).rows[0];
  if (!a) return null;
  await pool.query('DELETE FROM takvim_bloklari WHERE acil_durum_id = $1', [a.id]);
  return a;
}

// Aktif ve son 7 günde biten acil durumlar; süresi geçenler kendiliğinden pasif sayılır
async function liste(isletmeId, calisanId = null) {
  await pool.query(`UPDATE acil_durumlar SET aktif = false, bitirildi = NOW() WHERE isletme_id = $1 AND aktif = true AND bitis_tarih < $2`, [isletmeId, bugunTarih()]);
  return (await pool.query(
    `SELECT a.*, c.isim AS calisan_isim FROM acil_durumlar a LEFT JOIN calisanlar c ON c.id = a.calisan_id
      WHERE a.isletme_id = $1 AND ($2::int IS NULL OR a.calisan_id = $2) AND (a.aktif OR a.olusturma > NOW() - INTERVAL '7 days')
      ORDER BY a.aktif DESC, a.olusturma DESC LIMIT 20`, [isletmeId, calisanId])).rows
    .map(a => ({ ...a, baslangic_tarih: tarihFormatla(a.baslangic_tarih), bitis_tarih: tarihFormatla(a.bitis_tarih) }));   // DATE → UTC kayması olmasın
}

module.exports = { plan, baslat, bitir, liste, mesajMetni, EN_UZUN_GUN };
