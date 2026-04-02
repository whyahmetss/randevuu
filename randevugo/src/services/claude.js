const axios = require('axios');

class ClaudeService {
  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY;
    this.baseURL = 'https://api.anthropic.com/v1/messages';
  }

  async mesajAnla(mesaj, isletmeBilgi, botDurum, musaitSaatler, hizmetler) {
    const sistemPrompt = `Sen RandevuGO'nun WhatsApp randevu botusun. ${isletmeBilgi.isim} için çalışıyorsun.
Kategori: ${isletmeBilgi.kategori}
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

JSON FORMATI:
{
  "cevap": "Müşteriye gönderilecek WhatsApp mesajı",
  "aksiyon": "hizmet_listele | hizmet_secildi | tarih_sor | tarih_secildi | saat_listele | saat_secildi | randevu_onayla | iptal | bilgi | serbest_konusma",
  "secilen_hizmet_index": null veya sayı (1'den başlar),
  "secilen_tarih": null veya "YYYY-MM-DD",
  "secilen_saat": null veya "HH:MM"
}`;

    try {
      const response = await axios.post(this.baseURL, {
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [{ role: 'user', content: sistemPrompt }]
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        }
      });

      const text = response.data.content[0].text;
      
      // JSON parse et
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      return {
        cevap: 'Bir sorun oluştu, lütfen tekrar deneyin.',
        aksiyon: 'serbest_konusma'
      };
    } catch (error) {
      console.error('Claude API hatası:', error.message);
      return {
        cevap: 'Şu an teknik bir sorun yaşıyoruz. Lütfen biraz sonra tekrar deneyin. 🙏',
        aksiyon: 'serbest_konusma'
      };
    }
  }
}

module.exports = new ClaudeService();
