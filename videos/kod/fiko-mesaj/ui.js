// Durum → HTML. A: esnafın WhatsApp'ı (kilit ekranı → Mehmet sohbeti). B: SıraGO paneli olan telefon (kilit + push → Bugün).
// Metinler gerçek: sohbetAsistani.js (onay), utils/botMesajlar.js (randevuOnaylandi), services/hatirlatma.js (24 sa, teyit,
// 15 dk, "Harika, sizi bekliyoruz!"), services/randevu.js:528 (push), admin-panel BugunMobil.jsx + App.jsx (panel).

const kalin = s => s.replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
const durum = (saat, renk) => `<div class="durum" style="${renk ? `color:${renk}` : ''}"><span>${saat}</span><span class="sag">
  <span class="sinyal"><i style="height:4px"></i><i style="height:6px"></i><i style="height:9px"></i><i style="height:12px"></i></span>
  <svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.5 1 4.3a10 10 0 0 1 14 0Z" fill="currentColor"/></svg><span class="pil"></span></span></div>`;
// genel sohbet simgesi (WhatsApp logosu kullanılmaz)
const SOHBET = `<svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 3C6.9 3 3 6.6 3 11c0 1.9.7 3.6 1.9 5L4 21l4.6-1.6c1 .4 2.2.6 3.4.6 5.1 0 9-3.6 9-8s-3.9-9-9-9Z" fill="#fff"/></svg>`;

export const MESAJLAR = [
  { id: 'm1', tip: 'gelen', metin: "Abi cumartesi 5'e saç sakal için yer var mı?", s: '21:40' },
  { id: 'm2', tip: 'giden', metin: '🗓️ Cumartesi (31 Ekim) · 🕐 17:00\n✂️ Saç + sakal\n\nRandevunuzu oluşturayım mı? ("evet" yazmanız yeterli)', s: '21:40' },
  { id: 'm3', tip: 'gelen', metin: 'Evet', s: '21:41' },
  { id: 'm4', tip: 'giden', metin: '✅ *Randevunuz Oluşturuldu!*\n\n🏥 Kuzey Berber\n✂️ Saç + sakal\n🗓️ 31 Ekim Cumartesi\n🕐 17:00\n\n⏰ Randevunuzdan 1 saat önce hatırlatma alacaksınız.\n\nGörüşmek üzere! 😊', s: '21:41' },
  { id: 'gun2', tip: 'gun', metin: 'Cuma' },
  { id: 'm5', tip: 'giden', metin: "🗓️ *Yarınki Randevunuz*\n\nMerhaba Mehmet! Yarın saat 17:00'de randevunuz var.\n\n🏥 Kuzey Berber\n✂️ Saç + sakal\n🗓️ Yarın (Cumartesi) saat 17:00\n\nGörüşmek üzere! 😊", s: '17:00' },
  { id: 'gun3', tip: 'gun', metin: 'Bugün' },
  { id: 'm6', tip: 'giden', metin: '⏰ *Randevu Teyidi*\n\nMerhaba Mehmet! Randevunuza *1 saat* kaldı.\n\n🏥 Kuzey Berber\n✂️ Saç + sakal\n🕐 Saat: 17:00\n\nGelebilecek misiniz?\n\n*1.* ✅ Geliyorum\n*2.* ❌ İptal Et', s: '16:00' },
  { id: 'm7', tip: 'gelen', metin: '1', s: '16:02' },
  { id: 'm8', tip: 'giden', metin: '✅ *Harika, sizi bekliyoruz!*\n\n🏥 Kuzey Berber\n✂️ Saç + sakal\n🕐 Saat: 17:00\n\nGörüşmek üzere! 😊', s: '16:02' },
  { id: 'm9', tip: 'giden', metin: '⏰ *Randevunuza 15 dakika kaldı!*\n\nMerhaba Mehmet!\n\n🏥 Kuzey Berber\n✂️ Saç + sakal\n🕐 Saat: 17:00\n\nYola çıktınız mı? 🚗', s: '16:45' },
];

// A telefonu. S: { kilit:{op, saat, tarih, ban:{y, op}}, wa:{op, saat, gor:{id:{op, sc}}, kay, giris:{metin, imlec}} }
export function telA(S) {
  let h = `<div class="tel" data-a="telA" style="left:0;top:0"><div class="ekr"><div class="ada"></div>`;
  if (S.wa.op > 0) {
    const W = S.wa;
    h += `<div class="wa" style="opacity:${W.op}">${durum(W.saat)}
      <div class="wa-bas"><span class="geri">‹</span><span class="av">M</span><div><b>Mehmet</b><small>çevrimiçi</small></div></div>
      <div class="wa-govde"><div class="wa-liste" style="transform:translateY(${-W.kay}px)">`;
    for (const m of MESAJLAR) {
      const g = W.gor[m.id] || { op: 0, sc: 1 };
      const st = `opacity:${g.op};transform:scale(${g.sc}) translateY(${g.dy || 0}px)`;
      if (m.tip === 'gun') h += `<div class="gun" data-a="${m.id}" style="${st}">${m.metin}</div>`;
      else h += `<div class="b ${m.tip}" data-a="${m.id}" style="${st}">${kalin(m.metin)}<span class="s">${m.s}${m.tip === 'giden' ? ' <span class="tik">✓✓</span>' : ''}</span></div>`;
    }
    const G = W.giris;
    h += `</div></div><div class="wa-alt"><div class="kutu ${G.metin ? 'dolu' : ''}" data-a="inp">${G.metin ? G.metin.replace(/\n/g, '<br>') : 'Mesaj'}${G.imlec ? '<span class="imlec"></span>' : ''}</div>
      <div class="gonder" style="transform:scale(${G.bas || 1})"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M3 20.5 21 12 3 3.5 3 10l12 2-12 2z" fill="#fff"/></svg></div></div>
      <div class="ev"></div></div>`;
  }
  if (S.kilit.op > 0) {
    const K = S.kilit;
    h += `<div class="kilit" style="opacity:${K.op}">${durum('', '#f3f6f4')}<div class="tarih">${K.tarih}</div><div class="saat">${K.saat}</div>
      <div class="bld" data-a="ban" style="top:${K.ban.y}px;opacity:${K.ban.op}"><span class="uyg">${SOHBET}</span><div class="ic">
      <div class="ust"><span>WhatsApp</span><span>şimdi</span></div><b>Mehmet</b><br>Abi cumartesi 5'e saç sakal için yer var mı?</div></div>
      <div class="ev"></div></div>`;
  }
  return h + `</div></div>`;
}

// SıraGO "Bugün" listesi (BugunMobil.jsx): kanal etiketi gerçek eşleme ('bot' → WhatsApp'tan, 'online' → randevu linkinden,
// 'manuel' → sen ekledin), durum etiketi ETIKET tablosundan.
const SATIRLAR = [
  { id: 'r1', saat: '13:00', ad: 'Emre', alt: "Sakal tıraşı · WhatsApp'tan", durum: 'tamamlandi' },
  { id: 'r2', saat: '14:20', ad: 'Burak', alt: 'Saç + sakal · randevu linkinden', durum: 'tamamlandi' },
  { id: 'r3', saat: '15:40', ad: 'Can', alt: 'Saç kesim · sen ekledin', durum: 'tamamlandi' },
  { id: 'rM', saat: '17:00', ad: 'Mehmet', alt: "Saç + sakal · WhatsApp'tan", durum: 'onaylandi' },
];
const ETIKET = { onaylandi: ['Onaylı', '#1f6f4a'], tamamlandi: ['Geldi ✓', '#1f6f4a'] };
const SEKME = [
  ['Bugün', '<path d="M3 9h18M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="17" rx="3"/>'],
  ['Takvim', '<path d="M3 6h18M3 12h18M3 18h12"/>'],
  ['Müşteriler', '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6M17 11a3 3 0 1 0 0-6M22 21c0-3-2-5-4-5.5"/>'],
  ['Dükkanım', '<path d="M3 9l1.5-5h15L21 9M3 9h18v11H3zM9 20v-6h6v6"/>'],
];

// B telefonu. S: { kilit:{op, saat, tarih, push:{y, op}}, pnl:{op, saat, kay, acik(0..1), mDurum, basili} }
export function telB(S) {
  let h = `<div class="tel" data-a="telB" style="left:600px;top:0"><div class="ekr"><div class="ada"></div>`;
  if (S.pnl.op > 0) {
    const P = S.pnl;
    h += `<div class="pnl" style="opacity:${P.op}">${durum(P.saat)}
      <div class="pnl-bas"><h1>Bugün</h1><span class="zil"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1b1a17" stroke-width="2" stroke-linecap="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4"/></svg></span></div>
      <div class="pnl-govde"><div class="pnl-liste" style="transform:translateY(${-P.kay}px)">
      <div class="ozet"></div><div class="kapidan">＋ Kapıdan gelen / telefonla arayan</div>`;
    for (const r of SATIRLAR) {
      const d = r.id === 'rM' ? P.mDurum : r.durum;
      const pasif = ['iptal', 'gelmedi', 'tamamlandi'].includes(d);
      const [et, renk] = ETIKET[d];
      h += `<div class="rk ${pasif ? 'pasif' : ''}" data-a="${r.id}"><div class="sat" data-a="${r.id}sat"><div class="saat">${r.saat}</div>
        <div class="kisi"><b>${r.ad}</b><small>${r.alt}</small></div><div class="et" style="color:${renk}">${et}</div></div>
        <span class="not">📝 İşlem notu</span>`;
      if (r.id === 'rM' && P.acik > 0) h += `<div class="dugmeler" style="height:${P.acik * 112}px;margin-top:${12 * P.acik}px">
        <i class="ok" data-a="geldi" style="transform:scale(${P.basili ? .95 : 1})">Geldi ✓</i><i style="color:#b42318">Gelmedi</i>
        <i>Ara</i><i style="color:var(--dim)">İptal et</i></div>`;
      h += `</div>`;
    }
    h += `</div></div><div class="alt-sekmeler">${SEKME.map(([ad, yol], i) => `<span class="${i ? '' : 'aktif'}"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${i ? 2 : 2.4}" stroke-linecap="round" stroke-linejoin="round">${yol}</svg>${ad}</span>`).join('')}</div>
      <div class="ev"></div></div>`;
  }
  if (S.kilit.op > 0) {
    const K = S.kilit;
    h += `<div class="kilit" style="opacity:${K.op}">${durum('', '#f3f6f4')}<div class="tarih">${K.tarih}</div><div class="saat">${K.saat}</div>
      <div class="bld" data-a="push" style="top:${K.push.y}px;opacity:${K.push.op}"><span class="uyg sira"><img src="ikon.png"></span><div class="ic">
      <div class="ust"><span>SıraGO</span><span>şimdi</span></div><b>🎉 Yeni Randevu</b><br>Mehmet — Saç + sakal • 2026-10-31 17:00</div></div>
      <div class="ev"></div></div>`;
  }
  return h + `</div></div>`;
}

export const duvar = () => `<div class="duvar"></div>`;
