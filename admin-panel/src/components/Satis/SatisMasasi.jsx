import { useState, useEffect, useCallback } from 'react';
import { kart, dugme, sekmeStil, RENK, waTel, ilkMesaj, SONUC, saatTarih } from './ortak';
import ItirazBankasi from './ItirazBankasi';

// Satış Masası (kullanıcı kararı 2026-10-10): her ekip üyesinin günlük çalışma ekranı.
// Üstte takım hedefi ve benim günüm; ortada kendi arama listem; yanda liderlik ve kopya kâğıdı.

const GERI_ARA = [['Yarın', 1], ['3 gün sonra', 3], ['1 hafta sonra', 7]];
const geriAraTarihi = (gun) => { const t = new Date(); t.setDate(t.getDate() + gun); t.setHours(10, 30, 0, 0); return t.toISOString(); };

function Ilerleme({ deger, hedef, renk = RENK.yesil, yukseklik = 8 }) {
  const y = hedef > 0 ? Math.min(100, Math.round((deger / hedef) * 100)) : 0;
  return (
    <div style={{ height: yukseklik, background: 'var(--bg)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${y}%`, height: '100%', background: renk, transition: 'width .4s' }} />
    </div>
  );
}

function AdayKarti({ a, api, yenile, onDemo }) {
  const [acik, setAcik] = useState(null);          // 'ilgileniyor' | 'not' | 'kurulum' → ek alan
  const [notu, setNotu] = useState('');
  const [bekle, setBekle] = useState(false);
  const [demo, setDemo] = useState(null);

  const kaydet = async (tip, geri_ara) => {
    setBekle(true);
    const r = await api.post(`/admin/masa/lead/${a.id}/sonuc`, { tip, notu: notu.trim() || undefined, geri_ara });
    setBekle(false);
    if (r?.hata) return alert(r.hata);
    setAcik(null); setNotu(''); yenile();
  };
  const demoAc = async () => {
    if (demo) { window.open(demo, '_blank'); return; }
    const r = await api.post(`/admin/avci/${a.id}/demo`, {});
    if (r?.link) { setDemo(r.link); window.open(r.link, '_blank'); onDemo?.(); }
    else alert(r?.hata || 'Demo açılamadı');
  };
  const birak = async () => { if (!confirm(`${a.isletme_adi} listenden çıkarılsın mı? (başkası arayabilir)`)) return; await api.post(`/admin/masa/lead/${a.id}/birak`, {}); yenile(); };
  const son = a.son_sonuc ? SONUC[a.son_sonuc] : null;
  const geriAraGecti = a.sonraki_arama && new Date(a.sonraki_arama) <= new Date();

  return (
    <div style={{ ...kart, padding: '14px 16px', marginBottom: 10, borderLeft: geriAraGecti ? `4px solid ${RENK.amber}` : '1px solid var(--border)' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ width: 40, flexShrink: 0, textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: a.skor >= 80 ? RENK.yesil : a.skor >= 60 ? RENK.amber : RENK.gri }}>{a.skor ?? '—'}</div>
          <div style={{ fontSize: 10, color: 'var(--dim)' }}>skor</div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>{a.isletme_adi}</span>
            {a.kategori && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: 'var(--bg)', color: 'var(--dim)' }}>{a.kategori}</span>}
            {a.ilce && <span style={{ fontSize: 12, color: 'var(--dim)' }}>📍 {a.ilce}</span>}
            {son && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: `${son.renk}15`, color: son.renk, fontWeight: 600 }}>son: {son.ad}</span>}
            {a.sonraki_arama && <span style={{ fontSize: 11, color: geriAraGecti ? RENK.amber : 'var(--dim)', fontWeight: 600 }}>⏰ {geriAraGecti ? 'geri arama zamanı' : saatTarih(a.sonraki_arama)}</span>}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 12, color: 'var(--dim)', margin: '4px 0 8px' }}>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>📞 {a.telefon}</span>
            {a.puan && <span>⭐ {a.puan} · {a.yorum_sayisi} yorum</span>}
            {!a.web_sitesi && <span style={{ color: RENK.yesil }}>web sitesi yok</span>}
            {a.google_maps_url && <a href={a.google_maps_url} target="_blank" rel="noreferrer" style={{ color: RENK.mavi, textDecoration: 'none' }}>Harita ↗</a>}
          </div>
          {Array.isArray(a.yakindakiler) && a.yakindakiler.length > 0 && (
            <div style={{ fontSize: 12, color: RENK.yesil, fontWeight: 600, marginBottom: 8 }}>
              🤝 {a.ilce}'de kullanan: {a.yakindakiler.map(y => `${y.isim}${y.gun >= 30 ? ` (${Math.floor(y.gun / 30)} aydır)` : y.gun >= 7 ? ` (${Math.floor(y.gun / 7)} haftadır)` : ''}`).join(', ')} — "isterseniz onlara da sorun" deyin
            </div>
          )}
          {a.notlar && <div style={{ fontSize: 12, color: 'var(--dim)', fontStyle: 'italic', whiteSpace: 'pre-wrap', marginBottom: 8 }}>📝 {a.notlar.split('\n').slice(-2).join(' · ')}</div>}

          {/* 1) Ulaş */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            <a href={`tel:${a.telefon}`} style={dugme(RENK.mavi, true)}>📞 Ara</a>
            <a href={`https://wa.me/${waTel(a.telefon)}?text=${encodeURIComponent(ilkMesaj(a.isletme_adi))}`} target="_blank" rel="noreferrer" style={dugme(RENK.wa, true)}>💬 WhatsApp</a>
            <button onClick={demoAc} style={dugme(RENK.mor)}>{demo || a.demo_isletme_id ? '👁 Demoyu aç' : '✨ Demo hazırla'}</button>
            {demo && <button onClick={() => navigator.clipboard?.writeText(demo)} style={dugme()}>🔗 Linki kopyala</button>}
            <span style={{ flex: 1 }} />
            <button onClick={birak} title="Listemden çıkar" style={{ ...dugme(RENK.gri), padding: '7px 9px' }}>✕</button>
          </div>
          {/* 2) Sonucu işaretle */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['arama_yok', 'gorustu', 'ilgilenmiyor'].map(t => (
              <button key={t} disabled={bekle} onClick={() => kaydet(t)} style={dugme(SONUC[t].renk)}>{SONUC[t].ad}</button>
            ))}
            <button disabled={bekle} onClick={() => setAcik(acik === 'ilgileniyor' ? null : 'ilgileniyor')} style={dugme(SONUC.ilgileniyor.renk, acik === 'ilgileniyor')}>İlgileniyor…</button>
            <button disabled={bekle} onClick={() => kaydet('demo', geriAraTarihi(2))} style={dugme(SONUC.demo.renk)}>Demo gönderdim</button>
            <button disabled={bekle} onClick={() => setAcik(acik === 'kurulum' ? null : 'kurulum')} style={dugme(RENK.yesil, true)}>✓ Bağlandı</button>
            <button disabled={bekle} onClick={() => setAcik(acik === 'not' ? null : 'not')} style={dugme(RENK.gri)}>📝 Not</button>
          </div>
          {acik && (
            <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: 'var(--bg)' }}>
              <input value={notu} onChange={e => setNotu(e.target.value)} placeholder={acik === 'kurulum' ? 'Not (ör. QR kart bırakıldı, fiyatları girildi)' : acik === 'ilgileniyor' ? 'Ne dedi? (ör. akşam ortağıyla konuşacak)' : 'Not'}
                className="input" style={{ width: '100%', borderRadius: 10, marginBottom: 8, fontSize: 13 }} />
              {acik === 'ilgileniyor' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--dim)', alignSelf: 'center' }}>Ne zaman geri arayalım?</span>
                  {GERI_ARA.map(([ad, gun]) => <button key={gun} disabled={bekle} onClick={() => kaydet('ilgileniyor', geriAraTarihi(gun))} style={dugme(RENK.amber, true)}>{ad}</button>)}
                </div>
              )}
              {acik === 'kurulum' && <button disabled={bekle} onClick={() => kaydet('kurulum')} style={dugme(RENK.yesil, true)}>Kaydet: bu dükkânı ben bağladım</button>}
              {acik === 'not' && <button disabled={bekle || !notu.trim()} onClick={() => kaydet('not')} style={dugme(RENK.gri, true)}>Notu kaydet</button>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SatisMasasi({ api, kullanici }) {
  const [ozet, setOzet] = useState(null);
  const [liste, setListe] = useState({ bugun: [], ileride: [] });
  const [aktiviteler, setAktiviteler] = useState([]);
  const [sekme, setSekme] = useState('bugun');
  const [lider, setLider] = useState('bugun');
  const [cek, setCek] = useState({ adet: 10, ilce: '', kategori: '' });
  const [cekiliyor, setCekiliyor] = useState(false);
  const [kopya, setKopya] = useState(false);

  const yenile = useCallback(() => {
    api.get('/admin/masa/ozet').then(d => !d?.hata && setOzet(d)).catch(() => {});
    api.get('/admin/masa/listem').then(d => !d?.hata && setListe({ bugun: d.bugun || [], ileride: d.ileride || [] })).catch(() => {});
    api.get('/admin/masa/aktiviteler').then(d => setAktiviteler(d.aktiviteler || [])).catch(() => {});
  }, [api]);
  useEffect(() => { yenile(); const t = setInterval(() => api.get('/admin/masa/ozet').then(d => !d?.hata && setOzet(d)).catch(() => {}), 60000); return () => clearInterval(t); }, [yenile]);

  const adayCek = async () => {
    setCekiliyor(true);
    const r = await api.post('/admin/masa/cek', { adet: cek.adet, ilce: cek.ilce.trim() || undefined, kategori: cek.kategori || undefined });
    setCekiliyor(false);
    if (r?.hata) return alert(r.hata);
    if (!r.cekilen) alert('Havuzda bu filtreye uyan aday kalmadı. Filtreyi boşaltın ya da Avcı\'dan yeni tarama yapın.');
    yenile();
  };

  const h = ozet?.hedef, ben = ozet?.ben;
  const benimBaglanan = ben?.kurulum || 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text)' }}>Satış Masası</h1>
          <p style={{ color: 'var(--dim)', fontSize: 13, margin: '4px 0 0' }}>Merhaba {kullanici?.isim || ''} — listeni ara, her aramanın sonucunu işaretle. İşaretlenmeyen arama sayılmaz.</p>
        </div>
        <button onClick={() => setKopya(!kopya)} style={dugme(RENK.mor, kopya)}>📋 Kopya kâğıdı (itirazlar)</button>
      </div>

      {/* Takım hedefi */}
      {h && (
        <div style={{ ...kart, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              🎯 Takım hedefi: <span style={{ color: RENK.yesil }}>{h.baglanan}</span> / {h.isletme} işletme
            </div>
            <div style={{ fontSize: 13, color: 'var(--dim)' }}>
              {new Date(h.tarih).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}'e <b style={{ color: 'var(--text)' }}>{h.kalan_gun} gün</b> · kalan <b style={{ color: 'var(--text)' }}>{h.kalan}</b> · takımca günde <b style={{ color: RENK.amber }}>{h.takim_gunluk}</b> gerekiyor
            </div>
          </div>
          <Ilerleme deger={h.baglanan} hedef={h.isletme} yukseklik={10} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16 }} className="masa-izgara">
        <div style={{ minWidth: 0 }}>
          {/* Benim günüm */}
          {ben && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 14 }}>
              {[['Arama', ben.arama, 20, RENK.mavi], ['Görüşme', ben.gorusme, 5, RENK.mor], ['Demo', ben.demo, 3, RENK.amber], ['Bağladım', benimBaglanan, ben.hedef, RENK.yesil]].map(([ad, n, hd, r]) => (
                <div key={ad} style={{ ...kart, padding: '12px 14px' }}>
                  <div style={{ fontSize: 12, color: 'var(--dim)' }}>{ad} <span style={{ opacity: .7 }}>/ {hd}</span></div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: r, margin: '2px 0 6px' }}>{n}</div>
                  <Ilerleme deger={n} hedef={hd} renk={r} yukseklik={5} />
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)', marginBottom: 14, overflowX: 'auto' }}>
            {[['bugun', `Bugün ara (${liste.bugun.length})`], ['ileride', `Geri aranacak (${liste.ileride.length})`], ['yaptim', `Bugün yaptıklarım (${aktiviteler.length})`]].map(([id, ad]) =>
              <button key={id} onClick={() => setSekme(id)} style={sekmeStil(sekme === id)}>{ad}</button>)}
          </div>

          {sekme === 'bugun' && (
            <>
              <div style={{ ...kart, padding: '12px 14px', marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Listeme aday çek:</span>
                <select value={cek.adet} onChange={e => setCek({ ...cek, adet: +e.target.value })} className="input" style={{ width: 90, borderRadius: 9, fontSize: 13 }}>
                  {[5, 10, 20, 30].map(n => <option key={n} value={n}>{n} aday</option>)}
                </select>
                <input value={cek.ilce} onChange={e => setCek({ ...cek, ilce: e.target.value })} placeholder="İlçe (boş = hepsi)" className="input" style={{ width: 150, borderRadius: 9, fontSize: 13 }} />
                <select value={cek.kategori} onChange={e => setCek({ ...cek, kategori: e.target.value })} className="input" style={{ width: 150, borderRadius: 9, fontSize: 13 }}>
                  <option value="">Tüm kategoriler</option>
                  {['berber', 'kuaför', 'güzellik salonu', 'tırnak salonu', 'diş kliniği', 'veteriner', 'spa', 'dövme', 'diyetisyen'].map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <button onClick={adayCek} disabled={cekiliyor} style={dugme(RENK.yesil, true)}>{cekiliyor ? 'Çekiliyor…' : '＋ Çek'}</button>
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>En sıcak adaylar gelir; çektiğin aday sadece senin listende görünür.</span>
              </div>
              {liste.bugun.length === 0
                ? <div style={{ ...kart, textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>Bugün aranacak kimse yok. Yukarıdan listene aday çek.</div>
                : liste.bugun.map(a => <AdayKarti key={a.id} a={a} api={api} yenile={yenile} />)}
            </>
          )}
          {sekme === 'ileride' && (liste.ileride.length === 0
            ? <div style={{ ...kart, color: 'var(--dim)', fontSize: 14 }}>Geri aranacak kimse yok.</div>
            : liste.ileride.map(a => <AdayKarti key={a.id} a={a} api={api} yenile={yenile} />))}
          {sekme === 'yaptim' && (
            <div style={{ ...kart, padding: 0 }}>
              {aktiviteler.length === 0 && <div style={{ padding: 16, color: 'var(--dim)', fontSize: 14 }}>Bugün henüz kayıt yok.</div>}
              {aktiviteler.map(x => (
                <div key={x.id} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'baseline' }}>
                  <span style={{ width: 46, color: 'var(--dim)', fontSize: 12 }}>{new Date(x.olusturma_tarihi).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span style={{ fontWeight: 600, color: SONUC[x.tip]?.renk || 'var(--text)', minWidth: 110 }}>{SONUC[x.tip]?.ad || x.tip}{x.otomatik ? ' (otomatik)' : ''}</span>
                  <span style={{ color: 'var(--text)' }}>{x.isletme_adi || x.isletme_isim || ''}</span>
                  {x.notu && <span style={{ color: 'var(--dim)' }}>— {x.notu}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sağ sütun: liderlik + kopya kâğıdı */}
        <div style={{ minWidth: 0 }}>
          {kopya && (
            <div style={{ ...kart, marginBottom: 14, padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: 'var(--text)' }}>📋 Esnaf ne dedi?</div>
              <ItirazBankasi api={api} patron={ozet?.patron} kompakt />
            </div>
          )}
          <div style={{ ...kart, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>🏆 Liderlik</div>
              <div style={{ display: 'flex', gap: 4 }}>
                {[['bugun', 'Bugün'], ['hafta', '7 gün']].map(([id, ad]) => <button key={id} onClick={() => setLider(id)} style={{ ...dugme(RENK.yesil, lider === id), padding: '4px 10px', fontSize: 11 }}>{ad}</button>)}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead><tr style={{ color: 'var(--dim)' }}>
                <th style={{ textAlign: 'left', padding: '4px 2px', fontWeight: 600 }}>Kişi</th>
                <th style={{ textAlign: 'right', padding: '4px 2px', fontWeight: 600 }} title="Arama">Ara</th>
                <th style={{ textAlign: 'right', padding: '4px 2px', fontWeight: 600 }} title="Görüşme">Gör</th>
                <th style={{ textAlign: 'right', padding: '4px 2px', fontWeight: 600 }}>Demo</th>
                <th style={{ textAlign: 'right', padding: '4px 2px', fontWeight: 600, color: RENK.yesil }}>Bağ.</th>
              </tr></thead>
              <tbody>
                {(ozet?.liderlik?.[lider] || []).map((x, i) => (
                  <tr key={x.id} style={{ background: x.id === kullanici?.id ? 'rgba(31,111,74,.07)' : 'transparent' }}>
                    <td style={{ padding: '6px 2px', color: 'var(--text)', fontWeight: x.id === kullanici?.id ? 700 : 500 }}>{i === 0 && x.kurulum > 0 ? '🥇 ' : ''}{x.isim}</td>
                    <td style={{ textAlign: 'right', padding: '6px 2px' }}>{x.arama}</td>
                    <td style={{ textAlign: 'right', padding: '6px 2px' }}>{x.gorusme}</td>
                    <td style={{ textAlign: 'right', padding: '6px 2px' }}>{x.demo}</td>
                    <td style={{ textAlign: 'right', padding: '6px 2px', fontWeight: 700, color: RENK.yesil }}>{x.kurulum}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 8 }}>Senin günlük bağlama hedefin: <b>{ben?.hedef ?? '—'}</b>. Hedef, kalan güne göre her gün yeniden hesaplanır.</div>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px) { .masa-izgara { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
