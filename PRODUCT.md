# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Static HTML/CSS/vanilla JS (ES modules), no build step, no runtime dependencies. Hosted on GitHub Pages from a public repo under the team's GitHub account (user-confirmed, 2026-10-04). The long-term system (docs/ARCHITECTURE.md) uses React + Vite; this demo is deliberately separate so the link stays simple and fast.

## Users

Primary audience for this link: hackathon judges for Schneider Electric's Yuva Yodha Energy Tech 2026 (Challenge 1: Sustainable Agriculture). They open it from a link in the team's PPT, on a laptop or phone, with a few minutes to understand what AgriSage does. They are evaluating, not farming.

The product's end user, whom the demo must represent credibly: a Tamil Nadu smallholder growing tomato (demo farm: Roma tomato, flowering stage, Krishnagiri, about 1 acre), asking in Tamil or English whether and when to irrigate.

## Product Purpose

Show, in one live page, that AgriSage is "not just a chatbot": a digital twin of one farm and an hourly optimizer decide when to irrigate and which energy to use (solar, battery, grid, diesel). The assistant explains the decision in Tamil or English, and the farmer's confirmation becomes a pump command over the same MQTT topics the ESP32 will use. Success: a judge asks "Should I irrigate today?", gets a clear, reasoned, sourced answer, sees the pump act on it, and sees quantified water and energy impact against a stated baseline.

## Positioning

Decision intelligence, not information: every number the assistant says comes from the farm twin, optimizer or season simulation, never from a language model guessing. Water and energy are optimised together (pump on solar, in the right window). It runs entirely in the browser: no cloud AI and no API keys.

## Operating Context

- Judges view it from the PPT link; first impression is decisive. English UI by default, one-tap Tamil toggle; Tamil questions are always answered in Tamil.
- The deck (AgriSage_Canva_Compatible_Under_10MB.pptx.pdf) slide 8 "Live demo" defines the expected flow: Tomato | Roma | Flowering → "Should I irrigate today?" → live console (soil moisture, temperature, humidity, rain forecast) → Irrigation recommended → AI decision → ESP32 → Pump ON → Target → OFF.
- Hardware (ESP32, relay, pump) is not built yet; it is simulated with the real MQTT contract and will be built only if the team is shortlisted.
- Deadline: about two weeks from 2026-10-04.

## Capabilities and Constraints

- Four demo scenarios with distinct decisions: hot dry day (irrigate in solar window), rain coming (skip), cloudy and low battery (shift to midday plus battery), moist soil (no irrigation).
- Assistant intents: should irrigate, why, what-if, farm status, weather, energy, pump control, pump alerts, crop water needs, possible disease from symptoms, season impact, about.
- Pump commands need farmer confirmation, a max runtime and a dry-run cutoff (CLAUDE.md rule 5). Disease output is always "possible" plus confidence (rule 6).
- Weather is synthetic in this demo; the evaluation will move to NASA POWER hourly history after the team approves the download. Many energy and price parameters are UNVERIFIED placeholders and must be shown as such.

## Brand Commitments

- Name: AgriSage. Tagline used in the deck: "AI-Powered Energy & Water Intelligence for Sustainable Farming"; closing line "Know. Sense. Decide. Act. Measure."
- The deck's visual language is binding for continuity: near-black green background, neon lime accents, cyan for water, bold geometric sans headlines, small monospaced section labels.

## Evidence on Hand

- Simulated season comparison (synthetic weather) from js/season.js; no field data, farmer testimonials, pilot results or partner logos exist. Never fabricate them.
- Sources verified on 2026-10-04: FAO-56, FAO-66, TNAU Agritech tomato disease pages, UC IPM blossom-end rot.

## Product Principles

1. Every number has a source: the twin, the optimizer, the season simulation or a cited reference. Placeholders are labelled, never hidden.
2. Decision first, explanation second: answer "should I?" plainly, then why.
3. The farmer stays in control: nothing switches the pump without an explicit confirmation.
4. Tamil is a first-class language, not a translation afterthought.
5. Honest about what is simulated.

## Accessibility & Inclusion

Tamil script must render cleanly with system fonts on Android, iOS, macOS and Windows. Works at phone width. Readable contrast on a dark theme; motion must respect reduced-motion preferences.
