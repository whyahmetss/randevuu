import { useEffect, useState } from 'react';

// Kurumsal paket: Grup yönetimi + şube listesi + konsolide rapor
// Props: { api, onSubeSec(id) }
export default function GrupYonetim({ api, onSubeSec }) {
  const [sekme, setSekme] = useState('subeler'); // subeler | rapor | ayarlar
  const [grup, setGrup] = useState(null);
  const [subeler, setSubeler] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [ekleAcik, setEkleAcik] = useState(false);

  useEffect(() => { yukle(); }, []);

  async function yukle() {
    setYukleniyor(true);
    const d = await api.get('/grup');
    if (!d.hata) { setGrup(d.grup); setSubeler(d.subeler || []); }
    setYukleniyor(false);
  }

  if (yukleniyor) return <div style={{ padding: 40, textAlign: 'center' }}>Yükleniyor...</div>;
  if (!grup) return <GrupKur api={api} onOlustu={yukle} />;

  return (
    <div className="grup-yonetim" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏢 {grup.isim}</h2>
          <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>
            Grup Linki: <code>/g/{grup.slug}</code>
          </div>
        </div>
        <button onClick={() => setEkleAcik(true)} style={btnPri}>+ Yeni Şube</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid #333' }}>
        {[['subeler', 'Şubeler'], ['rapor', 'Raporlar'], ['ayarlar', 'Grup Ayarları']].map(([k, l]) => (
          <button key={k} onClick={() => setSekme(k)} style={{
            ...tabBtn, borderBottom: sekme === k ? '2px solid #8B5CF6' : '2px solid transparent',
            color: sekme === k ? '#8B5CF6' : '#ccc'
          }}>{l}</button>
        ))}
      </div>

      {sekme === 'subeler' && <SubelerListe subeler={subeler} api={api} onGuncel={yukle} onSubeSec={onSubeSec} />}
      {sekme === 'rapor' && <GrupRapor api={api} />}
      {sekme === 'ayarlar' && <GrupAyarlar grup={grup} api={api} onGuncel={yukle} />}

      {ekleAcik && <SubeEkleModal api={api} onKapat={() => setEkleAcik(false)} onEklendi={() => { setEkleAcik(false); yukle(); }} />}
    </div>
  );
}

function GrupKur({ api, onOlustu }) {
  const [isim, setIsim] = useState('');
  const [slug, setSlug] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [hata, setHata] = useState('');

  async function kur() {
    if (!isim.trim()) return setHata('Grup ismi zorunlu');
    setKaydediliyor(true); setHata('');
    const d = await api.post('/grup', { isim, slug: slug || undefined });
    setKaydediliyor(false);
    if (d.hata) return setHata(d.hata);
    alert('Grup kuruldu. Değişikliklerin yansıması için yeniden giriş yapmanız gerekebilir.');
    onOlustu();
  }

  return (
    <div style={{ maxWidth: 520, margin: '60px auto', padding: 30, background: '#1a1a2e', borderRadius: 12 }}>
      <h2>🏢 Şube Grubu Kur</h2>
      <p style={{ color: '#aaa', fontSize: 14 }}>
        Kurumsal paketteki zincir işletmeler için grup yönetimi. Bu işletme ilk şube olarak gruba eklenecek.
      </p>
      <label style={lbl}>Grup İsmi</label>
      <input value={isim} onChange={e => setIsim(e.target.value)} placeholder="ör: Kuaför Zinciri X" style={inp} />
      <label style={lbl}>Grup Slug (opsiyonel)</label>
      <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="kuafor-x (/g/kuafor-x)" style={inp} />
      {hata && <div style={{ color: '#f66', marginTop: 10 }}>{hata}</div>}
      <button onClick={kur} disabled={kaydediliyor} style={{ ...btnPri, width: '100%', marginTop: 16 }}>
        {kaydediliyor ? 'Kuruluyor...' : 'Grubu Kur'}
      </button>
    </div>
  );
}

function SubelerListe({ subeler, api, onGuncel, onSubeSec }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {subeler.map(s => (
        <div key={s.id} style={kart}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {s.isim} {s.sube_etiketi && <span style={{ color: '#8B5CF6', fontSize: 13 }}>• {s.sube_etiketi}</span>}
            </div>
            <div style={{ color: '#888', fontSize: 13 }}>
              {s.sehir}{s.ilce ? `, ${s.ilce}` : ''} {s.adres ? ` — ${s.adres}` : ''}
            </div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {s.aktif_randevu || 0} aktif randevu • {s.aktif ? '🟢 Aktif' : '⚪ Pasif'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onSubeSec && onSubeSec(s.id)} style={btnSec}>Yönet →</button>
            <button onClick={async () => {
              if (!confirm(`${s.isim} şubesini pasifleştir?`)) return;
              await api.del(`/grup/sube/${s.id}`);
              onGuncel();
            }} style={btnDel}>Sil</button>
          </div>
        </div>
      ))}
      {subeler.length === 0 && <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>Henüz şube yok.</div>}
    </div>
  );
}

function SubeEkleModal({ api, onKapat, onEklendi }) {
  const [f, setF] = useState({ isim: '', sube_etiketi: '', telefon: '', sehir: '', ilce: '', adres: '', mudur_isim: '', mudur_email: '', mudur_sifre: '' });
  const [hata, setHata] = useState('');
  const [kaydediliyor, setKaydediliyor] = useState(false);

  async function kaydet() {
    if (!f.isim.trim()) return setHata('İşletme ismi zorunlu');
    setKaydediliyor(true); setHata('');
    const d = await api.post('/grup/sube', f);
    setKaydediliyor(false);
    if (d.hata) return setHata(d.hata);
    onEklendi();
  }

  return (
    <div style={overlay}>
      <div style={{ background: '#1a1a2e', borderRadius: 12, padding: 24, width: 'min(560px, 92vw)', maxHeight: '90vh', overflowY: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>+ Yeni Şube</h3>
        {['isim', 'sube_etiketi', 'telefon', 'sehir', 'ilce', 'adres'].map(k => (
          <input key={k} placeholder={k === 'sube_etiketi' ? 'Şube Etiketi (ör: Kadıköy)' : k === 'isim' ? 'İşletme İsmi' : k}
            value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} style={inp} />
        ))}
        <div style={{ fontSize: 12, color: '#888', marginTop: 12 }}>Şube Müdürü (opsiyonel)</div>
        <input placeholder="Müdür İsmi" value={f.mudur_isim} onChange={e => setF({ ...f, mudur_isim: e.target.value })} style={inp} />
        <input placeholder="Müdür Email" value={f.mudur_email} onChange={e => setF({ ...f, mudur_email: e.target.value })} style={inp} />
        <input placeholder="Müdür Şifre" type="password" value={f.mudur_sifre} onChange={e => setF({ ...f, mudur_sifre: e.target.value })} style={inp} />
        {hata && <div style={{ color: '#f66', marginTop: 10 }}>{hata}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onKapat} style={btnSec}>İptal</button>
          <button onClick={kaydet} disabled={kaydediliyor} style={{ ...btnPri, flex: 1 }}>{kaydediliyor ? 'Ekleniyor...' : 'Şubeyi Ekle'}</button>
        </div>
      </div>
    </div>
  );
}

function GrupRapor({ api }) {
  const [rapor, setRapor] = useState(null);
  const [baslangic, setBaslangic] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [bitis, setBitis] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => { yukle(); }, [baslangic, bitis]);
  async function yukle() { setRapor(await api.get(`/grup/raporlar?baslangic=${baslangic}&bitis=${bitis}`)); }

  if (!rapor || rapor.hata) return <div>Yükleniyor...</div>;
  const enYuksek = Math.max(1, ...rapor.subeler.map(s => Number(s.ciro)));

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} style={inp} />
        <input type="date" value={bitis} onChange={e => setBitis(e.target.value)} style={inp} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kart baslik="Toplam Ciro" deger={`₺${Number(rapor.toplam.ciro).toLocaleString('tr-TR')}`} />
        <Kart baslik="Randevu" deger={rapor.toplam.randevu} />
        <Kart baslik="No-Show" deger={rapor.toplam.no_show} />
      </div>
      <h4>Şube Karşılaştırma</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        {rapor.subeler.map(s => (
          <div key={s.id} style={{ background: '#1a1a2e', padding: 12, borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>{s.isim} {s.sube_etiketi && <span style={{ color: '#8B5CF6', fontSize: 12 }}>• {s.sube_etiketi}</span>}</span>
              <span>₺{Number(s.ciro).toLocaleString('tr-TR')} • {s.randevu_sayisi} randevu</span>
            </div>
            <div style={{ height: 6, background: '#333', marginTop: 6, borderRadius: 3 }}>
              <div style={{ height: '100%', width: `${(Number(s.ciro) / enYuksek) * 100}%`, background: 'linear-gradient(90deg,#3B82F6,#8B5CF6)', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
      {rapor.top_calisan?.length > 0 && <>
        <h4 style={{ marginTop: 24 }}>En İyi Çalışanlar</h4>
        <div style={{ display: 'grid', gap: 6 }}>
          {rapor.top_calisan.map((c, i) => (
            <div key={c.id} style={{ background: '#1a1a2e', padding: 10, borderRadius: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>#{i + 1} {c.isim} <span style={{ color: '#888', fontSize: 12 }}>({c.sube})</span></span>
              <span>₺{Number(c.ciro).toLocaleString('tr-TR')} • {c.randevu_sayisi}</span>
            </div>
          ))}
        </div>
      </>}
    </div>
  );
}

function GrupAyarlar({ grup, api, onGuncel }) {
  const [f, setF] = useState({ isim: grup.isim || '', slug: grup.slug || '', logo: grup.logo || '', tanitim: grup.tanitim || '', renk_tema: grup.renk_tema || '#8B5CF6' });
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [msg, setMsg] = useState('');

  async function kaydet() {
    setKaydediliyor(true); setMsg('');
    const d = await api.put('/grup', f);
    setKaydediliyor(false);
    if (d.hata) return setMsg(`❌ ${d.hata}`);
    setMsg('✓ Kaydedildi');
    onGuncel();
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <label style={lbl}>Grup İsmi</label>
      <input value={f.isim} onChange={e => setF({ ...f, isim: e.target.value })} style={inp} />
      <label style={lbl}>Slug (Grup Linki)</label>
      <input value={f.slug} onChange={e => setF({ ...f, slug: e.target.value })} style={inp} />
      <label style={lbl}>Logo URL</label>
      <input value={f.logo} onChange={e => setF({ ...f, logo: e.target.value })} style={inp} />
      <label style={lbl}>Tanıtım Metni</label>
      <textarea value={f.tanitim} onChange={e => setF({ ...f, tanitim: e.target.value })} style={{ ...inp, minHeight: 80 }} />
      <label style={lbl}>Renk Teması</label>
      <input type="color" value={f.renk_tema} onChange={e => setF({ ...f, renk_tema: e.target.value })} style={{ width: 60, height: 36 }} />
      {msg && <div style={{ margin: '10px 0', color: msg.startsWith('✓') ? '#6f6' : '#f66' }}>{msg}</div>}
      <div style={{ marginTop: 16 }}>
        <button onClick={kaydet} disabled={kaydediliyor} style={btnPri}>{kaydediliyor ? 'Kaydediliyor...' : 'Kaydet'}</button>
      </div>
    </div>
  );
}

function Kart({ baslik, deger }) {
  return (
    <div style={{ background: '#1a1a2e', padding: 16, borderRadius: 10, border: '1px solid #2a2a3e' }}>
      <div style={{ color: '#888', fontSize: 12 }}>{baslik}</div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4 }}>{deger}</div>
    </div>
  );
}

// Stiller
const btnPri = { padding: '10px 16px', background: 'linear-gradient(90deg,#3B82F6,#8B5CF6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 };
const btnSec = { padding: '8px 14px', background: '#2a2a3e', color: '#ccc', border: '1px solid #3a3a4e', borderRadius: 6, cursor: 'pointer' };
const btnDel = { padding: '8px 14px', background: '#3a1a2a', color: '#f88', border: '1px solid #5a2a3a', borderRadius: 6, cursor: 'pointer' };
const inp = { width: '100%', padding: 10, background: '#0f0f1e', border: '1px solid #2a2a3e', borderRadius: 6, color: '#fff', marginBottom: 10, fontSize: 14 };
const lbl = { display: 'block', fontSize: 12, color: '#aaa', marginBottom: 4, marginTop: 8 };
const tabBtn = { background: 'transparent', color: '#ccc', border: 'none', padding: '10px 16px', cursor: 'pointer', fontWeight: 600 };
const kart = { display: 'flex', alignItems: 'center', gap: 12, background: '#1a1a2e', padding: 14, borderRadius: 10, border: '1px solid #2a2a3e' };
const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
