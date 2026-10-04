# Progress

## 2026-10-04: software demo for the round-1 PPT link

Scope agreed with the team: software-only demo now; ESP32/relay/pump hardware only if shortlisted. Static HTML/JS on GitHub Pages, English-first UI with Tamil toggle, chat and live console side by side, no auto-play tour. Deadline about two weeks.

Done
- Digital twin in pure JS: FAO-56 hourly ET0, soil bucket for the drip wetted zone, PV, battery dispatch, pump.
- Rolling 24 h optimizer (greedy, 15-min steps, just-in-time tie-break) with four demo scenarios giving distinct decisions.
- Live farm: sensors on the ARCHITECTURE.md MQTT topics, pump confirmation, max runtime, dry-run cutoff.
- Offline assistant: 13 intents, Tamil/English/Tanglish; 45/46 held-out questions correct; TNAU-checked disease KB (fixed a leaf-curl error: TNAU says leaves roll downward).
- Season evaluation: 135-day tomato season, 3 policies × 2 energy setups × 5 synthetic seasons. AgriSage on the solar kit: about 42% less water than a fixed 3 h/day schedule, no grid power, no crop stress.
- UI: chat, decision banner, Day Strip chart, readings, command path, MQTT log, Season impact and Sources tabs; phone layout; validated chart palette.
- 27 tests passing (`npm test`).
- Design: two finish-review rounds; every material fix applied (pump stops at target, composer in first viewport, moisture lane with "if skipped" line, plan label tied to chat answers, next-day state, mobile layout). DESIGN.md records the design system.
- Published 2026-10-04: repo first published as syed0299/agrisage-demo, transferred to https://github.com/MD-FAIZ0453/agrisage-demo; live at https://md-faiz0453.github.io/agrisage-demo/ (GitHub Pages, branch main).
- Flagged placeholder: pump hard runtime cap 240 min (UNVERIFIED; CLAUDE.md rule 5 requires a cap but gives no value).

Next
- Team approval to download NASA POWER hourly weather for Krishnagiri, then rerun the season comparison on real weather.
- Replace UNVERIFIED parameters (Sources tab): pump nameplate, PV/battery sizes, TANGEDCO supply hours, diesel price, cost of supply, farmer baseline schedule.
- Add the live link to the PPT: https://md-faiz0453.github.io/agrisage-demo/

Open questions
- Keep browser voice input (uses an online speech service) or hide it until on-device Tamil ASR exists?
- Which 2–3 districts for the final evaluation?

## 2026-10-04 (later): farmer Q&A datasets in the chatbot

Done
- Added three Hugging Face datasets at the team's request: FarmerChat (all India), agriculture-qa, CROP (rice + corn practical dialogues). Built a 92,909-record sharded BM25 index (about 50 MB static, a few small files fetched per question) with `tools/build_kb.py`.
- Team decisions: show product names but remove doses; FarmerChat all India; CROP rice + corn.
- Cleaning: other-script answers (Hindi/Telugu despite the card saying English) dropped; redaction artefacts, contacts, links, emoji removed; content-free answers and duplicates dropped.
- Chatbot: new farm_knowledge intent; questions naming a crop other than tomato go to the records; off-topic and disease fallbacks search the records; Tamil/Tanglish glossary for search; record cards with source, place, month and licence; Sources tab lists datasets and changes.
- 33 tests passing.

Open questions
- The ChatGPT share link could not be read (renders client-side); paste its text if it matters.

- Repo transfer from syed0299 to MD-FAIZ0453 requested on 2026-10-04 so the link carries the team account name; MD-FAIZ0453 must accept it.
