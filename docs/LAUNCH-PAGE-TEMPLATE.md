# Launch page template — `/launch/` (public/launch/index.html)

The page is the flyer, section for section. Same order, same proportions, same copy. Live at `https://v12-sonicdesign-studio.onrender.com/launch/` after deploy (the Vite build copies `public/` as-is).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1 HEADER      [V12 SONIC DESIGN STUDIO logo]            PROFESSIONAL-GRADE    │
│               MOTION / 3D / EDIT / CREATE               CREATIVE SOFTWARE     │
│                                                         FOR VISIONARIES       │
│                                                         6 capability lines    │
├──────────────────────────────────────────────────────────────────────────────┤
│ 2 HERO        hero.jpg — the flyer composite (headline "TURN IDEAS INTO       │
│               VISUAL MASTERPIECES." + paragraph are part of the art on        │
│               desktop; live text on mobile and for search engines)            │
│               [ LAUNCH THE STUDIO ]  [ SEE WHAT IT DOES ]                     │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────────┤
│ 3 PILLARS    │ 3D           │ ADVANCED     │ CHROMA       │ PROCEDURAL       │
│ MOTION       │ COMPOSITING  │ IMAGE EDITING│ KEYING       │ ANIMATION        │
│ GRAPHICS     │ icon+title+  │              │              │                  │
│ icon+title+  │ 1 sentence   │              │              │                  │
│ 1 sentence   │              │              │              │                  │
├──────────────┴──────────────┴──────┬───────┴──────────────┴──────────────────┤
│ 4 PRO PANEL   tools.jpg screenshot │ PROFESSIONAL TOOLS   │ PRO KEYBOARD      │
│   (soft grey card)                 │ 5 rows icon+name+sub │ SHORTCUTS 7 keys  │
├──────────────┬──────────────┬──────┴───────┬──────────────┬──────────────────┤
│ 5 CARDS      │ NON-         │ BLENDING     │ ADVANCED     │ AI-POWERED       │
│ RASTER-BASED │ DESTRUCTIVE  │ MODES        │ LAYER CONTROL│ FEATURES         │
│ EDITING      │ WORKFLOW     │ thumb+title+ │              │                  │
│ thumb+title+ │              │ 2 lines      │              │                  │
│ 2 lines      │              │              │              │                  │
├──────────────┴──────────────┴──────────────┴──────────────┴──────────────────┤
│ 6 FOOTER      [logo] │ MORE THAN SOFTWARE.            [CREATE. EDIT. ANIMATE.]│
│                      │ IT'S YOUR CREATIVE OS.         [ WITHOUT LIMITS.     ] │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Tokens (from the flyer)

| Token | Value |
|---|---|
| Display type | Barlow Condensed 800/900 italic (V12 mark, headings, stamp); Inter for body |
| Blue | `#1e6cff` (V12 mark gradient `#5db4ff → #1e6cff → #0b3fb8`) |
| Gradient | `#1e6cff → #7c3aed → #e11d8f` (CTA, "IT'S YOUR CREATIVE OS", stamp) |
| Ink / muted | `#0b0f1a` / `#5b6478` |
| Panel card | `#f4f6fb` with `#e3e7f1` border, radius 14 |
| Shadow | `0 18px 50px rgba(20,30,60,.16)` |
| Container | 1180 px, 16 px side gutters |

## Assets (public/launch/)

`hero.jpg` (1024×565, the composite), `tools.jpg` (workspace screenshot), `card1..5.jpg` (bottom thumbnails) — all cropped from the master flyer. Replace any of them with a same-ratio image and nothing else changes.

## Responsive

≤ 980 px: pillars and cards go 2-up, pro panel stacks. ≤ 640 px: hero art hides and the headline/paragraph render as live text; everything 1-up.

## Copy that is marketing-forward (not shipped yet)

3D compositing, colour-grading wheels, render queue, Clone Stamp / Healing Brush, `.cube` LUTs, Object Removal, Style Transfer. Shortcut panel shows the real app keys (V, Z, H, Space, Ctrl+D/E/G).
