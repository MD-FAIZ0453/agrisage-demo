"""Build the chatbot's farmer Q&A knowledge index from three public datasets.

Inputs (downloaded once into data/raw/, which is gitignored):
  data/raw/agriculture-qa.csv                 talhakk/agriculture-qa (Apache-2.0)
  data/raw/farmerchat-queries-large.parquet   DigiGreen/farmerchat-queries-large (CC-BY-4.0)
  data/raw/crop/*_en.json                     AI4Agr/CROP-dataset, English multi-turn (CC-BY-NC-4.0)

Output (published with the site): data/kb/
  manifest.json   sources, crop list, corpus stats
  meta.json       per-document length and crop/source codes (base64)
  t/NNN.json      inverted index shards: term -> delta-encoded postings
  d/NNNN.json     document shards: [question, answer, source, crop, place, month]

Changes made to the data (required attribution for CC-BY): India rows only for
FarmerChat; greetings, price, contact and weather questions removed; phone
numbers, e-mail addresses and URLs removed; answers trimmed; chemical and
fertiliser doses replaced with a pointer to the agriculture officer; exact
duplicate questions removed.

Run:  uv run --no-project --with pyarrow python tools/build_kb.py
"""

import base64
import csv
import glob
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "kb")
N_TERM_SHARDS = 512
DOCS_PER_SHARD = 400
MAX_ANSWER = 520

# ---- Tokenizer (mirrored exactly in js/kb/search.js) -------------------------
STOP = set(
    """a an the is are was were be been being of to in on at for with and or by from as it its this that these those
    i me my we our you your he she they them their what which who whom how when where why can could should would will
    shall do does did done may might must about into over under than then so if not no yes also any some all please
    tell know want need help give information info regarding asking asked ask farmer farmers query question kindly sir
    madam hi hello good there here get got use using used make made take way ways best method methods suggest
    suggestion suggested advice advise advised etc per my am have has had very much more most other such""".split()
)
SYN = {
    "chili": "chilli", "chillie": "chilli", "chilly": "chilli", "paddy": "rice", "maize": "corn",
    "eggplant": "brinjal", "aubergine": "brinjal", "bhindi": "okra", "ladyfinger": "okra",
    "peanut": "groundnut", "fertiliser": "fertilizer", "tomatoe": "tomato", "potatoe": "potato",
    "leave": "leaf", "yellowing": "yellow", "wilting": "wilt", "wilted": "wilt", "curling": "curl", "curled": "curl", "drying": "dry", "dried": "dry", "rotting": "rot", "spraying": "spray", "controlling": "control", "growing": "grow", "sowing": "sow", "planting": "plant", "flowering": "flower", "fruiting": "fruit", "dropping": "drop", "infestation": "infest", "infested": "infest", "fertilizing": "fertilizer",
}


def stem(w):
    if len(w) > 4 and w.endswith("ies"):
        return w[:-3] + "y"
    if len(w) > 3 and w.endswith("s") and not w.endswith(("ss", "us", "is")):
        return w[:-1]
    return w


def tokenize(text):
    out = []
    for w in re.findall(r"[a-z0-9]+", text.lower()):
        if len(w) < 2 or w in STOP or w.isdigit():
            continue
        w = stem(w)
        out.append(SYN.get(w, w))
    return out


def fnv1a(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def b36(n):
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    if n == 0:
        return "0"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = digits[r] + s
    return s


# ---- Cleaning ----------------------------------------------------------------
UNIT = r"(?:ml|millilit\w*|l|lt|ltr|lit|litre\w*|liter\w*|g|gm|gms|gram\w*|kg|kgs|kilo\w*|tsf|tsp|teaspoon\w*|tablespoon\w*|cc|ppm|quintal\w*|q)"
PER = r"(?:l|lt|ltr|lit\w*|liter\w*|litre\w*|acre\w*|ha|hectare\w*|bigha\w*|kanal\w*|plant\w*|tree\w*|pump\w*|tank\w*|kg\s+seed\w*|kg|cent\w*|sq\.?\s*m\w*|m2|water)"
DOSE = re.compile(
    r"(?:@\s*)?\b\d+(?:\.\d+)?(?:\s*(?:-|–|to)\s*\d+(?:\.\d+)?)?\s*" + UNIT + r"\b"
    r"(?:\s*(?:/|per|in|of|for)\s*(?:\d+(?:\.\d+)?\s*)?" + PER + r"\b)?"
    r"|(?:@\s*)?\b\d+(?:\.\d+)?\s*%(?!\s*(?:wp|ec|sc|wg|sl|df|gr|cs|ew|od|wdg|ww|ds|fs|zc|g)\b)",
    re.I,
)
DOSE_TAG = "[dose: ask your agriculture officer or KVK]"
PHONE = re.compile(r"\+?\d[\d\s().-]{7,}\d")


def strip_phones(text):
    # Only runs with 10+ digits are phone numbers; keeps "60-90-120 days".
    return PHONE.sub(lambda m: "" if sum(ch.isdigit() for ch in m.group()) >= 10 else m.group(), text)
EMAIL = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")
URL = re.compile(r"\(?\bhttps?://\S+|\bwww\.\S+|\b[\w-]+\.(?:gov|nic|org|com|in)(?:\.in)?\b(?:/\S*)?\)?", re.I)
SKIP_Q = re.compile(
    r"\b(price|prices|rate|rates|mandi|market|cost|contact|phone|mobile|number|helpline|address|call|weather|"
    r"forecast|rain today|temperature today|loan|who are you|your name|thank|thanks|okay|ok)\b",
    re.I,
)
GREETING = re.compile(r"^\s*(hi|hello|dear|greetings|namaste|vanakkam)\b[^\n.!]*[,.!:]?\s*", re.I)


GENERIC = re.compile(
    r"^\W*(?:he was |farmer was |we |i )?(?:explained|told|informed|given|provided|guided|discussed|suggested|advised|replied)\b"
    r"[^.]{0,60}\b(?:in detail|details|detail|information|as per (?:the )?recomm[ae]nd\w*|accordingly|properly)\W*$",
    re.I,
)


def informative(answer):
    # Drop records whose answer says nothing ("explained him in details").
    return not GENERIC.search(answer) and len(tokenize(answer)) >= 4


def mask_doses(text):
    masked, n = DOSE.subn(DOSE_TAG, text)
    masked = re.sub(r"(\[dose: ask your agriculture officer or KVK\][\s,;]*){2,}", DOSE_TAG + " ", masked)
    return masked, n > 0


OTHER_INDIC = re.compile(r"[\u0900-\u0B7F\u0C00-\u0DFF]")  # Devanagari..Odia, Telugu..Sinhala (Tamil kept)
EMOJI = re.compile(r"[\U0001F000-\U0001FAFF\u2600-\u27BF\uFE0F]")


def readable(text):
    # FarmerChat says English only, but some answers are Hindi or Telugu.
    # Keep English and Tamil; drop text where other Indic scripts dominate.
    letters = sum(ch.isalpha() for ch in text) or 1
    return len(OTHER_INDIC.findall(text)) / letters < 0.15


def tidy(text):
    text = text.replace("\r", "")
    text = GREETING.sub("", text)
    text = EMOJI.sub("", text)
    # Personal names in advisory logs ("suggested mr borah to spray...").
    text = re.sub(r"\b(?:mr|mrs|ms|shri|sri|smt|sh)\.?\s+[a-z]+(?:\s+[a-z]+)?(?=\s+(?:to|that|for|about|regarding)\b)", "the farmer", text, flags=re.I)
    # Redacted names and places: collapse runs, then read as "your area".
    text = re.sub(r"\[REDACTED\](\s*[,;:]?\s*\[REDACTED\])+", "[REDACTED]", text)
    text = re.sub(r"\[REDACTED\]", "your area", text)
    text = re.sub(r"\b(in|at|near|from|around)\s*[,;:]+\s*(?=[,;:?.!]|$)", "", text)
    text = re.sub(r"\b(in|at|near|from|around)\s*(,\s*)+", r"\1 ", text)
    text = strip_phones(text)
    text = EMAIL.sub("", text)
    text = URL.sub("", text)
    text = re.sub(r"[#*`>]+", "", text)
    text = re.sub(r"\n\s*[-•]\s*", "; ", text)
    text = re.sub(r"\n\s*\d+\.\s*", "; ", text)
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"(;\s*){2,}", "; ", text)
    return text.strip(" ;,")


def trim(text, n=MAX_ANSWER):
    if len(text) <= n:
        return text
    cut = text[:n]
    stop = max(cut.rfind(". "), cut.rfind("; "))
    if stop > n * 0.55:
        cut = cut[: stop + 1]
    return cut.rstrip(" ;,") + " …"


def norm_q(q):
    return " ".join(sorted(set(tokenize(q))))


# ---- Crops ---------------------------------------------------------------------
CROPS = [
    "tomato", "chilli", "rice", "brinjal", "okra", "onion", "potato", "banana", "coconut", "groundnut", "cotton",
    "sugarcane", "corn", "wheat", "turmeric", "mango", "cabbage", "cauliflower", "cucumber", "gourd", "pumpkin",
    "bean", "pea", "soybean", "mustard", "millet", "sorghum", "ragi", "tea", "coffee", "pepper", "cardamom",
    "ginger", "garlic", "papaya", "guava", "lemon", "orange", "grape", "pomegranate", "watermelon", "cassava",
    "arecanut", "cashew", "rubber", "sunflower", "sesame", "cowpea", "capsicum", "carrot", "radish", "spinach",
    "coriander", "drumstick", "jackfruit", "avocado", "kale", "sweetpotato",
]
CROP_ID = {c: i + 1 for i, c in enumerate(CROPS)}  # 0 = none / generic


def crop_of(text, asset=None):
    if asset:
        toks = tokenize(asset)
        for t in toks:
            if t in CROP_ID:
                return CROP_ID[t]
    for t in tokenize(text):
        if t in CROP_ID:
            return CROP_ID[t]
    return 0


# ---- Sources -------------------------------------------------------------------
SOURCES = [
    {
        "id": "agriqa", "name": "agriculture-qa", "by": "talhakk (Hugging Face)",
        "url": "https://huggingface.co/datasets/talhakk/agriculture-qa", "license": "Apache-2.0",
        "label": "Farm advisory Q&A record",
    },
    {
        "id": "farmerchat", "name": "FarmerChat Q&A (Large)", "by": "Digital Green",
        "url": "https://huggingface.co/datasets/DigiGreen/farmerchat-queries-large", "license": "CC-BY-4.0",
        "label": "AI-generated answer (FarmerChat)",
    },
    {
        "id": "crop", "name": "CROP dataset", "by": "AI4Agr (Zhang et al., NeurIPS 2024)",
        "url": "https://huggingface.co/datasets/AI4Agr/CROP-dataset", "license": "CC-BY-NC-4.0",
        "label": "Crop-science dialogue (LLM-assisted)",
    },
]


def load_agriqa(stats):
    docs = []
    path = os.path.join(RAW, "agriculture-qa.csv")
    with open(path, encoding="utf-8", errors="replace") as f:
        for r in csv.DictReader(f):
            q, a = (r.get("question") or "").strip(), (r.get("answer") or "").strip()
            stats["agriqa_in"] += 1
            if re.search(r"rainfall\(mm\)|temp\(max/min\)", a, re.I) or len(a) < 8 or len(q) < 10:
                continue
            if re.search(r"pakistan|bangladesh", q + " " + a, re.I):
                continue
            if not (readable(q) and readable(a)):
                continue
            a = tidy(a)
            q = tidy(q)
            if not a or not tokenize(q) or not informative(a):
                stats["agriqa_uninformative"] += not informative(a) if a else 0
                continue
            a, masked = mask_doses(a)
            stats["masked"] += masked
            docs.append({"q": q, "a": trim(a), "s": 0, "c": crop_of(q), "p": "", "m": ""})
    return docs


def load_farmerchat(stats):
    import pyarrow.parquet as pq

    path = os.path.join(RAW, "farmerchat-queries-large.parquet")
    pf = pq.ParquetFile(path)
    cols = ["asset_type", "asset_name", "query", "response", "user_country", "user_geo_level2", "query_year_month"]
    docs = []
    for batch in pf.iter_batches(batch_size=50000, columns=cols):
        d = batch.to_pydict()
        for i in range(len(d["query"])):
            stats["farmerchat_in"] += 1
            if (d["user_country"][i] or "") != "India":
                continue
            stats["farmerchat_india"] += 1
            q = (d["query"][i] or "").strip()
            a = (d["response"][i] or "").strip()
            if len(q) < 12 or len(a) < 40 or SKIP_Q.search(q):
                continue
            if not (readable(q) and readable(a)):
                stats["farmerchat_other_script"] += 1
                continue
            q = tidy(q)
            a = tidy(a)
            if not tokenize(q) or len(a) < 40:
                continue
            a, masked = mask_doses(a)
            stats["masked"] += masked
            asset = d["asset_name"][i] or ""
            docs.append({
                "q": q, "a": trim(a), "s": 1, "c": crop_of(q, asset if asset.lower() != "generic" else None),
                "p": (d["user_geo_level2"][i] or "").strip(), "m": d["query_year_month"][i] or "",
            })
    return docs


def load_crop(stats):
    docs = []
    for path in sorted(glob.glob(os.path.join(RAW, "crop", "*_en.json"))):
        crop = "rice" if os.path.basename(path).startswith("rice") else "corn"
        turns = json.load(open(path, encoding="utf-8"))
        dialogue = []
        for t in turns + [{"history": "[]", "instruction": None}]:
            starts = t.get("history") in ("[]", [], "", None)
            if starts and dialogue:
                stats["crop_in"] += 1
                q = tidy(dialogue[0]["instruction"])
                first = tidy(dialogue[0]["output"])
                last = tidy(dialogue[-1]["output"]) if len(dialogue) > 1 else ""
                a = first if not last else f"{first} … {last}"
                a, masked = mask_doses(a)
                stats["masked"] += masked
                if tokenize(q):
                    docs.append({"q": q, "a": trim(a, MAX_ANSWER + 120), "s": 2, "c": CROP_ID[crop], "p": "", "m": ""})
                dialogue = []
            if t.get("instruction") is not None:
                dialogue.append(t)
    return docs


def main():
    stats = Counter()
    docs = load_agriqa(stats) + load_crop(stats)
    if os.path.exists(os.path.join(RAW, "farmerchat-queries-large.parquet")):
        docs += load_farmerchat(stats)
    else:
        print("FarmerChat parquet missing; building without it", file=sys.stderr)

    seen = set()
    unique = []
    for d in docs:
        key = norm_q(d["q"])
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(d)
    stats["duplicates_removed"] = len(docs) - len(unique)
    # Keep each crop's documents together so a query touches few document shards.
    unique.sort(key=lambda d: (d["c"], d["s"]))

    postings = defaultdict(list)
    lens = bytearray()
    codes = bytearray()
    for i, d in enumerate(unique):
        toks = tokenize(d["q"])
        if d["c"]:
            toks.append(CROPS[d["c"] - 1])
        tf = Counter(toks)
        for term, n in tf.items():
            postings[term].append((i, n))
        lens.append(min(255, max(1, len(toks))))
        codes.append(min(63, d["c"]) | (d["s"] << 6))

    if os.path.exists(OUT):
        shutil.rmtree(OUT)
    os.makedirs(os.path.join(OUT, "t"))
    os.makedirs(os.path.join(OUT, "d"))

    shards = defaultdict(dict)
    for term, plist in postings.items():
        prev = 0
        parts = []
        for doc, n in plist:
            parts.append(b36(doc - prev) + (f":{n}" if n > 1 else ""))
            prev = doc
        shards[fnv1a(term) % N_TERM_SHARDS][term] = ",".join(parts)
    for k in range(N_TERM_SHARDS):
        with open(os.path.join(OUT, "t", f"{k:03d}.json"), "w", encoding="utf-8") as f:
            json.dump(shards.get(k, {}), f, separators=(",", ":"), ensure_ascii=False)

    for start in range(0, len(unique), DOCS_PER_SHARD):
        chunk = [[d["q"], d["a"], d["s"], d["c"], d["p"], d["m"]] for d in unique[start : start + DOCS_PER_SHARD]]
        with open(os.path.join(OUT, "d", f"{start // DOCS_PER_SHARD:04d}.json"), "w", encoding="utf-8") as f:
            json.dump(chunk, f, separators=(",", ":"), ensure_ascii=False)

    per_source = Counter(d["s"] for d in unique)
    sources = [dict(src, rows=per_source.get(i, 0)) for i, src in enumerate(SOURCES)]
    manifest = {
        "version": 1,
        "docs": len(unique),
        "avgdl": round(sum(lens) / max(1, len(lens)), 3),
        "termShards": N_TERM_SHARDS,
        "docsPerShard": DOCS_PER_SHARD,
        "crops": CROPS,
        "sources": sources,
        "doseTag": DOSE_TAG,
        "stats": dict(stats),
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"len": base64.b64encode(bytes(lens)).decode(), "code": base64.b64encode(bytes(codes)).decode()}, f)

    total = sum(os.path.getsize(os.path.join(dp, fn)) for dp, _, fns in os.walk(OUT) for fn in fns)
    print(json.dumps({"docs": len(unique), "per_source": {SOURCES[k]["id"]: v for k, v in per_source.items()},
                      "terms": len(postings), "bytes": total, **stats}, indent=1))


if __name__ == "__main__":
    main()
