import { useEffect, useMemo, useState } from 'react';

// Satış Bot → Konuşmalar (kullanıcı kararı 2026-10-17): listeden birine tıklayınca kimle ne konuşulmuş baştan sona
// görünür: ilk mesaj, takipler, WhatsApp Business otomatik mesajı, müşteri / bot / telefondan elle yazılanlar.
const DURUM = {
  bekliyor: ['⏳', 'Cevap bekliyor', '#a8590c'],
  ai_devrede: ['🤖', 'Bot konuşuyor', '#5d4bb5'],
  sicak: ['🔥', 'Sıcak', '#c2410c'],
  olumlu: ['✅', 'Olumlu', '#1f6f4a'],
  musteri: ['🎉', 'Müşteri oldu', '#1f6f4a'],
  olumsuz: ['❌', 'Olumsuz', '#b42318'],
  elle: ['👤', 'Elle yazıldı', '#2f56c6'],
};
const durumBilgi = (d) => DURUM[d] || ['💬', d || '—', '#6f6a62'];
const YER_TUTUCU = ['Müşteri kendisi yazdı', 'Elle yazıldı'];

const tarihYaz = (t, saatli = true) => t ? new Date(t).toLocaleString('tr-TR', saatli
  ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'long' }) : '';

// Kayıt biçimi: gonderilen_mesaj = ilk mesaj + "\n[Takip #n] …"; gelen_mesajlar = "\n[SS:DD:ss] Müşteri|Bot|Elle: …"
export function sohbetAyikla(k) {
  const out = [];
  const parca = String(k?.gonderilen_mesaj || '').split(/\n\[Takip #(\d+)\]\s*/);
  const acilis = parca[0].trim();
  if (acilis && !YER_TUTUCU.includes(acilis)) out.push({ kim: 'bot', metin: acilis, etiket: 'İlk mesaj', saat: tarihYaz(k.olusturma_tarihi) });
  for (let i = 1; i < parca.length; i += 2) out.push({ kim: 'bot', metin: (parca[i + 1] || '').trim(), etiket: `Takip #${parca[i]}` });
  if (k?.otomatik_yanit) out.push({ kim: 'oto', metin: k.otomatik_yanit, etiket: 'WhatsApp Business otomatik mesajı — bot cevap vermedi' });
  for (const satir of String(k?.gelen_mesajlar || '').split('\n')) {
    if (!satir.trim()) continue;
    const m = satir.match(/^\[([^\]]*)\]\s*(Müşteri|Bot|Elle):\s?([\s\S]*)$/);
    if (!m) { if (out.length) out[out.length - 1].metin += '\n' + satir; continue; }
    out.push({ kim: { Müşteri: 'musteri', Bot: 'bot', Elle: 'sen' }[m[2]], metin: m[3], saat: m[1].slice(0, 5) });
  }
  return out;
}

const BALON = {
  musteri: { yan: 'flex-start', bg: 'var(--surface)', renk: 'var(--text)', ad: 'Müşteri' },
  bot: { yan: 'flex-end', bg: '#d9fdd3', renk: '#111b21', ad: '🤖 Bot' },
  sen: { yan: 'flex-end', bg: '#dbe7ff', renk: '#111b21', ad: '👤 Sen (telefondan)' },
  oto: { yan: 'flex-start', bg: 'transparent', renk: 'var(--dim)', ad: '' },
};

function Balon({ m }) {
  const b = BALON[m.kim] || BALON.musteri;
  return (
    <div style={{ display: 'flex', justifyContent: b.yan }}>
      <div style={{ maxWidth: '82%', background: b.bg, color: b.renk, borderRadius: 12, padding: '7px 10px 5px', fontSize: 14, lineHeight: 1.4,
        border: m.kim === 'oto' ? '1px dashed var(--border)' : m.kim === 'musteri' ? '1px solid var(--border)' : 'none', fontStyle: m.kim === 'oto' ? 'italic' : 'normal' }}>
        {(b.ad || m.etiket) && <div style={{ fontSize: 11, fontWeight: 700, opacity: .7, marginBottom: 2 }}>{[b.ad, m.etiket].filter(Boolean).join(' · ')}</div>}
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{m.metin}</div>
        {m.saat && <div style={{ fontSize: 10, opacity: .55, textAlign: 'right', marginTop: 2 }}>{m.saat}</div>}
      </div>
    </div>
  );
}

function Sohbet({ k, api, etiket, kapat, degisti, sessizSaat }) {
  const mesajlar = useMemo(() => sohbetAyikla(k), [k]);
  const [islem, setIslem] = useState(false);
  const [, d, dRenk] = durumBilgi(k.durum);
  const sustu = k.insan_devraldi && sessizSaat > 0 && Date.now() - new Date(k.insan_devraldi).getTime() < sessizSaat * 3600 * 1000;
  const botAyarla = async (acik) => {
    setIslem(true);
    try { await api.put(`/admin/satis-bot/konusmalar/${k.id}/bot`, { acik }); await degisti(); } finally { setIslem(false); }
  };
  const tel = String(k.telefon || '').replace(/\D/g, '');
  const dugme = { padding: '7px 12px', borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration: 'none', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', fontFamily: 'inherit' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={kapat} className="konusma-geri" style={{ ...dugme, padding: '7px 10px' }} aria-label="Listeye dön">←</button>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{k.isletme_adi || 'İsimsiz'}</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            +{tel} {k.kategori && k.kategori !== 'genel' ? `· ${etiket ? etiket(k.kategori) : k.kategori}` : ''} · <span style={{ color: dRenk, fontWeight: 700 }}>{d}</span>
            {k.takip_sayisi > 0 ? ` · ${k.takip_sayisi} takip` : ''}
          </div>
        </div>
        <a href={`https://wa.me/${tel}`} target="_blank" rel="noreferrer" style={{ ...dugme, background: '#25d366', color: '#fff', border: 'none' }}>💬 WhatsApp</a>
        <a href={`tel:+${tel}`} style={dugme}>📞 Ara</a>
      </div>

      {sustu ? (
        <div style={{ padding: '8px 14px', background: 'rgba(47,86,198,.07)', fontSize: 12, color: '#2f56c6', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>👤 Sohbeti sen devraldın ({tarihYaz(k.insan_devraldi)}) — bot bu kişiye {sessizSaat} saat yazmaz.</span>
          <button disabled={islem} onClick={() => botAyarla(true)} style={{ ...dugme, padding: '5px 10px' }}>Botu geri aç</button>
        </div>
      ) : (
        <div style={{ padding: '8px 14px', background: 'var(--bg)', fontSize: 12, color: 'var(--dim)', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>🤖 Bot bu sohbette cevap veriyor.{sessizSaat > 0 ? '' : ' (Ayarlar → "Elle yazınca bot susar" 0 saat: susturma kapalı)'}</span>
          {sessizSaat > 0 && <button disabled={islem} onClick={() => botAyarla(false)} style={{ ...dugme, padding: '5px 10px' }}>Botu sustur, ben konuşacağım</button>}
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg)' }}>
        {mesajlar.length === 0 && <div style={{ textAlign: 'center', color: 'var(--dim)', fontSize: 13, padding: 30 }}>Bu sohbette kayıtlı mesaj yok.</div>}
        {mesajlar.map((m, i) => <Balon key={i} m={m} />)}
      </div>
    </div>
  );
}

export default function Konusmalar({ api, konusmalar, etiket, sessizSaat = 24, yenile }) {
  const [secili, setSecili] = useState(null);
  const [ara, setAra] = useState('');
  const [filtre, setFiltre] = useState('hepsi');
  const [sonuc, setSonuc] = useState(null); // sunucu araması (son 50'nin dışındakiler için)

  useEffect(() => {
    const q = ara.trim();
    if (q.length < 2) { setSonuc(null); return; }
    const t = setTimeout(async () => {
      try { const r = await api.get(`/admin/satis-bot/konusmalar?q=${encodeURIComponent(q)}`); setSonuc(r?.konusmalar || []); } catch { setSonuc(null); }
    }, 350);
    return () => clearTimeout(t);
  }, [ara, api]);

  const kaynak = sonuc || konusmalar || [];
  const liste = kaynak.filter(k => filtre === 'hepsi' ? true
    : filtre === 'cevap' ? !!k.gelen_mesajlar
      : filtre === 'elle' ? !!k.insan_devraldi : k.durum === filtre);
  // Seçili konuşma liste yenilenince güncel hâliyle gösterilir
  const acik = secili && (kaynak.find(k => k.id === secili.id) || secili);

  const degisti = async () => {
    if (sonuc) { const r = await api.get(`/admin/satis-bot/konusmalar?q=${encodeURIComponent(ara.trim())}`); setSonuc(r?.konusmalar || []); }
    await yenile?.();
  };

  const FILTRE = [['hepsi', 'Hepsi'], ['cevap', 'Cevap verenler'], ['sicak', '🔥 Sıcak'], ['olumlu', '✅ Olumlu'], ['musteri', '🎉 Müşteri'], ['olumsuz', '❌ Olumsuz'], ['elle', '👤 Elle']];

  return (
    <div className={`konusmalar-kutu${acik ? ' acik' : ''}`} style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', marginBottom: 24, overflow: 'hidden' }}>
      <style>{`
        .konusmalar-izgara { display: grid; grid-template-columns: minmax(260px, 360px) 1fr; height: min(72vh, 760px); }
        .konusmalar-kutu .konusma-geri { display: none; }
        @media (max-width: 820px) {
          .konusmalar-izgara { grid-template-columns: 1fr; height: auto; }
          .konusmalar-kutu.acik .konusma-liste { display: none !important; }
          .konusmalar-kutu:not(.acik) .konusma-detay { display: none; }
          .konusmalar-kutu .konusma-geri { display: inline-block; }
          .konusmalar-kutu .konusma-detay { height: 78vh; }
        }
      `}</style>
      <div className="konusmalar-izgara">
        <div className="konusma-liste" style={{ borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 8 }}>Konuşmalar <span style={{ fontSize: 12, color: 'var(--dim)', fontWeight: 500 }}>{liste.length}</span></div>
            <input value={ara} onChange={e => setAra(e.target.value)} placeholder="İsim, telefon ya da mesajda ara…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {FILTRE.map(([id, ad]) => (
                <button key={id} onClick={() => setFiltre(id)} style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                  border: '1px solid ' + (filtre === id ? '#5d4bb5' : 'var(--border)'), background: filtre === id ? 'rgba(93,75,181,.1)' : 'transparent', color: filtre === id ? '#5d4bb5' : 'var(--dim)' }}>{ad}</button>
              ))}
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1, maxHeight: '100%' }}>
            {liste.length === 0 && <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--dim)', fontSize: 13 }}>{ara ? 'Eşleşen konuşma yok.' : 'Henüz konuşma yok. Botu başlat!'}</div>}
            {liste.map(k => {
              const [ikon, , renk] = durumBilgi(k.durum);
              const son = sohbetAyikla(k).pop();
              return (
                <button key={k.id} onClick={() => setSecili(k)} style={{ display: 'flex', gap: 10, width: '100%', padding: '10px 12px', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                  background: acik?.id === k.id ? 'rgba(93,75,181,.08)' : 'transparent', textAlign: 'left', fontFamily: 'inherit', alignItems: 'center' }}>
                  <span style={{ width: 36, height: 36, borderRadius: 18, background: `${renk}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{ikon}</span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{k.isletme_adi || '+' + k.telefon}</span>
                      <span style={{ fontSize: 10, color: 'var(--dim)', whiteSpace: 'nowrap' }}>{tarihYaz(k.son_mesaj_tarihi || k.olusturma_tarihi)}</span>
                    </span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {son ? `${{ musteri: '', bot: 'Bot: ', sen: 'Sen: ', oto: 'Otomatik: ' }[son.kim]}${son.metin}` : '—'}
                    </span>
                  </span>
                  {k.insan_devraldi && <span title="Elle devralındı" style={{ fontSize: 12 }}>👤</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div className="konusma-detay" style={{ minHeight: 0 }}>
          {acik
            ? <Sohbet k={acik} api={api} etiket={etiket} sessizSaat={sessizSaat} kapat={() => setSecili(null)} degisti={degisti} />
            : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--dim)', fontSize: 14, padding: 30, textAlign: 'center' }}>Soldan bir konuşma seç — kimle ne konuşulmuş baştan sona görünür.</div>}
        </div>
      </div>
    </div>
  );
}
