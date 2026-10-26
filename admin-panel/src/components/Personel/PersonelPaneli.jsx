// Personel girişi (2026-10-26): çalışan kendi telefonundan yalnız kendi randevularını görür ve kendisi için acil durum
// başlatır. Esnaf panelinin başka hiçbir ekranı yok (sunucu da bu rolü başka uç noktalardan geri çevirir).
import { useEffect, useState } from "react";
import AcilDurum from "../AcilDurum/AcilDurum";
import { API_URL } from "../../lib/config";

const gunStr = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); };
const gunYaz = (t) => new Date(`${t}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
const DURUM = { onaylandi: "Onaylı", onay_bekliyor: "Onay bekliyor", kapora_bekliyor: "Kapora bekliyor", tamamlandi: "Geldi", gelmedi: "Gelmedi", bekliyor: "Bekliyor" };

export default function PersonelPaneli({ api, onCikis }) {
  const [ben, setBen] = useState(null);
  const [randevular, setRandevular] = useState([]);
  const [hata, setHata] = useState("");

  const yukle = async () => {
    const [b, r] = await Promise.all([api.get("/personel/ben"), api.get(`/personel/randevular?tarih=${gunStr()}`)]);
    if (b.hata) setHata(b.hata); else setBen(b);
    setRandevular(r.randevular || []);
  };
  useEffect(() => {
    yukle();
    const id = setInterval(yukle, 60000);   // canlı bağlantı yok (personel dükkânın bütün olaylarını almaz): dakikada bir yenile
    return () => clearInterval(id);
  }, []);

  const gunler = [...new Set(randevular.map(r => r.tarih))];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "20px 16px 40px" }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{ben?.calisan || "Randevularım"}</div>
            <div style={{ color: "var(--dim)", fontSize: 13 }}>{ben?.isletme}</div>
          </div>
          <button onClick={onCikis} className="btn btn-ghost btn-sm">Çıkış</button>
        </div>
        {hata && <div className="alert alert-error" style={{ marginBottom: 12 }}>{hata}</div>}

        <AcilDurum api={api} personel />

        <h2 style={{ fontSize: 15, margin: "20px 0 8px" }}>Önümüzdeki 7 gün</h2>
        {gunler.length === 0 && <div className="list-empty"><p>Yaklaşan randevun yok.</p></div>}
        {gunler.map(g => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".04em", margin: "8px 0 6px" }}>
              {g === gunStr() ? "Bugün" : g === gunStr(1) ? "Yarın" : gunYaz(g)}
            </div>
            {randevular.filter(r => r.tarih === g).map(r => (
              <div key={r.id} className="list-item" style={{ alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 15, minWidth: 54 }}>{r.saat}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="list-item-name">{r.musteri}</div>
                  <div className="list-item-sub">{r.hizmet}{r.bitis_saati ? ` · ${r.saat}–${r.bitis_saati}` : ""}</div>
                </div>
                <span className="tag-sm" style={{ background: "var(--surface3)", color: "var(--muted)" }}>{DURUM[r.durum] || r.durum}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Davet linki (?personel=TOKEN): çalışan e-posta ve şifresini belirleyip hesabını açar
export function PersonelDavet({ token, onLogin }) {
  const [bilgi, setBilgi] = useState(null);
  const [form, setForm] = useState({ email: "", sifre: "" });
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/personel/davet/${encodeURIComponent(token)}`).then(r => r.json())
      .then(d => (d.hata ? setHata(d.hata) : setBilgi(d))).catch(() => setHata("Bağlantı hatası, sayfayı yenile"));
  }, [token]);

  const gonder = async (e) => {
    e.preventDefault();
    setHata(""); setYukleniyor(true);
    const d = await fetch(`${API_URL}/personel/davet/${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.email.trim(), sifre: form.sifre }),
    }).then(r => r.json()).catch(() => ({ hata: "Bağlantı hatası, tekrar dene" }));
    setYukleniyor(false);
    if (!d.token) return setHata(d.hata || "Hesap açılamadı");
    window.history.replaceState({}, "", window.location.pathname);
    onLogin(d);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 16 }}>
      <form onSubmit={gonder} className="form-card" style={{ width: "100%", maxWidth: 400 }}>
        <h1 style={{ fontSize: 20, margin: "0 0 6px" }}>{bilgi ? `${bilgi.isletme}` : "Personel girişi"}</h1>
        {bilgi && <p style={{ color: "var(--dim)", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
          Merhaba {bilgi.calisan}. Kendi randevularını telefonundan görmek için bir e-posta ve şifre belirle.</p>}
        {bilgi && (<>
          <label className="form-label">E-posta</label>
          <input className="input" type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          <label className="form-label" style={{ marginTop: 10 }}>Şifre (en az 8 karakter)</label>
          <input className="input" type="password" autoComplete="new-password" minLength={8} value={form.sifre} onChange={e => setForm({ ...form, sifre: e.target.value })} required />
        </>)}
        {hata && <div className="alert alert-error" style={{ marginTop: 12 }}>{hata}</div>}
        {bilgi && <button disabled={yukleniyor} className="btn btn-primary btn-block" style={{ marginTop: 16 }}>{yukleniyor ? "Açılıyor…" : "Hesabımı aç"}</button>}
      </form>
    </div>
  );
}
