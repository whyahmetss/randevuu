// Paket ödeme görseli (2026-10-15): Shopier ödeme sayfasında ürün görseli olarak görünür.
// Yüklenmezse Fiko görseli kullanılır. Seçilen dosya küçültülüp hemen kaydedilir (paketin "Kaydet"ini beklemez).
import { useState } from 'react';
import { API_URL } from '../lib/config';

function kucult(dosya) {
  return new Promise((coz, red) => {
    const img = new Image();
    img.onload = () => {
      const o = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * o); c.height = Math.round(img.height * o);
      const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      coz(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => red(new Error('Görsel okunamadı'));
    img.src = URL.createObjectURL(dosya);
  });
}

export default function PaketGorsel({ api, paket, onDegisti, kucuk = false }) {
  const [durum, setDurum] = useState('');
  const src = paket.gorsel_var ? `${API_URL}/paket-gorsel/${encodeURIComponent(paket.kod)}?v=${paket.gorsel_v}` : '/icon-512.png';
  const boyut = kucuk ? 44 : 88;

  const kaydet = async (veri) => {
    setDurum('Kaydediliyor…');
    try {
      const r = await api.put(`/admin/paketler/${paket.id}/gorsel`, { veri });
      if (r?.hata) throw new Error(r.hata);
      setDurum(''); onDegisti?.();
    } catch (e) { setDurum(e.message || 'Kaydedilemedi'); }
  };

  const sec = async (e) => {
    const dosya = e.target.files?.[0];
    e.target.value = '';
    if (!dosya) return;
    try { await kaydet(await kucult(dosya)); } catch (err) { setDurum(err.message); }
  };

  const img = <img src={src} alt="" style={{ width: boyut, height: boyut, objectFit: 'cover', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', flexShrink: 0 }} />;
  if (kucuk) return img;

  return (
    <div className="row gap-12" style={{ alignItems: 'center', marginBottom: 12 }}>
      {img}
      <div>
        <div style={{ fontSize: 10, color: 'var(--dim)', fontWeight: 600, marginBottom: 6 }}>
          Ödeme görseli (Shopier'da görünür){!paket.gorsel_var && ' — şu an varsayılan Fiko'}
        </div>
        <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
          <label className="btn btn-sm" style={{ background: 'rgba(31,111,74,.1)', color: '#1f6f4a', fontWeight: 600, cursor: 'pointer', margin: 0 }}>
            🖼️ Görsel yükle
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={sec} style={{ display: 'none' }} />
          </label>
          {paket.gorsel_var && (
            <button type="button" onClick={() => kaydet(null)} className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>Varsayılana dön</button>
          )}
        </div>
        {durum && <div style={{ fontSize: 11, color: durum.includes('…') ? 'var(--dim)' : 'var(--red)', marginTop: 4 }}>{durum}</div>}
      </div>
    </div>
  );
}
