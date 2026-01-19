import joblib
from datetime import date
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
import numpy as np
import re
from database import get_db
import pandas as pd

# =========================
# HELPER: PARSE PERIODE
# =========================
BULAN_MAP = {
    "JAN":1, "FEB":2, "MAR":3, "APR":4,
    "MEI":5, "MAY":5,
    "JUN":6, "JUL":7, "AGS":8, "AGT":8, "AGU":8, "AUG":8,
    "SEP":9, "OKT":10, "OCT":10,
    "NOV":11, "DES":12, "DEC":12,
}

def parse_period(text):
    try:
        if pd.isna(text): return (0, 0)
        t = str(text).upper()
        bulan_tokens = re.findall(r"(JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGS|AGT|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC)", t)
        tahun_match = re.search(r"(20\d{2})", t)
        if not tahun_match or not bulan_tokens: return (0, 0)
        year = int(tahun_match.group(1))
        last_month_token = bulan_tokens[-1]
        month = BULAN_MAP.get(last_month_token, 0)
        return (year, month)
    except:
        return (0, 0)

# =========================
# HELPER: PENALTY
# =========================
def months_since(year, month, now_year=None, now_month=None):
    if now_year is None: now_year = date.today().year
    if now_month is None: now_month = date.today().month
    if year == 0 or month == 0: return 9999
    delta = (now_year - year) * 12 + (now_month - month)
    return max(delta, 0)

def penalty_from_months(months: int) -> int:
    if months >= 120: return 0
    if months < 6: return 40
    elif months < 12: return 20
    elif months < 24: return 10
    else: return 0

def train_kmeans():
    conn = get_db()
    cursor = None
    try:
        # 1. LOAD DATA
        query = """
        SELECT 
            k.id_keluarga,
            kel.nama_kelurahan AS desa,
            COALESCE((SELECT AVG(CAST(rd.desil AS DECIMAL(10,2))) 
                      FROM riwayat_desil rd WHERE rd.id_keluarga = k.id_keluarga), 0) AS rata_rata_desil,
            CAST(k.peringkat_nasional AS UNSIGNED) AS peringkat_nasional,
            (SELECT COUNT(*) FROM anggota_keluarga a WHERE a.id_keluarga = k.id_keluarga) AS jumlah_tanggungan,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (3,7,9,11,13)) AS aset_tinggi,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (2,4,8,14)) AS aset_menengah,
            (SELECT SUM(jumlah) FROM aset_keluarga WHERE id_keluarga = k.id_keluarga AND id_jenis_aset IN (1,5,6,12,10)) AS aset_bawah,
            (SELECT nama_periode FROM riwayat_bpnt bp WHERE bp.id_keluarga = k.id_keluarga ORDER BY id DESC LIMIT 1) AS periode_terakhir_bpnt,
            (SELECT nama_periode FROM riwayat_pkh pkh WHERE pkh.id_keluarga = k.id_keluarga ORDER BY id DESC LIMIT 1) AS periode_terakhir_pkh,
            k.status_nonaktif
        FROM keluarga k
        LEFT JOIN kelurahan kel
            ON kel.no_kel = k.no_kel
            AND kel.no_kec = k.no_kec
            AND kel.no_kab = k.no_kab
            AND kel.no_prop = k.no_prop;
        """
        df = pd.read_sql(query, conn)
        total_awal = len(df)
        
        # 2. PREPROCESSING & TYPECASTING
        cols_num = ["rata_rata_desil", "peringkat_nasional", "jumlah_tanggungan", 
                    "aset_tinggi", "aset_menengah", "aset_bawah", "status_nonaktif"]
        
        for col in cols_num:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        # ============================================================
        # 3. FILTERING KETAT (FILTER REQUEST USER)
        # ============================================================
        
        # A. Filter Status Aktif (Status = 0)
        df_aktif = df[df["status_nonaktif"] == 0].copy()

        # B. Filter Wajib Ada Nilai (Desil > 0 DAN Peringkat > 0)
        #    Data dengan nilai 0 akan DIBUANG.
        df_valid = df_aktif[
            (df_aktif["rata_rata_desil"] > 0) & 
            (df_aktif["peringkat_nasional"] > 0)
        ].copy()
        
        # Cek jika data habis setelah difilter
        if len(df_valid) == 0:
            return {
                "status": "error",
                "message": "Tidak ada data valid untuk diproses. Pastikan data memiliki Desil > 0 dan Peringkat Nasional > 0.",
                "diagnostik": {
                    "total_data_awal": total_awal,
                    "lolos_status_aktif": len(df_aktif),
                    "lolos_validasi_nilai": 0
                }
            }

        # Gunakan df_valid sebagai df utama
        df = df_valid.reset_index(drop=True)

        # 4. PROSES FEATURING & KMEANS
        parsed_bpnt = df["periode_terakhir_bpnt"].apply(parse_period).tolist()
        parsed_pkh  = df["periode_terakhir_pkh"].apply(parse_period).tolist()

        df["bpnt_year"], df["bpnt_month"] = zip(*parsed_bpnt)
        df["pkh_year"],  df["pkh_month"]  = zip(*parsed_pkh)

        fitur_kerentanan = [
            "rata_rata_desil", "peringkat_nasional", "jumlah_tanggungan",
            "aset_tinggi", "aset_menengah", "aset_bawah"
        ]
        
        X_A = df[fitur_kerentanan].copy()
        scaler_A = MinMaxScaler()
        X_A_scaled = scaler_A.fit_transform(X_A)

        # Handle jika data < 3 baris
        n_clusters = 3 if len(df) >= 3 else 1
        kmeans_A = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        df["cluster_kerentanan"] = kmeans_A.fit_predict(X_A_scaled)

        # Mapping Label
        cluster_means = df.groupby("cluster_kerentanan")["rata_rata_desil"].mean()
        order = cluster_means.sort_values().index.tolist()
        
        labels_sorted = ["Sangat Rentan", "Rentan", "Tidak Rentan"]
        cluster_to_label = {}
        for i, cluster_id in enumerate(order):
            if i < len(labels_sorted):
                cluster_to_label[cluster_id] = labels_sorted[i]
            else:
                cluster_to_label[cluster_id] = "Tidak Rentan"

        df["kategori_kerentanan"] = df["cluster_kerentanan"].map(cluster_to_label)

        # Hitung Penalti & Skor
        df["bpnt_months_ago"] = df.apply(lambda r: months_since(r["bpnt_year"], r["bpnt_month"]), axis=1)
        df["pkh_months_ago"]  = df.apply(lambda r: months_since(r["pkh_year"], r["pkh_month"]), axis=1)
        df["penalti_bpnt"] = df["bpnt_months_ago"].apply(penalty_from_months)
        df["penalti_pkh"]  = df["pkh_months_ago"].apply(penalty_from_months)
        df["penalti_total"] = df["penalti_bpnt"] + df["penalti_pkh"]

        skor_map = {"Sangat Rentan": 90, "Rentan": 60, "Tidak Rentan": 30}
        df["skor_kerentanan"] = df["kategori_kerentanan"].map(skor_map).fillna(30)
        df["skor_akhir"] = df["skor_kerentanan"] - df["penalti_total"]

        # Save Model Artifacts
        artifacts = {
            "scaler_kerentanan": scaler_A,
            "kmeans_kerentanan": kmeans_A,
            "cluster_to_label": cluster_to_label,
            "fitur_kerentanan": fitur_kerentanan,
        }
        joblib.dump(artifacts, "model_kerentanan_artifacts.pkl")

        # 5. INSERT KE DATABASE (BATCHING + UUID FIX)
        cursor = conn.cursor()
        
        # Bersihkan tabel dulu
        cursor.execute("DELETE FROM keluarga_kerentanan")
        
        insert_sql = """
            INSERT INTO keluarga_kerentanan
            (id_keluarga, cluster_kerentanan, kategori_kerentanan, skor_kerentanan, skor_akhir, desa, rata_rata_desil, peringkat_nasional, jumlah_tanggungan, aset_tinggi, aset_menengah, aset_bawah, periode_terakhir_bpnt, periode_terakhir_pkh, penalti_total)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """
        
        data_to_insert = []
        for _, row in df.iterrows():
            val = (
                str(row["id_keluarga"]),  # FIX: UUID string
                int(row["cluster_kerentanan"]),               
                str(row["kategori_kerentanan"]),
                int(row["skor_kerentanan"]),
                int(row["skor_akhir"]),
                str(row["desa"]) if row["desa"] else None,
                float(row["rata_rata_desil"]),                
                int(row["peringkat_nasional"]), 
                int(row["jumlah_tanggungan"]),
                float(row["aset_tinggi"]),
                float(row["aset_menengah"]),
                float(row["aset_bawah"]),
                str(row["periode_terakhir_bpnt"]) if row["periode_terakhir_bpnt"] else None,
                str(row["periode_terakhir_pkh"]) if row["periode_terakhir_pkh"] else None,
                int(row["penalti_total"])
            )
            data_to_insert.append(val)

        # Batch Insert
        batch_size = 1000 
        total_inserted = 0

        if data_to_insert:
            print(f"Mulai insert {len(data_to_insert)} data valid...")
            for i in range(0, len(data_to_insert), batch_size):
                batch = data_to_insert[i : i + batch_size]
                try:
                    cursor.executemany(insert_sql, batch)
                    conn.commit()
                    total_inserted += len(batch)
                    print(f" -> Batch {i} OK.")
                except Exception as e:
                    print(f"Error Batch {i}: {e}")
            
            msg = f"Sukses. {total_inserted} data disimpan (Data Desil/Peringkat 0 dibuang)."
        else:
            msg = "Proses selesai, namun tidak ada data valid untuk disimpan."

        return {
            "status": "success",
            "rows_processed": total_inserted,
            "info": msg,
            "diagnostik": {
                "total_awal": total_awal,
                "total_valid_disimpan": total_inserted
            }
        }

    except Exception as e:
        print("ERROR:", str(e))
        return {"status": "error", "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn and conn.is_connected(): conn.close()