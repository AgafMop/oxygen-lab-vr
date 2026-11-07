# Oxygen Lab VR — Plan 2: Story, Cutscenes, Voices (Milestones 3–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Wrap the playable core (Plan 1) in the full story: in-engine opening, characters, the Azoulay / leak / storm events, chapter 5 (save the base), chapter 6 (life corridor), a dramatic Game Over, and Hebrew voice acting.

**Architecture:** Same stack and patterns as Plan 1 (chapters = `run(ctx, scope)`, Blender headless assets, pure logic tested in Node, Playwright `?test&auto`). New chapters `intro` (before `hypothesis`), `rescue` and `life` (before `end`).

**Tech Stack:** as Plan 1, plus ElevenLabs `eleven_v3` TTS (user-approved 2026-11-08; two accounts, keys in the speech-generator skill `.env`), ElevenLabs Scribe for voice QA, ffmpeg for voice post-processing.

**Spec:** `docs/specs/2026-11-07-oxygen-lab-vr-design.md` (§5–§8). Plan 1 ledger rulings still apply.

## Global Constraints

- All Plan 1 constraints (Hebrew RTL, ≤15 words/line, seated, ray-only, budgets 72 fps / ≤150 draw calls / ≤300k tris, no "the enzyme dies").
- Opening video: **in-engine** (spec §6 fallback). Ruling: Veo 3.1 was shut down 2026-10-22; its successor Gemini Omni Flash and all Gemini image models return 429 "limit 0 on Free Tier" for this key — enabling billing is the user's call. Cost so far: $0.
- Characters: commander = blue hologram; Azoulay + crew = white suits with dark visors (no faces); Robi fully animated.
- Voices: every LINES id gets `assets/voice/<id>.mp3`; Robi gets a light robotic filter, the commander a radio band-pass; QA by transcription similarity ≥ 0.6, else regenerate once.
- Each line ≤ 15 words still; every new decision feeds `game.markDecision`.

## Review Focus

1. Skipping / replaying the intro (seen flag in storage; "דילוג" button) must never leave the player outside the lab.
2. Story events in chapter 3 (leak, storm, Azoulay) must survive a Game Over restore without duplicating trials or replaying twice inside one attempt.
3. Voice files missing (partial generation) → that line falls back to subtitle timing, no 404 console errors.
4. Corridor teleports must not let the player leave the corridor/lab bounds; returning to the lab works.
5. The new chapters keep draw calls ≤ 150 (corridor adds geometry).

---

### Task 1: Story script + crew model
- `src/game/script.js`: add `intro_*`, `azoulay_*`, `leak_*`, `storm_*`, `c5_*`, `c6_*` (one question + 3 answers + one "why" line per case), `go_*` lines. Existing script tests cover length/speaker/no-"מת".
- `blender/build_crew.py` → `assets/crew.glb`: one suited figure (`C_root, C_torso, C_helmet, C_visor, C_armL, C_armR, C_legL, C_legR`) with shoulder/hip pivots; materials suit/visor/orange. Inspect ≤ 8k tris.
- `src/lab/crew.js`: `createFigure(ctx, {hologram})` → `{root, walkTo(v3), gesture('dial'|'point'|'shrug'|'slump'), setVisible}`; hologram = additive blue, scanlines flicker.

### Task 2: Voices
- `tools/voices.mjs`: generate missing mp3s (eleven_v3; voice map commander=Adam, azoulay=Sarah, robi=Charlie), alternate accounts on quota errors, post-process with ffmpeg, QA with Scribe, write `src/game/voices.js` (`export const VOICE_AVAILABLE = new Set([...])`); `script.js` re-exports it.
- Test: manifest ⊆ LINES (existing), e2e no console errors.

### Task 3: Intro chapter (in-engine opening)
- `src/chapters/ch0_intro.js` + `src/fx/storm.js` (`createStormWall(ctx)`: curved dust wall with animated noise shader + dust particles; `approach(ms)`, `hit()`, `dispose()`).
- Exterior: rig moved to an exterior spot (pano background is already the base vista); ground disc with Mars shader, landing-pad decal, rocks; storm wall approaches from the west; sky darkens; wind; commander VO (`intro_*`).
- Cut inside: lab lights flicker, red alarms pulse (`FX_alarm_*`), generator liquid dark; Azoulay (suit) at the generator console, commander hologram; `c1_azoulay` / `c1_commander2` move here. Chapter 1 then starts at Robi.
- "דילוג" button after the first watch (storage flag `oxylab.introSeen`).
- e2e: auto intro reaches the lab, no errors; screenshots storm + alarm.

### Task 4: Chapter 3 events
- Leak: one robot trial (not the unmixed one) shows orange bubbles escaping the stopper and reads low → student decides לפסול/להשאיר (`markDecision`).
- Storm: during a later temperature the window darkens (storm wall), lights flicker to red, the bath display drops ~8° mid-trial → decide "פוסלים וחוזרים" (redo costs a trial) / "ממשיכים ורושמים"; correct = redo → badge `stormCalm`.
- Azoulay cutscene after the second temperature: she walks to the generator console, sets 60°, the generator glow collapses, base alarm, commander hologram, she resets it (`azoulay_*`).
- Events fire once per chapter attempt; restore re-runs them cleanly. e2e: auto run has exactly one leak-disqualified and one storm-redone trial; badges.

### Task 5: Chapter 5 — save the base
- `src/chapters/ch5_rescue.js` at ST_generator: dial chips 20–60; correct = within ±5 of the student's peak; wrong → generator weak + Robi hint, retry (decision cost). Success: generator glow + bubbles ramp, alarms off, lights warm, Azoulay apology, commander thanks.

### Task 6: Chapter 6 — life corridor
- `blender/build_corridor.py` → `assets/corridor.glb` behind the south door (door slides open): 4 alcoves (clinic bed, kitchen with dough bowl, laundry machine, first-aid wall) + stations `ST_case1..4`, discs, anchors `A_case1..4`.
- `src/chapters/ch6_life.js`: for each case a crew figure + question line + 3 picture cards; first-try correct count → badge `lifeScience` (≥3). Return to the lab for the end screen.

### Task 7: Game Over cutscene + polish
- Game Over: lights out → red, commander hologram line, slow fade, then restore.
- Wall screens (`SCR_door`, `SCR_gen`) show live canvases (base O₂ / generator status); hazard sign text; bench top albedo down; Robi moves with the player between stations.

### Task 8: Full run, review, deploy
- Full auto e2e (intro → end), budgets per chapter, screenshots; whole-branch review; push (user approved deploys tonight).
