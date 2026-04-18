import { useState, useEffect, Fragment } from 'react';
import { API_URL } from '../../lib/config';
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

// Açık/kapalı durumu (basit: çalışma saati + kapalı günler)
function isletmeAcikMi(isletme) {
  if (!isletme) return { acik: false, metin: 'Bilinmiyor' };
  const simdi = new Date();
  const gun = simdi.getDay();
  const kapaliGunler = String(isletme.kapali_gunler || '').split(',').filter(Boolean).map(Number);
  if (kapaliGunler.includes(gun)) return { acik: false, metin: 'Bugün kapalı' };

  const [bh, bm] = String(isletme.calisma_baslangic || '09:00').split(':').map(Number);
  const [eh, em] = String(isletme.calisma_bitis || '19:00').split(':').map(Number);
  const simdiDk = simdi.getHours() * 60 + simdi.getMinutes();
  const baslangic = bh * 60 + bm;
  const bitis = eh * 60 + em;

  if (simdiDk >= baslangic && simdiDk < bitis) return { acik: true, metin: 'Şu an açık' };
  return { acik: false, metin: 'Şu an kapalı' };
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

  // ─── API ───
  useEffect(() => {
    fetch(`${API_URL}/book/${slug}`)
      .then(r => r.json())
      .then(d => {
        if (d.hata) { setHata('İşletme bulunamadı'); return; }
        setIsletme(d.isletme);
        setAdim(1);
      })
      .catch(() => setHata('Bağlantı hatası'));
  }, [slug]);

  useEffect(() => {
    if (!isletme) return;
    fetch(`${API_URL}/book/${slug}/hizmetler`).then(r => r.json()).then(d => setHizmetler(d.hizmetler || []));
  }, [isletme]);

  useEffect(() => {
    if (!secilenHizmet) return;
    fetch(`${API_URL}/book/${slug}/calisanlar?hizmetId=${secilenHizmet.id}`)
      .then(r => r.json())
      .then(d => { setCalisanlar(d.calisanlar || []); setOtomatikCalisan(!!d.otomatik); });
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
      setHata('Geçerli telefon numarası girin');
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
      else setHata(d.hata || 'Bir hata oluştu');
    } catch { setHata('Bağlantı hatası'); }
    setYukleniyor(false);
  };

  // ─── Tarih listesi ───
  const tarihler = [];
  const kapaliGunler = (isletme?.kapali_gunler || '').split(',').filter(Boolean).map(Number);
  for (let i = 0; i < 30; i++) {
    const t = new Date();
    t.setDate(t.getDate() + i);
    if (kapaliGunler.includes(t.getDay())) continue;
    tarihler.push({
      str: t.toISOString().slice(0, 10),
      gun: t.toLocaleDateString('tr-TR', { weekday: 'short' }),
      gunSayi: t.getDate(),
      ay: t.toLocaleDateString('tr-TR', { month: 'short' }),
      bugun: i === 0,
      yarin: i === 1,
    });
  }

  const tarihFormat = (str) => {
    const d = new Date(str);
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
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
  const stepLabels = ['Hizmet', 'Personel', 'Tarih', 'Onay'];

  // ═══════════════ HATA SAYFASI ═══════════════
  if (hata && adim === 0) {
    return (
      <div className="bk-page">
        <div className="bk-container">
          <div className="bk-card bk-error-page">
            <div className="bk-error-page-icon">😔</div>
            <div className="bk-error-page-title">İşletme Bulunamadı</div>
            <div className="bk-error-page-desc">Bu randevu linki geçersiz veya devre dışı.</div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════ LOADING ═══════════════
  if (adim === 0) {
    return (
      <div className="bk-page">
        <div className="bk-container">
          <div className="bk-skeleton" style={{ height: 120, marginBottom: 20 }} />
          <div className="bk-skeleton" style={{ height: 60, marginBottom: 20 }} />
          <div className="bk-skeleton" style={{ height: 280 }} />
        </div>
      </div>
    );
  }

  const durum = isletmeAcikMi(isletme);

  return (
    <div className="bk-page">
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
                <div className={`bk-step ${activeStep === i ? 'active' : activeStep > i ? 'done' : 'future'}`}>
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
        {adim >= 1 && adim < 7 && (
          <div className="bk-card">
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Sparkles size={11} /> Hizmet Seçin
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
                      <I.Timer size={11} /> {h.sure_dk} dk
                    </div>
                  </div>
                  <div className="bk-item-price">
                    <span className="bk-price-num">{Number(h.fiyat).toLocaleString('tr-TR')}</span>
                    <span className="bk-price-lira">₺</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ADIM 2: ÇALIŞAN ═══ */}
        {adim >= 2 && adim < 7 && !otomatikCalisan && calisanlar.length > 0 && (
          <div className="bk-card">
            <button onClick={() => { setAdim(1); setSecilenCalisan(null); }} className="bk-back-btn">
              <I.ChevronLeft size={14} /> Geri
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.User size={11} /> Personel Seçin
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
                Fark etmez — herhangi bir personel
              </button>
            </div>
          </div>
        )}

        {/* ═══ ADIM 3: TARİH ═══ */}
        {adim >= 3 && adim < 7 && (
          <div className="bk-card">
            <button onClick={() => setAdim(otomatikCalisan ? 1 : 2)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> Geri
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Clock size={11} /> Tarih Seçin
              </span>
            </div>
            <div className="bk-date-grid">
              {tarihler.map(t => (
                <button
                  key={t.str}
                  onClick={() => tarihSec(t.str)}
                  className={`bk-date ${secilenTarih === t.str ? 'active' : ''}`}
                >
                  <div className="bk-date-day">{t.gun}</div>
                  <div className="bk-date-num">{t.gunSayi}</div>
                  <div className="bk-date-month">{t.ay}</div>
                  {t.bugun && <span className="bk-date-badge">BUGÜN</span>}
                  {t.yarin && <span className="bk-date-badge">YARIN</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ ADIM 4: SAAT ═══ */}
        {adim >= 4 && adim < 7 && (
          <div className="bk-card">
            <button onClick={() => setAdim(3)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> Geri
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Clock size={11} /> Saat Seçin
              </span>
            </div>
            {saatler.length === 0 ? (
              <div className="bk-empty">
                <I.CalendarX size={28} />
                <div>Bu tarihte müsait saat yok</div>
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

        {/* ═══ ADIM 5: BİLGİLER ═══ */}
        {adim >= 5 && adim < 7 && (
          <div className="bk-card">
            <button onClick={() => setAdim(4)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> Geri
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.User size={11} /> Bilgileriniz
              </span>
            </div>
            <div className="bk-form">
              <div>
                <label className="bk-field-label">Ad Soyad</label>
                <input
                  value={musteriIsim}
                  onChange={e => setMusteriIsim(e.target.value)}
                  placeholder="Adınız Soyadınız"
                  className="bk-input"
                />
              </div>
              <div>
                <label className="bk-field-label">Telefon *</label>
                <input
                  value={musteriTelefon}
                  onChange={e => setMusteriTelefon(e.target.value)}
                  placeholder="05XX XXX XX XX"
                  className="bk-input"
                  type="tel"
                />
              </div>
              <button
                onClick={() => { setHata(''); setAdim(6); }}
                disabled={!musteriTelefon.trim()}
                className="bk-btn"
              >
                Devam Et →
              </button>
            </div>
          </div>
        )}

        {/* ═══ ADIM 6: ÖZET ═══ */}
        {adim === 6 && (
          <div className="bk-card">
            <button onClick={() => setAdim(5)} className="bk-back-btn">
              <I.ChevronLeft size={14} /> Geri
            </button>
            <div className="bk-card-head">
              <span className="bk-step-badge">
                <I.Check size={11} /> Randevu Özeti
              </span>
            </div>
            <div className="bk-summary">
              <div className="bk-summary-row">
                <span className="bk-summary-key">Hizmet</span>
                <span className="bk-summary-val">{secilenHizmet?.isim}</span>
              </div>
              {secilenCalisan && (
                <div className="bk-summary-row">
                  <span className="bk-summary-key">Personel</span>
                  <span className="bk-summary-val">{secilenCalisan.isim}</span>
                </div>
              )}
              <div className="bk-summary-row">
                <span className="bk-summary-key">Tarih</span>
                <span className="bk-summary-val">{tarihFormat(secilenTarih)}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">Saat</span>
                <span className="bk-summary-val">{secilenSaat}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">Ad Soyad</span>
                <span className="bk-summary-val">{musteriIsim || '—'}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">Telefon</span>
                <span className="bk-summary-val">{musteriTelefon}</span>
              </div>
              <div className="bk-summary-row total">
                <span className="bk-summary-key">Toplam</span>
                <span className="bk-summary-val">{Number(secilenHizmet?.fiyat || 0).toLocaleString('tr-TR')} ₺</span>
              </div>
            </div>
            <button onClick={randevuOlustur} disabled={yukleniyor} className="bk-btn">
              {yukleniyor ? 'Oluşturuluyor...' : '✓ Randevuyu Onayla'}
            </button>
          </div>
        )}

        {/* ═══ ADIM 7: SUCCESS ═══ */}
        {adim === 7 && (
          <div className="bk-card bk-success">
            <div className="bk-success-icon">
              <I.CheckBig size={44} />
            </div>
            <div className="bk-success-title">Randevunuz Alındı! 🎉</div>
            <div className="bk-success-desc">
              <span className="bk-success-highlight">{tarihFormat(secilenTarih)}</span>
              {' '}saat{' '}
              <span className="bk-success-highlight">{secilenSaat}</span>
              {' '}için{' '}
              <span className="bk-success-highlight">{isletme?.isim}</span>
              {' '}randevunuz oluşturuldu.
            </div>
            <div className="bk-success-card">
              <div className="bk-summary-row">
                <span className="bk-summary-key">Hizmet</span>
                <span className="bk-summary-val">{secilenHizmet?.isim}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">Tarih</span>
                <span className="bk-summary-val">{tarihFormat(secilenTarih)}</span>
              </div>
              <div className="bk-summary-row">
                <span className="bk-summary-key">Saat</span>
                <span className="bk-summary-val">{secilenSaat}</span>
              </div>
              <div className="bk-summary-row total">
                <span className="bk-summary-key">Toplam</span>
                <span className="bk-summary-val">{Number(secilenHizmet?.fiyat || 0).toLocaleString('tr-TR')} ₺</span>
              </div>
            </div>
            <button onClick={() => window.location.reload()} className="bk-btn">
              Yeni Randevu Al
            </button>
          </div>
        )}

        {/* ═══ BRAND FOOTER ═══ */}
        <div className="bk-footer">
          <a href="https://xn--srago-n4a.com" target="_blank" rel="noopener">
            <span className="bk-footer-logo">S</span>
            Powered by SıraGO
          </a>
        </div>

      </div>
    </div>
  );
}
