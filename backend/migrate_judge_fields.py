"""
Migration script to add judge fields to annotations table.
Run: python backend/migrate_judge_fields.py
"""

import sqlite3
import sys
from pathlib import Path
from config import CHROMA_DIR

# Database path (must match config.DATABASE_URL)
DB_PATH = CHROMA_DIR / "annotations.db"


def migrate():
    """Add judge_status and judge_decision columns to annotations table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Check if columns already exist
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [col[1] for col in cursor.fetchall()]

        if "judge_status" not in columns:
            print("Adding judge_status column...")
            cursor.execute(
                """
                ALTER TABLE annotations 
                ADD COLUMN judge_status TEXT DEFAULT 'pending'
            """
            )
            print("✓ judge_status column added")
        else:
            print("✓ judge_status column already exists")

        if "judge_decision" not in columns:
            print("Adding judge_decision column...")
            cursor.execute(
                """
                ALTER TABLE annotations 
                ADD COLUMN judge_decision TEXT
            """
            )
            print("✓ judge_decision column added")
        else:
            print("✓ judge_decision column already exists")

        conn.commit()
        conn.close()

        print("\n✓ Migration completed successfully!")
        return True

    except sqlite3.OperationalError as e:
        print(f"✗ Migration failed: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error: {e}")
        return False


if __name__ == "__main__":
    success = migrate()
    sys.exit(0 if success else 1)
