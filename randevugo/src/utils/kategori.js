// Avcı kategorileri (2026-10-14, tasarım raporu): Google'ın verdiği alt kategoriler ("Saç Kesim", "Erkek Kuaförü",
// "Beauty Center"…) kampanyaların ana kategorileriyle birebir eşleşmediği için ~7.500 aday kampanya dışında kalıyordu.
// Kayıtta ana kategoriye çevrilir; aynı eşleme 042 migration'ında mevcut kayıtlara da uygulanır.
const ESLEME = {
  'saç kesim': 'Berber', 'sac kesim': 'Berber', 'erkek kuaförü': 'Berber', 'erkek kuaforu': 'Berber', 'barber': 'Berber', 'barber shop': 'Berber',
  'beauty center': 'Güzellik Salonu', 'güzellik merkezi': 'Güzellik Salonu', 'guzellik merkezi': 'Güzellik Salonu', 'beauty salon': 'Güzellik Salonu',
  'bayan kuaförü': 'Kuaför', 'bayan kuaforu': 'Kuaför', 'kuaför salonu': 'Kuaför', 'kuafor salonu': 'Kuaför', 'hair salon': 'Kuaför',
  'diş hekimi': 'Diş Kliniği', 'dis hekimi': 'Diş Kliniği', 'dentist': 'Diş Kliniği',
  'tattoo': 'Dövme', 'tattoo shop': 'Dövme', 'dövme stüdyosu': 'Dövme',
};

function kategoriNormalize(k) {
  if (!k) return k;
  return ESLEME[String(k).trim().toLocaleLowerCase('tr')] || k;
}

module.exports = { kategoriNormalize, ESLEME };
