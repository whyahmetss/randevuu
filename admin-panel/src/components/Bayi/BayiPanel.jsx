import { useEffect, useState } from 'react';
import { API_URL } from '../../lib/config';
import { Kart } from '../Satis/QrKart';
import { tl, tarih, DURUM } from './ortak';

// Bayi / toptancı paneli (kullanıcı kararı 2026-10-17): şifresiz, yalnız bayiye gönderilen gizli linkle açılır.
// Bayi kartını basar, getirdiği dükkânları ve kazancını görür. Esnafın telefon/e-posta bilgisi burada yok.
const S = {
  sayfa: { minHeight: '100vh', background: 'var(--bg, #f6f4ef)', color: 'var(--text, #1d1b16)', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '20px 16px 40px' },
  kutu: { maxWidth: 720, margin: '0 auto' },
  kart: { background: 'var(--surface, #fff)', border: '1px solid var(--border, #e6e1d8)', borderRadius: 16, padding: '16px 18px', marginBottom: 14 },
  dim: { color: 'var(--dim, #6f6a62)' },
  dugme: (renk, dolu) => ({ padding: '9px 14px', borderRadius: 10, border: dolu ? 'none' : '1px solid var(--border, #e6e1d8)', background: dolu ? renk : 'var(--surface, #fff)',
    color: dolu ? '#fff' : renk, fontWeight: 700, fontSize: 13, cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit', display: 'inline-flex', gap: 6, alignItems: 'center' }),
};

function Kutucuk({ ad, deger, renk, alt }) {
  return (
    <div style={{ ...S.kart, marginBottom: 0, padding: '12px 14px' }}>
      <div style={{ fontSize: 12, ...S.dim }}>{ad}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: renk || 'inherit', marginTop: 2 }}>{deger}</div>
      {alt && <div style={{ fontSize: 11, ...S.dim, marginTop: 2 }}>{alt}</div>}
    </div>
  );
}

export default function BayiPanel({ token }) {
  const [v, setV] = useState(null);
  const [hata, setHata] = useState('');
  useEffect(() => {
    document.title = 'SıraGO Bayi Paneli';
    fetch(`${API_URL}/bayi/${encodeURIComponent(token)}`).then(r => r.json())
      .then(d => (d?.hata ? setHata(d.hata) : setV(d))).catch(() => setHata('Panel açılamadı, internet bağlantınızı kontrol edin.'));
  }, [token]);

  if (hata) return <div style={S.sayfa}><div style={{ ...S.kutu, ...S.kart, textAlign: 'center' }}><b>⚠️ {hata}</b><p style={{ fontSize: 13, ...S.dim }}>Linki SıraGO'dan yeniden isteyin.</p></div></div>;
  if (!v) return <div style={S.sayfa}><div style={{ ...S.kutu, textAlign: 'center', ...S.dim }}>Yükleniyor…</div></div>;

  const { bayi, kart, ozet, isletmeler, odemeler, destek } = v;
  const kartV = { ...kart, isim: bayi.firma || bayi.isim };
  const indir = () => { const a = document.createElement('a'); a.href = kart.qr; a.download = `sirago-kart-${kart.kod}.png`; a.click(); };
  const kural = [`getirdiğin dükkânın her ödemesinden %${bayi.komisyon_yuzde}`, bayi.ilk_odeme_tl > 0 ? `ilk ödemesinde ayrıca ${tl(bayi.ilk_odeme_tl)}` : null].filter(Boolean).join(', ');

  return (
    <div style={S.sayfa}>
      <style>{`@media print {
        body * { visibility: hidden !important; }
        .qr-baski, .qr-baski * { visibility: visible !important; }
        .qr-baski { position: absolute !important; left: 0; top: 0; display: grid !important; grid-template-columns: repeat(2, 85mm); gap: 6mm; padding: 8mm; }
        @page { size: A4; margin: 0; }
      }`}</style>
      <div style={S.kutu}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <img src="/img/tilki-maskot.webp" alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Merhaba {bayi.isim} 👋</div>
            <div style={{ fontSize: 13, ...S.dim }}>{bayi.firma ? `${bayi.firma} · ` : ''}SıraGO bayi paneli · kodun <b>{kart.kod}</b></div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kutucuk ad="Getirdiğin dükkân" deger={ozet.kayit} alt={ozet.bu_ay_kayit ? `bu ay ${ozet.bu_ay_kayit} yeni` : null} />
          <Kutucuk ad="Ödeyen dükkân" deger={ozet.odeyen} renk="#1f6f4a" />
          <Kutucuk ad="Bu ay kazancın" deger={tl(ozet.bu_ay_hakedis)} renk="#1f6f4a" />
          <Kutucuk ad="Sana ödenecek" deger={tl(ozet.bakiye)} renk="#5d4bb5" alt={`toplam ${tl(ozet.hakedis)} · ödenen ${tl(ozet.odenen)}`} />
        </div>

        <div style={S.kart}>
          <b style={{ fontSize: 15 }}>🎴 Kartın</b>
          <p style={{ fontSize: 13, ...S.dim, lineHeight: 1.5, margin: '6px 0 12px' }}>
            Kartı berber, kuaför ve güzellik salonlarına bırak. Esnaf kamerayla okutunca SıraGO'yu ücretsiz denemeye başlar ve kaydı sana yazılır.
            Kazancın: {kural}. Dükkân ödedikçe burada görürsün.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', overflowX: 'auto', marginBottom: 12 }}><Kart v={kartV} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button onClick={() => window.print()} style={S.dugme('#1f6f4a', true)}>🖨️ Yazdır (A4'e 8 kart)</button>
            <button onClick={indir} style={S.dugme('#2f56c6')}>⬇️ QR'ı indir</button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`Randevularınızı WhatsApp'tan otomatik alan sistem, ücretsiz deneyin: ${kart.link}`)}`} target="_blank" rel="noreferrer" style={S.dugme('#25d366', true)}>💬 Esnafa WhatsApp'tan gönder</a>
          </div>
          <div className="qr-baski" style={{ display: 'none' }}>{Array.from({ length: 8 }, (_, i) => <Kart key={i} v={kartV} />)}</div>
        </div>

        <div style={S.kart}>
          <b style={{ fontSize: 15 }}>🏪 Getirdiğin dükkânlar ({isletmeler.length})</b>
          {isletmeler.length === 0
            ? <p style={{ fontSize: 13, ...S.dim }}>Henüz yok. Kartı okutan ilk dükkân buraya düşer.</p>
            : isletmeler.map(i => (
              <div key={i.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border, #e6e1d8)' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{i.isim}</div>
                  <div style={{ fontSize: 12, ...S.dim }}>{i.ilce ? `📍 ${i.ilce} · ` : ''}{tarih(i.kayit)}</div>
                </div>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 700, color: DURUM[i.durum]?.renk, background: `${DURUM[i.durum]?.renk}15` }}>{DURUM[i.durum]?.ad}</span>
                <span style={{ fontWeight: 700, fontSize: 13, minWidth: 70, textAlign: 'right', color: i.kazanc ? '#1f6f4a' : 'var(--dim, #6f6a62)' }}>{tl(i.kazanc)}</span>
              </div>
            ))}
        </div>

        {odemeler.length > 0 && (
          <div style={S.kart}>
            <b style={{ fontSize: 15 }}>💸 Sana yapılan ödemeler</b>
            {odemeler.map((o, k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderTop: '1px solid var(--border, #e6e1d8)', fontSize: 13 }}>
                <span>{tarih(o.tarih)}{o.notu ? ` · ${o.notu}` : ''}</span><b>{tl(o.tutar)}</b>
              </div>
            ))}
          </div>
        )}

        <p style={{ fontSize: 12, ...S.dim, textAlign: 'center' }}>
          Bu link sana özel, başkasıyla paylaşma.{destek ? <> Sorun olursa <a href={destek} target="_blank" rel="noreferrer" style={{ color: '#1f6f4a', fontWeight: 700 }}>bize yaz</a>.</> : ''}
        </p>
      </div>
    </div>
  );
}
