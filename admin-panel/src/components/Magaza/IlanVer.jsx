import { useState, useEffect, useRef } from 'react';
import { UrunKart } from './Vitrin';

// Kurucu: SıraGO Mağazası'na ilan ver (Shopier gibi). Fotoğraf tarayıcıda küçültülür (~1000px JPEG).
const BOS = { isim: '', fiyat: '', eski_fiyat: '', aciklama: '', kategori: '', stok: '', odeme_linki: '', aktif: true, sira: 0, gorsel: null, kisisel_qr: false };
const DURUMLAR = [['yeni', 'Yeni'], ['hazirlaniyor', 'Hazırlanıyor'], ['kargoda', 'Kargoda'], ['teslim', 'Teslim'], ['iptal', 'İptal']];
const ODEME = [['bekliyor', 'Ödeme bekliyor'], ['odendi', 'Ödendi'], ['iade', 'İade edildi']];
const DURUM_RENK = { yeni: '#b42318', hazirlaniyor: '#a8590c', kargoda: '#2f56c6', teslim: '#1f6f4a', iptal: '#6f6a62' };
const tl = (x) => `${Number(x || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ₺`;
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const waTel = (t) => { let d = String(t || '').replace(/\D/g, ''); if (d.startsWith('0')) d = '9' + d; if (d.length === 10) d = '90' + d; return d; };

// Tek sipariş satırı: durum/ödeme seçimi hemen kaydedilir; kargo ve not "Kaydet" ile
function SiparisSatiri({ s, api, yenile }) {
  const [acik, setAcik] = useState(false);
  const [k, setK] = useState({ kargo_firma: s.kargo_firma || '', kargo_takip: s.kargo_takip || '', admin_notu: s.admin_notu || '' });
  const kaydet = async (govde) => {
    const d = await api.put(`/admin/magaza/siparisler/${s.id}`, govde);
    if (d?.hata) return alert(d.hata);
    if (d?.bildirildi) alert('Esnafa WhatsApp\'tan bilgi gitti.');
    yenile();
  };
  const durumSec = (v) => {
    if (v === 'kargoda' && !k.kargo_takip && !confirm('Takip numarası girmeden "Kargoda" yapılsın mı? (Esnafa takip no gitmez)')) return;
    kaydet({ durum: v, ...(v === 'kargoda' ? { kargo_firma: k.kargo_firma, kargo_takip: k.kargo_takip } : {}) });
  };
  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px', opacity: s.durum === 'iptal' ? 0.6 : 1 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: 'var(--dim)', minWidth: 34 }}>#{s.id}</span>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>{s.isletme_isim || 'İşletme'} {s.demo && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 5, background: 'rgba(93,75,181,.12)', color: '#5d4bb5' }}>DEMO · rapora girmez</span>}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>{s.urun_isim} × {s.adet} · {tarih(s.olusturma)}{s.isletme_ilce ? ` · ${s.isletme_ilce}` : ''}</div>
        </div>
        <b style={{ minWidth: 90, textAlign: 'right' }}>{s.tutar ? tl(s.tutar) : '—'}</b>
        <select className="input" value={s.odeme_durumu || 'bekliyor'} onChange={e => kaydet({ odeme_durumu: e.target.value })}
          style={{ width: 150, color: s.odeme_durumu === 'odendi' ? '#1f6f4a' : '#a8590c', fontWeight: 600 }}>
          {ODEME.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="input" value={s.durum} onChange={e => durumSec(e.target.value)} style={{ width: 140, color: DURUM_RENK[s.durum], fontWeight: 700 }}>
          {DURUMLAR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" onClick={() => setAcik(!acik)}>{acik ? 'Kapat' : 'Detay'}</button>
      </div>
      {(s.notu || s.kargo_takip) && !acik && (
        <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6 }}>
          {s.notu && <>💬 Esnafın notu: {s.notu} </>}{s.kargo_takip && <>· 📦 {s.kargo_firma || 'Kargo'} {s.kargo_takip}</>}
        </div>
      )}
      {acik && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'var(--bg)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {s.notu && <div style={{ fontSize: 13 }}>💬 <b>Esnafın notu:</b> {s.notu}</div>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {s.isletme_telefon && <a className="btn btn-sm" href={`tel:${s.isletme_telefon}`} style={{ textDecoration: 'none' }}>📞 {s.isletme_telefon}</a>}
            {s.isletme_telefon && <a className="btn btn-sm" target="_blank" rel="noreferrer" style={{ textDecoration: 'none', background: '#25d366', color: '#fff', border: 'none' }}
              href={`https://wa.me/${waTel(s.isletme_telefon)}?text=${encodeURIComponent(`Merhaba, SıraGO'dan yazıyorum. ${s.urun_isim} siparişiniz (#${s.id}) hakkında`)}`}>💬 WhatsApp</a>}
            {s.kisisel_qr && <button className="btn btn-ghost btn-sm" onClick={() => baskiIndir(api, s)}>🖨️ QR baskı dosyası</button>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <input className="input" placeholder="Kargo firması (Yurtiçi, Aras…)" value={k.kargo_firma} onChange={e => setK({ ...k, kargo_firma: e.target.value })} style={{ flex: '1 1 160px' }} />
            <input className="input" placeholder="Takip numarası" value={k.kargo_takip} onChange={e => setK({ ...k, kargo_takip: e.target.value })} style={{ flex: '1 1 160px' }} />
          </div>
          <textarea className="input" rows={2} placeholder="İç not (esnaf görmez): ne zaman aradın, ne konuştunuz…" value={k.admin_notu} onChange={e => setK({ ...k, admin_notu: e.target.value })} />
          <div><button className="btn btn-primary btn-sm" onClick={() => kaydet(k)}>Kaydet</button>
            <span style={{ fontSize: 12, color: 'var(--dim)', marginLeft: 10 }}>"Kargoda", "Teslim" ve "İptal"de esnafa WhatsApp'tan bilgi gider (Merkez OTP bağlıysa).</span></div>
        </div>
      )}
    </div>
  );
}

// QR stand baskı dosyası: A6 (105×148 mm, 300 dpi) PNG — dükkân adı, "Randevunu buradan al", büyük QR, link
async function baskiIndir(api, siparis) {
  const d = await api.get(`/admin/magaza/siparisler/${siparis.id}/baski`);
  if (!d || d.hata) return alert(d?.hata || 'Baskı dosyası hazırlanamadı');
  const W = 1240, H = 1748, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
  x.fillStyle = '#1f6f4a'; x.fillRect(0, 0, W, 300);
  x.textAlign = 'center'; x.fillStyle = '#ffffff';
  let fs = 96; x.font = `800 ${fs}px Arial, sans-serif`;
  while (x.measureText(d.isim).width > W - 120 && fs > 48) { fs -= 4; x.font = `800 ${fs}px Arial, sans-serif`; }
  x.fillText(d.isim, W / 2, 185);
  x.fillStyle = '#111111'; x.font = '800 92px Arial, sans-serif';
  x.fillText('Randevunu', W / 2, 470); x.fillText('buradan al', W / 2, 580);
  x.fillStyle = '#555555'; x.font = '500 46px Arial, sans-serif';
  x.fillText('Telefonunun kamerasıyla okut', W / 2, 660);
  const img = new Image();
  await new Promise((ok, red) => { img.onload = ok; img.onerror = red; img.src = d.qr; });
  const q = 820; x.drawImage(img, (W - q) / 2, 720, q, q);
  x.fillStyle = '#333333'; x.font = '500 38px Arial, sans-serif';
  x.fillText(d.gorunen, W / 2, 1600);
  x.fillStyle = '#1f6f4a'; x.font = '800 40px Arial, sans-serif';
  x.fillText('SıraGO', W / 2, 1680);
  const a = document.createElement('a');
  a.href = c.toDataURL('image/png');
  a.download = `qr-stand-${siparis.id}-${d.isim.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.png`;
  a.click();
}

function kucult(dosya) {
  return new Promise((coz, red) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      coz(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => red(new Error('Fotoğraf okunamadı'));
    img.src = URL.createObjectURL(dosya);
  });
}

export default function IlanVer({ api }) {
  const [ilanlar, setIlanlar] = useState([]);
  const [siparisler, setSiparisler] = useState([]);
  const [f, setF] = useState(BOS);
  const [onizleme, setOnizleme] = useState(null);   // ekranda gösterilen foto
  const [mesaj, setMesaj] = useState(null);
  const [bekle, setBekle] = useState(false);
  const [ozet, setOzet] = useState(null);
  const [filtre, setFiltre] = useState('acik');
  const dosyaRef = useRef();

  const yukle = () => {
    api.get('/admin/magaza/ilanlar').then(d => setIlanlar(d?.ilanlar || []));
    api.get('/admin/magaza/siparisler').then(d => setSiparisler(d?.siparisler || []));
    api.get('/admin/magaza/vitrin-ozet').then(d => setOzet(d?.hata ? null : d));
  };
  useEffect(yukle, []);

  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const fotoSec = async (dosya) => {
    if (!dosya) return;
    try { const v = await kucult(dosya); setF(x => ({ ...x, gorsel: v })); setOnizleme(v); }
    catch (e) { setMesaj({ tip: 'error', metin: e.message }); }
  };
  const duzenle = (u) => { setF({ ...BOS, ...u, fiyat: u.fiyat ?? '', eski_fiyat: u.eski_fiyat ?? '', stok: u.stok ?? '', odeme_linki: u.odeme_linki || '', gorsel: undefined }); setOnizleme(u.gorsel); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const kaydet = async () => {
    setBekle(true);
    const d = f.id ? await api.put(`/admin/magaza/ilan/${f.id}`, f) : await api.post('/admin/magaza/ilan', f);
    setBekle(false);
    if (d?.hata) return setMesaj({ tip: 'error', metin: d.hata });
    setMesaj({ tip: 'success', metin: f.id ? 'İlan güncellendi' : 'İlan yayında — tüm esnafın Mağaza sayfasına düştü' });
    setF(BOS); setOnizleme(null); yukle();
    setTimeout(() => setMesaj(null), 4000);
  };

  const kartOnizleme = { id: 0, isim: f.isim || 'Ürün adı', fiyat: f.fiyat === '' ? null : Number(f.fiyat), eski_fiyat: f.eski_fiyat === '' ? null : Number(f.eski_fiyat), stok: f.stok === '' ? null : Number(f.stok), gorsel: onizleme };

  return (
    <div>
      {mesaj && <div className={`alert alert-${mesaj.tip}`} style={{ marginBottom: 14 }}>{mesaj.metin}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 20, alignItems: 'start' }} className="ilan-grid">
        <div className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{f.id ? 'İlanı düzenle' : 'Yeni ilan'}</div>
          <div onClick={() => dosyaRef.current?.click()} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); fotoSec(e.dataTransfer.files?.[0]); }}
            style={{ border: '2px dashed var(--border)', borderRadius: 14, padding: 18, textAlign: 'center', cursor: 'pointer', color: 'var(--dim)', fontWeight: 600 }}>
            {onizleme ? 'Fotoğrafı değiştirmek için dokun ya da sürükle' : '📷 Fotoğraf eklemek için dokun ya da buraya sürükle'}
          </div>
          <input ref={dosyaRef} type="file" accept="image/*" hidden onChange={e => fotoSec(e.target.files?.[0])} />
          {onizleme && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => { setOnizleme(null); setF(x => ({ ...x, gorsel: null })); }}>Fotoğrafı kaldır</button>}
          <input className="input" placeholder="Ürün adı (ör. 10'' tablet + masa standı)" value={f.isim} onChange={set('isim')} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="input" inputMode="decimal" placeholder="Fiyat ₺" value={f.fiyat} onChange={set('fiyat')} />
            <input className="input" inputMode="decimal" placeholder="Eski fiyat (üstü çizili)" value={f.eski_fiyat} onChange={set('eski_fiyat')} />
            <input className="input" inputMode="numeric" placeholder="Stok (boş = sınırsız)" value={f.stok} onChange={set('stok')} />
          </div>
          <textarea className="input" rows={4} placeholder="Açıklama: ne var kutuda, garanti, kargo süresi…" value={f.aciklama || ''} onChange={set('aciklama')} />
          <div style={{ display: 'flex', gap: 10 }}>
            <input className="input" placeholder="Kategori (Tablet, Bakım…)" value={f.kategori || ''} onChange={set('kategori')} />
            <input className="input" placeholder="Shopier / ödeme linki (isteğe bağlı)" value={f.odeme_linki} onChange={set('odeme_linki')} />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={f.aktif} onChange={set('aktif')} /> Yayında</label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={!!f.kisisel_qr} onChange={set('kisisel_qr')} /> Kişiye özel QR baskılı (QR stand gibi) — siparişte dükkânın baskı dosyası hazırlanır</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" disabled={bekle} onClick={kaydet}>{bekle ? 'Kaydediliyor…' : f.id ? 'Güncelle' : 'Yayınla'}</button>
            {f.id && <button className="btn btn-ghost" onClick={() => { setF(BOS); setOnizleme(null); }}>Vazgeç</button>}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'var(--dim)', fontWeight: 600, marginBottom: 6 }}>Esnaf böyle görecek</div>
          <UrunKart u={kartOnizleme} onClick={() => {}} />
        </div>
      </div>

      {ozet?.toplam && (
        <div className="stats-grid" style={{ margin: '24px 0 4px' }}>
          {[['Bu ay sipariş', ozet.toplam.siparis, `${ozet.toplam.adet} adet`], ['Bu ay ciro', tl(ozet.toplam.ciro), `tahsil: ${tl(ozet.toplam.tahsil)}`],
            ['Hazırlanacak', ozet.toplam.bekleyen, 'yeni + hazırlanıyor'], ['Kargoda', ozet.toplam.kargoda, `ödenmemiş: ${ozet.toplam.odenmemis}`]].map(([l, v, alt]) => (
            <div key={l} className="stat-card"><div className="sc-label">{l}</div><div className="sc-val" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div><div style={{ fontSize: 11, color: 'var(--dim)' }}>{alt}</div></div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, margin: '20px 0 10px' }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Siparişler</div>
        <span style={{ flex: 1 }} />
        {[['acik', `Açık (${siparisler.filter(x => !['teslim', 'iptal'].includes(x.durum)).length})`], ['bitti', 'Tamamlanan'], ['hepsi', `Tümü (${siparisler.length})`]].map(([v, l]) => (
          <button key={v} className={`btn btn-sm ${filtre === v ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltre(v)}>{l}</button>
        ))}
      </div>
      {(() => {
        const liste = siparisler.filter(x => filtre === 'hepsi' || (filtre === 'acik' ? !['teslim', 'iptal'].includes(x.durum) : ['teslim', 'iptal'].includes(x.durum)));
        return liste.length === 0
          ? <div style={{ color: 'var(--dim)', fontSize: 14 }}>{filtre === 'acik' ? 'Bekleyen sipariş yok.' : 'Sipariş yok.'}</div>
          : <div className="card" style={{ padding: 0 }}>{liste.map(x => <SiparisSatiri key={`${x.id}-${x.guncelleme || ''}`} s={x} api={api} yenile={yukle} />)}</div>;
      })()}

      <div style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 10px' }}>İlanlar ({ilanlar.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
        {ilanlar.map(u => (
          <div key={u.id} style={{ opacity: u.aktif ? 1 : 0.55 }}>
            <UrunKart u={u} onClick={() => duzenle(u)} />
            <div style={{ fontSize: 12, color: 'var(--dim)', margin: '6px 2px' }}>
              {u.satilan ? <><b style={{ color: '#1f6f4a' }}>{u.satilan} satış</b> · {tl(u.ciro)}</> : 'Henüz satış yok'}
              {u.stok !== null && u.stok !== undefined && <> · stok {u.stok}</>}{!u.aktif && <> · <b>yayında değil</b></>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => duzenle(u)}>Düzenle</button>
              <button className="btn btn-ghost btn-sm" onClick={async () => { await api.put(`/admin/magaza/ilan/${u.id}`, { ...u, odeme_linki: u.odeme_linki || '', aktif: !u.aktif, gorsel: undefined }); yukle(); }}>{u.aktif ? 'Yayından kaldır' : 'Yayınla'}</button>
              <button className="btn btn-ghost btn-sm" style={{ color: '#b42318' }} onClick={async () => {
                if (!confirm(`"${u.isim}" silinsin mi?${u.satilan ? ' Siparişi olduğu için yalnız yayından kalkacak.' : ''}`)) return;
                const d = await api.del(`/admin/magaza/ilan/${u.id}`); if (d?.hata) alert(d.hata); yukle();
              }}>Sil</button>
            </div>
          </div>
        ))}
      </div>
      <style>{'@media (max-width: 700px){.ilan-grid{grid-template-columns:1fr !important}}'}</style>
    </div>
  );
}
