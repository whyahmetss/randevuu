// 3D kareler + alt yazı katmanı → MP4 (1080×1920, 30 fps, H.264, sessiz ses izi).
//   node ortak/birlestir.mjs berber        → out/berber.mp4
// Girdi: <video>/kareler/kare_####.png (Blender), <video>/katmanlar/altyazi/kare_####.png (şeffaf)
// FFMPEG ortam değişkeni verilmezse PATH'teki ffmpeg, o da yoksa winget kurulumu aranır.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const video = process.argv[2];
if (!video) { console.error('kullanım: node ortak/birlestir.mjs <video>'); process.exit(1); }

function ffmpegBul() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg';
  const paket = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  for (const d of existsSync(paket) ? readdirSync(paket) : []) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    for (const s of readdirSync(join(paket, d))) {
      const f = join(paket, d, s, 'bin', 'ffmpeg.exe');
      if (existsSync(f)) return f;
    }
  }
  throw new Error('ffmpeg bulunamadı');
}

const kareler = join(kok, video, 'kareler', 'kare_%04d.png');
const altyazi = join(kok, video, 'katmanlar', 'altyazi', 'kare_%04d.png');
mkdirSync(join(kok, 'out'), { recursive: true });
const cikti = join(kok, 'out', `${video}.mp4`);
const arg = ['-y', '-loglevel', 'error',
  '-framerate', '30', '-i', kareler,
  '-framerate', '30', '-i', altyazi,
  '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex', '[0:v][1:v]overlay=0:0:format=auto,format=yuv420p[v]',
  '-map', '[v]', '-map', '2:a', '-shortest',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.1',
  '-r', '30', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', cikti];
const r = spawnSync(ffmpegBul(), arg, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log('✓', cikti);
