"""
Database migration script to add extended transcript fields to existing database
Run this script if you have an existing database that needs the new columns
"""
import sqlite3
import sys
from pathlib import Path

# Get the database path
DB_PATH = Path(__file__).parent.parent / "data" / "annotations.db"

def migrate_database():
    """Add new columns to annotations table"""
    print(f"Migrating database at: {DB_PATH}")
    
    if not DB_PATH.exists():
        print("Database does not exist. It will be created when you start the server.")
        return
    
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()
    
    try:
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(annotations)")
        columns = [row[1] for row in cursor.fetchall()]
        
        migrations_needed = []
        
        if 'extended_transcript' not in columns:
            migrations_needed.append(
                "ALTER TABLE annotations ADD COLUMN extended_transcript TEXT"
            )
        
        if 'extended_transcript_status' not in columns:
            migrations_needed.append(
                "ALTER TABLE annotations ADD COLUMN extended_transcript_status VARCHAR DEFAULT 'pending'"
            )
        
        if 'feedback' not in columns:
            migrations_needed.append(
                "ALTER TABLE annotations ADD COLUMN feedback INTEGER"
            )
        
        if 'feedback_choices' not in columns:
            migrations_needed.append(
                "ALTER TABLE annotations ADD COLUMN feedback_choices VARCHAR"
            )
        
        if not migrations_needed:
            print("✓ Database is already up to date!")
            return
        
        # Execute migrations
        print(f"\nApplying {len(migrations_needed)} migration(s)...")
        for i, migration in enumerate(migrations_needed, 1):
            print(f"  {i}. {migration}")
            cursor.execute(migration)
        
        conn.commit()
        print("\n✓ Migration completed successfully!")
        print("\nNew columns added:")
        print("  - extended_transcript (TEXT)")
        print("  - extended_transcript_status (VARCHAR)")
        print("  - feedback (INTEGER)")
        print("  - feedback_choices (VARCHAR)")
        
    except sqlite3.Error as e:
        print(f"✗ Error during migration: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("Extended Transcript Feature - Database Migration")
    print("=" * 60)
    migrate_database()
    print("\nYou can now start the server.")
    print("=" * 60)
