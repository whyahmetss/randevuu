// Sistem Uyarıları (2026-10-15): WhatsApp kopması, cevapsız müşteri mesajı, gönderim ve ödeme hataları.
// Aynı sorun tekrar ederse yeni satır açılmaz, adet artar. Kendiliğinden düzelenler (WhatsApp yeniden bağlandı) kapanır.
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj, zaman } from './ortak';

const SEVIYE = {
  kritik: { renk: '#b42318', zemin: 'rgba(180,35,24,.08)', ad: 'Kritik' },
  uyari: { renk: '#a8590c', zemin: 'rgba(168,89,12,.08)', ad: 'Uyarı' },
  bilgi: { renk: '#2f56c6', zemin: 'rgba(47,86,198,.08)', ad: 'Bilgi' },
};
const TIP = { alarm: '🚨 Alarm', cevapsiz: '🔇 Cevapsız mesaj', gonderim: '⚠️ Gönderim', odeme: '💳 Ödeme', kurulum: '🧭 Kurulum takıldı', numara: '📵 Numara çakışması' };

export default function SistemUyarilari({ api, onSayiDegisti, isletmeAc }) {
  const [durum, setDurum] = useState('acik');
  const [liste, setListe] = useState(null);
  const [mesaj, setMesaj] = useState(null);

  const yukle = async () => {
    const d = await api.get(`/admin/sistem-uyarilari?durum=${durum}`);
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setListe(d.uyarilar);
  };
  useEffect(() => { setListe(null); yukle(); }, [durum]);

  const coz = async (id) => {
    const d = await api.post(`/admin/sistem-uyarilari/${id}/coz`, {});
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    await yukle(); onSayiDegisti?.();
  };

  return (
    <>
      <SayfaBaslik baslik="Sistem Uyarıları" aciklama="Sorunlar müşteriden önce burada görünür. Aynı sorun tekrar ederse sayısı artar.">
        {['acik', 'cozuldu'].map(d => (
          <button key={d} onClick={() => setDurum(d)} className="btn btn-sm"
            style={{ background: durum === d ? '#1f6f4a' : 'var(--surface)', color: durum === d ? '#fff' : 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 }}>
            {d === 'acik' ? 'Açık' : 'Çözülenler'}
          </button>
        ))}
        {durum === 'acik' && liste?.length > 0 && (
          <button onClick={() => { if (confirm('Tüm açık uyarılar çözüldü olarak işaretlensin mi?')) coz('hepsi'); }} className="btn btn-sm btn-ghost">Hepsini çözüldü say</button>
        )}
      </SayfaBaslik>
      <Mesaj m={mesaj} />
      {!liste ? <div className="list-empty"><p>Yükleniyor…</p></div>
        : liste.length === 0 ? <div className="list-empty"><p>{durum === 'acik' ? '✅ Açık uyarı yok. Her şey yolunda.' : 'Henüz çözülen uyarı yok.'}</p></div>
        : liste.map(u => {
          const s = SEVIYE[u.seviye] || SEVIYE.uyari;
          return (
            <div key={u.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, borderLeft: `4px solid ${s.renk}` }}>
              <div className="row row-between gap-8" style={{ flexWrap: 'wrap' }}>
                <div className="row gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="tag" style={{ background: s.zemin, color: s.renk, fontWeight: 700 }}>{s.ad}</span>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>{TIP[u.tip] || u.tip}</span>
                  {u.adet > 1 && <span className="tag" style={{ background: 'var(--surface)', fontWeight: 700 }}>×{u.adet}</span>}
                </div>
                {durum === 'acik' && <button onClick={() => coz(u.id)} className="btn btn-sm" style={{ background: 'rgba(31,111,74,.1)', color: '#1f6f4a', fontWeight: 600 }}>✓ Çözüldü</button>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{u.baslik}</div>
              {u.detay && <div style={{ fontSize: 12, color: 'var(--dim)', whiteSpace: 'pre-wrap' }}>{u.detay}</div>}
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                İlk: {zaman(u.ilk_zaman)} · Son: {zaman(u.son_zaman)}
                {u.isletme_id && <> · İşletme: {isletmeAc
                  ? <a href="#" onClick={(e) => { e.preventDefault(); isletmeAc(u.isletme_id); }}>{u.isletme_isim || `#${u.isletme_id}`}</a>
                  : (u.isletme_isim || `#${u.isletme_id}`)}</>}
                {u.cozuldu && <> · Çözen: {u.cozen} ({zaman(u.cozulme_zamani)})</>}
              </div>
            </div>
          );
        })}
    </>
  );
}
