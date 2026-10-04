// Offline assistant: detect intent → call tools → fill a Tamil or English
// template. The assistant never computes decisions itself; every number comes
// from a tool backed by the twin, the optimizer or the season simulation
// (CLAUDE.md rule 1). Pump commands always need an explicit farmer click.

import { IntentClassifier, detectLang, normalize } from './classifier.js';
import { INTENTS } from './intents.js';
import { SOURCES, matchDisease, confidenceLevel } from './kb.js';
import { clockLabel } from '../farm.js';
import { P } from '../params.js';
import { tokenize, toSearchText } from '../kb/search.js';

const f0 = (x) => Math.round(x).toLocaleString('en-IN');
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const pct = (x) => Math.round(x * 100);
const L = (lang, en, ta) => (lang === 'ta' ? ta : en);

export function dur(hours, lang, locative = false) {
  let h = Math.floor(hours + 1e-9);
  let m = Math.round((hours - h) * 60);
  if (m === 60) {
    h += 1;
    m = 0;
  }
  if (lang === 'ta') {
    if (h && m) return `${h} மணி ${m} ${locative ? 'நிமிடத்தில்' : 'நிமிடம்'}`;
    if (h) return `${h} ${locative ? 'மணி நேரத்தில்' : 'மணி நேரம்'}`;
    return `${m} ${locative ? 'நிமிடத்தில்' : 'நிமிடம்'}`;
  }
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

function whenLabel(tAbs, tNow, lang) {
  const d = Math.floor(tAbs / 24) - Math.floor(tNow / 24);
  const c = clockLabel(tAbs);
  if (d <= 0) return L(lang, `today at ${c}`, `இன்று ${c}-க்கு`);
  if (d === 1) return L(lang, `tomorrow at ${c}`, `நாளை ${c}-க்கு`);
  return L(lang, `in ${d} days at ${c}`, `${d} நாட்களில் ${c}-க்கு`);
}

const YES = new Set(['yes', 'y', 'ok', 'okay', 'confirm', 'sure', 'go', 'proceed', 'approve', 'sari', 'seri', 'aama', 'aamam', 'haan', 'ஆம்', 'சரி', 'ஓகே', 'ஆமாம்']);
const NO = new Set(['no', 'nope', 'cancel', 'vendam', 'venda', 'illa', 'வேண்டாம்', 'இல்லை', 'ரத்து']);
const OFF_WORDS = /\b(off|stop|halt)\b|nirut|niruth|ஆஃப்|நிறுத்|அணை/i;
const FARM_CROP = 'tomato';
const OTHER_CROPS = new Set(['chilli', 'rice', 'brinjal', 'okra', 'onion', 'potato', 'banana', 'coconut', 'groundnut', 'cotton', 'sugarcane', 'corn', 'wheat', 'turmeric', 'mango', 'cabbage', 'cauliflower', 'cucumber', 'gourd', 'pumpkin', 'bean', 'pea', 'soybean', 'mustard', 'millet', 'sorghum', 'ragi', 'tea', 'coffee', 'pepper', 'cardamom', 'ginger', 'garlic', 'papaya', 'guava', 'lemon', 'orange', 'grape', 'pomegranate', 'watermelon', 'cassava', 'arecanut', 'cashew', 'rubber', 'sunflower', 'sesame', 'cowpea', 'capsicum', 'carrot', 'radish', 'spinach', 'coriander', 'drumstick', 'jackfruit']);
// Intents that are about this farm's live state; a question naming another
// crop cannot be about them, so it goes to the farmer Q&A records instead.
const FARM_INTENTS = new Set(['should_irrigate', 'why_decision', 'what_if', 'farm_status', 'weather', 'energy_status', 'crop_needs', 'disease_help', 'impact']);
const KB_SOURCE_KEY = { agriqa: 'dsAgriqa', farmerchat: 'dsFarmerchat', crop: 'dsCrop' };

export class Agent {
  constructor(farm, { getImpact, knowledge = null }) {
    this.farm = farm;
    this.getImpact = getImpact;
    this.knowledge = knowledge;
    this.clf = new IntentClassifier(INTENTS);
    this.pending = null;
    this.lastLang = 'en';
  }

  pickLang(text, pref) {
    if (pref === 'en' || pref === 'ta') return pref;
    return detectLang(text);
  }

  // Main entry: a typed or spoken question.
  async respond(text, { langPref = 'auto' } = {}) {
    const lang = this.pickLang(text, langPref);
    this.lastLang = lang;
    const words = normalize(text).split(' ');
    if (this.pending && words.length <= 3) {
      if (words.some((w) => YES.has(w))) return this.act('confirm', { langPref: lang });
      if (words.some((w) => NO.has(w))) return this.act('cancel', { langPref: lang });
    }
    let { intent, confidence } = this.clf.classify(text);
    const otherCrop = tokenize(toSearchText(text)).some((t) => OTHER_CROPS.has(t));
    if (otherCrop && FARM_INTENTS.has(intent) && this.knowledge) intent = 'farm_knowledge';
    const ctx = { text, lang, intent, confidence, tools: [], sources: [] };
    const handler = this[`on_${intent}`] || this.on_other;
    const out = await handler.call(this, ctx);
    return { lang, intent, confidence, tools: ctx.tools, sources: ctx.sources, actions: [], suggestions: [], ...out };
  }

  tool(ctx, name, fn) {
    ctx.tools.push(name);
    return fn();
  }

  // ---- tools (thin wrappers over the twin / optimizer / eval) ----
  getFarmState(ctx) {
    return this.tool(ctx, 'get_farm_state', () => ({ r: this.farm.readings, today: this.farm.today, pump: this.farm.pump, t: this.farm.t, cropDay: this.farm.cropDay() }));
  }
  getPlan(ctx) {
    return this.tool(ctx, 'run_optimizer', () => this.farm.decision);
  }
  getForecast(ctx) {
    return this.tool(ctx, 'get_forecast', () => {
      const d = this.farm.decision;
      const etc24 = d.slots.reduce((a, s) => a + s.etc, 0);
      let peak = { kw: 0, t: null };
      for (const s of d.slots) {
        const kw = s.pvKwh / s.len;
        if (kw > peak.kw) peak = { kw, t: s.t0 };
      }
      return { ...this.farm.forecastSummary(), etc24, pvPeak: peak };
    });
  }
  whatIf(ctx, kind) {
    return this.tool(ctx, 'what_if', () => this.farm.whatIf(kind));
  }

  // ---- intents ----
  on_greeting({ lang }) {
    return {
      text: L(
        lang,
        'Vanakkam! I’m **AgriSage**, the assistant for this farm: tomato (Roma), flowering stage, Krishnagiri. I watch the soil, weather and solar every hour and decide when to irrigate. Ask me in Tamil or English. I can:\n• tell you **whether and when to irrigate**, and why\n• compare options on the farm’s digital twin (“what if I wait?”)\n• run the pump on your confirmation, with safety cut-offs\n• suggest **possible** tomato diseases from symptoms, with sources\n_Try a question below, or switch the scenario above to see the decision change._',
        'வணக்கம்! நான் **AgriSage**, இந்தப் பண்ணையின் உதவியாளர்: தக்காளி (ரோமா), பூக்கும் பருவம், கிருஷ்ணகிரி. மண், வானிலை, சோலார் ஆகியவற்றை ஒவ்வொரு மணி நேரமும் கவனித்து எப்போது தண்ணீர் பாய்ச்ச வேண்டும் என்று முடிவு செய்கிறேன். தமிழிலோ ஆங்கிலத்திலோ கேளுங்கள். என்னால்:\n• **எப்போது, எவ்வளவு தண்ணீர் பாய்ச்ச வேண்டும்** என்றும் ஏன் என்றும் சொல்ல முடியும்\n• பண்ணையின் டிஜிட்டல் இரட்டையில் வழிகளை ஒப்பிட முடியும் (“காத்திருந்தால் என்ன?”)\n• உங்கள் ஒப்புதலுடன், பாதுகாப்பு நிறுத்தங்களுடன் மோட்டாரை இயக்க முடியும்\n• அறிகுறிகளிலிருந்து **சாத்தியமான** தக்காளி நோய்களை ஆதாரங்களுடன் சொல்ல முடியும்\n_கீழே ஒரு கேள்வியைத் தேர்வு செய்யுங்கள், அல்லது மேலே சூழலை மாற்றி முடிவு மாறுவதைப் பாருங்கள்._',
      ),
      suggestions: suggest(lang, ['irrigate', 'status', 'disease']),
    };
  }

  async on_about(ctx) {
    const { lang } = ctx;
    let n = L(lang, 'thousands of', 'ஆயிரக்கணக்கான');
    if (this.knowledge) {
      await this.tool(ctx, 'kb_manifest', () => this.knowledge.load());
      n = f0(this.knowledge.m.docs);
    }
    const out = this.aboutText(lang);
    return { ...out, text: out.text.replace('__N__', n) };
  }

  aboutText(lang) {
    return {
      text: L(
        lang,
        'AgriSage is the decision layer between the farmer and the farm:\n• A **digital twin** of this farm (soil water, solar, battery, pump) updated from sensors.\n• An **optimizer** that re-plans every hour: when to irrigate and which energy to use, keeping the crop out of water stress at the lowest cost.\n• This **assistant** only explains. Every number comes from the twin or optimizer, never guessed.\n• For general farming questions it searches __N__ farmer Q&A records from three public datasets (FarmerChat by Digital Green, agriculture-qa, CROP) and quotes the closest ones with their source.\nIt runs fully in the browser, with no cloud AI and no API keys. The ESP32 + relay plug into the same MQTT topics you see in the log.',
        'AgriSage என்பது விவசாயிக்கும் பண்ணைக்கும் இடையிலான முடிவெடுக்கும் அடுக்கு:\n• இந்தப் பண்ணையின் **டிஜிட்டல் இரட்டை** (மண் நீர், சோலார், பேட்டரி, மோட்டார்), சென்சார்களால் புதுப்பிக்கப்படுகிறது.\n• ஒவ்வொரு மணி நேரமும் திட்டமிடும் **optimizer**: எப்போது பாய்ச்ச வேண்டும், எந்த மின்சாரத்தைப் பயன்படுத்த வேண்டும் என்று, பயிருக்கு நீர் அழுத்தம் இல்லாமல் குறைந்த செலவில்.\n• இந்த **உதவியாளர்** விளக்கம் மட்டுமே தரும்; ஒவ்வொரு எண்ணும் twin அல்லது optimizer-இலிருந்து வருகிறது, ஊகம் இல்லை.\n• பொதுவான விவசாயக் கேள்விகளுக்கு, மூன்று பொது தரவுத் தொகுப்புகளில் (Digital Green-இன் FarmerChat, agriculture-qa, CROP) உள்ள __N__ விவசாயி கேள்வி-பதில் பதிவுகளைத் தேடி, மிக நெருக்கமானவற்றை ஆதாரத்துடன் காட்டும்.\nஇது முழுவதும் browser-இலேயே இயங்குகிறது: cloud AI இல்லை, API key இல்லை. ESP32 + relay, log-இல் நீங்கள் பார்க்கும் அதே MQTT topics-ஐப் பயன்படுத்தும்.',
      ),
      suggestions: suggest(lang, ['irrigate', 'why', 'impact']),
    };
  }

  on_should_irrigate(ctx) {
    const { lang } = ctx;
    const d = this.getPlan(ctx);
    const fc = this.getForecast(ctx);
    ctx.sources.push('optimizer', 'twin', 'fao56');
    const pl = d.plan;
    const m = f1(d.moisturePct);
    const r = f1(d.refillPct);
    const b = pl.blocks[0];
    const actions = [];
    let text;

    if (this.farm.pump.on) {
      const ran = (this.farm.t - this.farm.pump.since) * 60;
      text = L(
        lang,
        `The pump is **running now**: ${Math.round(ran)} min so far, ${f1(this.farm.pump.deliveredM3)} m³ delivered. It stops by itself at the target or after ${this.farm.pump.maxMinutes} min.`,
        `மோட்டார் **இப்போது இயங்குகிறது**: இதுவரை ${Math.round(ran)} நிமிடம், ${f1(this.farm.pump.deliveredM3)} கன மீட்டர் தண்ணீர். இலக்கை அடைந்ததும் அல்லது ${this.farm.pump.maxMinutes} நிமிடத்தில் தானாக நிற்கும்.`,
      );
      return { text, suggestions: suggest(lang, ['stop', 'energy', 'status']) };
    }

    if (d.action === 'irrigate_now' || d.action === 'irrigate_later') {
      const now = d.action === 'irrigate_now';
      const energyBits = energyPhrase(pl.energy, lang);
      const head = now
        ? L(lang, `**Yes, irrigate now** until ${clockLabel(b.end)} (${dur(b.hours, lang)}, about ${f0(b.hours * P.flow_m3h)} m³).`, `**ஆம், இப்போதே ${clockLabel(b.end)} வரை தண்ணீர் பாய்ச்சவும்** (${dur(b.hours, 'ta')}, சுமார் ${f0(b.hours * P.flow_m3h)} கன மீட்டர்).`)
        : L(lang, `**Yes, irrigate today from ${clockLabel(b.start)} to ${clockLabel(b.end)}** (${dur(b.hours, lang)}, about ${f0(b.hours * P.flow_m3h)} m³ of water).`, `**ஆம், இன்று ${clockLabel(b.start)} முதல் ${clockLabel(b.end)} வரை தண்ணீர் பாய்ச்சவும்** (${dur(b.hours, 'ta')}, சுமார் ${f0(b.hours * P.flow_m3h)} கன மீட்டர் தண்ணீர்).`);
      const soil =
        pl.stressEtaH !== null
          ? L(lang, `• Soil moisture is ${m}%. It will drop below the refill point (${r}%) in about ${dur(pl.stressEtaH, lang)}.`, `• மண் ஈரப்பதம் ${m}%. சுமார் ${dur(pl.stressEtaH, 'ta', true)} நீர் பாய்ச்ச வேண்டிய அளவான ${r}%-க்குக் கீழே போகும்.`)
          : L(lang, `• Soil moisture is ${m}% (refill point ${r}%). Topping up today keeps it safe until tomorrow’s solar window.`, `• மண் ஈரப்பதம் ${m}% (நீர் பாய்ச்ச வேண்டிய அளவு ${r}%). இன்று பாய்ச்சினால் நாளைய சோலார் நேரம் வரை பாதுகாப்பாக இருக்கும்.`);
      const energy = L(lang, `• ${now ? 'Right now' : 'That window is when'} solar ${now ? 'covers' : 'is strongest:'} ${pct(pl.solarShare)}% of pump energy${energyBits}.`, `• ${now ? 'இப்போது' : 'அந்த நேரத்தில் சூரிய ஒளி அதிகம்:'} மோட்டார் மின்சாரத்தில் ${pct(pl.solarShare)}% சோலாரிலிருந்து${energyBits}.`);
      const stress =
        pl.noIrrStressHours > 0
          ? L(lang, `• Skipping it would leave the flowering crop in water stress for about ${f0(pl.noIrrStressHours)} hours in the next day.`, `• பாய்ச்சாவிட்டால், பூக்கும் பருவத்தில் அடுத்த ஒரு நாளில் சுமார் ${f0(pl.noIrrStressHours)} மணி நேரம் பயிர் நீர் அழுத்தத்தில் இருக்கும்.`)
          : '';
      const ask = d.approved
        ? L(lang, 'Plan already approved: the pump will switch on and off automatically.', 'திட்டம் ஏற்கனவே ஒப்புதல் பெற்றது: மோட்டார் தானாக இயங்கி நிற்கும்.')
        : L(lang, now ? 'Shall I start the pump?' : 'Shall I schedule it?', now ? 'மோட்டாரை இயக்கவா?' : 'இதை அட்டவணைப்படுத்தவா?');
      text = [head, soil, energy, stress, ask].filter(Boolean).join('\n');
      if (!d.approved) {
        this.pending = { type: 'approve' };
        actions.push({ id: 'confirm', label: L(lang, now ? `Start pump (${dur(b.hours, lang)})` : `Approve ${clockLabel(b.start)} plan`, now ? `மோட்டாரை இயக்கு (${dur(b.hours, 'ta')})` : `${clockLabel(b.start)} திட்டத்துக்கு ஒப்புதல்`), kind: 'primary' });
        actions.push({ id: 'cancel', label: L(lang, 'Not now', 'இப்போது வேண்டாம்'), kind: 'ghost' });
      }
      return { text, actions, suggestions: suggest(lang, ['why', 'wait', 'now']) };
    }

    if (d.action === 'next_day' && b) {
      text = L(
        lang,
        `**No more irrigation needed today.** Next run: **tomorrow ${clockLabel(b.start)}–${clockLabel(b.end)}** (${dur(b.hours, lang)}, about ${f0(b.hours * P.flow_m3h)} m³), in tomorrow’s solar window.\n• Soil moisture is ${m}% and stays above the refill point (${r}%) until then.\n• ${pct(pl.solarShare)}% of that run’s pump energy will come from solar${energyPhrase(pl.energy, lang)}.`,
        `**இன்று இனி பாசனம் தேவையில்லை.** அடுத்த பாசனம்: **நாளை ${clockLabel(b.start)}–${clockLabel(b.end)}** (${dur(b.hours, 'ta')}, சுமார் ${f0(b.hours * P.flow_m3h)} கன மீட்டர்), நாளைய சோலார் நேரத்தில்.\n• மண் ஈரப்பதம் ${m}%; அதுவரை நீர் பாய்ச்ச வேண்டிய அளவான ${r}%-க்கு மேல் இருக்கும்.\n• அந்தப் பாசனத்தின் மின்சாரத்தில் ${pct(pl.solarShare)}% சோலாரிலிருந்து${energyPhrase(pl.energy, lang)}.`,
      );
      if (!d.approved) {
        this.pending = { type: 'approve' };
        actions.push({ id: 'confirm', label: L(lang, `Approve tomorrow ${clockLabel(b.start)}`, `நாளை ${clockLabel(b.start)}-க்கு ஒப்புதல்`), kind: 'primary' });
        actions.push({ id: 'cancel', label: L(lang, 'Not now', 'இப்போது வேண்டாம்'), kind: 'ghost' });
      }
      return { text, actions, suggestions: suggest(lang, ['why', 'status', 'energy']) };
    }

    if (d.action === 'skip_rain') {
      const fixedM3 = P.fixed_hours * P.flow_m3h;
      const fixedKwh = P.fixed_hours * P.pump_kw;
      text = L(
        lang,
        `**No, skip irrigation today.** About ${f0(pl.rain24)} mm of rain is forecast around ${clockLabel(pl.rainFirstT)} (${fc.rainProb}% chance).\n• Soil moisture is ${m}%, enough to last until the rain (refill point ${r}%).\n• Skipping saves about ${f0(fixedM3)} m³ of water and ${f1(fixedKwh)} kWh against the usual ${P.fixed_hours}-hour run.\nI’ll re-check every hour; if the rain doesn’t come, I’ll plan irrigation in the next solar window.`,
        `**இல்லை, இன்று தண்ணீர் பாய்ச்ச வேண்டாம்.** ${clockLabel(pl.rainFirstT)} அளவில் சுமார் ${f0(pl.rain24)} மி.மீ மழை எதிர்பார்க்கப்படுகிறது (${fc.rainProb}% வாய்ப்பு).\n• மண் ஈரப்பதம் ${m}%, மழை வரும் வரை போதுமானது (நீர் பாய்ச்ச வேண்டிய அளவு ${r}%).\n• வழக்கமான ${P.fixed_hours} மணி நேர பாசனத்துடன் ஒப்பிட்டால் சுமார் ${f0(fixedM3)} கன மீட்டர் தண்ணீரும் ${f1(fixedKwh)} kWh மின்சாரமும் மிச்சம்.\nஒவ்வொரு மணி நேரமும் மீண்டும் சரிபார்ப்பேன்; மழை வராவிட்டால் அடுத்த சோலார் நேரத்தில் பாசனம் திட்டமிடுவேன்.`,
      );
      ctx.sources.push('fao56');
      return { text, suggestions: suggest(lang, ['why', 'weather', 'wait']) };
    }

    const due = this.tool(ctx, 'get_forecast(48h)', () => this.farm.nextIrrigationDue());
    const nextTxt = due
      ? L(lang, `Next irrigation is due **${whenLabel(due, this.farm.t, lang).replace(' at ', ' around ')}**; I’ll schedule it in the solar window before then.`, `அடுத்த பாசனம் **${whenLabel(due, this.farm.t, lang)}** முன் தேவைப்படும்; அதற்கு முந்தைய சோலார் நேரத்தில் திட்டமிடுவேன்.`)
      : L(lang, 'No irrigation is due in the next two days.', 'அடுத்த இரண்டு நாட்களில் பாசனம் தேவையில்லை.');
    text = L(
      lang,
      `**No irrigation needed today.** Soil moisture is ${m}%, well above the refill point of ${r}%, and it stays above it for the next 24 hours.\n${nextTxt}`,
      `**இன்று தண்ணீர் பாய்ச்சத் தேவையில்லை.** மண் ஈரப்பதம் ${m}%, நீர் பாய்ச்ச வேண்டிய அளவான ${r}%-ஐ விட நன்றாக அதிகம்; அடுத்த 24 மணி நேரமும் அதற்கு மேலேயே இருக்கும்.\n${nextTxt}`,
    );
    return { text, suggestions: suggest(lang, ['why', 'status', 'crop']) };
  }

  on_why_decision(ctx) {
    const { lang } = ctx;
    const d = this.getPlan(ctx);
    const fc = this.getForecast(ctx);
    ctx.sources.push('fao56', 'optimizer');
    const pl = d.plan;
    const usedMm = d.drFracRaw * this.farm.sc.raw;
    const lines = [
      L(lang, '**Here’s how I decided:**', '**நான் எப்படி முடிவு செய்தேன்:**'),
      L(lang, `1. **Crop:** tomato at flowering (day ${d.cropDay}), crop coefficient Kc ${d.kc.toFixed(2)} (FAO-56), so it will use about ${f1(fc.etc24)} mm of water in the next 24 h.`, `1. **பயிர்:** பூக்கும் பருவ தக்காளி (${d.cropDay}-ஆம் நாள்), பயிர்க் குணகம் Kc ${d.kc.toFixed(2)} (FAO-56); அடுத்த 24 மணி நேரத்தில் சுமார் ${f1(fc.etc24)} மி.மீ தண்ணீர் பயன்படுத்தும்.`),
      L(lang, `2. **Soil:** moisture ${f1(d.moisturePct)}%, refill point ${f1(d.refillPct)}%. ${f1(usedMm)} of the ${f1(this.farm.sc.raw)} mm of easily available water is already used.`, `2. **மண்:** ஈரப்பதம் ${f1(d.moisturePct)}%, நீர் பாய்ச்ச வேண்டிய அளவு ${f1(d.refillPct)}%. எளிதில் கிடைக்கும் ${f1(this.farm.sc.raw)} மி.மீ நீரில் ${f1(usedMm)} மி.மீ ஏற்கனவே பயன்படுத்தப்பட்டது.`),
      L(lang, `3. **Weather:** max ${f0(fc.tmax)}°C, humidity down to ${f0(fc.rhmin)}%, rain ${f1(pl.rain24)} mm in the next 24 h.`, `3. **வானிலை:** அதிகபட்சம் ${f0(fc.tmax)}°C, ஈரப்பதம் ${f0(fc.rhmin)}% வரை குறையும், அடுத்த 24 மணி நேரத்தில் மழை ${f1(pl.rain24)} மி.மீ.`),
      L(lang, `4. **Energy:** solar peaks at ${f1(fc.pvPeak.kw)} kW around ${clockLabel(fc.pvPeak.t)}; battery at ${pct(d.soc)}%.`, `4. **மின்சாரம்:** சோலார் ${clockLabel(fc.pvPeak.t)} அளவில் ${f1(fc.pvPeak.kw)} kW உச்சம்; பேட்டரி ${pct(d.soc)}%.`),
    ];
    const b = pl.blocks[0];
    if (d.action === 'irrigate_later' && b) {
      const w = this.whatIf(ctx, 'now');
      const nonSolar = w.alt.energy.battery + w.alt.energy.grid + w.alt.energy.diesel;
      lines.push(L(lang, `**So:** pumping ${clockLabel(b.start)}–${clockLabel(b.end)} keeps the crop out of stress and runs ${pct(pl.solarShare)}% on solar. Starting now instead would take ${f1(nonSolar)} kWh from battery, grid or diesel.`, `**எனவே:** ${clockLabel(b.start)}–${clockLabel(b.end)} நேரத்தில் பாய்ச்சினால் பயிருக்கு நீர் அழுத்தம் இல்லை, ${pct(pl.solarShare)}% சோலாரில் இயங்கும். இப்போதே தொடங்கினால் பேட்டரி, கிரிட் அல்லது டீசலிலிருந்து ${f1(nonSolar)} kWh தேவைப்படும்.`));
    } else if (d.action === 'irrigate_now' && b) {
      lines.push(L(lang, `**So:** the crop is close to stress and solar is already enough, so the best time is now (${pct(pl.solarShare)}% solar).`, `**எனவே:** பயிர் நீர் அழுத்தத்தை நெருங்குகிறது, சோலாரும் போதுமானது; எனவே இப்போதே சிறந்த நேரம் (${pct(pl.solarShare)}% சோலார்).`));
    } else if (d.action === 'next_day' && b) {
      lines.push(L(lang, `**So:** today’s water is done. The next run is tomorrow ${clockLabel(b.start)}–${clockLabel(b.end)}, when solar can cover it and before the crop reaches stress.`, `**எனவே:** இன்றைய பாசனம் முடிந்தது. அடுத்த பாசனம் நாளை ${clockLabel(b.start)}–${clockLabel(b.end)}; அப்போது சோலார் போதுமானது, பயிரும் நீர் அழுத்தத்தை அடையாது.`));
    } else if (d.action === 'skip_rain') {
      lines.push(L(lang, `**So:** rain at ${clockLabel(pl.rainFirstT)} will refill the root zone before the crop reaches stress. Irrigating now would waste water and energy.`, `**எனவே:** பயிர் நீர் அழுத்தத்தை அடையும் முன் ${clockLabel(pl.rainFirstT)} மழை வேர்ப் பகுதியை நிரப்பும். இப்போது பாய்ச்சினால் தண்ணீரும் மின்சாரமும் வீணாகும்.`));
    } else {
      lines.push(L(lang, '**So:** moisture stays above the refill point for the next 24 h, so pumping now would only waste water.', '**எனவே:** அடுத்த 24 மணி நேரமும் ஈரப்பதம் நீர் பாய்ச்ச வேண்டிய அளவுக்கு மேல் இருக்கும்; இப்போது பாய்ச்சினால் தண்ணீர் வீணாகும்.'));
    }
    lines.push(L(lang, 'The optimizer compared every hour of the next 24 h and picked the lowest-cost plan (energy + water) that avoids crop stress.', 'அடுத்த 24 மணி நேரத்தின் ஒவ்வொரு மணியையும் ஒப்பிட்டு, பயிருக்கு நீர் அழுத்தம் இல்லாத, குறைந்த செலவுள்ள (மின்சாரம் + தண்ணீர்) திட்டத்தை optimizer தேர்ந்தெடுத்தது.'));
    return { text: lines.join('\n'), suggestions: suggest(lang, ['wait', 'now', 'energy']) };
  }

  on_what_if(ctx) {
    const { lang, text: q } = ctx;
    const kind = /now|right away|immediately|ippo|ippove|இப்போ|இப்பவே|இப்போதே/i.test(q)
      ? 'now'
      : /night|evening|tonight|iravu|raathiri|இரவு|மாலை/i.test(q)
        ? 'night'
        : 'wait';
    const w = this.whatIf(ctx, kind);
    ctx.sources.push('twin', 'optimizer');
    const r = f1(w.refillPct);
    const pl = w.plan;
    const planLine =
      pl.totalHours > 0
        ? L(lang, `**AgriSage plan:** ${blockList(pl.blocks, this.farm.t, 'en')}, ${f0(pl.volumeM3)} m³, ${pct(pl.solarShare)}% solar, no stress (lowest moisture ${f1(w.planMinMoisture)}%).`, `**AgriSage திட்டம்:** ${blockList(pl.blocks, this.farm.t, 'ta')}, ${f0(pl.volumeM3)} கன மீ, ${pct(pl.solarShare)}% சோலார், நீர் அழுத்தம் இல்லை (குறைந்தபட்ச ஈரப்பதம் ${f1(w.planMinMoisture)}%).`)
        : L(lang, `**AgriSage plan:** no irrigation needed in this period (lowest moisture ${f1(w.planMinMoisture)}%).`, `**AgriSage திட்டம்:** இந்தக் காலத்தில் பாசனம் தேவையில்லை (குறைந்தபட்ச ஈரப்பதம் ${f1(w.planMinMoisture)}%).`);
    let altLine;
    if (kind === 'wait') {
      altLine =
        w.alt.stressHours > 0
          ? L(lang, `**If you wait until tomorrow:** moisture falls to ${f1(w.altMinMoisture)}% (refill point ${r}%) and the crop is in water stress for about **${f0(w.alt.stressHours)} hours**. At flowering this risks flower drop and lower yield.`, `**நாளை வரை காத்திருந்தால்:** மண் ஈரப்பதம் ${f1(w.altMinMoisture)}% வரை குறையும் (நீர் பாய்ச்ச வேண்டிய அளவு ${r}%), பயிர் சுமார் **${f0(w.alt.stressHours)} மணி நேரம்** நீர் அழுத்தத்தில் இருக்கும். பூக்கும் பருவத்தில் இது பூ உதிர்வுக்கும் மகசூல் குறைவுக்கும் வழிவகுக்கும்.`)
          : L(lang, `**If you wait until tomorrow:** no stress. Moisture stays at or above ${f1(w.altMinMoisture)}%, so waiting is fine.`, `**நாளை வரை காத்திருந்தால்:** நீர் அழுத்தம் இல்லை. ஈரப்பதம் ${f1(w.altMinMoisture)}%-க்கு மேல் இருக்கும்; காத்திருக்கலாம்.`);
    } else {
      const e = w.alt.energy;
      const label = kind === 'now' ? L(lang, 'If you irrigate now instead', 'இதற்கு பதிலாக இப்போதே பாய்ச்சினால்') : L(lang, `If you irrigate tonight at ${clockLabel(w.altStart)} instead`, `இதற்கு பதிலாக இன்றிரவு ${clockLabel(w.altStart)}-க்கு பாய்ச்சினால்`);
      const parts = [];
      if (e.battery > 0.05) parts.push(L(lang, `${f1(e.battery)} kWh from the battery`, `பேட்டரி ${f1(e.battery)} kWh`));
      if (e.grid > 0.05) parts.push(L(lang, `${f1(e.grid)} kWh from the grid`, `கிரிட் ${f1(e.grid)} kWh`));
      if (e.diesel > 0.05) parts.push(L(lang, `${f1(e.diesel)} kWh from diesel`, `டீசல் ${f1(e.diesel)} kWh`));
      const joined = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
      const draw = parts.length ? L(lang, ` It would draw ${joined}.`, ` மின்சாரம்: ${parts.join(', ')}.`) : '';
      const stressBit = w.alt.stressHours > pl.stressHours + 0.5 ? L(lang, ` The crop would also be in water stress for about ${f0(w.alt.stressHours)} hours before then.`, ` அதுவரை சுமார் ${f0(w.alt.stressHours)} மணி நேரம் பயிர் நீர் அழுத்தத்திலும் இருக்கும்.`) : '';
      altLine = L(lang, `**${label}:** same water, but solar covers only ${pct(w.alt.solarShare)}%.${draw}${stressBit}`, `**${label}:** அதே அளவு தண்ணீர், ஆனால் சோலார் ${pct(w.alt.solarShare)}% மட்டுமே.${draw}${stressBit}`);
    }
    return { text: `${altLine}\n${planLine}\n${L(lang, '(Both options simulated on the farm’s digital twin.)', '(இரண்டு வழிகளும் பண்ணையின் டிஜிட்டல் இரட்டையில் உருவகப்படுத்தப்பட்டன.)')}`, suggestions: suggest(lang, ['irrigate', 'why', 'energy']) };
  }

  on_farm_status(ctx) {
    const { lang } = ctx;
    const s = this.getFarmState(ctx);
    const d = this.farm.decision;
    ctx.sources.push('twin');
    const r = s.r;
    const status = moistureStatus(d.drFracRaw, lang);
    const pump = s.pump.on ? L(lang, 'running', 'இயங்குகிறது') : L(lang, 'off', 'நிறுத்தப்பட்டுள்ளது');
    return {
      text: L(
        lang,
        `**Farm now (${clockLabel(s.t)})**\n• Soil moisture **${f1(r.moisturePct)}%** (${status}); refill point ${f1(d.refillPct)}%, field capacity ${f1(d.fcPct)}%\n• Soil ${f1(r.soilTempC)}°C · air ${f1(r.airTempC)}°C · humidity ${f0(r.rhPct)}%\n• Solar ${f1(r.pvKw)} kW · battery ${pct(r.soc)}% · pump ${pump}\n• Irrigated today: ${f1(s.today.waterM3)} m³`,
        `**பண்ணை இப்போது (${clockLabel(s.t)})**\n• மண் ஈரப்பதம் **${f1(r.moisturePct)}%** (${status}); நீர் பாய்ச்ச வேண்டிய அளவு ${f1(d.refillPct)}%, வயல் கொள்ளளவு ${f1(d.fcPct)}%\n• மண் ${f1(r.soilTempC)}°C · காற்று ${f1(r.airTempC)}°C · காற்றின் ஈரப்பதம் ${f0(r.rhPct)}%\n• சோலார் ${f1(r.pvKw)} kW · பேட்டரி ${pct(r.soc)}% · மோட்டார் ${pump}\n• இன்று பாய்ச்சியது: ${f1(s.today.waterM3)} கன மீட்டர்`,
      ),
      suggestions: suggest(lang, ['irrigate', 'weather', 'energy']),
    };
  }

  on_weather(ctx) {
    const { lang } = ctx;
    const fc = this.getForecast(ctx);
    const pl = this.farm.decision.plan;
    ctx.sources.push('fao56');
    const rainBit = pl.rain24 > 0.5 ? L(lang, ` from about ${clockLabel(pl.rainFirstT)}`, `, ${clockLabel(pl.rainFirstT)} முதல்`) : '';
    return {
      text: L(
        lang,
        `**Next 24 hours:** max ${f0(fc.tmax)}°C, min ${f0(fc.tmin)}°C, humidity ${f0(fc.rhmin)}–${f0(fc.rhmax)}%, rain **${f1(pl.rain24)} mm** (${fc.rainProb}% chance)${rainBit}.\nYour tomato crop will use about ${f1(fc.etc24)} mm of water in that time (FAO-56 Penman-Monteith × Kc).\n_Demo scenario weather; the field version reads a local forecast._`,
        `**அடுத்த 24 மணி நேரம்:** அதிகபட்சம் ${f0(fc.tmax)}°C, குறைந்தபட்சம் ${f0(fc.tmin)}°C, ஈரப்பதம் ${f0(fc.rhmin)}–${f0(fc.rhmax)}%, மழை **${f1(pl.rain24)} மி.மீ** (${fc.rainProb}% வாய்ப்பு)${rainBit}.\nஇந்த நேரத்தில் உங்கள் தக்காளி சுமார் ${f1(fc.etc24)} மி.மீ தண்ணீர் பயன்படுத்தும் (FAO-56 Penman-Monteith × Kc).\n_இது demo வானிலை; களப் பதிப்பு உள்ளூர் முன்னறிவிப்பைப் படிக்கும்._`,
      ),
      suggestions: suggest(lang, ['irrigate', 'crop', 'status']),
    };
  }

  on_energy_status(ctx) {
    const { lang } = ctx;
    const s = this.getFarmState(ctx);
    ctx.sources.push('twin');
    const r = s.r;
    const usable = Math.max(0, (r.soc - P.soc_min) * P.bat_kwh * P.bat_eff);
    const t = s.today;
    const nextGrid = nextGridChange(s.t, r.gridOk);
    const grid = r.gridOk
      ? L(lang, `on (until ${clockLabel(nextGrid)})`, `உள்ளது (${clockLabel(nextGrid)} வரை)`)
      : L(lang, `off (next supply ${clockLabel(nextGrid)})`, `இல்லை (அடுத்து ${clockLabel(nextGrid)})`);
    const pumpLine =
      t.pumpKwh > 0.01
        ? L(lang, `• Pump energy today: ${f1(t.pumpKwh)} kWh: ${f1(t.pv)} solar, ${f1(t.battery)} battery, ${f1(t.grid)} grid, ${f1(t.diesel)} diesel`, `• இன்றைய மோட்டார் மின்சாரம்: ${f1(t.pumpKwh)} kWh: சோலார் ${f1(t.pv)}, பேட்டரி ${f1(t.battery)}, கிரிட் ${f1(t.grid)}, டீசல் ${f1(t.diesel)}`)
        : L(lang, '• The pump has not run yet today.', '• இன்று மோட்டார் இன்னும் இயங்கவில்லை.');
    return {
      text: L(
        lang,
        `**Energy now (${clockLabel(s.t)})**\n• Solar: **${f1(r.pvKw)} kW** (${f1(t.pvGen)} kWh generated today)\n• Battery: **${pct(r.soc)}%** (${f1(usable)} kWh usable)\n• Grid supply: ${grid}\n${pumpLine}`,
        `**மின்சாரம் இப்போது (${clockLabel(s.t)})**\n• சோலார்: **${f1(r.pvKw)} kW** (இன்று ${f1(t.pvGen)} kWh உற்பத்தி)\n• பேட்டரி: **${pct(r.soc)}%** (${f1(usable)} kWh பயன்படுத்தலாம்)\n• கிரிட் மின்சாரம்: ${grid}\n${pumpLine}`,
      ),
      suggestions: suggest(lang, ['irrigate', 'now', 'impact']),
    };
  }

  on_pump_control(ctx) {
    const { lang, text: q } = ctx;
    const s = this.getFarmState(ctx);
    const off = OFF_WORDS.test(q);
    if (off) {
      if (!s.pump.on) return { text: L(lang, 'The pump is already off.', 'மோட்டார் ஏற்கனவே நிறுத்தப்பட்டுள்ளது.'), suggestions: suggest(lang, ['irrigate', 'status']) };
      this.pending = { type: 'pump_off' };
      return {
        text: L(lang, `Stop the pump now? ${f1(s.pump.deliveredM3)} m³ delivered so far.`, `மோட்டாரை இப்போது நிறுத்தவா? இதுவரை ${f1(s.pump.deliveredM3)} கன மீட்டர் பாய்ச்சப்பட்டது.`),
        actions: [
          { id: 'confirm', label: L(lang, 'Stop pump', 'மோட்டாரை நிறுத்து'), kind: 'danger' },
          { id: 'cancel', label: L(lang, 'Keep running', 'தொடரட்டும்'), kind: 'ghost' },
        ],
      };
    }
    if (s.pump.on) return { text: L(lang, 'The pump is already running.', 'மோட்டார் ஏற்கனவே இயங்குகிறது.'), suggestions: suggest(lang, ['stop', 'energy']) };

    const d = this.getPlan(ctx);
    ctx.sources.push('optimizer');
    const pl = d.plan;
    const b = pl.blocks[0];
    if (d.action === 'irrigate_now' && b) {
      const minutes = Math.round(b.hours * 60);
      this.pending = { type: 'pump_on', minutes };
      return {
        text: L(lang, `Start the pump now for ${dur(b.hours, lang)}? It stops automatically after about ${f0(b.hours * P.flow_m3h)} m³, with a hard limit of ${Math.min(P.max_run_min, Math.round(minutes * 1.05))} min and a dry-run cutoff.`, `மோட்டாரை இப்போது ${dur(b.hours, 'ta')} இயக்கவா? சுமார் ${f0(b.hours * P.flow_m3h)} கன மீட்டருக்குப் பிறகு தானாக நிற்கும்; அதிகபட்ச வரம்பு ${Math.min(P.max_run_min, Math.round(minutes * 1.05))} நிமிடம், தண்ணீர் இல்லாவிட்டால் தானாக நிறுத்தம்.`),
        actions: [
          { id: 'confirm', label: L(lang, 'Start pump', 'மோட்டாரை இயக்கு'), kind: 'primary' },
          { id: 'cancel', label: L(lang, 'Cancel', 'ரத்து'), kind: 'ghost' },
        ],
      };
    }
    if ((d.action === 'irrigate_later' || d.action === 'next_day') && b) {
      const w = this.whatIf(ctx, 'now');
      const nonSolar = w.alt.energy.battery + w.alt.energy.grid + w.alt.energy.diesel;
      const minutes = Math.round(b.hours * 60);
      const when = d.action === 'next_day' ? L(lang, `tomorrow ${clockLabel(b.start)}`, `நாளை ${clockLabel(b.start)}`) : clockLabel(b.start);
      this.pending = { type: 'pump_on', minutes, alt: 'approve' };
      return {
        text: L(lang, `It’s ${clockLabel(this.farm.t)}. The best start is **${when}**, when solar covers ${pct(pl.solarShare)}% of the pump. Running now would take ${f1(nonSolar)} kWh from battery, grid or diesel. Run now anyway, or approve the ${when} plan?`, `இப்போது ${clockLabel(this.farm.t)}. சிறந்த நேரம் **${when}**; அப்போது மோட்டார் மின்சாரத்தில் ${pct(pl.solarShare)}% சோலாரிலிருந்து வரும். இப்போதே இயக்கினால் பேட்டரி, கிரிட் அல்லது டீசலிலிருந்து ${f1(nonSolar)} kWh எடுக்கும். இருந்தாலும் இப்போதே இயக்கவா, அல்லது ${when} திட்டத்துக்கு ஒப்புதல் தரவா?`),
        actions: [
          { id: 'approve', label: L(lang, `Approve ${when} plan`, `${when} திட்டத்துக்கு ஒப்புதல்`), kind: 'primary' },
          { id: 'confirm', label: L(lang, `Run now (${dur(b.hours, lang)})`, `இப்போதே இயக்கு (${dur(b.hours, 'ta')})`), kind: 'secondary' },
          { id: 'cancel', label: L(lang, 'Cancel', 'ரத்து'), kind: 'ghost' },
        ],
      };
    }
    this.pending = { type: 'pump_on', minutes: 30 };
    const why = d.action === 'skip_rain' ? L(lang, ` and ${f0(pl.rain24)} mm of rain is coming`, `, ${f0(pl.rain24)} மி.மீ மழையும் வருகிறது`) : '';
    return {
      text: L(lang, `Irrigation isn’t needed now: soil moisture is ${f1(d.moisturePct)}%${why}. Running the pump would waste water. Run it for 30 min anyway?`, `இப்போது பாசனம் தேவையில்லை: மண் ஈரப்பதம் ${f1(d.moisturePct)}%${why}. மோட்டாரை இயக்கினால் தண்ணீர் வீணாகும். இருந்தாலும் 30 நிமிடம் இயக்கவா?`),
      actions: [
        { id: 'confirm', label: L(lang, 'Run 30 min anyway', 'இருந்தாலும் 30 நிமிடம் இயக்கு'), kind: 'secondary' },
        { id: 'cancel', label: L(lang, 'Cancel', 'ரத்து'), kind: 'ghost' },
      ],
    };
  }

  on_pump_alert(ctx) {
    const { lang } = ctx;
    const s = this.getFarmState(ctx);
    const last = this.farm.alerts[this.farm.alerts.length - 1];
    const rules = L(lang, `Safety rules on the ESP32: stop if flow stays below ${pct(P.dry_flow_frac)}% of rated for ${P.dry_delay_min} min, and never run longer than the approved time (max ${P.max_run_min} min).`, `ESP32 பாதுகாப்பு விதிகள்: ${P.dry_delay_min} நிமிடம் தண்ணீர் ஓட்டம் ${pct(P.dry_flow_frac)}%-க்குக் கீழே இருந்தால் நிறுத்தம்; ஒப்புதல் பெற்ற நேரத்தை (அதிகபட்சம் ${P.max_run_min} நிமிடம்) தாண்டி ஒருபோதும் இயங்காது.`);
    if (last && last.type === 'dry_run') {
      return {
        text: L(lang, `**Possible dry run at ${clockLabel(last.t)}** (confidence: high): the pump drew power but no water flowed, so it was stopped automatically. Check the well water level and the foot valve before restarting.\n${rules}`, `**${clockLabel(last.t)}-க்கு dry run சாத்தியம்** (நம்பிக்கை: அதிகம்): மோட்டார் மின்சாரம் எடுத்தது ஆனால் தண்ணீர் வரவில்லை, எனவே தானாக நிறுத்தப்பட்டது. மீண்டும் இயக்கும் முன் கிணற்றின் நீர்மட்டத்தையும் foot valve-ஐயும் சரிபார்க்கவும்.\n${rules}`),
        suggestions: suggest(lang, ['status', 'irrigate']),
      };
    }
    const now = s.pump.on
      ? L(lang, `The pump is running normally: ${f0(s.r.flowLpm)} L/min at ${f1(s.r.pumpKw)} kW.`, `மோட்டார் சரியாக இயங்குகிறது: நிமிடத்துக்கு ${f0(s.r.flowLpm)} லிட்டர், ${f1(s.r.pumpKw)} kW.`)
      : L(lang, 'No alerts. The pump is off and healthy.', 'எச்சரிக்கை எதுவும் இல்லை. மோட்டார் நிறுத்தப்பட்டு நல்ல நிலையில் உள்ளது.');
    return { text: `${now}\n${rules}`, suggestions: suggest(lang, ['status', 'energy']) };
  }

  on_crop_needs(ctx) {
    const { lang } = ctx;
    const d = this.getPlan(ctx);
    const fc = this.getForecast(ctx);
    ctx.sources.push('fao56');
    const m3 = (fc.etc24 / 1000) * this.farm.sc.areaM2;
    return {
      text: L(
        lang,
        `**Tomato, flowering and fruit set** (day ${d.cropDay} after transplanting, FAO-56 mid-season stage)\n• Crop coefficient Kc **${d.kc.toFixed(2)}**: it uses ${f1(fc.etc24)} mm of water in the next 24 h, about **${f0(m3)} m³** for your ${P.area_ha} ha.\n• Keep soil moisture above **${f1(d.refillPct)}%**. Below that the plant closes its pores and growth slows (FAO-56, p = ${P.p}).\n• Keep watering steady: uneven moisture during fruiting can cause blossom-end rot.`,
        `**தக்காளி, பூக்கும் மற்றும் காய் பிடிக்கும் பருவம்** (நடவுக்குப் பின் ${d.cropDay}-ஆம் நாள், FAO-56 நடுப் பருவம்)\n• பயிர்க் குணகம் Kc **${d.kc.toFixed(2)}**: அடுத்த 24 மணி நேரத்தில் ${f1(fc.etc24)} மி.மீ தண்ணீர் பயன்படுத்தும்; உங்கள் ${P.area_ha} ஹெக்டேருக்கு சுமார் **${f0(m3)} கன மீட்டர்**.\n• மண் ஈரப்பதத்தை **${f1(d.refillPct)}%**-க்கு மேல் வைத்திருங்கள்; அதற்குக் கீழே போனால் செடி வளர்ச்சி குறையும் (FAO-56, p = ${P.p}).\n• சீராக நீர் பாய்ச்சுங்கள்: காய்க்கும் போது ஈரப்பதம் ஏறி இறங்கினால் பூ முனை அழுகல் வரலாம்.`,
      ),
      sources: [...ctx.sources, 'ucipmBer'],
      suggestions: suggest(lang, ['irrigate', 'disease', 'weather']),
    };
  }

  async on_disease_help(ctx) {
    const { lang, text: q } = ctx;
    const matches = this.tool(ctx, 'match_symptoms', () => matchDisease(q));
    if (!matches.length) {
      const fromRecords = await this.knowledgeAnswer(ctx);
      if (fromRecords) return fromRecords;
      ctx.sources.push('tnauIndex');
      return {
        text: L(lang, 'Tell me what you see so I can narrow it down: spots (colour, rings?), curling leaves, yellowing, wilting, or rot on fruit? A photo for your agriculture officer helps too.', 'நீங்கள் பார்ப்பதைச் சொல்லுங்கள்: புள்ளிகள் (என்ன நிறம், வளையங்கள் உள்ளனவா?), இலைச் சுருள், மஞ்சள் நிறம், வாடல், அல்லது பழ அழுகல்? வேளாண் அலுவலருக்கு ஒரு புகைப்படமும் உதவும்.'),
        suggestions: lang === 'ta' ? ['இலையில் வளையங்களுடன் பழுப்பு புள்ளிகள்', 'இலைகள் கீழ்நோக்கிச் சுருள்கின்றன', 'செடி திடீரென வாடுகிறது'] : ['Brown spots with rings on leaves', 'Leaves curling downward', 'Plant wilted suddenly'],
      };
    }
    const fc = this.farm.forecastSummary();
    const cond = { tmax: fc.tmax, tmin: fc.tmin, tmean: (fc.tmax + fc.tmin) / 2, rh: this.farm.readings.rhPct, rain24: fc.rain24, moisturePct: this.farm.readings.moisturePct, fcPct: P.theta_fc * 100, refillPct: this.farm.decision.refillPct };
    this.tool(ctx, 'get_farm_state', () => cond);
    const top = matches[0];
    const fits = top.d.fits(cond);
    const conf = confidenceLevel(top.score, fits);
    const confLabel = { high: L(lang, 'high', 'அதிகம்'), medium: L(lang, 'medium', 'நடுத்தரம்'), low: L(lang, 'low', 'குறைவு') }[conf];
    const d = top.d;
    ctx.sources.push(d.source);
    let weatherNote = '';
    if (d.favourable) {
      weatherNote = fits
        ? L(lang, `Current farm conditions **favour** it (${d.favourable.en}).`, `தற்போதைய பண்ணைச் சூழல் இதற்கு **சாதகமாக உள்ளது** (${d.favourable.ta}).`)
        : L(lang, `It is favoured by ${d.favourable.en}; current farm conditions don’t particularly match.`, `இது ${d.favourable.ta} உள்ளபோது பரவும்; தற்போதைய பண்ணைச் சூழல் அதற்குப் பெரிதாகப் பொருந்தவில்லை.`);
    }
    const second = matches[1] && matches[1].score >= top.score - 0.5 ? matches[1].d : null;
    if (second) ctx.sources.push(second.source);
    const lines = [
      L(lang, `**Possible ${d.name.en}** (confidence: ${confLabel})`, `**சாத்தியமான நோய்: ${d.name.ta}** (நம்பிக்கை: ${confLabel})`),
      L(lang, `Typical signs: ${d.symptoms.en}.`, `வழக்கமான அறிகுறிகள்: ${d.symptoms.ta}.`),
      weatherNote,
      L(lang, `**What to do:** ${d.manage.en}`, `**செய்ய வேண்டியது:** ${d.manage.ta}`),
      second ? L(lang, `Also possible: ${second.name.en} (${second.symptoms.en}).`, `இதுவும் சாத்தியம்: ${second.name.ta} (${second.symptoms.ta}).`) : '',
      L(lang, '_This is not a diagnosis. Please confirm with your agriculture officer or KVK, ideally with a photo._', '_இது உறுதியான கண்டறிதல் அல்ல; வேளாண் அலுவலர் அல்லது KVK-யிடம் புகைப்படத்துடன் உறுதி செய்யவும்._'),
    ];
    return { text: lines.filter(Boolean).join('\n'), suggestions: suggest(lang, ['irrigate', 'crop', 'status']) };
  }

  async on_impact(ctx) {
    const { lang } = ctx;
    const res = await this.tool(ctx, 'get_impact', () => this.getImpact());
    ctx.sources.push('season');
    const s = res.summary;
    const base = s['grid:fixed_schedule'];
    const ag = s['solar:agrisage'];
    const agGrid = s['grid:agrisage'];
    const saved = 100 * (1 - ag.waterM3Ha.median / base.waterM3Ha.median);
    const savedGridOnly = 100 * (1 - agGrid.waterM3Ha.median / base.waterM3Ha.median);
    const fh = res.fixedHours;
    return {
      text: L(
        lang,
        `**Season simulation** (tomato, ${res.seasonDays} days, ${res.seeds.length} synthetic weather years, per hectare, median)\n• **Water:** ${f0(ag.waterM3Ha.median)} m³ vs ${f0(base.waterM3Ha.median)} m³ for a fixed ${fh} h/day schedule (**−${f0(saved)}%**). Smart scheduling alone, on the same grid pump, saves ${f0(savedGridOnly)}%.\n• **Grid energy:** ${f0(base.gridKwhHa.median)} → **${f0(ag.gridKwhHa.median)} kWh**; CO₂ ${f0(base.co2KgHa.median)} → **${f0(ag.co2KgHa.median)} kg**\n• **Water stress:** ${f0(ag.stressHours.median)} h, so savings don’t cost yield\n_The baseline (${fh} h/day) and several prices are placeholders still to be verified; see the Impact and Sources tabs._`,
        `**பருவ உருவகப்படுத்துதல்** (தக்காளி, ${res.seasonDays} நாட்கள், ${res.seeds.length} செயற்கை வானிலை ஆண்டுகள், ஹெக்டேருக்கு, சராசரி)\n• **தண்ணீர்:** ${f0(ag.waterM3Ha.median)} கன மீ; தினமும் ${fh} மணி நேர நிலையான அட்டவணையில் ${f0(base.waterM3Ha.median)} கன மீ (**−${f0(saved)}%**). அதே கிரிட் மோட்டாரில் திட்டமிடல் மட்டுமே ${f0(savedGridOnly)}% சேமிக்கிறது.\n• **கிரிட் மின்சாரம்:** ${f0(base.gridKwhHa.median)} → **${f0(ag.gridKwhHa.median)} kWh**; CO₂ ${f0(base.co2KgHa.median)} → **${f0(ag.co2KgHa.median)} kg**\n• **நீர் அழுத்தம்:** ${f0(ag.stressHours.median)} மணி நேரம்; சேமிப்பால் மகசூல் குறையவில்லை\n_அடிப்படை அனுமானம் (${fh} மணி/நாள்) மற்றும் சில விலைகள் இன்னும் சரிபார்க்கப்பட வேண்டும்; Impact, Sources பகுதிகளைப் பார்க்கவும்._`,
      ),
      suggestions: suggest(lang, ['irrigate', 'about', 'why']),
    };
  }

  // Search the farmer Q&A records (three public datasets). Returns null when
  // nothing matches closely enough.
  async knowledgeAnswer(ctx) {
    if (!this.knowledge) return null;
    const { lang, text: q } = ctx;
    const { hits } = await this.tool(ctx, 'search_kb', () => this.knowledge.search(q, { k: 2, farmCrop: FARM_CROP, lang }));
    if (!hits.length) return null;
    for (const h of hits) ctx.sources.push(KB_SOURCE_KEY[h.source.id]);
    const records = hits.map((h) => ({ q: h.q, a: h.a, source: h.source, place: h.place, month: h.month, crop: h.crop }));
    const text = L(
      lang,
      '**From farmer Q&A records:** the closest matches to your question. AgriSage has not checked these, so confirm with your agriculture officer or KVK before acting. Chemical doses are removed on purpose.',
      '**விவசாயிகள் கேள்வி-பதில் பதிவுகளிலிருந்து:** உங்கள் கேள்விக்கு மிக நெருக்கமானவை. இவற்றை AgriSage சரிபார்க்கவில்லை; செயல்படும் முன் வேளாண் அலுவலர் அல்லது KVK-யிடம் உறுதி செய்யவும். மருந்து அளவுகள் வேண்டுமென்றே நீக்கப்பட்டுள்ளன. பதிவுகள் ஆங்கிலத்தில் உள்ளன.',
    );
    return { text, records, suggestions: suggest(lang, ['irrigate', 'disease', 'about']) };
  }

  async on_farm_knowledge(ctx) {
    const out = await this.knowledgeAnswer(ctx);
    if (out) return out;
    const { lang } = ctx;
    return {
      text: L(lang, 'I couldn’t find a close match in the farmer Q&A records. Try naming the crop and the problem, for example “whitefly control in chilli” or “seed rate for paddy”.', 'விவசாயிகள் கேள்வி-பதில் பதிவுகளில் நெருக்கமான பதில் கிடைக்கவில்லை. பயிரையும் பிரச்சனையையும் சேர்த்துக் கேளுங்கள்; உதாரணமாக “மிளகாயில் வெள்ளை ஈ கட்டுப்பாடு” அல்லது “நெல் விதை அளவு”.'),
      suggestions: suggest(lang, ['irrigate', 'disease', 'status']),
    };
  }

  async on_other(ctx) {
    const out = await this.knowledgeAnswer(ctx);
    if (out) return out;
    return this.fallback(ctx);
  }

  fallback({ lang }) {
    return {
      text: L(lang, 'I couldn’t match that to this farm or to the farmer Q&A records. I can help with irrigation, soil and weather, solar and pump, crop water needs, crop diseases and general farming questions. Try one of these:', 'இதை இந்தப் பண்ணையுடனோ விவசாயிகள் கேள்வி-பதில் பதிவுகளுடனோ பொருத்த முடியவில்லை. நீர்ப்பாசனம், மண் & வானிலை, சோலார் & மோட்டார், பயிரின் நீர் தேவை, பயிர் நோய்கள், பொதுவான விவசாயக் கேள்விகள் பற்றி உதவ முடியும். இவற்றில் ஒன்றைக் கேளுங்கள்:'),
      suggestions: suggest(lang, ['irrigate', 'energy', 'disease', 'impact']),
    };
  }

  // Button clicks (and short yes/no replies) on a pending confirmation.
  act(id, { langPref = 'auto' } = {}) {
    const lang = langPref === 'auto' ? this.lastLang : langPref;
    const p = this.pending;
    this.pending = null;
    const base = { lang, intent: 'confirm', tools: [], sources: [], actions: [], suggestions: [] };
    const d = this.farm.decision;
    const b = d.plan.blocks[0];
    if ((id === 'approve' || (id === 'confirm' && p?.type === 'approve')) && b) {
      this.farm.approvePlan();
      const text = this.farm.pump.on
        ? L(lang, `Approved. Pump **ON**: command sent to the ESP32 (decision ${d.id}).`, `ஒப்புதல் பெற்றது. மோட்டார் **இயக்கப்பட்டது**: ESP32-க்கு கட்டளை அனுப்பப்பட்டது (முடிவு ${d.id}).`)
        : L(lang, `Approved. AgriSage will switch the pump on ${whenLabel(b.start, this.farm.t, lang)} and off by **${clockLabel(b.end)}**, re-checking every hour. You can stop it any time.`, `ஒப்புதல் பெற்றது. AgriSage ${whenLabel(b.start, this.farm.t, lang)} மோட்டாரை இயக்கி **${clockLabel(b.end)}**-க்குள் நிறுத்தும்; ஒவ்வொரு மணி நேரமும் மீண்டும் சரிபார்க்கும். எப்போது வேண்டுமானாலும் நிறுத்தலாம்.`);
      return { ...base, text, tools: ['approve_plan'], suggestions: suggest(lang, ['status', 'energy']) };
    }
    if (id === 'cancel' || !p) {
      return { ...base, text: p ? L(lang, 'OK, nothing changed.', 'சரி, எதுவும் மாற்றப்படவில்லை.') : L(lang, 'There’s nothing waiting for confirmation.', 'உறுதிப்படுத்த எதுவும் காத்திருக்கவில்லை.') };
    }
    if (p.type === 'pump_off') {
      this.farm.requestPump('off', { source: 'chat' });
      this.farm.confirmPending();
      return { ...base, text: L(lang, 'Pump **OFF**. Command sent to the ESP32.', 'மோட்டார் **நிறுத்தப்பட்டது**. ESP32-க்கு கட்டளை அனுப்பப்பட்டது.'), tools: ['pump_command'] };
    }
    if (p.type === 'pump_on') {
      const cmd = this.farm.requestPump('on', { minutes: p.minutes, source: 'chat' });
      this.farm.confirmPending();
      return {
        ...base,
        text: L(lang, `Pump **ON**. Command sent to the ESP32: run ${cmd.runMinutes} min, hard limit ${cmd.maxMinutes} min, dry-run cutoff active.`, `மோட்டார் **இயக்கப்பட்டது**. ESP32-க்கு கட்டளை: ${cmd.runMinutes} நிமிடம் இயக்கம், அதிகபட்ச வரம்பு ${cmd.maxMinutes} நிமிடம், dry-run பாதுகாப்பு செயலில் உள்ளது.`),
        tools: ['pump_command'],
        suggestions: suggest(lang, ['energy', 'stop']),
      };
    }
    return { ...base, text: L(lang, 'Done.', 'முடிந்தது.') };
  }

  // Messages the assistant posts by itself when the farm reports an event.
  narrate(type, data, lang = this.lastLang) {
    if (type === 'pump' && data.on && data.source === 'plan') {
      const changed = data.approvedM3 && Math.abs(data.approvedM3 - data.targetM3) >= 0.5;
      const note = changed
        ? L(lang, ` Re-planned since approval: ${f0(data.approvedM3)} → ${f0(data.targetM3)} m³, using the latest forecast.`, ` ஒப்புதலுக்குப் பின் புதிய முன்னறிவிப்பால் மாற்றம்: ${f0(data.approvedM3)} → ${f0(data.targetM3)} கன மீ.`)
        : '';
      return { kind: 'start', text: L(lang, `${clockLabel(this.farm.t)}: approved plan started. Pump **ON**, target ${f0(data.targetM3)} m³, hard limit ${data.maxMinutes} min.${note}`, `${clockLabel(this.farm.t)}: ஒப்புதல் பெற்ற திட்டம் தொடங்கியது. மோட்டார் **இயக்கப்பட்டது**, இலக்கு ${f0(data.targetM3)} கன மீ, அதிகபட்ச வரம்பு ${data.maxMinutes} நிமிடம்.${note}`) };
    }
    if (type === 'pump' && !data.on) {
      const t = this.farm.today;
      const share = t.pumpKwh > 0 ? Math.round((100 * (t.pv + t.battery)) / t.pumpKwh) : 0;
      const why = {
        target: L(lang, 'target reached', 'இலக்கு அடைந்தது'),
        field_capacity: L(lang, 'soil at field capacity', 'மண் முழுமையாக நனைந்தது'),
        max_runtime: L(lang, 'max runtime reached', 'அதிகபட்ச நேரம் முடிந்தது'),
        farmer: L(lang, 'stopped by farmer', 'விவசாயி நிறுத்தினார்'),
        dry_run: L(lang, 'no water flow (dry-run cutoff)', 'தண்ணீர் ஓட்டம் இல்லை (dry-run பாதுகாப்பு)'),
      }[data.reason] || data.reason;
      if (data.reason === 'dry_run') {
        return { kind: 'alert', text: L(lang, `${clockLabel(this.farm.t)}: **pump stopped automatically**. It drew power but no water flowed for ${P.dry_delay_min} min (possible dry well or air lock). Check the well level and foot valve before restarting.`, `${clockLabel(this.farm.t)}: **மோட்டார் தானாக நிறுத்தப்பட்டது**. ${P.dry_delay_min} நிமிடம் மின்சாரம் எடுத்தும் தண்ணீர் வரவில்லை (கிணற்றில் நீர் இல்லாமல் இருக்கலாம் அல்லது காற்று அடைப்பு). மீண்டும் இயக்கும் முன் கிணற்று நீர்மட்டத்தையும் foot valve-ஐயும் சரிபார்க்கவும்.`) };
      }
      return { kind: 'stop', text: L(lang, `${clockLabel(this.farm.t)}: pump **OFF** (${why}). Ran ${data.ranMin} min, delivered ${f1(data.deliveredM3)} m³; today ${share}% solar-powered.`, `${clockLabel(this.farm.t)}: மோட்டார் **நிறுத்தப்பட்டது** (${why}). ${data.ranMin} நிமிடம் இயங்கி ${f1(data.deliveredM3)} கன மீ தண்ணீர் பாய்ச்சியது; இன்று ${share}% சோலார் மின்சாரம்.`) };
    }
    return null;
  }
}

function blockList(blocks, tNow, lang) {
  return blocks
    .map((b) => {
      const day = Math.floor(b.start / 24) - Math.floor(tNow / 24);
      const pre = day > 0 ? L(lang, 'tomorrow ', 'நாளை ') : '';
      return `${pre}${clockLabel(b.start)}–${clockLabel(b.end)}`;
    })
    .join(', ');
}

function energyPhrase(e, lang) {
  const parts = [];
  if (e.battery > 0.05) parts.push(L(lang, `${f1(e.battery)} kWh from the solar-charged battery`, `சோலாரில் சார்ஜ் ஆன பேட்டரியிலிருந்து ${f1(e.battery)} kWh`));
  if (e.grid > 0.05) parts.push(L(lang, `${f1(e.grid)} kWh from grid`, `கிரிட்டிலிருந்து ${f1(e.grid)} kWh`));
  if (e.diesel > 0.05) parts.push(L(lang, `${f1(e.diesel)} kWh diesel`, `டீசல் ${f1(e.diesel)} kWh`));
  if (!parts.length) return L(lang, ', no grid or diesel needed', '; கிரிட் அல்லது டீசல் தேவையில்லை');
  return lang === 'ta' ? `; ${parts.join(', ')}` : `; ${parts.join(', ')}`;
}

function moistureStatus(frac, lang) {
  if (frac > 1) return L(lang, 'water stress', 'நீர் அழுத்தம்');
  if (frac >= 0.6) return L(lang, 'low, irrigate soon', 'குறைவு, விரைவில் பாய்ச்சவும்');
  return L(lang, 'good', 'நன்று');
}

function nextGridChange(t, on) {
  for (let i = 1; i <= 48 * 4; i++) {
    const tt = t + i / 4;
    const clock = tt - 24 * Math.floor(tt / 24);
    const ok = P.grid_spells.some(([a, b]) => clock >= a && clock < b);
    if (ok !== on) return Math.floor(tt);
  }
  return t;
}

const SUGGEST = {
  irrigate: ['Should I irrigate today?', 'இன்று தண்ணீர் பாய்ச்ச வேண்டுமா?'],
  why: ['Why?', 'ஏன்?'],
  wait: ['What if I wait until tomorrow?', 'நாளை வரை காத்திருந்தால் என்ன ஆகும்?'],
  now: ['What if I irrigate now?', 'இப்போதே பாய்ச்சினால் என்ன?'],
  status: ['Soil moisture now?', 'மண் ஈரப்பதம் எவ்வளவு?'],
  weather: ['Will it rain?', 'மழை வருமா?'],
  energy: ['Battery and solar status', 'பேட்டரி எவ்வளவு இருக்கு?'],
  stop: ['Turn off the pump', 'மோட்டாரை நிறுத்து'],
  crop: ['How much water does tomato need now?', 'தக்காளிக்கு எவ்வளவு தண்ணீர் தேவை?'],
  disease: ['Leaves have brown spots with rings', 'இலைகள் கீழ்நோக்கிச் சுருள்கின்றன'],
  impact: ['How much water does AgriSage save?', 'எவ்வளவு தண்ணீர் சேமிக்கிறது?'],
  about: ['How does AgriSage work?', 'இது எப்படி வேலை செய்கிறது?'],
};

export function suggest(lang, keys) {
  return keys.map((k) => SUGGEST[k][lang === 'ta' ? 1 : 0]);
}

export { SOURCES };
