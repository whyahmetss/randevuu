import { useState, useEffect } from 'react';

// Kapıdan gelen / telefonla arayan müşteri: hizmete dokun, istersen ad ve numara yaz, kaydet.
// Saat verilmezse "şimdi"; istenirse gün ve boş saat seçilir (ileri tarihli / iptal edilenin yeniden yazılması).
// Telefon ve tablet ekranı ortak kullanır.
export default function KapidanGelen({ api, saat, tarih, calisanId, kapat, eklendi, buyuk }) {
  const [hizmetler, setHizmetler] = useState([]);
  const [secili, setSecili] = useState(null);
  const [isim, setIsim] = useState('');
  const [tel, setTel] = useState('');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState(null);
  const [kisi, setKisi] = useState(1);        // çok kişilik: ek kişiler aynı saatte boş ustaya, yoksa arka arkaya
  const [bilgi, setBilgi] = useState(null);   // kayıttan sonra gösterilecek özet (yer kalmayan kişi varsa)
  // Ne zaman: saat dışarıdan gelmediyse "Şimdi" ya da seçilen gün + saat
  const gun = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('sv-SE');
  const [ileri, setIleri] = useState(false);
  const [secTarih, setSecTarih] = useState(gun(0));
  const [secSaat, setSecSaat] = useState('');
  const [bosSaatler, setBosSaatler] = useState(null);
  useEffect(() => {
    if (!ileri) return;
    setBosSaatler(null);
    api.get(`/randevular/bos-saatler?tarih=${secTarih}${secili ? `&hizmet_id=${secili}` : ''}`).then(d => setBosSaatler(d?.saatler || [])).catch(() => setBosSaatler([]));
  }, [ileri, secTarih, secili]);
  useEffect(() => { api.get('/hizmetler').then(d => { const l = (d?.hizmetler || []).filter(h => h.aktif !== false); setHizmetler(l); if (l.length === 1) setSecili(l[0].id); }).catch(() => {}); }, []);

  const kaydet = async () => {
    setBekle(true); setHata(null);
    const r = await api.post('/randevular/elle', { hizmet_id: secili, musteri_isim: isim, musteri_telefon: tel,
      saat: saat || (ileri ? secSaat : undefined), tarih: tarih || (ileri ? secTarih : undefined), calisan_id: calisanId, kisi });
    setBekle(false);
    if (r?.hata) return setHata(r.hata);
    eklendi?.();
    if (r?.ek?.eksik > 0) {
      const saatler = [String(r.randevu?.saat || '').slice(0, 5), ...(r.ek.yazilan || []).map(x => x.saat)].filter(Boolean);
      return setBilgi(`${saatler.length} kişi yazıldı (${saatler.join(', ')}). ${r.ek.eksik} kişiye o gün yer kalmadı.`);
    }
    kapat();
  };

  const fs = buyuk ? 20 : 17;
  const hazir = secili && (saat || !ileri || secSaat);
  return (
    <div role="dialog" aria-modal="true" aria-label="Randevu ekle" onClick={kapat}
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: buyuk ? 640 : 520, background: 'var(--surface)', borderRadius: '22px 22px 0 0',
        padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: fs + 4, fontWeight: 800 }}>{saat ? `${saat} için randevu` : 'Kapıdan gelen müşteri'}</div>
          <button onClick={kapat} aria-label="Kapat" style={{ width: 44, height: 44, border: 'none', background: 'var(--bg)', borderRadius: 12, fontSize: 20, cursor: 'pointer', color: 'var(--text)' }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Hizmet</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {hizmetler.map(h => (
            <button key={h.id} onClick={() => setSecili(h.id)} style={{ minHeight: 52, padding: '0 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: fs - 1, fontWeight: 700,
              border: `2px solid ${secili === h.id ? '#1f6f4a' : 'var(--border)'}`, background: secili === h.id ? 'rgba(31,111,74,.1)' : 'var(--surface)', color: secili === h.id ? '#1f6f4a' : 'var(--text)' }}>
              {h.isim}{Number(h.fiyat) > 0 ? ` · ${Number(h.fiyat)}₺` : ''}
            </button>
          ))}
          {hizmetler.length === 0 && <div style={{ fontSize: 15, color: 'var(--dim)' }}>Önce Dükkanım → Hizmetler'den hizmet ekle.</div>}
        </div>
        <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Kaç kişi?</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {[1, 2, 3, 4].map(n => (
            <button key={n} onClick={() => setKisi(n)} style={{ minWidth: 56, minHeight: 48, padding: '0 14px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: fs - 1, fontWeight: 700,
              border: `2px solid ${kisi === n ? '#1f6f4a' : 'var(--border)'}`, background: kisi === n ? 'rgba(31,111,74,.1)' : 'var(--surface)', color: kisi === n ? '#1f6f4a' : 'var(--text)' }}>
              {n} kişi
            </button>
          ))}
        </div>
        {kisi > 1 && <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: -6 }}>Her kişiye ayrı randevu açılır: boş usta varsa aynı saatte, yoksa arka arkaya.</div>}
        {!saat && (() => {
          const chip = (aktif) => ({ minHeight: 48, padding: '0 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: fs - 2, fontWeight: 700,
            border: `2px solid ${aktif ? '#1f6f4a' : 'var(--border)'}`, background: aktif ? 'rgba(31,111,74,.1)' : 'var(--surface)', color: aktif ? '#1f6f4a' : 'var(--text)' });
          return (<>
            <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Ne zaman?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => setIleri(false)} style={chip(!ileri)}>Şimdi</button>
              <button onClick={() => { setIleri(true); setSecTarih(gun(0)); setSecSaat(''); }} style={chip(ileri && secTarih === gun(0))}>Bugün</button>
              <button onClick={() => { setIleri(true); setSecTarih(gun(1)); setSecSaat(''); }} style={chip(ileri && secTarih === gun(1))}>Yarın</button>
              <input type="date" value={secTarih} min={gun(0)} onChange={e => { setIleri(true); setSecTarih(e.target.value); setSecSaat(''); }} className="input" style={{ height: 48, fontSize: fs - 2, borderRadius: 12 }} />
            </div>
            {ileri && (<>
              <div style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Saat</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {bosSaatler === null && <div style={{ fontSize: 14, color: 'var(--dim)' }}>Boş saatler yükleniyor…</div>}
                {bosSaatler?.length === 0 && <div style={{ fontSize: 14, color: 'var(--dim)' }}>Bu gün boş saat görünmüyor, aşağıya saati elle yazabilirsin.</div>}
                {(bosSaatler || []).map(s => <button key={s} onClick={() => setSecSaat(s)} style={{ ...chip(secSaat === s), minHeight: 44, padding: '0 12px' }}>{s}</button>)}
              </div>
              <label style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Başka saat
                <input type="time" step="300" value={secSaat} onChange={e => setSecSaat(e.target.value)} className="input" style={{ width: '100%', height: 52, fontSize: fs, marginTop: 6, borderRadius: 12 }} />
              </label>
            </>)}
          </>);
        })()}
        <label style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Ad (isteğe bağlı)
          <input value={isim} onChange={e => setIsim(e.target.value)} placeholder="Müşterinin adı" className="input" style={{ width: '100%', height: 52, fontSize: fs, marginTop: 6, borderRadius: 12 }} />
        </label>
        <label style={{ fontSize: 14, color: 'var(--dim)', fontWeight: 600 }}>Telefon (isteğe bağlı — hatırlatma gitsin)
          <input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" className="input" style={{ width: '100%', height: 52, fontSize: fs, marginTop: 6, borderRadius: 12 }} />
        </label>
        {hata && <div style={{ color: '#b42318', fontSize: 14, fontWeight: 600 }}>{hata}</div>}
        {bilgi && <div style={{ color: '#b54708', fontSize: 15, fontWeight: 700 }}>{bilgi}</div>}
        {bilgi ? <button onClick={kapat} style={{ height: 58, border: 'none', borderRadius: 16, background: '#1f6f4a', color: '#fff', fontSize: fs + 1, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>Tamam</button> :
        <button onClick={kaydet} disabled={!hazir || bekle} style={{ height: 58, border: 'none', borderRadius: 16, background: hazir ? '#1f6f4a' : '#9bb9a8', color: '#fff', fontSize: fs + 1, fontWeight: 800, fontFamily: 'inherit', cursor: hazir ? 'pointer' : 'default' }}>
          {bekle ? 'Kaydediliyor…' : saat ? 'Randevuyu kaydet' : ileri ? (secSaat ? `${secTarih.split('-').reverse().slice(0, 2).join('.')} ${secSaat} randevusunu kaydet` : 'Saat seçin') : 'Şimdi başlat'}{kisi > 1 && !bekle ? ` · ${kisi} kişi` : ''}
        </button>}
      </div>
    </div>
  );
}
