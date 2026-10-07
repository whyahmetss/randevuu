import { useState, useEffect } from 'react';

export default function PrimRaporu({ api }) {
  const [rapor, setRapor] = useState(null);
  const [donem, setDonem] = useState(new Date().toLocaleDateString('sv-SE').slice(0, 7));
  const [yukleniyor, setYukleniyor] = useState(true);

  const yukle = async () => {
    setYukleniyor(true);
    const d = await api.get(`/prim/rapor?donem=${donem}`);
    if (!d.hata) setRapor(d);
    setYukleniyor(false);
  };

  useEffect(() => { yukle(); }, [donem]);

  const primOde = async (r) => {
    if (!confirm(`${r.isim} için ${r.prim_tutari}₺ primi ödendi olarak işaretlensin mi?`)) return;
    await api.post('/prim/ode', {
      calisan_id: r.calisan_id,
      donem: rapor.donem,
      toplam_ciro: r.toplam_ciro,
      prim_yuzdesi: r.prim_yuzdesi,
      prim_tutari: r.prim_tutari
    });
    yukle();
  };

  const para = (n) => parseFloat(n || 0).toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
  };

  // Dönem navigasyonu
  const oncekiAy = () => {
    const d = new Date(donem + '-01');
    d.setMonth(d.getMonth() - 1);
    setDonem(d.toISOString().slice(0, 7));
  };
  const sonrakiAy = () => {
    const d = new Date(donem + '-01');
    d.setMonth(d.getMonth() + 1);
    if (d <= new Date()) setDonem(d.toISOString().slice(0, 7));
  };

  const ayLabel = () => {
    const [y, m] = donem.split('-');
    return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  };

  return (
    <div>
      {/* Dönem seçimi */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={oncekiAy} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>←</button>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{ayLabel()}</span>
        <button onClick={sonrakiAy} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>→</button>
      </div>

      {/* Özet kartları */}
      {rapor && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }} className="settings-grid-3">
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Toplam Prim</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#5d4bb5' }}>{para(rapor.toplamPrim)}₺</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bekleyen Prim</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#a8590c' }}>{para(rapor.bekleyenPrim)}₺</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Çalışan Sayısı</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text)' }}>{rapor.rapor?.length || 0}</div>
          </div>
        </div>
      )}

      {/* Tablo */}
      <div style={S.card}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Prim Detayları</div>
        {yukleniyor ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)' }}>Yükleniyor...</div>
        ) : !rapor?.rapor?.length ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Bu dönemde veri yok</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg)' }}>
                  {['Çalışan', 'Randevu', 'Ciro', 'Oran', 'Prim', 'Durum', ''].map((h, i) => (
                    <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rapor.rapor.map(r => (
                  <tr key={r.calisan_id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px', fontWeight: 600 }}>{r.isim}</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>{r.toplam_randevu}</td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#1f6f4a' }}>{para(r.toplam_ciro)}₺</td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>%{r.prim_yuzdesi}</td>
                    <td style={{ padding: '12px', fontWeight: 600, color: '#5d4bb5' }}>{para(r.prim_tutari)}₺</td>
                    <td style={{ padding: '12px' }}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                        background: r.durum === 'odendi' ? 'rgba(31,111,74,.1)' : 'rgba(168,89,12,.1)',
                        color: r.durum === 'odendi' ? '#1f6f4a' : '#a8590c'
                      }}>{r.durum === 'odendi' ? 'Ödendi' : 'Bekliyor'}</span>
                    </td>
                    <td style={{ padding: '12px' }}>
                      {r.durum !== 'odendi' && r.prim_tutari > 0 && (
                        <button onClick={() => primOde(r)} style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: '#5d4bb5',
                          color: '#fff', fontWeight: 600, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit'
                        }}>Öde</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
