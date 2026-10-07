import { useState, useEffect } from 'react';

export default function SmsAyarlari({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [loglar, setLoglar] = useState([]);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [bakiye, setBakiye] = useState(null);
  const [testTel, setTestTel] = useState('');
  const [testSonuc, setTestSonuc] = useState(null);
  const [tab, setTab] = useState('ayarlar');

  useEffect(() => {
    api.get('/sms/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
  }, []);

  useEffect(() => {
    if (tab === 'log') api.get('/sms/log').then(d => setLoglar(d?.loglar || []));
  }, [tab]);

  const kaydet = async () => {
    await api.put('/sms/ayarlar', ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const bakiyeSorgula = async () => {
    const d = await api.get('/sms/bakiye');
    setBakiye(d);
  };

  const testGonder = async () => {
    if (!testTel.trim()) return;
    setTestSonuc(null);
    const d = await api.post('/sms/test', { telefon: testTel.trim() });
    setTestSonuc(d);
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['ayarlar', '⚙️ Ayarlar'], ['log', '📋 SMS Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, #1f6f4a)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {tab === 'ayarlar' && (
        <>
          {kaydedildi && (
            <div style={{ background: 'rgba(31,111,74,.1)', border: '1px solid rgba(31,111,74,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#1f6f4a', fontSize: 13, fontWeight: 600 }}>
              SMS ayarları kaydedildi
            </div>
          )}

          {/* Aktif/Pasif */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>📱</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>SMS Hatırlatma (NetGSM)</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Müşterilerinize randevu hatırlatma SMS'i gönderin</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.sms_aktif} onChange={e => setAyarlar({...ayarlar, sms_aktif: e.target.checked})}
                    style={{ accentColor: '#1f6f4a', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: ayarlar.sms_aktif ? '#1f6f4a' : 'var(--dim)' }}>
                    {ayarlar.sms_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            {/* NetGSM Bilgileri */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }} className="settings-grid-3">
              <div>
                <label style={S.label}>NetGSM Kullanıcı Adı</label>
                <input value={ayarlar.netgsm_kullanici_adi || ''} onChange={e => setAyarlar({...ayarlar, netgsm_kullanici_adi: e.target.value})} className="input" placeholder="8505XXXXXXX" />
              </div>
              <div>
                <label style={S.label}>NetGSM Şifre</label>
                <input type="password" value={ayarlar.netgsm_sifre || ''} onChange={e => setAyarlar({...ayarlar, netgsm_sifre: e.target.value})} placeholder={ayarlar.netgsm_sifre_kayitli ? 'Kayıtlı (değiştirmek için yazın)' : ''} className="input" />
              </div>
              <div>
                <label style={S.label}>SMS Başlığı</label>
                <input value={ayarlar.netgsm_baslik || ''} onChange={e => setAyarlar({...ayarlar, netgsm_baslik: e.target.value})} className="input" placeholder="SIRAGO" maxLength={11} />
              </div>
            </div>

            {/* Hatırlatma süresi + Onay SMS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={S.label}>Hatırlatma Süresi (dakika önce)</label>
                <input type="number" min="15" max="1440" value={ayarlar.sms_hatirlatma_dk || 60} onChange={e => setAyarlar({...ayarlar, sms_hatirlatma_dk: parseInt(e.target.value) || 60})} className="input" />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Randevudan kaç dk önce SMS gönderilsin</div>
              </div>
              <div>
                <label style={S.label}>Randevu Onay SMS</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8 }}>
                  <input type="checkbox" checked={!!ayarlar.sms_onay_aktif} onChange={e => setAyarlar({...ayarlar, sms_onay_aktif: e.target.checked})}
                    style={{ accentColor: '#1f6f4a', width: 16, height: 16 }} />
                  <span style={{ fontWeight: 600, fontSize: 13 }}>Randevu onaylandığında SMS gönder</span>
                </label>
              </div>
            </div>
          </div>

          {/* Test + Bakiye */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }} className="settings-grid-2">
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Test SMS Gönder</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={testTel} onChange={e => setTestTel(e.target.value)} placeholder="05XXXXXXXXX" className="input" style={{ flex: 1 }} />
                <button onClick={testGonder} style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: '#2f56c6',
                  color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap'
                }}>Gönder</button>
              </div>
              {testSonuc && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: testSonuc.basarili ? '#1f6f4a' : '#b42318' }}>
                  {testSonuc.basarili ? 'Test SMS gönderildi!' : `Hata: ${testSonuc.hata}`}
                </div>
              )}
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>NetGSM Bakiye</div>
              <button onClick={bakiyeSorgula} style={{
                padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
              }}>Bakiye Sorgula</button>
              {bakiye && (
                <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: bakiye.bakiye !== null ? '#1f6f4a' : '#b42318' }}>
                  {bakiye.bakiye !== null ? `${bakiye.bakiye} TL` : bakiye.hata}
                </div>
              )}
            </div>
          </div>

          {/* Kaydet */}
          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: '#1f6f4a',
            color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(31,111,74,.3)', fontFamily: 'inherit',
          }}>
            Kaydet
          </button>
        </>
      )}

      {tab === 'log' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>SMS Geçmişi</div>
          {loglar.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz SMS gönderilmemiş</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Tarih', 'Telefon', 'Tip', 'Mesaj', 'Durum'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loglar.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontSize: 12 }}>{new Date(l.tarih).toLocaleString('tr-TR')}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{l.telefon}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(47,86,198,.1)', color: '#2f56c6' }}>{l.tip}</span>
                      </td>
                      <td style={{ padding: '10px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{l.mesaj}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: l.durum === 'gonderildi' ? 'rgba(31,111,74,.1)' : 'rgba(180,35,24,.1)',
                          color: l.durum === 'gonderildi' ? '#1f6f4a' : '#b42318'
                        }}>{l.durum === 'gonderildi' ? 'Gönderildi' : 'Başarısız'}</span>
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
