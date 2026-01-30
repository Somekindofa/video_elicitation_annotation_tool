"""
Database migration script to add review fields to annotations table
"""

import sqlite3
import sys
from pathlib import Path

# Get database path
db_path = Path(__file__).parent.parent / "chroma_langchain_db" / "annotations.db"

if not db_path.exists():
    print(f"Database not found at {db_path}")
    sys.exit(1)

print(f"Migrating database: {db_path}")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

try:
    # Check if columns already exist
    cursor.execute("PRAGMA table_info(annotations)")
    columns = [row[1] for row in cursor.fetchall()]

    # Add review_status column
    if "review_status" not in columns:
        print("Adding review_status column...")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_status TEXT DEFAULT 'pending'
        """
        )
        print("✓ review_status added")
    else:
        print("✓ review_status already exists")

    # Add review_results column
    if "review_results" not in columns:
        print("Adding review_results column...")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_results TEXT
        """
        )
        print("✓ review_results added")
    else:
        print("✓ review_results already exists")

    # Add review_timestamp column
    if "review_timestamp" not in columns:
        print("Adding review_timestamp column...")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_timestamp TIMESTAMP
        """
        )
        print("✓ review_timestamp added")
    else:
        print("✓ review_timestamp already exists")

    # Add review_attempts column
    if "review_attempts" not in columns:
        print("Adding review_attempts column...")
        cursor.execute(
            """
            ALTER TABLE annotations 
            ADD COLUMN review_attempts INTEGER DEFAULT 0
        """
        )
        print("✓ review_attempts added")
    else:
        print("✓ review_attempts already exists")

    conn.commit()
    print("\n✅ Migration completed successfully!")

except Exception as e:
    print(f"\n❌ Migration failed: {e}")
    conn.rollback()
    sys.exit(1)
finally:
    conn.close()
