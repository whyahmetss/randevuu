import { useEffect, useState } from 'react';
import { kart, dugme, RENK } from './ortak';

// Satışçı kodlu QR kart (kullanıcı kararı 2026-10-15): dükkâna bırakılan kart. Esnaf okutunca Satış Bot'a
// "kart: S12" yazılı hazır mesaj gider, bot hesabı WhatsApp'ta açar ve kurulumu yaptırır; kayıt bu üyeye yazılır.
// Link numaradan bağımsız (/k/S12): Satış Bot numarası değişse de basılı kart çalışır.
function Kart({ v }) {
  return (
    <div className="qr-kart-tek" style={{ width: '85mm', height: '55mm', boxSizing: 'border-box', border: '1px solid #ddd', borderRadius: '3mm', padding: '4mm',
      display: 'flex', gap: '3mm', alignItems: 'center', background: '#fff', color: '#1d1b16', fontFamily: 'inherit', breakInside: 'avoid' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2mm' }}>
          <img src="/img/tilki-maskot.webp" alt="" style={{ width: '11mm', height: '11mm', objectFit: 'contain' }} />
          <div style={{ fontWeight: 800, fontSize: '5mm', color: '#1f6f4a', lineHeight: 1 }}>SıraGO</div>
        </div>
        <div style={{ fontSize: '3.4mm', fontWeight: 700, lineHeight: 1.25 }}>Randevularınızı WhatsApp botu alsın, siz işinize bakın.</div>
        <div style={{ fontSize: '2.6mm', color: '#4a463e', lineHeight: 1.35 }}>📷 Kameranızla okutun, hesabınız WhatsApp'ta 2 dakikada açılsın. Ücretsiz deneyin, kart bilgisi yok.</div>
        <div style={{ fontSize: '2.4mm', color: '#6f6a62' }}>{v.isim ? `Temsilciniz: ${v.isim} · ` : ''}Kod: {v.kod}</div>
      </div>
      <img src={v.qr} alt={`QR: ${v.link}`} style={{ width: '30mm', height: '30mm', flexShrink: 0 }} />
    </div>
  );
}

export default function QrKart({ api, onKapat }) {
  const [v, setV] = useState(null);
  const [hata, setHata] = useState('');
  useEffect(() => { api.get('/admin/masa/qr-kart').then(d => d?.hata ? setHata(d.hata) : setV(d)).catch(() => setHata('QR kart alınamadı')); }, [api]);

  const indir = () => { const a = document.createElement('a'); a.href = v.qr; a.download = `sirago-qr-${v.kod}.png`; a.click(); };

  return (
    <div onClick={onKapat} className="qr-kart-katman" style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .qr-baski, .qr-baski * { visibility: visible !important; }
        .qr-baski { position: absolute !important; left: 0; top: 0; display: grid !important; grid-template-columns: repeat(2, 85mm); gap: 6mm; padding: 8mm; }
        @page { size: A4; margin: 0; }
      }`}</style>
      <div onClick={e => e.stopPropagation()} style={{ ...kart, width: '100%', maxWidth: 520, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <b style={{ fontSize: 17, color: 'var(--text)' }}>🎴 QR kartım</b>
          <button onClick={onKapat} style={{ ...dugme(RENK.gri), padding: '4px 10px' }} aria-label="Kapat">✕</button>
        </div>
        {hata && <div role="alert" style={{ color: RENK.kirmizi, fontWeight: 600, fontSize: 13 }}>{hata}</div>}
        {!v && !hata && <div style={{ color: 'var(--dim)', fontSize: 13 }}>Hazırlanıyor…</div>}
        {v && (
          <>
            <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Bu kart sana özel (<b>{v.kod}</b>). Esnaf okutunca Satış Bot'a hazır mesaj gider; hesabı WhatsApp'ta açıp kurulumu bot yaptırır, kayıt sana yazılır.
              Kartı bırakınca aday kartında <b>Kart bıraktım</b>'a bas.
            </p>
            {!v.bagli && (
              <div style={{ fontSize: 12, padding: '8px 10px', borderRadius: 10, background: 'rgba(168,89,12,.08)', color: RENK.amber, fontWeight: 600, marginBottom: 12 }}>
                ⚠️ Satış Bot numarası şu an bağlı değil: karttan gelen esnaf web kaydına yönlenir (kayıt yine sana yazılır). Satış Bot'u bağlayınca WhatsApp'a gider.
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, overflowX: 'auto' }}><Kart v={v} /></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button onClick={() => window.print()} style={dugme(RENK.yesil, true)}>🖨️ Yazdır (A4'e 8 kart)</button>
              <button onClick={indir} style={dugme(RENK.mavi)}>⬇️ QR'ı indir</button>
              <button onClick={() => navigator.clipboard?.writeText(v.link)} style={dugme(RENK.gri)}>🔗 Linki kopyala</button>
            </div>
            <div className="qr-baski" style={{ display: 'none' }}>{Array.from({ length: 8 }, (_, i) => <Kart key={i} v={v} />)}</div>
          </>
        )}
      </div>
    </div>
  );
}
