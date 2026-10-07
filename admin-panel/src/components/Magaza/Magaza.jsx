import { useState, useEffect } from 'react';

// İşletme paneli — Mağaza: müşteriye ürün öner, linki kendi WhatsApp'ından paylaş, komisyonu takip et.
// SıraGO ödeme almaz; satış tedarikçinin sitesinde, işletmeye özel indirim koduyla olur.
const tl = (x) => { const n = Number(x || 0); return `${n.toLocaleString('tr-TR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₺`; };

export default function Magaza({ api, randevuId = null }) {
  const [tab, setTab] = useState('urunler');
  const [urunler, setUrunler] = useState(null);
  const [kazanc, setKazanc] = useState(null);
  const [kategori, setKategori] = useState('hepsi');
  const [oneri, setOneri] = useState(null);      // { urun, link, mesaj } | { urun, hata }
  const [hazirlaniyor, setHazirlaniyor] = useState(null);
  const [kopyalandi, setKopyalandi] = useState(false);

  useEffect(() => { api.get('/magaza/urunler').then(d => setUrunler(d?.urunler || [])); }, []);
  useEffect(() => { if (tab === 'kazanc') api.get('/magaza/kazanc').then(d => setKazanc(d?.hata ? null : d)); }, [tab]);

  const oner = async (urun) => {
    setHazirlaniyor(urun.id);
    const d = await api.post('/magaza/oner', { urun_id: urun.id, randevu_id: randevuId });
    setHazirlaniyor(null);
    setKopyalandi(false);
    setOneri(d?.hata ? { urun, hata: d.hata } : { urun, ...d });
  };

  const kopyala = async () => {
    try { await navigator.clipboard.writeText(oneri.mesaj); setKopyalandi(true); }
    catch { window.prompt('Mesajı kopyalayın:', oneri.mesaj); }
  };

  const kategoriler = ['hepsi', ...new Set((urunler || []).map(u => u.kategori).filter(Boolean))];
  const gorunen = (urunler || []).filter(u => kategori === 'hepsi' || u.kategori === kategori);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div className="tab-bar" style={{ marginBottom: 20, maxWidth: '100%', overflowX: 'auto' }}>
        {[['urunler', 'Ürünler'], ['kazanc', 'Kazancım']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`tab-btn${tab === id ? ' active' : ''}`}>{l}</button>
        ))}
      </div>

      {tab === 'urunler' && (
        <>
          <div className="info-banner" style={{ marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
            Müşterinize uygun ürünü seçin, linki kendi WhatsApp'ınızdan gönderin. Müşteri sizin indirim kodunuzla
            alırsa satıştan komisyon kazanırsınız. Ödeme, kargo ve iade tedarikçide; sizin stok tutmanız gerekmez.
          </div>

          {kategoriler.length > 2 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {kategoriler.map(k => (
                <button key={k} onClick={() => setKategori(k)} className={`pill pill-sm${kategori === k ? ' active' : ''}`}
                  style={kategori === k ? { background: 'var(--text)', color: 'var(--bg)', borderColor: 'var(--text)' } : undefined}>
                  {k === 'hepsi' ? 'Tümü' : k}
                </button>
              ))}
            </div>
          )}

          {urunler === null && <div className="list-empty">Yükleniyor…</div>}
          {urunler?.length === 0 && (
            <div className="empty-state">
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Henüz ürün yok</div>
              <div style={{ color: 'var(--dim)', fontSize: 13 }}>Anlaşmalı tedarikçilerin ürünleri eklendiğinde burada görünecek.</div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 44%), 1fr))', gap: 14 }}>
            {gorunen.map(u => (
              <div key={u.id} className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ aspectRatio: '4 / 3', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
                  {u.gorsel_url
                    ? <img src={u.gorsel_url} alt="" loading="lazy" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <span style={{ color: 'var(--muted)', fontSize: 12 }}>Görsel yok</span>}
                </div>
                <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                  <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>{u.tedarikci_isim}</div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{u.isim}</div>
                  {u.aciklama && <div style={{ fontSize: 12, color: 'var(--dim)', lineHeight: 1.5 }}>{u.aciklama}</div>}
                  <div className="row-between" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 'auto', paddingTop: 8 }}>
                    <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{u.fiyat ? tl(u.fiyat) : ''}</span>
                    <span style={{ fontSize: 11, color: 'var(--dim)' }}>%{Number(u.berber_komisyon_yuzde)} komisyon</span>
                  </div>
                  <button className="btn btn-primary btn-sm" disabled={hazirlaniyor === u.id} onClick={() => oner(u)} style={{ marginTop: 8, justifyContent: 'center' }}>
                    {hazirlaniyor === u.id ? 'Hazırlanıyor…' : 'Öner'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'kazanc' && (
        <>
          {!kazanc && <div className="list-empty">Yükleniyor…</div>}
          {kazanc && (
            <>
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                {[['Bu ay öneri', kazanc.buay.oneri], ['Tıklanma', kazanc.buay.tiklanma], ['Satış', kazanc.buay.satis],
                  ['Bu ay komisyon', tl(kazanc.buay.komisyon)]].map(([l, v]) => (
                  <div key={l} className="stat-card">
                    <div className="sc-label">{l}</div>
                    <div className="sc-val" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 16 }}>
                Toplam: {kazanc.toplam.satis} satış, {tl(kazanc.toplam.komisyon)} komisyon. Satışlar tedarikçinin aylık
                raporu geldiğinde işlenir; bu ayın satışları ay sonunda görünür.
              </div>
              <div className="card">
                <div className="card-title" style={{ marginBottom: 10 }}>Son öneriler</div>
                {kazanc.son_oneriler.length === 0 && <div className="list-empty">Henüz öneri göndermediniz.</div>}
                {kazanc.son_oneriler.map(o => (
                  <div key={o.kisa_kod} className="list-item">
                    <div className="list-item-body">
                      <div className="list-item-name">{o.urun_isim}</div>
                      <div className="list-item-sub">{new Date(o.olusturma).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    </div>
                    <span className={`tag tag-sm ${o.tiklanma > 0 ? 'tag-green' : ''}`}>{o.tiklanma} tıklanma</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {oneri && (
        <div onClick={() => setOneri(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>{oneri.urun.isim}</h2>
              <button onClick={() => setOneri(null)} className="modal-close">✕</button>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              {oneri.hata
                ? <div className="alert alert-warning">{oneri.hata}</div>
                : (
                  <>
                    <label className="form-label">Müşteriye gidecek mesaj</label>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.6, padding: '12px 14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, wordBreak: 'break-word' }}>
                      {oneri.mesaj}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button className="btn btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={kopyala}>{kopyalandi ? 'Kopyalandı' : 'Mesajı kopyala'}</button>
                      <a className="btn btn-primary" style={{ flex: 1, justifyContent: 'center', textDecoration: 'none' }}
                        href={`https://wa.me/?text=${encodeURIComponent(oneri.mesaj)}`} target="_blank" rel="noopener noreferrer">
                        WhatsApp'ta paylaş
                      </a>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
                      Mesaj sizin WhatsApp'ınızdan, seçtiğiniz kişiye gider. SıraGO kimseye otomatik mesaj atmaz.
                    </div>
                  </>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
