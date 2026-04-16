// Kullanıcıdan gelen metni "2000-MM-DD" DATE string'ine çevirir. Yıl sabit (2000) — biz sadece ay/gün saklarız.
// Desteklenen formatlar: "15 Mayıs", "15.05", "5.1", "15/05", "15-05", "15 mayis"

const AY_MAP = {
  'ocak': 1, 'oca': 1,
  'şubat': 2, 'subat': 2, 'şub': 2, 'sub': 2,
  'mart': 3, 'mar': 3,
  'nisan': 4, 'nis': 4,
  'mayıs': 5, 'mayis': 5, 'may': 5,
  'haziran': 6, 'haz': 6,
  'temmuz': 7, 'tem': 7,
  'ağustos': 8, 'agustos': 8, 'ağu': 8, 'agu': 8,
  'eylül': 9, 'eylul': 9, 'eyl': 9,
  'ekim': 10, 'eki': 10,
  'kasım': 11, 'kasim': 11, 'kas': 11,
  'aralık': 12, 'aralik': 12, 'ara': 12
};

function parseDogumTarihi(metin) {
  if (!metin || typeof metin !== 'string') return null;
  const t = metin.trim().toLowerCase().replace(/\s+/g, ' ');

  // Format 1: "15 Mayıs" veya "15 may" — Gün + AyAdı
  const ayAdMatch = t.match(/(\d{1,2})\s+([a-zçğıöşü]+)/);
  if (ayAdMatch) {
    const gun = parseInt(ayAdMatch[1]);
    const ayStr = ayAdMatch[2];
    const ay = AY_MAP[ayStr] || Object.entries(AY_MAP).find(([k]) => ayStr.startsWith(k))?.[1];
    if (ay && gun >= 1 && gun <= 31) {
      return `2000-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
    }
  }

  // Format 2: "15.05" / "15/05" / "15-05" / "5.1"
  const numMatch = t.match(/^(\d{1,2})[.\/\-](\d{1,2})(?:[.\/\-]\d{2,4})?$/);
  if (numMatch) {
    const gun = parseInt(numMatch[1]);
    const ay = parseInt(numMatch[2]);
    if (gun >= 1 && gun <= 31 && ay >= 1 && ay <= 12) {
      return `2000-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
    }
  }

  // Format 3: Ters sıralı "Mayıs 15"
  const ayAdTersMatch = t.match(/([a-zçğıöşü]+)\s+(\d{1,2})/);
  if (ayAdTersMatch) {
    const ayStr = ayAdTersMatch[1];
    const gun = parseInt(ayAdTersMatch[2]);
    const ay = AY_MAP[ayStr] || Object.entries(AY_MAP).find(([k]) => ayStr.startsWith(k))?.[1];
    if (ay && gun >= 1 && gun <= 31) {
      return `2000-${String(ay).padStart(2, '0')}-${String(gun).padStart(2, '0')}`;
    }
  }

  return null;
}

// DATE string -> "15 Mayıs" insan okunur formatı
function formatDogumTarihi(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const aylar = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
  return `${d.getDate()} ${aylar[d.getMonth()]}`;
}

module.exports = { parseDogumTarihi, formatDogumTarihi };
