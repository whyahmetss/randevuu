import { useState, useEffect, useCallback, useRef } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import logoIcon from "./assets/logo1.png";
import logoFull from "./assets/logo2.png";
import Settings from "./components/Settings/Settings";
import Kasa from "./components/Kasa/Kasa";
import SmsAyarlari from "./components/Settings/SmsAyarlari";
import GeceRaporu from "./components/Settings/GeceRaporu";
import YorumAvcisi from "./components/Settings/YorumAvcisi";
import Winback from "./components/Winback/Winback";
import Sadakat from "./components/Sadakat/Sadakat";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

const API_URL = import.meta.env.VITE_API_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000/api' : 'https://randevugo-api.onrender.com/api');

const api = {
  token: localStorage.getItem("randevugo_token"),

  async fetch(endpoint, options = {}) {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...options.headers,
      },
    });
    if (res.status === 401) {
      this.token = null;
      localStorage.removeItem("randevugo_token");
      window.location.reload();
    }
    if (res.status === 403) {
      const data = await res.json();
      if (data.pasif) {
        alert("İşletmeniz pasif duruma alınmıştır. Lütfen destek ile iletişime geçin.");
        this.token = null;
        localStorage.removeItem("randevugo_token");
        window.location.reload();
        return data;
      }
      return data;
    }
    if (res.status === 402) {
      window.dispatchEvent(new CustomEvent("odeme-gerekli"));
      const data = await res.json();
      return { ...data, _odemeGerekli: true };
    }
    return res.json();
  },

  get: (e) => api.fetch(e),
  post: (e, d) => api.fetch(e, { method: "POST", body: JSON.stringify(d) }),
  put: (e, d) => api.fetch(e, { method: "PUT", body: JSON.stringify(d) }),
  del: (e) => api.fetch(e, { method: "DELETE" }),
};

function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [sifre, setSifre] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [ekran, setEkran] = useState("giris"); // giris | kayit
  const [kayitForm, setKayitForm] = useState({ isletmeAdi: "", email: "", sifre: "", sifreTekrar: "" });

  const giris = async (e) => {
    e.preventDefault();
    setYukleniyor(true);
    setHata("");
    const data = await api.post("/auth/giris", { email, sifre });
    if (data.token) {
      api.token = data.token;
      localStorage.setItem("randevugo_token", data.token);
      onLogin(data.kullanici);
    } else {
      setHata(data.hata || "Giriş başarısız");
    }
    setYukleniyor(false);
  };

  const kayitOl = async (e) => {
    e.preventDefault();
    setHata("");
    if (!kayitForm.isletmeAdi || !kayitForm.email || !kayitForm.sifre) return setHata("Tüm alanları doldurun");
    if (kayitForm.sifre.length < 6) return setHata("Şifre en az 6 karakter olmalı");
    if (kayitForm.sifre !== kayitForm.sifreTekrar) return setHata("Şifreler eşleşmiyor");
    setYukleniyor(true);
    const data = await api.post("/auth/kayit", { isletmeAdi: kayitForm.isletmeAdi, email: kayitForm.email, sifre: kayitForm.sifre, kayitKanal: "web" });
    if (data.basarili) {
      setHata("");
      setEkran("giris");
      setEmail(kayitForm.email);
      setSifre("");
      alert("✅ Hesabınız oluşturuldu! Şimdi giriş yapabilirsiniz.");
    } else {
      setHata(data.hata || "Kayıt başarısız");
    }
    setYukleniyor(false);
  };

  const WP_NUMARA = "905379681840";
  const TG_BOT = "siragoapp_bot";

  const heroPanel = (
    <div className="login-hero">
      <div className="login-hero-glow g1" />
      <div className="login-hero-glow g2" />
      <img
        src="/login.jpg"
        alt="AI Robot"
        className="login-hero-img"
      />
      <div className="login-hero-overlay">
        <h2>SıraGO'ya <span>Hoş Geldiniz</span></h2>
        <p>Yapay zeka destekli randevu yönetimi ile işinizi bir üst seviyeye taşıyın.</p>
      </div>
      <div className="login-hero-features">
        <div className="feat-chip">WhatsApp Bot</div>
        <div className="feat-chip">Otomatik Hatırlatma</div>
        <div className="feat-chip">Kapora Sistemi</div>
        <div className="feat-chip">Kara Liste</div>
        <div className="feat-chip">Anlık Analitik</div>
      </div>
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-form-panel">
        <div className="login-form-logo">
          <img src={logoIcon} alt="SıraGO" />
          <span>SıraGO</span>
        </div>
        <div className="login-card">
          <div className="login-title">{ekran === "giris" ? "Hoş Geldiniz" : "Hesap Oluştur"}</div>
          <div className="login-subtitle">{ekran === "giris" ? "Panele erişmek için giriş yapın" : "Ücretsiz deneyin, kredi kartı gerekmez"}</div>

          <div className="login-tabs">
            <button className={`login-tab${ekran === "giris" ? " active" : ""}`} onClick={() => { setEkran("giris"); setHata(""); }}>Giriş Yap</button>
            <button className={`login-tab${ekran === "kayit" ? " active" : ""}`} onClick={() => { setEkran("kayit"); setHata(""); }}>Kayıt Ol</button>
          </div>

          {ekran === "giris" ? (
            <form onSubmit={giris}>
              <div className="form-group">
                <label className="form-label">E-posta</label>
                <input type="email" placeholder="ornek@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
              </div>
              <div className="form-group">
                <label className="form-label">Şifre</label>
                <input type="password" placeholder="••••••••" value={sifre} onChange={(e) => setSifre(e.target.value)} className="input" />
              </div>
              {hata && <div className="alert alert-error">{hata}</div>}
              <button type="submit" disabled={yukleniyor} className="login-btn-primary">
                {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={kayitOl}>
                <div className="form-group">
                  <label className="form-label">İşletme Adı</label>
                  <input type="text" placeholder="Örn: Ali Kuaför" value={kayitForm.isletmeAdi} onChange={e => setKayitForm(p => ({ ...p, isletmeAdi: e.target.value }))} className="input" />
                </div>
                <div className="form-group">
                  <label className="form-label">E-posta</label>
                  <input type="email" placeholder="ornek@email.com" value={kayitForm.email} onChange={e => setKayitForm(p => ({ ...p, email: e.target.value }))} className="input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Şifre</label>
                  <input type="password" placeholder="En az 6 karakter" value={kayitForm.sifre} onChange={e => setKayitForm(p => ({ ...p, sifre: e.target.value }))} className="input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Şifre Tekrar</label>
                  <input type="password" placeholder="••••••••" value={kayitForm.sifreTekrar} onChange={e => setKayitForm(p => ({ ...p, sifreTekrar: e.target.value }))} className="input" />
                </div>
                {hata && <div className="alert alert-error">{hata}</div>}
                <button type="submit" disabled={yukleniyor} className="login-btn-primary">
                  {yukleniyor ? "Hesap oluşturuluyor..." : "Ücretsiz Hesap Oluştur"}
                </button>
              </form>

              <div className="login-divider"><span>veya hızlı kayıt</span></div>

              <a href={`https://wa.me/${WP_NUMARA}?text=${encodeURIComponent("kayıt")}`} target="_blank" rel="noopener noreferrer" className="login-alt-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                WhatsApp ile Kayıt Ol
              </a>
              <a href={`https://t.me/${TG_BOT}?start=kayit`} target="_blank" rel="noopener noreferrer" className="login-alt-btn">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#0088cc"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.012-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                Telegram ile Kayıt Ol
              </a>
            </>
          )}
        </div>
      </div>
      {heroPanel}
    </div>
  );
}

// ==================== HİZMETLER SAYFASI ====================
function HizmetlerSayfasi({ hizmetler, yukle, paketDurum }) {
  const [formAcik, setFormAcik] = useState(false);
  const [form, setForm] = useState({ isim: "", isim_en: "", isim_ar: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "", kapora_yuzdesi: "0" });
  const [hata, setHata] = useState("");

  const ekle = async (e) => {
    e.preventDefault();
    setHata("");
    const res = await api.post("/hizmetler", { isim: form.isim, isim_en: form.isim_en || null, isim_ar: form.isim_ar || null, sure_dk: parseInt(form.sure_dk), fiyat: parseFloat(form.fiyat), aciklama: form.aciklama, emoji: form.emoji, kapora_yuzdesi: parseInt(form.kapora_yuzdesi) || 0 });
    if (res.hata) { setHata(res.hata); return; }
    setForm({ isim: "", isim_en: "", isim_ar: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "", kapora_yuzdesi: "0" });
    setFormAcik(false);
    yukle();
  };

  const sil = async (id) => {
    if (!confirm("Bu hizmeti silmek istediğinize emin misiniz?")) return;
    await api.del(`/hizmetler/${id}`);
    yukle();
  };

  const limit = paketDurum?.paket_bilgi?.hizmet_limit || 5;
  const kullanimYuzde = paketDurum ? Math.round(hizmetler.length / limit * 100) : 0;

  return (
    <>
      <div className="ph-row">
        <h1>Hizmetler ({hizmetler.length})</h1>
        <div className="ph-meta">
          {paketDurum && (
            <span className="ph-count" style={{ color: kullanimYuzde >= 90 ? "var(--red)" : "var(--dim)" }}>
              {hizmetler.length}/{limit >= 999 ? "∞" : limit} kullanıldı
            </span>
          )}
          <button onClick={() => setFormAcik(!formAcik)} className="btn btn-primary">+ Yeni Hizmet</button>
        </div>
      </div>

      {formAcik && (
        <form onSubmit={ekle} className="form-card card-accent-green">
          <h3 className="green">Yeni Hizmet Ekle</h3>
          {hata && <div className="alert alert-error">{hata}</div>}
          <div className="form-grid">
            <div className="full row gap-12">
              <div style={{ width: 70, flexShrink: 0 }}>
                <label className="form-label">Emoji</label>
                <input placeholder="🦷" maxLength={4} value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})} className="input" style={{ textAlign: "center", fontSize: 20 }} />
              </div>
              <div className="flex-1">
                <label className="form-label">Hizmet Adı *</label>
                <input placeholder="Saç Kesimi" required value={form.isim} onChange={e => setForm({...form, isim: e.target.value})} className="input" />
              </div>
            </div>
            <div>
              <label className="form-label">🇬🇧 English Name</label>
              <input placeholder="Haircut" value={form.isim_en} onChange={e => setForm({...form, isim_en: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">🇸🇦 اسم الخدمة</label>
              <input placeholder="قص شعر" value={form.isim_ar} onChange={e => setForm({...form, isim_ar: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">Süre (dakika)</label>
              <input type="number" placeholder="30" value={form.sure_dk} onChange={e => setForm({...form, sure_dk: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">Fiyat (₺) *</label>
              <input type="number" placeholder="150" required value={form.fiyat} onChange={e => setForm({...form, fiyat: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">Kapora Oranı (%)</label>
              <input type="number" min="0" max="100" placeholder="0" value={form.kapora_yuzdesi} onChange={e => setForm({...form, kapora_yuzdesi: e.target.value})} className="input" />
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>0 = kapora yok. Ör: %20 → 150₺ hizmetten 30₺ kapora</div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Kaydet</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); }} className="btn btn-ghost">İptal</button>
          </div>
        </form>
      )}

      {hizmetler.length === 0 ? (
        <div className="list-empty"><p>Henüz hizmet eklenmemiş.</p></div>
      ) : hizmetler.map(h => (
        <div key={h.id} className="list-item">
          <div className="row gap-12">
            <div>
              <span className="list-item-name">{h.emoji ? `${h.emoji} ` : ''}{h.isim}</span>
              {h.isim_en && <span style={{ color: "var(--dim)", marginLeft: 6, fontSize: 11 }}>🇬🇧{h.isim_en}</span>}
              {h.isim_ar && <span style={{ color: "var(--dim)", marginLeft: 6, fontSize: 11 }}>🇸🇦{h.isim_ar}</span>}
              {!h.aktif && <span style={{ color: "var(--red)", marginLeft: 8, fontSize: 12 }}>(Pasif)</span>}
            </div>
            <span className="tag-sm" style={{ background: "var(--bg)", color: "var(--muted)" }}>⏱ {h.sure_dk} dk</span>
            <span className="tag-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", fontWeight: 700 }}>{h.fiyat} ₺</span>
            {h.kapora_yuzdesi > 0 && <span className="tag-sm" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)", fontWeight: 600 }}>💳 %{h.kapora_yuzdesi} kapora</span>}
          </div>
          <button onClick={() => sil(h.id)} title="Sil" style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, color: "var(--muted)", transition: "all .2s" }} onMouseOver={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "var(--red-s)"; }} onMouseOut={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
        </div>
      ))}
    </>
  );
}

// ==================== ÇALIŞANLAR SAYFASI ====================
function CalisanlarSayfasi({ paketDurum }) {
  const [calisanlar, setCalisanlar] = useState([]);
  const [formAcik, setFormAcik] = useState(false);
  const [form, setForm] = useState({ isim: "", telefon: "", uzmanlik: "", calisma_baslangic: "", calisma_bitis: "", kapali_gunler: "", mola_saatleri: [] });
  const [hata, setHata] = useState("");
  const [duzenle, setDuzenle] = useState(null); // düzenlenen çalışan ID
  const [hizmetModal, setHizmetModal] = useState(null); // hizmet atama modal
  const [hizmetListesi, setHizmetListesi] = useState([]);

  const yukle = async () => {
    const d = await api.get("/calisanlar");
    setCalisanlar(d.calisanlar || []);
  };

  useEffect(() => { yukle(); }, []);

  const formSifirla = () => ({ isim: "", telefon: "", uzmanlik: "", calisma_baslangic: "", calisma_bitis: "", kapali_gunler: "", mola_saatleri: [] });

  const ekle = async (e) => {
    e.preventDefault();
    setHata("");
    const gonder = { ...form, mola_saatleri: form.mola_saatleri || [] };
    const res = duzenle
      ? await api.put(`/calisanlar/${duzenle}`, { ...gonder, aktif: true })
      : await api.post("/calisanlar", gonder);
    if (res.hata) { setHata(res.hata); return; }
    setForm(formSifirla());
    setFormAcik(false);
    setDuzenle(null);
    yukle();
  };

  const sil = async (id) => {
    if (!confirm("Bu çalışanı silmek istediğinize emin misiniz?")) return;
    await api.del(`/calisanlar/${id}`);
    yukle();
  };

  const duzenleBasla = (c) => {
    const molalar = typeof c.mola_saatleri === 'string' ? JSON.parse(c.mola_saatleri || '[]') : (c.mola_saatleri || []);
    setForm({
      isim: c.isim || "", telefon: c.telefon || "", uzmanlik: c.uzmanlik || "",
      calisma_baslangic: c.calisma_baslangic ? String(c.calisma_baslangic).substring(0, 5) : "",
      calisma_bitis: c.calisma_bitis ? String(c.calisma_bitis).substring(0, 5) : "",
      kapali_gunler: c.kapali_gunler || "",
      mola_saatleri: molalar
    });
    setDuzenle(c.id);
    setFormAcik(true);
  };

  const hizmetAtamaAc = async (calisanId) => {
    const d = await api.get(`/calisanlar/${calisanId}/hizmetler`);
    setHizmetListesi(d.hizmetler || []);
    setHizmetModal(calisanId);
  };

  const hizmetAtamaKaydet = async () => {
    const secili = hizmetListesi.filter(h => h.atanmis).map(h => h.id);
    await api.put(`/calisanlar/${hizmetModal}/hizmetler`, { hizmet_idler: secili });
    setHizmetModal(null);
  };

  const limit = paketDurum?.paket_bilgi?.calisan_limit || 1;
  const gunler = [["0","Paz"],["1","Pzt"],["2","Sal"],["3","Çar"],["4","Per"],["5","Cum"],["6","Cmt"]];

  return (
    <>
      <div className="ph-row">
        <h1>Çalışanlar ({calisanlar.length})</h1>
        <div className="ph-meta">
          {paketDurum && (
            <span className="ph-count" style={{ color: calisanlar.length >= limit ? "var(--red)" : "var(--dim)" }}>
              {calisanlar.length}/{limit >= 999 ? "∞" : limit} kullanıldı
            </span>
          )}
          <button onClick={() => { setForm(formSifirla()); setDuzenle(null); setFormAcik(!formAcik); }} className="btn btn-primary">+ Yeni Çalışan</button>
        </div>
      </div>

      {formAcik && (
        <form onSubmit={ekle} className="form-card card-accent-green">
          <h3 className="green">{duzenle ? "Çalışan Düzenle" : "Yeni Çalışan Ekle"}</h3>
          {hata && <div className="alert alert-error">{hata}</div>}
          <div className="form-grid">
            <div>
              <label className="form-label">Ad Soyad *</label>
              <input placeholder="Ali Usta" required value={form.isim} onChange={e => setForm({...form, isim: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">Telefon</label>
              <input placeholder="05551234567" value={form.telefon} onChange={e => setForm({...form, telefon: e.target.value})} className="input" />
            </div>
            <div className="full">
              <label className="form-label">Uzmanlık (virgülle ayır)</label>
              <input placeholder="sac_kesimi, sakal, cilt_bakimi" value={form.uzmanlik} onChange={e => setForm({...form, uzmanlik: e.target.value})} className="input" />
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border2)", margin: "16px 0", paddingTop: 16 }}>
            <h4 style={{ marginBottom: 12, color: "var(--text)", fontSize: 14 }}>Mesai Saatleri <span style={{ color: "var(--dim)", fontWeight: 400, fontSize: 12 }}>(boş = işletme varsayılanı)</span></h4>
            <div className="form-grid" style={{ gap: 12 }}>
              <div>
                <label className="form-label">Başlangıç</label>
                <input type="time" value={form.calisma_baslangic} onChange={e => setForm({...form, calisma_baslangic: e.target.value})} className="input" />
              </div>
              <div>
                <label className="form-label">Bitiş</label>
                <input type="time" value={form.calisma_bitis} onChange={e => setForm({...form, calisma_bitis: e.target.value})} className="input" />
              </div>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border2)", margin: "16px 0", paddingTop: 16 }}>
            <h4 style={{ marginBottom: 12, color: "var(--text)", fontSize: 14 }}>Kapalı Günler</h4>
            <div className="row row-wrap gap-8">
              {gunler.map(([v, l]) => {
                const kapalilar = String(form.kapali_gunler || "").split(",").map(s => s.trim()).filter(Boolean);
                const kapali = kapalilar.includes(v);
                return (
                  <button key={v} type="button" onClick={() => {
                    const yeni = kapali ? kapalilar.filter(k => k !== v) : [...kapalilar, v];
                    setForm({...form, kapali_gunler: yeni.join(",")});
                  }} className={`day-btn ${kapali ? 'on' : 'off'}`} style={{ padding: "6px 12px", fontSize: 12 }}>
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border2)", margin: "16px 0", paddingTop: 16 }}>
            <h4 style={{ marginBottom: 12, color: "var(--text)", fontSize: 14 }}>Mola Saatleri</h4>
            {(form.mola_saatleri || []).map((mola, idx) => (
              <div key={idx} className="mola-row">
                <input value={mola.isim || ""} placeholder="Yemek Arası" onChange={e => {
                  const yeni = [...(form.mola_saatleri || [])];
                  yeni[idx] = { ...yeni[idx], isim: e.target.value };
                  setForm({...form, mola_saatleri: yeni});
                }} className="input flex-1" />
                <input type="time" value={mola.baslangic || ""} onChange={e => {
                  const yeni = [...(form.mola_saatleri || [])];
                  yeni[idx] = { ...yeni[idx], baslangic: e.target.value };
                  setForm({...form, mola_saatleri: yeni});
                }} className="input" style={{ width: 110 }} />
                <span style={{ color: "var(--dim)" }}>—</span>
                <input type="time" value={mola.bitis || ""} onChange={e => {
                  const yeni = [...(form.mola_saatleri || [])];
                  yeni[idx] = { ...yeni[idx], bitis: e.target.value };
                  setForm({...form, mola_saatleri: yeni});
                }} className="input" style={{ width: 110 }} />
                <button type="button" onClick={() => {
                  const yeni = (form.mola_saatleri || []).filter((_, i) => i !== idx);
                  setForm({...form, mola_saatleri: yeni});
                }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "1px solid rgba(239,68,68,.25)" }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => {
              const yeni = [...(form.mola_saatleri || []), { isim: "", baslangic: "12:00", bitis: "13:00" }];
              setForm({...form, mola_saatleri: yeni});
            }} className="btn btn-ghost btn-block" style={{ border: "1px dashed var(--border2)", fontSize: 12 }}>
              + Mola Ekle
            </button>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary">{duzenle ? "Güncelle" : "Kaydet"}</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); setDuzenle(null); }} className="btn btn-ghost">İptal</button>
          </div>
        </form>
      )}

      {calisanlar.length === 0 ? (
        <div className="list-empty"><p>Henüz çalışan eklenmemiş.</p></div>
      ) : calisanlar.map(c => (
        <div key={c.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="list-item-name">{c.isim}</span>
              {c.telefon && <span className="list-item-sub" style={{ display: "inline" }}>📞 {c.telefon}</span>}
              {(c.ay_randevu > 0) && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 8, background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontSize: 10, fontWeight: 700 }}>
                  ⭐ {c.ay_randevu} randevu · {c.ay_ciro}₺
                </span>
              )}
            </div>
            <div className="row gap-8">
              <span className="tag" style={{ background: (c.aktif === false) ? "var(--red-s)" : "rgba(16,185,129,.12)", color: (c.aktif === false) ? "var(--red)" : "var(--green)" }}>
                {(c.aktif === false) ? "Pasif" : "Aktif"}
              </span>
              <button onClick={() => hizmetAtamaAc(c.id)} title="Hizmet Ata" className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}>🔗 Hizmetler</button>
              <button onClick={() => duzenleBasla(c)} title="Düzenle" className="btn btn-sm btn-ghost" style={{ fontSize: 11 }}>✏️</button>
              <button onClick={() => sil(c.id)} title="Sil" style={{ background: "none", border: "none", cursor: "pointer", padding: 6, borderRadius: 8, color: "var(--muted)", transition: "all .2s" }} onMouseOver={e => { e.currentTarget.style.color = "var(--red)"; e.currentTarget.style.background = "var(--red-s)"; }} onMouseOut={e => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "none"; }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>
          </div>
          <div className="row gap-8" style={{ flexWrap: "wrap" }}>
            {c.uzmanlik && c.uzmanlik.split(",").map(u => (
              <span key={u} className="tag-sm" style={{ background: "var(--bg)", color: "var(--muted)" }}>{u.trim()}</span>
            ))}
            {c.calisma_baslangic && <span className="tag-sm" style={{ background: "rgba(59,130,246,.1)", color: "var(--blue)" }}>🕐 {String(c.calisma_baslangic).substring(0,5)} - {String(c.calisma_bitis || '').substring(0,5)}</span>}
            {c.kapali_gunler && <span className="tag-sm" style={{ background: "rgba(239,68,68,.1)", color: "var(--red)" }}>Kapalı: {c.kapali_gunler.split(",").filter(Boolean).map(g => gunler.find(gl => gl[0] === g)?.[1] || g).join(", ")}</span>}
          </div>
        </div>
      ))}

      {/* Hizmet Atama Modal */}
      {hizmetModal && (
        <div onClick={() => setHizmetModal(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>Hizmet Ataması</h2>
              <button onClick={() => setHizmetModal(null)} className="modal-close">✕</button>
            </div>
            <div style={{ padding: "16px 20px", color: "var(--dim)", fontSize: 12 }}>
              Bu çalışanın yapabileceği hizmetleri seçin. Hiçbiri seçilmezse tüm hizmetlere atanır.
            </div>
            <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {hizmetListesi.map(h => (
                <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 8, background: h.atanmis ? "rgba(16,185,129,.08)" : "var(--bg)", border: `1px solid ${h.atanmis ? "rgba(16,185,129,.3)" : "var(--border2)"}`, transition: "all .2s" }}>
                  <input type="checkbox" checked={h.atanmis} onChange={() => {
                    setHizmetListesi(hizmetListesi.map(hh => hh.id === h.id ? { ...hh, atanmis: !hh.atanmis } : hh));
                  }} style={{ accentColor: "var(--green)" }} />
                  <span style={{ fontSize: 14 }}>{h.emoji ? h.emoji + ' ' : ''}{h.isim}</span>
                </label>
              ))}
              {hizmetListesi.length === 0 && <div style={{ color: "var(--dim)", fontSize: 13 }}>Henüz hizmet eklenmemiş.</div>}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border2)", display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setHizmetModal(null)} className="btn btn-ghost">İptal</button>
              <button onClick={hizmetAtamaKaydet} className="btn btn-primary">Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== BOT BAĞLANTI SAYFASI ====================
function BotBaglantiSayfasi() {
  const [aktifTab, setAktifTab] = useState("whatsapp");

  // WhatsApp Web QR state
  const [wpDurum, setWpDurum] = useState(null); // baslatilmadi | baslatiyor | qr_bekleniyor | bagli | bagli_degil | hata
  const [wpQr, setWpQr] = useState(null);
  const [wpNo, setWpNo] = useState(null);
  const [wpYukleniyor, setWpYukleniyor] = useState(false);

  // Telegram state
  const [tgToken, setTgToken] = useState("");
  const [tgYukleniyor, setTgYukleniyor] = useState(false);
  const [tgSonuc, setTgSonuc] = useState(null);
  const [tgBagli, setTgBagli] = useState(false);

  const btnCls = (renk, disabled) => ({ padding: "10px 22px", borderRadius: 10, border: "none", background: disabled ? "var(--surface3)" : renk, color: disabled ? "var(--dim)" : "#fff", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 });

  // WhatsApp: polling ile QR durumu
  useEffect(() => {
    if (aktifTab !== "whatsapp") return;
    const yokla = async () => {
      try {
        const d = await api.get("/bot/wp/durum");
        if (d && !d.hata) {
          setWpDurum(d.durum || "baslatilmadi");
          setWpQr(d.qrBase64 || null);
          setWpNo(d.whatsapp_no || null);
        }
      } catch {}
    };
    yokla();
    const interval = setInterval(yokla, 2000);
    return () => clearInterval(interval);
  }, [aktifTab]);

  // Telegram: mevcut durumu yükle
  useEffect(() => {
    api.get("/bot/durum").then(d => setTgBagli(!!d.telegram_bagli));
  }, []);

  const wpBaslat = async () => {
    setWpYukleniyor(true);
    setWpDurum("baslatiyor");
    await api.post("/bot/wp/baslat", {});
    setWpYukleniyor(false);
  };

  const wpAyir = async () => {
    setWpYukleniyor(true);
    await api.post("/bot/wp/ayir", {});
    setWpDurum("bagli_degil"); setWpQr(null); setWpNo(null);
    setWpYukleniyor(false);
  };

  const telegramBagla = async () => {
    if (!tgToken.trim()) return;
    setTgYukleniyor(true); setTgSonuc(null);
    const d = await api.post("/bot/telegram/bagla", { token: tgToken.trim() });
    if (d.hata) setTgSonuc({ hata: true, mesaj: d.hata });
    else { setTgSonuc({ hata: false, mesaj: `✅ Bağlandı! @${d.bot_isim}` }); setTgToken(""); setTgBagli(true); }
    setTgYukleniyor(false);
  };

  const telegramAyir = async () => {
    setTgYukleniyor(true);
    await api.post("/bot/telegram/ayir", {});
    setTgBagli(false); setTgSonuc({ hata: false, mesaj: "Bot ayrıldı." });
    setTgYukleniyor(false);
  };

  return (
    <div className="chat-wrap">
      <div className="conn-grid">
        {[
          { ikon: "💬", baslik: "WhatsApp", bagli: wpDurum === "bagli", detay: wpDurum === "bagli" ? (wpNo ? `+${wpNo}` : "Bağlı") : wpDurum === "qr_bekleniyor" ? "QR bekleniyor..." : "Bağlı değil" },
          { ikon: "✈️", baslik: "Telegram", bagli: tgBagli, detay: tgBagli ? "Bot aktif" : "Bağlı değil" },
        ].map(k => (
          <div key={k.baslik} className={`conn-card${k.bagli ? ' connected' : ''}`}>
            <div className={`conn-icon ${k.bagli ? 'on' : 'off'}`}>{k.ikon}</div>
            <div className="flex-1">
              <div className="conn-label">{k.baslik}</div>
              <div className="conn-sub">{k.detay}</div>
            </div>
            <span className={`conn-status ${k.bagli ? 'on' : 'off'}`}>
              {k.bagli ? "● AKTİF" : "● PASİF"}
            </span>
          </div>
        ))}
      </div>

      <div className="tab-bar">
        {[{ id: "whatsapp", label: "💬 WhatsApp" }, { id: "telegram", label: "✈️ Telegram" }].map(t => (
          <button key={t.id} onClick={() => setAktifTab(t.id)} className={`tab-btn${aktifTab === t.id ? ' active' : ''}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aktifTab === "whatsapp" && (
        <div className="card">
          {(!wpDurum || wpDurum === "baslatilmadi" || wpDurum === "bagli_degil") && (
            <div className="text-center">
              <div style={{ fontSize: 56 }} className="mb-16">💬</div>
              <h3 className="mb-10" style={{ fontSize: 18, fontWeight: 700 }}>WhatsApp'ı Bağla</h3>
              <p className="mb-24" style={{ color: "var(--dim)", fontSize: 14, lineHeight: 1.6 }}>
                Kendi WhatsApp numaranı bota bağla. Müşterilerin sana WhatsApp'tan yazınca bot otomatik cevap verir.
              </p>
              <div className="step-list">
                {["Aşağıdaki butona tıkla","QR kod çıkacak, WhatsApp'ı aç","WhatsApp → Bağlantılı Cihazlar → Cihaz Ekle","QR kodu tara, bağlandı!"].map((s, i) => (
                  <div key={i} className="step-item">
                    <div className="step-num green">{i+1}</div>
                    <span className="step-text">{s}</span>
                  </div>
                ))}
              </div>
              <button onClick={wpBaslat} disabled={wpYukleniyor} style={btnCls("#25D366", wpYukleniyor)}>
                {wpYukleniyor ? "Başlatılıyor..." : "📱 QR Kodu Göster"}
              </button>
            </div>
          )}

          {(wpDurum === "baslatiyor" || wpDurum === "qr_bekleniyor") && (
            <div className="text-center">
              <h3 className="mb-6" style={{ fontSize: 17, fontWeight: 700 }}>📱 WhatsApp ile Tara</h3>
              <p className="mb-20" style={{ color: "var(--dim)", fontSize: 13 }}>
                WhatsApp → Bağlantılı Cihazlar → Cihaz Ekle → QR kodu tara
              </p>
              {wpQr ? (
                <div className="qr-box"><img src={wpQr} alt="QR" /></div>
              ) : (
                <div className="qr-placeholder"><div style={{ color: "var(--dim)", fontSize: 13 }}>QR yükleniyor...</div></div>
              )}
              <p className="mt-16" style={{ color: "var(--dim)", fontSize: 12 }}>QR kod 60 saniyede geçersiz olur.</p>
              <button onClick={wpAyir} className="btn btn-ghost mt-12">İptal</button>
            </div>
          )}

          {wpDurum === "bagli" && (
            <div className="text-center">
              <div style={{ fontSize: 56 }} className="mb-12">✅</div>
              <h3 className="mb-8" style={{ fontSize: 18, fontWeight: 700, color: "var(--green)" }}>WhatsApp Bağlı!</h3>
              {wpNo && <p className="mb-8" style={{ color: "var(--dim)", fontSize: 14 }}>Numara: <strong style={{ color: "var(--text)" }}>+{wpNo}</strong></p>}
              <p className="mb-24" style={{ color: "var(--dim)", fontSize: 13 }}>
                Müşterileriniz bu numaraya WhatsApp'tan yazdığında bot otomatik olarak yanıt verecek.
              </p>
              <button onClick={wpAyir} disabled={wpYukleniyor} style={btnCls("var(--red)", wpYukleniyor)}>
                {wpYukleniyor ? "Ayrılıyor..." : "🔌 Bağlantıyı Kes"}
              </button>
            </div>
          )}

          {wpDurum === "hata" && (
            <div className="text-center">
              <div style={{ fontSize: 48 }} className="mb-12">❌</div>
              <p style={{ color: "var(--red)" }} className="mb-16">Bağlantı hatası oluştu.</p>
              <button onClick={wpBaslat} style={btnCls("#25D366", false)}>Tekrar Dene</button>
            </div>
          )}
        </div>
      )}

      {aktifTab === "telegram" && (
        <div className="flex-col gap-16">
          <div className="card">
            <h3 className="mb-16" style={{ fontSize: 15, fontWeight: 700 }}>📖 Telegram Botu Nasıl Oluşturulur?</h3>
            {["Telegram'da @BotFather'ı aç ve /newbot yaz",'Bot ismi gir (örn: "Berber Ali Randevu")','Kullanıcı adı gir, sonu "bot" bitmeli (örn: berberalirndvbot)',"BotFather bir Token verecek → kopyala","Token'ı aşağıya yapıştır → Bağla"].map((s, i) => (
              <div key={i} className="step-item">
                <div className="step-num blue">{i+1}</div>
                <span className="step-text">{s}</span>
              </div>
            ))}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="btn btn-sm mt-8" style={{ background: "#229ED9", color: "#fff", textDecoration: "none", display: "inline-flex" }}>
              ✈️ BotFather'ı Aç
            </a>
          </div>

          <div className="card">
            {tgBagli ? (
              <div>
                <div className="alert alert-success mb-16">✅ Telegram botunuz aktif. Müşterileriniz Telegram'dan randevu alabilir.</div>
                <div className="row row-wrap gap-10">
                  <input value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="Yeni token ile değiştir..." className="input flex-1" style={{ minWidth: 0 }} />
                  <div className="row gap-8">
                    <button onClick={telegramBagla} disabled={tgYukleniyor || !tgToken.trim()} style={btnCls("var(--blue)", !tgToken.trim())}>Değiştir</button>
                    <button onClick={telegramAyir} disabled={tgYukleniyor} style={btnCls("var(--red)", false)}>Ayır</button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="mb-12" style={{ fontSize: 15, fontWeight: 700 }}>🔗 Telegram Botunu Bağla</h3>
                <div className="mb-12">
                  <label className="form-label">BotFather Token</label>
                  <input value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className="input" />
                </div>
                <button onClick={telegramBagla} disabled={tgYukleniyor || !tgToken.trim()} style={btnCls("#229ED9", !tgToken.trim())}>
                  {tgYukleniyor ? "Bağlanıyor..." : "✈️ Bağla"}
                </button>
              </div>
            )}
            {tgSonuc && (
              <div className={`result-toast ${tgSonuc.hata ? 'error' : 'success'}`}>{tgSonuc.mesaj}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, baslik, deger, renk }) {
  return (
    <div className="card-dark" style={{ flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 28 }} className="mb-8">{icon}</div>
      <div style={{ color: "var(--muted)", fontSize: 13 }} className="mb-4">{baslik}</div>
      <div style={{ color: renk || "var(--text)", fontSize: 28, fontWeight: 700 }}>{deger}</div>
    </div>
  );
}

function Dashboard() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [randevular, setRandevular] = useState([]);
  const [sayfa, setSayfa] = useState("anasayfa");
  const [hizmetler, setHizmetler] = useState([]);
  const [musteriler, setMusteriler] = useState([]);
  const [ayarlar, setAyarlar] = useState(null);
  const [paketDurum, setPaketDurum] = useState(null);
  const [testMesaj, setTestMesaj] = useState("");
  const [testCevaplar, setTestCevaplar] = useState([]);
  const [testTelefon] = useState("05531112233");
  const [testYukleniyor, setTestYukleniyor] = useState(false);
  const [randevuTarih, setRandevuTarih] = useState(() => { const d = new Date(); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); });
  const [randevuGorunum, setRandevuGorunum] = useState("liste");
  const [ayarKaydedildi, setAyarKaydedildi] = useState(false);
  const [paketModal, setPaketModal] = useState(false);
  const [grafikVeri, setGrafikVeri] = useState(null);
  const [dashEkstra, setDashEkstra] = useState(null);
  const [odemeBilgi, setOdemeBilgi] = useState(null);
  const [havaleNotu, setHavaleNotu] = useState("");
  const [odemeYukleniyor, setOdemeYukleniyor] = useState(false);
  const [dashCalisanlar, setDashCalisanlar] = useState([]);
  const [yorumIstat, setYorumIstat] = useState(null);
  const [calisanPopover, setCalisanPopover] = useState(null);
  const [profilPopover, setProfilPopover] = useState(false);
  const [odemeGerekli, setOdemeGerekli] = useState(false);
  const [duyurular, setDuyurular] = useState([]);
  const [finansVeri, setFinansVeri] = useState(null);
  const [finansYukleniyor, setFinansYukleniyor] = useState(false);
  const [fAyar, setFAyar] = useState({ kapora_aktif: false, kapora_alt_siniri: "0", kapora_orani: "20", kapora_iptal_saati: "2" });
  const [fKaydedildi, setFKaydedildi] = useState(false);
  const [hakedisForm, setHakedisForm] = useState({ iban: "", ad_soyad: "" });
  const [hakedisAcik, setHakedisAcik] = useState(false);
  const [destekTaleplerim, setDestekTaleplerim] = useState([]);
  const [destekFormAcik, setDestekFormAcik] = useState(false);
  const [yeniDestek, setYeniDestek] = useState({ konu: "", mesaj: "", oncelik: "normal" });
  const [destekSecili, setDestekSecili] = useState(null);
  const [destekFiltre2, setDestekFiltre2] = useState("hepsi");
  const chatRef = useRef(null);

  useEffect(() => {
    const handler = () => setOdemeGerekli(true);
    window.addEventListener("odeme-gerekli", handler);
    return () => window.removeEventListener("odeme-gerekli", handler);
  }, []);

  const verileriYukle = useCallback(async (tarih) => {
    const t = tarih || randevuTarih;
    const [s, r] = await Promise.all([
      api.get("/istatistikler"),
      api.get(`/randevular?tarih=${t}`),
    ]);
    setStats(s);
    setRandevular(r.randevular || []);
  }, [randevuTarih]);

  useEffect(() => {
    verileriYukle();
    api.get("/paket").then(d => { if (d.paket) setPaketDurum(d); });
    api.get("/grafik-verileri").then(d => { if (!d.hata) setGrafikVeri(d); }).catch(() => {});
    api.get("/dashboard-ekstra").then(d => { if (!d.hata) setDashEkstra(d); }).catch(() => {});
    api.get("/odeme/durum").then(d => { if (!d.hata) setOdemeBilgi(d); }).catch(() => {});
    api.get("/calisanlar").then(d => setDashCalisanlar(d.calisanlar || [])).catch(() => {});
    api.get("/ayarlar").then(d => { if (d.isletme) setAyarlar(d.isletme); }).catch(() => {});
    api.get("/yorum-avcisi/istatistik").then(d => { if (!d?.hata) setYorumIstat(d); }).catch(() => {});
    api.get("/duyurular").then(d => setDuyurular(d.duyurular || [])).catch(() => {});
    // Shopier callback sonrası bildirim
    const params = new URLSearchParams(window.location.search);
    if (params.get('odeme') === 'basarili') {
      alert('✅ Ödemeniz başarıyla alındı! Teşekkürler.');
      window.history.replaceState({}, '', window.location.pathname);
      api.get("/odeme/durum").then(d => { if (!d.hata) setOdemeBilgi(d); });
    } else if (params.get('odeme') === 'basarisiz') {
      alert('❌ Ödeme işlemi başarısız oldu. Lütfen tekrar deneyin.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [verileriYukle]);

  const hizmetleriYukle = async () => { const d = await api.get("/hizmetler"); setHizmetler(d.hizmetler || []); };
  const musterileriYukle = async () => { const d = await api.get("/musteriler"); setMusteriler(d.musteriler || []); };
  const ayarlariYukle = async () => { const d = await api.get("/ayarlar"); setAyarlar(d.isletme); };

  const finansYukle = async () => { setFinansYukleniyor(true); try { const d = await api.get("/finans/ozet"); setFinansVeri(d); } catch(e) {} setFinansYukleniyor(false); };

  const destekYukleIsletme = async () => {
    try { const d = await api.get("/destek"); setDestekTaleplerim(d.talepler || []); } catch(e) {}
  };

  const destekGonder = async (e) => {
    e.preventDefault();
    if (!yeniDestek.konu || !yeniDestek.mesaj) return;
    try {
      await api.post("/destek", yeniDestek);
      setYeniDestek({ konu: "", mesaj: "", oncelik: "normal" });
      setDestekFormAcik(false);
      destekYukleIsletme();
    } catch(e) {}
  };

  useEffect(() => {
    if (finansVeri?.ayarlar) {
      const ay = finansVeri.ayarlar;
      setFAyar({ kapora_aktif: ay.kapora_aktif || false, kapora_alt_siniri: String(ay.kapora_alt_siniri || 0), kapora_orani: String(ay.kapora_orani || 20), kapora_iptal_saati: String(ay.kapora_iptal_saati || 2) });
    }
  }, [finansVeri]);

  useEffect(() => {
    if (sayfa === "hizmetler") hizmetleriYukle();
    if (sayfa === "musteriler") musterileriYukle();
    if (sayfa === "ayarlar") ayarlariYukle();
    if (sayfa === "randevular") verileriYukle();
    if (sayfa === "finans") finansYukle();
    if (sayfa === "destek") destekYukleIsletme();
    if (sayfa === "anasayfa") api.get("/calisanlar").then(d => setDashCalisanlar(d.calisanlar || [])).catch(() => {});
  }, [sayfa]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [testCevaplar]);

  const DR = { onaylandi: "#2cb872", bekliyor: "#f59e0b", iptal: "#ef4444", tamamlandi: "#3b82f6", gelmedi: "#6b7280", kapora_bekliyor: "#f59e0b" };
  const DL = { onaylandi: "Onaylı ✓", bekliyor: "Bekliyor", iptal: "İptal", tamamlandi: "Tamamlandı", gelmedi: "Gelmedi", kapora_bekliyor: "💳 Kapora Bekleniyor" };

  const botTest = async () => {
    if (!testMesaj.trim()) return;
    setTestYukleniyor(true);
    setTestCevaplar(prev => [...prev, { yon: "giden", mesaj: testMesaj }]);
    try {
      const d = await api.post("/bot/test", { telefon: testTelefon, mesaj: testMesaj });
      if (d && d.cevaplar && d.cevaplar.length > 0) {
        d.cevaplar.forEach(c => setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj: c }]));
      } else {
        setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj: d?.hata || "Bot yanıt veremedi. Loglara bakın." }]);
      }
    } catch (err) {
      console.error("Bot test hatası:", err);
      setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj: "Hata: " + (err.message || "Sunucu yanıt veremedi") }]);
    }
    setTestMesaj("");
    setTestYukleniyor(false);
  };

  const cikisYap = () => { localStorage.removeItem("randevugo_token"); api.token = null; window.location.reload(); };

  const sayfaBaslik = { anasayfa: "Dashboard", randevular: "Randevular", hizmetler: "Hizmetler", calisanlar: "Çalışanlar", musteriler: "Müşteriler", kasa: "Kasa", sms: "SMS Hatırlatma", geceraporu: "Gece Raporu", yorumavcisi: "Yorum Avcısı", winback: "Kayıp Müşteriler", sadakat: "Sadakat Puan", finans: "Finans & Kapora", botbaglanti: "Bot Bağlantısı", bottest: "Bot Test", destek: "Destek", ayarlar: "Ayarlar" };

  const SVG = {
    dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    randevular: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    hizmetler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
    calisanlar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    musteriler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    botbaglanti: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    bottest: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    ayarlar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    finans: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>,
    winback: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  };

  const menuItems = [
    { id: "anasayfa", icon: SVG.dashboard, label: "Dashboard" },
    { id: "randevular", icon: SVG.randevular, label: "Randevular" },
    { id: "hizmetler", icon: SVG.hizmetler, label: "Hizmetler" },
    { id: "calisanlar", icon: SVG.calisanlar, label: "Çalışanlar" },
    { id: "musteriler", icon: SVG.musteriler, label: "Müşteriler" },
    { id: "kasa", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>, label: "Kasa" },
    { id: "sms", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>, label: "SMS" },
    { id: "geceraporu", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>, label: "Gece Raporu" },
    { id: "yorumavcisi", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: "Yorum Avcısı" },
    { id: "winback", icon: SVG.winback, label: "Kayıp Müşteri" },
    { id: "sadakat", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>, label: "Sadakat" },
    { id: "finans", icon: SVG.finans, label: "Finans" },
    { id: "botbaglanti", icon: SVG.botbaglanti, label: "Bot Bağlantısı" },
    { id: "bottest", icon: SVG.bottest, label: "Bot Test" },
    { id: "destek", icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>, label: "Destek" },
    { id: "ayarlar", icon: SVG.ayarlar, label: "Ayarlar" },
  ];

  return (
    <div className="app-shell">

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <span className="brand-name">SıraGO</span>
        <button className="hamburger-btn" onClick={() => setMobileOpen(true)}>
          <span/><span/><span/>
        </button>
      </div>

      {/* Overlay */}
      <div className={`sidebar-overlay${mobileOpen ? ' open' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* ── Sidebar ── */}
      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <img src={logoIcon} alt="SıraGO" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div className="sidebar-logo-text">
            <div className="brand-name">SıraGO</div>
            <div className="brand-sub">İşletme Paneli</div>
          </div>
        </div>

        {ayarlar && (
          <div className="sidebar-user">
            <div className="u-name">{ayarlar.isim}</div>
          </div>
        )}

        <nav className="sidebar-nav">
          {menuItems.map(m => (
            <div key={m.id} onClick={() => { setSayfa(m.id); setMobileOpen(false); }} className={`nav-item${sayfa === m.id ? ' active' : ''}`}>
              <span className="nav-icon">{m.icon}</span>
              <span>{m.label}</span>
              {sayfa === m.id && <div className="active-dot" />}
            </div>
          ))}
        </nav>

        {paketDurum && (
          <div className="paket-widget">
            <div className="pw-header">
              <span className="pw-label">Paketiniz</span>
              <span className={`badge ${paketDurum.paket === 'premium' ? 'badge-amber' : paketDurum.paket === 'profesyonel' ? 'badge-blue' : 'badge-gray'}`}>{paketDurum.paket}</span>
            </div>
            {[
              { label: 'Çalışan', used: paketDurum.kullanim.calisan, limit: paketDurum.paket_bilgi.calisan_limit, renk: 'var(--green)' },
              { label: 'Hizmet', used: paketDurum.kullanim.hizmet, limit: paketDurum.paket_bilgi.hizmet_limit, renk: 'var(--blue)' },
              { label: 'Bu ay randevu', used: paketDurum.kullanim.randevu, limit: paketDurum.paket_bilgi.aylik_randevu_limit, renk: 'var(--purple)' },
            ].map(item => {
              const pct = item.limit >= 9999 ? 4 : Math.min(100, Math.round(item.used / item.limit * 100));
              const dolu = pct >= 90;
              return (
                <div key={item.label}>
                  <div className="pw-bar-label">
                    <span>{item.label}</span>
                    <span style={{ color: dolu ? 'var(--red)' : 'var(--dim)' }}>{item.limit >= 9999 ? `${item.used} / ∞` : `${item.used}/${item.limit}`}</span>
                  </div>
                  <div className="pw-bar-track">
                    <div className="pw-bar-fill" style={{ width: `${pct}%`, background: dolu ? 'var(--red)' : item.renk }} />
                  </div>
                </div>
              );
            })}
            {dashEkstra?.paketKalanGun != null && (() => {
              const kalan = dashEkstra.paketKalanGun;
              const tip = dashEkstra.paketDurumTipi;
              const toplam = 30;
              const pctB = Math.max(0, Math.min(100, Math.round(Math.max(0, kalan) / toplam * 100)));
              const renk = kalan > 10 ? 'var(--green)' : kalan > 3 ? '#f59e0b' : 'var(--red)';
              const label = tip === 'deneme' ? 'Deneme süresi' : `${paketDurum?.paket_bilgi?.isim || paketDurum?.paket || 'Paket'} süresi`;
              return (
                <div>
                  <div className="pw-bar-label">
                    <span>{label}</span>
                    <span style={{ color: kalan <= 3 ? 'var(--red)' : kalan <= 10 ? '#f59e0b' : 'var(--dim)' }}>
                      {kalan > 0 ? `${kalan} gün kaldı` : 'Süre doldu'}
                    </span>
                  </div>
                  <div className="pw-bar-track">
                    <div className="pw-bar-fill" style={{ width: `${pctB}%`, background: renk }} />
                  </div>
                </div>
              );
            })()}
            {paketDurum.paket !== 'premium' && (
              <div className="pw-upgrade" onClick={() => setPaketModal(true)}>
                <span>Paketi Yükselt</span>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <button onClick={cikisYap} className="btn btn-ghost btn-block btn-sm">Çıkış Yap</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-wrap">
        <div className="top-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>{sayfaBaslik[sayfa]}</h1>
            {sayfa === "anasayfa" && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Çalışan Avatarları + Ekip Dropdown */}
            {dashCalisanlar.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}
                onClick={() => setCalisanPopover(calisanPopover ? null : "ekip")}>
                {dashCalisanlar.slice(0, 4).map((c, i) => (
                  <div key={c.id} style={{
                    width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--surface)",
                    background: ["#54E097","#FE5796","#14F5D6","#8b5cf6","#f59e0b"][i % 5],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, color: "#fff",
                    marginLeft: i > 0 ? -8 : 0, zIndex: 5 - i, cursor: "pointer",
                    transition: "transform .2s"
                  }} onMouseOver={e => e.currentTarget.style.transform = "scale(1.12)"}
                     onMouseOut={e => e.currentTarget.style.transform = "none"}>
                    {c.isim?.charAt(0)?.toUpperCase()}
                  </div>
                ))}
                {dashCalisanlar.length > 4 && (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--surface)",
                    background: "var(--surface3)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, color: "var(--muted)", marginLeft: -8, zIndex: 0, cursor: "pointer"
                  }}>+{dashCalisanlar.length - 4}</div>
                )}

                {/* Ekip Dropdown */}
                {calisanPopover === "ekip" && (
                  <>
                    <div onClick={e => { e.stopPropagation(); setCalisanPopover(null); }} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }} />
                    <div onClick={e => e.stopPropagation()} style={{
                      position: "absolute", top: 44, right: 0, zIndex: 50,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 16, width: 300, maxHeight: 420, overflow: "hidden",
                      boxShadow: "0 16px 48px rgba(22,5,39,.14), 0 2px 8px rgba(22,5,39,.06)",
                      animation: "fadeIn .18s ease", display: "flex", flexDirection: "column"
                    }}>
                      {/* Başlık */}
                      <div style={{ padding: "16px 18px 12px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)" }}>Ekip</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>{dashCalisanlar.length} çalışan</div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); setCalisanPopover(null); setSayfa("calisanlar"); }} style={{
                          padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)",
                          background: "var(--surface)", color: "var(--muted)", fontSize: 11, fontWeight: 600,
                          cursor: "pointer", fontFamily: "inherit"
                        }}>Yönet →</button>
                      </div>
                      {/* Liste */}
                      <div style={{ overflowY: "auto", padding: "8px 10px", flex: 1 }}>
                        {dashCalisanlar.map((c, i) => {
                          const renk = ["#54E097","#FE5796","#14F5D6","#8b5cf6","#f59e0b"][i % 5];
                          return (
                            <div key={c.id} style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "10px 8px",
                              borderRadius: 10, cursor: "default", transition: "background .15s"
                            }} onMouseOver={e => e.currentTarget.style.background = "var(--bg)"}
                               onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, background: renk, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 14, fontWeight: 800, color: "#fff"
                              }}>{c.isim?.charAt(0)?.toUpperCase()}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.isim}</div>
                                <div style={{ fontSize: 11, color: "var(--dim)" }}>
                                  {c.uzmanlik || (c.calisma_baslangic ? `${c.calisma_baslangic?.slice(0,5)} – ${c.calisma_bitis?.slice(0,5)}` : "Çalışan")}
                                </div>
                              </div>
                              {c.telefon && (
                                <div style={{ fontSize: 11, color: "var(--muted)", flexShrink: 0 }}>{c.telefon?.slice(-4)}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {/* Kullanıcı Profil */}
            {ayarlar && (
              <div style={{ position: "relative" }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 14px 6px 6px",
                  background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14,
                  cursor: "pointer"
                }} onClick={() => setProfilPopover(!profilPopover)}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: "var(--gradient)", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 800, color: "#fff"
                  }}>{ayarlar.isim?.charAt(0)?.toUpperCase() || "?"}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", lineHeight: 1.2 }}>{ayarlar.isim}</div>
                    <div style={{ fontSize: 10, color: "var(--dim)" }}>{ayarlar.kategori || "İşletme"}</div>
                  </div>
                </div>
                {profilPopover && (
                  <>
                    <div onClick={() => setProfilPopover(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }} />
                    <div style={{
                      position: "absolute", top: 44, right: 0, zIndex: 50,
                      background: "var(--surface)", border: "1px solid var(--border)",
                      borderRadius: 14, padding: 16, minWidth: 220,
                      boxShadow: "0 8px 32px rgba(0,0,0,.15)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 12,
                          background: "var(--gradient)", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, fontWeight: 800, color: "#fff"
                        }}>{ayarlar.isim?.charAt(0)?.toUpperCase() || "?"}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{ayarlar.isim}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>{ayarlar.kategori || "İşletme"}</div>
                        </div>
                      </div>
                      {paketDurum && (
                        <div style={{
                          padding: "8px 12px", borderRadius: 10,
                          background: "var(--bg)", marginBottom: 12,
                          display: "flex", alignItems: "center", justifyContent: "space-between"
                        }}>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>Paket</span>
                          <span className={`badge ${paketDurum.paket === 'premium' ? 'badge-amber' : paketDurum.paket === 'profesyonel' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 11 }}>{paketDurum.paket_bilgi?.isim || paketDurum.paket}</span>
                        </div>
                      )}
                      <button onClick={() => { setProfilPopover(false); setSayfa("ayarlar"); }} style={{
                        width: "100%", padding: "8px 0", borderRadius: 10, border: "1px solid var(--border)",
                        background: "var(--bg)", color: "var(--text)", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                      }}>⚙️ Ayarlar</button>
                      <button onClick={() => { setProfilPopover(false); cikisYap(); }} style={{
                        width: "100%", padding: "8px 0", borderRadius: 10, border: "none",
                        background: "rgba(239,68,68,.08)", color: "#ef4444", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                      }}>🚪 Çıkış Yap</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="page-body">

          {/* ── DASHBOARD ── */}
          {sayfa === "anasayfa" && (() => {
            const bugunRandevu = stats?.bugun?.toplam_randevu || 0;
            const haftaRandevu = stats?.hafta?.toplam_randevu || 0;
            const toplamMusteri = stats?.toplam_musteri || 0;
            const limitR = paketDurum?.paket_bilgi?.aylik_randevu_limit || 100;
            const kulR = paketDurum?.kullanim?.randevu || 0;
            const pctR = limitR >= 9999 ? Math.min(kulR, 50) : Math.min(100, Math.round(kulR / limitR * 100));
            return (
            <>
              {/* ── ROW 1: Stat Cards (Optivue style) ── */}
              <div className="dash-stats-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 20 }}>
                {/* Duyurular */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "16px 18px", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500 }}>📢 Duyurular</div>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(59,130,246,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>🔔</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{duyurular.length} duyuru</div>
                      <button onClick={() => setSayfa("duyurular")} style={{ padding: "4px 12px", borderRadius: 8, border: "none", background: "var(--surface)", color: "var(--text)", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Tümünü Gör</button>
                    </div>
                  </div>
                  {duyurular.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", padding: "10px 0" }}>Yeni duyuru yok</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 90, overflowY: "auto" }}>
                      {duyurular.slice(0, 3).map(d => {
                        const tipRenk = { bilgi: "#3b82f6", guncelleme: "#10b981", bakim: "#f59e0b", uyari: "#ef4444" };
                        const tipIcon = { bilgi: "ℹ️", guncelleme: "🆕", bakim: "🔧", uyari: "⚠️" };
                        const renk = tipRenk[d.tip] || "#3b82f6";
                        return (
                          <div key={d.id} style={{ padding: "6px 10px", borderRadius: 8, background: `${renk}08`, borderLeft: `3px solid ${renk}` }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
                              <span>{tipIcon[d.tip] || "📢"}</span> {d.baslik}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, lineHeight: 1.3 }}>{d.mesaj?.length > 60 ? d.mesaj.slice(0, 60) + "..." : d.mesaj}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Bu Hafta */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginBottom: 6 }}>Bu Hafta Toplam</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 28, fontWeight: 800, color: "var(--text)", letterSpacing: "-.5px" }}>{haftaRandevu}</span>
                        {stats?.hafta?.onaylanan > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#0bb8a0", background: "rgba(20,245,214,.1)", padding: "2px 8px", borderRadius: 6 }}>✓ {stats.hafta.onaylanan}</span>}
                      </div>
                    </div>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(20,245,214,.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--surface3)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "#14F5D6", width: `${Math.min(100, haftaRandevu * 3)}%`, transition: "width .4s" }} />
                  </div>
                </div>

                {/* Müşteri Memnuniyeti / Paket Kullanım */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 500, marginBottom: 6 }}>Aylık Randevu Kullanım</div>
                      <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 4 }}>Paket kapasitesi takibi</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>Aylık</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
                        <span>Kullanılan</span>
                        <span style={{ fontWeight: 600 }}>{kulR}/{limitR >= 9999 ? "∞" : limitR}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: pctR > 80 ? "#ef4444" : pctR > 60 ? "#f59e0b" : "#54E097", width: `${pctR}%`, transition: "width .4s" }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
                        <span>Müşteri</span>
                        <span style={{ fontWeight: 600 }}>{toplamMusteri}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: "#FE5796", width: `${Math.min(100, toplamMusteri * 2)}%`, transition: "width .4s" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ROW 2: Gelir Kartları (Optivue orta sıra) ── */}
              {grafikVeri && (
                <div className="dash-mid-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 20 }}>
                  {/* Bekleyen Randevular */}
                  {(() => {
                    const bekleyen = randevular.filter(r => r.durum === "bekliyor").length;
                    return (
                      <div style={{ background: bekleyen > 0 ? "rgba(245,158,11,.04)" : "var(--surface)", borderRadius: 16, padding: "18px 22px", border: `1px solid ${bekleyen > 0 ? "rgba(245,158,11,.15)" : "var(--border)"}`, cursor: "pointer" }} onClick={() => setSayfa("randevular")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Bekleyen Onay</div>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: bekleyen > 0 ? "rgba(245,158,11,.1)" : "var(--surface3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⏳</div>
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 800, color: bekleyen > 0 ? "#d97706" : "var(--text)", letterSpacing: "-.5px" }}>{bekleyen}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{bekleyen > 0 ? "Onay bekleyen randevu var" : "Tüm randevular onaylı"}</div>
                      </div>
                    );
                  })()}

                  {/* Aylık gelir özet */}
                  {(() => {
                    const aylikGelirler = (grafikVeri.aylikGelir || []).map(g => parseFloat(g.gelir));
                    const toplamAylik = aylikGelirler.reduce((a, b) => a + b, 0);
                    return (
                      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginBottom: 4 }}>Bu Ay Gelir</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--text)", letterSpacing: "-.5px" }}>₺{toplamAylik.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: "#2cb872", fontWeight: 600 }}>📈</span>
                          <span style={{ fontSize: 11, color: "var(--dim)" }}>{aylikGelirler.length} gün verisi</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Günlük gelirler mini */}
                  {(() => {
                    const son3 = (grafikVeri.aylikGelir || []).slice(-3);
                    return (
                      <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500, marginBottom: 10 }}>Son 3 Gün Gelir</div>
                        {son3.map((g, i) => {
                          const d = new Date(g.tarih);
                          return (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < son3.length - 1 ? "1px solid var(--border)" : "none" }}>
                              <span style={{ fontSize: 12, color: "var(--dim)" }}>{d.getDate()}/{d.getMonth()+1}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>₺{parseFloat(g.gelir).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Yorum Talepleri */}
                  <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)", cursor: "pointer" }} onClick={() => setSayfa("yorumavcisi")}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Yorum Talepleri</div>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(245,158,11,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⭐</div>
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: "#f59e0b", letterSpacing: "-.5px" }}>{yorumIstat?.gonderilen || 0}</div>
                    <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Bu ay gönderilen</div>
                  </div>
                </div>
              )}

              {/* ── ROW 3: Ana grafik (sol) + Bot Test Widget (sağ, Optivue Smart Insights tarzı) ── */}
              <div className="dash-main-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, marginBottom: 20 }}>
                {/* Haftalık Randevu Analizi */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Randevu Analizi</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Toplam randevular ve onaylananlar haftalık</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Aylık</span>
                  </div>
                  {grafikVeri && (
                    <div style={{ position: "relative", height: 220 }}>
                      <Bar data={{
                        labels: (grafikVeri.haftalik || []).map(h => { const d = new Date(h.tarih); return d.toLocaleDateString("tr-TR", { weekday: "short" }); }),
                        datasets: [
                          { label: "Toplam", data: (grafikVeri.haftalik || []).map(h => parseInt(h.sayi)), backgroundColor: "rgba(84,224,151,.45)", hoverBackgroundColor: "rgba(84,224,151,.7)", borderRadius: 8, borderSkipped: false },
                          { label: "Onaylanan", data: (grafikVeri.haftalik || []).map(h => parseInt(h.onaylanan)), backgroundColor: "rgba(84,224,151,.2)", hoverBackgroundColor: "rgba(84,224,151,.4)", borderRadius: 8, borderSkipped: false },
                        ]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#6b7280", font: { size: 11 }, usePointStyle: true, pointStyle: "circle", padding: 16 } } }, scales: { x: { ticks: { color: "#9ca3af", font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#9ca3af", font: { size: 10 } }, grid: { color: "rgba(22,5,39,.04)" } } } }} />
                    </div>
                  )}
                </div>

                {/* Bot Test — Smart AI Insights */}
                <div style={{
                  background: "var(--surface)", borderRadius: 20, position: "relative", overflow: "hidden",
                  display: "flex", flexDirection: "column",
                  border: "1px solid var(--border)", boxShadow: "0 2px 16px rgba(0,0,0,.04)"
                }}>
                  {/* Halka görsel alanı — SVG 3D torus */}
                  <div style={{ position: "relative", height: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="200" height="150" viewBox="0 0 200 150" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <defs>
                        <linearGradient id="tealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9"/>
                          <stop offset="30%" stopColor="#14b8a6" stopOpacity="0.7"/>
                          <stop offset="60%" stopColor="#0d9488" stopOpacity="0.4"/>
                          <stop offset="100%" stopColor="#5eead4" stopOpacity="0.8"/>
                        </linearGradient>
                        <linearGradient id="purpleGrad" x1="100%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.8"/>
                          <stop offset="40%" stopColor="#a78bfa" stopOpacity="0.6"/>
                          <stop offset="70%" stopColor="#8b5cf6" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="#a78bfa" stopOpacity="0.7"/>
                        </linearGradient>
                        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
                          <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.9"/>
                          <stop offset="50%" stopColor="#2dd4bf" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0"/>
                        </radialGradient>
                        <filter id="glow">
                          <feGaussianBlur stdDeviation="3" result="blur"/>
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                        <filter id="softGlow">
                          <feGaussianBlur stdDeviation="6" result="blur"/>
                          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                      </defs>
                      {/* Dış halka — eğik elips (3D perspektif) */}
                      <ellipse cx="105" cy="72" rx="58" ry="52" stroke="url(#tealGrad)" strokeWidth="4" fill="none" filter="url(#glow)" transform="rotate(-8 105 72)"/>
                      {/* İç halka — offset, farklı açı */}
                      <ellipse cx="92" cy="68" rx="38" ry="34" stroke="url(#purpleGrad)" strokeWidth="3" fill="none" filter="url(#glow)" transform="rotate(5 92 68)"/>
                      {/* Merkez parlayan nokta */}
                      <circle cx="95" cy="70" r="10" fill="url(#coreGlow)" filter="url(#softGlow)"/>
                      <circle cx="95" cy="70" r="4" fill="#2dd4bf" opacity="0.8"/>
                      {/* Dekoratif noktalar */}
                      <circle cx="25" cy="22" r="4" fill="#2dd4bf" opacity="0.2"/>
                      <circle cx="175" cy="110" r="3" fill="#a78bfa" opacity="0.15"/>
                      <circle cx="170" cy="35" r="2.5" fill="#38bdf8" opacity="0.15"/>
                    </svg>
                  </div>

                  {/* Başlık */}
                  <div style={{ padding: "0 20px", textAlign: "center", marginBottom: 10 }}>
                    <div style={{ color: "var(--text)", fontWeight: 800, fontSize: 15, marginBottom: 4 }}>Smart AI Bot</div>
                    <div style={{ color: "var(--muted)", fontSize: 11, lineHeight: 1.4 }}>Mesaj gönderin, botunuzun performansını test edin</div>
                  </div>

                  {/* Chat area */}
                  <div ref={chatRef} style={{
                    flex: 1, minHeight: 80, maxHeight: 120, overflowY: "auto",
                    background: "var(--hover)", margin: "0 12px", borderRadius: 12,
                    padding: "10px 14px", display: "flex", flexDirection: "column", gap: 6
                  }}>
                    {testCevaplar.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "16px 0", color: "var(--dim)", fontSize: 11 }}>
                        Bir mesaj göndererek botu test edin
                      </div>
                    ) : testCevaplar.map((m, i) => (
                      <div key={i} style={{
                        alignSelf: m.yon === "giden" ? "flex-end" : "flex-start",
                        background: m.yon === "giden" ? "var(--accent)" : "var(--surface)",
                        color: m.yon === "giden" ? "#fff" : "var(--text)",
                        padding: "7px 12px", borderRadius: m.yon === "giden" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                        fontSize: 12, maxWidth: "85%", lineHeight: 1.4,
                        border: m.yon === "giden" ? "none" : "1px solid var(--border)"
                      }}>
                        {m.mesaj}
                      </div>
                    ))}
                  </div>

                  {/* Input */}
                  <div style={{ display: "flex", gap: 8, padding: "10px 14px 14px" }}>
                    <input
                      value={testMesaj}
                      onChange={e => setTestMesaj(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && botTest()}
                      placeholder="Mesaj yazın..."
                      style={{
                        flex: 1, padding: "10px 14px", borderRadius: 10,
                        background: "var(--hover)", border: "1px solid var(--border)",
                        color: "var(--text)", fontSize: 12, outline: "none", fontFamily: "inherit"
                      }}
                    />
                    <button onClick={botTest} disabled={testYukleniyor} style={{
                      width: 40, height: 40, borderRadius: 10, border: "none",
                      background: "var(--accent)", color: "#fff", cursor: "pointer",
                      fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center",
                      opacity: testYukleniyor ? .5 : 1, flexShrink: 0
                    }}>
                      {testYukleniyor
                        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4"/></svg>
                        : <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                      }
                    </button>
                  </div>
                </div>
              </div>

              {/* ── ROW 3.5: Günün İstatistikleri ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(84,224,151,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>💰</div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, marginBottom: 2 }}>Günün En Çok Kazandıran Hizmeti</div>
                    {dashEkstra?.topHizmet ? (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{dashEkstra.topHizmet.isim}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{dashEkstra.topHizmet.adet} randevu · {dashEkstra.topHizmet.toplam_ciro}₺</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: "var(--dim)" }}>Bugün henüz randevu yok</div>}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(139,92,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>⭐</div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, marginBottom: 2 }}>Günün En Çok Randevu Alan Çalışanı</div>
                    {dashEkstra?.topCalisan ? (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>{dashEkstra.topCalisan.isim}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{dashEkstra.topCalisan.adet} randevu bugün</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: "var(--dim)" }}>Bugün henüz randevu yok</div>}
                  </div>
                </div>
              </div>

              {/* ── ROW 4: Gelir Trendi + Hizmet Dağılımı ── */}
              {grafikVeri && (
                <div className="dash-sub-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, marginBottom: 20 }}>
                  {/* Aylık Gelir Line */}
                  <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Gelir Trendi</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>Bu ay</span>
                    </div>
                    <div style={{ position: "relative", height: 180 }}>
                      <Line data={{
                        labels: (grafikVeri.aylikGelir || []).map(g => { const d = new Date(g.tarih); return `${d.getDate()}/${d.getMonth()+1}`; }),
                        datasets: [{
                          label: "Gelir (₺)", data: (grafikVeri.aylikGelir || []).map(g => parseFloat(g.gelir)),
                          borderColor: "#54E097", backgroundColor: "rgba(84,224,151,.06)", fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: "#54E097", pointBorderColor: "#fff", pointBorderWidth: 2, borderWidth: 2.5,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9ca3af", font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#9ca3af", font: { size: 10 }, callback: v => v + "₺" }, grid: { color: "rgba(22,5,39,.04)" } } } }} />
                    </div>
                  </div>

                  {/* Hizmet Dağılımı */}
                  <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 16 }}>Hizmet Dağılımı</div>
                    <div style={{ position: "relative", height: 200 }}>
                      <Doughnut data={{
                        labels: (grafikVeri.hizmetDagilimi || []).map(h => h.isim),
                        datasets: [{ data: (grafikVeri.hizmetDagilimi || []).map(h => parseInt(h.sayi)),
                          backgroundColor: ["#54E097","#FE5796","#14F5D6","#8b5cf6","#3dd485","#ff8ab5","#0bb8a0","#a78bfa"],
                          borderWidth: 0, borderRadius: 4, hoverOffset: 6, spacing: 2,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { position: "bottom", labels: { color: "#6b7280", font: { size: 10 }, usePointStyle: true, pointStyle: "circle", padding: 8 } } } }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ── ROW 5: Bugünün Randevuları (tam genişlik) ── */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)", marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Bugünün Randevuları</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>{randevular.length} randevu planlandı</div>
                    </div>
                  </div>
                  <button onClick={() => setSayfa("randevular")} style={{
                    padding: "6px 16px", borderRadius: 10, border: "1px solid var(--border)",
                    background: "var(--surface)", color: "var(--text)", fontSize: 12, fontWeight: 600,
                    cursor: "pointer", fontFamily: "inherit"
                  }}>Tümünü Gör →</button>
                </div>
                {!stats ? (
                  <div style={{ color: "var(--dim)", padding: 24, textAlign: "center" }}>Yükleniyor...</div>
                ) : randevular.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "28px 16px", background: "var(--surface2)", borderRadius: 12 }}>
                    <div style={{ fontSize: 36, marginBottom: 6 }}>🎉</div>
                    <div style={{ color: "var(--text)", fontSize: 14, fontWeight: 600 }}>Bugün boş</div>
                    <div style={{ color: "var(--dim)", fontSize: 12, marginTop: 2 }}>Randevu yok, keyfinize bakın!</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
                    {randevular.slice(0, 8).map(r => (
                      <div key={r.id} style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "12px 14px",
                        background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--border)",
                        transition: "all .15s"
                      }}
                      onMouseOver={e => e.currentTarget.style.borderColor = DR[r.durum] || "var(--border)"}
                      onMouseOut={e => e.currentTarget.style.borderColor = "var(--border)"}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 10,
                          background: `${DR[r.durum] || "#9ca3af"}12`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 800, fontSize: 13, color: DR[r.durum] || "#9ca3af", flexShrink: 0
                        }}>{r.saat?.slice(0, 5)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.musteri_isim || "İsimsiz"}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>{r.hizmet_isim}</div>
                        </div>
                        <span style={{ padding: "3px 8px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: `${DR[r.durum] || "#9ca3af"}12`, color: DR[r.durum] || "#9ca3af", whiteSpace: "nowrap" }}>{DL[r.durum] || r.durum}</span>
                      </div>
                    ))}
                  </div>
                )}
                {randevular.length > 8 && (
                  <button onClick={() => setSayfa("randevular")} style={{
                    width: "100%", padding: "10px", marginTop: 12, textAlign: "center",
                    background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10,
                    color: "var(--primary)", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit"
                  }}>+{randevular.length - 8} randevu daha</button>
                )}
              </div>

              {/* ── ROW 6: Paket & Ödeme Durumu ── */}
              {odemeBilgi && (
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)", borderLeft: `4px solid ${odemeBilgi.odeme?.durum === 'odendi' ? '#2cb872' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? '#f59e0b' : '#ef4444'}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 20 }}>💳</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Paket & Ödeme Durumu</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>{odemeBilgi.donem} · {dashEkstra?.paket || odemeBilgi.paket || ''}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {dashEkstra?.paketKalanGun != null && (
                        <div style={{ padding: "6px 14px", borderRadius: 10, background: dashEkstra.paketKalanGun > 7 ? "rgba(84,224,151,.08)" : dashEkstra.paketKalanGun > 0 ? "rgba(245,158,11,.08)" : "rgba(239,68,68,.08)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 18 }}>{dashEkstra.paketKalanGun > 7 ? "✅" : dashEkstra.paketKalanGun > 0 ? "⚠️" : "🔴"}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: dashEkstra.paketKalanGun > 7 ? "#2cb872" : dashEkstra.paketKalanGun > 0 ? "#f59e0b" : "#ef4444" }}>
                              {dashEkstra.paketKalanGun > 0 ? `${dashEkstra.paketKalanGun} gün kaldı` : "Süre doldu"}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--dim)" }}>Paket bitiş</div>
                          </div>
                        </div>
                      )}
                      <span className={`tag ${odemeBilgi.odeme?.durum === 'odendi' ? 'tag-green' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? 'tag-amber' : 'tag-red'}`} style={{ padding: "4px 14px", fontSize: 12 }}>
                        {odemeBilgi.odeme?.durum === 'odendi' ? '✅ Ödendi' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? '⏳ Onay Bekliyor' : '❌ Ödenmedi'}
                      </span>
                    </div>
                  </div>

                  {/* Ödenmemiş → Tek tıkla uzat + havale */}
                  {(!odemeBilgi.odeme || odemeBilgi.odeme.durum === 'bekliyor') && (
                    <div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                        <button onClick={() => {
                          const token = localStorage.getItem("randevugo_token");
                          const baseUrl = import.meta.env.VITE_API_URL || "https://randevugo-api.onrender.com/api";
                          window.open(`${baseUrl}/odeme/shopier/baslat?token=${token}`, "_blank");
                        }} style={{ flex: 1, padding: "14px 20px", borderRadius: 14, border: "none", background: "linear-gradient(135deg,#54E097,#2cb872)", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
                          🚀 Tek Tıkla Paketini Uzat — {odemeBilgi.tutar}₺
                        </button>
                      </div>
                      <details style={{ background: "var(--surface2)", borderRadius: 12, padding: "12px 16px" }}>
                        <summary style={{ cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--dim)" }}>🏦 Havale/EFT ile ödemek istiyorum</summary>
                        <div style={{ marginTop: 10 }} className="banka-bilgi">
                          <div><strong>Banka:</strong> {odemeBilgi.banka?.banka_adi}</div>
                          <div><strong>IBAN:</strong> {odemeBilgi.banka?.iban}</div>
                          <div><strong>Hesap Sahibi:</strong> {odemeBilgi.banka?.hesap_sahibi}</div>
                          <div><strong>Açıklama:</strong> <span className="ref-kod">{odemeBilgi.banka?.aciklama}</span></div>
                        </div>
                        <div className="ref-uyari" style={{ marginTop: 8 }}>⚠️ Havale yaparken açıklama kısmına <strong>{odemeBilgi.banka?.aciklama}</strong> yazmayı unutmayın!</div>
                        <button onClick={async () => {
                          setOdemeYukleniyor(true);
                          const d = await api.post("/odeme/havale", { dekont_notu: "" });
                          if (!d.hata) { api.get("/odeme/durum").then(d2 => { if (!d2.hata) setOdemeBilgi(d2); }); }
                          setOdemeYukleniyor(false);
                        }} disabled={odemeYukleniyor} className="btn btn-primary btn-sm" style={{ marginTop: 10 }}>
                          {odemeYukleniyor ? "Gönderiliyor..." : "📤 Havale Bildirimi Gönder"}
                        </button>
                      </details>
                    </div>
                  )}
                  {odemeBilgi.odeme?.durum === 'havale_bekliyor' && (
                    <div className="alert alert-amber mt-12">Havale bildiriminiz alındı. SuperAdmin onayı bekleniyor.</div>
                  )}
                  {odemeBilgi.odeme?.durum === 'odendi' && (
                    <div style={{ background: "rgba(84,224,151,.06)", border: "1px solid rgba(84,224,151,.15)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 20 }}>🎉</span>
                        <div style={{ fontSize: 13, color: "#2cb872", fontWeight: 600 }}>Bu dönem ödemesi tamamlandı. Teşekkürler!</div>
                      </div>
                      {dashEkstra?.paket && dashEkstra.paket !== 'premium' && (
                        <button onClick={() => setPaketModal(true)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#8b5cf6,#6d28d9)", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                          ⬆️ Paketini Yükselt
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
            );
          })()}

          {/* ── RANDEVULAR ── */}
          {sayfa === "randevular" && (() => {
            const bugun = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
            const dunDate = new Date(); dunDate.setDate(dunDate.getDate() - 1);
            const dun = dunDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });
            const yarinDate = new Date(); yarinDate.setDate(yarinDate.getDate() + 1);
            const yarin = yarinDate.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" });

            const aktifTab = randevuTarih === bugun ? "bugun" : randevuTarih === dun ? "dun" : randevuTarih === yarin ? "yarin" : "ozel";
            const tarihLabel = (t) => {
              const d = new Date(t + "T00:00:00");
              return d.toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            };

            const durumSayac = { onaylandi: 0, bekliyor: 0, tamamlandi: 0, gelmedi: 0, iptal: 0, kapora_bekliyor: 0 };
            randevular.forEach(r => { if (durumSayac[r.durum] !== undefined) durumSayac[r.durum]++; else durumSayac.bekliyor++; });

            const bitmisDurum = ['iptal', 'tamamlandi', 'gelmedi'];
            const onayBekle = (r) => r.durum === 'bekliyor' || r.durum === 'onay_bekliyor';
            const timeoutDk = ayarlar?.onay_timeout_dk || 30;

            const kalanSure = (r) => {
              if (!onayBekle(r) || !r.olusturma_tarihi) return null;
              const bitis = new Date(r.olusturma_tarihi).getTime() + timeoutDk * 60000;
              const kalan = Math.max(0, bitis - Date.now());
              if (kalan <= 0) return "0:00";
              const dk = Math.floor(kalan / 60000);
              const sn = Math.floor((kalan % 60000) / 1000);
              return `${dk}:${String(sn).padStart(2, "0")}`;
            };

            const waLink = (tel) => {
              if (!tel) return null;
              const clean = tel.replace(/[^0-9]/g, "");
              return `https://wa.me/${clean}`;
            };

            const durumDegistir = async (r, yeniDurum) => {
              if (yeniDurum === 'gelmedi') {
                const onay = confirm(`"${r.musteri_isim || 'Müşteri'}" gelmedi olarak işaretlensin mi?\n\nBu işlem kara liste ihlal sayısını artırır.`);
                if (!onay) return;
                const sonuc = await api.put(`/randevular/${r.id}/durum`, { durum: yeniDurum });
                if (sonuc?.noShow) {
                  const ns = sonuc.noShow;
                  if (ns.engellendi) {
                    alert(`🚫 ${r.musteri_isim || 'Müşteri'} engellendi!\n\n${ns.ihlalSayisi}. ihlal — otomatik kara listeye eklendi.`);
                  } else if (ns.otomatikAktif) {
                    alert(`⚠️ ${r.musteri_isim || 'Müşteri'}: ${ns.ihlalSayisi}/${ns.sinir} ihlal.\n\n${ns.sinir - ns.ihlalSayisi} ihlal daha → otomatik engel.`);
                  }
                }
              } else {
                await api.put(`/randevular/${r.id}/durum`, { durum: yeniDurum });
              }
              verileriYukle();
            };

            const tabBtn = (label, emoji, tarihVal, tabId) => (
              <button key={tabId}
                onClick={() => { setRandevuTarih(tarihVal); verileriYukle(tarihVal); }}
                style={{
                  padding: "10px 20px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
                  background: aktifTab === tabId ? "var(--primary)" : "var(--surface)",
                  color: aktifTab === tabId ? "#fff" : "var(--dim)",
                  transition: "all .2s"
                }}>
                {emoji} {label}
              </button>
            );

            /* ── Timeline Render ── */
            const renderTimeline = () => {
              const baslangic = parseInt((ayarlar?.calisma_baslangic || "09:00").split(":")[0]);
              const bitis = parseInt((ayarlar?.calisma_bitis || "19:00").split(":")[0]);
              const saatler = [];
              for (let h = baslangic; h <= bitis; h++) saatler.push(h);
              const molalar = (ayarlar?.mola_saatleri || []);

              const saatToMin = (s) => { const [h, m] = (s || "0:0").split(":").map(Number); return h * 60 + (m || 0); };
              const slotYukseklik = 60; // px per hour

              return (
                <div style={{ position: "relative", paddingLeft: 70, minHeight: saatler.length * slotYukseklik }}>
                  {/* Saat çizgisi */}
                  <div style={{ position: "absolute", left: 64, top: 0, bottom: 0, width: 2, background: "var(--border)" }} />
                  {saatler.map((h, i) => (
                    <div key={h} style={{ position: "absolute", top: i * slotYukseklik, left: 0, right: 0, height: slotYukseklik }}>
                      <div style={{ position: "absolute", left: 0, width: 56, textAlign: "right", fontSize: 12, fontWeight: 700, color: "var(--dim)", top: -6 }}>
                        {String(h).padStart(2, "0")}:00
                      </div>
                      <div style={{ position: "absolute", left: 66, right: 0, top: 0, borderTop: "1px dashed var(--border)" }} />
                    </div>
                  ))}
                  {/* Mola blokları */}
                  {molalar.map((m, i) => {
                    const mTop = (saatToMin(m.baslangic) - baslangic * 60) / 60 * slotYukseklik;
                    const mH = (saatToMin(m.bitis) - saatToMin(m.baslangic)) / 60 * slotYukseklik;
                    if (mH <= 0) return null;
                    return (
                      <div key={`mola-${i}`} className="tl-mola" style={{ position: "absolute", left: 74, right: 0, top: mTop, height: mH, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--dim)", fontWeight: 600 }}>
                        ☕ {m.isim || "Mola"}
                      </div>
                    );
                  })}
                  {/* Randevu blokları */}
                  {randevular.map(r => {
                    const rMin = saatToMin(r.saat);
                    const rEnd = r.bitis_saati ? saatToMin(r.bitis_saati) : rMin + 30;
                    const top = (rMin - baslangic * 60) / 60 * slotYukseklik;
                    const h = Math.max(28, (rEnd - rMin) / 60 * slotYukseklik - 4);
                    const renk = DR[r.durum] || "#f59e0b";
                    return (
                      <div key={r.id} style={{
                        position: "absolute", left: 74, right: 0, top, height: h,
                        background: `${renk}18`, borderLeft: `3px solid ${renk}`,
                        borderRadius: 10, padding: "6px 12px", fontSize: 12, overflow: "hidden",
                        display: "flex", alignItems: "center", gap: 10,
                        opacity: bitmisDurum.includes(r.durum) ? 0.5 : 1,
                      }}>
                        <span style={{ fontWeight: 800, color: renk }}>{r.saat?.slice(0, 5)}</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.musteri_isim || "İsimsiz"}</span>
                        {r.hizmet_isim && <span style={{ color: "var(--dim)" }}>· {r.hizmet_isim}</span>}
                        <span style={{ marginLeft: "auto", background: `${renk}30`, color: renk, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                          {DL[r.durum] || "Bekliyor"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            };

            return (
            <>
              {/* Hızlı tarih sekmeleri + görünüm toggle */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
                {tabBtn("Dün", "⏪", dun, "dun")}
                {tabBtn("Bugün", "📅", bugun, "bugun")}
                {tabBtn("Yarın", "⏩", yarin, "yarin")}
                <div style={{ width: 1, height: 28, background: "var(--border)", margin: "0 4px" }} />
                <input type="date" value={randevuTarih}
                  onChange={e => { setRandevuTarih(e.target.value); verileriYukle(e.target.value); }}
                  style={{
                    padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)",
                    background: aktifTab === "ozel" ? "var(--primary)" : "var(--surface)",
                    color: aktifTab === "ozel" ? "#fff" : "var(--text)", fontSize: 14, cursor: "pointer", outline: "none",
                    colorScheme: "light"
                  }} />
                <button onClick={() => verileriYukle()} style={{
                  padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer",
                  background: "rgba(84,224,151,0.12)", color: "#2cb872", fontSize: 13, fontWeight: 600
                }}>↻ Yenile</button>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "var(--surface)", borderRadius: 10, border: "1px solid var(--border)", padding: 3 }}>
                  {[["liste", "☰"], ["timeline", "🕐"]].map(([mod, ico]) => (
                    <button key={mod} onClick={() => setRandevuGorunum(mod)} style={{
                      padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 14,
                      background: randevuGorunum === mod ? "var(--primary)" : "transparent",
                      color: randevuGorunum === mod ? "#fff" : "var(--dim)", fontWeight: 600, transition: "all .15s"
                    }}>{ico}</button>
                  ))}
                </div>
              </div>

              {/* Tarih başlığı ve randevu sayısı */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", textTransform: "capitalize" }}>
                    {aktifTab === "bugun" ? "📅 Bugünün Randevuları" : aktifTab === "dun" ? "⏪ Dünün Randevuları" : aktifTab === "yarin" ? "⏩ Yarının Randevuları" : "📅 Randevular"}
                  </div>
                  <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 2 }}>{tarihLabel(randevuTarih)}</div>
                </div>
                <div style={{
                  background: "rgba(139,92,246,0.12)", color: "#8b5cf6", padding: "6px 16px",
                  borderRadius: 20, fontSize: 14, fontWeight: 700
                }}>
                  {randevular.length} randevu
                </div>
              </div>

              {/* Durum özet kartları */}
              {randevular.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
                  {[
                    { key: "onaylandi", label: "Onaylı", emoji: "✅", color: "#2cb872" },
                    { key: "bekliyor", label: "Bekliyor", emoji: "⏳", color: "#f59e0b" },
                    { key: "tamamlandi", label: "Tamamlandı", emoji: "✔️", color: "#3b82f6" },
                    { key: "gelmedi", label: "Gelmedi", emoji: "❌", color: "#6b7280" },
                    { key: "iptal", label: "İptal", emoji: "🚫", color: "#ef4444" },
                  ].filter(s => durumSayac[s.key] > 0).map(s => (
                    <div key={s.key} style={{
                      background: s.color + "12", borderRadius: 12, padding: "12px 14px",
                      display: "flex", alignItems: "center", gap: 10, border: `1px solid ${s.color}20`
                    }}>
                      <span style={{ fontSize: 20 }}>{s.emoji}</span>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{durumSayac[s.key]}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>{s.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Timeline Görünümü ── */}
              {randevuGorunum === "timeline" && randevular.length > 0 && (
                <div className="card" style={{ padding: 20, marginBottom: 16 }}>
                  {renderTimeline()}
                </div>
              )}

              {/* ── Liste Görünümü ── */}
              {randevuGorunum === "liste" && (
                <>
                  {randevular.length === 0 ? (
                    <div className="card text-center" style={{ padding: "60px 20px" }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                      <div style={{ color: "var(--text)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Randevu bulunamadı</div>
                      <div style={{ color: "var(--dim)", fontSize: 13 }}>{tarihLabel(randevuTarih)} için randevu yok</div>
                    </div>
                  ) : randevular.map(r => {
                    const durumRenk = DR[r.durum] || "#f59e0b";
                    const bitmis = bitmisDurum.includes(r.durum);
                    const bekle = onayBekle(r);
                    const kalan = kalanSure(r);
                    const kalanDk = kalan ? parseInt(kalan.split(":")[0]) : 999;

                    return (
                    <div key={r.id}
                      className={bekle ? "randevu-onay-bekle" : ""}
                      style={{
                        background: "var(--surface)", borderRadius: 14, padding: "14px 18px",
                        marginBottom: 8, border: "1px solid var(--border)",
                        borderLeft: `4px solid ${durumRenk}`,
                        opacity: bitmis ? 0.55 : 1,
                        transition: "all .2s",
                      }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {/* Saat — büyük */}
                        <div style={{
                          color: durumRenk, fontWeight: 900, fontSize: 22, minWidth: 52,
                          textAlign: "center", lineHeight: 1, flexShrink: 0
                        }}>
                          {r.saat?.slice(0, 5)}
                        </div>

                        {/* Bilgiler */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{r.musteri_isim || "İsimsiz"}</span>
                            {/* WhatsApp butonu */}
                            {r.musteri_telefon && (
                              <a href={waLink(r.musteri_telefon)} target="_blank" rel="noopener noreferrer"
                                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, background: "rgba(37,211,102,.12)", flexShrink: 0 }}
                                title="WhatsApp'ta yaz">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              </a>
                            )}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", fontSize: 12, color: "var(--dim)" }}>
                            <span>📞 {r.musteri_telefon}</span>
                            {r.hizmet_isim && <span>✂️ {r.hizmet_isim}{r.fiyat ? ` · ${Number(r.fiyat).toLocaleString("tr-TR")}₺` : ""}</span>}
                            {r.calisan_isim && <span>👤 {r.calisan_isim}</span>}
                            {r.kapora_durumu && r.kapora_durumu !== 'yok' && (
                              <span style={{ color: r.kapora_durumu === 'odendi' ? '#2cb872' : '#f59e0b', fontWeight: 600 }}>
                                💳 {r.kapora_durumu === 'odendi' ? `Ödendi (${Number(r.kapora_tutari).toLocaleString("tr-TR")}₺)` : `Bekliyor (${Number(r.kapora_tutari).toLocaleString("tr-TR")}₺)`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Durum badge (sağ üst) + countdown */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <div style={{
                            background: durumRenk + "20", color: durumRenk,
                            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 800,
                            whiteSpace: "nowrap", letterSpacing: "0.3px"
                          }}>
                            {DL[r.durum] || "Bekliyor"}
                          </div>
                          {bekle && kalan && (
                            <div style={{
                              fontSize: 11, fontWeight: 700, fontFamily: "monospace",
                              color: kalanDk < 5 ? "#ef4444" : kalanDk < 15 ? "#f59e0b" : "var(--dim)"
                            }}>
                              ⏳ {kalan}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Aksiyon butonları — sadece aktif durumlar için */}
                      {!bitmis && (
                        <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                          {[["onaylandi","✅ Onayla"], ["tamamlandi","✔️ Tamam"], ["gelmedi","❌ Gelmedi"], ["iptal","🚫 İptal"]].map(([d, l]) => (
                            <button key={d}
                              onClick={() => durumDegistir(r, d)}
                              style={{
                                padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer",
                                fontSize: 11, fontWeight: 700, transition: "all .15s",
                                background: r.durum === d ? DR[d] + "18" : "var(--surface2)",
                                color: r.durum === d ? DR[d] : "var(--dim)",
                                outline: r.durum === d ? `1px solid ${DR[d]}40` : "1px solid var(--border)"
                              }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </>
              )}

              {/* Boş durum (timeline modunda da) */}
              {randevuGorunum === "timeline" && randevular.length === 0 && (
                <div className="card text-center" style={{ padding: "60px 20px" }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                  <div style={{ color: "var(--text)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Randevu bulunamadı</div>
                  <div style={{ color: "var(--dim)", fontSize: 13 }}>{tarihLabel(randevuTarih)} için randevu yok</div>
                </div>
              )}
            </>
            );
          })()}

          {/* ── HİZMETLER ── */}
          {sayfa === "hizmetler" && (
            <HizmetlerSayfasi hizmetler={hizmetler} yukle={hizmetleriYukle} paketDurum={paketDurum} />
          )}

          {/* ── BOT BAĞLANTI ── */}
          {sayfa === "botbaglanti" && (
            <BotBaglantiSayfasi />
          )}

          {/* ── ÇALIŞANLAR ── */}
          {sayfa === "calisanlar" && (
            <CalisanlarSayfasi paketDurum={paketDurum} />
          )}

          {/* ── MÜŞTERİLER ── */}
          {sayfa === "musteriler" && (
            <>
              <div className="mb-20" style={{ color: "var(--dim)", fontSize: 13 }}>{musteriler.length} müşteri kayıtlı</div>
              {musteriler.length === 0 ? (
                <div className="card text-center" style={{ padding: "50px 0" }}>
                  <div style={{ fontSize: 40 }} className="mb-10">👥</div>
                  <div style={{ color: "var(--dim)" }}>Henüz müşteri yok</div>
                  <div style={{ color: "var(--dim)", fontSize: 13 }} className="mt-6">WhatsApp botu üzerinden gelen müşteriler burada görünecek</div>
                </div>
              ) : musteriler.map(m => (
                <div key={m.id} className="list-item list-item-lg">
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(16,185,129,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }} className="shrink-0">👤</div>
                  <div className="flex-1">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.isim || "İsimsiz"}</div>
                    <div className="list-item-sub">📞 {m.telefon}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--green)", fontWeight: 700, fontSize: 15 }}>{m.randevu_sayisi}</div>
                    <div style={{ color: "var(--dim)", fontSize: 11 }}>randevu</div>
                    {m.son_randevu && <div style={{ color: "var(--dim)", fontSize: 11 }} className="mt-2">{new Date(m.son_randevu).toLocaleDateString("tr-TR")}</div>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── BOT TEST ── */}
          {sayfa === "bottest" && (
            <div className="chat-wrap">
              <div className="chat-box">
                <div className="chat-header">
                  <div className="chat-avatar">🤖</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>WhatsApp Bot</div>
                    <div style={{ color: "var(--green)", fontSize: 12 }}>● Çevrimiçi</div>
                  </div>
                  <button onClick={() => setTestCevaplar([])} className="btn btn-ghost btn-sm ml-auto">Temizle</button>
                </div>
                <div ref={chatRef} className="chat-messages">
                  {testCevaplar.length === 0 && (
                    <div className="chat-empty">Müşteri gibi mesaj yazarak botu test edin...</div>
                  )}
                  {testCevaplar.map((c, i) => (
                    <div key={i} className={`chat-bubble ${c.yon === "giden" ? "out" : "in"}`}>{c.mesaj}</div>
                  ))}
                  {testYukleniyor && (
                    <div className="chat-typing"><span>●</span><span style={{ margin: "0 3px" }}>●</span><span>●</span></div>
                  )}
                </div>
                <div className="chat-input">
                  <input value={testMesaj} onChange={e => setTestMesaj(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !testYukleniyor && botTest()}
                    placeholder="Mesaj yazın..." className="input flex-1" />
                  <button onClick={botTest} disabled={testYukleniyor} className="btn btn-primary" style={{ opacity: testYukleniyor ? 0.6 : 1 }}>Gönder</button>
                </div>
              </div>
            </div>
          )}

          {/* ── FİNANS & KAPORA ── */}
          {sayfa === "finans" && (() => {
            const cz = finansVeri?.cuzdan || {};
            const odemeler = finansVeri?.son_odemeler || [];
            const talepler = finansVeri?.talepler || [];

            const kaydet = async () => {
              try {
                await api.put("/finans/ayarlar", { kapora_aktif: fAyar.kapora_aktif, kapora_alt_siniri: fAyar.kapora_alt_siniri, kapora_orani: fAyar.kapora_orani, kapora_iptal_saati: fAyar.kapora_iptal_saati });
                setFKaydedildi(true); setTimeout(() => setFKaydedildi(false), 2000); finansYukle();
              } catch (e) { alert(e.message || "Kayıt hatası"); }
            };

            const hakedisTalep = async () => {
              if (!hakedisForm.iban || !hakedisForm.ad_soyad) return alert("IBAN ve Ad Soyad zorunlu");
              try {
                await api.post("/finans/hakedis", hakedisForm);
                setHakedisAcik(false); setHakedisForm({ iban: "", ad_soyad: "" }); finansYukle();
                alert("✅ Hakediş talebi oluşturuldu!");
              } catch (e) { alert(e.hata || e.message || "Talep hatası"); }
            };

            const tl = (n) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 0 }).format(n || 0);

            if (finansYukleniyor && !finansVeri) return <div style={{ textAlign: "center", padding: 60, color: "var(--dim)" }}>Yükleniyor...</div>;

            return (
              <>
                {/* 2 Kolon: Sol=Kapora Ayarları, Sağ=Cüzdan */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>

                  {/* ─── KAPORA AYARLARI ─── */}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(59,130,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚙️</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Kapora Ayarları</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>Ön ödeme kurallarını belirleyin</div>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: fAyar.kapora_aktif ? "rgba(44,184,114,.06)" : "var(--surface2)", borderRadius: 12, marginBottom: 16, border: `1px solid ${fAyar.kapora_aktif ? "rgba(44,184,114,.2)" : "var(--border)"}` }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>💳 Kapora Sistemi</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{fAyar.kapora_aktif ? "Aktif — kapora alınıyor" : "Kapalı"}</div>
                      </div>
                      <div onClick={() => setFAyar(p => ({ ...p, kapora_aktif: !p.kapora_aktif }))} style={{ width: 44, height: 24, borderRadius: 12, background: fAyar.kapora_aktif ? "#2cb872" : "#ccc", cursor: "pointer", position: "relative", transition: "all .2s" }}>
                        <div style={{ width: 20, height: 20, borderRadius: 10, background: "#fff", position: "absolute", top: 2, left: fAyar.kapora_aktif ? 22 : 2, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }} />
                      </div>
                    </div>

                    {fAyar.kapora_aktif && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>Alt Sınır (₺)</label>
                          <input value={fAyar.kapora_alt_siniri} onChange={e => setFAyar(p => ({ ...p, kapora_alt_siniri: e.target.value }))} type="number" min="0" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, fontFamily: "inherit" }} placeholder="Örn: 500 (bu tutarın üstü için kapora)" />
                          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>Bu tutarın üzerindeki hizmetlerde kapora istenir</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>Kapora Oranı (%)</label>
                          <input value={fAyar.kapora_orani} onChange={e => setFAyar(p => ({ ...p, kapora_orani: e.target.value }))} type="number" min="1" max="100" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, fontFamily: "inherit" }} />
                          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>Hizmet bedelinin yüzde kaçı kapora olarak alınacak</div>
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>İptal Süresi (saat)</label>
                          <input value={fAyar.kapora_iptal_saati} onChange={e => setFAyar(p => ({ ...p, kapora_iptal_saati: e.target.value }))} type="number" min="0" style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, fontFamily: "inherit" }} />
                          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>Bu süreden sonra yapılan iptallerde kapora yanar</div>
                        </div>
                      </div>
                    )}

                    <button onClick={kaydet} style={{ marginTop: 18, width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: fKaydedildi ? "#2cb872" : "var(--gradient)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .3s" }}>
                      {fKaydedildi ? "✓ Kaydedildi" : "Kaydet"}
                    </button>
                  </div>

                  {/* ─── DİJİTAL CÜZDAN ─── */}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💰</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Dijital Cüzdan</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>Kapora gelir takibi</div>
                      </div>
                    </div>

                    {/* Net Bakiye - büyük kart */}
                    <div style={{ background: "linear-gradient(135deg, #10b981 0%, #059669 100%)", borderRadius: 14, padding: "24px 20px", marginBottom: 16, color: "#fff", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
                      <div style={{ fontSize: 11, fontWeight: 500, opacity: .8, marginBottom: 4 }}>Kullanılabilir Bakiye</div>
                      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>{tl(cz.net_bakiye)}</div>
                      {cz.net_bakiye >= 500 && <div style={{ marginTop: 8, fontSize: 11, background: "rgba(255,255,255,.2)", display: "inline-block", padding: "3px 10px", borderRadius: 20 }}>✓ Çekim yapılabilir</div>}
                    </div>

                    {/* Detay satırları */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                      {[
                        { label: "Toplam Biriken Kapora", value: tl(cz.toplam_kapora), color: "#10b981", icon: "📥" },
                        { label: "SıraGO Hizmet Bedeli", value: `- ${tl(cz.sirago_kesinti)}`, color: "#ef4444", icon: "🏷️" },
                        { label: "Paket Ücretinden Mahsup", value: `- ${tl(cz.mahsup_edilen)}`, color: "#f59e0b", icon: "🔄" },
                        { label: "Çekilen Tutar", value: `- ${tl(cz.cekilen)}`, color: "#6b7280", icon: "💸" },
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface2)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>{item.icon}</span>
                            <span style={{ fontSize: 12, color: "var(--dim)" }}>{item.label}</span>
                          </div>
                          <span style={{ fontWeight: 700, fontSize: 13, color: item.color }}>{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Hakediş butonu */}
                    <button
                      disabled={cz.net_bakiye < 500}
                      onClick={() => setHakedisAcik(true)}
                      style={{
                        marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                        background: cz.net_bakiye >= 500 ? "linear-gradient(135deg, #f59e0b, #d97706)" : "var(--surface3)",
                        color: cz.net_bakiye >= 500 ? "#fff" : "var(--dim)", fontWeight: 700, fontSize: 13,
                        cursor: cz.net_bakiye >= 500 ? "pointer" : "not-allowed", fontFamily: "inherit"
                      }}
                    >
                      {cz.net_bakiye >= 500 ? "💳 Bakiye Çekim Talebi Oluştur" : `Minimum 500 ₺ gerekli (${tl(cz.net_bakiye)})`}
                    </button>
                  </div>
                </div>

                {/* ─── HAKEDİŞ FORMU MODAL ─── */}
                {hakedisAcik && (
                  <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setHakedisAcik(false)}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg)", borderRadius: 16, padding: 28, width: 400, maxWidth: "90vw", border: "1px solid var(--border)" }}>
                      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20, color: "var(--text)" }}>💳 Bakiye Çekim Talebi</div>
                      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>Çekilecek tutar: <strong style={{ color: "#10b981" }}>{tl(cz.net_bakiye)}</strong></div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>Ad Soyad</label>
                          <input value={hakedisForm.ad_soyad} onChange={e => setHakedisForm(p => ({ ...p, ad_soyad: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, fontFamily: "inherit" }} placeholder="Hesap sahibi adı" />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "block", marginBottom: 4 }}>IBAN</label>
                          <input value={hakedisForm.iban} onChange={e => setHakedisForm(p => ({ ...p, iban: e.target.value }))} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, fontFamily: "inherit", letterSpacing: 1 }} placeholder="TR00 0000 0000 0000 0000 00" />
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                        <button onClick={() => setHakedisAcik(false)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Vazgeç</button>
                        <button onClick={hakedisTalep} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Talep Oluştur</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── SON KAPORA ÖDEMELERİ ─── */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>📋</span> Son Kapora İşlemleri
                  </div>
                  {odemeler.length === 0 ? (
                    <div style={{ textAlign: "center", padding: 30, color: "var(--dim)", fontSize: 13 }}>Henüz kapora işlemi yok</div>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--dim)", fontWeight: 600 }}>Müşteri</th>
                            <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--dim)", fontWeight: 600 }}>Hizmet</th>
                            <th style={{ textAlign: "left", padding: "8px 10px", color: "var(--dim)", fontWeight: 600 }}>Tarih</th>
                            <th style={{ textAlign: "right", padding: "8px 10px", color: "var(--dim)", fontWeight: 600 }}>Tutar</th>
                            <th style={{ textAlign: "center", padding: "8px 10px", color: "var(--dim)", fontWeight: 600 }}>Durum</th>
                          </tr>
                        </thead>
                        <tbody>
                          {odemeler.map((o, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "10px" }}>{o.musteri_isim}</td>
                              <td style={{ padding: "10px", color: "var(--dim)" }}>{o.hizmet_isim || "-"}</td>
                              <td style={{ padding: "10px", color: "var(--dim)" }}>{o.tarih ? new Date(o.tarih).toLocaleDateString("tr-TR") : "-"}</td>
                              <td style={{ padding: "10px", textAlign: "right", fontWeight: 700 }}>{tl(o.kapora_tutari)}</td>
                              <td style={{ padding: "10px", textAlign: "center" }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                                  background: o.kapora_durumu === "odendi" ? "rgba(44,184,114,.1)" : o.kapora_durumu === "bekliyor" ? "rgba(245,158,11,.1)" : "rgba(239,68,68,.1)",
                                  color: o.kapora_durumu === "odendi" ? "#2cb872" : o.kapora_durumu === "bekliyor" ? "#f59e0b" : "#ef4444"
                                }}>
                                  {o.kapora_durumu === "odendi" ? "✓ Ödendi" : o.kapora_durumu === "bekliyor" ? "⏳ Bekliyor" : "↩ İade"}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ─── HAKEDİŞ TALEPLERİ GEÇMİŞİ ─── */}
                {talepler.length > 0 && (
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>📄</span> Hakediş Taleplerim
                    </div>
                    {talepler.map((t, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: 10, background: "var(--surface2)", marginBottom: 8 }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{tl(t.tutar)}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>{new Date(t.talep_tarihi).toLocaleDateString("tr-TR")} — IBAN: {t.iban?.slice(0, 8)}****</div>
                        </div>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                          background: t.durum === "onaylandi" ? "rgba(44,184,114,.1)" : t.durum === "reddedildi" ? "rgba(239,68,68,.1)" : "rgba(245,158,11,.1)",
                          color: t.durum === "onaylandi" ? "#2cb872" : t.durum === "reddedildi" ? "#ef4444" : "#f59e0b"
                        }}>
                          {t.durum === "onaylandi" ? "✓ Onaylandı" : t.durum === "reddedildi" ? "✗ Reddedildi" : "⏳ Bekliyor"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}

          {/* ── SMS ── */}
          {sayfa === "sms" && (
            <SmsAyarlari api={api} />
          )}

          {/* ── GECE RAPORU ── */}
          {sayfa === "geceraporu" && (
            <GeceRaporu api={api} />
          )}

          {/* ── YORUM AVCISI ── */}
          {sayfa === "yorumavcisi" && (
            <YorumAvcisi api={api} />
          )}

          {/* ── KAYIP MÜŞTERİ ── */}
          {sayfa === "winback" && (
            <Winback api={api} />
          )}

          {/* ── SADAKAT ── */}
          {sayfa === "sadakat" && (
            <Sadakat api={api} />
          )}

          {/* ── KASA ── */}
          {sayfa === "kasa" && (
            <Kasa api={api} />
          )}

          {/* ── AYARLAR ── */}
          {sayfa === "ayarlar" && (
            <Settings ayarlar={ayarlar} setAyarlar={setAyarlar} paketDurum={paketDurum} api={api} />
          )}

          {/* ── DESTEK ── */}
          {sayfa === "destek" && (() => {
            const oncelikRenk = { acil: "#ef4444", yuksek: "#f59e0b", normal: "#3b82f6", dusuk: "#64748b" };
            const durumRenk = { acik: "#f59e0b", yanitlandi: "#3b82f6", cozuldu: "#10b981", kapali: "#64748b" };
            const durumLabel = { acik: "Açık", yanitlandi: "Yanıtlandı", cozuldu: "Çözüldü", kapali: "Kapalı" };
            const durumIcon = { acik: "🟡", yanitlandi: "💬", cozuldu: "✅", kapali: "🔒" };
            const seciliTalep = destekTaleplerim.find(t => t.id === destekSecili);
            return (
            <div style={{ display: "flex", gap: 0, height: "calc(100vh - 80px)", background: "var(--bg)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
              {/* Sol Panel — Talep Listesi */}
              <div style={{ width: 320, minWidth: 280, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
                <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Destek</h2>
                    <button onClick={() => { setDestekFormAcik(true); setDestekSecili(null); }} style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>+ Yeni</button>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {[["hepsi","Tümü"],["acik","Açık"],["yanitlandi","Yanıtlı"]].map(([v,l]) => (
                      <button key={v} onClick={() => setDestekFiltre2(v)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: destekFiltre2 === v ? "var(--primary)" : "var(--bg)", color: destekFiltre2 === v ? "#fff" : "var(--muted)" }}>{l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {destekTaleplerim.filter(t => destekFiltre2 === "hepsi" ? true : destekFiltre2 === "acik" ? t.durum === "acik" : t.durum === "yanitlandi").length === 0 && (
                    <div style={{ padding: 30, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>Talep yok</div>
                  )}
                  {destekTaleplerim.filter(t => destekFiltre2 === "hepsi" ? true : destekFiltre2 === "acik" ? t.durum === "acik" : t.durum === "yanitlandi").map(t => (
                    <div key={t.id} onClick={() => { setDestekSecili(t.id); setDestekFormAcik(false); }} style={{
                      padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                      background: destekSecili === t.id ? "rgba(99,102,241,.08)" : "transparent",
                      borderLeft: destekSecili === t.id ? "3px solid var(--primary)" : "3px solid transparent",
                      transition: "all .15s"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>#{t.id} {t.konu}</span>
                        <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", marginLeft: 8 }}>{new Date(t.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (oncelikRenk[t.oncelik]||"#64748b") + "18", color: oncelikRenk[t.oncelik]||"#64748b", fontWeight: 700 }}>{t.oncelik}</span>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (durumRenk[t.durum]||"#64748b") + "18", color: durumRenk[t.durum]||"#64748b", fontWeight: 700 }}>{durumIcon[t.durum]} {durumLabel[t.durum]}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.mesaj?.slice(0,60)}{t.mesaj?.length > 60 ? "..." : ""}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sağ Panel — Detay / Chat / Yeni Form */}
              <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
                {destekFormAcik ? (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <form onSubmit={destekGonder} style={{ width: "100%", maxWidth: 500, background: "var(--surface)", borderRadius: 16, padding: 28, border: "1px solid var(--border)" }}>
                      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, color: "var(--text)" }}>Yeni Destek Talebi</h3>
                      <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 20 }}>Sorununuzu detaylı açıklayın, en kısa sürede dönüş yapacağız.</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, display: "block" }}>Konu</label>
                          <input value={yeniDestek.konu} onChange={e => setYeniDestek({...yeniDestek, konu: e.target.value})} placeholder="Sorunun kısa başlığı..." className="input" required style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, display: "block" }}>Açıklama</label>
                          <textarea value={yeniDestek.mesaj} onChange={e => setYeniDestek({...yeniDestek, mesaj: e.target.value})} placeholder="Sorununuzu olabildiğince detaylı açıklayın..." className="input" style={{ minHeight: 120, resize: "vertical", width: "100%" }} required />
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4, display: "block" }}>Öncelik</label>
                            <select value={yeniDestek.oncelik} onChange={e => setYeniDestek({...yeniDestek, oncelik: e.target.value})} className="input" style={{ width: "100%" }}>
                              <option value="dusuk">🟢 Düşük</option>
                              <option value="normal">🔵 Normal</option>
                              <option value="yuksek">🟡 Yüksek</option>
                              <option value="acil">🔴 Acil</option>
                            </select>
                          </div>
                          <button type="submit" style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Gönder</button>
                          <button type="button" onClick={() => setDestekFormAcik(false)} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--muted)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
                        </div>
                      </div>
                    </form>
                  </div>
                ) : seciliTalep ? (
                  <>
                    {/* Header */}
                    <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>#{seciliTalep.id} {seciliTalep.konu}</span>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: (durumRenk[seciliTalep.durum]||"#64748b") + "18", color: durumRenk[seciliTalep.durum]||"#64748b", fontWeight: 700 }}>{durumIcon[seciliTalep.durum]} {durumLabel[seciliTalep.durum]}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                          <span style={{ padding: "1px 6px", borderRadius: 4, background: (oncelikRenk[seciliTalep.oncelik]||"#64748b") + "15", color: oncelikRenk[seciliTalep.oncelik], fontWeight: 600, fontSize: 10 }}>{seciliTalep.oncelik}</span>
                          <span style={{ marginLeft: 8 }}>Oluşturulma: {new Date(seciliTalep.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                        </div>
                      </div>
                    </div>

                    {/* Chat area */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                      {/* Müşteri mesajı */}
                      <div style={{ display: "flex", gap: 10, maxWidth: "80%" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>S</div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>Siz · {new Date(seciliTalep.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{seciliTalep.mesaj}</div>
                        </div>
                      </div>

                      {/* Admin yanıtı */}
                      {seciliTalep.admin_yanit && (
                        <div style={{ display: "flex", gap: 10, maxWidth: "80%", alignSelf: "flex-end", flexDirection: "row-reverse" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>SA</div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>SıraGO Destek · {seciliTalep.admin_yanit_tarihi ? new Date(seciliTalep.admin_yanit_tarihi).toLocaleString("tr-TR") : ""}</div>
                            <div style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.15)", borderRadius: "14px 4px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "left" }}>{seciliTalep.admin_yanit}</div>
                          </div>
                        </div>
                      )}

                      {/* Durum bilgisi */}
                      {(seciliTalep.durum === "cozuldu" || seciliTalep.durum === "kapali") && (
                        <div style={{ textAlign: "center", padding: "10px 0" }}>
                          <span style={{ fontSize: 11, color: "var(--dim)", background: "var(--surface)", padding: "4px 12px", borderRadius: 8, border: "1px solid var(--border)" }}>
                            {seciliTalep.durum === "cozuldu" ? "✅ Bu talep çözüldü olarak işaretlendi" : "🔒 Bu talep kapatıldı"}
                          </span>
                        </div>
                      )}

                      {!seciliTalep.admin_yanit && seciliTalep.durum === "acik" && (
                        <div style={{ textAlign: "center", padding: "20px 0" }}>
                          <div style={{ fontSize: 13, color: "var(--dim)" }}>⏳ Yanıt bekleniyor...</div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Genellikle 24 saat içinde dönüş yapılır.</div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--dim)" }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>Destek Merkezi</div>
                    <div style={{ fontSize: 12 }}>Bir talep seçin veya yeni talep oluşturun</div>
                  </div>
                )}
              </div>
            </div>
            );
          })()}

        </div>
      </div>

      {/* Paket Karşılaştırma Modal */}
      {paketModal && (
        <div onClick={() => setPaketModal(false)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content">
            <div className="modal-header">
              <h2>Paketler</h2>
              <button onClick={() => setPaketModal(false)} className="modal-close">✕</button>
            </div>
            <div className="price-grid-modal">
              {[
                { key: "baslangic", isim: "Başlangıç", fiyat: 299, renk: "#64748b", ozellikler: ["1 Çalışan", "200 Randevu/Ay", "Otomatik Hatırlatma", "Temel Analitik", "WhatsApp Bot"], ozellikYok: ["Telegram Desteği", "Çok Dilli Destek"] },
                { key: "profesyonel", isim: "Profesyonel", fiyat: 999, renk: "#3b82f6", ozellikler: ["3 Çalışan", "Sınırsız Randevu", "Telegram Desteği", "Gelişmiş Analitik", "Google Calendar Sync", "5 Dil Desteği"], ozellikYok: [] },
                { key: "kurumsal", isim: "Kurumsal", fiyat: null, renk: "#f59e0b", ozellikler: ["Sınırsız Çalışan", "Sınırsız Randevu", "Özel API Entegrasyonu", "Özel Eğitim & Onboarding", "SLA Garantisi", "12+ Dil Desteği"], ozellikYok: [] },
              ].map(p => {
                const aktif = paketDurum?.paket === p.key;
                return (
                  <div key={p.key} className={`price-item${aktif ? ' active' : ''}`} style={{ background: aktif ? `${p.renk}10` : "var(--bg)", borderColor: aktif ? p.renk : undefined, color: p.renk }}>
                    {aktif && <div className="price-tag" style={{ background: p.renk }}>MEVCUT</div>}
                    {p.key === "profesyonel" && !aktif && <div className="price-tag" style={{ background: "var(--blue)" }}>EN POPÜLER</div>}
                    <div className="p-name" style={{ color: p.renk }}>{p.isim}</div>
                    <div className="p-price">{p.fiyat ? `${p.fiyat}₺` : "Özel"}<span>{p.fiyat ? "/ay" : ""}</span></div>
                    <div className="p-divider">
                      {p.ozellikler.map((o, i) => (
                        <div key={i} className="price-feature"><span style={{ color: p.renk }}>✓</span> {o}</div>
                      ))}
                      {(p.ozellikYok || []).map((o, i) => (
                        <div key={`yok-${i}`} className="price-feature" style={{ opacity: .4, textDecoration: "line-through" }}><span style={{ color: "var(--red)" }}>✕</span> {o}</div>
                      ))}
                    </div>
                    {!aktif && p.fiyat && (
                      <button className="btn btn-block mt-8" style={{ background: p.renk, color: "#fff" }} onClick={() => {
                        const token = localStorage.getItem("randevugo_token");
                        const baseUrl = import.meta.env.VITE_API_URL || "https://randevugo-api.onrender.com/api";
                        window.open(`${baseUrl}/odeme/shopier/baslat?token=${token}&paket=${p.key}`, "_blank");
                        setPaketModal(false);
                      }}>
                        {p.key === "baslangic" ? "Başla" : "Yükselt"}
                      </button>
                    )}
                    {!aktif && !p.fiyat && (
                      <button className="btn btn-block mt-8" style={{ background: p.renk, color: "#fff" }} onClick={() => {
                        window.open("https://wa.me/905379681840?text=Merhaba%2C%20Kurumsal%20paket%20hakk%C4%B1nda%20bilgi%20almak%20istiyorum.", "_blank");
                        setPaketModal(false);
                      }}>
                        WhatsApp ile Görüşün
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── ÖDEME DUVARI ── */}
      {odemeGerekli && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
          background: "rgba(22,5,39,.7)", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 20
        }}>
          <div style={{
            background: "var(--surface)", borderRadius: 20, padding: "36px 32px",
            maxWidth: 440, width: "100%", textAlign: "center",
            boxShadow: "0 24px 64px rgba(22,5,39,.25)",
            animation: "fadeIn .25s ease"
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", marginBottom: 8 }}>Ödeme Gerekli</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 20 }}>
              Bu ay için ödemeniz bulunmamaktadır. Paneli kullanmaya devam etmek için lütfen ödeme yapın.
            </p>
            <div style={{
              background: "rgba(239,68,68,.05)", border: "1px solid rgba(239,68,68,.15)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left"
            }}>
              <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 6 }}>⚠️ Kısıtlanan Özellikler:</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                Randevular, Hizmetler, Çalışanlar, Müşteriler, Bot İşlemleri, Kampanyalar ve diğer tüm panel özellikleri
              </div>
            </div>
            <div style={{
              background: "rgba(84,224,151,.05)", border: "1px solid rgba(84,224,151,.15)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left"
            }}>
              <div style={{ fontSize: 12, color: "#2cb872", fontWeight: 600, marginBottom: 6 }}>✅ Erişilebilir:</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                Dashboard istatistikleri, Ayarlar, Ödeme sayfası, Destek
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => { setOdemeGerekli(false); setSayfa("anasayfa"); }} style={{
                padding: "12px 24px", borderRadius: 12, border: "1px solid var(--border)",
                background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit"
              }}>Dashboard'a Dön</button>
              <button onClick={() => {
                const token = localStorage.getItem("randevugo_token");
                const baseUrl = import.meta.env.VITE_API_URL || "https://randevugo-api.onrender.com/api";
                window.open(`${baseUrl}/odeme/shopier/baslat?token=${token}`, "_blank");
              }} style={{
                padding: "12px 24px", borderRadius: 12, border: "none",
                background: "var(--gradient-accent)", color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "0 4px 16px rgba(254,87,150,.3)"
              }}>💳 Hemen Öde</button>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "var(--dim)" }}>
              İlk 7 gün ücretsiz deneme süresi dahildir
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==================== SUPER ADMIN PANEL ====================
function SuperAdminPanel({ kullanici }) {
  const [sayfa, setSayfa] = useState("dashboard");
  const [isletmeler, setIsletmeler] = useState([]);
  const [odemeler, setOdemeler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yeniIsletme, setYeniIsletme] = useState({ isim: "", telefon: "", adres: "", ilce: "", kategori: "berber", email: "", sifre: "" });
  const [formAcik, setFormAcik] = useState(false);
  const [isletmeFiltre, setIsletmeFiltre] = useState("hepsi");
  const [isletmeArama, setIsletmeArama] = useState("");
  const [isletmeKategoriFiltre, setIsletmeKategoriFiltre] = useState("hepsi");
  const [isletmeGorunum, setIsletmeGorunum] = useState("kategori");
  const [odemeFiltre, setOdemeFiltre] = useState("hepsi");
  const [yeniOdeme, setYeniOdeme] = useState({ isletme_id: "", tutar: "", donem: new Date().toISOString().slice(0, 7) });
  const [odemeFormAcik, setOdemeFormAcik] = useState(false);
  // SaaS Metrikleri
  const [saasMetrik, setSaasMetrik] = useState(null);
  // Numara yönetimi
  const [numaralar, setNumaralar] = useState([]);
  const [numaraFormAcik, setNumaraFormAcik] = useState(false);
  const [yeniNumara, setYeniNumara] = useState({ isim: "", telefon: "" });
  // Audit Log
  const [auditLoglar, setAuditLoglar] = useState([]);
  const [auditToplam, setAuditToplam] = useState(0);
  const [auditFiltre, setAuditFiltre] = useState("");
  // Sistem Durumu
  const [sistemDurum, setSistemDurum] = useState(null);
  // Destek Talepleri
  const [destekTalepler, setDestekTalepler] = useState([]);
  const [destekFiltre, setDestekFiltre] = useState("hepsi");
  const [destekYanitAcik, setDestekYanitAcik] = useState(null);
  const [destekYanitMetin, setDestekYanitMetin] = useState("");
  // Dinamik Paketler
  const [paketTanimlar, setPaketTanimlar] = useState([]);
  const [paketFormAcik, setPaketFormAcik] = useState(false);
  const [yeniPaket, setYeniPaket] = useState({ kod:"", isim:"", fiyat:"", calisan_limit:1, hizmet_limit:5, aylik_randevu_limit:100, bot_aktif:true, hatirlatma:false, istatistik:false, export_aktif:false, ozellikler:"", sira:0 });
  const [duzenlePaket, setDuzenlePaket] = useState(null);
  // Zombi Müşteriler
  const [zombiler, setZombiler] = useState([]);
  const [zombiSecili, setZombiSecili] = useState([]);
  const [zombiMesajModal, setZombiMesajModal] = useState(false);
  const [zombiMesajMetni, setZombiMesajMetni] = useState('');
  const [zombiKanal, setZombiKanal] = useState('whatsapp');
  // Referans Sistemi
  const [referanslar, setReferanslar] = useState([]);
  // Duyurular
  const [duyurular, setDuyurular] = useState([]);
  const [duyuruFormAcik, setDuyuruFormAcik] = useState(false);
  const [yeniDuyuru, setYeniDuyuru] = useState({ baslik:"", mesaj:"", tip:"bilgi", hedef:"hepsi" });
  // Avcı Bot state
  const [avciListe, setAvciListe] = useState([]);
  const [avciStats, setAvciStats] = useState(null);
  const [avciGunluk, setAvciGunluk] = useState([]);
  const [avciFiltre, setAvciFiltre] = useState("hepsi");
  const [avciSiralama, setAvciSiralama] = useState("skor_desc");
  const [avciTaramaAcik, setAvciTaramaAcik] = useState(false);
  const [avciTarama, setAvciTarama] = useState({ sehir: "İstanbul", ilce: "", kategori: "berber" });
  const [avciTaramaSonuc, setAvciTaramaSonuc] = useState(null);
  const [avciTaramaYukleniyor, setAvciTaramaYukleniyor] = useState(false);
  const [avciSecili, setAvciSecili] = useState(null);
  const [avciTab, setAvciTab] = useState("liste");
  const [avciKaynak, setAvciKaynak] = useState("hepsi");
  const [avciKategoriFiltre, setAvciKategoriFiltre] = useState("hepsi");
  const [topluTaramaAcik, setTopluTaramaAcik] = useState(false);
  const [topluKategoriler, setTopluKategoriler] = useState(["berber","kuaför","güzellik salonu","dövme","diş kliniği"]);
  const [topluSehir, setTopluSehir] = useState("İstanbul");
  const [topluSonuc, setTopluSonuc] = useState(null);
  const [topluYukleniyor, setTopluYukleniyor] = useState(false);
  const [sosyalAcik, setSosyalAcik] = useState(false);
  const [sosyalTarama, setSosyalTarama] = useState({ sehir: "İstanbul", ilce: "", kategori: "berber", platform: "instagram" });
  const [sosyalSonuc, setSosyalSonuc] = useState(null);
  const [sosyalYukleniyor, setSosyalYukleniyor] = useState(false);
  // İletişim mesajları state
  const [iletisimMesajlar, setIletisimMesajlar] = useState([]);
  const [iletisimFiltre, setIletisimFiltre] = useState("hepsi");
  // Satış Bot state
  const [satisBotDurum, setSatisBotDurum] = useState(null);
  const [satisBotKonusmalar, setSatisBotKonusmalar] = useState([]);
  const [satisBotYukleniyor, setSatisBotYukleniyor] = useState(false);
  const [wpYokListe, setWpYokListe] = useState([]);
  // Müşteri Aktivite
  const [aktiviteVeri, setAktiviteVeri] = useState(null);
  const [aktiviteFiltre, setAktiviteFiltre] = useState("hepsi");
  // Bildirim Merkezi
  const [bildirimVeri, setBildirimVeri] = useState(null);
  const [bildirimFiltre, setBildirimFiltre] = useState("hepsi");
  // İşletme Detay
  const [detayIsletme, setDetayIsletme] = useState(null);
  const [detayTab, setDetayTab] = useState("genel");
  const [detayNot, setDetayNot] = useState("");
  // Ödeme Profil
  const [odemeProfil, setOdemeProfil] = useState(null);
  const [ertelemeModal, setErtelemeModal] = useState(null);
  const [ertelemeDonem, setErtelemeDonem] = useState("");
  const [ertelemeSebep, setErtelemeSebep] = useState("");

  const isletmeDetayYukle = async (id) => {
    try {
      const d = await api.get(`/admin/isletmeler/${id}/detay`);
      setDetayIsletme(d);
      setDetayNot(d.isletme?.admin_notu || "");
      setDetayTab("genel");
    } catch(e) { console.log("Detay yükleme hatası:", e); }
  };

  const odemeProfiliYukle = async (id) => {
    try { const d = await api.get(`/admin/isletmeler/${id}/odeme-profili`); setOdemeProfil(d); } catch(e) { console.log("Ödeme profil hatası:", e); }
  };

  const aktiviteYukle = async () => {
    try { const d = await api.get("/admin/musteri-aktivite"); if(d && d.ozet) setAktiviteVeri(d); else console.log("Aktivite verisi eksik:", d); } catch(e) { console.log("Aktivite yükleme hatası:", e); }
  };
  const bildirimleriYukle = async () => {
    try { const d = await api.get("/admin/bildirimler"); setBildirimVeri(d); } catch(e) { console.log("Bildirim yükleme hatası:", e); }
  };

  const isletmeleriYukle = async () => {
    setYukleniyor(true);
    const d = await api.get("/admin/isletmeler");
    setIsletmeler(d.isletmeler || []);
    setYukleniyor(false);
  };

  const odemeleriYukle = async () => {
    setYukleniyor(true);
    const d = await api.get("/admin/odemeler");
    setOdemeler(d.odemeler || []);
    setYukleniyor(false);
  };

  const saasMetrikleriYukle = async () => {
    try { const d = await api.get("/admin/saas-metrikleri"); setSaasMetrik(d); } catch (e) { console.log("SaaS metrikleri yükleme hatası:", e); }
  };

  const numaralariYukle = async () => {
    try { const d = await api.get("/admin/satis-bot/numaralar"); setNumaralar(d.numaralar || []); } catch (e) { console.log("Numara yükleme hatası:", e); }
  };

  useEffect(() => {
    isletmeleriYukle();
    odemeleriYukle();
    saasMetrikleriYukle();
    destekYukle();
    iletisimYukle();
    bildirimleriYukle();
  }, []);

  const avciListeYukle = async () => {
    const d = await api.get(`/admin/avci/liste?durum=${avciFiltre}&kategori=${avciKategoriFiltre}&siralama=${avciSiralama}&kaynak=${avciKaynak}&limit=100`);
    setAvciListe(d.potansiyel_musteriler || []);
  };
  const avciStatsYukle = async () => {
    const d = await api.get("/admin/avci/istatistik");
    setAvciStats(d);
  };
  const avciGunlukYukle = async () => {
    const d = await api.get("/admin/avci/gunluk?limit=10");
    setAvciGunluk(d.gunluk_liste || []);
  };

  const iletisimYukle = async () => {
    const d = await api.get("/admin/iletisim");
    setIletisimMesajlar(d.mesajlar || []);
  };

  const auditLogYukle = async () => {
    try { const d = await api.get(`/admin/audit-log?limit=50&islem=${auditFiltre}`); setAuditLoglar(d.loglar || []); setAuditToplam(d.toplam || 0); } catch(e) {}
  };
  const sistemDurumuYukle = async () => {
    try { const d = await api.get("/admin/sistem-durumu"); setSistemDurum(d); } catch(e) {}
  };
  const destekYukle = async () => {
    try { const d = await api.get(`/admin/destek?durum=${destekFiltre}`); setDestekTalepler(d.talepler || []); } catch(e) {}
  };
  const paketleriYukle = async () => {
    try { const d = await api.get("/admin/paketler"); setPaketTanimlar(d.paketler || []); } catch(e) {}
  };
  const zombileriYukle = async () => {
    try { const d = await api.get("/admin/zombiler"); setZombiler(d.zombiler || []); } catch(e) {}
  };
  const referanslariYukle = async () => {
    try { const d = await api.get("/admin/referanslar"); setReferanslar(d.referanslar || []); } catch(e) {}
  };
  const duyurulariYukle = async () => {
    try { const d = await api.get("/admin/duyurular"); setDuyurular(d.duyurular || []); } catch(e) {}
  };

  const satisBotYukle = async () => {
    try {
      const d = await api.get("/admin/satis-bot/durum");
      if (d && !d.hata) setSatisBotDurum(d);
      const k = await api.get("/admin/satis-bot/konusmalar");
      setSatisBotKonusmalar(k?.konusmalar || []);
      const wp = await api.get("/admin/satis-bot/wp-yok");
      setWpYokListe(wp?.liste || []);
    } catch (e) { console.log("satis bot yükleme hatası:", e); }
  };

  // Satış Bot polling — sayfa açıkken her 10sn durum kontrol et
  useEffect(() => {
    if (sayfa !== "satisBot") return;
    satisBotYukle();
    const interval = setInterval(satisBotYukle, 10000);
    return () => clearInterval(interval);
  }, [sayfa]);

  useEffect(() => {
    if (sayfa === "dashboard") saasMetrikleriYukle();
    if (sayfa === "isletmeler") isletmeleriYukle();
    if (sayfa === "odemeler") odemeleriYukle();
    if (sayfa === "avci") { avciStatsYukle(); avciListeYukle(); avciGunlukYukle(); }
    if (sayfa === "iletisim") iletisimYukle();
    if (sayfa === "satisBot") numaralariYukle();
    if (sayfa === "auditLog") auditLogYukle();
    if (sayfa === "sistemDurum") sistemDurumuYukle();
    if (sayfa === "destek") destekYukle();
    if (sayfa === "paketler") paketleriYukle();
    if (sayfa === "zombiler") zombileriYukle();
    if (sayfa === "referanslar") referanslariYukle();
    if (sayfa === "duyurular") duyurulariYukle();
    if (sayfa === "aktivite") aktiviteYukle();
    if (sayfa === "bildirimler") bildirimleriYukle();
  }, [sayfa, avciFiltre, avciSiralama, avciKategoriFiltre, avciKaynak, auditFiltre, destekFiltre]);

  const isletmeEkle = async (e) => {
    e.preventDefault();
    const res = await api.post("/admin/isletmeler", yeniIsletme);
    if (res.hata) { alert("Hata: " + res.hata); return; }
    setYeniIsletme({ isim: "", telefon: "", adres: "", ilce: "", kategori: "berber", email: "", sifre: "" });
    setFormAcik(false);
    isletmeleriYukle();
  };

  const isletmeSil = async (id, isim) => {
    if (!confirm(`"${isim}" işletmesini silmek istediğinize emin misiniz?\nTüm randevuları ve müşteri verileri de silinecek!`)) return;
    await api.del(`/admin/isletmeler/${id}`);
    isletmeleriYukle();
  };

  const aktifToggle = async (i) => {
    await api.put(`/admin/isletmeler/${i.id}`, { aktif: !i.aktif });
    isletmeleriYukle();
  };

  const paketDegistir = async (id, paket) => {
    await api.put(`/admin/isletmeler/${id}`, { paket });
    isletmeleriYukle();
  };

  const odemeGuncelle = async (id, durum) => {
    await api.put(`/admin/odemeler/${id}`, { durum });
    odemeleriYukle();
  };

  const odemeEkle = async (e) => {
    e.preventDefault();
    await api.post("/admin/odemeler", yeniOdeme);
    setYeniOdeme({ isletme_id: "", tutar: "", donem: new Date().toISOString().slice(0, 7) });
    setOdemeFormAcik(false);
    odemeleriYukle();
  };

  const [mobileOpen, setMobileOpen] = useState(false);

  const cikisYap = () => { localStorage.removeItem("randevugo_token"); api.token = null; window.location.reload(); };

  const SVGA = {
    dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    isletmeler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    odemeler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    avci: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    iletisim: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
    satisBot: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    destek: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5v2"/><path d="M15 11v2"/><path d="M15 17v2"/><path d="M5 5h14a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/><path d="M5 12h14a2 2 0 012 2v3a2 2 0 01-2 2H5a2 2 0 01-2-2v-3a2 2 0 012-2z"/></svg>,
    paketler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
    zombiler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="17" y1="11" x2="22" y2="11"/></svg>,
    referanslar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    duyurular: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
    auditLog: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
    sistemDurum: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
    aktivite: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    bildirimler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="3" r="3" fill="currentColor"/></svg>,
  };

  const okunmamisSayi = iletisimMesajlar.filter(m => !m.okundu).length;

  const menuItems = [
    { id: "dashboard", icon: SVGA.dashboard, label: "Dashboard" },
    { id: "bildirimler", icon: SVGA.bildirimler, label: "Bildirimler" },
    { id: "isletmeler", icon: SVGA.isletmeler, label: "İşletmeler" },
    { id: "aktivite", icon: SVGA.aktivite, label: "Aktivite" },
    { id: "odemeler", icon: SVGA.odemeler, label: "Ödemeler" },
    { id: "destek", icon: SVGA.destek, label: "Destek" },
    { id: "paketler", icon: SVGA.paketler, label: "Paketler" },
    { id: "zombiler", icon: SVGA.zombiler, label: "Zombiler" },
    { id: "referanslar", icon: SVGA.referanslar, label: "Referanslar" },
    { id: "duyurular", icon: SVGA.duyurular, label: "Duyurular" },
    { id: "iletisim", icon: SVGA.iletisim, label: "İletişim" },
    { id: "avci", icon: SVGA.avci, label: "Avcı Bot" },
    { id: "satisBot", icon: SVGA.satisBot, label: "Satış Bot" },
    { id: "auditLog", icon: SVGA.auditLog, label: "Audit Log" },
    { id: "sistemDurum", icon: SVGA.sistemDurum, label: "Sistem Durumu" },
  ];

  const kategoriRenk = { berber: "#3b82f6", kuafor: "#8b5cf6", guzellik: "#ec4899", spa: "#f59e0b", disci: "#10b981", veteriner: "#ef4444", diyetisyen: "#06b6d4", psikolog: "#8b5cf6", fizyoterapi: "#0ea5e9", restoran: "#f97316", cafe: "#a16207", spor: "#16a34a", egitim: "#6366f1", foto: "#d946ef", dovme: "#e11d48", oto: "#64748b", hukuk: "#475569", genel: "#94a3b8" };
  const kategoriLabel = { berber: "💈 Berber", kuafor: "✂️ Kuaför", guzellik: "💅 Güzellik", spa: "🧖 Spa", disci: "🦷 Diş Kliniği", veteriner: "🐾 Veteriner", diyetisyen: "🥗 Diyetisyen", psikolog: "🧠 Psikolog", fizyoterapi: "🏥 Fizyoterapi", restoran: "🍽️ Restoran", cafe: "☕ Kafe", spor: "🏋️ Spor", egitim: "📚 Eğitim", foto: "📸 Fotoğraf", dovme: "🎨 Dövme", oto: "🚗 Oto Servis", hukuk: "⚖️ Hukuk", genel: "🏢 Genel" };
  const paketRenk = { baslangic: "#64748b", profesyonel: "#3b82f6", premium: "#f59e0b" };
  const paketFiyat = { baslangic: 299, profesyonel: 599, premium: 999 };
  const odemeRenk = { odendi: "#10b981", bekliyor: "#f59e0b", gecikti: "#ef4444", havale_bekliyor: "#818cf8", basarisiz: "#ef4444", odeme_bekliyor: "#f59e0b" };
  const odemeLabel = { odendi: "Ödendi ✓", bekliyor: "Bekliyor", gecikti: "Gecikti!", havale_bekliyor: "Havale Onay Bekliyor", basarisiz: "Başarısız", odeme_bekliyor: "Ödeme Bekliyor" };

  const buAy = new Date().toISOString().slice(0, 7);
  const buAyOdeyenler = odemeler.filter(o => o.donem === buAy && o.durum === "odendi");
  const buAyOdemeyenler = isletmeler.filter(i => i.aktif && !odemeler.find(o => o.isletme_id == i.id && o.donem === buAy && o.durum === "odendi"));
  const toplamGelir = odemeler.filter(o => o.durum === "odendi").reduce((s, o) => s + parseFloat(o.tutar || 0), 0);
  const buAyGelir = buAyOdeyenler.reduce((s, o) => s + parseFloat(o.tutar || 0), 0);

  const acikDestekSayi = destekTalepler.filter(t => t.durum === 'acik').length;
  const yuksekBildirimSayi = bildirimVeri?.ozet?.yuksek || 0;
  const badgeSayilari = {
    odemeler: buAyOdemeyenler.length,
    destek: acikDestekSayi,
    iletisim: okunmamisSayi,
    bildirimler: yuksekBildirimSayi,
  };
  const badgeRenkleri = {
    odemeler: "#ef4444",
    destek: "#f59e0b",
    iletisim: "#818cf8",
    bildirimler: "#ef4444",
  };

  const filtreliIsletmeler = isletmeler.filter(i => {
    if (isletmeFiltre === "aktif") return i.aktif;
    if (isletmeFiltre === "pasif") return !i.aktif;
    return true;
  });

  const filtreliOdemeler = odemeler.filter(o => {
    if (odemeFiltre === "odendi") return o.durum === "odendi";
    if (odemeFiltre === "bekliyor") return o.durum === "bekliyor" || o.durum === "havale_bekliyor";
    if (odemeFiltre === "gecikti") return o.durum === "gecikti";
    if (odemeFiltre === "buay") return o.donem === buAy;
    return true;
  });

  return (
    <div className="app-shell">

      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <span className="brand-name">SıraGO</span>
        <button className="hamburger-btn" onClick={() => setMobileOpen(true)}>
          <span/><span/><span/>
        </button>
      </div>

      {/* Overlay */}
      <div className={`sidebar-overlay${mobileOpen ? ' open' : ''}`} onClick={() => setMobileOpen(false)} />

      {/* Sidebar */}
      <aside className={`sidebar${mobileOpen ? ' mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <img src={logoIcon} alt="SıraGO" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div className="sidebar-logo-text">
            <div className="brand-name">SıraGO</div>
            <div className="brand-sub">Süper Admin</div>
          </div>
        </div>
        <div className="sidebar-user">
          <div className="u-email">{kullanici.email}</div>
          <span className="sidebar-badge gold">SÜPER ADMİN</span>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(m => (
            <div key={m.id} onClick={() => { setSayfa(m.id); setMobileOpen(false); }} className={`nav-item${sayfa === m.id ? ' active' : ''}`}>
              <span className="nav-icon">{m.icon}</span>
              <span>{m.label}</span>
              {badgeSayilari[m.id] > 0
                ? <span className="nav-badge" style={{ background: badgeRenkleri[m.id] || "#ef4444" }}>{badgeSayilari[m.id]}</span>
                : sayfa === m.id && <div className="active-dot" />}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button onClick={cikisYap} className="btn btn-ghost btn-block btn-sm">Çıkış Yap</button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-panel">

        {/* DASHBOARD */}
        {sayfa === "dashboard" && (
          <>
            <div className="page-header">
              <h1>Dashboard</h1>
              <p>SaaS metrikleri ve genel bakış</p>
            </div>

            {/* Ana Metrikler */}
            <div className="stats-grid">
              <div className="stat-card green">
                <div className="sc-icon">💰</div>
                <div className="sc-label">Bu Ay Gelir</div>
                <div className="sc-val">{(saasMetrik ? saasMetrik.mrr : buAyGelir).toLocaleString("tr-TR")} ₺</div>
                {saasMetrik && saasMetrik.mrrBuyume !== 0 && (
                  <div style={{ fontSize: 11, color: saasMetrik.mrrBuyume > 0 ? "#10b981" : "#ef4444", fontWeight: 600, marginTop: 4 }}>
                    {saasMetrik.mrrBuyume > 0 ? "▲" : "▼"} %{Math.abs(saasMetrik.mrrBuyume)} geçen aya göre
                  </div>
                )}
              </div>
              <div className="stat-card amber">
                <div className="sc-icon">🏢</div>
                <div className="sc-label">Toplam İşletme</div>
                <div className="sc-val">{isletmeler.length}</div>
              </div>
              <div className="stat-card green">
                <div className="sc-icon">✅</div>
                <div className="sc-label">Aktif Abone</div>
                <div className="sc-val">{saasMetrik?.buAyOdeyen || buAyOdeyenler.length}</div>
              </div>
              <div className="stat-card blue">
                <div className="sc-icon">🆕</div>
                <div className="sc-label">Yeni Müşteri</div>
                <div className="sc-val">{saasMetrik?.yeniMusteri || 0}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Bu ay katılan</div>
              </div>
            </div>

            {/* İkinci sıra */}
            <div className="stats-grid" style={{ marginTop: 0 }}>
              <div className="stat-card" style={{ "--card-accent": "#ef4444" }}>
                <div className="sc-icon">⏳</div>
                <div className="sc-label">Ödemeyenler</div>
                <div className="sc-val" style={{ color: buAyOdemeyenler.length > 0 ? "#ef4444" : "#10b981" }}>{buAyOdemeyenler.length}</div>
              </div>
              <div className="stat-card" style={{ "--card-accent": "#ef4444" }}>
                <div className="sc-icon">📉</div>
                <div className="sc-label">Ayrılan Müşteri</div>
                <div className="sc-val" style={{ color: (saasMetrik?.churnSayi || 0) > 0 ? "#ef4444" : "#10b981" }}>{saasMetrik?.churnSayi || 0}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Geçen ay ödeyip bu ay ödemeyenler</div>
              </div>
              <div className="stat-card purple">
                <div className="sc-icon">💵</div>
                <div className="sc-label">Müşteri Başına Gelir</div>
                <div className="sc-val">{saasMetrik?.arpu || 0} ₺</div>
              </div>
              <div className="stat-card blue">
                <div className="sc-icon">📅</div>
                <div className="sc-label">Bu Ay Toplam Randevu</div>
                <div className="sc-val">{saasMetrik?.buAyToplamRandevu || 0}</div>
              </div>
            </div>

            {/* Gelir Trendi + Paket Dağılımı */}
            <div className="grid-2">
              <div className="card-dark">
                <h3 style={{ color: "var(--muted)", fontSize: 15, fontWeight: 700 }} className="mb-12">📈 Son 6 Ay Gelir Trendi</h3>
                {saasMetrik?.gelirTrendi ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 4px" }}>
                    {saasMetrik.gelirTrendi.map((g, i) => {
                      const maxGelir = Math.max(...saasMetrik.gelirTrendi.map(x => x.gelir), 1);
                      const h = Math.max(8, (g.gelir / maxGelir) * 120);
                      const ayLabel = new Date(g.donem + "-01").toLocaleDateString("tr-TR", { month: "short" });
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700 }}>{g.gelir > 0 ? g.gelir.toLocaleString("tr-TR") + "₺" : ""}</span>
                          <div style={{ width: "100%", height: h, background: i === saasMetrik.gelirTrendi.length - 1 ? "var(--green)" : "rgba(16,185,129,.3)", borderRadius: 6, transition: "height .3s" }} />
                          <span style={{ fontSize: 10, color: "var(--dim)" }}>{ayLabel}</span>
                          <span style={{ fontSize: 9, color: "var(--dim)" }}>{g.odeyen} müşteri</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p style={{ color: "var(--dim)", fontSize: 13 }}>Yükleniyor...</p>}
              </div>
              <div className="card-dark">
                <h3 style={{ color: "var(--muted)", fontSize: 15, fontWeight: 700 }} className="mb-12">📦 Paket Dağılımı</h3>
                {saasMetrik?.paketDagilimi?.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {saasMetrik.paketDagilimi.map(p => {
                      const toplam = saasMetrik.aktifIsletme || 1;
                      const yuzde = ((parseInt(p.sayi) / toplam) * 100).toFixed(0);
                      return (
                        <div key={p.paket}>
                          <div className="row row-between mb-4">
                            <span style={{ fontSize: 13, fontWeight: 600, color: paketRenk[p.paket] || "var(--text)" }}>{p.paket} ({paketFiyat[p.paket] || "?"}₺)</span>
                            <span style={{ fontSize: 12, color: "var(--dim)" }}>{p.sayi} işletme · %{yuzde}</span>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden" }}>
                            <div style={{ width: yuzde + "%", height: "100%", background: paketRenk[p.paket] || "var(--primary)", borderRadius: 4, transition: "width .5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : <p style={{ color: "var(--dim)", fontSize: 13 }}>Veri yok</p>}
              </div>
            </div>

            {/* Ödeme durumu + Son işletmeler */}
            <div className="grid-2">
              <div className="card-dark">
                <h3 style={{ color: "var(--green)", fontSize: 15, fontWeight: 700 }} className="mb-12">Bu Ay Ödeyen ({buAyOdeyenler.length})</h3>
                {buAyOdeyenler.length === 0
                  ? <p style={{ color: "var(--dim)", fontSize: 13 }}>Henüz ödeme yok.</p>
                  : buAyOdeyenler.map(o => (
                    <div key={o.id} className="row row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--bg)" }}>
                      <span style={{ color: "var(--text)", fontSize: 13 }}>{o.isletme_isim}</span>
                      <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 13 }}>{o.tutar} ₺</span>
                    </div>
                  ))}
              </div>
              <div className="card-dark">
                <h3 style={{ color: "var(--red)", fontSize: 15, fontWeight: 700 }} className="mb-12">Bu Ay Ödemeyenler ({buAyOdemeyenler.length})</h3>
                {buAyOdemeyenler.length === 0
                  ? <p style={{ color: "var(--dim)", fontSize: 13 }}>Herkes ödedi 🎉</p>
                  : buAyOdemeyenler.map(i => (
                    <div key={i.id} className="row row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--bg)" }}>
                      <span style={{ color: "var(--text)", fontSize: 13 }}>{i.isim}</span>
                      <span style={{ color: "var(--dim)", fontSize: 12 }}>{paketFiyat[i.paket] || "?"} ₺</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Son işletmeler */}
            <div className="card-dark">
              <h3 style={{ color: "var(--muted)", fontSize: 15 }} className="mb-12">Son Kayıt İşletmeler</h3>
              {isletmeler.slice(-5).reverse().map(i => (
                <div key={i.id} className="row row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--bg)" }}>
                  <div className="row gap-10">
                    <div className={`dot-sm ${i.aktif ? 'dot-green' : 'dot-red'}`} />
                    <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 600 }}>{i.isim}</span>
                    <span className="tag-xs" style={{ background: (kategoriRenk[i.kategori] || "#64748b") + "22", color: kategoriRenk[i.kategori] || "#64748b" }}>{i.kategori}</span>
                  </div>
                  <div className="row gap-8">
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>📅 {i.toplam_randevu || 0}</span>
                    <span className="tag-xs" style={{ background: (paketRenk[i.paket] || "#64748b") + "22", color: paketRenk[i.paket] || "#64748b", fontWeight: 600 }}>{i.paket}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* İŞLETMELER */}
        {sayfa === "isletmeler" && (() => {
          const aktifSayi = isletmeler.filter(i => i.aktif).length;
          const pasifSayi = isletmeler.filter(i => !i.aktif).length;
          const aramaFiltreli = filtreliIsletmeler.filter(i => {
            if (isletmeKategoriFiltre !== "hepsi" && (i.kategori || "genel") !== isletmeKategoriFiltre) return false;
            if (!isletmeArama) return true;
            const q = isletmeArama.toLowerCase();
            return (i.isim || '').toLowerCase().includes(q) || (i.telefon || '').includes(q) || (i.kategori || '').toLowerCase().includes(q) || (i.ilce || '').toLowerCase().includes(q);
          });
          // Kategoriye göre grupla
          const kategoriler = {};
          aramaFiltreli.forEach(i => {
            const kat = i.kategori || "genel";
            if (!kategoriler[kat]) kategoriler[kat] = [];
            kategoriler[kat].push(i);
          });
          const kategoriSirali = Object.keys(kategoriler).sort((a, b) => kategoriler[b].length - kategoriler[a].length);
          // Mevcut kategorileri bul (filtre chip'leri için)
          const mevcutKategoriler = [...new Set(isletmeler.map(i => i.kategori || "genel"))].sort();

          const IsletmeKart = ({ i }) => {
            const kRenk = kategoriRenk[i.kategori] || "#64748b";
            const pRenk = paketRenk[i.paket] || "#64748b";
            return (
              <div onClick={(e) => { if(e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'SELECT' || e.target.closest('select')) return; isletmeDetayYukle(i.id); }}
                style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", cursor: "pointer", transition: "all .2s", opacity: i.aktif ? 1 : 0.55, overflow: "hidden", position: "relative" }}>
                <div style={{ height: 3, background: `linear-gradient(90deg, ${kRenk}, ${kRenk}44)` }} />
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${kRenk}22, ${kRenk}08)`, border: `1px solid ${kRenk}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                      {(kategoriLabel[i.kategori] || "🏢").split(" ")[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.isim}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: i.aktif ? "#10b981" : "#ef4444", flexShrink: 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${kRenk}12`, color: kRenk, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{i.kategori || "genel"}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${pRenk}12`, color: pRenk, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{i.paket || "—"}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12, color: "var(--dim)" }}>
                        {i.telefon && <span>📞 {i.telefon}</span>}
                        {i.ilce && <span>📍 {i.ilce}</span>}
                        <span>📅 {i.toplam_randevu || 0} randevu</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                    <button onClick={async () => {
                      try {
                        const res = await api.post(`/admin/impersonate/${i.id}`);
                        if (res.hata) { alert("Hata: " + res.hata); return; }
                        if (res.token) {
                          const yeniSekme = window.open("", "_blank");
                          yeniSekme.document.write(`<html><body><script>
                            localStorage.setItem("randevugo_token","${res.token}");
                            localStorage.setItem("randevugo_impersonated","true");
                            window.location.href = window.location.origin;
                          <\/script></body></html>`);
                        }
                      } catch (e) { alert("Hata: " + e.message); }
                    }} title="Müşteri olarak giriş" style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontWeight: 700, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>👤 Giriş</button>
                    <button onClick={() => aktifToggle(i)} title={i.aktif ? "Pasife al" : "Aktif et"} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", background: i.aktif ? "rgba(16,185,129,.08)" : "rgba(245,158,11,.08)", color: i.aktif ? "#10b981" : "#f59e0b", fontWeight: 700, fontSize: 11 }}>{i.aktif ? "✓ Aktif" : "⏸ Pasif"}</button>
                    <button onClick={() => isletmeSil(i.id, i.isim)} title="Sil" style={{ padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(239,68,68,.06)", color: "#ef4444", fontSize: 11 }}>🗑️</button>
                  </div>
                </div>
              </div>
            );
          };

          return (
          <>
            <div className="page-header">
              <h1>İşletmeler</h1>
              <p>{isletmeler.length} işletme kayıtlı · {aktifSayi} aktif · {pasifSayi} pasif · {mevcutKategoriler.length} kategori</p>
            </div>

            {/* Arama + Durum Filtre + Yeni İşletme */}
            <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                <input type="text" placeholder="İşletme ara (isim, telefon, kategori, ilçe)..."
                  value={isletmeArama || ''} onChange={e => setIsletmeArama(e.target.value)}
                  style={{ width: "100%", padding: "10px 14px 10px 36px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, opacity: .4 }}>🔍</span>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["hepsi", `Hepsi (${isletmeler.length})`], ["aktif", `Aktif (${aktifSayi})`], ["pasif", `Pasif (${pasifSayi})`]].map(([v, l]) => (
                  <button key={v} onClick={() => setIsletmeFiltre(v)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: isletmeFiltre === v ? "var(--primary)" : "var(--bg)", color: isletmeFiltre === v ? "#fff" : "var(--dim)", transition: "all .15s" }}>{l}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setIsletmeGorunum("kategori")} title="Kategori Görünümü" style={{ padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: isletmeGorunum === "kategori" ? "rgba(59,130,246,.12)" : "var(--bg)", color: isletmeGorunum === "kategori" ? "#3b82f6" : "var(--dim)", fontSize: 14 }}>▦</button>
                <button onClick={() => setIsletmeGorunum("liste")} title="Liste Görünümü" style={{ padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: isletmeGorunum === "liste" ? "rgba(59,130,246,.12)" : "var(--bg)", color: isletmeGorunum === "liste" ? "#3b82f6" : "var(--dim)", fontSize: 14 }}>☰</button>
              </div>
              <button onClick={() => setFormAcik(!formAcik)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #f59e0b, #d97706)", color: "#fff", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>+ Yeni İşletme</button>
            </div>

            {/* Kategori Filtre Chip'leri */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              <button onClick={() => setIsletmeKategoriFiltre("hepsi")}
                style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all .15s",
                  background: isletmeKategoriFiltre === "hepsi" ? "var(--primary)" : "var(--surface)", color: isletmeKategoriFiltre === "hepsi" ? "#fff" : "var(--dim)",
                  border: isletmeKategoriFiltre === "hepsi" ? "1px solid var(--primary)" : "1px solid var(--border)" }}>
                Tüm Kategoriler
              </button>
              {mevcutKategoriler.map(k => {
                const renk = kategoriRenk[k] || "#64748b";
                const sayi = isletmeler.filter(i => (i.kategori || "genel") === k).length;
                return (
                  <button key={k} onClick={() => setIsletmeKategoriFiltre(isletmeKategoriFiltre === k ? "hepsi" : k)}
                    style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all .15s", display: "flex", alignItems: "center", gap: 6,
                      background: isletmeKategoriFiltre === k ? `${renk}18` : "var(--surface)",
                      color: isletmeKategoriFiltre === k ? renk : "var(--dim)",
                      border: isletmeKategoriFiltre === k ? `1px solid ${renk}40` : "1px solid var(--border)" }}>
                    {(kategoriLabel[k] || k).split(" ")[0]} {k} <span style={{ background: `${renk}15`, color: renk, padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 800 }}>{sayi}</span>
                  </button>
                );
              })}
            </div>

            {/* Yeni İşletme Formu */}
            {formAcik && (
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, border: "1px solid rgba(245,158,11,.2)", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: "#f59e0b", marginBottom: 14 }}>➕ Yeni İşletme Kaydı</div>
                <form onSubmit={isletmeEkle}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                    {[
                      { key: "isim", label: "İşletme Adı *", ph: "Berber Ali" },
                      { key: "telefon", label: "Telefon *", ph: "05551234567" },
                      { key: "adres", label: "Adres", ph: "Bağcılar Cad. No:1" },
                      { key: "ilce", label: "İlçe", ph: "Bağcılar" },
                      { key: "email", label: "Email *", ph: "ali@berber.com" },
                      { key: "sifre", label: "Şifre *", ph: "En az 6 karakter" },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>{f.label}</label>
                        <input type={f.key === "sifre" ? "password" : "text"} placeholder={f.ph} required={["isim","telefon","email","sifre"].includes(f.key)}
                          value={yeniIsletme[f.key]} onChange={e => setYeniIsletme({ ...yeniIsletme, [f.key]: e.target.value })}
                          style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Kategori</label>
                      <select value={yeniIsletme.kategori} onChange={e => setYeniIsletme({ ...yeniIsletme, kategori: e.target.value })}
                        style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}>
                        {Object.entries(kategoriLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                    <button type="submit" style={{ padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer", background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: 13 }}>Kaydet</button>
                    <button type="button" onClick={() => setFormAcik(false)} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontWeight: 600, fontSize: 13 }}>İptal</button>
                  </div>
                </form>
              </div>
            )}

            {/* İşletme Listesi */}
            {yukleniyor ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>Yükleniyor...</div>
            ) : aramaFiltreli.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔍</div>
                <p>Sonuç bulunamadı</p>
              </div>
            ) : isletmeGorunum === "kategori" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {kategoriSirali.map(kat => {
                  const renk = kategoriRenk[kat] || "#64748b";
                  const label = kategoriLabel[kat] || kat;
                  const liste = kategoriler[kat];
                  return (
                    <div key={kat}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${renk}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                          {label.split(" ")[0]}
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>{label.split(" ").slice(1).join(" ") || kat}</span>
                        <span style={{ padding: "3px 10px", borderRadius: 8, background: `${renk}12`, color: renk, fontSize: 11, fontWeight: 800 }}>{liste.length}</span>
                        <div style={{ flex: 1, height: 1, background: "var(--border)", marginLeft: 8 }} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                        {liste.map(i => <IsletmeKart key={i.id} i={i} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
                {aramaFiltreli.map(i => <IsletmeKart key={i.id} i={i} />)}
              </div>
            )}
          </>
          );
        })()}

        {/* ÖDEMELER */}
        {sayfa === "odemeler" && (
          <>
            {/* Shopier Bilgi */}
            <div className="card mb-16" style={{ padding: "14px 18px", background: "rgba(16,185,129,.06)", border: "1px solid rgba(16,185,129,.15)" }}>
              <div className="row row-between row-wrap gap-8">
                <div className="row gap-8" style={{ alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>🔗</span>
                  <div>
                    <div style={{ color: "#10b981", fontWeight: 700, fontSize: 14 }}>Shopier Otomatik Tahsilat Aktif</div>
                    <div style={{ color: "var(--dim)", fontSize: 12 }}>Müşteri karttan ödeyince webhook ile otomatik "Ödendi" düşer.</div>
                  </div>
                </div>
                <span className="tag" style={{ background: "rgba(16,185,129,.15)", color: "#10b981", fontWeight: 700, fontSize: 11 }}>Webhook Aktif</span>
              </div>
            </div>

            <div className="row row-wrap gap-16 mb-24">
              <StatCard icon="💰" baslik="Toplam Gelir" deger={toplamGelir.toFixed(0) + " ₺"} renk="#2cb872" />
              <StatCard icon="📅" baslik="Bu Ay Gelir" deger={buAyGelir.toFixed(0) + " ₺"} renk="#3b82f6" />
              <StatCard icon="✅" baslik="Bu Ay Ödeyen" deger={buAyOdeyenler.length} renk="#8b5cf6" />
              <StatCard icon="⏳" baslik="Bu Ay Ödemeyenler" deger={buAyOdemeyenler.length} renk="#ef4444" />
            </div>

            {/* Ödeme Profili açıksa */}
            {odemeProfil ? (
              <>
                <button onClick={() => setOdemeProfil(null)} className="btn btn-ghost btn-sm mb-16" style={{ fontSize: 12 }}>← Listeye Dön</button>
                <div className="card mb-16" style={{ padding: "20px 24px" }}>
                  <div className="row row-between row-wrap gap-12 mb-16">
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", margin: 0 }}>{odemeProfil.isletme.isim}</h2>
                      <div className="row gap-8 mt-4">
                        <span className="tag-xs" style={{ background: (paketRenk[odemeProfil.isletme.paket] || "#64748b") + "22", color: paketRenk[odemeProfil.isletme.paket] || "#64748b" }}>{odemeProfil.isletme.paket}</span>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>📅 Kayıt: {new Date(odemeProfil.isletme.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>{odemeProfil.olusturma_gun} gün önce</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 800, color: "var(--green)" }}>{odemeProfil.paket_fiyat}₺<span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 400 }}>/ay</span></div>
                    </div>
                  </div>

                  {/* Deneme Süresi */}
                  {odemeProfil.deneme_suresi_kalan > 0 && (
                    <div style={{ background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                      <div className="row row-between row-wrap gap-8">
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>⏰ Deneme Süresi: {odemeProfil.deneme_suresi_kalan} gün kaldı</div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İlk 7 gün ücretsiz — ödeme yapılmasa da erişim açık.</div>
                        </div>
                        <div className="row gap-6">
                          {[7, 14, 30].map(g => (
                            <button key={g} onClick={async () => {
                              await api.post(`/admin/isletmeler/${odemeProfil.isletme.id}/deneme-uzat`, { gun: g });
                              odemeProfiliYukle(odemeProfil.isletme.id);
                            }} className="btn btn-sm" style={{ background: "rgba(59,130,246,.1)", color: "#3b82f6", border: "none", fontSize: 11 }}>{g} gün</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* İstatistik Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Toplam Ödenen</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#10b981" }}>{odemeProfil.istatistikler.toplam_odenen.toFixed(0)}₺</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Bu Ay Durum</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: odemeProfil.istatistikler.bu_ay_durum === "odendi" ? "#10b981" : odemeProfil.istatistikler.bu_ay_durum === "deneme" ? "#3b82f6" : "#ef4444" }}>
                        {odemeProfil.istatistikler.bu_ay_durum === "odendi" ? "✓ Ödendi" : odemeProfil.istatistikler.bu_ay_durum === "deneme" ? "⏳ Deneme" : "✕ Ödenmedi"}
                      </div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Son Ödeme</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{odemeProfil.istatistikler.son_odeme_tarihi ? new Date(odemeProfil.istatistikler.son_odeme_tarihi).toLocaleDateString("tr-TR") : "—"}</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Ödenen / Toplam Ay</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{odemeProfil.istatistikler.odenen_ay}/{odemeProfil.istatistikler.toplam_ay}</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Gecikme Sayısı</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: odemeProfil.istatistikler.gecikme_sayisi > 0 ? "#ef4444" : "var(--text)" }}>{odemeProfil.istatistikler.gecikme_sayisi}</div>
                    </div>
                  </div>
                </div>

                {/* Ödeme Takvimi */}
                <h3 style={{ fontSize: 16, marginBottom: 12, color: "var(--text)" }}>📅 Ödeme Takvimi (Son 12 Ay)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 20 }}>
                  {odemeProfil.takvim.map(t => {
                    const renk = t.durum === "odendi" ? "#10b981" : t.durum === "bekliyor" ? "#f59e0b" : t.durum === "gecikti" ? "#ef4444" : t.durum === "havale_bekliyor" ? "#818cf8" : t.durum === "deneme" ? "#3b82f6" : "#64748b";
                    return (
                      <div key={t.donem} style={{ background: `${renk}08`, border: `1px solid ${renk}25`, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 4 }}>{t.donem}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: renk }}>
                          {t.durum === "odendi" ? "✓ Ödendi" : t.durum === "bekliyor" ? "⏳ Bekliyor" : t.durum === "gecikti" ? "⚠ Gecikti" : t.durum === "havale_bekliyor" ? "🏦 Havale" : t.durum === "deneme" ? "🆓 Deneme" : "— Yok"}
                        </div>
                        {t.tutar > 0 && <div style={{ fontSize: 14, fontWeight: 800, color: "var(--text)", marginTop: 2 }}>{t.tutar}₺</div>}
                        {t.odeme_tarihi && <div style={{ fontSize: 10, color: "var(--dim)" }}>{new Date(t.odeme_tarihi).toLocaleDateString("tr-TR")}</div>}
                        {t.odeme_yontemi && <div style={{ fontSize: 10, color: "var(--dim)" }}>{t.odeme_yontemi === "shopier" ? "💳 Shopier" : t.odeme_yontemi === "havale" ? "🏦 Havale" : t.odeme_yontemi}</div>}
                        {t.id && t.durum !== "odendi" && (
                          <div className="row gap-4 mt-4">
                            <button onClick={() => { odemeGuncelle(t.id, "odendi"); setTimeout(() => odemeProfiliYukle(odemeProfil.isletme.id), 500); }} className="btn btn-sm" style={{ background: `${renk}15`, color: renk, border: "none", fontSize: 10, padding: "4px 8px" }}>✓ Öde</button>
                            <button onClick={() => { setErtelemeModal(t); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(100,116,139,.1)", color: "#64748b", border: "none", fontSize: 10, padding: "4px 8px" }}>📅 Ertele</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Paket Geçmişi */}
                {odemeProfil.paket_gecmisi.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 16, marginBottom: 12, color: "var(--text)" }}>📦 Paket Değişiklik Geçmişi</h3>
                    {odemeProfil.paket_gecmisi.map((p, idx) => (
                      <div key={idx} className="list-item" style={{ padding: "10px 14px", marginBottom: 6 }}>
                        <div className="row row-between">
                          <span style={{ fontSize: 13, color: "var(--text)" }}>{p.detay || p.islem}</span>
                          <span style={{ fontSize: 11, color: "var(--dim)" }}>{new Date(p.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                {/* Tüm Ödeme Kayıtları */}
                <h3 style={{ fontSize: 16, marginBottom: 12, marginTop: 20, color: "var(--text)" }}>💳 Tüm Ödeme Kayıtları</h3>
                {odemeProfil.odemeler.length === 0 ? (
                  <div className="list-empty"><p>Henüz ödeme kaydı yok.</p></div>
                ) : odemeProfil.odemeler.map(o => (
                  <div key={o.id} className="list-item" style={{ flexDirection: "column", gap: 8, marginBottom: 8 }}>
                    <div className="row row-between row-wrap gap-8">
                      <div className="row gap-8">
                        <span style={{ fontWeight: 700, color: "var(--text)" }}>📅 {o.donem}</span>
                        <span style={{ fontWeight: 800, color: "var(--green)" }}>{o.tutar}₺</span>
                        {o.odeme_yontemi && <span style={{ fontSize: 11, color: "var(--dim)" }}>{o.odeme_yontemi === "shopier" ? "💳 Shopier" : o.odeme_yontemi === "havale" ? "🏦 Havale" : o.odeme_yontemi}</span>}
                      </div>
                      <span className="tag-xs" style={{ background: (odemeRenk[o.durum] || "#64748b") + "22", color: odemeRenk[o.durum] || "#64748b", fontWeight: 700 }}>{odemeLabel[o.durum] || o.durum}</span>
                    </div>
                    {o.odeme_tarihi && <div style={{ fontSize: 11, color: "var(--dim)" }}>Ödeme tarihi: {new Date(o.odeme_tarihi).toLocaleString("tr-TR")}</div>}
                    {o.referans_kodu && <div style={{ fontSize: 11, color: "var(--dim)" }}>Ref: {o.referans_kodu}</div>}
                    {o.notlar && <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", borderRadius: 6, padding: "6px 10px" }}>{o.notlar}</div>}
                    <div className="row gap-6">
                      {o.durum === "havale_bekliyor" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.15)", color: "var(--green)", border: "none", fontWeight: 700, fontSize: 11 }}>✓ Onayla</button>
                          <button onClick={async () => { await odemeGuncelle(o.id, "bekliyor"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(239,68,68,.12)", color: "var(--red)", border: "none", fontSize: 11 }}>✗ Reddet</button>
                        </>
                      )}
                      {o.durum === "bekliyor" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                          <button onClick={async () => { await odemeGuncelle(o.id, "gecikti"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none", fontSize: 11 }}>Gecikti</button>
                          <button onClick={() => { setErtelemeModal(o); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(100,116,139,.1)", color: "#64748b", border: "none", fontSize: 11 }}>📅 Ertele</button>
                        </>
                      )}
                      {o.durum === "gecikti" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                          <button onClick={() => { setErtelemeModal(o); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(100,116,139,.1)", color: "#64748b", border: "none", fontSize: 11 }}>📅 Ertele</button>
                        </>
                      )}
                      {o.durum === "odendi" && (
                        <button onClick={async () => { await odemeGuncelle(o.id, "bekliyor"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Geri Al</button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Erteleme Modal */}
                {ertelemeModal && (
                  <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, background: "rgba(22,5,39,.6)", display: "flex", alignItems: "center", justifyContent: "center" }}
                    onClick={() => setErtelemeModal(null)}>
                    <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, maxWidth: 400, width: "100%" }} onClick={e => e.stopPropagation()}>
                      <h3 style={{ marginBottom: 12, fontSize: 16 }}>📅 Ödeme Erteleme</h3>
                      <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16 }}>Mevcut dönem: {ertelemeModal.donem}</p>
                      <label className="form-label">Yeni Dönem</label>
                      <input type="month" value={ertelemeDonem} onChange={e => setErtelemeDonem(e.target.value)} className="input mb-12" />
                      <label className="form-label">Sebep (Opsiyonel)</label>
                      <input type="text" value={ertelemeSebep} onChange={e => setErtelemeSebep(e.target.value)} placeholder="Örn: Müşteri talep etti" className="input mb-16" />
                      <div className="row gap-8">
                        <button onClick={async () => {
                          if (!ertelemeDonem) { alert("Yeni dönem seçin"); return; }
                          await api.post(`/admin/odemeler/${ertelemeModal.id}/ertele`, { yeni_donem: ertelemeDonem, sebep: ertelemeSebep });
                          setErtelemeModal(null);
                          odemeProfiliYukle(odemeProfil.isletme.id);
                          odemeleriYukle();
                        }} className="btn btn-primary btn-sm">Ertele</button>
                        <button onClick={() => setErtelemeModal(null)} className="btn btn-ghost btn-sm">İptal</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Ana liste modu */}
                <div className="row row-between row-wrap mb-16">
                  <div className="filter-bar" style={{ marginBottom: 0 }}>
                    {[["hepsi","Tümü"],["buay","Bu Ay"],["bekliyor","Bekliyor"],["odendi","Ödendi"],["gecikti","Gecikti"]].map(([v,l]) => (
                      <button key={v} onClick={() => setOdemeFiltre(v)} className={`pill pill-sm${odemeFiltre === v ? ' active' : ''}`}>{l}</button>
                    ))}
                  </div>
                  <button onClick={() => setOdemeFormAcik(!odemeFormAcik)} className="btn btn-primary btn-sm">+ Ödeme Kaydı Ekle</button>
                </div>

                {odemeFormAcik && (
                  <form onSubmit={odemeEkle} className="form-card card-accent-green row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                    <div>
                      <label className="form-label">İşletme</label>
                      <select value={yeniOdeme.isletme_id} onChange={e => setYeniOdeme({...yeniOdeme, isletme_id: e.target.value})} required className="input">
                        <option value="">Seç...</option>
                        {isletmeler.map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Tutar (₺)</label>
                      <input type="number" placeholder="299" value={yeniOdeme.tutar} onChange={e => setYeniOdeme({...yeniOdeme, tutar: e.target.value})} required className="input" style={{ width: 100 }} />
                    </div>
                    <div>
                      <label className="form-label">Dönem</label>
                      <input type="month" value={yeniOdeme.donem} onChange={e => setYeniOdeme({...yeniOdeme, donem: e.target.value})} className="input" />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm">Kaydet</button>
                    <button type="button" onClick={() => setOdemeFormAcik(false)} className="btn btn-ghost btn-sm">İptal</button>
                  </form>
                )}

                {/* İşletme bazlı ödeme durumu */}
                <h3 style={{ fontSize: 15, marginBottom: 12, color: "var(--text)" }}>🏢 İşletme Bazlı Ödeme Durumu</h3>
                {isletmeler.map(i => {
                  const iOdemeleri = odemeler.filter(o => o.isletme_id === i.id);
                  const buAyO = iOdemeleri.find(o => o.donem === buAy);
                  const olusturmaGun = Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000);
                  const deneme = olusturmaGun <= 7;
                  const durum = buAyO ? buAyO.durum : (deneme ? "deneme" : "odenmedi");
                  const durumRenk = durum === "odendi" ? "#10b981" : durum === "deneme" ? "#3b82f6" : durum === "bekliyor" ? "#f59e0b" : durum === "havale_bekliyor" ? "#818cf8" : "#ef4444";
                  const durumText = durum === "odendi" ? "✓ Ödendi" : durum === "deneme" ? `⏳ Deneme (${7 - olusturmaGun} gün)` : durum === "bekliyor" ? "⏳ Bekliyor" : durum === "havale_bekliyor" ? "🏦 Havale" : durum === "gecikti" ? "⚠ Gecikti" : "✕ Ödenmedi";
                  return (
                    <div key={i.id} className="list-item mb-8" style={{ cursor: "pointer" }} onClick={() => odemeProfiliYukle(i.id)}>
                      <div className="row row-between row-wrap gap-8" style={{ width: "100%" }}>
                        <div className="row gap-10" style={{ alignItems: "center" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${durumRenk}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 16 }}>{durum === "odendi" ? "✅" : durum === "deneme" ? "🆓" : durum === "havale_bekliyor" ? "🏦" : "⚠️"}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{i.isim}</div>
                            <div className="row gap-6 mt-2">
                              <span className="tag-xs" style={{ background: (paketRenk[i.paket] || "#64748b") + "22", color: paketRenk[i.paket] || "#64748b" }}>{i.paket} · {paketFiyat[i.paket]}₺</span>
                              <span style={{ fontSize: 11, color: "var(--dim)" }}>Kayıt: {new Date(i.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: durumRenk }}>{durumText}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>Bu ay: {buAy}</div>
                          {!buAyO && !deneme && (
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              await api.post("/admin/odemeler", { isletme_id: i.id, tutar: paketFiyat[i.paket] || 299, donem: buAy, durum: "bekliyor" });
                              odemeleriYukle(); isletmeleriYukle();
                            }} className="btn btn-sm mt-4" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)", border: "none", fontWeight: 700, fontSize: 11 }}>
                              + Bekliyor Oluştur
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tüm ödeme kayıtları */}
                <h3 style={{ fontSize: 15, marginBottom: 12, marginTop: 24, color: "var(--text)" }}>💳 Tüm Ödeme Kayıtları</h3>
                {yukleniyor ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> :
                  filtreliOdemeler.length === 0 ? (
                    <div className="list-empty"><p>Kayıt bulunamadı.</p></div>
                  ) : filtreliOdemeler.map(o => (
                    <div key={o.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 8 }}>
                      <div className="row row-between row-wrap gap-8">
                        <div className="row row-wrap gap-8">
                          <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "underline dotted" }}
                            onClick={() => { const isl = isletmeler.find(i => i.isim === o.isletme_isim); if(isl) odemeProfiliYukle(isl.id); }}>{o.isletme_isim}</span>
                          <span style={{ color: "var(--dim)", fontSize: 12 }}>📅 {o.donem}</span>
                          <span style={{ color: "var(--green)", fontWeight: 700, fontSize: 14 }}>{o.tutar}₺</span>
                          {o.odeme_tarihi && <span style={{ color: "var(--dim)", fontSize: 11 }}>· {new Date(o.odeme_tarihi).toLocaleDateString("tr-TR")}</span>}
                        </div>
                        <span className="tag-xs" style={{ background: (odemeRenk[o.durum] || "#64748b") + "22", color: odemeRenk[o.durum] || "#64748b", fontWeight: 700 }}>{odemeLabel[o.durum] || o.durum}</span>
                      </div>
                      <div className="row gap-6">
                        {o.durum === "havale_bekliyor" && (
                          <>
                            <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.15)", color: "var(--green)", border: "none", fontWeight: 700, fontSize: 11 }}>✓ Onayla</button>
                            <button onClick={() => { odemeGuncelle(o.id, "bekliyor"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(239,68,68,.12)", color: "var(--red)", border: "none", fontSize: 11 }}>✗ Reddet</button>
                          </>
                        )}
                        {o.durum === "bekliyor" && (
                          <>
                            <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                            <button onClick={() => { odemeGuncelle(o.id, "gecikti"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none", fontSize: 11 }}>Gecikti</button>
                          </>
                        )}
                        {o.durum === "gecikti" && (
                          <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                        )}
                        {o.durum === "odendi" && (
                          <button onClick={() => { odemeGuncelle(o.id, "bekliyor"); setTimeout(odemeleriYukle, 300); }} className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}>Geri Al</button>
                        )}
                      </div>
                    </div>
                  ))
                }
              </>
            )}
          </>
        )}

        {/* İLETİŞİM MESAJLARI */}
        {sayfa === "iletisim" && (
          <>
            <div className="ph-row">
              <div>
                <h1>İletişim Mesajları</h1>
                <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 4 }}>{iletisimMesajlar.length} mesaj · {okunmamisSayi} okunmamış</p>
              </div>
              <button onClick={iletisimYukle} className="btn btn-ghost btn-sm">Yenile</button>
            </div>

            <div className="filter-bar">
              {[["hepsi", "Tümü"], ["okunmamis", "Okunmamış"], ["okunmus", "Okunmuş"]].map(([v, l]) => (
                <button key={v} onClick={() => setIletisimFiltre(v)} className={`pill pill-sm${iletisimFiltre === v ? " active" : ""}`}>{l}</button>
              ))}
            </div>

            {iletisimMesajlar
              .filter(m => iletisimFiltre === "okunmamis" ? !m.okundu : iletisimFiltre === "okunmus" ? m.okundu : true)
              .length === 0 ? (
              <div className="list-empty"><p>Mesaj bulunamadı.</p></div>
            ) : iletisimMesajlar
              .filter(m => iletisimFiltre === "okunmamis" ? !m.okundu : iletisimFiltre === "okunmus" ? m.okundu : true)
              .map(m => (
              <div key={m.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, borderLeft: m.okundu ? "3px solid var(--border)" : "3px solid #818cf8" }}>
                <div className="row row-between row-wrap gap-8">
                  <div className="row row-wrap gap-8">
                    <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 15 }}>{m.isim || "—"}</span>
                    {m.email && <a href={"mailto:" + m.email} style={{ color: "#818cf8", fontSize: 13 }}>{m.email}</a>}
                    {m.telefon && <a href={"tel:" + m.telefon} style={{ color: "#10b981", fontSize: 13 }}>📞 {m.telefon}</a>}
                    {m.kaynak && <span className="tag" style={{ background: "rgba(99,102,241,.1)", color: "#6366f1", fontSize: 10 }}>{m.kaynak}</span>}
                  </div>
                  <div className="row gap-8">
                    <span style={{ color: "var(--dim)", fontSize: 12 }}>{new Date(m.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                    <span className="tag" style={{ background: m.okundu ? "rgba(16,185,129,.12)" : "rgba(129,140,248,.12)", color: m.okundu ? "var(--green)" : "#818cf8", fontWeight: 600 }}>
                      {m.okundu ? "Okundu" : "Yeni"}
                    </span>
                  </div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.mesaj}</div>
                <div className="row gap-6">
                  <button onClick={async () => { await api.put("/admin/iletisim/" + m.id, { okundu: !m.okundu }); iletisimYukle(); }} className="btn btn-sm" style={{ background: m.okundu ? "rgba(245,158,11,.12)" : "rgba(16,185,129,.12)", color: m.okundu ? "var(--amber)" : "var(--green)", border: "none", fontWeight: 600 }}>
                    {m.okundu ? "Okunmadı İşaretle" : "Okundu İşaretle"}
                  </button>
                  <button onClick={async () => { if (confirm("Bu mesajı silmek istediğinize emin misiniz?")) { await api.del("/admin/iletisim/" + m.id); iletisimYukle(); } }} className="btn btn-sm" style={{ background: "rgba(239,68,68,.1)", color: "var(--red)", border: "none" }}>Sil</button>
                  {m.email && <a href={"mailto:" + m.email} className="btn btn-sm" style={{ background: "rgba(129,140,248,.12)", color: "#818cf8", border: "none", textDecoration: "none" }}>Mail</a>}
                  {m.telefon && <a href={"https://wa.me/90" + m.telefon} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: "rgba(37,211,102,.12)", color: "#25d366", border: "none", textDecoration: "none" }}>WhatsApp</a>}
                </div>
              </div>
            ))}
          </>
        )}

        {/* AUDIT LOG */}
        {sayfa === "auditLog" && (
          <>
            <div className="page-header">
              <h1>📋 Audit Log — Sistem Logları</h1>
              <p>Kim, ne zaman, ne yaptı? Tüm kritik işlem kayıtları ({auditToplam} log)</p>
            </div>
            <div className="filter-bar mb-16">
              {[["","Tümü"],["randevu","Randevu"],["odeme","Ödeme"],["isletme","İşletme"],["silme","Silme"],["destek","Destek"],["export","Export"],["duyuru","Duyuru"],["referans","Referans"]].map(([v,l]) => (
                <button key={v} onClick={() => setAuditFiltre(v)} className={`pill pill-sm${auditFiltre === v ? ' active' : ''}`}>{l}</button>
              ))}
            </div>
            {auditLoglar.length === 0 ? (
              <div className="list-empty"><p>Henüz log kaydı yok.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {auditLoglar.map(l => (
                  <div key={l.id} className="list-item" style={{ padding: "10px 16px" }}>
                    <div className="row row-between row-wrap gap-8">
                      <div className="row row-wrap gap-8" style={{ flex: 1 }}>
                        <span className="tag" style={{ background: "rgba(139,92,246,.12)", color: "#8b5cf6", fontWeight: 700, fontSize: 11 }}>{l.islem}</span>
                        <span style={{ color: "var(--text)", fontSize: 13 }}>{l.detay}</span>
                        {l.isletme_isim && <span style={{ color: "var(--dim)", fontSize: 12 }}>🏢 {l.isletme_isim}</span>}
                        {l.hedef_tablo && <span style={{ color: "var(--dim)", fontSize: 11 }}>({l.hedef_tablo}#{l.hedef_id})</span>}
                      </div>
                      <div className="row gap-8">
                        <span style={{ color: "var(--dim)", fontSize: 11 }}>{l.kullanici_email}</span>
                        <span style={{ color: "var(--dim)", fontSize: 11 }}>{new Date(l.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                        {l.ip_adresi && <span style={{ color: "var(--dim)", fontSize: 10 }}>IP: {l.ip_adresi}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* SİSTEM DURUMU */}
        {sayfa === "sistemDurum" && (
          <>
            <div className="page-header">
              <h1>🖥️ Sistem Durumu & Health Monitor</h1>
              <p>Sunucu, veritabanı ve servis sağlığı</p>
            </div>
            <button onClick={sistemDurumuYukle} className="btn btn-sm mb-16" style={{ background: "rgba(59,130,246,.12)", color: "#3b82f6", fontWeight: 700 }}>🔄 Yenile</button>
            {!sistemDurum ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> : (
              <>
                {/* Genel durum banner */}
                <div className="card mb-16" style={{ padding: "16px 20px", background: sistemDurum.durum === 'aktif' ? "rgba(16,185,129,.06)" : "rgba(239,68,68,.06)", border: `1px solid ${sistemDurum.durum === 'aktif' ? "rgba(16,185,129,.15)" : "rgba(239,68,68,.15)"}` }}>
                  <div className="row gap-10">
                    <span style={{ fontSize: 24 }}>{sistemDurum.durum === 'aktif' ? '✅' : '❌'}</span>
                    <div>
                      <div style={{ color: sistemDurum.durum === 'aktif' ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 16 }}>
                        Sistem {sistemDurum.durum === 'aktif' ? 'Çalışıyor' : 'Sorunlu'}
                      </div>
                      <div style={{ color: "var(--dim)", fontSize: 12 }}>Son kontrol: {new Date(sistemDurum.zaman).toLocaleString("tr-TR")}</div>
                    </div>
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stat-card green"><div className="sc-icon">⏱️</div><div className="sc-label">Uptime</div><div className="sc-val">{sistemDurum.sunucu.uptime_saat} saat</div></div>
                  <div className="stat-card blue"><div className="sc-icon">💾</div><div className="sc-label">Bellek</div><div className="sc-val">{sistemDurum.sunucu.bellek_mb} MB</div><div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>/ {sistemDurum.sunucu.bellek_toplam_mb} MB</div></div>
                  <div className="stat-card" style={{"--card-accent": sistemDurum.veritabani.durum === 'saglikli' ? "#10b981" : "#ef4444"}}>
                    <div className="sc-icon">🗄️</div><div className="sc-label">Veritabanı</div>
                    <div className="sc-val" style={{ color: sistemDurum.veritabani.durum === 'saglikli' ? "#10b981" : "#ef4444" }}>{sistemDurum.veritabani.yanit_ms}ms</div>
                    <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{sistemDurum.veritabani.durum}</div>
                  </div>
                  <div className="stat-card amber"><div className="sc-icon">📅</div><div className="sc-label">24s Randevu</div><div className="sc-val">{sistemDurum.son_24_saat.randevu}</div></div>
                </div>

                {/* Servisler */}
                <div className="card-dark mt-16">
                  <h3 style={{ fontSize: 15, color: "var(--muted)", marginBottom: 12 }}>Servisler</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {Object.entries(sistemDurum.servisler).map(([k, v]) => (
                      <div key={k} className="row row-between" style={{ padding: "10px 14px", background: "var(--bg)", borderRadius: 8 }}>
                        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>{k.replace(/_/g, ' ')}</span>
                        <span className="tag" style={{ background: v === 'bagli' || v === 'aktif' ? "rgba(16,185,129,.15)" : "rgba(245,158,11,.15)", color: v === 'bagli' || v === 'aktif' ? "#10b981" : "#f59e0b", fontWeight: 700 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DB Havuzu */}
                <div className="card-dark mt-16">
                  <h3 style={{ fontSize: 15, color: "var(--muted)", marginBottom: 12 }}>DB Bağlantı Havuzu</h3>
                  <div className="row gap-16">
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Toplam:</span> <strong style={{ color: "var(--text)" }}>{sistemDurum.veritabani.havuz.total}</strong></div>
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Boşta:</span> <strong style={{ color: "#10b981" }}>{sistemDurum.veritabani.havuz.idle}</strong></div>
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Bekleyen:</span> <strong style={{ color: "#f59e0b" }}>{sistemDurum.veritabani.havuz.waiting}</strong></div>
                  </div>
                </div>

                <div className="card-dark mt-16">
                  <h3 style={{ fontSize: 15, color: "var(--muted)", marginBottom: 8 }}>Sunucu Bilgileri</h3>
                  <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 2 }}>
                    Platform: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.platform}</strong> · Node: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.node_versiyon}</strong> · CPU: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.cpu_yukleme}</strong> · Hatalar (24s): <strong style={{ color: sistemDurum.son_24_saat.hata > 0 ? "#ef4444" : "#10b981" }}>{sistemDurum.son_24_saat.hata}</strong>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* DESTEK TALEPLERİ */}
        {sayfa === "destek" && (() => {
          const oncelikRenk = { acil: "#ef4444", yuksek: "#f59e0b", normal: "#3b82f6", dusuk: "#64748b" };
          const durumRenk = { acik: "#f59e0b", yanitlandi: "#3b82f6", cozuldu: "#10b981", kapali: "#64748b" };
          const durumLabel = { acik: "Açık", yanitlandi: "Yanıtlandı", cozuldu: "Çözüldü", kapali: "Kapalı" };
          const durumIcon = { acik: "🟡", yanitlandi: "💬", cozuldu: "✅", kapali: "🔒" };
          const filtrelenmis = destekTalepler.filter(t => destekFiltre === "hepsi" ? true : t.durum === destekFiltre);
          const secili = destekTalepler.find(t => t.id === destekYanitAcik);
          return (
          <div style={{ display: "flex", gap: 0, height: "calc(100vh - 80px)", background: "var(--bg)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
            {/* Sol Panel — Talep Listesi */}
            <div style={{ width: 360, minWidth: 300, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
              <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>Destek Talepleri</h2>
                  <button onClick={destekYukle} style={{ background: "rgba(59,130,246,.1)", color: "#3b82f6", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Yenile</button>
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[["hepsi","Tümü"],["acik","Açık"],["yanitlandi","Yanıtlı"],["cozuldu","Çözüldü"],["kapali","Kapalı"]].map(([v,l]) => (
                    <button key={v} onClick={() => setDestekFiltre(v)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", fontSize: 11, fontWeight: 600, cursor: "pointer", background: destekFiltre === v ? "var(--primary)" : "var(--bg)", color: destekFiltre === v ? "#fff" : "var(--muted)" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filtrelenmis.length === 0 && (
                  <div style={{ padding: 30, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>Talep yok</div>
                )}
                {filtrelenmis.map(t => (
                  <div key={t.id} onClick={() => { setDestekYanitAcik(t.id); setDestekYanitMetin(t.admin_yanit || ""); }} style={{
                    padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid var(--border)",
                    background: destekYanitAcik === t.id ? "rgba(99,102,241,.08)" : "transparent",
                    borderLeft: destekYanitAcik === t.id ? "3px solid var(--primary)" : "3px solid transparent",
                    transition: "all .15s"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>#{t.id} {t.konu}</span>
                      <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", marginLeft: 8 }}>{new Date(t.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (oncelikRenk[t.oncelik]||"#64748b") + "18", color: oncelikRenk[t.oncelik]||"#64748b", fontWeight: 700 }}>{t.oncelik}</span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (durumRenk[t.durum]||"#64748b") + "18", color: durumRenk[t.durum]||"#64748b", fontWeight: 700 }}>{durumIcon[t.durum]} {durumLabel[t.durum]}</span>
                      {t.isletme_isim && <span style={{ fontSize: 10, color: "var(--dim)" }}>🏢 {t.isletme_isim}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.mesaj?.slice(0,60)}{t.mesaj?.length > 60 ? "..." : ""}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sağ Panel — Detay & Chat & Yanıt */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "var(--bg)" }}>
              {secili ? (
                <>
                  {/* Header */}
                  <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: "var(--text)" }}>#{secili.id} {secili.konu}</span>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: (durumRenk[secili.durum]||"#64748b") + "18", color: durumRenk[secili.durum]||"#64748b", fontWeight: 700 }}>{durumIcon[secili.durum]} {durumLabel[secili.durum]}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ padding: "1px 6px", borderRadius: 4, background: (oncelikRenk[secili.oncelik]||"#64748b") + "15", color: oncelikRenk[secili.oncelik], fontWeight: 600, fontSize: 10 }}>{secili.oncelik}</span>
                        {secili.isletme_isim && <span>🏢 {secili.isletme_isim}</span>}
                        <span>{new Date(secili.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {secili.durum !== 'cozuldu' && <button onClick={async () => { await api.put(`/admin/destek/${secili.id}`, { durum: 'cozuldu' }); destekYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(16,185,129,.12)", color: "#10b981", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Çözüldü</button>}
                      {secili.durum !== 'kapali' && <button onClick={async () => { await api.put(`/admin/destek/${secili.id}`, { durum: 'kapali' }); destekYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(100,116,139,.12)", color: "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Kapat</button>}
                    </div>
                  </div>

                  {/* Chat area */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Müşteri mesajı */}
                    <div style={{ display: "flex", gap: 10, maxWidth: "80%" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{(secili.isletme_isim || "M")[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>{secili.isletme_isim || "Müşteri"} · {new Date(secili.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{secili.mesaj}</div>
                      </div>
                    </div>

                    {/* Admin yanıtı */}
                    {secili.admin_yanit && (
                      <div style={{ display: "flex", gap: 10, maxWidth: "80%", alignSelf: "flex-end", flexDirection: "row-reverse" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#10b981", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>SA</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>SıraGO Destek · {secili.admin_yanit_tarihi ? new Date(secili.admin_yanit_tarihi).toLocaleString("tr-TR") : ""}</div>
                          <div style={{ background: "rgba(16,185,129,.08)", border: "1px solid rgba(16,185,129,.15)", borderRadius: "14px 4px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "left" }}>{secili.admin_yanit}</div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Yanıt input */}
                  <div style={{ padding: "14px 24px", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
                    <div style={{ display: "flex", gap: 10 }}>
                      <textarea value={destekYanitMetin} onChange={e => setDestekYanitMetin(e.target.value)} placeholder="Yanıtınızı yazın..." style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "inherit", resize: "none", minHeight: 42, maxHeight: 120 }} />
                      <button onClick={async () => {
                        if (!destekYanitMetin.trim()) return;
                        await api.put(`/admin/destek/${secili.id}`, { admin_yanit: destekYanitMetin, durum: 'yanitlandi' });
                        setDestekYanitMetin(""); destekYukle();
                      }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-end" }}>Yanıtla</button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "var(--dim)" }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Destek Merkezi</div>
                  <div style={{ fontSize: 12 }}>Bir talep seçerek görüntüleyin ve yanıtlayın</div>
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {/* DİNAMİK PAKETLER */}
        {sayfa === "paketler" && (
          <>
            <div className="page-header">
              <h1>📦 Paket Yönetimi</h1>
              <p>Paket özelliklerini if/else yazmadan panelden yönet</p>
            </div>
            <button onClick={() => setPaketFormAcik(!paketFormAcik)} className="btn btn-sm mb-16" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>+ Yeni Paket Tanımla</button>

            {paketFormAcik && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                await api.post("/admin/paketler", yeniPaket);
                setYeniPaket({ kod:"", isim:"", fiyat:"", calisan_limit:1, hizmet_limit:5, aylik_randevu_limit:100, bot_aktif:true, hatirlatma:false, istatistik:false, export_aktif:false, ozellikler:"", sira:0 });
                setPaketFormAcik(false); paketleriYukle();
              }} className="form-card card-accent-amber mb-16">
                <h3 className="amber">Yeni Paket</h3>
                <div className="form-grid">
                  <div><label className="form-label">Kod</label><input value={yeniPaket.kod} onChange={e => setYeniPaket({...yeniPaket, kod: e.target.value})} placeholder="premium_plus" className="input" required /></div>
                  <div><label className="form-label">İsim</label><input value={yeniPaket.isim} onChange={e => setYeniPaket({...yeniPaket, isim: e.target.value})} placeholder="Premium Plus" className="input" required /></div>
                  <div><label className="form-label">Fiyat (₺)</label><input type="number" value={yeniPaket.fiyat} onChange={e => setYeniPaket({...yeniPaket, fiyat: e.target.value})} placeholder="1499" className="input" required /></div>
                  <div><label className="form-label">Çalışan Limiti</label><input type="number" value={yeniPaket.calisan_limit} onChange={e => setYeniPaket({...yeniPaket, calisan_limit: parseInt(e.target.value)})} className="input" /></div>
                  <div><label className="form-label">Hizmet Limiti</label><input type="number" value={yeniPaket.hizmet_limit} onChange={e => setYeniPaket({...yeniPaket, hizmet_limit: parseInt(e.target.value)})} className="input" /></div>
                  <div><label className="form-label">Aylık Randevu Limiti</label><input type="number" value={yeniPaket.aylik_randevu_limit} onChange={e => setYeniPaket({...yeniPaket, aylik_randevu_limit: parseInt(e.target.value)})} className="input" /></div>
                </div>
                <div className="row row-wrap gap-12 mt-12">
                  {[["bot_aktif","Bot"],["hatirlatma","Hatırlatma"],["istatistik","İstatistik"],["export_aktif","Excel Export"]].map(([k,l]) => (
                    <label key={k} className="row gap-6" style={{ fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={yeniPaket[k]} onChange={e => setYeniPaket({...yeniPaket, [k]: e.target.checked})} />
                      <span style={{ color: "var(--text)" }}>{l}</span>
                    </label>
                  ))}
                </div>
                <div className="mt-12"><label className="form-label">Özellikler (her satır bir madde)</label><textarea value={yeniPaket.ozellikler} onChange={e => setYeniPaket({...yeniPaket, ozellikler: e.target.value})} placeholder="Sınırsız çalışan&#10;Sınırsız hizmet" className="input" rows={3} style={{ resize: "vertical" }} /></div>
                <div className="form-actions mt-12">
                  <button type="submit" className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>Kaydet</button>
                  <button type="button" onClick={() => setPaketFormAcik(false)} className="btn btn-ghost">İptal</button>
                </div>
              </form>
            )}

            {(() => {
              const PLAN_DEFS = {
                baslangic: { isim: "Başlangıç", fiyat: 299, calisan_limit: 1, hizmet_limit: 5, aylik_randevu_limit: 200, bot_aktif: true, hatirlatma: true, istatistik: false, export_aktif: false, ozellikler: "1 Çalışan\n200 Randevu/Ay\nOtomatik Hatırlatma\nTemel Analitik", sira: 1 },
                profesyonel: { isim: "Profesyonel", fiyat: 999, calisan_limit: 3, hizmet_limit: 20, aylik_randevu_limit: 99999, bot_aktif: true, hatirlatma: true, istatistik: true, export_aktif: true, ozellikler: "3 Çalışan\nSınırsız Randevu\nTelegram Desteği\nGelişmiş Analitik\nGoogle Calendar Sync\n5 Dil Desteği", sira: 2 },
                kurumsal: { isim: "Kurumsal", fiyat: 0, calisan_limit: 999, hizmet_limit: 999, aylik_randevu_limit: 99999, bot_aktif: true, hatirlatma: true, istatistik: true, export_aktif: true, ozellikler: "Sınırsız Çalışan\nSınırsız Randevu\nÖzel API Entegrasyonu\nÖzel Eğitim & Onboarding\nSLA Garantisi\n12+ Dil Desteği", sira: 3 }
              };
              const mevcutKodlar = paketTanimlar.map(p => p.kod);
              const eksikler = Object.entries(PLAN_DEFS).filter(([kod]) => !mevcutKodlar.includes(kod));

              return (
                <>
                  {eksikler.length > 0 && (
                    <div className="card mb-16" style={{ padding: "16px 20px", background: "rgba(59,130,246,.05)", border: "1px solid rgba(59,130,246,.15)" }}>
                      <div style={{ fontSize: 13, color: "#3b82f6", fontWeight: 600, marginBottom: 10 }}>📦 Landing page'deki {eksikler.length} paket henüz DB'de tanımlı değil:</div>
                      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                        {eksikler.map(([kod, p]) => (
                          <button key={kod} onClick={async () => {
                            await api.post("/admin/paketler", { kod, ...p });
                            paketleriYukle();
                          }} className="btn btn-sm" style={{ background: "rgba(59,130,246,.12)", color: "#3b82f6", fontWeight: 700 }}>
                            {p.isim} {p.fiyat > 0 ? `(${p.fiyat}₺)` : "(Özel Fiyat)"} → DB'ye Aktar
                          </button>
                        ))}
                        <button onClick={async () => {
                          for (const [kod, p] of eksikler) { await api.post("/admin/paketler", { kod, ...p }); }
                          paketleriYukle();
                        }} className="btn btn-sm" style={{ background: "#3b82f6", color: "#fff", fontWeight: 700 }}>
                          🚀 Tümünü Aktar ({eksikler.length} paket)
                        </button>
                      </div>
                    </div>
                  )}

                  {paketTanimlar.length === 0 ? (
                    <div className="list-empty"><p>Henüz DB'de paket tanımı yok. Yukarıdan aktar veya yeni paket tanımla.</p></div>
                  ) : paketTanimlar.map(p => (
                    duzenlePaket?.id === p.id ? (
                      /* ── Düzenleme Modu ── */
                      <form key={p.id} onSubmit={async (e) => {
                        e.preventDefault();
                        const { id, ...gonder } = duzenlePaket;
                        await api.put(`/admin/paketler/${id}`, gonder);
                        setDuzenlePaket(null); paketleriYukle();
                      }} style={{ background: "var(--surface)", borderRadius: 14, padding: "20px", border: "2px solid rgba(245,158,11,.3)", marginBottom: 8 }}>
                        <div className="row row-between mb-12">
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#f59e0b" }}>✏️ Düzenleme: {p.isim}</span>
                          <div className="row gap-6">
                            <button type="submit" style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "#f59e0b", color: "#000", fontWeight: 700, fontSize: 12 }}>💾 Kaydet</button>
                            <button type="button" onClick={() => setDuzenlePaket(null)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 12 }}>İptal</button>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>İsim</label><input value={duzenlePaket.isim} onChange={e => setDuzenlePaket({...duzenlePaket, isim: e.target.value})} className="input" style={{ fontSize: 13 }} /></div>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Kod</label><input value={duzenlePaket.kod} onChange={e => setDuzenlePaket({...duzenlePaket, kod: e.target.value})} className="input" style={{ fontSize: 13 }} /></div>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Fiyat (₺)</label><input type="number" value={duzenlePaket.fiyat} onChange={e => setDuzenlePaket({...duzenlePaket, fiyat: e.target.value})} className="input" style={{ fontSize: 13 }} /></div>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Çalışan Limiti</label><input type="number" value={duzenlePaket.calisan_limit} onChange={e => setDuzenlePaket({...duzenlePaket, calisan_limit: parseInt(e.target.value) || 0})} className="input" style={{ fontSize: 13 }} /></div>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Hizmet Limiti</label><input type="number" value={duzenlePaket.hizmet_limit} onChange={e => setDuzenlePaket({...duzenlePaket, hizmet_limit: parseInt(e.target.value) || 0})} className="input" style={{ fontSize: 13 }} /></div>
                          <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Randevu Limiti</label><input type="number" value={duzenlePaket.aylik_randevu_limit} onChange={e => setDuzenlePaket({...duzenlePaket, aylik_randevu_limit: parseInt(e.target.value) || 0})} className="input" style={{ fontSize: 13 }} /></div>
                        </div>
                        <div className="row row-wrap gap-12 mb-12">
                          {[["bot_aktif","🤖 Bot"],["hatirlatma","🔔 Hatırlatma"],["istatistik","📊 İstatistik"],["export_aktif","📥 Export"]].map(([k,l]) => (
                            <label key={k} className="row gap-6" style={{ fontSize: 12, cursor: "pointer" }}>
                              <input type="checkbox" checked={duzenlePaket[k] || false} onChange={e => setDuzenlePaket({...duzenlePaket, [k]: e.target.checked})} />
                              <span style={{ color: "var(--text)" }}>{l}</span>
                            </label>
                          ))}
                        </div>
                        <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Özellikler (her satır bir madde)</label><textarea value={duzenlePaket.ozellikler || ""} onChange={e => setDuzenlePaket({...duzenlePaket, ozellikler: e.target.value})} className="input" rows={3} style={{ resize: "vertical", fontSize: 12 }} /></div>
                      </form>
                    ) : (
                      /* ── Normal Görünüm ── */
                      <div key={p.id} className="list-item" style={{ flexDirection: "column", gap: 10 }}>
                        <div className="row row-between row-wrap gap-8">
                          <div className="row row-wrap gap-8">
                            <span style={{ color: paketRenk[p.kod] || "#8b5cf6", fontWeight: 700, fontSize: 16 }}>{p.isim}</span>
                            <span className="tag" style={{ background: "rgba(245,158,11,.12)", color: "#f59e0b", fontWeight: 700 }}>{parseFloat(p.fiyat)}₺/ay</span>
                            <span style={{ color: "var(--dim)", fontSize: 12 }}>kod: {p.kod}</span>
                            {!p.aktif && <span className="tag" style={{ background: "rgba(239,68,68,.12)", color: "#ef4444", fontWeight: 600, fontSize: 11 }}>Pasif</span>}
                          </div>
                          <div className="row gap-6">
                            <button onClick={() => setDuzenlePaket({ id: p.id, kod: p.kod, isim: p.isim, fiyat: p.fiyat, calisan_limit: p.calisan_limit, hizmet_limit: p.hizmet_limit, aylik_randevu_limit: p.aylik_randevu_limit, bot_aktif: p.bot_aktif, hatirlatma: p.hatirlatma, istatistik: p.istatistik, export_aktif: p.export_aktif, ozellikler: p.ozellikler || "", sira: p.sira || 0 })} className="btn btn-sm" style={{ background: "rgba(59,130,246,.1)", color: "#3b82f6", border: "none", fontWeight: 600 }}>✏️ Düzenle</button>
                            <button onClick={async () => { if(confirm(`"${p.isim}" paketini silmek istediğinize emin misiniz?`)) { await api.del(`/admin/paketler/${p.id}`); paketleriYukle(); } }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Sil</button>
                          </div>
                        </div>
                        <div className="row row-wrap gap-12" style={{ fontSize: 12, color: "var(--dim)" }}>
                          <span>👥 {p.calisan_limit >= 999 ? "Sınırsız" : p.calisan_limit} çalışan</span>
                          <span>🔧 {p.hizmet_limit >= 999 ? "Sınırsız" : p.hizmet_limit} hizmet</span>
                          <span>📅 {p.aylik_randevu_limit >= 9999 ? "Sınırsız" : p.aylik_randevu_limit} randevu</span>
                          {p.bot_aktif && <span style={{ color: "#10b981" }}>🤖 Bot</span>}
                          {p.hatirlatma && <span style={{ color: "#3b82f6" }}>🔔 Hatırlatma</span>}
                          {p.istatistik && <span style={{ color: "#8b5cf6" }}>📊 İstatistik</span>}
                          {p.export_aktif && <span style={{ color: "#f59e0b" }}>📥 Export</span>}
                        </div>
                        {p.ozellikler && <div style={{ fontSize: 12, color: "var(--dim)" }}>{p.ozellikler}</div>}
                      </div>
                    )
                  ))}
                </>
              );
            })()}
          </>
        )}

        {/* ZOMBİ MÜŞTERİLER */}
        {sayfa === "zombiler" && (() => {
          const botYok = zombiler.filter(z => z.zombi_durum === 'bot_yok');
          const randevuYok = zombiler.filter(z => z.zombi_durum === 'randevu_yok');
          const pasif30 = zombiler.filter(z => z.zombi_durum === 'pasif_30gun');
          const durumRenk = { bot_yok: "#ef4444", randevu_yok: "#f59e0b", pasif_30gun: "#3b82f6" };
          const durumLabel = { bot_yok: "🚫 Bot Yok & Randevu Yok", randevu_yok: "📭 Hiç Randevu Almamış", pasif_30gun: "😴 30+ Gün Randevu Yok" };
          const tumunuSec = () => { if (zombiSecili.length === zombiler.length) setZombiSecili([]); else setZombiSecili(zombiler.map(z => z.id)); };
          const zombiMesajGonder = async () => {
            if (!zombiMesajMetni.trim() || zombiSecili.length === 0) return;
            try {
              const d = await api.post("/admin/zombiler/mesaj", { isletme_ids: zombiSecili, mesaj: zombiMesajMetni, kanal: zombiKanal });
              alert(d.mesaj || 'Gönderildi');
              setZombiMesajModal(false); setZombiMesajMetni(''); setZombiSecili([]);
            } catch(e) { alert('Hata: ' + (e.message || 'Gönderilemedi')); }
          };
          return (
          <>
            <div className="page-header">
              <h1>🧟 Zombi Müşteri Takibi</h1>
              <p>Aktif işletmeler arasında ilgi göstermeyenler — bot bağlamamış veya hiç randevu almamış</p>
            </div>

            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{"--card-accent":"#ef4444"}}><div className="sc-icon">🚫</div><div className="sc-label">Bot Yok & Randevu Yok</div><div className="sc-val">{botYok.length}</div></div>
              <div className="stat-card amber"><div className="sc-icon">📭</div><div className="sc-label">Hiç Randevu Almamış</div><div className="sc-val">{randevuYok.length}</div></div>
              <div className="stat-card blue"><div className="sc-icon">😴</div><div className="sc-label">30+ Gün Pasif</div><div className="sc-val">{pasif30.length}</div></div>
              <div className="stat-card" style={{"--card-accent":"#64748b"}}><div className="sc-icon">🧟</div><div className="sc-label">Toplam Zombi</div><div className="sc-val">{zombiler.length}</div></div>
            </div>

            {/* Aksiyon Bar */}
            {zombiler.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 16px", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  <input type="checkbox" checked={zombiSecili.length === zombiler.length && zombiler.length > 0} onChange={tumunuSec} style={{ accentColor: "#8b5cf6", width: 16, height: 16 }} />
                  Tümünü Seç ({zombiSecili.length}/{zombiler.length})
                </label>
                <div style={{ flex: 1 }} />
                <button onClick={() => { if (zombiSecili.length === 0) return alert('Önce işletme seçin'); setZombiMesajModal(true); }}
                  style={{ padding: "8px 16px", borderRadius: 10, background: zombiSecili.length > 0 ? "linear-gradient(135deg,#8b5cf6,#6d28d9)" : "#64748b40", color: zombiSecili.length > 0 ? "#fff" : "var(--dim)", border: "none", fontWeight: 700, fontSize: 13, cursor: zombiSecili.length > 0 ? "pointer" : "default" }}>
                  📨 Seçilenlere Mesaj Gönder ({zombiSecili.length})
                </button>
              </div>
            )}

            {zombiler.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                <div style={{ fontSize: 48, marginBottom: 8 }}>🎉</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Zombi müşteri yok!</div>
                <p style={{ fontSize: 13 }}>Tüm aktif işletmeler bot bağlamış ve randevu alıyor</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {zombiler.map(z => {
                  const renk = durumRenk[z.zombi_durum] || "#64748b";
                  const gunOnce = z.olusturma_tarihi ? Math.floor((new Date() - new Date(z.olusturma_tarihi)) / 86400000) : 0;
                  const secili = zombiSecili.includes(z.id);
                  return (
                    <div key={z.id} style={{ background: secili ? "rgba(139,92,246,.06)" : "var(--surface)", borderRadius: 14, padding: "14px 18px", border: `1px solid ${secili ? "#8b5cf6" : renk + "20"}`, cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Checkbox */}
                        <input type="checkbox" checked={secili} onChange={() => { if (secili) setZombiSecili(zombiSecili.filter(id => id !== z.id)); else setZombiSecili([...zombiSecili, z.id]); }} onClick={e => e.stopPropagation()} style={{ accentColor: "#8b5cf6", width: 16, height: 16, flexShrink: 0 }} />
                        {/* Avatar */}
                        <div onClick={() => isletmeDetayYukle(z.id)} style={{ width: 40, height: 40, borderRadius: 10, background: `${renk}12`, display: "flex", alignItems: "center", justifyContent: "center", color: renk, fontWeight: 800, fontSize: 15, flexShrink: 0 }}>
                          {(z.isim || "?")[0]}
                        </div>

                        {/* Bilgi */}
                        <div onClick={() => isletmeDetayYukle(z.id)} style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{z.isim}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${renk}12`, color: renk, fontSize: 10, fontWeight: 700 }}>{durumLabel[z.zombi_durum]}</span>
                          </div>
                          <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 11, color: "var(--dim)", flexWrap: "wrap" }}>
                            <span>📞 {z.telefon}</span>
                            <span>{z.kategori} · {z.paket}</span>
                            <span>Kayıt: {z.olusturma_tarihi ? new Date(z.olusturma_tarihi).toLocaleDateString("tr-TR") : "—"} ({gunOnce} gün önce)</span>
                            <span>📅 {parseInt(z.randevu_sayisi) || 0} randevu</span>
                            {z.son_randevu && <span>Son: {new Date(z.son_randevu).toLocaleDateString("tr-TR")}</span>}
                          </div>
                        </div>

                        {/* Bot durumu */}
                        <div style={{ flexShrink: 0, textAlign: "center" }}>
                          <div style={{ padding: "4px 10px", borderRadius: 8, background: z.bot_bagli ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", color: z.bot_bagli ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 700 }}>
                            {z.bot_bagli ? "✓ Bot Bağlı" : "✗ Bot Yok"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bilgi */}
            <div style={{ marginTop: 16, background: "rgba(59,130,246,.04)", borderRadius: 12, padding: "14px 18px", border: "1px solid rgba(59,130,246,.1)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#3b82f6", marginBottom: 6 }}>💡 Zombi Müşteri Nedir?</div>
              <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
                • <strong style={{ color: "var(--text)" }}>Bot Yok & Randevu Yok:</strong> Bot bağlamamış ve hiç randevusu yok — muhtemelen kayıt olup terk etmiş<br/>
                • <strong style={{ color: "var(--text)" }}>Hiç Randevu Almamış:</strong> Bot bağlamış ama hiç randevu gelmemiş — setup yapmamış olabilir<br/>
                • <strong style={{ color: "var(--text)" }}>30+ Gün Pasif:</strong> Daha önce aktifti ama son 30 gündür randevu almamış — ilgiyi kaybetmiş olabilir<br/>
                • Bot bağlı ve randevusu olan işletmeler burada <strong>gösterilmez</strong>
              </div>
            </div>

            {/* Toplu Mesaj Modal */}
            {zombiMesajModal && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setZombiMesajModal(false)}>
                <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 20, padding: 28, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 800, color: "var(--text)" }}>📨 Toplu Mesaj Gönder</h3>
                  <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>{zombiSecili.length} işletmeye mesaj gönderilecek</p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6, display: "block" }}>Kanal</label>
                    <select value={zombiKanal} onChange={e => setZombiKanal(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="hepsi">WhatsApp + Telegram</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", marginBottom: 6, display: "block" }}>Mesaj Metni</label>
                    <textarea value={zombiMesajMetni} onChange={e => setZombiMesajMetni(e.target.value)} rows={5} placeholder="Merhaba, SıraGO olarak sizinle tekrar iletişime geçmek istedik..." style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setZombiMesajModal(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
                    <button onClick={zombiMesajGonder} disabled={!zombiMesajMetni.trim()} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: zombiMesajMetni.trim() ? "linear-gradient(135deg,#8b5cf6,#6d28d9)" : "#64748b40", color: zombiMesajMetni.trim() ? "#fff" : "var(--dim)", fontWeight: 700, fontSize: 13, cursor: zombiMesajMetni.trim() ? "pointer" : "default" }}>Gönder</button>
                  </div>
                </div>
              </div>
            )}
          </>
          );
        })()}

        {/* REFERANS (Affiliate) SİSTEMİ */}
        {sayfa === "referanslar" && (() => {
          const toplamDavet = referanslar.reduce((s,r) => s + (r.toplam_davet || 0), 0);
          const toplamKazanilan = referanslar.reduce((s,r) => s + (r.kazanilan_ay || 0), 0);
          const gunSecenekleri = [
            { label: "1 hafta", gun: 7 },
            { label: "2 hafta", gun: 14 },
            { label: "3 hafta", gun: 21 },
            { label: "1 ay", gun: 30 },
            { label: "2 ay", gun: 60 },
            { label: "3 ay", gun: 90 },
            { label: "6 ay", gun: 180 },
            { label: "1 yıl", gun: 365 },
          ];
          const gunLabel = (g) => {
            if (!g) return "—";
            if (g < 30) return `${Math.round(g/7)} hafta`;
            if (g < 365) return `${Math.round(g/30)} ay`;
            return `${Math.round(g/365)} yıl`;
          };
          return (
          <>
            <div className="page-header">
              <h1>🤝 Referans (Affiliate) Sistemi</h1>
              <p>İşletmelere referans kodu ver — müşteri getirene bedava süre tanımla</p>
            </div>

            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card green"><div className="sc-icon">🔗</div><div className="sc-label">Toplam Referans</div><div className="sc-val">{referanslar.length}</div></div>
              <div className="stat-card blue"><div className="sc-icon">👥</div><div className="sc-label">Toplam Davet</div><div className="sc-val">{toplamDavet}</div></div>
              <div className="stat-card amber"><div className="sc-icon">🎁</div><div className="sc-label">Verilen Bedava Hak</div><div className="sc-val">{toplamKazanilan}</div></div>
            </div>

            {/* Yeni Referans Oluştur */}
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, marginBottom: 16, border: "1px solid rgba(16,185,129,.15)" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#10b981", marginBottom: 14 }}>➕ Yeni Referans Kodu Oluştur</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
                <div style={{ gridColumn: "span 2" }}>
                  <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>İşletme</label>
                  <select id="refIsletme" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}>
                    <option value="">Seç...</option>
                    {isletmeler.map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Bedava Süre</label>
                  <select id="refBedavaGun" defaultValue="30" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontWeight: 700 }}>
                    {gunSecenekleri.map(g => <option key={g.gun} value={g.gun}>{g.label} ({g.gun} gün)</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Kaç Davet Gerekli</label>
                  <select id="refMinDavet" defaultValue="1" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontWeight: 700 }}>
                    {[1,2,3,5,10].map(n => <option key={n} value={n}>{n} davet → bedava</option>)}
                  </select>
                </div>
                <div>
                  <button onClick={async () => {
                    const isletme_id = document.getElementById('refIsletme').value;
                    const bedava_gun = parseInt(document.getElementById('refBedavaGun').value) || 30;
                    const min_davet = parseInt(document.getElementById('refMinDavet').value) || 1;
                    if (!isletme_id) { alert('İşletme seçin'); return; }
                    const res = await api.post("/admin/referanslar", { isletme_id, bedava_gun, min_davet });
                    if (res.referans) { alert(`Referans kodu: ${res.referans.referans_kodu}\n${min_davet} davet → ${gunLabel(bedava_gun)} bedava`); referanslariYukle(); }
                  }} style={{ width: "100%", padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontWeight: 700, fontSize: 13 }}>🔗 Oluştur</button>
                </div>
              </div>
            </div>

            {/* Referans Listesi */}
            {referanslar.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔗</div>
                <p>Henüz referans kodu yok</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {referanslar.map(r => {
                  const minD = r.min_davet || 1;
                  const bedG = r.bedava_gun || 30;
                  const progress = minD > 0 ? Math.min(((r.toplam_davet || 0) % minD) / minD * 100, 100) : 0;
                  return (
                    <div key={r.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 18px", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, flexShrink: 0 }}>{(r.isletme_isim || "?")[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{r.isletme_isim}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(16,185,129,.1)", color: "#10b981", fontWeight: 700, fontSize: 11, fontFamily: "monospace", letterSpacing: .5 }}>{r.referans_kodu}</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--dim)", flexWrap: "wrap" }}>
                            <span>👥 {r.toplam_davet || 0} davet</span>
                            <span>🎯 {minD} davet → {gunLabel(bedG)} bedava</span>
                            <span>🎁 {r.kazanilan_ay || 0} kez kazanıldı</span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #10b981, #059669)", borderRadius: 2, transition: "width .3s" }} />
                            </div>
                            <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap" }}>{(r.toplam_davet || 0) % minD}/{minD}</span>
                          </div>
                        </div>
                        {/* Ayarlar */}
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center" }}>
                          <div>
                            <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2, textAlign: "center" }}>Süre</div>
                            <select value={bedG} onChange={async (e) => {
                              await api.put(`/admin/referanslar/${r.id}/bedava-ay`, { bedava_gun: parseInt(e.target.value) });
                              referanslariYukle();
                            }} style={{ width: 80, padding: "4px 6px", fontSize: 11, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.06)", border: "1px solid rgba(245,158,11,.15)", borderRadius: 6, cursor: "pointer" }}>
                              {gunSecenekleri.map(g => <option key={g.gun} value={g.gun}>{g.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2, textAlign: "center" }}>Min Davet</div>
                            <select value={minD} onChange={async (e) => {
                              await api.put(`/admin/referanslar/${r.id}/bedava-ay`, { min_davet: parseInt(e.target.value) });
                              referanslariYukle();
                            }} style={{ width: 60, padding: "4px 6px", fontSize: 11, fontWeight: 700, color: "#3b82f6", background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)", borderRadius: 6, cursor: "pointer" }}>
                              {[1,2,3,5,10].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                          <button onClick={async () => {
                            if (!confirm(`"${r.isletme_isim}" — "${r.referans_kodu}" kodunu silmek istediğinize emin misiniz?`)) return;
                            await api.del(`/admin/referanslar/${r.id}`);
                            referanslariYukle();
                          }} title="Sil" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(239,68,68,.06)", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bilgi Kartı */}
            <div style={{ marginTop: 16, background: "rgba(59,130,246,.04)", borderRadius: 12, padding: "14px 18px", border: "1px solid rgba(59,130,246,.1)" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#3b82f6", marginBottom: 6 }}>💡 Referans Nasıl Çalışır?</div>
              <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.8 }}>
                <strong style={{ color: "var(--text)" }}>1.</strong> İşletmeye referans kodu oluşturursun (ör: REF-ABC123)<br/>
                <strong style={{ color: "var(--text)" }}>2.</strong> İşletme bu kodu tanıdığı esnafa paylaşır<br/>
                <strong style={{ color: "var(--text)" }}>3.</strong> Yeni esnaf <strong style={{ color: "#10b981" }}>satış botu üzerinden kayıt olurken referans kodunu girer</strong><br/>
                <strong style={{ color: "var(--text)" }}>4.</strong> Belirlediğin sayıda davet tamamlanınca → işletmeye otomatik bedava süre eklenir<br/>
                <strong style={{ color: "var(--text)" }}>5.</strong> Süre ve min davet sayısını her referans için ayrı ayrı değiştirebilirsin<br/>
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(245,158,11,.06)", borderRadius: 8, border: "1px solid rgba(245,158,11,.12)" }}>
                  <strong style={{ color: "#f59e0b" }}>Örnek:</strong> <span style={{ color: "var(--text)" }}>3 davet → 1 ay bedava</span> — İşletme 3 yeni müşteri getirirse 30 gün bedava kazanır. 6 getirirse 60 gün. Her 3'te bir ödül!
                </div>
              </div>
            </div>
          </>
          );
        })()}

        {/* GLOBAL DUYURULAR */}
        {sayfa === "duyurular" && (
          <>
            <div className="page-header">
              <h1>📢 Duyurular</h1>
              <p>Tek tuşla tüm müşterilerin dashboard'una bildirim çak</p>
            </div>
            <button onClick={() => setDuyuruFormAcik(!duyuruFormAcik)} className="btn btn-sm mb-16" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>+ Yeni Duyuru</button>

            {duyuruFormAcik && (
              <form onSubmit={async (e) => {
                e.preventDefault();
                await api.post("/admin/duyurular", yeniDuyuru);
                setYeniDuyuru({ baslik:"", mesaj:"", tip:"bilgi", hedef:"hepsi" });
                setDuyuruFormAcik(false); duyurulariYukle();
              }} className="form-card card-accent-amber mb-16">
                <h3 className="amber">Yeni Duyuru Yayınla</h3>
                <div className="form-grid">
                  <div><label className="form-label">Başlık</label><input value={yeniDuyuru.baslik} onChange={e => setYeniDuyuru({...yeniDuyuru, baslik: e.target.value})} placeholder="🎉 Yeni özellik!" className="input" required /></div>
                  <div>
                    <label className="form-label">Tip</label>
                    <select value={yeniDuyuru.tip} onChange={e => setYeniDuyuru({...yeniDuyuru, tip: e.target.value})} className="input">
                      <option value="bilgi">ℹ️ Bilgi</option>
                      <option value="guncelleme">🆕 Güncelleme</option>
                      <option value="bakim">🔧 Bakım</option>
                      <option value="uyari">⚠️ Uyarı</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Hedef</label>
                    <select value={yeniDuyuru.hedef} onChange={e => setYeniDuyuru({...yeniDuyuru, hedef: e.target.value})} className="input">
                      <option value="hepsi">Tüm Müşteriler</option>
                      <option value="premium">Sadece Premium</option>
                      <option value="profesyonel">Profesyonel+</option>
                    </select>
                  </div>
                </div>
                <div className="mt-12"><label className="form-label">Mesaj</label><textarea value={yeniDuyuru.mesaj} onChange={e => setYeniDuyuru({...yeniDuyuru, mesaj: e.target.value})} placeholder="Duyuru içeriğini yazın..." className="input" rows={3} required /></div>
                <div className="form-actions mt-12">
                  <button type="submit" className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>Yayınla 🚀</button>
                  <button type="button" onClick={() => setDuyuruFormAcik(false)} className="btn btn-ghost">İptal</button>
                </div>
              </form>
            )}

            {duyurular.length === 0 ? (
              <div className="list-empty"><p>Henüz duyuru yok.</p></div>
            ) : duyurular.map(d => {
              const tipRenk = { bilgi: "#3b82f6", guncelleme: "#10b981", bakim: "#f59e0b", uyari: "#ef4444" };
              const tipIcon = { bilgi: "ℹ️", guncelleme: "🆕", bakim: "🔧", uyari: "⚠️" };
              return (
                <div key={d.id} className="list-item" style={{ flexDirection: "column", gap: 8, opacity: d.aktif ? 1 : 0.5 }}>
                  <div className="row row-between row-wrap gap-8">
                    <div className="row row-wrap gap-8">
                      <span style={{ fontSize: 16 }}>{tipIcon[d.tip] || "📢"}</span>
                      <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 15 }}>{d.baslik}</span>
                      <span className="tag" style={{ background: (tipRenk[d.tip]||"#64748b") + "22", color: tipRenk[d.tip]||"#64748b", fontWeight: 700, fontSize: 11 }}>{d.tip}</span>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>Hedef: {d.hedef}</span>
                    </div>
                    <div className="row gap-6">
                      <button onClick={async () => { await api.put(`/admin/duyurular/${d.id}`, { ...d, aktif: !d.aktif }); duyurulariYukle(); }}
                        className="btn btn-sm" style={{ background: d.aktif ? "rgba(239,68,68,.12)" : "rgba(16,185,129,.12)", color: d.aktif ? "#ef4444" : "#10b981", border: "none", fontWeight: 600, fontSize: 11 }}>
                        {d.aktif ? "Pasifleştir" : "Aktifleştir"}
                      </button>
                      <button onClick={async () => { if(confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) { await api.del(`/admin/duyurular/${d.id}`); duyurulariYukle(); } }}
                        className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Sil</button>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>{new Date(d.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                    </div>
                  </div>
                  <div style={{ color: "var(--muted)", fontSize: 13 }}>{d.mesaj}</div>
                </div>
              );
            })}
          </>
        )}

        {/* MÜŞTERİ AKTİVİTE HARİTASI */}
        {sayfa === "aktivite" && (
          <>
            <div className="page-header">
              <h1>📊 Müşteri Aktivite Haritası</h1>
              <button onClick={aktiviteYukle} className="btn btn-sm" style={{ background: "rgba(59,130,246,.12)", color: "#3b82f6" }}>🔄 Yenile</button>
            </div>

            {!aktiviteVeri || !aktiviteVeri.ozet ? (
              <div className="list-empty"><p>Yükleniyor...</p></div>
            ) : (
              <>
                {/* Özet Kartları */}
                <div className="row row-wrap gap-12 mb-24">
                  <StatCard icon="📈" baslik="Ort. Aktivite Skoru" deger={`%${aktiviteVeri.ozet?.ortSkor || 0}`} renk="#3b82f6" />
                  <StatCard icon="✅" baslik="Aktif İşletme" deger={aktiviteVeri.ozet?.aktifSayi || 0} renk="#10b981" />
                  <StatCard icon="😴" baslik="Pasif İşletme" deger={aktiviteVeri.ozet?.pasifSayi || 0} renk="#ef4444" />
                  <StatCard icon="📅" baslik="Bu Ay Randevu" deger={aktiviteVeri.ozet?.toplamRandevu || 0} renk="#8b5cf6" />
                  <StatCard icon="👥" baslik="Toplam Müşteri" deger={aktiviteVeri.ozet?.toplamMusteri || 0} renk="#f59e0b" />
                </div>

                {/* Filtre */}
                <div className="row gap-8 mb-16">
                  {[["hepsi","Tümü"],["aktif","Aktif (Skor>20)"],["pasif","Pasif (Skor≤20)"],["odenmedi","Ödenmemiş"]].map(([k,l]) => (
                    <button key={k} onClick={() => setAktiviteFiltre(k)} className="btn btn-sm"
                      style={{ background: aktiviteFiltre === k ? "rgba(59,130,246,.15)" : "var(--bg)", color: aktiviteFiltre === k ? "#3b82f6" : "var(--muted)", fontWeight: aktiviteFiltre === k ? 700 : 500, border: "none" }}>{l}</button>
                  ))}
                </div>

                {/* İşletme Listesi */}
                {aktiviteVeri.aktiviteler
                  .filter(a => {
                    if (aktiviteFiltre === "aktif") return a.aktivite_skoru > 20;
                    if (aktiviteFiltre === "pasif") return a.aktivite_skoru <= 20;
                    if (aktiviteFiltre === "odenmedi") return a.odeme_durumu !== "odendi";
                    return true;
                  })
                  .map(a => {
                    const skorRenk = a.aktivite_skoru >= 60 ? "#10b981" : a.aktivite_skoru >= 30 ? "#f59e0b" : "#ef4444";
                    const kategoriR = { berber: "#3b82f6", kuafor: "#8b5cf6", disci: "#10b981", guzellik: "#f59e0b", veteriner: "#ef4444", diyetisyen: "#06b6d4" };
                    const odemeR = { odendi: "#10b981", odenmedi: "#ef4444", havale_bekliyor: "#818cf8", bekliyor: "#f59e0b" };
                    return (
                      <div key={a.id} className="card mb-12" style={{ padding: "18px 20px" }}>
                        <div className="row row-between row-wrap gap-12 mb-10">
                          <div className="row gap-12" style={{ alignItems: "center" }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: 12,
                              background: `${skorRenk}15`, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 18, fontWeight: 800, color: skorRenk, flexShrink: 0
                            }}>{a.aktivite_skoru}</div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>{a.isim}</div>
                              <div className="row gap-6" style={{ marginTop: 3 }}>
                                <span className="tag-xs" style={{ background: `${kategoriR[a.kategori] || "#64748b"}15`, color: kategoriR[a.kategori] || "#64748b" }}>{a.kategori}</span>
                                <span className="tag-xs" style={{ background: `${odemeR[a.odeme_durumu] || "#ef4444"}15`, color: odemeR[a.odeme_durumu] || "#ef4444" }}>
                                  {a.odeme_durumu === "odendi" ? "✓ Ödendi" : a.odeme_durumu === "havale_bekliyor" ? "🏦 Havale" : "✕ Ödenmedi"}
                                </span>
                                {a.ilce && <span style={{ fontSize: 11, color: "var(--dim)" }}>📍 {a.ilce}</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--dim)" }}>Aktivite Skoru</div>
                            <div style={{ width: 100, height: 6, borderRadius: 3, background: "var(--bg)", marginTop: 4 }}>
                              <div style={{ width: `${a.aktivite_skoru}%`, height: "100%", borderRadius: 3, background: skorRenk, transition: "width .3s" }} />
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Bu Ay Randevu</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>
                              {a.bu_ay_randevu}
                              {a.randevu_buyume !== 0 && <span style={{ fontSize: 11, color: a.randevu_buyume > 0 ? "#10b981" : "#ef4444", marginLeft: 6 }}>{a.randevu_buyume > 0 ? "↑" : "↓"}{Math.abs(a.randevu_buyume)}%</span>}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Toplam Müşteri</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{a.toplam_musteri}</div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Bot Mesajı</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{a.bot_mesaj}</div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Hizmet / Çalışan</div>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text)" }}>{a.hizmet_sayisi} / {a.calisan_sayisi}</div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Son Giriş</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{a.son_giris ? new Date(a.son_giris).toLocaleDateString("tr-TR") : "—"}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </>
        )}

        {/* BİLDİRİM MERKEZİ */}
        {sayfa === "bildirimler" && (
          <>
            <div className="page-header">
              <h1>🔔 Bildirim Merkezi</h1>
              <button onClick={bildirimleriYukle} className="btn btn-sm" style={{ background: "rgba(59,130,246,.12)", color: "#3b82f6" }}>🔄 Yenile</button>
            </div>

            {!bildirimVeri ? (
              <div className="list-empty"><p>Yükleniyor...</p></div>
            ) : (
              <>
                {/* Özet Kartları */}
                <div className="row row-wrap gap-12 mb-24">
                  <StatCard icon="📬" baslik="Toplam" deger={bildirimVeri.ozet.toplam} renk="#3b82f6" />
                  <StatCard icon="🔴" baslik="Yüksek Öncelik" deger={bildirimVeri.ozet.yuksek} renk="#ef4444" />
                  <StatCard icon="🟡" baslik="Orta Öncelik" deger={bildirimVeri.ozet.orta} renk="#f59e0b" />
                  <StatCard icon="🟢" baslik="Düşük Öncelik" deger={bildirimVeri.ozet.dusuk} renk="#10b981" />
                </div>

                {/* Filtre */}
                <div className="row gap-8 mb-16">
                  {[["hepsi","Tümü"],["yuksek","🔴 Yüksek"],["orta","🟡 Orta"],["dusuk","🟢 Düşük"]].map(([k,l]) => (
                    <button key={k} onClick={() => setBildirimFiltre(k)} className="btn btn-sm"
                      style={{ background: bildirimFiltre === k ? "rgba(59,130,246,.15)" : "var(--bg)", color: bildirimFiltre === k ? "#3b82f6" : "var(--muted)", fontWeight: bildirimFiltre === k ? 700 : 500, border: "none" }}>{l}</button>
                  ))}
                </div>

                {/* Bildirim Listesi */}
                {bildirimVeri.bildirimler.length === 0 ? (
                  <div className="list-empty"><p>Bildirim yok, her şey yolunda! 🎉</p></div>
                ) : bildirimVeri.bildirimler
                  .filter(b => bildirimFiltre === "hepsi" || b.oncelik === bildirimFiltre)
                  .map((b, idx) => {
                    const oncelikRenk = { yuksek: "#ef4444", orta: "#f59e0b", dusuk: "#10b981" };
                    const tipRenk = {
                      odeme_gecikme: "#ef4444", deneme_bitiyor: "#f59e0b", yeni_kayit: "#3b82f6",
                      havale_onay: "#818cf8", destek: "#8b5cf6", pasif_isletme: "#64748b"
                    };
                    return (
                      <div key={idx} className="list-item list-item-left" style={{
                        borderLeftColor: oncelikRenk[b.oncelik] || "#64748b", marginBottom: 8,
                        background: b.oncelik === "yuksek" ? "rgba(239,68,68,.03)" : "var(--surface)"
                      }}>
                        <div className="row row-between row-wrap gap-8">
                          <div className="row gap-10" style={{ alignItems: "center" }}>
                            <span style={{ fontSize: 22 }}>{b.ikon}</span>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>{b.baslik}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{b.mesaj}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <span className="tag-xs" style={{
                              background: `${tipRenk[b.tip] || "#64748b"}15`,
                              color: tipRenk[b.tip] || "#64748b", fontWeight: 600
                            }}>
                              {b.tip === "odeme_gecikme" ? "Ödeme" : b.tip === "deneme_bitiyor" ? "Deneme" : b.tip === "yeni_kayit" ? "Yeni Kayıt" : b.tip === "havale_onay" ? "Havale" : b.tip === "destek" ? "Destek" : b.tip === "pasif_isletme" ? "Pasif" : b.tip}
                            </span>
                            {b.tarih && <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>{new Date(b.tarih).toLocaleDateString("tr-TR")}</div>}
                          </div>
                        </div>
                        {/* Aksiyon butonları */}
                        <div className="row gap-6 mt-8">
                          {b.tip === "odeme_gecikme" && b.isletme_id && (
                            <button onClick={() => { setSayfa("odemeler"); }} className="btn btn-sm" style={{ background: "rgba(239,68,68,.08)", color: "#ef4444", border: "none", fontSize: 11 }}>Ödemeye Git →</button>
                          )}
                          {b.tip === "havale_onay" && (
                            <button onClick={() => { setSayfa("odemeler"); }} className="btn btn-sm" style={{ background: "rgba(129,140,248,.08)", color: "#818cf8", border: "none", fontSize: 11 }}>Onaylamaya Git →</button>
                          )}
                          {b.tip === "destek" && (
                            <button onClick={() => { setSayfa("destek"); }} className="btn btn-sm" style={{ background: "rgba(139,92,246,.08)", color: "#8b5cf6", border: "none", fontSize: 11 }}>Destek'e Git →</button>
                          )}
                          {b.tip === "pasif_isletme" && b.isletme_id && (
                            <button onClick={() => { setSayfa("aktivite"); }} className="btn btn-sm" style={{ background: "rgba(100,116,139,.08)", color: "#64748b", border: "none", fontSize: 11 }}>Aktiviteye Git →</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </>
            )}
          </>
        )}

        {/* AVCI BOT */}
        {sayfa === "avci" && (
          <>
            {/* Hero Header */}
            <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,.08) 0%, rgba(59,130,246,.06) 50%, rgba(16,185,129,.04) 100%)", borderRadius: 20, padding: "28px 32px", marginBottom: 24, border: "1px solid rgba(139,92,246,.1)" }}>
              <div className="row row-between row-wrap gap-12">
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>🎯 Avcı Bot</h1>
                  <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 6 }}>Google Maps & Sosyal Medya'dan potansiyel müşterileri bul, skorla, ara ve kazan</p>
                </div>
                <div className="row gap-8">
                  <button onClick={() => { setAvciTaramaAcik(!avciTaramaAcik); setTopluTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontWeight: 700, borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(16,185,129,.3)" }}>🔍 Maps Tara</button>
                  <button onClick={() => { setTopluTaramaAcik(!topluTaramaAcik); setAvciTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(139,92,246,.3)" }}>🚀 Toplu Maps</button>
                  <button onClick={() => { setSosyalAcik(!sosyalAcik); setAvciTaramaAcik(false); setTopluTaramaAcik(false); }} className="btn btn-sm" style={{ background: "linear-gradient(135deg, #e11d48, #be123c)", color: "#fff", fontWeight: 700, borderRadius: 12, border: "none", boxShadow: "0 4px 14px rgba(225,29,72,.3)" }}>📱 Sosyal Tara</button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            {avciStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
                {[
                  { icon: "📍", label: "Toplam Lead", val: avciStats.toplam, color: "#f59e0b", bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))" },
                  { icon: "🆕", label: "Yeni", val: avciStats.yeni, color: "#3b82f6", bg: "linear-gradient(135deg, rgba(59,130,246,.08), rgba(59,130,246,.02))" },
                  { icon: "📞", label: "Arandı", val: avciStats.arandi, color: "#8b5cf6", bg: "linear-gradient(135deg, rgba(139,92,246,.08), rgba(139,92,246,.02))" },
                  { icon: "🤝", label: "İlgileniyor", val: avciStats.ilgileniyor, color: "#f59e0b", bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))" },
                  { icon: "✅", label: "Müşteri Oldu", val: avciStats.musteri_oldu, color: "#10b981", bg: "linear-gradient(135deg, rgba(16,185,129,.08), rgba(16,185,129,.02))" }
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}18`, borderRadius: 16, padding: "20px 18px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -8, right: -8, fontSize: 48, opacity: 0.06 }}>{s.icon}</div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab Navigation */}
            <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
              {[
                { key: "gunluk", label: `📞 Bugün Ara (${avciGunluk.length})`, onClick: () => setAvciTab("gunluk") },
                { key: "liste-hepsi", label: `📋 Tümü (${avciListe.length})`, onClick: () => { setAvciTab("liste"); setAvciKaynak("hepsi"); } },
                { key: "liste-maps", label: "🗺️ Maps", onClick: () => { setAvciTab("liste"); setAvciKaynak("maps"); } },
                { key: "liste-sosyal", label: "📱 Sosyal", onClick: () => { setAvciTab("liste"); setAvciKaynak("sosyal"); } }
              ].map(t => {
                const isActive = t.key === "gunluk" ? avciTab === "gunluk" : t.key === "liste-hepsi" ? (avciTab === "liste" && avciKaynak === "hepsi") : t.key === "liste-maps" ? (avciTab === "liste" && avciKaynak === "maps") : (avciTab === "liste" && avciKaynak === "sosyal");
                return (
                  <button key={t.key} onClick={t.onClick} style={{ flex: 1, padding: "10px 16px", borderRadius: 10, border: "none", fontWeight: isActive ? 700 : 500, fontSize: 13, cursor: "pointer", transition: "all .2s", background: isActive ? "var(--surface)" : "transparent", color: isActive ? "var(--text)" : "var(--dim)", boxShadow: isActive ? "0 2px 8px rgba(0,0,0,.06)" : "none" }}>{t.label}</button>
                );
              })}
            </div>

            {/* Tekli tarama formu */}
            {avciTaramaAcik && (
              <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,.04), rgba(16,185,129,.01))", border: "1px solid rgba(16,185,129,.15)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(16,185,129,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🔍</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Tekli Maps Tarama</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Tek bir şehir/ilçe/kategori kombinasyonu tara</div>
                  </div>
                </div>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div><label className="form-label">Şehir *</label><input value={avciTarama.sehir} onChange={e => setAvciTarama({...avciTarama, sehir: e.target.value})} placeholder="İstanbul" className="input" style={{ borderRadius: 10 }} /></div>
                  <div><label className="form-label">İlçe</label><input value={avciTarama.ilce} onChange={e => setAvciTarama({...avciTarama, ilce: e.target.value})} placeholder="Kadıköy" className="input" style={{ borderRadius: 10 }} /></div>
                  <div><label className="form-label">Kategori *</label><select value={avciTarama.kategori} onChange={e => setAvciTarama({...avciTarama, kategori: e.target.value})} className="input" style={{ borderRadius: 10 }}>{["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => <option key={k} value={k}>{k}</option>)}</select></div>
                  <button disabled={avciTaramaYukleniyor} onClick={async () => { setAvciTaramaYukleniyor(true); setAvciTaramaSonuc(null); try { const res = await api.post("/admin/avci/tarama", avciTarama); setAvciTaramaSonuc(res); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); } catch(e) { setAvciTaramaSonuc({ hata: e.message }); } setAvciTaramaYukleniyor(false); }} className="btn" style={{ background: "#10b981", color: "#fff", fontWeight: 700, borderRadius: 10, opacity: avciTaramaYukleniyor ? 0.5 : 1 }}>{avciTaramaYukleniyor ? "Taranıyor..." : "🔍 Tara"}</button>
                </div>
                {avciTaramaSonuc && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: avciTaramaSonuc.hata ? "rgba(239,68,68,.08)" : "rgba(16,185,129,.08)", color: avciTaramaSonuc.hata ? "#ef4444" : "#10b981", fontSize: 13, fontWeight: 600 }}>{avciTaramaSonuc.hata ? `❌ ${avciTaramaSonuc.hata}` : `✅ "${avciTaramaSonuc.arama_metni}" — ${avciTaramaSonuc.toplam_bulunan} bulundu, ${avciTaramaSonuc.yeni_eklenen} yeni, ${avciTaramaSonuc.zaten_var} zaten vardı`}</div>}
              </div>
            )}

            {/* Toplu tarama formu */}
            {topluTaramaAcik && (
              <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,.04), rgba(139,92,246,.01))", border: "1px solid rgba(139,92,246,.15)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🚀</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Toplu Tarama — Tüm İlçeler</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>39 ilçede seçtiğin kategorileri otomatik tara (birkaç dk sürebilir)</div>
                  </div>
                </div>
                <div className="mb-16"><label className="form-label">Şehir</label><input value={topluSehir} onChange={e => setTopluSehir(e.target.value)} className="input" style={{ width: 160, borderRadius: 10 }} /></div>
                <div className="mb-16">
                  <label className="form-label mb-8">Kategoriler</label>
                  <div className="row row-wrap gap-6">{["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => (
                    <button key={k} onClick={() => setTopluKategoriler(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k])} style={{ padding: "6px 14px", borderRadius: 10, border: "none", fontSize: 12, fontWeight: topluKategoriler.includes(k) ? 700 : 500, cursor: "pointer", background: topluKategoriler.includes(k) ? "#8b5cf6" : "var(--bg)", color: topluKategoriler.includes(k) ? "#fff" : "var(--dim)", transition: "all .2s" }}>{k}</button>
                  ))}</div>
                  <span style={{ display: "block", marginTop: 8, color: "var(--dim)", fontSize: 11 }}>{topluKategoriler.length} kategori seçili · ~{topluKategoriler.length * 39} tarama</span>
                </div>
                <button disabled={topluYukleniyor || !topluKategoriler.length} onClick={async () => { setTopluYukleniyor(true); setTopluSonuc(null); try { const res = await api.post("/admin/avci/toplu-tarama", { sehir: topluSehir, kategoriler: topluKategoriler }); setTopluSonuc(res); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); } catch(e) { setTopluSonuc({ hata: e.message }); } setTopluYukleniyor(false); }} className="btn" style={{ background: topluYukleniyor ? "var(--surface3)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, borderRadius: 10, opacity: topluYukleniyor ? 0.6 : 1 }}>{topluYukleniyor ? "⏳ Toplu tarama devam ediyor..." : `🚀 ${topluKategoriler.length} Kategori × 39 İlçe Tara`}</button>
                {topluSonuc && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: topluSonuc.hata ? "rgba(239,68,68,.08)" : "rgba(139,92,246,.08)", color: topluSonuc.hata ? "#ef4444" : "#8b5cf6", fontSize: 13, fontWeight: 600 }}>{topluSonuc.hata ? `❌ ${topluSonuc.hata}` : `✅ ${topluSonuc.tarama_sayisi} tarama — ${topluSonuc.toplam_bulunan} bulundu, ${topluSonuc.yeni_eklenen} yeni, ${topluSonuc.zaten_var} zaten vardı`}</div>}
              </div>
            )}

            {/* Sosyal medya tarama formu */}
            {sosyalAcik && (
              <div style={{ background: "linear-gradient(135deg, rgba(225,29,72,.04), rgba(225,29,72,.01))", border: "1px solid rgba(225,29,72,.15)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(225,29,72,.12)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📱</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Sosyal Medya Tarama</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Instagram, Facebook, TikTok profilleri (günlük 100 ücretsiz)</div>
                  </div>
                </div>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div>
                    <label className="form-label">Platform *</label>
                    <div className="row gap-4">{[["instagram","📸 IG"],["facebook","📘 FB"],["tiktok","🎵 TT"],["hepsi","🌐 Hepsi"]].map(([v,l]) => (
                      <button key={v} onClick={() => setSosyalTarama({...sosyalTarama, platform: v})} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: sosyalTarama.platform === v ? 700 : 500, cursor: "pointer", background: sosyalTarama.platform === v ? "#e11d48" : "var(--bg)", color: sosyalTarama.platform === v ? "#fff" : "var(--dim)", transition: "all .2s" }}>{l}</button>
                    ))}</div>
                  </div>
                  <div><label className="form-label">Şehir *</label><input value={sosyalTarama.sehir} onChange={e => setSosyalTarama({...sosyalTarama, sehir: e.target.value})} className="input" style={{ width: 120, borderRadius: 10 }} /></div>
                  <div><label className="form-label">İlçe</label><input value={sosyalTarama.ilce} onChange={e => setSosyalTarama({...sosyalTarama, ilce: e.target.value})} placeholder="opsiyonel" className="input" style={{ width: 120, borderRadius: 10 }} /></div>
                  <div><label className="form-label">Kategori *</label><select value={sosyalTarama.kategori} onChange={e => setSosyalTarama({...sosyalTarama, kategori: e.target.value})} className="input" style={{ borderRadius: 10 }}>{["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => <option key={k} value={k}>{k}</option>)}</select></div>
                  <button disabled={sosyalYukleniyor} onClick={async () => { setSosyalYukleniyor(true); setSosyalSonuc(null); try { const res = await api.post("/admin/avci/sosyal-tarama", sosyalTarama); setSosyalSonuc(res); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); } catch(e) { setSosyalSonuc({ hata: e.message }); } setSosyalYukleniyor(false); }} className="btn" style={{ background: sosyalYukleniyor ? "var(--surface3)" : "linear-gradient(135deg, #e11d48, #be123c)", color: "#fff", fontWeight: 700, borderRadius: 10, opacity: sosyalYukleniyor ? 0.6 : 1 }}>{sosyalYukleniyor ? "⏳ Aranıyor..." : "🔍 Tara"}</button>
                </div>
                {sosyalSonuc && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: sosyalSonuc.hata ? "rgba(239,68,68,.08)" : "rgba(225,29,72,.08)", color: sosyalSonuc.hata ? "#ef4444" : "#e11d48", fontSize: 13, fontWeight: 600 }}>{sosyalSonuc.hata ? `❌ ${sosyalSonuc.hata}` : `✅ "${sosyalSonuc.arama_metni}" — ${sosyalSonuc.toplam_bulunan} sonuç, ${sosyalSonuc.yeni_eklenen} yeni, ${sosyalSonuc.zaten_var} zaten vardı`}</div>}
              </div>
            )}

            {/* GÜNLÜK ARAMA LİSTESİ */}
            {avciTab === "gunluk" && (
              <>
                <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,.06), rgba(59,130,246,.04))", border: "1px solid rgba(139,92,246,.12)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                  <div className="row gap-8" style={{ alignItems: "center" }}>
                    <span style={{ fontSize: 22 }}>📞</span>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Bugün Aranacak {avciGunluk.length} İşletme</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Henüz yazılmamış, telefonu olan, en yüksek skorlu lead'ler</div>
                    </div>
                  </div>
                </div>
                {avciGunluk.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}><div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div><p style={{ fontSize: 14 }}>Bugün aranacak kimse yok. Yeni tarama yap!</p></div>
                ) : avciGunluk.map((m, idx) => (
                  <div key={m.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "18px 20px", marginBottom: 10, border: "1px solid var(--border)", transition: "all .2s" }}>
                    <div className="row row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div className="row row-wrap gap-8 mb-6" style={{ alignItems: "center" }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>{idx + 1}</div>
                          <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 15 }}>{m.isletme_adi}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(59,130,246,.08)", color: "#3b82f6", fontSize: 11, fontWeight: 600 }}>{m.kategori}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(245,158,11,.08)", color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>Skor: {m.skor}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
                          {m.telefon && <span style={{ fontWeight: 600, color: "var(--text)" }}>📞 {m.telefon}</span>}
                          {m.adres && <span>📍 {m.adres}</span>}
                        </div>
                        <div className="row row-wrap gap-6" style={{ fontSize: 11 }}>
                          {!m.web_sitesi && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(16,185,129,.08)", color: "#10b981" }}>🌐 Web yok</span>}
                          {m.puan && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(245,158,11,.08)", color: "#f59e0b" }}>⭐ {m.puan}</span>}
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,.08)", color: "#8b5cf6" }}>💬 {m.yorum_sayisi} yorum</span>
                          {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(59,130,246,.08)", color: "#3b82f6", textDecoration: "none" }}>🗺️ Maps</a>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "arandi" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 12, boxShadow: "0 2px 8px rgba(139,92,246,.25)" }}>📞 Arandı</button>
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "ilgileniyor" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(16,185,129,.1)", color: "#10b981", fontWeight: 600, fontSize: 12 }}>🤝 İlgileniyor</button>
                        <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 11 }}>📝 Not</button>
                      </div>
                    </div>
                    {avciSecili === m.id && (
                      <div className="row gap-8" style={{ marginTop: 12 }}>
                        <input id={`not_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input" style={{ flex: 1, borderRadius: 10 }} />
                        <button onClick={async () => { const notInput = document.getElementById(`not_${m.id}`); await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value }); setAvciSecili(null); avciListeYukle(); avciGunlukYukle(); }} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 12 }}>Kaydet</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* TÜM LİSTE */}
            {avciTab === "liste" && (() => {
              const durumRenk = { yeni: "#3b82f6", arandi: "#8b5cf6", ilgileniyor: "#10b981", ilgilenmiyor: "#ef4444", musteri_oldu: "#10b981", cevapsiz: "#64748b" };
              const durumLabel = { yeni: "Yeni", arandi: "Arandı", ilgileniyor: "İlgileniyor", ilgilenmiyor: "İlgilenmiyor", musteri_oldu: "Müşteri ✓", cevapsiz: "Cevapsız" };
              const kaynakIcon = { maps: "🗺️", instagram: "📸", facebook: "📘", tiktok: "🎵" };
              const kaynakRenk = { maps: "#3b82f6", instagram: "#e11d48", facebook: "#1877f2", tiktok: "#000" };
              const isSosyal = (k) => ["instagram", "facebook", "tiktok"].includes(k);
              return (
              <>
                {/* Filtre Çubuğu */}
                <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 10, padding: 4, marginBottom: 12, flexWrap: "wrap" }}>
                  {[["hepsi","Tümü"],["yeni","Yeni"],["bot_yazdi","📱 Bot Yazdı"],["cevapsiz","📭 Cevapsız"],["arandi","Arandı"],["ilgileniyor","İlgileniyor"],["ilgilenmiyor","İlgilenmiyor"],["musteri_oldu","Müşteri ✓"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAvciFiltre(v)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: avciFiltre === v ? 700 : 500, cursor: "pointer", background: avciFiltre === v ? "var(--surface)" : "transparent", color: avciFiltre === v ? "var(--text)" : "var(--dim)", transition: "all .2s", boxShadow: avciFiltre === v ? "0 1px 4px rgba(0,0,0,.06)" : "none" }}>{l}</button>
                  ))}
                  <select value={avciSiralama} onChange={e => setAvciSiralama(e.target.value)} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, background: "var(--surface)", color: "var(--text)", cursor: "pointer" }}>
                    <option value="skor_desc">Skor ↓</option>
                    <option value="puan_desc">Puan ↓</option>
                    <option value="yorum_desc">Yorum ↓</option>
                    <option value="yeni">En Yeni</option>
                  </select>
                </div>

                {/* Kategori Filtreleri */}
                <div className="row row-wrap gap-4 mb-16" style={{ alignItems: "center" }}>
                  <span style={{ color: "var(--dim)", fontSize: 11, marginRight: 4 }}>Kategori:</span>
                  {[["hepsi","Tümü"],["berber","✂️ Berber"],["kuaför","💇 Kuaför"],["güzellik salonu","💅 Güzellik"],["dövme","🎨 Dövme"],["diş kliniği","🦷 Dişçi"],["veteriner","🐾 Veteriner"],["spa","🧖 Spa"],["diyetisyen","🥗 Diyetisyen"],["tırnak salonu","💅 Tırnak"],["cilt bakım","✨ Cilt Bakım"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAvciKategoriFiltre(v)} style={{ padding: "4px 10px", borderRadius: 8, border: "none", fontSize: 11, fontWeight: avciKategoriFiltre === v ? 700 : 500, cursor: "pointer", background: avciKategoriFiltre === v ? "#8b5cf6" : "var(--bg)", color: avciKategoriFiltre === v ? "#fff" : "var(--dim)", transition: "all .15s" }}>{l}</button>
                  ))}
                </div>

                {/* Lead Kartları */}
                {avciListe.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}><div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div><p style={{ fontSize: 14 }}>Henüz potansiyel müşteri yok. Tarama yap!</p></div>
                ) : avciListe.map(m => {
                  const sosyal = isSosyal(m.kaynak);
                  const platform = m.kaynak || "maps";
                  const dRenk = durumRenk[m.durum] || "#64748b";
                  return (
                    <div key={m.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", marginBottom: 8, borderLeft: `3px solid ${sosyal ? (kaynakRenk[platform] || "#e11d48") : dRenk}`, border: "1px solid var(--border)", borderLeftWidth: 3, borderLeftColor: sosyal ? (kaynakRenk[platform] || "#e11d48") : dRenk, transition: "all .2s" }}>
                      <div className="row row-between" style={{ alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div className="row row-wrap gap-6 mb-4" style={{ alignItems: "center" }}>
                            <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 14 }}>{m.isletme_adi}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${dRenk}15`, color: dRenk, fontSize: 11, fontWeight: 600 }}>{durumLabel[m.durum] || m.durum}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(245,158,11,.08)", color: "#f59e0b", fontSize: 11, fontWeight: 700 }}>Skor: {m.skor}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${kaynakRenk[platform] || "#64748b"}12`, color: kaynakRenk[platform] || "#64748b", fontSize: 11, fontWeight: 600 }}>{kaynakIcon[platform] || "🔗"} {platform === "maps" ? "Maps" : platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                            {m.wp_mesaj_durumu === 'gonderildi' && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(16,185,129,.1)", color: "#10b981", fontSize: 11, fontWeight: 600 }}>📱 Bot Yazdı</span>}
                            {m.wp_mesaj_durumu === 'wp_yok' && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(239,68,68,.08)", color: "#ef4444", fontSize: 11 }}>📵 WP Yok</span>}
                            {!sosyal && m.puan && <span style={{ color: "#f59e0b", fontSize: 12 }}>⭐ {m.puan}</span>}
                            {!sosyal && <span style={{ color: "var(--dim)", fontSize: 11 }}>💬 {m.yorum_sayisi}</span>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "var(--dim)", fontSize: 12, marginBottom: 4 }}>
                            {m.telefon && <span>📞 {m.telefon}</span>}
                            {m.kategori && <span>🏷️ {m.kategori}</span>}
                            {m.ilce && <span>📍 {m.ilce}</span>}
                            {!sosyal && !m.web_sitesi && <span style={{ color: "#10b981" }}>🌐 Web yok</span>}
                            {!sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>🗺️ Maps</a>}
                            {sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "1px 8px", borderRadius: 6, background: `${kaynakRenk[platform] || "#e11d48"}15`, color: kaynakRenk[platform] || "#e11d48", textDecoration: "none", fontWeight: 600, fontSize: 11 }}>{kaynakIcon[platform]} Profil ↗</a>}
                            {sosyal && m.instagram && <span style={{ color: "#e11d48" }}>@{m.instagram}</span>}
                          </div>
                          {m.notlar && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>📝 {m.notlar}</div>}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0 }}>
                          {sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", borderRadius: 8, background: kaynakRenk[platform] || "#e11d48", color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", border: "none" }}>{kaynakIcon[platform]} Profil</a>}
                          {["yeni","arandi","ilgileniyor","ilgilenmiyor","musteri_oldu"].filter(d => d !== m.durum).slice(0,3).map(d => (
                            <button key={d} onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: d }); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: `${durumRenk[d] || "#64748b"}15`, color: durumRenk[d] || "#64748b", fontWeight: 600, fontSize: 11 }}>{durumLabel[d]}</button>
                          ))}
                          <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 11 }}>📝</button>
                          <button onClick={async () => { if (!confirm(`"${m.isletme_adi}" silinsin mi?`)) return; await api.del(`/admin/avci/${m.id}`); avciListeYukle(); avciStatsYukle(); }} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(239,68,68,.08)", color: "#ef4444", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      {avciSecili === m.id && (
                        <div className="row gap-8" style={{ marginTop: 12 }}>
                          <input id={`not2_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input" style={{ flex: 1, borderRadius: 10 }} />
                          <button onClick={async () => { const notInput = document.getElementById(`not2_${m.id}`); await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value }); setAvciSecili(null); avciListeYukle(); }} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 12 }}>Kaydet</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
              );
            })()}
          </>
        )}

        {/* ═══════ SATIŞ BOT ═══════ */}
        {sayfa === "satisBot" && (
          <>
            {/* Hero Header */}
            <div style={{ background: "linear-gradient(135deg, rgba(37,211,102,.08) 0%, rgba(59,130,246,.06) 50%, rgba(139,92,246,.04) 100%)", borderRadius: 20, padding: "28px 32px", marginBottom: 24, border: "1px solid rgba(37,211,102,.12)" }}>
              <div className="row row-between row-wrap gap-12">
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 800, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>💬 Satış Bot</h1>
                  <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 6 }}>WhatsApp otomatik pazarlama — lead'lere mesaj gönder, AI ile satış yap</p>
                </div>
                <div className="row gap-8">
                  <button onClick={satisBotYukle} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄 Yenile</button>
                </div>
              </div>
            </div>

            {/* Ana Grid: Bot Durumu + QR + İstatistikler */}
            <div style={{ display: "grid", gridTemplateColumns: satisBotDurum?.durum === 'qr_bekleniyor' ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 24 }}>
              {/* Bot Durumu Kartı */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)" }}>
                <div className="row gap-10 mb-16" style={{ alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: satisBotDurum?.durum === 'bagli' ? "linear-gradient(135deg, #10b981, #059669)" : satisBotDurum?.durum === 'qr_bekleniyor' ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #ef4444, #dc2626)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 22, filter: "brightness(10)" }}>{satisBotDurum?.durum === 'bagli' ? '✅' : satisBotDurum?.durum === 'qr_bekleniyor' ? '📱' : '⏹️'}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Bot Durumu</div>
                    <div style={{ fontSize: 12, color: satisBotDurum?.durum === 'bagli' ? "#10b981" : satisBotDurum?.durum === 'qr_bekleniyor' ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>
                      {satisBotDurum?.durum === 'bagli' ? '● Bağlı & Çalışıyor' : satisBotDurum?.durum === 'qr_bekleniyor' ? '● QR Kod Bekliyor' : satisBotDurum?.durum === 'baslatiyor' ? '● Başlatılıyor...' : '● Kapalı'}
                    </div>
                  </div>
                  {satisBotDurum?.aktif && <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: "rgba(16,185,129,.1)", color: "#10b981", fontSize: 11, fontWeight: 700 }}>🚀 Gönderim Aktif</span>}
                </div>
                <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                  {(!satisBotDurum || satisBotDurum.durum === 'kapali' || satisBotDurum.durum === 'hata' || satisBotDurum.durum === 'baslatiyor') && (
                    <button onClick={async () => { setSatisBotYukleniyor(true); await api.post("/admin/satis-bot/baslat"); setTimeout(satisBotYukle, 3000); setSatisBotYukleniyor(false); }} disabled={satisBotYukleniyor} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 14px rgba(16,185,129,.3)" }}>{satisBotYukleniyor ? '⏳ Başlatılıyor...' : '▶️ Botu Başlat'}</button>
                  )}
                  {satisBotDurum?.durum === 'bagli' && !satisBotDurum?.aktif && (
                    <button onClick={async () => { await api.post("/admin/satis-bot/gonderim-baslat"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #25d366, #128c7e)", color: "#fff", fontWeight: 700, fontSize: 13, boxShadow: "0 4px 14px rgba(37,211,102,.3)" }}>🚀 Gönderimi Başlat</button>
                  )}
                  {satisBotDurum?.aktif && (
                    <button onClick={async () => { await api.post("/admin/satis-bot/gonderim-durdur"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(245,158,11,.1)", color: "#f59e0b", fontWeight: 700, fontSize: 13 }}>⏸️ Gönderimi Durdur</button>
                  )}
                  {satisBotDurum?.durum !== 'kapali' && satisBotDurum && (
                    <button onClick={async () => { if (!confirm("Bot durdurulacak ve oturum kapatılacak. Emin misiniz?")) return; await api.post("/admin/satis-bot/durdur"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(239,68,68,.08)", color: "#ef4444", fontWeight: 600, fontSize: 13 }}>⏹️ Botu Kapat</button>
                  )}
                </div>
                {/* Günlük ilerleme */}
                {satisBotDurum?.gunlukGonderim > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="row row-between" style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
                      <span>Bugün gönderilen</span>
                      <span style={{ fontWeight: 700 }}>{satisBotDurum.gunlukGonderim}/{satisBotDurum?.ayarlar?.gunlukLimit || 50}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min((satisBotDurum.gunlukGonderim / (satisBotDurum?.ayarlar?.gunlukLimit || 50)) * 100, 100)}%`, background: "linear-gradient(90deg, #25d366, #10b981)", borderRadius: 3, transition: "width .3s" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* QR Kod */}
              {satisBotDurum?.durum === 'qr_bekleniyor' && satisBotDurum?.qrBase64 && (
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", marginBottom: 12 }}>📱 QR Kodu Tara</div>
                  <img src={satisBotDurum.qrBase64} alt="QR" style={{ width: 200, height: 200, borderRadius: 12, border: "4px solid var(--bg)" }} />
                  <p style={{ color: "var(--dim)", fontSize: 11, marginTop: 10 }}>Satış numarasıyla WhatsApp aç → QR tara</p>
                  <button onClick={satisBotYukle} style={{ marginTop: 8, padding: "6px 16px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontSize: 12 }}>🔄 Yenile</button>
                </div>
              )}
            </div>

            {/* İstatistikler */}
            {satisBotDurum?.istatistikler && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
                {[
                  { icon: "📤", label: "Gönderilen", val: satisBotDurum.istatistikler.gonderilen, color: "#3b82f6", bg: "linear-gradient(135deg, rgba(59,130,246,.08), rgba(59,130,246,.02))" },
                  { icon: "⏳", label: "Cevap Bekliyor", val: satisBotDurum.istatistikler.bekleyen, color: "#f59e0b", bg: "linear-gradient(135deg, rgba(245,158,11,.08), rgba(245,158,11,.02))" },
                  { icon: "✅", label: "Olumlu", val: satisBotDurum.istatistikler.olumlu, color: "#10b981", bg: "linear-gradient(135deg, rgba(16,185,129,.08), rgba(16,185,129,.02))" },
                  { icon: "❌", label: "Olumsuz", val: satisBotDurum.istatistikler.olumsuz, color: "#ef4444", bg: "linear-gradient(135deg, rgba(239,68,68,.08), rgba(239,68,68,.02))" },
                  { icon: "📵", label: "WP Yok", val: satisBotDurum.istatistikler.wp_yok, color: "#64748b", bg: "linear-gradient(135deg, rgba(100,116,139,.08), rgba(100,116,139,.02))" }
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}15`, borderRadius: 14, padding: "16px", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -6, right: -6, fontSize: 40, opacity: 0.06 }}>{s.icon}</div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* ═══ KAPSAMLI BOT AYARLARI PANELİ ═══ */}
            {satisBotDurum?.ayarlar && (() => {
              const ay = satisBotDurum.ayarlar;
              const ayarGuncelle = async (obj) => { await api.put("/admin/satis-bot/ayarlar", obj); satisBotYukle(); };
              const toggleStyle = (aktif) => ({ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", background: aktif ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.08)", color: aktif ? "#10b981" : "#ef4444", fontWeight: 700, fontSize: 11, transition: "all .2s" });
              const labelStyle = { fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 };
              const cellStyle = { background: "var(--bg)", borderRadius: 12, padding: 14 };
              const selStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, fontWeight: 700 };
              const modRenk = { hepsi: "#10b981", sadece_kayit: "#3b82f6", sadece_satis: "#f59e0b", sadece_ai: "#8b5cf6", kapali: "#ef4444" };
              const modIcon = { hepsi: "🚀", sadece_kayit: "📝", sadece_satis: "📤", sadece_ai: "🤖", kapali: "⏸️" };
              const modAciklama = { hepsi: "Tüm özellikler aktif", sadece_kayit: "Sadece WhatsApp kayıt sistemi", sadece_satis: "Sadece giden mesaj (AI cevap yok)", sadece_ai: "Gelen mesajlara AI cevap (giden yok)", kapali: "Bot bağlı ama hiçbir şey yapmıyor" };
              return (
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
                  {/* Başlık */}
                  <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>⚙️</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Bot Ayarları</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>A'dan Z'ye tüm bot davranışlarını kontrol et</div>
                    </div>
                    <button onClick={() => ayarGuncelle({ tatil: !ay.tatil })} style={{ ...toggleStyle(!ay.tatil), marginLeft: "auto" }}>{ay.tatil ? "🏖️ TATİL" : "✅ Mesai"}</button>
                  </div>

                  {/* ── MOD SEÇİCİ ── */}
                  <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px", marginBottom: 16 }}>
                    <div style={{ ...labelStyle, marginBottom: 10, fontSize: 11 }}>🎮 ÇALIŞMA MODU</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
                      {[["hepsi","Tam Mod"],["sadece_kayit","Sadece Kayıt"],["sadece_satis","Sadece Satış"],["sadece_ai","Sadece AI"],["kapali","Kapalı"]].map(([k,l]) => (
                        <button key={k} onClick={() => ayarGuncelle({ mod: k })} style={{ padding: "12px 8px", borderRadius: 12, border: (ay.mod || 'hepsi') === k ? `2px solid ${modRenk[k]}` : "2px solid transparent", background: (ay.mod || 'hepsi') === k ? `${modRenk[k]}12` : "var(--surface)", cursor: "pointer", textAlign: "center", transition: "all .2s" }}>
                          <div style={{ fontSize: 22, marginBottom: 4 }}>{modIcon[k]}</div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: (ay.mod || 'hepsi') === k ? modRenk[k] : "var(--dim)" }}>{l}</div>
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: `${modRenk[ay.mod || 'hepsi']}08`, fontSize: 11, color: modRenk[ay.mod || 'hepsi'], fontWeight: 600 }}>
                      {modIcon[ay.mod || 'hepsi']} {modAciklama[ay.mod || 'hepsi']}
                    </div>
                  </div>

                  {/* ── TOGGLE BUTONLARI ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                    {[
                      ["kayitAktif", "📝 WhatsApp Kayıt", "Bot üzerinden hesap açma"],
                      ["aiCevapAktif", "🤖 AI Cevap", "DeepSeek ile akıllı cevap"],
                      ["takipAktif", "🔔 Takip Mesajı", "Cevap vermeyenlere hatırlatma"],
                      ["gelenMesajCevap", "💬 Gelen Mesaj Cevap", "Gelen mesajlara otomatik cevap"],
                      ["typingIndicator", "✍️ Yazıyor Göster", "Anti-ban: typing indicator"],
                      ["tatil", "🏖️ Tatil Modu", "Bugün gönderim yapma"],
                    ].map(([key, title, desc]) => (
                      <div key={key} onClick={() => ayarGuncelle({ [key]: !ay[key] })} style={{ ...cellStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", border: ay[key] ? "1px solid rgba(16,185,129,.2)" : "1px solid transparent" }}>
                        <div style={{ width: 38, height: 22, borderRadius: 11, background: ay[key] ? "#10b981" : "rgba(100,116,139,.2)", position: "relative", transition: "all .2s", flexShrink: 0 }}>
                          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: ay[key] ? 18 : 2, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.15)" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>{title}</div>
                          <div style={{ fontSize: 10, color: "var(--dim)" }}>{desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── MESAI AYARLARI ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 16 }}>
                    <div style={cellStyle}>
                      <label style={labelStyle}>Mesai Başlangıç</label>
                      <select value={ay.mesaiBaslangic} onChange={(e) => ayarGuncelle({ mesaiBaslangic: parseInt(e.target.value) })} style={selStyle}>
                        {[0,1,2,3,4,5,6,7,8,9,10,11,12].map(s => <option key={s} value={s}>{String(s).padStart(2,'0')}:00</option>)}
                      </select>
                    </div>
                    <div style={cellStyle}>
                      <label style={labelStyle}>Mesai Bitiş</label>
                      <select value={ay.mesaiBitis} onChange={(e) => ayarGuncelle({ mesaiBitis: parseInt(e.target.value) })} style={selStyle}>
                        {[12,13,14,15,16,17,18,19,20,21,22,23,24].map(s => <option key={s} value={s}>{s === 24 ? "00:00 (gece)" : `${String(s).padStart(2,'0')}:00`}</option>)}
                      </select>
                    </div>
                    <div style={cellStyle}>
                      <label style={labelStyle}>Günlük Limit</label>
                      <select value={ay.gunlukLimit} onChange={(e) => ayarGuncelle({ gunlukLimit: parseInt(e.target.value) })} style={selStyle}>
                        {[5,10,15,20,30,40,50,75,100,150,200].map(s => <option key={s} value={s}>{s} mesaj</option>)}
                      </select>
                    </div>
                    <div style={cellStyle}>
                      <label style={labelStyle}>Mesaj Aralığı (dk)</label>
                      <div className="row gap-4">
                        <select value={ay.minBekleme} onChange={(e) => ayarGuncelle({ minBekleme: parseInt(e.target.value) })} style={{ ...selStyle, flex: 1, fontSize: 13 }}>
                          {[1,2,3,5,8,10,15,20].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <span style={{ color: "var(--dim)", fontSize: 11, alignSelf: "center" }}>—</span>
                        <select value={ay.maxBekleme} onChange={(e) => ayarGuncelle({ maxBekleme: parseInt(e.target.value) })} style={{ ...selStyle, flex: 1, fontSize: 13 }}>
                          {[5,8,10,15,20,25,30,45,60].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── TAKİP AYARLARI ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                    <div style={cellStyle}>
                      <label style={labelStyle}>🔔 Takip Süresi (saat)</label>
                      <select value={ay.takipSaati || 12} onChange={(e) => ayarGuncelle({ takipSaati: parseInt(e.target.value) })} style={selStyle}>
                        {[1,2,3,4,6,8,10,12,18,24,36,48].map(s => <option key={s} value={s}>{s} saat sonra</option>)}
                      </select>
                    </div>
                    <div style={cellStyle}>
                      <label style={labelStyle}>🔄 Max Takip Sayısı</label>
                      <select value={ay.maxTakipSayisi || 2} onChange={(e) => ayarGuncelle({ maxTakipSayisi: parseInt(e.target.value) })} style={selStyle}>
                        {[0,1,2,3,4,5].map(s => <option key={s} value={s}>{s === 0 ? "Takip yok" : `${s} kez`}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* ── HEDEF KATEGORİ ── */}
                  <div style={{ ...cellStyle, marginBottom: 16 }}>
                    <label style={labelStyle}>🎯 Hedef Kategori</label>
                    <div className="row gap-8" style={{ alignItems: "center" }}>
                      <select value={ay.hedefKategori || ''} onChange={(e) => ayarGuncelle({ hedefKategori: e.target.value })} style={{ ...selStyle, fontSize: 13 }}>
                        <option value="">Tüm Kategoriler</option>
                        {["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                      </select>
                      {ay.hedefKategori && <span style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(139,92,246,.1)", color: "#8b5cf6", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>🎯 {ay.hedefKategori}</span>}
                    </div>
                  </div>

                  {/* ── ANTI-BAN (Typing) AYARLARI ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div style={cellStyle}>
                      <label style={labelStyle}>✍️ Min Typing (ms)</label>
                      <select value={ay.typingMinMs || 2000} onChange={(e) => ayarGuncelle({ typingMinMs: parseInt(e.target.value) })} style={selStyle}>
                        {[500,1000,1500,2000,3000,4000,5000].map(s => <option key={s} value={s}>{s/1000}sn</option>)}
                      </select>
                    </div>
                    <div style={cellStyle}>
                      <label style={labelStyle}>✍️ Max Typing (ms)</label>
                      <select value={ay.typingMaxMs || 6000} onChange={(e) => ayarGuncelle({ typingMaxMs: parseInt(e.target.value) })} style={selStyle}>
                        {[2000,3000,4000,5000,6000,8000,10000].map(s => <option key={s} value={s}>{s/1000}sn</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Son Konuşmalar — Kompakt WhatsApp Tarzı */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
              <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,211,102,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>💬</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Son Konuşmalar</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{satisBotKonusmalar.length} konuşma</div>
                </div>
              </div>
              {satisBotKonusmalar.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--dim)" }}><div style={{ fontSize: 40, marginBottom: 8 }}>🚀</div><p style={{ fontSize: 13 }}>Henüz konuşma yok. Botu başlat!</p></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {satisBotKonusmalar.map(k => {
                    const dRenk = { bekliyor: "#f59e0b", olumlu: "#10b981", olumsuz: "#ef4444" };
                    const dIcon = { bekliyor: "⏳", olumlu: "✅", olumsuz: "❌" };
                    return (
                      <div key={k.id} className="row gap-12" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bg)", alignItems: "center", cursor: "pointer", transition: "all .15s" }}>
                        <div style={{ width: 40, height: 40, borderRadius: 20, background: `${dRenk[k.durum] || "#64748b"}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{dIcon[k.durum] || "💬"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row row-between gap-8">
                            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.isletme_adi}</span>
                            <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", flexShrink: 0 }}>{k.olusturma_tarihi ? new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.gelen_mesajlar ? `💬 ${k.gelen_mesajlar.slice(0, 60)}...` : `📤 ${(k.gonderilen_mesaj || '').slice(0, 60)}...`}</div>
                        </div>
                        <div className="row gap-4" style={{ flexShrink: 0 }}>
                          {k.kategori && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontSize: 10, fontWeight: 600 }}>{k.kategori}</span>}
                          <a href={`https://wa.me/${k.telefon}`} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", borderRadius: 8, background: "linear-gradient(135deg, #25d366, #128c7e)", color: "#fff", fontWeight: 700, fontSize: 11, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, boxShadow: "0 2px 8px rgba(37,211,102,.25)" }}>💬 WA</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* WP Yok — Manuel Ara */}
            {wpYokListe.length > 0 && (
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
                <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(100,116,139,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📵</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>WP Yok — Manuel Ara ({wpYokListe.length})</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Bu işletmelerin WP'si yok — telefonla kendin ara</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {wpYokListe.map(m => (
                    <div key={m.id} className="row gap-12" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", flex: 1 }}>{m.isletme_adi}</span>
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>{m.kategori}</span>
                      <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>Skor: {m.skor}</span>
                      <a href={`tel:${m.telefon}`} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(59,130,246,.08)", color: "#3b82f6", fontWeight: 700, fontSize: 12, textDecoration: "none" }}>📞 {m.telefon}</a>
                      <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "arandi" }); satisBotYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontWeight: 600, fontSize: 11 }}>✅ Arandı</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Numara Yönetimi */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
              <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(139,92,246,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📱</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>Numara Yönetimi</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{numaralar.length} numara · {numaralar.filter(n => n.durum === 'aktif').length} aktif · {numaralar.filter(n => n.durum === 'banli').length} banlı</div>
                </div>
                <button onClick={() => setNumaraFormAcik(!numaraFormAcik)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", fontWeight: 700, fontSize: 12, boxShadow: "0 2px 8px rgba(139,92,246,.25)" }}>+ Numara Ekle</button>
              </div>

              {numaraFormAcik && (
                <form onSubmit={async (e) => { e.preventDefault(); await api.post("/admin/satis-bot/numaralar", yeniNumara); setYeniNumara({ isim: "", telefon: "" }); setNumaraFormAcik(false); numaralariYukle(); }} style={{ display: "flex", gap: 10, background: "var(--bg)", borderRadius: 12, padding: 14, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>İsim</label><input value={yeniNumara.isim} onChange={e => setYeniNumara({...yeniNumara, isim: e.target.value})} placeholder="Satış 1" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: 140 }} /></div>
                  <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Telefon</label><input value={yeniNumara.telefon} onChange={e => setYeniNumara({...yeniNumara, telefon: e.target.value})} placeholder="905551234567" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: 170 }} /></div>
                  <button type="submit" style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#8b5cf6", color: "#fff", fontWeight: 700, fontSize: 12 }}>Kaydet</button>
                  <button type="button" onClick={() => setNumaraFormAcik(false)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 12 }}>İptal</button>
                </form>
              )}

              {/* Aktif numara banner */}
              {satisBotDurum?.durum === 'bagli' && (
                <div className="row gap-8 mb-12" style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(16,185,129,.04)", border: "1px solid rgba(16,185,129,.12)", alignItems: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: "#10b981", boxShadow: "0 0 6px #10b981" }} />
                  <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>Bot bu numarayla bağlı</span>
                  {satisBotDurum?.gunlukGonderim > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dim)" }}>Bugün {satisBotDurum.gunlukGonderim} mesaj</span>}
                </div>
              )}

              {/* Numara listesi */}
              {numaralar.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz numara yok. Yedek numaralar ekle!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {numaralar.map(n => {
                    const nRenk = { aktif: "#10b981", bekliyor: "#f59e0b", banli: "#ef4444", dinleniyor: "#3b82f6" };
                    const nLabel = { aktif: "Aktif", bekliyor: "Bekliyor", banli: "Banlı", dinleniyor: "Dinleniyor" };
                    return (
                      <div key={n.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: n.durum === 'banli' ? "rgba(239,68,68,.03)" : "var(--bg)", border: `1px solid ${n.durum === 'banli' ? "rgba(239,68,68,.12)" : "var(--border)"}`, alignItems: "center" }}>
                        <div style={{ width: 8, height: 8, borderRadius: 4, background: nRenk[n.durum] || "#64748b", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row gap-6" style={{ alignItems: "center" }}>
                            <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{n.isim}</span>
                            <span style={{ fontSize: 12, color: "var(--dim)" }}>{n.telefon || "—"}</span>
                            <span style={{ padding: "1px 8px", borderRadius: 6, background: `${nRenk[n.durum] || "#64748b"}15`, color: nRenk[n.durum] || "#64748b", fontSize: 10, fontWeight: 700 }}>{nLabel[n.durum] || n.durum}</span>
                            {n.gonderim_sayisi > 0 && <span style={{ fontSize: 10, color: "var(--dim)" }}>{n.gonderim_sayisi} msj</span>}
                            {n.ban_tarihi && <span style={{ fontSize: 10, color: "#ef4444" }}>Ban: {new Date(n.ban_tarihi).toLocaleDateString("tr-TR")}</span>}
                          </div>
                        </div>
                        <div className="row gap-4" style={{ flexShrink: 0 }}>
                          {n.durum !== 'aktif' && n.durum !== 'banli' && <button onClick={async () => { await api.put(`/admin/satis-bot/numaralar/${n.id}`, { durum: 'aktif' }); numaralariYukle(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(16,185,129,.08)", color: "#10b981", fontWeight: 600, fontSize: 11 }}>Aktif</button>}
                          {n.durum === 'aktif' && <button onClick={async () => { await api.put(`/admin/satis-bot/numaralar/${n.id}`, { durum: 'dinleniyor' }); numaralariYukle(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(59,130,246,.08)", color: "#3b82f6", fontWeight: 600, fontSize: 11 }}>Dinlendir</button>}
                          <button onClick={async () => { const notu = prompt("Ban notu:"); await api.put(`/admin/satis-bot/numaralar/${n.id}`, { durum: 'banli', ban_notu: notu || 'WP ban' }); numaralariYukle(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(239,68,68,.06)", color: "#ef4444", fontSize: 11 }}>Ban</button>
                          <button onClick={async () => { if (confirm(`"${n.isim}" sil?`)) { await api.del(`/admin/satis-bot/numaralar/${n.id}`); numaralariYukle(); }}} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(239,68,68,.04)", color: "var(--dim)", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Anti-Ban & İpuçları */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,.04), rgba(245,158,11,.01))", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(245,158,11,.12)" }}>
                <div className="row gap-6 mb-8" style={{ alignItems: "center" }}><span style={{ fontSize: 16 }}>🛡️</span><span style={{ fontWeight: 700, fontSize: 14, color: "#f59e0b" }}>Anti-Ban Koruması</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--dim)" }}>
                  <span>• {satisBotDurum?.ayarlar?.minBekleme || 8}-{satisBotDurum?.ayarlar?.maxBekleme || 15} dk rastgele bekleme</span>
                  <span>• Günlük max {satisBotDurum?.ayarlar?.gunlukLimit || 50} mesaj</span>
                  <span>• Mesai: {satisBotDurum?.ayarlar?.mesaiBaslangic || 9}:00 — {satisBotDurum?.ayarlar?.mesaiBitis || 19}:00</span>
                  <span>• "Yazıyor..." simülasyonu</span>
                  <span>• 3 farklı mesaj varyasyonu</span>
                </div>
              </div>
              <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,.04), rgba(139,92,246,.01))", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(139,92,246,.12)" }}>
                <div className="row gap-6 mb-8" style={{ alignItems: "center" }}><span style={{ fontSize: 16 }}>💡</span><span style={{ fontWeight: 700, fontSize: 14, color: "#8b5cf6" }}>Numara İpuçları</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--dim)" }}>
                  <span>• En az 3 numara kayıtlı tut</span>
                  <span>• 2-3 günde bir numarayı dinlendir</span>
                  <span>• Banlı numarayı 2-4 hafta dinlendir</span>
                  <span>• Günlük limiti 30 altında tut</span>
                  <span>• Yeni numarayı 1-2 gün normal kullan</span>
                </div>
              </div>
            </div>
          </>
        )}

      </div>

      {/* ═══════ İŞLETME DETAY MODAL ═══════ */}
      {detayIsletme && (() => {
        const d = detayIsletme;
        const isl = d.isletme || {};
        const denemeBitti = d.deneme_suresi_kalan <= 0;
        const paketRenk = { baslangic: "#3b82f6", profesyonel: "#8b5cf6", kurumsal: "#f59e0b" };
        const durumRenk = { odendi: "#10b981", bekliyor: "#f59e0b", gecikti: "#ef4444", havale_bekliyor: "#3b82f6", deneme: "#8b5cf6" };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex" }}>
            <div onClick={() => setDetayIsletme(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)" }} />
            <div style={{ position: "relative", marginLeft: "auto", width: "min(780px, 90vw)", height: "100vh", background: "var(--surface)", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,.15)" }}>

              {/* Header */}
              <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "18px 24px" }}>
                <div className="row row-between" style={{ alignItems: "center" }}>
                  <div className="row gap-10" style={{ alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(135deg, ${paketRenk[isl.paket] || "#64748b"}, ${paketRenk[isl.paket] || "#64748b"}99)`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 18 }}>{(isl.isim || "?")[0]}</div>
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 18, color: "var(--text)" }}>{isl.isim}</div>
                      <div className="row gap-6" style={{ marginTop: 2 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${paketRenk[isl.paket] || "#64748b"}15`, color: paketRenk[isl.paket] || "#64748b", fontSize: 11, fontWeight: 700 }}>{(isl.paket || "—").toUpperCase()}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: isl.aktif ? "rgba(16,185,129,.1)" : "rgba(239,68,68,.1)", color: isl.aktif ? "#10b981" : "#ef4444", fontSize: 11, fontWeight: 700 }}>{isl.aktif ? "● Aktif" : "● Pasif"}</span>
                        {d.deneme_suresi_kalan > 0 && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,.1)", color: "#8b5cf6", fontSize: 11, fontWeight: 700 }}>🧪 {d.deneme_suresi_kalan} gün deneme</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setDetayIsletme(null)} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>✕</button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 2, background: "var(--bg)", padding: "4px 24px", borderBottom: "1px solid var(--border)" }}>
                {[["genel","📊 Genel"],["odemeler","💳 Ödemeler"],["randevular","📅 Randevular"],["ekip","👥 Ekip & Hizmetler"],["ayarlar","⚙️ Ayarlar"],["islemler","🔧 İşlemler"]].map(([k,l]) => (
                  <button key={k} onClick={() => setDetayTab(k)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: detayTab === k ? 700 : 500, cursor: "pointer", background: detayTab === k ? "var(--surface)" : "transparent", color: detayTab === k ? "var(--text)" : "var(--dim)", transition: "all .15s", boxShadow: detayTab === k ? "0 1px 4px rgba(0,0,0,.06)" : "none" }}>{l}</button>
                ))}
              </div>

              <div style={{ padding: 24 }}>

                {/* ===== GENEL TAB ===== */}
                {detayTab === "genel" && (
                  <>
                    {/* Quick Stats */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
                      {[
                        { icon: "👥", label: "Müşteri", val: parseInt(d.musteri_sayisi) || 0, color: "#3b82f6" },
                        { icon: "📅", label: "Randevu (Toplam)", val: parseInt(d.randevu_stats?.toplam) || 0, color: "#8b5cf6" },
                        { icon: "📆", label: "Bu Ay Randevu", val: parseInt(d.randevu_stats?.bu_ay) || 0, color: "#10b981" },
                        { icon: "👨‍💼", label: "Çalışan", val: (d.calisanlar || []).length, color: "#f59e0b" },
                        { icon: "🛠️", label: "Hizmet", val: (d.hizmetler || []).length, color: "#e11d48" },
                        { icon: "📅", label: "Kayıt Günü", val: `${d.olusturma_gun || 0}. gün`, color: "#64748b" }
                      ].map((s, i) => (
                        <div key={i} style={{ background: `linear-gradient(135deg, ${s.color}08, ${s.color}02)`, border: `1px solid ${s.color}12`, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* İşletme Bilgileri */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 12 }}>📋 İşletme Bilgileri</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", fontSize: 13 }}>
                        <div><span style={{ color: "var(--dim)" }}>Telefon:</span> <strong style={{ color: "var(--text)" }}>{isl.telefon || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Email:</span> <strong style={{ color: "var(--text)" }}>{(d.kullanici || [])[0]?.email || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Adres:</span> <strong style={{ color: "var(--text)" }}>{isl.adres || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Kategori:</span> <strong style={{ color: "var(--text)" }}>{isl.kategori || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Kayıt:</span> <strong style={{ color: "var(--text)" }}>{isl.olusturma_tarihi ? new Date(isl.olusturma_tarihi).toLocaleDateString("tr-TR") : "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Slug:</span> <strong style={{ color: "var(--text)" }}>{isl.slug || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Paket:</span> <strong style={{ color: paketRenk[isl.paket] || "var(--text)" }}>{(isl.paket || "—").toUpperCase()}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Durum:</span> <strong style={{ color: isl.aktif ? "#10b981" : "#ef4444" }}>{isl.aktif ? "Aktif" : "Pasif"}</strong></div>
                      </div>
                    </div>

                    {/* Deneme Süresi */}
                    <div style={{ background: d.deneme_suresi_kalan > 0 ? "linear-gradient(135deg, rgba(139,92,246,.06), rgba(139,92,246,.02))" : "linear-gradient(135deg, rgba(100,116,139,.06), rgba(100,116,139,.02))", borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: d.deneme_suresi_kalan > 0 ? "1px solid rgba(139,92,246,.12)" : "1px solid var(--border)" }}>
                      <div className="row row-between" style={{ alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>🧪 Deneme Süresi</div>
                          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
                            {d.deneme_suresi_kalan > 0 ? `${d.deneme_suresi_kalan} gün kaldı` : `Deneme süresi bitmiş (${d.olusturma_gun || 0} gün önce kayıt)`}
                          </div>
                        </div>
                        <div className="row gap-4">
                          {[3,7,14,30].map(g => (
                            <button key={g} onClick={async () => { await api.post(`/admin/isletmeler/${isl.id}/deneme-uzat`, { gun: g }); isletmeDetayYukle(isl.id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontWeight: 700, fontSize: 11 }}>+{g} gün</button>
                          ))}
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 10, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min((d.deneme_suresi_kalan / 7) * 100, 100)}%`, background: d.deneme_suresi_kalan > 3 ? "linear-gradient(90deg, #8b5cf6, #7c3aed)" : d.deneme_suresi_kalan > 0 ? "linear-gradient(90deg, #f59e0b, #d97706)" : "#ef4444", borderRadius: 3, transition: "width .3s" }} />
                      </div>
                    </div>

                    {/* Admin Notu */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 8 }}>📝 Admin Notu</div>
                      <textarea value={detayNot} onChange={e => setDetayNot(e.target.value)} placeholder="Bu işletme hakkında notlarınız..." rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />
                      <button onClick={async () => { await api.put(`/admin/isletmeler/${isl.id}/not`, { not: detayNot }); alert("Not kaydedildi"); }} style={{ marginTop: 8, padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 12 }}>💾 Notu Kaydet</button>
                    </div>

                    {/* Bot Durumu */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)", marginBottom: 8 }}>🤖 Bot & Entegrasyon</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>WhatsApp Bot:</span> <span style={{ color: d.bot_durum ? "#10b981" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum ? "✅ Kurulu" : "— Yok"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Hatırlatma:</span> <span style={{ color: d.bot_durum?.hatirlatma_aktif ? "#10b981" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.hatirlatma_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Kampanya:</span> <span style={{ color: d.bot_durum?.kampanya_aktif ? "#10b981" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.kampanya_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Google Yorum:</span> <span style={{ color: d.bot_durum?.google_yorum_aktif ? "#10b981" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.google_yorum_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                      </div>
                    </div>
                  </>
                )}

                {/* ===== ÖDEMELER TAB ===== */}
                {detayTab === "odemeler" && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>💳 Ödeme Geçmişi</div>
                    {(d.odemeler || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}><div style={{ fontSize: 36, marginBottom: 8 }}>💳</div><p>Henüz ödeme kaydı yok</p></div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(d.odemeler || []).map((o, i) => (
                          <div key={i} className="row gap-12" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: durumRenk[o.durum] || "#64748b", flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div className="row gap-6" style={{ alignItems: "center" }}>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{o.donem}</span>
                                <span style={{ padding: "1px 8px", borderRadius: 6, background: `${durumRenk[o.durum] || "#64748b"}15`, color: durumRenk[o.durum] || "#64748b", fontSize: 10, fontWeight: 700 }}>{o.durum}</span>
                              </div>
                            </div>
                            <span style={{ fontWeight: 800, fontSize: 15, color: "var(--text)" }}>{o.tutar}₺</span>
                            {o.odeme_tarihi && <span style={{ fontSize: 11, color: "var(--dim)" }}>{new Date(o.odeme_tarihi).toLocaleDateString("tr-TR")}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ===== RANDEVULAR TAB ===== */}
                {detayTab === "randevular" && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>📅 Randevu İstatistikleri</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                      {[
                        { label: "Toplam", val: d.randevu_stats?.toplam || 0, color: "#8b5cf6" },
                        { label: "Bu Ay", val: d.randevu_stats?.bu_ay || 0, color: "#3b82f6" },
                        { label: "Onaylanan", val: d.randevu_stats?.onaylanan || 0, color: "#10b981" },
                        { label: "Bekleyen", val: d.randevu_stats?.bekleyen || 0, color: "#f59e0b" },
                        { label: "İptal", val: d.randevu_stats?.iptal || 0, color: "#ef4444" }
                      ].map((s, i) => (
                        <div key={i} style={{ background: `${s.color}08`, borderRadius: 12, padding: "14px 12px", textAlign: "center", border: `1px solid ${s.color}12` }}>
                          <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Son 30 gün grafiği (basit bar) */}
                    {(d.gunluk_randevu || []).length > 0 && (
                      <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)", marginBottom: 12 }}>📈 Son 30 Gün</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                          {(d.gunluk_randevu || []).map((g, i) => {
                            const maxVal = Math.max(...(d.gunluk_randevu || []).map(x => parseInt(x.sayi) || 0), 1);
                            const h = Math.max(((parseInt(g.sayi) || 0) / maxVal) * 100, 4);
                            return (
                              <div key={i} title={`${g.gun}: ${g.sayi} randevu`} style={{ flex: 1, minWidth: 0, height: `${h}%`, background: "linear-gradient(180deg, #8b5cf6, #7c3aed)", borderRadius: "3px 3px 0 0", cursor: "pointer", transition: "all .15s" }} />
                            );
                          })}
                        </div>
                        <div className="row row-between" style={{ marginTop: 4 }}>
                          <span style={{ fontSize: 9, color: "var(--dim)" }}>{(d.gunluk_randevu || [])[0]?.gun?.slice(5)}</span>
                          <span style={{ fontSize: 9, color: "var(--dim)" }}>{(d.gunluk_randevu || []).at(-1)?.gun?.slice(5)}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ===== EKİP & HİZMETLER TAB ===== */}
                {detayTab === "ekip" && (
                  <>
                    {/* Çalışanlar */}
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 12 }}>👥 Çalışanlar ({(d.calisanlar || []).length})</div>
                    {(d.calisanlar || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz çalışan eklenmemiş</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
                        {(d.calisanlar || []).map(c => (
                          <div key={c.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #8b5cf6, #7c3aed)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14 }}>{(c.isim || "?")[0]}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{c.isim}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)" }}>{c.uzmanlik || "—"}</div>
                            </div>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: c.aktif !== false ? "rgba(16,185,129,.08)" : "rgba(239,68,68,.08)", color: c.aktif !== false ? "#10b981" : "#ef4444", fontSize: 10, fontWeight: 600 }}>{c.aktif !== false ? "Aktif" : "Pasif"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Hizmetler */}
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 12 }}>🛠️ Hizmetler ({(d.hizmetler || []).length})</div>
                    {(d.hizmetler || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz hizmet eklenmemiş</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(d.hizmetler || []).map(h => (
                          <div key={h.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{h.isim}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)" }}>{h.sure || "—"} dk</div>
                            </div>
                            <span style={{ fontWeight: 800, fontSize: 14, color: "#10b981" }}>{h.fiyat || 0}₺</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Kullanıcılar */}
                    {(d.kullanici || []).length > 0 && (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 12, marginTop: 24 }}>🔑 Admin Kullanıcılar</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(d.kullanici || []).map(k => (
                            <div key={k.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{k.email}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(139,92,246,.08)", color: "#8b5cf6", fontSize: 10, fontWeight: 600 }}>{k.rol}</span>
                              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dim)" }}>{k.olusturma_tarihi ? new Date(k.olusturma_tarihi).toLocaleDateString("tr-TR") : ""}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ===== AYARLAR TAB ===== */}
                {detayTab === "ayarlar" && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>⚙️ İşletme Ayarları</div>
                    {d.ayarlar ? (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                        {Object.entries(d.ayarlar).filter(([k]) => !['id', 'isletme_id'].includes(k)).map(([k, v]) => (
                          <div key={k} style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <span style={{ color: "var(--dim)", fontSize: 11 }}>{k}:</span>
                            <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{v === true ? "✅ Evet" : v === false ? "❌ Hayır" : v === null ? "—" : String(v)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}><p>Henüz ayar kaydı yok</p></div>
                    )}

                    {/* Bot ayarları */}
                    {d.bot_durum && (
                      <>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 12, marginTop: 24 }}>🤖 Bot Ayarları</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                          {Object.entries(d.bot_durum).filter(([k]) => !['id', 'isletme_id'].includes(k)).map(([k, v]) => (
                            <div key={k} style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                              <span style={{ color: "var(--dim)", fontSize: 11 }}>{k}:</span>
                              <div style={{ fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{v === true ? "✅ Evet" : v === false ? "❌ Hayır" : v === null ? "—" : String(v).slice(0, 60)}</div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ===== İŞLEMLER TAB ===== */}
                {detayTab === "islemler" && (
                  <>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>🔧 İşletme İşlemleri</div>

                    {/* Hızlı İşlemler */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                      {/* Aktif/Pasif Toggle */}
                      <button onClick={async () => { await api.put(`/admin/isletmeler/${isl.id}`, { aktif: !isl.aktif }); isletmeDetayYukle(isl.id); isletmeleriYukle(); }} style={{ padding: "18px 20px", borderRadius: 14, border: "none", cursor: "pointer", background: isl.aktif ? "rgba(239,68,68,.06)" : "rgba(16,185,129,.06)", textAlign: "left" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{isl.aktif ? "🔴" : "🟢"}</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: isl.aktif ? "#ef4444" : "#10b981" }}>{isl.aktif ? "Pasife Al" : "Aktif Et"}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İşletmeyi {isl.aktif ? "devre dışı bırak" : "tekrar aktif et"}</div>
                      </button>

                      {/* Paket Değiştir */}
                      <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(139,92,246,.06)" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>📦</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#8b5cf6", marginBottom: 6 }}>Paket Değiştir</div>
                        <select defaultValue={isl.paket || ""} onChange={async (e) => { await api.put(`/admin/isletmeler/${isl.id}`, { paket: e.target.value }); isletmeDetayYukle(isl.id); isletmeleriYukle(); }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 700 }}>
                          <option value="baslangic">Başlangıç</option>
                          <option value="profesyonel">Profesyonel</option>
                          <option value="kurumsal">Kurumsal</option>
                        </select>
                      </div>

                      {/* Deneme Uzat */}
                      <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(59,130,246,.06)" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>🧪</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#3b82f6", marginBottom: 6 }}>Deneme Uzat</div>
                        <div className="row gap-4" style={{ flexWrap: "wrap" }}>
                          {[3,7,14,30].map(g => (
                            <button key={g} onClick={async () => { await api.post(`/admin/isletmeler/${isl.id}/deneme-uzat`, { gun: g }); isletmeDetayYukle(isl.id); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 12 }}>+{g} gün</button>
                          ))}
                        </div>
                      </div>

                      {/* Müşteri Olarak Giriş */}
                      <button onClick={async () => { const res = await api.post(`/admin/impersonate/${isl.id}`); if (res.token) { window.open(`${window.location.origin}?impersonate=${res.token}`, '_blank'); } else { alert(res.hata || "Impersonate başarısız"); }}} style={{ padding: "18px 20px", borderRadius: 14, border: "none", cursor: "pointer", background: "rgba(245,158,11,.06)", textAlign: "left" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>👤</div>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#f59e0b" }}>Müşteri Olarak Giriş</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İşletmenin panelini gör</div>
                      </button>
                    </div>

                    {/* Tehlikeli İşlemler */}
                    <div style={{ background: "rgba(239,68,68,.04)", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(239,68,68,.1)" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#ef4444", marginBottom: 12 }}>⚠️ Tehlikeli İşlemler</div>
                      <button onClick={async () => { if (!confirm(`"${isl.isim}" işletmesi kalıcı olarak silinecek! Emin misiniz?`)) return; if (!confirm("BU İŞLEM GERİ ALINAMAZ! Son kez onaylıyor musunuz?")) return; await api.del(`/admin/isletmeler/${isl.id}`); setDetayIsletme(null); isletmeleriYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(239,68,68,.2)", cursor: "pointer", background: "rgba(239,68,68,.08)", color: "#ef4444", fontWeight: 700, fontSize: 13 }}>🗑️ İşletmeyi Kalıcı Sil</button>
                    </div>
                  </>
                )}

              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
}

export default function App() {
  const [kullanici, setKullanici] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("randevugo_token");
    if (token) {
      api.token = token;
      api.get("/auth/profil").then(d => {
        if (d.kullanici) setKullanici(d.kullanici);
        setYukleniyor(false);
      }).catch(() => setYukleniyor(false));
    } else {
      setYukleniyor(false);
    }
  }, []);

  if (yukleniyor) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0e14" }}>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 18, fontWeight: 600 }}>SıraGO yükleniyor...</div>
    </div>
  );

  if (!kullanici) return <Login onLogin={setKullanici} />;
  if (kullanici.rol === "superadmin") return <SuperAdminPanel kullanici={kullanici} />;
  return <Dashboard />;
}
