import { useState } from 'react';
import { bookingUrl } from '../../lib/config';

// Dükkanım (telefon düzeni, kullanıcı kararı 2026-10-13): ayarlar büyük satırlarda; ileri özelliklerin
// hepsi "Daha fazla" altında (hiçbir özellik kaldırılmadı, yalnız yeri değişti).
const satir = { minHeight: 64, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, width: '100%', boxSizing: 'border-box',
  border: 'none', borderBottom: '1px solid var(--border)', background: 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--text)' };
const ok = <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="2.2" strokeLinecap="round"><path d="m9 6 6 6-6 6" /></svg>;

function Satir({ baslik, alt, onClick, renk, kilitli }) {
  return (
    <button onClick={onClick} style={satir}>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 17, fontWeight: 700 }}>{baslik}{kilitli ? ' 🔒' : ''}</span>
        {alt && <span style={{ fontSize: 14, color: renk || 'var(--dim)', fontWeight: renk ? 700 : 500 }}>{alt}</span>}
      </span>
      {ok}
    </button>
  );
}

export default function Dukkanim({ ayarlar, wpBagli, digerleri, ac }) {
  const [fazla, setFazla] = useState(false);
  const [kopya, setKopya] = useState(false);
  const link = ayarlar?.slug ? bookingUrl(ayarlar.slug) : null;
  const kart = { background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 14 };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      {link && (
        <div style={{ ...kart, padding: 16 }}>
          <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Randevu linkin</div>
          <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 12px', wordBreak: 'break-all' }}>{link.replace(/^https?:\/\//, '')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href={`https://wa.me/?text=${encodeURIComponent('Randevunu buradan kendin alabilirsin: ' + link)}`} target="_blank" rel="noreferrer"
              style={{ flex: 1, height: 52, borderRadius: 14, background: '#25d366', color: '#0b3d20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, textDecoration: 'none' }}>WhatsApp'ta paylaş</a>
            <button onClick={() => { navigator.clipboard?.writeText(link); setKopya(true); setTimeout(() => setKopya(false), 1500); }}
              style={{ height: 52, padding: '0 16px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', color: 'var(--text)' }}>{kopya ? '✓' : 'Kopyala'}</button>
            <button onClick={() => ac('qrkod')} style={{ height: 52, padding: '0 16px', borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface)', fontWeight: 700, fontSize: 15, fontFamily: 'inherit', color: 'var(--text)' }}>QR</button>
          </div>
        </div>
      )}

      <button onClick={() => ac('esnafgetir')} style={{ ...kart, width: '100%', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(168,89,12,.3)', background: 'rgba(168,89,12,.07)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: '#a8590c' }}>Komşunu getir, 1 ay bedava</span>
          <span style={{ fontSize: 13, color: 'var(--dim)' }}>Davet linkin ve Öncü Esnaf rozetin</span>
        </span>
        {ok}
      </button>

      <div style={kart}>
        <Satir baslik="Hizmetler ve fiyatlar" onClick={() => ac('hizmetler')} />
        <Satir baslik="Çalışma saatleri ve ayarlar" alt={ayarlar?.calisma_baslangic ? `${String(ayarlar.calisma_baslangic).slice(0, 5)} – ${String(ayarlar.calisma_bitis || '').slice(0, 5)}` : null} onClick={() => ac('ayarlar')} />
        <Satir baslik="Çalışanlar" onClick={() => ac('calisanlar')} />
        <Satir baslik="Randevu sayfam" alt="Kapak fotoğrafı, logo, tema — müşterinin gördüğü sayfa" onClick={() => ac('randevusayfam')} />
        <Satir baslik="Google Haritalar'da randevu butonu" alt="Müşteri seni Google'da bulunca kendi saatini seçsin" onClick={() => ac('googleharita')} />
        <Satir baslik="SıraGO Vitrini" alt="Tablet, stant, malzeme — dükkânın için" onClick={() => ac('vitrin')} />
        <Satir baslik="Tablet modu" alt="Tezgâhtaki tablet için dükkan ekranı ve müşteri modu" onClick={() => ac('tablet')} />
        <Satir baslik="WhatsApp asistanı" alt={wpBagli ? `Bağlı · ${ayarlar?.randevu_onay_modu === 'manuel' ? 'randevuları önce sana sorar' : 'randevuları kendisi verir'}` : 'Bağlı değil — bağlamak için dokun'}
          renk={wpBagli ? '#1f6f4a' : '#b42318'} onClick={() => ac('botbaglanti')} />
        <button onClick={() => setFazla(!fazla)} style={{ ...satir, borderBottom: 'none', color: 'var(--dim)' }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{fazla ? 'Daha azı' : 'Daha fazla (kasa, sadakat, raporlar…)'}</span>
          <span style={{ transform: fazla ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }}>{ok}</span>
        </button>
      </div>

      {fazla && (
        <div style={kart}>
          {digerleri.map(m => <Satir key={m.id} baslik={m.label} kilitli={m.kilitli} onClick={() => ac(m.id)} />)}
        </div>
      )}

      <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--dim)', margin: '8px 0 20px' }}>
        Takıldın mı? <button onClick={() => ac('destek')} style={{ border: 'none', background: 'none', color: '#1f6f4a', fontWeight: 700, fontFamily: 'inherit', fontSize: 14, cursor: 'pointer' }}>Bize yaz</button>
      </div>
    </div>
  );
}
