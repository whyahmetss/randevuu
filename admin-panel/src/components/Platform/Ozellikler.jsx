// Özellik Anahtarları (2026-10-15): yeni bir özellik önce seçili işletmelerde açılır, sorun çıkarsa tek tuşla kapanır.
// Koddaki karşılığı: require('../utils/ozellik').acik('kod', isletmeId)
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj, etiketStil, zaman } from './ortak';

const DURUM = {
  kapali: { ad: 'Kapalı', renk: '#6f6a62' },
  secili: { ad: 'Seçili işletmeler', renk: '#a8590c' },
  herkes: { ad: 'Herkese açık', renk: '#1f6f4a' },
};
const BOS = { kod: '', aciklama: '', durum: 'kapali', isletme_idler: '' };

export default function Ozellikler({ api }) {
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(null);   // null | { ...BOS, yeni: true } | düzenlenen
  const [mesaj, setMesaj] = useState(null);

  const yukle = async () => {
    const d = await api.get('/admin/ozellikler');
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setListe(d.ozellikler);
  };
  useEffect(() => { yukle(); }, []);

  const kaydet = async (e) => {
    e.preventDefault();
    const govde = { ...form, isletme_idler: String(form.isletme_idler || '') };
    const d = form.yeni ? await api.post('/admin/ozellikler', govde) : await api.put(`/admin/ozellikler/${form.kod}`, govde);
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setMesaj({ tur: 'ok', metin: 'Kaydedildi. Bir dakika içinde geçerli olur.' }); setForm(null); yukle();
  };

  const durumDegistir = async (o, durum) => {
    if (durum === 'secili' && !o.isletme_idler?.length) return setForm({ ...o, durum, isletme_idler: '' });
    const d = await api.put(`/admin/ozellikler/${o.kod}`, { aciklama: o.aciklama, durum, isletme_idler: (o.isletme_idler || []).join(',') });
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    yukle();
  };

  return (
    <>
      <SayfaBaslik baslik="Özellik Anahtarları" aciklama="Yeni bir özelliği önce birkaç işletmede dene; sorun çıkarsa tek tuşla kapat.">
        <button onClick={() => setForm({ ...BOS, yeni: true })} className="btn btn-sm" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>+ Yeni anahtar</button>
      </SayfaBaslik>
      <Mesaj m={mesaj} />
      {form && (
        <form onSubmit={kaydet} className="card mb-16" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            <div><label style={etiketStil}>Kod (kodda kullanılan ad)</label>
              <input className="input" value={form.kod} disabled={!form.yeni} placeholder="yeni_takvim" onChange={e => setForm({ ...form, kod: e.target.value })} style={{ width: '100%' }} required /></div>
            <div><label style={etiketStil}>Açıklama</label>
              <input className="input" value={form.aciklama || ''} placeholder="Yeni takvim görünümü" onChange={e => setForm({ ...form, aciklama: e.target.value })} style={{ width: '100%' }} /></div>
            <div><label style={etiketStil}>Durum</label>
              <select className="input" value={form.durum} onChange={e => setForm({ ...form, durum: e.target.value })} style={{ width: '100%' }}>
                {Object.entries(DURUM).map(([k, v]) => <option key={k} value={k}>{v.ad}</option>)}
              </select></div>
            {form.durum === 'secili' && <div><label style={etiketStil}>İşletme numaraları (virgülle)</label>
              <input className="input" value={Array.isArray(form.isletme_idler) ? form.isletme_idler.join(', ') : form.isletme_idler} placeholder="12, 46"
                onChange={e => setForm({ ...form, isletme_idler: e.target.value })} style={{ width: '100%' }} /></div>}
          </div>
          <div className="row gap-6 mt-12">
            <button type="submit" className="btn btn-sm" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>💾 Kaydet</button>
            <button type="button" onClick={() => setForm(null)} className="btn btn-sm btn-ghost">İptal</button>
          </div>
        </form>
      )}
      {!liste ? <div className="list-empty"><p>Yükleniyor…</p></div>
        : liste.length === 0 ? <div className="list-empty"><p>Henüz anahtar yok. Yeni bir özellik yazılırken buraya eklenir.</p></div>
        : liste.map(o => (
          <div key={o.kod} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <div className="row row-between gap-8" style={{ flexWrap: 'wrap' }}>
              <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <code style={{ fontWeight: 700 }}>{o.kod}</code>
                <span className="tag" style={{ color: DURUM[o.durum]?.renk, fontWeight: 700 }}>{DURUM[o.durum]?.ad}</span>
                {o.durum === 'secili' && <span style={{ fontSize: 12, color: 'var(--dim)' }}>#{(o.isletme_idler || []).join(', #')}</span>}
              </div>
              <div className="row gap-6" style={{ flexWrap: 'wrap' }}>
                {Object.keys(DURUM).filter(k => k !== o.durum).map(k => (
                  <button key={k} onClick={() => durumDegistir(o, k)} className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>→ {DURUM[k].ad}</button>
                ))}
                <button onClick={() => setForm({ ...o, isletme_idler: (o.isletme_idler || []).join(', ') })} className="btn btn-sm" style={{ background: 'rgba(47,86,198,.1)', color: '#2f56c6', fontWeight: 600 }}>✏️</button>
                <button onClick={async () => { if (confirm(`"${o.kod}" silinsin mi? Kodda kullanılıyorsa özellik kapalı sayılır.`)) { await api.del(`/admin/ozellikler/${o.kod}`); yukle(); } }}
                  className="btn btn-sm" style={{ background: 'var(--red-s)', color: 'var(--red)' }}>Sil</button>
              </div>
            </div>
            {o.aciklama && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{o.aciklama}</div>}
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>Son değişiklik: {zaman(o.guncelleme)}</div>
          </div>
        ))}
    </>
  );
}
