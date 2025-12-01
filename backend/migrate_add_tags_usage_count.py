"""
Migration script to add usage_count column to tags table
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
        # Check if tags table exists
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='tags'")
        if not cursor.fetchone():
            print("Tags table doesn't exist yet. Creating it...")
            cursor.execute("""
                CREATE TABLE tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    category TEXT NOT NULL,
                    usage_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX ix_tags_name ON tags (name)")
            conn.commit()
            print("✓ Tags table created successfully!")
        else:
            # Check if usage_count column exists
            cursor.execute("PRAGMA table_info(tags)")
            columns = [col[1] for col in cursor.fetchall()]
            
            if 'usage_count' in columns:
                print("Column 'usage_count' already exists. No migration needed.")
            else:
                print("Adding 'usage_count' column to tags table...")
                cursor.execute("""
                    ALTER TABLE tags 
                    ADD COLUMN usage_count INTEGER DEFAULT 0
                """)
                conn.commit()
                print("✓ Migration completed successfully!")
        
        # Verify the table structure
        cursor.execute("PRAGMA table_info(tags)")
        columns = [col[1] for col in cursor.fetchall()]
        print(f"\nCurrent tags table columns: {', '.join(columns)}")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
