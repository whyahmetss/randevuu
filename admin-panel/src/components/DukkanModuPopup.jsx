import { useEffect, useRef, useState } from 'react';
import { bildirimCal, titret, ayarOku } from '../lib/bildirim';

/**
 * DÜKKAN MODU — Fullscreen Popup
 * Yeni randevu gelince 3 saniye full-screen zoom animasyonuyla BÜYÜK popup açılır.
 * Ses 3 kere tekrar eder, titreşim 5 saniye.
 * Settings'te "dukkanModuAuto" açıksa kendi kendine tetiklenir.
 * Kullanıcı "Gördüm" dese kapanır, 20 saniye sonra otomatik kapanır.
 */
export default function DukkanModuPopup() {
  const [randevu, setRandevu] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      try {
        const ayar = ayarOku();
        if (!ayar.dukkanModuAuto) return; // Ayar kapalıysa popup yok
        const { randevu: r, musteri, hizmet, saatStr } = e.detail || {};
        if (!r) return;
        setRandevu({ r, musteri, hizmet, saatStr });

        // 3 kere tekrar (zaten App.jsx canliSes'i çağırdı, buradan 2 ekstra)
        setTimeout(() => bildirimCal({ dedupId: `randevu-popup-${r.id}-1` }), 700);
        setTimeout(() => bildirimCal({ dedupId: `randevu-popup-${r.id}-2` }), 1400);

        // Titreşim 5 sn
        titret([300, 100, 300, 100, 300, 100, 300]);

        // 20sn sonra otomatik kapat
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setRandevu(null), 20000);
      } catch {}
    };
    window.addEventListener('dukkan:yeniRandevu', handler);
    return () => {
      window.removeEventListener('dukkan:yeniRandevu', handler);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!randevu) return null;
  const { r, musteri, hizmet, saatStr } = randevu;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: 'rgba(16,5,39,.92)', backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, animation: 'fadeIn .3s ease'
    }}>
      <div style={{
        maxWidth: 680, width: '100%',
        background: 'linear-gradient(135deg, #54E097 0%, #2cb872 100%)',
        borderRadius: 32, padding: '48px 40px',
        textAlign: 'center', color: '#fff',
        boxShadow: '0 30px 80px rgba(84,224,151,.5), 0 0 100px rgba(16,185,129,.4)',
        animation: 'zoomIn .6s cubic-bezier(.34, 1.56, .64, 1)'
      }}>
        <div style={{
          fontSize: 96, lineHeight: 1, marginBottom: 12,
          animation: 'bounce 1s ease-in-out infinite'
        }}>🎉</div>
        <div style={{
          fontSize: 28, fontWeight: 800, letterSpacing: '.3em',
          opacity: .9, marginBottom: 8, textTransform: 'uppercase'
        }}>Yeni Randevu</div>
        <div style={{
          fontSize: 48, fontWeight: 900, marginBottom: 14, letterSpacing: '-.5px',
          textShadow: '0 2px 20px rgba(0,0,0,.2)'
        }}>{musteri?.isim || 'Müşteri'}</div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px',
          background: 'rgba(255,255,255,.2)', borderRadius: 20, marginBottom: 12,
          backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,.2)'
        }}>
          <span style={{ fontSize: 28 }}>🕒</span>
          <span style={{ fontSize: 44, fontWeight: 900 }}>{saatStr}</span>
        </div>
        {hizmet?.isim && (
          <div style={{ fontSize: 20, fontWeight: 700, opacity: .95, marginBottom: 8 }}>
            ✂️ {hizmet.isim}
            {hizmet.fiyat ? ` · ${Number(hizmet.fiyat).toLocaleString('tr-TR')}₺` : ''}
          </div>
        )}
        {musteri?.telefon && (
          <div style={{ fontSize: 16, opacity: .8, marginBottom: 30 }}>
            📞 {musteri.telefon}
          </div>
        )}
        <button
          onClick={() => setRandevu(null)}
          style={{
            padding: '18px 48px', borderRadius: 18, border: 'none',
            background: '#fff', color: '#2cb872',
            fontWeight: 900, fontSize: 20, cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0,0,0,.15)',
            letterSpacing: '.5px'
          }}
        >
          ✓ GÖRDÜM, TAMAM
        </button>
        <div style={{ marginTop: 18, fontSize: 11, opacity: .7 }}>
          20 saniye sonra otomatik kapanır
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn {
          0% { transform: scale(0.3); opacity: 0; }
          60% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes slideDown {
          from { transform: translateX(-50%) translateY(-30px); opacity: 0; }
          to { transform: translateX(-50%) translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
