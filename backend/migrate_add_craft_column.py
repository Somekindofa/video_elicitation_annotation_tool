"""
Migration: Add craft column to annotations table

Run this script to add the nullable `craft` TEXT column used to store
the annotation's domain (e.g., 'glassblowing', 'jewelry').
"""

import sqlite3
import sys
from pathlib import Path

# Ensure backend dir is on path to import config
sys.path.insert(0, str(Path(__file__).parent))
from config import ELICITATION_DIR

DB_PATH = ELICITATION_DIR / "annotations.db"

def migrate():
    """Add craft TEXT column to annotations table if missing"""

    if not DB_PATH.exists():
        print(f"❌ Database not found at: {DB_PATH}")
        print("   The database will be created automatically when you start the server.")
        return

    print(f"📂 Database: {DB_PATH}")
    print("🔄 Starting migration: add 'craft' column to annotations...")

    try:
        conn = sqlite3.connect(str(DB_PATH))
        cursor = conn.cursor()

        # Check if column already exists
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [row[1] for row in cursor.fetchall()]

        if "craft" in columns:
            print("✅ Migration already applied - 'craft' column exists")
            return

        # Add craft column
        print("   Adding 'craft' column...")
        cursor.execute("""
            ALTER TABLE annotations
            ADD COLUMN craft TEXT
        """)
        conn.commit()

        # Verify
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [row[1] for row in cursor.fetchall()]
        if "craft" in columns:
            print("✅ 'craft' column added successfully")
        else:
            print("❌ Failed to add 'craft' column")
            sys.exit(1)

        conn.close()

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    print("=" * 70)
    print("DATABASE MIGRATION: Add craft column to annotations")
    print("=" * 70)
    print()

    migrate()

    print()
    print("=" * 70)
    print("Next steps:")
    print("1. Start the server: start.bat")
    print("2. Confirm the server starts without errors and annotations accept 'craft'")
    print("=" * 70)
