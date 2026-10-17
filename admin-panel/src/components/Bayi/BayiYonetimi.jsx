import { useCallback, useEffect, useState } from 'react';
import { kart, dugme, RENK, waTel } from '../Satis/ortak';
import { tl, tarih, DURUM } from './ortak';

// Bayi / toptancı ağı (kullanıcı kararı 2026-10-17): berber malzemecisi, kuaför toptancısı gibi her gün dükkân
// gezenler SıraGO kartını bırakır; kayıtlar onlara yazılır, komisyonu burada görür ve ödediğini işaretlersin.
// Bayi şifresiz, WhatsApp'tan gönderdiğin özel linkten kendi panelini açar.
const BOS = { isim: '', firma: '', telefon: '', komisyon_yuzde: 20, ilk_odeme_tl: 0 };

function BayiKarti({ b, api, yenile }) {
  const [acik, setAcik] = useState(false);
  const [detay, setDetay] = useState(null);
  const [odeme, setOdeme] = useState('');
  const [duzen, setDuzen] = useState(null);
  const [bekle, setBekle] = useState(false);

  const detayAl = useCallback(() => api.get(`/admin/bayiler/${b.id}`).then(d => !d?.hata && setDetay(d)), [api, b.id]);
  useEffect(() => { if (acik && !detay) detayAl(); }, [acik, detay, detayAl]);

  const guncelle = async (govde, onay) => {
    if (onay && !confirm(onay)) return;
    setBekle(true);
    const d = await api.put(`/admin/bayiler/${b.id}`, govde);
    setBekle(false);
    if (d?.hata) return alert(d.hata);
    setDuzen(null); yenile();
  };
  const odemeYap = async () => {
    const tutar = String(odeme).replace(',', '.');
    if (!(Number(tutar) > 0)) return alert('Tutar yazın');
    if (!confirm(`${b.isim} için ${tl(tutar)} ödendi olarak kaydedilsin mi?`)) return;
    const d = await api.post(`/admin/bayiler/${b.id}/odeme`, { tutar });
    if (d?.hata) return alert(d.hata);
    setOdeme(''); setDetay(null); yenile();
  };
  const waMetni = `Merhaba ${b.isim}, SıraGO bayi panelin hazır. Kartını buradan basabilir, getirdiğin dükkânları ve kazancını görebilirsin: ${b.panel_linki}`;

  return (
    <div style={{ ...kart, padding: '14px 16px', marginBottom: 10, opacity: b.aktif ? 1 : 0.6 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{b.isim}</span>
        {b.firma && <span style={{ fontSize: 12, color: 'var(--dim)' }}>{b.firma}</span>}
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--bg)', color: 'var(--dim)', fontWeight: 700 }}>{b.kod}</span>
        <span style={{ fontSize: 11, color: 'var(--dim)' }}>%{Number(b.komisyon_yuzde)}{Number(b.ilk_odeme_tl) ? ` + ilk ödeme ${tl(b.ilk_odeme_tl)}` : ''}</span>
        {!b.aktif && <span style={{ fontSize: 11, color: RENK.kirmizi, fontWeight: 700 }}>kapalı</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, margin: '10px 0' }}>
        {[['Getirdiği', b.kayit], ['Ödeyen', b.odeyen], ['Bu ay hakediş', tl(b.bu_ay_hakedis)], ['Toplam hakediş', tl(b.hakedis)], ['Ödenen', tl(b.odenen)],
          ['Borcun', tl(b.bakiye), b.bakiye > 0 ? RENK.mor : null]].map(([ad, deger, renk]) => (
          <div key={ad} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--bg)' }}>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>{ad}</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: renk || 'var(--text)' }}>{deger}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {b.telefon && <a href={`https://wa.me/${waTel(b.telefon)}?text=${encodeURIComponent(waMetni)}`} target="_blank" rel="noreferrer" style={dugme(RENK.wa, true)}>💬 Panel linkini gönder</a>}
        <button onClick={() => { navigator.clipboard?.writeText(b.panel_linki); }} style={dugme(RENK.gri)}>🔗 Linki kopyala</button>
        <a href={b.panel_linki} target="_blank" rel="noreferrer" style={dugme(RENK.mavi)}>👁 Panelini aç</a>
        <button onClick={() => setAcik(!acik)} style={dugme(RENK.mor, acik)}>{acik ? 'Kapat' : 'Dükkânlar ve ödeme'}</button>
        <button onClick={() => setDuzen(duzen ? null : { isim: b.isim, firma: b.firma || '', telefon: b.telefon || '', komisyon_yuzde: Number(b.komisyon_yuzde), ilk_odeme_tl: Number(b.ilk_odeme_tl) })} style={dugme(RENK.gri)}>✎ Düzenle</button>
      </div>

      {duzen && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--bg)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Alanlar v={duzen} set={setDuzen} />
          <button disabled={bekle} onClick={() => guncelle(duzen)} style={dugme(RENK.yesil, true)}>Kaydet</button>
          <button disabled={bekle} onClick={() => guncelle({ yeni_link: true }, 'Eski link çalışmaz olur, bayiye yenisini göndermen gerekir. Devam?')} style={dugme(RENK.amber)}>Linki yenile</button>
          <button disabled={bekle} onClick={() => guncelle({ aktif: !b.aktif }, b.aktif ? 'Bayi kapatılsın mı? Paneli açılmaz, kartıyla yeni kayıt ona yazılmaz (eski kayıtlar ve hakedişi kalır).' : null)}
            style={dugme(b.aktif ? RENK.kirmizi : RENK.yesil)}>{b.aktif ? 'Bayiyi kapat' : 'Yeniden aç'}</button>
        </div>
      )}

      {acik && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--dim)' }}>Bayiye ödeme yaptın mı?</span>
            <input value={odeme} onChange={e => setOdeme(e.target.value)} inputMode="decimal" placeholder={b.bakiye > 0 ? String(b.bakiye) : 'Tutar'} className="input" style={{ width: 110, borderRadius: 9, fontSize: 13 }} />
            <button onClick={odemeYap} style={dugme(RENK.yesil, true)}>Ödendi olarak kaydet</button>
          </div>
          {!detay ? <div style={{ fontSize: 12, color: 'var(--dim)' }}>Yükleniyor…</div> : (
            <>
              {detay.isletmeler.length === 0 && <div style={{ fontSize: 12, color: 'var(--dim)' }}>Henüz kartından kayıt olan dükkân yok.</div>}
              {detay.isletmeler.map(i => (
                <div key={i.id} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 140, color: 'var(--text)', fontWeight: 600 }}>{i.isim} <span style={{ color: 'var(--dim)', fontWeight: 400, fontSize: 12 }}>{i.ilce ? `· ${i.ilce} ` : ''}· {tarih(i.kayit)}</span></span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: DURUM[i.durum]?.renk }}>{DURUM[i.durum]?.ad}</span>
                  <span style={{ fontSize: 12, color: 'var(--dim)' }}>ödedi {tl(i.odenen)}</span>
                  <b style={{ minWidth: 70, textAlign: 'right' }}>{tl(i.kazanc)}</b>
                </div>
              ))}
              {detay.odemeler.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: 'var(--dim)' }}>
                  Ödemeler: {detay.odemeler.map(o => `${tarih(o.tarih)} ${tl(o.tutar)}${o.notu ? ` (${o.notu})` : ''}`).join(' · ')}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Alanlar({ v, set }) {
  const st = { borderRadius: 9, fontSize: 13 };
  return (
    <>
      <input value={v.isim} onChange={e => set({ ...v, isim: e.target.value })} placeholder="İsim *" className="input" style={{ ...st, width: 140 }} />
      <input value={v.firma} onChange={e => set({ ...v, firma: e.target.value })} placeholder="Firma (ör. Hasan Berber Malzeme)" className="input" style={{ ...st, width: 210 }} />
      <input value={v.telefon} onChange={e => set({ ...v, telefon: e.target.value })} placeholder="Telefon (WhatsApp)" className="input" style={{ ...st, width: 150 }} />
      <label style={{ fontSize: 12, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        Her ödemeden %<input value={v.komisyon_yuzde} onChange={e => set({ ...v, komisyon_yuzde: e.target.value })} inputMode="decimal" className="input" style={{ ...st, width: 60 }} />
      </label>
      <label style={{ fontSize: 12, color: 'var(--dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        İlk ödemede ₺<input value={v.ilk_odeme_tl} onChange={e => set({ ...v, ilk_odeme_tl: e.target.value })} inputMode="decimal" className="input" style={{ ...st, width: 80 }} />
      </label>
    </>
  );
}

export default function BayiYonetimi({ api }) {
  const [bayiler, setBayiler] = useState(null);
  const [yeni, setYeni] = useState(null);
  const yenile = useCallback(() => api.get('/admin/bayiler').then(d => setBayiler(d?.bayiler || [])), [api]);
  useEffect(() => { yenile(); }, [yenile]);

  const ekle = async () => {
    const d = await api.post('/admin/bayiler', yeni);
    if (d?.hata) return alert(d.hata);
    setYeni(null); yenile();
  };
  const toplam = (bayiler || []).reduce((t, b) => ({ kayit: t.kayit + b.kayit, buAy: t.buAy + b.bu_ay_hakedis, borc: t.borc + Math.max(0, b.bakiye) }), { kayit: 0, buAy: 0, borc: 0 });

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: 'var(--text)' }}>Bayiler / Toptancılar</h2>
        <span style={{ flex: 1 }} />
        <button onClick={() => setYeni(yeni ? null : { ...BOS })} style={dugme(RENK.yesil, true)}>＋ Bayi ekle</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--dim)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Berber malzemecisi, kuaför toptancısı gibi her gün dükkân gezenler. Her bayinin kendi QR kartı var (kod B…); esnaf okutup kayıt olunca
        dükkân o bayiye yazılır. Bayi şifresiz, özel linkinden kartını basar, dükkânlarını ve kazancını görür. Ödemeyi sen yapıp burada işaretlersin.
      </p>
      {bayiler && bayiler.length > 0 && (
        <div style={{ ...kart, padding: '10px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 13, color: 'var(--dim)' }}>
          <span>Bayilerden gelen dükkân: <b style={{ color: 'var(--text)' }}>{toplam.kayit}</b></span>
          <span>Bu ay hakediş: <b style={{ color: 'var(--text)' }}>{tl(toplam.buAy)}</b></span>
          <span>Bayilere borcun: <b style={{ color: RENK.mor }}>{tl(toplam.borc)}</b></span>
        </div>
      )}
      {yeni && (
        <div style={{ ...kart, padding: '14px 16px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Alanlar v={yeni} set={setYeni} />
          <button onClick={ekle} style={dugme(RENK.yesil, true)}>Ekle</button>
        </div>
      )}
      {!bayiler ? <div style={{ color: 'var(--dim)', fontSize: 13 }}>Yükleniyor…</div>
        : bayiler.length === 0 ? <div style={{ ...kart, textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Henüz bayi yok. "Bayi ekle" ile ilk toptancını ekle, panel linkini WhatsApp'tan gönder.</div>
          : bayiler.map(b => <BayiKarti key={b.id} b={b} api={api} yenile={yenile} />)}
    </div>
  );
}
