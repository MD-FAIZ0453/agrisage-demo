import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Farm } from '../js/farm.js';

// The three planning cases named in docs/PROMPTS.md Phase 4.

test('sunny day: pumping lands in the solar window, fully solar-powered', () => {
  const f = new Farm('hot_dry');
  const { plan, action } = f.decision;
  assert.equal(action, 'irrigate_later');
  assert.ok(plan.totalHours > 0);
  for (const b of plan.blocks) {
    const startClock = b.start % 24;
    const endClock = b.end % 24;
    assert.ok(startClock >= 8 && endClock <= 16, `run ${startClock}–${endClock}`);
  }
  assert.ok(plan.solarShare > 0.95);
  assert.equal(plan.energy.grid + plan.energy.diesel, 0);
  assert.equal(plan.stressHours, 0);
});

test('rain forecast: irrigation is skipped', () => {
  const f = new Farm('rain_coming');
  assert.equal(f.decision.action, 'skip_rain');
  assert.equal(f.decision.plan.totalHours, 0);
  assert.ok(f.decision.plan.rain24 > 10);
});

test('cloudy with low battery: no diesel, irrigation shifted to midday', () => {
  const f = new Farm('cloudy_low_battery');
  const { plan } = f.decision;
  assert.ok(plan.totalHours > 0);
  assert.equal(plan.energy.diesel, 0);
  const b = plan.blocks[0];
  assert.ok(b.start % 24 >= 10 && b.end % 24 <= 15);
  assert.equal(plan.stressHours, 0);
});

test('moist soil: no irrigation needed', () => {
  const f = new Farm('moist_ok');
  assert.equal(f.decision.action, 'no_need');
  assert.ok(f.nextIrrigationDue() > f.t);
});

test('what-if: waiting a day causes stress the plan avoids', () => {
  const f = new Farm('hot_dry');
  const w = f.whatIf('wait');
  assert.equal(w.plan.stressHours, 0);
  assert.ok(w.alt.stressHours > 10);
  const now = f.whatIf('now');
  assert.ok(now.alt.solarShare < now.plan.solarShare);
});
