import { useState } from 'react';

// Gün bazlı çalışma saati (2026-10-29): "hafta içi 9–21, son müşteri 20:00; cuma-cumartesi 23:00" gibi.
// Boş hücre genel açılış/kapanışı kullanır. "Son randevu": o saatten sonra randevu başlamaz (kapanıştan önce bitecek iş için).
// Kapalı düğmesi üstteki "Kapalı Günler" ile aynı ayarı (kapali_gunler) değiştirir.
const GUNLER = [['1', 'Pazartesi'], ['2', 'Salı'], ['3', 'Çarşamba'], ['4', 'Perşembe'], ['5', 'Cuma'], ['6', 'Cumartesi'], ['0', 'Pazar']];
const s5 = (x) => (x ? String(x).slice(0, 5) : '');

export default function GunlukSaatler({ ayarlar, setAyarlar }) {
  const tablo = (ayarlar.haftalik_saatler && typeof ayarlar.haftalik_saatler === 'object') ? ayarlar.haftalik_saatler : {};
  const doluMu = Object.keys(tablo).length > 0;
  const [acik, setAcik] = useState(doluMu);
  const kapalilar = String(ayarlar.kapali_gunler || '').split(',').map(s => s.trim()).filter(Boolean);
  const genelBas = s5(ayarlar.calisma_baslangic) || '09:00';
  const genelBit = s5(ayarlar.calisma_bitis) || '19:00';

  const yaz = (gun, alan, deger) => {
    const yeni = { ...tablo, [gun]: { ...(tablo[gun] || {}), [alan]: deger || undefined } };
    if (!Object.values(yeni[gun]).some(Boolean)) delete yeni[gun];
    setAyarlar({ ...ayarlar, haftalik_saatler: yeni });
  };
  const kapaliDegis = (gun) => {
    const yeni = kapalilar.includes(gun) ? kapalilar.filter(k => k !== gun) : [...kapalilar, gun];
    setAyarlar({ ...ayarlar, kapali_gunler: yeni.join(',') });
  };
  // Pazartesi satırını açık bütün günlere kopyalar
  const hepsineUygula = () => {
    const ilk = tablo['1'] || {};
    const yeni = {};
    for (const [g] of GUNLER) if (Object.values(ilk).some(Boolean)) yeni[g] = { ...ilk };
    setAyarlar({ ...ayarlar, haftalik_saatler: yeni });
  };
  const temizle = () => setAyarlar({ ...ayarlar, haftalik_saatler: {} });

  const hucre = { padding: '6px 4px', fontSize: 13 };
  const giris = { padding: '6px 8px', fontSize: 13, minWidth: 0, width: '100%' };

  return (
    <div style={{ marginTop: 14 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer' }}>
        <input type="checkbox" checked={acik} onChange={e => { setAcik(e.target.checked); if (!e.target.checked) temizle(); }} />
        Günlere göre farklı saat / son randevu saati
      </label>
      {acik && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: 'var(--dim)', fontSize: 12, marginBottom: 8 }}>
            Boş bırakılan hücre genel saati ({genelBas}–{genelBit}) kullanır. <b>Son randevu</b>: o saatten sonra randevu başlamaz.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
              <thead>
                <tr style={{ color: 'var(--muted)', fontSize: 11, textTransform: 'uppercase', textAlign: 'left' }}>
                  <th style={hucre}>Gün</th><th style={hucre}>Açılış</th><th style={hucre}>Kapanış</th><th style={hucre}>Son randevu</th><th style={hucre}></th>
                </tr>
              </thead>
              <tbody>
                {GUNLER.map(([g, ad]) => {
                  const kapali = kapalilar.includes(g);
                  const satir = tablo[g] || {};
                  return (
                    <tr key={g} style={{ borderTop: '1px solid var(--border)', opacity: kapali ? 0.5 : 1 }}>
                      <td style={{ ...hucre, fontWeight: 600, whiteSpace: 'nowrap' }}>{ad}</td>
                      {['bas', 'bit', 'son'].map(alan => (
                        <td key={alan} style={hucre}>
                          <input type="time" disabled={kapali} value={s5(satir[alan])} onChange={e => yaz(g, alan, e.target.value)}
                            placeholder={alan === 'bas' ? genelBas : alan === 'bit' ? genelBit : ''} className="input" style={giris} />
                        </td>
                      ))}
                      <td style={hucre}>
                        <button type="button" onClick={() => kapaliDegis(g)} className={`day-btn ${kapali ? 'on' : 'off'}`} style={{ padding: '5px 10px', fontSize: 12 }}>
                          {kapali ? 'Kapalı' : 'Açık'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={hepsineUygula} className="btn btn-ghost" style={{ marginTop: 8, fontSize: 12, padding: '6px 10px' }}>
            Pazartesi satırını bütün günlere uygula
          </button>
        </div>
      )}
    </div>
  );
}
