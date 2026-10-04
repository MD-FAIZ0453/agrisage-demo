import { test } from 'node:test';
import assert from 'node:assert/strict';
import { P, soilConstants } from '../js/params.js';
import { kcForDay, soilStep, moisturePct, pvPowerKw, dispatchStep, stressCoeff } from '../js/twin.js';
import { et0Hourly, weatherAt, makeWeather, SCENARIOS } from '../js/weather.js';

const sc = soilConstants(P);

test('Kc follows the FAO-56 tomato curve', () => {
  assert.equal(kcForDay(10, P), P.kc_ini);
  assert.equal(kcForDay(90, P), P.kc_mid);
  assert.ok(kcForDay(50, P) > P.kc_ini && kcForDay(50, P) < P.kc_mid);
  assert.ok(kcForDay(130, P) < P.kc_mid);
});

test('soil dries with crop water use and wets with irrigation or rain', () => {
  const dried = soilStep(5, { etc: 1, rain: 0, irrNet: 0 }, sc, P);
  assert.ok(dried.dr > 5);
  const irrigated = soilStep(5, { etc: 0.2, rain: 0, irrNet: 3 }, sc, P);
  assert.ok(irrigated.dr < 5);
  const rained = soilStep(5, { etc: 0.2, rain: 4, irrNet: 0 }, sc, P);
  assert.ok(rained.dr < 5);
  assert.ok(moisturePct(irrigated.dr, sc, P) > moisturePct(dried.dr, sc, P));
});

test('water beyond field capacity percolates and depletion is bounded', () => {
  const over = soilStep(1, { etc: 0, rain: 0, irrNet: 5 }, sc, P);
  assert.equal(over.dr, 0);
  assert.ok(Math.abs(over.percolation - 4) < 1e-9);
  const dry = soilStep(sc.taw, { etc: 10, rain: 0, irrNet: 0 }, sc, P);
  assert.ok(dry.dr <= sc.taw);
});

test('stress coefficient is 1 until RAW, then falls', () => {
  assert.equal(stressCoeff(sc.raw * 0.9, sc, P), 1);
  assert.ok(stressCoeff(sc.raw * 1.5, sc, P) < 1);
});

test('PV is zero at night and positive at noon on a clear day', () => {
  const wx = makeWeather(SCENARIOS.hot_dry.days, { doy0: 105, lat: P.lat, lon: P.lon });
  const night = weatherAt(wx, 2);
  const noon = weatherAt(wx, 12.5);
  assert.equal(pvPowerKw(night.g, night.t_c, P), 0);
  const kw = pvPowerKw(noon.g, noon.t_c, P);
  assert.ok(kw > 2 && kw < P.pv_kwp);
});

test('hourly ET0 is plausible for a hot April day (5–9 mm/day)', () => {
  const wx = makeWeather(SCENARIOS.hot_dry.days, { doy0: 105, lat: P.lat, lon: P.lon });
  let day = 0;
  for (let h = 0; h < 24; h += 0.25) day += et0Hourly(weatherAt(wx, h + 0.125), P.elevation_m) * 0.25;
  assert.ok(day > 5 && day < 9, `ET0 ${day.toFixed(2)} mm/day`);
});

test('energy dispatch balances supply and demand', () => {
  for (const [pvKw, loadKw, soc, gridOk] of [[3, 2.2, 0.5, false], [0.5, 2.2, 0.5, true], [0, 2.2, 0.21, false], [1, 0, 0.9, true]]) {
    const d = dispatchStep({ pvKw, loadKw, soc, gridOk, dtH: 1 }, P);
    const supplied = d.pvToLoad + d.batOut + d.grid + d.diesel;
    assert.ok(Math.abs(supplied - loadKw) < 1e-9);
    assert.ok(d.soc >= P.soc_min - 1e-9 && d.soc <= P.soc_max + 1e-9);
    if (!gridOk) assert.equal(d.grid, 0);
  }
});
