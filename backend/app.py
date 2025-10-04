from __future__ import annotations
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import time
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from datetime import datetime, timedelta, timezone

import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
_CACHE: Dict[tuple[float, float], tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 30 * 60

TEMPO_TIMEOUT_S = float(os.getenv("TEMPO_TIMEOUT_S", "8"))
OPENWEATHER_TIMEOUT_S = float(os.getenv("OPENWEATHER_TIMEOUT_S", "8"))
NO2_SEED_FALLBACK = float(os.getenv("NO2_SEED_FALLBACK", "3.0e15"))

class ForecastPoint(BaseModel):
    datetime_utc: str
    no2_forecast: float

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
                files, start_iso, end_iso, bbox_tuple, prefer_used, fallback_used, no2_seed = [], start or "", end or "", _bbox_default(lat, lon), True, True, NO2_SEED_FALLBACK
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

        if wx_hourly.empty:
            raise RuntimeError("Clima horário vazio para esse ponto.")
        fc_no2 = forecast_no2_24h(wx_hourly, no2_seed)
        risk_label, ratio = _compute_risk(no2_seed, fc_no2)
        coll_used = COLL_L3_NRT_NO2 if prefer_used else COLL_L2_NRT_NO2

        ground: GroundSample | None = None
        try:
            g = aqicn_fetch(lat, lon)
            ground = GroundSample(**g)
            if isinstance(ground.aqi, (int, float)) and ground.aqi >= 151 and risk_label != "high":
                risk_label = "high"
        except Exception:
            ground = None

        payload: Dict[str, Any] = {
            "lat": lat,
            "lon": lon,
            "no2_seed": float(no2_seed),
            "risk": risk_label,
            "ratio_peak_over_seed": ratio,
            "forecast": _df_to_records_iso(fc_no2),
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
        }

        if require_nasa and payload["tempo"]["fallback_used"]:
            raise HTTPException(status_code=424, detail="NASA TEMPO ausente nesta janela/bbox (fallback em uso).")

        if mode in ("auto", "cache") and not (start or end or bbox or skip_nasa or require_nasa):
            _CACHE[key] = (time.time(), payload)

        return payload

    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] /forecast lat={lat} lon={lon} -> {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Upstream error (NASA/Weather).")
