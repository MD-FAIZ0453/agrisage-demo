// Sources tab: every parameter with its source and status, references,
// methods, and the MQTT contract shared with the ESP32.

import { PARAM_TABLE } from '../params.js';
import { SOURCES } from '../agent/kb.js';
import { icon } from './icons.js';

const T = {
  en: {
    title: 'Sources and assumptions',
    lede: 'Every number in this demo comes from a parameter below, the digital twin, the optimizer or the season simulation. Placeholders are labelled; nothing is hidden.',
    params: 'Model parameters',
    counts: (s, c, u) => `${s} sourced · ${c} to confirm · ${u} placeholders`,
    status: { sourced: 'sourced', check: 'confirm', UNVERIFIED: 'UNVERIFIED' },
    cols: ['Parameter', 'Value', 'Source', 'Status'],
    refs: 'References',
    methods: 'How it works',
    methodList: [
      ['Reference evapotranspiration (ET₀)', 'FAO-56 hourly Penman-Monteith (eq. 53) from temperature, humidity, wind and solar radiation.'],
      ['Soil water', 'FAO-56 single crop coefficient bucket model, applied to the drip wetted zone (TAW × wetted fraction); stress coefficient Ks above RAW.'],
      ['Solar', 'Haurwitz clear-sky irradiance with Kasten–Czeplak cloud attenuation; PV output with a NOCT cell-temperature model.'],
      ['Decision', 'Rolling 24-hour plan re-solved every simulated hour: chooses pump minutes per hour to avoid crop stress at the lowest energy and water cost. Prototype of the MILP MPC (PuLP/CBC) in the full system.'],
      ['Assistant', 'Offline intent classifier (character n-gram TF-IDF, nearest neighbour) for Tamil, English and Tanglish: 47 of 50 held-out questions classified correctly; with the rule that questions naming another crop go to the farmer records, 49 of 50 reach the right kind of answer. Replies are templates filled only with tool outputs. General farming questions search the farmer Q&A datasets listed above.'],
      ['Season impact', 'Hour-by-hour 135-day tomato season, 3 policies × 2 energy setups × 5 synthetic weather seasons.'],
    ],
    mqtt: 'MQTT contract (simulator and ESP32 identical)',
    kbTitle: 'Farmer Q&A datasets in the chatbot',
    kbLede: 'General farming questions are answered by quoting the closest records from these datasets, searched in your browser. They are not checked by AgriSage.',
    kbCols: ['Dataset', 'Licence', 'Records used'],
    kbChanges: (st) => `Changes made: FarmerChat limited to India (${st.farmerchat_india.toLocaleString('en-IN')} of ${st.farmerchat_in.toLocaleString('en-IN')} rows) and to English or Tamil text; greeting, price, contact and weather questions dropped; phone numbers, e-mail addresses, links and emoji removed; answers trimmed; doses removed from ${st.masked.toLocaleString('en-IN')} records; ${st.duplicates_removed.toLocaleString('en-IN')} duplicate questions removed. CROP is non-commercial (CC-BY-NC-4.0): fine for this demo, not for a commercial product.`,
    kbLoading: 'Loading dataset details…',
    simulated: 'What is simulated in this demo',
    simList: [
      'Weather: synthetic scenario days and seasons. Next step: NASA POWER hourly history for Krishnagiri, downloaded once.',
      'Sensors and ESP32: emulated in the browser on the real MQTT topics and payloads.',
      'Farm hardware sizes, prices and the farmer baseline schedule: placeholders marked UNVERIFIED.',
      'Voice: read-aloud uses on-device voices; voice input uses the browser’s speech recognition, which may send audio to the browser vendor. The field version uses on-device Tamil ASR and TTS.',
    ],
  },
  ta: {
    title: 'ஆதாரங்களும் அனுமானங்களும்',
    lede: 'இந்த டெமோவில் உள்ள ஒவ்வொரு எண்ணும் கீழே உள்ள அளவுரு, டிஜிட்டல் இரட்டை, optimizer அல்லது பருவ உருவகப்படுத்துதலிலிருந்து வருகிறது. அனுமானங்கள் குறிக்கப்பட்டுள்ளன; எதுவும் மறைக்கப்படவில்லை.',
    params: 'மாதிரி அளவுருக்கள்',
    counts: (s, c, u) => `${s} ஆதாரம் உள்ளவை · ${c} உறுதி செய்ய வேண்டியவை · ${u} அனுமானங்கள்`,
    status: { sourced: 'ஆதாரம்', check: 'உறுதி செய்க', UNVERIFIED: 'UNVERIFIED' },
    cols: ['அளவுரு', 'மதிப்பு', 'ஆதாரம்', 'நிலை'],
    refs: 'குறிப்புகள்',
    methods: 'இது எப்படி வேலை செய்கிறது',
    methodList: [
      ['குறிப்பு ஆவியுயிர்ப்பு', 'வெப்பநிலை, ஈரப்பதம், காற்று, சூரியக் கதிர்வீச்சிலிருந்து FAO-56 மணிநேர Penman-Monteith (சமன்பாடு 53).'],
      ['மண் நீர்', 'சொட்டு நீர் நனைந்த பகுதிக்குப் பயன்படுத்தப்பட்ட FAO-56 ஒற்றைப் பயிர்க் குணக bucket மாதிரி; RAW-க்கு மேல் நீர் அழுத்தக் குணகம் Ks.'],
      ['சோலார்', 'Haurwitz தெளிவான வான கதிர்வீச்சு, Kasten–Czeplak மேகக் குறைப்பு; NOCT செல் வெப்பநிலை மாதிரியுடன் PV உற்பத்தி.'],
      ['முடிவு', 'ஒவ்வொரு உருவக மணி நேரமும் மீண்டும் தீர்க்கப்படும் 24 மணி நேரத் திட்டம்: பயிருக்கு நீர் அழுத்தம் இல்லாமல் குறைந்த மின்சார, நீர்ச் செலவில் ஒவ்வொரு மணிக்கும் மோட்டார் நிமிடங்களைத் தேர்வு செய்கிறது. முழு அமைப்பில் உள்ள MILP MPC-இன் (PuLP/CBC) முன்மாதிரி.'],
      ['உதவியாளர்', 'தமிழ், ஆங்கிலம், Tanglish-க்கான offline நோக்க வகைப்படுத்தி (எழுத்து n-gram TF-IDF, அருகிலுள்ள எடுத்துக்காட்டு): தனியாக வைத்த 50 கேள்விகளில் 47 சரி; வேறு பயிரைக் குறிப்பிடும் கேள்விகள் விவசாயி பதிவுகளுக்குச் செல்லும் விதியுடன் 50-இல் 49 சரியான பதில் வகையை அடைகின்றன. பதில்கள் கருவி வெளியீடுகளால் மட்டுமே நிரப்பப்படும் வார்ப்புருக்கள்; பொதுவான விவசாயக் கேள்விகள் மேலே உள்ள தரவுத் தொகுப்புகளில் தேடப்படும்.'],
      ['பருவ தாக்கம்', 'மணிக்கு மணி 135 நாள் தக்காளிப் பருவம், 3 கொள்கைகள் × 2 மின் அமைப்புகள் × 5 செயற்கை வானிலைப் பருவங்கள்.'],
    ],
    mqtt: 'MQTT ஒப்பந்தம் (simulator, ESP32 இரண்டிலும் ஒரே மாதிரி)',
    kbTitle: 'உதவியாளரில் உள்ள விவசாயி கேள்வி-பதில் தரவுத் தொகுப்புகள்',
    kbLede: 'பொதுவான விவசாயக் கேள்விகளுக்கு, இந்தத் தொகுப்புகளிலிருந்து மிக நெருக்கமான பதிவுகள் உங்கள் browser-இலேயே தேடப்பட்டு மேற்கோள் காட்டப்படுகின்றன. இவற்றை AgriSage சரிபார்க்கவில்லை.',
    kbCols: ['தரவுத் தொகுப்பு', 'உரிமம்', 'பயன்படுத்திய பதிவுகள்'],
    kbChanges: (st) => `செய்த மாற்றங்கள்: FarmerChat இந்தியாவுக்கு மட்டும் (${st.farmerchat_in.toLocaleString('en-IN')}-இல் ${st.farmerchat_india.toLocaleString('en-IN')} வரிசைகள்), ஆங்கிலம் அல்லது தமிழ் உரை மட்டும்; வணக்கம், விலை, தொடர்பு, வானிலைக் கேள்விகள் நீக்கம்; தொலைபேசி எண்கள், மின்னஞ்சல்கள், இணைப்புகள், emoji நீக்கம்; பதில்கள் சுருக்கம்; ${st.masked.toLocaleString('en-IN')} பதிவுகளில் மருந்து அளவுகள் நீக்கம்; ${st.duplicates_removed.toLocaleString('en-IN')} மீண்டும் வந்த கேள்விகள் நீக்கம். CROP வணிகம் சாரா உரிமம் (CC-BY-NC-4.0): இந்த டெமோவுக்குச் சரி, வணிகப் பொருளுக்கு அல்ல.`,
    kbLoading: 'தரவுத் தொகுப்பு விவரங்கள் ஏற்றப்படுகின்றன…',
    simulated: 'இந்த டெமோவில் உருவகப்படுத்தப்பட்டவை',
    simList: [
      'வானிலை: செயற்கை நாட்களும் பருவங்களும். அடுத்து: கிருஷ்ணகிரிக்கான NASA POWER மணிநேர வரலாறு, ஒருமுறை பதிவிறக்கம்.',
      'சென்சார்களும் ESP32-உம்: உண்மையான MQTT topics, payloads-உடன் browser-இல் உருவகம்.',
      'பண்ணைக் கருவி அளவுகள், விலைகள், விவசாயியின் அடிப்படை அட்டவணை: UNVERIFIED என்று குறிக்கப்பட்ட அனுமானங்கள்.',
      'குரல்: browser பேச்சு உருவாக்கம்; குரல் உள்ளீடு browser-இன் பேச்சு அறிதலைப் பயன்படுத்துகிறது. களப் பதிப்பு சாதனத்திலேயே இயங்கும் தமிழ் ASR, TTS பயன்படுத்தும்.',
    ],
  },
};

const MQTT = [
  ['farm/{farm_id}/sensor/soil', '{"ts", "moisture_pct", "soil_temp_c"}'],
  ['farm/{farm_id}/sensor/energy', '{"ts", "pv_kw", "battery_soc", "pump_kw"}'],
  ['farm/{farm_id}/sensor/flow', '{"ts", "flow_lpm", "total_l"}'],
  ['farm/{farm_id}/sensor/storage', '{"ts", "temp_c", "rh_pct"}'],
  ['farm/{farm_id}/cmd/pump', '{"action": "on" | "off", "max_minutes", "decision_id"}'],
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fmtValue(r) {
  if (Array.isArray(r.value)) return r.value.map(([a, b]) => `${String(a).padStart(2, '0')}–${String(b).padStart(2, '0')}`).join(', ') + ' h';
  return `${r.value}${r.unit && r.unit !== '–' ? ` ${r.unit}` : ''}`;
}

export function renderSources(root, lang) {
  const t = T[lang];
  const counts = { sourced: 0, check: 0, UNVERIFIED: 0 };
  PARAM_TABLE.forEach((r) => counts[r.status]++);
  let group = null;
  const rows = [];
  for (const r of PARAM_TABLE) {
    if (r.group !== group) {
      group = r.group;
      rows.push(`<tr class="grp"><th colspan="4">${esc(group)}</th></tr>`);
    }
    rows.push(`<tr><td>${esc(r.label)}</td><td class="v">${esc(fmtValue(r))}</td><td>${esc(r.source)}</td><td><span class="pill ${r.status}">${esc(t.status[r.status])}</span></td></tr>`);
  }
  const refs = Object.values(SOURCES)
    .filter((s) => s.url)
    .map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`)
    .concat('<li><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener">NASA POWER (planned weather source)</a></li>')
    .join('');
  root.innerHTML = `<div class="page">
    <div class="page-head"><div><h1>${esc(t.title)}</h1><p class="lede">${esc(t.lede)}</p></div></div>
    <div class="src-grid">
      <section class="panel">
        <div class="panel-head"><h2>${esc(t.params)}</h2></div>
        <p class="count-row">${esc(t.counts(counts.sourced, counts.check, counts.UNVERIFIED))}</p>
        <div class="metrics"><table class="params"><thead><tr>${t.cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>
      </section>
      <div class="src-col">
        <section class="panel"><div class="panel-head"><h2>${esc(t.kbTitle)}</h2></div><div class="prose"><p>${esc(t.kbLede)}</p></div><div class="metrics" id="kb-sources"><p class="count-row">${esc(t.kbLoading)}</p></div></section>
        <section class="panel"><div class="panel-head"><h2>${esc(t.simulated)}</h2></div><div class="prose"><ul>${t.simList.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></section>
        <section class="panel"><div class="panel-head"><h2>${esc(t.methods)}</h2></div><div class="prose"><ul>${t.methodList.map(([a, b]) => `<li><strong>${esc(a)}.</strong> ${esc(b)}</li>`).join('')}</ul></div></section>
        <section class="panel"><div class="panel-head"><h2>${esc(t.refs)}</h2></div><div class="prose"><ul>${refs}</ul></div></section>
        <section class="panel"><div class="panel-head"><h2>${esc(t.mqtt)}</h2></div><div class="metrics" style="padding:10px 0 4px"><table><tbody>${MQTT.map(([a, b]) => `<tr><td style="text-align:left">${esc(a)}</td><td style="text-align:left;white-space:normal">${esc(b)}</td></tr>`).join('')}</tbody></table></div></section>
      </div>
    </div>
  </div>`;
  root.querySelectorAll('a[target="_blank"]').forEach((a) => a.insertAdjacentHTML('beforeend', ` ${icon('link')}`));
  fetch('data/kb/manifest.json')
    .then((r) => r.json())
    .then((m) => {
      const box = root.querySelector('#kb-sources');
      if (!box) return;
      const rows = m.sources
        .map((x) => `<tr><td style="text-align:left;white-space:normal"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a><br><span class="sub">${esc(x.by)}</span></td><td>${esc(x.license)}</td><td>${x.rows.toLocaleString('en-IN')}</td></tr>`)
        .join('');
      box.innerHTML = `<table><thead><tr>${t.kbCols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table><p class="sub" style="padding:10px 16px 14px">${esc(t.kbChanges(m.stats))}</p>`;
    })
    .catch(() => {});
}
