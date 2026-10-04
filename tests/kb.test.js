import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { KnowledgeBase, tokenize, toSearchText } from '../js/kb/search.js';
import { Agent } from '../js/agent/agent.js';
import { Farm } from '../js/farm.js';

const root = fileURLToPath(new URL('../data/kb/', import.meta.url));
const kb = new KnowledgeBase(async (p) => JSON.parse(await readFile(root + p, 'utf8')));
const DOSE = /\b\d+(\.\d+)?\s*(ml|gm?|kg)\s*(\/|per)\s*(l|lit|litre|liter|acre|ha)\b/i;

test('finds on-crop records for practical questions', async () => {
  for (const [q, crop] of [['how to control fruit borer in tomato', 'tomato'], ['whitefly control in chilli', 'chilli'], ['seed rate for paddy', 'rice'], ['fall armyworm in maize', 'corn']]) {
    const { hits } = await kb.search(q, { k: 2 });
    assert.ok(hits.length > 0, q);
    for (const h of hits) assert.equal(h.crop, crop, `${q} → ${h.q}`);
  }
});

test('doses are removed from quoted records', async () => {
  for (const q of ['how to control fruit borer in tomato', 'fertilizer requirement of chilli', 'seed rate for paddy']) {
    const { hits } = await kb.search(q, { k: 3 });
    for (const h of hits) assert.ok(!DOSE.test(h.a), `dose left in: ${h.a}`);
  }
});

test('off-topic questions find nothing', async () => {
  for (const q of ['what is the capital of france', 'who won the cricket match yesterday']) {
    const { hits } = await kb.search(q, { k: 2, lang: 'en' });
    assert.equal(hits.length, 0, q);
  }
});

test('Tamil and Tanglish questions are translated for search', () => {
  assert.deepEqual(tokenize(toSearchText('milagaikku enna uram')).slice(-2), ['chilli', 'fertilizer']);
  assert.ok(tokenize(toSearchText('தக்காளியில் காய்ப்புழு')).includes('tomato'));
  assert.ok(!tokenize(toSearchText('however the leaves')).includes('root'));
});

const newAgent = () => new Agent(new Farm('hot_dry'), { getImpact: async () => null, knowledge: kb });

test('the chatbot answers general farming questions from the records, with sources', async () => {
  const r = await newAgent().respond('whitefly control in chilli');
  assert.equal(r.intent, 'farm_knowledge');
  assert.ok(r.records.length > 0);
  assert.ok(r.tools.includes('search_kb'));
  assert.ok(r.sources.some((x) => x.startsWith('ds')));
});

test('questions about other crops leave the farm twin for the records', async () => {
  const r = await newAgent().respond('நெல்லுக்கு விதை அளவு எவ்வளவு');
  assert.equal(r.intent, 'farm_knowledge');
  assert.equal(r.lang, 'ta');
  assert.ok(r.records.length > 0);
  const own = await newAgent().respond('Should I irrigate today?');
  assert.equal(own.intent, 'should_irrigate');
});
