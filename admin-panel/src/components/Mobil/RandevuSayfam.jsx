import { useState, useEffect, useRef } from 'react';
import { bookingUrl, API_URL } from '../../lib/config';
import OzelTasarimlar from './OzelTasarimlar';

// Randevu sayfam (kullanıcı kararı 2026-10-14): esnaf müşterinin gördüğü sayfayı kendine göre ayarlar.
// Hazır tema + tek vurgu rengi (serbest renk yok: okunmaz sayfa çıkmasın), kapak, logo, kısa tanıtım; altta canlı önizleme.
const TEMA = {
  sade: { ad: 'Sade', kime: 'Her dükkân', bg: '#f6f5f2', yuzey: '#ffffff', yazi: '#1b1a17', vurgu: '#1f6f4a' },
  klasik: { ad: 'Klasik Berber', kime: 'Berber', bg: '#1b1a18', yuzey: '#24221f', yazi: '#f3eee5', vurgu: '#c9973f' },
  gece: { ad: 'Gece', kime: 'Dövme, erkek kuaför', bg: '#0d100e', yuzey: '#151916', yazi: '#eef3ef', vurgu: '#2fd27a' },
  pudra: { ad: 'Pudra', kime: 'Güzellik, kadın kuaför', bg: '#fbf3f0', yuzey: '#ffffff', yazi: '#2c201d', vurgu: '#c2637c' },
  klinik: { ad: 'Klinik', kime: 'Diş, veteriner', bg: '#f2f8f9', yuzey: '#ffffff', yazi: '#12262b', vurgu: '#0f8b8d' },
};

// Fotoğraf tarayıcıda küçültülür: kapak 1600px, galeri 1400px genişlik; logo ve ekip fotoğrafı 400×400 kare (ortadan kırpılır)
export function kucult(dosya, tur) {
  return new Promise((coz, red) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const x = c.getContext('2d');
      if (tur === 'logo' || tur === 'kisi') {
        const k = Math.min(img.width, img.height);
        c.width = c.height = 400;
        x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 400);
        x.drawImage(img, (img.width - k) / 2, (img.height - k) / 2, k, k, 0, 0, 400, 400);
      } else {
        const o = Math.min(1, (tur === 'galeri' ? 1400 : 1600) / img.width);
        c.width = Math.round(img.width * o); c.height = Math.round(img.height * o);
        x.drawImage(img, 0, 0, c.width, c.height);
      }
      URL.revokeObjectURL(img.src);
      coz(c.toDataURL('image/jpeg', 0.84));
    };
    img.onerror = () => red(new Error('Fotoğraf okunamadı'));
    img.src = URL.createObjectURL(dosya);
  });
}

export default function RandevuSayfam({ api }) {
  const [d, setD] = useState(null);
  const [tanitim, setTanitim] = useState('');
  const [bekle, setBekle] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [onizlemeV, setOnizlemeV] = useState(0);
  const [hakkimizda, setHakkimizda] = useState('');
  const [instagram, setInstagram] = useState('');
  const [uzmanlik, setUzmanlik] = useState({});   // çalışan id → yazılan uzmanlık
  const [indirim, setIndirim] = useState({ aktif: false, tur: 'yuzde', deger: '', bitis: '' });   // ilk randevu indirimi
  const kapakRef = useRef(), logoRef = useRef(), galeriRef = useRef(), kisiRef = useRef();
  const kisiId = useRef(null);

  useEffect(() => { api.get('/randevu-sayfasi').then(x => { if (x && !x.hata) {
    setD(x); setTanitim(x.tanitim || ''); setHakkimizda(x.hakkimizda || ''); setInstagram(x.instagram || '');
    const k = x.ilk_indirim || {};
    setIndirim({ aktif: !!k.aktif, tur: k.tur || 'yuzde', deger: k.deger != null ? String(k.deger) : '', bitis: k.bitis || '' });
    setUzmanlik(Object.fromEntries((x.ekip || []).map(c => [c.id, c.uzmanlik || ''])));
  } }); }, []);

  // Galeri ve ekip ayrı adreslere kaydedilir; cevap güncel listeyi döner
  const istek = async (yontem, yol, govde, ne) => {
    setBekle(ne); setMesaj(null);
    const x = await api[yontem](yol, govde);
    setBekle(null);
    if (!x || x.hata) { setMesaj({ hata: x?.hata || 'Kaydedilemedi' }); return false; }
    setD(o => ({ ...o, ...x })); setOnizlemeV(v => v + 1);
    setMesaj({ tamam: 'Kaydedildi — müşterilerin bunu görüyor.' });
    setTimeout(() => setMesaj(null), 2500);
    return true;
  };
  const galeriEkle = async (dosyalar) => {
    const yer = (d.galeri_limit || 12) - (d.galeri || []).length;
    const liste = Array.from(dosyalar || []).slice(0, Math.max(0, yer));
    if (!liste.length) return setMesaj({ hata: `Galeride en fazla ${d.galeri_limit || 12} fotoğraf olabilir.` });
    for (const f of liste) {
      try { if (!(await istek('post', '/randevu-sayfasi/galeri', { veri: await kucult(f, 'galeri') }, 'galeri'))) break; }
      catch (e) { setMesaj({ hata: e.message }); break; }
    }
  };
  const kisiFoto = async (dosya) => {
    if (!dosya || !kisiId.current) return;
    try { await istek('put', `/randevu-sayfasi/ekip/${kisiId.current}`, { foto: await kucult(dosya, 'kisi') }, 'kisi' + kisiId.current); }
    catch (e) { setMesaj({ hata: e.message }); }
  };

  const kaydet = async (govde, ne) => {
    setBekle(ne); setMesaj(null);
    const x = await api.put('/randevu-sayfasi', govde);
    setBekle(null);
    if (x?.hata) return setMesaj({ hata: x.hata });
    setD(o => ({ ...o, ...x })); setOnizlemeV(v => v + 1);
    setMesaj({ tamam: 'Kaydedildi — müşterilerin bunu görüyor.' });
    setTimeout(() => setMesaj(null), 2500);
  };
  const fotoSec = async (dosya, tur) => {
    if (!dosya) return;
    try { await kaydet({ [tur]: await kucult(dosya, tur) }, tur); } catch (e) { setMesaj({ hata: e.message }); }
  };

  if (!d) return <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>;
  const link = d.slug ? bookingUrl(d.slug) : null;
  const vurgular = d.vurgular || [];
  const kart = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 16, marginBottom: 14 };
  const baslik = (m, alt) => (<div style={{ marginBottom: 10 }}><div style={{ fontSize: 16, fontWeight: 800 }}>{m}</div>{alt && <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>{alt}</div>}</div>);
  const resimKutusu = (tur, ref, ad, aciklama, oran) => (
    <div style={{ flex: oran === 'kare' ? '0 0 140px' : '1 1 260px' }}>
      <div onClick={() => ref.current?.click()} role="button" aria-label={`${ad} yükle`}
        style={{ aspectRatio: oran === 'kare' ? '1 / 1' : '16 / 7', borderRadius: 14, border: '2px dashed var(--border)', background: 'var(--bg)', cursor: 'pointer',
          overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontWeight: 600, fontSize: 14, textAlign: 'center', padding: d[tur] ? 0 : 10 }}>
        {bekle === tur ? 'Yükleniyor…' : d[tur]
          ? <img src={`${API_URL}/book/${d.slug}/gorsel/${tur}?v=${d.v}`} alt={ad} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <>📷 {ad}<br />{aciklama}</>}
      </div>
      <input ref={ref} type="file" accept="image/*" hidden onChange={e => { fotoSec(e.target.files?.[0], tur); e.target.value = ''; }} />
      {d[tur] && <button onClick={() => kaydet({ [tur]: null }, tur)} style={{ marginTop: 6, border: 'none', background: 'none', color: '#b42318', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}>Kaldır</button>}
    </div>
  );

  const kayitliIndirim = d.ilk_indirim || {};
  const indirimDegisti = indirim.aktif !== !!kayitliIndirim.aktif || indirim.tur !== (kayitliIndirim.tur || 'yuzde')
    || indirim.deger !== (kayitliIndirim.deger != null ? String(kayitliIndirim.deger) : '') || indirim.bitis !== (kayitliIndirim.bitis || '');
  const indirimYazi = indirim.tur === 'tl' ? `${indirim.deger || '…'} ₺` : `%${indirim.deger || '…'}`;
  const secenek = (secili) => ({ flex: 1, height: 40, borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    border: `2px solid ${secili ? '#1f6f4a' : 'var(--border)'}`, background: secili ? 'rgba(31,111,74,.08)' : 'var(--surface)', color: 'var(--text)' });

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={kart}>
        {baslik('🎁 İlk randevuya indirim', 'Yeni müşteri çekmek için: sayfanın en üstünde kampanya şeridi çıkar, ilk kez gelen müşterinin randevusuna indirim kendiliğinden uygulanır. Hangi hizmetlerde geçerli olduğunu Hizmetler\'den seçersin.')}
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 15, fontWeight: 700, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={indirim.aktif} onChange={e => setIndirim({ ...indirim, aktif: e.target.checked })} style={{ width: 20, height: 20 }} />
          Kampanya açık
        </label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={() => setIndirim({ ...indirim, tur: 'yuzde' })} style={secenek(indirim.tur === 'yuzde')} aria-pressed={indirim.tur === 'yuzde'}>Yüzde (%)</button>
          <button type="button" onClick={() => setIndirim({ ...indirim, tur: 'tl' })} style={secenek(indirim.tur === 'tl')} aria-pressed={indirim.tur === 'tl'}>Tutar (₺)</button>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label style={{ flex: '1 1 140px', fontSize: 13, color: 'var(--dim)' }}>
            {indirim.tur === 'tl' ? 'Kaç ₺ indirim' : 'Yüzde kaç'}
            <input className="input" type="number" min="1" max={indirim.tur === 'tl' ? undefined : 90} inputMode="decimal" value={indirim.deger}
              onChange={e => setIndirim({ ...indirim, deger: e.target.value })} placeholder={indirim.tur === 'tl' ? '100' : '20'} style={{ width: '100%', marginTop: 4, fontSize: 15 }} />
          </label>
          <label style={{ flex: '1 1 160px', fontSize: 13, color: 'var(--dim)' }}>
            Bitiş tarihi (boş = süresiz)
            <input className="input" type="date" value={indirim.bitis} onChange={e => setIndirim({ ...indirim, bitis: e.target.value })} style={{ width: '100%', marginTop: 4, fontSize: 15 }} />
          </label>
        </div>
        {indirim.aktif && <div style={{ marginTop: 10, fontSize: 13, color: 'var(--dim)' }}>Müşteri sayfada şunu görür: <b style={{ color: 'var(--text)' }}>🎁 İlk randevuna {indirimYazi} indirim</b></div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-primary" disabled={bekle === 'indirim' || !indirimDegisti}
            onClick={() => kaydet({ ilk_indirim: { ...indirim, bitis: indirim.bitis || null } }, 'indirim')}>{bekle === 'indirim' ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </div>

      <div style={kart}>
        {baslik('Fotoğraflar', 'Kapak fotoğrafı sayfanın en üstünde, Instagram profilindeki gibi görünür. Dükkânının içi ya da vitrini olabilir.')}
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {resimKutusu('kapak', kapakRef, 'Kapak fotoğrafı', 'yatay, geniş', 'genis')}
          {resimKutusu('logo', logoRef, 'Logo', 'kare', 'kare')}
        </div>
      </div>

      <div style={kart}>
        {baslik(`Galeri (${(d.galeri || []).length}/${d.galeri_limit || 12})`, 'Yaptığın işlerden, dükkânından fotoğraflar. Müşteri randevu almadan önce görür; Instagram\'daki en iyi fotoğraflarını buraya da koy.')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 }}>
          {(d.galeri || []).map((g, i) => (
            <div key={g.id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg)' }}>
              <img src={`${API_URL}/book/${d.slug}/galeri/${g.id}`} alt="" style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', display: 'block' }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px' }}>
                <button disabled={i === 0 || !!bekle} onClick={() => istek('put', `/randevu-sayfasi/galeri/${g.id}`, { yon: -1 }, 'galeri')} aria-label="Sola al"
                  style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text)', opacity: i === 0 ? .3 : 1, padding: '2px 6px' }}>‹</button>
                <button disabled={!!bekle} onClick={() => istek('delete', `/randevu-sayfasi/galeri/${g.id}`, undefined, 'galeri')}
                  style={{ border: 'none', background: 'none', color: '#b42318', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Kaldır</button>
                <button disabled={i === d.galeri.length - 1 || !!bekle} onClick={() => istek('put', `/randevu-sayfasi/galeri/${g.id}`, { yon: 1 }, 'galeri')} aria-label="Sağa al"
                  style={{ border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text)', opacity: i === d.galeri.length - 1 ? .3 : 1, padding: '2px 6px' }}>›</button>
              </div>
            </div>
          ))}
          {(d.galeri || []).length < (d.galeri_limit || 12) && (
            <button onClick={() => galeriRef.current?.click()} disabled={bekle === 'galeri'}
              style={{ aspectRatio: '1 / 1', borderRadius: 12, border: '2px dashed var(--border)', background: 'var(--bg)', cursor: 'pointer', color: 'var(--dim)', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
              {bekle === 'galeri' ? 'Yükleniyor…' : <>＋<br />Fotoğraf ekle</>}
            </button>
          )}
        </div>
        <input ref={galeriRef} type="file" accept="image/*" multiple hidden onChange={e => { galeriEkle(e.target.files); e.target.value = ''; }} />
      </div>

      <OzelTasarimlar api={api} kart={kart} baslik={baslik} degisti={() => setOnizlemeV(v => v + 1)} />

      <div style={kart}>
        {baslik('Tema', 'Dükkânına uyan görünümü seç.')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
          {Object.entries(TEMA).map(([k, t]) => {
            const secili = d.tema === k;
            return (
              <button key={k} onClick={() => kaydet({ tema: k, vurgu: null }, 'tema')} aria-pressed={secili}
                style={{ padding: 0, borderRadius: 14, overflow: 'hidden', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  border: `2px solid ${secili ? '#1f6f4a' : 'var(--border)'}`, background: 'var(--surface)' }}>
                <div style={{ background: t.bg, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ height: 8, width: '60%', borderRadius: 4, background: t.yazi, opacity: .85 }} />
                  <div style={{ background: t.yuzey, borderRadius: 6, padding: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 3, background: t.vurgu }} />
                    <div style={{ height: 6, flex: 1, borderRadius: 3, background: t.yazi, opacity: .35 }} />
                  </div>
                  <div style={{ height: 14, borderRadius: 5, background: t.vurgu }} />
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{secili ? '✓ ' : ''}{t.ad}</div>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>{t.kime}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>Vurgu rengi <span style={{ fontWeight: 500, color: 'var(--dim)' }}>(butonlar ve seçili kutular)</span></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => kaydet({ vurgu: null }, 'vurgu')} style={{ height: 36, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
            border: `2px solid ${!d.vurgu ? '#1f6f4a' : 'var(--border)'}`, background: 'var(--surface)', color: 'var(--text)' }}>Temanın rengi</button>
          {vurgular.map(r => (
            <button key={r} onClick={() => kaydet({ vurgu: r }, 'vurgu')} aria-label={`Renk ${r}`} aria-pressed={d.vurgu === r}
              style={{ width: 36, height: 36, borderRadius: '50%', background: r, cursor: 'pointer', border: d.vurgu === r ? '3px solid var(--text)' : '3px solid transparent', boxShadow: '0 0 0 1px var(--border)' }} />
          ))}
        </div>
      </div>

      <div style={kart}>
        {baslik('Kısa tanıtım', 'Bir iki cümle yeter. Örn: "2015\'ten beri Kadıköy\'de. Randevulu çalışıyoruz, beklemeden tıraş olun."')}
        <textarea className="input" rows={3} maxLength={300} value={tanitim} onChange={e => setTanitim(e.target.value)} placeholder="Dükkânını müşteriye anlat…" style={{ width: '100%', fontSize: 15, borderRadius: 12 }} />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--dim)' }}>{tanitim.length}/300</span>
          <button className="btn btn-primary" disabled={bekle === 'tanitim' || tanitim === (d.tanitim || '')} onClick={() => kaydet({ tanitim }, 'tanitim')}>{bekle === 'tanitim' ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
      </div>

      <div style={kart}>
        {baslik('Hakkımızda', 'Dükkânının hikâyesi: ne zamandan beri buradasın, neyi iyi yaparsın, müşteriyi nasıl karşılarsın. Sayfanın altında görünür.')}
        <textarea className="input" rows={5} maxLength={1500} value={hakkimizda} onChange={e => setHakkimizda(e.target.value)}
          placeholder="Örn: 2015'ten beri Kadıköy'deyiz. Usta kadromuzla klasik ve modern kesimler, sıcak havlu ile ustura tıraşı yapıyoruz…" style={{ width: '100%', fontSize: 15, borderRadius: 12 }} />
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 8 }}>
          <span style={{ flex: 1, fontSize: 12, color: 'var(--dim)' }}>{hakkimizda.length}/1500</span>
          <button className="btn btn-primary" disabled={bekle === 'hakkimizda' || hakkimizda === (d.hakkimizda || '')} onClick={() => kaydet({ hakkimizda }, 'hakkimizda')}>{bekle === 'hakkimizda' ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, margin: '16px 0 8px' }}>Instagram <span style={{ fontWeight: 500, color: 'var(--dim)' }}>(kullanıcı adın ya da profil linkin)</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@dukkanin" style={{ flex: 1, fontSize: 15, borderRadius: 12 }} aria-label="Instagram kullanıcı adı" />
          <button className="btn btn-primary" disabled={bekle === 'instagram' || instagram === (d.instagram || '')}
            onClick={async () => { await kaydet({ instagram }, 'instagram'); }}>{bekle === 'instagram' ? '…' : 'Kaydet'}</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 8 }}>Adres ve çalışma saatleri Ayarlar'dan gelir; sayfada "Yol tarifi al" düğmesiyle görünür.</div>
      </div>

      {(d.ekip || []).length > 0 && (
        <div style={kart}>
          {baslik('Ekibin', 'Fotoğraf ve uzmanlık eklediğin çalışanlar sayfada "Ekibimiz" bölümünde görünür. Boş bırakılanlar görünmez.')}
          {d.ekip.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { kisiId.current = c.id; kisiRef.current?.click(); }} aria-label={`${c.isim} fotoğrafı`}
                style={{ width: 56, height: 56, borderRadius: '50%', overflow: 'hidden', border: '2px dashed var(--border)', background: 'var(--bg)', cursor: 'pointer', padding: 0, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit' }}>
                {bekle === 'kisi' + c.id ? '…' : c.foto_v
                  ? <img src={`${API_URL}/book/${d.slug}/ekip/${c.id}/foto?v=${c.foto_v}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '📷'}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.isim}</div>
                <input className="input" maxLength={80} value={uzmanlik[c.id] ?? ''} placeholder="Uzmanlık (örn: Sakal, ustura tıraşı)"
                  onChange={e => setUzmanlik(u => ({ ...u, [c.id]: e.target.value }))}
                  onBlur={() => { if ((uzmanlik[c.id] ?? '') !== (c.uzmanlik || '')) istek('put', `/randevu-sayfasi/ekip/${c.id}`, { uzmanlik: uzmanlik[c.id] ?? '' }, 'uzmanlik'); }}
                  style={{ width: '100%', fontSize: 14, borderRadius: 10, marginTop: 4 }} aria-label={`${c.isim} uzmanlık`} />
              </div>
              {c.foto_v && <button onClick={() => istek('put', `/randevu-sayfasi/ekip/${c.id}`, { foto: null }, 'kisi' + c.id)}
                style={{ border: 'none', background: 'none', color: '#b42318', fontWeight: 600, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Fotoğrafı kaldır</button>}
            </div>
          ))}
          <input ref={kisiRef} type="file" accept="image/*" hidden onChange={e => { kisiFoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}

      {mesaj && <div className={`alert alert-${mesaj.hata ? 'error' : 'success'}`}>{mesaj.hata || mesaj.tamam}</div>}

      {link && (
        <div style={kart}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>{baslik('Önizleme', 'Müşterinin telefonunda böyle görünür.')}</div>
            <a href={link} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: '#1f6f4a', textDecoration: 'none' }}>Yeni sekmede aç ↗</a>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <iframe key={onizlemeV} title="Randevu sayfası önizleme" src={`${link}${link.includes('?') ? '&' : '?'}onizleme=${onizlemeV}`}
              style={{ width: 390, maxWidth: '100%', height: 720, border: '1px solid var(--border)', borderRadius: 24, background: '#fff' }} />
          </div>
        </div>
      )}
    </div>
  );
}
