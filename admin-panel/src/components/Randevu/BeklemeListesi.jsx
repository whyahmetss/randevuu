import { useState, useEffect } from 'react';
import { useCanliYenile } from '../../lib/socket';

// Bekleme listesi (2026-10-27): dolu güne randevu sayfasından/bottan yazılan müşteriler panelde görünmüyordu.
// Yer açılınca sıradakine sistem kendisi WhatsApp'tan teklif gönderir; esnaf isterse arar ve listeden çıkarır.
// Listede kimse yoksa hiç görünmez.
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const gunYazi = (t) => {
  const [y, a, g] = String(t).slice(0, 10).split('-').map(Number);
  return `${g} ${AYLAR[a - 1]} ${GUNLER[new Date(y, a - 1, g).getDay()]}`;
};
const telYazi = (t) => {
  const d = String(t || '').replace(/\D/g, '');
  return d.length === 12 && d.startsWith('90') ? `0${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : t;
};

export default function BeklemeListesi({ api }) {
  const [liste, setListe] = useState([]);

  const yukle = () => api.get('/bekleme-listesi').then(d => setListe(d?.bekleme_listesi || [])).catch(() => {});
  useEffect(() => { yukle(); }, []);
  useCanliYenile(yukle, ['bildirim:yeni', 'randevu:yeni', 'randevu:guncellendi']);

  const cikar = async (b) => {
    if (!window.confirm(`${b.musteri_isim || telYazi(b.musteri_telefon)} bekleme listesinden çıkarılsın mı?\n\nYer açılınca ona haber gitmez.`)) return;
    const d = await api.delete(`/bekleme-listesi/${b.id}`);
    if (d?.hata) return alert(d.hata);
    setListe(l => l.filter(x => x.id !== b.id));
  };

  if (!liste.length) return null;

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid rgba(168,89,12,.3)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>⏳ Bekleme Listesi · {liste.length} kişi</div>
      <div style={{ fontSize: 12, color: 'var(--dim)', margin: '4px 0 12px' }}>
        Dolu güne randevu isteyenler. Yer açılınca sıradakine WhatsApp'tan otomatik haber verilir; isterseniz siz de arayabilirsiniz.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {liste.map(b => {
          const tel = String(b.musteri_telefon || '');
          const telegram = tel.startsWith('tg:');
          const rakam = tel.replace(/\D/g, '');
          return (
            <div key={b.id} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '10px 12px', borderRadius: 10, background: 'var(--surface2)' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 14 }}>
                  {b.musteri_isim || (telegram ? 'Telegram müşterisi' : telYazi(tel))}
                </div>
                <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                  📅 {gunYazi(b.istenen_tarih)}{b.hizmet_isim ? ` · ${b.hizmet_isim}` : ''}
                  {b.musteri_isim && !telegram ? ` · ${telYazi(tel)}` : ''}
                </div>
                {b.durum === 'bildirildi' && (
                  <div style={{ fontSize: 12, color: '#a8590c', fontWeight: 600, marginTop: 2 }}>
                    🔔 {b.bildirilen_saat ? `${b.bildirilen_saat} için ` : ''}yer teklif edildi, cevabı bekleniyor
                  </div>
                )}
              </div>
              {!telegram && rakam && (
                <>
                  <a href={`tel:+${rakam}`} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}>📞 Ara</a>
                  <a href={`https://wa.me/${rakam}`} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }}>💬 WhatsApp</a>
                </>
              )}
              <button onClick={() => cikar(b)} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12, color: '#b42318' }}>Listeden çıkar</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
