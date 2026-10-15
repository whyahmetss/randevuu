import { useState } from 'react';
import { kart, dugme, RENK } from './ortak';

// Sahada hesap aç (kullanıcı kararı 2026-10-15): dükkânda, esnafın yanında 1 dakikada hesap. Geçici şifre esnafın
// WhatsApp'ına gider (ilk girişte kendi şifresini belirler); sonra esnafın paneli açılır ve WhatsApp QR ile bağlanır.
// İşletme bu üyeye yazılır, "Bağladım" sayılır. Aday kartından açılırsa Venüs demosu varsa o sahiplenilir.
const KATEGORILER = ['berber', 'kuaför', 'güzellik salonu', 'tırnak salonu', 'diş kliniği', 'veteriner', 'spa', 'dövme', 'diyetisyen'];
const etiket = { display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dim)', margin: '0 0 4px' };

export function panelAc(token, sayfa) {
  // Yeni sekme tıklama anında açılır (sonradan açılan pencere engellenir); anahtar o sekmeye özel olur
  localStorage.setItem('randevugo_impersonate_token', token);
  const url = `${window.location.origin}?impersonate=1${sayfa ? `&sayfa=${sayfa}` : ''}`;
  if (!window.open(url, '_blank')) window.location.href = url;
}

export default function HesapAc({ api, aday, onKapat, onAcildi }) {
  const [f, setF] = useState({
    isletme_adi: aday?.isletme_adi || '', telefon: aday?.telefon || '', email: '', yetkili_adi: '',
    kategori: KATEGORILER.includes(String(aday?.kategori || '').toLocaleLowerCase('tr')) ? String(aday.kategori).toLocaleLowerCase('tr') : '',
  });
  const [hata, setHata] = useState('');
  const [bekle, setBekle] = useState(false);
  const [sonuc, setSonuc] = useState(null);

  const ac = async (e) => {
    e.preventDefault(); setHata('');
    if (f.isletme_adi.trim().length < 2) return setHata('İşletme adını yazın');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) return setHata('Geçerli bir e-posta yazın');
    setBekle(true);
    const d = await api.post('/admin/masa/hesap-ac', { ...f, lead_id: aday?.id || undefined });
    setBekle(false);
    if (d?.hata) return setHata(d.hata);
    setSonuc(d);
    onAcildi?.(d);
  };

  return (
    <div onClick={onKapat} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...kart, width: '100%', maxWidth: 440, padding: '20px 20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 17, color: 'var(--text)' }}>🏪 Sahada hesap aç</b>
          <button onClick={onKapat} style={{ ...dugme(RENK.gri), padding: '4px 10px' }} aria-label="Kapat">✕</button>
        </div>

        {!sonuc ? (
          <form onSubmit={ac}>
            <p style={{ fontSize: 12, color: 'var(--dim)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Esnafın yanında doldur. Geçici şifre esnafın WhatsApp'ına gider; ilk girişte kendi şifresini belirler. Hesap sana yazılır.
            </p>
            <label style={etiket}>İşletme adı</label>
            <input className="input" value={f.isletme_adi} onChange={e => setF({ ...f, isletme_adi: e.target.value })} style={{ width: '100%', marginBottom: 10 }} required />
            <label style={etiket}>Esnafın cep telefonu (WhatsApp)</label>
            <input className="input" type="tel" inputMode="tel" placeholder="05xx xxx xx xx" value={f.telefon} onChange={e => setF({ ...f, telefon: e.target.value })} style={{ width: '100%', marginBottom: 10 }} required />
            <label style={etiket}>E-posta (giriş için; telefonundaki Gmail adresi olur)</label>
            <input className="input" type="email" inputMode="email" autoCapitalize="none" placeholder="isim@gmail.com" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} style={{ width: '100%', marginBottom: 10 }} required />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <label style={etiket}>Esnafın adı</label>
                <input className="input" placeholder="Ahmet" value={f.yetkili_adi} onChange={e => setF({ ...f, yetkili_adi: e.target.value })} style={{ width: '100%', marginBottom: 10 }} />
              </div>
              <div>
                <label style={etiket}>Kategori</label>
                <select className="input" value={f.kategori} onChange={e => setF({ ...f, kategori: e.target.value })} style={{ width: '100%', marginBottom: 10 }}>
                  <option value="">Seç</option>
                  {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginBottom: 12 }}>Kategoriye göre örnek hizmetler eklenir (fiyatsız); esnafın adı ilk çalışan olur. Panelden birlikte düzenlersiniz.</div>
            {hata && <div role="alert" style={{ fontSize: 13, color: RENK.kirmizi, fontWeight: 600, marginBottom: 10 }}>{hata}</div>}
            <button type="submit" disabled={bekle} style={{ ...dugme(RENK.yesil, true), width: '100%', justifyContent: 'center', padding: '12px 14px', fontSize: 14 }}>
              {bekle ? 'Hesap açılıyor…' : 'Hesabı aç'}
            </button>
          </form>
        ) : (
          <div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(31,111,74,.07)', marginBottom: 12 }}>
              <div style={{ fontWeight: 700, color: RENK.yesil, marginBottom: 6 }}>✅ {sonuc.isletme_isim} hesabı açıldı{sonuc.demodan ? ' (demosu sahiplenildi)' : ''}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7 }}>
                E-posta: <b>{sonuc.email}</b><br />
                Geçici şifre: <b style={{ fontFamily: 'ui-monospace, monospace', fontSize: 16, letterSpacing: 1 }}>{sonuc.sifre}</b><br />
                <span style={{ color: sonuc.wa_gonderildi ? RENK.yesil : RENK.amber, fontWeight: 600 }}>
                  {sonuc.wa_gonderildi ? '✓ Giriş bilgisi esnafın WhatsApp\'ına gitti' : '⚠️ WhatsApp\'a gönderilemedi: şifreyi esnafa sen ver'}
                </span>
                {sonuc.link && <><br />Randevu linki: <a href={sonuc.link} target="_blank" rel="noreferrer" style={{ color: RENK.mavi }}>{sonuc.link.replace(/^https?:\/\//, '')}</a></>}
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 10, lineHeight: 1.5 }}>
              Şimdi esnafın panelini aç: WhatsApp'ı QR ile bağla (esnaf kendi telefonundan <b>Bağlı cihazlar → Cihaz bağla</b> ile okutur), sonra fiyatları birlikte gir.
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button onClick={() => panelAc(sonuc.token, 'botbaglanti')} style={{ ...dugme(RENK.wa, true), justifyContent: 'center', padding: '11px 14px', fontSize: 14 }}>📱 WhatsApp'ı bağla</button>
              <button onClick={() => panelAc(sonuc.token, 'hizmetler')} style={{ ...dugme(RENK.mavi), justifyContent: 'center', padding: '10px 14px' }}>💈 Hizmet ve fiyatları gir</button>
              <button onClick={onKapat} style={{ ...dugme(RENK.gri), justifyContent: 'center' }}>Kapat</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
