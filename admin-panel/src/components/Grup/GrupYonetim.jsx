import { useEffect, useState } from 'react';

// Renk paleti — admin panel koyu temasıyla tam uyumlu
const C = {
  bg: '#0c0e14',
  card: '#141723',
  cardHover: '#1a1e2c',
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(139,92,246,0.3)',
  text: '#e4e7ef',
  dim: 'rgba(228,231,239,0.6)',
  muted: 'rgba(228,231,239,0.4)',
  primary: '#8B5CF6',
  primaryDim: 'rgba(139,92,246,0.12)',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
};

export default function GrupYonetim({ api, onSubeSec }) {
  const [aktifTab, setAktifTab] = useState('subeler');
  const [grup, setGrup] = useState(null);
  const [subeler, setSubeler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState(null);

  useEffect(() => { yukle(); }, []);

  async function yukle() {
    try {
      setYukleniyor(true);
      const d = await api.get('/grup');
      if (d && d.grup) {
        setGrup(d.grup);
        setSubeler(d.subeler || []);
        setHata(null);
      } else if (d && d.hata) {
        setHata(d.hata);
      }
    } catch (e) {
      setHata('Yüklenirken hata oluştu');
    } finally {
      setYukleniyor(false);
    }
  }

  if (yukleniyor) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>
        <div style={{ fontSize: 16 }}>Yükleniyor…</div>
      </div>
    );
  }

  // Grup yoksa → Grup kur ekranı
  if (!grup) return <GrupKur api={api} onOk={yukle} hata={hata} />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto' }}>
      {/* ═══ HERO — Grup başlık kartı ═══ */}
      <div style={{
        background: `linear-gradient(135deg, ${C.card} 0%, ${C.cardHover} 100%)`,
        border: `1px solid ${C.borderStrong}`,
        borderRadius: 16,
        padding: 28,
        marginBottom: 20,
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Dekoratif gradient overlay */}
        <div style={{
          position: 'absolute', top: -40, right: -40, width: 200, height: 200,
          background: `radial-gradient(circle, ${grup.renk_tema || C.primary}22, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', position: 'relative' }}>
          {/* Logo */}
          <div style={{
            width: 72, height: 72, borderRadius: 16,
            background: grup.logo ? `url(${grup.logo}) center/cover` : `linear-gradient(135deg, ${grup.renk_tema || C.primary}, #3B82F6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, fontWeight: 800, color: '#fff',
            boxShadow: `0 8px 32px ${grup.renk_tema || C.primary}33`,
            flexShrink: 0,
          }}>
            {!grup.logo && grup.isim?.[0]?.toUpperCase()}
          </div>

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                color: C.primary, background: C.primaryDim, padding: '3px 8px', borderRadius: 4,
              }}>Kurumsal Grup</span>
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: C.text }}>{grup.isim}</h1>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 4 }}>
              <code style={{ background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>/{grup.slug}</code>
              <span style={{ margin: '0 8px' }}>•</span>
              {subeler.length} şube
            </div>
          </div>

          {/* İstatistikler */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatMini label="Aktif Şube" deger={subeler.filter(s => s.aktif).length} renk={C.success} />
            <StatMini label="Pasif" deger={subeler.filter(s => !s.aktif).length} renk={C.muted} />
            <StatMini label="Bugün Randevu" deger={subeler.reduce((a, s) => a + (s.aktif_randevu || 0), 0)} renk={C.primary} />
          </div>
        </div>
      </div>

      {/* ═══ TAB MENÜ ═══ */}
      <div style={{
        display: 'flex', gap: 4, background: C.card, padding: 4,
        borderRadius: 10, border: `1px solid ${C.border}`, marginBottom: 20,
        width: 'fit-content',
      }}>
        {[
          { id: 'subeler', label: 'Şubeler', icon: '🏢' },
          { id: 'rapor', label: 'Raporlar', icon: '📊' },
          { id: 'ayar', label: 'Ayarlar', icon: '⚙️' },
        ].map(t => (
          <button key={t.id} onClick={() => setAktifTab(t.id)} style={{
            padding: '10px 18px', border: 'none', cursor: 'pointer',
            background: aktifTab === t.id ? C.primary : 'transparent',
            color: aktifTab === t.id ? '#fff' : C.dim,
            borderRadius: 6, fontWeight: 600, fontSize: 13,
            display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s',
          }}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ TAB İÇERİK ═══ */}
      {aktifTab === 'subeler' && <SubeListe api={api} subeler={subeler} onSubeSec={onSubeSec} onYenile={yukle} />}
      {aktifTab === 'rapor' && <GrupRapor api={api} />}
      {aktifTab === 'ayar' && <GrupAyar api={api} grup={grup} onGuncelle={yukle} />}
    </div>
  );
}

// ══════════════ MINI STAT ══════════════
function StatMini({ label, deger, renk }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderRadius: 10,
      border: `1px solid ${C.border}`, minWidth: 90,
    }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: renk, marginTop: 2 }}>{deger}</div>
    </div>
  );
}

// ══════════════ GRUP KUR ══════════════
function GrupKur({ api, onOk, hata: dishata }) {
  const [isim, setIsim] = useState('');
  const [slug, setSlug] = useState('');
  const [kurYukleniyor, setKurYukleniyor] = useState(false);
  const [hata, setHata] = useState(dishata || null);

  async function kur(e) {
    e.preventDefault();
    if (!isim.trim()) return setHata('Grup ismi zorunlu');
    setKurYukleniyor(true);
    setHata(null);
    try {
      const d = await api.post('/grup', { isim: isim.trim(), slug: slug.trim() || undefined });
      if (d.ok) {
        onOk();
      } else {
        setHata(d.hata || 'Bir hata oluştu');
      }
    } catch (e) {
      setHata('Bağlantı hatası');
    } finally {
      setKurYukleniyor(false);
    }
  }

  return (
    <div style={{ maxWidth: 560, margin: '40px auto' }}>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 16,
        padding: 32, boxShadow: '0 12px 48px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, margin: '0 auto 16px',
            background: `linear-gradient(135deg, ${C.primary}, #3B82F6)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 32, boxShadow: `0 12px 32px ${C.primary}44`,
          }}>🏢</div>
          <h2 style={{ margin: 0, color: C.text, fontSize: 22, fontWeight: 700 }}>Şube Grubu Kur</h2>
          <p style={{ color: C.dim, fontSize: 13, margin: '8px 0 0', lineHeight: 1.6 }}>
            Kurumsal paketteki zincir işletmeler için grup yönetimi.<br />
            Bu işletme ilk şube olarak gruba eklenecek.
          </p>
        </div>

        <form onSubmit={kur}>
          <Label>Grup İsmi</Label>
          <Input value={isim} onChange={e => setIsim(e.target.value)} placeholder="Örn: Güzellik Merkezi Zinciri" autoFocus />

          <Label>Grup Slug <span style={{ color: C.muted, fontWeight: 400 }}>(opsiyonel)</span></Label>
          <Input value={slug} onChange={e => setSlug(e.target.value)} placeholder="otomatik üretilecek" />

          {hata && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.danger}44`,
              color: C.danger, padding: 12, borderRadius: 8, fontSize: 13, marginTop: 12, marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>⚠️</span>{hata}
            </div>
          )}

          <button type="submit" disabled={kurYukleniyor} style={{
            width: '100%', padding: 14, marginTop: 16,
            background: kurYukleniyor ? C.muted : `linear-gradient(90deg, #3B82F6, ${C.primary})`,
            color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 15,
            cursor: kurYukleniyor ? 'not-allowed' : 'pointer',
            boxShadow: `0 8px 24px ${C.primary}33`,
          }}>
            {kurYukleniyor ? 'Kuruluyor…' : 'Grubu Kur'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ══════════════ ŞUBE LİSTESİ ══════════════
function SubeListe({ api, subeler, onSubeSec, onYenile }) {
  const [modalAcik, setModalAcik] = useState(false);
  const [duzenle, setDuzenle] = useState(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: C.text, fontSize: 18, fontWeight: 700 }}>Şubeleriniz</h3>
          <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>{subeler.length} şube</div>
        </div>
        <button onClick={() => { setDuzenle(null); setModalAcik(true); }} style={{
          padding: '10px 18px', background: `linear-gradient(90deg, #3B82F6, ${C.primary})`,
          color: '#fff', border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 13,
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: `0 6px 18px ${C.primary}33`,
        }}>
          <span style={{ fontSize: 16 }}>+</span> Yeni Şube
        </button>
      </div>

      {subeler.length === 0 ? (
        <EmptyState mesaj="Henüz şube eklenmemiş" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {subeler.map(s => (
            <SubeKart key={s.id} sube={s} api={api} onSubeSec={onSubeSec}
              onDuzenle={() => { setDuzenle(s); setModalAcik(true); }}
              onYenile={onYenile}
            />
          ))}
        </div>
      )}

      {modalAcik && (
        <SubeModal api={api} sube={duzenle} onKapat={() => setModalAcik(false)} onOk={() => { setModalAcik(false); onYenile(); }} />
      )}
    </div>
  );
}

// ══════════════ ŞUBE KART ══════════════
function SubeKart({ sube, api, onSubeSec, onDuzenle, onYenile }) {
  const [hover, setHover] = useState(false);

  async function sil() {
    if (!confirm(`"${sube.isim}" şubesini devre dışı bırakmak istiyor musunuz?`)) return;
    await api.delete(`/grup/sube/${sube.id}`);
    onYenile();
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover ? C.cardHover : C.card,
        border: `1px solid ${hover ? C.borderStrong : C.border}`,
        borderRadius: 14, padding: 18, transition: 'all .2s',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {!sube.aktif && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(239,68,68,0.15)', color: C.danger,
          padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
        }}>PASİF</div>
      )}

      <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 10,
          background: `linear-gradient(135deg, ${C.primary}, #3B82F6)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, fontWeight: 800, color: '#fff', flexShrink: 0,
        }}>{sube.isim?.[0]?.toUpperCase()}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: C.text, fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sube.isim}</div>
          {sube.sube_etiketi && (
            <div style={{ color: C.primary, fontSize: 11, fontWeight: 600, marginTop: 2 }}>{sube.sube_etiketi}</div>
          )}
          {(sube.sehir || sube.ilce) && (
            <div style={{ color: C.muted, fontSize: 12, marginTop: 2 }}>
              📍 {[sube.ilce, sube.sehir].filter(Boolean).join(', ')}
            </div>
          )}
        </div>
      </div>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '10px 12px',
        background: 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 12,
      }}>
        <div>
          <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Aktif Randevu</div>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 700 }}>{sube.aktif_randevu || 0}</div>
        </div>
        <div>
          <div style={{ color: C.muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Telefon</div>
          <div style={{ color: C.text, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {sube.telefon || '—'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => onSubeSec && onSubeSec(sube.id)} style={btnSm('primary')}>Panele Geç</button>
        <button onClick={onDuzenle} style={btnSm()}>Düzenle</button>
        <button onClick={sil} style={btnSm('danger')}>{sube.aktif ? 'Sil' : 'Sil'}</button>
      </div>
    </div>
  );
}

// ══════════════ ŞUBE MODAL (Ekle/Düzenle) ══════════════
function SubeModal({ api, sube, onKapat, onOk }) {
  const [form, setForm] = useState({
    isim: sube?.isim || '',
    sube_etiketi: sube?.sube_etiketi || '',
    telefon: sube?.telefon || '',
    sehir: sube?.sehir || '',
    ilce: sube?.ilce || '',
    adres: sube?.adres || '',
    mudur_isim: '',
    mudur_email: '',
    mudur_sifre: '',
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function kaydet(e) {
    e.preventDefault();
    if (!form.isim.trim()) return setHata('Şube ismi zorunlu');
    setKaydediliyor(true);
    setHata(null);
    try {
      const d = sube
        ? await api.put(`/grup/sube/${sube.id}`, form)
        : await api.post('/grup/sube', form);
      if (d.ok) onOk();
      else setHata(d.hata || 'Hata oluştu');
    } catch { setHata('Bağlantı hatası'); }
    finally { setKaydediliyor(false); }
  }

  return (
    <div onClick={onKapat} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: C.card, border: `1px solid ${C.borderStrong}`, borderRadius: 16,
        padding: 28, maxWidth: 560, width: '100%', maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, color: C.text, fontSize: 20, fontWeight: 700 }}>
            {sube ? 'Şubeyi Düzenle' : 'Yeni Şube Ekle'}
          </h3>
          <button onClick={onKapat} style={{
            background: 'transparent', border: 'none', color: C.dim, fontSize: 24, cursor: 'pointer',
            lineHeight: 1, padding: 4,
          }}>×</button>
        </div>

        <form onSubmit={kaydet}>
          <Label>Şube İsmi *</Label>
          <Input value={form.isim} onChange={e => set('isim', e.target.value)} autoFocus />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Şube Etiketi</Label>
              <Input value={form.sube_etiketi} onChange={e => set('sube_etiketi', e.target.value)} placeholder="Örn: Merkez, Ataşehir" />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input value={form.telefon} onChange={e => set('telefon', e.target.value)} placeholder="0555..." />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Şehir</Label>
              <Input value={form.sehir} onChange={e => set('sehir', e.target.value)} />
            </div>
            <div>
              <Label>İlçe</Label>
              <Input value={form.ilce} onChange={e => set('ilce', e.target.value)} />
            </div>
          </div>

          <Label>Adres</Label>
          <Input value={form.adres} onChange={e => set('adres', e.target.value)} />

          {!sube && (
            <>
              <div style={{
                margin: '20px 0 10px', padding: '10px 14px',
                background: C.primaryDim, borderRadius: 8, color: C.primary,
                fontSize: 12, fontWeight: 600,
              }}>👤 Şube Müdürü (opsiyonel — sonra da eklenebilir)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <Label>Müdür İsmi</Label>
                  <Input value={form.mudur_isim} onChange={e => set('mudur_isim', e.target.value)} />
                </div>
                <div>
                  <Label>Müdür Email</Label>
                  <Input type="email" value={form.mudur_email} onChange={e => set('mudur_email', e.target.value)} />
                </div>
              </div>
              <Label>Müdür Şifre</Label>
              <Input type="password" value={form.mudur_sifre} onChange={e => set('mudur_sifre', e.target.value)} />
            </>
          )}

          {hata && (
            <div style={{
              background: 'rgba(239,68,68,0.1)', border: `1px solid ${C.danger}44`,
              color: C.danger, padding: 10, borderRadius: 8, fontSize: 13, margin: '12px 0',
            }}>⚠️ {hata}</div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onKapat} style={{
              flex: 1, padding: 12, background: 'transparent', color: C.dim,
              border: `1px solid ${C.border}`, borderRadius: 10, cursor: 'pointer', fontWeight: 600,
            }}>Vazgeç</button>
            <button type="submit" disabled={kaydediliyor} style={{
              flex: 2, padding: 12, background: `linear-gradient(90deg, #3B82F6, ${C.primary})`,
              color: '#fff', border: 'none', borderRadius: 10, cursor: kaydediliyor ? 'wait' : 'pointer',
              fontWeight: 700, fontSize: 14,
            }}>
              {kaydediliyor ? 'Kaydediliyor…' : sube ? 'Güncelle' : 'Şube Ekle'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ══════════════ GRUP RAPOR ══════════════
function GrupRapor({ api }) {
  const [rapor, setRapor] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [baslangic, setBaslangic] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [bitis, setBitis] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => { yukle(); }, [baslangic, bitis]);
  async function yukle() {
    setYukleniyor(true);
    try {
      const d = await api.get(`/grup/raporlar?baslangic=${baslangic}&bitis=${bitis}`);
      // Hata veya eksik veri → güvenli default
      if (d && d.toplam && Array.isArray(d.subeler)) {
        setRapor(d);
      } else {
        setRapor({ toplam: { ciro: 0, randevu: 0, no_show: 0 }, subeler: [], top_calisan: [] });
      }
    } catch {
      setRapor({ toplam: { ciro: 0, randevu: 0, no_show: 0 }, subeler: [], top_calisan: [] });
    }
    setYukleniyor(false);
  }

  return (
    <div>
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20,
        background: C.card, padding: 14, borderRadius: 10, border: `1px solid ${C.border}`,
      }}>
        <span style={{ color: C.dim, fontSize: 13, fontWeight: 600 }}>Tarih Aralığı:</span>
        <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inpDate} />
        <span style={{ color: C.muted }}>→</span>
        <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={inpDate} />
      </div>

      {yukleniyor || !rapor ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.dim }}>Yükleniyor…</div>
      ) : (
        <>
          {/* KPI kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
            <Kpi label="Toplam Ciro" deger={`${Number(rapor.toplam.ciro).toLocaleString('tr-TR')} ₺`} renk={C.success} />
            <Kpi label="Toplam Randevu" deger={rapor.toplam.randevu} renk={C.primary} />
            <Kpi label="No-Show" deger={rapor.toplam.no_show} renk={C.danger} />
            <Kpi label="Ort. Ciro / Şube" deger={`${Math.round((rapor.toplam.ciro || 0) / Math.max(rapor.subeler.length, 1)).toLocaleString('tr-TR')} ₺`} renk={C.warning} />
          </div>

          {/* Şube tablosu */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
              Şube Performansı
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <Th>Şube</Th><Th align="right">Randevu</Th><Th align="right">Ciro</Th><Th align="right">No-Show</Th>
                </tr>
              </thead>
              <tbody>
                {rapor.subeler.map(s => (
                  <tr key={s.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <Td>
                      <div style={{ fontWeight: 600, color: C.text }}>{s.isim}</div>
                      {s.sube_etiketi && <div style={{ fontSize: 11, color: C.primary }}>{s.sube_etiketi}</div>}
                    </Td>
                    <Td align="right">{s.randevu_sayisi}</Td>
                    <Td align="right" style={{ color: C.success, fontWeight: 700 }}>{Number(s.ciro).toLocaleString('tr-TR')} ₺</Td>
                    <Td align="right" style={{ color: s.no_show > 0 ? C.danger : C.muted }}>{s.no_show}</Td>
                  </tr>
                ))}
                {rapor.subeler.length === 0 && (
                  <tr><Td colSpan={4}><div style={{ textAlign: 'center', padding: 20, color: C.muted }}>Veri yok</div></Td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Top çalışanlar */}
          {rapor.top_calisan?.length > 0 && (
            <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginTop: 20, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, fontWeight: 700, color: C.text }}>
                🏆 En İyi Çalışanlar
              </div>
              <div style={{ padding: 14, display: 'grid', gap: 8 }}>
                {rapor.top_calisan.map((c, i) => (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                    background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : C.muted,
                      color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.text, fontWeight: 600 }}>{c.isim}</div>
                      <div style={{ color: C.muted, fontSize: 11 }}>{c.sube} • {c.randevu_sayisi} randevu</div>
                    </div>
                    <div style={{ color: C.success, fontWeight: 700 }}>{Number(c.ciro).toLocaleString('tr-TR')} ₺</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, deger, renk }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: renk,
      }} />
      <div style={{ color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text, marginTop: 6 }}>{deger}</div>
    </div>
  );
}

// ══════════════ GRUP AYAR ══════════════
function GrupAyar({ api, grup, onGuncelle }) {
  const [form, setForm] = useState({
    isim: grup.isim, slug: grup.slug, logo: grup.logo || '',
    tanitim: grup.tanitim || '', renk_tema: grup.renk_tema || '#8B5CF6',
  });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  async function kaydet(e) {
    e.preventDefault();
    setKaydediliyor(true); setMesaj(null);
    try {
      const d = await api.put('/grup', form);
      if (d.ok) { setMesaj({ tip: 'ok', metin: 'Güncellendi' }); onGuncelle(); }
      else setMesaj({ tip: 'err', metin: d.hata });
    } catch { setMesaj({ tip: 'err', metin: 'Hata' }); }
    setKaydediliyor(false);
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24, maxWidth: 720 }}>
      <form onSubmit={kaydet}>
        <Label>Grup İsmi</Label>
        <Input value={form.isim} onChange={e => setForm({ ...form, isim: e.target.value })} />

        <Label>URL Slug</Label>
        <Input value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
        <div style={{ color: C.muted, fontSize: 11, marginTop: -6, marginBottom: 8 }}>
          Public grup sayfası: /g/{form.slug}
        </div>

        <Label>Logo URL</Label>
        <Input value={form.logo} onChange={e => setForm({ ...form, logo: e.target.value })} placeholder="https://..." />

        <Label>Tanıtım Metni</Label>
        <textarea value={form.tanitim} onChange={e => setForm({ ...form, tanitim: e.target.value })}
          rows={3} style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit' }} />

        <Label>Tema Rengi</Label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input type="color" value={form.renk_tema} onChange={e => setForm({ ...form, renk_tema: e.target.value })}
            style={{ width: 52, height: 40, border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer', background: 'transparent' }} />
          <code style={{ color: C.dim, fontSize: 13 }}>{form.renk_tema}</code>
        </div>

        {mesaj && (
          <div style={{
            marginTop: 14, padding: 10, borderRadius: 8, fontSize: 13,
            background: mesaj.tip === 'ok' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            color: mesaj.tip === 'ok' ? C.success : C.danger,
            border: `1px solid ${mesaj.tip === 'ok' ? C.success : C.danger}44`,
          }}>{mesaj.metin}</div>
        )}

        <button type="submit" disabled={kaydediliyor} style={{
          marginTop: 20, padding: '12px 28px', background: `linear-gradient(90deg, #3B82F6, ${C.primary})`,
          color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
        }}>{kaydediliyor ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</button>
      </form>
    </div>
  );
}

// ══════════════ YARDIMCI ══════════════
function EmptyState({ mesaj }) {
  return (
    <div style={{
      background: C.card, border: `1px dashed ${C.border}`, borderRadius: 12,
      padding: 48, textAlign: 'center', color: C.muted,
    }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🏢</div>
      <div style={{ fontSize: 14 }}>{mesaj}</div>
    </div>
  );
}

function Label({ children }) {
  return <label style={{ display: 'block', fontSize: 12, color: C.dim, marginBottom: 6, marginTop: 10, fontWeight: 600 }}>{children}</label>;
}

const inpStyle = {
  width: '100%', padding: '10px 12px',
  background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
  borderRadius: 8, color: C.text, fontSize: 14, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color .15s',
};

function Input(props) {
  return (
    <input {...props} style={{
      ...inpStyle,
      ...(props.style || {}),
    }}
      onFocus={e => e.target.style.borderColor = C.primary}
      onBlur={e => e.target.style.borderColor = C.border}
    />
  );
}

const inpDate = {
  ...inpStyle, width: 'auto', padding: '8px 10px', fontSize: 13,
  colorScheme: 'dark',
};

function btnSm(variant) {
  const base = {
    flex: 1, padding: '7px 10px', borderRadius: 7, border: 'none',
    fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .15s',
  };
  if (variant === 'primary') return { ...base, background: C.primary, color: '#fff' };
  if (variant === 'danger') return { ...base, background: 'rgba(239,68,68,0.1)', color: C.danger, border: `1px solid ${C.danger}33` };
  return { ...base, background: 'rgba(255,255,255,0.05)', color: C.dim };
}

function Th({ children, align = 'left' }) {
  return <th style={{ padding: '10px 16px', textAlign: align, fontSize: 11, color: C.muted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{children}</th>;
}

function Td({ children, align = 'left', style = {}, colSpan }) {
  return <td colSpan={colSpan} style={{ padding: '12px 16px', fontSize: 13, color: C.text, textAlign: align, ...style }}>{children}</td>;
}
