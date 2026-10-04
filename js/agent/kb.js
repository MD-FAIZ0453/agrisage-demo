// Small crop knowledge base with sources. Disease answers are always
// "possible" with a confidence level, never a diagnosis (CLAUDE.md rule 6).
// Symptoms, favourable conditions and management are summarised from the
// TNAU Agritech Portal tomato disease pages (checked October 2026). Chemical
// products and doses are deliberately left to the agriculture officer / KVK.

const TNAU = 'https://agritech.tnau.ac.in/crop_protection/';

export const SOURCES = {
  fao56: { label: 'FAO-56 (Allen et al., 1998)', url: 'https://www.fao.org/4/x0490e/x0490e00.htm' },
  fao66: { label: 'FAO-66 Crop yield response to water', url: 'https://www.fao.org/4/i2800e/i2800e00.htm' },
  tnauIndex: { label: 'TNAU Agritech: Tomato diseases', url: `${TNAU}crop_prot_crop%20diseases_veg_tomato.html` },
  tnauEarly: { label: 'TNAU Agritech: Early blight', url: `${TNAU}tomato_diseases_2.html` },
  tnauFus: { label: 'TNAU Agritech: Fusarium wilt', url: `${TNAU}tomato_diseases_3.html` },
  tnauBw: { label: 'TNAU Agritech: Bacterial wilt', url: `${TNAU}tomato_diseases_5.html` },
  tnauCurl: { label: 'TNAU Agritech: Leaf curl', url: `${TNAU}tomato_diseases_6.html` },
  tnauLate: { label: 'TNAU Agritech: Late blight', url: `${TNAU}tomato_diseases_8.html` },
  ucipmBer: { label: 'UC IPM: Blossom-end rot', url: 'https://ipm.ucanr.edu/agriculture/tomato/blossom-end-rot/' },
  dsAgriqa: { label: 'agriculture-qa dataset (Apache-2.0)', url: 'https://huggingface.co/datasets/talhakk/agriculture-qa' },
  dsFarmerchat: { label: 'FarmerChat Q&A, Digital Green (CC-BY-4.0)', url: 'https://huggingface.co/datasets/DigiGreen/farmerchat-queries-large' },
  dsCrop: { label: 'CROP dataset, AI4Agr (CC-BY-NC-4.0)', url: 'https://huggingface.co/datasets/AI4Agr/CROP-dataset' },
  twin: { label: 'AgriSage digital twin (live)', url: null },
  optimizer: { label: 'AgriSage optimizer (24 h plan)', url: null },
  season: { label: 'AgriSage season simulation', url: null },
};

// keywords: groups of English, Tamil-script and Tanglish fragments. Each
// matched group counts once.
export const DISEASES = [
  {
    id: 'early_blight',
    name: { en: 'Early blight', ta: 'முன் கருகல் நோய் (Early blight)' },
    keywords: [
      ['ring', 'concentric', 'target', 'bull', 'circle', 'வளைய', 'வட்ட'],
      ['brown spot', 'dark spot', 'spots', 'pulli', 'புள்ளி'],
      ['yellow margin', 'yellow edge', 'yellow halo', 'மஞ்சள் விளிம்பு'],
      ['burnt', 'blight', 'கருகல்', 'karugal'],
    ],
    fits: (c) => c.tmean >= 24 && c.tmean <= 29 && (c.rh >= 75 || c.rain24 > 1),
    favourable: { en: 'warm, humid (24–29 °C), rainy weather', ta: 'சூடான, ஈரப்பதமான (24–29 °C), மழைக் காலநிலை' },
    symptoms: {
      en: 'brown spots with bull’s-eye rings and a yellow margin; brown rings on fruit near the stem',
      ta: 'மஞ்சள் விளிம்புடன் இலக்கு வடிவ வளையங்கள் கொண்ட பழுப்புப் புள்ளிகள்; பழத்தில் காம்பு அருகே பழுப்பு வளையங்கள்',
    },
    manage: {
      en: 'Remove and destroy crop debris and badly affected leaves, rotate crops, and keep leaves dry (drip helps). TNAU lists Trichoderma seed treatment and approved fungicide sprays; confirm the product and dose with your agriculture officer or KVK.',
      ta: 'பயிர் கழிவுகளையும் அதிகம் பாதித்த இலைகளையும் அகற்றி அழிக்கவும்; பயிர் சுழற்சி செய்யவும்; இலைகளை நனைக்காமல் வைத்திருக்கவும் (சொட்டு நீர் உதவும்). TNAU டிரைக்கோடெர்மா விதை நேர்த்தியையும் அங்கீகரிக்கப்பட்ட பூஞ்சைக்கொல்லி தெளிப்பையும் பரிந்துரைக்கிறது; மருந்தையும் அளவையும் வேளாண் அலுவலர் அல்லது KVK-யிடம் உறுதி செய்யவும்.',
    },
    source: 'tnauEarly',
  },
  {
    id: 'late_blight',
    name: { en: 'Late blight', ta: 'பின் கருகல் நோய் (Late blight)' },
    keywords: [
      ['white fungus', 'white growth', 'white mould', 'white mold', 'white powder', 'வெள்ளை பூஞ்சை', 'பூஞ்சை', 'vellai'],
      ['water soaked', 'water-soaked', 'wet patches', 'black lesion', 'நீர் கோர்த்த'],
      ['spreads fast', 'spreading fast', 'rapidly', 'வேகமாக'],
      ['soft rot', 'fruit rotting', 'மென்மையான அழுகல்'],
    ],
    fits: (c) => c.tmin <= 20 && (c.rh >= 85 || c.rain24 > 1),
    favourable: { en: 'cool nights, warm days and long wet spells from rain or fog', ta: 'குளிர்ந்த இரவுகள், வெப்பமான பகல், மழை அல்லது பனிமூட்டத்தால் நீண்ட ஈரமான காலம்' },
    symptoms: {
      en: 'water-soaked black lesions on leaves and stems that spread fast, white fungal growth on leaves, dark brown soft rot on fruit',
      ta: 'இலைகளிலும் தண்டுகளிலும் வேகமாகப் பரவும் நீர் கோர்த்த கருப்புப் புண்கள், இலைகளில் வெள்ளைப் பூஞ்சை, பழத்தில் கரும்பழுப்பு மென்மையான அழுகல்',
    },
    manage: {
      en: 'Act the same day: remove infected parts, keep drainage good, avoid wetting leaves and rotate crops. TNAU lists soil-applied Trichoderma and fungicide sprays; confirm with your agriculture officer or KVK.',
      ta: 'அதே நாளில் செயல்படவும்: பாதித்த பகுதிகளை அகற்றவும், நல்ல வடிகால் அமைக்கவும், இலைகளை நனைக்க வேண்டாம், பயிர் சுழற்சி செய்யவும். TNAU மண்ணில் டிரைக்கோடெர்மா இடுதலையும் பூஞ்சைக்கொல்லி தெளிப்பையும் பரிந்துரைக்கிறது; வேளாண் அலுவலர் அல்லது KVK-யிடம் உறுதி செய்யவும்.',
    },
    source: 'tnauLate',
  },
  {
    id: 'leaf_curl',
    name: { en: 'Tomato leaf curl virus', ta: 'இலைச் சுருள் நோய் (Leaf curl virus)' },
    keywords: [
      ['curl', 'curling', 'curled', 'rolling', 'surundu', 'surungi', 'சுருண்ட', 'சுருள்', 'சுருங்'],
      ['downward', 'down', 'கீழ்நோக்கி', 'keezh'],
      ['crinkle', 'crinkled', 'puckered', 'சுருக்க'],
      ['stunted', 'not growing', 'bushy', 'வளர்ச்சி குன்ற', 'வளரவில்லை'],
      ['whitefly', 'white fly', 'வெள்ளை ஈ', 'vellai ee'],
      ['leathery', 'brittle', 'தோல் போல'],
    ],
    fits: () => false,
    favourable: null,
    symptoms: {
      en: 'severe stunting, leaves roll downward and crinkle, older leaves turn leathery and brittle, bushy growth; spread by whitefly',
      ta: 'செடி கடுமையாக வளர்ச்சி குன்றும், இலைகள் கீழ்நோக்கிச் சுருண்டு சுருக்கமடையும், பழைய இலைகள் தோல் போல் கடினமாகும், புதர் போன்ற வளர்ச்சி; வெள்ளை ஈ மூலம் பரவும்',
    },
    manage: {
      en: 'Pull out infected plants early, put up yellow sticky traps for whitefly (TNAU: 5 per acre), remove the weed host Abutilon (thuthi), and next season raise the nursery under insect-proof net with a sorghum or maize barrier crop. Ask your agriculture officer before spraying.',
      ta: 'பாதித்த செடிகளை ஆரம்பத்திலேயே பிடுங்கவும்; வெள்ளை ஈக்கு மஞ்சள் ஒட்டும் பொறிகள் வைக்கவும் (TNAU: ஏக்கருக்கு 5); துத்தி களைச் செடியை அகற்றவும்; அடுத்த பருவத்தில் பூச்சி புகா வலைக்குள் நாற்றங்கால் அமைத்து சோளம் அல்லது மக்காச்சோளம் தடுப்புப் பயிராக வளர்க்கவும். மருந்து தெளிக்கும் முன் வேளாண் அலுவலரை அணுகவும்.',
    },
    source: 'tnauCurl',
  },
  {
    id: 'bacterial_wilt',
    name: { en: 'Bacterial wilt', ta: 'பாக்டீரியா வாடல் நோய் (Bacterial wilt)' },
    keywords: [
      ['suddenly', 'sudden', 'overnight', 'rapid', 'thideer', 'திடீர'],
      ['wilt', 'wilting', 'wilted', 'vaadi', 'வாடி', 'வாடு'],
      ['whole plant', 'entire plant', 'complete', 'முழு செடி', 'செடிகள்'],
      ['ooze', 'milky', 'slime', 'கசிவு', 'பால் போன்ற'],
    ],
    fits: (c) => c.moisturePct >= c.fcPct - 1.5,
    favourable: { en: 'high soil moisture', ta: 'அதிக மண் ஈரப்பதம்' },
    symptoms: {
      en: 'rapid, complete wilting of the plant; lower leaves may drop first; white bacterial ooze from cut stem ends',
      ta: 'செடி வேகமாக முழுமையாக வாடும்; கீழ் இலைகள் முதலில் உதிரலாம்; வெட்டிய தண்டின் முனையில் வெள்ளை பாக்டீரியா கசிவு',
    },
    manage: {
      en: 'Remove wilted plants with their roots, use disease-free seedlings, rotate crops and do not over-irrigate (TNAU lists restricting irrigation; AgriSage keeps moisture below field capacity). Ask your agriculture officer about soil drenching.',
      ta: 'வாடிய செடிகளை வேருடன் அகற்றவும்; நோயற்ற நாற்றுகளைப் பயன்படுத்தவும்; பயிர் சுழற்சி செய்யவும்; அதிக நீர் பாய்ச்ச வேண்டாம் (TNAU நீர்ப்பாசனத்தைக் குறைக்கப் பரிந்துரைக்கிறது; AgriSage மண்ணை அளவுக்கு மீறி நனைக்காது). மண் நனைப்பு மருந்துக்கு வேளாண் அலுவலரை அணுகவும்.',
    },
    source: 'tnauBw',
  },
  {
    id: 'fusarium_wilt',
    name: { en: 'Fusarium wilt', ta: 'ஃபியூசேரியம் வாடல் நோய் (Fusarium wilt)' },
    keywords: [
      ['lower leaves', 'older leaves', 'bottom leaves', 'கீழ் இலை'],
      ['yellow', 'manjal', 'மஞ்சள்'],
      ['wilt', 'wilting', 'droop', 'vaadi', 'வாடு', 'வாடி'],
      ['brown inside', 'inside the stem', 'vascular', 'தண்டின் உள்ளே'],
    ],
    fits: (c) => c.tmax >= 33 && c.moisturePct <= c.refillPct + 1,
    favourable: { en: 'dry weather, hot soil and low soil moisture', ta: 'வறண்ட காலநிலை, அதிக மண் வெப்பம், குறைந்த மண் ஈரப்பதம்' },
    symptoms: {
      en: 'veins clear and lower leaves turn yellow, younger leaves die in turn, leaves droop and wilt, brown discolouration inside the stem',
      ta: 'நரம்புகள் வெளிறி கீழ் இலைகள் மஞ்சளாகும், இளம் இலைகள் வரிசையாகக் காயும், இலைகள் தொங்கி வாடும், தண்டின் உள்ளே பழுப்பு நிறம்',
    },
    manage: {
      en: 'Remove infected plants, rotate crops, solarise the soil before the next crop and use biocontrol (Trichoderma, Bacillus subtilis) as TNAU recommends. Do not let the soil dry out; steady moisture helps.',
      ta: 'பாதித்த செடிகளை அகற்றவும்; பயிர் சுழற்சி செய்யவும்; அடுத்த பயிருக்கு முன் மண்ணை சூரிய வெப்பத்தால் நேர்த்தி செய்யவும்; TNAU பரிந்துரைப்படி டிரைக்கோடெர்மா, பேசில்லஸ் சப்டிலிஸ் போன்ற உயிரியல் கட்டுப்பாடுகளைப் பயன்படுத்தவும். மண் காய விட வேண்டாம்; சீரான ஈரப்பதம் உதவும்.',
    },
    source: 'tnauFus',
  },
  {
    id: 'blossom_end_rot',
    name: { en: 'Blossom-end rot', ta: 'பூ முனை அழுகல் (Blossom-end rot)' },
    keywords: [
      ['bottom of the fruit', 'fruit bottom', 'end of the fruit', 'blossom end', 'பழத்தின் அடி', 'adiyila', 'பழத்தின் கீழ்'],
      ['black', 'dark', 'karuppu', 'கருப்பு'],
      ['rot', 'rotting', 'sunken', 'leathery', 'azhugal', 'அழுகல்'],
      ['fruit', 'pazham', 'பழம்', 'பழத்'],
    ],
    fits: () => false,
    favourable: { en: 'uneven watering', ta: 'சீரற்ற நீர்ப்பாசனம்' },
    symptoms: {
      en: 'a dark, sunken, leathery patch at the bottom (blossom end) of the fruit',
      ta: 'பழத்தின் அடிப்பகுதியில் (பூ முனையில்) கருமையான, குழிந்த, தோல் போன்ற திட்டு',
    },
    manage: {
      en: 'This is a calcium disorder linked to uneven watering, not an infection. Keep soil moisture steady (AgriSage’s schedule is designed for this), avoid stress during fruiting, and get a soil test for calcium.',
      ta: 'இது நோய்க்கிருமி அல்ல; சீரற்ற நீர்ப்பாசனத்தால் ஏற்படும் கால்சியம் குறைபாடு. மண் ஈரப்பதத்தை சீராக வைத்திருக்கவும் (AgriSage அட்டவணை இதற்காகவே), காய்க்கும் பருவத்தில் நீர் அழுத்தம் வேண்டாம், கால்சியத்துக்கு மண் பரிசோதனை செய்யவும்.',
    },
    source: 'ucipmBer',
  },
];

// Rank diseases by how many symptom groups the question matches.
export function matchDisease(text) {
  const q = text.toLowerCase();
  const scored = DISEASES.map((d) => {
    const hits = d.keywords.filter((group) => group.some((k) => q.includes(k.toLowerCase())));
    return { d, score: hits.length };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function confidenceLevel(score, weatherFits) {
  const s = score + (weatherFits ? 0.5 : 0);
  if (s >= 2.5) return 'high';
  if (s >= 1.5) return 'medium';
  return 'low';
}
