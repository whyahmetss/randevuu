import { useState, useEffect } from 'react';

// Büyüme: esnaf hangi kanaldan geliyor, kaçı kurulumu bitiriyor, kaçı ilk randevuyu alıyor, kaçı ödüyor.
const yuzde = (a, b) => (b ? `%${Math.round((a / b) * 100)}` : '—');
const hucre = { padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 13, textAlign: 'right' };

export default function Buyume({ api }) {
  const [gun, setGun] = useState(30);
  const [d, setD] = useState(null);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    setD(null); setHata(null);
    api.get(`/admin/buyume?gun=${gun}`).then(x => (x?.hata ? setHata(x.hata) : setD(x))).catch(e => setHata(e.message));
  }, [api, gun]);

  const sb = d?.satisBot;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>Büyüme</h1>
          <p style={{ margin: '4px 0 0', color: 'var(--dim)' }}>Kanal kanal: kayıt → kurulum → ilk randevu → ödeme</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[7, 30, 90, 365].map(g => (
            <button key={g} onClick={() => setGun(g)} style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12,
              border: '1px solid ' + (gun === g ? '#1f6f4a' : 'var(--border)'), background: gun === g ? 'rgba(31,111,74,.08)' : 'var(--bg)', color: gun === g ? '#1f6f4a' : 'var(--dim)' }}>
              {g === 365 ? '1 yıl' : `${g} gün`}
            </button>
          ))}
        </div>
      </div>

      {hata && <div style={{ color: '#b42318' }}>Yüklenemedi: {hata}</div>}
      {!d && !hata && <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
            {[['Kayıt', d.toplam.kayit, null], ['Kurulumu bitirdi', d.toplam.kurdu, d.toplam.kayit], ['İlk randevu', d.toplam.randevu, d.toplam.kayit], ['Ödedi', d.toplam.odedi, d.toplam.kayit]].map(([ad, n, taban]) => (
              <div key={ad} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>{ad}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{n}</div>
                {taban !== null && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{yuzde(n, taban)} kayıtların</div>}
              </div>
            ))}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflowX: 'auto', marginBottom: 20 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr style={{ color: 'var(--dim)' }}>
                  <th style={{ ...hucre, textAlign: 'left' }}>Kanal</th>
                  <th style={hucre}>Kayıt</th><th style={hucre}>Kurdu</th><th style={hucre}>İlk randevu</th><th style={hucre}>Ödedi</th>
                </tr>
              </thead>
              <tbody>
                {d.kanallar.length === 0 && <tr><td colSpan={5} style={{ ...hucre, textAlign: 'center', color: 'var(--dim)' }}>Bu dönemde kayıt yok</td></tr>}
                {d.kanallar.map(k => (
                  <tr key={k.kanal}>
                    <td style={{ ...hucre, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>{k.ad}</td>
                    <td style={hucre}>{k.kayit}</td>
                    <td style={hucre}>{k.kurdu} <span style={{ color: 'var(--dim)' }}>{yuzde(k.kurdu, k.kayit)}</span></td>
                    <td style={hucre}>{k.randevu} <span style={{ color: 'var(--dim)' }}>{yuzde(k.randevu, k.kayit)}</span></td>
                    <td style={{ ...hucre, fontWeight: 700, color: '#1f6f4a' }}>{k.odedi} <span style={{ color: 'var(--dim)', fontWeight: 400 }}>{yuzde(k.odedi, k.kayit)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sb && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>WhatsApp satış botu hunisi</div>
              <div style={{ fontSize: 14, color: 'var(--text)' }}>
                {sb.yazilan} esnafa yazıldı → {sb.cevap} cevap verdi ({yuzde(sb.cevap, sb.yazilan)}) → {sb.kayit} kayıt oldu ({yuzde(sb.kayit, sb.cevap)} cevap verenlerin)
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
