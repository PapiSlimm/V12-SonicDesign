# V12SonicDesign Studio

Browser-based motion graphics, compositing and image-editing studio — part of the V12 Creator OS.
Built with React 19, TypeScript, Vite 6, Tailwind 4 and Zustand. AI features use Google Gemini.

## Quick start

```bat
npm install
copy .env.example .env.local     :: then put your Gemini key in VITE_GEMINI_API_KEY (optional)
npm run dev                      :: http://localhost:3000
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run build` | Type-checks, then produces a production bundle in `dist/` |
| `npm run preview` | Serves the production bundle locally (port 4173) |
| `npm run typecheck` | TypeScript check only |

The AI features (Generative Fill, Sky Replacement, Enhance, AI Animator) need a Gemini API key.
Everything else works offline. **A key bundled into a browser app is visible to end users** — for a
public deployment, proxy Gemini calls through a backend instead.

## Features

- **Layers**: raster (paint / import), text, 3D text, text animator, shapes, vector paths, cloner,
  adjustment, group folders, audio tracks. Solo, lock, hide, color tags, masks, blend modes, layer
  styles (drop/inner shadow, glow, stroke, bevel).
- **Canvas tools**: move (click-to-select, smart guides, rotate/scale/skew gizmo), brush, eraser,
  marquee & lasso pixel selections, gradient fill, eyedropper, zoom, crop, pen (bezier anchors with
  draggable handles), text, text animator, motion path, hand. Drag & drop images to import.
- **Animation**: keyframes for position, scale, rotation, opacity, motion-path progress and vector
  stroke progress; timeline with draggable/snapping keyframes; graph editor with bezier handles;
  easing editor; kinetic-typography presets; wiggle/noise; motion blur; onion skinning; audio sync.
- **Image processing**: brightness/contrast/hue/saturation, curves (real per-channel LUTs),
  chroma key with spill suppression and edge feathering.
- **Export**: PNG/JPG image sequences (zipped), WebM video, single-frame snapshots — rendered by the
  same compositor as the canvas, so exports match what you see.
- **Projects**: Save / Open `.v12proj.json` files (images embedded), IndexedDB auto-save with crash
  recovery, unsaved-changes guard, undo/redo history with labels (jump to any step).

Press `?` in the app for the full keyboard-shortcut reference.

## Project layout

```
src/
  App.tsx                      shell, menus, global shortcuts, project I/O
  store/index.ts               Zustand store (layers, selection, history, timeline)
  core/types.ts                data model
  core/layers/                 LayerFactory + layout/measurement helpers
  core/rendering/              RenderEngine (compositor), layerProcessor (curves/chroma key), vectorPath
  hooks/                       animation clock, keyframe evaluation
  components/                  Canvas, Sidebar, Timeline, GraphEditor, modals…
  services/                    fileService (import/save/open), aiService (Gemini), autosave (IndexedDB)
  utils/                       colour helpers, zip writer
```

See `AUDIT_TRAIL.md` for the full list of issues found and fixed in the September 2026 audit.
