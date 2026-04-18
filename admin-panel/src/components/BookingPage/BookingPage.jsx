import { useState, useEffect, Fragment } from 'react';
import { API_URL } from '../../lib/config';
import { DILLER, TRANSLATIONS, detectLang, saveLang } from './translations';
import './BookingPage.css';

/* ═══════════════════════════════════════════════════════════════
   INLINE LUCIDE-STYLE ICONS
   Tek dosya, dependency yok, tutarlı stroke-width: 2
   ═══════════════════════════════════════════════════════════════ */
const I = {
  MapPin: (p) => <svg {...p} width={p?.size || 14} height={p?.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>,
  Clock: (p) => <svg {...p} width={p?.size || 14} height={p?.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  Scissors: (p) => <svg {...p} width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></svg>,
  Sparkles: (p) => <svg {...p} width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/></svg>,
  Wind: (p) => <svg {...p} width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2"/><path d="M9.6 4.6A2 2 0 1 1 11 8H2"/><path d="M12.6 19.4A2 2 0 1 0 14 16H2"/></svg>,
  Droplets: (p) => <svg {...p} width={p?.size || 22} height={p?.size || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>,
  User: (p) => <svg {...p} width={p?.size || 20} height={p?.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Check: (p) => <svg {...p} width={p?.size || 16} height={p?.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  CheckBig: (p) => <svg {...p} width={p?.size || 40} height={p?.size || 40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  ChevronLeft: (p) => <svg {...p} width={p?.size || 14} height={p?.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>,
  Timer: (p) => <svg {...p} width={p?.size || 12} height={p?.size || 12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>,
  CalendarX: (p) => <svg {...p} width={p?.size || 28} height={p?.size || 28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m14 14-4 4"/><path d="m10 14 4 4"/></svg>,
  AlertCircle: (p) => <svg {...p} width={p?.size || 14} height={p?.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>,
  Phone: (p) => <svg {...p} width={p?.size || 20} height={p?.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>,
  Globe: (p) => <svg {...p} width={p?.size || 16} height={p?.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  ChevronDown: (p) => <svg {...p} width={p?.size || 14} height={p?.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>,
  Whatsapp: (p) => <svg {...p} width={p?.size || 18} height={p?.size || 18} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.82 9.82 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.82 11.82 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.88 11.88 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.82 11.82 0 0 0 20.465 3.488"/></svg>,
};

const kategoriIcon = {
  berber: '💈', kuafor: '✂️', guzellik: '💅', spa: '🧖', disci: '🦷', veteriner: '🐾',
  diyetisyen: '🥗', psikolog: '🧠', fizyoterapi: '🏥', restoran: '🍽️', cafe: '☕',
  spor: '🏋️', egitim: '📚', foto: '📸', dovme: '🎨', oto: '🚗', hukuk: '⚖️', genel: '🏢'
};

// Hizmet adına göre akıllı ikon eşleştirmesi
function hizmetIconu(isim) {
  const n = (isim || '').toLocaleLowerCase('tr');
  if (n.includes('kesim') || n.includes('sakal') || n.includes('traş') || n.includes('tiraş') || n.includes('model')) return <I.Scissors />;
  if (n.includes('fön') || n.includes('fon ') || n.includes('kurut')) return <I.Wind />;
  if (n.includes('yıkama') || n.includes('şampuan') || n.includes('şamp')) return <I.Droplets />;
  if (n.includes('boya') || n.includes('bakım') || n.includes('keratin') || n.includes('makyaj') || n.includes('manikür') || n.includes('pedikür') || n.includes('mask')) return <I.Sparkles />;
  return <I.Sparkles />;
}

// Açık/kapalı durumu (t = i18n translator)
function isletmeAcikMi(isletme, t) {
  if (!isletme) return { acik: false, metin: '...' };
  const simdi = new Date();
  const gun = simdi.getDay();
  const kapaliGunler = String(isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number);
  if (kapaliGunler.includes(gun)) return { acik: false, metin: t('closedToday') };

  const [bh, bm] = String(isletme.calisma_baslangic || '09:00').split(':').map(Number);
  const [eh, em] = String(isletme.calisma_bitis || '19:00').split(':').map(Number);
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  const baslangic = bh * 60 + bm;
  const bitis = eh * 60 + em;

  if (simdiDk >= baslangic && simdiDk < bitis) return { acik: true, metin: t('open') };
  return { acik: false, metin: t('closed') };
}

export default function BookingPage({ slug }) {
  const [adim, setAdim] = useState(0);
  const [isletme, setIsletme] = useState(null);
  const [hizmetler, setHizmetler] = useState([]);
  const [calisanlar, setCalisanlar] = useState([]);
  const [saatler, setSaatler] = useState([]);
  const [otomatikCalisan, setOtomatikCalisan] = useState(false);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  const [secilenHizmet, setSecilenHizmet] = useState(null);
  const [secilenCalisan, setSecilenCalisan] = useState(null);
  const [secilenTarih, setSecilenTarih] = useState('');
  const [secilenSaat, setSecilenSaat] = useState('');
  const [musteriIsim, setMusteriIsim] = useState('');
  const [musteriTelefon, setMusteriTelefon] = useState('');
  const [sonuc, setSonuc] = useState(null);

  // ─── WhatsApp OTP doğrulama ───
  // otpStage: 'giris' (ad+telefon formu) | 'kod' (OTP input) | 'bypass' (WA bağlı değil, atla)
  const [otpStage, setOtpStage] = useState('giris');
  const [otpKod, setOtpKod] = useState('');
  const [otpGonderiliyor, setOtpGonderiliyor] = useState(false);
  const [otpDogrulaniyor, setOtpDogrulaniyor] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0); // saniye

  // ─── i18n ───
  const [dil, setDil] = useState(() => detectLang());
  const [dilAcik, setDilAcik] = useState(false);
  const t = (key) => TRANSLATIONS[dil]?.[key] ?? TRANSLATIONS.tr[key] ?? key;
  const aktifDil = DILLER.find(d => d.kod === dil) || DILLER[0];
  const rtl = !!aktifDil.rtl;
  const locale = TRANSLATIONS[dil]?.locale || 'tr-TR';

  const dilSec = (kod) => {
    setDil(kod);
    saveLang(kod);
    setDilAcik(false);
  };

  // ─── API ───
  useEffect(() => {
    fetch(`${API_URL}/book/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.hata) { setHata(t('notFoundTitle')); return; }
        setIsletme(d.isletme);
        setAdim(1);
      })
      .catch(() => setHata(t('connError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!isletme) return;
    fetch(`${API_URL}/book/${slug}/hizmetler`).then(r => r.json()).then(d => setHizmetler(d.hizmetler || []));
  }, [isletme]);

  useEffect(() => {
    if (!secilenHizmet) return;
    fetch(`${API_URL}/book/${slug}/calisanlar?hizmetId=${secilenHizmet.id}`)
      .then(r => r.json())
      .then(d => {
        setCalisanlar(d.calisanlar || []);
        const otomatik = !!d.otomatik || (d.calisanlar || []).length === 0;
        setOtomatikCalisan(otomatik);
        // Otomatik mod veya çalışan yok → çalışan adımını atla
        if (otomatik) {
          setAdim(curAdim => curAdim === 2 ? 3 : curAdim);
        }
      });
  }, [secilenHizmet]);

  useEffect(() => {
    if (!secilenTarih || !secilenHizmet) return;
    const params = new URLSearchParams({ tarih: secilenTarih, hizmetId: secilenHizmet.id });
    if (secilenCalisan) params.set('calisanId', secilenCalisan.id);
    fetch(`${API_URL}/book/${slug}/saatler?${params}`).then(r => r.json()).then(d => setSaatler(d.saatler || []));
  }, [secilenTarih, secilenCalisan, secilenHizmet]);

  // ─── Handlers ───
  const hizmetSec = (h) => { setSecilenHizmet(h); setSecilenCalisan(null); setSecilenTarih(''); setSecilenSaat(''); setAdim(2); };
  const calisanSec = (c) => { setSecilenCalisan(c); setSecilenTarih(''); setSecilenSaat(''); setAdim(3); };
  const tarihSec = (t) => { setSecilenTarih(t); setSecilenSaat(''); setAdim(4); };
  const saatSec = (s) => { setSecilenSaat(s); setAdim(5); };

  const randevuOlustur = async () => {
    if (!musteriTelefon.trim() || musteriTelefon.trim().length < 10) {
      setHata(t('invalidPhone'));
      return;
    }
    setYukleniyor(true); setHata('');
    try {
      const res = await fetch(`${API_URL}/book/${slug}/randevu`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hizmetId: secilenHizmet.id,
          calisanId: secilenCalisan?.id,
          tarih: secilenTarih,
          saat: secilenSaat,
          musteriIsim: musteriIsim.trim(),
          musteriTelefon: musteriTelefon.trim()
        })
      });
      const d = await res.json();
      if (d.basarili) { setSonuc(d); setAdim(7); }
      else setHata(d.hata || t('genericError'));
    } catch { setHata(t('connError')); }
    setYukleniyor(false);
  };

  // ─── Tarih listesi (locale-aware) ───
  const tarihler = [];
  const kapaliGunler = (isletme?.kapali_gunler || '').split(',').filter(Boolean).map(Number);
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    if (kapaliGunler.includes(d.getDay())) continue;
    tarihler.push({
      str: d.toISOString().slice(0, 10),
      gun: d.toLocaleDateString(locale, { weekday: 'short' }),
      gunSayi: d.getDate(),
      ay: d.toLocaleDateString(locale, { month: 'short' }),
      bugun: i === 0,
      yarin: i === 1,
    });
  }

  const tarihFormat = (str) => {
    const d = new Date(str);
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  // ─── OTP cooldown timer ───
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const id = setTimeout(() => setOtpCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearTimeout(id);
  }, [otpCooldown]);

  // ─── Telefon → "Devam Et" → OTP gönder ───
  const devamEt = async () => {
    if (!musteriTelefon.trim() || musteriTelefon.trim().length < 10) {
      setHata(t('invalidPhone'));
      return;
    }
    setHata('');
    setOtpGonderiliyor(true);
    try {
      const res = await fetch(`${API_URL}/book/${slug}/otp-gonder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefon: musteriTelefon.trim() })
      });
      const d = await res.json();
      if (d.basarili) {
        // OTP gönderildi — kod adımına geç
        setOtpStage('kod');
        setOtpKod('');
        setOtpCooldown(60);
      } else if (d.waBagli === false) {
        // WA bağlı değil → bypass modu, direkt özet adımına
        setOtpStage('bypass');
        setAdim(6);
      } else {
        setHata(d.hata || t('genericError'));
      }
    } catch {
      setHata(t('connError'));
    }
    setOtpGonderiliyor(false);
  };

  const otpTekrarGonder = async () => {
    if (otpCooldown > 0) return;
    setOtpGonderiliyor(true);
    setHata('');
    try {
      const res = await fetch(`${API_URL}/book/${slug}/otp-gonder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefon: musteriTelefon.trim() })
      });
      const d = await res.json();
      if (d.basarili) {
        setOtpCooldown(60);
      } else if (d.waBagli === false) {
        setOtpStage('bypass');
        setAdim(6);
      } else {
        setHata(d.hata || t('genericError'));
        if (d.cooldown) setOtpCooldown(d.cooldown);
      }
    } catch {
      setHata(t('connError'));
    }
    setOtpGonderiliyor(false);
  };

  const otpDogrula = async () => {
    if (otpKod.trim().length < 4) return;
    setOtpDogrulaniyor(true);
    setHata('');
    try {
      const res = await fetch(`${API_URL}/book/${slug}/otp-dogrula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefon: musteriTelefon.trim(), kod: otpKod.trim() })
      });
      const d = await res.json();
      if (d.basarili && d.dogrulandi) {
        setOtpStage('bypass'); // artık doğrulandı, bypass gibi davran
        setAdim(6);
      } else {
        setHata(d.hata || t('genericError'));
      }
    } catch {
      setHata(t('connError'));
    }
    setOtpDogrulaniyor(false);
  };

  const telefonuDegistir = () => {
    setOtpStage('giris');
    setOtpKod('');
    setOtpCooldown(0);
    setHata('');
  };

  // ─── Stepper — 4 ana adım ───
  // Internal: 1=Hizmet, 2=Calisan (opt), 3=Tarih, 4=Saat, 5=Bilgiler, 6=Ozet, 7=Success
  // UI: [Hizmet] → [Personel] → [Tarih&Saat] → [Onay]
  const stepperDurumu = () => {
    if (adim <= 1) return 0;           // Hizmet
    if (adim === 2) return 1;          // Personel
    if (adim === 3 || adim === 4) return 2; // Tarih & Saat
    return 3;                          // Onay (5,6,7)
  };

  const activeStep = stepperDurumu();
  const stepLabels = [t('stepService'), t('stepStaff'), t('stepDate'), t('stepConfirm')];

  // Stepper'a tıklayınca geri git (tamamlanan adımlara)
  const stepperTikla = (i) => {
    if (i >= activeStep) return; // ileri gidilmez
    if (i === 0) setAdim(1);
    else if (i === 1) setAdim(2);
    else if (i === 2) setAdim(3);
  };

  // Dil seçici component (tüm sayfalarda gösterilir)
  const DilSecici = () => (
    <div className="bk-lang">
      <button
        className="bk-lang-btn"
        onClick={() => setDilAcik(v => !v)}
        aria-label={t('selectLang')}
      >
        <I.Globe size={14} />
        <span className="bk-lang-flag">{aktifDil.bayrak}</span>
        <span className="bk-lang-code">{aktifDil.kisa}</span>
        <I.ChevronDown size={12} />
      </button>
      {dilAcik && (
        <>
          <div className="bk-lang-backdrop" onClick={() => setDilAcik(false)} />
          <div className="bk-lang-menu">
            <div className="bk-lang-menu-title">{t('selectLang')}</div>
            <div className="bk-lang-grid">
              {DILLER.map(d => (
                <button
                  key={d.kod}
                  className={`bk-lang-option ${d.kod === dil ? 'active' : ''}`}
                  onClick={() => dilSec(d.kod)}
                >
                  <span className="bk-lang-flag">{d.bayrak}</span>
                  <span className="bk-lang-name">{d.ad}</span>
                  {d.kod === dil && <I.Check size={14} />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );

  // ═══════════════ HATA SAYFASI ═══════════════
  if (hata && adim === 0) {
    return (
      <div className="bk-page" dir={rtl ? 'rtl' : 'ltr'} lang={dil}>
        <DilSecici />
        <div className="bk-container">
          <div className="bk-card bk-error-page">
            <div className="bk-error-page-icon">😔</div>
            <div className="bk-error-page-title">{t('notFoundTitle')}</div>
            <div className="bk-error-page-desc">{t('notFoundDesc')}</div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ LOADING ═══════════════
  if (adim === 0) {
    return (
      <div className="bk-page" dir={rtl ? 'rtl' : 'ltr'} lang={dil}>
        <DilSecici />
        <div className="bk-container">
          <div className="bk-skeleton" style={{ height: 120, marginBottom: 20 }} />
          <div className="bk-skeleton" style={{ height: 60, marginBottom: 20 }} />
          <div className="bk-skeleton" style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  const durum = isletmeAcikMi(isletme, t);

  return (
    <div className="bk-page" dir={rtl ? 'rtl' : 'ltr'} lang={dil}>
      <DilSecici />
      <div className="bk-container">

        {/* ═══ HEADER ═══ */}
        <div className="bk-header">
          <div className="bk-header-row">
            <div className="bk-logo">{kategoriIcon[isletme?.kategori] || '🏢'}</div>
            <div className="bk-info">
              <h1 className="bk-title">{isletme?.isim}</h1>
              {(isletme?.adres || isletme?.ilce) && (
                <div className="bk-meta-row">
                  <I.MapPin size={13} />
                  <span>{isletme.adres}{isletme.ilce ? `, ${isletme.ilce}` : ''}</span>
                </div>
              )}
              <div className="bk-meta-row">
                <I.Clock size={13} />
                <span>{(isletme?.calisma_baslangic || '09:00').slice(0,5)} — {(isletme?.calisma_bitis || '19:00').slice(0,5)}</span>
              </div>
              <div className={`bk-status ${durum.acik ? 'open' : 'closed'}`}>
                <span className="bk-status-dot" />
                {durum.metin}
              </div>
            </div>
          </div>
        </div>

        {/* ═══ STEPPER ═══ */}
        {adim < 7 && (
          <div className="bk-stepper">
            {stepLabels.map((label, i) => (
              <Fragment key={i}>
                <div
                  className={`bk-step ${activeStep === i ? 'active' : activeStep > i ? 'done clickable' : 'future'}`}
                  onClick={() => stepperTikla(i)}
                >
                  <div className="bk-step-dot">
                    {activeStep > i ? <I.Check size={14} /> : i + 1}
                  </div>
                  <div className="bk-step-label">{label}</div>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`bk-step-line ${activeStep > i ? 'done' : ''}`} />
                )}
              </Fragment>
            ))}
          </div>
        )}

        {/* ═══ ERROR BANNER ═══ */}
        {hata && adim !== 0 && (
          <div className="bk-error">
            <I.AlertCircle size={16} />
            <span>{hata}</span>
          </div>
        )}

        {/* ═══ ADIM 1: HİZMET ═══ */}
        {adim === 1 && (
          <div className="bk-card">
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Sparkles size={11} /> {t('selectService')}
              </span>
            </div>
            <div className="bk-list">
              {hizmetler.map(h => (
                <button
                  key={h.id}
                  onClick={() => hizmetSec(h)}
                  className={`bk-item ${secilenHizmet?.id === h.id ? 'active' : ''}`}
                >
                  <div className="bk-item-icon">{hizmetIconu(h.isim)}</div>
                  <div className="bk-item-body">
                    <div className="bk-item-name">{h.isim}</div>
                    <div className="bk-item-meta">
                      <I.Timer size={11} /> {h.sure_dk} {t('minutes')}
                    </div>
                  </div>
                  <div className="bk-item-price">
                    <span className="bk-price-num">{Number(h.fiyat).toLocaleString(locale)}</span>
                    <span className="bk-price-lira">₺</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ADIM 2: ÇALIŞAN ═══ */}
        {adim === 2 && !otomatikCalisan && calisanlar.length > 0 && (
          <div className="bk-card">
            <button onClick={() => { setAdim(1); setSecilenCalisan(null); }} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('back')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.User size={11} /> {t('selectStaff')}
              </span>
            </div>
            <div className="bk-list">
              {calisanlar.map(c => (
                <button
                  key={c.id}
                  onClick={() => calisanSec(c)}
                  className={`bk-item ${secilenCalisan?.id === c.id ? 'active' : ''}`}
                >
                  <div className="bk-item-icon"><I.User size={20} /></div>
                  <div className="bk-item-body">
                    <div className="bk-item-name">{c.isim}</div>
                    {c.uzmanlik && <div className="bk-item-meta">{c.uzmanlik}</div>}
                  </div>
                </button>
              ))}
              <button onClick={() => calisanSec(null)} className="bk-btn-ghost">
                {t('anyStaff')}
              </button>
            </div>
          </div>
        )}

        {/* ═══ ADIM 3: TARİH ═══ */}
        {adim === 3 && (
          <div className="bk-card">
            <button onClick={() => setAdim(otomatikCalisan ? 1 : 2)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('back')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Clock size={11} /> {t('selectDate')}
              </span>
            </div>
            <div className="bk-date-grid">
              {tarihler.map(d => (
                <button
                  key={d.str}
                  onClick={() => tarihSec(d.str)}
                  className={`bk-date ${secilenTarih === d.str ? 'active' : ''}`}
                >
                  <div className="bk-date-day">{d.gun}</div>
                  <div className="bk-date-num">{d.gunSayi}</div>
                  <div className="bk-date-month">{d.ay}</div>
                  {d.bugun && <span className="bk-date-badge">{t('today')}</span>}
                  {d.yarin && <span className="bk-date-badge">{t('tomorrow')}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ADIM 4: SAAT ═══ */}
        {adim === 4 && (
          <div className="bk-card">
            <button onClick={() => setAdim(3)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('back')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Clock size={11} /> {t('selectTime')}
              </span>
            </div>
            {saatler.length === 0 ? (
              <div className="bk-empty">
                <I.CalendarX size={28} />
                <div>{t('noSlots')}</div>
              </div>
            ) : (
              <div className="bk-time-grid">
                {saatler.map(s => (
                  <button
                    key={s}
                    onClick={() => saatSec(s)}
                    className={`bk-time ${secilenSaat === s ? 'active' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ADIM 5: BİLGİLER + OTP ═══ */}
        {adim === 5 && otpStage === 'giris' && (
          <div className="bk-card">
            <button onClick={() => setAdim(4)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('back')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.User size={11} /> {t('yourInfo')}
              </span>
            </div>
            <div className="bk-form">
              <div>
                <label className="bk-field-label">{t('fullName')}</label>
                <input
                  value={musteriIsim}
                  onChange={e => setMusteriIsim(e.target.value)}
                  placeholder={t('fullNamePh')}
                  className="bk-input"
                />
              </div>
              <div>
                <label className="bk-field-label">{t('phone')} *</label>
                <input
                  value={musteriTelefon}
                  onChange={e => setMusteriTelefon(e.target.value.replace(/[^0-9+ ]/g, ''))}
                  placeholder={t('phonePh')}
                  className="bk-input"
                  type="tel"
                  inputMode="tel"
                />
              </div>
              <button
                onClick={devamEt}
                disabled={!musteriTelefon.trim() || otpGonderiliyor}
                className="bk-btn"
              >
                {otpGonderiliyor ? t('otpSending') : t('continue')}
              </button>
            </div>
          </div>
        )}

        {/* ═══ ADIM 5.5: WhatsApp OTP DOĞRULAMA ═══ */}
        {adim === 5 && otpStage === 'kod' && (
          <div className="bk-card">
            <button onClick={telefonuDegistir} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('otpChangePhone')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge bk-step-badge-wa">
                <I.Whatsapp size={12} /> {t('otpTitle')}
              </span>
            </div>
            <div className="bk-otp-desc">
              <I.Whatsapp size={42} className="bk-otp-icon" />
              <p>{t('otpDesc')}</p>
              <div className="bk-otp-phone">{musteriTelefon}</div>
            </div>
            <div className="bk-form">
              <input
                value={otpKod}
                onChange={e => setOtpKod(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder={t('otpPlaceholder')}
                className="bk-input bk-otp-input"
                type="tel"
                inputMode="numeric"
                autoFocus
                maxLength={6}
              />
              <button
                onClick={otpDogrula}
                disabled={otpKod.trim().length < 4 || otpDogrulaniyor}
                className="bk-btn"
              >
                {otpDogrulaniyor ? t('otpVerifying') : t('otpVerify')}
              </button>
              <button
                onClick={otpTekrarGonder}
                disabled={otpCooldown > 0 || otpGonderiliyor}
                className="bk-btn-ghost"
              >
                {otpGonderiliyor
                  ? t('otpSending')
                  : otpCooldown > 0
                    ? `${t('otpResendWait')} ${otpCooldown}s`
                    : t('otpResend')}
              </button>
            </div>
          </div>
        )}

        {/* ═══ ADIM 6: ÖZET ═══ */}
        {adim === 6 && (
          <div className="bk-card">
            <button onClick={() => setAdim(5)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> {t('back')}
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Check size={11} /> {t('summary')}
              </span>
            </div>
            <div className="bk-summary">
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('service')}</span>
                <span className="bk-summary-val">{secilenHizmet?.isim}</span>
              </div>
              {secilenCalisan && (
                <div className="bk-summary-row">
                  <span className="bk-summary-key">{t('staff')}</span>
                  <span className="bk-summary-val">{secilenCalisan.isim}</span>
                </div>
              )}
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('date')}</span>
                <span className="bk-summary-val">{tarihFormat(secilenTarih)}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('time')}</span>
                <span className="bk-summary-val">{secilenSaat}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('fullName')}</span>
                <span className="bk-summary-val">{musteriIsim || '—'}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('phoneLabel')}</span>
                <span className="bk-summary-val">{musteriTelefon}</span>
              </div>
              <div className="bk-summary-row total">
                <span className="bk-summary-key">{t('total')}</span>
                <span className="bk-summary-val">{Number(secilenHizmet?.fiyat || 0).toLocaleString(locale)} ₺</span>
              </div>
            </div>
            <button onClick={randevuOlustur} disabled={yukleniyor} className="bk-btn">
              {yukleniyor ? t('creating') : t('confirmBooking')}
            </button>
          </div>
        )}

        {/* ═══ ADIM 7: SUCCESS ═══ */}
        {adim === 7 && (
          <div className="bk-card bk-success">
            <div className="bk-success-icon">
              <I.CheckBig size={44} />
            </div>
            <div className="bk-success-title">{t('successTitle')}</div>
            <div className="bk-success-desc">
              {t('successBefore')}
              <span className="bk-success-highlight">{isletme?.isim}</span>
              {t('successMid')}
              <span className="bk-success-highlight">{tarihFormat(secilenTarih)}</span>
              {t('successAfter')}
              <span className="bk-success-highlight">{secilenSaat}</span>
              {t('successEnd')}
            </div>
            <div className="bk-success-card">
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('service')}</span>
                <span className="bk-summary-val">{secilenHizmet?.isim}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('date')}</span>
                <span className="bk-summary-val">{tarihFormat(secilenTarih)}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">{t('time')}</span>
                <span className="bk-summary-val">{secilenSaat}</span>
              </div>
              <div className="bk-summary-row total">
                <span className="bk-summary-key">{t('total')}</span>
                <span className="bk-summary-val">{Number(secilenHizmet?.fiyat || 0).toLocaleString(locale)} ₺</span>
              </div>
            </div>
            <button onClick={() => window.location.reload()} className="bk-btn">
              {t('newBooking')}
            </button>
          </div>
        )}

        {/* ═══ BRAND FOOTER ═══ */}
        <div className="bk-footer">
          <a href="https://xn--srago-n4a.com" target="_blank" rel="noopener">
            <span className="bk-footer-logo">S</span>
            {t('poweredBy')}
          </a>
        </div>

      </div>
    </div>
  );
}
