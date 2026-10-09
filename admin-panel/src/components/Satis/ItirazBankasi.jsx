import { useState, useEffect } from 'react';
import { kart, dugme, RENK } from './ortak';

// İtiraz bankası: arama sırasında hızlı arama ("pahalı" yaz → cevabı gör). Herkes ekler, patron düzeltir/siler.
export default function ItirazBankasi({ api, patron, kompakt }) {
  const [liste, setListe] = useState([]);
  const [ara, setAra] = useState('');
  const [yeni, setYeni] = useState(null);          // { itiraz, cevap } ekleme formu
  const [duzen, setDuzen] = useState(null);        // { id, itiraz, cevap }
  const [mesaj, setMesaj] = useState(null);

  const yukle = () => api.get('/admin/masa/itirazlar').then(d => setListe(d.itirazlar || [])).catch(() => {});
  useEffect(() => { yukle(); }, []);

  const sade = (s) => String(s || '').toLocaleLowerCase('tr-TR');
  const gorunen = ara.trim() ? liste.filter(x => sade(x.itiraz + ' ' + x.cevap).includes(sade(ara.trim()))) : liste;

  const kaydet = async () => {
    const r = await api.post('/admin/masa/itirazlar', yeni);
    if (r?.hata) return setMesaj(r.hata);
    setYeni(null); setMesaj('Eklendi, herkes görüyor.'); yukle();
  };
  const guncelle = async () => {
    const r = await api.put(`/admin/masa/itiraz/${duzen.id}`, duzen);
    if (r?.hata) return setMesaj(r.hata);
    setDuzen(null); yukle();
  };
  const sil = async (id) => { if (!confirm('Bu itiraz silinsin mi?')) return; await api.del(`/admin/masa/itiraz/${id}`); yukle(); };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input value={ara} onChange={e => setAra(e.target.value)} placeholder='Esnaf ne dedi? ("pahalı", "yaşlı", "program")' className="input"
          style={{ flex: '1 1 220px', borderRadius: 10, fontSize: 13 }} />
        {!yeni && <button onClick={() => setYeni({ itiraz: '', cevap: '' })} style={dugme(RENK.yesil, true)}>＋ Yeni itiraz</button>}
      </div>
      {mesaj && <div style={{ fontSize: 12, color: RENK.yesil, marginBottom: 8 }}>{mesaj}</div>}
      {yeni && (
        <div style={{ ...kart, padding: 14, marginBottom: 12 }}>
          <input value={yeni.itiraz} onChange={e => setYeni({ ...yeni, itiraz: e.target.value })} placeholder="Esnafın söylediği" className="input" style={{ width: '100%', marginBottom: 8, borderRadius: 10 }} />
          <textarea value={yeni.cevap} onChange={e => setYeni({ ...yeni, cevap: e.target.value })} placeholder="İşe yarayan cevap" className="input" rows={3} style={{ width: '100%', marginBottom: 8, borderRadius: 10, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={kaydet} style={dugme(RENK.yesil, true)}>Kaydet</button>
            <button onClick={() => setYeni(null)} style={dugme(RENK.gri)}>Vazgeç</button>
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 8, maxHeight: kompakt ? 420 : 'none', overflowY: kompakt ? 'auto' : 'visible' }}>
        {gorunen.map(x => duzen?.id === x.id ? (
          <div key={x.id} style={{ ...kart, padding: 14 }}>
            <input value={duzen.itiraz} onChange={e => setDuzen({ ...duzen, itiraz: e.target.value })} className="input" style={{ width: '100%', marginBottom: 8, borderRadius: 10 }} />
            <textarea value={duzen.cevap} onChange={e => setDuzen({ ...duzen, cevap: e.target.value })} className="input" rows={3} style={{ width: '100%', marginBottom: 8, borderRadius: 10 }} />
            <div style={{ display: 'flex', gap: 6 }}><button onClick={guncelle} style={dugme(RENK.yesil, true)}>Kaydet</button><button onClick={() => setDuzen(null)} style={dugme(RENK.gri)}>Vazgeç</button></div>
          </div>
        ) : (
          <div key={x.id} style={{ ...kart, padding: '12px 14px' }}
            onClick={() => api.post(`/admin/masa/itirazlar-kullan/${x.id}`, {}).catch(() => {})}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>“{x.itiraz}”</div>
            <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 4, lineHeight: 1.5 }}>→ {x.cevap}</div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6, fontSize: 11, color: 'var(--dim)' }}>
              {x.ekleyen && <span>ekleyen: {x.ekleyen}</span>}
              {patron && <><button onClick={(e) => { e.stopPropagation(); setDuzen({ id: x.id, itiraz: x.itiraz, cevap: x.cevap }); }} style={{ ...dugme(RENK.mavi), padding: '3px 8px', fontSize: 11 }}>Düzelt</button>
                <button onClick={(e) => { e.stopPropagation(); sil(x.id); }} style={{ ...dugme(RENK.kirmizi), padding: '3px 8px', fontSize: 11 }}>Sil</button></>}
            </div>
          </div>
        ))}
        {gorunen.length === 0 && <div style={{ fontSize: 13, color: 'var(--dim)', padding: 12 }}>Eşleşen itiraz yok. Sahada duyduysan "Yeni itiraz" ile ekle.</div>}
      </div>
    </div>
  );
}
