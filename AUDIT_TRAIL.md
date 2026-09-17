# V12SonicDesign Studio — Audit Trail

**Date:** 2026-09-14  
**Scope:** full source audit of `C:\Users\Ron Dixon\Desktop\SONIC DESIGN STUDIO` (46 source files), followed by fixes and enhancements.  
**Verification:** `tsc --noEmit` = 0 errors (with real React types installed), `vite build` clean, 34/34 headless-browser smoke checks passing (Chromium via Playwright), 0 console errors.

Note: the GitHub repo (`PapiSlimm/V12-SonicDesign`, commit `177ba5f`) is an *older* snapshot than the desktop folder — it lacks 10 components (LayerTreeItem, VectorCanvas, ParticleCanvas, AutoSave, etc.). The desktop folder was treated as the source of truth; all fixed files are meant to be committed on top of it.

---

## Part 1 — Bugs found and fixed

### Build / tooling

| # | Issue | Fix |
|---|---|---|
| B1 | `@types/react` / `@types/react-dom` were not installed, so TypeScript treated all of React as `any`. `npm run lint` passed while **6 real type errors** were hidden (invalid props on Lucide icons and SVG `<circle>`, a `string === boolean` comparison, a `MouseEvent` passed as a layer id). | Added the type packages; fixed every surfaced error. `tsc --noEmit` now genuinely validates the codebase. |
| B2 | Runtime `dependencies` contained build tools and unused server packages (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`, `express`, `dotenv`, `lodash`, `tsx`). | Moved build tools to `devDependencies`, removed unused packages. Bundle is now code-split (react / genai / ui / app chunks) instead of one 950 KB file. |
| B3 | `@` alias pointed to the project root instead of `src`. | Alias now resolves to `./src` in both `vite.config.ts` and `tsconfig.json`. |
| B4 | `index.html` was titled "My Google AI Studio App"; none of the fonts offered in the UI (Space Grotesk, Montserrat, Playfair, Outfit, JetBrains Mono, …) were loaded, so every text layer fell back to the system font. | Proper title/meta; Google Fonts loaded for all offered families; page-level scrollbar/overscroll styling. |
| B5 | `clean` script used `rm -rf` (fails on Windows Command Prompt). | Uses `rimraf`. `build` now type-checks first. |

### State store (`src/store/index.ts`)

| # | Issue | Fix |
|---|---|---|
| S1 | History started empty (`historyIndex = -1`) and `undo` required `historyIndex > 0`, so **the first edit could never be undone**. | Initial project state is recorded as history entry 0; undo/redo/jump all work from the first edit. |
| S2 | Every history snapshot `structuredClone`d full-resolution `ImageBitmap`s (8 MB each). 50 snapshots could reach 400 MB. | `snapshotLayers()` deep-clones layer data but shares immutable bitmap references (each brush stroke creates a new bitmap anyway). Cap lowered to 40. |
| S3 | `addKeyframe` mutated keyframe arrays/objects in place, corrupting history snapshots and skipping re-renders. | Fully immutable upserts. |
| S4 | `deleteLayer` left `selectedLayerId` pointing at a deleted layer (Properties panel then crashed on `currentLayer.transform`), left dangling `maskId`s, and orphaned group children. | Deletion cleans selection, solo state, mask references and group children (recursively for folders). |
| S5 | `moveLayerToGroup` never removed the layer from its previous group's `children`; groups could be moved into themselves. | Fixed both. |
| S6 | `toggleGroupVisibility/Lock` only affected direct children. | Recursive via `collectDescendants`. |
| S7 | `selectedLayerId` and `selectedLayerIds` drifted out of sync (most actions set only one). | Single `selectLayer(id, additive)` action; all setters keep both fields consistent. |
| S8 | `groupLayers` inserted the new group at index 0 (bottom of the stack), changing stacking order. | Group is inserted at the position of the top-most selected layer. |
| S9 | `updateKeyframeTime` re-sorted keyframes and recorded a history entry on **every mouse-move** while dragging (dozens of undo steps per drag, and the dragged index silently pointed at a different keyframe after crossing another). | Returns the keyframe's new index; drag uses a history transaction and commits once on release. |
| S10 | Layer ids used `Date.now()` only — two layers created in the same millisecond collided. | Collision-free `uid()`. |
| S11 | `duration` and `currentTime` were never validated (NaN/0 possible → `% duration` produced NaN time). | Clamped setters. |
| S12 | History transactions never recorded anything if only `updateLayer` (non-recording) calls happened inside them. | `updateLayer` marks the transaction dirty; `endHistoryTransaction` records one labelled step. |

### Canvas (`src/components/Canvas.tsx`)

| # | Issue | Fix |
|---|---|---|
| C1 | **Transform gizmo was mis-positioned** at any zoom other than 100%: `left: (x + pan.x) * zoom` instead of `x * zoom + pan.x`. | All overlays use one consistent doc→screen mapping. The world container is now explicitly anchored at `left:0; top:0` (it was an un-positioned absolute child of a flex-centered parent, so its origin depended on layout). |
| C2 | Pointer coordinates were derived from the **selected layer's canvas element**, which does not exist when a text/shape/vector layer is selected — moving those layers produced `{0,0}` coordinates. | Coordinates come from the fixed 1920×1080 world element. |
| C3 | Each layer `<canvas>` was re-mounted when the selection changed, but only the very first one was ever sized (init effect ran once) — subsequent canvases were the default 300×150, so **brush painting broke after switching layers**. | Per-layer canvases are sized from their bitmap via a callback ref and redrawn when processed pixels change. |
| C4 | Brush colour was hard-coded to black; the store's `brushColor` and the colour picker were ignored. | Uses `brushColor` + opacity; eraser uses `destination-out`. Painting on a non-raster layer auto-creates a paint layer; locked layers refuse strokes. |
| C5 | Ctrl+wheel zoom called `preventDefault()` in a React (passive) wheel handler — the browser zoomed the whole page. | Native non-passive wheel listener; zoom is smooth/exponential and anchored under the cursor. |
| C6 | `ChromaKeyProcessor` re-ran its full 1920×1080 `getImageData` pass on **every render** (its `onProcessed` callback and default-settings object were recreated each render → effect → `setState` → render → …). | Processor is memoised on bitmap identity + a stable settings key; callback via ref. Verified: enabling chroma key leaves frame time at ~1 ms. |
| C7 | Mask `url(canvas.toDataURL())` was recomputed on every render for every masked layer. | Cached per processed canvas, only for layers actually used as masks. |
| C8 | Cloner rendered every clone with the same React `key` (duplicate-key warnings, broken reconciliation). Grid mode was not implemented. | Unique keys; linear / radial / grid all implemented. |
| C9 | Text layers were laid out as full-document (100% × 100%) flex boxes, so the visual text sat at `(x+960, y+540)` while the gizmo and export assumed `(x, y)`. | Text boxes are content-sized (`max-content`, `pre`), measured with `measureText` for gizmo/hit-testing; transform-origin is top-left everywhere so DOM, gizmo and export agree. |
| C10 | Layer size for the gizmo/smart guides was hard-coded (300×200 for rasters, `textLen × 0.55em` for text). | `getLayerBox()` returns real dimensions (bitmap size, measured text, vector bounds, shape size). |
| C11 | Text tool added a new layer on every click and never left the tool. | Adds one layer, switches to Move and opens Properties. |
| C12 | Locked layers could still be moved/scaled from the canvas. | Locked layers show a dashed, non-interactive gizmo and are skipped by hit-testing. |
| C13 | Text-animator used `Date.now()` — non-deterministic and different in export. | Driven by timeline time. |
| C14 | `onMouseLeave` fired `handleMouseUp` on every leave, even when nothing was in progress. | Only finalises in-progress interactions. |

### Timeline / animation

| # | Issue | Fix |
|---|---|---|
| T1 | `useAnimationEngine` compared `null !== undefined` on the first frame, so the first play **jumped the playhead** by (page uptime ÷ duration). It also re-registered the RAF loop on every frame. | Rewritten: single RAF loop per play session, ref-based state, long frames clamped (tab switch), loops cleanly. |
| T2 | The "Typewriter" preset animated `opacity` but the evaluator only wrote into `transform.*`, so it did nothing. | Evaluator handles `opacity`, `motionPathProgress` and vector `pathProgress` tracks in addition to transform props. |
| T3 | `snap` easing switched at 50 % instead of holding until the next keyframe. | Holds until the next keyframe (Hold behaviour). |
| T4 | Audio elements were never disposed when a layer was deleted; played on after removal. | Disposed on layer removal and unmount; playback rate follows speed; timeline duration auto-extends to fit imported audio. |
| T5 | GraphEditor called `useEffect` **after** an early `return` (conditional hook → React crash when a layer without animations was selected after one with). Axes were hard-coded to 60 s / 0-1000 and keyframes were mutated in place. | Hooks are unconditional; axes auto-fit to duration and value range; curves are sampled from the real evaluator; values and bezier handles are draggable with immutable updates and single undo steps. |
| T6 | Timeline ruler drew one tick per second regardless of duration (60+ overlapping labels). | Adaptive tick spacing. |

### Sidebar / panels

| # | Issue | Fix |
|---|---|---|
| P1 | Delete button passed the click event as the layer id (`onClick={deleteLayer}`) — it never deleted anything. | Deletes the selected layer(s). |
| P2 | Properties tab crashed if the selected id no longer existed. | Guarded; friendly empty state. |
| P3 | Numeric inputs pushed `NaN` into the store while typing (layer vanished). | `safeNumber()` guards everywhere. |
| P4 | Plain text layers had **no way to edit their content**; 3D-text animation preset buttons had no `onClick`; weight could not be changed for 2D text. | Content textarea, weight selector, working preset buttons. |
| P5 | Redo button logic was `historyIndex >= 50 \|\| historyIndex === -1`. History list showed "State Change N". | Correct enable/disable; labelled history entries you can click to jump to. |
| P6 | Layer Styles modal synced from a stale closure (edits lagged one step). | Modal reads the live layer from the store; closing records one undo step. |
| P7 | Curves editor drew its path with `%` units inside an SVG `d` attribute (invalid — a console error on every render, curve never visible) and **curves were never applied to pixels**. | Proper viewBox; the drawn curve is the exact monotone spline the pixel processor applies; per-channel reset + right-click to delete a point. |
| P8 | Layer tree lock icons carried an invalid `title` prop; popover menus never closed on outside click. | Proper buttons; outside-click closes menus; hidden layers dimmed. |
| P9 | `?` shortcut handler required `!e.shiftKey` — but `?` is Shift+/ so it never fired. Many listed shortcuts (G, I, Z, C, L, Shift+T, Shift+P, `.`/`,`, Home/End, Ctrl+G/D/E, Esc, Space) were not implemented. | All listed shortcuts implemented and the reference updated to match reality (see below). |
| P10 | Space-bar temporary Hand tool stored `previousTool` in an effect-local variable that reset when the tool changed — releasing Space left you stuck on Hand. | Ref-based; tap Space = play/pause, hold+drag = pan. |
| P11 | Whole components subscribed to the entire store (`useStore()` with no selector), so the 60 fps playhead re-rendered the 1500-line Sidebar, MenuBar, etc. every frame. | Slice selectors / `useShallow` throughout. |
| P12 | Menus opened on hover only (unusable on touchpads, closed while moving to items). Most menu items did nothing (New, Open, Undo, Redo, Merge Visible, Window tabs, Typography, AI Sky/Enhance…). | Click-to-open menus with shortcut hints; every item wired (see Part 2). |
| P13 | Status bar showed fake values ("Doc: 5.93M / 12.4M"). | Real layer count, fps/duration, pixel memory, history position and a live status message. |

### Export / AI / files

| # | Issue | Fix |
|---|---|---|
| E1 | Export rendered **placeholders** (blue rectangles for images, shapes offset by +100 px, unweighted text) — output never matched the canvas — and "PNG Sequence" downloaded a single frame. | New shared compositor (`RenderEngine.renderComposite`) used by export, AI, eyedropper and Merge Visible. Sequences are zipped (dependency-free ZIP writer); WebM video via MediaRecorder; resolution presets; cancel button. |
| E2 | `aiService` read `response.candidates[0]` unchecked, ignored the abort signal, used a non-existent model name for keyframes, and `JSON.parse`d model output straight into the store. | Guarded parsing, abort support, model output validated/clamped per property, clear error when no key is configured (previously silent failure). Reads `VITE_GEMINI_API_KEY` (standard) with `GEMINI_API_KEY` fallback. |
| E3 | Import only accepted one image; oversized images were placed at native size; `createImageBitmap` on `<img>` could fail for some formats. | Multi-file import, drag-and-drop onto the canvas, automatic fit-to-document, robust decoding. |
| E4 | Auto-save used `localStorage` (≈5 MB cap) and stripped every bitmap, so "recovery" restored empty image layers; the prompt appeared on every launch and claimed an "unexpected close". | IndexedDB auto-save with embedded PNGs, change-detection (no redundant writes), clean-exit marker so the prompt appears only after a real crash/close-without-save. |
| E5 | No way to save or reopen a project. | `.v12proj.json` save/open (Ctrl+S / Ctrl+O) with images embedded; unsaved-changes guard on tab close; project name in the menu bar. |

### Vector paths

| # | Issue | Fix |
|---|---|---|
| V1 | Stroke-progress animation assumed a path length of 2000 units — longer paths showed gaps, shorter ones ignored progress. | `pathLength="1"` normalisation (SVG) and a length estimate in the canvas compositor. |
| V2 | Anchor points and bezier handles could not be moved; `onUpdatePath` was never called. | Drag anchors/handles (mirrored tangents, Alt breaks the tangent), Alt+click toggles curve handles, double-click deletes an anchor, click the first anchor to close. |

---

## Part 2 — Enhancements implemented

- **Direct manipulation:** click to select on the canvas (hover outline, Shift+click multi-select, double-click → Properties), arrow-key nudging (Shift = 10 px), Shift-constrained drags, Alt bypasses snapping, real edge/corner scale handles based on actual layer size, Fit-to-screen (Shift+0).
- **Tools that previously did nothing now work:** Lasso (freehand pixel selection), Gradient (linear/radial/conic fill, respects selection), Zoom (click / Alt+click), Crop (crops the selected image layer), Motion Path (draw and assign to the selected layer, animatable progress), Text Animator tool, Eyedropper (Alt+click applies to layer).
- **Pixel selections** (marquee/lasso) now constrain brush strokes and gradient fills; Esc deselects.
- **Image processing:** per-channel curves with monotone-cubic LUTs and chroma key edge feathering are applied to layer pixels in real time.
- **Animation:** keyframes for opacity, motion-path progress and stroke-draw progress; Ctrl+K keyframes transform + opacity; right-click keyframe to delete, double-click for easing; frame stepping; adjustable duration, fps and playback speed; "Dynamic Layout" preset; wiggle/noise toggle with amplitude/speed; graph editor value dragging.
- **Layers:** duplicate (Ctrl+D), merge visible, remove mask, cloner grid mode, text/vector/cloner quick-add buttons, hidden-layer dimming.
- **Project I/O:** save/open project files, IndexedDB crash recovery with images, drag-and-drop import, PNG/JPG frame export, zipped sequences, WebM video.
- **UX:** click menus with shortcut hints, complete and accurate shortcut reference, live status bar messages for every tool, status-bar AI cancel button, unsaved-changes indicator and `beforeunload` guard, all UI fonts loaded.
- **Performance:** slice-based store subscriptions, memoised pixel processing, cached mask URLs, shared bitmap references in history, code-split bundle.

---

## Part 3 — Files changed

New: `src/core/layers/layerUtils.ts`, `src/core/rendering/layerProcessor.ts`, `src/core/rendering/vectorPath.ts`, `src/services/autosave.ts`, `src/utils/zip.ts`, `AUDIT_TRAIL.md`.

Rewritten: `src/store/index.ts`, `src/components/Canvas.tsx`, `src/components/ExportModal.tsx`, `src/components/GraphEditor.tsx`, `src/components/VectorCanvas.tsx`, `src/components/ChromaKeyProcessor.tsx`, `src/components/AutoSaveRecoveryBanner.tsx`, `src/core/rendering/RenderEngine.ts`, `src/hooks/useAnimationEngine.ts`, `src/hooks/useDerivedLayers.ts`, `src/services/aiService.ts`, `src/services/fileService.ts`, `src/App.tsx`, `README.md`, `index.html`, `vite.config.ts`, `package.json`, `.env.example`.

Edited: `src/components/Sidebar.tsx`, `Timeline.tsx`, `MenuBar.tsx`, `OptionsBar.tsx`, `Toolbar.tsx`, `LayerTreeItem.tsx`, `KeyboardShortcutsModal.tsx`, `CurvesEditor.tsx`, `LayerRenderer.tsx` (dead code, type fix only), `src/core/layers/LayerFactory.ts`, `tsconfig.json`, `package-lock.json`.

Unchanged: `AdvancedColorPicker.tsx`, `AIModal.tsx`, `BlendModeDropdown.tsx`, `EasingEditorModal.tsx`, `HelpModal.tsx`, `LayerStylesModal.tsx`, `LayerThumbnail.tsx`, `ParticleCanvas.tsx`, `core/types.ts`, `core/history/CommandHistory.ts` (unused), `hooks/useProceduralAnimation.ts` (unused), `utils/colorUtils.ts`, `main.tsx`, `index.css`, `metadata.json`.

---

## Part 4 — Verification log

```
npx tsc --noEmit            → 0 errors
npx vite build              → OK (react 3.9 KB · ui 141 KB · genai 281 KB · app 517 KB, gzip 147 KB)
Playwright smoke pass 1     → 21/21 (select/drag/undo/redo, text tool + edit, keyframes, playback,
                              brush, single-frame + PNG-sequence export, graph editor, save, shortcuts)
Playwright smoke pass 2     → 13/13 (pen tool + close + anchor drag, gradient fill, eyedropper,
                              motion path, grouping, duplicate, ctrl+wheel zoom, history labels,
                              chroma-key performance, zero console errors)
```

## Known limitations / next steps

- AI features require `VITE_GEMINI_API_KEY` in `.env.local`; keys in a browser bundle are visible to users — proxy through a backend for public deployment.
- WebM export records in real time (no audio); PNG sequences are the lossless path.
- Masks in the DOM canvas follow the mask layer's position but not its rotation/scale (the exporter handles full transforms).
- Adjustment layers use `backdrop-filter`, which Firefox applies slightly differently than Chromium.
