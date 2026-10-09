// Satış ekranlarının ortak parçaları (Satış Masası, Satış Rehberi, Ekip Takip)
export const RENK = { yesil: '#1f6f4a', mor: '#5d4bb5', amber: '#a8590c', kirmizi: '#b42318', mavi: '#2f56c6', gri: '#6f6a62', wa: '#25d366' };

export const kart = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px' };

export const dugme = (renk, dolu) => ({
  padding: '7px 12px', borderRadius: 9, border: dolu ? 'none' : '1px solid var(--border)', cursor: 'pointer',
  background: dolu ? renk : 'var(--surface)', color: dolu ? '#fff' : (renk || 'var(--text)'), fontWeight: 600, fontSize: 12,
  textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', fontFamily: 'inherit',
});

export const sekmeStil = (aktif) => ({
  padding: '10px 14px', border: 'none', borderBottom: `2px solid ${aktif ? RENK.yesil : 'transparent'}`, marginBottom: -1,
  background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: aktif ? 700 : 500,
  color: aktif ? 'var(--text)' : 'var(--dim)', whiteSpace: 'nowrap',
});

export const waTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '9' + d; if (d.length === 10) d = '90' + d; return d; };
export const ilkMesaj = (ad) => `Merhaba, ${ad} ile mi görüşüyorum?`;

export const SONUC = {
  arama_yok: { ad: 'Ulaşılamadı', renk: RENK.gri },
  gorustu: { ad: 'Görüştü', renk: RENK.mavi },
  ilgilenmiyor: { ad: 'İlgilenmiyor', renk: RENK.kirmizi },
  ilgileniyor: { ad: 'İlgileniyor', renk: RENK.amber },
  demo: { ad: 'Demo gönderildi', renk: RENK.mor },
  kurulum: { ad: 'Bağlandı ✓', renk: RENK.yesil },
  not: { ad: 'Not', renk: RENK.gri },
};

export const zamanOnce = (t) => {
  if (!t) return '—';
  const dk = Math.round((Date.now() - new Date(t).getTime()) / 60000);
  if (dk < 1) return 'şimdi';
  if (dk < 60) return `${dk} dk önce`;
  if (dk < 60 * 24) return `${Math.round(dk / 60)} sa önce`;
  return `${Math.round(dk / 1440)} gün önce`;
};

export const saatTarih = (t) => t ? new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
