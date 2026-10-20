// Kullanım: node tasarim/render.mjs [yol-parçası]
// tasarim/**/*.html → yanına aynı adla .png. Boyut <body data-w="1080" data-h="1350"> ile verilir.
import { chromium } from 'playwright';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || '';
const walk = d => readdirSync(d).flatMap(f => {
  const p = join(d, f);
  if (f === 'fontlar' || f === 'node_modules') return [];
  return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
});

const browser = await chromium.launch();
for (const f of walk(root).filter(p => relative(root, p).includes(filter)).sort()) {
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.goto(pathToFileURL(f).href);
  await page.evaluate(() => document.fonts.ready);
  const { w, h } = await page.evaluate(() => ({ w: +document.body.dataset.w || 1080, h: +document.body.dataset.h || 1350 }));
  await page.setViewportSize({ width: w, height: h });
  await page.waitForTimeout(150);
  await page.screenshot({ path: f.replace(/\.html$/, '.png') });
  await page.close();
  console.log('✓', relative(root, f.replace(/\.html$/, '.png')), `${w}x${h}`);
}
await browser.close();
