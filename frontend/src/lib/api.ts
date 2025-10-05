export type ForecastPoint = { datetime_utc: string; no2_forecast: number };
export type WeatherPoint = {
  datetime_utc: string;
  temp?: number | null;
  humidity?: number | null;
  wind_speed?: number | null;
  wind_deg?: number | null;
  clouds?: number | null;
  pressure?: number | null;
  rain_1h_est?: number | null;
  snow_1h_est?: number | null;
};
export type TempoInfo = {
  collection_id?: string;
  temporal_used?: { start?: string; end?: string };
  bbox_used?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  granules?: string[];
  mode?: string;
  timeout_s?: number;
  fallback_used?: boolean;
};
export type ValidationInfo = {
  model_bucket?: "low"|"moderate"|"high"|"unknown";
  ground_bucket?: "low"|"moderate"|"high"|"unknown";
  concordance?: "match"|"mismatch"|"unknown";
};
export type GroundSample = {
  aqi?: number | null;
  no2?: number | null;
  o3?: number | null;
  pm25?: number | null;
  pm10?: number | null;
  time_local?: string | null;
  station?: string | null;
  station_geo?: number[] | null;
  attribution?: string | null;
  fetched_utc?: string | null;
};
export type ForecastPayload = {
  lat: number;
  lon: number;
  no2_seed: number;
  risk: "low"|"moderate"|"high"|"unknown" | string;
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[];
  weather: WeatherPoint[];
  tempo: TempoInfo;
  ground?: GroundSample | null;
  alerts?: { hourly_risk?: Array<{datetime_utc:string,risk:string}>, next_critical_hour?: string | null };
  validation?: ValidationInfo;
};

export function getBase() {
  return import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";
}

export async function getForecast(
  lat: number,
  lon: number,
  opts?: { start?: string; end?: string; bbox?: string; mode?: "auto"|"fast"|"cache"; timeoutMs?: number; skip_nasa?: boolean }
): Promise<ForecastPayload> {
  const base = getBase();
  const p = new URLSearchParams();
  p.set("lat", String(lat));
  p.set("lon", String(lon));
  if (opts?.start) p.set("start", opts.start);
  if (opts?.end) p.set("end", opts.end);
  if (opts?.bbox) p.set("bbox", opts.bbox);
  p.set("mode", opts?.mode || "fast");
  if (typeof opts?.skip_nasa === "boolean") p.set("skip_nasa", String(opts.skip_nasa));
  const url = `${base}/forecast?${p.toString()}`;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort("timeout"), opts?.timeoutMs ?? 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`API ${r.status}: ${t || r.statusText}`);
    }
    return await r.json();
  } finally {
    clearTimeout(id);
  }
}
