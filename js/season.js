// Season evaluation: run a full tomato season hour by hour under three
// policies (fixed schedule, threshold rules, AgriSage optimizer) and report
// per-hectare water, energy, diesel, CO2, cost and water stress.
// Weather is synthetic in this demo (see weather.js); the full system runs
// the same loop on 5+ years of NASA POWER hourly history per district.

import { P, soilConstants } from './params.js';
import { makeWeather, weatherAt, et0Hourly, seasonDays } from './weather.js';
import { kcForDay, soilStep, pvPowerKw, dispatchStep, gridAvailable, seasonLength } from './twin.js';
import { planIrrigation } from './optimizer.js';

export const POLICIES = ['fixed_schedule', 'threshold_rules', 'agrisage'];

function hourlySeries(nDays, seed, p) {
  const days = seasonDays(nDays + 2, seed);
  const wx = makeWeather(days, { doy0: 15, lat: p.lat, lon: p.lon });
  const n = (nDays + 2) * 24;
  const s = { et0: new Float64Array(n), rain: new Float64Array(n), pv: new Float64Array(n), grid: new Uint8Array(n), kc: new Float64Array(n) };
  for (let h = 0; h < n; h++) {
    let et0 = 0;
    let pv = 0;
    for (let q = 0; q < 4; q++) {
      const w = weatherAt(wx, h + (q + 0.5) / 4);
      et0 += et0Hourly(w, p.elevation_m) / 4;
      pv += pvPowerKw(w.g, w.t_c, p) / 4;
    }
    s.et0[h] = et0;
    s.pv[h] = pv;
    s.rain[h] = wx.hours[h].rain_mm;
    s.grid[h] = gridAvailable(h % 24, p) ? 1 : 0;
    s.kc[h] = kcForDay(1 + Math.floor(h / 24), p);
  }
  return s;
}

// Energy setups compared:
//   grid  = typical farm today: grid-powered pump, can pump only in supply hours
//   solar = AgriSage kit: PV + battery, grid in supply hours, diesel backup
export const SETUPS = ['grid', 'solar'];

function setupParams(setup, p) {
  return setup === 'grid' ? { ...p, pv_kwp: 0, bat_kwh: 0 } : p;
}

function canPump(clock, setup, p) {
  return clock >= p.win_start && clock < p.win_end && (setup === 'solar' || gridAvailable(clock, p));
}

function slotsAt(series, h0, horizon, setup, p) {
  const out = [];
  for (let h = h0; h < h0 + horizon; h++) {
    const clock = h % 24;
    out.push({
      t0: h,
      len: 1,
      day: Math.floor(h / 24),
      clock,
      et0: series.et0[h],
      etc: series.et0[h] * series.kc[h],
      rain: series.rain[h],
      pvKwh: series.pv[h],
      gridOk: series.grid[h] === 1,
      allowed: canPump(clock, setup, p),
    });
  }
  return out;
}

export function runSeason(policy, seed, setup = 'solar', base = P) {
  const p = setupParams(setup, base);
  const sc = soilConstants(p);
  const nDays = seasonLength(p);
  const series = hourlySeries(nDays, seed, p);
  let dr = 0;
  let soc = 0.6;
  let thrRunning = false;
  const m = { waterM3: 0, pumpKwh: 0, pv: 0, battery: 0, grid: 0, diesel: 0, stressHours: 0, percolationMm: 0, etc: 0, eta: 0, stressDays: 0, pumpHours: 0 };
  let dayStress = 0;
  let pumpToday = 0;

  for (let h = 0; h < nDays * 24; h++) {
    const clock = h % 24;
    if (clock === 0) {
      if (dayStress >= 2) m.stressDays++;
      dayStress = 0;
      pumpToday = 0;
    }
    let frac = 0;
    if (policy === 'fixed_schedule') {
      const left = p.fixed_start + p.fixed_hours - clock;
      if (clock >= p.fixed_start && left > 0 && canPump(clock, setup, p)) frac = Math.min(1, left);
    } else if (policy === 'threshold_rules') {
      const inWin = canPump(clock, setup, p);
      if (!thrRunning && dr >= p.thr_trigger * sc.raw && inWin) thrRunning = true;
      if (thrRunning) {
        const need = (dr + series.et0[h] * series.kc[h] - p.thr_refill * sc.raw) / sc.netMmPerPumpHour;
        frac = Math.max(0, Math.min(1, need));
        if (frac < 1 || !inWin) thrRunning = false;
        if (!inWin) frac = 0;
      }
    } else {
      const slots = slotsAt(series, h, p.horizon_h, setup, p);
      const plan = planIrrigation({ slots, dr0: dr, soc0: soc, pumpHoursToday: pumpToday, sc, p });
      frac = plan.schedule[0];
    }

    const irrNet = frac * sc.netMmPerPumpHour;
    const etc = series.et0[h] * series.kc[h];
    const st = soilStep(dr, { etc, rain: series.rain[h], irrNet }, sc, p);
    dr = st.dr;
    m.etc += etc;
    m.eta += st.eta;
    m.percolationMm += st.percolation;
    if (dr > sc.raw) {
      m.stressHours++;
      dayStress++;
    }

    const disp = dispatchStep({ pvKw: series.pv[h], loadKw: p.pump_kw * frac, soc, gridOk: series.grid[h] === 1, dtH: 1 }, p);
    soc = disp.soc;
    m.waterM3 += frac * p.flow_m3h;
    m.pumpKwh += p.pump_kw * frac;
    m.pumpHours += frac;
    pumpToday += frac;
    m.pv += disp.pvToLoad;
    m.battery += disp.batOut;
    m.grid += disp.grid;
    m.diesel += disp.diesel;
  }

  const perHa = 1 / p.area_ha;
  const dieselL = m.diesel * p.diesel_l_kwh;
  return {
    policy,
    setup,
    seed,
    waterM3Ha: m.waterM3 * perHa,
    pumpKwhHa: m.pumpKwh * perHa,
    pvKwhHa: m.pv * perHa,
    batteryKwhHa: m.battery * perHa,
    gridKwhHa: m.grid * perHa,
    dieselKwhHa: m.diesel * perHa,
    dieselLHa: dieselL * perHa,
    co2KgHa: (m.grid * p.co2_grid + dieselL * p.co2_diesel) * perHa,
    farmerCostHa: (m.grid * p.grid_tariff_farmer + dieselL * p.diesel_price) * perHa,
    systemCostHa: (m.grid * p.grid_cost_system + dieselL * p.diesel_price) * perHa,
    stressHours: m.stressHours,
    stressDays: m.stressDays,
    percolationM3Ha: (m.percolationMm / 1000) * 10000,
    yieldLossPct: 100 * p.ky * (1 - m.eta / m.etc),
    solarShare: m.pumpKwh > 0 ? (m.pv + m.battery) / m.pumpKwh : 0,
  };
}

function quantiles(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { median: mid, min: s[0], max: s[s.length - 1] };
}

export const SEEDS = [11, 23, 37, 41, 59];

export function runComparison({ seeds = SEEDS, base = P, onProgress } = {}) {
  const runs = [];
  const total = seeds.length * POLICIES.length * SETUPS.length;
  for (const setup of SETUPS) {
    for (const seed of seeds) {
      for (const policy of POLICIES) {
        runs.push(runSeason(policy, seed, setup, base));
        if (onProgress) onProgress(runs.length / total);
      }
    }
  }
  const metrics = Object.keys(runs[0]).filter((k) => typeof runs[0][k] === 'number' && k !== 'seed');
  const summary = {};
  for (const setup of SETUPS) {
    for (const policy of POLICIES) {
      const rs = runs.filter((r) => r.policy === policy && r.setup === setup);
      summary[`${setup}:${policy}`] = Object.fromEntries(metrics.map((k) => [k, quantiles(rs.map((r) => r[k]))]));
    }
  }
  return { seeds, runs, summary, seasonDays: seasonLength(base), fixedHours: base.fixed_hours };
}
