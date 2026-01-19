from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd

import mysql.connector


app = FastAPI()

# =========================
# CORS
# =========================
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)



# =========================
# ENDPOINT: TRAIN K-MEANS
# =========================
@app.post("/train-kmeans")
def train_kmeans():
    try:
        # Proses training K-Means dilakukan di sini
        # Misalnya, memanggil fungsi dari modul modelling.py
        from kmeans import train_kmeans
        train_kmeans()
        return {"message": "Model K-Means berhasil dilatih dan disimpan."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
# =========================
# LIST DATA
# =========================
from fastapi import Query
from typing import Optional

@app.get("/kerentanan")
def list_kerentanan_endpoint(
    desa: Optional[str] = None,
    page: int = Query(1, ge=1),      # Default halaman 1, minimal 1
    limit: int = Query(10, le=100),  # Default 10 data, maksimal 100 (opsional)
    search: Optional[str] = None
):
    # Import fungsi logika backend yang sudah diperbarui tadi
    from getdata import list_kerentanan 
    
    # Panggil dengan semua parameter
    return list_kerentanan(desa, page, limit, search)

@app.get("/kerentanan/desa")
def list_desa():
    from getdata import list_desa
    return list_desa()

@app.get("/dashboard-stats")
def get_dashboard_stats(desa: str = "SEMUA"):
    from getdata import get_dashboard_stats
    return get_dashboard_stats(desa)

@app.get("/dashboard-stats-semua-desa")
def get_rekap_per_desa():
    from getdata import get_rekap_per_desa
    return get_rekap_per_desa()