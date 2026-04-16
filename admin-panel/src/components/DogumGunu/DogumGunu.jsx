import { useState, useEffect } from 'react';

export default function DogumGunu({ api }) {
  const [ayarlar, setAyarlar] = useState({ dogum_gunu_aktif: false, dogum_gunu_indirim: 30, dogum_gunu_mesaj_sablonu: '' });
  const [istatistik, setIstatistik] = useState({ toplam_gonderilen: 0, son_30_gun: 0, bugun_dogum_gunu: 0, dogum_tarihi_olan: 0, dogum_tarihi_eksik: 0 });
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tetikleniyor, setTetikleniyor] = useState(false);
  const [topluTetikleniyor, setTopluTetikleniyor] = useState(false);

  useEffect(() => {
    yukle();
  }, []);

  const yukle = async () => {
    try {
      const d = await api.get('/dogum-gunu/ayarlar');
      if (d?.ayarlar) setAyarlar({ ...ayarlar, ...d.ayarlar });
      if (d?.istatistik) setIstatistik(d.istatistik);
    } catch (e) { console.error('Doğum günü yükleme hatası:', e); }
  };

  const kaydet = async () => {
    await api.put('/dogum-gunu/ayarlar', ayarlar);
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
    yukle();
  };

  const manuelTetikle = async () => {
    if (!confirm(`Bugün doğum günü olan ${istatistik.bugun_dogum_gunu} müşteriye mesaj gönderilecek. Devam edilsin mi?`)) return;
    setTetikleniyor(true);
    try {
      const sonuc = await api.post('/dogum-gunu/manuel-tetikle', {});
      if (sonuc?.basarili) {
        alert(`✅ ${sonuc.gonderilen} müşteriye doğum günü mesajı gönderildi!`);
        yukle();
      } else {
        alert('❌ Hata: ' + (sonuc?.mesaj || 'Bilinmeyen hata'));
      }
    } catch (e) {
      alert('❌ Hata: ' + e.message);
    } finally {
      setTetikleniyor(false);
    }
  };

  const topluProfilGuncelle = async () => {
    const sayi = istatistik.dogum_tarihi_eksik;
    if (sayi === 0) { alert('Tüm müşterilerinin doğum tarihi zaten sistemde kayıtlı 🎉'); return; }
    const msg = `⚠️ ${sayi} eski müşteriye doğum tarihlerini sormak için WhatsApp mesajı gönderilecek.\n\nBu tek seferlik bir kampanyadır — tekrar çalıştırmak tavsiye EDİLMEZ (müşteri spam algılayabilir).\n\nDevam edilsin mi?`;
    if (!confirm(msg)) return;
    setTopluTetikleniyor(true);
    try {
      const sonuc = await api.post('/dogum-gunu/toplu-guncelleme', {});
      if (sonuc?.basarili) {
        alert(`✅ Kampanya başlatıldı! ${sonuc.tahmini_gonderim} müşteriye mesaj gönderiliyor (arka planda, 2-5 sn arayla). Cevap verenlerin doğum tarihi otomatik kaydedilecek.`);
        yukle();
      } else {
        alert('❌ Hata: ' + (sonuc?.hata || 'Bilinmeyen hata'));
      }
    } catch (e) {
      alert('❌ Hata: ' + e.message);
    } finally {
      setTopluTetikleniyor(false);
    }
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
    input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' },
  };

  const varsayilanSablon = `🎂 *Doğum günün kutlu olsun {isim}!*

{isletme} ailesi olarak sana özel bir hediyemiz var:

🎁 *Bu hafta %{indirim} indirim!*

Sadece senin için 7 gün geçerli. Arkadaşını da getir, o da %{indirim} indirim kazansın 🎉

Randevu için mesaj at, yerini ayarlayalım 💫`;

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* Başlık */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          🎂 Doğum Günü Pazarlaması
        </h2>
        <div style={{ color: 'var(--dim)', fontSize: 13, marginTop: 4 }}>
          Müşterilerine doğum günlerinde otomatik kutlama + indirim mesajı gönder. Her sabah 10:00'da çalışır.
        </div>
      </div>

      {/* İstatistik kartları */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        <div style={{ ...S.card, background: 'linear-gradient(135deg, rgba(236,72,153,.08), rgba(236,72,153,.02))', border: '1px solid rgba(236,72,153,.2)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bugün Doğum Günü</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ec4899' }}>{istatistik.bugun_dogum_gunu}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>{istatistik.bugun_dogum_gunu > 0 ? 'Mesaj gönderilecek' : 'Bugün kimse yok'}</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Doğum Tarihi VAR</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>{istatistik.dogum_tarihi_olan}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Kayıtlı müşteri</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Doğum Tarihi EKSİK</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b' }}>{istatistik.dogum_tarihi_eksik}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Toplamak için ↓</div>
        </div>
        <div style={S.card}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Son 30 Gün Gönd.</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)' }}>{istatistik.son_30_gun}</div>
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Kutlama mesajı</div>
        </div>
      </div>

      {/* Toplu Profil Güncelleme — Eski Müşterilerden Veri Topla */}
      {istatistik.dogum_tarihi_eksik > 0 && (
        <div style={{ ...S.card, marginBottom: 20, background: 'linear-gradient(135deg, rgba(245,158,11,.06), rgba(245,158,11,.01))', border: '1px solid rgba(245,158,11,.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b', marginBottom: 4 }}>📬 Eski Müşterilerden Doğum Tarihi Topla</div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
                <strong>{istatistik.dogum_tarihi_eksik} müşteri</strong>nin doğum tarihi eksik. Tek seferlik bir kampanya ile WhatsApp'tan nazikçe sor, cevap verenlerin tarihi otomatik kaydedilsin.
              </div>
              <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 6, fontStyle: 'italic' }}>
                ⚠️ Anti-ban için 2-5 saniye arayla gönderim yapılır. 100 müşteri için ~5-10 dakika sürer.
              </div>
            </div>
            <button
              onClick={topluProfilGuncelle}
              disabled={topluTetikleniyor}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#f59e0b', color: '#fff',
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                opacity: topluTetikleniyor ? 0.5 : 1, whiteSpace: 'nowrap'
              }}
            >
              {topluTetikleniyor ? '⏳ Başlatılıyor...' : `📬 ${istatistik.dogum_tarihi_eksik} Kişiye Sor`}
            </button>
          </div>
        </div>
      )}

      {/* Ayarlar */}
      <div style={S.card}>
        {/* Aktiflik */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Otomatik Doğum Günü Mesajları</div>
            <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2 }}>Her sabah 10:00'da doğum günü olan müşterilere gönderilir</div>
          </div>
          <button
            onClick={() => setAyarlar({ ...ayarlar, dogum_gunu_aktif: !ayarlar.dogum_gunu_aktif })}
            style={{
              padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: ayarlar.dogum_gunu_aktif ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.08)',
              color: ayarlar.dogum_gunu_aktif ? '#10b981' : '#ef4444',
              fontWeight: 700, fontSize: 12, fontFamily: 'inherit'
            }}
          >
            {ayarlar.dogum_gunu_aktif ? '✅ AKTİF' : '⏸️ KAPALI'}
          </button>
        </div>

        {/* İndirim oranı */}
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>İndirim Oranı (%)</label>
          <input
            type="number"
            min="5" max="100" step="5"
            value={ayarlar.dogum_gunu_indirim || 30}
            onChange={e => setAyarlar({ ...ayarlar, dogum_gunu_indirim: parseInt(e.target.value) || 30 })}
            style={S.input}
          />
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Müşteriye verilecek doğum günü indirimi. Önerilen: %20-30</div>
        </div>

        {/* Mesaj şablonu */}
        <div style={{ marginBottom: 16 }}>
          <label style={S.label}>Mesaj Şablonu (boş bırakırsan varsayılan kullanılır)</label>
          <textarea
            rows={8}
            value={ayarlar.dogum_gunu_mesaj_sablonu || ''}
            onChange={e => setAyarlar({ ...ayarlar, dogum_gunu_mesaj_sablonu: e.target.value })}
            placeholder={varsayilanSablon}
            style={{ ...S.input, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
            Değişkenler: <code>{'{isim}'}</code> · <code>{'{isletme}'}</code> · <code>{'{indirim}'}</code>
          </div>
        </div>

        {/* Butonlar */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            onClick={kaydet}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #54E097, #2cb872)', color: '#fff',
              fontWeight: 700, fontSize: 13, fontFamily: 'inherit'
            }}
          >
            💾 Kaydet
          </button>
          {ayarlar.dogum_gunu_aktif && istatistik.bugun_dogum_gunu > 0 && (
            <button
              onClick={manuelTetikle}
              disabled={tetikleniyor}
              style={{
                padding: '10px 20px', borderRadius: 10, border: '1px solid rgba(236,72,153,.3)', cursor: 'pointer',
                background: 'rgba(236,72,153,.1)', color: '#ec4899',
                fontWeight: 700, fontSize: 13, fontFamily: 'inherit',
                opacity: tetikleniyor ? 0.5 : 1
              }}
            >
              {tetikleniyor ? '⏳ Gönderiliyor...' : `🎂 Şimdi Gönder (${istatistik.bugun_dogum_gunu} kişi)`}
            </button>
          )}
          {kaydedildi && <span style={{ color: '#10b981', fontSize: 12, fontWeight: 600 }}>✅ Kaydedildi</span>}
        </div>
      </div>

      {/* Bilgi kutusu */}
      <div style={{ ...S.card, marginTop: 16, background: 'rgba(66,133,244,.04)', border: '1px solid rgba(66,133,244,.15)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#4285f4', marginBottom: 8 }}>💡 Nasıl çalışır?</div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
          <li>Sistem her sabah 10:00'da (Türkiye saati) otomatik çalışır</li>
          <li>O gün doğum günü olan müşterileri bulur ve WhatsApp/Telegram üzerinden kutlama + indirim mesajı gönderir</li>
          <li>Aynı müşteriye aynı yıl içinde sadece 1 kez mesaj gönderilir</li>
          <li>Müşterilerin doğum tarihini kayıt sırasında veya CRM'den ekleyebilirsin</li>
          <li>Doğum günü olan adam genelde tek gelmez — arkadaşıyla gelir, sana yeni müşteri kazandırır 🎯</li>
        </ul>
      </div>
    </div>
  );
}
