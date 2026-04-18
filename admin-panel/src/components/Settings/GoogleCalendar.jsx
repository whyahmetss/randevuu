// Google Calendar 2-Way Sync UI
// Bağlan → OAuth popup → callback → success
// Ayarlar: sync on/off, freebusy on/off

import { useEffect, useState, useCallback } from "react";

export default function GoogleCalendar({ api }) {
  const [durum, setDurum] = useState(null); // null: yükleniyor
  const [yukleniyor, setYukleniyor] = useState(false);

  const durumYukle = useCallback(async () => {
    try {
      const d = await api.get("/admin/google-calendar/durum");
      setDurum(d);
    } catch (e) {
      setDurum({ bagli: false, hata: e.message });
    }
  }, [api]);

  useEffect(() => { durumYukle(); }, [durumYukle]);

  // OAuth popup mesajını dinle
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "gcal-connected") {
        setYukleniyor(false);
        setTimeout(durumYukle, 500);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [durumYukle]);

  const bagla = async () => {
    setYukleniyor(true);
    try {
      const d = await api.get("/admin/google-calendar/auth-url");
      if (d?.url) {
        // Popup aç
        const popup = window.open(d.url, "gcal-oauth", "width=600,height=720,left=200,top=100");
        // Popup kapatılırsa durumu kontrol et
        const timer = setInterval(() => {
          if (popup?.closed) {
            clearInterval(timer);
            setYukleniyor(false);
            setTimeout(durumYukle, 500);
          }
        }, 800);
      } else {
        setYukleniyor(false);
        alert("Yetkilendirme URL alınamadı: " + (d?.hata || "bilinmeyen hata"));
      }
    } catch (e) {
      setYukleniyor(false);
      alert("Hata: " + e.message);
    }
  };

  const kes = async () => {
    if (!window.confirm("Google Calendar bağlantısını kesmek istediğinize emin misiniz? Mevcut randevular Google'da kalır ama yeni sync yapılmaz.")) return;
    setYukleniyor(true);
    try {
      await api.post("/admin/google-calendar/disconnect", {});
      await durumYukle();
    } catch (e) {
      alert("Bağlantı kesilemedi: " + e.message);
    }
    setYukleniyor(false);
  };

  const ayarToggle = async (alan) => {
    try {
      await api.put("/admin/google-calendar/ayarlar", { [alan]: !durum[alan] });
      await durumYukle();
    } catch (e) {
      alert("Ayar güncellenemedi: " + e.message);
    }
  };

  if (durum === null) {
    return (
      <div style={{ padding: 20, textAlign: "center", color: "var(--dim)" }}>
        ⏳ Yükleniyor...
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: "22px 24px",
    }}>
      <div className="row gap-10 mb-16" style={{ alignItems: "center" }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: "linear-gradient(135deg, #4285F4 0%, #34A853 50%, #FBBC05 100%)",
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        }}>📅</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>Google Calendar Senkronizasyonu</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
            Randevularınız otomatik Google Takvim'e yazılır. Google'daki özel eventleriniz booking'i otomatik bloke eder.
          </div>
        </div>
      </div>

      {!durum.bagli ? (
        <>
          <div style={{
            background: "rgba(59,130,246,.08)",
            border: "1px solid rgba(59,130,246,.2)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
            fontSize: 13,
            color: "var(--text)",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>🔄 İki yönlü takvim senkronizasyonu</div>
            <div style={{ display: "grid", gap: 6, color: "var(--dim)" }}>
              <div>✅ SıraGO'da randevu açıldığında → Google Takvim'e event olarak eklenir</div>
              <div>✅ Randevu iptal olunca → Google'dan otomatik silinir</div>
              <div>✅ Google'da kendi eventiniz (örn. doktor, öğle yemeği) varsa → o saat online booking'de görünmez</div>
              <div>✅ Randevu ertelenince → Google'da da güncellenir</div>
            </div>
          </div>

          <button
            onClick={bagla}
            disabled={yukleniyor}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 12,
              border: "1px solid #dadce0",
              background: "#fff",
              color: "#3c4043",
              fontSize: 15,
              fontWeight: 600,
              cursor: yukleniyor ? "wait" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,.08)",
              opacity: yukleniyor ? 0.7 : 1,
            }}>
            {yukleniyor ? (
              "⏳ Yönlendiriliyor..."
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
                Google Calendar ile Bağlan
              </>
            )}
          </button>

          <div style={{ fontSize: 11, color: "var(--dim)", textAlign: "center", marginTop: 12 }}>
            Güvenli bağlantı. SıraGO sadece takvim etkinliklerinizi okur/yazar — e-postanıza veya diğer verilere erişemez.
          </div>
        </>
      ) : (
        <>
          <div style={{
            background: "rgba(16,185,129,.08)",
            border: "1px solid rgba(16,185,129,.3)",
            borderRadius: 12,
            padding: "14px 18px",
            marginBottom: 16,
          }}>
            <div className="row gap-10" style={{ alignItems: "center" }}>
              <div style={{ fontSize: 28 }}>✅</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#10b981", fontSize: 14 }}>Google Takvim bağlı</div>
                <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{durum.email}</div>
                {durum.son_senkron && (
                  <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                    Son senkron: {new Date(durum.son_senkron).toLocaleString("tr-TR")}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Ayarlar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <AyarSatiri
              aktif={durum.sync_aktif}
              onToggle={() => ayarToggle("sync_aktif")}
              baslik="Otomatik senkronizasyon"
              aciklama="SıraGO randevularını Google Takvim'e otomatik yaz"
            />
            <AyarSatiri
              aktif={durum.freebusy_kontrol}
              onToggle={() => ayarToggle("freebusy_kontrol")}
              baslik="Google eventlerini dikkate al"
              aciklama="Google'daki özel eventler booking'de otomatik bloke olsun"
            />
          </div>

          <button
            onClick={kes}
            disabled={yukleniyor}
            style={{
              width: "100%",
              padding: "12px 18px",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,.3)",
              background: "rgba(239,68,68,.08)",
              color: "#ef4444",
              fontSize: 13,
              fontWeight: 600,
              cursor: yukleniyor ? "wait" : "pointer",
            }}>
            {yukleniyor ? "⏳ İşleniyor..." : "🔌 Bağlantıyı Kes"}
          </button>
        </>
      )}
    </div>
  );
}

function AyarSatiri({ aktif, onToggle, baslik, aciklama }) {
  return (
    <div className="row row-between" style={{
      padding: "12px 14px",
      background: "var(--bg)",
      borderRadius: 10,
      border: "1px solid var(--border)",
      alignItems: "center",
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{baslik}</div>
        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{aciklama}</div>
      </div>
      <button
        onClick={onToggle}
        style={{
          width: 44, height: 24, borderRadius: 12,
          background: aktif ? "#10b981" : "var(--border)",
          border: "none",
          cursor: "pointer",
          position: "relative",
          transition: "background .2s",
        }}>
        <div style={{
          width: 18, height: 18,
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: 3,
          left: aktif ? 22 : 3,
          transition: "left .2s",
          boxShadow: "0 1px 3px rgba(0,0,0,.2)",
        }} />
      </button>
    </div>
  );
}
