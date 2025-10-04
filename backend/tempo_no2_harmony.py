# tempo_no2_harmony.py
from pathlib import Path
import numpy as np
import xarray as xr
import matplotlib.pyplot as plt

from harmony import Client, Collection, Request, BBox
from harmony.config import Environment

# =========================
# Configuráveis (rápido)
# =========================
# Pasta de saída
OUT_DIR = Path("./tempo_data")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 1) Modo GRANULE (mais direto para começar)
# Dataset TEMPO NO2 L2 (exemplo do guia oficial) e um granule de exemplo.
COLLECTION_ID = "C2930725014-LARC_CLOUD"
GRANULES = ["TEMPO_NO2_L2_V03_20250406T215103Z_S012G07.nc"]  # troque se quiser

# 2) (Opcional) Modo SUBSET por tempo + BBox
USE_BBOX_AND_TIME = False
TIME_START = "2025-04-06T21:45:00Z"
TIME_END   = "2025-04-06T22:15:00Z"
# BBox dentro da América do Norte (minx, miny, maxx, maxy) = (lonW, latS, lonE, latN)
BBOX = BBox(-106.0, 29.0, -94.0, 36.0)  # Texas

def prompt_auth():
    """Autenticação simples via input (mostra a senha ao digitar)."""
    print("Earthdata Login (enviado somente aos servidores da NASA)")
    username = input("Username: ").strip()
    password = input("Password: ").strip()  # visível ao digitar
    return (username, password)

def submit_and_download(client: Client, request: Request, out_dir: Path):
    """Envia job ao Harmony, aguarda e baixa os arquivos resultantes."""
    job_id = client.submit(request)
    print(f"[Harmony] job_id = {job_id}")
    client.wait_for_processing(job_id, show_progress=True)
    futures = client.download_all(job_id, directory=str(out_dir))
    files = [f.result() for f in futures]
    print(f"[Harmony] arquivos baixados: {files}")
    return files

def load_first_dataset(nc_path: str):
    """
    Abre o NetCDF do TEMPO L2 lendo diretamente o grupo 'product'.
    Faz fallback para engines netCDF4 e h5netcdf.
    Garante latitude/longitude puxando do grupo 'geolocation' se necessário.
    """
    ds = None
    last_err = None

    # 1) Tenta abrir com netCDF4
    try:
        ds = xr.open_dataset(nc_path, engine="netcdf4", group="product")
    except Exception as e:
        last_err = e

    # 2) Se falhar, tenta h5netcdf
    if ds is None:
        try:
            ds = xr.open_dataset(nc_path, engine="h5netcdf", group="product")
        except Exception as e:
            last_err = e

    if ds is None:
        raise RuntimeError(f"Falha ao abrir {nc_path}. Último erro: {last_err}")

    # Escolhe a variável de NO2 mais provável
    for cand in ["vertical_column_troposphere", "vertical_column", "no2", "NO2"]:
        if cand in ds.data_vars:
            vname = cand
            break
    else:
        raise RuntimeError(f"Não encontrei variável de NO2 no grupo 'product'. Variáveis: {list(ds.data_vars)}")

    # Garante latitude/longitude no dataset
    need_geo = ("latitude" not in ds) or ("longitude" not in ds)
    if need_geo:
        geo = None
        try:
            geo = xr.open_dataset(nc_path, engine="netcdf4", group="geolocation")
        except Exception:
            try:
                geo = xr.open_dataset(nc_path, engine="h5netcdf", group="geolocation")
            except Exception:
                geo = None

        if geo is not None and ("latitude" in geo) and ("longitude" in geo):
            ds = ds.assign_coords(latitude=geo["latitude"], longitude=geo["longitude"])
        else:
            raise RuntimeError("Não encontrei latitude/longitude (nem no grupo 'geolocation').")

    return ds, vname

def quick_plot(ds: xr.Dataset, vname: str, title: str = "TEMPO NO₂ (tropospheric column)"):
    """Plot simples (sem Cartopy): pcolormesh sobre lon/lat."""
    lon = ds["longitude"].values
    lat = ds["latitude"].values
    data = ds[vname].values
    data = np.where(np.isfinite(data), data, np.nan)

    plt.figure(figsize=(9, 6))
    mesh = plt.pcolormesh(lon, lat, data, shading="auto")
    plt.colorbar(mesh, label=f"{vname} (unidades conforme arquivo)")
    plt.title(title)
    plt.xlabel("Longitude")
    plt.ylabel("Latitude")
    plt.tight_layout()
    plt.show()

def main():
    # Autenticação (use .netrc se preferir: então remova o prompt e crie Client sem auth)
    auth = prompt_auth()
    client = Client(env=Environment.PROD, auth=auth)
    # client = Client(env=Environment.PROD)  # <- use essa linha se configurar %USERPROFILE%\.netrc

    # Monta a requisição
    if USE_BBOX_AND_TIME:
        req = Request(
            collection=Collection(id=COLLECTION_ID),
            temporal=(TIME_START, TIME_END),
            spatial=BBOX,
        )
    else:
        req = Request(
            collection=Collection(id=COLLECTION_ID),
            granule_name=GRANULES,
        )

    # Executa no Harmony e baixa
    files = submit_and_download(client, req, OUT_DIR)
    if not files:
        raise SystemExit("Nenhum arquivo retornado pelo Harmony.")

    # Abre o primeiro arquivo e plota
    ds, vname = load_first_dataset(files[0])
    print("Variável escolhida:", vname)
    quick_plot(ds, vname, title=f"TEMPO NO₂ • {vname}")

if __name__ == "__main__":
    main()