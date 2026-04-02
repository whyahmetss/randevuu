const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.client = null;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
  }

  init() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      console.log('📱 WhatsApp servisi hazır (Twilio)');
    } else {
      console.log('⚠️  Twilio ayarları eksik - WhatsApp mesajları gönderilmeyecek (test modu)');
    }
  }

  async mesajGonder(hedefNumara, mesaj) {
    // Numara formatını düzelt
    const formattedNumber = hedefNumara.startsWith('whatsapp:') 
      ? hedefNumara 
      : `whatsapp:+90${hedefNumara.replace(/^0/, '')}`;

    if (!this.client) {
      console.log(`📤 [TEST] → ${formattedNumber}: ${mesaj}`);
      return { success: true, test: true };
    }

    try {
      const result = await this.client.messages.create({
        from: this.fromNumber,
        to: formattedNumber,
        body: mesaj
      });
      console.log(`📤 WhatsApp gönderildi → ${formattedNumber}`);
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('❌ WhatsApp gönderim hatası:', error.message);
      return { success: false, error: error.message };
    }
  }

  async hatirlatmaGonder(hedefNumara, randevuBilgi) {
    const mesaj = `⏰ Randevu Hatırlatması!\n\n` +
      `📅 ${randevuBilgi.tarih}\n` +
      `🕐 ${randevuBilgi.saat}\n` +
      `✂️ ${randevuBilgi.hizmet}\n` +
      `📍 ${randevuBilgi.isletme_isim}\n\n` +
      `İptal etmek için "iptal" yazın.`;

    return this.mesajGonder(hedefNumara, mesaj);
  }
}

module.exports = new WhatsAppService();
