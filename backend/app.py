from pathlib import Path
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd

from nasa_tempo import fetch_tempo_no2_granule, compute_no2_seed
from weather_openweather import fetch_forecast, forecast_to_df, to_hourly
from forecast import forecast_no2_24h

app = FastAPI(title="TEMPO + Weather Forecast API", version="0.1.1")

# CORS p/ dev: libere o front local
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_GRANULE = ["TEMPO_NO2_L2_V03_20250406T215103Z_S012G07.nc"]
DATA_DIR = Path("./tempo_data")

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
    no2_seed: float
    forecast: list[ForecastPoint]
    weather: list[WeatherPoint]

@app.get("/health")
def health():
    return {"ok": True}

@app.get("/forecast", response_model=ForecastPayload)
def forecast(lat: float = Query(...), lon: float = Query(...)):
    # 1) NO2 "seed" a partir do granule TEMPO
    files = fetch_tempo_no2_granule(DATA_DIR, DEFAULT_GRANULE)
    no2_seed = compute_no2_seed(files[0])

    # 2) Clima v2.5 5d/3h -> horário
    fc_js = fetch_forecast(lat, lon, units="metric")
    df_3h = forecast_to_df(fc_js)
    wx_hourly = to_hourly(df_3h)

    # 3) Previsão NO2
    fc_no2 = forecast_no2_24h(wx_hourly, no2_seed)

    # 4) Serializa para JSON
    def df_to_records(df: pd.DataFrame) -> list[dict]:
        out = df.copy()
        out["datetime_utc"] = pd.to_datetime(out["datetime_utc"]).dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        return out.to_dict(orient="records")

    return ForecastPayload(
        lat=lat,
        lon=lon,
        no2_seed=no2_seed,
        forecast=[ForecastPoint(**r) for r in df_to_records(fc_no2)],
        weather=[WeatherPoint(**r) for r in df_to_records(wx_hourly)]
    )
