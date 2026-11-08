// Builds the opening video from the five generated shots in intro/clips/ (1.mp4 … 5.mp4):
// 0.5 s crossfades, fade in/out, the shots' own sound ducked under the recorded voice lines.
// Output: assets/intro.mp4 (H.264/AAC) + assets/intro.webm (VP9/Opus — for browsers without H.264).
// Usage: node tools/build-intro.mjs
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { INTRO_VIDEO } from '../src/game/introVideo.js';

const X = 0.5;                                   // crossfade length
const SHOTS = [                                  // clip 3 was generated as an extension: its first 10 s repeat clip 2
  { file: 'intro/clips/1.mp4' }, { file: 'intro/clips/2.mp4', gain: 0.45 }, { file: 'intro/clips/3.mp4', ss: 'auto' },
  // shot 4 ends as Dr. Azoulay finishes her line (she keeps gesturing after it); the last shot holds its final frame
  { file: 'intro/clips/4.mp4', gain: 0.5, len: 7.2 }, { file: 'intro/clips/5.mp4', tail: 1.6 },
];
const LEN = 10;
const lenOf = sh => sh.len ?? LEN;
const probe = f => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
// a 20 s clip 3 was generated as an extension of clip 2 (its first 10 s repeat it): use its second half
for (const sh of SHOTS) if (sh.ss === 'auto') sh.ss = probe(sh.file) > 15 ? 10 : 0;

for (const c of INTRO_VIDEO.cues) {
  const d = probe(`assets/voice/${c.id}.mp3`);
  if (d > c.dur + 0.05) throw new Error(`${c.id} is ${d.toFixed(2)} s, timeline allows ${c.dur}`);
}

const args = ['-v', 'error', '-y'];
for (const s of SHOTS) args.push(...(s.ss ? ['-ss', String(s.ss)] : []), '-t', String(lenOf(s)), '-i', s.file);
for (const c of INTRO_VIDEO.cues) args.push('-i', `assets/voice/${c.id}.mp3`);

const f = [];
SHOTS.forEach((sh, i) => f.push(`[${i}:v]fps=24,scale=1280:720,setsar=1,format=yuv420p${sh.tail ? `,tpad=stop_mode=clone:stop_duration=${sh.tail}` : ''},settb=1/24[v${i}]`,
  `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,volume=${SHOTS[i].gain ?? 1}${sh.tail ? `,apad=pad_dur=${sh.tail}` : ''}[a${i}]`));
let v = 'v0', a = 'a0', start = 0;
for (let i = 1; i < SHOTS.length; i++) {
  start += lenOf(SHOTS[i - 1]) - X;
  const off = start;
  f.push(`[${v}][v${i}]xfade=transition=fade:duration=${X}:offset=${off}[vx${i}]`, `[${a}][a${i}]acrossfade=d=${X}[ax${i}]`);
  v = `vx${i}`; a = `ax${i}`;
}
const D = INTRO_VIDEO.duration;
const built = SHOTS.reduce((t, sh) => t + lenOf(sh) + (sh.tail ?? 0), 0) - X * (SHOTS.length - 1);
if (Math.abs(built - D) > 0.05) throw new Error(`shots make ${built.toFixed(2)} s, INTRO_VIDEO.duration is ${D}`);
f.push(`[${v}]fade=t=in:st=0:d=0.8,fade=t=out:st=${D - 1}:d=1,trim=0:${D}[vout]`);
const n = SHOTS.length;
INTRO_VIDEO.cues.forEach((c, k) => f.push(`[${n + k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(c.at * 1000)}:all=1[q${k}]`));
f.push(`${INTRO_VIDEO.cues.map((_, k) => `[q${k}]`).join('')}amix=inputs=${INTRO_VIDEO.cues.length}:normalize=0,apad,atrim=0:${D},asplit[voice][key]`);
f.push(`[${a}]volume=0.55,atrim=0:${D}[amb]`, `[amb][key]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]`);
f.push(`[duck][voice]amix=inputs=2:normalize=0,afade=t=in:st=0:d=0.8,afade=t=out:st=${D - 1}:d=1,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[aout]`);

mkdirSync('assets', { recursive: true });
execFileSync('ffmpeg', [...args, '-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '128k', 'assets/intro.mp4'], { stdio: 'inherit' });
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', 'assets/intro.mp4', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1',
  '-deadline', 'good', '-cpu-used', '4', '-c:a', 'libopus', '-b:a', '96k', 'assets/intro.webm'], { stdio: 'inherit' });
for (const o of ['assets/intro.mp4', 'assets/intro.webm']) console.log(o, probe(o).toFixed(2), 's');
