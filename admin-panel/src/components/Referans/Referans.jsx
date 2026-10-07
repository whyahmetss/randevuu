import { useState, useEffect } from 'react';

export default function Referans({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [davetciler, setDavetciler] = useState([]);
  const [loglar, setLoglar] = useState([]);
  const [istatistik, setIstatistik] = useState(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tab, setTab] = useState('rapor');

  useEffect(() => {
    api.get('/referans/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
  }, []);

  useEffect(() => {
    if (tab === 'rapor') api.get('/referans/rapor').then(d => {
      setDavetciler(d?.davetciler || []);
      setLoglar(d?.loglar || []);
      setIstatistik(d?.istatistik || null);
    });
  }, [tab]);

  const kaydet = async () => {
    await api.put('/referans/ayarlar', ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['rapor', '🤝 Davetçiler'], ['log', '📋 Geçmiş'], ['ayarlar', '⚙️ Ayarlar']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, #1f6f4a)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {istatistik && tab === 'rapor' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Toplam Davet</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#5d4bb5' }}>{istatistik.toplam}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Başarılı (Randevu Aldı)</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1f6f4a' }}>{istatistik.basarili}</div>
          </div>
        </div>
      )}

      {tab === 'rapor' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>En Çok Davet Eden Müşteriler</div>
          {davetciler.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz referans kodu oluşturan müşteri yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Telefon', 'Referans Kodu', 'Başarılı', 'Toplam'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {davetciler.map(d => (
                    <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontWeight: 600 }}>{d.isim || '—'}</td>
                      <td style={{ padding: '12px', fontSize: 12 }}>{d.telefon}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(93,75,181,.1)', color: '#5d4bb5', fontFamily: 'monospace' }}>{d.referans_kodu}</span>
                      </td>
                      <td style={{ padding: '12px', fontWeight: 600, color: '#1f6f4a' }}>{d.basarili}</td>
                      <td style={{ padding: '12px', color: 'var(--dim)' }}>{d.toplam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'log' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Referans Geçmişi</div>
          {loglar.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz referans kaydı yok</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Davet Eden', 'Davetli', 'Kod', 'Durum', 'Puan', 'Tarih'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loglar.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.davet_eden_isim || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{l.davetli_isim || l.davetli_telefon || '—'}</td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, fontWeight: 600 }}>{l.referans_kodu}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: l.durum === 'tamamlandi' ? 'rgba(31,111,74,.1)' : 'rgba(168,89,12,.1)',
                          color: l.durum === 'tamamlandi' ? '#1f6f4a' : '#a8590c'
                        }}>{l.durum === 'tamamlandi' ? 'Tamamlandı' : 'Bekliyor'}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {l.puan_verildi ? <span style={{ color: '#1f6f4a', fontWeight: 600 }}>✅</span> : '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(l.tarih).toLocaleDateString('tr-TR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'ayarlar' && (
        <>
          {kaydedildi && (
            <div style={{ background: 'rgba(31,111,74,.1)', border: '1px solid rgba(31,111,74,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#1f6f4a', fontSize: 13, fontWeight: 600 }}>
              Referans ayarları kaydedildi
            </div>
          )}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>🤝</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Referans Ağı (Arkadaşını Getir)</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Müşteriler arkadaşlarını davet etsin, ikiniz de puan kazanın</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.referans_aktif} onChange={e => setAyarlar({...ayarlar, referans_aktif: e.target.checked})}
                    style={{ accentColor: '#5d4bb5', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: ayarlar.referans_aktif ? '#5d4bb5' : 'var(--dim)' }}>
                    {ayarlar.referans_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={S.label}>Davet Eden Puan Ödülü</label>
                <input type="number" value={ayarlar.referans_puan_davet || 200} onChange={e => setAyarlar({...ayarlar, referans_puan_davet: parseInt(e.target.value) || 200})} className="input" style={{ width: '100%' }} />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Arkadaşını getiren kişiye verilecek puan</div>
              </div>
              <div>
                <label style={S.label}>Davetli Puan Ödülü</label>
                <input type="number" value={ayarlar.referans_puan_davetli || 100} onChange={e => setAyarlar({...ayarlar, referans_puan_davetli: parseInt(e.target.value) || 100})} className="input" style={{ width: '100%' }} />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Referansla gelen kişiye verilecek hoş geldin puanı</div>
              </div>
            </div>
          </div>
          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: '#5d4bb5',
            color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(93,75,181,.3)', fontFamily: 'inherit',
          }}>Kaydet</button>
        </>
      )}
    </div>
  );
}
