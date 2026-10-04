# AgriSage live demo

A browser demo of AgriSage for the Schneider Electric Yuva Yodha Energy Tech 2026 hackathon (Challenge 1: Sustainable Agriculture). A simulated tomato farm in Krishnagiri decides every hour **when to irrigate and which energy to use**, and a Tamil/English assistant explains the decision and runs the pump on the farmer's confirmation.

**Live demo: https://md-faiz0453.github.io/agrisage-demo/** (Tamil: add `?lang=ta`)

Everything runs in the browser: no server, no cloud AI, no API keys, no dependencies.

## Run it

```bash
python3 serve.py
```

Then open http://localhost:5173. Use `?lang=ta` to open in Tamil. (`serve.py` is a plain static server that disables browser caching, so edits always show up; `python3 -m http.server` also works but can serve stale JS after edits.)

```bash
npm test
```

The tests use Node's built-in test runner (Node 20+): twin physics, the three optimizer cases from PROMPTS.md Phase 4, pump safety rules, the MQTT contract, classifier accuracy, season impact, and the farmer Q&A search (on-crop results, doses removed, off-topic rejected).

## What judges can do

1. Ask "Should I irrigate today?" in English, Tamil or Tanglish (e.g. *innaiku thanni paichalama*).
2. Ask "Why?" or "What if I wait until tomorrow?". Both options are simulated on the farm's digital twin.
3. Approve the plan, press play, and watch the simulated ESP32 run the pump inside the solar window and stop at target. The MQTT log shows the exact topics the hardware will use.
4. Switch scenarios: hot dry day, rain coming (skip), cloudy with low battery (shift to midday plus battery), soil still moist (no irrigation).
5. Turn on "Simulate a dry well" during a run to see the dry-run cutoff.
6. Open **Season impact** for the policy comparison against a fixed farmer schedule, and **Sources** for every parameter with its source and status.

## How it is built

| Folder | What |
|---|---|
| `js/params.js` | Every parameter with `source` and status (`sourced`, `check`, `UNVERIFIED`) |
| `js/weather.js` | Synthetic scenario weather, solar geometry, FAO-56 hourly Penman-Monteith ET0 |
| `js/twin.js` | Pure twin functions: FAO-56 soil bucket (drip wetted zone), PV, battery dispatch, pump |
| `js/optimizer.js` | Rolling 24 h irrigation and energy plan, re-solved every simulated hour |
| `js/farm.js` | Live farm: sensors on the ARCHITECTURE.md MQTT topics, pump commands with confirmation, max runtime and dry-run cutoff |
| `js/season.js` | 135-day season comparison: 3 policies × 2 energy setups × 5 weather seasons |
| `js/agent/` | Offline intent classifier (char n-gram TF-IDF), knowledge base with sources, Tamil/English templates |
| `js/kb/`, `data/kb/`, `tools/build_kb.py` | Farmer Q&A search (BM25 over a static sharded index) built from three public datasets |
| `js/ui/`, `css/` | Interface: chat, decision banner, Day Strip chart, readings, command path, impact and sources tabs |

The assistant never computes or decides: every number comes from the twin, the optimizer or the season simulation through tool calls, and each answer lists the tools and sources it used.

## Farmer Q&A datasets in the chatbot

General farming questions ("whitefly control in chilli", "நெல்லுக்கு விதை அளவு") are answered by quoting the closest records from three public datasets, searched in the browser:

| Dataset | Licence | Records used |
|---|---|---|
| [FarmerChat Q&A (Large)](https://huggingface.co/datasets/DigiGreen/farmerchat-queries-large), Digital Green | CC-BY-4.0 | India only, English or Tamil text |
| [agriculture-qa](https://huggingface.co/datasets/talhakk/agriculture-qa), talhakk | Apache-2.0 | all usable rows |
| [CROP dataset](https://huggingface.co/datasets/AI4Agr/CROP-dataset), AI4Agr | CC-BY-NC-4.0 | rice and corn practical dialogues (English) |

`tools/build_kb.py` turns the raw downloads (in `data/raw/`, gitignored) into a sharded search index in `data/kb/`. Along the way it removes greetings, price, contact and weather questions, phone numbers, e-mails, links, emoji, answers with no content, and duplicate questions, and **replaces every dose with "ask your agriculture officer"**. Exact counts are in `data/kb/manifest.json` and on the Sources tab. FarmerChat answers are AI-generated and none of the records are checked by AgriSage, which the chat says every time. CROP is non-commercial: fine for this demo, not for a commercial product.

To rebuild after downloading the datasets:

```bash
uv run --no-project --with pyarrow python tools/build_kb.py
```

## Honest limits (read before presenting)

- **Weather is synthetic.** The next step is NASA POWER hourly history for Krishnagiri (download needs team approval).
- **21 parameters are UNVERIFIED placeholders** (pump and PV sizes, the pump's hard runtime cap, battery, grid supply hours, prices, the farmer's 3 h/day baseline). They are listed in the Sources tab. The headline water saving depends mostly on the baseline schedule; the Impact tab has a slider to change it.
- **The optimizer is a greedy prototype** of the PuLP/CBC MILP MPC in docs/ARCHITECTURE.md, with the same inputs and outputs.
- **Voice input** uses the browser's speech recognition, which may send audio to the browser vendor. This conflicts with the project's offline rule; the field version uses on-device Tamil ASR. Read-aloud uses on-device voices.
- **Disease help** is symptom matching against TNAU Agritech pages. It always says "possible" with a confidence and leaves chemical doses to the agriculture officer.

## Deploy (GitHub Pages)

The folder is a static site. Push it to a GitHub repo and enable Pages (Settings → Pages → deploy from branch `main`, root). The link will be `https://<user>.github.io/<repo>/`.
