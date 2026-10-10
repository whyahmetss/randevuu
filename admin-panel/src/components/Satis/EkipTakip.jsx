import { useState, useEffect } from 'react';
import { kart, dugme, RENK, SONUC, zamanOnce } from './ortak';

// Ekip Takip (yalnız patron, kullanıcı kararı 2026-10-10): kim bugün/7 günde/30 günde ne yaptı, kaç işletme
// getirdi, kaçı ödedi, en son ne zaman çalıştı; tıkla → o kişinin aktivite kaydı. Hedef ayarı da burada.
const hucre = { padding: '9px 8px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' };

export default function EkipTakip({ api }) {
  const [d, setD] = useState(null);
  const [aralik, setAralik] = useState('bugun');
  const [secili, setSecili] = useState(null);       // { id, isim }
  const [akt, setAkt] = useState([]);
  const [hedefForm, setHedefForm] = useState(null);

  const yukle = () => api.get('/admin/ekip-takip').then(x => !x?.hata && setD(x)).catch(() => {});
  useEffect(() => { yukle(); }, []);
  useEffect(() => {
    if (!secili) return;
    api.get(`/admin/masa/aktiviteler?kullanici=${secili.id}&gun=7`).then(x => setAkt(x.aktiviteler || [])).catch(() => {});
  }, [secili]);

  const hedefKaydet = async () => {
    const r = await api.put('/admin/masa/hedef', hedefForm);
    if (r?.hata) return alert(r.hata);
    setHedefForm(null); yukle();
  };

  if (!d) return <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>;
  const h = d.hedef;
  const pasifMi = (t) => !t || Date.now() - new Date(t).getTime() > 24 * 3600 * 1000;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Ekip Takip <span style={{ fontSize: 12, color: RENK.amber, fontWeight: 600 }}>👑 yalnız sen görüyorsun</span></h1>
          <p style={{ color: 'var(--dim)', fontSize: 13, margin: '4px 0 0' }}>Kim ne yaptı, kim kaç işletme getirdi, kim en son ne zaman çalıştı.</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['bugun', 'Bugün'], ['hafta', '7 gün'], ['ay', '30 gün']].map(([id, ad]) => <button key={id} onClick={() => setAralik(id)} style={dugme(RENK.yesil, aralik === id)}>{ad}</button>)}
        </div>
      </div>

      <div style={{ ...kart, marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text)' }}>
            🎯 <b>{h.baglanan} / {h.isletme}</b> işletme · son tarih <b>{new Date(h.tarih).toLocaleDateString('tr-TR')}</b> · {h.kalan_gun} gün · takım günde <b style={{ color: RENK.amber }}>{h.takim_gunluk}</b>, kişi başı <b>{h.kisi_gunluk}</b>
          </div>
          {!hedefForm && <button onClick={() => setHedefForm({ isletme: h.isletme, tarih: h.tarih, kisiler: Object.fromEntries(d.uyeler.map(u => [u.id, u.gunluk_hedef ?? ''])) })} style={dugme(RENK.mavi)}>Hedefi düzenle</button>}
        </div>
        {hedefForm && (
          <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              Hedef <input type="number" value={hedefForm.isletme} onChange={e => setHedefForm({ ...hedefForm, isletme: e.target.value })} className="input" style={{ width: 90, borderRadius: 9 }} /> işletme,
              son tarih <input type="date" value={hedefForm.tarih} onChange={e => setHedefForm({ ...hedefForm, tarih: e.target.value })} className="input" style={{ borderRadius: 9 }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>Kişi başı günlük bağlama hedefi (boş = otomatik, kalan güne göre):</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {d.uyeler.map(u => (
                <label key={u.id} style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>{u.isim}
                  <input type="number" min="0" value={hedefForm.kisiler[u.id]} onChange={e => setHedefForm({ ...hedefForm, kisiler: { ...hedefForm.kisiler, [u.id]: e.target.value } })} placeholder={String(h.kisi_gunluk)} className="input" style={{ width: 64, borderRadius: 9 }} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}><button onClick={hedefKaydet} style={dugme(RENK.yesil, true)}>Kaydet</button><button onClick={() => setHedefForm(null)} style={dugme(RENK.gri)}>Vazgeç</button></div>
          </div>
        )}
      </div>

      <div style={{ ...kart, padding: 0, overflowX: 'auto', marginBottom: 14 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
          <thead><tr style={{ color: 'var(--dim)' }}>
            <th style={{ ...hucre, textAlign: 'left' }}>Kişi</th>
            <th style={hucre}>Arama</th><th style={hucre}>Görüşme</th><th style={hucre}>Demo</th>
            <th style={{ ...hucre, color: RENK.yesil }}>Bağladı</th>
            <th style={hucre}>Listesinde</th><th style={hucre}>Getirdiği / ödeyen</th>
            <th style={hucre}>Son çalışma</th><th style={hucre}>Son giriş</th>
          </tr></thead>
          <tbody>
            {d.uyeler.map(u => {
              const s = u[aralik] || {};
              return (
                <tr key={u.id} onClick={() => setSecili({ id: u.id, isim: u.isim })} style={{ cursor: 'pointer', background: secili?.id === u.id ? 'rgba(31,111,74,.06)' : 'transparent' }}>
                  <td style={{ ...hucre, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>{u.patron ? '👑 ' : ''}{u.isim}</td>
                  <td style={hucre}>{s.arama ?? 0}</td><td style={hucre}>{s.gorusme ?? 0}</td><td style={hucre}>{s.demo ?? 0}</td>
                  <td style={{ ...hucre, fontWeight: 700, color: RENK.yesil }}>{s.kurulum ?? 0}</td>
                  <td style={hucre}>{u.listede}</td>
                  <td style={hucre}>{u.getirdigi} / {u.odeyen}</td>
                  <td style={{ ...hucre, color: pasifMi(u.son_aktivite) ? RENK.kirmizi : 'var(--text)' }}>{zamanOnce(u.son_aktivite)}</td>
                  <td style={{ ...hucre, color: 'var(--dim)' }}>{zamanOnce(u.son_giris)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {secili && (
        <div style={{ ...kart, padding: 0 }}>
          <div style={{ padding: '12px 14px', fontWeight: 700, borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>{secili.isim} — son 7 gün ({akt.length} kayıt)</div>
          {akt.length === 0 && <div style={{ padding: 14, color: 'var(--dim)', fontSize: 13 }}>Kayıt yok.</div>}
          {akt.map(x => (
            <div key={x.id} style={{ display: 'flex', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ width: 120, color: 'var(--dim)', fontSize: 12 }}>{new Date(x.olusturma_tarihi).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ fontWeight: 600, color: SONUC[x.tip]?.renk, minWidth: 110 }}>{SONUC[x.tip]?.ad || x.tip}{x.otomatik ? ' (oto)' : ''}</span>
              <span style={{ color: 'var(--text)' }}>{x.isletme_adi || x.isletme_isim || ''}</span>
              {x.notu && <span style={{ color: 'var(--dim)' }}>— {x.notu}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
