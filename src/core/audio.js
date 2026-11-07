// Synthesized SFX (WebAudio) + say(lineId): mp3 when recorded, otherwise subtitle-only timing.
import { LINES, VOICE_AVAILABLE } from '../game/script.js';

export function createAudio(ui, { fast = false } = {}) {
  let AC = null;
  const ac = () => {
    if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (AC.state === 'suspended') AC.resume().catch(() => {});
    return AC;
  };
  const out = () => { const a = ac(); return a && a.destination; };

  function tone(f, d = 0.12, type = 'sine', vol = 0.12, when = 0, f2) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + when;
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(out()); o.start(t); o.stop(t + d + 0.05);
  }
  function noise(d = 1, { vol = 0.1, type = 'bandpass', f = 1200, f2, q = 1, when = 0, attack = 0.01 } = {}) {
    const a = ac(); if (!a) return;
    const b = a.createBuffer(1, Math.max(1, a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime + when;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.buffer = b; s.connect(fl).connect(g).connect(out()); s.start(t);
  }

  let bubbleTimer = null, wind = null;
  function windLoop(level) {
    const a = ac(); if (!a) return;
    if (!wind) {
      const b = a.createBuffer(1, a.sampleRate * 2, a.sampleRate), ch = b.getChannelData(0);
      let last = 0; for (let i = 0; i < ch.length; i++) { last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; ch[i] = last * 6; }
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), lfo = a.createOscillator(), lg = a.createGain();
      s.buffer = b; s.loop = true; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
      lfo.frequency.value = 0.13; lg.gain.value = 260; lfo.connect(lg).connect(f.frequency);
      s.connect(f).connect(g).connect(out()); s.start(); lfo.start();
      wind = { g, f };
    }
    wind.g.gain.linearRampToValueAtTime(level * 0.5, a.currentTime + 1.2);
    wind.f.frequency.linearRampToValueAtTime(400 + level * 1400, a.currentTime + 1.2);
  }
  const SFX = {
    click: () => tone(880, 0.06, 'triangle', 0.07),
    ok: () => { tone(660, 0.12); tone(990, 0.18, 'sine', 0.1, 0.1); },
    no: () => tone(220, 0.2, 'square', 0.04),
    pour: () => noise(1.2, { vol: 0.06, f: 900, f2: 500, q: 2 }),
    pop: () => { tone(500, 0.08, 'sine', 0.15, 0, 120); noise(0.1, { vol: 0.08, f: 2500 }); },
    blast: () => { tone(90, 0.6, 'sine', 0.35, 0, 40); noise(0.8, { vol: 0.3, type: 'lowpass', f: 3000, f2: 200 }); },
    foam: () => noise(2.5, { vol: 0.12, f: 600, f2: 2400, q: 0.7, attack: 0.5 }),
    sizzle: () => noise(2.5, { vol: 0.08, type: 'highpass', f: 4000, attack: 0.2 }),
    boil: () => { noise(2.5, { vol: 0.1, type: 'lowpass', f: 400, attack: 0.4 }); for (let i = 0; i < 18; i++) tone(200 + Math.random() * 300, 0.05, 'sine', 0.05, Math.random() * 2.3); },
    alarm: () => { for (let i = 0; i < 3; i++) { tone(740, 0.25, 'sawtooth', 0.05, i * 0.6); tone(520, 0.25, 'sawtooth', 0.05, i * 0.6 + 0.3); } },
    wind: level => windLoop(level),
    rumble: () => { tone(45, 2.5, 'sine', 0.35, 0, 30); noise(2.5, { vol: 0.25, type: 'lowpass', f: 250, attack: 0.6 }); },
    sparks: () => { for (let i = 0; i < 10; i++) noise(0.05, { vol: 0.12, type: 'highpass', f: 3000, when: Math.random() * 0.8 }); },
    whoosh: () => noise(0.7, { vol: 0.1, f: 300, f2: 2500, q: 0.8, attack: 0.2 }),
    win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'sine', 0.1, i * 0.15)),
    bubbles(on) {
      clearInterval(bubbleTimer); bubbleTimer = null;
      if (on) bubbleTimer = setInterval(() => tone(400 + Math.random() * 700, 0.04, 'sine', 0.035, 0, 900 + Math.random() * 600), 90);
    },
  };

  const wait = ms => new Promise(r => setTimeout(r, fast ? Math.min(ms, 30) : ms));
  let current = null;

  return {
    sfx(name, arg) { try { SFX[name]?.(arg); } catch { /* audio blocked */ } },
    unlock: ac,
    /** Speak a line: subtitle always; mp3 if recorded. Resolves when done. */
    async say(id) {
      const l = LINES[id];
      if (!l) return;
      const ms = Math.max(1600, l.text.split(/\s+/).length * 380);
      ui.subtitles.show(l.speaker, l.text, ms + 600);
      if (VOICE_AVAILABLE.has(id) && !fast) {
        current?.pause();
        const el = new Audio(`assets/voice/${id}.mp3`); current = el;
        await new Promise(res => { el.onended = res; el.onerror = res; el.play().catch(res); });
      } else await wait(ms);
    },
    wait,
  };
}
