// SıraGO'nun kendi WhatsApp numaraları, kullanıcı kararı 2026-10-15. İki ayrı sistem:
//   • Satış Bot numaraları: esnafla satış konuşması, kayıt, otopilot kurulum (satis_bot_numaralar)
//   • Merkez OTP numaraları: doğrulama kodu, şifre ve sistem bildirimleri (merkez_otp_bot)
// Bir numara yalnız bir sisteme bağlanır; çakışırsa satış kazanır (digerSistemde, merkezOtpBot.satisaGecti).
// Esnafın botu iki sistemin numaralarına da cevap vermez (sistemNumarasi): esnaf numarasını bağlayınca Satış Bot'un
// kurulum mesajına kendi botu "Randevu için 1 yazın" deyip iki bot birbirine sonsuz yazmasın.
const pool = require('../config/db');
const { telefonNormalize } = require('./telefon');

const rakam = (x) => String(x || '').split(':')[0].split('@')[0].replace(/\D/g, '');
let _kayitli = { t: 0, set: new Set() };

async function kayitliNumaralar(sistem) {
  const sorgu = sistem === 'satis' ? 'SELECT telefon AS n FROM satis_bot_numaralar WHERE telefon IS NOT NULL'
    : 'SELECT numara AS n FROM merkez_otp_bot WHERE numara IS NOT NULL';
  try { return new Set((await pool.query(sorgu)).rows.map(r => telefonNormalize(r.n)).filter(Boolean)); } catch (e) { return new Set(); }
}

async function kayitliYenile() {
  const set = new Set([...(await kayitliNumaralar('satis')), ...(await kayitliNumaralar('merkez'))]);
  _kayitli = { t: Date.now(), set };
  return set;
}

// Canlı bağlantılar (numara + gizli kimlik LID); sistem verilmezse ikisi birden
function canliNumaralar(sistem) {
  const set = new Set();
  const ekle = (u) => { for (const x of [rakam(u?.id), rakam(u?.lid)]) if (x) set.add(x); };
  if (sistem !== 'merkez') {
    try {
      const sb = require('../services/satisBot');
      for (const [, ns] of sb.numaraSockets || []) ekle(ns.sock?.user);
      ekle(sb.sock?.user);
    } catch (e) { /* satış botu yüklenmedi */ }
  }
  if (sistem !== 'satis') {
    try { for (const [, s] of require('../services/merkezOtpBot').sockets || []) ekle(s.sock?.user); } catch (e) { /* OTP yüklenmedi */ }
  }
  return set;
}

function sistemNumarasi(tel) {
  const t = rakam(tel);
  if (!t) return false;
  if (Date.now() - _kayitli.t > 5 * 60 * 1000) { _kayitli.t = Date.now(); kayitliYenile().catch(() => {}); }
  return canliNumaralar().has(t) || _kayitli.set.has(t) || _kayitli.set.has(telefonNormalize(t));
}

// Bağlanan numara öbür sistemde (canlı ya da kayıtlı) var mı? sistem = bağlanmak isteyen ('satis' | 'merkez')
async function digerSistemde(tel, sistem) {
  const t = telefonNormalize(rakam(tel));
  if (!t) return false;
  const oburu = sistem === 'merkez' ? 'satis' : 'merkez';
  return canliNumaralar(oburu).has(t) || (await kayitliNumaralar(oburu)).has(t);
}

module.exports = { sistemNumarasi, kayitliYenile, canliNumaralar, digerSistemde };
