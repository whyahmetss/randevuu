import { useState } from 'react';

// Profil menüsündeki paket özeti (2026-10-29): telefonda paket yükseltme butonu ve IBAN'a ulaşılmıyordu
// (kenar çubuğu telefonda yok, ödeme kartı ana sayfada). Paket, kalan gün, kullanım ve iki buton burada.
const SINIRSIZ = 999;

function Cubuk({ ad, deger, limit }) {
  if (!limit || limit >= SINIRSIZ) return null;
  const yuzde = Math.min(100, Math.round((deger / limit) * 100));
  const renk = yuzde >= 100 ? '#b42318' : yuzde >= 80 ? '#a8590c' : '#1f6f4a';
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>{ad}</span><span style={{ color: renk, fontWeight: 600 }}>{deger} / {limit}</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', marginTop: 3, overflow: 'hidden' }}>
        <div style={{ width: `${yuzde}%`, height: '100%', background: renk }} />
      </div>
    </div>
  );
}

export function PaketOzeti({ paketDurum, dashEkstra, yukselt, odeme }) {
  const p = paketDurum.paket_bilgi || {};
  const k = paketDurum.kullanim || {};
  const kalan = dashEkstra?.paketKalanGun;
  const tip = dashEkstra?.paketDurumTipi;
  const enUst = ['kurumsal', 'premium'].includes(paketDurum.paket);
  const sure = dashEkstra?.anlasma ? '🤝 Ücretsiz kullanım'
    : kalan == null ? null
    : kalan <= 0 ? 'Süre doldu'
    : tip === 'deneme' ? `🧪 Deneme · ${kalan} gün kaldı` : `${kalan} gün kaldı`;
  const btn = { width: '100%', padding: '8px 0', borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 };

  return (
    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{p.isim || paketDurum.paket}</div>
        {sure && <div style={{ fontSize: 11, fontWeight: 600, color: kalan != null && kalan <= 3 ? '#b42318' : 'var(--muted)', whiteSpace: 'nowrap' }}>{sure}</div>}
      </div>
      <Cubuk ad="Çalışan" deger={k.calisan || 0} limit={p.calisan_limit} />
      <Cubuk ad="Bu ay randevu" deger={k.randevu || 0} limit={p.aylik_randevu_limit} />
      {!enUst && !dashEkstra?.anlasma && (
        <button onClick={yukselt} style={{ ...btn, border: 'none', background: '#1f6f4a', color: '#fff' }}>⬆️ Paketi yükselt</button>
      )}
      {odeme && !dashEkstra?.anlasma && (
        <button onClick={odeme} style={{ ...btn, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>💳 Ödeme & IBAN</button>
      )}
    </div>
  );
}

// Ödeme penceresi: tek tıkla Shopier + havale bilgileri (IBAN kopyala)
export function OdemePenceresi({ odemeBilgi, kapat, ode, paketler }) {
  const [kopyalandi, setKopyalandi] = useState(null);
  const b = odemeBilgi.banka || {};
  const kopyala = async (deger, ad) => {
    try { await navigator.clipboard.writeText(ad === 'iban' ? String(deger).replace(/\s/g, '') : String(deger)); setKopyalandi(ad); setTimeout(() => setKopyalandi(null), 1500); }
    catch (e) { /* pano izni yok: kullanıcı elle seçer */ }
  };
  const odendi = ['odendi', 'havale_bekliyor'].includes(odemeBilgi.odeme?.durum);
  const satir = (etiket, deger, ad) => deger ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--dim)' }}>{etiket}</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflowWrap: 'anywhere' }}>{deger}</div>
      </div>
      {ad && <button onClick={() => kopyala(deger, ad)} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>{kopyalandi === ad ? '✓' : 'Kopyala'}</button>}
    </div>
  ) : null;

  return (
    <div onClick={kapat} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>💳 Ödeme</h2>
          <button onClick={kapat} className="modal-close">✕</button>
        </div>
        {odendi && (
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(31,111,74,.08)', color: '#1f6f4a', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
            {odemeBilgi.odeme.durum === 'odendi' ? '✅ Bu dönemin ödemesi alındı' : '⏳ Havaleniz onay bekliyor'}
          </div>
        )}
        <button onClick={ode} style={{ width: '100%', padding: '13px 0', borderRadius: 12, border: 'none', background: '#1f6f4a', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
          🚀 Kartla öde{odemeBilgi.tutar ? ` — ${odemeBilgi.tutar}₺` : ''}
        </button>
        {b.iban && (
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>🏦 Havale / EFT</div>
            {satir('Banka', b.banka_adi)}
            {satir('IBAN', b.iban, 'iban')}
            {satir('Hesap sahibi', b.hesap_sahibi, 'sahip')}
            {satir('Açıklama (mutlaka yazın)', b.aciklama, 'aciklama')}
            <div style={{ fontSize: 12, color: '#a8590c', marginTop: 8 }}>⚠️ Havalede açıklamaya <b>{b.aciklama}</b> yazın; ödemeniz böyle eşleşir.</div>
          </div>
        )}
        <button onClick={paketler} className="btn btn-ghost btn-block" style={{ marginTop: 14 }}>Paketleri karşılaştır</button>
      </div>
    </div>
  );
}
