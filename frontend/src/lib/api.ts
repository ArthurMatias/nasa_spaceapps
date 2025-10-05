let BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

export function setBase(b: string) { BASE = b; }
export function getBase() { return BASE; }

export type ForecastPoint = { datetime_utc: string; [k: string]: number | string | null | undefined };
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
export type GroundSample = {
  aqi?: number | string | null;
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
  risk: "low" | "moderate" | "high" | "unknown";
  ratio_peak_over_seed: number;
  forecast: ForecastPoint[];
  weather: WeatherPoint[];
  tempo: Record<string, any>;
  ground?: GroundSample | null;
  alerts?: { hourly_risk?: Array<{ datetime_utc: string; risk: string }>; next_critical_hour?: string | null } | null;
  validation?: { ground_bucket?: string; model_bucket?: string; concordance?: string } | null;
  o3_forecast?: ForecastPoint[] | null;
  hcho_forecast?: ForecastPoint[] | null;
  pm25_forecast?: ForecastPoint[] | null;
  ai?: ForecastPoint[] | null;
};

export type StatesSummaryItem = {
  state: string;
  lat: number;
  lon: number;
  risk: "low" | "moderate" | "high" | "unknown";
  no2_seed?: number | null;
  updated_utc: string;
};

function buildUrl(path: string, params: Record<string, any>) {
  const u = new URL(path, BASE);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  return u.toString();
}

export type ForecastOptions = {
  start?: string;
  end?: string;
  bbox?: string;
  mode?: "auto" | "cache" | "fast";
  timeoutMs?: number;
  skip_nasa?: boolean;
  require_nasa?: boolean;
};

export async function getForecast(lat: number, lon: number, opts: ForecastOptions = {}): Promise<ForecastPayload> {
  const { start, end, bbox, mode = "auto", timeoutMs = 15000, skip_nasa, require_nasa } = opts;
  const url = buildUrl("/forecast", { lat, lon, start, end, bbox, mode, skip_nasa, require_nasa });
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort("timeout"), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      throw new Error(`API ${r.status}: ${text || r.statusText}`);
    }
    return (await r.json()) as ForecastPayload;
  } finally {
    clearTimeout(id);
  }
}

export async function getStatesSummary(skip_nasa = true): Promise<StatesSummaryItem[]> {
  const url = buildUrl("/states/summary", { skip_nasa });
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`API ${r.status}: ${text || r.statusText}`);
  }
  const js = await r.json();
  return Array.isArray(js?.items) ? (js.items as StatesSummaryItem[]) : [];
}

export function getTempoOverlayUrl(bbox = "-125,24,-66,50", prefer_l3 = true, hours = 8) {
  return buildUrl("/tempo/latest_overlay.png", { bbox, prefer_l3, hours });
}
