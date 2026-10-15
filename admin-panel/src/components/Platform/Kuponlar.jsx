// Kuponlar (2026-10-15): kampanya için kod gerekmez ("ILKAY50", "BAYRAM100").
// Esnaf paket ekranında kodu girer; kartla ödemede (Shopier) indirim uygulanır, havalede kupon yok.
// Her işletme bir kuponu bir kez kullanır; kullanım ödeme gelince sayılır.
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj, etiketStil, zaman } from './ortak';

const PAKETLER = [['baslangic', 'Başlangıç'], ['profesyonel', 'Standart'], ['proplus', 'Pro+'], ['kurumsal', 'Kurumsal']];
const BOS = { kod: '', aciklama: '', tur: 'yuzde', deger: '', paketler: [], son_tarih: '', max_kullanim: '', aktif: true };

export default function Kuponlar({ api }) {
  const [liste, setListe] = useState(null);
  const [form, setForm] = useState(null);
  const [kullanim, setKullanim] = useState(null);   // { kupon, liste }
  const [mesaj, setMesaj] = useState(null);

  const yukle = async () => {
    const d = await api.get('/admin/kuponlar');
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setListe(d.kuponlar);
  };
  useEffect(() => { yukle(); }, []);

  const duzenle = (k) => setForm({
    id: k.id, kod: k.kod, aciklama: k.aciklama || '', tur: k.indirim_yuzde ? 'yuzde' : 'tl', deger: k.indirim_yuzde || k.indirim_tl || '',
    paketler: k.paketler || [], son_tarih: k.son_tarih ? String(k.son_tarih).slice(0, 10) : '', max_kullanim: k.max_kullanim ?? '', aktif: k.aktif,
  });

  const kaydet = async (e) => {
    e.preventDefault();
    const govde = {
      kod: form.kod, aciklama: form.aciklama, paketler: form.paketler, son_tarih: form.son_tarih || null,
      max_kullanim: form.max_kullanim === '' ? null : form.max_kullanim, aktif: form.aktif,
      indirim_yuzde: form.tur === 'yuzde' ? form.deger : null, indirim_tl: form.tur === 'tl' ? form.deger : null,
    };
    const d = form.id ? await api.put(`/admin/kuponlar/${form.id}`, govde) : await api.post('/admin/kuponlar', govde);
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setMesaj({ tur: 'ok', metin: `${d.kupon.kod} kaydedildi.` }); setForm(null); yukle();
  };

  const kullanimGoster = async (k) => {
    const d = await api.get(`/admin/kuponlar/${k.id}/kullanimlar`);
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setKullanim({ kupon: k, liste: d.kullanimlar });
  };

  const bugun = new Date().toISOString().slice(0, 10);
  return (
    <>
      <SayfaBaslik baslik="Kuponlar" aciklama="Esnaf paket ekranında kodu girer; kartla ödemede indirim uygulanır. Her işletme bir kuponu bir kez kullanır.">
        <button onClick={() => setForm({ ...BOS })} className="btn btn-sm" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>+ Yeni kupon</button>
      </SayfaBaslik>
      <Mesaj m={mesaj} />
      {form && (
        <form onSubmit={kaydet} className="card mb-16" style={{ padding: '16px 18px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div><label style={etiketStil}>Kod</label>
              <input className="input" value={form.kod} placeholder="ILKAY50" onChange={e => setForm({ ...form, kod: e.target.value.toUpperCase() })} style={{ width: '100%' }} required /></div>
            <div><label style={etiketStil}>İndirim</label>
              <div className="row gap-6">
                <select className="input" value={form.tur} onChange={e => setForm({ ...form, tur: e.target.value })} style={{ width: 80 }}>
                  <option value="yuzde">%</option><option value="tl">₺</option>
                </select>
                <input className="input" type="number" min="1" value={form.deger} placeholder={form.tur === 'yuzde' ? '50' : '100'}
                  onChange={e => setForm({ ...form, deger: e.target.value })} style={{ flex: 1 }} required />
              </div></div>
            <div><label style={etiketStil}>Son tarih (boş = süresiz)</label>
              <input className="input" type="date" value={form.son_tarih} onChange={e => setForm({ ...form, son_tarih: e.target.value })} style={{ width: '100%' }} /></div>
            <div><label style={etiketStil}>Toplam kullanım limiti (boş = sınırsız)</label>
              <input className="input" type="number" min="1" value={form.max_kullanim} onChange={e => setForm({ ...form, max_kullanim: e.target.value })} style={{ width: '100%' }} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label style={etiketStil}>Açıklama (esnafa gösterilir)</label>
              <input className="input" value={form.aciklama} placeholder="İlk ayına %50 indirim" onChange={e => setForm({ ...form, aciklama: e.target.value })} style={{ width: '100%' }} /></div>
          </div>
          <div className="mt-12">
            <label style={etiketStil}>Geçerli paketler (hiçbiri seçilmezse hepsi)</label>
            <div className="row gap-12" style={{ flexWrap: 'wrap' }}>
              {PAKETLER.map(([k, ad]) => (
                <label key={k} className="row gap-6" style={{ fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.paketler.includes(k)}
                    onChange={e => setForm({ ...form, paketler: e.target.checked ? [...form.paketler, k] : form.paketler.filter(x => x !== k) })} />{ad}
                </label>
              ))}
              <label className="row gap-6" style={{ fontSize: 13, cursor: 'pointer', marginLeft: 'auto' }}>
                <input type="checkbox" checked={form.aktif} onChange={e => setForm({ ...form, aktif: e.target.checked })} />Aktif
              </label>
            </div>
          </div>
          <div className="row gap-6 mt-12">
            <button type="submit" className="btn btn-sm" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>💾 Kaydet</button>
            <button type="button" onClick={() => setForm(null)} className="btn btn-sm btn-ghost">İptal</button>
          </div>
        </form>
      )}
      {kullanim && (
        <div className="card mb-16" style={{ padding: '14px 18px' }}>
          <div className="row row-between mb-12"><b>{kullanim.kupon.kod} — kullananlar ({kullanim.liste.length})</b>
            <button onClick={() => setKullanim(null)} className="btn btn-sm btn-ghost">Kapat</button></div>
          {kullanim.liste.length === 0 ? <div style={{ fontSize: 13, color: 'var(--dim)' }}>Henüz kullanılmadı.</div>
            : kullanim.liste.map(u => (
              <div key={u.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                {u.isletme_isim || `#${u.isletme_id}`} · {Number(u.tutar_once)}₺ → <b>{Number(u.tutar_sonra)}₺</b> · {zaman(u.zaman)}
              </div>
            ))}
        </div>
      )}
      {!liste ? <div className="list-empty"><p>Yükleniyor…</p></div>
        : liste.length === 0 ? <div className="list-empty"><p>Henüz kupon yok.</p></div>
        : liste.map(k => {
          const bitti = k.son_tarih && String(k.son_tarih).slice(0, 10) < bugun;
          const doldu = k.max_kullanim != null && k.kullanim >= k.max_kullanim;
          return (
            <div key={k.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, opacity: k.aktif && !bitti && !doldu ? 1 : .6 }}>
              <div className="row row-between gap-8" style={{ flexWrap: 'wrap' }}>
                <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <code style={{ fontWeight: 800, fontSize: 15 }}>{k.kod}</code>
                  <span className="tag" style={{ background: 'rgba(31,111,74,.1)', color: '#1f6f4a', fontWeight: 700 }}>{k.indirim_yuzde ? `%${k.indirim_yuzde}` : `${Number(k.indirim_tl)}₺`} indirim</span>
                  {!k.aktif && <span className="tag">Pasif</span>}
                  {bitti && <span className="tag" style={{ color: '#b42318' }}>Süresi doldu</span>}
                  {doldu && <span className="tag" style={{ color: '#b42318' }}>Limit doldu</span>}
                </div>
                <div className="row gap-6">
                  <button onClick={() => kullanimGoster(k)} className="btn btn-sm btn-ghost" style={{ fontSize: 12 }}>Kullananlar</button>
                  <button onClick={() => duzenle(k)} className="btn btn-sm" style={{ background: 'rgba(47,86,198,.1)', color: '#2f56c6', fontWeight: 600 }}>✏️ Düzenle</button>
                  <button onClick={async () => { if (confirm(`${k.kod} silinsin mi? Kullanılmışsa pasife alınır.`)) { const d = await api.del(`/admin/kuponlar/${k.id}`); if (d.pasif) setMesaj({ tur: 'ok', metin: 'Kupon kullanılmış olduğu için silinmedi, pasife alındı.' }); yukle(); } }}
                    className="btn btn-sm" style={{ background: 'var(--red-s)', color: 'var(--red)' }}>Sil</button>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--dim)' }}>
                {k.aciklama && <>{k.aciklama} · </>}
                Kullanım: <b>{k.kullanim}{k.max_kullanim != null ? ` / ${k.max_kullanim}` : ''}</b>
                {' · '}{k.son_tarih ? `Son gün: ${String(k.son_tarih).slice(0, 10)}` : 'Süresiz'}
                {' · '}{k.paketler?.length ? PAKETLER.filter(([p]) => k.paketler.includes(p)).map(([, a]) => a).join(', ') : 'Tüm paketler'}
              </div>
            </div>
          );
        })}
    </>
  );
}
