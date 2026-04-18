// AvciToplu — "Manyak Mod" Toplu Tarama Paneli
// Çoklu il + paralel motor + canlı grid + akış + geçmiş + preset

import { useEffect, useState, useMemo, useRef } from "react";
import * as socketClient from "../../lib/socket";
const { useSocketEvent } = socketClient;

const KATEGORILER = [
  "berber", "kuaför", "güzellik salonu", "dövme", "tırnak salonu",
  "cilt bakım", "spa", "diş kliniği", "veteriner", "diyetisyen",
  "psikolog", "fizyoterapi", "pilates", "oto yıkama", "masaj"
];

export default function AvciToplu({ api }) {
  // Presetler
  const [presetler, setPresetler] = useState({});
  const [aktifPreset, setAktifPreset] = useState(null);

  // Seçimler
  const [secilenIller, setSecilenIller] = useState([]);
  const [secilenKategoriler, setSecilenKategoriler] = useState(["berber", "kuaför", "güzellik salonu", "dövme", "diş kliniği"]);
  const [paralel, setParalel] = useState(5);
  const [hardLimit, setHardLimit] = useState(60);

  // Aktif job + geçmiş
  const [aktifJob, setAktifJob] = useState(null);  // job_id
  const [jobDurum, setJobDurum] = useState(null);  // { ...job, detaylar: [] }
  const [gecmis, setGecmis] = useState([]);
  const [baslatYukleniyor, setBaslatYukleniyor] = useState(false);
  const [feed, setFeed] = useState([]); // son olaylar
  const [aktifSorgu, setAktifSorgu] = useState("");
  const baslangicRef = useRef(null);

  // Presetleri yükle
  useEffect(() => {
    api.get("/admin/avci/presetler")
      .then(d => { if (d?.presetler) setPresetler(d.presetler); })
      .catch(() => {});
    yukleGecmis();
  }, []);

  const yukleGecmis = () => {
    api.get("/admin/avci/job/gecmis?limit=20")
      .then(d => { if (d?.joblar) setGecmis(d.joblar); })
      .catch(() => {});
  };

  // Preset seç
  const presetSec = (key) => {
    const p = presetler[key];
    if (!p) return;
    setSecilenIller(p.iller);
    setAktifPreset(key);
  };

  // Manuel il ekleme/çıkarma
  const ilToggle = (il) => {
    setAktifPreset(null);
    setSecilenIller(prev => prev.includes(il) ? prev.filter(x => x !== il) : [...prev, il]);
  };

  // Kategori toggle
  const kategoriToggle = (k) => {
    setSecilenKategoriler(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  // Tahmini sorgu/süre
  const tahmin = useMemo(() => {
    const hucre = secilenIller.length * secilenKategoriler.length;
    const toplamSorgu = hucre * hardLimit;
    // Ort sorgu süresi: ~1.5sn (300ms rate + ~1.2sn Google API)
    const saniye = (toplamSorgu * 1.5) / Math.max(paralel, 1);
    const dakika = Math.round(saniye / 60);
    return { hucre, toplamSorgu, dakika };
  }, [secilenIller, secilenKategoriler, paralel, hardLimit]);

  // Job başlat
  const jobBaslat = async () => {
    if (!secilenIller.length || !secilenKategoriler.length) {
      alert("En az 1 il ve 1 kategori seç");
      return;
    }
    setBaslatYukleniyor(true);
    try {
      const body = {
        sehirler: secilenIller,
        kategoriler: secilenKategoriler,
        preset: aktifPreset,
        paralel,
        hardLimit,
      };
      const res = await api.post("/admin/avci/job/baslat", body);
      if (res?.hata) {
        alert("Hata: " + res.hata);
        setBaslatYukleniyor(false);
        return;
      }
      setAktifJob(res.job_id);
      setFeed([]);
      setJobDurum(null);
      baslangicRef.current = Date.now();
      // İlk durum çek
      jobDurumYukle(res.job_id);
    } catch (e) {
      alert("Tarama başlatılamadı: " + e.message);
    }
    setBaslatYukleniyor(false);
  };

  // Job durumunu yükle
  const jobDurumYukle = async (jobId) => {
    if (!jobId) return;
    try {
      const d = await api.get(`/admin/avci/job/${jobId}`);
      if (d && !d.hata) setJobDurum(d);
    } catch (e) {}
  };

  // Job iptal
  const jobIptal = async () => {
    if (!aktifJob) return;
    if (!window.confirm("Tarama iptal edilsin mi?")) return;
    try {
      await api.post(`/admin/avci/job/${aktifJob}/iptal`, {});
    } catch (e) {}
  };

  // Periodic polling — socket yoksa yedek
  useEffect(() => {
    if (!aktifJob) return;
    const t = setInterval(() => jobDurumYukle(aktifJob), 5000);
    return () => clearInterval(t);
  }, [aktifJob]);

  // Job bittiğinde geçmişi tazele
  useEffect(() => {
    if (!jobDurum) return;
    if (jobDurum.durum === "tamamlandi" || jobDurum.durum === "iptal" || jobDurum.durum === "hata") {
      setTimeout(() => { yukleGecmis(); }, 500);
    }
  }, [jobDurum?.durum]);

  // Socket event dinleme
  useSocketEvent("avci:job", (d) => {
    if (!d || !d.job_id) return;
    if (aktifJob && d.job_id !== aktifJob) return;

    // Ana durumu güncelle
    setJobDurum(prev => {
      if (!prev) return null; // henüz yüklenmedi
      return {
        ...prev,
        durum: d.durum || prev.durum,
        tamamlanan_sorgu: d.tamamlanan_sorgu ?? prev.tamamlanan_sorgu,
        yeni_eklenen: d.yeni_eklenen ?? prev.yeni_eklenen,
        zaten_var: d.zaten_var ?? prev.zaten_var,
        toplam_bulunan: d.toplam_bulunan ?? prev.toplam_bulunan,
        hatali_sorgu: d.hatali_sorgu ?? prev.hatali_sorgu,
      };
    });

    // Grid'i güncelle (detay)
    if (d.tip === "detay_basladi" || d.tip === "progress" || d.tip === "detay_bitti") {
      setJobDurum(prev => {
        if (!prev?.detaylar) return prev;
        const yeniDetaylar = prev.detaylar.map(detay => {
          if (detay.sehir === d.sehir && detay.kategori === d.kategori) {
            return {
              ...detay,
              durum: d.tip === "detay_bitti" ? "tamamlandi" :
                     d.tip === "detay_basladi" ? "calisiyor" : detay.durum === "bekliyor" ? "calisiyor" : detay.durum,
              tamamlanan_sorgu: d.detay_sorgu ?? detay.tamamlanan_sorgu,
              yeni_eklenen: d.detay_yeni ?? d.yeni ?? detay.yeni_eklenen,
            };
          }
          return detay;
        });
        return { ...prev, detaylar: yeniDetaylar };
      });
    }

    // Feed
    if (d.tip === "detay_bitti") {
      setFeed(prev => [{
        zaman: new Date().toLocaleTimeString('tr-TR'),
        tip: "bitti",
        mesaj: `${d.sehir} × ${d.kategori} → ${d.yeni || 0} yeni lead ✓`,
      }, ...prev].slice(0, 15));
    }
    if (d.tip === "progress" && d.aktif_sorgu) {
      setAktifSorgu(d.aktif_sorgu);
    }
  });

  // Grid hücre rengi
  const hucreRengi = (durum) => {
    if (durum === "tamamlandi") return { bg: "#10b981", color: "#fff", icon: "✓" };
    if (durum === "calisiyor") return { bg: "#f59e0b", color: "#fff", icon: "⚡" };
    if (durum === "hata") return { bg: "#ef4444", color: "#fff", icon: "✗" };
    return { bg: "#1f2937", color: "#6b7280", icon: "·" };
  };

  const progressYuzde = useMemo(() => {
    if (!jobDurum?.toplam_sorgu) return 0;
    return Math.min(100, Math.round((jobDurum.tamamlanan_sorgu / jobDurum.toplam_sorgu) * 100));
  }, [jobDurum]);

  const eta = useMemo(() => {
    if (!jobDurum || !baslangicRef.current || !jobDurum.tamamlanan_sorgu) return "—";
    const gecenSn = (Date.now() - baslangicRef.current) / 1000;
    const hiz = jobDurum.tamamlanan_sorgu / gecenSn; // sorgu/sn
    const kalan = jobDurum.toplam_sorgu - jobDurum.tamamlanan_sorgu;
    if (hiz < 0.01) return "—";
    const kalanSn = kalan / hiz;
    if (kalanSn < 60) return Math.round(kalanSn) + "sn";
    if (kalanSn < 3600) return Math.round(kalanSn / 60) + "dk";
    return (kalanSn / 3600).toFixed(1) + "sa";
  }, [jobDurum]);

  const hiz = useMemo(() => {
    if (!jobDurum || !baslangicRef.current || !jobDurum.tamamlanan_sorgu) return 0;
    const gecenSn = (Date.now() - baslangicRef.current) / 1000;
    return Math.round((jobDurum.tamamlanan_sorgu / gecenSn) * 60); // sorgu/dk
  }, [jobDurum]);

  // Tüm iller listesi (81)
  const tumIller = useMemo(() => presetler.tumu?.iller || [], [presetler]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* SOL: Yapılandırma formu (aktif job yoksa) */}
      {!aktifJob && (
        <div style={{
          background: "linear-gradient(135deg, rgba(139,92,246,.06), rgba(139,92,246,.01))",
          border: "1px solid rgba(139,92,246,.2)",
          borderRadius: 16,
          padding: "22px 24px",
        }}>
          <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: "rgba(139,92,246,.15)",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22
            }}>🚀</div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 17, color: "var(--text)" }}>Manyak Mod — Toplu Tarama</div>
              <div style={{ fontSize: 12, color: "var(--dim)" }}>Çoklu il + paralel motor + canlı izleme</div>
            </div>
          </div>

          {/* Preset chipleri */}
          <div className="mb-16">
            <label className="form-label mb-8" style={{ fontSize: 12, fontWeight: 700 }}>🎯 Hızlı Preset</label>
            <div className="row row-wrap gap-6">
              {Object.entries(presetler).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => presetSec(key)}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 10,
                    border: aktifPreset === key ? "2px solid #8b5cf6" : "1px solid var(--border)",
                    background: aktifPreset === key ? "rgba(139,92,246,.15)" : "var(--surface)",
                    color: aktifPreset === key ? "#8b5cf6" : "var(--text)",
                    fontSize: 12,
                    fontWeight: aktifPreset === key ? 700 : 500,
                    cursor: "pointer",
                    transition: "all .15s",
                  }}
                  title={`${val.il_sayisi} il · ${val.ilce_sayisi} ilçe · ${val.aciklama}`}
                >
                  {val.isim} <span style={{ opacity: 0.6 }}>({val.il_sayisi})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Seçili iller */}
          <div className="mb-16">
            <label className="form-label mb-8" style={{ fontSize: 12, fontWeight: 700 }}>
              📍 Seçili İller ({secilenIller.length})
            </label>
            {secilenIller.length > 0 && (
              <div className="row row-wrap gap-4 mb-8">
                {secilenIller.map(il => (
                  <span key={il} style={{
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgba(139,92,246,.12)",
                    color: "#8b5cf6",
                    fontSize: 11, fontWeight: 600,
                    display: "inline-flex", alignItems: "center", gap: 4
                  }}>
                    {il}
                    <button onClick={() => ilToggle(il)} style={{
                      border: "none", background: "none", color: "#8b5cf6", cursor: "pointer",
                      padding: 0, fontSize: 14, lineHeight: 1
                    }}>×</button>
                  </span>
                ))}
                <button onClick={() => { setSecilenIller([]); setAktifPreset(null); }} style={{
                  padding: "4px 10px", borderRadius: 999, background: "rgba(239,68,68,.1)",
                  color: "#ef4444", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer"
                }}>Temizle</button>
              </div>
            )}
            <details style={{ fontSize: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--dim)", fontWeight: 600 }}>📋 Tüm illerden seç ({tumIller.length})</summary>
              <div className="row row-wrap gap-4" style={{ marginTop: 8, maxHeight: 180, overflowY: "auto", padding: 8, border: "1px solid var(--border)", borderRadius: 8 }}>
                {tumIller.map(il => (
                  <button key={il} onClick={() => ilToggle(il)} style={{
                    padding: "4px 10px",
                    borderRadius: 6,
                    border: "none",
                    fontSize: 11,
                    fontWeight: secilenIller.includes(il) ? 700 : 500,
                    cursor: "pointer",
                    background: secilenIller.includes(il) ? "#8b5cf6" : "var(--bg)",
                    color: secilenIller.includes(il) ? "#fff" : "var(--dim)",
                  }}>
                    {il}
                  </button>
                ))}
              </div>
            </details>
          </div>

          {/* Kategoriler */}
          <div className="mb-16">
            <label className="form-label mb-8" style={{ fontSize: 12, fontWeight: 700 }}>
              🏷 Kategoriler ({secilenKategoriler.length})
            </label>
            <div className="row row-wrap gap-6">
              {KATEGORILER.map(k => (
                <button key={k} onClick={() => kategoriToggle(k)} style={{
                  padding: "6px 14px",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 12,
                  fontWeight: secilenKategoriler.includes(k) ? 700 : 500,
                  cursor: "pointer",
                  background: secilenKategoriler.includes(k) ? "#8b5cf6" : "var(--bg)",
                  color: secilenKategoriler.includes(k) ? "#fff" : "var(--dim)",
                }}>
                  {k}
                </button>
              ))}
            </div>
          </div>

          {/* Paralel + hardLimit */}
          <div className="row gap-16 mb-16" style={{ flexWrap: "wrap" }}>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>⚡ Paralel sorgu (1-20)</label>
              <div className="row gap-8" style={{ alignItems: "center" }}>
                <input type="range" min="1" max="20" value={paralel} onChange={e => setParalel(parseInt(e.target.value))} style={{ width: 160 }} />
                <span style={{ minWidth: 32, fontSize: 14, fontWeight: 700, color: "#8b5cf6" }}>{paralel}</span>
              </div>
            </div>
            <div>
              <label className="form-label" style={{ fontSize: 12, fontWeight: 700 }}>🎯 Max sorgu/hücre (5-500)</label>
              <div className="row gap-8" style={{ alignItems: "center" }}>
                <input type="range" min="5" max="500" step="5" value={hardLimit} onChange={e => setHardLimit(parseInt(e.target.value))} style={{ width: 200 }} />
                <span style={{ minWidth: 48, fontSize: 14, fontWeight: 700, color: "#8b5cf6" }}>{hardLimit}</span>
              </div>
            </div>
          </div>

          {/* Tahmin + Başlat */}
          <div style={{
            background: "rgba(0,0,0,.03)", padding: 12, borderRadius: 10, marginBottom: 12, fontSize: 12, color: "var(--dim)"
          }}>
            📊 <strong style={{ color: "var(--text)" }}>{tahmin.hucre}</strong> hücre (sehir×kategori) ·
            <strong style={{ color: "var(--text)" }}> {tahmin.toplamSorgu}</strong> sorgu ·
            Tahmini süre: <strong style={{ color: "#8b5cf6" }}>~{tahmin.dakika}dk</strong>
          </div>

          <button
            disabled={baslatYukleniyor || !secilenIller.length || !secilenKategoriler.length}
            onClick={jobBaslat}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 12,
              border: "none",
              background: baslatYukleniyor ? "var(--bg)" : "linear-gradient(135deg, #8b5cf6, #7c3aed)",
              color: "#fff",
              fontSize: 15,
              fontWeight: 800,
              cursor: baslatYukleniyor ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(139,92,246,.25)",
              opacity: (!secilenIller.length || !secilenKategoriler.length) ? 0.5 : 1,
            }}>
            {baslatYukleniyor ? "⏳ Başlatılıyor..." : `🚀 Manyak Modu Başlat (${tahmin.hucre} hücre)`}
          </button>
        </div>
      )}

      {/* CANLI PANEL */}
      {aktifJob && jobDurum && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid rgba(16,185,129,.3)",
          borderRadius: 16, padding: 20,
        }}>
          <div className="row row-between mb-16" style={{ alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>
                🎯 {jobDurum.baslik || "Toplu Tarama"}
              </div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>Job: {aktifJob}</div>
            </div>
            <div className="row gap-8">
              {(jobDurum.durum === "calisiyor" || jobDurum.durum === "bekliyor") && (
                <button onClick={jobIptal} style={{
                  padding: "8px 14px", borderRadius: 10, border: "1px solid rgba(239,68,68,.3)",
                  background: "rgba(239,68,68,.1)", color: "#ef4444", fontWeight: 700, cursor: "pointer", fontSize: 12
                }}>⏹ İptal</button>
              )}
              {(jobDurum.durum === "tamamlandi" || jobDurum.durum === "iptal" || jobDurum.durum === "hata") && (
                <button onClick={() => { setAktifJob(null); setJobDurum(null); setFeed([]); }} style={{
                  padding: "8px 14px", borderRadius: 10, border: "none",
                  background: "var(--bg)", color: "var(--text)", fontWeight: 700, cursor: "pointer", fontSize: 12
                }}>✖ Kapat</button>
              )}
            </div>
          </div>

          {/* Ana durum kartı */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
            <MetricCard label="Durum" deger={
              jobDurum.durum === "calisiyor" ? "⚡ Çalışıyor" :
              jobDurum.durum === "tamamlandi" ? "✅ Bitti" :
              jobDurum.durum === "iptal" ? "⏹ İptal" :
              jobDurum.durum === "hata" ? "❌ Hata" : "⏸ Bekliyor"
            } renk="#8b5cf6" />
            <MetricCard label="Sorgu" deger={`${jobDurum.tamamlanan_sorgu || 0} / ${jobDurum.toplam_sorgu || 0}`} renk="#3b82f6" />
            <MetricCard label="Yeni Lead" deger={jobDurum.yeni_eklenen || 0} renk="#10b981" vurgu />
            <MetricCard label="Zaten Var" deger={jobDurum.zaten_var || 0} renk="#6b7280" />
            <MetricCard label="Hız" deger={`${hiz}/dk`} renk="#f59e0b" />
            <MetricCard label="ETA" deger={eta} renk="#ec4899" />
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 14 }}>
            <div className="row row-between mb-4">
              <span style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600 }}>İlerleme</span>
              <span style={{ fontSize: 12, color: "#8b5cf6", fontWeight: 700 }}>{progressYuzde}%</span>
            </div>
            <div style={{ height: 10, background: "rgba(139,92,246,.1)", borderRadius: 999, overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${progressYuzde}%`,
                background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
                transition: "width .4s",
                boxShadow: "0 0 12px rgba(139,92,246,.5)"
              }} />
            </div>
            {aktifSorgu && jobDurum.durum === "calisiyor" && (
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--dim)" }}>
                🔎 Şu an: <span style={{ color: "#8b5cf6", fontWeight: 600 }}>{aktifSorgu}</span>
              </div>
            )}
          </div>

          {/* GRID — Hücre hücre */}
          {jobDurum.detaylar && jobDurum.detaylar.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600, marginBottom: 8 }}>
                📍 İl × Kategori Durumu
              </div>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: 6,
                maxHeight: 320,
                overflowY: "auto",
                padding: 8,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "rgba(0,0,0,.02)",
              }}>
                {jobDurum.detaylar.map((d, i) => {
                  const renk = hucreRengi(d.durum);
                  return (
                    <div key={i} title={`${d.sehir} × ${d.kategori}\n${d.durum} · ${d.yeni_eklenen || 0} yeni`} style={{
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: renk.bg,
                      color: renk.color,
                      fontSize: 10,
                      fontWeight: 600,
                      transition: "all .3s",
                      cursor: d.durum === "hata" ? "help" : "default",
                    }}>
                      <div style={{ fontWeight: 800, fontSize: 11, marginBottom: 2 }}>
                        {renk.icon} {d.sehir.slice(0, 8)}
                      </div>
                      <div style={{ fontSize: 9, opacity: 0.85 }}>{d.kategori}</div>
                      {(d.yeni_eklenen > 0 || d.durum === "tamamlandi") && (
                        <div style={{ fontSize: 10, fontWeight: 800, marginTop: 2 }}>
                          +{d.yeni_eklenen || 0}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="row gap-12" style={{ marginTop: 8, fontSize: 10, color: "var(--dim)" }}>
                <span>⬛ Bekliyor</span>
                <span style={{ color: "#f59e0b" }}>⚡ Çalışıyor</span>
                <span style={{ color: "#10b981" }}>✓ Bitti</span>
                <span style={{ color: "#ef4444" }}>✗ Hata</span>
              </div>
            </div>
          )}

          {/* FEED */}
          {feed.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600, marginBottom: 8 }}>
                📜 Akış (son 15)
              </div>
              <div style={{
                maxHeight: 200,
                overflowY: "auto",
                padding: 10,
                border: "1px solid var(--border)",
                borderRadius: 10,
                background: "rgba(0,0,0,.02)",
                fontSize: 12,
                fontFamily: "monospace",
              }}>
                {feed.map((f, i) => (
                  <div key={i} style={{ marginBottom: 4, color: f.tip === "bitti" ? "#10b981" : "var(--text)" }}>
                    <span style={{ opacity: 0.5 }}>[{f.zaman}]</span> {f.mesaj}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* GEÇMİŞ */}
      {!aktifJob && gecmis.length > 0 && (
        <div style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16, padding: "18px 20px",
        }}>
          <div className="row row-between mb-12" style={{ alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>📜 Geçmiş Taramalar (son {gecmis.length})</div>
            <button onClick={yukleGecmis} style={{
              padding: "4px 10px", borderRadius: 8, border: "1px solid var(--border)",
              background: "var(--bg)", color: "var(--dim)", fontSize: 11, cursor: "pointer"
            }}>🔄 Yenile</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {gecmis.map(j => {
              const durumRenk = j.durum === "tamamlandi" ? "#10b981" : j.durum === "iptal" ? "#f59e0b" : j.durum === "hata" ? "#ef4444" : "#3b82f6";
              const sure = j.baslangic_tarihi && j.bitis_tarihi ?
                Math.round((new Date(j.bitis_tarihi) - new Date(j.baslangic_tarihi)) / 60000) + "dk" : "—";
              return (
                <div key={j.job_id} style={{
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: "pointer",
                  transition: "all .2s",
                }} onClick={() => {
                  // Bu geçmiş job'u "view-only" modda göster
                  setAktifJob(j.job_id);
                  jobDurumYukle(j.job_id);
                }}>
                  <div className="row row-between">
                    <div style={{ flex: 1 }}>
                      <div className="row gap-8" style={{ alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>{j.baslik}</span>
                        <span style={{
                          padding: "2px 8px", borderRadius: 6,
                          background: `${durumRenk}20`, color: durumRenk,
                          fontSize: 10, fontWeight: 700
                        }}>{j.durum}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>
                        {new Date(j.baslangic_tarihi).toLocaleString('tr-TR')} · {sure} · {j.sehirler?.length}il × {j.kategoriler?.length}kat
                      </div>
                    </div>
                    <div style={{ textAlign: "right", minWidth: 120 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: "#10b981" }}>+{j.yeni_eklenen || 0} yeni</div>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>{j.tamamlanan_sorgu || 0}/{j.toplam_sorgu || 0} sorgu</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, deger, renk, vurgu }) {
  return (
    <div style={{
      padding: "10px 12px",
      borderRadius: 10,
      background: vurgu ? `${renk}20` : "var(--bg)",
      border: `1px solid ${vurgu ? renk + "40" : "var(--border)"}`,
    }}>
      <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: renk, marginTop: 2 }}>{deger}</div>
    </div>
  );
}
