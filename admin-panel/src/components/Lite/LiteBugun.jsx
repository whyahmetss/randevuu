import { useState, useEffect } from 'react';
import { bookingUrl } from '../../lib/config';

// SıraGO Lite — esnafın tek ekranı (kullanıcı kararı 2026-10-08):
// bugünkü randevular, WhatsApp durumu, günlük ciro, hizmet/fiyat. Gerisi Pro görünümde.
const tl = (x) => `${Number(x || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} ₺`;
const bugunStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const saat = (s) => String(s || '').slice(0, 5);
const BEKLEYEN = ['onay_bekliyor', 'bekliyor', 'kapora_bekliyor'];
const DURUM = {
  onaylandi: ['Onaylı', 'tag-green'], onay_bekliyor: ['Onay bekliyor', 'tag-amber'], bekliyor: ['Onay bekliyor', 'tag-amber'],
  kapora_bekliyor: ['Kapora bekleniyor', 'tag-amber'], tamamlandi: ['Geldi ✓', 'tag-green'], gelmedi: ['Gelmedi', 'tag-red'], iptal: ['İptal', 'tag-red'],
};
const fiyatOf = (r) => Number(r.toplam_fiyat) || Number(r.fiyat) || 0;

export default function LiteBugun({ api, ayarlar, setSayfa }) {
  const [randevular, setRandevular] = useState(null);
  const [hizmetler, setHizmetler] = useState([]);
  const [wp, setWp] = useState(null);
  const [menu, setMenu] = useState(null);         // açık "⋯" menüsü (randevu id)
  const [fiyatlar, setFiyatlar] = useState({});   // düzenlenen fiyatlar
  const [kopyalandi, setKopyalandi] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  const yukle = () => {
    api.get(`/randevular?tarih=${bugunStr()}`).then(d => setRandevular((d?.randevular || []).sort((a, b) => String(a.saat).localeCompare(String(b.saat)))));
    api.get('/hizmetler').then(d => setHizmetler(d?.hizmetler || []));
    api.get('/bot/wp/durum').then(d => setWp(d?.hata ? { durum: 'bilinmiyor' } : d));
  };
  useEffect(() => { yukle(); const t = setInterval(yukle, 60000); return () => clearInterval(t); }, []);

  const bildir = (metin, tip = 'success') => { setMesaj({ metin, tip }); setTimeout(() => setMesaj(null), 3000); };

  const durumYap = async (r, durum) => {
    setMenu(null);
    if (durum === 'gelmedi' && !window.confirm(`${r.musteri_isim || 'Müşteri'} gelmedi olarak işaretlensin mi?`)) return;
    if (durum === 'iptal' && !window.confirm(`${r.musteri_isim || 'Müşteri'} randevusu iptal edilsin mi?`)) return;
    const d = await api.put(`/randevular/${r.id}/durum`, { durum });
    if (d?.hata) return bildir(d.hata, 'error');
    setRandevular(rs => rs.map(x => (x.id === r.id ? { ...x, durum } : x)));
  };

  const fiyatKaydet = async (h) => {
    const yeni = fiyatlar[h.id];
    if (yeni === undefined || Number(yeni) === Number(h.fiyat)) return;
    if (!(Number(yeni) >= 0)) return bildir('Fiyat sayı olmalı', 'error');
    const d = await api.put(`/hizmetler/${h.id}`, { ...h, fiyat: Number(yeni) });
    if (d?.hata) return bildir(d.hata, 'error');
    setHizmetler(hs => hs.map(x => (x.id === h.id ? { ...x, fiyat: Number(yeni) } : x)));
    setFiyatlar(f => { const k = { ...f }; delete k[h.id]; return k; });
    bildir(`${h.isim}: ${tl(yeni)} kaydedildi`);
  };

  const link = ayarlar?.slug ? bookingUrl(ayarlar.slug) : null;
  const kopyala = async () => {
    try { await navigator.clipboard.writeText(link); setKopyalandi(true); setTimeout(() => setKopyalandi(false), 2000); }
    catch { window.prompt('Linki kopyalayın:', link); }
  };

  const liste = randevular || [];
  const aktif = liste.filter(r => !['iptal', 'gelmedi'].includes(r.durum));
  const bekleyen = liste.filter(r => BEKLEYEN.includes(r.durum)).length;
  const gerceklesen = liste.filter(r => r.durum === 'tamamlandi').reduce((t, r) => t + fiyatOf(r), 0);
  const beklenen = aktif.filter(r => r.durum !== 'tamamlandi').reduce((t, r) => t + fiyatOf(r), 0);
  const wpBagli = wp?.durum === 'bagli';
  const tarihYazi = new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div style={{ maxWidth: 860 }}>
      {mesaj && <div className={`alert alert-${mesaj.tip}`} style={{ marginBottom: 12 }}>{mesaj.metin}</div>}

      {/* Üst özet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: 12, marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)', textTransform: 'capitalize' }}>{tarihYazi}</div>
          <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{aktif.length}</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>randevu{bekleyen ? <b style={{ color: '#a8590c' }}> · {bekleyen} onay bekliyor</b> : ''}</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>Bugünkü ciro</div>
          <div style={{ fontSize: 34, fontWeight: 600, lineHeight: 1.1, marginTop: 4, color: 'var(--green, #1f6f4a)', fontVariantNumeric: 'tabular-nums' }}>{tl(gerceklesen)}</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>+ {tl(beklenen)} bekleniyor</div>
        </div>
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>WhatsApp botu</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: wp === null ? '#c9c4bb' : wpBagli ? '#1f6f4a' : '#b42318' }} />
            {wp === null ? 'Kontrol ediliyor…' : wpBagli ? 'Bağlı, randevu alıyor' : 'Bağlı değil'}
          </div>
          {wp !== null && !wpBagli && (
            <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setSayfa('botbaglanti')}>Şimdi bağla</button>
          )}
        </div>
      </div>

      {/* Bugünkü randevular */}
      <div className="card" style={{ padding: 0, marginBottom: 16 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b>Bugünkü randevular</b>
          <button className="btn btn-ghost btn-sm" onClick={() => setSayfa('randevular')}>Tüm randevular →</button>
        </div>
        {randevular === null && <div className="list-empty" style={{ padding: 20 }}>Yükleniyor…</div>}
        {randevular && liste.length === 0 && (
          <div style={{ padding: 24, color: 'var(--dim)', fontSize: 14, textAlign: 'center' }}>
            Bugün randevu yok.{link ? ' Randevu linkini müşterilerinize gönderin 👇' : ''}
          </div>
        )}
        {liste.map(r => {
          const [etiket, sinif] = DURUM[r.durum] || [r.durum, ''];
          const bitti = ['tamamlandi', 'gelmedi', 'iptal'].includes(r.durum);
          return (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid var(--border)', opacity: ['iptal', 'gelmedi'].includes(r.durum) ? 0.55 : 1, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 20, fontWeight: 600, minWidth: 58, fontVariantNumeric: 'tabular-nums' }}>{saat(r.saat)}</div>
              <div style={{ flex: '1 1 160px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.musteri_isim || 'Müşteri'}</div>
                <div style={{ fontSize: 13, color: 'var(--dim)' }}>
                  {r.hizmetler_adlari || r.hizmet_isim || '—'}{fiyatOf(r) ? ` · ${tl(fiyatOf(r))}` : ''}{r.calisan_isim ? ` · ${r.calisan_isim}` : ''}
                </div>
              </div>
              <span className={`tag tag-sm ${sinif}`}>{etiket}</span>
              {!bitti && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                  {BEKLEYEN.includes(r.durum) && <button className="btn btn-secondary" onClick={() => durumYap(r, 'onaylandi')}>Onayla</button>}
                  <button className="btn btn-primary" onClick={() => durumYap(r, 'tamamlandi')}>Geldi ✓</button>
                  <button className="btn btn-ghost" aria-label="Diğer" title="Gelmedi / İptal" style={{ marginLeft: 6 }} onClick={() => setMenu(menu === r.id ? null : r.id)}>⋯</button>
                  {menu === r.id && (
                    <div className="card" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 20, padding: 6, minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
                      <button className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', color: '#b42318' }} onClick={() => durumYap(r, 'gelmedi')}>Gelmedi</button>
                      <button className="btn btn-ghost btn-block" style={{ justifyContent: 'flex-start', color: '#b42318' }} onClick={() => durumYap(r, 'iptal')}>İptal et</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
        {/* Randevu linki */}
        <div className="card" style={{ padding: 18 }}>
          <b>Online randevu linkiniz</b>
          <div style={{ fontSize: 13, color: 'var(--dim)', margin: '6px 0 12px' }}>Müşteri bu linkten saat seçer, telefonla uğraşmazsınız. Instagram ve Google profilinize de koyun.</div>
          {link ? (
            <>
              <div style={{ fontSize: 13, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, wordBreak: 'break-all', marginBottom: 10 }}>{link}</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-primary btn-sm" onClick={kopyala}>{kopyalandi ? 'Kopyalandı ✓' : 'Linki kopyala'}</button>
                <a className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }} target="_blank" rel="noopener noreferrer"
                  href={`https://wa.me/?text=${encodeURIComponent(`Randevunuzu buradan alabilirsiniz: ${link}`)}`}>WhatsApp'ta paylaş</a>
              </div>
            </>
          ) : (
            <button className="btn btn-primary btn-sm" onClick={() => setSayfa('qrkod')}>Linkimi oluştur</button>
          )}
        </div>

        {/* Hizmet ve fiyatlar */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <b>Hizmetler ve fiyatlar</b>
            <button className="btn btn-ghost btn-sm" onClick={() => setSayfa('hizmetler')}>Ekle / düzenle →</button>
          </div>
          {hizmetler.length === 0 && <div style={{ fontSize: 13, color: 'var(--dim)' }}>Henüz hizmet yok. Bot fiyat söyleyebilsin diye ekleyin.</div>}
          {hizmetler.filter(h => h.aktif !== false).map(h => (
            <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14 }}>{h.isim}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>{h.sure_dk} dk</div>
              </div>
              <input className="input" inputMode="numeric" aria-label={`${h.isim} fiyatı`}
                style={{ width: 96, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                value={fiyatlar[h.id] ?? Number(h.fiyat || 0)}
                onChange={e => setFiyatlar(f => ({ ...f, [h.id]: e.target.value.replace(/[^\d]/g, '') }))}
                onBlur={() => fiyatKaydet(h)} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
              <span style={{ fontSize: 13, color: 'var(--dim)' }}>₺</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
