import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/config';
import { useCanliYenile } from '../../lib/socket';

// Özel tasarımlar (2026-10-29): süper adminin eklediği video/görsel arka planlı sayfa tasarımları.
// Sahip olunan ve ücretsiz tasarım seçilir; ücretli olan Shopier'den tek seferlik alınır, ödeme gelince sayfada açılır.
export const tasarimMedyaUrl = (t, tur) => (t?.medya?.[tur] ? `${API_URL}/tasarim-medya/${t.id}/${tur}?v=${t.medya[tur].v}` : null);

export function TasarimOnizleme({ t, yukseklik = 120 }) {
  const arka = t.medya?.arka, poster = tasarimMedyaUrl(t, 'poster');
  const koyu = t.stil?.mod !== 'acik';
  return (
    <div style={{ position: 'relative', height: yukseklik, overflow: 'hidden', background: koyu ? '#111' : '#f4f1ea' }}>
      {arka?.mime?.startsWith('video/')
        ? <video src={tasarimMedyaUrl(t, 'arka')} poster={poster || undefined} muted loop autoPlay playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        : (arka || poster) && <img src={tasarimMedyaUrl(t, 'arka') || poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      <div style={{ position: 'absolute', inset: 0, background: koyu ? `rgba(0,0,0,${t.stil?.karartma ?? .45})` : `rgba(255,255,255,${t.stil?.karartma ?? .45})` }} />
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ height: 14, background: i ? (t.stil?.vurgu || '#2fd27a') : (koyu ? 'rgba(0,0,0,.75)' : 'rgba(255,255,255,.85)'),
            borderRadius: t.stil?.buton === 'yuvarlak' ? 999 : t.stil?.buton === 'kare' ? 2 : 0,
            clipPath: t.stil?.buton === 'yirtik' ? 'polygon(0 12%,8% 0,20% 10%,35% 2%,52% 12%,70% 0,86% 10%,100% 3%,100% 90%,88% 100%,72% 88%,55% 100%,38% 90%,20% 100%,6% 88%,0 100%)' : undefined }} />
        ))}
      </div>
    </div>
  );
}

export default function OzelTasarimlar({ api, kart, baslik, degisti }) {
  const [d, setD] = useState(null);
  const [bekle, setBekle] = useState(null);
  const yukle = () => api.get('/randevu-sayfasi/tasarimlar').then(x => { if (x && !x.hata) setD(x); }).catch(() => {});
  useEffect(() => { yukle(); }, []);
  // Shopier ödemesi gelince tasarım işletmenin olur ve sayfada açılır: liste kendiliğinden tazelenir
  useCanliYenile(() => { yukle(); degisti?.(); }, ['veri:degisti', 'bildirim:yeni']);
  if (!d || !d.tasarimlar?.length) return null;   // henüz tasarım eklenmediyse kart görünmez

  const sec = async (id) => {
    setBekle(id ?? 'kaldir');
    const x = await api.put('/randevu-sayfasi/tasarim', { tasarim_id: id });
    setBekle(null);
    if (x?.hata) return alert(x.hata);
    setD(o => ({ ...o, secili: id }));
    degisti?.();
  };
  // Açılır pencere engeline takılmasın: sekme tıklama anında açılır, Shopier adresi gelince yönlenir
  const satinAl = async (t) => {
    if (!window.confirm(`"${t.isim}" tasarımı: ${Number(t.fiyat).toLocaleString('tr-TR')}₺, tek seferlik.\n\nShopier ödeme sayfası açılacak. Ödeme gelince tasarım sayfanda kendiliğinden açılır.`)) return;
    const w = window.open('', '_blank');
    setBekle('al' + t.id);
    const x = await api.post(`/randevu-sayfasi/tasarim/${t.id}/satin-al`, {});
    setBekle(null);
    if (!x?.url) { w?.close(); return alert(x?.hata || 'Ödeme sayfası açılamadı, lütfen tekrar deneyin.'); }
    if (w) w.location.href = x.url; else window.location.href = x.url;
  };

  return (
    <div style={kart}>
      {baslik('Özel tasarımlar', 'Videolu ve özel görünümlü sayfa. Seçtiğin tasarım temanın yerine geçer.')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {d.tasarimlar.map(t => {
          const secili = d.secili === t.id;
          return (
            <div key={t.id} style={{ borderRadius: 14, overflow: 'hidden', border: `2px solid ${secili ? '#1f6f4a' : 'var(--border)'}`, background: 'var(--surface)' }}>
              <TasarimOnizleme t={t} />
              <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{secili ? '✓ ' : ''}{t.isim}</div>
                {t.aciklama && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{t.aciklama}</div>}
                {secili
                  ? <button onClick={() => sec(null)} disabled={!!bekle} className="btn btn-ghost btn-sm">Kaldır</button>
                  : t.sahip
                    ? <button onClick={() => sec(t.id)} disabled={!!bekle} className="btn btn-primary btn-sm">{bekle === t.id ? '…' : t.fiyat > 0 ? 'Kullan' : 'Ücretsiz kullan'}</button>
                    : <button onClick={() => satinAl(t)} disabled={!!bekle} className="btn btn-primary btn-sm">{bekle === 'al' + t.id ? 'Açılıyor…' : `Satın al · ${Number(t.fiyat).toLocaleString('tr-TR')}₺`}</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
