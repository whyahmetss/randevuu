import { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import PrimRaporu from './PrimRaporu';

const gelirKategoriler = ['hizmet', 'urun', 'diger'];
const giderKategoriler = ['kira', 'malzeme', 'personel', 'fatura', 'diger'];
const odemeYontemleri = ['nakit', 'kredi_karti', 'havale'];

export default function Kasa({ api }) {
  const [hareketler, setHareketler] = useState([]);
  const [ozet, setOzet] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [modal, setModal] = useState(null); // { tip: 'gelir'|'gider' }
  const [filtre, setFiltre] = useState({ baslangic: '', bitis: '', tip: '' });
  const [tab, setTab] = useState('kasa'); // 'kasa' | 'prim'

  // Form
  const [form, setForm] = useState({ tip: 'gelir', tutar: '', aciklama: '', kategori: 'hizmet', odeme_yontemi: 'nakit', tarih: new Date().toISOString().slice(0, 10) });

  const yukle = async () => {
    setYukleniyor(true);
    const params = new URLSearchParams();
    if (filtre.baslangic) params.set('baslangic', filtre.baslangic);
    if (filtre.bitis) params.set('bitis', filtre.bitis);
    if (filtre.tip) params.set('tip', filtre.tip);
    const [liste, oz] = await Promise.all([
      api.get(`/kasa?${params}`),
      api.get('/kasa/ozet')
    ]);
    setHareketler(liste?.hareketler || []);
    setOzet(oz);
    setYukleniyor(false);
  };

  useEffect(() => { yukle(); }, [filtre]);

  const kaydet = async () => {
    if (!form.tutar || parseFloat(form.tutar) <= 0) return;
    await api.post('/kasa', form);
    setModal(null);
    setForm({ tip: 'gelir', tutar: '', aciklama: '', kategori: 'hizmet', odeme_yontemi: 'nakit', tarih: new Date().toISOString().slice(0, 10) });
    yukle();
  };

  const sil = async (id) => {
    if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
    await api.del(`/kasa/${id}`);
    yukle();
  };

  const modalAc = (tip) => {
    setForm({ ...form, tip, kategori: tip === 'gelir' ? 'hizmet' : 'kira', tutar: '', aciklama: '' });
    setModal({ tip });
  };

  // Grafik verisi
  const grafikData = () => {
    if (!ozet?.gunlukGrafik) return null;
    const labels = [];
    const gelirler = [];
    const giderler = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const str = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric' }));
      const g = ozet.gunlukGrafik.filter(r => r.tarih?.slice?.(0,10) === str || (r.tarih instanceof Date ? r.tarih.toISOString().slice(0,10) : String(r.tarih).slice(0,10)) === str);
      gelirler.push(g.find(r => r.tip === 'gelir')?.toplam || 0);
      giderler.push(g.find(r => r.tip === 'gider')?.toplam || 0);
    }
    return {
      labels,
      datasets: [
        { label: 'Gelir', data: gelirler, backgroundColor: 'rgba(34,197,94,.7)', borderRadius: 6 },
        { label: 'Gider', data: giderler, backgroundColor: 'rgba(239,68,68,.6)', borderRadius: 6 },
      ]
    };
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    statCard: (color) => ({
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }),
  };

  const para = (n) => parseFloat(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['kasa', '💰 Kasa'], ['prim', '🏆 Prim Raporu']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, linear-gradient(135deg,#54E097,#2cb872))' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'prim' && <PrimRaporu api={api} />}

      {tab === 'kasa' && (<>
      {/* Özet kartları */}
      {ozet && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }} className="settings-grid-3">
          {[
            { label: "Bugün Gelir", val: ozet.bugun.gelir, color: "#22c55e", icon: "📈" },
            { label: "Bugün Gider", val: ozet.bugun.gider, color: "#ef4444", icon: "📉" },
            { label: "Bugün Net", val: ozet.bugun.gelir - ozet.bugun.gider, color: (ozet.bugun.gelir - ozet.bugun.gider) >= 0 ? "#22c55e" : "#ef4444", icon: "💰" },
            { label: "Bu Ay Gelir", val: ozet.ay.gelir, color: "#3b82f6", icon: "📊" },
          ].map((s, i) => (
            <div key={i} style={S.statCard(s.color)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{para(s.val)}₺</div>
            </div>
          ))}
        </div>
      )}

      {/* Butonlar + Filtre */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => modalAc('gelir')} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)',
          color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
        }}>+ Gelir Ekle</button>
        <button onClick={() => modalAc('gider')} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#ef4444,#dc2626)',
          color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
        }}>+ Gider Ekle</button>
        <div style={{ flex: 1 }} />
        <input type="date" value={filtre.baslangic} onChange={e => setFiltre({...filtre, baslangic: e.target.value})} className="input" style={{ width: 140, fontSize: 12 }} />
        <input type="date" value={filtre.bitis} onChange={e => setFiltre({...filtre, bitis: e.target.value})} className="input" style={{ width: 140, fontSize: 12 }} />
        <select value={filtre.tip} onChange={e => setFiltre({...filtre, tip: e.target.value})} className="input" style={{ width: 120, fontSize: 12 }}>
          <option value="">Tümü</option>
          <option value="gelir">Gelir</option>
          <option value="gider">Gider</option>
        </select>
      </div>

      {/* Grafik + Liste yan yana */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }} className="settings-grid-2">
        {/* Grafik */}
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Son 7 Gün</div>
          {grafikData() ? (
            <Bar data={grafikData()} options={{
              responsive: true, plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
              scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } } }, x: { ticks: { font: { size: 11 } } } }
            }} height={200} />
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Veri yok</div>
          )}
        </div>

        {/* Ay/Hafta özet */}
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Dönem Raporu</div>
          {ozet && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Bu Hafta', gelir: ozet.hafta.gelir, gider: ozet.hafta.gider },
                { label: 'Bu Ay', gelir: ozet.ay.gelir, gider: ozet.ay.gider },
              ].map((d, i) => (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.4px' }}>{d.label}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div><div style={{ fontSize: 11, color: 'var(--dim)' }}>Gelir</div><div style={{ fontSize: 16, fontWeight: 800, color: '#22c55e' }}>{para(d.gelir)}₺</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--dim)' }}>Gider</div><div style={{ fontSize: 16, fontWeight: 800, color: '#ef4444' }}>{para(d.gider)}₺</div></div>
                    <div><div style={{ fontSize: 11, color: 'var(--dim)' }}>Net</div><div style={{ fontSize: 16, fontWeight: 800, color: (d.gelir - d.gider) >= 0 ? '#22c55e' : '#ef4444' }}>{para(d.gelir - d.gider)}₺</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Hareketler listesi */}
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Kasa Hareketleri</div>
        {yukleniyor ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>Yükleniyor...</div>
        ) : hareketler.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz kayıt yok</div>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Tarih', 'Tür', 'Açıklama', 'Kategori', 'Ödeme', 'Tutar', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hareketler.map(h => (
                  <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: h.tip === 'gelir' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                        color: h.tip === 'gelir' ? '#22c55e' : '#ef4444'
                      }}>{h.tip === 'gelir' ? 'Gelir' : 'Gider'}</span>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.aciklama || '—'}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--dim)' }}>{h.kategori}</td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--dim)' }}>{h.odeme_yontemi === 'kredi_karti' ? 'Kredi Kartı' : h.odeme_yontemi === 'havale' ? 'Havale' : 'Nakit'}</td>
                    <td style={{ padding: '10px 12px', fontWeight: 800, color: h.tip === 'gelir' ? '#22c55e' : '#ef4444' }}>
                      {h.tip === 'gelir' ? '+' : '-'}{para(h.tutar)}₺
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {!h.randevu_id && (
                        <button onClick={() => sil(h.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>✕</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      </>)}

      {/* Modal */}
      {modal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null); }}>
          <div style={{ ...S.card, width: 400, maxWidth: '90vw' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 16 }}>
              {modal.tip === 'gelir' ? '📈 Gelir Ekle' : '📉 Gider Ekle'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tutar (₺) *</label>
                <input type="number" min="0" step="0.01" value={form.tutar} onChange={e => setForm({...form, tutar: e.target.value})} className="input" placeholder="0.00" style={{ fontSize: 18, fontWeight: 800 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Açıklama</label>
                <input value={form.aciklama} onChange={e => setForm({...form, aciklama: e.target.value})} className="input" placeholder="Ürün satışı, kira vb." />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Kategori</label>
                  <select value={form.kategori} onChange={e => setForm({...form, kategori: e.target.value})} className="input" style={{ width: '100%' }}>
                    {(modal.tip === 'gelir' ? gelirKategoriler : giderKategoriler).map(k => (
                      <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Ödeme Yöntemi</label>
                  <select value={form.odeme_yontemi} onChange={e => setForm({...form, odeme_yontemi: e.target.value})} className="input" style={{ width: '100%' }}>
                    {odemeYontemleri.map(o => (
                      <option key={o} value={o}>{o === 'kredi_karti' ? 'Kredi Kartı' : o === 'havale' ? 'Havale' : 'Nakit'}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Tarih</label>
                <input type="date" value={form.tarih} onChange={e => setForm({...form, tarih: e.target.value})} className="input" />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setModal(null)} style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
                }}>İptal</button>
                <button onClick={kaydet} style={{
                  flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                  background: modal.tip === 'gelir' ? 'linear-gradient(135deg,#22c55e,#16a34a)' : 'linear-gradient(135deg,#ef4444,#dc2626)',
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
                }}>Kaydet</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
