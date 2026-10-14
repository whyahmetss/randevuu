import { useState, useEffect } from 'react';

// Sekreter modu + sesli mesaj ayarları (2026-10-14). WhatsApp Bağlantısı sayfasının altında.
const ORNEKLER = [
  ['📋', 'bugün kimler var', 'günün listesi'],
  ['⛔', 'bugün 14-16 kapat', 'o saatlere randevu verilmez'],
  ['✅', 'yarın 14-16 aç', 'kapattığını geri açar'],
  ['✍️', "Ahmet'e yarın 15:00 saç kesimi yaz", 'randevuyu kaydeder'],
  ['↩️', 'son randevuyu sil', 'yanlış yazdıysan'],
];

export default function SekreterKarti({ api }) {
  const [d, setD] = useState(null);
  const [tel, setTel] = useState('');
  const [mesaj, setMesaj] = useState(null);

  useEffect(() => { api.get('/bot/sekreter').then(x => { if (x && !x.hata) { setD(x); setTel(x.sekreter_telefon ? '0' + String(x.sekreter_telefon).slice(2) : ''); } }); }, []);
  const kaydet = async (govde) => {
    setMesaj(null);
    const x = await api.put('/bot/sekreter', govde);
    if (x?.hata) return setMesaj({ hata: x.hata });
    setD(o => ({ ...o, ...govde, ...(govde.sekreter_telefon !== undefined ? { sekreter_telefon: govde.sekreter_telefon } : {}) }));
    setMesaj({ tamam: 'Kaydedildi' }); setTimeout(() => setMesaj(null), 2000);
  };
  if (!d) return null;

  const kart = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, marginTop: 16 };
  const anahtar = (deger, degistir, etiket) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
      <input type="checkbox" className="anahtar" role="switch" checked={deger} onChange={e => degistir(e.target.checked)} aria-label={etiket} />
      <span style={{ fontWeight: 600, fontSize: 13, color: deger ? '#1f6f4a' : 'var(--dim)' }}>{deger ? 'Açık' : 'Kapalı'}</span>
    </label>
  );

  const tarzBtn = (deger, baslik, ornek) => (
    <button onClick={() => kaydet({ bot_tarzi: deger })} aria-pressed={d.bot_tarzi === deger}
      style={{ flex: '1 1 220px', textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
        border: `2px solid ${d.bot_tarzi === deger ? '#1f6f4a' : 'var(--border)'}`, background: d.bot_tarzi === deger ? 'rgba(31,111,74,.06)' : 'var(--surface)' }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{d.bot_tarzi === deger ? '✓ ' : ''}{baslik}</div>
      <div style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 4, whiteSpace: 'pre-line' }}>{ornek}</div>
    </button>
  );

  return (
    <>
      <div style={kart}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 26 }}>💬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Asistan nasıl konuşsun?</div>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>Müşterine numaralı menü yerine bir insan gibi soru sorabilir.</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {tarzBtn('sohbet', 'Sohbet (önerilen)', '— Randevu alacaktım\n— Tabii! Hangi gün gelmek istersiniz?\n— Yarın 3\'te\n— Maalesef 15:00 dolu. 15:40 uygun mu?')}
          {tarzBtn('menu', 'Numaralı menü', '1️⃣ Randevu al\n2️⃣ Randevularım\n3️⃣ Randevu iptal')}
        </div>
      </div>

      <div style={kart}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 26 }}>🤵</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sekreter modu</div>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>
              Panele girmeden işini WhatsApp'tan hallet. Telefonunda WhatsApp'ı aç, kendi adına (<b>"Kendime mesaj"</b>) yaz ya da sesli söyle.
            </div>
          </div>
          {anahtar(d.sekreter_aktif, v => kaydet({ sekreter_aktif: v }), 'Sekreter modu')}
        </div>
        {d.sekreter_aktif && (
          <>
            <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
              {ORNEKLER.map(([ik, komut, ne]) => (
                <div key={komut} style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14 }}>
                  <span>{ik}</span><code style={{ background: 'var(--bg)', borderRadius: 6, padding: '2px 8px', fontSize: 13 }}>{komut}</code>
                  <span style={{ color: 'var(--dim)', fontSize: 12.5 }}>{ne}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Başka bir telefondan da komut ver <span style={{ fontWeight: 500, color: 'var(--dim)' }}>(isteğe bağlı)</span></div>
              <div style={{ fontSize: 12.5, color: 'var(--dim)', margin: '4px 0 8px' }}>Dükkânın WhatsApp hattı ayrıysa kendi cep numaranı yaz; o numaradan bota yazdığın komutları da anlar. Yalnız kendi numaranı yaz: bu numara günün müşteri listesini görebilir.</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className="input" value={tel} onChange={e => setTel(e.target.value)} placeholder={d.kayit_telefon || '05xx xxx xx xx'} inputMode="tel" style={{ flex: '1 1 200px', fontSize: 15 }} aria-label="Komut verecek telefon" />
                <button className="btn btn-primary" onClick={() => kaydet({ sekreter_telefon: tel.trim() })}>Kaydet</button>
                {d.sekreter_telefon && <button className="btn btn-ghost" onClick={() => { setTel(''); kaydet({ sekreter_telefon: '' }); }}>Kaldır</button>}
              </div>
            </div>
          </>
        )}
      </div>

      <div style={kart}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontSize: 26 }}>🎤</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Sesli mesajla randevu</div>
            <div style={{ fontSize: 13, color: 'var(--dim)', marginTop: 2 }}>
              Müşteri ses kaydı atınca bot dinleyip yazıya çevirir ve cevap verir. Cevabın başında ne anladığını yazar; yanlış anladıysa müşteri düzeltebilir.
            </div>
          </div>
          {anahtar(d.sesli_mesaj_aktif, v => kaydet({ sesli_mesaj_aktif: v }), 'Sesli mesaj')}
        </div>
      </div>
      {mesaj && <div className={`alert alert-${mesaj.hata ? 'error' : 'success'}`} style={{ marginTop: 10 }}>{mesaj.hata || mesaj.tamam}</div>}
    </>
  );
}
