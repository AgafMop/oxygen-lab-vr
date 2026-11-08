import { test } from 'node:test';
import assert from 'node:assert/strict';

// minimal browser stubs: an Audio element that "plays" until ended/paused
class FakeAudio {
  static all = [];
  constructor(src) { this.src = src; this.paused = true; FakeAudio.all.push(this); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  end() { this.onended?.(); }
}
globalThis.Audio = FakeAudio;
const ui = { subtitles: { show() {}, hide() {} } };
const { createAudio } = await import('../src/core/audio.js');

const settle = p => Promise.race([p.then(() => 'done'), new Promise(r => setTimeout(() => r('pending'), 50))]);

test('review2 #1: a line interrupted by another line resolves instead of hanging', async () => {
  const audio = createAudio(ui, { fast: false });
  const first = audio.say('c2_goggles');
  await new Promise(r => setTimeout(r, 5));
  const second = audio.say('c2_goggles_on');
  assert.equal(await settle(first), 'done');
  FakeAudio.all.at(-1).end();
  assert.equal(await settle(second), 'done');
});

test('review2 #9: a broken voice file falls back to subtitle timing, not an instant skip', async () => {
  const audio = createAudio(ui, { fast: false });
  const p = audio.say('c1_hello');
  await new Promise(r => setTimeout(r, 5));
  FakeAudio.all.at(-1).onerror?.();
  assert.equal(await settle(p), 'pending');   // still waiting ~2 s of subtitle time
});

test('review2 #2: flicker dips stay under 3 per second at any frame rate and never go dark', async () => {
  const { createFlicker } = await import('../src/fx/flicker.js');
  for (const fps of [72, 90, 120]) {
    const f = createFlicker();
    let dips = 0, was = false, min = 1;
    for (let i = 0; i < fps * 10; i++) {
      const v = f(i / fps, 1); min = Math.min(min, v);
      const dim = v < 0.97;
      if (dim && !was) dips++;
      was = dim;
    }
    assert.ok(dips <= 20, `${fps} fps: ${dips} dips in 10 s`);
    assert.ok(min >= 0.64, `${fps} fps: min ${min}`);
  }
});
