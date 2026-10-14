// Memnuniyet anketi (kullanıcı kararı 2026-10-14): Yorum Avcısı önce 1–5 puan sorar.
// Google kuralı gereği link puana göre SEÇİLMEZ ("review gating" yasak): puanı veren herkese gider.
// Fark şudur: 1–3 veren müşteriye "ne oldu?" diye sorulur ve esnafa anında alarm düşer; esnaf müşteriyi arayıp gönlünü alır.
const pool = require('../config/db');

const CEVAP_PENCERESI_SAAT = 48;     // anket bu süre içinde cevaplanırsa sayılır
const DUSUK_PUAN = 3;                // 1–3 → esnafa alarm

// "5", "5️⃣", "5/5", "5 puan", "⭐⭐⭐⭐⭐" → 5; başka her şey → null (bot normal akışa devam eder)
function puanAl(metin) {
  const s = String(metin || '').trim();
  if (!s || s.length > 20) return null;
  const yildiz = (s.match(/⭐|★/g) || []).length;
  if (yildiz >= 1 && yildiz <= 5 && s.replace(/⭐|★|\s|️/g, '') === '') return yildiz;
  const m = s.replace(/️|⃣/g, '').match(/^([1-5])(\s*(\/\s*5|puan|yıldız|yildiz|stars?|points?))?[.!]?$/i);
  return m ? Number(m[1]) : null;
}

function puanSorusu(musteriIsim, isletmeIsim) {
  const ad = String(musteriIsim || '').trim().split(/\s+/)[0];
  return `Merhaba${ad && !/^\d+$/.test(ad) ? ' ' + ad : ''}! 😊\n\nBugün ${isletmeIsim}'deki hizmetimizden ne kadar memnun kaldınız?\n\n` +
    `1'den 5'e kadar bir rakam yazmanız yeterli (5 = çok memnun).`;
}

function linkMesaji(t, puan) {
  const link = t.google_maps_link;
  if (puan > DUSUK_PUAN) {
    if (!link) return `Çok teşekkür ederiz! 🙏 Sizi yine bekleriz.`;
    // Esnafın özel şablonu varsa ikinci mesajda o kullanılır. Panel eski varsayılan metni ("deneyiminiz nasıldı?")
    // değiştirilmemiş haliyle de kaydediyordu; puan verildikten sonra o soru tuhaf okunur → yeni metin kullanılır.
    const ozel = t.yorum_mesaj_sablonu && !/deneyiminiz nasıldı\?/i.test(t.yorum_mesaj_sablonu) ? t.yorum_mesaj_sablonu : null;
    const sablon = ozel ||
      `Çok teşekkür ederiz! 🙏\n\nGörüşünüzü Google'da da paylaşırsanız {isletme_adi} için çok değerli olur ⭐\n{google_maps_link}`;
    return sablon.replace(/{musteri_adi}/g, t.musteri_isim || '').replace(/{isletme_adi}/g, t.isletme_isim || '').replace(/{google_maps_link}/g, link);
  }
  return `Çok üzüldük, özür dileriz 🙏\n\nNeyi daha iyi yapabilirdik? Buraya yazdığınız doğrudan ${t.isletme_isim} sahibine iletilecek.` +
    (link ? `\n\nDilerseniz görüşünüzü Google'da da paylaşabilirsiniz:\n${link}` : '');
}

// Esnafa bildirim: panelde canlı + telefon bildirimi
async function esnafaBildir(isletmeId, baslik, govde, ek = {}) {
  try { require('./socketServer').emitToIsletme(isletmeId, 'memnuniyet:dusuk', { baslik, govde, ...ek }); } catch (e) { /* panel kapalı */ }
  try { await require('./pushService').sendToIsletme(isletmeId, { title: baslik, body: govde, url: '/?sayfa=yorumavcisi', tag: 'memnuniyet' }); } catch (e) { /* push yok */ }
}

// Müşteriden gelen mesaj bir ankete cevap mı? Öyleyse işleyip müşteriye gidecek cevabı döner, değilse null.
// WhatsApp'ta telefonla, Telegram'da sohbet kimliğiyle eşleşir.
async function cevapIsle({ isletmeId, telefon, tgChatId, metin }) {
  const kosul = tgChatId ? 'yt.tg_chat_id = $2' : 'yt.telefon = $2';
  const t = (await pool.query(
    `SELECT yt.*, m.isim AS musteri_isim, i.isim AS isletme_isim, i.google_maps_link, i.yorum_mesaj_sablonu
       FROM yorum_talepleri yt
       JOIN isletmeler i ON i.id = yt.isletme_id
       LEFT JOIN musteriler m ON m.id = yt.musteri_id
      WHERE yt.isletme_id = $1 AND ${kosul} AND yt.durum IN ('puan_bekliyor', 'yorum_bekliyor')
        AND yt.gonderim_tarihi > NOW() - INTERVAL '${CEVAP_PENCERESI_SAAT} hours'
      ORDER BY yt.gonderim_tarihi DESC LIMIT 1`,
    [isletmeId, tgChatId ? String(tgChatId) : telefon]
  )).rows[0];
  if (!t) return null;

  if (t.durum === 'puan_bekliyor') {
    const puan = puanAl(metin);
    if (!puan) return null;   // puan değil (ör. yeni randevu isteği) → bot normal akışa devam etsin
    const dusuk = puan <= DUSUK_PUAN;
    await pool.query(`UPDATE yorum_talepleri SET puan = $1, puan_zamani = NOW(), durum = $2 WHERE id = $3`,
      [puan, dusuk ? 'yorum_bekliyor' : 'tamamlandi', t.id]);
    if (dusuk) {
      await esnafaBildir(isletmeId, `⚠️ ${t.musteri_isim || 'Bir müşteri'} ${puan}/5 verdi`,
        'Müşterin memnun kalmamış. Hemen arayıp gönlünü almak, kötü yorumu önler.', { talepId: t.id, puan });
    }
    return linkMesaji(t, puan);
  }

  // Düşük puandan sonra gelen ilk mesaj = müşterinin açıklaması
  const yazi = String(metin || '').trim();
  if (yazi.length < 2) return null;
  await pool.query(`UPDATE yorum_talepleri SET geri_bildirim = $1, durum = 'tamamlandi' WHERE id = $2`, [yazi.slice(0, 1000), t.id]);
  await esnafaBildir(isletmeId, `💬 ${t.musteri_isim || 'Müşteri'} ne olduğunu yazdı`, yazi.slice(0, 140), { talepId: t.id });
  return `Teşekkür ederiz, ilettik. ${t.isletme_isim} en kısa sürede sizinle ilgilenecek. 🙏`;
}

module.exports = { puanAl, puanSorusu, linkMesaji, cevapIsle, esnafaBildir, DUSUK_PUAN };
