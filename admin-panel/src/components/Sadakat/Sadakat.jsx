import { useState, useEffect } from 'react';

export default function Sadakat({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [hizmetler, setHizmetler] = useState([]);
  const [musteriler, setMusteriler] = useState([]);
  const [istatistik, setIstatistik] = useState(null);
  const [hareketler, setHareketler] = useState([]);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tab, setTab] = useState('rapor');
  const [seciliMusteri, setSeciliMusteri] = useState(null);
  const [kullanPuan, setKullanPuan] = useState('');

  useEffect(() => {
    api.get('/sadakat/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); if (d?.hizmetler) setHizmetler(d.hizmetler); });
  }, []);

  useEffect(() => {
    if (tab === 'rapor') api.get('/sadakat/rapor').then(d => { setMusteriler(d?.musteriler || []); setIstatistik(d?.istatistik || null); });
    if (tab === 'gecmis') api.get('/sadakat/gecmis').then(d => setHareketler(d?.hareketler || []));
  }, [tab]);

  const kaydet = async () => {
    await api.put('/sadakat/ayarlar', ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const puanKullan = async (musteriId) => {
    if (!kullanPuan || isNaN(kullanPuan)) return;
    await api.post('/sadakat/kullan', { musteri_id: musteriId, puan: parseInt(kullanPuan), aciklama: 'Admin tarafından kullanıldı' });
    setKullanPuan('');
    setSeciliMusteri(null);
    api.get('/sadakat/rapor').then(d => { setMusteriler(d?.musteriler || []); setIstatistik(d?.istatistik || null); });
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['rapor', '🎯 Puan Raporu'], ['ayarlar', '⚙️ Ayarlar'], ['gecmis', '📋 Geçmiş']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, linear-gradient(135deg,#54E097,#2cb872))' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {/* İstatistik kartları */}
      {istatistik && tab === 'rapor' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }} className="settings-grid-3">
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Toplam Dağıtılan</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#f59e0b' }}>{istatistik.kazanilan?.toLocaleString('tr-TR')}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>puan</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Toplam Harcanan</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ef4444' }}>{istatistik.harcanan?.toLocaleString('tr-TR')}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>puan</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Aktif Müşteri</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#22c55e' }}>{musteriler.length}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>puan sahibi</div>
          </div>
        </div>
      )}

      {tab === 'rapor' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Müşteri Puan Bakiyeleri</div>
          {musteriler.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz puan kazanan müşteri yok</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Telefon', 'Bakiye', 'Kazanılan', 'Harcanan', ''].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {musteriler.map(m => (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px', fontWeight: 700 }}>{m.isim || '—'}</td>
                      <td style={{ padding: '12px', fontSize: 12 }}>{m.telefon}</td>
                      <td style={{ padding: '12px' }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#f59e0b' }}>{m.puan_bakiye?.toLocaleString('tr-TR')} ⭐</span>
                      </td>
                      <td style={{ padding: '12px', color: '#22c55e', fontWeight: 600 }}>+{m.toplam_kazanilan_puan?.toLocaleString('tr-TR')}</td>
                      <td style={{ padding: '12px', color: '#ef4444', fontWeight: 600 }}>{m.toplam_harcanan_puan > 0 ? `-${m.toplam_harcanan_puan?.toLocaleString('tr-TR')}` : '—'}</td>
                      <td style={{ padding: '12px' }}>
                        {seciliMusteri === m.id ? (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input type="number" value={kullanPuan} onChange={e => setKullanPuan(e.target.value)} placeholder="Puan" className="input" style={{ width: 80, padding: '4px 8px', fontSize: 12 }} />
                            <button onClick={() => puanKullan(m.id)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Kullan</button>
                            <button onClick={() => setSeciliMusteri(null)} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--dim)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setSeciliMusteri(m.id)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Puan Kullan</button>
                        )}
                      </td>
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
            <div style={{ background: 'rgba(84,224,151,.1)', border: '1px solid rgba(84,224,151,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#2cb872', fontSize: 13, fontWeight: 700 }}>
              Sadakat ayarları kaydedildi
            </div>
          )}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>🎯</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Sadakat Puan Sistemi</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Müşterilere her işlemde puan ver, belirli puana ulaşınca ödül sun</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.sadakat_aktif} onChange={e => setAyarlar({...ayarlar, sadakat_aktif: e.target.checked})}
                    style={{ accentColor: '#f59e0b', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: ayarlar.sadakat_aktif ? '#f59e0b' : 'var(--dim)' }}>
                    {ayarlar.sadakat_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Puan Oranı</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>Her</span>
                  <input type="number" value={ayarlar.puan_oran_tl || 1} onChange={e => setAyarlar({...ayarlar, puan_oran_tl: parseInt(e.target.value) || 1})} className="input" style={{ width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>₺ =</span>
                  <input type="number" value={ayarlar.puan_oran_puan || 1} onChange={e => setAyarlar({...ayarlar, puan_oran_puan: parseInt(e.target.value) || 1})} className="input" style={{ width: 60, textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>puan</span>
                </div>
              </div>
              <div>
                <label style={S.label}>Ödül Eşiği (puan)</label>
                <input type="number" value={ayarlar.odul_esik || 1000} onChange={e => setAyarlar({...ayarlar, odul_esik: parseInt(e.target.value) || 1000})} className="input" style={{ width: '100%' }} />
              </div>
            </div>

            <div>
              <label style={S.label}>Ödül Hizmeti</label>
              <select value={ayarlar.odul_hizmet_id || ''} onChange={e => setAyarlar({...ayarlar, odul_hizmet_id: e.target.value ? parseInt(e.target.value) : null})} className="input" style={{ width: '100%' }}>
                <option value="">Ödül hizmeti seçin</option>
                {hizmetler.map(h => <option key={h.id} value={h.id}>{h.isim}</option>)}
              </select>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Bu hizmet ödül olarak verilecektir</div>
            </div>
          </div>
          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(245,158,11,.3)', fontFamily: 'inherit',
          }}>Kaydet</button>
        </>
      )}

      {tab === 'gecmis' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>Puan Geçmişi</div>
          {hareketler.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz puan hareketi yok</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Tip', 'Puan', 'Açıklama', 'Tarih'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hareketler.map(h => (
                    <tr key={h.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{h.musteri_isim || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: h.tip === 'kazanc' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                          color: h.tip === 'kazanc' ? '#22c55e' : '#ef4444'
                        }}>{h.tip === 'kazanc' ? 'Kazanç' : 'Harcama'}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: h.puan > 0 ? '#22c55e' : '#ef4444' }}>{h.puan > 0 ? '+' : ''}{h.puan}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--dim)' }}>{h.aciklama || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(h.tarih).toLocaleDateString('tr-TR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
