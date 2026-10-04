import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Farm, FARM_ID } from '../js/farm.js';
import { P } from '../js/params.js';

test('pump never starts without farmer confirmation', () => {
  const f = new Farm('hot_dry');
  f.requestPump('on', { minutes: 30 });
  f.advance(5);
  assert.equal(f.pump.on, false);
  f.confirmPending();
  assert.equal(f.pump.on, true);
});

test('dry-run cutoff stops the pump within the configured delay', () => {
  const f = new Farm('hot_dry');
  f.setDryWell(true);
  f.requestPump('on', { minutes: 60 });
  f.confirmPending();
  f.advance(P.dry_delay_min + 1);
  assert.equal(f.pump.on, false);
  assert.equal(f.alerts.at(-1).type, 'dry_run');
});

test('a run stops at its target and never exceeds max runtime', () => {
  const f = new Farm('hot_dry');
  let stop = null;
  f.on((type, d) => {
    if (type === 'pump' && !d.on) stop = d;
  });
  f.requestPump('on', { minutes: 40 });
  f.confirmPending();
  f.advance(60);
  assert.equal(f.pump.on, false);
  assert.equal(stop.reason, 'target');
  assert.ok(stop.ranMin <= 42);
  const capped = f.requestPump('on', { minutes: 999 });
  assert.ok(capped.maxMinutes <= P.max_run_min);
  assert.ok(capped.runMinutes <= capped.maxMinutes);
});

test('an approved plan starts and stops the pump on its own, on solar', () => {
  const f = new Farm('hot_dry');
  const events = [];
  f.on((type, d) => type === 'pump' && events.push({ t: f.t, ...d }));
  const start = f.decision.plan.blocks[0].start;
  f.approvePlan();
  f.advance(12 * 60);
  const on = events.find((e) => e.on);
  const off = events.find((e) => !e.on);
  assert.equal(on.source, 'plan');
  assert.ok(Math.abs(on.t - start) < 1.01, 'starts within the hour the plan named');
  assert.equal(off.reason, 'target');
  assert.equal(f.pump.on, false);
  assert.ok(f.today.waterM3 >= 20);
  assert.ok(f.today.pv / f.today.pumpKwh > 0.95);
});

test('MQTT messages follow the contract in docs/ARCHITECTURE.md', () => {
  const f = new Farm('hot_dry');
  f.requestPump('on', { minutes: 20 });
  f.confirmPending();
  f.advance(25);
  const keys = {
    [`farm/${FARM_ID}/sensor/soil`]: ['ts', 'moisture_pct', 'soil_temp_c'],
    [`farm/${FARM_ID}/sensor/energy`]: ['ts', 'pv_kw', 'battery_soc', 'pump_kw'],
    [`farm/${FARM_ID}/sensor/flow`]: ['ts', 'flow_lpm', 'total_l'],
    [`farm/${FARM_ID}/cmd/pump`]: ['action', 'max_minutes', 'decision_id'],
  };
  const seen = new Set();
  for (const m of f.mqttLog) {
    assert.ok(keys[m.topic], `unexpected topic ${m.topic}`);
    assert.deepEqual(Object.keys(m.payload).sort(), [...keys[m.topic]].sort());
    seen.add(m.topic);
  }
  assert.equal(seen.size, 4);
  const cmds = f.mqttLog.filter((m) => m.topic.endsWith('/cmd/pump')).map((m) => m.payload.action);
  assert.deepEqual(cmds, ['on', 'off']);
});
