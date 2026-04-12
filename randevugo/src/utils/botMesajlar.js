/**
 * Bot Mesaj Şablonları — Dil + Stil desteği
 * Kullanım: const M = require('./botMesajlar'); M.get(isletme, 'anaMenu', { musteriAd, hizmetler })
 */

const STILLER = {
  samimi: { hitap: 'sen', emoji: true, kisa: false },
  resmi:  { hitap: 'siz', emoji: false, kisa: false },
  kisa:   { hitap: 'siz', emoji: true, kisa: true },
};

// ═══════════════════════════════════════════
// TÜRKÇE MESAJLAR
// ═══════════════════════════════════════════
const tr = {
  anaMenu: (s, p) => {
    const selam = p.musteriAd ? ` ${p.musteriAd}` : '';
    if (s.kisa) return `Merhaba${selam}!\n*${p.isletmeAd}*\n\n*1.* Randevu Al\n*2.* Randevularım\n*3.* İptal`;
    if (!s.emoji) return `Merhaba${selam}, *${p.isletmeAd}*'e hoş geldiniz.\n\nSize nasıl yardımcı olabiliriz?\n\n*1.* Randevu Al\n*2.* Randevularım\n*3.* Randevu İptal\n\nNumara yazarak seçiniz.`;
    return `Merhaba${selam}! 👋\n*${p.isletmeAd}*'e hoş geldiniz.\n\nSize nasıl yardımcı olabilirim?\n\n*1.* 📅 Randevu Al\n*2.* 📋 Randevularım\n*3.* ❌ Randevu İptal\n\nNumara yazarak seçin:`;
  },

  hizmetListesi: (s, p) => {
    const baslik = s.emoji ? `✂️ *${p.isletmeAd} - Hizmetlerimiz*` : `*${p.isletmeAd} - Hizmetlerimiz*`;
    let metin = baslik + '\n\n';
    p.hizmetler.forEach((h, i) => {
      metin += `*${i + 1}.* ${h.isim} - ${h.sure_dk}dk - ${p.fiyatFormat(h.fiyat)} TL\n`;
    });
    metin += s.kisa ? '\nSeçin:' : '\nNumara yazarak seçin:';
    return metin;
  },

  hizmetSecildi: (s, p) => {
    const ok = s.emoji ? '✅' : '•';
    let txt = `${ok} *${p.hizmetAd}* seçildi\n\n`;
    if (!s.kisa && p.sureDk) {
      txt += `${s.emoji ? '⏱' : '•'} Süre: ${p.sureDk} dk\n`;
    }
    if (!s.kisa && p.fiyat) {
      txt += `${s.emoji ? '💰' : '•'} Ücret: ${p.fiyat} TL\n`;
    }
    if (p.calisanAd) txt += `${s.emoji ? '👤' : '•'} Çalışan: ${p.calisanAd}\n`;
    txt += `\n${s.emoji ? '📅' : ''} Hangi gün ister${s.hitap === 'siz' ? 'siniz' : 'sin'}?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`;
    return txt;
  },

  calisanSec: (s, p) => {
    const ok = s.emoji ? '✅' : '•';
    let txt = `${ok} *${p.hizmetAd}* seçildi\n\n`;
    if (!s.kisa) {
      txt += `${s.emoji ? '⏱' : '•'} Süre: ${p.sureDk} dk\n`;
      txt += `${s.emoji ? '💰' : '•'} Ücret: ${p.fiyat} TL\n`;
    }
    txt += `\n${s.emoji ? '👤' : ''} Çalışan seçin${s.hitap === 'siz' ? 'iz' : ''}:\n\n`;
    p.calisanlar.forEach((c, i) => { txt += `*${i + 1}.* ${c.isim}\n`; });
    return txt;
  },

  tarihSec: (s) => {
    const icon = s.emoji ? '📅 ' : '';
    return `${icon}Hangi gün ister${s.hitap === 'siz' ? 'siniz' : 'sin'}?\n\n*1.* Bugün\n*2.* Yarın\n*3.* Bu Hafta`;
  },

  gunSec: (s, p) => {
    let cevap = `${s.emoji ? '📅 ' : ''}*Gün Seçin:*\n\n`;
    p.gunler.forEach((g, i) => { cevap += `*${i + 1}.* ${g}\n`; });
    cevap += s.kisa ? '\nSeçin:' : '\nNumara yazarak seçin:';
    return cevap;
  },

  saatListesi: (s, p) => {
    let r = `${s.emoji ? '📅 ' : ''}*${p.tarihStr}* müsait saatler:\n\n`;
    p.saatler.forEach((saat, i) => { r += `*${i + 1}.* ${saat}\n`; });
    r += s.kisa ? '\nSeçin:' : '\nNumara yazarak seçin:';
    return r;
  },

  saatYok: (s, p) => {
    return `${p.tarihStr} tarihinde müsait saat ${s.emoji ? '' : 'bulunmamaktadır'}${s.emoji ? 'yok 😔' : ''}.\n\n*1.* Bugün\n*2.* Yarın\n*0.* Ana Menü`;
  },

  randevuOzet: (s, p) => {
    const icon = s.emoji;
    let ozet = `${icon ? '📋 ' : ''}*Randevu Özeti*\n\n`;
    ozet += `${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) ozet += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    if (p.calisanAd) ozet += `${icon ? '👤 ' : ''}${p.calisanAd}\n`;
    ozet += `${icon ? '📅 ' : ''}${p.tarihStr}\n`;
    ozet += `${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (p.fiyat) ozet += `${icon ? '💰 ' : ''}${p.fiyat} TL\n`;
    ozet += `\nHer şey doğru mu?\n\n*1.* ${icon ? '✅ ' : ''}Onayla\n*2.* ${icon ? '❌ ' : ''}İptal`;
    return ozet;
  },

  randevuOnaylandi: (s, p) => {
    const icon = s.emoji;
    let txt = `${icon ? '✅ ' : ''}*Randevu${s.hitap === 'siz' ? 'nuz' : 'n'} Oluşturuldu!*\n\n`;
    txt += `${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) txt += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    if (p.calisanAd) txt += `${icon ? '👤 ' : ''}${p.calisanAd}\n`;
    txt += `${icon ? '📅 ' : ''}${p.tarihStr}\n`;
    txt += `${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (!s.kisa) txt += `\n${icon ? '⏰ ' : ''}Randevu${s.hitap === 'siz' ? 'nuz' : 'n'}dan 1 saat önce hatırlatma alacaksınız.\n`;
    txt += `\n${icon ? '' : ''}Görüşmek üzere${icon ? '! 😊' : '.'}`;
    txt += `\n\n_Powered by SıraGO — sırago.com_`;
    return txt;
  },

  randevuNotKaydedildi: (s, p) => {
    return `${s.emoji ? '✅ ' : ''}*Randevu${s.hitap === 'siz' ? 'nuz' : 'n'} oluşturuldu!*\n\n${s.emoji ? '💬 ' : ''}Not${s.hitap === 'siz' ? 'unuz' : 'un'}: "${p.not}"\n\nGörüşmek üzere${s.emoji ? '! 😊' : '.'}\n\n_Powered by SıraGO — sırago.com_`;
  },

  iptalListesi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}*Randevu İptali*\n\nHangi randevuyu iptal etmek ister${s.hitap === 'siz' ? 'siniz' : 'sin'}?\n\n`;
    p.randevular.forEach((r, i) => {
      txt += `*${i + 1}.* ${r.hizmet_isim || 'Randevu'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`;
    });
    txt += `*0.* Vazgeç`;
    return txt;
  },

  randevuYok: (s) => {
    return `Aktif randevu${s.hitap === 'siz' ? 'nuz' : 'n'} bulunmuyor.\n\n${s.emoji ? '📅 ' : ''}Randevu almak için *1* yaz${s.hitap === 'siz' ? 'ın' : ''}.`;
  },

  randevularim: (s, p) => {
    let metin = `${s.emoji ? '📋 ' : ''}*Randevularınız*\n\n`;
    p.randevular.forEach((r, i) => {
      metin += `*${i + 1}.* ${r.hizmet_isim || 'Hizmet'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`;
    });
    metin += `*0.* Ana Menü`;
    return metin;
  },

  iptalOnay: (s, p) => {
    return `${s.emoji ? '⚠️ ' : ''}*${p.hizmetAd}* randevusu${s.hitap === 'siz' ? 'nuz' : 'n'}\n${s.emoji ? '📅 ' : ''}${p.tarihStr} - ${s.emoji ? '🕐 ' : ''}${p.saatStr}\n\nİptal etmek istediğin${s.hitap === 'siz' ? 'ize' : 'e'} emin mi${s.hitap === 'siz' ? 'siniz' : 'sin'}?\n\n*1.* ${s.emoji ? '✅ ' : ''}Evet, iptal et\n*2.* ${s.emoji ? '❌ ' : ''}Hayır, vazgeç`;
  },

  iptalBasarili: (s, p) => {
    return `${s.emoji ? '✅ ' : ''}*${p.hizmetAd}* randevusu${s.hitap === 'siz' ? 'nuz' : 'n'} iptal edildi.\n\nRandevu almak için *1* yaz${s.hitap === 'siz' ? 'ın' : ''}.`;
  },

  hizmetBulunamadi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}Anlayamadım. Lütfen hizmet numarası veya adı yaz${s.hitap === 'siz' ? 'ın' : ''}:\n\n`;
    p.hizmetler.forEach((h, i) => {
      txt += `*${i + 1}.* ${h.isim} - ${h.sure_dk}dk - ${p.fiyatFormat(h.fiyat)} TL\n`;
    });
    txt += s.kisa ? '\nSeçin:' : '\nNumara yazarak seçin:';
    return txt;
  },

  konum: (s, p) => {
    let txt = `${s.emoji ? '📍 ' : ''}*Adresimiz*\n\n${p.isletmeAd}\n${s.emoji ? '📍 ' : ''}${p.adres}`;
    if (p.ilce) txt += `, ${p.ilce}`;
    if (p.sehir) txt += `, ${p.sehir}`;
    txt += '\n';
    if (p.telefon) txt += `${s.emoji ? '📞 ' : ''}${p.telefon}\n`;
    if (p.mapsLink) txt += `\n${s.emoji ? '🗺 ' : ''}Google Maps: ${p.mapsLink}\n`;
    txt += `\nRandevu almak için *1* yaz${s.hitap === 'siz' ? 'ın' : ''}.`;
    return txt;
  },

  calismaSaatleri: (s, p) => {
    let txt = `${s.emoji ? '🕐 ' : ''}*Çalışma Saatleri${s.hitap === 'siz' ? 'miz' : ''}*\n\n`;
    txt += `${s.emoji ? '✅ ' : ''}Açık: ${p.basSaat} - ${p.bitSaat}\n`;
    if (p.kapaliGunler) txt += `${s.emoji ? '❌ ' : ''}Kapalı: ${p.kapaliGunler}\n`;
    if (!s.kisa) txt += `\n${s.emoji ? '⏱ ' : ''}Süre: ${p.sureDk} dk seans\n`;
    txt += `\nRandevu almak için *1* yaz${s.hitap === 'siz' ? 'ın' : ''}.`;
    return txt;
  },

  mesaiDisi: (s, p) => {
    if (!s.emoji) return `Şu an kapalıyız. Çalışma saatlerimiz: ${p.basSaat} - ${p.bitSaat}. Açıldığımızda size dönüş yapacağız.`;
    return `Şu an kapalıyız. 🕐 Çalışma saatlerimiz: ${p.basSaat} - ${p.bitSaat}. Açıldığımızda size dönüş yapacağız.`;
  },

  randevuAlIcin: (s) => `Randevu almak için *1* yaz${s.hitap === 'siz' ? 'ın' : ''}.`,
};

// ═══════════════════════════════════════════
// ENGLISH MESSAGES
// ═══════════════════════════════════════════
const en = {
  anaMenu: (s, p) => {
    const selam = p.musteriAd ? ` ${p.musteriAd}` : '';
    if (s.kisa) return `Hi${selam}!\n*${p.isletmeAd}*\n\n*1.* Book\n*2.* My Appointments\n*3.* Cancel`;
    if (!s.emoji) return `Hello${selam}, welcome to *${p.isletmeAd}*.\n\nHow can we help you?\n\n*1.* Book Appointment\n*2.* My Appointments\n*3.* Cancel Appointment\n\nPlease type a number.`;
    return `Hi${selam}! 👋\nWelcome to *${p.isletmeAd}*.\n\nHow can I help you?\n\n*1.* 📅 Book Appointment\n*2.* 📋 My Appointments\n*3.* ❌ Cancel Appointment\n\nType a number:`;
  },

  hizmetListesi: (s, p) => {
    const baslik = s.emoji ? `✂️ *${p.isletmeAd} - Our Services*` : `*${p.isletmeAd} - Our Services*`;
    let metin = baslik + '\n\n';
    p.hizmetler.forEach((h, i) => { metin += `*${i + 1}.* ${h.isim} - ${h.sure_dk}min - ${p.fiyatFormat(h.fiyat)} TL\n`; });
    metin += s.kisa ? '\nChoose:' : '\nType a number to select:';
    return metin;
  },

  hizmetSecildi: (s, p) => {
    const ok = s.emoji ? '✅' : '•';
    let txt = `${ok} *${p.hizmetAd}* selected\n\n`;
    if (!s.kisa && p.sureDk) txt += `${s.emoji ? '⏱' : '•'} Duration: ${p.sureDk} min\n`;
    if (!s.kisa && p.fiyat) txt += `${s.emoji ? '💰' : '•'} Price: ${p.fiyat} TL\n`;
    if (p.calisanAd) txt += `${s.emoji ? '👤' : '•'} Staff: ${p.calisanAd}\n`;
    txt += `\n${s.emoji ? '📅 ' : ''}Which day?\n\n*1.* Today\n*2.* Tomorrow\n*3.* This Week`;
    return txt;
  },

  calisanSec: (s, p) => {
    let txt = `${s.emoji ? '✅' : '•'} *${p.hizmetAd}* selected\n\n`;
    if (!s.kisa) { txt += `${s.emoji ? '⏱' : '•'} Duration: ${p.sureDk} min\n${s.emoji ? '💰' : '•'} Price: ${p.fiyat} TL\n`; }
    txt += `\n${s.emoji ? '👤 ' : ''}Choose staff:\n\n`;
    p.calisanlar.forEach((c, i) => { txt += `*${i + 1}.* ${c.isim}\n`; });
    return txt;
  },

  tarihSec: (s) => `${s.emoji ? '📅 ' : ''}Which day?\n\n*1.* Today\n*2.* Tomorrow\n*3.* This Week`,

  gunSec: (s, p) => {
    let cevap = `${s.emoji ? '📅 ' : ''}*Choose a day:*\n\n`;
    p.gunler.forEach((g, i) => { cevap += `*${i + 1}.* ${g}\n`; });
    cevap += s.kisa ? '\nChoose:' : '\nType a number to select:';
    return cevap;
  },

  saatListesi: (s, p) => {
    let r = `${s.emoji ? '📅 ' : ''}*${p.tarihStr}* available times:\n\n`;
    p.saatler.forEach((saat, i) => { r += `*${i + 1}.* ${saat}\n`; });
    r += s.kisa ? '\nChoose:' : '\nType a number to select:';
    return r;
  },

  saatYok: (s, p) => `No available times on ${p.tarihStr}${s.emoji ? ' 😔' : ''}.\n\n*1.* Today\n*2.* Tomorrow\n*0.* Main Menu`,

  randevuOzet: (s, p) => {
    const icon = s.emoji;
    let ozet = `${icon ? '📋 ' : ''}*Appointment Summary*\n\n`;
    ozet += `${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) ozet += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    if (p.calisanAd) ozet += `${icon ? '👤 ' : ''}${p.calisanAd}\n`;
    ozet += `${icon ? '📅 ' : ''}${p.tarihStr}\n${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (p.fiyat) ozet += `${icon ? '💰 ' : ''}${p.fiyat} TL\n`;
    ozet += `\nEverything correct?\n\n*1.* ${icon ? '✅ ' : ''}Confirm\n*2.* ${icon ? '❌ ' : ''}Cancel`;
    return ozet;
  },

  randevuOnaylandi: (s, p) => {
    const icon = s.emoji;
    let txt = `${icon ? '✅ ' : ''}*Appointment Confirmed!*\n\n`;
    txt += `${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) txt += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    if (p.calisanAd) txt += `${icon ? '👤 ' : ''}${p.calisanAd}\n`;
    txt += `${icon ? '📅 ' : ''}${p.tarihStr}\n${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (!s.kisa) txt += `\n${icon ? '⏰ ' : ''}You will receive a reminder 1 hour before.\n`;
    txt += `\nSee you${icon ? '! 😊' : '.'}`;
    txt += `\n\n_Powered by SıraGO — sırago.com_`;
    return txt;
  },

  randevuNotKaydedildi: (s, p) => `${s.emoji ? '✅ ' : ''}*Appointment confirmed!*\n\n${s.emoji ? '💬 ' : ''}Note: "${p.not}"\n\nSee you${s.emoji ? '! 😊' : '.'}\n\n_Powered by SıraGO — sırago.com_`,

  iptalListesi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}*Cancel Appointment*\n\nWhich appointment would you like to cancel?\n\n`;
    p.randevular.forEach((r, i) => { txt += `*${i + 1}.* ${r.hizmet_isim || 'Appointment'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`; });
    txt += `*0.* Go back`;
    return txt;
  },

  randevuYok: (s) => `You have no active appointments.\n\n${s.emoji ? '📅 ' : ''}Type *1* to book.`,

  randevularim: (s, p) => {
    let metin = `${s.emoji ? '📋 ' : ''}*Your Appointments*\n\n`;
    p.randevular.forEach((r, i) => { metin += `*${i + 1}.* ${r.hizmet_isim || 'Service'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`; });
    metin += `*0.* Main Menu`;
    return metin;
  },

  iptalOnay: (s, p) => `${s.emoji ? '⚠️ ' : ''}*${p.hizmetAd}*\n${s.emoji ? '📅 ' : ''}${p.tarihStr} - ${s.emoji ? '🕐 ' : ''}${p.saatStr}\n\nAre you sure you want to cancel?\n\n*1.* ${s.emoji ? '✅ ' : ''}Yes, cancel\n*2.* ${s.emoji ? '❌ ' : ''}No, go back`,

  iptalBasarili: (s, p) => `${s.emoji ? '✅ ' : ''}*${p.hizmetAd}* appointment cancelled.\n\nType *1* to book a new appointment.`,

  hizmetBulunamadi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}Couldn't understand. Please type a service number or name:\n\n`;
    p.hizmetler.forEach((h, i) => { txt += `*${i + 1}.* ${h.isim} - ${h.sure_dk}min - ${p.fiyatFormat(h.fiyat)} TL\n`; });
    txt += s.kisa ? '\nChoose:' : '\nType a number to select:';
    return txt;
  },

  konum: (s, p) => {
    let txt = `${s.emoji ? '📍 ' : ''}*Our Location*\n\n${p.isletmeAd}\n${s.emoji ? '📍 ' : ''}${p.adres}`;
    if (p.ilce) txt += `, ${p.ilce}`;
    if (p.sehir) txt += `, ${p.sehir}`;
    txt += '\n';
    if (p.telefon) txt += `${s.emoji ? '📞 ' : ''}${p.telefon}\n`;
    if (p.mapsLink) txt += `\n${s.emoji ? '🗺 ' : ''}Google Maps: ${p.mapsLink}\n`;
    txt += `\nType *1* to book.`;
    return txt;
  },

  calismaSaatleri: (s, p) => {
    let txt = `${s.emoji ? '🕐 ' : ''}*Working Hours*\n\n`;
    txt += `${s.emoji ? '✅ ' : ''}Open: ${p.basSaat} - ${p.bitSaat}\n`;
    if (p.kapaliGunler) txt += `${s.emoji ? '❌ ' : ''}Closed: ${p.kapaliGunler}\n`;
    if (!s.kisa) txt += `\n${s.emoji ? '⏱ ' : ''}Session: ${p.sureDk} min\n`;
    txt += `\nType *1* to book.`;
    return txt;
  },

  mesaiDisi: (s, p) => {
    if (!s.emoji) return `We are currently closed. Working hours: ${p.basSaat} - ${p.bitSaat}. We will get back to you when we open.`;
    return `We're currently closed. 🕐 Working hours: ${p.basSaat} - ${p.bitSaat}. We'll get back to you when we open.`;
  },

  randevuAlIcin: (s) => `Type *1* to book.`,
};

// ═══════════════════════════════════════════
// ARABIC MESSAGES (العربية)
// ═══════════════════════════════════════════
const ar = {
  anaMenu: (s, p) => {
    const selam = p.musteriAd ? ` ${p.musteriAd}` : '';
    if (s.kisa) return `مرحباً${selam}!\n*${p.isletmeAd}*\n\n*1.* حجز موعد\n*2.* مواعيدي\n*3.* إلغاء`;
    return `مرحباً${selam}${s.emoji ? '! 👋' : ','}\nأهلاً بك في *${p.isletmeAd}*.\n\nكيف يمكنني مساعدتك؟\n\n*1.* ${s.emoji ? '📅 ' : ''}حجز موعد\n*2.* ${s.emoji ? '📋 ' : ''}مواعيدي\n*3.* ${s.emoji ? '❌ ' : ''}إلغاء موعد\n\nاكتب رقماً:`;
  },

  hizmetListesi: (s, p) => {
    let metin = `${s.emoji ? '✂️ ' : ''}*${p.isletmeAd} - خدماتنا*\n\n`;
    p.hizmetler.forEach((h, i) => { metin += `*${i + 1}.* ${h.isim} - ${h.sure_dk}د - ${p.fiyatFormat(h.fiyat)} TL\n`; });
    metin += '\nاكتب رقماً:';
    return metin;
  },

  hizmetSecildi: (s, p) => {
    let txt = `${s.emoji ? '✅ ' : ''}تم اختيار *${p.hizmetAd}*\n\n`;
    if (!s.kisa && p.sureDk) txt += `${s.emoji ? '⏱ ' : ''}المدة: ${p.sureDk} دقيقة\n`;
    if (!s.kisa && p.fiyat) txt += `${s.emoji ? '💰 ' : ''}السعر: ${p.fiyat} TL\n`;
    if (p.calisanAd) txt += `${s.emoji ? '👤 ' : ''}الموظف: ${p.calisanAd}\n`;
    txt += `\n${s.emoji ? '📅 ' : ''}أي يوم تريد؟\n\n*1.* اليوم\n*2.* غداً\n*3.* هذا الأسبوع`;
    return txt;
  },

  calisanSec: (s, p) => {
    let txt = `${s.emoji ? '✅ ' : ''}تم اختيار *${p.hizmetAd}*\n\n`;
    txt += `\n${s.emoji ? '👤 ' : ''}اختر الموظف:\n\n`;
    p.calisanlar.forEach((c, i) => { txt += `*${i + 1}.* ${c.isim}\n`; });
    return txt;
  },

  tarihSec: (s) => `${s.emoji ? '📅 ' : ''}أي يوم تريد؟\n\n*1.* اليوم\n*2.* غداً\n*3.* هذا الأسبوع`,

  gunSec: (s, p) => {
    let cevap = `${s.emoji ? '📅 ' : ''}*اختر يوماً:*\n\n`;
    p.gunler.forEach((g, i) => { cevap += `*${i + 1}.* ${g}\n`; });
    cevap += '\nاكتب رقماً:';
    return cevap;
  },

  saatListesi: (s, p) => {
    let r = `${s.emoji ? '📅 ' : ''}*${p.tarihStr}* الأوقات المتاحة:\n\n`;
    p.saatler.forEach((saat, i) => { r += `*${i + 1}.* ${saat}\n`; });
    r += '\nاكتب رقماً:';
    return r;
  },

  saatYok: (s, p) => `لا توجد أوقات متاحة في ${p.tarihStr}${s.emoji ? ' 😔' : ''}.\n\n*1.* اليوم\n*2.* غداً\n*0.* القائمة الرئيسية`,

  randevuOzet: (s, p) => {
    const icon = s.emoji;
    let ozet = `${icon ? '📋 ' : ''}*ملخص الموعد*\n\n`;
    ozet += `${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) ozet += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    if (p.calisanAd) ozet += `${icon ? '👤 ' : ''}${p.calisanAd}\n`;
    ozet += `${icon ? '📅 ' : ''}${p.tarihStr}\n${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (p.fiyat) ozet += `${icon ? '💰 ' : ''}${p.fiyat} TL\n`;
    ozet += `\nهل كل شيء صحيح؟\n\n*1.* ${icon ? '✅ ' : ''}تأكيد\n*2.* ${icon ? '❌ ' : ''}إلغاء`;
    return ozet;
  },

  randevuOnaylandi: (s, p) => {
    const icon = s.emoji;
    let txt = `${icon ? '✅ ' : ''}*تم تأكيد الموعد!*\n\n${icon ? '🏥 ' : ''}${p.isletmeAd}\n`;
    if (p.hizmetAd) txt += `${icon ? '✂️ ' : ''}${p.hizmetAd}\n`;
    txt += `${icon ? '📅 ' : ''}${p.tarihStr}\n${icon ? '🕐 ' : ''}${p.saatStr}\n`;
    if (!s.kisa) txt += `\n${icon ? '⏰ ' : ''}سيتم تذكيرك قبل ساعة.\n`;
    txt += `\nنراكم${icon ? '! 😊' : '.'}`;
    txt += `\n\n_Powered by SıraGO — sırago.com_`;
    return txt;
  },

  randevuNotKaydedildi: (s, p) => `${s.emoji ? '✅ ' : ''}*تم تأكيد الموعد!*\n\n${s.emoji ? '💬 ' : ''}ملاحظة: "${p.not}"\n\nنراكم${s.emoji ? '! 😊' : '.'}\n\n_Powered by SıraGO — sırago.com_`,

  iptalListesi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}*إلغاء موعد*\n\nأي موعد تريد إلغاءه؟\n\n`;
    p.randevular.forEach((r, i) => { txt += `*${i + 1}.* ${r.hizmet_isim || 'موعد'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`; });
    txt += `*0.* رجوع`;
    return txt;
  },

  randevuYok: (s) => `لا توجد مواعيد حالية.\n\n${s.emoji ? '📅 ' : ''}اكتب *1* للحجز.`,

  randevularim: (s, p) => {
    let metin = `${s.emoji ? '📋 ' : ''}*مواعيدك*\n\n`;
    p.randevular.forEach((r, i) => { metin += `*${i + 1}.* ${r.hizmet_isim || 'خدمة'}\n     ${s.emoji ? '📅 ' : ''}${r.tarihStr} - ${s.emoji ? '🕐 ' : ''}${r.saatStr}\n\n`; });
    metin += `*0.* القائمة الرئيسية`;
    return metin;
  },

  iptalOnay: (s, p) => `${s.emoji ? '⚠️ ' : ''}*${p.hizmetAd}*\n${s.emoji ? '📅 ' : ''}${p.tarihStr} - ${s.emoji ? '🕐 ' : ''}${p.saatStr}\n\nهل أنت متأكد من الإلغاء؟\n\n*1.* ${s.emoji ? '✅ ' : ''}نعم\n*2.* ${s.emoji ? '❌ ' : ''}لا`,

  iptalBasarili: (s, p) => `${s.emoji ? '✅ ' : ''}تم إلغاء موعد *${p.hizmetAd}*.\n\nاكتب *1* لحجز موعد جديد.`,

  hizmetBulunamadi: (s, p) => {
    let txt = `${s.emoji ? '❌ ' : ''}لم أفهم. اكتب رقم أو اسم الخدمة:\n\n`;
    p.hizmetler.forEach((h, i) => { txt += `*${i + 1}.* ${h.isim} - ${h.sure_dk}د - ${p.fiyatFormat(h.fiyat)} TL\n`; });
    txt += '\nاكتب رقماً:';
    return txt;
  },

  konum: (s, p) => {
    let txt = `${s.emoji ? '📍 ' : ''}*عنواننا*\n\n${p.isletmeAd}\n${s.emoji ? '📍 ' : ''}${p.adres}`;
    if (p.ilce) txt += `, ${p.ilce}`;
    if (p.sehir) txt += `, ${p.sehir}`;
    txt += '\n';
    if (p.telefon) txt += `${s.emoji ? '📞 ' : ''}${p.telefon}\n`;
    if (p.mapsLink) txt += `\n${s.emoji ? '🗺 ' : ''}Google Maps: ${p.mapsLink}\n`;
    txt += `\nاكتب *1* للحجز.`;
    return txt;
  },

  calismaSaatleri: (s, p) => {
    let txt = `${s.emoji ? '🕐 ' : ''}*ساعات العمل*\n\n`;
    txt += `${s.emoji ? '✅ ' : ''}مفتوح: ${p.basSaat} - ${p.bitSaat}\n`;
    if (p.kapaliGunler) txt += `${s.emoji ? '❌ ' : ''}مغلق: ${p.kapaliGunler}\n`;
    txt += `\nاكتب *1* للحجز.`;
    return txt;
  },

  mesaiDisi: (s, p) => `نحن مغلقون حالياً. ${s.emoji ? '🕐 ' : ''}ساعات العمل: ${p.basSaat} - ${p.bitSaat}. سنعود إليكم عند الافتتاح.`,

  randevuAlIcin: (s) => `اكتب *1* للحجز.`,
};

const DILLER = { tr, en, ar };

/**
 * Basit dil algılama — müşteri mesajından dili tespit et
 */
function dilAlgila(metin) {
  if (!metin) return null;
  const m = metin.toLowerCase();
  // Arapça karakterler
  if (/[\u0600-\u06FF]/.test(m)) return 'ar';
  // İngilizce yaygın kelimeler
  const enWords = ['hi', 'hello', 'book', 'appointment', 'cancel', 'yes', 'no', 'today', 'tomorrow', 'thanks', 'thank'];
  if (enWords.some(w => m === w || m.startsWith(w + ' '))) return 'en';
  return null;
}

/**
 * İşletmenin varsayılan dilini al
 */
function varsayilanDil(isletme) {
  if (!isletme.bot_diller) return 'tr';
  const diller = Array.isArray(isletme.bot_diller) ? isletme.bot_diller : 
    (typeof isletme.bot_diller === 'string' ? isletme.bot_diller.split(',').map(d => d.trim()) : ['tr']);
  return diller[0] || 'tr';
}

/**
 * Ana get fonksiyonu
 * @param {object} isletme - DB'den gelen işletme objesi
 * @param {string} key - Mesaj anahtarı (anaMenu, hizmetListesi, ...)
 * @param {object} params - Mesaja özel parametreler
 * @param {string} musteriMesaj - Müşterinin yazdığı mesaj (dil algılama için)
 * @returns {string} Formatlanmış mesaj
 */
function get(isletme, key, params = {}, musteriMesaj = null) {
  // Stil belirle
  const stilKey = isletme.bot_konusma_stili || 'samimi';
  const stil = STILLER[stilKey] || STILLER.samimi;

  // Dil belirle: müşteri mesajından algıla veya işletme varsayılanı
  let dil = varsayilanDil(isletme);
  if (musteriMesaj) {
    const algilanan = dilAlgila(musteriMesaj);
    if (algilanan) {
      // İşletme bu dili destekliyor mu?
      const desteklenen = Array.isArray(isletme.bot_diller) ? isletme.bot_diller : 
        (typeof isletme.bot_diller === 'string' ? isletme.bot_diller.split(',').map(d => d.trim()) : ['tr']);
      if (desteklenen.includes(algilanan)) dil = algilanan;
    }
  }

  const dilMesajlar = DILLER[dil] || DILLER.tr;
  const fn = dilMesajlar[key];
  if (!fn) return DILLER.tr[key] ? DILLER.tr[key](stil, params) : '';
  return fn(stil, params);
}

module.exports = { get, dilAlgila, varsayilanDil, STILLER };
