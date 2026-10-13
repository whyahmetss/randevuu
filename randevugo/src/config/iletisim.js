// Destek/satış WhatsApp numarası tek yerden (2026-10-13: eski sanal numara ban yedi).
// Render → DESTEK_WP=905xxxxxxxxx. Boşsa panel ve sayfalardaki WhatsApp butonları gizlenir.
const DESTEK_WP = String(process.env.DESTEK_WP || '').replace(/\D/g, '') || null;
module.exports = { DESTEK_WP };
