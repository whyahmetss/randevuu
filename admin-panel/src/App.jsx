import { useState, useEffect, useCallback, useRef } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import logoIcon from "./assets/logo1.png";
import logoFull from "./assets/logo2.png";

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

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <img src={logoIcon} alt="SıraGO" />
          <div>
            <div className="brand-name">SıraGO</div>
            <div className="brand-sub">İşletme Yönetim Paneli</div>
          </div>
        </div>
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
          <button type="submit" disabled={yukleniyor} className="btn btn-primary btn-block btn-lg mt-8">
            {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==================== HİZMETLER SAYFASI ====================
function HizmetlerSayfasi({ hizmetler, yukle, paketDurum }) {
  const [formAcik, setFormAcik] = useState(false);
  const [form, setForm] = useState({ isim: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "" });
  const [hata, setHata] = useState("");

  const ekle = async (e) => {
    e.preventDefault();
    setHata("");
    const res = await api.post("/hizmetler", { isim: form.isim, sure_dk: parseInt(form.sure_dk), fiyat: parseFloat(form.fiyat), aciklama: form.aciklama, emoji: form.emoji });
    if (res.hata) { setHata(res.hata); return; }
    setForm({ isim: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "" });
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
              <label className="form-label">Süre (dakika)</label>
              <input type="number" placeholder="30" value={form.sure_dk} onChange={e => setForm({...form, sure_dk: e.target.value})} className="input" />
            </div>
            <div>
              <label className="form-label">Fiyat (₺) *</label>
              <input type="number" placeholder="150" required value={form.fiyat} onChange={e => setForm({...form, fiyat: e.target.value})} className="input" />
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
              {!h.aktif && <span style={{ color: "var(--red)", marginLeft: 8, fontSize: 12 }}>(Pasif)</span>}
            </div>
            <span className="tag-sm" style={{ background: "var(--bg)", color: "var(--muted)" }}>⏱ {h.sure_dk} dk</span>
            <span className="tag-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", fontWeight: 700 }}>{h.fiyat} ₺</span>
          </div>
          <button onClick={() => sil(h.id)} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Sil</button>
        </div>
      ))}
    </>
  );
}

// ==================== ÇALIŞANLAR SAYFASI ====================
function CalisanlarSayfasi({ paketDurum }) {
  const [calisanlar, setCalisanlar] = useState([]);
  const [formAcik, setFormAcik] = useState(false);
  const [form, setForm] = useState({ isim: "", telefon: "", uzmanlik: "" });
  const [hata, setHata] = useState("");

  const yukle = async () => {
    const d = await api.get("/calisanlar");
    setCalisanlar(d.calisanlar || []);
  };

  useEffect(() => { yukle(); }, []);

  const ekle = async (e) => {
    e.preventDefault();
    setHata("");
    const res = await api.post("/calisanlar", form);
    if (res.hata) { setHata(res.hata); return; }
    setForm({ isim: "", telefon: "", uzmanlik: "" });
    setFormAcik(false);
    yukle();
  };

  const limit = paketDurum?.paket_bilgi?.calisan_limit || 1;

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
          <button onClick={() => setFormAcik(!formAcik)} className="btn btn-primary">+ Yeni Çalışan</button>
        </div>
      </div>

      {formAcik && (
        <form onSubmit={ekle} className="form-card card-accent-green">
          <h3 className="green">Yeni Çalışan Ekle</h3>
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
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Kaydet</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); }} className="btn btn-ghost">İptal</button>
          </div>
        </form>
      )}

      {calisanlar.length === 0 ? (
        <div className="list-empty"><p>Henüz çalışan eklenmemiş.</p></div>
      ) : calisanlar.map(c => (
        <div key={c.id} className="list-item">
          <div>
            <span className="list-item-name">{c.isim}</span>
            {c.telefon && <span className="list-item-sub" style={{ marginLeft: 12, display: "inline" }}>📞 {c.telefon}</span>}
            {c.uzmanlik && (
              <div className="mt-4">
                {c.uzmanlik.split(",").map(u => (
                  <span key={u} className="tag-sm" style={{ background: "var(--bg)", color: "var(--muted)", marginRight: 4 }}>{u.trim()}</span>
                ))}
              </div>
            )}
          </div>
          <span className="tag" style={{ background: c.aktif ? "rgba(16,185,129,.12)" : "var(--red-s)", color: c.aktif ? "var(--green)" : "var(--red)" }}>
            {c.aktif ? "Aktif" : "Pasif"}
          </span>
        </div>
      ))}
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
  const [ayarKaydedildi, setAyarKaydedildi] = useState(false);
  const [paketModal, setPaketModal] = useState(false);
  const [grafikVeri, setGrafikVeri] = useState(null);
  const [odemeBilgi, setOdemeBilgi] = useState(null);
  const [havaleNotu, setHavaleNotu] = useState("");
  const [odemeYukleniyor, setOdemeYukleniyor] = useState(false);
  const chatRef = useRef(null);

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
    api.get("/odeme/durum").then(d => { if (!d.hata) setOdemeBilgi(d); }).catch(() => {});
  }, [verileriYukle]);

  const hizmetleriYukle = async () => { const d = await api.get("/hizmetler"); setHizmetler(d.hizmetler || []); };
  const musterileriYukle = async () => { const d = await api.get("/musteriler"); setMusteriler(d.musteriler || []); };
  const ayarlariYukle = async () => { const d = await api.get("/ayarlar"); setAyarlar(d.isletme); };

  useEffect(() => {
    if (sayfa === "hizmetler") hizmetleriYukle();
    if (sayfa === "musteriler") musterileriYukle();
    if (sayfa === "ayarlar") ayarlariYukle();
    if (sayfa === "randevular") verileriYukle();
  }, [sayfa]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [testCevaplar]);

  const DR = { onaylandi: "#10b981", bekliyor: "#f59e0b", iptal: "#ef4444", tamamlandi: "#3b82f6", gelmedi: "#6b7280" };
  const DL = { onaylandi: "Onaylı ✓", bekliyor: "Bekliyor", iptal: "İptal", tamamlandi: "Tamamlandı", gelmedi: "Gelmedi" };

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

  const sayfaBaslik = { anasayfa: "Dashboard", randevular: "Randevular", hizmetler: "Hizmetler", calisanlar: "Çalışanlar", musteriler: "Müşteriler", botbaglanti: "Bot Bağlantısı", bottest: "Bot Test", ayarlar: "Ayarlar" };

  const SVG = {
    dashboard: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
    randevular: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
    hizmetler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>,
    calisanlar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    musteriler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    botbaglanti: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
    bottest: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    ayarlar: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  };

  const menuItems = [
    { id: "anasayfa", icon: SVG.dashboard, label: "Dashboard" },
    { id: "randevular", icon: SVG.randevular, label: "Randevular" },
    { id: "hizmetler", icon: SVG.hizmetler, label: "Hizmetler" },
    { id: "calisanlar", icon: SVG.calisanlar, label: "Çalışanlar" },
    { id: "musteriler", icon: SVG.musteriler, label: "Müşteriler" },
    { id: "botbaglanti", icon: SVG.botbaglanti, label: "Bot Bağlantısı" },
    { id: "bottest", icon: SVG.bottest, label: "Bot Test" },
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
        <div className="top-bar">
          <h1>{sayfaBaslik[sayfa]}</h1>
          <div className="date">
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <div className="page-body">

          {/* ── DASHBOARD ── */}
          {sayfa === "anasayfa" && (
            <>
              {/* Stat Cards */}
              <div className="stats-grid">
                {[
                  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>, label: "Bugün Randevu", val: stats?.bugun?.toplam_randevu || 0, cls: "green" },
                  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, label: "Bu Hafta", val: stats?.hafta?.toplam_randevu || 0, cls: "blue" },
                  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, label: "Toplam Müşteri", val: stats?.toplam_musteri || 0, cls: "amber" },
                  { icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: "Bugün Müsait Saat", val: stats?.bugun_musait_saat || 0, cls: "purple" },
                ].map(c => (
                  <div key={c.label} className={`stat-card ${c.cls}`}>
                    <div className="sc-icon">{c.icon}</div>
                    <div className="sc-label">{c.label}</div>
                    <div className="sc-val">{c.val}</div>
                  </div>
                ))}
              </div>

              {/* Bugünün randevuları */}
              <div className="card">
                <div className="card-header">
                  <h3>Bugünün Randevuları</h3>
                  <button onClick={() => setSayfa("randevular")} className="btn btn-ghost btn-sm">Tümünü Gör →</button>
                </div>
                {!stats ? (
                  <div className="text-center" style={{ color: "var(--dim)", padding: 30 }}>Yükleniyor...</div>
                ) : randevular.length === 0 ? (
                  <div className="text-center" style={{ padding: "30px 0" }}>
                    <div style={{ fontSize: 36 }} className="mb-8">📭</div>
                    <div style={{ color: "var(--dim)", fontSize: 14 }}>Bugün için randevu yok</div>
                  </div>
                ) : randevular.map(r => (
                  <div key={r.id} className="row" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
                    <div className="time-avatar"><span>{r.saat?.slice(0, 5)}</span></div>
                    <div className="flex-1">
                      <div style={{ fontWeight: 600, fontSize: 14 }} className="mb-2">{r.musteri_isim}</div>
                      <div style={{ color: "var(--dim)", fontSize: 12 }}>{r.hizmet_isim}{r.calisan_isim ? ` · ${r.calisan_isim}` : ""}</div>
                    </div>
                    <span className="tag" style={{ background: (DR[r.durum] || "#64748b") + "20", color: DR[r.durum] || "#64748b" }}>
                      {DL[r.durum] || r.durum}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grafikler */}
              {grafikVeri && (
                <div className="chart-grid">
                  <div className="card">
                    <h3 className="card-title mb-16">Son 7 Gün - Randevular</h3>
                    <div className="chart-container">
                      <Bar data={{
                        labels: (grafikVeri.haftalik || []).map(h => { const d = new Date(h.tarih); return d.toLocaleDateString("tr-TR", { weekday: "short", day: "numeric" }); }),
                        datasets: [
                          { label: "Toplam", data: (grafikVeri.haftalik || []).map(h => parseInt(h.sayi)), backgroundColor: "rgba(99,102,241,.6)", borderRadius: 6 },
                          { label: "Onaylanan", data: (grafikVeri.haftalik || []).map(h => parseInt(h.onaylanan)), backgroundColor: "rgba(16,185,129,.6)", borderRadius: 6 },
                        ]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#8892b0", font: { size: 11 } } } }, scales: { x: { ticks: { color: "#5a6380", font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#5a6380", font: { size: 10 } }, grid: { color: "rgba(255,255,255,.04)" } } } }} />
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="card-title mb-16">Aylık Gelir (₺)</h3>
                    <div className="chart-container">
                      <Line data={{
                        labels: (grafikVeri.aylikGelir || []).map(g => { const d = new Date(g.tarih); return `${d.getDate()}/${d.getMonth()+1}`; }),
                        datasets: [{
                          label: "Gelir (₺)", data: (grafikVeri.aylikGelir || []).map(g => parseFloat(g.gelir)),
                          borderColor: "#a78bfa", backgroundColor: "rgba(167,139,250,.1)", fill: true, tension: .4, pointRadius: 2,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#8892b0", font: { size: 11 } } } }, scales: { x: { ticks: { color: "#5a6380", font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: "#5a6380", font: { size: 10 }, callback: v => v + "₺" }, grid: { color: "rgba(255,255,255,.04)" } } } }} />
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="card-title mb-16">Hizmet Dağılımı</h3>
                    <div className="chart-container-sm">
                      <Doughnut data={{
                        labels: (grafikVeri.hizmetDagilimi || []).map(h => h.isim),
                        datasets: [{ data: (grafikVeri.hizmetDagilimi || []).map(h => parseInt(h.sayi)),
                          backgroundColor: ["#6366f1","#10b981","#f59e0b","#ec4899","#3b82f6","#ef4444","#8b5cf6","#14b8a6"],
                          borderWidth: 0,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#8892b0", font: { size: 11 }, padding: 12 } } } }} />
                    </div>
                  </div>

                  <div className="card">
                    <h3 className="card-title mb-16">Saat Dağılımı</h3>
                    <div className="chart-container">
                      <Bar data={{
                        labels: (grafikVeri.saatDagilimi || []).map(s => s.saat?.slice(0,5)),
                        datasets: [{ label: "Randevu", data: (grafikVeri.saatDagilimi || []).map(s => parseInt(s.sayi)),
                          backgroundColor: "rgba(245,158,11,.5)", borderRadius: 4,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#5a6380", font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: "#5a6380", font: { size: 10 } }, grid: { color: "rgba(255,255,255,.04)" } } } }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Ödeme Durumu */}
              {odemeBilgi && (
                <div className="card">
                  <div className="card-header">
                    <h3>Ödeme Durumu - {odemeBilgi.donem}</h3>
                    <span className={`tag ${odemeBilgi.odeme?.durum === 'odendi' ? 'tag-green' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? 'tag-amber' : 'tag-red'}`}>
                      {odemeBilgi.odeme?.durum === 'odendi' ? 'Ödendi' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? 'Havale Onay Bekliyor' : 'Ödenmedi'}
                    </span>
                  </div>
                  {(!odemeBilgi.odeme || odemeBilgi.odeme.durum === 'bekliyor') && (
                    <div className="odeme-panel">
                      <div className="odeme-tutar">{odemeBilgi.tutar}₺ <span className="odeme-paket">{odemeBilgi.paket} paket</span></div>

                      <div className="odeme-yontemler">
                        <div className="odeme-yontem">
                          <h4 className="mb-10">Havale / EFT ile Öde</h4>
                          <div className="banka-bilgi">
                            <div><strong>Banka:</strong> {odemeBilgi.banka?.banka_adi}</div>
                            <div><strong>IBAN:</strong> {odemeBilgi.banka?.iban}</div>
                            <div><strong>Hesap Sahibi:</strong> {odemeBilgi.banka?.hesap_sahibi}</div>
                            <div><strong>Açıklama:</strong> <span className="ref-kod">{odemeBilgi.banka?.aciklama}</span></div>
                          </div>
                          <div className="ref-uyari">⚠️ Havale yaparken açıklama kısmına <strong>{odemeBilgi.banka?.aciklama}</strong> yazmayı unutmayın!</div>
                          <div className="row row-wrap gap-8 mt-12">
                            <input value={havaleNotu} onChange={e => setHavaleNotu(e.target.value)} placeholder="Dekont notu (isteğe bağlı)" className="input flex-1" style={{ minWidth: 0 }} />
                            <button onClick={async () => {
                              setOdemeYukleniyor(true);
                              const d = await api.post("/odeme/havale", { dekont_notu: havaleNotu });
                              if (!d.hata) { setHavaleNotu(""); api.get("/odeme/durum").then(d2 => { if (!d2.hata) setOdemeBilgi(d2); }); }
                              setOdemeYukleniyor(false);
                            }} disabled={odemeYukleniyor} className="btn btn-primary btn-sm">
                              {odemeYukleniyor ? "Gönderiliyor..." : "Havale Bildirimi Gönder"}
                            </button>
                          </div>
                        </div>

                        <div className="odeme-yontem">
                          <h4 className="mb-10">Kredi Kartı ile Öde (iyzico)</h4>
                          <button onClick={async () => {
                            setOdemeYukleniyor(true);
                            const d = await api.post("/odeme/iyzico/baslat", { paket: odemeBilgi.paket });
                            if (d.checkoutFormContent) {
                              const w = window.open("", "_blank");
                              w.document.write(d.checkoutFormContent);
                            } else if (d.hata) {
                              alert(d.hata);
                            }
                            setOdemeYukleniyor(false);
                          }} disabled={odemeYukleniyor} className="btn btn-sm" style={{ background: "#6366f1", color: "#fff" }}>
                            {odemeYukleniyor ? "Yükleniyor..." : "Kredi Kartı ile Öde"}
                          </button>
                          <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 6 }}>iyzico güvenli ödeme altyapısı</div>
                        </div>
                      </div>
                    </div>
                  )}
                  {odemeBilgi.odeme?.durum === 'havale_bekliyor' && (
                    <div className="alert alert-amber mt-12">Havale bildiriminiz alındı. SuperAdmin onayı bekleniyor.</div>
                  )}
                  {odemeBilgi.odeme?.durum === 'odendi' && (
                    <div className="alert alert-success mt-12">Bu dönem ödemesi tamamlandı. Teşekkürler!</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── RANDEVULAR ── */}
          {sayfa === "randevular" && (
            <>
              <div className="row gap-10 mb-20">
                <input type="date" value={randevuTarih}
                  onChange={e => { setRandevuTarih(e.target.value); verileriYukle(e.target.value); }} className="input" style={{ width: "auto" }} />
                <button onClick={() => verileriYukle()} className="btn btn-primary btn-sm">Yenile</button>
                <span style={{ color: "var(--dim)", fontSize: 13 }}>{randevular.length} randevu</span>
              </div>

              {randevular.length === 0 ? (
                <div className="card text-center" style={{ padding: "50px 0" }}>
                  <div style={{ fontSize: 40 }} className="mb-10">📭</div>
                  <div style={{ color: "var(--dim)", fontSize: 14 }}>Bu tarih için randevu yok</div>
                </div>
              ) : randevular.map(r => (
                <div key={r.id} className="list-item list-item-lg">
                  <div className="time-avatar time-avatar-lg"><span>{r.saat?.slice(0, 5)}</span></div>
                  <div className="flex-1">
                    <div style={{ fontWeight: 700, fontSize: 15 }} className="mb-3">{r.musteri_isim}</div>
                    <div className="list-item-meta">
                      📞 {r.musteri_telefon}
                      {r.hizmet_isim && <span style={{ marginLeft: 10 }}>✂️ {r.hizmet_isim}{r.fiyat ? ` · ${r.fiyat}₺` : ""}</span>}
                      {r.calisan_isim && <span style={{ marginLeft: 10 }}>👤 {r.calisan_isim}</span>}
                    </div>
                  </div>
                  <div className="list-item-actions">
                    {[["onaylandi","✓ Onaylı"], ["tamamlandi","Tamam"], ["gelmedi","Gelmedi"], ["iptal","İptal"]].map(([d, l]) => (
                      <button key={d}
                        onClick={async () => { await api.put(`/randevular/${r.id}/durum`, { durum: d }); verileriYukle(); }}
                        className="btn btn-sm" style={{ background: r.durum === d ? (DR[d] + "25") : "transparent",
                          color: r.durum === d ? DR[d] : "var(--dim)", border: r.durum === d ? "none" : "1px solid var(--border)",
                          fontWeight: r.durum === d ? 700 : 400 }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}

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

          {/* ── AYARLAR ── */}
          {sayfa === "ayarlar" && (
            ayarlar ? (
              <div className="settings-wrap">
                {ayarKaydedildi && (
                  <div className="alert alert-success mb-20">✓ Ayarlar kaydedildi</div>
                )}
                <div className="settings-card">
                  <h3>İşletme Bilgileri</h3>
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
                  <h3>Çalışma Saatleri</h3>
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
                  <h3>Mola / Kapalı Saatler</h3>
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
                  <h3 style={{ margin: "0 0 16px" }}>Kapalı Günler</h3>
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
                <button onClick={async () => {
                  await api.put("/ayarlar", ayarlar);
                  setAyarKaydedildi(true);
                  setTimeout(() => setAyarKaydedildi(false), 3000);
                }} className="btn btn-primary btn-lg">
                  Kaydet
                </button>
              </div>
            ) : (
              <div className="row gap-10" style={{ color: "var(--dim)", padding: 40 }}>
                <span>⏳</span> Yükleniyor...
              </div>
            )
          )}

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
                { key: "baslangic", isim: "Başlangıç", fiyat: 299, renk: "#64748b", ozellikler: ["1 çalışan", "5 hizmete kadar", "Aylık 100 randevu", "WhatsApp / Telegram bot", "Temel destek"] },
                { key: "profesyonel", isim: "Profesyonel", fiyat: 599, renk: "#3b82f6", ozellikler: ["5 çalışana kadar", "20 hizmete kadar", "Aylık 500 randevu", "WhatsApp / Telegram bot", "Randevu hatırlatmaları", "Öncelikli destek"] },
                { key: "premium", isim: "Premium", fiyat: 999, renk: "#f59e0b", ozellikler: ["Sınırsız çalışan", "Sınırsız hizmet", "Sınırsız randevu", "WhatsApp / Telegram bot", "Randevu hatırlatmaları", "Gelişmiş istatistikler", "7/24 VIP destek"] },
              ].map(p => {
                const aktif = paketDurum?.paket === p.key;
                return (
                  <div key={p.key} className={`price-item${aktif ? ' active' : ''}`} style={{ background: aktif ? `${p.renk}10` : "var(--bg)", borderColor: aktif ? p.renk : undefined, color: p.renk }}>
                    {aktif && <div className="price-tag" style={{ background: p.renk }}>MEVCUT</div>}
                    {p.key === "profesyonel" && !aktif && <div className="price-tag" style={{ background: "var(--blue)" }}>POPÜLER</div>}
                    <div className="p-name" style={{ color: p.renk }}>{p.isim}</div>
                    <div className="p-price">{p.fiyat}₺<span>/ay</span></div>
                    <div className="p-divider">
                      {p.ozellikler.map((o, i) => (
                        <div key={i} className="price-feature"><span style={{ color: p.renk }}>✓</span> {o}</div>
                      ))}
                    </div>
                    {!aktif && (
                      <button className="btn btn-block mt-8" style={{ background: p.renk, color: "#fff" }}>
                        {p.key === "baslangic" ? "Geç" : "Yükselt"}
                      </button>
                    )}
                  </div>
                );
              })}
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
  const [odemeFiltre, setOdemeFiltre] = useState("hepsi");
  const [yeniOdeme, setYeniOdeme] = useState({ isletme_id: "", tutar: "", donem: new Date().toISOString().slice(0, 7) });
  const [odemeFormAcik, setOdemeFormAcik] = useState(false);
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

  useEffect(() => {
    isletmeleriYukle();
    odemeleriYukle();
  }, []);

  const avciListeYukle = async () => {
    const d = await api.get(`/admin/avci/liste?durum=${avciFiltre}&kategori=${avciKategoriFiltre}&siralama=${avciSiralama}&limit=100`);
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

  useEffect(() => {
    if (sayfa === "isletmeler") isletmeleriYukle();
    if (sayfa === "odemeler") odemeleriYukle();
    if (sayfa === "avci") { avciStatsYukle(); avciListeYukle(); avciGunlukYukle(); }
  }, [sayfa, avciFiltre, avciSiralama, avciKategoriFiltre]);

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
  };

  const menuItems = [
    { id: "dashboard", icon: SVGA.dashboard, label: "Dashboard" },
    { id: "isletmeler", icon: SVGA.isletmeler, label: "İşletmeler" },
    { id: "odemeler", icon: SVGA.odemeler, label: "Ödemeler" },
    { id: "avci", icon: SVGA.avci, label: "Avcı Bot" },
  ];

  const kategoriRenk = { berber: "#3b82f6", kuafor: "#8b5cf6", disci: "#10b981", guzellik: "#f59e0b", veteriner: "#ef4444", diyetisyen: "#06b6d4" };
  const paketRenk = { baslangic: "#64748b", profesyonel: "#3b82f6", premium: "#f59e0b" };
  const paketFiyat = { baslangic: 299, profesyonel: 599, premium: 999 };
  const odemeRenk = { odendi: "#10b981", bekliyor: "#f59e0b", gecikti: "#ef4444" };
  const odemeLabel = { odendi: "Ödendi ✓", bekliyor: "Bekliyor", gecikti: "Gecikti!" };

  const buAy = new Date().toISOString().slice(0, 7);
  const buAyOdeyenler = odemeler.filter(o => o.donem === buAy && o.durum === "odendi");
  const buAyOdemeyenler = isletmeler.filter(i => i.aktif && !odemeler.find(o => o.isletme_id == i.id && o.donem === buAy && o.durum === "odendi"));
  const toplamGelir = odemeler.filter(o => o.durum === "odendi").reduce((s, o) => s + parseFloat(o.tutar || 0), 0);
  const buAyGelir = buAyOdeyenler.reduce((s, o) => s + parseFloat(o.tutar || 0), 0);

  const filtreliIsletmeler = isletmeler.filter(i => {
    if (isletmeFiltre === "aktif") return i.aktif;
    if (isletmeFiltre === "pasif") return !i.aktif;
    return true;
  });

  const filtreliOdemeler = odemeler.filter(o => {
    if (odemeFiltre === "odendi") return o.durum === "odendi";
    if (odemeFiltre === "bekliyor") return o.durum === "bekliyor";
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
              {m.id === 'odemeler' && buAyOdemeyenler.length > 0
                ? <span className="nav-badge">{buAyOdemeyenler.length}</span>
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
              <p>Genel bakış ve işletme özeti</p>
            </div>
            <div className="stats-grid">
              <div className="stat-card amber"><div className="sc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div><div className="sc-label">Toplam İşletme</div><div className="sc-val">{isletmeler.length}</div></div>
              <div className="stat-card green"><div className="sc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div><div className="sc-label">Aktif İşletme</div><div className="sc-val">{isletmeler.filter(i => i.aktif).length}</div></div>
              <div className="stat-card purple"><div className="sc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg></div><div className="sc-label">Toplam Gelir</div><div className="sc-val">{toplamGelir.toFixed(0)} ₺</div></div>
              <div className="stat-card blue"><div className="sc-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></div><div className="sc-label">Bu Ay Gelir</div><div className="sc-val">{buAyGelir.toFixed(0)} ₺</div></div>
            </div>

            {/* Bu ay ödeme durumu */}
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
                  ? <p style={{ color: "var(--dim)", fontSize: 13 }}>Herkes ödedi.</p>
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
        {sayfa === "isletmeler" && (
          <>
            <div className="ph-row">
              <h1>İşletmeler ({isletmeler.length})</h1>
              <button onClick={() => setFormAcik(!formAcik)} className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>+ Yeni İşletme Ekle</button>
            </div>

            <div className="filter-bar">
              {[["hepsi","Hepsi"], ["aktif","Aktif"], ["pasif","Pasif"]].map(([v, l]) => (
                <button key={v} onClick={() => setIsletmeFiltre(v)} className={`pill${isletmeFiltre === v ? ' active' : ''}`}>
                  {l} {v === "hepsi" ? isletmeler.length : v === "aktif" ? isletmeler.filter(i=>i.aktif).length : isletmeler.filter(i=>!i.aktif).length}
                </button>
              ))}
            </div>

            {formAcik && (
              <form onSubmit={isletmeEkle} className="form-card card-accent-amber">
                <h3 className="amber">Yeni İşletme Kaydı</h3>
                <div className="form-grid">
                  {[
                    { key: "isim", label: "İşletme Adı *", ph: "Berber Ali" },
                    { key: "telefon", label: "Telefon *", ph: "05551234567" },
                    { key: "adres", label: "Adres", ph: "Bağcılar Cad. No:1" },
                    { key: "ilce", label: "İlçe", ph: "Bağcılar" },
                    { key: "email", label: "Giriş Email *", ph: "ali@berber.com" },
                    { key: "sifre", label: "Şifre *", ph: "En az 6 karakter" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="form-label">{f.label}</label>
                      <input type={f.key === "sifre" ? "password" : "text"} placeholder={f.ph} required={["isim","telefon","email","sifre"].includes(f.key)}
                        value={yeniIsletme[f.key]} onChange={e => setYeniIsletme({ ...yeniIsletme, [f.key]: e.target.value })} className="input" />
                    </div>
                  ))}
                  <div>
                    <label className="form-label">Kategori</label>
                    <select value={yeniIsletme.kategori} onChange={e => setYeniIsletme({ ...yeniIsletme, kategori: e.target.value })} className="input">
                      {["berber","kuafor","disci","guzellik","veteriner","diyetisyen","masaj","spa"].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-actions mt-16">
                  <button type="submit" className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 700 }}>Kaydet ve Oluştur</button>
                  <button type="button" onClick={() => setFormAcik(false)} className="btn btn-ghost">İptal</button>
                </div>
              </form>
            )}

            {yukleniyor ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> : filtreliIsletmeler.map(i => (
              <div key={i.id} className={`list-item list-item-lg${!i.aktif ? ' list-item-pasif' : ''}`} style={{ alignItems: "flex-start", flexDirection: "column", gap: 0 }}>
                <div className="row row-between row-wrap" style={{ width: "100%" }}>
                  <div className="flex-1">
                    <div className="row row-wrap gap-10 mb-8">
                      <div className={i.aktif ? 'dot-green' : 'dot-red'} />
                      <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 16 }}>{i.isim}</span>
                      <span className="tag" style={{ background: (kategoriRenk[i.kategori] || "#64748b") + "22", color: kategoriRenk[i.kategori] || "#64748b" }}>{i.kategori}</span>
                      <span style={{ color: "var(--muted)", fontSize: 12 }}>📅 {i.toplam_randevu || 0} randevu</span>
                    </div>
                    <div className="list-item-meta mb-12">📍 {i.adres || "—"}{i.ilce ? ` · ${i.ilce}` : ""}  ·  📞 {i.telefon}</div>
                    <div className="row gap-6">
                      {["baslangic","profesyonel","premium"].map(p => (
                        <button key={p} onClick={() => paketDegistir(i.id, p)} className="pill-xs"
                          style={{ background: i.paket === p ? paketRenk[p] : "var(--bg)", color: i.paket === p ? "#fff" : "var(--dim)", outline: i.paket === p ? `2px solid ${paketRenk[p]}` : "none" }}>
                          {p} {p === "baslangic" ? "299₺" : p === "profesyonel" ? "599₺" : "999₺"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="list-item-actions shrink-0" style={{ marginLeft: 12 }}>
                    <button onClick={() => aktifToggle(i)} className="btn btn-sm"
                      style={{ background: i.aktif ? "rgba(16,185,129,.12)" : "rgba(245,158,11,.12)", color: i.aktif ? "var(--green)" : "var(--amber)", border: "none", fontWeight: 700 }}>
                      {i.aktif ? "✓ Aktif" : "⏸ Pasif"}
                    </button>
                    <button onClick={() => isletmeSil(i.id, i.isim)} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Sil</button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ÖDEMELER */}
        {sayfa === "odemeler" && (
          <>
            <div className="row row-wrap gap-16 mb-24">
              <StatCard icon="💰" baslik="Toplam Gelir" deger={toplamGelir.toFixed(0) + " ₺"} renk="#10b981" />
              <StatCard icon="📅" baslik="Bu Ay Gelir" deger={buAyGelir.toFixed(0) + " ₺"} renk="#3b82f6" />
              <StatCard icon="✅" baslik="Bu Ay Ödeyen" deger={buAyOdeyenler.length} renk="#8b5cf6" />
              <StatCard icon="⏳" baslik="Bu Ay Ödemeyenler" deger={buAyOdemeyenler.length} renk="#ef4444" />
            </div>

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

            {buAyOdemeyenler.length > 0 && odemeFiltre === "hepsi" && (
              <div className="warn-banner">
                <div className="wb-head">
                  <span>⚠️</span>
                  <span>Bu ay henüz ödeme yapmayan {buAyOdemeyenler.length} işletme var</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {buAyOdemeyenler.map(i => (
                    <div key={i.id} className="row row-between" style={{ background: "var(--bg)", borderRadius: 8, padding: "10px 14px" }}>
                      <div className="row gap-10">
                        <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>{i.isim}</span>
                        <span className="tag-sm" style={{ background: (paketRenk[i.paket] || "#64748b") + "22", color: paketRenk[i.paket] || "#64748b" }}>{i.paket}</span>
                        <span style={{ color: "var(--dim)", fontSize: 12 }}>{paketFiyat[i.paket] || "?"} ₺</span>
                      </div>
                      <button onClick={async () => {
                          await api.post("/admin/odemeler", { isletme_id: i.id, tutar: paketFiyat[i.paket] || 299, donem: buAy, durum: "bekliyor" });
                          odemeleriYukle(); isletmeleriYukle();
                        }} className="btn btn-sm" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)", border: "none", fontWeight: 700 }}>
                        + Bekliyor Oluştur
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {yukleniyor ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> :
              filtreliOdemeler.length === 0 ? (
                <div className="list-empty"><p>Kayıt bulunamadı.</p></div>
              ) : filtreliOdemeler.map(o => (
                <div key={o.id} className="list-item row-wrap gap-8">
                  <div>
                    <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 15 }}>{o.isletme_isim}</span>
                    <span style={{ color: "var(--dim)", marginLeft: 12, fontSize: 13 }}>📅 {o.donem}</span>
                    <span style={{ color: "var(--green)", marginLeft: 12, fontWeight: 700, fontSize: 15 }}>{o.tutar} ₺</span>
                    {o.odeme_tarihi && <span style={{ color: "var(--dim)", marginLeft: 12, fontSize: 12 }}>· {new Date(o.odeme_tarihi).toLocaleDateString("tr-TR")}</span>}
                  </div>
                  <div className="row gap-6">
                    <span className="tag" style={{ background: (odemeRenk[o.durum] || "#64748b") + "22", color: odemeRenk[o.durum] || "#64748b", fontWeight: 700 }}>
                      {odemeLabel[o.durum] || o.durum}
                    </span>
                    {o.durum === "bekliyor" && (
                      <>
                        <button onClick={() => odemeGuncelle(o.id, "odendi")} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontWeight: 600 }}>✓ Havale Geldi</button>
                        <button onClick={() => odemeGuncelle(o.id, "gecikti")} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Gecikti</button>
                      </>
                    )}
                    {o.durum === "gecikti" && (
                      <button onClick={() => odemeGuncelle(o.id, "odendi")} className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontWeight: 600 }}>✓ Havale Geldi</button>
                    )}
                    {o.durum === "odendi" && (
                      <button onClick={() => odemeGuncelle(o.id, "bekliyor")} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Geri Al</button>
                    )}
                  </div>
                </div>
              ))
            }
          </>
        )}

        {/* AVCI BOT */}
        {sayfa === "avci" && (
          <>
            <h1 style={{ fontSize: 24 }} className="mb-8">🎯 Avcı Bot — Potansiyel Müşteriler</h1>
            <p style={{ color: "var(--dim)", fontSize: 13 }} className="mb-24">Google Maps'ten işletmeleri bul, skorla, ara ve müşteri yap.</p>

            {avciStats && (
              <div className="row row-wrap gap-12 mb-24">
                <StatCard icon="📍" baslik="Toplam Lead" deger={avciStats.toplam} renk="#f59e0b" />
                <StatCard icon="🆕" baslik="Yeni" deger={avciStats.yeni} renk="#3b82f6" />
                <StatCard icon="📞" baslik="Arandı" deger={avciStats.arandi} renk="#8b5cf6" />
                <StatCard icon="🤝" baslik="İlgileniyor" deger={avciStats.ilgileniyor} renk="#10b981" />
                <StatCard icon="✅" baslik="Müşteri Oldu" deger={avciStats.musteri_oldu} renk="#10b981" />
              </div>
            )}

            <div className="row row-between row-wrap gap-10 mb-16">
              <div className="row gap-8">
                <button onClick={() => setAvciTab("gunluk")} className={`pill${avciTab === "gunluk" ? ' active' : ''}`}>📞 Bugün Ara ({avciGunluk.length})</button>
                <button onClick={() => setAvciTab("liste")} className={`pill${avciTab === "liste" ? ' active' : ''}`}>📋 Tüm Liste ({avciListe.length})</button>
              </div>
              <div className="row gap-8">
                <button onClick={() => { setAvciTaramaAcik(!avciTaramaAcik); setTopluTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "var(--green)", color: "#fff", fontWeight: 700 }}>🔍 Maps</button>
                <button onClick={() => { setTopluTaramaAcik(!topluTaramaAcik); setAvciTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "var(--purple)", color: "#fff", fontWeight: 700 }}>🚀 Toplu Maps</button>
                <button onClick={() => { setSosyalAcik(!sosyalAcik); setAvciTaramaAcik(false); setTopluTaramaAcik(false); }} className="btn btn-sm" style={{ background: "#e11d48", color: "#fff", fontWeight: 700 }}>📱 Sosyal Medya</button>
              </div>
            </div>

            {/* Tekli tarama formu */}
            {avciTaramaAcik && (
              <div className="form-card card-accent-green">
                <h3 className="green">🔍 Tekli Tarama</h3>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div>
                    <label className="form-label">Şehir *</label>
                    <input value={avciTarama.sehir} onChange={e => setAvciTarama({...avciTarama, sehir: e.target.value})} placeholder="İstanbul" className="input" />
                  </div>
                  <div>
                    <label className="form-label">İlçe</label>
                    <input value={avciTarama.ilce} onChange={e => setAvciTarama({...avciTarama, ilce: e.target.value})} placeholder="Kadıköy" className="input" />
                  </div>
                  <div>
                    <label className="form-label">Kategori *</label>
                    <select value={avciTarama.kategori} onChange={e => setAvciTarama({...avciTarama, kategori: e.target.value})} className="input">
                      {["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k =>
                        <option key={k} value={k}>{k}</option>
                      )}
                    </select>
                  </div>
                  <button disabled={avciTaramaYukleniyor} onClick={async () => {
                    setAvciTaramaYukleniyor(true);
                    setAvciTaramaSonuc(null);
                    try {
                      const res = await api.post("/admin/avci/tarama", avciTarama);
                      setAvciTaramaSonuc(res);
                      avciListeYukle(); avciStatsYukle(); avciGunlukYukle();
                    } catch(e) { setAvciTaramaSonuc({ hata: e.message }); }
                    setAvciTaramaYukleniyor(false);
                  }} className="btn btn-primary" style={{ opacity: avciTaramaYukleniyor ? 0.5 : 1 }}>
                    {avciTaramaYukleniyor ? "Taranıyor..." : "🔍 Tara"}
                  </button>
                </div>
                {avciTaramaSonuc && (
                  <div className={`result-toast ${avciTaramaSonuc.hata ? 'error' : 'success'}`}>{avciTaramaSonuc.hata
                      ? `❌ ${avciTaramaSonuc.hata}`
                      : `✅ "${avciTaramaSonuc.arama_metni}" — ${avciTaramaSonuc.toplam_bulunan} bulundu, ${avciTaramaSonuc.yeni_eklenen} yeni eklendi, ${avciTaramaSonuc.zaten_var} zaten vardı`
                    }</div>
                )}
              </div>
            )}

            {/* Toplu tarama formu */}
            {topluTaramaAcik && (
              <div className="form-card card-accent-purple">
                <h3 className="purple">🚀 Toplu Tarama — Tüm İlçeler</h3>
                <p style={{ color: "var(--dim)", fontSize: 12 }} className="mb-16">İstanbul'un 39 ilçesinde seçtiğin kategorileri otomatik tarar. Bu işlem birkaç dakika sürebilir.</p>
                <div className="mb-16">
                  <label className="form-label">Şehir</label>
                  <input value={topluSehir} onChange={e => setTopluSehir(e.target.value)} className="input" style={{ width: 160 }} />
                </div>
                <div className="mb-16">
                  <label className="form-label mb-8">Kategoriler (tıkla seç/kaldır)</label>
                  <div className="row row-wrap gap-6">
                    {["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => (
                      <button key={k} onClick={() => {
                        setTopluKategoriler(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
                      }} className={`pill pill-sm${topluKategoriler.includes(k) ? ' active-purple' : ''}`}>{k}</button>
                    ))}
                  </div>
                  <span style={{ display: "block", marginTop: 6, color: "var(--dim)", fontSize: 11 }}>{topluKategoriler.length} kategori seçili · ~{topluKategoriler.length * 39} tarama yapılacak</span>
                </div>
                <button disabled={topluYukleniyor || !topluKategoriler.length} onClick={async () => {
                  setTopluYukleniyor(true);
                  setTopluSonuc(null);
                  try {
                    const res = await api.post("/admin/avci/toplu-tarama", { sehir: topluSehir, kategoriler: topluKategoriler });
                    setTopluSonuc(res);
                    avciListeYukle(); avciStatsYukle(); avciGunlukYukle();
                  } catch(e) { setTopluSonuc({ hata: e.message }); }
                  setTopluYukleniyor(false);
                }} className="btn" style={{ background: topluYukleniyor ? "var(--surface3)" : "var(--purple)", color: "#fff", fontWeight: 700, opacity: topluYukleniyor ? 0.6 : 1 }}>
                  {topluYukleniyor ? "⏳ Toplu tarama devam ediyor... (birkaç dk sürer)" : `🚀 ${topluKategoriler.length} Kategori × 39 İlçe Tara`}
                </button>
                {topluSonuc && (
                  <div className={`result-toast ${topluSonuc.hata ? 'error' : 'purple'}`}>
                    {topluSonuc.hata
                      ? `❌ ${topluSonuc.hata}`
                      : `✅ ${topluSonuc.tarama_sayisi} tarama yapıldı — ${topluSonuc.toplam_bulunan} bulundu, ${topluSonuc.yeni_eklenen} yeni eklendi, ${topluSonuc.zaten_var} zaten vardı`
                    }
                  </div>
                )}
              </div>
            )}

            {/* Sosyal medya tarama formu */}
            {sosyalAcik && (
              <div className="form-card card-accent-rose">
                <h3 className="rose">📱 Sosyal Medya Tarama</h3>
                <p style={{ color: "var(--dim)", fontSize: 12 }} className="mb-16">Instagram, Facebook, TikTok'ta işletme profilleri bul. Google Custom Search API kullanır (günlük 100 ücretsiz sorgu).</p>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div>
                    <label className="form-label">Platform *</label>
                    <div className="row gap-6">
                      {[["instagram","📸 Instagram"],["facebook","📘 Facebook"],["tiktok","🎵 TikTok"],["hepsi","🌐 Hepsi"]].map(([v,l]) => (
                        <button key={v} onClick={() => setSosyalTarama({...sosyalTarama, platform: v})}
                          className={`pill pill-sm${sosyalTarama.platform === v ? ' active-rose' : ''}`}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="form-label">Şehir *</label>
                    <input value={sosyalTarama.sehir} onChange={e => setSosyalTarama({...sosyalTarama, sehir: e.target.value})} className="input" style={{ width: 120 }} />
                  </div>
                  <div>
                    <label className="form-label">İlçe</label>
                    <input value={sosyalTarama.ilce} onChange={e => setSosyalTarama({...sosyalTarama, ilce: e.target.value})} placeholder="opsiyonel" className="input" style={{ width: 120 }} />
                  </div>
                  <div>
                    <label className="form-label">Kategori *</label>
                    <select value={sosyalTarama.kategori} onChange={e => setSosyalTarama({...sosyalTarama, kategori: e.target.value})} className="input">
                      {["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k =>
                        <option key={k} value={k}>{k}</option>
                      )}
                    </select>
                  </div>
                  <button disabled={sosyalYukleniyor} onClick={async () => {
                    setSosyalYukleniyor(true);
                    setSosyalSonuc(null);
                    try {
                      const res = await api.post("/admin/avci/sosyal-tarama", sosyalTarama);
                      setSosyalSonuc(res);
                      avciListeYukle(); avciStatsYukle(); avciGunlukYukle();
                    } catch(e) { setSosyalSonuc({ hata: e.message }); }
                    setSosyalYukleniyor(false);
                  }} className="btn" style={{ background: sosyalYukleniyor ? "var(--surface3)" : "#e11d48", color: "#fff", fontWeight: 700, opacity: sosyalYukleniyor ? 0.6 : 1 }}>
                    {sosyalYukleniyor ? "⏳ Aranıyor..." : "🔍 Tara"}
                  </button>
                </div>
                {sosyalSonuc && (
                  <div className={`result-toast ${sosyalSonuc.hata ? 'error' : 'rose'}`}>
                    {sosyalSonuc.hata
                      ? `❌ ${sosyalSonuc.hata}`
                      : `✅ "${sosyalSonuc.arama_metni}" — ${sosyalSonuc.toplam_bulunan} sonuç, ${sosyalSonuc.yeni_eklenen} yeni profil eklendi, ${sosyalSonuc.zaten_var} zaten vardı`
                    }
                  </div>
                )}
              </div>
            )}

            {/* GÜNLÜK ARAMA LİSTESİ */}
            {avciTab === "gunluk" && (
              <>
                <div className="info-banner">
                  <div className="ib-head">
                    <span>📞</span>
                    <span>Bugün Aranacak {avciGunluk.length} İşletme</span>
                  </div>
                  <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>En yüksek skorlu, telefonu olan, henüz aranmamış veya tekrar aranacak işletmeler</p>
                </div>
                {avciGunluk.length === 0 ? (
                  <div className="list-empty"><p>Bugün aranacak kimse yok. Yeni tarama yap! 🔍</p></div>
                ) : avciGunluk.map((m, idx) => (
                  <div key={m.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", padding: 18, marginBottom: 10 }}>
                    <div className="row row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                      <div className="flex-1">
                        <div className="row row-wrap gap-10 mb-6">
                          <span className="rank-circle">{idx + 1}</span>
                          <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 16 }}>{m.isletme_adi}</span>
                          <span className="tag-xs" style={{ background: "rgba(59,130,246,.12)", color: "var(--blue)" }}>{m.kategori}</span>
                          <span className="tag-xs" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)", fontWeight: 700 }}>Skor: {m.skor}</span>
                        </div>
                        <div className="list-item-meta mb-6">
                          {m.telefon && <span>📞 <strong style={{ color: "var(--text)" }}>{m.telefon}</strong></span>}
                          {m.adres && <span style={{ marginLeft: 12 }}>📍 {m.adres}</span>}
                        </div>
                        <div className="row row-wrap gap-6" style={{ fontSize: 11 }}>
                          {!m.web_sitesi && <span className="tag-xs" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)" }}>🌐 Web sitesi yok</span>}
                          {m.puan && <span className="tag-xs" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)" }}>⭐ {m.puan}</span>}
                          <span className="tag-xs" style={{ background: "rgba(139,92,246,.12)", color: "var(--purple)" }}>💬 {m.yorum_sayisi} yorum</span>
                          {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" className="tag-xs" style={{ background: "rgba(59,130,246,.12)", color: "var(--blue)", textDecoration: "none" }}>🗺️ Maps</a>}
                        </div>
                      </div>
                      <div className="list-item-actions shrink-0">
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "arandi" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }}
                          className="btn btn-sm" style={{ background: "rgba(139,92,246,.12)", color: "var(--purple)", border: "none", fontWeight: 600 }}>📞 Arandı</button>
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "ilgileniyor" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }}
                          className="btn btn-sm" style={{ background: "rgba(16,185,129,.12)", color: "var(--green)", border: "none", fontWeight: 600 }}>🤝 İlgileniyor</button>
                        <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} className="btn btn-ghost btn-sm">📝 Not</button>
                      </div>
                    </div>
                    {avciSecili === m.id && (
                      <div className="row gap-8 mt-12">
                        <input id={`not_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input flex-1" />
                        <button onClick={async () => {
                          const notInput = document.getElementById(`not_${m.id}`);
                          await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value });
                          setAvciSecili(null); avciListeYukle(); avciGunlukYukle();
                        }} className="btn btn-primary btn-sm">Kaydet</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* TÜM LİSTE */}
            {avciTab === "liste" && (
              <>
                <div className="filter-bar mb-8">
                  {[["hepsi","Tümü"],["yeni","Yeni"],["arandi","Arandı"],["ilgileniyor","İlgileniyor"],["ilgilenmiyor","İlgilenmiyor"],["demo_yapildi","Demo"],["musteri_oldu","Müşteri ✓"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAvciFiltre(v)} className={`pill pill-sm${avciFiltre === v ? ' active' : ''}`}>{l}</button>
                  ))}
                  <select value={avciSiralama} onChange={e => setAvciSiralama(e.target.value)} className="input ml-auto" style={{ width: "auto", padding: "5px 10px", fontSize: 12 }}>
                    <option value="skor_desc">Skor ↓</option>
                    <option value="puan_desc">Puan ↓</option>
                    <option value="yorum_desc">Yorum ↓</option>
                    <option value="yeni">En Yeni</option>
                  </select>
                </div>
                <div className="row row-wrap gap-6 mb-12" style={{ alignItems: "center" }}>
                  <span style={{ color: "var(--dim)", fontSize: 11, marginRight: 4 }}>Kategori:</span>
                  {[["hepsi","Tümü"],["berber","✂️ Berber"],["kuaför","💇 Kuaför"],["güzellik salonu","💅 Güzellik"],["dövme","🎨 Dövme"],["diş kliniği","🦷 Dişçi"],["veteriner","🐾 Veteriner"],["spa","🧖 Spa"],["diyetisyen","🥗 Diyetisyen"],["tırnak salonu","💅 Tırnak"],["cilt bakım","✨ Cilt Bakım"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAvciKategoriFiltre(v)} className={`pill-xs${avciKategoriFiltre === v ? ' active-purple' : ''}`}
                      style={{ background: avciKategoriFiltre === v ? "var(--purple)" : "var(--bg)", color: avciKategoriFiltre === v ? "#fff" : "var(--dim)" }}>{l}</button>
                  ))}
                </div>

                {avciListe.length === 0 ? (
                  <div className="list-empty"><p>Henüz potansiyel müşteri yok. Tarama yap! 🔍</p></div>
                ) : avciListe.map(m => {
                  const durumRenk = { yeni: "#3b82f6", arandi: "#8b5cf6", ilgileniyor: "#10b981", ilgilenmiyor: "#ef4444", demo_yapildi: "#f59e0b", musteri_oldu: "#10b981" };
                  const durumLabel = { yeni: "Yeni", arandi: "Arandı", ilgileniyor: "İlgileniyor", ilgilenmiyor: "İlgilenmiyor", demo_yapildi: "Demo Yapıldı", musteri_oldu: "Müşteri ✓" };
                  return (
                    <div key={m.id} className="list-item list-item-left" style={{ borderLeftColor: durumRenk[m.durum] || "var(--border2)", flexDirection: "column", alignItems: "stretch" }}>
                      <div className="row row-between" style={{ alignItems: "flex-start", gap: 10 }}>
                        <div className="flex-1">
                          <div className="row row-wrap gap-8 mb-4">
                            <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 14 }}>{m.isletme_adi}</span>
                            <span className="tag-xs" style={{ background: (durumRenk[m.durum] || "#64748b") + "22", color: durumRenk[m.durum] || "#64748b", fontWeight: 600 }}>{durumLabel[m.durum] || m.durum}</span>
                            <span className="tag-xs" style={{ background: "rgba(245,158,11,.12)", color: "var(--amber)", fontWeight: 700 }}>Skor: {m.skor}</span>
                            {m.puan && <span style={{ color: "var(--amber)", fontSize: 12 }}>⭐ {m.puan}</span>}
                            <span style={{ color: "var(--dim)", fontSize: 11 }}>💬 {m.yorum_sayisi}</span>
                          </div>
                          <div style={{ color: "var(--dim)", fontSize: 12 }} className="mb-4">
                            {m.telefon && <span>📞 {m.telefon}</span>}
                            {m.kategori && <span style={{ marginLeft: 10 }}>🏷️ {m.kategori}</span>}
                            {m.ilce && <span style={{ marginLeft: 10 }}>📍 {m.ilce}</span>}
                            {!m.web_sitesi && <span style={{ marginLeft: 10, color: "var(--green)" }}>🌐 Web yok</span>}
                            {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "var(--blue)", textDecoration: "none", fontSize: 11 }}>🗺️ Maps</a>}
                          </div>
                          {m.notlar && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>📝 {m.notlar}</div>}
                        </div>
                        <div className="list-item-actions list-item-actions-wrap shrink-0">
                          {["yeni","arandi","ilgileniyor","ilgilenmiyor","demo_yapildi","musteri_oldu"].filter(d => d !== m.durum).slice(0,3).map(d => (
                            <button key={d} onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: d }); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); }}
                              className="btn btn-sm" style={{ background: (durumRenk[d] || "#64748b") + "22", color: durumRenk[d] || "#64748b", border: "none", fontWeight: 600, fontSize: 11 }}>
                              {durumLabel[d]}
                            </button>
                          ))}
                          <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>📝</button>
                          <button onClick={async () => {
                            if (!confirm(`"${m.isletme_adi}" silinsin mi?`)) return;
                            await api.del(`/admin/avci/${m.id}`);
                            avciListeYukle(); avciStatsYukle();
                          }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      {avciSecili === m.id && (
                        <div className="row gap-8 mt-12">
                          <input id={`not2_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input flex-1" />
                          <button onClick={async () => {
                            const notInput = document.getElementById(`not2_${m.id}`);
                            await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value });
                            setAvciSecili(null); avciListeYukle();
                          }} className="btn btn-primary btn-sm">Kaydet</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </>
        )}

      </div>
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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
      <div style={{ color: "#fff", fontSize: 20 }}>📅 RandevuGO yükleniyor...</div>
    </div>
  );

  if (!kullanici) return <Login onLogin={setKullanici} />;
  if (kullanici.rol === "superadmin") return <SuperAdminPanel kullanici={kullanici} />;
  return <Dashboard />;
}
