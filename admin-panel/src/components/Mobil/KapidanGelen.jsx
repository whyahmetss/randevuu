import { useState, useEffect } from 'react';

// Kapıdan gelen / telefonla arayan müşteri: hizmete dokun, istersen ad ve numara yaz, kaydet.
// Saat verilmezse "şimdi". Telefon ve tablet ekranı ortak kullanır.
export default function KapidanGelen({ api, saat, tarih, calisanId, kapat, eklendi, buyuk }) {
  const [hizmetler, setHizmetler] = useState([]);
  const [secili, setSecili] = useState(null);
  const [isim, setIsim] = useState('');
  const [tel, setTel] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState(null);
  useEffect(() => { api.get('/hizmetler').then(d => { const l = (d?.hizmetler || []).filter(h => h.aktif !== false); setHizmetler(l); if (l.length === 1) setSecili(l[0].id); }).catch(() => {}); }, []);

  const kaydet = async () => {
    setBekle(true); setHata(null);
    const r = await api.post('/randevular/elle', { hizmet_id: secili, musteri_isim: isim, musteri_telefon: tel, saat, tarih, calisan_id: calisanId });
    setBekle(false);
    if (r?.hata) return setHata(r.hata);
    eklendi?.(); kapat();
  };

  const fs = buyuk ? 20 : 17;
  return (
    <div role="dialog" aria-modal="true" aria-label="Randevu ekle" onClick={kapat}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: buyuk ? 640 : 520, background: 'var(--surface)', borderRadius: '22px 22px 0 0',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: fs + 4, fontWeight: 800 }}>{saat ? `${saat} için randevu` : 'Kapıdan gelen müşteri'}</div>
          <button onClick={kapat} aria-label="Kapat" style={{ width: 44, height: 44, border: 'none', background: 'var(--bg)', borderRadius: 12, fontSize: 20, cursor: 'pointer', color: 'var(--text)' }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Hizmet</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {hizmetler.map(h => (
            <button key={h.id} onClick={() => setSecili(h.id)} style={{ minHeight: 52, padding: '0 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: fs - 1, fontWeight: 700,
              border: `2px solid ${secili === h.id ? '#1f6f4a' : 'var(--border)'}`, background: secili === h.id ? 'rgba(31,111,74,.1)' : 'var(--surface)', color: secili === h.id ? '#1f6f4a' : 'var(--text)' }}>
              {h.isim}{Number(h.fiyat) > 0 ? ` · ${Number(h.fiyat)}₺` : ''}
            </button>
          ))}
          {hizmetler.length === 0 && <div style={{ fontSize: 15, color: 'var(--dim)' }}>Önce Dükkanım → Hizmetler'den hizmet ekleyin.</div>}
        </div>
        <label style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Ad (isteğe bağlı)
          <input value={isim} onChange={e => setIsim(e.target.value)} placeholder="Müşterinin adı" className="input" style={{ width: '100%', height: 52, fontSize: fs, marginTop: 6, borderRadius: 12 }} />
        </label>
        <label style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Telefon (isteğe bağlı — hatırlatma gitsin)
          <input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" className="input" style={{ width: '100%', height: 52, fontSize: fs, marginTop: 6, borderRadius: 12 }} />
        </label>
        {hata && <div style={{ color: '#b42318', fontSize: 14, fontWeight: 600 }}>{hata}</div>}
        <button onClick={kaydet} disabled={!secili || bekle} style={{ height: 58, border: 'none', borderRadius: 16, background: secili ? '#1f6f4a' : '#9bb9a8', color: '#fff', fontSize: fs + 1, fontWeight: 800, fontFamily: 'inherit', cursor: secili ? 'pointer' : 'default' }}>
          {bekle ? 'Kaydediliyor…' : saat ? 'Randevuyu kaydet' : 'Şimdi başlat'}
        </button>
      </div>
    </div>
  );
}
