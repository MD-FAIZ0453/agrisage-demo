import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSeason } from '../js/season.js';

test('AgriSage uses less water than the fixed schedule without adding crop stress', () => {
  const fixed = runSeason('fixed_schedule', 11, 'grid');
  const ours = runSeason('agrisage', 11, 'grid');
  assert.ok(ours.waterM3Ha < fixed.waterM3Ha);
  assert.ok(ours.stressHours <= 24);
  assert.ok(ours.percolationM3Ha < fixed.percolationM3Ha);
});

test('with the solar kit, AgriSage needs no grid power or diesel', () => {
  const ours = runSeason('agrisage', 11, 'solar');
  assert.ok(ours.gridKwhHa < 1);
  assert.ok(ours.dieselLHa < 0.1);
  assert.ok(ours.solarShare > 0.99);
});
