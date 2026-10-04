---
name: AgriSage
description: Solar-aware irrigation decisions for Tamil Nadu smallholders, explained in Tamil and English.
colors:
  ground: "#07110b"
  shell: "#091610"
  panel: "#0c1a12"
  panel-2: "#112419"
  panel-3: "#163021"
  line: "rgba(176, 230, 120, 0.12)"
  line-2: "rgba(176, 230, 120, 0.22)"
  text: "#eaf4e6"
  text-2: "#b7ccb8"
  text-3: "#8fa893"
  lime: "#a7e35e"
  lime-ink: "#0b1806"
  lime-wash: "rgba(167, 227, 94, 0.1)"
  cyan: "#5cd8ea"
  cyan-wash: "rgba(92, 216, 234, 0.1)"
  amber: "#f3b74f"
  amber-wash: "rgba(243, 183, 79, 0.12)"
  coral: "#ff7f70"
  coral-wash: "rgba(255, 127, 112, 0.12)"
  mark-solar: "#73a40a"
  mark-water: "#00a4bb"
  mark-grid: "#6d74d8"
  mark-battery: "#008e7f"
  mark-diesel: "#b9683b"
  mark-muted: "#3e5a48"
typography:
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Tamil', 'Tamil Sangam MN', 'Nirmala UI', 'Latha', sans-serif"
    fontSize: "1.75rem"
    fontWeight: 750
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Tamil', 'Tamil Sangam MN', 'Nirmala UI', 'Latha', sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.5
    letterSpacing: "-0.01em"
  value:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Tamil', 'Tamil Sangam MN', 'Nirmala UI', 'Latha', sans-serif"
    fontSize: "1.375rem"
    fontWeight: 650
    lineHeight: 1.1
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Tamil', 'Tamil Sangam MN', 'Nirmala UI', 'Latha', sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans', 'Noto Sans Tamil', 'Tamil Sangam MN', 'Nirmala UI', 'Latha', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.35
  mono:
    fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "tnum"
rounded:
  sm: "7px"
  md: "10px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "#b9ec78"
  button-secondary:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.panel-3}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.coral-wash}"
    textColor: "#ffb3a9"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "36px"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 12px"
    height: "32px"
  chip-hover:
    backgroundColor: "{colors.lime-wash}"
    textColor: "{colors.text}"
  input-text:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "42px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 8px"
    height: "22px"
  pill-unverified:
    backgroundColor: "{colors.amber-wash}"
    textColor: "{colors.amber}"
    rounded: "{rounded.pill}"
    padding: "0 7px"
    height: "20px"
  seg-lang-active:
    backgroundColor: "{colors.lime}"
    textColor: "{colors.lime-ink}"
    rounded: "6px"
    padding: "0 11px"
    height: "30px"
---

# Design System: AgriSage

## Overview

**Creative North Star: "The Field Console at Dusk"**

A dark, working instrument for one farm. The ground is a near-black field green, panels lift from it by tone alone, and four colours each carry exactly one job: lime for sun, solar energy and the primary action; cyan for water; amber for heat, refill thresholds and unverified values; coral for crop stress, faults and alerts. Nothing is coloured for decoration. A colour on screen is a claim about the farm.

Density is that of an operate screen, not a dashboard of equal tiles. Panels share a 16px gutter, hairline rules tinted lime at low alpha divide them, and corners are a modest 10px. Readings, clock times and machine traffic are set in monospace with tabular numerals so values line up and read as measured; everything else, Tamil included, is the system sans so both scripts render natively and offline.

Depth comes from tonal steps of the same green, not from shadows or glows. Motion is short and functional: state changes ease out in 160ms, new messages rise 6px, a fresh plan grows into the timeline over 900ms, and every animation collapses under reduced motion.

**Key Characteristics:**
- Near-black green ground with three tonal panel steps; no glow, no gradients on surfaces.
- One job per hue: lime sun/action, cyan water, amber heat/warning, coral stress/alert.
- Lime-tinted 1px hairlines in place of grey borders.
- System sans for English and Tamil; monospace only for machine truth (times, tabular values, MQTT).
- Separate, validated chart-mark palette for filled categorical marks.
- Authored 24×24 line icons at 1.75 stroke, round caps and joins, inline SVG.

## Colors

A dark field-green neutral family carrying four semantic signal hues, plus a separate darker mark palette for charts.

### Primary
- **Sunlit Lime** (lime): solar output, the primary action button, the active tab underline, the active language toggle, the simulation "now" cursor, focus rings, text selection and the caret. Its ink partner **Seed Black** (lime-ink) is the only text colour allowed on a lime fill. **Lime Wash** (lime-wash) backs the brand mark, the assistant avatar, approved states and "sourced" pills.

### Secondary
- **Channel Cyan** (cyan): water in UI form: moisture lines on the Day Strip, the planned pump run outline, pump-running events, water nodes in the command path, links, and the live data-flow pulse. **Cyan Wash** (cyan-wash) backs water states and "to check" pills.

### Tertiary
- **Heat Amber** (amber): temperature, the refill threshold line, low-moisture status, callouts and UNVERIFIED parameter pills. **Amber Wash** (amber-wash) backs callouts and UNVERIFIED pills.
- **Stress Coral** (coral): the crop stress zone, the "if skipped" projection, alert events, pump faults, the dry-well switch when on, and the listening microphone. **Coral Wash** (coral-wash) backs alerts and the danger button.

### Chart Marks
- **Mark Solar** (mark-solar), **Mark Water** (mark-water), **Mark Grid** (mark-grid), **Mark Battery** (mark-battery), **Mark Diesel** (mark-diesel), **Mark Muted** (mark-muted): fills for categorical chart marks (energy-source bars, pump-run bodies, grid availability band, baseline comparison bars). Validated together for dark-mode lightness, chroma and colour-vision separation.

### Neutral
- **Night Field** (ground): page background and text-input fill.
- **Shell Green** (shell): the sticky top bar and simulation bar; segmented-control trays.
- **Panel Green** (panel): every content panel.
- **Lifted Panel** (panel-2): buttons, table headers, system events, inactive command-path nodes.
- **Raised Panel** (panel-3): hover fill, user chat bubbles, pressed segment, switch track.
- **Lime Hairline** (line) and **Strong Hairline** (line-2): all borders and dividers; line-2 for controls, line for structure.
- **Leaf White** (text), **Sage Grey** (text-2), **Lichen Grey** (text-3): primary text, secondary text, and labels/meta respectively.

### Named Rules
**The One Job Rule.** Each signal hue means one thing everywhere: lime is sun or "go", cyan is water, amber is heat or caution, coral is stress or fault. Never use a signal hue for emphasis or decoration.

**The Two Limes Rule.** UI lime and cyan are for lines, text, icons and accents; filled categorical chart marks use the mark palette (mark-solar, mark-water, and so on). A filled area may use UI lime only as a low-opacity wash (about 0.13) under a mark-coloured line.

**The Lime Ink Rule.** Text on a lime fill is always lime-ink; never white.

## Typography

**Display Font:** none; the system has no display tier.
**Body Font:** system sans (system-ui, with Noto Sans Tamil, Tamil Sangam MN, Nirmala UI and Latha for Tamil)
**Label/Mono Font:** ui-monospace stack (SF Mono, Cascadia Mono, Menlo, Consolas)

**Character:** A plain, legible system sans that renders English and Tamil natively without a font download, paired with a monospace reserved for values a machine produced.

### Hierarchy
- **Headline** (750, 1.75rem, 1.15, -0.02em): page titles on Impact and Sources; the decision verdict uses the same voice at 1.625rem (1.3125rem under 720px).
- **Title** (650, 1rem, -0.01em): panel headings; the chat heading steps up to 1.0625rem.
- **Value** (650, 1.375rem, 1.1): the reading values; decision facts use 650 at 1.125rem. Units follow in a 500-weight small at text-3.
- **Body** (400, 15px, 1.5): chat answers and prose; ledes cap at 70ch.
- **Label** (600, 0.75rem): legends, badges, reading labels, fact terms, metadata; sentence case, no tracking.
- **Mono** (400, 0.75rem, 1.45, tabular numerals): MQTT log, clock (600, 1rem), clock times in the verdict, table cells, tooltip values, chart value and axis labels, tool names.

### Named Rules
**The Machine Truth Rule.** Monospace marks values that came from the twin, the clock or the wire: clock times, table cells, chart values and axes, MQTT topics and payloads. Always with tabular numerals. Large reading values stay in the sans.

**The Tamil Leading Rule.** Any element in Tamil gets line-height 1.65; Tamil and English share the same family stack and sizes.

**The Small Ceiling Rule.** The largest type on any surface is the 1.75rem headline. This is an operate tool; hierarchy comes from weight, colour and position, not scale.

## Layout

Full-width fluid canvas with 20px page padding (12px under 720px). Two sticky tiers sit on top: a 60px top bar (translucent shell, 10px blur) and a 56px simulation bar. The live view is a two-column grid at 2fr:3fr (assistant column min 340px) with a 16px gap; the assistant panel is sticky and fills the viewport height below the bars. The right column stacks panels at the same 16px gap. Text-led tabs (Impact, Sources) centre in a 1180px column.

Spacing rhythm is 8 / 12 / 16 / 20px; panel heads pad 14px 16px, panels separate by the 16px gutter (12px on mobile). Readings sit in a single panel as six divided cells (three at 1280px, two at 720px) aligned with subgrid, not as separate cards.

Breakpoints: at 1280px readings go to three columns and the command path and log stack; at 1080px tabs drop to a second top-bar row, the simulation bar unsticks, and the live grid becomes one column; at 720px the top bar unsticks, the simulation bar sticks to the top, and controls compact.

## Elevation & Depth

Flat, tonal layering. Depth is the step from ground to shell to panel to panel-2 to panel-3, each a slightly lighter field green, with lime hairlines at the edges. Shadows appear only on elements that genuinely float or press.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45)`): the chart tooltip only.
- **Press** (`box-shadow: 0 1px 2px rgba(0, 0, 0, 0.35)`): the selected segment in a segmented control.

### Named Rules
**The No-Halo Rule.** No coloured glows or blurred accent shadows. Emphasis is a wash fill and a stronger hairline, never light bleeding from an element.

## Shapes

Modest, consistent corners: 10px for panels, command-path nodes and the decision banner; 7px for buttons, inputs, selects, events, callouts and tables; full pills for chips, badges, source links and status pills. The user chat bubble breaks to 12px with a 4px tail corner at bottom right. Borders are always 1px hairlines tinted lime. Chart marks use small radii (2px on bars and runs, 2.5px on the grid band, 5px on the plan label).

Icons are authored line drawings on a 24×24 grid, 1.75 stroke, round caps and joins, drawn in currentColor and rendered at 18px (15–24px by context).

## Components

### Buttons
Quiet, compact, tactile.
- **Shape:** gently rounded (7px), 36px tall, 1px strong hairline.
- **Primary:** lime fill, lime-ink 600 text; one per region (send, approve).
- **Hover / Focus:** 160ms ease-out to the next tonal step; 1px press on active; focus is a 2px lime outline at 2px offset.
- **Secondary / Ghost / Danger:** secondary on panel-2; ghost transparent with text-2, used for icon buttons; danger on coral wash with a coral hairline. Toggled icon buttons turn lime.

### Chips
- **Style:** transparent pill, 32px, strong hairline, text-2 at 500 weight; a horizontal scroll row that fades at its right edge.
- **State:** hover fills lime wash with a lime hairline and lifts text to Leaf White.

### Cards / Containers
- **Corner Style:** 10px.
- **Background:** panel on ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px line.
- **Internal Padding:** 14px 16px heads; internal cells divided by hairlines rather than nested cards.

### Inputs / Fields
- **Style:** ground fill (darker than its panel), strong hairline, 7px, 42px tall; selects 36px on panel-2 with a drawn chevron.
- **Focus:** border turns lime; range inputs and the caret are lime.
- **Error / Disabled:** disabled controls drop to 0.45 opacity.

### Navigation
- **Tabs:** text-2 600 0.875rem, full top-bar height, a 2px lime underline on the selected tab; Leaf White on hover and selected. Under 1080px tabs move to their own row and scroll horizontally on mobile.
- **Segmented controls:** shell tray with a 3px inset; the selected segment lifts to panel-3, except the language toggle, whose selected segment is lime with lime-ink.

### Status and Events
- **Status dot:** a 7px dot plus 600 text in lime (good), amber (low) or coral (bad).
- **Chat events:** 7px boxes on panel-2; pump start on cyan wash, alerts on coral wash, notes dashed and centred.
- **Pills:** sourced in lime wash, to-check in cyan wash, UNVERIFIED in amber wash.

### Day Strip (signature)
A two-lane 24-hour SVG timeline. The upper lane plots soil moisture: measured as a solid cyan line, plan as dashed cyan, the "if skipped" projection as dotted coral, the refill threshold as a dashed amber line with a faint coral stress zone below it. The lower lane plots solar output as a mark-solar line over a lime wash, pump runs at the pump's real power as mark-water bodies with cyan outlines, so a run inside the sun curve reads as solar-powered, and a mark-grid band for grid availability. A lime now-cursor carries a mono time label; night hours are shaded. The plan label is pinned to its run in mono and fills cyan when a plan answer in the chat is hovered. A new plan grows in over 900ms with a cubic ease-out. Tick labels are mono with a panel-coloured halo stroke for legibility; a tooltip and an hourly table give the same data in text.

### MQTT Log
Mono 0.75rem rows with a 5ch timestamp column, topic in text-2 with its leaf in Leaf White (lime for commands), payload in text-3; new rows flash a lime wash over 600ms; the list fades out at its bottom edge.

## Do's and Don'ts

### Do:
- **Do** give every colour a job from the One Job Rule and keep it there across the decision banner, Day Strip, readings, command path and chat.
- **Do** use the mark palette (mark-solar, mark-water, mark-grid, mark-battery, mark-diesel, mark-muted) for filled chart marks and UI lime/cyan for lines and accents.
- **Do** set clock times, tabular values, chart values and MQTT traffic in monospace with tabular numerals.
- **Do** separate surfaces with lime-tinted 1px hairlines and tonal steps of the field green.
- **Do** group related readings in one panel divided by hairlines rather than separate cards.
- **Do** draw new icons on the 24×24 grid at 1.75 stroke with round caps and joins, inline as SVG in currentColor.
- **Do** keep motion under 250ms for state changes, ease-out, and honour reduced motion.

### Don't:
- **Don't** put white text on lime; use lime-ink.
- **Don't** add coloured glows or blurred accent shadows; shadows belong only to floating or pressed elements.
- **Don't** use neutral grey borders; hairlines are lime at 0.12 to 0.22 alpha.
- **Don't** use amber or coral for emphasis; they mean heat, caution, stress or fault.
- **Don't** set prose or labels in monospace.
