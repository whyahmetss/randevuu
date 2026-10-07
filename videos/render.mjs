// Kullanım: node videos/render.mjs [dosya-adı-parçası]
// src/*.html dosyalarını 1080x1920 30fps MP4'e çevirir → out/
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const filter = process.argv[2] || '';
mkdirSync(join(root, 'out'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });

for (const f of readdirSync(join(root, 'src')).filter(f => f.endsWith('.html') && f.includes(filter)).sort()) {
  await page.goto(pathToFileURL(join(root, 'src', f)).href);
  await page.evaluate(() => document.fonts.ready);
  const total = await page.evaluate(() => +document.body.dataset.total);
  const out = join(root, 'out', f.replace('.html', '.mp4'));
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', out],
    { stdio: ['pipe', 'inherit', 'inherit'] });
  for (let i = 0; i < total * FPS; i++) {
    await page.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), (i / FPS) * 1000);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('✓', out);
}
await browser.close();
