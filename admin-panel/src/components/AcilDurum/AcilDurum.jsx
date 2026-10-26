// Acil durum (2026-10-26): çalışan ya da bütün dükkân bugünden seçilen güne kadar randevu almaz. Önce etkilenen
// randevular ve her birine ne olacağı gösterilir (başka ustaya aktarım ya da iptal); esnaf onaylamadan kimseye mesaj gitmez.
// personel=true: çalışan kendi hesabından, yalnız kendisi için açar.
import { useEffect, useState } from "react";

const bugunStr = (n = 0) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" }); };
const tarihYaz = (t) => new Date(`${t}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });

function AcilModal({ api, calisanlar, personel, onKapat, onBitti }) {
  const [kapsam, setKapsam] = useState(personel ? "ben" : "");          // "" = bütün dükkân, sayı = çalışan
  const [sure, setSure] = useState("bugun");                            // bugun | yarin | tarih
  const [tarih, setTarih] = useState(bugunStr(2));
  const [onizleme, setOnizleme] = useState(null);
  const [sonuc, setSonuc] = useState(null);
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  const bitis = sure === "bugun" ? bugunStr() : sure === "yarin" ? bugunStr(1) : tarih;
  const govde = { bitis_tarih: bitis, ...(personel || !kapsam ? {} : { calisan_id: Number(kapsam) }) };
  useEffect(() => { setOnizleme(null); }, [kapsam, sure, tarih]);

  const istek = async (yol) => {
    setHata(""); setYukleniyor(true);
    const d = await api.post(yol, govde);
    setYukleniyor(false);
    if (d.hata) { setHata(d.hata); return null; }
    return d;
  };
  const onizle = async () => { const d = await istek("/acil-durum/onizleme"); if (d) setOnizleme({ ...d, randevular: d.randevular || [] }); };
  const uygula = async () => { const d = await istek("/acil-durum"); if (d) { setSonuc({ ...d, randevular: d.randevular || [] }); onBitti?.(); } };

  const aktar = onizleme?.randevular.filter(r => r.karar === "aktar") || [];
  const iptal = onizleme?.randevular.filter(r => r.karar === "iptal") || [];
  const kimIcin = personel ? "Sen" : kapsam ? (calisanlar.find(c => String(c.id) === String(kapsam))?.isim || "Çalışan") : "Bütün dükkân";

  return (
    <div onClick={onKapat} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 16 }}>Acil durum</h2>
          <button onClick={onKapat} className="modal-close" aria-label="Kapat">✕</button>
        </div>

        {sonuc ? (
          <div style={{ padding: "16px 20px 20px" }}>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              <b>{kimIcin}</b> {tarihYaz(sonuc.bitis)} gününe kadar randevu almıyor.
              {sonuc.randevular.length > 0 && <> {sonuc.randevular.filter(r => r.karar === "aktar").length} randevu başka ustaya aktarıldı, {sonuc.randevular.filter(r => r.karar === "iptal").length} randevu iptal edildi. Müşterilere şimdi tek tek haber gidiyor.</>}
            </p>
            <div className="form-actions"><button onClick={onKapat} className="btn btn-primary">Tamam</button></div>
          </div>
        ) : (
          <div style={{ padding: "16px 20px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ color: "var(--dim)", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              Seçtiğin süre boyunca sitede, WhatsApp'ta ve Telegram'da yeni randevu alınmaz. Müşterilere sebep söylenmez, yalnız "beklenmedik bir durum" denir.
            </p>
            {!personel && (
              <div>
                <label className="form-label">Kim için?</label>
                <select className="input" value={kapsam} onChange={e => setKapsam(e.target.value)}>
                  <option value="">Bütün dükkân</option>
                  {calisanlar.filter(c => c.aktif !== false).map(c => <option key={c.id} value={c.id}>{c.isim}</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="form-label">Ne kadar sürecek?</label>
              <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                {[["bugun", "Bugün"], ["yarin", "Yarın dahil"], ["tarih", "Tarih seç"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setSure(k)} className={`btn btn-sm ${sure === k ? "btn-primary" : "btn-ghost"}`}>{l}</button>
                ))}
              </div>
              {sure === "tarih" && <input type="date" className="input" style={{ marginTop: 8 }} min={bugunStr()} max={bugunStr(30)} value={tarih} onChange={e => setTarih(e.target.value)} />}
            </div>

            {onizleme && (
              <div style={{ border: "1px solid var(--border2)", borderRadius: 12, padding: 12, fontSize: 13 }}>
                {onizleme.randevular.length === 0 ? <div>Bu sürede alınmış randevu yok. Yalnız yeni randevular kapanacak.</div> : (
                  <>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{onizleme.randevular.length} randevu etkileniyor</div>
                    {[...aktar, ...iptal].map(r => (
                      <div key={r.randevu_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderTop: "1px solid var(--border2)" }}>
                        <span>{tarihYaz(r.tarih).split(" ").slice(0, 2).join(" ")} {r.saat} · {r.musteri_isim || "Müşteri"}{r.hizmet ? ` · ${r.hizmet}` : ""}</span>
                        <span style={{ whiteSpace: "nowrap", fontWeight: 600, color: r.karar === "aktar" ? "var(--green)" : "var(--red)" }}>
                          {r.karar === "aktar" ? `Aktarılacak: ${r.yeni_calisan}` : "İptal edilecek"}
                        </span>
                      </div>
                    ))}
                    {iptal.length > 0 && <div style={{ color: "var(--dim)", marginTop: 8 }}>İptal edilen müşterilere özür ve yeni saat seçme linki gider.</div>}
                  </>
                )}
              </div>
            )}

            {hata && <div className="alert alert-error">{hata}</div>}
            <div className="form-actions">
              {!onizleme
                ? <button disabled={yukleniyor} onClick={onizle} className="btn btn-primary">{yukleniyor ? "Bakılıyor…" : "Etkilenen randevuları göster"}</button>
                : <button disabled={yukleniyor} onClick={uygula} className="btn btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }}>{yukleniyor ? "Uygulanıyor…" : "Onayla ve uygula"}</button>}
              <button onClick={onKapat} className="btn btn-ghost">Vazgeç</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Düğme + aktif acil durumlar (bitir). Esnafın Çalışanlar sayfasında ve personel ekranında kullanılır.
export default function AcilDurum({ api, calisanlar = [], personel = false }) {
  const [acik, setAcik] = useState(false);
  const [liste, setListe] = useState([]);
  const yukle = async () => { const d = await api.get("/acil-durum"); setListe((d.acil_durumlar || []).filter(a => a.aktif)); };
  useEffect(() => { yukle(); }, []);
  const bitir = async (id) => {
    if (!window.confirm("Acil durum bitsin mi? Seçilen günlerde yeniden randevu alınır (iptal edilen randevular geri gelmez).")) return;
    const d = await api.del(`/acil-durum/${id}`);
    if (d.hata) alert(d.hata); else yukle();
  };

  return (
    <div className="form-card" style={{ borderColor: liste.length ? "var(--red)" : undefined }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Acil durum</div>
          <div style={{ color: "var(--dim)", fontSize: 12.5, marginTop: 2 }}>
            {personel ? "Gelemeyeceksen yeni randevuları kapat; alınmış randevular başka ustaya aktarılır ya da iptal edilip müşteriye haber gider."
              : "Cenaze, hastane gibi beklenmedik bir durumda bir çalışan ya da bütün dükkân randevu almasın."}
          </div>
        </div>
        <button onClick={() => setAcik(true)} className="btn" style={{ background: "var(--red-s)", color: "var(--red)", border: "1px solid rgba(180,35,24,.3)", fontWeight: 700 }}>Acil durum başlat</button>
      </div>
      {liste.map(a => (
        <div key={a.id} className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border2)", fontSize: 13 }}>
          <span><b>{a.calisan_isim || "Bütün dükkân"}</b> · {tarihYaz(String(a.bitis_tarih).slice(0, 10))} gününe kadar kapalı</span>
          <button onClick={() => bitir(a.id)} className="btn btn-sm btn-ghost">Bitir</button>
        </div>
      ))}
      {acik && <AcilModal api={api} calisanlar={calisanlar} personel={personel} onKapat={() => setAcik(false)} onBitti={yukle} />}
    </div>
  );
}
