// Yeni şube boş açılıyordu (2026-10-26): hizmetler, çalışma saatleri, kategori elle tek tek giriliyordu.
// Merkezden kopyalanır; çalışanlar her salonda farklı kişi olabileceği için yalnız istenirse kopyalanır.
// Kolon listeleri veritabanında gerçekten olanlarla kesiştirilir: eksik kolon yüzünden şube açılışı patlamasın.

// İşletme ayarları: saatler, randevu düzeni, bot üslubu, sayfa görünümü. Kimlik/ödeme/entegrasyon bilgileri kopyalanmaz.
const AYAR_KOLONLARI = [
  'kategori', 'calisma_baslangic', 'calisma_bitis', 'kapali_gunler', 'mola_saatleri', 'randevu_suresi_dk',
  'slot_aralik_dk', 'varsayilan_tampon_dk', 'iptal_sinir_saat', 'hatirlatma_saat', 'onay_timeout_dk',
  'randevu_modu', 'randevu_onay_modu', 'calisan_secim_modu', 'mesai_disi_mod', 'mesai_disi_mesaj',
  'bot_diller', 'bot_konusma_stili', 'bot_tarzi', 'bot_ornek_hizmet', 'calisan_unvani', 'timezone', 'sayfa_tema', 'sayfa_vurgu',
  'kapora_aktif', 'kapora_orani', 'kapora_alt_siniri', 'kapora_iptal_saati',
];
const HIZMET_KOLONLARI = [
  'isim', 'isim_en', 'isim_ar', 'sure_dk', 'fiyat', 'aciklama', 'emoji', 'kategori', 'one_cikan',
  'kapora_yuzdesi', 'tampon_dk', 'seans_sayisi', 'seans_aralik_gun', 'aktif',
];
// telefon kopyalanmaz: aynı numara iki şubede personel girişini/bildirimleri karıştırır
const CALISAN_KOLONLARI = [
  'isim', 'uzmanlik', 'calisma_baslangic', 'calisma_bitis', 'kapali_gunler', 'mola_saatleri', 'prim_yuzdesi', 'aktif',
];

async function mevcutKolonlar(client, tablo, istenen) {
  const r = await client.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1", [tablo]);
  const var_ = new Set(r.rows.map(x => x.column_name));
  return istenen.filter(k => var_.has(k));
}

async function satirlariKopyala(client, tablo, kolonlar, kaynakId, hedefId) {
  if (!kolonlar.length) return new Map();
  const aktifVar = kolonlar.includes('aktif');
  const satirlar = (await client.query(
    `SELECT id, ${kolonlar.join(', ')} FROM ${tablo} WHERE isletme_id = $1${aktifVar ? ' AND aktif IS NOT FALSE' : ''} ORDER BY id`,
    [kaynakId])).rows;
  const yer = kolonlar.map((_, i) => `$${i + 2}`).join(', ');
  const eslesme = new Map(); // eski id → yeni id
  for (const s of satirlar) {
    const yeni = (await client.query(
      `INSERT INTO ${tablo} (isletme_id, ${kolonlar.join(', ')}) VALUES ($1, ${yer}) RETURNING id`,
      [hedefId, ...kolonlar.map(k => (s[k] !== null && typeof s[k] === 'object' && !(s[k] instanceof Date) ? JSON.stringify(s[k]) : s[k]))]
    )).rows[0];
    eslesme.set(s.id, yeni.id);
  }
  return eslesme;
}

// client: açık transaction içindeki bağlantı. Döner: { ayar, hizmet, calisan }
async function subeyeKopyala(client, kaynakId, hedefId, { hizmetler = true, calisanlar = false } = {}) {
  const ayarlar = await mevcutKolonlar(client, 'isletmeler', AYAR_KOLONLARI);
  if (ayarlar.length) {
    await client.query(
      `UPDATE isletmeler SET (${ayarlar.join(', ')}) = (SELECT ${ayarlar.join(', ')} FROM isletmeler WHERE id = $1) WHERE id = $2`,
      [kaynakId, hedefId]);
  }

  const hizmetMap = hizmetler
    ? await satirlariKopyala(client, 'hizmetler', await mevcutKolonlar(client, 'hizmetler', HIZMET_KOLONLARI), kaynakId, hedefId)
    : new Map();
  const calisanMap = calisanlar
    ? await satirlariKopyala(client, 'calisanlar', await mevcutKolonlar(client, 'calisanlar', CALISAN_KOLONLARI), kaynakId, hedefId)
    : new Map();

  // Hangi çalışan hangi hizmeti yapar: ikisi de kopyalandıysa eşleştirme de taşınır
  if (hizmetMap.size && calisanMap.size && (await mevcutKolonlar(client, 'calisan_hizmetler', ['calisan_id'])).length) {
    const ch = (await client.query(
      'SELECT calisan_id, hizmet_id FROM calisan_hizmetler WHERE calisan_id = ANY($1)', [[...calisanMap.keys()]])).rows;
    for (const r of ch) {
      if (!hizmetMap.has(r.hizmet_id)) continue;
      await client.query('INSERT INTO calisan_hizmetler (calisan_id, hizmet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [calisanMap.get(r.calisan_id), hizmetMap.get(r.hizmet_id)]);
    }
  }
  return { ayar: ayarlar.length > 0, hizmet: hizmetMap.size, calisan: calisanMap.size };
}

module.exports = { subeyeKopyala };
