// E-posta gönderimi (2026-10-22): Resend HTTP API. Render ücretsiz planda SMTP portları kapalı olduğu için SMTP değil.
// RESEND_API_KEY yoksa gönderim kapalıdır (aktif() false) — kayıt e-posta doğrulamasız devam eder.
// Gönderen adres EPOSTA_GONDEREN ile değişir; alan adı Resend'de doğrulanmış olmalı.
const aktif = () => !!(process.env.RESEND_API_KEY || '').trim();
const GONDEREN = () => (process.env.EPOSTA_GONDEREN || '').trim() || 'SıraGO <dogrulama@xn--srago-n4a.com>';

async function epostaGonder({ kime, konu, html, metin }) {
  if (!aktif()) return { success: false, hata: 'E-posta servisi ayarlı değil' };
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: GONDEREN(), to: [kime], subject: konu, html, text: metin }),
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

// Kayıt doğrulama kodu e-postası
function dogrulamaMaili(kod) {
  const metin = `SıraGO doğrulama kodunuz: ${kod}\n15 dakika geçerli. Bu kaydı siz yapmadıysanız bu e-postayı dikkate almayın.`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#1f2933">
  <div style="font-size:20px;font-weight:700;color:#1f6f4a;margin-bottom:16px">SıraGO</div>
  <div style="font-size:15px;margin-bottom:12px">Hesabınızı oluşturmak için doğrulama kodunuz:</div>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;background:#f2f7f4;border-radius:12px;padding:16px;text-align:center">${kod}</div>
  <div style="font-size:13px;color:#6f6a62;margin-top:16px">Kod 15 dakika geçerli. Bu kaydı siz yapmadıysanız bu e-postayı dikkate almayın.</div>
</div>`;
  return { konu: `SıraGO doğrulama kodu: ${kod}`, html, metin };
}

module.exports = { aktif, epostaGonder, dogrulamaMaili };
