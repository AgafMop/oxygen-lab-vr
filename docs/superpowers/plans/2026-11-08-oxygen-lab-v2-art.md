# Oxygen Lab v2 — Art (Plan 5) + link preview & favicon

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Lab equipment and liquids look like glass and liquid, the crew look like real suited people (Azoulay reads as a woman by body shape), the hologram commander looks like a hologram, the room is richer and better lit — within the Quest 3 budget; then a link preview and a lab favicon.

**Architecture:** Runtime materials (glass fresnel via `onBeforeCompile`, liquid meniscus, foam texture, hologram ShaderMaterial) in `src/lab/looks.js`; Blender rebuilds for the crew (`build_crew.py --variant female`) and lab detail/bake; screenshots + the draw-call/triangle budget test as the gate.

**Spec:** `docs/specs/2026-11-08-oxygen-lab-v2-design.md` §8, §9.1.

## Global Constraints
- Budget per chapter (existing `__budget` test): ≤ 150 draw calls, ≤ 400 k triangles; assets total ≤ 25 MB; no transmission/refraction passes.
- Azoulay: woman by body shape only — narrower shoulders, defined waist, hip proportions; no skirt/props.
- Hologram flicker obeys the existing safe-flicker limits (≤ 3 flashes/s, ≤ 35 % deep).
- Favicon: an Erlenmeyer flask (SVG + 180 px PNG). Link preview: `og:title`, `og:description`, `og:image` (1200×630 game screenshot, absolute URL), `twitter:card=summary_large_image`, Hebrew title/description.

## Review Focus
1. Glass shader on Quest: no extra passes; transparent sorting of liquid inside glass stays correct (liquid visible through the flask from the student's seat).
2. Female figure rig: the same `C_*` pivots so `createFigure` gestures/walk work unchanged.
3. Lightmap rebake keeps UV1 and the `LAB_static` naming the loader expects.
4. og:image URL absolute and reachable from GitHub Pages (`/oxygen-lab-vr/` base path).

---

### Task 1: Glass, liquids, foam (runtime looks)
**Files:** Create `src/lab/looks.js`; Modify `src/lab/labScene.js`, `src/lab/apparatus.js`
- [ ] Glass: env-reflective, fresnel-rim, slight tint, thickness darkening on edges (onBeforeCompile on MeshStandardMaterial); applied to every `glass`-tagged mesh.
- [ ] Liquids: meniscus (curved top disc), soft gradient by depth, gentle surface wobble when the vessel moves; flask liquid colour by state (peroxide / yeast cloudy).
- [ ] Foam: canvas bubble texture on `foamTop`, bubble sprites with highlights.
- [ ] Gate: screenshots (bench close-up) + budget test (`full auto run` budget or per-chapter `__budget`) — PASS. Commit.

### Task 2: Crew rebuild + Azoulay's body shape + hologram shader
**Files:** `blender/build_crew.py` (smoother suit, bevelled boots/gloves, reflective visor, `--variant female`), `tools/optimize.mjs` run → `assets/crew.glb` with two roots (`C_root` male-proportioned commander, `CF_root` female Azoulay) or `assets/crew_f.glb`; `src/lab/crew.js` (`createFigure(ctx, { female })`), chapters creating Azoulay pass `female: true`; hologram `ShaderMaterial` (scanlines, fresnel, slow safe shimmer).
- [ ] Blender build + preview renders for both variants → inspect.
- [ ] e2e: chapter 3 Azoulay scene + chapter 5 + intro (in-engine) run clean; tour screenshots show the figures; motion audit still clean. Commit.

### Task 3: Room — detail and a better bake
**Files:** `blender/build_lab.py` (vents, cable trays, floor stripes, ceiling light fixtures, window frame bevel, normal-mapped PBR panels), bake with more samples + denoise; `assets/lab.glb`, `assets/lab_lightmap.webp`.
- [ ] Rebuild + bake (CPU; run in background) → optimize → screenshots of every station.
- [ ] Budget test + all-chapter e2e groups. Commit.

### Task 4: Link preview + favicon
**Files:** `index.html`, `assets/favicon.svg`, `assets/favicon-180.png`, `assets/og.jpg`
- [ ] og.jpg from a polished in-game screenshot (1200×630) with the title; meta tags; favicon links.
- [ ] Verify the live HTML head and that the og image URL returns 200. Commit, push.
