// Opening video timeline: five AI-generated shots joined with 0.5 s crossfades (tools/build-intro.mjs),
// with the recorded voice lines mixed in at these times. The game shows the same lines as subtitles.
// Shots: 0 base at dusk · 9.5 storm wall · 19 generator dies · 28.5 hologram command (cut as Dr. Azoulay finishes) · 35.2 lab + Robi.
export const INTRO_VIDEO = {
  src: { mp4: 'assets/intro.mp4', webm: 'assets/intro.webm' },
  duration: 46.8,
  cues: [
    { id: 'intro_1', at: 2.0, dur: 5.2 },
    { id: 'intro_2', at: 13.5, dur: 3.3 },
    { id: 'intro_3', at: 21.3, dur: 4.7 },
    { id: 'intro_4', at: 26.0, dur: 3.7 },
    { id: 'c1_azoulay', at: 30.0, dur: 4.9 },
    { id: 'c1_commander2', at: 35.5, dur: 3.8 },
    { id: 'intro_5', at: 39.6, dur: 5.6 },
  ],
};

export function cueAt(t) {
  return INTRO_VIDEO.cues.find(c => t >= c.at && t < c.at + c.dur) ?? null;
}
