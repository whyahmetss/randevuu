import { useEffect, useState } from 'react';
import { sesKilidiAc, bildirimCal, ayarOku, ayarYaz } from '../lib/bildirim';
import { pushDesteklenir, pushIzinDurumu, pushAc } from '../lib/push';

const STORAGE_KEY = 'randevugo_aktivasyon_tamam';

/**
 * İlk giriş banner'ı — kullanıcıdan ses + bildirim iznini tek tıkla alır.
 * Tablet dükkana konulduğunda bu banner'a tıklamak yeterli, gün boyu sorunsuz çalar.
 */
export default function BildirimAktivasyon() {
  const [goster, setGoster] = useState(false);
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    try {
      const tamam = localStorage.getItem(STORAGE_KEY);
      if (tamam) return;
      // Biraz gecikme → sayfa yüklendikten sonra göster
      const t = setTimeout(() => setGoster(true), 2000);
      return () => clearTimeout(t);
    } catch {}
  }, []);

  const kapat = (kalici = true) => {
    if (kalici) {
      try { localStorage.setItem(STORAGE_KEY, '1'); } catch {}
    }
    setGoster(false);
  };

  const aktifEt = async () => {
    setYukleniyor(true);
    try {
      // 1) AudioContext unlock + ses dosyalarını preload
      sesKilidiAc();

      // 2) Test sesi çal (kullanıcı duysun)
      setTimeout(() => {
        bildirimCal({ force: true });
      }, 300);

      // 3) Notification permission request
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }

      // 4) Push desteği varsa kullanıcıya seçenek ver (zorla değil — Settings'te yapsın)
      // Şimdi zorla push register yapmıyoruz, çünkü VAPID backend çağrısı vs lazım

      // 5) Wake Lock (pasif - kendisi aktif olur)

      // 6) Ayarları açık olarak yaz (varsayılan varsa)
      const ayar = ayarOku();
      if (ayar.sessiz) {
        ayarYaz({ sessiz: false });
      }

      // Başarılı — banner kapat
      setTimeout(() => kapat(true), 800);
    } catch (e) {
      console.error('[BildirimAktivasyon]', e);
    }
    setYukleniyor(false);
  };

  if (!goster) return null;

  return (
    <div style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9998, maxWidth: 540, width: '92%',
      background: 'linear-gradient(135deg, #2cb872, #10b981)',
      color: '#fff', borderRadius: 16, padding: '14px 18px',
      boxShadow: '0 14px 40px rgba(16,185,129,.35)',
      display: 'flex', alignItems: 'center', gap: 14,
      animation: 'slideDown .4s ease'
    }}>
      <div style={{ fontSize: 30, lineHeight: 1 }}>🔔</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 3 }}>
          Sesli bildirimleri aktifleştirin
        </div>
        <div style={{ fontSize: 12, opacity: .92, lineHeight: 1.4 }}>
          Tabletinizi dükkana koyun, randevu geldiğinde anında ötsün. Tek tıkla hazır.
        </div>
      </div>
      <button onClick={aktifEt} disabled={yukleniyor} style={{
        padding: '10px 18px', borderRadius: 10, border: 'none',
        background: '#fff', color: '#10b981', fontWeight: 800, fontSize: 13,
        cursor: 'pointer', whiteSpace: 'nowrap',
        boxShadow: '0 2px 8px rgba(0,0,0,.1)',
        opacity: yukleniyor ? 0.6 : 1
      }}>
        {yukleniyor ? '⏳ Aktifleştiriliyor...' : '✓ Aktifleştir'}
      </button>
      <button onClick={() => kapat(true)} style={{
        background: 'rgba(255,255,255,.15)', border: 'none',
        color: '#fff', fontSize: 18, cursor: 'pointer',
        width: 30, height: 30, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }} title="Daha sonra">✕</button>
    </div>
  );
}
