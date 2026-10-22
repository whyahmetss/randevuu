// Storyboard: 3D kareler + alt yazı katmanı → tek sayfa PNG.
//   node ortak/storyboard.mjs <video-klasoru> <3d_kare_klasoru> <cikti.png> "58:Kanca|121:Gerilim|…"
// 3D kareler kare_####.png (yarım çözünürlük olabilir), alt yazılar <video>/altyazi.html'den o anlara üretilir.
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const [klasor, kareKl, cikti, liste] = process.argv.slice(2);
const paneller = liste.split('|').map(p => { const [k, ...e] = p.split(':'); return { kare: +k, etiket: e.join(':') }; });
const FPS = 30;
const ayKl = join(kareKl, 'altyazi');
mkdirSync(ayKl, { recursive: true });
execFileSync(process.execPath, [join(import.meta.dirname, 'katman.mjs'), join(klasor, 'altyazi.html'), ayKl,
  '--kareler', paneller.map(p => p.kare).join(','), '--seffaf'], { stdio: 'inherit' });

const ADLAR = { berber: 'BERBER', disci: 'DİŞÇİ', salon: 'GÜZELLİK SALONU' };
const ad = ADLAR[basename(resolve(klasor))] || basename(resolve(klasor)).toLocaleUpperCase('tr');
const url = f => pathToFileURL(resolve(f)).href;
const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${url(join(import.meta.dirname, '../../../tasarim/fontlar/fontlar.css'))}">
<style>
 body{margin:0;background:#0a1410;color:#eef3ef;font-family:Inter,sans-serif;padding:56px 56px 64px;width:${paneller.length * 404 + 88}px}
 h1{font-family:'Bricolage Grotesque';font-size:44px;margin:0 0 6px;letter-spacing:-1px}
 p.alt{color:#93a69c;font-size:20px;margin:0 0 36px}
 .s{display:flex;gap:24px}
 .p{width:380px}
 .k{position:relative;width:380px;height:676px;border-radius:18px;overflow:hidden;background:#000}
 .k img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
 .e{margin-top:16px;font-size:19px;line-height:1.4;color:#c9d6cf}
 .e b{display:block;color:#2bd36a;font-size:16px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
</style></head><body>
<h1>${ad} · storyboard</h1><p class="alt">Blender EEVEE önizleme kareleri (düşük örnek, yarım çözünürlük) + gerçek alt yazı katmanı</p>
<div class="s">${paneller.map(p => `<div class="p"><div class="k">
  <img src="${url(join(kareKl, `kare_${String(p.kare).padStart(4, '0')}.png`))}">
  <img src="${url(join(ayKl, `kare_${String(p.kare).padStart(4, '0')}.png`))}"></div>
  <div class="e"><b>${((p.kare - 1) / FPS).toFixed(1)} sn</b>${p.etiket}</div></div>`).join('')}</div>
</body></html>`;
const tarayici = await chromium.launch({ channel: 'msedge' });
const sekme = await tarayici.newPage({ viewport: { width: paneller.length * 404 + 88, height: 900 } });
const sayfa = join(kareKl, 'storyboard.html');
writeFileSync(sayfa, html);
await sekme.goto(url(sayfa), { waitUntil: 'load' });
await sekme.evaluate(() => document.fonts.ready);
await sekme.screenshot({ path: cikti, fullPage: true });
await tarayici.close();
console.log('✓', cikti);
