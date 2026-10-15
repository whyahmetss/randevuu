// Platform Ayarları (2026-10-15): IBAN, iletişim, deneme süresi, bot sınırları — kod/deploy gerekmeden.
// Boş bırakılan alan koddaki varsayılana döner. Her değişiklik Audit Log'a yazılır.
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj, etiketStil } from './ortak';

export default function PlatformAyarlari({ api }) {
  const [ayarlar, setAyarlar] = useState(null);
  const [form, setForm] = useState({});
  const [mesaj, setMesaj] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const yukle = async () => {
    const d = await api.get('/admin/platform-ayarlari');
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setAyarlar(d.ayarlar);
    setForm(Object.fromEntries(d.ayarlar.map(a => [a.anahtar, a.deger ?? ''])));
  };
  useEffect(() => { yukle(); }, []);

  const kaydet = async (e) => {
    e.preventDefault();
    setKaydediliyor(true); setMesaj(null);
    const d = await api.put('/admin/platform-ayarlari', { degerler: form });
    setKaydediliyor(false);
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setAyarlar(d.ayarlar);
    setForm(Object.fromEntries(d.ayarlar.map(a => [a.anahtar, a.deger ?? ''])));
    setMesaj({ tur: 'ok', metin: d.degisen ? `${d.degisen} ayar kaydedildi. Bir dakika içinde her yerde geçerli olur.` : 'Değişiklik yok.' });
  };

  if (!ayarlar) return <><SayfaBaslik baslik="Platform Ayarları" /><Mesaj m={mesaj} /><div className="list-empty"><p>Yükleniyor…</p></div></>;

  const gruplar = [...new Set(ayarlar.map(a => a.grup))];
  return (
    <>
      <SayfaBaslik baslik="Platform Ayarları" aciklama="İşi etkileyen değerler. Boş bırakılan alan varsayılana döner; her değişiklik Audit Log'a yazılır." />
      <Mesaj m={mesaj} />
      <form onSubmit={kaydet}>
        {gruplar.map(g => (
          <div key={g} className="card mb-16" style={{ padding: '16px 18px' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>{g}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {ayarlar.filter(a => a.grup === g).map(a => (
                <div key={a.anahtar}>
                  <label style={etiketStil}>{a.etiket}</label>
                  <input className="input" type={a.tur === 'sayi' ? 'number' : 'text'} min={a.min} max={a.max}
                    value={form[a.anahtar] ?? ''} placeholder={`Varsayılan: ${a.varsayilan === '' ? '(boş)' : a.varsayilan}`}
                    onChange={e => setForm({ ...form, [a.anahtar]: e.target.value })} style={{ width: '100%', fontSize: 13 }} />
                  <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 3 }}>Şu an geçerli: <b>{String(a.etkin) || '(boş)'}</b></div>
                </div>
              ))}
            </div>
          </div>
        ))}
        <button type="submit" disabled={kaydediliyor} className="btn" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>
          {kaydediliyor ? 'Kaydediliyor…' : '💾 Kaydet'}
        </button>
      </form>
      <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 14, lineHeight: 1.5 }}>
        Not: Yıllık ödemedeki "12 ay kullan, 9 ay öde" kuralı Kullanım Şartları'nda ve ana sayfada yazılı olduğu için burada değiştirilemez.
      </div>
    </>
  );
}
