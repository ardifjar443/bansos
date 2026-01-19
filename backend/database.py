import mysql.connector

def get_db():
    return mysql.connector.connect(
        host="localhost",
        user="root",
        password="",
        database="psd",
        port=3306,
        autocommit=False,
        connection_timeout=60,
        buffered=True
    )
