import { useEffect, useState } from 'react';
import { TasarimOnizleme } from '../Mobil/OzelTasarimlar';

// Sayfa tasarımları (2026-10-29): video/görsel arka planlı randevu sayfası tasarımları. Fiyat tek seferlik (0 = ücretsiz).
// "Hediye et" işletmeye tasarımı verir, istenirse sayfasında hemen açar.
const BOS = { isim: '', aciklama: '', fiyat: 0, sira: 0, aktif: true, stil: { mod: 'koyu', vurgu: '#2fd27a', karartma: 0.45, yazi: 'sans', buton: 'yuvarlak', kart: 'cam' } };
const ETIKET = {
  mod: { koyu: 'Koyu', acik: 'Açık' }, yazi: { sans: 'Modern', serif: 'Klasik (serif)', mono: 'Daktilo (mono)' },
  buton: { yuvarlak: 'Yuvarlak', kare: 'Köşeli', yirtik: 'Yırtık kenar' }, kart: { cam: 'Buzlu cam', duz: 'Düz' },
};
const SINIR = { video: 6, gorsel: 3, poster: 1 };   // MB

const dosyaOku = (f) => new Promise((ok, red) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => red(new Error('Dosya okunamadı')); r.readAsDataURL(f); });

export default function TasarimMagazasi({ api, isletmeler = [] }) {
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(null);          // null | { ...tasarım }
  const [hediye, setHediye] = useState(null);      // null | tasarım
  const [bekle, setBekle] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [toplam, setToplam] = useState(null);   // { adet, ciro } — ödenen tasarım satışları

  const yukle = () => api.get('/admin/tasarimlar').then(d => { setListe(d?.tasarimlar || []); setToplam(d?.satis_toplam || null); }).catch(() => setListe([]));
  useEffect(() => { yukle(); }, []);
  const bildir = (m) => { setMesaj(m); setTimeout(() => setMesaj(null), 3500); };

  const kaydet = async () => {
    if (!form.isim.trim()) return bildir({ hata: 'Tasarım adı zorunlu' });
    setBekle('kaydet');
    const d = form.id ? await api.put(`/admin/tasarimlar/${form.id}`, form) : await api.post('/admin/tasarimlar', form);
    setBekle(null);
    if (d?.hata) return bildir({ hata: d.hata });
    setForm(f => ({ ...f, id: d.id })); yukle(); bildir({ tamam: 'Kaydedildi' });
  };
  const medya = async (tur, dosya) => {
    if (!form?.id) return bildir({ hata: 'Önce tasarımı kaydedin, sonra medya yükleyin' });
    if (dosya) {
      const video = dosya.type.startsWith('video/');
      const mb = tur === 'poster' ? SINIR.poster : video ? SINIR.video : SINIR.gorsel;
      if (dosya.size > mb * 1048576) return bildir({ hata: `Dosya en fazla ${mb} MB olmalı (bu ${(dosya.size / 1048576).toFixed(1)} MB)` });
    }
    setBekle(tur);
    const d = await api.put(`/admin/tasarimlar/${form.id}/medya/${tur}`, { veri: dosya ? await dosyaOku(dosya) : null });
    setBekle(null);
    if (d?.hata) return bildir({ hata: d.hata });
    const yeni = (await api.get('/admin/tasarimlar'))?.tasarimlar || [];
    setListe(yeni); setForm(f => ({ ...f, medya: yeni.find(x => x.id === f.id)?.medya || {} }));
    bildir({ tamam: dosya ? 'Yüklendi' : 'Kaldırıldı' });
  };
  const sil = async (t) => {
    if (!window.confirm(`"${t.isim}" silinsin mi?${t.sahipler?.length ? `\n\n${t.sahipler.length} işletmede var; onların sayfası düz görünüme döner.` : ''}`)) return;
    await api.delete(`/admin/tasarimlar/${t.id}`); yukle();
  };
  const geriAl = async (t, s) => {
    if (!window.confirm(`${s.isim} işletmesinden "${t.isim}" geri alınsın mı?`)) return;
    await api.delete(`/admin/tasarimlar/${t.id}/hediye/${s.id}`); yukle();
  };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setStil = (k, v) => setForm(f => ({ ...f, stil: { ...f.stil, [k]: v } }));

  if (!liste) return <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>;
  const secim = (k) => (
    <div>
      <label className="form-label">{{ mod: 'Görünüm', yazi: 'Yazı tipi', buton: 'Buton', kart: 'Kartlar' }[k]}</label>
      <select value={form.stil[k]} onChange={e => setStil(k, e.target.value)} className="input">
        {Object.entries(ETIKET[k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <div className="row row-between row-wrap mb-16" style={{ alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--dim)', maxWidth: 620 }}>
          Randevu sayfası için video ya da görsel arka planlı tasarımlar. Fiyat tek seferlik, 0 = ücretsiz (her esnaf kullanabilir).
          Esnaf ücretli tasarımı panelinden Shopier ile alır; ödeme gelince tasarım onun olur ve sayfasında açılır.
          Video: 5–15 sn döngü, sessiz, 720p, en fazla 6 MB. Yalnız lisansı serbest görüntü kullanın (Pexels, Mixkit ya da kendi çekiminiz).
        </div>
        <div className="row gap-12" style={{ alignItems: 'center' }}>
          {toplam?.adet > 0 && <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>💳 {toplam.adet} satış · {Number(toplam.ciro).toLocaleString('tr-TR')}₺</div>}
          <button onClick={() => setForm({ ...BOS, medya: {} })} className="btn btn-primary btn-sm">+ Yeni tasarım</button>
        </div>
      </div>
      {mesaj && <div className={`alert ${mesaj.hata ? 'alert-error' : 'alert-success'}`} style={{ marginBottom: 12 }}>{mesaj.hata || mesaj.tamam}</div>}

      {form && (
        <div className="form-card card-accent-green" style={{ marginBottom: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 220px', gap: 18 }} className="settings-grid-2">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, alignContent: 'start' }}>
              <div><label className="form-label">Ad *</label><input value={form.isim} maxLength={60} onChange={e => set('isim', e.target.value)} className="input" placeholder="Gece Berber" /></div>
              <div><label className="form-label">Fiyat (₺, tek seferlik)</label><input type="number" min="0" value={form.fiyat} onChange={e => set('fiyat', e.target.value)} className="input" /></div>
              <div><label className="form-label">Sıra</label><input type="number" value={form.sira} onChange={e => set('sira', e.target.value)} className="input" /></div>
              <div style={{ gridColumn: '1 / -1' }}><label className="form-label">Kısa açıklama</label><input value={form.aciklama} maxLength={200} onChange={e => set('aciklama', e.target.value)} className="input" placeholder="Siyah-beyaz video, klasik yazı" /></div>
              {secim('mod')}{secim('yazi')}{secim('buton')}{secim('kart')}
              <div><label className="form-label">Vurgu rengi</label><input type="color" value={form.stil.vurgu} onChange={e => setStil('vurgu', e.target.value)} className="input" style={{ padding: 4, height: 40 }} /></div>
              <div><label className="form-label">Karartma: %{Math.round(form.stil.karartma * 100)}</label><input type="range" min="0" max="0.85" step="0.05" value={form.stil.karartma} onChange={e => setStil('karartma', Number(e.target.value))} style={{ width: '100%' }} /></div>
              <label className="row gap-8" style={{ alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.aktif} onChange={e => set('aktif', e.target.checked)} /> Esnaflara görünsün</label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="btn btn-ghost btn-sm" style={{ cursor: form.id ? 'pointer' : 'not-allowed', opacity: form.id ? 1 : .5 }}>
                  {bekle === 'arka' ? 'Yükleniyor…' : form.medya?.arka ? '🎞 Arka planı değiştir' : '🎞 Arka plan yükle (video/görsel)'}
                  <input type="file" hidden disabled={!form.id} accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif" onChange={e => { medya('arka', e.target.files[0]); e.target.value = ''; }} />
                </label>
                {form.medya?.arka && <button onClick={() => medya('arka', null)} className="btn btn-ghost btn-sm">Arka planı kaldır</button>}
                <label className="btn btn-ghost btn-sm" style={{ cursor: form.id ? 'pointer' : 'not-allowed', opacity: form.id ? 1 : .5 }}>
                  {bekle === 'poster' ? 'Yükleniyor…' : form.medya?.poster ? '🖼 Posteri değiştir' : '🖼 Poster (videonun ilk karesi)'}
                  <input type="file" hidden disabled={!form.id} accept="image/jpeg,image/png,image/webp" onChange={e => { medya('poster', e.target.files[0]); e.target.value = ''; }} />
                </label>
                {!form.id && <span style={{ fontSize: 12, color: 'var(--dim)' }}>Medya için önce kaydedin.</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 6 }}>Önizleme</div>
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' }}><TasarimOnizleme t={form} yukseklik={300} /></div>
            </div>
          </div>
          <div className="row gap-8" style={{ marginTop: 14 }}>
            <button onClick={kaydet} disabled={bekle === 'kaydet'} className="btn btn-primary btn-sm">{bekle === 'kaydet' ? 'Kaydediliyor…' : 'Kaydet'}</button>
            <button onClick={() => setForm(null)} className="btn btn-ghost btn-sm">Kapat</button>
          </div>
        </div>
      )}

      {liste.length === 0 && !form && <div className="list-empty"><p>Henüz tasarım yok. "+ Yeni tasarım" ile ekleyin.</p></div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
        {liste.map(t => (
          <div key={t.id} style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface)', opacity: t.aktif ? 1 : .6 }}>
            <TasarimOnizleme t={t} yukseklik={160} />
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row row-between" style={{ alignItems: 'center' }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>{t.isim}{!t.aktif && <span style={{ fontSize: 11, color: 'var(--dim)' }}> · gizli</span>}</div>
                <div style={{ fontWeight: 700, color: t.fiyat > 0 ? 'var(--text)' : '#1f6f4a' }}>{t.fiyat > 0 ? `${Number(t.fiyat).toLocaleString('tr-TR')}₺` : 'Ücretsiz'}</div>
              </div>
              {t.aciklama && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{t.aciklama}</div>}
              {t.satis?.adet > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: '#1f6f4a' }}>💳 {t.satis.adet} satış · {Number(t.satis.ciro).toLocaleString('tr-TR')}₺</div>}
              {t.sahipler?.length > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {t.sahipler.map(s => (
                    <div key={s.id} className="row row-between" style={{ alignItems: 'center', gap: 6 }}>
                      <span>{s.kaynak === 'hediye' ? '🎁' : '💳'} {s.isim}{s.kullaniyor ? ' · kullanıyor' : ''}</span>
                      <button onClick={() => geriAl(t, s)} style={{ border: 'none', background: 'none', color: '#b42318', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>geri al</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="row gap-6 row-wrap">
                <button onClick={() => setHediye(t)} className="btn btn-primary btn-sm">🎁 Hediye et</button>
                <button onClick={() => { setForm({ ...t }); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="btn btn-ghost btn-sm">Düzenle</button>
                <button onClick={() => sil(t)} className="btn btn-ghost btn-sm" style={{ color: '#b42318' }}>Sil</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {hediye && <HediyePenceresi api={api} tasarim={hediye} isletmeler={isletmeler} kapat={() => setHediye(null)} tamam={(m) => { setHediye(null); yukle(); bildir({ tamam: m }); }} />}
    </div>
  );
}

function HediyePenceresi({ api, tasarim, isletmeler, kapat, tamam }) {
  const [ara, setAra] = useState('');
  const [secili, setSecili] = useState(null);
  const [uygula, setUygula] = useState(true);
  const [bekle, setBekle] = useState(false);
  const sahip = new Set((tasarim.sahipler || []).map(s => s.id));
  const q = ara.trim().toLocaleLowerCase('tr');
  const aday = isletmeler.filter(i => !q || String(i.isim || '').toLocaleLowerCase('tr').includes(q)).slice(0, 40);
  const gonder = async () => {
    setBekle(true);
    const d = await api.post(`/admin/tasarimlar/${tasarim.id}/hediye`, { isletme_id: secili.id, uygula });
    setBekle(false);
    if (d?.hata) return alert(d.hata);
    tamam(d.mesaj);
  };
  return (
    <div onClick={kapat} className="modal-overlay">
      <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 460 }}>
        <div className="modal-header"><h2>🎁 "{tasarim.isim}" hediye et</h2><button onClick={kapat} className="modal-close">✕</button></div>
        <input value={ara} onChange={e => setAra(e.target.value)} placeholder="İşletme ara…" className="input" autoFocus />
        <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 8, border: '1px solid var(--border)', borderRadius: 10 }}>
          {aday.map(i => (
            <button key={i.id} onClick={() => setSecili(i)} disabled={sahip.has(i.id)}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)', cursor: sahip.has(i.id) ? 'default' : 'pointer',
                background: secili?.id === i.id ? 'rgba(31,111,74,.1)' : 'transparent', color: sahip.has(i.id) ? 'var(--dim)' : 'var(--text)', fontFamily: 'inherit', fontSize: 14 }}>
              {secili?.id === i.id ? '✓ ' : ''}{i.isim}{sahip.has(i.id) ? ' · zaten var' : ''}
            </button>
          ))}
          {aday.length === 0 && <div style={{ padding: 12, color: 'var(--dim)', fontSize: 13 }}>İşletme bulunamadı</div>}
        </div>
        <label className="row gap-8" style={{ alignItems: 'center', fontSize: 13, marginTop: 12 }}>
          <input type="checkbox" checked={uygula} onChange={e => setUygula(e.target.checked)} /> Sayfasında hemen aç
        </label>
        <button onClick={gonder} disabled={!secili || bekle} className="btn btn-primary btn-block" style={{ marginTop: 12 }}>
          {bekle ? 'Gönderiliyor…' : secili ? `${secili.isim} işletmesine hediye et` : 'İşletme seçin'}
        </button>
      </div>
    </div>
  );
}
