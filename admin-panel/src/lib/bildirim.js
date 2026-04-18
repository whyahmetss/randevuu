/**
 * BİLDİRİM SES YÖNETİCİSİ
 * - 5 farklı MP3 ses (ding, cash, bell, phone, ping)
 * - localStorage ile kullanıcı ayarı persist
 * - MP3 yüklenemezse synthesized beep'e fallback
 * - Autoplay policy için AudioContext unlock
 * - Rate limit: aynı id 5sn içinde 2x gelirse tek ses
 */

const DEFAULT_AYAR = {
  ses: 'ding',           // ding | cash | bell | phone | ping
  volume: 0.8,           // 0.0 - 1.0
  sessiz: false,         // toggle
  titresim: true,        // toggle
  dukkanModuAuto: false, // yeni randevu gelince fullscreen aç
};

const STORAGE_KEY = 'randevugo_bildirim_ayar';

// Ses dosyaları — public/sounds/ klasöründen
const SES_LISTESI = [
  { id: 'ding',  ad: '🔔 Ding',       aciklama: 'Klasik, yumuşak' },
  { id: 'cash',  ad: '💰 Kasa Çanı',  aciklama: 'Ka-ching, "para geliyor"' },
  { id: 'bell',  ad: '🚪 Kapı Çanı',  aciklama: 'Geleneksel dükkân' },
  { id: 'phone', ad: '📞 Telefon',    aciklama: 'Agresif, kaçırma riski düşük' },
  { id: 'ping',  ad: '✨ Ping',       aciklama: 'Modern, iPhone-vari' },
];

// ═══ Ayar yönetimi ═══
export function ayarOku() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AYAR };
    return { ...DEFAULT_AYAR, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_AYAR };
  }
}

export function ayarYaz(ayar) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...ayarOku(), ...ayar }));
  } catch {}
}

export function sesListesi() {
  return SES_LISTESI;
}

// ═══ Ses çalma ═══
const audioCache = new Map(); // sesId → HTMLAudioElement

function _ses(id) {
  if (audioCache.has(id)) return audioCache.get(id);
  const a = new Audio(`/sounds/${id}.mp3`);
  a.preload = 'auto';
  audioCache.set(id, a);
  return a;
}

// Synthesized fallback (dosya yüklenemezse)
let _ctx = null;
function _getCtx() {
  if (!_ctx) {
    try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch { _ctx = null; }
  }
  return _ctx;
}

function _synthesizedBeep(volume = 0.22) {
  try {
    const ctx = _getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); return; }
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(volume, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.start(); o.stop(ctx.currentTime + 0.4);
  } catch {}
}

// Dedup — aynı id 5sn içinde 2x gelirse tek sesle çal
const _sonCalmalar = new Map();
function _dedupOk(dedupId) {
  if (!dedupId) return true;
  const simdi = Date.now();
  const son = _sonCalmalar.get(dedupId);
  if (son && simdi - son < 5000) return false;
  _sonCalmalar.set(dedupId, simdi);
  // Eski kayıtları temizle (bellek için)
  if (_sonCalmalar.size > 50) {
    for (const [k, t] of _sonCalmalar) {
      if (simdi - t > 30000) _sonCalmalar.delete(k);
    }
  }
  return true;
}

/**
 * Bildirim sesi çal
 * @param {Object} opts
 * @param {string} opts.sesOverride - Belirli bir sesi zorla (test için)
 * @param {number} opts.volumeOverride - 0-1 arası
 * @param {number} opts.tekrar - Kaç kez tekrar etsin (default 1, Dükkan Modu için 3)
 * @param {string} opts.dedupId - Aynı id 5sn içinde 2x gelirse tek sesle çal
 * @param {boolean} opts.force - sessiz mod'u bypass et (test için)
 */
export function bildirimCal(opts = {}) {
  const ayar = ayarOku();
  const { sesOverride, volumeOverride, tekrar = 1, dedupId, force = false } = opts;

  if (ayar.sessiz && !force) return;
  if (!_dedupOk(dedupId)) return;

  const sesId = sesOverride || ayar.ses || 'ding';
  const volume = Math.max(0, Math.min(1, volumeOverride ?? ayar.volume ?? 0.8));

  const calBir = async () => {
    try {
      const a = _ses(sesId);
      a.volume = volume;
      a.currentTime = 0;
      await a.play();
    } catch (err) {
      // Dosya yok ya da autoplay engelli → synth fallback
      _synthesizedBeep(volume);
    }
  };

  if (tekrar <= 1) {
    calBir();
  } else {
    // Sequential play with 600ms delay
    let i = 0;
    const loop = () => {
      if (i >= tekrar) return;
      i++;
      calBir();
      setTimeout(loop, 600);
    };
    loop();
  }
}

export function titret(pattern = [200, 80, 200]) {
  try {
    const ayar = ayarOku();
    if (!ayar.titresim) return;
    navigator.vibrate?.(pattern);
  } catch {}
}

// ═══ AudioContext autoplay unlock ═══
let _unlocked = false;
export function sesKilidiAc() {
  if (_unlocked) return true;
  const ctx = _getCtx();
  if (!ctx) return false;
  try {
    ctx.resume();
    // Sessiz ping ile warm-up
    const o = ctx.createOscillator(), g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.01);
    // Her ses dosyasını preload için 0 volume ile load et
    SES_LISTESI.forEach(s => {
      try {
        const a = _ses(s.id);
        a.load();
      } catch {}
    });
    _unlocked = true;
    return true;
  } catch {
    return false;
  }
}

export function sesKilidiAcik() {
  return _unlocked || (_getCtx()?.state === 'running');
}

// İlk kullanıcı etkileşiminde otomatik unlock (pasif listener)
if (typeof document !== 'undefined') {
  const unlockOnGesture = () => {
    if (_unlocked) return;
    sesKilidiAc();
  };
  ['click', 'touchstart', 'keydown'].forEach(ev =>
    document.addEventListener(ev, unlockOnGesture, { passive: true })
  );
}
