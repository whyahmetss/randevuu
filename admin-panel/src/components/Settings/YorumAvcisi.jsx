import { useState, useEffect } from 'react';

export default function YorumAvcisi({ api }) {
  const [ayarlar, setAyarlar] = useState({});
  const [talepler, setTalepler] = useState([]);
  const [istatistik, setIstatistik] = useState(null);
  const [kaydedildi, setKaydedildi] = useState(false);
  const [tab, setTab] = useState('ayarlar');
  const [memnuniyet, setMemnuniyet] = useState(null);

  useEffect(() => {
    api.get('/yorum-avcisi/ayarlar').then(d => { if (d?.ayarlar) setAyarlar(d.ayarlar); });
    api.get('/yorum-avcisi/istatistik').then(d => { if (!d?.hata) setIstatistik(d); });
  }, []);

  useEffect(() => {
    if (tab === 'log') api.get('/yorum-avcisi/log').then(d => setTalepler(d?.talepler || []));
    if (tab === 'memnuniyet') api.get('/yorum-avcisi/memnuniyet').then(d => setMemnuniyet(d?.liste || []));
  }, [tab]);

  // Esnaf müşteriyle konuştu → "çözüldü" (listeden düşer, alarm sayacı azalır)
  const cozuldu = async (m, deger = true) => {
    const r = await api.put(`/yorum-avcisi/memnuniyet/${m.id}`, { cozuldu: deger });
    if (r?.hata) return alert(r.hata);
    setMemnuniyet(l => l.map(x => x.id === m.id ? { ...x, cozuldu: deger } : x));
    setIstatistik(i => i ? { ...i, dusuk_acik: Math.max(0, (i.dusuk_acik || 0) + (deger ? -1 : 1)) } : i);
  };
  const telYerel = (t) => { const d = String(t || '').replace(/\D/g, ''); return d.startsWith('90') && d.length === 12 ? '0' + d.slice(2) : d; };

  const kaydet = async () => {
    const sablon = ayarlar.yorum_mesaj_sablonu;
    const r = await api.put('/yorum-avcisi/ayarlar', { ...ayarlar, yorum_mesaj_sablonu: !sablon || sablon === varsayilanSablon || /deneyiminiz nasıldı\?/i.test(sablon) ? null : sablon });
    if (r?.hata) { alert('Kaydedilemedi: ' + r.hata); return; }
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const S = {
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '20px 24px', boxShadow: '0 1px 4px rgba(0,0,0,.04)' },
    label: { fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6, display: 'block' },
  };

  // 4–5 puan verene giden teşekkür + Google linki (önce "1'den 5'e puanlar mısınız?" sorusu gider)
  const varsayilanSablon = `Çok teşekkür ederiz! 🙏\n\nGörüşünüzü Google'da da paylaşırsanız {isletme_adi} için çok değerli olur ⭐\n{google_maps_link}`;
  const sablonGoster = ayarlar.yorum_mesaj_sablonu && !/deneyiminiz nasıldı\?/i.test(ayarlar.yorum_mesaj_sablonu) ? ayarlar.yorum_mesaj_sablonu : varsayilanSablon;

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
        {[['ayarlar', '⚙️ Ayarlar'], ['memnuniyet', `😊 Memnuniyet${istatistik?.dusuk_acik ? ` (${istatistik.dusuk_acik})` : ''}`], ['log', '📋 Gönderim Log']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex: 1, padding: '10px 16px', borderRadius: 10, border: 'none',
            background: tab === id ? 'var(--gradient, #1f6f4a)' : 'transparent',
            color: tab === id ? '#fff' : 'var(--dim)', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all .2s',
          }}>{label}</button>
        ))}
      </div>

      {/* Çözülmemiş düşük puan uyarısı */}
      {istatistik?.dusuk_acik > 0 && tab !== 'memnuniyet' && (
        <button onClick={() => setTab('memnuniyet')} style={{ width: '100%', textAlign: 'left', background: 'rgba(180,35,24,.08)', border: '1px solid rgba(180,35,24,.3)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#b42318', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ⚠️ {istatistik.dusuk_acik} müşteri memnun kalmamış. Aramak için dokun →
        </button>
      )}

      {/* İstatistik kartları */}
      {istatistik && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }} className="settings-grid-3">
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Bu Ay Toplam</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#a8590c' }}>{istatistik.toplam}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Gönderilen</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#1f6f4a' }}>{istatistik.gonderilen}</div>
          </div>
          <div style={S.card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 6 }}>Ortalama puan</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: '#2f56c6' }}>{istatistik.ortalama != null ? `${istatistik.ortalama} / 5` : '—'}</div>
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>{istatistik.puanlanan || 0} müşteri puan verdi</div>
          </div>
        </div>
      )}

      {tab === 'ayarlar' && (
        <>
          {kaydedildi && (
            <div style={{ background: 'rgba(31,111,74,.1)', border: '1px solid rgba(31,111,74,.25)', borderRadius: 14, padding: '12px 18px', marginBottom: 16, color: '#1f6f4a', fontSize: 13, fontWeight: 600 }}>
              Yorum avcısı ayarları kaydedildi
            </div>
          )}

          <div style={{ ...S.card, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <span style={{ fontSize: 28 }}>⭐</span>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>Yorum Avcısı + Memnuniyet</div>
                <div style={{ fontSize: 12, color: 'var(--dim)' }}>Randevudan sonra müşteriye "1'den 5'e puanlar mısınız?" diye sorar. 1–3 verirse sana hemen bildirim gelir; Google linki herkese gider.</div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" className="anahtar" role="switch" checked={!!ayarlar.yorum_avcisi_aktif} onChange={e => setAyarlar({...ayarlar, yorum_avcisi_aktif: e.target.checked})}
                    style={{ accentColor: '#a8590c', width: 20, height: 20 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: ayarlar.yorum_avcisi_aktif ? '#a8590c' : 'var(--dim)' }}>
                    {ayarlar.yorum_avcisi_aktif ? 'Aktif' : 'Kapalı'}
                  </span>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={S.label}>Google Maps Yorum Linki *</label>
                <input value={ayarlar.google_maps_link || ''} onChange={e => setAyarlar({...ayarlar, google_maps_link: e.target.value})}
                  className="input" placeholder="https://g.page/r/xxxxxxx/review" />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>Google Maps'te işletmene git → "Yorum Yaz" → URL'yi kopyala</div>
              </div>
              <div>
                <label style={S.label}>Gecikme Süresi</label>
                <select value={ayarlar.yorum_gecikme_dk || 60} onChange={e => setAyarlar({...ayarlar, yorum_gecikme_dk: parseInt(e.target.value)})}
                  className="input" style={{ width: '100%' }}>
                  <option value={60}>1 saat sonra</option>
                  <option value={120}>2 saat sonra</option>
                  <option value={1440}>24 saat sonra</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Teşekkür mesajı (4–5 puan verenlere)</label>
                <textarea value={sablonGoster}
                  onChange={e => setAyarlar({...ayarlar, yorum_mesaj_sablonu: e.target.value})}
                  className="input" rows={6} style={{ width: '100%', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }} />
                <div style={{ fontSize: 11, color: 'var(--dim)', marginTop: 4 }}>
                  Değişkenler: <code>{'{musteri_adi}'}</code>, <code>{'{isletme_adi}'}</code>, <code>{'{google_maps_link}'}</code>
                </div>
              </div>
            </div>
          </div>

          <button onClick={kaydet} style={{
            width: '100%', padding: '14px', borderRadius: 14, border: 'none',
            background: '#1f6f4a',
            color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(168,89,12,.3)', fontFamily: 'inherit',
          }}>
            Kaydet
          </button>
        </>
      )}

      {tab === 'memnuniyet' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Müşteri puanları (son 90 gün)</div>
          <div style={{ fontSize: 12, color: 'var(--dim)', marginBottom: 14 }}>Düşük puan verenleri ara ya da WhatsApp'tan yaz; konuştuktan sonra "Çözüldü" de.</div>
          {memnuniyet === null ? <div style={{ color: 'var(--dim)', fontSize: 13 }}>Yükleniyor…</div>
            : memnuniyet.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz puan veren müşteri yok.</div>
            : memnuniyet.map(m => {
              const dusuk = m.puan <= 3;
              const acik = dusuk && !m.cozuldu;
              const tel = String(m.telefon || '').startsWith('tg:') ? null : telYerel(m.telefon);
              return (
                <div key={m.id} style={{ padding: '12px 0', borderTop: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17,
                    background: acik ? 'rgba(180,35,24,.1)' : dusuk ? 'var(--bg)' : 'rgba(31,111,74,.1)', color: acik ? '#b42318' : dusuk ? 'var(--dim)' : '#1f6f4a' }}>{m.puan}/5</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{m.musteri_isim || 'Müşteri'}{m.cozuldu && dusuk ? <span style={{ color: '#1f6f4a', fontWeight: 600, fontSize: 12 }}> · ✓ çözüldü</span> : null}</div>
                    <div style={{ fontSize: 12, color: 'var(--dim)' }}>{[m.hizmet_isim, m.calisan_isim, m.puan_zamani && new Date(m.puan_zamani).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}</div>
                    {m.geri_bildirim && <div style={{ marginTop: 6, fontSize: 13, background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-line' }}>💬 {m.geri_bildirim}</div>}
                    {dusuk && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                        {tel && <a href={`tel:${tel}`} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>📞 Ara</a>}
                        {tel && <a href={`https://wa.me/${String(m.telefon).replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>💬 WhatsApp</a>}
                        <button className="btn btn-ghost btn-sm" onClick={() => cozuldu(m, !m.cozuldu)}>{m.cozuldu ? 'Geri al' : '✓ Çözüldü'}</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {tab === 'log' && (
        <div style={S.card}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 14 }}>Gönderim Geçmişi</div>
          {talepler.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--dim)', fontSize: 13 }}>Henüz yorum talebi gönderilmemiş</div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {['Müşteri', 'Telefon', 'Planlanan', 'Gönderim', 'Durum'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {talepler.map(t => (
                    <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{t.musteri_isim || '—'}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12 }}>{t.telefon}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(t.gonderim_zamani).toLocaleString('tr-TR')}</td>
                      <td style={{ padding: '10px 12px', fontSize: 12, whiteSpace: 'nowrap' }}>{t.gonderim_tarihi ? new Date(t.gonderim_tarihi).toLocaleString('tr-TR') : '—'}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: ['gonderildi', 'tamamlandi', 'puan_bekliyor', 'yorum_bekliyor'].includes(t.durum) ? 'rgba(31,111,74,.1)' : t.durum === 'bekliyor' ? 'rgba(47,86,198,.1)' : 'rgba(180,35,24,.1)',
                          color: ['gonderildi', 'tamamlandi', 'puan_bekliyor', 'yorum_bekliyor'].includes(t.durum) ? '#1f6f4a' : t.durum === 'bekliyor' ? '#2f56c6' : '#b42318'
                        }}>{{ gonderildi: 'Gönderildi', bekliyor: 'Bekliyor', puan_bekliyor: 'Puan bekleniyor', yorum_bekliyor: 'Açıklama bekleniyor', tamamlandi: t.puan ? `${t.puan}/5` : 'Tamamlandı', baglanti_yok: 'Bot bağlı değil', hata: 'Hata', link_yok: 'Link yok' }[t.durum] || t.durum}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
