// Season impact tab: policy comparison from the season simulation.

import { P, unverifiedParams } from '../params.js';
import { runComparison, POLICIES, SETUPS } from '../season.js';
import { icon } from './icons.js';

const C = { solar: '#73a40a', battery: '#008e7f', grid: '#6d74d8', diesel: '#b9683b', water: '#00a4bb', muted: '#3e5a48' };

const T = {
  en: {
    title: 'Season impact',
    lede: (days, n) => `Tomato, ${days}-day season, per hectare. Median of ${n} simulated seasons; the range across seasons is in the table and tooltips.`,
    caveat: (n) => `Synthetic weather and a placeholder baseline. Final numbers will use NASA POWER hourly history for Krishnagiri and a surveyed farmer schedule. ${n} parameters are still marked UNVERIFIED (see Sources).`,
    headline: (r) =>
      `With the solar kit, AgriSage pumps <strong>${r.saved}% less water</strong> than a fixed ${r.fh} h/day schedule (${r.agW} vs ${r.baseW} m³/ha) and draws <strong>${r.agGrid} kWh of grid power</strong> instead of ${r.baseGrid}, cutting CO₂ from ${r.baseCo2} to ${r.agCo2} kg/ha, with <strong>${r.stress} hours of crop water stress</strong>. On the farmer’s existing grid pump, smart scheduling alone saves <strong>${r.savedGrid}%</strong> of water and pump energy.`,
    baseline: 'Baseline: the farmer runs the pump',
    perDay: 'h/day',
    rerun: 'Re-run seasons',
    ran: (n, ms) => `${n} season runs (5 weather seasons × 3 policies × 2 setups) in ${ms} ms, in your browser`,
    running: 'Simulating…',
    water: 'Water pumped, m³ per ha',
    energy: 'Pump energy by source, kWh per ha',
    groups: { grid: 'Grid pump (farm today)', solar: 'AgriSage solar kit' },
    pol: { fixed_schedule: 'Fixed schedule', threshold_rules: 'Threshold rules', agrisage: 'AgriSage' },
    polNote: { fixed_schedule: 'baseline', threshold_rules: 'sensor only', agrisage: 'optimizer' },
    src: { pv: 'Solar', battery: 'Battery (solar)', grid: 'Grid', diesel: 'Diesel' },
    table: 'All metrics: median, with min–max across seasons',
    metric: 'Metric',
    rows: {
      waterM3Ha: 'Water pumped (m³/ha)',
      pumpKwhHa: 'Pump energy (kWh/ha)',
      solarKwh: 'From solar + battery (kWh/ha)',
      gridKwhHa: 'From grid (kWh/ha)',
      dieselLHa: 'Diesel (L/ha)',
      co2KgHa: 'CO₂ (kg/ha)',
      farmerCostHa: 'Farmer energy cost (₹/ha)*',
      systemCostHa: 'System energy cost (₹/ha)*',
      stressHours: 'Crop water stress (hours)',
      percolationM3Ha: 'Water lost below roots (m³/ha)',
      yieldLossPct: 'Yield loss from stress (%, FAO Ky)',
    },
    footnote: '* Uses placeholder prices: free farm power in Tamil Nadu (to confirm), DISCOM cost of supply and diesel price (UNVERIFIED).',
  },
  ta: {
    title: 'பருவ தாக்கம்',
    lede: (days, n) => `தக்காளி, ${days} நாள் பருவம், ஹெக்டேருக்கு. ${n} உருவகப் பருவங்களின் சராசரி; பருவங்களுக்கு இடையிலான வரம்பு அட்டவணையிலும் tooltip-இலும் உள்ளது.`,
    caveat: (n) => `செயற்கை வானிலை, அனுமான அடிப்படை. இறுதி எண்கள் கிருஷ்ணகிரிக்கான NASA POWER மணிநேர வரலாற்றையும் விவசாயிகளிடம் கணக்கெடுத்த அட்டவணையையும் பயன்படுத்தும். ${n} அளவுருக்கள் இன்னும் UNVERIFIED (ஆதாரங்கள் பகுதியைப் பார்க்கவும்).`,
    headline: (r) =>
      `சோலார் kit-உடன் AgriSage, தினமும் ${r.fh} மணி நேர நிலையான அட்டவணையை விட <strong>${r.saved}% குறைவான தண்ணீர்</strong> பாய்ச்சுகிறது (${r.agW} vs ${r.baseW} கன மீ/ஹெ); கிரிட் மின்சாரம் ${r.baseGrid}-இலிருந்து <strong>${r.agGrid} kWh</strong>, CO₂ ${r.baseCo2}-இலிருந்து ${r.agCo2} kg/ஹெ; பயிர் நீர் அழுத்தம் <strong>${r.stress} மணி நேரம்</strong>. விவசாயியின் தற்போதைய கிரிட் மோட்டாரிலேயே, திட்டமிடல் மட்டும் <strong>${r.savedGrid}%</strong> தண்ணீரையும் மின்சாரத்தையும் சேமிக்கிறது.`,
    baseline: 'அடிப்படை: விவசாயி மோட்டாரை இயக்குவது',
    perDay: 'மணி/நாள்',
    rerun: 'மீண்டும் உருவகி',
    ran: (n, ms) => `${n} பருவ ஓட்டங்கள் (5 வானிலைப் பருவங்கள் × 3 கொள்கைகள் × 2 அமைப்புகள்) ${ms} ms-இல், உங்கள் browser-இலேயே`,
    running: 'உருவகப்படுத்துகிறது…',
    water: 'பாய்ச்சிய தண்ணீர், கன மீ / ஹெ',
    energy: 'மூலவாரியாக மோட்டார் மின்சாரம், kWh / ஹெ',
    groups: { grid: 'கிரிட் மோட்டார் (இன்றைய பண்ணை)', solar: 'AgriSage சோலார் kit' },
    pol: { fixed_schedule: 'நிலையான அட்டவணை', threshold_rules: 'வரம்பு விதிகள்', agrisage: 'AgriSage' },
    polNote: { fixed_schedule: 'அடிப்படை', threshold_rules: 'சென்சார் மட்டும்', agrisage: 'optimizer' },
    src: { pv: 'சோலார்', battery: 'பேட்டரி (சோலார்)', grid: 'கிரிட்', diesel: 'டீசல்' },
    table: 'அனைத்து அளவீடுகள்: சராசரி, பருவங்களுக்கு இடையிலான குறைந்தபட்சம்–அதிகபட்சம்',
    metric: 'அளவீடு',
    rows: {
      waterM3Ha: 'பாய்ச்சிய தண்ணீர் (கன மீ/ஹெ)',
      pumpKwhHa: 'மோட்டார் மின்சாரம் (kWh/ஹெ)',
      solarKwh: 'சோலார் + பேட்டரி (kWh/ஹெ)',
      gridKwhHa: 'கிரிட் (kWh/ஹெ)',
      dieselLHa: 'டீசல் (லி/ஹெ)',
      co2KgHa: 'CO₂ (kg/ஹெ)',
      farmerCostHa: 'விவசாயியின் மின் செலவு (₹/ஹெ)*',
      systemCostHa: 'அமைப்பின் மின் செலவு (₹/ஹெ)*',
      stressHours: 'பயிர் நீர் அழுத்தம் (மணி நேரம்)',
      percolationM3Ha: 'வேருக்குக் கீழே வீணான நீர் (கன மீ/ஹெ)',
      yieldLossPct: 'நீர் அழுத்தத்தால் மகசூல் இழப்பு (%, FAO Ky)',
    },
    footnote: '* அனுமான விலைகள்: தமிழ்நாட்டில் விவசாய மின்சாரம் இலவசம் (உறுதி செய்ய வேண்டும்), DISCOM விநியோகச் செலவு, டீசல் விலை (UNVERIFIED).',
  },
};

const fmt = (x, d = 0) => (Number.isFinite(x) ? x.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function createImpact(root, { getLang, onResult }) {
  let result = null;
  let fixedHours = P.fixed_hours;
  let lastMs = 0;
  let busy = false;

  async function run(hours = fixedHours) {
    fixedHours = hours;
    busy = true;
    render();
    await new Promise((r) => setTimeout(r, 40));
    const t0 = performance.now();
    result = runComparison({ base: { ...P, fixed_hours: hours } });
    lastMs = Math.round(performance.now() - t0);
    busy = false;
    onResult?.(result);
    render();
    return result;
  }

  function get() {
    return result ? Promise.resolve(result) : run();
  }

  function headlineNumbers() {
    const s = result.summary;
    const base = s['grid:fixed_schedule'];
    const ag = s['solar:agrisage'];
    const agG = s['grid:agrisage'];
    return {
      fh: result.fixedHours,
      saved: fmt(100 * (1 - ag.waterM3Ha.median / base.waterM3Ha.median)),
      savedGrid: fmt(100 * (1 - agG.waterM3Ha.median / base.waterM3Ha.median)),
      agW: fmt(ag.waterM3Ha.median),
      baseW: fmt(base.waterM3Ha.median),
      agGrid: fmt(ag.gridKwhHa.median),
      baseGrid: fmt(base.gridKwhHa.median),
      agCo2: fmt(ag.co2KgHa.median),
      baseCo2: fmt(base.co2KgHa.median),
      stress: fmt(ag.stressHours.median),
    };
  }

  function render() {
    const lang = getLang();
    const t = T[lang];
    const nUnv = unverifiedParams().length;
    if (!root.firstElementChild) {
      root.innerHTML = `<div class="page">
        <div class="page-head"><div><h1 data-k="title"></h1><p class="lede" data-k="lede"></p></div></div>
        <div class="callout">${icon('alert')}<p data-k="caveat"></p></div>
        <section class="panel headline" data-k="headline" aria-live="polite"></section>
        <section class="panel controls">
          <label><span data-k="baseline"></span><input type="range" id="fixed-h" min="1.5" max="4" step="0.5"><output id="fixed-out"></output></label>
          <button type="button" class="btn" id="rerun"></button>
          <span class="sub" data-k="ran"></span>
        </section>
        <div class="charts">
          <section class="panel chart"><div class="panel-head"><h2 data-k="water"></h2></div><div class="chart-plot" id="water-plot"><svg id="water-chart" role="img"></svg><div class="tip" hidden></div></div></section>
          <section class="panel chart"><div class="panel-head"><h2 data-k="energy"></h2><ul class="legend" id="energy-legend"></ul></div><div class="chart-plot" id="energy-plot"><svg id="energy-chart" role="img"></svg><div class="tip" hidden></div></div></section>
        </div>
        <section class="panel metrics"><div class="panel-head"><h2 data-k="table"></h2></div><div class="metrics" id="metrics"></div><p class="sub" data-k="footnote" style="padding:10px 16px 14px"></p></section>
      </div>`;
      const range = root.querySelector('#fixed-h');
      range.value = String(fixedHours);
      range.addEventListener('input', () => {
        root.querySelector('#fixed-out').textContent = `${Number(range.value).toFixed(1)} ${T[getLang()].perDay}`;
      });
      range.addEventListener('change', () => run(Number(range.value)));
      root.querySelector('#rerun').addEventListener('click', () => run(Number(range.value)));
      new ResizeObserver(() => result && drawCharts()).observe(root.querySelector('.charts'));
    }
    const set = (k, html) => {
      const el = root.querySelector(`[data-k="${k}"]`);
      if (el) el.innerHTML = html;
    };
    set('title', esc(t.title));
    set('lede', esc(t.lede(result?.seasonDays ?? 135, result?.seeds.length ?? 5)));
    set('caveat', esc(t.caveat(nUnv)));
    set('baseline', esc(t.baseline));
    set('water', esc(t.water));
    set('energy', esc(t.energy));
    set('table', esc(t.table));
    set('footnote', esc(t.footnote));
    root.querySelector('#fixed-out').textContent = `${fixedHours.toFixed(1)} ${t.perDay}`;
    root.querySelector('#rerun').textContent = t.rerun;
    root.querySelector('#rerun').disabled = busy;
    set('ran', busy ? esc(t.running) : result ? esc(t.ran(result.runs.length, lastMs)) : '');
    root.querySelector('.page').classList.toggle('running', busy && Boolean(result));
    if (!result) {
      set('headline', esc(t.running));
      return;
    }
    set('headline', t.headline(headlineNumbers()));
    drawLegend(t);
    drawCharts();
    drawTable(t);
  }

  function rowsSpec() {
    const rows = [];
    for (const setup of SETUPS) {
      rows.push({ group: setup });
      for (const pol of POLICIES) rows.push({ setup, pol, key: `${setup}:${pol}` });
    }
    return rows;
  }

  function drawLegend(t) {
    const ul = root.querySelector('#energy-legend');
    ul.innerHTML = '';
    for (const k of ['pv', 'battery', 'grid', 'diesel']) {
      const li = document.createElement('li');
      const key = document.createElement('span');
      key.className = 'key area';
      key.style.background = C[k === 'pv' ? 'solar' : k];
      li.append(key, document.createTextNode(t.src[k]));
      ul.append(li);
    }
  }

  function drawCharts() {
    const t = T[getLang()];
    barChart(root.querySelector('#water-chart'), t, (m) => [{ k: 'water', v: m.waterM3Ha.median, label: t.water }], (key) => (key.endsWith('agrisage') ? C.water : C.muted), (m) => `${fmt(m.waterM3Ha.min)}–${fmt(m.waterM3Ha.max)}`);
    barChart(
      root.querySelector('#energy-chart'),
      t,
      (m) => [
        { k: 'solar', v: m.pvKwhHa.median, label: t.src.pv },
        { k: 'battery', v: m.batteryKwhHa.median, label: t.src.battery },
        { k: 'grid', v: m.gridKwhHa.median, label: t.src.grid },
        { k: 'diesel', v: m.dieselKwhHa.median, label: t.src.diesel },
      ],
      null,
      null,
    );
  }

  function barChart(svg, t, segsOf, colorOf, rangeOf) {
    const plot = svg.parentElement;
    const tip = plot.querySelector('.tip');
    const W = Math.max(300, plot.clientWidth - 32);
    const labelW = W < 440 ? 118 : 150;
    const valueW = 64;
    const bw = W - labelW - valueW;
    const rows = rowsSpec();
    const pitch = 30;
    const gh = 24;
    const maxV = Math.max(...rows.filter((r) => r.key).map((r) => segsOf(result.summary[r.key]).reduce((a, s) => a + s.v, 0)));
    const scale = (v) => (v / maxV) * bw;
    let y = 4;
    const out = [];
    const hits = [];
    for (const r of rows) {
      if (r.group) {
        out.push(`<text class="grp" x="0" y="${y + 15}">${esc(t.groups[r.group])}</text>`);
        out.push(`<line x1="0" x2="${W}" y1="${y + 21}" y2="${y + 21}" stroke="rgba(176,230,120,0.12)"/>`);
        y += gh + 4;
        continue;
      }
      const m = result.summary[r.key];
      const segs = segsOf(m);
      const cy = y + pitch / 2;
      out.push(`<text x="0" y="${cy + 4}">${esc(t.pol[r.pol])}</text>`);
      let x0 = labelW;
      const total = segs.reduce((a, s) => a + s.v, 0);
      const visible = segs.filter((s) => s.v > 0.5);
      visible.forEach((s, i) => {
        const w = scale(s.v);
        const gap = i < visible.length - 1 ? 2 : 0;
        const ww = Math.max(0, w - gap);
        const color = colorOf ? colorOf(r.key) : C[s.k];
        const last = i === visible.length - 1;
        const rr = last ? Math.min(4, ww / 2) : 0;
        const d = `M${x0},${cy - 9}H${x0 + ww - rr}Q${x0 + ww},${cy - 9} ${x0 + ww},${cy - 9 + rr}V${cy + 9 - rr}Q${x0 + ww},${cy + 9} ${x0 + ww - rr},${cy + 9}H${x0}Z`;
        const idx = hits.length;
        hits.push({ title: `${t.pol[r.pol]} · ${t.groups[r.setup]}`, label: s.label, v: s.v, color, range: rangeOf ? rangeOf(m) : null, x: x0 + ww / 2, y: cy - 9 });
        out.push(`<g class="bar" tabindex="0" data-hit="${idx}"><rect class="hit" x="${x0}" y="${y}" width="${Math.max(ww, 6)}" height="${pitch}"/><path class="mark" d="${d}" fill="${color}"/></g>`);
        x0 += w;
      });
      out.push(`<text class="val" x="${labelW + scale(total) + 8}" y="${cy + 4}">${fmt(total)}</text>`);
      y += pitch;
    }
    const H = y + 6;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('height', H);
    svg.innerHTML = out.join('');
    const show = (g) => {
      const h = hits[Number(g.dataset.hit)];
      tip.innerHTML = `<div class="t-time">${esc(h.title)}</div><div class="row"><span class="key line" style="background:${h.color}"></span><span>${esc(h.label)}</span><b>${fmt(h.v)}</b></div>${h.range ? `<div class="row"><span></span><span>min–max</span><b>${esc(h.range)}</b></div>` : ''}`;
      tip.hidden = false;
      const left = Math.min(Math.max(16 + h.x - tip.offsetWidth / 2, 0), plot.clientWidth - tip.offsetWidth);
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, h.y - tip.offsetHeight - 6)}px`;
    };
    svg.querySelectorAll('g.bar').forEach((g) => {
      g.addEventListener('pointerenter', () => show(g));
      g.addEventListener('focus', () => show(g));
      g.addEventListener('pointerleave', () => (tip.hidden = true));
      g.addEventListener('blur', () => (tip.hidden = true));
    });
  }

  function drawTable(t) {
    const s = result.summary;
    const metricKeys = Object.keys(t.rows);
    const cell = (m, k) => {
      if (k === 'solarKwh') {
        const med = m.pvKwhHa.median + m.batteryKwhHa.median;
        return `${fmt(med)}`;
      }
      const q = m[k];
      const d = k === 'dieselLHa' || k === 'yieldLossPct' ? 1 : 0;
      return `${fmt(q.median, d)}<span class="rng">${fmt(q.min, d)}–${fmt(q.max, d)}</span>`;
    };
    const head1 = `<tr class="group"><th></th>${SETUPS.map((g) => `<th colspan="3">${esc(t.groups[g])}</th>`).join('')}</tr>`;
    const head2 = `<tr><th>${esc(t.metric)}</th>${SETUPS.map((g) => POLICIES.map((p) => `<th class="${p === 'agrisage' ? 'ours' : ''}">${esc(t.pol[p])}<br><span class="sub">${esc(t.polNote[p])}</span></th>`).join('')).join('')}</tr>`;
    const body = metricKeys
      .map((k) => `<tr><th>${esc(t.rows[k])}</th>${SETUPS.map((g) => POLICIES.map((p) => `<td class="${p === 'agrisage' ? 'ours' : ''}">${cell(s[`${g}:${p}`], k)}</td>`).join('')).join('')}</tr>`)
      .join('');
    root.querySelector('#metrics').innerHTML = `<table><thead>${head1}${head2}</thead><tbody>${body}</tbody></table>`;
  }

  return { render, run, get, get result() { return result; } };
}
