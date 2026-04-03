import { useState, useEffect, useCallback, useRef } from "react";

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
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)" }}>
      <div style={{ background: "#1e293b", borderRadius: 20, padding: 40, width: 380, boxShadow: "0 25px 60px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 30 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>📅</div>
          <h1 style={{ color: "#fff", fontSize: 28, margin: 0 }}>RandevuGO</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>İşletme Yönetim Paneli</p>
        </div>
        <form onSubmit={giris}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "14px 16px", marginBottom: 12, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }}
          />
          <input
            type="password"
            placeholder="Şifre"
            value={sifre}
            onChange={(e) => setSifre(e.target.value)}
            style={{ width: "100%", padding: "14px 16px", marginBottom: 16, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }}
          />
          {hata && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{hata}</p>}
          <button
            type="submit"
            disabled={yukleniyor}
            style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#10b981", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: yukleniyor ? 0.7 : 1 }}
          >
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ color: "#fff", fontSize: 24, margin: 0 }}>Hizmetler ({hizmetler.length})</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {paketDurum && (
            <span style={{ color: kullanimYuzde >= 90 ? "#ef4444" : "#64748b", fontSize: 13 }}>
              {hizmetler.length}/{limit >= 999 ? "∞" : limit} kullanıldı
            </span>
          )}
          <button onClick={() => setFormAcik(!formAcik)}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
            + Yeni Hizmet
          </button>
        </div>
      </div>

      {formAcik && (
        <form onSubmit={ekle} style={{ background: "#1e293b", borderRadius: 16, padding: 24, marginBottom: 20, border: "1px solid #10b98144" }}>
          <h3 style={{ color: "#10b981", marginBottom: 16, fontSize: 15 }}>Yeni Hizmet Ekle</h3>
          {hata && <div style={{ background: "#ef444422", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{hata}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ gridColumn: "1/-1", display: "flex", gap: 12 }}>
              <div style={{ width: 70, flexShrink: 0 }}>
                <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Emoji</label>
                <input placeholder="🦷" maxLength={4} value={form.emoji} onChange={e => setForm({...form, emoji: e.target.value})}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 20, boxSizing: "border-box", outline: "none", textAlign: "center" }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Hizmet Adı *</label>
                <input placeholder="Saç Kesimi" required value={form.isim} onChange={e => setForm({...form, isim: e.target.value})}
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
              </div>
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Süre (dakika)</label>
              <input type="number" placeholder="30" value={form.sure_dk} onChange={e => setForm({...form, sure_dk: e.target.value})}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Fiyat (₺) *</label>
              <input type="number" placeholder="150" required value={form.fiyat} onChange={e => setForm({...form, fiyat: e.target.value})}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Kaydet</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); }} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>İptal</button>
          </div>
        </form>
      )}

      {hizmetler.length === 0 ? (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#64748b", margin: 0 }}>Henüz hizmet eklenmemiş.</p>
        </div>
      ) : hizmetler.map(h => (
        <div key={h.id} style={{ background: "#1e293b", borderRadius: 12, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div>
              <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{h.emoji ? `${h.emoji} ` : ''}{h.isim}</span>
              {!h.aktif && <span style={{ color: "#ef4444", marginLeft: 8, fontSize: 12 }}>(Pasif)</span>}
            </div>
            <span style={{ background: "#0f172a", color: "#94a3b8", padding: "3px 10px", borderRadius: 20, fontSize: 12 }}>⏱ {h.sure_dk} dk</span>
            <span style={{ background: "#10b98122", color: "#10b981", padding: "3px 10px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>{h.fiyat} ₺</span>
          </div>
          <button onClick={() => sil(h.id)}
            style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#ef444422", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            Sil
          </button>
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ color: "#fff", fontSize: 24, margin: 0 }}>Çalışanlar ({calisanlar.length})</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {paketDurum && (
            <span style={{ color: calisanlar.length >= limit ? "#ef4444" : "#64748b", fontSize: 13 }}>
              {calisanlar.length}/{limit >= 999 ? "∞" : limit} kullanıldı
            </span>
          )}
          <button onClick={() => setFormAcik(!formAcik)}
            style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
            + Yeni Çalışan
          </button>
        </div>
      </div>

      {formAcik && (
        <form onSubmit={ekle} style={{ background: "#1e293b", borderRadius: 16, padding: 24, marginBottom: 20, border: "1px solid #10b98144" }}>
          <h3 style={{ color: "#10b981", marginBottom: 16, fontSize: 15 }}>Yeni Çalışan Ekle</h3>
          {hata && <div style={{ background: "#ef444422", border: "1px solid #ef444433", borderRadius: 8, padding: "10px 14px", color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{hata}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Ad Soyad *</label>
              <input placeholder="Ali Usta" required value={form.isim} onChange={e => setForm({...form, isim: e.target.value})}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
            </div>
            <div>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Telefon</label>
              <input placeholder="05551234567" value={form.telefon} onChange={e => setForm({...form, telefon: e.target.value})}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Uzmanlık (virgülle ayır)</label>
              <input placeholder="sac_kesimi, sakal, cilt_bakimi" value={form.uzmanlik} onChange={e => setForm({...form, uzmanlik: e.target.value})}
                style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="submit" style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Kaydet</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); }} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>İptal</button>
          </div>
        </form>
      )}

      {calisanlar.length === 0 ? (
        <div style={{ background: "#1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
          <p style={{ color: "#64748b", margin: 0 }}>Henüz çalışan eklenmemiş.</p>
        </div>
      ) : calisanlar.map(c => (
        <div key={c.id} style={{ background: "#1e293b", borderRadius: 12, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{c.isim}</span>
            {c.telefon && <span style={{ color: "#64748b", marginLeft: 12, fontSize: 13 }}>📞 {c.telefon}</span>}
            {c.uzmanlik && (
              <div style={{ marginTop: 4 }}>
                {c.uzmanlik.split(",").map(u => (
                  <span key={u} style={{ background: "#0f172a", color: "#94a3b8", padding: "2px 8px", borderRadius: 12, fontSize: 11, marginRight: 4 }}>{u.trim()}</span>
                ))}
              </div>
            )}
          </div>
          <span style={{ background: c.aktif ? "#10b98122" : "#ef444422", color: c.aktif ? "#10b981" : "#ef4444", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
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

  const inp = { padding: "10px 14px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", width: "100%" };
  const btn = (renk, disabled) => ({ padding: "10px 22px", borderRadius: 10, border: "none", background: disabled ? "#1e293b" : renk, color: disabled ? "#475569" : "#fff", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 14 });

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
    <div style={{ maxWidth: 680 }}>
      {/* Durum Kartları */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
        {[
          { ikon: "💬", baslik: "WhatsApp", bagli: wpDurum === "bagli", detay: wpDurum === "bagli" ? (wpNo ? `+${wpNo}` : "Bağlı") : wpDurum === "qr_bekleniyor" ? "QR bekleniyor..." : "Bağlı değil" },
          { ikon: "✈️", baslik: "Telegram", bagli: tgBagli, detay: tgBagli ? "Bot aktif" : "Bağlı değil" },
        ].map(k => (
          <div key={k.baslik} style={{ background: "#111827", border: `1px solid ${k.bagli ? "#10b98140" : "#1e293b"}`, borderRadius: 16, padding: 18, display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: k.bagli ? "#10b98120" : "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{k.ikon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{k.baslik}</div>
              <div style={{ color: "#64748b", fontSize: 12 }}>{k.detay}</div>
            </div>
            <span style={{ background: k.bagli ? "#10b98120" : "#ef444420", color: k.bagli ? "#10b981" : "#ef4444", padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
              {k.bagli ? "● AKTİF" : "● PASİF"}
            </span>
          </div>
        ))}
      </div>

      {/* Tab */}
      <div style={{ display: "flex", gap: 4, background: "#0f172a", borderRadius: 12, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {[{ id: "whatsapp", label: "💬 WhatsApp" }, { id: "telegram", label: "✈️ Telegram" }].map(t => (
          <button key={t.id} onClick={() => setAktifTab(t.id)}
            style={{ padding: "8px 20px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
              background: aktifTab === t.id ? "#1e293b" : "transparent",
              color: aktifTab === t.id ? "#fff" : "#64748b" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* WHATSAPP QR PANEL */}
      {aktifTab === "whatsapp" && (
        <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 28 }}>
          {/* Bağlı değil veya başlatılmamış */}
          {(!wpDurum || wpDurum === "baslatilmadi" || wpDurum === "bagli_degil") && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>💬</div>
              <h3 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>WhatsApp'ı Bağla</h3>
              <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 24px", lineHeight: 1.6 }}>
                Kendi WhatsApp numaranı bota bağla. Müşterilerin sana WhatsApp'tan yazınca bot otomatik cevap verir.
              </p>
              <div style={{ background: "#0f172a", borderRadius: 12, padding: 16, marginBottom: 24, textAlign: "left" }}>
                {[
                  "Aşağıdaki butona tıkla",
                  "QR kod çıkacak, WhatsApp'ı aç",
                  "WhatsApp → Bağlantılı Cihazlar → Cihaz Ekle",
                  "QR kodu tara, bağlandı!",
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#25D36620", color: "#25D366", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{i+1}</div>
                    <span style={{ color: "#94a3b8", fontSize: 13 }}>{s}</span>
                  </div>
                ))}
              </div>
              <button onClick={wpBaslat} disabled={wpYukleniyor}
                style={{ ...btn("#25D366", wpYukleniyor), fontSize: 15, padding: "12px 32px" }}>
                {wpYukleniyor ? "Başlatılıyor..." : "📱 QR Kodu Göster"}
              </button>
            </div>
          )}

          {/* QR Bekleniyor */}
          {(wpDurum === "baslatiyor" || wpDurum === "qr_bekleniyor") && (
            <div style={{ textAlign: "center" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700 }}>📱 WhatsApp ile Tara</h3>
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 20px" }}>
                WhatsApp → Bağlantılı Cihazlar → Cihaz Ekle → QR kodu tara
              </p>
              {wpQr ? (
                <div style={{ display: "inline-block", background: "#fff", padding: 16, borderRadius: 16 }}>
                  <img src={wpQr} alt="QR" style={{ width: 220, height: 220, display: "block" }} />
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 220, height: 220, background: "#0f172a", borderRadius: 16, margin: "0 auto", border: "2px dashed #1e293b" }}>
                  <div style={{ color: "#475569", fontSize: 13 }}>QR yükleniyor...</div>
                </div>
              )}
              <p style={{ color: "#475569", fontSize: 12, marginTop: 16 }}>QR kod 60 saniyede geçersiz olur. Taramak için acele edin.</p>
              <button onClick={wpAyir} style={{ marginTop: 12, padding: "8px 18px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
                İptal
              </button>
            </div>
          )}

          {/* Bağlandı */}
          {wpDurum === "bagli" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
              <h3 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#10b981" }}>WhatsApp Bağlı!</h3>
              {wpNo && <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 8px" }}>Numara: <strong style={{ color: "#fff" }}>+{wpNo}</strong></p>}
              <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>
                Müşterileriniz bu numaraya WhatsApp'tan yazdığında bot otomatik olarak yanıt verecek.
              </p>
              <button onClick={wpAyir} disabled={wpYukleniyor}
                style={{ ...btn("#ef4444", wpYukleniyor) }}>
                {wpYukleniyor ? "Ayrılıyor..." : "🔌 Bağlantıyı Kes"}
              </button>
            </div>
          )}

          {/* Hata */}
          {wpDurum === "hata" && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>❌</div>
              <p style={{ color: "#ef4444", marginBottom: 16 }}>Bağlantı hatası oluştu.</p>
              <button onClick={wpBaslat} style={{ ...btn("#25D366", false) }}>Tekrar Dene</button>
            </div>
          )}
        </div>
      )}

      {/* TELEGRAM PANEL */}
      {aktifTab === "telegram" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 22 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, fontWeight: 700 }}>📖 Telegram Botu Nasıl Oluşturulur?</h3>
            {[
              "Telegram'da @BotFather'ı aç ve /newbot yaz",
              'Bot ismi gir (örn: "Berber Ali Randevu")',
              'Kullanıcı adı gir, sonu "bot" bitmeli (örn: berberalirndvbot)',
              "BotFather bir Token verecek → kopyala",
              "Token'ı aşağıya yapıştır → Bağla",
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#3b82f620", color: "#3b82f6", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{i+1}</div>
                <span style={{ color: "#94a3b8", fontSize: 13 }}>{s}</span>
              </div>
            ))}
            <a href="https://t.me/BotFather" target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 8, padding: "8px 18px", borderRadius: 10, background: "#229ED9", color: "#fff", fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
              ✈️ BotFather'ı Aç
            </a>
          </div>

          <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 22 }}>
            {tgBagli ? (
              <div>
                <div style={{ background: "#10b98110", border: "1px solid #10b98130", borderRadius: 10, padding: 12, marginBottom: 16, color: "#10b981", fontSize: 13 }}>
                  ✅ Telegram botunuz aktif. Müşterileriniz Telegram'dan randevu alabilir.
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={tgToken} onChange={e => setTgToken(e.target.value)} placeholder="Yeni token ile değiştir..." style={{ ...inp, flex: 1 }} />
                  <button onClick={telegramBagla} disabled={tgYukleniyor || !tgToken.trim()} style={btn("#3b82f6", !tgToken.trim())}>Değiştir</button>
                  <button onClick={telegramAyir} disabled={tgYukleniyor} style={btn("#ef4444", false)}>Ayır</button>
                </div>
              </div>
            ) : (
              <div>
                <h3 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700 }}>🔗 Telegram Botunu Bağla</h3>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ color: "#64748b", fontSize: 12, display: "block", marginBottom: 6 }}>BotFather Token</label>
                  <input value={tgToken} onChange={e => setTgToken(e.target.value)}
                    placeholder="7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={inp} />
                </div>
                <button onClick={telegramBagla} disabled={tgYukleniyor || !tgToken.trim()} style={btn("#229ED9", !tgToken.trim())}>
                  {tgYukleniyor ? "Bağlanıyor..." : "✈️ Bağla"}
                </button>
              </div>
            )}
            {tgSonuc && (
              <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: tgSonuc.hata ? "#ef444420" : "#10b98120", color: tgSonuc.hata ? "#ef4444" : "#10b981", fontSize: 13 }}>
                {tgSonuc.mesaj}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, baslik, deger, renk }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 16, padding: 24, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>{baslik}</div>
      <div style={{ color: renk || "#fff", fontSize: 28, fontWeight: 700 }}>{deger}</div>
    </div>
  );
}

function Dashboard() {
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
    const d = await api.post("/bot/test", { telefon: testTelefon, mesaj: testMesaj });
    if (d.cevaplar) d.cevaplar.forEach(c => setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj: c }]));
    setTestMesaj("");
    setTestYukleniyor(false);
  };

  const cikisYap = () => { localStorage.removeItem("randevugo_token"); api.token = null; window.location.reload(); };

  const sayfaBaslik = { anasayfa: "Dashboard", randevular: "Randevular", hizmetler: "Hizmetler", calisanlar: "Çalışanlar", musteriler: "Müşteriler", botbaglanti: "Bot Bağlantısı", bottest: "Bot Test", ayarlar: "Ayarlar" };

  const menuItems = [
    { id: "anasayfa", icon: "📊", label: "Dashboard" },
    { id: "randevular", icon: "📅", label: "Randevular" },
    { id: "hizmetler", icon: "✂️", label: "Hizmetler" },
    { id: "calisanlar", icon: "👤", label: "Çalışanlar" },
    { id: "musteriler", icon: "👥", label: "Müşteriler" },
    { id: "botbaglanti", icon: "🔗", label: "Bot Bağlantısı" },
    { id: "bottest", icon: "🤖", label: "Bot Test" },
    { id: "ayarlar", icon: "⚙️", label: "Ayarlar" },
  ];

  const S = { input: { padding: "10px 14px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", width: "100%" } };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', sans-serif", color: "#fff" }}>

      {/* ── Sidebar ── */}
      <div style={{ width: 240, background: "#111827", flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid #1e293b" }}>
        {/* Logo */}
        <div style={{ padding: "24px 20px 20px", borderBottom: "1px solid #1e293b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#10b981,#059669)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📅</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>RandevuGO</div>
              <div style={{ color: "#10b981", fontSize: 11, fontWeight: 600 }}>İşletme Paneli</div>
            </div>
          </div>
          {ayarlar && <div style={{ color: "#64748b", fontSize: 12, marginTop: 4 }}>🏪 {ayarlar.isim}</div>}
        </div>

        {/* Menu */}
        <nav style={{ flex: 1, padding: "12px 10px" }}>
          {menuItems.map(m => (
            <div key={m.id} onClick={() => setSayfa(m.id)}
              style={{ padding: "10px 14px", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, marginBottom: 2,
                background: sayfa === m.id ? "#10b98120" : "transparent",
                color: sayfa === m.id ? "#10b981" : "#94a3b8", fontSize: 14, fontWeight: sayfa === m.id ? 600 : 400 }}>
              <span style={{ fontSize: 16 }}>{m.icon}</span>
              <span>{m.label}</span>
              {sayfa === m.id && <div style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />}
            </div>
          ))}
        </nav>

        {/* Paket Widget */}
        {paketDurum && (
          <div style={{ margin: "0 10px 12px", background: "#0f172a", borderRadius: 12, padding: 14, border: "1px solid #1e293b" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>Paketiniz</span>
              <span style={{
                background: paketDurum.paket === "premium" ? "#f59e0b22" : paketDurum.paket === "profesyonel" ? "#3b82f622" : "#64748b22",
                color: paketDurum.paket === "premium" ? "#f59e0b" : paketDurum.paket === "profesyonel" ? "#3b82f6" : "#94a3b8",
                fontSize: 10, padding: "3px 8px", borderRadius: 6, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1
              }}>{paketDurum.paket}</span>
            </div>
            {[
              { label: "Çalışan", used: paketDurum.kullanim.calisan, limit: paketDurum.paket_bilgi.calisan_limit, renk: "#10b981" },
              { label: "Hizmet", used: paketDurum.kullanim.hizmet, limit: paketDurum.paket_bilgi.hizmet_limit, renk: "#3b82f6" },
              { label: "Bu ay randevu", used: paketDurum.kullanim.randevu, limit: paketDurum.paket_bilgi.aylik_randevu_limit, renk: "#8b5cf6" },
            ].map(item => {
              const pct = item.limit >= 9999 ? 4 : Math.min(100, Math.round(item.used / item.limit * 100));
              const dolu = pct >= 90;
              return (
                <div key={item.label} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#64748b", fontSize: 11 }}>{item.label}</span>
                    <span style={{ color: dolu ? "#ef4444" : "#475569", fontSize: 11, fontWeight: dolu ? 700 : 400 }}>
                      {item.limit >= 9999 ? `${item.used} / ∞` : `${item.used}/${item.limit}`}
                    </span>
                  </div>
                  <div style={{ background: "#1e293b", borderRadius: 99, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, background: dolu ? "#ef4444" : item.renk, height: "100%", borderRadius: 99, transition: "width 0.4s" }} />
                  </div>
                </div>
              );
            })}
            {paketDurum.paket !== "premium" && (
              <div onClick={() => setPaketModal(true)} style={{ marginTop: 12, padding: "10px", background: "linear-gradient(135deg,#f59e0b15,#f59e0b08)", borderRadius: 8, border: "1px solid #f59e0b30", textAlign: "center", cursor: "pointer" }}>
                <div style={{ color: "#f59e0b", fontSize: 12, fontWeight: 700 }}>⬆ Paketi Yükselt</div>
              </div>
            )}
          </div>
        )}

        <div style={{ padding: "0 10px 16px" }}>
          <button onClick={cikisYap}
            style={{ width: "100%", padding: "10px", borderRadius: 10, border: "1px solid #1e293b", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <span>🚪</span> Çıkış Yap
          </button>
        </div>
      </div>

      {/* ── Main ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

        {/* Top bar */}
        <div style={{ padding: "18px 30px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#111827" }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{sayfaBaslik[sayfa]}</h1>
          <div style={{ color: "#475569", fontSize: 13 }}>
            {new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Page content */}
        <div style={{ flex: 1, padding: "28px 30px", overflowY: "auto" }}>

          {/* ── DASHBOARD ── */}
          {sayfa === "anasayfa" && (
            <>
              {/* Stat Cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 28 }}>
                {[
                  { icon: "📅", label: "Bugün Randevu", val: stats?.bugun?.toplam_randevu || 0, renk: "#10b981", bg: "#10b98110" },
                  { icon: "📊", label: "Bu Hafta", val: stats?.hafta?.toplam_randevu || 0, renk: "#3b82f6", bg: "#3b82f610" },
                  { icon: "👥", label: "Toplam Müşteri", val: stats?.toplam_musteri || 0, renk: "#f59e0b", bg: "#f59e0b10" },
                  { icon: "🕐", label: "Bugün Müsait Saat", val: stats?.bugun_musait_saat || 0, renk: "#8b5cf6", bg: "#8b5cf610" },
                ].map(c => (
                  <div key={c.label} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: "20px 22px" }}>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: c.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, marginBottom: 14 }}>{c.icon}</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>{c.label}</div>
                    <div style={{ color: c.renk, fontSize: 30, fontWeight: 800 }}>{c.val}</div>
                  </div>
                ))}
              </div>

              {/* Bugünün randevuları */}
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#cbd5e1" }}>Bugünün Randevuları</h3>
                  <button onClick={() => setSayfa("randevular")}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
                    Tümünü Gör →
                  </button>
                </div>
                {!stats ? (
                  <div style={{ color: "#475569", textAlign: "center", padding: 30 }}>Yükleniyor...</div>
                ) : randevular.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "30px 0" }}>
                    <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
                    <div style={{ color: "#475569", fontSize: 14 }}>Bugün için randevu yok</div>
                  </div>
                ) : randevular.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1e293b" }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 }}>
                      <span style={{ color: "#10b981", fontWeight: 800, fontSize: 15 }}>{r.saat?.slice(0, 5)}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{r.musteri_isim}</div>
                      <div style={{ color: "#64748b", fontSize: 12 }}>{r.hizmet_isim}{r.calisan_isim ? ` · ${r.calisan_isim}` : ""}</div>
                    </div>
                    <span style={{ background: (DR[r.durum] || "#64748b") + "20", color: DR[r.durum] || "#64748b", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                      {DL[r.durum] || r.durum}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* ── RANDEVULAR ── */}
          {sayfa === "randevular" && (
            <>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20 }}>
                <input type="date" value={randevuTarih}
                  onChange={e => { setRandevuTarih(e.target.value); verileriYukle(e.target.value); }}
                  style={{ padding: "9px 14px", borderRadius: 10, border: "1px solid #1e293b", background: "#111827", color: "#fff", fontSize: 14, outline: "none" }} />
                <button onClick={() => verileriYukle()}
                  style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
                  Yenile
                </button>
                <span style={{ color: "#475569", fontSize: 13, marginLeft: 4 }}>{randevular.length} randevu</span>
              </div>

              {randevular.length === 0 ? (
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: "50px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
                  <div style={{ color: "#475569", fontSize: 14 }}>Bu tarih için randevu yok</div>
                </div>
              ) : randevular.map(r => (
                <div key={r.id} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 12, background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ color: "#10b981", fontWeight: 800, fontSize: 16 }}>{r.saat?.slice(0, 5)}</span>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 3 }}>{r.musteri_isim}</div>
                    <div style={{ color: "#64748b", fontSize: 13 }}>
                      📞 {r.musteri_telefon}
                      {r.hizmet_isim && <span style={{ marginLeft: 10 }}>✂️ {r.hizmet_isim}{r.fiyat ? ` · ${r.fiyat}₺` : ""}</span>}
                      {r.calisan_isim && <span style={{ marginLeft: 10 }}>👤 {r.calisan_isim}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {[["onaylandi","✓ Onaylı"], ["tamamlandi","Tamam"], ["gelmedi","Gelmedi"], ["iptal","İptal"]].map(([d, l]) => (
                      <button key={d}
                        onClick={async () => { await api.put(`/randevular/${r.id}/durum`, { durum: d }); verileriYukle(); }}
                        style={{ padding: "6px 10px", borderRadius: 8, border: r.durum === d ? "none" : "1px solid #1e293b",
                          background: r.durum === d ? (DR[d] + "25") : "transparent",
                          color: r.durum === d ? DR[d] : "#475569", fontSize: 11, cursor: "pointer", fontWeight: r.durum === d ? 700 : 400 }}>
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
              <div style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>{musteriler.length} müşteri kayıtlı</div>
              {musteriler.length === 0 ? (
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: "50px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 40, marginBottom: 10 }}>👥</div>
                  <div style={{ color: "#475569" }}>Henüz müşteri yok</div>
                  <div style={{ color: "#334155", fontSize: 13, marginTop: 6 }}>WhatsApp botu üzerinden gelen müşteriler burada görünecek</div>
                </div>
              ) : musteriler.map(m => (
                <div key={m.id} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 14, padding: "14px 18px", marginBottom: 8, display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "#10b98118", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>👤</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.isim || "İsimsiz"}</div>
                    <div style={{ color: "#64748b", fontSize: 12, marginTop: 2 }}>📞 {m.telefon}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#10b981", fontWeight: 700, fontSize: 15 }}>{m.randevu_sayisi}</div>
                    <div style={{ color: "#475569", fontSize: 11 }}>randevu</div>
                    {m.son_randevu && <div style={{ color: "#334155", fontSize: 11, marginTop: 2 }}>{new Date(m.son_randevu).toLocaleDateString("tr-TR")}</div>}
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── BOT TEST ── */}
          {sayfa === "bottest" && (
            <div style={{ maxWidth: 680 }}>
              <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#10b98120", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤖</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>WhatsApp Bot</div>
                    <div style={{ color: "#10b981", fontSize: 12 }}>● Çevrimiçi</div>
                  </div>
                  <button onClick={() => setTestCevaplar([])}
                    style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "1px solid #1e293b", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12 }}>
                    Temizle
                  </button>
                </div>
                <div ref={chatRef} style={{ height: 400, padding: "16px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                  {testCevaplar.length === 0 && (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 14 }}>
                      Müşteri gibi mesaj yazarak botu test edin...
                    </div>
                  )}
                  {testCevaplar.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: c.yon === "giden" ? "flex-end" : "flex-start" }}>
                      <div style={{
                        background: c.yon === "giden" ? "#10b981" : "#1e293b",
                        color: "#fff", padding: "10px 14px", borderRadius: c.yon === "giden" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        maxWidth: "72%", fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5
                      }}>{c.mesaj}</div>
                    </div>
                  ))}
                  {testYukleniyor && (
                    <div style={{ display: "flex" }}>
                      <div style={{ background: "#1e293b", color: "#64748b", padding: "10px 14px", borderRadius: "16px 16px 16px 4px", fontSize: 14 }}>
                        <span>●</span><span style={{ margin: "0 3px" }}>●</span><span>●</span>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 16px", borderTop: "1px solid #1e293b", display: "flex", gap: 8 }}>
                  <input value={testMesaj} onChange={e => setTestMesaj(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && !testYukleniyor && botTest()}
                    placeholder="Mesaj yazın..."
                    style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid #1e293b", background: "#0f172a", color: "#fff", fontSize: 14, outline: "none" }} />
                  <button onClick={botTest} disabled={testYukleniyor}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14, opacity: testYukleniyor ? 0.6 : 1 }}>
                    Gönder
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── AYARLAR ── */}
          {sayfa === "ayarlar" && (
            ayarlar ? (
              <div style={{ maxWidth: 600 }}>
                {ayarKaydedildi && (
                  <div style={{ background: "#10b98120", border: "1px solid #10b98140", borderRadius: 10, padding: "10px 16px", marginBottom: 20, color: "#10b981", fontSize: 13, fontWeight: 600 }}>
                    ✓ Ayarlar kaydedildi
                  </div>
                )}
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: 15, color: "#94a3b8", fontWeight: 600 }}>İşletme Bilgileri</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {[
                      { label: "İşletme Adı", key: "isim" },
                      { label: "Adres", key: "adres" },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ color: "#64748b", fontSize: 12, display: "block", marginBottom: 6 }}>{f.label}</label>
                        <input value={ayarlar[f.key] || ""} onChange={e => setAyarlar({...ayarlar, [f.key]: e.target.value})}
                          style={S.input} />
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 20px", fontSize: 15, color: "#94a3b8", fontWeight: 600 }}>Çalışma Saatleri</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div>
                      <label style={{ color: "#64748b", fontSize: 12, display: "block", marginBottom: 6 }}>Açılış Saati</label>
                      <input type="time" value={ayarlar.calisma_baslangic || "09:00"} onChange={e => setAyarlar({...ayarlar, calisma_baslangic: e.target.value})}
                        style={S.input} />
                    </div>
                    <div>
                      <label style={{ color: "#64748b", fontSize: 12, display: "block", marginBottom: 6 }}>Kapanış Saati</label>
                      <input type="time" value={ayarlar.calisma_bitis || "19:00"} onChange={e => setAyarlar({...ayarlar, calisma_bitis: e.target.value})}
                        style={S.input} />
                    </div>
                  </div>
                </div>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 28, marginBottom: 20 }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 15, color: "#94a3b8", fontWeight: 600 }}>🍽️ Mola / Kapalı Saatler</h3>
                  <div style={{ color: "#334155", fontSize: 12, marginBottom: 16 }}>Bu saatlerde randevu alınamaz (yemek arası, özel işler, vs.)</div>
                  {(ayarlar.mola_saatleri || []).map((mola, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                      <input value={mola.isim || ""} placeholder="Açıklama (ör: Yemek Arası)" onChange={e => {
                        const yeni = [...(ayarlar.mola_saatleri || [])];
                        yeni[idx] = { ...yeni[idx], isim: e.target.value };
                        setAyarlar({...ayarlar, mola_saatleri: yeni});
                      }} style={{ ...S.input, flex: 1 }} />
                      <input type="time" value={mola.baslangic || ""} onChange={e => {
                        const yeni = [...(ayarlar.mola_saatleri || [])];
                        yeni[idx] = { ...yeni[idx], baslangic: e.target.value };
                        setAyarlar({...ayarlar, mola_saatleri: yeni});
                      }} style={{ ...S.input, width: 120 }} />
                      <span style={{ color: "#475569", fontSize: 13 }}>—</span>
                      <input type="time" value={mola.bitis || ""} onChange={e => {
                        const yeni = [...(ayarlar.mola_saatleri || [])];
                        yeni[idx] = { ...yeni[idx], bitis: e.target.value };
                        setAyarlar({...ayarlar, mola_saatleri: yeni});
                      }} style={{ ...S.input, width: 120 }} />
                      <button onClick={() => {
                        const yeni = (ayarlar.mola_saatleri || []).filter((_, i) => i !== idx);
                        setAyarlar({...ayarlar, mola_saatleri: yeni});
                      }} style={{ background: "#ef444422", border: "1px solid #ef444440", borderRadius: 8, color: "#ef4444", cursor: "pointer", padding: "8px 12px", fontSize: 13, fontWeight: 600 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={() => {
                    const yeni = [...(ayarlar.mola_saatleri || []), { isim: "", baslangic: "12:00", bitis: "13:00" }];
                    setAyarlar({...ayarlar, mola_saatleri: yeni});
                  }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px dashed #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600, width: "100%" }}>
                    + Mola Ekle
                  </button>
                </div>
                <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, padding: 28, marginBottom: 24 }}>
                  <h3 style={{ margin: "0 0 16px", fontSize: 15, color: "#94a3b8", fontWeight: 600 }}>Kapalı Günler</h3>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[["0","Pazar"],["1","Pazartesi"],["2","Salı"],["3","Çarşamba"],["4","Perşembe"],["5","Cuma"],["6","Cumartesi"]].map(([v, l]) => {
                      const kapalilar = String(ayarlar.kapali_gunler || "").split(",").map(s => s.trim()).filter(Boolean);
                      const kapali = kapalilar.includes(v);
                      return (
                        <button key={v} onClick={() => {
                          const yeni = kapali ? kapalilar.filter(k => k !== v) : [...kapalilar, v];
                          setAyarlar({...ayarlar, kapali_gunler: yeni.join(",")});
                        }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                          background: kapali ? "#ef444422" : "#0f172a", color: kapali ? "#ef4444" : "#64748b",
                          outline: kapali ? "2px solid #ef444440" : "1px solid #1e293b" }}>
                          {l}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ color: "#334155", fontSize: 12, marginTop: 10 }}>Seçilen günlerde randevu alınamaz</div>
                </div>
                <button onClick={async () => {
                  await api.put("/ayarlar", ayarlar);
                  setAyarKaydedildi(true);
                  setTimeout(() => setAyarKaydedildi(false), 3000);
                }} style={{ padding: "13px 32px", borderRadius: 12, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }}>
                  Kaydet
                </button>
              </div>
            ) : (
              <div style={{ color: "#475569", display: "flex", alignItems: "center", gap: 10, padding: 40 }}>
                <span>⏳</span> Yükleniyor...
              </div>
            )
          )}

        </div>
      </div>

      {/* Paket Karşılaştırma Modal */}
      {paketModal && (
        <div onClick={() => setPaketModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#1e293b", borderRadius: 20, padding: "32px", maxWidth: 800, width: "90%", maxHeight: "85vh", overflowY: "auto", border: "1px solid #334155" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <h2 style={{ margin: 0, fontSize: 22, color: "#f1f5f9" }}>Paketler</h2>
              <button onClick={() => setPaketModal(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 22, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {[
                { key: "baslangic", isim: "Başlangıç", fiyat: 299, renk: "#64748b", ozellikler: ["1 çalışan", "5 hizmete kadar", "Aylık 100 randevu", "WhatsApp / Telegram bot", "Temel destek"] },
                { key: "profesyonel", isim: "Profesyonel", fiyat: 599, renk: "#3b82f6", ozellikler: ["5 çalışana kadar", "20 hizmete kadar", "Aylık 500 randevu", "WhatsApp / Telegram bot", "Randevu hatırlatmaları", "Öncelikli destek"] },
                { key: "premium", isim: "Premium", fiyat: 999, renk: "#f59e0b", ozellikler: ["Sınırsız çalışan", "Sınırsız hizmet", "Sınırsız randevu", "WhatsApp / Telegram bot", "Randevu hatırlatmaları", "Gelişmiş istatistikler", "7/24 VIP destek"] },
              ].map(p => {
                const aktif = paketDurum?.paket === p.key;
                return (
                  <div key={p.key} style={{ background: aktif ? `${p.renk}10` : "#0f172a", border: `2px solid ${aktif ? p.renk : "#334155"}`, borderRadius: 16, padding: "24px 20px", textAlign: "center", position: "relative" }}>
                    {aktif && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: p.renk, color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20 }}>MEVCUT</div>}
                    {p.key === "profesyonel" && !aktif && <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#3b82f6", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 12px", borderRadius: 20 }}>POPÜLER</div>}
                    <div style={{ fontSize: 18, fontWeight: 700, color: p.renk, marginBottom: 4, marginTop: 8 }}>{p.isim}</div>
                    <div style={{ fontSize: 32, fontWeight: 800, color: "#f1f5f9", marginBottom: 4 }}>{p.fiyat}₺<span style={{ fontSize: 14, color: "#64748b", fontWeight: 400 }}>/ay</span></div>
                    <div style={{ borderTop: "1px solid #334155", margin: "16px 0", paddingTop: 16, textAlign: "left" }}>
                      {p.ozellikler.map((o, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 13, color: "#cbd5e1" }}>
                          <span style={{ color: p.renk }}>✓</span> {o}
                        </div>
                      ))}
                    </div>
                    {!aktif && (
                      <button style={{ width: "100%", padding: 12, borderRadius: 10, border: "none", background: p.renk, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", marginTop: 8 }}>
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
    const d = await api.get(`/admin/avci/liste?durum=${avciFiltre}&siralama=${avciSiralama}&limit=100`);
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
  }, [sayfa, avciFiltre, avciSiralama]);

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

  const cikisYap = () => { localStorage.removeItem("randevugo_token"); api.token = null; window.location.reload(); };

  const menuItems = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "isletmeler", icon: "🏪", label: "İşletmeler" },
    { id: "odemeler", icon: "💰", label: "Ödemeler" },
    { id: "avci", icon: "🎯", label: "Avcı Bot" },
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
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#1e293b", padding: "24px 0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0 20px", marginBottom: 4 }}>
          <h2 style={{ color: "#fff", margin: 0, fontSize: 20 }}>📅 RandevuGO</h2>
          <span style={{ background: "#f59e0b22", color: "#f59e0b", fontSize: 11, padding: "2px 8px", borderRadius: 6, fontWeight: 700, marginTop: 4, display: "inline-block" }}>SÜPER ADMİN</span>
        </div>
        <p style={{ color: "#475569", fontSize: 11, padding: "4px 20px 20px", wordBreak: "break-all" }}>{kullanici.email}</p>
        <div style={{ flex: 1 }}>
          {menuItems.map(m => (
            <div key={m.id} onClick={() => setSayfa(m.id)}
              style={{ padding: "12px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                background: sayfa === m.id ? "rgba(245,158,11,0.12)" : "transparent",
                borderLeft: sayfa === m.id ? "3px solid #f59e0b" : "3px solid transparent",
                color: sayfa === m.id ? "#f59e0b" : "#94a3b8", fontSize: 14 }}>
              <span>{m.icon}</span> {m.label}
              {m.id === "odemeler" && buAyOdemeyenler.length > 0 && (
                <span style={{ marginLeft: "auto", background: "#ef4444", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 7px", fontWeight: 700 }}>{buAyOdemeyenler.length}</span>
              )}
            </div>
          ))}
        </div>
        <div style={{ padding: "0 12px" }}>
          <button onClick={cikisYap} style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
            🚪 Çıkış Yap
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, padding: 30, overflowY: "auto" }}>

        {/* DASHBOARD */}
        {sayfa === "dashboard" && (
          <>
            <h1 style={{ color: "#fff", fontSize: 24, marginBottom: 24 }}>Dashboard</h1>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 30 }}>
              <StatCard icon="🏪" baslik="Toplam İşletme" deger={isletmeler.length} renk="#f59e0b" />
              <StatCard icon="✅" baslik="Aktif İşletme" deger={isletmeler.filter(i => i.aktif).length} renk="#10b981" />
              <StatCard icon="💰" baslik="Toplam Gelir" deger={toplamGelir.toFixed(0) + " ₺"} renk="#8b5cf6" />
              <StatCard icon="📅" baslik="Bu Ay Gelir" deger={buAyGelir.toFixed(0) + " ₺"} renk="#3b82f6" />
            </div>

            {/* Bu ay ödeme durumu */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              <div style={{ background: "#1e293b", borderRadius: 16, padding: 20 }}>
                <h3 style={{ color: "#10b981", fontSize: 15, marginBottom: 12 }}>✅ Bu Ay Ödeyen ({buAyOdeyenler.length})</h3>
                {buAyOdeyenler.length === 0
                  ? <p style={{ color: "#475569", fontSize: 13 }}>Henüz ödeme yok.</p>
                  : buAyOdeyenler.map(o => (
                    <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                      <span style={{ color: "#fff", fontSize: 13 }}>{o.isletme_isim}</span>
                      <span style={{ color: "#10b981", fontWeight: 700, fontSize: 13 }}>{o.tutar} ₺</span>
                    </div>
                  ))}
              </div>
              <div style={{ background: "#1e293b", borderRadius: 16, padding: 20 }}>
                <h3 style={{ color: "#ef4444", fontSize: 15, marginBottom: 12 }}>⏳ Bu Ay Ödemeyenler ({buAyOdemeyenler.length})</h3>
                {buAyOdemeyenler.length === 0
                  ? <p style={{ color: "#475569", fontSize: 13 }}>Herkes ödedi 🎉</p>
                  : buAyOdemeyenler.map(i => (
                    <div key={i.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #0f172a" }}>
                      <span style={{ color: "#fff", fontSize: 13 }}>{i.isim}</span>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{paketFiyat[i.paket] || "?"} ₺</span>
                    </div>
                  ))}
              </div>
            </div>

            {/* Son işletmeler */}
            <div style={{ background: "#1e293b", borderRadius: 16, padding: 20 }}>
              <h3 style={{ color: "#cbd5e1", fontSize: 15, marginBottom: 12 }}>Son Kayıt İşletmeler</h3>
              {isletmeler.slice(-5).reverse().map(i => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #0f172a" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: i.aktif ? "#10b981" : "#ef4444" }} />
                    <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{i.isim}</span>
                    <span style={{ background: (kategoriRenk[i.kategori] || "#64748b") + "22", color: kategoriRenk[i.kategori] || "#64748b", padding: "1px 8px", borderRadius: 20, fontSize: 11 }}>{i.kategori}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#94a3b8", fontSize: 12 }}>📅 {i.toplam_randevu || 0}</span>
                    <span style={{ background: (paketRenk[i.paket] || "#64748b") + "22", color: paketRenk[i.paket] || "#64748b", padding: "1px 8px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{i.paket}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* İŞLETMELER */}
        {sayfa === "isletmeler" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h1 style={{ color: "#fff", fontSize: 24, margin: 0 }}>İşletmeler ({isletmeler.length})</h1>
              <button onClick={() => setFormAcik(!formAcik)}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#f59e0b", color: "#000", cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                + Yeni İşletme Ekle
              </button>
            </div>

            {/* Filtre */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {[["hepsi","Hepsi"], ["aktif","Aktif"], ["pasif","Pasif"]].map(([v, l]) => (
                <button key={v} onClick={() => setIsletmeFiltre(v)}
                  style={{ padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: isletmeFiltre === v ? "#f59e0b" : "#1e293b", color: isletmeFiltre === v ? "#000" : "#94a3b8" }}>
                  {l} {v === "hepsi" ? isletmeler.length : v === "aktif" ? isletmeler.filter(i=>i.aktif).length : isletmeler.filter(i=>!i.aktif).length}
                </button>
              ))}
            </div>

            {/* Yeni İşletme Formu */}
            {formAcik && (
              <form onSubmit={isletmeEkle} style={{ background: "#1e293b", borderRadius: 16, padding: 24, marginBottom: 20, border: "1px solid #f59e0b44" }}>
                <h3 style={{ color: "#f59e0b", marginBottom: 16, fontSize: 16 }}>Yeni İşletme Kaydı</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { key: "isim", label: "İşletme Adı *", ph: "Berber Ali" },
                    { key: "telefon", label: "Telefon *", ph: "05551234567" },
                    { key: "adres", label: "Adres", ph: "Bağcılar Cad. No:1" },
                    { key: "ilce", label: "İlçe", ph: "Bağcılar" },
                    { key: "email", label: "Giriş Email *", ph: "ali@berber.com" },
                    { key: "sifre", label: "Şifre *", ph: "En az 6 karakter" },
                  ].map(f => (
                    <div key={f.key}>
                      <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>{f.label}</label>
                      <input type={f.key === "sifre" ? "password" : "text"} placeholder={f.ph} required={["isim","telefon","email","sifre"].includes(f.key)}
                        value={yeniIsletme[f.key]} onChange={e => setYeniIsletme({ ...yeniIsletme, [f.key]: e.target.value })}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Kategori</label>
                    <select value={yeniIsletme.kategori} onChange={e => setYeniIsletme({ ...yeniIsletme, kategori: e.target.value })}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }}>
                      {["berber","kuafor","disci","guzellik","veteriner","diyetisyen","masaj","spa"].map(k => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="submit" style={{ padding: "10px 28px", borderRadius: 8, border: "none", background: "#f59e0b", color: "#000", cursor: "pointer", fontWeight: 700 }}>Kaydet ve Oluştur</button>
                  <button type="button" onClick={() => setFormAcik(false)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>İptal</button>
                </div>
              </form>
            )}

            {yukleniyor ? <div style={{ color: "#64748b" }}>Yükleniyor...</div> : filtreliIsletmeler.map(i => (
              <div key={i.id} style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 10, border: i.aktif ? "1px solid #1e293b" : "1px solid #ef444433" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: i.aktif ? "#10b981" : "#ef4444", flexShrink: 0 }} />
                      <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{i.isim}</span>
                      <span style={{ background: (kategoriRenk[i.kategori] || "#64748b") + "22", color: kategoriRenk[i.kategori] || "#64748b", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{i.kategori}</span>
                      <span style={{ color: "#94a3b8", fontSize: 12 }}>📅 {i.toplam_randevu || 0} randevu</span>
                    </div>
                    <div style={{ color: "#64748b", fontSize: 13, marginBottom: 12 }}>
                      📍 {i.adres || "—"}{i.ilce ? ` · ${i.ilce}` : ""}  ·  📞 {i.telefon}
                    </div>
                    {/* Paket seçimi */}
                    <div style={{ display: "flex", gap: 6 }}>
                      {["baslangic","profesyonel","premium"].map(p => (
                        <button key={p} onClick={() => paketDegistir(i.id, p)}
                          style={{ padding: "4px 12px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s",
                            background: i.paket === p ? paketRenk[p] : "#0f172a",
                            color: i.paket === p ? "#fff" : "#64748b",
                            outline: i.paket === p ? `2px solid ${paketRenk[p]}` : "none" }}>
                          {p} {p === "baslangic" ? "299₺" : p === "profesyonel" ? "599₺" : "999₺"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                    <button onClick={() => aktifToggle(i)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700,
                        background: i.aktif ? "#10b98122" : "#f59e0b22",
                        color: i.aktif ? "#10b981" : "#f59e0b" }}>
                      {i.aktif ? "✓ Aktif" : "⏸ Pasif"}
                    </button>
                    <button onClick={() => isletmeSil(i.id, i.isim)}
                      style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#ef444422", color: "#ef4444", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      Sil
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ÖDEMELER */}
        {sayfa === "odemeler" && (
          <>
            {/* Özet kartları */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard icon="💰" baslik="Toplam Gelir" deger={toplamGelir.toFixed(0) + " ₺"} renk="#10b981" />
              <StatCard icon="📅" baslik="Bu Ay Gelir" deger={buAyGelir.toFixed(0) + " ₺"} renk="#3b82f6" />
              <StatCard icon="✅" baslik="Bu Ay Ödeyen" deger={buAyOdeyenler.length} renk="#8b5cf6" />
              <StatCard icon="⏳" baslik="Bu Ay Ödemeyenler" deger={buAyOdemeyenler.length} renk="#ef4444" />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {[["hepsi","Tümü"],["buay","Bu Ay"],["bekliyor","Bekliyor"],["odendi","Ödendi"],["gecikti","Gecikti"]].map(([v,l]) => (
                  <button key={v} onClick={() => setOdemeFiltre(v)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                      background: odemeFiltre === v ? "#f59e0b" : "#1e293b", color: odemeFiltre === v ? "#000" : "#94a3b8" }}>
                    {l}
                  </button>
                ))}
              </div>
              <button onClick={() => setOdemeFormAcik(!odemeFormAcik)}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                + Ödeme Kaydı Ekle
              </button>
            </div>

            {/* Ödeme ekleme formu */}
            {odemeFormAcik && (
              <form onSubmit={odemeEkle} style={{ background: "#1e293b", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #10b98144", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>İşletme</label>
                  <select value={yeniOdeme.isletme_id} onChange={e => setYeniOdeme({...yeniOdeme, isletme_id: e.target.value})} required
                    style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }}>
                    <option value="">Seç...</option>
                    {isletmeler.map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Tutar (₺)</label>
                  <input type="number" placeholder="299" value={yeniOdeme.tutar} onChange={e => setYeniOdeme({...yeniOdeme, tutar: e.target.value})} required
                    style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none", width: 100 }} />
                </div>
                <div>
                  <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Dönem</label>
                  <input type="month" value={yeniOdeme.donem} onChange={e => setYeniOdeme({...yeniOdeme, donem: e.target.value})}
                    style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }} />
                </div>
                <button type="submit" style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700 }}>Kaydet</button>
                <button type="button" onClick={() => setOdemeFormAcik(false)} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer" }}>İptal</button>
              </form>
            )}

            {/* Bu ay ödemeyenler uyarı bölümü */}
            {buAyOdemeyenler.length > 0 && odemeFiltre === "hepsi" && (
              <div style={{ background: "#ef444411", border: "1px solid #ef444433", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ color: "#ef4444", fontSize: 16 }}>⚠️</span>
                  <span style={{ color: "#ef4444", fontWeight: 700, fontSize: 14 }}>Bu ay henüz ödeme yapmayan {buAyOdemeyenler.length} işletme var</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {buAyOdemeyenler.map(i => (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{i.isim}</span>
                        <span style={{ background: (paketRenk[i.paket] || "#64748b") + "22", color: paketRenk[i.paket] || "#64748b", padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{i.paket}</span>
                        <span style={{ color: "#64748b", fontSize: 12 }}>{paketFiyat[i.paket] || "?"} ₺</span>
                      </div>
                      <button
                        onClick={async () => {
                          await api.post("/admin/odemeler", { isletme_id: i.id, tutar: paketFiyat[i.paket] || 299, donem: buAy, durum: "bekliyor" });
                          odemeleriYukle();
                          isletmeleriYukle();
                        }}
                        style={{ padding: "5px 14px", borderRadius: 8, border: "none", background: "#f59e0b22", color: "#f59e0b", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                        + Bekliyor Oluştur
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ödeme listesi */}
            {yukleniyor ? <div style={{ color: "#64748b" }}>Yükleniyor...</div> :
              filtreliOdemeler.length === 0 ? (
                <div style={{ background: "#1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
                  <p style={{ color: "#64748b", margin: 0 }}>Kayıt bulunamadı.</p>
                </div>
              ) : filtreliOdemeler.map(o => (
                <div key={o.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>{o.isletme_isim}</span>
                    <span style={{ color: "#64748b", marginLeft: 12, fontSize: 13 }}>📅 {o.donem}</span>
                    <span style={{ color: "#10b981", marginLeft: 12, fontWeight: 700, fontSize: 15 }}>{o.tutar} ₺</span>
                    {o.odeme_tarihi && <span style={{ color: "#475569", marginLeft: 12, fontSize: 12 }}>· {new Date(o.odeme_tarihi).toLocaleDateString("tr-TR")}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ background: (odemeRenk[o.durum] || "#64748b") + "22", color: odemeRenk[o.durum] || "#64748b", padding: "4px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                      {odemeLabel[o.durum] || o.durum}
                    </span>
                    {o.durum === "bekliyor" && (
                      <>
                        <button onClick={() => odemeGuncelle(o.id, "odendi")}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#10b98122", color: "#10b981", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          ✓ Havale Geldi
                        </button>
                        <button onClick={() => odemeGuncelle(o.id, "gecikti")}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#ef444422", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>
                          Gecikti
                        </button>
                      </>
                    )}
                    {o.durum === "gecikti" && (
                      <button onClick={() => odemeGuncelle(o.id, "odendi")}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "none", background: "#10b98122", color: "#10b981", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                        ✓ Havale Geldi
                      </button>
                    )}
                    {o.durum === "odendi" && (
                      <button onClick={() => odemeGuncelle(o.id, "bekliyor")}
                        style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 11 }}>
                        Geri Al
                      </button>
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
            <h1 style={{ color: "#fff", fontSize: 24, marginBottom: 8 }}>🎯 Avcı Bot — Potansiyel Müşteriler</h1>
            <p style={{ color: "#475569", fontSize: 13, marginBottom: 24 }}>Google Maps'ten işletmeleri bul, skorla, ara ve müşteri yap.</p>

            {/* Stats */}
            {avciStats && (
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
                <StatCard icon="📍" baslik="Toplam Lead" deger={avciStats.toplam} renk="#f59e0b" />
                <StatCard icon="🆕" baslik="Yeni" deger={avciStats.yeni} renk="#3b82f6" />
                <StatCard icon="📞" baslik="Arandı" deger={avciStats.arandi} renk="#8b5cf6" />
                <StatCard icon="🤝" baslik="İlgileniyor" deger={avciStats.ilgileniyor} renk="#10b981" />
                <StatCard icon="✅" baslik="Müşteri Oldu" deger={avciStats.musteri_oldu} renk="#10b981" />
              </div>
            )}

            {/* Tarama + Tab butonları */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAvciTab("gunluk")}
                  style={{ padding: "8px 18px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: avciTab === "gunluk" ? "#f59e0b" : "#1e293b", color: avciTab === "gunluk" ? "#000" : "#94a3b8" }}>
                  📞 Bugün Ara ({avciGunluk.length})
                </button>
                <button onClick={() => setAvciTab("liste")}
                  style={{ padding: "8px 18px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                    background: avciTab === "liste" ? "#f59e0b" : "#1e293b", color: avciTab === "liste" ? "#000" : "#94a3b8" }}>
                  📋 Tüm Liste ({avciListe.length})
                </button>
              </div>
              <button onClick={() => setAvciTaramaAcik(!avciTaramaAcik)}
                style={{ padding: "8px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                🔍 Yeni Tarama Yap
              </button>
            </div>

            {/* Tarama formu */}
            {avciTaramaAcik && (
              <div style={{ background: "#1e293b", borderRadius: 16, padding: 24, marginBottom: 20, border: "1px solid #10b98144" }}>
                <h3 style={{ color: "#10b981", fontSize: 15, marginBottom: 16 }}>🔍 Google Maps Tarama</h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Şehir *</label>
                    <input value={avciTarama.sehir} onChange={e => setAvciTarama({...avciTarama, sehir: e.target.value})}
                      style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none", width: 140 }} />
                  </div>
                  <div>
                    <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>İlçe (opsiyonel)</label>
                    <input value={avciTarama.ilce} onChange={e => setAvciTarama({...avciTarama, ilce: e.target.value})} placeholder="ör: Kadıköy"
                      style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none", width: 140 }} />
                  </div>
                  <div>
                    <label style={{ color: "#94a3b8", fontSize: 12, display: "block", marginBottom: 4 }}>Kategori *</label>
                    <select value={avciTarama.kategori} onChange={e => setAvciTarama({...avciTarama, kategori: e.target.value})}
                      style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }}>
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
                  }} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: avciTaramaYukleniyor ? "#334155" : "#10b981", color: "#fff", cursor: avciTaramaYukleniyor ? "wait" : "pointer", fontWeight: 700 }}>
                    {avciTaramaYukleniyor ? "⏳ Taranıyor..." : "🚀 Tara"}
                  </button>
                </div>
                {avciTaramaSonuc && (
                  <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: avciTaramaSonuc.hata ? "#ef444420" : "#10b98120", color: avciTaramaSonuc.hata ? "#ef4444" : "#10b981", fontSize: 13 }}>
                    {avciTaramaSonuc.hata
                      ? `❌ ${avciTaramaSonuc.hata}`
                      : `✅ "${avciTaramaSonuc.arama_metni}" — ${avciTaramaSonuc.toplam_bulunan} bulundu, ${avciTaramaSonuc.yeni_eklenen} yeni eklendi, ${avciTaramaSonuc.zaten_var} zaten vardı`
                    }
                  </div>
                )}
              </div>
            )}

            {/* GÜNLÜK ARAMA LİSTESİ */}
            {avciTab === "gunluk" && (
              <>
                <div style={{ background: "#f59e0b11", border: "1px solid #f59e0b33", borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>📞</span>
                    <span style={{ color: "#f59e0b", fontWeight: 700, fontSize: 16 }}>Bugün Aranacak {avciGunluk.length} İşletme</span>
                  </div>
                  <p style={{ color: "#94a3b8", fontSize: 12, margin: 0 }}>En yüksek skorlu, telefonu olan, henüz aranmamış veya tekrar aranacak işletmeler</p>
                </div>
                {avciGunluk.length === 0 ? (
                  <div style={{ background: "#1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
                    <p style={{ color: "#64748b", margin: 0 }}>Bugün aranacak kimse yok. Yeni tarama yap! 🔍</p>
                  </div>
                ) : avciGunluk.map((m, idx) => (
                  <div key={m.id} style={{ background: "#1e293b", borderRadius: 12, padding: 18, marginBottom: 10, border: "1px solid #1e293b" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
                          <span style={{ background: "#f59e0b", color: "#000", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</span>
                          <span style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>{m.isletme_adi}</span>
                          <span style={{ background: "#3b82f622", color: "#3b82f6", padding: "2px 10px", borderRadius: 20, fontSize: 11 }}>{m.kategori}</span>
                          <span style={{ background: "#f59e0b22", color: "#f59e0b", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>Skor: {m.skor}</span>
                        </div>
                        <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 6 }}>
                          {m.telefon && <span>📞 <strong style={{ color: "#fff" }}>{m.telefon}</strong></span>}
                          {m.adres && <span style={{ marginLeft: 12 }}>📍 {m.adres}</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 11 }}>
                          {!m.web_sitesi && <span style={{ background: "#10b98122", color: "#10b981", padding: "2px 8px", borderRadius: 10 }}>🌐 Web sitesi yok</span>}
                          {m.puan && <span style={{ background: "#f59e0b22", color: "#f59e0b", padding: "2px 8px", borderRadius: 10 }}>⭐ {m.puan}</span>}
                          <span style={{ background: "#8b5cf622", color: "#8b5cf6", padding: "2px 8px", borderRadius: 10 }}>💬 {m.yorum_sayisi} yorum</span>
                          {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ background: "#3b82f622", color: "#3b82f6", padding: "2px 8px", borderRadius: 10, textDecoration: "none" }}>🗺️ Maps</a>}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={async () => {
                          await api.put(`/admin/avci/${m.id}`, { durum: "arandi" });
                          avciGunlukYukle(); avciStatsYukle(); avciListeYukle();
                        }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#8b5cf622", color: "#8b5cf6", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          📞 Arandı
                        </button>
                        <button onClick={async () => {
                          await api.put(`/admin/avci/${m.id}`, { durum: "ilgileniyor" });
                          avciGunlukYukle(); avciStatsYukle(); avciListeYukle();
                        }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#10b98122", color: "#10b981", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                          🤝 İlgileniyor
                        </button>
                        <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)}
                          style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 12 }}>
                          📝 Not
                        </button>
                      </div>
                    </div>
                    {/* Not alanı */}
                    {avciSecili === m.id && (
                      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                        <input id={`not_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..."
                          style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }} />
                        <button onClick={async () => {
                          const notInput = document.getElementById(`not_${m.id}`);
                          await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value });
                          setAvciSecili(null);
                          avciListeYukle(); avciGunlukYukle();
                        }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Kaydet</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* TÜM LİSTE */}
            {avciTab === "liste" && (
              <>
                {/* Filtreler */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  {[["hepsi","Tümü"],["yeni","Yeni"],["arandi","Arandı"],["ilgileniyor","İlgileniyor"],["ilgilenmiyor","İlgilenmiyor"],["demo_yapildi","Demo"],["musteri_oldu","Müşteri ✓"]].map(([v,l]) => (
                    <button key={v} onClick={() => setAvciFiltre(v)}
                      style={{ padding: "5px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                        background: avciFiltre === v ? "#f59e0b" : "#1e293b", color: avciFiltre === v ? "#000" : "#94a3b8" }}>
                      {l}
                    </button>
                  ))}
                  <select value={avciSiralama} onChange={e => setAvciSiralama(e.target.value)}
                    style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#94a3b8", fontSize: 12, outline: "none" }}>
                    <option value="skor_desc">Skor ↓</option>
                    <option value="puan_desc">Puan ↓</option>
                    <option value="yorum_desc">Yorum ↓</option>
                    <option value="yeni">En Yeni</option>
                  </select>
                </div>

                {avciListe.length === 0 ? (
                  <div style={{ background: "#1e293b", borderRadius: 12, padding: 40, textAlign: "center" }}>
                    <p style={{ color: "#64748b", margin: 0 }}>Henüz potansiyel müşteri yok. Tarama yap! 🔍</p>
                  </div>
                ) : avciListe.map(m => {
                  const durumRenk = { yeni: "#3b82f6", arandi: "#8b5cf6", ilgileniyor: "#10b981", ilgilenmiyor: "#ef4444", demo_yapildi: "#f59e0b", musteri_oldu: "#10b981" };
                  const durumLabel = { yeni: "Yeni", arandi: "Arandı", ilgileniyor: "İlgileniyor", ilgilenmiyor: "İlgilenmiyor", demo_yapildi: "Demo Yapıldı", musteri_oldu: "Müşteri ✓" };
                  return (
                    <div key={m.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, borderLeft: `3px solid ${durumRenk[m.durum] || "#334155"}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                            <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{m.isletme_adi}</span>
                            <span style={{ background: (durumRenk[m.durum] || "#64748b") + "22", color: durumRenk[m.durum] || "#64748b", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{durumLabel[m.durum] || m.durum}</span>
                            <span style={{ background: "#f59e0b22", color: "#f59e0b", padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700 }}>Skor: {m.skor}</span>
                            {m.puan && <span style={{ color: "#f59e0b", fontSize: 12 }}>⭐ {m.puan}</span>}
                            <span style={{ color: "#64748b", fontSize: 11 }}>💬 {m.yorum_sayisi}</span>
                          </div>
                          <div style={{ color: "#64748b", fontSize: 12, marginBottom: 4 }}>
                            {m.telefon && <span>📞 {m.telefon}</span>}
                            {m.kategori && <span style={{ marginLeft: 10 }}>🏷️ {m.kategori}</span>}
                            {m.ilce && <span style={{ marginLeft: 10 }}>📍 {m.ilce}</span>}
                            {!m.web_sitesi && <span style={{ marginLeft: 10, color: "#10b981" }}>🌐 Web yok</span>}
                            {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ marginLeft: 10, color: "#3b82f6", textDecoration: "none", fontSize: 11 }}>🗺️ Maps</a>}
                          </div>
                          {m.notlar && <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>📝 {m.notlar}</div>}
                        </div>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "wrap" }}>
                          {["yeni","arandi","ilgileniyor","ilgilenmiyor","demo_yapildi","musteri_oldu"].filter(d => d !== m.durum).slice(0,3).map(d => (
                            <button key={d} onClick={async () => {
                              await api.put(`/admin/avci/${m.id}`, { durum: d });
                              avciListeYukle(); avciStatsYukle(); avciGunlukYukle();
                            }} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: (durumRenk[d] || "#64748b") + "22", color: durumRenk[d] || "#64748b", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
                              {durumLabel[d]}
                            </button>
                          ))}
                          <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)}
                            style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #334155", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 11 }}>📝</button>
                          <button onClick={async () => {
                            if (!confirm(`"${m.isletme_adi}" silinsin mi?`)) return;
                            await api.del(`/admin/avci/${m.id}`);
                            avciListeYukle(); avciStatsYukle();
                          }} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#ef444422", color: "#ef4444", cursor: "pointer", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      {avciSecili === m.id && (
                        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                          <input id={`not2_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..."
                            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 13, outline: "none" }} />
                          <button onClick={async () => {
                            const notInput = document.getElementById(`not2_${m.id}`);
                            await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value });
                            setAvciSecili(null); avciListeYukle();
                          }} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Kaydet</button>
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
