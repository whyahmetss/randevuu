import { useRef, useState } from 'react';

// Profil fotoğrafı (2026-10-20): esnaf ve süper admin. Fotoğraf yoksa ismin baş harfi.
// degistir verilirse dokununca dosya seçilir, 256 px'e küçültülüp kaydedilir.
const kucult = (dosya) => new Promise((coz, red) => {
  const img = new Image();
  img.onload = () => {
    const k = 256, olcek = Math.max(k / img.width, k / img.height);
    const c = document.createElement('canvas'); c.width = k; c.height = k;
    const w = img.width * olcek, h = img.height * olcek;
    c.getContext('2d').drawImage(img, (k - w) / 2, (k - h) / 2, w, h);   // ortadan kare kırp
    URL.revokeObjectURL(img.src);
    coz(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => red(new Error('Fotoğraf açılamadı'));
  img.src = URL.createObjectURL(dosya);
});

export async function profilFotoKaydet(api, veri) {
  const r = await api.put('/auth/profil-foto', { veri });
  if (r?.hata) throw new Error(r.hata);
  return r.profil_foto;
}

export default function ProfilFoto({ foto, isim, boyut = 32, radius = 10, api, degisti, style }) {
  const girdi = useRef(null);
  const [bekle, setBekle] = useState(false);
  const sec = async (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setBekle(true);
    try { degisti(await profilFotoKaydet(api, await kucult(f))); }
    catch (err) { alert(err.message); }
    setBekle(false);
  };
  const duzenlenir = !!(api && degisti);
  return (
    <div onClick={duzenlenir ? (e) => { e.stopPropagation(); girdi.current?.click(); } : undefined}
      title={duzenlenir ? 'Profil fotoğrafını değiştir' : undefined}
      style={{ position: 'relative', width: boyut, height: boyut, borderRadius: radius, flexShrink: 0, overflow: 'hidden', cursor: duzenlenir ? 'pointer' : 'inherit',
        background: 'var(--gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: Math.round(boyut * 0.4), ...style }}>
      {foto ? <img src={foto} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (isim?.charAt(0)?.toLocaleUpperCase('tr') || '?')}
      {duzenlenir && (
        <span style={{ position: 'absolute', inset: 'auto 0 0 0', background: 'rgba(0,0,0,.45)', fontSize: Math.max(9, Math.round(boyut * 0.18)), textAlign: 'center', lineHeight: 1.6 }}>
          {bekle ? '…' : '📷'}
        </span>
      )}
      {duzenlenir && <input ref={girdi} type="file" accept="image/*" onChange={sec} style={{ display: 'none' }} />}
    </div>
  );
}
