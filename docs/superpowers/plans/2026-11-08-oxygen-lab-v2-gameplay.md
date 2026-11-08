# Oxygen Lab v2 — Gameplay (Plan 3): student-chosen temperatures, robot completion, text that fits

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed-37° hands-on run with three student-chosen temperatures (one trial each), let the student pick the robot's extra temperatures from the rest, and make every canvas text fit its box at a readable size — with automated checks.

**Architecture:** Pure logic (model/state/procedure/text layout) changes are unit-tested with `node:test`; chapters 2–3 are rewired on top; a test-mode text audit in `ui.panel` records every `fillText` and e2e runs assert no violations.

**Tech Stack:** three.js 0.170 (import map), plain ES modules, node:test, Playwright (SwiftShader), ElevenLabs via `tools/voices.mjs`.

**Spec:** `docs/specs/2026-11-08-oxygen-lab-v2-design.md` §3, §4, §7 (on top of `docs/specs/2026-11-07-oxygen-lab-vr-design.md`).

## Global Constraints
- Hand chips: `10, 20, 30, 40, 50, 60, 70, 90` (90 = boil trap, O₂ −15, chip locks, choose again).
- One valid hand trial per chosen temperature; a failed trial is redone at the **same** temperature; chapter 2 always ends with 3 valid hand trials at 3 distinct temperatures.
- Robot chips: 5–70 step 5; hand temperatures are locked and marked ✋; robot picks 3–5 (`ROBOT_MIN=3`, `ROBOT_MAX=5`).
- Coverage: whole plan (hand + robot) has some T ≤ 35 and some T ≥ 45.
- Budget cost = robot temperatures × 3 × `TRIAL_COST` + 2 × `TRIAL_COST`; refused when cost ≥ O₂. Robot completions at hand temperatures (2 each) cost **no** oxygen.
- Student unmixed trial: detectable outlier whenever physically possible; then the robot plants none.
- Text: every string drawn on a panel canvas stays inside the canvas minus a 2 % margin; em height (font px ÷ ppm) ≥ `0.0175 × viewDist / 0.72` m (≈1° letter height); default `viewDist` 0.8 m, wall panels 2.5 m.
- Every voice line ≤ 15 words; new/changed lines are voiced with `tools/voices.mjs` (user approved 2026-11-08).
- Deploy only with the user's OK.

## Review Focus
1. Hand trial fails twice at the same temperature (e.g. sealed stopper then unfilled cylinder) → still the same temperature, hint level counts completed trials, no lock-up.
2. Student picks 90° then a valid one → 90 stays locked, no trial recorded at 90, O₂ −15.
3. Hand temps all ≥ 45 (e.g. 50/60/70) → robot plan must add a ≤ 35 temp; chips that would be one-sided show the message.
4. Very low O₂ arriving at chapter 3 (after penalties) → emergency tanks still open when no 3-temperature plan fits.
5. Resume from a chapter-3 checkpoint → hand temps re-derived from saved trials (`by: 'student'`), locked chips correct.

---

### Task 1: Text layout helper + test-mode text audit

**Files:**
- Create: `src/core/textFit.js`
- Modify: `src/core/ui3d.js` (panel audit, card/button/subtitles use the helper), `src/main.js:37` (`createUI(engine, input, { audit: TEST })`)
- Test: `tests/textFit.test.js`, `tests/e2e/play.spec.js` (helper `expectTextFits`)

**Interfaces:**
- Produces: `layoutText({ text, w, h, maxPx, minPx, lineH = 1.2, measure }) → { px, lines: string[], fits: boolean }` (pure; `measure(str, px) → width`); `fitText(g, text, { x, y, w, h, maxPx, minPx, weight = 700, align = 'center', valign = 'middle', font }) → { px, fits }` (draws on a canvas context, wraps on spaces, shrinks from maxPx down to minPx; if it still doesn't fit at minPx it draws at minPx and returns `fits:false`).
- Produces: `panel({ ..., viewDist = 0.8, name })`; with `audit` on, every `fillText` on the panel's context pushes `{ name, text, px, ppm, viewDist, overflow: boolean, small: boolean }` to `ui.textAudit` (only violations are pushed).

- [ ] **Step 1: Write the failing unit tests** — `tests/textFit.test.js`, with `measure = (s, px) => s.length * px * 0.5`:
  - `shrinks a long single word line until it fits`: `layoutText({ text: 'abcdefghij', w: 100, h: 50, maxPx: 40, minPx: 10, measure })` → `px <= 20`, `fits === true`, `lines.length === 1`.
  - `wraps before shrinking below a readable size`: text `'aa bb cc dd ee ff'`, `w: 60, h: 200, maxPx: 20, minPx: 16` → `lines.length > 1`, every line `measure(line, px) <= 60`, `lines.length * px * 1.2 <= 200`.
  - `never goes below minPx and reports misfit`: text of 200 chars, `w: 50, h: 20, maxPx: 20, minPx: 12` → `px === 12`, `fits === false`.
- [ ] **Step 2: Run** `node --test tests/textFit.test.js` — Expected: FAIL, module not found.
- [ ] **Step 3: Implement `src/core/textFit.js`** — for px from maxPx down to minPx (step 1): greedy word wrap with `measure`; first px where every line fits `w` and `lines × px × lineH ≤ h` wins. `fitText` uses `g.measureText` with `g.font = \`${weight} ${px}px ${font}\``, draws lines centred on the box per align/valign, `g.direction = 'rtl'` unless the caller set otherwise.
- [ ] **Step 4: Run** `node --test tests/textFit.test.js` — Expected: 3/3 PASS.
- [ ] **Step 5: Audit + adoption in `ui3d.js`** — `createUI(engine, input, { audit })`; in `panel()`, when `audit`, wrap the context's `fillText(text, x, y)`: measure the drawn box from `textAlign`/`textBaseline` and the current font px, flag `overflow` if outside `[0.02W, 0.98W] × [0, H]`, `small` if `px / ppm < 0.0175 * viewDist / 0.72`; expose `ui.textAudit`. Card labels, button labels and the XR subtitle body switch to `fitText` (card `minPx` from the physical minimum: `ceil(0.0175 * 0.8 / 0.72 * ppm)`).
- [ ] **Step 6: e2e helper** — in `play.spec.js`: `const expectTextFits = async page => expect(await page.evaluate(() => window.__ctx.ui.textAudit.map(v => \`${v.name}: ${v.text} (${v.overflow ? 'overflow' : 'small'})\`))).toEqual([])`; call it at the end of `full auto run`, `chapter 2 autofail acidMelt`, `chapter 3 low oxygen`, `chapter 6 auto`. (`ctx.ui` must be exposed on `window.__ctx`.)
- [ ] **Step 7: Run those four e2e tests** (one worker) — Expected: FAIL listing current violations.
- [ ] **Step 8: Fix every violation** — give each ad-hoc panel a `name` and the right `viewDist` (graph wall, lab signs, O₂ door screen, generator screen: 2.5), replace hand-rolled `fillText` sizing in `kit.js`, `ch2_bench.js`, `ch3_robot.js`, `ch4_graph.js`, `ch5_rescue.js`, `ch6_life.js`, `ch_end.js`, `graphWall.js`, `labSigns.js`, `main.js` (game-over panel) with `fitText` or larger sizes/panels.
- [ ] **Step 9: Run the four e2e tests + `npm test`** — Expected: all PASS, `textAudit` empty.
- [ ] **Step 10: Commit** — `git add src tests && git commit -m "feat: text fits its box at a readable size — layout helper + test-mode audit"`.

### Task 2: Model, state and config for chosen temperatures

**Files:**
- Modify: `src/game/config.js`, `src/game/model.js`, `src/game/state.js`
- Test: `tests/model.test.js`, `tests/state.test.js`

**Interfaces:**
- Produces (config): remove `FIRST_TEMP`; add `HAND_TEMPS = [10, 20, 30, 40, 50, 60, 70, 90]`, `HAND_TRIALS = 3`, `ROBOT_MIN = 3`, `ROBOT_MAX = 5`; delete `PLAN_MIN/PLAN_MAX`.
- Produces (model): `sampleTrial(T, rng, { mixed: false })` gives `min(0.7·v, v − 4)` clamped ≥ 0 (v = noisy rate). `completeValues(T, rng, studentVal, unmixed) → { vals: [a, b], studentOut: boolean }` — two robot readings at T so that `findOutliers({T: [studentVal, a, b]})` flags exactly index 0 when `unmixed` and that is achievable (`studentOut: true`), and flags nothing otherwise (rejection-sampled, ≤ 30 tries, fallback `[round(rate), round(rate)]` with the matching flag).
- Produces (state): `handTemps() → number[]` (temps with a valid `by: 'student'` trial, ascending); `planFeedback(robotTemps) → { ok, msg: 'few'|'many'|'oneSided'|'budget'|null, cost }` — coverage over `robotTemps ∪ handTemps()`, cost over `robotTemps` only; `addTrial(T, trial, { free = false } = {})` — `free` skips `spend`.

- [ ] **Step 1: Write failing tests**
  - model: `unmixed student reading is clearly low`: for T in [20, 40, 50] and 50 seeds, `sampleTrial(T, rng, {mixed:false}) <= trueRate(T) - 3`.
  - model: `completeValues makes a student unmixed reading the only outlier`: T ∈ [10, 20, 30, 40, 50, 60], 30 seeds each, `s = sampleTrial(T, rng, {mixed:false})`; result `studentOut === true` ⇒ `findOutliers({[T]: [s, ...vals]})` equals `[{temp: T, index: 0}]`; for T ≤ 60 `studentOut` must be true.
  - model: `completeValues never invents an outlier for a normal reading`: same temps, `s = sampleTrial(T, rng)`, `findOutliers({[T]: [s, ...vals]})` is `[]`.
  - state: `handTemps lists valid student temperatures`: student trials at 20 (valid), 40 (invalid), 60 (valid), robot at 30 → `[20, 60]`.
  - state: `planFeedback counts coverage with hand temps, cost with robot temps`: hand 20/40/60 → `planFeedback([10, 50])` `few`; `([5,10,15,25,30,35])` `many`; with hand 50/60/70, `([45, 55, 65])` `oneSided`; with hand 20/40/60 and O₂ 315, `([10, 30, 50])` ok with `cost === 165`; with O₂ 150, `budget`.
  - state: `free trials cost no oxygen`: `addTrial(20, {volume: 5}, {free: true})` leaves O₂ unchanged.
  - Replace the old `planFeedback` / `review F2` / budget tests that use 37 with the new semantics.
- [ ] **Step 2: Run** `npm test` — Expected: the new tests FAIL (no `completeValues`, old signature).
- [ ] **Step 3: Implement** in `config.js`, `model.js`, `state.js` per Interfaces.
- [ ] **Step 4: Run** `npm test` — Expected: all PASS except files still importing `FIRST_TEMP` (fixed in Tasks 3–5; procedure tests must still pass by passing `requiredTemp` explicitly).
- [ ] **Step 5: Commit** — `git commit -m "feat(model): chosen hand temperatures — completeValues, plan feedback over hand+robot, free robot completions"`.

### Task 3: Procedure — any chosen temperature, redo without re-dialing

**Files:**
- Modify: `src/game/procedure.js`
- Test: `tests/procedure.test.js`

**Interfaces:**
- Produces: `createProcedure({ game, rng, trialIndex, goggles, requiredTemp, bathReady = false })` — `requiredTemp` has no default (throws if missing); `bathReady: true` starts at step `fillCylinder` with `temp = requiredTemp`; `act({type:'dial', temp})` with `temp !== requiredTemp && temp < 90` returns `{ ok: false, msg: 'otherTemp' }`.

- [ ] **Step 1: Failing tests** — `records the trial at the chosen temperature` (requiredTemp 50 → `game.s.trials[50].length === 1`); `bathReady skips the dial step` (`p.step === 'fillCylinder'`, full sequence without dial records at 50); `dialing a different temperature is refused with a reason`.
- [ ] **Step 2: Run** `node --test tests/procedure.test.js` — Expected: new tests FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(procedure): chosen temperature, redo without re-dialing"`.

### Task 4: Chapter 2 — pick three temperatures

**Files:**
- Modify: `src/chapters/ch2_bench.js`, `src/game/script.js`
- Test: `tests/e2e/play.spec.js` (`chapter 2 auto`, `autofail sealedBlast`, `autofail acidMelt`, new `boil trap`)

**Interfaces:**
- Consumes: `HAND_TEMPS`, `HAND_TRIALS`, `createProcedure({... bathReady})`, `game.handTemps()`.
- Produces: `ctx.autoHand` (test override from `?hand=20,40,60`, default `[20, 40, 60]`).

- [ ] **Step 1: Update e2e expectations first** — `chapter 2 auto: three valid trials at three chosen temperatures`: after `&auto&only=bench&hand=20,40,60`, `handTemps` equals `[20, 40, 60]` and each has exactly 1 valid student trial; `autofail sealedBlast` → the redo is at the same temperature (`trials[20]` has 1 invalid + 1 valid); new `boil trap`: `&auto&only=bench&autofail=boil` → no trial at 90, O₂ = 360 − 15 − 45, mistakes include `boiling`.
- [ ] **Step 2: Run them** — Expected: FAIL.
- [ ] **Step 3: Rewrite the trial loop** — before each new temperature open the chip row (`HAND_TEMPS`, used and boiled chips `off`, others idle); the chosen chip sets the bath (`setBath`) and starts `createProcedure({ requiredTemp: T, trialIndex: validCount, bathReady: true })` (the dial is the chip choice now; `dial` step is skipped, the bath prop opens nothing); 90 → `boil` fail via `proc.act({type:'dial', temp: 90})` on a throwaway procedure, chip `off`, choose again. A failed trial loops at the same T with a fresh procedure (`bathReady: true`). After 3 valid trials: mini chart of three points (x = temperature, LTR axis) and line `c2_three`; remove the 37-only chart and `c2_why3` here.
- [ ] **Step 4: Script** — `c2_intro: 'בוחרים שלוש טמפרטורות, ניסוי אחד בכל אחת. בראשונה אני מסביר הכל.'`, `c2_dial: 'בחרו טמפרטורה לאמבט.'`, `c2_wrongTemp: 'את הטמפרטורה הזאת כבר בדקנו. בחרו אחרת.'`, new `c2_three: 'שלוש נקודות... איפה השיא? צריך עוד נתונים.'`.
- [ ] **Step 5: Run the chapter-2 e2e tests** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(ch2): the student picks three temperatures, one trial each; 90° boil trap; redo at the same temperature"`.

### Task 5: Chapter 3 — robot temperatures from the rest, completions, moved "why three"

**Files:**
- Modify: `src/chapters/ch3_robot.js`, `src/main.js` (`seedFor`), `src/game/script.js`
- Test: `tests/e2e/play.spec.js` (`chapter 3 auto`, `chapter 3 low oxygen`, `resume`, `chapter 4 auto`)

**Interfaces:**
- Consumes: `game.handTemps()`, `game.planFeedback(robotTemps)`, `completeValues`, `addTrial(..., { free: true })`, `ROBOT_MIN/MAX`.

- [ ] **Step 1: Update e2e expectations** — `chapter 3 auto`: `game.s.plan` = hand ∪ robot sorted (`[10, 20, 30, 40, 50, 60]` for seeded hand `[20, 40, 60]` + `AUTO_PLAN = [10, 30, 50]`), every plan temperature has exactly 3 valid trials (after leak/storm handling), O₂ spent on robot trials = robot trials × 15 only; `resume` seeds a chapter-3 save whose student trials are at 20/40/60 and expects those chips locked (`window.__ctx.lockedTemps` equals `[20, 40, 60]`); a new unit-like e2e `student unmixed is the outlier`: `&auto&only=robot&handUnmixed=40` → ch4 flags `{temp: 40, by: 'student'}` and no robot `meta: 'unmixed'`.
- [ ] **Step 2: Run them** — Expected: FAIL.
- [ ] **Step 3: Implement** — chips 5–70 step 5 with hand temps `right` state + "✋" label and inert; feedback panel messages: `few: 'צריך לפחות 3 טמפרטורות לרובוט'`, `many: 'יותר מ-5 יגמרו את החמצן'`, `oneSided`, `budget`; emergency tanks when `O₂ <= ROBOT_MIN*3*TRIAL_COST + 2*TRIAL_COST`; run order: first the 2 completions at each hand temperature (free, quick, `completeValues`), then robot temperatures (`robotValues`, planted outlier only if no hand trial got `studentOut`); after the first robot temperature finishes, `c2_why3` with the wall graph highlighting its three dots; leak/storm/Azoulay unchanged (indices over robot temperatures). `seedFor`: hand trials at 20/40/60 (`by:'student'`), `?handUnmixed=T` marks that one unmixed with an unmixed-range volume; later-chapter seeds use plan `[10, 20, 30, 40, 50, 60]`.
- [ ] **Step 4: Script** — `c3_plan: 'אילו עוד טמפרטורות לבדוק? בחרו 3 עד 5 לרובוט.'`, `c3_few: 'צריך לפחות 3 טמפרטורות נוספות כדי לראות מגמה.'`, `c3_many: 'יותר מ-5 יגמור לנו את החמצן.'`, `c3_run: 'אני משלים חזרות בטמפרטורות שלכם, ואז מריץ את החדשות.'`.
- [ ] **Step 5: Run chapter 3/4/resume e2e** — Expected: PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(ch3): robot temperatures picked from the rest, completions at the student's temperatures, 'why three' moved here"`.

### Task 6: Voice the new and changed lines

**Files:**
- Modify: `assets/voice/*.mp3`, `src/game/voices.js` (generated)
- Test: `tests/script.test.js` (existing ≤15 words + voice availability)

- [ ] **Step 1: Run** `npm test` — Expected: script tests PASS (word limits) — `VOICE_AVAILABLE` lacks `c2_three` (the subtitle fallback covers it).
- [ ] **Step 2: Generate** — `node tools/voices.mjs --force c2_intro,c2_dial,c2_wrongTemp,c3_plan,c3_few,c3_many,c3_run --only c2_intro,c2_dial,c2_wrongTemp,c2_three,c3_plan,c3_few,c3_many,c3_run` — Expected: 8 files written, Scribe QA lines match.
- [ ] **Step 3: Run** `npm test` — Expected: PASS.
- [ ] **Step 4: Commit** — `git commit -m "chore(voice): lines for chosen temperatures and robot completion"`.

### Task 7: Full verification + hidden-text screenshot tour

**Files:**
- Create: `.superpowers/tour.mjs` (gitignored scratch)
- Modify: whatever the tour shows is occluded

- [ ] **Step 1: Tour** — script visits every board in chapters 1–6 and the end screen (`?test&only=<ch>&hold` + `input.select` steps), screenshots each from the station view; inspect every image for text hidden behind props/walls or overlapped by subtitles.
- [ ] **Step 2: Fix** placements found (board `dist/height/side`, subtitle offset in XR).
- [ ] **Step 3: Run** `npm test` and the e2e suite in two halves with one worker (memory) — Expected: all PASS.
- [ ] **Step 4: Commit** — `git commit -m "fix: boards no longer hidden behind props"`.
