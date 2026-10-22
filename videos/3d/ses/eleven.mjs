// ElevenLabs yardımcıları. Anahtar repo dışında: %USERPROFILE%\.elevenlabs_anahtar (yalnız anahtar, tek satır).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export function anahtar() {
  const ham = readFileSync(join(homedir(), '.elevenlabs_anahtar'));
  // Not Defteri UTF-8/UTF-16 BOM'u ve boşluklar temizlenir
  let s = ham[0] === 0xff && ham[1] === 0xfe ? ham.slice(2).toString('utf16le') : ham.toString('utf8');
  return s.replace(/^﻿/, '').trim();
}

const API = 'https://api.elevenlabs.io';
export async function istek(yol, { method = 'GET', govde, ikili = false } = {}) {
  const r = await fetch(API + yol, {
    method, headers: { 'xi-api-key': anahtar(), ...(govde ? { 'Content-Type': 'application/json' } : {}) },
    body: govde ? JSON.stringify(govde) : undefined });
  if (!r.ok) throw new Error(`${r.status} ${yol}: ${(await r.text()).slice(0, 300)}`);
  return ikili ? Buffer.from(await r.arrayBuffer()) : r.json();
}

// Komut satırı: node ses/eleven.mjs durum
if (process.argv[2] === 'durum') {
  const a = await istek('/v1/user/subscription');
  console.log('plan:', a.tier, '| karakter:', a.character_count, '/', a.character_limit,
    '| ticari:', a.can_use_instant_voice_cloning !== undefined ? '?' : '?', '| yenilenme:', new Date(a.next_character_count_reset_unix * 1000).toISOString().slice(0, 10));
  const v = await istek('/v1/voices');
  console.log('hesaptaki sesler:', v.voices.length);
  for (const s of v.voices.slice(0, 40)) console.log(' -', s.voice_id, '|', s.name, '|', s.labels?.accent || '', s.labels?.gender || '', s.labels?.age || '', '|', s.category);
}
