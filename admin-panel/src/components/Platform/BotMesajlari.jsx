// Bot Mesajları (2026-10-15): botun müşteriye gönderdiği hazır metinler panelden değişir.
// {alan} yer tutucuları gönderimde doldurulur. Liste içeren mesajlar (hizmet listesi vb.) kilitli.
// İşletmenin kendi yazdığı mesai dışı mesajı (Ayarlar) burada yazılanın önüne geçer.
import { useEffect, useState } from 'react';
import { SayfaBaslik, Mesaj, zaman } from './ortak';

const DIL_AD = { tr: 'Türkçe', en: 'İngilizce', ar: 'Arapça' };
// Mesaj adlarının ne zaman gittiği (anahtar koddaki ad; burada esnafın anlayacağı karşılığı)
const ACIKLAMA = {
  anaMenu: 'Karşılama / ana menü', hizmetListesi: 'Hizmet listesi', hizmetSecildi: 'Hizmet seçilince',
  calisanSec: 'Çalışan seçimi', tarihSec: 'Tarih sorusu', gunSec: 'Gün listesi', saatListesi: 'Saat listesi',
  saatYok: 'O gün boş saat yok', randevuOzet: 'Onay öncesi randevu özeti', randevuOnaylandi: 'Randevu onaylandı',
  randevuNotKaydedildi: 'Randevu notu kaydedildi', iptalListesi: 'İptal edilecek randevu listesi', randevuYok: 'Randevusu yok',
  randevularim: 'Randevularım listesi', iptalOnay: 'İptal onayı sorusu', iptalBasarili: 'İptal edildi',
  hizmetBulunamadi: 'Hizmet anlaşılamadı', konum: 'Konum / adres', calismaSaatleri: 'Çalışma saatleri',
  mesaiDisi: '"Şu an kapalıyız" (mesai dışı)', randevuAlIcin: '"Randevu için 1 yaz" hatırlatması', zamanDilimiSor: 'Sabah/öğle/akşam sorusu',
  zamanDilimiListele: 'Zaman dilimindeki saatler', saatDolu: 'Seçilen saat dolu', saatAnlasilamadi: 'Saat anlaşılamadı',
  beklemeListesiSor: 'Bekleme listesi teklifi', beklemeListesiEklendi: 'Bekleme listesine eklendi', beklemeListesiMusait: 'Bekleme listesi: yer açıldı',
  siraTakibi: 'Sıra durumu', siraTakibiYok: 'Bugün randevusu yok (sıra sorusu)', noShowMesaj: 'Randevuya gelmedi bildirimi',
};

export default function BotMesajlari({ api }) {
  const [dil, setDil] = useState('tr');
  const [mesajlar, setMesajlar] = useState(null);
  const [acik, setAcik] = useState(null);       // düzenlenen anahtar
  const [metin, setMetin] = useState('');
  const [ara, setAra] = useState('');
  const [mesaj, setMesaj] = useState(null);

  const yukle = async () => {
    const d = await api.get('/admin/bot-mesajlari');
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setMesajlar(d.mesajlar);
  };
  useEffect(() => { yukle(); }, []);

  const kaydet = async (anahtar, deger) => {
    const d = await api.put(`/admin/bot-mesajlari/${anahtar}/${dil}`, { metin: deger });
    if (d.hata) return setMesaj({ tur: 'hata', metin: d.hata });
    setMesaj({ tur: 'ok', metin: deger === null ? 'Varsayılan metne dönüldü.' : 'Kaydedildi. Bir dakika içinde tüm işletmelerde geçerli olur.' });
    setAcik(null); yukle();
  };

  if (!mesajlar) return <><SayfaBaslik baslik="Bot Mesajları" /><Mesaj m={mesaj} /><div className="list-empty"><p>Yükleniyor…</p></div></>;
  const filtre = ara.trim().toLowerCase();
  const gorunen = mesajlar.filter(m => !filtre || m.anahtar.toLowerCase().includes(filtre) || (ACIKLAMA[m.anahtar] || '').toLocaleLowerCase('tr').includes(filtre)
    || (m.diller[dil].ozel || m.diller[dil].varsayilan || '').toLowerCase().includes(filtre));

  return (
    <>
      <SayfaBaslik baslik="Bot Mesajları" aciklama="Botun müşteriye gönderdiği hazır metinler. {alan} yazan yerler gönderirken dolar. Değişiklik tüm işletmelere uygulanır.">
        {Object.entries(DIL_AD).map(([k, ad]) => (
          <button key={k} onClick={() => { setDil(k); setAcik(null); }} className="btn btn-sm"
            style={{ background: dil === k ? '#1f6f4a' : 'var(--surface)', color: dil === k ? '#fff' : 'var(--text)', border: '1px solid var(--border)', fontWeight: 600 }}>{ad}</button>
        ))}
      </SayfaBaslik>
      <Mesaj m={mesaj} />
      <input className="input mb-16" placeholder="Mesajlarda ara…" value={ara} onChange={e => setAra(e.target.value)} style={{ width: '100%', maxWidth: 360 }} />
      {gorunen.map(m => {
        const d = m.diller[dil];
        const alanlar = [...new Set([...(d.varsayilan || '').matchAll(/\{(\w+)\}/g)].map(x => x[1]))];
        return (
          <div key={m.anahtar} className="list-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8, opacity: d.duzenlenebilir ? 1 : .6 }}>
            <div className="row row-between gap-8" style={{ flexWrap: 'wrap' }}>
              <div className="row gap-8" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{ACIKLAMA[m.anahtar] || m.anahtar}</span>
                <code style={{ fontSize: 11, color: 'var(--dim)' }}>{m.anahtar}</code>
                {d.ozel != null && <span className="tag" style={{ background: 'rgba(31,111,74,.1)', color: '#1f6f4a', fontWeight: 700 }}>Değiştirildi · {zaman(d.guncelleme)}</span>}
                {!d.duzenlenebilir && <span className="tag" style={{ fontWeight: 600 }}>🔒 Liste içeriyor, düzenlenemez</span>}
              </div>
              {d.duzenlenebilir && acik !== m.anahtar && (
                <div className="row gap-6">
                  <button onClick={() => { setAcik(m.anahtar); setMetin(d.ozel ?? d.varsayilan ?? ''); }} className="btn btn-sm" style={{ background: 'rgba(47,86,198,.1)', color: '#2f56c6', fontWeight: 600 }}>✏️ Düzenle</button>
                  {d.ozel != null && <button onClick={() => kaydet(m.anahtar, null)} className="btn btn-sm btn-ghost">Varsayılana dön</button>}
                </div>
              )}
            </div>
            {acik === m.anahtar ? (
              <>
                <textarea className="input" rows={5} value={metin} onChange={e => setMetin(e.target.value)} style={{ width: '100%', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                <div style={{ fontSize: 11, color: 'var(--dim)' }}>
                  Kullanılabilen alanlar: {alanlar.length ? alanlar.map(a => <code key={a} style={{ marginRight: 6 }}>{`{${a}}`}</code>) : 'yok'}
                  · *kalın* yazı için yıldız kullanılır.
                </div>
                <div className="row gap-6">
                  <button onClick={() => kaydet(m.anahtar, metin)} className="btn btn-sm" style={{ background: '#1f6f4a', color: '#fff', fontWeight: 700 }}>💾 Kaydet</button>
                  <button onClick={() => setAcik(null)} className="btn btn-sm btn-ghost">İptal</button>
                </div>
              </>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--dim)', whiteSpace: 'pre-wrap', background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                {d.ozel ?? d.varsayilan ?? (d.duzenlenebilir ? '(bu dilde metin yok, Türkçesi kullanılır)' : 'Bu mesaj işletmenin listesinden (hizmetler, saatler, randevular) oluşur; metni koddan gelir.')}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
