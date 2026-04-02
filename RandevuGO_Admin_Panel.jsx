import { useState, useEffect, useCallback } from "react";

const API_URL = "http://localhost:3000/api";

// ==================== API SERVICE ====================
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
    if (res.status === 401) { this.token = null; localStorage.removeItem("randevugo_token"); window.location.reload(); }
    return res.json();
  },
  
  get: (e) => api.fetch(e),
  post: (e, d) => api.fetch(e, { method: "POST", body: JSON.stringify(d) }),
  put: (e, d) => api.fetch(e, { method: "PUT", body: JSON.stringify(d) }),
  del: (e) => api.fetch(e, { method: "DELETE" }),
};

// ==================== LOGIN ====================
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
          <div style={{ fontSize: 40, marginBottom: 8 }}>📅</div>
          <h1 style={{ color: "#fff", fontSize: 28, margin: 0 }}>RandevuGO</h1>
          <p style={{ color: "#64748b", fontSize: 14, marginTop: 4 }}>İşletme Yönetim Paneli</p>
        </div>
        <form onSubmit={giris}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: "14px 16px", marginBottom: 12, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          <input type="password" placeholder="Şifre" value={sifre} onChange={(e) => setSifre(e.target.value)}
            style={{ width: "100%", padding: "14px 16px", marginBottom: 16, borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none" }} />
          {hata && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{hata}</p>}
          <button type="submit" disabled={yukleniyor}
            style={{ width: "100%", padding: 14, borderRadius: 10, border: "none", background: "#10b981", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", opacity: yukleniyor ? 0.7 : 1 }}>
            {yukleniyor ? "Giriş yapılıyor..." : "Giriş Yap"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ==================== STAT CARD ====================
function StatCard({ icon, baslik, deger, renk }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 16, padding: 24, flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 4 }}>{baslik}</div>
      <div style={{ color: renk || "#fff", fontSize: 28, fontWeight: 700 }}>{deger}</div>
    </div>
  );
}

// ==================== DASHBOARD ====================
function Dashboard() {
  const [stats, setStats] = useState(null);
  const [randevular, setRandevular] = useState([]);
  const [sayfa, setSayfa] = useState("anasayfa");
  const [hizmetler, setHizmetler] = useState([]);
  const [musteriler, setMusteriler] = useState([]);
  const [ayarlar, setAyarlar] = useState(null);
  const [testMesaj, setTestMesaj] = useState("");
  const [testCevaplar, setTestCevaplar] = useState([]);
  const [testTelefon, setTestTelefon] = useState("05531112233");

  const bugun = new Date().toISOString().split("T")[0];

  const verileriYukle = useCallback(async () => {
    const [s, r] = await Promise.all([
      api.get("/istatistikler"),
      api.get(`/randevular?tarih=${bugun}`),
    ]);
    setStats(s);
    setRandevular(r.randevular || []);
  }, [bugun]);

  useEffect(() => { verileriYukle(); }, [verileriYukle]);

  const hizmetleriYukle = async () => { const d = await api.get("/hizmetler"); setHizmetler(d.hizmetler || []); };
  const musterileriYukle = async () => { const d = await api.get("/musteriler"); setMusteriler(d.musteriler || []); };
  const ayarlariYukle = async () => { const d = await api.get("/ayarlar"); setAyarlar(d.isletme); };

  useEffect(() => {
    if (sayfa === "hizmetler") hizmetleriYukle();
    if (sayfa === "musteriler") musterileriYukle();
    if (sayfa === "ayarlar") ayarlariYukle();
  }, [sayfa]);

  const durumRenk = { onaylandi: "#10b981", bekliyor: "#f59e0b", iptal: "#ef4444", tamamlandi: "#3b82f6", gelmedi: "#6b7280" };
  const durumLabel = { onaylandi: "Onaylı", bekliyor: "Bekliyor", iptal: "İptal", tamamlandi: "Tamam", gelmedi: "Gelmedi" };

  const botTest = async () => {
    if (!testMesaj.trim()) return;
    setTestCevaplar(prev => [...prev, { yon: "giden", mesaj: testMesaj }]);
    const d = await api.post("/bot/test", { telefon: testTelefon, mesaj: testMesaj });
    if (d.cevaplar) d.cevaplar.forEach(c => setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj: c }]));
    setTestMesaj("");
  };

  const menuItems = [
    { id: "anasayfa", icon: "📊", label: "Dashboard" },
    { id: "randevular", icon: "📅", label: "Randevular" },
    { id: "hizmetler", icon: "✂️", label: "Hizmetler" },
    { id: "musteriler", icon: "👥", label: "Müşteriler" },
    { id: "bottest", icon: "🤖", label: "Bot Test" },
    { id: "ayarlar", icon: "⚙️", label: "Ayarlar" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#0f172a", fontFamily: "'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <div style={{ width: 220, background: "#1e293b", padding: "24px 0", flexShrink: 0 }}>
        <div style={{ padding: "0 20px", marginBottom: 30 }}>
          <h2 style={{ color: "#fff", margin: 0, fontSize: 20 }}>📅 RandevuGO</h2>
        </div>
        {menuItems.map(m => (
          <div key={m.id} onClick={() => { setSayfa(m.id); if (m.id === "randevular") verileriYukle(); }}
            style={{ padding: "12px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
              background: sayfa === m.id ? "rgba(16,185,129,0.1)" : "transparent",
              borderLeft: sayfa === m.id ? "3px solid #10b981" : "3px solid transparent",
              color: sayfa === m.id ? "#10b981" : "#94a3b8", fontSize: 14, transition: "all 0.2s" }}>
            <span>{m.icon}</span> {m.label}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, padding: 30, overflowY: "auto" }}>
        
        {/* ANASAYFA */}
        {sayfa === "anasayfa" && stats && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>Dashboard</h1>
            <div style={{ display: "flex", gap: 16, marginBottom: 30, flexWrap: "wrap" }}>
              <StatCard icon="📅" baslik="Bugün Randevu" deger={stats.bugun?.toplam_randevu || 0} renk="#10b981" />
              <StatCard icon="📊" baslik="Bu Hafta" deger={stats.hafta?.toplam_randevu || 0} renk="#3b82f6" />
              <StatCard icon="👥" baslik="Toplam Müşteri" deger={stats.toplam_musteri || 0} renk="#f59e0b" />
              <StatCard icon="🕐" baslik="Bugün Müsait Saat" deger={stats.bugun_musait_saat || 0} renk="#8b5cf6" />
            </div>
            <h3 style={{ color: "#cbd5e1", marginBottom: 16 }}>Bugünün Randevuları</h3>
            {randevular.length === 0 ? (
              <p style={{ color: "#64748b" }}>Bugün için randevu yok.</p>
            ) : (
              randevular.map(r => (
                <div key={r.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <span style={{ color: "#fff", fontWeight: 600 }}>{r.saat?.slice(0,5)}</span>
                    <span style={{ color: "#94a3b8", marginLeft: 12 }}>{r.musteri_isim}</span>
                    <span style={{ color: "#64748b", marginLeft: 12, fontSize: 13 }}>{r.hizmet_isim}</span>
                  </div>
                  <span style={{ background: durumRenk[r.durum] + "22", color: durumRenk[r.durum], padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                    {durumLabel[r.durum]}
                  </span>
                </div>
              ))
            )}
          </>
        )}

        {/* RANDEVULAR */}
        {sayfa === "randevular" && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>Randevular</h1>
            {randevular.map(r => (
              <div key={r.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "#10b981", fontWeight: 700 }}>{r.saat?.slice(0,5)}</span>
                  <span style={{ color: "#fff", marginLeft: 12, fontWeight: 600 }}>{r.musteri_isim}</span>
                  <span style={{ color: "#94a3b8", marginLeft: 12 }}>{r.musteri_telefon}</span>
                  <span style={{ color: "#64748b", marginLeft: 12, fontSize: 13 }}>{r.hizmet_isim} {r.fiyat ? `- ${r.fiyat} TL` : ""}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {["onaylandi", "tamamlandi", "gelmedi", "iptal"].map(d => (
                    <button key={d} onClick={async () => { await api.put(`/randevular/${r.id}/durum`, { durum: d }); verileriYukle(); }}
                      style={{ padding: "6px 10px", borderRadius: 8, border: "none", background: r.durum === d ? durumRenk[d] : "#334155", 
                        color: r.durum === d ? "#fff" : "#94a3b8", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>
                      {durumLabel[d]}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {/* HİZMETLER */}
        {sayfa === "hizmetler" && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>Hizmetler</h1>
            <button onClick={async () => {
              const isim = prompt("Hizmet adı:");
              if (!isim) return;
              const sure = prompt("Süre (dakika):", "30");
              const fiyat = prompt("Fiyat (TL):", "100");
              await api.post("/hizmetler", { isim, sure_dk: parseInt(sure), fiyat: parseFloat(fiyat) });
              hizmetleriYukle();
            }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", marginBottom: 16, fontWeight: 600 }}>
              + Yeni Hizmet Ekle
            </button>
            {hizmetler.map(h => (
              <div key={h.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{h.isim}</span>
                  <span style={{ color: "#64748b", marginLeft: 12, fontSize: 13 }}>{h.sure_dk} dk</span>
                  <span style={{ color: "#10b981", marginLeft: 12, fontWeight: 600 }}>{h.fiyat} TL</span>
                </div>
                <button onClick={async () => { if (confirm("Silmek istediğinize emin misiniz?")) { await api.del(`/hizmetler/${h.id}`); hizmetleriYukle(); }}}
                  style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "#ef444422", color: "#ef4444", cursor: "pointer", fontSize: 12 }}>Sil</button>
              </div>
            ))}
          </>
        )}

        {/* MÜŞTERİLER */}
        {sayfa === "musteriler" && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>Müşteriler</h1>
            {musteriler.map(m => (
              <div key={m.id} style={{ background: "#1e293b", borderRadius: 12, padding: 16, marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <span style={{ color: "#fff", fontWeight: 600 }}>{m.isim || "İsimsiz"}</span>
                  <span style={{ color: "#94a3b8", marginLeft: 12 }}>{m.telefon}</span>
                </div>
                <div style={{ color: "#64748b", fontSize: 13 }}>
                  {m.randevu_sayisi} randevu
                </div>
              </div>
            ))}
          </>
        )}

        {/* BOT TEST */}
        {sayfa === "bottest" && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>Bot Test</h1>
            <p style={{ color: "#64748b", marginBottom: 16, fontSize: 13 }}>WhatsApp olmadan botu test edin. Müşteri gibi mesaj yazın.</p>
            <div style={{ background: "#1e293b", borderRadius: 16, height: 400, padding: 20, overflowY: "auto", marginBottom: 12 }}>
              {testCevaplar.length === 0 && <p style={{ color: "#475569", textAlign: "center", marginTop: 150 }}>Bir mesaj yazarak botu test edin...</p>}
              {testCevaplar.map((c, i) => (
                <div key={i} style={{ display: "flex", justifyContent: c.yon === "giden" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                  <div style={{ background: c.yon === "giden" ? "#10b981" : "#334155", color: "#fff", padding: "10px 16px", borderRadius: 16, maxWidth: "70%", fontSize: 14, whiteSpace: "pre-wrap" }}>
                    {c.mesaj}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={testMesaj} onChange={(e) => setTestMesaj(e.target.value)} placeholder="Mesaj yazın..."
                onKeyDown={(e) => e.key === "Enter" && botTest()}
                style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, outline: "none" }} />
              <button onClick={botTest} style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Gönder</button>
            </div>
          </>
        )}

        {/* AYARLAR */}
        {sayfa === "ayarlar" && ayarlar && (
          <>
            <h1 style={{ color: "#fff", marginBottom: 24, fontSize: 24 }}>İşletme Ayarları</h1>
            <div style={{ background: "#1e293b", borderRadius: 16, padding: 24, maxWidth: 500 }}>
              {[
                { label: "İşletme Adı", key: "isim" },
                { label: "Adres", key: "adres" },
                { label: "Açılış Saati", key: "calisma_baslangic" },
                { label: "Kapanış Saati", key: "calisma_bitis" },
                { label: "Randevu Süresi (dk)", key: "randevu_suresi_dk" },
                { label: "Kapalı Günler (0=Paz, 6=Cmt)", key: "kapali_gunler" },
              ].map(f => (
                <div key={f.key} style={{ marginBottom: 16 }}>
                  <label style={{ color: "#94a3b8", fontSize: 13, display: "block", marginBottom: 4 }}>{f.label}</label>
                  <input value={ayarlar[f.key] || ""} onChange={(e) => setAyarlar({ ...ayarlar, [f.key]: e.target.value })}
                    style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #334155", background: "#0f172a", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
                </div>
              ))}
              <button onClick={async () => { await api.put("/ayarlar", ayarlar); alert("Kaydedildi!"); }}
                style={{ padding: "12px 24px", borderRadius: 10, border: "none", background: "#10b981", color: "#fff", cursor: "pointer", fontWeight: 600 }}>
                Kaydet
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== MAIN APP ====================
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
  return <Dashboard />;
}
