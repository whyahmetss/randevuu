import { useState, useEffect } from 'react';
import { API_URL } from '../../lib/config';

const kategoriRenk = {
  berber: '#2563eb', kuafor: '#ec4899', guzellik: '#f43f5e', spa: '#8b5cf6', disci: '#0ea5e9',
  veteriner: '#f59e0b', diyetisyen: '#22c55e', psikolog: '#6366f1', fizyoterapi: '#14b8a6',
  restoran: '#ef4444', cafe: '#a16207', spor: '#ea580c', egitim: '#3b82f6', foto: '#7c3aed',
  dovme: '#e11d48', oto: '#64748b', hukuk: '#475569', genel: '#10b981'
};

const kategoriIcon = {
  berber: '💈', kuafor: '✂️', guzellik: '💅', spa: '🧖', disci: '🦷', veteriner: '🐾',
  diyetisyen: '🥗', psikolog: '🧠', fizyoterapi: '🏥', restoran: '🍽️', cafe: '☕',
  spor: '🏋️', egitim: '📚', foto: '📸', dovme: '🎨', oto: '🚗', hukuk: '⚖️', genel: '🏢'
};

export default function BookingPage({ slug }) {
  const [adim, setAdim] = useState(0); // 0=yükleniyor, 1=hizmet, 2=çalışan, 3=tarih, 4=saat, 5=bilgi, 6=ozet, 7=tamamlandı
  const [isletme, setIsletme] = useState(null);
  const [hizmetler, setHizmetler] = useState([]);
  const [calisanlar, setCalisanlar] = useState([]);
  const [saatler, setSaatler] = useState([]);
  const [otomatikCalisan, setOtomatikCalisan] = useState(false);
  const [hata, setHata] = useState('');
  const [yukleniyor, setYukleniyor] = useState(false);

  // Seçimler
  const [secilenHizmet, setSecilenHizmet] = useState(null);
  const [secilenCalisan, setSecilenCalisan] = useState(null);
  const [secilenTarih, setSecilenTarih] = useState('');
  const [secilenSaat, setSecilenSaat] = useState('');
  const [musteriIsim, setMusteriIsim] = useState('');
  const [musteriTelefon, setMusteriTelefon] = useState('');
  const [sonuc, setSonuc] = useState(null);

  const renk = kategoriRenk[isletme?.kategori] || '#10b981';

  // İşletme bilgilerini yükle
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

  // Hizmetleri yükle
  useEffect(() => {
    if (!isletme) return;
    fetch(`${API_URL}/book/${slug}/hizmetler`)
      .then(r => r.json())
      .then(d => setHizmetler(d.hizmetler || []));
  }, [isletme]);

  // Çalışanları yükle (hizmet seçildiğinde)
  useEffect(() => {
    if (!secilenHizmet) return;
    fetch(`${API_URL}/book/${slug}/calisanlar?hizmetId=${secilenHizmet.id}`)
      .then(r => r.json())
      .then(d => {
        setCalisanlar(d.calisanlar || []);
        setOtomatikCalisan(!!d.otomatik);
      });
  }, [secilenHizmet]);

  // Saatleri yükle
  useEffect(() => {
    if (!secilenTarih || !secilenHizmet) return;
    const params = new URLSearchParams({ tarih: secilenTarih, hizmetId: secilenHizmet.id });
    if (secilenCalisan) params.set('calisanId', secilenCalisan.id);
    fetch(`${API_URL}/book/${slug}/saatler?${params}`)
      .then(r => r.json())
      .then(d => setSaatler(d.saatler || []));
  }, [secilenTarih, secilenCalisan, secilenHizmet]);

  const hizmetSec = (h) => {
    setSecilenHizmet(h);
    setSecilenCalisan(null);
    setSecilenTarih('');
    setSecilenSaat('');
    setAdim(2);
  };

  const calisanSec = (c) => {
    setSecilenCalisan(c);
    setSecilenTarih('');
    setSecilenSaat('');
    setAdim(3);
  };

  const tarihSec = (t) => {
    setSecilenTarih(t);
    setSecilenSaat('');
    setAdim(4);
  };

  const saatSec = (s) => {
    setSecilenSaat(s);
    setAdim(5);
  };

  const randevuOlustur = async () => {
    if (!musteriTelefon.trim() || musteriTelefon.trim().length < 10) {
      setHata('Geçerli telefon numarası girin');
      return;
    }
    setYukleniyor(true);
    setHata('');
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
      if (d.basarili) {
        setSonuc(d);
        setAdim(7);
      } else {
        setHata(d.hata || 'Bir hata oluştu');
      }
    } catch {
      setHata('Bağlantı hatası');
    }
    setYukleniyor(false);
  };

  // Tarih listesi oluştur (bugünden 30 gün sonrasına)
  const tarihler = [];
  const kapaliGunler = (isletme?.kapali_gunler || '').split(',').filter(Boolean).map(Number);
  for (let i = 0; i < 30; i++) {
    const t = new Date();
    t.setDate(t.getDate() + i);
    const gun = t.getDay();
    if (kapaliGunler.includes(gun)) continue;
    tarihler.push({
      str: t.toISOString().slice(0, 10),
      label: t.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }),
      gun: t.toLocaleDateString('tr-TR', { weekday: 'short' }),
      gunSayi: t.getDate(),
      ay: t.toLocaleDateString('tr-TR', { month: 'short' }),
      bugun: i === 0
    });
  }

  const tarihFormat = (str) => {
    const d = new Date(str);
    return d.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  /* ═══════════════════ STYLES ═══════════════════ */
  const S = {
    page: {
      minHeight: '100vh', background: '#f8fafc',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      display: 'flex', flexDirection: 'column', alignItems: 'center',
    },
    container: {
      width: '100%', maxWidth: 480, padding: '20px 16px',
    },
    header: {
      background: renk, borderRadius: 20, padding: '28px 24px', marginBottom: 20,
      color: '#fff', position: 'relative', overflow: 'hidden',
    },
    card: {
      background: '#fff', borderRadius: 16, padding: '20px',
      border: '1px solid #e2e8f0', marginBottom: 12,
      boxShadow: '0 1px 3px rgba(0,0,0,.04)',
    },
    btn: (aktif) => ({
      width: '100%', padding: '14px', borderRadius: 12, border: 'none',
      background: aktif ? renk : '#f1f5f9', color: aktif ? '#fff' : '#64748b',
      fontWeight: 700, fontSize: 14, cursor: 'pointer',
      fontFamily: 'inherit', transition: 'all .2s',
    }),
    input: {
      width: '100%', padding: '12px 16px', borderRadius: 12,
      border: '1px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit',
      outline: 'none', background: '#fff', boxSizing: 'border-box',
    },
    stepBadge: {
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 20, background: `${renk}15`,
      color: renk, fontSize: 12, fontWeight: 700, marginBottom: 12,
    },
    backBtn: {
      background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
      fontSize: 13, fontWeight: 600, padding: '8px 0', display: 'flex', alignItems: 'center', gap: 4,
    }
  };

  // Hata sayfası
  if (hata && adim === 0) {
    return (
      <div style={S.page}>
        <div style={S.container}>
          <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>😔</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>İşletme Bulunamadı</div>
            <div style={{ fontSize: 14, color: '#64748b' }}>Bu randevu linki geçersiz veya devre dışı.</div>
          </div>
        </div>
      </div>
    );
  }

  // Yükleniyor
  if (adim === 0) {
    return (
      <div style={S.page}>
        <div style={S.container}>
          <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: 16, color: '#64748b' }}>Yükleniyor...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.container}>
        {/* Header */}
        <div style={S.header}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,.08)' }} />
          <div style={{ position: 'absolute', bottom: -20, left: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,.06)' }} />
          <div style={{ fontSize: 32, marginBottom: 8 }}>{kategoriIcon[isletme?.kategori] || '🏢'}</div>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>{isletme?.isim}</div>
          {isletme?.adres && <div style={{ fontSize: 13, opacity: .8 }}>{isletme.adres}{isletme.ilce ? ` / ${isletme.ilce}` : ''}</div>}
          <div style={{ fontSize: 12, opacity: .6, marginTop: 6 }}>
            {isletme?.calisma_baslangic || '09:00'} - {isletme?.calisma_bitis || '19:00'}
          </div>
        </div>

        {/* Hata mesajı */}
        {hata && adim !== 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', marginBottom: 12, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
            {hata}
          </div>
        )}

        {/* ── ADIM 1: Hizmet Seçimi ── */}
        {adim >= 1 && adim < 7 && (
          <div style={S.card}>
            <div style={S.stepBadge}>1 — Hizmet Seçin</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {hizmetler.map(h => (
                <button key={h.id} onClick={() => hizmetSec(h)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: secilenHizmet?.id === h.id ? `${renk}12` : '#f8fafc',
                  outline: secilenHizmet?.id === h.id ? `2px solid ${renk}` : '1px solid #e2e8f0',
                  fontFamily: 'inherit', transition: 'all .15s',
                }}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{h.isim}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{h.sure_dk} dk</div>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: renk }}>{h.fiyat}₺</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ADIM 2: Çalışan Seçimi ── */}
        {adim >= 2 && adim < 7 && !otomatikCalisan && calisanlar.length > 0 && (
          <div style={S.card}>
            <button onClick={() => { setAdim(1); setSecilenCalisan(null); }} style={S.backBtn}>← Geri</button>
            <div style={S.stepBadge}>2 — Çalışan Seçin</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {calisanlar.map(c => (
                <button key={c.id} onClick={() => calisanSec(c)} style={{
                  padding: '14px 16px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: secilenCalisan?.id === c.id ? `${renk}12` : '#f8fafc',
                  outline: secilenCalisan?.id === c.id ? `2px solid ${renk}` : '1px solid #e2e8f0',
                  fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#1e293b',
                  textAlign: 'left', transition: 'all .15s',
                }}>
                  {c.isim}
                </button>
              ))}
              <button onClick={() => calisanSec(null)} style={{
                padding: '12px', borderRadius: 12, border: '1px dashed #cbd5e1',
                background: 'transparent', color: '#64748b', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              }}>
                Fark etmez (otomatik)
              </button>
            </div>
          </div>
        )}

        {/* ── ADIM 3: Tarih Seçimi ── */}
        {adim >= 3 && adim < 7 && (
          <div style={S.card}>
            <button onClick={() => setAdim(otomatikCalisan ? 1 : 2)} style={S.backBtn}>← Geri</button>
            <div style={S.stepBadge}>{otomatikCalisan ? '2' : '3'} — Tarih Seçin</div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {tarihler.slice(0, 14).map(t => (
                <button key={t.str} onClick={() => tarihSec(t.str)} style={{
                  minWidth: 64, padding: '10px 8px', borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: secilenTarih === t.str ? renk : '#f8fafc',
                  color: secilenTarih === t.str ? '#fff' : '#1e293b',
                  outline: secilenTarih === t.str ? 'none' : '1px solid #e2e8f0',
                  fontFamily: 'inherit', textAlign: 'center', transition: 'all .15s', flexShrink: 0,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, opacity: .7 }}>{t.gun}</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{t.gunSayi}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, opacity: .6 }}>{t.ay}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ADIM 4: Saat Seçimi ── */}
        {adim >= 4 && adim < 7 && (
          <div style={S.card}>
            <button onClick={() => setAdim(3)} style={S.backBtn}>← Geri</button>
            <div style={S.stepBadge}>{otomatikCalisan ? '3' : '4'} — Saat Seçin</div>
            {saatler.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                Bu tarihte müsait saat yok
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {saatler.map(s => (
                  <button key={s} onClick={() => saatSec(s)} style={{
                    padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: secilenSaat === s ? renk : '#f8fafc',
                    color: secilenSaat === s ? '#fff' : '#334155',
                    outline: secilenSaat === s ? 'none' : '1px solid #e2e8f0',
                    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
                    transition: 'all .15s',
                  }}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ADIM 5: Müşteri Bilgileri ── */}
        {adim >= 5 && adim < 7 && (
          <div style={S.card}>
            <button onClick={() => setAdim(4)} style={S.backBtn}>← Geri</button>
            <div style={S.stepBadge}>{otomatikCalisan ? '4' : '5'} — Bilgileriniz</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, display: 'block' }}>Ad Soyad</label>
                <input value={musteriIsim} onChange={e => setMusteriIsim(e.target.value)} placeholder="Adınız Soyadınız" style={S.input} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, display: 'block' }}>Telefon *</label>
                <input value={musteriTelefon} onChange={e => setMusteriTelefon(e.target.value)} placeholder="05XX XXX XX XX" style={S.input} type="tel" />
              </div>
              <button onClick={() => { setHata(''); setAdim(6); }} disabled={!musteriTelefon.trim()} style={{
                ...S.btn(!!musteriTelefon.trim()),
                opacity: musteriTelefon.trim() ? 1 : .5
              }}>
                Devam
              </button>
            </div>
          </div>
        )}

        {/* ── ADIM 6: Özet & Onayla ── */}
        {adim === 6 && (
          <div style={S.card}>
            <button onClick={() => setAdim(5)} style={S.backBtn}>← Geri</button>
            <div style={S.stepBadge}>Randevu Özeti</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {[
                ['Hizmet', secilenHizmet?.isim],
                ['Fiyat', `${secilenHizmet?.fiyat}₺`],
                secilenCalisan ? ['Uzman', secilenCalisan.isim] : null,
                ['Tarih', tarihFormat(secilenTarih)],
                ['Saat', secilenSaat],
                ['Ad Soyad', musteriIsim || '—'],
                ['Telefon', musteriTelefon],
              ].filter(Boolean).map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={randevuOlustur} disabled={yukleniyor} style={{
              ...S.btn(true),
              opacity: yukleniyor ? .6 : 1,
              boxShadow: `0 4px 14px ${renk}40`,
            }}>
              {yukleniyor ? 'Oluşturuluyor...' : 'Randevuyu Onayla'}
            </button>
          </div>
        )}

        {/* ── ADIM 7: Tamamlandı ── */}
        {adim === 7 && (
          <div style={{ ...S.card, textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: `${renk}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>
              ✓
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Randevunuz Alındı!</div>
            <div style={{ fontSize: 14, color: '#64748b', marginBottom: 20, lineHeight: 1.5 }}>
              {tarihFormat(secilenTarih)} saat {secilenSaat}'da {isletme?.isim} için randevunuz oluşturuldu.
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, textAlign: 'left', marginBottom: 16 }}>
              {[
                ['Hizmet', secilenHizmet?.isim],
                ['Tarih', tarihFormat(secilenTarih)],
                ['Saat', secilenSaat],
              ].map(([k, v], i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>{k}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{v}</span>
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()} style={S.btn(true)}>
              Yeni Randevu Al
            </button>
          </div>
        )}

        {/* Branding footer */}
        <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 12 }}>
          <a href="https://sırago.com" target="_blank" rel="noopener" style={{ color: '#94a3b8', textDecoration: 'none' }}>
            SıraGO ile randevu alın
          </a>
        </div>
      </div>
    </div>
  );
}
