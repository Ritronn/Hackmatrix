---
version: alpha
name: Atmos Twin — Environmental Intelligence System
description: A dark, data-serious environmental digital-twin interface — AQI severity as the primary color signal, dense modular cards, and a live map as the visual center.
colors:
  background: "#0B0D10"
  surface: "#14171C"
  surface-elevated: "#1B1F26"
  ink: "#F5F6F7"
  muted: "#8A93A3"
  border: "#242830"
  accent: "#3DD6F5"
  accent-strong: "#1FB8DE"
  error: "#FF4D8D"
  aqi-good: "#4CAF50"
  aqi-satisfactory: "#8BC34A"
  aqi-moderate: "#FFC107"
  aqi-poor: "#FF9800"
  aqi-very-poor: "#F44336"
  aqi-severe: "#7B1FA2"
typography:
  headline-display:
    fontFamily: Space Grotesk
    fontSize: 96px
    fontWeight: 700
    lineHeight: 96px
    letterSpacing: -2px
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: 600
    lineHeight: 64px
    letterSpacing: -1px
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 15px
    fontWeight: 500
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 14px
    letterSpacing: 0.08em
  nav-label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0.04em
rounded:
  none: 0px
  sm: 6px
  md: 10px
  lg: 16px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  2xl: 64px
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#04121A"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    height: "40px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px solid {colors.border}"
    typography: "{typography.label-md}"
    rounded: "{rounded.sm}"
    padding: "10px 20px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    border: "1px solid {colors.border}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "20px"
  severity-badge:
    backgroundColor: "var(--aqi-band-color)"
    textColor: "#0B0D10"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  input:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  chip:
    backgroundColor: "{colors.surface-elevated}"
    textColor: "{colors.muted}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.full}"
    padding: "4px 10px"
---

# Atmos Twin — Environmental Intelligence System

## Overview
Atmos Twin should feel like a live instrument, not a lifestyle app — closer to a flight-deck or trading dashboard than a weather widget. The interface is dark, dense with real numbers, and almost entirely monochrome except for one deliberate signal: AQI severity color. Every other UI element (chrome, buttons, nav) stays quiet so that color always means one thing — "how bad is the air, here, right now" — and never gets confused with generic branding. The tone is serious and technical but not cold: rounded corners, soft glows, and a live map as the visual center keep it feeling like a product people would actually want to watch update in real time.

## Colors
- **Background (#0B0D10):** Near-black canvas. Everything else — the map, the severity colors, the accent — reads clearly against it.
- **Surface (#14171C) / Surface Elevated (#1B1F26):** Two steps of card elevation. Base cards sit on `surface`; anything nested or hovered (dropdowns, active inputs, focused chart tooltips) steps up to `surface-elevated`.
- **Ink (#F5F6F7):** Primary text. Near-white, not pure white, to avoid glare against the dark background.
- **Muted (#8A93A3):** Secondary text, timestamps, units, chart axis labels.
- **Border (#242830):** The only structural line color. Thin, low-contrast, used to separate cards without drawing attention to itself.
- **Accent (#3DD6F5) / Accent Strong (#1FB8DE):** The system's *only* non-severity color — an electric cyan reserved for interactivity (buttons, active nav state, live/streaming indicators, the time-scrub slider handle). It should never appear on the map or in a severity badge, so it always reads as "system," never as "data."
- **AQI severity scale (good → severe):** The actual content of the product. Used on the map fill, the hero badge, forecast-band shading, and nowhere else as decoration — if a severity color shows up, it means something.
- **Error (#FF4D8D):** Deliberately a magenta, not a red — kept distinct from `aqi-very-poor` (#F44336) so a system error and a bad-air-quality reading are never visually ambiguous.

## Typography
Two families: **Space Grotesk** for headlines and any large standalone number, **Inter** for everything functional (body copy, labels, nav, UI chrome). Space Grotesk's slightly technical, geometric character gives big numbers — the hero AQI figure especially — presence without tipping into the poster/editorial register; it should feel instrument-panel, not billboard. Inter carries the actual density of the product: card labels, table data, chat text, legends.

A third, optional style — **data-mono** (JetBrains Mono) — is available for tabular numeric readouts (wind speed, humidity %, forecast values in tables) where fixed-width digits make scanning a column of numbers easier. Use it sparingly, only where numbers are genuinely tabular.

Scale is intentionally restrained: no `headline-display`-sized text anywhere except the current AQI hero number. Everything else stays in the 13–32px range — this is a dashboard meant to be scanned quickly and repeatedly, not read like a landing page.

## Layout
Structure is sidebar + main, not full-bleed marketing sections. Left rail holds primary navigation (Dashboard, Map, Scenario Simulator, Advisor, Ward Comparison, Accuracy Tracker) and stays fixed. The main area uses a modular grid — a hero row, then a 3–4 column card grid for the highlight metrics (attribution, confidence, health-cost, weather context), then the map as a full-width centerpiece below it, not a small inset.

Spacing is tight relative to a marketing site: `sm`/`md` (8–16px) for spacing within and between cards, `lg` (24px) between major sections, `xl`/`2xl` reserved only for top-level page padding. Density is a feature here — the product's credibility comes from visibly having a lot of real data on screen at once, organized cleanly, not from empty space.

## Elevation & Depth
Not flat, but not glossy either. Cards get a single subtle elevation step (`surface` → `surface-elevated` on hover/focus) plus a 1px `border`, no drop shadows. The one exception: the hero AQI card and the map may carry a faint outer glow tinted to the current severity color — a soft, low-opacity radial glow behind the card edge. This is the one "alive" visual cue in an otherwise restrained system, and it should be subtle enough to read as ambiance, not neon.

## Shapes
Rounded but not soft — `rounded.md` (10px) on cards, `rounded.sm` (6px) on buttons and inputs, `rounded.full` reserved for severity badges, chips, and map legend swatches so those specifically read as "status," distinct from structural containers. Avoid sharp/architectural corners (this isn't an editorial brand system) and avoid large soft radii (this isn't a friendly consumer app) — the middle ground signals "modern data product."

## Components
**button-primary** carries the accent cyan with near-black text — reserved for the single most important action in a given view (e.g., "Run Scenario," "Ask Advisor"). **button-secondary** is an outline-only button in `ink` on transparent, used for everything else, so the cyan accent stays meaningful and never inflates. **severity-badge** is the recurring signature component — a pill filled with whichever AQI band color applies, always paired with the band name as text (never color alone, for accessibility and clarity). **card** is the base container for every dashboard module. **chip** is a quieter, muted-gray pill for non-severity tags (data source labels like "modeled" vs "observed," city names, filters). **input** stays understated — dark surface, no heavy border — matching the overall restraint.

## Do's and Don'ts
- Do let AQI severity color be the only saturated color in the system outside of the cyan accent.
- Do use the accent cyan exclusively for interactive/system elements — never for data.
- Do keep density high; this product's credibility comes from visible real data, not whitespace.
- Do use the severity glow sparingly — one hero element per view, not every card.
- Don't introduce additional accent colors; a third "brand" color will compete with the severity scale and undermine its meaning.
- Don't use drop shadows or glassmorphism — depth comes from the two-step surface system and the severity glow only.
- Don't let text-only severity communication happen — always pair color with a label for the "Poor / Very Poor / Severe" distinction.
- Don't blow out typography scale outside the hero number; this is a scanning tool, not a pitch deck.

## Screens & Component Map
Ties this system back to the earlier structural plan — which screen uses which piece:
- **Dashboard:** hero card (`headline-display` + severity-badge + glow), highlight grid (`card` × 4, using `data-mono` for numeric readouts), map preview, forecast strip (severity-shaded confidence bands).
- **Map (full view):** severity fill on regions, `chip`-style legend, confidence/"trust" overlay toggle, time-scrub slider in accent cyan.
- **Scenario Simulator:** sliders in accent cyan, before/after `card` pair, ROI leaderboard as a simple ranked list using `data-mono` for the numbers.
- **Advisor:** chat bubbles on `surface`, inline `chip`s citing which forecast/attribution numbers an answer is grounded in.
- **Ward Comparison:** table using `data-mono` for AQI values, `severity-badge` per row.
- **Accuracy Tracker:** a single restrained line chart, `muted` axis labels, no severity color needed here since it's about accuracy, not air quality itself.
