// Ses varlıklarını ElevenLabs'tan üretir (önbellekli: var olan dosya yeniden üretilmez, kota harcanmaz).
//   node ses/uret.mjs berber          → ses/efekt/*.mp3 (gerekenler), <video>/ses/vo_N.mp3, ses/muzik/fon.mp3
// Seçili ses ve ayarlar: ses/ayar.json. Efekt tarifleri: ses/efektler.json. Kurgu: <video>/ses.json
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { istek } from './eleven.mjs';

const kok = join(dirname(fileURLToPath(import.meta.url)), '..');
const video = process.argv[2];
const ayar = JSON.parse(readFileSync(join(kok, 'ses', 'ayar.json'), 'utf8'));
const tarifler = JSON.parse(readFileSync(join(kok, 'ses', 'efektler.json'), 'utf8'));
const kurgu = JSON.parse(readFileSync(join(kok, video, 'ses.json'), 'utf8'));
mkdirSync(join(kok, 'ses', 'efekt'), { recursive: true });
mkdirSync(join(kok, 'ses', 'muzik'), { recursive: true });
mkdirSync(join(kok, video, 'ses'), { recursive: true });

// 1 · Efektler (yalnız bu videonun kullandıkları)
for (const { ad } of kurgu.efektler) {
  const yol = join(kok, 'ses', 'efekt', `${ad}.mp3`);
  if (existsSync(yol)) continue;
  const t = tarifler[ad];
  if (!t) throw new Error(`efektler.json'da tarif yok: ${ad}`);
  const mp3 = await istek('/v1/sound-generation?output_format=mp3_44100_128', { method: 'POST', ikili: true,
    govde: { text: t.metin, duration_seconds: t.sure, prompt_influence: 0.55 } });
  writeFileSync(yol, mp3);
  console.log('✓ efekt', ad);
}

// 2 · Seslendirme (satır satır; önceki/sonraki cümle bağlam olarak verilir, tonlama akar)
const satirlar = kurgu.seslendirme;
for (let i = 0; i < satirlar.length; i++) {
  const s = satirlar[i];
  const imza = createHash('sha1').update(JSON.stringify([ayar, s.metin])).digest('hex').slice(0, 8);
  const yol = join(kok, video, 'ses', `vo_${i}_${imza}.mp3`);
  s.dosya = yol;
  if (existsSync(yol)) continue;
  try {
    const mp3 = await istek(`/v1/text-to-speech/${ayar.ses_id}?output_format=mp3_44100_128`, { method: 'POST', ikili: true,
      govde: { text: s.metin, model_id: ayar.model, voice_settings: ayar.ayar,
        previous_text: satirlar[i - 1]?.metin, next_text: satirlar[i + 1]?.metin } });
    writeFileSync(yol, mp3);
    console.log('✓ seslendirme', i, s.metin);
  } catch (e) { console.log('seslendirme üretilemedi:', e.message.slice(0, 200)); break; }
}
writeFileSync(join(kok, video, 'ses', 'liste.json'), JSON.stringify(satirlar.map(s => s.dosya), null, 1));

// 3 · Fon müziği (tek parça, tüm videolar için; ElevenLabs Music yoksa müziksiz devam)
const muzik = join(kok, 'ses', 'muzik', 'fon.mp3');
if (kurgu.muzik && !existsSync(muzik)) {
  try {
    const mp3 = await istek('/v1/music?output_format=mp3_44100_128', { method: 'POST', ikili: true,
      govde: { prompt: 'warm minimal lo-fi instrumental for a short social media ad, soft electric piano and gentle '
        + 'brushed drums, relaxed and optimistic, 92 bpm, no vocals, subtle, steady, loopable', music_length_ms: 18000,
        model_id: 'music_v1' } });
    writeFileSync(muzik, mp3);
    console.log('✓ müzik');
  } catch (e) { console.log('müzik üretilemedi (müziksiz devam):', e.message.slice(0, 160)); }
}
const kalan = await istek('/v1/user/subscription');
console.log(`kota: ${kalan.character_count} / ${kalan.character_limit}`);
