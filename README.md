# BREATH — README (Hackathon)

## Overview

BREATH is a web application that translates **NASA TEMPO** satellite data and **weather forecasts** into simple air quality alerts. The user can click on a US map to view hourly pollutant forecasts (NO₂, O₃, HCHO, PM2.5, AI), receive practical recommendations, and enable notifications for high-risk windows.

## Impact

Air quality affects health, productivity, and daily decisions. BREATH bridges the gap between science and citizens by offering easy-to-understand **24–72h** forecasts based on orbital observations and weather models.

## Architecture

* **Frontend**: Vite + React + Recharts (D3/topojson map, charts, alerts).
* **Backend**: FastAPI (Python); integrates NASA TEMPO, OpenWeather, and AQICN.
* **Data/Modeling**:

  * NO₂ seed value from TEMPO granules (L3 preferred; L2 fallback).
  * Adjustments based on meteorological data (wind, cloud cover, rain).
  * Lightweight heuristics for O₃, HCHO, Aerosol Index (AI), and PM2.5 when direct measurements are unavailable.
  * **RiskScore 0–100** (Low/Moderate/High) and "next critical hour" alerts.

## Requirements

* **Python** 3.10+
* **Node.js** 18+ and **npm**
* Python dependencies (netCDF/hdf5 native libraries may be required on Windows):
  `netCDF4`, `h5netcdf`, `xarray`, `numpy`, `pandas`, `matplotlib`, `fastapi`, `uvicorn`, `python-dotenv`
* **API Keys/Credentials**:

  * `OPENWEATHER_API_KEY` (from OpenWeather)
  * `AQICN_TOKEN` (from aqicn.org)
  * `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` **or** `EARTHDATA_TOKEN` (from NASA Earthdata for TEMPO)

## Environment Variables — `backend/.env`

```ini
OPENWEATHER_API_KEY=your-key-goes-here
AQICN_TOKEN=your-token-goes-here
TEMPO_TIMEOUT_S=12
OPENWEATHER_TIMEOUT_S=10
NO2_SEED_FALLBACK=3.0e15
EARTHDATA_USERNAME=your_username
EARTHDATA_PASSWORD=your_password
# EARTHDATA_TOKEN=optional
```

## Environment Variables — `frontend/.env`

```ini
VITE_API_BASE=http://127.0.0.1:8000
```

## How to Run — Backend

```bash
cd backend
python -m venv .venv
# Activate the venv (Windows: .venv\Scripts\activate | Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

**Main Endpoints**

* `GET /health`
* `GET /forecast?lat={}&lon={}&bbox={minLon,minLat,maxLon,maxLat}&mode=fast&skip_nasa=false&require_nasa=true`
* `GET /states/summary?skip_nasa=true`
* `GET /tempo/latest_overlay.png?bbox=-125,24,-66,50&hours=8`

## How to Run — Frontend

```bash
cd frontend
npm install
npm run dev
# Abra http://localhost:5173
```
**Demo Tip**: append `?demo=1` to the frontend URL to avoid waiting for NASA data (it uses fallbacks and shorter timeouts).

## Quick Usage

1. Start the backend (port 8000) and frontend (port 5173).
2. In the UI: click on a state → sets lat/lon → click **Refresh**.
3. View the **RiskScore (0–100)**, risk range, per-pollutant chart, and recommendations.
4. Enable notifications to get alerts for the **next critical hour (<2h)**.

## Units (summary)

* **NO₂** (TEMPO, vertical column): ~mol/m² (used as a relative seed).
* **O₃ / HCHO**: derived/heuristic values for visual comparison.
* **PM2.5**: µg/m³ (estimated if no direct data is available).
* **Aerosol Index (AI)**: dimensionless (0+), qualitative indicator.
* **RiskScore**: 0–100 index (Low/Moderate/High) for laypeople.

##  Example Response `/forecast` (summary)

```json
{
  "lat": 39.7392,
  "lon": -104.9903,
  "risk": "moderate",
  "ratio_peak_over_seed": 1.1,
  "no2_seed": 2.8e15,
  "forecast": [
    {
      "datetime_utc": "...",
      "no2_forecast": 2.9e15,
      "o3_forecast": 23.4,
      "hcho_forecast": 5.2,
      "ai": 1.1,
      "pm25_forecast": 12.3
    }
  ],
  "weather": [{ "datetime_utc": "...", "temp": 18.2, "wind_speed": 3.4 }],
  "tempo": {
    "collection_id": "...",
    "temporal_used": { "start": "...", "end": "..." },
    "bbox_used": { "minLon": -106.4, "minLat": 38.5, "maxLon": -103.4, "maxLat": 40.9 },
    "granules": ["..."],
    "fallback_used": false
  },
  "ground": { "aqi": 63, "station": "...", "time_local": "..." },
  "alerts": { "hourly_risk": [{ "datetime_utc":"...", "risk":"high" }], "next_critical_hour": "..." },
  "validation": { "ground_bucket": "moderate", "model_bucket": "moderate", "concordance": "agree" },
  "index": { "value": 62, "label": "Moderate" }
}
```

## Troubleshooting

* **Cannot localize tz-aware Timestamp**: Ensure `datetime_utc` is always timezone-aware (UTC). Use `tz_localize("UTC")` only on naive timestamps; use `tz_convert("UTC")` only on *tz-aware* ones.
* **TEMPO lento/ausente**: Adjust `TEMPO_TIMEOUT_S` and `NO2_SEED_FALLBACK`; for quick `skip_nasa=true` query parameter.
* **netCDF4 no Windows**:  May require pre-compiled wheels or a separate installation of the HDF5/NetCDF libraries.

## Scripts/Recursos

* CSV export buttons on the frontend
* `/states/summary` endpoint to color the map with Low/Moderate/High risk levels.

## License and Credits

* Data: © NASA / TEMPO Mission; OpenWeather; AQICN.
* Code: MIT License (adjust according to hackathon rules).
* Team: Orbitantes.

## Roadmap

* Per-pollutant calibration (absolute units).
* City-level urban grid.
* Progressive push notifications.
* Risk explainability using weather factors.
