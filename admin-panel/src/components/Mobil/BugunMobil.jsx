import { useState, useEffect } from 'react';
import KapidanGelen from './KapidanGelen';
import { useCanliYenile } from '../../lib/socket';

// Telefon "Bugün" ekranı (taslak 2026-10-13): üstte özet, onay bekleyen büyük kart, randevular saat sırasıyla,
// kapıdan gelen müşteri tek dokunuş. Bir randevuya dokununca: Geldi / Gelmedi / Ara / İptal.
const BEKLEYEN = ['onay_bekliyor', 'bekliyor', 'kapora_bekliyor'];
const ETIKET = { onaylandi: ['Onaylı', '#1f6f4a'], tamamlandi: ['Geldi ✓', '#1f6f4a'], gelmedi: ['Gelmedi', '#b42318'], iptal: ['İptal', '#b42318'], kapora_bekliyor: ['Kapora bekleniyor', '#a8590c'] };
const tl = (x) => `${Number(x || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`;
const saat5 = (s) => String(s || '').slice(0, 5);
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const fiyat = (r) => Number(r.toplam_fiyat) || Number(r.fiyat) || 0;
const kanal = { bot: "WhatsApp'tan", whatsapp: "WhatsApp'tan", online: 'randevu linkinden', manuel: 'sen ekledin', telegram: "Telegram'dan" };

export default function BugunMobil({ api, setSayfa }) {
  const [liste, setListe] = useState(null);
  const [wp, setWp] = useState(null);
  const [acik, setAcik] = useState(null);       // dokunulan randevu id
  const [ekle, setEkle] = useState(false);

  const yukle = () => {
    api.get(`/randevular?tarih=${bugun()}`).then(d => setListe((d?.randevular || []).sort((a, b) => String(a.saat).localeCompare(String(b.saat))))).catch(() => setListe([]));
    api.get('/bot/wp/durum').then(d => setWp(d?.durum || null)).catch(() => {});
  };
  // Canlı: randevu gelince/değişince anında tazelenir; aralıklı yenileme yalnız yedek
  useEffect(() => { yukle(); const t = setInterval(yukle, 120000); return () => clearInterval(t); }, []);
  useCanliYenile(yukle, ['randevu:yeni', 'randevu:guncellendi', 'veri:degisti']);

  const durumYap = async (r, durum) => {
    if (durum === 'iptal' && !window.confirm(`${r.musteri_isim || 'Müşteri'} randevusu iptal edilsin mi?`)) return;
    const d = await api.put(`/randevular/${r.id}/durum`, { durum });
    if (d?.hata) return alert(d.hata);
    setAcik(null);
    setListe(l => l.map(x => (x.id === r.id ? { ...x, durum } : x)));
  };

  const l = liste || [];
  const aktif = l.filter(r => !['iptal', 'gelmedi'].includes(r.durum));
  const bekleyen = l.filter(r => BEKLEYEN.includes(r.durum));
  const beklenen = aktif.reduce((t, r) => t + fiyat(r), 0);
  const kart = { background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)' };
  const buyukBtn = (bg, renk) => ({ height: 52, border: 'none', borderRadius: 14, background: bg, color: renk, fontFamily: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer', padding: '0 14px' });

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {wp && wp !== 'bagli' && (
        <button onClick={() => setSayfa('botbaglanti')} style={{ ...kart, padding: '14px 16px', textAlign: 'left', border: '1px solid rgba(180,35,24,.35)', background: 'rgba(180,35,24,.06)', cursor: 'pointer', fontFamily: 'inherit' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#b42318' }}>WhatsApp asistanı bağlı değil</div>
          <div style={{ fontSize: 14, color: 'var(--dim)' }}>Müşteri mesajlarına cevap gitmiyor. Bağlamak için dokun.</div>
        </button>
      )}

      <div style={{ borderRadius: 18, background: '#1f6f4a', color: '#fff', padding: 16, display: 'flex', justifyContent: 'space-between' }}>
        <div><div style={{ fontSize: 30, fontWeight: 800 }}>{aktif.length}</div><div style={{ fontSize: 14, opacity: .9 }}>randevu</div></div>
        <div><div style={{ fontSize: 30, fontWeight: 800 }}>{bekleyen.length}</div><div style={{ fontSize: 14, opacity: .9 }}>onay bekliyor</div></div>
        <div><div style={{ fontSize: 30, fontWeight: 800 }}>{tl(beklenen)}</div><div style={{ fontSize: 14, opacity: .9 }}>bugün</div></div>
      </div>

      <button onClick={() => setEkle(true)} style={{ ...buyukBtn('#1c1b18', '#fff'), height: 58, fontSize: 17 }}>＋ Kapıdan gelen / telefonla arayan</button>

      {liste === null && <div style={{ ...kart, padding: 18, color: 'var(--dim)' }}>Yükleniyor…</div>}
      {liste && l.length === 0 && (
        <div style={{ ...kart, padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Bugün randevu yok</div>
          <div style={{ fontSize: 14, color: 'var(--dim)', marginTop: 4 }}>Randevu linkini müşterilerine gönder: Dükkanım → WhatsApp'ta paylaş</div>
        </div>
      )}

      {l.map(r => {
        const bekliyor = BEKLEYEN.includes(r.durum) && r.durum !== 'kapora_bekliyor';
        const pasif = ['iptal', 'gelmedi', 'tamamlandi'].includes(r.durum);
        const [et, renk] = ETIKET[r.durum] || (bekliyor ? ['Onay bekliyor', '#a8590c'] : ['', 'var(--dim)']);
        const hizmet = r.hizmetler_adlari || r.hizmet_isim || '';
        return (
          <div key={r.id} style={{ ...kart, padding: 16, opacity: pasif ? .6 : 1, border: bekliyor ? '2px solid #e8a33d' : kart.border }}>
            <button onClick={() => setAcik(acik === r.id ? null : r.id)} style={{ all: 'unset', display: 'flex', gap: 14, alignItems: 'center', width: '100%', cursor: 'pointer' }}>
              <div style={{ fontSize: 22, fontWeight: 800, width: 62 }}>{saat5(r.saat)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.musteri_isim || 'Müşteri'}</div>
                <div style={{ fontSize: 14, color: 'var(--dim)' }}>{hizmet}{r.calisan_isim ? ` · ${r.calisan_isim}` : ''}{kanal[r.kaynak] ? ` · ${kanal[r.kaynak]}` : ''}</div>
              </div>
              {et && <div style={{ fontSize: 12, fontWeight: 800, color: renk, textAlign: 'right' }}>{et}</div>}
            </button>
            {bekliyor && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => durumYap(r, 'onaylandi')} style={{ ...buyukBtn('#1f6f4a', '#fff'), flex: 1, fontSize: 17 }}>Onayla</button>
                {r.musteri_telefon && !String(r.musteri_telefon).startsWith('kapi') && <a href={`tel:+${String(r.musteri_telefon).replace(/\D/g, '')}`} aria-label="Ara" style={{ ...buyukBtn('var(--bg)', 'var(--text)'), display: 'flex', alignItems: 'center', textDecoration: 'none' }}>Ara</a>}
                <button onClick={() => durumYap(r, 'iptal')} style={buyukBtn('var(--bg)', '#b42318')}>Reddet</button>
              </div>
            )}
            {acik === r.id && !bekliyor && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
                <button onClick={() => durumYap(r, 'tamamlandi')} style={buyukBtn('#1f6f4a', '#fff')}>Geldi ✓</button>
                <button onClick={() => durumYap(r, 'gelmedi')} style={buyukBtn('var(--bg)', '#b42318')}>Gelmedi</button>
                {r.musteri_telefon && !String(r.musteri_telefon).startsWith('kapi') && <a href={`tel:+${String(r.musteri_telefon).replace(/\D/g, '')}`} style={{ ...buyukBtn('var(--bg)', 'var(--text)'), display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Ara</a>}
                <button onClick={() => durumYap(r, 'iptal')} style={buyukBtn('var(--bg)', 'var(--dim)')}>İptal et</button>
              </div>
            )}
          </div>
        );
      })}
      {ekle && <KapidanGelen api={api} kapat={() => setEkle(false)} eklendi={yukle} />}
    </div>
  );
}
