// Digital twin: pure functions, no I/O (CLAUDE.md rule 3).
// Soil water uses the FAO-56 single crop coefficient bucket model, applied to
// the drip wetted zone (TAW scaled by the wetted fraction fw).

// FAO-56 Kc curve: flat initial, linear development, flat mid, linear late.
export function kcForDay(day, p) {
  const a = p.l_ini;
  const b = a + p.l_dev;
  const c = b + p.l_mid;
  const d = c + p.l_late;
  if (day <= a) return p.kc_ini;
  if (day <= b) return p.kc_ini + ((day - a) / p.l_dev) * (p.kc_mid - p.kc_ini);
  if (day <= c) return p.kc_mid;
  if (day <= d) return p.kc_mid + ((day - c) / p.l_late) * (p.kc_end - p.kc_mid);
  return p.kc_end;
}

export function stageForDay(day, p) {
  if (day <= p.l_ini) return 'initial';
  if (day <= p.l_ini + p.l_dev) return 'development';
  if (day <= p.l_ini + p.l_dev + p.l_mid) return 'mid';
  return 'late';
}

export function seasonLength(p) {
  return p.l_ini + p.l_dev + p.l_mid + p.l_late;
}

// FAO-56 eq. 84: water stress coefficient.
export function stressCoeff(dr, sc, p) {
  if (dr <= sc.raw) return 1;
  return Math.max(0, (sc.taw - dr) / ((1 - p.p) * sc.taw));
}

// One soil step. All depths in mm over the field area.
export function soilStep(dr, { etc, rain, irrNet }, sc, p) {
  const ks = stressCoeff(dr, sc, p);
  const eta = ks * etc;
  let next = dr + eta - rain * p.rain_eff - irrNet;
  let percolation = 0;
  if (next < 0) {
    percolation = -next;
    next = 0;
  }
  if (next > sc.taw) next = sc.taw;
  return { dr: next, ks, eta, percolation };
}

// Volumetric moisture (%) the root-zone sensor would read at depletion dr.
export function moisturePct(dr, sc, p) {
  return 100 * (p.theta_fc - (dr / sc.taw) * (p.theta_fc - p.theta_wp));
}

export function depletionFromMoisture(pct, sc, p) {
  return ((p.theta_fc - pct / 100) / (p.theta_fc - p.theta_wp)) * sc.taw;
}

// PV output (kW) with a NOCT cell-temperature model.
export function pvPowerKw(gWm2, tAir, p) {
  if (gWm2 <= 0) return 0;
  const tCell = tAir + ((p.pv_noct - 20) / 800) * gWm2;
  return Math.max(0, p.pv_kwp * (gWm2 / 1000) * p.pv_derate * (1 + p.pv_gamma * (tCell - 25)));
}

// Energy dispatch for one step: PV → load, surplus → battery → export/spill;
// deficit ← battery ← grid (if supply is on) ← diesel. Energies in kWh.
export function dispatchStep({ pvKw, loadKw, soc, gridOk, dtH }, p) {
  const pv = pvKw * dtH;
  const load = loadKw * dtH;
  const cap = p.bat_kwh;
  const out = { pvToLoad: 0, batOut: 0, batIn: 0, grid: 0, diesel: 0, spill: 0, soc };
  out.pvToLoad = Math.min(pv, load);
  let deficit = load - out.pvToLoad;
  let surplus = pv - out.pvToLoad;
  if (cap <= 0) {
    if (deficit > 1e-9) {
      if (gridOk) out.grid = deficit;
      else out.diesel = deficit;
    }
    out.spill = surplus;
    return out;
  }
  if (deficit > 0) {
    const avail = Math.max(0, (soc - p.soc_min) * cap * p.bat_eff);
    out.batOut = Math.min(deficit, avail, p.bat_kw * dtH);
    out.soc -= out.batOut / p.bat_eff / cap;
    deficit -= out.batOut;
    if (deficit > 1e-9) {
      if (gridOk) out.grid = deficit;
      else out.diesel = deficit;
    }
  }
  if (surplus > 0) {
    const room = Math.max(0, ((p.soc_max - out.soc) * cap) / p.bat_eff);
    out.batIn = Math.min(surplus, room, p.bat_kw * dtH);
    out.soc += (out.batIn * p.bat_eff) / cap;
    surplus -= out.batIn;
    out.spill = surplus;
  }
  return out;
}

// Pump model: rated flow and power when running; a dry well gives no flow
// and lower electrical load.
export function pumpState({ on, dryWell }, p) {
  if (!on) return { flowM3h: 0, kw: 0 };
  if (dryWell) return { flowM3h: 0, kw: p.pump_kw * 0.55 };
  return { flowM3h: p.flow_m3h, kw: p.pump_kw };
}

export function gridAvailable(clockHour, p) {
  return p.grid_spells.some(([a, b]) => clockHour >= a && clockHour < b);
}
