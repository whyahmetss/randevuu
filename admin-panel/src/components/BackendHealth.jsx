import { useEffect, useState } from 'react';
import { API_URL } from '../lib/config';

/**
 * Backend Health Rozeti
 * 30sn'de bir /api/health endpoint'ini ping atar, gecikmeyi ölçer.
 * Yeşil nokta = ok (<500ms), sarı = yavaş (500-2000ms), kırmızı = down.
 * Hover → tooltip ile son ping süresi + timestamp.
 */
export default function BackendHealth({ compact = false }) {
  const [durum, setDurum] = useState({ status: 'checking', latency: 0, lastCheck: null });

  const ping = async () => {
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 10000);
      const r = await fetch(`${API_URL}/health`, { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(to);
      const latency = Math.round(performance.now() - t0);
      if (!r.ok) {
        setDurum({ status: 'down', latency, lastCheck: new Date() });
      } else {
        const status = latency < 500 ? 'ok' : latency < 2000 ? 'slow' : 'slow';
        setDurum({ status, latency, lastCheck: new Date() });
      }
    } catch (e) {
      setDurum({ status: 'down', latency: Math.round(performance.now() - t0), lastCheck: new Date() });
    }
  };

  useEffect(() => {
    ping();
    const i = setInterval(ping, 30000);
    return () => clearInterval(i);
  }, []);

  const cfg = {
    checking: { renk: '#64748b', label: 'Kontrol…', ikon: '⏳' },
    ok:       { renk: '#10b981', label: 'Canlı',    ikon: '✅' },
    slow:     { renk: '#f59e0b', label: 'Yavaş',    ikon: '⚠️' },
    down:     { renk: '#ef4444', label: 'Kapalı',   ikon: '❌' }
  }[durum.status] || { renk: '#64748b', label: '?', ikon: '?' };

  const tip = `Backend: ${cfg.label}${durum.latency ? ` · ${durum.latency}ms` : ''}${durum.lastCheck ? ` · ${durum.lastCheck.toLocaleTimeString('tr-TR')}` : ''}`;

  if (compact) {
    return (
      <span
        title={tip}
        onClick={ping}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10,
          padding: '3px 8px', borderRadius: 999,
          background: `${cfg.renk}15`, color: cfg.renk, cursor: 'pointer',
          fontWeight: 700, userSelect: 'none'
        }}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: cfg.renk,
          boxShadow: durum.status === 'ok' ? `0 0 8px ${cfg.renk}` : 'none',
          animation: durum.status === 'checking' ? 'pulse 1.4s infinite' : 'none'
        }} />
        {durum.latency ? `${durum.latency}ms` : cfg.label}
      </span>
    );
  }

  return (
    <div
      onClick={ping}
      title={tip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 12px', borderRadius: 999,
        background: `${cfg.renk}12`, color: cfg.renk, cursor: 'pointer',
        fontSize: 11, fontWeight: 700, userSelect: 'none',
        border: `1px solid ${cfg.renk}30`
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: '50%', background: cfg.renk,
        boxShadow: durum.status === 'ok' ? `0 0 10px ${cfg.renk}` : 'none',
        animation: durum.status === 'checking' ? 'pulse 1.4s infinite' : 'none'
      }} />
      <span>API {cfg.label}</span>
      {durum.latency > 0 && durum.status !== 'checking' && (
        <span style={{ opacity: .7, fontWeight: 500 }}>· {durum.latency}ms</span>
      )}
    </div>
  );
}
