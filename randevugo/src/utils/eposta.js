// E-posta gönderimi (2026-10-22): Resend HTTP API. Render ücretsiz planda SMTP portları kapalı olduğu için SMTP değil.
// RESEND_API_KEY yoksa gönderim kapalıdır (aktif() false) — kayıt e-posta doğrulamasız devam eder.
// Gönderen adres EPOSTA_GONDEREN ile değişir; alan adı Resend'de doğrulanmış olmalı.
const aktif = () => !!(process.env.RESEND_API_KEY || '').trim();
const GONDEREN = () => (process.env.EPOSTA_GONDEREN || '').trim() || 'SıraGO <dogrulama@xn--srago-n4a.com>';

const yanitAdresi = () => { try { const e = require('../config/iletisim').DESTEK_EPOSTA; return /@/.test(e || '') ? e : null; } catch (e) { return null; } };

async function epostaGonder({ kime, konu, html, metin }) {
  if (!aktif()) return { success: false, hata: 'E-posta servisi ayarlı değil' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: GONDEREN(), to: [kime], subject: konu, html, text: metin,
        // Yanıtlanabilir gerçek adres spam puanını düşürür (no-reply gibi görünmez)
        ...(yanitAdresi() ? { reply_to: yanitAdresi() } : {}) }),
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return { success: true };
    const d = await r.json().catch(() => ({}));
    console.error('❌ E-posta gönderilemedi:', r.status, d?.message || '');
    return { success: false, hata: d?.message || `HTTP ${r.status}` };
  } catch (e) {
    console.error('❌ E-posta gönderilemedi:', e.message);
    return { success: false, hata: e.message };
  }
}

// Kayıt doğrulama kodu e-postası (2026-10-22 tasarım): tablo düzeni (Gmail/Outlook uyumlu), tilki logosu + SıraGO yazısı,
// kod büyük ve 3+3 aralıklı, gizli önizleme satırında kod görünür. Logo yüklenmese de yazı ve kod okunur.
function dogrulamaMaili(kod) {
  const panel = (process.env.ADMIN_PANEL_URL || 'https://admin.xn--srago-n4a.com').replace(/\/$/, '');
  const goster = `${kod.slice(0, 3)} ${kod.slice(3)}`;
  const metin = `SıraGO doğrulama kodun: ${goster}\n\nHesabını açmak için bu kodu kayıt ekranına yaz. Kod 15 dakika geçerli.\nBu kaydı sen yapmadıysan bu e-postayı yok sayabilirsin.\n\nSıraGO · sırago.com`;
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>SıraGO doğrulama kodu</title></head>
<body style="margin:0;padding:0;background:#f4f1ec;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Doğrulama kodun: ${goster} · 15 dakika geçerli</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border-radius:20px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1d2a24">
    <tr><td style="background:#1f6f4a;padding:22px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="padding-right:12px"><img src="${panel}/icon-192.png" width="44" height="44" alt="" style="display:block;border:0;border-radius:12px"></td>
        <td style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-.3px">SıraGO</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:32px 28px 8px">
      <div style="font-size:22px;font-weight:800;margin:0 0 10px">E-postanı doğrula</div>
      <div style="font-size:15px;line-height:1.6;color:#4a5a52">Hesabını açmak için bu kodu kayıt ekranına yaz:</div>
    </td></tr>
    <tr><td style="padding:18px 28px">
      <div style="background:#eaf3ee;border:1px solid #cfe3d7;border-radius:16px;padding:22px 12px;text-align:center;font-size:38px;font-weight:800;letter-spacing:10px;color:#1f6f4a;font-family:'SF Mono',Menlo,Consolas,monospace">${goster}</div>
      <div style="font-size:13px;color:#6f7d76;text-align:center;margin-top:12px">⏱ 15 dakika geçerli</div>
    </td></tr>
    <tr><td style="padding:8px 28px 28px">
      <div style="border-top:1px solid #eee9e1;padding-top:18px;font-size:13px;line-height:1.6;color:#8a948f">Bu kaydı sen yapmadıysan bu e-postayı yok sayabilirsin; kimse hesabına giremez.</div>
    </td></tr>
  </table>
  <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#9a9a92;margin-top:18px;line-height:1.6">SıraGO · WhatsApp randevu asistanı<br><a href="https://xn--srago-n4a.com" style="color:#1f6f4a;text-decoration:none">sırago.com</a></div>
</td></tr></table>
</body></html>`;
  return { konu: `${goster} — SıraGO doğrulama kodun`, html, metin };
}

module.exports = { aktif, epostaGonder, dogrulamaMaili };
