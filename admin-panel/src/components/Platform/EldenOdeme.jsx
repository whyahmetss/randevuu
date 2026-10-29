import { useEffect, useMemo, useState } from 'react';

// Elden ödeme (2026-10-29): sahada nakit/elden alınan ödeme tek adımda girilir. Paket + kaç ay seçilir, tutar önerilir.
// Ücretli dönem deneme ya da mevcut paket bitince başlar; esnafa "ödemeniz alındı" WhatsApp'ı gider.
const YILLIK_ODENEN_AY = 9;   // 12 ay kullanım için 9 aylık ücret (config/paketler.js ile aynı)
const SURELER = [[1, '1 ay'], [3, '3 ay'], [6, '6 ay'], [12, '1 yıl (9 ay öde)']];
const tarihYaz = (d) => new Date(d).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function EldenOdeme({ api, isletmeler, onKapat, onOk }) {
  const [paketler, setPaketler] = useState([]);
  const [form, setForm] = useState({ isletme_id: '', paket: '', ay: 1, tutar: '', yontem: 'nakit', not: '' });
  const [tutarElle, setTutarElle] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    api.get('/admin/paketler').then(d => setPaketler((d?.paketler || []).filter(p => p.aktif !== false && Number(p.fiyat) > 0))).catch(() => {});
  }, []);

  const isletme = isletmeler.find(i => String(i.id) === String(form.isletme_id));
  const paket = paketler.find(p => p.kod === form.paket);
  // İşletme seçilince mevcut paketi gelsin
  useEffect(() => { if (isletme && !form.paket && paketler.some(p => p.kod === isletme.paket)) set('paket', isletme.paket); }, [isletme, paketler]);
  // Tutar önerisi (elle değiştirilmediyse)
  useEffect(() => {
    if (tutarElle || !paket) return;
    set('tutar', String(Number(paket.fiyat) * (Number(form.ay) === 12 ? YILLIK_ODENEN_AY : Number(form.ay))));
  }, [paket, form.ay, tutarElle]);

  // Ücretli dönem ne zaman başlar / biter (sunucu aynı hesabı yapar)
  const donem = useMemo(() => {
    if (!isletme) return null;
    const bas = new Date(Math.max(Date.now(), new Date(isletme.deneme_bitis_tarihi || 0).getTime(), new Date(isletme.paket_bitis_tarihi || 0).getTime()));
    const bit = new Date(bas); bit.setMonth(bit.getMonth() + Number(form.ay));
    return { bas, bit, denemede: isletme.deneme_bitis_tarihi && new Date(isletme.deneme_bitis_tarihi) > new Date() };
  }, [isletme, form.ay]);

  const kaydet = async (e) => {
    e.preventDefault();
    setHata(null);
    if (!form.isletme_id || !form.paket || !(Number(form.tutar) > 0)) return setHata('İşletme, paket ve tutar zorunlu');
    if (!window.confirm(`${isletme?.isim}: ${form.tutar}₺ ${form.yontem} — ${form.ay} ay ${paket?.isim}. Kaydedilsin mi?\n\nEsnafa "ödemeniz alındı" mesajı gidecek.`)) return;
    setKaydediliyor(true);
    const d = await api.post('/admin/odemeler/elden', { ...form, ay: Number(form.ay), tutar: Number(form.tutar) });
    setKaydediliyor(false);
    if (d?.hata) return setHata(d.hata);
    alert(`✅ Kaydedildi. ${d.isim} paketi ${tarihYaz(d.paket_bitis_tarihi)} tarihine kadar aktif.`);
    onOk?.();
  };

  return (
    <form onSubmit={kaydet} className="form-card card-accent-green" style={{ marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--text)' }}>💵 Elden ödeme gir</div>
      <div className="row row-wrap gap-12" style={{ alignItems: 'flex-end' }}>
        <div>
          <label className="form-label">İşletme</label>
          <select value={form.isletme_id} onChange={e => { set('isletme_id', e.target.value); set('paket', ''); }} required className="input">
            <option value="">Seç...</option>
            {isletmeler.map(i => <option key={i.id} value={i.id}>{i.isim}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Paket</label>
          <select value={form.paket} onChange={e => set('paket', e.target.value)} required className="input">
            <option value="">Seç...</option>
            {paketler.map(p => <option key={p.kod} value={p.kod}>{p.isim} · {Number(p.fiyat)}₺/ay</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Süre</label>
          <select value={form.ay} onChange={e => set('ay', e.target.value)} className="input">
            {SURELER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Tutar (₺)</label>
          <input type="number" min="1" value={form.tutar} onChange={e => { setTutarElle(true); set('tutar', e.target.value); }} required className="input" style={{ width: 110 }} />
        </div>
        <div>
          <label className="form-label">Yöntem</label>
          <select value={form.yontem} onChange={e => set('yontem', e.target.value)} className="input">
            <option value="nakit">Nakit / elden</option>
            <option value="havale">Havale / EFT</option>
            <option value="kart">Kart (POS)</option>
          </select>
        </div>
        <div style={{ flex: '1 1 180px' }}>
          <label className="form-label">Not (isteğe bağlı)</label>
          <input value={form.not} maxLength={200} onChange={e => set('not', e.target.value)} placeholder="Dükkânda elden alındı" className="input" />
        </div>
      </div>
      {donem && (
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
          {donem.denemede ? '🧪 Deneme süresi bozulmaz: ' : ''}ücretli dönem <b>{tarihYaz(donem.bas)}</b> başlar, <b>{tarihYaz(donem.bit)}</b> biter.
        </div>
      )}
      {hata && <div className="alert alert-error" style={{ marginTop: 10 }}>{hata}</div>}
      <div className="row gap-8" style={{ marginTop: 12 }}>
        <button type="submit" disabled={kaydediliyor} className="btn btn-primary btn-sm">{kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}</button>
        <button type="button" onClick={onKapat} className="btn btn-ghost btn-sm">İptal</button>
      </div>
    </form>
  );
}
