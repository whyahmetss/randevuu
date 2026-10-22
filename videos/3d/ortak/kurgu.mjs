// Son kurgu: 3D kareler (+ kesmelerde zoom vurgusu) + alt yazı + seslendirme + efekt + müzik → out/<video>_sesli.mp4
//   node ortak/kurgu.mjs berber
// Kurgu tarifi: <video>/ses.json · seslendirme dosyaları: <video>/ses/liste.json (yoksa seslendirmesiz)
// Efektler: ses/efekt/<ad>.mp3 · müzik: ses/muzik/fon.mp3 (konuşma girince kısılır). Ses: –14 LUFS (Reels/TikTok).
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const video = process.argv[2];
const SURE = 16.5;
const kurgu = JSON.parse(readFileSync(join(kok, video, 'ses.json'), 'utf8'));

function arac(ad) {
  const paket = join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
  for (const d of existsSync(paket) ? readdirSync(paket) : []) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    for (const s of readdirSync(join(paket, d))) {
      const f = join(paket, d, s, 'bin', `${ad}.exe`);
      if (existsSync(f)) return f;
    }
  }
  return ad;
}
const FFMPEG = process.env.FFMPEG || arac('ffmpeg'), FFPROBE = arac('ffprobe');
const sure = f => +spawnSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString().trim();

const girdi = [], fg = [];
const ekle = (...a) => { girdi.push(...a); return girdi.filter(x => x === '-i').length - 1; };
const v3d = ekle('-framerate', '30', '-i', join(kok, video, 'kareler', 'kare_%04d.png'));
const vay = ekle('-framerate', '30', '-i', join(kok, video, 'katmanlar', 'altyazi', 'kare_%04d.png'));

// Görüntü: kesmelerde 0.22 sn'lik zoom vurgusu (%6 içeriden başlar, yerine oturur); alt yazı sabit kalır
const P = (kurgu.vurgu || []).map(T => `0.06*gte(t,${T})*max(0,1-(t-${T})/0.22)`).join('+') || '0';
fg.push(`[${v3d}:v]scale=w='trunc(1080*(1+${P})/2)*2':h='trunc(1920*(1+${P})/2)*2':eval=frame,crop=1080:1920,setsar=1[v3]`);
fg.push(`[v3][${vay}:v]overlay=0:0:format=auto,format=yuv420p[v]`);

// Ses
const ms = t => Math.round(t * 1000);
const kanallar = [];
// Seslendirme: her satır kendi sahnesine; taşarsa en fazla %12 hızlanır
const listeYol = join(kok, video, 'ses', 'liste.json');
const voDosya = existsSync(listeYol) ? JSON.parse(readFileSync(listeYol, 'utf8')) : [];
const vo = [];
kurgu.seslendirme.forEach((s, i) => {
  const f = voDosya[i];
  if (!f || !existsSync(f)) return;
  const d = sure(f), yer = s.bitis - s.t;
  const tempo = Math.min(1.12, Math.max(1, d / yer));
  if (d / tempo > yer + 0.05) console.log(`! satır ${i} sahnesine sığmıyor: ${d.toFixed(2)} sn / ${yer.toFixed(2)} sn`);
  const k = ekle('-i', f);
  fg.push(`[${k}:a]aresample=48000,atempo=${tempo.toFixed(3)},adelay=${ms(s.t)}|${ms(s.t)},volume=0dB[vo${i}]`);
  vo.push(`[vo${i}]`);
});
if (vo.length) {
  fg.push(`${vo.join('')}amix=inputs=${vo.length}:normalize=0,asplit=2[vo][vos]`);
  kanallar.push('[vo]');
}
// Efektler: her efekt bir kez okunur, gerekli sayıda kopyalanır
for (const e of kurgu.efektler) {
  const f = join(kok, 'ses', 'efekt', `${e.ad}.mp3`);
  if (!existsSync(f)) { console.log('! efekt yok:', e.ad); continue; }
  const k = e.dongu ? ekle('-stream_loop', '-1', '-i', f) : ekle('-i', f);
  const n = e.t.length;
  const ad = `e_${e.ad}`;
  fg.push(`[${k}:a]aresample=48000${e.dongu ? `,atrim=0:${e.dongu}` : ''},volume=${e.db}dB,asplit=${n}${e.t.map((_, j) => `[${ad}${j}]`).join('')}`);
  e.t.forEach((t, j) => { fg.push(`[${ad}${j}]adelay=${ms(t)}|${ms(t)}[${ad}${j}d]`); kanallar.push(`[${ad}${j}d]`); });
}
// Müzik: alttan kısık; seslendirme varken ayrıca kısılır (sidechain)
const fon = join(kok, 'ses', 'muzik', 'fon.mp3');
if (kurgu.muzik && existsSync(fon)) {
  const k = ekle('-stream_loop', '-1', '-i', fon);
  fg.push(`[${k}:a]aresample=48000,atrim=0:${SURE},volume=${kurgu.muzik.db}dB[mz0]`);
  if (vo.length) {
    fg.push(`[mz0][vos]sidechaincompress=threshold=0.015:ratio=${Math.max(2, kurgu.muzik.kisilma_db)}:attack=30:release=350[mz]`);
  } else fg.push('[mz0]anull[mz]');
  kanallar.push('[mz]');
} else if (vo.length) fg.push('[vos]anullsink');
fg.push(`${kanallar.join('')}amix=inputs=${kanallar.length}:normalize=0,atrim=0:${SURE},`
  + `loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=${SURE - 0.6}:d=0.6,aresample=48000[a]`);

mkdirSync(join(kok, 'out'), { recursive: true });
const graf = join(kok, video, 'ses', 'kurgu.fg');
mkdirSync(dirname(graf), { recursive: true });
writeFileSync(graf, fg.join(';\n'));
const cikti = join(kok, 'out', `${video}_sesli.mp4`);
const r = spawnSync(FFMPEG, ['-y', '-loglevel', 'error', ...girdi, '-/filter_complex', graf, '-map', '[v]', '-map', '[a]',
  '-t', String(SURE), '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-level', '4.1', '-r', '30',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', cikti], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`✓ ${cikti}  (seslendirme: ${vo.length ? vo.length + ' satır' : 'yok'})`);
