import { useState, useEffect, useCallback, useRef } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler } from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import logoFull from "./assets/logo2.png";
import Settings from "./components/Settings/Settings";
import Kasa from "./components/Kasa/Kasa";
import LiteBugun from "./components/Lite/LiteBugun";
import KurulumKarti from "./components/Kurulum/KurulumKarti";
import Buyume from "./components/Buyume/Buyume";
import Magaza from "./components/Magaza/Magaza";
import MagazaAdmin from "./components/Magaza/MagazaAdmin";
import SatisHuni from "./components/SatisBot/SatisHuni";
import EkipYonetimi from "./components/Ekip/EkipYonetimi";
import SmsAyarlari from "./components/Settings/SmsAyarlari";
import GeceRaporu from "./components/Settings/GeceRaporu";
import YorumAvcisi from "./components/Settings/YorumAvcisi";
import Winback from "./components/Winback/Winback";
import Sadakat from "./components/Sadakat/Sadakat";
import Referans from "./components/Referans/Referans";
import DogumGunu from "./components/DogumGunu/DogumGunu";
import MusteriGetir from "./components/MusteriGetir/MusteriGetir";
import AvciToplu from "./components/AvciToplu/AvciToplu";
import * as socketClient from "./lib/socket";
const { connect: socketConnect, disconnect: socketDisconnect, useSocketEvent, useSocketStatus } = socketClient;

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Tooltip, Legend, Filler);

import { API_URL, API_ORIGIN, bookingUrl } from './lib/config';
import BackendHealth from './components/BackendHealth';
import { bildirimCal, titret as bildirimTitret, ayarOku as bildirimAyarOku, sesKilidiAc } from './lib/bildirim';
import BildirimAktivasyon from './components/BildirimAktivasyon';
import DukkanModuPopup from './components/DukkanModuPopup';
import GrupYonetim from './components/Grup/GrupYonetim';
import SubeSwitcher from './components/Grup/SubeSwitcher';

// "Müşteri olarak giriş" token'ı sekmeye özel (sessionStorage) tutulur; eskiden localStorage'daki
// süper admin token'ını eziyordu ve süper admin oturumu tüm sekmelerde işletme hesabına dönüşüyordu.
const oturumTokeni = () => sessionStorage.getItem("randevugo_imp_token") || localStorage.getItem("randevugo_token");
const oturumuKapat = () => {
  if (sessionStorage.getItem("randevugo_imp_token")) sessionStorage.removeItem("randevugo_imp_token");
  else localStorage.removeItem("randevugo_token");
};

// Ödeme sayfası: giriş anahtarı URL'ye konmaz; sunucudan süreli, yalnız ödeme açan link alınır.
// Pencere tıklama anında açılır (sonradan açılırsa tarayıcı açılır pencere engeline takılır).
function odemeSayfasiAc(paket) {
  const w = window.open("", "_blank");
  api.get(`/odeme/link${paket ? `?paket=${encodeURIComponent(paket)}` : ""}`)
    .then(d => { if (d?.url) { if (w) w.location.href = d.url; else window.location.href = d.url; } else { w?.close(); alert("Ödeme sayfası açılamadı, lütfen tekrar deneyin."); } })
    .catch(() => { w?.close(); alert("Ödeme sayfası açılamadı, lütfen tekrar deneyin."); });
}

const api = {
  token: oturumTokeni(),

  async fetch(endpoint, options = {}) {
    try {
      const aktifIsletme = localStorage.getItem("aktifIsletme");
      const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          ...(aktifIsletme ? { "X-Aktif-Isletme": aktifIsletme } : {}),
          ...options.headers,
        },
      });
      if (res.status === 401) {
        this.token = null;
        oturumuKapat();
        window.location.reload();
      }
      if (res.status === 403) {
        const data = await res.json();
        if (data.pasif) {
          alert("İşletmeniz pasif duruma alınmıştır. Lütfen destek ile iletişime geçin.");
          this.token = null;
          oturumuKapat();
          window.location.reload();
          return data;
        }
        if (data.limit_asimi) {
          window.dispatchEvent(new CustomEvent("paket-yetersiz", { detail: data }));
          return { ...data, _paketYetersiz: true };
        }
        return data;
      }
      if (res.status === 402) {
        window.dispatchEvent(new CustomEvent("odeme-gerekli"));
        const data = await res.json();
        return { ...data, _odemeGerekli: true };
      }
      const data = await res.json().catch(() => ({}));
      // 500 vb. hatalar başarılı cevap gibi dönüyordu (ör. "Ayarlar kaydedildi" ama kaydedilmemiş)
      if (!res.ok && !data.hata) data.hata = `Sunucu hatası (${res.status})`;
      return data;
    } catch (err) {
      console.error("API bağlantı hatası:", endpoint, err.message);
      return { hata: "Sunucuya bağlanılamadı", _networkError: true };
    }
  },

  get: (e) => api.fetch(e),
  post: (e, d) => api.fetch(e, { method: "POST", body: JSON.stringify(d) }),
  put: (e, d) => api.fetch(e, { method: "PUT", body: JSON.stringify(d) }),
  del: (e) => api.fetch(e, { method: "DELETE" }),
  delete: (e) => api.fetch(e, { method: "DELETE" }),
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

  // Sağ panel: stok görsel yerine ürünün kendisi — bugünün randevu akışı (statik örnek)
  const ornekRandevular = [
    { saat: "09:30", isim: "Emre K.", hizmet: "Saç kesim", kanal: "WhatsApp", durum: "Onaylı" },
    { saat: "10:15", isim: "Burak T.", hizmet: "Saç + sakal", kanal: "Online", durum: "Onaylı" },
    { saat: "11:00", isim: "Mert A.", hizmet: "Sakal tıraşı", kanal: "WhatsApp", durum: "Onay bekliyor" },
    { saat: "13:30", isim: "Can Y.", hizmet: "Saç kesim", kanal: "Telegram", durum: "Onaylı" },
  ];
  const heroPanel = (
    <div className="login-hero login-hero-v2">
      <div className="lh-ust">
        <div className="lh-etiket">Bugün · 4 randevu</div>
        <h2>Müşterileriniz WhatsApp'tan yazar, randevu kendiliğinden oluşur.</h2>
        <p>Telefona bakamadığınız anda bile sıra dolmaya devam eder. Hatırlatmalar otomatik gider, gelmeyenler azalır.</p>
      </div>
      <div className="lh-liste">
        {ornekRandevular.map(r => (
          <div key={r.saat} className="lh-satir">
            <span className="lh-saat">{r.saat}</span>
            <span className="lh-kisi">{r.isim}<small>{r.hizmet}</small></span>
            <span className="lh-kanal">{r.kanal}</span>
            <span className={`lh-durum${r.durum === "Onaylı" ? " ok" : ""}`}>{r.durum}</span>
          </div>
        ))}
      </div>
      <div className="lh-alt">Berber, kuaför ve güzellik salonları için.</div>
    </div>
  );

  return (
    <div className="login-page">
      <div className="login-form-panel">
        <div className="login-form-logo">
          <span className="marka-monogram" aria-label="SıraGO">S</span>
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
  const [form, setForm] = useState({ isim: "", isim_en: "", isim_ar: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "", kapora_yuzdesi: "0", tampon_dk: "0" });
  const [hata, setHata] = useState("");
  const [duzenleId, setDuzenleId] = useState(null); // düzenlenen hizmet (yoksa yeni ekleme)

  const duzenleAc = (h) => {
    setForm({ isim: h.isim || "", isim_en: h.isim_en || "", isim_ar: h.isim_ar || "", sure_dk: String(h.sure_dk ?? 30), fiyat: String(parseFloat(h.fiyat) || ""), aciklama: h.aciklama || "", emoji: h.emoji || "", kapora_yuzdesi: String(h.kapora_yuzdesi || 0), tampon_dk: String(h.tampon_dk || 0), aktif: h.aktif !== false });
    setDuzenleId(h.id); setHata(""); setFormAcik(true);
  };

  const ekle = async (e) => {
    e.preventDefault();
    setHata("");
    const res = await api[duzenleId ? "put" : "post"](duzenleId ? `/hizmetler/${duzenleId}` : "/hizmetler", { aktif: form.aktif !== false, isim: form.isim, isim_en: form.isim_en || null, isim_ar: form.isim_ar || null, sure_dk: parseInt(form.sure_dk), fiyat: parseFloat(form.fiyat), aciklama: form.aciklama, emoji: form.emoji, kapora_yuzdesi: parseInt(form.kapora_yuzdesi) || 0, tampon_dk: parseInt(form.tampon_dk) || 0 });
    if (res.hata) { setHata(res.hata); return; }
    setForm({ isim: "", isim_en: "", isim_ar: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "", kapora_yuzdesi: "0", tampon_dk: "0" });
    setFormAcik(false); setDuzenleId(null);
    yukle();
  };

  const sil = async (id) => {
    if (!confirm("Bu hizmeti silmek istediğinize emin misiniz?")) return;
    const r = await api.del(`/hizmetler/${id}`);
    if (r?.hata) alert(/foreign|violates|referans/i.test(r.hata) ? "Bu hizmet geçmiş randevularda kullanıldığı için silinemez. Düzenleyip pasife alabilirsiniz." : "Silinemedi: " + r.hata);
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
          <button onClick={() => { setDuzenleId(null); setForm({ isim: "", isim_en: "", isim_ar: "", sure_dk: "30", fiyat: "", aciklama: "", emoji: "", kapora_yuzdesi: "0", tampon_dk: "0" }); setFormAcik(!formAcik); }} className="btn btn-primary">+ Yeni Hizmet</button>
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
            <div>
              <label className="form-label">Tampon Süre (dk)</label>
              <input type="number" min="0" max="60" placeholder="0" value={form.tampon_dk} onChange={e => setForm({...form, tampon_dk: e.target.value})} className="input" />
              <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>0 = işletme varsayılanı. Randevular arası hazırlık süresi</div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">Kaydet</button>
            <button type="button" onClick={() => { setFormAcik(false); setHata(""); setDuzenleId(null); }} className="btn btn-ghost">İptal</button>
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
            <span className="tag-sm" style={{ background: "rgba(31,111,74,.12)", color: "var(--green)", fontWeight: 600 }}>{h.fiyat} ₺</span>
            {h.kapora_yuzdesi > 0 && <span className="tag-sm" style={{ background: "rgba(168,89,12,.12)", color: "var(--amber)", fontWeight: 600 }}>💳 %{h.kapora_yuzdesi} kapora</span>}
            {h.tampon_dk > 0 && <span className="tag-sm" style={{ background: "rgba(93,75,181,.1)", color: "#5d4bb5", fontWeight: 600 }}>⏳ {h.tampon_dk}dk tampon</span>}
          </div>
          <button onClick={() => duzenleAc(h)} title="Düzenle" style={{ background: "none", border: "none", cursor: "pointer", padding: 8, borderRadius: 8, color: "var(--muted)", fontSize: 15 }}>✏️</button>
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
                }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "1px solid rgba(180,35,24,.25)" }}>✕</button>
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 10px", borderRadius: 8, background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontSize: 10, fontWeight: 600 }}>
                  ⭐ {c.ay_randevu} randevu · {c.ay_ciro}₺
                </span>
              )}
            </div>
            <div className="row gap-8">
              <span className="tag" style={{ background: (c.aktif === false) ? "var(--red-s)" : "rgba(31,111,74,.12)", color: (c.aktif === false) ? "var(--red)" : "var(--green)" }}>
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
            {c.calisma_baslangic && <span className="tag-sm" style={{ background: "rgba(47,86,198,.1)", color: "var(--blue)" }}>🕐 {String(c.calisma_baslangic).substring(0,5)} - {String(c.calisma_bitis || '').substring(0,5)}</span>}
            {c.kapali_gunler && <span className="tag-sm" style={{ background: "rgba(180,35,24,.1)", color: "var(--red)" }}>Kapalı: {c.kapali_gunler.split(",").filter(Boolean).map(g => gunler.find(gl => gl[0] === g)?.[1] || g).join(", ")}</span>}
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
                <label key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 8, background: h.atanmis ? "rgba(31,111,74,.08)" : "var(--bg)", border: `1px solid ${h.atanmis ? "rgba(31,111,74,.3)" : "var(--border2)"}`, transition: "all .2s" }}>
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

  const btnCls = (renk, disabled) => ({ padding: "10px 22px", borderRadius: 10, border: "none", background: disabled ? "var(--surface3)" : renk, color: disabled ? "var(--dim)" : "#fff", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 14 });

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
              <h3 className="mb-10" style={{ fontSize: 18, fontWeight: 600 }}>WhatsApp'ı Bağla</h3>
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
              <h3 className="mb-6" style={{ fontSize: 17, fontWeight: 600 }}>WhatsApp ile Tara</h3>
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
              <h3 className="mb-8" style={{ fontSize: 18, fontWeight: 600, color: "var(--green)" }}>WhatsApp Bağlı!</h3>
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
            <h3 className="mb-16" style={{ fontSize: 15, fontWeight: 600 }}>Telegram Botu Nasıl Oluşturulur?</h3>
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
                <h3 className="mb-12" style={{ fontSize: 15, fontWeight: 600 }}>Telegram Botunu Bağla</h3>
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

function StatCard({ baslik, deger }) {
  // Emoji ikon ve renkli rakam yok: etiket + rakam (tasarım sistemi v2)
  return (
    <div className="card-dark" style={{ flex: 1, minWidth: 150, padding: "16px 18px" }}>
      <div style={{ color: "var(--muted)", fontSize: 13, fontWeight: 500 }} className="mb-4">{baslik}</div>
      <div style={{ color: "var(--text)", fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em" }}>{deger}</div>
    </div>
  );
}

// Canlı Socket.IO bağlantı durumu göstergesi (işletme paneli top-bar için)
function CanliDurumu() {
  const { status } = useSocketStatus();
  const [cihazSayi, setCihazSayi] = useState(0);
  useSocketEvent("presence", (p) => { if (p && typeof p.cihaz === "number") setCihazSayi(p.cihaz); });
  const renk = status === "connected" ? "#1f6f4a" : status === "reconnecting" ? "#a8590c" : "#b42318";
  const metin = status === "connected" ? "Canlı" : status === "reconnecting" ? "Yeniden..." : "Bağlı değil";
  const title = status === "connected"
    ? `Canlı güncelleme aktif — ${cihazSayi} cihaz online`
    : "Socket.IO bağlantısı yok — yeni randevular için sayfayı yenileyin";
  return (
    <div title={title} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: `${renk}14`, border: `1px solid ${renk}33`, fontSize: 11, fontWeight: 600, color: renk }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: renk, boxShadow: status === "connected" ? `0 0 0 3px ${renk}22` : "none", animation: status === "connected" ? "pulseDot 2s infinite" : "none" }} />
      {metin}
      {status === "connected" && cihazSayi > 1 && (
        <span style={{ fontSize: 10, opacity: 0.8, marginLeft: 2 }}>• {cihazSayi} cihaz</span>
      )}
    </div>
  );
}

function Dashboard({ kullanici }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [stats, setStats] = useState(null);
  const [randevular, setRandevular] = useState([]);
  const [sayfa, setSayfa] = useState("anasayfa");
  const [magazaRandevu, setMagazaRandevu] = useState(null); // "Ürün öner" kısayolu: öneriyi randevuya bağlar
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
  const [gelirTahmini, setGelirTahmini] = useState(null);
  const [yogunlukTahmini, setYogunlukTahmini] = useState(null);
  const [calisanPopover, setCalisanPopover] = useState(null);
  const [profilPopover, setProfilPopover] = useState(false);
  const [odemeGerekli, setOdemeGerekli] = useState(false);
  const [duyurular, setDuyurular] = useState([]);
  const [bildirimler, setBildirimler] = useState([]);
  const [bildirimSayi, setBildirimSayi] = useState(0);
  const [bildirimPopover, setBildirimPopover] = useState(false);
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
  const [qrType, setQrType] = useState('whatsapp');
  const [qrData, setQrData] = useState(null);
  const [qrYukleniyor, setQrYukleniyor] = useState(false);

  useEffect(() => {
    const handler = () => setOdemeGerekli(true);
    window.addEventListener("odeme-gerekli", handler);
    const paketHandler = (e) => { setPaketModal(true); };
    window.addEventListener("paket-yetersiz", paketHandler);
    return () => { window.removeEventListener("odeme-gerekli", handler); window.removeEventListener("paket-yetersiz", paketHandler); };
  }, []);

  const verileriYukle = useCallback(async (tarih) => {
    try {
      const t = tarih || randevuTarih;
      const [s, r] = await Promise.all([
        api.get("/istatistikler"),
        api.get(`/randevular?tarih=${t}`),
      ]);
      if (s && !s.hata) setStats(s);
      setRandevular(r?.randevular || []);
    } catch(e) { console.log("Veri yükleme hatası:", e); }
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
    // Bildirimler
    api.get("/bildirimler?limit=5").then(d => setBildirimler(d.bildirimler || [])).catch(() => {});
    api.get("/bildirimler/okunmamis-sayi").then(d => setBildirimSayi(d.sayi || 0)).catch(() => {});
    // Shopier callback sonrası bildirim
    const params = new URLSearchParams(window.location.search);
    // Kurulum hatırlatma linki: ?sayfa=hizmetler → doğrudan o sayfa
    const hedef = params.get('sayfa');
    if (['hizmetler', 'calisanlar', 'botbaglanti', 'qrkod'].includes(hedef)) {
      setSayfa(hedef);
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (params.get('odeme') === 'basarili') {
      alert('✅ Ödemeniz başarıyla alındı! Teşekkürler.');
      window.history.replaceState({}, '', window.location.pathname);
      api.get("/odeme/durum").then(d => { if (!d.hata) setOdemeBilgi(d); });
    } else if (params.get('odeme') === 'basarisiz') {
      alert('❌ Ödeme işlemi başarısız oldu. Lütfen tekrar deneyin.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [verileriYukle]);

  // Bildirim sayısını periyodik olarak güncelle
  useEffect(() => {
    const interval = setInterval(() => {
      api.get("/bildirimler/okunmamis-sayi").then(d => setBildirimSayi(d.sayi || 0)).catch(() => {});
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ═══════════ CANLI YAYIN (Socket.IO) ═══════════
  // Yardımcı: ses + titreşim + toast
  const canliToast = (mesaj, renk = "#1f6f4a", sure = 3500) => {
    try {
      const el = document.createElement("div");
      el.textContent = mesaj;
      el.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;padding:14px 20px;background:${renk};color:#fff;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:380px;line-height:1.4;animation:slideIn .3s ease;cursor:pointer;`;
      el.onclick = () => { try { el.remove(); } catch(e){} };
      document.body.appendChild(el);
      setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, sure);
      setTimeout(() => { try { el.remove(); } catch(e){} }, sure + 700);
    } catch(e) {}
  };
  // AudioContext singleton — autoplay politikaları için ilk etkileşimde unlock edilir
  const audioCtxRef = useRef(null);
  const audioUnlockedRef = useRef(false);
  const _getAudioCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    return audioCtxRef.current;
  };
  // canliSes / canliTitret artık merkezi bildirim.js helper'ına yönlendirir
  // (MP3 desteği, kullanıcı ayarı, dedup, sessiz mod, 3x tekrar)
  const canliSes = (opts = {}) => bildirimCal(opts);
  const canliTitret = () => bildirimTitret();

  // Audio unlock — ilk kullanıcı etkileşiminde AudioContext'i resume et (iOS Safari, Chrome autoplay)
  useEffect(() => {
    const unlock = () => {
      if (audioUnlockedRef.current) return;
      const ctx = _getAudioCtx();
      if (!ctx) return;
      ctx.resume().then(() => {
        // Sessiz kısa bir ping çalarak context'i warm tut
        try {
          const o = ctx.createOscillator(), g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, ctx.currentTime);
          o.connect(g); g.connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.01);
        } catch(e) {}
        audioUnlockedRef.current = true;
      }).catch(() => {});
    };
    const events = ["click", "touchstart", "keydown"];
    events.forEach(ev => document.addEventListener(ev, unlock, { once: false, passive: true }));
    return () => events.forEach(ev => document.removeEventListener(ev, unlock));
  }, []);

  // Yeni randevu → listeye ekle + ses + titreşim + toast
  useSocketEvent("randevu:yeni", (payload) => {
    const { randevu, musteri, hizmet } = payload || {};
    if (!randevu) return;
    // Listeye prepend (aynı tarih ise)
    setRandevular(prev => {
      if (prev.find(r => r.id === randevu.id)) return prev;
      // Randevu eğer görünen güne ait değilse sadece toast, listeye ekleme
      if (String(randevu.tarih).slice(0, 10) !== randevuTarih) return prev;
      return [{
        ...randevu,
        musteri_isim: musteri?.isim,
        musteri_telefon: musteri?.telefon,
        hizmet_isim: hizmet?.isim,
        hizmet_fiyat: hizmet?.fiyat,
      }, ...prev];
    });
    canliSes({ dedupId: `randevu-${randevu.id}` });
    canliTitret();
    const saatStr = String(randevu.saat).slice(0, 5);
    canliToast(`🎉 Yeni randevu: ${musteri?.isim || "Müşteri"} — ${saatStr}`);
    // Dükkan Modu aktifse fullscreen popup göster
    try {
      window.dispatchEvent(new CustomEvent("dukkan:yeniRandevu", {
        detail: { randevu, musteri, hizmet, saatStr }
      }));
    } catch (e) {}
    // İstatistiği tazele (arka planda)
    api.get("/istatistikler").then(s => { if (s && !s.hata) setStats(s); }).catch(() => {});
  });

  // Randevu durumu güncellendi (onay, iptal, tamamlandı, gelmedi...)
  useSocketEvent("randevu:guncellendi", (payload) => {
    const { randevu, yeni_durum } = payload || {};
    if (!randevu) return;
    setRandevular(prev => prev.map(r => r.id === randevu.id ? { ...r, ...randevu, durum: yeni_durum || randevu.durum } : r));
  });

  // Yeni müşteri
  useSocketEvent("musteri:yeni", (payload) => {
    const { musteri } = payload || {};
    if (!musteri) return;
    setMusteriler(prev => {
      if (prev.find(m => m.id === musteri.id)) return prev;
      return [musteri, ...prev];
    });
  });

  // Yeni bildirim → rozet +1, toast + ses
  useSocketEvent("bildirim:yeni", (payload) => {
    const { bildirim } = payload || {};
    if (!bildirim) return;
    setBildirimler(prev => [bildirim, ...prev].slice(0, 50));
    setBildirimSayi(s => s + 1);
    canliSes();
    canliToast(`🔔 ${bildirim.baslik}`, "#2f56c6");
  });

  // Ödeme onaylandı (esnaf tarafı)
  useSocketEvent("odeme:onaylandi", (p) => {
    if (!p) return;
    canliSes();
    canliToast(`✅ Ödemeniz alındı: ${p.tutar}₺`, "#1f6f4a");
    // Paket/ödeme bilgilerini tazele
    api.get("/odeme/durum").then(d => { if (!d.hata) setOdemeBilgi(d); }).catch(() => {});
    api.get("/paket").then(d => { if (d.paket) setPaketDurum(d); }).catch(() => {});
  });

  // Destek cevap geldi
  useSocketEvent("destek:cevap", (payload) => {
    const { talep_id, konu } = payload || {};
    setDestekTaleplerim(prev => prev.map(t => t.id === talep_id ? { ...t, admin_yanit: payload.admin_yanit, durum: payload.durum, admin_yanit_tarihi: payload.admin_yanit_tarihi } : t));
    canliSes();
    canliToast(`💬 Destek yanıtı: "${konu || 'Talep'}"`, "#5d4bb5");
  });

  // Wake Lock — tablet ekranı kapanmasın (dükkan için)
  useEffect(() => {
    if (!("wakeLock" in navigator)) return;
    let wakeLock = null;
    const aktifEt = async () => {
      // Sessiz mod değilse her sayfada aktif tut (dükkan modu için)
      try {
        const ayar = bildirimAyarOku();
        if (ayar?.sessiz) return;
      } catch {}
      if (document.visibilityState !== "visible") return;
      try { wakeLock = await navigator.wakeLock.request("screen"); } catch (e) { /* ignore */ }
    };
    const kapat = async () => { try { await wakeLock?.release(); wakeLock = null; } catch(e) {} };
    aktifEt();
    const visHandler = () => { if (document.visibilityState === "visible") aktifEt(); };
    document.addEventListener("visibilitychange", visHandler);
    return () => { document.removeEventListener("visibilitychange", visHandler); kapat(); };
  }, [sayfa]);

  // WhatsApp bağlantı olayları (QR, bağlı, ayrıldı)
  useSocketEvent("wa:qr", (payload) => {
    try { window.dispatchEvent(new CustomEvent("wa:qr", { detail: payload })); } catch(e) {}
  });
  useSocketEvent("wa:bagli", (payload) => {
    try { window.dispatchEvent(new CustomEvent("wa:bagli", { detail: payload })); } catch(e) {}
    canliToast(`✅ WhatsApp bağlandı${payload?.numara ? ` (+${payload.numara})` : ""}`);
  });
  useSocketEvent("wa:ayrildi", (payload) => {
    try { window.dispatchEvent(new CustomEvent("wa:ayrildi", { detail: payload })); } catch(e) {}
    // 401 / auth reddi → kullanıcıya yönlendirici açıklama göster (uzun timeout)
    if (payload?.sebep === 'unauthorized' && payload?.mesaj) {
      canliToast(`⚠️ ${payload.mesaj}`, "#b42318", 12000);
    } else if (payload?.sebep === 'qr_not_scanned') {
      canliToast("⏱️ QR kod taranmadı — 'QR Kodu Göster' ile yeniden deneyin", "#a8590c", 6000);
    } else if (payload?.sebep === 'max_reconnect') {
      canliToast("⚠️ Yeniden bağlanma denemesi aşıldı — QR ile tekrar bağlayın", "#b42318", 8000);
    } else {
      canliToast("⚠️ WhatsApp bağlantısı kesildi", "#b42318");
    }
  });

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
    if (sayfa === "bildirimler") api.get("/bildirimler?limit=50").then(d => setBildirimler(d.bildirimler || [])).catch(() => {});
    if (sayfa === "anasayfa") {
      api.get("/calisanlar").then(d => setDashCalisanlar(d.calisanlar || [])).catch(() => {});
      api.get("/gelir-tahmini").then(d => { if (d && !d.hata) setGelirTahmini(d); }).catch(() => {});
      api.get("/yogunluk-tahmini").then(d => { if (d && !d.hata) setYogunlukTahmini(d); }).catch(() => {});
    }
  }, [sayfa]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [testCevaplar]);

  const DR = { onaylandi: "#1f6f4a", onay_bekliyor: "#a8590c", bekliyor: "#a8590c", iptal: "#b42318", tamamlandi: "#2f56c6", gelmedi: "#6b7280", kapora_bekliyor: "#a8590c" };
  const DL = { onaylandi: "Onaylı ✓", onay_bekliyor: "Onay Bekliyor", bekliyor: "Bekliyor", iptal: "İptal", tamamlandi: "Tamamlandı", gelmedi: "Gelmedi", kapora_bekliyor: "💳 Kapora Bekleniyor" };

  const botTest = async () => {
    if (!testMesaj.trim()) return;
    setTestYukleniyor(true);
    setTestCevaplar(prev => [...prev, { yon: "giden", mesaj: testMesaj }]);
    try {
      const d = await api.post("/bot/test", { telefon: testTelefon, mesaj: testMesaj });
      if (d && d.cevaplar && d.cevaplar.length > 0) {
        // Bot düğmeli cevapta {metin, butonlar} döndürür; React nesneyi çizemez (hata #31) → metne çevir
        d.cevaplar.forEach(c => {
          const mesaj = typeof c === "string" ? c : String(c?.metin ?? c?.mesaj ?? c?.text ?? "");
          const butonlar = Array.isArray(c?.butonlar) ? c.butonlar.map(b => typeof b === "string" ? b : (b?.text || b?.body || b?.baslik || "")).filter(Boolean) : [];
          setTestCevaplar(prev => [...prev, { yon: "gelen", mesaj, butonlar }]);
        });
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

  const cikisYap = () => { try { socketDisconnect(); } catch(e){} oturumuKapat(); api.token = null; window.location.reload(); };

  const qrKodOlustur = async () => {
    setQrYukleniyor(true);
    try { const d = await api.get(`/qr-kod?type=${qrType}`); setQrData(d); } catch(e) { alert('Hata: ' + e.message); }
    setQrYukleniyor(false);
  };

  const sayfaBaslik = { anasayfa: "Dashboard", randevular: "Randevular", hizmetler: "Hizmetler", calisanlar: "Çalışanlar", musteriler: "Müşteriler", kasa: "Kasa", magaza: "Mağaza", sms: "SMS Hatırlatma", geceraporu: "Gece Raporu", yorumavcisi: "Yorum Avcısı", winback: "Kayıp Müşteriler", sadakat: "Sadakat Puan", referans: "Referans Ağı", finans: "Finans & Kapora", botbaglanti: "Bot Bağlantısı", bottest: "Bot Test", qrkod: "QR Kod", bildirimler: "Bildirimler", destek: "Destek", ayarlar: "Ayarlar" };

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

  // SVG ikonları (grup + items)
  const ICON = {
    magaza: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
    kasa: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
    sms: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>,
    gece: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
    yorum: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
    sadakat: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>,
    getir: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>,
    qr: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="3" height="3"/><line x1="21" y1="14" x2="21" y2="17"/><line x1="14" y1="21" x2="17" y2="21"/></svg>,
    destek: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    sube: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>,
    pazarlama: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>,
    bot: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></svg>,
  };

  // Menü grupları — hiyerarşik yapı
  // type: 'flat' = divider'lar arasında direkt item'lar
  // type: 'group' = açılır/kapanır accordion
  const tamMenu = [
    { type: 'flat', items: [
      { id: "anasayfa", icon: SVG.dashboard, label: "Dashboard" },
      { id: "randevular", icon: SVG.randevular, label: "Randevular" },
      { id: "kasa", icon: ICON.kasa, label: "Kasa", featureKey: "kasa" },
      { id: "finans", icon: SVG.finans, label: "Finans" },
    ]},
    { type: 'flat', items: [
      { id: "musteriler", icon: SVG.musteriler, label: "Müşteriler" },
      { id: "calisanlar", icon: SVG.calisanlar, label: "Çalışanlar" },
      { id: "hizmetler", icon: SVG.hizmetler, label: "Hizmetler" },
    ]},
    { type: 'group', id: 'gr_pazarlama', icon: ICON.pazarlama, label: 'Pazarlama', items: [
      { id: "sms", icon: ICON.sms, label: "SMS", featureKey: "sms_hatirlatma" },
      { id: "musterigetir", icon: ICON.getir, label: "Müşteri Getir" },
      { id: "sadakat", icon: ICON.sadakat, label: "Sadakat", featureKey: "sadakat" },
      { id: "winback", icon: SVG.winback, label: "Kayıp Müşteri", featureKey: "winback" },
      { id: "yorumavcisi", icon: ICON.yorum, label: "Yorum Avcısı", featureKey: "yorum_avcisi" },
      { id: "magaza", icon: ICON.magaza, label: "Mağaza", featureKey: "magaza" },
    ]},
    { type: 'group', id: 'gr_bot', icon: ICON.bot, label: 'Bot & Sistem', items: [
      { id: "botbaglanti", icon: SVG.botbaglanti, label: "Bot Bağlantısı" },
      { id: "bottest", icon: SVG.bottest, label: "Bot Test" },
      { id: "qrkod", icon: ICON.qr, label: "QR Kod" },
    ]},
    { type: 'flat', items: [
      { id: "geceraporu", icon: ICON.gece, label: "Gece Raporu", featureKey: "gece_raporu" },
      { id: "grup", icon: ICON.sube, label: "Şubelerim", featureKey: "sube_yonetimi", rolOnly: ['admin', 'isletme', 'grup_sahibi'] },
      { id: "destek", icon: ICON.destek, label: "Destek" },
      { id: "ayarlar", icon: SVG.ayarlar, label: "Ayarlar" },
    ]},
  ];

  // SıraGO Lite (kullanıcı kararı 2026-10-08): esnafın önünde yalnız günlük iş. NULL → pakete göre.
  const proPaket = ['proplus', 'kurumsal', 'premium'].includes(paketDurum?.paket);
  const liteMod = ayarlar?.panel_modu ? ayarlar.panel_modu === 'lite' : (paketDurum ? !proPaket : false);
  const liteMenu = [
    { type: 'flat', items: [
      { id: "anasayfa", icon: SVG.dashboard, label: "Bugün" },
      { id: "randevular", icon: SVG.randevular, label: "Randevular" },
      { id: "hizmetler", icon: SVG.hizmetler, label: "Hizmetler & Fiyatlar" },
      { id: "musteriler", icon: SVG.musteriler, label: "Müşteriler" },
    ]},
    { type: 'flat', items: [
      { id: "botbaglanti", icon: SVG.botbaglanti, label: "WhatsApp Bağlantısı" },
      { id: "qrkod", icon: ICON.qr, label: "Randevu Linki & QR" },
      { id: "destek", icon: ICON.destek, label: "Destek" },
      { id: "ayarlar", icon: SVG.ayarlar, label: "Ayarlar" },
    ]},
  ];
  const menuGroups = liteMod ? liteMenu : tamMenu;

  // Rol bazlı gizlenen sayfalar (sube_muduru için)
  const subeMuduruGizli = ['finans','qrkod','sms','geceraporu','yorumavcisi','winback','sadakat','musterigetir','grup'];

  // Alt şubede mi? (grup_sahibi farklı bir şubeye geçmişse Şubelerim gizlenir)
  const aktifIsletmeLS = localStorage.getItem('aktifIsletme');
  const altSubeModu = kullanici?.rol === 'grup_sahibi' && !!aktifIsletmeLS && String(aktifIsletmeLS) !== String(kullanici?.isletme_id);

  // Item filtresi (rol + sube_muduru kısıtı + alt şube modu)
  const itemGorunur = (m) => {
    if (m.rolOnly && kullanici?.rol && !m.rolOnly.includes(kullanici.rol)) return false;
    if (kullanici?.rol === 'sube_muduru' && subeMuduruGizli.includes(m.id)) return false;
    // Alt şube panelindeyken "Şubelerim" menüsü gizli — SubeSwitcher'dan merkeze dönebilir
    if (altSubeModu && m.id === 'grup') return false;
    return true;
  };

  // Grupları filtrele — boş kalan gruplar görünmez
  const gorunurGruplar = menuGroups.map(g => ({
    ...g,
    items: g.items.filter(itemGorunur),
  })).filter(g => g.items.length > 0);

  // Flat bir liste (arama/referans için — sidebar-nav superadmin tarafında kullanılıyor olabilir)
  const menuItems = gorunurGruplar.flatMap(g => g.items);

  // Accordion — hangi grup açık (aktif sayfa hangi gruptaysa o otomatik açık)
  const aktifGrup = gorunurGruplar.find(g => g.type === 'group' && g.items.some(i => i.id === sayfa))?.id;
  const [acikGrup, setAcikGrup] = useState(aktifGrup || null);
  // Aktif sayfa değişince o gruba geçilsin (farklı gruptan tıklanınca otomatik aç)
  useEffect(() => { if (aktifGrup) setAcikGrup(aktifGrup); }, [aktifGrup]);

  // Özellik paket kontrolü helper
  const ozellikAcik = (featureKey) => {
    if (!featureKey || !paketDurum?.paket_bilgi) return true;
    return !!paketDurum.paket_bilgi[featureKey];
  };

  return (
    <div className="app-shell">

      {/* 🔔 Bildirim aktivasyon banner (ilk girişte) + 🛍️ Dükkan Modu Popup */}
      <BildirimAktivasyon />
      <DukkanModuPopup />

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
          <span className="marka-monogram" aria-label="SıraGO">S</span>
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

        {kullanici?.rol === 'grup_sahibi' && (
          <div style={{ padding: '0 16px 12px' }}>
            <SubeSwitcher api={api} onGrupYonetim={() => setSayfa('grup')} />
          </div>
        )}

        <nav className="sidebar-nav">
          {gorunurGruplar.map((grup, grupIdx) => {
            // Tek item fonksiyonu
            const renderItem = (m, indent = false) => {
              const kilitli = m.featureKey && !ozellikAcik(m.featureKey);
              return (
                <div key={m.id} onClick={() => { if (kilitli) { setPaketModal(true); } else { setSayfa(m.id); setMagazaRandevu(null); setMobileOpen(false); } }} className={`nav-item${sayfa === m.id ? ' active' : ''}${kilitli ? ' locked' : ''}`} style={indent ? { paddingLeft: 32 } : undefined} title={kilitli ? 'Bu özellik paketinizde yok — yükseltmek için tıklayın' : ''}>
                  <span className="nav-icon">{m.icon}</span>
                  <span>{m.label}</span>
                  {kilitli && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', opacity: 0.5 }}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
                  {!kilitli && sayfa === m.id && <div className="active-dot" />}
                </div>
              );
            };

            // Flat grup — divider + direkt items
            if (grup.type === 'flat') {
              return (
                <div key={`flat-${grupIdx}`}>
                  {grupIdx > 0 && <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '8px 16px' }} />}
                  {grup.items.map(m => renderItem(m))}
                </div>
              );
            }

            // Accordion grup — header + açıksa items (ikonlarla hafif girintili)
            const acik = acikGrup === grup.id;
            const aktifIcinde = grup.items.some(i => i.id === sayfa);
            return (
              <div key={grup.id}>
                <div style={{ height: 1, background: 'rgba(255,255,255,.06)', margin: '8px 16px' }} />
                <div
                  onClick={() => setAcikGrup(acik ? null : grup.id)}
                  className={`nav-item${aktifIcinde ? ' active' : ''}`}
                  style={{ cursor: 'pointer', fontWeight: 600 }}
                >
                  <span className="nav-icon">{grup.icon}</span>
                  <span>{grup.label}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 'auto', transform: acik ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform .2s', opacity: 0.7 }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </div>
                {acik && <div>{grup.items.map(m => renderItem(m, true))}</div>}
              </div>
            );
          })}
        </nav>

        {paketDurum && (
          <div className="paket-widget">
            <div className="pw-header">
              <span className="pw-label">Paketiniz</span>
              <span className={`badge ${paketDurum.paket === 'kurumsal' || paketDurum.paket === 'premium' ? 'badge-amber' : paketDurum.paket === 'proplus' ? 'badge-green' : paketDurum.paket === 'profesyonel' ? 'badge-blue' : 'badge-gray'}`}>{paketDurum.paket_bilgi?.isim || paketDurum.paket}</span>
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
              const renk = kalan > 10 ? 'var(--green)' : kalan > 3 ? '#a8590c' : 'var(--red)';
              const label = tip === 'deneme' ? 'Deneme süresi' : `${paketDurum?.paket_bilgi?.isim || paketDurum?.paket || 'Paket'} süresi`;
              return (
                <div>
                  <div className="pw-bar-label">
                    <span>{label}</span>
                    <span style={{ color: kalan <= 3 ? 'var(--red)' : kalan <= 10 ? '#a8590c' : 'var(--dim)' }}>
                      {kalan > 0 ? `${kalan} gün kaldı` : 'Süre doldu'}
                    </span>
                  </div>
                  <div className="pw-bar-track">
                    <div className="pw-bar-fill" style={{ width: `${pctB}%`, background: renk }} />
                  </div>
                </div>
              );
            })()}
            {!['kurumsal', 'premium'].includes(paketDurum.paket) && (
              <div className="pw-upgrade" onClick={() => setPaketModal(true)}>
                <span>Paketi Yükselt</span>
              </div>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}><BackendHealth /></div>
          <button onClick={cikisYap} className="btn btn-ghost btn-block btn-sm">Çıkış Yap</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="main-wrap">
        <div className="top-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>{liteMod && sayfa === "anasayfa" ? "Bugün" : sayfaBaslik[sayfa]}</h1>
            {sayfa === "anasayfa" && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{new Date().toLocaleDateString("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>}
          </div>
          <div className="top-bar-right" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {/* Canlı bağlantı göstergesi */}
            <CanliDurumu />
            {/* Çalışan Avatarları + Ekip Dropdown */}
            {dashCalisanlar.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", position: "relative" }}
                onClick={() => setCalisanPopover(calisanPopover ? null : "ekip")}>
                {dashCalisanlar.slice(0, 4).map((c, i) => (
                  <div key={c.id} style={{
                    width: 32, height: 32, borderRadius: "50%", border: "2px solid var(--surface)",
                    background: ["#1f6f4a","#b42318","#2f56c6","#5d4bb5","#a8590c"][i % 5],
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600, color: "#fff",
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
                    fontSize: 10, fontWeight: 600, color: "var(--muted)", marginLeft: -8, zIndex: 0, cursor: "pointer"
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
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Ekip</div>
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
                          const renk = ["#1f6f4a","#b42318","#2f56c6","#5d4bb5","#a8590c"][i % 5];
                          return (
                            <div key={c.id} style={{
                              display: "flex", alignItems: "center", gap: 12, padding: "10px 8px",
                              borderRadius: 10, cursor: "default", transition: "background .15s"
                            }} onMouseOver={e => e.currentTarget.style.background = "var(--bg)"}
                               onMouseOut={e => e.currentTarget.style.background = "transparent"}>
                              <div style={{
                                width: 36, height: 36, borderRadius: 10, background: renk, flexShrink: 0,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 14, fontWeight: 600, color: "#fff"
                              }}>{c.isim?.charAt(0)?.toUpperCase()}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.isim}</div>
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
            {/* Bildirim Zil İkonu */}
            <div style={{ position: "relative" }}>
              <div onClick={() => { setBildirimPopover(!bildirimPopover); if (!bildirimPopover) { api.get("/bildirimler?limit=5").then(d => setBildirimler(d.bildirimler || [])).catch(() => {}); } }}
                style={{ width: 36, height: 36, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                {bildirimSayi > 0 && (
                  <div style={{ position: "absolute", top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, background: "#b42318", color: "#fff", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px", border: "2px solid var(--surface)" }}>
                    {bildirimSayi > 99 ? "99+" : bildirimSayi}
                  </div>
                )}
              </div>
              {bildirimPopover && (
                <>
                  <div onClick={() => setBildirimPopover(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 49 }} />
                  <div style={{ position: "absolute", top: 44, right: 0, zIndex: 50, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, width: 340, maxHeight: 420, overflow: "hidden", boxShadow: "0 16px 48px rgba(22,5,39,.14)", animation: "fadeIn .18s ease" }}>
                    <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Bildirimler</div>
                      {bildirimSayi > 0 && (
                        <button onClick={async (e) => { e.stopPropagation(); await api.put("/bildirimler/tumunu-oku"); setBildirimSayi(0); setBildirimler(prev => prev.map(b => ({ ...b, okundu: true }))); }}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Tümünü Oku</button>
                      )}
                    </div>
                    <div style={{ overflowY: "auto", maxHeight: 300 }}>
                      {bildirimler.length === 0 ? (
                        <div style={{ padding: 24, textAlign: "center", color: "var(--dim)", fontSize: 13 }}>Bildirim yok</div>
                      ) : bildirimler.map(b => (
                        <div key={b.id} onClick={async () => { if (!b.okundu) { await api.put(`/bildirimler/${b.id}/okundu`); setBildirimSayi(s => Math.max(0, s - 1)); setBildirimler(prev => prev.map(x => x.id === b.id ? { ...x, okundu: true } : x)); } }}
                          style={{ padding: "12px 16px", borderBottom: "1px solid var(--bg)", cursor: "pointer", background: b.okundu ? "transparent" : "rgba(47,86,198,.04)", transition: "background .15s" }}
                          onMouseOver={e => e.currentTarget.style.background = "var(--bg)"} onMouseOut={e => e.currentTarget.style.background = b.okundu ? "transparent" : "rgba(47,86,198,.04)"}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <div style={{ fontSize: 18, flexShrink: 0, marginTop: 2 }}>
                              {b.tip === "zombi" ? "⚠️" : b.tip === "randevu" ? "📅" : b.tip === "odeme" ? "💰" : "🔔"}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: b.okundu ? 500 : 700, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.baslik}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.mesaj}</div>
                              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4 }}>{new Date(b.olusturma_tarihi).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                            </div>
                            {!b.okundu && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#2f56c6", flexShrink: 0, marginTop: 6 }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                    {bildirimler.length > 0 && (
                      <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                        <button onClick={() => { setBildirimPopover(false); setSayfa("bildirimler"); }}
                          style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Tümünü Gör</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

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
                    fontSize: 13, fontWeight: 600, color: "#fff"
                  }}>{ayarlar.isim?.charAt(0)?.toUpperCase() || "?"}</div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>{ayarlar.isim}</div>
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
                          fontSize: 16, fontWeight: 600, color: "#fff"
                        }}>{ayarlar.isim?.charAt(0)?.toUpperCase() || "?"}</div>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{ayarlar.isim}</div>
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
                          <span className={`badge ${paketDurum.paket === 'kurumsal' || paketDurum.paket === 'premium' ? 'badge-amber' : paketDurum.paket === 'proplus' ? 'badge-green' : paketDurum.paket === 'profesyonel' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 11 }}>{paketDurum.paket_bilgi?.isim || paketDurum.paket}</span>
                        </div>
                      )}
                      <button onClick={() => { setProfilPopover(false); setSayfa("ayarlar"); }} style={{
                        width: "100%", padding: "8px 0", borderRadius: 10, border: "1px solid var(--border)",
                        background: "var(--bg)", color: "var(--text)", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: "inherit", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                      }}>⚙️ Ayarlar</button>
                      <button onClick={() => { setProfilPopover(false); cikisYap(); }} style={{
                        width: "100%", padding: "8px 0", borderRadius: 10, border: "none",
                        background: "rgba(180,35,24,.08)", color: "#b42318", fontSize: 12, fontWeight: 600,
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
          {sayfa === "anasayfa" && <KurulumKarti api={api} setSayfa={setSayfa} />}
          {sayfa === "anasayfa" && liteMod && (
            <LiteBugun api={api} ayarlar={ayarlar} setSayfa={setSayfa} />
          )}
          {sayfa === "anasayfa" && !liteMod && (() => {
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
                        const tipRenk = { bilgi: "#2f56c6", guncelleme: "#1f6f4a", bakim: "#a8590c", uyari: "#b42318" };
                        const tipIcon = { bilgi: "ℹ️", guncelleme: "🆕", bakim: "🔧", uyari: "⚠️" };
                        const renk = tipRenk[d.tip] || "#2f56c6";
                        return (
                          <div key={d.id} style={{ padding: "6px 10px", borderRadius: 8, background: `${renk}08`, borderLeft: `3px solid ${renk}` }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", display: "flex", alignItems: "center", gap: 4 }}>
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
                        <span style={{ fontSize: 28, fontWeight: 600, color: "var(--text)", letterSpacing: "-.5px" }}>{haftaRandevu}</span>
                        {stats?.hafta?.onaylanan > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: "#2f56c6", background: "rgba(47,86,198,.1)", padding: "2px 8px", borderRadius: 6 }}>✓ {stats.hafta.onaylanan}</span>}
                      </div>
                    </div>
                    
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--surface3)", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "#2f56c6", width: `${Math.min(100, haftaRandevu * 3)}%`, transition: "width .4s" }} />
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
                        <div style={{ height: "100%", borderRadius: 3, background: pctR > 80 ? "#b42318" : pctR > 60 ? "#a8590c" : "#1f6f4a", width: `${pctR}%`, transition: "width .4s" }} />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
                        <span>Müşteri</span>
                        <span style={{ fontWeight: 600 }}>{toplamMusteri}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: "var(--surface3)", overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 3, background: "#b42318", width: `${Math.min(100, toplamMusteri * 2)}%`, transition: "width .4s" }} />
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
                    const bekleyen = randevular.filter(r => r.durum === "onay_bekliyor" || r.durum === "bekliyor").length; // gerçek akış onay_bekliyor kullanır
                    return (
                      <div style={{ background: bekleyen > 0 ? "rgba(168,89,12,.04)" : "var(--surface)", borderRadius: 16, padding: "18px 22px", border: `1px solid ${bekleyen > 0 ? "rgba(168,89,12,.15)" : "var(--border)"}`, cursor: "pointer" }} onClick={() => setSayfa("randevular")}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>Bekleyen Onay</div>
                          
                        </div>
                        <div style={{ fontSize: 28, fontWeight: 600, color: bekleyen > 0 ? "#a8590c" : "var(--text)", letterSpacing: "-.5px" }}>{bekleyen}</div>
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
                        <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text)", letterSpacing: "-.5px" }}>₺{toplamAylik.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                          
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
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>₺{parseFloat(g.gelir).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}</span>
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
                      
                    </div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: "#a8590c", letterSpacing: "-.5px" }}>{yorumIstat?.gonderilen || 0}</div>
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
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Randevu Analizi</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Toplam randevular ve onaylananlar haftalık</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)" }}>Aylık</span>
                  </div>
                  {grafikVeri && (
                    <div style={{ position: "relative", height: 220 }}>
                      <Bar data={{
                        labels: (grafikVeri.haftalik || []).map(h => { const d = new Date(h.tarih); return d.toLocaleDateString("tr-TR", { weekday: "short" }); }),
                        datasets: [
                          { label: "Toplam", data: (grafikVeri.haftalik || []).map(h => parseInt(h.sayi)), backgroundColor: "rgba(31,111,74,.45)", hoverBackgroundColor: "rgba(31,111,74,.7)", borderRadius: 8, borderSkipped: false },
                          { label: "Onaylanan", data: (grafikVeri.haftalik || []).map(h => parseInt(h.onaylanan)), backgroundColor: "rgba(31,111,74,.2)", hoverBackgroundColor: "rgba(31,111,74,.4)", borderRadius: 8, borderSkipped: false },
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
                  {/* Dekoratif parlayan halka kaldırıldı (tasarım sistemi v2) */}

                  {/* Başlık */}
                  <div style={{ padding: "0 20px", textAlign: "left", marginBottom: 10, paddingTop: 18 }}>
                    <div style={{ color: "var(--text)", fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Botu deneyin</div>
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
                        <span style={{ whiteSpace: "pre-wrap" }}>{String(m.mesaj ?? "")}</span>
                        {m.butonlar?.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                            {m.butonlar.map((b, j) => <span key={j} className="pill pill-xs">{b}</span>)}
                          </div>
                        )}
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
                  
                  <div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, marginBottom: 2 }}>Günün En Çok Kazandıran Hizmeti</div>
                    {dashEkstra?.topHizmet ? (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{dashEkstra.topHizmet.isim}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{dashEkstra.topHizmet.adet} randevu · {dashEkstra.topHizmet.toplam_ciro}₺</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: "var(--dim)" }}>Bugün henüz randevu yok</div>}
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "18px 22px", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 16 }}>
                  
                  <div>
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, marginBottom: 2 }}>Günün En Çok Randevu Alan Çalışanı</div>
                    {dashEkstra?.topCalisan ? (
                      <>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{dashEkstra.topCalisan.isim}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{dashEkstra.topCalisan.adet} randevu bugün</div>
                      </>
                    ) : <div style={{ fontSize: 13, color: "var(--dim)" }}>Bugün henüz randevu yok</div>}
                  </div>
                </div>
              </div>

              {/* ── ROW 3.6: Gelir Tahmini + Yoğunluk Tahmini ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                {/* Gelir Tahmini Kartı */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>Gelir Tahmini</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Önümüzdeki 7 gün</div>
                    </div>
                  </div>
                  {gelirTahmini ? (
                    <>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 26, fontWeight: 600, color: "#1f6f4a" }}>₺{(gelirTahmini.duzeltilmisGelir || 0).toLocaleString("tr-TR")}</span>
                        <span style={{ fontSize: 11, color: "var(--dim)" }}>tahmini</span>
                      </div>
                      {gelirTahmini.noShowOran > 0 && (
                        <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>
                          ⚠️ No-show düzeltmesi: %{gelirTahmini.noShowOran} (brüt: ₺{(gelirTahmini.toplamTahmini || 0).toLocaleString("tr-TR")})
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {(gelirTahmini.gunluk || []).map((g, i) => {
                          const d = new Date(g.tarih);
                          const gunler = ["Paz","Pzt","Sal","Çar","Per","Cum","Cmt"];
                          return (
                            <div key={i} style={{ flex: "1 1 40px", textAlign: "center", padding: "6px 4px", borderRadius: 8, background: "var(--surface2)", minWidth: 40 }}>
                              <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600 }}>{gunler[d.getDay()]}</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{parseInt(g.randevu_sayi)}</div>
                              <div style={{ fontSize: 9, color: "var(--muted)" }}>₺{Math.round(parseFloat(g.tahmini_gelir)).toLocaleString("tr-TR")}</div>
                            </div>
                          );
                        })}
                      </div>
                      {gelirTahmini.gecenHaftaGelir > 0 && (
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 8 }}>
                          📊 Geçen hafta: ₺{gelirTahmini.gecenHaftaGelir.toLocaleString("tr-TR")} gerçekleşti
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--dim)", padding: "16px 0", textAlign: "center" }}>Yükleniyor...</div>
                  )}
                </div>

                {/* Yoğunluk Tahmini Kartı */}
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>Doluluk Durumu</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Bugün ve yarın</div>
                    </div>
                  </div>
                  {yogunlukTahmini ? (
                    <div style={{ display: "flex", gap: 16 }}>
                      {[
                        { label: "Bugün", data: yogunlukTahmini.bugun },
                        { label: "Yarın", data: yogunlukTahmini.yarin }
                      ].map((item, i) => {
                        const renkMap = { green: "#1f6f4a", yellow: "#a8590c", red: "#b42318" };
                        const renk = renkMap[item.data?.renk] || "#9ca3af";
                        const doluluk = item.data?.doluluk || 0;
                        return (
                          <div key={i} style={{ flex: 1, textAlign: "center", padding: "14px 10px", borderRadius: 12, background: "var(--surface2)" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 10 }}>{item.label}</div>
                            <div style={{ position: "relative", width: 70, height: 70, margin: "0 auto 8px" }}>
                              <svg width="70" height="70" viewBox="0 0 36 36">
                                <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--surface3)" strokeWidth="3" />
                                <circle cx="18" cy="18" r="15.9" fill="none" stroke={renk} strokeWidth="3"
                                  strokeDasharray={`${doluluk} ${100 - doluluk}`}
                                  strokeDashoffset="25" strokeLinecap="round"
                                  style={{ transition: "stroke-dasharray .6s" }} />
                              </svg>
                              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, color: renk }}>{doluluk}%</div>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dim)" }}>{item.data?.dolu || 0}/{item.data?.kapasite || 0} slot</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: "var(--dim)", padding: "16px 0", textAlign: "center" }}>Yükleniyor...</div>
                  )}
                </div>
              </div>

              {/* ── ROW 4: Gelir Trendi + Hizmet Dağılımı ── */}
              {grafikVeri && (
                <div className="dash-sub-grid" style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20, marginBottom: 20 }}>
                  {/* Aylık Gelir Line */}
                  <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Gelir Trendi</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>Bu ay</span>
                    </div>
                    <div style={{ position: "relative", height: 180 }}>
                      <Line data={{
                        labels: (grafikVeri.aylikGelir || []).map(g => { const d = new Date(g.tarih); return `${d.getDate()}/${d.getMonth()+1}`; }),
                        datasets: [{
                          label: "Gelir (₺)", data: (grafikVeri.aylikGelir || []).map(g => parseFloat(g.gelir)),
                          borderColor: "#1f6f4a", backgroundColor: "rgba(31,111,74,.06)", fill: true, tension: .4, pointRadius: 3, pointBackgroundColor: "#1f6f4a", pointBorderColor: "#fff", pointBorderWidth: 2, borderWidth: 2.5,
                        }]
                      }} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: "#9ca3af", font: { size: 10 }, autoSkip: true, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } }, y: { ticks: { color: "#9ca3af", font: { size: 10 }, callback: v => v + "₺" }, grid: { color: "rgba(22,5,39,.04)" } } } }} />
                    </div>
                  </div>

                  {/* Hizmet Dağılımı */}
                  <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)" }}>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)", marginBottom: 16 }}>Hizmet Dağılımı</div>
                    <div style={{ position: "relative", height: 200 }}>
                      <Doughnut data={{
                        labels: (grafikVeri.hizmetDagilimi || []).map(h => h.isim),
                        datasets: [{ data: (grafikVeri.hizmetDagilimi || []).map(h => parseInt(h.sayi)),
                          backgroundColor: ["#1f6f4a","#b42318","#2f56c6","#5d4bb5","#1f6f4a","#b42318","#2f56c6","#5d4bb5"],
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
                    
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Bugünün Randevuları</div>
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
                          fontWeight: 600, fontSize: 13, color: DR[r.durum] || "#9ca3af", flexShrink: 0
                        }}>{r.saat?.slice(0, 5)}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.musteri_isim || "İsimsiz"}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>{r.hizmetler_adlari || r.hizmet_isim}{r.hizmet_adet > 1 ? ` (${r.hizmet_adet})` : ''}</div>
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
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "22px 24px", border: "1px solid var(--border)", borderLeft: `4px solid ${odemeBilgi.odeme?.durum === 'odendi' ? '#1f6f4a' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? '#a8590c' : '#b42318'}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Paket & Ödeme Durumu</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>{odemeBilgi.donem} · {dashEkstra?.paket || odemeBilgi.paket || ''}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {dashEkstra?.paketKalanGun != null && (
                        <div style={{ padding: "6px 14px", borderRadius: 10, background: dashEkstra.paketKalanGun > 7 ? "rgba(31,111,74,.08)" : dashEkstra.paketKalanGun > 0 ? "rgba(168,89,12,.08)" : "rgba(180,35,24,.08)", display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 18 }}>{dashEkstra.paketKalanGun > 7 ? "✅" : dashEkstra.paketKalanGun > 0 ? "⚠️" : "🔴"}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: dashEkstra.paketKalanGun > 7 ? "#1f6f4a" : dashEkstra.paketKalanGun > 0 ? "#a8590c" : "#b42318" }}>
                              {dashEkstra.paketKalanGun > 0 ? `${dashEkstra.paketKalanGun} gün kaldı` : "Süre doldu"}
                            </div>
                            <div style={{ fontSize: 10, color: "var(--dim)" }}>Paket bitiş</div>
                          </div>
                        </div>
                      )}
                      <span className={`tag ${odemeBilgi.odeme?.durum === 'odendi' ? 'tag-green' : (odemeBilgi.odeme?.durum === 'havale_bekliyor' || (dashEkstra?.paketDurumTipi === 'deneme' && dashEkstra?.paketKalanGun > 0)) ? 'tag-amber' : 'tag-red'}`} style={{ padding: "4px 14px", fontSize: 12 }}>
                        {/* Deneme süresindeki işletmeye 'Ödenmedi' gösterilmiyor */}
                        {odemeBilgi.odeme?.durum === 'odendi' ? '✅ Ödendi' : odemeBilgi.odeme?.durum === 'havale_bekliyor' ? '⏳ Onay Bekliyor' : (dashEkstra?.paketDurumTipi === 'deneme' && dashEkstra?.paketKalanGun > 0) ? '🧪 Deneme Sürümü' : '❌ Ödenmedi'}
                      </span>
                    </div>
                  </div>

                  {/* Ödenmemiş → Tek tıkla uzat + havale */}
                  {(!odemeBilgi.odeme || !['odendi', 'havale_bekliyor'].includes(odemeBilgi.odeme.durum)) && (
                    <div>
                      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                        <button onClick={() => {
                          odemeSayfasiAc();
                        }} style={{ flex: 1, padding: "14px 20px", borderRadius: 14, border: "none", background: "#1f6f4a", color: "#fff", fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit", textAlign: "center" }}>
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
                    <div style={{ background: "rgba(31,111,74,.06)", border: "1px solid rgba(31,111,74,.15)", borderRadius: 12, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        
                        <div style={{ fontSize: 13, color: "#1f6f4a", fontWeight: 600 }}>Bu dönem ödemesi tamamlandı. Teşekkürler!</div>
                      </div>
                      {dashEkstra?.paket && dashEkstra.paket !== 'premium' && (
                        <button onClick={() => setPaketModal(true)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
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

            const durumSayac = { onaylandi: 0, onay_bekliyor: 0, bekliyor: 0, tamamlandi: 0, gelmedi: 0, iptal: 0, kapora_bekliyor: 0 };
            randevular.forEach(r => { if (durumSayac[r.durum] !== undefined) durumSayac[r.durum]++; else durumSayac.bekliyor++; });

            const bitmisDurum = ['iptal', 'tamamlandi', 'gelmedi'];
            const onayBekle = (r) => r.durum === 'onay_bekliyor'; // 'bekliyor' yalnız eski demo verisi; sayaç anlamsız '0:00' gösteriyordu
            const timeoutDk = ayarlar?.onay_timeout_dk || 30;

            const kalanSure = (r) => {
              if (!onayBekle(r) || !r.olusturma_tarihi) return null;
              const bitis = new Date(r.olusturma_tarihi).getTime() + timeoutDk * 60000;
              const kalan = Math.max(0, bitis - Date.now());
              if (kalan <= 0) return "süresi doldu";
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
                      <div style={{ position: "absolute", left: 0, width: 56, textAlign: "right", fontSize: 12, fontWeight: 600, color: "var(--dim)", top: -6 }}>
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
                    const renk = DR[r.durum] || "#a8590c";
                    return (
                      <div key={r.id} style={{
                        position: "absolute", left: 74, right: 0, top, height: h,
                        background: `${renk}18`, borderLeft: `3px solid ${renk}`,
                        borderRadius: 10, padding: "6px 12px", fontSize: 12, overflow: "hidden",
                        display: "flex", alignItems: "center", gap: 10,
                        opacity: bitmisDurum.includes(r.durum) ? 0.5 : 1,
                      }}>
                        <span style={{ fontWeight: 600, color: renk }}>{r.saat?.slice(0, 5)}</span>
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.musteri_isim || "İsimsiz"}</span>
                        {(r.hizmetler_adlari || r.hizmet_isim) && <span style={{ color: "var(--dim)" }}>· {r.hizmetler_adlari || r.hizmet_isim}{r.hizmet_adet > 1 ? ` (${r.hizmet_adet})` : ''}</span>}
                        <span style={{ marginLeft: "auto", background: `${renk}30`, color: renk, padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600 }}>
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
                  background: "rgba(31,111,74,0.12)", color: "#1f6f4a", fontSize: 13, fontWeight: 600
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
                  <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>
                    {aktifTab === "bugun" ? "📅 Bugünün Randevuları" : aktifTab === "dun" ? "⏪ Dünün Randevuları" : aktifTab === "yarin" ? "⏩ Yarının Randevuları" : "📅 Randevular"}
                  </div>
                  <div style={{ color: "var(--dim)", fontSize: 13, marginTop: 2 }}>{tarihLabel(randevuTarih)}</div>
                </div>
                <div style={{
                  background: "rgba(93,75,181,0.12)", color: "#5d4bb5", padding: "6px 16px",
                  borderRadius: 20, fontSize: 14, fontWeight: 600
                }}>
                  {randevular.length} randevu
                </div>
              </div>

              {/* Durum özet kartları */}
              {randevular.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
                  {[
                    { key: "onaylandi", label: "Onaylı", emoji: "✅", color: "#1f6f4a" },
                    { key: "bekliyor", label: "Bekliyor", emoji: "⏳", color: "#a8590c" },
                    { key: "tamamlandi", label: "Tamamlandı", emoji: "✔️", color: "#2f56c6" },
                    { key: "gelmedi", label: "Gelmedi", emoji: "❌", color: "#6b7280" },
                    { key: "iptal", label: "İptal", emoji: "🚫", color: "#b42318" },
                  ].filter(s => durumSayac[s.key] > 0).map(s => (
                    <div key={s.key} style={{
                      background: s.color + "12", borderRadius: 12, padding: "12px 14px",
                      display: "flex", alignItems: "center", gap: 10, border: `1px solid ${s.color}20`
                    }}>
                      <span style={{ fontSize: 20 }}>{s.emoji}</span>
                      <div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{durumSayac[s.key]}</div>
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
                      
                      <div style={{ color: "var(--text)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Randevu bulunamadı</div>
                      <div style={{ color: "var(--dim)", fontSize: 13 }}>{tarihLabel(randevuTarih)} için randevu yok</div>
                    </div>
                  ) : randevular.map(r => {
                    const durumRenk = DR[r.durum] || "#a8590c";
                    const bitmis = bitmisDurum.includes(r.durum);
                    const bekle = onayBekle(r);
                    const kalan = kalanSure(r);
                    const kalanDk = kalan ? (kalan.includes(":") ? parseInt(kalan.split(":")[0]) : 0) : 999;

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
                          color: durumRenk, fontWeight: 600, fontSize: 22, minWidth: 52,
                          textAlign: "center", lineHeight: 1, flexShrink: 0
                        }}>
                          {r.saat?.slice(0, 5)}
                        </div>

                        {/* Bilgiler */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{r.musteri_isim || "İsimsiz"}</span>
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
                            {(r.hizmetler_adlari || r.hizmet_isim) && <span>✂️ {r.hizmetler_adlari || r.hizmet_isim}{r.hizmet_adet > 1 ? ` (${r.hizmet_adet})` : ''}{(Number(r.toplam_fiyat) || Number(r.fiyat)) ? ` · ${(Number(r.toplam_fiyat) || Number(r.fiyat)).toLocaleString("tr-TR")}₺` : ""}</span>}
                            {r.calisan_isim && <span>👤 {r.calisan_isim}</span>}
                            {r.kapora_durumu && r.kapora_durumu !== 'yok' && (
                              <span style={{ color: r.kapora_durumu === 'odendi' ? '#1f6f4a' : '#a8590c', fontWeight: 600 }}>
                                💳 {r.kapora_durumu === 'odendi' ? `Ödendi (${Number(r.kapora_tutari).toLocaleString("tr-TR")}₺)` : `Bekliyor (${Number(r.kapora_tutari).toLocaleString("tr-TR")}₺)`}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Durum badge (sağ üst) + countdown */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
                          <div style={{
                            background: durumRenk + "20", color: durumRenk,
                            padding: "4px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                            whiteSpace: "nowrap", letterSpacing: "0.3px"
                          }}>
                            {DL[r.durum] || "Bekliyor"}
                          </div>
                          {bekle && kalan && (
                            <div style={{
                              fontSize: 11, fontWeight: 600, fontFamily: "monospace",
                              color: kalanDk < 5 ? "#b42318" : kalanDk < 15 ? "#a8590c" : "var(--dim)"
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
                                fontSize: 11, fontWeight: 600, transition: "all .15s",
                                background: r.durum === d ? DR[d] + "18" : "var(--surface2)",
                                color: r.durum === d ? DR[d] : "var(--dim)",
                                outline: r.durum === d ? `1px solid ${DR[d]}40` : "1px solid var(--border)"
                              }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      )}
                      {r.durum === "tamamlandi" && ozellikAcik("magaza") && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setMagazaRandevu(r.id); setSayfa("magaza"); }}>Ürün öner</button>
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
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(31,111,74,.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }} className="shrink-0">👤</div>
                  <div className="flex-1">
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{m.isim || "İsimsiz"}</div>
                    <div className="list-item-sub">📞 {m.telefon}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--green)", fontWeight: 600, fontSize: 15 }}>{m.randevu_sayisi}</div>
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
                    <div key={i} className={`chat-bubble ${c.yon === "giden" ? "out" : "in"}`}>
                      <span style={{ whiteSpace: "pre-wrap" }}>{String(c.mesaj ?? "")}</span>
                      {c.butonlar?.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                          {c.butonlar.map((b, j) => (
                            <button key={j} type="button" className="pill pill-xs" style={{ cursor: "pointer" }}
                              onClick={() => setTestMesaj(String(j + 1))} title="Müşteri bu seçeneği seçerse">{j + 1}. {b}</button>
                          ))}
                        </div>
                      )}
                    </div>
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
                      
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Kapora Ayarları</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>Ön ödeme kurallarını belirleyin</div>
                      </div>
                    </div>

                    {/* Toggle */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: fAyar.kapora_aktif ? "rgba(31,111,74,.06)" : "var(--surface2)", borderRadius: 12, marginBottom: 16, border: `1px solid ${fAyar.kapora_aktif ? "rgba(31,111,74,.2)" : "var(--border)"}` }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>💳 Kapora Sistemi</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{fAyar.kapora_aktif ? "Aktif — kapora alınıyor" : "Kapalı"}</div>
                      </div>
                      <div onClick={() => setFAyar(p => ({ ...p, kapora_aktif: !p.kapora_aktif }))} style={{ width: 44, height: 24, borderRadius: 12, background: fAyar.kapora_aktif ? "#1f6f4a" : "#ccc", cursor: "pointer", position: "relative", transition: "all .2s" }}>
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

                    <button onClick={kaydet} style={{ marginTop: 18, width: "100%", padding: "11px 0", borderRadius: 10, border: "none", background: fKaydedildi ? "#1f6f4a" : "var(--gradient)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit", transition: "all .3s" }}>
                      {fKaydedildi ? "✓ Kaydedildi" : "Kaydet"}
                    </button>
                  </div>

                  {/* ─── DİJİTAL CÜZDAN ─── */}
                  <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 24, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                      
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Dijital Cüzdan</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>Kapora gelir takibi</div>
                      </div>
                    </div>

                    {/* Net Bakiye - büyük kart */}
                    <div style={{ background: "#1f6f4a", borderRadius: 14, padding: "24px 20px", marginBottom: 16, color: "#fff", position: "relative", overflow: "hidden" }}>
                      <div style={{ position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,.08)" }} />
                      <div style={{ fontSize: 11, fontWeight: 500, opacity: .8, marginBottom: 4 }}>Kullanılabilir Bakiye</div>
                      <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1 }}>{tl(cz.net_bakiye)}</div>
                      {cz.net_bakiye >= 500 && <div style={{ marginTop: 8, fontSize: 11, background: "rgba(255,255,255,.2)", display: "inline-block", padding: "3px 10px", borderRadius: 20 }}>✓ Çekim yapılabilir</div>}
                    </div>

                    {/* Detay satırları */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
                      {[
                        { label: "Toplam Biriken Kapora", value: tl(cz.toplam_kapora), color: "#1f6f4a", icon: "📥" },
                        { label: "SıraGO Hizmet Bedeli", value: `- ${tl(cz.sirago_kesinti)}`, color: "#b42318", icon: "🏷️" },
                        { label: "Paket Ücretinden Mahsup", value: `- ${tl(cz.mahsup_edilen)}`, color: "#a8590c", icon: "🔄" },
                        { label: "Çekilen Tutar", value: `- ${tl(cz.cekilen)}`, color: "#6b7280", icon: "💸" },
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--surface2)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span>{item.icon}</span>
                            <span style={{ fontSize: 12, color: "var(--dim)" }}>{item.label}</span>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: 13, color: item.color }}>{item.value}</span>
                        </div>
                      ))}
                    </div>

                    {/* Hakediş butonu */}
                    <button
                      disabled={cz.net_bakiye < 500}
                      onClick={() => setHakedisAcik(true)}
                      style={{
                        marginTop: 16, width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
                        background: cz.net_bakiye >= 500 ? "#a8590c" : "var(--surface3)",
                        color: cz.net_bakiye >= 500 ? "#fff" : "var(--dim)", fontWeight: 600, fontSize: 13,
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
                      <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 20, color: "var(--text)" }}>💳 Bakiye Çekim Talebi</div>
                      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>Çekilecek tutar: <strong style={{ color: "#1f6f4a" }}>{tl(cz.net_bakiye)}</strong></div>
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
                        <button onClick={hakedisTalep} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "none", background: "#a8590c", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Talep Oluştur</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ─── SON KAPORA ÖDEMELERİ ─── */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 16, padding: 20, marginBottom: 20 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
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
                              <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{tl(o.kapora_tutari)}</td>
                              <td style={{ padding: "10px", textAlign: "center" }}>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20,
                                  background: o.kapora_durumu === "odendi" ? "rgba(31,111,74,.1)" : o.kapora_durumu === "bekliyor" ? "rgba(168,89,12,.1)" : "rgba(180,35,24,.1)",
                                  color: o.kapora_durumu === "odendi" ? "#1f6f4a" : o.kapora_durumu === "bekliyor" ? "#a8590c" : "#b42318"
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
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
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
                          background: t.durum === "onaylandi" ? "rgba(31,111,74,.1)" : t.durum === "reddedildi" ? "rgba(180,35,24,.1)" : "rgba(168,89,12,.1)",
                          color: t.durum === "onaylandi" ? "#1f6f4a" : t.durum === "reddedildi" ? "#b42318" : "#a8590c"
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

          {/* ── MÜŞTERİ GETİR (Referans + Doğum Günü birleşik) ── */}
          {sayfa === "musterigetir" && (
            <MusteriGetir api={api} />
          )}

          {/* ── KASA ── */}
          {sayfa === "kasa" && (
            <Kasa api={api} />
          )}

          {/* ── MAĞAZA (ürün önerisi) ── */}
          {sayfa === "magaza" && (
            <Magaza api={api} randevuId={magazaRandevu} />
          )}

          {/* ── QR KOD ── */}
          {sayfa === "qrkod" && (
            <div>
              <div style={{ marginBottom: 20, color: "var(--dim)", fontSize: 13 }}>İşletmeniz için WhatsApp veya Online Randevu QR kodu oluşturun. Yazdırıp işletmenize asabilirsiniz.</div>
              <div className="grid-2">
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>QR Tipi Seçin</h3>
                  <div className="row gap-8" style={{ marginBottom: 16 }}>
                    {[["whatsapp", "💬 WhatsApp"], ["booking", "📅 Online Randevu"]].map(([k, l]) => (
                      <button key={k} onClick={() => { setQrType(k); setQrData(null); }} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid " + (qrType === k ? (k === "whatsapp" ? "#1f6f4a" : "#2f56c6") : "var(--border)"), cursor: "pointer", background: qrType === k ? (k === "whatsapp" ? "rgba(31,111,74,.08)" : "rgba(47,86,198,.08)") : "var(--bg)", color: qrType === k ? (k === "whatsapp" ? "#1f6f4a" : "#2f56c6") : "var(--dim)", fontWeight: 600, fontSize: 13 }}>{l}</button>
                    ))}
                  </div>
                  <button onClick={qrKodOlustur} disabled={qrYukleniyor} style={{ width: "100%", padding: 12, borderRadius: 12, border: "none", cursor: "pointer", background: "#1f6f4a", color: "#fff", fontWeight: 600, fontSize: 14 }}>{qrYukleniyor ? "Oluşturuluyor..." : "🔄 QR Kod Oluştur"}</button>
                  <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(47,86,198,.04)", border: "1px solid rgba(47,86,198,.1)" }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#2f56c6", marginBottom: 4 }}>💡 Kullanım</div>
                    <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>
                      • <strong>WhatsApp:</strong> Müşteri QR okutarak doğrudan WhatsApp'tan mesaj atar<br/>
                      • <strong>Online Randevu:</strong> Müşteri QR okutarak web'den randevu alır<br/>
                      • QR kodu indirip kartvizit, tezgah veya vitrine yapıştırabilirsiniz
                    </div>
                  </div>
                </div>
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  {qrData ? (
                    <>
                      <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>{qrData.isletmeIsim}</div>
                      <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16 }}>{qrData.type === "whatsapp" ? "💬 WhatsApp QR" : "📅 Online Randevu QR"}</div>
                      <img src={qrData.qr} alt="QR Kod" style={{ width: 280, height: 280, borderRadius: 16, border: "3px solid var(--border)" }} />
                      <div style={{ marginTop: 12, fontSize: 11, color: "var(--dim)", textAlign: "center", wordBreak: "break-all", maxWidth: 300 }}>{qrData.hedefUrl}</div>
                      <div className="row gap-8" style={{ marginTop: 16 }}>
                        <a href={qrData.qr} download={`qr-${qrData.isletmeIsim}-${qrData.type}.png`} style={{ padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>📥 İndir</a>
                        <button onClick={() => { navigator.clipboard.writeText(qrData.hedefUrl); alert("Link kopyalandı!"); }} style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--text)", fontWeight: 600, fontSize: 12 }}>📋 Linki Kopyala</button>
                      </div>
                    </>
                  ) : (
                    <div style={{ textAlign: "center", color: "var(--dim)" }}>
                      
                      <p style={{ fontSize: 13 }}>QR tipi seçip oluşturun</p>
                    </div>
                  )}
                </div>
              </div>

              {/* ═══════ GOOGLE MAPS RESERVE ═══════ */}
              <div style={{ marginTop: 24, background: "var(--surface)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>Google Haritalar Bağlantısı</div>
                    <div style={{ fontSize: 12, color: "var(--dim)" }}>İşletmenizi Google'da bulsunlar, randevu linkinizi profilinize ekleyin.</div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }} className="settings-grid-2">
                  {/* Sol: Google Maps Profil Linki */}
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px", marginBottom: 6, display: "block" }}>Google Maps Profil Linkiniz</label>
                    <input
                      type="url"
                      placeholder="https://maps.google.com/..."
                      value={ayarlar?.google_maps_reserve_url || ''}
                      onChange={e => setAyarlar({...ayarlar, google_maps_reserve_url: e.target.value})}
                      className="input"
                      style={{ width: "100%" }}
                    />
                    <div style={{ color: "var(--dim)", fontSize: 11, marginTop: 4 }}>
                      Google Maps → İşletmeniz → "Paylaş" → "Bağlantıyı kopyala" ile alabilirsiniz.
                    </div>
                    <button onClick={async () => { await api.put("/ayarlar", { google_maps_reserve_url: ayarlar?.google_maps_reserve_url || '' }); alert("Google Maps linki kaydedildi!"); }} style={{ marginTop: 10, padding: "8px 20px", borderRadius: 10, border: "none", background: "rgba(66,133,244,.1)", color: "#4285f4", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                      💾 Kaydet
                    </button>
                  </div>

                  {/* Sağ: Booking linki + talimat */}
                  {ayarlar?.slug && (
                    <div style={{ padding: 16, borderRadius: 12, background: "rgba(66,133,244,.06)", border: "1px solid rgba(66,133,244,.15)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#4285f4", marginBottom: 8 }}>📅 Google Business Randevu Linki</div>
                      <div style={{ fontSize: 12, color: "var(--text)", lineHeight: 1.6, marginBottom: 8 }}>
                        Aşağıdaki size özel linki Google Business profilinize yapıştırın:
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ flex: 1, padding: "10px 14px", borderRadius: 10, background: "rgba(66,133,244,.06)", border: "1px solid rgba(66,133,244,.15)", fontSize: 12, fontWeight: 600, color: "#4285f4", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {bookingUrl(ayarlar.slug)}
                        </div>
                        <button onClick={() => navigator.clipboard.writeText(bookingUrl(ayarlar.slug))} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "rgba(66,133,244,.1)", color: "#4285f4", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                          Kopyala
                        </button>
                      </div>
                      <div style={{ marginTop: 12, fontSize: 11, color: "var(--dim)", lineHeight: 1.8 }}>
                        <strong>Nasıl eklenir?</strong><br/>
                        1. <a href="https://business.google.com" target="_blank" rel="noopener noreferrer" style={{ color: "#4285f4" }}>Google Business</a> hesabınıza giriş yapın<br/>
                        2. 'Profili Düzenle' menüsünden 'İletişim' sekmesine geçin<br/>
                        3. 'Randevu bağlantısı' alanına yukarıdaki linki yapıştırın<br/>
                        <br/>
                        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>ℹ️ Profilinizin iletişim kısmında tıklanabilir bir randevu linki oluşacaktır. Google'ın linki onaylaması 24 saati bulabilir.</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── AYARLAR ── */}
          {sayfa === "ayarlar" && ayarlar && (
            <div className="card" style={{ padding: 18, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <b>Panel görünümü: {liteMod ? "Sade (Lite)" : "Tam (Pro)"}</b>
                <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 4 }}>
                  {liteMod ? "Sadece günlük iş: bugünkü randevular, WhatsApp, fiyatlar. Kasa, pazarlama ve raporlar gizli."
                           : "Tüm modüller açık: kasa, finans, pazarlama, raporlar, şubeler."}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={async () => {
                const mod = liteMod ? "pro" : "lite";
                const d = await api.put("/ayarlar", { panel_modu: mod });
                if (!d?.hata) { setAyarlar(a => ({ ...a, panel_modu: mod })); setSayfa("anasayfa"); }
                else alert(d.hata);
              }}>{liteMod ? "Tüm özellikleri göster" : "Sade görünüme geç"}</button>
            </div>
          )}
          {sayfa === "ayarlar" && (
            <Settings ayarlar={ayarlar} setAyarlar={setAyarlar} paketDurum={paketDurum} api={api} />
          )}

          {/* ── ŞUBELERİM (Kurumsal Paket) ── */}
          {sayfa === "grup" && (
            <GrupYonetim api={api} onSubeSec={(id) => {
              localStorage.setItem('aktifIsletme', String(id));
              window.location.reload();
            }} />
          )}

          {/* ── BİLDİRİMLER ── */}
          {sayfa === "bildirimler" && (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "var(--dim)" }}>{bildirimler.length} bildirim</div>
                {bildirimSayi > 0 && (
                  <button onClick={async () => { await api.put("/bildirimler/tumunu-oku"); setBildirimSayi(0); setBildirimler(prev => prev.map(b => ({ ...b, okundu: true }))); }}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Tümünü Okundu İşaretle
                  </button>
                )}
              </div>
              {bildirimler.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "var(--dim)" }}>
                  
                  <div style={{ fontSize: 15, fontWeight: 600 }}>Henüz bildirim yok</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Yeni randevular, zombi uyarıları ve sistem bildirimleri burada görünecek</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {bildirimler.map(b => (
                    <div key={b.id} onClick={async () => { if (!b.okundu) { await api.put(`/bildirimler/${b.id}/okundu`); setBildirimSayi(s => Math.max(0, s - 1)); setBildirimler(prev => prev.map(x => x.id === b.id ? { ...x, okundu: true } : x)); } }}
                      style={{ padding: "16px 20px", borderRadius: 14, background: b.okundu ? "var(--surface)" : "rgba(47,86,198,.05)", border: `1px solid ${b.okundu ? "var(--border)" : "rgba(47,86,198,.15)"}`, cursor: "pointer", transition: "all .15s" }}
                      onMouseOver={e => e.currentTarget.style.background = "var(--bg)"} onMouseOut={e => e.currentTarget.style.background = b.okundu ? "var(--surface)" : "rgba(47,86,198,.05)"}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                        <div style={{ fontSize: 24, flexShrink: 0 }}>
                          {b.tip === "zombi" ? "⚠️" : b.tip === "randevu" ? "📅" : b.tip === "odeme" ? "💰" : b.tip === "sistem" ? "⚙️" : "🔔"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: b.okundu ? 500 : 700, color: "var(--text)" }}>{b.baslik}</div>
                            {!b.okundu && <div style={{ width: 8, height: 8, borderRadius: 4, background: "#2f56c6", flexShrink: 0 }} />}
                          </div>
                          <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 4 }}>{b.mesaj}</div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>{new Date(b.olusturma_tarihi).toLocaleString("tr-TR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── DESTEK ── */}
          {sayfa === "destek" && (() => {
            const oncelikRenk = { acil: "#b42318", yuksek: "#a8590c", normal: "#2f56c6", dusuk: "#6f6a62" };
            const durumRenk = { acik: "#a8590c", yanitlandi: "#2f56c6", cozuldu: "#1f6f4a", kapali: "#6f6a62" };
            const durumLabel = { acik: "Açık", yanitlandi: "Yanıtlandı", cozuldu: "Çözüldü", kapali: "Kapalı" };
            const durumIcon = { acik: "🟡", yanitlandi: "💬", cozuldu: "✅", kapali: "🔒" };
            const seciliTalep = destekTaleplerim.find(t => t.id === destekSecili);
            return (
            <div style={{ display: "flex", gap: 0, height: "calc(100vh - 80px)", background: "var(--bg)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
              {/* Sol Panel — Talep Listesi */}
              <div style={{ width: 320, minWidth: 280, borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", background: "var(--surface)" }}>
                <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Destek</h2>
                    <button onClick={() => { setDestekFormAcik(true); setDestekSecili(null); }} style={{ background: "var(--primary)", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Yeni</button>
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
                      background: destekSecili === t.id ? "rgba(93,75,181,.08)" : "transparent",
                      borderLeft: destekSecili === t.id ? "3px solid var(--primary)" : "3px solid transparent",
                      transition: "all .15s"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>#{t.id} {t.konu}</span>
                        <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", marginLeft: 8 }}>{new Date(t.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (oncelikRenk[t.oncelik]||"#6f6a62") + "18", color: oncelikRenk[t.oncelik]||"#6f6a62", fontWeight: 600 }}>{t.oncelik}</span>
                        <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (durumRenk[t.durum]||"#6f6a62") + "18", color: durumRenk[t.durum]||"#6f6a62", fontWeight: 600 }}>{durumIcon[t.durum]} {durumLabel[t.durum]}</span>
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
                      <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "var(--text)" }}>Yeni Destek Talebi</h3>
                      <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 20 }}>Sorununuzu detaylı açıklayın, en kısa sürede dönüş yapacağız.</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, display: "block" }}>Konu</label>
                          <input value={yeniDestek.konu} onChange={e => setYeniDestek({...yeniDestek, konu: e.target.value})} placeholder="Sorunun kısa başlığı..." className="input" required style={{ width: "100%" }} />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, display: "block" }}>Açıklama</label>
                          <textarea value={yeniDestek.mesaj} onChange={e => setYeniDestek({...yeniDestek, mesaj: e.target.value})} placeholder="Sorununuzu olabildiğince detaylı açıklayın..." className="input" style={{ minHeight: 120, resize: "vertical", width: "100%" }} required />
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 4, display: "block" }}>Öncelik</label>
                            <select value={yeniDestek.oncelik} onChange={e => setYeniDestek({...yeniDestek, oncelik: e.target.value})} className="input" style={{ width: "100%" }}>
                              <option value="dusuk">🟢 Düşük</option>
                              <option value="normal">🔵 Normal</option>
                              <option value="yuksek">🟡 Yüksek</option>
                              <option value="acil">🔴 Acil</option>
                            </select>
                          </div>
                          <button type="submit" style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>Gönder</button>
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
                          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>#{seciliTalep.id} {seciliTalep.konu}</span>
                          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: (durumRenk[seciliTalep.durum]||"#6f6a62") + "18", color: durumRenk[seciliTalep.durum]||"#6f6a62", fontWeight: 600 }}>{durumIcon[seciliTalep.durum]} {durumLabel[seciliTalep.durum]}</span>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>
                          <span style={{ padding: "1px 6px", borderRadius: 4, background: (oncelikRenk[seciliTalep.oncelik]||"#6f6a62") + "15", color: oncelikRenk[seciliTalep.oncelik], fontWeight: 600, fontSize: 10 }}>{seciliTalep.oncelik}</span>
                          <span style={{ marginLeft: 8 }}>Oluşturulma: {new Date(seciliTalep.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                        </div>
                      </div>
                    </div>

                    {/* Chat area */}
                    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                      {/* Müşteri mesajı */}
                      <div style={{ display: "flex", gap: 10, maxWidth: "80%" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>S</div>
                        <div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>Siz · {new Date(seciliTalep.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{seciliTalep.mesaj}</div>
                        </div>
                      </div>

                      {/* Admin yanıtı */}
                      {seciliTalep.admin_yanit && (
                        <div style={{ display: "flex", gap: 10, maxWidth: "80%", alignSelf: "flex-end", flexDirection: "row-reverse" }}>
                          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1f6f4a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>SA</div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>SıraGO Destek · {seciliTalep.admin_yanit_tarihi ? new Date(seciliTalep.admin_yanit_tarihi).toLocaleString("tr-TR") : ""}</div>
                            <div style={{ background: "rgba(31,111,74,.08)", border: "1px solid rgba(31,111,74,.15)", borderRadius: "14px 4px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "left" }}>{seciliTalep.admin_yanit}</div>
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
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 1060 }}>
            <div className="modal-header">
              <h2>Paketler</h2>
              <button onClick={() => setPaketModal(false)} className="modal-close">✕</button>
            </div>
            <div className="price-grid-modal">
              {[
                { key: "baslangic", isim: "Başlangıç", fiyat: paketDurum?.tum_paketler?.baslangic?.fiyat || 299, renk: "#6f6a62", ozellikler: ["2 Çalışan", "500 Randevu/Ay", "WhatsApp Bot", "Otomatik Hatırlatma"], ozellikYok: ["Kasa Takibi", "Prim Raporu", "Sadakat Puan", "Kayıp Müşteri", "Yorum Avcısı", "Gece Raporu", "Çoklu Dil", "SMS Hatırlatma"] },
                { key: "profesyonel", isim: "Standart", fiyat: paketDurum?.tum_paketler?.profesyonel?.fiyat || 699, renk: "#2f56c6", ozellikler: ["5 Çalışan", "Sınırsız Randevu", "Kasa Takibi & Prim Raporu", "Sadakat Puan Sistemi", "Kayıp Müşteri Kurtarma", "Yorum Avcısı", "Gece Raporu", "3 Dil Desteği"], ozellikYok: ["Çoklu Şube", "Öncelikli Destek", "SMS Hatırlatma"] },
                { key: "proplus", isim: "Pro+", fiyat: paketDurum?.tum_paketler?.proplus?.fiyat || 1499, renk: "#1f6f4a", ozellikler: ["10 Çalışan", "Sınırsız Randevu", "Çoklu Şube (3 şube)", "Kasa Takibi & Prim Raporu", "Öncelikli Destek", "Tüm Standart Özellikler"], ozellikYok: ["SMS Hatırlatma", "API Erişimi"] },
                { key: "kurumsal", isim: "Kurumsal", fiyat: paketDurum?.tum_paketler?.kurumsal?.fiyat || 4999, renk: "#a8590c", ozellikler: ["Sınırsız Çalışan", "Sınırsız Şube", "SMS Hatırlatma", "API Erişimi", "Özel Onboarding", "Tüm Pro+ Özellikler"], ozellikYok: [] },
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
                        odemeSayfasiAc(p.key);
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
            
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>Ödeme Gerekli</h2>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginBottom: 20 }}>
              Bu ay için ödemeniz bulunmamaktadır. Paneli kullanmaya devam etmek için lütfen ödeme yapın.
            </p>
            <div style={{
              background: "rgba(180,35,24,.05)", border: "1px solid rgba(180,35,24,.15)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left"
            }}>
              <div style={{ fontSize: 12, color: "var(--red)", fontWeight: 600, marginBottom: 6 }}>⚠️ Kısıtlanan Özellikler:</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                Randevular, Hizmetler, Çalışanlar, Müşteriler, Bot İşlemleri, Kampanyalar ve diğer tüm panel özellikleri
              </div>
            </div>
            <div style={{
              background: "rgba(31,111,74,.05)", border: "1px solid rgba(31,111,74,.15)",
              borderRadius: 12, padding: "14px 18px", marginBottom: 20, textAlign: "left"
            }}>
              <div style={{ fontSize: 12, color: "#1f6f4a", fontWeight: 600, marginBottom: 6 }}>✅ Erişilebilir:</div>
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
                odemeSayfasiAc();
              }} style={{
                padding: "12px 24px", borderRadius: 12, border: "none",
                background: "var(--gradient-accent)", color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                boxShadow: "none"
              }}>💳 Hemen Öde</button>
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "var(--dim)" }}>
              İlk 14 gün ücretsiz deneme süresi dahildir
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ==================== SUPER ADMIN PANEL ====================
function SuperAdminPanel({ kullanici }) {
  // Ekip yetkisi (config/ekip.js ile aynı anahtarlar). ekip_yetkileri yoksa kurucu: her şey açık.
  // Asıl kontrol sunucuda; burada yalnız görmediği bölümü menüde göstermemek için.
  const ekipYetki = Array.isArray(kullanici?.ekip_yetkileri) ? kullanici.ekip_yetkileri : null;
  const izinli = (y) => !ekipYetki || (y !== 'kurucu' && ekipYetki.includes(y));
  const GOREV_AD = { satis: 'SATIŞ', destek: 'DESTEK & KURULUM', finans: 'FİNANS & OPERASYON' };
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
  const [yeniOdeme, setYeniOdeme] = useState({ isletme_id: "", tutar: "", donem: new Date().toLocaleDateString('sv-SE').slice(0, 7) });
  const [odemeFormAcik, setOdemeFormAcik] = useState(false);
  // SaaS Metrikleri
  const [saasMetrik, setSaasMetrik] = useState(null);
  // Numara yönetimi
  const [numaralar, setNumaralar] = useState([]);
  const [numaraFormAcik, setNumaraFormAcik] = useState(false);
  const [yeniNumara, setYeniNumara] = useState({ isim: "", telefon: "" });
  // Merkez OTP Bot (SıraGO sistem numaraları — esnaf WA'sı yoksa fallback)
  const [merkezOtp, setMerkezOtp] = useState({ durum: 'kapali', numaralar: [] });
  // Satış Bot Şablonlar
  const [sablonlar, setSablonlar] = useState([]);
  const [sablonEnIyi, setSablonEnIyi] = useState(null);
  const [sablonFormAcik, setSablonFormAcik] = useState(false);
  const [sablonDuzenle, setSablonDuzenle] = useState(null);
  const [yeniSablon, setYeniSablon] = useState({ isim: "", mesaj: "", kategori: "genel", aktif: true, gonderim_modu: "rastgele" });
  const [sablonTab, setSablonTab] = useState("liste");
  // Satış Kampanyalar (Segmentasyon)
  const [kampanyalar, setKampanyalar] = useState([]);
  const [kampanyaFormAcik, setKampanyaFormAcik] = useState(false);
  const [kampanyaDuzenle, setKampanyaDuzenle] = useState(null);
  const [yeniKampanya, setYeniKampanya] = useState({ isim: "", kategori: "", aktif: true, oncelik: 5, min_skor: 0, mesai_baslangic: 10, mesai_bitis: 18, gunler: "{1,2,3,4,5}", gunluk_limit: 20 });
  const [kategoriDagilimi, setKategoriDagilimi] = useState(null);
  const [satisAnaTab, setSatisAnaTab] = useState("bot"); // bot | kampanyalar | dagilim
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
  const [zombiAksiyonlar, setZombiAksiyonlar] = useState([]);
  const [zombiAksiyonGecmis, setZombiAksiyonGecmis] = useState([]);
  const [zombiAksiyonTab, setZombiAksiyonTab] = useState("oneriler");
  const [zombiAksiyonYukleniyor, setZombiAksiyonYukleniyor] = useState(false);
  // Onboarding
  const [onboardingData, setOnboardingData] = useState(null);
  const [onboardingFiltre, setOnboardingFiltre] = useState("hepsi");
  // Segmentasyon
  const [segmentData, setSegmentData] = useState(null);
  const [segmentFiltre, setSegmentFiltre] = useState("hepsi");
  // Karşılaştırma
  const [karsilastirmaData, setKarsilastirmaData] = useState(null);
  const [karsilastirmaSiralama, setKarsilastirmaSiralama] = useState("toplam_gelir");
  // API Dashboard
  const [apiDashData, setApiDashData] = useState(null);
  // QR Kod
  const [qrIsletmeId, setQrIsletmeId] = useState("");
  const [qrType, setQrType] = useState("whatsapp");
  const [qrData, setQrData] = useState(null);
  const [qrYukleniyor, setQrYukleniyor] = useState(false);
  // Müşteri CRM
  const [crmData, setCrmData] = useState(null);
  const [crmArama, setCrmArama] = useState("");
  const [crmIsletmeFiltre, setCrmIsletmeFiltre] = useState("");
  const [crmSegmentFiltre, setCrmSegmentFiltre] = useState("hepsi");
  const [crmDetay, setCrmDetay] = useState(null);
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
  const [avciTaramaDurum, setAvciTaramaDurum] = useState(null); // { toplam_sorgu, tamamlanan, aktif, yeni_eklenen, zaten_var, ... }
  const [avciTaramaId, setAvciTaramaId] = useState(null);
  const [avciSecili, setAvciSecili] = useState(null);
  const [avciTab, setAvciTab] = useState("liste");
  const [avciKaynak, setAvciKaynak] = useState("hepsi");
  const [avciKategoriFiltre, setAvciKategoriFiltre] = useState("hepsi");
  // 🆕 Arama + konum filtreleri
  const [avciArama, setAvciArama] = useState("");
  const [avciSehir, setAvciSehir] = useState("");
  const [avciIlce, setAvciIlce] = useState("");
  const [avciSehirListe, setAvciSehirListe] = useState([]);
  const [avciIlceListe, setAvciIlceListe] = useState([]);
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
    try { const d = await api.get("/admin/isletmeler"); setIsletmeler(d.isletmeler || []); } catch(e) { console.log("İşletme yükleme hatası:", e); }
    setYukleniyor(false);
  };

  const odemeleriYukle = async () => {
    setYukleniyor(true);
    try { const d = await api.get("/admin/odemeler"); setOdemeler(d.odemeler || []);  } catch(e) { console.log("Ödeme yükleme hatası:", e); }
    setYukleniyor(false);
  };

  const saasMetrikleriYukle = async () => {
    try { const d = await api.get("/admin/saas-metrikleri"); setSaasMetrik(d); } catch (e) { console.log("SaaS metrikleri yükleme hatası:", e); }
  };

  const numaralariYukle = async () => {
    try { const d = await api.get("/admin/satis-bot/numaralar"); setNumaralar(d.numaralar || []); } catch (e) { console.log("Numara yükleme hatası:", e); }
  };

  const merkezOtpYukle = async () => {
    try { const d = await api.get("/admin/merkez-otp/numaralar"); setMerkezOtp(d && Array.isArray(d.numaralar) ? d : { durum: 'kapali', numaralar: [] }); }
    catch (e) { console.log("Merkez OTP yükleme hatası:", e); }
  };

  const sablonlariYukle = async () => {
    try { const d = await api.get("/admin/satis-bot/sablonlar"); setSablonlar(d.sablonlar || []); setSablonEnIyi(d.enIyiId); } catch (e) { console.log("Şablon yükleme hatası:", e); }
  };
  const sablonKaydet = async () => {
    try {
      if (sablonDuzenle) {
        await api.put(`/admin/satis-bot/sablonlar/${sablonDuzenle.id}`, yeniSablon);
      } else {
        await api.post("/admin/satis-bot/sablonlar", yeniSablon);
      }
      setSablonFormAcik(false); setSablonDuzenle(null);
      setYeniSablon({ isim: "", mesaj: "", kategori: "genel", aktif: true, gonderim_modu: "rastgele" });
      sablonlariYukle();
    } catch (e) { alert("Şablon kaydetme hatası: " + e.message); }
  };
  const sablonSil = async (id) => {
    if (!confirm("Bu şablonu silmek istediğinize emin misiniz?")) return;
    try { await api.del(`/admin/satis-bot/sablonlar/${id}`); sablonlariYukle(); } catch (e) { alert("Silme hatası"); }
  };

  // ─── KAMPANYA FONKSİYONLARI ───
  const kampanyalariYukle = async () => {
    try { const d = await api.get("/admin/satis-bot/kampanyalar"); setKampanyalar(d.kampanyalar || []); } catch (e) { console.log("Kampanya yükleme hatası:", e); }
  };
  const kategoriDagiliminiYukle = async () => {
    try { const d = await api.get("/admin/satis-bot/kategori-dagilimi"); setKategoriDagilimi(d); } catch (e) { console.log("Kategori dağılımı hatası:", e); }
  };
  const kampanyaKaydet = async () => {
    try {
      if (kampanyaDuzenle) {
        await api.put(`/admin/satis-bot/kampanyalar/${kampanyaDuzenle.id}`, yeniKampanya);
      } else {
        await api.post("/admin/satis-bot/kampanyalar", yeniKampanya);
      }
      setKampanyaFormAcik(false); setKampanyaDuzenle(null);
      setYeniKampanya({ isim: "", kategori: "", aktif: true, oncelik: 5, min_skor: 0, mesai_baslangic: 10, mesai_bitis: 18, gunler: "{1,2,3,4,5}", gunluk_limit: 20 });
      kampanyalariYukle();
    } catch (e) { alert("Kampanya kaydetme hatası: " + e.message); }
  };
  const kampanyaSil = async (id) => {
    if (!confirm("Bu kampanyayı silmek istediğinize emin misiniz?")) return;
    try { await api.del(`/admin/satis-bot/kampanyalar/${id}`); kampanyalariYukle(); } catch (e) { alert("Silme hatası"); }
  };

  useEffect(() => {
    isletmeleriYukle();
    if (izinli('odemeler')) odemeleriYukle();
    saasMetrikleriYukle();
    if (izinli('destek')) { destekYukle(); iletisimYukle(); }
    bildirimleriYukle();
  }, []);

  const avciListeYukle = async () => {
    try {
      const qs = new URLSearchParams({
        durum: avciFiltre,
        kategori: avciKategoriFiltre,
        siralama: avciSiralama,
        kaynak: avciKaynak,
        sehir: avciSehir || "",
        ilce: avciIlce || "",
        q: (avciArama || "").trim(),
        limit: "100",
      }).toString();
      const d = await api.get(`/admin/avci/liste?${qs}`);
      setAvciListe(d.potansiyel_musteriler || []);
    } catch(e) { console.log("Avcı liste hatası:", e); }
  };
  const avciSehirleriYukle = async () => {
    try { const d = await api.get("/admin/avci/sehirler"); setAvciSehirListe(d.sehirler || []); } catch(e) {}
  };
  const avciIlceleriYukle = async (sehir) => {
    try {
      const d = await api.get(`/admin/avci/ilceler${sehir ? `?sehir=${encodeURIComponent(sehir)}` : ""}`);
      setAvciIlceListe(d.ilceler || []);
    } catch(e) { setAvciIlceListe([]); }
  };
  const avciStatsYukle = async () => {
    try { const d = await api.get("/admin/avci/istatistik"); setAvciStats(d); } catch(e) { console.log("Avcı stats hatası:", e); }
  };
  const avciGunlukYukle = async () => {
    try { const d = await api.get("/admin/avci/gunluk?limit=10"); setAvciGunluk(d.gunluk_liste || []); } catch(e) { console.log("Avcı günlük hatası:", e); }
  };

  // Async tarama başlat + polling (her 2 sn'de durum çek)
  const avciTaramaBaslat = async (endpoint, body) => {
    setAvciTaramaYukleniyor(true);
    setAvciTaramaSonuc(null);
    setAvciTaramaDurum(null);
    try {
      const res = await api.post(endpoint, body);
      if (res.hata || !res.tarama_id) {
        setAvciTaramaSonuc({ hata: res.hata || "Tarama başlatılamadı" });
        setAvciTaramaYukleniyor(false);
        return;
      }
      setAvciTaramaId(res.tarama_id);
      // Backup polling (socket düşerse yine çalışsın) — 10 sn'de bir
      const tid = res.tarama_id;
      const poll = setInterval(async () => {
        try {
          const d = await api.get(`/admin/avci/tarama-durum/${tid}`);
          if (d?.hata) { clearInterval(poll); setAvciTaramaYukleniyor(false); return; }
          setAvciTaramaDurum(d);
          if (d.durum === "tamamlandi" || d.durum === "iptal") {
            clearInterval(poll);
            setAvciTaramaSonuc({
              arama_metni: `${body.kategori || (body.kategoriler?.join(", ")) || ""} ${body.ilce || ""} ${body.sehir || ""}`.trim(),
              toplam_bulunan: d.toplam_bulunan,
              yeni_eklenen: d.yeni_eklenen,
              zaten_var: d.zaten_var,
              tarama_sayisi: d.tamamlanan,
              iptal: d.iptal
            });
            setAvciTaramaYukleniyor(false);
            avciListeYukle(); avciStatsYukle(); avciGunlukYukle();
          }
        } catch(e) { clearInterval(poll); setAvciTaramaYukleniyor(false); }
      }, 10000);
    } catch(e) {
      setAvciTaramaSonuc({ hata: e.message });
      setAvciTaramaYukleniyor(false);
    }
  };

  const avciTaramaIptalEt = async () => {
    if (!avciTaramaId) return;
    try { await api.post(`/admin/avci/tarama-iptal/${avciTaramaId}`, {}); } catch(e) {}
  };

  const iletisimYukle = async () => {
    try { const d = await api.get("/admin/iletisim"); setIletisimMesajlar(d.mesajlar || []); } catch(e) { console.log("İletişim yükleme hatası:", e); }
  };

  // ═══════════ CANLI YAYIN (Süper Admin) ═══════════
  const adminToast = (m, renk = "#1f6f4a") => {
    try {
      const el = document.createElement("div");
      el.textContent = m;
      el.style.cssText = `position:fixed;top:20px;right:20px;z-index:99999;padding:14px 20px;background:${renk};color:#fff;border-radius:12px;font-weight:700;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);max-width:340px;animation:slideIn .3s ease;`;
      document.body.appendChild(el);
      setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .4s"; }, 3500);
      setTimeout(() => { try { el.remove(); } catch(e){} }, 4200);
    } catch(e) {}
  };

  useSocketEvent("isletme:yeni", (p) => {
    if (!p?.isletme) return;
    setIsletmeler(prev => [p.isletme, ...prev].filter((x,i,a) => a.findIndex(y => y.id === x.id) === i));
    adminToast(`🎉 Yeni işletme: ${p.isletme.isim}`, "#1f6f4a");
  });
  useSocketEvent("iletisim:yeni", (p) => {
    if (!p?.mesaj) return;
    setIletisimMesajlar(prev => [p.mesaj, ...prev]);
    adminToast(`📩 Yeni başvuru: ${p.mesaj.isim || p.mesaj.telefon || '-'}`, "#2f56c6");
  });
  useSocketEvent("destek:yeni", (p) => {
    if (!p?.talep) return;
    setDestekTalepler(prev => [p.talep, ...prev]);
    adminToast(`🎫 Yeni destek: ${p.talep.konu}`, p.talep.oncelik === "acil" ? "#b42318" : "#5d4bb5");
  });
  useSocketEvent("odeme:yeni", (p) => {
    if (!p) return;
    adminToast(`💳 ${p.isletme_isim || 'İşletme'} ödedi: ${p.tutar}₺`, "#1f6f4a");
    // Ödemeler sayfası açıksa listeyi tazele
    try { if (typeof odemeleriYukle === "function") odemeleriYukle(); } catch (e) {}
    try { if (typeof saasMetrikleriYukle === "function") saasMetrikleriYukle(); } catch (e) {}
  });

  // Avcı bot tarama progress (canlı, polling'den çok daha hızlı)
  useSocketEvent("avci:progress", (d) => {
    if (!d) return;
    // Sadece aktif tarama için (başka bir tarayıcıda başka tarama varsa karışmasın)
    if (avciTaramaId && d.tarama_id && String(d.tarama_id) !== String(avciTaramaId)) return;
    setAvciTaramaDurum(d);
    if (d.durum === "tamamlandi" || d.durum === "iptal") {
      setAvciTaramaSonuc({
        arama_metni: `${d.kategori || ""} ${d.sehir || ""}`.trim(),
        toplam_bulunan: d.toplam_bulunan,
        yeni_eklenen: d.yeni_eklenen,
        zaten_var: d.zaten_var,
        tarama_sayisi: d.tamamlanan,
        iptal: d.iptal
      });
      setAvciTaramaYukleniyor(false);
      try { avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); } catch (e) {}
    }
  });

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
  const zombiOtomatikAksiyonYukle = async () => {
    setZombiAksiyonYukleniyor(true);
    try { const d = await api.get("/admin/zombiler/otomatik-aksiyon"); setZombiAksiyonlar(d.aksiyonlar || []); } catch(e) { console.log("Zombi aksiyon hatası:", e); }
    setZombiAksiyonYukleniyor(false);
  };
  const zombiAksiyonGecmisiYukle = async () => {
    try { const d = await api.get("/admin/zombiler/aksiyon-gecmisi"); setZombiAksiyonGecmis(d.aksiyonlar || []); } catch(e) {}
  };
  const zombiTekAksiyonUygula = async (a) => {
    if (!confirm(`"${a.isletme_isim}" için "${a.oneri}" aksiyonu uygulanacak. Devam?`)) return;
    try {
      const d = await api.post("/admin/zombiler/aksiyon-uygula", { isletme_id: a.isletme_id, aksiyon_tipi: a.aksiyon_tipi, mesaj: a.mesaj });
      alert(d.mesaj + " — Sonuç: " + d.sonuc);
      zombiOtomatikAksiyonYukle(); zombiAksiyonGecmisiYukle();
    } catch(e) { alert("Hata: " + e.message); }
  };
  const zombiTopluAksiyonUygula = async () => {
    if (zombiAksiyonlar.length === 0) return;
    if (!confirm(`${zombiAksiyonlar.length} aksiyon uygulanacak. Devam?`)) return;
    try {
      const d = await api.post("/admin/zombiler/toplu-aksiyon", { aksiyonlar: zombiAksiyonlar });
      alert(d.mesaj);
      zombiOtomatikAksiyonYukle(); zombiAksiyonGecmisiYukle();
    } catch(e) { alert("Hata: " + e.message); }
  };
  const onboardingYukle = async () => {
    try { const d = await api.get("/admin/onboarding"); setOnboardingData(d); } catch(e) { console.log("Onboarding hatası:", e); }
  };
  const segmentasyonYukle = async () => {
    try { const d = await api.get("/admin/segmentasyon"); setSegmentData(d); } catch(e) { console.log("Segmentasyon hatası:", e); }
  };
  const karsilastirmaYukle = async () => {
    try { const d = await api.get("/admin/karsilastirma"); setKarsilastirmaData(d); } catch(e) { console.log("Karşılaştırma hatası:", e); }
  };
  const apiDashYukle = async () => {
    try { const d = await api.get("/admin/api-dashboard"); setApiDashData(d); } catch(e) { console.log("API Dashboard hatası:", e); }
  };
  const qrKodOlustur = async () => {
    if (!qrIsletmeId) return;
    setQrYukleniyor(true);
    try { const d = await api.get(`/admin/qr-kod?isletme_id=${qrIsletmeId}&type=${qrType}`); setQrData(d); } catch(e) { alert("Hata: " + e.message); }
    setQrYukleniyor(false);
  };
  const crmYukle = async (aramaVal, isletmeVal, segmentVal) => {
    const a = aramaVal !== undefined ? aramaVal : crmArama;
    const i = isletmeVal !== undefined ? isletmeVal : crmIsletmeFiltre;
    const s = segmentVal !== undefined ? segmentVal : crmSegmentFiltre;
    const params = new URLSearchParams();
    if (a) params.set('arama', a);
    if (i) params.set('isletme_id', i);
    if (s && s !== 'hepsi') params.set('segment', s);
    try { const d = await api.get(`/admin/musteri-crm?${params}`); setCrmData(d); } catch(e) { console.log("CRM hatası:", e); }
  };
  const crmDetayYukle = async (id) => {
    try { const d = await api.get(`/admin/musteri-crm/${id}`); setCrmDetay(d); } catch(e) { console.log("CRM detay hatası:", e); }
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

  // Satış Bot polling — QR bekliyorken 3sn, normalde 10sn
  useEffect(() => {
    if (sayfa !== "satisBot") return;
    satisBotYukle();
    const qrBekliyor = satisBotDurum?.numaraDurumlari?.some(n => n.durum === 'qr_bekleniyor') || satisBotDurum?.durum === 'qr_bekleniyor';
    const sure = qrBekliyor ? 3000 : 10000;
    const interval = setInterval(satisBotYukle, sure);
    return () => clearInterval(interval);
  }, [sayfa, satisBotDurum?.durum, satisBotDurum?.numaraDurumlari?.length]);

  // Merkez OTP polling — QR bekliyorken 3sn
  useEffect(() => {
    if (sayfa !== "satisBot") return;
    const qrBekliyor = merkezOtp?.numaralar?.some(n => n.durum === 'qr_bekliyor');
    const sure = qrBekliyor ? 3000 : 15000;
    const interval = setInterval(merkezOtpYukle, sure);
    return () => clearInterval(interval);
  }, [sayfa, merkezOtp?.durum, merkezOtp?.numaralar?.length]);

  useEffect(() => {
    if (sayfa === "dashboard") saasMetrikleriYukle();
    if (sayfa === "isletmeler") isletmeleriYukle();
    if (sayfa === "odemeler") odemeleriYukle();
    if (sayfa === "avci") { avciStatsYukle(); avciListeYukle(); avciGunlukYukle(); avciSehirleriYukle(); avciIlceleriYukle(avciSehir); }
    if (sayfa === "iletisim") iletisimYukle();
    if (sayfa === "satisBot") { numaralariYukle(); sablonlariYukle(); kampanyalariYukle(); kategoriDagiliminiYukle(); merkezOtpYukle(); }
    if (sayfa === "auditLog") auditLogYukle();
    if (sayfa === "sistemDurum") sistemDurumuYukle();
    if (sayfa === "destek") destekYukle();
    if (sayfa === "paketler") paketleriYukle();
    if (sayfa === "zombiler") { zombileriYukle(); zombiOtomatikAksiyonYukle(); zombiAksiyonGecmisiYukle(); }
    if (sayfa === "onboarding") onboardingYukle();
    if (sayfa === "segmentasyon") segmentasyonYukle();
    if (sayfa === "karsilastirma") karsilastirmaYukle();
    if (sayfa === "apiDash") apiDashYukle();
    if (sayfa === "musteriCRM") crmYukle();
    if (sayfa === "referanslar") referanslariYukle();
    if (sayfa === "duyurular") duyurulariYukle();
    if (sayfa === "aktivite") aktiviteYukle();
    if (sayfa === "bildirimler") bildirimleriYukle();
  }, [sayfa, avciFiltre, avciSiralama, avciKategoriFiltre, avciKaynak, avciSehir, avciIlce, auditFiltre, destekFiltre]);

  // Debounced arama — sadece avci sayfasındayken
  useEffect(() => {
    if (sayfa !== "avci") return;
    const t = setTimeout(() => { avciListeYukle(); }, 300);
    return () => clearTimeout(t);
  }, [avciArama]);

  // Cascade: şehir değişince ilçe listesini yenile + seçimi sıfırla
  useEffect(() => {
    if (sayfa !== "avci") return;
    setAvciIlce("");
    avciIlceleriYukle(avciSehir);
  }, [avciSehir]);

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
    setYeniOdeme({ isletme_id: "", tutar: "", donem: new Date().toLocaleDateString('sv-SE').slice(0, 7) });
    setOdemeFormAcik(false);
    odemeleriYukle();
  };

  const [mobileOpen, setMobileOpen] = useState(false);

  const cikisYap = () => { try { socketDisconnect(); } catch(e){} oturumuKapat(); api.token = null; window.location.reload(); };

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
    magaza: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
    bildirimler: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="18" cy="3" r="3" fill="currentColor"/></svg>,
  };

  const okunmamisSayi = iletisimMesajlar.filter(m => !m.okundu).length;

  const MENU_YETKI = {
    dashboard: 'genel', buyume: 'genel', bildirimler: 'genel', aktivite: 'genel', segmentasyon: 'genel', karsilastirma: 'genel',
    isletmeler: 'genel', zombiler: 'isletmeler', onboarding: 'isletmeler',
    destek: 'destek', duyurular: 'destek', iletisim: 'destek',
    avci: 'satis', satisBot: 'satis', musteriCRM: 'satis', referanslar: 'satis', qrKod: 'satis',
    odemeler: 'odemeler', paketler: 'paketler', magaza: 'magaza',
    apiDash: 'sistem', sistemDurum: 'sistem', auditLog: 'kurucu', ekip: 'kurucu',
  };
  const tumMenu = [
    { id: "dashboard", icon: SVGA.dashboard, label: "Dashboard" },
    { id: "buyume", icon: SVGA.aktivite, label: "Büyüme" },
    { id: "bildirimler", icon: SVGA.bildirimler, label: "Bildirimler" },
    { id: "isletmeler", icon: SVGA.isletmeler, label: "İşletmeler" },
    { id: "aktivite", icon: SVGA.aktivite, label: "Aktivite" },
    { id: "odemeler", icon: SVGA.odemeler, label: "Ödemeler" },
    { id: "destek", icon: SVGA.destek, label: "Destek" },
    { id: "paketler", icon: SVGA.paketler, label: "Paketler" },
    { id: "zombiler", icon: SVGA.zombiler, label: "Zombiler" },
    { id: "onboarding", icon: SVGA.referanslar, label: "Onboarding" },
    { id: "segmentasyon", icon: SVGA.isletmeler, label: "Segmentasyon" },
    { id: "karsilastirma", icon: SVGA.aktivite, label: "Karşılaştırma" },
    { id: "referanslar", icon: SVGA.referanslar, label: "Referanslar" },
    { id: "duyurular", icon: SVGA.duyurular, label: "Duyurular" },
    { id: "iletisim", icon: SVGA.iletisim, label: "İletişim" },
    { id: "avci", icon: SVGA.avci, label: "Avcı Bot" },
    { id: "satisBot", icon: SVGA.satisBot, label: "Satış Bot" },
    { id: "musteriCRM", icon: SVGA.odemeler, label: "Müşteri CRM" },
    { id: "magaza", icon: SVGA.magaza, label: "Mağaza" },
    { id: "qrKod", icon: SVGA.iletisim, label: "QR Kod" },
    { id: "apiDash", icon: SVGA.sistemDurum, label: "API Dashboard" },
    { id: "auditLog", icon: SVGA.auditLog, label: "Audit Log" },
    { id: "sistemDurum", icon: SVGA.sistemDurum, label: "Sistem Durumu" },
    { id: "ekip", icon: SVGA.referanslar, label: "Ekip" },
  ];
  const menuItems = tumMenu.filter(m => izinli(MENU_YETKI[m.id] || 'kurucu'));

  const kategoriRenk = { berber: "#2f56c6", kuafor: "#5d4bb5", guzellik: "#ec4899", spa: "#a8590c", disci: "#1f6f4a", veteriner: "#b42318", diyetisyen: "#2f56c6", psikolog: "#5d4bb5", fizyoterapi: "#2f56c6", restoran: "#a8590c", cafe: "#a16207", spor: "#1f6f4a", egitim: "#5d4bb5", foto: "#d946ef", dovme: "#b42318", oto: "#6f6a62", hukuk: "#475569", genel: "#94a3b8" };
  const kategoriLabel = { berber: "💈 Berber", kuafor: "✂️ Kuaför", guzellik: "💅 Güzellik", spa: "🧖 Spa", disci: "🦷 Diş Kliniği", veteriner: "🐾 Veteriner", diyetisyen: "🥗 Diyetisyen", psikolog: "🧠 Psikolog", fizyoterapi: "🏥 Fizyoterapi", restoran: "🍽️ Restoran", cafe: "☕ Kafe", spor: "🏋️ Spor", egitim: "📚 Eğitim", foto: "📸 Fotoğraf", dovme: "🎨 Dövme", oto: "🚗 Oto Servis", hukuk: "⚖️ Hukuk", genel: "🏢 Genel" };
  const paketRenk = { baslangic: "#6f6a62", profesyonel: "#2f56c6", proplus: "#1f6f4a", kurumsal: "#a8590c", premium: "#a8590c" };
  // Fiyatlar veritabanındaki paket tanımlarından (eskiden sabit 299/599/999 ve 'premium' anahtarı vardı;
  // Kurumsal undefined görünüyor, '+ Bekliyor Oluştur' yanlış tutarla kayıt açıyordu)
  useEffect(() => { paketleriYukle(); }, []);
  const paketFiyat = { baslangic: 299, profesyonel: 699, proplus: 1499, kurumsal: 4999,
    ...Object.fromEntries((paketTanimlar || []).map(p => [p.kod, parseFloat(p.fiyat) || 0])) };
  const odemeRenk = { odendi: "#1f6f4a", bekliyor: "#a8590c", gecikti: "#b42318", havale_bekliyor: "#5d4bb5", basarisiz: "#b42318", odeme_bekliyor: "#a8590c" };
  const odemeLabel = { odendi: "Ödendi ✓", bekliyor: "Bekliyor", gecikti: "Gecikti!", havale_bekliyor: "Havale Onay Bekliyor", basarisiz: "Başarısız", odeme_bekliyor: "Ödeme Bekliyor" };

  const buAy = new Date().toLocaleDateString('sv-SE').slice(0, 7);
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
    odemeler: "#b42318",
    destek: "#a8590c",
    iletisim: "#5d4bb5",
    bildirimler: "#b42318",
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
          <span className="marka-monogram" aria-label="SıraGO">S</span>
          <div className="sidebar-logo-text">
            <div className="brand-name">SıraGO</div>
            <div className="brand-sub">Süper Admin</div>
          </div>
        </div>
        <div className="sidebar-user">
          <div className="u-email">{kullanici.email}</div>
          <span className="sidebar-badge gold">{ekipYetki ? (GOREV_AD[kullanici.ekip_gorev] || 'EKİP') : 'KURUCU'}</span>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(m => (
            <div key={m.id} onClick={() => { setSayfa(m.id); setMobileOpen(false); }} className={`nav-item${sayfa === m.id ? ' active' : ''}`}>
              <span className="nav-icon">{m.icon}</span>
              <span>{m.label}</span>
              {badgeSayilari[m.id] > 0
                ? <span className="nav-badge" style={{ background: badgeRenkleri[m.id] || "#b42318" }}>{badgeSayilari[m.id]}</span>
                : sayfa === m.id && <div className="active-dot" />}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div style={{ marginBottom: 8, display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
            <CanliDurumu />
            <BackendHealth />
          </div>
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

            {/* ═══ KRİTİK SaaS METRİKLERİ (Yatırımcı Görünümü) ═══ */}
            <div className="metric-grid">
              {/* MRR Kartı — Sparkline ile */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>MRR (Aylık Gelir)</div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: "var(--text)", marginTop: 4 }}>{Number(saasMetrik?.mrr ?? buAyGelir ?? 0).toLocaleString("tr-TR")} ₺</div>
                    {saasMetrik && Number.isFinite(saasMetrik.mrrBuyume) && saasMetrik.mrrBuyume !== 0 && (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, marginTop: 6, fontSize: 11, fontWeight: 600, background: saasMetrik.mrrBuyume > 0 ? "rgba(31,111,74,.1)" : "rgba(180,35,24,.1)", color: saasMetrik.mrrBuyume > 0 ? "#1f6f4a" : "#b42318" }}>
                        {saasMetrik.mrrBuyume > 0 ? "▲" : "▼"} %{Math.abs(saasMetrik.mrrBuyume)}
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>ARR: {((saasMetrik?.arr || 0) / 1000).toFixed(0)}K ₺</div>
                    {saasMetrik?.beklenenGelir > 0 && <div style={{ fontSize: 11, color: "#a8590c", marginTop: 2 }}>Beklenen: {saasMetrik.beklenenGelir.toLocaleString("tr-TR")} ₺</div>}
                  </div>
                  {/* Mini Sparkline */}
                  {saasMetrik?.mrrSparkline && saasMetrik.mrrSparkline.length > 1 && (() => {
                    const data = saasMetrik.mrrSparkline;
                    const max = Math.max(...data, 1);
                    const w = 80, h = 36;
                    const points = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
                    return (
                      <svg width={w} height={h} style={{ flexShrink: 0, opacity: 0.8 }}>
                        <polyline points={points} fill="none" stroke="#1f6f4a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        {data.map((v, i) => (
                          <circle key={i} cx={(i / (data.length - 1)) * w} cy={h - (v / max) * h} r={i === data.length - 1 ? 3 : 1.5} fill={i === data.length - 1 ? "#1f6f4a" : "#10b98166"} />
                        ))}
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* Churn Rate Kartı — Hedef Göstergesi */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                {(() => {
                  const cr = saasMetrik?.churnRate || 0;
                  const renk = cr < 5 ? "#1f6f4a" : cr < 10 ? "#a8590c" : "#b42318";
                  const label = cr < 5 ? "Sağlıklı" : cr < 10 ? "Dikkat" : "Kritik";
                  return (
                    <>
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `${renk}` }} />
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>Churn Rate</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                        <span style={{ fontSize: 28, fontWeight: 600, color: renk }}>%{cr}</span>
                        <span style={{ fontSize: 12, fontWeight: 600, color: renk, padding: "2px 8px", borderRadius: 6, background: `${renk}18` }}>{label}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>{saasMetrik?.churnSayi || 0} ayrılan · Geçen ay: %{saasMetrik?.gecenAyChurnRate || 0}</div>
                      {/* Hedef Barı */}
                      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, background: "var(--bg)", borderRadius: 4, height: 6, overflow: "hidden", position: "relative" }}>
                          <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${Math.min(cr * 5, 100)}%`, background: renk, borderRadius: 4, transition: "width .5s" }} />
                          {/* %5 ve %10 işaretleri */}
                          <div style={{ position: "absolute", left: "25%", top: -2, width: 1, height: 10, background: "var(--muted)" }} title="%5" />
                          <div style={{ position: "absolute", left: "50%", top: -2, width: 1, height: 10, background: "var(--muted)" }} title="%10" />
                        </div>
                        <span style={{ fontSize: 9, color: "var(--dim)", flexShrink: 0 }}>%20</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--dim)", marginTop: 2 }}>
                        <span>%0</span><span>%5</span><span>%10</span><span>%20</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* ARPU Kartı — Değişim */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 22px", border: "1px solid var(--border)", position: "relative", overflow: "hidden" }}>
                
                <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px" }}>ARPU (Kullanıcı Başına Gelir)</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 600, color: "var(--text)" }}>{saasMetrik?.arpu || 0} ₺</span>
                  {saasMetrik && Number.isFinite(saasMetrik.arpuDegisim) && saasMetrik.arpuDegisim !== 0 && (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: saasMetrik.arpuDegisim > 0 ? "rgba(31,111,74,.1)" : "rgba(180,35,24,.1)", color: saasMetrik.arpuDegisim > 0 ? "#1f6f4a" : "#b42318" }}>
                      {saasMetrik.arpuDegisim > 0 ? "▲" : "▼"} %{Math.abs(saasMetrik.arpuDegisim)}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>Geçen ay: {saasMetrik?.arpuGecen || 0} ₺</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>Hedef: ARPU yükseldikçe daha değerli müşteriler</div>
              </div>
            </div>

            {/* ═══ ANA METRİKLER (mevcut) ═══ */}
            <div className="stats-grid">
              <div className="stat-card green">
                <div className="sc-icon">💰</div>
                <div className="sc-label">Bu Ay Gelir</div>
                <div className="sc-val">{(saasMetrik?.buAyGelir ?? 0).toLocaleString("tr-TR")} ₺</div>
                {saasMetrik?.beklenenGelir > 0 && saasMetrik?.buAyGelir < saasMetrik?.beklenenGelir && <div style={{ fontSize: 11, color: "#a8590c", marginTop: 4 }}>Beklenen: {saasMetrik.beklenenGelir.toLocaleString("tr-TR")} ₺</div>}
              </div>
              <div className="stat-card amber">
                <div className="sc-icon">🏢</div>
                <div className="sc-label">Toplam İşletme</div>
                <div className="sc-val">{isletmeler.length}</div>
              </div>
              <div className="stat-card green">
                <div className="sc-icon">✅</div>
                <div className="sc-label">Aktif Abone</div>
                <div className="sc-val">{saasMetrik?.aktifAboneSayi ?? saasMetrik?.buAyOdeyen ?? 0}</div>
              </div>
              <div className="stat-card blue">
                <div className="sc-icon">🆕</div>
                <div className="sc-label">Yeni Müşteri</div>
                <div className="sc-val">{saasMetrik?.yeniMusteri || 0}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Bu ay katılan</div>
              </div>
            </div>

            {/* İkinci sıra — mevcut + ek kartlar */}
            <div className="stats-grid" style={{ marginTop: 0 }}>
              <div className="stat-card" style={{ "--card-accent": "#b42318" }}>
                <div className="sc-icon">⏳</div>
                <div className="sc-label">Ödemeyenler</div>
                <div className="sc-val" style={{ color: (saasMetrik?.buAyOdemeyenSayi || buAyOdemeyenler.length) > 0 ? "#b42318" : "#1f6f4a" }}>{saasMetrik?.buAyOdemeyenSayi ?? buAyOdemeyenler.length}</div>
              </div>
              <div className="stat-card blue">
                <div className="sc-icon">📅</div>
                <div className="sc-label">Bu Ay Toplam Randevu</div>
                <div className="sc-val">{saasMetrik?.buAyToplamRandevu || 0}</div>
              </div>
              <div className="stat-card" style={{ "--card-accent": "#5d4bb5" }}>
                <div className="sc-icon">🤝</div>
                <div className="sc-label">Referansla Gelen</div>
                <div className="sc-val" style={{ color: "#5d4bb5" }}>{saasMetrik?.referanslaGelenSayi || 0}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Bu ay</div>
              </div>
              <div className="stat-card" style={{ "--card-accent": (saasMetrik?.denemeBitenSayi || 0) > 0 ? "#a8590c" : "#1f6f4a" }}>
                <div className="sc-icon">⚠️</div>
                <div className="sc-label">Deneme Süresi Biten</div>
                <div className="sc-val" style={{ color: (saasMetrik?.denemeBitenSayi || 0) > 0 ? "#a8590c" : "#1f6f4a" }}>{saasMetrik?.denemeBitenSayi || 0}</div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>Önümüzdeki 7 gün</div>
              </div>
            </div>

            {/* Deneme Biten İşletmeler Listesi (varsa) */}
            {saasMetrik?.denemeBitenler?.length > 0 && (
              <div className="card-dark" style={{ marginBottom: 16 }}>
                <h3 style={{ color: "#a8590c", fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Deneme Süresi Biten İşletmeler</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                  {saasMetrik.denemeBitenler.map(d => (
                    <div key={d.id} style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(168,89,12,.06)", border: "1px solid rgba(168,89,12,.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{d.isim}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)" }}>{d.telefon}</div>
                      </div>
                      <div style={{ fontSize: 11, color: "#a8590c", fontWeight: 600 }}>
                        {d.bitis_tarihi ? new Date(d.bitis_tarihi).toLocaleDateString("tr-TR", { day: "numeric", month: "short" }) : "?"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gelir Trendi + Paket Dağılımı */}
            <div className="grid-2">
              <div className="card-dark">
                <h3 style={{ color: "var(--muted)", fontSize: 15, fontWeight: 600 }} className="mb-12">Son 6 Ay Gelir Trendi</h3>
                {saasMetrik?.gelirTrendi ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 4px" }}>
                    {saasMetrik.gelirTrendi.map((g, i) => {
                      const maxGelir = Math.max(...saasMetrik.gelirTrendi.map(x => x.gelir), 1);
                      const h = Math.max(8, (g.gelir / maxGelir) * 120);
                      const ayLabel = new Date(g.donem + "-01").toLocaleDateString("tr-TR", { month: "short" });
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 600 }}>{g.gelir > 0 ? g.gelir.toLocaleString("tr-TR") + "₺" : ""}</span>
                          <div style={{ width: "100%", height: h, background: i === saasMetrik.gelirTrendi.length - 1 ? "var(--green)" : "rgba(31,111,74,.3)", borderRadius: 6, transition: "height .3s" }} />
                          <span style={{ fontSize: 10, color: "var(--dim)" }}>{ayLabel}</span>
                          <span style={{ fontSize: 9, color: "var(--dim)" }}>{g.odeyen} müşteri</span>
                        </div>
                      );
                    })}
                  </div>
                ) : <p style={{ color: "var(--dim)", fontSize: 13 }}>Yükleniyor...</p>}
              </div>
              <div className="card-dark">
                <h3 style={{ color: "var(--muted)", fontSize: 15, fontWeight: 600 }} className="mb-12">Paket Dağılımı</h3>
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

            {/* Ödeme durumu — yalnız ödeme yetkisi olana (yoksa liste boş gelir, "herkes ödedi" yanıltır) */}
            {izinli('odemeler') && (
            <div className="grid-2">
              <div className="card-dark">
                <h3 style={{ color: "var(--green)", fontSize: 15, fontWeight: 600 }} className="mb-12">Bu Ay Ödeyen ({buAyOdeyenler.length})</h3>
                {buAyOdeyenler.length === 0
                  ? <p style={{ color: "var(--dim)", fontSize: 13 }}>Henüz ödeme yok.</p>
                  : buAyOdeyenler.map(o => (
                    <div key={o.id} className="row row-between" style={{ padding: "8px 0", borderBottom: "1px solid var(--bg)" }}>
                      <span style={{ color: "var(--text)", fontSize: 13 }}>{o.isletme_isim}</span>
                      <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 13 }}>{o.tutar} ₺</span>
                    </div>
                  ))}
              </div>
              <div className="card-dark">
                <h3 style={{ color: "var(--red)", fontSize: 15, fontWeight: 600 }} className="mb-12">Bu Ay Ödemeyenler ({buAyOdemeyenler.length})</h3>
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
            )}

            {/* Son işletmeler */}
            <div className="card-dark">
              <h3 style={{ color: "var(--muted)", fontSize: 15 }} className="mb-12">Son Kayıt İşletmeler</h3>
              {isletmeler.slice(-5).reverse().map(i => (
                <div key={i.id} className="row row-between" style={{ padding: "10px 0", borderBottom: "1px solid var(--bg)" }}>
                  <div className="row gap-10">
                    <div className={`dot-sm ${i.aktif ? 'dot-green' : 'dot-red'}`} />
                    <span style={{ color: "var(--text)", fontSize: 14, fontWeight: 600 }}>{i.isim}</span>
                    <span className="tag-xs" style={{ background: (kategoriRenk[i.kategori] || "#6f6a62") + "22", color: kategoriRenk[i.kategori] || "#6f6a62" }}>{i.kategori}</span>
                  </div>
                  <div className="row gap-8">
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>📅 {i.toplam_randevu || 0}</span>
                    <span className="tag-xs" style={{ background: (paketRenk[i.paket] || "#6f6a62") + "22", color: paketRenk[i.paket] || "#6f6a62", fontWeight: 600 }}>{i.paket}</span>
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
            const kRenk = kategoriRenk[i.kategori] || "#6f6a62";
            const pRenk = paketRenk[i.paket] || "#6f6a62";
            return (
              <div onClick={(e) => { if(e.target.tagName === 'BUTTON' || e.target.closest('button') || e.target.tagName === 'SELECT' || e.target.closest('select')) return; isletmeDetayYukle(i.id); }}
                style={{ background: "var(--surface)", borderRadius: 16, border: "1px solid var(--border)", cursor: "pointer", transition: "all .2s", opacity: i.aktif ? 1 : 0.55, overflow: "hidden", position: "relative" }}>
                <div style={{ height: 3, background: `${kRenk}` }} />
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${kRenk}22`, border: `1px solid ${kRenk}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
                      {(kategoriLabel[i.kategori] || "🏢").split(" ")[0]}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.isim}</span>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: i.aktif ? "#1f6f4a" : "#b42318", flexShrink: 0 }} />
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${kRenk}12`, color: kRenk, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{i.kategori || "genel"}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${pRenk}12`, color: pRenk, fontSize: 10, fontWeight: 600, textTransform: "uppercase" }}>{i.paket || "—"}</span>
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
                          localStorage.setItem("randevugo_impersonate_token", res.token);
                          const yeniSekme = window.open(window.location.origin + "?impersonate=1", "_blank");
                          if (!yeniSekme) alert("Pop-up engellendi. Lütfen pop-up'lara izin verin.");
                        }
                      } catch (e) { alert("Hata: " + e.message); }
                    }} title="Müşteri olarak giriş" style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontWeight: 600, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>👤 Giriş</button>
                    <button onClick={() => aktifToggle(i)} title={i.aktif ? "Pasife al" : "Aktif et"} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", cursor: "pointer", background: i.aktif ? "rgba(31,111,74,.08)" : "rgba(168,89,12,.08)", color: i.aktif ? "#1f6f4a" : "#a8590c", fontWeight: 600, fontSize: 11 }}>{i.aktif ? "✓ Aktif" : "⏸ Pasif"}</button>
                    <button onClick={() => isletmeSil(i.id, i.isim)} title="Sil" style={{ padding: "7px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(180,35,24,.06)", color: "#b42318", fontSize: 11 }}>🗑️</button>
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
                
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {[["hepsi", `Hepsi (${isletmeler.length})`], ["aktif", `Aktif (${aktifSayi})`], ["pasif", `Pasif (${pasifSayi})`]].map(([v, l]) => (
                  <button key={v} onClick={() => setIsletmeFiltre(v)} style={{ padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: isletmeFiltre === v ? "var(--primary)" : "var(--bg)", color: isletmeFiltre === v ? "#fff" : "var(--dim)", transition: "all .15s" }}>{l}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setIsletmeGorunum("kategori")} title="Kategori Görünümü" style={{ padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: isletmeGorunum === "kategori" ? "rgba(47,86,198,.12)" : "var(--bg)", color: isletmeGorunum === "kategori" ? "#2f56c6" : "var(--dim)", fontSize: 14 }}>▦</button>
                <button onClick={() => setIsletmeGorunum("liste")} title="Liste Görünümü" style={{ padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: isletmeGorunum === "liste" ? "rgba(47,86,198,.12)" : "var(--bg)", color: isletmeGorunum === "liste" ? "#2f56c6" : "var(--dim)", fontSize: 14 }}>☰</button>
              </div>
              <button onClick={() => setFormAcik(!formAcik)} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#a8590c", color: "#fff", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap" }}>+ Yeni İşletme</button>
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
                const renk = kategoriRenk[k] || "#6f6a62";
                const sayi = isletmeler.filter(i => (i.kategori || "genel") === k).length;
                return (
                  <button key={k} onClick={() => setIsletmeKategoriFiltre(isletmeKategoriFiltre === k ? "hepsi" : k)}
                    style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all .15s", display: "flex", alignItems: "center", gap: 6,
                      background: isletmeKategoriFiltre === k ? `${renk}18` : "var(--surface)",
                      color: isletmeKategoriFiltre === k ? renk : "var(--dim)",
                      border: isletmeKategoriFiltre === k ? `1px solid ${renk}40` : "1px solid var(--border)" }}>
                    {(kategoriLabel[k] || k).split(" ")[0]} {k} <span style={{ background: `${renk}15`, color: renk, padding: "1px 6px", borderRadius: 8, fontSize: 10, fontWeight: 600 }}>{sayi}</span>
                  </button>
                );
              })}
            </div>

            {/* Yeni İşletme Formu */}
            {formAcik && (
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, border: "1px solid rgba(168,89,12,.2)", marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 15, color: "#a8590c", marginBottom: 14 }}>➕ Yeni İşletme Kaydı</div>
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
                    <button type="submit" style={{ padding: "10px 24px", borderRadius: 10, border: "none", cursor: "pointer", background: "#a8590c", color: "#fff", fontWeight: 600, fontSize: 13 }}>Kaydet</button>
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
                
                <p>Sonuç bulunamadı</p>
              </div>
            ) : isletmeGorunum === "kategori" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {kategoriSirali.map(kat => {
                  const renk = kategoriRenk[kat] || "#6f6a62";
                  const label = kategoriLabel[kat] || kat;
                  const liste = kategoriler[kat];
                  return (
                    <div key={kat}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: `${renk}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                          {label.split(" ")[0]}
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{label.split(" ").slice(1).join(" ") || kat}</span>
                        <span style={{ padding: "3px 10px", borderRadius: 8, background: `${renk}12`, color: renk, fontSize: 11, fontWeight: 600 }}>{liste.length}</span>
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
            <div className="card mb-16" style={{ padding: "14px 18px", background: "rgba(31,111,74,.06)", border: "1px solid rgba(31,111,74,.15)" }}>
              <div className="row row-between row-wrap gap-8">
                <div className="row gap-8" style={{ alignItems: "center" }}>
                  
                  <div>
                    <div style={{ color: "#1f6f4a", fontWeight: 600, fontSize: 14 }}>Shopier Otomatik Tahsilat</div>
                    <div style={{ color: "var(--dim)", fontSize: 12 }}>Müşteri karttan ödeyince webhook ile otomatik "Ödendi" düşer.</div>
                  </div>
                </div>
                <span className="tag" style={{ background: "rgba(111,106,98,.15)", color: "#6f6a62", fontWeight: 600, fontSize: 11 }}>Webhook (Render: SHOPIER_WEBHOOK_TOKEN)</span>
              </div>
            </div>

            <div className="row row-wrap gap-16 mb-24">
              <StatCard icon="💰" baslik="Toplam Gelir" deger={toplamGelir.toFixed(0) + " ₺"} renk="#1f6f4a" />
              <StatCard icon="📅" baslik="Bu Ay Gelir" deger={buAyGelir.toFixed(0) + " ₺"} renk="#2f56c6" />
              <StatCard icon="✅" baslik="Bu Ay Ödeyen" deger={buAyOdeyenler.length} renk="#5d4bb5" />
              <StatCard icon="⏳" baslik="Bu Ay Ödemeyenler" deger={buAyOdemeyenler.length} renk="#b42318" />
            </div>

            {/* Ödeme Profili açıksa */}
            {odemeProfil ? (
              <>
                <button onClick={() => setOdemeProfil(null)} className="btn btn-ghost btn-sm mb-16" style={{ fontSize: 12 }}>← Listeye Dön</button>
                <div className="card mb-16" style={{ padding: "20px 24px" }}>
                  <div className="row row-between row-wrap gap-12 mb-16">
                    <div>
                      <h2 style={{ fontSize: 20, fontWeight: 600, color: "var(--text)", margin: 0 }}>{odemeProfil.isletme.isim}</h2>
                      <div className="row gap-8 mt-4">
                        <span className="tag-xs" style={{ background: (paketRenk[odemeProfil.isletme.paket] || "#6f6a62") + "22", color: paketRenk[odemeProfil.isletme.paket] || "#6f6a62" }}>{odemeProfil.isletme.paket}</span>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>📅 Kayıt: {new Date(odemeProfil.isletme.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                        <span style={{ fontSize: 12, color: "var(--dim)" }}>{odemeProfil.olusturma_gun} gün önce</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 28, fontWeight: 600, color: "var(--green)" }}>{odemeProfil.paket_fiyat}₺<span style={{ fontSize: 13, color: "var(--dim)", fontWeight: 400 }}>/ay</span></div>
                    </div>
                  </div>

                  {/* Deneme Süresi */}
                  {odemeProfil.deneme_suresi_kalan > 0 && (
                    <div style={{ background: "rgba(47,86,198,.06)", border: "1px solid rgba(47,86,198,.15)", borderRadius: 12, padding: "14px 18px", marginBottom: 16 }}>
                      <div className="row row-between row-wrap gap-8">
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#2f56c6" }}>⏰ Deneme Süresi: {odemeProfil.deneme_suresi_kalan} gün kaldı</div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İlk 14 gün ücretsiz — ödeme yapılmasa da erişim açık.</div>
                        </div>
                        <div className="row gap-6">
                          {[7, 14, 30].map(g => (
                            <button key={g} onClick={async () => {
                              await api.post(`/admin/isletmeler/${odemeProfil.isletme.id}/deneme-uzat`, { gun: g });
                              odemeProfiliYukle(odemeProfil.isletme.id);
                            }} className="btn btn-sm" style={{ background: "rgba(47,86,198,.1)", color: "#2f56c6", border: "none", fontSize: 11 }}>{g} gün</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* İstatistik Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 16 }}>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Toplam Ödenen</div>
                      <div style={{ fontSize: 20, fontWeight: 600, color: "#1f6f4a" }}>{odemeProfil.istatistikler.toplam_odenen.toFixed(0)}₺</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Bu Ay Durum</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: odemeProfil.istatistikler.bu_ay_durum === "odendi" ? "#1f6f4a" : odemeProfil.istatistikler.bu_ay_durum === "deneme" ? "#2f56c6" : "#b42318" }}>
                        {odemeProfil.istatistikler.bu_ay_durum === "odendi" ? "✓ Ödendi" : odemeProfil.istatistikler.bu_ay_durum === "deneme" ? "⏳ Deneme" : "✕ Ödenmedi"}
                      </div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Son Ödeme</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{odemeProfil.istatistikler.son_odeme_tarihi ? new Date(odemeProfil.istatistikler.son_odeme_tarihi).toLocaleDateString("tr-TR") : "—"}</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Ödenen / Toplam Ay</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{odemeProfil.istatistikler.odenen_ay}/{odemeProfil.istatistikler.toplam_ay}</div>
                    </div>
                    <div style={{ background: "var(--bg)", borderRadius: 10, padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Gecikme Sayısı</div>
                      <div style={{ fontSize: 18, fontWeight: 600, color: odemeProfil.istatistikler.gecikme_sayisi > 0 ? "#b42318" : "var(--text)" }}>{odemeProfil.istatistikler.gecikme_sayisi}</div>
                    </div>
                  </div>
                </div>

                {/* Ödeme Takvimi */}
                <h3 style={{ fontSize: 16, marginBottom: 12, color: "var(--text)" }}>Ödeme Takvimi (Son 12 Ay)</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, marginBottom: 20 }}>
                  {odemeProfil.takvim.map(t => {
                    const renk = t.durum === "odendi" ? "#1f6f4a" : t.durum === "bekliyor" ? "#a8590c" : t.durum === "gecikti" ? "#b42318" : t.durum === "havale_bekliyor" ? "#5d4bb5" : t.durum === "deneme" ? "#2f56c6" : "#6f6a62";
                    return (
                      <div key={t.donem} style={{ background: `${renk}08`, border: `1px solid ${renk}25`, borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{t.donem}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: renk }}>
                          {t.durum === "odendi" ? "✓ Ödendi" : t.durum === "bekliyor" ? "⏳ Bekliyor" : t.durum === "gecikti" ? "⚠ Gecikti" : t.durum === "havale_bekliyor" ? "🏦 Havale" : t.durum === "deneme" ? "🆓 Deneme" : "— Yok"}
                        </div>
                        {t.tutar > 0 && <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginTop: 2 }}>{t.tutar}₺</div>}
                        {t.odeme_tarihi && <div style={{ fontSize: 10, color: "var(--dim)" }}>{new Date(t.odeme_tarihi).toLocaleDateString("tr-TR")}</div>}
                        {t.odeme_yontemi && <div style={{ fontSize: 10, color: "var(--dim)" }}>{t.odeme_yontemi === "shopier" ? "💳 Shopier" : t.odeme_yontemi === "havale" ? "🏦 Havale" : t.odeme_yontemi}</div>}
                        {t.id && t.durum !== "odendi" && (
                          <div className="row gap-4 mt-4">
                            <button onClick={() => { odemeGuncelle(t.id, "odendi"); setTimeout(() => odemeProfiliYukle(odemeProfil.isletme.id), 500); }} className="btn btn-sm" style={{ background: `${renk}15`, color: renk, border: "none", fontSize: 10, padding: "4px 8px" }}>✓ Öde</button>
                            <button onClick={() => { setErtelemeModal(t); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(111,106,98,.1)", color: "#6f6a62", border: "none", fontSize: 10, padding: "4px 8px" }}>📅 Ertele</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Paket Geçmişi */}
                {odemeProfil.paket_gecmisi.length > 0 && (
                  <>
                    <h3 style={{ fontSize: 16, marginBottom: 12, color: "var(--text)" }}>Paket Değişiklik Geçmişi</h3>
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
                <h3 style={{ fontSize: 16, marginBottom: 12, marginTop: 20, color: "var(--text)" }}>Tüm Ödeme Kayıtları</h3>
                {odemeProfil.odemeler.length === 0 ? (
                  <div className="list-empty"><p>Henüz ödeme kaydı yok.</p></div>
                ) : odemeProfil.odemeler.map(o => (
                  <div key={o.id} className="list-item" style={{ flexDirection: "column", gap: 8, marginBottom: 8 }}>
                    <div className="row row-between row-wrap gap-8">
                      <div className="row gap-8">
                        <span style={{ fontWeight: 600, color: "var(--text)" }}>📅 {o.donem}</span>
                        <span style={{ fontWeight: 600, color: "var(--green)" }}>{o.tutar}₺</span>
                        {o.odeme_yontemi && <span style={{ fontSize: 11, color: "var(--dim)" }}>{o.odeme_yontemi === "shopier" ? "💳 Shopier" : o.odeme_yontemi === "havale" ? "🏦 Havale" : o.odeme_yontemi}</span>}
                      </div>
                      <span className="tag-xs" style={{ background: (odemeRenk[o.durum] || "#6f6a62") + "22", color: odemeRenk[o.durum] || "#6f6a62", fontWeight: 600 }}>{odemeLabel[o.durum] || o.durum}</span>
                    </div>
                    {o.odeme_tarihi && <div style={{ fontSize: 11, color: "var(--dim)" }}>Ödeme tarihi: {new Date(o.odeme_tarihi).toLocaleString("tr-TR")}</div>}
                    {o.referans_kodu && <div style={{ fontSize: 11, color: "var(--dim)" }}>Ref: {o.referans_kodu}</div>}
                    {o.notlar && <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", borderRadius: 6, padding: "6px 10px" }}>{o.notlar}</div>}
                    <div className="row gap-6">
                      {o.durum === "havale_bekliyor" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.15)", color: "var(--green)", border: "none", fontWeight: 600, fontSize: 11 }}>✓ Onayla</button>
                          <button onClick={async () => { await odemeGuncelle(o.id, "bekliyor"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(180,35,24,.12)", color: "var(--red)", border: "none", fontSize: 11 }}>✗ Reddet</button>
                        </>
                      )}
                      {o.durum === "bekliyor" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                          <button onClick={async () => { await odemeGuncelle(o.id, "gecikti"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none", fontSize: 11 }}>Gecikti</button>
                          <button onClick={() => { setErtelemeModal(o); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(111,106,98,.1)", color: "#6f6a62", border: "none", fontSize: 11 }}>📅 Ertele</button>
                        </>
                      )}
                      {o.durum === "gecikti" && (
                        <>
                          <button onClick={async () => { await odemeGuncelle(o.id, "odendi"); odemeProfiliYukle(odemeProfil.isletme.id); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                          <button onClick={() => { setErtelemeModal(o); setErtelemeDonem(""); setErtelemeSebep(""); }} className="btn btn-sm" style={{ background: "rgba(111,106,98,.1)", color: "#6f6a62", border: "none", fontSize: 11 }}>📅 Ertele</button>
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
                      <h3 style={{ marginBottom: 12, fontSize: 16 }}>Ödeme Erteleme</h3>
                      <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16 }}>Mevcut dönem: {ertelemeModal.donem}</p>
                      <label className="form-label">Yeni Dönem</label>
                      <input type="month" value={ertelemeDonem} onChange={e => setErtelemeDonem(e.target.value)} className="input mb-12" />
                      <label className="form-label">Sebep (Opsiyonel)</label>
                      <input type="text" value={ertelemeSebep} onChange={e => setErtelemeSebep(e.target.value)} placeholder="Örn: Müşteri talep etti" className="input mb-16" />
                      <div className="row gap-8">
                        <button onClick={async () => {
                          if (!ertelemeDonem) { alert("Yeni dönem seçin"); return; }
                          const r = await api.post(`/admin/odemeler/${ertelemeModal.id}/ertele`, { yeni_donem: ertelemeDonem, sebep: ertelemeSebep });
                          if (r?.hata) { alert("Ertelenemedi: " + r.hata); return; }
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
                <h3 style={{ fontSize: 15, marginBottom: 12, color: "var(--text)" }}>İşletme Bazlı Ödeme Durumu</h3>
                {isletmeler.map(i => {
                  const iOdemeleri = odemeler.filter(o => o.isletme_id === i.id);
                  const buAyO = iOdemeleri.find(o => o.donem === buAy);
                  const olusturmaGun = Math.floor((new Date() - new Date(i.olusturma_tarihi)) / 86400000);
                  const deneme = olusturmaGun <= 7;
                  const durum = buAyO ? buAyO.durum : (deneme ? "deneme" : "odenmedi");
                  const durumRenk = durum === "odendi" ? "#1f6f4a" : durum === "deneme" ? "#2f56c6" : durum === "bekliyor" ? "#a8590c" : durum === "havale_bekliyor" ? "#5d4bb5" : "#b42318";
                  const durumText = durum === "odendi" ? "✓ Ödendi" : durum === "deneme" ? `⏳ Deneme (${7 - olusturmaGun} gün)` : durum === "bekliyor" ? "⏳ Bekliyor" : durum === "havale_bekliyor" ? "🏦 Havale" : durum === "gecikti" ? "⚠ Gecikti" : "✕ Ödenmedi";
                  return (
                    <div key={i.id} className="list-item mb-8" style={{ cursor: "pointer" }} onClick={() => odemeProfiliYukle(i.id)}>
                      <div className="row row-between row-wrap gap-8" style={{ width: "100%" }}>
                        <div className="row gap-10" style={{ alignItems: "center" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 10, background: `${durumRenk}12`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 16 }}>{durum === "odendi" ? "✅" : durum === "deneme" ? "🆓" : durum === "havale_bekliyor" ? "🏦" : "⚠️"}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{i.isim}</div>
                            <div className="row gap-6 mt-2">
                              <span className="tag-xs" style={{ background: (paketRenk[i.paket] || "#6f6a62") + "22", color: paketRenk[i.paket] || "#6f6a62" }}>{i.paket} · {paketFiyat[i.paket]}₺</span>
                              <span style={{ fontSize: 11, color: "var(--dim)" }}>Kayıt: {new Date(i.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: durumRenk }}>{durumText}</div>
                          <div style={{ fontSize: 11, color: "var(--dim)" }}>Bu ay: {buAy}</div>
                          {!buAyO && !deneme && (
                            <button onClick={async (e) => {
                              e.stopPropagation();
                              await api.post("/admin/odemeler", { isletme_id: i.id, tutar: paketFiyat[i.paket] || 299, donem: buAy, durum: "bekliyor" });
                              odemeleriYukle(); isletmeleriYukle();
                            }} className="btn btn-sm mt-4" style={{ background: "rgba(168,89,12,.12)", color: "var(--amber)", border: "none", fontWeight: 600, fontSize: 11 }}>
                              + Bekliyor Oluştur
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Tüm ödeme kayıtları */}
                <h3 style={{ fontSize: 15, marginBottom: 12, marginTop: 24, color: "var(--text)" }}>Tüm Ödeme Kayıtları</h3>
                {yukleniyor ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> :
                  filtreliOdemeler.length === 0 ? (
                    <div className="list-empty"><p>Kayıt bulunamadı.</p></div>
                  ) : filtreliOdemeler.map(o => (
                    <div key={o.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 8 }}>
                      <div className="row row-between row-wrap gap-8">
                        <div className="row row-wrap gap-8">
                          <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14, cursor: "pointer", textDecoration: "underline dotted" }}
                            onClick={() => { const isl = isletmeler.find(i => i.isim === o.isletme_isim); if(isl) odemeProfiliYukle(isl.id); }}>{o.isletme_isim}</span>
                          <span style={{ color: "var(--dim)", fontSize: 12 }}>📅 {o.donem}</span>
                          <span style={{ color: "var(--green)", fontWeight: 600, fontSize: 14 }}>{o.tutar}₺</span>
                          {o.odeme_tarihi && <span style={{ color: "var(--dim)", fontSize: 11 }}>· {new Date(o.odeme_tarihi).toLocaleDateString("tr-TR")}</span>}
                        </div>
                        <span className="tag-xs" style={{ background: (odemeRenk[o.durum] || "#6f6a62") + "22", color: odemeRenk[o.durum] || "#6f6a62", fontWeight: 600 }}>{odemeLabel[o.durum] || o.durum}</span>
                      </div>
                      <div className="row gap-6">
                        {o.durum === "havale_bekliyor" && (
                          <>
                            <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.15)", color: "var(--green)", border: "none", fontWeight: 600, fontSize: 11 }}>✓ Onayla</button>
                            <button onClick={() => { odemeGuncelle(o.id, "bekliyor"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(180,35,24,.12)", color: "var(--red)", border: "none", fontSize: 11 }}>✗ Reddet</button>
                          </>
                        )}
                        {o.durum === "bekliyor" && (
                          <>
                            <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
                            <button onClick={() => { odemeGuncelle(o.id, "gecikti"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none", fontSize: 11 }}>Gecikti</button>
                          </>
                        )}
                        {o.durum === "gecikti" && (
                          <button onClick={() => { odemeGuncelle(o.id, "odendi"); setTimeout(odemeleriYukle, 300); }} className="btn btn-sm" style={{ background: "rgba(31,111,74,.12)", color: "var(--green)", border: "none", fontSize: 11 }}>✓ Ödendi</button>
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

        {/* EKİP (yalnız kurucu) */}
        {sayfa === "ekip" && izinli('kurucu') && (
          <EkipYonetimi api={api} />
        )}

        {/* MAĞAZA PİLOTU */}
        {sayfa === "magaza" && (
          <MagazaAdmin api={api} isletmeler={isletmeler} />
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
              <div key={m.id} className="list-item" style={{ flexDirection: "column", alignItems: "stretch", gap: 10, borderLeft: m.okundu ? "3px solid var(--border)" : "3px solid #5d4bb5" }}>
                <div className="row row-between row-wrap gap-8">
                  <div className="row row-wrap gap-8">
                    <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 15 }}>{m.isim || "—"}</span>
                    {m.email && <a href={"mailto:" + m.email} style={{ color: "#5d4bb5", fontSize: 13 }}>{m.email}</a>}
                    {m.telefon && <a href={"tel:" + m.telefon} style={{ color: "#1f6f4a", fontSize: 13 }}>📞 {m.telefon}</a>}
                    {m.kaynak && <span className="tag" style={{ background: "rgba(93,75,181,.1)", color: "#5d4bb5", fontSize: 10 }}>{m.kaynak}</span>}
                  </div>
                  <div className="row gap-8">
                    <span style={{ color: "var(--dim)", fontSize: 12 }}>{new Date(m.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                    <span className="tag" style={{ background: m.okundu ? "rgba(31,111,74,.12)" : "rgba(93,75,181,.12)", color: m.okundu ? "var(--green)" : "#5d4bb5", fontWeight: 600 }}>
                      {m.okundu ? "Okundu" : "Yeni"}
                    </span>
                  </div>
                </div>
                <div style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{m.mesaj}</div>
                <div className="row gap-6">
                  <button onClick={async () => { await api.put("/admin/iletisim/" + m.id, { okundu: !m.okundu }); iletisimYukle(); }} className="btn btn-sm" style={{ background: m.okundu ? "rgba(168,89,12,.12)" : "rgba(31,111,74,.12)", color: m.okundu ? "var(--amber)" : "var(--green)", border: "none", fontWeight: 600 }}>
                    {m.okundu ? "Okunmadı İşaretle" : "Okundu İşaretle"}
                  </button>
                  <button onClick={async () => { if (confirm("Bu mesajı silmek istediğinize emin misiniz?")) { await api.del("/admin/iletisim/" + m.id); iletisimYukle(); } }} className="btn btn-sm" style={{ background: "rgba(180,35,24,.1)", color: "var(--red)", border: "none" }}>Sil</button>
                  {m.email && <a href={"mailto:" + m.email} className="btn btn-sm" style={{ background: "rgba(93,75,181,.12)", color: "#5d4bb5", border: "none", textDecoration: "none" }}>Mail</a>}
                  {m.telefon && <a href={"https://wa.me/" + (d => d.startsWith("90") && d.length === 12 ? d : "90" + d.replace(/^0+/, ""))(String(m.telefon).replace(/\D/g, ""))} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: "rgba(37,211,102,.12)", color: "#25d366", border: "none", textDecoration: "none" }}>WhatsApp</a>}
                </div>
              </div>
            ))}
          </>
        )}

        {/* AUDIT LOG */}
        {sayfa === "auditLog" && (
          <>
            <div className="page-header">
              <h1>Audit Log — Sistem Logları</h1>
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
                        <span className="tag" style={{ background: "rgba(93,75,181,.12)", color: "#5d4bb5", fontWeight: 600, fontSize: 11 }}>{l.islem}</span>
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
              <h1>Sistem Durumu & Health Monitor</h1>
              <p>Sunucu, veritabanı ve servis sağlığı</p>
            </div>
            <button onClick={sistemDurumuYukle} className="btn btn-sm mb-16" style={{ background: "rgba(47,86,198,.12)", color: "#2f56c6", fontWeight: 600 }}>🔄 Yenile</button>
            {!sistemDurum ? <div style={{ color: "var(--dim)" }}>Yükleniyor...</div> : (
              <>
                {/* Genel durum banner */}
                <div className="card mb-16" style={{ padding: "16px 20px", background: sistemDurum.durum === 'aktif' ? "rgba(31,111,74,.06)" : "rgba(180,35,24,.06)", border: `1px solid ${sistemDurum.durum === 'aktif' ? "rgba(31,111,74,.15)" : "rgba(180,35,24,.15)"}` }}>
                  <div className="row gap-10">
                    <span style={{ fontSize: 24 }}>{sistemDurum.durum === 'aktif' ? '✅' : '❌'}</span>
                    <div>
                      <div style={{ color: sistemDurum.durum === 'aktif' ? "#1f6f4a" : "#b42318", fontWeight: 600, fontSize: 16 }}>
                        Sistem {sistemDurum.durum === 'aktif' ? 'Çalışıyor' : 'Sorunlu'}
                      </div>
                      <div style={{ color: "var(--dim)", fontSize: 12 }}>Son kontrol: {new Date(sistemDurum.zaman).toLocaleString("tr-TR")}</div>
                    </div>
                  </div>
                </div>

                <div className="stats-grid">
                  <div className="stat-card green"><div className="sc-icon">⏱️</div><div className="sc-label">Uptime</div><div className="sc-val">{sistemDurum.sunucu.uptime_saat} saat</div></div>
                  <div className="stat-card blue"><div className="sc-icon">💾</div><div className="sc-label">Bellek</div><div className="sc-val">{sistemDurum.sunucu.bellek_mb} MB</div><div style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>/ {sistemDurum.sunucu.bellek_toplam_mb} MB</div></div>
                  <div className="stat-card" style={{"--card-accent": sistemDurum.veritabani.durum === 'saglikli' ? "#1f6f4a" : "#b42318"}}>
                    <div className="sc-icon">🗄️</div><div className="sc-label">Veritabanı</div>
                    <div className="sc-val" style={{ color: sistemDurum.veritabani.durum === 'saglikli' ? "#1f6f4a" : "#b42318" }}>{sistemDurum.veritabani.yanit_ms}ms</div>
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
                        <span className="tag" style={{ background: v === 'bagli' || v === 'aktif' ? "rgba(31,111,74,.15)" : "rgba(168,89,12,.15)", color: v === 'bagli' || v === 'aktif' ? "#1f6f4a" : "#a8590c", fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* DB Havuzu */}
                <div className="card-dark mt-16">
                  <h3 style={{ fontSize: 15, color: "var(--muted)", marginBottom: 12 }}>DB Bağlantı Havuzu</h3>
                  <div className="row gap-16">
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Toplam:</span> <strong style={{ color: "var(--text)" }}>{sistemDurum.veritabani.havuz.total}</strong></div>
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Boşta:</span> <strong style={{ color: "#1f6f4a" }}>{sistemDurum.veritabani.havuz.idle}</strong></div>
                    <div><span style={{ color: "var(--dim)", fontSize: 12 }}>Bekleyen:</span> <strong style={{ color: "#a8590c" }}>{sistemDurum.veritabani.havuz.waiting}</strong></div>
                  </div>
                </div>

                <div className="card-dark mt-16">
                  <h3 style={{ fontSize: 15, color: "var(--muted)", marginBottom: 8 }}>Sunucu Bilgileri</h3>
                  <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 2 }}>
                    Platform: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.platform}</strong> · Node: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.node_versiyon}</strong> · CPU: <strong style={{ color: "var(--text)" }}>{sistemDurum.sunucu.cpu_yukleme}</strong> · Hatalar (24s): <strong style={{ color: sistemDurum.son_24_saat.hata > 0 ? "#b42318" : "#1f6f4a" }}>{sistemDurum.son_24_saat.hata}</strong>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* DESTEK TALEPLERİ */}
        {sayfa === "destek" && (() => {
          const oncelikRenk = { acil: "#b42318", yuksek: "#a8590c", normal: "#2f56c6", dusuk: "#6f6a62" };
          const durumRenk = { acik: "#a8590c", yanitlandi: "#2f56c6", cozuldu: "#1f6f4a", kapali: "#6f6a62" };
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
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Destek Talepleri</h2>
                  <button onClick={destekYukle} style={{ background: "rgba(47,86,198,.1)", color: "#2f56c6", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Yenile</button>
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
                    background: destekYanitAcik === t.id ? "rgba(93,75,181,.08)" : "transparent",
                    borderLeft: destekYanitAcik === t.id ? "3px solid var(--primary)" : "3px solid transparent",
                    transition: "all .15s"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>#{t.id} {t.konu}</span>
                      <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", marginLeft: 8 }}>{new Date(t.olusturma_tarihi).toLocaleDateString("tr-TR")}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (oncelikRenk[t.oncelik]||"#6f6a62") + "18", color: oncelikRenk[t.oncelik]||"#6f6a62", fontWeight: 600 }}>{t.oncelik}</span>
                      <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (durumRenk[t.durum]||"#6f6a62") + "18", color: durumRenk[t.durum]||"#6f6a62", fontWeight: 600 }}>{durumIcon[t.durum]} {durumLabel[t.durum]}</span>
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
                        <span style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>#{secili.id} {secili.konu}</span>
                        <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: (durumRenk[secili.durum]||"#6f6a62") + "18", color: durumRenk[secili.durum]||"#6f6a62", fontWeight: 600 }}>{durumIcon[secili.durum]} {durumLabel[secili.durum]}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ padding: "1px 6px", borderRadius: 4, background: (oncelikRenk[secili.oncelik]||"#6f6a62") + "15", color: oncelikRenk[secili.oncelik], fontWeight: 600, fontSize: 10 }}>{secili.oncelik}</span>
                        {secili.isletme_isim && <span>🏢 {secili.isletme_isim}</span>}
                        <span>{new Date(secili.olusturma_tarihi).toLocaleString("tr-TR")}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {secili.durum !== 'cozuldu' && <button onClick={async () => { await api.put(`/admin/destek/${secili.id}`, { durum: 'cozuldu' }); destekYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(31,111,74,.12)", color: "#1f6f4a", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Çözüldü</button>}
                      {secili.durum !== 'kapali' && <button onClick={async () => { await api.put(`/admin/destek/${secili.id}`, { durum: 'kapali' }); destekYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: "rgba(111,106,98,.12)", color: "#6f6a62", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Kapat</button>}
                    </div>
                  </div>

                  {/* Chat area */}
                  <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
                    {/* Müşteri mesajı */}
                    <div style={{ display: "flex", gap: 10, maxWidth: "80%" }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#5d4bb5", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{(secili.isletme_isim || "M")[0].toUpperCase()}</div>
                      <div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>{secili.isletme_isim || "Müşteri"} · {new Date(secili.olusturma_tarihi).toLocaleString("tr-TR")}</div>
                        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px 14px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{secili.mesaj}</div>
                      </div>
                    </div>

                    {/* Admin yanıtı */}
                    {secili.admin_yanit && (
                      <div style={{ display: "flex", gap: 10, maxWidth: "80%", alignSelf: "flex-end", flexDirection: "row-reverse" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1f6f4a", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>SA</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>SıraGO Destek · {secili.admin_yanit_tarihi ? new Date(secili.admin_yanit_tarihi).toLocaleString("tr-TR") : ""}</div>
                          <div style={{ background: "rgba(31,111,74,.08)", border: "1px solid rgba(31,111,74,.15)", borderRadius: "14px 4px 14px 14px", padding: "10px 14px", fontSize: 13, color: "var(--text)", lineHeight: 1.6, whiteSpace: "pre-wrap", textAlign: "left" }}>{secili.admin_yanit}</div>
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
                      }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#1f6f4a", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-end" }}>Yanıtla</button>
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
              <h1>Paket Yönetimi</h1>
              <p>Paket özelliklerini if/else yazmadan panelden yönet</p>
            </div>
            <button onClick={() => setPaketFormAcik(!paketFormAcik)} className="btn btn-sm mb-16" style={{ background: "var(--amber)", color: "#000", fontWeight: 600 }}>+ Yeni Paket Tanımla</button>

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
                  <button type="submit" className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 600 }}>Kaydet</button>
                  <button type="button" onClick={() => setPaketFormAcik(false)} className="btn btn-ghost">İptal</button>
                </div>
              </form>
            )}

            {(() => {
              const PLAN_DEFS = {
                baslangic: { isim: "Başlangıç", fiyat: 299, calisan_limit: 1, hizmet_limit: 5, aylik_randevu_limit: 200, bot_aktif: true, hatirlatma: true, istatistik: false, export_aktif: false, ozellikler: "1 Çalışan\n200 Randevu/Ay\nOtomatik Hatırlatma\nTemel Analitik", sira: 1 },
                profesyonel: { isim: "Profesyonel", fiyat: 999, calisan_limit: 3, hizmet_limit: 20, aylik_randevu_limit: 99999, bot_aktif: true, hatirlatma: true, istatistik: true, export_aktif: true, ozellikler: "3 Çalışan\nSınırsız Randevu\nTelegram Desteği\nGelişmiş Analitik\nGoogle Calendar Sync\n5 Dil Desteği", sira: 2 },
                kurumsal: { isim: "Kurumsal", fiyat: 0, calisan_limit: 999, hizmet_limit: 999, aylik_randevu_limit: 99999, bot_aktif: true, hatirlatma: true, istatistik: true, export_aktif: true, ozellikler: "Sınırsız Çalışan\nSınırsız Randevu\nÖzel API Entegrasyonu\nÖzel Eğitim & Onboarding\nSLA Garantisi\n3 Dil (TR · EN · AR)", sira: 3 }
              };
              const mevcutKodlar = paketTanimlar.map(p => p.kod);
              const eksikler = Object.entries(PLAN_DEFS).filter(([kod]) => !mevcutKodlar.includes(kod));

              return (
                <>
                  {eksikler.length > 0 && (
                    <div className="card mb-16" style={{ padding: "16px 20px", background: "rgba(47,86,198,.05)", border: "1px solid rgba(47,86,198,.15)" }}>
                      <div style={{ fontSize: 13, color: "#2f56c6", fontWeight: 600, marginBottom: 10 }}>📦 Landing page'deki {eksikler.length} paket henüz DB'de tanımlı değil:</div>
                      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                        {eksikler.map(([kod, p]) => (
                          <button key={kod} onClick={async () => {
                            await api.post("/admin/paketler", { kod, ...p });
                            paketleriYukle();
                          }} className="btn btn-sm" style={{ background: "rgba(47,86,198,.12)", color: "#2f56c6", fontWeight: 600 }}>
                            {p.isim} {p.fiyat > 0 ? `(${p.fiyat}₺)` : "(Özel Fiyat)"} → DB'ye Aktar
                          </button>
                        ))}
                        <button onClick={async () => {
                          for (const [kod, p] of eksikler) { await api.post("/admin/paketler", { kod, ...p }); }
                          paketleriYukle();
                        }} className="btn btn-sm" style={{ background: "#2f56c6", color: "#fff", fontWeight: 600 }}>
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
                      }} style={{ background: "var(--surface)", borderRadius: 14, padding: "20px", border: "2px solid rgba(168,89,12,.3)", marginBottom: 8 }}>
                        <div className="row row-between mb-12">
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#a8590c" }}>✏️ Düzenleme: {p.isim}</span>
                          <div className="row gap-6">
                            <button type="submit" style={{ padding: "6px 16px", borderRadius: 8, border: "none", cursor: "pointer", background: "#a8590c", color: "#000", fontWeight: 600, fontSize: 12 }}>💾 Kaydet</button>
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
                            <span style={{ color: paketRenk[p.kod] || "#5d4bb5", fontWeight: 600, fontSize: 16 }}>{p.isim}</span>
                            <span className="tag" style={{ background: "rgba(168,89,12,.12)", color: "#a8590c", fontWeight: 600 }}>{parseFloat(p.fiyat)}₺/ay</span>
                            <span style={{ color: "var(--dim)", fontSize: 12 }}>kod: {p.kod}</span>
                            {!p.aktif && <span className="tag" style={{ background: "rgba(180,35,24,.12)", color: "#b42318", fontWeight: 600, fontSize: 11 }}>Pasif</span>}
                          </div>
                          <div className="row gap-6">
                            <button onClick={() => setDuzenlePaket({ id: p.id, kod: p.kod, isim: p.isim, fiyat: p.fiyat, calisan_limit: p.calisan_limit, hizmet_limit: p.hizmet_limit, aylik_randevu_limit: p.aylik_randevu_limit, bot_aktif: p.bot_aktif, hatirlatma: p.hatirlatma, istatistik: p.istatistik, export_aktif: p.export_aktif, ozellikler: p.ozellikler || "", sira: p.sira || 0 })} className="btn btn-sm" style={{ background: "rgba(47,86,198,.1)", color: "#2f56c6", border: "none", fontWeight: 600 }}>✏️ Düzenle</button>
                            <button onClick={async () => { if(confirm(`"${p.isim}" paketini silmek istediğinize emin misiniz?`)) { await api.del(`/admin/paketler/${p.id}`); paketleriYukle(); } }} className="btn btn-sm" style={{ background: "var(--red-s)", color: "var(--red)", border: "none" }}>Sil</button>
                          </div>
                        </div>
                        <div className="row row-wrap gap-12" style={{ fontSize: 12, color: "var(--dim)" }}>
                          <span>👥 {p.calisan_limit >= 999 ? "Sınırsız" : p.calisan_limit} çalışan</span>
                          <span>🔧 {p.hizmet_limit >= 999 ? "Sınırsız" : p.hizmet_limit} hizmet</span>
                          <span>📅 {p.aylik_randevu_limit >= 9999 ? "Sınırsız" : p.aylik_randevu_limit} randevu</span>
                          {p.bot_aktif && <span style={{ color: "#1f6f4a" }}>🤖 Bot</span>}
                          {p.hatirlatma && <span style={{ color: "#2f56c6" }}>🔔 Hatırlatma</span>}
                          {p.istatistik && <span style={{ color: "#5d4bb5" }}>📊 İstatistik</span>}
                          {p.export_aktif && <span style={{ color: "#a8590c" }}>📥 Export</span>}
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
          const durumRenk = { bot_yok: "#b42318", randevu_yok: "#a8590c", pasif_30gun: "#2f56c6" };
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
              <h1>Zombi Müşteri Takibi</h1>
              <p>Aktif işletmeler arasında ilgi göstermeyenler — bot bağlamamış veya hiç randevu almamış</p>
            </div>

            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{"--card-accent":"#b42318"}}><div className="sc-icon">🚫</div><div className="sc-label">Bot Yok & Randevu Yok</div><div className="sc-val">{botYok.length}</div></div>
              <div className="stat-card amber"><div className="sc-icon">📭</div><div className="sc-label">Hiç Randevu Almamış</div><div className="sc-val">{randevuYok.length}</div></div>
              <div className="stat-card blue"><div className="sc-icon">😴</div><div className="sc-label">30+ Gün Pasif</div><div className="sc-val">{pasif30.length}</div></div>
              <div className="stat-card" style={{"--card-accent":"#6f6a62"}}><div className="sc-icon">🧟</div><div className="sc-label">Toplam Zombi</div><div className="sc-val">{zombiler.length}</div></div>
            </div>

            {/* Aksiyon Bar */}
            {zombiler.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, padding: "10px 16px", background: "var(--surface)", borderRadius: 12, border: "1px solid var(--border)" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  <input type="checkbox" checked={zombiSecili.length === zombiler.length && zombiler.length > 0} onChange={tumunuSec} style={{ accentColor: "#5d4bb5", width: 16, height: 16 }} />
                  Tümünü Seç ({zombiSecili.length}/{zombiler.length})
                </label>
                <div style={{ flex: 1 }} />
                <button onClick={() => { if (zombiSecili.length === 0) return alert('Önce işletme seçin'); setZombiMesajModal(true); }}
                  style={{ padding: "8px 16px", borderRadius: 10, background: zombiSecili.length > 0 ? "#5d4bb5" : "#64748b40", color: zombiSecili.length > 0 ? "#fff" : "var(--dim)", border: "none", fontWeight: 600, fontSize: 13, cursor: zombiSecili.length > 0 ? "pointer" : "default" }}>
                  📨 Seçilenlere Mesaj Gönder ({zombiSecili.length})
                </button>
              </div>
            )}

            {zombiler.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>Zombi müşteri yok!</div>
                <p style={{ fontSize: 13 }}>Tüm aktif işletmeler bot bağlamış ve randevu alıyor</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {zombiler.map(z => {
                  const renk = durumRenk[z.zombi_durum] || "#6f6a62";
                  const gunOnce = z.olusturma_tarihi ? Math.floor((new Date() - new Date(z.olusturma_tarihi)) / 86400000) : 0;
                  const secili = zombiSecili.includes(z.id);
                  return (
                    <div key={z.id} style={{ background: secili ? "rgba(93,75,181,.06)" : "var(--surface)", borderRadius: 14, padding: "14px 18px", border: `1px solid ${secili ? "#5d4bb5" : renk + "20"}`, cursor: "pointer", transition: "all .15s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        {/* Checkbox */}
                        <input type="checkbox" checked={secili} onChange={() => { if (secili) setZombiSecili(zombiSecili.filter(id => id !== z.id)); else setZombiSecili([...zombiSecili, z.id]); }} onClick={e => e.stopPropagation()} style={{ accentColor: "#5d4bb5", width: 16, height: 16, flexShrink: 0 }} />
                        {/* Avatar */}
                        <div onClick={() => isletmeDetayYukle(z.id)} style={{ width: 40, height: 40, borderRadius: 10, background: `${renk}12`, display: "flex", alignItems: "center", justifyContent: "center", color: renk, fontWeight: 600, fontSize: 15, flexShrink: 0 }}>
                          {(z.isim || "?")[0]}
                        </div>

                        {/* Bilgi */}
                        <div onClick={() => isletmeDetayYukle(z.id)} style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{z.isim}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${renk}12`, color: renk, fontSize: 10, fontWeight: 600 }}>{durumLabel[z.zombi_durum]}</span>
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
                          <div style={{ padding: "4px 10px", borderRadius: 8, background: z.bot_bagli ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.08)", color: z.bot_bagli ? "#1f6f4a" : "#b42318", fontSize: 11, fontWeight: 600 }}>
                            {z.bot_bagli ? "✓ Bot Bağlı" : "✗ Bot Yok"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ═══ OTOMATİK AKSİYON MOTORU ═══ */}
            <div style={{ marginTop: 16, background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)" }}>
              <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>Otomatik Aksiyon Motoru</h3>
                  <p style={{ fontSize: 12, color: "var(--dim)", margin: "4px 0 0" }}>Kural tabanlı aksiyon önerileri — tek tıkla veya toplu uygula</p>
                </div>
                <div className="row gap-8">
                  {["oneriler", "gecmis"].map(t => (
                    <button key={t} onClick={() => setZombiAksiyonTab(t)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (zombiAksiyonTab === t ? "#5d4bb5" : "var(--border)"), cursor: "pointer", background: zombiAksiyonTab === t ? "rgba(93,75,181,.08)" : "var(--bg)", color: zombiAksiyonTab === t ? "#5d4bb5" : "var(--dim)", fontWeight: 600, fontSize: 12 }}>
                      {t === "oneriler" ? `⚡ Öneriler (${zombiAksiyonlar.length})` : `📜 Geçmiş (${zombiAksiyonGecmis.length})`}
                    </button>
                  ))}
                  <button onClick={zombiOtomatikAksiyonYukle} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄</button>
                </div>
              </div>

              {/* Öneriler Tab */}
              {zombiAksiyonTab === "oneriler" && (
                <>
                  {zombiAksiyonYukleniyor ? (
                    <p style={{ textAlign: "center", color: "var(--dim)", padding: 20 }}>Analiz ediliyor...</p>
                  ) : zombiAksiyonlar.length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--dim)", padding: 20, fontSize: 13 }}>🎉 Şu an aksiyon gerektiren zombi yok!</p>
                  ) : (
                    <>
                      <div style={{ marginBottom: 12, display: "flex", justifyContent: "flex-end" }}>
                        <button onClick={zombiTopluAksiyonUygula} style={{ padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 12 }}>🚀 Tümünü Uygula ({zombiAksiyonlar.length})</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {zombiAksiyonlar.map((a, i) => {
                          const tipRenk = { bot_uyari: "#b42318", yardim_teklif: "#a8590c", reaktivasyon: "#2f56c6", hesap_dondur: "#6f6a62" };
                          const tipIcon = { bot_uyari: "🔔", yardim_teklif: "🤝", reaktivasyon: "🔄", hesap_dondur: "❄️" };
                          const renk = tipRenk[a.aksiyon_tipi] || "#6f6a62";
                          return (
                            <div key={i} style={{ padding: "14px 18px", borderRadius: 12, background: "var(--bg)", border: `1px solid ${renk}20` }}>
                              <div className="row row-between" style={{ alignItems: "flex-start" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div className="row gap-8 mb-4" style={{ alignItems: "center" }}>
                                    <span style={{ fontSize: 16 }}>{tipIcon[a.aksiyon_tipi]}</span>
                                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{a.isletme_isim}</span>
                                    <span style={{ padding: "2px 8px", borderRadius: 6, background: `${renk}12`, color: renk, fontSize: 10, fontWeight: 600 }}>{a.zombi_durum}</span>
                                    {a.paket && <span style={{ fontSize: 10, color: "var(--dim)" }}>{a.paket}</span>}
                                  </div>
                                  <div style={{ fontSize: 12, color: "#5d4bb5", fontWeight: 600, marginBottom: 4 }}>{a.oneri}</div>
                                  <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5, maxHeight: 42, overflow: "hidden", whiteSpace: "pre-wrap" }}>{a.mesaj}</div>
                                </div>
                                <button onClick={() => zombiTekAksiyonUygula(a)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: `${renk}12`, color: renk, fontWeight: 600, fontSize: 11, flexShrink: 0, marginLeft: 12 }}>▶ Uygula</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Geçmiş Tab */}
              {zombiAksiyonTab === "gecmis" && (
                <div>
                  {zombiAksiyonGecmis.length === 0 ? (
                    <p style={{ textAlign: "center", color: "var(--dim)", padding: 20, fontSize: 13 }}>Henüz aksiyon uygulanmadı</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {zombiAksiyonGecmis.map(a => {
                        const durumRenkG = { tamamlandi: "#1f6f4a", gonderildi: "#1f6f4a", bot_kapali: "#a8590c", bekliyor: "#6f6a62" };
                        const dr = durumRenkG[a.durum] || (a.durum?.startsWith("hata") ? "#b42318" : "#6f6a62");
                        return (
                          <div key={a.id} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: dr, flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="row gap-6" style={{ alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{a.isletme_isim || `#${a.isletme_id}`}</span>
                                <span style={{ padding: "1px 6px", borderRadius: 4, background: `${dr}15`, color: dr, fontSize: 10, fontWeight: 600 }}>{a.aksiyon_tipi}</span>
                                <span style={{ padding: "1px 6px", borderRadius: 4, background: `${dr}15`, color: dr, fontSize: 10, fontWeight: 600 }}>{a.durum}</span>
                              </div>
                              {a.sonuc && a.sonuc !== a.durum && <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>Sonuç: {a.sonuc}</div>}
                            </div>
                            <span style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>{a.olusturma_tarihi ? new Date(a.olusturma_tarihi).toLocaleString("tr-TR") : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bilgi */}
            <div style={{ marginTop: 16, background: "rgba(47,86,198,.04)", borderRadius: 12, padding: "14px 18px", border: "1px solid rgba(47,86,198,.1)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#2f56c6", marginBottom: 6 }}>💡 Zombi Müşteri Nedir?</div>
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
                  <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 600, color: "var(--text)" }}>Toplu Mesaj Gönder</h3>
                  <p style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>{zombiSecili.length} işletmeye mesaj gönderilecek</p>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 6, display: "block" }}>Kanal</label>
                    <select value={zombiKanal} onChange={e => setZombiKanal(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14 }}>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="hepsi">WhatsApp + Telegram</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 6, display: "block" }}>Mesaj Metni</label>
                    <textarea value={zombiMesajMetni} onChange={e => setZombiMesajMetni(e.target.value)} rows={5} placeholder="Merhaba, SıraGO olarak sizinle tekrar iletişime geçmek istedik..." style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 14, resize: "vertical", fontFamily: "inherit" }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setZombiMesajModal(false)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>İptal</button>
                    <button onClick={zombiMesajGonder} disabled={!zombiMesajMetni.trim()} style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: zombiMesajMetni.trim() ? "#5d4bb5" : "#64748b40", color: zombiMesajMetni.trim() ? "#fff" : "var(--dim)", fontWeight: 600, fontSize: 13, cursor: zombiMesajMetni.trim() ? "pointer" : "default" }}>Gönder</button>
                  </div>
                </div>
              </div>
            )}
          </>
          );
        })()}

        {sayfa === "buyume" && <Buyume api={api} />}

        {/* ═══════ ONBOARDING ═══════ */}
        {sayfa === "onboarding" && (() => {
          const ist = onboardingData?.istatistik || {};
          const liste = onboardingData?.isletmeler || [];
          const filtrelenmis = onboardingFiltre === "hepsi" ? liste
            : onboardingFiltre === "tamamlanan" ? liste.filter(i => i.tamamYuzde === 100)
            : onboardingFiltre === "devam" ? liste.filter(i => i.tamamYuzde > 0 && i.tamamYuzde < 100)
            : liste.filter(i => i.tamamYuzde === 0);
          return (
          <>
            <div className="page-header">
              <h1>İşletme Onboarding</h1>
              <p>Yeni işletmelerin kurulum adımlarını takip et — profil, hizmet, çalışan, bot, ilk randevu</p>
            </div>

            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{"--card-accent":"#1f6f4a"}}><div className="sc-icon">✅</div><div className="sc-label">Tamamlanan</div><div className="sc-val">{ist.tamamlanan || 0}</div></div>
              <div className="stat-card amber"><div className="sc-icon">⏳</div><div className="sc-label">Devam Eden</div><div className="sc-val">{ist.devamEden || 0}</div></div>
              <div className="stat-card" style={{"--card-accent":"#b42318"}}><div className="sc-icon">🚫</div><div className="sc-label">Hiç Başlamamış</div><div className="sc-val">{ist.hicBaslamamis || 0}</div></div>
              <div className="stat-card blue"><div className="sc-icon">📊</div><div className="sc-label">Ortalama İlerleme</div><div className="sc-val">%{ist.ortalamaYuzde || 0}</div></div>
            </div>

            {/* Filtreler */}
            <div className="row gap-8 mb-16">
              {[["hepsi","Tümü"],["tamamlanan","✅ Tamamlanan"],["devam","⏳ Devam Eden"],["baslamamis","🚫 Başlamamış"]].map(([k,l]) => (
                <button key={k} onClick={() => setOnboardingFiltre(k)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (onboardingFiltre === k ? "#1f6f4a" : "var(--border)"), cursor: "pointer", background: onboardingFiltre === k ? "rgba(31,111,74,.08)" : "var(--bg)", color: onboardingFiltre === k ? "#1f6f4a" : "var(--dim)", fontWeight: 600, fontSize: 12 }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={onboardingYukle} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄 Yenile</button>
            </div>

            {/* İşletme Listesi */}
            {filtrelenmis.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                
                <p style={{ fontSize: 13 }}>Bu filtreye uygun işletme yok</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {filtrelenmis.map(i => {
                  const yuzdeRenk = i.tamamYuzde === 100 ? "#1f6f4a" : i.tamamYuzde >= 60 ? "#a8590c" : i.tamamYuzde >= 20 ? "#2f56c6" : "#b42318";
                  return (
                    <div key={i.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", border: `1px solid ${yuzdeRenk}20` }}>
                      <div className="row row-between mb-10" style={{ alignItems: "center" }}>
                        <div className="row gap-10" style={{ alignItems: "center" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 10, background: `${yuzdeRenk}12`, display: "flex", alignItems: "center", justifyContent: "center", color: yuzdeRenk, fontWeight: 600, fontSize: 15 }}>{(i.isim || "?")[0]}</div>
                          <div>
                            <div className="row gap-6" style={{ alignItems: "center" }}>
                              <span onClick={() => isletmeDetayYukle(i.id)} style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", cursor: "pointer" }}>{i.isim}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: `${yuzdeRenk}12`, color: yuzdeRenk, fontSize: 10, fontWeight: 600 }}>%{i.tamamYuzde}</span>
                              <span style={{ fontSize: 10, color: "var(--dim)" }}>{i.kategori} · {i.paket}</span>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>Kayıt: {i.olusturma_tarihi ? new Date(i.olusturma_tarihi).toLocaleDateString("tr-TR") : "—"}</div>
                          </div>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 20, color: yuzdeRenk }}>{i.tamamlananAdim}/{i.toplamAdim}</div>
                      </div>
                      {/* Progress Bar */}
                      <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, marginBottom: 10 }}>
                        <div style={{ height: "100%", width: `${i.tamamYuzde}%`, background: yuzdeRenk, borderRadius: 3, transition: "width .3s" }} />
                      </div>
                      {/* Adımlar */}
                      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                        {i.adimlar.map((a, idx) => (
                          <div key={idx} style={{ padding: "4px 10px", borderRadius: 8, background: a.tamamlandi ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.06)", color: a.tamamlandi ? "#1f6f4a" : "#b42318", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                            <span>{a.tamamlandi ? "✅" : "⬜"}</span>
                            <span>{a.isim}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
          );
        })()}

        {/* ═══════ SEGMENTASYON ═══════ */}
        {sayfa === "segmentasyon" && (() => {
          const seg = segmentData?.segmentler || {};
          const liste = segmentData?.isletmeler || [];
          const segInfo = {
            vip: { icon: "👑", label: "VIP", renk: "#a8590c", aciklama: "Yüksek gelir + aktif kullanım" },
            aktif: { icon: "🟢", label: "Aktif", renk: "#1f6f4a", aciklama: "Düzenli randevu alıyor" },
            risk: { icon: "⚠️", label: "Risk", renk: "#b42318", aciklama: "14-45 gündür pasif" },
            uyuyan: { icon: "😴", label: "Uyuyan", renk: "#6f6a62", aciklama: "45+ gün pasif veya hiç kullanmamış" },
            yeni: { icon: "🆕", label: "Yeni", renk: "#2f56c6", aciklama: "Son 14 gün içinde kayıt olmuş" },
          };
          const filtrelenmis = segmentFiltre === "hepsi" ? liste : liste.filter(i => i.segment === segmentFiltre);
          return (
          <>
            <div className="page-header">
              <h1>Müşteri Segmentasyonu</h1>
              <p>İşletmeleri davranış ve gelir bazlı segmentlere ayırarak analiz et</p>
            </div>

            {/* Segment Kartları */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
              {Object.entries(segInfo).map(([key, inf]) => {
                const s = seg[key] || { sayi: 0, gelir: 0 };
                return (
                  <div key={key} onClick={() => setSegmentFiltre(segmentFiltre === key ? "hepsi" : key)} style={{ background: segmentFiltre === key ? `${inf.renk}12` : "var(--surface)", borderRadius: 14, padding: "16px", border: `1px solid ${segmentFiltre === key ? inf.renk : "var(--border)"}`, cursor: "pointer", transition: "all .15s", textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 4 }}>{inf.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 22, color: inf.renk }}>{s.sayi}</div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text)", marginBottom: 2 }}>{inf.label}</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>₺{(s.gelir || 0).toLocaleString("tr-TR")}</div>
                  </div>
                );
              })}
            </div>

            {/* Filtre Bar */}
            <div className="row gap-8 mb-16">
              {[["hepsi", "Tümü"], ...Object.entries(segInfo).map(([k, v]) => [k, `${v.icon} ${v.label}`])].map(([k, l]) => (
                <button key={k} onClick={() => setSegmentFiltre(k)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (segmentFiltre === k ? (segInfo[k]?.renk || "#1f6f4a") : "var(--border)"), cursor: "pointer", background: segmentFiltre === k ? `${segInfo[k]?.renk || "#1f6f4a"}12` : "var(--bg)", color: segmentFiltre === k ? (segInfo[k]?.renk || "#1f6f4a") : "var(--dim)", fontWeight: 600, fontSize: 12 }}>{l}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={segmentasyonYukle} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄</button>
            </div>

            {/* İşletme Listesi */}
            {filtrelenmis.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                
                <p style={{ fontSize: 13 }}>Bu segmentte işletme yok</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtrelenmis.map(i => {
                  const inf = segInfo[i.segment] || segInfo.uyuyan;
                  return (
                    <div key={i.id} style={{ background: "var(--surface)", borderRadius: 12, padding: "12px 16px", border: `1px solid ${inf.renk}20`, display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 9, background: `${inf.renk}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{inf.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row gap-6" style={{ alignItems: "center" }}>
                          <span onClick={() => isletmeDetayYukle(i.id)} style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", cursor: "pointer" }}>{i.isim}</span>
                          <span style={{ padding: "1px 6px", borderRadius: 5, background: `${inf.renk}12`, color: inf.renk, fontSize: 10, fontWeight: 600 }}>{inf.label}</span>
                          <span style={{ fontSize: 10, color: "var(--dim)" }}>{i.kategori} · {i.paket}</span>
                        </div>
                        <div className="row gap-10" style={{ marginTop: 3, fontSize: 11, color: "var(--dim)" }}>
                          <span>📅 {parseInt(i.randevu_sayisi) || 0} randevu</span>
                          <span>👥 {parseInt(i.musteri_sayisi) || 0} müşteri</span>
                          <span>💰 ₺{(i.toplam_gelir || 0).toLocaleString("tr-TR")}</span>
                          <span>{i.gun_farki < 999 ? `Son randevu: ${i.gun_farki} gün önce` : "Hiç randevu yok"}</span>
                          <span>{i.bot_bagli ? "✅ Bot" : "❌ Bot"}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 16, color: inf.renk }}>₺{(i.toplam_gelir || 0).toLocaleString("tr-TR")}</div>
                        <div style={{ fontSize: 10, color: "var(--dim)" }}>{parseInt(i.odeme_sayisi) || 0} ödeme</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
          );
        })()}

        {/* ═══════ KARŞILAŞTIRMA RAPORU ═══════ */}
        {sayfa === "karsilastirma" && (() => {
          const ort = karsilastirmaData?.ortalamalar || {};
          const liste = karsilastirmaData?.isletmeler || [];
          const kat = karsilastirmaData?.kategoriler || {};
          const sirali = [...liste].sort((a, b) => (b[karsilastirmaSiralama] || 0) - (a[karsilastirmaSiralama] || 0));
          const siralamaSecenekleri = [
            { key: "toplam_gelir", label: "💰 Gelir" },
            { key: "randevu_sayisi", label: "📅 Toplam Randevu" },
            { key: "aylik_randevu", label: "📊 Aylık Randevu" },
            { key: "musteri_sayisi", label: "👥 Müşteri" },
            { key: "tamamlanma_orani", label: "✅ Tamamlanma %" },
          ];
          return (
          <>
            <div className="page-header">
              <h1>İşletme Karşılaştırma Raporu</h1>
              <p>Tüm işletmeleri performans metriklerine göre karşılaştır</p>
            </div>

            {/* Ortalama Kartları */}
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{"--card-accent":"#1f6f4a"}}><div className="sc-icon">💰</div><div className="sc-label">Ort. Gelir</div><div className="sc-val">₺{(ort.gelir || 0).toLocaleString("tr-TR")}</div></div>
              <div className="stat-card blue"><div className="sc-icon">📅</div><div className="sc-label">Ort. Randevu</div><div className="sc-val">{ort.randevu || 0}</div></div>
              <div className="stat-card amber"><div className="sc-icon">📊</div><div className="sc-label">Ort. Aylık Randevu</div><div className="sc-val">{ort.aylikRandevu || 0}</div></div>
              <div className="stat-card" style={{"--card-accent":"#5d4bb5"}}><div className="sc-icon">👥</div><div className="sc-label">Ort. Müşteri</div><div className="sc-val">{ort.musteri || 0}</div></div>
            </div>

            {/* Kategori Özeti */}
            {Object.keys(kat).length > 0 && (
              <div style={{ marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(kat).sort((a, b) => b[1].sayi - a[1].sayi).map(([k, v]) => (
                  <div key={k} style={{ padding: "8px 14px", borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", fontSize: 11 }}>
                    <span style={{ fontWeight: 600, color: "var(--text)" }}>{k}</span>
                    <span style={{ color: "var(--dim)", marginLeft: 6 }}>{v.sayi} iş. · ₺{Math.round(v.gelir / v.sayi).toLocaleString("tr-TR")} ort. · {Math.round(v.randevu / v.sayi)} ort.rnv</span>
                  </div>
                ))}
              </div>
            )}

            {/* Sıralama */}
            <div className="row gap-8 mb-16">
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--dim)" }}>Sırala:</span>
              {siralamaSecenekleri.map(s => (
                <button key={s.key} onClick={() => setKarsilastirmaSiralama(s.key)} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid " + (karsilastirmaSiralama === s.key ? "#2f56c6" : "var(--border)"), cursor: "pointer", background: karsilastirmaSiralama === s.key ? "rgba(47,86,198,.08)" : "var(--bg)", color: karsilastirmaSiralama === s.key ? "#2f56c6" : "var(--dim)", fontWeight: 600, fontSize: 11 }}>{s.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={karsilastirmaYukle} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 11 }}>🔄</button>
            </div>

            {/* Tablo */}
            {sirali.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--dim)", padding: 40, fontSize: 13 }}>Veri yükleniyor...</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px" }}>
                  <thead>
                    <tr style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".5px" }}>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>#</th>
                      <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600 }}>İşletme</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Gelir</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Randevu</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Aylık</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Müşteri</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Hizmet</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Bot</th>
                      <th style={{ textAlign: "center", padding: "6px 10px", fontWeight: 600 }}>Tam.%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sirali.map((i, idx) => {
                      const ortUstu = i[karsilastirmaSiralama] > (ort[{toplam_gelir:"gelir",randevu_sayisi:"randevu",aylik_randevu:"aylikRandevu",musteri_sayisi:"musteri",tamamlanma_orani:"tamamlanma"}[karsilastirmaSiralama]] || 0);
                      return (
                        <tr key={i.id} style={{ background: idx < 3 ? "rgba(31,111,74,.03)" : "var(--surface)" }}>
                          <td style={{ padding: "8px 10px", borderRadius: "8px 0 0 8px", fontWeight: 600, fontSize: 12, color: idx < 3 ? "#a8590c" : "var(--dim)" }}>{idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : idx + 1}</td>
                          <td style={{ padding: "8px 10px" }}>
                            <span onClick={() => isletmeDetayYukle(i.id)} style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", cursor: "pointer" }}>{i.isim}</span>
                            <div style={{ fontSize: 10, color: "var(--dim)" }}>{i.kategori} · {i.paket} · {i.kayit_gun}g</div>
                          </td>
                          <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: i.toplam_gelir > ort.gelir ? "#1f6f4a" : "var(--text)", padding: "8px 10px" }}>₺{i.toplam_gelir.toLocaleString("tr-TR")}</td>
                          <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: "var(--text)", padding: "8px 10px" }}>{i.randevu_sayisi}</td>
                          <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: i.aylik_randevu > ort.aylikRandevu ? "#1f6f4a" : "var(--text)", padding: "8px 10px" }}>{i.aylik_randevu}</td>
                          <td style={{ textAlign: "center", fontWeight: 600, fontSize: 13, color: "var(--text)", padding: "8px 10px" }}>{i.musteri_sayisi}</td>
                          <td style={{ textAlign: "center", fontSize: 12, color: "var(--dim)", padding: "8px 10px" }}>{i.hizmet_sayisi}h/{i.calisan_sayisi}ç</td>
                          <td style={{ textAlign: "center", padding: "8px 10px" }}>
                            <span style={{ color: i.bot_bagli ? "#1f6f4a" : "#b42318", fontSize: 12 }}>{i.bot_bagli ? "✅" : "❌"}</span>
                          </td>
                          <td style={{ textAlign: "center", padding: "8px 10px", borderRadius: "0 8px 8px 0" }}>
                            <span style={{ padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: i.tamamlanma_orani > 70 ? "rgba(31,111,74,.08)" : i.tamamlanma_orani > 40 ? "rgba(168,89,12,.08)" : "rgba(180,35,24,.08)", color: i.tamamlanma_orani > 70 ? "#1f6f4a" : i.tamamlanma_orani > 40 ? "#a8590c" : "#b42318" }}>%{i.tamamlanma_orani}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
          );
        })()}

        {/* ═══════ MÜŞTERİ CRM ═══════ */}
        {sayfa === "musteriCRM" && (() => {
          const segInfo = {
            sadik: { icon: "💎", label: "Sadık", renk: "#a8590c" },
            aktif: { icon: "🟢", label: "Aktif", renk: "#1f6f4a" },
            risk: { icon: "⚠️", label: "Risk", renk: "#b42318" },
            kayip: { icon: "💀", label: "Kayıp", renk: "#6f6a62" },
            yeni: { icon: "🆕", label: "Yeni", renk: "#2f56c6" },
          };
          const seg = crmData?.segmentler || {};
          const liste = crmData?.musteriler || [];
          return (
          <>
            <div className="page-header">
              <h1>Müşteri CRM</h1>
              <p>Tüm işletmelerin müşterilerini analiz et, segmentlere ayır ve detaylı bilgi gör</p>
            </div>

            {/* Segment Kartları */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
              {Object.entries(segInfo).map(([key, inf]) => (
                <div key={key} onClick={() => { setCrmSegmentFiltre(crmSegmentFiltre === key ? "hepsi" : key); crmYukle(undefined, undefined, crmSegmentFiltre === key ? "hepsi" : key); }} style={{ background: crmSegmentFiltre === key ? `${inf.renk}12` : "var(--surface)", borderRadius: 12, padding: "12px 16px", border: `1px solid ${crmSegmentFiltre === key ? inf.renk : "var(--border)"}`, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ fontSize: 22 }}>{inf.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: 20, color: inf.renk }}>{seg[key] || 0}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--dim)" }}>{inf.label}</div>
                </div>
              ))}
            </div>

            {/* Filtreler */}
            <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
              <input value={crmArama} onChange={e => setCrmArama(e.target.value)} onKeyDown={e => e.key === "Enter" && crmYukle()} placeholder="🔍 İsim veya telefon ara..." style={{ flex: 1, padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }} />
              <select value={crmIsletmeFiltre} onChange={e => { setCrmIsletmeFiltre(e.target.value); crmYukle(undefined, e.target.value); }} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12 }}>
                <option value="">Tüm İşletmeler</option>
                {(isletmeler || []).map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
              </select>
              <button onClick={() => crmYukle()} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔍 Ara</button>
            </div>

            <div style={{ fontSize: 11, color: "var(--dim)", marginBottom: 8 }}>{crmData?.toplam || 0} toplam · {liste.length} gösteriliyor</div>

            {/* Müşteri Listesi */}
            {liste.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                
                <p style={{ fontSize: 13 }}>Müşteri bulunamadı</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {liste.map(m => {
                  const inf = segInfo[m.segment] || segInfo.yeni;
                  return (
                    <div key={m.id} onClick={() => crmDetayYukle(m.id)} style={{ background: "var(--surface)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${inf.renk}15`, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .1s" }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: `${inf.renk}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{inf.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row gap-6" style={{ alignItems: "center" }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{m.isim || "İsimsiz"}</span>
                          <span style={{ padding: "1px 6px", borderRadius: 5, background: `${inf.renk}12`, color: inf.renk, fontSize: 9, fontWeight: 600 }}>{inf.label}</span>
                          <span style={{ fontSize: 10, color: "var(--dim)" }}>{m.isletme_isim}</span>
                        </div>
                        <div className="row gap-10" style={{ marginTop: 2, fontSize: 10, color: "var(--dim)" }}>
                          <span>📱 {m.telefon}</span>
                          <span>📅 {m.randevu_sayisi} randevu</span>
                          <span>✅ {m.tamamlanan_randevu} tam.</span>
                          <span>❌ {m.iptal_randevu} iptal</span>
                          {m.puan > 0 && <span>⭐ {m.puan} puan</span>}
                          <span>{m.gun_farki < 999 ? `Son: ${m.gun_farki}g önce` : "Hiç randevu yok"}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>›</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Müşteri Detay Modal */}
            {crmDetay && (
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }} onClick={() => setCrmDetay(null)}>
                <div onClick={e => e.stopPropagation()} style={{ background: "var(--surface)", borderRadius: 20, padding: "28px", maxWidth: 560, width: "90%", maxHeight: "80vh", overflow: "auto", border: "1px solid var(--border)" }}>
                  <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                    <div>
                      <h3 style={{ margin: 0, fontWeight: 600, fontSize: 18, color: "var(--text)" }}>{crmDetay.musteri?.isim || "İsimsiz"}</h3>
                      <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{crmDetay.musteri?.telefon} · {crmDetay.musteri?.isletme_isim}</div>
                    </div>
                    <button onClick={() => setCrmDetay(null)} style={{ width: 32, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--dim)" }}>✕</button>
                  </div>

                  {/* Bilgiler */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                    <div style={{ padding: "10px", borderRadius: 10, background: "var(--bg)", textAlign: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 18, color: "#1f6f4a" }}>{crmDetay.musteri?.puan || 0}</div>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Puan</div>
                    </div>
                    <div style={{ padding: "10px", borderRadius: 10, background: "var(--bg)", textAlign: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 18, color: "#2f56c6" }}>{crmDetay.randevular?.length || 0}</div>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Randevu</div>
                    </div>
                    <div style={{ padding: "10px", borderRadius: 10, background: "var(--bg)", textAlign: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: 18, color: "#a8590c" }}>{crmDetay.musteri?.referans_kodu || "—"}</div>
                      <div style={{ fontSize: 10, color: "var(--dim)" }}>Ref. Kodu</div>
                    </div>
                  </div>

                  {crmDetay.musteri?.notlar && (
                    <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(47,86,198,.04)", border: "1px solid rgba(47,86,198,.1)", marginBottom: 16, fontSize: 12, color: "var(--text)" }}>
                      📝 {crmDetay.musteri.notlar}
                    </div>
                  )}

                  {/* Randevu Geçmişi */}
                  <h4 style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", margin: "0 0 8px" }}>Randevu Geçmişi</h4>
                  {(crmDetay.randevular || []).length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--dim)" }}>Henüz randevu yok</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {crmDetay.randevular.map((r, idx) => {
                        const durumRenk = { tamamlandi: "#1f6f4a", bekliyor: "#a8590c", onay_bekliyor: "#a8590c", onaylandi: "#2f56c6", iptal: "#b42318", gelmedi: "#6b7280" };
                        return (
                          <div key={idx} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--bg)", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ width: 6, height: 6, borderRadius: 3, background: durumRenk[r.durum] || "var(--dim)", flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "var(--text)" }}>{r.tarih ? new Date(r.tarih).toLocaleDateString("tr-TR") : "?"}</span>
                            <span style={{ color: "var(--dim)" }}>{r.saat}</span>
                            <span style={{ color: "var(--text)" }}>{r.hizmet || "?"}</span>
                            <span style={{ color: "var(--dim)" }}>{r.calisan || ""}</span>
                            <div style={{ flex: 1 }} />
                            <span style={{ padding: "1px 6px", borderRadius: 4, background: `${durumRenk[r.durum] || "#6f6a62"}12`, color: durumRenk[r.durum] || "#6f6a62", fontSize: 10, fontWeight: 600 }}>{r.durum}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
          );
        })()}

        {/* ═══════ QR KOD ═══════ */}
        {sayfa === "qrKod" && (
          <>
            <div className="page-header">
              <h1>QR Kod Oluşturucu</h1>
              <p>İşletmeler için WhatsApp veya Online Randevu QR kodu oluştur</p>
            </div>

            <div className="grid-2">
              {/* Sol: Form */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 16px" }}>QR Kod Ayarları</h3>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 6, display: "block" }}>İşletme Seç</label>
                  <select value={qrIsletmeId} onChange={e => { setQrIsletmeId(e.target.value); setQrData(null); }} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13 }}>
                    <option value="">— İşletme seçin —</option>
                    {(isletmeler || []).map(i => <option key={i.id} value={i.id}>{i.isim} ({i.kategori})</option>)}
                  </select>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", marginBottom: 6, display: "block" }}>QR Tipi</label>
                  <div className="row gap-8">
                    {[["whatsapp", "💬 WhatsApp"], ["booking", "📅 Online Randevu"]].map(([k, l]) => (
                      <button key={k} onClick={() => { setQrType(k); setQrData(null); }} style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1px solid " + (qrType === k ? (k === "whatsapp" ? "#1f6f4a" : "#2f56c6") : "var(--border)"), cursor: "pointer", background: qrType === k ? (k === "whatsapp" ? "rgba(31,111,74,.08)" : "rgba(47,86,198,.08)") : "var(--bg)", color: qrType === k ? (k === "whatsapp" ? "#1f6f4a" : "#2f56c6") : "var(--dim)", fontWeight: 600, fontSize: 13 }}>{l}</button>
                    ))}
                  </div>
                </div>

                <button onClick={qrKodOlustur} disabled={!qrIsletmeId || qrYukleniyor} style={{ width: "100%", padding: "12px", borderRadius: 12, border: "none", cursor: qrIsletmeId ? "pointer" : "default", background: qrIsletmeId ? "#1f6f4a" : "#64748b40", color: qrIsletmeId ? "#fff" : "var(--dim)", fontWeight: 600, fontSize: 14 }}>
                  {qrYukleniyor ? "Oluşturuluyor..." : "🔄 QR Kod Oluştur"}
                </button>

                <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 10, background: "rgba(47,86,198,.04)", border: "1px solid rgba(47,86,198,.1)" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#2f56c6", marginBottom: 4 }}>💡 Kullanım</div>
                  <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.6 }}>
                    • <strong>WhatsApp:</strong> Müşteri QR okutarak doğrudan WhatsApp'tan mesaj atar<br/>
                    • <strong>Online Randevu:</strong> Müşteri QR okutarak web'den randevu alır<br/>
                    • QR kodu indirip kartvizit, tezgah veya vitrine yapıştırabilirsiniz
                  </div>
                </div>
              </div>

              {/* Sağ: QR Gösterim */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                {qrData ? (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 4 }}>{qrData.isletmeIsim}</div>
                    <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16 }}>{qrData.type === "whatsapp" ? "💬 WhatsApp QR" : "📅 Online Randevu QR"}</div>
                    <img src={qrData.qr} alt="QR Kod" style={{ width: 280, height: 280, borderRadius: 16, border: "3px solid var(--border)" }} />
                    <div style={{ marginTop: 12, fontSize: 11, color: "var(--dim)", textAlign: "center", wordBreak: "break-all", maxWidth: 300 }}>{qrData.hedefUrl}</div>
                    <div className="row gap-8" style={{ marginTop: 16 }}>
                      <a href={qrData.qr} download={`qr-${qrData.isletmeIsim}-${qrData.type}.png`} style={{ padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>📥 İndir</a>
                      <button onClick={() => { navigator.clipboard.writeText(qrData.hedefUrl); alert("Link kopyalandı!"); }} style={{ padding: "8px 20px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--text)", fontWeight: 600, fontSize: 12 }}>📋 Linki Kopyala</button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", color: "var(--dim)" }}>
                    
                    <p style={{ fontSize: 13 }}>İşletme seçip QR oluşturun</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════ API DASHBOARD ═══════ */}
        {sayfa === "apiDash" && (() => {
          const d = apiDashData || {};
          const ts = d.tabloSayilari || {};
          const mem = d.memory || {};
          const s24 = d.son24Saat || {};
          const trend = d.gunlukTrend || [];
          const maxTrend = Math.max(...trend.map(t => t.sayi), 1);
          return (
          <>
            <div className="page-header">
              <h1>API & Sistem Dashboard</h1>
              <p>Sunucu durumu, veritabanı istatistikleri ve sistem sağlığı</p>
            </div>

            {/* Sistem Kartları */}
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card" style={{"--card-accent":"#1f6f4a"}}><div className="sc-icon">⏱️</div><div className="sc-label">Uptime</div><div className="sc-val" style={{ fontSize: 16 }}>{d.uptime || "—"}</div></div>
              <div className="stat-card blue"><div className="sc-icon">💾</div><div className="sc-label">DB Boyut</div><div className="sc-val" style={{ fontSize: 16 }}>{d.dbBoyut || "—"}</div></div>
              <div className="stat-card amber"><div className="sc-icon">🔗</div><div className="sc-label">Aktif Bağlantı</div><div className="sc-val">{d.aktiveBaglanti || 0}</div></div>
              <div className="stat-card" style={{"--card-accent":"#5d4bb5"}}><div className="sc-icon">🧠</div><div className="sc-label">Heap Kullanım</div><div className="sc-val" style={{ fontSize: 16 }}>{mem.heapUsed || 0}/{mem.heapTotal || 0} MB</div></div>
            </div>

            {/* Son 24 Saat + Node Bilgisi */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Son 24 Saat</div>
                <div className="row gap-16">
                  <div><div style={{ fontWeight: 600, fontSize: 24, color: "#1f6f4a" }}>{s24.randevu || 0}</div><div style={{ fontSize: 11, color: "var(--dim)" }}>Randevu</div></div>
                  <div><div style={{ fontWeight: 600, fontSize: 24, color: "#2f56c6" }}>{s24.odeme || 0}</div><div style={{ fontSize: 11, color: "var(--dim)" }}>Ödeme</div></div>
                </div>
              </div>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600, marginBottom: 6 }}>Runtime</div>
                <div style={{ fontSize: 13, color: "var(--text)", lineHeight: 1.8 }}>
                  <div>Node: <strong>{d.nodeVersion || "?"}</strong></div>
                  <div>Platform: <strong>{d.platform || "?"}</strong></div>
                  <div>RSS: <strong>{mem.rss || 0} MB</strong></div>
                </div>
              </div>
              <div style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", border: "1px solid var(--border)" }}>
                <div style={{ fontSize: 12, color: "var(--dim)", fontWeight: 600, marginBottom: 8 }}>7 Gün Randevu Trendi</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 50 }}>
                  {trend.map((t, i) => (
                    <div key={i} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ height: Math.max(4, (t.sayi / maxTrend) * 40), background: "#1f6f4a", borderRadius: 3, marginBottom: 2 }} />
                      <div style={{ fontSize: 8, color: "var(--dim)" }}>{t.gun}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Veritabanı Tabloları */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 24px", border: "1px solid var(--border)", marginBottom: 16 }}>
              <div className="row row-between mb-12" style={{ alignItems: "center" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: 0 }}>Veritabanı Tabloları</h3>
                <button onClick={apiDashYukle} style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 11 }}>🔄</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                {Object.entries(ts).map(([tablo, sayi]) => {
                  const ikonlar = { isletmeler: "🏢", randevular: "📅", musteriler: "👥", hizmetler: "💇", calisanlar: "👤", odemeler: "💰", sohbet_gecmisi: "💬", destek_talepleri: "🎫" };
                  return (
                    <div key={tablo} style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>{ikonlar[tablo] || "📋"}</span>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>{sayi.toLocaleString("tr-TR")}</div>
                        <div style={{ fontSize: 10, color: "var(--dim)" }}>{tablo}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bot Durumları */}
            {(d.botDurumlari || []).length > 0 && (
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "20px 24px", border: "1px solid var(--border)" }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: "0 0 12px" }}>WhatsApp Bot Durumları</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {d.botDurumlari.map((b, i) => {
                    const renk = b.durum === 'bagli' ? "#1f6f4a" : b.durum === 'bekliyor' ? "#a8590c" : "#b42318";
                    return (
                      <div key={i} style={{ padding: "8px 12px", borderRadius: 8, background: "var(--bg)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 4, background: renk, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text)" }}>İşletme #{b.isletme_id}</span>
                        <span style={{ padding: "1px 8px", borderRadius: 5, background: `${renk}12`, color: renk, fontSize: 10, fontWeight: 600 }}>{b.durum}</span>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: "var(--dim)" }}>{b.son_aktivite ? new Date(b.son_aktivite).toLocaleString("tr-TR") : "—"}</span>
                      </div>
                    );
                  })}
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
              <h1>Referans (Affiliate) Sistemi</h1>
              <p>İşletmelere referans kodu ver — müşteri getirene bedava süre tanımla</p>
            </div>

            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card green"><div className="sc-icon">🔗</div><div className="sc-label">Toplam Referans</div><div className="sc-val">{referanslar.length}</div></div>
              <div className="stat-card blue"><div className="sc-icon">👥</div><div className="sc-label">Toplam Davet</div><div className="sc-val">{toplamDavet}</div></div>
              <div className="stat-card amber"><div className="sc-icon">🎁</div><div className="sc-label">Verilen Bedava Hak</div><div className="sc-val">{toplamKazanilan}</div></div>
            </div>

            {/* Yeni Referans Oluştur */}
            <div style={{ background: "var(--surface)", borderRadius: 14, padding: 20, marginBottom: 16, border: "1px solid rgba(31,111,74,.15)" }}>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#1f6f4a", marginBottom: 14 }}>➕ Yeni Referans Kodu Oluştur</div>
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
                  <select id="refBedavaGun" defaultValue="30" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
                    {gunSecenekleri.map(g => <option key={g.gun} value={g.gun}>{g.label} ({g.gun} gün)</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", display: "block", marginBottom: 4 }}>Kaç Davet Gerekli</label>
                  <select id="refMinDavet" defaultValue="1" style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
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
                  }} style={{ width: "100%", padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#1f6f4a", color: "#fff", fontWeight: 600, fontSize: 13 }}>🔗 Oluştur</button>
                </div>
              </div>
            </div>

            {/* Referans Listesi */}
            {referanslar.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}>
                
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
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1f6f4a", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 15, flexShrink: 0 }}>{(r.isletme_isim || "?")[0]}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{r.isletme_isim}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontWeight: 600, fontSize: 11, fontFamily: "monospace", letterSpacing: .5 }}>{r.referans_kodu}</span>
                          </div>
                          <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--dim)", flexWrap: "wrap" }}>
                            <span>👥 {r.toplam_davet || 0} davet</span>
                            <span>🎯 {minD} davet → {gunLabel(bedG)} bedava</span>
                            <span>🎁 {r.kazanilan_ay || 0} kez kazanıldı</span>
                          </div>
                          {/* Progress bar */}
                          <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 4, background: "var(--bg)", borderRadius: 2, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${progress}%`, background: "#1f6f4a", borderRadius: 2, transition: "width .3s" }} />
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
                            }} style={{ width: 80, padding: "4px 6px", fontSize: 11, fontWeight: 600, color: "#a8590c", background: "rgba(168,89,12,.06)", border: "1px solid rgba(168,89,12,.15)", borderRadius: 6, cursor: "pointer" }}>
                              {gunSecenekleri.map(g => <option key={g.gun} value={g.gun}>{g.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", marginBottom: 2, textAlign: "center" }}>Min Davet</div>
                            <select value={minD} onChange={async (e) => {
                              await api.put(`/admin/referanslar/${r.id}/bedava-ay`, { min_davet: parseInt(e.target.value) });
                              referanslariYukle();
                            }} style={{ width: 60, padding: "4px 6px", fontSize: 11, fontWeight: 600, color: "#2f56c6", background: "rgba(47,86,198,.06)", border: "1px solid rgba(47,86,198,.15)", borderRadius: 6, cursor: "pointer" }}>
                              {[1,2,3,5,10].map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                          </div>
                          <button onClick={async () => {
                            if (!confirm(`"${r.isletme_isim}" — "${r.referans_kodu}" kodunu silmek istediğinize emin misiniz?`)) return;
                            await api.del(`/admin/referanslar/${r.id}`);
                            referanslariYukle();
                          }} title="Sil" style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(180,35,24,.06)", color: "#b42318", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>🗑️</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Bilgi Kartı */}
            <div style={{ marginTop: 16, background: "rgba(47,86,198,.04)", borderRadius: 12, padding: "14px 18px", border: "1px solid rgba(47,86,198,.1)" }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#2f56c6", marginBottom: 6 }}>💡 Referans Nasıl Çalışır?</div>
              <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.8 }}>
                <strong style={{ color: "var(--text)" }}>1.</strong> İşletmeye referans kodu oluşturursun (ör: REF-ABC123)<br/>
                <strong style={{ color: "var(--text)" }}>2.</strong> İşletme bu kodu tanıdığı esnafa paylaşır<br/>
                <strong style={{ color: "var(--text)" }}>3.</strong> Yeni esnaf <strong style={{ color: "#1f6f4a" }}>satış botu üzerinden kayıt olurken referans kodunu girer</strong><br/>
                <strong style={{ color: "var(--text)" }}>4.</strong> Belirlediğin sayıda davet tamamlanınca → işletmeye otomatik bedava süre eklenir<br/>
                <strong style={{ color: "var(--text)" }}>5.</strong> Süre ve min davet sayısını her referans için ayrı ayrı değiştirebilirsin<br/>
                <div style={{ marginTop: 8, padding: "8px 12px", background: "rgba(168,89,12,.06)", borderRadius: 8, border: "1px solid rgba(168,89,12,.12)" }}>
                  <strong style={{ color: "#a8590c" }}>Örnek:</strong> <span style={{ color: "var(--text)" }}>3 davet → 1 ay bedava</span> — İşletme 3 yeni müşteri getirirse 30 gün bedava kazanır. 6 getirirse 60 gün. Her 3'te bir ödül!
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
              <h1>Duyurular</h1>
              <p>Tek tuşla tüm müşterilerin dashboard'una bildirim çak</p>
            </div>
            <button onClick={() => setDuyuruFormAcik(!duyuruFormAcik)} className="btn btn-sm mb-16" style={{ background: "var(--amber)", color: "#000", fontWeight: 600 }}>+ Yeni Duyuru</button>

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
                      <option value="kurumsal">Sadece Kurumsal</option>
                      <option value="profesyonel">Profesyonel+</option>
                    </select>
                  </div>
                </div>
                <div className="mt-12"><label className="form-label">Mesaj</label><textarea value={yeniDuyuru.mesaj} onChange={e => setYeniDuyuru({...yeniDuyuru, mesaj: e.target.value})} placeholder="Duyuru içeriğini yazın..." className="input" rows={3} required /></div>
                <div className="form-actions mt-12">
                  <button type="submit" className="btn" style={{ background: "var(--amber)", color: "#000", fontWeight: 600 }}>Yayınla 🚀</button>
                  <button type="button" onClick={() => setDuyuruFormAcik(false)} className="btn btn-ghost">İptal</button>
                </div>
              </form>
            )}

            {duyurular.length === 0 ? (
              <div className="list-empty"><p>Henüz duyuru yok.</p></div>
            ) : duyurular.map(d => {
              const tipRenk = { bilgi: "#2f56c6", guncelleme: "#1f6f4a", bakim: "#a8590c", uyari: "#b42318" };
              const tipIcon = { bilgi: "ℹ️", guncelleme: "🆕", bakim: "🔧", uyari: "⚠️" };
              return (
                <div key={d.id} className="list-item" style={{ flexDirection: "column", gap: 8, opacity: d.aktif ? 1 : 0.5 }}>
                  <div className="row row-between row-wrap gap-8">
                    <div className="row row-wrap gap-8">
                      <span style={{ fontSize: 16 }}>{tipIcon[d.tip] || "📢"}</span>
                      <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 15 }}>{d.baslik}</span>
                      <span className="tag" style={{ background: (tipRenk[d.tip]||"#6f6a62") + "22", color: tipRenk[d.tip]||"#6f6a62", fontWeight: 600, fontSize: 11 }}>{d.tip}</span>
                      <span style={{ color: "var(--dim)", fontSize: 11 }}>Hedef: {d.hedef}</span>
                    </div>
                    <div className="row gap-6">
                      <button onClick={async () => { await api.put(`/admin/duyurular/${d.id}`, { ...d, aktif: !d.aktif }); duyurulariYukle(); }}
                        className="btn btn-sm" style={{ background: d.aktif ? "rgba(180,35,24,.12)" : "rgba(31,111,74,.12)", color: d.aktif ? "#b42318" : "#1f6f4a", border: "none", fontWeight: 600, fontSize: 11 }}>
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
              <h1>Müşteri Aktivite Haritası</h1>
              <button onClick={aktiviteYukle} className="btn btn-sm" style={{ background: "rgba(47,86,198,.12)", color: "#2f56c6" }}>🔄 Yenile</button>
            </div>

            {!aktiviteVeri || !aktiviteVeri.ozet ? (
              <div className="list-empty"><p>Yükleniyor...</p></div>
            ) : (
              <>
                {/* Özet Kartları */}
                <div className="row row-wrap gap-12 mb-24">
                  <StatCard icon="📈" baslik="Ort. Aktivite Skoru" deger={`%${aktiviteVeri.ozet?.ortSkor || 0}`} renk="#2f56c6" />
                  <StatCard icon="✅" baslik="Aktivitesi Yüksek" deger={aktiviteVeri.ozet?.aktifSayi || 0} renk="#1f6f4a" />
                  <StatCard icon="😴" baslik="Aktivitesi Düşük" deger={aktiviteVeri.ozet?.pasifSayi || 0} renk="#b42318" />
                  <StatCard icon="📅" baslik="Bu Ay Randevu" deger={aktiviteVeri.ozet?.toplamRandevu || 0} renk="#5d4bb5" />
                  <StatCard icon="👥" baslik="Toplam Müşteri" deger={aktiviteVeri.ozet?.toplamMusteri || 0} renk="#a8590c" />
                </div>

                {/* Filtre */}
                <div className="row gap-8 mb-16">
                  {[["hepsi","Tümü"],["aktif","Aktivitesi Yüksek (Skor>20)"],["pasif","Aktivitesi Düşük (Skor≤20)"],["odenmedi","Ödenmemiş"]].map(([k,l]) => (
                    <button key={k} onClick={() => setAktiviteFiltre(k)} className="btn btn-sm"
                      style={{ background: aktiviteFiltre === k ? "rgba(47,86,198,.15)" : "var(--bg)", color: aktiviteFiltre === k ? "#2f56c6" : "var(--muted)", fontWeight: aktiviteFiltre === k ? 700 : 500, border: "none" }}>{l}</button>
                  ))}
                </div>

                {/* İşletme Listesi */}
                {(aktiviteVeri.aktiviteler || [])
                  .filter(a => {
                    if (aktiviteFiltre === "aktif") return a.aktivite_skoru > 20;
                    if (aktiviteFiltre === "pasif") return a.aktivite_skoru <= 20;
                    if (aktiviteFiltre === "odenmedi") return a.odeme_durumu !== "odendi";
                    return true;
                  })
                  .map(a => {
                    const skorRenk = a.aktivite_skoru >= 60 ? "#1f6f4a" : a.aktivite_skoru >= 30 ? "#a8590c" : "#b42318";
                    const kategoriR = { berber: "#2f56c6", kuafor: "#5d4bb5", disci: "#1f6f4a", guzellik: "#a8590c", veteriner: "#b42318", diyetisyen: "#2f56c6" };
                    const odemeR = { odendi: "#1f6f4a", odenmedi: "#b42318", havale_bekliyor: "#5d4bb5", bekliyor: "#a8590c" };
                    return (
                      <div key={a.id} className="card mb-12" style={{ padding: "18px 20px" }}>
                        <div className="row row-between row-wrap gap-12 mb-10">
                          <div className="row gap-12" style={{ alignItems: "center" }}>
                            <div style={{
                              width: 44, height: 44, borderRadius: 12,
                              background: `${skorRenk}15`, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 18, fontWeight: 600, color: skorRenk, flexShrink: 0
                            }}>{a.aktivite_skoru}</div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{a.isim}</div>
                              <div className="row gap-6" style={{ marginTop: 3 }}>
                                <span className="tag-xs" style={{ background: `${kategoriR[a.kategori] || "#6f6a62"}15`, color: kategoriR[a.kategori] || "#6f6a62" }}>{a.kategori}</span>
                                <span className="tag-xs" style={{ background: `${odemeR[a.odeme_durumu] || "#b42318"}15`, color: odemeR[a.odeme_durumu] || "#b42318" }}>
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
                            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>
                              {a.bu_ay_randevu}
                              {a.randevu_buyume !== 0 && <span style={{ fontSize: 11, color: a.randevu_buyume > 0 ? "#1f6f4a" : "#b42318", marginLeft: 6 }}>{a.randevu_buyume > 0 ? "↑" : "↓"}{Math.abs(a.randevu_buyume)}%</span>}
                            </div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Toplam Müşteri</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{a.toplam_musteri}</div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Bot Mesajı</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{a.bot_mesaj}</div>
                          </div>
                          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginBottom: 2 }}>Hizmet / Çalışan</div>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>{a.hizmet_sayisi} / {a.calisan_sayisi}</div>
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
              <h1>Bildirim Merkezi</h1>
              <button onClick={bildirimleriYukle} className="btn btn-sm" style={{ background: "rgba(47,86,198,.12)", color: "#2f56c6" }}>🔄 Yenile</button>
            </div>

            {!bildirimVeri || !bildirimVeri.ozet ? (
              <div className="list-empty"><p>Yükleniyor...</p></div>
            ) : (
              <>
                {/* Özet Kartları */}
                <div className="row row-wrap gap-12 mb-24">
                  <StatCard icon="📬" baslik="Toplam" deger={bildirimVeri.ozet.toplam} renk="#2f56c6" />
                  <StatCard icon="🔴" baslik="Yüksek Öncelik" deger={bildirimVeri.ozet.yuksek} renk="#b42318" />
                  <StatCard icon="🟡" baslik="Orta Öncelik" deger={bildirimVeri.ozet.orta} renk="#a8590c" />
                  <StatCard icon="🟢" baslik="Düşük Öncelik" deger={bildirimVeri.ozet.dusuk} renk="#1f6f4a" />
                </div>

                {/* Filtre */}
                <div className="row gap-8 mb-16">
                  {[["hepsi","Tümü"],["yuksek","🔴 Yüksek"],["orta","🟡 Orta"],["dusuk","🟢 Düşük"]].map(([k,l]) => (
                    <button key={k} onClick={() => setBildirimFiltre(k)} className="btn btn-sm"
                      style={{ background: bildirimFiltre === k ? "rgba(47,86,198,.15)" : "var(--bg)", color: bildirimFiltre === k ? "#2f56c6" : "var(--muted)", fontWeight: bildirimFiltre === k ? 700 : 500, border: "none" }}>{l}</button>
                  ))}
                </div>

                {/* Bildirim Listesi */}
                {(bildirimVeri.bildirimler || []).length === 0 ? (
                  <div className="list-empty"><p>Bildirim yok, her şey yolunda! 🎉</p></div>
                ) : (bildirimVeri.bildirimler || [])
                  .filter(b => bildirimFiltre === "hepsi" || b.oncelik === bildirimFiltre)
                  .map((b, idx) => {
                    const oncelikRenk = { yuksek: "#b42318", orta: "#a8590c", dusuk: "#1f6f4a" };
                    const tipRenk = {
                      odeme_gecikme: "#b42318", deneme_bitiyor: "#a8590c", yeni_kayit: "#2f56c6",
                      havale_onay: "#5d4bb5", destek: "#5d4bb5", pasif_isletme: "#6f6a62"
                    };
                    return (
                      <div key={idx} className="list-item list-item-left" style={{
                        borderLeftColor: oncelikRenk[b.oncelik] || "#6f6a62", marginBottom: 8,
                        background: b.oncelik === "yuksek" ? "rgba(180,35,24,.03)" : "var(--surface)"
                      }}>
                        <div className="row row-between row-wrap gap-8">
                          <div className="row gap-10" style={{ alignItems: "center" }}>
                            <span style={{ fontSize: 22 }}>{b.ikon}</span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{b.baslik}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{b.mesaj}</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <span className="tag-xs" style={{
                              background: `${tipRenk[b.tip] || "#6f6a62"}15`,
                              color: tipRenk[b.tip] || "#6f6a62", fontWeight: 600
                            }}>
                              {b.tip === "odeme_gecikme" ? "Ödeme" : b.tip === "deneme_bitiyor" ? "Deneme" : b.tip === "yeni_kayit" ? "Yeni Kayıt" : b.tip === "havale_onay" ? "Havale" : b.tip === "destek" ? "Destek" : b.tip === "pasif_isletme" ? "Pasif" : b.tip}
                            </span>
                            {b.tarih && <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>{new Date(b.tarih).toLocaleDateString("tr-TR")}</div>}
                          </div>
                        </div>
                        {/* Aksiyon butonları */}
                        <div className="row gap-6 mt-8">
                          {b.tip === "odeme_gecikme" && b.isletme_id && (
                            <button onClick={() => { setSayfa("odemeler"); }} className="btn btn-sm" style={{ background: "rgba(180,35,24,.08)", color: "#b42318", border: "none", fontSize: 11 }}>Ödemeye Git →</button>
                          )}
                          {b.tip === "havale_onay" && (
                            <button onClick={() => { setSayfa("odemeler"); }} className="btn btn-sm" style={{ background: "rgba(93,75,181,.08)", color: "#5d4bb5", border: "none", fontSize: 11 }}>Onaylamaya Git →</button>
                          )}
                          {b.tip === "destek" && (
                            <button onClick={() => { setSayfa("destek"); }} className="btn btn-sm" style={{ background: "rgba(93,75,181,.08)", color: "#5d4bb5", border: "none", fontSize: 11 }}>Destek'e Git →</button>
                          )}
                          {b.tip === "pasif_isletme" && b.isletme_id && (
                            <button onClick={() => { setSayfa("aktivite"); }} className="btn btn-sm" style={{ background: "rgba(111,106,98,.08)", color: "#6f6a62", border: "none", fontSize: 11 }}>Aktiviteye Git →</button>
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
            <div style={{ background: "rgba(93,75,181,.08)", borderRadius: 20, padding: "28px 32px", marginBottom: 24, border: "1px solid rgba(93,75,181,.1)" }}>
              <div className="row row-between row-wrap gap-12">
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>Avcı Bot</h1>
                  <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 6 }}>Google Maps & Sosyal Medya'dan potansiyel müşterileri bul, skorla, ara ve kazan</p>
                </div>
                <div className="row gap-8">
                  <button onClick={() => { setAvciTaramaAcik(!avciTaramaAcik); setTopluTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "#1f6f4a", color: "#fff", fontWeight: 600, borderRadius: 12, border: "none", boxShadow: "none" }}>🔍 Maps Tara</button>
                  <button onClick={() => { setTopluTaramaAcik(!topluTaramaAcik); setAvciTaramaAcik(false); setSosyalAcik(false); }} className="btn btn-sm" style={{ background: "#5d4bb5", color: "#fff", fontWeight: 600, borderRadius: 12, border: "none", boxShadow: "none" }}>🚀 Toplu Maps</button>
                  <button onClick={() => { setSosyalAcik(!sosyalAcik); setAvciTaramaAcik(false); setTopluTaramaAcik(false); }} className="btn btn-sm" style={{ background: "#b42318", color: "#fff", fontWeight: 600, borderRadius: 12, border: "none", boxShadow: "none" }}>📱 Sosyal Tara</button>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            {avciStats && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 24 }}>
                {[
                  { icon: "📍", label: "Toplam Lead", val: avciStats.toplam, color: "#a8590c", bg: "rgba(168,89,12,.08)" },
                  { icon: "🆕", label: "Yeni", val: avciStats.yeni, color: "#2f56c6", bg: "rgba(47,86,198,.08)" },
                  { icon: "📞", label: "Arandı", val: avciStats.arandi, color: "#5d4bb5", bg: "rgba(93,75,181,.08)" },
                  { icon: "🤝", label: "İlgileniyor", val: avciStats.ilgileniyor, color: "#a8590c", bg: "rgba(168,89,12,.08)" },
                  { icon: "✅", label: "Müşteri Oldu", val: avciStats.musteri_oldu, color: "#1f6f4a", bg: "rgba(31,111,74,.08)" }
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}18`, borderRadius: 16, padding: "20px 18px", position: "relative", overflow: "hidden" }}>
                    
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 32, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab Navigation */}
            <div style={{ display: "flex", gap: 4, background: "var(--bg)", borderRadius: 14, padding: 4, marginBottom: 20 }}>
              {[
                { key: "gunluk", label: `📞 Bugün Ara (${avciGunluk.length})`, onClick: () => setAvciTab("gunluk") },
                { key: "liste-hepsi", label: `📋 Tümü (${avciStats?.toplam ?? avciListe.length})`, onClick: () => { setAvciTab("liste"); setAvciKaynak("hepsi"); } },
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
              <div style={{ background: "rgba(31,111,74,.04)", border: "1px solid rgba(31,111,74,.15)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
                  
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Tekli Maps Tarama</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Tek bir şehir/ilçe/kategori kombinasyonu tara</div>
                  </div>
                </div>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div><label className="form-label">Şehir *</label><input value={avciTarama.sehir} onChange={e => setAvciTarama({...avciTarama, sehir: e.target.value})} placeholder="İstanbul" className="input" style={{ borderRadius: 10 }} /></div>
                  <div><label className="form-label">İlçe</label><input value={avciTarama.ilce} onChange={e => setAvciTarama({...avciTarama, ilce: e.target.value})} placeholder="Boş bırak → tüm ilçeler" className="input" style={{ borderRadius: 10 }} /></div>
                  <div><label className="form-label">Kategori *</label><select value={avciTarama.kategori} onChange={e => setAvciTarama({...avciTarama, kategori: e.target.value})} className="input" style={{ borderRadius: 10 }}>{["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => <option key={k} value={k}>{k}</option>)}</select></div>
                  <button disabled={avciTaramaYukleniyor} onClick={() => avciTaramaBaslat("/admin/avci/tarama", avciTarama)} className="btn" style={{ background: "#1f6f4a", color: "#fff", fontWeight: 600, borderRadius: 10, opacity: avciTaramaYukleniyor ? 0.5 : 1 }}>{avciTaramaYukleniyor ? "Taranıyor..." : "🔍 Tara"}</button>
                  {avciTaramaYukleniyor && avciTaramaId && (
                    <button onClick={avciTaramaIptalEt} className="btn" style={{ background: "rgba(180,35,24,.1)", color: "#b42318", fontWeight: 600, borderRadius: 10, border: "1px solid rgba(180,35,24,.3)" }}>⏹ İptal</button>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>💡 İlçe boş bırakılırsa Google'ın 60 sonuç limitini aşmak için o şehrin tüm ilçeleri × kategori sinonimleri otomatik taranır.</div>
                {/* Canlı progress */}
                {avciTaramaYukleniyor && avciTaramaDurum && (
                  <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 12, background: "rgba(31,111,74,.06)", border: "1px solid rgba(31,111,74,.2)" }}>
                    <div className="row row-between" style={{ alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1f6f4a" }}>🎯 Sorgular çalışıyor · {avciTaramaDurum.tamamlanan}/{avciTaramaDurum.toplam_sorgu}</div>
                      <div style={{ fontSize: 12, color: "var(--dim)" }}>{Math.round((avciTaramaDurum.tamamlanan / avciTaramaDurum.toplam_sorgu) * 100)}%</div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 8, background: "rgba(31,111,74,.12)", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{ height: "100%", width: `${Math.min(100, Math.round((avciTaramaDurum.tamamlanan / avciTaramaDurum.toplam_sorgu) * 100))}%`, background: "#1f6f4a", transition: "width .4s" }}></div>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text)", fontWeight: 600, marginBottom: 4 }}>🔎 Şu an: <span style={{ color: "#1f6f4a" }}>{avciTaramaDurum.aktif || "hazırlanıyor..."}</span></div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>
                      ✨ Yeni bulunan: <strong style={{ color: "#1f6f4a" }}>{avciTaramaDurum.yeni_eklenen}</strong>
                      {" · "}Zaten vardı: <strong>{avciTaramaDurum.zaten_var}</strong>
                      {" · "}Toplam bulundu: <strong>{avciTaramaDurum.toplam_bulunan}</strong>
                    </div>
                  </div>
                )}
                {/* Final sonuç */}
                {avciTaramaSonuc && !avciTaramaYukleniyor && (
                  <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 10, background: avciTaramaSonuc.hata ? "rgba(180,35,24,.08)" : (avciTaramaSonuc.iptal ? "rgba(168,89,12,.08)" : "rgba(31,111,74,.08)"), color: avciTaramaSonuc.hata ? "#b42318" : (avciTaramaSonuc.iptal ? "#a8590c" : "#1f6f4a"), fontSize: 13, fontWeight: 600 }}>
                    {avciTaramaSonuc.hata ? `❌ ${avciTaramaSonuc.hata}` : `${avciTaramaSonuc.iptal ? "⏹ İptal edildi" : "✅"} "${avciTaramaSonuc.arama_metni}" — ${avciTaramaSonuc.tarama_sayisi} sorgu · ${avciTaramaSonuc.toplam_bulunan} bulundu · ${avciTaramaSonuc.yeni_eklenen} yeni · ${avciTaramaSonuc.zaten_var} zaten vardı`}
                  </div>
                )}
              </div>
            )}

            {/* 🚀 Toplu tarama — Manyak Mod bileşeni */}
            {topluTaramaAcik && (
              <div style={{ marginBottom: 20 }}>
                <AvciToplu api={api} />
              </div>
            )}

            {/* Sosyal medya tarama formu */}
            {sosyalAcik && (
              <div style={{ background: "rgba(180,35,24,.04)", border: "1px solid rgba(180,35,24,.15)", borderRadius: 16, padding: "20px 24px", marginBottom: 20 }}>
                <div className="row gap-8 mb-12" style={{ alignItems: "center" }}>
                  
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Sosyal Medya Tarama</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Instagram, Facebook, TikTok profilleri (günlük 100 ücretsiz)</div>
                  </div>
                </div>
                <div className="row row-wrap gap-12" style={{ alignItems: "flex-end" }}>
                  <div>
                    <label className="form-label">Platform *</label>
                    <div className="row gap-4">{[["instagram","📸 IG"],["facebook","📘 FB"],["tiktok","🎵 TT"],["hepsi","🌐 Hepsi"]].map(([v,l]) => (
                      <button key={v} onClick={() => setSosyalTarama({...sosyalTarama, platform: v})} style={{ padding: "6px 12px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: sosyalTarama.platform === v ? 700 : 500, cursor: "pointer", background: sosyalTarama.platform === v ? "#b42318" : "var(--bg)", color: sosyalTarama.platform === v ? "#fff" : "var(--dim)", transition: "all .2s" }}>{l}</button>
                    ))}</div>
                  </div>
                  <div><label className="form-label">Şehir *</label><input value={sosyalTarama.sehir} onChange={e => setSosyalTarama({...sosyalTarama, sehir: e.target.value})} className="input" style={{ width: 120, borderRadius: 10 }} /></div>
                  <div><label className="form-label">İlçe</label><input value={sosyalTarama.ilce} onChange={e => setSosyalTarama({...sosyalTarama, ilce: e.target.value})} placeholder="opsiyonel" className="input" style={{ width: 120, borderRadius: 10 }} /></div>
                  <div><label className="form-label">Kategori *</label><select value={sosyalTarama.kategori} onChange={e => setSosyalTarama({...sosyalTarama, kategori: e.target.value})} className="input" style={{ borderRadius: 10 }}>{["berber","kuaför","güzellik salonu","dövme","tırnak salonu","cilt bakım","spa","diş kliniği","veteriner","diyetisyen","psikolog","fizyoterapi","pilates","oto yıkama"].map(k => <option key={k} value={k}>{k}</option>)}</select></div>
                  <button disabled={sosyalYukleniyor} onClick={async () => { setSosyalYukleniyor(true); setSosyalSonuc(null); try { const res = await api.post("/admin/avci/sosyal-tarama", sosyalTarama); setSosyalSonuc(res); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); } catch(e) { setSosyalSonuc({ hata: e.message }); } setSosyalYukleniyor(false); }} className="btn" style={{ background: sosyalYukleniyor ? "var(--surface3)" : "#b42318", color: "#fff", fontWeight: 600, borderRadius: 10, opacity: sosyalYukleniyor ? 0.6 : 1 }}>{sosyalYukleniyor ? "⏳ Aranıyor..." : "🔍 Tara"}</button>
                </div>
                {sosyalSonuc && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 10, background: sosyalSonuc.hata ? "rgba(180,35,24,.08)" : "rgba(180,35,24,.08)", color: sosyalSonuc.hata ? "#b42318" : "#b42318", fontSize: 13, fontWeight: 600 }}>{sosyalSonuc.hata ? `❌ ${sosyalSonuc.hata}` : `✅ "${sosyalSonuc.arama_metni}" — ${sosyalSonuc.toplam_bulunan} sonuç, ${sosyalSonuc.yeni_eklenen} yeni, ${sosyalSonuc.zaten_var} zaten vardı`}</div>}
              </div>
            )}

            {/* GÜNLÜK ARAMA LİSTESİ */}
            {avciTab === "gunluk" && (
              <>
                <div style={{ background: "rgba(93,75,181,.06)", border: "1px solid rgba(93,75,181,.12)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                  <div className="row gap-8" style={{ alignItems: "center" }}>
                    
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>Bugün Aranacak {avciGunluk.length} İşletme</div>
                      <div style={{ fontSize: 11, color: "var(--dim)" }}>Henüz yazılmamış, telefonu olan, en yüksek skorlu lead'ler</div>
                    </div>
                  </div>
                </div>
                {avciGunluk.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}><p style={{ fontSize: 14 }}>Bugün aranacak kimse yok. Yeni tarama yap!</p></div>
                ) : avciGunluk.map((m, idx) => (
                  <div key={m.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "18px 20px", marginBottom: 10, border: "1px solid var(--border)", transition: "all .2s" }}>
                    <div className="row row-between" style={{ alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div className="row row-wrap gap-8 mb-6" style={{ alignItems: "center" }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: "#5d4bb5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600 }}>{idx + 1}</div>
                          <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 15 }}>{m.isletme_adi}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(47,86,198,.08)", color: "#2f56c6", fontSize: 11, fontWeight: 600 }}>{m.kategori}</span>
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(168,89,12,.08)", color: "#a8590c", fontSize: 11, fontWeight: 600 }}>Skor: {m.skor}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
                          {m.telefon && <span style={{ fontWeight: 600, color: "var(--text)" }}>📞 {m.telefon}</span>}
                          {m.adres && <span>📍 {m.adres}</span>}
                        </div>
                        <div className="row row-wrap gap-6" style={{ fontSize: 11 }}>
                          {!m.web_sitesi && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(31,111,74,.08)", color: "#1f6f4a" }}>🌐 Web yok</span>}
                          {m.puan && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(168,89,12,.08)", color: "#a8590c" }}>⭐ {m.puan}</span>}
                          <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(93,75,181,.08)", color: "#5d4bb5" }}>💬 {m.yorum_sayisi} yorum</span>
                          {m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(47,86,198,.08)", color: "#2f56c6", textDecoration: "none" }}>🗺️ Maps</a>}
                        </div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "arandi" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 12, boxShadow: "none" }}>📞 Arandı</button>
                        <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "ilgileniyor" }); avciGunlukYukle(); avciStatsYukle(); avciListeYukle(); }} style={{ padding: "8px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontWeight: 600, fontSize: 12 }}>🤝 İlgileniyor</button>
                        <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} style={{ padding: "6px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 11 }}>📝 Not</button>
                      </div>
                    </div>
                    {avciSecili === m.id && (
                      <div className="row gap-8" style={{ marginTop: 12 }}>
                        <input id={`not_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input" style={{ flex: 1, borderRadius: 10 }} />
                        <button onClick={async () => { const notInput = document.getElementById(`not_${m.id}`); await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value }); setAvciSecili(null); avciListeYukle(); avciGunlukYukle(); }} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12 }}>Kaydet</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}

            {/* TÜM LİSTE */}
            {avciTab === "liste" && (() => {
              const durumRenk = { yeni: "#2f56c6", arandi: "#5d4bb5", ilgileniyor: "#1f6f4a", ilgilenmiyor: "#b42318", musteri_oldu: "#1f6f4a", cevapsiz: "#6f6a62" };
              const durumLabel = { yeni: "Yeni", arandi: "Arandı", ilgileniyor: "İlgileniyor", ilgilenmiyor: "İlgilenmiyor", musteri_oldu: "Müşteri ✓", cevapsiz: "Cevapsız" };
              const kaynakIcon = { maps: "🗺️", instagram: "📸", facebook: "📘", tiktok: "🎵" };
              const kaynakRenk = { maps: "#2f56c6", instagram: "#b42318", facebook: "#2f56c6", tiktok: "#000" };
              const isSosyal = (k) => ["instagram", "facebook", "tiktok"].includes(k);
              return (
              <>
                {/* ═══ FİLTRE DOCK — 3 satır tek konteyner ═══ */}
                <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: 12, marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>

                  {/* Satır 1: Arama + Şehir + İlçe + Sıralama */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
                      
                      <input
                        value={avciArama}
                        onChange={e => setAvciArama(e.target.value)}
                        placeholder="İşletme adı, telefon, adres ara…"
                        className="input"
                        style={{ paddingLeft: 34, paddingRight: avciArama ? 34 : 12, borderRadius: 10, width: "100%", fontSize: 13 }}
                      />
                      {avciArama && (
                        <button onClick={() => setAvciArama("")} title="Temizle" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "var(--dim)", cursor: "pointer", fontSize: 14, padding: 4, lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                    <select value={avciSehir} onChange={e => setAvciSehir(e.target.value)} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: "var(--text)", cursor: "pointer", minWidth: 140 }}>
                      <option value="">📍 Tüm şehirler</option>
                      {avciSehirListe.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select
                      value={avciIlce}
                      onChange={e => setAvciIlce(e.target.value)}
                      disabled={!avciSehir}
                      style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: avciSehir ? "var(--text)" : "var(--dim)", cursor: avciSehir ? "pointer" : "not-allowed", minWidth: 140, opacity: avciSehir ? 1 : 0.6 }}
                    >
                      <option value="">{avciSehir ? "🏘️ Tüm ilçeler" : "🏘️ Önce şehir seç"}</option>
                      {avciIlceListe.map(i => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <button
                      onClick={async () => {
                        if (!confirm("Tüm kayıtların ilçe alanı adresten yeniden hesaplanacak. Devam?")) return;
                        const d = await api.post("/admin/avci/ilceleri-duzelt", {});
                        if (d.hata) { alert("Hata: " + d.hata); return; }
                        alert(`✅ ${d.duzeltildi} düzeltildi, ${d.temizlendi} temizlendi, ${d.degismedi} değişmedi (toplam ${d.toplam})`);
                        avciSehirleriYukle();
                        avciIlceleriYukle(avciSehir);
                        avciListeYukle();
                      }}
                      title="Kirli ilçe kayıtlarını adresten yeniden tespit et"
                      style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: "var(--dim)", cursor: "pointer" }}
                    >🧹</button>
                    <select value={avciSiralama} onChange={e => setAvciSiralama(e.target.value)} style={{ marginLeft: "auto", padding: "8px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 13, background: "var(--bg)", color: "var(--text)", cursor: "pointer" }}>
                      <option value="skor_desc">Skor ↓</option>
                      <option value="puan_desc">Puan ↓</option>
                      <option value="yorum_desc">Yorum ↓</option>
                      <option value="yeni">En Yeni</option>
                    </select>
                  </div>

                  {/* Satır 2: Durum Chip'leri (sayılı) */}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    {[
                      ["hepsi", "Tümü", avciStats?.toplam],
                      ["yeni", "Yeni", avciStats?.yeni],
                      ["bot_yazdi", "📱 Bot Yazdı", avciStats?.bot_yazdi],
                      ["cevapsiz", "📭 Cevapsız", avciStats?.cevapsiz],
                      ["arandi", "Arandı", avciStats?.arandi],
                      ["ilgileniyor", "İlgileniyor", avciStats?.ilgileniyor],
                      ["ilgilenmiyor", "İlgilenmiyor", avciStats?.ilgilenmiyor],
                      ["musteri_oldu", "Müşteri ✓", avciStats?.musteri_oldu],
                    ].map(([v, l, count]) => {
                      const active = avciFiltre === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setAvciFiltre(v)}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 6,
                            padding: "7px 12px", borderRadius: 999,
                            border: active ? "none" : "1px solid var(--border)",
                            fontSize: 12, fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            background: active ? "#5d4bb5" : "var(--bg)",
                            color: active ? "#fff" : "var(--dim)",
                            boxShadow: active ? "0 2px 8px rgba(93,75,181,.3)" : "none",
                            transition: "all .15s"
                          }}
                        >
                          <span>{l}</span>
                          {count !== undefined && count !== null && (
                            <span style={{
                              padding: "1px 8px", borderRadius: 999, fontSize: 10, fontWeight: 600, minWidth: 20, textAlign: "center",
                              background: active ? "rgba(255,255,255,.22)" : "var(--surface)",
                              color: active ? "#fff" : "var(--text)"
                            }}>{count}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Satır 3: Kategori Chip'leri — yatay scroll */}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "thin", WebkitOverflowScrolling: "touch" }}>
                    {[["hepsi","Tümü"],["berber","✂️ Berber"],["kuaför","💇 Kuaför"],["güzellik salonu","💅 Güzellik"],["dövme","🎨 Dövme"],["diş kliniği","🦷 Dişçi"],["veteriner","🐾 Veteriner"],["spa","🧖 Spa"],["diyetisyen","🥗 Diyetisyen"],["tırnak salonu","💅 Tırnak"],["cilt bakım","✨ Cilt Bakım"],["fizyoterapi","💪 Fizyoterapi"],["psikolog","🧠 Psikolog"],["pilates","🧘 Pilates"],["oto yıkama","🚗 Oto Yıkama"]].map(([v,l]) => {
                      const active = avciKategoriFiltre === v;
                      return (
                        <button
                          key={v}
                          onClick={() => setAvciKategoriFiltre(v)}
                          style={{
                            flexShrink: 0, whiteSpace: "nowrap",
                            padding: "6px 12px", borderRadius: 999,
                            border: active ? "none" : "1px solid var(--border)",
                            fontSize: 11, fontWeight: active ? 700 : 500,
                            cursor: "pointer",
                            background: active ? "#5d4bb5" : "var(--bg)",
                            color: active ? "#fff" : "var(--dim)",
                            boxShadow: active ? "0 2px 6px rgba(93,75,181,.25)" : "none",
                            transition: "all .15s"
                          }}
                        >{l}</button>
                      );
                    })}
                  </div>
                </div>

                {/* Lead Kartları */}
                {avciListe.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 40, color: "var(--dim)" }}><p style={{ fontSize: 14 }}>Henüz potansiyel müşteri yok. Tarama yap!</p></div>
                ) : avciListe.map(m => {
                  const sosyal = isSosyal(m.kaynak);
                  const platform = m.kaynak || "maps";
                  const dRenk = durumRenk[m.durum] || "#6f6a62";
                  return (
                    <div key={m.id} style={{ background: "var(--surface)", borderRadius: 14, padding: "16px 20px", marginBottom: 8, borderLeft: `3px solid ${sosyal ? (kaynakRenk[platform] || "#b42318") : dRenk}`, border: "1px solid var(--border)", borderLeftWidth: 3, borderLeftColor: sosyal ? (kaynakRenk[platform] || "#b42318") : dRenk, transition: "all .2s" }}>
                      <div className="row row-between" style={{ alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div className="row row-wrap gap-6 mb-4" style={{ alignItems: "center" }}>
                            <span style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>{m.isletme_adi}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${dRenk}15`, color: dRenk, fontSize: 11, fontWeight: 600 }}>{durumLabel[m.durum] || m.durum}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(168,89,12,.08)", color: "#a8590c", fontSize: 11, fontWeight: 600 }}>Skor: {m.skor}</span>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: `${kaynakRenk[platform] || "#6f6a62"}12`, color: kaynakRenk[platform] || "#6f6a62", fontSize: 11, fontWeight: 600 }}>{kaynakIcon[platform] || "🔗"} {platform === "maps" ? "Maps" : platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
                            {m.wp_mesaj_durumu === 'gonderildi' && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontSize: 11, fontWeight: 600 }}>📱 Bot Yazdı</span>}
                            {m.wp_mesaj_durumu === 'wp_yok' && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(180,35,24,.08)", color: "#b42318", fontSize: 11 }}>📵 WP Yok</span>}
                            {!sosyal && m.puan && <span style={{ color: "#a8590c", fontSize: 12 }}>⭐ {m.puan}</span>}
                            {!sosyal && <span style={{ color: "var(--dim)", fontSize: 11 }}>💬 {m.yorum_sayisi}</span>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, color: "var(--dim)", fontSize: 12, marginBottom: 4 }}>
                            {m.telefon && <span>📞 {m.telefon}</span>}
                            {m.kategori && <span>🏷️ {m.kategori}</span>}
                            {m.ilce && <span>📍 {m.ilce}</span>}
                            {!sosyal && !m.web_sitesi && <span style={{ color: "#1f6f4a" }}>🌐 Web yok</span>}
                            {!sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ color: "#2f56c6", textDecoration: "none" }}>🗺️ Maps</a>}
                            {sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "1px 8px", borderRadius: 6, background: `${kaynakRenk[platform] || "#b42318"}15`, color: kaynakRenk[platform] || "#b42318", textDecoration: "none", fontWeight: 600, fontSize: 11 }}>{kaynakIcon[platform]} Profil ↗</a>}
                            {sosyal && m.instagram && <span style={{ color: "#b42318" }}>@{m.instagram}</span>}
                          </div>
                          {m.notlar && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 4, fontStyle: "italic" }}>📝 {m.notlar}</div>}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, flexShrink: 0 }}>
                          {sosyal && m.google_maps_url && <a href={m.google_maps_url} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", borderRadius: 8, background: kaynakRenk[platform] || "#b42318", color: "#fff", fontWeight: 600, fontSize: 11, textDecoration: "none", border: "none" }}>{kaynakIcon[platform]} Profil</a>}
                          {["yeni","arandi","ilgileniyor","ilgilenmiyor","musteri_oldu"].filter(d => d !== m.durum).slice(0,3).map(d => (
                            <button key={d} onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: d }); avciListeYukle(); avciStatsYukle(); avciGunlukYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: `${durumRenk[d] || "#6f6a62"}15`, color: durumRenk[d] || "#6f6a62", fontWeight: 600, fontSize: 11 }}>{durumLabel[d]}</button>
                          ))}
                          <button onClick={() => setAvciSecili(avciSecili === m.id ? null : m.id)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 11 }}>📝</button>
                          <button onClick={async () => { if (!confirm(`"${m.isletme_adi}" silinsin mi?`)) return; await api.del(`/admin/avci/${m.id}`); avciListeYukle(); avciStatsYukle(); }} style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(180,35,24,.08)", color: "#b42318", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      {avciSecili === m.id && (
                        <div className="row gap-8" style={{ marginTop: 12 }}>
                          <input id={`not2_${m.id}`} defaultValue={m.notlar || ""} placeholder="Not ekle..." className="input" style={{ flex: 1, borderRadius: 10 }} />
                          <button onClick={async () => { const notInput = document.getElementById(`not2_${m.id}`); await api.put(`/admin/avci/${m.id}`, { notlar: notInput.value }); setAvciSecili(null); avciListeYukle(); }} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12 }}>Kaydet</button>
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
            <div style={{ background: "rgba(37,211,102,.08)", borderRadius: 20, padding: "28px 32px", marginBottom: 24, border: "1px solid rgba(37,211,102,.12)" }}>
              <div className="row row-between row-wrap gap-12">
                <div>
                  <h1 style={{ fontSize: 26, fontWeight: 600, color: "var(--text)", margin: 0, letterSpacing: "-0.5px" }}>Satış Bot</h1>
                  <p style={{ color: "var(--dim)", fontSize: 13, marginTop: 6 }}>WhatsApp otomatik pazarlama — lead'lere mesaj gönder, AI ile satış yap</p>
                </div>
                <div className="row gap-8">
                  <button onClick={satisBotYukle} style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄 Yenile</button>
                </div>
              </div>
            </div>

            {/* Otomatik fren: bot kendi kendini durdurduysa sebebi */}
            {satisBotDurum?.fren && !satisBotDurum?.aktif && (
              <div className="alert alert-error" style={{ marginBottom: 20 }}>
                <b>Gönderim otomatik olarak durduruldu.</b> {satisBotDurum.fren.mesaj}
                <div style={{ fontSize: 12, marginTop: 4, opacity: .85 }}>
                  {new Date(satisBotDurum.fren.zaman).toLocaleString("tr-TR")} · Sebebi kontrol edip gönderimi yeniden başlatın; başlatınca bu uyarı kalkar.
                </div>
              </div>
            )}

            {/* ─── ANA TAB BAR ─── */}
            <div className="row gap-8" style={{ marginBottom: 20 }}>
              {[{id:"bot",icon:"🤖",label:"Bot & Şablonlar"},{id:"kampanyalar",icon:"🎯",label:"Kampanyalar"},{id:"dagilim",icon:"📊",label:"Kategori Dağılımı"}].map(t => (
                <button key={t.id} onClick={() => setSatisAnaTab(t.id)} style={{ padding: "10px 20px", borderRadius: 12, border: "1px solid " + (satisAnaTab === t.id ? "#25d366" : "var(--border)"), cursor: "pointer", background: satisAnaTab === t.id ? "rgba(37,211,102,.08)" : "var(--surface)", color: satisAnaTab === t.id ? "#25d366" : "var(--dim)", fontWeight: 600, fontSize: 13, transition: "all .2s" }}>
                  {t.icon} {t.label} {t.id === "kampanyalar" && kampanyalar.length > 0 && <span style={{ marginLeft: 4, padding: "1px 7px", borderRadius: 10, background: "rgba(37,211,102,.12)", fontSize: 10, fontWeight: 600, color: "#25d366" }}>{kampanyalar.filter(k => k.aktif).length}</span>}
                </button>
              ))}
            </div>

            {/* ─── TAB: BOT & ŞABLONLAR ─── */}
            {satisAnaTab === "bot" && <>
            {/* Ana Grid: Bot Durumu + QR + İstatistikler */}
            <div style={{ display: "grid", gridTemplateColumns: satisBotDurum?.durum === 'qr_bekleniyor' ? "1fr 1fr" : "1fr", gap: 16, marginBottom: 24 }}>
              {/* Bot Durumu Kartı */}
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)" }}>
                <div className="row gap-10 mb-16" style={{ alignItems: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: satisBotDurum?.durum === 'bagli' ? "#1f6f4a" : satisBotDurum?.durum === 'qr_bekleniyor' ? "#a8590c" : "#b42318", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 22, filter: "brightness(10)" }}>{satisBotDurum?.durum === 'bagli' ? '✅' : satisBotDurum?.durum === 'qr_bekleniyor' ? '📱' : '⏹️'}</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>Bot Durumu</div>
                    <div style={{ fontSize: 12, color: satisBotDurum?.durum === 'bagli' ? "#1f6f4a" : satisBotDurum?.durum === 'qr_bekleniyor' ? "#a8590c" : "#b42318", fontWeight: 600 }}>
                      {satisBotDurum?.durum === 'bagli' ? '● Bağlı & Çalışıyor' : satisBotDurum?.durum === 'qr_bekleniyor' ? '● QR Kod Bekliyor' : satisBotDurum?.durum === 'baslatiyor' ? '● Başlatılıyor...' : '● Kapalı'}
                    </div>
                  </div>
                  {satisBotDurum?.aktif && <span style={{ marginLeft: "auto", padding: "4px 12px", borderRadius: 20, background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontSize: 11, fontWeight: 600 }}>🚀 Gönderim Aktif</span>}
                </div>
                <div className="row gap-8" style={{ flexWrap: "wrap" }}>
                  {(!satisBotDurum || satisBotDurum.durum === 'kapali' || satisBotDurum.durum === 'hata' || satisBotDurum.durum === 'baslatiyor') && (
                    <button onClick={async () => { setSatisBotYukleniyor(true); await api.post("/admin/satis-bot/baslat"); setTimeout(satisBotYukle, 3000); setSatisBotYukleniyor(false); }} disabled={satisBotYukleniyor} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#1f6f4a", color: "#fff", fontWeight: 600, fontSize: 13, boxShadow: "none" }}>{satisBotYukleniyor ? '⏳ Başlatılıyor...' : '▶️ Botu Başlat'}</button>
                  )}
                  {satisBotDurum?.durum === 'bagli' && !satisBotDurum?.aktif && (
                    <button onClick={async () => { await api.post("/admin/satis-bot/gonderim-baslat"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "#25d366", color: "#fff", fontWeight: 600, fontSize: 13, boxShadow: "none" }}>🚀 Gönderimi Başlat</button>
                  )}
                  {satisBotDurum?.aktif && (
                    <button onClick={async () => { await api.post("/admin/satis-bot/gonderim-durdur"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(168,89,12,.1)", color: "#a8590c", fontWeight: 600, fontSize: 13 }}>⏸️ Gönderimi Durdur</button>
                  )}
                  {satisBotDurum?.durum !== 'kapali' && satisBotDurum && (
                    <button onClick={async () => { if (!confirm("Bot durdurulacak ve oturum kapatılacak. Emin misiniz?")) return; await api.post("/admin/satis-bot/durdur"); satisBotYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", cursor: "pointer", background: "rgba(180,35,24,.08)", color: "#b42318", fontWeight: 600, fontSize: 13 }}>⏹️ Botu Kapat</button>
                  )}
                </div>
                {/* Günlük ilerleme */}
                {satisBotDurum?.gunlukGonderim > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="row row-between" style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>
                      <span>Bugün gönderilen</span>
                      <span style={{ fontWeight: 600 }}>{satisBotDurum.gunlukGonderim}/{satisBotDurum?.ayarlar?.gunlukLimit || 50}</span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min((satisBotDurum.gunlukGonderim / (satisBotDurum?.ayarlar?.gunlukLimit || 50)) * 100, 100)}%`, background: "#25d366", borderRadius: 3, transition: "width .3s" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* QR Kod */}
              {satisBotDurum?.durum === 'qr_bekleniyor' && satisBotDurum?.qrBase64 && (
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", textAlign: "center" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", marginBottom: 12 }}>📱 QR Kodu Tara</div>
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
                  { icon: "📤", label: "Gönderilen", val: satisBotDurum.istatistikler.gonderilen, color: "#2f56c6", bg: "rgba(47,86,198,.08)" },
                  { icon: "⏳", label: "Cevap Bekliyor", val: satisBotDurum.istatistikler.bekleyen, color: "#a8590c", bg: "rgba(168,89,12,.08)" },
                  { icon: "🔥", label: "Sıcak (Ara!)", val: satisBotDurum.istatistikler.sicak || 0, color: "#a8590c", bg: "rgba(168,89,12,.12)" },
                  { icon: "✅", label: "Olumlu", val: satisBotDurum.istatistikler.olumlu, color: "#1f6f4a", bg: "rgba(31,111,74,.08)" },
                  { icon: "🎉", label: "Kayıt (WhatsApp)", val: satisBotDurum.istatistikler.kayit || 0, color: "#1f6f4a", bg: "rgba(31,111,74,.12)" },
                  { icon: "❌", label: "Olumsuz", val: satisBotDurum.istatistikler.olumsuz, color: "#b42318", bg: "rgba(180,35,24,.08)" },
                  { icon: "📵", label: "WP Yok", val: satisBotDurum.istatistikler.wp_yok, color: "#6f6a62", bg: "rgba(111,106,98,.08)" }
                ].map((s, i) => (
                  <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}15`, borderRadius: 14, padding: "16px", position: "relative", overflow: "hidden" }}>
                    
                    <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4 }}>{s.label}</div>
                    <div style={{ fontSize: 28, fontWeight: 600, color: s.color, lineHeight: 1 }}>{s.val}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Satış hunisi: hangi şablon müşteri getiriyor */}
            <SatisHuni api={api} />

            {/* ═══ KAPSAMLI BOT AYARLARI PANELİ ═══ */}
            {satisBotDurum?.ayarlar && (() => {
              const ay = satisBotDurum.ayarlar;
              const ayarGuncelle = async (obj) => { await api.put("/admin/satis-bot/ayarlar", obj); satisBotYukle(); };
              const toggleStyle = (aktif) => ({ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", background: aktif ? "rgba(31,111,74,.12)" : "rgba(180,35,24,.08)", color: aktif ? "#1f6f4a" : "#b42318", fontWeight: 600, fontSize: 11, transition: "all .2s" });
              const labelStyle = { fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", display: "block", marginBottom: 6 };
              const cellStyle = { background: "var(--bg)", borderRadius: 12, padding: 14 };
              const selStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14, fontWeight: 600 };
              const modRenk = { hepsi: "#1f6f4a", sadece_kayit: "#2f56c6", sadece_satis: "#a8590c", sadece_ai: "#5d4bb5", kapali: "#b42318" };
              const modIcon = { hepsi: "🚀", sadece_kayit: "📝", sadece_satis: "📤", sadece_ai: "🤖", kapali: "⏸️" };
              const modAciklama = { hepsi: "Tüm özellikler aktif", sadece_kayit: "Sadece WhatsApp kayıt sistemi", sadece_satis: "Sadece giden mesaj (AI cevap yok)", sadece_ai: "Gelen mesajlara AI cevap (giden yok)", kapali: "Bot bağlı ama hiçbir şey yapmıyor" };
              return (
                <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
                  {/* Başlık */}
                  <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                    
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>Bot Ayarları</div>
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
                          <div style={{ fontSize: 12, fontWeight: 600, color: (ay.mod || 'hepsi') === k ? modRenk[k] : "var(--dim)" }}>{l}</div>
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
                      <div key={key} onClick={() => ayarGuncelle({ [key]: !ay[key] })} style={{ ...cellStyle, cursor: "pointer", display: "flex", alignItems: "center", gap: 10, transition: "all .2s", border: ay[key] ? "1px solid rgba(31,111,74,.2)" : "1px solid transparent" }}>
                        <div style={{ width: 38, height: 22, borderRadius: 11, background: ay[key] ? "#1f6f4a" : "rgba(111,106,98,.2)", position: "relative", transition: "all .2s", flexShrink: 0 }}>
                          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: ay[key] ? 18 : 2, transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,.15)" }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{title}</div>
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
                      {ay.hedefKategori && <span style={{ padding: "4px 12px", borderRadius: 20, background: "rgba(93,75,181,.1)", color: "#5d4bb5", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>🎯 {ay.hedefKategori}</span>}
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
                
                <div>
                  <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>Son Konuşmalar</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{satisBotKonusmalar.length} konuşma</div>
                </div>
              </div>
              {satisBotKonusmalar.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--dim)" }}><p style={{ fontSize: 13 }}>Henüz konuşma yok. Botu başlat!</p></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {satisBotKonusmalar.map(k => {
                    const dRenk = { bekliyor: "#a8590c", sicak: "#a8590c", olumlu: "#1f6f4a", olumsuz: "#b42318", ai_devrede: "#5d4bb5" };
                    const dIcon = { bekliyor: "⏳", sicak: "🔥", olumlu: "✅", olumsuz: "❌", ai_devrede: "🤖" };
                    return (
                      <div key={k.id} className="row gap-12" style={{ padding: "12px 14px", borderRadius: 12, background: "var(--bg)", alignItems: "center", cursor: "pointer", transition: "all .15s" }}>
                        <div style={{ width: 40, height: 40, borderRadius: 20, background: `${dRenk[k.durum] || "#6f6a62"}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{dIcon[k.durum] || "💬"}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row row-between gap-8">
                            <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.isletme_adi}</span>
                            <span style={{ fontSize: 10, color: "var(--dim)", whiteSpace: "nowrap", flexShrink: 0 }}>{k.olusturma_tarihi ? new Date(k.olusturma_tarihi).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                          </div>
                          <div style={{ fontSize: 12, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.gelen_mesajlar ? `💬 ${k.gelen_mesajlar.slice(0, 60)}...` : `📤 ${(k.gonderilen_mesaj || '').slice(0, 60)}...`}</div>
                        </div>
                        <div className="row gap-4" style={{ flexShrink: 0 }}>
                          {k.kategori && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontSize: 10, fontWeight: 600 }}>{k.kategori}</span>}
                          <a href={`https://wa.me/${k.telefon}`} target="_blank" rel="noreferrer" style={{ padding: "6px 12px", borderRadius: 8, background: "#25d366", color: "#fff", fontWeight: 600, fontSize: 11, textDecoration: "none", display: "flex", alignItems: "center", gap: 4, boxShadow: "none" }}>💬 WA</a>
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
                  
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>WP Yok — Manuel Ara ({wpYokListe.length})</div>
                    <div style={{ fontSize: 11, color: "var(--dim)" }}>Bu işletmelerin WP'si yok — telefonla kendin ara</div>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {wpYokListe.map(m => (
                    <div key={m.id} className="row gap-12" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", flex: 1 }}>{m.isletme_adi}</span>
                      <span style={{ fontSize: 11, color: "var(--dim)" }}>{m.kategori}</span>
                      <span style={{ fontSize: 11, color: "#a8590c", fontWeight: 600 }}>Skor: {m.skor}</span>
                      <a href={`tel:${m.telefon}`} style={{ padding: "6px 12px", borderRadius: 8, background: "rgba(47,86,198,.08)", color: "#2f56c6", fontWeight: 600, fontSize: 12, textDecoration: "none" }}>📞 {m.telefon}</a>
                      <button onClick={async () => { await api.put(`/admin/avci/${m.id}`, { durum: "arandi" }); satisBotYukle(); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontWeight: 600, fontSize: 11 }}>✅ Arandı</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Numara Yönetimi */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 24 }}>
              <div className="row gap-8 mb-16" style={{ alignItems: "center" }}>
                
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>Numara Yönetimi</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>{numaralar.length} numara · {numaralar.filter(n => n.durum === 'aktif').length} aktif · {numaralar.filter(n => n.durum === 'banli').length} banlı</div>
                </div>
                <button onClick={() => setNumaraFormAcik(!numaraFormAcik)} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 12, boxShadow: "none" }}>+ Numara Ekle</button>
              </div>

              {numaraFormAcik && (
                <form onSubmit={async (e) => { e.preventDefault(); await api.post("/admin/satis-bot/numaralar", yeniNumara); setYeniNumara({ isim: "", telefon: "" }); setNumaraFormAcik(false); numaralariYukle(); }} style={{ display: "flex", gap: 10, background: "var(--bg)", borderRadius: 12, padding: 14, marginBottom: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>İsim</label><input value={yeniNumara.isim} onChange={e => setYeniNumara({...yeniNumara, isim: e.target.value})} placeholder="Satış 1" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: 140 }} /></div>
                  <div><label style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Telefon</label><input value={yeniNumara.telefon} onChange={e => setYeniNumara({...yeniNumara, telefon: e.target.value})} placeholder="905551234567" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, width: 170 }} /></div>
                  <button type="submit" style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 12 }}>Kaydet</button>
                  <button type="button" onClick={() => setNumaraFormAcik(false)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "transparent", color: "var(--dim)", fontSize: 12 }}>İptal</button>
                </form>
              )}

              {/* Bağlı numara özeti */}
              {satisBotDurum?.bagliNumaraSayisi > 0 && (
                <div className="row gap-8 mb-12" style={{ padding: "10px 16px", borderRadius: 10, background: "rgba(31,111,74,.04)", border: "1px solid rgba(31,111,74,.12)", alignItems: "center" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: "#1f6f4a", boxShadow: "0 0 6px #1f6f4a" }} />
                  <span style={{ color: "#1f6f4a", fontWeight: 600, fontSize: 13 }}>{satisBotDurum.bagliNumaraSayisi} numara bağlı — {satisBotDurum.paralelCalisan > 0 ? `${satisBotDurum.paralelCalisan} numara paralel çalışıyor 🔥` : 'paralel gönderim hazır'}</span>
                  {satisBotDurum?.gunlukGonderim > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dim)" }}>Bugün {satisBotDurum.gunlukGonderim} mesaj</span>}
                </div>
              )}

              {/* Numara listesi */}
              {numaralar.length === 0 ? (
                <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz numara yok. Numara ekleyip bağlayın!</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {numaralar.map(n => {
                    const nRenk = { aktif: "#1f6f4a", bekliyor: "#a8590c", banli: "#b42318", dinleniyor: "#2f56c6" };
                    const nLabel = { aktif: "Aktif", bekliyor: "Bekliyor", banli: "Banlı", dinleniyor: "Dinleniyor" };
                    const nd = (satisBotDurum?.numaraDurumlari || []).find(x => x.numaraId === n.id);
                    const wsBagli = nd?.durum === 'bagli';
                    const wsQr = nd?.durum === 'qr_bekleniyor';
                    return (
                      <div key={n.id} style={{ padding: "14px 16px", borderRadius: 12, background: n.durum === 'banli' ? "rgba(180,35,24,.03)" : wsBagli ? "rgba(31,111,74,.03)" : "var(--bg)", border: `1px solid ${wsBagli ? "rgba(31,111,74,.15)" : n.durum === 'banli' ? "rgba(180,35,24,.12)" : "var(--border)"}` }}>
                        <div className="row gap-10" style={{ alignItems: "center" }}>
                          <div style={{ width: 10, height: 10, borderRadius: 5, background: wsBagli ? "#1f6f4a" : nRenk[n.durum] || "#6f6a62", flexShrink: 0, boxShadow: wsBagli ? "0 0 8px #1f6f4a" : "none" }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="row gap-6" style={{ alignItems: "center", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{n.isim}</span>
                              <span style={{ fontSize: 12, color: "var(--dim)" }}>{n.telefon || "—"}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: wsBagli ? "rgba(31,111,74,.1)" : `${nRenk[n.durum] || "#6f6a62"}15`, color: wsBagli ? "#1f6f4a" : nRenk[n.durum] || "#6f6a62", fontSize: 10, fontWeight: 600 }}>{wsBagli ? "🟢 Bağlı" : wsQr ? "📱 QR Bekliyor" : nLabel[n.durum] || n.durum}</span>
                              {nd?.paralelAktif && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(168,89,12,.1)", color: "#a8590c", fontSize: 10, fontWeight: 600 }}>⚡ Paralel Aktif</span>}
                              {nd?.gunlukGonderim > 0 && <span style={{ fontSize: 10, color: "var(--dim)" }}>bugün {nd.gunlukGonderim} msj</span>}
                              {n.gonderim_sayisi > 0 && !nd?.gunlukGonderim && <span style={{ fontSize: 10, color: "var(--dim)" }}>{n.gonderim_sayisi} msj</span>}
                              {n.ban_tarihi && <span style={{ fontSize: 10, color: "#b42318" }}>Ban: {new Date(n.ban_tarihi).toLocaleDateString("tr-TR")}</span>}
                            </div>
                          </div>
                          <div className="row gap-4" style={{ flexShrink: 0, flexWrap: "wrap" }}>
                            {n.durum === 'aktif' && !wsBagli && !wsQr && (
                              <button onClick={async () => { await api.post("/admin/satis-bot/baslat", { numaraId: n.id }); setTimeout(() => satisBotYukle(), 1000); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#5d4bb5", color: "#fff", fontWeight: 600, fontSize: 11 }}>🔗 Bağla</button>
                            )}
                            {wsBagli && (
                              <button onClick={async () => { await api.post("/admin/satis-bot/durdur", { numaraId: n.id }); setTimeout(() => satisBotYukle(), 500); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.08)", color: "#b42318", fontWeight: 600, fontSize: 11 }}>⏹ Kes</button>
                            )}
                            {n.durum !== 'aktif' && n.durum !== 'banli' && <button onClick={async () => { await api.put(`/admin/satis-bot/numaralar/${n.id}`, { durum: 'aktif' }); numaralariYukle(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(31,111,74,.08)", color: "#1f6f4a", fontWeight: 600, fontSize: 11 }}>Aktif Yap</button>}
                            <button onClick={async () => { const notu = prompt("Ban notu:"); await api.put(`/admin/satis-bot/numaralar/${n.id}`, { durum: 'banli', ban_notu: notu || 'WP ban' }); numaralariYukle(); }} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.06)", color: "#b42318", fontSize: 11 }}>Ban</button>
                            <button onClick={async () => { if (confirm(`"${n.isim}" sil?`)) { await api.del(`/admin/satis-bot/numaralar/${n.id}`); numaralariYukle(); }}} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.04)", color: "var(--dim)", fontSize: 11 }}>✕</button>
                          </div>
                        </div>
                        {/* QR Kodu göster */}
                        {wsQr && nd?.qrBase64 && (
                          <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "#5d4bb5", marginBottom: 8 }}>📱 {n.isim} için QR Kodu — WhatsApp'tan tarayın</div>
                            <img src={nd.qrBase64} alt="QR" style={{ width: 220, height: 220, borderRadius: 12 }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ═══ SıraGO MERKEZ OTP BOT ═══ */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 16, borderLeft: "3px solid #b42318" }}>
              <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>SıraGO Merkez OTP Numaraları</h3>
                  <p style={{ fontSize: 12, color: "var(--dim)", margin: "4px 0 0", maxWidth: 680 }}>
                    Esnaf WhatsApp'ı bağlı değilse / kopuksa bu numaralardan otomatik olarak doğrulama kodu gönderilir.
                    Müşteri yine WhatsApp kodu alır, bypass yok. Birden fazla numara eklenirse round-robin + günlük limit yönetimi devreye girer.
                  </p>
                </div>
                <button onClick={async () => { await api.post("/admin/merkez-otp/numaralar", {}); setTimeout(merkezOtpYukle, 500); }} style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#b42318", color: "#fff", fontWeight: 600, fontSize: 12 }}>+ Yeni Numara</button>
              </div>

              {merkezOtp?.numaralar?.length === 0 ? (
                <div style={{ padding: 16, borderRadius: 10, background: "rgba(180,35,24,.05)", border: "1px dashed rgba(180,35,24,.2)", textAlign: "center", color: "var(--dim)", fontSize: 13 }}>
                  Henüz merkez OTP numarası yok. Yeni bir numara ekleyin ve QR'ı tarayın — esnaf WA'sı yoksa müşteri kodları buradan gidecek.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {merkezOtp.numaralar.map(n => (
                    <div key={n.id} style={{ padding: 14, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>
                            {n.numara || '(henüz numara yok)'} <span style={{ fontSize: 11, fontWeight: 500, color: "var(--dim)" }}>#{n.id}</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>
                            Durum: <strong style={{ color: n.durum === 'bagli' ? '#1f6f4a' : n.durum === 'qr_bekliyor' ? '#a8590c' : '#b42318' }}>{n.durum}</strong>
                            &nbsp;·&nbsp; Bugün: {n.gunluk_gonderim || 0} gönderim
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {n.durum !== 'bagli' && (
                            <button onClick={async () => { await api.post(`/admin/merkez-otp/numaralar/${n.id}/baslat`); setTimeout(merkezOtpYukle, 1500); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "#b42318", color: "#fff", fontWeight: 600, fontSize: 11 }}>Başlat / Yeni QR</button>
                          )}
                          {n.durum === 'bagli' && (
                            <button onClick={async () => { await api.post(`/admin/merkez-otp/numaralar/${n.id}/durdur`); setTimeout(merkezOtpYukle, 500); }} style={{ padding: "5px 12px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.08)", color: "#b42318", fontWeight: 600, fontSize: 11 }}>Durdur</button>
                          )}
                          <button onClick={async () => { if (confirm(`Numara #${n.id} silinsin mi?`)) { await api.del(`/admin/merkez-otp/numaralar/${n.id}`); merkezOtpYukle(); }}} style={{ padding: "5px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.04)", color: "var(--dim)", fontSize: 11 }}>✕</button>
                        </div>
                      </div>
                      {n.durum === 'qr_bekliyor' && n.qr_base64 && (
                        <div style={{ marginTop: 12, padding: 16, borderRadius: 10, background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: "#b42318", marginBottom: 8 }}>📱 QR'ı SıraGO sistem telefonunuzdan WhatsApp Web ile tarayın</div>
                          <img src={n.qr_base64} alt="QR" style={{ width: 220, height: 220, borderRadius: 12 }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ═══ MESAJ ŞABLONLARI ═══ */}
            <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 16 }}>
              <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>Mesaj Şablonları</h3>
                  <p style={{ fontSize: 12, color: "var(--dim)", margin: "4px 0 0" }}>Bot'un kullanacağı mesaj şablonları — performans takibi ve A/B test</p>
                </div>
                <div className="row gap-8">
                  {["liste", "performans"].map(t => (
                    <button key={t} onClick={() => setSablonTab(t)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid " + (sablonTab === t ? "var(--green)" : "var(--border)"), cursor: "pointer", background: sablonTab === t ? "rgba(31,111,74,.08)" : "var(--bg)", color: sablonTab === t ? "var(--green)" : "var(--dim)", fontWeight: 600, fontSize: 12 }}>
                      {t === "liste" ? "📋 Şablonlar" : "📊 Performans"}
                    </button>
                  ))}
                  <button onClick={() => { setSablonDuzenle(null); setYeniSablon({ isim: "", mesaj: "", kategori: "genel", aktif: true, gonderim_modu: "rastgele" }); setSablonFormAcik(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--green)", color: "#fff", fontWeight: 600, fontSize: 12 }}>+ Yeni Şablon</button>
                </div>
              </div>

              {/* Değişkenler Bilgisi */}
              <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(47,86,198,.04)", border: "1px solid rgba(47,86,198,.1)", marginBottom: 16, fontSize: 12, color: "var(--dim)" }}>
                <strong style={{ color: "#2f56c6" }}>Kullanılabilir Değişkenler:</strong> <code>{"{isletme_adi}"}</code> · <code>{"{isletme_sahibi}"}</code> · <code>{"{kategori}"}</code> · <code>{"{telefon}"}</code> · <code>{"{kisisel}"}</code> <span style={{ color: "var(--dim)" }}>(Google puanı/yorum sayısından tek cümle, veri yoksa boş)</span> · <code>{"{puan}"}</code> · <code>{"{yorum_sayisi}"}</code>. İlk mesajın sonuna "dur" satırı otomatik eklenir.
              </div>

              {/* Şablon Form Modal */}
              {sablonFormAcik && (
                <div style={{ padding: "20px", borderRadius: 14, background: "var(--bg)", border: "1px solid var(--border)", marginBottom: 16 }}>
                  <h4 style={{ color: "var(--text)", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{sablonDuzenle ? "✏️ Şablon Düzenle" : "➕ Yeni Şablon"}</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                    <input value={yeniSablon.isim} onChange={e => setYeniSablon({...yeniSablon, isim: e.target.value})} placeholder="Şablon İsmi" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                    <select value={yeniSablon.kategori} onChange={e => setYeniSablon({...yeniSablon, kategori: e.target.value})} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}>
                      <option value="genel">Genel</option>
                      <option value="berber">Berber</option>
                      <option value="kuaför">Kuaför</option>
                      <option value="güzellik salonu">Güzellik Salonu</option>
                      <option value="dövme">Dövme</option>
                      <option value="diş kliniği">Diş Kliniği</option>
                      <option value="veteriner">Veteriner</option>
                      <option value="spa">Spa</option>
                      <option value="diyetisyen">Diyetisyen</option>
                    </select>
                    <select value={yeniSablon.gonderim_modu} onChange={e => setYeniSablon({...yeniSablon, gonderim_modu: e.target.value})} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}>
                      <option value="rastgele">Rastgele</option>
                      <option value="sirasıyla">Sırasıyla</option>
                    </select>
                  </div>
                  <textarea value={yeniSablon.mesaj} onChange={e => setYeniSablon({...yeniSablon, mesaj: e.target.value})} placeholder="Mesaj metni... {isletme_adi}, {isletme_sahibi}, {kategori} değişkenlerini kullanabilirsiniz." rows={5} style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />
                  <div className="row gap-8" style={{ marginTop: 12 }}>
                    <label className="row gap-6" style={{ cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
                      <input type="checkbox" checked={yeniSablon.aktif} onChange={e => setYeniSablon({...yeniSablon, aktif: e.target.checked})} /> Aktif
                    </label>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => { setSablonFormAcik(false); setSablonDuzenle(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>İptal</button>
                    <button onClick={sablonKaydet} disabled={!yeniSablon.isim || !yeniSablon.mesaj} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "var(--green)", color: "#fff", fontWeight: 600, fontSize: 12, opacity: !yeniSablon.isim || !yeniSablon.mesaj ? 0.5 : 1 }}>{sablonDuzenle ? "Güncelle" : "Kaydet"}</button>
                  </div>
                </div>
              )}

              {/* Şablon Listesi */}
              {sablonTab === "liste" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sablonlar.length === 0 ? (
                    <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Henüz şablon eklenmedi. Varsayılan hardcoded şablonlar kullanılacak.</p>
                  ) : sablonlar.map(s => {
                    const donusOrani = s.gonderilen > 0 ? ((s.cevap_gelen / s.gonderilen) * 100).toFixed(1) : 0;
                    const enIyi = s.id === sablonEnIyi;
                    return (
                      <div key={s.id} style={{ padding: "14px 18px", borderRadius: 12, background: enIyi ? "rgba(31,111,74,.04)" : "var(--bg)", border: `1px solid ${enIyi ? "rgba(31,111,74,.2)" : "var(--border)"}`, position: "relative" }}>
                        {enIyi && <div style={{ position: "absolute", top: 8, right: 12, padding: "2px 8px", borderRadius: 6, background: "rgba(31,111,74,.1)", color: "#1f6f4a", fontSize: 10, fontWeight: 600 }}>🏆 En İyi</div>}
                        <div className="row row-between mb-6" style={{ alignItems: "flex-start" }}>
                          <div>
                            <div className="row gap-8" style={{ alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{s.isim}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: s.aktif ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.08)", color: s.aktif ? "#1f6f4a" : "#b42318", fontSize: 10, fontWeight: 600 }}>{s.aktif ? "● Aktif" : "● Pasif"}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(47,86,198,.08)", color: "#2f56c6", fontSize: 10, fontWeight: 600 }}>{s.kategori}</span>
                            </div>
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.5, maxHeight: 60, overflow: "hidden", textOverflow: "ellipsis", marginBottom: 10, whiteSpace: "pre-wrap" }}>{s.mesaj}</div>
                        <div className="row row-between" style={{ alignItems: "center" }}>
                          <div className="row gap-12" style={{ fontSize: 11, color: "var(--dim)" }}>
                            <span>📤 {s.gonderilen}</span>
                            <span>📩 {s.cevap_gelen} <span style={{ color: parseFloat(donusOrani) > 20 ? "#1f6f4a" : parseFloat(donusOrani) > 10 ? "#a8590c" : "#b42318" }}>(%{donusOrani})</span></span>
                            <span style={{ color: "#1f6f4a" }}>👍 {s.olumlu}</span>
                            <span style={{ color: "#b42318" }}>👎 {s.olumsuz}</span>
                          </div>
                          <div className="row gap-6">
                            <button onClick={() => { setSablonDuzenle(s); setYeniSablon({ isim: s.isim, mesaj: s.mesaj, kategori: s.kategori, aktif: s.aktif, gonderim_modu: s.gonderim_modu || "rastgele" }); setSablonFormAcik(true); }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontSize: 11 }}>✏️</button>
                            <button onClick={() => sablonSil(s.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: "rgba(180,35,24,.06)", color: "#b42318", fontSize: 11 }}>🗑️</button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Performans Görünümü */}
              {sablonTab === "performans" && (
                <div>
                  {sablonlar.length === 0 ? (
                    <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Henüz veri yok</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 6px" }}>
                        <thead>
                          <tr style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".5px" }}>
                            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 600 }}>Şablon</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Gönderilen</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Cevap</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Dönüş %</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Olumlu</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Olumsuz</th>
                            <th style={{ textAlign: "center", padding: "8px 12px", fontWeight: 600 }}>Olumlu %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...sablonlar].sort((a, b) => {
                            const oranA = a.gonderilen > 0 ? (a.cevap_gelen / a.gonderilen) : 0;
                            const oranB = b.gonderilen > 0 ? (b.cevap_gelen / b.gonderilen) : 0;
                            return oranB - oranA;
                          }).map(s => {
                            const donusOrani = s.gonderilen > 0 ? ((s.cevap_gelen / s.gonderilen) * 100).toFixed(1) : "0.0";
                            const olumluOrani = s.cevap_gelen > 0 ? ((s.olumlu / s.cevap_gelen) * 100).toFixed(1) : "0.0";
                            const enIyi = s.id === sablonEnIyi;
                            return (
                              <tr key={s.id} style={{ background: enIyi ? "rgba(31,111,74,.04)" : "var(--bg)", borderRadius: 10 }}>
                                <td style={{ padding: "10px 12px", borderRadius: "10px 0 0 10px", fontWeight: 600, fontSize: 13, color: "var(--text)" }}>
                                  {enIyi && <span style={{ marginRight: 6 }}>🏆</span>}{s.isim}
                                  <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 400 }}>{s.kategori}</div>
                                </td>
                                <td style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--text)", padding: "10px 12px" }}>{s.gonderilen}</td>
                                <td style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "var(--text)", padding: "10px 12px" }}>{s.cevap_gelen}</td>
                                <td style={{ textAlign: "center", padding: "10px 12px" }}>
                                  <span style={{ padding: "3px 10px", borderRadius: 8, fontWeight: 600, fontSize: 12, background: parseFloat(donusOrani) > 20 ? "rgba(31,111,74,.1)" : parseFloat(donusOrani) > 10 ? "rgba(168,89,12,.1)" : "rgba(180,35,24,.1)", color: parseFloat(donusOrani) > 20 ? "#1f6f4a" : parseFloat(donusOrani) > 10 ? "#a8590c" : "#b42318" }}>%{donusOrani}</span>
                                </td>
                                <td style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#1f6f4a", padding: "10px 12px" }}>{s.olumlu}</td>
                                <td style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#b42318", padding: "10px 12px" }}>{s.olumsuz}</td>
                                <td style={{ textAlign: "center", padding: "10px 12px", borderRadius: "0 10px 10px 0" }}>
                                  <span style={{ padding: "3px 10px", borderRadius: 8, fontWeight: 600, fontSize: 12, background: parseFloat(olumluOrani) > 30 ? "rgba(31,111,74,.1)" : "rgba(168,89,12,.1)", color: parseFloat(olumluOrani) > 30 ? "#1f6f4a" : "#a8590c" }}>%{olumluOrani}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Anti-Ban & İpuçları */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div style={{ background: "rgba(168,89,12,.04)", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(168,89,12,.12)" }}>
                <div className="row gap-6 mb-8" style={{ alignItems: "center" }}><span style={{ fontWeight: 600, fontSize: 14, color: "#a8590c" }}>Anti-Ban Koruması</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--dim)" }}>
                  <span>• {satisBotDurum?.ayarlar?.minBekleme || 8}-{satisBotDurum?.ayarlar?.maxBekleme || 15} dk rastgele bekleme</span>
                  <span>• Günlük max {satisBotDurum?.ayarlar?.gunlukLimit || 50} mesaj</span>
                  <span>• Mesai: {satisBotDurum?.ayarlar?.mesaiBaslangic || 9}:00 — {satisBotDurum?.ayarlar?.mesaiBitis || 19}:00</span>
                  <span>• "Yazıyor..." simülasyonu</span>
                  <span>• 3 farklı mesaj varyasyonu</span>
                  <span>• Her numara paralel gönderim (bağımsız loop)</span>
                  <span>• WP numara kontrol — geçersiz numara skip</span>
                </div>
              </div>
              <div style={{ background: "rgba(93,75,181,.04)", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(93,75,181,.12)" }}>
                <div className="row gap-6 mb-8" style={{ alignItems: "center" }}><span style={{ fontWeight: 600, fontSize: 14, color: "#5d4bb5" }}>Numara İpuçları</span></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--dim)" }}>
                  <span>• En az 3 numara kayıtlı tut</span>
                  <span>• 2-3 günde bir numarayı dinlendir</span>
                  <span>• Banlı numarayı 2-4 hafta dinlendir</span>
                  <span>• Günlük limiti 30 altında tut</span>
                  <span>• Yeni numarayı 1-2 gün normal kullan</span>
                </div>
              </div>
            </div>
            </>}

            {/* ─── TAB: KAMPANYALAR ─── */}
            {satisAnaTab === "kampanyalar" && <>
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 16 }}>
                <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>Sektöre Özel Kampanyalar</h3>
                    <p style={{ fontSize: 12, color: "var(--dim)", margin: "4px 0 0" }}>Her sektöre özel mesaj, gün ve saat ayarı — A/B test ile dönüşüm takibi</p>
                  </div>
                  <div className="row gap-8">
                    <button onClick={kampanyalariYukle} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄</button>
                    <button onClick={() => { setKampanyaDuzenle(null); setYeniKampanya({ isim: "", kategori: "", aktif: true, oncelik: 5, min_skor: 0, mesai_baslangic: 10, mesai_bitis: 18, gunler: "{1,2,3,4,5}", gunluk_limit: 20 }); setKampanyaFormAcik(true); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#25d366", color: "#fff", fontWeight: 600, fontSize: 12 }}>+ Yeni Kampanya</button>
                  </div>
                </div>

                {/* Kampanya Form Modal */}
                {kampanyaFormAcik && (
                  <div style={{ padding: "20px", borderRadius: 14, background: "var(--bg)", border: "1px solid var(--border)", marginBottom: 16 }}>
                    <h4 style={{ color: "var(--text)", fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{kampanyaDuzenle ? "✏️ Kampanya Düzenle" : "➕ Yeni Kampanya"}</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <input value={yeniKampanya.isim} onChange={e => setYeniKampanya({...yeniKampanya, isim: e.target.value})} placeholder="Kampanya İsmi" style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      <select value={yeniKampanya.kategori} onChange={e => setYeniKampanya({...yeniKampanya, kategori: e.target.value})} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }}>
                        <option value="">Kategori Seç</option>
                        {["berber","kuaför","güzellik salonu","dövme","diş kliniği","veteriner","spa","tırnak salonu","diyetisyen","cilt bakım","pilates","yoga","masaj","fizik tedavi","psikolog"].map(k => <option key={k} value={k}>{k.charAt(0).toUpperCase() + k.slice(1)}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Öncelik (0-10)</label>
                        <input type="number" min="0" max="10" value={yeniKampanya.oncelik} onChange={e => setYeniKampanya({...yeniKampanya, oncelik: parseInt(e.target.value)||0})} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Min. Skor</label>
                        <input type="number" min="0" value={yeniKampanya.min_skor} onChange={e => setYeniKampanya({...yeniKampanya, min_skor: parseInt(e.target.value)||0})} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Mesai Başlangıç</label>
                        <input type="number" min="6" max="22" value={yeniKampanya.mesai_baslangic} onChange={e => setYeniKampanya({...yeniKampanya, mesai_baslangic: parseInt(e.target.value)||10})} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Mesai Bitiş</label>
                        <input type="number" min="6" max="22" value={yeniKampanya.mesai_bitis} onChange={e => setYeniKampanya({...yeniKampanya, mesai_bitis: parseInt(e.target.value)||18})} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Günlük Limit</label>
                        <input type="number" min="1" max="100" value={yeniKampanya.gunluk_limit} onChange={e => setYeniKampanya({...yeniKampanya, gunluk_limit: parseInt(e.target.value)||20})} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, display: "block", marginBottom: 4 }}>Gönderim Günleri</label>
                        <div className="row gap-4" style={{ flexWrap: "wrap" }}>
                          {[{v:1,l:"Pzt"},{v:2,l:"Sal"},{v:3,l:"Çar"},{v:4,l:"Per"},{v:5,l:"Cum"},{v:6,l:"Cmt"},{v:7,l:"Paz"}].map(g => {
                            const gunArr = (yeniKampanya.gunler || "").replace(/[{}]/g, "").split(",").map(Number).filter(Boolean);
                            const secili = gunArr.includes(g.v);
                            return <button key={g.v} onClick={() => {
                              const yeni = secili ? gunArr.filter(x => x !== g.v) : [...gunArr, g.v];
                              setYeniKampanya({...yeniKampanya, gunler: `{${yeni.sort().join(",")}}`});
                            }} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid " + (secili ? "#25d366" : "var(--border)"), cursor: "pointer", background: secili ? "rgba(37,211,102,.1)" : "var(--surface)", color: secili ? "#25d366" : "var(--dim)", fontWeight: 600, fontSize: 11 }}>{g.l}</button>;
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="row gap-8" style={{ marginTop: 12 }}>
                      <label className="row gap-6" style={{ cursor: "pointer", fontSize: 13, color: "var(--text)" }}>
                        <input type="checkbox" checked={yeniKampanya.aktif} onChange={e => setYeniKampanya({...yeniKampanya, aktif: e.target.checked})} /> Aktif
                      </label>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => { setKampanyaFormAcik(false); setKampanyaDuzenle(null); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>İptal</button>
                      <button onClick={kampanyaKaydet} disabled={!yeniKampanya.isim || !yeniKampanya.kategori} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", background: "#25d366", color: "#fff", fontWeight: 600, fontSize: 12, opacity: !yeniKampanya.isim || !yeniKampanya.kategori ? 0.5 : 1 }}>{kampanyaDuzenle ? "Güncelle" : "Kaydet"}</button>
                    </div>
                  </div>
                )}

                {/* Kampanya Listesi */}
                {kampanyalar.length === 0 ? (
                  <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Henüz kampanya oluşturulmadı. Deploy sonrası otomatik seed edilecek.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {kampanyalar.map(k => {
                      const gunMap = {1:"Pzt",2:"Sal",3:"Çar",4:"Per",5:"Cum",6:"Cmt",7:"Paz"};
                      const gunler = (k.gunler || []).map(g => gunMap[g] || g).join(", ");
                      const donusOrani = k.gonderilen > 0 ? ((k.cevap_gelen / k.gonderilen) * 100).toFixed(1) : "0.0";
                      return (
                        <div key={k.id} style={{ padding: "16px 20px", borderRadius: 14, background: k.aktif ? "var(--bg)" : "rgba(0,0,0,.02)", border: "1px solid " + (k.aktif ? "var(--border)" : "rgba(0,0,0,.05)"), opacity: k.aktif ? 1 : 0.6 }}>
                          <div className="row row-between" style={{ alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <div className="row gap-8" style={{ alignItems: "center", marginBottom: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{k.isim}</span>
                                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(47,86,198,.08)", color: "#2f56c6", fontSize: 10, fontWeight: 600 }}>{k.kategori}</span>
                                <span style={{ padding: "2px 8px", borderRadius: 6, background: k.aktif ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.08)", color: k.aktif ? "#1f6f4a" : "#b42318", fontSize: 10, fontWeight: 600 }}>{k.aktif ? "Aktif" : "Pasif"}</span>
                                <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontSize: 10, fontWeight: 600 }}>Öncelik: {k.oncelik}</span>
                              </div>
                              <div className="row gap-12" style={{ fontSize: 11, color: "var(--dim)" }}>
                                <span>📅 {gunler}</span>
                                <span>⏰ {k.mesai_baslangic}:00-{k.mesai_bitis}:00</span>
                                <span>🎯 Min Skor: {k.min_skor}</span>
                                <span>📨 Limit: {k.gunluk_limit}/gün</span>
                                <span>📝 {k.sablon_sayisi} şablon</span>
                                <span>👥 {k.bekleyen_lead} bekleyen lead</span>
                              </div>
                              <div className="row gap-12" style={{ marginTop: 8, fontSize: 12 }}>
                                <span style={{ color: "var(--text)", fontWeight: 600 }}>📊 Gönderilen: {k.gonderilen}</span>
                                <span style={{ color: "#2f56c6", fontWeight: 600 }}>💬 Cevap: {k.cevap_gelen}</span>
                                <span style={{ color: "#1f6f4a", fontWeight: 600 }}>✅ Olumlu: {k.olumlu}</span>
                                <span style={{ padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: parseFloat(donusOrani) > 15 ? "rgba(31,111,74,.1)" : parseFloat(donusOrani) > 5 ? "rgba(168,89,12,.1)" : "rgba(180,35,24,.06)", color: parseFloat(donusOrani) > 15 ? "#1f6f4a" : parseFloat(donusOrani) > 5 ? "#a8590c" : "#b42318" }}>%{donusOrani} dönüş</span>
                              </div>
                            </div>
                            <div className="row gap-6">
                              <button onClick={() => { setKampanyaDuzenle(k); setYeniKampanya({ isim: k.isim, kategori: k.kategori, aktif: k.aktif, oncelik: k.oncelik, min_skor: k.min_skor, mesai_baslangic: k.mesai_baslangic, mesai_bitis: k.mesai_bitis, gunler: `{${(k.gunler||[]).join(",")}}`, gunluk_limit: k.gunluk_limit }); setKampanyaFormAcik(true); }} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--surface)", color: "var(--dim)", fontWeight: 600, fontSize: 11 }}>✏️</button>
                              <button onClick={() => kampanyaSil(k.id)} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(180,35,24,.2)", cursor: "pointer", background: "rgba(180,35,24,.04)", color: "#b42318", fontWeight: 600, fontSize: 11 }}>🗑️</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>}

            {/* ─── TAB: KATEGORİ DAĞILIMI ─── */}
            {satisAnaTab === "dagilim" && <>
              <div style={{ background: "var(--surface)", borderRadius: 16, padding: "24px", border: "1px solid var(--border)", marginBottom: 16 }}>
                <div className="row row-between mb-16" style={{ alignItems: "center" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "var(--text)", margin: 0 }}>Lead Kategori Dağılımı</h3>
                    <p style={{ fontSize: 12, color: "var(--dim)", margin: "4px 0 0" }}>Tüm lead'lerin sektör bazlı analizi — hangi kategoride ne kadar data var</p>
                  </div>
                  <button onClick={kategoriDagiliminiYukle} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer", background: "var(--bg)", color: "var(--dim)", fontWeight: 600, fontSize: 12 }}>🔄</button>
                </div>

                {/* Özet Kartları */}
                {kategoriDagilimi?.toplamlar && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
                    {[
                      {l:"Toplam Lead", v: kategoriDagilimi.toplamlar.toplam, c:"#2f56c6", bg:"rgba(47,86,198,.06)"},
                      {l:"Bekleyen", v: kategoriDagilimi.toplamlar.bekleyen, c:"#a8590c", bg:"rgba(168,89,12,.06)"},
                      {l:"Gönderilen", v: kategoriDagilimi.toplamlar.gonderilen, c:"#5d4bb5", bg:"rgba(93,75,181,.06)"},
                      {l:"WP Yok", v: kategoriDagilimi.toplamlar.wp_yok, c:"#b42318", bg:"rgba(180,35,24,.06)"},
                      {l:"Müşteri Oldu", v: kategoriDagilimi.toplamlar.musteri, c:"#1f6f4a", bg:"rgba(31,111,74,.06)"},
                    ].map((s,i) => (
                      <div key={i} style={{ background: s.bg, borderRadius: 12, padding: "14px 16px", textAlign: "center", border: `1px solid ${s.c}15` }}>
                        <div style={{ fontSize: 22, fontWeight: 600, color: s.c }}>{s.v?.toLocaleString()}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", fontWeight: 600, marginTop: 2 }}>{s.l}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Kategori Tablosu */}
                {kategoriDagilimi?.dagilim?.length > 0 ? (
                  <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "var(--bg)" }}>
                          <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Kategori</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Toplam</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Bekleyen</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Gönderilen</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>WP Yok</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Müşteri</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Ort. Skor</th>
                          <th style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "var(--text)", fontSize: 12 }}>Kampanya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {kategoriDagilimi.dagilim.map((d,i) => {
                          const kampanya = kampanyalar.find(k => k.kategori.toLowerCase() === d.kategori);
                          return (
                            <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                              <td style={{ padding: "10px 14px", fontWeight: 600, color: "var(--text)", textTransform: "capitalize" }}>{d.kategori}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#2f56c6" }}>{parseInt(d.toplam).toLocaleString()}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#a8590c" }}>{parseInt(d.bekleyen).toLocaleString()}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#5d4bb5" }}>{parseInt(d.gonderilen).toLocaleString()}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#b42318" }}>{parseInt(d.wp_yok).toLocaleString()}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center", fontWeight: 600, color: "#1f6f4a" }}>{parseInt(d.musteri)}</td>
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                <span style={{ padding: "2px 8px", borderRadius: 6, fontWeight: 600, fontSize: 11, background: parseFloat(d.ort_skor) >= 80 ? "rgba(31,111,74,.1)" : parseFloat(d.ort_skor) >= 50 ? "rgba(168,89,12,.1)" : "rgba(180,35,24,.06)", color: parseFloat(d.ort_skor) >= 80 ? "#1f6f4a" : parseFloat(d.ort_skor) >= 50 ? "#a8590c" : "#b42318" }}>{d.ort_skor}</span>
                              </td>
                              <td style={{ padding: "10px 14px", textAlign: "center" }}>
                                {kampanya ? (
                                  <span style={{ padding: "2px 8px", borderRadius: 6, background: kampanya.aktif ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.08)", color: kampanya.aktif ? "#1f6f4a" : "#b42318", fontSize: 10, fontWeight: 600 }}>{kampanya.aktif ? "✅ Aktif" : "⏸ Pasif"}</span>
                                ) : (
                                  <span style={{ fontSize: 10, color: "var(--dim)" }}>—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p style={{ color: "var(--dim)", fontSize: 13, textAlign: "center", padding: 20 }}>Henüz lead verisi yok.</p>
                )}
              </div>
            </>}

          </>
        )}

      </div>

      {/* ═══════ İŞLETME DETAY MODAL ═══════ */}
      {detayIsletme && (() => {
        const d = detayIsletme;
        const isl = d.isletme || {};
        const denemeBitti = d.deneme_suresi_kalan <= 0;
        const paketRenk = { baslangic: "#2f56c6", profesyonel: "#5d4bb5", proplus: "#1f6f4a", kurumsal: "#a8590c" };
        const durumRenk = { odendi: "#1f6f4a", bekliyor: "#a8590c", gecikti: "#b42318", havale_bekliyor: "#2f56c6", deneme: "#5d4bb5" };
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex" }}>
            <div onClick={() => setDetayIsletme(null)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)" }} />
            <div style={{ position: "relative", marginLeft: "auto", width: "min(780px, 90vw)", height: "100vh", background: "var(--surface)", overflowY: "auto", boxShadow: "-8px 0 40px rgba(0,0,0,.15)" }}>

              {/* Header */}
              <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--surface)", borderBottom: "1px solid var(--border)", padding: "18px 24px" }}>
                <div className="row row-between" style={{ alignItems: "center" }}>
                  <div className="row gap-10" style={{ alignItems: "center" }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: `${paketRenk[isl.paket] || "#6f6a62"}`, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 600, fontSize: 18 }}>{(isl.isim || "?")[0]}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 18, color: "var(--text)" }}>{isl.isim}</div>
                      <div className="row gap-6" style={{ marginTop: 2 }}>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: `${paketRenk[isl.paket] || "#6f6a62"}15`, color: paketRenk[isl.paket] || "#6f6a62", fontSize: 11, fontWeight: 600 }}>{(isl.paket || "—").toUpperCase()}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 6, background: isl.aktif ? "rgba(31,111,74,.1)" : "rgba(180,35,24,.1)", color: isl.aktif ? "#1f6f4a" : "#b42318", fontSize: 11, fontWeight: 600 }}>{isl.aktif ? "● Aktif" : "● Pasif"}</span>
                        {d.deneme_suresi_kalan > 0 && <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(93,75,181,.1)", color: "#5d4bb5", fontSize: 11, fontWeight: 600 }}>🧪 {d.deneme_suresi_kalan} gün deneme</span>}
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
                        { icon: "👥", label: "Müşteri", val: parseInt(d.musteri_sayisi) || 0, color: "#2f56c6" },
                        { icon: "📅", label: "Randevu (Toplam)", val: parseInt(d.randevu_stats?.toplam) || 0, color: "#5d4bb5" },
                        { icon: "📆", label: "Bu Ay Randevu", val: parseInt(d.randevu_stats?.bu_ay) || 0, color: "#1f6f4a" },
                        { icon: "👨‍💼", label: "Çalışan", val: (d.calisanlar || []).length, color: "#a8590c" },
                        { icon: "🛠️", label: "Hizmet", val: (d.hizmetler || []).length, color: "#b42318" },
                        { icon: "📅", label: "Kayıt Günü", val: `${d.olusturma_gun || 0}. gün`, color: "#6f6a62" }
                      ].map((s, i) => (
                        <div key={i} style={{ background: `${s.color}08`, border: `1px solid ${s.color}12`, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
                          <div style={{ fontSize: 20, marginBottom: 4 }}>{s.icon}</div>
                          <div style={{ fontSize: 22, fontWeight: 600, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* İşletme Bilgileri */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "18px 20px", marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 12 }}>📋 İşletme Bilgileri</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 20px", fontSize: 13 }}>
                        <div><span style={{ color: "var(--dim)" }}>Telefon:</span> <strong style={{ color: "var(--text)" }}>{isl.telefon || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Email:</span> <strong style={{ color: "var(--text)" }}>{(d.kullanici || [])[0]?.email || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Adres:</span> <strong style={{ color: "var(--text)" }}>{isl.adres || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Kategori:</span> <strong style={{ color: "var(--text)" }}>{isl.kategori || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Kayıt:</span> <strong style={{ color: "var(--text)" }}>{isl.olusturma_tarihi ? new Date(isl.olusturma_tarihi).toLocaleDateString("tr-TR") : "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Slug:</span> <strong style={{ color: "var(--text)" }}>{isl.slug || "—"}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Paket:</span> <strong style={{ color: paketRenk[isl.paket] || "var(--text)" }}>{(isl.paket || "—").toUpperCase()}</strong></div>
                        <div><span style={{ color: "var(--dim)" }}>Durum:</span> <strong style={{ color: isl.aktif ? "#1f6f4a" : "#b42318" }}>{isl.aktif ? "Aktif" : "Pasif"}</strong></div>
                      </div>
                    </div>

                    {/* Deneme Süresi */}
                    <div style={{ background: d.deneme_suresi_kalan > 0 ? "rgba(93,75,181,.06)" : "rgba(111,106,98,.06)", borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: d.deneme_suresi_kalan > 0 ? "1px solid rgba(93,75,181,.12)" : "1px solid var(--border)" }}>
                      <div className="row row-between" style={{ alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>🧪 Deneme Süresi</div>
                          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>
                            {d.deneme_suresi_kalan > 0 ? `${d.deneme_suresi_kalan} gün kaldı` : `Deneme süresi bitmiş (${d.olusturma_gun || 0} gün önce kayıt)`}
                          </div>
                        </div>
                        <div className="row gap-4">
                          {[3,7,14,30].map(g => (
                            <button key={g} onClick={async () => { await api.post(`/admin/isletmeler/${isl.id}/deneme-uzat`, { gun: g }); isletmeDetayYukle(isl.id); }} style={{ padding: "6px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontWeight: 600, fontSize: 11 }}>+{g} gün</button>
                          ))}
                        </div>
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 10, height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${Math.min((d.deneme_suresi_kalan / 7) * 100, 100)}%`, background: d.deneme_suresi_kalan > 3 ? "#5d4bb5" : d.deneme_suresi_kalan > 0 ? "#a8590c" : "#b42318", borderRadius: 3, transition: "width .3s" }} />
                      </div>
                    </div>

                    {/* Admin Notu */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px", marginBottom: 16 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 8 }}>📝 Admin Notu</div>
                      <textarea value={detayNot} onChange={e => setDetayNot(e.target.value)} placeholder="Bu işletme hakkında notlarınız..." rows={3} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, resize: "vertical", fontFamily: "inherit" }} />
                      <button onClick={async () => { await api.put(`/admin/isletmeler/${isl.id}/not`, { not: detayNot }); alert("Not kaydedildi"); }} style={{ marginTop: 8, padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12 }}>💾 Notu Kaydet</button>
                    </div>

                    {/* Demo Veri */}
                    <div style={{ background: "rgba(168,89,12,.04)", borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: "1px solid rgba(168,89,12,.12)" }}>
                      <div className="row row-between" style={{ alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>🧪 Demo Veri</div>
                          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>Çalışan, hizmet, müşteri ve randevu demo verisi ekle</div>
                        </div>
                        <button onClick={async () => { if (!confirm("Bu işletmeye demo veri basılacak. Emin misiniz?")) return; const r = await api.post(`/admin/isletmeler/${isl.id}/demo-veri`); alert(r.mesaj || r.hata || "Tamamlandı"); isletmeDetayYukle(isl.id); }} style={{ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", background: "#a8590c", color: "#fff", fontWeight: 600, fontSize: 12, boxShadow: "none" }}>🚀 Demo Veri Bas</button>
                      </div>
                    </div>

                    {/* Bot Durumu */}
                    <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 8 }}>🤖 Bot & Entegrasyon</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>WhatsApp Bot:</span> <span style={{ color: d.bot_durum ? "#1f6f4a" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum ? "✅ Kurulu" : "— Yok"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Hatırlatma:</span> <span style={{ color: d.bot_durum?.hatirlatma_aktif ? "#1f6f4a" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.hatirlatma_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Kampanya:</span> <span style={{ color: d.bot_durum?.kampanya_aktif ? "#1f6f4a" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.kampanya_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                        <div className="row gap-6"><span style={{ color: "var(--dim)" }}>Google Yorum:</span> <span style={{ color: d.bot_durum?.google_yorum_aktif ? "#1f6f4a" : "var(--dim)", fontWeight: 600 }}>{d.bot_durum?.google_yorum_aktif ? "✅ Aktif" : "— Kapalı"}</span></div>
                      </div>
                    </div>
                  </>
                )}

                {/* ===== ÖDEMELER TAB ===== */}
                {detayTab === "odemeler" && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>💳 Ödeme Geçmişi</div>
                    {(d.odemeler || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 30, color: "var(--dim)" }}><p>Henüz ödeme kaydı yok</p></div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(d.odemeler || []).map((o, i) => (
                          <div key={i} className="row gap-12" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ width: 8, height: 8, borderRadius: 4, background: durumRenk[o.durum] || "#6f6a62", flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div className="row gap-6" style={{ alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{o.donem}</span>
                                <span style={{ padding: "1px 8px", borderRadius: 6, background: `${durumRenk[o.durum] || "#6f6a62"}15`, color: durumRenk[o.durum] || "#6f6a62", fontSize: 10, fontWeight: 600 }}>{o.durum}</span>
                              </div>
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{o.tutar}₺</span>
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
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>📅 Randevu İstatistikleri</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 20 }}>
                      {[
                        { label: "Toplam", val: d.randevu_stats?.toplam || 0, color: "#5d4bb5" },
                        { label: "Bu Ay", val: d.randevu_stats?.bu_ay || 0, color: "#2f56c6" },
                        { label: "Onaylanan", val: d.randevu_stats?.onaylanan || 0, color: "#1f6f4a" },
                        { label: "Bekleyen", val: d.randevu_stats?.bekleyen || 0, color: "#a8590c" },
                        { label: "İptal", val: d.randevu_stats?.iptal || 0, color: "#b42318" }
                      ].map((s, i) => (
                        <div key={i} style={{ background: `${s.color}08`, borderRadius: 12, padding: "14px 12px", textAlign: "center", border: `1px solid ${s.color}12` }}>
                          <div style={{ fontSize: 26, fontWeight: 600, color: s.color }}>{s.val}</div>
                          <div style={{ fontSize: 10, color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>

                    {/* Son 30 gün grafiği (basit bar) */}
                    {(d.gunluk_randevu || []).length > 0 && (
                      <div style={{ background: "var(--bg)", borderRadius: 14, padding: "16px 20px" }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)", marginBottom: 12 }}>📈 Son 30 Gün</div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                          {(d.gunluk_randevu || []).map((g, i) => {
                            const maxVal = Math.max(...(d.gunluk_randevu || []).map(x => parseInt(x.sayi) || 0), 1);
                            const h = Math.max(((parseInt(g.sayi) || 0) / maxVal) * 100, 4);
                            return (
                              <div key={i} title={`${g.gun}: ${g.sayi} randevu`} style={{ flex: 1, minWidth: 0, height: `${h}%`, background: "#5d4bb5", borderRadius: "3px 3px 0 0", cursor: "pointer", transition: "all .15s" }} />
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
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 12 }}>👥 Çalışanlar ({(d.calisanlar || []).length})</div>
                    {(d.calisanlar || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz çalışan eklenmemiş</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
                        {(d.calisanlar || []).map(c => (
                          <div key={c.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ width: 36, height: 36, borderRadius: 10, background: "#5d4bb5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 14 }}>{(c.isim || "?")[0]}</div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{c.isim}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)" }}>{c.uzmanlik || "—"}</div>
                            </div>
                            <span style={{ padding: "2px 8px", borderRadius: 6, background: c.aktif !== false ? "rgba(31,111,74,.08)" : "rgba(180,35,24,.08)", color: c.aktif !== false ? "#1f6f4a" : "#b42318", fontSize: 10, fontWeight: 600 }}>{c.aktif !== false ? "Aktif" : "Pasif"}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Hizmetler */}
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 12 }}>🛠️ Hizmetler ({(d.hizmetler || []).length})</div>
                    {(d.hizmetler || []).length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "var(--dim)", fontSize: 13 }}>Henüz hizmet eklenmemiş</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {(d.hizmetler || []).map(h => (
                          <div key={h.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{h.isim}</div>
                              <div style={{ fontSize: 11, color: "var(--dim)" }}>{h.sure || "—"} dk</div>
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 14, color: "#1f6f4a" }}>{h.fiyat || 0}₺</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Kullanıcılar */}
                    {(d.kullanici || []).length > 0 && (
                      <>
                        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 12, marginTop: 24 }}>🔑 Admin Kullanıcılar</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {(d.kullanici || []).map(k => (
                            <div key={k.id} className="row gap-10" style={{ padding: "12px 14px", borderRadius: 10, background: "var(--bg)", alignItems: "center" }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{k.email}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 6, background: "rgba(93,75,181,.08)", color: "#5d4bb5", fontSize: 10, fontWeight: 600 }}>{k.rol}</span>
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
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>⚙️ İşletme Ayarları</div>
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
                        <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 12, marginTop: 24 }}>🤖 Bot Ayarları</div>
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
                    <div style={{ fontWeight: 600, fontSize: 16, color: "var(--text)", marginBottom: 16 }}>🔧 İşletme İşlemleri</div>

                    {/* Hızlı İşlemler */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                      {/* Aktif/Pasif Toggle */}
                      <button onClick={async () => { await api.put(`/admin/isletmeler/${isl.id}`, { aktif: !isl.aktif }); isletmeDetayYukle(isl.id); isletmeleriYukle(); }} style={{ padding: "18px 20px", borderRadius: 14, border: "none", cursor: "pointer", background: isl.aktif ? "rgba(180,35,24,.06)" : "rgba(31,111,74,.06)", textAlign: "left" }}>
                        <div style={{ fontSize: 24, marginBottom: 6 }}>{isl.aktif ? "🔴" : "🟢"}</div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: isl.aktif ? "#b42318" : "#1f6f4a" }}>{isl.aktif ? "Pasife Al" : "Aktif Et"}</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İşletmeyi {isl.aktif ? "devre dışı bırak" : "tekrar aktif et"}</div>
                      </button>

                      {/* Paket Değiştir */}
                      <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(93,75,181,.06)" }}>
                        
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#5d4bb5", marginBottom: 6 }}>Paket Değiştir</div>
                        <select defaultValue={isl.paket || ""} onChange={async (e) => { await api.put(`/admin/isletmeler/${isl.id}`, { paket: e.target.value }); isletmeDetayYukle(isl.id); isletmeleriYukle(); }} style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 13, fontWeight: 600 }}>
                          <option value="baslangic">Başlangıç</option>
                          <option value="profesyonel">Profesyonel</option>
                          <option value="proplus">Pro+</option>
                          <option value="kurumsal">Kurumsal</option>
                        </select>
                      </div>

                      {/* Deneme Uzat */}
                      <div style={{ padding: "18px 20px", borderRadius: 14, background: "rgba(47,86,198,.06)" }}>
                        
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#2f56c6", marginBottom: 6 }}>Deneme Uzat</div>
                        <div className="row gap-4" style={{ flexWrap: "wrap" }}>
                          {[3,7,14,30].map(g => (
                            <button key={g} onClick={async () => { await api.post(`/admin/isletmeler/${isl.id}/deneme-uzat`, { gun: g }); isletmeDetayYukle(isl.id); }} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#2f56c6", color: "#fff", fontWeight: 600, fontSize: 12 }}>+{g} gün</button>
                          ))}
                        </div>
                      </div>

                      {/* Müşteri Olarak Giriş */}
                      <button onClick={async () => { const res = await api.post(`/admin/impersonate/${isl.id}`); if (res.token) { localStorage.setItem("randevugo_impersonate_token", res.token); window.open(`${window.location.origin}?impersonate=1`, '_blank'); } else { alert(res.hata || "Impersonate başarısız"); }}} style={{ padding: "18px 20px", borderRadius: 14, border: "none", cursor: "pointer", background: "rgba(168,89,12,.06)", textAlign: "left" }}>
                        
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#a8590c" }}>Müşteri Olarak Giriş</div>
                        <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>İşletmenin panelini gör</div>
                      </button>
                    </div>

                    {/* Tehlikeli İşlemler */}
                    <div style={{ background: "rgba(180,35,24,.04)", borderRadius: 14, padding: "18px 20px", border: "1px solid rgba(180,35,24,.1)" }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#b42318", marginBottom: 12 }}>⚠️ Tehlikeli İşlemler</div>
                      <button onClick={async () => { if (!confirm(`"${isl.isim}" işletmesi kalıcı olarak silinecek! Emin misiniz?`)) return; if (!confirm("BU İŞLEM GERİ ALINAMAZ! Son kez onaylıyor musunuz?")) return; await api.del(`/admin/isletmeler/${isl.id}`); setDetayIsletme(null); isletmeleriYukle(); }} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid rgba(180,35,24,.2)", cursor: "pointer", background: "rgba(180,35,24,.08)", color: "#b42318", fontWeight: 600, fontSize: 13 }}>🗑️ İşletmeyi Kalıcı Sil</button>
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
    // Impersonate desteği: ?impersonate=1 ile gelen sekme
    const params = new URLSearchParams(window.location.search);
    if (params.get("impersonate") === "1") {
      const impToken = localStorage.getItem("randevugo_impersonate_token");
      if (impToken) {
        sessionStorage.setItem("randevugo_imp_token", impToken);
        api.token = impToken;
        localStorage.removeItem("randevugo_impersonate_token");
        window.history.replaceState({}, "", window.location.pathname);
      }
    }

    const token = api.token;
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

  // Kullanıcı set olunca Socket.IO bağlantısı kur (canlı panel için)
  useEffect(() => {
    if (kullanici) {
      const token = api.token;
      if (token) socketConnect(token);
    }
    return () => { /* app unmount: */ };
  }, [kullanici]);

  if (yukleniyor) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0e14" }}>
      <div style={{ color: "rgba(255,255,255,.6)", fontSize: 18, fontWeight: 600 }}>SıraGO yükleniyor...</div>
    </div>
  );

  if (!kullanici) return <Login onLogin={setKullanici} />;
  if (kullanici.rol === "superadmin") return <SuperAdminPanel kullanici={kullanici} />;
  if (sessionStorage.getItem("randevugo_imp_token")) {
    // Müşteri olarak giriş sekmesi: görünür uyarı + çıkış (oturum yalnız bu sekmede)
    return (<>
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 10000, background: "#a8590c", color: "#000", padding: "6px 12px", fontSize: 13, fontWeight: 600, textAlign: "center" }}>
        👤 Müşteri olarak görüntülüyorsunuz: {kullanici.isletme_isim || kullanici.email}{" "}
        <button onClick={() => { sessionStorage.removeItem("randevugo_imp_token"); window.close(); window.location.reload(); }} style={{ marginLeft: 8, padding: "2px 10px", borderRadius: 6, border: "none", cursor: "pointer", fontWeight: 600 }}>Çıkış</button>
      </div>
      <Dashboard kullanici={kullanici} />
    </>);
  }
  return <Dashboard kullanici={kullanici} />;
}
