import { useState, useEffect, useRef } from 'react';
import KapidanGelen from '../Mobil/KapidanGelen';
import { API_URL } from '../../lib/config';
import { useCanliYenile } from '../../lib/socket';

// Tablet modu (kullanıcı kararı 2026-10-13): dükkana hediye edilen tablet tezgâhta durur.
// Dükkan ekranı: saat, sıradaki müşteri (Geldi/Gelmedi), kapıdan gelen, çalışan sütunları, yeni randevu sesi.
// Müşteri modu: "Randevum var" / "Sıra al" / QR; esnaf ekranına dönüş sağ üst köşeye 3 sn basılı + PIN.
const bugun = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const s5 = (s) => String(s || '').slice(0, 5);
const dk = (s) => { const [h, m] = s5(s).split(':').map(Number); return h * 60 + m; };
const simdiDk = () => { const t = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' })); return t.getHours() * 60 + t.getMinutes(); };
const tl = (x) => `${Number(x || 0).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}₺`;
const kisaAd = (ad) => { const p = String(ad || 'Müşteri').trim().split(/\s+/); return p.length > 1 ? `${p[0]} ${p[p.length - 1][0]}.` : p[0]; };
const AKTIF = (r) => !['iptal', 'gelmedi'].includes(r.durum);

function bip() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.18].forEach((t) => { const o = c.createOscillator(); const g = c.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(c.destination); o.start(c.currentTime + t); o.stop(c.currentTime + t + 0.12); });
  } catch { /* ses yoksa geç */ }
}

export default function TabletEkrani({ api, ayarlar, eposta, kapat }) {
  const [mod, setMod] = useState(() => { try { return localStorage.getItem('tablet_mod') || 'dukkan'; } catch { return 'dukkan'; } });
  const [liste, setListe] = useState([]);
  const [calisanlar, setCalisanlar] = useState([]);
  const [saat, setSaat] = useState(new Date());
  const [ekle, setEkle] = useState(null);           // { calisanId } | {}
  const [yeniUyari, setYeniUyari] = useState(null);
  const [cevrimdisi, setCevrimdisi] = useState(false);
  const bilinen = useRef(null);

  const yukle = () => {
    api.get(`/randevular?tarih=${bugun()}`).then(d => {
      if (d?.hata) return;
      setCevrimdisi(false);
      const l = (d?.randevular || []).sort((a, b) => String(a.saat).localeCompare(String(b.saat)));
      if (bilinen.current) {
        const yeni = l.filter(r => !bilinen.current.has(r.id));
        if (yeni.length) { bip(); setYeniUyari(yeni[yeni.length - 1]); setTimeout(() => setYeniUyari(null), 15000); }
      }
      bilinen.current = new Set(l.map(r => r.id));
      setListe(l);
    }).catch(() => setCevrimdisi(true));
  };
  useCanliYenile(yukle, ['randevu:yeni', 'randevu:guncellendi', 'veri:degisti']);
  useEffect(() => {
    yukle();
    api.get('/calisanlar').then(d => setCalisanlar((d?.calisanlar || []).filter(c => c.aktif !== false))).catch(() => {});
    // Aralıklı yenileme yalnız yedek; asıl tazeleme canlı (useCanliYenile)
    const t1 = setInterval(yukle, 90000), t2 = setInterval(() => setSaat(new Date()), 15000);
    // Ekran kapanmasın (destekleyen tarayıcılarda)
    let kilit = null;
    const uyanik = async () => { try { kilit = await navigator.wakeLock?.request('screen'); } catch { /* yok */ } };
    uyanik();
    const gorunur = () => { if (document.visibilityState === 'visible') { uyanik(); yukle(); } };
    document.addEventListener('visibilitychange', gorunur);
    return () => { clearInterval(t1); clearInterval(t2); document.removeEventListener('visibilitychange', gorunur); try { kilit?.release(); } catch { /* yok */ } };
  }, []);
  useEffect(() => { try { localStorage.setItem('tablet_mod', mod); } catch { /* yok */ } }, [mod]);

  const durumYap = async (r, durum) => {
    const d = await api.put(`/randevular/${r.id}/durum`, { durum });
    if (!d?.hata) setListe(l => l.map(x => (x.id === r.id ? { ...x, durum } : x)));
  };
  const tamEkran = () => { try { document.documentElement.requestFullscreen?.(); } catch { /* yok */ } };

  const sDk = simdiDk();
  const aktifler = liste.filter(AKTIF);
  const siradaki = aktifler.find(r => r.durum !== 'tamamlandi' && dk(r.saat) >= sDk - 15);
  const icerde = aktifler.filter(r => r.durum !== 'tamamlandi' && dk(r.saat) <= sDk && dk(r.saat) > sDk - 60);
  const kasa = liste.filter(r => r.durum === 'tamamlandi').reduce((t, r) => t + (Number(r.toplam_fiyat) || Number(r.fiyat) || 0), 0);

  const kok = { position: 'fixed', inset: 0, zIndex: 3000, fontFamily: 'inherit', overflow: 'hidden', display: 'flex', flexDirection: 'column' };

  if (mod === 'musteri') return <MusteriModu api={api} ayarlar={ayarlar} liste={aktifler} sDk={sDk} cik={() => setMod('dukkan')} yenile={yukle} kok={kok} eposta={eposta} />;

  const sutunlar = calisanlar.length ? calisanlar.slice(0, 4) : [{ id: null, isim: ayarlar?.isim || 'Randevular' }];
  return (
    <div style={{ ...kok, background: 'var(--bg)', padding: 20, gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>{saat.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' })}</div>
        <div style={{ fontSize: 18, color: 'var(--dim)', fontWeight: 600 }}>{saat.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Istanbul' })} · {ayarlar?.isim}</div>
        <div style={{ flex: 1 }} />
        {cevrimdisi && <div style={{ padding: '10px 14px', borderRadius: 999, background: 'rgba(180,35,24,.1)', color: '#b42318', fontWeight: 800 }}>İnternet yok — son bilgiler gösteriliyor</div>}
        <button onClick={tamEkran} style={btn('var(--surface)', 'var(--text)')}>Tam ekran</button>
        <button onClick={() => setMod('musteri')} style={btn('var(--surface)', 'var(--text)')}>Müşteri moduna çevir</button>
        <button onClick={kapat} style={btn('var(--surface)', 'var(--dim)')}>Panele dön</button>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 14, minHeight: 0 }}>
        <div style={{ width: 360, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {siradaki ? (
            <div style={{ padding: 22, borderRadius: 22, background: '#1f6f4a', color: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700, opacity: .9 }}>SIRADAKİ{dk(siradaki.saat) > sDk ? ` · ${dk(siradaki.saat) - sDk} dk sonra` : ' · şimdi'}</div>
              <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{s5(siradaki.saat)}</div>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{siradaki.musteri_isim || 'Müşteri'}</div>
              <div style={{ fontSize: 18, opacity: .95 }}>{siradaki.hizmetler_adlari || siradaki.hizmet_isim}{siradaki.calisan_isim ? ` · ${siradaki.calisan_isim}` : ''}</div>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button onClick={() => durumYap(siradaki, 'tamamlandi')} style={{ ...btn('#fff', '#1f6f4a'), flex: 1, height: 60, fontSize: 19 }}>Geldi</button>
                <button onClick={() => durumYap(siradaki, 'gelmedi')} style={{ ...btn('transparent', '#fff'), flex: 1, height: 60, fontSize: 19, border: '2px solid rgba(255,255,255,.6)' }}>Gelmedi</button>
              </div>
            </div>
          ) : <div style={{ padding: 22, borderRadius: 22, background: 'var(--surface)', fontSize: 20, fontWeight: 700, color: 'var(--dim)' }}>Sırada kimse yok</div>}
          <button onClick={() => setEkle({})} style={{ height: 76, border: 'none', borderRadius: 20, background: '#1c1b18', color: '#fff', fontSize: 21, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer' }}>＋ Kapıdan gelen müşteri</button>
          <div style={{ padding: 18, borderRadius: 20, background: 'var(--surface)', display: 'grid', gap: 8, fontSize: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Randevu</span><b>{aktifler.length}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Gelen</span><b>{liste.filter(r => r.durum === 'tamamlandi').length}</b></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>Kasa</span><b>{tl(kasa)}</b></div>
          </div>
          {yeniUyari && <div style={{ padding: '16px 18px', borderRadius: 20, background: '#fbecd2', color: '#6b4410', fontSize: 18, fontWeight: 800 }}>Yeni randevu: {kisaAd(yeniUyari.musteri_isim)} · {s5(yeniUyari.saat)}</div>}
          {icerde.length > 0 && <div style={{ fontSize: 16, color: 'var(--dim)', fontWeight: 600 }}>Şu an içeride: {icerde.map(r => kisaAd(r.musteri_isim)).join(', ')}</div>}
        </div>

        <div style={{ flex: 1, minWidth: 0, borderRadius: 22, background: 'var(--surface)', padding: 14, display: 'grid', gridTemplateColumns: `repeat(${sutunlar.length}, minmax(0, 1fr))`, gap: 12, overflow: 'hidden' }}>
          {sutunlar.map(c => {
            const ra = aktifler.filter(r => !c.id || r.calisan_id === c.id || (!r.calisan_id && c === sutunlar[0]));
            return (
              <div key={c.id ?? 'x'} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0, overflowY: 'auto' }}>
                <div style={{ fontSize: 19, fontWeight: 800, padding: '4px 4px 6px' }}>{c.isim}</div>
                {ra.map(r => {
                  const gecti = r.durum === 'tamamlandi';
                  const simdi = !gecti && dk(r.saat) <= sDk && dk(r.saat) > sDk - 45;
                  const bekliyor = r.durum === 'onay_bekliyor';
                  return (
                    <button key={r.id} onClick={() => bekliyor ? durumYap(r, 'onaylandi') : null}
                      style={{ all: 'unset', borderRadius: 14, padding: '12px 14px', cursor: bekliyor ? 'pointer' : 'default',
                        background: gecti ? 'var(--bg)' : simdi ? '#dcefe3' : bekliyor ? '#fff8ec' : '#eef4ff',
                        border: bekliyor ? '2px solid #e8a33d' : '2px solid transparent', color: gecti ? 'var(--dim)' : 'var(--text)' }}>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>{s5(r.saat)} · {kisaAd(r.musteri_isim)}</div>
                      <div style={{ fontSize: 15 }}>{r.hizmetler_adlari || r.hizmet_isim}{gecti ? ' · geldi' : simdi ? ' · şimdi' : bekliyor ? ' · dokun, onayla' : ''}</div>
                    </button>
                  );
                })}
                <button onClick={() => setEkle({ calisanId: c.id })} style={{ all: 'unset', borderRadius: 14, padding: '12px 14px', border: '2px dashed var(--border)', color: 'var(--dim)', fontSize: 16, fontWeight: 700, cursor: 'pointer', textAlign: 'center' }}>＋ Ekle</button>
              </div>
            );
          })}
        </div>
      </div>
      {ekle && <KapidanGelen api={api} calisanId={ekle.calisanId} buyuk kapat={() => setEkle(null)} eklendi={yukle} />}
    </div>
  );
}

const btn = (bg, renk) => ({ height: 52, padding: '0 18px', borderRadius: 14, border: '1px solid var(--border)', background: bg, color: renk, fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' });

function MusteriModu({ api, ayarlar, liste, sDk, cik, yenile, kok, eposta }) {
  const [ekran, setEkran] = useState('ana');        // ana | randevum | sira | tamam
  const [tel, setTel] = useState('');
  const [sonuc, setSonuc] = useState(null);
  const [qr, setQr] = useState(null);
  const [hizmetler, setHizmetler] = useState([]);
  const [hz, setHz] = useState(null);
  const [isim, setIsim] = useState('');
  const [ilkBos, setIlkBos] = useState(null);
  const [pinIste, setPinIste] = useState(false);
  const [pin, setPin] = useState('');
  const [unuttum, setUnuttum] = useState(false);   // PIN unutulursa panel şifresiyle çıkış
  const [sifre, setSifre] = useState('');
  const [pinHata, setPinHata] = useState(null);
  const basili = useRef(null);
  const geriSay = useRef(null);

  useEffect(() => {
    api.get('/qr-kod?type=booking').then(d => setQr(d?.qr || null)).catch(() => {});
    api.get('/hizmetler').then(d => { const l = (d?.hizmetler || []).filter(h => h.aktif !== false); setHizmetler(l); if (l[0]) setHz(l[0].id); }).catch(() => {});
  }, []);
  useEffect(() => {   // seçili hizmet için bugünün ilk boş saati (müşterinin gördüğü sayfanın aynısı)
    if (!hz || !ayarlar?.slug) return;
    fetch(`${API_URL}/book/${ayarlar.slug}/saatler?tarih=${bugun()}&hizmetIds=${hz}`).then(r => r.json()).then(d => setIlkBos((d?.saatler || [])[0] || null)).catch(() => setIlkBos(null));
  }, [hz, ekran]);
  // Hareketsiz kalırsa ana ekrana dön
  useEffect(() => { clearTimeout(geriSay.current); if (ekran !== 'ana') geriSay.current = setTimeout(() => { setEkran('ana'); setTel(''); setIsim(''); setSonuc(null); }, 45000); return () => clearTimeout(geriSay.current); }, [ekran, tel, isim]);

  const kayitliPin = () => { try { return localStorage.getItem('tablet_pin') || ''; } catch { return ''; } };
  const [koseDurum, setKoseDurum] = useState(null);   // null | 'basili' | 'ipucu'
  const koseBas = () => { setKoseDurum('basili'); basili.current = setTimeout(() => { setKoseDurum(null); setPinIste(true); }, 3000); };
  // Erken bırakılırsa nasıl çıkılacağı söylenir (2026-10-14: köşe gizliydi, esnaf çıkamadı)
  const koseBirak = () => { clearTimeout(basili.current); setKoseDurum(d => (d === 'basili' ? 'ipucu' : d)); setTimeout(() => setKoseDurum(d => (d === 'ipucu' ? null : d)), 2500); };
  const pinDene = () => {
    const k = kayitliPin();
    if (!k) { if (/^\d{4}$/.test(pin)) { try { localStorage.setItem('tablet_pin', pin); } catch { /* yok */ } cik(); } return; }
    if (pin === k) cik(); else { setPin(''); setPinHata('PIN yanlış'); }
  };
  const sifreyleCik = async () => {
    // Panelin api istemcisi 401'de oturumu kapatıp sayfayı yeniler; şifre denemesi doğrudan gider
    const d = await fetch(`${API_URL}/auth/giris`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: eposta, sifre }) })
      .then(r => r.json()).catch(() => null);
    if (!d?.token) { setSifre(''); return setPinHata('Şifre yanlış'); }
    try { localStorage.removeItem('tablet_pin'); } catch { /* yok */ }   // yeni PIN bir dahaki sefere belirlenir
    cik();
  };
  const pinKapat = () => { setPinIste(false); setPin(''); setSifre(''); setUnuttum(false); setPinHata(null); };

  const randevuBul = () => {
    const son = tel.replace(/\D/g, '').slice(-10);
    const r = liste.find(x => String(x.musteri_telefon || '').replace(/\D/g, '').endsWith(son) && x.durum !== 'tamamlandi');
    setSonuc(r ? { tip: 'var', r } : { tip: 'yok' });
  };
  const siraAl = async () => {
    const d = await api.post('/randevular/elle', { hizmet_id: hz, musteri_isim: isim, musteri_telefon: tel, saat: ilkBos || undefined });
    if (d?.hata) return setSonuc({ tip: 'hata', mesaj: d.hata });
    setSonuc({ tip: 'alindi', saat: ilkBos }); setEkran('tamam'); yenile();
  };

  const siradakiler = liste.filter(r => r.durum !== 'tamamlandi' && dk(r.saat) >= sDk - 15).slice(0, 3);
  const koyu = { ...kok, background: '#14231b', color: '#f4f1ea', padding: 36, gap: 22 };
  const giris = { height: 64, borderRadius: 16, border: 'none', fontSize: 26, fontWeight: 700, padding: '0 18px', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };
  const ana = (bg, renk) => ({ border: 'none', borderRadius: 24, background: bg, color: renk, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 26 });

  return (
    <div style={koyu}>
      <button aria-label="Esnaf ekranına dön (3 saniye basılı tut)" onPointerDown={koseBas} onPointerUp={koseBirak} onPointerLeave={() => koseDurum === 'basili' && koseBirak()}
        onContextMenu={e => e.preventDefault()}
        style={{ position: 'absolute', left: 20, bottom: 20, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 999,
          border: '1px solid rgba(244,241,234,.25)', background: koseDurum === 'basili' ? 'rgba(244,241,234,.22)' : 'rgba(244,241,234,.08)',
          color: 'rgba(244,241,234,.85)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer', userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}>
        <span aria-hidden="true">🔒</span>
        {koseDurum === 'basili' ? 'Bırakma… (3 sn)' : koseDurum === 'ipucu' ? 'Çıkmak için 3 saniye basılı tut' : 'Esnaf çıkışı'}
      </button>
      <div style={{ display: 'flex', gap: 36, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#a9c9b5' }}>{ayarlar?.isim}</div>
          {ekran === 'ana' && (
            <>
              <h1 style={{ margin: 0, fontSize: 56, fontWeight: 800, lineHeight: 1.05 }}>Hoş geldiniz.<br />Ne yapmak istersiniz?</h1>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18 }}>
                <button onClick={() => setEkran('randevum')} style={{ ...ana('#2fb36a', '#0b2416'), height: 170 }}><div style={{ fontSize: 32, fontWeight: 800 }}>Randevum var</div><div style={{ fontSize: 19, marginTop: 40 }}>Numaranla sıranı gör</div></button>
                <button onClick={() => setEkran('sira')} style={{ ...ana('#f4f1ea', '#14231b'), height: 170 }}><div style={{ fontSize: 32, fontWeight: 800 }}>Sıra al</div><div style={{ fontSize: 19, marginTop: 40 }}>{ilkBos ? `İlk boş saat: ${ilkBos}` : 'Bugünün boş saatleri'}</div></button>
              </div>
              {siradakiler.length > 0 && <div style={{ padding: '20px 24px', borderRadius: 20, background: '#1f3a2b', fontSize: 20, fontWeight: 700 }}>Sırada: {siradakiler.map(r => `${kisaAd(r.musteri_isim)} (${s5(r.saat)})`).join(', ')}</div>}
            </>
          )}
          {ekran === 'randevum' && (
            <>
              <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800 }}>Telefon numaranız</h1>
              <input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" placeholder="05xx xxx xx xx" style={giris} autoFocus />
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => { setEkran('ana'); setSonuc(null); setTel(''); }} style={{ ...ana('#1f3a2b', '#f4f1ea'), padding: '0 26px', height: 64, fontSize: 20, fontWeight: 700 }}>Geri</button>
                <button onClick={randevuBul} disabled={tel.replace(/\D/g, '').length < 10} style={{ ...ana('#2fb36a', '#0b2416'), flex: 1, height: 64, fontSize: 22, fontWeight: 800, textAlign: 'center', padding: 0 }}>Bul</button>
              </div>
              {sonuc?.tip === 'var' && <div style={{ fontSize: 30, fontWeight: 800 }}>Hoş geldiniz {kisaAd(sonuc.r.musteri_isim)}! Randevunuz {s5(sonuc.r.saat)}. Birazdan sizi alacağız.</div>}
              {sonuc?.tip === 'yok' && <div style={{ fontSize: 24, fontWeight: 700, color: '#f2c38b' }}>Bugün bu numaraya randevu görünmüyor. "Sıra al" ile hemen sıra alabilirsiniz.</div>}
            </>
          )}
          {ekran === 'sira' && (
            <>
              <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800 }}>{ilkBos ? `İlk boş saat: ${ilkBos}` : 'Bugün boş saat kalmadı'}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {hizmetler.map(h => <button key={h.id} onClick={() => setHz(h.id)} style={{ ...ana(hz === h.id ? '#2fb36a' : '#1f3a2b', hz === h.id ? '#0b2416' : '#f4f1ea'), padding: '16px 22px', fontSize: 20, fontWeight: 800 }}>{h.isim}</button>)}
              </div>
              <input value={isim} onChange={e => setIsim(e.target.value)} placeholder="Adınız" style={giris} />
              <input value={tel} onChange={e => setTel(e.target.value)} inputMode="tel" placeholder="Telefon (hatırlatma için, isteğe bağlı)" style={giris} />
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setEkran('ana')} style={{ ...ana('#1f3a2b', '#f4f1ea'), padding: '0 26px', height: 64, fontSize: 20, fontWeight: 700 }}>Geri</button>
                <button onClick={siraAl} disabled={!ilkBos || !isim.trim()} style={{ ...ana('#2fb36a', '#0b2416'), flex: 1, height: 64, fontSize: 22, fontWeight: 800, textAlign: 'center', padding: 0, opacity: !ilkBos || !isim.trim() ? .5 : 1 }}>Sıramı al</button>
              </div>
              {sonuc?.tip === 'hata' && <div style={{ fontSize: 20, color: '#f2c38b', fontWeight: 700 }}>{sonuc.mesaj}</div>}
            </>
          )}
          {ekran === 'tamam' && (
            <>
              <h1 style={{ margin: 0, fontSize: 56, fontWeight: 800 }}>Sıranız alındı{sonuc?.saat ? `: ${sonuc.saat}` : ''}.</h1>
              <div style={{ fontSize: 24 }}>Teşekkürler {isim}! Sizi çağıracağız.</div>
              <button onClick={() => { setEkran('ana'); setIsim(''); setTel(''); setSonuc(null); }} style={{ ...ana('#f4f1ea', '#14231b'), height: 72, fontSize: 22, fontWeight: 800, textAlign: 'center', padding: 0, width: 260 }}>Tamam</button>
            </>
          )}
        </div>
        <div style={{ width: 320, borderRadius: 26, background: '#f4f1ea', color: '#14231b', padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: 23, fontWeight: 800, textAlign: 'center' }}>Bir dahaki sefere sıra beklemeyin</div>
          {qr ? <img src={qr} alt="Randevu sayfası QR kodu" style={{ width: 230, height: 230, borderRadius: 14 }} /> : <div style={{ width: 230, height: 230 }} />}
          <div style={{ fontSize: 17, textAlign: 'center', color: '#3b4a41' }}>Telefonunla okut, randevunu kendin al.</div>
        </div>
      </div>
      {pinIste && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center' }}>
          <div style={{ background: '#f4f1ea', color: '#14231b', borderRadius: 24, padding: 28, width: 360, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{unuttum ? 'Panel şifrenle çık' : kayitliPin() ? 'Esnaf PIN' : 'Yeni 4 haneli PIN belirleyin'}</div>
            {unuttum && <input value={sifre} onChange={e => setSifre(e.target.value)} type="password" autoFocus placeholder="Panele girdiğin şifre" style={{ height: 56, fontSize: 20, borderRadius: 14, border: '1px solid #cfc8ba', padding: '0 14px', fontFamily: 'inherit' }} />}
            {pinHata && <div style={{ color: '#b42318', fontWeight: 700 }}>{pinHata}</div>}
            {!unuttum && <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" type="password" autoFocus style={{ height: 64, fontSize: 32, textAlign: 'center', letterSpacing: 12, borderRadius: 14, border: '1px solid #cfc8ba' }} />}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={pinKapat} style={{ flex: 1, height: 56, borderRadius: 14, border: '1px solid #cfc8ba', background: '#fff', fontSize: 18, fontWeight: 700 }}>Vazgeç</button>
              <button onClick={unuttum ? sifreyleCik : pinDene} style={{ flex: 1, height: 56, borderRadius: 14, border: 'none', background: '#1f6f4a', color: '#fff', fontSize: 18, fontWeight: 800 }}>Tamam</button>
            </div>
            {kayitliPin() && eposta && !unuttum && (
              <button onClick={() => { setUnuttum(true); setPinHata(null); }} style={{ border: 'none', background: 'none', color: '#3b4a41', textDecoration: 'underline', fontSize: 15, fontFamily: 'inherit', cursor: 'pointer' }}>PIN'i unuttum</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
