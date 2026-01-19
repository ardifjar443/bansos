# utils.py
import re
import pandas as pd
from datetime import date

# Konstanta Peta Bulan
BULAN_MAP = {
    "JAN":1, "FEB":2, "MAR":3, "APR":4, "MEI":5, "MAY":5, "JUN":6, 
    "JUL":7, "AGS":8, "AGT":8, "AGU":8, "AUG":8, "SEP":9, "OKT":10, 
    "OCT":10, "NOV":11, "DES":12, "DEC":12,
}

def parse_period(text):
    """Ambil bulan TERAKHIR dan tahun dari teks."""
    try:
        if pd.isna(text): return (0, 0)
        t = str(text).upper()
        bulan_tokens = re.findall(r"(JAN|FEB|MAR|APR|MEI|MAY|JUN|JUL|AGS|AGT|AGU|AUG|SEP|OKT|OCT|NOV|DES|DEC)", t)
        tahun_match = re.search(r"(20\d{2})", t)

        if not tahun_match or not bulan_tokens: return (0, 0)

        year = int(tahun_match.group(1))
        month = BULAN_MAP.get(bulan_tokens[-1], 0)
        return (year, month)
    except:
        return (0, 0)

def months_since(year, month, now_year=None, now_month=None):
    """Hitung selisih bulan dari sekarang."""
    if now_year is None: now_year = date.today().year
    if now_month is None: now_month = date.today().month

    if year == 0 or month == 0: return 9999 
    
    delta = (now_year - year) * 12 + (now_month - month)
    return max(delta, 0)

def penalty_from_months(months: int) -> int:
    """Logika bisnis penalti."""
    if months >= 120: return 0
    if months < 6: return 40
    elif months < 12: return 20
    elif months < 24: return 10
    else: return 0