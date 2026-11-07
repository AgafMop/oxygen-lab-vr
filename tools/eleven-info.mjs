// Prints quota + voices for each ElevenLabs key in the speech-generator .env (keys never printed).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
const env = readFileSync(`${homedir()}/.claude/skills/speech-generator/scripts/.env`, 'utf8');
const keys = [...env.matchAll(/^ELEVENLABS_API_KEY=(.+)$/gm)].map(m => m[1].trim());
for (const [i, key] of keys.entries()) {
  const h = { 'xi-api-key': key };
  const sub = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: h }).then(r => r.json());
  console.log(`account ${i}: tier=${sub.tier} used=${sub.character_count}/${sub.character_limit} reset=${sub.next_character_count_reset_unix ? new Date(sub.next_character_count_reset_unix * 1000).toISOString().slice(0, 10) : '?'}`);
  const v = await fetch('https://api.elevenlabs.io/v1/voices', { headers: h }).then(r => r.json());
  for (const x of v.voices || []) console.log(`   ${x.voice_id} | ${x.name} | ${x.category} | ${JSON.stringify(x.labels || {})}`);
}
