import { useState, useEffect } from 'react';

export default function Winback({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [musteriler, setMusteriler] = useState([]);
  const [loglar, setLoglar] = useState([]);
  const [kurtarilanSayisi, setKurtarilanSayisi] = useState(0);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tab, setTab] = useState('liste');
  const [gunFiltre, setGunFiltre] = useState(30);
  const [gonderiliyor, setGonderiliyor] = useState(null);

  useEffect(() => {
    api.get('/winback/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
  }, []);

  useEffect(() => {
    if (tab === 'liste') api.get(`/winback/musteriler?gun=${gunFiltre}`).then(d => setMusteriler(d?.musteriler || []));
    if (tab === 'log') api.get('/winback/log').then(d => { setLoglar(d?.loglar || []); setKurtarilanSayisi(d?.kurtarilan_sayisi || 0); });
  }, [tab, gunFiltre]);

  const kaydet = async () => {
    await api.put('/winback/ayarlar', ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const mesajGonder = async (musteriId) => {
    setGonderiliyor(musteriId);
    await api.post('/winback/gonder', { musteri_id: musteriId });
    setGonderiliyor(null);
    api.get(`/winback/musteriler?gun=${gunFiltre}`).then(d => setMusteriler(d?.musteriler || []));
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  const varsayilanSablon = `Merhaba {musteri_adi}! 👋\nSizi özledik! Son ziyaretinizin üzerinden {gun_sayisi} gün geçti.\nBu hafta size özel %{indirim} indirim hazırladık! 🎉\nHemen randevu almak için yazın veya arayın.\n{isletme_adi} ❤️`;

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['liste', '👋 Kayıp Müşteriler'], ['ayarlar', '⚙️ Ayarlar'], ['log', '📋 Gönderim Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, linear-gradient(135deg,#54E097,#2cb872))' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'liste' && (
        <>
          {/* Filtre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Son randevusu</span>
            {[30, 45, 60, 90].map(g => (
              <button key={g} onClick={() => setGunFiltre(g)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
                background: gunFiltre === g ? 'var(--gradient, linear-gradient(135deg,#FE5796,#e8407a))' : 'var(--surface)',
                color: gunFiltre === g ? '#fff' : 'var(--dim)', fontWeight: 700, fontSize: 12,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{g}+ gün</button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>{musteriler.length} müşteri</span>
          </div>

          {/* Liste */}
          <div style={S.card}>
            {musteriler.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Bu kritere uyan kayıp müşteri yok 🎉</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg)' }}>
                      {['Müşteri', 'Telefon', 'Son Randevu', 'Gün', 'Toplam Randevu', 'Son Mesaj', ''].map((h, i) => (
                        <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {musteriler.map(m => (
                      <tr key={m.id} style={{ borderTop: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px', fontWeight: 700 }}>{m.isim || '—'}</td>
                        <td style={{ padding: '12px', fontSize: 12 }}>{m.telefon}</td>
                        <td style={{ padding: '12px', fontSize: 12 }}>{m.son_tarih ? new Date(m.son_tarih).toLocaleDateString('tr-TR') : '—'}</td>
                        <td style={{ padding: '12px' }}>
                          <span style={{
                            padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: m.gun_sayisi > 60 ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)',
                            color: m.gun_sayisi > 60 ? '#ef4444' : '#f59e0b'
                          }}>{m.gun_sayisi} gün</span>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>{m.toplam_randevu}</td>
                        <td style={{ padding: '12px', fontSize: 11, color: 'var(--dim)' }}>{m.son_mesaj ? new Date(m.son_mesaj).toLocaleDateString('tr-TR') : '—'}</td>
                        <td style={{ padding: '12px' }}>
                          <button onClick={() => mesajGonder(m.id)} disabled={gonderiliyor === m.id} style={{
                            padding: '6px 14px', borderRadius: 8, border: 'none',
                            background: 'linear-gradient(135deg,#FE5796,#e8407a)',
                            color: '#fff', fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'inherit',
                            opacity: gonderiliyor === m.id ? .5 : 1
                          }}>{gonderiliyor === m.id ? '...' : '📩 Mesaj Gönder'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'ayarlar' && (
        <>
          {kaydedildi && (
            <div style={{ background: 'rgba(84,224,151,.1)', border: '1px solid rgba(84,224,151,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#2cb872', fontSize: 13, fontWeight: 700 }}>
              Win-back ayarları kaydedildi
            </div>
          )}

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>🔄</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)' }}>Kayıp Müşteri Kurtarma</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Uzun süredir gelmeyen müşterilere otomatik mesaj gönder</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.winback_aktif} onChange={e => setAyarlar({...ayarlar, winback_aktif: e.target.checked})}
                    style={{ accentColor: '#FE5796', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: ayarlar.winback_aktif ? '#FE5796' : 'var(--dim)' }}>
                    {ayarlar.winback_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div>
                <label style={S.label}>Eşik Süresi (gün)</label>
                <select value={ayarlar.winback_gun_esik || 45} onChange={e => setAyarlar({...ayarlar, winback_gun_esik: parseInt(e.target.value)})}
                  className="input" style={{ width: '100%' }}>
                  <option value={30}>30 gün</option>
                  <option value={45}>45 gün</option>
                  <option value={60}>60 gün</option>
                  <option value={90}>90 gün</option>
                </select>
              </div>
              <div>
                <label style={S.label}>İndirim Oranı</label>
                <select value={ayarlar.winback_indirim || 10} onChange={e => setAyarlar({...ayarlar, winback_indirim: parseInt(e.target.value)})}
                  className="input" style={{ width: '100%' }}>
                  <option value={5}>%5</option>
                  <option value={10}>%10</option>
                  <option value={15}>%15</option>
                  <option value={20}>%20</option>
                </select>
              </div>
            </div>

            <div>
              <label style={S.label}>Mesaj Şablonu</label>
              <textarea value={ayarlar.winback_mesaj_sablonu || varsayilanSablon}
                onChange={e => setAyarlar({...ayarlar, winback_mesaj_sablonu: e.target.value})}
                className="input" rows={5} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} />
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                Değişkenler: <code>{'{musteri_adi}'}</code>, <code>{'{gun_sayisi}'}</code>, <code>{'{indirim}'}</code>, <code>{'{isletme_adi}'}</code>
              </div>
            </div>
          </div>

          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #FE5796 0%, #e8407a 100%)',
            color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(254,87,150,.3)', fontFamily: 'inherit',
          }}>Kaydet</button>
        </>
      )}

      {tab === 'log' && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>Gönderim Geçmişi</div>
            <span style={{ padding: '4px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: 'rgba(34,197,94,.1)', color: '#22c55e' }}>
              ✅ {kurtarilanSayisi} müşteri kurtarıldı
            </span>
          </div>
          {loglar.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz win-back mesajı gönderilmemiş</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Gün', 'Tarih', 'Durum', 'Kurtarıldı'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loglar.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.musteri_isim || '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{l.gun_sayisi} gün</td>
                      <td style={{ padding: '10px 12px', fontSize: 12 }}>{new Date(l.gonderim_tarihi).toLocaleDateString('tr-TR')}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: l.durum === 'gonderildi' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
                          color: l.durum === 'gonderildi' ? '#22c55e' : '#ef4444'
                        }}>{l.durum === 'gonderildi' ? 'Gönderildi' : l.durum}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {l.kurtarildi ? (
                          <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,.1)', color: '#22c55e' }}>✅ Kurtarıldı</span>
                        ) : '—'}
                      </td>
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
