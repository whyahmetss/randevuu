import { useState } from 'react';
import { kart, dugme, RENK, waTel, zamanOnce } from './ortak';

// Bot sana devretti (kullanıcı kararı 2026-10-16, tek kişi düzeni): Satış Bot konuşmayı yürütür; aranmak isteyen,
// sıcak, fiyat soran, demosunu açan ya da olumlu dönen aday buraya hazır arama notuyla düşer. Sen yalnız bunları ararsın.
const SEBEP_RENK = { arama: RENK.kirmizi, sicak: RENK.amber, fiyat: RENK.mor, demo: RENK.mavi, olumlu: RENK.yesil };

export default function SicakAdaylar({ api, adaylar, yenile }) {
  const [bekle, setBekle] = useState(null);
  if (!adaylar?.length) return null;

  const kapat = async (id, sonuc) => {
    setBekle(id);
    const d = await api.post(`/admin/masa/sicak/${id}/kapat`, { sonuc });
    setBekle(null);
    if (d?.hata) return alert(d.hata);
    yenile();
  };

  return (
    <div style={{ ...kart, marginBottom: 14, padding: '14px 16px', borderLeft: `4px solid ${RENK.kirmizi}` }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 4 }}>🔥 Bot sana devretti ({adaylar.length})</div>
      <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 10 }}>Satış Bot bu kişilerle konuştu; aramadan önce son yazdıklarına bak. Önce kırmızılar.</div>
      {adaylar.map(a => (
        <div key={a.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.isletme_adi || 'İsimsiz'}</span>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 700, background: `${SEBEP_RENK[a.devir_sebep]}15`, color: SEBEP_RENK[a.devir_sebep] }}>{a.sebep_ad}</span>
            {a.ilce && <span style={{ fontSize: 12, color: 'var(--dim)' }}>📍 {a.ilce}</span>}
            {a.puan && <span style={{ fontSize: 12, color: 'var(--dim)' }}>⭐ {a.puan}</span>}
            <span style={{ fontSize: 11, color: 'var(--dim)', marginLeft: 'auto' }}>{zamanOnce(a.devir_zamani)}</span>
          </div>
          {a.not?.length > 0 && (
            <div style={{ margin: '6px 0', padding: '6px 10px', borderRadius: 8, background: 'var(--bg)', fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
              {a.not.map((n, i) => <div key={i}>💬 "{n}"</div>)}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            <a href={`tel:+${a.telefon}`} style={dugme(RENK.mavi, true)}>📞 Ara</a>
            <a href={`https://wa.me/${waTel(a.telefon)}`} target="_blank" rel="noreferrer" style={dugme(RENK.wa, true)}>💬 WhatsApp</a>
            <span style={{ flex: 1 }} />
            <button disabled={bekle === a.id} onClick={() => kapat(a.id, 'gorustu')} style={dugme(RENK.yesil)}>✓ Görüştüm</button>
            <button disabled={bekle === a.id} onClick={() => kapat(a.id, 'ulasilamadi')} title="3 saat sonra yine listede" style={dugme(RENK.gri)}>Ulaşamadım</button>
            <button disabled={bekle === a.id} onClick={() => { if (confirm(`${a.isletme_adi || 'Bu aday'} ilgilenmiyor olarak işaretlensin mi? Bot da bir daha yazmaz.`)) kapat(a.id, 'ilgilenmiyor'); }} style={dugme(RENK.kirmizi)}>İlgilenmiyor</button>
          </div>
        </div>
      ))}
    </div>
  );
}
