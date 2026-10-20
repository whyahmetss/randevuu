// HTML zaman çizelgesini PNG karelerine çevirir (Edge ile, internetsiz).
//   node ortak/katman.mjs <sayfa.html> <cikti_klasoru> [--saniyeler 0.5,3,7] [--seffaf] [--bas 0 --bit 16.5]
// --saniyeler verilmezse 30 fps ile tüm süre: kare_0001.png … (Blender kare numarasıyla aynı: 1 tabanlı)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [sayfa, cikti, ...arg] = process.argv.slice(2);
const al = (ad, vars) => { const i = arg.indexOf(ad); return i < 0 ? vars : arg[i + 1]; };
const seffaf = arg.includes('--seffaf');
const FPS = 30;
mkdirSync(cikti, { recursive: true });

const tarayici = await chromium.launch({ channel: 'msedge' });
const sekme = await tarayici.newPage({ viewport: { width: 1080, height: 1920 } });
await sekme.goto(pathToFileURL(resolve(sayfa)).href);
await sekme.evaluate(() => document.fonts.ready);
const { w, h, toplam } = await sekme.evaluate(() => ({
  w: document.body.offsetWidth, h: document.body.offsetHeight, toplam: +document.body.dataset.total || 0 }));
await sekme.setViewportSize({ width: w, height: h });
// Görseller yüklensin
await sekme.evaluate(() => Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))));

const kareler = [];
const sn = al('--saniyeler', null);
const kl = al('--kareler', null);  // Blender kare numaraları (1 tabanlı)
if (sn) sn.split(',').forEach(s => kareler.push([+s, `t_${(+s).toFixed(2)}.png`]));
else if (kl) kl.split(',').forEach(k => kareler.push([(+k - 1) / FPS, `kare_${String(+k).padStart(4, '0')}.png`]));
else {
  const bas = +al('--bas', 0), bit = +al('--bit', toplam);
  for (let f = Math.round(bas * FPS); f < Math.round(bit * FPS); f++) kareler.push([f / FPS, `kare_${String(f + 1).padStart(4, '0')}.png`]);
}
for (const [t, ad] of kareler) {
  await sekme.evaluate(t => window.zaman(t), t);
  await sekme.screenshot({ path: join(cikti, ad), omitBackground: seffaf, type: 'png' });
}
await tarayici.close();
console.log(`✓ ${kareler.length} kare → ${cikti}`);
