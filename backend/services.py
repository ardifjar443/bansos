# services.py
import pandas as pd
import joblib
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from database import get_db
from utils import parse_period, months_since, penalty_from_months

def fetch_training_data():
    conn = get_db()
    query = """
        SELECT 
            k.id_keluarga,
            kel.nama_kelurahan AS desa,
            COALESCE((SELECT AVG(CAST(rd.desil AS DECIMAL(10,2))) FROM riwayat_desil rd WHERE rd.id_keluarga = k.id_keluarga), 0) AS rata_rata_desil,
            CAST(k.peringkat_nasional AS UNSIGNED) AS peringkat_nasional,
            (SELECT COUNT(*) FROM anggota_keluarga a WHERE a.id_keluarga = k.id_keluarga) AS jumlah_tanggungan,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (3,7,9,11,13)) AS aset_tinggi,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (2,4,8,14)) AS aset_menengah,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (1,5,6,12,10)) AS aset_bawah,
            (SELECT nama_periode FROM riwayat_bpnt bp WHERE bp.id_keluarga = k.id_keluarga ORDER BY id DESC LIMIT 1) AS periode_terakhir_bpnt,
            (SELECT nama_periode FROM riwayat_pkh pkh WHERE pkh.id_keluarga = k.id_keluarga ORDER BY id DESC LIMIT 1) AS periode_terakhir_pkh,
            k.status_nonaktif
        FROM keluarga k
        LEFT JOIN kelurahan kel ON kel.no_kel = k.no_kel AND kel.no_kec = k.no_kec AND kel.no_kab = k.no_kab AND kel.no_prop = k.no_prop;
    """
    df = pd.read_sql(query, conn)
    conn.close()
    return df

def save_training_results(df):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM keluarga_kerentanan")
    
    insert_sql = """
        INSERT INTO keluarga_kerentanan
        (id_keluarga, cluster_kerentanan, kategori_kerentanan, skor_kerentanan, skor_akhir, desa, rata_rata_desil, peringkat_nasional, jumlah_tanggungan, aset_tinggi, aset_menengah, aset_bawah, periode_terakhir_bpnt, periode_terakhir_pkh, penalti_total)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    data = [
        (row["id_keluarga"], int(row["cluster_kerentanan"]), row["kategori_kerentanan"],
         int(row["skor_kerentanan"]), int(row["skor_akhir"]), row["desa"], row["rata_rata_desil"],
         row["peringkat_nasional"], row["jumlah_tanggungan"], row["aset_tinggi"], row["aset_menengah"],
         row["aset_bawah"], row["periode_terakhir_bpnt"], row["periode_terakhir_pkh"], int(row["penalti_total"]))
        for _, row in df.iterrows()
    ]
    cursor.executemany(insert_sql, data)
    conn.commit()
    cursor.close()
    conn.close()

def execute_clustering_pipeline():
    # 1. Load Data
    df = fetch_training_data()
    total_awal = len(df)
    
    # 2. Type Casting & Filtering
    cols_num = ["rata_rata_desil", "peringkat_nasional", "jumlah_tanggungan", "aset_tinggi", "aset_menengah", "aset_bawah", "status_nonaktif"]
    for col in cols_num:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    df_aktif = df[df["status_nonaktif"].isna() | (df["status_nonaktif"] == 0)].copy()
    
    df_valid = df_aktif[(df_aktif["rata_rata_desil"] > 0) & (df_aktif["peringkat_nasional"] > 0)].copy()
    
    if len(df_valid) == 0:
        return {"status": "error", "message": "Data kosong/tidak valid setelah filter."}

    df = df_valid.reset_index(drop=True)
    for col in ["aset_tinggi", "aset_menengah", "aset_bawah", "jumlah_tanggungan"]:
        df[col] = df[col].fillna(0)

    # 3. Parsing Tanggal
    parsed_bpnt = df["periode_terakhir_bpnt"].apply(parse_period).tolist()
    parsed_pkh  = df["periode_terakhir_pkh"].apply(parse_period).tolist()
    df["bpnt_year"], df["bpnt_month"] = zip(*parsed_bpnt)
    df["pkh_year"],  df["pkh_month"]  = zip(*parsed_pkh)

    # 4. Training KMeans
    fitur = ["rata_rata_desil", "peringkat_nasional", "jumlah_tanggungan", "aset_tinggi", "aset_menengah", "aset_bawah"]
    scaler = MinMaxScaler()
    X_scaled = scaler.fit_transform(df[fitur])
    
    kmeans = KMeans(n_clusters=3, random_state=42, n_init=20)
    df["cluster_kerentanan"] = kmeans.fit_predict(X_scaled)

    # 5. Labeling & Scoring
    cluster_means = df.groupby("cluster_kerentanan")["rata_rata_desil"].mean()
    order = cluster_means.sort_values().index.tolist()
    cluster_to_label = {order[0]: "Sangat Rentan", order[1]: "Rentan", order[2]: "Tidak Rentan"}
    df["kategori_kerentanan"] = df["cluster_kerentanan"].map(cluster_to_label)

    df["penalti_total"] = (
        df.apply(lambda r: months_since(r["bpnt_year"], r["bpnt_month"]), axis=1).apply(penalty_from_months) +
        df.apply(lambda r: months_since(r["pkh_year"], r["pkh_month"]), axis=1).apply(penalty_from_months)
    )

    skor_map = {"Sangat Rentan": 90, "Rentan": 60, "Tidak Rentan": 30}
    df["skor_akhir"] = df["kategori_kerentanan"].map(skor_map) - df["penalti_total"]

    # 6. Save Artifacts & DB
    joblib.dump({"scaler": scaler, "kmeans": kmeans, "labels": cluster_to_label}, "model_kerentanan_artifacts.pkl")
    save_training_results(df)

    metrics = {}
    if len(df) > 3:
        metrics = {"SSE": float(kmeans.inertia_), "Silhouette": float(silhouette_score(X_scaled, df["cluster_kerentanan"]))}

    return {"status": "success", "rows": len(df), "metrics": metrics}

def get_kerentanan_list(desa=None):
    conn = get_db()
    base = "SELECT * FROM keluarga_kerentanan"
    if desa:
        df = pd.read_sql(base + " WHERE desa=%s ORDER BY skor_akhir DESC", conn, params=[desa])
    else:
        df = pd.read_sql(base + " ORDER BY skor_akhir DESC", conn)
    conn.close()
    return df.to_dict(orient="records")

def list_desa():
    conn = get_db()
    df = pd.read_sql("SELECT DISTINCT desa FROM keluarga WHERE desa IS NOT NULL", conn)
    conn.close()
    return df["desa"].tolist()