import { useState, useEffect } from 'react';

export default function Settings({ ayarlar, setAyarlar, paketDurum, api }) {
  const [kaydedildi, setKaydedildi] = useState(false);
  const [karaListe, setKaraListe] = useState([]);
  const [yeniKaraTelefon, setYeniKaraTelefon] = useState('');
  const [yeniKaraSebep, setYeniKaraSebep] = useState('manuel');

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

  const cardIcon = (emoji, color) => (
    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{emoji}</div>
  );
  const cardHeader = (emoji, title, color = "#8b5cf6") => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      {cardIcon(emoji, color)}
      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "var(--text)" }}>{title}</h3>
    </div>
  );

  return (
    <div className="settings-wrap">
      {kaydedildi && (
        <div className="alert alert-success mb-20">✓ Ayarlar kaydedildi</div>
      )}

      {/* 2 sütunlu grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

      <div className="settings-card">
        {cardHeader("🏢", "İşletme Bilgileri", "#3b82f6")}
        <div className="form-grid" style={{ gap: 16 }}>
          {[
            { label: "İşletme Adı", key: "isim" },
            { label: "Adres", key: "adres" },
          ].map(f => (
            <div key={f.key}>
              <label className="form-label">{f.label}</label>
              <input value={ayarlar[f.key] || ""} onChange={e => setAyarlar({...ayarlar, [f.key]: e.target.value})} className="input" />
            </div>
          ))}
        </div>
      </div>
      <div className="settings-card">
        {cardHeader("🕐", "Çalışma Saatleri", "#10b981")}
        <div className="form-grid" style={{ gap: 16 }}>
          <div>
            <label className="form-label">Açılış Saati</label>
            <input type="time" value={ayarlar.calisma_baslangic || "09:00"} onChange={e => setAyarlar({...ayarlar, calisma_baslangic: e.target.value})} className="input" />
          </div>
          <div>
            <label className="form-label">Kapanış Saati</label>
            <input type="time" value={ayarlar.calisma_bitis || "19:00"} onChange={e => setAyarlar({...ayarlar, calisma_bitis: e.target.value})} className="input" />
          </div>
        </div>
      </div>
      <div className="settings-card">
        {cardHeader("☕", "Mola / Kapalı Saatler", "#f59e0b")}
        <div style={{ color: "var(--dim)", fontSize: 12 }} className="mb-16">Bu saatlerde randevu alınamaz (yemek arası, özel işler, vs.)</div>
        {(ayarlar.mola_saatleri || []).map((mola, idx) => (
          <div key={idx} className="mola-row">
            <input value={mola.isim || ""} placeholder="Açıklama (ör: Yemek Arası)" onChange={e => {
              const yeni = [...(ayarlar.mola_saatleri || [])];
              yeni[idx] = { ...yeni[idx], isim: e.target.value };
              setAyarlar({...ayarlar, mola_saatleri: yeni});
            }} className="input flex-1" />
            <input type="time" value={mola.baslangic || ""} onChange={e => {
              const yeni = [...(ayarlar.mola_saatleri || [])];
              yeni[idx] = { ...yeni[idx], baslangic: e.target.value };
              setAyarlar({...ayarlar, mola_saatleri: yeni});
            }} className="input" style={{ width: 120 }} />
            <span className="mola-sep">—</span>
            <input type="time" value={mola.bitis || ""} onChange={e => {
              const yeni = [...(ayarlar.mola_saatleri || [])];
              yeni[idx] = { ...yeni[idx], bitis: e.target.value };
              setAyarlar({...ayarlar, mola_saatleri: yeni});
            }} className="input" style={{ width: 120 }} />
            <button onClick={() => {
              const yeni = (ayarlar.mola_saatleri || []).filter((_, i) => i !== idx);
              setAyarlar({...ayarlar, mola_saatleri: yeni});
            }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "1px solid rgba(239,68,68,.25)" }}>✕</button>
          </div>
        ))}
        <button onClick={() => {
          const yeni = [...(ayarlar.mola_saatleri || []), { isim: "", baslangic: "12:00", bitis: "13:00" }];
          setAyarlar({...ayarlar, mola_saatleri: yeni});
        }} className="btn btn-ghost btn-block" style={{ border: "1px dashed var(--border2)" }}>
          + Mola Ekle
        </button>
      </div>
      <div className="settings-card mb-24">
        {cardHeader("📅", "Kapalı Günler", "#ef4444")}
        <div className="row row-wrap gap-8">
          {[["0","Pazar"],["1","Pazartesi"],["2","Salı"],["3","Çarşamba"],["4","Perşembe"],["5","Cuma"],["6","Cumartesi"]].map(([v, l]) => {
            const kapalilar = String(ayarlar.kapali_gunler || "").split(",").map(s => s.trim()).filter(Boolean);
            const kapali = kapalilar.includes(v);
            return (
              <button key={v} onClick={() => {
                const yeni = kapali ? kapalilar.filter(k => k !== v) : [...kapalilar, v];
                setAyarlar({...ayarlar, kapali_gunler: yeni.join(",")});
              }} className={`day-btn ${kapali ? 'on' : 'off'}`}>
                {l}
              </button>
            );
          })}
        </div>
        <div style={{ color: "var(--dim)", fontSize: 12 }} className="mt-10">Seçilen günlerde randevu alınamaz</div>
      </div>
      <div className="settings-card">
        {cardHeader("💳", "Kapora / Ön Ödeme", "#10b981")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 16 }}>Aktif edildiğinde, kapora oranı belirlenmiş hizmetler için müşteriden ön ödeme istenir. Ödeme Shopier üzerinden alınır.</div>
        <div className="row gap-12" style={{ alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={!!ayarlar.kapora_aktif} onChange={async (e) => {
              const yeniDurum = e.target.checked;
              setAyarlar({...ayarlar, kapora_aktif: yeniDurum});
              await api.put("/kapora", { kapora_aktif: yeniDurum });
            }} style={{ accentColor: "var(--green)", width: 18, height: 18 }} />
            <span style={{ fontWeight: 600, color: ayarlar.kapora_aktif ? "var(--green)" : "var(--muted)" }}>
              {ayarlar.kapora_aktif ? "Kapora Sistemi Aktif" : "Kapora Sistemi Kapalı"}
            </span>
          </label>
        </div>
        <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 8 }}>Hizmetlerin kapora oranını Hizmetler sayfasından ayarlayabilirsiniz.</div>
      </div>

      {/* ── BOT KONUŞMA STİLİ ── */}
      <div className="settings-card">
        {cardHeader("🤖", "Bot Konuşma Stili", "#8b5cf6")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Botun müşterilerle nasıl konuşacağını belirler (DeepSeek cevapları buna göre şekillenir)</div>
        <div className="row gap-8 row-wrap">
          {[['samimi', 'Samimi'], ['resmi', 'Resmi'], ['kisa', 'Kısa']].map(([val, label]) => (
            <button key={val} onClick={() => setAyarlar({...ayarlar, bot_konusma_stili: val})}
              className={`day-btn ${(ayarlar.bot_konusma_stili || 'samimi') === val ? 'on' : 'off'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── RANDEVU MODU ── */}
      <div className="settings-card">
        {cardHeader("📋", "Randevu Modu", "#3b82f6")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Randevuların nasıl planlanacağını belirler</div>
        <select value={ayarlar.randevu_modu || 'sirali'} onChange={e => setAyarlar({...ayarlar, randevu_modu: e.target.value})} className="input" style={{ maxWidth: 300 }}>
          <option value="sirali">Sıralı (arka arkaya slot)</option>
          <option value="seans">Seans (grup randevu)</option>
          <option value="esnek">Esnek (müşteri saat seçer)</option>
        </select>
      </div>

      {/* ── ÇALIŞAN SEÇİMİ ── */}
      <div className="settings-card">
        {cardHeader("👥", "Çalışan Seçim Modu", "#6366f1")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Müşteri randevu alırken çalışan nasıl belirlenir</div>
        <select value={ayarlar.calisan_secim_modu || 'musteri'} onChange={e => setAyarlar({...ayarlar, calisan_secim_modu: e.target.value})} className="input" style={{ maxWidth: 300 }}>
          <option value="musteri">Müşteri Seçer</option>
          <option value="otomatik">Otomatik (Boş Slot Bazlı)</option>
          <option value="tek">Tek Çalışan (İlk Uygun)</option>
        </select>
      </div>

      {/* ── RANDEVU ONAY MODU ── */}
      <div className="settings-card">
        {cardHeader("✅", "Randevu Onay Modu", "#10b981")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Randevular otomatik mi onaylansın yoksa siz mi onaylayacaksınız</div>
        <div className="form-grid" style={{ gap: 16 }}>
          <div>
            <select value={ayarlar.randevu_onay_modu || 'otomatik'} onChange={e => setAyarlar({...ayarlar, randevu_onay_modu: e.target.value})} className="input">
              <option value="otomatik">Otomatik Onay</option>
              <option value="manuel">Manuel Onay</option>
            </select>
          </div>
          {(ayarlar.randevu_onay_modu === 'manuel') && (
            <div>
              <label className="form-label">Onay Süresi (dk)</label>
              <input type="number" min="5" max="120" value={ayarlar.onay_timeout_dk || 30} onChange={e => setAyarlar({...ayarlar, onay_timeout_dk: parseInt(e.target.value) || 30})} className="input" style={{ maxWidth: 120 }} />
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>Bu süre içinde onaylanmazsa randevu iptal olur</div>
            </div>
          )}
        </div>
      </div>

      {/* ── İPTAL SINIRI ── */}
      <div className="settings-card">
        {cardHeader("🚫", "İptal Sınırı", "#ef4444")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Müşteri randevuya en az kaç saat kala iptal edebilir (0 = sınır yok)</div>
        <input type="number" min="0" max="72" value={ayarlar.iptal_sinir_saat || 0} onChange={e => setAyarlar({...ayarlar, iptal_sinir_saat: parseInt(e.target.value) || 0})} className="input" style={{ maxWidth: 120 }} />
        <span style={{ marginLeft: 8, color: "var(--dim)", fontSize: 13 }}>saat</span>
      </div>

      {/* ── MESAİ DIŞI DAVRANIŞ ── */}
      <div className="settings-card">
        {cardHeader("🌙", "Mesai Dışı Davranış", "#64748b")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Çalışma saatleri dışında gelen mesajlara bot nasıl tepki versin</div>
        <select value={ayarlar.mesai_disi_mod || 'kapali_mesaj'} onChange={e => setAyarlar({...ayarlar, mesai_disi_mod: e.target.value})} className="input" style={{ maxWidth: 300 }}>
          <option value="kapali_mesaj">Kapalı Mesajı Gönder</option>
          <option value="sessiz">Sessiz (Cevap Verme)</option>
          <option value="randevu_ver">Normal Çalış (Randevu Al)</option>
        </select>
        {(ayarlar.mesai_disi_mod === 'kapali_mesaj' || !ayarlar.mesai_disi_mod) && (
          <div style={{ marginTop: 12 }}>
            <label className="form-label">Kapalı Mesajı (boş bırakılırsa varsayılan)</label>
            <textarea value={ayarlar.mesai_disi_mesaj || ''} onChange={e => setAyarlar({...ayarlar, mesai_disi_mesaj: e.target.value})}
              className="input" rows={2} placeholder="Şu an kapalıyız. Çalışma saatlerimiz: ..." style={{ width: '100%', resize: 'vertical' }} />
          </div>
        )}
      </div>

      </div>{/* grid kapanış */}

      {/* ── KARA LİSTE — tam genişlik ── */}
      <div className="settings-card" style={{ marginTop: 16 }}>
        {cardHeader("🛡️", "Kara Liste", "#ef4444")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Engellenen numaralar bota mesaj atsa bile cevap almaz</div>
        <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={!!ayarlar.kara_liste_otomatik} onChange={e => setAyarlar({...ayarlar, kara_liste_otomatik: e.target.checked})}
              style={{ accentColor: "var(--green)", width: 18, height: 18 }} />
            <span style={{ fontWeight: 600 }}>Otomatik No-Show Engelleme</span>
          </label>
          {!!ayarlar.kara_liste_otomatik && (
            <span style={{ color: "var(--dim)", fontSize: 12 }}>
              — <input type="number" min="1" max="10" value={ayarlar.kara_liste_ihlal_sinir || 3} onChange={e => setAyarlar({...ayarlar, kara_liste_ihlal_sinir: parseInt(e.target.value) || 3})}
                style={{ width: 50, textAlign: 'center' }} className="input" /> gelmedi = otomatik engel
            </span>
          )}
        </div>
        <div className="row gap-8 mb-12" style={{ flexWrap: 'wrap' }}>
          <input value={yeniKaraTelefon} onChange={e => setYeniKaraTelefon(e.target.value)} placeholder="Telefon (ör: 905551234567)" className="input" style={{ flex: 1, minWidth: 180 }} />
          <select value={yeniKaraSebep} onChange={e => setYeniKaraSebep(e.target.value)} className="input" style={{ width: 140 }}>
            <option value="manuel">Manuel</option>
            <option value="no_show">No-Show</option>
            <option value="kotu_davranis">Kötü Davranış</option>
            <option value="spam">Spam</option>
          </select>
          <button onClick={karaEkle} className="btn btn-primary btn-sm">+ Ekle</button>
        </div>
        {karaListe.length > 0 && (
          <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border2)', borderRadius: 8 }}>
            <table style={{ width: '100%', fontSize: 13 }}>
              <thead><tr style={{ background: 'var(--bg2)', position: 'sticky', top: 0 }}>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Telefon</th>
                <th style={{ padding: '6px 10px', textAlign: 'left' }}>Sebep</th>
                <th style={{ padding: '6px 10px', textAlign: 'center', width: 60 }}></th>
              </tr></thead>
              <tbody>
                {karaListe.map(k => (
                  <tr key={k.id} style={{ borderTop: '1px solid var(--border2)' }}>
                    <td style={{ padding: '6px 10px' }}>{k.telefon}</td>
                    <td style={{ padding: '6px 10px' }}><span style={{ background: 'var(--red-s)', color: 'var(--red)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>{k.sebep}</span></td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <button onClick={() => karaSil(k.id)} className="btn btn-sm" style={{ background: 'transparent', color: 'var(--red)', border: 'none', cursor: 'pointer' }}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {karaListe.length === 0 && <div style={{ color: "var(--dim)", fontSize: 12 }}>Henüz engelli numara yok</div>}
      </div>

      {/* ── ÇOKLU DİL ── */}
      <div className="settings-card">
        {cardHeader("🌐", "Bot Dilleri", "#0ea5e9")}
        <div style={{ color: "var(--dim)", fontSize: 12, marginBottom: 12 }}>Bot hangi dillerde cevap verebilsin</div>
        <div className="row gap-8 row-wrap">
          {[['tr', 'Türkçe'], ['en', 'English'], ['ar', 'العربية']].map(([kod, label]) => {
            const diller = (ayarlar.bot_diller || 'tr').split(',').map(s => s.trim()).filter(Boolean);
            const aktif = diller.includes(kod);
            return (
              <button key={kod} onClick={() => {
                const yeni = aktif ? diller.filter(d => d !== kod) : [...diller, kod];
                if (yeni.length === 0) return;
                setAyarlar({...ayarlar, bot_diller: yeni.join(',')});
              }} className={`day-btn ${aktif ? 'on' : 'off'}`}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <button onClick={kaydet} className="btn btn-primary btn-lg" style={{ marginTop: 16 }}>
        Kaydet
      </button>
    </div>
  );
}
