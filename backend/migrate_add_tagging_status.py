"""
Migration script to add tagging_status column to annotations table
"""
import sqlite3
import os
from pathlib import Path

# Get the database path
DB_DIR = Path(__file__).parent.parent / "elicitations_db"
DB_PATH = DB_DIR / "annotations.db"

def migrate():
    print(f"Connecting to database: {DB_PATH}")
    
    if not DB_PATH.exists():
        print("Error: Database file not found!")
        return
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [col[1] for col in cursor.fetchall()]
        
        if 'tagging_status' in columns:
            print("Column 'tagging_status' already exists. No migration needed.")
        else:
            print("Adding 'tagging_status' column to annotations table...")
            cursor.execute("""
                ALTER TABLE annotations 
                ADD COLUMN tagging_status TEXT DEFAULT 'pending'
            """)
            conn.commit()
            print("✓ Migration completed successfully!")
        
        # Verify the column was added
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"\nCurrent annotations table columns: {', '.join(columns)}")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
