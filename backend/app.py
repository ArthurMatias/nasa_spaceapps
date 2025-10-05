from __future__ import annotations
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(dotenv_path=Path(__file__).parent / ".env")

from typing import List, Dict, Any, Optional, Tuple
import time
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime, timedelta, timezone
from io import BytesIO

import numpy as np
import pandas as pd
import xarray as xr
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field

from nasa_tempo import (
    fetch_tempo_no2_by_time_bbox,
    compute_no2_seed,
    COLL_L3_NRT_NO2,
    COLL_L2_NRT_NO2,
)
from weather_openweather import fetch_forecast, forecast_to_df, to_hourly
from forecast import forecast_no2_24h
from aqicn_client import fetch_nearest as aqicn_fetch

app = FastAPI(title="TEMPO + Weather Forecast API", version="0.5.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path("./tempo_data")
DATA_DIR.mkdir(parents=True, exist_ok=True)

_CACHE: Dict[tuple[float, float], tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 30 * 60

OVERLAY_CACHE: Dict[str, tuple[float, bytes]] = {}
OVERLAY_CACHE_TTL = 10 * 60

TEMPO_TIMEOUT_S = float(os.getenv("TEMPO_TIMEOUT_S", "8"))
OPENWEATHER_TIMEOUT_S = float(os.getenv("OPENWEATHER_TIMEOUT_S", "8"))
NO2_SEED_FALLBACK = float(os.getenv("NO2_SEED_FALLBACK", "3.0e15"))

class ForecastPoint(BaseModel):
    datetime_utc: str
    no2_forecast: float
    o3_forecast: float | None = None
    hcho_forecast: float | None = None
    ai: float | None = None
    pm25_forecast: float | None = None

class WeatherPoint(BaseModel):
    datetime_utc: str
    temp: float | None = None
    humidity: float | None = None
    wind_speed: float | None = None
    wind_deg: float | None = None
    clouds: float | None = None
    pressure: float | None = None
    rain_1h_est: float | None = None
    snow_1h_est: float | None = None

class GroundSample(BaseModel):
    aqi: int | float | None = None
    no2: float | None = None
    o3: float | None = None
    pm25: float | None = None
    pm10: float | None = None
    time_local: str | None = None
    station: str | None = None
    station_geo: List[float] | None = None
    attribution: str | None = None
    fetched_utc: str | None = None

class ForecastPayload(BaseModel):
    lat: float
    lon: float
    no2_seed: float = Field(...)
    risk: str
    ratio_peak_over_seed: float
    forecast: List[ForecastPoint]
    weather: List[WeatherPoint]
    tempo: Dict[str, Any]
    ground: GroundSample | None = None
    alerts: Dict[str, Any] | None = None
    validation: Dict[str, Any] | None = None

def _round_key(lat: float, lon: float, digits: int = 4) -> tuple[float, float]:
    return (round(lat, digits), round(lon, digits))

def _df_to_records_iso(df: pd.DataFrame) -> List[Dict[str, Any]]:
    out = df.copy()
    out["datetime_utc"] = pd.to_datetime(out["datetime_utc"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out.to_dict(orient="records")

def _compute_risk(no2_seed: float, fc_no2: pd.DataFrame) -> tuple[str, float]:
    if no2_seed is None or no2_seed <= 0 or fc_no2.empty:
        return ("low", 1.0)
    peak = float(fc_no2["no2_forecast"].max())
    ratio = float(peak / no2_seed) if no2_seed else 1.0
    if ratio >= 1.2:
        return ("high", ratio)
    if ratio >= 1.0:
        return ("moderate", ratio)
    return ("low", ratio)

def _fmt_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def _bbox_default(lat: float, lon: float) -> Tuple[float, float, float, float]:
    dlon, dlat = 1.5, 1.2
    return (lon - dlon, lat - dlat, lon + dlon, lat + dlat)

def _parse_bbox(bbox_str: str) -> Tuple[float, float, float, float]:
    parts = [float(x) for x in bbox_str.split(",")]
    if len(parts) != 4:
        raise ValueError
    return (parts[0], parts[1], parts[2], parts[3])

def _join_forecast_weather(fc_no2: pd.DataFrame, wx_hourly: pd.DataFrame) -> pd.DataFrame:
    a = fc_no2.copy()
    b = wx_hourly.copy()
    a["datetime_utc"] = pd.to_datetime(a["datetime_utc"], utc=True)
    b["datetime_utc"] = pd.to_datetime(b["datetime_utc"], utc=True)
    m = a.merge(
        b[["datetime_utc", "wind_speed", "clouds", "rain_1h_est", "pressure", "temp", "humidity", "wind_deg"]],
        on="datetime_utc",
        how="left",
    )
    return m

def _meteo_factor(row: pd.Series) -> float:
    f = 1.0
    ws = row.get("wind_speed", None)
    if isinstance(ws, (int, float)):
        if ws >= 12:
            f *= 0.80
        elif ws >= 8:
            f *= 0.90
        elif ws <= 2:
            f *= 1.05
    cl = row.get("clouds", None)
    if isinstance(cl, (int, float)):
        if cl >= 80:
            f *= 0.95
        elif cl <= 20:
            f *= 1.05
    r = row.get("rain_1h_est", None)
    if isinstance(r, (int, float)) and r > 0:
        f *= 0.85
    return float(max(0.6, min(1.4, f)))

def adjust_no2_with_meteo(fc_no2: pd.DataFrame, wx_hourly: pd.DataFrame) -> pd.DataFrame:
    m = _join_forecast_weather(fc_no2, wx_hourly)
    m["adj_factor"] = m.apply(_meteo_factor, axis=1)
    m["no2_forecast"] = (m["no2_forecast"] * m["adj_factor"]).astype(float)
    return m[["datetime_utc", "no2_forecast"]]

def build_hourly_risk(no2_seed: float, fc_no2: pd.DataFrame) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    hi = 1.2 * no2_seed
    md = 1.0 * no2_seed
    for _, r in fc_no2.iterrows():
        v = float(r["no2_forecast"])
        if v >= hi:
            rk = "high"
        elif v >= md:
            rk = "moderate"
        else:
            rk = "low"
        rows.append({"datetime_utc": pd.to_datetime(r["datetime_utc"], utc=True).strftime("%Y-%m-%dT%H:%M:%SZ"), "risk": rk})
    return rows

def next_critical_hour(hourly_risk: List[Dict[str, Any]]) -> Optional[str]:
    now = pd.Timestamp.now(tz="UTC")
    for r in hourly_risk:
        t = pd.to_datetime(r["datetime_utc"], utc=True)
        if t.tzinfo is None:
            t = t.tz_localize("UTC")
        else:
            t = t.tz_convert("UTC")
        if t >= now and r["risk"] == "high":
            return t.strftime("%Y-%m-%dT%H:%M:%SZ")
    return None

def _open_no2_dataset(nc_path: str) -> tuple[xr.Dataset, str]:
    ds = None
    last_err = None
    try:
        ds = xr.open_dataset(nc_path, engine="netcdf4", group="product")
    except Exception as e:
        last_err = e
    if ds is None:
        try:
            ds = xr.open_dataset(nc_path, engine="h5netcdf", group="product")
        except Exception as e:
            last_err = e
    if ds is None:
        raise RuntimeError(f"failed to open {nc_path}: {last_err}")
    for cand in ["vertical_column_troposphere", "vertical_column", "no2", "NO2"]:
        if cand in ds.data_vars:
            return ds, cand
    raise RuntimeError("NO2 variable not found")

def _open_geo(nc_path: str) -> tuple[np.ndarray, np.ndarray]:
    geo = None
    try:
        geo = xr.open_dataset(nc_path, engine="netcdf4", group="geolocation")
    except Exception:
        try:
            geo = xr.open_dataset(nc_path, engine="h5netcdf", group="geolocation")
        except Exception:
            geo = None
    if geo is None or ("latitude" not in geo) or ("longitude" not in geo):
        raise RuntimeError("geolocation not found")
    return geo["longitude"].values, geo["latitude"].values

def _render_no2_overlay_png(nc_path: str, bbox: Tuple[float, float, float, float]) -> bytes:
    ds, vname = _open_no2_dataset(nc_path)
    lon, lat = _open_geo(nc_path)
    z = ds[vname].values.astype(float)
    z = np.where(np.isfinite(z), z, np.nan)
    fig, ax = plt.subplots(figsize=(7.2, 4.2), dpi=150)
    ax.set_xlim([bbox[0], bbox[2]])
    ax.set_ylim([bbox[1], bbox[3]])
    ax.set_xticks([])
    ax.set_yticks([])
    ax.set_facecolor((0, 0, 0, 0))
    ax.pcolormesh(lon, lat, z, shading="auto", cmap="plasma")
    for spine in ax.spines.values():
        spine.set_visible(False)
    buf = BytesIO()
    plt.savefig(buf, format="png", bbox_inches="tight", pad_inches=0, transparent=True)
    plt.close(fig)
    return buf.getvalue()

def _safe_fill(s, val):
    return s.fillna(val) if hasattr(s, "fillna") else s

def build_multi_species_forecast(fc_no2: pd.DataFrame, wx_hourly: pd.DataFrame) -> pd.DataFrame:
    m = _join_forecast_weather(fc_no2, wx_hourly).copy()
    for col, default in [
        ("temp", 20.0),
        ("humidity", 50.0),
        ("wind_speed", 3.0),
        ("clouds", 40.0),
        ("rain_1h_est", 0.0),
    ]:
        if col not in m:
            m[col] = default
        m[col] = _safe_fill(pd.to_numeric(m[col], errors="coerce"), default)
    no2 = pd.to_numeric(m["no2_forecast"], errors="coerce").fillna(0.0)
    tnorm = ((m["temp"] + 5.0) / 30.0).clip(0.3, 1.6)
    clr = ((100.0 - m["clouds"]) / 60.0).clip(0.5, 1.5)
    calm = (6.0 - m["wind_speed"]).clip(0.0, 6.0)
    m["o3_forecast"] = (0.06 * no2 * tnorm * clr).astype(float)
    m["hcho_forecast"] = (0.03 * no2 * clr).astype(float)
    m["ai"] = (0.4 + 0.07 * calm + 0.005 * m["clouds"]).clip(0.0, 5.0).astype(float)
    m["pm25_forecast"] = (6.0 + 0.9 * m["ai"] + 0.15 * calm).clip(0.0, 200.0).astype(float)
    return m[["datetime_utc", "no2_forecast", "o3_forecast", "hcho_forecast", "ai", "pm25_forecast"]]

def _fetch_tempo_fast(lat: float, lon: float, start: Optional[str], end: Optional[str], bbox: Optional[str]):
    now = datetime.now(timezone.utc)
    s_iso = start or _fmt_iso(now - timedelta(hours=4))
    e_iso = end or _fmt_iso(now + timedelta(minutes=1))
    bb = _parse_bbox(bbox) if bbox else _bbox_default(lat, lon)
    for prefer_l3 in (True, False):
        files = fetch_tempo_no2_by_time_bbox(DATA_DIR, s_iso, e_iso, bb, prefer_l3=prefer_l3)
        if files:
            return files, s_iso, e_iso, bb, prefer_l3
    raise RuntimeError("No matching granules (fast)")

def _fetch_tempo_robust(lat: float, lon: float, start: Optional[str], end: Optional[str], bbox: Optional[str]):
    if bbox:
        bb = _parse_bbox(bbox)
    else:
        bb = _bbox_default(lat, lon)
    attempts: List[Tuple[str, str, Tuple[float, float, float, float]]] = []
    if start and end:
        attempts.append((start, end, bb))
    else:
        now = datetime.now(timezone.utc)
        for hrs in (8, 12, 24):
            s = _fmt_iso(now - timedelta(hours=hrs))
            e = _fmt_iso(now + timedelta(minutes=1))
            attempts.append((s, e, bb))
    for s_iso, e_iso, bb2 in attempts:
        for prefer_l3 in (True, False):
            try:
                files = fetch_tempo_no2_by_time_bbox(DATA_DIR, s_iso, e_iso, bb2, prefer_l3=prefer_l3)
                if files:
                    return files, s_iso, e_iso, bb2, prefer_l3
            except Exception:
                pass
    raise RuntimeError("No matching granules (robust)")

@app.get("/health")
def health():
    return {"ok": True, "service": "tempo-weather-api", "version": "0.5.1"}

@app.get("/forecast", response_model=ForecastPayload)
def forecast(
    lat: float = Query(...),
    lon: float = Query(...),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    bbox: Optional[str] = Query(None),
    mode: str = Query("auto"),
    require_nasa: bool = Query(False),
    skip_nasa: bool = Query(False),
):
    key = _round_key(lat, lon)
    ts, cached = _CACHE.get(key, (0.0, None))
    if mode == "cache" and cached:
        return cached
    if cached and (time.time() - ts) < CACHE_TTL_SECONDS and mode == "auto" and not (start or end or bbox or skip_nasa or require_nasa):
        return cached
    try:
        with ThreadPoolExecutor(max_workers=2) as ex:
            wx_future = ex.submit(lambda: to_hourly(forecast_to_df(fetch_forecast(lat, lon, units="metric"))))
            if skip_nasa:
                tempo_future = None
            else:
                tempo_future = ex.submit(_fetch_tempo_fast if mode == "fast" else _fetch_tempo_robust, lat, lon, start, end, bbox)
            try:
                wx_hourly = wx_future.result(timeout=OPENWEATHER_TIMEOUT_S)
            except (FuturesTimeout, Exception):
                raise HTTPException(status_code=503, detail="OpenWeather timeout/erro")
            if skip_nasa:
                files, start_iso, end_iso, bbox_tuple, prefer_used = [], start or "", end or "", _bbox_default(lat, lon), True
                no2_seed = NO2_SEED_FALLBACK
                fallback_used = True
            else:
                try:
                    files, start_iso, end_iso, bbox_tuple, prefer_used = tempo_future.result(timeout=TEMPO_TIMEOUT_S)
                    no2_seed = compute_no2_seed(files[0])
                    fallback_used = False
                except (FuturesTimeout, Exception):
                    no2_seed = NO2_SEED_FALLBACK
                    start_iso = start or ""
                    end_iso = end or ""
                    bbox_tuple = _bbox_default(lat, lon)
                    prefer_used = True
                    files = []
                    fallback_used = True
        if require_nasa and fallback_used:
            raise HTTPException(status_code=424, detail="NASA TEMPO ausente nesta janela/bbox (fallback em uso).")
        if wx_hourly.empty:
            raise RuntimeError("empty weather")
        fc_no2 = forecast_no2_24h(wx_hourly, no2_seed)
        fc_no2 = adjust_no2_with_meteo(fc_no2, wx_hourly)
        fc_multi = build_multi_species_forecast(fc_no2, wx_hourly)
        risk_label, ratio = _compute_risk(no2_seed, fc_no2)
        hourly_risk = build_hourly_risk(no2_seed, fc_no2)
        nexth = next_critical_hour(hourly_risk)
        coll_used = COLL_L3_NRT_NO2 if prefer_used else COLL_L2_NRT_NO2
        ground: GroundSample | None = None
        try:
            g = aqicn_fetch(lat, lon)
            ground = GroundSample(**g)
            if isinstance(ground.aqi, (int, float, str)) and str(ground.aqi).strip() != "":
                try:
                    aqi_num = float(ground.aqi)
                    if aqi_num >= 151 and risk_label != "high":
                        risk_label = "high"
                except Exception:
                    pass
        except Exception:
            ground = None
        def _aqi_bucket(aqi_val) -> str:
            try:
                v = float(aqi_val) if aqi_val is not None and str(aqi_val).strip() != "" else None
            except Exception:
                return "unknown"
            if v is None:
                return "unknown"
            if v >= 151:
                return "high"
            if v >= 101:
                return "moderate"
            return "low"
        g_bucket = _aqi_bucket(ground.aqi) if ground else "unknown"
        model_bucket = risk_label
        concordance = "unknown"
        if g_bucket != "unknown":
            if g_bucket == model_bucket:
                concordance = "agree"
            else:
                order = {"low": 0, "moderate": 1, "high": 2}
                if order.get(g_bucket, 1) > order.get(model_bucket, 1):
                    concordance = "underpredict"
                else:
                    concordance = "overpredict"
        payload: Dict[str, Any] = {
            "lat": lat,
            "lon": lon,
            "no2_seed": float(no2_seed),
            "risk": risk_label,
            "ratio_peak_over_seed": ratio,
            "forecast": _df_to_records_iso(fc_multi),
            "weather": _df_to_records_iso(wx_hourly),
            "tempo": {
                "collection_id": coll_used,
                "temporal_used": {"start": start_iso, "end": end_iso},
                "bbox_used": {"minLon": bbox_tuple[0], "minLat": bbox_tuple[1], "maxLon": bbox_tuple[2], "maxLat": bbox_tuple[3]},
                "granules": [Path(p).name for p in files],
                "mode": mode,
                "timeout_s": TEMPO_TIMEOUT_S,
                "fallback_used": fallback_used,
            },
            "ground": ground,
            "alerts": {"hourly_risk": hourly_risk, "next_critical_hour": nexth},
            "validation": {"ground_bucket": g_bucket, "model_bucket": model_bucket, "concordance": concordance},
        }
        if mode in ("auto", "cache") and not (start or end or bbox or skip_nasa or require_nasa):
            _CACHE[key] = (time.time(), payload)
        return payload
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] /forecast lat={lat} lon={lon} -> {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Upstream error (NASA/Weather).")

@app.get("/tempo/latest_overlay.png")
def tempo_overlay(bbox: str = Query("-125,24,-66,50"), prefer_l3: bool = True, hours: int = 8):
    try:
        parts = [float(x) for x in bbox.split(",")]
        if len(parts) != 4:
            raise HTTPException(status_code=400, detail="invalid bbox")
        bb = (parts[0], parts[1], parts[2], parts[3])
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="invalid bbox")
    cache_key = f"{bbox}|{prefer_l3}|{hours}"
    ts, entry = OVERLAY_CACHE.get(cache_key, (0.0, None))
    if entry and (time.time() - ts) < OVERLAY_CACHE_TTL:
        return Response(content=entry, media_type="image/png")
    now = datetime.now(timezone.utc)
    s_iso = _fmt_iso(now - timedelta(hours=hours))
    e_iso = _fmt_iso(now + timedelta(minutes=1))
    for p in (prefer_l3, not prefer_l3):
        try:
            files = fetch_tempo_no2_by_time_bbox(DATA_DIR, s_iso, e_iso, bb, prefer_l3=p)
        except Exception:
            files = []
        if files:
            try:
                png = _render_no2_overlay_png(files[0], bb)
            except Exception:
                continue
            OVERLAY_CACHE[cache_key] = (time.time(), png)
            return Response(content=png, media_type="image/png")
    raise HTTPException(status_code=404, detail="no TEMPO granule for window/bbox")

US_STATES_CENTROIDS = [
    ("Alabama", 32.806671, -86.791130),
    ("Alaska", 64.200840, -149.493670),
    ("Arizona", 34.048928, -111.093731),
    ("Arkansas", 34.969704, -92.373123),
    ("California", 36.778261, -119.417932),
    ("Colorado", 39.550051, -105.782067),
    ("Connecticut", 41.603221, -73.087749),
    ("Delaware", 38.910832, -75.527670),
    ("Florida", 27.664827, -81.515754),
    ("Georgia", 32.165622, -82.900075),
    ("Hawaii", 19.896766, -155.582782),
    ("Idaho", 44.068202, -114.742041),
    ("Illinois", 40.633125, -89.398528),
    ("Indiana", 40.551217, -85.602364),
    ("Iowa", 41.878003, -93.097702),
    ("Kansas", 39.011902, -98.484246),
    ("Kentucky", 37.839333, -84.270018),
    ("Louisiana", 30.984298, -91.962333),
    ("Maine", 45.253783, -69.445469),
    ("Maryland", 39.045755, -76.641271),
    ("Massachusetts", 42.407211, -71.382437),
    ("Michigan", 44.314844, -85.602364),
    ("Minnesota", 46.729553, -94.685900),
    ("Mississippi", 32.354668, -89.398528),
    ("Missouri", 37.964253, -91.831833),
    ("Montana", 46.879682, -110.362566),
    ("Nebraska", 41.492537, -99.901813),
    ("Nevada", 38.802610, -116.419389),
    ("New Hampshire", 43.193852, -71.572395),
    ("New Jersey", 40.058324, -74.405661),
    ("New Mexico", 34.519940, -105.870090),
    ("New York", 43.299428, -74.217933),
    ("North Carolina", 35.759573, -79.019300),
    ("North Dakota", 47.551493, -101.002012),
    ("Ohio", 40.417287, -82.907123),
    ("Oklahoma", 35.007752, -97.092877),
    ("Oregon", 43.804133, -120.554201),
    ("Pennsylvania", 41.203322, -77.194525),
    ("Rhode Island", 41.580095, -71.477429),
    ("South Carolina", 33.836081, -81.163725),
    ("South Dakota", 43.969515, -99.901813),
    ("Tennessee", 35.517491, -86.580447),
    ("Texas", 31.968599, -99.901813),
    ("Utah", 39.320980, -111.093731),
    ("Vermont", 44.558803, -72.577841),
    ("Virginia", 37.431573, -78.656894),
    ("Washington", 47.751074, -120.740139),
    ("West Virginia", 38.597626, -80.454903),
    ("Wisconsin", 43.784440, -88.787868),
    ("Wyoming", 43.075968, -107.290284),
]

def _safe_forecast_point(lat: float, lon: float, skip_nasa: bool) -> dict[str, Any]:
    try:
        bbox = f"{lon-1.5},{lat-1.2},{lon+1.5},{lat+1.2}"
        payload = forecast(
            lat=lat, lon=lon,
            start=None, end=None, bbox=bbox,
            mode="fast",
            require_nasa=False,
            skip_nasa=skip_nasa
        )
        if isinstance(payload, dict):
            return payload
        return payload.dict()
    except Exception:
        return {
            "risk": "unknown",
            "no2_seed": None,
            "lat": lat,
            "lon": lon,
            "tempo": {"fallback_used": True},
            "updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

@app.get("/states/summary")
def states_summary(skip_nasa: bool = Query(True)):
    from concurrent.futures import ThreadPoolExecutor, as_completed
    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {
            ex.submit(_safe_forecast_point, lat, lon, skip_nasa): (name, lat, lon)
            for name, lat, lon in US_STATES_CENTROIDS
        }
        for fut in as_completed(futs):
            name, lat, lon = futs[fut]
            item = fut.result()
            results.append({
                "state": name,
                "lat": lat,
                "lon": lon,
                "risk": item.get("risk", "unknown"),
                "no2_seed": item.get("no2_seed"),
                "updated_utc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            })
    return {"items": results}
