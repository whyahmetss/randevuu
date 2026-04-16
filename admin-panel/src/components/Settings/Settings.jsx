import { useState, useEffect } from 'react';

export default function Settings({ ayarlar, setAyarlar, paketDurum, api }) {
  const [kaydedildi, setKaydedildi] = useState(false);
  const [karaListe, setKaraListe] = useState([]);
  const [yeniKaraTelefon, setYeniKaraTelefon] = useState('');
  const [yeniKaraSebep, setYeniKaraSebep] = useState('manuel');
  const [slugKopyalandi, setSlugKopyalandi] = useState(false);

  useEffect(() => {
    api.get("/kara-liste").then(r => { if (r?.karaListe) setKaraListe(r.karaListe); });
  }, []);

  const kaydet = async () => {
    await api.put("/ayarlar", ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const karaEkle = async () => {
    if (!yeniKaraTelefon.trim()) return;
    const r = await api.post("/kara-liste", { telefon: yeniKaraTelefon.trim(), sebep: yeniKaraSebep });
    if (r?.kayit) {
      setKaraListe(prev => [r.kayit, ...prev.filter(k => k.id !== r.kayit.id)]);
      setYeniKaraTelefon('');
    }
  };

  const karaSil = async (id) => {
    await api.del(`/kara-liste/${id}`);
    setKaraListe(prev => prev.filter(k => k.id !== id));
  };

  if (!ayarlar) {
    return (
      <div className="row gap-10" style={{ color: "var(--dim)", padding: 40 }}>
        <span>⏳</span> Yükleniyor...
      </div>
    );
  }

  /* ── Reusable card helpers ── */
  const S = {
    card: {
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16,
      padding: "24px 26px", boxShadow: "0 1px 4px rgba(22,5,39,.05)", position: "relative",
      overflow: "hidden", transition: "box-shadow .2s, border-color .2s",
    },
    iconWrap: (color) => ({
      width: 40, height: 40, borderRadius: 12, background: `${color}14`,
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, flexShrink: 0,
    }),
    title: { margin: 0, fontSize: 15, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.2px" },
    desc: { color: "var(--dim)", fontSize: 12, lineHeight: 1.5 },
    section: { borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 16 },
    sectionLabel: { fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 10 },
  };

  const CardHead = ({ emoji, title, color = "#8b5cf6", desc }) => (
    <div style={{ marginBottom: desc ? 12 : 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: desc ? 6 : 0 }}>
        <div style={S.iconWrap(color)}>{emoji}</div>
        <h3 style={S.title}>{title}</h3>
      </div>
      {desc && <div style={{ ...S.desc, marginLeft: 52 }}>{desc}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Kaydet banner */}
      {kaydedildi && (
        <div style={{ background: "rgba(84,224,151,.1)", border: "1px solid rgba(84,224,151,.25)", borderRadius: 14, padding: "14px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#2cb872" }}>Ayarlar kaydedildi</span>
        </div>
      )}

      {/* ═══════════════  ROW 1: İşletme + Çalışma Saatleri + Mola  ═══════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }} className="settings-grid-3">
        {/* İşletme Bilgileri */}
        <div style={S.card}>
          <CardHead emoji="🏢" title="İşletme Bilgileri" color="#3b82f6" />
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[{ label: "İşletme Adı", key: "isim" }, { label: "Adres", key: "adres" }].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>{f.label}</label>
                <input value={ayarlar[f.key] || ""} onChange={e => setAyarlar({...ayarlar, [f.key]: e.target.value})} className="input" />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>Kategori</label>
              <select value={ayarlar.kategori || "genel"} onChange={e => setAyarlar({...ayarlar, kategori: e.target.value})} className="input" style={{ width: "100%" }}>
                {[
                  ["berber", "💈 Berber"],
                  ["kuafor", "✂️ Kuaför"],
                  ["guzellik", "💅 Güzellik Salonu"],
                  ["spa", "🧖 Spa & Masaj"],
                  ["disci", "🦷 Diş Kliniği"],
                  ["veteriner", "🐾 Veteriner"],
                  ["diyetisyen", "🥗 Diyetisyen"],
                  ["psikolog", "🧠 Psikolog"],
                  ["fizyoterapi", "🏥 Fizyoterapi"],
                  ["restoran", "🍽️ Restoran"],
                  ["cafe", "☕ Kafe"],
                  ["spor", "🏋️ Spor Salonu"],
                  ["egitim", "📚 Eğitim / Kurs"],
                  ["foto", "📸 Fotoğraf Stüdyosu"],
                  ["dovme", "🎨 Dövme / Piercing"],
                  ["oto", "🚗 Oto Yıkama / Servis"],
                  ["hukuk", "⚖️ Hukuk / Danışmanlık"],
                  ["genel", "🏢 Genel / Diğer"],
                ].map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Çalışma Saatleri */}
        <div style={S.card}>
          <CardHead emoji="🕐" title="Çalışma Saatleri" color="#10b981" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>Açılış</label>
              <input type="time" value={ayarlar.calisma_baslangic || "09:00"} onChange={e => setAyarlar({...ayarlar, calisma_baslangic: e.target.value})} className="input" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>Kapanış</label>
              <input type="time" value={ayarlar.calisma_bitis || "19:00"} onChange={e => setAyarlar({...ayarlar, calisma_bitis: e.target.value})} className="input" />
            </div>
          </div>
          {/* Kapalı Günler */}
          <div style={S.section}>
            <div style={S.sectionLabel}>Kapalı Günler</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[["0","Paz"],["1","Pzt"],["2","Sal"],["3","Çar"],["4","Per"],["5","Cum"],["6","Cmt"]].map(([v, l]) => {
                const kapalilar = String(ayarlar.kapali_gunler || "").split(",").map(s => s.trim()).filter(Boolean);
                const kapali = kapalilar.includes(v);
                return (
                  <button key={v} onClick={() => {
                    const yeni = kapali ? kapalilar.filter(k => k !== v) : [...kapalilar, v];
                    setAyarlar({...ayarlar, kapali_gunler: yeni.join(",")});
                  }} className={`day-btn ${kapali ? 'on' : 'off'}`} style={{ padding: "6px 12px", fontSize: 12 }}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Mola Saatleri */}
        <div style={S.card}>
          <CardHead emoji="☕" title="Mola Saatleri" color="#f59e0b" desc="Bu saatlerde randevu alınamaz" />
          {(ayarlar.mola_saatleri || []).map((mola, idx) => (
            <div key={idx} className="mola-row">
              <input value={mola.isim || ""} placeholder="Yemek Arası" onChange={e => {
                const yeni = [...(ayarlar.mola_saatleri || [])];
                yeni[idx] = { ...yeni[idx], isim: e.target.value };
                setAyarlar({...ayarlar, mola_saatleri: yeni});
              }} className="input flex-1" />
              <input type="time" value={mola.baslangic || ""} onChange={e => {
                const yeni = [...(ayarlar.mola_saatleri || [])];
                yeni[idx] = { ...yeni[idx], baslangic: e.target.value };
                setAyarlar({...ayarlar, mola_saatleri: yeni});
              }} className="input" style={{ width: 100 }} />
              <span style={{ color: "var(--dim)", fontSize: 12 }}>—</span>
              <input type="time" value={mola.bitis || ""} onChange={e => {
                const yeni = [...(ayarlar.mola_saatleri || [])];
                yeni[idx] = { ...yeni[idx], bitis: e.target.value };
                setAyarlar({...ayarlar, mola_saatleri: yeni});
              }} className="input" style={{ width: 100 }} />
              <button onClick={() => {
                const yeni = (ayarlar.mola_saatleri || []).filter((_, i) => i !== idx);
                setAyarlar({...ayarlar, mola_saatleri: yeni});
              }} style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
            </div>
          ))}
          <button onClick={() => {
            const yeni = [...(ayarlar.mola_saatleri || []), { isim: "", baslangic: "12:00", bitis: "13:00" }];
            setAyarlar({...ayarlar, mola_saatleri: yeni});
          }} style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px dashed var(--border)", background: "transparent", color: "var(--muted)", fontWeight: 600, fontSize: 12, cursor: "pointer", marginTop: 4 }}>
            + Mola Ekle
          </button>
        </div>
      </div>

      {/* Tampon & Slot Ayarları */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={S.card}>
          <CardHead emoji="⏳" title="Varsayılan Tampon Süre" color="#8b5cf6" desc="Randevular arası hazırlık/temizlik süresi" />
          <select value={ayarlar.varsayilan_tampon_dk || 5} onChange={e => setAyarlar({...ayarlar, varsayilan_tampon_dk: parseInt(e.target.value)})} className="input" style={{ width: "100%" }}>
            <option value={0}>Tampon yok (0 dk)</option>
            <option value={5}>5 dakika</option>
            <option value={10}>10 dakika</option>
            <option value={15}>15 dakika</option>
            <option value={20}>20 dakika</option>
            <option value={30}>30 dakika</option>
          </select>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Hizmet bazlı tampon ayarlanmamışsa bu değer kullanılır</div>
        </div>
        <div style={S.card}>
          <CardHead emoji="🔲" title="Slot Aralığı" color="#06b6d4" desc="Randevu saatleri arasındaki temel aralık" />
          <select value={ayarlar.slot_aralik_dk || 30} onChange={e => setAyarlar({...ayarlar, slot_aralik_dk: parseInt(e.target.value)})} className="input" style={{ width: "100%" }}>
            <option value={10}>10 dakika</option>
            <option value={15}>15 dakika</option>
            <option value={20}>20 dakika</option>
            <option value={30}>30 dakika</option>
            <option value={60}>60 dakika</option>
          </select>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Müşteriye sunulan saat seçenekleri bu aralıkta oluşturulur</div>
        </div>
      </div>

      {/* ═══════════════  ROW 2: Randevu Ayarları (3 kart)  ═══════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }} className="settings-grid-3">
        {/* Randevu Modu */}
        <div style={S.card}>
          <CardHead emoji="📋" title="Randevu Modu" color="#3b82f6" desc="Randevuların nasıl planlanacağını belirler" />
          <select value={ayarlar.randevu_modu || 'sirali'} onChange={e => setAyarlar({...ayarlar, randevu_modu: e.target.value})} className="input" style={{ width: "100%" }}>
            <option value="sirali">Sıralı (arka arkaya slot)</option>
            <option value="seans">Seans (grup randevu)</option>
            <option value="esnek">Esnek (müşteri saat seçer)</option>
          </select>
        </div>

        {/* Çalışan Seçim */}
        <div style={S.card}>
          <CardHead emoji="👥" title="Çalışan Seçimi" color="#6366f1" desc="Müşteri randevu alırken çalışan nasıl belirlenir" />
          <select value={ayarlar.calisan_secim_modu || 'musteri'} onChange={e => setAyarlar({...ayarlar, calisan_secim_modu: e.target.value})} className="input" style={{ width: "100%" }}>
            <option value="musteri">Müşteri Seçer</option>
            <option value="otomatik">Otomatik (Boş Slot Bazlı)</option>
            <option value="tek">Tek Çalışan (İlk Uygun)</option>
          </select>
        </div>

        {/* Randevu Onay */}
        <div style={S.card}>
          <CardHead emoji="✅" title="Randevu Onay Modu" color="#10b981" desc="Otomatik onay mı, yoksa siz mi onaylayacaksınız" />
          <select value={ayarlar.randevu_onay_modu || 'otomatik'} onChange={e => setAyarlar({...ayarlar, randevu_onay_modu: e.target.value})} className="input" style={{ width: "100%", marginBottom: (ayarlar.randevu_onay_modu === 'manuel') ? 12 : 0 }}>
            <option value="otomatik">Otomatik Onay</option>
            <option value="manuel">Manuel Onay</option>
          </select>
          {(ayarlar.randevu_onay_modu === 'manuel') && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" min="5" max="120" value={ayarlar.onay_timeout_dk || 30} onChange={e => setAyarlar({...ayarlar, onay_timeout_dk: parseInt(e.target.value) || 30})} className="input" style={{ width: 80 }} />
              <span style={{ color: "var(--dim)", fontSize: 12 }}>dk — süre dolarsa iptal olur</span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════  ROW 3: AI & Bot Yapılandırması (Konuşma Stili + Mesai Dışı)  ═══════════════ */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <CardHead emoji="🤖" title="AI & Bot Yapılandırması" color="#8b5cf6" desc="Botun konuşma stili ve mesai dışı davranışı" />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }} className="settings-grid-2">
          {/* Konuşma Stili */}
          <div>
            <div style={S.sectionLabel}>Konuşma Stili</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[['samimi', '😊 Samimi'], ['resmi', '👔 Resmi'], ['kisa', '⚡ Kısa']].map(([val, label]) => (
                <button key={val} onClick={() => setAyarlar({...ayarlar, bot_konusma_stili: val})}
                  style={{
                    flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 700, textAlign: "center", transition: "all .2s",
                    background: (ayarlar.bot_konusma_stili || 'samimi') === val ? "rgba(139,92,246,.12)" : "var(--surface2)",
                    color: (ayarlar.bot_konusma_stili || 'samimi') === val ? "#8b5cf6" : "var(--dim)",
                    outline: (ayarlar.bot_konusma_stili || 'samimi') === val ? "2px solid rgba(139,92,246,.3)" : "1px solid var(--border)",
                  }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Mesai Dışı */}
          <div>
            <div style={S.sectionLabel}>Mesai Dışı Davranış</div>
            <select value={ayarlar.mesai_disi_mod || 'kapali_mesaj'} onChange={e => setAyarlar({...ayarlar, mesai_disi_mod: e.target.value})} className="input" style={{ width: "100%", marginBottom: 8 }}>
              <option value="kapali_mesaj">Kapalı Mesajı Gönder</option>
              <option value="sessiz">Sessiz (Cevap Verme)</option>
              <option value="randevu_ver">Normal Çalış (Randevu Al)</option>
            </select>
            {(ayarlar.mesai_disi_mod === 'kapali_mesaj' || !ayarlar.mesai_disi_mod) && (
              <textarea value={ayarlar.mesai_disi_mesaj || ''} onChange={e => setAyarlar({...ayarlar, mesai_disi_mesaj: e.target.value})}
                className="input" rows={2} placeholder="Şu an kapalıyız. Çalışma saatlerimiz: ..." style={{ width: '100%', resize: 'vertical', fontSize: 12 }} />
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════  ROW 3.5: Online Randevu Linki  ═══════════════ */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <CardHead emoji="🔗" title="Online Randevu Linki" color="#10b981" desc="Müşterileriniz bu link ile doğrudan randevu alabilir" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>Slug (URL Kısaltması)</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--dim)", whiteSpace: "nowrap" }}>{window.location.origin}/book/</span>
              <input
                value={ayarlar.slug || ""}
                onChange={e => setAyarlar({...ayarlar, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 50)})}
                className="input"
                placeholder="isletme-adi"
                style={{ flex: 1, fontWeight: 700 }}
              />
            </div>
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Sadece küçük harf, rakam ve tire (-) kullanabilirsiniz</div>
          </div>
          {ayarlar.slug && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{
                flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(16,185,129,.06)",
                border: "1px solid rgba(16,185,129,.15)", fontSize: 13, fontWeight: 600,
                color: "#10b981", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>
                {window.location.origin}/book/{ayarlar.slug}
              </div>
              <button onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/book/${ayarlar.slug}`);
                setSlugKopyalandi(true);
                setTimeout(() => setSlugKopyalandi(false), 2000);
              }} style={{
                padding: "10px 18px", borderRadius: 10, border: "none",
                background: slugKopyalandi ? "#10b981" : "rgba(16,185,129,.1)",
                color: slugKopyalandi ? "#fff" : "#10b981",
                fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap",
                transition: "all .2s", fontFamily: "inherit",
              }}>
                {slugKopyalandi ? "Kopyalandı!" : "Kopyala"}
              </button>
              <a href={`${window.location.origin}/book/${ayarlar.slug}`} target="_blank" rel="noopener noreferrer" style={{
                padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)",
                fontWeight: 700, fontSize: 12, cursor: "pointer", textDecoration: "none", whiteSpace: "nowrap",
              }}>
                Önizle
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════════  ROW 4: Kara Liste + Bot Dilleri (yan yana) ═══════════════ */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }} className="settings-grid-2">
        {/* Kara Liste */}
        <div style={S.card}>
          <CardHead emoji="🛡️" title="Kara Liste" color="#ef4444" desc="Engellenen numaralar bota mesaj atsa bile cevap almaz" />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!ayarlar.kara_liste_otomatik} onChange={e => setAyarlar({...ayarlar, kara_liste_otomatik: e.target.checked})}
                style={{ accentColor: "#ef4444", width: 16, height: 16 }} />
              <span style={{ fontWeight: 600, fontSize: 13 }}>Otomatik No-Show Engelleme</span>
            </label>
            {!!ayarlar.kara_liste_otomatik && (
              <span style={{ color: "var(--dim)", fontSize: 12 }}>
                — <input type="number" min="1" max="10" value={ayarlar.kara_liste_ihlal_sinir || 3} onChange={e => setAyarlar({...ayarlar, kara_liste_ihlal_sinir: parseInt(e.target.value) || 3})}
                  style={{ width: 46, textAlign: 'center' }} className="input" /> gelmedi = engel
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            <input value={yeniKaraTelefon} onChange={e => setYeniKaraTelefon(e.target.value)} placeholder="905551234567" className="input" style={{ flex: 1, minWidth: 160 }} />
            <select value={yeniKaraSebep} onChange={e => setYeniKaraSebep(e.target.value)} className="input" style={{ width: 130 }}>
              <option value="manuel">Manuel</option>
              <option value="no_show">No-Show</option>
              <option value="kotu_davranis">Kötü Davranış</option>
              <option value="spam">Spam</option>
            </select>
            <button onClick={karaEkle} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>+ Ekle</button>
          </div>
          {karaListe.length > 0 ? (
            <div style={{ maxHeight: 200, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Telefon</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px' }}>Sebep</th>
                  <th style={{ padding: '8px 12px', width: 50 }}></th>
                </tr></thead>
                <tbody>
                  {karaListe.map(k => (
                    <tr key={k.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>{k.telefon}</td>
                      <td style={{ padding: '8px 12px' }}><span style={{ background: 'rgba(239,68,68,.08)', color: '#ef4444', padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700 }}>{k.sebep}</span></td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button onClick={() => karaSil(k.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>Henüz engelli numara yok</div>
          )}
        </div>

        {/* Bot Dilleri + İptal Sınırı + Kapora (sağ kolon) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={S.card}>
            <CardHead emoji="🌐" title="Bot Dilleri" color="#0ea5e9" desc="Bot hangi dillerde cevap verebilsin" />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {[['tr', '🇹🇷 Türkçe'], ['en', '🇬🇧 English'], ['ar', '🇸🇦 العربية']].map(([kod, label]) => {
                const diller = (ayarlar.bot_diller || 'tr').split(',').map(s => s.trim()).filter(Boolean);
                const aktif = diller.includes(kod);
                return (
                  <button key={kod} onClick={() => {
                    const yeni = aktif ? diller.filter(d => d !== kod) : [...diller, kod];
                    if (yeni.length === 0) return;
                    setAyarlar({...ayarlar, bot_diller: yeni.join(',')});
                  }} style={{
                    flex: 1, padding: "10px 8px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontSize: 13, fontWeight: 700, textAlign: "center", transition: "all .2s",
                    background: aktif ? "rgba(14,165,233,.1)" : "var(--surface2)",
                    color: aktif ? "#0ea5e9" : "var(--dim)",
                    outline: aktif ? "2px solid rgba(14,165,233,.25)" : "1px solid var(--border)",
                  }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={S.card}>
            <CardHead emoji="🚫" title="İptal Sınırı" color="#ef4444" />
            <div style={S.desc}>Müşteri randevuya en az kaç saat kala iptal edebilir</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <input type="number" min="0" max="72" value={ayarlar.iptal_sinir_saat || 0} onChange={e => setAyarlar({...ayarlar, iptal_sinir_saat: parseInt(e.target.value) || 0})} className="input" style={{ width: 80, textAlign: "center", fontSize: 16, fontWeight: 800 }} />
              <span style={{ color: "var(--dim)", fontSize: 13, fontWeight: 600 }}>saat</span>
            </div>
            <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 6 }}>0 = sınır yok</div>
          </div>
          <div style={S.card}>
            <CardHead emoji="💳" title="Kapora / Ön Ödeme" color="#10b981" />
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
              <input type="checkbox" checked={!!ayarlar.kapora_aktif} onChange={async (e) => {
                const yeniDurum = e.target.checked;
                setAyarlar({...ayarlar, kapora_aktif: yeniDurum});
                await api.put("/kapora", { kapora_aktif: yeniDurum });
              }} style={{ accentColor: "#10b981", width: 18, height: 18 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: ayarlar.kapora_aktif ? "#10b981" : "var(--dim)" }}>
                {ayarlar.kapora_aktif ? "Aktif" : "Kapalı"}
              </span>
            </label>
            <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 8 }}>Kapora oranını Hizmetler sayfasından ayarlayın.</div>
          </div>
        </div>
      </div>

      {/* ═══════════════  Bildirim Tercihleri  ═══════════════ */}
      <div style={S.card}>
        <CardHead emoji="🔔" title="Bildirim Tercihleri" color="#f59e0b" desc="Hangi kanallardan bildirim almak istersiniz?" />
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
          {[
            { key: 'bildirim_panel', label: 'Panel Bildirimi', desc: 'Zil ikonu + sayaç', varsayilan: true },
            { key: 'bildirim_whatsapp', label: 'WhatsApp', desc: 'Telefona WhatsApp mesajı', varsayilan: true },
            { key: 'bildirim_sms', label: 'SMS', desc: 'NetGSM ile SMS (ücretli)', varsayilan: false },
          ].map(k => (
            <label key={k.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", cursor: "pointer" }}>
              <input type="checkbox" checked={ayarlar[k.key] !== undefined ? !!ayarlar[k.key] : k.varsayilan} onChange={async (e) => {
                setAyarlar({ ...ayarlar, [k.key]: e.target.checked });
                await api.put("/bildirim-tercihleri", { [k.key]: e.target.checked });
              }} style={{ accentColor: "#f59e0b", width: 18, height: 18 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{k.label}</div>
                <div style={{ fontSize: 11, color: "var(--dim)" }}>{k.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ═══════════════  Akıllı Özellikler  ═══════════════ */}
      <div style={S.card}>
        <CardHead emoji="🤖" title="Akıllı Özellikler" color="#8b5cf6" desc="Bot ve hatırlatma otomasyonları" />
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {/* Hatırlatma Zinciri */}
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", cursor: "pointer" }}>
            <input type="checkbox" checked={ayarlar.hatirlatma_zinciri_aktif !== false} onChange={e => setAyarlar({...ayarlar, hatirlatma_zinciri_aktif: e.target.checked})}
              style={{ accentColor: "#8b5cf6", width: 18, height: 18 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>⏰ Hatırlatma Zinciri (24h + 1h + 15dk)</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Randevudan 24 saat, 1 saat ve 15 dakika önce WhatsApp hatırlatma gönderir.</div>
            </div>
          </label>
          {/* Haftalık Rapor */}
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", cursor: "pointer" }}>
            <input type="checkbox" checked={!!ayarlar.haftalik_rapor_aktif} onChange={e => setAyarlar({...ayarlar, haftalik_rapor_aktif: e.target.checked})}
              style={{ accentColor: "#8b5cf6", width: 18, height: 18 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>📊 Haftalık Rapor</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Her Pazartesi 09:00'da WhatsApp'tan haftalık özet rapor alın.</div>
            </div>
          </label>
          {/* Otomatik Rebook */}
          <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, background: "var(--surface2)", cursor: "pointer" }}>
            <input type="checkbox" checked={ayarlar.rebook_aktif !== false} onChange={e => setAyarlar({...ayarlar, rebook_aktif: e.target.checked})}
              style={{ accentColor: "#8b5cf6", width: 18, height: 18 }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>📅 Otomatik Rebook</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>Randevu tamamlandıktan 2 saat sonra tekrar randevu teklifi gönderir. (2 haftada 1 max)</div>
            </div>
          </label>
        </div>
      </div>

      {/* ═══════════════  Kaydet Butonu  ═══════════════ */}
      <button onClick={kaydet} style={{
        width: "100%", padding: "16px", borderRadius: 14, border: "none",
        background: "linear-gradient(135deg, #54E097 0%, #2cb872 100%)",
        color: "#fff", fontWeight: 800, fontSize: 16, cursor: "pointer",
        boxShadow: "0 4px 16px rgba(84,224,151,.3)", transition: "all .2s",
        fontFamily: "inherit", letterSpacing: "-0.3px",
      }}
      onMouseOver={e => e.currentTarget.style.transform = "translateY(-1px)"}
      onMouseOut={e => e.currentTarget.style.transform = "translateY(0)"}>
        💾 Değişiklikleri Kaydet
      </button>
    </div>
  );
}
