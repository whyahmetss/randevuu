import { useState, useEffect, useRef } from 'react';
import { UrunKart } from './Vitrin';

// Kurucu: SıraGO Vitrini'ne ilan ver (Shopier gibi). Fotoğraf tarayıcıda küçültülür (~1000px JPEG).
const BOS = { isim: '', fiyat: '', eski_fiyat: '', aciklama: '', kategori: '', stok: '', odeme_linki: '', aktif: true, sira: 0, gorsel: null };
const DURUMLAR = [['yeni', 'Yeni'], ['hazirlaniyor', 'Hazırlanıyor'], ['kargoda', 'Kargoda'], ['teslim', 'Teslim'], ['iptal', 'İptal']];

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
  const dosyaRef = useRef();

  const yukle = () => {
    api.get('/admin/magaza/ilanlar').then(d => setIlanlar(d?.ilanlar || []));
    api.get('/admin/magaza/siparisler').then(d => setSiparisler(d?.siparisler || []));
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
    setMesaj({ tip: 'success', metin: f.id ? 'İlan güncellendi' : 'İlan yayında — tüm esnafın vitrinine düştü' });
    setF(BOS); setOnizleme(null); yukle();
    setTimeout(() => setMesaj(null), 4000);
  };
  const durum = async (id, d) => { await api.put(`/admin/magaza/siparisler/${id}`, { durum: d }); yukle(); };

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

      <div style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 10px' }}>Siparişler</div>
      {siparisler.length === 0 ? <div style={{ color: 'var(--dim)', fontSize: 14 }}>Henüz sipariş yok.</div> : (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>#</th><th>İşletme</th><th>Ürün</th><th>Tutar</th><th>Not</th><th>Durum</th></tr></thead>
            <tbody>{siparisler.map(s => (
              <tr key={s.id}>
                <td>{s.id}</td>
                <td>{s.isletme_isim}<div style={{ fontSize: 12, color: 'var(--dim)' }}>{s.isletme_telefon && <a href={`tel:${s.isletme_telefon}`}>{s.isletme_telefon}</a>}</div></td>
                <td>{s.urun_isim} × {s.adet}</td>
                <td>{s.tutar ? `${Number(s.tutar)} ₺` : '—'}</td>
                <td style={{ maxWidth: 220, fontSize: 13 }}>{s.notu || ''}</td>
                <td><select className="input" value={s.durum} onChange={e => durum(s.id, e.target.value)}>{DURUMLAR.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              </tr>))}</tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 16, fontWeight: 800, margin: '24px 0 10px' }}>İlanlar ({ilanlar.length})</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
        {ilanlar.map(u => (
          <div key={u.id} style={{ opacity: u.aktif ? 1 : 0.5 }}>
            <UrunKart u={u} onClick={() => duzenle(u)} />
            {!u.aktif && <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 4 }}>Yayında değil</div>}
          </div>
        ))}
      </div>
      <style>{'@media (max-width: 700px){.ilan-grid{grid-template-columns:1fr !important}}'}</style>
    </div>
  );
}
