// Platform yönetimi sayfalarının ortak parçaları (2026-10-15)
import { API_URL } from '../../lib/config';

// Oturumlu dosya indirme (KVKK dışa aktarma): fetch + blob, giriş anahtarı URL'ye konmaz
export async function dosyaIndir(yol, varsayilanAd) {
  const token = sessionStorage.getItem('randevugo_imp_token') || localStorage.getItem('randevugo_token');
  const aktif = localStorage.getItem('aktifIsletme');
  const res = await fetch(`${API_URL}${yol}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(aktif ? { 'X-Aktif-Isletme': aktif } : {}) },
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.hata || `İndirilemedi (${res.status})`);
  }
  const ad = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || varsayilanAd;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = ad; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const zaman = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

export function SayfaBaslik({ baslik, aciklama, children }) {
  return (
    <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div><h1>{baslik}</h1>{aciklama && <p>{aciklama}</p>}</div>
      {children && <div className="row gap-8" style={{ flexWrap: 'wrap' }}>{children}</div>}
    </div>
  );
}

export function Mesaj({ m }) {
  if (!m) return null;
  const hata = m.tur === 'hata';
  return (
    <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 600,
      background: hata ? 'rgba(180,35,24,.08)' : 'rgba(31,111,74,.08)', color: hata ? '#b42318' : '#1f6f4a' }}>{m.metin}</div>
  );
}

export const etiketStil = { fontSize: 11, color: 'var(--dim)', fontWeight: 600, display: 'block', marginBottom: 4 };
