import { useState, useEffect } from 'react';

export default function GeceRaporu({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [loglar, setLoglar] = useState([]);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [onizle, setOnizle] = useState(null);
  const [tab, setTab] = useState('ayarlar');

  useEffect(() => {
    api.get('/gece-raporu/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
  }, []);

  useEffect(() => {
    if (tab === 'log') api.get('/gece-raporu/log').then(d => setLoglar(d?.loglar || []));
  }, [tab]);

  const kaydet = async () => {
    const r = await api.put('/gece-raporu/ayarlar', ayarlar);
    if (r?.hata) { alert('Kaydedilemedi: ' + r.hata); return; }
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const raporOnizle = async () => {
    setOnizle('Yükleniyor...');
    const d = await api.get('/gece-raporu/onizle');
    setOnizle(d?.rapor || 'Rapor oluşturulamadı');
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  // Saat seçenekleri oluştur
  const saatSecenekleri = [];
  for (let h = 18; h <= 23; h++) {
    saatSecenekleri.push(`${String(h).padStart(2,'0')}:00`);
    saatSecenekleri.push(`${String(h).padStart(2,'0')}:30`);
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['ayarlar', '⚙️ Ayarlar'], ['log', '📋 Rapor Geçmişi']].map(([id, label]) => (
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
              Gece raporu ayarları kaydedildi
            </div>
          )}

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>🌙</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Otomatik Gece Raporu</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Her gün belirlediğiniz saatte günlük özet rapor alın</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!ayarlar.gece_raporu_aktif} onChange={e => setAyarlar({...ayarlar, gece_raporu_aktif: e.target.checked})}
                    style={{ accentColor: '#1f6f4a', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: ayarlar.gece_raporu_aktif ? '#1f6f4a' : 'var(--dim)' }}>
                    {ayarlar.gece_raporu_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }} className="settings-grid-3">
              <div>
                <label style={S.label}>Gönderim Saati</label>
                <select value={ayarlar.gece_raporu_saat || '22:00'} onChange={e => setAyarlar({...ayarlar, gece_raporu_saat: e.target.value})} className="input" style={{ width: '100%' }}>
                  {saatSecenekleri.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Gönderim Kanalı</label>
                <select value={ayarlar.gece_raporu_kanal || 'whatsapp'} onChange={e => setAyarlar({...ayarlar, gece_raporu_kanal: e.target.value})} className="input" style={{ width: '100%' }}>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Alıcı Telefon</label>
                <input value={ayarlar.gece_raporu_telefon || ''} onChange={e => setAyarlar({...ayarlar, gece_raporu_telefon: e.target.value})} className="input" placeholder="05XXXXXXXXX" />
              </div>
            </div>
          </div>

          {/* Önizle */}
          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Rapor Önizleme</div>
              <button onClick={raporOnizle} style={{
                padding: '8px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
              }}>Bugünkü Raporu Önizle</button>
            </div>
            {onizle && (
              <pre style={{
                background: 'var(--bg)', borderRadius: 12, padding: 16, fontSize: 13, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text)', fontFamily: 'inherit',
                maxHeight: 400, overflowY: 'auto', border: '1px solid var(--border)'
              }}>{onizle}</pre>
            )}
          </div>

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
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Rapor Geçmişi</div>
          {loglar.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz rapor gönderilmemiş</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loglar.map(l => (
                <div key={l.id} style={{ background: 'var(--bg)', borderRadius: 12, padding: 14, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dim)' }}>{new Date(l.gonderim_tarihi).toLocaleString('tr-TR')}</span>
                    <span style={{
                      padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      background: l.durum === 'gonderildi' ? 'rgba(31,111,74,.1)' : 'rgba(180,35,24,.1)',
                      color: l.durum === 'gonderildi' ? '#1f6f4a' : '#b42318'
                    }}>{l.durum === 'gonderildi' ? 'Gönderildi' : l.durum}</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'rgba(47,86,198,.1)', color: '#2f56c6' }}>{l.kanal}</span>
                  </div>
                  <pre style={{
                    fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    color: 'var(--text)', fontFamily: 'inherit', margin: 0
                  }}>{l.rapor_icerik}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
