// Hizmet notu (2026-10-29): esnafın hizmete yazdığı açıklama ("🎁 Yüz bakımı hediye") müşteriye hiç gösterilmiyordu.
// Bot listelerinde hizmetin altında tek satır, yapay zekâya hizmet bilgisiyle birlikte gider.
const hizmetNotu = (h) => String(h?.aciklama || '').replace(/\s+/g, ' ').trim().slice(0, 100);
// WhatsApp/Telegram listesi: hizmet satırının altına italik not
const notSatiri = (h) => { const n = hizmetNotu(h).replace(/[_*]/g, ''); return n ? `\n   _${n}_` : ''; };
// Yapay zekâ istemi: "Saç Kesimi (30 dk, 500 TL; not: ...)"
const yzHizmet = (h) => `${h.isim} (${h.sure_dk} dk, ${h.fiyat} TL${hizmetNotu(h) ? `; not: ${hizmetNotu(h)}` : ''})`;

module.exports = { hizmetNotu, notSatiri, yzHizmet };
