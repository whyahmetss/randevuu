import { useState, useEffect } from 'react';

// Mağaza (esnaf; kullanıcı kararı 2026-10-17 ile adı "SıraGO Vitrini"nden Mağaza oldu, sayfa kimliği yine 'vitrin'): SıraGO'nun dükkâna sattığı ürünler (tablet, stant, toptan şampuan…).
// Shopier sayfası gibi: fotoğraflı kart → detay → adet → sipariş. Ödeme linki varsa oraya gider.
const tl = (x) => `${Number(x).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
const DURUM = { yeni: 'Alındı', hazirlaniyor: 'Hazırlanıyor', kargoda: 'Kargoda', teslim: 'Teslim edildi', iptal: 'İptal' };

export function UrunKart({ u, onClick }) {
  const indirim = u.eski_fiyat && u.fiyat && u.eski_fiyat > u.fiyat ? Math.round((1 - u.fiyat / u.eski_fiyat) * 100) : 0;
  return (
    <button onClick={onClick} style={{ textAlign: 'left', padding: 0, border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ position: 'relative', aspectRatio: '1 / 1', background: 'var(--bg)' }}>
        {u.gorsel ? <img src={u.gorsel} alt={u.isim} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>📦</div>}
        {indirim > 0 && <span style={{ position: 'absolute', top: 8, left: 8, background: '#b42318', color: '#fff', fontWeight: 800, fontSize: 13, padding: '3px 8px', borderRadius: 8 }}>%{indirim}</span>}
        {u.stok === 0 && <span style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.5)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>Tükendi</span>}
      </div>
      <div style={{ padding: '10px 12px 12px' }}>
        <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{u.isim}</div>
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {u.fiyat !== null && <span style={{ fontSize: 17, fontWeight: 800, color: '#1f6f4a' }}>{tl(u.fiyat)}</span>}
          {indirim > 0 && <span style={{ fontSize: 13, color: 'var(--dim)', textDecoration: 'line-through' }}>{tl(u.eski_fiyat)}</span>}
          {u.fiyat === null && <span style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Fiyat için sor</span>}
        </div>
      </div>
    </button>
  );
}

export default function Vitrin({ api }) {
  const [urunler, setUrunler] = useState(null);
  const [siparisler, setSiparisler] = useState([]);
  const [acik, setAcik] = useState(null);
  const [adet, setAdet] = useState(1);
  const [notu, setNotu] = useState('');
  const [bekle, setBekle] = useState(false);
  const [sonuc, setSonuc] = useState(null);

  const yukle = () => {
    api.get('/magaza/vitrin').then(d => setUrunler(d?.urunler || []));
    api.get('/magaza/siparislerim').then(d => setSiparisler(d?.siparisler || []));
  };
  useEffect(yukle, []);

  const sec = (u) => { setAcik(u); setAdet(1); setNotu(''); setSonuc(null); };
  const siparisVer = async () => {
    setBekle(true);
    const d = await api.post('/magaza/siparis', { urun_id: acik.id, adet, notu });
    setBekle(false);
    if (d?.hata) return setSonuc({ hata: d.hata });
    if (d.odeme_linki) window.open(d.odeme_linki, '_blank', 'noopener');
    setSonuc({ tamam: d.odeme_linki ? 'Ödeme sayfası açıldı. Siparişin bize de düştü.' : 'Siparişin alındı! Ekibimiz seni arayıp teyit edecek.' });
    yukle();
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Mağaza</div>
        <div style={{ fontSize: 14, color: 'var(--dim)' }}>Dükkânın için tablet, stant ve malzeme — SıraGO'dan.</div>
      </div>

      {urunler === null ? <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>
        : urunler.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', border: '1px dashed var(--border)', borderRadius: 16 }}>Mağaza yakında dolacak.</div>
        : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {urunler.map(u => <UrunKart key={u.id} u={u} onClick={() => sec(u)} />)}
          </div>}

      {siparisler.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Siparişlerim</div>
          {siparisler.map(s => (
            <div key={s.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}>
              <span style={{ flex: 1 }}>{s.urun_isim} × {s.adet}</span>
              {s.tutar && <span style={{ fontWeight: 700 }}>{tl(s.tutar)}</span>}
              <span style={{ color: s.durum === 'iptal' ? '#b42318' : '#1f6f4a', fontWeight: 700 }}>{DURUM[s.durum] || s.durum}</span>
              {s.kargo_takip && <span style={{ flexBasis: '100%', fontSize: 12, color: 'var(--dim)' }}>📦 {s.kargo_firma || 'Kargo'} · takip no: <b style={{ color: 'var(--text)' }}>{s.kargo_takip}</b></span>}
            </div>
          ))}
        </div>
      )}

      {acik && (
        <div role="dialog" aria-modal="true" aria-label={acik.isim} onClick={() => setAcik(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: 'var(--surface)', borderRadius: '22px 22px 0 0', maxHeight: '92vh', overflowY: 'auto', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div style={{ position: 'relative' }}>
              {acik.gorsel ? <img src={acik.gorsel} alt={acik.isim} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', background: 'var(--bg)', display: 'block' }} />
                : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, background: 'var(--bg)' }}>📦</div>}
              <button onClick={() => setAcik(null)} aria-label="Kapat" style={{ position: 'absolute', top: 12, right: 12, width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 21, fontWeight: 800 }}>{acik.isim}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                {acik.fiyat !== null && <span style={{ fontSize: 24, fontWeight: 800, color: '#1f6f4a' }}>{tl(acik.fiyat)}</span>}
                {acik.eski_fiyat > acik.fiyat && <span style={{ fontSize: 15, color: 'var(--dim)', textDecoration: 'line-through' }}>{tl(acik.eski_fiyat)}</span>}
              </div>
              {acik.aciklama && <div style={{ fontSize: 15, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{acik.aciklama}</div>}
              {acik.stok !== null && acik.stok > 0 && acik.stok <= 10 && <div style={{ fontSize: 14, color: '#a8590c', fontWeight: 700 }}>Son {acik.stok} adet</div>}
              {sonuc?.tamam ? (
                <div style={{ padding: 14, borderRadius: 14, background: 'rgba(31,111,74,.1)', color: '#1f6f4a', fontWeight: 700 }}>{sonuc.tamam}</div>
              ) : acik.stok === 0 ? (
                <div style={{ padding: 14, borderRadius: 14, background: 'var(--bg)', fontWeight: 700, textAlign: 'center' }}>Şu an tükendi</div>
              ) : (<>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>Adet</span>
                  <button onClick={() => setAdet(a => Math.max(1, a - 1))} aria-label="Azalt" style={adetBtn}>−</button>
                  <span style={{ minWidth: 30, textAlign: 'center', fontSize: 20, fontWeight: 800 }}>{adet}</span>
                  <button onClick={() => setAdet(a => Math.min(acik.stok ?? 100, a + 1))} aria-label="Artır" style={adetBtn}>+</button>
                </div>
                <input value={notu} onChange={e => setNotu(e.target.value)} placeholder="Not (renk, adres, teslim saati…)" className="input" style={{ height: 50, fontSize: 16, borderRadius: 12 }} />
                {sonuc?.hata && <div style={{ color: '#b42318', fontWeight: 600 }}>{sonuc.hata}</div>}
                <button onClick={siparisVer} disabled={bekle} style={{ height: 58, border: 'none', borderRadius: 16, background: '#1f6f4a', color: '#fff', fontSize: 18, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>
                  {bekle ? 'Gönderiliyor…' : `${acik.odeme_linki ? 'Satın al' : 'Sipariş ver'}${acik.fiyat !== null ? ` · ${tl(acik.fiyat * adet)}` : ''}`}
                </button>
                <div style={{ fontSize: 13, color: 'var(--dim)', textAlign: 'center' }}>{acik.odeme_linki ? 'Güvenli ödeme sayfasına yönlendirileceksin.' : 'Ödeme yok — ekibimiz arayıp teyit eder.'}</div>
              </>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const adetBtn = { width: 48, height: 48, borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 22, fontWeight: 700, cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' };
