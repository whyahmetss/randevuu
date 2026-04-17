// Kategori -> Google Maps arama sinonim varyantları
// Query fanout için kullanılır; her sinonim ayrı sorgu olarak gönderilir.

const SINONIMLER = {
  'berber': ['berber', 'erkek kuaförü', 'saç kesim'],
  'kuaför': ['kuaför', 'bayan kuaförü', 'kuaför salonu'],
  'güzellik salonu': ['güzellik salonu', 'güzellik merkezi', 'beauty center'],
  'güzellik': ['güzellik salonu', 'güzellik merkezi', 'estetik'],
  'dövme': ['dövme', 'tattoo', 'dövme stüdyosu'],
  'diş kliniği': ['diş kliniği', 'diş hekimi', 'ağız ve diş sağlığı'],
  'dişçi': ['dişçi', 'diş hekimi', 'diş kliniği'],
  'veteriner': ['veteriner', 'veteriner kliniği', 'pet kliniği'],
  'spa': ['spa', 'masaj salonu', 'wellness'],
  'diyetisyen': ['diyetisyen', 'beslenme uzmanı', 'diyet kliniği'],
  'tırnak': ['tırnak bakımı', 'nail art', 'manikür pedikür'],
  'cilt bakım': ['cilt bakımı', 'estetisyen', 'skincare'],
  'psikolog': ['psikolog', 'psikoterapi', 'danışmanlık merkezi'],
  'fizyoterapi': ['fizyoterapi', 'fizik tedavi', 'rehabilitasyon merkezi'],
  'kaşıkçı': ['restoran', 'lokanta', 'yemek'],
  'masaj': ['masaj salonu', 'masöz', 'spa masaj'],
};

// Kategori için sinonim dizisi döndür. Tanımlı değilse kendisini döndürür.
function sinonimleriGetir(kategori) {
  if (!kategori) return [];
  const key = String(kategori).toLowerCase().trim();
  if (SINONIMLER[key]) return SINONIMLER[key];
  // Kısmi eşleşme (örn "güzellik merkezi" → "güzellik")
  for (const k of Object.keys(SINONIMLER)) {
    if (key.includes(k) || k.includes(key)) return SINONIMLER[k];
  }
  return [kategori]; // Tanımlı değil — tek sorgu olarak kullan
}

module.exports = { SINONIMLER, sinonimleriGetir };
