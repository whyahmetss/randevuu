import { useState, useEffect } from 'react';

// Esnaf getir (kullanıcı kararı 2026-10-09): esnafın kendi davet linki. Davet ettiği dükkan
// ilk ödemesini yapınca bu işletmenin paketi 1 ay uzar. Öncü Esnaf rozeti de burada görünür.
const kart = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 22px', marginBottom: 16 };

export default function EsnafGetir({ api }) {
  const [d, setD] = useState(null);
  const [oncu, setOncu] = useState(null);
  const [kopya, setKopya] = useState(false);

  useEffect(() => {
    api.get('/davet').then(x => !x?.hata && setD(x)).catch(() => {});
    api.get('/oncu').then(x => !x?.hata && setOncu(x)).catch(() => {});
  }, [api]);

  const mesaj = d ? `Selam, ben randevularımı SıraGO ile alıyorum; müşteri WhatsApp'tan ya da linkten kendisi randevu alıyor. 14 gün ücretsiz, bu linkten kurabilirsin: ${d.link}` : '';

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>Esnaf getir, bedava kullan</h1>
      <p style={{ color: 'var(--dim)', fontSize: 14, margin: '0 0 18px' }}>
        Tanıdığın bir esnaf senin linkinle kayıt olup ilk ödemesini yapınca <b style={{ color: 'var(--text)' }}>paketin 1 ay uzar</b>. Sınır yok: 6 esnaf getirirsen 6 ay bedava.
      </p>

      {oncu?.no ? (
        <div style={{ ...kart, background: 'rgba(168,89,12,.06)', borderColor: 'rgba(168,89,12,.25)' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#a8590c' }}>🏆 Öncü Esnaf #{oncu.no}</div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 4 }}>
            İlk 100 esnaftan birisin. Fiyatın ömür boyu sabit{oncu.kilitli_fiyat ? `: aylık ${Number(oncu.kilitli_fiyat).toLocaleString('tr-TR')}₺` : ''}. Zam gelse bile sana yansımaz.
          </div>
        </div>
      ) : oncu?.kalan > 0 ? (
        <div style={{ ...kart, background: 'rgba(168,89,12,.06)', borderColor: 'rgba(168,89,12,.25)' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#a8590c' }}>🏆 Öncü Esnaf ol — son {oncu.kalan} yer</div>
          <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 4 }}>İlk 100 ödeyen esnafın fiyatı ömür boyu sabit kalır. İlk ödemeni yaptığın an sıra numaran verilir.</div>
        </div>
      ) : null}

      <div style={kart}>
        <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 8 }}>Davet linkin</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input readOnly value={d?.link || 'Yükleniyor…'} onFocus={e => e.target.select()} className="input" style={{ flex: '1 1 260px', borderRadius: 10, fontSize: 13 }} />
          <button disabled={!d} onClick={() => { navigator.clipboard?.writeText(d.link).then(() => { setKopya(true); setTimeout(() => setKopya(false), 1800); }).catch(() => {}); }}
            style={{ padding: '10px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontWeight: 600, cursor: 'pointer' }}>
            {kopya ? '✓ Kopyalandı' : 'Kopyala'}
          </button>
          <a href={d ? `https://wa.me/?text=${encodeURIComponent(mesaj)}` : undefined} target="_blank" rel="noreferrer"
            style={{ padding: '10px 16px', borderRadius: 10, background: '#25d366', color: '#fff', fontWeight: 600, textDecoration: 'none', pointerEvents: d ? 'auto' : 'none' }}>
            💬 WhatsApp'tan gönder
          </a>
        </div>
        {d && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>Davet kodun: <b style={{ color: 'var(--text)' }}>{d.kod}</b> — kayıtta da yazılabilir.</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[['Kayıt olan', d?.gelen], ['Ödeme yapan', d?.odeyen], ['Kazandığın ay', d?.kazanilan_ay]].map(([ad, n]) => (
          <div key={ad} style={{ ...kart, marginBottom: 0, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>{ad}</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: ad === 'Kazandığın ay' ? '#1f6f4a' : 'var(--text)' }}>{n ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
