// Resmî tatiller (2026-10-26): esnaf her tatil türü için dükkânın açık mı kapalı mı olduğunu seçer. Kapalı seçilen
// günde site, WhatsApp ve Telegram randevu vermez; arife kapalıysa 13:00'ten sonrası kapanır. Seçim hemen kaydedilir.
import { useEffect, useState } from "react";

const tarihYaz = (t) => new Date(`${t}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "short" });

export default function Tatiller({ api }) {
  const [veri, setVeri] = useState(null);
  const [hata, setHata] = useState("");
  useEffect(() => { api.get("/tatiller").then(d => (d.hata ? setHata(d.hata) : setVeri(d))); }, []);

  const degistir = async (anahtar) => {
    const kapali = veri.kapali.includes(anahtar) ? veri.kapali.filter(k => k !== anahtar) : [...veri.kapali, anahtar];
    setVeri({ ...veri, kapali });
    const d = await api.put("/tatiller", { kapali });
    if (d.hata) { setHata(d.hata); setVeri(v => ({ ...v, kapali: veri.kapali })); }
  };

  if (hata) return <div className="alert alert-error">{hata}</div>;
  if (!veri) return <div style={{ color: "var(--dim)", fontSize: 13 }}>Yükleniyor…</div>;
  // Aynı tür bir yıl içinde bir kez görünür (en yakın tarihiyle)
  const gorulen = new Set();
  const liste = veri.yaklasanlar.filter(t => (gorulen.has(t.anahtar) ? false : gorulen.add(t.anahtar)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {liste.map(t => {
        const kapali = veri.kapali.includes(t.anahtar);
        return (
          <div key={t.anahtar} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--border2)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.ad}</div>
              <div style={{ fontSize: 12, color: "var(--dim)" }}>{tarihYaz(t.tarih)}{t.yarim ? " · kapalıysa 13:00'ten sonra" : ""}</div>
            </div>
            <button onClick={() => degistir(t.anahtar)} className={`day-btn ${kapali ? "on" : "off"}`} style={{ padding: "6px 12px", fontSize: 12, whiteSpace: "nowrap" }}>
              {kapali ? "Kapalı" : "Açık"}
            </button>
          </div>
        );
      })}
      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>Seçimin her yıl aynı tatile uygulanır. Hemen kaydedilir.</div>
    </div>
  );
}
