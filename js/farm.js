// Live simulated farm. Runs the twin every simulated minute, publishes
// sensor readings on the MQTT topics from docs/ARCHITECTURE.md (the ESP32
// will use the same topics and payloads), re-plans every hour, and executes
// pump commands with farmer confirmation, a max runtime and a dry-run cutoff.

import { P, soilConstants } from './params.js';
import { SCENARIOS, makeWeather, weatherAt, et0Hourly, mulberry32 } from './weather.js';
import { kcForDay, soilStep, moisturePct, pvPowerKw, dispatchStep, pumpState, gridAvailable, stressCoeff } from './twin.js';
import { buildSlots, planIrrigation } from './optimizer.js';

export const FARM_ID = 'kgi-001';
const CROP_DAY0 = 72; // days after transplanting on demo day 0 (mid-season: flowering, fruit set)
const DOY0 = 105; // 15 April
const HISTORY_MIN = 24 * 60;

function pad(n) {
  return String(n).padStart(2, '0');
}

export function clockLabel(tAbs) {
  const day = Math.floor(tAbs / 24);
  let mins = Math.round((tAbs - day * 24) * 60);
  if (mins >= 1440) mins = 1439;
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export function isoTs(tAbs) {
  const day = Math.floor(tAbs / 24);
  const d = 15 + day;
  return `2026-04-${pad(d)}T${clockLabel(tAbs)}:00+05:30`;
}

export class Farm {
  constructor(scenarioId = 'hot_dry') {
    this.p = P;
    this.sc = soilConstants(P);
    this.listeners = new Set();
    this.reset(scenarioId);
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, data) {
    for (const fn of this.listeners) fn(type, data);
  }

  reset(scenarioId) {
    const scn = SCENARIOS[scenarioId];
    this.scenario = scn;
    this.wx = makeWeather(scn.days, { doy0: DOY0, lat: P.lat, lon: P.lon });
    this.t = scn.startHour;
    this.dr = scn.drFrac * this.sc.raw;
    this.soc = scn.soc;
    this.rnd = mulberry32(42);
    this.dryWell = false;
    this.pump = { on: false, since: null, maxMinutes: 0, decisionId: null, targetM3: 0, deliveredM3: 0, lowFlowMin: 0, source: null };
    this.today = { day: 0, waterM3: 0, pumpKwh: 0, pv: 0, battery: 0, grid: 0, diesel: 0, pvGen: 0, pumpHours: 0, totalL: 0 };
    this.history = [];
    this.approvedDay = null;
    this.pending = null;
    this.lastPublishMin = -999;
    this.decision = null;
    this.alerts = [];
    this.mqttLog = [];
    this.lastReplanHour = Math.floor(this.t);
    this.backfillHistory(4);
    this.sample();
    this.replan('start');
    this.publishSensors(true);
    this.emit('reset', { scenarioId });
  }

  // Moisture history from `fromHour` to the scenario start (no irrigation),
  // ending exactly at the scenario's starting depletion.
  backfillHistory(fromHour) {
    const steps = Math.round((this.t - fromHour) * 60);
    if (steps <= 0) return;
    const etc = [];
    for (let i = 0; i < steps; i++) {
      const w = weatherAt(this.wx, fromHour + (i + 0.5) / 60);
      etc.push(et0Hourly(w, this.p.elevation_m) * this.kcAt(fromHour) / 60);
    }
    let dr = Math.max(0, this.dr - etc.reduce((a, b) => a + b, 0));
    for (let i = 0; i < steps; i++) {
      dr += etc[i];
      const t = fromHour + (i + 1) / 60;
      const w = weatherAt(this.wx, t);
      const m = moisturePct(dr, this.sc, this.p);
      this.history.push({ t, m, mt: m, pv: pvPowerKw(w.g, w.t_c, this.p), soc: this.soc, pump: 0, temp: w.t_c, rh: w.rh });
    }
  }

  kcAt(tAbs) {
    return kcForDay(CROP_DAY0 + Math.floor(tAbs / 24), this.p);
  }

  cropDay() {
    return CROP_DAY0 + Math.floor(this.t / 24);
  }

  weatherNow() {
    return weatherAt(this.wx, this.t);
  }

  // Current readings as the sensors would report them.
  sample() {
    const w = this.weatherNow();
    const ps = pumpState({ on: this.pump.on, dryWell: this.dryWell }, this.p);
    const noise = () => (this.rnd() - 0.5) * 0.3;
    const day = Math.floor(this.t / 24);
    const meanT = (this.scenario.days[Math.min(day, 2)].tmax + this.scenario.days[Math.min(day, 2)].tmin) / 2;
    this.readings = {
      ts: isoTs(this.t),
      moisturePct: moisturePct(this.dr, this.sc, this.p) + noise(),
      soilTempC: meanT + 0.35 * (w.t_c - meanT) + (this.pump.on && !this.dryWell ? -1.2 : 0),
      airTempC: w.t_c,
      rhPct: w.rh,
      pvKw: pvPowerKw(w.g, w.t_c, this.p),
      ghi: w.g,
      soc: this.soc,
      pumpKw: ps.kw,
      flowLpm: ps.flowM3h > 0 ? (ps.flowM3h * 1000) / 60 + noise() * 4 : 0,
      totalL: this.today.totalL,
      gridOk: gridAvailable(w.clock, this.p),
      ks: stressCoeff(this.dr, this.sc, this.p),
    };
    return this.readings;
  }

  forecastSummary() {
    const day = Math.floor(this.t / 24);
    const d = this.scenario.days[Math.min(day, this.scenario.days.length - 1)];
    const d1 = this.scenario.days[Math.min(day + 1, this.scenario.days.length - 1)];
    let rain24 = 0;
    for (let h = 0; h < 24; h++) rain24 += weatherAt(this.wx, this.t + h + 0.5).rain_rate;
    return { tmax: d.tmax, tmin: d.tmin, rhmin: d.rhmin, rhmax: d.rhmax, rainProb: Math.max(d.rainProb, rain24 > 1 ? d1.rainProb : 0), rain24, cloud: d.cloud, tomorrow: d1 };
  }

  slots(horizon = this.p.horizon_h) {
    return buildSlots(this.wx, this.t, horizon, (x) => this.kcAt(x), this.p);
  }

  replan(trigger) {
    const slots = this.slots();
    const plan = planIrrigation({ slots, dr0: this.dr, soc0: this.soc, pumpHoursToday: this.today.pumpHours, sc: this.sc, p: this.p });
    const first = plan.blocks[0];
    let action;
    if (this.pump.on) action = 'running';
    else if (!first) action = plan.rain24 > 2 && plan.rainRefills ? 'skip_rain' : 'no_need';
    else if (first.start - this.t < 0.1) action = 'irrigate_now';
    else if (Math.floor(first.start / 24) > Math.floor(this.t / 24)) action = 'next_day';
    else action = 'irrigate_later';
    const day = Math.floor(this.t / 24);
    const id = `D-${pad(15 + day)}04-${clockLabel(this.t).replace(':', '')}`;
    this.decision = {
      id,
      createdAt: this.t,
      trigger,
      action,
      plan,
      slots,
      moisturePct: moisturePct(this.dr, this.sc, this.p),
      refillPct: moisturePct(this.sc.raw, this.sc, this.p),
      fcPct: this.p.theta_fc * 100,
      drFracRaw: this.dr / this.sc.raw,
      soc: this.soc,
      kc: this.kcAt(this.t),
      cropDay: this.cropDay(),
      forecast: this.forecastSummary(),
      approved: first ? this.approvedDay === Math.floor(first.start / 24) : false,
    };
    this.emit('decision', this.decision);
    return this.decision;
  }

  // Ask to start the pump. Returns a pending command that needs farmer confirmation.
  requestPump(action, { minutes, source = 'chat' } = {}) {
    if (action === 'off') {
      this.pending = { action: 'off', source };
      return this.pending;
    }
    const plan = this.decision?.plan;
    const planned = plan && plan.totalHours > 0 ? plan.blocks[0].hours * 60 : 60;
    const runMin = Math.min(this.runCap(), Math.round(minutes || planned));
    this.pending = { action: 'on', maxMinutes: Math.round(runMin * 1.05), runMinutes: runMin, source, decisionId: this.decision?.id };
    return this.pending;
  }

  confirmPending() {
    const cmd = this.pending;
    this.pending = null;
    if (!cmd) return null;
    if (cmd.action === 'off') this.stopPump('farmer');
    else this.startPump({ minutes: cmd.runMinutes, maxMinutes: cmd.maxMinutes, source: cmd.source, decisionId: cmd.decisionId });
    return cmd;
  }

  cancelPending() {
    this.pending = null;
  }

  // Longest run whose 5% safety margin still fits under the hard limit, so a
  // run always ends at its target before the hard limit can trip.
  runCap() {
    return Math.floor(this.p.max_run_min / 1.05);
  }

  // Approval covers the day of the plan's next run (today, or tomorrow when
  // today's water is already done).
  approvePlan() {
    const b = this.decision?.plan.blocks[0];
    this.approvedDay = b ? Math.floor(b.start / 24) : Math.floor(this.t / 24);
    this.approvedM3 = b ? b.hours * this.p.flow_m3h : null;
    if (this.decision) this.decision.approved = Boolean(b);
    this.emit('approved', { day: this.approvedDay });
    this.maybeAutoStart();
  }

  startPump({ minutes, maxMinutes, source, decisionId }) {
    if (this.pump.on) return;
    const targetM3 = (minutes / 60) * this.p.flow_m3h;
    this.pump = { on: true, since: this.t, maxMinutes, decisionId, targetM3, deliveredM3: 0, lowFlowMin: 0, source };
    this.publish(`farm/${FARM_ID}/cmd/pump`, { action: 'on', max_minutes: maxMinutes, decision_id: decisionId });
    this.emit('pump', { on: true, source, maxMinutes, targetM3, approvedM3: source === 'plan' ? this.approvedM3 : null });
    this.sample();
    this.publishSensors(true);
  }

  stopPump(reason) {
    if (!this.pump.on) return;
    const ranMin = Math.round((this.t - this.pump.since) * 60);
    const delivered = this.pump.deliveredM3;
    this.publish(`farm/${FARM_ID}/cmd/pump`, { action: 'off', max_minutes: 0, decision_id: this.pump.decisionId });
    this.pump = { ...this.pump, on: false };
    this.emit('pump', { on: false, reason, ranMin, deliveredM3: delivered });
    this.sample();
    this.publishSensors(true);
    this.replan(`pump_off:${reason}`);
  }

  setDryWell(v) {
    this.dryWell = v;
    this.emit('fault', { dryWell: v });
  }

  maybeAutoStart() {
    const d = this.decision;
    if (!d || this.pump.on) return;
    const b = d.plan.blocks[0];
    if (!b || this.approvedDay !== Math.floor(b.start / 24)) return;
    if (b.start <= this.t + 1e-4 && b.end > this.t + 1e-4) {
      const minutes = Math.min(this.runCap(), Math.max(6, Math.round((b.end - this.t) * 60)));
      this.startPump({ minutes, maxMinutes: Math.round(minutes * 1.05), source: 'plan', decisionId: d.id });
    }
  }

  publish(topic, payload) {
    const msg = { t: this.t, topic, payload: { ts: isoTs(this.t), ...payload } };
    if (topic.includes('/cmd/')) msg.payload = { ...payload };
    this.mqttLog.push(msg);
    if (this.mqttLog.length > 80) this.mqttLog.shift();
    this.emit('mqtt', msg);
  }

  publishSensors(force = false) {
    const nowMin = Math.round(this.t * 60);
    const every = this.pump.on ? 5 : 15;
    if (!force && nowMin - this.lastPublishMin < every) return;
    this.lastPublishMin = nowMin;
    const r = this.readings;
    const f1 = (x) => Math.round(x * 10) / 10;
    const f2 = (x) => Math.round(x * 100) / 100;
    this.publish(`farm/${FARM_ID}/sensor/soil`, { moisture_pct: f1(r.moisturePct), soil_temp_c: f1(r.soilTempC) });
    this.publish(`farm/${FARM_ID}/sensor/energy`, { pv_kw: f2(r.pvKw), battery_soc: f2(r.soc), pump_kw: f2(r.pumpKw) });
    if (this.pump.on || force) this.publish(`farm/${FARM_ID}/sensor/flow`, { flow_lpm: f1(r.flowLpm), total_l: Math.round(r.totalL) });
  }

  // Advance the simulation by a number of minutes.
  advance(minutes) {
    for (let i = 0; i < minutes; i++) this.stepMinute();
    this.emit('tick', null);
  }

  stepMinute() {
    const dtH = 1 / 60;
    const tMid = this.t + dtH / 2;
    const w = weatherAt(this.wx, tMid);
    const ps = pumpState({ on: this.pump.on, dryWell: this.dryWell }, this.p);

    const irrM3 = ps.flowM3h * dtH;
    const irrNet = (irrM3 * this.p.eff * 1000) / this.sc.areaM2;
    const etc = et0Hourly(w, this.p.elevation_m) * this.kcAt(tMid) * dtH;
    const step = soilStep(this.dr, { etc, rain: w.rain_rate * dtH, irrNet }, this.sc, this.p);
    this.dr = step.dr;

    const pvKw = pvPowerKw(w.g, w.t_c, this.p);
    const gridOk = gridAvailable(w.clock, this.p);
    const disp = dispatchStep({ pvKw, loadKw: ps.kw, soc: this.soc, gridOk, dtH }, this.p);
    this.soc = disp.soc;

    const day = Math.floor((this.t + dtH) / 24);
    if (day !== this.today.day) {
      this.today = { day, waterM3: 0, pumpKwh: 0, pv: 0, battery: 0, grid: 0, diesel: 0, pvGen: 0, pumpHours: 0, totalL: 0 };
    }
    this.today.pvGen += pvKw * dtH;
    if (this.pump.on) {
      this.today.waterM3 += irrM3;
      this.today.totalL += irrM3 * 1000;
      this.today.pumpKwh += ps.kw * dtH;
      this.today.pv += disp.pvToLoad;
      this.today.battery += disp.batOut;
      this.today.grid += disp.grid;
      this.today.diesel += disp.diesel;
      this.today.pumpHours += dtH;
      this.pump.deliveredM3 += irrM3;
    }

    this.t += dtH;
    this.sample();

    if (this.pump.on) {
      const ranMin = (this.t - this.pump.since) * 60;
      // Edge safety rule (runs on the ESP32): dry-run cutoff.
      if (this.readings.flowLpm < this.p.dry_flow_frac * ((this.p.flow_m3h * 1000) / 60)) this.pump.lowFlowMin += 1;
      else this.pump.lowFlowMin = 0;
      if (this.pump.lowFlowMin >= this.p.dry_delay_min) {
        this.alerts.push({ t: this.t, type: 'dry_run' });
        this.emit('alert', { type: 'dry_run', t: this.t });
        this.stopPump('dry_run');
      } else if (this.pump.deliveredM3 >= this.pump.targetM3 - 1e-6) {
        this.stopPump('target');
      } else if (ranMin >= this.pump.maxMinutes - 1e-6) {
        this.stopPump('max_runtime');
      } else if (this.dr <= 0.02) {
        this.stopPump('field_capacity');
      }
    }

    this.history.push({ t: this.t, m: this.readings.moisturePct, mt: moisturePct(this.dr, this.sc, this.p), pv: this.readings.pvKw, soc: this.soc, pump: this.pump.on ? 1 : 0, temp: w.t_c, rh: w.rh });
    if (this.history.length > HISTORY_MIN) this.history.shift();

    this.publishSensors();

    const hour = Math.floor(this.t + 1e-9);
    if (hour !== this.lastReplanHour) {
      this.lastReplanHour = hour;
      if (!this.pump.on) this.replan('hourly');
    }
    this.maybeAutoStart();
  }

  // When the next irrigation falls due: the time depletion would pass RAW
  // with no irrigation, looking up to 48 h ahead.
  nextIrrigationDue() {
    const slots = this.slots(48);
    let dr = this.dr;
    for (const s of slots) {
      dr += s.etc - s.rain * this.p.rain_eff;
      if (dr < 0) dr = 0;
      if (dr > this.sc.raw) return s.t0 + s.len;
    }
    return null;
  }

  // Twin-based what-if: compare the current plan with an alternative action.
  whatIf(kind) {
    const slots = this.slots();
    const base = { slots, dr0: this.dr, soc0: this.soc, pumpHoursToday: this.today.pumpHours, sc: this.sc, p: this.p };
    const plan = planIrrigation(base);
    const hours = plan.totalHours > 0 ? plan.blocks[0].hours : 2;
    let alt;
    let altStart = null;
    if (kind === 'now') {
      altStart = this.t;
      alt = planIrrigation({ ...base, opts: { forceHours: hours } });
    } else if (kind === 'night') {
      const day = Math.floor(this.t / 24);
      altStart = this.t < day * 24 + 19 ? day * 24 + 19 : (day + 1) * 24 + 19;
      alt = planIrrigation({ ...base, opts: { forceHours: hours, forceFrom: altStart } });
    } else {
      alt = planIrrigation({ ...base, opts: { forbidBefore: this.t + 24 } });
    }
    const minM = (traj) => Math.min(...traj.map((d) => moisturePct(d, this.sc, this.p)));
    return {
      kind,
      plan,
      alt,
      altStart,
      planMinMoisture: minM(plan.drTraj),
      altMinMoisture: minM(alt.drTraj),
      refillPct: moisturePct(this.sc.raw, this.sc, this.p),
    };
  }
}
