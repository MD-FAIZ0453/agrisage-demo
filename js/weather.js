// Weather for the demo: solar geometry, clear-sky irradiance, synthetic
// scenario days, and FAO-56 hourly reference evapotranspiration (ET0).
// The weather is SYNTHETIC. The full system replaces makeWeather() with
// hourly history downloaded once from NASA POWER (see docs/ARCHITECTURE.md).

const DEG = Math.PI / 180;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cosine of the solar zenith angle at a clock time in IST (UTC+5:30).
export function cosZenith(doy, clockHour, lat, lon) {
  const b = (360 / 364) * (doy - 81) * DEG;
  const eotMin = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const solarHour = clockHour + (4 * (lon - 82.5) + eotMin) / 60;
  const decl = 23.45 * Math.sin((360 / 365) * (284 + doy) * DEG) * DEG;
  const omega = 15 * (solarHour - 12) * DEG;
  const phi = lat * DEG;
  return Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(omega);
}

// Haurwitz (1945) clear-sky global horizontal irradiance, W/m².
export function clearSkyGhi(cosZ) {
  if (cosZ <= 0.01) return 0;
  return 1098 * cosZ * Math.exp(-0.057 / cosZ);
}

// Kasten & Czeplak (1980) cloud attenuation.
export function cloudFactor(cloud) {
  return 1 - 0.75 * Math.pow(Math.min(Math.max(cloud, 0), 1), 3.4);
}

// Diurnal shape 0..1: minimum at 06:00, maximum at 15:00.
function diurnalShape(h) {
  if (h >= 6 && h <= 15) return (1 - Math.cos((Math.PI * (h - 6)) / 9)) / 2;
  const hh = h < 6 ? h + 24 : h;
  return 1 - (1 - Math.cos((Math.PI * (hh - 15)) / 15)) / 2;
}

// Build hourly weather from a list of day descriptors.
// day: { tmax, tmin, rhmax, rhmin, wind, cloud, rain: [{ hour, mm }], rainProb }
export function makeWeather(days, { doy0, lat, lon }) {
  const hours = [];
  days.forEach((d, di) => {
    const rainByHour = new Map((d.rain || []).map((r) => [r.hour, r.mm]));
    for (let h = 0; h < 24; h++) {
      const s = diurnalShape(h + 0.5);
      const rain = rainByHour.get(h) || 0;
      const raining = rain > 0;
      let t = d.tmin + (d.tmax - d.tmin) * s;
      let rh = d.rhmax - (d.rhmax - d.rhmin) * s;
      const cloud = raining ? 0.95 : d.cloud;
      if (raining) {
        t -= 3;
        rh = Math.max(rh, 92);
      }
      hours.push({ day: di, hour: h, doy: doy0 + di, t_c: t, rh, u2: d.wind * (0.7 + 0.6 * s), cloud, rain_mm: rain });
    }
  });
  return { hours, days, doy0, lat, lon };
}

// Weather at an absolute time (hours since midnight of day 0), interpolated.
export function weatherAt(wx, tAbs) {
  const n = wx.hours.length;
  const i = Math.min(Math.max(Math.floor(tAbs), 0), n - 1);
  const j = Math.min(i + 1, n - 1);
  const f = tAbs - Math.floor(tAbs);
  const a = wx.hours[i];
  const b = wx.hours[j];
  const lerp = (x, y) => x + (y - x) * f;
  const clock = tAbs - 24 * Math.floor(tAbs / 24);
  const doy = wx.doy0 + Math.floor(tAbs / 24);
  const cz = cosZenith(doy, clock, wx.lat, wx.lon);
  const gcs = clearSkyGhi(cz);
  return {
    t_c: lerp(a.t_c, b.t_c),
    rh: lerp(a.rh, b.rh),
    u2: lerp(a.u2, b.u2),
    cloud: a.cloud,
    rain_rate: a.rain_mm, // mm/h for the hour containing tAbs
    g_cs: gcs,
    g: gcs * cloudFactor(a.cloud),
    clock,
    day: Math.floor(tAbs / 24),
  };
}

// FAO-56 eq. 53: hourly Penman-Monteith reference ET, mm/h.
export function et0Hourly(w, elevationM, rsRsoNight = 0.7) {
  const T = w.t_c;
  const es = 0.6108 * Math.exp((17.27 * T) / (T + 237.3));
  const ea = (es * w.rh) / 100;
  const delta = (4098 * es) / Math.pow(T + 237.3, 2);
  const pressure = 101.3 * Math.pow((293 - 0.0065 * elevationM) / 293, 5.26);
  const gamma = 0.000665 * pressure;
  const rs = w.g * 0.0036; // W/m² → MJ m⁻² h⁻¹
  const rso = w.g_cs * 0.0036;
  const ratio = rso > 0.05 ? Math.min(rs / rso, 1) : rsRsoNight;
  const sigma = 2.043e-10;
  const rnl = sigma * Math.pow(T + 273.16, 4) * (0.34 - 0.14 * Math.sqrt(ea)) * (1.35 * ratio - 0.35);
  const rn = 0.77 * rs - rnl;
  const g = rn > 0 ? 0.1 * rn : 0.5 * rn;
  const num = 0.408 * delta * (rn - g) + gamma * (37 / (T + 273)) * w.u2 * (es - ea);
  const den = delta + gamma * (1 + 0.34 * w.u2);
  return Math.max(0, num / den);
}

// Demo scenarios. These are synthetic inputs chosen to show distinct decisions.
export const SCENARIOS = {
  hot_dry: {
    id: 'hot_dry',
    startHour: 7.5,
    drFrac: 0.78, // depletion as a share of RAW at the start
    soc: 0.55,
    days: [
      { tmax: 36, tmin: 24, rhmax: 78, rhmin: 34, wind: 2.4, cloud: 0.05, rain: [], rainProb: 5 },
      { tmax: 36.5, tmin: 24.5, rhmax: 76, rhmin: 33, wind: 2.6, cloud: 0.08, rain: [], rainProb: 5 },
      { tmax: 35.5, tmin: 24, rhmax: 78, rhmin: 36, wind: 2.2, cloud: 0.1, rain: [], rainProb: 10 },
    ],
  },
  rain_coming: {
    id: 'rain_coming',
    startHour: 7.5,
    drFrac: 0.6,
    soc: 0.6,
    days: [
      { tmax: 33, tmin: 23.5, rhmax: 88, rhmin: 52, wind: 3.0, cloud: 0.45, rain: [{ hour: 15, mm: 9 }, { hour: 16, mm: 14 }, { hour: 17, mm: 6 }], rainProb: 80 },
      { tmax: 31, tmin: 23, rhmax: 92, rhmin: 60, wind: 2.8, cloud: 0.55, rain: [{ hour: 14, mm: 4 }], rainProb: 60 },
      { tmax: 33, tmin: 23, rhmax: 85, rhmin: 48, wind: 2.5, cloud: 0.3, rain: [], rainProb: 20 },
    ],
  },
  cloudy_low_battery: {
    id: 'cloudy_low_battery',
    startHour: 7.5,
    drFrac: 0.85,
    soc: 0.24,
    days: [
      { tmax: 31, tmin: 23.5, rhmax: 86, rhmin: 58, wind: 2.0, cloud: 0.85, rain: [], rainProb: 25 },
      { tmax: 33, tmin: 23.5, rhmax: 84, rhmin: 50, wind: 2.2, cloud: 0.35, rain: [], rainProb: 15 },
      { tmax: 34, tmin: 24, rhmax: 80, rhmin: 42, wind: 2.4, cloud: 0.15, rain: [], rainProb: 10 },
    ],
  },
  moist_ok: {
    id: 'moist_ok',
    startHour: 7.5,
    drFrac: 0.15,
    soc: 0.8,
    days: [
      { tmax: 32, tmin: 22.5, rhmax: 86, rhmin: 48, wind: 2.2, cloud: 0.2, rain: [], rainProb: 10 },
      { tmax: 33, tmin: 23, rhmax: 84, rhmin: 45, wind: 2.4, cloud: 0.15, rain: [], rainProb: 10 },
      { tmax: 34, tmin: 23.5, rhmax: 80, rhmin: 40, wind: 2.4, cloud: 0.1, rain: [], rainProb: 5 },
    ],
  },
};

// Synthetic season (135 days from 15 January) for the policy comparison.
export function seasonDays(nDays, seed) {
  const rnd = mulberry32(seed);
  const days = [];
  for (let d = 0; d < nDays; d++) {
    const x = d / nDays;
    const tmax = 29 + 7 * x + (rnd() - 0.5) * 3;
    const tmin = 17 + 7 * x + (rnd() - 0.5) * 2;
    const pRain = 0.03 + 0.07 * x;
    const r = rnd();
    let cloud;
    let rain = [];
    if (r < pRain) {
      cloud = 0.6 + rnd() * 0.3;
      const total = 5 + rnd() * 30;
      const start = 14 + Math.floor(rnd() * 5);
      rain = [
        { hour: start, mm: total * 0.5 },
        { hour: start + 1, mm: total * 0.3 },
        { hour: start + 2, mm: total * 0.2 },
      ];
    } else if (r < pRain + 0.1) cloud = 0.6 + rnd() * 0.25;
    else if (r < pRain + 0.35) cloud = 0.3 + rnd() * 0.2;
    else cloud = 0.05 + rnd() * 0.1;
    days.push({
      tmax,
      tmin,
      rhmax: 80 + rnd() * 10,
      rhmin: 30 + rnd() * 15 + (rain.length ? 20 : 0),
      wind: 1.8 + rnd() * 1.4,
      cloud,
      rain,
      rainProb: rain.length ? 70 : 10,
    });
  }
  return days;
}
