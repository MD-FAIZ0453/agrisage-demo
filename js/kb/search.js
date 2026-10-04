// Farmer Q&A knowledge search over the static index built by tools/build_kb.py.
// BM25 over the record questions, with crop-aware ranking. Only the index
// shards a query needs are fetched, so the 200k-record corpus stays usable on
// a phone. Records are quoted with their source; doses were removed at build
// time. The tokenizer must stay identical to tools/build_kb.py.

const STOP = new Set(
  ('a an the is are was were be been being of to in on at for with and or by from as it its this that these those ' +
    'i me my we our you your he she they them their what which who whom how when where why can could should would will ' +
    'shall do does did done may might must about into over under than then so if not no yes also any some all please ' +
    'tell know want need help give information info regarding asking asked ask farmer farmers query question kindly sir ' +
    'madam hi hello good there here get got use using used make made take way ways best method methods suggest ' +
    'suggestion suggested advice advise advised etc per my am have has had very much more most other such').split(' '),
);
const SYN = {
  chili: 'chilli', chillie: 'chilli', chilly: 'chilli', paddy: 'rice', maize: 'corn',
  eggplant: 'brinjal', aubergine: 'brinjal', bhindi: 'okra', ladyfinger: 'okra',
  peanut: 'groundnut', fertiliser: 'fertilizer', tomatoe: 'tomato', potatoe: 'potato',
  leave: 'leaf', yellowing: 'yellow', wilting: 'wilt', wilted: 'wilt', curling: 'curl', curled: 'curl', drying: 'dry', dried: 'dry', rotting: 'rot', spraying: 'spray', controlling: 'control', growing: 'grow', sowing: 'sow', planting: 'plant', flowering: 'flower', fruiting: 'fruit', dropping: 'drop', infestation: 'infest', infested: 'infest', fertilizing: 'fertilizer',
};

function stem(w) {
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  const out = [];
  for (const raw of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (raw.length < 2 || STOP.has(raw) || /^\d+$/.test(raw)) continue;
    const w = stem(raw);
    out.push(SYN[w] || w);
  }
  return out;
}

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// Tamil script stems and Tamil typed in Latin letters → English search terms.
// Tamil words carry suffixes (தக்காளிக்கு), so Tamil stems match as substrings.
const GLOSSARY = [
  [['தக்காளி', 'thakkali', 'thakali'], 'tomato'],
  [['மிளகாய்', 'milagai', 'milakai'], 'chilli'],
  [['நெல்', 'nel', 'nellu'], 'rice'],
  [['கத்தரி', 'kathiri', 'kathari'], 'brinjal'],
  [['வெண்டை', 'vendai'], 'okra'],
  [['வாழை', 'vazhai', 'vaazhai'], 'banana'],
  [['தென்னை', 'thennai'], 'coconut'],
  [['நிலக்கடலை', 'kadalai'], 'groundnut'],
  [['வெங்காயம்', 'vengayam'], 'onion'],
  [['கரும்பு', 'karumbu'], 'sugarcane'],
  [['மக்காச்சோளம்', 'makkacholam', 'cholam'], 'corn'],
  [['பருத்தி', 'paruthi'], 'cotton'],
  [['மஞ்சள் தூள்', 'manjal thool'], 'turmeric'],
  [['உரம்', 'uram'], 'fertilizer'],
  [['பூச்சி', 'poochi'], 'pest insect'],
  [['நோய்', 'noi', 'noigal'], 'disease'],
  [['காய்ப்புழு'], 'fruit borer'],
  [['புழு', 'puzhu'], 'worm caterpillar'],
  [['வெள்ளை ஈ', 'vellai ee'], 'whitefly'],
  [['அசுவினி', 'asuvini'], 'aphid'],
  [['இலைப்பேன்', 'ilaipen'], 'thrips'],
  [['இலை', 'ilai'], 'leaf'],
  [['வேர்', 'ver'], 'root'],
  [['விதை', 'vidhai', 'vithai'], 'seed'],
  [['ரகம்', 'ragam'], 'variety'],
  [['களை', 'kalai'], 'weed'],
  [['மருந்து', 'marundhu', 'marunthu'], 'spray control'],
  [['அழுகல்', 'azhugal'], 'rot'],
  [['வாடல்', 'vaadal', 'vadal'], 'wilt'],
  [['நடவு', 'nadavu'], 'transplanting'],
  [['அறுவடை', 'aruvadai'], 'harvest'],
  [['மகசூல்', 'magasool'], 'yield'],
  [['இயற்கை', 'iyarkai'], 'organic'],
  [['வேப்ப', 'veppa', 'vepam'], 'neem'],
  [['பூக்', 'poo', 'pookal'], 'flower'],
  [['மண்', 'mann'], 'soil'],
  [['சொட்டு நீர்', 'sottu neer'], 'drip irrigation'],
];

const TAMIL = /[\u0B80-\u0BFF]/;
// Tamil-script stems match anywhere (suffixes attach to them); Latin keys match
// at a word start, and short Latin keys only as whole words ("ver" ≠ "however").
const MATCHERS = GLOSSARY.map(([keys, en]) => [
  keys.map((k) => (TAMIL.test(k) ? (t) => t.includes(k) : ((re) => (t) => re.test(t))(new RegExp(k.length >= 5 ? `\\b${k}` : `\\b${k}\\b`)))),
  en,
]);

export function toSearchText(text) {
  const t = text.toLowerCase();
  const extra = MATCHERS.filter(([tests]) => tests.some((fn) => fn(t))).map(([, en]) => en);
  return extra.length ? `${text} ${extra.join(' ')}` : text;
}

function decodeB64(s) {
  if (typeof atob === 'function') {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}

function decodePostings(str) {
  const out = [];
  let doc = 0;
  for (const part of str.split(',')) {
    const [d, tf] = part.split(':');
    doc += parseInt(d, 36);
    out.push([doc, tf ? Number(tf) : 1]);
  }
  return out;
}

export class KnowledgeBase {
  // getJson(path) returns parsed JSON for a path relative to the index root.
  constructor(getJson) {
    this.getJson = getJson;
    this.shards = new Map();
    this.docShards = new Map();
    this.ready = null;
  }

  load() {
    this.ready ??= (async () => {
      const [manifest, meta] = await Promise.all([this.getJson('manifest.json'), this.getJson('meta.json')]);
      this.m = manifest;
      this.len = decodeB64(meta.len);
      this.code = decodeB64(meta.code);
      this.cropIndex = new Map(manifest.crops.map((c, i) => [c, i + 1]));
    })();
    return this.ready;
  }

  termShard(k) {
    if (!this.shards.has(k)) this.shards.set(k, this.getJson(`t/${String(k).padStart(3, '0')}.json`));
    return this.shards.get(k);
  }

  docShard(k) {
    if (!this.docShards.has(k)) this.docShards.set(k, this.getJson(`d/${String(k).padStart(4, '0')}.json`));
    return this.docShards.get(k);
  }

  // farmCrop: crop to prefer when the question names none (this farm grows tomato).
  // lang 'en': words the index has never seen count against a match, so an
  // off-topic question ("capital of France") finds nothing. For Tamil and
  // Tanglish the untranslated words are expected and ignored.
  async search(query, { k = 3, farmCrop = 'tomato', lang = 'en' } = {}) {
    await this.load();
    const terms = [...new Set(tokenize(toSearchText(query)))];
    if (!terms.length) return { hits: [], terms };
    const N = this.m.docs;
    const avgdl = this.m.avgdl;
    const k1 = 1.2;
    const b = 0.6;
    const lists = await Promise.all(
      terms.map(async (t) => {
        const shard = await this.termShard(fnv1a(t) % this.m.termShards);
        return shard[t] ? decodePostings(shard[t]) : [];
      }),
    );
    const idf = lists.map((l) => Math.log(1 + (N - l.length + 0.5) / (l.length + 0.5)));
    const unseen = Math.log(1 + N);
    const idfTotal = idf.reduce((a, x, i) => a + (lists[i].length ? x : lang === 'en' ? unseen : 0), 0) || 1;
    const scores = new Map();
    const covered = new Map();
    lists.forEach((list, ti) => {
      for (const [doc, tf] of list) {
        const dl = this.len[doc];
        const s = (idf[ti] * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * dl) / avgdl));
        scores.set(doc, (scores.get(doc) || 0) + s);
        covered.set(doc, (covered.get(doc) || 0) + idf[ti]);
      }
    });
    const askedCrops = terms.filter((t) => this.cropIndex.has(t)).map((t) => this.cropIndex.get(t));
    const prefer = askedCrops.length ? askedCrops : [this.cropIndex.get(farmCrop)].filter(Boolean);
    const ranked = [];
    for (const [doc, s] of scores) {
      const crop = this.code[doc] & 63;
      // A question that names a crop only gets records about that crop.
      if (askedCrops.length && !askedCrops.includes(crop)) continue;
      const score = !askedCrops.length && crop && prefer.includes(crop) ? s * 1.15 : s;
      ranked.push({ doc, score, coverage: covered.get(doc) / idfTotal });
    }
    ranked.sort((x, y) => y.score - x.score);
    // A record must cover most of what the question is about to be shown.
    const minCoverage = terms.length === 1 ? 0.99 : 0.55;
    const good = ranked.filter((r) => r.coverage >= minCoverage).slice(0, k * 6);
    // Keep answers that say different things, and prefer a second source.
    const candidates = [];
    for (const r of good) {
      const shard = await this.docShard(Math.floor(r.doc / this.m.docsPerShard));
      const [q, a, s, c, place, month] = shard[r.doc % this.m.docsPerShard];
      candidates.push({ q, a, score: r.score, coverage: r.coverage, crop: c ? this.m.crops[c - 1] : null, place, month, source: this.m.sources[s], words: new Set(tokenize(a)) });
    }
    const similar = (x, y) => {
      let shared = 0;
      for (const w of x.words) if (y.words.has(w)) shared++;
      return shared / Math.max(1, Math.min(x.words.size, y.words.size)) > 0.6;
    };
    const hits = [];
    for (const c of candidates) {
      if (hits.length >= k) break;
      if (hits.some((h) => similar(h, c))) continue;
      if (hits.length && hits.every((h) => h.source.id === c.source.id)) {
        const other = candidates.find((o) => o.source.id !== c.source.id && !hits.includes(o) && !hits.some((h) => similar(h, o)) && o.score > c.score * 0.6);
        if (other) {
          hits.push(other);
          continue;
        }
      }
      hits.push(c);
    }
    return { hits: hits.map(({ words, ...h }) => h), terms };
  }
}
