from fastapi import APIRouter, Query
from database import get_db

router = APIRouter()

@router.get("/keluarga")
def get_keluarga(
    desa: str = Query(None),
    page: int = 1,
    limit: int = 10
):
    db = get_db()
    cursor = db.cursor(dictionary=True)

    offset = (page - 1) * limit

    base_query = """
        SELECT 
            k.id_keluarga,
            k.no_kk,
            k.nama_kepala_keluarga,
            k.alamat,
            kel.nama_kelurahan AS desa
        FROM keluarga k
        JOIN kelurahan kel 
          ON k.no_kel = kel.no_kel
         AND k.no_kec = kel.no_kec
         AND k.no_kab = kel.no_kab
         AND k.no_prop = kel.no_prop
    """

    params = []

    if desa:
        base_query += " WHERE kel.nama_kelurahan = %s"
        params.append(desa)

    # hitung total data sebelum pagination
    count_query = f"SELECT COUNT(*) AS total FROM ({base_query}) AS tbl"
    cursor.execute(count_query, tuple(params))
    total_data = cursor.fetchone()["total"]

    # tambahkan pagination
    base_query += " LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    cursor.execute(base_query, tuple(params))
    result = cursor.fetchall()

    cursor.close()
    db.close()

    return {
        "data": result,
        "total": total_data,
        "page": page,
        "limit": limit,
        "total_pages": (total_data + limit - 1) // limit
    }
