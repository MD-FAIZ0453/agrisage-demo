// Every model parameter used by the demo, with its source (CLAUDE.md rule 2).
// status:
//   "sourced"    taken from the cited reference
//   "check"      from a real reference, but the exact figure or edition must be confirmed
//   "UNVERIFIED" placeholder; replace with a verified value before final submission

export const PARAM_TABLE = [
  // Site
  { group: 'Site', key: 'lat', value: 12.52, unit: '°N', label: 'Latitude (Krishnagiri)', source: 'Krishnagiri town, approximate coordinates', status: 'check' },
  { group: 'Site', key: 'lon', value: 78.21, unit: '°E', label: 'Longitude (Krishnagiri)', source: 'Krishnagiri town, approximate coordinates', status: 'check' },
  { group: 'Site', key: 'elevation_m', value: 490, unit: 'm', label: 'Elevation', source: 'Placeholder, used only for air pressure in ET₀', status: 'UNVERIFIED' },
  { group: 'Site', key: 'area_ha', value: 0.4, unit: 'ha', label: 'Plot area (≈1 acre)', source: 'Demo farm definition (team choice)', status: 'sourced' },

  // Crop: tomato
  { group: 'Crop (tomato)', key: 'kc_ini', value: 0.6, unit: '–', label: 'Kc initial', source: 'FAO-56 (Allen et al., 1998) Table 12', status: 'sourced' },
  { group: 'Crop (tomato)', key: 'kc_mid', value: 1.15, unit: '–', label: 'Kc mid-season (flowering, fruit set)', source: 'FAO-56 Table 12', status: 'sourced' },
  { group: 'Crop (tomato)', key: 'kc_end', value: 0.8, unit: '–', label: 'Kc end (range 0.70–0.90)', source: 'FAO-56 Table 12', status: 'sourced' },
  { group: 'Crop (tomato)', key: 'l_ini', value: 30, unit: 'days', label: 'Initial stage length', source: 'FAO-56 Table 11 (tomato row; confirm the row for Tamil Nadu)', status: 'check' },
  { group: 'Crop (tomato)', key: 'l_dev', value: 40, unit: 'days', label: 'Development stage length', source: 'FAO-56 Table 11', status: 'check' },
  { group: 'Crop (tomato)', key: 'l_mid', value: 40, unit: 'days', label: 'Mid-season stage length', source: 'FAO-56 Table 11', status: 'check' },
  { group: 'Crop (tomato)', key: 'l_late', value: 25, unit: 'days', label: 'Late-season stage length', source: 'FAO-56 Table 11', status: 'check' },
  { group: 'Crop (tomato)', key: 'zr_m', value: 0.7, unit: 'm', label: 'Root depth (lower bound of 0.7–1.5 m)', source: 'FAO-56 Table 22', status: 'sourced' },
  { group: 'Crop (tomato)', key: 'ky', value: 1.05, unit: '–', label: 'Yield response factor Ky (season)', source: 'FAO-33 (Doorenbos & Kassam, 1979) / FAO-66; confirm table', status: 'check' },
  { group: 'Crop (tomato)', key: 'p', value: 0.4, unit: '–', label: 'Depletion fraction p (RAW = p·TAW)', source: 'FAO-56 Table 22', status: 'sourced' },

  // Soil
  { group: 'Soil', key: 'theta_fc', value: 0.23, unit: 'm³/m³', label: 'Field capacity (sandy loam 0.18–0.28)', source: 'FAO-56 Table 19; farm soil test pending', status: 'check' },
  { group: 'Soil', key: 'theta_wp', value: 0.1, unit: 'm³/m³', label: 'Wilting point (sandy loam 0.06–0.16)', source: 'FAO-56 Table 19; farm soil test pending', status: 'check' },

  // Irrigation
  { group: 'Irrigation', key: 'fw', value: 0.35, unit: '–', label: 'Drip wetted fraction (0.3–0.4)', source: 'FAO-56 Table 20 (trickle)', status: 'sourced' },
  { group: 'Irrigation', key: 'eff', value: 0.9, unit: '–', label: 'Drip application efficiency', source: 'FAO Irrigation Water Management Training Manual 4 (Brouwer et al., 1989)', status: 'check' },
  { group: 'Irrigation', key: 'rain_eff', value: 0.8, unit: '–', label: 'Share of rain that is effective', source: 'Placeholder rule of thumb', status: 'UNVERIFIED' },
  { group: 'Irrigation', key: 'win_start', value: 6, unit: 'h', label: 'Irrigation allowed from', source: 'Farmer preference placeholder', status: 'UNVERIFIED' },
  { group: 'Irrigation', key: 'win_end', value: 18, unit: 'h', label: 'Irrigation allowed until', source: 'Farmer preference placeholder', status: 'UNVERIFIED' },
  { group: 'Irrigation', key: 'max_pump_h_day', value: 6, unit: 'h', label: 'Max pump hours per day', source: 'Operational placeholder', status: 'UNVERIFIED' },

  // Pump
  { group: 'Pump', key: 'pump_kw', value: 2.2, unit: 'kW', label: 'Pump input power (3 HP)', source: 'Typical 3 HP solar pump; replace with farm pump nameplate', status: 'UNVERIFIED' },
  { group: 'Pump', key: 'flow_m3h', value: 12, unit: 'm³/h', label: 'Pump flow at operating head', source: 'Placeholder; depends on pump curve and head', status: 'UNVERIFIED' },
  { group: 'Pump', key: 'max_run_min', value: 240, unit: 'min', label: 'Hard cap on one pump run', source: 'Placeholder; CLAUDE.md rule 5 requires a max runtime but sets no value', status: 'UNVERIFIED' },
  { group: 'Pump', key: 'dry_flow_frac', value: 0.2, unit: '–', label: 'Dry-run cutoff: flow below this share of rated', source: 'Safety design (CLAUDE.md rule 5)', status: 'sourced' },
  { group: 'Pump', key: 'dry_delay_min', value: 3, unit: 'min', label: 'Dry-run cutoff delay', source: 'Safety design (CLAUDE.md rule 5)', status: 'sourced' },

  // Solar PV
  { group: 'Solar PV', key: 'pv_kwp', value: 4.0, unit: 'kWp', label: 'PV array size', source: 'Demo system size placeholder', status: 'UNVERIFIED' },
  { group: 'Solar PV', key: 'pv_derate', value: 0.86, unit: '–', label: 'System derate (14% losses)', source: 'NREL PVWatts default system losses', status: 'check' },
  { group: 'Solar PV', key: 'pv_gamma', value: -0.004, unit: '1/°C', label: 'Power temperature coefficient', source: 'Typical c-Si module datasheet; use chosen module', status: 'check' },
  { group: 'Solar PV', key: 'pv_noct', value: 45, unit: '°C', label: 'NOCT', source: 'Typical c-Si module datasheet; use chosen module', status: 'check' },

  // Battery
  { group: 'Battery', key: 'bat_kwh', value: 2, unit: 'kWh', label: 'Battery capacity', source: 'Demo system size placeholder', status: 'UNVERIFIED' },
  { group: 'Battery', key: 'soc_min', value: 0.2, unit: '–', label: 'Minimum state of charge', source: 'Design placeholder', status: 'UNVERIFIED' },
  { group: 'Battery', key: 'soc_max', value: 0.95, unit: '–', label: 'Maximum state of charge', source: 'Design placeholder', status: 'UNVERIFIED' },
  { group: 'Battery', key: 'bat_eff', value: 0.95, unit: '–', label: 'One-way efficiency', source: 'Typical LFP placeholder', status: 'UNVERIFIED' },
  { group: 'Battery', key: 'bat_kw', value: 2.5, unit: 'kW', label: 'Max charge / discharge power', source: 'Design placeholder', status: 'UNVERIFIED' },

  // Grid
  { group: 'Grid', key: 'grid_spells', value: [[5, 11], [17, 23]], unit: 'h', label: '3-phase farm supply hours', source: 'Varies by feeder; get TANGEDCO schedule for the village', status: 'UNVERIFIED' },
  { group: 'Grid', key: 'grid_tariff_farmer', value: 0, unit: '₹/kWh', label: 'Farmer tariff (agriculture)', source: 'TNERC tariff order, LT-IV agriculture (free supply); confirm current order', status: 'check' },
  { group: 'Grid', key: 'grid_cost_system', value: 7, unit: '₹/kWh', label: 'Cost of supply borne by DISCOM / state', source: 'Placeholder', status: 'UNVERIFIED' },

  // Diesel
  { group: 'Diesel', key: 'diesel_l_kwh', value: 0.35, unit: 'L/kWh', label: 'Genset fuel use', source: 'Placeholder for a small genset', status: 'UNVERIFIED' },
  { group: 'Diesel', key: 'diesel_price', value: 93, unit: '₹/L', label: 'Diesel retail price', source: 'Placeholder; check current Tamil Nadu retail price', status: 'UNVERIFIED' },

  // Emissions
  { group: 'Emissions', key: 'co2_grid', value: 0.71, unit: 'kg/kWh', label: 'Grid emission factor', source: 'CEA CO2 Baseline Database; confirm latest version', status: 'check' },
  { group: 'Emissions', key: 'co2_diesel', value: 2.68, unit: 'kg/L', label: 'Diesel emission factor', source: 'IPCC 2006 Vol. 2 Table 1.4 (74,100 kg CO2/TJ)', status: 'sourced' },

  // Optimizer
  { group: 'Optimizer', key: 'horizon_h', value: 24, unit: 'h', label: 'Planning horizon (re-solved hourly)', source: 'docs/ARCHITECTURE.md', status: 'sourced' },
  { group: 'Optimizer', key: 'w_stress', value: 10, unit: '₹/(mm·h)', label: 'Penalty for depletion above RAW', source: 'Policy weight (design choice)', status: 'sourced' },
  { group: 'Optimizer', key: 'w_term', value: 5, unit: '₹/mm', label: 'End-of-horizon refill penalty', source: 'Policy weight (design choice)', status: 'sourced' },
  { group: 'Optimizer', key: 'term_frac', value: 0.8, unit: '–', label: 'End-of-horizon target (share of RAW)', source: 'Policy weight (design choice)', status: 'sourced' },
  { group: 'Optimizer', key: 'w_water', value: 0.5, unit: '₹/mm', label: 'Value of pumped groundwater', source: 'Policy weight (design choice)', status: 'sourced' },
  { group: 'Optimizer', key: 'bat_wear', value: 2, unit: '₹/kWh', label: 'Battery wear cost', source: 'Placeholder', status: 'UNVERIFIED' },

  // Baselines
  { group: 'Baselines', key: 'fixed_start', value: 7, unit: 'h', label: 'Fixed schedule: daily start time', source: 'Farmer practice placeholder; needs field survey', status: 'UNVERIFIED' },
  { group: 'Baselines', key: 'fixed_hours', value: 3, unit: 'h/day', label: 'Fixed schedule: daily run time', source: 'Farmer practice placeholder; needs field survey', status: 'UNVERIFIED' },
  { group: 'Baselines', key: 'thr_trigger', value: 0.9, unit: '× RAW', label: 'Threshold rule: start when depletion reaches', source: 'Baseline design', status: 'sourced' },
  { group: 'Baselines', key: 'thr_refill', value: 0.1, unit: '× RAW', label: 'Threshold rule: stop when depletion falls to', source: 'Baseline design', status: 'sourced' },
];

export const P = Object.fromEntries(PARAM_TABLE.map((r) => [r.key, r.value]));

// Derived soil-water quantities for the drip wetted zone (mm over field area).
export function soilConstants(p = P) {
  const tawFull = 1000 * (p.theta_fc - p.theta_wp) * p.zr_m;
  const taw = tawFull * p.fw;
  const raw = p.p * taw;
  const areaM2 = p.area_ha * 10000;
  // Net depth (mm over field area) added per pump-hour.
  const netMmPerPumpHour = (p.flow_m3h * p.eff * 1000) / areaM2;
  return { taw, raw, areaM2, netMmPerPumpHour };
}

export function unverifiedParams() {
  return PARAM_TABLE.filter((r) => r.status === 'UNVERIFIED');
}
