# BREATH — README (Hackathon)

## Visão geral

BREATH é uma aplicação web que traduz dados de satélite **NASA TEMPO** e **previsão do tempo** em alertas simples de qualidade do ar. O usuário clica no mapa dos EUA, vê a previsão horária de poluentes (NO₂, O₃, HCHO, PM2.5, AI), recebe recomendações práticas e pode ativar notificações para janelas de maior risco.

## Impacto

Qualidade do ar impacta saúde, produtividade e decisões do dia a dia. O BREATH aproxima ciência e cidadão, oferecendo previsões de **24–72h** fáceis de entender, baseadas em observações orbitais e modelos meteorológicos.

## Arquitetura

* **Frontend**: Vite + React + Recharts (mapa D3/topojson, gráficos, alertas).
* **Backend**: FastAPI (Python); integra NASA TEMPO, OpenWeather e AQICN.
* **Dados/Modelagem**:

  * Semente de NO₂ a partir de granules TEMPO (L3 preferencial; fallback L2).
  * Ajuste por meteorologia (vento, nuvem, chuva).
  * Heurísticas leves para O₃, HCHO, Aerosol Index (AI) e PM2.5 quando não houver medição direta.
  * **RiskScore 0–100** (Low/Moderate/High) e “próxima hora crítica”.

## Requisitos

* **Python** 3.10+
* **Node.js** 18+ e **npm**
* Dependências Python (netCDF/hdf5 podem ser necessários no Windows):
  `netCDF4`, `h5netcdf`, `xarray`, `numpy`, `pandas`, `matplotlib`, `fastapi`, `uvicorn`, `python-dotenv`
* **Chaves/credenciais**:

  * `OPENWEATHER_API_KEY` (OpenWeather)
  * `AQICN_TOKEN` (aqicn.org)
  * `EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` **ou** `EARTHDATA_TOKEN` (NASA Earthdata para TEMPO)

## Variáveis de Ambiente — `backend/.env`

```ini
OPENWEATHER_API_KEY=coloque-sua-chave
AQICN_TOKEN=coloque-seu-token
TEMPO_TIMEOUT_S=12
OPENWEATHER_TIMEOUT_S=10
NO2_SEED_FALLBACK=3.0e15
EARTHDATA_USERNAME=seu_usuario
EARTHDATA_PASSWORD=sua_senha
# EARTHDATA_TOKEN=opcional
```

## Variáveis de Ambiente — `frontend/.env`

```ini
VITE_API_BASE=http://127.0.0.1:8000
```

## Como rodar — Backend

```bash
cd backend
python -m venv .venv
# Ative o venv (Windows: .venv\Scripts\activate | Linux/Mac: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

**Endpoints principais**

* `GET /health`
* `GET /forecast?lat={}&lon={}&bbox={minLon,minLat,maxLon,maxLat}&mode=fast&skip_nasa=false&require_nasa=true`
* `GET /states/summary?skip_nasa=true`
* `GET /tempo/latest_overlay.png?bbox=-125,24,-66,50&hours=8`

## Como rodar — Frontend

```bash
cd frontend
npm install
npm run dev
# Abra http://localhost:5173
```

**Dica demo**: acrescente `?demo=1` à URL do frontend para evitar espera pela NASA (usa fallback e timeouts menores).

## Uso rápido

1. Suba backend (8000) e frontend (5173).
2. Na UI: clique num estado → define lat/lon → **Refresh**.
3. Veja **RiskScore (0–100)**, faixa de risco, gráfico por espécie, recomendações.
4. Ative notificações para aviso de **próxima hora crítica (<2h)**.

## Unidades (resumo)

* **NO₂** (TEMPO, coluna vertical): ~mol/m² (usado como semente relativa).
* **O₃ / HCHO**: valores derivados/heurísticos para comparação visual.
* **PM2.5**: µg/m³ (estimado se não houver dado direto).
* **Aerosol Index (AI)**: adimensional (0+), indicador qualitativo.
* **RiskScore**: índice 0–100 (Low/Moderate/High) para leigos.

## Exemplo de resposta `/forecast` (resumo)

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

* **Cannot localize tz-aware Timestamp**: garanta que `datetime_utc` é sempre timezone-aware (UTC). Use `tz_localize("UTC")` apenas para timestamps *naive*; use `tz_convert("UTC")` apenas para *tz-aware*.
* **TEMPO lento/ausente**: ajuste `TEMPO_TIMEOUT_S` e `NO2_SEED_FALLBACK`; para diagnóstico rápido, use `skip_nasa=true`.
* **netCDF4 no Windows**: pode exigir wheels pré-compilados ou instalação de HDF5/NetCDF.

## Scripts/Recursos

* Botões de exportação CSV no frontend.
* `/states/summary` para pintar o mapa com Low/Moderate/High.

## Licença e créditos

* Dados: © NASA / TEMPO Mission; OpenWeather; AQICN.
* Código: MIT (ajuste conforme regras do hackathon).
* Equipe: inclua nomes/contatos.

## Roadmap

* Calibração por espécie (unidades absolutas).
* Malha urbana por cidade.
* Notificações push progressivas.
* Explicabilidade do risco com fatores meteorológicos.
