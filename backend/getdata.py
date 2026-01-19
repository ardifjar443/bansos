from database import get_db
import pandas as pd

import math

def list_kerentanan(desa: str = None, page: int = 1, limit: int = 10, search: str = None):
    conn = get_db()
    # Pastikan cursor menggunakan dictionary=True agar hasil query berupa JSON object
    cursor = conn.cursor(dictionary=True) 
    
    offset = (page - 1) * limit
    
    # PERBAIKAN 1: Gunakan LEFT JOIN agar data tetap muncul meski tidak ada match di tabel keluarga
    base_query = """
        FROM keluarga_kerentanan kk
        LEFT JOIN keluarga k ON kk.id_keluarga = k.id_keluarga
    """
    
    conditions = []
    params = []
    
    # 1. Filter Desa
    if desa and desa != "SEMUA":
        conditions.append("kk.desa = %s")
        params.append(desa)
        
    # 2. Filter Search
    if search:
        search_term = f"%{search}%"
        # Perbaiki logika pencarian agar lebih aman
        conditions.append("(kk.id_keluarga LIKE %s OR k.nama_kepala_keluarga LIKE %s OR kk.desa LIKE %s)")
        params.extend([search_term, search_term, search_term])
    
    where_clause = ""
    if conditions:
        where_clause = " WHERE " + " AND ".join(conditions)

    # --- QUERY 1: Hitung Total (Pagination) ---
    count_sql = f"SELECT COUNT(*) as total {base_query} {where_clause}"
    
    # Debugging: Print jika perlu
    # print(f"Count SQL: {count_sql}, Params: {params}")
    
    cursor.execute(count_sql, params)
    total_row = cursor.fetchone()
    total_items = total_row['total'] if total_row else 0
    
    total_pages = math.ceil(total_items / limit) if total_items > 0 else 1

    # --- QUERY 2: Ambil Data ---
    # PERBAIKAN 2: Pisahkan parameter query data agar tidak merusak list params asli
    data_params = params + [limit, offset]

    data_sql = f"""
        SELECT 
            kk.*, 
            IFNULL(k.no_kk, '-') as no_kk, 
            IFNULL(k.nama_kepala_keluarga, 'Data Tidak Lengkap') as nama_kepala_keluarga, 
            IFNULL(k.alamat, '-') as alamat
        {base_query} 
        {where_clause}
        ORDER BY kk.skor_akhir DESC
        LIMIT %s OFFSET %s
    """
    
    # Debugging: Cek query final di console server
    print(f"Data SQL: {data_sql}")
    print(f"Data Params: {data_params}")

    cursor.execute(data_sql, data_params)
    result = cursor.fetchall()
    
    conn.close()
    
    return {
        "data": result,
        "pagination": {
            "page": page,
            "limit": limit,
            "total_items": total_items,
            "total_pages": total_pages
        }
    }
def list_desa():
    conn = get_db()
    df = pd.read_sql("SELECT DISTINCT desa FROM keluarga_kerentanan WHERE desa IS NOT NULL", conn)
    conn.close()
    return df["desa"].tolist()

def get_dashboard_stats(desa: str = "SEMUA"):
    conn = get_db()
    cursor = conn.cursor(dictionary=True) # dictionary=True agar hasil return berupa dict, bukan tuple

    sql = """
        SELECT 
            COUNT(id_keluarga) as total,
            SUM(CASE WHEN kategori_kerentanan = 'Sangat Rentan' THEN 1 ELSE 0 END) as sangat_rentan,
            SUM(CASE WHEN kategori_kerentanan = 'Rentan' THEN 1 ELSE 0 END) as rentan,
            SUM(CASE WHEN kategori_kerentanan = 'Tidak Rentan' THEN 1 ELSE 0 END) as tidak_rentan
        FROM keluarga_kerentanan
    """
        
    params = []

        # Jika filter desa aktif (bukan SEMUA), tambahkan WHERE clause
    if desa != "SEMUA":
        sql += " WHERE desa = %s"
        params.append(desa)

    # Eksekusi Query
    cursor.execute(sql, params)
    result = cursor.fetchone()

    # Jika tabel kosong, SUM akan mengembalikan None, jadi kita konversi ke 0
    # Decimal dari MySQL juga perlu dikonversi ke int agar valid JSON
    stats = {
        "total_keluarga": result['total'] if result and result['total'] else 0,
        "sangat_rentan": int(result['sangat_rentan']) if result and result['sangat_rentan'] else 0,
        "rentan": int(result['rentan']) if result and result['rentan'] else 0,
        "tidak_rentan": int(result['tidak_rentan']) if result and result['tidak_rentan'] else 0,
        "filter_desa": desa
    }

    return stats


def get_rekap_per_desa():
    conn = get_db()
    cursor = conn.cursor(dictionary=True)

    sql = """
        SELECT 
            desa,
            SUM(CASE WHEN kategori_kerentanan = 'Sangat Rentan' THEN 1 ELSE 0 END) as sangat_rentan,
            SUM(CASE WHEN kategori_kerentanan = 'Rentan' THEN 1 ELSE 0 END) as rentan,
            SUM(CASE WHEN kategori_kerentanan = 'Tidak Rentan' THEN 1 ELSE 0 END) as tidak_rentan,
            COUNT(id_keluarga) as total_kk
        FROM keluarga_kerentanan
        GROUP BY desa
        ORDER BY desa ASC
    """
    
    cursor.execute(sql)
    results = cursor.fetchall()

    data_per_desa = {}

    for row in results:
        sangat = int(row['sangat_rentan'] or 0)
        rentan = int(row['rentan'] or 0)
        tidak = int(row['tidak_rentan'] or 0)
        total = int(row['total_kk'] or 0)

        nama_desa = row['desa'] or "Tanpa Nama Desa"

        # =========================
        # HITUNG INDEKS DESA
        # =========================
        if total > 0:
            indeks_desa = (
                (sangat * 1) +
                (rentan * 2) +
                (tidak * 3)
            ) / (total * 3)
        else:
            indeks_desa = 0

        data_per_desa[nama_desa] = {
            "sangat_rentan": sangat,
            "rentan": rentan,
            "tidak_rentan": tidak,
            "total_kk": total,

            # ➕ NILAI INDEKS DESA
            "indeks_desa": round(indeks_desa, 4)
        }

    cursor.close()
    conn.close()

    return data_per_desa

    
    