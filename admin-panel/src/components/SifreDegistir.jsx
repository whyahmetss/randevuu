// Şifre değiştirme (2026-10-15): Ayarlar'daki "Şifremi değiştir" ve geçici şifreyle girende zorunlu ekran.
// zorunlu=true: mevcut şifre sorulmaz (sunucu sifre_degistirmeli bayrağına bakar); değiştirilene kadar panel açılmaz.
import { useState } from 'react';

function Alan({ etiket, value, onChange, autoComplete, autoFocus }) {
  const [goster, setGoster] = useState(false);
  return (
    <label style={{ display: 'block', marginBottom: 10 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--dim)', marginBottom: 4 }}>{etiket}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <input type={goster ? 'text' : 'password'} value={value} onChange={onChange} autoComplete={autoComplete} autoFocus={autoFocus}
          className="input" style={{ width: '100%', paddingRight: 72, boxSizing: 'border-box' }} />
        <button type="button" onClick={() => setGoster(g => !g)} aria-label={goster ? 'Şifreyi gizle' : 'Şifreyi göster'}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'none', color: 'var(--dim)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 8px', fontFamily: 'inherit' }}>{goster ? 'Gizle' : 'Göster'}</button>
      </span>
    </label>
  );
}

export function SifreFormu({ api, zorunlu = false, onTamam }) {
  const [f, setF] = useState({ mevcut: '', yeni: '', tekrar: '' });
  const [hata, setHata] = useState('');
  const [ok, setOk] = useState('');
  const [bekle, setBekle] = useState(false);

  const gonder = async (e) => {
    e.preventDefault(); setHata(''); setOk('');
    if (!zorunlu && !f.mevcut) return setHata('Mevcut şifreni yaz');
    if (f.yeni.length < 8) return setHata('Yeni şifre en az 8 karakter olmalı');
    if (f.yeni !== f.tekrar) return setHata('Yeni şifreler aynı değil');
    setBekle(true);
    const d = await api.post('/auth/sifre-degistir', { mevcut: zorunlu ? undefined : f.mevcut, yeni: f.yeni });
    setBekle(false);
    if (d?.hata) return setHata(d.hata);
    setF({ mevcut: '', yeni: '', tekrar: '' });
    setOk('Şifren değişti.');
    onTamam?.();
  };

  return (
    <form onSubmit={gonder}>
      {!zorunlu && <Alan etiket="Mevcut şifre" value={f.mevcut} onChange={e => setF({ ...f, mevcut: e.target.value })} autoComplete="current-password" />}
      <Alan etiket="Yeni şifre (en az 8 karakter)" value={f.yeni} onChange={e => setF({ ...f, yeni: e.target.value })} autoComplete="new-password" autoFocus={zorunlu} />
      <Alan etiket="Yeni şifre (tekrar)" value={f.tekrar} onChange={e => setF({ ...f, tekrar: e.target.value })} autoComplete="new-password" />
      {hata && <div role="alert" style={{ fontSize: 13, color: '#b42318', fontWeight: 600, marginBottom: 10 }}>{hata}</div>}
      {ok && <div style={{ fontSize: 13, color: '#1f6f4a', fontWeight: 600, marginBottom: 10 }}>✓ {ok}</div>}
      <button type="submit" disabled={bekle} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: 'none', background: '#1f6f4a', color: '#fff',
        fontWeight: 700, fontSize: 14, cursor: bekle ? 'wait' : 'pointer', fontFamily: 'inherit', opacity: bekle ? 0.7 : 1 }}>
        {bekle ? 'Kaydediliyor…' : zorunlu ? 'Kaydet ve devam et' : 'Şifremi değiştir'}
      </button>
    </form>
  );
}

// Geçici şifreyle ilk giriş: tam ekran, şifre belirlenmeden panel açılmaz
export default function SifreBelirle({ api, kullanici, onTamam, onCikis }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'var(--bg, #f6f4ef)', boxSizing: 'border-box' }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface, #fff)', border: '1px solid var(--border, #e6e1d8)', borderRadius: 18, padding: '26px 24px' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>🔒</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 6px', color: 'var(--text)' }}>Kendi şifreni belirle</h1>
        <p style={{ fontSize: 13, color: 'var(--dim)', margin: '0 0 18px', lineHeight: 1.5 }}>
          Hesabın {kullanici?.email ? <b>{kullanici.email}</b> : 'senin için'} geçici bir şifreyle açıldı. Devam etmek için yalnız senin bildiğin yeni bir şifre belirle.
        </p>
        <SifreFormu api={api} zorunlu onTamam={onTamam} />
        <button type="button" onClick={onCikis} style={{ marginTop: 12, width: '100%', padding: 10, border: 'none', background: 'none', color: 'var(--dim)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
          Çıkış yap
        </button>
      </div>
    </div>
  );
}
