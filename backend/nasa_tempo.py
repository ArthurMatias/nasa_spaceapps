from pathlib import Path
import numpy as np
import xarray as xr
from harmony import Client, Collection, Request, BBox
from harmony.config import Environment

# coleção TEMPO NO2 L2 (exemplo do guia)
COLLECTION_ID = "C2930725014-LARC_CLOUD"

def fetch_tempo_no2_granule(out_dir: Path, granules: list[str]):
    out_dir.mkdir(parents=True, exist_ok=True)
    client = Client(env=Environment.PROD)  # usa .netrc; se quiser prompt, passe auth aqui
    req = Request(collection=Collection(id=COLLECTION_ID), granule_name=granules)
    job_id = client.submit(req)
    client.wait_for_processing(job_id, show_progress=False)
    futures = client.download_all(job_id, directory=str(out_dir))
    return [f.result() for f in futures]

def open_no2_dataset(nc_path: str):
    ds = None
    for eng in ["netcdf4", "h5netcdf"]:
        try:
            ds = xr.open_dataset(nc_path, engine=eng, group="product")
            break
        except Exception:
            ds = None
    if ds is None:
        raise RuntimeError("Não consegui abrir o grupo 'product'.")

    for cand in ["vertical_column_troposphere","vertical_column","no2","NO2"]:
        if cand in ds.data_vars:
            vname = cand
            break
    else:
        raise RuntimeError(f"Nada de NO2 em {list(ds.data_vars)}")
    # latitude/longitude
    if ("latitude" not in ds) or ("longitude" not in ds):
        geo = None
        for eng in ["netcdf4","h5netcdf"]:
            try:
                geo = xr.open_dataset(nc_path, engine=eng, group="geolocation")
                break
            except Exception:
                geo = None
        if geo is None or ("latitude" not in geo) or ("longitude" not in geo):
            raise RuntimeError("Sem latitude/longitude no arquivo.")
        ds = ds.assign_coords(latitude=geo["latitude"], longitude=geo["longitude"])
    return ds, vname

def compute_no2_seed(nc_path: str) -> float:
    ds, vname = open_no2_dataset(nc_path)
    arr = ds[vname].values
    return float(np.nanmean(arr))
