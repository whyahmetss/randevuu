import { useState, useEffect } from 'react';

// Satış botu hunisi: gönderim → cevap → ilgi → kayıt → ödeme. Hangi şablonun müşteri getirdiğini gösterir.
const ADIMLAR = [
  ['gonderilen', 'Gönderim'],
  ['cevap', 'Cevap'],
  ['ilgi', 'İlgi'],
  ['kayit', 'Kayıt'],
  ['odeme', 'Ödeme'],
];
const yuzde = (a, b) => (b > 0 ? `%${((a / b) * 100).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}` : '—');

export default function SatisHuni({ api }) {
  const [gun, setGun] = useState(30);
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState(null);

  useEffect(() => {
    setVeri(null); setHata(null);
    api.get(`/admin/satis-bot/huni?gun=${gun}`).then(d => (d?.hata ? setHata(d.hata) : setVeri(d)));
  }, [gun]);

  const t = veri?.toplam || {};
  const enCok = t.gonderilen || 0;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <div className="card-title">Satış hunisi</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
            Botun yazdığı işletmelerden kaçı cevap verdi, ilgilendi, hesap açtı ve ödedi. Siteden aynı telefonla açılan hesaplar da sayılır.
          </div>
        </div>
        <div className="tab-bar" style={{ margin: 0 }}>
          {[7, 30, 90].map(g => (
            <button key={g} onClick={() => setGun(g)} className={`tab-btn${gun === g ? ' active' : ''}`}>{g} gün</button>
          ))}
        </div>
      </div>

      {hata && <div className="alert alert-error">{hata}</div>}
      {!veri && !hata && <div className="list-empty">Yükleniyor…</div>}

      {veri && (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            {ADIMLAR.map(([k, ad], i) => {
              const deger = t[k] || 0;
              const onceki = i > 0 ? t[ADIMLAR[i - 1][0]] || 0 : null;
              return (
                <div key={k} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 120px', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{ad}</span>
                  <div style={{ height: 22, background: 'var(--bg)', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <div style={{ width: `${enCok ? Math.max((deger / enCok) * 100, deger ? 2 : 0) : 0}%`, height: '100%', background: '#1f6f4a', opacity: 1 - i * 0.12 }} />
                  </div>
                  <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                    <b>{deger}</b>{onceki !== null && <span style={{ color: 'var(--dim)', fontSize: 11 }}> · {yuzde(deger, onceki)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
          {(t.sert_ret || 0) > 0 && (
            <div style={{ fontSize: 12, color: '#b42318', marginBottom: 14 }}>
              {t.sert_ret} kişi "yazmayın / spam" dedi ({yuzde(t.sert_ret, t.gonderilen)}). Bu oran yükselirse numara ban riski artar; mesaj dilini ya da hedef kitleyi gözden geçirin.
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Şablon</th><th>Gönderim</th><th>Cevap</th><th>İlgi</th><th>Kayıt</th><th>Ödeme</th><th>Sert ret</th></tr>
              </thead>
              <tbody>
                {veri.sablonlar.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--dim)', padding: 20 }}>Bu dönemde gönderim yok</td></tr>}
                {veri.sablonlar.map(s => (
                  <tr key={s.sablon_id ?? 'yok'}>
                    <td style={{ fontWeight: 600 }}>{s.sablon}</td>
                    <td>{s.gonderilen}</td>
                    <td>{s.cevap} <span style={{ color: 'var(--dim)', fontSize: 11 }}>{yuzde(s.cevap, s.gonderilen)}</span></td>
                    <td>{s.ilgi}</td>
                    <td style={{ fontWeight: 600 }}>{s.kayit} <span style={{ color: 'var(--dim)', fontSize: 11, fontWeight: 400 }}>{yuzde(s.kayit, s.gonderilen)}</span></td>
                    <td style={{ fontWeight: 600, color: s.odeme ? '#1f6f4a' : undefined }}>{s.odeme}</td>
                    <td style={{ color: s.sert_ret ? '#b42318' : undefined }}>{s.sert_ret}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
