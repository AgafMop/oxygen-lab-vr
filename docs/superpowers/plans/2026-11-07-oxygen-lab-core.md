# Oxygen Lab VR — Plan 1: Spike + Playable Core (Milestones 1–2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seated-VR + desktop WebXR lab, built from Blender assets, playable from hypothesis through 3 hand-made trials, robot runs, live graph and the enzyme zoom scene, to a scored end screen.

**Architecture:** Pure, Node-testable game logic (`src/game/`) drives a Three.js presentation layer (`src/core/`, `src/lab/`, `src/chapters/`). Static art is generated headlessly in Blender 5.1 by Python scripts (`blender/`) into GLB with a baked lightmap and post-compressed with glTF-Transform. Each chapter is an async function over a shared `ctx`; `?test&auto` lets each chapter answer itself so Playwright can play the whole game.

**Tech Stack:** three@0.170.0 (ES modules via jsdelivr import map, WebXR, GLTFLoader + MeshoptDecoder), Blender 5.1 Python (Cycles bake), @gltf-transform/cli, Node 24 `node:test`, @playwright/test.

**Spec:** `docs/specs/2026-11-07-oxygen-lab-vr-design.md`. Read §5, §6 (chapters 1–4), §7, and §9 before starting. Later plans cover milestones 3–5 (cutscenes, storm, leak, Azoulay, chapter 5, life corridor, Game Over scene, voice, Veo intro, polish).

## Global Constraints

- All UI text is Hebrew, RTL. No text input anywhere. Every choice is made by pointing and selecting (ray + trigger), or by clicking on desktop.
- On-screen line length: ≤ 15 words. Every speech line also appears as a subtitle.
- Students play **seated**. Every action must be doable with the ray alone, from a chair, and nothing may require standing or bending.
- Locomotion defaults: teleport between stations ON, snap-turn 30° on the right stick, smooth move OFF (setting), a recenter button. Desktop: WASD + mouse with pointer lock, click to act, keys 1–5 jump to stations.
- Performance on Quest 3: 72 fps; ≤ 150 draw calls; ≤ 300k triangles per frame; every file < 15 MB; total download < 30 MB.
- Science copy must never say the enzyme "dies". Wording: it changes shape and loses its fit. The O₂ collected comes from catalase splitting H₂O₂, not from respiration.
- Model curve (from the original): `rate(T) = 36·2^((T−37)/10) / (1 + e^((T−48)/3.2))` ml/min, with measurement noise.
- O₂ budget: start at 360 game-minutes. Each trial costs 15. Penalties: no goggles −10, sealed stopper −15 (and the trial is redone), excess yeast −15 (and the trial is disqualified), boiling bath −15, 30 % H₂O₂ → immediate Game Over.
- Plan: 5–7 temperature tokens on a 5–70 °C slider (step 5). 37 °C is pre-filled by the 3 hand-made trials.
- Hints for the hand-made trials: trial 1 = full guidance, trial 2 = highlight the next tool only, trial 3 = none.
- Third-party assets: Poly Haven CC0 only. Do not spend paid credits (ElevenLabs, Veo, Nano Banana) in this plan.
- Never push or deploy without asking the user first. Stage only relevant files.
- Three.js version pinned: `three@0.170.0`.

## Review Focus

1. **Seated eye height** (≈1.15–1.25 m) must put the bench top about 0.45 m below the eye, so it is reachable without standing. Owned by Task 7: `seatedRigOffset` test.
2. **Out-of-order or repeated actions** (pouring before goggles, timer before stopper, double-select) must either trigger the defined failure or be refused with a hint. They must never wedge the procedure. Owned by Task 3: out-of-order tests.
3. **A one-sided plan** (all tokens ≤ 35 °C, or fewer than 5 tokens) must get visible feedback and must not unlock "run". Owned by Task 2: `planFeedback` tests.
4. **O₂ reaching 0 in the middle of a robot run** must trigger Game Over and restore the chapter checkpoint, with that chapter's trials removed. Owned by Task 2: game-over restore test.
5. **localStorage throwing or unavailable** (private mode, cleared site data) must not stop the game from running. It only loses resume. Owned by Task 2: throwing-storage test.

---

## File Structure

```
index.html                     entry; import map; boot overlay ("כניסה" + VR button)
package.json                   type:module; scripts: test, e2e, assets, serve
src/main.js                    builds ctx, runs chapters in order
src/game/config.js             all tunable constants above
src/game/model.js              rate curve, rng, trial sampling, stats, outliers
src/game/state.js              game state, O₂, score, trials, checkpoints, events
src/game/storage.js            safe localStorage adapter
src/game/procedure.js          hands-on bench step machine + failure rules
src/game/script.js             LINES: id → {speaker, text} (Hebrew)
src/core/engine.js             renderer, scene, rig, XR session, frame loop
src/core/input.js              unified ray/mouse picking, grab, hover
src/core/locomotion.js         stations, teleport, snap turn, smooth, recenter
src/core/ui3d.js               canvas-texture panels, cards, buttons, subtitles, wrist meter
src/core/audio.js              synth sfx + say(lineId) (mp3 if present, else subtitle only)
src/lab/labScene.js            loads lab/props/robi GLBs, lightmap, env, stations, anchors
src/lab/apparatus.js           liquids, bubbles, gas column, dial, failure FX
src/lab/robi.js                robot rig: hover, face expressions, arm gestures
src/ui/graphWall.js            live table + scatter/mean graph on the wall
src/chapters/ch1_hypothesis.js
src/chapters/ch2_bench.js
src/chapters/ch3_robot.js
src/chapters/ch4_graph.js
src/chapters/ch_end.js
src/fx/enzymeZoom.js           the "inside the enzyme" scene
blender/common.py              helpers: materials, PolyHaven fetch, UV, bake, export
blender/build_lab.py           → assets/lab.glb + assets/lab_lightmap.webp
blender/build_props.py         → assets/props.glb
blender/build_robi.py          → assets/robi.glb
blender/render_mars_pano.py    → assets/mars_pano.webp (equirect)
tools/inspect-glb.mjs          asserts node names, tri count, file size
tools/optimize.mjs             gltf-transform meshopt + webp
tests/*.test.js                node:test unit tests
tests/e2e/play.spec.js         Playwright full auto-play + screenshots
```

---

### Task 1: Repo scaffold + science model

**Files:**
- Create: `package.json`, `.gitignore` (node_modules, test-results, `blender/cache/`), `src/game/config.js`, `src/game/model.js`
- Test: `tests/model.test.js`

**Interfaces:**
- Produces:
  - `trueRate(T:number):number`
  - `makeRng(seed:number):()=>number` (mulberry32)
  - `gauss(rng):number`
  - `sampleTrial(T:number, rng, opts?:{mixed?:boolean, spoons?:number, leak?:boolean}):number`: volume in ml, rounded to 0.5, clamped to [0, 50]. Multipliers: noise ×(1 + 0.06·gauss), unmixed ×0.7, leak ×0.55, spoons ×spoons
  - `mean(vals:number[]):number|null`
  - `findOutliers(byTemp:Record<number,number[]>):Array<{temp:number,index:number}>`: a value is an outlier if |v − median| > max(3, 0.25·median)
  - `bestTemp(means:Record<number,number>):number`
  - `config.js` exports: `O2_START=360`, `TRIAL_COST=15`, `PENALTY={noGoggles:10,sealedStopper:15,excessYeast:15,boiling:15}`, `PLAN_MIN=5`, `PLAN_MAX=7`, `SLIDER={min:5,max:70,step:5}`, `FIRST_TEMP=37`, `CHAPTERS=['hypothesis','bench','robot','graph','end']`

- [ ] **Step 1:** Run `git init`, then `npm init -y`. Set `"type":"module"` and the scripts `"test":"node --test tests/"`, `"e2e":"playwright test"`, `"serve":"npx http-server -p 8080 -c-1 ."`. Then `npm i -D @playwright/test http-server @gltf-transform/cli @gltf-transform/core @gltf-transform/extensions meshoptimizer`.
- [ ] **Step 2: Write failing tests** in `tests/model.test.js`:
  - `trueRate(37)` ≈ 32.8 ± 0.5. `trueRate(60)` < 3. The argmax over 5..70 step 1 is in [40,44].
  - `makeRng(1)` gives the same 5 numbers on two calls.
  - Over 200 samples at 40 °C, the mean of `sampleTrial` is within 10 % of `trueRate(40)`, and every value is a multiple of 0.5 in [0,50].
  - `sampleTrial(40,rng,{mixed:false})` averages ≈ 0.7 × the mixed value (±10 %).
  - `findOutliers({40:[30,31,18]})` → `[{temp:40,index:2}]`. `findOutliers({40:[30,31,29.5]})` → `[]`.
  - `bestTemp({30:20,40:33,50:12})` → 40.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (module not found).
- [ ] **Step 4:** Implement `config.js` and `model.js`.
- [ ] **Step 5:** Run `npm test`. Expected: all pass.
- [ ] **Step 6:** Commit: `feat: science model and config`.

### Task 2: Game state, scoring, checkpoints

**Files:**
- Create: `src/game/storage.js`, `src/game/state.js`
- Test: `tests/state.test.js`

**Interfaces:**
- Consumes: Task 1 config and model.
- Produces:
  - `createStorage(backend = globalThis.localStorage)` → `{get(key), set(key, val)}`. JSON-encoded. Every call is wrapped in try/catch; on failure it returns `null` or silently does nothing.
  - `createGame({seed:number, storage})` → `game` with:
    - `game.s`: `{chapter:string, o2:number, score:number, hypothesis:'rise'|'peak'|'flat'|null, plan:number[], trials:Record<number,Trial[]>, badges:Set<string>, mistakes:string[], flags:Record<string,boolean>, over:boolean}`
    - `Trial = {volume:number, by:'student'|'robot', valid:boolean, reason?:string, read?:'student'|'auto'}`
  - Methods:
    - `spend(min, reason)`: when o2 ≤ 0 it sets `over=true` and emits `'gameover'`.
    - `penalize(key)`: applies `PENALTY[key]`, pushes to `mistakes`, and subtracts 50 from the score.
    - `addTrial(T, trial)`: also calls `spend(TRIAL_COST)`.
    - `disqualify(T, i, reason)`
    - `setChapter(id)`: saves a checkpoint snapshot under the key `'oxylab.v1'`.
    - `restoreCheckpoint()`: clears `over` and resets o2 to the snapshot value.
    - `planFeedback(plan)` → `{ok:boolean, msg:'few'|'many'|'oneSided'|null}`. `oneSided` means all temperatures ≤ 35 or all ≥ 45.
    - `finalScore()` → `{score, stars:1|2|3, badges:string[]}`. Stars: 1 = finished; 2 = no Game Over; 3 = no mistakes and every disqualify/outlier decision correct.
    - `on(evt, fn)` for `'o2' | 'gameover' | 'chapter' | 'trial'`.

- [ ] **Step 1: Write failing tests:**
  - A new game has o2 = 360.
  - `addTrial` ×3 → o2 = 315.
  - `penalize('noGoggles')` → o2 drops by 10 and `mistakes` contains it.
  - Draining o2 to 0 emits `gameover` once.
  - `setChapter('robot')`, then 2 trials, then `restoreCheckpoint()` → those trials are gone and o2 is restored.
  - Game with a backend whose `getItem`/`setItem` throw → `setChapter` and `restoreCheckpoint` do not throw.
  - `planFeedback([10,20,30,35,15])` → `oneSided`; `[10,20]` → `few`; `[10,25,37,45,60]` → `ok:true`; 8 items → `many`.
  - A perfect run (5 temps × 3 trials, no mistakes) → o2 = 135 > 0 and `stars === 3`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `storage.js` and `state.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: game state, scoring and checkpoints`.

### Task 3: Bench procedure state machine

**Files:**
- Create: `src/game/procedure.js`
- Test: `tests/procedure.test.js`

**Interfaces:**
- Consumes: `game` (Task 2) and `sampleTrial` (Task 1).
- Produces: `createProcedure({game, rng, trialIndex:0|1|2, goggles:boolean})` →
  - `act(a)` → `{ok:boolean, fail?:FailId, done?:{volume:number, valid:boolean, reason?:string}}`.
    - Actions:
      - `{type:'goggles'}`
      - `{type:'dial', temp}`
      - `{type:'fillCylinder'}`
      - `{type:'pour', bottle:'3'|'30'}`
      - `{type:'yeast'}` (repeatable: counts spoons)
      - `{type:'stir'}`
      - `{type:'stopper', kind:'tube'|'sealed'}`
      - `{type:'timer'}`
      - `{type:'read', ml}`
    - `FailId = 'splash' | 'sealedBlast' | 'elephantToothpaste' | 'acidMelt' | 'boil' | 'cylinderNotFilled'`
  - `hint()` → `{target:string|null, level:'full'|'highlight'|'none'}`. The target is the anchor name of the next tool.
  - `step`: current step id.
- Rules (spec §6, the pitfalls table):
  - Touching `pour` without goggles → `splash` + `penalize('noGoggles')`. The step stays the same.
  - `bottle:'30'` → `acidMelt` and `game.spend(game.s.o2)` (Game Over).
  - `dial` ≥ 90 → `boil` + `penalize('boiling')`. The trial result is 0 and invalid.
  - 3 or more spoons by the time of `stir`/`stopper` → `elephantToothpaste` + `penalize('excessYeast')`. The trial is invalid with reason `'excessYeast'`.
  - `stopper:'sealed'` → `sealedBlast` + `penalize('sealedStopper')`. The procedure resets to the `pour` step.
  - `timer` without `fillCylinder` → `cylinderNotFilled`. The trial is invalid.
  - `stopper` without `stir` → the trial is allowed, with `mixed:false`.
  - `read`: `ok` is true when `ml` is within ±1 of the volume. A wrong read returns `ok:false` and lets the student try again; the stored volume never changes.
  - Out-of-order actions that match no rule → `{ok:false}`. The step does not change.

- [ ] **Step 1: Write failing tests:**
  - The happy path at 37 produces `done.valid` and `game.s.trials[37].length === 1`.
  - Each failure rule above has its own test, with its penalty and o2 effect.
  - `timer` sent first → `{ok:false}` and the step is unchanged.
  - Double `stir` → `ok:true`, idempotent.
  - `hint().level` is `'full'`, `'highlight'`, `'none'` for trialIndex 0, 1, 2.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `procedure.js` as a table of step → allowed actions → handler.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: bench procedure with teaching failures`.

### Task 4: Blender lab room with baked lightmap

**Files:**
- Create: `blender/common.py`, `blender/build_lab.py`, `tools/inspect-glb.mjs`, `tools/optimize.mjs`
- Output: `assets/lab.glb`, `assets/lab_lightmap.webp`

**Interfaces:**
- Produces GLB nodes (exact names; later tasks look them up):
  - Station empties, with the empty's −Y axis as the facing direction: `ST_entry`, `ST_bench`, `ST_robot`, `ST_generator`
  - Anchor empties: `A_bath`, `A_flask`, `A_trough`, `A_cylinder`, `A_bottle3`, `A_bottle30`, `A_yeastJar`, `A_spoon`, `A_rod`, `A_stopperTube`, `A_stopperSealed`, `A_timer`, `A_goggleRack`, `A_graphWall`, `A_robotBench`, `A_hypBoard`, `A_window`, `A_generator`
  - Teleport floor discs: `TP_entry`, `TP_bench`, `TP_robot`, `TP_generator`
  - The static room is merged into one mesh `LAB_static`, with UV1 = the lightmap atlas.
- Run: `"C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" -b --factory-startup --python blender/build_lab.py -- --out assets/`

- [ ] **Step 1:** Write `tools/inspect-glb.mjs <file> --require <names,...> --max-tris N --max-mb M`. It uses `@gltf-transform/core` and exits 1 on any violation. Run it against a missing file and confirm exit 1.
- [ ] **Step 2:** Write `common.py` with these helpers:
  - `polyhaven_texture(id, res='1k')`: downloads into `blender/cache/` through `https://api.polyhaven.com/files/<id>`, CC0 only.
  - `pbr_material(name, maps)`
  - `lightmap_uv(obj)`: a `UV1` layer via Smart UV Project, margin 0.02.
  - `bake_lightmap(objs, size=2048, samples=128) → image`: Cycles, bake type DIFFUSE with direct+indirect and no color pass, into one shared image.
  - `export_glb(path, objs)`
- [ ] **Step 3:** Write `build_lab.py`. Room 8×6×3.2 m:
  - Concave panelled walls; floor with PBR textures from Poly Haven (metal plate / concrete).
  - A panoramic window on the −Z wall: an opening with frame and mullions, about 5×1.8 m.
  - Ceiling LED strips (cool white emitters) and warm area light from the window.
  - Bench at 0.72 m (seated-height table) in front of `ST_bench`.
  - Robot bay with its own bench; graph-wall frame; goggle rack by the entry; generator alcove with an internal glass window.
  - Shelves with props for detail.
  - Place every empty above. Bake the lightmap for `LAB_static`, save it as WebP (quality 85), and export.
- [ ] **Step 4:** Run the Blender command, then `node tools/optimize.mjs assets/lab.glb`, then `node tools/inspect-glb.mjs assets/lab.glb --require ST_bench,…all names above --max-tris 120000 --max-mb 8`. Expected: exit 0.
- [ ] **Step 5:** Render a 1280×720 Eevee preview from `ST_bench` eye height (1.2 m) to `blender/cache/preview_lab.png`, then read the image and check the composition. Iterate until the room reads as a polished Mars research lab and not a box.
- [ ] **Step 6:** Commit the scripts and `assets/lab.glb` + `assets/lab_lightmap.webp`: `feat: blender-built lab with baked lighting`.

### Task 5: Blender props + robot Robi

**Files:**
- Create: `blender/build_props.py`, `blender/build_robi.py`
- Output: `assets/props.glb`, `assets/robi.glb`

**Interfaces:**
- `props.glb` meshes, each with its origin at its base (Task 9 parents them to the `A_*` anchors):
  - Equipment: `P_bath`, `P_bathDial`, `P_flask`, `P_trough`, `P_cylinder`, `P_thermometer`, `P_bottle3`, `P_bottle30` (red hazard label), `P_yeastJar`, `P_spoon`, `P_rod`, `P_stopperTube` (with tube), `P_stopperSealed`, `P_timer`, `P_goggles`, `P_tube`
  - Generator: `P_generatorTank`, `P_generatorDial`
  - Glass meshes are tagged `userData.glass=true` (custom property `glass`).
- `robi.glb` nodes: `R_root`, `R_body`, `R_head`, `R_face` (plane for a canvas texture), `R_armL`, `R_armR`, `R_thruster`. Size about 0.9 m tall and friendly: rounded white shell with orange Mars accents.

- [ ] **Step 1:** Write both scripts, using the `common.py` materials. Realistic proportions: 250 ml Erlenmeyer, 50 ml graduated cylinder.
- [ ] **Step 2:** Run both, then `optimize` and `inspect` against all of the names above, with props ≤ 60k tris / 4 MB and robi ≤ 20k tris / 2 MB. Expected: exit 0.
- [ ] **Step 3:** Render an Eevee preview of the bench lineup and Robi to `blender/cache/`, read the images, and iterate on proportions and materials.
- [ ] **Step 4:** Commit: `feat: blender props and Robi`.

### Task 6: Mars panorama

**Files:**
- Create: `blender/render_mars_pano.py`
- Output: `assets/mars_pano.webp` (4096×2048 equirect, < 2 MB)

- [ ] **Step 1:** Write the script:
  - A procedural terrain (displaced plane with noise and erosion-like ridges), rust and ochre materials.
  - Base Tamar domes in the mid-distance; Nishita-style sky tinted to the Mars dusk palette (butterscotch to blue-grey near the sun).
  - Dust haze from volume scatter.
  - Equirect camera at 1.6 m; 128 samples with denoise.
- [ ] **Step 2:** Run it, read the output image, and iterate until it looks like a convincing Mars vista.
- [ ] **Step 3:** Commit: `feat: rendered Mars panorama`.

### Task 7: Engine, input, locomotion — the spike (Milestone 1)

**Files:**
- Create: `index.html`, `src/main.js`, `src/core/engine.js`, `src/core/input.js`, `src/core/locomotion.js`, `src/lab/labScene.js`
- Test: `tests/locomotion.test.js`, `tests/e2e/play.spec.js`, `playwright.config.js` (webServer = `npm run serve`)

**Interfaces:**
- `createEngine(el)` → `{renderer, scene, camera, rig:Object3D, onFrame(fn(dt)), isXR():boolean, fade(to:0|1, ms):Promise}`
  - `renderer.xr` uses reference space `'local-floor'`. Color space is sRGB. Tone mapping is ACES.
  - Pixel ratio: ≤ 1.5 on desktop. In XR, framebuffer scale 1.0 + foveation 1.
- `seatedRigOffset(eyeY:number, benchTopY=0.72)` → the rig Y offset so that eye − bench = 0.45. It is pure and exported from `locomotion.js`.
- `createInput(engine)` → `{register(obj, {onSelect?, onHover?(on:boolean), grabbable?:boolean, onGrab?, onRelease?}), unregister(obj), setEnabled(bool)}`
  - XR: one ray per controller, trigger = select, grip = grab.
  - Desktop: pointer-locked crosshair or mouse position; click = select.
  - Hover gives an emissive rim and a short haptic pulse.
- `createLocomotion(engine, input)` → `{addStation(id, node), goTo(id, {fade?:boolean}):Promise, recenter(), setSmooth(on)}`
  - Teleport discs `TP_*` are registered as selectables.
  - Desktop: WASD at 1.6 m/s with collision clamped to the room bounds; keys 1–4 go to stations.
- `loadLab(engine)` → `Promise<{anchors:Record<string,Object3D>, stations:Record<string,Object3D>}>`
  - Loads `lab.glb` + lightmap (assigned as `lightMap` on `LAB_static`, channel uv1, intensity 1).
  - Loads `props.glb` and `robi.glb` and parents the props to the anchors.
  - Sets up `mars_pano.webp` as an equirect background seen through the window, a PMREM env map for reflections, and a dust particle field.
- `index.html` boot overlay: title "מחולל החמצן", a "כניסה" button (desktop) and the three.js VRButton. With `?test` it sets `window.__ctx`.

- [ ] **Step 1: Write failing test** `tests/locomotion.test.js`: `seatedRigOffset(1.2)` → bench top sits 0.45 below the eye, i.e. offset = 0.72 + 0.45 − 1.2 = −0.03 (±0.001). `seatedRigOffset(1.0)` → 0.17.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL. Implement the function, then run again. Expected: PASS.
- [ ] **Step 3:** Implement the engine, input, locomotion, labScene and index.html. `main.js` currently only loads the lab and stations.
- [ ] **Step 4:** Write `tests/e2e/play.spec.js` test `boots and teleports`:
  - Opens `/?test`, clicks "כניסה" and waits for `window.__ctx.ready`.
  - Asserts no console errors, then calls `__ctx.loco.goTo('robot')` and asserts the camera world position is within 0.3 m of the station.
  - Saves screenshots `bench.png` and `robot.png`.
  - Read the screenshots and check the lab is lit by the lightmap and the Mars view is visible.
- [ ] **Step 5:** Run `npx playwright install chromium && npm run e2e`. Expected: PASS.
- [ ] **Step 6:** Measure draw calls and tris with `renderer.info` at each station in test mode. Assert ≤ 150 calls and ≤ 300k tris in the e2e test.
- [ ] **Step 7:** Commit: `feat: WebXR spike - lab, teleport, ray input`.
- [ ] **Step 8 (user gate): Ask the user** to approve creating the GitHub repo (Lemons-Gaming, name `oxygen-lab-vr`) and enabling Pages. After approval, push and send them the URL to test in Quest 3 while seated: teleport, snap turn, ray hover, comfort, fps. Do not continue to Task 9 until the user reports how it felt. Fix what they report first.

### Task 8: 3D UI, subtitles, wrist O₂ meter, audio, script lines

**Files:**
- Create: `src/core/ui3d.js`, `src/core/audio.js`, `src/game/script.js`
- Test: `tests/script.test.js`

**Interfaces:**
- `ui3d`:
  - `panel({w, h, draw(g, W, H)})` → `{mesh, redraw()}`: canvas texture, `g.direction='rtl'`, Heebo font.
  - `card({w, h, img?:HTMLCanvasElement|string, label, onSelect})` → `{mesh, setState('idle'|'sel'|'right'|'wrong')}`
  - `button3d(label, onSelect, {style:'primary'|'ghost'})`
  - `subtitles(engine)` → `{show(speaker, text, ms)}`: head-locked low in view, at about 1.8 m distance, lerp-followed.
  - `wristMeter(engine, game)`: on the left controller in XR; a top-left HUD on desktop. Shows O₂ as hh:mm plus a bar; turns red under 60.
- `audio`:
  - `sfx(name)`, where name ∈ `click`, `ok`, `no`, `pour`, `bubbles(on:boolean)`, `pop`, `blast`, `foam`, `sizzle`, `boil`, `alarm`, `whoosh`. Synthesized with WebAudio.
  - `say(id)` → Promise. Plays `assets/voice/<id>.mp3` if it exists; otherwise only shows the subtitle, for (word count × 380 ms).
- `script.js`: `LINES: Record<string, {speaker:'robi'|'commander'|'azoulay', text:string}>`. One line per beat of chapters 1–4 and the end; ids are prefixed `c1_`, `c2_`, `c3_`, `c4_`, `end_`, and failure lines are `fail_<FailId>`. Each line is short, funny and accurate, and every failure line explains the science in one sentence.

- [ ] **Step 1: Write failing tests:**
  - Every `LINES` text has ≤ 15 words.
  - A `fail_<id>` exists for every FailId in Task 3.
  - No text contains `מת` or `מתים` as a word, when describing the enzyme.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL. Write `script.js` and run again. Expected: PASS.
- [ ] **Step 3:** Implement `ui3d` and `audio`. Add an e2e test that shows a card, a subtitle and the meter, takes a screenshot, and checks the Hebrew renders RTL and is legible.
- [ ] **Step 4:** Commit: `feat: 3D UI, subtitles, O2 meter, audio, script`.

### Task 9: Apparatus behaviour and failure FX

**Files:**
- Create: `src/lab/apparatus.js`, `src/lab/robi.js`

**Interfaces:**
- `createApparatus(ctx)` → an object with:
  - `setBath(target)`: the thermometer column eases to target over 4 s; returns a Promise.
  - `fillCylinder()`, `pour(bottle)`, `addYeast()`, `stir()`, `setStopper(kind)`: each animates the prop along a short arc and returns a Promise.
  - `runTrial(volume, seconds=6)`: bubbles in the flask and the tube; the cylinder gas column grows to `volume`.
  - `readTarget()`: a selectable meniscus band on the cylinder, ticks every 1 ml, labels every 10 ml.
  - `reset()`
  - `fx[FailId]()` → Promise:
    - `splash`: red vignette + blur overlay for 1.5 s.
    - `sealedBlast`: the stopper launches to the ceiling, foam burst, camera shake.
    - `elephantToothpaste`: a foam column rises about 1.2 m and spills across the bench (instanced spheres or a metaball mesh).
    - `acidMelt`: hissing; the bench texture darkens with a decal and sags locally via vertex displacement.
    - `boil`: rolling bubbles in the bath, steam particles.
    - `cylinderNotFilled`: the gas mixes with the air already inside, and a "?" appears on the scale.
  - Glass: `MeshPhysicalMaterial` is not allowed (cost on Quest). Use `MeshStandardMaterial`, transparent, with an env map, `depthWrite:false`, and sorted render order.
- `createRobi(ctx)` → `{moveTo(anchorName):Promise, face(expr:'happy'|'think'|'oops'|'wow'), gesture('point'|'wave'|'shrug'), idle()}`.

- [ ] **Step 1:** Implement both. Add a test-mode route `/?test&fx=<FailId>` that plays one FX at the bench.
- [ ] **Step 2:** Extend the e2e test: for each FailId, open the fx route, wait for its Promise, and screenshot. Read each screenshot and check the effect reads clearly and is fun.
- [ ] **Step 3:** Commit: `feat: apparatus animation and failure effects`.

### Task 10: Chapter 1 — hypothesis and variables

**Files:**
- Create: `src/chapters/ch1_hypothesis.js`
- Modify: `src/main.js` (chapter runner)

**Interfaces:**
- Every chapter is `export async function run(ctx)`, with `ctx = {engine, input, loco, ui, audio, game, lab, app, robi, auto:boolean}`. When `ctx.auto` is set, the chapter self-selects the correct answers after 300 ms each.
- `main.js` runs `game.setChapter(id)` and then `await chapters[id].run(ctx)` for each id in `CHAPTERS`. On `'gameover'` it shows a minimal Game Over panel ("החמצן אזל") with a "חזרה לנקודת השמירה" button that calls `restoreCheckpoint()` and re-runs the chapter. The full Game Over cutscene is Plan 2.

- [ ] **Step 1:** Implement the chapter:
  - Robi greets and teaches teleport and select. One `say` per beat.
  - Hypothesis: three graph cards (`rise`, `peak`, `flat`) are drawn on canvas on `A_hypBoard`. The selected card is stored in `game.s.hypothesis`. There is no right or wrong.
  - Variable sort: five icon cards (thermometer, cylinder, bottle, spoon, timer) and three bins (משנים / מודדים / קבוע).
    - Expected placement: thermometer → משנים; cylinder → מודדים; bottle, spoon and timer → קבוע.
    - A wrong placement makes the bin shake and plays a one-line hint, then lets the student retry.
    - The first-try success is kept in `game.s.flags.varsFirstTry`.
- [ ] **Step 2:** e2e test `chapter 1 auto`: runs with `?test&auto&only=hypothesis` and asserts `game.s.hypothesis` is set and the chapter resolves.
- [ ] **Step 3:** Commit: `feat: chapter 1 hypothesis and variables`.

### Task 11: Chapter 2 — safety and three hands-on trials

**Files:**
- Create: `src/chapters/ch2_bench.js`

**Interfaces:**
- Consumes: `createProcedure` (Task 3) and `createApparatus` (Task 9).
- Flow:
  - Teleport to `ST_entry`; the goggle rack glows (only in hint level `'full'`).
  - Teleport to `ST_bench`.
  - Three iterations with `trialIndex` 0, 1, 2. Each selectable prop maps to a procedure action; the dial offers six temperature chips (20, 30, 37, 45, 60, 90). The procedure result drives the apparatus animation and FX.
  - On `fail`: play `fx`, then `say('fail_'+id)`, then reset as the rule requires.
  - On `done`: the student reads the volume on the meniscus band.
  - After trial 1, Robi touches the flask: "חם קצת! הפירוק משחרר אנרגיה" (spec §3 exothermic bonus, one line).
  - After trial 3, the three volumes appear as dots, and their mean as a line, on a small floating chart.
  - Robi says the "why three repeats" line.
- In auto mode the chapter takes the happy path, and with `&autofail=<FailId>` it injects one failure on trial 1.

- [ ] **Step 1:** Implement the chapter.
- [ ] **Step 2:** e2e tests:
  - `?test&auto&only=bench` ends with 3 valid trials at 37 and o2 = 315.
  - `&autofail=sealedBlast` ends with o2 = 300 and 3 valid trials.
  - `&autofail=acidMelt` shows the Game Over panel; clicking restore brings the chapter back with o2 at the checkpoint value.
- [ ] **Step 3:** Commit: `feat: chapter 2 hands-on trials with failures`.

### Task 12: Chapter 3 — plan + robot runs + graph wall

**Files:**
- Create: `src/chapters/ch3_robot.js`, `src/ui/graphWall.js`

**Interfaces:**
- `createGraphWall(anchor, game)` → `{update(), highlight(temp, index), pickMode(on, onPick(temp))}`
  - A table (temperature rows × 3 trials + mean) next to a scatter plot: each dot is one trial, invalid dots are crossed out, and a bold line connects the means.
  - It redraws on the game's `'trial'` event.
- Flow:
  - Teleport to `ST_robot`.
  - A slider panel 5–70 (step 5) with the 37 token locked. The student places 4–6 more tokens; `planFeedback` drives the panel's "complaint" text and glow; "הפעלה" is enabled only when `ok`.
  - Robi runs 3 trials per planned temperature at ×8 speed on `A_robotBench` (reusing the apparatus visuals as a second instance).
  - About 1 in 3 readings goes to the student (meniscus pick); the rest are auto.
  - The model injects exactly one outlier: one robot trial at a random planned temperature uses `mixed:false` and gets `reason:'unmixed'` in hidden metadata.
  - O₂ spends per trial. On Game Over, the checkpoint is restored (Review Focus 4).

- [ ] **Step 1:** Implement both files.
- [ ] **Step 2:** e2e tests:
  - `?test&auto&only=robot` with the auto plan `[20,30,37,45,55,65]` ends with 18 trials, exactly one of them unmixed.
  - A forced low-o2 run (`&o2=40`) triggers Game Over in the middle of the run and restores.
  - Screenshot of the graph wall; read it and check it is legible from the station.
- [ ] **Step 3:** Commit: `feat: chapter 3 plan, robot runs, live graph`.

### Task 13: Chapter 4 — outlier, peak, enzyme zoom

**Files:**
- Create: `src/chapters/ch4_graph.js`, `src/fx/enzymeZoom.js`

**Interfaces:**
- Flow:
  - `findOutliers` drives `graphWall.highlight` on the outlier dot.
  - Three cause cards: "לא ערבבו" (correct), "דליפה", "רעש רגיל". A correct first pick → badge `detective`.
  - Then two disqualify buttons ("לפסול" is correct, "להשאיר"). Keeping the outlier visibly bends the mean line.
  - Peak pick: `pickMode` on the graph. Correct = the student's `bestTemp` ±5 °C.
- `playEnzymeZoom(ctx)` → `Promise<boolean>`:
  - Fade out the lab and fade in a dark cell-interior space (procedural: soft fog, floating organelle blobs).
  - Catalase: a large four-lobed protein mesh (merged noise-displaced spheres) with a glowing pocket.
  - H₂O₂: instanced ball-and-stick molecules drift in. A "fit" event triggers when one reaches the pocket: it splits into 2 H₂O and a bubble of O₂ that rises and pops.
  - A temperature gauge drives the phases (cold 15 → warm 40 → hot 60):
    - Molecular speed scales with temperature.
    - At 60 the protein vertices are lerp-displaced toward an "unfolded" target (an elongated ribbon), the pocket glow fades, and molecules bounce off.
    - Subtitle: "החום לא הורג את האנזים. הוא משנה את הצורה שלו. בלי הצורה, אין התאמה."
  - At the end, three mini-animation cards explain the graph; one is correct. The Promise resolves with whether the first pick was correct.
  - Budget: ≤ 40 draw calls in the scene.
- On return: badge `scienceSense` if the hypothesis was `'peak'`.

- [ ] **Step 1:** Implement both files.
- [ ] **Step 2:** e2e test `?test&auto&only=graph`: the outlier is disqualified, the peak pick is correct, the enzyme zoom resolves `true`. Take screenshots at cold, warm and hot; read them and check the unfolding reads clearly.
- [ ] **Step 3:** Commit: `feat: chapter 4 analysis and enzyme zoom`.

### Task 14: End screen, full run, performance, ship (Milestone 2)

**Files:**
- Create: `src/chapters/ch_end.js`
- Modify: `tests/e2e/play.spec.js`

- [ ] **Step 1:** End chapter:
  - Hypothesis card side-by-side with the real graph.
  - Score counts up, with 1–3 stars and a badge row.
  - "משימה חדשה עם נתונים חדשים" (new seed) and "מהתחלה" buttons.
  - Badges in this plan: `scientistHands` (no bench mistakes), `preciseReader` (all student reads right first try), `detective`, `scienceSense`, `o2Keepers` (o2 ≥ 90).
- [ ] **Step 2:** e2e test `full auto run`: plays `/?test&auto` from boot to end. Asserts `stars ≥ 2`, no console errors and no page errors, and that draw calls and tris stay within budget at every chapter. Takes one screenshot per chapter.
- [ ] **Step 3:** Run `npm test && npm run e2e`. Expected: all pass. Read the per-chapter screenshots as a last visual QA.
- [ ] **Step 4:** Commit: `feat: end screen and full playable core`.
- [ ] **Step 5 (user gate):** Ask the user to approve pushing to GitHub Pages. After approval, push and send the URL for a seated Quest 3 playtest of the whole core. Collect feedback for Plan 2.
