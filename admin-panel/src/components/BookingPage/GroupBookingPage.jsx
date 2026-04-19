import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

// Grup landing sayfası: /g/:slug
// Şube kartları → tıkla → /book/:sube_slug
export default function GroupBookingPage({ slug }) {
  const [data, setData] = useState(null);
  const [hata, setHata] = useState('');

  useEffect(() => {
    fetch(`${API_URL}/api/book/grup/${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(d => { if (d.hata) setHata(d.hata); else setData(d); })
      .catch(() => setHata('Bağlantı hatası'));
  }, [slug]);

  if (hata) return <div style={wrapBos}><h2>😕 {hata}</h2></div>;
  if (!data) return <div style={wrapBos}>Yükleniyor...</div>;

  const { grup, subeler } = data;
  const tema = grup.renk_tema || '#8B5CF6';

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a1a', color: '#fff', padding: '40px 20px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          {grup.logo && <img src={grup.logo} alt={grup.isim} style={{ maxWidth: 120, maxHeight: 120, borderRadius: 20, marginBottom: 16 }} />}
          <h1 style={{ margin: 0, fontSize: 32, background: `linear-gradient(90deg, ${tema}, #3B82F6)`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            {grup.isim}
          </h1>
          {grup.tanitim && <p style={{ color: '#aaa', marginTop: 12, fontSize: 15 }}>{grup.tanitim}</p>}
        </div>

        <h3 style={{ color: '#ccc', marginBottom: 16 }}>📍 Şubelerimiz</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {subeler.map(s => (
            <a key={s.slug} href={`/book/${s.slug}`} style={kartLink}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>
                {s.isim} {s.sube_etiketi && <span style={{ color: tema, fontSize: 13 }}>• {s.sube_etiketi}</span>}
              </div>
              {(s.sehir || s.ilce) && <div style={{ color: '#888', fontSize: 13, marginTop: 6 }}>
                📍 {s.ilce ? `${s.ilce}, ` : ''}{s.sehir}
              </div>}
              {s.adres && <div style={{ color: '#666', fontSize: 12, marginTop: 4 }}>{s.adres}</div>}
              <div style={{ marginTop: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: s.bugun_acik ? '#6f6' : '#f66' }}>
                  {s.bugun_acik ? `🟢 Bugün ${s.calisma || 'Açık'}` : '⚪ Bugün Kapalı'}
                </span>
                <span style={{ color: tema, fontWeight: 600 }}>Randevu Al →</span>
              </div>
            </a>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 48, color: '#666', fontSize: 13 }}>
          🚀 SıraGO ile güçlendirilmiştir
        </div>
      </div>
    </div>
  );
}

const wrapBos = { minHeight: '100vh', background: '#0a0a1a', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const kartLink = {
  display: 'block', padding: 18, background: 'linear-gradient(135deg, #1a1a2e, #1f1f35)',
  border: '1px solid #2a2a3e', borderRadius: 12, textDecoration: 'none', color: '#fff',
  transition: 'transform 0.15s, border-color 0.15s', cursor: 'pointer'
};
