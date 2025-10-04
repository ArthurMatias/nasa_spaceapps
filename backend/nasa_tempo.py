from __future__ import annotations
from pathlib import Path
from typing import Tuple, List, Optional
from datetime import datetime, timezone
import os

import numpy as np
import xarray as xr
from dotenv import load_dotenv
from harmony import Client, Collection, Request, BBox
from harmony.config import Environment

COLL_L2_NRT_NO2 = "C3685668972-LARC_CLOUD"
COLL_L3_NRT_NO2 = "C3685668637-LARC_CLOUD"
COLL_L2_STD_NO2 = "C2930725014-LARC_CLOUD"

def _client(auth: Optional[tuple[str, str]] = None) -> Client:
    if auth:
        return Client(env=Environment.PROD, auth=auth)
    load_dotenv()
    user = os.getenv("EDL_USERNAME")
    pwd = os.getenv("EDL_PASSWORD")
    if user and pwd:
        return Client(env=Environment.PROD, auth=(user, pwd))
    return Client(env=Environment.PROD)

def _to_dt_utc(s: str) -> datetime:
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    return datetime.fromisoformat(s).astimezone(timezone.utc)

def fetch_tempo_no2_by_time_bbox(
    out_dir: Path,
    start_iso: str,
    end_iso: str,
    bbox: Tuple[float, float, float, float],
    prefer_l3: bool = True,
    auth: Optional[tuple[str, str]] = None,
) -> List[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    cl = _client(auth)
    t_start = _to_dt_utc(start_iso)
    t_end = _to_dt_utc(end_iso)
    temporal = {"start": t_start, "end": t_end}
    coll_id = COLL_L3_NRT_NO2 if prefer_l3 else COLL_L2_NRT_NO2
    req = Request(collection=Collection(id=coll_id), temporal=temporal, spatial=BBox(*bbox))
    job_id = cl.submit(req)
    cl.wait_for_processing(job_id, show_progress=False)
    futures = cl.download_all(job_id, directory=str(out_dir))
    files = [f.result() for f in futures]
    if not files and prefer_l3:
        req2 = Request(collection=Collection(id=COLL_L2_STD_NO2), temporal=temporal, spatial=BBox(*bbox))
        job2 = cl.submit(req2)
        cl.wait_for_processing(job2, show_progress=False)
        futures2 = cl.download_all(job2, directory=str(out_dir))
        files = [f.result() for f in futures2]
    return files

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
    for cand in ["vertical_column_troposphere", "vertical_column", "no2", "NO2"]:
        if cand in ds.data_vars:
            vname = cand
            break
    else:
        raise RuntimeError(f"Nada de NO2 em {list(ds.data_vars)}")
    if ("latitude" not in ds) or ("longitude" not in ds):
        geo = None
        for eng in ["netcdf4", "h5netcdf"]:
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
