import { useState, useEffect } from 'react';

// Süper admin — Mağaza pilotu: tedarikçiler, ürünler, işletme indirim kodları, aylık satış raporu (CSV) ve komisyon özeti.
const tl = (x) => { const n = Number(x || 0); return `${n.toLocaleString('tr-TR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} ₺`; };
const buAy = () => new Date().toLocaleDateString('sv-SE').slice(0, 7);
const BOS_TED = { isim: '', site_url: '', iletisim: '', berber_komisyon_yuzde: 20, sirago_komisyon_yuzde: 10, aktif: true };
const BOS_URUN = { tedarikci_id: '', isim: '', aciklama: '', gorsel_url: '', fiyat: '', urun_url: '', kategori: '', aktif: true };

function Alan({ etiket, children }) {
  return <div className="form-group"><label className="form-label">{etiket}</label>{children}</div>;
}

export default function MagazaAdmin({ api, isletmeler = [] }) {
  const [tab, setTab] = useState('ozet');
  const [tedarikciler, setTedarikciler] = useState([]);
  const [urunler, setUrunler] = useState([]);
  const [kodlar, setKodlar] = useState([]);
  const [ozet, setOzet] = useState(null);
  const [donem, setDonem] = useState(buAy());
  const [form, setForm] = useState(null);         // { tur: 'ted'|'urun', veri }
  const [kodForm, setKodForm] = useState({ isletme_id: '', tedarikci_id: '', indirim_kodu: '' });
  const [csv, setCsv] = useState({ tedarikci_id: '', donem: buAy(), metin: '' });
  const [sonuc, setSonuc] = useState(null);
  const [mesaj, setMesaj] = useState(null);

  const yukle = () => {
    api.get('/admin/magaza/tedarikciler').then(d => setTedarikciler(d?.tedarikciler || []));
    api.get('/admin/magaza/urunler').then(d => setUrunler(d?.urunler || []));
    api.get('/admin/magaza/kodlar').then(d => setKodlar(d?.kodlar || []));
  };
  useEffect(yukle, []);
  useEffect(() => { api.get(`/admin/magaza/ozet?donem=${donem}`).then(d => setOzet(d?.hata ? null : d)); }, [donem]);

  const bildir = (d, basari) => { setMesaj(d?.hata ? { tip: 'error', metin: d.hata } : { tip: 'success', metin: basari }); setTimeout(() => setMesaj(null), 4000); };

  const formKaydet = async () => {
    const { tur, veri } = form;
    const yol = tur === 'ted' ? '/admin/magaza/tedarikciler' : '/admin/magaza/urunler';
    const d = veri.id ? await api.put(`${yol}/${veri.id}`, veri) : await api.post(yol, veri);
    bildir(d, 'Kaydedildi');
    if (!d?.hata) { setForm(null); yukle(); }
  };

  const kodKaydet = async () => {
    const d = await api.post('/admin/magaza/kodlar', kodForm);
    bildir(d, 'İndirim kodu kaydedildi');
    if (!d?.hata) { setKodForm({ ...kodForm, isletme_id: '', indirim_kodu: '' }); yukle(); }
  };

  const dosyaOku = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setCsv(c => ({ ...c, metin: String(r.result || '') }));
    r.readAsText(f, 'utf-8');
  };

  const csvYukle = async () => {
    const d = await api.post('/admin/magaza/satis-yukle', { tedarikci_id: csv.tedarikci_id, donem: csv.donem, csv: csv.metin });
    if (d?.hata) return bildir(d);
    setSonuc(d);
    if (csv.donem === donem) api.get(`/admin/magaza/ozet?donem=${donem}`).then(o => setOzet(o?.hata ? null : o));
  };

  const set = (k) => (e) => setForm(f => ({ ...f, veri: { ...f.veri, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value } }));

  return (
    <div style={{ maxWidth: 1100 }}>
      <div className="tab-bar" style={{ marginBottom: 20, maxWidth: '100%', overflowX: 'auto' }}>
        {[['ozet', 'Aylık özet'], ['tedarikciler', 'Tedarikçiler'], ['urunler', 'Ürünler'], ['kodlar', 'İndirim kodları'], ['satis', 'Satış raporu']].map(([id, l]) => (
          <button key={id} onClick={() => setTab(id)} className={`tab-btn${tab === id ? ' active' : ''}`}>{l}</button>
        ))}
      </div>

      {mesaj && <div className={`alert alert-${mesaj.tip}`} style={{ marginBottom: 14 }}>{mesaj.metin}</div>}

      {tab === 'ozet' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--dim)' }}>Dönem</span>
            <input type="month" className="input" style={{ width: 170 }} value={donem} onChange={e => setDonem(e.target.value || buAy())} />
          </div>
          {ozet && (
            <>
              <div className="stats-grid" style={{ marginBottom: 20 }}>
                {[['Ciro (onaylı)', tl(ozet.toplam.ciro)], ['İşletmelere ödenecek', tl(ozet.toplam.berber_komisyon)],
                  ['SıraGO komisyonu', tl(ozet.toplam.sirago_komisyon)], ['Kodu eşleşmeyen satış', ozet.toplam.eslesmeyen]].map(([l, v]) => (
                  <div key={l} className="stat-card"><div className="sc-label">{l}</div><div className="sc-val" style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</div></div>
                ))}
              </div>
              <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>İşletme</th><th>Öneri</th><th>Tıklanma</th><th>Satış</th><th>Ciro</th><th>Ödenecek komisyon</th></tr></thead>
                  <tbody>
                    {ozet.isletmeler.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>Bu dönemde hareket yok</td></tr>}
                    {ozet.isletmeler.map(i => (
                      <tr key={i.id}><td>{i.isim}</td><td>{i.oneri}</td><td>{i.tiklanma}</td><td>{i.satis}</td><td>{tl(i.ciro)}</td><td style={{ fontWeight: 600 }}>{tl(i.berber_komisyon)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'tedarikciler' && (
        <>
          <div style={{ marginBottom: 14 }}><button className="btn btn-primary btn-sm" onClick={() => setForm({ tur: 'ted', veri: { ...BOS_TED } })}>Tedarikçi ekle</button></div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Tedarikçi</th><th>İşletme %</th><th>SıraGO %</th><th>Ürün</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {tedarikciler.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>Henüz tedarikçi yok</td></tr>}
                {tedarikciler.map(t => (
                  <tr key={t.id}>
                    <td><div style={{ fontWeight: 600 }}>{t.isim}</div><div style={{ fontSize: 11, color: 'var(--dim)' }}>{t.iletisim || t.site_url}</div></td>
                    <td>%{Number(t.berber_komisyon_yuzde)}</td><td>%{Number(t.sirago_komisyon_yuzde)}</td><td>{t.urun_sayisi}</td>
                    <td><span className={`tag tag-sm ${t.aktif ? 'tag-green' : ''}`}>{t.aktif ? 'Aktif' : 'Pasif'}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setForm({ tur: 'ted', veri: { ...t } })}>Düzenle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'urunler' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <button className="btn btn-primary btn-sm" disabled={!tedarikciler.length}
              onClick={() => setForm({ tur: 'urun', veri: { ...BOS_URUN, tedarikci_id: tedarikciler[0]?.id || '' } })}>Ürün ekle</button>
            {!tedarikciler.length && <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--dim)' }}>Önce tedarikçi ekleyin.</span>}
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Ürün</th><th>Tedarikçi</th><th>Kategori</th><th>Fiyat</th><th>Durum</th><th></th></tr></thead>
              <tbody>
                {urunler.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>Henüz ürün yok</td></tr>}
                {urunler.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.isim}</td><td>{u.tedarikci_isim}</td><td>{u.kategori || '—'}</td><td>{u.fiyat ? tl(u.fiyat) : '—'}</td>
                    <td><span className={`tag tag-sm ${u.aktif ? 'tag-green' : ''}`}>{u.aktif ? 'Aktif' : 'Pasif'}</span></td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => setForm({ tur: 'urun', veri: { ...u, fiyat: u.fiyat ?? '' } })}>Düzenle</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'kodlar' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12 }}>
              Kodu önce tedarikçinin sisteminde (ör. Shopify/İkas indirim kodu) tanımlatın, sonra burada işletmeyle eşleyin.
              Satış raporundaki kod bu eşleşmeyle işletmeye bağlanır.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, alignItems: 'end' }}>
              <Alan etiket="İşletme">
                <select className="input" value={kodForm.isletme_id} onChange={e => setKodForm({ ...kodForm, isletme_id: e.target.value })}>
                  <option value="">Seçin</option>
                  {isletmeler.map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
                </select>
              </Alan>
              <Alan etiket="Tedarikçi">
                <select className="input" value={kodForm.tedarikci_id} onChange={e => setKodForm({ ...kodForm, tedarikci_id: e.target.value })}>
                  <option value="">Seçin</option>
                  {tedarikciler.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
                </select>
              </Alan>
              <Alan etiket="İndirim kodu">
                <input className="input" placeholder="KEMAL10" value={kodForm.indirim_kodu} onChange={e => setKodForm({ ...kodForm, indirim_kodu: e.target.value.toUpperCase() })} />
              </Alan>
              <button className="btn btn-primary" style={{ marginBottom: 14 }} disabled={!kodForm.isletme_id || !kodForm.tedarikci_id || !kodForm.indirim_kodu} onClick={kodKaydet}>Kaydet</button>
            </div>
          </div>
          <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>İşletme</th><th>Tedarikçi</th><th>Kod</th></tr></thead>
              <tbody>
                {kodlar.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--dim)', padding: 24 }}>Henüz kod yok</td></tr>}
                {kodlar.map(k => <tr key={`${k.isletme_id}-${k.tedarikci_id}`}><td>{k.isletme_isim}</td><td>{k.tedarikci_isim}</td><td style={{ fontFamily: 'ui-monospace, monospace' }}>{k.indirim_kodu}</td></tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'satis' && (
        <div className="card">
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 12, lineHeight: 1.6 }}>
            Tedarikçinin aylık sipariş raporunu CSV olarak yükleyin. Gerekli sütunlar: <b>siparis_no</b>, <b>indirim_kodu</b>, <b>tutar</b>; isteğe bağlı <b>durum</b> (iade/iptal olanlara komisyon yazılmaz).
            Aynı sipariş tekrar yüklenirse güncellenir, iki kez sayılmaz.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <Alan etiket="Tedarikçi">
              <select className="input" value={csv.tedarikci_id} onChange={e => setCsv({ ...csv, tedarikci_id: e.target.value })}>
                <option value="">Seçin</option>
                {tedarikciler.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
              </select>
            </Alan>
            <Alan etiket="Dönem"><input type="month" className="input" value={csv.donem} onChange={e => setCsv({ ...csv, donem: e.target.value })} /></Alan>
            <Alan etiket="CSV dosyası"><input type="file" accept=".csv,text/csv" className="input" onChange={dosyaOku} /></Alan>
          </div>
          <Alan etiket="ya da yapıştırın">
            <textarea className="input" rows={6} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
              placeholder={'siparis_no,indirim_kodu,tutar,durum\n10234,KEMAL10,459.90,tamamlandı'}
              value={csv.metin} onChange={e => setCsv({ ...csv, metin: e.target.value })} />
          </Alan>
          <button className="btn btn-primary" disabled={!csv.tedarikci_id || !csv.metin.trim()} onClick={csvYukle}>Yükle ve hesapla</button>
          {sonuc && (
            <div className={`alert ${sonuc.hatali || sonuc.eslesmeyen ? 'alert-warning' : 'alert-success'}`} style={{ marginTop: 14 }}>
              {sonuc.eklenen} yeni, {sonuc.guncellenen} güncellenen satış. {sonuc.eslesmeyen > 0 && `${sonuc.eslesmeyen} satırın kodu hiçbir işletmeyle eşleşmedi. `}
              {sonuc.hatali > 0 && `${sonuc.hatali} satır okunamadı.`}
              {sonuc.hatalar?.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{sonuc.hatalar.map(h => <li key={h}>{h}</li>)}</ul>}
            </div>
          )}
        </div>
      )}

      {form && (
        <div onClick={() => setForm(null)} className="modal-overlay">
          <div onClick={e => e.stopPropagation()} className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2 style={{ fontSize: 16 }}>{form.veri.id ? 'Düzenle' : form.tur === 'ted' ? 'Yeni tedarikçi' : 'Yeni ürün'}</h2>
              <button onClick={() => setForm(null)} className="modal-close">✕</button>
            </div>
            <div style={{ padding: '16px 20px 20px' }}>
              {form.tur === 'ted' ? (
                <>
                  <Alan etiket="Ad"><input className="input" value={form.veri.isim} onChange={set('isim')} /></Alan>
                  <Alan etiket="Site adresi"><input className="input" placeholder="https://" value={form.veri.site_url || ''} onChange={set('site_url')} /></Alan>
                  <Alan etiket="İletişim (kişi / telefon)"><input className="input" value={form.veri.iletisim || ''} onChange={set('iletisim')} /></Alan>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Alan etiket="İşletme komisyonu %"><input type="number" min="0" max="90" className="input" value={form.veri.berber_komisyon_yuzde} onChange={set('berber_komisyon_yuzde')} /></Alan>
                    <Alan etiket="SıraGO komisyonu %"><input type="number" min="0" max="90" className="input" value={form.veri.sirago_komisyon_yuzde} onChange={set('sirago_komisyon_yuzde')} /></Alan>
                  </div>
                </>
              ) : (
                <>
                  <Alan etiket="Tedarikçi">
                    <select className="input" value={form.veri.tedarikci_id} onChange={set('tedarikci_id')}>
                      {tedarikciler.map(t => <option key={t.id} value={t.id}>{t.isim}</option>)}
                    </select>
                  </Alan>
                  <Alan etiket="Ürün adı"><input className="input" value={form.veri.isim} onChange={set('isim')} /></Alan>
                  <Alan etiket="Ürün sayfası (tedarikçi sitesinde)"><input className="input" placeholder="https://" value={form.veri.urun_url} onChange={set('urun_url')} /></Alan>
                  <Alan etiket="Görsel adresi"><input className="input" placeholder="https://" value={form.veri.gorsel_url || ''} onChange={set('gorsel_url')} /></Alan>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Alan etiket="Fiyat (₺)"><input type="number" min="0" step="0.01" className="input" value={form.veri.fiyat} onChange={set('fiyat')} /></Alan>
                    <Alan etiket="Kategori"><input className="input" placeholder="sakal bakımı" value={form.veri.kategori || ''} onChange={set('kategori')} /></Alan>
                  </div>
                  <Alan etiket="Kısa açıklama"><textarea className="input" rows={2} value={form.veri.aciklama || ''} onChange={set('aciklama')} /></Alan>
                </>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 14px' }}>
                <input type="checkbox" checked={form.veri.aktif !== false} onChange={set('aktif')} /> Aktif
              </label>
              <button className="btn btn-primary btn-block" onClick={formKaydet}>Kaydet</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
