// Merkez OTP Numaraları (kullanıcı kararı 2026-10-15): Satış Bot sayfasından ayrıldı, iki sistem karışmasın.
// Bu numaralar SıraGO'nun sistem numaralarıdır: müşteriye doğrulama kodu, esnafa şifre/kurulum bildirimleri.
// Satış Bot numaraları satış konuşması içindir. Bir numara iki sisteme birden bağlanamaz: Satış Bot'a bağlanan
// numara buradan otomatik çıkarılır, Satış Bot numarası buraya bağlanmak istenirse reddedilir.
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj } from './ortak';

const DURUM = { bagli: ['Bağlı', '#1f6f4a'], qr_bekliyor: ['QR bekliyor', '#a8590c'], baslatiyor: ['Başlatılıyor', '#a8590c'], kapali: ['Kapalı', '#b42318'], hata: ['Hata', '#b42318'] };

export default function MerkezOtp({ api }) {
  const [veri, setVeri] = useState(null);
  const [mesaj, setMesaj] = useState(null);

  const yukle = async () => {
    const d = await api.get('/admin/merkez-otp/numaralar');
    if (d?.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setVeri(Array.isArray(d?.numaralar) ? d : { durum: 'kapali', numaralar: [] });
  };
  useEffect(() => { yukle(); }, []);
  // QR beklenirken 3 sn'de bir, yoksa 15 sn'de bir tazele
  const qrBekliyor = veri?.numaralar?.some(n => n.durum === 'qr_bekliyor' || n.durum === 'baslatiyor');
  useEffect(() => { const t = setInterval(yukle, qrBekliyor ? 3000 : 15000); return () => clearInterval(t); }, [qrBekliyor]);

  const islem = async (yol, yontem = 'post', bekle = 800) => {
    const d = yontem === 'del' ? await api.del(yol) : await api.post(yol, {});
    if (d?.hata) setMesaj({ tur: 'hata', metin: d.hata });
    setTimeout(yukle, bekle);
  };

  const numaralar = veri?.numaralar || [];
  const bagli = numaralar.filter(n => n.durum === 'bagli').length;
  return (
    <>
      <SayfaBaslik baslik="Merkez OTP Numaraları"
        aciklama="SıraGO'nun sistem numaraları: müşteriye randevu doğrulama kodu, esnafa şifre ve kurulum bildirimleri buradan gider.">
        <button onClick={() => islem('/admin/merkez-otp/numaralar', 'post', 500)} className="btn btn-sm" style={{ background: '#b42318', color: '#fff', fontWeight: 700 }}>+ Yeni numara</button>
      </SayfaBaslik>
      <Mesaj m={mesaj} />

      <div className="card mb-16" style={{ padding: '14px 18px', borderLeft: '3px solid #2f56c6' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Satış Bot'tan tamamen ayrı</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--dim)', lineHeight: 1.7 }}>
          <li>Satış Bot numaraları (Satış → Satış Bot → Numaralar) yalnız esnafla satış konuşması içindir; buradaki numaralar yalnız kod ve bildirim gönderir.</li>
          <li>Her numaranın kendi QR'ı var; bir QR yalnız bir numarayı, yalnız bu sisteme bağlar.</li>
          <li>Bir numara iki sisteme birden bağlanamaz. Satış Bot'a bağlanan numara buradan otomatik çıkarılır; Satış Bot numarası burada okutulursa bağlantı reddedilir.</li>
          <li>Esnafın kendi WhatsApp'ı bağlıysa doğrulama kodu önce oradan gider; bu numaralar yedektir. Birden çok numara varsa sırayla ve günlük sınırla kullanılır.</li>
        </ul>
      </div>

      <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 10 }}>
        {numaralar.length} numara · <b style={{ color: bagli ? '#1f6f4a' : '#b42318' }}>{bagli} bağlı</b>
        {numaralar.length > 0 && !bagli && ' — şu an doğrulama kodu ve şifre kodu yalnız esnafın kendi WhatsApp\'ından gidebilir'}
      </div>

      {!veri ? <div className="list-empty"><p>Yükleniyor…</p></div>
        : numaralar.length === 0 ? (
          <div className="list-empty"><p>Henüz Merkez OTP numarası yok. <b>+ Yeni numara</b> ile ekle, çıkan QR'ı SıraGO'nun sistem telefonundan okut.</p></div>
        ) : numaralar.map(n => {
          const [ad, renk] = DURUM[n.durum] || [n.durum, 'var(--dim)'];
          return (
            <div key={n.id} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div className="row row-between gap-8" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{n.numara || '(henüz bağlanmadı)'} <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--dim)' }}>#{n.id}</span></div>
                  <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>
                    Durum: <b style={{ color: renk }}>{ad}</b> · Bugün {n.gunluk_gonderim || 0} gönderim
                  </div>
                </div>
                <div className="row gap-6">
                  {n.durum !== 'bagli' && <button onClick={() => islem(`/admin/merkez-otp/numaralar/${n.id}/baslat`, 'post', 1500)} className="btn btn-sm" style={{ background: '#b42318', color: '#fff', fontWeight: 600 }}>Başlat / Yeni QR</button>}
                  {n.durum === 'bagli' && <button onClick={() => islem(`/admin/merkez-otp/numaralar/${n.id}/durdur`)} className="btn btn-sm" style={{ background: 'rgba(180,35,24,.08)', color: '#b42318', fontWeight: 600 }}>Durdur</button>}
                  <button onClick={() => { if (confirm(`Numara #${n.id} silinsin mi?`)) islem(`/admin/merkez-otp/numaralar/${n.id}`, 'del', 200); }} className="btn btn-sm btn-ghost" aria-label="Sil">✕</button>
                </div>
              </div>
              {n.uyari && (
                <div role="alert" style={{ fontSize: 12, fontWeight: 600, color: '#b42318', background: 'rgba(180,35,24,.06)', borderRadius: 8, padding: '8px 10px' }}>⛔ {n.uyari}</div>
              )}
              {n.durum === 'qr_bekliyor' && n.qr_base64 && (
                <div style={{ padding: 14, borderRadius: 10, background: 'var(--bg)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#b42318', marginBottom: 8 }}>📱 Bu QR'ı SıraGO'nun sistem telefonundan okut (WhatsApp → Bağlı cihazlar → Cihaz bağla). Satış Bot telefonuyla okutma.</div>
                  <img src={n.qr_base64} alt="Merkez OTP QR" style={{ width: 220, height: 220, borderRadius: 12 }} />
                </div>
              )}
            </div>
          );
        })}
    </>
  );
}
