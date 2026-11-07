// Generates the opening-video clips with Gemini Omni Flash (successor of Veo; Veo 3.1 preview shut down 2026-10-22).
// Usage: node tools/intro-video.mjs [clipId ...]   → intro/clips/<id>.mp4  (skips clips that already exist)
// The key is read from the speech-generator skill's gemini.env and never printed.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';

const KEY = readFileSync(`${homedir()}/.claude/skills/speech-generator/scripts/gemini.env`, 'utf8').match(/^GEMINI_API_KEY=(.+)$/m)[1].trim();
const API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-omni-1.2-flash';
const STYLE = 'Cinematic photoreal science-fiction film look, warm Mars dusk palette (rust ground, butterscotch-pink sky), teal and orange accent lights, anamorphic lens, gentle film grain. No dialogue, no speech, no narration, no on-screen text, no subtitles, no logos, no watermarks. Any people wear white work suits with helmets and dark opaque visors; faces are never visible.';
const img = p => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(p).toString('base64') });

export const CLIPS = [
  { id: '1_base', seconds: 12, refs: ['.superpowers/ref/exterior.jpg'],
    text: 'The reference image shows the landscape and the research base. Single continuous aerial shot slowly gliding over a rusty Martian plain at dusk toward a small research base of white domes with orange rings, linked by white tubes, a thin mast with a warm beacon and rows of solar panels. The small sun sinks behind flat-topped mesas with a pale blue halo. Peaceful but lonely. Sound: thin cold wind, a distant low hum of machinery.' },
  { id: '2_storm', seconds: 12, refs: ['.superpowers/ref/exterior.jpg'],
    text: '[0-6s] Wide static shot from beside the domes of the base in the reference image: on the horizon a colossal wall of red-brown dust rises and rolls toward the base, swallowing the mesas and the sun. [6-12s] The storm front reaches the base: dust streams across the domes, the beacon flickers, the dome lights dim and go out one by one. Sound: rising roar of wind, deep rumble, metal creaking.' },
  { id: '3_generator', seconds: 12, refs: [],
    text: 'Interior of a dim habitat engineering bay. A tall glass cylindrical bioreactor glowing teal (the oxygen generator) stands in the centre. Sparks burst from its control panel, the teal glow sputters and dies, bubbles inside stop. Red emergency lights begin to pulse. Two crew members in white suits and dark visors rush in and stop, staring at it. Handheld camera, single continuous shot. Sound: electrical sparks, a failing hum winding down, alarm klaxon, muffled footsteps.' },
  { id: '4_command', seconds: 12, refs: [],
    text: 'A dark command room lit by blue holograms. A translucent blue hologram of a base commander in a space suit with a dark visor stands above a holographic 3D model of the dome base. Next to it a holographic ring gauge drains from full teal to a thin red sliver (no numbers, no text). Crew in white suits and dark visors watch silently. Slow push-in, single continuous shot. Sound: low tense synth drone, soft warning beeps.' },
  { id: '5_lab', seconds: 12, refs: ['.superpowers/ref/lab.jpg', '.superpowers/ref/robi.jpg'],
    text: 'The first reference image shows the biology lab: a panoramic window onto the red desert at dusk, a white lab bench with an Erlenmeyer flask in a water bath, an upside-down graduated cylinder in a water trough, amber reagent bottles. The second reference image shows the lab robot: a small friendly white hovering robot with a dark face screen showing glowing teal eyes and orange accents. Slow dolly-in toward the bench while the robot floats up beside it, turns toward the camera and its eyes light up happily, as if inviting the viewer in. Sound: quiet lab hum, a soft electronic chime, a hopeful orchestral swell.' },
];

async function generate(clip) {
  const out = `intro/clips/${clip.id}.mp4`;
  if (existsSync(out)) { console.log('skip', out); return; }
  const body = {
    model: MODEL,
    input: [...clip.refs.map(img), { type: 'text', text: `${clip.text}\n\n${STYLE}` }],
    response_format: { type: 'video', aspect_ratio: '16:9', resolution: '1080p', duration: `${clip.seconds}s`, delivery: 'uri' },
  };
  const t0 = Date.now();
  const r = await fetch(`${API}/interactions`, { method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${clip.id}: ${r.status} ${JSON.stringify(j).slice(0, 400)}`);
  const vids = (j.steps || []).flatMap(s => s.content || []).filter(c => c.type === 'video');
  const v = vids[0];
  if (!v) throw new Error(`${clip.id}: no video in response ${JSON.stringify(j).slice(0, 400)}`);
  mkdirSync('intro/clips', { recursive: true });
  if (v.data) writeFileSync(out, Buffer.from(v.data, 'base64'));
  else {
    const fileName = v.uri.match(/files\/[^/:?]+/)[0];
    for (let i = 0; i < 120; i++) {
      const f = await fetch(`${API}/${fileName}`, { headers: { 'x-goog-api-key': KEY } }).then(x => x.json());
      if (f.state === 'ACTIVE') break;
      if (f.state === 'FAILED') throw new Error(`${clip.id}: file failed`);
      await new Promise(res => setTimeout(res, 5000));
    }
    const d = await fetch(`${API}/${fileName}:download?alt=media`, { headers: { 'x-goog-api-key': KEY } });
    if (!d.ok) throw new Error(`${clip.id}: download ${d.status}`);
    writeFileSync(out, Buffer.from(await d.arrayBuffer()));
  }
  console.log(`done ${out} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const want = process.argv.slice(2);
for (const c of CLIPS) {
  if (want.length && !want.includes(c.id)) continue;
  try { await generate(c); } catch (e) { console.error('FAIL', e.message); }
}
