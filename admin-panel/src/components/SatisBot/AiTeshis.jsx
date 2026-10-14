import { useState } from 'react';

// Yapay zekâ teşhisi: Claude / Gemini / DeepSeek gerçekten cevap veriyor mu, vermiyorsa neden (anahtar yok,
// model bulunamadı, kota/bakiye, JSON okunamadı). Bot "düz" cevap veriyorsa ilk bakılacak yer.
const AD = { claude: 'Claude', gemini: 'Gemini', deepseek: 'DeepSeek' };
const DURUM = { calisiyor: ['Çalışıyor', '#1f6f4a'], anahtar_yok: ['Anahtar yok', '#6f6a62'], hata: ['Hata', '#b42318'] };

export default function AiTeshis({ api }) {
  const [d, setD] = useState(null);
  const [bekle, setBekle] = useState(false);
  const test = async () => { setBekle(true); setD(await api.get('/admin/satis-bot/ai-test').catch(e => ({ hata: e.message }))); setBekle(false); };
  const calisan = d?.saglayicilar && Object.values(d.saglayicilar).some(x => x.durum === 'calisiyor');
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 20, border: '1px solid var(--border)', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Yapay zekâ durumu</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>Bot "düz/hazır" cevap veriyorsa: hiçbir yapay zekâ çalışmıyor demektir. Test et, sebebi burada yazar.</div>
        </div>
        <button onClick={test} disabled={bekle} className="btn btn-primary btn-sm">{bekle ? 'Deneniyor… (~20 sn)' : 'Test et'}</button>
      </div>
      {d?.hata && <div style={{ color: '#b42318', marginTop: 10 }}>{d.hata}</div>}
      {d?.saglayicilar && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {d.ai_cevap_acik === false && <div style={{ padding: 10, borderRadius: 10, background: 'rgba(180,35,24,.08)', color: '#b42318', fontWeight: 700 }}>"AI Cevap" ayarı KAPALI — aşağıdan aç; kapalıyken bot yalnız hazır cevap verir.</div>}
          {!calisan && <div style={{ padding: 10, borderRadius: 10, background: 'rgba(180,35,24,.08)', color: '#b42318', fontWeight: 700 }}>Hiçbir yapay zekâ cevap vermiyor; bot şu an hazır (kurallı) cevaplarla çalışıyor.</div>}
          {Object.entries(d.saglayicilar).map(([ad, x]) => (
            <div key={ad} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '10px 12px', borderRadius: 10, background: 'var(--bg)', flexWrap: 'wrap' }}>
              <b style={{ width: 80 }}>{AD[ad] || ad}</b>
              <span style={{ fontWeight: 700, color: DURUM[x.durum]?.[1] }}>{DURUM[x.durum]?.[0] || x.durum}</span>
              <span style={{ fontSize: 12, color: 'var(--dim)', flex: 1, minWidth: 200 }}>
                {x.durum === 'calisiyor' ? `${(x.sure_ms / 1000).toFixed(1)} sn · örnek: "${x.ornek || ''}"` : `${x.kod ? `[${x.kod}] ` : ''}${x.mesaj || ''}`}
              </span>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--dim)' }}>Deneme sırası: {d.sira} · Gemini modelleri: {(d.gemini_modelleri || []).join(' → ')}</div>
        </div>
      )}
    </div>
  );
}
