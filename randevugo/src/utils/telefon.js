// Telefon numarasını botun kullandığı biçime çevirir: 905XXXXXXXXX (yalnız rakam).
// Web formu "0532…", "532…", "+90 532…" gibi farklı biçimler gönderiyordu; aynı kişi
// birden çok müşteri kaydı oluşturuyor, WhatsApp'a geçersiz adresle mesaj gidiyordu.
function telefonNormalize(tel) {
  let t = String(tel || '').replace(/\D/g, '');
  if (!t) return '';
  t = t.replace(/^00/, '');           // 0090… uluslararası önek
  if (t.length === 11 && t.startsWith('0')) t = t.slice(1); // 05XX… → 5XX…
  if (t.length === 10 && t.startsWith('5')) t = '90' + t;   // 5XX… → 905XX…
  return t;
}

module.exports = { telefonNormalize };
