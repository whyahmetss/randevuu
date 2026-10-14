import { useState } from 'react';

// Hafıza kartı (2026-10-14): müşterinin önceki işlem notu ("📌 Son işlem: yanlar 1.5, üst makas"),
// seans ilerlemesi ("🔁 Seans 2/6") ve bu randevuya not + fotoğraf ekleme. Takvim, Bugün (telefon) ve sade Bugün'de kullanılır.

const kisaTarih = (t) => t ? new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }) : '';

// Fotoğraf tarayıcıda 1000px'e küçültülür (telefon kamerası 4-5 MB çeker)
function kucult(dosya) {
  return new Promise((coz, red) => {
    const img = new Image();
    img.onload = () => {
      const o = Math.min(1, 1000 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * o); c.height = Math.round(img.height * o);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      coz(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => red(new Error('Fotoğraf okunamadı'));
    img.src = URL.createObjectURL(dosya);
  });
}

// Seans etiketi: tamamlanmış randevu kendi numarasını, gelecek randevu sıradaki numarayı gösterir
export function seansEtiketi(r) {
  if (r.seans_no && r.seans_toplam) return `🔁 Seans ${r.seans_no}/${r.seans_toplam}`;
  if (r.seans_toplam) return `🔁 Seans ${Math.min(Number(r.seans_tamamlanan) + 1, r.seans_toplam)}/${r.seans_toplam}`;
  if (Number(r.seans_sayisi) > 1) return `🔁 Seans 1/${r.seans_sayisi}`;
  return null;
}

export default function IslemNotu({ api, r, buyuk = false, degisti }) {
  const [acik, setAcik] = useState(false);
  const [not, setNot] = useState(r.islem_notu || '');
  const [foto, setFoto] = useState(undefined);       // undefined: dokunulmadı, null: kaldır, string: yeni
  const [mevcutFoto, setMevcutFoto] = useState(null);
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState('');
  const [buyukFoto, setBuyukFoto] = useState(null);
  const fs = buyuk ? 15 : 12.5;

  const ac = async () => {
    setAcik(true); setHata('');
    if (r.islem_foto_var && mevcutFoto === null) {
      const d = await api.get(`/randevular/${r.id}/islem`);
      if (!d?.hata) { setMevcutFoto(d.foto); setNot(d.islem_notu || ''); }
    }
  };
  const sonFotoGoster = async () => {
    const d = await api.get(`/randevular/${r.son_islem_randevu_id}/islem`);
    if (d?.foto) setBuyukFoto(d.foto);
  };
  const kaydet = async () => {
    setBekle(true); setHata('');
    const govde = { islem_notu: not };
    if (foto !== undefined) govde.foto = foto;
    const d = await api.put(`/randevular/${r.id}/islem`, govde);
    setBekle(false);
    if (d?.hata) return setHata(d.hata);
    if (foto !== undefined) setMevcutFoto(foto);
    setFoto(undefined); setAcik(false);
    degisti?.({ ...r, islem_notu: d.islem_notu, islem_foto_var: d.islem_foto_var });
  };
  const fotoSec = async (dosya) => {
    if (!dosya) return;
    try { setFoto(await kucult(dosya)); } catch (e) { setHata(e.message); }
  };

  const seans = seansEtiketi(r);
  const gosterilenFoto = foto !== undefined ? foto : mevcutFoto;
  const kutu = { marginTop: 8, padding: buyuk ? '10px 12px' : '7px 10px', borderRadius: 10, background: 'rgba(168,89,12,.08)', border: '1px solid rgba(168,89,12,.22)', fontSize: fs, color: 'var(--text)' };

  return (
    <div onClick={e => e.stopPropagation()}>
      {(r.son_islem_notu || r.son_islem_foto_var) && (
        <div style={kutu}>
          <b>📌 Son işlem{r.son_islem_tarihi ? ` (${kisaTarih(r.son_islem_tarihi)})` : ''}:</b> {r.son_islem_notu || 'fotoğraf var'}
          {r.son_islem_foto_var && <button onClick={sonFotoGoster} style={{ marginLeft: 6, border: 'none', background: 'none', color: '#a8590c', fontWeight: 700, cursor: 'pointer', fontSize: fs, padding: 0, fontFamily: 'inherit' }}>📷 Gör</button>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
        {seans && <span style={{ fontSize: fs, fontWeight: 700, color: '#2f56c6', background: 'rgba(47,86,198,.08)', borderRadius: 999, padding: '3px 10px' }}>{seans}</span>}
        {!acik && (
          <button onClick={ac} style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: buyuk ? '8px 12px' : '4px 10px', fontSize: fs, fontWeight: 600, cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit', minHeight: buyuk ? 40 : undefined }}>
            📝 {r.islem_notu || r.islem_foto_var ? 'İşlem notu ✓' : 'İşlem notu'}
          </button>
        )}
      </div>
      {acik && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)' }}>
          <textarea className="input" rows={2} maxLength={500} value={not} onChange={e => setNot(e.target.value)} autoFocus
            placeholder="Örn: Yanlar 1.5, üst makas · Boya 7.1 küllü kumral + %6 oksidan" style={{ width: '100%', fontSize: 15, borderRadius: 10 }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            {gosterilenFoto
              ? <><img src={gosterilenFoto} alt="" onClick={() => setBuyukFoto(gosterilenFoto)} style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, cursor: 'zoom-in' }} />
                  <button onClick={() => setFoto(null)} style={{ border: 'none', background: 'none', color: '#b42318', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Fotoğrafı kaldır</button></>
              : <label style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  📷 Fotoğraf ekle
                  <input type="file" accept="image/*" capture="environment" hidden onChange={e => { fotoSec(e.target.files?.[0]); e.target.value = ''; }} />
                </label>}
            <span style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => { setAcik(false); setFoto(undefined); setNot(r.islem_notu || ''); }}>Vazgeç</button>
            <button className="btn btn-primary btn-sm" disabled={bekle} onClick={kaydet}>{bekle ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--dim)', marginTop: 6 }}>Sonraki randevusunda bu not "📌 Son işlem" olarak görünür. Fotoğrafı müşterinin izniyle çek; yalnız sen görürsün.</div>
          {hata && <div style={{ color: '#b42318', fontSize: 13, marginTop: 6 }}>{hata}</div>}
        </div>
      )}
      {buyukFoto && (
        <div onClick={() => setBuyukFoto(null)} role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'zoom-out' }}>
          <img src={buyukFoto} alt="" style={{ maxWidth: '100%', maxHeight: '90vh', borderRadius: 10 }} />
        </div>
      )}
    </div>
  );
}
