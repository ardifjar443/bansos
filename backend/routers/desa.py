from fastapi import APIRouter
from database import get_db

router = APIRouter()

@router.get("/desa")
def get_desa():
    db = get_db()
    cursor = db.cursor(dictionary=True)

    query = """
        SELECT nama_kelurahan AS nama
        FROM kelurahan
        ORDER BY nama_kelurahan ASC
    """

    cursor.execute(query)
    result = cursor.fetchall()

    cursor.close()
    db.close()

    return result
