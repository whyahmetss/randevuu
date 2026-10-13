import { useState, useEffect } from 'react';

// "Bu ay kazandırdığımız" (kullanıcı kararı 2026-10-14): sadece ölçülebilen sayılar; ayın 1'inde aynı özet
// esnafın kendi WhatsApp'ına gider (services/aylikKazanc.js).
const tl = (n) => `${Math.round(n).toLocaleString('tr-TR')}₺`;

export default function KazancKarti({ api, dar }) {
  const [k, setK] = useState(null);
  const [acik, setAcik] = useState(false);
  useEffect(() => { api.get('/kazanc').then(d => !d?.hata && setK(d)).catch(() => {}); }, []);
  if (!k || !k.toplam) return null;

  const ozetAyar = async (aktif) => { setK({ ...k, whatsapp_ozet: aktif }); await api.put('/kazanc/ayar', { aktif }); };
  const kutu = (deger, etiket) => (
    <div style={{ flex: '1 1 120px', padding: '12px 14px', borderRadius: 14, background: 'rgba(31,111,74,.07)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#1f6f4a', fontVariantNumeric: 'tabular-nums' }}>{deger}</div>
      <div style={{ fontSize: 13, color: 'var(--dim)', fontWeight: 600, lineHeight: 1.3 }}>{etiket}</div>
    </div>
  );

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 18, padding: 16, marginBottom: 14, ...(dar ? { maxWidth: 560, margin: '0 auto 14px' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1, fontSize: 17, fontWeight: 800 }}>Bu ay kazandırdığımız</div>
        <div style={{ fontSize: 13, color: 'var(--dim)' }}>{k.ay_adi}</div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {kutu(k.otomatik, 'sen uğraşmadan gelen randevu')}
        {k.otomatik_tutar > 0 && kutu(`≈ ${tl(k.otomatik_tutar)}`, 'bu randevuların değeri')}
        {k.mesai_disi > 0 && kutu(k.mesai_disi, 'dükkân kapalıyken alındı')}
        {k.hatirlatilan > 0 && kutu(`${k.hatirlatilan_gelen}/${k.hatirlatilan}`, 'hatırlatma gitti, geldi')}
      </div>
      <button onClick={() => setAcik(!acik)} style={{ marginTop: 10, border: 'none', background: 'none', padding: 0, color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', textDecoration: 'underline' }}>
        {acik ? 'Kapat' : 'Bu sayılar nereden geliyor?'}
      </button>
      {acik && (
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--dim)', lineHeight: 1.55 }}>
          WhatsApp asistanı, online randevu sayfası ve Telegram'dan gelen randevular sayılır; senin elle eklediklerin sayılmaz.
          Değer, hizmet fiyatlarından hesaplanır (iptal ve gelmeyenler hariç). Ayın toplamı: {k.toplam} randevu{k.gelmeyen ? `, gelmeyen: ${k.gelmeyen}` : ''}.
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, color: 'var(--text)', fontWeight: 600 }}>
            <input type="checkbox" checked={k.whatsapp_ozet} onChange={e => ozetAyar(e.target.checked)} />
            Her ayın 1'inde bu özeti WhatsApp'ıma gönder
          </label>
        </div>
      )}
    </div>
  );
}
