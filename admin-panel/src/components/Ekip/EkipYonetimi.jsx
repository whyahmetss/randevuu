import { useState, useEffect } from 'react';

// Süper admin → Ekip (yalnız kurucu): üye ekle, görev ver, yetki alanlarını ince ayarla, hesabı kapat.
// Yetki sunucuda her istekte kontrol edilir (config/ekip.js); bu sayfa yalnız ayarlar.
const tarih = (t) => (t ? new Date(t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'hiç girmedi');
const BOS = { isim: '', email: '', sifre: '', gorev: 'satis' };
const geciciSifre = () => {
  const h = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const d = new Uint32Array(12); crypto.getRandomValues(d);
  return Array.from(d, x => h[x % h.length]).join('');
};

export default function EkipYonetimi({ api }) {
  const [veri, setVeri] = useState(null);
  const [form, setForm] = useState(null);      // yeni üye
  const [duzen, setDuzen] = useState(null);    // { uye, gorev, yetkiler, sifre }
  const [mesaj, setMesaj] = useState(null);
  const [kaydediliyor, setKaydediliyor] = useState(false);

  const yukle = () => api.get('/admin/ekip').then(d => setVeri(d?.hata ? { hata: d.hata } : d));
  useEffect(() => { yukle(); }, []);

  const bildir = (d, basari) => {
    setMesaj(d?.hata ? { tip: 'error', metin: d.hata } : { tip: 'success', metin: basari });
    setTimeout(() => setMesaj(null), 5000);
  };

  const ekle = async () => {
    setKaydediliyor(true);
    const d = await api.post('/admin/ekip', form);
    setKaydediliyor(false);
    if (d?.hata) return bildir(d);
    bildir(d, `${form.isim} eklendi. Giriş: ${form.email} · geçici şifre: ${form.sifre} — ilk girişte değiştirmesini söyleyin.`);
    setForm(null); yukle();
  };

  const kaydet = async (degisiklik, basari) => {
    setKaydediliyor(true);
    const d = await api.put(`/admin/ekip/${duzen?.uye.id ?? degisiklik.id}`, degisiklik);
    setKaydediliyor(false);
    bildir(d, basari);
    if (!d?.hata) { setDuzen(null); yukle(); }
  };

  if (!veri) return <div className="list-empty">Yükleniyor…</div>;
  if (veri.hata) return <div className="alert alert-error">{veri.hata}</div>;
  const { ekip, yetkiler, gorevler } = veri;
  const gorevAd = (u) => (u.kurucu ? gorevler.kurucu.ad : gorevler[u.ekip_gorev]?.ad || u.ekip_gorev || '—');

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--dim)', maxWidth: 620, lineHeight: 1.6 }}>
          Her ekip üyesi kendi e-postasıyla girer ve yalnız görevinin bölümlerini görür. Yetki her işlemde sunucuda kontrol edilir;
          bir hesabı kapattığınızda açık oturumu da hemen düşer. Ekip ve işlem kaydı (Audit Log) yalnız kurucudadır.
        </div>
        <button className="btn btn-primary" onClick={() => setForm({ ...BOS, sifre: geciciSifre() })}>Ekip üyesi ekle</button>
      </div>

      {mesaj && <div className={`alert alert-${mesaj.tip}`} style={{ marginBottom: 14, wordBreak: 'break-word' }}>{mesaj.metin}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 12 }}>
        {ekip.map(u => (
          <div key={u.id} className="card" style={{ padding: 16, opacity: u.aktif ? 1 : 0.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{u.isim || u.email}{u.ben && <span style={{ color: 'var(--dim)', fontWeight: 400 }}> · siz</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email}</div>
              </div>
              <span className={`tag tag-sm ${u.kurucu ? 'tag-amber' : u.aktif ? 'tag-green' : ''}`}>{u.aktif ? gorevAd(u) : 'Kapalı'}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {u.kurucu
                ? <span style={{ fontSize: 12, color: 'var(--dim)' }}>Tüm bölümler + ekip yönetimi</span>
                : (u.ekip_yetkileri || []).map(y => <span key={y} className="pill pill-xs" title={yetkiler[y]}>{yetkiler[y]?.split(/[ (:]/)[0] || y}</span>)}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 'auto' }}>Son giriş: {tarih(u.son_giris)}</div>
            {!u.ben && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => setDuzen({ uye: u, gorev: u.kurucu ? 'kurucu' : (u.ekip_gorev || 'destek'), yetkiler: u.ekip_yetkileri || [], sifre: '' })}>Düzenle</button>
                <button className={`btn btn-sm ${u.aktif ? 'btn-ghost' : 'btn-secondary'}`}
                  onClick={() => { if (!u.aktif || window.confirm(`${u.isim || u.email} hesabı kapatılsın mı? Açık oturumu hemen düşer.`)) kaydet({ id: u.id, aktif: !u.aktif }, u.aktif ? 'Hesap kapatıldı' : 'Hesap açıldı'); }}>
                  {u.aktif ? 'Hesabı kapat' : 'Yeniden aç'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Görev rehberi */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 10 }}>Görevler ve gördükleri</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {Object.entries(gorevler).map(([k, g]) => (
            <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 180px) 1fr', gap: 12, fontSize: 13, alignItems: 'baseline' }}>
              <b>{g.ad}</b>
              <span style={{ color: 'var(--dim)' }}>{g.yetkiler ? g.yetkiler.map(y => yetkiler[y]).join(' · ') : 'Her şey; ekip yönetimi, işlem kaydı ve işletme silme yalnız burada.'}</span>
            </div>
          ))}
        </div>
      </div>

      {form && (
        <div onClick={() => setForm(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header"><h2 style={{ fontSize: 16 }}>Yeni ekip üyesi</h2><button onClick={() => setForm(null)} className="modal-close">✕</button></div>
            <div style={{ padding: '16px 20px 20px' }}>
              <div className="form-group"><label className="form-label">İsim</label><input className="input" value={form.isim} onChange={e => setForm({ ...form, isim: e.target.value })} /></div>
              <div className="form-group"><label className="form-label">E-posta (giriş için)</label><input className="input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-group">
                <label className="form-label">Geçici şifre</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="input" value={form.sifre} onChange={e => setForm({ ...form, sifre: e.target.value })} style={{ fontFamily: 'ui-monospace, monospace' }} />
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => setForm({ ...form, sifre: geciciSifre() })}>Yenile</button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Görev</label>
                <div style={{ display: 'grid', gap: 6 }}>
                  {Object.entries(gorevler).map(([k, g]) => (
                    <label key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      border: `1px solid ${form.gorev === k ? 'var(--accent, #1f6f4a)' : 'var(--border)'}` }}>
                      <input type="radio" name="gorev" checked={form.gorev === k} onChange={() => setForm({ ...form, gorev: k })} style={{ marginTop: 3 }} />
                      <span><b style={{ fontSize: 13 }}>{g.ad}</b><br /><span style={{ fontSize: 12, color: 'var(--dim)' }}>
                        {g.yetkiler ? g.yetkiler.filter(y => y !== 'genel').map(y => yetkiler[y]?.split(':')[0].split(' (')[0]).join(' · ') : 'Tam yetki — ortak/yönetici için'}
                      </span></span>
                    </label>
                  ))}
                </div>
              </div>
              <button className="btn btn-primary btn-block" disabled={kaydediliyor || !form.isim || !form.email || form.sifre.length < 8} onClick={ekle}>
                {kaydediliyor ? 'Ekleniyor…' : 'Ekle'}
              </button>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Şifreyi kişiye kendiniz iletin (WhatsApp/telefon). Şifre e-postayla gönderilmez.</div>
            </div>
          </div>
        </div>
      )}

      {duzen && (
        <div onClick={() => setDuzen(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header"><h2 style={{ fontSize: 16 }}>{duzen.uye.isim || duzen.uye.email}</h2><button onClick={() => setDuzen(null)} className="modal-close">✕</button></div>
            <div style={{ padding: '16px 20px 20px' }}>
              <div className="form-group">
                <label className="form-label">Görev</label>
                <select className="input" value={duzen.gorev}
                  onChange={e => setDuzen({ ...duzen, gorev: e.target.value, yetkiler: gorevler[e.target.value].yetkiler || [] })}>
                  {Object.entries(gorevler).map(([k, g]) => <option key={k} value={k}>{g.ad}</option>)}
                </select>
              </div>
              {duzen.gorev !== 'kurucu' && (
                <div className="form-group">
                  <label className="form-label">Bölümler (göreve göre gelir, tek tek değiştirilebilir)</label>
                  <div style={{ display: 'grid', gap: 4 }}>
                    {Object.entries(yetkiler).map(([k, ad]) => (
                      <label key={k} style={{ display: 'flex', gap: 8, fontSize: 13, alignItems: 'flex-start', opacity: k === 'genel' ? 0.6 : 1 }}>
                        <input type="checkbox" disabled={k === 'genel'} checked={k === 'genel' || duzen.yetkiler.includes(k)} style={{ marginTop: 3 }}
                          onChange={e => setDuzen({ ...duzen, yetkiler: e.target.checked ? [...duzen.yetkiler, k] : duzen.yetkiler.filter(y => y !== k) })} />
                        <span>{ad}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="form-group">
                <label className="form-label">Yeni şifre (boş bırakılırsa değişmez)</label>
                <input className="input" value={duzen.sifre} placeholder="en az 8 karakter" onChange={e => setDuzen({ ...duzen, sifre: e.target.value })} style={{ fontFamily: 'ui-monospace, monospace' }} />
              </div>
              <button className="btn btn-primary btn-block" disabled={kaydediliyor || (duzen.sifre && duzen.sifre.length < 8)}
                onClick={() => kaydet({ gorev: duzen.gorev, yetkiler: duzen.gorev === 'kurucu' ? undefined : duzen.yetkiler, ...(duzen.sifre ? { sifre: duzen.sifre } : {}) },
                  duzen.sifre ? `Kaydedildi. Yeni şifre: ${duzen.sifre}` : 'Kaydedildi')}>
                {kaydediliyor ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
