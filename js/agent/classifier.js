// Offline intent classifier: TF-IDF over character n-grams and words,
// nearest-neighbour cosine similarity. Works on Tamil script, English and
// Tamil typed in Latin letters, with no model download.
// The full system swaps this for multilingual sentence embeddings +
// logistic regression behind the same classify() interface.

const TAMIL = /[஀-௿]/;

export function normalize(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP = new Set(
  ('what is the a an of to i me my you your do does did can could would will be am are was were it its this that ' +
    'in on at for with and or please tell show give about who whom which there here so if then than now').split(' '),
);

function contentOnly(text) {
  return normalize(text)
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

function features(text) {
  const norm = normalize(text);
  const feats = new Map();
  const add = (k, w = 1) => feats.set(k, (feats.get(k) || 0) + w);
  const words = norm.split(' ').filter(Boolean);
  for (const w of words) {
    add(`w:${w}`, 1.5);
    const padded = ` ${w} `;
    const chars = Array.from(padded);
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= chars.length; i++) add(`c${n}:${chars.slice(i, i + n).join('')}`);
    }
  }
  for (let i = 0; i + 1 < words.length; i++) add(`b:${words[i]}_${words[i + 1]}`, 1.2);
  return feats;
}

export class IntentClassifier {
  constructor(intents) {
    const docs = [];
    for (const [intent, examples] of Object.entries(intents)) {
      for (const ex of examples) docs.push({ intent, text: ex, f: features(ex) });
    }
    const df = new Map();
    for (const d of docs) for (const k of d.f.keys()) df.set(k, (df.get(k) || 0) + 1);
    const n = docs.length;
    this.idf = new Map([...df].map(([k, c]) => [k, Math.log((1 + n) / (1 + c)) + 1]));
    this.docs = docs.map((d) => ({ ...d, v: this.vectorize(d.f) }));
  }

  vectorize(f) {
    const v = new Map();
    let norm = 0;
    for (const [k, tf] of f) {
      const idf = this.idf.get(k);
      if (!idf) continue;
      const w = (1 + Math.log(tf)) * idf;
      v.set(k, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, w] of v) v.set(k, w / norm);
    return v;
  }

  classify(text) {
    const res = this.rank(text);
    // Out-of-domain check: the content words alone must still match the domain.
    const content = contentOnly(text);
    if (content && content !== normalize(text)) {
      const c = this.rank(content);
      if (c.top.score < 0.3) return { intent: 'other', confidence: c.top.score, ranked: res.ranked };
    }
    return res.top.score < 0.3
      ? { intent: 'other', confidence: res.confidence, ranked: res.ranked }
      : { intent: res.top.intent, confidence: res.confidence, ranked: res.ranked };
  }

  rank(text) {
    const q = this.vectorize(features(text));
    const best = new Map();
    for (const d of this.docs) {
      let s = 0;
      const [small, large] = q.size < d.v.size ? [q, d.v] : [d.v, q];
      for (const [k, w] of small) {
        const o = large.get(k);
        if (o) s += w * o;
      }
      const cur = best.get(d.intent) || [];
      cur.push(s);
      best.set(d.intent, cur);
    }
    // Score = best match + a little weight on the second best, so an intent
    // supported by several examples beats a single lucky overlap.
    const scored = [...best].map(([intent, ss]) => {
      ss.sort((a, b) => b - a);
      return { intent, score: ss[0] + 0.3 * (ss[1] || 0) };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored[0];
    return { top, confidence: Math.max(0, Math.min(1, top.score / 1.3)), ranked: scored.slice(0, 3) };
  }
}

// Reply language: Tamil script or Tamil typed in Latin letters → Tamil.
const TANGLISH = new Set(
  ('thanni tanni thani paichalama paichanum paichanuma pachalama vidanuma vidalama podalama podu pannu pannunga pannalama ' +
    'evlo evvalavu irukku iruku enna yen ethukku eppo eppadi epdi epo aagum aaguthu aagudhu varuma varumaa varuthu venum venuma vendam ' +
    'naalai naalaikku nalaikku innaiku inniku innaikku ippo ippove mazhai mann eerappatham ilai ilaigal surundu surungi manjal chedi vaadi ' +
    'pazham karuppu nirutthu niruthu motor_illa karent labam seiyanum seiva yaaru neenga nee velai seiyum payir poo pootha kaanjirukka ' +
    'pochu irukka nikkuthu varala sollu sari illa').split(' '),
);

export function detectLang(text) {
  if (TAMIL.test(text)) return 'ta';
  const words = normalize(text).split(' ');
  const hits = words.filter((w) => TANGLISH.has(w)).length;
  return hits >= 1 && hits / words.length >= 0.2 ? 'ta' : 'en';
}
