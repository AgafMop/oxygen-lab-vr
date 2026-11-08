import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INTRO_VIDEO, cueAt } from '../src/game/introVideo.js';
import { LINES, VOICE_AVAILABLE } from '../src/game/script.js';

test('intro video cues are voiced lines, in order, never overlapping, inside the video', () => {
  const { cues, duration } = INTRO_VIDEO;
  assert.ok(cues.length >= 5);
  let end = 0;
  for (const c of cues) {
    assert.ok(LINES[c.id] && VOICE_AVAILABLE.has(c.id), c.id);
    assert.ok(c.at >= end, `${c.id} starts at ${c.at} before the previous line ends at ${end}`);
    end = c.at + c.dur;
  }
  assert.ok(end <= duration - 1, `last line ends at ${end}, video is ${duration}`);
});

test('cueAt returns the line being spoken at a given time, or null between lines', () => {
  const [a, b] = INTRO_VIDEO.cues;
  assert.equal(cueAt(a.at + 0.1)?.id, a.id);
  assert.equal(cueAt(b.at + b.dur - 0.05)?.id, b.id);
  assert.equal(cueAt(0), null);
  assert.equal(cueAt(INTRO_VIDEO.duration), null);
});
