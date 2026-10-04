import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IntentClassifier, detectLang } from '../js/agent/classifier.js';
import { INTENTS, TEST_SET, OOD_SET } from '../js/agent/intents.js';
import { Agent } from '../js/agent/agent.js';
import { Farm } from '../js/farm.js';
import { runComparison } from '../js/season.js';

const clf = new IntentClassifier(INTENTS);

test('intent accuracy on held-out Tamil, English and Tanglish questions is at least 90%', () => {
  const misses = TEST_SET.filter(([q, want]) => clf.classify(q).intent !== want);
  const acc = 1 - misses.length / TEST_SET.length;
  console.log(`intent accuracy ${(acc * 100).toFixed(1)}% (${TEST_SET.length - misses.length}/${TEST_SET.length}); misses: ${misses.map(([q]) => q).join(' | ') || 'none'}`);
  assert.ok(acc >= 0.9);
});

test('off-topic questions fall back to "other" for most cases', () => {
  const other = OOD_SET.filter((q) => clf.classify(q).intent === 'other').length;
  assert.ok(other >= OOD_SET.length - 1);
});

test('reply language follows the question', () => {
  assert.equal(detectLang('Should I irrigate today?'), 'en');
  assert.equal(detectLang('இன்று தண்ணீர் பாய்ச்ச வேண்டுமா?'), 'ta');
  assert.equal(detectLang('innaiku thanni paichalama'), 'ta');
});

const newAgent = (scenario = 'hot_dry') => {
  const farm = new Farm(scenario);
  let cache;
  return { farm, agent: new Agent(farm, { getImpact: async () => (cache ??= runComparison({ seeds: [11] })) }) };
};

test('irrigation answers take their numbers from the optimizer, not the assistant', async () => {
  const { agent, farm } = newAgent();
  const r = await agent.respond('Should I irrigate today?');
  assert.equal(r.intent, 'should_irrigate');
  assert.ok(r.tools.includes('run_optimizer'));
  const b = farm.decision.plan.blocks[0];
  const hh = (t) => String(Math.floor(t % 24)).padStart(2, '0');
  assert.ok(r.text.includes(`${hh(b.start)}:`), 'answer quotes the optimizer start time');
  assert.ok(r.sources.length > 0);
});

test('Tamil question gets a Tamil answer', async () => {
  const { agent } = newAgent();
  const r = await agent.respond('இன்று தண்ணீர் பாய்ச்ச வேண்டுமா?');
  assert.equal(r.lang, 'ta');
  assert.match(r.text, /[஀-௿]/);
});

test('pump control always asks for confirmation first', async () => {
  const { agent, farm } = newAgent();
  const r = await agent.respond('turn on the pump');
  assert.equal(farm.pump.on, false);
  assert.ok(r.actions.some((a) => a.id === 'confirm'));
  agent.act('confirm');
  assert.equal(farm.pump.on, true);
});

test('disease answers are "possible" with a confidence, never certain', async () => {
  const { agent } = newAgent();
  for (const q of ['Leaves have brown spots with rings', 'இலைகள் கீழ்நோக்கிச் சுருள்கின்றன']) {
    const r = await agent.respond(q);
    assert.equal(r.intent, 'disease_help');
    assert.match(r.text, /Possible|சாத்தியமான/);
    assert.match(r.text, /confidence|நம்பிக்கை/);
  }
});

test('rain scenario answer says skip', async () => {
  const { agent } = newAgent('rain_coming');
  const r = await agent.respond('Should I irrigate today?');
  assert.match(r.text, /skip/i);
});
