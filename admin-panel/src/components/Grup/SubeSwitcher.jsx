import { useEffect, useRef, useState } from 'react';

// Top bar'da görünen şube seçici. Sadece rol='grup_sahibi' için kullanılır.
// Props: { api, onDegis(sube), onGrupYonetim() }
export default function SubeSwitcher({ api, onDegis, onGrupYonetim }) {
  const [subeler, setSubeler] = useState([]);
  const [aktifId, setAktifId] = useState(() => {
    const v = localStorage.getItem('aktifIsletme');
    return v ? parseInt(v, 10) : null;
  });
  const [acik, setAcik] = useState(false);
  const ref = useRef();

  useEffect(() => { yukle(); }, []);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setAcik(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  async function yukle() {
    const d = await api.get('/grup/subeler');
    if (d.subeler) {
      setSubeler(d.subeler);
      if (!aktifId && d.subeler.length > 0) {
        const ilk = d.subeler[0].id;
        setAktifId(ilk);
        localStorage.setItem('aktifIsletme', String(ilk));
      }
    }
  }

  function sec(s) {
    setAktifId(s.id);
    localStorage.setItem('aktifIsletme', String(s.id));
    setAcik(false);
    if (onDegis) onDegis(s);
    // Header değişti — tüm istekler yeniden yapılsın
    window.location.reload();
  }

  const aktif = subeler.find(s => s.id === aktifId);
  if (subeler.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button onClick={() => setAcik(!acik)} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
        background: 'linear-gradient(90deg, rgba(59,130,246,0.15), rgba(139,92,246,0.15))',
        border: '1px solid rgba(139,92,246,0.4)', borderRadius: 8,
        color: '#fff', cursor: 'pointer', fontWeight: 600
      }}>
        🏢 {aktif ? (aktif.sube_etiketi || aktif.isim) : 'Şube Seç'} <span style={{ fontSize: 10 }}>▼</span>
      </button>
      {acik && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 6, minWidth: 240,
          background: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 999, overflow: 'hidden'
        }}>
          {subeler.map(s => (
            <button key={s.id} onClick={() => sec(s)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: 12,
              background: s.id === aktifId ? 'rgba(139,92,246,0.15)' : 'transparent',
              color: '#fff', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid #2a2a3e'
            }}>
              <div style={{ fontWeight: 600 }}>{s.isim}</div>
              {s.sube_etiketi && <div style={{ fontSize: 12, color: '#8B5CF6' }}>{s.sube_etiketi}</div>}
              {s.sehir && <div style={{ fontSize: 11, color: '#888' }}>{s.sehir}</div>}
            </button>
          ))}
          <button onClick={() => { setAcik(false); onGrupYonetim && onGrupYonetim(); }} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: 12,
            background: '#0f0f1e', color: '#8B5CF6', border: 'none', cursor: 'pointer', fontWeight: 600
          }}>⚙ Grup Yönetimi</button>
        </div>
      )}
    </div>
  );
}
