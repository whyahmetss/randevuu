import { useEffect, useState } from 'react';
import { kart, dugme, RENK } from './ortak';
import HesapAc from './HesapAc';
import { kucult } from '../Mobil/RandevuSayfam';

// Ziyaret hazırla (kullanıcı kararı 2026-10-29): dükkâna gitmeden önce Google'dan bul (aday listesinde olmasa da),
// gerçek bilgileriyle demo sayfasını aç, 2-3 dakikada kişiselleştir. Dükkânda esnaf kendi sayfasını görür;
// kabul ederse "Hesabını aç" demoyu onun gerçek hesabına çevirir (hazırlanan her şey kalır).
const KATEGORILER = ['berber', 'kuaför', 'güzellik salonu', 'tırnak salonu', 'spa', 'dövme', 'diş kliniği', 'veteriner', 'diyetisyen'];
const yildiz = (p, y) => (p ? `★ ${String(p).replace('.', ',')}${y ? ` (${y} yorum)` : ''}` : 'Google puanı yok');

export default function ZiyaretHazirla({ api, onKapat }) {
  const [girdi, setGirdi] = useState('');
  const [adaylar, setAdaylar] = useState(null);
  const [son, setSon] = useState([]);
  const [kategori, setKategori] = useState({});    // place_id → seçilen kategori
  const [bekle, setBekle] = useState(null);
  const [hata, setHata] = useState(null);
  const [acikId, setAcikId] = useState(null);      // hazırlanan demo işletme

  useEffect(() => { api.get('/admin/ziyaret/son').then(d => setSon(d?.liste || [])).catch(() => {}); }, [acikId]);

  const ara = async (e) => {
    e?.preventDefault();
    if (!girdi.trim()) return;
    setBekle('ara'); setHata(null);
    const d = await api.post('/admin/ziyaret/ara', { girdi });
    setBekle(null);
    if (d?.hata) return setHata(d.hata);
    setAdaylar(d.adaylar || []);
  };
  const hazirla = async (a) => {
    setBekle(a.place_id); setHata(null);
    const d = await api.post('/admin/ziyaret/hazirla', { place_id: a.place_id, kategori: kategori[a.place_id] || a.kategori || null });
    setBekle(null);
    if (d?.hata) return setHata(d.hata);
    setAcikId(d.isletme_id);
  };

  return (
    <div onClick={onKapat} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div onClick={e => e.stopPropagation()} style={{ ...kart, width: '100%', maxWidth: 720 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <b style={{ fontSize: 17, color: 'var(--text)' }}>🧭 Ziyaret hazırla</b>
          <button onClick={onKapat} style={{ ...dugme(RENK.gri), padding: '4px 10px' }} aria-label="Kapat">✕</button>
        </div>

        {acikId ? <Hazirlik api={api} id={acikId} geri={() => setAcikId(null)} /> : (
          <>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 10 }}>
              Gitmeden önce dükkânın sayfasını hazırla: Google Maps linkini yapıştır ya da işletme adı + ilçe yaz. Listende olmasa da bulunur.
            </div>
            <form onSubmit={ara} style={{ display: 'flex', gap: 8 }}>
              <input className="input" value={girdi} onChange={e => setGirdi(e.target.value)} placeholder="Villa Barber Başakşehir  ya da  maps.app.goo.gl/…" style={{ flex: 1, minWidth: 0 }} autoFocus />
              <button type="submit" disabled={bekle === 'ara'} style={dugme(RENK.yesil, true)}>{bekle === 'ara' ? 'Aranıyor…' : 'Bul'}</button>
            </form>
            {hata && <div className="alert alert-error" style={{ marginTop: 10 }}>{hata}</div>}

            {adaylar && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {adaylar.length === 0 && <div style={{ color: 'var(--dim)', fontSize: 13 }}>Bulunamadı. Adı farklı yazmayı ya da ilçe eklemeyi dene.</div>}
                {adaylar.map(a => (
                  <div key={a.place_id} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', opacity: a.kapandi ? .55 : 1 }}>
                    <div style={{ fontWeight: 700, color: 'var(--text)' }}>{a.isim}{a.kapandi ? ' · kalıcı olarak kapanmış' : ''}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)', margin: '2px 0 8px' }}>{a.adres}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--muted)' }}>
                      <span>{yildiz(a.puan, a.yorum)}</span>
                      {a.telefon && <span>· {a.telefon}</span>}
                      <div style={{ flex: 1 }} />
                      {a.demo_isletme_id
                        ? <button onClick={() => setAcikId(a.demo_isletme_id)} style={dugme(RENK.mor, true)}>Hazır — aç</button>
                        : <>
                            <select className="input" value={kategori[a.place_id] ?? a.kategori ?? ''} onChange={e => setKategori(k => ({ ...k, [a.place_id]: e.target.value }))}
                              style={{ height: 34, padding: '0 8px', fontSize: 13 }} title="Örnek hizmetler bu kategoriye göre gelir">
                              <option value="">Kategori?</option>
                              {KATEGORILER.map(k => <option key={k} value={k}>{k}</option>)}
                            </select>
                            <button disabled={!!bekle || a.kapandi} onClick={() => hazirla(a)} style={dugme(RENK.yesil, true)}>{bekle === a.place_id ? 'Hazırlanıyor…' : 'Hazırla'}</button>
                          </>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {son.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Son hazırladıkların (hesabı açılmamış)</div>
                {son.map(s => (
                  <button key={s.id} onClick={() => setAcikId(s.id)} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '8px 10px', border: 'none', borderTop: '1px solid var(--border)', background: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--text)', fontSize: 13 }}>
                    <span>{s.isim}{s.ilce ? ` · ${s.ilce}` : ''}</span>
                    <span style={{ color: 'var(--dim)' }}>{s.demo_goruntulenme ? `👀 ${s.demo_goruntulenme} kez açıldı` : new Date(s.olusturma_tarihi).toLocaleDateString('tr-TR')}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Hazırlık: kontrol listesi, hizmet/fiyat, logo/kapak, tasarım, link + QR, dükkânda hesap aç ──
function Hazirlik({ api, id, geri }) {
  const [d, setD] = useState(null);
  const [hizmetler, setHizmetler] = useState([]);
  const [isim, setIsim] = useState('');
  const [tanitim, setTanitim] = useState('');
  const [tasarimlar, setTasarimlar] = useState([]);
  const [bekle, setBekle] = useState(null);
  const [mesaj, setMesaj] = useState(null);
  const [hesap, setHesap] = useState(false);

  const yukle = async () => {
    const x = await api.get(`/admin/ziyaret/${id}`);
    if (x?.hata) return setMesaj({ hata: x.hata });
    setD(x); setHizmetler(x.hizmetler.map(h => ({ ...h, fiyat: Number(h.fiyat) || '' }))); setIsim(x.isletme.isim); setTanitim(x.isletme.tanitim || '');
  };
  useEffect(() => { yukle(); api.get('/admin/tasarimlar').then(t => setTasarimlar((t?.tasarimlar || []).filter(x => x.aktif))).catch(() => {}); }, [id]);
  const bildir = (m) => { setMesaj(m); setTimeout(() => setMesaj(null), 2500); };

  if (!d) return mesaj?.hata ? <div className="alert alert-error">{mesaj.hata}</div> : <div style={{ color: 'var(--dim)' }}>Yükleniyor…</div>;
  const k = d.kontrol;

  const hizmetKaydet = async () => {
    setBekle('hizmet');
    const x = await api.put(`/admin/ziyaret/${id}/hizmetler`, { hizmetler });
    setBekle(null);
    if (x?.hata) return bildir({ hata: x.hata });
    await yukle(); bildir({ tamam: 'Hizmetler kaydedildi' });
  };
  const bilgiKaydet = async () => {
    setBekle('bilgi');
    const x = await api.put(`/admin/ziyaret/${id}/bilgi`, { isim, tanitim });
    setBekle(null);
    if (x?.hata) return bildir({ hata: x.hata });
    await yukle(); bildir({ tamam: 'Kaydedildi' });
  };
  const gorsel = async (tur, dosya) => {
    if (!dosya) return;
    setBekle(tur);
    try {
      const x = await api.put(`/admin/ziyaret/${id}/gorsel`, { tur, veri: await kucult(dosya, tur) });
      if (x?.hata) bildir({ hata: x.hata }); else { await yukle(); bildir({ tamam: tur === 'logo' ? 'Logo yüklendi' : 'Kapak yüklendi' }); }
    } catch (e) { bildir({ hata: e.message }); }
    setBekle(null);
  };
  const tasarimVer = async (tid) => {
    if (!tid) return;
    setBekle('tasarim');
    const x = await api.post(`/admin/tasarimlar/${tid}/hediye`, { isletme_id: id, uygula: true });
    setBekle(null);
    if (x?.hata) return bildir({ hata: x.hata });
    await yukle(); bildir({ tamam: 'Tasarım sayfasında açıldı' });
  };
  const setH = (i, alan, v) => setHizmetler(l => l.map((h, j) => (j === i ? { ...h, [alan]: v } : h)));

  const madde = (tamam, ad) => (
    <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: tamam ? 'rgba(31,111,74,.1)' : 'rgba(168,89,12,.1)', color: tamam ? RENK.yesil : RENK.amber }}>
      {tamam ? '✓' : '○'} {ad}
    </span>
  );
  const bolum = { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 };
  const etiket = { fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 };

  return (
    <div>
      <button onClick={geri} style={{ ...dugme(RENK.gri), padding: '4px 10px', marginBottom: 10 }}>← Aramaya dön</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 170px', gap: 16 }} className="settings-grid-2">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{d.isletme.isim}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>{[d.isletme.adres, d.isletme.ilce].filter(Boolean).join(' · ')}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>🕐 {d.isletme.saatler}</div>
          {/* Ziyaret notu: konuşmada kullanılacak gerçek bilgi */}
          <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 8, padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
            📝 {yildiz(d.lead?.puan, d.lead?.yorum_sayisi)}{d.lead?.telefon ? ` · ${d.lead.telefon}` : ''}
            {d.isletme.goruntulenme > 0 && ` · sayfası ${d.isletme.goruntulenme} kez açıldı`}
            {d.lead?.google_maps_url && <> · <a href={d.lead.google_maps_url} target="_blank" rel="noreferrer" style={{ color: RENK.mavi }}>Google'da gör</a></>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {madde(k.logo, 'Logo')}{madde(k.kapak, 'Kapak')}{madde(k.fiyat, 'Fiyatlar')}{madde(k.tasarim, 'Tasarım')}{madde(k.telefon, 'Telefon')}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <img src={d.qr} alt="Sayfa QR kodu" style={{ width: 150, height: 150, borderRadius: 10, background: '#fff' }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 6 }}>
            <a href={d.link} target="_blank" rel="noreferrer" style={{ ...dugme(RENK.mavi), textDecoration: 'none', padding: '4px 10px' }}>Sayfayı aç</a>
            <button onClick={() => { navigator.clipboard?.writeText(d.link); bildir({ tamam: 'Link kopyalandı' }); }} style={{ ...dugme(RENK.gri), padding: '4px 10px' }}>Kopyala</button>
          </div>
        </div>
      </div>
      {mesaj && <div className={`alert ${mesaj.hata ? 'alert-error' : 'alert-success'}`} style={{ marginTop: 10 }}>{mesaj.hata || mesaj.tamam}</div>}

      <div style={bolum}>
        <div style={etiket}>Ad ve kısa tanıtım</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" value={isim} onChange={e => setIsim(e.target.value)} maxLength={100} style={{ flex: '1 1 200px' }} />
          <input className="input" value={tanitim} onChange={e => setTanitim(e.target.value)} maxLength={300} placeholder="Ör: 2015'ten beri Başakşehir'de" style={{ flex: '2 1 260px' }} />
          <button onClick={bilgiKaydet} disabled={bekle === 'bilgi'} style={dugme(RENK.yesil)}>Kaydet</button>
        </div>
      </div>

      <div style={bolum}>
        <div style={etiket}>Hizmetler ve fiyatlar <span style={{ fontWeight: 400, color: 'var(--dim)' }}>(fiyat boşsa sayfada "fiyat dükkânda")</span></div>
        {hizmetler.filter(h => !h.sil).length === 0 && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Hizmet yok.</div>}
        {hizmetler.map((h, i) => !h.sil && (
          <div key={h.id || `y${i}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 90px 32px', gap: 6, marginBottom: 6 }}>
            <input className="input" value={h.isim} onChange={e => setH(i, 'isim', e.target.value)} placeholder="Hizmet" />
            <input className="input" type="number" min="5" value={h.sure_dk} onChange={e => setH(i, 'sure_dk', e.target.value)} title="Süre (dk)" />
            <input className="input" type="number" min="0" value={h.fiyat} onChange={e => setH(i, 'fiyat', e.target.value)} placeholder="₺" />
            <button onClick={() => setH(i, 'sil', true)} aria-label="Sil" style={{ border: 'none', background: 'none', color: RENK.kirmizi, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setHizmetler(l => [...l, { isim: '', sure_dk: 30, fiyat: '' }])} style={dugme(RENK.gri)}>+ Hizmet</button>
          <button onClick={hizmetKaydet} disabled={bekle === 'hizmet'} style={dugme(RENK.yesil, true)}>{bekle === 'hizmet' ? 'Kaydediliyor…' : 'Hizmetleri kaydet'}</button>
        </div>
      </div>

      <div style={bolum}>
        <div style={etiket}>Logo ve kapak <span style={{ fontWeight: 400, color: 'var(--dim)' }}>(Instagram'ından ya da kendi çektiğin foto — Google fotoğrafı kullanma)</span></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['logo', 'kapak'].map(tur => (
            <label key={tur} style={{ ...dugme(k[tur] ? RENK.yesil : RENK.amber), cursor: 'pointer' }}>
              {bekle === tur ? 'Yükleniyor…' : `${k[tur] ? '✓ ' : ''}${tur === 'logo' ? 'Logo' : 'Kapak'} ${k[tur] ? 'değiştir' : 'yükle'}`}
              <input type="file" accept="image/*" hidden onChange={e => { gorsel(tur, e.target.files[0]); e.target.value = ''; }} />
            </label>
          ))}
        </div>
      </div>

      {tasarimlar.length > 0 && (
        <div style={bolum}>
          <div style={etiket}>Tasarım hediye et {d.tasarim && <span style={{ fontWeight: 400, color: RENK.yesil }}>· şu an: {d.tasarim.isim}</span>}</div>
          <select className="input" value="" disabled={bekle === 'tasarim'} onChange={e => tasarimVer(e.target.value)} style={{ maxWidth: 320 }}>
            <option value="">{bekle === 'tasarim' ? 'Uygulanıyor…' : 'Tasarım seç…'}</option>
            {tasarimlar.map(t => <option key={t.id} value={t.id}>{t.isim}{t.fiyat > 0 ? ` (${t.fiyat}₺)` : ' (ücretsiz)'}</option>)}
          </select>
        </div>
      )}

      <div style={{ ...bolum, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--dim)', maxWidth: 380 }}>Dükkânda: sayfasını telefonundan göster. Kabul ederse hesabını aç; hazırladığın her şey onun hesabında kalır.</div>
        <button onClick={() => setHesap(true)} style={dugme(RENK.yesil, true)}>🏪 Dükkânda hesabını aç</button>
      </div>
      {hesap && <HesapAc api={api} aday={{ id: d.lead?.id, isletme_adi: d.isletme.isim, telefon: d.lead?.telefon || d.isletme.telefon || '', kategori: d.lead?.kategori || '' }}
        onKapat={() => setHesap(false)} onAcildi={() => { setHesap(false); geri(); }} />}
    </div>
  );
}
