// Rolling-horizon irrigation and energy scheduler (prototype of the MPC in
// docs/ARCHITECTURE.md). Every hour it plans the next 24 h: how many pump
// minutes to run in each hour, so that the crop stays out of water stress at
// the lowest energy cost. Solved by greedy marginal descent in 15-minute
// increments; the full system swaps this for a PuLP/CBC MILP with the same
// inputs and outputs.

import { weatherAt, et0Hourly } from './weather.js';
import { pvPowerKw, gridAvailable } from './twin.js';

const INC_H = 0.25;

// Forecast slots from tNow over the horizon. Quantities are totals per slot.
export function buildSlots(wx, tNow, horizonH, kcAt, p) {
  const slots = [];
  const end = tNow + horizonH;
  let t0 = tNow;
  while (t0 < end - 1e-9) {
    const t1 = Math.min(Math.floor(t0 + 1e-9) + 1, end);
    const len = t1 - t0;
    const n = Math.max(1, Math.round(len / 0.25));
    const dt = len / n;
    let et0 = 0;
    let rain = 0;
    let pvKwh = 0;
    for (let i = 0; i < n; i++) {
      const w = weatherAt(wx, t0 + (i + 0.5) * dt);
      et0 += et0Hourly(w, p.elevation_m) * dt;
      rain += w.rain_rate * dt;
      pvKwh += pvPowerKw(w.g, w.t_c, p) * dt;
    }
    const clock = t0 - 24 * Math.floor(t0 / 24);
    slots.push({
      t0,
      len,
      day: Math.floor(t0 / 24),
      clock,
      et0,
      etc: et0 * kcAt(t0),
      rain,
      pvKwh,
      gridOk: gridAvailable(clock, p),
      allowed: clock >= p.win_start && clock < p.win_end,
    });
    t0 = t1;
  }
  return slots;
}

// Simulate a pump schedule (hours per slot) over the slots and score it.
export function evaluate(schedule, slots, { dr0, soc0 }, sc, p) {
  let dr = dr0;
  let soc = soc0;
  let cost = 0;
  let stress = 0;
  let stressHours = 0;
  let percolation = 0;
  let irrigation = 0;
  const energy = { pv: 0, battery: 0, grid: 0, diesel: 0 };
  const drTraj = [dr0];
  const socTraj = [soc0];
  const cap = p.bat_kwh;
  for (let s = 0; s < slots.length; s++) {
    const sl = slots[s];
    const h = schedule[s];
    const irrNet = h * sc.netMmPerPumpHour;
    let next = dr + sl.etc - sl.rain * p.rain_eff - irrNet;
    if (next < 0) {
      percolation += -next;
      next = 0;
    }
    if (next > sc.taw) next = sc.taw;
    if (next > sc.raw) {
      stress += (next - sc.raw) * sl.len;
      stressHours += sl.len;
    }
    dr = next;
    irrigation += irrNet;

    // Energy for the pump in this slot.
    const pvAvgKw = sl.pvKwh / sl.len;
    const pumpKwh = p.pump_kw * h;
    const pvToPump = Math.min(p.pump_kw, pvAvgKw) * h;
    let deficit = pumpKwh - pvToPump;
    const surplus = sl.pvKwh - pvToPump;
    energy.pv += pvToPump;
    if (deficit > 0) {
      const avail = cap > 0 ? Math.max(0, (soc - p.soc_min) * cap * p.bat_eff) : 0;
      const fromBat = Math.min(deficit, avail, p.bat_kw * h);
      if (fromBat > 0) soc -= fromBat / p.bat_eff / cap;
      energy.battery += fromBat;
      cost += fromBat * p.bat_wear;
      deficit -= fromBat;
      if (deficit > 1e-9) {
        if (sl.gridOk) {
          energy.grid += deficit;
          cost += deficit * p.grid_cost_system;
        } else {
          energy.diesel += deficit;
          cost += deficit * p.diesel_l_kwh * p.diesel_price;
        }
      }
    }
    if (surplus > 0 && cap > 0) {
      const room = Math.max(0, ((p.soc_max - soc) * cap) / p.bat_eff);
      soc += (Math.min(surplus, room, p.bat_kw * sl.len) * p.bat_eff) / cap;
    }
    cost += p.w_water * (irrNet / p.eff);
    // Tie-break toward later slots (just in time): when two hours cost the
    // same, wait. Keeps re-plans stable and leaves room for forecast rain.
    cost += 1e-3 * (slots.length - s) * h;
    drTraj.push(dr);
    socTraj.push(soc);
  }
  const termExcess = Math.max(0, dr - p.term_frac * sc.raw);
  cost += p.w_stress * stress + p.w_term * termExcess + 2 * p.w_water * percolation;
  return { cost, stress, stressHours, percolation, irrigation, energy, drTraj, socTraj };
}

// Group a schedule into contiguous pump runs with clock start/end times.
export function toBlocks(schedule, slots) {
  const blocks = [];
  let s = 0;
  while (s < slots.length) {
    if (schedule[s] < 1e-6) {
      s++;
      continue;
    }
    let e = s;
    while (e + 1 < slots.length && schedule[e + 1] > 1e-6) e++;
    const first = slots[s];
    // Partial first slot runs at its end so the run is contiguous.
    const start = e > s ? first.t0 + first.len - schedule[s] : first.t0;
    let hours = 0;
    for (let i = s; i <= e; i++) hours += schedule[i];
    // The farm executes a block as one continuous run.
    blocks.push({ start, end: start + hours, hours });
    s = e + 1;
  }
  return blocks;
}

// Plan the next horizon. opts.forbidBefore blocks pumping before a time;
// opts.forceHours forces a run of that length starting at opts.forceFrom (default: now).
export function planIrrigation({ slots, dr0, soc0, pumpHoursToday = 0, sc, p, opts = {} }) {
  const n = slots.length;
  const schedule = new Array(n).fill(0);
  const usedByDay = new Map();
  const dayCap = (day) => p.max_pump_h_day - (day === slots[0].day ? pumpHoursToday : 0);
  const state = { dr0, soc0 };

  if (opts.forceHours) {
    let left = opts.forceHours;
    const from = opts.forceFrom ?? slots[0].t0;
    for (let s = 0; s < n && left > 1e-9; s++) {
      if (slots[s].t0 + slots[s].len <= from + 1e-9) continue;
      const take = Math.min(slots[s].len, left);
      schedule[s] = take;
      left -= take;
    }
  } else {
    let best = evaluate(schedule, slots, state, sc, p);
    for (let iter = 0; iter < 200; iter++) {
      let bestS = -1;
      let bestEval = best;
      for (let s = 0; s < n; s++) {
        const sl = slots[s];
        if (!sl.allowed) continue;
        if (opts.forbidBefore !== undefined && sl.t0 < opts.forbidBefore) continue;
        if (schedule[s] + INC_H > sl.len + 1e-9) continue;
        if ((usedByDay.get(sl.day) || 0) + INC_H > dayCap(sl.day) + 1e-9) continue;
        schedule[s] += INC_H;
        const ev = evaluate(schedule, slots, state, sc, p);
        schedule[s] -= INC_H;
        if (ev.cost < bestEval.cost - 1e-6) {
          bestEval = ev;
          bestS = s;
        }
      }
      if (bestS < 0) break;
      schedule[bestS] += INC_H;
      usedByDay.set(slots[bestS].day, (usedByDay.get(slots[bestS].day) || 0) + INC_H);
      best = bestEval;
    }
  }

  const result = evaluate(schedule, slots, state, sc, p);
  const noIrr = evaluate(new Array(n).fill(0), slots, state, sc, p);
  const totalHours = schedule.reduce((a, b) => a + b, 0);
  const pumpKwh = totalHours * p.pump_kw;

  // First slot end at which depletion passes RAW without irrigation.
  let stressEtaH = null;
  for (let s = 0; s < n; s++) {
    if (noIrr.drTraj[s + 1] > sc.raw) {
      stressEtaH = slots[s].t0 + slots[s].len - slots[0].t0;
      break;
    }
  }
  let rain24 = 0;
  let rainFirstT = null;
  for (const sl of slots) {
    if (sl.t0 - slots[0].t0 < 24) {
      rain24 += sl.rain;
      if (sl.rain > 0.5 && rainFirstT === null) rainFirstT = sl.t0;
    }
  }
  const noIrrDrop = noIrr.drTraj.some((d, i) => i > 0 && d < noIrr.drTraj[i - 1] - 0.5);

  return {
    schedule,
    blocks: toBlocks(schedule, slots),
    totalHours,
    volumeM3: totalHours * p.flow_m3h,
    grossMm: (totalHours * p.flow_m3h * 1000) / (p.area_ha * 10000),
    pumpKwh,
    energy: result.energy,
    solarShare: pumpKwh > 0 ? result.energy.pv / pumpKwh : 0,
    stressMmH: result.stress,
    stressHours: result.stressHours,
    noIrrStressMmH: noIrr.stress,
    noIrrStressHours: noIrr.stressHours,
    stressEtaH,
    rain24,
    rainFirstT,
    rainRefills: noIrrDrop,
    drTraj: result.drTraj,
    socTraj: result.socTraj,
    noIrrDrTraj: noIrr.drTraj,
    cost: result.cost,
  };
}
