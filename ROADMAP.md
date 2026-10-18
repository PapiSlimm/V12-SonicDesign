# V12SonicDesign Studio — Revenue Roadmap ($1M ARR target)

Target math: $1M/yr = 2,100 Pro users @ $39/mo, or 850 Studio teams @ $99/mo, or a mix.
Rule: every item below is shipped by the daily build agent, verified (tsc + build + Playwright), pushed to `main`, auto-deployed by Render. One item per run. Check the box when merged.

## Phase 1 — Make it sellable (weeks 1–4)
- [ ] P1-01 Auth: email + Google sign-in (Supabase Auth), user menu, session persistence
- [ ] P1-02 Cloud projects: save/open/list projects in Supabase (Postgres + Storage for bitmaps), replaces local-only save
- [ ] P1-03 Plans + Stripe Checkout: Free / Pro $39 / Studio $99, customer portal, webhook → `plan` on user
- [ ] P1-04 Entitlements: Free = watermark on export, 720p, 3 projects; Pro = no watermark, 4K, unlimited; Studio = team seats
- [x] P1-05 Server-side AI proxy — shipped 2026-10-18 as the media service `/ai` route (Gemini key server-side, model allow-list, rate-limited); AI credits metered per plan still pending P1-03/P1-04
- [ ] P1-06 Landing page + pricing page + onboarding (first-run tour, sample project), SEO meta, OG image
- [ ] P1-07 Analytics + error tracking (PostHog + Sentry) so growth is measurable
- [ ] P1-08 Legal: Terms, Privacy, refund policy pages; cookie banner

## Phase 2 — Make it sticky (weeks 5–8)
- [ ] P2-01 Template gallery (20 launch templates: social ads, lower-thirds, logo stings, YouTube intros) — "start from template"
- [ ] P2-02 Share link (view-only render + remix), public project pages
- [x] P2-03 MP4 export via server render worker (FFmpeg H.264/AAC, audio muxed) — shipped 2026-10-08; generalised into the shared V12 media service `v12-media/` (encode + HLS/DASH streaming + audio mastering + analysis + visualizer, DB-backed queue for SonicDesign/SonicWave/SonicStream/SonicVisual/GameWorld) — shipped 2026-10-12
- [ ] P2-04 Brand Kit: fonts, colors, logos per workspace (Studio plan)
- [ ] P2-05 Asset library: stock images (Unsplash/Pexels API), icons, sound FX
- [x] P2-06 Audio-reactive visualizer layers (WebGL2, 5 styles) + Audio → Keyframes baking (beat/loudness/bands) — shipped 2026-10-08
- [ ] P2-07 Video layers (MP4/WebM as a layer with trim, speed, chroma key)
- [ ] P2-08 Keyboard-first UX polish + performance pass (60fps with 20+ layers)

## Phase 3 — Make it grow (weeks 9–12)
- [ ] P3-01 Template marketplace: creators sell templates, 70/30 split (Stripe Connect)
- [ ] P3-02 Referral program (give 1 month / get 1 month)
- [ ] P3-03 Public API + Zapier connector (auto-generate social videos from a sheet)
- [ ] P3-04 Teams: workspaces, roles, comments on canvas, version history
- [ ] P3-05 Integrations: SonicStream / SonicWave hand-off (audio → visualizer video in one click)
- [ ] P3-06 Programmatic SEO pages: "free {template} maker" × 200 keywords
- [ ] P3-07 Affiliate program for YouTube creators (30% recurring)

## Non-code (owner)
- Domain + brand (sonicdesign.studio), Stripe account live mode, Supabase project, PostHog/Sentry accounts
- Weekly: 3 short demo videos (TikTok/YouTube Shorts), 1 template drop
- Pricing test at week 6: $29 vs $39 Pro

## Definition of done (every item)
1. `npm run typecheck` = 0 errors, `npm run build` passes
2. Playwright smoke passes (`tests/smoke.mjs`), no console errors
3. Feature documented in `CHANGELOG.md`, box checked here
4. Pushed to `main`; Render deploy green
