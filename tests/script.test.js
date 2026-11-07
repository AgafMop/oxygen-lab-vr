import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINES, VOICE_AVAILABLE } from '../src/game/script.js';

const FAILS = ['splash', 'sealedBlast', 'elephantToothpaste', 'acidMelt', 'boil', 'cylinderNotFilled'];
const words = t => t.split(/\s+/).filter(Boolean);

test('every line is at most 15 words', () => {
  for (const [id, l] of Object.entries(LINES)) assert.ok(words(l.text).length <= 15, `${id}: ${words(l.text).length} words`);
});

test('every line has a known speaker', () => {
  for (const [id, l] of Object.entries(LINES)) assert.ok(['robi', 'commander', 'azoulay'].includes(l.speaker), id);
});

test('every failure has an explaining line', () => {
  for (const f of FAILS) assert.ok(LINES['fail_' + f], `missing fail_${f}`);
});

test('chapters 1-4 and the end have lines', () => {
  for (const p of ['c1_', 'c2_', 'c3_', 'c4_', 'end_']) assert.ok(Object.keys(LINES).some(k => k.startsWith(p)), p);
});

test('no line says the enzyme dies', () => {
  for (const [id, l] of Object.entries(LINES)) {
    for (const w of words(l.text.replace(/[.,!?:״"׳'()-]/g, ' '))) assert.ok(!['מת', 'מתים', 'מתה', 'מתו'].includes(w), `${id}: "${w}"`);
  }
});

test('voice manifest only names existing lines', () => {
  for (const id of VOICE_AVAILABLE) assert.ok(LINES[id], id);
});
