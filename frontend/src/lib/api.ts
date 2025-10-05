const BASE: string =
  ((import.meta as any)?.env?.VITE_API_BASE as string) || "http://127.0.0.1:8000";

export interface ForecastPoint {
  datetime_utc: string;
  no2_forecast: number;
}

export interface WeatherPoint {
  datetime_utc: string;
  temp?: number | null;
  humidity?: number | null;
  wind_speed?: number | null;
  wind_deg?: number | null;
  clouds?: number | null;
  pressure?: number | null;
  rain_1h_est?: number | null;
  snow_1h_est?: number | null;
}

export interface TempoMeta {
  collection_id: string;
  temporal_used: { start: string; end: string };
  bbox_used: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  granules: string[];
  mode: string;
  timeout_s: number;
  fallback_used: boolean;
}

export interface GroundSample {
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
}

export interface ForecastPayload {
  lat: number;
  lon: number;
  no2_seed: number;
  risk: "low" | "moderate" | "high";
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[];
  weather: WeatherPoint[];
  tempo: TempoMeta;
  ground?: GroundSample | null;
}

export async function getForecast(
  lat: number,
  lon: number,
  opts: {
    start?: string;
    end?: string;
    bbox?: string;
    mode?: "auto" | "fast" | "cache";
    timeoutMs?: number;
    skipNasa?: boolean;
    requireNasa?: boolean;
  } = {}
): Promise<ForecastPayload> {
  const u = new URL(`${BASE}/forecast`);
  u.searchParams.set("lat", String(lat));
  u.searchParams.set("lon", String(lon));
  if (opts.mode) u.searchParams.set("mode", opts.mode);
  if (opts.start) u.searchParams.set("start", opts.start);
  if (opts.end) u.searchParams.set("end", opts.end);
  if (opts.bbox) u.searchParams.set("bbox", opts.bbox);
  if (opts.skipNasa) u.searchParams.set("skip_nasa", "true");
  if (opts.requireNasa) u.searchParams.set("require_nasa", "true");

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 12000);

  const res = await fetch(u.toString(), { signal: ctrl.signal });
  clearTimeout(id);

  if (!res.ok) {
    let msg = `API ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) msg = `API ${res.status}: ${body.detail}`;
    } catch {}
    throw new Error(msg);
  }

  return (await res.json()) as ForecastPayload;
}

export { BASE };
