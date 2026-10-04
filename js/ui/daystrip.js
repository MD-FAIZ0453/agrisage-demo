// The Day Strip: one 24-hour timeline (04:00 → 04:00) in two lanes that
// share an x-axis. Top lane: soil moisture against the refill point, with what
// happens if irrigation is skipped. Bottom lane: solar output with pump runs
// drawn at the pump's real power, so a run that sits inside the sun is a run
// powered by the sun.

import { P, soilConstants } from '../params.js';
import { weatherAt } from '../weather.js';
import { pvPowerKw, moisturePct, gridAvailable } from '../twin.js';
import { clockLabel } from '../farm.js';

const SC = soilConstants(P);
const H = 240;
const L = 6;
const R = 46;
const M_TOP = 18;
const M_H = 90;
const E_TOP = 130;
const E_H = 76;
const G_Y = 210;
const AXIS_Y = 233;
const E_MAX = Math.max(4, Math.ceil(P.pv_kwp));
const C = { solar: '#73a40a', solarWash: '#a7e35e', water: '#00a4bb', waterLine: '#5cd8ea', grid: '#6d74d8', amber: '#f3b74f', coral: '#ff7f70', lime: '#a7e35e' };

function windowStart(t) {
  return Math.floor((t - 4) / 24) * 24 + 4;
}

const mPct = (dr) => moisturePct(dr, SC, P);

// Everything the strip draws, computed from the farm state. Pure data.
export function stripData(farm) {
  const t = farm.t;
  const d = farm.decision;
  // Normally 04:00 → 04:00; roll forward when the next planned run (for
  // example tomorrow's) would fall outside that window.
  let ws = windowStart(t);
  const nextRun = d.plan.blocks[0];
  if (!farm.pump.on && nextRun && nextRun.end > ws + 24) ws = Math.min(Math.floor(t), Math.ceil(nextRun.end + 0.5) - 24);
  const we = ws + 24;
  const pv = [];
  for (let x = ws; x <= we + 1e-9; x += 0.25) {
    const w = weatherAt(farm.wx, x);
    pv.push({ t: x, kw: pvPowerKw(w.g, w.t_c, P) });
  }
  const rain = [];
  const grid = [];
  for (let h = ws; h < we; h++) {
    const w = weatherAt(farm.wx, h + 0.01);
    rain.push({ t: h, mm: w.rain_rate });
    grid.push({ t: h, on: gridAvailable(h - 24 * Math.floor(h / 24), P) });
  }

  // Past: true moisture and executed pump runs from history.
  const past = [];
  const done = [];
  let runStart = null;
  let lastT = null;
  for (const hpt of farm.history) {
    if (hpt.t < ws) continue;
    if ((past.length === 0 || hpt.t - past[past.length - 1].t >= 1 / 6 - 1e-9) && hpt.t <= t) past.push({ t: hpt.t, m: hpt.mt });
    if (hpt.pump && runStart === null) runStart = hpt.t - 1 / 60;
    if (!hpt.pump && runStart !== null) {
      done.push({ start: runStart, end: lastT });
      runStart = null;
    }
    lastT = hpt.t;
  }
  if (runStart !== null) done.push({ start: runStart, end: t });
  const mNow = mPct(farm.dr);
  if (!past.length || past[past.length - 1].t < t) past.push({ t, m: mNow });

  // Future: the optimizer's projection, and the same day without irrigation.
  const proj = [{ t, m: mNow }];
  const skip = [{ t, m: mNow }];
  d.slots.forEach((s, i) => {
    const te = s.t0 + s.len;
    if (te > t + 1e-6 && te <= we + 1) {
      proj.push({ t: te, m: mPct(d.plan.drTraj[i + 1]) });
      skip.push({ t: te, m: mPct(d.plan.noIrrDrTraj[i + 1]) });
    }
  });
  let planned = [];
  let label = null;
  if (farm.pump.on) {
    const end = farm.pump.since + farm.pump.targetM3 / P.flow_m3h;
    planned = [{ start: t, end: Math.max(t, end) }];
    label = { start: farm.pump.since, end, m3: farm.pump.targetM3 };
  } else {
    planned = d.plan.blocks.filter((b) => b.end > t).map((b) => ({ start: Math.max(b.start, t), end: b.end }));
    const b = d.plan.blocks[0];
    if (b && b.start < we) label = { start: b.start, end: b.end, m3: b.hours * P.flow_m3h };
  }
  const showSkip = !farm.pump.on && d.plan.totalHours > 0 && d.plan.noIrrStressHours > 0;
  const dueT = showSkip && d.plan.stressEtaH !== null ? d.slots[0].t0 + d.plan.stressEtaH : null;
  return { t, ws, we, pv, rain, grid, past, proj, skip: showSkip ? skip : [], dueT, done, planned, label, refill: mPct(SC.raw), fc: P.theta_fc * 100, pumpOn: farm.pump.on };
}

function valueAt(series, t) {
  if (!series.length) return null;
  if (t <= series[0].t) return series[0].m;
  for (let i = 1; i < series.length; i++) {
    if (series[i].t >= t) {
      const a = series[i - 1];
      const b = series[i];
      return a.m + ((b.m - a.m) * (t - a.t)) / (b.t - a.t || 1);
    }
  }
  return series[series.length - 1].m;
}

function inRuns(runs, t) {
  return runs.some((r) => t >= r.start - 1e-6 && t < r.end + 1e-6);
}

export function readingAt(data, tq) {
  const pvPt = data.pv[Math.min(data.pv.length - 1, Math.max(0, Math.round((tq - data.ws) * 4)))];
  const hour = data.rain[Math.min(23, Math.max(0, Math.floor(tq - data.ws)))];
  const g = data.grid[Math.min(23, Math.max(0, Math.floor(tq - data.ws)))];
  const isPast = tq <= data.t;
  const m = isPast ? valueAt(data.past, tq) : valueAt(data.proj, tq);
  const mSkip = !isPast && data.skip.length ? valueAt(data.skip, tq) : null;
  const pump = inRuns(data.done, tq) ? 'done' : inRuns(data.planned, tq) ? 'planned' : 'off';
  return { t: tq, kw: pvPt.kw, mm: hour.mm, grid: g.on, m, mSkip, pump, isPast };
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const easeOut = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

// opts.emph: the plan is being pointed at from the chat.
// opts.flash: 0..1 progress of the "plan lands on the strip" moment, or null.
export function renderStrip(svg, data, s, opts = {}) {
  const W = Math.max(300, Math.round(svg.clientWidth || 800));
  const pw = W - L - R;
  const narrow = pw < 500;
  const x = (t) => L + ((t - data.ws) / 24) * pw;
  const series = [...data.past, ...data.proj, ...data.skip].filter((p) => p.t >= data.ws);
  const mMax = Math.max(...series.map((p) => p.m), data.refill + 1);
  const mMin = Math.min(...series.map((p) => p.m), data.refill);
  const mLo = Math.min(data.refill - 2, mMin - 0.4);
  const mHi = Math.min(data.fc + 0.4, mMax + 0.6);
  const ym = (m) => M_TOP + ((mHi - Math.min(mHi, Math.max(mLo, m))) / (mHi - mLo)) * M_H;
  const ye = (kw) => E_TOP + E_H - (Math.min(E_MAX, Math.max(0, kw)) / E_MAX) * E_H;
  const base = E_TOP + E_H;
  const out = [];
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  // Night shading where the sun is down.
  let nightStart = null;
  data.pv.forEach((p, i) => {
    const dark = p.kw < 0.02;
    if (dark && nightStart === null) nightStart = p.t;
    if ((!dark || i === data.pv.length - 1) && nightStart !== null) {
      const end = dark ? p.t : p.t - 0.25;
      if (end > nightStart) out.push(`<rect x="${x(nightStart)}" y="${M_TOP - 4}" width="${x(end) - x(nightStart)}" height="${G_Y + 5 - M_TOP + 4}" fill="#000" opacity="0.16"/>`);
      nightStart = null;
    }
  });

  // Moisture lane: stress zone below the refill point.
  const yRefill = ym(data.refill);
  out.push(`<rect x="${L}" y="${yRefill}" width="${pw}" height="${M_TOP + M_H - yRefill}" fill="${C.coral}" opacity="0.07"/>`);
  if (data.fc <= mHi) {
    out.push(`<line x1="${L}" x2="${L + pw}" y1="${ym(data.fc)}" y2="${ym(data.fc)}" stroke="rgba(176,230,120,0.14)" stroke-width="1"/>`);
    out.push(`<text class="tick" x="${L + pw + 6}" y="${ym(data.fc) + 4}">${data.fc.toFixed(0)}%</text>`);
  } else {
    out.push(`<text class="tick" x="${L + pw + 6}" y="${M_TOP + 4}">${mHi.toFixed(0)}%</text>`);
  }
  out.push(`<line x1="${L}" x2="${L + pw}" y1="${yRefill}" y2="${yRefill}" stroke="${C.amber}" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.9"/>`);
  out.push(`<text class="tick" x="${L + pw + 6}" y="${yRefill + 4}">${data.refill.toFixed(1)}%</text>`);

  // Rain hangs from the top of the moisture lane.
  const hw = pw / 24;
  data.rain.forEach((r) => {
    if (r.mm < 0.2) return;
    const h = Math.min(M_H * 0.6, 6 + (r.mm / 15) * M_H * 0.5);
    const bw = Math.min(10, hw - 3);
    out.push(`<rect x="${x(r.t + 0.5) - bw / 2}" y="${M_TOP}" width="${bw}" height="${h}" rx="2" fill="${C.water}" opacity="0.5"/>`);
  });

  // Moisture: measured (solid), the plan (dashed), and if skipped (coral dotted).
  const pathOf = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${ym(p.m).toFixed(1)}`).join('');
  if (data.skip.length > 1) out.push(`<path d="${pathOf(data.skip)}" fill="none" stroke="${C.coral}" stroke-width="2" stroke-dasharray="2 4" stroke-linecap="round" opacity="0.9"/>`);
  if (data.past.length > 1) out.push(`<path d="${pathOf(data.past)}" fill="none" stroke="${C.waterLine}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
  if (data.proj.length > 1) out.push(`<path d="${pathOf(data.proj)}" fill="none" stroke="${C.waterLine}" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round" stroke-linecap="round"/>`);
  if (data.dueT !== null && data.dueT < data.we) {
    const xd = x(data.dueT);
    out.push(`<circle cx="${xd}" cy="${yRefill}" r="4.5" fill="${C.coral}" stroke="#0c1a12" stroke-width="2"/>`);
    // Label sits at the lane's right end, inside the stress zone, where the
    // skipped line has fallen furthest from the refill line.
    const txt = s.stressFrom(clockLabel(data.dueT));
    const skipEnd = data.skip[data.skip.length - 1];
    const yEnd = skipEnd ? ym(skipEnd.m) : yRefill + 20;
    const yLabel = yEnd - yRefill > 22 ? yRefill + 14 : Math.min(M_TOP + M_H - 3, yEnd + 13);
    out.push(`<text class="hl" x="${L + pw - 4}" y="${yLabel}" text-anchor="end">${esc(txt)}</text>`);
  }

  // Lane labels (after the lines, so the halo keeps them legible).
  out.push(`<text class="lane-label" x="${L}" y="${M_TOP - 7}">${esc(s.laneMoist)}</text>`);
  out.push(`<text class="lane-label" x="${L}" y="${E_TOP - 9}">${esc(`${s.laneEnergy} · ${s.pumpNeeds(P.pump_kw)}`)}</text>`);

  // Energy lane gridlines.
  for (let k = 0; k <= E_MAX; k += 2) {
    out.push(`<line x1="${L}" x2="${L + pw}" y1="${ye(k)}" y2="${ye(k)}" stroke="rgba(176,230,120,${k === 0 ? 0.22 : 0.1})" stroke-width="1"/>`);
    out.push(`<text class="tick" x="${L + pw + 6}" y="${ye(k) + 4}">${k}</text>`);
  }

  // Solar output.
  const area = `M${x(data.ws)},${base}` + data.pv.map((p) => `L${x(p.t).toFixed(1)},${ye(p.kw).toFixed(1)}`).join('') + `L${x(data.we)},${base}Z`;
  const line = data.pv.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${ye(p.kw).toFixed(1)}`).join('');
  out.push(`<path d="${area}" fill="${C.solarWash}" opacity="0.13"/>`);
  out.push(`<path d="${line}" fill="none" stroke="${C.solar}" stroke-width="2" stroke-linejoin="round"/>`);

  // Pump runs at the pump's real power: inside the sun means solar-powered.
  const topY = ye(P.pump_kw);
  const fl = opts.flash == null ? 1 : easeOut(opts.flash);
  const emph = opts.emph || (opts.flash != null && opts.flash < 1);
  const blockPath = (r) => {
    const x0 = x(Math.max(r.start, data.ws));
    const x1 = x(Math.min(r.end, data.we));
    if (x1 - x0 < 0.5) return null;
    const w = x1 - x0;
    const rr = Math.min(4, w / 2);
    const top = base - (base - topY) * (r.done ? 1 : fl);
    return `M${x0},${base}V${top + rr}Q${x0},${top} ${x0 + rr},${top}H${x1 - rr}Q${x1},${top} ${x1},${top + rr}V${base}Z`;
  };
  data.done.forEach((r) => {
    const d = blockPath({ ...r, done: true });
    if (d) out.push(`<path d="${d}" fill="${C.water}"/>`);
  });
  data.planned.forEach((r) => {
    const d = blockPath(r);
    if (d) out.push(`<path d="${d}" fill="${C.water}" fill-opacity="${emph ? 0.55 : 0.4}" stroke="${C.waterLine}" stroke-width="${emph ? 2.5 : 1.5}" stroke-linejoin="round"/>`);
  });
  out.push(`<line x1="${L}" x2="${L + pw}" y1="${topY}" y2="${topY}" stroke="rgba(234,244,230,0.35)" stroke-width="1" stroke-dasharray="2 4"/>`);

  // The plan's own label pinned on its run, so the chat answer and the strip
  // visibly say the same thing.
  if (data.label) {
    const xs = x(Math.max(data.label.start, data.ws));
    const xe = x(Math.min(data.label.end, data.we));
    const txt = `${clockLabel(data.label.start)}–${clockLabel(data.label.end)} · ${Math.round(data.label.m3)} m³`;
    const tw = txt.length * 6.4 + 14;
    const cx = Math.min(Math.max((xs + xe) / 2, L + tw / 2), L + pw - tw / 2 - 2);
    const ly = topY - 26;
    out.push(`<g opacity="${fl}"><rect x="${cx - tw / 2}" y="${ly}" width="${tw}" height="18" rx="5" fill="${emph ? C.waterLine : '#0c1a12'}" stroke="${C.waterLine}" stroke-width="1"/><text class="plan-label${emph ? ' on' : ''}" x="${cx}" y="${ly + 12.5}" text-anchor="middle">${esc(txt)}</text></g>`);
  }

  // Grid supply hours.
  let spanStart = null;
  data.grid.forEach((g, i) => {
    if (g.on && spanStart === null) spanStart = g.t;
    const endHere = spanStart !== null && (!g.on || i === data.grid.length - 1);
    if (endHere) {
      const end = g.on ? g.t + 1 : g.t;
      out.push(`<rect x="${x(spanStart) + 1}" y="${G_Y}" width="${x(end) - x(spanStart) - 2}" height="5" rx="2.5" fill="${C.grid}"/>`);
      spanStart = null;
    }
  });

  // Now cursor, and hour ticks that stay clear of its label.
  const xn = x(data.t);
  const label = narrow ? clockLabel(data.t) : `${s.now} ${clockLabel(data.t)}`;
  const lw = label.length * 6.6 + 12;
  const lx = Math.min(Math.max(xn - lw / 2, L), L + pw - lw);
  const step = narrow ? 8 : 4;
  for (let h = 0; h <= 24; h += step) {
    const tt = data.ws + h;
    const anchor = h === 0 ? 'start' : h === 24 ? 'end' : 'middle';
    const tx = x(tt);
    const half = 20;
    const left = anchor === 'start' ? tx : anchor === 'end' ? tx - 2 * half : tx - half;
    if (left + 2 * half > lx - 4 && left < lx + lw + 4) continue;
    out.push(`<text class="tick" x="${tx}" y="${AXIS_Y}" text-anchor="${anchor}">${clockLabel(tt)}</text>`);
  }
  out.push(`<line x1="${xn}" x2="${xn}" y1="${M_TOP - 4}" y2="${G_Y + 6}" stroke="${C.lime}" stroke-width="1.5"/>`);
  out.push(`<rect x="${lx}" y="${AXIS_Y - 12}" width="${lw}" height="17" rx="4" fill="${C.lime}"/>`);
  out.push(`<text class="now-label" x="${lx + lw / 2}" y="${AXIS_Y}" text-anchor="middle">${esc(label)}</text>`);

  // Crosshair layer (moved by the pointer handler).
  out.push(`<line id="xhair" x1="0" x2="0" y1="${M_TOP - 4}" y2="${G_Y + 6}" stroke="rgba(234,244,230,0.55)" stroke-width="1" visibility="hidden"/>`);
  svg.innerHTML = out.join('');
  return { x, W, pw, tFromX: (px) => data.ws + ((px - L) / pw) * 24 };
}

export function legendItems(s) {
  return [
    ['area', C.solar, s.lgSolar, 0.55],
    ['area', C.water, s.lgPlanned, 0.45],
    ['area', C.water, s.lgDone, 1],
    ['line', C.waterLine, s.lgMoist, 1],
    ['dot', C.coral, s.lgSkip, 1],
    ['dash', C.amber, s.lgRefill, 1],
    ['bar', C.water, s.lgRain, 0.5],
    ['area', C.grid, s.lgGrid, 1],
  ];
}

export function renderLegend(ul, s) {
  ul.innerHTML = '';
  for (const [kind, color, label, op] of legendItems(s)) {
    const li = document.createElement('li');
    const k = document.createElement('span');
    k.className = `key ${kind === 'bar' ? 'area' : kind}`;
    if (kind === 'bar') Object.assign(k.style, { width: '5px', height: '11px' });
    if (kind === 'dot') k.style.borderTopColor = color;
    else if (kind !== 'dash') {
      k.style.background = color;
      k.style.opacity = op;
    }
    li.append(k, document.createTextNode(label));
    ul.append(li);
  }
}

export function tooltipHtml(r, s) {
  const row = (color, label, value, dash) =>
    `<div class="row"><span class="key line" style="background:${color};${dash ? 'opacity:.6' : ''}"></span><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const pumpTxt = r.pump === 'done' ? s.lgDone : r.pump === 'planned' ? s.lgPlanned : s.no;
  return (
    `<div class="t-time">${clockLabel(r.t)}</div>` +
    row(C.waterLine, s.lgMoist, r.m == null ? '–' : `${r.m.toFixed(1)}%`) +
    (r.mSkip != null ? row(C.coral, s.lgSkip, `${r.mSkip.toFixed(1)}%`) : '') +
    row(C.solar, s.lgSolar, `${r.kw.toFixed(2)} kW`) +
    row(C.water, s.thPump, pumpTxt, r.pump === 'planned') +
    row(C.water, s.lgRain, `${r.mm.toFixed(1)} mm`, true) +
    row(C.grid, s.lgGrid, r.grid ? s.yes : s.no)
  );
}

export function tableHtml(data, s) {
  const rows = [];
  for (let h = 0; h < 24; h++) {
    const r = readingAt(data, data.ws + h + 0.5);
    rows.push(
      `<tr><td>${clockLabel(data.ws + h)}</td><td>${r.kw.toFixed(2)}</td><td>${r.pump === 'off' ? s.no : r.pump === 'done' ? s.lgDone : s.lgPlanned}</td><td>${r.m == null ? '–' : r.m.toFixed(1)}</td><td>${r.mm.toFixed(1)}</td><td>${r.grid ? s.yes : s.no}</td></tr>`,
    );
  }
  return `<thead><tr><th>${esc(s.thTime)}</th><th>${esc(s.thSolar)}</th><th>${esc(s.thPump)}</th><th>${esc(s.thMoist)}</th><th>${esc(s.thRain)}</th><th>${esc(s.thGrid)}</th></tr></thead><tbody>${rows.join('')}</tbody>`;
}
