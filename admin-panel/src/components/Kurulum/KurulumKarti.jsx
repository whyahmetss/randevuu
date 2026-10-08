import { useState, useEffect } from 'react';
import { bookingUrl } from '../../lib/config';

// Kurulum sihirbazı: yeni esnafın anasayfasında, kurulum bitene kadar adım adım yol gösterir.
// Adımlar sunucudaki gerçek veriden gelir (hizmet, çalışan, WhatsApp, ilk randevu).
export default function KurulumKarti({ api, setSayfa }) {
  const [d, setD] = useState(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => {
    api.get('/kurulum').then(x => { if (x && !x.hata) setD(x); }).catch(() => {});
  }, [api]);

  if (!d || d.bitti) return null;
  const yuzde = Math.round((d.tamam / d.toplam) * 100);
  const sira = d.adimlar.find(a => !a.tamam);
  const link = d.slug ? bookingUrl(d.slug) : null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Kurulumu tamamlayın</div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>{d.tamam}/{d.toplam} adım bitti. Birkaç dakika sonra müşterileriniz kendi randevusunu alabilir.</div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1f6f4a' }}>%{yuzde}</div>
      </div>
      <div style={{ height: 6, background: 'var(--bg)', borderRadius: 4, margin: '12px 0 14px', overflow: 'hidden' }}>
        <div style={{ width: `${yuzde}%`, height: '100%', background: '#1f6f4a', transition: 'width .3s' }} />
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {d.adimlar.map((a, i) => {
          const simdi = a === sira;
          return (
            <div key={a.anahtar} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
              background: simdi ? 'rgba(31,111,74,.08)' : 'transparent', border: '1px solid ' + (simdi ? 'rgba(31,111,74,.3)' : 'var(--border)') }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                background: a.tamam ? '#1f6f4a' : 'var(--bg)', color: a.tamam ? '#fff' : 'var(--dim)', border: a.tamam ? 'none' : '1px solid var(--border)' }}>
                {a.tamam ? '✓' : i + 1}
              </span>
              <span style={{ flex: 1, fontSize: 14, color: a.tamam ? 'var(--dim)' : 'var(--text)', textDecoration: a.tamam ? 'line-through' : 'none' }}>{a.isim}</span>
              {!a.tamam && a.anahtar === 'randevu' && link && (
                <button onClick={() => { navigator.clipboard?.writeText(link).then(() => { setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }).catch(() => {}); }}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  {kopyalandi ? 'Kopyalandı ✓' : 'Linki kopyala'}
                </button>
              )}
              {!a.tamam && (
                <button onClick={() => setSayfa(a.sayfa)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: simdi ? '#1f6f4a' : 'var(--bg)', color: simdi ? '#fff' : 'var(--text)', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                  {simdi ? 'Şimdi yap' : 'Aç'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
