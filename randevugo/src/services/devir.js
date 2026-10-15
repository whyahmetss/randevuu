// Sıcak aday devri (kullanıcı kararı 2026-10-16, tek kişi düzeni): bot konuşmayı yürütür; aranmak isteyen, sıcak,
// fiyat soran, demosunu açan ya da olumlu dönen aday Satış Masası'nın en üstüne hazır arama notuyla düşer.
// Kişi günde 30 konuşmayı değil, yalnız bunları arar. Güçlü sinyal zayıfın üzerine yazar; kapanmış aday yeniden
// "aranmak istiyorum" derse listeye geri gelir.
const pool = require('../config/db');

const ONCELIK = { arama: 5, sicak: 4, fiyat: 3, demo: 2, olumlu: 1 };
const SEBEP_AD = { arama: 'Aranmak istiyor', sicak: 'Sıcak', fiyat: 'Fiyat sordu', demo: 'Demosunu açtı', olumlu: 'Olumlu döndü' };
const FIYAT = /\b(fiyat|ucret|ücret|kac para|kaç para|ne kadar|kac tl|kaç tl|aylik|aylık|paket)/i;

async function devret(konusmaId, sebep) {
  if (!konusmaId || !ONCELIK[sebep]) return false;
  const k = (await pool.query(
    'SELECT devir_sebep, devir_kapandi, kayit_isletme_id, durum FROM satis_konusmalar WHERE id = $1', [konusmaId])).rows[0];
  if (!k || k.kayit_isletme_id || ['olumsuz', 'musteri'].includes(k.durum)) return false;
  const eski = ONCELIK[k.devir_sebep] || 0;
  const yeni = ONCELIK[sebep];
  const acik = k.devir_sebep && !k.devir_kapandi;
  // Açıksa yalnız daha güçlü sinyal günceller; kapandıysa yalnız güçlü sinyal (arama/sıcak) yeniden açar
  if (acik ? yeni <= eski : (k.devir_kapandi && yeni < ONCELIK.sicak)) return false;
  await pool.query(
    'UPDATE satis_konusmalar SET devir_sebep = $2, devir_zamani = NOW(), devir_kapandi = NULL, devir_ertele = NULL WHERE id = $1',
    [konusmaId, acik && eski > yeni ? k.devir_sebep : sebep]);
  return true;
}

// Gelen mesaj + botun kararı → devir sebebi (en güçlüsü)
function sebepBul({ metin, durum, arama }) {
  if (arama) return 'arama';
  if (durum === 'sicak') return 'sicak';
  if (FIYAT.test(String(metin || ''))) return 'fiyat';
  if (durum === 'olumlu') return 'olumlu';
  return null;
}

// Venüs demosu açıldı (randevu sayfası yüklendi) → o adayın konuşması
async function demoAcildi(isletmeId) {
  const k = (await pool.query(`
    SELECT k.id FROM isletmeler i JOIN satis_konusmalar k ON k.lead_id = i.demo_lead_id
    WHERE i.id = $1 AND i.demo = true ORDER BY k.id DESC LIMIT 1`, [isletmeId])).rows[0];
  return k ? devret(k.id, 'demo') : false;
}

// Konuşma kaydından son müşteri cümleleri: aramadan önce 5 saniyede okunacak not
function aramaNotu(gelen = '', adet = 3) {
  const satirlar = String(gelen).split('\n').map(s => s.match(/\]\s*Müşteri:\s*(.*)$/)?.[1]).filter(Boolean);
  return satirlar.slice(-adet).map(s => s.slice(0, 160));
}

async function liste(limit = 30) {
  const r = await pool.query(`
    SELECT k.id, k.telefon, k.isletme_adi, k.kategori, k.durum, k.devir_sebep, k.devir_zamani, k.lead_id, k.gelen_mesajlar,
      p.puan, p.ilce, p.demo_isletme_id
    FROM satis_konusmalar k LEFT JOIN potansiyel_musteriler p ON p.id = k.lead_id
    WHERE k.devir_sebep IS NOT NULL AND k.devir_kapandi IS NULL AND k.kayit_isletme_id IS NULL
      AND COALESCE(k.durum, '') NOT IN ('olumsuz', 'musteri') AND (k.devir_ertele IS NULL OR k.devir_ertele <= NOW())
    ORDER BY CASE k.devir_sebep WHEN 'arama' THEN 5 WHEN 'sicak' THEN 4 WHEN 'fiyat' THEN 3 WHEN 'demo' THEN 2 ELSE 1 END DESC,
      k.devir_zamani DESC
    LIMIT $1`, [limit]);
  return r.rows.map(({ gelen_mesajlar, ...x }) => ({ ...x, sebep_ad: SEBEP_AD[x.devir_sebep], not: aramaNotu(gelen_mesajlar) }));
}

module.exports = { devret, sebepBul, demoAcildi, aramaNotu, liste, SEBEP_AD, ONCELIK };
