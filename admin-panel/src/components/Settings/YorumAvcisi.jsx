import { useState, useEffect } from 'react';

export default function YorumAvcisi({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [talepler, setTalepler] = useState([]);
  const [istatistik, setIstatistik] = useState(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tab, setTab] = useState('ayarlar');

  useEffect(() => {
    api.get('/yorum-avcisi/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
    api.get('/yorum-avcisi/istatistik').then(d => { if (!d?.hata) setIstatistik(d); });
  }, []);

  useEffect(() => {
    if (tab === 'log') api.get('/yorum-avcisi/log').then(d => setTalepler(d?.talepler || []));
  }, [tab]);

  const kaydet = async () => {
    const r = await api.put('/yorum-avcisi/ayarlar', ayarlar);
    if (r?.hata) { alert('Kaydedilemedi: ' + r.hata); return; }
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  const varsayilanSablon = `Merhaba {musteri_adi}! 😊\n\n{isletme_adi}'deki deneyiminiz nasıldı?\n\nBizi Google'da değerlendirirseniz çok mutlu oluruz ⭐\n{google_maps_link}\n\nTeşekkürler, iyi günler! 🙏`;

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['ayarlar', '⚙️ Ayarlar'], ['log', '📋 Gönderim Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, #1f6f4a)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {/* İstatistik kartları */}
      {istatistik && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }} className="settings-grid-3">
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bu Ay Toplam</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#a8590c' }}>{istatistik.toplam}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Gönderilen</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1f6f4a' }}>{istatistik.gonderilen}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bekleyen</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#2f56c6' }}>{istatistik.bekleyen}</div>
          </div>
        </div>
      )}

      {tab === 'ayarlar' && (
        <>
          {kaydedildi && (
            <div style={{ background: 'rgba(31,111,74,.1)', border: '1px solid rgba(31,111,74,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#1f6f4a', fontSize: 13, fontWeight: 600 }}>
              Yorum avcısı ayarları kaydedildi
            </div>
          )}

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>⭐</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Yorum Avcısı (Google Review Botu)</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Randevu tamamlandıktan sonra otomatik Google yorum linki gönder</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.yorum_avcisi_aktif} onChange={e => setAyarlar({...ayarlar, yorum_avcisi_aktif: e.target.checked})}
                    style={{ accentColor: '#a8590c', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: ayarlar.yorum_avcisi_aktif ? '#a8590c' : 'var(--dim)' }}>
                    {ayarlar.yorum_avcisi_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Google Maps Yorum Linki *</label>
                <input value={ayarlar.google_maps_link || ''} onChange={e => setAyarlar({...ayarlar, google_maps_link: e.target.value})}
                  className="input" placeholder="https://g.page/r/xxxxxxx/review" />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Google Maps'te işletmenize gidin → "Yorum Yaz" → URL'yi kopyalayın</div>
              </div>
              <div>
                <label style={S.label}>Gecikme Süresi</label>
                <select value={ayarlar.yorum_gecikme_dk || 60} onChange={e => setAyarlar({...ayarlar, yorum_gecikme_dk: parseInt(e.target.value)})}
                  className="input" style={{ width: '100%' }}>
                  <option value={60}>1 saat sonra</option>
                  <option value={120}>2 saat sonra</option>
                  <option value={1440}>24 saat sonra</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Mesaj Şablonu</label>
                <textarea value={ayarlar.yorum_mesaj_sablonu || varsayilanSablon}
                  onChange={e => setAyarlar({...ayarlar, yorum_mesaj_sablonu: e.target.value})}
                  className="input" rows={6} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                  Değişkenler: <code>{'{musteri_adi}'}</code>, <code>{'{isletme_adi}'}</code>, <code>{'{google_maps_link}'}</code>
                </div>
              </div>
            </div>
          </div>

          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: '#a8590c',
            color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(168,89,12,.3)', fontFamily: 'inherit',
          }}>
            Kaydet
          </button>
        </>
      )}

      {tab === 'log' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Gönderim Geçmişi</div>
          {talepler.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz yorum talebi gönderilmemiş</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Telefon', 'Planlanan', 'Gönderim', 'Durum'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {talepler.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.musteri_isim || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12 }}>{t.telefon}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.gonderim_zamani).toLocaleString('tr-TR')}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{t.gonderim_tarihi ? new Date(t.gonderim_tarihi).toLocaleString('tr-TR') : '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: t.durum === 'gonderildi' ? 'rgba(31,111,74,.1)' : t.durum === 'bekliyor' ? 'rgba(47,86,198,.1)' : 'rgba(180,35,24,.1)',
                          color: t.durum === 'gonderildi' ? '#1f6f4a' : t.durum === 'bekliyor' ? '#2f56c6' : '#b42318'
                        }}>{t.durum === 'gonderildi' ? 'Gönderildi' : t.durum === 'bekliyor' ? 'Bekliyor' : t.durum}</span>
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
