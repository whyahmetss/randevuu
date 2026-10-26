// KVKK "verilerimi silin" (2026-10-26): müşteri telefonuna gelen kodla kendini doğrular, kişisel verisi silinir
// (sunucu: services/kvkk.js). Metinler tr / en / ar; öbür dillerde İngilizce.
import { useState } from 'react';
import { API_URL } from '../../lib/config';

const METIN = {
  tr: { link: 'Kişisel verilerimi sil', baslik: 'Kişisel verilerimi sil', aciklama: 'Adınız, numaranız ve mesajlaşma kayıtlarınız silinir. Geçmiş randevular işletmenin kaydında isimsiz kalır.',
    tel: 'Telefon numaranız', kodGonder: 'Doğrulama kodu gönder', kod: 'Size gelen 6 haneli kod', onayla: 'Verilerimi sil', vazgec: 'Vazgeç', tamam: 'Tamam' },
  en: { link: 'Delete my personal data', baslik: 'Delete my personal data', aciklama: 'Your name, number and message history are deleted. Past appointments stay in the business records without your name.',
    tel: 'Your phone number', kodGonder: 'Send verification code', kod: 'The 6-digit code you received', onayla: 'Delete my data', vazgec: 'Cancel', tamam: 'OK' },
  ar: { link: 'حذف بياناتي الشخصية', baslik: 'حذف بياناتي الشخصية', aciklama: 'يتم حذف اسمك ورقمك وسجل الرسائل. تبقى المواعيد السابقة في سجلات المتجر بدون اسمك.',
    tel: 'رقم هاتفك', kodGonder: 'إرسال رمز التحقق', kod: 'الرمز المكون من 6 أرقام', onayla: 'احذف بياناتي', vazgec: 'إلغاء', tamam: 'حسناً' },
};

export default function VeriSil({ slug, dil }) {
  const m = METIN[dil] || METIN.en;
  const [acik, setAcik] = useState(false);
  const [adim, setAdim] = useState('tel');   // tel | kod | bitti
  const [tel, setTel] = useState('');
  const [kod, setKod] = useState('');
  const [mesaj, setMesaj] = useState('');
  const [hata, setHata] = useState('');
  const [bekle, setBekle] = useState(false);

  const post = async (yol, govde) => {
    setHata(''); setBekle(true);
    const d = await fetch(`${API_URL}/book/${slug}/${yol}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(govde) })
      .then(r => r.json()).catch(() => ({ hata: 'Bağlantı hatası' }));
    setBekle(false);
    if (d.hata) setHata(d.hata);
    return d;
  };
  const kodGonder = async () => { const d = await post('otp-gonder', { telefon: tel.trim(), kanal: 'whatsapp' }); if (!d.hata) setAdim('kod'); };
  const sil = async () => {
    const d = await post('otp-dogrula', { telefon: tel.trim(), kod: kod.trim() });
    if (!d.otpToken) return;
    const s = await post('verilerimi-sil', { telefon: tel.trim(), otpToken: d.otpToken });
    if (s.silindi) { setMesaj(s.mesaj); setAdim('bitti'); }
  };
  const kapat = () => { setAcik(false); setAdim('tel'); setKod(''); setHata(''); };

  return (
    <>
      <button type="button" onClick={() => setAcik(true)} className="bk-footer-veri">{m.link}</button>
      {acik && (
        <div className="bk-modal-backdrop" onClick={kapat}>
          <div className="bk-modal" onClick={e => e.stopPropagation()}>
            <div className="bk-modal-title">{m.baslik}</div>
            {adim === 'bitti' ? (
              <>
                <div className="bk-modal-desc">{mesaj}</div>
                <button className="bk-btn" onClick={kapat}>{m.tamam}</button>
              </>
            ) : (
              <>
                <div className="bk-modal-desc">{m.aciklama}</div>
                {adim === 'tel'
                  ? <input className="bk-input" type="tel" inputMode="tel" autoComplete="tel" placeholder={m.tel} value={tel} onChange={e => setTel(e.target.value)} />
                  : <input className="bk-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder={m.kod} value={kod} onChange={e => setKod(e.target.value.replace(/\D/g, ''))} />}
                {hata && <div className="bk-error" style={{ marginTop: 10 }}>{hata}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  {adim === 'tel'
                    ? <button className="bk-btn" disabled={bekle || tel.replace(/\D/g, '').length < 10} onClick={kodGonder}>{m.kodGonder}</button>
                    : <button className="bk-btn" disabled={bekle || kod.length !== 6} onClick={sil}>{m.onayla}</button>}
                  <button className="bk-btn bk-btn-ghost" onClick={kapat}>{m.vazgec}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
