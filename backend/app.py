# app.py
from __future__ import annotations

from pathlib import Path
import time
from typing import List, Dict, Any

import pandas as pd
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Nossos módulos locais
from nasa_tempo import fetch_tempo_no2_granule, compute_no2_seed
from weather_openweather import fetch_forecast, forecast_to_df, to_hourly
from forecast import forecast_no2_24h

# =========================
# Configuração do app
# =========================
app = FastAPI(title="TEMPO + Weather Forecast API", version="0.2.0")

# CORS para dev (ajuste os domínios do seu front se necessário)
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

# Granule fixo (demo) — troque se quiser
DEFAULT_GRANULE = ["TEMPO_NO2_L2_V03_20250406T215103Z_S012G07.nc"]
DATA_DIR = Path("./tempo_data")

# Cache simples em memória: (lat,lon) -> (timestamp, payload_dict)
_CACHE: Dict[tuple[float, float], tuple[float, Dict[str, Any]]] = {}
CACHE_TTL_SECONDS = 30 * 60  # 30 min


# =========================
# Modelos de resposta
# =========================
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


class ForecastPayload(BaseModel):
    lat: float
    lon: float
    no2_seed: float = Field(..., description="Média do NO₂ (coluna troposférica) do granule TEMPO usado como estado atual")
    risk: str = Field(..., description="low | moderate | high — baseado na razão pico/seed")
    ratio_peak_over_seed: float
    forecast: List[ForecastPoint]
    weather: List[WeatherPoint]


# =========================
# Utilitários
# =========================
def _round_key(lat: float, lon: float, digits: int = 4) -> tuple[float, float]:
    # arredonda para reduzir cardinalidade do cache
    return (round(lat, digits), round(lon, digits))


def _df_to_records_iso(df: pd.DataFrame) -> List[Dict[str, Any]]:
    out = df.copy()
    out["datetime_utc"] = pd.to_datetime(out["datetime_utc"], utc=True).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    return out.to_dict(orient="records")


def _compute_risk(no2_seed: float, fc_no2: pd.DataFrame) -> tuple[str, float]:
    """Retorna (risk_label, ratio_peak_over_seed)."""
    if no2_seed is None or no2_seed <= 0 or fc_no2.empty:
        return ("low", 1.0)
    peak = float(fc_no2["no2_forecast"].max())
    ratio = float(peak / no2_seed) if no2_seed else 1.0
    if ratio >= 1.2:
        return ("high", ratio)
    if ratio >= 1.0:
        return ("moderate", ratio)
    return ("low", ratio)


# =========================
# Endpoints
# =========================
@app.get("/health")
def health():
    return {"ok": True, "service": "tempo-weather-api", "version": "0.2.0"}


@app.get("/forecast", response_model=ForecastPayload)
def forecast(
    lat: float = Query(..., description="Latitude (América do Norte para cobertura TEMPO)"),
    lon: float = Query(..., description="Longitude (América do Norte para cobertura TEMPO)"),
):
    key = _round_key(lat, lon)

    # 1) Cache quente?
    ts, cached = _CACHE.get(key, (0.0, None))
    if cached and (time.time() - ts) < CACHE_TTL_SECONDS:
        return cached  # payload já pronto

    # 2) Pipeline com tratamento de erros — qualquer falha externa vira 503
    try:
        # 2.1 Baixa/usa um granule TEMPO e extrai seed de NO₂
        files = fetch_tempo_no2_granule(DATA_DIR, DEFAULT_GRANULE)
        if not files:
            raise RuntimeError("Harmony não retornou arquivos.")
        no2_seed = compute_no2_seed(files[0])

        # 2.2 Clima (OpenWeather 2.5: forecast 5d/3h) -> horário (1h)
        fc_js = fetch_forecast(lat, lon, units="metric")
        df_3h = forecast_to_df(fc_js)
        wx_hourly = to_hourly(df_3h)
        if wx_hourly.empty:
            raise RuntimeError("Clima horário vazio para esse ponto.")

        # 2.3 Forecast de NO₂ (baseline)
        fc_no2 = forecast_no2_24h(wx_hourly, no2_seed)

        # 2.4 Risco (pico/seed)
        risk_label, ratio = _compute_risk(no2_seed, fc_no2)

        # 2.5 Serialização
        payload: Dict[str, Any] = {
            "lat": lat,
            "lon": lon,
            "no2_seed": float(no2_seed),
            "risk": risk_label,
            "ratio_peak_over_seed": ratio,
            "forecast": _df_to_records_iso(fc_no2),
            "weather": _df_to_records_iso(wx_hourly),
        }

        # 2.6 Atualiza cache e retorna
        _CACHE[key] = (time.time(), payload)
        return payload

    except HTTPException:
        # repropaga se já for HTTPException
        raise
    except Exception as e:
        # log simples (pode trocar por logging)
        print(f"[ERROR] /forecast lat={lat} lon={lon} -> {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Upstream error (NASA/Weather). Tente novamente em instantes.")
