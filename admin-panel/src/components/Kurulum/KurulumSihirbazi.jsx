import { useState, useEffect } from 'react';

// Adım adım kurulum (kullanıcı kararı 2026-10-13): yeni esnaf form doldurmaz, 4 soruyu cevaplar.
// Hizmet ya da çalışan eksikse ilk girişte tam ekran açılır; "Sonra yaparım" ile kapanır (kurulum kartı kalır).
const HAZIR = {
  berber: [['Saç kesim', 30], ['Sakal tıraşı', 20], ['Saç + sakal', 45], ['Çocuk tıraşı', 20], ['Cilt bakımı', 30]],
  kuafor: [['Saç kesim', 45], ['Fön', 30], ['Saç boyama', 90], ['Röfle', 120], ['Keratin', 120]],
  guzellik: [['Manikür', 45], ['Pedikür', 60], ['Kaş tasarım', 20], ['Cilt bakımı', 60], ['Ağda', 30]],
  disci: [['Muayene', 30], ['Diş taşı temizliği', 45], ['Dolgu', 60]],
  veteriner: [['Muayene', 30], ['Aşı', 15], ['Tıraş ve bakım', 60]],
};
// Kayıtta kategori 'genel' gelir: hazır hizmetlerden önce dükkân türü sorulur (2026-10-14: "Randevu / Uzun randevu" anlamsızdı)
const TURLER = [['berber', 'Berber'], ['kuafor', 'Kuaför'], ['guzellik', 'Güzellik salonu'], ['disci', 'Diş kliniği'], ['veteriner', 'Veteriner'], ['diger', 'Diğer']];
const GUNLER = [[1, 'Pzt'], [2, 'Sal'], [3, 'Çar'], [4, 'Per'], [5, 'Cum'], [6, 'Cmt'], [0, 'Paz']];
const SAATLER = Array.from({ length: 33 }, (_, i) => { const dk = 6 * 60 + i * 30; return `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`; });

export default function KurulumSihirbazi({ api, ayarlar, kullanici, setSayfa, ayarlariYenile }) {
  const anahtar = `sihirbaz_${kullanici?.isletme_id || 'x'}`;
  const [goster, setGoster] = useState(false);
  const [adim, setAdim] = useState(0);
  const [mevcutHz, setMevcutHz] = useState([]);
  const [secili, setSecili] = useState({});            // isim → { sure, fiyat }
  const [ozel, setOzel] = useState('');
  const [bas, setBas] = useState('09:00');
  const [bit, setBit] = useState('20:00');
  const [kapali, setKapali] = useState([0]);
  const [calisanlar, setCalisanlar] = useState(['']);
  const [mevcutCal, setMevcutCal] = useState([]);
  const [onay, setOnay] = useState('manuel');
  const [bekle, setBekle] = useState(false);
  const [hata, setHata] = useState(null);
  const [tur, setTur] = useState(null);                 // seçilen dükkân türü (kategori)
  const [calisanSinir, setCalisanSinir] = useState(null);

  useEffect(() => {
    try { if (localStorage.getItem(anahtar)) return; } catch { /* yok say */ }
    api.get('/kurulum').then(d => {
      const eksik = (d?.adimlar || []).filter(a => !a.tamam).map(a => a.anahtar);
      if (eksik.includes('hizmet') || eksik.includes('calisan')) setGoster(true);
    }).catch(() => {});
    api.get('/hizmetler').then(d => setMevcutHz(d?.hizmetler || [])).catch(() => {});
    api.get('/calisanlar').then(d => setMevcutCal(d?.calisanlar || [])).catch(() => {});
    api.get('/paket').then(d => { const n = d?.paket_bilgi?.calisan_limit; if (n && n < 999) setCalisanSinir(n); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (ayarlar?.calisma_baslangic) setBas(String(ayarlar.calisma_baslangic).slice(0, 5));
    if (ayarlar?.calisma_bitis) setBit(String(ayarlar.calisma_bitis).slice(0, 5));
    if (ayarlar?.kapali_gunler !== undefined && ayarlar?.kapali_gunler !== null) setKapali(String(ayarlar.kapali_gunler).split(',').filter(Boolean).map(Number));
    if (kullanici?.isim && calisanlar.length === 1 && !calisanlar[0]) setCalisanlar([kullanici.isim]);
  }, [ayarlar]);

  if (!goster) return null;
  const bitir = () => { try { localStorage.setItem(anahtar, '1'); } catch { /* yok say */ } setGoster(false); ayarlariYenile?.(); };
  const kat = tur || (HAZIR[ayarlar?.kategori] ? ayarlar.kategori : null);
  const hazir = HAZIR[kat] || [];
  const turSec = (k) => { setTur(k); setSecili({}); if (k !== 'diger') api.put('/ayarlar', { kategori: k }).catch(() => {}); };
  const calisanYer = calisanSinir ? Math.max(0, calisanSinir - mevcutCal.length) : null;   // pakette kalan yer
  const sec = (isim, sure) => setSecili(s => { const y = { ...s }; if (y[isim]) delete y[isim]; else y[isim] = { sure, fiyat: '' }; return y; });

  const kaydetVeIlerle = async () => {
    setBekle(true); setHata(null);
    try {
      if (adim === 0) {
        const varOlan = new Set(mevcutHz.map(h => h.isim.toLocaleLowerCase('tr')));
        for (const [isim, v] of Object.entries(secili)) {
          if (varOlan.has(isim.toLocaleLowerCase('tr'))) continue;
          const r = await api.post('/hizmetler', { isim, sure_dk: v.sure, fiyat: Number(v.fiyat) || 0 });
          if (r?.hata) throw new Error(r.hata);
          setMevcutHz(l => [...l, r.hizmet || { isim }]);   // geri gelip Devam'a basınca iki kez eklenmesin
        }
        if (!Object.keys(secili).length && !mevcutHz.length) throw new Error('En az bir hizmet seç');
      }
      if (adim === 1) {
        const r = await api.put('/ayarlar', { calisma_baslangic: bas, calisma_bitis: bit, kapali_gunler: kapali.join(',') });
        if (r?.hata) throw new Error(r.hata);
      }
      if (adim === 2) {
        const varOlan = new Set(mevcutCal.map(c => c.isim.toLocaleLowerCase('tr')));
        const yeni = calisanlar.map(x => x.trim()).filter(Boolean).filter(x => !varOlan.has(x.toLocaleLowerCase('tr')));
        if (!yeni.length && !mevcutCal.length) throw new Error('En az bir kişi yaz (kendin de olabilirsin)');
        if (calisanYer !== null && yeni.length > calisanYer) throw new Error(`Paketinde en fazla ${calisanSinir} kişi olabilir. Fazla satırları sil (✕); sonra paketini yükseltip ekleyebilirsin.`);
        for (const isim of yeni) {
          const r = await api.post('/calisanlar', { isim });
          if (r?.hata) throw new Error(r.hata);
          // Kaydedilen kişi listeye girer; "Devam"a tekrar basılınca bir daha eklenmeye çalışılmaz
          setMevcutCal(l => [...l, r.calisan || r]);
          setCalisanlar(l => l.filter(x => x.trim().toLocaleLowerCase('tr') !== isim.toLocaleLowerCase('tr')));
        }
      }
      if (adim === 3) {
        await api.put('/ayarlar', { randevu_onay_modu: onay });
      }
      setAdim(adim + 1);
    } catch (e) { setHata(e.message); }
    setBekle(false);
  };

  const buton = (aktif) => ({ minHeight: 52, padding: '0 16px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', fontSize: 17, fontWeight: 700,
    border: `2px solid ${aktif ? '#1f6f4a' : 'var(--border)'}`, background: aktif ? 'rgba(31,111,74,.1)' : 'var(--surface)', color: aktif ? '#1f6f4a' : 'var(--text)' });
  const BASLIK = ['Hangi hizmetleri veriyorsun?', 'Kaçta açıp kapanıyorsun?', 'Dükkanda kimler çalışıyor?', 'Asistan randevuyu nasıl versin?', 'Hazırsın!'];

  return (
    <div role="dialog" aria-modal="true" aria-label="Kurulum" style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'var(--bg)', overflowY: 'auto' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '22px 20px 40px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--dim)' }}>{adim < 4 ? `Adım ${adim + 1} / 4` : 'Bitti'}</div>
          {adim < 4 && <button onClick={bitir} style={{ border: 'none', background: 'none', color: 'var(--dim)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44 }}>Sonra yaparım</button>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
          {[0, 1, 2, 3].map(i => <div key={i} style={{ height: 6, borderRadius: 3, background: i <= adim ? '#1f6f4a' : 'var(--border)' }} />)}
        </div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>{BASLIK[adim]}</h1>

        {adim === 0 && (
          <>
            <div style={{ fontSize: 16, color: 'var(--dim)', marginTop: -6 }}>{kat ? 'Dokunarak seç, fiyatını yaz. Sonra değiştirebilirsin.' : 'Önce dükkânının türünü seç, hazır hizmetleri getirelim.'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {TURLER.map(([k, ad]) => <button key={k} onClick={() => turSec(k)} style={{ ...buton((tur || ayarlar?.kategori) === k), minHeight: 44, fontSize: 15 }}>{ad}</button>)}
            </div>
            {mevcutHz.length > 0 && <div style={{ fontSize: 14, color: '#1f6f4a', fontWeight: 600 }}>Zaten ekli: {mevcutHz.map(h => h.isim).join(', ')}</div>}
            {[...hazir, ...Object.keys(secili).filter(k => !hazir.some(([h]) => h === k)).map(k => [k, secili[k].sure])].map(([isim, sure]) => (
              <div key={isim} style={{ ...buton(!!secili[isim]), display: 'flex', alignItems: 'center', gap: 12, padding: '6px 14px' }}>
                <button onClick={() => sec(isim, sure)} style={{ all: 'unset', flex: 1, cursor: 'pointer', fontSize: 18, fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>{secili[isim] ? '✓ ' : ''}{isim}</button>
                {secili[isim] && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 17, fontWeight: 700 }}>
                    <input inputMode="numeric" value={secili[isim].fiyat} onChange={e => setSecili(s => ({ ...s, [isim]: { ...s[isim], fiyat: e.target.value.replace(/\D/g, '') } }))}
                      aria-label={`${isim} fiyatı`} placeholder="fiyat" style={{ width: 80, height: 44, borderRadius: 10, border: '1px solid var(--border)', textAlign: 'center', fontSize: 17, fontWeight: 700, fontFamily: 'inherit' }} />₺
                  </label>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={ozel} onChange={e => setOzel(e.target.value)} placeholder="Başka hizmet (ör. Damat tıraşı)" className="input" style={{ flex: 1, height: 52, fontSize: 16, borderRadius: 12 }} />
              <button onClick={() => { if (ozel.trim()) { sec(ozel.trim(), 30); setOzel(''); } }} style={buton(false)}>Ekle</button>
            </div>
          </>
        )}

        {adim === 1 && (
          <>
            <div style={{ display: 'flex', gap: 12 }}>
              {[['Açılış', bas, setBas], ['Kapanış', bit, setBit]].map(([ad, v, f]) => (
                <label key={ad} style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--dim)' }}>{ad}
                  <select value={v} onChange={e => f(e.target.value)} className="input" style={{ width: '100%', height: 56, fontSize: 20, fontWeight: 800, marginTop: 6, borderRadius: 12 }}>
                    {SAATLER.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--dim)' }}>Kapalı olduğun günler</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {GUNLER.map(([n, ad]) => <button key={n} onClick={() => setKapali(k => k.includes(n) ? k.filter(x => x !== n) : [...k, n])} style={{ ...buton(kapali.includes(n)), padding: 0, fontSize: 15 }}>{ad}</button>)}
            </div>
          </>
        )}

        {adim === 2 && (
          <>
            <div style={{ fontSize: 16, color: 'var(--dim)', marginTop: -6 }}>Müşteri randevu alırken kimi seçeceğini görür. Tek başınaysan sadece kendi adın yeter.</div>
            {mevcutCal.length > 0 && <div style={{ fontSize: 14, color: '#1f6f4a', fontWeight: 600 }}>Zaten ekli: {mevcutCal.map(c => c.isim).join(', ')}</div>}
            {calisanSinir && <div style={{ fontSize: 14, color: 'var(--dim)' }}>Paketinde en fazla <b>{calisanSinir} kişi</b> olabilir{calisanYer !== null ? ` · ${calisanYer} yer kaldı` : ''}.</div>}
            {calisanlar.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8 }}>
                <input value={c} onChange={e => setCalisanlar(l => l.map((x, j) => (j === i ? e.target.value : x)))} placeholder={i === 0 && !mevcutCal.length ? 'Adın' : 'Çalışanın adı'} className="input" style={{ flex: 1, height: 56, fontSize: 18, borderRadius: 12 }} />
                {(calisanlar.length > 1 || mevcutCal.length > 0) && (
                  <button onClick={() => { setCalisanlar(l => l.filter((_, j) => j !== i)); setHata(null); }} aria-label="Bu satırı sil" style={{ ...buton(false), width: 56, padding: 0, fontSize: 18 }}>✕</button>
                )}
              </div>
            ))}
            {(calisanYer === null || calisanlar.filter(x => x.trim()).length < calisanYer) && (
              <button onClick={() => setCalisanlar(l => [...l, ''])} style={buton(false)}>＋ Bir kişi daha</button>
            )}
          </>
        )}

        {adim === 3 && (
          <>
            <div style={{ fontSize: 16, color: 'var(--dim)', marginTop: -6 }}>Müşteri WhatsApp'tan yazınca asistan saati bulur. Aynı saate asla iki randevu vermez.</div>
            <button onClick={() => setOnay('manuel')} style={{ ...buton(onay === 'manuel'), textAlign: 'left', padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{onay === 'manuel' ? '✓ ' : ''}Önce bana sorsun (önerilen)</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dim)', marginTop: 4 }}>Randevu senin onayınla kesinleşir. Alışınca otomatiğe geçersin.</div>
            </button>
            <button onClick={() => setOnay('otomatik')} style={{ ...buton(onay === 'otomatik'), textAlign: 'left', padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{onay === 'otomatik' ? '✓ ' : ''}Kendisi versin</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--dim)', marginTop: 4 }}>Boş saate randevuyu hemen verir, sana bildirim gelir.</div>
            </button>
          </>
        )}

        {adim === 4 && (
          <>
            <div style={{ fontSize: 17, lineHeight: 1.5 }}>Hazırsın, randevu sayfan açık. İstersen <b>WhatsApp'ını da bağla</b>, müşterilerin sana yazınca asistan cevap versin. QR okutabilir ya da numaranla bağlayabilirsin, 1 dakika sürer. Sonra da bağlayabilirsin.</div>
            <button onClick={() => { bitir(); setSayfa('botbaglanti'); }} style={{ height: 60, border: 'none', borderRadius: 16, background: '#25d366', color: '#0b3d20', fontSize: 19, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>WhatsApp'ı bağla</button>
            <button onClick={bitir} style={{ ...buton(false) }}>Şimdilik panele geç</button>
          </>
        )}

        {hata && <div style={{ color: '#b42318', fontSize: 15, fontWeight: 600 }}>{hata}</div>}
        <div style={{ flex: 1 }} />
        {adim < 4 && (
          <div style={{ display: 'flex', gap: 10 }}>
            {adim > 0 && <button onClick={() => setAdim(adim - 1)} style={{ ...buton(false), width: 100 }}>Geri</button>}
            <button onClick={kaydetVeIlerle} disabled={bekle} style={{ flex: 1, height: 60, border: 'none', borderRadius: 16, background: '#1f6f4a', color: '#fff', fontSize: 19, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>{bekle ? 'Kaydediliyor…' : 'Devam'}</button>
          </div>
        )}
      </div>
    </div>
  );
}
