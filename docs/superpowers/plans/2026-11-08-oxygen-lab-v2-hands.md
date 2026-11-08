# Oxygen Lab v2 — Hands & Motion (Plan 4): grab/pour/stir, smooth motion, visual bugs

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, chosen by the user). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Students physically pick up, pour, spoon, stir and plug in VR (mouse-drag on desktop); nothing in the lab jumps or snaps; Azoulay's hand reaches the generator console instead of the wall; the hospital case shows a patient.

**Architecture:** Pure hand-action math (pour rate, stir progress, snap) lives in `src/game/handActions.js` (node-tested). `src/lab/handling.js` turns props into grabbables held by a *holder* (XR grip, a desktop drag holder on a plane above the bench, or a test "virtual hand") and emits the same procedure actions ch2 already handles. A test-mode motion audit flags any visible object that moves > 5 cm in one frame outside a fade.

**Tech Stack:** three.js 0.170, node:test, Playwright (SwiftShader).

**Spec:** `docs/specs/2026-11-08-oxygen-lab-v2-design.md` §5, §6, §6.1.

## Global Constraints
- Grab: XR grip button; trigger stays for cards/buttons. Haptic tick on grab and snap, soft buzz while pouring.
- Pour starts at ≥ 60° tilt with the spout within 6 cm (horizontal) of the flask mouth; the flask fills while pouring and **stops by itself at the mark**; pouring elsewhere spills on the bench, no penalty.
- Spoon: dip into the jar (≤ 5 cm) → loaded heap; over the mouth (≤ 5 cm) → drops in. Each drop = one `yeast` action (3 → toothpaste, as today).
- Stir: rod tip inside the flask; ~3 full turns of angular travel fills the progress ring → `stir`.
- Stopper: within 4 cm of the mouth → snaps in → `stopper` (kind by prop).
- Cylinder: dipped into the trough → fills → flips onto the stand (animated) → `fillCylinder`.
- Release outside a target: the prop floats home along an arc (no drops, no floor).
- Desktop: press on a prop and drag; the prop lifts and follows the mouse on a plane 15 cm above the bench; over the flask it tilts and pours while the button is held; rod in flask: circle the mouse to stir; release over a target to drop/snap. Clicking a movable prop does nothing but pulse a hint (the timer and cards remain clicks).
- `?auto` drives the same handling code with a virtual hand that moves along tweened paths.
- Motion: no visible object moves > 0.05 m per frame unless the fade sphere opacity ≥ 0.9; time-based (engine dt) animation only.
- Deploy only after the e2e groups pass (user approved upload when ready).

## Review Focus
1. Grab in XR while a reading/decision board is open → the prop grabs, but no action fires out of order (procedure rejects; prop floats home with a "no" sound).
2. Releasing a held prop when the chapter aborts (game over mid-pour) → prop returns home, holder cleared, no dangling attachment.
3. Desktop drag starting on a prop must not rotate the view; a drag starting on empty space still looks around.
4. Two controllers grabbing the same prop → second grab ignored.
5. Robot run repeated after a game-over restore → robot apparatus props back home, no duplicate animations.

---

### Task 1: Motion audit + smooth motion fixes

**Files:** `src/main.js` (audit in TEST), `src/lab/apparatus.js` (animated `goHome`, `robotRun`, `setSpeed`), `src/lab/robi.js` (`moveTo` smooth, `glideNear`, gesture layer), `src/lab/crew.js` (smooth walk/turn), chapters that call `placeNear` while Robi is visible, `src/chapters/ch3_robot.js` (robot does the steps), `src/chapters/ch3_events.js` + `src/chapters/ch5_rescue.js` (Azoulay at the console), `tests/e2e/play.spec.js`.

**Interfaces:**
- Produces: `ctx.motionAudit: Array<{ name, chapter, dist }>` (TEST only); `ctx.track(obj, name)`; `app.goHome(o, ms)` animated; `app.robotRun({ fast })` (pour → yeast → stir → stopper, ~6 s first, ~1.5 s fast); `robi.glideTo(pos, lookAt)`; `figure.walkTo` eased with turning.

- [ ] **Step 1: Failing e2e** — `motion: no visible jumps in chapters 2, 3, 5` with `&auto&animspeed=1&only=<ch>` (tweens at real speed, auto choices): `ctx.motionAudit` is `[]`.
- [ ] **Step 2: Run** — Expected: FAIL listing goHome snaps, robotPrep pop-ins, Robi teleports.
- [ ] **Step 3: Implement** — audit per frame over tracked objects (robi root, lab props, robot-apparatus props, figure roots): visible both frames, fade < 0.9, displacement > 0.05 m → record (deduped). `animspeed` param overrides `ctx.auto ? 8 : 1` tween speed in chapters/apparatus/robi. `goHome` arcs back (450 ms). `robotRun` animates the robot bench props (Robi's arm reaches toward each) and replaces `robotPrep`. Robi: `glideTo` turns by the shortest angle (eased), moves with ease-in-out and a slight forward lean, ends facing the student; chapters use it when Robi is visible. Crew walk: smooth yaw slerp, ease, gait speed from velocity. Azoulay stands 0.5 m in front of `P_generatorConsole`, facing it; the `dial` gesture reaches the console.
- [ ] **Step 4: Run** the motion e2e + chapter 3/5 e2e — Expected: PASS. **Commit.**

### Task 2: Hospital patient

**Files:** `src/chapters/ch6_life.js`, (figure) `src/lab/crew.js`

- [ ] **Step 1: Failing e2e** — `chapter 6: the fever case shows a patient in the bed` → `window.__ctx.patientVisible === true` at `case1`.
- [ ] **Step 2: Implement** — a crew figure without helmet tint lying on the bed (rotated, on the mattress), a blanket box over the legs, gentle breathing; disposed with the chapter.
- [ ] **Step 3: Run** — PASS; tour screenshot of case 1. **Commit.**

### Task 3: Hand-action math

**Files:** Create `src/game/handActions.js`; Test `tests/handActions.test.js`

**Interfaces:** `tiltOf(upVector) → radians`; `pourRate(tilt, horizDist) → { rate (ml/s), over: boolean }` (0 below 60°, `over` when horizDist ≤ 0.06); `createStir() → { feed(angle, inside) → progress 0..1 }` (unwraps angle, counts |Δ| only while inside, 3 turns = 1); `near(a, b, r) → boolean`.

- [ ] **Step 1: Failing tests** — tilt 30° → rate 0; tilt 90° over mouth → rate > 0 and over; tilt 90° at 0.1 m → over false; stir: 3 full turns inside → 1, turns outside → 0, back-and-forth wobble of ±10° for 50 steps < 0.5; angle wrap from 350° to 10° counts 20°.
- [ ] **Step 2: Run** — FAIL (module missing). **Step 3: Implement.** **Step 4: Run** — PASS. **Commit.**

### Task 4: Grabbing in the lab (XR + desktop + virtual hand) wired into chapter 2

**Files:** Create `src/lab/handling.js`; Modify `src/core/input.js` (grab holder hooks, desktop press-drag on grabbables, haptics), `src/core/locomotion.js` (no look-drag while holding), `src/lab/apparatus.js` (pour stream, flask fill by volume, spoon heap, stir ring, ghost targets), `src/chapters/ch2_bench.js` (props act through handling; auto uses the virtual hand), `tests/e2e/play.spec.js`

**Interfaces:**
- Consumes: `handActions.js`, `procedure.act` actions (`fillCylinder`, `pour {bottle}`, `yeast`, `stir`, `stopper {kind}`).
- Produces: `createHandling(ctx, app, { onAction })` with `enable(on)`, `virtualHand()` → `{ grab(prop), moveTo(worldPos, ms), tilt(rad, ms), circle(center, turns, ms), release() }`.

- [ ] **Step 1: Failing e2e** — `chapter 2 hands: the virtual hand pours, spoons, stirs and plugs` (`&auto&only=bench&hand=20,40&seed=7`): trials recorded as before **and** `window.__ctx.handLog` contains `pour`, `yeast`, `stir`, `stopper` in order for trial 1; `desktop drag: dragging the 3% bottle over the flask pours` (no auto: real `page.mouse` down on the bottle's screen position → move over the flask → hold 3 s → up): flask liquid level > 0 and the procedure step advanced to `yeast`; `a drag on empty space still turns the view`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** per Global Constraints; click on a movable prop only pulses its hint and plays `c2_grab_hint` ("תפסו את הכלי והביאו אותו אל היעד") once.
- [ ] **Step 4: Run** chapter 2 e2e group + the new tests — PASS. **Commit.**

### Task 5: Voice, tour, full verification, deploy

- [ ] `node tools/voices.mjs --only c2_grab_hint`; tour bench/robot/rescue/life; e2e in groups; push; live smoke.
