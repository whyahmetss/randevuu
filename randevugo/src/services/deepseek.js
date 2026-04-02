const axios = require('axios');

class DeepSeekService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseURL = 'https://api.deepseek.com/chat/completions';
  }

  async mesajAnla(mesaj, isletmeBilgi, botDurum, musaitSaatler, hizmetler) {
    const sistemPrompt = `Sen RandevuGO'nun WhatsApp randevu botusun. ${isletmeBilgi.isim} için çalışıyorsun.
Kategori: ${isletmeBilgi.kategori || 'Hizmet'}
Adres: ${isletmeBilgi.adres || 'Belirtilmemiş'}

KURALLAR:
- Türkçe, samimi ve kısa cevaplar ver
- Emoji kullan ama abartma
- Müşteriyi randevu almaya yönlendir
- Sadece JSON formatında yanıt ver, başka bir şey yazma

MEVCUT HİZMETLER:
${hizmetler.map((h, i) => `${i + 1}. ${h.isim} (${h.sure_dk} dk - ${h.fiyat} TL)`).join('\n')}

MÜSAİT SAATLER (bugün için):
${musaitSaatler.length > 0 ? musaitSaatler.join(', ') : 'Bugün müsait saat yok'}

BOT DURUMU: ${botDurum.asama}
${botDurum.secilen_hizmet_id ? `Seçilen hizmet ID: ${botDurum.secilen_hizmet_id}` : ''}
${botDurum.secilen_tarih ? `Seçilen tarih: ${botDurum.secilen_tarih}` : ''}

MÜŞTERİ MESAJI: "${mesaj}"

JSON FORMATI (SADECE BU JSON'U DÖNDÜR, BAŞKA HİÇBİR ŞEY YAZMA):
{
  "cevap": "Müşteriye gönderilecek WhatsApp mesajı",
  "aksiyon": "hizmet_listele | hizmet_secildi | tarih_sor | tarih_secildi | saat_listele | saat_secildi | randevu_onayla | iptal | bilgi | serbest_konusma",
  "secilen_hizmet_index": null,
  "secilen_tarih": null,
  "secilen_saat": null
}`;

    if (!this.apiKey) {
      console.warn('⚠️ DEEPSEEK_API_KEY eksik, state machine moduna geçiliyor');
      return null;
    }

    try {
      const response = await axios.post(this.baseURL, {
        model: 'deepseek-chat',
        max_tokens: 500,
        temperature: 0.3,
        messages: [
          { role: 'system', content: 'Sen bir randevu asistanısın. Sadece JSON döndür.' },
          { role: 'user', content: sistemPrompt }
        ]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 10000
      });

      const text = response.data.choices[0].message.content;

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        cevap: 'Bir sorun oluştu, lütfen tekrar deneyin.',
        aksiyon: 'serbest_konusma'
      };
    } catch (error) {
      console.error('DeepSeek API hatası:', error.message);
      return null;
    }
  }

  async kisiselKarsilama(musteriIsim, gecmisRandevu, yaklasanRandevu, isletmeBilgi, hizmetler, kanal = 'telegram') {
    if (!this.apiKey) return null;
    const hizmetListesi = hizmetler.map(h => `${h.isim} (${h.sure_dk} dk, ${h.fiyat} TL)`).join(', ');

    let profilBilgisi = '';
    if (yaklasanRandevu) {
      const t = new Date(yaklasanRandevu.tarih);
      profilBilgisi = `Müşterinin yaklaşan randevusu var: ${t.toLocaleDateString('tr-TR', {day:'numeric',month:'long',year:'numeric',weekday:'long'})} saat ${String(yaklasanRandevu.saat).substring(0,5)}, "${yaklasanRandevu.hizmet_isim}" hizmeti.`;
    } else if (gecmisRandevu) {
      const t = new Date(gecmisRandevu.tarih);
      const gunFarki = Math.floor((Date.now() - t.getTime()) / (1000*60*60*24));
      const ayFarki = Math.floor(gunFarki / 30);
      let sure = gunFarki < 30 ? `${gunFarki} gün önce` : `${ayFarki} ay önce`;
      profilBilgisi = `Müşteri daha önce ${t.toLocaleDateString('tr-TR', {day:'numeric',month:'long'})} tarihinde "${gecmisRandevu.hizmet_isim}" hizmeti almış (${sure}).`;
    } else {
      profilBilgisi = 'Müşteri daha önce hiç randevu almamış, ilk ziyareti.';
    }

    try {
      const response = await axios.post(this.baseURL, {
        model: 'deepseek-chat',
        max_tokens: 150,
        temperature: 0.6,
        messages: [
          {
            role: 'system',
            content: `Sen "${isletmeBilgi.isim}" adlı işletmenin dijital asistanısın. ${kanal === 'telegram' ? 'Telegram' : 'WhatsApp'} üzerinden müşterilerle iletişim kuruyorsun.

İŞLETME ADI: "${isletmeBilgi.isim}"
KATEGORİ: ${isletmeBilgi.kategori || 'Hizmet'}
MÜŞTERİ ADI: ${musteriIsim}
${profilBilgisi}
HİZMETLER: ${hizmetListesi}

KRİTİK KURALLAR:
- İşletme adını olduğu gibi kullan, ASLA değiştirme veya birleştirme! Doğru: "${isletmeBilgi.isim}" Yanlış: "Sen${isletmeBilgi.isim}", "${isletmeBilgi.isim}ci"
- Her zaman "siz" hitabı kullan, asla "sen" deme
- Doğal, samimi ama profesyonel Türkçe
- Maksimum 2-3 kısa cümle
- Müşteri adını mesajın başında kullan (ör: "*Ahmet Bey*, hoş geldiniz!")
- Yaklaşan randevusu varsa: hatırlat ve "sizi bekliyoruz" de
- Geçmiş randevusu varsa: o hizmeti hatırlat, tekrar gelmesini öner
- İlk kez geliyorsa: sıcak karşıla
- Son cümle her zaman: "Size nasıl yardımcı olabilirim?"
- Bold (*) sadece müşteri adı için kullan`
          },
          { role: 'user', content: 'Karşılama mesajı yaz' }
        ]
      }, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 5000
      });
      return response.data.choices[0].message.content.trim();
    } catch (err) {
      console.error('DeepSeek kişisel karşılama hatası:', err.message);
      return null;
    }
  }

  async serbetCevap(mesaj, isletmeBilgi, hizmetler, kanal = 'whatsapp') {
    if (!this.apiKey) return null;
    const hizmetListesi = hizmetler.map(h => `${h.isim} (${h.sure_dk} dk, ${h.fiyat} TL)`).join(', ');
    try {
      const response = await axios.post(this.baseURL, {
        model: 'deepseek-chat',
        max_tokens: 300,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `Sen "${isletmeBilgi.isim}" adlı işletmenin ${kanal === 'telegram' ? 'Telegram' : 'WhatsApp'} asistanısın.

KRİTİK KURALLAR:
- Her zaman "siz" hitabı kullan, ASLA "sen" deme (Yanlış: "Senin için", "seni görmek" / Doğru: "Sizin için", "sizi görmek")
- İşletme adını olduğu gibi kullan, değiştirme: "${isletmeBilgi.isim}"
- Türkçe, sıcak ve kısa cevap ver (2-3 cümle max)
- Emoji kullan ama abartma
- Hizmetler: ${hizmetListesi}
- Müşteriyi nazikçe randevu almaya yönlendir ama zorlamadan`
          },
          { role: 'user', content: mesaj }
        ]
      }, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
        timeout: 8000
      });
      return response.data.choices[0].message.content.trim();
    } catch (err) {
      console.error('DeepSeek serbest cevap hatası:', err.message);
      return null;
    }
  }
}

module.exports = new DeepSeekService();
