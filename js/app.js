// AgriSage live demo: wires the simulated farm, the assistant and the UI.

import { Farm, clockLabel } from './farm.js';
import { Agent, dur } from './agent/agent.js';
import { SOURCES } from './agent/kb.js';
import { P } from './params.js';
import { SCENARIOS } from './weather.js';
import { STR } from './ui/i18n.js';
import { icon } from './ui/icons.js';
import { stripData, renderStrip, renderLegend, tooltipHtml, readingAt, tableHtml } from './ui/daystrip.js';
import { createImpact } from './ui/impact.js';
import { renderSources } from './ui/sources.js';
import { voice } from './voice.js';
import { KnowledgeBase } from './kb/search.js';

const $ = (sel) => document.querySelector(sel);
const SPEEDS = [1, 5, 20]; // simulated minutes per real second
const END_T = 70; // scenarios carry three days of weather

const store = {
  get(k) {
    try {
      return localStorage.getItem(`agrisage:${k}`);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`agrisage:${k}`, v);
    } catch {
      /* storage unavailable */
    }
  },
};

const urlLang = new URLSearchParams(location.search).get('lang');
const state = {
  lang: urlLang === 'ta' || urlLang === 'en' ? urlLang : store.get('lang') === 'ta' ? 'ta' : 'en',
  playing: false,
  speedIdx: 1,
  tts: false,
  tab: 'live',
  dirty: true,
  lastRender: 0,
  hoverT: null,
  strip: null,
  data: null,
  mqttShown: null,
  stripHour: null,
  emph: false,
  flashAt: null,
};
const FLASH_MS = 900;
const PLAN_INTENTS = new Set(['should_irrigate', 'why_decision', 'what_if', 'pump_control', 'confirm']);
const s = () => STR[state.lang];

const farm = new Farm('hot_dry');
const impact = createImpact($('#panel-impact'), { getLang: () => state.lang });
// Farmer Q&A index (tools/build_kb.py): fetched shard by shard, only when asked.
const knowledge = new KnowledgeBase((path) => fetch(`data/kb/${path}`).then((r) => {
  if (!r.ok) throw new Error(`knowledge index: ${path} ${r.status}`);
  return r.json();
}));
const agent = new Agent(farm, { getImpact: () => impact.get(), knowledge });

const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---------- Markdown-lite for assistant replies ----------
function md(text) {
  const inline = (x) => esc(x).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>');
  let html = '';
  let list = null;
  for (const ln of text.split('\n')) {
    const ul = ln.match(/^•\s+(.*)/);
    const ol = ln.match(/^\d+\.\s+(.*)/);
    if (ul || ol) {
      const type = ul ? 'ul' : 'ol';
      if (list !== type) {
        if (list) html += `</${list}>`;
        html += `<${type}>`;
        list = type;
      }
      html += `<li>${inline((ul || ol)[1])}</li>`;
    } else {
      if (list) {
        html += `</${list}>`;
        list = null;
      }
      if (ln.trim()) html += `<p>${inline(ln)}</p>`;
    }
  }
  if (list) html += `</${list}>`;
  return html;
}

// ---------- Chat ----------
const log = $('#chat-log');
const scrollChat = () => requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));

function addUser(text) {
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  if (/[஀-௿]/.test(text)) el.lang = 'ta';
  log.append(el);
  scrollChat();
}

function addBot(resp) {
  const el = document.createElement('div');
  el.className = 'msg bot';
  if (resp.lang === 'ta') el.lang = 'ta';
  const tools = [...new Set(resp.tools || [])];
  const srcs = [...new Set(resp.sources || [])].map((k) => SOURCES[k]).filter(Boolean);
  const meta =
    tools.length || srcs.length
      ? `<div class="meta">${tools.length ? `<span class="tools">${esc(s().tools)}: ${tools.map(esc).join(' · ')}</span>` : ''}${
          srcs.length ? `<span class="srcs">${srcs.map((x) => (x.url ? `<a class="src" href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}${icon('link')}</a>` : `<span class="src">${esc(x.label)}</span>`)).join('')}</span>` : ''
        }</div>`
      : '';
  el.innerHTML = `<span class="avatar">${icon('sprout')}</span><div class="bubble">${md(resp.text)}${meta}</div>`;
  if (resp.records?.length) el.querySelector('.bubble').append(recordCards(resp.records, resp.lang));
  if (resp.actions?.length) {
    const box = document.createElement('div');
    box.className = 'msg-actions';
    for (const a of resp.actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn ${a.kind || ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => {
        box.querySelectorAll('button').forEach((x) => (x.disabled = true));
        const r = agent.act(a.id, { langPref: resp.lang });
        addBot(r);
        if (r.suggestions?.length) setChips(r.suggestions);
        state.dirty = true;
      });
      box.append(b);
    }
    el.querySelector('.bubble').append(box);
  }
  if (PLAN_INTENTS.has(resp.intent) && farm.decision.plan.blocks.length) {
    el.classList.add('has-plan');
    el.addEventListener('pointerenter', () => setEmph(true));
    el.addEventListener('pointerleave', () => setEmph(false));
    el.addEventListener('focusin', () => setEmph(true));
    el.addEventListener('focusout', () => setEmph(false));
    if (resp.intent === 'should_irrigate') state.flashAt = performance.now();
  }
  log.append(el);
  scrollChat();
  if (state.tts) voice.speak(resp.text, resp.lang);
}

// Dataset records are untrusted text: built with textContent only.
function recordCards(records, lang) {
  const t = STR[lang] || s();
  const wrap = document.createElement('div');
  wrap.className = 'records';
  for (const r of records) {
    const card = document.createElement('article');
    card.className = 'record';
    const q = document.createElement('p');
    q.className = 'rec-q';
    const k = document.createElement('span');
    k.className = 'rec-k';
    k.textContent = t.recQ;
    q.append(k, document.createTextNode(r.q));
    const a = document.createElement('p');
    a.className = 'rec-a';
    const tag = '[dose: ask your agriculture officer or KVK]';
    r.a.split(tag).forEach((part, i, arr) => {
      a.append(document.createTextNode(part));
      if (i < arr.length - 1) {
        const d = document.createElement('span');
        d.className = 'dose';
        d.textContent = t.doseRemoved;
        a.append(d);
      }
    });
    const src = document.createElement('p');
    src.className = 'rec-src';
    const where = [r.source.label, r.place, r.month].filter(Boolean).join(' · ');
    src.append(document.createTextNode(`${where} · `));
    const link = document.createElement('a');
    link.href = r.source.url;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = `${r.source.name}, ${r.source.license}`;
    src.append(link);
    card.append(q, a, src);
    wrap.append(card);
  }
  return wrap;
}

function setEmph(v) {
  state.emph = v;
  state.dirty = true;
}

function addEvent(kind, text) {
  const el = document.createElement('div');
  el.className = `event ${kind}`;
  const ic = { start: 'pump', stop: 'check', alert: 'alert', note: 'reset' }[kind] || 'decision';
  el.innerHTML = `${kind === 'note' ? '' : icon(ic)}<div>${md(text)}</div>`;
  log.append(el);
  scrollChat();
  if (state.tts && kind !== 'note') voice.speak(text, agent.lastLang);
}

const DEFAULT_CHIPS = {
  en: ['Should I irrigate today?', 'இன்று தண்ணீர் பாய்ச்ச வேண்டுமா?', 'What if I wait until tomorrow?', 'Battery and solar status', 'Leaves have brown spots with rings', 'How much water does AgriSage save?'],
  ta: ['இன்று தண்ணீர் பாய்ச்ச வேண்டுமா?', 'Should I irrigate today?', 'நாளை வரை காத்திருந்தால் என்ன ஆகும்?', 'பேட்டரி எவ்வளவு இருக்கு?', 'இலைகள் கீழ்நோக்கிச் சுருள்கின்றன', 'எவ்வளவு தண்ணீர் சேமிக்கிறது?'],
};

function setChips(list) {
  const box = $('#chips');
  box.innerHTML = '';
  for (const q of list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = q;
    if (/[஀-௿]/.test(q)) b.lang = 'ta';
    b.addEventListener('click', () => ask(q));
    box.append(b);
  }
  box.scrollLeft = 0;
}

let busy = false;
async function ask(text) {
  const q = text.trim();
  if (!q || busy) return;
  busy = true;
  $('#ask').value = '';
  addUser(q);
  const typing = document.createElement('div');
  typing.className = 'msg bot';
  typing.innerHTML = `<span class="avatar">${icon('sprout')}</span><div class="typing">${esc(s().thinking)}</div>`;
  log.append(typing);
  scrollChat();
  const [resp] = await Promise.all([agent.respond(q, { langPref: 'auto' }), new Promise((r) => setTimeout(r, 320))]);
  typing.remove();
  addBot(resp);
  setChips(resp.suggestions?.length ? resp.suggestions : DEFAULT_CHIPS[state.lang]);
  busy = false;
  state.dirty = true;
}

// ---------- Farm events ----------
farm.on((type, data) => {
  state.dirty = true;
  if (type === 'pump') {
    const n = agent.narrate(type, data, agent.lastLang);
    if (n) addEvent(n.kind, n.text);
  }
});

// ---------- Decision banner ----------
function renderDecision() {
  const d = farm.decision;
  const t = s();
  const el = $('#decision');
  const pl = d.plan;
  const b = pl.blocks[0];
  const action = farm.pump.on ? 'running' : d.action;
  el.dataset.action = action;
  const m = d.moisturePct.toFixed(1);
  const r = d.refillPct.toFixed(1);
  let title;
  let sub;
  let facts = [];
  let iconName = 'drop';
  const timeSpan = (x) => `<span class="time">${x}</span>`;
  if (action === 'running') {
    const ran = Math.round((farm.t - farm.pump.since) * 60);
    title = esc(t.verdict.running());
    sub = t.verdictSub.running(ran, farm.pump.deliveredM3.toFixed(1));
    iconName = 'pump';
    const td = farm.today;
    facts = [
      [t.stWater, `${farm.pump.deliveredM3.toFixed(1)}<small>/ ${farm.pump.targetM3.toFixed(0)} m³</small>`],
      [t.stSolar, `${td.pumpKwh > 0 ? Math.round((100 * (td.pv + td.battery)) / td.pumpKwh) : 0}<small>%</small>`],
      [t.stOther, `${(td.grid + td.diesel).toFixed(1)}<small>kWh</small>`],
    ];
  } else if (action === 'irrigate_later' || action === 'irrigate_now' || action === 'next_day') {
    const verdict = t.verdict[action](clockLabel(b.start), clockLabel(b.end));
    title = esc(verdict).replace(/(\d{2}:\d{2})/g, (x) => timeSpan(x));
    sub = pl.stressEtaH !== null ? t.verdictSub.stress(m, r, dur(pl.stressEtaH, state.lang, state.lang === 'ta')) : t.verdictSub.ok(m, r);
    facts = [
      [t.stWater, `${Math.round(pl.volumeM3)}<small>m³</small>`],
      [t.stSolar, `${Math.round(pl.solarShare * 100)}<small>%</small>`],
      [t.stOther, `${(pl.energy.grid + pl.energy.diesel).toFixed(1)}<small>kWh</small>`],
      [t.stStress, `${Math.round(pl.noIrrStressHours)}<small>${t.hours}</small>`],
    ];
  } else if (action === 'skip_rain') {
    title = esc(t.verdict.skip_rain());
    sub = t.verdictSub.rain(pl.rain24.toFixed(0), clockLabel(pl.rainFirstT));
    iconName = 'rain';
    facts = [
      [t.rdRain, `${pl.rain24.toFixed(0)}<small>mm</small>`],
      [t.rdMoist, `${m}<small>%</small>`],
      [t.stWater, `0<small>m³</small>`],
    ];
  } else {
    title = esc(t.verdict.no_need());
    sub = t.verdictSub.ok(m, r);
    iconName = 'check';
    facts = [
      [t.rdMoist, `${m}<small>%</small>`],
      [t.stWater, `0<small>m³</small>`],
    ];
  }
  let actions = '';
  if (action === 'running') actions = `<button type="button" class="btn danger" data-act="stop">${icon('stop')}${esc(t.stopPump)}</button>`;
  else if (b && (action === 'irrigate_later' || action === 'irrigate_now' || action === 'next_day')) {
    actions = d.approved ? `<span class="approved-pill">${icon('check')}${esc(t.approved)}</span>` : `<button type="button" class="btn primary" data-act="approve">${esc(t.approve)}</button>`;
  }
  actions += `<button type="button" class="btn ghost" data-act="why">${esc(t.why)}</button>`;
  const key = JSON.stringify([state.lang, action, title, sub, facts, actions, d.id]);
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.innerHTML = `
    <div class="verdict">
      <span class="vic">${icon(iconName)}</span>
      <div>
        <h1>${title}</h1>
        <p class="why-line">${esc(sub)}</p>
        <p class="stamp">${t.replanned(clockLabel(d.createdAt), d.id)}</p>
      </div>
    </div>
    <div class="dec-side">
      <dl class="facts">${facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>
      <div class="dec-actions">${actions}</div>
    </div>`;
}

$('#decision').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const act = btn.dataset.act;
  if (act === 'why') ask(s().why);
  if (act === 'stop') farm.stopPump('farmer');
  if (act === 'approve') {
    const r = agent.act('approve', { langPref: state.lang });
    addBot(r);
    if (r.suggestions?.length) setChips(r.suggestions);
  }
  state.dirty = true;
});

// ---------- Readings ----------
function renderReadings() {
  const t = s();
  const r = farm.readings;
  const d = farm.decision;
  const fc = farm.forecastSummary();
  const frac = d.drFracRaw;
  const st = frac > 1 ? ['bad', t.stStressTxt] : frac >= 0.6 ? ['low', t.stLow] : ['good', t.stGood];
  const usable = Math.max(0, (r.soc - P.soc_min) * P.bat_kwh * P.bat_eff);
  const items = [
    ['drop', 'water', t.rdMoist, `${r.moisturePct.toFixed(1)}<small>%</small>`, `<span class="status ${st[0]}">${esc(st[1])}</span> · ${esc(t.refillAt(d.refillPct.toFixed(1)))}`],
    ['thermo', 'heat', t.rdAir, `${r.airTempC.toFixed(1)}<small>°C</small>`, esc(t.maxToday(fc.tmax.toFixed(0)))],
    ['humidity', 'water', t.rdRh, `${Math.round(r.rhPct)}<small>%</small>`, esc(t.rhRange(Math.round(fc.rhmin), Math.round(fc.rhmax)))],
    ['rain', 'water', t.rdRain, `${fc.rain24.toFixed(0)}<small>mm</small>`, esc(t.chance(fc.rainProb))],
    ['sun', 'sun', t.rdSolar, `${r.pvKw.toFixed(2)}<small>kW</small>`, esc(t.todayKwh(farm.today.pvGen.toFixed(1)))],
    ['battery', 'sun', t.rdBattery, `${Math.round(r.soc * 100)}<small>%</small>`, esc(t.usable(usable.toFixed(1)))],
  ];
  $('#readings').innerHTML = items
    .map(([ic, cls, label, val, sub]) => `<div class="rd"><div class="rd-label">${icon(ic, cls)}${esc(label)}</div><div class="rd-val">${val}</div><div class="rd-sub">${sub}</div></div>`)
    .join('');
}

// ---------- Command path ----------
function renderChain() {
  const t = s();
  const n = t.nodes;
  const ns = t.nodeState;
  const d = farm.decision;
  const on = farm.pump.on;
  const b = d.plan.blocks[0];
  const lastAlert = farm.alerts[farm.alerts.length - 1];
  const tripped = lastAlert && farm.t - lastAlert.t < 1 && !on;
  const flowBad = on && farm.dryWell;
  let decState;
  let decCls = '';
  if (on) {
    decState = farm.pump.source === 'plan' ? ns.approved(clockLabel(farm.pump.since)) : ns.sent;
    decCls = 'on';
  } else if (b) {
    decState = d.approved ? ns.approved(clockLabel(b.start)) : ns.needs;
    decCls = d.approved ? 'on' : '';
  } else decState = ns.none;
  const nodes = [
    ['decision', n.decision, decState, decCls],
    ['broadcast', n.mqtt, on ? ns.sent : ns.idle, on ? 'on' : ''],
    ['chip', n.esp, ns.online, on ? 'on' : ''],
    ['relay', n.relay, on ? ns.closed : ns.open, on ? 'on' : ''],
    ['pump', n.pump, on ? ns.running(farm.readings.pumpKw.toFixed(1)) : ns.off, on ? (flowBad ? 'fault' : 'water') : ''],
    ['flow', n.flow, on ? (flowBad ? ns.noflow : ns.flow(Math.round(farm.readings.flowLpm))) : ns.idle, on ? (flowBad ? 'fault' : 'water') : ''],
    ['target', n.off, tripped ? ns.tripped : on ? ns.armed(farm.pump.targetM3.toFixed(0)) : ns.idle, tripped ? 'fault' : on ? 'on' : ''],
  ];
  const html = nodes
    .map(([ic, label, stTxt, cls], i) => `<li class="node ${cls} ${on && !flowBad && i < 6 ? 'live' : ''}"><span class="dot">${icon(ic)}</span><span class="n-label">${esc(label)}</span><span class="n-state">${esc(stTxt)}</span></li>`)
    .join('');
  const el = $('#chain');
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
}

// ---------- MQTT log ----------
function renderLog() {
  const msgs = farm.mqttLog;
  const last = msgs[msgs.length - 1];
  const key = `${msgs.length}:${last?.t}:${last?.topic}`;
  if (state.mqttShown === key) return;
  const prevNewest = state.mqttNewestT;
  state.mqttShown = key;
  state.mqttNewestT = last?.t;
  const items = msgs.slice(-40).reverse();
  $('#mqtt').innerHTML = items
    .map((m) => {
      const parts = m.topic.split('/');
      const leaf = parts.slice(-2).join('/');
      const root = parts.slice(0, -2).join('/');
      const cmd = m.topic.includes('/cmd/');
      const fresh = prevNewest !== undefined && m.t > prevNewest ? 'fresh' : '';
      return `<li class="${cmd ? 'cmd' : ''} ${fresh}"><span class="ts">${clockLabel(m.t)}</span><span><span class="topic">${esc(root)}/<span class="leaf">${esc(leaf)}</span></span><span class="payload">${esc(JSON.stringify(m.payload)).replace(/,/g, ',<wbr>')}</span></span></li>`;
    })
    .join('');
}

// ---------- Day strip ----------
const stripSvg = $('#strip');
const stripTip = $('#strip-tip');
function renderDayStripNow() {
  state.data = stripData(farm);
  const flash = state.flashAt === null ? null : Math.min(1, (performance.now() - state.flashAt) / FLASH_MS);
  if (flash === 1) state.flashAt = null;
  state.strip = renderStrip(stripSvg, state.data, s(), { emph: state.emph, flash });
  if (state.hoverT !== null) showStripTip(state.hoverT);
  const details = $('.table-view');
  const hour = Math.floor(farm.t);
  if (details.open && state.stripHour !== hour) {
    $('#strip-table').innerHTML = tableHtml(state.data, s());
    state.stripHour = hour;
  }
}

function showStripTip(tq) {
  const data = state.data;
  if (!data || !state.strip) return;
  const tt = Math.min(data.we - 0.01, Math.max(data.ws, Math.round(tq * 4) / 4));
  state.hoverT = tt;
  const xh = stripSvg.querySelector('#xhair');
  const px = state.strip.x(tt);
  xh.setAttribute('x1', px);
  xh.setAttribute('x2', px);
  xh.setAttribute('visibility', 'visible');
  stripTip.innerHTML = tooltipHtml(readingAt(data, tt), s());
  stripTip.hidden = false;
  const plotW = stripSvg.parentElement.clientWidth;
  const scale = stripSvg.clientWidth / state.strip.W;
  const left = 8 + px * scale;
  const tipW = stripTip.offsetWidth;
  stripTip.style.left = `${left + 14 + tipW > plotW ? left - tipW - 14 : left + 14}px`;
  stripTip.style.top = '10px';
}

function hideStripTip() {
  state.hoverT = null;
  stripTip.hidden = true;
  stripSvg.querySelector('#xhair')?.setAttribute('visibility', 'hidden');
}

stripSvg.addEventListener('pointermove', (e) => {
  if (!state.strip) return;
  const rect = stripSvg.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * state.strip.W;
  showStripTip(state.strip.tFromX(px));
});
stripSvg.addEventListener('pointerleave', hideStripTip);
stripSvg.setAttribute('tabindex', '0');
stripSvg.addEventListener('keydown', (e) => {
  if (!state.data) return;
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const base = state.hoverT ?? farm.t;
    showStripTip(base + (e.key === 'ArrowRight' ? 1 : -1));
  }
  if (e.key === 'Escape') hideStripTip();
});
stripSvg.addEventListener('focus', () => showStripTip(farm.t));
stripSvg.addEventListener('blur', hideStripTip);
$('.table-view').addEventListener('toggle', () => {
  state.stripHour = null;
  state.dirty = true;
});
new ResizeObserver(() => (state.dirty = true)).observe(stripSvg);

// ---------- Clock and chrome ----------
function renderClock() {
  $('#clock').textContent = s().simTime(Math.floor(farm.t / 24) + 1, clockLabel(farm.t));
  $('#farm-meta').textContent = s().farmMeta(farm.cropDay());
}

function renderLive() {
  renderClock();
  renderDecision();
  renderDayStripNow();
  renderReadings();
  renderChain();
  renderLog();
}

function setPlaying(v) {
  state.playing = v;
  const b = $('#play');
  b.setAttribute('aria-pressed', String(v));
  b.innerHTML = icon(v ? 'pause' : 'play');
  b.setAttribute('aria-label', v ? s().pause : s().play);
  b.title = v ? s().pause : s().play;
}

function applyChrome() {
  const t = s();
  document.documentElement.lang = state.lang;
  document.documentElement.dataset.lang = state.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = t[el.dataset.i18n];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('[data-set-lang]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === state.lang)));
  const sel = $('#scenario');
  const cur = farm.scenario.id;
  sel.innerHTML = Object.keys(SCENARIOS)
    .map((id) => `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(t.scen[id])}</option>`)
    .join('');
  $('#speed').innerHTML = SPEEDS.map((_, i) => `<button type="button" data-speed="${i}" aria-pressed="${i === state.speedIdx}" aria-label="${esc(t.speeds[i])}"><span class="long">${esc(t.speeds[i])}</span><span class="short" aria-hidden="true">${esc(t.speedsShort[i])}</span></button>`).join('');
  $('#speed').setAttribute('aria-label', t.speed);
  const reset = $('#reset');
  reset.innerHTML = icon('reset');
  reset.setAttribute('aria-label', t.reset);
  reset.title = t.reset;
  setPlaying(state.playing);
  $('#ask').placeholder = t.placeholder;
  const send = $('#send');
  send.innerHTML = icon('send');
  send.setAttribute('aria-label', t.send);
  const mic = $('#mic');
  mic.innerHTML = icon('mic');
  mic.setAttribute('aria-label', voice.canListen ? t.speak : t.noMic);
  mic.title = voice.canListen ? t.speak : t.noMic;
  mic.disabled = !voice.canListen;
  const tts = $('#tts');
  tts.innerHTML = icon(state.tts ? 'speaker' : 'speakerOff');
  tts.setAttribute('aria-label', state.tts ? t.voiceOn : t.voiceOff);
  tts.title = state.tts ? t.voiceOn : t.voiceOff;
  tts.setAttribute('aria-pressed', String(state.tts));
  tts.hidden = !voice.canSpeak;
  renderLegend($('#strip-legend'), t);
  $('#decision').dataset.key = '';
  $('#chain').dataset.html = '';
  state.mqttShown = null;
  state.stripHour = null;
  state.dirty = true;
  if (state.tab === 'impact') impact.render();
  if (state.tab === 'sources') renderSources($('#panel-sources'), state.lang);
}

// ---------- Controls ----------
document.querySelectorAll('[data-set-lang]').forEach((b) =>
  b.addEventListener('click', () => {
    if (state.lang === b.dataset.setLang) return;
    state.lang = b.dataset.setLang;
    store.set('lang', state.lang);
    applyChrome();
    setChips(DEFAULT_CHIPS[state.lang]);
  }),
);

$('#scenario').addEventListener('change', (e) => {
  agent.pending = null;
  farm.reset(e.target.value);
  setPlaying(false);
  addEvent('note', `${s().scenario}: **${s().scen[e.target.value]}** · ${s().simTime(1, clockLabel(farm.t))}`);
  setChips(DEFAULT_CHIPS[state.lang]);
});

$('#reset').addEventListener('click', () => {
  agent.pending = null;
  farm.reset(farm.scenario.id);
  setPlaying(false);
  addEvent('note', `${s().scenario}: **${s().scen[farm.scenario.id]}** · ${s().simTime(1, clockLabel(farm.t))}`);
});

$('#play').addEventListener('click', () => {
  if (!state.playing && farm.t >= END_T) farm.reset(farm.scenario.id);
  setPlaying(!state.playing);
});

$('#speed').addEventListener('click', (e) => {
  const b = e.target.closest('[data-speed]');
  if (!b) return;
  state.speedIdx = Number(b.dataset.speed);
  $('#speed').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  ask($('#ask').value);
});

$('#tts').addEventListener('click', () => {
  state.tts = !state.tts;
  if (!state.tts) voice.stopSpeaking();
  applyChrome();
});

$('#mic').addEventListener('click', () => {
  const mic = $('#mic');
  if (voice.rec) {
    voice.stopListening();
    return;
  }
  const input = $('#ask');
  const started = voice.listen(state.lang, {
    onResult: (text) => (input.value = text),
    onEnd: (finalText) => {
      mic.classList.remove('listening');
      input.placeholder = s().placeholder;
      if (finalText.trim()) ask(finalText);
    },
    onError: () => {
      mic.classList.remove('listening');
      input.placeholder = s().placeholder;
    },
  });
  if (started) {
    mic.classList.add('listening');
    input.placeholder = s().listening;
  }
});

$('#dry-well').addEventListener('change', (e) => farm.setDryWell(e.target.checked));

// Tabs
const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(id) {
  state.tab = id;
  for (const tab of tabs) {
    const on = tab.id === `tab-${id}`;
    tab.setAttribute('aria-selected', String(on));
    tab.tabIndex = on ? 0 : -1;
    $(`#${tab.getAttribute('aria-controls')}`).hidden = !on;
  }
  if (id === 'impact') {
    impact.render();
    impact.get();
  }
  if (id === 'sources') renderSources($('#panel-sources'), state.lang);
  if (id === 'live') state.dirty = true;
  window.scrollTo({ top: 0 });
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectTab(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    next.focus();
    selectTab(next.id.replace('tab-', ''));
  });
});

// ---------- Main loop ----------
let last = performance.now();
let acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  if (state.playing) {
    acc += dt * SPEEDS[state.speedIdx];
    const whole = Math.floor(acc);
    if (whole > 0) {
      acc -= whole;
      farm.advance(whole);
      if (farm.t >= END_T) {
        setPlaying(false);
        addEvent('note', state.lang === 'ta' ? 'இந்தச் சூழலின் வானிலை முடிந்தது. மீண்டும் பார்க்க இயக்கு பொத்தானை அழுத்தவும்.' : 'End of this scenario’s weather. Press play to replay it.');
      }
    }
  }
  if (state.flashAt !== null) state.dirty = true;
  const minGap = state.flashAt !== null ? 0 : 180;
  if (state.tab === 'live' && state.dirty && now - state.lastRender > minGap) {
    state.dirty = false;
    state.lastRender = now;
    renderLive();
  }
  requestAnimationFrame(frame);
}

// ---------- Boot ----------
$('#brand-mark').innerHTML = icon('sprout');
applyChrome();
renderLive();
agent.respond('hi', { langPref: state.lang }).then((r) => {
  addBot({ ...r, tools: [], sources: [] });
  setChips(DEFAULT_CHIPS[state.lang]);
});
requestAnimationFrame(frame);
const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
idle(() => impact.get(), { timeout: 4000 });
