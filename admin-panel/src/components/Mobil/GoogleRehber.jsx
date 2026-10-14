import { useState } from 'react';
import { bookingUrl } from '../../lib/config';

// Google Haritalar'da "Randevu al" butonu (kullanıcı kararı 2026-10-14): esnafın randevu linkini
// Google İşletme Profili'ne eklemesi için adım adım rehber.
const ADIMLAR = [
  ['Google İşletme Profili\'ni aç', 'Telefonda Google Haritalar\'da dükkânını ara ya da aşağıdaki butona dokun. Dükkânın sahibi olarak giriş yaptığın Google hesabıyla girmelisin.'],
  ['"Profili düzenle"ye dokun', 'Dükkânının adı altında "Profili düzenle" (ya da "İşletmeni düzenle") yazar.'],
  ['"Rezervasyonlar" / "Randevu bağlantıları" kısmını bul', 'Bazen "İşletme bilgileri" → "Rezervasyonlar" altındadır. "Randevu bağlantısı ekle"ye dokun.'],
  ['Linkini yapıştır ve kaydet', 'Yukarıdaki "Kopyala" ile aldığın linki yapıştır, kaydet. Google birkaç saat içinde kontrol edip yayına alır.'],
];

// Link "/" işaretlerinden sonra kırılır (kelime ortasından kesilmesin)
const linkKirik = (u) => String(u || '').replace(/^https?:\/\//, '').split('/').flatMap((p, i) => i ? ['/', <wbr key={i} />, p] : [p]);

export default function GoogleRehber({ ayarlar }) {
  const [kopya, setKopya] = useState(false);
  const link = ayarlar?.slug ? bookingUrl(ayarlar.slug) : null;
  const kart = { background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', padding: 16, marginBottom: 14 };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={kart}>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 6 }}>Google Haritalar'da "Randevu al" butonu</div>
        <div style={{ fontSize: 15, color: 'var(--dim)', lineHeight: 1.5 }}>
          Müşterilerin çoğu dükkânını Google'da arıyor. Profiline randevu linkini eklersen, dükkânının yanında "Randevu al" butonu çıkar;
          müşteri arayıp seni meşgul etmeden kendi saatini seçer. 5 dakikalık iş, ücretsiz.
        </div>
      </div>

      <div style={kart}>
        <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Senin randevu linkin</div>
        {link ? (<>
          <div style={{ fontSize: 16, fontWeight: 700, margin: '4px 0 12px', overflowWrap: 'break-word' }}>{linkKirik(link)}</div>
          <button onClick={() => { navigator.clipboard?.writeText(link); setKopya(true); setTimeout(() => setKopya(false), 2000); }}
            style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: '#1f6f4a', color: '#fff', fontWeight: 800, fontSize: 16, fontFamily: 'inherit', cursor: 'pointer' }}>
            {kopya ? '✓ Kopyalandı' : 'Linki kopyala'}
          </button>
        </>) : <div style={{ fontSize: 15, marginTop: 6 }}>Önce Dükkanım → Çalışma saatleri ve ayarlar'dan dükkân bilgilerini kaydet.</div>}
      </div>

      <div style={kart}>
        {ADIMLAR.map(([baslik, aciklama], i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < ADIMLAR.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16, background: 'rgba(66,133,244,.12)', color: '#2f56c6', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{baslik}</div>
              <div style={{ fontSize: 14, color: 'var(--dim)', lineHeight: 1.5, marginTop: 2 }}>{aciklama}</div>
            </div>
          </div>
        ))}
        <a href="https://business.google.com/" target="_blank" rel="noreferrer"
          style={{ marginTop: 12, height: 52, borderRadius: 14, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: '#2f56c6', textDecoration: 'none' }}>
          Google İşletme Profili'ni aç ↗
        </a>
      </div>

      <div style={{ ...kart, background: 'rgba(168,89,12,.06)', borderColor: 'rgba(168,89,12,.25)', fontSize: 14, lineHeight: 1.5 }}>
        <b>Profilin yok mu ya da Google'da çıkmıyor musun?</b> Bizi ara, kurulumu birlikte yapalım. Profil açmak ücretsiz;
        Google adresini doğrulamak için bazen dükkâna kodlu kart yollar ya da video ister.
      </div>
    </div>
  );
}
