// Bayi ekranlarının ortak parçaları (bayinin kendi paneli + yönetim sayfası)
export const tl = (n) => `${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('tr-TR')}₺`;
export const tarih = (t) => (t ? new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const DURUM = {
  oduyor: { ad: 'Ödüyor', renk: '#1f6f4a' },
  denemede: { ad: 'Denemede', renk: '#2f56c6' },
  deneme_bitti: { ad: 'Deneme bitti, ödemedi', renk: '#a8590c' },
  odemesi_bitti: { ad: 'Ödemesi bitti', renk: '#a8590c' },
  kapandi: { ad: 'Kapandı', renk: '#6f6a62' },
};
