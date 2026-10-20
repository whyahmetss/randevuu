import { useEffect, useMemo, useRef, useState } from 'react';

// Satış Bot ayarları (kullanıcı kararı 2026-10-17): her tıklama ayrı kaydedilip birbirinin üstüne yazıyordu,
// bazı seçimler (takip 0, limit 50 üstü) eski hâline dönüyordu. Artık taslak + tek "Kaydet".
const MODLAR = [
  ['hepsi', '🚀', 'Tam Mod', 'Soğuk mesaj + cevap + kayıt', '#1f6f4a'],
  ['sadece_kayit', '📝', 'Sadece Kayıt', 'Yalnız "kayıt" yazanlara hesap açar', '#2f56c6'],
  ['sadece_satis', '📤', 'Sadece Satış', 'Soğuk mesaj atar, gelen mesaja cevap vermez', '#a8590c'],
  ['sadece_ai', '🤖', 'Sadece AI', 'Yeni kimseye yazmaz, gelenlere cevap verir', '#5d4bb5'],
  ['kapali', '⏸️', 'Kapalı', 'Bağlı kalır, hiçbir şey yapmaz', '#b42318'],
];
const ACIK_KAPA = [
  ['kayitAktif', '📝 WhatsApp kayıt', '"kayıt" yazana sohbette hesap açar'],
  ['otopilotKurulum', '🧭 Otopilot kurulum', 'Kayıttan sonra hizmet, çalışan ve WhatsApp bağlantısını sohbette kurar'],
  ['aiCevapAktif', '🤖 Yapay zekâ cevap', 'Kapalıysa hazır kurallarla cevap verir'],
  ['gelenMesajCevap', '💬 Gelen mesaja cevap', 'Kapalıysa yalnız kaydeder, cevap vermez'],
  ['takipAktif', '🔔 Takip mesajı', 'Cevap vermeyene hatırlatma'],
  ['typingIndicator', '✍️ "Yazıyor…" göster', 'İnsan gibi görünür (ban riskini azaltır)'],
  ['mesajBirlestir', '🧩 Parça mesajları birleştir', 'Art arda yazılanları bekleyip tek cevap verir'],
  ['tatil', '🏖️ Tatil', 'Bugün soğuk mesaj gönderme'],
];
const KATEGORILER = ['berber', 'kuaför', 'güzellik salonu', 'dövme', 'tırnak salonu', 'cilt bakım', 'spa', 'diş kliniği', 'veteriner', 'diyetisyen', 'psikolog', 'fizyoterapi', 'pilates', 'oto yıkama'];
const VARSAYILAN = { mod: 'hepsi', mesaiBaslangic: 9, mesaiBitis: 19, gunlukLimit: 80, minBekleme: 5, maxBekleme: 10, takipSaati: 12, maxTakipSayisi: 2,
  typingMinMs: 2000, typingMaxMs: 6000, mesajBekleMs: 8000, insanSessizSaat: 24, frenSertRedLimit: 3, frenOlumsuzMin: 8, frenOlumsuzOran: 0.25, frenAyniHata: 3,
  mesajBirlestir: true, hedefKategori: '', sohbetteBekleDk: 5, guvenMetni: '' };

const kutu = { background: 'var(--bg)', borderRadius: 12, padding: 14 };
const etiket = { fontSize: 11, color: 'var(--dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', display: 'block', marginBottom: 6 };
const girdi = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' };
const baslik = (t, alt) => (
  <div style={{ margin: '20px 0 10px' }}>
    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)' }}>{t}</div>
    {alt && <div style={{ fontSize: 12, color: 'var(--dim)' }}>{alt}</div>}
  </div>
);

function Sayi({ ad, deger, set, min, max, adim = 1, birim, aciklama }) {
  return (
    <div style={kutu}>
      <label style={etiket}>{ad}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" min={min} max={max} step={adim} value={deger ?? ''} onChange={e => set(e.target.value === '' ? '' : Number(e.target.value))} style={girdi} />
        {birim && <span style={{ fontSize: 12, color: 'var(--dim)', whiteSpace: 'nowrap' }}>{birim}</span>}
      </div>
      {aciklama && <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>{aciklama}</div>}
    </div>
  );
}

export default function BotAyarlari({ api, ayarlar, onKaydedildi }) {
  // Panel bot durumunu birkaç saniyede bir yeniler: aynı içerik yeni nesne olarak gelir. İçerik değişmedikçe ve
  // kullanıcı düzenlerken taslak ezilmez (eski ekranda seçimin "geri dönmesinin" bir sebebi buydu).
  const kaynakJson = JSON.stringify(ayarlar || {});
  const kaynak = useMemo(() => ({ ...VARSAYILAN, ...JSON.parse(kaynakJson) }), [kaynakJson]);
  const [t, setT] = useState(kaynak);
  const [bekle, setBekle] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const degisti = Object.keys(t).some(k => JSON.stringify(t[k]) !== JSON.stringify(kaynak[k]));
  const degistiRef = useRef(false);
  degistiRef.current = degisti;
  useEffect(() => { if (!degistiRef.current) setT(kaynak); }, [kaynak]);
  const set = (k) => (v) => setT(x => ({ ...x, [k]: v }));

  const kaydet = async () => {
    setBekle(true);
    const gonder = { ...t };
    for (const k of Object.keys(gonder)) if (gonder[k] === '' && k !== 'guvenMetni') delete gonder[k];   // güven metni silinebilsin
    const d = await api.put('/admin/satis-bot/ayarlar', gonder);
    setBekle(false);
    if (d?.hata) { setMesaj({ tip: 'hata', metin: d.hata }); return; }
    if (d?.ayarlar) setT({ ...VARSAYILAN, ...d.ayarlar });
    setMesaj({ tip: 'ok', metin: 'Ayarlar kaydedildi' });
    setTimeout(() => setMesaj(null), 3000);
    onKaydedildi?.();
  };

  const mod = MODLAR.find(m => m[0] === (t.mod || 'hepsi')) || MODLAR[0];
  const tahminiSure = t.gunlukLimit && t.minBekleme && t.maxBekleme ? Math.round((t.gunlukLimit * (t.minBekleme + t.maxBekleme) / 2) / 60 * 10) / 10 : null;
  const mesaiSaat = (t.mesaiBitis ?? 0) - (t.mesaiBaslangic ?? 0);

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, border: '1px solid var(--border)', marginBottom: 24, position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--text)' }}>Bot Ayarları</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>Değiştir, sonra <b>Kaydet</b>. Kaydetmeden çıkarsan değişmez.</div>
        </div>
        <span style={{ flex: 1 }} />
        {mesaj && <span style={{ fontSize: 13, fontWeight: 700, color: mesaj.tip === 'ok' ? '#1f6f4a' : '#b42318' }}>{mesaj.tip === 'ok' ? '✓ ' : '⚠️ '}{mesaj.metin}</span>}
        <button disabled={!degisti || bekle} onClick={() => setT(kaynak)} className="btn btn-ghost btn-sm">Vazgeç</button>
        <button disabled={!degisti || bekle} onClick={kaydet} className="btn btn-sm" style={{ background: degisti ? '#1f6f4a' : 'var(--bg)', color: degisti ? '#fff' : 'var(--dim)', fontWeight: 700, border: 'none' }}>{bekle ? 'Kaydediliyor…' : '💾 Kaydet'}</button>
      </div>

      {baslik('🎮 Çalışma modu')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8 }}>
        {MODLAR.map(([k, ikon, ad, , renk]) => (
          <button key={k} onClick={() => set('mod')(k)} style={{ padding: '12px 8px', borderRadius: 12, border: t.mod === k ? `2px solid ${renk}` : '2px solid transparent', background: t.mod === k ? `${renk}12` : 'var(--bg)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <div style={{ fontSize: 22 }}>{ikon}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.mod === k ? renk : 'var(--dim)' }}>{ad}</div>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: mod[4], fontWeight: 600 }}>{mod[1]} {mod[3]}</div>

      {baslik('🔘 Özellikler')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
        {ACIK_KAPA.map(([k, ad, aciklama]) => {
          const acik = k === 'mesajBirlestir' ? t[k] !== false : !!t[k];
          return (
            <div key={k} onClick={() => set(k)(!acik)} role="switch" aria-checked={acik} aria-label={ad}
              style={{ ...kutu, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, border: acik ? '1px solid rgba(31,111,74,.25)' : '1px solid transparent' }}>
              <div style={{ width: 38, height: 22, borderRadius: 11, background: acik ? '#1f6f4a' : 'rgba(111,106,98,.25)', position: 'relative', flexShrink: 0 }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', position: 'absolute', top: 2, left: acik ? 18 : 2, transition: 'left .15s' }} />
              </div>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{ad}</div><div style={{ fontSize: 11, color: 'var(--dim)' }}>{aciklama}</div></div>
            </div>
          );
        })}
      </div>

      {baslik('📤 Soğuk mesaj gönderimi', tahminiSure ? `Günlük ${t.gunlukLimit} mesaj ortalama ${tahminiSure} saat sürer; mesai ${mesaiSaat > 0 ? mesaiSaat : 0} saat.${tahminiSure > mesaiSaat ? ' Limit mesaiye sığmıyor, gün bitince kalan yarına kalır.' : ''}` : null)}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <div style={kutu}>
          <label style={etiket}>Mesai başlangıç</label>
          <select value={t.mesaiBaslangic} onChange={e => set('mesaiBaslangic')(Number(e.target.value))} style={girdi}>
            {Array.from({ length: 24 }, (_, s) => <option key={s} value={s}>{String(s).padStart(2, '0')}:00</option>)}
          </select>
        </div>
        <div style={kutu}>
          <label style={etiket}>Mesai bitiş</label>
          <select value={t.mesaiBitis} onChange={e => set('mesaiBitis')(Number(e.target.value))} style={girdi}>
            {Array.from({ length: 24 }, (_, i) => i + 1).map(s => <option key={s} value={s}>{s === 24 ? '00:00 (gece)' : `${String(s).padStart(2, '0')}:00`}</option>)}
          </select>
        </div>
        <Sayi ad="Günlük limit" deger={t.gunlukLimit} set={set('gunlukLimit')} min={1} max={500} birim="mesaj" aciklama="Bağlı numaralara bölünür; yeni numara az başlar" />
        <Sayi ad="En az bekleme" deger={t.minBekleme} set={set('minBekleme')} min={1} max={120} birim="dk" />
        <Sayi ad="En çok bekleme" deger={t.maxBekleme} set={set('maxBekleme')} min={1} max={240} birim="dk" aciklama="İki mesaj arası bu aralıkta rastgele" />
        <div style={kutu}>
          <label style={etiket}>Hedef kategori</label>
          <select value={t.hedefKategori || ''} onChange={e => set('hedefKategori')(e.target.value)} style={girdi}>
            <option value="">Tüm kategoriler</option>
            {KATEGORILER.map(k => <option key={k} value={k}>{k.charAt(0).toLocaleUpperCase('tr') + k.slice(1)}</option>)}
          </select>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Aktif kampanya varsa önce kampanyanın kategorisi</div>
        </div>
      </div>

      {baslik('🔔 Takip (cevap vermeyene hatırlatma)')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Sayi ad="Kaç saat sonra" deger={t.takipSaati} set={set('takipSaati')} min={1} max={168} birim="saat" />
        <div style={kutu}>
          <label style={etiket}>En fazla takip</label>
          <select value={t.maxTakipSayisi ?? 2} onChange={e => set('maxTakipSayisi')(Number(e.target.value))} style={girdi}>
            {[0, 1, 2, 3, 4, 5].map(s => <option key={s} value={s}>{s === 0 ? 'Takip yok' : `${s} kez`}</option>)}
          </select>
        </div>
      </div>

      {baslik('🗣️ Konuşma davranışı')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Sayi ad="Birleştirme bekleme" deger={t.mesajBekleMs != null ? t.mesajBekleMs / 1000 : ''} set={v => set('mesajBekleMs')(v === '' ? '' : Math.round(v * 1000))} min={0} max={60} birim="sn" aciklama="Esnaf parça parça yazınca bu kadar bekleyip tek cevap" />
        <Sayi ad="'Yazıyor' en az" deger={t.typingMinMs != null ? t.typingMinMs / 1000 : ''} set={v => set('typingMinMs')(v === '' ? '' : Math.round(v * 1000))} min={0.5} max={30} adim={0.5} birim="sn" />
        <Sayi ad="'Yazıyor' en çok" deger={t.typingMaxMs != null ? t.typingMaxMs / 1000 : ''} set={v => set('typingMaxMs')(v === '' ? '' : Math.round(v * 1000))} min={0.5} max={60} adim={0.5} birim="sn" />
        <Sayi ad="Elle yazınca bot susar" deger={t.insanSessizSaat} set={set('insanSessizSaat')} min={0} max={720} birim="saat" aciklama="Telefondan sen yazınca o sohbette bot bu kadar susar (0 = susmaz)" />
        <Sayi ad="Sohbet varken bekle" deger={t.sohbetteBekleDk} set={set('sohbetteBekleDk')} min={0} max={60} birim="dk" aciklama="Bir numaraya aday cevap yazınca o numara bu kadar yeni kişiye 'Merhaba' atmaz, önce sohbet (0 = beklemez)" />
      </div>

      {baslik('🤝 Güven bilgisi', 'Esnaf "dolandırıcı mısınız, kimsiniz" diye şüphelenince bot bunu söyler. Yalnız doğru bilgi yaz; boşsa bot referans uydurmaz.')}
      <div style={kutu}>
        <textarea value={t.guvenMetni || ''} onChange={e => set('guvenMetni')(e.target.value.slice(0, 400))} rows={3}
          placeholder="Örn: Bandırma'da Elit Barber Shop kullanıyor (izinli). Instagram: @siragoapp"
          style={{ ...girdi, fontWeight: 500, resize: 'vertical' }} />
        <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>{(t.guvenMetni || '').length}/400 · Referans dükkân yazacaksan önce esnafın iznini al.</div>
      </div>

      {baslik('🛑 Otomatik fren (ban koruması)', 'Eşik aşılınca soğuk mesaj durur, Telegram\'a haber gelir. Elle yeniden başlatınca sayaç o andan itibaren sayar.')}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Sayi ad="Sert ret sınırı" deger={t.frenSertRedLimit} set={set('frenSertRedLimit')} min={1} max={50} birim="kişi/gün" aciklama='"yazmayın, spam, şikâyet" diyen' />
        <Sayi ad="Olumsuz en az" deger={t.frenOlumsuzMin} set={set('frenOlumsuzMin')} min={1} max={200} birim="kişi" aciklama="Oran bu sayıdan sonra devreye girer" />
        <Sayi ad="Olumsuz oranı" deger={t.frenOlumsuzOran != null ? Math.round(t.frenOlumsuzOran * 100) : ''} set={v => set('frenOlumsuzOran')(v === '' ? '' : v / 100)} min={5} max={100} birim="%" aciklama="Bugün yazılanların bu oranından fazlası ret" />
        <Sayi ad="Aynı hata" deger={t.frenAyniHata} set={set('frenAyniHata')} min={1} max={20} birim="kez üst üste" />
      </div>

      {degisti && (
        <div style={{ position: 'sticky', bottom: 12, marginTop: 18, padding: '12px 16px', borderRadius: 12, background: '#1d1b16', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 6px 24px rgba(0,0,0,.25)', zIndex: 5 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Kaydedilmemiş değişiklik var</span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setT(kaynak)} disabled={bekle} style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,.3)', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>Vazgeç</button>
          <button onClick={kaydet} disabled={bekle} style={{ background: '#25d366', color: '#0b3d24', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>{bekle ? 'Kaydediliyor…' : '💾 Kaydet'}</button>
        </div>
      )}
    </div>
  );
}
